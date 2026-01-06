import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { google } from 'googleapis';
import { spawn, execSync } from 'child_process';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { verifyAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { uploadLimit } from '../middleware/rateLimiter.js';
import { sendSuccess, sendError } from '../utils/responseHelper.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { NotFoundError, ForbiddenError, BadRequestError } from '../middleware/errorHandler.js';
import { db, storage } from '../config/firebase.js';
import { config } from '../config/index.js';
import { logger } from '../utils/logger.js';
import { getIo } from '../websocket/index.js';

// Check if FFmpeg is available
function isFFmpegAvailable(): boolean {
  try {
    execSync('ffmpeg -version', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

const USE_DEV_MODE = config.nodeEnv === 'development';
const FFMPEG_AVAILABLE = isFFmpegAvailable();

if (!FFMPEG_AVAILABLE) {
  logger.warn('FFmpeg is not installed. Export will use mock mode in development.');
}

const router = Router();

// YouTube upload schema
const uploadToYouTubeSchema = z.object({
  title: z.string().min(1).max(100),
  description: z.string().max(5000).default(''),
  tags: z.array(z.string()).default([]),
  visibility: z.enum(['public', 'unlisted', 'private']).default('private'),
  videoUrl: z.string().url(), // Firebase Storage URL of the final video
});

// Export video schema
const exportVideoSchema = z.object({
  clips: z.array(z.object({
    lineId: z.string(),
    videoUrl: z.string().url(),
    audioUrl: z.string().url().optional(),
    startTime: z.number(),
    duration: z.number(),
    trimStart: z.number().default(0),
    trimEnd: z.number().default(0),
  })),
  subtitles: z.object({
    enabled: z.boolean(),
    style: z.object({
      color: z.string(),
      bgColor: z.string(),
      fontSize: z.string(),
    }).optional(),
    words: z.array(z.object({
      word: z.string(),
      startTime: z.number(),
      endTime: z.number(),
    })).optional(),
  }).optional(),
  audioMix: z.number().min(0).max(1).default(0.8), // 0 = all clip audio, 1 = all voiceover
});

// Helper to verify project access
async function verifyProjectAccess(
  projectId: string,
  userId: string
): Promise<FirebaseFirestore.DocumentData> {
  const projectDoc = await db.collection('projects').doc(projectId).get();

  if (!projectDoc.exists) {
    throw NotFoundError('Project');
  }

  const project = projectDoc.data()!;

  if (project.userId !== userId) {
    throw ForbiddenError('You do not have access to this project');
  }

  return project;
}

// Helper to download a file from URL
async function downloadFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.statusText}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await writeFile(destPath, buffer);
}

// Helper to generate SRT subtitle file
function generateSRT(words: Array<{ word: string; startTime: number; endTime: number }>): string {
  return words.map((word, index) => {
    const formatTime = (seconds: number) => {
      const h = Math.floor(seconds / 3600);
      const m = Math.floor((seconds % 3600) / 60);
      const s = Math.floor(seconds % 60);
      const ms = Math.floor((seconds % 1) * 1000);
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
    };
    return `${index + 1}\n${formatTime(word.startTime)} --> ${formatTime(word.endTime)}\n${word.word}\n`;
  }).join('\n');
}

// Export video (combine clips with FFmpeg)
router.post(
  '/:projectId/export',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { projectId } = req.params;
    const exportData = exportVideoSchema.parse(req.body);

    await verifyProjectAccess(projectId, userId);

    const exportId = uuidv4();
    const io = getIo();

    // In dev mode without FFmpeg, use mock export
    if (USE_DEV_MODE && !FFMPEG_AVAILABLE) {
      logger.info({ exportId, projectId }, 'Using mock export (FFmpeg not available)');

      // Simulate progress
      io.to(`project:${projectId}`).emit('export:progress', { progress: 10, status: 'downloading' });
      await new Promise(r => setTimeout(r, 500));
      io.to(`project:${projectId}`).emit('export:progress', { progress: 30, status: 'processing' });
      await new Promise(r => setTimeout(r, 500));
      io.to(`project:${projectId}`).emit('export:progress', { progress: 60, status: 'encoding' });
      await new Promise(r => setTimeout(r, 500));
      io.to(`project:${projectId}`).emit('export:progress', { progress: 90, status: 'uploading' });
      await new Promise(r => setTimeout(r, 300));

      // Use the first video clip as the "exported" video for demo purposes
      const mockUrl = exportData.clips[0]?.videoUrl || 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';

      // Update project with export info
      await db.collection('projects').doc(projectId).update({
        lastExport: {
          id: exportId,
          url: mockUrl,
          exportedAt: new Date(),
          isMock: true,
        },
        status: 'exported',
        updatedAt: new Date(),
      });

      io.to(`project:${projectId}`).emit('export:progress', { progress: 100, status: 'completed' });
      io.to(`project:${projectId}`).emit('export:completed', { exportId, url: mockUrl });

      logger.info({ exportId, projectId }, 'Mock export completed');

      sendSuccess(res, {
        exportId,
        url: mockUrl,
        status: 'completed',
        isMock: true,
      }, 'Video exported successfully (mock mode - install FFmpeg for real export)');
      return;
    }

    // Check if FFmpeg is available for production
    if (!FFMPEG_AVAILABLE) {
      sendError(res, 'FFmpeg is not installed. Please install FFmpeg to export videos.', 500);
      return;
    }

    const workDir = join(tmpdir(), `viralshorts-export-${exportId}`);
    await mkdir(workDir, { recursive: true });

    // Helper to run FFmpeg command
    const runFFmpeg = (args: string[]): Promise<void> => {
      return new Promise((resolve, reject) => {
        const ffmpeg = spawn('ffmpeg', args);
        let stderr = '';

        ffmpeg.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        ffmpeg.on('close', (code) => {
          if (code === 0) {
            resolve();
          } else {
            logger.error({ stderr, args }, 'FFmpeg failed');
            reject(new Error(`FFmpeg exited with code ${code}`));
          }
        });

        ffmpeg.on('error', reject);
      });
    };

    try {
      logger.info({ exportId, projectId, clipCount: exportData.clips.length }, 'Starting video export');

      // Emit progress: downloading
      io.to(`project:${projectId}`).emit('export:progress', { progress: 5, status: 'downloading' });

      // Download all clips and voiceovers
      const downloadedClips: { videoPath: string; audioPath: string | null; clip: typeof exportData.clips[0] }[] = [];

      for (let i = 0; i < exportData.clips.length; i++) {
        const clip = exportData.clips[i];
        const videoPath = join(workDir, `video_${i}.mp4`);
        const audioPath = clip.audioUrl ? join(workDir, `voiceover_${i}.mp3`) : null;

        await downloadFile(clip.videoUrl, videoPath);
        if (clip.audioUrl && audioPath) {
          await downloadFile(clip.audioUrl, audioPath);
        }

        downloadedClips.push({ videoPath, audioPath, clip });
        io.to(`project:${projectId}`).emit('export:progress', {
          progress: 5 + Math.floor((i / exportData.clips.length) * 15),
          status: 'downloading',
        });
      }

      io.to(`project:${projectId}`).emit('export:progress', { progress: 25, status: 'processing' });

      // Process each clip: apply trim and mix audio
      const processedClips: string[] = [];

      for (let i = 0; i < downloadedClips.length; i++) {
        const { videoPath, audioPath, clip } = downloadedClips[i];
        const processedPath = join(workDir, `processed_${i}.mp4`);

        // Calculate trim times
        const trimStart = clip.trimStart || 0;
        const trimEnd = clip.trimEnd || 0;
        const effectiveDuration = clip.duration - trimStart - trimEnd;

        if (audioPath) {
          // Mix voiceover with original video audio based on audioMix value
          // audioMix: 0 = all clip audio, 1 = all voiceover
          const clipVolume = Math.max(0, 1 - exportData.audioMix).toFixed(2);
          const voiceoverVolume = Math.max(0, exportData.audioMix).toFixed(2);

          const ffmpegArgs = [
            '-ss', trimStart.toString(),
            '-i', videoPath,
            '-i', audioPath,
            '-t', effectiveDuration.toString(),
            '-filter_complex',
            `[0:a]volume=${clipVolume}[va];[1:a]volume=${voiceoverVolume}[vo];[va][vo]amix=inputs=2:duration=longest[aout]`,
            '-map', '0:v',
            '-map', '[aout]',
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-r', '30',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ar', '44100',
            '-ac', '2',
            '-y',
            processedPath
          ];

          await runFFmpeg(ffmpegArgs);
        } else {
          // No voiceover, just trim the video
          const ffmpegArgs = [
            '-ss', trimStart.toString(),
            '-i', videoPath,
            '-t', effectiveDuration.toString(),
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-crf', '23',
            '-pix_fmt', 'yuv420p',
            '-r', '30',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-ar', '44100',
            '-ac', '2',
            '-y',
            processedPath
          ];

          await runFFmpeg(ffmpegArgs);
        }

        processedClips.push(processedPath);
        io.to(`project:${projectId}`).emit('export:progress', {
          progress: 25 + Math.floor((i / downloadedClips.length) * 40),
          status: 'processing',
        });
      }

      io.to(`project:${projectId}`).emit('export:progress', { progress: 70, status: 'encoding' });

      // Generate subtitle file if enabled
      let subtitlePath: string | null = null;
      if (exportData.subtitles?.enabled && exportData.subtitles?.words?.length) {
        subtitlePath = join(workDir, 'subtitles.srt');
        const srtContent = generateSRT(exportData.subtitles.words);
        await writeFile(subtitlePath, srtContent);
      }

      // Create concat file for processed clips
      const concatListPath = join(workDir, 'concat.txt');
      const concatContent = processedClips.map((f) => `file '${f}'`).join('\n');
      await writeFile(concatListPath, concatContent);

      // Output path
      const outputPath = join(workDir, 'output.mp4');

      // Concatenate all processed clips with re-encoding for consistency
      // Using re-encode instead of -c copy to avoid codec parameter mismatches
      const concatArgs = [
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '23',
        '-pix_fmt', 'yuv420p',
        '-c:a', 'aac',
        '-b:a', '128k',
        '-ar', '44100',
        '-ac', '2',
        '-movflags', '+faststart',
        '-y',
        join(workDir, 'concat_output.mp4')
      ];

      await runFFmpeg(concatArgs);

      io.to(`project:${projectId}`).emit('export:progress', { progress: 85, status: 'encoding' });

      // Add subtitles if enabled
      if (subtitlePath && exportData.subtitles?.style) {
        const style = exportData.subtitles.style;
        const fontColor = style.color.replace('#', '');

        const subtitleArgs = [
          '-i', join(workDir, 'concat_output.mp4'),
          '-vf', `subtitles=${subtitlePath}:force_style='FontSize=24,PrimaryColour=&H${fontColor}&,OutlineColour=&H000000&,Outline=2,MarginV=60'`,
          '-c:v', 'libx264',
          '-preset', 'fast',
          '-crf', '23',
          '-c:a', 'copy',
          '-movflags', '+faststart',
          '-y',
          outputPath
        ];

        await runFFmpeg(subtitleArgs);
      } else {
        // No subtitles, just copy the concatenated output
        const copyArgs = [
          '-i', join(workDir, 'concat_output.mp4'),
          '-c', 'copy',
          '-movflags', '+faststart',
          '-y',
          outputPath
        ];

        await runFFmpeg(copyArgs);
      }

      io.to(`project:${projectId}`).emit('export:progress', { progress: 92, status: 'uploading' });

      // Upload to Firebase Storage
      const bucket = storage.bucket();
      const storagePath = `projects/${projectId}/exports/${exportId}.mp4`;
      await bucket.upload(outputPath, {
        destination: storagePath,
        contentType: 'video/mp4',
      });

      const [signedUrl] = await bucket.file(storagePath).getSignedUrl({
        action: 'read',
        expires: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      // Update project with export info
      await db.collection('projects').doc(projectId).update({
        lastExport: {
          id: exportId,
          url: signedUrl,
          exportedAt: new Date(),
        },
        status: 'exported',
        updatedAt: new Date(),
      });

      io.to(`project:${projectId}`).emit('export:progress', { progress: 100, status: 'completed' });
      io.to(`project:${projectId}`).emit('export:completed', { exportId, url: signedUrl });

      // Cleanup temp files
      try {
        // Clean downloaded files
        for (const { videoPath, audioPath } of downloadedClips) {
          await unlink(videoPath).catch(() => {});
          if (audioPath) await unlink(audioPath).catch(() => {});
        }
        // Clean processed files
        for (const file of processedClips) {
          await unlink(file).catch(() => {});
        }
        await unlink(concatListPath).catch(() => {});
        await unlink(join(workDir, 'concat_output.mp4')).catch(() => {});
        await unlink(outputPath).catch(() => {});
        if (subtitlePath) await unlink(subtitlePath).catch(() => {});
      } catch {
        // Ignore cleanup errors
      }

      logger.info({ exportId, projectId }, 'Video export completed');

      sendSuccess(res, {
        exportId,
        url: signedUrl,
        status: 'completed',
      }, 'Video exported successfully');
    } catch (error) {
      logger.error({ error, exportId, projectId }, 'Video export failed');

      io.to(`project:${projectId}`).emit('export:failed', {
        error: error instanceof Error ? error.message : 'Export failed',
      });

      sendError(res, 'Failed to export video. Please try again.', 500);
    }
  })
);

// Get YouTube OAuth URL
router.get(
  '/youtube/auth-url',
  verifyAuth,
  asyncHandler(async (_req: AuthenticatedRequest, res) => {
    const oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );

    const scopes = [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
    ];

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'consent',
    });

    sendSuccess(res, { authUrl });
  })
);

// YouTube OAuth callback
router.post(
  '/youtube/callback',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { code } = req.body;

    if (!code) {
      sendError(res, 'Authorization code is required', 400);
      return;
    }

    const oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );

    try {
      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      // Get channel info
      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });
      const channelResponse = await youtube.channels.list({
        part: ['snippet'],
        mine: true,
      });

      const channel = channelResponse.data.items?.[0];

      if (!channel) {
        sendError(res, 'No YouTube channel found', 400);
        return;
      }

      // Store tokens in user document
      await db.collection('users').doc(userId).update({
        youtubeAuth: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          channelId: channel.id,
          channelName: channel.snippet?.title || '',
          expiresAt: tokens.expiry_date ? new Date(tokens.expiry_date) : null,
        },
        updatedAt: new Date(),
      });

      sendSuccess(res, {
        channelId: channel.id,
        channelName: channel.snippet?.title,
        channelThumbnail: channel.snippet?.thumbnails?.default?.url,
      });
    } catch (error) {
      logger.error({ error }, 'YouTube OAuth failed');
      sendError(res, 'Failed to connect YouTube account', 500);
    }
  })
);

// Upload to YouTube
router.post(
  '/:projectId/upload/youtube',
  verifyAuth,
  uploadLimit,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { projectId } = req.params;
    const uploadData = uploadToYouTubeSchema.parse(req.body);

    await verifyProjectAccess(projectId, userId);

    // Get user's YouTube credentials
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData?.youtubeAuth?.accessToken) {
      throw BadRequestError('YouTube account not connected. Please connect your YouTube account first.');
    }

    const oauth2Client = new google.auth.OAuth2(
      config.google.clientId,
      config.google.clientSecret,
      config.google.redirectUri
    );

    oauth2Client.setCredentials({
      access_token: userData.youtubeAuth.accessToken,
      refresh_token: userData.youtubeAuth.refreshToken,
    });

    // Create upload record
    const uploadId = uuidv4();
    const now = new Date();

    await db.collection('uploads').doc(uploadId).set({
      id: uploadId,
      userId,
      projectId,
      platform: 'youtube',
      platformVideoId: null,
      platformUrl: null,
      title: uploadData.title,
      description: uploadData.description,
      tags: uploadData.tags,
      visibility: uploadData.visibility,
      status: 'uploading',
      errorMessage: null,
      uploadedAt: now,
    });

    try {
      // Download video from Firebase Storage
      const videoResponse = await fetch(uploadData.videoUrl);
      const videoBuffer = Buffer.from(await videoResponse.arrayBuffer());

      const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

      // Upload to YouTube with Shorts formatting
      const videoTitle = uploadData.title.length > 100
        ? uploadData.title.substring(0, 97) + '...'
        : uploadData.title;

      // Add #Shorts to description for YouTube Shorts recognition
      const shortsDescription = `${uploadData.description}\n\n#Shorts`;

      logger.info({ uploadId, projectId }, 'Starting YouTube upload');

      const uploadResponse = await youtube.videos.insert({
        part: ['snippet', 'status'],
        requestBody: {
          snippet: {
            title: videoTitle,
            description: shortsDescription,
            tags: [...uploadData.tags, 'Shorts'],
            categoryId: '22', // People & Blogs
          },
          status: {
            privacyStatus: uploadData.visibility,
            selfDeclaredMadeForKids: false,
          },
        },
        media: {
          body: require('stream').Readable.from(videoBuffer),
        },
      });

      const youtubeVideoId = uploadResponse.data.id;
      const youtubeUrl = `https://www.youtube.com/shorts/${youtubeVideoId}`;

      // Update upload record
      await db.collection('uploads').doc(uploadId).update({
        platformVideoId: youtubeVideoId,
        platformUrl: youtubeUrl,
        status: 'published',
      });

      // Update project with YouTube info
      await db.collection('projects').doc(projectId).update({
        youtubeUpload: {
          videoId: youtubeVideoId,
          url: youtubeUrl,
          uploadedAt: now,
        },
        status: 'uploaded',
        updatedAt: now,
      });

      // Update user upload count
      await db.collection('users').doc(userId).update({
        'usage.videosUploaded': (userData.usage?.videosUploaded || 0) + 1,
      });

      logger.info({ uploadId, youtubeVideoId }, 'YouTube upload completed');

      sendSuccess(res, {
        uploadId,
        youtubeVideoId,
        youtubeUrl,
        status: 'published',
      }, 'Video uploaded to YouTube successfully');
    } catch (error) {
      logger.error({ error, uploadId }, 'YouTube upload failed');

      await db.collection('uploads').doc(uploadId).update({
        status: 'failed',
        errorMessage: error instanceof Error ? error.message : 'Upload failed',
      });

      sendError(res, 'Failed to upload to YouTube. Please try again.', 500);
    }
  })
);

// Get upload status
router.get(
  '/:projectId/upload/youtube/status',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { projectId } = req.params;

    await verifyProjectAccess(projectId, userId);

    const uploadsSnapshot = await db
      .collection('uploads')
      .where('projectId', '==', projectId)
      .where('platform', '==', 'youtube')
      .orderBy('uploadedAt', 'desc')
      .limit(1)
      .get();

    if (uploadsSnapshot.empty) {
      sendSuccess(res, { status: 'not_uploaded' });
      return;
    }

    const upload = uploadsSnapshot.docs[0].data();
    sendSuccess(res, {
      id: uploadsSnapshot.docs[0].id,
      ...upload,
    });
  })
);

// Get user's upload history
router.get(
  '/history',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { limit = '20', offset = '0' } = req.query;

    const uploadsSnapshot = await db
      .collection('uploads')
      .where('userId', '==', userId)
      .orderBy('uploadedAt', 'desc')
      .limit(parseInt(limit as string, 10))
      .offset(parseInt(offset as string, 10))
      .get();

    const uploads = uploadsSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    sendSuccess(res, uploads);
  })
);

export default router;

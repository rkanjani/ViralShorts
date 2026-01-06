import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { verifyAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { generationLimit } from '../middleware/rateLimiter.js';
import { sendSuccess, sendError } from '../utils/responseHelper.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { NotFoundError, ForbiddenError } from '../middleware/errorHandler.js';
import { db } from '../config/firebase.js';
import * as soraService from '../services/soraService.js';
import { logger } from '../utils/logger.js';

const router = Router();

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

// Generate video for a single line (3 options)
router.post(
  '/:projectId/videos/generate',
  verifyAuth,
  generationLimit,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { projectId } = req.params;
    const { lineId } = req.body;

    if (!lineId) {
      sendError(res, 'lineId is required', 400);
      return;
    }

    const project = await verifyProjectAccess(projectId, userId);

    // Get the script line
    const lineDoc = await db
      .collection('projects')
      .doc(projectId)
      .collection('script')
      .doc(lineId)
      .get();

    if (!lineDoc.exists) {
      throw NotFoundError('Script line');
    }

    const lineData = lineDoc.data()!;
    const now = new Date();

    // Get all script lines for full context
    const allLinesSnapshot = await db
      .collection('projects')
      .doc(projectId)
      .collection('script')
      .orderBy('order')
      .get();

    const fullScript = allLinesSnapshot.docs
      .map((doc, idx) => {
        const data = doc.data();
        const isCurrentLine = doc.id === lineId;
        return `${idx + 1}. ${isCurrentLine ? '>>> ' : ''}${data.text}${isCurrentLine ? ' <<<' : ''}`;
      })
      .join('\n');

    const linePosition = lineData.order + 1;
    const totalLines = allLinesSnapshot.docs.length;

    // Build the video generation prompt with full context
    const prompt = `Create a ${lineData.estimatedDuration}-second video clip for a viral short-form video.

=== PROJECT CONTEXT ===
Title: "${project.title}"
Description: ${project.description || 'A viral short video'}
Total Duration: ${project.duration} seconds

=== FULL SCRIPT (for story continuity) ===
${fullScript}

=== CURRENT LINE TO VISUALIZE ===
Line ${linePosition} of ${totalLines}: "${lineData.text}"

=== REQUIREMENTS ===
- This video is for LINE ${linePosition} ONLY: "${lineData.text}"
- Vertical 9:16 aspect ratio (TikTok/YouTube Shorts/Instagram Reels)
- Visual style must be consistent with a cohesive story across all lines
- ${linePosition === 1 ? 'This is the OPENING - create a strong visual hook that grabs attention' : ''}
- ${linePosition === totalLines ? 'This is the CLOSING - create a satisfying visual conclusion' : ''}
- ${linePosition > 1 && linePosition < totalLines ? 'This is a MIDDLE segment - maintain visual flow and build tension' : ''}
- Dynamic, eye-catching visuals that match the energy of the line
- High quality, cinematic aesthetic with smooth motion
- Ensure visual elements could naturally transition from previous/next lines`;

    // Generate 3 video options using the mock Sora service
    const videoRecords = [];

    for (let i = 0; i < 3; i++) {
      const videoId = uuidv4();

      try {
        // Start video generation with mock Sora service
        const soraJobId = await soraService.createVideoGeneration({
          prompt,
          duration: lineData.estimatedDuration || 5,
          aspectRatio: '9:16',
          projectId,
          videoId,
        });

        const videoData = {
          id: videoId,
          lineId,
          soraJobId,
          status: 'processing',
          prompt,
          storageUrl: null,
          thumbnailUrl: null,
          duration: lineData.estimatedDuration,
          resolution: { width: 1080, height: 1920 },
          optionIndex: i,
          isSelected: false,
          errorMessage: null,
          createdAt: now,
          completedAt: null,
        };

        videoRecords.push(videoData);

        // Store video record in Firestore
        await db
          .collection('projects')
          .doc(projectId)
          .collection('videos')
          .doc(videoId)
          .set(videoData);

        logger.info(
          { videoId, soraJobId },
          'Video generation started'
        );
      } catch (error) {
        logger.error({ error, videoId }, 'Failed to start video generation');

        const videoData = {
          id: videoId,
          lineId,
          soraJobId: null,
          status: 'failed',
          prompt,
          storageUrl: null,
          thumbnailUrl: null,
          duration: lineData.estimatedDuration,
          resolution: { width: 1080, height: 1920 },
          optionIndex: i,
          isSelected: false,
          errorMessage: error instanceof Error ? error.message : 'Generation failed',
          createdAt: now,
          completedAt: null,
        };

        videoRecords.push(videoData);

        await db
          .collection('projects')
          .doc(projectId)
          .collection('videos')
          .doc(videoId)
          .set(videoData);
      }
    }

    // Update project status
    await db.collection('projects').doc(projectId).update({
      status: 'generating',
      updatedAt: now,
    });

    sendSuccess(res, {
      message: 'Video generation started',
      videos: videoRecords,
    });
  })
);

// Generate videos for all lines
router.post(
  '/:projectId/videos/generate-all',
  verifyAuth,
  generationLimit,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { projectId } = req.params;

    const project = await verifyProjectAccess(projectId, userId);

    // Get all script lines
    const linesSnapshot = await db
      .collection('projects')
      .doc(projectId)
      .collection('script')
      .orderBy('order')
      .get();

    if (linesSnapshot.empty) {
      sendError(res, 'No script lines found', 400);
      return;
    }

    const now = new Date();
    const allVideos = [];
    const totalLines = linesSnapshot.docs.length;

    // Build full script for context
    const fullScriptLines = linesSnapshot.docs.map((doc, idx) => {
      const data = doc.data();
      return { id: doc.id, order: idx + 1, text: data.text };
    });

    // Generate videos for each line
    for (const lineDoc of linesSnapshot.docs) {
      const lineData = lineDoc.data();
      const lineId = lineDoc.id;
      const linePosition = lineData.order + 1;

      // Skip if videos already exist for this line
      const existingVideos = await db
        .collection('projects')
        .doc(projectId)
        .collection('videos')
        .where('lineId', '==', lineId)
        .get();

      if (!existingVideos.empty) {
        continue;
      }

      // Build full script with current line highlighted
      const fullScript = fullScriptLines
        .map((line) => {
          const isCurrentLine = line.id === lineId;
          return `${line.order}. ${isCurrentLine ? '>>> ' : ''}${line.text}${isCurrentLine ? ' <<<' : ''}`;
        })
        .join('\n');

      const prompt = `Create a ${lineData.estimatedDuration}-second video clip for a viral short-form video.

=== PROJECT CONTEXT ===
Title: "${project.title}"
Description: ${project.description || 'A viral short video'}
Total Duration: ${project.duration} seconds

=== FULL SCRIPT (for story continuity) ===
${fullScript}

=== CURRENT LINE TO VISUALIZE ===
Line ${linePosition} of ${totalLines}: "${lineData.text}"

=== REQUIREMENTS ===
- This video is for LINE ${linePosition} ONLY: "${lineData.text}"
- Vertical 9:16 aspect ratio (TikTok/YouTube Shorts/Instagram Reels)
- Visual style must be consistent with a cohesive story across all lines
- ${linePosition === 1 ? 'This is the OPENING - create a strong visual hook that grabs attention' : ''}
- ${linePosition === totalLines ? 'This is the CLOSING - create a satisfying visual conclusion' : ''}
- ${linePosition > 1 && linePosition < totalLines ? 'This is a MIDDLE segment - maintain visual flow and build tension' : ''}
- Dynamic, eye-catching visuals that match the energy of the line
- High quality, cinematic aesthetic with smooth motion
- Ensure visual elements could naturally transition from previous/next lines`;

      // Generate 3 options per line
      for (let i = 0; i < 3; i++) {
        const videoId = uuidv4();

        try {
          const soraJobId = await soraService.createVideoGeneration({
            prompt,
            duration: lineData.estimatedDuration || 5,
            aspectRatio: '9:16',
            projectId,
            videoId,
          });

          const videoData = {
            id: videoId,
            lineId,
            soraJobId,
            status: 'processing',
            prompt,
            storageUrl: null,
            thumbnailUrl: null,
            duration: lineData.estimatedDuration,
            resolution: { width: 1080, height: 1920 },
            optionIndex: i,
            isSelected: false,
            errorMessage: null,
            createdAt: now,
            completedAt: null,
          };

          await db
            .collection('projects')
            .doc(projectId)
            .collection('videos')
            .doc(videoId)
            .set(videoData);

          allVideos.push(videoData);
        } catch (error) {
          logger.error({ error, lineId, optionIndex: i }, 'Failed to generate video');
        }
      }
    }

    // Update project status
    await db.collection('projects').doc(projectId).update({
      status: 'generating',
      updatedAt: now,
    });

    sendSuccess(res, {
      message: 'Video generation started for all lines',
      videosQueued: allVideos.length,
      videos: allVideos,
    });
  })
);

// Check video generation status
router.get(
  '/:projectId/videos/:videoId/status',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { projectId, videoId } = req.params;

    await verifyProjectAccess(projectId, userId);

    const videoDoc = await db
      .collection('projects')
      .doc(projectId)
      .collection('videos')
      .doc(videoId)
      .get();

    if (!videoDoc.exists) {
      throw NotFoundError('Video');
    }

    const videoData = videoDoc.data()!;

    // If video is still processing, check with Sora service
    if (videoData.status === 'processing' && videoData.soraJobId) {
      const jobStatus = await soraService.getJobStatus(videoData.soraJobId);

      if (jobStatus) {
        if (jobStatus.status === 'completed' && jobStatus.videoUrl) {
          // Update video record with completed status
          await db
            .collection('projects')
            .doc(projectId)
            .collection('videos')
            .doc(videoId)
            .update({
              status: 'completed',
              storageUrl: jobStatus.videoUrl,
              completedAt: new Date(),
            });

          videoData.status = 'completed';
          videoData.storageUrl = jobStatus.videoUrl;
        } else if (jobStatus.status === 'failed') {
          await db
            .collection('projects')
            .doc(projectId)
            .collection('videos')
            .doc(videoId)
            .update({
              status: 'failed',
              errorMessage: jobStatus.error || 'Generation failed',
            });

          videoData.status = 'failed';
          videoData.errorMessage = jobStatus.error;
        }
      }
    }

    sendSuccess(res, {
      id: videoDoc.id,
      ...videoData,
    });
  })
);

// Select a video option for a line
router.post(
  '/:projectId/lines/:lineId/select-video',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { projectId, lineId } = req.params;
    const { videoId } = req.body;

    if (!videoId) {
      sendError(res, 'videoId is required', 400);
      return;
    }

    await verifyProjectAccess(projectId, userId);

    // Verify video exists and belongs to this line
    const videoDoc = await db
      .collection('projects')
      .doc(projectId)
      .collection('videos')
      .doc(videoId)
      .get();

    if (!videoDoc.exists) {
      throw NotFoundError('Video');
    }

    const videoData = videoDoc.data()!;

    if (videoData.lineId !== lineId) {
      sendError(res, 'Video does not belong to this line', 400);
      return;
    }

    // Unselect all videos for this line
    const lineVideos = await db
      .collection('projects')
      .doc(projectId)
      .collection('videos')
      .where('lineId', '==', lineId)
      .get();

    const batch = db.batch();
    lineVideos.docs.forEach((doc) => {
      batch.update(doc.ref, { isSelected: false });
    });

    // Select the chosen video
    batch.update(videoDoc.ref, { isSelected: true });
    await batch.commit();

    // Update the script line with the selected video
    await db
      .collection('projects')
      .doc(projectId)
      .collection('script')
      .doc(lineId)
      .update({
        selectedVideoId: videoId,
        updatedAt: new Date(),
      });

    sendSuccess(res, {
      message: 'Video selected',
      selectedVideoId: videoId,
    });
  })
);

// Get all videos for a project
router.get(
  '/:projectId/videos',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { projectId } = req.params;

    await verifyProjectAccess(projectId, userId);

    const videosSnapshot = await db
      .collection('projects')
      .doc(projectId)
      .collection('videos')
      .get();

    const videos = videosSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    // Group by lineId
    const videosByLine: Record<string, typeof videos> = {};
    videos.forEach((video) => {
      const videoData = video as { id: string; lineId: string; [key: string]: unknown };
      const lineId = videoData.lineId;
      if (!videosByLine[lineId]) {
        videosByLine[lineId] = [];
      }
      videosByLine[lineId].push(video);
    });

    sendSuccess(res, { videos, videosByLine });
  })
);

// Webhook for Sora video completion (would be called by Sora service)
router.post(
  '/webhooks/sora',
  asyncHandler(async (req, res) => {
    const payload = req.body as soraService.SoraWebhookPayload;

    // Process the webhook
    soraService.handleWebhook(payload);

    // Find and update the video record
    const videosQuery = await db
      .collectionGroup('videos')
      .where('soraJobId', '==', payload.job_id)
      .get();

    if (!videosQuery.empty) {
      const videoDoc = videosQuery.docs[0];
      const projectId = videoDoc.ref.parent.parent?.id;

      if (projectId) {
        await videoDoc.ref.update({
          status: payload.status,
          storageUrl: payload.video_url || null,
          errorMessage: payload.error || null,
          completedAt: payload.status === 'completed' ? new Date() : null,
        });

        // Check if all videos for the project are done
        const allVideos = await db
          .collection('projects')
          .doc(projectId)
          .collection('videos')
          .get();

        const allDone = allVideos.docs.every((doc) => {
          const status = doc.data().status;
          return status === 'completed' || status === 'failed';
        });

        if (allDone) {
          await db.collection('projects').doc(projectId).update({
            status: 'generated',
            updatedAt: new Date(),
          });
        }
      }
    }

    sendSuccess(res, { received: true });
  })
);

export default router;

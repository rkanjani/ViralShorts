// OpenAI Sora Video Generation Service
import { config } from '../config/index.js';
import { db } from '../config/firebase.js';
import { logger } from '../utils/logger.js';

const OPENAI_API_BASE = 'https://api.openai.com/v1';

// Set to true to use mock videos while waiting for Sora API verification
const USE_DEV_MODE = true; // Enable dev mode until Sora verification completes

// Sample videos for development/testing (publicly accessible)
const SAMPLE_VIDEOS = [
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerMeltdowns.mp4',
  'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
];

export interface SoraJobOptions {
  prompt: string;
  duration: number; // in seconds (4, 8, or 12 for sora-2)
  aspectRatio?: '9:16' | '16:9' | '1:1';
  style?: string;
  // Metadata for WebSocket events
  projectId?: string;
  videoId?: string;
}

export interface SoraJob {
  id: string;
  status: 'pending' | 'queued' | 'in_progress' | 'completed' | 'failed';
  progress?: number;
  videoUrl?: string;
  error?: string;
  projectId?: string;
  videoId?: string;
}

// Store job metadata for WebSocket events
const jobMetadata = new Map<string, { projectId?: string; videoId?: string }>();

// Socket.IO instance - will be set by setSocketIO
let io: any = null;

export function setSocketIO(socketIO: any): void {
  io = socketIO;
}

// Simulate video generation for dev mode
async function simulateDevModeGeneration(jobId: string): Promise<void> {
  const totalTime = 5000 + Math.random() * 3000; // 5-8 seconds
  const intervals = 10;
  const intervalTime = totalTime / intervals;

  // Simulate progress
  for (let i = 1; i <= intervals; i++) {
    await new Promise((resolve) => setTimeout(resolve, intervalTime));
    const progress = Math.round((i / intervals) * 100);
    emitVideoUpdate(jobId, 'in_progress', progress);
  }

  // Complete with a random sample video
  const videoUrl = SAMPLE_VIDEOS[Math.floor(Math.random() * SAMPLE_VIDEOS.length)];
  emitVideoUpdate(jobId, 'completed', 100, videoUrl);
  jobMetadata.delete(jobId);

  logger.info({ jobId, videoUrl }, 'Dev mode: Video generation completed');
}

// Convert aspect ratio to resolution (OpenAI allowed values)
function getResolution(aspectRatio: string): string {
  switch (aspectRatio) {
    case '9:16':
      return '720x1280'; // Vertical (Shorts/Reels/TikTok)
    case '16:9':
      return '1280x720'; // Landscape
    case '1:1':
    default:
      return '720x1280'; // Default to vertical for shorts
  }
}

// Emit WebSocket event for video generation updates and persist to Firestore
async function emitVideoUpdate(
  jobId: string,
  status: string,
  progress: number,
  videoUrl?: string,
  error?: string
): Promise<void> {
  const metadata = jobMetadata.get(jobId);
  if (!metadata?.projectId || !metadata?.videoId) return;

  // Update Firestore when video completes or fails
  if (status === 'completed' || status === 'failed') {
    try {
      const updateData: Record<string, any> = {
        status: status === 'completed' ? 'completed' : 'failed',
        updatedAt: new Date(),
      };

      if (videoUrl) {
        updateData.storageUrl = videoUrl;
        updateData.completedAt = new Date();
      }
      if (error) {
        updateData.errorMessage = error;
      }

      await db
        .collection('projects')
        .doc(metadata.projectId)
        .collection('videos')
        .doc(metadata.videoId)
        .update(updateData);

      logger.info({ videoId: metadata.videoId, status }, 'Video record updated in Firestore');
    } catch (err) {
      logger.error({ err, videoId: metadata.videoId }, 'Failed to update video in Firestore');
    }
  }

  // Emit WebSocket event
  if (!io) {
    logger.warn({ jobId }, 'Socket.IO not initialized, skipping WebSocket emit');
    return;
  }

  const eventType = status === 'completed' ? 'completed' :
                    status === 'failed' ? 'failed' : 'progress';
  const event = `video:generation:${eventType}`;

  const payload = {
    projectId: metadata.projectId,
    videoId: metadata.videoId,
    lineId: '',
    status,
    progress,
    storageUrl: videoUrl,
    error,
  };

  logger.info({ event, videoId: metadata.videoId, progress, status }, 'Emitting WebSocket event');
  io.to(`project:${metadata.projectId}`).emit(event, payload);
}

export async function createVideoGeneration(options: SoraJobOptions): Promise<string> {
  try {
    // DEV MODE: Use sample videos while waiting for Sora API verification
    if (USE_DEV_MODE) {
      const jobId = `dev_${Date.now()}_${Math.random().toString(36).substring(7)}`;

      // Store metadata for WebSocket events
      if (options.projectId && options.videoId) {
        jobMetadata.set(jobId, {
          projectId: options.projectId,
          videoId: options.videoId,
        });
      }

      // Emit started event
      emitVideoUpdate(jobId, 'queued', 0);

      logger.info({ jobId, devMode: true }, 'Dev mode: Video generation started');

      // Simulate video generation with sample videos
      simulateDevModeGeneration(jobId);

      return jobId;
    }

    // PRODUCTION MODE: Use real Sora API
    const durationSeconds = Math.min(Math.max(options.duration, 4), 12);
    const resolution = getResolution(options.aspectRatio || '9:16');

    const enhancedPrompt = `${options.prompt}

The video should be exactly ${durationSeconds} seconds long.
Resolution: ${resolution} (vertical 9:16 format for social media shorts).`;

    const formData = new FormData();
    formData.append('model', 'sora-2');
    formData.append('prompt', enhancedPrompt);

    const response = await fetch(`${OPENAI_API_BASE}/videos`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.openai.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(`Sora API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    const jobId = data.id;

    // Store metadata for WebSocket events
    if (options.projectId && options.videoId) {
      jobMetadata.set(jobId, {
        projectId: options.projectId,
        videoId: options.videoId,
      });
    }

    // Emit started event
    emitVideoUpdate(jobId, 'queued', 0);

    logger.info({ jobId, prompt: options.prompt.substring(0, 100) }, 'Sora video generation started');

    // Start polling for status updates in the background
    pollJobStatus(jobId);

    return jobId;
  } catch (error) {
    logger.error({ error }, 'Failed to create Sora video generation job');
    throw error;
  }
}

// Poll for job status and emit WebSocket updates
async function pollJobStatus(jobId: string): Promise<void> {
  const pollInterval = 5000; // 5 seconds
  const maxAttempts = 120; // 10 minutes max
  let attempts = 0;

  const poll = async () => {
    try {
      const response = await fetch(`${OPENAI_API_BASE}/videos/${jobId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${config.openai.apiKey}`,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to get job status: ${response.status}`);
      }

      const job = await response.json();
      attempts++;

      if (job.status === 'completed') {
        emitVideoUpdate(jobId, 'completed', 100, job.video_url || job.output_url);
        jobMetadata.delete(jobId);
        logger.info({ jobId }, 'Sora video generation completed');
        return;
      }

      if (job.status === 'failed') {
        emitVideoUpdate(jobId, 'failed', 0, undefined, job.error || 'Video generation failed');
        jobMetadata.delete(jobId);
        logger.error({ jobId, error: job.error }, 'Sora video generation failed');
        return;
      }

      // Still processing - estimate progress based on attempts
      const estimatedProgress = Math.min(Math.round((attempts / maxAttempts) * 90), 90);
      emitVideoUpdate(jobId, 'in_progress', estimatedProgress);

      if (attempts < maxAttempts) {
        setTimeout(poll, pollInterval);
      } else {
        emitVideoUpdate(jobId, 'failed', 0, undefined, 'Video generation timed out');
        jobMetadata.delete(jobId);
      }
    } catch (error) {
      logger.error({ jobId, error }, 'Error polling Sora job status');
      attempts++;
      if (attempts < maxAttempts) {
        setTimeout(poll, pollInterval * 2); // Exponential backoff on error
      }
    }
  };

  // Start polling after a short delay
  setTimeout(poll, pollInterval);
}

export async function getJobStatus(jobId: string): Promise<SoraJob | null> {
  try {
    const response = await fetch(`${OPENAI_API_BASE}/videos/${jobId}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${config.openai.apiKey}`,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to get job status: ${response.status}`);
    }

    const job = await response.json();

    return {
      id: job.id,
      status: job.status,
      progress: job.status === 'completed' ? 100 : undefined,
      videoUrl: job.video_url || job.output_url,
      error: job.error,
    };
  } catch (error) {
    logger.error({ jobId, error }, 'Failed to get Sora job status');
    return null;
  }
}

export async function cancelJob(jobId: string): Promise<boolean> {
  try {
    // OpenAI may not support cancellation - attempt it anyway
    const response = await fetch(`${OPENAI_API_BASE}/videos/${jobId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${config.openai.apiKey}`,
      },
    });

    jobMetadata.delete(jobId);
    return response.ok;
  } catch (error) {
    logger.error({ jobId, error }, 'Failed to cancel Sora job');
    return false;
  }
}

export async function generateMultipleOptions(
  _lineId: string,
  prompt: string,
  duration: number,
  numOptions: number = 3
): Promise<string[]> {
  const jobIds: string[] = [];

  // Generate variations of the prompt for diversity
  const variations = [
    prompt,
    `${prompt} Use dynamic camera movements and transitions.`,
    `${prompt} Focus on close-up details and textures.`,
  ];

  for (let i = 0; i < numOptions; i++) {
    const jobId = await createVideoGeneration({
      prompt: variations[i % variations.length],
      duration,
      aspectRatio: '9:16',
    });
    jobIds.push(jobId);
  }

  return jobIds;
}

// Webhook handler for Sora completion notifications (if OpenAI supports webhooks)
export interface SoraWebhookPayload {
  job_id: string;
  status: 'completed' | 'failed';
  video_url?: string;
  error?: string;
}

export function handleWebhook(payload: SoraWebhookPayload): void {
  const metadata = jobMetadata.get(payload.job_id);
  if (!metadata) return;

  if (payload.status === 'completed') {
    emitVideoUpdate(payload.job_id, 'completed', 100, payload.video_url);
  } else {
    emitVideoUpdate(payload.job_id, 'failed', 0, undefined, payload.error);
  }

  jobMetadata.delete(payload.job_id);
}

// Clean up old job metadata
export function cleanupOldJobs(maxAgeMs: number = 24 * 60 * 60 * 1000): void {
  // Job metadata is cleaned up when jobs complete/fail
  // This is a fallback for any orphaned entries
  logger.info({ metadataCount: jobMetadata.size }, 'Job metadata cleanup check');
}

import { Queue, Job } from 'bullmq';
import Redis from 'ioredis';

// Redis connection
const redisConnection = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

// Queue names
export const QUEUES = {
  VIDEO_GENERATION: 'video-generation',
  VOICEOVER_GENERATION: 'voiceover-generation',
  VIDEO_EXPORT: 'video-export',
  YOUTUBE_UPLOAD: 'youtube-upload',
} as const;

// Queue instances
const queues = new Map<string, Queue>();

export function getQueue(name: string): Queue {
  if (!queues.has(name)) {
    queues.set(
      name,
      new Queue(name, {
        connection: redisConnection,
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 5000,
          },
          removeOnComplete: {
            count: 100,
            age: 24 * 3600, // 24 hours
          },
          removeOnFail: {
            count: 500,
          },
        },
      })
    );
  }
  return queues.get(name)!;
}

// Job interfaces
export interface VideoGenerationJobData {
  projectId: string;
  lineId: string;
  prompt: string;
  duration: number;
  optionIndex: number;
  socketId?: string;
}

export interface VoiceoverGenerationJobData {
  projectId: string;
  lineId: string;
  text: string;
  voice: string;
  speed: number;
  style: string;
  socketId?: string;
}

export interface VideoExportJobData {
  projectId: string;
  clips: Array<{
    url: string;
    startTime: number;
    duration: number;
    trimStart: number;
    trimEnd: number;
  }>;
  audioClips: Array<{
    url: string;
    startTime: number;
    duration: number;
  }>;
  subtitles: Array<{
    text: string;
    startTime: number;
    endTime: number;
  }>;
  options: {
    width: number;
    height: number;
    fps: number;
    videoBitrate: string;
    audioBitrate: string;
  };
  socketId?: string;
}

export interface YouTubeUploadJobData {
  projectId: string;
  userId: string;
  videoUrl: string;
  title: string;
  description: string;
  tags: string[];
  privacyStatus: 'public' | 'unlisted' | 'private';
  socketId?: string;
}

// Add jobs to queues
export async function addVideoGenerationJob(
  data: VideoGenerationJobData
): Promise<Job<VideoGenerationJobData>> {
  const queue = getQueue(QUEUES.VIDEO_GENERATION);
  return queue.add('generate', data, {
    jobId: `video-${data.projectId}-${data.lineId}-${data.optionIndex}`,
  });
}

export async function addVoiceoverGenerationJob(
  data: VoiceoverGenerationJobData
): Promise<Job<VoiceoverGenerationJobData>> {
  const queue = getQueue(QUEUES.VOICEOVER_GENERATION);
  return queue.add('generate', data, {
    jobId: `voiceover-${data.projectId}-${data.lineId}`,
  });
}

export async function addVideoExportJob(
  data: VideoExportJobData
): Promise<Job<VideoExportJobData>> {
  const queue = getQueue(QUEUES.VIDEO_EXPORT);
  return queue.add('export', data, {
    jobId: `export-${data.projectId}-${Date.now()}`,
  });
}

export async function addYouTubeUploadJob(
  data: YouTubeUploadJobData
): Promise<Job<YouTubeUploadJobData>> {
  const queue = getQueue(QUEUES.YOUTUBE_UPLOAD);
  return queue.add('upload', data, {
    jobId: `upload-${data.projectId}-${Date.now()}`,
  });
}

// Job status helpers
export async function getJobStatus(
  queueName: string,
  jobId: string
): Promise<{
  status: string;
  progress: number;
  data?: unknown;
  error?: string;
} | null> {
  const queue = getQueue(queueName);
  const job = await queue.getJob(jobId);

  if (!job) {
    return null;
  }

  const state = await job.getState();
  const progress = typeof job.progress === 'number' ? job.progress : 0;

  return {
    status: state,
    progress,
    data: job.returnvalue,
    error: job.failedReason,
  };
}

export async function cancelJob(queueName: string, jobId: string): Promise<boolean> {
  const queue = getQueue(queueName);
  const job = await queue.getJob(jobId);

  if (!job) {
    return false;
  }

  const state = await job.getState();
  if (state === 'completed' || state === 'failed') {
    return false;
  }

  await job.remove();
  return true;
}

// Clean up
export async function closeQueues(): Promise<void> {
  for (const queue of queues.values()) {
    await queue.close();
  }
  await redisConnection.quit();
}

// Health check
export async function isQueueHealthy(): Promise<boolean> {
  try {
    await redisConnection.ping();
    return true;
  } catch {
    return false;
  }
}

// Queue metrics
export async function getQueueMetrics(queueName: string): Promise<{
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}> {
  const queue = getQueue(queueName);

  const [waiting, active, completed, failed, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
  ]);

  return { waiting, active, completed, failed, delayed };
}

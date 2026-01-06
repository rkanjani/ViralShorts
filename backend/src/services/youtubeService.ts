import { google, youtube_v3 } from 'googleapis';
import { Readable } from 'stream';

const oauth2Client = new google.auth.OAuth2(
  process.env.YOUTUBE_CLIENT_ID,
  process.env.YOUTUBE_CLIENT_SECRET,
  process.env.YOUTUBE_REDIRECT_URI
);

export function getAuthUrl(state?: string): string {
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/youtube.upload',
      'https://www.googleapis.com/auth/youtube.readonly',
    ],
    prompt: 'consent',
    state,
  });
}

export async function exchangeCodeForTokens(code: string): Promise<{
  accessToken: string;
  refreshToken: string;
}> {
  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token || !tokens.refresh_token) {
    throw new Error('Failed to get tokens from YouTube');
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  oauth2Client.setCredentials({ refresh_token: refreshToken });
  const { credentials } = await oauth2Client.refreshAccessToken();

  if (!credentials.access_token) {
    throw new Error('Failed to refresh access token');
  }

  return credentials.access_token;
}

export async function getChannelInfo(
  accessToken: string
): Promise<{ channelId: string; channelName: string }> {
  oauth2Client.setCredentials({ access_token: accessToken });

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  const response = await youtube.channels.list({
    part: ['snippet'],
    mine: true,
  });

  const channel = response.data.items?.[0];
  if (!channel) {
    throw new Error('No YouTube channel found');
  }

  return {
    channelId: channel.id!,
    channelName: channel.snippet?.title || 'Unknown',
  };
}

export interface UploadOptions {
  title: string;
  description: string;
  tags?: string[];
  privacyStatus?: 'public' | 'unlisted' | 'private';
  categoryId?: string;
}

export interface UploadProgress {
  bytesUploaded: number;
  totalBytes: number;
  percentage: number;
}

export async function uploadVideo(
  accessToken: string,
  videoBuffer: Buffer,
  options: UploadOptions,
  onProgress?: (progress: UploadProgress) => void
): Promise<{ videoId: string; url: string }> {
  oauth2Client.setCredentials({ access_token: accessToken });

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  // Ensure #Shorts is in title or description for Shorts eligibility
  const isShort = options.title.includes('#Shorts') || options.description.includes('#Shorts');
  const description = isShort ? options.description : `${options.description}\n\n#Shorts`;
  const tags = options.tags || [];
  if (!tags.includes('Shorts')) {
    tags.push('Shorts');
  }

  // Create readable stream from buffer
  const videoStream = Readable.from(videoBuffer);

  const response = await youtube.videos.insert(
    {
      part: ['snippet', 'status'],
      requestBody: {
        snippet: {
          title: options.title,
          description,
          tags,
          categoryId: options.categoryId || '22', // People & Blogs
        },
        status: {
          privacyStatus: options.privacyStatus || 'public',
          selfDeclaredMadeForKids: false,
        },
      },
      media: {
        body: videoStream,
      },
    },
    {
      onUploadProgress: (evt) => {
        if (onProgress && evt.bytesRead) {
          onProgress({
            bytesUploaded: evt.bytesRead,
            totalBytes: videoBuffer.length,
            percentage: Math.round((evt.bytesRead / videoBuffer.length) * 100),
          });
        }
      },
    }
  );

  const videoId = response.data.id;
  if (!videoId) {
    throw new Error('Failed to get video ID from upload response');
  }

  return {
    videoId,
    url: `https://youtube.com/shorts/${videoId}`,
  };
}

export async function getVideoStatus(
  accessToken: string,
  videoId: string
): Promise<{
  status: string;
  privacyStatus: string;
  uploadStatus: string;
}> {
  oauth2Client.setCredentials({ access_token: accessToken });

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  const response = await youtube.videos.list({
    part: ['status'],
    id: [videoId],
  });

  const video = response.data.items?.[0];
  if (!video) {
    throw new Error('Video not found');
  }

  return {
    status: video.status?.uploadStatus || 'unknown',
    privacyStatus: video.status?.privacyStatus || 'unknown',
    uploadStatus: video.status?.uploadStatus || 'unknown',
  };
}

export async function deleteVideo(accessToken: string, videoId: string): Promise<void> {
  oauth2Client.setCredentials({ access_token: accessToken });

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  await youtube.videos.delete({
    id: videoId,
  });
}

export async function updateVideoMetadata(
  accessToken: string,
  videoId: string,
  updates: Partial<UploadOptions>
): Promise<void> {
  oauth2Client.setCredentials({ access_token: accessToken });

  const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

  const updateData: youtube_v3.Schema$Video = {
    id: videoId,
  };

  if (updates.title || updates.description || updates.tags) {
    updateData.snippet = {
      title: updates.title,
      description: updates.description,
      tags: updates.tags,
    };
  }

  if (updates.privacyStatus) {
    updateData.status = {
      privacyStatus: updates.privacyStatus,
    };
  }

  await youtube.videos.update({
    part: ['snippet', 'status'],
    requestBody: updateData,
  });
}

export function isValidShortsVideo(
  durationSeconds: number,
  width: number,
  height: number
): boolean {
  // Shorts requirements:
  // - Duration: 60 seconds or less
  // - Aspect ratio: vertical (9:16) or square (1:1)
  const isValidDuration = durationSeconds <= 60;
  const isVertical = height > width;
  const isSquare = height === width;

  return isValidDuration && (isVertical || isSquare);
}

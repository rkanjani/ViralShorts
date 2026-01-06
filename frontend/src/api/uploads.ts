import apiClient from './client';
import type { Upload, YouTubeUploadForm, ApiResponse } from '../types';

export interface ExportClip {
  lineId: string;
  videoUrl: string;
  audioUrl?: string;
  startTime: number;
  duration: number;
  trimStart?: number;
  trimEnd?: number;
}

export interface SubtitleWord {
  word: string;
  startTime: number;
  endTime: number;
}

export interface ExportRequest {
  clips: ExportClip[];
  subtitles?: {
    enabled: boolean;
    style?: {
      color: string;
      bgColor: string;
      fontSize: string;
    };
    words?: SubtitleWord[];
  };
  audioMix?: number; // 0 = all clip audio, 1 = all voiceover audio
}

export const uploadsApi = {
  // Export video (server-side FFmpeg)
  exportVideo: async (
    projectId: string,
    data: ExportRequest
  ): Promise<{ exportId: string; url: string; status: string }> => {
    const response = await apiClient.post<
      ApiResponse<{ exportId: string; url: string; status: string }>
    >(`/projects/${projectId}/export`, data);
    if (!response.data.data) {
      throw new Error(response.data.error || 'Failed to export video');
    }
    return response.data.data;
  },
  // Get YouTube OAuth URL
  getYouTubeAuthUrl: async (): Promise<string> => {
    const response = await apiClient.get<ApiResponse<{ authUrl: string }>>(
      '/projects/youtube/auth-url'
    );
    return response.data.data?.authUrl || '';
  },

  // Handle YouTube OAuth callback
  handleYouTubeCallback: async (
    code: string
  ): Promise<{ channelId: string; channelName: string; channelThumbnail?: string }> => {
    const response = await apiClient.post<
      ApiResponse<{ channelId: string; channelName: string; channelThumbnail?: string }>
    >('/projects/youtube/callback', { code });
    if (!response.data.data) {
      throw new Error(response.data.error || 'Failed to connect YouTube');
    }
    return response.data.data;
  },

  // Upload to YouTube
  uploadToYouTube: async (
    projectId: string,
    data: YouTubeUploadForm & { videoUrl: string }
  ): Promise<{ uploadId: string; youtubeVideoId: string; youtubeUrl: string; status: string }> => {
    const response = await apiClient.post<
      ApiResponse<{ uploadId: string; youtubeVideoId: string; youtubeUrl: string; status: string }>
    >(`/projects/${projectId}/upload/youtube`, data);
    if (!response.data.data) {
      throw new Error(response.data.error || 'Failed to upload to YouTube');
    }
    return response.data.data;
  },

  // Get upload status
  getYouTubeStatus: async (projectId: string): Promise<Upload | { status: 'not_uploaded' }> => {
    const response = await apiClient.get<ApiResponse<Upload | { status: 'not_uploaded' }>>(
      `/projects/${projectId}/upload/youtube/status`
    );
    return response.data.data || { status: 'not_uploaded' };
  },

  // Get upload history
  getHistory: async (limit = 20, offset = 0): Promise<Upload[]> => {
    const response = await apiClient.get<ApiResponse<Upload[]>>('/projects/history', {
      params: { limit, offset },
    });
    return response.data.data || [];
  },
};

export default uploadsApi;

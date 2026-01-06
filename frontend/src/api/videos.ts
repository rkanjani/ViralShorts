import apiClient from './client';
import type { VideoOption, ApiResponse } from '../types';

export const videosApi = {
  // Generate videos for a single line (returns 3 options)
  generateForLine: async (
    projectId: string,
    lineId: string
  ): Promise<VideoOption[]> => {
    const response = await apiClient.post<ApiResponse<{ videos: VideoOption[] }>>(
      `/projects/${projectId}/videos/generate`,
      { lineId }
    );
    return response.data.data?.videos || [];
  },

  // Generate videos for all lines
  generateAll: async (
    projectId: string
  ): Promise<{ message: string; videosQueued: number; videos: VideoOption[] }> => {
    const response = await apiClient.post<
      ApiResponse<{ message: string; videosQueued: number; videos: VideoOption[] }>
    >(`/projects/${projectId}/videos/generate-all`);
    return response.data.data || { message: '', videosQueued: 0, videos: [] };
  },

  // Check video generation status
  getStatus: async (projectId: string, videoId: string): Promise<VideoOption> => {
    const response = await apiClient.get<ApiResponse<VideoOption>>(
      `/projects/${projectId}/videos/${videoId}/status`
    );
    if (!response.data.data) {
      throw new Error('Video not found');
    }
    return response.data.data;
  },

  // Get all videos for a project (optionally filtered by line)
  list: async (projectId: string, lineId?: string): Promise<VideoOption[]> => {
    const params = lineId ? { lineId } : {};
    const response = await apiClient.get<ApiResponse<{ videos: VideoOption[]; videosByLine: Record<string, VideoOption[]> }>>(
      `/projects/${projectId}/videos`,
      { params }
    );
    return response.data.data?.videos || [];
  },

  // Select a video option for a line
  selectForLine: async (
    projectId: string,
    lineId: string,
    videoId: string
  ): Promise<{ lineId: string; selectedVideoId: string }> => {
    const response = await apiClient.post<
      ApiResponse<{ lineId: string; selectedVideoId: string }>
    >(`/projects/${projectId}/lines/${lineId}/select-video`, { videoId });
    if (!response.data.data) {
      throw new Error(response.data.error || 'Failed to select video');
    }
    return response.data.data;
  },
};

export default videosApi;

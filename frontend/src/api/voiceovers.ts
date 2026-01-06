import apiClient from './client';
import type { Voiceover, VoiceoverSettings, ApiResponse, VoiceId, VoiceStyle } from '../types';

interface VoiceInfo {
  id: VoiceId;
  name: string;
  description: string;
}

interface StyleInfo {
  id: VoiceStyle;
  name: string;
  speedModifier: number;
  emphasis: string;
}

export const voiceoversApi = {
  // Generate voiceover for a single line
  generate: async (
    projectId: string,
    lineId: string,
    settings: VoiceoverSettings
  ): Promise<Voiceover> => {
    const response = await apiClient.post<ApiResponse<Voiceover>>(
      `/projects/${projectId}/voiceovers/generate`,
      { lineId, ...settings }
    );
    if (!response.data.data) {
      throw new Error(response.data.error || 'Failed to generate voiceover');
    }
    return response.data.data;
  },

  // Generate voiceovers for all lines
  generateAll: async (
    projectId: string,
    settings: VoiceoverSettings
  ): Promise<{ results: { lineId: string; voiceoverId?: string; status: string; error?: string }[] }> => {
    const response = await apiClient.post<
      ApiResponse<{ results: { lineId: string; voiceoverId?: string; status: string; error?: string }[] }>
    >(`/projects/${projectId}/voiceovers/generate-all`, settings);
    return response.data.data || { results: [] };
  },

  // List all voiceovers for a project
  list: async (projectId: string): Promise<Voiceover[]> => {
    const response = await apiClient.get<ApiResponse<Voiceover[]>>(
      `/projects/${projectId}/voiceovers`
    );
    return response.data.data || [];
  },

  // Get voiceover details
  get: async (projectId: string, voiceoverId: string): Promise<Voiceover> => {
    const response = await apiClient.get<ApiResponse<Voiceover>>(
      `/projects/${projectId}/voiceovers/${voiceoverId}`
    );
    if (!response.data.data) {
      throw new Error('Voiceover not found');
    }
    return response.data.data;
  },

  // Update voiceover settings (regenerate)
  update: async (
    projectId: string,
    voiceoverId: string,
    updates: { voice?: VoiceId; speed?: number }
  ): Promise<Voiceover> => {
    const response = await apiClient.patch<ApiResponse<Voiceover>>(
      `/projects/${projectId}/voiceovers/${voiceoverId}`,
      updates
    );
    if (!response.data.data) {
      throw new Error(response.data.error || 'Failed to update voiceover');
    }
    return response.data.data;
  },

  // Get available voices and styles
  getVoices: async (): Promise<{ voices: VoiceInfo[]; styles: StyleInfo[] }> => {
    const response = await apiClient.get<ApiResponse<{ voices: VoiceInfo[]; styles: StyleInfo[] }>>(
      '/voiceovers/voices'
    );
    return response.data.data || { voices: [], styles: [] };
  },

  // Preview a voice sample
  preview: async (voice: VoiceId, speed: number = 1.0): Promise<Blob> => {
    const response = await apiClient.post(
      '/projects/voices/preview',
      { voice, speed },
      { responseType: 'blob' }
    );
    return response.data;
  },
};

export default voiceoversApi;

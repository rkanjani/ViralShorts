import apiClient from './client';
import type { ScriptLine, ApiResponse } from '../types';

export const scriptsApi = {
  // Generate script for a project
  generate: async (projectId: string): Promise<ScriptLine[]> => {
    const response = await apiClient.post<ApiResponse<{ script: ScriptLine[] }>>(
      `/projects/${projectId}/script/generate`
    );
    return response.data.data?.script || [];
  },

  // Update a single line
  updateLine: async (
    projectId: string,
    lineId: string,
    updates: { text?: string; order?: number }
  ): Promise<ScriptLine> => {
    const response = await apiClient.patch<ApiResponse<ScriptLine>>(
      `/projects/${projectId}/script/lines/${lineId}`,
      updates
    );
    if (!response.data.data) {
      throw new Error(response.data.error || 'Failed to update line');
    }
    return response.data.data;
  },

  // Regenerate a single line
  regenerateLine: async (projectId: string, lineId: string): Promise<ScriptLine> => {
    const response = await apiClient.post<ApiResponse<ScriptLine>>(
      `/projects/${projectId}/script/lines/${lineId}/regenerate`
    );
    if (!response.data.data) {
      throw new Error(response.data.error || 'Failed to regenerate line');
    }
    return response.data.data;
  },

  // Combine multiple lines
  combineLines: async (
    projectId: string,
    lineIds: string[]
  ): Promise<{ groupId: string; leaderId: string; members: string[] }> => {
    const response = await apiClient.post<
      ApiResponse<{ groupId: string; leaderId: string; members: string[] }>
    >(`/projects/${projectId}/script/lines/combine`, { lineIds });
    if (!response.data.data) {
      throw new Error(response.data.error || 'Failed to combine lines');
    }
    return response.data.data;
  },

  // Split combined lines
  splitLines: async (projectId: string, groupId: string): Promise<void> => {
    await apiClient.post(`/projects/${projectId}/script/lines/split`, { groupId });
  },
};

export default scriptsApi;

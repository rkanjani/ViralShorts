import apiClient from './client';

export const authApi = {
  getGoogleAuthUrl: async (): Promise<{ url: string }> => {
    const response = await apiClient.get('/auth/google/url');
    return response.data;
  },

  loginWithGoogle: async (code: string): Promise<{ token: string; user: unknown }> => {
    const response = await apiClient.post('/auth/google/callback', { code });
    return response.data;
  },

  getCurrentUser: async (): Promise<unknown> => {
    const response = await apiClient.get('/auth/me');
    return response.data;
  },

  getYouTubeAuthUrl: async (): Promise<{ url: string }> => {
    const response = await apiClient.get('/auth/youtube/url');
    return response.data;
  },

  connectYouTube: async (code: string): Promise<{ channelId: string; channelName: string }> => {
    const response = await apiClient.post('/auth/youtube/callback', { code });
    return response.data;
  },

  disconnectYouTube: async (): Promise<void> => {
    await apiClient.post('/auth/youtube/disconnect');
  },
};

export default authApi;

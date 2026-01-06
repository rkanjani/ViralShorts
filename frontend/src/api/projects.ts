import apiClient from './client';
import type { Project, CreateProjectForm, ApiResponse } from '../types';

export const projectsApi = {
  // List all projects
  list: async (status?: string): Promise<Project[]> => {
    const params = status ? { status } : {};
    const response = await apiClient.get<ApiResponse<Project[]>>('/projects', { params });
    return response.data.data || [];
  },

  // Get single project
  get: async (id: string): Promise<Project> => {
    const response = await apiClient.get<ApiResponse<Project>>(`/projects/${id}`);
    if (!response.data.data) {
      throw new Error('Project not found');
    }
    return response.data.data;
  },

  // Create new project
  create: async (data: CreateProjectForm): Promise<Project> => {
    const response = await apiClient.post<ApiResponse<Project>>('/projects', data);
    if (!response.data.data) {
      throw new Error(response.data.error || 'Failed to create project');
    }
    return response.data.data;
  },

  // Update project
  update: async (id: string, data: Partial<Project>): Promise<Project> => {
    const response = await apiClient.patch<ApiResponse<Project>>(`/projects/${id}`, data);
    if (!response.data.data) {
      throw new Error(response.data.error || 'Failed to update project');
    }
    return response.data.data;
  },

  // Delete project
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/projects/${id}`);
  },

  // Duplicate project
  duplicate: async (id: string): Promise<Project> => {
    const response = await apiClient.post<ApiResponse<Project>>(`/projects/${id}/duplicate`);
    if (!response.data.data) {
      throw new Error(response.data.error || 'Failed to duplicate project');
    }
    return response.data.data;
  },
};

export default projectsApi;

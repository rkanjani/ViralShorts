import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { produce, enableMapSet } from 'immer';
import { projectsApi, scriptsApi, videosApi, voiceoversApi } from '../api';

// Enable Immer MapSet plugin for Map/Set support
enableMapSet();
import type {
  Project,
  ScriptLine,
  VideoOption,
  Voiceover,
  CreateProjectForm,
  VoiceoverSettings,
  VideoGenerationUpdate,
} from '../types';

interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  scriptLines: ScriptLine[];
  videos: Map<string, VideoOption[]>; // lineId -> VideoOption[]
  voiceovers: Map<string, Voiceover>; // lineId -> Voiceover
  loading: boolean;
  saving: boolean;
  error: string | null;
}

interface ProjectContextType extends ProjectState {
  // Project operations
  loadProjects: () => Promise<void>;
  loadProject: (id: string) => Promise<void>;
  createProject: (data: CreateProjectForm) => Promise<Project>;
  updateProject: (updates: Partial<Project>) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  duplicateProject: (id: string) => Promise<Project>;
  setCurrentProject: (project: Project | null) => void;

  // Script operations
  generateScript: () => Promise<void>;
  updateScriptLine: (lineId: string, text: string) => Promise<void>;
  regenerateScriptLine: (lineId: string) => Promise<void>;
  combineLines: (lineIds: string[]) => Promise<void>;
  splitLines: (groupId: string) => Promise<void>;

  // Video operations
  generateVideos: (lineId: string) => Promise<void>;
  generateAllVideos: () => Promise<void>;
  selectVideo: (lineId: string, videoId: string) => Promise<void>;
  refreshVideoStatus: (videoId: string) => Promise<void>;
  handleVideoUpdate: (update: VideoGenerationUpdate) => void;

  // Voiceover operations
  generateVoiceover: (lineId: string, settings: VoiceoverSettings) => Promise<void>;
  generateAllVoiceovers: (settings: VoiceoverSettings) => Promise<void>;
  updateVoiceover: (voiceoverId: string, updates: { voice?: string; speed?: number }) => Promise<void>;

  // Utility
  clearError: () => void;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

interface ProjectProviderProps {
  children: ReactNode;
}

export function ProjectProvider({ children }: ProjectProviderProps) {
  const [state, setState] = useState<ProjectState>({
    projects: [],
    currentProject: null,
    scriptLines: [],
    videos: new Map(),
    voiceovers: new Map(),
    loading: false,
    saving: false,
    error: null,
  });

  // Load all projects
  const loadProjects = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const projects = await projectsApi.list();
      setState((prev) => ({ ...prev, projects, loading: false }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load projects',
      }));
    }
  }, []);

  // Load single project with all related data
  const loadProject = useCallback(async (id: string) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const [project, videosData, voiceoversData] = await Promise.all([
        projectsApi.get(id),
        videosApi.list(id),
        voiceoversApi.list(id),
      ]);

      // Group videos by line
      const videosMap = new Map<string, VideoOption[]>();
      const videosArray = Array.isArray(videosData) ? videosData : [];
      videosArray.forEach((video) => {
        const existing = videosMap.get(video.lineId) || [];
        videosMap.set(video.lineId, [...existing, video]);
      });

      // Build voiceovers map by lineId
      const voiceoversMap = new Map<string, Voiceover>();
      const voiceoversArray = Array.isArray(voiceoversData) ? voiceoversData : [];
      voiceoversArray.forEach((voiceover) => {
        voiceoversMap.set(voiceover.lineId, voiceover);
      });

      setState((prev) => ({
        ...prev,
        currentProject: project,
        scriptLines: project.script || [],
        videos: videosMap,
        voiceovers: voiceoversMap,
        loading: false,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to load project',
      }));
    }
  }, []);

  // Create project
  const createProject = useCallback(async (data: CreateProjectForm): Promise<Project> => {
    setState((prev) => ({ ...prev, saving: true, error: null }));
    try {
      const project = await projectsApi.create(data);
      setState((prev) => ({
        ...prev,
        projects: [project, ...prev.projects],
        saving: false,
      }));
      return project;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        saving: false,
        error: error instanceof Error ? error.message : 'Failed to create project',
      }));
      throw error;
    }
  }, []);

  // Update project
  const updateProject = useCallback(async (updates: Partial<Project>) => {
    if (!state.currentProject) return;

    setState((prev) => ({ ...prev, saving: true }));
    try {
      const updated = await projectsApi.update(state.currentProject.id, updates);
      setState((prev) => ({
        ...prev,
        currentProject: updated,
        projects: prev.projects.map((p) => (p.id === updated.id ? updated : p)),
        saving: false,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        saving: false,
        error: error instanceof Error ? error.message : 'Failed to update project',
      }));
    }
  }, [state.currentProject]);

  // Delete project
  const deleteProject = useCallback(async (id: string) => {
    setState((prev) => ({ ...prev, saving: true }));
    try {
      await projectsApi.delete(id);
      setState((prev) => ({
        ...prev,
        projects: prev.projects.filter((p) => p.id !== id),
        currentProject: prev.currentProject?.id === id ? null : prev.currentProject,
        saving: false,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        saving: false,
        error: error instanceof Error ? error.message : 'Failed to delete project',
      }));
    }
  }, []);

  // Duplicate project
  const duplicateProject = useCallback(async (id: string): Promise<Project> => {
    setState((prev) => ({ ...prev, saving: true }));
    try {
      const project = await projectsApi.duplicate(id);
      setState((prev) => ({
        ...prev,
        projects: [project, ...prev.projects],
        saving: false,
      }));
      return project;
    } catch (error) {
      setState((prev) => ({
        ...prev,
        saving: false,
        error: error instanceof Error ? error.message : 'Failed to duplicate project',
      }));
      throw error;
    }
  }, []);

  // Set current project
  const setCurrentProject = useCallback((project: Project | null) => {
    setState((prev) => ({ ...prev, currentProject: project }));
  }, []);

  // Generate script
  const generateScript = useCallback(async () => {
    if (!state.currentProject) return;

    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const lines = await scriptsApi.generate(state.currentProject.id);
      setState((prev) => ({
        ...prev,
        scriptLines: lines,
        currentProject: prev.currentProject
          ? { ...prev.currentProject, status: 'scripted' }
          : null,
        loading: false,
      }));
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to generate script',
      }));
    }
  }, [state.currentProject]);

  // Update script line
  const updateScriptLine = useCallback(async (lineId: string, text: string) => {
    if (!state.currentProject) return;

    try {
      const updated = await scriptsApi.updateLine(state.currentProject.id, lineId, { text });
      setState((prev) =>
        produce(prev, (draft) => {
          const index = draft.scriptLines.findIndex((l) => l.id === lineId);
          if (index !== -1) {
            draft.scriptLines[index] = updated;
          }
        })
      );
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to update line',
      }));
    }
  }, [state.currentProject]);

  // Regenerate script line
  const regenerateScriptLine = useCallback(async (lineId: string) => {
    if (!state.currentProject) return;

    try {
      const updated = await scriptsApi.regenerateLine(state.currentProject.id, lineId);
      setState((prev) =>
        produce(prev, (draft) => {
          const index = draft.scriptLines.findIndex((l) => l.id === lineId);
          if (index !== -1) {
            draft.scriptLines[index] = updated;
          }
        })
      );
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to regenerate line',
      }));
    }
  }, [state.currentProject]);

  // Combine lines
  const combineLines = useCallback(async (lineIds: string[]) => {
    if (!state.currentProject) return;

    try {
      const result = await scriptsApi.combineLines(state.currentProject.id, lineIds);
      // Reload project to get updated script lines
      await loadProject(state.currentProject.id);
      console.log('Lines combined:', result);
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to combine lines',
      }));
    }
  }, [state.currentProject, loadProject]);

  // Split lines
  const splitLines = useCallback(async (groupId: string) => {
    if (!state.currentProject) return;

    try {
      await scriptsApi.splitLines(state.currentProject.id, groupId);
      await loadProject(state.currentProject.id);
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to split lines',
      }));
    }
  }, [state.currentProject, loadProject]);

  // Generate videos for a line
  const generateVideos = useCallback(async (lineId: string) => {
    if (!state.currentProject) return;

    try {
      const videos = await videosApi.generateForLine(state.currentProject.id, lineId);
      setState((prev) =>
        produce(prev, (draft) => {
          draft.videos.set(lineId, videos);
        })
      );
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to generate videos',
      }));
    }
  }, [state.currentProject]);

  // Generate all videos
  const generateAllVideos = useCallback(async () => {
    if (!state.currentProject) return;

    setState((prev) => ({ ...prev, loading: true }));
    try {
      const result = await videosApi.generateAll(state.currentProject.id);

      // Group videos by lineId and update state
      setState((prev) =>
        produce(prev, (draft) => {
          // Group videos by lineId
          const videosByLine = new Map<string, typeof result.videos>();
          for (const video of result.videos) {
            const existing = videosByLine.get(video.lineId) || [];
            existing.push(video);
            videosByLine.set(video.lineId, existing);
          }

          // Merge with existing videos
          for (const [lineId, videos] of videosByLine) {
            draft.videos.set(lineId, videos);
          }

          if (draft.currentProject) {
            draft.currentProject.status = 'generating';
          }
          draft.loading = false;
        })
      );
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to generate videos',
      }));
    }
  }, [state.currentProject]);

  // Select video for a line
  const selectVideo = useCallback(async (lineId: string, videoId: string) => {
    if (!state.currentProject) return;

    try {
      await videosApi.selectForLine(state.currentProject.id, lineId, videoId);
      setState((prev) =>
        produce(prev, (draft) => {
          const lineVideos = draft.videos.get(lineId);
          if (lineVideos) {
            lineVideos.forEach((v) => {
              v.isSelected = v.id === videoId;
            });
          }
          const lineIndex = draft.scriptLines.findIndex((l) => l.id === lineId);
          if (lineIndex !== -1) {
            draft.scriptLines[lineIndex].selectedVideoId = videoId;
          }
        })
      );
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to select video',
      }));
    }
  }, [state.currentProject]);

  // Refresh video status
  const refreshVideoStatus = useCallback(async (videoId: string) => {
    if (!state.currentProject) return;

    try {
      const video = await videosApi.getStatus(state.currentProject.id, videoId);
      setState((prev) =>
        produce(prev, (draft) => {
          const lineVideos = draft.videos.get(video.lineId);
          if (lineVideos) {
            const index = lineVideos.findIndex((v) => v.id === videoId);
            if (index !== -1) {
              lineVideos[index] = video;
            }
          }
        })
      );
    } catch (error) {
      console.error('Failed to refresh video status:', error);
    }
  }, [state.currentProject]);

  // Handle real-time video generation updates from WebSocket
  const handleVideoUpdate = useCallback((update: VideoGenerationUpdate) => {
    setState((prev) =>
      produce(prev, (draft) => {
        // Find the video in any line's videos
        for (const [lineId, lineVideos] of draft.videos) {
          const videoIndex = lineVideos.findIndex((v) => v.id === update.videoId);
          if (videoIndex !== -1) {
            // Update the video with new data
            const video = lineVideos[videoIndex];
            video.status = update.status === 'processing' ? 'in_progress' : update.status;
            video.progress = update.progress;
            if (update.storageUrl) {
              video.storageUrl = update.storageUrl;
            }
            if (update.thumbnailUrl) {
              video.thumbnailUrl = update.thumbnailUrl;
            }
            if (update.error) {
              video.errorMessage = update.error;
            }
            break;
          }
        }
      })
    );
  }, []);

  // Generate voiceover
  const generateVoiceover = useCallback(async (lineId: string, settings: VoiceoverSettings) => {
    if (!state.currentProject) return;

    try {
      const voiceover = await voiceoversApi.generate(
        state.currentProject.id,
        lineId,
        settings
      );
      setState((prev) =>
        produce(prev, (draft) => {
          draft.voiceovers.set(lineId, voiceover);
          const lineIndex = draft.scriptLines.findIndex((l) => l.id === lineId);
          if (lineIndex !== -1) {
            draft.scriptLines[lineIndex].voiceoverId = voiceover.id;
          }
        })
      );
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to generate voiceover',
      }));
    }
  }, [state.currentProject]);

  // Generate all voiceovers
  const generateAllVoiceovers = useCallback(async (settings: VoiceoverSettings) => {
    if (!state.currentProject) return;

    setState((prev) => ({ ...prev, loading: true }));
    try {
      await voiceoversApi.generateAll(state.currentProject.id, settings);
      // Reload to get all voiceovers
      await loadProject(state.currentProject.id);
    } catch (error) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: error instanceof Error ? error.message : 'Failed to generate voiceovers',
      }));
    }
  }, [state.currentProject, loadProject]);

  // Update voiceover
  const updateVoiceover = useCallback(async (
    voiceoverId: string,
    updates: { voice?: string; speed?: number }
  ) => {
    if (!state.currentProject) return;

    try {
      const updated = await voiceoversApi.update(
        state.currentProject.id,
        voiceoverId,
        updates as { voice?: 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'; speed?: number }
      );
      setState((prev) =>
        produce(prev, (draft) => {
          draft.voiceovers.set(updated.lineId, updated);
        })
      );
    } catch (error) {
      setState((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to update voiceover',
      }));
    }
  }, [state.currentProject]);

  // Clear error
  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  const value: ProjectContextType = {
    ...state,
    loadProjects,
    loadProject,
    createProject,
    updateProject,
    deleteProject,
    duplicateProject,
    setCurrentProject,
    generateScript,
    updateScriptLine,
    regenerateScriptLine,
    combineLines,
    splitLines,
    generateVideos,
    generateAllVideos,
    selectVideo,
    refreshVideoStatus,
    handleVideoUpdate,
    generateVoiceover,
    generateAllVoiceovers,
    updateVoiceover,
    clearError,
  };

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

export function useProject(): ProjectContextType {
  const context = useContext(ProjectContext);
  if (context === undefined) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
}

export default ProjectContext;

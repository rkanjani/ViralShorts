// User types
export interface User {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  youtubeAuth?: YouTubeAuth | null;
  settings: UserSettings;
  usage: UserUsage;
  createdAt: Date;
  updatedAt: Date;
}

export interface YouTubeAuth {
  accessToken: string;
  refreshToken: string;
  channelId: string;
  channelName: string;
  expiresAt: Date;
}

export interface UserSettings {
  defaultVoice: string;
  defaultVoiceSpeed: number;
  defaultSubtitleStyle: string;
  theme: 'light' | 'dark' | 'system';
}

export interface UserUsage {
  projectsCreated: number;
  videosGenerated: number;
  videosUploaded: number;
  lastActive: Date;
}

// Project types
export type ProjectDuration = '15-30' | '30-45' | '45-60';
export type ProjectStatus =
  | 'draft'
  | 'scripted'
  | 'generating'
  | 'generated'
  | 'editing'
  | 'exported'
  | 'uploaded';

export interface ProjectExport {
  id: string;
  url: string;
  exportedAt: Date;
  isMock?: boolean;
}

export interface Project {
  id: string;
  userId: string;
  title: string;
  description: string;
  duration: ProjectDuration;
  status: ProjectStatus;
  timeline: Timeline;
  exportSettings: ExportSettings;
  lastExport?: ProjectExport | null;
  youtubeUpload?: YouTubeUpload | null;
  script?: ScriptLine[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Timeline {
  tracks: {
    video: VideoTrack[];
    audio: AudioTrack[];
  };
  duration: number;
}

export interface VideoTrack {
  id: string;
  name: string;
  clips: VideoClip[];
}

export interface AudioTrack {
  id: string;
  name: string;
  clips: AudioClip[];
}

export interface VideoClip {
  id: string;
  sourceId: string;
  startTime: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
}

export interface AudioClip {
  id: string;
  sourceId: string;
  startTime: number;
  duration: number;
  volume: number;
  speed: number;
}

export interface ExportSettings {
  resolution: '720p' | '1080p';
  format: 'mp4';
  fps: number;
}

export interface YouTubeUpload {
  videoId: string;
  url: string;
  uploadedAt: Date;
}

// Script types
export interface ScriptLine {
  id: string;
  text: string;
  order: number;
  groupId?: string | null;
  isGroupLeader: boolean;
  groupMembers: string[];
  estimatedDuration: number;
  selectedVideoId?: string | null;
  voiceoverId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Video types
export type VideoStatus = 'queued' | 'in_progress' | 'completed' | 'failed';

export interface VideoOption {
  id: string;
  lineId: string;
  soraJobId?: string;
  status: VideoStatus;
  progress?: number;
  prompt: string;
  storageUrl?: string | null;
  thumbnailUrl?: string | null;
  duration: number;
  resolution: { width: number; height: number };
  optionIndex: number;
  isSelected: boolean;
  errorMessage?: string | null;
  createdAt: Date;
  completedAt?: Date | null;
}

// Voiceover types
export type VoiceId = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
export type VoiceStyle = 'energetic' | 'conversational' | 'dramatic' | 'custom';

export interface Voiceover {
  id: string;
  lineId: string;
  text: string;
  voice: VoiceId;
  speed: number;
  style: VoiceStyle;
  storageUrl: string;
  duration: number;
  waveformData: number[];
  createdAt: Date;
  updatedAt: Date;
}

// Subtitle types
export interface Subtitle {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  style: SubtitleStyle;
  order: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface SubtitleStyle {
  preset: string;
  fontFamily: string;
  fontSize: number;
  color: string;
  backgroundColor: string;
  strokeColor: string;
  strokeWidth: number;
  position: 'top' | 'center' | 'bottom';
}

// Upload types
export type UploadPlatform = 'youtube' | 'instagram' | 'tiktok';
export type UploadStatus = 'uploading' | 'processing' | 'published' | 'failed';
export type UploadVisibility = 'public' | 'unlisted' | 'private';

export interface Upload {
  id: string;
  userId: string;
  projectId: string;
  platform: UploadPlatform;
  platformVideoId?: string;
  platformUrl?: string;
  title: string;
  description: string;
  tags: string[];
  visibility: UploadVisibility;
  status: UploadStatus;
  errorMessage?: string | null;
  uploadedAt: Date;
}

// API Response types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// WebSocket event types
export interface VideoGenerationUpdate {
  projectId: string;
  videoId: string;
  lineId?: string;
  status: VideoStatus;
  progress?: number;
  storageUrl?: string;
  thumbnailUrl?: string;
  error?: string;
}

export interface VoiceoverUpdate {
  projectId: string;
  voiceoverId: string;
  lineId: string;
  status: 'completed' | 'failed';
  storageUrl?: string;
  error?: string;
}

export interface UploadUpdate {
  projectId: string;
  uploadId: string;
  status: UploadStatus;
  progress?: number;
  platformVideoId?: string;
  platformUrl?: string;
  error?: string;
}

// Form types
export interface CreateProjectForm {
  title: string;
  description: string;
  duration: ProjectDuration;
}

export interface VoiceoverSettings {
  voice: VoiceId;
  speed: number;
  style: VoiceStyle;
}

export interface YouTubeUploadForm {
  title: string;
  description: string;
  tags: string[];
  visibility: UploadVisibility;
}

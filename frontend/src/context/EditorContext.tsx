import {
  createContext,
  useContext,
  useReducer,
  useCallback,
  type ReactNode,
} from 'react';
import { produce } from 'immer';
import { v4 as uuidv4 } from 'uuid';

// Types
export interface TimelineClip {
  id: string;
  sourceId: string;
  sourceUrl: string;
  startTime: number;
  duration: number;
  trimStart: number;
  trimEnd: number;
  type: 'video' | 'audio';
}

export interface TimelineTrack {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'subtitle';
  clips: TimelineClip[];
  muted?: boolean;
  volume?: number;
  locked?: boolean;
  visible?: boolean;
}

export interface SubtitleItem {
  id: string;
  text: string;
  startTime: number;
  endTime: number;
  style: {
    preset: string;
    fontSize: number;
    color: string;
    backgroundColor: string;
    position: 'top' | 'center' | 'bottom';
  };
}

interface EditorState {
  tracks: TimelineTrack[];
  subtitles: SubtitleItem[];
  playhead: number;
  duration: number;
  zoom: number;
  isPlaying: boolean;
  selectedClipId: string | null;
  selectedSubtitleId: string | null;
  clipboard: TimelineClip | null;
  history: {
    past: EditorSnapshot[];
    future: EditorSnapshot[];
  };
  exportProgress: number | null;
  previewUrl: string | null;
}

interface EditorSnapshot {
  tracks: TimelineTrack[];
  subtitles: SubtitleItem[];
}

type EditorAction =
  | { type: 'SET_TRACKS'; tracks: TimelineTrack[] }
  | { type: 'ADD_CLIP'; trackId: string; clip: TimelineClip }
  | { type: 'REMOVE_CLIP'; clipId: string }
  | { type: 'MOVE_CLIP'; clipId: string; newStartTime: number; newTrackId?: string }
  | { type: 'TRIM_CLIP'; clipId: string; trimStart: number; trimEnd: number }
  | { type: 'SPLIT_CLIP'; clipId: string; splitPoint: number }
  | { type: 'SELECT_CLIP'; clipId: string | null }
  | { type: 'COPY_CLIP'; clipId: string }
  | { type: 'PASTE_CLIP'; trackId: string; startTime: number }
  | { type: 'ADD_TRACK'; track: TimelineTrack }
  | { type: 'REMOVE_TRACK'; trackId: string }
  | { type: 'TOGGLE_TRACK_MUTE'; trackId: string }
  | { type: 'TOGGLE_TRACK_LOCK'; trackId: string }
  | { type: 'TOGGLE_TRACK_VISIBILITY'; trackId: string }
  | { type: 'SET_TRACK_VOLUME'; trackId: string; volume: number }
  | { type: 'LOAD_PROJECT_DATA'; data: { tracks: TimelineTrack[]; subtitles: SubtitleItem[] } }
  | { type: 'ADD_SUBTITLE'; subtitle: SubtitleItem }
  | { type: 'UPDATE_SUBTITLE'; subtitleId: string; updates: Partial<SubtitleItem> }
  | { type: 'REMOVE_SUBTITLE'; subtitleId: string }
  | { type: 'SELECT_SUBTITLE'; subtitleId: string | null }
  | { type: 'SET_PLAYHEAD'; time: number }
  | { type: 'SET_PLAYING'; isPlaying: boolean }
  | { type: 'SET_ZOOM'; zoom: number }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'SET_EXPORT_PROGRESS'; progress: number | null }
  | { type: 'SET_PREVIEW_URL'; url: string | null }
  | { type: 'RESET' };

const initialState: EditorState = {
  tracks: [
    { id: 'video-track-1', name: 'Video 1', type: 'video', clips: [], visible: true, locked: false },
    { id: 'audio-track-1', name: 'Audio 1', type: 'audio', clips: [], volume: 1, visible: true, locked: false },
  ],
  subtitles: [],
  playhead: 0,
  duration: 0,
  zoom: 1,
  isPlaying: false,
  selectedClipId: null,
  selectedSubtitleId: null,
  clipboard: null,
  history: { past: [], future: [] },
  exportProgress: null,
  previewUrl: null,
};

// Helper to save history snapshot
const saveToHistory = (state: EditorState): EditorState => {
  return produce(state, (draft) => {
    draft.history.past.push({
      tracks: JSON.parse(JSON.stringify(draft.tracks)),
      subtitles: JSON.parse(JSON.stringify(draft.subtitles)),
    });
    draft.history.future = [];
    // Limit history to 50 items
    if (draft.history.past.length > 50) {
      draft.history.past.shift();
    }
  });
};

// Calculate total duration from all tracks
const calculateDuration = (tracks: TimelineTrack[]): number => {
  let maxEnd = 0;
  tracks.forEach((track) => {
    track.clips.forEach((clip) => {
      const clipEnd = clip.startTime + clip.duration;
      if (clipEnd > maxEnd) maxEnd = clipEnd;
    });
  });
  return maxEnd;
};

// Find clip by ID across all tracks
const findClip = (
  tracks: TimelineTrack[],
  clipId: string
): { track: TimelineTrack; clip: TimelineClip; index: number } | null => {
  for (const track of tracks) {
    const index = track.clips.findIndex((c) => c.id === clipId);
    if (index !== -1) {
      return { track, clip: track.clips[index], index };
    }
  }
  return null;
};

function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case 'SET_TRACKS':
      return produce(state, (draft) => {
        draft.tracks = action.tracks;
        draft.duration = calculateDuration(action.tracks);
      });

    case 'ADD_CLIP': {
      const newState = saveToHistory(state);
      return produce(newState, (draft) => {
        const track = draft.tracks.find((t) => t.id === action.trackId);
        if (track) {
          track.clips.push(action.clip);
          track.clips.sort((a, b) => a.startTime - b.startTime);
          draft.duration = calculateDuration(draft.tracks);
        }
      });
    }

    case 'REMOVE_CLIP': {
      const newState = saveToHistory(state);
      return produce(newState, (draft) => {
        for (const track of draft.tracks) {
          const index = track.clips.findIndex((c) => c.id === action.clipId);
          if (index !== -1) {
            track.clips.splice(index, 1);
            break;
          }
        }
        if (draft.selectedClipId === action.clipId) {
          draft.selectedClipId = null;
        }
        draft.duration = calculateDuration(draft.tracks);
      });
    }

    case 'MOVE_CLIP': {
      const newState = saveToHistory(state);
      return produce(newState, (draft) => {
        const result = findClip(draft.tracks, action.clipId);
        if (!result) return;

        const { track: sourceTrack, clip, index } = result;

        // If moving to different track
        if (action.newTrackId && action.newTrackId !== sourceTrack.id) {
          const targetTrack = draft.tracks.find((t) => t.id === action.newTrackId);
          if (targetTrack && targetTrack.type === sourceTrack.type) {
            sourceTrack.clips.splice(index, 1);
            clip.startTime = Math.max(0, action.newStartTime);
            targetTrack.clips.push(clip);
            targetTrack.clips.sort((a, b) => a.startTime - b.startTime);
          }
        } else {
          // Same track, just update position
          clip.startTime = Math.max(0, action.newStartTime);
          sourceTrack.clips.sort((a, b) => a.startTime - b.startTime);
        }
        draft.duration = calculateDuration(draft.tracks);
      });
    }

    case 'TRIM_CLIP': {
      const newState = saveToHistory(state);
      return produce(newState, (draft) => {
        const result = findClip(draft.tracks, action.clipId);
        if (!result) return;

        const { clip } = result;
        clip.trimStart = action.trimStart;
        clip.trimEnd = action.trimEnd;
        clip.duration = clip.duration - action.trimStart - action.trimEnd;
        draft.duration = calculateDuration(draft.tracks);
      });
    }

    case 'SPLIT_CLIP': {
      const newState = saveToHistory(state);
      return produce(newState, (draft) => {
        const result = findClip(draft.tracks, action.clipId);
        if (!result) return;

        const { track, clip, index } = result;
        const splitPoint = action.splitPoint - clip.startTime;

        if (splitPoint <= 0 || splitPoint >= clip.duration) return;

        // Create second clip
        const secondClip: TimelineClip = {
          ...clip,
          id: uuidv4(),
          startTime: action.splitPoint,
          duration: clip.duration - splitPoint,
          trimStart: clip.trimStart + splitPoint,
        };

        // Modify first clip
        clip.duration = splitPoint;
        clip.trimEnd = clip.trimEnd + (clip.duration - splitPoint);

        // Insert second clip
        track.clips.splice(index + 1, 0, secondClip);
      });
    }

    case 'SELECT_CLIP':
      return produce(state, (draft) => {
        draft.selectedClipId = action.clipId;
        draft.selectedSubtitleId = null;
      });

    case 'COPY_CLIP': {
      const result = findClip(state.tracks, action.clipId);
      if (!result) return state;

      return produce(state, (draft) => {
        draft.clipboard = { ...result.clip };
      });
    }

    case 'PASTE_CLIP': {
      if (!state.clipboard) return state;

      const newState = saveToHistory(state);
      return produce(newState, (draft) => {
        const track = draft.tracks.find((t) => t.id === action.trackId);
        if (!track || !draft.clipboard) return;

        const newClip: TimelineClip = {
          ...draft.clipboard,
          id: uuidv4(),
          startTime: action.startTime,
        };
        track.clips.push(newClip);
        track.clips.sort((a, b) => a.startTime - b.startTime);
        draft.duration = calculateDuration(draft.tracks);
      });
    }

    case 'ADD_TRACK': {
      const newState = saveToHistory(state);
      return produce(newState, (draft) => {
        draft.tracks.push(action.track);
      });
    }

    case 'REMOVE_TRACK': {
      const newState = saveToHistory(state);
      return produce(newState, (draft) => {
        draft.tracks = draft.tracks.filter((t) => t.id !== action.trackId);
      });
    }

    case 'TOGGLE_TRACK_MUTE':
      return produce(state, (draft) => {
        const track = draft.tracks.find((t) => t.id === action.trackId);
        if (track) {
          track.muted = !track.muted;
        }
      });

    case 'SET_TRACK_VOLUME':
      return produce(state, (draft) => {
        const track = draft.tracks.find((t) => t.id === action.trackId);
        if (track) {
          track.volume = action.volume;
        }
      });

    case 'TOGGLE_TRACK_LOCK':
      return produce(state, (draft) => {
        const track = draft.tracks.find((t) => t.id === action.trackId);
        if (track) {
          track.locked = !track.locked;
        }
      });

    case 'TOGGLE_TRACK_VISIBILITY':
      return produce(state, (draft) => {
        const track = draft.tracks.find((t) => t.id === action.trackId);
        if (track) {
          track.visible = !track.visible;
        }
      });

    case 'LOAD_PROJECT_DATA':
      return produce(state, (draft) => {
        if (action.data.tracks.length > 0) {
          draft.tracks = action.data.tracks;
        }
        if (action.data.subtitles) {
          draft.subtitles = action.data.subtitles;
        }
        draft.duration = calculateDuration(draft.tracks);
        draft.history = { past: [], future: [] };
      });

    case 'ADD_SUBTITLE': {
      const newState = saveToHistory(state);
      return produce(newState, (draft) => {
        draft.subtitles.push(action.subtitle);
        draft.subtitles.sort((a, b) => a.startTime - b.startTime);
      });
    }

    case 'UPDATE_SUBTITLE': {
      const newState = saveToHistory(state);
      return produce(newState, (draft) => {
        const index = draft.subtitles.findIndex((s) => s.id === action.subtitleId);
        if (index !== -1) {
          draft.subtitles[index] = { ...draft.subtitles[index], ...action.updates };
        }
      });
    }

    case 'REMOVE_SUBTITLE': {
      const newState = saveToHistory(state);
      return produce(newState, (draft) => {
        draft.subtitles = draft.subtitles.filter((s) => s.id !== action.subtitleId);
        if (draft.selectedSubtitleId === action.subtitleId) {
          draft.selectedSubtitleId = null;
        }
      });
    }

    case 'SELECT_SUBTITLE':
      return produce(state, (draft) => {
        draft.selectedSubtitleId = action.subtitleId;
        draft.selectedClipId = null;
      });

    case 'SET_PLAYHEAD':
      return produce(state, (draft) => {
        draft.playhead = Math.max(0, Math.min(action.time, draft.duration));
      });

    case 'SET_PLAYING':
      return produce(state, (draft) => {
        draft.isPlaying = action.isPlaying;
      });

    case 'SET_ZOOM':
      return produce(state, (draft) => {
        draft.zoom = Math.max(0.1, Math.min(10, action.zoom));
      });

    case 'UNDO': {
      if (state.history.past.length === 0) return state;

      return produce(state, (draft) => {
        const previous = draft.history.past.pop()!;
        draft.history.future.unshift({
          tracks: JSON.parse(JSON.stringify(draft.tracks)),
          subtitles: JSON.parse(JSON.stringify(draft.subtitles)),
        });
        draft.tracks = previous.tracks;
        draft.subtitles = previous.subtitles;
        draft.duration = calculateDuration(draft.tracks);
      });
    }

    case 'REDO': {
      if (state.history.future.length === 0) return state;

      return produce(state, (draft) => {
        const next = draft.history.future.shift()!;
        draft.history.past.push({
          tracks: JSON.parse(JSON.stringify(draft.tracks)),
          subtitles: JSON.parse(JSON.stringify(draft.subtitles)),
        });
        draft.tracks = next.tracks;
        draft.subtitles = next.subtitles;
        draft.duration = calculateDuration(draft.tracks);
      });
    }

    case 'SET_EXPORT_PROGRESS':
      return produce(state, (draft) => {
        draft.exportProgress = action.progress;
      });

    case 'SET_PREVIEW_URL':
      return produce(state, (draft) => {
        draft.previewUrl = action.url;
      });

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// Context
interface EditorContextType {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
  addClip: (trackId: string, clip: Omit<TimelineClip, 'id'>) => void;
  removeClip: (clipId: string) => void;
  moveClip: (clipId: string, trackId: string, newStartTime: number) => void;
  trimClip: (clipId: string, trimStart: number, trimEnd: number) => void;
  splitClip: (clipId: string, splitPoint: number) => void;
  selectClip: (clipId: string | null) => void;
  copyClip: (clipId: string) => void;
  pasteClip: (trackId: string, startTime: number) => void;
  addSubtitle: (subtitle: Omit<SubtitleItem, 'id'>) => void;
  updateSubtitle: (subtitleId: string, updates: Partial<SubtitleItem>) => void;
  removeSubtitle: (subtitleId: string) => void;
  selectSubtitle: (subtitleId: string | null) => void;
  setPlayhead: (time: number) => void;
  play: () => void;
  pause: () => void;
  setZoom: (zoom: number) => void;
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  toggleTrackLock: (trackId: string) => void;
  toggleTrackVisibility: (trackId: string) => void;
  loadProjectData: (data: { tracks?: TimelineTrack[]; subtitles?: SubtitleItem[] }) => void;
}

const EditorContext = createContext<EditorContextType | undefined>(undefined);

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(editorReducer, initialState);

  const addClip = useCallback((trackId: string, clip: Omit<TimelineClip, 'id'>) => {
    dispatch({ type: 'ADD_CLIP', trackId, clip: { ...clip, id: uuidv4() } });
  }, []);

  const removeClip = useCallback((clipId: string) => {
    dispatch({ type: 'REMOVE_CLIP', clipId });
  }, []);

  const moveClip = useCallback((clipId: string, trackId: string, newStartTime: number) => {
    dispatch({ type: 'MOVE_CLIP', clipId, newStartTime, newTrackId: trackId });
  }, []);

  const trimClip = useCallback((clipId: string, trimStart: number, trimEnd: number) => {
    dispatch({ type: 'TRIM_CLIP', clipId, trimStart, trimEnd });
  }, []);

  const splitClip = useCallback((clipId: string, splitPoint: number) => {
    dispatch({ type: 'SPLIT_CLIP', clipId, splitPoint });
  }, []);

  const selectClip = useCallback((clipId: string | null) => {
    dispatch({ type: 'SELECT_CLIP', clipId });
  }, []);

  const copyClip = useCallback((clipId: string) => {
    dispatch({ type: 'COPY_CLIP', clipId });
  }, []);

  const pasteClip = useCallback((trackId: string, startTime: number) => {
    dispatch({ type: 'PASTE_CLIP', trackId, startTime });
  }, []);

  const addSubtitle = useCallback((subtitle: Omit<SubtitleItem, 'id'>) => {
    dispatch({ type: 'ADD_SUBTITLE', subtitle: { ...subtitle, id: uuidv4() } });
  }, []);

  const updateSubtitle = useCallback((subtitleId: string, updates: Partial<SubtitleItem>) => {
    dispatch({ type: 'UPDATE_SUBTITLE', subtitleId, updates });
  }, []);

  const removeSubtitle = useCallback((subtitleId: string) => {
    dispatch({ type: 'REMOVE_SUBTITLE', subtitleId });
  }, []);

  const selectSubtitle = useCallback((subtitleId: string | null) => {
    dispatch({ type: 'SELECT_SUBTITLE', subtitleId });
  }, []);

  const setPlayhead = useCallback((time: number) => {
    dispatch({ type: 'SET_PLAYHEAD', time });
  }, []);

  const play = useCallback(() => {
    dispatch({ type: 'SET_PLAYING', isPlaying: true });
  }, []);

  const pause = useCallback(() => {
    dispatch({ type: 'SET_PLAYING', isPlaying: false });
  }, []);

  const setZoom = useCallback((zoom: number) => {
    dispatch({ type: 'SET_ZOOM', zoom });
  }, []);

  const undo = useCallback(() => {
    dispatch({ type: 'UNDO' });
  }, []);

  const redo = useCallback(() => {
    dispatch({ type: 'REDO' });
  }, []);

  const toggleTrackLock = useCallback((trackId: string) => {
    dispatch({ type: 'TOGGLE_TRACK_LOCK', trackId });
  }, []);

  const toggleTrackVisibility = useCallback((trackId: string) => {
    dispatch({ type: 'TOGGLE_TRACK_VISIBILITY', trackId });
  }, []);

  const loadProjectData = useCallback((data: { tracks?: TimelineTrack[]; subtitles?: SubtitleItem[] }) => {
    dispatch({ type: 'LOAD_PROJECT_DATA', data: { tracks: data.tracks || [], subtitles: data.subtitles || [] } });
  }, []);

  const value: EditorContextType = {
    state,
    dispatch,
    addClip,
    removeClip,
    moveClip,
    trimClip,
    splitClip,
    selectClip,
    copyClip,
    pasteClip,
    addSubtitle,
    updateSubtitle,
    removeSubtitle,
    selectSubtitle,
    setPlayhead,
    play,
    pause,
    setZoom,
    undo,
    redo,
    canUndo: state.history.past.length > 0,
    canRedo: state.history.future.length > 0,
    toggleTrackLock,
    toggleTrackVisibility,
    loadProjectData,
  };

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

export function useEditor(): EditorContextType {
  const context = useContext(EditorContext);
  if (context === undefined) {
    throw new Error('useEditor must be used within an EditorProvider');
  }
  return context;
}

export default EditorContext;

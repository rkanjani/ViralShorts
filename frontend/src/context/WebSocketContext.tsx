import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import type { VideoGenerationUpdate, VoiceoverUpdate, UploadUpdate } from '../types';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:3001';

interface WebSocketState {
  connected: boolean;
  currentRoom: string | null;
}

interface ExportUpdate {
  progress?: number;
  status?: string;
  exportId?: string;
  url?: string;
  error?: string;
}

interface WebSocketContextType extends WebSocketState {
  socket: Socket | null;
  connect: () => void;
  disconnect: () => void;
  joinProjectRoom: (projectId: string) => void;
  leaveProjectRoom: () => void;
  onVideoGenerationUpdate: (callback: (data: VideoGenerationUpdate) => void) => () => void;
  onVoiceoverUpdate: (callback: (data: VoiceoverUpdate) => void) => () => void;
  onUploadUpdate: (callback: (data: UploadUpdate) => void) => () => void;
  onExportUpdate: (callback: (event: string, data: ExportUpdate) => void) => () => void;
}

const WebSocketContext = createContext<WebSocketContextType | undefined>(undefined);

interface WebSocketProviderProps {
  children: ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const { firebaseUser, isAuthenticated } = useAuth();
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    currentRoom: null,
  });
  const socketRef = useRef<Socket | null>(null);
  const callbacksRef = useRef<{
    videoGeneration: Set<(data: VideoGenerationUpdate) => void>;
    voiceover: Set<(data: VoiceoverUpdate) => void>;
    upload: Set<(data: UploadUpdate) => void>;
    export: Set<(event: string, data: ExportUpdate) => void>;
  }>({
    videoGeneration: new Set(),
    voiceover: new Set(),
    upload: new Set(),
    export: new Set(),
  });

  // Connect to WebSocket server
  const connect = useCallback(async () => {
    if (socketRef.current?.connected || !firebaseUser) return;

    const token = await firebaseUser.getIdToken();

    socketRef.current = io(WS_URL, {
      auth: { token },
      transports: ['websocket'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current.on('connect', () => {
      console.log('WebSocket connected');
      setState((prev) => ({ ...prev, connected: true }));
    });

    socketRef.current.on('disconnect', () => {
      console.log('WebSocket disconnected');
      setState((prev) => ({ ...prev, connected: false }));
    });

    socketRef.current.on('error', (error) => {
      console.error('WebSocket error:', error);
    });

    // Video generation events
    socketRef.current.on('video:generation:started', (data: VideoGenerationUpdate) => {
      callbacksRef.current.videoGeneration.forEach((cb) => cb(data));
    });

    socketRef.current.on('video:generation:progress', (data: VideoGenerationUpdate) => {
      callbacksRef.current.videoGeneration.forEach((cb) => cb(data));
    });

    socketRef.current.on('video:generation:completed', (data: VideoGenerationUpdate) => {
      callbacksRef.current.videoGeneration.forEach((cb) => cb(data));
    });

    socketRef.current.on('video:generation:failed', (data: VideoGenerationUpdate) => {
      callbacksRef.current.videoGeneration.forEach((cb) => cb(data));
    });

    // Voiceover events
    socketRef.current.on('voiceover:completed', (data: VoiceoverUpdate) => {
      callbacksRef.current.voiceover.forEach((cb) => cb(data));
    });

    socketRef.current.on('voiceover:failed', (data: VoiceoverUpdate) => {
      callbacksRef.current.voiceover.forEach((cb) => cb(data));
    });

    // Upload events
    socketRef.current.on('upload:started', (data: UploadUpdate) => {
      callbacksRef.current.upload.forEach((cb) => cb(data));
    });

    socketRef.current.on('upload:progress', (data: UploadUpdate) => {
      callbacksRef.current.upload.forEach((cb) => cb(data));
    });

    socketRef.current.on('upload:completed', (data: UploadUpdate) => {
      callbacksRef.current.upload.forEach((cb) => cb(data));
    });

    socketRef.current.on('upload:failed', (data: UploadUpdate) => {
      callbacksRef.current.upload.forEach((cb) => cb(data));
    });

    // Export events
    socketRef.current.on('export:progress', (data: ExportUpdate) => {
      callbacksRef.current.export.forEach((cb) => cb('progress', data));
    });

    socketRef.current.on('export:completed', (data: ExportUpdate) => {
      callbacksRef.current.export.forEach((cb) => cb('completed', data));
    });

    socketRef.current.on('export:failed', (data: ExportUpdate) => {
      callbacksRef.current.export.forEach((cb) => cb('failed', data));
    });
  }, [firebaseUser]);

  // Disconnect from WebSocket server
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setState({ connected: false, currentRoom: null });
    }
  }, []);

  // Join project room
  const joinProjectRoom = useCallback((projectId: string) => {
    if (!socketRef.current?.connected) return;

    // Leave current room first
    if (state.currentRoom) {
      socketRef.current.emit('leave:project', { projectId: state.currentRoom });
    }

    socketRef.current.emit('join:project', { projectId });
    setState((prev) => ({ ...prev, currentRoom: projectId }));
  }, [state.currentRoom]);

  // Leave project room
  const leaveProjectRoom = useCallback(() => {
    if (!socketRef.current?.connected || !state.currentRoom) return;

    socketRef.current.emit('leave:project', { projectId: state.currentRoom });
    setState((prev) => ({ ...prev, currentRoom: null }));
  }, [state.currentRoom]);

  // Subscribe to video generation updates
  const onVideoGenerationUpdate = useCallback(
    (callback: (data: VideoGenerationUpdate) => void) => {
      callbacksRef.current.videoGeneration.add(callback);
      return () => {
        callbacksRef.current.videoGeneration.delete(callback);
      };
    },
    []
  );

  // Subscribe to voiceover updates
  const onVoiceoverUpdate = useCallback((callback: (data: VoiceoverUpdate) => void) => {
    callbacksRef.current.voiceover.add(callback);
    return () => {
      callbacksRef.current.voiceover.delete(callback);
    };
  }, []);

  // Subscribe to upload updates
  const onUploadUpdate = useCallback((callback: (data: UploadUpdate) => void) => {
    callbacksRef.current.upload.add(callback);
    return () => {
      callbacksRef.current.upload.delete(callback);
    };
  }, []);

  // Subscribe to export updates
  const onExportUpdate = useCallback((callback: (event: string, data: ExportUpdate) => void) => {
    callbacksRef.current.export.add(callback);
    return () => {
      callbacksRef.current.export.delete(callback);
    };
  }, []);

  // Auto-connect when authenticated
  useEffect(() => {
    if (isAuthenticated && firebaseUser) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
    };
  }, [isAuthenticated, firebaseUser, connect, disconnect]);

  const value: WebSocketContextType = {
    ...state,
    socket: socketRef.current,
    connect,
    disconnect,
    joinProjectRoom,
    leaveProjectRoom,
    onVideoGenerationUpdate,
    onVoiceoverUpdate,
    onUploadUpdate,
    onExportUpdate,
  };

  return <WebSocketContext.Provider value={value}>{children}</WebSocketContext.Provider>;
}

export function useWebSocket(): WebSocketContextType {
  const context = useContext(WebSocketContext);
  if (context === undefined) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}

export default WebSocketContext;

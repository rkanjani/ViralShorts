import { useState, useEffect, useCallback } from 'react';
import { ffmpegService } from '../services/ffmpegService';
import type { ExportOptions, SubtitleConfig } from '../services/ffmpegService';

interface UseFFmpegReturn {
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
  progress: number;
  load: () => Promise<void>;
  exportVideo: (
    clips: Array<{
      url: string;
      startTime: number;
      duration: number;
      trimStart: number;
      trimEnd: number;
    }>,
    audioClips: Array<{
      url: string;
      startTime: number;
      duration: number;
    }>,
    subtitles: SubtitleConfig[],
    options?: ExportOptions
  ) => Promise<Blob | null>;
  trimVideo: (url: string, startTime: number, duration: number) => Promise<Blob | null>;
  concatenateVideos: (urls: string[]) => Promise<Blob | null>;
  addAudioToVideo: (videoUrl: string, audioUrl: string) => Promise<Blob | null>;
  generateThumbnail: (videoUrl: string, time?: number) => Promise<Blob | null>;
  reset: () => void;
}

export function useFFmpeg(): UseFFmpegReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [isReady, setIsReady] = useState(ffmpegService.isReady());
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  // Check if FFmpeg is already loaded on mount
  useEffect(() => {
    setIsReady(ffmpegService.isReady());
  }, []);

  const load = useCallback(async () => {
    if (isReady || isLoading) return;

    setIsLoading(true);
    setError(null);

    try {
      await ffmpegService.load();
      setIsReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load FFmpeg');
    } finally {
      setIsLoading(false);
    }
  }, [isReady, isLoading]);

  const exportVideo = useCallback(
    async (
      clips: Array<{
        url: string;
        startTime: number;
        duration: number;
        trimStart: number;
        trimEnd: number;
      }>,
      audioClips: Array<{
        url: string;
        startTime: number;
        duration: number;
      }>,
      subtitles: SubtitleConfig[],
      options?: ExportOptions
    ): Promise<Blob | null> => {
      if (!isReady) {
        setError('FFmpeg not loaded');
        return null;
      }

      setProgress(0);
      setError(null);

      try {
        const blob = await ffmpegService.exportVideo(
          clips,
          audioClips,
          subtitles,
          options,
          setProgress
        );
        return blob;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Export failed');
        return null;
      }
    },
    [isReady]
  );

  const trimVideo = useCallback(
    async (url: string, startTime: number, duration: number): Promise<Blob | null> => {
      if (!isReady) {
        setError('FFmpeg not loaded');
        return null;
      }

      setProgress(0);
      setError(null);

      try {
        const blob = await ffmpegService.trimVideo(url, startTime, duration, setProgress);
        return blob;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Trim failed');
        return null;
      }
    },
    [isReady]
  );

  const concatenateVideos = useCallback(
    async (urls: string[]): Promise<Blob | null> => {
      if (!isReady) {
        setError('FFmpeg not loaded');
        return null;
      }

      setProgress(0);
      setError(null);

      try {
        const blob = await ffmpegService.concatenateVideos(urls, setProgress);
        return blob;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Concatenation failed');
        return null;
      }
    },
    [isReady]
  );

  const addAudioToVideo = useCallback(
    async (videoUrl: string, audioUrl: string): Promise<Blob | null> => {
      if (!isReady) {
        setError('FFmpeg not loaded');
        return null;
      }

      setProgress(0);
      setError(null);

      try {
        const blob = await ffmpegService.addAudioToVideo(videoUrl, audioUrl, 0, setProgress);
        return blob;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Adding audio failed');
        return null;
      }
    },
    [isReady]
  );

  const generateThumbnail = useCallback(
    async (videoUrl: string, time: number = 0): Promise<Blob | null> => {
      if (!isReady) {
        setError('FFmpeg not loaded');
        return null;
      }

      setError(null);

      try {
        const blob = await ffmpegService.generateThumbnail(videoUrl, time);
        return blob;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Thumbnail generation failed');
        return null;
      }
    },
    [isReady]
  );

  const reset = useCallback(() => {
    setProgress(0);
    setError(null);
  }, []);

  return {
    isLoading,
    isReady,
    error,
    progress,
    load,
    exportVideo,
    trimVideo,
    concatenateVideos,
    addAudioToVideo,
    generateThumbnail,
    reset,
  };
}

export default useFFmpeg;

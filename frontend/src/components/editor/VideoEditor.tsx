import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  Volume2,
  VolumeX,
  Type,
  Download,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '../common/Button';
import { useProject, useToast, useWebSocket } from '../../context';
import { uploadsApi } from '../../api';

interface VideoEditorProps {
  onContinue?: () => void;
}

interface ClipData {
  lineId: string;
  text: string;
  videoUrl: string | null;
  audioUrl: string | null;
  duration: number;
  trimStart: number;
  trimEnd: number;
}

const SUBTITLE_STYLES = [
  { id: 'classic', name: 'Classic', color: '#ffffff', bgColor: 'rgba(0,0,0,0.7)' },
  { id: 'bold', name: 'Bold', color: '#ffff00', bgColor: 'transparent' },
  { id: 'minimal', name: 'Minimal', color: '#ffffff', bgColor: 'transparent' },
  { id: 'neon', name: 'Neon', color: '#00ff88', bgColor: 'rgba(0,0,0,0.5)' },
];

export function VideoEditor({ onContinue }: VideoEditorProps) {
  const { currentProject, scriptLines, videos, voiceovers, refreshProject } = useProject();
  const { success, error: showError } = useToast();
  const { joinProjectRoom, leaveProjectRoom, onExportUpdate } = useWebSocket();

  // Build clips from data
  const clips = useMemo<ClipData[]>(() => {
    if (!scriptLines.length) return [];

    return scriptLines.map((line) => {
      const lineVideos = videos.get(line.id) || [];
      const selectedVideo = lineVideos.find((v) => v.id === line.selectedVideoId);
      const voiceover = voiceovers.get(line.id);

      return {
        lineId: line.id,
        text: line.text,
        videoUrl: selectedVideo?.storageUrl || null,
        audioUrl: voiceover?.storageUrl || null,
        duration: voiceover?.duration || 5,
        trimStart: 0,
        trimEnd: 0,
      };
    });
  }, [scriptLines, videos, voiceovers]);

  // Trim state - initialize with clips length
  const [clipTrims, setClipTrims] = useState<{ trimStart: number; trimEnd: number }[]>([]);

  // Initialize trims when clips change
  useEffect(() => {
    if (clips.length > 0 && clipTrims.length !== clips.length) {
      setClipTrims(clips.map(() => ({ trimStart: 0, trimEnd: 0 })));
    }
  }, [clips.length]);

  // Calculate total duration and clip positions using clipTrims
  const { totalDuration, clipPositions } = useMemo(() => {
    let total = 0;
    const positions: { start: number; end: number }[] = [];

    clips.forEach((clip, index) => {
      const trim = clipTrims[index] || { trimStart: 0, trimEnd: 0 };
      const effectiveDuration = Math.max(0.5, clip.duration - trim.trimStart - trim.trimEnd);
      positions.push({ start: total, end: total + effectiveDuration });
      total += effectiveDuration;
    });

    return { totalDuration: total || 1, clipPositions: positions };
  }, [clips, clipTrims]);

  // Player state
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);

  // Track previous clip index for detecting clip changes
  const prevClipIndexRef = useRef<number>(-1);

  // Audio time for subtitle sync (tracks actual audio playback position)
  const [audioTime, setAudioTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);

  // Subtitles
  const [subtitlesEnabled, setSubtitlesEnabled] = useState(true);
  const [subtitleStyle, setSubtitleStyle] = useState(SUBTITLE_STYLES[0]);

  // Export - initialize from project's lastExport if available
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const [exportStatus, setExportStatus] = useState('');
  const [exportedUrl, setExportedUrl] = useState<string | null>(
    currentProject?.lastExport?.url || null
  );

  // Sync exportedUrl with project's lastExport when project data changes
  useEffect(() => {
    if (currentProject?.lastExport?.url && !exportedUrl) {
      setExportedUrl(currentProject.lastExport.url);
    }
  }, [currentProject?.lastExport?.url]);

  // Audio mix: 0 = all clip audio, 1 = all voiceover audio
  const [audioMix, setAudioMix] = useState(0.8);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const playbackInterval = useRef<NodeJS.Timeout | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  // Dragging state for timeline
  const [isDragging, setIsDragging] = useState<{ clipIndex: number; edge: 'start' | 'end' } | null>(null);

  // Get current clip based on playhead
  const getCurrentClipIndex = useCallback(() => {
    for (let i = 0; i < clipPositions.length; i++) {
      if (currentTime >= clipPositions[i].start && currentTime < clipPositions[i].end) {
        return i;
      }
    }
    return clipPositions.length > 0 ? clipPositions.length - 1 : -1;
  }, [currentTime, clipPositions]);

  const currentClipIndex = getCurrentClipIndex();
  const currentClip = currentClipIndex >= 0 ? clips[currentClipIndex] : null;

  // Get current word for subtitles - synced to actual audio playback
  // Uses character-weighted timing for more accurate sync
  const currentSubtitle = useMemo(() => {
    if (!subtitlesEnabled || !currentClip) return '';

    const words = currentClip.text.split(/\s+/).filter(w => w.length > 0);
    if (words.length === 0) return '';

    // Use actual audio duration if available, otherwise fall back to stored duration
    const actualDuration = audioDuration > 0 ? audioDuration : (currentClip.duration || 5);

    // Calculate word weights (character count + base)
    const wordWeights = words.map(w => w.length + 2);
    const totalWeight = wordWeights.reduce((sum, w) => sum + w, 0);

    // Find which word we're at based on audioTime
    let accumulatedTime = 0;
    for (let i = 0; i < words.length; i++) {
      const wordDuration = (wordWeights[i] / totalWeight) * actualDuration;
      if (audioTime < accumulatedTime + wordDuration) {
        return words[i];
      }
      accumulatedTime += wordDuration;
    }

    return words[words.length - 1] || '';
  }, [audioTime, audioDuration, currentClip, subtitlesEnabled]);

  // Sync video/audio when clip changes
  useEffect(() => {
    if (!currentClip || currentClipIndex < 0) return;

    const video = videoRef.current;
    const audio = audioRef.current;
    const clipChanged = prevClipIndexRef.current !== currentClipIndex;
    prevClipIndexRef.current = currentClipIndex;

    const clipStart = clipPositions[currentClipIndex]?.start || 0;
    const trim = clipTrims[currentClipIndex] || { trimStart: 0, trimEnd: 0 };
    const timeInClip = Math.max(0, currentTime - clipStart);

    // Update video source if clip changed
    if (video) {
      if (clipChanged && currentClip.videoUrl) {
        video.src = currentClip.videoUrl;
        video.currentTime = timeInClip;
        if (isPlaying) {
          video.play().catch(() => {});
        }
      } else if (!clipChanged && video.readyState >= 1 && Math.abs(video.currentTime - timeInClip) > 0.5) {
        video.currentTime = timeInClip;
      }
    }

    // Update audio source if clip changed
    if (audio) {
      if (clipChanged && currentClip.audioUrl) {
        // Reset audio duration until new audio loads
        setAudioDuration(0);
        setAudioTime(0);
        audio.src = currentClip.audioUrl;
        audio.currentTime = trim.trimStart + timeInClip;
        audio.volume = isMuted ? 0 : volume;
        if (isPlaying) {
          audio.play().catch(() => {});
        }
      } else if (!clipChanged && currentClip.audioUrl && audio.readyState >= 1) {
        const expectedAudioTime = trim.trimStart + timeInClip;
        if (Math.abs(audio.currentTime - expectedAudioTime) > 0.5) {
          audio.currentTime = expectedAudioTime;
        }
      }
    }
  }, [currentClipIndex, currentClip, isPlaying, isMuted, volume]);

  // Play/pause handling
  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;

    if (isPlaying) {
      video?.play().catch(() => {});
      audio?.play().catch(() => {});

      playbackInterval.current = setInterval(() => {
        setCurrentTime((prev) => {
          const next = prev + 0.05;
          if (next >= totalDuration) {
            setIsPlaying(false);
            return 0;
          }
          return next;
        });
      }, 50);
    } else {
      video?.pause();
      audio?.pause();
      if (playbackInterval.current) {
        clearInterval(playbackInterval.current);
        playbackInterval.current = null;
      }
    }

    return () => {
      if (playbackInterval.current) {
        clearInterval(playbackInterval.current);
      }
    };
  }, [isPlaying, totalDuration]);

  // Volume control
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume;
    }
  }, [volume, isMuted]);

  // Track actual audio playback time for subtitle sync
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setAudioTime(audio.currentTime);
    };

    const handleLoadedMetadata = () => {
      setAudioDuration(audio.duration);
      setAudioTime(audio.currentTime);
    };

    const handleLoadedData = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setAudioDuration(audio.duration);
      }
      setAudioTime(audio.currentTime);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('loadeddata', handleLoadedData);
    audio.addEventListener('durationchange', handleLoadedMetadata);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('loadeddata', handleLoadedData);
      audio.removeEventListener('durationchange', handleLoadedMetadata);
    };
  }, []);

  // Join project room for WebSocket events
  useEffect(() => {
    if (currentProject?.id) {
      joinProjectRoom(currentProject.id);
    }
    return () => {
      leaveProjectRoom();
    };
  }, [currentProject?.id, joinProjectRoom, leaveProjectRoom]);

  // WebSocket listeners for export
  useEffect(() => {
    const handleExportUpdate = async (event: string, data: { progress?: number; status?: string; url?: string; error?: string }) => {
      if (event === 'progress') {
        setExportProgress(data.progress || 0);
        setExportStatus(data.status || '');
      } else if (event === 'completed') {
        setIsExporting(false);
        setExportedUrl(data.url || null);
        success('Video exported successfully!');

        // Refresh project to get updated lastExport data
        await refreshProject();

        // Auto-trigger download
        if (data.url) {
          const link = document.createElement('a');
          link.href = data.url;
          link.download = `${currentProject?.title || 'video'}-export.mp4`;
          link.target = '_blank';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        }
      } else if (event === 'failed') {
        setIsExporting(false);
        showError(data.error || 'Export failed');
      }
    };

    const unsubscribe = onExportUpdate(handleExportUpdate);
    return unsubscribe;
  }, [onExportUpdate, success, showError, currentProject?.title, refreshProject]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || isDragging) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = x / rect.width;
    const newTime = percentage * totalDuration;
    setCurrentTime(newTime);

    // Find which clip this time falls into and sync audio
    for (let i = 0; i < clipPositions.length; i++) {
      if (newTime >= clipPositions[i].start && newTime < clipPositions[i].end) {
        const timeInClip = newTime - clipPositions[i].start;
        const trim = clipTrims[i] || { trimStart: 0, trimEnd: 0 };
        if (audioRef.current && clips[i]?.audioUrl) {
          audioRef.current.currentTime = trim.trimStart + timeInClip;
        }
        break;
      }
    }
  };

  const handleTrimDrag = useCallback((e: React.MouseEvent, clipIndex: number, edge: 'start' | 'end') => {
    e.stopPropagation();
    e.preventDefault();
    setIsDragging({ clipIndex, edge });

    const startX = e.clientX;
    const clip = clips[clipIndex];
    const currentTrim = clipTrims[clipIndex] || { trimStart: 0, trimEnd: 0 };
    const initialTrimStart = currentTrim.trimStart;
    const initialTrimEnd = currentTrim.trimEnd;
    const maxTrim = clip.duration * 0.4; // Max 40% trim from each side
    const timelineWidth = timelineRef.current?.getBoundingClientRect().width || 1;
    const pixelsPerSecond = timelineWidth / totalDuration;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaTime = deltaX / pixelsPerSecond;

      setClipTrims((prev) => {
        const newTrims = [...prev];
        if (!newTrims[clipIndex]) {
          newTrims[clipIndex] = { trimStart: 0, trimEnd: 0 };
        }

        if (edge === 'start') {
          // Dragging right increases trim, left decreases
          const newTrimStart = Math.max(0, Math.min(maxTrim, initialTrimStart + deltaTime));
          newTrims[clipIndex] = { ...newTrims[clipIndex], trimStart: newTrimStart };
        } else {
          // Dragging left increases trim, right decreases
          const newTrimEnd = Math.max(0, Math.min(maxTrim, initialTrimEnd - deltaTime));
          newTrims[clipIndex] = { ...newTrims[clipIndex], trimEnd: newTrimEnd };
        }
        return newTrims;
      });
    };

    const handleMouseUp = () => {
      setIsDragging(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  }, [clips, clipTrims, totalDuration]);

  const handleExport = async () => {
    if (!currentProject) return;

    setIsExporting(true);
    setExportProgress(0);
    setExportStatus('preparing');
    setExportedUrl(null);

    try {
      const exportClips = clips.map((clip, index) => ({
        lineId: clip.lineId,
        videoUrl: clip.videoUrl || '',
        audioUrl: clip.audioUrl || undefined,
        startTime: clipPositions[index]?.start || 0,
        duration: clip.duration,
        trimStart: clipTrims[index]?.trimStart || 0,
        trimEnd: clipTrims[index]?.trimEnd || 0,
      })).filter((c) => c.videoUrl);

      if (exportClips.length === 0) {
        showError('No videos available to export');
        setIsExporting(false);
        return;
      }

      // Generate subtitle words with character-weighted timing
      // Longer words take proportionally more time to speak
      const subtitleWords = subtitlesEnabled ? clips.flatMap((clip, clipIndex) => {
        const words = clip.text.split(/\s+/).filter(w => w.length > 0);
        if (words.length === 0) return [];

        const clipStart = clipPositions[clipIndex]?.start || 0;
        const effectiveDuration = clip.duration - (clipTrims[clipIndex]?.trimStart || 0) - (clipTrims[clipIndex]?.trimEnd || 0);

        // Calculate total "weight" - each word's weight is its character count + small base
        const wordWeights = words.map(w => w.length + 2); // +2 base for short words
        const totalWeight = wordWeights.reduce((sum, w) => sum + w, 0);

        // Build word timings
        let currentTime = clipStart;
        return words.map((word, wordIndex) => {
          const wordDuration = (wordWeights[wordIndex] / totalWeight) * effectiveDuration;
          const startTime = currentTime;
          const endTime = currentTime + wordDuration;
          currentTime = endTime;

          return { word, startTime, endTime };
        });
      }) : [];

      await uploadsApi.exportVideo(currentProject.id, {
        clips: exportClips,
        subtitles: {
          enabled: subtitlesEnabled,
          style: subtitlesEnabled ? {
            color: subtitleStyle.color,
            bgColor: subtitleStyle.bgColor,
            fontSize: '24',
          } : undefined,
          words: subtitleWords,
        },
        audioMix, // 0 = all clip audio, 1 = all voiceover audio
      });
    } catch {
      setIsExporting(false);
      showError('Export failed. Please try again.');
    }
  };

  const hasVideos = clips.some((c) => c.videoUrl);

  return (
    <div className="space-y-6">
      {/* Video Preview */}
      <div className="relative bg-black rounded-xl overflow-hidden aspect-[9/16] max-w-xs mx-auto">
        <video
          ref={videoRef}
          className="w-full h-full object-contain"
          muted
          playsInline
          crossOrigin="anonymous"
        />
        <audio ref={audioRef} className="hidden" />

        {/* No video placeholder */}
        {!currentClip?.videoUrl && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900">
            <AlertCircle className="h-8 w-8 text-gray-500 mb-2" />
            <p className="text-gray-400 text-sm text-center px-4">
              {hasVideos ? 'No video for this segment' : 'Generate videos first'}
            </p>
          </div>
        )}

        {/* Subtitle overlay */}
        {subtitlesEnabled && currentSubtitle && (
          <div className="absolute bottom-12 left-0 right-0 px-4 text-center">
            <span
              className="inline-block px-3 py-1 rounded text-xl font-bold"
              style={{
                color: subtitleStyle.color,
                backgroundColor: subtitleStyle.bgColor,
                textShadow: '2px 2px 4px rgba(0,0,0,0.8)',
              }}
            >
              {currentSubtitle}
            </span>
          </div>
        )}
      </div>

      {/* Playback Controls */}
      <div className="space-y-2">
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500 w-10">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={totalDuration || 1}
            step={0.1}
            value={currentTime}
            onChange={(e) => {
              const newTime = parseFloat(e.target.value);
              setCurrentTime(newTime);

              // Sync audio to new position
              for (let i = 0; i < clipPositions.length; i++) {
                if (newTime >= clipPositions[i].start && newTime < clipPositions[i].end) {
                  const timeInClip = newTime - clipPositions[i].start;
                  const trim = clipTrims[i] || { trimStart: 0, trimEnd: 0 };
                  if (audioRef.current && clips[i]?.audioUrl) {
                    audioRef.current.currentTime = trim.trimStart + timeInClip;
                  }
                  break;
                }
              }
            }}
            className="flex-1 h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer"
          />
          <span className="text-xs text-gray-500 w-10">{formatTime(totalDuration)}</span>
        </div>

        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setCurrentTime(0)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <SkipBack className="h-4 w-4 text-gray-600 dark:text-gray-400" />
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-3 rounded-full bg-primary-500 hover:bg-primary-600 text-white"
          >
            {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
          </button>
          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            {isMuted ? (
              <VolumeX className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            ) : (
              <Volume2 className="h-4 w-4 text-gray-600 dark:text-gray-400" />
            )}
          </button>
        </div>
      </div>

      {/* Visual Timeline */}
      <div className="rounded-lg border dark:border-gray-700 p-4">
        <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">Timeline</h3>

        {/* Timeline tracks */}
        <div
          ref={timelineRef}
          className="relative h-20 bg-gray-100 dark:bg-gray-800 rounded-lg cursor-pointer overflow-hidden"
          onClick={handleTimelineClick}
        >
          {/* Clips with 8px gap */}
          {clips.map((clip, index) => {
            const pos = clipPositions[index];
            if (!pos) return null;

            // Calculate position with gaps (8px = ~0.5% depending on container width)
            const gapPx = 8;
            const totalGaps = clips.length - 1;
            const gapPercent = totalGaps > 0 ? (gapPx * totalGaps) / (timelineRef.current?.offsetWidth || 800) * 100 : 0;
            const availableWidth = 100 - gapPercent;

            const left = (pos.start / totalDuration) * availableWidth + (index * gapPx / (timelineRef.current?.offsetWidth || 800) * 100);
            const width = ((pos.end - pos.start) / totalDuration) * availableWidth;

            return (
              <div
                key={clip.lineId}
                className={clsx(
                  'group absolute top-2 bottom-2 rounded transition-all',
                  clip.videoUrl ? 'bg-primary-500' : 'bg-gray-400',
                  currentClipIndex === index && 'ring-2 ring-white'
                )}
                style={{ left: `${left}%`, width: `calc(${width}% - 1px)` }}
              >
                {/* Trim handles - only visible on hover */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-1.5 bg-white/0 hover:bg-yellow-400 cursor-ew-resize rounded-l z-10 transition-colors group-hover:bg-yellow-400/70"
                  onMouseDown={(e) => handleTrimDrag(e, index, 'start')}
                  title="Drag to trim start"
                />
                <div
                  className="absolute right-0 top-0 bottom-0 w-1.5 bg-white/0 hover:bg-yellow-400 cursor-ew-resize rounded-r z-10 transition-colors group-hover:bg-yellow-400/70"
                  onMouseDown={(e) => handleTrimDrag(e, index, 'end')}
                  title="Drag to trim end"
                />

                {/* Clip label - show script line text */}
                <div className="absolute inset-0 flex items-center overflow-hidden px-2">
                  <span className="text-[10px] text-white truncate font-medium leading-tight">
                    {clip.text}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none"
            style={{ left: `${(currentTime / totalDuration) * 100}%` }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full" />
          </div>
        </div>
      </div>

      {/* Audio Mix Slider */}
      <div className="rounded-lg border dark:border-gray-700 p-4">
        <div className="flex items-center gap-2 mb-3">
          <Volume2 className="h-4 w-4 text-gray-500" />
          <span className="text-sm font-medium text-gray-900 dark:text-white">Audio Mix</span>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-gray-500">
            <span>Clip Audio</span>
            <span>Voiceover</span>
          </div>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={audioMix}
            onChange={(e) => setAudioMix(parseFloat(e.target.value))}
            className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full appearance-none cursor-pointer"
          />
          <div className="text-center text-xs text-gray-500">
            {audioMix < 0.3 ? 'Clip audio dominant' : audioMix > 0.7 ? 'Voiceover dominant' : 'Balanced mix'}
          </div>
        </div>
      </div>

      {/* Subtitle Settings */}
      <div className="rounded-lg border dark:border-gray-700 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Type className="h-4 w-4 text-gray-500" />
            <span className="text-sm font-medium text-gray-900 dark:text-white">Subtitles</span>
          </div>
          <button
            onClick={() => setSubtitlesEnabled(!subtitlesEnabled)}
            className={clsx(
              'relative w-10 h-5 rounded-full transition-colors',
              subtitlesEnabled ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
            )}
          >
            <span
              className={clsx(
                'absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform',
                subtitlesEnabled ? 'translate-x-5' : 'translate-x-0.5'
              )}
            />
          </button>
        </div>

        {subtitlesEnabled && (
          <div className="grid grid-cols-4 gap-2">
            {SUBTITLE_STYLES.map((style) => (
              <button
                key={style.id}
                onClick={() => setSubtitleStyle(style)}
                className={clsx(
                  'p-2 rounded border text-center transition-all',
                  subtitleStyle.id === style.id
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 dark:border-gray-700'
                )}
              >
                <div
                  className="h-5 rounded flex items-center justify-center text-xs font-bold"
                  style={{ color: style.color, backgroundColor: style.bgColor || '#1f2937' }}
                >
                  Aa
                </div>
                <span className="text-[10px] text-gray-500 mt-1 block">{style.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Export Section */}
      <div className="space-y-3">
        {exportedUrl ? (
          <div className="p-4 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <p className="text-green-800 dark:text-green-200 font-medium mb-3">
              Video exported successfully!
            </p>
            <div className="flex gap-3">
              <a href={exportedUrl} download target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button className="w-full" variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Download
                </Button>
              </a>
              <Button onClick={onContinue} className="flex-1">
                Upload to YouTube
              </Button>
            </div>
          </div>
        ) : (
          <Button
            onClick={handleExport}
            disabled={isExporting || !hasVideos}
            className="w-full"
            size="lg"
          >
            {isExporting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {exportStatus || 'Preparing...'} {exportProgress}%
              </>
            ) : (
              <>
                <Download className="h-4 w-4 mr-2" />
                Export Video
              </>
            )}
          </Button>
        )}

        {isExporting && (
          <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 transition-all duration-300"
              style={{ width: `${exportProgress}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default VideoEditor;

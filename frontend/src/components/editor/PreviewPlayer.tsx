import { useRef, useEffect, useState, useCallback } from 'react';
import { Maximize2, Minimize2, Volume2, VolumeX } from 'lucide-react';
import * as Slider from '@radix-ui/react-slider';
import { useEditor } from '../../context/EditorContext';

interface PreviewPlayerProps {
  aspectRatio?: '9:16' | '16:9' | '1:1';
}

export function PreviewPlayer({ aspectRatio = '9:16' }: PreviewPlayerProps) {
  const { state, setPlayhead, pause } = useEditor();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRefs = useRef<Map<string, HTMLVideoElement>>(new Map());
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const animationFrameRef = useRef<number>();

  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  // Calculate dimensions based on aspect ratio
  const aspectRatios = {
    '9:16': { width: 9, height: 16 },
    '16:9': { width: 16, height: 9 },
    '1:1': { width: 1, height: 1 },
  };

  // Get active clips at current playhead position
  const getActiveClips = useCallback(() => {
    const activeClips: Array<{
      clip: typeof state.tracks[0]['clips'][0];
      track: typeof state.tracks[0];
    }> = [];

    for (const track of state.tracks) {
      if (!track.visible) continue;

      for (const clip of track.clips) {
        const clipStart = clip.startTime;
        const clipEnd = clip.startTime + clip.duration;

        if (state.playhead >= clipStart && state.playhead < clipEnd) {
          activeClips.push({ clip, track });
        }
      }
    }

    return activeClips;
  }, [state.playhead, state.tracks]);

  // Get active subtitles at current playhead position
  const getActiveSubtitles = useCallback(() => {
    return state.subtitles.filter(
      (sub) => state.playhead >= sub.startTime && state.playhead < sub.endTime
    );
  }, [state.playhead, state.subtitles]);

  // Update canvas size when container resizes
  useEffect(() => {
    const updateDimensions = () => {
      if (!containerRef.current) return;

      const containerRect = containerRef.current.getBoundingClientRect();
      const ar = aspectRatios[aspectRatio];
      const containerAspect = containerRect.width / containerRect.height;
      const videoAspect = ar.width / ar.height;

      let width, height;
      if (containerAspect > videoAspect) {
        height = containerRect.height;
        width = height * videoAspect;
      } else {
        width = containerRect.width;
        height = width / videoAspect;
      }

      setDimensions({ width, height });
    };

    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, [aspectRatio]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const render = () => {
      // Clear canvas
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Get active clips
      const activeClips = getActiveClips();

      // Render video clips
      for (const { clip, track } of activeClips) {
        if (clip.type === 'video' && clip.sourceUrl) {
          let video = videoRefs.current.get(clip.id);

          if (!video) {
            video = document.createElement('video');
            video.src = clip.sourceUrl;
            video.muted = true; // Video track is muted, audio comes from audio track
            video.load();
            videoRefs.current.set(clip.id, video);
          }

          // Calculate the time within the clip
          const clipTime = state.playhead - clip.startTime + clip.trimStart;

          // Sync video time if needed
          if (Math.abs(video.currentTime - clipTime) > 0.1) {
            video.currentTime = clipTime;
          }

          // Play/pause based on editor state
          if (state.isPlaying && video.paused) {
            video.play().catch(() => {});
          } else if (!state.isPlaying && !video.paused) {
            video.pause();
          }

          // Draw video to canvas
          if (video.readyState >= 2) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          }
        }
      }

      // Render subtitles
      const activeSubtitles = getActiveSubtitles();
      for (const subtitle of activeSubtitles) {
        ctx.save();

        // Apply subtitle styling
        const fontSize = Math.round(canvas.height * 0.05);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';

        // Calculate position
        const x = canvas.width / 2;
        const y = canvas.height - fontSize;

        // Draw text shadow/outline
        ctx.strokeStyle = '#000';
        ctx.lineWidth = fontSize * 0.15;
        ctx.strokeText(subtitle.text, x, y);

        // Draw text
        ctx.fillStyle = subtitle.style?.color || '#fff';
        ctx.fillText(subtitle.text, x, y);

        ctx.restore();
      }

      animationFrameRef.current = requestAnimationFrame(render);
    };

    render();

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [state.playhead, state.isPlaying, getActiveClips, getActiveSubtitles]);

  // Handle audio playback
  useEffect(() => {
    const activeClips = getActiveClips();

    for (const { clip } of activeClips) {
      if (clip.type === 'audio' && clip.sourceUrl) {
        let audio = audioRefs.current.get(clip.id);

        if (!audio) {
          audio = new Audio(clip.sourceUrl);
          audioRefs.current.set(clip.id, audio);
        }

        audio.volume = isMuted ? 0 : volume;

        const clipTime = state.playhead - clip.startTime + clip.trimStart;

        if (Math.abs(audio.currentTime - clipTime) > 0.1) {
          audio.currentTime = clipTime;
        }

        if (state.isPlaying && audio.paused) {
          audio.play().catch(() => {});
        } else if (!state.isPlaying && !audio.paused) {
          audio.pause();
        }
      }
    }

    // Pause audio that's no longer active
    audioRefs.current.forEach((audio, clipId) => {
      const isActive = activeClips.some(({ clip }) => clip.id === clipId);
      if (!isActive && !audio.paused) {
        audio.pause();
      }
    });
  }, [state.playhead, state.isPlaying, isMuted, volume, getActiveClips]);

  // Fullscreen handling
  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return;

    if (!isFullscreen) {
      containerRef.current.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }, [isFullscreen]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative flex items-center justify-center bg-black rounded-lg overflow-hidden"
      style={{ aspectRatio: aspectRatio.replace(':', '/') }}
    >
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={dimensions.width * 2} // 2x for retina
        height={dimensions.height * 2}
        style={{ width: dimensions.width, height: dimensions.height }}
        className="bg-black"
      />

      {/* Controls overlay */}
      <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/70 to-transparent opacity-0 hover:opacity-100 transition-opacity">
        <div className="flex items-center justify-between">
          {/* Volume control */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMuted(!isMuted)}
              className="p-1 rounded hover:bg-white/20 transition-colors"
            >
              {isMuted ? (
                <VolumeX className="h-4 w-4 text-white" />
              ) : (
                <Volume2 className="h-4 w-4 text-white" />
              )}
            </button>
            <div className="w-20">
              <Slider.Root
                className="relative flex items-center select-none touch-none w-full h-4"
                value={[isMuted ? 0 : volume]}
                onValueChange={(value) => {
                  setVolume(value[0]);
                  setIsMuted(value[0] === 0);
                }}
                max={1}
                step={0.01}
              >
                <Slider.Track className="bg-white/30 relative grow rounded-full h-1">
                  <Slider.Range className="absolute bg-white rounded-full h-full" />
                </Slider.Track>
                <Slider.Thumb
                  className="block w-3 h-3 bg-white rounded-full shadow hover:scale-110 focus:outline-none"
                  aria-label="Volume"
                />
              </Slider.Root>
            </div>
          </div>

          {/* Fullscreen toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-1 rounded hover:bg-white/20 transition-colors"
          >
            {isFullscreen ? (
              <Minimize2 className="h-4 w-4 text-white" />
            ) : (
              <Maximize2 className="h-4 w-4 text-white" />
            )}
          </button>
        </div>
      </div>

      {/* Aspect ratio indicator */}
      <div className="absolute top-2 right-2 px-2 py-1 bg-black/50 rounded text-xs text-white">
        {aspectRatio}
      </div>
    </div>
  );
}

export default PreviewPlayer;

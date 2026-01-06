import { useRef, useCallback, useEffect } from 'react';
import { DndContext, DragOverlay, useSensor, useSensors, PointerSensor } from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import { ZoomIn, ZoomOut, SkipBack, Play, Pause, SkipForward } from 'lucide-react';
import { clsx } from 'clsx';
import { useEditor } from '../../context/EditorContext';
import { TimelineTrack } from './TimelineTrack';
import { TimelineClip } from './TimelineClip';

export function Timeline() {
  const {
    state,
    selectClip,
    moveClip,
    trimClip,
    splitClip,
    setPlayhead,
    setZoom,
    toggleTrackLock,
    toggleTrackVisibility,
    play,
    pause,
  } = useEditor();

  const timelineRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const pixelsPerSecond = 50 * state.zoom;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    })
  );

  // Format time as MM:SS.ms
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  // Generate time markers
  const generateTimeMarkers = () => {
    const markers = [];
    const interval = state.zoom < 0.5 ? 5 : state.zoom < 1 ? 2 : 1;
    for (let t = 0; t <= state.duration; t += interval) {
      markers.push(t);
    }
    return markers;
  };

  // Handle click on ruler to set playhead
  const handleRulerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const time = Math.max(0, Math.min(state.duration, x / pixelsPerSecond));
      setPlayhead(time);
    },
    [pixelsPerSecond, state.duration, setPlayhead]
  );

  // Handle drag end for clips
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (!over) return;

    const clipId = active.id as string;
    const overData = over.data.current;

    if (overData?.type === 'track') {
      // Get the delta position
      const deltaX = event.delta.x;
      const deltaTime = deltaX / pixelsPerSecond;

      // Find the clip to get its current position
      const clip = state.tracks
        .flatMap((t) => t.clips)
        .find((c) => c.id === clipId);

      if (clip) {
        const newStartTime = Math.max(0, clip.startTime + deltaTime);
        moveClip(clipId, overData.trackId, newStartTime);
      }
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          state.isPlaying ? pause() : play();
          break;
        case 'Delete':
        case 'Backspace':
          if (state.selectedClipId) {
            // Delete selected clip - would need deleteClip action
          }
          break;
        case 'Equal':
        case 'NumpadAdd':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            setZoom(Math.min(4, state.zoom + 0.25));
          }
          break;
        case 'Minus':
        case 'NumpadSubtract':
          if (e.metaKey || e.ctrlKey) {
            e.preventDefault();
            setZoom(Math.max(0.25, state.zoom - 0.25));
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [state.isPlaying, state.selectedClipId, state.zoom, play, pause, setZoom]);

  // Find the clip being dragged for overlay
  const draggedClip = state.tracks
    .flatMap((t) => t.clips)
    .find((c) => c.id === state.selectedClipId);

  return (
    <div className="flex flex-col h-full bg-gray-900 text-white">
      {/* Controls bar */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        {/* Playback controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPlayhead(0)}
            className="p-2 rounded hover:bg-gray-700 transition-colors"
            title="Go to start"
          >
            <SkipBack className="h-4 w-4" />
          </button>
          <button
            onClick={() => (state.isPlaying ? pause() : play())}
            className="p-2 rounded bg-primary-500 hover:bg-primary-600 transition-colors"
            title={state.isPlaying ? 'Pause' : 'Play'}
          >
            {state.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
          </button>
          <button
            onClick={() => setPlayhead(state.duration)}
            className="p-2 rounded hover:bg-gray-700 transition-colors"
            title="Go to end"
          >
            <SkipForward className="h-4 w-4" />
          </button>
          <span className="ml-2 text-sm font-mono text-gray-400">
            {formatTime(state.playhead)} / {formatTime(state.duration)}
          </span>
        </div>

        {/* Zoom controls */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setZoom(Math.max(0.25, state.zoom - 0.25))}
            className="p-2 rounded hover:bg-gray-700 transition-colors"
            title="Zoom out"
          >
            <ZoomOut className="h-4 w-4" />
          </button>
          <span className="text-sm text-gray-400 w-12 text-center">{Math.round(state.zoom * 100)}%</span>
          <button
            onClick={() => setZoom(Math.min(4, state.zoom + 0.25))}
            className="p-2 rounded hover:bg-gray-700 transition-colors"
            title="Zoom in"
          >
            <ZoomIn className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Timeline content */}
      <div ref={containerRef} className="flex-1 overflow-auto">
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div
            ref={timelineRef}
            className="min-w-full"
            style={{ width: `${Math.max(state.duration * pixelsPerSecond + 200, containerRef.current?.clientWidth || 0)}px` }}
          >
            {/* Time ruler */}
            <div
              className="h-8 bg-gray-800 border-b border-gray-700 relative cursor-pointer flex"
              onClick={handleRulerClick}
            >
              {/* Track header spacer */}
              <div className="w-32 shrink-0 bg-gray-800 border-r border-gray-700" />

              {/* Ruler */}
              <div className="flex-1 relative">
                {generateTimeMarkers().map((time) => (
                  <div
                    key={time}
                    className="absolute top-0 bottom-0 flex flex-col items-center"
                    style={{ left: `${time * pixelsPerSecond}px` }}
                  >
                    <div className="w-px h-3 bg-gray-600" />
                    <span className="text-xs text-gray-500 mt-0.5">{formatTime(time)}</span>
                  </div>
                ))}

                {/* Playhead indicator on ruler */}
                <div
                  className="absolute top-0 w-3 h-3 -translate-x-1/2 z-20"
                  style={{ left: `${state.playhead * pixelsPerSecond}px` }}
                >
                  <div className="w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-red-500" />
                </div>
              </div>
            </div>

            {/* Tracks */}
            <div className="relative">
              {state.tracks.map((track) => (
                <TimelineTrack
                  key={track.id}
                  track={track}
                  pixelsPerSecond={pixelsPerSecond}
                  selectedClipId={state.selectedClipId}
                  onSelectClip={selectClip}
                  onTrimClip={trimClip}
                  onSplitClip={splitClip}
                  onToggleLock={() => toggleTrackLock(track.id)}
                  onToggleVisibility={() => toggleTrackVisibility(track.id)}
                />
              ))}

              {/* Playhead line */}
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-red-500 z-10 pointer-events-none"
                style={{ left: `${128 + state.playhead * pixelsPerSecond}px` }}
              />
            </div>
          </div>

          {/* Drag overlay */}
          <DragOverlay>
            {draggedClip && (
              <div
                className={clsx(
                  'h-14 rounded opacity-80',
                  draggedClip.type === 'video' ? 'bg-primary-500' : 'bg-green-500'
                )}
                style={{ width: `${draggedClip.duration * pixelsPerSecond}px` }}
              />
            )}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}

export default Timeline;

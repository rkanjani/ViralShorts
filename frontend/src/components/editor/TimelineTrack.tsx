import { useDroppable } from '@dnd-kit/core';
import { clsx } from 'clsx';
import { Video, Volume2, Type, Lock, Unlock, Eye, EyeOff } from 'lucide-react';
import { TimelineClip } from './TimelineClip';
import type { TimelineTrack as TrackType, TimelineClip as ClipType } from '../../context/EditorContext';

interface TimelineTrackProps {
  track: TrackType;
  pixelsPerSecond: number;
  selectedClipId: string | null;
  onSelectClip: (clipId: string | null) => void;
  onTrimClip: (clipId: string, trimStart: number, trimEnd: number) => void;
  onSplitClip: (clipId: string, splitPoint: number) => void;
  onToggleLock: () => void;
  onToggleVisibility: () => void;
}

const trackIcons = {
  video: Video,
  audio: Volume2,
  subtitle: Type,
};

export function TimelineTrack({
  track,
  pixelsPerSecond,
  selectedClipId,
  onSelectClip,
  onTrimClip,
  onSplitClip,
  onToggleLock,
  onToggleVisibility,
}: TimelineTrackProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: `track-${track.id}`,
    data: { type: 'track', trackId: track.id, trackType: track.type },
    disabled: track.locked,
  });

  const Icon = trackIcons[track.type];

  return (
    <div className="flex border-b border-gray-700 last:border-b-0">
      {/* Track header */}
      <div className="w-32 shrink-0 flex flex-col justify-center gap-1 p-2 bg-gray-800 border-r border-gray-700">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-gray-400" />
          <span className="text-sm font-medium text-white truncate">{track.name}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={onToggleLock}
            className={clsx(
              'p-1 rounded hover:bg-gray-700 transition-colors',
              track.locked ? 'text-yellow-500' : 'text-gray-500'
            )}
            title={track.locked ? 'Unlock track' : 'Lock track'}
          >
            {track.locked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
          </button>
          <button
            onClick={onToggleVisibility}
            className={clsx(
              'p-1 rounded hover:bg-gray-700 transition-colors',
              track.visible ? 'text-gray-500' : 'text-red-500'
            )}
            title={track.visible ? 'Hide track' : 'Show track'}
          >
            {track.visible ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* Track content */}
      <div
        ref={setNodeRef}
        className={clsx(
          'flex-1 h-16 relative',
          track.locked && 'opacity-50 cursor-not-allowed',
          isOver && !track.locked && 'bg-primary-500/10'
        )}
      >
        {/* Background grid */}
        <div className="absolute inset-0 opacity-20">
          <div
            className="h-full"
            style={{
              backgroundImage: `repeating-linear-gradient(90deg, transparent, transparent ${pixelsPerSecond - 1}px, #4B5563 ${pixelsPerSecond - 1}px, #4B5563 ${pixelsPerSecond}px)`,
            }}
          />
        </div>

        {/* Clips */}
        {track.clips.map((clip) => (
          <TimelineClip
            key={clip.id}
            clip={clip}
            isSelected={selectedClipId === clip.id}
            pixelsPerSecond={pixelsPerSecond}
            onSelect={() => onSelectClip(clip.id)}
            onTrim={(trimStart, trimEnd) => onTrimClip(clip.id, trimStart, trimEnd)}
            onSplit={(splitPoint) => onSplitClip(clip.id, splitPoint)}
          />
        ))}

        {/* Drop indicator when dragging */}
        {isOver && !track.locked && (
          <div className="absolute inset-0 border-2 border-primary-500 border-dashed rounded pointer-events-none" />
        )}
      </div>
    </div>
  );
}

export default TimelineTrack;

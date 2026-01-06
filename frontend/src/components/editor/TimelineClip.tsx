import { useState, useRef } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { clsx } from 'clsx';
import { GripVertical, Scissors } from 'lucide-react';
import type { TimelineClip as ClipType } from '../../context/EditorContext';

interface TimelineClipProps {
  clip: ClipType;
  isSelected: boolean;
  pixelsPerSecond: number;
  onSelect: () => void;
  onTrim: (trimStart: number, trimEnd: number) => void;
  onSplit: (splitPoint: number) => void;
}

export function TimelineClip({
  clip,
  isSelected,
  pixelsPerSecond,
  onSelect,
  onTrim,
  onSplit,
}: TimelineClipProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: clip.id,
    data: { type: 'clip', clip },
  });

  const [isResizing, setIsResizing] = useState<'left' | 'right' | null>(null);
  const startXRef = useRef(0);
  const originalTrimRef = useRef({ start: 0, end: 0 });

  const width = clip.duration * pixelsPerSecond;
  const left = clip.startTime * pixelsPerSecond;

  const style = {
    width: `${width}px`,
    left: `${left}px`,
    transform: CSS.Translate.toString(transform),
  };

  const handleResizeStart = (e: React.MouseEvent, side: 'left' | 'right') => {
    e.stopPropagation();
    setIsResizing(side);
    startXRef.current = e.clientX;
    originalTrimRef.current = { start: clip.trimStart, end: clip.trimEnd };

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - startXRef.current;
      const deltaTime = deltaX / pixelsPerSecond;

      if (side === 'left') {
        const newTrimStart = Math.max(0, originalTrimRef.current.start + deltaTime);
        onTrim(newTrimStart, clip.trimEnd);
      } else {
        const newTrimEnd = Math.max(0, originalTrimRef.current.end - deltaTime);
        onTrim(clip.trimStart, newTrimEnd);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(null);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const splitPoint = clip.startTime + (clickX / pixelsPerSecond);
    onSplit(splitPoint);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        'absolute top-1 bottom-1 rounded cursor-pointer transition-colors',
        'flex items-center overflow-hidden',
        clip.type === 'video'
          ? 'bg-primary-500/80 hover:bg-primary-500'
          : 'bg-green-500/80 hover:bg-green-500',
        isSelected && 'ring-2 ring-white ring-offset-1 ring-offset-gray-900',
        isDragging && 'opacity-50 z-50'
      )}
      onClick={onSelect}
      onDoubleClick={handleDoubleClick}
      {...attributes}
    >
      {/* Left resize handle */}
      <div
        className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 flex items-center justify-center"
        onMouseDown={(e) => handleResizeStart(e, 'left')}
      >
        <div className="w-0.5 h-4 bg-white/50 rounded" />
      </div>

      {/* Drag handle and content */}
      <div
        className="flex-1 flex items-center gap-1 px-3 overflow-hidden"
        {...listeners}
      >
        <GripVertical className="h-3 w-3 text-white/70 shrink-0" />
        <span className="text-xs text-white truncate">
          {clip.type === 'video' ? 'Video' : 'Audio'} - {clip.duration.toFixed(1)}s
        </span>
      </div>

      {/* Right resize handle */}
      <div
        className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize hover:bg-white/30 flex items-center justify-center"
        onMouseDown={(e) => handleResizeStart(e, 'right')}
      >
        <div className="w-0.5 h-4 bg-white/50 rounded" />
      </div>

      {/* Split indicator on hover */}
      {isSelected && (
        <div className="absolute inset-0 flex items-center justify-center opacity-0 hover:opacity-100 transition-opacity pointer-events-none">
          <div className="bg-white/20 rounded px-2 py-1 flex items-center gap-1">
            <Scissors className="h-3 w-3 text-white" />
            <span className="text-xs text-white">Double-click to split</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default TimelineClip;

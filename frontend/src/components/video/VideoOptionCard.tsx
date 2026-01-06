import { useState, useRef } from 'react';
import { Play, Pause, Check, RefreshCw, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import { VideoGenerationStatus } from './VideoGenerationStatus';
import type { VideoOption } from '../../types';

interface VideoOptionCardProps {
  video: VideoOption;
  isSelected: boolean;
  onSelect: () => void;
  onRetry?: () => void;
}

export function VideoOptionCard({ video, isSelected, onSelect, onRetry }: VideoOptionCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const handlePlayPause = () => {
    if (!videoRef.current || !video.storageUrl) return;

    if (isPlaying) {
      videoRef.current.pause();
    } else {
      videoRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleVideoEnd = () => {
    setIsPlaying(false);
  };

  // Loading/generating state
  if (video.status === 'queued' || video.status === 'in_progress') {
    return (
      <div className="aspect-[9/16] rounded-lg border-2 border-dashed border-gray-300 bg-gray-50 flex flex-col items-center justify-center p-4 dark:border-gray-700 dark:bg-gray-800/50">
        <VideoGenerationStatus status={video.status} progress={video.progress} />
        <p className="mt-2 text-xs text-gray-500 text-center">
          Option {video.optionIndex + 1}
        </p>
      </div>
    );
  }

  // Failed state
  if (video.status === 'failed') {
    return (
      <div className="aspect-[9/16] rounded-lg border-2 border-dashed border-red-300 bg-red-50 flex flex-col items-center justify-center p-4 dark:border-red-700 dark:bg-red-900/20">
        <AlertCircle className="h-8 w-8 text-red-500 mb-2" />
        <p className="text-sm text-red-600 text-center mb-2">Generation failed</p>
        {video.errorMessage && (
          <p className="text-xs text-red-500 text-center mb-3">{video.errorMessage}</p>
        )}
        {onRetry && (
          <button
            onClick={onRetry}
            className="flex items-center gap-1 text-sm text-red-600 hover:text-red-700"
          >
            <RefreshCw className="h-3 w-3" />
            Retry
          </button>
        )}
      </div>
    );
  }

  // Completed state with video
  return (
    <div
      className={clsx(
        'relative aspect-[9/16] rounded-lg overflow-hidden cursor-pointer transition-all',
        isSelected
          ? 'border-4 border-green-500 ring-4 ring-green-500/50 shadow-lg shadow-green-500/30'
          : 'border-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600'
      )}
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => {
        setIsHovering(false);
        if (isPlaying && videoRef.current) {
          videoRef.current.pause();
          setIsPlaying(false);
        }
      }}
      onClick={onSelect}
    >
      {/* Video */}
      {video.storageUrl ? (
        <video
          ref={videoRef}
          src={video.storageUrl}
          className="h-full w-full object-cover"
          loop
          muted
          playsInline
          onEnded={handleVideoEnd}
        />
      ) : (
        <div className="h-full w-full bg-gray-200 dark:bg-gray-700" />
      )}

      {/* Overlay */}
      <div
        className={clsx(
          'absolute inset-0 bg-black/40 transition-opacity flex items-center justify-center',
          isHovering || isSelected ? 'opacity-100' : 'opacity-0'
        )}
      >
        {/* Play/Pause button */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            handlePlayPause();
          }}
          className="rounded-full bg-white/90 p-3 text-gray-900 hover:bg-white transition-colors"
        >
          {isPlaying ? (
            <Pause className="h-6 w-6" />
          ) : (
            <Play className="h-6 w-6 ml-0.5" />
          )}
        </button>
      </div>

      {/* Selection indicator */}
      {isSelected && (
        <div className="absolute top-2 right-2 rounded-full bg-green-500 p-1.5 shadow-lg">
          <Check className="h-5 w-5 text-white" strokeWidth={3} />
        </div>
      )}

      {/* Option number */}
      <div className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-xs text-white">
        Option {video.optionIndex + 1}
      </div>

      {/* Duration */}
      <div className="absolute bottom-2 right-2 rounded bg-black/60 px-2 py-1 text-xs text-white">
        {video.duration}s
      </div>
    </div>
  );
}

export default VideoOptionCard;

import { VideoOptionCard } from './VideoOptionCard';
import type { VideoOption } from '../../types';

interface VideoOptionsGridProps {
  videos: VideoOption[];
  selectedVideoId: string | null;
  onSelect: (videoId: string) => void;
  onRetry?: (videoId: string) => void;
}

export function VideoOptionsGrid({
  videos,
  selectedVideoId,
  onSelect,
  onRetry,
}: VideoOptionsGridProps) {
  // Sort by option index
  const sortedVideos = [...videos].sort((a, b) => a.optionIndex - b.optionIndex);

  return (
    <div className="grid grid-cols-3 gap-3">
      {sortedVideos.map((video) => (
        <VideoOptionCard
          key={video.id}
          video={video}
          isSelected={video.id === selectedVideoId}
          onSelect={() => onSelect(video.id)}
          onRetry={onRetry ? () => onRetry(video.id) : undefined}
        />
      ))}

      {/* Placeholder if less than 3 options */}
      {sortedVideos.length < 3 &&
        Array.from({ length: 3 - sortedVideos.length }).map((_, i) => (
          <div
            key={`placeholder-${i}`}
            className="aspect-[9/16] rounded-lg border-2 border-dashed border-gray-200 bg-gray-50 flex items-center justify-center dark:border-gray-700 dark:bg-gray-800/30"
          >
            <span className="text-sm text-gray-400">Generating...</span>
          </div>
        ))}
    </div>
  );
}

export default VideoOptionsGrid;

import { useEffect, useState } from 'react';
import { Video, Play, ChevronRight, RefreshCw } from 'lucide-react';
import { useProject, useToast, useWebSocket } from '../../context';
import { Button } from '../common/Button';
import { Loader } from '../common/Loader';
import { VideoOptionsGrid } from './VideoOptionsGrid';
import { BatchGenerationStatus } from './VideoGenerationStatus';
import type { ScriptLine, VideoOption, VideoGenerationUpdate } from '../../types';

interface VideoSelectionProps {
  onContinue?: () => void;
}

export function VideoSelection({ onContinue }: VideoSelectionProps) {
  const {
    currentProject,
    scriptLines,
    videos,
    loading,
    generateAllVideos,
    generateVideos,
    selectVideo,
    handleVideoUpdate,
  } = useProject();
  const { onVideoGenerationUpdate } = useWebSocket();
  const { success, error: showError } = useToast();
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  // Subscribe to real-time video generation updates
  useEffect(() => {
    const unsubscribe = onVideoGenerationUpdate((update: VideoGenerationUpdate) => {
      if (update.projectId === currentProject?.id) {
        handleVideoUpdate(update);
      }
    });

    return unsubscribe;
  }, [currentProject?.id, onVideoGenerationUpdate, handleVideoUpdate]);

  // Auto-select first line
  useEffect(() => {
    if (scriptLines.length > 0 && !selectedLineId) {
      // Select first line that needs video selection
      const lineNeedingSelection = scriptLines.find(
        (line) => !line.selectedVideoId && (!line.groupId || line.isGroupLeader)
      );
      setSelectedLineId(lineNeedingSelection?.id || scriptLines[0].id);
    }
  }, [scriptLines, selectedLineId]);

  const handleGenerateAll = async () => {
    setIsGenerating(true);
    try {
      await generateAllVideos();
      success('Video generation started for all lines');
    } catch {
      showError('Failed to start video generation');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateForLine = async (lineId: string) => {
    try {
      await generateVideos(lineId);
      success('Video generation started');
    } catch {
      showError('Failed to generate videos');
    }
  };

  const handleSelectVideo = async (lineId: string, videoId: string) => {
    try {
      await selectVideo(lineId, videoId);
      success('Video selected');

      // Move to next line that needs selection
      const currentIndex = scriptLines.findIndex((l) => l.id === lineId);
      const nextLine = scriptLines.slice(currentIndex + 1).find(
        (line) => !line.selectedVideoId && (!line.groupId || line.isGroupLeader)
      );
      if (nextLine) {
        setSelectedLineId(nextLine.id);
      }
    } catch {
      showError('Failed to select video');
    }
  };

  // Calculate generation stats
  const allVideos = Array.from(videos.values()).flat();
  const stats = {
    total: allVideos.length,
    completed: allVideos.filter((v) => v.status === 'completed').length,
    failed: allVideos.filter((v) => v.status === 'failed').length,
    inProgress: allVideos.filter((v) => v.status === 'in_progress').length,
  };

  // Filter lines to only show leaders (for combined groups)
  const displayLines = scriptLines.filter(
    (line) => !line.groupId || line.isGroupLeader
  );

  // Check if all videos are selected
  const allVideosSelected = displayLines.every((line) => line.selectedVideoId);
  const hasAnyVideos = allVideos.length > 0;

  // Get currently selected line
  const selectedLine = scriptLines.find((l) => l.id === selectedLineId);
  const selectedLineVideos = selectedLineId ? videos.get(selectedLineId) || [] : [];

  if (scriptLines.length === 0) {
    return (
      <div className="text-center py-12">
        <Video className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Generate Script First
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          You need to generate a script before creating videos.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left panel - Script lines */}
      <div className="lg:col-span-1 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-gray-900 dark:text-white">Script Lines</h3>
          {!hasAnyVideos && (
            <Button
              size="sm"
              onClick={handleGenerateAll}
              loading={isGenerating}
            >
              Generate All
            </Button>
          )}
        </div>

        {/* Generation progress */}
        {hasAnyVideos && stats.total > 0 && stats.completed < stats.total && (
          <BatchGenerationStatus {...stats} />
        )}

        {/* Line list */}
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {displayLines.map((line, index) => {
            const lineVideos = videos.get(line.id) || [];
            const hasVideos = lineVideos.length > 0;
            const allCompleted = lineVideos.length === 3 && lineVideos.every((v) => v.status === 'completed');
            const hasSelection = !!line.selectedVideoId;
            const isSelected = selectedLineId === line.id;

            // Get combined lines if this is a group leader
            const combinedLines = line.groupId
              ? scriptLines.filter((l) => l.groupId === line.groupId)
              : [line];

            return (
              <button
                key={line.id}
                onClick={() => setSelectedLineId(line.id)}
                className={`w-full text-left rounded-lg border p-3 transition-colors ${
                  isSelected
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                    : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
                }`}
              >
                <div className="flex items-start gap-3">
                  {/* Line number */}
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                      hasSelection
                        ? 'bg-green-100 text-green-600 dark:bg-green-900/50'
                        : allCompleted
                        ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/50'
                        : 'bg-gray-100 text-gray-600 dark:bg-gray-800'
                    }`}
                  >
                    {hasSelection ? '✓' : index + 1}
                  </span>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    {combinedLines.map((l, i) => (
                      <p
                        key={l.id}
                        className={`text-sm ${
                          i > 0 ? 'mt-1 pt-1 border-t border-gray-100 dark:border-gray-800' : ''
                        } ${isSelected ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}
                      >
                        {l.text}
                      </p>
                    ))}

                    {/* Status */}
                    <div className="mt-2 flex items-center gap-2 text-xs">
                      {!hasVideos ? (
                        <span className="text-gray-400">No videos</span>
                      ) : !allCompleted ? (
                        <span className="text-blue-500">Generating...</span>
                      ) : !hasSelection ? (
                        <span className="text-orange-500">Select a video</span>
                      ) : (
                        <span className="text-green-500">Video selected</span>
                      )}
                    </div>
                  </div>

                  <ChevronRight className={`h-4 w-4 shrink-0 ${isSelected ? 'text-primary-500' : 'text-gray-400'}`} />
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Right panel - Video options */}
      <div className="lg:col-span-2">
        {selectedLine ? (
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">
                  Video Options
                </h3>
                <p className="text-sm text-gray-500">
                  Select the best video for this line
                </p>
              </div>
              {selectedLineVideos.length === 0 && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => handleGenerateForLine(selectedLine.id)}
                >
                  <RefreshCw className="h-4 w-4 mr-1" />
                  Generate Videos
                </Button>
              )}
            </div>

            {/* Selected line text */}
            <div className="mb-4 rounded-lg bg-gray-100 p-4 dark:bg-gray-800">
              <p className="text-sm text-gray-700 dark:text-gray-300 italic">
                "{selectedLine.text}"
              </p>
            </div>

            {/* Video options grid */}
            {selectedLineVideos.length > 0 ? (
              <VideoOptionsGrid
                videos={selectedLineVideos}
                selectedVideoId={selectedLine.selectedVideoId || null}
                onSelect={(videoId) => handleSelectVideo(selectedLine.id, videoId)}
                onRetry={(videoId) => handleGenerateForLine(selectedLine.id)}
              />
            ) : (
              <div className="aspect-video rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center dark:border-gray-700">
                <Video className="h-12 w-12 text-gray-400 mb-4" />
                <p className="text-gray-500 mb-4">No videos generated yet</p>
                <Button onClick={() => handleGenerateForLine(selectedLine.id)}>
                  <Play className="h-4 w-4 mr-2" />
                  Generate Videos
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Select a line to view video options</p>
          </div>
        )}
      </div>

      {/* Continue button */}
      {allVideosSelected && onContinue && (
        <div className="lg:col-span-3 flex justify-end pt-4 border-t dark:border-gray-800">
          <Button onClick={onContinue}>
            Continue to Voiceover
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default VideoSelection;

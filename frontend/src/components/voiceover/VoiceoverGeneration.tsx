import { useState, useEffect } from 'react';
import { Mic, ChevronRight, RefreshCw, Check, Volume2 } from 'lucide-react';
import { useProject, useToast } from '../../context';
import { Button } from '../common/Button';
import { Loader } from '../common/Loader';
import { VoiceSettings } from './VoiceSettings';
import { VoiceoverPlayer } from './VoiceoverPlayer';
import type { VoiceoverSettings, ScriptLine, Voiceover } from '../../types';

interface VoiceoverGenerationProps {
  onContinue?: () => void;
}

export function VoiceoverGeneration({ onContinue }: VoiceoverGenerationProps) {
  const {
    currentProject,
    scriptLines,
    voiceovers,
    loading,
    generateVoiceover,
    generateAllVoiceovers,
    updateVoiceover,
  } = useProject();
  const { success, error: showError } = useToast();

  const [settings, setSettings] = useState<VoiceoverSettings>({
    voice: 'alloy',
    speed: 1.0,
    style: 'conversational',
  });
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingLineId, setGeneratingLineId] = useState<string | null>(null);

  // Filter lines to only show leaders (for combined groups)
  const displayLines = scriptLines.filter(
    (line) => !line.groupId || line.isGroupLeader
  );

  // Auto-select first line without voiceover
  useEffect(() => {
    if (displayLines.length > 0 && !selectedLineId) {
      const lineNeedingVoiceover = displayLines.find(
        (line) => !line.voiceoverId
      );
      setSelectedLineId(lineNeedingVoiceover?.id || displayLines[0].id);
    }
  }, [displayLines, selectedLineId]);

  const handleGenerateAll = async () => {
    setIsGenerating(true);
    try {
      await generateAllVoiceovers(settings);
      success('Voiceovers generated for all lines');
    } catch {
      showError('Failed to generate voiceovers');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleGenerateForLine = async (lineId: string) => {
    setGeneratingLineId(lineId);
    try {
      await generateVoiceover(lineId, settings);
      success('Voiceover generated');

      // Move to next line that needs voiceover
      const currentIndex = displayLines.findIndex((l) => l.id === lineId);
      const nextLine = displayLines.slice(currentIndex + 1).find(
        (line) => !line.voiceoverId
      );
      if (nextLine) {
        setSelectedLineId(nextLine.id);
      }
    } catch {
      showError('Failed to generate voiceover');
    } finally {
      setGeneratingLineId(null);
    }
  };

  const handleRegenerateVoiceover = async (lineId: string, voiceoverId: string) => {
    setGeneratingLineId(lineId);
    try {
      await updateVoiceover(voiceoverId, { voice: settings.voice, speed: settings.speed });
      success('Voiceover regenerated');
    } catch {
      showError('Failed to regenerate voiceover');
    } finally {
      setGeneratingLineId(null);
    }
  };

  // Check if all voiceovers are generated
  const allVoiceoversGenerated = displayLines.every((line) => line.voiceoverId);
  const hasAnyVoiceovers = displayLines.some((line) => line.voiceoverId);

  // Get currently selected line and its voiceover
  const selectedLine = displayLines.find((l) => l.id === selectedLineId);
  const selectedVoiceover = selectedLine?.voiceoverId
    ? voiceovers.get(selectedLine.id)
    : null;

  if (scriptLines.length === 0) {
    return (
      <div className="text-center py-12">
        <Mic className="h-12 w-12 text-gray-400 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Generate Script First
        </h3>
        <p className="text-gray-600 dark:text-gray-400">
          You need to generate a script before creating voiceovers.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left panel - Voice settings */}
      <div className="lg:col-span-1 space-y-6">
        <div className="rounded-lg border bg-white p-4 dark:bg-gray-900 dark:border-gray-800">
          <h3 className="font-medium text-gray-900 dark:text-white mb-4">
            Voice Settings
          </h3>
          <VoiceSettings
            settings={settings}
            onChange={setSettings}
            disabled={isGenerating}
          />

          {!hasAnyVoiceovers && (
            <Button
              className="w-full mt-6"
              onClick={handleGenerateAll}
              loading={isGenerating}
            >
              <Volume2 className="h-4 w-4 mr-2" />
              Generate All Voiceovers
            </Button>
          )}
        </div>

        {/* Line list */}
        <div>
          <h3 className="font-medium text-gray-900 dark:text-white mb-3">
            Script Lines
          </h3>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {displayLines.map((line, index) => {
              const hasVoiceover = !!line.voiceoverId;
              const isSelected = selectedLineId === line.id;
              const isLineGenerating = generatingLineId === line.id;

              return (
                <button
                  key={line.id}
                  onClick={() => setSelectedLineId(line.id)}
                  className={`w-full text-left rounded-lg border p-3 transition-colors ${
                    isSelected
                      ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                      : 'border-gray-200 hover:border-gray-300 dark:border-gray-700'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                        hasVoiceover
                          ? 'bg-green-100 text-green-600 dark:bg-green-900/50'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800'
                      }`}
                    >
                      {isLineGenerating ? (
                        <Loader size="sm" />
                      ) : hasVoiceover ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        index + 1
                      )}
                    </span>
                    <span className="text-sm text-gray-600 dark:text-gray-400 line-clamp-1 flex-1">
                      {line.text}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right panel - Voiceover player & generation */}
      <div className="lg:col-span-2">
        {selectedLine ? (
          <div className="space-y-6">
            {/* Selected line text */}
            <div className="rounded-lg bg-gray-100 p-4 dark:bg-gray-800">
              <p className="text-gray-700 dark:text-gray-300">
                "{selectedLine.text}"
              </p>
            </div>

            {/* Voiceover player or generate button */}
            {selectedVoiceover?.storageUrl ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-gray-900 dark:text-white">
                    Generated Voiceover
                  </h4>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        handleRegenerateVoiceover(
                          selectedLine.id,
                          selectedVoiceover.id
                        )
                      }
                      loading={generatingLineId === selectedLine.id}
                    >
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Regenerate
                    </Button>
                  </div>
                </div>

                <VoiceoverPlayer
                  audioUrl={selectedVoiceover.storageUrl}
                  duration={selectedVoiceover.duration}
                />

                {/* Voiceover info */}
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                    <div className="text-gray-500">Voice</div>
                    <div className="font-medium text-gray-900 dark:text-white capitalize">
                      {selectedVoiceover.voice}
                    </div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                    <div className="text-gray-500">Speed</div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {selectedVoiceover.speed.toFixed(1)}x
                    </div>
                  </div>
                  <div className="rounded-lg bg-gray-50 p-3 dark:bg-gray-800">
                    <div className="text-gray-500">Duration</div>
                    <div className="font-medium text-gray-900 dark:text-white">
                      {selectedVoiceover.duration.toFixed(1)}s
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border-2 border-dashed border-gray-300 py-12 text-center dark:border-gray-700">
                <Mic className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h4 className="font-medium text-gray-900 dark:text-white mb-2">
                  No Voiceover Generated
                </h4>
                <p className="text-sm text-gray-500 mb-4">
                  Generate a voiceover using the settings on the left
                </p>
                <Button
                  onClick={() => handleGenerateForLine(selectedLine.id)}
                  loading={generatingLineId === selectedLine.id}
                >
                  <Mic className="h-4 w-4 mr-2" />
                  Generate Voiceover
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-500">Select a line to manage its voiceover</p>
          </div>
        )}
      </div>

      {/* Continue button */}
      {allVoiceoversGenerated && onContinue && (
        <div className="lg:col-span-3 flex justify-end pt-4 border-t dark:border-gray-800">
          <Button onClick={onContinue}>
            Continue to Video Editor
            <ChevronRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      )}
    </div>
  );
}

export default VoiceoverGeneration;

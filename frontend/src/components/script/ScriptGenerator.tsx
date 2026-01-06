import { useState } from 'react';
import { Sparkles, RefreshCw, Link, Unlink, ChevronRight } from 'lucide-react';
import { useProject, useToast } from '../../context';
import { Button } from '../common/Button';
import { Loader } from '../common/Loader';
import type { ScriptLine } from '../../types';

interface ScriptGeneratorProps {
  onContinue?: () => void;
}

export function ScriptGenerator({ onContinue }: ScriptGeneratorProps) {
  const {
    currentProject,
    scriptLines,
    loading,
    generateScript,
    updateScriptLine,
    regenerateScriptLine,
    combineLines,
    splitLines,
  } = useProject();
  const { success, error: showError } = useToast();
  const [editingLine, setEditingLine] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [regeneratingLine, setRegeneratingLine] = useState<string | null>(null);
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());

  const handleGenerate = async () => {
    try {
      await generateScript();
      success('Script generated successfully');
    } catch {
      showError('Failed to generate script');
    }
  };

  const handleEditStart = (line: ScriptLine) => {
    setEditingLine(line.id);
    setEditText(line.text);
  };

  const handleEditSave = async (lineId: string) => {
    if (!editText.trim()) return;

    try {
      await updateScriptLine(lineId, editText);
      setEditingLine(null);
      success('Line updated');
    } catch {
      showError('Failed to update line');
    }
  };

  const handleRegenerate = async (lineId: string) => {
    setRegeneratingLine(lineId);
    try {
      await regenerateScriptLine(lineId);
      success('Line regenerated');
    } catch {
      showError('Failed to regenerate line');
    } finally {
      setRegeneratingLine(null);
    }
  };

  const handleSelectLine = (lineId: string) => {
    const newSelected = new Set(selectedLines);
    if (newSelected.has(lineId)) {
      newSelected.delete(lineId);
    } else {
      newSelected.add(lineId);
    }
    setSelectedLines(newSelected);
  };

  const handleCombine = async () => {
    if (selectedLines.size < 2) {
      showError('Select at least 2 lines to combine');
      return;
    }

    try {
      await combineLines(Array.from(selectedLines));
      setSelectedLines(new Set());
      success('Lines combined');
    } catch {
      showError('Failed to combine lines');
    }
  };

  const handleSplit = async (groupId: string) => {
    try {
      await splitLines(groupId);
      success('Lines split');
    } catch {
      showError('Failed to split lines');
    }
  };

  // No script yet
  if (scriptLines.length === 0) {
    return (
      <div className="text-center py-12">
        <Sparkles className="h-12 w-12 text-primary-500 mx-auto mb-4" />
        <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
          Generate Your Script
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
          Create a punchy, attention-grabbing script for your "{currentProject?.title}" video using AI.
        </p>
        <Button onClick={handleGenerate} loading={loading} size="lg">
          <Sparkles className="h-4 w-4 mr-2" />
          Generate Script
        </Button>
      </div>
    );
  }

  // Group lines by groupId for combined lines
  const groupedLines = scriptLines.reduce((acc, line) => {
    const key = line.groupId || line.id;
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(line);
    return acc;
  }, {} as Record<string, ScriptLine[]>);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">
            Script
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {scriptLines.length} lines • {currentProject?.duration}s video
          </p>
        </div>
        <div className="flex gap-2">
          {selectedLines.size >= 2 && (
            <Button variant="outline" size="sm" onClick={handleCombine}>
              <Link className="h-4 w-4 mr-1" />
              Combine ({selectedLines.size})
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleGenerate} loading={loading}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Regenerate All
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {Object.entries(groupedLines).map(([groupKey, lines]) => {
          const isGroup = lines.length > 1;
          const leader = lines.find((l) => l.isGroupLeader) || lines[0];

          if (isGroup) {
            // Render combined group
            return (
              <div
                key={groupKey}
                className="rounded-lg border-2 border-dashed border-primary-300 bg-primary-50/50 p-4 dark:border-primary-700 dark:bg-primary-900/20"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-primary-600 dark:text-primary-400">
                    Combined Lines ({lines.length})
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSplit(leader.groupId!)}
                    className="text-xs"
                  >
                    <Unlink className="h-3 w-3 mr-1" />
                    Split
                  </Button>
                </div>
                <div className="space-y-2">
                  {lines.map((line) => (
                    <div
                      key={line.id}
                      className="rounded bg-white p-3 dark:bg-gray-900"
                    >
                      <span className="text-sm text-gray-700 dark:text-gray-300">
                        {line.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          }

          // Render single line
          const line = lines[0];
          const isEditing = editingLine === line.id;
          const isRegenerating = regeneratingLine === line.id;
          const isSelected = selectedLines.has(line.id);

          return (
            <div
              key={line.id}
              className={`group rounded-lg border p-4 transition-colors ${
                isSelected
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Selection checkbox */}
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => handleSelectLine(line.id)}
                  className="mt-1 h-4 w-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500"
                />

                {/* Line number */}
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                  {line.order + 1}
                </span>

                {/* Content */}
                <div className="flex-1">
                  {isEditing ? (
                    <div className="space-y-2">
                      <textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        className="textarea min-h-[60px]"
                        autoFocus
                      />
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={() => handleEditSave(line.id)}
                        >
                          Save
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setEditingLine(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <p
                      className="text-gray-900 dark:text-white cursor-pointer"
                      onClick={() => handleEditStart(line)}
                    >
                      {line.text}
                    </p>
                  )}
                </div>

                {/* Actions */}
                {!isEditing && (
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleRegenerate(line.id)}
                      disabled={isRegenerating}
                      className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800"
                      title="Regenerate"
                    >
                      {isRegenerating ? (
                        <Loader size="sm" />
                      ) : (
                        <RefreshCw className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Duration indicator */}
              <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
                <span>~{line.estimatedDuration ?? 0}s</span>
                {line.selectedVideoId && (
                  <span className="text-green-600">Video selected</span>
                )}
                {line.voiceoverId && (
                  <span className="text-blue-600">Voiceover ready</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Next Step Button */}
      <div className="mt-8 flex justify-end">
        <Button
          disabled={scriptLines.length === 0}
          onClick={onContinue}
        >
          Continue to Video Generation
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

export default ScriptGenerator;

import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ChevronUp, Type, Clock } from 'lucide-react';
import { clsx } from 'clsx';
import { useEditor } from '../../context/EditorContext';
import type { SubtitleItem as SubtitleItemType } from '../../context/EditorContext';
import { Button } from '../common/Button';

const SUBTITLE_PRESETS = [
  {
    id: 'default',
    name: 'Default',
    style: { color: '#ffffff', fontSize: 24, fontWeight: 'bold' as const },
  },
  {
    id: 'yellow',
    name: 'Yellow Pop',
    style: { color: '#fbbf24', fontSize: 28, fontWeight: 'bold' as const },
  },
  {
    id: 'gradient',
    name: 'Gradient',
    style: { color: '#a855f7', fontSize: 26, fontWeight: 'bold' as const },
  },
  {
    id: 'minimal',
    name: 'Minimal',
    style: { color: '#ffffff', fontSize: 20, fontWeight: 'normal' as const },
  },
  {
    id: 'bold',
    name: 'Bold Impact',
    style: { color: '#ffffff', fontSize: 32, fontWeight: 'bold' as const },
  },
];

export function SubtitleEditor() {
  const { state, addSubtitle, updateSubtitle, removeSubtitle, setPlayhead } = useEditor();

  const [expandedSubtitle, setExpandedSubtitle] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState('default');

  const handleAddSubtitle = () => {
    const startTime = state.playhead;
    const endTime = Math.min(startTime + 3, state.duration);

    const preset = SUBTITLE_PRESETS.find((p) => p.id === selectedPreset) || SUBTITLE_PRESETS[0];

    addSubtitle({
      text: 'New subtitle',
      startTime,
      endTime,
      style: preset.style,
    });
  };

  const handleTimeChange = (
    subtitleId: string,
    field: 'startTime' | 'endTime',
    value: string
  ) => {
    const time = parseTimeInput(value);
    if (time !== null) {
      updateSubtitle(subtitleId, { [field]: time });
    }
  };

  const parseTimeInput = (value: string): number | null => {
    // Parse MM:SS.ms format
    const match = value.match(/^(\d+):(\d{2})(?:\.(\d))?$/);
    if (match) {
      const mins = parseInt(match[1], 10);
      const secs = parseInt(match[2], 10);
      const ms = match[3] ? parseInt(match[3], 10) / 10 : 0;
      return mins * 60 + secs + ms;
    }
    // Try parsing as number
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 10);
    return `${mins}:${secs.toString().padStart(2, '0')}.${ms}`;
  };

  const sortedSubtitles = [...state.subtitles].sort((a, b) => a.startTime - b.startTime);

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-900 rounded-lg border dark:border-gray-800">
      {/* Header */}
      <div className="p-4 border-b dark:border-gray-800">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Type className="h-5 w-5" />
            Subtitles
          </h3>
          <span className="text-sm text-gray-500">{state.subtitles.length} items</span>
        </div>

        {/* Preset selector */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Style Preset
          </label>
          <div className="grid grid-cols-5 gap-2">
            {SUBTITLE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={() => setSelectedPreset(preset.id)}
                className={clsx(
                  'p-2 rounded border text-xs font-medium transition-colors',
                  selectedPreset === preset.id
                    ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20 text-primary-600'
                    : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
                )}
              >
                <div
                  className="w-full h-4 rounded mb-1"
                  style={{ backgroundColor: preset.style.color }}
                />
                {preset.name}
              </button>
            ))}
          </div>
        </div>

        <Button onClick={handleAddSubtitle} className="w-full" variant="outline">
          <Plus className="h-4 w-4 mr-2" />
          Add Subtitle at Playhead
        </Button>
      </div>

      {/* Subtitle list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {sortedSubtitles.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Type className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>No subtitles yet</p>
            <p className="text-sm mt-1">Add subtitles to enhance your video</p>
          </div>
        ) : (
          sortedSubtitles.map((subtitle, index) => (
            <SubtitleItem
              key={subtitle.id}
              subtitle={subtitle}
              index={index}
              isExpanded={expandedSubtitle === subtitle.id}
              onToggleExpand={() =>
                setExpandedSubtitle(expandedSubtitle === subtitle.id ? null : subtitle.id)
              }
              onUpdate={(updates) => updateSubtitle(subtitle.id, updates)}
              onDelete={() => removeSubtitle(subtitle.id)}
              onSeek={() => setPlayhead(subtitle.startTime)}
              formatTime={formatTime}
              onTimeChange={(field, value) => handleTimeChange(subtitle.id, field, value)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface SubtitleItemProps {
  subtitle: SubtitleItemType;
  index: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (updates: Partial<SubtitleItemType>) => void;
  onDelete: () => void;
  onSeek: () => void;
  formatTime: (seconds: number) => string;
  onTimeChange: (field: 'startTime' | 'endTime', value: string) => void;
}

function SubtitleItem({
  subtitle,
  index,
  isExpanded,
  onToggleExpand,
  onUpdate,
  onDelete,
  onSeek,
  formatTime,
  onTimeChange,
}: SubtitleItemProps) {
  return (
    <div className="rounded-lg border dark:border-gray-700 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 cursor-pointer"
        onClick={onToggleExpand}
      >
        <span className="flex h-6 w-6 items-center justify-center rounded bg-gray-200 dark:bg-gray-700 text-xs font-medium">
          {index + 1}
        </span>
        <span className="flex-1 text-sm truncate text-gray-900 dark:text-white">
          {subtitle.text}
        </span>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSeek();
          }}
          className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          title="Jump to subtitle"
        >
          <Clock className="h-4 w-4 text-gray-500" />
        </button>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-gray-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gray-500" />
        )}
      </div>

      {/* Expanded content */}
      {isExpanded && (
        <div className="p-3 space-y-3 border-t dark:border-gray-700">
          {/* Text input */}
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Text</label>
            <textarea
              value={subtitle.text}
              onChange={(e) => onUpdate({ text: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm resize-none"
              rows={2}
            />
          </div>

          {/* Time inputs */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Start</label>
              <input
                type="text"
                defaultValue={formatTime(subtitle.startTime)}
                onBlur={(e) => onTimeChange('startTime', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono"
                placeholder="0:00.0"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">End</label>
              <input
                type="text"
                defaultValue={formatTime(subtitle.endTime)}
                onBlur={(e) => onTimeChange('endTime', e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm font-mono"
                placeholder="0:00.0"
              />
            </div>
          </div>

          {/* Style options */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Color</label>
              <input
                type="color"
                value={subtitle.style?.color || '#ffffff'}
                onChange={(e) =>
                  onUpdate({ style: { ...subtitle.style, color: e.target.value } })
                }
                className="w-full h-8 rounded cursor-pointer"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Size</label>
              <select
                value={subtitle.style?.fontSize || 24}
                onChange={(e) =>
                  onUpdate({ style: { ...subtitle.style, fontSize: parseInt(e.target.value) } })
                }
                className="w-full px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-sm"
              >
                <option value={16}>Small</option>
                <option value={24}>Medium</option>
                <option value={32}>Large</option>
                <option value={40}>Extra Large</option>
              </select>
            </div>
          </div>

          {/* Delete button */}
          <Button
            variant="outline"
            size="sm"
            onClick={onDelete}
            className="w-full text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Delete Subtitle
          </Button>
        </div>
      )}
    </div>
  );
}

export default SubtitleEditor;

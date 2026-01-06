import { useState, useRef } from 'react';
import { Volume2, Play, Pause, Loader2 } from 'lucide-react';
import * as Slider from '@radix-ui/react-slider';
import { Button } from '../common/Button';
import { voiceoversApi } from '../../api';
import type { VoiceId, VoiceStyle, VoiceoverSettings } from '../../types';

interface VoiceSettingsProps {
  settings: VoiceoverSettings;
  onChange: (settings: VoiceoverSettings) => void;
  disabled?: boolean;
}

const voices: { id: VoiceId; name: string; description: string }[] = [
  { id: 'alloy', name: 'Alloy', description: 'Neutral and balanced' },
  { id: 'echo', name: 'Echo', description: 'Warm and smooth' },
  { id: 'fable', name: 'Fable', description: 'Expressive and dynamic' },
  { id: 'onyx', name: 'Onyx', description: 'Deep and authoritative' },
  { id: 'nova', name: 'Nova', description: 'Bright and energetic' },
  { id: 'shimmer', name: 'Shimmer', description: 'Clear and melodic' },
];

const styles: { id: VoiceStyle; name: string; description: string }[] = [
  { id: 'energetic', name: 'Energetic', description: 'High energy, fast-paced delivery' },
  { id: 'conversational', name: 'Conversational', description: 'Natural, friendly tone' },
  { id: 'dramatic', name: 'Dramatic', description: 'Suspenseful with dramatic pauses' },
  { id: 'custom', name: 'Custom', description: 'Use default voice settings' },
];

export function VoiceSettings({ settings, onChange, disabled }: VoiceSettingsProps) {
  const [previewPlaying, setPreviewPlaying] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handleVoiceChange = (voice: VoiceId) => {
    onChange({ ...settings, voice });
  };

  const handleStyleChange = (style: VoiceStyle) => {
    onChange({ ...settings, style });
  };

  const handleSpeedChange = (value: number[]) => {
    onChange({ ...settings, speed: value[0] });
  };

  const handlePreviewVoice = async (voice: VoiceId, e: React.MouseEvent) => {
    e.stopPropagation();

    // Stop any currently playing preview
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    if (previewPlaying === voice) {
      setPreviewPlaying(null);
      return;
    }

    setPreviewLoading(voice);
    try {
      const audioBlob = await voiceoversApi.preview(voice, settings.speed);
      const audioUrl = URL.createObjectURL(audioBlob);
      const audio = new Audio(audioUrl);
      audioRef.current = audio;

      audio.onended = () => {
        setPreviewPlaying(null);
        URL.revokeObjectURL(audioUrl);
      };

      audio.onplay = () => {
        setPreviewPlaying(voice);
        setPreviewLoading(null);
      };

      audio.onerror = () => {
        setPreviewPlaying(null);
        setPreviewLoading(null);
      };

      await audio.play();
    } catch (error) {
      console.error('Failed to preview voice:', error);
      setPreviewLoading(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Voice Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Voice
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {voices.map((voice) => (
            <button
              key={voice.id}
              onClick={() => handleVoiceChange(voice.id)}
              disabled={disabled}
              className={`relative rounded-lg border p-3 text-left transition-colors ${
                settings.voice === voice.id
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-900 dark:text-white">
                    {voice.name}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{voice.description}</div>
                </div>
                <button
                  onClick={(e) => handlePreviewVoice(voice.id, e)}
                  disabled={disabled || previewLoading !== null}
                  className={`ml-2 p-1.5 rounded-full transition-colors ${
                    previewPlaying === voice.id
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-600 dark:text-gray-300'
                  }`}
                  title="Preview voice"
                >
                  {previewLoading === voice.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : previewPlaying === voice.id ? (
                    <Pause className="h-3.5 w-3.5" />
                  ) : (
                    <Play className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Style Selection */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
          Style
        </label>
        <div className="grid grid-cols-2 gap-2">
          {styles.map((style) => (
            <button
              key={style.id}
              onClick={() => handleStyleChange(style.id)}
              disabled={disabled}
              className={`rounded-lg border p-3 text-left transition-colors ${
                settings.style === style.id
                  ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
                  : 'border-gray-200 hover:border-gray-300 dark:border-gray-700 dark:hover:border-gray-600'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <div className="font-medium text-sm text-gray-900 dark:text-white">
                {style.name}
              </div>
              <div className="text-xs text-gray-500">{style.description}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Speed Slider */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Speed
          </label>
          <span className="text-sm text-gray-500">{settings.speed.toFixed(1)}x</span>
        </div>
        <Slider.Root
          className="relative flex items-center select-none touch-none w-full h-5"
          value={[settings.speed]}
          onValueChange={handleSpeedChange}
          min={0.5}
          max={2.0}
          step={0.1}
          disabled={disabled}
        >
          <Slider.Track className="bg-gray-200 dark:bg-gray-700 relative grow rounded-full h-2">
            <Slider.Range className="absolute bg-primary-500 rounded-full h-full" />
          </Slider.Track>
          <Slider.Thumb
            className="block w-5 h-5 bg-white border-2 border-primary-500 rounded-full shadow-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500"
            aria-label="Speed"
          />
        </Slider.Root>
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>0.5x</span>
          <span>1.0x</span>
          <span>1.5x</span>
          <span>2.0x</span>
        </div>
      </div>
    </div>
  );
}

export default VoiceSettings;

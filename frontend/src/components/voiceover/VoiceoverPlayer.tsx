import { useEffect, useRef, useState } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import * as Slider from '@radix-ui/react-slider';

interface VoiceoverPlayerProps {
  audioUrl: string;
  duration: number;
  onEnded?: () => void;
}

export function VoiceoverPlayer({ audioUrl, duration, onEnded }: VoiceoverPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const handleTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
    };

    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
      onEnded?.();
    };

    const handleLoadedData = () => {
      setIsLoaded(true);
    };

    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleEnded);
    audio.addEventListener('loadeddata', handleLoadedData);

    return () => {
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleEnded);
      audio.removeEventListener('loadeddata', handleLoadedData);
    };
  }, [onEnded]);

  // Reset when URL changes
  useEffect(() => {
    setIsPlaying(false);
    setCurrentTime(0);
    setIsLoaded(false);
  }, [audioUrl]);

  const togglePlayPause = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (value: number[]) => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = value[0];
    setCurrentTime(value[0]);
  };

  const handleRestart = () => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.currentTime = 0;
    setCurrentTime(0);
    audio.play();
    setIsPlaying(true);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Generate fake waveform bars for visualization
  const waveformBars = 50;
  const progress = duration > 0 ? currentTime / duration : 0;

  return (
    <div className="rounded-lg border bg-gray-50 p-4 dark:bg-gray-800 dark:border-gray-700">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      {/* Waveform visualization */}
      <div className="mb-4 flex items-center justify-center gap-0.5 h-16">
        {Array.from({ length: waveformBars }).map((_, i) => {
          const height = 20 + Math.sin(i * 0.5) * 15 + Math.random() * 20;
          const isActive = i / waveformBars <= progress;
          return (
            <div
              key={i}
              className={`w-1 rounded-full transition-colors ${
                isActive ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'
              }`}
              style={{ height: `${height}%` }}
            />
          );
        })}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-4">
        {/* Play/Pause button */}
        <button
          onClick={togglePlayPause}
          disabled={!isLoaded}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-500 text-white hover:bg-primary-600 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPlaying ? (
            <Pause className="h-5 w-5" />
          ) : (
            <Play className="h-5 w-5 ml-0.5" />
          )}
        </button>

        {/* Restart button */}
        <button
          onClick={handleRestart}
          disabled={!isLoaded}
          className="flex h-8 w-8 items-center justify-center rounded-full text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50"
        >
          <RotateCcw className="h-4 w-4" />
        </button>

        {/* Progress slider */}
        <div className="flex-1">
          <Slider.Root
            className="relative flex items-center select-none touch-none w-full h-5"
            value={[currentTime]}
            onValueChange={handleSeek}
            max={duration}
            step={0.1}
            disabled={!isLoaded}
          >
            <Slider.Track className="bg-gray-200 dark:bg-gray-600 relative grow rounded-full h-1.5">
              <Slider.Range className="absolute bg-primary-500 rounded-full h-full" />
            </Slider.Track>
            <Slider.Thumb
              className="block w-3 h-3 bg-primary-500 rounded-full shadow hover:bg-primary-600 focus:outline-none"
              aria-label="Progress"
            />
          </Slider.Root>
        </div>

        {/* Time display */}
        <div className="text-sm text-gray-500 dark:text-gray-400 tabular-nums w-20 text-right">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>
    </div>
  );
}

export default VoiceoverPlayer;

import OpenAI from 'openai';
import { openaiConfig } from '../config';

const openai = new OpenAI({
  apiKey: openaiConfig.apiKey,
});

export type VoiceId = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
export type VoiceStyle = 'energetic' | 'conversational' | 'dramatic' | 'custom';

interface TTSOptions {
  voice: VoiceId;
  speed: number;
  style: VoiceStyle;
}

// Style modifiers for voice delivery
const VOICE_STYLES: Record<VoiceStyle, { speedModifier: number; emphasis: string }> = {
  energetic: { speedModifier: 1.1, emphasis: 'high energy, enthusiastic' },
  conversational: { speedModifier: 1.0, emphasis: 'natural, friendly' },
  dramatic: { speedModifier: 0.95, emphasis: 'suspenseful, dramatic pauses' },
  custom: { speedModifier: 1.0, emphasis: '' },
};

export interface TTSResult {
  audioBuffer: Buffer;
  duration: number;
}

export async function generateSpeech(
  text: string,
  options: TTSOptions
): Promise<TTSResult> {
  const styleConfig = VOICE_STYLES[options.style];
  const finalSpeed = Math.min(4.0, Math.max(0.25, options.speed * styleConfig.speedModifier));

  // For dramatic style, add natural pauses
  let processedText = text;
  if (options.style === 'dramatic') {
    // Add pauses after sentences and before key words
    processedText = text
      .replace(/\. /g, '... ')
      .replace(/! /g, '!... ')
      .replace(/\? /g, '?... ');
  }

  const response = await openai.audio.speech.create({
    model: 'tts-1-hd',
    voice: options.voice,
    input: processedText,
    speed: finalSpeed,
    response_format: 'mp3',
  });

  const arrayBuffer = await response.arrayBuffer();
  const audioBuffer = Buffer.from(arrayBuffer);

  // Estimate duration based on text length and speed
  // Average speaking rate is ~150 words per minute at 1x speed
  const wordCount = text.split(/\s+/).length;
  const baseDuration = (wordCount / 150) * 60;
  const duration = baseDuration / finalSpeed;

  return {
    audioBuffer,
    duration,
  };
}

export async function generateSpeechForMultipleLines(
  lines: Array<{ id: string; text: string }>,
  options: TTSOptions
): Promise<Map<string, TTSResult>> {
  const results = new Map<string, TTSResult>();

  // Process in parallel with concurrency limit
  const concurrencyLimit = 3;
  const chunks: Array<Array<{ id: string; text: string }>> = [];

  for (let i = 0; i < lines.length; i += concurrencyLimit) {
    chunks.push(lines.slice(i, i + concurrencyLimit));
  }

  for (const chunk of chunks) {
    const chunkResults = await Promise.all(
      chunk.map(async (line) => {
        const result = await generateSpeech(line.text, options);
        return { id: line.id, result };
      })
    );

    for (const { id, result } of chunkResults) {
      results.set(id, result);
    }
  }

  return results;
}

export function getAvailableVoices(): Array<{
  id: VoiceId;
  name: string;
  description: string;
}> {
  return [
    { id: 'alloy', name: 'Alloy', description: 'Neutral and balanced' },
    { id: 'echo', name: 'Echo', description: 'Warm and smooth' },
    { id: 'fable', name: 'Fable', description: 'Expressive and dynamic' },
    { id: 'onyx', name: 'Onyx', description: 'Deep and authoritative' },
    { id: 'nova', name: 'Nova', description: 'Bright and energetic' },
    { id: 'shimmer', name: 'Shimmer', description: 'Clear and melodic' },
  ];
}

export function getAvailableStyles(): Array<{
  id: VoiceStyle;
  name: string;
  description: string;
}> {
  return [
    { id: 'energetic', name: 'Energetic', description: 'High energy, fast-paced delivery' },
    { id: 'conversational', name: 'Conversational', description: 'Natural, friendly tone' },
    { id: 'dramatic', name: 'Dramatic', description: 'Suspenseful with dramatic pauses' },
    { id: 'custom', name: 'Custom', description: 'Use default voice settings' },
  ];
}

import OpenAI from 'openai';
import { openaiConfig } from '../config';

const openai = new OpenAI({
  apiKey: openaiConfig.apiKey,
});

export interface ScriptGenerationResult {
  lines: {
    text: string;
    duration: number;
  }[];
  totalDuration: number;
}

export async function generateScript(
  title: string,
  description: string,
  targetDuration: number
): Promise<ScriptGenerationResult> {
  const prompt = `You are a viral short-form video script writer. Create a script for a ${targetDuration} second video.

Title/Hook: ${title}
Description: ${description}

Requirements:
- Write punchy, attention-grabbing content
- Each line should be 2-5 seconds when spoken
- Use short sentences and powerful words
- Include a strong hook in the first line
- Build curiosity and engagement
- End with a call to action or memorable closing

Return the script as a JSON array of objects with "text" (the line) and "duration" (estimated seconds to speak it).

Example format:
[
  {"text": "You won't believe what happens next...", "duration": 2.5},
  {"text": "This one simple trick changed everything.", "duration": 3}
]

Only return the JSON array, nothing else.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.8,
    max_tokens: 1000,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  // Parse JSON from response
  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Invalid response format');
  }

  const lines = JSON.parse(jsonMatch[0]) as Array<{ text: string; duration: number }>;
  const totalDuration = lines.reduce((sum, line) => sum + line.duration, 0);

  return { lines, totalDuration };
}

export async function regenerateLine(
  originalText: string,
  context: string[]
): Promise<string> {
  const prompt = `You are a viral short-form video script writer. Rewrite this line to be more engaging and punchy.

Original line: "${originalText}"

Context (surrounding lines for reference):
${context.join('\n')}

Requirements:
- Keep similar length and meaning
- Make it more attention-grabbing
- Use powerful, engaging language

Return ONLY the rewritten line, nothing else.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.9,
    max_tokens: 200,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  return content.trim().replace(/^["']|["']$/g, '');
}

export async function generateVideoPrompt(
  scriptText: string,
  style?: string
): Promise<string> {
  const prompt = `Generate a detailed video generation prompt for Sora based on this script line:

"${scriptText}"

${style ? `Style: ${style}` : ''}

Requirements:
- Describe the visual scene in detail
- Include camera movement suggestions
- Mention lighting and mood
- Keep it suitable for a vertical short-form video (9:16)
- Focus on engaging, dynamic visuals

Return ONLY the video generation prompt, nothing else.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.7,
    max_tokens: 300,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  return content.trim();
}

export async function improveTitle(title: string): Promise<string[]> {
  const prompt = `You are a viral content expert. Generate 3 alternative versions of this video title/hook that are more engaging and clickable:

Original: "${title}"

Requirements:
- Each alternative should be under 100 characters
- Make them punchy and attention-grabbing
- Use proven viral patterns (curiosity gaps, power words, etc.)

Return ONLY a JSON array of 3 strings, nothing else.`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4-turbo-preview',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.9,
    max_tokens: 300,
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('No response from OpenAI');
  }

  const jsonMatch = content.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return [title];
  }

  return JSON.parse(jsonMatch[0]) as string[];
}

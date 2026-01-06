import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { verifyAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../utils/responseHelper.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { NotFoundError, ForbiddenError } from '../middleware/errorHandler.js';
import { db, storage } from '../config/firebase.js';
import { openai } from '../config/openai.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Available voices from OpenAI TTS
const AVAILABLE_VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;

// Voice style presets (applied through prompt/text manipulation)
const VOICE_STYLES = {
  energetic: { speedModifier: 1.1, emphasis: 'high energy, enthusiastic' },
  conversational: { speedModifier: 1.0, emphasis: 'natural, friendly' },
  dramatic: { speedModifier: 0.95, emphasis: 'suspenseful, dramatic pauses' },
  custom: { speedModifier: 1.0, emphasis: '' },
} as const;

// Validation schemas
const generateVoiceoverSchema = z.object({
  lineId: z.string(),
  voice: z.enum(AVAILABLE_VOICES).default('alloy'),
  speed: z.number().min(0.5).max(2.0).default(1.0),
  style: z.enum(['energetic', 'conversational', 'dramatic', 'custom']).default('conversational'),
});

const updateVoiceoverSchema = z.object({
  speed: z.number().min(0.5).max(2.0).optional(),
  voice: z.enum(AVAILABLE_VOICES).optional(),
});

// Helper to verify project access
async function verifyProjectAccess(
  projectId: string,
  userId: string
): Promise<FirebaseFirestore.DocumentData> {
  const projectDoc = await db.collection('projects').doc(projectId).get();

  if (!projectDoc.exists) {
    throw NotFoundError('Project');
  }

  const project = projectDoc.data()!;

  if (project.userId !== userId) {
    throw ForbiddenError('You do not have access to this project');
  }

  return project;
}

// Generate voiceover for a single line
router.post(
  '/:projectId/voiceovers/generate',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { projectId } = req.params;
    const { lineId, voice, speed, style } = generateVoiceoverSchema.parse(req.body);

    await verifyProjectAccess(projectId, userId);

    // Get the script line
    const lineDoc = await db
      .collection('projects')
      .doc(projectId)
      .collection('script')
      .doc(lineId)
      .get();

    if (!lineDoc.exists) {
      throw NotFoundError('Script line');
    }

    const lineData = lineDoc.data()!;
    const voiceoverId = uuidv4();
    const now = new Date();

    // Get style configuration
    const styleConfig = VOICE_STYLES[style];
    const adjustedSpeed = speed * styleConfig.speedModifier;

    try {
      logger.info({ lineId, voice, speed: adjustedSpeed }, 'Generating voiceover');

      // Generate audio using OpenAI TTS
      const audioResponse = await openai.audio.speech.create({
        model: 'tts-1-hd',
        voice: voice,
        input: lineData.text,
        speed: Math.max(0.25, Math.min(4.0, adjustedSpeed)),
      });

      const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

      // Upload to Firebase Storage
      const bucket = storage.bucket();
      const filePath = `projects/${projectId}/voiceovers/${voiceoverId}.mp3`;
      const file = bucket.file(filePath);

      await file.save(audioBuffer, {
        contentType: 'audio/mpeg',
      });

      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 30 * 24 * 60 * 60 * 1000, // 30 days
      });

      // Calculate approximate duration based on text length and speed
      const wordCount = lineData.text.split(/\s+/).length;
      const baseDuration = (wordCount / 150) * 60;
      const adjustedDuration = baseDuration / adjustedSpeed;

      // Create voiceover record
      const voiceoverData = {
        id: voiceoverId,
        lineId,
        text: lineData.text,
        voice,
        speed: adjustedSpeed,
        style,
        storageUrl: signedUrl,
        duration: adjustedDuration,
        waveformData: [],
        createdAt: now,
        updatedAt: now,
      };

      await db
        .collection('projects')
        .doc(projectId)
        .collection('voiceovers')
        .doc(voiceoverId)
        .set(voiceoverData);

      // Update script line with voiceover reference
      await db
        .collection('projects')
        .doc(projectId)
        .collection('script')
        .doc(lineId)
        .update({
          voiceoverId,
          updatedAt: now,
        });

      sendSuccess(res, voiceoverData, 'Voiceover generated successfully');
    } catch (error) {
      logger.error({ error, lineId }, 'Failed to generate voiceover');
      sendError(res, 'Failed to generate voiceover. Please try again.', 500);
    }
  })
);

// Generate voiceovers for all lines
router.post(
  '/:projectId/voiceovers/generate-all',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { projectId } = req.params;
    const { voice = 'alloy', speed = 1.0, style = 'conversational' } = req.body;

    await verifyProjectAccess(projectId, userId);

    // Get all script lines
    const linesSnapshot = await db
      .collection('projects')
      .doc(projectId)
      .collection('script')
      .orderBy('order')
      .get();

    if (linesSnapshot.empty) {
      sendError(res, 'No script lines found', 400);
      return;
    }

    const results = [];
    const styleConfig = VOICE_STYLES[style as keyof typeof VOICE_STYLES] || VOICE_STYLES.conversational;
    const adjustedSpeed = speed * styleConfig.speedModifier;

    for (const lineDoc of linesSnapshot.docs) {
      const lineData = lineDoc.data();
      const voiceoverId = uuidv4();
      const now = new Date();

      try {
        // Generate audio
        const audioResponse = await openai.audio.speech.create({
          model: 'tts-1-hd',
          voice: voice as typeof AVAILABLE_VOICES[number],
          input: lineData.text,
          speed: Math.max(0.25, Math.min(4.0, adjustedSpeed)),
        });

        const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

        // Upload to Firebase Storage
        const bucket = storage.bucket();
        const filePath = `projects/${projectId}/voiceovers/${voiceoverId}.mp3`;
        const file = bucket.file(filePath);

        await file.save(audioBuffer, {
          contentType: 'audio/mpeg',
        });

        const [signedUrl] = await file.getSignedUrl({
          action: 'read',
          expires: Date.now() + 30 * 24 * 60 * 60 * 1000,
        });

        const wordCount = lineData.text.split(/\s+/).length;
        const baseDuration = (wordCount / 150) * 60;
        const adjustedDuration = baseDuration / adjustedSpeed;

        const voiceoverData = {
          id: voiceoverId,
          lineId: lineDoc.id,
          text: lineData.text,
          voice,
          speed: adjustedSpeed,
          style,
          storageUrl: signedUrl,
          duration: adjustedDuration,
          waveformData: [],
          createdAt: now,
          updatedAt: now,
        };

        await db
          .collection('projects')
          .doc(projectId)
          .collection('voiceovers')
          .doc(voiceoverId)
          .set(voiceoverData);

        await db
          .collection('projects')
          .doc(projectId)
          .collection('script')
          .doc(lineDoc.id)
          .update({
            voiceoverId,
            updatedAt: now,
          });

        results.push({ lineId: lineDoc.id, voiceoverId, status: 'completed' });
      } catch (error) {
        logger.error({ error, lineId: lineDoc.id }, 'Failed to generate voiceover');
        results.push({ lineId: lineDoc.id, status: 'failed', error: 'Generation failed' });
      }
    }

    sendSuccess(res, { results }, 'Voiceover generation completed');
  })
);

// List all voiceovers for a project
router.get(
  '/:projectId/voiceovers',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { projectId } = req.params;

    await verifyProjectAccess(projectId, userId);

    const voiceoversSnapshot = await db
      .collection('projects')
      .doc(projectId)
      .collection('voiceovers')
      .get();

    const voiceovers = voiceoversSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    sendSuccess(res, voiceovers);
  })
);

// Get voiceover details
router.get(
  '/:projectId/voiceovers/:voiceoverId',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { projectId, voiceoverId } = req.params;

    await verifyProjectAccess(projectId, userId);

    const voDoc = await db
      .collection('projects')
      .doc(projectId)
      .collection('voiceovers')
      .doc(voiceoverId)
      .get();

    if (!voDoc.exists) {
      throw NotFoundError('Voiceover');
    }

    sendSuccess(res, { id: voDoc.id, ...voDoc.data() });
  })
);

// Update voiceover settings (regenerate with new settings)
router.patch(
  '/:projectId/voiceovers/:voiceoverId',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { projectId, voiceoverId } = req.params;
    const updates = updateVoiceoverSchema.parse(req.body);

    await verifyProjectAccess(projectId, userId);

    const voDoc = await db
      .collection('projects')
      .doc(projectId)
      .collection('voiceovers')
      .doc(voiceoverId)
      .get();

    if (!voDoc.exists) {
      throw NotFoundError('Voiceover');
    }

    const existingData = voDoc.data()!;
    const newVoice = updates.voice || existingData.voice;
    const newSpeed = updates.speed || existingData.speed;

    try {
      // Regenerate with new settings
      const audioResponse = await openai.audio.speech.create({
        model: 'tts-1-hd',
        voice: newVoice,
        input: existingData.text,
        speed: newSpeed,
      });

      const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

      const bucket = storage.bucket();
      const filePath = `projects/${projectId}/voiceovers/${voiceoverId}.mp3`;
      const file = bucket.file(filePath);

      await file.save(audioBuffer, {
        contentType: 'audio/mpeg',
      });

      const [signedUrl] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 30 * 24 * 60 * 60 * 1000,
      });

      const wordCount = existingData.text.split(/\s+/).length;
      const baseDuration = (wordCount / 150) * 60;
      const adjustedDuration = baseDuration / newSpeed;

      await db
        .collection('projects')
        .doc(projectId)
        .collection('voiceovers')
        .doc(voiceoverId)
        .update({
          voice: newVoice,
          speed: newSpeed,
          storageUrl: signedUrl,
          duration: adjustedDuration,
          updatedAt: new Date(),
        });

      const updatedDoc = await voDoc.ref.get();
      sendSuccess(res, { id: updatedDoc.id, ...updatedDoc.data() });
    } catch (error) {
      logger.error({ error, voiceoverId }, 'Failed to update voiceover');
      sendError(res, 'Failed to update voiceover', 500);
    }
  })
);

// Preview a voice with a sample
router.post(
  '/voices/preview',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const { voice = 'alloy', speed = 1.0 } = req.body;

    if (!AVAILABLE_VOICES.includes(voice as typeof AVAILABLE_VOICES[number])) {
      sendError(res, 'Invalid voice', 400);
      return;
    }

    try {
      const sampleText = "Hey, this is a quick sample of how I sound. Pretty cool, right?";

      const audioResponse = await openai.audio.speech.create({
        model: 'tts-1',
        voice: voice as typeof AVAILABLE_VOICES[number],
        input: sampleText,
        speed: Math.max(0.25, Math.min(4.0, speed)),
      });

      const audioBuffer = Buffer.from(await audioResponse.arrayBuffer());

      res.set({
        'Content-Type': 'audio/mpeg',
        'Content-Length': audioBuffer.length,
      });
      res.send(audioBuffer);
    } catch (error) {
      logger.error({ error, voice }, 'Failed to generate voice preview');
      sendError(res, 'Failed to generate preview', 500);
    }
  })
);

// Get available voices
router.get(
  '/voices',
  verifyAuth,
  asyncHandler(async (_req, res) => {
    const voices = AVAILABLE_VOICES.map((voice) => ({
      id: voice,
      name: voice.charAt(0).toUpperCase() + voice.slice(1),
      description: getVoiceDescription(voice),
    }));

    const styles = Object.entries(VOICE_STYLES).map(([id, config]) => ({
      id,
      name: id.charAt(0).toUpperCase() + id.slice(1),
      speedModifier: config.speedModifier,
      emphasis: config.emphasis,
    }));

    sendSuccess(res, { voices, styles });
  })
);

function getVoiceDescription(voice: string): string {
  const descriptions: Record<string, string> = {
    alloy: 'Neutral and balanced, great for general content',
    echo: 'Warm and smooth, ideal for storytelling',
    fable: 'Expressive and dynamic, perfect for dramatic content',
    onyx: 'Deep and authoritative, suitable for serious topics',
    nova: 'Bright and energetic, great for upbeat content',
    shimmer: 'Clear and melodic, ideal for calm narration',
  };
  return descriptions[voice] || '';
}

export default router;

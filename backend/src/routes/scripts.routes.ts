import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { verifyAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { scriptLimit } from '../middleware/rateLimiter.js';
import { sendSuccess, sendError } from '../utils/responseHelper.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { NotFoundError, ForbiddenError } from '../middleware/errorHandler.js';
import { db } from '../config/firebase.js';
import { openai } from '../config/openai.js';
import { logger } from '../utils/logger.js';

const router = Router();

// Validation schemas
const updateLineSchema = z.object({
  text: z.string().min(1).max(500).optional(),
  order: z.number().optional(),
});

const combineLineSchema = z.object({
  lineIds: z.array(z.string()).min(2),
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

// Generate script from title and description
router.post(
  '/:projectId/script/generate',
  verifyAuth,
  scriptLimit,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { projectId } = req.params;

    const project = await verifyProjectAccess(projectId, userId);

    logger.info({ projectId }, 'Generating script');

    // Calculate target line count based on duration
    const durationMap: Record<string, { lines: number; secondsPerLine: number }> = {
      '15-30': { lines: 4, secondsPerLine: 5 },
      '30-45': { lines: 6, secondsPerLine: 6 },
      '45-60': { lines: 8, secondsPerLine: 7 },
    };

    const targetConfig = durationMap[project.duration] || durationMap['30-45'];

    const prompt = `You are a viral short-form video script writer. Create a script for a ${project.duration} second video.

Title/Hook: ${project.title}
Description: ${project.description || 'None provided'}

Requirements:
- Write exactly ${targetConfig.lines} lines/sentences
- Each line should be punchy and attention-grabbing
- The script should tell a compelling story or share interesting information
- Add elements of risk, curiosity, or enticement to keep viewers watching
- Keep the tone relatively lighthearted but engaging
- Each line should be spoken in about ${targetConfig.secondsPerLine} seconds
- First line must hook the viewer immediately
- Last line should have a satisfying conclusion or call-to-action

Format your response as a JSON array of strings, where each string is one line of the script.
Example: ["Line 1", "Line 2", "Line 3"]

Only output the JSON array, nothing else.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.8,
      max_tokens: 1000,
    });

    const responseContent = completion.choices[0]?.message?.content || '[]';
    let scriptLines: string[];

    try {
      scriptLines = JSON.parse(responseContent);
    } catch {
      logger.error({ responseContent }, 'Failed to parse script response');
      sendError(res, 'Failed to generate script. Please try again.', 500);
      return;
    }

    // Clear existing script lines
    const existingLines = await db
      .collection('projects')
      .doc(projectId)
      .collection('script')
      .get();

    const batch = db.batch();
    existingLines.docs.forEach((doc) => batch.delete(doc.ref));

    // Create new script lines
    const now = new Date();
    const newLines = scriptLines.map((text, index) => {
      const lineId = uuidv4();
      const lineRef = db
        .collection('projects')
        .doc(projectId)
        .collection('script')
        .doc(lineId);

      const lineData = {
        id: lineId,
        text,
        order: index,
        groupId: null,
        isGroupLeader: false,
        groupMembers: [],
        estimatedDuration: targetConfig.secondsPerLine,
        selectedVideoId: null,
        voiceoverId: null,
        createdAt: now,
        updatedAt: now,
      };

      batch.set(lineRef, lineData);
      return lineData;
    });

    // Update project status
    batch.update(db.collection('projects').doc(projectId), {
      status: 'scripted',
      updatedAt: now,
    });

    await batch.commit();

    sendSuccess(res, { script: newLines }, 'Script generated successfully');
  })
);

// Update single line
router.patch(
  '/:projectId/script/lines/:lineId',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { projectId, lineId } = req.params;
    const updates = updateLineSchema.parse(req.body);

    await verifyProjectAccess(projectId, userId);

    const lineRef = db
      .collection('projects')
      .doc(projectId)
      .collection('script')
      .doc(lineId);

    const lineDoc = await lineRef.get();

    if (!lineDoc.exists) {
      throw NotFoundError('Script line');
    }

    await lineRef.update({
      ...updates,
      updatedAt: new Date(),
    });

    const updatedLine = await lineRef.get();
    sendSuccess(res, { id: updatedLine.id, ...updatedLine.data() });
  })
);

// Regenerate single line
router.post(
  '/:projectId/script/lines/:lineId/regenerate',
  verifyAuth,
  scriptLimit,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { projectId, lineId } = req.params;

    const project = await verifyProjectAccess(projectId, userId);

    const lineRef = db
      .collection('projects')
      .doc(projectId)
      .collection('script')
      .doc(lineId);

    const lineDoc = await lineRef.get();

    if (!lineDoc.exists) {
      throw NotFoundError('Script line');
    }

    const lineData = lineDoc.data()!;

    // Get all lines for context
    const allLines = await db
      .collection('projects')
      .doc(projectId)
      .collection('script')
      .orderBy('order')
      .get();

    const scriptContext = allLines.docs
      .map((doc) => `Line ${doc.data().order + 1}: ${doc.data().text}`)
      .join('\n');

    const prompt = `You are a viral short-form video script writer. Regenerate line ${lineData.order + 1} of this script.

Title/Hook: ${project.title}
Description: ${project.description || 'None provided'}

Current script:
${scriptContext}

Requirements:
- Provide a new alternative for line ${lineData.order + 1}
- Keep the same tone and style as the rest of the script
- Make it punchy and engaging
- It should fit naturally with the surrounding lines

Output only the new line text, nothing else.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4-turbo-preview',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.9,
      max_tokens: 200,
    });

    const newText = completion.choices[0]?.message?.content?.trim() || lineData.text;

    await lineRef.update({
      text: newText,
      selectedVideoId: null, // Reset video selection since text changed
      voiceoverId: null, // Reset voiceover
      updatedAt: new Date(),
    });

    // Return the full updated line data
    const updatedLineDoc = await lineRef.get();
    sendSuccess(res, { id: lineId, ...updatedLineDoc.data() }, 'Line regenerated');
  })
);

// Combine multiple lines
router.post(
  '/:projectId/script/lines/combine',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { projectId } = req.params;
    const { lineIds } = combineLineSchema.parse(req.body);

    await verifyProjectAccess(projectId, userId);

    // Get all specified lines
    const lines = await Promise.all(
      lineIds.map(async (lineId) => {
        const doc = await db
          .collection('projects')
          .doc(projectId)
          .collection('script')
          .doc(lineId)
          .get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
      })
    );

    const validLines = lines.filter((line) => line !== null);

    if (validLines.length < 2) {
      sendError(res, 'At least 2 valid lines are required to combine', 400);
      return;
    }

    // Sort by order to determine the leader (first line)
    validLines.sort((a, b) => (a as any).order - (b as any).order);

    const leaderId = validLines[0]!.id;
    const groupId = uuidv4();
    const memberIds = validLines.map((line) => line!.id);
    const now = new Date();

    // Update all lines in the group
    const batch = db.batch();

    validLines.forEach((line, index) => {
      const lineRef = db
        .collection('projects')
        .doc(projectId)
        .collection('script')
        .doc(line!.id);

      batch.update(lineRef, {
        groupId,
        isGroupLeader: index === 0,
        groupMembers: memberIds,
        updatedAt: now,
      });
    });

    await batch.commit();

    sendSuccess(res, { groupId, leaderId, members: memberIds }, 'Lines combined');
  })
);

// Split combined lines
router.post(
  '/:projectId/script/lines/split',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { projectId } = req.params;
    const { groupId } = req.body;

    if (!groupId) {
      sendError(res, 'groupId is required', 400);
      return;
    }

    await verifyProjectAccess(projectId, userId);

    // Find all lines in the group
    const groupLines = await db
      .collection('projects')
      .doc(projectId)
      .collection('script')
      .where('groupId', '==', groupId)
      .get();

    if (groupLines.empty) {
      sendError(res, 'No lines found in this group', 404);
      return;
    }

    const batch = db.batch();
    const now = new Date();

    groupLines.docs.forEach((doc) => {
      batch.update(doc.ref, {
        groupId: null,
        isGroupLeader: false,
        groupMembers: [],
        updatedAt: now,
      });
    });

    await batch.commit();

    sendSuccess(res, { message: 'Lines split successfully' });
  })
);

export default router;

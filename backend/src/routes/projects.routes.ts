import { Router } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { verifyAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { sendSuccess, sendCreated, sendNoContent } from '../utils/responseHelper.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { NotFoundError, ForbiddenError } from '../middleware/errorHandler.js';
import { db } from '../config/firebase.js';

const router = Router();

// Validation schemas
const createProjectSchema = z.object({
  title: z.string().min(1).max(280).trim(),
  description: z.string().max(280).trim().default(''),
  duration: z.enum(['15-30', '30-45', '45-60']),
});

const updateProjectSchema = z.object({
  title: z.string().min(1).max(280).trim().optional(),
  description: z.string().max(280).trim().optional(),
  duration: z.enum(['15-30', '30-45', '45-60']).optional(),
  status: z
    .enum(['draft', 'scripted', 'generating', 'generated', 'editing', 'exported', 'uploaded'])
    .optional(),
  timeline: z.any().optional(),
  exportSettings: z
    .object({
      resolution: z.enum(['720p', '1080p']),
      format: z.literal('mp4'),
      fps: z.number(),
    })
    .optional(),
});

// List user's projects
router.get(
  '/',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { status, limit = '20', offset = '0' } = req.query;

    let query = db
      .collection('projects')
      .where('userId', '==', userId)
      .orderBy('updatedAt', 'desc');

    if (status) {
      query = query.where('status', '==', status);
    }

    const snapshot = await query
      .limit(parseInt(limit as string, 10))
      .offset(parseInt(offset as string, 10))
      .get();

    const projects = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    sendSuccess(res, projects);
  })
);

// Create new project
router.post(
  '/',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const data = createProjectSchema.parse(req.body);

    const projectId = uuidv4();
    const now = new Date();

    const project = {
      id: projectId,
      userId,
      title: data.title,
      description: data.description,
      duration: data.duration,
      status: 'draft',
      timeline: {
        tracks: {
          video: [],
          audio: [],
        },
        duration: 0,
      },
      exportSettings: {
        resolution: '1080p',
        format: 'mp4',
        fps: 30,
      },
      youtubeUpload: null,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('projects').doc(projectId).set(project);

    // Update user's project count
    await db.collection('users').doc(userId).update({
      'usage.projectsCreated': (await db.collection('users').doc(userId).get()).data()?.usage?.projectsCreated + 1 || 1,
    });

    sendCreated(res, project, 'Project created successfully');
  })
);

// Get project details
router.get(
  '/:id',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { id } = req.params;

    const projectDoc = await db.collection('projects').doc(id).get();

    if (!projectDoc.exists) {
      throw NotFoundError('Project');
    }

    const project = projectDoc.data();

    if (project?.userId !== userId) {
      throw ForbiddenError('You do not have access to this project');
    }

    // Fetch script lines
    const scriptSnapshot = await db
      .collection('projects')
      .doc(id)
      .collection('script')
      .orderBy('order')
      .get();

    const scriptLines = scriptSnapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data(),
    }));

    sendSuccess(res, {
      id: projectDoc.id,
      ...project,
      script: scriptLines,
    });
  })
);

// Update project
router.patch(
  '/:id',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { id } = req.params;
    const updates = updateProjectSchema.parse(req.body);

    const projectDoc = await db.collection('projects').doc(id).get();

    if (!projectDoc.exists) {
      throw NotFoundError('Project');
    }

    if (projectDoc.data()?.userId !== userId) {
      throw ForbiddenError('You do not have access to this project');
    }

    await db.collection('projects').doc(id).update({
      ...updates,
      updatedAt: new Date(),
    });

    const updatedDoc = await db.collection('projects').doc(id).get();

    sendSuccess(res, { id: updatedDoc.id, ...updatedDoc.data() });
  })
);

// Delete project
router.delete(
  '/:id',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { id } = req.params;

    const projectDoc = await db.collection('projects').doc(id).get();

    if (!projectDoc.exists) {
      throw NotFoundError('Project');
    }

    if (projectDoc.data()?.userId !== userId) {
      throw ForbiddenError('You do not have access to this project');
    }

    // Delete subcollections (script, videos, voiceovers, subtitles)
    const subcollections = ['script', 'videos', 'voiceovers', 'subtitles'];
    for (const subcollection of subcollections) {
      const snapshot = await db
        .collection('projects')
        .doc(id)
        .collection(subcollection)
        .get();

      const batch = db.batch();
      snapshot.docs.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }

    // Delete the project document
    await db.collection('projects').doc(id).delete();

    sendNoContent(res);
  })
);

// Duplicate project
router.post(
  '/:id/duplicate',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { id } = req.params;

    const projectDoc = await db.collection('projects').doc(id).get();

    if (!projectDoc.exists) {
      throw NotFoundError('Project');
    }

    const originalProject = projectDoc.data();

    if (originalProject?.userId !== userId) {
      throw ForbiddenError('You do not have access to this project');
    }

    const newProjectId = uuidv4();
    const now = new Date();

    const newProject = {
      ...originalProject,
      id: newProjectId,
      title: `${originalProject.title} (Copy)`,
      status: 'draft',
      youtubeUpload: null,
      createdAt: now,
      updatedAt: now,
    };

    await db.collection('projects').doc(newProjectId).set(newProject);

    // Copy script lines
    const scriptSnapshot = await db
      .collection('projects')
      .doc(id)
      .collection('script')
      .get();

    const batch = db.batch();
    scriptSnapshot.docs.forEach((doc) => {
      const newLineRef = db
        .collection('projects')
        .doc(newProjectId)
        .collection('script')
        .doc();
      batch.set(newLineRef, {
        ...doc.data(),
        id: newLineRef.id,
        selectedVideoId: null,
        voiceoverId: null,
        createdAt: now,
        updatedAt: now,
      });
    });
    await batch.commit();

    sendCreated(res, newProject, 'Project duplicated successfully');
  })
);

export default router;

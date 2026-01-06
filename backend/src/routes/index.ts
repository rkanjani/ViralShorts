import { Router } from 'express';
import authRoutes from './auth.routes.js';
import projectRoutes from './projects.routes.js';
import scriptRoutes from './scripts.routes.js';
import videoRoutes from './videos.routes.js';
import voiceoverRoutes from './voiceovers.routes.js';
import uploadRoutes from './uploads.routes.js';

const router = Router();

// Mount routes
router.use('/auth', authRoutes);
router.use('/projects', projectRoutes);
router.use('/projects', scriptRoutes);
router.use('/projects', videoRoutes);
router.use('/projects', voiceoverRoutes);
router.use('/projects', uploadRoutes);

export default router;

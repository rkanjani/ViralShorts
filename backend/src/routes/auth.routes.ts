import { Router } from 'express';
import { verifyAuth, AuthenticatedRequest } from '../middleware/auth.js';
import { sendSuccess, sendError } from '../utils/responseHelper.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { db } from '../config/firebase.js';

const router = Router();

// Get current user
router.get(
  '/me',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;

    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
      // Create user document if it doesn't exist
      const userData = {
        uid: userId,
        email: req.user!.email || '',
        displayName: req.user!.name || '',
        createdAt: new Date(),
        updatedAt: new Date(),
        settings: {
          defaultVoice: 'alloy',
          defaultVoiceSpeed: 1.0,
          defaultSubtitleStyle: 'default',
          theme: 'system',
        },
        usage: {
          projectsCreated: 0,
          videosGenerated: 0,
          videosUploaded: 0,
          lastActive: new Date(),
        },
      };

      await db.collection('users').doc(userId).set(userData);
      sendSuccess(res, userData);
      return;
    }

    // Update last active
    await db.collection('users').doc(userId).update({
      'usage.lastActive': new Date(),
    });

    sendSuccess(res, { id: userDoc.id, ...userDoc.data() });
  })
);

// Update user settings
router.patch(
  '/settings',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { settings } = req.body;

    if (!settings) {
      sendError(res, 'Settings object is required', 400);
      return;
    }

    await db.collection('users').doc(userId).update({
      settings,
      updatedAt: new Date(),
    });

    sendSuccess(res, { message: 'Settings updated' });
  })
);

// Connect YouTube account (store tokens)
router.post(
  '/youtube/connect',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;
    const { accessToken, refreshToken, channelId, channelName, expiresAt } =
      req.body;

    if (!accessToken || !refreshToken || !channelId) {
      sendError(res, 'Missing required YouTube credentials', 400);
      return;
    }

    await db.collection('users').doc(userId).update({
      youtubeAuth: {
        accessToken,
        refreshToken,
        channelId,
        channelName: channelName || '',
        expiresAt: new Date(expiresAt),
      },
      updatedAt: new Date(),
    });

    sendSuccess(res, { message: 'YouTube account connected' });
  })
);

// Disconnect YouTube account
router.delete(
  '/youtube',
  verifyAuth,
  asyncHandler(async (req: AuthenticatedRequest, res) => {
    const userId = req.user!.uid;

    await db.collection('users').doc(userId).update({
      youtubeAuth: null,
      updatedAt: new Date(),
    });

    sendSuccess(res, { message: 'YouTube account disconnected' });
  })
);

export default router;

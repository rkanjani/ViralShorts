import rateLimit from 'express-rate-limit';
import { AuthenticatedRequest } from './auth.js';

// Standard API rate limit
export const standardLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  keyGenerator: (req: AuthenticatedRequest) => req.user?.uid || req.ip || 'unknown',
  message: {
    success: false,
    error: 'Too many requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Strict limit for video generation (expensive operation)
export const generationLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // 20 video generations per hour
  keyGenerator: (req: AuthenticatedRequest) => req.user?.uid || req.ip || 'unknown',
  message: {
    success: false,
    error: 'Video generation limit reached. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limit for script generation
export const scriptLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50, // 50 script generations per hour
  keyGenerator: (req: AuthenticatedRequest) => req.user?.uid || req.ip || 'unknown',
  message: {
    success: false,
    error: 'Script generation limit reached. Please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Limit for YouTube uploads
export const uploadLimit = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 hours
  max: 10, // 10 uploads per day
  keyGenerator: (req: AuthenticatedRequest) => req.user?.uid || req.ip || 'unknown',
  message: {
    success: false,
    error: 'Upload limit reached. Please try again tomorrow.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  firebase: {
    projectId: process.env.FIREBASE_PROJECT_ID || '',
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL || '',
    privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || '',
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY || '',
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
  },

  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },

  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173',
};

export const isDev = config.nodeEnv === 'development';
export const isProd = config.nodeEnv === 'production';

// Individual config exports for convenience
export const openaiConfig = config.openai;
export const firebaseConfig = config.firebase;
export const googleConfig = config.google;
export const redisConfig = config.redis;

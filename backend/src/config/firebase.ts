import admin from 'firebase-admin';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import type { Storage } from 'firebase-admin/storage';
import { config } from './index.js';

// Check if Firebase is properly configured
const isFirebaseConfigured = Boolean(
  config.firebase.projectId &&
  config.firebase.clientEmail &&
  config.firebase.privateKey &&
  config.firebase.projectId !== 'your-project-id' &&
  !config.firebase.privateKey.includes('...')
);

// Initialize Firebase Admin SDK only if configured
let db: Firestore | null = null;
let auth: Auth | null = null;
let storage: Storage | null = null;

if (isFirebaseConfigured && !admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: config.firebase.projectId,
        clientEmail: config.firebase.clientEmail,
        privateKey: config.firebase.privateKey,
      }),
      storageBucket: config.firebase.storageBucket,
    });
    db = admin.firestore();
    auth = admin.auth();
    storage = admin.storage();
    console.log('Firebase Admin SDK initialized successfully');
  } catch (error) {
    console.warn('Failed to initialize Firebase Admin SDK:', error);
  }
} else {
  console.warn('Firebase Admin SDK not configured. Some features will be unavailable.');
}

export { db, auth, storage, isFirebaseConfigured };
export default admin;

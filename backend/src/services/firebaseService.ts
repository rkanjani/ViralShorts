import { Timestamp } from 'firebase-admin/firestore';
import { db } from '../config/firebase';

// Generic CRUD operations
export async function createDocument<T extends object>(
  collectionPath: string,
  id: string,
  data: T
): Promise<T & { id: string }> {
  const docRef = db.collection(collectionPath).doc(id);
  const timestamp = Timestamp.now();

  await docRef.set({
    ...data,
    createdAt: timestamp,
    updatedAt: timestamp,
  });

  return { ...data, id, createdAt: timestamp, updatedAt: timestamp } as T & { id: string };
}

export async function getDocument<T>(
  collectionPath: string,
  id: string
): Promise<(T & { id: string }) | null> {
  const docRef = db.collection(collectionPath).doc(id);
  const docSnap = await docRef.get();

  if (!docSnap.exists) {
    return null;
  }

  return { ...docSnap.data(), id: docSnap.id } as T & { id: string };
}

export async function updateDocument<T extends object>(
  collectionPath: string,
  id: string,
  data: Partial<T>
): Promise<void> {
  const docRef = db.collection(collectionPath).doc(id);
  await docRef.update({
    ...data,
    updatedAt: Timestamp.now(),
  });
}

export async function deleteDocument(collectionPath: string, id: string): Promise<void> {
  const docRef = db.collection(collectionPath).doc(id);
  await docRef.delete();
}

// Project operations
export interface Project {
  userId: string;
  title: string;
  description: string;
  duration: number;
  status: 'draft' | 'scripted' | 'generating' | 'generated' | 'editing' | 'uploaded';
  timeline?: object;
  youtubeUpload?: {
    videoId: string;
    url: string;
  };
}

export async function getUserProjects(userId: string): Promise<(Project & { id: string })[]> {
  const snapshot = await db
    .collection('projects')
    .where('userId', '==', userId)
    .orderBy('updatedAt', 'desc')
    .limit(50)
    .get();

  return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as Project & { id: string }));
}

export async function createProject(
  userId: string,
  data: Omit<Project, 'userId' | 'status'>
): Promise<Project & { id: string }> {
  const id = db.collection('projects').doc().id;
  return createDocument<Project>('projects', id, {
    ...data,
    userId,
    status: 'draft',
  });
}

// Script operations
export interface ScriptLine {
  text: string;
  order: number;
  groupId?: string;
  isGroupLeader?: boolean;
  selectedVideoId?: string;
  voiceoverId?: string;
}

export async function getProjectScriptLines(
  projectId: string
): Promise<(ScriptLine & { id: string })[]> {
  const snapshot = await db
    .collection('projects')
    .doc(projectId)
    .collection('script')
    .orderBy('order', 'asc')
    .get();

  return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as ScriptLine & { id: string }));
}

export async function saveScriptLines(
  projectId: string,
  lines: ScriptLine[]
): Promise<void> {
  const batch = db.batch();

  // Delete existing lines
  const existingLines = await getProjectScriptLines(projectId);
  for (const line of existingLines) {
    const docRef = db.collection('projects').doc(projectId).collection('script').doc(line.id);
    batch.delete(docRef);
  }

  // Add new lines
  for (const line of lines) {
    const docRef = db.collection('projects').doc(projectId).collection('script').doc();
    batch.set(docRef, {
      ...line,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  }

  await batch.commit();
}

// Video operations
export interface Video {
  lineId: string;
  soraJobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  storageUrl?: string;
  optionIndex: number;
  duration?: number;
}

export async function createVideo(
  projectId: string,
  data: Omit<Video, 'status'>
): Promise<Video & { id: string }> {
  const id = db.collection('projects').doc(projectId).collection('videos').doc().id;
  return createDocument<Video>(`projects/${projectId}/videos`, id, {
    ...data,
    status: 'pending',
  });
}

export async function getProjectVideos(
  projectId: string
): Promise<(Video & { id: string })[]> {
  const snapshot = await db
    .collection('projects')
    .doc(projectId)
    .collection('videos')
    .get();

  return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as Video & { id: string }));
}

export async function updateVideoStatus(
  projectId: string,
  videoId: string,
  status: Video['status'],
  storageUrl?: string
): Promise<void> {
  await updateDocument<Video>(`projects/${projectId}/videos`, videoId, {
    status,
    ...(storageUrl && { storageUrl }),
  });
}

// Voiceover operations
export interface Voiceover {
  lineId: string;
  text: string;
  voice: string;
  speed: number;
  storageUrl?: string;
  duration?: number;
}

export async function createVoiceover(
  projectId: string,
  data: Omit<Voiceover, 'storageUrl' | 'duration'>
): Promise<Voiceover & { id: string }> {
  const id = db.collection('projects').doc(projectId).collection('voiceovers').doc().id;
  return createDocument<Voiceover>(`projects/${projectId}/voiceovers`, id, data);
}

export async function getProjectVoiceovers(
  projectId: string
): Promise<(Voiceover & { id: string })[]> {
  const snapshot = await db
    .collection('projects')
    .doc(projectId)
    .collection('voiceovers')
    .get();

  return snapshot.docs.map((doc) => ({ ...doc.data(), id: doc.id } as Voiceover & { id: string }));
}

// User operations
export interface User {
  email: string;
  displayName: string;
  photoURL?: string;
  youtubeAuth?: {
    accessToken: string;
    refreshToken: string;
    channelId: string;
    channelName: string;
  };
  settings?: {
    defaultVoice: string;
    defaultVoiceSpeed: number;
    theme: 'light' | 'dark' | 'system';
  };
}

export async function getOrCreateUser(
  uid: string,
  userData: Partial<User>
): Promise<User & { id: string }> {
  const existing = await getDocument<User>('users', uid);
  if (existing) {
    return existing;
  }

  return createDocument<User>('users', uid, userData as User);
}

export async function updateUserYouTubeAuth(
  uid: string,
  youtubeAuth: User['youtubeAuth']
): Promise<void> {
  await updateDocument<User>('users', uid, { youtubeAuth });
}

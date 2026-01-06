import { getStorage } from 'firebase-admin/storage';
import { v4 as uuidv4 } from 'uuid';

const storage = getStorage();

interface UploadOptions {
  contentType?: string;
  metadata?: Record<string, string>;
}

export async function uploadFile(
  buffer: Buffer,
  destination: string,
  options: UploadOptions = {}
): Promise<string> {
  const bucket = storage.bucket();
  const file = bucket.file(destination);

  await file.save(buffer, {
    metadata: {
      contentType: options.contentType || 'application/octet-stream',
      metadata: options.metadata,
    },
  });

  // Make the file publicly readable
  await file.makePublic();

  return file.publicUrl();
}

export async function uploadVideoFromBuffer(
  projectId: string,
  lineId: string,
  buffer: Buffer,
  optionIndex: number
): Promise<string> {
  const filename = `${uuidv4()}.mp4`;
  const destination = `projects/${projectId}/videos/${lineId}/${filename}`;

  return uploadFile(buffer, destination, {
    contentType: 'video/mp4',
    metadata: {
      projectId,
      lineId,
      optionIndex: String(optionIndex),
    },
  });
}

export async function uploadAudioFromBuffer(
  projectId: string,
  lineId: string,
  buffer: Buffer
): Promise<string> {
  const filename = `${uuidv4()}.mp3`;
  const destination = `projects/${projectId}/voiceovers/${lineId}/${filename}`;

  return uploadFile(buffer, destination, {
    contentType: 'audio/mpeg',
    metadata: {
      projectId,
      lineId,
    },
  });
}

export async function uploadFinalVideo(
  projectId: string,
  buffer: Buffer
): Promise<string> {
  const filename = `final_${uuidv4()}.mp4`;
  const destination = `projects/${projectId}/exports/${filename}`;

  return uploadFile(buffer, destination, {
    contentType: 'video/mp4',
    metadata: {
      projectId,
      type: 'final',
    },
  });
}

export async function downloadFile(filePath: string): Promise<Buffer> {
  const bucket = storage.bucket();
  const file = bucket.file(filePath);

  const [buffer] = await file.download();
  return buffer;
}

export async function deleteFile(filePath: string): Promise<void> {
  const bucket = storage.bucket();
  const file = bucket.file(filePath);

  await file.delete();
}

export async function deleteProjectFiles(projectId: string): Promise<void> {
  const bucket = storage.bucket();
  const [files] = await bucket.getFiles({ prefix: `projects/${projectId}/` });

  await Promise.all(files.map((file) => file.delete()));
}

export async function getSignedUrl(
  filePath: string,
  expiresInMinutes: number = 60
): Promise<string> {
  const bucket = storage.bucket();
  const file = bucket.file(filePath);

  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + expiresInMinutes * 60 * 1000,
  });

  return url;
}

export function getPublicUrl(filePath: string): string {
  const bucket = storage.bucket();
  const file = bucket.file(filePath);
  return file.publicUrl();
}

export async function fileExists(filePath: string): Promise<boolean> {
  const bucket = storage.bucket();
  const file = bucket.file(filePath);
  const [exists] = await file.exists();
  return exists;
}

export function extractPathFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    // Firebase Storage URLs contain the path after /o/
    const match = urlObj.pathname.match(/\/o\/(.+)/);
    if (match) {
      return decodeURIComponent(match[1]);
    }
    return null;
  } catch {
    return null;
  }
}

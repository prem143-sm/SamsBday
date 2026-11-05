/**
 * Vercel Serverless Function: /api/upload
 *
 * Handles multipart uploads of audio and photo files to Vercel Blob.
 * Requires a valid session cookie.
 *
 * Environment variables:
 *   BLOB_READ_WRITE_TOKEN — Vercel Blob read/write token
 */

import { put, get } from '@vercel/blob';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ensureUpdateAllowed, recordSuccessfulUpdate } from './update-policy';

const SESSION_SECRET = process.env.SESSION_SECRET;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

if (!BLOB_TOKEN) {
  console.warn('BLOB_READ_WRITE_TOKEN is not set — uploads will fail.');
}

// Supported audio MIME types
const AUDIO_TYPES = new Set([
  'audio/mpeg',   // .mp3
  'audio/wav',    // .wav
  'audio/x-wav',
  'audio/mp4',    // .m4a
  'audio/aac',    // .aac
  'audio/ogg',    // .ogg
  'audio/flac',   // .flac
  'audio/webm',   // .webm
]);

// Supported photo MIME types
const PHOTO_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/bmp',
  'image/gif',
  'image/avif',
  'image/heic',
  'image/heif',
  'image/webp',
]);

const MAX_FILE_SIZE_MB = 100;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;
const INDEX_PATH = (collection: string) => `media/${collection}/index.json`;

async function readIndex(collection: string): Promise<any[]> {
  try {
    const index = await get(INDEX_PATH(collection));
    if (!index) return [];
    const data = await (await fetch(index.downloadUrl, { cache: 'no-store' })).json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeIndex(collection: string, items: any[]): Promise<void> {
  await put(INDEX_PATH(collection), JSON.stringify(items), {
    access: 'public', addRandomSuffix: false, contentType: 'application/json',
  });
}

function getSessionUser(cookieHeader: string | null): 'sam' | 'prem' | null {
  if (!SESSION_SECRET || !cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)samiksha_session=([^;]+)/);
  if (!match) return null;
  try {
    const signed = decodeURIComponent(match[1]);
    const parts = signed.split(':');
    if (parts.length !== 3) return null;
    const [userId, timestamp, hmac] = parts;
    const payload = `${userId}:${timestamp}`;
    const expected = createHmac('sha256', SESSION_SECRET).update(payload).digest('hex');
    if (!timingSafeEqual(Buffer.from(hmac), Buffer.from(expected))) return null;
    if (Date.now() - parseInt(timestamp, 10) > 7 * 24 * 60 * 60 * 1000) return null;
    if (userId === 'sam' || userId === 'prem') return userId;
  } catch {
    return null;
  }
  return null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'file';
}
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Authenticate
  const user = getSessionUser(req.headers.get('cookie'));
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'Authentication required.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!BLOB_TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: 'Storage not configured.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Parse multipart form data
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return new Response(JSON.stringify({ ok: false, error: 'Expected multipart form data.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const collection = (formData.get('collection') as string) || '';
  const mediaType = (formData.get('mediaType') as string) || '';

  if (!file) {
    return new Response(JSON.stringify({ ok: false, error: 'No file provided.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (collection !== 'sam' && collection !== 'prem') {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid collection.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (mediaType !== 'audio' && mediaType !== 'photo') {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid media type.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate collection ownership — user can only upload to their own collection
  if (user !== collection) {
    return new Response(JSON.stringify({ ok: false, error: 'Unauthorized collection access.' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const updateAllowed = await ensureUpdateAllowed(collection);
  if (!updateAllowed.ok) {
    return Response.json({ ok: false, error: updateAllowed.error, updateStatus: updateAllowed.status }, { status: 429 });
  }

  // File size validation
  if (file.size > MAX_FILE_SIZE) {
    return new Response(JSON.stringify({ ok: false, error: `File exceeds ${MAX_FILE_SIZE_MB} MB limit.` }), {
      status: 413,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // MIME type validation (do not trust extension alone)
  const fileType = file.type || '';
  const allowedTypes = mediaType === 'audio' ? AUDIO_TYPES : PHOTO_TYPES;

  if (!allowedTypes.has(fileType)) {
    return new Response(
      JSON.stringify({ ok: false, error: `Unsupported file type: ${fileType || 'unknown'}.` }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Generate unique storage path
  const timestamp = Date.now();
  const safeName = slugify(file.name.replace(/\.[^/.]+$/, ''));
  const extension = file.name.split('.').pop() || 'bin';
  const storageKey = `media/${collection}/${mediaType}s/${timestamp}-${safeName}.${extension}`;

  try {
    const blob = await put(storageKey, file, {
      access: 'public',
      addRandomSuffix: false,
      contentType: fileType,
    });

    // Build media record
    const mediaItem = {
      id: `${collection}-${mediaType}-${timestamp}-${slugify(safeName)}`,
      collection: collection as 'sam' | 'prem',
      sourceType: mediaType === 'audio' ? 'uploaded_audio' : 'uploaded_photo',
      title: safeName.replace(/-/g, ' '),
      artist: mediaType === 'audio' ? 'Unknown Artist' : undefined,
      storageKey: blob.pathname,
      url: blob.url,
      mimeType: fileType,
      fileSize: file.size,
      duration: null,
      createdAt: new Date().toISOString(),
      thumbnailUrl: mediaType === 'photo' ? blob.url : null,
    };

    const items = await readIndex(collection);
    items.unshift(mediaItem);
    await writeIndex(collection, items);
    await recordSuccessfulUpdate(collection);

    return new Response(JSON.stringify({ ok: true, media: mediaItem }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Upload error:', err);
    return new Response(JSON.stringify({ ok: false, error: 'Upload failed. Please try again.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
}

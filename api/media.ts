/**
 * Vercel Serverless Function: /api/media
 *
 * Lists and deletes media items for the authenticated user's collection.
 * Media records are stored as JSON files in Vercel Blob under media/<collection>/index.json.
 *
 * Environment variables:
 *   BLOB_READ_WRITE_TOKEN — Vercel Blob read/write token
 *   SESSION_SECRET — session signing secret
 */

import { list, put, del, get } from '@vercel/blob';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { ensureUpdateAllowed, recordSuccessfulUpdate, updateStatus } from './update-policy';

const SESSION_SECRET = process.env.SESSION_SECRET;
const BLOB_TOKEN = process.env.BLOB_READ_WRITE_TOKEN;

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

const INDEX_PATH = (collection: string) => `media/${collection}/index.json`;

async function readIndex(collection: string): Promise<any[]> {
  if (!BLOB_TOKEN) return [];
  try {
    const blob = await get(INDEX_PATH(collection));
    if (!blob) return [];
    const res = await fetch(blob.downloadUrl);
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

async function writeIndex(collection: string, items: any[]): Promise<void> {
  if (!BLOB_TOKEN) return;
  await put(INDEX_PATH(collection), JSON.stringify(items, null, 2), {
    access: 'public',
    addRandomSuffix: false,
    contentType: 'application/json',
  });
}

export default async function handler(req: Request): Promise<Response> {
  const user = getSessionUser(req.headers.get('cookie'));
  if (!user) {
    return new Response(JSON.stringify({ ok: false, error: 'Authentication required.' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const url = new URL(req.url);
  const collection = url.searchParams.get('collection');

  // ---- GET: List media ----
  if (req.method === 'GET') {
    // Users can only list their own collection
    if (collection !== user) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized collection access.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const items = await readIndex(collection);
    return new Response(JSON.stringify({ ok: true, items, updateStatus: await updateStatus(collection) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // ---- DELETE: Remove media ----
  if (req.method === 'DELETE') {
    const updateAllowed = await ensureUpdateAllowed(user);
    if (!updateAllowed.ok) {
      return Response.json({ ok: false, error: updateAllowed.error, updateStatus: updateAllowed.status }, { status: 429 });
    }
    const id = url.pathname.split('/').pop();
    if (!id) {
      return new Response(JSON.stringify({ ok: false, error: 'Media ID required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const items = await readIndex(user);
    const itemIndex = items.findIndex((item: any) => item.id === id);

    if (itemIndex === -1) {
      return new Response(JSON.stringify({ ok: false, error: 'Media not found.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const item = items[itemIndex];

    // Ownership validation — user can only delete from their own collection
    if (item.collection !== user) {
      return new Response(JSON.stringify({ ok: false, error: 'Unauthorized deletion.' }), {
        status: 403,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Delete the storage object
    try {
      await del(item.storageKey);
    } catch {
      // Continue even if storage object deletion fails — record removal is primary
    }

    // Remove from index
    items.splice(itemIndex, 1);
    await writeIndex(user, items);
    await recordSuccessfulUpdate(user);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: false, error: 'Method not allowed.' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Local development media storage for the static folders used by this app.
 * It is deliberately used only by Vite; Vercel deployments must use durable
 * object storage because serverless filesystems are not persistent. */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const root = process.cwd();
const musicRoot = path.join(root, 'public', 'music');
const photosRoot = path.join(root, 'public', 'Photos');
const optimizedRoot = path.join(photosRoot, 'optimized');
const tempRoot = path.join(photosRoot, 'temp');
const playlists = {
  'sams-playlist': 'Sams-Playlist',
  'prems-playlist': 'Prems-Playlist',
} as const;
const audioExtensions = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.webm']);
const photoExtensions = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.gif', '.avif', '.heic', '.heif', '.webp', '.tif', '.tiff']);

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
}
function sessionUser(cookie: string | null) {
  const secret = process.env.SESSION_SECRET;
  const match = cookie?.match(/(?:^|;\s*)samiksha_session=([^;]+)/);
  if (!secret || !match) return null;
  try {
    const [user, timestamp, signature] = decodeURIComponent(match[1]).split(':');
    const payload = `${user}:${timestamp}`;
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    if (!signature || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    return Date.now() - Number(timestamp) < 7 * 24 * 60 * 60 * 1000 ? user : null;
  } catch { return null; }
}
function safeName(name: string) {
  const ext = path.extname(name).toLowerCase();
  const stem = path.basename(name, ext).replace(/[^a-z0-9_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'media';
  return { stem, ext };
}
async function refreshManifest(kind: 'music' | 'photos') {
  await execFileAsync(process.execPath, [path.join(root, 'scripts', kind === 'music' ? 'generate-music-manifest.mjs' : 'generate-photo-manifest.mjs')]);
}
async function listFiles(directory: string, sourceType: 'uploaded_audio' | 'uploaded_photo', playlist?: string) {
  try {
    const entries = await fs.readdir(directory, { withFileTypes: true });
    const files = await Promise.all(entries.filter((entry) => entry.isFile() && (sourceType === 'uploaded_audio'
      ? audioExtensions.has(path.extname(entry.name).toLowerCase())
      : path.extname(entry.name).toLowerCase() === '.webp')).map(async (entry) => {
      const stat = await fs.stat(path.join(directory, entry.name));
      return {
        id: `${sourceType}:${playlist ?? 'photos'}:${encodeURIComponent(entry.name)}`,
        collection: 'sam', storageKey: entry.name, sourceType, title: path.basename(entry.name, path.extname(entry.name)).replace(/[-_]+/g, ' '),
        url: sourceType === 'uploaded_audio' ? `/music/${playlists[playlist as keyof typeof playlists]}/${encodeURIComponent(entry.name)}` : `/Photos/optimized/${encodeURIComponent(entry.name)}`,
        mimeType: '', fileSize: stat.size, createdAt: stat.mtime.toISOString(), thumbnailUrl: sourceType === 'uploaded_photo' ? `/Photos/optimized/${encodeURIComponent(entry.name)}` : null,
      };
    }));
    return files.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch { return []; }
}

export default async function handler(req: Request): Promise<Response> {
  if (!sessionUser(req.headers.get('cookie'))) return json({ ok: false, error: 'Authentication required.' }, 401);
  const url = new URL(req.url);
  const mediaType = url.searchParams.get('mediaType') as 'audio' | 'photo' | null;
  const playlist = url.searchParams.get('playlist') as keyof typeof playlists | null;

  if (req.method === 'GET') {
    if (mediaType === 'audio' && playlist && playlists[playlist]) return json({ ok: true, items: await listFiles(path.join(musicRoot, playlists[playlist]), 'uploaded_audio', playlist) });
    if (mediaType === 'photo') return json({ ok: true, items: await listFiles(optimizedRoot, 'uploaded_photo') });
    return json({ ok: false, error: 'Invalid media request.' }, 400);
  }

  if (req.method === 'DELETE') {
    const name = url.searchParams.get('name');
    if (!name || path.basename(name) !== name) return json({ ok: false, error: 'Invalid media item.' }, 400);
    const target = mediaType === 'audio' && playlist && playlists[playlist]
      ? path.join(musicRoot, playlists[playlist], name)
      : mediaType === 'photo' ? path.join(optimizedRoot, name) : null;
    if (!target) return json({ ok: false, error: 'Invalid media request.' }, 400);
    try { await fs.unlink(target); } catch { return json({ ok: false, error: 'Media not found.' }, 404); }
    await refreshManifest(mediaType === 'audio' ? 'music' : 'photos');
    return json({ ok: true });
  }

  if (req.method !== 'POST') return json({ ok: false, error: 'Method not allowed.' }, 405);
  const form = await req.formData();
  const requestedType = form.get('mediaType');
  const requestedPlaylist = form.get('playlist') as keyof typeof playlists | null;
  const files = form.getAll('files').filter((entry): entry is File => entry instanceof File);
  if ((requestedType !== 'audio' && requestedType !== 'photo') || !files.length) return json({ ok: false, error: 'Select at least one file.' }, 400);
  if (requestedType === 'audio' && (!requestedPlaylist || !playlists[requestedPlaylist])) return json({ ok: false, error: 'Choose a playlist first.' }, 400);
  if (requestedType === 'audio' && files.length > 10) return json({ ok: false, error: 'You can upload up to 10 songs at once.' }, 400);

  const results: Array<{ ok: boolean; file?: string; error?: string }> = [];
  for (const file of files) {
    const { stem, ext } = safeName(file.name);
    const accepted = requestedType === 'audio' ? audioExtensions.has(ext) : photoExtensions.has(ext);
    // Photos have no application-level size/count cap: they are staged in the
    // temporary folder, then reduced to optimized WebP. Keep the audio limit.
    const oversizedAudio = requestedType === 'audio' && file.size > 100 * 1024 * 1024;
    if (!accepted || !file.size || oversizedAudio) {
      results.push({ ok: false, error: `Unsupported file${oversizedAudio ? ' or audio file over 100 MB' : ''}: ${file.name}` });
      continue;
    }
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    try {
      if (requestedType === 'audio') {
        const destination = path.join(musicRoot, playlists[requestedPlaylist!], `${stamp}-${stem}${ext}`);
        await fs.mkdir(path.dirname(destination), { recursive: true });
        await fs.writeFile(destination, Buffer.from(await file.arrayBuffer()));
        results.push({ ok: true, file: path.basename(destination) });
      } else {
        const temp = path.join(tempRoot, `${stamp}-${stem}${ext}`);
        const destination = path.join(optimizedRoot, `${stamp}-${stem}.webp`);
        await fs.mkdir(tempRoot, { recursive: true });
        await fs.writeFile(temp, Buffer.from(await file.arrayBuffer()));
        try {
          await execFileAsync('py', ['-3', path.join(root, 'scripts', 'convert-upload-image.py'), temp, destination]);
          results.push({ ok: true, file: path.basename(destination) });
        } finally { await fs.unlink(temp).catch(() => {}); }
      }
    } catch (error) {
      if (process.env.NODE_ENV !== 'production') {
        console.error('Local media processing failed:', error instanceof Error ? error.message : 'unknown error');
      }
      results.push({ ok: false, error: `Could not process ${file.name}.` });
    }
  }
  if (results.some((result) => result.ok)) await refreshManifest(requestedType === 'audio' ? 'music' : 'photos');
  return json({ ok: results.some((result) => result.ok), results });
}

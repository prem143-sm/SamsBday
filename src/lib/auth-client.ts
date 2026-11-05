const API_BASE = '';

export type AuthUser = { id: 'sam' | 'prem'; name: string; collection: string };
export interface AuthResponse { ok: boolean; user?: AuthUser; error?: string; retryAfter?: number; }
export interface MediaItem {
  id: string; collection: 'sam' | 'prem'; sourceType: 'uploaded_audio' | 'uploaded_photo';
  title: string; artist?: string; storageKey: string; url: string; mimeType: string;
  fileSize: number; duration?: number | null; createdAt: string; thumbnailUrl?: string | null;
}
export interface UploadResult { ok: boolean; media?: MediaItem; error?: string; }

let cachedUser: AuthUser | null = null;
let cacheExpiry = 0;

async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const isFormData = options.body instanceof FormData;
  return fetch(`${API_BASE}${path}`, {
    ...options,
    credentials: 'include',
    // Browsers must generate the multipart boundary for FormData themselves.
    headers: { ...(isFormData ? {} : { 'Content-Type': 'application/json' }), ...options.headers },
  });
}

export async function authenticateBirthday(samDob: string, premDob: string): Promise<AuthResponse> {
  const res = await apiFetch('/api/auth', { method: 'POST', body: JSON.stringify({ samDob, premDob }) });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => ({})) : { error: 'Authentication service is unavailable. Please restart the local server.' };
  if (res.ok && data.user) { cachedUser = data.user; cacheExpiry = Date.now() + 24 * 60 * 60 * 1000; }
  return { ok: res.ok, user: data.user, error: data.error, retryAfter: data.retryAfter };
}

export async function getSession(): Promise<AuthUser | null> {
  if (cachedUser && Date.now() < cacheExpiry) return cachedUser;
  try {
    const res = await apiFetch('/api/auth/session');
    if (res.ok) {
      const data = await res.json();
      if (data.user) { cachedUser = data.user; cacheExpiry = Date.now() + 24 * 60 * 60 * 1000; return data.user; }
    }
  } catch { /* Treat an unavailable local API as signed out. */ }
  cachedUser = null;
  return null;
}

export async function signOut(): Promise<void> {
  cachedUser = null; cacheExpiry = 0;
  await apiFetch('/api/auth/signout', { method: 'POST' }).catch(() => {});
}

export async function listMedia(mediaType: 'audio' | 'photo', playlist?: 'sams-playlist' | 'prems-playlist'): Promise<MediaItem[]> {
  const query = new URLSearchParams({ mediaType });
  if (playlist) query.set('playlist', playlist);
  const res = await apiFetch(`/api/local-media?${query}`);
  if (!res.ok) return [];
  return (await res.json().catch(() => ({ items: [] }))).items ?? [];
}

export async function uploadMedia(
  mediaType: 'audio' | 'photo', files: File[], playlist?: 'sams-playlist' | 'prems-playlist', onProgress?: (loaded: number, total: number) => void,
): Promise<UploadResult[]> {
  const formData = new FormData();
  files.forEach((file) => formData.append('files', file));
  formData.append('mediaType', mediaType);
  if (playlist) formData.append('playlist', playlist);
  onProgress?.(0, files.length);
  const res = await apiFetch('/api/local-media', { method: 'POST', headers: {} as Record<string, string>, body: formData });
  const data = await res.json().catch(() => ({}));
  onProgress?.(files.length, files.length);
  return (data.results ?? [{ ok: false, error: data.error || 'Upload failed.' }]).map((result: any) => ({ ok: result.ok, error: result.error }));
}

export async function deleteMedia(mediaType: 'audio' | 'photo', name: string, playlist?: 'sams-playlist' | 'prems-playlist'): Promise<{ ok: boolean; error?: string }> {
  const query = new URLSearchParams({ mediaType, name });
  if (playlist) query.set('playlist', playlist);
  const res = await apiFetch(`/api/local-media?${query}`, { method: 'DELETE' });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, error: data.error };
}

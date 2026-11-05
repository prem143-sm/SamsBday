import { get } from '@vercel/blob';

type MediaItem = { sourceType?: string; url?: string; title?: string; createdAt?: string };

async function collectionPhotos(collection: 'sam' | 'prem'): Promise<MediaItem[]> {
  try {
    const index = await get(`media/${collection}/index.json`);
    if (!index) return [];
    const value = await (await fetch(index.downloadUrl, { cache: 'no-store' })).json();
    return Array.isArray(value) ? value.filter((item) => item.sourceType === 'uploaded_photo') : [];
  } catch {
    return [];
  }
}

/** Public, cacheable gallery manifest. It intentionally exposes only already-public image URLs. */
export default async function handler(): Promise<Response> {
  const items = (await Promise.all([collectionPhotos('sam'), collectionPhotos('prem')])).flat();
  const photos = items
    .filter((item) => item.url)
    .map((item) => ({ src: item.url!, alt: item.title || 'Birthday memory' }));
  return Response.json({ photos }, { headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } });
}

import { get, put } from '@vercel/blob';

const DAILY_LIMIT = Number(process.env.MEDIA_DAILY_UPDATE_LIMIT || 5);
const COOLDOWN_MS = Number(process.env.MEDIA_UPDATE_COOLDOWN_SECONDS || 300) * 1000;
type Usage = { day: string; count: number; lastUpdateAt: number };

function dayInKolkata(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

async function readUsage(collection: string): Promise<Usage> {
  try {
    const blob = await get(`media/${collection}/update-policy.json`);
    if (!blob) return { day: dayInKolkata(), count: 0, lastUpdateAt: 0 };
    const value = await (await fetch(blob.downloadUrl, { cache: 'no-store' })).json();
    return { day: String(value.day || dayInKolkata()), count: Number(value.count || 0), lastUpdateAt: Number(value.lastUpdateAt || 0) };
  } catch { return { day: dayInKolkata(), count: 0, lastUpdateAt: 0 }; }
}

export async function updateStatus(collection: string) {
  const raw = await readUsage(collection);
  const usage = raw.day === dayInKolkata() ? raw : { ...raw, day: dayInKolkata(), count: 0 };
  const cooldownRemainingMs = Math.max(0, usage.lastUpdateAt + COOLDOWN_MS - Date.now());
  return { used: usage.count, limit: DAILY_LIMIT, remaining: Math.max(0, DAILY_LIMIT - usage.count), cooldownRemainingMs };
}

export async function ensureUpdateAllowed(collection: string): Promise<{ ok: true } | { ok: false; error: string; status: Awaited<ReturnType<typeof updateStatus>> }> {
  const status = await updateStatus(collection);
  if (status.used >= status.limit) return { ok: false, error: 'Daily update limit reached. Please try again tomorrow.', status };
  if (status.cooldownRemainingMs > 0) return { ok: false, error: `Please wait ${Math.ceil(status.cooldownRemainingMs / 1000)} seconds before another update.`, status };
  return { ok: true };
}

export async function recordSuccessfulUpdate(collection: string): Promise<void> {
  const status = await updateStatus(collection);
  await put(`media/${collection}/update-policy.json`, JSON.stringify({ day: dayInKolkata(), count: status.used + 1, lastUpdateAt: Date.now() }), {
    access: 'public', addRandomSuffix: false, contentType: 'application/json',
  });
}

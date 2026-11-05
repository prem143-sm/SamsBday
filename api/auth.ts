/**
 * Vercel Serverless Function: /api/auth
 *
 * Handles birthday-date authentication for Sam's and Prem's media collections.
 * Credentials are stored as Vercel Environment Variables (not in code):
 *   SAM_BIRTHDAY   (format: DD-MM-YYYY)
 *   PREM_BIRTHDAY  (format: DD-MM-YYYY)
 *   SESSION_SECRET (random string for signing session cookies)
 *
 * Returns an httpOnly, secure, sameSite=strict session cookie on success.
 * Rate limits failed attempts per IP.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';

// In-memory rate limiter (resets on cold start — sufficient for personal site).
const failedAttempts = new Map<string, { count: number; lockoutUntil: number }>();
const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const record = failedAttempts.get(ip);
  const now = Date.now();

  if (record && record.lockoutUntil > now) {
    return { allowed: false, retryAfter: record.lockoutUntil - now };
  }

  if (record && record.count >= MAX_FAILED_ATTEMPTS) {
    failedAttempts.set(ip, {
      count: record.count,
      lockoutUntil: now + LOCKOUT_MS,
    });
    return { allowed: false, retryAfter: LOCKOUT_MS };
  }

  return { allowed: true };
}

function recordFailedAttempt(ip: string): void {
  const record = failedAttempts.get(ip) || { count: 0, lockoutUntil: 0 };
  failedAttempts.set(ip, { count: record.count + 1, lockoutUntil: record.lockoutUntil });
}

function clearFailedAttempts(ip: string): void {
  failedAttempts.delete(ip);
}

/**
 * Constant-time comparison to avoid timing attacks.
 */
function secureCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function normalizeDob(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d{2}-\d{2}-\d{4}$/.test(trimmed)) return null;
  const [day, month, year] = trimmed.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
}

/**
 * Generate a signed session value.
 */
function signSession(userId: string, secret: string): string {
  const timestamp = Date.now().toString();
  const payload = `${userId}:${timestamp}`;
  const hmac = createHmac('sha256', secret).update(payload).digest('hex');
  return `${payload}:${hmac}`;
}

function verifySession(signed: string, secret: string): string | null {
  const parts = signed.split(':');
  if (parts.length !== 3) return null;
  const [userId, timestamp, hmac] = parts;
  const payload = `${userId}:${timestamp}`;
  const expected = createHmac('sha256', secret).update(payload).digest('hex');
  if (!secureCompare(hmac, expected)) return null;
  if (Date.now() - parseInt(timestamp, 10) > 7 * 24 * 60 * 60 * 1000) return null; // 7 days
  return userId;
}
async function handleAuth(req: Request): Promise<Response> {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    return new Response(JSON.stringify({ ok: false, error: 'Server misconfigured.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const ip = getClientIp(req);
  const url = new URL(req.url);
  const method = req.method;

  // ---- Session check ----
  if ((url.pathname.endsWith('/session') || url.searchParams.get('action') === 'session') && method === 'GET') {
    const cookie = req.headers.get('cookie') || '';
    const match = cookie.match(/(?:^|;\s*)samiksha_session=([^;]+)/);
    const userId = match ? verifySession(decodeURIComponent(match[1]), secret) : null;

    if (userId === 'sam' || userId === 'prem') {
      return Response.json({ ok: true, user: { id: userId, name: userId === 'sam' ? 'Sam' : 'Prem', collection: userId } });
    }
    return Response.json({ ok: false, user: null });
  }

  // ---- Signout ----
  if ((url.pathname.endsWith('/signout') || url.searchParams.get('action') === 'signout') && method === 'POST') {
    const secure = process.env.VERCEL || req.headers.get('x-forwarded-proto') === 'https' ? '; Secure' : '';
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': `samiksha_session=; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=0`,
      },
    });
  }

  // ---- Authenticate ----
  if (method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'Method not allowed.' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const rateLimit = checkRateLimit(ip);
  if (!rateLimit.allowed) {
    return new Response(
      JSON.stringify({ ok: false, error: 'Too many failed attempts. Please try again later.', retryAfter: rateLimit.retryAfter }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let body: { samDob?: unknown; premDob?: unknown };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: 'Invalid request body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const submittedSamDob = normalizeDob(body.samDob);
  const submittedPremDob = normalizeDob(body.premDob);

  if (!submittedSamDob || !submittedPremDob) {
    recordFailedAttempt(ip);
    return new Response(JSON.stringify({ ok: false, error: 'Please enter both valid DOBs.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Look up credentials only on the server. Do not let the browser pick a
  // collection: a valid password determines it without revealing which one.
  const samBirthday = process.env.SAM_BIRTHDAY;
  const premBirthday = process.env.PREM_BIRTHDAY;

  const expectedSamDob = normalizeDob(samBirthday);
  const expectedPremDob = normalizeDob(premBirthday);
  if (!expectedSamDob || !expectedPremDob) {
    return new Response(JSON.stringify({ ok: false, error: 'Server misconfigured.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Constant-time comparison — never log the actual date
  const credentialsMatch = secureCompare(submittedSamDob, expectedSamDob)
    && secureCompare(submittedPremDob, expectedPremDob);

  if (!credentialsMatch) {
    recordFailedAttempt(ip);
    return new Response(
      JSON.stringify({ ok: false, error: 'Incorrect DOB combination. Please try again.' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Success — clear any prior failed attempts and set session cookie
  clearFailedAttempts(ip);
  const collection = 'sam';
  const sessionValue = signSession(collection, secret);
  // Secure is required on deployed HTTPS sites but would prevent the local
  // HTTP Vite preview from keeping its session cookie.
  const secure = process.env.VERCEL || req.headers.get('x-forwarded-proto') === 'https' ? '; Secure' : '';
  const cookie = `samiksha_session=${encodeURIComponent(sessionValue)}; Path=/; HttpOnly${secure}; SameSite=Strict; Max-Age=${7 * 24 * 60 * 60}`;

  return new Response(
    JSON.stringify({
      ok: true,
      user: { id: collection, name: collection === 'sam' ? 'Sam' : 'Prem', collection },
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Set-Cookie': cookie,
      },
    }
  );
}

type VercelRequest = IncomingMessage & { body?: unknown };

function requestHeaders(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(name, value);
    else if (Array.isArray(value)) headers.set(name, value.join(', '));
  }
  return headers;
}

/**
 * Vite calls this with a Fetch Request; Vercel's Node runtime supplies the
 * parsed body on an IncomingMessage. Avoid reading the request stream here:
 * Vercel has already consumed it while parsing JSON bodies.
 */
async function handler(req: Request): Promise<Response>;
async function handler(req: VercelRequest, res: ServerResponse): Promise<void>;
async function handler(req: Request | VercelRequest, res?: ServerResponse): Promise<Response | void> {
  if (req instanceof Request) return handleAuth(req);

  if (!res) throw new Error('Vercel response object is unavailable.');

  const method = req.method ?? 'GET';
  const forwardedProtocol = req.headers['x-forwarded-proto'];
  const protocol = (Array.isArray(forwardedProtocol) ? forwardedProtocol[0] : forwardedProtocol)?.split(',')[0] ?? 'http';
  const host = req.headers.host ?? 'localhost';
  const body = req.body;
  const requestBody: string | undefined = body == null || method === 'GET' || method === 'HEAD'
    ? undefined
    : typeof body === 'string'
      ? body
      : body instanceof Uint8Array
        ? new TextDecoder().decode(body)
        : JSON.stringify(body);
  const request = new Request(new URL(req.url ?? '/api/auth', `${protocol}://${host}`), {
    method,
    headers: requestHeaders(req),
    body: requestBody,
  });
  const response = await handleAuth(request);
  res.statusCode = response.status;
  response.headers.forEach((value: string, key: string) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

export default handler;

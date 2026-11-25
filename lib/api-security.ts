import crypto from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/db';

type RateLimitOptions = {
  action: string;
  limit: number;
  windowSeconds: number;
  identifier?: string;
};

type MemoryWindow = { count: number; resetAt: number };

const memoryWindows = new Map<string, MemoryWindow>();
let databaseLimiterAvailable: boolean | null = null;

function requestIp(req: NextRequest) {
  const forwarded =
    req.headers.get('x-vercel-forwarded-for') ||
    req.headers.get('x-forwarded-for') ||
    req.headers.get('x-real-ip') ||
    '';
  return forwarded.split(',')[0]?.trim().slice(0, 64) || 'unknown';
}

function rateLimitKey(req: NextRequest, action: string, identifier = '') {
  return crypto
    .createHash('sha256')
    .update(`${action}|${requestIp(req)}|${identifier.trim().toLowerCase().slice(0, 200)}`)
    .digest('hex');
}

function consumeMemoryWindow(key: string, limit: number, windowSeconds: number) {
  const now = Date.now();
  const existing = memoryWindows.get(key);
  const entry = !existing || existing.resetAt <= now
    ? { count: 1, resetAt: now + windowSeconds * 1000 }
    : { ...existing, count: existing.count + 1 };
  memoryWindows.set(key, entry);

  if (memoryWindows.size > 5_000) {
    for (const [candidate, value] of memoryWindows) {
      if (value.resetAt <= now) memoryWindows.delete(candidate);
    }
  }

  return { allowed: entry.count <= limit, retryAfter: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)) };
}

export async function rateLimit(req: NextRequest, options: RateLimitOptions) {
  const action = options.action.replace(/[^a-z0-9_-]/gi, '').slice(0, 60);
  const limit = Math.max(1, Math.min(10_000, Math.floor(options.limit)));
  const windowSeconds = Math.max(1, Math.min(86_400, Math.floor(options.windowSeconds)));
  const keyHash = rateLimitKey(req, action, options.identifier);

  if (databaseLimiterAvailable !== false) {
    try {
      const { data, error } = await adminDb().rpc('consume_rate_limit', {
        p_key_hash: keyHash,
        p_action: action,
        p_window_seconds: windowSeconds,
        p_max_hits: limit,
      });
      if (!error && typeof data === 'boolean') {
        databaseLimiterAvailable = true;
        return { allowed: data, retryAfter: windowSeconds, distributed: true };
      }
      databaseLimiterAvailable = false;
      if (error?.code && !['PGRST202', '42883'].includes(error.code)) {
        console.warn('HER9AL RATE LIMITER FALLBACK', { code: error.code });
      }
    } catch {
      databaseLimiterAvailable = false;
    }
  }

  return { ...consumeMemoryWindow(`${action}:${keyHash}`, limit, windowSeconds), distributed: false };
}

export function rateLimitResponse(retryAfter: number) {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(retryAfter))) } },
  );
}

function expectedOrigins(req: NextRequest) {
  const origins = new Set<string>([req.nextUrl.origin]);
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const proto = req.headers.get('x-forwarded-proto') || req.nextUrl.protocol.replace(':', '');
  if (host && (proto === 'http' || proto === 'https')) origins.add(`${proto}://${host}`);
  return origins;
}

// SameSite cookies already block most cross-site writes. This additionally rejects
// browser requests that explicitly identify themselves as cross-site.
export function rejectCrossSite(req: NextRequest) {
  const fetchSite = req.headers.get('sec-fetch-site');
  if (fetchSite === 'cross-site') {
    return NextResponse.json({ error: 'Cross-site request rejected.' }, { status: 403 });
  }

  const origin = req.headers.get('origin');
  if (!origin) return null;
  try {
    if (expectedOrigins(req).has(new URL(origin).origin)) return null;
  } catch {}
  return NextResponse.json({ error: 'Invalid request origin.' }, { status: 403 });
}

export function appOrigin(req: NextRequest) {
  const configured = (process.env.APP_URL || '').trim().replace(/\/+$/, '');
  if (configured) {
    try {
      const parsed = new URL(configured);
      if (parsed.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:')) {
        return parsed.origin;
      }
    } catch {}
  }
  return req.nextUrl.origin;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

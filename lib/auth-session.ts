import crypto from 'crypto';

export type Her9alUser = {
  id: string;
  provider: 'google' | 'discord' | 'email';
  email?: string | null;
  name?: string | null;
  avatar?: string | null;
};

type SessionPayload = Her9alUser & { exp: number };

const COOKIE_NAME = 'her9al_session';

function b64url(input: Buffer | string) {
  return Buffer.from(input).toString('base64url');
}

function secret() {
  const value = process.env.AUTH_SECRET;
  if (!value) throw new Error('AUTH_SECRET is missing');
  return value;
}

export function createSessionToken(user: Her9alUser) {
  const payload: SessionPayload = {
    ...user,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7,
  };
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifySessionToken(token?: string | null): SessionPayload | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = crypto.createHmac('sha256', secret()).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== expected.length || !crypto.timingSafeEqual(got, expected)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (
      !payload.id ||
      !['google', 'discord', 'email'].includes(payload.provider) ||
      !payload.exp ||
      payload.exp < Math.floor(Date.now() / 1000)
    ) return null;
    return payload;
  } catch {
    return null;
  }
}

export const sessionCookie = {
  name: COOKIE_NAME,
  options: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
    priority: 'high' as const,
  },
};

export function makeState() {
  return crypto.randomBytes(24).toString('base64url');
}

export function stateMatches(received?: string | null, saved?: string | null) {
  if (!received || !saved) return false;
  const left = Buffer.from(received);
  const right = Buffer.from(saved);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

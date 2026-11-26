import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, sessionCookie } from '@/lib/auth-session';
import { adminDb } from '@/lib/db';
import { verifyPassword } from '@/lib/password';
import { rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
  const password = String(body.password || '');
  if (!email || !password) return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });

  const limited = await rateLimit(req, { action: 'auth-login', limit: 10, windowSeconds: 900, identifier: email });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  try {
    const db = adminDb();
    const { data: user } = await db.from('app_users').select('*').eq('provider', 'email').eq('email', email).maybeSingle();
    if (!user || !verifyPassword(password, user.password_hash)) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    const token = createSessionToken({ id: user.id, provider: 'email', email: user.email, name: user.display_name, avatar: user.avatar_url });
    const res = NextResponse.json({ ok: true, user: { id: user.id, email: user.email, display_name: user.display_name, avatar_url: user.avatar_url, role: user.role } });
    res.cookies.set(sessionCookie.name, token, sessionCookie.options);
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch (error) {
    console.error('HER9AL LOGIN ERROR', { message: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ error: 'Sign-in is temporarily unavailable.' }, { status: 503 });
  }
}

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
  const email = String(body.email || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!email || !password) return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 });
  if (email.length > 320 || password.length > 128) return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });

  const ipLimit = await rateLimit(req, { action: 'email-login-ip', limit: 30, windowSeconds: 900 });
  if (!ipLimit.allowed) return rateLimitResponse(ipLimit.retryAfter);
  const accountLimit = await rateLimit(req, { action: 'email-login-account', limit: 10, windowSeconds: 900, identifier: email });
  if (!accountLimit.allowed) return rateLimitResponse(accountLimit.retryAfter);

  try {
    const db = adminDb();
    const { data: user } = await db.from('app_users').select('id,email,display_name,avatar_url,role,provider,password_hash').eq('provider', 'email').eq('email', email).maybeSingle();
    if (!user || !(await verifyPassword(password, user.password_hash))) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    const token = createSessionToken({ id: user.id, provider: 'email', email: user.email, name: user.display_name, avatar: user.avatar_url });
    const res = NextResponse.json({ ok: true, user: { id: user.id, email: user.email, display_name: user.display_name, avatar_url: user.avatar_url, role: user.role, provider: user.provider } });
    res.cookies.set(sessionCookie.name, token, sessionCookie.options);
    return res;
  } catch {
    return NextResponse.json({ error: 'Login service is unavailable.' }, { status: 503 });
  }
}

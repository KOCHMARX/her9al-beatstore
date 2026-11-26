import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, sessionCookie } from '@/lib/auth-session';
import { adminDb } from '@/lib/db';
import { hashPassword } from '@/lib/password';
import { rateLimit, rateLimitResponse, rejectCrossSite } from '@/lib/api-security';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const crossSite = rejectCrossSite(req);
  if (crossSite) return crossSite;
  const body = await req.json().catch(() => ({}));
  const email = String(body.email || '').trim().toLowerCase().slice(0, 254);
  const password = String(body.password || '');
  const displayName = String(body.display_name || '').trim().slice(0, 50);

  if (!/^\S+@\S+\.\S+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 });
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 });
  if (password.length > 200) return NextResponse.json({ error: 'Password is too long.' }, { status: 400 });

  const limited = await rateLimit(req, { action: 'auth-signup', limit: 5, windowSeconds: 3600, identifier: email });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  try {
    const db = adminDb();
    const { data: existing } = await db.from('app_users').select('id').eq('provider', 'email').eq('email', email).maybeSingle();
    if (existing) return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });

    const ownerEmail = (process.env.OWNER_EMAIL || '').trim().toLowerCase();
    const { data: user, error } = await db.from('app_users').insert({
      provider: 'email',
      provider_user_id: email,
      email,
      display_name: displayName || email.split('@')[0],
      password_hash: hashPassword(password),
      role: ownerEmail === email && ownerEmail ? 'owner' : 'customer',
    }).select('id,email,display_name,avatar_url,role,provider').single();

    if (error?.code === '23505') return NextResponse.json({ error: 'An account with this email already exists.' }, { status: 409 });
    if (error || !user) {
      console.error('HER9AL SIGNUP ERROR', { code: error?.code });
      return NextResponse.json({ error: 'Could not create account. Please try again.' }, { status: 400 });
    }

    const token = createSessionToken({ id: user.id, provider: 'email', email: user.email, name: user.display_name, avatar: user.avatar_url });
    const res = NextResponse.json({ ok: true, user });
    res.cookies.set(sessionCookie.name, token, sessionCookie.options);
    res.headers.set('Cache-Control', 'no-store');
    return res;
  } catch (error) {
    console.error('HER9AL SIGNUP ERROR', { message: error instanceof Error ? error.message : 'unknown' });
    return NextResponse.json({ error: 'Sign-up is temporarily unavailable.' }, { status: 503 });
  }
}

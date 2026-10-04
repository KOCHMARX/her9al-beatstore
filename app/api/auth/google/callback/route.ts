import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, sessionCookie } from '@/lib/auth-session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const savedState = req.cookies.get('her9al_google_state')?.value;
  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL('/login?error=google_state', req.url));
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return NextResponse.redirect(new URL('/login?error=google_config', req.url));

  const redirectUri = `${req.nextUrl.origin}/api/auth/google/callback`;
  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
    cache: 'no-store',
  });
  if (!tokenRes.ok) return NextResponse.redirect(new URL('/login?error=google_token', req.url));
  const token = await tokenRes.json();

  const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { authorization: `Bearer ${token.access_token}` },
    cache: 'no-store',
  });
  if (!profileRes.ok) return NextResponse.redirect(new URL('/login?error=google_profile', req.url));
  const profile = await profileRes.json();

  const session = createSessionToken({
    id: String(profile.sub),
    provider: 'google',
    email: profile.email ?? null,
    name: profile.name ?? null,
    avatar: profile.picture ?? null,
  });

  const res = NextResponse.redirect(new URL('/', req.url));
  res.cookies.set(sessionCookie.name, session, sessionCookie.options);
  res.cookies.delete('her9al_google_state');
  return res;
}

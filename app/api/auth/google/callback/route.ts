import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, sessionCookie, stateMatches } from '@/lib/auth-session';
import { upsertOAuthUser } from '@/lib/db';
import { appOrigin, rateLimit, rateLimitResponse } from '@/lib/api-security';

export const runtime = 'nodejs';

const STATE_COOKIE = 'her9al_google_state';

function loginRedirect(req: NextRequest, error: string) {
  const res = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, appOrigin(req)));
  res.cookies.set(STATE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/google/callback',
    maxAge: 0,
  });
  return res;
}

export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, { action: 'oauth-google-callback', limit: 30, windowSeconds: 900 });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const providerError = req.nextUrl.searchParams.get('error');
  if (providerError) return loginRedirect(req, 'google_cancelled');

  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const saved = req.cookies.get(STATE_COOKIE)?.value;
  if (!code || !stateMatches(state, saved)) return loginRedirect(req, 'google_state');

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return loginRedirect(req, 'google_config');

  try {
    const redirectUri = `${appOrigin(req)}/api/auth/google/callback`;
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' }),
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    if (!tokenRes.ok) return loginRedirect(req, 'google_token');
    const token = await tokenRes.json() as { access_token?: string };
    if (!token.access_token) return loginRedirect(req, 'google_token');

    const profileRes = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: { authorization: `Bearer ${token.access_token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    if (!profileRes.ok) return loginRedirect(req, 'google_profile');
    const profile = await profileRes.json() as { sub?: string; email?: string; name?: string; picture?: string };
    if (!profile.sub) return loginRedirect(req, 'google_profile');

    const appUser = await upsertOAuthUser({
      provider: 'google',
      providerUserId: profile.sub,
      email: profile.email ?? null,
      name: profile.name ?? null,
      avatar: profile.picture ?? null,
    });
    const session = createSessionToken({
      id: appUser.id,
      provider: 'google',
      email: appUser.email,
      name: appUser.display_name,
      avatar: appUser.avatar_url,
    });
    const res = NextResponse.redirect(new URL('/profile', appOrigin(req)));
    res.cookies.set(sessionCookie.name, session, sessionCookie.options);
    res.cookies.set(STATE_COOKIE, '', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/api/auth/google/callback',
      maxAge: 0,
    });
    return res;
  } catch {
    return loginRedirect(req, 'google_unavailable');
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { makeState } from '@/lib/auth-session';
import { appOrigin, rateLimit, rateLimitResponse } from '@/lib/api-security';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, { action: 'oauth-google-start', limit: 30, windowSeconds: 900 });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: 'GOOGLE_CLIENT_ID is missing' }, { status: 500 });

  const state = makeState();
  const redirectUri = `${appOrigin(req)}/api/auth/google/callback`;
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');

  const res = NextResponse.redirect(url);
  res.cookies.set('her9al_google_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/google/callback',
    maxAge: 600,
    priority: 'high',
  });
  return res;
}

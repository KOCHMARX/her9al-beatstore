import { NextRequest, NextResponse } from 'next/server';
import { makeState } from '@/lib/auth-session';
import { oauthRequestContext, oauthStateCookie, startOAuthFlow } from '@/lib/oauth-flow';

export const runtime = 'nodejs';

function appRedirect(path: string) {
  return new NextResponse(null, { status: 307, headers: { location: path } });
}

export async function GET(req: NextRequest) {
  const flow = startOAuthFlow('google', oauthRequestContext(req));
  if (flow.kind !== 'redirect') return appRedirect(flow.path);

  const state = makeState();
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.searchParams.set('client_id', process.env.GOOGLE_CLIENT_ID || '');
  url.searchParams.set('redirect_uri', flow.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'openid email profile');
  url.searchParams.set('state', state);
  url.searchParams.set('prompt', 'select_account');

  const res = NextResponse.redirect(url);
  res.cookies.set(oauthStateCookie('google'), state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}

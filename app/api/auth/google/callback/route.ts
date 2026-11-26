import { NextRequest, NextResponse } from 'next/server';
import { sessionCookie } from '@/lib/auth-session';
import { upsertOAuthUser } from '@/lib/db';
import { completeOAuthFlow, oauthRedirectUri, oauthRequestContext } from '@/lib/oauth-flow';

export const runtime = 'nodejs';

function appRedirect(path: string) {
  return new NextResponse(null, { status: 307, headers: { location: path } });
}

export async function GET(req: NextRequest) {
  const context = oauthRequestContext(req);
  const outcome = await completeOAuthFlow({
    provider: 'google',
    code: req.nextUrl.searchParams.get('code'),
    state: req.nextUrl.searchParams.get('state'),
    savedState: req.cookies.get('her9al_google_state')?.value,
    providerError: req.nextUrl.searchParams.get('error'),
    redirectUri: oauthRedirectUri('google', context),
    upsertUser: upsertOAuthUser,
  });

  const res = outcome.kind === 'session' ? appRedirect('/profile') : appRedirect(outcome.path);
  if (outcome.kind === 'session') res.cookies.set(sessionCookie.name, outcome.token, sessionCookie.options);
  res.cookies.delete(outcome.stateCookie);
  return res;
}

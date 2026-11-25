import { NextRequest, NextResponse } from 'next/server';
import { makeState } from '@/lib/auth-session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) return NextResponse.json({ error: 'DISCORD_CLIENT_ID is missing' }, { status: 500 });

  const state = makeState();
  const redirectUri = `${req.nextUrl.origin}/api/auth/discord/callback`;
  const url = new URL('https://discord.com/oauth2/authorize');
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify email');
  url.searchParams.set('state', state);

  const res = NextResponse.redirect(url);
  res.cookies.set('her9al_discord_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 600,
  });
  return res;
}

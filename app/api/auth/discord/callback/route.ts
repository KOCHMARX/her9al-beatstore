import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, sessionCookie } from '@/lib/auth-session';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const savedState = req.cookies.get('her9al_discord_state')?.value;
  if (!code || !state || !savedState || state !== savedState) {
    return NextResponse.redirect(new URL('/login?error=discord_state', req.url));
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) return NextResponse.redirect(new URL('/login?error=discord_config', req.url));

  const redirectUri = `${req.nextUrl.origin}/api/auth/discord/callback`;
  const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
    }),
    cache: 'no-store',
  });
  if (!tokenRes.ok) return NextResponse.redirect(new URL('/login?error=discord_token', req.url));
  const token = await tokenRes.json();

  const profileRes = await fetch('https://discord.com/api/users/@me', {
    headers: { authorization: `Bearer ${token.access_token}` },
    cache: 'no-store',
  });
  if (!profileRes.ok) return NextResponse.redirect(new URL('/login?error=discord_profile', req.url));
  const profile = await profileRes.json();
  const avatar = profile.avatar
    ? `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.png?size=256`
    : null;

  const session = createSessionToken({
    id: String(profile.id),
    provider: 'discord',
    email: profile.email ?? null,
    name: profile.global_name ?? profile.username ?? null,
    avatar,
  });

  const res = NextResponse.redirect(new URL('/', req.url));
  res.cookies.set(sessionCookie.name, session, sessionCookie.options);
  res.cookies.delete('her9al_discord_state');
  return res;
}

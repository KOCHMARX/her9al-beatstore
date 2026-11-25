import { NextRequest, NextResponse } from 'next/server';
import { createSessionToken, sessionCookie, stateMatches } from '@/lib/auth-session';
import { upsertOAuthUser } from '@/lib/db';
import { appOrigin, rateLimit, rateLimitResponse } from '@/lib/api-security';

export const runtime = 'nodejs';

const STATE_COOKIE = 'her9al_discord_state';

function loginRedirect(req: NextRequest, error: string) {
  const res = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, appOrigin(req)));
  res.cookies.set(STATE_COOKIE, '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/api/auth/discord/callback',
    maxAge: 0,
  });
  return res;
}

export async function GET(req: NextRequest) {
  const limited = await rateLimit(req, { action: 'oauth-discord-callback', limit: 30, windowSeconds: 900 });
  if (!limited.allowed) return rateLimitResponse(limited.retryAfter);

  const providerError = req.nextUrl.searchParams.get('error');
  if (providerError) return loginRedirect(req, 'discord_cancelled');

  const code = req.nextUrl.searchParams.get('code');
  const state = req.nextUrl.searchParams.get('state');
  const saved = req.cookies.get(STATE_COOKIE)?.value;
  if (!code || !stateMatches(state, saved)) return loginRedirect(req, 'discord_state');

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) return loginRedirect(req, 'discord_config');

  try {
    const redirectUri = `${appOrigin(req)}/api/auth/discord/callback`;
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    if (!tokenRes.ok) return loginRedirect(req, 'discord_token');
    const token = await tokenRes.json() as { access_token?: string };
    if (!token.access_token) return loginRedirect(req, 'discord_token');

    const profileRes = await fetch('https://discord.com/api/users/@me', {
      headers: { authorization: `Bearer ${token.access_token}` },
      cache: 'no-store',
      signal: AbortSignal.timeout(12_000),
    });
    if (!profileRes.ok) return loginRedirect(req, 'discord_profile');
    const profile = await profileRes.json() as { id?: string; email?: string; global_name?: string; username?: string; avatar?: string };
    if (!profile.id) return loginRedirect(req, 'discord_profile');
    const avatar = profile.avatar
      ? `https://cdn.discordapp.com/avatars/${encodeURIComponent(profile.id)}/${encodeURIComponent(profile.avatar)}.png?size=256`
      : null;

    const appUser = await upsertOAuthUser({
      provider: 'discord',
      providerUserId: profile.id,
      email: profile.email ?? null,
      name: profile.global_name ?? profile.username ?? null,
      avatar,
    });
    const session = createSessionToken({
      id: appUser.id,
      provider: 'discord',
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
      path: '/api/auth/discord/callback',
      maxAge: 0,
    });
    return res;
  } catch {
    return loginRedirect(req, 'discord_unavailable');
  }
}

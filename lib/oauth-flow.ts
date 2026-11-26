import { createSessionToken, stateMatches, type Her9alUser } from './auth-session.ts';
import { oauthRedirectOrigin, type OriginPolicyInput } from './origin-policy.ts';

export type OAuthProvider = 'google' | 'discord';
type OAuthEnv = Record<string, string | undefined>;

export const OAUTH_ENV_NAMES: Record<OAuthProvider, readonly string[]> = {
  google: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'AUTH_SECRET'],
  discord: ['DISCORD_CLIENT_ID', 'DISCORD_CLIENT_SECRET', 'AUTH_SECRET'],
};

export type OAuthProfile = {
  provider: OAuthProvider;
  providerUserId: string;
  email: string | null;
  name: string | null;
  avatar: string | null;
};

export type OAuthAppUser = {
  id: string;
  email: string | null;
  display_name: string | null;
  avatar_url: string | null;
};

export type OAuthStart =
  | { kind: 'config'; missing: string[]; path: string }
  | { kind: 'origin'; path: string }
  | { kind: 'redirect'; redirectUri: string };

export type OAuthCallbackOutcome =
  | { kind: 'redirect'; path: string; stateCookie: string }
  | { kind: 'session'; token: string; stateCookie: string };

export function missingOAuthEnv(provider: OAuthProvider, env: OAuthEnv = process.env): string[] {
  return OAUTH_ENV_NAMES[provider].filter(name => !(env[name] || '').trim());
}

export function logMissingOAuthEnv(provider: OAuthProvider, missing: string[]) {
  if (missing.length) console.error(`HER9AL ${provider.toUpperCase()} OAUTH CONFIG MISSING`, missing);
}

export function oauthStateCookie(provider: OAuthProvider): string {
  return `her9al_${provider}_state`;
}

export function oauthErrorPath(provider: OAuthProvider, reason: string): string {
  return `/login?error=${provider}_${reason}`;
}

export function oauthConfigPath(provider: OAuthProvider): string {
  return oauthErrorPath(provider, 'not_configured');
}

export function oauthRedirectUri(
  provider: OAuthProvider,
  input: OriginPolicyInput,
  env: OAuthEnv = process.env,
): string | null {
  const origin = oauthRedirectOrigin({ ...input, isProduction: env.VERCEL_ENV === 'production' || input.isProduction });
  if (!origin) return null;
  return `${origin}/api/auth/${provider}/callback`;
}

export function startOAuthFlow(
  provider: OAuthProvider,
  input: OriginPolicyInput,
  env: OAuthEnv = process.env,
): OAuthStart {
  const missing = missingOAuthEnv(provider, env);
  if (missing.length) {
    logMissingOAuthEnv(provider, missing);
    return { kind: 'config', missing, path: oauthConfigPath(provider) };
  }
  const redirectUri = oauthRedirectUri(provider, input, env);
  if (!redirectUri) return { kind: 'origin', path: oauthErrorPath(provider, 'origin') };
  return { kind: 'redirect', redirectUri };
}

export function oauthRequestContext(
  req: { nextUrl: URL; headers: Headers },
  env: OAuthEnv = process.env,
): OriginPolicyInput {
  const forwarded = req.headers.get('x-forwarded-proto')?.split(',')[0].trim();
  const proto = forwarded === 'http' || forwarded === 'https'
    ? forwarded
    : req.nextUrl.protocol.replace(/:$/, '');
  const host = req.headers.get('host')?.trim() || req.nextUrl.host;
  const requestOrigin = req.headers.get('origin')?.trim() || `${proto}://${host}`;
  return {
    requestOrigin,
    host,
    proto,
    appUrl: env.APP_URL,
    vercelUrl: env.VERCEL_URL,
    vercelBranchUrl: env.VERCEL_BRANCH_URL,
    isProduction: env.VERCEL_ENV === 'production' || env.NODE_ENV === 'production',
  };
}

export async function completeOAuthFlow(input: {
  provider: OAuthProvider;
  code: string | null;
  state: string | null;
  savedState: string | null | undefined;
  providerError?: string | null;
  redirectUri: string | null;
  env?: OAuthEnv;
  fetchImpl?: typeof fetch;
  upsertUser: (profile: OAuthProfile) => Promise<OAuthAppUser>;
  createSession?: (user: Her9alUser) => string;
}): Promise<OAuthCallbackOutcome> {
  const provider = input.provider;
  const env = input.env ?? process.env;
  const fetchImpl = input.fetchImpl ?? fetch;
  const stateCookie = oauthStateCookie(provider);
  const fail = (reason: string): OAuthCallbackOutcome => ({
    kind: 'redirect',
    path: reason === 'database' ? '/login?error=database' : oauthErrorPath(provider, reason),
    stateCookie,
  });

  if (input.providerError) return fail('denied');

  const missing = missingOAuthEnv(provider, env);
  if (missing.length) {
    logMissingOAuthEnv(provider, missing);
    return fail('not_configured');
  }
  if (!input.code || !stateMatches(input.savedState, input.state)) return fail('state');
  if (!input.redirectUri) return fail('origin');

  const clientId = (env[`${provider.toUpperCase()}_CLIENT_ID`] || '').trim();
  const clientSecret = (env[`${provider.toUpperCase()}_CLIENT_SECRET`] || '').trim();
  const isGoogle = provider === 'google';
  const tokenUrl = isGoogle
    ? 'https://oauth2.googleapis.com/token'
    : 'https://discord.com/api/oauth2/token';
  const profileUrl = isGoogle
    ? 'https://openidconnect.googleapis.com/v1/userinfo'
    : 'https://discord.com/api/users/@me';
  const tokenBody = new URLSearchParams(isGoogle
    ? {
        code: input.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: input.redirectUri,
        grant_type: 'authorization_code',
      }
    : {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: input.code,
        redirect_uri: input.redirectUri,
      });

  let tokenRes: Response;
  try {
    tokenRes = await fetchImpl(tokenUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
      cache: 'no-store',
    });
  } catch (error) {
    console.error(`HER9AL ${provider.toUpperCase()} OAUTH TOKEN ERROR:`, error);
    return fail('token');
  }
  if (!tokenRes.ok) return fail('token');
  const token = await tokenRes.json().catch(() => null) as { access_token?: unknown } | null;
  const accessToken = typeof token?.access_token === 'string' ? token.access_token : '';
  if (!accessToken) return fail('token');

  let profileRes: Response;
  try {
    profileRes = await fetchImpl(profileUrl, {
      headers: { authorization: `Bearer ${accessToken}` },
      cache: 'no-store',
    });
  } catch (error) {
    console.error(`HER9AL ${provider.toUpperCase()} OAUTH PROFILE ERROR:`, error);
    return fail('profile');
  }
  if (!profileRes.ok) return fail('profile');
  const profile = await profileRes.json().catch(() => null) as Record<string, unknown> | null;
  if (!profile) return fail('profile');
  // Owner role is assigned by email match, so both providers must confirm the address.
  if (profile.email_verified !== true && (isGoogle || profile.verified !== true)) return fail('email_unverified');

  const providerUserId = String(isGoogle ? profile.sub : profile.id || '');
  if (!providerUserId) return fail('profile');
  const avatar = isGoogle
    ? (typeof profile.picture === 'string' ? profile.picture : null)
    : (profile.avatar ? `https://cdn.discordapp.com/avatars/${providerUserId}/${profile.avatar}.png?size=256` : null);
  const name = isGoogle
    ? (typeof profile.name === 'string' ? profile.name : null)
    : (typeof profile.global_name === 'string' ? profile.global_name : typeof profile.username === 'string' ? profile.username : null);
  const email = typeof profile.email === 'string' ? profile.email : null;

  try {
    const appUser = await input.upsertUser({ provider, providerUserId, email, name, avatar });
    const user: Her9alUser = {
      id: appUser.id,
      provider,
      email: appUser.email,
      name: appUser.display_name,
      avatar: appUser.avatar_url,
    };
    const token = (input.createSession ?? createSessionToken)(user);
    return { kind: 'session', token, stateCookie };
  } catch (error) {
    console.error(`HER9AL ${provider.toUpperCase()} OAUTH SESSION ERROR:`, error);
    return fail('database');
  }
}

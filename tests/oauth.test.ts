import assert from 'node:assert/strict';
import test from 'node:test';
import { verifySessionToken } from '../lib/auth-session.ts';
import {
  completeOAuthFlow,
  missingOAuthEnv,
  oauthRedirectUri,
  oauthStateCookie,
  startOAuthFlow,
  type OAuthAppUser,
  type OAuthProfile,
} from '../lib/oauth-flow.ts';

process.env.AUTH_SECRET = 'test-auth-secret';

const env = {
  GOOGLE_CLIENT_ID: 'fake-google-client-id',
  GOOGLE_CLIENT_SECRET: 'fake-google-client-secret',
  DISCORD_CLIENT_ID: 'fake-discord-client-id',
  DISCORD_CLIENT_SECRET: 'fake-discord-client-secret',
  AUTH_SECRET: 'test-auth-secret',
};

const safeInput = {
  requestOrigin: 'https://her9al-preview.vercel.app',
  host: 'her9al-preview.vercel.app',
  proto: 'https',
  vercelBranchUrl: 'https://her9al-preview.vercel.app',
  vercelUrl: 'https://her9al-deployment.vercel.app',
  appUrl: 'https://her9al-beatstore.vercel.app',
  isProduction: true,
};

const appUser: OAuthAppUser = {
  id: '11111111-2222-4333-8444-555555555555',
  email: 'artist@example.com',
  display_name: 'Artist',
  avatar_url: null,
};

function fakeFetch(responses: Response[]) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    const next = responses.shift();
    if (!next) throw new Error('No mocked OAuth response');
    return next;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

function okResponse(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
}

function baseInput(overrides: Partial<Parameters<typeof completeOAuthFlow>[0]> = {}) {
  const { impl } = fakeFetch([
    okResponse({ access_token: 'test-access-token' }),
    okResponse({ sub: 'google-user-1', email: 'artist@example.com', email_verified: true, name: 'Artist', picture: null }),
  ]);
  return {
    provider: 'google' as const,
    code: 'auth-code',
    state: 'state-1',
    savedState: 'state-1',
    redirectUri: 'https://her9al-preview.vercel.app/api/auth/google/callback',
    env,
    fetchImpl: impl,
    upsertUser: async (_profile: OAuthProfile) => appUser,
    ...overrides,
  };
}

test('missing OAuth config lists variable names only and redirects to a friendly page', () => {
  const original = console.error;
  console.error = () => {};
  try {
    const missingEnv = { GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', AUTH_SECRET: '' };
    assert.deepEqual(missingOAuthEnv('google', missingEnv), ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'AUTH_SECRET']);
    const flow = startOAuthFlow('google', safeInput, missingEnv);
    assert.equal(flow.kind, 'config');
    assert.equal(flow.path, '/login?error=google_not_configured');
  } finally {
    console.error = original;
  }
});

test('OAuth redirect_uri is derived from allowlisted Vercel hosts, never an unknown host', () => {
  assert.equal(
    oauthRedirectUri('google', { ...safeInput, requestOrigin: 'https://evil.example', host: 'evil.example' }, env),
    'https://her9al-preview.vercel.app/api/auth/google/callback',
  );
  assert.equal(
    oauthRedirectUri('discord', safeInput, env),
    'https://her9al-preview.vercel.app/api/auth/discord/callback',
  );
  assert.equal(
    oauthRedirectUri('google', { requestOrigin: 'http://localhost:3000', host: 'localhost:3000', proto: 'http', isProduction: false }, env),
    'http://localhost:3000/api/auth/google/callback',
  );
});

test('OAuth state mismatch, missing state cookie and access_denied redirect safely', async () => {
  assert.equal(oauthStateCookie('google'), 'her9al_google_state');
  const mismatch = await completeOAuthFlow(baseInput({ savedState: 'different-state' }));
  assert.equal(mismatch.kind, 'redirect');
  assert.equal(mismatch.path, '/login?error=google_state');

  const missingCookie = await completeOAuthFlow(baseInput({ savedState: undefined }));
  assert.equal(missingCookie.kind, 'redirect');
  assert.equal(missingCookie.path, '/login?error=google_state');

  const denied = await completeOAuthFlow(baseInput({ providerError: 'access_denied' }));
  assert.equal(denied.kind, 'redirect');
  assert.equal(denied.path, '/login?error=google_denied');
});

test('failed token exchange and unverified email do not create a session', async () => {
  const { impl } = fakeFetch([new Response('bad request', { status: 400 })]);
  const tokenFailure = await completeOAuthFlow(baseInput({ fetchImpl: impl }));
  assert.equal(tokenFailure.kind, 'redirect');
  assert.equal(tokenFailure.path, '/login?error=google_token');

  const { impl: profileFetch } = fakeFetch([
    okResponse({ access_token: 'test-access-token' }),
    okResponse({ sub: 'google-user-2', email: 'artist@example.com', email_verified: false, name: 'Artist' }),
  ]);
  const unverified = await completeOAuthFlow(baseInput({ fetchImpl: profileFetch }));
  assert.equal(unverified.kind, 'redirect');
  assert.equal(unverified.path, '/login?error=google_email_unverified');
});

test('unverified Discord email cannot create an owner-eligible session', async () => {
  const { impl } = fakeFetch([
    okResponse({ access_token: 'test-access-token' }),
    okResponse({ id: 'discord-user-1', email: 'owner@example.com', verified: false, username: 'Artist' }),
  ]);
  process.env.OWNER_EMAIL = 'owner@example.com';
  const outcome = await completeOAuthFlow(baseInput({
    provider: 'discord',
    redirectUri: 'https://her9al-preview.vercel.app/api/auth/discord/callback',
    fetchImpl: impl,
  }));
  assert.equal(outcome.kind, 'redirect');
  assert.equal(outcome.path, '/login?error=discord_email_unverified');
});

test('successful Google callback creates a signed session with the allowlisted redirect_uri', async () => {
  const { impl, calls } = fakeFetch([
    okResponse({ access_token: 'test-access-token' }),
    okResponse({ sub: 'google-user-3', email: 'artist@example.com', email_verified: true, name: 'Artist', picture: null }),
  ]);
  const outcome = await completeOAuthFlow(baseInput({ fetchImpl: impl }));
  assert.equal(outcome.kind, 'session');
  if (outcome.kind !== 'session') return;
  assert.equal(outcome.stateCookie, 'her9al_google_state');
  const session = verifySessionToken(outcome.token);
  assert.equal(session?.provider, 'google');
  assert.equal(session?.id, appUser.id);

  const tokenBody = new URLSearchParams(String(calls[0].init?.body));
  assert.equal(tokenBody.get('redirect_uri'), 'https://her9al-preview.vercel.app/api/auth/google/callback');
  assert.equal(tokenBody.get('code'), 'auth-code');
});

test('failed user upsert redirects to a generic database error', async () => {
  const original = console.error;
  console.error = () => {};
  try {
    const outcome = await completeOAuthFlow(baseInput({
      upsertUser: async () => { throw new Error('database unavailable'); },
    }));
    assert.equal(outcome.kind, 'redirect');
    assert.equal(outcome.path, '/login?error=database');
  } finally {
    console.error = original;
  }
});

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';

function availablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      server.close(error => error ? reject(error) : resolve(port));
    });
  });
}

function waitUntilReady(child, output) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Next server did not become ready.\n${output.join('')}`)), 20_000);
    const onData = chunk => {
      const text = chunk.toString();
      output.push(text);
      if (/Ready in|Ready on/i.test(text)) {
        clearTimeout(timeout);
        child.stdout.off('data', onData);
        resolve();
      }
    };
    child.stdout.on('data', onData);
    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`Next server exited before readiness (${code}).\n${output.join('')}`));
    });
  });
}

async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([
    new Promise(resolve => child.once('exit', resolve)),
    new Promise(resolve => setTimeout(resolve, 5_000)),
  ]);
  if (child.exitCode === null) child.kill('SIGKILL');
}

const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const output = [];
const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
const child = spawn(process.execPath, [nextBin, 'start', '-p', String(port)], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    APP_URL: origin,
    AUTH_SECRET: 'integration-test-secret-that-is-longer-than-thirty-two-bytes',
    GOOGLE_CLIENT_ID: 'dummy-google-client',
    GOOGLE_CLIENT_SECRET: 'dummy-google-secret',
    DISCORD_CLIENT_ID: 'dummy-discord-client',
    DISCORD_CLIENT_SECRET: 'dummy-discord-secret',
    STRIPE_WEBHOOK_SECRET: 'whsec_integration_test_only',
    SUPABASE_URL: '',
    NEXT_PUBLIC_SUPABASE_URL: '',
    SUPABASE_SERVICE_ROLE_KEY: '',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stderr.on('data', chunk => output.push(chunk.toString()));

try {
  await waitUntilReady(child, output);

  const pages = ['/', '/beats', '/distribution', '/distribution/studio', '/admin', '/admin/distribution', '/login', '/signup', '/library', '/profile'];
  for (const page of pages) {
    const response = await fetch(`${origin}${page}`, { redirect: 'manual' });
    assert.equal(response.status, 200, `${page} should render`);
  }

  const protectedGets = ['/api/profile', '/api/library', '/api/admin/beats', '/api/admin/releases', '/api/distribution/artist', '/api/distribution/releases'];
  for (const route of protectedGets) {
    const response = await fetch(`${origin}${route}`, { redirect: 'manual' });
    assert.ok(response.status === 401 || response.status === 403, `${route} should require authentication (got ${response.status})`);
  }

  for (const route of ['/api/checkout', '/api/distribution/upload', '/api/library/claim-free', '/api/admin/licenses']) {
    const response = await fetch(`${origin}${route}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      redirect: 'manual',
    });
    assert.equal(response.status, 401, `${route} should require authentication`);
  }

  const session = await fetch(`${origin}/api/auth/session`);
  assert.equal(session.status, 200);
  assert.deepEqual(await session.json(), { user: null });

  for (const provider of ['google', 'discord']) {
    const response = await fetch(`${origin}/api/auth/${provider}`, { redirect: 'manual' });
    assert.equal(response.status, 307, `${provider} should initiate OAuth`);
    const location = new URL(response.headers.get('location'));
    assert.equal(location.hostname, provider === 'google' ? 'accounts.google.com' : 'discord.com');
    assert.equal(location.searchParams.get('redirect_uri'), `${origin}/api/auth/${provider}/callback`);
    assert.ok(location.searchParams.get('state'));
    const cookie = response.headers.get('set-cookie') || '';
    assert.match(cookie, new RegExp(`her9al_${provider}_state=`));
    assert.match(cookie, /Path=\//i);
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=lax/i);

    const invalid = await fetch(`${origin}/api/auth/${provider}/callback?code=bad&state=bad`, { redirect: 'manual' });
    assert.equal(invalid.status, 307, `${provider} should reject an invalid state`);
    const invalidLocation = new URL(invalid.headers.get('location'), origin);
    assert.equal(invalidLocation.pathname, '/login');
    assert.equal(invalidLocation.searchParams.get('error'), `${provider}_state`);
    assert.match(invalid.headers.get('set-cookie') || '', /(?:Max-Age=0|Expires=Thu, 01 Jan 1970)/i);
  }

  const crossSite = await fetch(`${origin}/api/auth/email/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://attacker.invalid' },
    body: JSON.stringify({ email: 'artist@example.com', password: 'not-a-real-password' }),
  });
  assert.equal(crossSite.status, 403);

  const badWebhook = await fetch(`${origin}/api/stripe/webhook`, {
    method: 'POST',
    headers: { 'stripe-signature': 't=1,v1=invalid' },
    body: '{}',
  });
  assert.equal(badWebhook.status, 400);

  const headers = await fetch(`${origin}/distribution`);
  assert.equal(headers.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(headers.headers.get('x-frame-options'), 'DENY');
  assert.equal(headers.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');

  console.log(`Integration smoke passed: ${pages.length} pages, protected APIs, OAuth state, CSRF, webhook, and headers.`);
} finally {
  await stop(child);
}

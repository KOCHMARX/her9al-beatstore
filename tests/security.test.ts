import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { createSessionToken, makeState, verifySessionToken } from '../lib/auth-session.ts';
import { hashPassword, verifyPassword } from '../lib/password.ts';
import { newEmailAccountRole } from '../lib/role-policy.ts';
import { validStripeSignature } from '../lib/stripe-security.ts';

test('session tokens round-trip and reject tampering', () => {
  process.env.AUTH_SECRET = 'unit-test-secret-that-is-longer-than-thirty-two-bytes';
  const token = createSessionToken({ id: 'user-1', provider: 'email', email: 'artist@example.com' });
  const payload = verifySessionToken(token);
  assert.equal(payload?.id, 'user-1');
  assert.equal(payload?.provider, 'email');
  const [body, signature] = token.split('.');
  assert.equal(verifySessionToken(`${body}x.${signature}`), null);
  const flipped = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`;
  assert.equal(verifySessionToken(`${body}.${flipped}`), null);
  assert.equal(verifySessionToken('not-a-session'), null);
});

test('unauthenticated email signup can never create a privileged role', () => {
  process.env.OWNER_EMAIL = 'owner@example.com';
  assert.equal(newEmailAccountRole(), 'customer');
});

test('OAuth state values are unique and URL-safe', () => {
  const first = makeState();
  const second = makeState();
  assert.notEqual(first, second);
  assert.match(first, /^[A-Za-z0-9_-]{32}$/);
  assert.match(second, /^[A-Za-z0-9_-]{32}$/);
});

test('scrypt password hashes verify without storing plaintext', async () => {
  const password = 'correct horse battery staple';
  const stored = await hashPassword(password);
  assert.match(stored, /^scrypt\$[a-f0-9]+\$[a-f0-9]+$/);
  assert.equal(stored.includes(password), false);
  assert.equal(await verifyPassword(password, stored), true);
  assert.equal(await verifyPassword('wrong password', stored), false);
  assert.equal(await verifyPassword(password, 'invalid'), false);
});

test('Stripe signatures enforce payload integrity, timestamp, and any valid v1 value', () => {
  const raw = JSON.stringify({ id: 'evt_test', type: 'checkout.session.completed' });
  const secret = 'whsec_test_only';
  const timestamp = 1_800_000_000;
  const signature = crypto.createHmac('sha256', secret).update(`${timestamp}.${raw}`).digest('hex');
  assert.equal(validStripeSignature(raw, `t=${timestamp},v1=${signature}`, secret, timestamp), true);
  assert.equal(validStripeSignature(raw, `t=${timestamp},v1=${'0'.repeat(64)},v1=${signature}`, secret, timestamp), true);
  assert.equal(validStripeSignature(`${raw}x`, `t=${timestamp},v1=${signature}`, secret, timestamp), false);
  assert.equal(validStripeSignature(raw, `t=${timestamp},v1=${signature}`, secret, timestamp + 301), false);
  assert.equal(validStripeSignature(raw, 'malformed', secret, timestamp), false);
});

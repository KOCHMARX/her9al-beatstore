import assert from 'node:assert/strict';
import test from 'node:test';
import { allowedOrigins, isAllowedOrigin, preferredAppOrigin } from '../lib/origin-policy.ts';
import { canAssignRole, canConfirmDelivery, canViewAdmin } from '../lib/role-policy.ts';
import { paidCheckoutOrderId } from '../lib/webhook-events.ts';
import { stateMatches } from '../lib/auth-session.ts';
import { canonicalAdminUploadType } from '../lib/upload-policy.ts';

const policy = {
  requestOrigin: 'https://her9al-beatstore-git-feature-distribution-room.vercel.app',
  host: 'her9al-beatstore-git-feature-distribution-room.vercel.app',
  proto: 'https',
  appUrl: 'https://her9al-beatstore.vercel.app/',
  vercelUrl: 'her9al-beatstore-abc123-vercel-app.vercel.app',
  vercelBranchUrl: 'her9al-beatstore-git-feature-distribution-room.vercel.app',
  isProduction: true,
};

test('origin allowlist covers own host, APP_URL and Vercel deployment hosts without wildcards', () => {
  const origins = allowedOrigins(policy);
  assert.ok(origins.includes('https://her9al-beatstore.vercel.app'));
  assert.ok(origins.includes('https://her9al-beatstore-abc123-vercel-app.vercel.app'));
  assert.ok(origins.includes(policy.requestOrigin));
  assert.equal(origins.includes('https://evil.example'), false);
  assert.equal(origins.some(origin => origin.includes('*')), false);
  assert.equal(isAllowedOrigin('https://evil.example', policy), false);
  assert.equal(isAllowedOrigin('https://her9al-beatstore.vercel.app', policy), true);
  assert.equal(isAllowedOrigin('not-a-url', policy), false);
});

test('origin allowlist rejects plain HTTP in production but keeps loopback for local checks', () => {
  assert.equal(isAllowedOrigin('http://preview.example', { ...policy, requestOrigin: 'http://preview.example', host: 'preview.example', proto: 'http' }), false);
  assert.equal(isAllowedOrigin('http://localhost:3000', { ...policy, requestOrigin: 'http://localhost:3000', host: 'localhost:3000', proto: 'http' }), true);
});

test('redirect origin prefers the matching deployment host and never an unconfigured host', () => {
  assert.equal(preferredAppOrigin(policy), policy.requestOrigin);
  assert.equal(
    preferredAppOrigin({ ...policy, requestOrigin: 'https://attacker.example' }),
    'https://her9al-beatstore-git-feature-distribution-room.vercel.app',
  );
});

test('role assignment cannot escalate to admin or owner', () => {
  assert.equal(canAssignRole('admin', 'customer'), true);
  assert.equal(canAssignRole('admin', 'editor'), true);
  assert.equal(canAssignRole('admin', 'admin'), false);
  assert.equal(canAssignRole('admin', 'owner'), false);
  assert.equal(canAssignRole('editor', 'customer'), false);
  assert.equal(canAssignRole('owner', 'owner'), true);
  assert.equal(canAssignRole('owner', 'unknown'), false);
  assert.equal(canViewAdmin('editor'), true);
  assert.equal(canViewAdmin('customer'), false);
  assert.equal(canConfirmDelivery('admin'), true);
  assert.equal(canConfirmDelivery('editor'), false);
});

test('webhook only fulfills paid checkout sessions with a valid order reference', () => {
  const id = '11111111-2222-4333-8444-555555555555';
  const base = { id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1', payment_status: 'paid', client_reference_id: id } } };
  assert.equal(paidCheckoutOrderId(base), id);
  assert.equal(paidCheckoutOrderId({ ...base, data: { object: { ...base.data.object, payment_status: 'unpaid' } } }), null);
  assert.equal(paidCheckoutOrderId({ ...base, type: 'checkout.session.expired' }), null);
  assert.equal(paidCheckoutOrderId({ ...base, data: { object: { ...base.data.object, client_reference_id: 'not-a-uuid' } } }), null);
  assert.equal(paidCheckoutOrderId(null), null);
});

test('admin uploads are canonicalized to safe public/media MIME types', () => {
  assert.equal(canonicalAdminUploadType('cover', 'image/png', 'cover.png'), 'image/png');
  assert.equal(canonicalAdminUploadType('cover', 'text/html', 'cover.png'), 'image/png');
  assert.equal(canonicalAdminUploadType('cover', 'text/html', 'payload.html'), null);
  assert.equal(canonicalAdminUploadType('preview', 'application/octet-stream', 'track.mp3'), 'audio/mpeg');
  assert.equal(canonicalAdminUploadType('master', 'application/zip', 'stems.zip'), 'application/zip');
  assert.equal(canonicalAdminUploadType('preview', 'image/png', 'cover.png'), null);
});

test('OAuth state comparison accepts exact values only', () => {
  assert.equal(stateMatches('same-state', 'same-state'), true);
  assert.equal(stateMatches('same-state', 'other-state'), false);
  assert.equal(stateMatches('short', 'longer'), false);
  assert.equal(stateMatches(null, 'state'), false);
});

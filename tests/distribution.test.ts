import assert from 'node:assert/strict';
import test from 'node:test';
import { ADMIN_REVIEW_STATUSES, DELIVERY_STATUSES, EDITABLE_STATUSES, STATUS_LABEL, STATUSES, canonicalUploadType, clean, cleanUrl, isValidReleaseDate } from '../lib/distribution.ts';
import { buildAuditEvent, canAdminReview, canArtistEdit, isDeliveryStatus } from '../lib/release-workflow.ts';

test('upload MIME types are canonicalized only from supported media extensions', () => {
  assert.equal(canonicalUploadType('audio', '', 'master.wav'), 'audio/wav');
  assert.equal(canonicalUploadType('audio', 'application/octet-stream', 'master.flac'), 'audio/flac');
  assert.equal(canonicalUploadType('audio', 'audio/mpeg', 'master.mp3'), 'audio/mpeg');
  assert.equal(canonicalUploadType('art', '', 'cover.jpeg'), 'image/jpeg');
  assert.equal(canonicalUploadType('art', 'image/png', 'cover.png'), 'image/png');
  assert.equal(canonicalUploadType('audio', 'text/html', 'payload.html'), '');
  assert.equal(canonicalUploadType('art', 'image/svg+xml', 'cover.svg'), '');
});

test('release date validation is strict and at least seven UTC days ahead', () => {
  const now = new Date('2026-11-25T12:00:00.000Z');
  assert.equal(isValidReleaseDate('2026-12-02', now), true);
  assert.equal(isValidReleaseDate('2026-12-01', now), false);
  assert.equal(isValidReleaseDate('2026-02-30', now), false);
  assert.equal(isValidReleaseDate('not-a-date', now), false);
});

test('workflow statuses distinguish drafts, changes requested and rejection', () => {
  assert.equal(STATUS_LABEL.draft, 'Draft');
  assert.equal(STATUS_LABEL.changes_requested, 'Changes requested');
  assert.equal(STATUS_LABEL.rejected, 'Rejected');
  assert.equal(STATUS_LABEL.delivered, 'Delivery package prepared');
  assert.ok(STATUSES.includes('draft'));
  assert.deepEqual(EDITABLE_STATUSES, ['draft', 'changes_requested', 'rejected']);
  assert.ok(ADMIN_REVIEW_STATUSES.includes('changes_requested'));
  assert.ok(DELIVERY_STATUSES.includes('live'));
  assert.equal((ADMIN_REVIEW_STATUSES as readonly string[]).includes('draft'), false);
});

test('review permissions and audit payloads follow the workflow', () => {
  assert.equal(canArtistEdit('changes_requested'), true);
  assert.equal(canArtistEdit('submitted'), false);
  assert.equal(canAdminReview('approved'), true);
  assert.equal(canAdminReview('draft'), false);
  assert.equal(isDeliveryStatus('delivered'), true);
  assert.equal(isDeliveryStatus('in_review'), false);
  assert.deepEqual(buildAuditEvent({ releaseId: 'r1', actorId: 'u1', from: 'submitted', to: 'approved', note: 'ok' }), {
    release_id: 'r1', actor_id: 'u1', from_status: 'submitted', to_status: 'approved', note: 'ok',
  });
  assert.equal(buildAuditEvent({ releaseId: '', actorId: 'u1', from: null, to: 'approved' }), null);
});

test('text and URL cleaners bound input and reject unsafe protocols', () => {
  assert.equal(clean('  artist  ', 20), 'artist');
  assert.equal(clean('123456', 3), '123');
  assert.equal(cleanUrl('https://artists.example/profile'), 'https://artists.example/profile');
  assert.equal(cleanUrl('http://artists.example/profile'), 'http://artists.example/profile');
  assert.equal(cleanUrl('javascript:alert(1)'), '');
  assert.equal(cleanUrl('data:text/html,payload'), '');
  assert.equal(cleanUrl('not a URL'), '');
});

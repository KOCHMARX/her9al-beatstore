import assert from 'node:assert/strict';
import test from 'node:test';
import { AUDIO_TYPES, cleanUrl, isValidReleaseDate } from '../lib/distribution.ts';
import { allowedAdminStatuses, canAdminDeliver, canAdminReview, canArtistEdit } from '../lib/release-workflow.ts';
import { verifyOwnedStorageObject, verifyReleaseArtwork } from '../lib/storage-object.ts';
import { fakeDb } from './fake-db.ts';

const OWNER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const OTHER = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

function png(width: number, height: number) {
  const bytes = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write('IHDR', 12, 'ascii');
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return new Uint8Array(bytes);
}

test('distribution uploads are verified against the signed-in user path only', async () => {
  const db = fakeDb({
    __storage__: {
      'release-audio': [{ name: 'track.wav', metadata: { size: 1024, mimetype: 'audio/wav' } }],
    },
  } as any);
  const rules = { ownerId: OWNER, maxBytes: 300 * 1024 * 1024, mimeTypes: AUDIO_TYPES };
  assert.equal(await verifyOwnedStorageObject(db, 'release-audio', `${OWNER}/track.wav`, rules), true);
  assert.equal(await verifyOwnedStorageObject(db, 'release-audio', `${OTHER}/track.wav`, rules), false);
  assert.equal(await verifyOwnedStorageObject(db, 'release-audio', `${OWNER}/nested/track.wav`, rules), false);
  assert.equal(await verifyOwnedStorageObject(db, 'release-audio', `${OWNER}/../track.wav`, rules), false);
});

test('cover artwork must be square and at least 1400 pixels', async () => {
  const path = `${OWNER}/cover.png`;
  const good = fakeDb({}, { downloads: { [path]: png(1400, 1400) } });
  assert.equal(await verifyReleaseArtwork(good, path), true);
  const small = fakeDb({}, { downloads: { [path]: png(1200, 1200) } });
  assert.equal(await verifyReleaseArtwork(small, path), false);
  const rectangle = fakeDb({}, { downloads: { [path]: png(1400, 1500) } });
  assert.equal(await verifyReleaseArtwork(rectangle, path), false);
});

test('artist links accept only http/https and workflow gates reject unsafe transitions', () => {
  assert.equal(cleanUrl('https://artist.example/profile'), 'https://artist.example/profile');
  assert.equal(cleanUrl('http://artist.example/profile'), 'http://artist.example/profile');
  assert.equal(cleanUrl('javascript:alert(1)'), '');
  assert.equal(cleanUrl('data:text/html,payload'), '');

  assert.equal(canArtistEdit('draft'), true);
  assert.equal(canArtistEdit('rejected'), true);
  assert.equal(canArtistEdit('submitted'), false);
  assert.equal(canAdminReview('submitted'), true);
  assert.equal(canAdminReview('draft'), false);
  assert.equal(canAdminDeliver('approved'), true);
  assert.equal(canAdminDeliver('in_review'), false);
  assert.deepEqual(allowedAdminStatuses('rejected'), []);
  assert.ok(allowedAdminStatuses('submitted').includes('rejected'));
  assert.equal(isValidReleaseDate('2026-12-10', new Date('2026-11-26T00:00:00.000Z')), true);
  assert.equal(isValidReleaseDate('2026-12-01', new Date('2026-11-26T00:00:00.000Z')), false);
});

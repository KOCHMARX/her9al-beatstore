import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalUploadType, clean, cleanUrl, isValidReleaseDate } from '../lib/distribution.ts';

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

test('text and URL cleaners bound input and reject unsafe protocols', () => {
  assert.equal(clean('  artist  ', 20), 'artist');
  assert.equal(clean('123456', 3), '123');
  assert.equal(cleanUrl('https://artists.example/profile'), 'https://artists.example/profile');
  assert.equal(cleanUrl('http://artists.example/profile'), 'http://artists.example/profile');
  assert.equal(cleanUrl('javascript:alert(1)'), '');
  assert.equal(cleanUrl('data:text/html,payload'), '');
  assert.equal(cleanUrl('not a URL'), '');
});

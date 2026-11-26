import assert from 'node:assert/strict';
import test from 'node:test';
import { checkoutLicenseRejection, publishedBeatRejection, visibleCatalogLicense } from '../lib/beatstore-policy.ts';
import { canonicalAdminUploadType, hasImageSignature } from '../lib/upload-policy.ts';
import { waveformFeedback } from '../lib/waveform-policy.ts';

const uuid = '11111111-2222-4333-8444-555555555555';

test('published paid beats require a private master', () => {
  assert.equal(publishedBeatRejection({ published: false, price_cents: 2900, master_path: null }), null);
  assert.equal(publishedBeatRejection({ published: true, price_cents: 0, master_path: null }), null);
  assert.equal(publishedBeatRejection({ published: true, price_cents: 2900, master_path: '  ' }), 'Published paid beats require a private master file.');
  assert.equal(publishedBeatRejection({ published: true, price_cents: 2900, master_path: 'masters/one.wav' }), null);
});

test('checkout rejects inactive, unpublished and unfulfillable licenses', () => {
  const license = {
    id: uuid,
    beat_id: uuid,
    price_cents: 2900,
    active: true,
    beat: { title: 'Test', published: true, master_path: 'masters/one.wav' },
  };
  assert.equal(checkoutLicenseRejection(license), null);
  assert.equal(checkoutLicenseRejection(null), 'license_not_found');
  assert.equal(checkoutLicenseRejection({ ...license, active: false }), 'license_not_found');
  assert.equal(checkoutLicenseRejection({ ...license, beat: { ...license.beat, published: false } }), 'beat_unavailable');
  assert.equal(checkoutLicenseRejection({ ...license, beat: { ...license.beat, master_path: null } }), 'beat_unavailable');
  assert.equal(checkoutLicenseRejection({ ...license, price_cents: -1 }), 'invalid_price');
});

test('catalog cards use the cheapest active license only', () => {
  const licenses = [
    { id: 'a', name: 'Basic', price_cents: 4900, active: true },
    { id: 'b', name: 'Old', price_cents: 900, active: false },
    { id: 'c', name: 'Standard', price_cents: 2900, active: true },
  ];
  assert.equal(visibleCatalogLicense(licenses)?.id, 'c');
  assert.equal(visibleCatalogLicense([licenses[1]]), null);
  assert.equal(visibleCatalogLicense([]), null);
});

test('image uploads verify real bytes and extension-derived MIME', () => {
  assert.equal(canonicalAdminUploadType('cover', 'text/html', 'cover.png'), 'image/png');
  assert.equal(canonicalAdminUploadType('preview', 'image/png', 'cover.png'), null);
  assert.equal(hasImageSignature('image/png', Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2])), true);
  assert.equal(hasImageSignature('image/jpeg', Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])), true);
  assert.equal(hasImageSignature('image/gif', Uint8Array.from([...Buffer.from('GIF89a'), 1])), true);
  assert.equal(hasImageSignature('image/webp', Uint8Array.from([...Buffer.from('RIFF'), 0, 0, 0, 0, ...Buffer.from('WEBP')])), true);
  assert.equal(hasImageSignature('image/png', Uint8Array.from(Buffer.from('<svg/>'))), false);
  assert.equal(hasImageSignature('image/tiff', Uint8Array.from([1, 2, 3])), false);
});

test('waveforms never show generated bars as real audio data', () => {
  assert.equal(waveformFeedback('idle', false), 'Preview waveform unavailable');
  assert.equal(waveformFeedback('loading', false), 'Loading waveform…');
  assert.equal(waveformFeedback('unavailable', false), 'Preview waveform unavailable');
  assert.equal(waveformFeedback('ready', false), 'Preview waveform unavailable');
  assert.equal(waveformFeedback('ready', true), null);
});

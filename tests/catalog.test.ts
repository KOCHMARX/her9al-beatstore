import assert from 'node:assert/strict';
import test from 'node:test';
import { catalogMessage } from '../lib/catalog-state.ts';

test('catalog distinguishes load failure from a genuinely empty database', () => {
  assert.equal(catalogMessage(true, 0, 0), 'Beats could not be loaded. Please try again later.');
  assert.equal(catalogMessage(false, 0, 0), 'No beats published yet.');
  assert.equal(catalogMessage(false, 12, 0), 'No beats match these filters yet.');
  assert.equal(catalogMessage(false, 12, 12), null);
});

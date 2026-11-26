import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

const globalsCss = readFileSync(join(process.cwd(), 'app', 'globals.css'), 'utf8');

test('waveform status uses an existing original design token', () => {
  assert.equal(globalsCss.includes('#8c8c96'), false);
  assert.equal(
    globalsCss.includes('.audio-waveform .waveform-status{font-size:12px;color:#8d8d95;letter-spacing:.02em}'),
    true,
  );
});

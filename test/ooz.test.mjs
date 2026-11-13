// SPDX-License-Identifier: GPL-3.0-only
// node --test test/*.test.mjs : decompress a PlM-wrapped file with the WebAssembly build and compare with the native build's output.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createOoz } from '../js/ooz.mjs';

const sample = process.env.OOZ_SAMPLE; // a Level.sav-style file: u32 size, u32 compressed size, 'PlM', type, Oodle stream
test('wasm decompresses an Oodle stream', { skip: !sample || !existsSync(sample) ? 'set OOZ_SAMPLE to a .sav file' : false }, async () => {
  const b = readFileSync(sample);
  const size = b.readUInt32LE(0), csize = b.readUInt32LE(4);
  assert.equal(b.subarray(8, 11).toString(), 'PlM');
  const ooz = await createOoz(readFileSync(new URL('../dist/ooz.wasm', import.meta.url)));
  const out = ooz.decompress(b.subarray(12, 12 + csize), size);
  assert.equal(out.length, size);
  assert.equal(Buffer.from(out.subarray(0, 4)).toString(), 'GVAS');
  if (process.env.OOZ_EXPECT) assert.ok(Buffer.from(out).equals(readFileSync(process.env.OOZ_EXPECT)), 'matches the reference output');
});

// SPDX-License-Identifier: MIT
// node --test : the decompressor API, the PlM container, and corrupt streams derived here from a public vector
// (bad block header bits, checksum flag, truncation, trailing byte, wrong output size).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { decompress, decompressPlm, parsePlmHeader, MermaidError, UnsupportedError } from '../js/mermaid.js';
import { PUBLIC, bytes } from './vectors.mjs';

function plm(payload, rawSize, magic = [0x50, 0x6c, 0x4d], type = 0x31) {
  const f = new Uint8Array(12 + payload.length);
  const dv = new DataView(f.buffer);
  dv.setUint32(0, rawSize, true);
  dv.setUint32(4, payload.length, true);
  f.set(magic, 8);
  f[11] = type;
  f.set(payload, 12);
  return f;
}

const payload = bytes(resolve(PUBLIC.dir, 'handmade/hand_lz_all_cmds_mode1.oodle'));

test('worked example and PlM container', () => {
  const out = decompress(payload, 215);
  assert.equal(new TextDecoder().decode(out.subarray(0, 11)), 'Mermaid!abc');
  assert.equal(new TextDecoder().decode(out.subarray(199)), '.end of example.');
  const file = plm(payload, 215);
  assert.deepEqual(parsePlmHeader(file), { rawSize: 215, compressedSize: payload.length, saveType: 0x31 });
  assert.deepEqual(decompressPlm(file), out);
  assert.throws(() => decompressPlm(plm(payload, 215, [0x50, 0x6c, 0x5a])), UnsupportedError);
  assert.throws(() => decompressPlm(plm(payload, 215, [0x50, 0x6c, 0x4d], 0x32)), UnsupportedError);
  assert.throws(() => decompressPlm(plm(payload, 215, [0x41, 0x42, 0x43])), MermaidError);
  assert.throws(() => decompressPlm(file.subarray(0, file.length - 1)), MermaidError);
  assert.throws(() => decompressPlm(new Uint8Array(5)), MermaidError);
});

function corrupt(fn) {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof MermaidError && !(e instanceof UnsupportedError), `expected a corrupt-data error, got ${e && e.name}`);
    assert.equal(e.code, 'corrupt');
    return;
  }
  assert.fail('accepted a corrupt stream');
}

test('derived corrupt streams are rejected', () => {
  assert.equal(payload[0], 0x8c);
  assert.equal(payload[1], 0x0a);
  const edit = (i, v) => { const d = payload.slice(); d[i] = v; return d; };
  corrupt(() => decompress(edit(0, 0x8d), 215)); // block header low nibble is not 0xC
  corrupt(() => decompress(edit(0, 0x9c), 215)); // reserved block header bits set
  corrupt(() => decompress(edit(1, 0x8a), 215)); // checksum flag set
  const longer = new Uint8Array(payload.length + 1);
  longer.set(payload);
  corrupt(() => decompress(longer, 215)); // trailing byte
  corrupt(() => decompress(payload.subarray(0, payload.length - 1), 215)); // truncated
  corrupt(() => decompress(payload, 214)); // caller asks for one byte fewer
  corrupt(() => decompress(payload, 216)); // caller asks for one byte more
});

test('empty output needs empty input', () => {
  assert.equal(decompress(new Uint8Array(0), 0).length, 0);
  assert.throws(() => decompress(new Uint8Array(1), 0), MermaidError);
  assert.throws(() => decompress(new Uint8Array(0), 1), MermaidError);
});

test('memset quantum', () => {
  const out = decompress(Uint8Array.of(0x8c, 0x0a, 0x07, 0xff, 0xff, 0x5a), 1000);
  assert.ok(out.every((b) => b === 0x5a));
  assert.throws(() => decompress(Uint8Array.of(0x8c, 0x0a, 0x0b, 0xff, 0xff, 0x5a), 1000), MermaidError);
});

test('argument checks', () => {
  assert.throws(() => decompress([1, 2], 2), TypeError);
  assert.throws(() => decompress(new Uint8Array(2), -1), RangeError);
});

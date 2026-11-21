// SPDX-License-Identifier: MIT
// node --test : robustness. Random corruptions of the public vectors (test/vectors/) must either decode to exactly the
// requested size or throw a MermaidError. Any other exception (RangeError, TypeError, stack overflow) or a slow case
// fails. Fixed seeds, so every run (and CI) tests the same inputs. MERMAID_FUZZ_ITER=40000 runs more iterations.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decompress, MermaidError } from '../js/mermaid.js';
import { PUBLIC, bytes } from './vectors.mjs';

const ITER = Number(process.env.MERMAID_FUZZ_ITER || 3000);
const SEED = 12345;
const MAX_SRC = 400000;

function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

const corpus = PUBLIC.vectors
  .filter((v) => v.compressed_size <= MAX_SRC)
  .map((v) => ({ name: v.name, size: v.raw_size, data: bytes(v.path) }));

function mutate(r, data) {
  const kind = Math.floor(r() * 6);
  let d = data.slice();
  const flips = 1 + Math.floor(r() * 8);
  switch (kind) {
    case 0: // truncate
      return d.subarray(0, Math.floor(r() * d.length));
    case 1: // bit flips
      for (let i = 0; i < flips; i++) d[Math.floor(r() * d.length)] ^= 1 << Math.floor(r() * 8);
      return d;
    case 2: // random bytes
      for (let i = 0; i < flips; i++) d[Math.floor(r() * d.length)] = Math.floor(r() * 256);
      return d;
    case 3: { // flips in the first 64 bytes (headers)
      const lim = Math.min(64, d.length);
      for (let i = 0; i < flips; i++) d[Math.floor(r() * lim)] ^= 1 << Math.floor(r() * 8);
      return d;
    }
    case 4: { // insert or delete a byte
      const at = Math.floor(r() * d.length);
      const out = new Uint8Array(d.length + (r() < 0.5 ? 1 : -1));
      if (out.length > d.length) { out.set(d.subarray(0, at)); out[at] = Math.floor(r() * 256); out.set(d.subarray(at), at + 1); }
      else { out.set(d.subarray(0, at)); out.set(d.subarray(at + 1), at); }
      return out;
    }
    default: // flips plus truncation
      for (let i = 0; i < flips; i++) d[Math.floor(r() * d.length)] ^= 1 << Math.floor(r() * 8);
      return d.subarray(0, Math.max(0, d.length - 1 - Math.floor(r() * 16)));
  }
}

test('fuzz: corrupted vectors never crash', () => {
  const r = rng(SEED);
  let ok = 0, rejected = 0;
  for (let i = 0; i < ITER; i++) {
    const c = corpus[Math.floor(r() * corpus.length)];
    const input = mutate(r, c.data);
    let size = c.size;
    if (r() < 0.1) size = Math.max(0, size + Math.floor(r() * 21) - 10);
    const t0 = performance.now();
    try {
      const out = decompress(input, size);
      assert.equal(out.length, size);
      ok++;
    } catch (e) {
      if (!(e instanceof MermaidError)) {
        assert.fail(`iteration ${i} (${c.name}): non-clean exception ${e && e.name}: ${e && e.message}`);
      }
      rejected++;
    }
    const dt = performance.now() - t0;
    assert.ok(dt < 5000, `iteration ${i} (${c.name}) took ${dt} ms`);
  }
  assert.equal(ok + rejected, ITER);
});

test('fuzz: random garbage never crashes', () => {
  const r = rng(SEED ^ 0x9e3779b9);
  for (let i = 0; i < 2000; i++) {
    const len = Math.floor(r() * 300);
    const d = new Uint8Array(len);
    for (let j = 0; j < len; j++) d[j] = Math.floor(r() * 256);
    // make many of them pass the block header to reach deeper code
    if (len >= 2 && r() < 0.8) { d[0] = r() < 0.5 ? 0x8c : 0x0c; d[1] = 0x0a; }
    try {
      decompress(d, Math.floor(r() * 300000));
    } catch (e) {
      if (!(e instanceof MermaidError)) assert.fail(`garbage ${i}: ${e && e.name}: ${e && e.message}`);
    }
  }
});

// SPDX-License-Identifier: MIT
// node --test : every vector of the public set, and (opt-in) every vector of the local set in MERMAID_VECTORS.
// "ok" vectors must match the SHA-256 of the whole output and of every 256 KiB quantum; "error" and "unsupported"
// vectors must be rejected with the matching error code. Output bytes are never printed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { decompress, MermaidError, UnsupportedError } from '../js/mermaid.js';
import { PUBLIC, LOCAL, QUANTUM, bytes } from './vectors.mjs';

const sha = (b) => createHash('sha256').update(b).digest('hex');

function check(v) {
  const src = bytes(v.path);
  if (v.expect === 'ok') {
    const out = decompress(src, v.raw_size);
    assert.equal(out.length, v.raw_size);
    for (let i = 0; i < v.quantum_sha256.length; i++) {
      if (sha(out.subarray(i * QUANTUM, (i + 1) * QUANTUM)) !== v.quantum_sha256[i]) assert.fail(`quantum ${i} hash mismatch`);
    }
    assert.equal(sha(out), v.expected_sha256, 'full output hash');
    return;
  }
  let err = null;
  try {
    decompress(src, v.raw_size);
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof MermaidError, `expected a MermaidError, got ${err && err.name}`);
  if (v.expect === 'unsupported') {
    assert.ok(err instanceof UnsupportedError);
    assert.equal(err.code, 'unsupported');
  } else {
    assert.ok(!(err instanceof UnsupportedError), `expected a corrupt-data error, got: ${err.message}`);
    assert.equal(err.code, 'corrupt');
  }
}

test('public vector set is complete', () => {
  assert.ok(PUBLIC, 'test/vectors/MANIFEST.json missing');
  assert.equal(PUBLIC.vectors.filter((v) => v.group === 'handmade').length, 11);
  for (const v of PUBLIC.vectors) assert.ok(existsSync(v.path), `missing ${v.name}`);
});

for (const v of PUBLIC.vectors) test(`public ${v.group}/${v.name} -> ${v.expect}`, () => check(v));

if (LOCAL) {
  for (const v of LOCAL.vectors) {
    test(`local ${v.group}/${v.name} -> ${v.expect}`, { skip: !existsSync(v.path) && 'file missing' }, () => check(v));
  }
} else {
  test('local vector set (set MERMAID_VECTORS)', { skip: 'set MERMAID_VECTORS to a vector directory with a MANIFEST.json' }, () => {});
}

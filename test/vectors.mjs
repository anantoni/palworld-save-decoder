// SPDX-License-Identifier: MIT
// Test-vector sets for the decompressor tests.
//
// PUBLIC: test/vectors/ (committed). Hand-built streams and hand-built corrupt streams only.
// LOCAL: an optional, larger vector directory with its own MANIFEST.json, given by MERMAID_VECTORS. It is never
// committed and CI does not set it, so those tests are skipped there.
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

function load(dir) {
  const path = resolve(dir, 'MANIFEST.json');
  if (!existsSync(path)) return null;
  const m = JSON.parse(readFileSync(path, 'utf8'));
  // The public manifest names the file as `file`; larger sets may use `files.compressed`.
  const vectors = m.vectors.map((v) => ({ ...v, path: resolve(dir, v.file ?? v.files.compressed) }));
  return { dir, vectors };
}

export const PUBLIC = load(resolve(here, 'vectors'));
export const LOCAL = process.env.MERMAID_VECTORS ? load(resolve(process.env.MERMAID_VECTORS)) : null;
export const QUANTUM = 262144;

export function bytes(path) {
  const b = readFileSync(path);
  return new Uint8Array(b.buffer, b.byteOffset, b.length);
}

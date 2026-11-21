// SPDX-License-Identifier: MIT
// palworld-save-decoder: read the Pals (levels, IVs, souls, passives, condenser stars) from your own Palworld Level.sav.
// Works in the browser and in Node 18+. Everything runs locally; nothing is uploaded, stored or logged.

import { decompress, MermaidError, UnsupportedError } from './mermaid.js';
import { readSaveFile, SaveError } from './save.mjs';

export { SaveError, unwrapSav, readWorld, readSaveFile, readProps, Reader } from './save.mjs';
export { decompress, decompressPlm, parsePlmHeader, MermaidError, UnsupportedError } from './mermaid.js';

/** zlib inflate with the platform's DecompressionStream (browsers and Node 18+). */
export async function inflate(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * The PlM codec used by readPalworldSave: decompresses one stream to exactly `size` bytes and turns decoder errors
 * into a SaveError whose message is safe to show to a player (the decoder error is kept as `cause`).
 */
export function plmCodec(data, size) {
  try {
    return decompress(data, size);
  } catch (e) {
    if (e instanceof UnsupportedError) throw new SaveError('This save uses a compression feature that is not supported yet.', { cause: e });
    if (e instanceof MermaidError) throw new SaveError('This save file is damaged or incomplete.', { cause: e });
    throw e;
  }
}

/**
 * Read a Palworld world save (Level.sav) and return its players and owned Pals.
 * @param {Uint8Array | ArrayBuffer} sav the file's bytes
 * @param {object} [_options] accepted for compatibility with 1.x and ignored (there is no WebAssembly file to load any more)
 */
export async function readPalworldSave(sav, _options = {}) {
  const bytes = sav instanceof Uint8Array ? sav : new Uint8Array(sav);
  return readSaveFile(bytes, { inflate, oodle: plmCodec });
}

/**
 * @deprecated 1.x compatibility only. Returns the built-in decompressor as `{ decompress(src, size) }`; the argument is
 * ignored. Use `decompress` instead.
 */
export async function createOoz(_wasm) {
  return { decompress };
}

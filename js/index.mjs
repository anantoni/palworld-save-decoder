// SPDX-License-Identifier: MIT
// palworld-save-decoder: read the Pals (levels, IVs, souls, passives, condenser stars) from your own Palworld Level.sav.
// Works in the browser and in Node 18+. Everything runs locally; nothing is uploaded, stored or logged.

import { createOoz } from './ooz.mjs';
import { readSaveFile } from './save.mjs';

export { createOoz } from './ooz.mjs';
export { SaveError, unwrapSav, readWorld, readSaveFile, readProps, Reader } from './save.mjs';

/** zlib inflate with the platform's DecompressionStream (browsers and Node 18+). */
export async function inflate(data) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function loadWasm(wasm) {
  if (wasm !== undefined) return wasm;
  const url = new URL('../dist/ooz.wasm', import.meta.url);
  if (url.protocol === 'file:') {
    const { readFile } = await import('node:fs/promises');
    return readFile(url);
  }
  return fetch(url);
}

/**
 * Read a Palworld world save (Level.sav) and return its players and owned Pals.
 * @param {Uint8Array | ArrayBuffer} sav the file's bytes
 * @param {{ wasm?: Uint8Array | ArrayBuffer | Response }} [options] where to get ooz.wasm; by default it is loaded from this
 *   package's dist/ folder (from disk in Node, by fetch in a browser or bundler)
 */
export async function readPalworldSave(sav, options = {}) {
  const bytes = sav instanceof Uint8Array ? sav : new Uint8Array(sav);
  let ooz;
  const oodle = async (data, size) => {
    ooz ??= await createOoz(await loadWasm(options.wasm));
    return ooz.decompress(data, size);
  };
  return readSaveFile(bytes, { inflate, oodle });
}

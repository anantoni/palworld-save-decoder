// SPDX-License-Identifier: GPL-3.0-only
// JavaScript wrapper for ooz.wasm: decompress one Oodle stream in the browser (or Node). No network, no storage.

/** Instantiate the decompressor from its .wasm bytes (an ArrayBuffer/Uint8Array) or a Response. */
export async function createOoz(wasm) {
  let mem;
  const imports = {
    // The compiled C++ may call stdio on error paths; swallow the output.
    wasi_snapshot_preview1: {
      fd_write: (_fd, _iovs, _n, nwritten) => { new DataView(mem.buffer).setUint32(nwritten, 0, true); return 0; },
      fd_close: () => 0,
      fd_seek: () => 70, // ESPIPE: not seekable
      clock_time_get: (_id, _prec, out) => { new DataView(mem.buffer).setBigUint64(out, 0n, true); return 0; },
      proc_exit: () => { throw new Error('ooz exited'); },
    },
  };
  const source = typeof Response !== 'undefined' && wasm instanceof Response ? await WebAssembly.instantiateStreaming(wasm, imports) : await WebAssembly.instantiate(wasm, imports);
  const x = source.instance.exports;
  mem = x.memory;
  if (x._initialize) x._initialize();
  return {
    /** Decompress `src` (the Oodle stream, without the container header) to exactly `size` bytes. Throws on error. */
    decompress(src, size) {
      const inPtr = x.oz_alloc(src.length);
      if (!inPtr) throw new Error('out of memory');
      const outPtr = x.oz_alloc(size);
      if (!outPtr) { x.oz_free(inPtr); throw new Error('out of memory'); }
      try {
        new Uint8Array(x.memory.buffer, inPtr, src.length).set(src);
        const n = x.oz_decompress(inPtr, src.length, outPtr, size);
        if (n !== size) throw new Error(`decompression failed (${n})`);
        return new Uint8Array(x.memory.buffer, outPtr, size).slice();
      } finally {
        x.oz_free(inPtr);
        x.oz_free(outPtr);
      }
    },
  };
}

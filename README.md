# ooz-wasm

An open-source decompressor for Oodle streams (Kraken, Mermaid, Selkie, Leviathan, LZNA, Bitknit), compiled to WebAssembly so it runs
inside a web page or Node. Nothing is uploaded, stored or logged: bytes in, bytes out.

Based on **ooz** by Powzix (https://github.com/powzix/ooz, GPLv3 or later, see the source headers). Changes: the Windows-only code
(file IO, `main`, DLL loading) is removed, MSVC intrinsics are replaced by portable ones (`src/compat.h`), the SSE2 intrinsics are
mapped onto WebAssembly SIMD (`src/sse_wasm.h`), and `src/api.cpp` adds a small C API.

## Use

```js
import { createOoz } from './js/ooz.mjs';
const ooz = await createOoz(await fetch('/ooz.wasm'));   // or the bytes
const bytes = ooz.decompress(oodleStream, uncompressedSize); // Uint8Array; throws on error
```

## Build

`WASI_SDK=/path/to/wasi-sdk ./build.sh` (needs wasi-sdk 34 or similar; output `dist/ooz.wasm`, about 120 KB).
Test: `OOZ_SAMPLE=some.sav node --test test/decompress.test.mjs`.

## Licence

GNU General Public License v3 or later (see `LICENSE`). If you distribute `ooz.wasm`, offer this source with it.

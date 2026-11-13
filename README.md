# palworld-save-decoder

Decompresses Palworld `.sav` files in the browser (or Node), so a web page can read the player's own save without uploading it.
Everything runs locally: bytes in, bytes out. Nothing is uploaded, stored or logged.

A Palworld `.sav` is a small header followed by a compressed stream. Older files use zlib (the browser's `DecompressionStream`
handles those); newer ones use the Oodle family (Kraken, Mermaid, Selkie, Leviathan, LZNA, Bitknit). This module is the second
case: an Oodle decompressor compiled to WebAssembly, about 120 KB, with a small JavaScript wrapper.

It is used by the "Load your save" tool of the [Lore Armory Palworld IV calculator](https://lorearmory.com/palworld/iv-calculator/),
which reads the numbers of a player's own Pals from a save file they choose, in their own browser.

## Research

- [Paper: How Palworld computes Pal Attack, Defense and HP: an exact model verified in game](https://doi.org/10.5281/zenodo.24189999)
- [Dataset: Palworld stat verification](https://doi.org/10.5281/zenodo.24190003)
- [Lore Armory Palworld IV calculator](https://lorearmory.com/palworld/iv-calculator/)

Author: [Anastasios Antoniadis](https://anantoni.github.io/) · [ORCID](https://orcid.org/0009-0004-1605-967X).
The paper and dataset links above resolve to all versions.

## Use

```js
import { createOoz } from './js/ooz.mjs';
const ooz = await createOoz(await fetch('/ooz.wasm'));       // or the bytes (Uint8Array)
const bytes = ooz.decompress(oodleStream, uncompressedSize);  // Uint8Array; throws on error
```

For a `.sav` file the header is `u32 uncompressed size, u32 compressed size, "PlM", u8 type`, then the stream (see `test/decompress.test.mjs`).

## Build (reproducible)

Needs [wasi-sdk](https://github.com/WebAssembly/wasi-sdk) 34 (the build was made with `wasi-sdk-34.0-x86_64-linux`).

```
WASI_SDK=/path/to/wasi-sdk-34.0-x86_64-linux ./build.sh   # writes dist/ooz.wasm
./verify.sh                                               # compares dist/ooz.wasm with SHA256SUMS
```

`dist/ooz.wasm` is committed, and `SHA256SUMS` holds its checksum: building from this source with wasi-sdk 34 gives the same bytes
(`b9de3ba07a5bbce24da1cc2c92ad6c83661d2ad05fec1ff40325da97ceb1dd2e`), which is the file the calculator page ships.

Test (needs a save file of your own): `OOZ_SAMPLE=path/to/Level.sav node --test test/decompress.test.mjs`.

## Credits and licence

Based on **ooz** by Powzix (<https://github.com/powzix/ooz>), GNU GPL v3 or later; the original copyright notice is kept at the top of `src/kraken.cpp`
(`bitknit.cpp` and `lzna.cpp` are parts of the same upstream source). Changes in this repository: the Windows-only code (file IO, `main`, DLL loading)
is removed, MSVC intrinsics are replaced by portable ones (`src/compat.h`), the SSE2 intrinsics are mapped onto WebAssembly SIMD
(`src/sse_wasm.h`), and `src/api.cpp` and `js/ooz.mjs` add a small API.

Licensed under the GNU General Public License v3 or later (`LICENSE`). If you distribute `ooz.wasm`, offer this source with it.
This is an independent project: it is not affiliated with or endorsed by the makers of Palworld or of any compression library.
"Oodle" and "Palworld" are trademarks of their owners.

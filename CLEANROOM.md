# How the decompressor was made

Version 1.x of this package shipped the GPL-3.0 ooz decompressor compiled to WebAssembly. Version 2.0.0 replaces it with
`js/mermaid.js`, a new JavaScript decompressor written with a two-sided clean-room process on 21 November 2026.
**`js/mermaid.js` contains no ooz code.**

## The two sides

| | Side A (specification) | Side B (implementation) |
| --- | --- | --- |
| Who | A Claude agent session working for the author | A separate Claude agent session working for the author, with its own workspace |
| Saw | The GPL ooz source (parts of `kraken.cpp` used by these saves, as listed below); the public API of the real Oodle 2.9.16 library, called as a black box; the author's own save files | Only side A's written specification (`SPEC.md` v1.0) and the test vectors with their manifest |
| Wrote | `SPEC.md` (format description in prose, tables and short original algorithm sketches) and test vectors | `js/mermaid.js`, `types/mermaid.d.ts` and the tests; no specification text |
| Did not | Write any product code | Open anything on side A, any ooz or other existing decoder source, or any Oodle SDK, header, library or binary |

Both sides were AI agent sessions run for the same author. The separation was by workspace and written instructions, and each
side kept a log; the key statements of both logs are quoted below. The side A working tools (an instrumented ooz build, an
executable model of the specification, the vector builders) were never given to side B and are not in this repository.

## Timeline (21 November 2026, CET)

- Side A finished `SPEC.md` v1.0 and the vectors; they were copied into side B's input folder at 18:57.
- Side B committed its implementation at 19:07 (commit `e5c3b6a` in side B's own repository).
- This repository's `js/mermaid.js` and `types/mermaid.d.ts` are byte-identical to that commit
  (SHA-256 `0c4dd6b5ecc46d3d83bc09d3d8ba32e2d62fed942d27df00387f590b72ae0c74` and
  `e03db503711f3ba780623b64ba7042078ba7846cf14643e18a1b68a3e4439dfb`). Integrating it into the save reader changed no
  decoder code.

## Side A log: key statements

- GPL material read: ooz by Powzix, `kraken.cpp` at upstream commit `05038060aa68f9187ae9923b2388ca8db40e58d1`, lines 1-1640
  (headers, bit readers, Huffman, code-length formats, multi-array, recursive and RLE array decoders), 2063-2210 (array header
  and dispatch) and 3385-4155 (Mermaid quantum and chunk decoder, top-level stream loop), plus the copy vendored in 1.x.
  Not read: the tANS decoder, Kraken LZ, Leviathan, `lzna.cpp`, `bitknit.cpp`; the specification marks those features unsupported.
- The real Oodle 2.9.16 library was called only through its public API (`OodleLZ_Compress`, `OodleLZ_Decompress`) as a black
  box. It was not disassembled and its code was not read. It showed that the save payloads are byte-identical to its Mermaid
  level 4 output, and it served as an independent decoder to check every vector.
- "SPEC.md contains no code copied from ooz or any other GPL source. It contains no ooz identifiers, function names, type names
  or comments, and it does not follow ooz's code structure." It is organised by format layer (container, quanta, chunks, arrays,
  Huffman, RLE, LZ) and describes behaviour in prose, tables and small, original algorithm sketches.
- It does contain numeric constants (field widths, offsets, thresholds): facts about the data format, needed to read data in
  that format. ooz's lookup tables are not reproduced; the specification gives the underlying rule instead.

## Side B log: key statements

- Read: `SPEC.md` v1.0 in full; the vector manifest; the vector files as decoder input, with expected outputs known only through
  their SHA-256 values; general knowledge of JavaScript, canonical Huffman coding and LZ77. No web pages were opened and no web
  searches were made.
- Did not read: "Nothing under side A (not opened, listed, searched or grepped)"; no ooz source, no 1.x C++ or WebAssembly, no
  Oodle SDK, library, header or DLL, no Unreal Engine or other Oodle/Kraken/Mermaid decoder or port, on disk or on the web.
- Ambiguities in the specification were settled from its text and the vectors only, and recorded.
- Private save data was used only as test input, in memory, compared by SHA-256; none of it is in the implementation.

## Test vectors in this repository

`test/vectors/` holds only vectors that side A assembled by hand: the 11 "handmade" streams and 5 hand-built corrupt streams.
Further corrupt streams (bad header bits, checksum flag, truncation, trailing byte, wrong sizes) are derived in
`test/mermaid-api.test.mjs` from a handmade stream.

Not in this repository: vectors made from the author's own saves, and vectors produced by the Oodle encoder (synthetic inputs,
and corrupt or unsupported streams built from them). They can be checked locally with `MERMAID_VECTORS`. With that full set
(199 vectors) side B's decoder gives byte-identical output for all 114 distinct real save payloads and all 60 synthetic
streams, and rejects all 14 corrupt or unsupported streams with the expected error.

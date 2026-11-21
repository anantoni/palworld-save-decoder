# Changelog

## 2.0.0 (unreleased)

The whole package is now MIT. The GPL-3.0 ooz decompressor (C++ compiled to WebAssembly) is replaced by a new,
dependency-free JavaScript decompressor (`js/mermaid.js`), written independently from a format specification
(see `CLEANROOM.md`). Same results: on a real world save the CLI output (table and `--json`) is identical to 1.0.1.

Breaking changes:
- Removed `dist/ooz.wasm`, `js/ooz.mjs`, the C++ sources (`src/`), `build.sh`, `verify.sh` and `SHA256SUMS`.
- Removed the subpath exports `palworld-save-decoder/ooz` and `palworld-save-decoder/ooz.wasm`.
  Use `palworld-save-decoder/mermaid` (or `decompress` from the main entry) instead.
- `readPalworldSave(bytes, { wasm })`: the `wasm` option is no longer needed and is ignored.
- `createOoz(wasm)` is deprecated: it ignores its argument and resolves to `{ decompress }` from the new decompressor.
- A damaged or unsupported `PlM` save now rejects with a `SaveError` (player-safe message; the decoder error is its `cause`)
  instead of a plain `Error("decompression failed (n)")`.
- `PlM` streams that use features current saves never contain (other codecs, tANS or composite arrays, checksums)
  are rejected with an `UnsupportedError` instead of being decoded.
- Licence changed from `(MIT AND GPL-3.0-only)` to `MIT`; `LICENSE-MIT` is now `LICENSE`.

Added:
- Exports `decompress`, `decompressPlm`, `parsePlmHeader`, `plmCodec`, `MermaidError`, `UnsupportedError`; types in `types/mermaid.d.ts`.
- Public test vectors (`test/vectors/`, hand-built only), corruption fuzz tests with fixed seeds, and an opt-in local vector
  run (`MERMAID_VECTORS`). The package itself does not ship tests or vectors.
- `CLEANROOM.md`.

## 1.0.1
- The IV calculator moved: homepage and README links now point to the Sourcemined Palworld IV calculator. No code changes.

## 1.0.0 (2026-11-13)

First release as a standalone tool.

- Dual licence split: original reader, CLI, types, browser example and README under MIT; bundled ooz decompressor under GPLv3. Combined builds that include or link ooz are covered by GPLv3.

- `readPalworldSave(bytes)`: reads a `Level.sav` and returns the players and every owned Pal (level, IVs, souls, passives, condenser stars,
  friendship, alpha, lucky, awakened, gender, owner, instance id). Works in Node 18+ and in browsers.
- Supports zlib saves (once and twice compressed), Oodle saves and the console `CNK` header.
- `palworld-pals` command-line tool: table or `--json` output.
- Low-level exports: `unwrapSav`, `readWorld`, `readProps`, `Reader`, `createOoz`, `SaveError`; TypeScript types in `types/index.d.ts`.
- Tests with synthetic saves (no file needed), plus optional checks on your own save.
- Browser example in `examples/browser.html`.
- Same output as the reader behind the Lore Armory IV calculator (checked on 7 real worlds, 203 to 480 Pals each).

## 0.1.0

- ooz (Oodle decompressor, GPLv3) compiled to WebAssembly with a small JavaScript wrapper and a reproducible build.

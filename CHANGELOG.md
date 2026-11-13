# Changelog

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

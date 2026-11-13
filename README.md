# palworld-save-decoder

Read your own Palworld save and get every Pal's level, IVs, souls, passives and condenser stars, in the browser or in Node.
Everything runs locally: the file is read on your machine and nothing is uploaded, stored or logged.

- One call: `readPalworldSave(bytes)` returns the players and owned Pals of a `Level.sav`.
- Works with old saves (zlib) and current saves (Oodle), including the console `CNK` header.
- No dependencies. The Oodle decompressor is ooz compiled to WebAssembly (about 120 KB, reproducible build).
- A command-line tool, `palworld-pals`, prints your Pals as a table or JSON.

It powers the "Load your save" button of the [Lore Armory Palworld IV calculator](https://lorearmory.com/palworld/iv-calculator/),
which turns these numbers into exact Attack, Defense and HP.

## Install

```
npm install github:anantoni/palworld-save-decoder#v1.0.0
```

Node 18 or newer, or any current browser. Or copy `js/` and `dist/ooz.wasm` into your site.

## Use

### Node

```js
import { readFile } from 'node:fs/promises';
import { readPalworldSave } from 'palworld-save-decoder';

const world = await readPalworldSave(await readFile('Level.sav'));
for (const pal of world.pals) {
  console.log(pal.character, pal.level, pal.talent); // "Anubis" 50 { hp: 87, attack: 100, defense: 64 }
}
```

### Browser

```html
<input type="file" id="save" accept=".sav">
<script type="module">
  import { readPalworldSave } from './js/index.mjs';
  document.getElementById('save').onchange = async (e) => {
    const world = await readPalworldSave(await e.target.files[0].arrayBuffer());
    console.log(world.pals);
  };
</script>
```

`dist/ooz.wasm` is fetched from next to `js/` by default. If you host it somewhere else, pass it in:
`readPalworldSave(bytes, { wasm: await fetch('/assets/ooz.wasm') })`. A full page is in `examples/browser.html`.

### Command line

```
npx palworld-pals path/to/Level.sav          # table
npx palworld-pals path/to/Level.sav --json   # everything, as JSON
```

## Where is my save?

On Windows (Steam): `%LOCALAPPDATA%\Pal\Saved\SaveGames\<your Steam id>\<world id>\Level.sav`.
Each world has its own folder. Pick the newest one if you are not sure. Close the game first, or copy the file, so it is not being written while you read it.

## Worked example

```
$ npx palworld-pals Level.sav
480 Pals, 1 players
NegativeKoala                Lv12  0* IV 61/77/51    souls 0/0/0      Player       ElementResist_Ice_1_PAL
MopBaby                      Lv10  0* IV 84/9/13     souls 0/0/0      Player       Deffence_up2
FlameBambi                   Lv12  0* IV 70/38/90    souls 0/0/0      Player       PAL_masochist
```

Columns: species, level, condenser stars, IVs (HP/Attack/Defense, 0 to 100), souls (HP/Attack/Defense), owner, tags (alpha, lucky, awakened), passives.

To turn these into the stats the game shows, enter them in the [IV calculator](https://lorearmory.com/palworld/iv-calculator/) or use the model in the paper below.

## What you get

```ts
interface SaveWorld {
  players: { id: string; name: string }[];
  pals: SavePal[];          // owned Pals only; wild Pals are skipped
}

interface SavePal {
  character: string;        // species id as the save writes it, without the Alpha prefix ("Anubis")
  nickname?: string;
  level: number;
  condenser: number;        // condenser stars, 0 to 4
  talent: { hp: number; attack: number; defense: number };  // IVs, 0 to 100
  souls: { hp: number; attack: number; defense: number };   // soul upgrades
  friendship?: number;      // trust points
  passives: string[];       // passive ids as the save writes them ("Legend", "Deffence_up3")
  alpha: boolean;
  lucky: boolean;
  awakened?: boolean;
  gender?: string;
  owner: string;            // owning player's id (hex)
  id: string;               // the Pal's instance id (hex)
}
```

Full types: `types/index.d.ts`. Species and passive ids are the ones the save uses; map them to display names with your own table.

## API

| Export | What it does |
| --- | --- |
| `readPalworldSave(bytes, { wasm? })` | Read a `Level.sav` (Uint8Array or ArrayBuffer). Returns `{ players, pals }`. |
| `readSaveFile(bytes, { inflate, oodle })` | Same, with your own codecs. |
| `unwrapSav(bytes, codecs)` | Remove the `.sav` container and return the inner GVAS bytes. |
| `readWorld(gvas)` | Read players and Pals from GVAS bytes. |
| `readProps(reader, want?)` | Low-level: walk any Unreal GVAS property stream, reading only the properties `want` selects. |
| `createOoz(wasm)` | The Oodle decompressor on its own: `(await createOoz(bytes)).decompress(stream, size)`. |
| `SaveError` | Thrown for files that are not supported saves. Its message is safe to show to players. |

Subpath imports: `palworld-save-decoder/save` (the reader only, no WebAssembly), `palworld-save-decoder/ooz`, `palworld-save-decoder/ooz.wasm`.

## Research

- Paper: [How Palworld computes Pal Attack, Defense and HP: an exact model verified in game](https://doi.org/10.5281/zenodo.24189999)
- Dataset: [Palworld stat verification](https://doi.org/10.5281/zenodo.24190003)
- Tool: [Lore Armory Palworld IV calculator](https://lorearmory.com/palworld/iv-calculator/)

If you use this in research or another tool, please cite the paper and link the calculator.

Author: [Anastasios Antoniadis](https://anantoni.github.io/) · [ORCID](https://orcid.org/0009-0004-1605-967X) · [Lore Armory](https://lorearmory.com/)

## Tests

```
npm test                                              # synthetic saves, no file needed
PALWORLD_SAVE=path/to/Level.sav npm test              # also reads your own save
OOZ_SAMPLE=path/to/Level.sav npm test                 # also checks the WebAssembly decompressor on it
```

## Build the decompressor (reproducible)

Needs [wasi-sdk](https://github.com/WebAssembly/wasi-sdk) 34 (the build was made with `wasi-sdk-34.0-x86_64-linux`).

```
WASI_SDK=/path/to/wasi-sdk-34.0-x86_64-linux ./build.sh   # writes dist/ooz.wasm
./verify.sh                                               # compares dist/ooz.wasm with SHA256SUMS
```

`dist/ooz.wasm` is committed, and `SHA256SUMS` holds its checksum: building from this source with wasi-sdk 34 gives the same bytes
(`b9de3ba07a5bbce24da1cc2c92ad6c83661d2ad05fec1ff40325da97ceb1dd2e`), which is the file the calculator page ships.

## Credits and licence

The decompressor is based on **ooz** by Powzix (<https://github.com/powzix/ooz>), GNU GPL v3 or later; the original copyright notice is kept at the top
of `src/kraken.cpp` (`bitknit.cpp` and `lzna.cpp` are parts of the same upstream source). Changes in this repository: the Windows-only code (file IO,
`main`, DLL loading) is removed, MSVC intrinsics are replaced by portable ones (`src/compat.h`), the SSE2 intrinsics are mapped onto WebAssembly SIMD
(`src/sse_wasm.h`), and `src/api.cpp` and `js/ooz.mjs` add a small API. The save reader (`js/save.mjs`, `js/index.mjs`) is original code by Lore Armory.

Licensed under the GNU General Public License v3 or later (`LICENSE`). If you distribute `ooz.wasm`, offer this source with it.
This is an independent project: it is not affiliated with or endorsed by the makers of Palworld or of any compression library.
"Oodle" and "Palworld" are trademarks of their owners.

<!-- SPDX-License-Identifier: MIT -->
# palworld-save-decoder

Read your own Palworld save and get every Pal's level, IVs, souls, passives and condenser stars, in the browser or in Node.
Everything runs locally: the file is read on your machine and nothing is uploaded, stored or logged.

- One call: `readPalworldSave(bytes)` returns the players and owned Pals of a `Level.sav`.
- Works with old saves (zlib, `PlZ`) and current saves (`PlM`), including the console `CNK` header.
- Pure JavaScript, no dependencies, no WebAssembly. MIT licensed.
- A command-line tool, `palworld-pals`, prints your Pals as a table or JSON.

It powers the "Load your save" button of the [Sourcemined Palworld IV calculator](https://sourcemined.com/palworld/iv-calculator/),
which turns these numbers into exact Attack, Defense and HP.

## Install

```
npm install github:anantoni/palworld-save-decoder#v2.0.0
```

Node 18 or newer, or any current browser. Or copy `js/` into your site.

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

Nothing else is fetched: the decompressor is plain JavaScript in `js/mermaid.js`. A full page is in `examples/browser.html`.

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

To turn these into the stats the game shows, enter them in the [IV calculator](https://sourcemined.com/palworld/iv-calculator/) or use the model in the paper below.

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
| `readPalworldSave(bytes)` | Read a `Level.sav` (Uint8Array or ArrayBuffer). Returns `{ players, pals }`. |
| `readSaveFile(bytes, { inflate, oodle })` | Same, with your own codecs (`oodle` is the codec for `PlM` saves; `plmCodec` is the built-in one). |
| `unwrapSav(bytes, codecs)` | Remove the `.sav` container and return the inner GVAS bytes. |
| `readWorld(gvas)` | Read players and Pals from GVAS bytes. |
| `readProps(reader, want?)` | Low-level: walk any Unreal GVAS property stream, reading only the properties `want` selects. |
| `decompress(stream, size)` | The `PlM` decompressor on its own: the stream after the 12-byte header, to exactly `size` bytes. |
| `decompressPlm(file)`, `parsePlmHeader(file)` | Decompress a whole `PlM` file to GVAS bytes; read its header. |
| `plmCodec(stream, size)` | `decompress`, with decoder errors turned into a `SaveError` (the decoder error is its `cause`). |
| `MermaidError`, `UnsupportedError` | Decoder errors: `code` is `"corrupt"` or `"unsupported"`. Corrupt input never reads or writes out of bounds. |
| `SaveError` | Thrown for files that are not supported saves. Its message is safe to show to players. |
| `createOoz()` | Deprecated (1.x compatibility): resolves to `{ decompress }`. |

Subpath imports: `palworld-save-decoder/save` (the reader only, bring your own codecs), `palworld-save-decoder/mermaid` (the decompressor only).

## Research

- Paper: [How Palworld computes Pal Attack, Defense and HP: an exact model verified in game](https://doi.org/10.5281/zenodo.24189999)
- Dataset: [Palworld stat verification](https://doi.org/10.5281/zenodo.24190003)
- Tool: [Sourcemined Palworld IV calculator](https://sourcemined.com/palworld/iv-calculator/)

If you use this in research or another tool, please cite the paper and link the calculator.

Author: [Anastasios Antoniadis](https://anantoni.github.io/) · [ORCID](https://orcid.org/0009-0004-1605-967X) · [Sourcemined](https://sourcemined.com/)

## Tests

```
npm test                                              # synthetic saves and the public test vectors, no file needed
PALWORLD_SAVE=path/to/Level.sav npm test              # also reads your own save
MERMAID_VECTORS=path/to/vectors npm test              # also checks a local vector set (a folder with a MANIFEST.json)
MERMAID_FUZZ_ITER=40000 npm test                      # longer corruption fuzzing (fixed seed)
```

`test/vectors/` holds hand-built compressed streams and hand-built corrupt streams, each with the SHA-256 of its expected output.
Larger vector sets (for example made from your own saves) stay on your machine and are read by path through `MERMAID_VECTORS`;
CI does not set it, so those tests are skipped there.

## Licensing

MIT, the whole package ([LICENSE](LICENSE)). The decompressor is an independent implementation written from a format
specification; see [CLEANROOM.md](CLEANROOM.md) for how it was made.

Compatibility: it reads the `PlM` saves current Palworld builds write (checked byte for byte on 114 distinct real save payloads).
Streams that use features those saves do not use are rejected with an `UnsupportedError` rather than guessed at.

This is an independent project: it is not affiliated with or endorsed by the makers of Palworld or of any compression library.
"Palworld" and "Oodle" are trademarks of their owners.

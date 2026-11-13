#!/usr/bin/env node
// SPDX-License-Identifier: MIT
// Print the Pals in your own Palworld Level.sav.  Usage: palworld-pals <path/to/Level.sav> [--json]
import { readFile } from 'node:fs/promises';
import { readPalworldSave, SaveError } from '../js/index.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
if (!file || args.includes('--help')) {
  console.log('Usage: palworld-pals <path/to/Level.sav> [--json]\nPrints each owned Pal: level, condenser stars, IVs (HP/Attack/Defense), souls and passives.');
  process.exit(file ? 0 : 1);
}
try {
  const world = await readPalworldSave(await readFile(file));
  if (args.includes('--json')) {
    console.log(JSON.stringify(world, null, 2));
  } else {
    const names = new Map(world.players.map((p) => [p.id, p.name]));
    console.log(`${world.pals.length} Pals, ${world.players.length} players`);
    for (const p of world.pals) {
      const tags = [p.alpha && 'alpha', p.lucky && 'lucky', p.awakened && 'awakened'].filter(Boolean).join(',');
      console.log(
        [
          (p.nickname ? `${p.character} "${p.nickname}"` : p.character).padEnd(28),
          `Lv${p.level}`.padEnd(5),
          `${p.condenser}*`,
          `IV ${p.talent.hp}/${p.talent.attack}/${p.talent.defense}`.padEnd(14),
          `souls ${p.souls.hp}/${p.souls.attack}/${p.souls.defense}`.padEnd(16),
          (names.get(p.owner) ?? p.owner.slice(0, 8)).padEnd(12),
          tags.padEnd(14),
          p.passives.join(', '),
        ].join(' '),
      );
    }
  }
} catch (e) {
  console.error(e instanceof SaveError ? e.message : e);
  process.exit(1);
}

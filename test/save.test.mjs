// npm test : the save reader on a synthetic save built here (no real save needed), the zlib container
// variants, clear errors, and, when PALWORLD_SAVE points at a Level.sav of your own, a full read through the public API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { readPalworldSave, readWorld, SaveError, unwrapSav, inflate } from '../js/index.mjs';

// ---- a tiny GVAS writer (only what the reader needs) ----
const enc = new TextEncoder();
const u32 = (n) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n, true); return b; };
const i32 = u32;
const u64 = (n) => { const b = new Uint8Array(8); new DataView(b.buffer).setUint32(0, n, true); return b; };
const cat = (...p) => { const o = new Uint8Array(p.reduce((a, x) => a + x.length, 0)); let i = 0; for (const x of p) { o.set(x, i); i += x.length; } return o; };
const str = (s) => cat(i32(s.length + 1), enc.encode(s), new Uint8Array(1));
const guid = (hex) => Uint8Array.from(hex.match(/../g).map((h) => parseInt(h, 16)));
const prop = (name, type, extras, payload) => cat(str(name), str(type), u64(payload.length), extras, payload);
const none = str('None');
const intProp = (name, v) => prop(name, 'IntProperty', new Uint8Array(1), i32(v));
const nameProp = (name, v) => prop(name, 'NameProperty', new Uint8Array(1), str(v));
const strProp = (name, v) => prop(name, 'StrProperty', new Uint8Array(1), str(v));
const boolProp = (name, v) => prop(name, 'BoolProperty', Uint8Array.of(v ? 1 : 0, 0), new Uint8Array(0));
const guidStruct = (name, hex) => prop(name, 'StructProperty', cat(str('Guid'), new Uint8Array(17)), guid(hex));
const nameArray = (name, v) => prop(name, 'ArrayProperty', cat(str('NameProperty'), new Uint8Array(1)), cat(u32(v.length), ...v.map(str)));
const structOf = (name, type, inner) => prop(name, 'StructProperty', cat(str(type), new Uint8Array(17)), cat(inner, none));
const rawBytes = (bytes) => prop('RawData', 'ArrayProperty', cat(str('ByteProperty'), new Uint8Array(1)), cat(u32(bytes.length), bytes));
const palRecord = (fields) => cat(structOf('SaveParameter', 'PalIndividualCharacterSaveParameter', fields), new Uint8Array(20));
const entry = (player, instance, raw) => cat(guidStruct('PlayerUId', player), guidStruct('InstanceId', instance), strProp('DebugName', ''), none, rawBytes(raw), none);
function gvas(entries) {
  const header = cat(enc.encode('GVAS'), u32(3), u32(522), u32(1008), Uint8Array.of(5, 0, 1, 0, 1, 0), u32(0), str('++UE5+Release-5.1'), u32(3), u32(0), str('/Script/Pal.PalWorldSaveGame'));
  const map = prop('CharacterSaveParameterMap', 'MapProperty', cat(str('StructProperty'), str('StructProperty'), new Uint8Array(1)), cat(u32(0), u32(entries.length), ...entries));
  return cat(header, prop('worldSaveData', 'StructProperty', cat(str('PalWorldSaveGameData'), new Uint8Array(17)), cat(map, none)), none);
}
const ME = '00000000000000000000000001000000';
const sample = gvas([
  entry(ME, 'aa'.repeat(16), palRecord(cat(nameProp('CharacterID', 'BOSS_BlueSkyDragon'), intProp('Level', 80), intProp('Talent_HP', 100), intProp('Talent_Shot', 99), intProp('Talent_Defense', 98), intProp('Rank', 5), intProp('Rank_HP', 63), intProp('Rank_Attack', 88), intProp('Rank_Defence', 41), intProp('FriendshipPoint', 200000), nameArray('PassiveSkillList', ['Legend', 'Deffence_up3']), boolProp('bIsAwakening', true), boolProp('IsRarePal', true), guidStruct('OwnerPlayerUId', ME)))),
  entry(ME, 'bb'.repeat(16), cat(structOf('SaveParameter', 'PalIndividualCharacterSaveParameter', cat(boolProp('IsPlayer', true), strProp('NickName', 'Ada'))), new Uint8Array(20))),
  entry('00000000000000000000000000000000', 'cc'.repeat(16), palRecord(cat(nameProp('CharacterID', 'SheepBall'), intProp('Level', 3)))), // wild: no owner
]);
const wrap = (magic, type, size, body) => cat(u32(size), u32(body.length), enc.encode(magic), Uint8Array.of(type), body);

test('reads an owned Pal, skips wild Pals and finds the player', () => {
  const w = readWorld(sample);
  assert.equal(w.pals.length, 1);
  assert.deepEqual(w.players, [{ id: ME, name: 'Ada' }]);
  const p = w.pals[0];
  assert.equal(p.character, 'BlueSkyDragon');
  assert.equal(p.alpha, true);
  assert.equal(p.lucky, true);
  assert.equal(p.awakened, true);
  assert.equal(p.level, 80);
  assert.equal(p.condenser, 4); // Rank 5 = four stars
  assert.deepEqual(p.talent, { hp: 100, attack: 99, defense: 98 });
  assert.deepEqual(p.souls, { hp: 63, attack: 88, defense: 41 });
  assert.equal(p.friendship, 200000);
  assert.deepEqual(p.passives, ['Legend', 'Deffence_up3']);
  assert.equal(p.owner, ME);
  assert.equal(p.id, 'aa'.repeat(16));
});

test('readPalworldSave: zlib once and twice through the public API', async () => {
  const once = new Uint8Array(deflateSync(sample));
  assert.equal((await readPalworldSave(wrap('PlZ', 0x31, sample.length, once))).pals.length, 1);
  const twice = new Uint8Array(deflateSync(once));
  assert.equal((await readPalworldSave(wrap('PlZ', 0x32, sample.length, twice).buffer)).pals[0].character, 'BlueSkyDragon');
});

test('unwrapSav: a second zlib pass longer than the first', async () => {
  const noise = new Uint8Array(3000).map((_, i) => (i * 2654435761) >>> 24);
  const noiseOnce = deflateSync(noise);
  const noiseTwice = new Uint8Array(deflateSync(noiseOnce));
  assert.ok(noiseTwice.length > noiseOnce.length);
  assert.deepEqual(await unwrapSav(cat(u32(noise.length), u32(noiseOnce.length), enc.encode('PlZ'), Uint8Array.of(0x32), noiseTwice), { inflate }), noise);
});

test('clear errors for files that are not saves', async () => {
  await assert.rejects(() => readPalworldSave(enc.encode('not a save file at all')), SaveError);
  await assert.rejects(() => unwrapSav(wrap('PlM', 0x31, 10, new Uint8Array(10)), { inflate }), /decoder/);
  assert.throws(() => readWorld(enc.encode('GVAS not really a save file, just text of some length to pass the size check')), SaveError);
});

const own = process.env.PALWORLD_SAVE;
test('your own Level.sav (set PALWORLD_SAVE)', { skip: !own || !existsSync(own) ? 'set PALWORLD_SAVE to a Level.sav of your own' : false }, async () => {
  const w = await readPalworldSave(readFileSync(own));
  assert.ok(w.pals.length > 0, 'no Pals found');
  for (const p of w.pals) for (const v of Object.values(p.talent)) assert.ok(v >= 0 && v <= 100, `IV out of range for ${p.character}`);
});

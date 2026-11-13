// SPDX-License-Identifier: MIT
// Reads the Pals out of a Palworld world save (Level.sav). Runs in the browser or Node; nothing is sent anywhere.
//
// Layers:
//   1. unwrapSav(): the .sav file wraps the save data in a small header and a compression layer (zlib, or Oodle in current
//      builds). The codecs are passed in, so this file has no dependencies; readPalworldSave() in index.mjs wires them up.
//   2. readProps(): walks the save's property stream (Unreal Engine's GVAS format). Every property carries its own byte size,
//      so everything that is not needed is skipped.
//   3. readWorld(): picks the owned Pals out of the world's character list and keeps their stats-relevant fields.

/** Thrown for a file that is not a supported Palworld save. The message is safe to show to a player. */
export class SaveError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SaveError';
  }
}

/**
 * Removes the .sav container: u32 uncompressed size, u32 compressed size, 3 magic bytes ("PlZ" zlib, "PlM" Oodle) and a
 * type byte (0x30 stored, 0x31 compressed once, 0x32 zlib twice). Returns the GVAS bytes.
 * @param {Uint8Array} sav
 * @param {{ inflate: (data: Uint8Array, size: number) => Uint8Array | Promise<Uint8Array>, oodle?: (data: Uint8Array, size: number) => Uint8Array | Promise<Uint8Array> }} codecs
 * @returns {Promise<Uint8Array>}
 */
export async function unwrapSav(sav, codecs) {
  if (sav.length < 12) throw new SaveError('That file is too small to be a save file.');
  const dv = new DataView(sav.buffer, sav.byteOffset, sav.byteLength);
  let off = 0;
  // Some saves (from consoles) start with a 12 byte "CNK" chunk header before the usual one.
  if (sav[0] === 0x43 && sav[1] === 0x4e && sav[2] === 0x4b) off = 12;
  const size = dv.getUint32(off, true);
  const csize = dv.getUint32(off + 4, true);
  const magic = String.fromCharCode(sav[off + 8], sav[off + 9], sav[off + 10]);
  const type = sav[off + 11];
  const body = sav.subarray(off + 12);
  if (magic !== 'PlZ' && magic !== 'PlM') throw new SaveError('This does not look like a Palworld save file (Level.sav).');
  if (type === 0x30) return body.subarray(0, size);
  if (magic === 'PlM') {
    if (!codecs.oodle) throw new SaveError('This save needs the decoder, which has not loaded.');
    if (type !== 0x31) throw new SaveError('This save file layout is not supported yet.');
    return await codecs.oodle(body.subarray(0, csize), size);
  }
  if (type === 0x31) return await codecs.inflate(body.subarray(0, csize), size);
  if (type === 0x32) {
    // The header's compressed size is the first pass's; the file holds the second pass, which can be longer, so read all of it.
    const once = await codecs.inflate(body, csize);
    return await codecs.inflate(once, size);
  }
  throw new SaveError('This save file layout is not supported yet.');
}

// ---------------------------------------------------------------- GVAS reading

/** A little-endian cursor over a byte array. */
export class Reader {
  /** @param {Uint8Array} b @param {number} [pos] */
  constructor(b, pos = 0) {
    this.b = b;
    this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
    this.pos = pos;
  }
  u8() { return this.b[this.pos++]; }
  u16() { const v = this.dv.getUint16(this.pos, true); this.pos += 2; return v; }
  i32() { const v = this.dv.getInt32(this.pos, true); this.pos += 4; return v; }
  u32() { const v = this.dv.getUint32(this.pos, true); this.pos += 4; return v; }
  /** A 64-bit size or number, as a JS number (exact below 2^53, which every size here is). */
  u64() { const lo = this.dv.getUint32(this.pos, true); const hi = this.dv.getUint32(this.pos + 4, true); this.pos += 8; return hi * 4294967296 + lo; }
  i64() { const lo = this.dv.getUint32(this.pos, true); const hi = this.dv.getInt32(this.pos + 4, true); this.pos += 8; return hi * 4294967296 + lo; }
  f32() { const v = this.dv.getFloat32(this.pos, true); this.pos += 4; return v; }
  f64() { const v = this.dv.getFloat64(this.pos, true); this.pos += 8; return v; }
  guid() {
    let s = '';
    for (let i = 0; i < 16; i++) s += this.b[this.pos + i].toString(16).padStart(2, '0');
    this.pos += 16;
    return s;
  }
  /** An Unreal string: i32 length (negative: UTF-16 with that many characters), then the characters and a trailing zero. */
  str() {
    const n = this.i32();
    if (n === 0) return '';
    let s = '';
    if (n < 0) {
      const chars = -n;
      for (let i = 0; i < chars - 1; i++) s += String.fromCharCode(this.dv.getUint16(this.pos + i * 2, true));
      this.pos += chars * 2;
      return s;
    }
    for (let i = 0; i < n - 1; i++) s += String.fromCharCode(this.b[this.pos + i]);
    this.pos += n;
    return s;
  }
}

/** Structs whose payload is a fixed binary value, not a property list. */
const FIXED_STRUCT = {
  Guid: (r) => r.guid(),
  DateTime: (r) => r.i64(),
  Vector: (r) => ({ x: r.f64(), y: r.f64(), z: r.f64() }),
  Quat: (r) => ({ x: r.f64(), y: r.f64(), z: r.f64(), w: r.f64() }),
  LinearColor: (r) => ({ r: r.f32(), g: r.f32(), b: r.f32(), a: r.f32() }),
  Rotator: (r) => ({ x: r.f64(), y: r.f64(), z: r.f64() }),
};

/** The type-specific part of a property header, between the size and the payload. */
function readExtras(r, type) {
  switch (type) {
    case 'StructProperty': { const structType = r.str(); r.pos += 16 + 1; return { structType }; }
    case 'ArrayProperty': case 'SetProperty': { const arrayType = r.str(); r.pos += 1; return { arrayType }; }
    case 'MapProperty': { const keyType = r.str(); const valueType = r.str(); r.pos += 1; return { keyType, valueType }; }
    case 'ByteProperty': case 'EnumProperty': { const enumType = r.str(); r.pos += 1; return { enumType }; }
    case 'BoolProperty': { const boolValue = r.u8() !== 0; r.pos += 1; return { boolValue }; }
    default: r.pos += 1; return {};
  }
}

/**
 * Reads a property stream until its "None" terminator and returns each wanted property's value by name.
 * `want(name, depth)` chooses which properties to read in full; the rest are skipped by their size.
 * @param {Reader} r
 * @param {(name: string, depth: number) => boolean} [want]
 * @param {number} [depth]
 * @returns {Record<string, unknown>}
 */
export function readProps(r, want, depth = 0) {
  const out = {};
  for (;;) {
    const name = r.str();
    if (name === 'None' || name === '') return out;
    const type = r.str();
    const size = r.u64();
    const ex = readExtras(r, type);
    const start = r.pos;
    if (!want || want(name, depth)) out[name] = readValue(r, type, size, ex, want, depth);
    r.pos = start + size;
  }
}

function readValue(r, type, size, ex, want, depth) {
  switch (type) {
    case 'IntProperty': return r.i32();
    case 'UInt32Property': return r.u32();
    case 'Int64Property': return r.i64();
    case 'UInt64Property': return r.u64();
    case 'Int16Property': { const v = r.dv.getInt16(r.pos, true); r.pos += 2; return v; }
    case 'UInt16Property': return r.u16();
    case 'FloatProperty': return r.f32();
    case 'DoubleProperty': return r.f64();
    case 'BoolProperty': return ex.boolValue;
    case 'StrProperty': case 'NameProperty': case 'EnumProperty': return r.str();
    case 'ByteProperty': return ex.enumType === 'None' ? r.u8() : r.str();
    case 'StructProperty': return readStruct(r, ex.structType, want, depth + 1);
    case 'ArrayProperty': case 'SetProperty': return readArray(r, ex.arrayType, size, want, depth + 1);
    case 'MapProperty': return readMap(r, ex, want, depth + 1);
    default: throw new SaveError(`Unknown property type ${type}.`);
  }
}

function readStruct(r, structType, want, depth) {
  const fixed = FIXED_STRUCT[structType];
  return fixed ? fixed(r) : readProps(r, want, depth);
}

function readArray(r, arrayType, size, want, depth) {
  const start = r.pos;
  const n = r.u32();
  switch (arrayType) {
    case 'ByteProperty': { const v = r.b.subarray(r.pos, r.pos + n); r.pos += n; return v; }
    case 'StructProperty': {
      r.str(); // the array's property name
      r.str(); // "StructProperty"
      r.u64(); // payload size
      const structType = r.str();
      r.pos += 16 + 1;
      const out = [];
      for (let i = 0; i < n; i++) out.push(readStruct(r, structType, want, depth));
      return out;
    }
    case 'NameProperty': case 'StrProperty': case 'EnumProperty': { const out = []; for (let i = 0; i < n; i++) out.push(r.str()); return out; }
    case 'IntProperty': { const out = []; for (let i = 0; i < n; i++) out.push(r.i32()); return out; }
    case 'FloatProperty': { const out = []; for (let i = 0; i < n; i++) out.push(r.f32()); return out; }
    default: r.pos = start + size; return undefined;
  }
}

function readMap(r, ex, want, depth) {
  r.u32(); // keys removed since the map was created (always 0 in a save)
  const n = r.u32();
  const one = (type) => {
    switch (type) {
      case 'StructProperty': return readProps(r, want, depth);
      case 'NameProperty': case 'StrProperty': case 'EnumProperty': return r.str();
      case 'IntProperty': return r.i32();
      case 'UInt32Property': return r.u32();
      case 'Int64Property': return r.i64();
      case 'UInt64Property': return r.u64();
      case 'FloatProperty': return r.f32();
      case 'BoolProperty': return r.u8() !== 0;
      case 'ByteProperty': return r.u8();
      default: throw new SaveError(`Unknown map type ${type}.`);
    }
  };
  const out = [];
  for (let i = 0; i < n; i++) {
    const key = one(ex.keyType);
    const value = one(ex.valueType);
    out.push({ key, value });
  }
  return out;
}

// ---------------------------------------------------------------- the world's Pals

/** Skips the GVAS header (versions, engine, custom version list, class name) and returns a reader at the first property. */
function gvasReader(gvas) {
  if (gvas.length < 64 || gvas[0] !== 0x47 || gvas[1] !== 0x56 || gvas[2] !== 0x41 || gvas[3] !== 0x53) throw new SaveError('This does not look like a Palworld save file (Level.sav).');
  const r = new Reader(gvas, 4);
  if (r.u32() !== 3) throw new SaveError('This save file version is not supported yet.');
  r.u32(); // Unreal file version (UE4)
  r.u32(); // Unreal file version (UE5)
  r.u16(); r.u16(); r.u16(); r.u32(); r.str(); // engine version and branch
  r.u32(); // custom version format
  const customs = r.u32();
  r.pos += customs * 20;
  r.str(); // save game class name
  return r;
}

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/**
 * Reads every owned Pal (wild Pals have no owner and are skipped) and the players from a world's GVAS bytes.
 * @param {Uint8Array} gvas
 * @returns {import('../types/index').SaveWorld}
 */
export function readWorld(gvas) {
  const r = gvasReader(gvas);
  const top = readProps(r, (name, depth) => (depth === 0 ? name === 'worldSaveData' : depth === 1 ? name === 'CharacterSaveParameterMap' : true));
  const map = top.worldSaveData?.CharacterSaveParameterMap;
  if (!Array.isArray(map)) throw new SaveError('This save has no Pal list in it. Is it the Level.sav file?');
  const players = [];
  const pals = [];
  for (const entry of map) {
    const raw = entry.value?.RawData;
    if (!(raw instanceof Uint8Array)) throw new SaveError('This save file layout is not supported yet.');
    const sp = readProps(new Reader(raw), undefined, 3).SaveParameter;
    if (!sp) continue;
    const key = entry.key ?? {};
    if (sp.IsPlayer === true) {
      players.push({ id: String(key.PlayerUId ?? ''), name: String(sp.NickName ?? 'Player') });
      continue;
    }
    const character = String(sp.CharacterID ?? '');
    const owner = String(sp.OwnerPlayerUId ?? '');
    if (!character || !owner || /^0+$/.test(owner)) continue; // wild Pals have no owner
    pals.push({
      character: character.replace(/^BOSS_/i, ''),
      ...(typeof sp.NickName === 'string' && sp.NickName ? { nickname: sp.NickName } : {}),
      level: num(sp.Level, 1),
      condenser: Math.max(0, Math.min(4, num(sp.Rank || 1) - 1)),
      talent: { hp: num(sp.Talent_HP), attack: num(sp.Talent_Shot), defense: num(sp.Talent_Defense) },
      souls: { hp: num(sp.Rank_HP), attack: num(sp.Rank_Attack), defense: num(sp.Rank_Defence) },
      friendship: num(sp.FriendshipPoint),
      passives: Array.isArray(sp.PassiveSkillList) ? sp.PassiveSkillList.map(String) : [],
      alpha: /^BOSS_/i.test(character),
      lucky: sp.IsRarePal === true,
      owner,
      id: String(key.InstanceId ?? ''),
      ...(typeof sp.Gender === 'string' ? { gender: sp.Gender.replace(/^EPalGenderType::/, '') } : {}),
      awakened: sp.bIsAwakening === true,
    });
  }
  return { players, pals };
}

/**
 * Unwrap and read a Level.sav in one call, with your own codecs.
 * @param {Uint8Array} sav
 * @param {Parameters<typeof unwrapSav>[1]} codecs
 */
export async function readSaveFile(sav, codecs) {
  return readWorld(await unwrapSav(sav, codecs));
}

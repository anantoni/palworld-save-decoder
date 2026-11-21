// SPDX-License-Identifier: MIT
// Type definitions for palworld-save-decoder.

/** One owned Pal from a save. */
export interface SavePal {
  /** The species id as the save writes it, without the Alpha prefix ("Anubis"). */
  character: string;
  nickname?: string;
  level: number;
  /** Condenser stars, 0 to 4. */
  condenser: number;
  /** The Pal's IVs (talents), 0 to 100. */
  talent: { hp: number; attack: number; defense: number };
  /** Soul upgrades (Pal Essence Condenser souls / statue ranks). */
  souls: { hp: number; attack: number; defense: number };
  /** Friendship (trust) points. */
  friendship?: number;
  /** Passive skill ids as the save writes them ("Legend", "Deffence_up3"). */
  passives: string[];
  alpha: boolean;
  lucky: boolean;
  /** The owning player's id (hex). */
  owner: string;
  /** The Pal's instance id (hex), to tell two Pals of one species apart. */
  id: string;
  gender?: string;
  awakened?: boolean;
}

export interface SaveWorld {
  players: { id: string; name: string }[];
  pals: SavePal[];
}

export type Codec = (data: Uint8Array, size: number) => Uint8Array | Promise<Uint8Array>;
export interface Codecs { inflate: Codec; oodle?: Codec }

export class SaveError extends Error {
  constructor(message: string, options?: { cause?: unknown });
}

/** Read a Level.sav and return its players and owned Pals. The second argument is accepted for 1.x compatibility and ignored. */
export function readPalworldSave(sav: Uint8Array | ArrayBuffer, options?: object): Promise<SaveWorld>;
/** Same, with your own codecs (for example a decoder you host yourself). */
export function readSaveFile(sav: Uint8Array, codecs: Codecs): Promise<SaveWorld>;
/** Remove the .sav container and return the GVAS bytes. */
export function unwrapSav(sav: Uint8Array, codecs: Codecs): Promise<Uint8Array>;
/** Read the players and owned Pals from GVAS bytes. */
export function readWorld(gvas: Uint8Array): SaveWorld;
/** zlib inflate using DecompressionStream. */
export function inflate(data: Uint8Array): Promise<Uint8Array>;

/** The PlM codec readPalworldSave uses (pass it as `oodle` to readSaveFile/unwrapSav): like `decompress`, but decoder errors become a SaveError (decoder error in `cause`). */
export function plmCodec(data: Uint8Array, size: number): Uint8Array;

export { MermaidError, UnsupportedError, decompress, decompressPlm, parsePlmHeader, PlmHeader } from './mermaid';

/** @deprecated 1.x compatibility: returns the built-in decompressor; the argument is ignored. Use `decompress`. */
export function createOoz(wasm?: unknown): Promise<{ decompress(src: Uint8Array, size: number): Uint8Array }>;

export class Reader {
  constructor(b: Uint8Array, pos?: number);
  b: Uint8Array;
  dv: DataView;
  pos: number;
  u8(): number; u16(): number; i32(): number; u32(): number; u64(): number; i64(): number; f32(): number; f64(): number;
  guid(): string;
  str(): string;
}
export function readProps(r: Reader, want?: (name: string, depth: number) => boolean, depth?: number): Record<string, unknown>;

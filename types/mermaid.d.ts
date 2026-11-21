/** Any decoding failure. */
export class MermaidError extends Error {
  readonly name: 'MermaidError' | 'UnsupportedError';
  /** "corrupt" for invalid data, "unsupported" for a feature outside the specification. */
  readonly code: 'corrupt' | 'unsupported';
}

/** Valid-looking data that uses a feature this decoder does not implement (Kraken, tANS, PlZ, ...). */
export class UnsupportedError extends MermaidError {
  readonly name: 'UnsupportedError';
  readonly code: 'unsupported';
}

/**
 * Decompress a raw Mermaid stream (the bytes after the 12-byte PlM header)
 * into exactly `size` bytes. All input must be consumed.
 * @throws {MermaidError} on corrupt or unsupported data
 * @throws {TypeError | RangeError} on invalid arguments
 */
export function decompress(src: Uint8Array, size: number): Uint8Array;

export interface PlmHeader {
  /** Uncompressed size R. */
  rawSize: number;
  /** Compressed payload size S (equals file length minus 12). */
  compressedSize: number;
  /** Save type byte (0x31). */
  saveType: number;
}

/** Parse and validate the 12-byte PlM header. */
export function parsePlmHeader(file: Uint8Array): PlmHeader;

/** Decompress a whole PlM `.sav` file to its GVAS bytes. */
export function decompressPlm(file: Uint8Array): Uint8Array;

// SPDX-License-Identifier: GPL-3.0-only
// A tiny C API around the ooz decompressor, for WebAssembly (and a native test).
#include "compat.h"

int Kraken_Decompress(const byte *src, size_t src_len, byte *dst, size_t dst_len);

// The decompressor writes up to 64 bytes past the end of the destination.
#define SAFE_SPACE 64

extern "C" {
#if defined(__wasm__)
__attribute__((export_name("oz_alloc")))
#endif
void *oz_alloc(size_t n) { return malloc(n + SAFE_SPACE); }

#if defined(__wasm__)
__attribute__((export_name("oz_free")))
#endif
void oz_free(void *p) { free(p); }

/** Decompress one Oodle stream (Kraken, Mermaid, Selkie, Leviathan, LZNA or Bitknit) of dst_len bytes into dst (which must have
 *  been allocated with oz_alloc(dst_len)). Returns the number of bytes written, or a negative number on error. */
#if defined(__wasm__)
__attribute__((export_name("oz_decompress")))
#endif
int oz_decompress(const unsigned char *src, size_t src_len, unsigned char *dst, size_t dst_len) {
  return Kraken_Decompress(src, src_len, dst, dst_len);
}
}

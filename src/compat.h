// SPDX-License-Identifier: GPL-3.0-only
// Portable replacement for the original stdafx.h (Windows-only headers and MSVC intrinsics).
// This file is part of the ooz-based Oodle (Kraken/Mermaid/Selkie/Leviathan/LZNA/Bitknit) decompressor
// and is distributed under the GNU General Public License v3 (LICENSE).
#pragma once

#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <stdint.h>
#include <assert.h>
#if defined(__wasm__)
#include "sse_wasm.h"   // the SSE intrinsics ooz uses, on WebAssembly SIMD
#else
#include <immintrin.h>
#endif

typedef unsigned char byte;
typedef unsigned char uint8;
typedef unsigned int uint32;
typedef unsigned long long uint64;
typedef signed long long int64;
typedef signed int int32;
typedef unsigned short uint16;
typedef signed short int16;
typedef unsigned int uint;
typedef unsigned int DWORD;

#define __forceinline inline __attribute__((always_inline))
#define WINAPI

template <class T> static __forceinline void _BitScanReverse(T *index, uint32 x) { *index = 31 - __builtin_clz(x); }
template <class T> static __forceinline void _BitScanForward(T *index, uint32 x) { *index = __builtin_ctz(x); }
static __forceinline uint32 oz_rotl(uint32 x, int n) { n &= 31; return n ? (x << n) | (x >> (32 - n)) : x; }
static __forceinline uint16 oz_bswap16(uint16 x) { return __builtin_bswap16(x); }
static __forceinline uint32 oz_bswap32(uint32 x) { return __builtin_bswap32(x); }
static __forceinline uint64 oz_bswap64(uint64 x) { return __builtin_bswap64(x); }
#define _rotl oz_rotl
#define _byteswap_ushort oz_bswap16
#define _byteswap_ulong oz_bswap32
#define _byteswap_uint64 oz_bswap64

// The few SSE2 intrinsics the ooz decompressor uses, written on top of WebAssembly SIMD (wasm_simd128.h).
// Distributed under the GNU General Public License v3 or later, like the rest of this module.
#pragma once
#include <wasm_simd128.h>

typedef v128_t __m128i;
#define _MM_HINT_T0 0
#define _mm_prefetch(p, h) ((void)0)

#define _mm_loadu_si128(p) wasm_v128_load((const void *)(p))
#define _mm_storeu_si128(p, v) wasm_v128_store((void *)(p), (v))
#define _mm_loadl_epi64(p) wasm_v128_load64_zero((const void *)(p))
#define _mm_storel_epi64(p, v) wasm_v128_store64_lane((void *)(p), (v), 0)
#define _mm_cvtsi32_si128(x) wasm_i32x4_make((x), 0, 0, 0)

#define _mm_set1_epi8(x) wasm_i8x16_splat((x))
#define _mm_set1_epi16(x) wasm_i16x8_splat((x))
#define _mm_set1_epi32(x) wasm_i32x4_splat((x))
#define _mm_set_epi16(e7, e6, e5, e4, e3, e2, e1, e0) wasm_i16x8_make((e0), (e1), (e2), (e3), (e4), (e5), (e6), (e7))

#define _mm_add_epi8(a, b) wasm_i8x16_add((a), (b))
#define _mm_add_epi16(a, b) wasm_i16x8_add((a), (b))
#define _mm_sub_epi8(a, b) wasm_i8x16_sub((a), (b))
#define _mm_sub_epi16(a, b) wasm_i16x8_sub((a), (b))
#define _mm_and_si128(a, b) wasm_v128_and((a), (b))
#define _mm_xor_si128(a, b) wasm_v128_xor((a), (b))
#define _mm_max_epu8(a, b) wasm_u8x16_max((a), (b))
#define _mm_cmpeq_epi8(a, b) wasm_i8x16_eq((a), (b))
#define _mm_cmpgt_epi16(a, b) wasm_i16x8_gt((a), (b))
#define _mm_packs_epi16(a, b) wasm_i8x16_narrow_i16x8((a), (b))
#define _mm_movemask_epi8(a) ((int)wasm_i8x16_bitmask((a)))
#define _mm_srai_epi16(a, n) wasm_i16x8_shr((a), (n))
#define _mm_srli_epi16(a, n) wasm_u16x8_shr((a), (n))

#define _mm_unpacklo_epi8(a, b) wasm_i8x16_shuffle((a), (b), 0, 16, 1, 17, 2, 18, 3, 19, 4, 20, 5, 21, 6, 22, 7, 23)
#define _mm_unpackhi_epi8(a, b) wasm_i8x16_shuffle((a), (b), 8, 24, 9, 25, 10, 26, 11, 27, 12, 28, 13, 29, 14, 30, 15, 31)
#define _mm_unpacklo_epi16(a, b) wasm_i16x8_shuffle((a), (b), 0, 8, 1, 9, 2, 10, 3, 11)

#define _mm_shuffle_epi32(a, imm) wasm_i32x4_shuffle((a), (a), (imm) & 3, ((imm) >> 2) & 3, ((imm) >> 4) & 3, ((imm) >> 6) & 3)

// Byte shifts of the whole register by a constant n (0..15), as in SSE2's pslldq / psrldq.
#define OZ_SHL(i, n) ((i) < (n) ? 0 : 16 + (i) - (n))
#define _mm_slli_si128(a, n) \
  wasm_i8x16_shuffle(wasm_i8x16_const_splat(0), (a), OZ_SHL(0, n), OZ_SHL(1, n), OZ_SHL(2, n), OZ_SHL(3, n), OZ_SHL(4, n), OZ_SHL(5, n), OZ_SHL(6, n), OZ_SHL(7, n), OZ_SHL(8, n), OZ_SHL(9, n), OZ_SHL(10, n), OZ_SHL(11, n), OZ_SHL(12, n), OZ_SHL(13, n), OZ_SHL(14, n), OZ_SHL(15, n))
#define OZ_SHR(i, n) ((i) + (n) < 16 ? (i) + (n) : 16)
#define _mm_srli_si128(a, n) \
  wasm_i8x16_shuffle((a), wasm_i8x16_const_splat(0), OZ_SHR(0, n), OZ_SHR(1, n), OZ_SHR(2, n), OZ_SHR(3, n), OZ_SHR(4, n), OZ_SHR(5, n), OZ_SHR(6, n), OZ_SHR(7, n), OZ_SHR(8, n), OZ_SHR(9, n), OZ_SHR(10, n), OZ_SHR(11, n), OZ_SHR(12, n), OZ_SHR(13, n), OZ_SHR(14, n), OZ_SHR(15, n))

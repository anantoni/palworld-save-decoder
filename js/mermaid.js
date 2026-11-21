// SPDX-License-Identifier: MIT
// Copyright (c) 2026 Anastasios Antoniadis
//
// Clean-room decoder for the Mermaid-coded payload of Palworld PlM saves.
// Implemented only from the written format specification (SPEC.md v1.0)
// and its test vectors. Section numbers below refer to that document.

const QUANTUM = 0x40000;
const CHUNK = 0x20000;
const HALF = 0x10000;
const MAX_NEST = 8;

/** Any decoding failure. `code` is "corrupt" or "unsupported". */
export class MermaidError extends Error {
  constructor(message, code = 'corrupt') {
    super(message);
    this.name = 'MermaidError';
    this.code = code;
  }
}

/** Valid-looking data that uses a feature outside the specification. */
export class UnsupportedError extends MermaidError {
  constructor(message) {
    super('unsupported: ' + message, 'unsupported');
    this.name = 'UnsupportedError';
  }
}

function fail(msg) {
  throw new MermaidError(msg);
}

function unsupported(msg) {
  throw new UnsupportedError(msg);
}

const DECODER_NAMES = { 5: 'LZNA', 6: 'Kraken', 11: 'BitKnit', 12: 'Leviathan' };

// Scratch buffers, reused between calls (decoding is synchronous).
let scratch = null;
function getScratch() {
  if (scratch === null) {
    scratch = {
      lit: new Uint8Array(CHUNK),
      cmd: new Uint8Array(CHUNK),
      hi: new Uint8Array(HALF),
      lo: new Uint8Array(HALF),
      near: new Uint32Array(HALF),
      far1: new Uint32Array(HALF),
      far2: new Uint32Array(HALF),
    };
  }
  return scratch;
}

// Result of decodeArray (read immediately after each call).
const res = { buf: null, off: 0, n: 0, next: 0, raw: false };

// ---------------------------------------------------------------------------
// Section 5: arrays

function decodeArray(src, pos, end, cap, dst, dOff, depth) {
  if (pos >= end) fail('array header past end of input');
  const h = src[pos];
  const t = (h >> 4) & 7;
  if (t === 0) {
    let n, hs;
    if (h >= 0x80) {
      if (end - pos < 2) fail('truncated raw array header');
      n = ((h << 8) | src[pos + 1]) & 0xfff;
      hs = 2;
    } else {
      if (end - pos < 3) fail('truncated raw array header');
      n = (h << 16) | (src[pos + 1] << 8) | src[pos + 2];
      if (n > 0x3ffff) fail('raw array too large');
      hs = 3;
    }
    if (n > cap) fail('raw array exceeds capacity');
    const s = pos + hs;
    if (end - s < n) fail('raw array truncated');
    res.buf = src;
    res.off = s;
    res.n = n;
    res.next = s + n;
    res.raw = true;
    return;
  }
  if (t === 1) unsupported('tANS array (type 1)');
  if (t === 5) unsupported('composite array (type 5)');
  if (t > 5) fail('invalid array type ' + t);
  let p, n, hs;
  if (h >= 0x80) {
    if (end - pos < 3) fail('truncated array header');
    const v = (h << 16) | (src[pos + 1] << 8) | src[pos + 2];
    p = v & 0x3ff;
    n = p + ((v >> 10) & 0x3ff) + 1;
    hs = 3;
  } else {
    if (end - pos < 5) fail('truncated array header');
    const w =
      ((src[pos + 1] << 24) | (src[pos + 2] << 16) | (src[pos + 3] << 8) | src[pos + 4]) >>> 0;
    p = w & 0x3ffff;
    n = (w >>> 18) + ((h & 15) << 14) + 1;
    if (p >= n) fail('array payload not smaller than its size');
    hs = 5;
  }
  if (n > cap) fail('array exceeds capacity');
  const ps = pos + hs;
  if (end - ps < p) fail('array payload truncated');
  const pe = ps + p;
  if (dst === null) {
    dst = new Uint8Array(n);
    dOff = 0;
  }
  if (t === 3) decodeRle(src, ps, pe, n, dst, dOff, depth);
  else decodeHuffman(src, ps, pe, n, dst, dOff, t === 4);
  res.buf = dst;
  res.off = dOff;
  res.n = n;
  res.next = pe;
  res.raw = false;
}

// ---------------------------------------------------------------------------
// Section 6: Huffman arrays

// MSB-first table-description reader state.
let tsrc = null;
let tps = 0;
let tpe = 0;
let tbp = 0; // bit position relative to tps

function tbyte(i) {
  return i < tpe ? tsrc[i] : 0;
}

function tpeek(k) {
  // k <= 9
  if (k === 0) return 0;
  const i = tps + (tbp >> 3);
  const w = (tbyte(i) << 16) | (tbyte(i + 1) << 8) | tbyte(i + 2);
  return (w >> (24 - (tbp & 7) - k)) & ((1 << k) - 1);
}

function tread(k) {
  const v = tpeek(k);
  tbp += k;
  return v;
}

const lut = new Uint16Array(2048); // (symbol << 4) | length, index = 11 bits LSB-first
const tSyms = new Uint8Array(256);
const tLens = new Uint8Array(256);
const unary = new Int32Array(512);
const seen = new Uint8Array(256);
const sortedSyms = new Uint8Array(256);
const sortedLens = new Uint8Array(256);

function readTable(src, ps, pe) {
  tsrc = src;
  tps = ps;
  tpe = pe;
  tbp = 0;
  const pbits = (pe - ps) * 8;
  let k;
  if (tread(1) === 1) {
    if (tread(1) === 1) fail('invalid Huffman table kind');
    // 6.3 Rice table
    const q = tread(2);
    k = tread(8) + 1;
    if (k < 2) unsupported('one-symbol Huffman table');
    let e = 0;
    if (k !== 256) {
      const x = 2 * Math.min(k, 257 - k);
      const y = 32 - Math.clz32(x - 1);
      const z = (1 << y) - x;
      const v = tpeek(y);
      if (v >> 1 < z) {
        tbp += y - 1;
        e = v >> 1;
      } else {
        tbp += y;
        e = v - z;
      }
    }
    const total = k + e;
    for (let i = 0; i < total; i++) {
      let c = 0;
      for (;;) {
        if (tbp >= pbits) fail('Huffman table runs past payload');
        if (tread(1) === 1) break;
        c++;
      }
      unary[i] = c;
    }
    let sAcc = 30;
    for (let i = 0; i < k; i++) {
      const a = unary[i] * (1 << q) + tread(q);
      const delta = a & 1 ? -((a + 1) / 2) : a / 2;
      const len = Math.floor(sAcc / 4) + delta + 1;
      if (len < 1 || len > 11) fail('Huffman code length out of range');
      tLens[i] = len;
      sAcc += delta;
    }
    // ranges of present symbols
    let gi = k;
    let s = 0;
    let listed = 0;
    if (e & 1) {
      const a = unary[gi++];
      if (a > 7) fail('bad Rice symbol range');
      s = (1 << (a + 1)) - 1 + tread(a + 1);
    }
    for (let j = 0; j < e >> 1; j++) {
      const a = unary[gi++];
      const b = unary[gi++];
      if (a > 8 || b > 7) fail('bad Rice symbol range');
      const count = (1 << a) + tread(a);
      const gap = (1 << (b + 1)) - 1 + tread(b + 1);
      if (s + count > 256 || listed + count >= k) fail('bad Rice symbol range');
      for (let i = 0; i < count; i++) tSyms[listed++] = s + i;
      s += count + gap;
    }
    const m = k - listed;
    if (!(s < 256 && m >= 1 && s + m <= 256)) fail('bad Rice symbol range');
    for (let i = 0; i < m; i++) tSyms[listed++] = s + i;
  } else {
    if (tread(1) === 1) unsupported('dense legacy Huffman table');
    // 6.2 sparse table
    k = tread(8);
    if (k === 0) fail('empty Huffman table');
    if (k === 1) unsupported('one-symbol Huffman table');
    const w = tread(3);
    if (w > 4) fail('bad sparse length width');
    seen.fill(0);
    for (let i = 0; i < k; i++) {
      const sym = tread(8);
      const len = w === 0 ? 1 : tread(w) + 1;
      if (len > 11) fail('Huffman code length out of range');
      if (seen[sym]) fail('duplicate Huffman symbol');
      seen[sym] = 1;
      tSyms[i] = sym;
      tLens[i] = len;
    }
  }
  if (tbp > pbits) fail('Huffman table runs past payload');

  // 6.4 canonical code: stable sort by length, Kraft check, assign codes.
  let kraft = 0;
  for (let i = 0; i < k; i++) kraft += 1 << (11 - tLens[i]);
  if (kraft !== 2048) fail(kraft < 2048 ? 'incomplete Huffman code' : 'over-full Huffman code');
  let o = 0;
  for (let L = 1; L <= 11; L++) {
    for (let i = 0; i < k; i++) {
      if (tLens[i] === L) {
        sortedSyms[o] = tSyms[i];
        sortedLens[o] = L;
        o++;
      }
    }
  }
  let code = 0;
  let prevL = sortedLens[0];
  for (let i = 0; i < k; i++) {
    const L = sortedLens[i];
    if (i > 0) code = (code + 1) << (L - prevL);
    prevL = L;
    let rev = 0;
    for (let b = 0; b < L; b++) rev |= ((code >> b) & 1) << (L - 1 - b);
    const entry = (sortedSyms[i] << 4) | L;
    for (let j = rev; j < 2048; j += 1 << L) lut[j] = entry;
  }
  return ps + ((tbp + 7) >> 3);
}

function decodeHuffman(src, ps, pe, n, dst, dOff, six) {
  const cs = readTable(src, ps, pe);
  if (!six) {
    decodeGroup(src, cs, pe, n, dst, dOff);
    return;
  }
  if (pe - cs < 3) fail('truncated 6-stream split');
  const M = src[cs] | (src[cs + 1] << 8) | (src[cs + 2] << 16);
  const g = cs + 3;
  if (M > pe - g) fail('6-stream split out of range');
  const n1 = (n + 1) >> 1;
  decodeGroup(src, g, g + M, n1, dst, dOff);
  decodeGroup(src, g + M, pe, n - n1, dst, dOff + n1);
}

// 6.5: one 3-stream group of n symbols over [g0, g1).
function decodeGroup(src, g0, g1, n, dst, dOff) {
  if (g1 - g0 < 2) fail('truncated Huffman stream group');
  const m = src[g0] | (src[g0 + 1] << 8);
  const aS = g0 + 2;
  const aE = aS + m;
  if (aE > g1) fail('Huffman stream A out of range');
  const rS = aE;
  const rE = g1;
  const L = lut;
  // stream A forward, B forward, C backward
  let pa = aS, ba = 0, ca = 0;
  let pb = rS, bb = 0, cb = 0;
  let pc = rE - 1, bc = 0, cc = 0;
  let e;
  let o = dOff;
  const end3 = dOff + n - (n % 3);
  while (o < end3) {
    while (ca <= 24) { ba |= (pa < aE ? src[pa] : 0) << ca; pa++; ca += 8; }
    while (cc <= 24) { bc |= (pc >= rS ? src[pc] : 0) << cc; pc--; cc += 8; }
    while (cb <= 24) { bb |= (pb < rE ? src[pb] : 0) << cb; pb++; cb += 8; }
    e = L[ba & 2047]; dst[o] = e >> 4; ba >>>= e & 15; ca -= e & 15;
    e = L[bc & 2047]; dst[o + 1] = e >> 4; bc >>>= e & 15; cc -= e & 15;
    e = L[bb & 2047]; dst[o + 2] = e >> 4; bb >>>= e & 15; cb -= e & 15;
    o += 3;
  }
  const rem = n % 3;
  if (rem >= 1) {
    while (ca <= 24) { ba |= (pa < aE ? src[pa] : 0) << ca; pa++; ca += 8; }
    e = L[ba & 2047]; dst[o] = e >> 4; ba >>>= e & 15; ca -= e & 15;
  }
  if (rem >= 2) {
    while (cc <= 24) { bc |= (pc >= rS ? src[pc] : 0) << cc; pc--; cc += 8; }
    e = L[bc & 2047]; dst[o + 1] = e >> 4; bc >>>= e & 15; cc -= e & 15;
  }
  const usedA = ((pa - aS) * 8 - ca + 7) >> 3;
  const usedB = ((pb - rS) * 8 - cb + 7) >> 3;
  const usedC = ((rE - 1 - pc) * 8 - cc + 7) >> 3;
  if (usedA !== m) fail('Huffman stream A length mismatch');
  if (usedB + usedC !== rE - rS) fail('Huffman streams B/C length mismatch');
}

// ---------------------------------------------------------------------------
// Section 7: RLE arrays

function decodeRle(src, ps, pe, n, dst, dOff, depth) {
  const p = pe - ps;
  if (p === 0) fail('empty RLE payload');
  if (p === 1) {
    dst.fill(src[ps], dOff, dOff + n);
    return;
  }
  let Q, f, b;
  if (src[ps] === 0) {
    Q = src;
    f = ps + 1;
    b = pe;
  } else {
    if (depth >= MAX_NEST) fail('RLE nesting too deep');
    decodeArray(src, ps, pe, QUANTUM, null, 0, depth + 1);
    const dBuf = res.buf, dOffN = res.off, dn = res.n, next = res.next;
    if (res.raw && dOffN + dn === next) {
      Q = src;
      f = dOffN;
      b = pe;
    } else {
      Q = new Uint8Array(dn + (pe - next));
      Q.set(dBuf.subarray(dOffN, dOffN + dn), 0);
      Q.set(src.subarray(next, pe), dn);
      f = 0;
      b = Q.length;
    }
  }
  let F = 0;
  let o = dOff;
  const oe = dOff + n;
  while (f < b) {
    const c = Q[b - 1];
    let lc, rl;
    if (c === 0 || c >= 0x30) {
      b -= 1;
      lc = 15 - (c & 15);
      rl = c >> 4;
    } else if (c === 1) {
      b -= 1;
      if (f >= b) fail('RLE fill command without literal');
      F = Q[f++];
      continue;
    } else {
      if (b - 2 < f) fail('RLE command does not fit');
      const w = Q[b - 2] + 256 * c;
      b -= 2;
      if (c >= 0x10) {
        const v = w - 4096;
        lc = v & 63;
        rl = v >> 6;
      } else if (c >= 0x09) {
        lc = 0;
        rl = (w - 0x8ff) * 128;
      } else {
        lc = (w - 0x1ff) * 64;
        rl = 0;
      }
    }
    if (f + lc > b) fail('RLE literals overrun commands');
    if (oe - o < lc + rl) fail('RLE output overrun');
    for (let i = 0; i < lc; i++) dst[o + i] = Q[f + i];
    o += lc;
    f += lc;
    if (rl) {
      dst.fill(F, o, o + rl);
      o += rl;
    }
  }
  if (f !== b || o !== oe) fail('RLE size mismatch');
}

// ---------------------------------------------------------------------------
// Section 8: LZ chunks

function readFar(src, ip, be, count, dst, base) {
  for (let j = 0; j < count; j++) {
    if (be - ip < 3) fail('far offsets truncated');
    let v = src[ip] | (src[ip + 1] << 8) | (src[ip + 2] << 16);
    ip += 3;
    if (base >= 0xbfffff && v >= 0xc00000) {
      if (ip >= be) fail('far offsets truncated');
      v += src[ip++] * 0x400000;
    }
    if (v > base) fail('far offset before start of output');
    dst[j] = v;
  }
  return ip;
}

function decodeLz(src, bs, be, out, P, N, mode, S) {
  let ip = bs;
  if (P === 0) {
    if (N < 8) fail('first LZ chunk shorter than 8 bytes');
    if (be - ip < 8) fail('LZ body truncated');
    for (let i = 0; i < 8; i++) out[i] = src[ip + i];
    ip += 8;
  }
  decodeArray(src, ip, be, N, S.lit, 0, 0);
  const lit = res.buf;
  let lp = res.off;
  const litEnd = res.off + res.n;
  ip = res.next;
  decodeArray(src, ip, be, N, S.cmd, 0, 0);
  const cmd = res.buf;
  const cmdStart = res.off;
  const cmdLen = res.n;
  ip = res.next;
  let split = cmdLen;
  if (N > HALF) {
    if (be - ip < 2) fail('LZ body truncated');
    split = src[ip] | (src[ip + 1] << 8);
    ip += 2;
    if (split > cmdLen) fail('command split out of range');
  }
  if (be - ip < 2) fail('LZ body truncated');
  const nc = src[ip] | (src[ip + 1] << 8);
  ip += 2;
  const near = S.near;
  let nearCount;
  if (nc === 0xffff) {
    decodeArray(src, ip, be, N >> 1, S.hi, 0, 0);
    const hb = res.buf, ho = res.off, hn = res.n;
    ip = res.next;
    decodeArray(src, ip, be, N >> 1, S.lo, 0, 0);
    const lb = res.buf, lo = res.off, ln = res.n;
    ip = res.next;
    if (hn !== ln) fail('near offset arrays differ in length');
    for (let j = 0; j < hn; j++) near[j] = lb[lo + j] + 256 * hb[ho + j];
    nearCount = hn;
  } else {
    if (be - ip < 2 * nc) fail('near offsets truncated');
    for (let j = 0; j < nc; j++) near[j] = src[ip + 2 * j] | (src[ip + 2 * j + 1] << 8);
    ip += 2 * nc;
    nearCount = nc;
  }
  if (be - ip < 3) fail('LZ body truncated');
  const T = src[ip] | (src[ip + 1] << 8) | (src[ip + 2] << 16);
  ip += 3;
  let n1 = 0, n2 = 0;
  if (T !== 0) {
    n1 = T >> 12;
    n2 = T & 0xfff;
    if (n1 === 4095) {
      if (be - ip < 2) fail('LZ body truncated');
      n1 = src[ip] | (src[ip + 1] << 8);
      ip += 2;
    }
    if (n2 === 4095) {
      if (be - ip < 2) fail('LZ body truncated');
      n2 = src[ip] | (src[ip + 1] << 8);
      ip += 2;
    }
  }
  ip = readFar(src, ip, be, n1, S.far1, P);
  ip = readFar(src, ip, be, n2, S.far2, P + HALF);
  if (N <= HALF && n2 !== 0) fail('unused far offsets');

  let lenp = ip;
  let r = 8;
  let np = 0;
  const m1 = mode === 1;
  const halves = N > HALF ? 2 : 1;
  for (let half = 0; half < halves; half++) {
    const Hs = P + half * HALF;
    const He = half ? P + N : P + Math.min(N, HALF);
    let ci = cmdStart + (half ? split : 0);
    const ce = cmdStart + (half ? cmdLen : split);
    const far = half ? S.far2 : S.far1;
    const farN = half ? n2 : n1;
    let fp = 0;
    let x = half === 0 && P === 0 ? Hs + 8 : Hs;
    while (ci < ce) {
      const c = cmd[ci++];
      let m, d;
      if (c >= 24) {
        const l = c & 7;
        if (l !== 0) {
          if (He - x < l) fail('literal past end of half');
          if (litEnd - lp < l) fail('literals exhausted');
          if (m1) for (let k = 0; k < l; k++) out[x + k] = lit[lp + k];
          else for (let k = 0; k < l; k++) out[x + k] = (lit[lp + k] + out[x + k - r]) & 255;
          x += l;
          lp += l;
        }
        m = (c >> 3) & 15;
        if (c < 128) {
          if (np >= nearCount) fail('near offsets exhausted');
          r = near[np++];
        }
        if (m === 0) continue;
        d = r;
      } else if (c >= 3) {
        m = c + 5;
        if (fp >= farN) fail('far offsets exhausted');
        d = x - Hs + far[fp++];
        r = d;
      } else if (c === 0) {
        if (lenp >= be) fail('length stream exhausted');
        let v = src[lenp++];
        if (v > 251) {
          if (be - lenp < 2) fail('length stream exhausted');
          v += 4 * (src[lenp] | (src[lenp + 1] << 8));
          lenp += 2;
        }
        const l = v + 64;
        if (He - x < l) fail('literal past end of half');
        if (litEnd - lp < l) fail('literals exhausted');
        if (m1) out.set(lit.subarray(lp, lp + l), x);
        else for (let k = 0; k < l; k++) out[x + k] = (lit[lp + k] + out[x + k - r]) & 255;
        x += l;
        lp += l;
        continue;
      } else {
        if (lenp >= be) fail('length stream exhausted');
        let v = src[lenp++];
        if (v > 251) {
          if (be - lenp < 2) fail('length stream exhausted');
          v += 4 * (src[lenp] | (src[lenp + 1] << 8));
          lenp += 2;
        }
        if (c === 1) {
          m = v + 91;
          if (np >= nearCount) fail('near offsets exhausted');
          r = near[np++];
          d = r;
        } else {
          m = v + 29;
          if (fp >= farN) fail('far offsets exhausted');
          d = x - Hs + far[fp++];
          r = d;
        }
      }
      // copy m bytes at distance d
      if (d < 8) fail('match distance below 8');
      if (d > x) fail('match before start of output');
      if (He - x < m) fail('match past end of half');
      let s = x - d;
      if (m <= 32) {
        for (let k = 0; k < m; k++) out[x + k] = out[s + k];
        x += m;
      } else {
        let rem = m;
        while (rem > 0) {
          const k = rem < d ? rem : d;
          out.copyWithin(x, s, s + k);
          x += k;
          s += k;
          rem -= k;
        }
      }
    }
    // trailing literals
    const l = He - x;
    if (litEnd - lp < l) fail('literals exhausted');
    if (m1) out.set(lit.subarray(lp, lp + l), x);
    else for (let k = 0; k < l; k++) out[x + k] = (lit[lp + k] + out[x + k - r]) & 255;
    lp += l;
    if (fp !== farN) fail('unused far offsets');
  }
  if (lenp !== be) fail('length stream not fully used');
  if (lp !== litEnd) fail('literals not fully used');
  if (np !== nearCount) fail('unused near offsets');
}

// ---------------------------------------------------------------------------
// Section 3.3: Mermaid quantum

function decodeQuantum(src, qs, qe, out, pos, qsize, S) {
  let ip = qs;
  let P = pos;
  const qend = pos + qsize;
  while (P < qend) {
    const csize = Math.min(CHUNK, qend - P);
    if (qe - ip < 4) fail('truncated chunk header');
    const G = (src[ip] << 16) | (src[ip + 1] << 8) | src[ip + 2];
    if ((G & 0x800000) === 0) {
      decodeArray(src, ip, qe, csize, out, P, 0);
      if (res.raw) fail('raw array in entropy-only chunk');
      if (res.n !== csize) fail('entropy-only chunk size mismatch');
      ip = res.next;
    } else {
      ip += 3;
      const s = G & 0x7ffff;
      const mode = (G >> 19) & 0xf;
      if (qe - ip < s) fail('chunk truncated');
      if (s < csize) {
        if (mode > 1) fail('invalid LZ chunk mode ' + mode);
        decodeLz(src, ip, ip + s, out, P, csize, mode, S);
      } else if (s === csize && mode === 0) {
        out.set(src.subarray(ip, ip + s), P);
      } else {
        fail('invalid chunk header');
      }
      ip += s;
    }
    P += csize;
  }
  if (ip !== qe) fail('quantum size mismatch');
}

// ---------------------------------------------------------------------------
// Section 3: stream framing

/**
 * Decompress a raw Mermaid stream into exactly `size` bytes.
 * @param {Uint8Array} src
 * @param {number} size
 * @returns {Uint8Array}
 */
export function decompress(src, size) {
  if (!(src instanceof Uint8Array)) throw new TypeError('src must be a Uint8Array');
  if (!Number.isSafeInteger(size) || size < 0) throw new RangeError('size must be a non-negative integer');
  // Normalise subclasses (e.g. Node Buffer) so hot loops stay monomorphic.
  if (src.constructor !== Uint8Array) src = new Uint8Array(src.buffer, src.byteOffset, src.length);
  let out;
  try {
    out = new Uint8Array(size);
  } catch {
    fail('cannot allocate output of ' + size + ' bytes');
  }
  const S = getScratch();
  const iend = src.length;
  let ip = 0;
  let pos = 0;
  while (pos < size) {
    const qsize = Math.min(QUANTUM, size - pos);
    if (iend - ip < 2) fail('truncated block header');
    const b0 = src[ip];
    const b1 = src[ip + 1];
    ip += 2;
    if ((b0 & 0x0f) !== 0x0c) fail('bad block header magic');
    if (b0 & 0x30) fail('reserved block header bits set');
    const id = b1 & 0x7f;
    if (id !== 10) unsupported('decoder id ' + id + (DECODER_NAMES[id] ? ' (' + DECODER_NAMES[id] + ')' : '') + '; only Mermaid (10) is supported');
    if (b1 & 0x80) fail('checksum flag set (per-quantum checksums are not supported)');
    if (b0 & 0x40) {
      if (iend - ip < qsize) fail('uncompressed quantum truncated');
      out.set(src.subarray(ip, ip + qsize), pos);
      ip += qsize;
    } else {
      if (iend - ip < 3) fail('truncated quantum header');
      const H = (src[ip] << 16) | (src[ip + 1] << 8) | src[ip + 2];
      ip += 3;
      if ((H & 0x3ffff) === 0x3ffff) {
        if (H >> 18 !== 1) fail('unknown special quantum');
        if (ip >= iend) fail('memset quantum truncated');
        out.fill(src[ip], pos, pos + qsize);
        ip += 1;
      } else {
        const cs = (H & 0x3ffff) + 1;
        if (cs > qsize) fail('quantum compressed size exceeds output size');
        if (iend - ip < cs) fail('quantum truncated');
        if (cs === qsize) out.set(src.subarray(ip, ip + cs), pos);
        else decodeQuantum(src, ip, ip + cs, out, pos, qsize, S);
        ip += cs;
      }
    }
    pos += qsize;
  }
  if (ip !== iend) fail('trailing input after last quantum');
  return out;
}

// ---------------------------------------------------------------------------
// Section 2: PlM container

/**
 * Parse the 12-byte Palworld container header.
 * @param {Uint8Array} file
 */
export function parsePlmHeader(file) {
  if (!(file instanceof Uint8Array)) throw new TypeError('file must be a Uint8Array');
  if (file.length < 12) fail('file shorter than PlM header');
  const rawSize = (file[0] | (file[1] << 8) | (file[2] << 16) | (file[3] << 24)) >>> 0;
  const compressedSize = (file[4] | (file[5] << 8) | (file[6] << 16) | (file[7] << 24)) >>> 0;
  const m0 = file[8], m1 = file[9], m2 = file[10];
  if (m0 === 0x50 && m1 === 0x6c && m2 === 0x5a) unsupported('PlZ (zlib) container');
  if (!(m0 === 0x50 && m1 === 0x6c && m2 === 0x4d)) fail('not a PlM container');
  const saveType = file[11];
  if (saveType !== 0x31) unsupported('PlM save type 0x' + saveType.toString(16));
  if (compressedSize !== file.length - 12) fail('PlM compressed size does not match file length');
  return { rawSize, compressedSize, saveType };
}

/**
 * Decompress a whole PlM `.sav` file to its GVAS bytes.
 * @param {Uint8Array} file
 * @returns {Uint8Array}
 */
export function decompressPlm(file) {
  const h = parsePlmHeader(file);
  return decompress(file.subarray(12), h.rawSize);
}

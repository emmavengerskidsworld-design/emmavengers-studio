/* Animated GIF encoder (GIF89a, looping): one shared 256-colour palette made by median cut over sampled frames,
   light ordered dithering, LZW compression. Our own small implementation, no library. */
export function buildPalette(samples, n = 256) {
  // samples: array of RGBA Uint8ClampedArray. 5-bit-per-channel histogram, then median cut.
  const hist = new Uint32Array(32768);
  for (const d of samples) for (let i = 0; i < d.length; i += 8) hist[(d[i] >> 3) << 10 | (d[i + 1] >> 3) << 5 | d[i + 2] >> 3]++;
  const cols = []; for (let k = 0; k < 32768; k++) if (hist[k]) cols.push(k);
  let boxes = [cols];
  const ch = (k, c) => c === 0 ? k >> 10 : c === 1 ? (k >> 5) & 31 : k & 31;
  while (boxes.length < n) {
    let bi = -1, best = -1, bc = 0;
    boxes.forEach((b, i) => { if (b.length < 2) return; for (let c = 0; c < 3; c++) { let lo = 31, hi = 0; for (const k of b) { const v = ch(k, c); if (v < lo) lo = v; if (v > hi) hi = v; } const s = (hi - lo) * Math.log2(1 + b.reduce((a, k) => a + hist[k], 0)); if (s > best) { best = s; bi = i; bc = c; } } });
    if (bi < 0 || best <= 0) break;
    const b = boxes[bi].sort((x, y) => ch(x, bc) - ch(y, bc)), tot = b.reduce((a, k) => a + hist[k], 0); let acc = 0, cut = 1;
    for (let i = 0; i < b.length - 1; i++) { acc += hist[b[i]]; if (acc >= tot / 2) { cut = i + 1; break; } }
    boxes.splice(bi, 1, b.slice(0, cut), b.slice(cut));
  }
  const pal = new Uint8Array(n * 3);
  boxes.forEach((b, i) => { let r = 0, g = 0, bl = 0, w = 0; for (const k of b) { const h = hist[k]; r += ch(k, 0) * h; g += ch(k, 1) * h; bl += ch(k, 2) * h; w += h; }
    w ||= 1; pal[i * 3] = Math.round(r / w * 8.226); pal[i * 3 + 1] = Math.round(g / w * 8.226); pal[i * 3 + 2] = Math.round(bl / w * 8.226); });
  // lookup: 15-bit colour -> nearest palette index
  const used = boxes.length, lut = new Uint8Array(32768);
  for (let k = 0; k < 32768; k++) { const r = (k >> 10) * 8.226, g = ((k >> 5) & 31) * 8.226, b = (k & 31) * 8.226; let bd = 1e9, bj = 0;
    for (let j = 0; j < used; j++) { const dr = r - pal[j * 3], dg = g - pal[j * 3 + 1], db = b - pal[j * 3 + 2], d = dr * dr * 2 + dg * dg * 4 + db * db * 3; if (d < bd) { bd = d; bj = j; } } lut[k] = bj; }
  return { pal, lut };
}
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v / 16 - 0.47) * 7);
export function indexFrame(d, w, h, lut, dither = true) {
  const out = new Uint8Array(w * h);
  for (let y = 0, i = 0, o = 0; y < h; y++) for (let x = 0; x < w; x++, i += 4, o++) {
    const e = dither ? BAYER[(y & 3) << 2 | (x & 3)] : 0, c = v => Math.max(0, Math.min(255, v + e)) >> 3;
    out[o] = lut[c(d[i]) << 10 | c(d[i + 1]) << 5 | c(d[i + 2])];
  }
  return out;
}
function lzw(idx, minCode = 8) {
  const out = [], clear = 1 << minCode, eoi = clear + 1; let size = minCode + 1, next = eoi + 1, dict = new Map(), cur = 0, bits = 0, buf = [];
  const put = code => { cur |= code << bits; bits += size; while (bits >= 8) { buf.push(cur & 255); cur >>>= 8; bits -= 8; } };
  put(clear); let w = idx[0];
  for (let i = 1; i < idx.length; i++) { const k = idx[i], key = w << 8 | k, v = dict.get(key);
    if (v !== undefined) { w = v; continue; }
    put(w); if (next < 4096) { dict.set(key, next++); if (next > (1 << size) && size < 12) size++; } else { put(clear); dict = new Map(); size = minCode + 1; next = eoi + 1; }
    w = k; }
  put(w); put(eoi); if (bits > 0) buf.push(cur & 255);
  out.push(minCode); for (let i = 0; i < buf.length; i += 255) { const n = Math.min(255, buf.length - i); out.push(n); for (let j = 0; j < n; j++) out.push(buf[i + j]); } out.push(0);
  return new Uint8Array(out);
}
/** Streaming writer: new GifWriter(w, h, palette); add(indices, delayCs); finish() -> Blob */
export class GifWriter {
  constructor(w, h, pal) { this.w = w; this.h = h; this.parts = [];
    const hd = new Uint8Array(13 + 768 + 19); const v = new DataView(hd.buffer); 'GIF89a'.split('').forEach((c, i) => hd[i] = c.charCodeAt(0));
    v.setUint16(6, w, true); v.setUint16(8, h, true); hd[10] = 0xf7; hd[11] = 0; hd[12] = 0; hd.set(pal.subarray(0, 768), 13);
    hd.set([0x21, 0xff, 11, ...'NETSCAPE2.0'.split('').map(c => c.charCodeAt(0)), 3, 1, 0, 0, 0], 13 + 768); this.parts.push(hd); }
  add(idx, delayCs) {
    const g = new Uint8Array(8 + 10), v = new DataView(g.buffer); g.set([0x21, 0xf9, 4, 0x04]); v.setUint16(4, Math.max(2, Math.round(delayCs)), true); g[6] = 0; g[7] = 0;
    g[8] = 0x2c; v.setUint16(9, 0, true); v.setUint16(11, 0, true); v.setUint16(13, this.w, true); v.setUint16(15, this.h, true); g[17] = 0;
    this.parts.push(g, lzw(idx)); }
  finish() { this.parts.push(new Uint8Array([0x3b])); return new Blob(this.parts, { type: 'image/gif' }); }
}

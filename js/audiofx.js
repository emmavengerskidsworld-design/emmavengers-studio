import { curveSrc } from './speedcurve.js';
/* Audio DSP for Emmavengers Studio — plain maths, no machine learning, no AI.
   Pure functions on Float32Array channels so the very same code runs in the Web Worker (bakes the sound that the
   preview plays) and in tests. Preview and export play the SAME baked buffer, so they always sound identical.
   - Voice enhance: spectral noise gate with a learned noise profile, rumble high-pass, de-esser, presence EQ,
     compressor, loudness normalise to -14 LUFS (ITU-R BS.1770 K-weighted, gated) + peak limiter.
   - Voice effects (VOICE_FX registry): pitch (WSOLA + resample), ring mod, filters, drive, echo, reverb, choir.
   - Speed with pitch kept: WSOLA time-stretch (waveform-similarity overlap-add). */

export const TARGET_LUFS = -14;
const db2 = d => Math.pow(10, d / 20), lin2db = x => 20 * Math.log10(Math.max(1e-12, x));
const clone = ch => ch.map(c => c.slice());
const mono = ch => { if (ch.length === 1) return ch[0]; const n = ch[0].length, m = new Float32Array(n); for (const c of ch) for (let i = 0; i < n; i++) m[i] += c[i] / ch.length; return m; };

/* ---------- FFT (iterative radix-2, in place) ---------- */
const fftCache = new Map();
function fftTables(n) {
  let t = fftCache.get(n); if (t) return t;
  const rev = new Uint32Array(n), bits = Math.log2(n); for (let i = 0; i < n; i++) { let r = 0; for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b); rev[i] = r; }
  const cos = new Float32Array(n / 2), sin = new Float32Array(n / 2); for (let i = 0; i < n / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / n); sin[i] = Math.sin(2 * Math.PI * i / n); }
  t = { rev, cos, sin }; fftCache.set(n, t); return t;
}
export function fft(re, im, inv = false) {
  const n = re.length, { rev, cos, sin } = fftTables(n);
  for (let i = 0; i < n; i++) { const j = rev[i]; if (j > i) { let x = re[i]; re[i] = re[j]; re[j] = x; x = im[i]; im[i] = im[j]; im[j] = x; } }
  for (let size = 2; size <= n; size <<= 1) { const half = size >> 1, step = n / size;
    for (let i = 0; i < n; i += size) for (let j = 0, k = 0; j < half; j++, k += step) {
      const c = cos[k], s = inv ? sin[k] : -sin[k], a = i + j, b = a + half;
      const tr = re[b] * c - im[b] * s, ti = re[b] * s + im[b] * c; re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; } }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}
const hann = n => { const w = new Float32Array(n); for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / n); return w; };

/* ---------- biquads (RBJ cookbook) ---------- */
export function biquad(type, f, q, gainDb, sr) {
  const w = 2 * Math.PI * Math.min(f, sr * 0.49) / sr, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * q), A = Math.pow(10, (gainDb || 0) / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (type === 'peak') { b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; }
  else if (type === 'lowshelf' || type === 'highshelf') { const s = type === 'lowshelf' ? -1 : 1, sq = 2 * Math.sqrt(A) * al;
    b0 = A * ((A + 1) + s * (A - 1) * cw + sq); b1 = -2 * s * A * ((A - 1) + s * (A + 1) * cw); b2 = A * ((A + 1) + s * (A - 1) * cw - sq);
    a0 = (A + 1) - s * (A - 1) * cw + sq; a1 = 2 * s * ((A - 1) - s * (A + 1) * cw); a2 = (A + 1) - s * (A - 1) * cw - sq; }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0 };
}
export function filt(x, c, out = new Float32Array(x.length)) {
  let z1 = 0, z2 = 0; const { b0, b1, b2, a1, a2 } = c;
  for (let i = 0; i < x.length; i++) { const v = x[i], y = b0 * v + z1; z1 = b1 * v - a1 * y + z2; z2 = b2 * v - a2 * y; out[i] = y; }
  return out;
}
const chain = (x, cs) => { let y = x; for (const c of cs) y = filt(y, c); return y === x ? x.slice() : y; };
const BUTTER4 = [0.5412, 1.3066], BUTTER8 = [0.5098, 0.6013, 0.9000, 2.5629];
const steep = (type, f, sr, qs = BUTTER4) => qs.map(q => biquad(type, f, q, 0, sr));

/* ---------- loudness (ITU-R BS.1770-4) ---------- */
export function lufs(ch, sr) {
  const kw = [biquad('highshelf', 1681.97, 0.7072, 3.99984, sr), biquad('hp', 38.1355, 0.5003, 0, sr)];
  const ys = ch.slice(0, 2).map(c => chain(c, kw)), B = Math.round(0.4 * sr), H = Math.round(0.1 * sr), n = ch[0].length, z = [];
  if (n < B) { let s = 0; for (const y of ys) for (let i = 0; i < n; i++) s += y[i] * y[i]; const m = s / Math.max(1, n); return m > 0 ? -0.691 + 10 * Math.log10(m) : -Infinity; }
  // block power via running sums
  const pw = new Float64Array(n + 1); for (const y of ys) { let a = 0; for (let i = 0; i < n; i++) { a += y[i] * y[i]; pw[i + 1] += a; } }
  for (let s = 0; s + B <= n; s += H) z.push((pw[s + B] - pw[s]) / B);
  const L = v => -0.691 + 10 * Math.log10(v);
  let g = z.filter(v => v > 0 && L(v) > -70); if (!g.length) return -Infinity;
  const rel = L(g.reduce((a, b) => a + b, 0) / g.length) - 10;
  g = g.filter(v => L(v) > rel); if (!g.length) return -Infinity;
  return L(g.reduce((a, b) => a + b, 0) / g.length);
}
export const peak = ch => { let m = 0; for (const c of ch) for (let i = 0; i < c.length; i++) { const v = Math.abs(c[i]); if (v > m) m = v; } return m; };
/** Level (dBFS RMS) of the quietest 10% of 50 ms frames: the noise floor. */
export function noiseFloor(ch, sr) {
  const m = mono(ch), F = Math.round(0.05 * sr), r = [];
  for (let s = 0; s + F <= m.length; s += F) { let a = 0; for (let i = s; i < s + F; i++) a += m[i] * m[i]; r.push(a / F); }
  r.sort((a, b) => a - b); const k = r.slice(0, Math.max(1, Math.floor(r.length * 0.1)));
  return 10 * Math.log10(Math.max(1e-14, k.reduce((a, b) => a + b, 0) / k.length));
}
/** Energy (dB) in a frequency band over the whole signal (for tests and metrics). */
export function bandEnergy(ch, sr, lo, hi) {
  const m = mono(ch), N = 4096, re = new Float32Array(N), im = new Float32Array(N), w = hann(N); let e = 0, frames = 0;
  for (let s = 0; s + N <= m.length; s += N / 2) { for (let i = 0; i < N; i++) { re[i] = m[s + i] * w[i]; im[i] = 0; } fft(re, im);
    const a = Math.floor(lo * N / sr), b = Math.min(N / 2, Math.ceil(hi * N / sr)); for (let k = a; k < b; k++) e += re[k] * re[k] + im[k] * im[k]; frames++; }
  return 10 * Math.log10(Math.max(1e-14, e / Math.max(1, frames)));
}
/** Fundamental frequency (Hz) of a steady tone, by normalised autocorrelation with parabolic refinement. */
export function pitchOf(x, sr, fmin = 60, fmax = 1200, from = 0.25, len = 0.5) {
  const a = Math.floor(x.length * from), n = Math.min(x.length - a - Math.ceil(sr / fmin) - 2, Math.round(len * sr)), lo = Math.floor(sr / fmax), hi = Math.ceil(sr / fmin);
  let best = 0, bl = lo; const r = [];
  for (let l = lo; l <= hi; l++) { let s = 0, e1 = 0, e2 = 0; for (let i = 0; i < n; i++) { const p = x[a + i], q = x[a + i + l]; s += p * q; e1 += p * p; e2 += q * q; } const v = s / Math.sqrt(e1 * e2 + 1e-12); r[l] = v; }
  // first strong peak (avoids octave errors)
  const mx = Math.max(...r.slice(lo)); for (let l = lo + 1; l < hi; l++) if (r[l] > 0.9 * mx && r[l] >= r[l - 1] && r[l] >= r[l + 1]) { bl = l; best = r[l]; break; }
  const y0 = r[bl - 1] ?? best, y2 = r[bl + 1] ?? best, d = (y0 - y2) / (2 * (y0 - 2 * best + y2) || 1);
  return sr / (bl + (isFinite(d) ? d : 0));
}

/* ---------- dynamics ---------- */
function compress(ch, sr, { thr = -24, ratio = 3, att = 0.005, rel = 0.12, knee = 6 } = {}) {
  const n = ch[0].length, aa = Math.exp(-1 / (att * sr)), ar = Math.exp(-1 / (rel * sr)); let e = 0;
  const out = clone(ch);
  for (let i = 0; i < n; i++) {
    let x2 = 0; for (const c of ch) x2 = Math.max(x2, c[i] * c[i]);
    e = x2 > e ? aa * e + (1 - aa) * x2 : ar * e + (1 - ar) * x2;
    const lv = 10 * Math.log10(e + 1e-12), o = lv - thr;
    const gr = o <= -knee / 2 ? 0 : o >= knee / 2 ? o * (1 - 1 / ratio) : (1 - 1 / ratio) * (o + knee / 2) ** 2 / (2 * knee);
    const g = db2(-gr); for (const c of out) c[i] *= g;
  }
  return out;
}
/** Look-ahead peak limiter (sample peak never above ceiling). */
export function limit(ch, sr, ceilDb = -1) {
  const C = db2(ceilDb), n = ch[0].length, L = Math.max(1, Math.round(0.003 * sr)), rel = 1 / (0.08 * sr);
  const need = new Float32Array(n); for (let i = 0; i < n; i++) { let p = 0; for (const c of ch) p = Math.max(p, Math.abs(c[i])); need[i] = p > C ? C / p : 1; }
  // moving minimum over the look-ahead window [i, i+L] (monotonic deque)
  const g = new Float32Array(n), dq = new Int32Array(n); let h = 0, t = 0;
  for (let i = n - 1; i >= 0; i--) { while (t > h && need[dq[t - 1]] >= need[i]) t--; dq[t++] = i; while (dq[h] > i + L) h++; g[i] = need[dq[h]]; }
  // smooth: instant attack (already looked ahead), slow release
  let cur = 1; const out = clone(ch);
  for (let i = 0; i < n; i++) { cur = Math.min(g[i], cur + rel); for (const c of out) c[i] *= cur; }
  return out;
}
export function normalize(ch, sr, target = TARGET_LUFS) {
  const L = lufs(ch, sr); if (!isFinite(L)) return clone(ch);
  const gain = (x, k) => x.map(c => { const o = new Float32Array(c.length); for (let i = 0; i < c.length; i++) o[i] = c[i] * k; return o; });
  let out = limit(gain(ch, db2(Math.max(-30, Math.min(30, target - L)))), sr, -1);
  // the limiter can pull very peaky material below the target: one more (small) pass
  for (let pass = 0; pass < 2; pass++) { const L2 = lufs(out, sr), d = target - L2; if (!isFinite(L2) || Math.abs(d) < 0.25) break; out = limit(gain(out, db2(Math.min(6, d))), sr, -1); }
  return out;
}

/* ---------- spectral noise gate with a learned noise profile ---------- */
export function denoise(ch, sr, amount = 0.8) {
  const N = sr > 32000 ? 2048 : 1024, H = N / 4, w = hann(N), bins = N / 2 + 1, n = ch[0].length;
  if (n < N * 2) return clone(ch);
  const pad = N, len = n + 2 * pad, frames = Math.floor((len - N) / H) + 1;
  const padded = c => { const p = new Float32Array(len); p.set(c, pad); return p; };
  // 1) noise profile: average magnitude of the quietest 12% of frames (mono)
  const m = padded(mono(ch)), re = new Float32Array(N), im = new Float32Array(N), en = new Float32Array(frames);
  const mags = []; for (let f = 0; f < frames; f++) { const s = f * H; let e = 0; for (let i = 0; i < N; i++) { const v = m[s + i]; re[i] = v * w[i]; im[i] = 0; e += v * v; } en[f] = e;
    if (s < pad || s + N > pad + n) { mags.push(null); continue; } fft(re, im); const mg = new Float32Array(bins); for (let k = 0; k < bins; k++) mg[k] = Math.hypot(re[k], im[k]); mags.push(mg); }
  const idx = [...Array(frames).keys()].filter(f => mags[f]).sort((a, b) => en[a] - en[b]); if (!idx.length) return clone(ch);
  const q = idx.slice(0, Math.max(3, Math.floor(idx.length * 0.12))), prof = new Float32Array(bins);
  for (const f of q) for (let k = 0; k < bins; k++) prof[k] += mags[f][k] / q.length;
  // dense signal (no pauses: the "noise" is really content) -> be gentle
  const med = en[idx[Math.floor(idx.length * 0.8)]], qe = q.reduce((a, f) => a + en[f], 0) / q.length, gap = 10 * Math.log10((med + 1e-12) / (qe + 1e-12));
  const a = amount * Math.max(0.15, Math.min(1, (gap - 4) / 10)), over = 1.3 + 1.7 * a, floor = db2(-(4 + 22 * a));
  // 2) gate every channel
  const out = [];
  for (const c of ch) {
    const x = padded(c), y = new Float32Array(len), ws = new Float32Array(len); let prev = new Float32Array(bins).fill(1); const G = new Float32Array(bins), Gs = new Float32Array(bins);
    for (let f = 0; f < frames; f++) {
      const s = f * H; for (let i = 0; i < N; i++) { re[i] = x[s + i] * w[i]; im[i] = 0; } fft(re, im);
      for (let k = 0; k < bins; k++) { const mg = Math.hypot(re[k], im[k]) + 1e-12; let g = 1 - over * prof[k] / mg; g = g < floor ? floor : g; G[k] = g; }
      for (let k = 0; k < bins; k++) { const sm = (G[Math.max(0, k - 1)] + 2 * G[k] + G[Math.min(bins - 1, k + 1)]) / 4; Gs[k] = sm >= prev[k] ? sm : prev[k] * 0.55 + sm * 0.45; }
      prev = Gs.slice();
      for (let k = 0; k < bins; k++) { re[k] *= Gs[k]; im[k] *= Gs[k]; if (k > 0 && k < N / 2) { re[N - k] = re[k]; im[N - k] = -im[k]; } }
      fft(re, im, true);
      for (let i = 0; i < N; i++) { y[s + i] += re[i] * w[i]; ws[s + i] += w[i] * w[i]; }
    }
    const o = new Float32Array(n); for (let i = 0; i < n; i++) { const d = ws[i + pad]; o[i] = d > 1e-6 ? y[i + pad] / d : 0; }
    out.push(o);
  }
  return out;
}
/** Split-band de-esser: tames harsh "s" sounds (5–10 kHz) only while they are loud. */
function deess(ch, sr, amount) {
  const hpC = steep('hp', 5500, sr), aa = Math.exp(-1 / (0.002 * sr)), ar = Math.exp(-1 / (0.06 * sr));
  return ch.map(c => {
    const hs = chain(c, hpC), o = new Float32Array(c.length); let eh = 0, ef = 0;
    for (let i = 0; i < c.length; i++) {
      const h2 = hs[i] * hs[i], f2 = c[i] * c[i];
      eh = h2 > eh ? aa * eh + (1 - aa) * h2 : ar * eh + (1 - ar) * h2; ef = f2 > ef ? aa * ef + (1 - aa) * f2 : ar * ef + (1 - ar) * f2;
      const ratio = eh / (ef + 1e-12), over = ratio > 0.25 ? Math.min(1, (ratio - 0.25) / 0.5) : 0;   // sibilant when the top band dominates
      const cut = over * amount * 0.6; o[i] = c[i] - hs[i] * cut;
    }
    return o;
  });
}
/** Voice enhance chain. strength 0..1. */
export function enhance(ch, sr, strength = 0.8) {
  const s = Math.max(0, Math.min(1, strength));
  let y = denoise(ch, sr, 0.35 + 0.65 * s);
  y = y.map(c => chain(c, [...steep('hp', 70 + 20 * s, sr), biquad('peak', 250, 1, -2 * s, sr), biquad('peak', 3500, 0.9, 3.5 * s, sr), biquad('highshelf', 9000, 0.7, 1.5 * s, sr)]));
  y = deess(y, sr, s);
  y = compress(y, sr, { thr: -22 - 6 * s, ratio: 2 + 2 * s });
  // a mono voice is heard on both speakers (+3 LU when measured in stereo): aim so the exported mix lands on -14 LUFS
  return normalize(y, sr, TARGET_LUFS - (y.length === 1 ? 3.01 : 0));
}

/* ---------- time-stretch (WSOLA) + resample + pitch shift ---------- */
/** Change tempo by `rate` (2 = twice as fast) keeping the pitch. */
export function stretch(ch, rate, sr) {
  const n = ch[0].length; if (Math.abs(rate - 1) < 1e-4 || n < 16) return clone(ch);
  return stretchMap(ch, Math.max(1, Math.round(n / rate)), op => op * rate, sr);
}
/** WSOLA with a variable read position: output sample op plays source sample posAt(op) (speed curves, pitch kept). */
export function stretchMap(ch, outLen, posAt, sr) {
  const n = ch[0].length; if (n < 16) return ch.map(() => new Float32Array(outLen));
  const N = Math.round(sr * 0.03 / 2) * 2, Hs = N / 2, S = Math.round(sr * 0.012), D = 4, w = hann(N);
  const m = mono(ch), dn = Math.floor(n / D), dec = new Float32Array(dn); for (let i = 0; i < dn; i++) { let a = 0; for (let j = 0; j < D; j++) a += m[i * D + j]; dec[i] = a / D; }
  const out = ch.map(() => new Float32Array(outLen + N)), Nd = N / D, Sd = S / D;
  let prev = 0;
  for (let k = 0; ; k++) {
    const op = k * Hs; if (op >= outLen) break;
    const ideal = Math.round(posAt(op)); let pos = Math.min(Math.max(0, ideal), Math.max(0, n - N));
    if (k > 0) {
      const tgt = prev + Hs;
      if (tgt + N <= n) {
        // coarse search on the decimated signal, then refine at full rate
        const td = Math.floor(tgt / D), cd = Math.floor(pos / D); let best = -Infinity, bd = cd;
        for (let d = Math.max(0, cd - Sd); d <= Math.min(dn - Nd, cd + Sd); d++) { let xy = 0, yy = 0; for (let i = 0; i < Nd; i += 1) { const a = dec[td + i], b = dec[d + i]; xy += a * b; yy += b * b; } const v = xy / Math.sqrt(yy + 1e-9); if (v > best) { best = v; bd = d; } }
        let fb = -Infinity, fp = bd * D;
        for (let p = Math.max(0, bd * D - D); p <= Math.min(n - N, bd * D + D); p++) { let xy = 0, yy = 0; for (let i = 0; i < N; i += 2) { const a = m[tgt + i], b = m[p + i]; xy += a * b; yy += b * b; } const v = xy / Math.sqrt(yy + 1e-9); if (v > fb) { fb = v; fp = p; } }
        pos = fp;
      }
    }
    for (let c = 0; c < ch.length; c++) { const x = ch[c], o = out[c]; for (let i = 0; i < N && pos + i < n; i++) o[op + i] += x[pos + i] * w[i]; }
    prev = pos;
  }
  // Hann at 50% overlap sums to 1, except the first half-frame: keep it as is (fades in over 15 ms)
  return out.map(o => o.subarray(0, outLen).slice());
}
/** Read the signal `factor` times faster (shorter, higher). Anti-aliased when speeding up. */
export function resample(ch, factor, sr) {
  const n = ch[0].length, m = Math.max(1, Math.floor((n - 1) / factor) + 1);
  return ch.map(c0 => {
    const c = factor > 1.01 ? chain(c0, steep('lp', 0.45 * sr / factor, sr, BUTTER8)) : c0, o = new Float32Array(m);
    for (let i = 0; i < m; i++) { const t = i * factor, j = Math.floor(t), f = t - j, y0 = c[j - 1] ?? c[j], y1 = c[j], y2 = c[j + 1] ?? y1, y3 = c[j + 2] ?? y2;
      o[i] = y1 + 0.5 * f * (y2 - y0 + f * (2 * y0 - 5 * y1 + 4 * y2 - y3 + f * (3 * (y1 - y2) + y3 - y0))); }
    return o;
  });
}
/** Variable-speed read without pitch keeping (speed curve, "chipmunk" style): output i reads source posAt(i). */
export function resampleMap(ch, outLen, posAt, sr, maxRate = 1) {
  return ch.map(c0 => {
    const c = maxRate > 1.01 ? chain(c0, steep('lp', Math.max(500, 0.45 * sr / maxRate), sr, BUTTER8)) : c0, o = new Float32Array(outLen), n = c.length;
    for (let i = 0; i < outLen; i++) { const t = posAt(i), j = Math.floor(t); if (j < 0 || j >= n) continue; const f = t - j, y0 = c[j - 1] ?? c[j], y1 = c[j], y2 = c[j + 1] ?? y1, y3 = c[j + 2] ?? y2;
      o[i] = y1 + 0.5 * f * (y2 - y0 + f * (2 * y0 - 5 * y1 + 4 * y2 - y3 + f * (3 * (y1 - y2) + y3 - y0))); }
    return o;
  });
}
/** Raise/lower the pitch by `ratio` (2 = one octave up), same length. */
export function pitchShift(ch, ratio, sr) {
  if (Math.abs(ratio - 1) < 1e-4) return clone(ch);
  const n = ch[0].length, st = stretch(ch, 1 / ratio, sr), r = resample(st, ratio, sr);
  return r.map(c => { if (c.length === n) return c; const o = new Float32Array(n); o.set(c.subarray(0, n)); return o; });
}

/* ---------- effect building blocks ---------- */
const mapS = (ch, f) => ch.map(c => { const o = new Float32Array(c.length); for (let i = 0; i < c.length; i++) o[i] = f(c[i], i); return o; });
const drive = (ch, k) => { const t = Math.tanh(k); return mapS(ch, v => Math.tanh(v * k) / t); };
const mix = (a, b, wa, wb) => a.map((c, j) => { const o = new Float32Array(c.length), d = b[j % b.length]; for (let i = 0; i < c.length; i++) o[i] = c[i] * wa + (d[i] || 0) * wb; return o; });
const toStereo = ch => ch.length >= 2 ? ch : [ch[0], ch[0].slice()];
function echo(ch, sr, { time = 0.28, fb = 0.42, wet = 0.5, tone = 4000 } = {}) {
  const d = Math.round(time * sr), lpC = biquad('lp', tone, 0.7, 0, sr);
  return ch.map(c => { const o = new Float32Array(c.length), buf = new Float32Array(d); let p = 0, z1 = 0, z2 = 0;
    for (let i = 0; i < c.length; i++) { const dl = buf[p]; let v = c[i] + dl * fb; const y = lpC.b0 * v + z1; z1 = lpC.b1 * v - lpC.a1 * y + z2; z2 = lpC.b2 * v - lpC.a2 * y; buf[p] = y; p = (p + 1) % d; o[i] = c[i] + dl * wet; }
    return o; });
}
/** Freeverb-style reverb (8 damped combs + 4 all-passes per side). */
function reverb(ch, sr, { room = 0.84, damp = 0.3, wet = 0.4, pre = 0.02 } = {}) {
  const k = sr / 44100, CO = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617], AP = [556, 441, 341, 225], st = toStereo(ch), n = st[0].length, inp = mono(ch), P = Math.round(pre * sr);
  const side = spread => { const out = new Float32Array(n), combs = CO.map(l => ({ b: new Float32Array(Math.round((l + spread) * k)), p: 0, f: 0 })), aps = AP.map(l => ({ b: new Float32Array(Math.round((l + spread) * k)), p: 0 }));
    for (let i = 0; i < n; i++) { const x = (i >= P ? inp[i - P] : 0) * 0.015; let s = 0;
      for (const c of combs) { const y = c.b[c.p]; c.f = y * (1 - damp) + c.f * damp; c.b[c.p] = x + c.f * room; c.p = (c.p + 1) % c.b.length; s += y; }
      for (const a of aps) { const bo = a.b[a.p]; a.b[a.p] = s + bo * 0.5; a.p = (a.p + 1) % a.b.length; s = bo - s; }
      out[i] = s; }
    return out; };
  const L = side(0), R = side(23);
  return [mix([st[0]], [L], 1, wet * 3)[0], mix([st[1]], [R], 1, wet * 3)[0]];
}
function vibrato(ch, sr, { rate = 5.5, depth = 0.002 } = {}) {
  const D = depth * sr; return ch.map(c => { const o = new Float32Array(c.length);
    for (let i = 0; i < c.length; i++) { const t = i - D * (1 + Math.sin(2 * Math.PI * rate * i / sr)), j = Math.floor(t), f = t - j; o[i] = j >= 0 && j + 1 < c.length ? c[j] * (1 - f) + c[j + 1] * f : 0; }
    return o; });
}
const ringMod = (ch, sr, hz, amt) => mapS(ch, (v, i) => v * (1 - amt + amt * Math.sin(2 * Math.PI * hz * i / sr)));
function comb(ch, sr, ms, fb) { const d = Math.max(1, Math.round(ms * sr / 1000)); return ch.map(c => { const o = new Float32Array(c.length); for (let i = 0; i < c.length; i++) o[i] = c[i] + (i >= d ? o[i - d] * fb : 0); return o; }); }
const eq = (ch, cs) => ch.map(c => chain(c, cs));
const delay = (ch, sr, s) => { const d = Math.round(s * sr); return ch.map(c => { const o = new Float32Array(c.length); o.set(c.subarray(0, Math.max(0, c.length - d)), d); return o; }); };

/* ---------- voice effects registry (add an entry = new effect; same code in preview and export) ---------- */
export const VOICE_FX = [
  { id: 'chipmunk', name: 'Chipmunk', emoji: '🐿️', run: (x, sr) => eq(pitchShift(x, 1.7, sr), [biquad('peak', 3000, 1, 2, sr)]) },
  { id: 'deep', name: 'Deep', emoji: '🐻', run: (x, sr) => eq(pitchShift(x, 0.72, sr), [biquad('lowshelf', 180, 0.7, 3, sr)]) },
  { id: 'robot', name: 'Robot', emoji: '🤖', run: (x, sr) => comb(ringMod(eq(x, steep('hp', 120, sr)), sr, 55, 0.85), sr, 7, 0.45).map(c => c.map(v => v * 0.7)) },
  { id: 'echo', name: 'Echo', emoji: '🏔️', run: (x, sr) => echo(x, sr, { time: 0.28, fb: 0.42, wet: 0.55 }) },
  { id: 'megaphone', name: 'Megaphone', emoji: '📢', run: (x, sr) => drive(eq(x, [...steep('hp', 600, sr), ...steep('lp', 3200, sr), biquad('peak', 1500, 1.2, 6, sr)]), 3.2) },
  { id: 'telephone', name: 'Telephone', emoji: '☎️', run: (x, sr) => { const m = [mono(x)]; return drive(eq(m, [...steep('hp', 350, sr, BUTTER8), ...steep('lp', 3300, sr, BUTTER8)]), 1.6); } },
  { id: 'cave', name: 'Cave', emoji: '🕳️', run: (x, sr) => reverb(echo(x, sr, { time: 0.19, fb: 0.25, wet: 0.25, tone: 2500 }), sr, { room: 0.93, damp: 0.25, wet: 0.55, pre: 0.04 }) },
  { id: 'cartoon', name: 'Cartoon', emoji: '🎈', run: (x, sr) => eq(vibrato(pitchShift(x, 1.38, sr), sr, { rate: 6, depth: 0.0015 }), [biquad('highshelf', 4000, 0.7, 3, sr), biquad('peak', 1200, 1, 2, sr)]) },
  { id: 'monster', name: 'Monster', emoji: '👾', run: (x, sr) => reverb(eq(drive(pitchShift(x, 0.62, sr), 1.8), [biquad('lowshelf', 200, 0.7, 4, sr), biquad('peak', 3000, 1, -3, sr)]), sr, { room: 0.7, damp: 0.5, wet: 0.18 }) },
  { id: 'choir', name: 'Kids choir', emoji: '👧', run: (x, sr) => {
      const v = [[1.26, 0, 0.5], [1.26 * Math.pow(2, 12 / 1200), 0.019, 0.38], [1.26 * Math.pow(2, -11 / 1200), 0.031, 0.38], [1.26 * Math.pow(2, 6 / 1200), 0.045, 0.28]];
      const n = x[0].length, L = new Float32Array(n), R = new Float32Array(n);
      v.forEach(([r, d, g], i) => { const s = delay(pitchShift(x, r, sr), sr, d)[0], pl = i % 2 ? 0.35 : 0.65; for (let j = 0; j < n; j++) { L[j] += s[j] * g * pl * 1.4; R[j] += s[j] * g * (1 - pl) * 1.4; } });
      return reverb([L, R], sr, { room: 0.82, damp: 0.35, wet: 0.3, pre: 0.02 }); } },
];
export const voiceFxById = id => VOICE_FX.find(f => f.id === id) || null;

/** The whole per-clip chain: enhance -> effect -> tempo (speed with pitch kept). */
export function processAudio(ch, sr, { enhance: es = 0, fx = null, rate = 1, map = null, reverse = false } = {}) {
  let y = ch;
  if (reverse) y = y.map(c => c.slice().reverse());
  if (es > 0) y = enhance(y, sr, es);
  const F = fx && voiceFxById(fx); if (F) { y = F.run(y, sr); if (peak(y) > 0.98) y = limit(y, sr, -1); }
  if (map) {   // speed curve: the result is laid out on the clip's own timeline (sample 0 = clip start)
    const cv = { pts: map.pts, u0: map.u0, u1: map.u1 }, outLen = Math.max(1, Math.round(map.D * sr)), at = i => (map.off + curveSrc(cv, map.len, map.D, i / sr)) * sr;
    const maxV = Math.max(...map.pts.map(q => q.v)) * (map.speed || 1);
    y = map.keep ? stretchMap(y, outLen, at, sr) : resampleMap(y, outLen, at, sr, maxV);
  } else if (Math.abs(rate - 1) > 1e-4) y = stretch(y, rate, sr);
  return y === ch ? clone(ch) : y;
}
/** Trim leading/trailing silence below thrDb (keeps `keep` seconds around the sound). */
export function trimSilence(ch, sr, thrDb = -50, keep = 0.01) {
  const T = db2(thrDb), n = ch[0].length; let a = 0, b = n - 1;
  const loud = i => ch.some(c => Math.abs(c[i]) > T);
  while (a < n && !loud(a)) a++; while (b > a && !loud(b)) b--;
  a = Math.max(0, a - Math.round(keep * sr)); b = Math.min(n - 1, b + Math.round(keep * sr));
  return ch.map(c => c.slice(a, b + 1));
}
export { mono, lin2db, db2 };

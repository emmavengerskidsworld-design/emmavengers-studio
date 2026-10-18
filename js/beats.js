/* Beat detection for the user's own music (no AI): spectral-flux onsets -> tempo by autocorrelation -> beat phase by
   circular averaging -> downbeat from the bass onsets -> drops from bar-energy jumps. Plus a tap-tempo helper.
   Output is the same beat grid the library tracks carry: { bpm, m, o, dr, conf }. */
const SR = 11025, HOP = 256, N = 1024;
function fft(re, im) {          // in-place radix-2
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let b = n >> 1; for (; j & b; b >>= 1) j ^= b; j ^= b; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) { const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0; for (let k = 0; k < len / 2; k++) { const p = i + k, q = p + len / 2, tr = re[q] * cr - im[q] * ci, ti = re[q] * ci + im[q] * cr;
      re[q] = re[p] - tr; im[q] = im[p] - ti; re[p] += tr; im[p] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } }
}
/** Mono, ~11 kHz copy of an AudioBuffer (box-filter decimation). */
export function monoDown(buf) {
  const k = Math.max(1, Math.round(buf.sampleRate / SR)), sr = buf.sampleRate / k, n = Math.floor(buf.length / k), out = new Float32Array(n), ch = [...Array(buf.numberOfChannels)].map((_, i) => buf.getChannelData(i));
  for (let i = 0; i < n; i++) { let s = 0; for (const c of ch) for (let j = 0; j < k; j++) s += c[i * k + j]; out[i] = s / (k * ch.length); }
  return { x: out, sr };
}
/** Onset strength per frame: full-band log spectral flux, a bass-band flux and frame energy. */
export function onsets(x, sr) {
  const F = Math.max(0, Math.floor((x.length - N) / HOP)), all = new Float32Array(F), low = new Float32Array(F), en = new Float32Array(F), NB = 24, band = new Float32Array(F * NB);
  const edges = [...Array(NB + 1)].map((_, i) => Math.max(1, Math.round(60 * Math.pow(5000 / 60, i / NB) / (sr / N))));
  const win = new Float32Array(N).map((_, i) => .5 - .5 * Math.cos(2 * Math.PI * i / N)), re = new Float32Array(N), im = new Float32Array(N), prev = new Float32Array(N / 2), lowBin = Math.max(2, Math.round(200 / (sr / N)));
  for (let f = 0; f < F; f++) {
    let e = 0; for (let i = 0; i < N; i++) { const v = x[f * HOP + i]; re[i] = v * win[i]; im[i] = 0; e += v * v; }
    fft(re, im); let a = 0, l = 0;
    for (let b = 1; b < N / 2; b++) { const m = Math.log1p(10 * Math.hypot(re[b], im[b])), d = m - prev[b]; if (d > 0) { a += d; if (b < lowBin) l += d; } prev[b] = m; }
    all[f] = a; low[f] = l; en[f] = e / N;
    for (let k = 0; k < NB; k++) { let s = 0; for (let b = edges[k]; b < Math.max(edges[k] + 1, edges[k + 1]); b++) s += prev[b]; band[f * NB + k] = s / Math.max(1, edges[k + 1] - edges[k]); }
  }
  return { all, low, en, band, NB, fps: sr / HOP, t0: N / 2 / sr };
}
const median = a => { const s = [...a].sort((p, q) => p - q); return s.length ? s[s.length >> 1] : 0; };
/** Detect the beat grid of an AudioBuffer. */
export function detectBeats(buf, { meter = 4 } = {}) {
  const { x, sr } = monoDown(buf), O = onsets(x, sr), fps = O.fps, F = O.all.length;
  if (F < fps * 4) return null;
  // local-mean-removed onset envelope
  const env = new Float32Array(F), W = Math.round(fps * .4);
  let acc = 0; const pre = new Float64Array(F + 1); for (let i = 0; i < F; i++) pre[i + 1] = pre[i] + O.all[i];
  for (let i = 0; i < F; i++) { const a = Math.max(0, i - W), b = Math.min(F, i + W + 1); env[i] = Math.max(0, O.all[i] - (pre[b] - pre[a]) / (b - a)); acc += env[i]; }
  if (!(acc > 0)) return null;
  // tempo: autocorrelation, weighted towards ~115 BPM (log-normal, 1 octave wide)
  let best = 0, bestLag = 0; const lo = Math.floor(fps * 60 / 190), hi = Math.ceil(fps * 60 / 60), ac = new Float32Array(hi + 2);
  for (let L = lo; L <= hi + 1; L++) { let s = 0; for (let i = L; i < F; i++) s += env[i] * env[i - L]; ac[L] = s; }
  for (let L = lo + 1; L <= hi; L++) { const bpm = 60 * fps / L, w = Math.exp(-.5 * (Math.log2(bpm / 115) / .9) ** 2), s = ac[L] * w; if (s > best && ac[L] >= ac[L - 1] && ac[L] >= ac[L + 1]) { best = s; bestLag = L; } }
  if (!bestLag) return null;
  const y0 = ac[bestLag - 1], y1 = ac[bestLag], y2 = ac[bestLag + 1], dl = (y0 - y2) / (2 * (y0 - 2 * y1 + y2) || 1);
  let bpm = 60 * fps / (bestLag + Math.max(-.5, Math.min(.5, dl)));
  // refine tempo and phase on the whole song: strongest circular phase coherence
  const t = i => O.t0 + i * HOP / sr, w2 = new Float32Array(F); for (let i = 0; i < F; i++) w2[i] = env[i] * env[i];
  const coh = b => { const spb = 60 / b; let zr = 0, zi = 0, s = 0; for (let i = 0; i < F; i++) { if (!w2[i]) continue; const ph = 2 * Math.PI * t(i) / spb; zr += w2[i] * Math.cos(ph); zi += w2[i] * Math.sin(ph); s += w2[i]; } return { r: Math.hypot(zr, zi) / s, ph: Math.atan2(zi, zr) }; };
  let bb = bpm, bc = coh(bpm);
  for (let d = -0.03; d <= 0.03; d += 0.002) { const b = bpm * (1 + d), c = coh(b); if (c.r > bc.r) { bb = b; bc = c; } }
  for (let d = -0.002; d <= 0.002; d += 0.0002) { const b = bb * (1 + d), c = coh(b); if (c.r > bc.r) { bb = b; bc = c; } }
  bpm = Math.round(bb * 100) / 100; const spb = 60 / bpm; let o = ((bc.ph / (2 * Math.PI)) * spb % spb + spb) % spb;
  const at = (arr, tt) => { const f = Math.round((tt - O.t0) * fps); let m = 0; for (let j = Math.max(0, f - 2); j <= Math.min(F - 1, f + 2); j++) m = Math.max(m, arr[j]); return m; };
  const dur = x.length / sr, nb0 = Math.floor((dur - o) / spb);
  { let on = 0, off = 0; for (let k = 0; k < nb0; k++) { on += at(O.low, o + k * spb) + .5 * at(O.all, o + k * spb); off += at(O.low, o + (k + .5) * spb) + .5 * at(O.all, o + (k + .5) * spb); } if (off > on * 1.15) o = (o + spb / 2) % spb; }
  // harmonic change at each beat: new energy that starts on the beat (chords and bass notes usually change on the bar line)
  const bandMean = (a, b) => { const fa = Math.max(0, Math.round((a - O.t0) * fps)), fb = Math.min(F, Math.round((b - O.t0) * fps)), v = new Float32Array(O.NB); for (let f = fa; f < fb; f++) for (let k = 0; k < O.NB; k++) v[k] += O.band[f * O.NB + k]; for (let k = 0; k < O.NB; k++) v[k] /= Math.max(1, fb - fa); return v; };
  // downbeat: the beat (mod meter) with the most bass onsets
  const nb = Math.floor((x.length / sr - o) / spb), score = new Float32Array(meter);
  const nov = new Float32Array(nb), bas = new Float32Array(nb);
  for (let k = 1; k < nb - 1; k++) { const t = o + k * spb, A = bandMean(t - spb, t), B = bandMean(t, t + spb); let d = 0; for (let q = 0; q < O.NB; q++) d += Math.max(0, B[q] - A[q]); nov[k] = d; /* one-sided: new sound starting here */ bas[k] = at(O.low, t); }
  const nm = median(nov) || 1, bm = median(bas) || 1;
  for (let k = 1; k < nb - 1; k++) score[k % meter] += nov[k] / nm + .5 * bas[k] / bm;
  let dj = 0; for (let j = 1; j < meter; j++) if (score[j] > score[dj]) dj = j;
  o += dj * spb; while (o - meter * spb >= -1e-6) o -= meter * spb; if (o < 0) o += meter * spb;
  // drops: downbeats where the bar energy jumps well above the bars before it
  const bar = meter * spb, nbar = Math.floor((x.length / sr - o) / bar), E = []; for (let k = 0; k < nbar; k++) { const a = Math.round((o + k * bar - O.t0) * fps), b = Math.round((o + (k + 1) * bar - O.t0) * fps); let s = 0; for (let i = Math.max(0, a); i < Math.min(F, b); i++) s += O.en[i]; E.push(s / Math.max(1, b - a)); }
  const med = median(E), dr = [];
  for (let k = 2; k < nbar; k++) { const before = (E[k - 1] + E[k - 2]) / 2; if (E[k] > med * 1.05 && E[k] > before * 1.6 && (!dr.length || o + k * bar - dr[dr.length - 1] > 4 * bar)) dr.push(Math.round((o + k * bar) * 1000) / 1000); }
  return { bpm, m: meter, o: Math.round(o * 10000) / 10000, dr: dr.slice(0, 6), conf: Math.round(bc.r * 100) / 100, auto: true };
}
/** Tap tempo: call tap(audioTime) on each tap; result() gives { bpm, o } after 4+ taps. */
export class TapTempo {
  constructor() { this.taps = []; }
  tap(t) { if (this.taps.length && t - this.taps[this.taps.length - 1] > 2.5) this.taps = []; this.taps.push(t); return this.result(); }
  reset() { this.taps = []; }
  result() {
    const T = this.taps; if (T.length < 4) return null;
    const d = []; for (let i = 1; i < T.length; i++) d.push(T[i] - T[i - 1]); let spb = median(d); if (!(spb > .25 && spb < 1.6)) return null;
    // least-squares line through (beat number, tap time): robust to uneven taps and to a missed tap
    const K = T.map(x => Math.round((x - T[0]) / spb)), n = T.length, mk = K.reduce((a, b) => a + b, 0) / n, mt = T.reduce((a, b) => a + b, 0) / n;
    let sxy = 0, sxx = 0; for (let i = 0; i < n; i++) { sxy += (K[i] - mk) * (T[i] - mt); sxx += (K[i] - mk) ** 2; } if (sxx > 0) spb = sxy / sxx;
    const o = (((mt - mk * spb) % spb) + spb) % spb;
    return { bpm: Math.round(60 / spb * 10) / 10, m: 4, o: Math.round(o * 1000) / 1000, dr: [], tapped: true };
  }
}

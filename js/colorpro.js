/* Colour pro (no AI): curves, HSL per hue band, colour wheels (lift / gamma / gain), white balance, 3D LUTs.
   This file is the maths; the pixels are done by one GL pass ("color" in js/effects.js) shared by preview and export.
   clip.color = { curves: { m, r, g, b: [[x, y], ...] (0..1) }, hsl: [[hue°, sat, lum] x 8], wheels: { lift, gamma, gain: [r, g, b, master] },
                  wb: { temp, tint }, lut: { id, amount }, ex, con, sat, vig, grain, sharp } */
export const HSL_BANDS = [['red', 'Red', '#ff3b3b', 0], ['orange', 'Orange', '#ff9a2e', 30], ['yellow', 'Yellow', '#ffe14a', 60], ['green', 'Green', '#3ccf5a', 120],
  ['aqua', 'Aqua', '#33d6d6', 180], ['blue', 'Blue', '#3b7bff', 225], ['purple', 'Purple', '#9b5cff', 270], ['magenta', 'Magenta', '#ff4fd1', 315]];
export const CURVE_CH = [['m', 'RGB'], ['r', 'Red'], ['g', 'Green'], ['b', 'Blue']];
export const CURVE_PRESETS = [
  { id: 'none', name: 'Straight', m: [[0, 0], [1, 1]] }, { id: 'scurve', name: 'Contrast S', m: [[0, 0], [.25, .19], [.75, .82], [1, 1]] },
  { id: 'soft', name: 'Soft', m: [[0, .06], [.5, .52], [1, .95]] }, { id: 'bright', name: 'Brighten', m: [[0, 0], [.45, .58], [1, 1]] },
  { id: 'dark', name: 'Moody', m: [[0, 0], [.55, .42], [1, .96]] }, { id: 'fade', name: 'Matte fade', m: [[0, .12], [.3, .3], [1, .94]] },
  { id: 'cross', name: 'Cross', m: [[0, 0], [1, 1]], r: [[0, 0], [.3, .24], [.7, .8], [1, 1]], b: [[0, .1], [1, .88]] },
];
const ID = [[0, 0], [1, 1]];
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const isIdentity = pts => !pts || pts.length < 2 || pts.every(([x, y]) => Math.abs(x - y) < 1e-4);

/** Monotone cubic (Fritsch–Carlson) through the points -> f(x), clamped 0..1. Never overshoots, so curves stay smooth. */
export function spline(pts) {
  const P = [...(pts && pts.length >= 2 ? pts : ID)].map(([x, y]) => [clamp(x), clamp(y)]).sort((a, b) => a[0] - b[0]).filter((p, i, a) => !i || p[0] - a[i - 1][0] > 1e-4);
  if (P.length < 2) return () => P[0] ? P[0][1] : 0;
  const n = P.length, d = [], m = new Array(n);
  for (let i = 0; i < n - 1; i++) d.push((P[i + 1][1] - P[i][1]) / (P[i + 1][0] - P[i][0]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) { if (Math.abs(d[i]) < 1e-9) { m[i] = m[i + 1] = 0; continue; } const a = m[i] / d[i], b = m[i + 1] / d[i], s = a * a + b * b; if (s > 9) { const t = 3 / Math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i]; } }
  return x => {
    if (x <= P[0][0]) return P[0][1]; if (x >= P[n - 1][0]) return P[n - 1][1];
    let i = 0; while (i < n - 2 && x > P[i + 1][0]) i++;
    const h = P[i + 1][0] - P[i][0], t = (x - P[i][0]) / h, t2 = t * t, t3 = t2 * t;
    return clamp((2 * t3 - 3 * t2 + 1) * P[i][1] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * P[i + 1][1] + (t3 - t2) * h * m[i + 1]);
  };
}
/** 256 x 1 RGBA table: channel curve applied after the master curve. null = curves are flat. */
export function curveTable(cv) {
  if (!cv || ['m', 'r', 'g', 'b'].every(k => isIdentity(cv[k]))) return null;
  const M = spline(cv.m), R = spline(cv.r), G = spline(cv.g), B = spline(cv.b), out = new Uint8Array(256 * 4);
  for (let i = 0; i < 256; i++) { const v = M(i / 255); out[i * 4] = Math.round(R(v) * 255); out[i * 4 + 1] = Math.round(G(v) * 255); out[i * 4 + 2] = Math.round(B(v) * 255); out[i * 4 + 3] = 255; }
  return out;
}
/** White balance that turns the picked colour neutral grey (the shader's gains: r·e^(T/2+N/4), g·e^(-N/2), b·e^(-T/2+N/4)). */
export function wbFromSample([r, g, b]) {
  const L = v => Math.log(Math.max(4, v) / 255), lr = L(r), lg = L(g), lb = L(b), T = lb - lr, N = (lg - lr - T / 2) / .75;
  return { temp: Math.round(clamp(T, -1.5, 1.5) * 1000) / 1000, tint: Math.round(clamp(N, -1.5, 1.5) * 1000) / 1000 };
}
export const wbGains = ({ temp = 0, tint = 0 } = {}) => [Math.exp(temp / 2 + tint / 4), Math.exp(-tint / 2), Math.exp(-temp / 2 + tint / 4)];

/* ---------- 3D LUTs (.cube) ---------- */
/** Parse an Adobe / Resolve .cube file -> { n, data: Uint8Array(n³·4) (r fastest), title }. Resamples to at most 33³. */
export function parseCube(text) {
  let n = 0, title = '', lo = [0, 0, 0], hi = [1, 1, 1]; const v = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const l = raw.trim(); if (!l || l[0] === '#') continue;
    const w = l.split(/\s+/), k = w[0].toUpperCase();
    if (k === 'TITLE') title = l.slice(5).trim().replace(/^"|"$/g, '');
    else if (k === 'LUT_3D_SIZE') n = +w[1];
    else if (k === 'LUT_1D_SIZE') throw new Error('1D LUTs are not supported (use a 3D .cube)');
    else if (k === 'DOMAIN_MIN') lo = w.slice(1, 4).map(Number); else if (k === 'DOMAIN_MAX') hi = w.slice(1, 4).map(Number);
    else if (/^[-+.\d]/.test(w[0]) && w.length >= 3) v.push(+w[0], +w[1], +w[2]);
  }
  if (!(n >= 2 && n <= 256)) throw new Error('not a 3D .cube file (LUT_3D_SIZE missing)');
  if (v.length < n * n * n * 3) throw new Error(`the .cube file is cut short (${v.length / 3} of ${n ** 3} values)`);
  const at = (r, g, b, c) => v[((b * n + g) * n + r) * 3 + c], norm = (x, c) => clamp((x - lo[c]) / ((hi[c] - lo[c]) || 1));
  const m = Math.min(n, 33), out = new Uint8Array(m * m * m * 4);
  for (let b = 0; b < m; b++) for (let g = 0; g < m; g++) for (let r = 0; r < m; r++) {
    const q = [r, g, b].map(x => x * (n - 1) / (m - 1)), i0 = q.map(Math.floor), f = q.map((x, k) => x - i0[k]), i1 = i0.map(x => Math.min(n - 1, x + 1)), o = ((b * m + g) * m + r) * 4;
    for (let c = 0; c < 3; c++) { let s = 0;
      for (let k = 0; k < 8; k++) { const R = k & 1 ? i1[0] : i0[0], G = k & 2 ? i1[1] : i0[1], B = k & 4 ? i1[2] : i0[2], w = (k & 1 ? f[0] : 1 - f[0]) * (k & 2 ? f[1] : 1 - f[1]) * (k & 4 ? f[2] : 1 - f[2]); s += w * at(R, G, B, c); }
      out[o + c] = Math.round(norm(s, c) * 255); }
    out[o + 3] = 255;
  }
  return { n: m, data: out, title };
}
/** LUT -> .cube text (used to write our own LUT files). f(r, g, b) -> [r, g, b], all 0..1. */
export function cubeText(title, n, f) {
  const L = [`TITLE "${title}"`, `# Emmavengers Studio own-made LUT (CC0)`, `LUT_3D_SIZE ${n}`, 'DOMAIN_MIN 0 0 0', 'DOMAIN_MAX 1 1 1'];
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) L.push(f(r / (n - 1), g / (n - 1), b / (n - 1)).map(x => clamp(x).toFixed(5)).join(' '));
  return L.join('\n') + '\n';
}
/* 20 own looks, written as plain colour maths (tools/luts/build_luts.mjs bakes them into lib/luts/*.cube) */
const lum = (r, g, b) => .299 * r + .587 * g + .114 * b, mixv = (a, b, t) => a.map((x, i) => x + (b[i] - x) * t);
const sat = (c, s) => { const l = lum(...c); return c.map(x => l + (x - l) * s); }, con = (c, k, p = .5) => c.map(x => p + (x - p) * k);
const sc = x => x * x * (3 - 2 * x), toneS = (c, k) => c.map(x => x + (sc(clamp(x)) - x) * k);
const tint = (c, sh, hi, k = 1) => { const l = lum(...c); return c.map((x, i) => x + ((1 - l) * sh[i] + l * hi[i]) * k); };
export const OWN_LUTS = [
  ['sunny-kids', 'Sunny Kids', c => sat(toneS(tint(c, [.02, .01, -.03], [.05, .03, -.04]), .3), 1.25)],
  ['candy-pop', 'Candy Pop', c => sat(toneS(tint(c, [.04, -.02, .05], [.03, .0, .03]), .35), 1.4)],
  ['golden-hour', 'Golden Hour', c => sat(tint(toneS(c, .2), [.03, .0, -.06], [.09, .04, -.07]), 1.1)],
  ['teal-orange', 'Teal & Orange', c => { const l = lum(...c); return sat(toneS(mixv(c, [l + .12, l + .02, l - .1], .35 * l), .25).map((x, i) => x + [-.06, .02, .07][i] * (1 - l)), 1.15); }],
  ['bible-warm', 'Bible Warm', c => con(sat(tint(c, [.04, .02, -.02], [.07, .04, -.05]), .9), 1.05)],
  ['desert-sand', 'Desert Sand', c => sat(tint(toneS(c, .15), [.05, .03, -.02], [.06, .04, -.06]), .8)],
  ['ocean-blue', 'Ocean Blue', c => sat(tint(c, [-.04, .02, .08], [-.02, .02, .05]), 1.15)],
  ['forest-green', 'Forest Green', c => sat(tint(toneS(c, .2), [-.02, .04, -.01], [.01, .04, -.03]), 1.05)],
  ['night-sky', 'Night Sky', c => con(sat(tint(c.map(x => x * .85), [-.03, -.01, .08], [-.02, 0, .04]), .8), 1.08)],
  ['dreamy-pastel', 'Dreamy Pastel', c => sat(c.map(x => .12 + x * .82), .8).map((x, i) => x + [.02, .0, .03][i])],
  ['vintage-film', 'Vintage Film', c => sat(tint(c.map(x => .06 + x * .86), [.05, .03, .0], [.03, .02, -.05]), .75)],
  ['old-photo', 'Old Photo', c => { const l = lum(...c); return mixv(c, [l * 1.07 + .03, l * .97 + .02, l * .8], .85); }],
  ['bw-classic', 'B&W Classic', c => { const l = clamp(toneS([lum(...c)], .3)[0]); return [l, l, l]; }],
  ['bw-soft', 'B&W Soft', c => { const l = .05 + lum(...c) * .9; return [l, l, l * .98]; }],
  ['comic-pop', 'Comic Pop', c => sat(toneS(con(c, 1.15), .4), 1.6)],
  ['cinema', 'Cinema', c => { const l = lum(...c); return sat(toneS(c, .3).map((x, i) => x + [-.04, .01, .05][i] * (1 - l) + [.05, .02, -.03][i] * l), .9); }],
  ['bleach', 'Bleach Bypass', c => { const l = lum(...c); return con(mixv(c, [l, l, l], .5), 1.25); }],
  ['neon-night', 'Neon Night', c => sat(tint(con(c, 1.12), [.05, -.03, .1], [.02, -.02, .06]), 1.35)],
  ['autumn', 'Autumn', c => sat(tint(c, [.04, .01, -.04], [.06, .02, -.06]), 1.1).map((x, i) => i === 1 ? x * .96 : x)],
  ['cool-morning', 'Cool Morning', c => sat(tint(c.map(x => .03 + x * .96), [-.02, .0, .05], [-.01, .02, .04]), .95)],
].map(([id, name, f]) => ({ id, name, f: (r, g, b) => f([r, g, b]) }));
export const LUT_BASE = new URL('../lib/luts/', import.meta.url).href;
const lutCache = new Map();
/** Load a LUT (own: from lib/luts; imported: stored on the project in p.luts[id] as base64). */
export async function loadLut(id, p) {
  if (lutCache.has(id)) return lutCache.get(id);
  let L = null;
  if (p && p.luts && p.luts[id]) { const q = p.luts[id]; const bin = atob(q.d); const data = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i); L = { n: q.n, data, title: q.name }; }
  else if (OWN_LUTS.some(x => x.id === id)) { const r = await fetch(LUT_BASE + id + '.cube'); if (!r.ok) throw new Error('LUT missing ' + id); L = parseCube(await r.text()); }
  if (L) { L.key = 'lut:' + id; lutCache.set(id, L); }
  return L;
}
let lastP = null; const pending = new Set(), lutListeners = new Set();
export const onLut = f => lutListeners.add(f);
export const lutNow = id => { const L = lutCache.get(id); if (!L && id && !pending.has(id)) { pending.add(id); loadLut(id, lastP).then(x => { pending.delete(id); if (x) lutListeners.forEach(f => f()); }, e => { pending.delete(id); console.warn(e); }); } return L || null; };
/** Pack an imported LUT for the project file. */
export function packLut(L) { let s = ''; for (let i = 0; i < L.data.length; i += 0x8000) s += String.fromCharCode.apply(null, L.data.subarray(i, i + 0x8000)); return { n: L.n, d: btoa(s), name: L.title || 'Imported LUT' }; }

export const hasColor = c => { const q = c && c.color; if (!q) return false;
  return !!(curveTable(q.curves) || (q.hsl && q.hsl.some(b => b && b.some(v => Math.abs(v) > 1e-4))) || (q.wheels && ['lift', 'gamma', 'gain'].some(k => q.wheels[k] && q.wheels[k].some(v => Math.abs(v) > 1e-4)))
    || (q.wb && (Math.abs(q.wb.temp || 0) > 1e-4 || Math.abs(q.wb.tint || 0) > 1e-4)) || (q.lut && q.lut.id && (q.lut.amount ?? 1) > 0) || ['ex', 'vig', 'grain', 'sharp'].some(k => Math.abs(q[k] || 0) > 1e-4) || ['con', 'sat'].some(k => q[k] != null && Math.abs(q[k] - 1) > 1e-4)); };
const tblCache = new Map();
/** Shader parameters for a colour block (the GL pass in effects.js reads exactly this). */
export function colorParams(q, extra = {}) {
  const ck = JSON.stringify(q.curves || null); let cv = tblCache.get(ck); if (cv === undefined) { cv = curveTable(q.curves); tblCache.set(ck, cv); if (tblCache.size > 64) tblCache.delete(tblCache.keys().next().value); }
  const hs = new Float32Array(24); (q.hsl || []).forEach((b, i) => { if (b && i < 8) { hs[i * 3] = (b[0] || 0) / 180; hs[i * 3 + 1] = b[1] || 0; hs[i * 3 + 2] = b[2] || 0; } });
  const W = q.wheels || {}, wv = k => { const w = W[k] || [0, 0, 0, 0]; return [w[0] + (w[3] || 0), w[1] + (w[3] || 0), w[2] + (w[3] || 0)]; };
  const lut = q.lut && q.lut.id ? lutNow(q.lut.id) : null;
  return { cv, cvKey: 'cv:' + ck, lut, lutAmt: lut ? clamp(q.lut.amount ?? 1) : 0, wl: wv('lift'), wg: wv('gamma'), wn: wv('gain'), wb: [q.wb?.temp || 0, q.wb?.tint || 0], hs,
    ex: q.ex || 0, con: q.con ?? 1, sat: q.sat ?? 1, vig: q.vig || 0, grain: q.grain || 0, sharp: q.sharp || 0, ...extra };
}
/** Preload every LUT a project uses (call before drawing / exporting). */
export async function ensureLuts(p) { lastP = p; const ids = new Set(); for (const t of p.tracks) for (const c of t.clips) if (c.color && c.color.lut && c.color.lut.id) ids.add(c.color.lut.id);
  for (const id of Object.keys(p.luts || {})) lutCache.delete(id), 0; for (const id of ids) { try { await loadLut(id, p); } catch (e) { console.warn(e); } } }

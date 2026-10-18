/* Motion (Batch 10): video stabilisation (feature tracking + robust similarity fit + Gaussian path smoothing,
   crop-compensated), template-matching tracker (NCC point / area), bezier keyframe easing, smooth slow motion
   with frame blending. Pure maths here + the frame loops; rendering of clip.stab in render.js (preview == export). */
import { openSource, demux } from './framesource.js';

/* ---------------- bezier easing ---------------- */
const bzCache = new Map();
/** CSS-style cubic-bezier(x1, y1, x2, y2) as u -> eased value (x solved by Newton + bisection). */
export function bezierEase(bz) {
  const key = bz.join(','); if (bzCache.has(key)) return bzCache.get(key);
  const [x1, y1, x2, y2] = bz.map(Number), cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
  const X = s => ((ax * s + bx) * s + cx) * s, Y = s => ((ay * s + by) * s + cy) * s, dX = s => (3 * ax * s + 2 * bx) * s + cx;
  const f = u => { if (u <= 0) return 0; if (u >= 1) return 1; let s = u;
    for (let i = 0; i < 6; i++) { const e = X(s) - u, d = dX(s); if (Math.abs(e) < 1e-6) return Y(s); if (Math.abs(d) < 1e-6) break; s -= e / d; }
    let lo = 0, hi = 1; s = u; for (let i = 0; i < 30; i++) { const v = X(s); if (Math.abs(v - u) < 1e-6) break; if (v < u) lo = s; else hi = s; s = (lo + hi) / 2; } return Y(s); };
  bzCache.set(key, f); if (bzCache.size > 200) bzCache.delete(bzCache.keys().next().value); return f;
}
export const BEZIER_PRESETS = [['ease', 'Ease', [.25, .1, .25, 1]], ['easeIn', 'Ease in', [.42, 0, 1, 1]], ['easeOut', 'Ease out', [0, 0, .58, 1]], ['easeInOut', 'Ease in-out', [.42, 0, .58, 1]],
  ['backOut', 'Overshoot', [.34, 1.56, .64, 1]], ['backIn', 'Anticipate', [.36, 0, .66, -.56]], ['snap', 'Snap', [.9, 0, .1, 1]], ['soft', 'Soft', [.45, .05, .55, .95]]];

/* ---------------- grey frames ---------------- */
let gcv = null;
function grey(img, sw, sh, w, h) {
  if (!gcv || gcv.width !== w || gcv.height !== h) gcv = new OffscreenCanvas(w, h);
  const x = gcv.getContext('2d', { willReadFrequently: true }); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'medium'; x.drawImage(img, 0, 0, sw, sh, 0, 0, w, h);
  const d = x.getImageData(0, 0, w, h).data, g = new Float32Array(w * h);
  for (let i = 0, j = 0; j < g.length; i += 4, j++) g[j] = .299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2];
  return g;
}
export async function sourceFps(rec) { const dm = await demux(rec).catch(() => null); if (!dm || !dm.samples.length) return 30;
  const d = dm.samples.map(s => s.dur).filter(x => x > 0).sort((a, b) => a - b), m = d[d.length >> 1]; return m > 0 ? Math.max(5, Math.min(120, 1 / m)) : 30; }

/* ---------------- stabilisation ---------------- */
function sad(A, B, w, ax, ay, bx, by, r) { let s = 0; for (let y = -r; y <= r; y++) { const ia = (ay + y) * w + ax, ib = (by + y) * w + bx; for (let x = -r; x <= r; x++) s += Math.abs(A[ia + x] - B[ib + x]); } return s; }
/** Corner-ish features: best min-eigenvalue point per grid cell, away from the border. */
function features(g, w, h, m, gx = 8, gy = 8) {
  const pts = [];
  for (let cy = 0; cy < gy; cy++) for (let cx = 0; cx < gx; cx++) {
    const x0 = Math.max(m, Math.floor(cx * w / gx)), x1 = Math.min(w - m - 1, Math.floor((cx + 1) * w / gx)), y0 = Math.max(m, Math.floor(cy * h / gy)), y1 = Math.min(h - m - 1, Math.floor((cy + 1) * h / gy));
    let best = 0, bx = -1, by = -1;
    for (let y = y0; y < y1; y += 2) for (let x = x0; x < x1; x += 2) {
      let sxx = 0, syy = 0, sxy = 0;
      for (let v = -2; v <= 2; v++) for (let u = -2; u <= 2; u++) { const i = (y + v) * w + x + u, ix = g[i + 1] - g[i - 1], iy = g[i + w] - g[i - w]; sxx += ix * ix; syy += iy * iy; sxy += ix * iy; }
      const tr = sxx + syy, l = tr / 2 - Math.sqrt(Math.max(0, tr * tr / 4 - (sxx * syy - sxy * sxy)));
      if (l > best) { best = l; bx = x; by = y; }
    }
    if (bx >= 0 && best > 400) pts.push([bx, by, best]);
  }
  return pts;
}
/** Least-squares similarity x' = a x - b y + tx, y' = b x + a y + ty (centred coords). */
function simFit(P, Q, use) {
  let n = 0, mx = 0, my = 0, nx = 0, ny = 0;
  for (let i = 0; i < P.length; i++) if (use[i]) { n++; mx += P[i][0]; my += P[i][1]; nx += Q[i][0]; ny += Q[i][1]; }
  if (n < 2) return null; mx /= n; my /= n; nx /= n; ny /= n;
  let sa = 0, sb = 0, ss = 0;
  for (let i = 0; i < P.length; i++) if (use[i]) { const px = P[i][0] - mx, py = P[i][1] - my, qx = Q[i][0] - nx, qy = Q[i][1] - ny; sa += px * qx + py * qy; sb += px * qy - py * qx; ss += px * px + py * py; }
  const a = ss > 1e-9 ? sa / ss : 1, b = ss > 1e-9 ? sb / ss : 0;
  return { a, b, tx: nx - (a * mx - b * my), ty: ny - (b * mx + a * my) };
}
/** Motion between two grey frames: { dx, dy, da, ds } (pixels, radians, log-scale) + how many points agreed. */
export function frameMotion(A, B, w, h) {
  const R = Math.max(6, Math.round(w * .12)), r = 5, m = R + r + 2;
  // 1) global shift on the centre block (coarse, step 2 then refine)
  let best = Infinity, gx = 0, gy = 0; const cx = w >> 1, cy = h >> 1, br = Math.min(Math.floor(w * .3), Math.floor(h * .3)) | 0;
  const blockSad = (dx, dy) => { let s = 0; for (let y = -br; y <= br; y += 3) { const ia = (cy + y) * w + cx, ib = (cy + y + dy) * w + cx + dx; for (let x = -br; x <= br; x += 3) s += Math.abs(A[ia + x] - B[ib + x]); } return s; };
  const lim = Math.min(R, cx - br - 1, cy - br - 1);
  for (let dy = -lim; dy <= lim; dy += 2) for (let dx = -lim; dx <= lim; dx += 2) { const s = blockSad(dx, dy); if (s < best) { best = s; gx = dx; gy = dy; } }
  for (let dy = gy - 1; dy <= gy + 1; dy++) for (let dx = gx - 1; dx <= gx + 1; dx++) if (Math.abs(dx) <= lim && Math.abs(dy) <= lim) { const s = blockSad(dx, dy); if (s < best) { best = s; gx = dx; gy = dy; } }
  // 2) features + local search around the global shift
  const F = features(A, w, h, m), P = [], Q = [], L = 4;
  for (const [x, y] of F) {
    let bs = Infinity, bx = 0, by = 0; const S = {};
    for (let dy = gy - L; dy <= gy + L; dy++) for (let dx = gx - L; dx <= gx + L; dx++) { const X2 = x + dx, Y2 = y + dy; if (X2 < r + 1 || Y2 < r + 1 || X2 >= w - r - 1 || Y2 >= h - r - 1) continue;
      const s = sad(A, B, w, x, y, X2, Y2, r); S[dx + ',' + dy] = s; if (s < bs) { bs = s; bx = dx; by = dy; } }
    if (!isFinite(bs)) continue;
    const sub = (a, b0, c) => { const d = a - 2 * b0 + c; return Math.abs(d) > 1e-6 ? Math.max(-.5, Math.min(.5, (a - c) / (2 * d))) : 0; };
    const fx = S[(bx - 1) + ',' + by], fx2 = S[(bx + 1) + ',' + by], fy = S[bx + ',' + (by - 1)], fy2 = S[bx + ',' + (by + 1)];
    const ox = fx != null && fx2 != null ? sub(fx, bs, fx2) : 0, oy = fy != null && fy2 != null ? sub(fy, bs, fy2) : 0;
    P.push([x - w / 2, y - h / 2]); Q.push([x + bx + ox - w / 2, y + by + oy - h / 2]);
  }
  if (P.length < 4) return { dx: gx, dy: gy, da: 0, ds: 0, n: P.length };
  let use = P.map(() => true), T = simFit(P, Q, use);
  for (let it = 0; it < 3 && T; it++) {
    const res = P.map((p, i) => Math.hypot(T.a * p[0] - T.b * p[1] + T.tx - Q[i][0], T.b * p[0] + T.a * p[1] + T.ty - Q[i][1]));
    const med = [...res].sort((a, b) => a - b)[res.length >> 1], th = Math.max(.75, med * 2.5); use = res.map(v => v <= th);
    const T2 = simFit(P, Q, use); if (!T2) break; T = T2;
  }
  if (!T) return { dx: gx, dy: gy, da: 0, ds: 0, n: 0 };
  return { dx: T.tx, dy: T.ty, da: Math.atan2(T.b, T.a), ds: Math.log(Math.max(.5, Math.hypot(T.a, T.b))), n: use.filter(Boolean).length };
}
export const STAB_LEVELS = { low: { name: 'Low', sigma: .2 }, med: { name: 'Medium', sigma: .55 }, high: { name: 'High', sigma: 1.5 } };   // smoothing in seconds
export function gaussSmooth(a, sig) {
  const n = a.length, out = new Float64Array(n); if (!n) return out; const R = Math.max(1, Math.ceil(sig * 3)), k = [];
  for (let i = -R; i <= R; i++) k.push(Math.exp(-i * i / (2 * sig * sig)));
  for (let i = 0; i < n; i++) { let s = 0, ws = 0; for (let j = -R; j <= R; j++) { let q = i + j; if (q < 0) q = -q; if (q >= n) q = 2 * n - 2 - q; q = Math.max(0, Math.min(n - 1, q)); s += a[q] * k[j + R]; ws += k[j + R]; } out[i] = s / ws; }
  return out;
}
/** Zoom needed so the corrected frame still covers the whole picture (no black edges). */
export function coverZoom(dx, dy, da, ds, w, h) {
  // corrected point p' = e^ds R(da) p + d (centred). The output corners must come from inside the source: inverse map them.
  const s = Math.exp(ds), c = Math.cos(da), sn = Math.sin(da); let z = 1;
  for (const [X, Y] of [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]) {
    for (let zz = 1; zz < 3; zz += .005) {   // output corner at zoom zz -> source position
      const qx = X / zz - dx, qy = Y / zz - dy, px = (c * qx + sn * qy) / s, py = (-sn * qx + c * qy) / s;
      if (Math.abs(px) <= w / 2 + 1e-6 && Math.abs(py) <= h / 2 + 1e-6) { z = Math.max(z, zz); break; }
    }
  }
  return z;
}
/** Analyse a video range and return clip.stab (corrections sampled by source time). */
export async function stabilize(rec, a, b, level = 'med', onProgress = () => {}, { maxZoom = 1.4 } = {}) {
  const sfps = await sourceFps(rec), fps = Math.min(30, Math.round(sfps)), N = Math.max(2, Math.floor((b - a) * fps) + 1);
  const src = await openSource(rec, a); let w = 0, h = 0, prev = null; const X = [0], Y = [0], A = [0], Sl = [0], q = [];
  try {
    for (let i = 0; i < N; i++) {
      const f = await src.frameAt(Math.min(b - 1e-3, a + i / fps));
      if (!w) { const k = 200 / Math.max(f.w, f.h); w = Math.max(32, Math.round(f.w * k)); h = Math.max(32, Math.round(f.h * k)); }
      const g = grey(f.img, f.w, f.h, w, h);
      if (prev) { const m = frameMotion(prev, g, w, h); q.push(m.n); X.push(X[X.length - 1] + m.dx); Y.push(Y[Y.length - 1] + m.dy); A.push(A[A.length - 1] + m.da); Sl.push(Sl[Sl.length - 1] + m.ds); }
      prev = g; if (i % 4 === 0) onProgress(i / N);
    }
  } finally { src.close(); }
  const sig = STAB_LEVELS[level]?.sigma ?? .55, sg = Math.max(1, sig * fps), sX = gaussSmooth(X, sg), sY = gaussSmooth(Y, sg), sA = gaussSmooth(A, sg), sS = gaussSmooth(Sl, sg);
  let dx = X.map((v, i) => sX[i] - v), dy = Y.map((v, i) => sY[i] - v), da = A.map((v, i) => sA[i] - v), ds = Sl.map((v, i) => sS[i] - v);
  const need = f => Math.max(...dx.map((_, i) => coverZoom(dx[i] * f, dy[i] * f, da[i] * f, ds[i] * f, w, h)));
  let fac = 1, zoom = need(1);
  if (zoom > maxZoom) { let lo = 0, hi = 1; for (let it = 0; it < 14; it++) { const mid = (lo + hi) / 2; if (need(mid) > maxZoom) hi = mid; else lo = mid; } fac = lo; zoom = need(fac); }
  const r5 = v => Math.round(v * 1e5) / 1e5;
  return { v: 1, level, fps, a, n: N, w, h, zoom: Math.round(zoom * 1e4) / 1e4, fac: Math.round(fac * 1000) / 1000,
    dx: dx.map(v => r5(v * fac / w)), dy: dy.map(v => r5(v * fac / h)), da: da.map(v => r5(v * fac)), ds: ds.map(v => r5(v * fac)), raw: { x: X.map(v => r5(v / w)), y: Y.map(v => r5(v / h)) }, pts: q.length ? Math.round(q.reduce((s, v) => s + v, 0) / q.length) : 0 };
}
/** Correction at a source time: { x, y (fractions of the frame), a (rad), s (scale), z (crop zoom) }. */
export function stabAt(st, ts) {
  if (!st || !st.dx || !st.dx.length) return null; const u = Math.max(0, Math.min(st.dx.length - 1, (ts - st.a) * st.fps)), i = Math.floor(u), j = Math.min(st.dx.length - 1, i + 1), f = u - i;
  const L = k => st[k][i] + (st[k][j] - st[k][i]) * f;
  return { x: L('dx'), y: L('dy'), a: L('da'), s: Math.exp(L('ds')), z: st.zoom || 1 };
}

/* ---------------- template-matching tracker (NCC) ---------------- */
function patch(g, w, h, cx, cy, r) { const n = 2 * r + 1, out = new Float32Array(n * n); let k = 0;
  for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) { const X = Math.max(0, Math.min(w - 1, Math.round(cx + x))), Y = Math.max(0, Math.min(h - 1, Math.round(cy + y))); out[k++] = g[Y * w + X]; } return out; }
function stats(t) { let s = 0, ss = 0; for (const v of t) { s += v; ss += v * v; } const m = s / t.length; return { m, sd: Math.sqrt(Math.max(1e-6, ss / t.length - m * m)) }; }
/** Best NCC match of template T (radius r) in g around (px, py) within ±R: { x, y, score }. */
export function nccSearch(g, w, h, T, r, px, py, R) {
  const st = stats(T), n = 2 * r + 1, N = n * n, Tz = new Float32Array(N); for (let i = 0; i < N; i++) Tz[i] = (T[i] - st.m) / st.sd;
  let best = -2, bx = px, by = py; const sc = new Map();
  const score = (cx, cy) => { let s = 0, ss = 0, st2 = 0, k = 0;
    for (let y = -r; y <= r; y++) { const Y = Math.max(0, Math.min(h - 1, cy + y)); for (let x = -r; x <= r; x++) { const X = Math.max(0, Math.min(w - 1, cx + x)), v = g[Y * w + X]; s += v; ss += v * v; st2 += v * Tz[k++]; } }
    const m = s / N, sd = Math.sqrt(Math.max(1e-6, ss / N - m * m)); return st2 / (N * sd); };
  const x0 = Math.round(px), y0 = Math.round(py);
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) { const v = score(x0 + dx, y0 + dy); sc.set(dx + ',' + dy, v); if (v > best) { best = v; bx = x0 + dx; by = y0 + dy; } }
  const at = (dx, dy) => sc.get((bx - x0 + dx) + ',' + (by - y0 + dy)), sub = (a, b, c) => { const d = a - 2 * b + c; return a != null && c != null && Math.abs(d) > 1e-6 ? Math.max(-.5, Math.min(.5, (a - c) / (2 * d))) : 0; };
  return { x: bx + sub(at(-1, 0), best, at(1, 0)), y: by + sub(at(0, -1), best, at(0, 1)), score: best };
}
/** Track a point/area through grey frames (array of Float32Array, w x h): positions per frame (pixels) + scores. */
export function trackFrames(frames, w, h, x0, y0, r, R) {
  let T = patch(frames[0], w, h, x0, y0, r), x = x0, y = y0, vx = 0, vy = 0; const out = [{ x, y, score: 1 }];
  for (let i = 1; i < frames.length; i++) {
    const m = nccSearch(frames[i], w, h, T, r, x + vx, y + vy, R);
    if (m.score > .45) { vx = .6 * (m.x - x) + .4 * vx; vy = .6 * (m.y - y) + .4 * vy; x = m.x; y = m.y;
      if (m.score > .75) { const P2 = patch(frames[i], w, h, x, y, r); for (let k = 0; k < T.length; k++) T[k] = .85 * T[k] + .15 * P2[k]; } }
    out.push({ x, y, score: m.score });
  }
  return out;
}
/** Keep only the keyframes needed to follow a path within tol (Ramer-Douglas-Peucker on x and y). */
export function simplifyPath(P, tol = .002) {
  if (P.length <= 2) return P; const keep = new Uint8Array(P.length); keep[0] = keep[P.length - 1] = 1;
  const rec = (a, b) => { let md = 0, mi = -1; for (let i = a + 1; i < b; i++) { const f = (P[i].t - P[a].t) / Math.max(1e-9, P[b].t - P[a].t), ex = P[a].x + (P[b].x - P[a].x) * f, ey = P[a].y + (P[b].y - P[a].y) * f, d = Math.max(Math.abs(P[i].x - ex), Math.abs(P[i].y - ey)); if (d > md) { md = d; mi = i; } }
    if (md > tol && mi > 0) { keep[mi] = 1; rec(a, mi); rec(mi, b); } };
  rec(0, P.length - 1); return P.filter((_, i) => keep[i]);
}
export { grey };

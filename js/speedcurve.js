/* Speed curves (CapCut-style "Curve" speed): the speed changes smoothly over the clip.
   A curve is a list of points { x, v }: x = position in the clip's playing time (0..1), v = speed (0.1x..10x).
   Between points the speed eases smoothly (smoothstep), so the integral has a closed form and the mapping
   timeline time -> source time is exact and cheap (the same function is used by preview, export and the sound). */
export const MIN_V = 0.1, MAX_V = 10;
const P = (...a) => a.map(([x, v]) => ({ x, v }));
export const CURVE_PRESETS = [
  { id: 'custom', name: 'Custom', pts: P([0, 1], [0.25, 1], [0.5, 1], [0.75, 1], [1, 1]) },
  { id: 'montage', name: 'Montage', pts: P([0, 1], [0.18, 3.2], [0.36, 0.7], [0.55, 3.2], [0.75, 0.7], [1, 1.4]) },
  { id: 'hero', name: 'Hero time', pts: P([0, 2], [0.3, 2], [0.42, 0.3], [0.62, 0.3], [0.74, 2], [1, 2]) },
  { id: 'bullet', name: 'Bullet time', pts: P([0, 3.5], [0.28, 3.5], [0.4, 0.15], [0.62, 0.15], [0.74, 3.5], [1, 3.5]) },
  { id: 'jump', name: 'Jump cut', pts: P([0, 1], [0.3, 1], [0.38, 7], [0.58, 7], [0.66, 1], [1, 1]) },
  { id: 'flashin', name: 'Flash in', pts: P([0, 7], [0.3, 6], [0.55, 1], [1, 1]) },
  { id: 'flashout', name: 'Flash out', pts: P([0, 1], [0.45, 1], [0.7, 6], [1, 7]) },
];
export const presetById = id => CURVE_PRESETS.find(p => p.id === id);
const ss = t => t * t * (3 - 2 * t), ssI = t => t * t * t - t * t * t * t / 2;   // smoothstep and its integral (0..t)
/** Speed multiplier at u (0..1). */
export function curveV(pts, u) {
  if (u <= pts[0].x) return pts[0].v;
  for (let i = 1; i < pts.length; i++) if (u <= pts[i].x) { const a = pts[i - 1], b = pts[i], w = b.x - a.x; return w <= 1e-9 ? b.v : a.v + (b.v - a.v) * ss((u - a.x) / w); }
  return pts[pts.length - 1].v;
}
/** Integral of the speed from 0 to u. */
export function curveInt(pts, u) {
  let s = 0; if (u <= 0) return 0;
  if (pts[0].x > 0) { const e = Math.min(u, pts[0].x); s += pts[0].v * e; if (u <= pts[0].x) return s; }
  for (let i = 1; i < pts.length; i++) { const a = pts[i - 1], b = pts[i], w = b.x - a.x; if (w <= 1e-9) continue;
    const e = Math.min(u, b.x); if (e <= a.x) break; const t = (e - a.x) / w; s += w * (a.v * t + (b.v - a.v) * ssI(t)); if (u <= b.x) return s; }
  const L = pts[pts.length - 1]; if (u > L.x) s += L.v * (u - L.x); return s;
}
export const curveMean = pts => curveInt(pts, 1);
/* A clip's curve may be a window [u0, u1] of a longer curve (after a split), so both halves keep exactly the
   same motion and timing as before the cut. These work on the clip's curve object { id, pts, u0?, u1? }. */
const win = cv => [cv.u0 ?? 0, cv.u1 ?? 1];
export function cvV(cv, u) { const [a, b] = win(cv); return curveV(cv.pts, a + (b - a) * u); }
export function cvInt(cv, u) { const [a, b] = win(cv), w = Math.max(1e-9, b - a); return (curveInt(cv.pts, a + w * Math.max(0, Math.min(1, u))) - curveInt(cv.pts, a)) / w; }
export const cvMean = cv => cvInt(cv, 1);
export const validCurve = cv => !!(cv && Array.isArray(cv.pts) && cv.pts.length >= 2);
/** The part of a clip's curve between clip positions u0..u1 (0..1 of this clip): used when a curved clip is split. */
export function subCurve(cv, u0, u1) { const [a, b] = win(cv), w = b - a; return { ...cv, u0: a + w * u0, u1: a + w * u1 }; }
/** Source offset (0..len) at clip time L for a clip of source length len and duration D. */
export const curveSrc = (cv, len, D, L) => len * cvInt(cv, L / D) / cvMean(cv);

/* Transition registry. Every transition is ONE entry: render(ctx, A, B, p, W, H, h)
   A / B = full-frame layers (canvas) of the outgoing / incoming clip, p = progress 0..1.
   Contract (checked by tests): p = 0 looks exactly like A, p = 1 exactly like B.
   The same function draws the live preview, the export, and the animated thumbnails in the picker. */
import { glTransition } from './effects.js';
const PI = Math.PI;
export const E = { // easings
  linear: t => t, in: t => t * t * t, out: t => 1 - Math.pow(1 - t, 3),
  inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  bounce: t => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375; return n * (t -= 2.625 / d) * t + .984375; },
};
const ease = E.inOut, bell = p => Math.sin(p * PI), smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const full = (ctx, img, W, H) => ctx.drawImage(img, 0, 0, W, H);
function place(ctx, img, W, H, { s = 1, sx = s, sy = s, rot = 0, a = 1, dx = 0, dy = 0 } = {}) {
  if (a <= 0 || !sx || !sy) return; ctx.save(); ctx.globalAlpha = Math.min(1, a); ctx.translate(W / 2 + dx, H / 2 + dy); if (rot) ctx.rotate(rot); ctx.scale(sx, sy); ctx.drawImage(img, -W / 2, -H / 2, W, H); ctx.restore();
}
const black = (ctx, W, H, c = '#000') => { ctx.fillStyle = c; ctx.fillRect(0, 0, W, H); };
function clipDraw(ctx, img, W, H, path) { ctx.save(); ctx.beginPath(); path(ctx); ctx.clip(); full(ctx, img, W, H); ctx.restore(); }
const fade = (ctx, A, B, p, W, H) => { full(ctx, A, W, H); ctx.globalAlpha = p; full(ctx, B, W, H); ctx.globalAlpha = 1; };
/* shared scratch canvases + noise for helpers */
export function helpers() {
  const tmps = [];
  const mk = (W, H) => typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
  let noise = null, mask = null;
  return {
    tmp(i, W, H) { let c = tmps[i]; if (!c || c.width !== W || c.height !== H) c = tmps[i] = mk(W, H); const x = c.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.clearRect(0, 0, W, H); return c; },
    /* soft blobby mask (smooth value noise): alpha where noise < thr. i picks one of two mask canvases */
    smoothMask(thr, i = 0) {
      const w = 90, h = 160;
      if (!this._sn) { const lo = mk(10, 18), lx = lo.getContext('2d'), id = lx.createImageData(10, 18), r = rng(23); for (let k = 0; k < id.data.length; k += 4) { id.data[k] = id.data[k + 1] = id.data[k + 2] = Math.floor(r() * 256); id.data[k + 3] = 255; } lx.putImageData(id, 0, 0);
        const hi = mk(w, h), hx = hi.getContext('2d', { willReadFrequently: true }); hx.imageSmoothingEnabled = true; hx.imageSmoothingQuality = 'high'; hx.drawImage(lo, 0, 0, w, h); const d = hx.getImageData(0, 0, w, h).data;
        let mn = 255, mx = 0; const v = new Float32Array(w * h); for (let k = 0; k < v.length; k++) { v[k] = d[k * 4]; mn = Math.min(mn, v[k]); mx = Math.max(mx, v[k]); } for (let k = 0; k < v.length; k++) v[k] = (v[k] - mn) / Math.max(1, mx - mn);
        this._sn = v; this._sm = [mk(w, h), mk(w, h)]; }
      const c = this._sm[i], x = c.getContext('2d'), id = x.createImageData(w, h), v = this._sn;
      for (let k = 0; k < v.length; k++) id.data[k * 4 + 3] = Math.max(0, Math.min(255, (thr - v[k]) * 255 * 14 + 128)); x.putImageData(id, 0, 0); return c;
    },
    noiseMask(p) {
      const w = 90, h = 160; if (!noise) { const r = rng(7); noise = new Float32Array(w * h).map(() => r()); mask = mk(w, h); }
      const x = mask.getContext('2d'), id = x.createImageData(w, h); for (let i = 0; i < noise.length; i++) id.data[i * 4 + 3] = noise[i] < p ? 255 : 0; x.putImageData(id, 0, 0); return mask;
    },
  };
}
function revealShape(path) { // B revealed inside a growing shape centred on the frame
  return (ctx, A, B, p, W, H) => { full(ctx, A, W, H); if (p <= 0) return; if (p >= 1) return full(ctx, B, W, H);
    const R = Math.hypot(W, H) * 1.6 * E.in(p); clipDraw(ctx, B, W, H, c => path(c, W / 2, H / 2, R)); };
}
const slide = (dx, dy) => (ctx, A, B, p, W, H) => { const e = ease(p); full(ctx, A, W, H); ctx.drawImage(B, dx * (1 - e) * W, dy * (1 - e) * H, W, H); };
const push = (dx, dy) => (ctx, A, B, p, W, H) => { const e = ease(p); ctx.drawImage(A, -dx * e * W, -dy * e * H, W, H); ctx.drawImage(B, dx * (1 - e) * W, dy * (1 - e) * H, W, H); };
const wipe = rect => (ctx, A, B, p, W, H) => { full(ctx, A, W, H); const e = ease(p); if (e <= 0) return; clipDraw(ctx, B, W, H, c => c.rect(...rect(e, W, H))); };
const blinds = (vertical, n = 8) => (ctx, A, B, p, W, H) => { full(ctx, A, W, H); const e = ease(p); if (e <= 0) return;
  clipDraw(ctx, B, W, H, c => { for (let i = 0; i < n; i++) vertical ? c.rect(i * W / n, 0, W / n * e + .5, H) : c.rect(0, i * H / n, W, H / n * e + .5); }); };

/* ---------- building blocks for the second set ---------- */
const T0 = fn => (ctx, A, B, p, W, H, h) => { if (p <= 0) return full(ctx, A, W, H); if (p >= 1) return full(ctx, B, W, H); fn(ctx, A, B, p, W, H, h); };
const clamp01 = x => Math.max(0, Math.min(1, x));
/* running average of n copies (equal weights): copy i drawn with alpha 1/(i+1). o(k) -> place() options, k in -0.5..0.5 */
function smear(ctx, img, W, H, n, o) { for (let i = 0; i < n; i++) place(ctx, img, W, H, { ...o(n > 1 ? i / (n - 1) - .5 : 0), a: 1 / (i + 1) }); }
const zoomSmear = (ctx, img, W, H, z, bl) => { black(ctx, W, H); const n = Math.abs(bl) > .004 ? 9 : 1; for (let i = 0; i < n; i++) place(ctx, img, W, H, { s: z * (1 + bl * (n > 1 ? i / (n - 1) : 0)), a: 1 / (i + 1) }); };
/* whip pan: A and B side by side, moving fast with motion blur */
const whip = (dx, dy) => T0((ctx, A, B, p, W, H) => { black(ctx, W, H); const u = ease(p), L = .45 * bell(p), n = 11;
  for (let i = 0; i < n; i++) { const uu = u + (i / (n - 1) - .5) * L; ctx.globalAlpha = 1 / (i + 1);
    ctx.drawImage(A, -dx * uu * W, -dy * uu * H, W, H); ctx.drawImage(B, dx * (1 - uu) * W, dy * (1 - uu) * H, W, H); } ctx.globalAlpha = 1; });
/* perspective plane drawn as strips. pts(u) -> [a, f]: screen position along the moving axis and depth scale */
function strips(ctx, img, W, H, horiz, pts, shade = 0, n = 36, ua = 0, ub = 1) {
  const M = horiz ? H : W;
  for (let j = 0; j < n; j++) { const u0 = ua + (ub - ua) * j / n, u1 = ua + (ub - ua) * (j + 1) / n, [a0, f0] = pts(u0), [a1, f1] = pts(u1); if (a1 - a0 < .05) continue;
    const ext = M * (f0 + f1) / 2, d = (M - ext) / 2, len = a1 - a0 + .9;
    if (horiz) ctx.drawImage(img, u0 * W, 0, (u1 - u0) * W, H, a0, d, len, ext); else ctx.drawImage(img, 0, u0 * H, W, (u1 - u0) * H, d, a0, ext, len);
    if (shade > .005) { const sl = a1 - a0; ctx.fillStyle = `rgba(0,0,0,${shade.toFixed(3)})`; horiz ? ctx.fillRect(a0, d, sl, ext) : ctx.fillRect(d, a0, ext, sl); } }
}
/* cube turn: dir 1 = B comes from the right (or bottom), -1 = from the left (top) */
const cube = (horiz, dir) => T0((ctx, A, B, p, W, H) => { black(ctx, W, H); const L = horiz ? W : H, D = 2.4 * L, th = ease(p) * PI / 2, c = Math.cos(th), s = Math.sin(th);
  const proj = (a, z) => { const x = a * c + z * s, zz = -a * s + z * c, f = D / (D + zz + L / 2); return [L / 2 + x * f, f]; };
  const faceA = u => proj(-L / 2 + L * u, -L / 2), faceB = u => proj(L / 2, -L / 2 + L * u);
  // dir -1 = the mirror image of dir 1 (column u of the picture sits where column 1-u would be, mirrored)
  const m = f => dir > 0 ? f : (u => { const [a, k] = f(1 - u); return [L - a, k]; });
  strips(ctx, A, W, H, horiz, m(faceA), .55 * (1 - c)); strips(ctx, B, W, H, horiz, m(faceB), .55 * (1 - s)); });
function revealPath(k, path) { return T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); const R = Math.hypot(W, H) * k * E.in(p); clipDraw(ctx, B, W, H, c => path(c, W / 2, H / 2, R, W, H)); const f = smooth(.8, 1, p); if (f > 0) { ctx.globalAlpha = f; full(ctx, B, W, H); ctx.globalAlpha = 1; } }); }
const polar = (c, x, y, R, f, n = 120) => { for (let i = 0; i <= n; i++) { const t = i / n * 2 * PI, r = f(t) * R; i ? c.lineTo(x + r * Math.cos(t), y + r * Math.sin(t)) : c.moveTo(x + r * Math.cos(t), y + r * Math.sin(t)); } c.closePath(); };

/* ---------- batch 8: canvas transitions ---------- */
const backE = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const elasticE = t => t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * (2 * PI / 3)) + 1;
const slideE = (dx, dy, f) => T0((ctx, A, B, p, W, H) => { const e = f(p); full(ctx, A, W, H); ctx.drawImage(B, dx * (1 - e) * W, dy * (1 - e) * H, W, H); });
const endFade = (ctx, B, W, H, p, a = .8) => { const f = smooth(a, 1, p); if (f > 0) { ctx.globalAlpha = f; full(ctx, B, W, H); ctx.globalAlpha = 1; } };
const dip = col => (ctx, A, B, p, W, H) => { full(ctx, p < .5 ? A : B, W, H); ctx.globalAlpha = 1 - Math.abs(2 * p - 1); black(ctx, W, H, col); ctx.globalAlpha = 1; };
/* B revealed through many growing shapes (seeded positions), finished by a short fade */
const manyShapes = (seed, n, size, draw, delay = .6) => T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); const r = rng(seed), pts = []; for (let i = 0; i < n; i++) pts.push([r() * W, r() * H, r() * delay, r() * 2 * PI]);
  const R = Math.hypot(W, H) * size; clipDraw(ctx, B, W, H, c => { for (const [x, y, d, a] of pts) { const q = clamp01((p - d) / (1 - delay)); if (q > 0) draw(c, x, y, E.out(q) * R, a + q); } }); endFade(ctx, B, W, H, p); });
const starPath = (c, x, y, R, rot = -PI / 2, k = 5, inner = .45) => { for (let i = 0; i <= 2 * k; i++) { const t = rot + i * PI / k, rr = i % 2 ? R * inner : R; i ? c.lineTo(x + rr * Math.cos(t), y + rr * Math.sin(t)) : c.moveTo(x + rr * Math.cos(t), y + rr * Math.sin(t)); } c.closePath(); };
const heartPath = (c, x, y, R) => { const s = R / 16; c.moveTo(x, y + 5 * s); for (let i = 1; i <= 40; i++) { const t = i / 40 * 2 * PI; c.lineTo(x + 16 * s * Math.pow(Math.sin(t), 3) * .9, y - (13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t)) * s * .9); } c.closePath(); };
const ngon = (c, x, y, R, n, rot = -PI / 2) => { for (let i = 0; i <= n; i++) { const t = rot + i * 2 * PI / n; i ? c.lineTo(x + R * Math.cos(t), y + R * Math.sin(t)) : c.moveTo(x + R * Math.cos(t), y + R * Math.sin(t)); } c.closePath(); };
/* hinge turn: the picture swings around its left (side = 0) or right (1) edge, a = 0..PI/2 */
function hinge(ctx, img, W, H, ang, side, shade = .6) { const L = W, D = 2.2 * L, c = Math.cos(ang), s = Math.sin(ang);
  const pts = side ? u => { const d = (1 - u) * L, f = D / (D + d * s); return [L - d * c * f, f]; } : u => { const d = u * L, f = D / (D + d * s); return [d * c * f, f]; };
  strips(ctx, img, W, H, true, pts, shade * s, 40); }
const TR2D = [
  // ---- Slide
  { id: 'slideUL', name: 'Slide from top-left', cat: 'Slide', render: slideE(-1, -1, ease) },
  { id: 'slideUR', name: 'Slide from top-right', cat: 'Slide', render: slideE(1, -1, ease) },
  { id: 'slideDL', name: 'Slide from bottom-left', cat: 'Slide', render: slideE(-1, 1, ease) },
  { id: 'slideDR', name: 'Slide from bottom-right', cat: 'Slide', render: slideE(1, 1, ease) },
  { id: 'pushDiag', name: 'Push diagonal', cat: 'Slide', render: T0((ctx, A, B, p, W, H) => { const e = ease(p); black(ctx, W, H); ctx.drawImage(A, -e * W, -e * H, W, H); ctx.drawImage(B, (1 - e) * W, (1 - e) * H, W, H); }) },
  { id: 'pushDiag2', name: 'Push diagonal up', cat: 'Slide', render: T0((ctx, A, B, p, W, H) => { const e = ease(p); black(ctx, W, H); ctx.drawImage(A, e * W, e * H, W, H); ctx.drawImage(B, -(1 - e) * W, -(1 - e) * H, W, H); }) },
  { id: 'springL', name: 'Spring left', cat: 'Slide', render: slideE(1, 0, backE) },
  { id: 'springR', name: 'Spring right', cat: 'Slide', render: slideE(-1, 0, backE) },
  { id: 'springU', name: 'Spring up', cat: 'Slide', render: slideE(0, 1, backE) },
  { id: 'stack', name: 'Stack', cat: 'Slide', render: T0((ctx, A, B, p, W, H) => { const e = E.in(p); black(ctx, W, H); place(ctx, B, W, H, { s: .9 + .1 * ease(p) }); place(ctx, A, W, H, { s: 1 - .15 * ease(p), dy: e * H * 1.15, rot: e * .12 }); }) },
  { id: 'cardIn', name: 'Card in', cat: 'Slide', render: T0((ctx, A, B, p, W, H) => { const e = E.out(p); full(ctx, A, W, H); ctx.fillStyle = `rgba(0,0,0,${(.45 * e).toFixed(3)})`; ctx.fillRect(0, 0, W, H); place(ctx, B, W, H, { dx: (1 - e) * W * 2, rot: (1 - e) * .5 }); }) },
  // ---- Wipe
  { id: 'wipeDiag2', name: 'Diagonal wipe left', cat: 'Wipe', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); const e = 2 * ease(p); clipDraw(ctx, B, W, H, c => { c.moveTo(W + 1, -1); c.lineTo(W - e * W - 1, -1); c.lineTo(W + 1, e * H + 1); c.closePath(); }); }) },
  { id: 'barnH', name: 'Barn doors', cat: 'Wipe', render: wipe((e, W, H) => [W / 2 * (1 - e), 0, W * e, H]) },
  { id: 'barnV', name: 'Barn doors up', cat: 'Wipe', render: wipe((e, W, H) => [0, H / 2 * (1 - e), W, H * e]) },
  { id: 'iris', name: 'Iris', cat: 'Wipe', render: T0((ctx, A, B, p, W, H) => { black(ctx, W, H); const R = Math.hypot(W, H) / 2, img = p < .5 ? A : B, k = p < .5 ? 1 - E.inOut(p * 2) : E.inOut(p * 2 - 1); if (k > .001) clipDraw(ctx, img, W, H, c => c.arc(W / 2, H / 2, R * k * 1.02, 0, 2 * PI)); }) },
  { id: 'clockBack', name: 'Clock back', cat: 'Wipe', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); clipDraw(ctx, B, W, H, c => { c.moveTo(W / 2, H / 2); c.arc(W / 2, H / 2, Math.hypot(W, H), -PI / 2, -PI / 2 - 2 * PI * p, true); c.closePath(); }); }) },
  { id: 'pinwheel', name: 'Pinwheel', cat: 'Wipe', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); const e = ease(p) * PI / 2, R = Math.hypot(W, H); clipDraw(ctx, B, W, H, c => { for (let k = 0; k < 4; k++) { c.moveTo(W / 2, H / 2); c.arc(W / 2, H / 2, R, k * PI / 2, k * PI / 2 + e + .001); c.closePath(); } }); }) },
  { id: 'zigzag', name: 'Zigzag', cat: 'Wipe', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); const z = W * .06, x = ease(p) * (W + 2 * z) - z, n = 14; clipDraw(ctx, B, W, H, c => { c.moveTo(-1, -1); for (let i = 0; i <= n; i++) c.lineTo(x + (i % 2 ? z : -z), i / n * H); c.lineTo(-1, H + 1); c.closePath(); }); }) },
  { id: 'softWipe', name: 'Soft wipe', cat: 'Wipe', render: T0((ctx, A, B, p, W, H, h) => { full(ctx, A, W, H); const t = h.tmp(0, W, H), x = t.getContext('2d'); full(x, B, W, H); const f = W * .35, c = ease(p) * (W + 2 * f) - f;
      const g = x.createLinearGradient(c - f, 0, c + f, 0); g.addColorStop(0, '#000'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.globalCompositeOperation = 'destination-in'; x.fillStyle = g; x.fillRect(0, 0, W, H); ctx.drawImage(t, 0, 0); }) },
  { id: 'stripes', name: 'Stripes', cat: 'Wipe', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); const n = 8, sh = H / n, e = ease(p); for (let i = 0; i < n; i++) { const d = (i % 2 ? 1 : -1) * (1 - e) * W; ctx.drawImage(B, 0, i * sh, W, sh + .5, d, i * sh, W, sh + .5); } }) },
  { id: 'columnsDrop', name: 'Columns drop', cat: 'Wipe', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); const n = 6, cw = W / n; for (let i = 0; i < n; i++) { const q = E.bounce(clamp01(p * 1.6 - i * .12)); ctx.drawImage(B, i * cw, 0, cw + .5, H, i * cw, -(1 - q) * H, cw + .5, H); } }) },
  { id: 'rowsSlide', name: 'Rows slide', cat: 'Wipe', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); const n = 10, rh = H / n; for (let i = 0; i < n; i++) { const q = E.out(clamp01(p * 1.8 - i * .08)); ctx.drawImage(B, 0, i * rh, W, rh + .5, -(1 - q) * W, i * rh, W, rh + .5); } }) },
  { id: 'diagBlinds', name: 'Diagonal blinds', cat: 'Wipe', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); const n = 10, L = W + H, bw = L / n, e = ease(p);
      clipDraw(ctx, B, W, H, c => { for (let i = 0; i < n; i++) { const a = i * bw, w = bw * e + .5; c.moveTo(a, 0); c.lineTo(a + w, 0); c.lineTo(a + w - H, H); c.lineTo(a - H, H); c.closePath(); } }); endFade(ctx, B, W, H, p, .9); }) },
  { id: 'splitDiag', name: 'Diagonal split', cat: 'Split', render: T0((ctx, A, B, p, W, H) => { const e = E.in(p); full(ctx, B, W, H);
      ctx.save(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W, 0); ctx.lineTo(0, H); ctx.closePath(); ctx.clip(); ctx.drawImage(A, -e * W, -e * H, W, H); ctx.restore();
      ctx.save(); ctx.beginPath(); ctx.moveTo(W, 0); ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath(); ctx.clip(); ctx.drawImage(A, e * W, e * H, W, H); ctx.restore(); }) },
  // ---- Shapes
  { id: 'triangle', name: 'Triangle', cat: 'Shapes', render: revealPath(2.2, (c, x, y, R) => ngon(c, x, y + R * .15, R * .5, 3)) },
  { id: 'hexagon', name: 'Hexagon', cat: 'Shapes', render: revealPath(1.3, (c, x, y, R) => ngon(c, x, y, R * .5, 6, 0)) },
  { id: 'flower', name: 'Flower', cat: 'Shapes', render: revealPath(1.5, (c, x, y, R) => polar(c, x, y, R * .45, t => 1 + .3 * Math.cos(5 * t))) },
  { id: 'sun', name: 'Sun', cat: 'Shapes', render: revealPath(1.6, (c, x, y, R) => starPath(c, x, y, R * .5, -PI / 2, 12, .72)) },
  { id: 'drop', name: 'Drop', cat: 'Shapes', render: revealPath(1.8, (c, x, y, R) => { const r = R * .5; c.moveTo(x, y - r * 1.4); c.bezierCurveTo(x + r * .9, y - r * .4, x + r, y + r, x, y + r); c.bezierCurveTo(x - r, y + r, x - r * .9, y - r * .4, x, y - r * 1.4); c.closePath(); }) },
  { id: 'paw', name: 'Paw print', cat: 'Shapes', render: revealPath(2.4, (c, x, y, R) => { const s = R * .3; c.moveTo(x + s, y + s * .5); c.ellipse(x, y + s * .5, s, s * .85, 0, 0, 2 * PI); for (const [dx, dy] of [[-1.1, -.55], [-.4, -1.2], [.4, -1.2], [1.1, -.55]]) { c.moveTo(x + dx * s + s * .38, y + dy * s); c.arc(x + dx * s, y + dy * s, s * .38, 0, 2 * PI); } }) },
  { id: 'bolt', name: 'Lightning', cat: 'Shapes', render: revealPath(2.6, (c, x, y, R) => { const s = R * .5, P = [[.15, -1], [-.45, .1], [-.05, .1], [-.2, 1], [.45, -.2], [.05, -.2], [.3, -1]]; P.forEach(([px, py], i) => i ? c.lineTo(x + px * s, y + py * s) : c.moveTo(x + px * s, y + py * s)); c.closePath(); }) },
  { id: 'spinSquare', name: 'Spinning square', cat: 'Shapes', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); const R = Math.hypot(W, H) * .75 * E.in(p); ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(p * PI); ctx.beginPath(); ctx.rect(-R, -R, 2 * R, 2 * R); ctx.restore(); ctx.save(); ctx.clip(); full(ctx, B, W, H); ctx.restore(); endFade(ctx, B, W, H, p); }) },
  // ---- Kids
  { id: 'balloons', name: 'Balloons', cat: 'Kids', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); const r = rng(33), n = 16, cols = ['#ff5a6e', '#ffc93c', '#4cd3ff', '#7cdd5a', '#b07bff', '#ff8f3c'], pts = [];
      for (let i = 0; i < n; i++) pts.push([r() * W, r() * .5, (r() * .5 + .6) * W * .16, cols[i % cols.length]]);
      const rise = y0 => H * (1.25 - y0 - ease(p) * 1.9);
      clipDraw(ctx, B, W, H, c => { c.rect(0, Math.max(0, rise(0) + W * .3), W, H); for (const [x, y0, rr] of pts) { const y = rise(y0); c.moveTo(x + rr, y); c.ellipse(x, y, rr, rr * 1.2, 0, 0, 2 * PI); } });
      ctx.lineWidth = Math.max(1, W / 300); for (const [x, y0, rr, col] of pts) { const y = rise(y0); if (y < -rr * 2 || y > H + rr * 4) continue; ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.beginPath(); ctx.moveTo(x, y + rr * 1.2); ctx.quadraticCurveTo(x - rr * .3, y + rr * 2, x, y + rr * 3); ctx.stroke();
        ctx.globalAlpha = .55 * bell(p); ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(x, y, rr, rr * 1.2, 0, 0, 2 * PI); ctx.fill(); ctx.globalAlpha = 1; }
      endFade(ctx, B, W, H, p, .85); }) },
  { id: 'confetti', name: 'Confetti', cat: 'Kids', render: T0((ctx, A, B, p, W, H) => { full(ctx, p < .5 ? A : B, W, H); const r = rng(44), n = 160, k = bell(p), cols = ['#ff4d6d', '#ffd23f', '#3ddc84', '#1fb6ff', '#a259ff', '#ff9a1f'];
      for (let i = 0; i < n; i++) { const x = r() * W, y0 = r(), sp = .6 + r() * .8, a = r() * 2 * PI, s = (r() * .5 + .5) * W * .025, y = ((y0 + p * sp * 1.2) % 1.2 - .1) * H;
        ctx.save(); ctx.globalAlpha = Math.min(1, k * 1.6); ctx.translate(x + Math.sin(p * 9 + a) * W * .03, y); ctx.rotate(a + p * 8); ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(-s, -s * .4, 2 * s, s * .8); ctx.restore(); } }) },
  { id: 'starBurst', name: 'Star burst', cat: 'Kids', render: manyShapes(55, 18, .22, (c, x, y, R, a) => starPath(c, x, y, R, a)) },
  { id: 'heartsFloat', name: 'Hearts', cat: 'Kids', render: manyShapes(66, 16, .2, (c, x, y, R) => heartPath(c, x, y, R)) },
  { id: 'paint', name: 'Paint splat', cat: 'Kids', render: manyShapes(77, 9, .24, (c, x, y, R, a) => polar(c, x, y, R, t => 1 + .18 * Math.sin(7 * t + a * 3) + .1 * Math.sin(13 * t + a), 90), .45) },
  { id: 'scribble', name: 'Crayon scribble', cat: 'Kids', render: T0((ctx, A, B, p, W, H, h) => { full(ctx, A, W, H); const t = h.tmp(0, W, H), x = t.getContext('2d'), m = h.tmp(1, W, H), mx = m.getContext('2d');
      const n = 9, e = ease(p) * n; mx.lineWidth = H / n * 1.5; mx.lineCap = 'round'; mx.lineJoin = 'round'; mx.strokeStyle = '#000'; mx.beginPath();
      for (let i = 0; i < n; i++) { const q = clamp01(e - i); if (q <= 0) break; const y = (i + .5) * H / n, x0 = i % 2 ? W * 1.1 : -W * .1, x1 = i % 2 ? -W * .1 : W * 1.1; i ? mx.lineTo(x0, y) : mx.moveTo(x0, y); mx.lineTo(x0 + (x1 - x0) * q, y + Math.sin(q * 9) * H / n * .15); }
      mx.stroke(); full(x, B, W, H); x.globalCompositeOperation = 'destination-in'; x.drawImage(m, 0, 0); ctx.drawImage(t, 0, 0); endFade(ctx, B, W, H, p, .9); }) },
  { id: 'curtain', name: 'Stage curtain', cat: 'Kids', render: T0((ctx, A, B, p, W, H) => { full(ctx, p < .5 ? A : B, W, H); const k = p < .5 ? E.inOut(p * 2) : 1 - E.inOut(p * 2 - 1), cw = W / 2 * k * 1.02; if (cw < .5) return;
      for (const side of [0, 1]) { ctx.save(); const x0 = side ? W - cw : 0; ctx.beginPath(); ctx.rect(x0, 0, cw, H); ctx.clip(); const g = ctx.createLinearGradient(x0, 0, x0 + cw, 0), f = 7;
        for (let i = 0; i <= f; i++) g.addColorStop(i / f, i % 2 ? '#8e0f1f' : '#d8273a'); ctx.fillStyle = g; ctx.fillRect(x0, 0, cw, H); ctx.fillStyle = 'rgba(255,210,63,.9)'; ctx.fillRect(x0, 0, cw, H * .035); ctx.restore(); }
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(cw, 0, Math.max(0, W * .02), H); ctx.fillRect(W - cw - W * .02, 0, W * .02, H); }) },
  { id: 'starSpin', name: 'Star spin', cat: 'Kids', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); const R = Math.hypot(W, H) * 1.3 * E.in(p); clipDraw(ctx, B, W, H, c => starPath(c, W / 2, H / 2, R, -PI / 2 + p * PI * 1.5)); endFade(ctx, B, W, H, p); }) },
  { id: 'rainbowRings', name: 'Rainbow rings', cat: 'Kids', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); const cols = ['#a259ff', '#5b5bff', '#1fb6ff', '#3ddc84', '#ffe14d', '#ff9a1f', '#ff4d4d'], R = Math.hypot(W, H) / 2, rw = R * .09, r0 = E.inOut(p) * (R + rw * cols.length) - rw * cols.length;
      cols.forEach((col, i) => { const rr = r0 + (cols.length - i) * rw; if (rr > 0) { ctx.fillStyle = col; ctx.beginPath(); ctx.arc(W / 2, H / 2, rr, 0, 2 * PI); ctx.fill(); } }); if (r0 > 0) clipDraw(ctx, B, W, H, c => c.arc(W / 2, H / 2, r0, 0, 2 * PI)); endFade(ctx, B, W, H, p, .9); }) },
  { id: 'sparkleWipe', name: 'Sparkle wipe', cat: 'Kids', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); const x = ease(p) * W * 1.2 - W * .1; clipDraw(ctx, B, W, H, c => c.rect(0, 0, Math.max(0, x), H)); const r = rng(Math.floor(p * 30) + 8), k = bell(p);
      ctx.globalCompositeOperation = 'lighter'; for (let i = 0; i < 22; i++) { const y = r() * H, xx = x + (r() - .5) * W * .12, s = (r() * .6 + .4) * W * .035 * k; if (s < .5) continue; ctx.fillStyle = `rgba(255,240,170,${(.9 * k).toFixed(3)})`; ctx.beginPath(); starPath(ctx, xx, y, s, r() * PI, 4, .28); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-over'; }) },
  // ---- 3D
  { id: 'flipUp', name: 'Flip up', cat: '3D', render: T0((ctx, A, B, p, W, H) => { black(ctx, W, H); const c = Math.cos(ease(p) * PI); if (c > 0) place(ctx, A, W, H, { sy: c, sx: 1 - .08 * bell(p) }); else place(ctx, B, W, H, { sy: -c, sx: 1 - .08 * bell(p) }); }) },
  { id: 'swingOut', name: 'Swing door', cat: '3D', render: T0((ctx, A, B, p, W, H) => { full(ctx, B, W, H); ctx.fillStyle = `rgba(0,0,0,${(.5 * (1 - p)).toFixed(3)})`; ctx.fillRect(0, 0, W, H); hinge(ctx, A, W, H, ease(p) * PI / 2 * .98, 0); }) },
  { id: 'swingIn', name: 'Swing in', cat: '3D', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); ctx.fillStyle = `rgba(0,0,0,${(.5 * p).toFixed(3)})`; ctx.fillRect(0, 0, W, H); hinge(ctx, B, W, H, (1 - ease(p)) * PI / 2 * .98, 1); }) },
  { id: 'flipZoom', name: 'Flip zoom', cat: '3D', render: T0((ctx, A, B, p, W, H) => { black(ctx, W, H); const c = Math.cos(ease(p) * PI), s = 1 - .35 * bell(p); if (c > 0) place(ctx, A, W, H, { sx: c * s, sy: s }); else place(ctx, B, W, H, { sx: -c * s, sy: s }); }) },
  // ---- Motion
  { id: 'dropOut', name: 'Drop away', cat: 'Motion', render: T0((ctx, A, B, p, W, H) => { const e = E.in(p); full(ctx, B, W, H); place(ctx, A, W, H, { dy: e * H * 1.4, rot: e * .5, s: 1 - .1 * e }); }) },
  { id: 'flyAway', name: 'Fly away', cat: 'Motion', render: T0((ctx, A, B, p, W, H) => { const e = E.in(p); place(ctx, B, W, H, { s: 1.1 - .1 * ease(p) }); place(ctx, A, W, H, { s: 1 - .8 * e, dx: e * W * .9, dy: -e * H * .9, rot: e * .6, a: 1 - smooth(.7, 1, p) }); }) },
  { id: 'springPush', name: 'Spring push', cat: 'Motion', render: T0((ctx, A, B, p, W, H) => { const e = elasticE(p); black(ctx, W, H); ctx.drawImage(A, -e * W, 0, W, H); ctx.drawImage(B, (1 - e) * W, 0, W, H); }) },
  { id: 'spinAway', name: 'Spin away', cat: 'Motion', render: T0((ctx, A, B, p, W, H) => { const e = E.in(p); place(ctx, B, W, H, { s: .7 + .3 * ease(p) }); place(ctx, A, W, H, { s: Math.max(.001, 1 - e), rot: e * PI * 2 }); }) },
  { id: 'swap', name: 'Swap', cat: 'Motion', render: T0((ctx, A, B, p, W, H) => { black(ctx, W, H); const e = ease(p), k = bell(p); const o = [[A, -e, 1 - .3 * k], [B, 1 - e, 1 - .3 * k]];
      (p < .5 ? o.reverse() : o).forEach(([img, d, s]) => place(ctx, img, W, H, { dx: d * W * .8 * (1 - .2 * k) + 0, s, rot: d * .2 })); }) },
  // ---- Light
  { id: 'dipPink', name: 'Fade to pink', cat: 'Light', render: dip('#ff7eb6') },
  { id: 'dipGold', name: 'Fade to gold', cat: 'Light', render: dip('#ffc53d') },
  { id: 'dipBlue', name: 'Fade to sky', cat: 'Light', render: dip('#5ac8ff') },
  { id: 'glowFade', name: 'Glow', cat: 'Light', render: T0((ctx, A, B, p, W, H) => { const k = bell(p); ctx.filter = k > .01 ? `brightness(${(1 + 1.6 * k).toFixed(3)}) saturate(${(1 - .4 * k).toFixed(3)})` : 'none'; fade(ctx, A, B, smooth(.35, .65, p), W, H); ctx.filter = 'none'; }) },
  // ---- Glitch
  { id: 'scanlines', name: 'Scan lines', cat: 'Glitch', render: T0((ctx, A, B, p, W, H) => { const n = 48, rh = H / n, r = rng(9), k = bell(p); for (let i = 0; i < n; i++) { const t = .2 + r() * .6, img = p >= t ? B : A, dx = (r() - .5) * W * .08 * k; ctx.drawImage(img, 0, i * rh, W, rh + .5, dx, i * rh, W, rh + .5); } }) },
  { id: 'vhs', name: 'VHS', cat: 'Glitch', render: T0((ctx, A, B, p, W, H, h) => { const k = bell(p), img = p < .5 ? A : B, d = k * W * .015; full(ctx, img, W, H); if (k < .02) return;
      ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = .35 * k; ctx.drawImage(img, d, 0, W, H); ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
      const y = ((p * 3) % 1) * H, bh = H * .08; ctx.drawImage(img, 0, y, W, bh, -d * 4, y, W, bh); ctx.fillStyle = `rgba(255,255,255,${(.25 * k).toFixed(3)})`; ctx.fillRect(0, y + bh * .4, W, Math.max(1, H * .004));
      const r = rng(Math.floor(p * 50)); ctx.fillStyle = `rgba(255,255,255,${(.12 * k).toFixed(3)})`; for (let i = 0; i < 40; i++) ctx.fillRect(r() * W, r() * H, W * .03 * r(), 1.5); }) },
  { id: 'blocks', name: 'Digital blocks', cat: 'Glitch', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); const r = rng(12), n = 60; for (let i = 0; i < n; i++) { const t = r() * .75, w = (r() * .3 + .08) * W, h = (r() * .08 + .02) * H, x = r() * (W - w), y = r() * (H - h); if (p >= t) ctx.drawImage(B, x, y, w, h, x, y, w, h); } endFade(ctx, B, W, H, p, .78); }) },
  { id: 'tvOff', name: 'TV switch', cat: 'Glitch', render: T0((ctx, A, B, p, W, H) => { black(ctx, W, H); const img = p < .5 ? A : B, q = p < .5 ? p * 2 : 2 - p * 2, sy = Math.max(.004, 1 - smooth(0, .8, q)), sx = 1 - .9 * smooth(.8, 1, q);
      ctx.filter = q > .05 ? `brightness(${(1 + 2 * q).toFixed(2)})` : 'none'; place(ctx, img, W, H, { sx, sy }); ctx.filter = 'none'; }) },
  // ---- Comic
  { id: 'comicBurst', name: 'Comic burst', cat: 'Comic', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); const R = Math.hypot(W, H) * 1.1 * E.in(p); if (R < 1) return;
      ctx.save(); ctx.beginPath(); starPath(ctx, W / 2, H / 2, R, -PI / 2, 14, .72); ctx.lineWidth = Math.max(2, W / 90); ctx.strokeStyle = '#111'; ctx.stroke(); ctx.clip(); full(ctx, B, W, H); ctx.restore(); endFade(ctx, B, W, H, p); }) },
  { id: 'halftone', name: 'Halftone', cat: 'Comic', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); const nx = 14, cw = W / nx, ny = Math.ceil(H / cw) + 1;
      clipDraw(ctx, B, W, H, c => { for (let j = 0; j < ny; j++) for (let i = 0; i < nx + 1; i++) { const d = (i / nx + j / ny) / 2, q = clamp01(p * 1.8 - d * .8); if (q > 0) { const x = i * cw + (j % 2) * cw / 2, y = j * cw * .87; c.moveTo(x + q * cw * .75, y); c.arc(x, y, q * cw * .75, 0, 2 * PI); } } }); }) },
  { id: 'speedLines', name: 'Speed lines', cat: 'Comic', render: T0((ctx, A, B, p, W, H) => { const k = bell(p); place(ctx, p < .5 ? A : B, W, H, { s: 1 + .08 * k }); const r = rng(Math.floor(p * 20) + 2), R = Math.hypot(W, H);
      ctx.fillStyle = `rgba(255,255,255,${(.85 * k).toFixed(3)})`; for (let i = 0; i < 70; i++) { const a = r() * 2 * PI, w = .008 + r() * .02, r0 = R * (.22 + r() * .25); ctx.beginPath(); ctx.moveTo(W / 2 + Math.cos(a) * r0, H / 2 + Math.sin(a) * r0); ctx.lineTo(W / 2 + Math.cos(a - w) * R, H / 2 + Math.sin(a - w) * R); ctx.lineTo(W / 2 + Math.cos(a + w) * R, H / 2 + Math.sin(a + w) * R); ctx.closePath(); ctx.fill(); } }) },
  { id: 'pow', name: 'POW!', cat: 'Comic', render: T0((ctx, A, B, p, W, H) => { const k = bell(p), r = rng(Math.floor(p * 30)); place(ctx, p < .5 ? A : B, W, H, { dx: (r() - .5) * W * .04 * k, dy: (r() - .5) * W * .04 * k }); if (k < .05) return;
      const s = Math.min(W, H) * (.25 + .2 * E.out(clamp01(p * 2))) * k; ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(-.12); ctx.beginPath(); starPath(ctx, 0, 0, s * 1.6, -PI / 2, 12, .65); ctx.fillStyle = '#ffd23f'; ctx.fill(); ctx.lineWidth = Math.max(2, s * .06); ctx.strokeStyle = '#111'; ctx.stroke();
      ctx.font = `900 ${Math.round(s * .9)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = s * .12; ctx.strokeStyle = '#111'; ctx.strokeText('POW!', 0, 0); ctx.fillStyle = '#ff3b3b'; ctx.fillText('POW!', 0, 0); ctx.restore(); }) },
];

/* ---------- batch 8: GPU transitions (WebGL2 shaders in js/effects.js; crossfade where WebGL2 is missing) ---------- */
const gpu = (key, body) => T0((ctx, A, B, p, W, H) => { const c = glTransition(key, body, A, B, p, W, H); if (c) ctx.drawImage(c, 0, 0, W, H); else fade(ctx, A, B, p, W, H); });
const D_ = '(u - .5) * ASP', RMAX = 'length(.5 * ASP)';
const GL_TR = [
  ['waterDrop', 'Water drop', `vec4 tr(vec2 u, float p){ vec2 d = ${D_}; float r = length(d) / ${RMAX}, w = p * 1.25;
    float k = sin((r - w) * 45.) * .025 * bell(p) * smoothstep(.35, 0., abs(r - w)); vec2 uu = u + normalize(d + 1e-5) / ASP * k;
    return ab(uu, 1. - smoothstep(w - .2, w, r)); }`],
  ['liquid', 'Liquid', `vec4 tr(vec2 u, float p){ float n = fbm(u * ASP * 3.) / .94; float m = thr(n, p, .08);
    vec4 c = ab(u + vec2(0., (1. - m) * m * .04), m); float e = exp(-pow((m - .5) / .18, 2.)) * bell(p); return c + vec4(.2, .7, 1., 1.) * e * .35 * c.a; }`],
  ['paperBurn', 'Paper burn', `vec4 tr(vec2 u, float p){ float n = clamp(length(${D_}) / ${RMAX} * .65 + fbm(u * ASP * 4.) * .37, 0., 1.);
    float t = p * 1.24 - .12, m = smoothstep(t - .015, t + .015, n); vec4 c = mix(b(u), a(u), m);
    float edge = smoothstep(.07, 0., n - t) * m; c.rgb = mix(c.rgb, vec3(.08, .03, 0.), edge * .9);
    float glow = exp(-pow((n - t) / .02, 2.)); c.rgb += vec3(1., .55, .1) * glow * bell(p); return c; }`],
  ['vortex', 'Vortex', `vec4 tr(vec2 u, float p){ vec2 d = ${D_}; float r = length(d) / ${RMAX}, k = bell(p) * 7. * (1. - r) * (1. - r);
    vec2 uu = .5 + rot(k) * d / ASP; uu = .5 + (uu - .5) * (1. - .25 * bell(p)); return ab(uu, smoothstep(.35, .65, p)); }`],
  ['heatWave', 'Heat wave', `vec4 tr(vec2 u, float p){ float k = bell(p); vec2 uu = u + vec2(sin(u.y * 34. + p * 18.) * .018, sin(u.x * 22. + p * 11.) * .01) * k; return ab(uu, smoothstep(.3, .7, p)); }`],
  ['chromaZoom', 'Colour zoom', `vec4 tr(vec2 u, float p){ float k = bell(p), m = smoothstep(.35, .65, p); vec2 d = u - .5;
    vec4 r = ab(.5 + d / (1. + .12 * k), m), g = ab(.5 + d / (1. + .24 * k), m), bb = ab(.5 + d / (1. + .36 * k), m); return vec4(r.r, g.g, bb.b, max(r.a, max(g.a, bb.a))); }`],
  ['wind', 'Wind', `vec4 tr(vec2 u, float p){ float n = hash(vec2(floor(u.y * R.y / 3.), 7.)), xe = p * 1.7 - .2 - .2 * n, m = clamp((xe - u.x) / .1, 0., 1.);
    return mix(a(u - vec2(m * .08, 0.)), b(u), m); }`],
  ['hexagons', 'Hexagons', `vec4 hexc(vec2 q){ vec2 s = vec2(1., 1.7320508), h = s * .5; vec2 x = mod(q, s) - h, y = mod(q - h, s) - h; vec2 g = dot(x, x) < dot(y, y) ? x : y; return vec4(g, q - g); }
    vec4 tr(vec2 u, float p){ vec4 h = hexc(${D_} * 9.); float dd = length(h.zw / 9.) / ${RMAX}, q = clamp(p * 1.8 - dd * .7, 0., 1.);
    vec2 g = abs(h.xy); float hd = max(dot(g, vec2(.5, .8660254)), g.x) / .5; return ab(u, smoothstep(q * 1.08 - .02, q * 1.08 - .06, hd) * step(.001, q)); }`],
  ['squaresWave', 'Square wave', `vec4 tr(vec2 u, float p){ vec2 q = u * ASP * 8.; vec2 c = floor(q), f = fract(q) - .5; float nx = floor(ASP.x * 8.), ny = floor(ASP.y * 8.);
    float dl = (c.x + c.y) / (nx + ny + 1.), k = clamp(p * 2. - dl, 0., 1.); return ab(u, step(max(abs(f.x), abs(f.y)), k * .501) * step(.001, k)); }`],
  ['shatter', 'Shatter', `vec4 tr(vec2 u, float p){ vec2 q = u * ASP * 5.; vec2 g = floor(q), f = fract(q); float md = 9., md2 = 9.; vec2 id = vec2(0.), cc = vec2(0.);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){ vec2 o = vec2(i, j), r = vec2(hash(g + o), hash(g + o + 3.1)); vec2 pt = o + .15 + .7 * r - f; float d = dot(pt, pt);
      if (d < md){ md2 = md; md = d; id = g + o; cc = (g + o + .15 + .7 * r) / (ASP * 5.); } else if (d < md2) md2 = d; }
    float r = hash(id + 9.), sw = step(r * .8 + .1, p), k = bell(p); vec2 off = (cc - .5) * k * .07;
    vec4 c = ab(u - off, sw); float edge = smoothstep(.06, 0., sqrt(md2) - sqrt(md)) * k; return mix(c, vec4(1.), edge * .6); }`],
  ['wavyWipe', 'Wavy wipe', `vec4 tr(vec2 u, float p){ float xe = p * 1.3 - .15 + sin(u.y * 12. + p * 7.) * .05, m = smoothstep(-.01, .01, xe - u.x);
    vec4 c = ab(u, m); float l = exp(-pow((xe - u.x) / .012, 2.)) * bell(p); return c + vec4(1., .9, .5, 1.) * l * .8; }`],
  ['fisheye', 'Fisheye', `vec4 tr(vec2 u, float p){ vec2 d = u - .5; float r2 = dot(d * ASP, d * ASP) / dot(.5 * ASP, .5 * ASP), k = bell(p) * 1.6; return ab(.5 + d / (1. + k * (1. - r2) * .6), smoothstep(.4, .6, p)); }`],
  ['tunnel', 'Tunnel', `vec4 tr(vec2 u, float p){ vec2 d = ${D_}; float k = bell(p), r = length(d); vec2 dd = rot(k * r * 3.) * d * (1. - .6 * k * (1. - r)); return ab(.5 + dd / ASP, smoothstep(.45, .55, p)); }`],
  ['spiral', 'Spiral', `vec4 tr(vec2 u, float p){ vec2 d = ${D_}; float an = atan(d.y, d.x) / (2. * PI) + .5, r = length(d) / ${RMAX}; float vv = clamp(fract(an + r * 1.2) * .75 + r * .25, 0., 1.); return ab(u, thr(vv, p, .02)); }`],
  ['tvStatic', 'TV static', `vec4 tr(vec2 u, float p){ float n = hash(floor(u * R / 2.) + floor(p * 40.) * 13.1), k = pow(bell(p), .6); vec4 c = ab(u, step(.5, p)); return mix(c, vec4(vec3(n), 1.), k * .85); }`],
  ['colorMelt', 'Colour melt', `vec4 tr(vec2 u, float p){ vec4 A = a(u), B = b(u); float l = lum(A.rgb);
    vec3 m = clamp(vec3(p * 1.6 - l * .6, p * 1.9 - .3 - l * .6, p * 2.2 - .6 - l * .6), 0., 1.); return vec4(mix(A.rgb, B.rgb, m), 1.); }`],
  ['inkBlot', 'Ink blot', `vec4 tr(vec2 u, float p){ float n = clamp(fbm(u * ASP * 3.) * .55 + length(${D_}) / ${RMAX} * .45, 0., 1.);
    float t1 = p * 1.5 - .1, t2 = p * 1.5 - .45, ink = smoothstep(t1 + .02, t1 - .02, n), m = smoothstep(t2 + .02, t2 - .02, n);
    return mix(mix(a(u), vec4(.05, .05, .1, 1.), ink), b(u), m); }`],
  ['sunburst', 'Sunburst', `vec4 tr(vec2 u, float p){ vec2 d = ${D_}; float an = atan(d.y, d.x), ray = abs(fract(an * 16. / (2. * PI)) - .5) * 2., r = length(d) / ${RMAX};
    float m = thr(clamp(ray * .4 + r * .6, 0., 1.), p, .03); vec4 c = ab(u, m); float e = exp(-pow((m - .5) / .25, 2.)) * bell(p); return c + vec4(1., .8, .2, 1.) * e * .5; }`],
  ['lens', 'Magnifier', `vec4 tr(vec2 u, float p){ vec2 c = vec2(mix(.15, .5, p), .5); vec2 dd = (u - c) * ASP; float Rr = p * 1.3 * ${RMAX}, r = length(dd), k = (1. - p) * .45;
    float f = 1. - k * (1. - clamp(r / max(Rr, 1e-4), 0., 1.)); vec2 uu = c + (u - c) * f; float m = smoothstep(Rr, Rr - .01, r);
    vec4 o2 = mix(a(u), b(uu), m); float ring = exp(-pow((r - Rr) / .006, 2.)) * bell(p); return o2 + vec4(1.) * ring * .7; }`],
  ['bloom', 'Bloom', `vec4 tr(vec2 u, float p){ float k = bell(p), m = smoothstep(.3, .7, p); vec4 c = ab(u, m), g = vec4(0.);
    for (int i = 0; i < 12; i++){ float t = float(i) * 2.39996, rr = sqrt((float(i) + .5) / 12.) * .04 * k; g += ab(u + vec2(cos(t), sin(t)) * rr / ASP, m); }
    g /= 12.; return min(c + g * k * .9 * smoothstep(.3, 1., lum(g.rgb)) + vec4(vec3(.15 * k), 0.), vec4(1.)); }`],
  ['pageWave', 'Wave page', `vec4 tr(vec2 u, float p){ float k = bell(p); vec2 uu = u + vec2(0., sin(u.x * 10. + p * 8.) * .035 * k); float xe = p * 1.3, m = smoothstep(u.x, u.x + .15, xe); return ab(uu, m); }`],
  ['pixelRain', 'Pixel rain', `vec4 tr(vec2 u, float p){ float col = floor(u.x * 28.), r = hash(vec2(col, 3.)), ye = p * 1.75 - r * .6; float m = smoothstep(1. - u.y, 1. - u.y + .03, ye);
    return mix(a(u), b(u + vec2(0., (1. - m) * .05)), m); }`],
  ['pinch', 'Pinch', `vec4 tr(vec2 u, float p){ vec2 d = u - .5; float r = length(d * ASP) / ${RMAX}, k = bell(p); return ab(.5 + d * (1. + k * .9 * (1. - r)), smoothstep(.4, .6, p)); }`],
  ['frost', 'Frost', `vec4 tr(vec2 u, float p){ float k = bell(p); vec2 j = (vec2(hash(u * R), hash(u * R + 3.7)) - .5) * .06 * k; vec4 c = ab(u + j, smoothstep(.3, .7, p)); return mix(c, vec4(.85, .92, 1., 1.), k * .25); }`],
  ['crosshatch', 'Crosshatch', `vec4 tr(vec2 u, float p){ vec2 q = u * ASP; float v1 = abs(fract((q.x + q.y) * 14.) - .5) * 2., v2 = abs(fract((q.x - q.y) * 14.) - .5) * 2.; return ab(u, thr(clamp(min(v1, v2) * .7 + u.x * .3, 0., 1.), p, .03)); }`],
  ['melt', 'Melt', `vec4 tr(vec2 u, float p){ float col = floor(u.x * 40.), r = hash(vec2(col, 11.)) * .5 + noise(vec2(u.x * 6., 2.)) * .5, ys = max(0., p * 1.8 - r * .6) ;
    float sy = u.y + ys * ys * 1.2; return sy > 1. ? b(u) : a(vec2(u.x, sy)); }`],
];

export const TRANSITIONS = [
  // ---- Basic
  { id: 'fade', name: 'Fade', cat: 'Basic', render: fade },
  { id: 'dissolve', name: 'Dissolve', cat: 'Basic', render: (ctx, A, B, p, W, H, h) => { full(ctx, A, W, H); if (p <= 0) return; if (p >= 1) return full(ctx, B, W, H);
      const t = h.tmp(0, W, H), x = t.getContext('2d'); full(x, B, W, H); x.globalCompositeOperation = 'destination-in'; x.imageSmoothingEnabled = false; x.drawImage(h.noiseMask(p), 0, 0, W, H); ctx.drawImage(t, 0, 0); } },
  { id: 'black', name: 'Fade to black', cat: 'Basic', render: (ctx, A, B, p, W, H) => { full(ctx, p < .5 ? A : B, W, H); ctx.globalAlpha = 1 - Math.abs(2 * p - 1); black(ctx, W, H); ctx.globalAlpha = 1; } },
  { id: 'white', name: 'Fade to white', cat: 'Basic', render: (ctx, A, B, p, W, H) => { full(ctx, p < .5 ? A : B, W, H); ctx.globalAlpha = 1 - Math.abs(2 * p - 1); black(ctx, W, H, '#fff'); ctx.globalAlpha = 1; } },
  { id: 'blur', name: 'Blur', cat: 'Basic', render: (ctx, A, B, p, W, H) => { const b = bell(p) * Math.min(W, H) * .035; ctx.filter = b > .3 ? `blur(${b.toFixed(1)}px)` : 'none'; fade(ctx, A, B, p, W, H); ctx.filter = 'none'; } },
  // ---- Slide (B slides over A) and Push (B pushes A away)
  { id: 'slideL', name: 'Slide left', cat: 'Slide', render: slide(1, 0) },
  { id: 'slideR', name: 'Slide right', cat: 'Slide', render: slide(-1, 0) },
  { id: 'slideU', name: 'Slide up', cat: 'Slide', render: slide(0, 1) },
  { id: 'slideD', name: 'Slide down', cat: 'Slide', render: slide(0, -1) },
  { id: 'pushL', name: 'Push left', cat: 'Slide', render: push(1, 0) },
  { id: 'pushR', name: 'Push right', cat: 'Slide', render: push(-1, 0) },
  { id: 'pushU', name: 'Push up', cat: 'Slide', render: push(0, 1) },
  { id: 'pushD', name: 'Push down', cat: 'Slide', render: push(0, -1) },
  // ---- Zoom
  { id: 'zoomIn', name: 'Zoom in', cat: 'Zoom', render: (ctx, A, B, p, W, H) => { const e = ease(p); black(ctx, W, H); place(ctx, B, W, H, { s: .6 + .4 * e, a: smooth(0, .6, p) }); place(ctx, A, W, H, { s: 1 + 1.6 * e, a: 1 - e }); } },
  { id: 'zoomOut', name: 'Zoom out', cat: 'Zoom', render: (ctx, A, B, p, W, H) => { const e = ease(p); black(ctx, W, H); place(ctx, B, W, H, { s: 1.8 - .8 * e, a: e }); place(ctx, A, W, H, { s: 1 - .6 * e, a: 1 - smooth(.4, 1, p) }); } },
  { id: 'zoomSpin', name: 'Zoom spin', cat: 'Zoom', render: (ctx, A, B, p, W, H) => { const e = ease(p); black(ctx, W, H); place(ctx, B, W, H, { s: 1.6 - .6 * e, rot: -(1 - e) * PI / 2, a: e }); place(ctx, A, W, H, { s: 1 + e, rot: e * PI / 2, a: 1 - e }); } },
  // ---- Wipe
  { id: 'wipeR', name: 'Wipe right', cat: 'Wipe', render: wipe((e, W, H) => [0, 0, e * W, H]) },
  { id: 'wipeL', name: 'Wipe left', cat: 'Wipe', render: wipe((e, W, H) => [W * (1 - e), 0, W * e + 1, H]) },
  { id: 'wipeD', name: 'Wipe down', cat: 'Wipe', render: wipe((e, W, H) => [0, 0, W, e * H]) },
  { id: 'wipeU', name: 'Wipe up', cat: 'Wipe', render: wipe((e, W, H) => [0, H * (1 - e), W, H * e + 1]) },
  { id: 'clock', name: 'Clock', cat: 'Wipe', render: (ctx, A, B, p, W, H) => { full(ctx, A, W, H); if (p <= 0) return; if (p >= 1) return full(ctx, B, W, H);
      clipDraw(ctx, B, W, H, c => { c.moveTo(W / 2, H / 2); c.arc(W / 2, H / 2, Math.hypot(W, H), -PI / 2, -PI / 2 + 2 * PI * p); c.closePath(); }); } },
  { id: 'box', name: 'Box', cat: 'Wipe', render: wipe((e, W, H) => [W / 2 * (1 - e), H / 2 * (1 - e), W * e, H * e]) },
  // ---- Spin & turn
  { id: 'spin', name: 'Spin', cat: 'Spin', render: (ctx, A, B, p, W, H) => { black(ctx, W, H); if (p < .5) { const e = E.in(p * 2); place(ctx, A, W, H, { s: 1 - e, rot: e * PI }); } else { const e = E.out((p - .5) * 2); place(ctx, B, W, H, { s: e, rot: -(1 - e) * PI }); } } },
  { id: 'flip', name: 'Flip', cat: 'Spin', render: (ctx, A, B, p, W, H) => { black(ctx, W, H); const c = Math.cos(ease(p) * PI); if (c > 0) place(ctx, A, W, H, { sx: c, sy: 1 - .08 * bell(p) }); else place(ctx, B, W, H, { sx: -c, sy: 1 - .08 * bell(p) }); } },
  { id: 'page', name: 'Page turn', cat: 'Spin', render: (ctx, A, B, p, W, H) => {
      const e = ease(p), xf = W * (1 - e), w = Math.min(xf, (W - xf) * .5);
      full(ctx, B, W, H); if (xf <= 0) return; if (xf >= W) return full(ctx, A, W, H);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, xf - w, H); ctx.clip(); full(ctx, A, W, H); ctx.restore();
      if (w > .5) { // the lifted page: mirrored back side with a soft shading
        ctx.save(); ctx.beginPath(); ctx.rect(xf - w, 0, w, H); ctx.clip(); ctx.translate(2 * xf - w, 0); ctx.scale(-1, 1); full(ctx, A, W, H); ctx.restore();
        const g = ctx.createLinearGradient(xf - w, 0, xf, 0); g.addColorStop(0, 'rgba(255,255,255,.55)'); g.addColorStop(.7, 'rgba(255,255,255,.25)'); g.addColorStop(1, 'rgba(0,0,0,.35)');
        ctx.fillStyle = g; ctx.fillRect(xf - w, 0, w, H);
        const s = ctx.createLinearGradient(xf, 0, xf + w * .6, 0); s.addColorStop(0, 'rgba(0,0,0,.45)'); s.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = s; ctx.fillRect(xf, 0, w * .6, H);
      } } },
  // ---- Light
  { id: 'flash', name: 'Flash', cat: 'Light', render: (ctx, A, B, p, W, H) => { full(ctx, p < .5 ? A : B, W, H); ctx.globalAlpha = Math.pow(1 - Math.abs(2 * p - 1), 2.2); black(ctx, W, H, '#fff'); ctx.globalAlpha = 1; } },
  { id: 'leak', name: 'Light leak', cat: 'Light', render: (ctx, A, B, p, W, H) => { fade(ctx, A, B, smooth(.2, .8, p), W, H); const k = bell(p); if (k < .01) return;
      const g = ctx.createRadialGradient(W * (.2 + .6 * p), H * .3, 0, W * (.2 + .6 * p), H * .3, Math.hypot(W, H) * .7); g.addColorStop(0, `rgba(255,190,90,${.95 * k})`); g.addColorStop(.5, `rgba(255,90,40,${.5 * k})`); g.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; } },
  // ---- Glitch
  { id: 'glitch', name: 'Glitch', cat: 'Glitch', render: (ctx, A, B, p, W, H) => { const base = p < .5 ? A : B, other = p < .5 ? B : A, k = bell(p); full(ctx, base, W, H); if (k < .02) return;
      const r = rng(Math.floor(p * 24) + 3), n = 10;
      for (let i = 0; i < n; i++) { const y = r() * H, h = (r() * .08 + .01) * H, dx = (r() - .5) * W * .25 * k, src = r() < .3 * k ? other : base; ctx.drawImage(src, 0, y, W, h, dx, y, W, h); }
      ctx.globalAlpha = .25 * k; ctx.fillStyle = r() < .5 ? '#0ff' : '#f0f'; ctx.fillRect(0, r() * H, W, H * .03 * k); ctx.globalAlpha = 1; } },
  { id: 'rgb', name: 'RGB split', cat: 'Glitch', render: (ctx, A, B, p, W, H, h) => { const d = bell(p) * Math.min(W, H) * .04; if (d < .5) return fade(ctx, A, B, p, W, H);
      const base = h.tmp(0, W, H), bx = base.getContext('2d'); fade(bx, A, B, smooth(.3, .7, p), W, H);
      black(ctx, W, H); ctx.globalCompositeOperation = 'lighter';
      [['#f00', -d], ['#0f0', 0], ['#00f', d]].forEach(([col, off], i) => { const t = h.tmp(1 + i, W, H), x = t.getContext('2d'); x.drawImage(base, 0, 0); x.globalCompositeOperation = 'multiply'; x.fillStyle = col; x.fillRect(0, 0, W, H); ctx.drawImage(t, off, 0); });
      ctx.globalCompositeOperation = 'source-over'; } },
  { id: 'shake', name: 'Shake', cat: 'Glitch', render: (ctx, A, B, p, W, H) => { const k = bell(p), r = rng(Math.floor(p * 40) + 11), amp = Math.min(W, H) * .05 * k;
      if (k < .01) return fade(ctx, A, B, p, W, H); black(ctx, W, H); const a = smooth(.35, .65, p), o = { s: 1 + .12 * k, dx: (r() - .5) * 2 * amp, dy: (r() - .5) * 2 * amp, rot: (r() - .5) * .06 * k };
      place(ctx, A, W, H, o); place(ctx, B, W, H, { ...o, a }); } },
  { id: 'pixel', name: 'Pixelate', cat: 'Glitch', render: (ctx, A, B, p, W, H, h) => { const src = p < .5 ? A : B, blk = Math.round(bell(p) * Math.min(W, H) / 18);
      if (blk <= 1) return full(ctx, src, W, H); const w = Math.max(1, Math.round(W / blk)), hh = Math.max(1, Math.round(H / blk)), t = h.tmp(0, w, hh), x = t.getContext('2d');
      x.drawImage(src, 0, 0, w, hh); ctx.imageSmoothingEnabled = false; ctx.drawImage(t, 0, 0, w, hh, 0, 0, W, H); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; } },
  // ---- Shapes
  { id: 'circle', name: 'Circle', cat: 'Shapes', render: revealShape((c, x, y, R) => c.arc(x, y, R * .5, 0, 2 * PI)) },
  { id: 'heart', name: 'Heart', cat: 'Shapes', render: revealShape((c, x, y, R) => { const s = R / 16; c.moveTo(x, y + 7 * s);
      for (let i = 0; i <= 60; i++) { const t = i / 60 * 2 * PI, hx = 16 * Math.pow(Math.sin(t), 3), hy = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t); c.lineTo(x + hx * s * .9, y - hy * s * .9 + 2 * s); } }) },
  { id: 'star', name: 'Star', cat: 'Shapes', render: revealShape((c, x, y, R) => { for (let i = 0; i < 10; i++) { const r = i % 2 ? R * .45 : R, a = -PI / 2 + i * PI / 5; c.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)); } c.closePath(); }) },
  { id: 'diamond', name: 'Diamond', cat: 'Shapes', render: revealShape((c, x, y, R) => { c.moveTo(x, y - R * .7); c.lineTo(x + R * .7, y); c.lineTo(x, y + R * .7); c.lineTo(x - R * .7, y); c.closePath(); }) },
  // ---- Pattern
  { id: 'blindsH', name: 'Blinds', cat: 'Pattern', render: blinds(false) },
  { id: 'blindsV', name: 'Blinds side', cat: 'Pattern', render: blinds(true) },
  { id: 'checker', name: 'Checker', cat: 'Pattern', render: (ctx, A, B, p, W, H) => { full(ctx, A, W, H); if (p <= 0) return; if (p >= 1) return full(ctx, B, W, H);
      const nx = 6, ny = Math.max(4, Math.round(6 * H / W)), cw = W / nx, ch = H / ny;
      clipDraw(ctx, B, W, H, c => { for (let i = 0; i < nx; i++) for (let j = 0; j < ny; j++) { const q = Math.min(1, Math.max(0, p * 1.6 - (i + j) / (nx + ny - 2) * .6)); if (q > 0) { const e = ease(q); c.rect(i * cw + cw * (1 - e) / 2, j * ch + ch * (1 - e) / 2, cw * e + .5, ch * e + .5); } } }); } },
  // ---- Warp
  { id: 'ripple', name: 'Ripple', cat: 'Warp', render: (ctx, A, B, p, W, H, h) => { const amp = bell(p) * W * .05; if (amp < .3) return fade(ctx, A, B, p, W, H);
      const t = h.tmp(0, W, H); fade(t.getContext('2d'), A, B, smooth(.25, .75, p), W, H); const sh = Math.max(2, Math.round(H / 240));
      for (let y = 0; y < H; y += sh) ctx.drawImage(t, 0, y, W, sh, amp * Math.sin(y / H * 18 + p * 9), y, W, sh); } },
  { id: 'swirl', name: 'Swirl', cat: 'Warp', render: (ctx, A, B, p, W, H, h) => { const k = bell(p); if (k < .01) return fade(ctx, A, B, p, W, H);
      const t = h.tmp(0, W, H); fade(t.getContext('2d'), A, B, smooth(.3, .7, p), W, H); const R = Math.hypot(W, H) / 2, n = 18;
      for (let i = 0; i < n; i++) { const r = R * (1 - i / n), ang = k * 2.2 * PI * Math.pow(i / n, 1.4) * (p < .5 ? 1 : 1);
        ctx.save(); ctx.beginPath(); ctx.arc(W / 2, H / 2, r, 0, 2 * PI); ctx.clip(); ctx.translate(W / 2, H / 2); ctx.rotate(ang); ctx.drawImage(t, -W / 2, -H / 2, W, H); ctx.restore(); } } },
  // ===== second set (Batch 3) =====
  // ---- Zoom
  { id: 'zoomBlurIn', name: 'Zoom blur in', cat: 'Zoom', render: T0((ctx, A, B, p, W, H) => { const a = p < .5, q = a ? E.in(2 * p) : E.in(2 * (1 - p)); zoomSmear(ctx, a ? A : B, W, H, 1 + .9 * q, .35 * bell(p)); }) },
  { id: 'zoomBlurOut', name: 'Zoom blur out', cat: 'Zoom', render: T0((ctx, A, B, p, W, H) => { const a = p < .5, q = a ? E.in(2 * p) : E.in(2 * (1 - p)); zoomSmear(ctx, a ? A : B, W, H, a ? 1 - .45 * q : 1 + 1.2 * q, -.3 * bell(p)); }) },
  { id: 'crossZoom', name: 'Cross zoom', cat: 'Zoom', render: T0((ctx, A, B, p, W, H, h) => { const e = ease(p), bl = .3 * bell(p); zoomSmear(ctx, A, W, H, 1 + 2 * e, bl); const t = smooth(.25, .75, p); if (t > 0) { const k = h.tmp(0, W, H); zoomSmear(k.getContext('2d'), B, W, H, 1 + 2 * (1 - e), bl); ctx.globalAlpha = t; ctx.drawImage(k, 0, 0); ctx.globalAlpha = 1; } }) },
  { id: 'zoomPunch', name: 'Zoom punch', cat: 'Zoom', render: T0((ctx, A, B, p, W, H) => { const a = p < .5, q = a ? E.in(2 * p) : E.in(2 * (1 - p)); black(ctx, W, H); place(ctx, a ? A : B, W, H, { s: 1 + .35 * q }); ctx.globalAlpha = .7 * Math.pow(bell(p), 8); black(ctx, W, H, '#fff'); ctx.globalAlpha = 1; }) },
  // ---- Motion
  { id: 'whipL', name: 'Whip left', cat: 'Motion', render: whip(1, 0) },
  { id: 'whipR', name: 'Whip right', cat: 'Motion', render: whip(-1, 0) },
  { id: 'whipU', name: 'Whip up', cat: 'Motion', render: whip(0, 1) },
  { id: 'whipD', name: 'Whip down', cat: 'Motion', render: whip(0, -1) },
  { id: 'spinBlur', name: 'Spin blur', cat: 'Motion', render: T0((ctx, A, B, p, W, H) => { const a = p < .5, q = a ? E.in(2 * p) : -E.in(2 * (1 - p)), bl = .5 * bell(p); black(ctx, W, H); smear(ctx, a ? A : B, W, H, 11, k => ({ rot: q * PI + k * bl, s: 1 + .35 * bell(p) })); }) },
  { id: 'bounceL', name: 'Bounce in', cat: 'Motion', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); ctx.drawImage(B, (1 - E.bounce(p)) * W, 0, W, H); }) },
  { id: 'bounceD', name: 'Bounce drop', cat: 'Motion', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); ctx.drawImage(B, 0, -(1 - E.bounce(p)) * H, W, H); }) },
  // ---- 3D
  { id: 'cubeL', name: 'Cube left', cat: '3D', render: cube(true, 1) },
  { id: 'cubeR', name: 'Cube right', cat: '3D', render: cube(true, -1) },
  { id: 'cubeU', name: 'Cube up', cat: '3D', render: cube(false, 1) },
  { id: 'cubeD', name: 'Cube down', cat: '3D', render: cube(false, -1) },
  { id: 'door', name: 'Door open', cat: '3D', render: T0((ctx, A, B, p, W, H) => { const e = ease(p), ph = e * PI / 2, D = 2.4 * W, c = Math.cos(ph), s = Math.sin(ph);
      black(ctx, W, H); place(ctx, B, W, H, { s: .82 + .18 * e }); ctx.globalAlpha = .55 * (1 - e); black(ctx, W, H); ctx.globalAlpha = 1;
      const hinge = d => { const f = D / (D + d * s); return [d * c * f, f]; };   // d = distance from the hinge; the doors swing away into the picture
      strips(ctx, A, W, H, true, u => hinge(u * W), .45 * (1 - c), 20, 0, .5);
      strips(ctx, A, W, H, true, u => { const [a, f] = hinge((1 - u) * W); return [W - a, f]; }, .45 * (1 - c), 20, .5, 1); }) },
  { id: 'flip3d', name: '3D flip', cat: '3D', render: T0((ctx, A, B, p, W, H) => { black(ctx, W, H); const e = ease(p), L = H, D = 2.4 * L, a = e < .5, th = a ? e * PI : (e - 1) * PI, c = Math.cos(th), s = Math.sin(th);
      strips(ctx, a ? A : B, W, H, false, u => { const y = -L / 2 + L * u, yy = y * c, z = y * s, f = D / (D + z); return [L / 2 + yy * f, f]; }, .5 * (1 - c), 40); }) },
  { id: 'squeeze', name: 'Squeeze', cat: '3D', render: T0((ctx, A, B, p, W, H) => { black(ctx, W, H); if (p < .5) place(ctx, A, W, H, { sx: 1 - E.in(2 * p), sy: 1 }); else place(ctx, B, W, H, { sx: E.out(2 * p - 1), sy: 1 }); }) },
  { id: 'stretch', name: 'Stretch', cat: '3D', render: T0((ctx, A, B, p, W, H) => { black(ctx, W, H); const e = ease(p); place(ctx, A, W, H, { sx: 1 + 2.5 * e, sy: 1 - .3 * e, a: 1 - smooth(.3, .7, p) }); place(ctx, B, W, H, { sx: 1 + 2.5 * (1 - e), sy: 1 - .3 * (1 - e), a: smooth(.3, .7, p) }); }) },
  // ---- Split
  { id: 'splitH', name: 'Split open', cat: 'Split', render: T0((ctx, A, B, p, W, H) => { const e = ease(p); place(ctx, B, W, H, { s: 1.12 - .12 * e }); ctx.drawImage(A, 0, 0, W, H / 2, 0, -e * H / 2, W, H / 2); ctx.drawImage(A, 0, H / 2, W, H / 2, 0, H / 2 + e * H / 2, W, H / 2); }) },
  { id: 'splitV', name: 'Split side', cat: 'Split', render: T0((ctx, A, B, p, W, H) => { const e = ease(p); place(ctx, B, W, H, { s: 1.12 - .12 * e }); ctx.drawImage(A, 0, 0, W / 2, H, -e * W / 2, 0, W / 2, H); ctx.drawImage(A, W / 2, 0, W / 2, H, W / 2 + e * W / 2, 0, W / 2, H); }) },
  { id: 'split4', name: 'Four corners', cat: 'Split', render: T0((ctx, A, B, p, W, H) => { const e = ease(p); place(ctx, B, W, H, { s: 1.12 - .12 * e });
      for (const [i, j] of [[0, 0], [1, 0], [0, 1], [1, 1]]) ctx.drawImage(A, i * W / 2, j * H / 2, W / 2, H / 2, i * W / 2 + (i ? 1 : -1) * e * W / 2, j * H / 2 + (j ? 1 : -1) * e * H / 2, W / 2, H / 2); }) },
  { id: 'shutter', name: 'Shutter', cat: 'Split', render: T0((ctx, A, B, p, W, H) => { full(ctx, p < .5 ? A : B, W, H); const c = E.inOut(1 - Math.abs(2 * p - 1)) * H / 2 + .5;
      ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, c); ctx.fillRect(0, H - c, W, c); ctx.fillStyle = 'rgba(255,255,255,.5)'; ctx.fillRect(0, c - 2, W, 2); ctx.fillRect(0, H - c, W, 2); }) },
  // ---- Pattern
  { id: 'mosaic', name: 'Mosaic', cat: 'Pattern', render: T0((ctx, A, B, p, W, H) => { black(ctx, W, H); const nx = 7, ny = Math.max(5, Math.round(nx * H / W)), cw = W / nx, ch = H / ny, r = rng(91);
      for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const q = clamp01((p - r() * .55) / .45), c = Math.cos(q * PI), img = c >= 0 ? A : B, k = Math.abs(c); if (k < .02) continue;
        ctx.drawImage(img, i * cw, j * ch, cw, ch, i * cw + cw * (1 - k) / 2, j * ch, cw * k + .5, ch + .5); } }) },
  { id: 'polka', name: 'Polka dots', cat: 'Pattern', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); const nx = 6, cw = W / nx, ny = Math.ceil(H / cw), md = Math.hypot(nx, ny) / 2;
      clipDraw(ctx, B, W, H, c => { for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const d = Math.hypot(i + .5 - nx / 2, j + .5 - ny / 2) / md, q = clamp01(p * 1.3 - d * .35); if (q > 0) { const x = (i + .5) * cw, y = (j + .5) * cw; c.moveTo(x, y); c.arc(x, y, E.out(q) * cw * .74, 0, 2 * PI); } } }); }) },
  // ---- Wipe
  { id: 'wipeDiag', name: 'Diagonal wipe', cat: 'Wipe', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); const e = 2 * ease(p); clipDraw(ctx, B, W, H, c => { c.moveTo(-1, -1); c.lineTo(e * W + 1, -1); c.lineTo(-1, e * H + 1); c.closePath(); }); }) },
  { id: 'radial', name: 'Radial', cat: 'Wipe', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); const e = ease(p) * PI; clipDraw(ctx, B, W, H, c => { c.moveTo(W / 2, H / 2); c.arc(W / 2, H / 2, Math.hypot(W, H), -PI / 2 - e, -PI / 2 + e); c.closePath(); }); }) },
  { id: 'ink', name: 'Ink', cat: 'Wipe', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); const e = ease(p), r = rng(5), n = 40, edge = y => (e * 1.45 - .25) * W + Math.sin(y / H * 13 + 2) * .06 * W + Math.sin(y / H * 31) * .03 * W;
      clipDraw(ctx, B, W, H, c => { c.moveTo(-1, -1); for (let i = 0; i <= n; i++) { const y = i / n * H; c.lineTo(edge(y), y); } c.lineTo(-1, H + 1); c.closePath();
        for (let i = 0; i < 14; i++) { const y = r() * H, x = edge(y) + r() * .1 * W, rr = (r() * .035 + .01) * W * bell(p); if (rr > .5) { c.moveTo(x + rr, y); c.arc(x, y, rr, 0, 2 * PI); } } }); }) },
  { id: 'brush', name: 'Brush', cat: 'Wipe', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); const n = 5, bh = H / n;
      clipDraw(ctx, B, W, H, c => { for (let k = 0; k < n; k++) { const q = E.inOut(clamp01(p * 1.8 - k * .2)); if (q <= 0) continue; const len = q * (W + bh), y = k * bh - bh * .15, hh = bh * 1.3, r = hh / 2;
        if (k % 2 === 0) { c.moveTo(-r, y); c.lineTo(len - r, y); c.arc(len - r, y + r, r, -PI / 2, PI / 2); c.lineTo(-r, y + hh); c.closePath(); }
        else { const x0 = W - len + r; c.moveTo(W + r, y); c.lineTo(x0, y); c.arc(x0, y + r, r, -PI / 2, PI / 2, true); c.lineTo(W + r, y + hh); c.closePath(); } } }); }) },
  // ---- Light
  { id: 'burn', name: 'Burn', cat: 'Light', render: T0((ctx, A, B, p, W, H, h) => { full(ctx, A, W, H); const thr = p * 1.2 - .1;
      const g = h.tmp(0, W, H), gx = g.getContext('2d'), gr = gx.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, '#ffd34d'); gr.addColorStop(1, '#ff4a12'); gx.fillStyle = gr; gx.fillRect(0, 0, W, H);
      gx.globalCompositeOperation = 'destination-in'; gx.drawImage(h.smoothMask(thr + .08, 1), 0, 0, W, H); ctx.drawImage(g, 0, 0);
      const t = h.tmp(1, W, H), x = t.getContext('2d'); full(x, B, W, H); x.globalCompositeOperation = 'destination-in'; x.drawImage(h.smoothMask(thr, 0), 0, 0, W, H); ctx.drawImage(t, 0, 0); }) },
  { id: 'filmBurn', name: 'Film burn', cat: 'Light', render: T0((ctx, A, B, p, W, H) => { fade(ctx, A, B, smooth(.35, .65, p), W, H); const k = Math.pow(bell(p), .8); ctx.globalCompositeOperation = 'lighter';
      for (const [x, y, r, col] of [[.15 + .5 * p, .2, .7, '255,120,30'], [.9 - .4 * p, .7, .6, '255,60,20'], [.5, .45 + .2 * p, .45, '255,220,120']]) { const g = ctx.createRadialGradient(x * W, y * H, 0, x * W, y * H, r * Math.hypot(W, H) / 2); g.addColorStop(0, `rgba(${col},${(.9 * k).toFixed(3)})`); g.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); }
      ctx.globalCompositeOperation = 'source-over'; }) },
  { id: 'lightSweep', name: 'Light sweep', cat: 'Light', render: T0((ctx, A, B, p, W, H) => { fade(ctx, A, B, smooth(.4, .6, p), W, H); const k = bell(p), c = -.3 + 1.6 * p, g = ctx.createLinearGradient(0, 0, W, H);
      const st = (o, a) => g.addColorStop(clamp01(c + o), `rgba(255,255,240,${(a * k).toFixed(3)})`); st(-.25, 0); st(-.06, .5); st(0, .95); st(.06, .5); st(.25, 0);
      ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.globalCompositeOperation = 'source-over'; }) },
  { id: 'lensFlare', name: 'Lens flare', cat: 'Light', render: T0((ctx, A, B, p, W, H) => { fade(ctx, A, B, smooth(.35, .65, p), W, H); const k = bell(p), sx = W * (.1 + .8 * p), sy = H * .22, R = Math.hypot(W, H);
      ctx.globalCompositeOperation = 'lighter'; let g = ctx.createRadialGradient(sx, sy, 0, sx, sy, R * .45); g.addColorStop(0, `rgba(255,250,230,${k.toFixed(3)})`); g.addColorStop(.25, `rgba(255,200,120,${(.45 * k).toFixed(3)})`); g.addColorStop(1, 'rgba(255,160,60,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      [[.6, .05, '120,200,255'], [1.2, .03, '255,140,220'], [1.6, .07, '150,255,170']].forEach(([d, r, col]) => { const x = sx + (W / 2 - sx) * d * 2, y = sy + (H / 2 - sy) * d * 2, rr = r * R; g = ctx.createRadialGradient(x, y, 0, x, y, rr); g.addColorStop(0, `rgba(${col},${(.35 * k).toFixed(3)})`); g.addColorStop(1, `rgba(${col},0)`); ctx.fillStyle = g; ctx.fillRect(x - rr, y - rr, 2 * rr, 2 * rr); });
      ctx.globalCompositeOperation = 'source-over'; }) },
  { id: 'dreamy', name: 'Dreamy', cat: 'Light', render: T0((ctx, A, B, p, W, H, h) => { const k = bell(p), t = h.tmp(0, W, H); fade(t.getContext('2d'), A, B, smooth(.2, .8, p), W, H); const b = k * Math.min(W, H) * .03;
      ctx.filter = b > .3 ? `blur(${(b * .4).toFixed(1)}px)` : 'none'; ctx.drawImage(t, 0, 0); ctx.filter = b > .3 ? `blur(${b.toFixed(1)}px) brightness(1.15)` : 'none'; ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = .6 * k; ctx.drawImage(t, 0, 0); ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over'; ctx.filter = 'none'; }) },
  // ---- Warp
  { id: 'kaleido', name: 'Kaleidoscope', cat: 'Warp', render: T0((ctx, A, B, p, W, H, h) => { const k = smooth(0, .35, p) * (1 - smooth(.65, 1, p)), t = h.tmp(0, W, H); fade(t.getContext('2d'), A, B, smooth(.3, .7, p), W, H); ctx.drawImage(t, 0, 0); if (k < .01) return;
      const n = 8, st = 2 * PI / n, R = Math.hypot(W, H), cx = W / 2, cy = H / 2, rot = p * PI * .6, sq = Math.min(W, H) * .9; ctx.globalAlpha = k;
      for (let i = 0; i < n; i++) { ctx.save(); ctx.translate(cx, cy); ctx.rotate(rot); ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, R, i * st, (i + 1) * st + .01); ctx.closePath(); ctx.clip();
        if (i % 2) { ctx.rotate((i + 1) * st); ctx.scale(1, -1); } else ctx.rotate(i * st);
        ctx.drawImage(t, cx - sq / 2, cy - sq / 2, sq, sq, 0, 0, R * .6, R * .6); ctx.restore(); } ctx.globalAlpha = 1; }) },
  // ---- Kids shapes
  { id: 'cloud', name: 'Cloud', cat: 'Kids', render: revealPath(1.4, (c, x, y, R) => { for (const [dx, dy, r] of [[0, 0, .42], [-.38, .1, .3], [.38, .1, .3], [-.18, -.22, .3], [.2, -.2, .32], [0, .22, .32]]) { c.moveTo(x + dx * R + r * R, y + dy * R); c.arc(x + dx * R, y + dy * R, r * R, 0, 2 * PI); } }) },
  { id: 'bubbles', name: 'Bubbles', cat: 'Kids', render: T0((ctx, A, B, p, W, H) => { full(ctx, A, W, H); const r = rng(17), n = 22, pts = []; for (let i = 0; i < n; i++) pts.push([r() * W, r() * H, r() * .5]);
      const R = Math.hypot(W, H) * .32; clipDraw(ctx, B, W, H, c => { for (const [x, y, d] of pts) { const q = clamp01((p - d * .7) / .5); if (q > 0) { c.moveTo(x + q * R, y); c.arc(x, y, E.out(q) * R, 0, 2 * PI); } } });
      ctx.strokeStyle = `rgba(255,255,255,${(.8 * bell(p)).toFixed(3)})`; ctx.lineWidth = Math.max(1, W / 160); ctx.beginPath(); for (const [x, y, d] of pts) { const q = clamp01((p - d * .7) / .5); if (q > 0 && q < 1) { const rr = E.out(q) * R; ctx.moveTo(x + rr, y); ctx.arc(x, y, rr, 0, 2 * PI); } } ctx.stroke(); }) },
  { id: 'crown', name: 'Crown', cat: 'Kids', render: revealPath(3, (c, x, y, R) => { const w = R * .5, h = R * .36; c.moveTo(x - w, y + h); c.lineTo(x - w, y - h * .6); c.lineTo(x - w * .5, y); c.lineTo(x, y - h); c.lineTo(x + w * .5, y); c.lineTo(x + w, y - h * .6); c.lineTo(x + w, y + h); c.closePath(); }) },
  { id: 'cross', name: 'Cross', cat: 'Kids', render: revealPath(4.5, (c, x, y, R) => { const a = R * .1; c.rect(x - a, y - R * .5, 2 * a, R); c.rect(x - R * .32, y - R * .22, R * .64, 2 * a); }) },
  { id: 'butterfly', name: 'Butterfly', cat: 'Kids', render: revealPath(1.6, (c, x, y, R) => polar(c, x, y, R * .12, t => Math.exp(-Math.sin(t)) - 2 * Math.cos(4 * t) + 1.7, 160)) },
  { id: 'rainbow', name: 'Rainbow', cat: 'Kids', render: T0((ctx, A, B, p, W, H) => { const cols = ['#ff4d4d', '#ff9a1f', '#ffe14d', '#3ddc84', '#1fb6ff', '#5b5bff', '#a259ff'], bw = W * .07, tot = W + bw * cols.length, x0 = ease(p) * (tot + W * .05) - bw * cols.length;
      full(ctx, A, W, H); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, Math.max(0, x0), H); ctx.clip(); full(ctx, B, W, H); ctx.restore(); cols.forEach((col, i) => { ctx.fillStyle = col; ctx.fillRect(x0 + i * bw, 0, bw + .5, H); }); }) },
  // ---- batch 8 (canvas + GPU)
  ...TR2D,
  ...GL_TR.map(([id, name, body]) => ({ id, name, cat: 'Magic', gpu: true, render: gpu(id, body) })),
];
export const TRANSITION_CATS = [...new Set(TRANSITIONS.map(t => t.cat))];
export const transitionById = id => TRANSITIONS.find(t => t.id === id);
export const DEFAULT_TRANSITION_DUR = 0.5, MIN_TRANSITION = 0.1, MAX_TRANSITION = 3;

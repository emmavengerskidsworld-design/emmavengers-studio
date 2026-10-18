/* Transition registry. Every transition is ONE entry: render(ctx, A, B, p, W, H, h)
   A / B = full-frame layers (canvas) of the outgoing / incoming clip, p = progress 0..1.
   Contract (checked by tests): p = 0 looks exactly like A, p = 1 exactly like B.
   The same function draws the live preview, the export, and the animated thumbnails in the picker. */
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
];
export const TRANSITION_CATS = [...new Set(TRANSITIONS.map(t => t.cat))];
export const transitionById = id => TRANSITIONS.find(t => t.id === id);
export const DEFAULT_TRANSITION_DUR = 0.5, MIN_TRANSITION = 0.1, MAX_TRANSITION = 3;

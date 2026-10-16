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
];
export const TRANSITION_CATS = [...new Set(TRANSITIONS.map(t => t.cat))];
export const transitionById = id => TRANSITIONS.find(t => t.id === id);
export const DEFAULT_TRANSITION_DUR = 0.5, MIN_TRANSITION = 0.1, MAX_TRANSITION = 3;

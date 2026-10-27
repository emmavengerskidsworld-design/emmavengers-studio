/* Emmavengers animated watermark: "EMMAVENGERS" shows first, then folds into the E-sword symbol that stays.
   Drawn by renderFrame, so the preview and the exported video are pixel-identical. */
const IM = {}; let ready = null;
export function loadWatermark() {
  if (!ready) ready = Promise.all(['wm-e', 'wm-word'].map(n => fetch(new URL(`../lib/brand/${n}.webp`, import.meta.url)).then(r => r.blob()).then(b => createImageBitmap(b)).then(b => { IM[n] = b; })))
    .catch(e => { ready = null; console.warn('watermark', e); });
  return ready;
}
export const WM_POS = ['tl', 'tc', 'tr', 'ml', 'mc', 'mr', 'bl', 'bc', 'br'];
const FX = { l: 0, c: .5, r: 1 }, FY = { t: 0, m: .5, b: 1 };
export const WM_DEFAULT = { on: true, pos: 'br', cx: null, cy: null, size: 1, opacity: .75 };
const KEY = 'emma.watermark';
export function wmGlobal() { try { return { ...WM_DEFAULT, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch (e) { return { ...WM_DEFAULT }; } }
export function setWmGlobal(w) { try { localStorage.setItem(KEY, JSON.stringify(w)); } catch (e) {} }
export function wmOf(p) { return p && p.watermark ? { ...WM_DEFAULT, ...p.watermark } : wmGlobal(); }
const cl = x => x < 0 ? 0 : x > 1 ? 1 : x;
const eout = x => 1 - (1 - cl(x)) ** 3, eio = x => { x = cl(x); return x < .5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2; }, sm = x => { x = cl(x); return x * x * (3 - 2 * x); };
/** Geometry of the mark at project time t (canvas px). */
export function wmLayout(W, H, w, t) {
  const u = Math.min(W, H), S = 0.105 * u * (w.size || 1), M = 0.04 * u;
  let fx, cx, cy;
  if (w.pos === 'custom' && w.cx != null) { cx = w.cx * W; cy = w.cy * H; fx = w.cx < .34 ? 0 : w.cx > .66 ? 1 : .5; }
  else { const p = WM_POS.includes(w.pos) ? w.pos : 'br'; fx = FX[p[1]]; const fy = FY[p[0]];
    cx = M + S / 2 + fx * (W - 2 * M - S); cy = M + S / 2 + fy * (H - 2 * M - S); }
  const ain = eout(t / .4), col = eio((t - 2.0) / .6), word = IM['wm-word'];
  const k = word ? (S * .62) / word.height : 0, ww = word ? word.width * k : 0, pad = 26 * k, textW = ww - 2 * pad;
  const vis = textW * (1 - col), gap = S * .03, extra = vis > .5 ? gap + vis : 0;
  const sx = cx - S / 2 - extra * fx, sy = cy - S / 2 + (1 - ain) * S * .18;
  const alpha = ain * (w.opacity + (1 - w.opacity) * (1 - sm((t - 2.6) / .4)));
  return { S, sx, sy, cx, cy, k, ww, pad, vis, gap, alpha, col, rect: { x: sx, y: sy, w: S + extra, h: S } };
}
export let wmRect = null;   // last rect drawn on the live preview (for tap / drag)
export function drawWatermark(ctx, W, H, p, t) {
  const w = wmOf(p); const live = ctx.canvas && ctx.canvas.id === 'preview';
  if (!w.on || !IM['wm-e']) { if (live) wmRect = null; if (!IM['wm-e']) loadWatermark(); return; }
  const L = wmLayout(W, H, w, t); if (live) wmRect = { ...L.rect, W, H };
  if (L.alpha <= .002) return;
  ctx.save(); ctx.globalAlpha = L.alpha; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over'; ctx.imageSmoothingQuality = 'high';
  if (L.vis > .5) { const word = IM['wm-word'], wx = L.sx + L.S + L.gap - L.pad, wy = L.sy + (L.S - word.height * L.k) / 2;
    ctx.save(); ctx.beginPath(); ctx.rect(L.sx + L.S * .6, wy - L.S, L.gap + L.pad + L.vis + L.pad * (1 - L.col) + L.S * .4, word.height * L.k + 2 * L.S); ctx.clip();
    ctx.globalAlpha = L.alpha * (1 - .35 * L.col); ctx.drawImage(word, wx, wy, L.ww, word.height * L.k); ctx.restore(); }
  ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowBlur = L.S * .08; ctx.shadowOffsetY = L.S * .03;
  ctx.drawImage(IM['wm-e'], L.sx, L.sy, L.S, L.S);
  ctx.restore();
}
loadWatermark();

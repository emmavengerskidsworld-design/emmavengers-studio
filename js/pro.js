/* Pro editing helpers used by the compositor (preview AND export): crop / straighten, flip, rotate 90,
   masks (linear, mirror, circle, rectangle, heart, star) with feather / invert, blend modes, chroma key options
   and the blurred-background fill. Everything is plain 2D canvas (the chroma key runs in the HD WebGL pipeline). */
import { propAt } from './registry.js';

export const BLEND_MODES = [
  { id: 'normal', name: 'Normal', op: 'source-over' }, { id: 'multiply', name: 'Multiply', op: 'multiply' },
  { id: 'screen', name: 'Screen', op: 'screen' }, { id: 'overlay', name: 'Overlay', op: 'overlay' },
  { id: 'darken', name: 'Darken', op: 'darken' }, { id: 'lighten', name: 'Lighten', op: 'lighten' },
  { id: 'add', name: 'Add', op: 'lighter' }, { id: 'softlight', name: 'Soft light', op: 'soft-light' },
  { id: 'hardlight', name: 'Hard light', op: 'hard-light' }, { id: 'difference', name: 'Difference', op: 'difference' },
  { id: 'dodge', name: 'Colour dodge', op: 'color-dodge' }, { id: 'burn', name: 'Colour burn', op: 'color-burn' },
];
export const blendOp = id => (BLEND_MODES.find(b => b.id === id) || BLEND_MODES[0]).op;
export const MASKS = [
  { id: 'none', name: 'None' }, { id: 'linear', name: 'Linear' }, { id: 'mirror', name: 'Mirror' }, { id: 'circle', name: 'Circle' },
  { id: 'rect', name: 'Rectangle' }, { id: 'heart', name: 'Heart' }, { id: 'star', name: 'Star' },
];
export const MASK_DEFAULTS = { linear: { w: 1, h: 1 }, mirror: { w: 1, h: 0.35 }, circle: { w: 0.6, h: 0.6 }, rect: { w: 0.6, h: 0.45 }, heart: { w: 0.6, h: 0.6 }, star: { w: 0.65, h: 0.65 } };
export const CROP_RATIOS = [
  { id: 'free', name: 'Free', r: 0 }, { id: 'orig', name: 'Original', r: -1 }, { id: '9:16', name: '9:16', r: 9 / 16 }, { id: '16:9', name: '16:9', r: 16 / 9 },
  { id: '1:1', name: '1:1', r: 1 }, { id: '4:5', name: '4:5', r: 4 / 5 }, { id: '4:3', name: '4:3', r: 4 / 3 }, { id: '3:4', name: '3:4', r: 3 / 4 }, { id: '2.35:1', name: '2.35:1', r: 2.35 },
];
export const KEY_DEFAULTS = { color: '#00ff00', strength: 0.35, shadow: 0.3, spill: 0.5, feather: 0.2 };

/** Crop at clip time (keyframes applied), or null. Values are fractions of the displayed (rotated / flipped) picture. */
export function cropAt(c, L) {
  if (!c.crop) return null;
  const x = propAt(c, 'cropX', L), y = propAt(c, 'cropY', L), w = propAt(c, 'cropW', L), h = propAt(c, 'cropH', L), angle = propAt(c, 'straighten', L);
  const cw = Math.max(0.02, Math.min(1, w)), ch = Math.max(0.02, Math.min(1, h));
  return { x: Math.max(0, Math.min(1 - cw, x)), y: Math.max(0, Math.min(1 - ch, y)), w: cw, h: ch, angle: angle || 0 };
}
export function maskAt(c, L) {
  const m = c.mask; if (!m || !m.shape || m.shape === 'none') return null;
  return { shape: m.shape, invert: !!m.invert, round: m.round ?? 0.2, x: propAt(c, 'maskX', L), y: propAt(c, 'maskY', L), w: propAt(c, 'maskW', L), h: propAt(c, 'maskH', L), rot: propAt(c, 'maskRot', L), feather: Math.max(0, propAt(c, 'maskFeather', L)) };
}
export const keyOn = c => !!(c.key && c.key.on && (c.key.strength ?? KEY_DEFAULTS.strength) > 0.005);   // strength 0 = nothing removed
/** Does this clip need the "pro" drawing path (no pixel-exact shortcut)? */
export const isPro = c => !!(c.crop || c.flipH || c.flipV || (c.rot90 || 0) % 4 || (c.mask && c.mask.shape && c.mask.shape !== 'none') || (c.blend && c.blend !== 'normal') || keyOn(c));
/** Zoom needed so a picture rotated by `deg` still covers its own frame (no empty corners when straightening). */
export function straightenZoom(deg, w, h) { const a = Math.abs(deg) * Math.PI / 180; if (a < 1e-6) return 1; const r = Math.max(w / h, h / w); return Math.cos(a) + Math.sin(a) * r; }

const cvs = {};
export function scratch(name, w, h) { let c = cvs[name]; if (!c || c.width !== w || c.height !== h) c = cvs[name] = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h }); return c; }

/** Path of a mask shape centred at 0,0, size w x h (heart / star fit the box). */
export function maskPath(ctx, m, w, h, big) {
  ctx.beginPath();
  if (m.shape === 'linear') ctx.rect(-big, -big, 2 * big, big);                         // keeps the part above the line
  else if (m.shape === 'mirror') ctx.rect(-big, -h / 2, 2 * big, h);
  else if (m.shape === 'circle') ctx.ellipse(0, 0, Math.max(0.5, w / 2), Math.max(0.5, h / 2), 0, 0, Math.PI * 2);
  else if (m.shape === 'rect') { const r = Math.max(0, Math.min(1, m.round)) * Math.min(w, h) / 2, x = -w / 2, y = -h / 2;
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  else if (m.shape === 'heart') { const sx = w / 2, sy = h / 2;   // parametric heart, normalised to its box
    for (let i = 0; i <= 96; i++) { const t = i / 96 * Math.PI * 2, X = 16 * Math.sin(t) ** 3, Y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
      const px = X / 16 * sx, py = (Y + 2.5) / 14.5 * sy; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); }
  else if (m.shape === 'star') { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 0.42 : 1; const px = Math.cos(a) * r * w / 2, py = (Math.sin(a) * r + 0.1) * h / 2; i ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.closePath(); }
}

/** Blurred, cover-scaled copy of a picture behind the frame (fills letterbox bars). amt 0..1. */
export function drawBgBlur(ctx, W, H, s, clip, amt) {
  const quarter = (((s.rot || 0) + 90 * (clip.rot90 || 0)) % 180 + 180) % 180 === 90, dw = quarter ? s.h : s.w, dh = quarter ? s.w : s.h;
  if (!dw || !dh) return;
  const sw = Math.max(16, Math.round(W / 8)), sh = Math.max(16, Math.round(H / 8)), L = scratch('bgb', sw, sh), x = L.getContext('2d');
  const k = Math.max(sw / dw, sh / dh) * 1.04;
  x.setTransform(1, 0, 0, 1, 0, 0); x.filter = 'none'; x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  x.clearRect(0, 0, sw, sh); x.translate(sw / 2, sh / 2); x.scale(k * (clip.flipH ? -1 : 1), k * (clip.flipV ? -1 : 1)); x.rotate(((s.rot || 0) + 90 * (clip.rot90 || 0)) * Math.PI / 180);
  x.drawImage(s.img, -s.w / 2, -s.h / 2, s.w, s.h);
  const B = scratch('bgb2', sw, sh), y = B.getContext('2d'); y.setTransform(1, 0, 0, 1, 0, 0); y.clearRect(0, 0, sw, sh);
  y.filter = `blur(${(0.6 + 3.4 * Math.max(0, Math.min(1, amt))).toFixed(2)}px)`; y.drawImage(L, 0, 0); y.filter = 'none';
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'brightness(0.85)'; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(B, 2, 2, sw - 4, sh - 4, 0, 0, W, H); ctx.restore();
}

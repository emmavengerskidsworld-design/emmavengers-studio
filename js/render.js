/* The compositor: draws the project at time t onto a 2D canvas. Used by BOTH the live preview and the exporter,
   so what you see is exactly what you export. getSource(clip, t) supplies the pixels for a video/image clip:
   { img: CanvasImageSource, w, h, rot } (w/h = coded size, rot = display rotation in degrees). */
import { TRACK_KINDS, propAt, filterCss, FONTS } from './registry.js';
import { transitionById, helpers } from './transitions.js';
import { clipEnd } from './project.js';
import { processImage, hasAdjust, enhanceOn, maxSide, DEFAULT_STRENGTH } from './enhance.js';

export function visualTracks(p) {
  return p.tracks.map((t, i) => ({ t, i })).filter(x => TRACK_KINDS[x.t.kind].visual)
    .sort((a, b) => TRACK_KINDS[a.t.kind].z - TRACK_KINDS[b.t.kind].z || a.i - b.i).map(x => x.t);
}
export const activeAt = (track, t) => track.clips.filter(c => c.start <= t + 1e-9 && t < clipEnd(c) - 1e-9);

const H_ = helpers(), layers = [];
function layer(i, W, H) { let c = layers[i]; if (!c || c.width !== W || c.height !== H) c = layers[i] = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H }); return c; }
export function renderFrame(ctx, W, H, p, t, getSource, opts = {}) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = p.bg || '#000'; ctx.fillRect(0, 0, W, H);
  const boxes = [];
  const drawClip = (cx, track, clip) => {
    const local = t - clip.start;
    const tr = { x: propAt(clip, 'x', local), y: propAt(clip, 'y', local), scale: propAt(clip, 'scale', local), rotation: propAt(clip, 'rotation', local), opacity: propAt(clip, 'opacity', local) };
    let box = null;
    if (clip.type === 'text') box = drawText(cx, W, H, clip, tr);
    else { const s = getSource(clip, t); if (s) box = drawVisual(cx, W, H, s, clip, tr, local, opts); }
    if (box) boxes.push({ id: clip.id, ...box, rotation: tr.rotation });
  };
  for (const track of visualTracks(p)) {
    const act = activeAt(track, t);
    if (TRACK_KINDS[track.kind].magnetic && act.length >= 2) {
      // transition: draw both clips into full-frame layers, then let the transition blend them
      const [a, b] = act.slice(-2), T = b.transitionIn && transitionById(b.transitionIn.id);
      if (T) {
        const LA = layer(0, W, H), LB = layer(1, W, H), bg = p.bg || '#000';
        for (const [L, c] of [[LA, a], [LB, b]]) { const x = L.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.filter = 'none'; x.globalCompositeOperation = 'source-over'; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.fillStyle = bg; x.fillRect(0, 0, W, H); drawClip(x, track, c); }
        const pr = Math.max(0, Math.min(1, (t - b.start) / Math.max(1e-6, clipEnd(a) - b.start)));
        ctx.save(); T.render(ctx, LA, LB, pr, W, H, H_); ctx.restore();
        ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
        continue;
      }
    }
    for (const clip of act) drawClip(ctx, track, clip);
  }
  if (opts.selectedId) { const b = boxes.find(b => b.id === opts.selectedId); if (b) drawSelection(ctx, b, Math.min(W, H) / 400); }
  ctx.restore();
  return boxes;
}

let pre = null;   // downscale scratch (big sources are first brought to on-screen size with high-quality smoothing)
function drawVisual(ctx, W, H, s, clip, tr, local, opts) {
  const quarter = ((s.rot || 0) % 180 + 180) % 180 === 90;
  const dw = quarter ? s.h : s.w, dh = quarter ? s.w : s.h;   // displayed (rotated) size
  if (!dw || !dh) return null;
  const fit = clip.fit === 'cover' ? Math.max(W / dw, H / dh) : Math.min(W / dw, H / dh);
  const k = fit * tr.scale, cx = tr.x * W, cy = tr.y * H;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, tr.opacity));
  const f = filterCss(clip.filter); ctx.filter = f || 'none';
  // HD pipeline: enhance / colour adjust / any upscale go through the WebGL shaders (same code for preview and export)
  const enh = !opts.plain && enhanceOn(clip) ? (clip.enhance.strength ?? DEFAULT_STRENGTH) : 0, adj = !opts.plain && hasAdjust(clip.adjust);
  let out = null, ow = Math.round(s.w * k), oh = Math.round(s.h * k);
  if (!opts.plain && (enh || adj || k > 1.001) && ow >= 2 && oh >= 2) {
    const cap = Math.min(maxSide(), Math.ceil(Math.max(W, H) * 1.6)), lim = Math.max(ow, oh) > cap ? cap / Math.max(ow, oh) : 1;
    ow = Math.max(2, Math.round(ow * lim)); oh = Math.max(2, Math.round(oh * lim));
    let src = s.img, sw = s.w, sh = s.h;
    if (ow < sw || oh < sh) {
      if (!pre || pre.width !== ow || pre.height !== oh) pre = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(ow, oh) : Object.assign(document.createElement('canvas'), { width: ow, height: oh });
      const x = pre.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.clearRect(0, 0, ow, oh); x.drawImage(s.img, 0, 0, ow, oh); src = pre; sw = ow; sh = oh;
    }
    out = processImage(src, sw, sh, ow, oh, { enhance: enh, adjust: adj ? clip.adjust : null, fast: !!opts.fast, seed: Math.floor((local || 0) * 30) % 997 });
  }
  const img = out || s.img;
  if (out && !s.rot && Math.abs(tr.rotation % 360) < 1e-6 && Math.abs(ow - s.w * k) < 0.75 && Math.abs(oh - s.h * k) < 0.75) {
    ctx.drawImage(img, Math.round(cx - ow / 2), Math.round(cy - oh / 2));   // pixel-exact, no second resample
  } else {
    ctx.translate(cx, cy); ctx.rotate(tr.rotation * Math.PI / 180); ctx.scale(k, k);
    if (s.rot) ctx.rotate(s.rot * Math.PI / 180);
    ctx.drawImage(img, -s.w / 2, -s.h / 2, s.w, s.h);
  }
  ctx.restore();
  return { cx, cy, w: dw * k, h: dh * k };
}

export function fontCss(text, px) { return (FONTS[text.font] || FONTS.bold).css.replace('SIZE', px.toFixed(1)); }
function drawText(ctx, W, H, clip, tr) {
  const T = clip.text, unit = Math.min(W, H) / 1080, px = T.size * unit;
  const lines = String(T.content || '').split('\n');
  ctx.save();
  ctx.font = fontCss(T, px); ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  const lh = px * 1.18, widths = lines.map(l => ctx.measureText(l).width), w = Math.max(1, ...widths), h = lh * lines.length;
  const pad = T.box ? px * 0.35 : px * 0.1, bw = w + pad * 2, bh = h + pad * 2;
  const cx = tr.x * W, cy = tr.y * H;
  ctx.globalAlpha = Math.max(0, Math.min(1, tr.opacity));
  ctx.translate(cx, cy); ctx.rotate(tr.rotation * Math.PI / 180); ctx.scale(tr.scale, tr.scale);
  if (T.box) { ctx.fillStyle = T.boxColor || '#000'; roundRect(ctx, -bw / 2, -bh / 2, bw, bh, px * 0.25); ctx.fill(); }
  const ax = T.align === 'left' ? -w / 2 : T.align === 'right' ? w / 2 : 0; ctx.textAlign = T.align || 'center';
  lines.forEach((l, i) => {
    const y = -h / 2 + lh * (i + 0.5);
    if (T.outline) { ctx.lineJoin = 'round'; ctx.miterLimit = 2; ctx.lineWidth = px * 0.14; ctx.strokeStyle = T.outlineColor || '#000'; ctx.strokeText(l, ax, y); }
    ctx.fillStyle = T.color; ctx.fillText(l, ax, y);
  });
  ctx.restore();
  return { cx, cy, w: bw * tr.scale, h: bh * tr.scale };
}
function roundRect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function drawSelection(ctx, b, u) {
  ctx.save(); ctx.translate(b.cx, b.cy); ctx.rotate(b.rotation * Math.PI / 180);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5 * u; ctx.setLineDash([]); ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = 3 * u;
  ctx.strokeRect(-b.w / 2, -b.h / 2, b.w, b.h);
  ctx.fillStyle = '#ffcc33'; for (const [x, y] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { ctx.beginPath(); ctx.arc(x * b.w / 2, y * b.h / 2, 4 * u, 0, 7); ctx.fill(); }
  ctx.restore();
}
/** Hit test on rendered boxes (top-most first). */
export function hitTest(boxes, x, y) {
  for (let i = boxes.length - 1; i >= 0; i--) { const b = boxes[i], a = -b.rotation * Math.PI / 180, dx = x - b.cx, dy = y - b.cy;
    const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) return b; }
  return null;
}

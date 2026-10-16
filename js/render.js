/* The compositor: draws the project at time t onto a 2D canvas. Used by BOTH the live preview and the exporter,
   so what you see is exactly what you export. getSource(clip, t) supplies the pixels for a video/image clip:
   { img: CanvasImageSource, w, h, rot } (w/h = coded size, rot = display rotation in degrees). */
import { TRACK_KINDS, propAt, filterCss, FONTS } from './registry.js';
import { clipEnd } from './project.js';

export function visualTracks(p) {
  return p.tracks.map((t, i) => ({ t, i })).filter(x => TRACK_KINDS[x.t.kind].visual)
    .sort((a, b) => TRACK_KINDS[a.t.kind].z - TRACK_KINDS[b.t.kind].z || a.i - b.i).map(x => x.t);
}
export const activeAt = (track, t) => track.clips.filter(c => c.start <= t + 1e-9 && t < clipEnd(c) - 1e-9);

export function renderFrame(ctx, W, H, p, t, getSource, opts = {}) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.filter = 'none';
  ctx.fillStyle = p.bg || '#000'; ctx.fillRect(0, 0, W, H);
  const boxes = [];
  for (const track of visualTracks(p)) for (const clip of activeAt(track, t)) {
    const local = t - clip.start;
    const tr = { x: propAt(clip, 'x', local), y: propAt(clip, 'y', local), scale: propAt(clip, 'scale', local), rotation: propAt(clip, 'rotation', local), opacity: propAt(clip, 'opacity', local) };
    let box = null;
    if (clip.type === 'text') box = drawText(ctx, W, H, clip, tr);
    else { const s = getSource(clip, t); if (s) box = drawVisual(ctx, W, H, s, clip, tr); }
    if (box) boxes.push({ id: clip.id, ...box, rotation: tr.rotation });
  }
  if (opts.selectedId) { const b = boxes.find(b => b.id === opts.selectedId); if (b) drawSelection(ctx, b, Math.min(W, H) / 400); }
  ctx.restore();
  return boxes;
}

function drawVisual(ctx, W, H, s, clip, tr) {
  const quarter = ((s.rot || 0) % 180 + 180) % 180 === 90;
  const dw = quarter ? s.h : s.w, dh = quarter ? s.w : s.h;   // displayed (rotated) size
  if (!dw || !dh) return null;
  const fit = clip.fit === 'cover' ? Math.max(W / dw, H / dh) : Math.min(W / dw, H / dh);
  const k = fit * tr.scale, cx = tr.x * W, cy = tr.y * H;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, tr.opacity));
  const f = filterCss(clip.filter); ctx.filter = f || 'none';
  ctx.translate(cx, cy); ctx.rotate(tr.rotation * Math.PI / 180); ctx.scale(k, k);
  if (s.rot) ctx.rotate(s.rot * Math.PI / 180);
  ctx.drawImage(s.img, -s.w / 2, -s.h / 2, s.w, s.h);
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

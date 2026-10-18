/* The compositor: draws the project at time t onto a 2D canvas. Used by BOTH the live preview and the exporter,
   so what you see is exactly what you export. getSource(clip, t) supplies the pixels for a video/image clip:
   { img: CanvasImageSource, w, h, rot } (w/h = coded size, rot = display rotation in degrees). */
import { TRACK_KINDS, propAt, filterCss, FONTS } from './registry.js';
import { transitionById, helpers } from './transitions.js';
import { clipEnd, clipDur } from './project.js';
import { clipAnimState, textAnimPlan, unitQ } from './animations.js';
import { processImage, hasAdjust, enhanceOn, maxSide, DEFAULT_STRENGTH } from './enhance.js';
import { ensureFont, fontsVersion } from './fonts.js';
import { isPro, cropAt, maskAt, keyOn, straightenZoom, scratch, maskPath, blendOp, drawBgBlur } from './pro.js';

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
  if (p.bgBlur > 0) {   // blurred copy of the main clip fills the letterbox bars
    const mt = p.tracks.find(x => x.kind === 'main'), act = mt ? activeAt(mt, t) : [], c = act[act.length - 1];
    if (c && c.type !== 'text') { const s = getSource(c, t); if (s) drawBgBlur(ctx, W, H, s, c, p.bgBlur); }
  }
  const boxes = [];
  const drawClip = (cx, track, clip) => {
    const local = t - clip.start;
    const tr = { x: propAt(clip, 'x', local), y: propAt(clip, 'y', local), scale: propAt(clip, 'scale', local), rotation: propAt(clip, 'rotation', local), opacity: propAt(clip, 'opacity', local) };
    let box = null;
    if (clip.type === 'text') box = drawText(cx, W, H, clip, tr, local);
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
        for (const [L, c] of [[LA, a], [LB, b]]) { const x = L.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.filter = 'none'; x.globalCompositeOperation = 'source-over'; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.fillStyle = bg; x.fillRect(0, 0, W, H); if (p.bgBlur > 0) { const s = getSource(c, t); if (s) drawBgBlur(x, W, H, s, c, p.bgBlur); } drawClip(x, track, c); }
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
/** Draw one video / photo / overlay clip. Exported so the animation picker tiles use exactly this code.
    s = { img, w, h, rot }, tr = transform at this time (keyframes applied), local = clip-local time. */
export function drawVisual(ctx, W, H, s, clip, tr, local, opts = {}) {
  const rot = (s.rot || 0) + 90 * (clip.rot90 || 0), quarter = (rot % 180 + 180) % 180 === 90;
  const dw = quarter ? s.h : s.w, dh = quarter ? s.w : s.h;   // displayed (rotated) size
  if (!dw || !dh) return null;
  const pro = isPro(clip), cr = cropAt(clip, local || 0), mk = opts.noMask ? null : maskAt(clip, local || 0);
  const cw = cr ? dw * cr.w : dw, ch = cr ? dh * cr.h : dh;   // size after crop
  const fit = clip.fit === 'cover' ? Math.max(W / cw, H / ch) : Math.min(W / cw, H / ch);
  const k = fit * tr.scale, cx = tr.x * W, cy = tr.y * H, box = { cx, cy, w: cw * k, h: ch * k };
  // clip animation (In / Out / Combo) on top of the transform; the HD pipeline still works at the clip's own size
  const st = clip.anim ? clipAnimState(clip, local || 0, clipDur(clip)) : null;
  const alpha = Math.max(0, Math.min(1, tr.opacity * (st ? st.a : 1)));
  if (alpha <= 0.0005 || (st && st.wipe && (st.wipe.x1 - st.wipe.x0 <= 1e-4 || st.wipe.y1 - st.wipe.y0 <= 1e-4)) || (st && Math.abs(st.s * st.sx * st.s * st.sy) < 1e-6)) return box;
  const zs = cr ? straightenZoom(cr.angle, dw, dh) : 1;
  // a mask draws the clip into its own layer first, then cuts the shape out of it
  const target = mk ? scratch('mask-l', W, H).getContext('2d') : ctx;
  if (mk) { target.setTransform(1, 0, 0, 1, 0, 0); target.globalAlpha = 1; target.filter = 'none'; target.globalCompositeOperation = 'source-over'; target.imageSmoothingEnabled = true; target.imageSmoothingQuality = 'high'; target.clearRect(0, 0, W, H); }
  const g = target;
  g.save();
  g.globalAlpha = mk ? 1 : alpha;
  if (!mk && clip.blend && clip.blend !== 'normal') g.globalCompositeOperation = blendOp(clip.blend);
  const f = [filterCss(clip.filter)]; if (st && st.blur > .05) f.push(`blur(${(st.blur * Math.min(W, H) / 1080).toFixed(2)}px)`); if (st && Math.abs(st.bright) > .001) f.push(`brightness(${(1 + st.bright).toFixed(3)})`);
  g.filter = f.filter(Boolean).join(' ') || 'none';
  // HD pipeline: enhance / colour adjust / chroma key / any upscale go through the WebGL shaders (same code for preview and export)
  const enh = !opts.plain && enhanceOn(clip) ? (clip.enhance.strength ?? DEFAULT_STRENGTH) : 0, adj = !opts.plain && hasAdjust(clip.adjust), key = !opts.noKey && keyOn(clip) ? clip.key : null;
  const kk = k * zs;
  let out = null, ow = Math.round(s.w * kk), oh = Math.round(s.h * kk);
  if ((!opts.plain || key) && (enh || adj || key || kk > 1.001) && ow >= 2 && oh >= 2) {
    const cap = Math.min(maxSide(), Math.ceil(Math.max(W, H) * 1.6)), lim = Math.max(ow, oh) > cap ? cap / Math.max(ow, oh) : 1;
    ow = Math.max(2, Math.round(ow * lim)); oh = Math.max(2, Math.round(oh * lim));
    let src = s.img, sw = s.w, sh = s.h;
    if (ow < sw || oh < sh) {
      if (!pre || pre.width !== ow || pre.height !== oh) pre = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(ow, oh) : Object.assign(document.createElement('canvas'), { width: ow, height: oh });
      const x = pre.getContext('2d'); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; x.clearRect(0, 0, ow, oh); x.drawImage(s.img, 0, 0, ow, oh); src = pre; sw = ow; sh = oh;
    }
    out = processImage(src, sw, sh, ow, oh, { enhance: enh, adjust: adj ? clip.adjust : null, key, fast: !!opts.fast, seed: Math.floor((local || 0) * 30) % 997 });
  }
  const img = out || s.img;
  if (!pro && !st && out && !s.rot && Math.abs(tr.rotation % 360) < 1e-6 && Math.abs(ow - s.w * k) < 0.75 && Math.abs(oh - s.h * k) < 0.75) {
    g.drawImage(img, Math.round(cx - ow / 2), Math.round(cy - oh / 2));   // pixel-exact, no second resample
  } else {
    g.translate(cx + (st ? st.dx * W : 0), cy + (st ? st.dy * H : 0)); g.rotate((tr.rotation + (st ? st.rot : 0)) * Math.PI / 180);
    if (st && Math.abs(st.skx) > 1e-4) g.transform(1, 0, st.skx, 1, 0, 0);
    g.scale(k * (st ? st.s * st.sx : 1), k * (st ? st.s * st.sy : 1));
    if (st && st.wipe) { const w = st.wipe; g.beginPath(); g.rect(-cw / 2 + w.x0 * cw, -ch / 2 + w.y0 * ch, (w.x1 - w.x0) * cw, (w.y1 - w.y0) * ch); g.clip(); }
    if (cr) { g.beginPath(); g.rect(-cw / 2, -ch / 2, cw, ch); g.clip();
      if (cr.angle) { g.rotate(cr.angle * Math.PI / 180); g.scale(zs, zs); }
      g.translate(-(cr.x + cr.w / 2 - 0.5) * dw, -(cr.y + cr.h / 2 - 0.5) * dh); }
    if (clip.flipH || clip.flipV) g.scale(clip.flipH ? -1 : 1, clip.flipV ? -1 : 1);
    if (rot) g.rotate(rot * Math.PI / 180);
    g.drawImage(img, -s.w / 2, -s.h / 2, s.w, s.h);
  }
  g.restore();
  if (mk) {
    // the mask lives in the clip's own space: it moves, scales and rotates with the clip
    const M = scratch('mask-m', W, H), m = M.getContext('2d'), mw = Math.max(1, mk.w * cw), mh = Math.max(1, mk.h * ch);
    m.setTransform(1, 0, 0, 1, 0, 0); m.globalAlpha = 1; m.globalCompositeOperation = 'source-over'; m.clearRect(0, 0, W, H);
    const fpx = mk.feather * 0.25 * Math.min(mk.shape === 'linear' ? Math.min(cw, ch) : Math.min(mw, mh), Math.min(cw, ch)) * k * (st ? st.s : 1);
    m.filter = fpx > 0.3 ? `blur(${fpx.toFixed(2)}px)` : 'none';
    m.translate(cx + (st ? st.dx * W : 0), cy + (st ? st.dy * H : 0)); m.rotate((tr.rotation + (st ? st.rot : 0)) * Math.PI / 180); m.scale(k * (st ? st.s * st.sx : 1), k * (st ? st.s * st.sy : 1));
    m.translate((mk.x - 0.5) * cw, (mk.y - 0.5) * ch); m.rotate(mk.rot * Math.PI / 180);
    maskPath(m, mk, mw, mh, 4 * Math.max(cw, ch, W / k, H / k)); m.fillStyle = '#fff'; m.fill(); m.filter = 'none';
    target.globalCompositeOperation = mk.invert ? 'destination-out' : 'destination-in'; target.drawImage(M, 0, 0); target.globalCompositeOperation = 'source-over';
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = alpha; ctx.filter = 'none'; ctx.globalCompositeOperation = clip.blend && clip.blend !== 'normal' ? blendOp(clip.blend) : 'source-over';
    ctx.drawImage(target.canvas, 0, 0); ctx.restore();
  }
  return box;
}

export function fontCss(text, px) { return (FONTS[text.font] || FONTS.bold).css.replace('SIZE', px.toFixed(1)); }
/* per-letter layout cache: positions of every visible character, with its word / line index */
const layoutCache = new Map();
function textLayout(ctx, lines, align, key) {
  let L = layoutCache.get(key); if (L) return L;
  const chars = []; let ci = 0, wi = 0;
  const widths = lines.map(l => ctx.measureText(l).width), w = Math.max(1, ...widths);
  lines.forEach((l, li) => {
    const lw = widths[li], x0 = align === 'left' ? -w / 2 : align === 'right' ? w / 2 - lw : -lw / 2; let prev = 0, inWord = false;
    for (let j = 0; j < l.length; j++) { const ch = l[j], nx = ctx.measureText(l.slice(0, j + 1)).width;
      if (ch.trim()) { if (!inWord) { inWord = true; } chars.push({ ch, x: x0 + (prev + nx) / 2, li, ci: ci++, wi }); } else if (inWord) { inWord = false; wi++; }
      prev = nx; }
    if (inWord) wi++;
  });
  L = { chars, nChars: ci, nWords: Math.max(1, wi), nLines: lines.length, widths, w };
  if (layoutCache.size > 60) layoutCache.delete(layoutCache.keys().next().value); layoutCache.set(key, L); return L;
}
const bubbleOf = T => T.bubble || (T.box ? 'box' : null);
/** Extra room a bubble shape needs around the text block: [left, top, right, bottom] in px units of font size. */
function bubbleSize(shape, w, h, px) {
  const p = px * 0.35;
  if (shape === 'burst') return { bw: (w + p * 2) * 1.42, bh: (h + p * 2) * 1.6 };
  if (shape === 'cloud' || shape === 'thought') return { bw: w + p * 3.2, bh: h + p * 3 };
  if (shape === 'banner') return { bw: w + p * 5, bh: h + p * 2 };
  if (shape === 'tag') return { bw: w + p * 4, bh: h + p * 2 };
  if (shape === 'pill') return { bw: w + p * 2 + h * 0.4, bh: h + p * 2 };
  return { bw: w + p * 2, bh: h + p * 2 };
}
function bubblePath(ctx, shape, bw, bh, px) {
  const x = -bw / 2, y = -bh / 2; ctx.beginPath();
  switch (shape) {
    case 'pill': rr(ctx, x, y, bw, bh, bh / 2); break;
    case 'speech': { const r = Math.min(px * 0.45, bh / 2); rr(ctx, x, y, bw, bh, r); ctx.moveTo(x + bw * 0.2, y + bh - 1); ctx.lineTo(x + bw * 0.12, y + bh + px * 0.55); ctx.lineTo(x + bw * 0.36, y + bh - 1); ctx.closePath(); break; }
    case 'thought': case 'cloud': {
      const n = Math.max(6, Math.round((bw + bh) / (px * 0.55))), rx = bw / 2, ry = bh / 2;
      ctx.ellipse(0, 0, rx * 0.9, ry * 0.82, 0, 0, Math.PI * 2);
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, r = Math.min(rx, ry) * 0.36; ctx.moveTo(Math.cos(a) * rx * 0.86 + r, Math.sin(a) * ry * 0.8); ctx.arc(Math.cos(a) * rx * 0.86, Math.sin(a) * ry * 0.8, r, 0, Math.PI * 2); }
      if (shape === 'thought') { for (const [k, r] of [[1.12, 0.16], [1.4, 0.1]]) { const cx = -rx * 0.55 * k, cy = ry * k; ctx.moveTo(cx + px * r * 1.4, cy); ctx.arc(cx, cy, px * r * 1.4, 0, Math.PI * 2); } }
      break; }
    case 'banner': { const n = px * 0.5; ctx.moveTo(x, y); ctx.lineTo(x + bw, y); ctx.lineTo(x + bw - n, 0); ctx.lineTo(x + bw, y + bh); ctx.lineTo(x, y + bh); ctx.lineTo(x + n, 0); ctx.closePath(); break; }
    case 'tag': { const n = bh / 2; ctx.moveTo(x + n, y); ctx.lineTo(x + bw, y); ctx.lineTo(x + bw, y + bh); ctx.lineTo(x + n, y + bh); ctx.lineTo(x, 0); ctx.closePath(); ctx.moveTo(x + n * 0.75 + px * 0.1, 0); ctx.arc(x + n * 0.75, 0, px * 0.1, 0, Math.PI * 2, true); break; }
    case 'burst': { const n = 16, rx = bw / 2, ry = bh / 2; for (let i = 0; i < n * 2; i++) { const a = i / (n * 2) * Math.PI * 2 - Math.PI / 2, k = i % 2 ? 0.78 : 1; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rx * k, Math.sin(a) * ry * k); } ctx.closePath(); break; }
    case 'label': { const s = bh * 0.25; ctx.moveTo(x + s, y); ctx.lineTo(x + bw, y); ctx.lineTo(x + bw - s, y + bh); ctx.lineTo(x, y + bh); ctx.closePath(); break; }
    case 'sticker': rr(ctx, x, y, bw, bh, px * 0.4); break;
    default: rr(ctx, x, y, bw, bh, px * 0.25);
  }
}
function drawBubble(ctx, T, shape, bw, bh, px, sc) {
  ctx.save(); bubblePath(ctx, shape, bw, bh, px);
  const Bd = T.bubbleBorder || (shape === 'sticker' ? { color: '#ffffff', w: 0.12 } : null);
  if (shape === 'sticker') { ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = px * 0.25 * sc; ctx.shadowOffsetY = px * 0.06 * sc; }
  // border = a stroke twice as wide drawn first; the fill then covers its inner half (so clouds get one outline round the union)
  if (Bd && Bd.w > 0) { ctx.lineJoin = 'round'; ctx.lineWidth = Bd.w * px * 2; ctx.strokeStyle = Bd.color; ctx.stroke(); ctx.shadowColor = 'transparent'; }
  ctx.fillStyle = T.boxColor || '#000'; ctx.fill('nonzero');
  ctx.restore();
}
/* fill paint: solid colour or a gradient laid out over the whole text block (ox, oy = where this glyph sits in the block) */
function fillPaint(ctx, T, w, h, ox, oy, idx) {
  const F = T.fill; if (!F || !F.colors || F.colors.length < 2) return T.color;
  if (F.dir === 'letters') return F.colors[idx % F.colors.length];
  const g = F.dir === 'h' ? ctx.createLinearGradient(-w / 2 - ox, 0, w / 2 - ox, 0) : F.dir === 'd' ? ctx.createLinearGradient(-w / 2 - ox, -h / 2 - oy, w / 2 - ox, h / 2 - oy) : ctx.createLinearGradient(0, -h / 2 - oy, 0, h / 2 - oy);
  F.colors.forEach((c, i) => g.addColorStop(i / (F.colors.length - 1), c)); return g;
}
/** The glyph is painted in layers (3D side, shadow, outer outline, outline, fill + glow, gloss), each layer over all glyphs. */
function textPasses(ctx, T, px, w, h, sc, lh) {
  const P = [], ow = T.outline ? (T.outlineW ?? 0.14) * px : 0, s2 = T.stroke2 && T.stroke2.w > 0 ? T.stroke2.w * px : 0, outer = ow + 2 * s2;
  const stroke = (lw, col) => (g, x, y) => { ctx.lineJoin = 'round'; ctx.miterLimit = 2; ctx.lineWidth = lw; ctx.strokeStyle = col; ctx.strokeText(g.s, x, y); };
  if (T.extrude && T.extrude.depth > 0) {
    const d = T.extrude.depth * px, a = (T.extrude.angle ?? 90) * Math.PI / 180, n = Math.max(1, Math.min(32, Math.ceil(d * sc / 1.2))), ux = Math.cos(a) * d / n, uy = Math.sin(a) * d / n;
    P.push((g, x, y) => { ctx.fillStyle = ctx.strokeStyle = T.extrude.color; ctx.lineJoin = 'round'; ctx.lineWidth = outer;
      for (let i = n; i >= 1; i--) { if (outer > 0) ctx.strokeText(g.s, x + ux * i, y + uy * i); ctx.fillText(g.s, x + ux * i, y + uy * i); } });
  }
  if (T.shadow) { const S = T.shadow; P.push((g, x, y) => { ctx.save(); if (S.blur > 0) { ctx.shadowColor = S.color; ctx.shadowBlur = S.blur * px * sc; }
    ctx.fillStyle = ctx.strokeStyle = S.color; ctx.lineJoin = 'round'; ctx.lineWidth = outer; const X = x + S.dx * px, Y = y + S.dy * px; if (outer > 0) ctx.strokeText(g.s, X, Y); ctx.fillText(g.s, X, Y); ctx.restore(); }); }
  if (s2) P.push(stroke(outer, T.stroke2.color));
  if (ow) P.push((g, x, y) => stroke(ow, T.outlineColor || '#000')(g, x, y));
  P.push((g, x, y) => { const gl = (g.glow || 0) * px * sc + (T.glow ? T.glow.blur * px * sc : 0);
    if (gl > .002) { ctx.shadowColor = T.glow ? T.glow.color : T.color; ctx.shadowBlur = gl; } else ctx.shadowBlur = 0;
    ctx.fillStyle = g.color || fillPaint(ctx, T, w, h, g.ox, g.oy, g.i); ctx.fillText(g.s, x, y);
    if (T.glow && gl > .002) ctx.fillText(g.s, x, y);   // neon: a second pass makes the glow strong
    ctx.shadowBlur = 0; });
  if (T.gloss) P.push((g, x, y) => { const gr = ctx.createLinearGradient(0, y - lh / 2, 0, y + lh * 0.05); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = gr; ctx.fillText(g.s, x, y); });
  return P;
}
/** Draw a text clip (exported for the animation picker tiles). local = clip-local time (drives text animations). */
export function drawText(ctx, W, H, clip, tr, local = 0) {
  const T = clip.text, unit = Math.min(W, H) / 1080, px = T.size * unit;
  ensureFont(T.font);
  const lines = String(T.content || '').split('\n');
  const plan = clip.anim ? textAnimPlan(clip, local, clipDur(clip)) : null, B = plan ? plan.block : null;
  ctx.save();
  ctx.font = fontCss(T, px); ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  const lh = px * 1.18, widths = lines.map(l => ctx.measureText(l).width), w = Math.max(1, ...widths), h0 = lh * lines.length;
  const curve = Math.max(-1, Math.min(1, T.curve || 0)), curved = Math.abs(curve) > 0.01;
  const R = curved ? w / (Math.abs(curve) * Math.PI) : 0, sag = curved ? R * (1 - Math.cos(w / 2 / R)) : 0, h = h0 + sag;
  const shape = bubbleOf(T), sc = tr.scale * (B ? B.s : 1);
  const { bw, bh } = shape ? bubbleSize(shape, w, h, px) : { bw: w + px * 0.2, bh: h + px * 0.2 };
  const ext = T.extrude ? T.extrude.depth * px : 0, deco = (T.outline ? (T.outlineW ?? 0.14) * px : 0) + (T.stroke2 ? 2 * T.stroke2.w * px : 0);
  const cx = tr.x * W, cy = tr.y * H, box = { cx, cy, w: (bw + (shape ? 0 : deco)) * tr.scale, h: (bh + (shape ? 0 : deco + ext) + (shape === 'speech' ? px * 0.55 : 0)) * tr.scale };
  const alpha = Math.max(0, Math.min(1, tr.opacity * (B ? B.a : 1)));
  if (alpha <= 0.0005 || (B && (B.reveal <= 1e-4 || Math.abs(B.s * B.sx * B.s * B.sy) < 1e-6))) { ctx.restore(); return box; }
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy); ctx.rotate((tr.rotation + (B ? B.rot : 0)) * Math.PI / 180); ctx.scale(tr.scale * (B ? B.s * B.sx : 1), tr.scale * (B ? B.s * B.sy : 1));
  if (B) { if (Math.abs(B.skx) > 1e-4) ctx.transform(1, 0, B.skx, 1, 0, 0); ctx.translate(B.dx * px, B.dy * px);
    if (B.blur > .002) ctx.filter = `blur(${(B.blur * px * tr.scale).toFixed(2)}px)`;
    if (B.reveal < 1) { ctx.beginPath(); ctx.rect(-bw / 2 - px, -bh / 2 - px, (bw + px) * B.reveal + px, bh + 2 * px); ctx.clip(); } }
  if (shape) drawBubble(ctx, T, shape, bw, bh, px, sc);
  const ax = T.align === 'left' ? -w / 2 : T.align === 'right' ? w / 2 : 0;
  const passes = textPasses(ctx, T, px, w, h, sc, lh), perChar = curved || (plan && plan.units.length) || (T.fill && T.fill.dir === 'letters');
  if (!perChar) {
    ctx.textAlign = T.align || 'center';
    const gs = lines.map((l, i) => ({ s: l, y: -h0 / 2 + lh * (i + 0.5), glow: B ? B.glow : 0, ox: 0, oy: 0, i }));
    for (const P of passes) for (const g of gs) P(g, ax, g.y);
  } else {
    // per-letter engine: every animation picks its own unit (letter / word / line) and stagger; curved text bends the letters onto an arc
    const Lo = textLayout(ctx, lines, T.align || 'center', ctx.font + '|' + (T.align || 'center') + '|' + T.content + '|' + fontsVersion);
    const units = plan ? plan.units : [];
    const gs = Lo.chars.map(c => { const s = { dx: 0, dy: 0, s: 1, sx: 1, sy: 1, rot: 0, a: 1, glow: B ? B.glow : 0, color: null };
      for (const U of units) { const i = U.unit === 'word' ? c.wi : U.unit === 'line' ? c.li : c.ci, n = U.unit === 'word' ? Lo.nWords : U.unit === 'line' ? Lo.nLines : Lo.nChars;
        const r = U.f(U.loop ? U.q : unitQ(U.q, i, n, U.stagger), { i, n }); if (!r) continue;
        if (r.dx) s.dx += r.dx; if (r.dy) s.dy += r.dy; if (r.s != null) s.s *= r.s; if (r.sx != null) s.sx *= r.sx; if (r.sy != null) s.sy *= r.sy; if (r.rot) s.rot += r.rot; if (r.a != null) s.a *= r.a; if (r.glow) s.glow += r.glow; if (r.color) s.color = r.color; }
      let X = c.x, Y = -h0 / 2 + lh * (c.li + 0.5), rot = 0;
      if (curved) { const yl = Y; if (curve > 0) { const r = R - yl, th = c.x / R, Cy = R - sag / 2 - h0 / 2 + lh / 2 * 0; X = r * Math.sin(th); Y = Cy - r * Math.cos(th); rot = th; }
        else { const r = R + yl, th = c.x / R, Cy = -(R - sag / 2); X = r * Math.sin(th); Y = Cy + r * Math.cos(th); rot = -th; } }
      return { s: c.ch, i: c.ci, X, Y, rot, st: s, ox: X, oy: Y, glow: s.glow, color: s.color }; });
    ctx.textAlign = 'center';
    for (const P of passes) for (const g of gs) { const s = g.st; if (s.a <= 0.0005 || Math.abs(s.s * s.sx * s.s * s.sy) < 1e-6) continue;
      ctx.save(); ctx.globalAlpha = alpha * Math.min(1, s.a); ctx.translate(g.X, g.Y); if (g.rot) ctx.rotate(g.rot); ctx.translate(s.dx * px, s.dy * px); if (s.rot) ctx.rotate(s.rot * Math.PI / 180); if (s.s !== 1 || s.sx !== 1 || s.sy !== 1) ctx.scale(s.s * s.sx, s.s * s.sy);
      P(g, 0, 0); ctx.restore(); }
  }
  if (B && B.underline && B.underline[1] - B.underline[0] > 1e-4) {
    ctx.shadowBlur = 0; ctx.fillStyle = T.color;
    widths.forEach((lw, i) => { const x0 = T.align === 'left' ? -w / 2 : T.align === 'right' ? w / 2 - lw : -lw / 2, y = -h0 / 2 + lh * (i + 0.5) + px * .62;
      if (T.outline) { ctx.fillStyle = T.outlineColor || '#000'; ctx.fillRect(x0 + B.underline[0] * lw - px * .04, y - px * .04, (B.underline[1] - B.underline[0]) * lw + px * .08, px * .16); ctx.fillStyle = T.color; }
      ctx.fillRect(x0 + B.underline[0] * lw, y, (B.underline[1] - B.underline[0]) * lw, px * .08); });
  }
  ctx.restore();
  return box;
}
function rr(ctx, x, y, w, h, r) { r = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
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

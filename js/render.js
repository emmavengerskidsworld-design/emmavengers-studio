import { texPaint, fxPasses, drawDeco, decoPad } from './textfx.js';
/* The compositor: draws the project at time t onto a 2D canvas. Used by BOTH the live preview and the exporter,
   so what you see is exactly what you export. getSource(clip, t) supplies the pixels for a video/image clip:
   { img: CanvasImageSource, w, h, rot } (w/h = coded size, rot = display rotation in degrees). */
import { TRACK_KINDS, propAt, filterCss, FONTS } from './registry.js';
import { innerTracks } from './compound.js';
import { drawElement } from './elements.js';
import { drawKaraoke } from './karaoke.js';
import { transitionById, helpers } from './transitions.js';
import { clipEnd, clipDur, srcTime } from './project.js';
import { clipAnimState, textAnimPlan, unitQ } from './animations.js';
import { processImage, hasAdjust, enhanceOn, maxSide, DEFAULT_STRENGTH } from './enhance.js';
import { ensureFont, fontsVersion } from './fonts.js';
import { applyChain, fxAvailable, DEFAULT_EFFECT_AMOUNT } from './effects.js';
import { hasColor, colorParams } from './colorpro.js';
import { drawCanvasBg, cellPath } from './canvasbg.js';
import { stabAt } from './motion.js';
import { isPro, cropAt, maskAt, keyOn, straightenZoom, scratch, maskPath, blendOp, drawBgBlur } from './pro.js';

export function visualTracks(p) {
  return p.tracks.map((t, i) => ({ t, i })).filter(x => TRACK_KINDS[x.t.kind].visual)
    .sort((a, b) => TRACK_KINDS[a.t.kind].z - TRACK_KINDS[b.t.kind].z || a.i - b.i).map(x => x.t);
}
export const activeAt = (track, t) => track.clips.filter(c => c.start <= t + 1e-9 && t < clipEnd(c) - 1e-9);

const H_ = helpers(), layers = [];
function layer(i, W, H) { let c = layers[i]; if (!c || c.width !== W || c.height !== H) c = layers[i] = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H }); return c; }
/** Compound clip: its contents are composited into their own layer (transparent), which is then drawn like one picture
    (position / scale / rotation / opacity / filters / effects / keyframes of the compound clip). */
const nestL = []; let nestDepth = 0;
function drawCompound(cx, W, H, clip, tr, local, t, getSource, opts) {
  if (nestDepth > 4) return null; let L = nestL[nestDepth];
  if (!L || L.width !== W || L.height !== H) L = nestL[nestDepth] = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
  const x = L.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.clearRect(0, 0, W, H);
  nestDepth++; try { renderFrame(x, W, H, { tracks: innerTracks(clip), aspect: '', _nested: true }, t, getSource, { ...opts, selectedId: null }); } finally { nestDepth--; }
  return drawVisual(cx, W, H, { img: L, w: W, h: H, rot: 0 }, clip, tr, local, opts);
}
/** Overlay-library element: drawn procedurally into its own full-frame layer, then handled like a picture (blend, key, keyframes...). */
const elL = [];
function drawElementClip(cx, W, H, clip, tr, local, opts) {
  let L = elL[nestDepth]; if (!L || L.width !== W || L.height !== H) L = elL[nestDepth] = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
  if (!drawElement(L.getContext('2d'), W, H, clip.element && clip.element.id, local * (clip.speed || 1), clipDur(clip) * (clip.speed || 1))) return null;
  return drawVisual(cx, W, H, { img: L, w: W, h: H, rot: 0 }, clip, tr, local, opts);
}
export function renderFrame(ctx, W, H, p, t, getSource, opts = {}) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  // canvas: colour, then gradient / pattern / image, or a blurred copy of the main clip in the letterbox bars
  if (!p._nested) { const mt = p.tracks.find(x => x.kind === 'main'), act = mt ? activeAt(mt, t) : []; drawCanvasBg(ctx, W, H, p, t, getSource, act[act.length - 1]); }
  const boxes = [];
  const drawClip = (cx, track, clip) => {
    const local = t - clip.start;
    const tr = { x: propAt(clip, 'x', local), y: propAt(clip, 'y', local), scale: propAt(clip, 'scale', local), rotation: propAt(clip, 'rotation', local), opacity: propAt(clip, 'opacity', local) };
    let box = null;
    if (clip.type === 'effect') { drawFrameEffect(cx, W, H, clip, local); return; }
    if (clip.type === 'text') box = clip.karaoke ? drawKaraoke(cx, W, H, clip, tr, local, fontCss) : drawText(cx, W, H, clip, tr, local);
    else if (clip.type === 'element') box = drawElementClip(cx, W, H, clip, tr, local, opts);
    else if (clip.type === 'compound') box = drawCompound(cx, W, H, clip, tr, local, t, getSource, opts);
    else { const s = getSource(clip, t); if (s) box = drawVisual(cx, W, H, s, clip, tr, local, opts); }
    if (box) boxes.push({ id: clip.id, type: clip.type, ...box, rotation: tr.rotation });
  };
  for (const track of visualTracks(p)) {
    const act = activeAt(track, t);
    if (TRACK_KINDS[track.kind].magnetic && act.length >= 2) {
      // transition: draw both clips into full-frame layers, then let the transition blend them
      const [a, b] = act.slice(-2), T = b.transitionIn && transitionById(b.transitionIn.id);
      if (T) {
        const LA = layer(0, W, H), LB = layer(1, W, H), bg = p.bg || '#000';
        for (const [L, c] of [[LA, a], [LB, b]]) { const x = L.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.filter = 'none'; x.globalCompositeOperation = 'source-over'; x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'; drawCanvasBg(x, W, H, p, t, getSource, c); drawClip(x, track, c); }
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

/** An Effects-track clip: runs its effect (or filter) over everything already drawn under it. */
export function drawFrameEffect(ctx, W, H, clip, local) {
  const e = clip.effect; if (!e || !e.id) return;
  const chain = e.kind === 'adjust' ? adjustChain(clip, local) : [{ kind: e.kind || 'effect', id: e.id, amount: e.amount ?? DEFAULT_EFFECT_AMOUNT, t: local, dur: clipDur(clip), seed: clip.id }];
  if (!chain.length) return;
  const r = applyChain(ctx.canvas, W, H, chain);
  if (!r) return;
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'copy'; ctx.drawImage(r, 0, 0, W, H); ctx.restore();
}
/** Filter + per-clip effects of a photo / video clip, as a GL chain. */
/** Adjustment layer: colour (curves, HSL, wheels, LUT, light, vignette, grain, sharpen) + filter + effects over everything under it.
    Vignette / grain / sharpen / intensity can be keyframed (adjVignette, adjGrain, adjSharpen, opacity = intensity). */
export function adjustChain(clip, local) {
  const amt = Math.max(0, Math.min(1, (clip.effect.amount ?? 1) * propAt(clip, 'opacity', local))), ch = [];
  const q = { ...(clip.color || {}), vig: Math.max(clip.color?.vig || 0, propAt(clip, 'adjVignette', local)), grain: Math.max(clip.color?.grain || 0, propAt(clip, 'adjGrain', local)), sharp: Math.max(clip.color?.sharp || 0, propAt(clip, 'adjSharpen', local)) };
  if (hasColor({ color: q })) ch.push({ kind: 'color', id: 'color', amount: amt, p: colorParams(q), t: local, seed: clip.id });
  if (clip.filter && clip.filter.id) ch.push({ kind: 'filter', id: clip.filter.id, amount: (clip.filter.amount ?? 1) * amt });
  for (const e of clip.effects || []) if (e && e.id) ch.push({ kind: 'effect', id: e.id, amount: (e.amount ?? DEFAULT_EFFECT_AMOUNT) * amt, t: local || 0, dur: clipDur(clip), seed: clip.id });
  return ch;
}
export function clipChain(clip, local) {
  const ch = [];
  if (clip.mirror && clip.mirror.id) ch.push({ kind: 'effect', id: clip.mirror.id, amount: 1, t: local || 0, dur: clipDur(clip), seed: clip.id });
  if (hasColor(clip)) ch.push({ kind: 'color', id: 'color', amount: 1, p: colorParams(clip.color), t: local || 0, seed: clip.id });
  if (clip.filter && clip.filter.id) ch.push({ kind: 'filter', id: clip.filter.id, amount: clip.filter.amount ?? 1 });
  for (const e of clip.effects || []) if (e && e.id) ch.push({ kind: 'effect', id: e.id, amount: e.amount ?? DEFAULT_EFFECT_AMOUNT, t: local || 0, dur: clipDur(clip), seed: clip.id });
  return ch;
}
/** Colour adjust of a clip at clip-local time (vignette / grain / sharpen can be keyframed). */
export function adjustAt(clip, L) { const a = clip.adjust; const k = clip.keyframes || {}; if (!k.adjVignette && !k.adjGrain && !k.adjSharpen) return a;
  return { ...(a || {}), vignette: propAt(clip, 'adjVignette', L), grain: propAt(clip, 'adjGrain', L), sharpen: propAt(clip, 'adjSharpen', L) }; }
let pre = null;   // downscale scratch (big sources are first brought to on-screen size with high-quality smoothing)
/** Draw one video / photo / overlay clip. Exported so the animation picker tiles use exactly this code.
    s = { img, w, h, rot }, tr = transform at this time (keyframes applied), local = clip-local time. */
export function drawVisual(ctx, W, H, s, clip, tr, local, opts = {}) {
  const rot = (s.rot || 0) + 90 * (clip.rot90 || 0), quarter = (rot % 180 + 180) % 180 === 90;
  const dw = quarter ? s.h : s.w, dh = quarter ? s.w : s.h;   // displayed (rotated) size
  if (!dw || !dh) return null;
  const pro = isPro(clip), crEdit = opts.cropEdit === clip.id, cr0 = cropAt(clip, local || 0), cr = crEdit ? null : cr0, mk = opts.noMask ? null : maskAt(clip, local || 0);
  const cw = cr ? dw * cr.w : dw, ch = cr ? dh * cr.h : dh;   // size after crop
  // layout cell (split screen / collage): the clip covers its cell, x / y / scale pan and zoom inside it
  if (clip.cell && clip.cell.off) return null;   // waiting outside a layout with fewer cells
  const cel = clip.cell, FW = cel ? cel.w * W : W, FH = cel ? cel.h * H : H, OX = cel ? cel.x * W : 0, OY = cel ? cel.y * H : 0;
  const fit = (cel ? clip.fit !== 'contain' : clip.fit === 'cover') ? Math.max(FW / cw, FH / ch) : Math.min(FW / cw, FH / ch);
  const k = fit * tr.scale, cx = OX + tr.x * FW, cy = OY + tr.y * FH, box = { cx, cy, w: cw * k, h: ch * k };
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
  if (cel) { cellPath(g, cel, W, H); g.clip(); }
  g.globalAlpha = mk ? 1 : alpha;
  if (!mk && clip.blend && clip.blend !== 'normal') g.globalCompositeOperation = blendOp(clip.blend);
  const chain = clipChain(clip, local), glFx = chain.length && fxAvailable();
  const f = [glFx ? '' : filterCss(clip.filter)]; if (st && st.blur > .05) f.push(`blur(${(st.blur * Math.min(W, H) / 1080).toFixed(2)}px)`); if (st && Math.abs(st.bright) > .001) f.push(`brightness(${(1 + st.bright).toFixed(3)})`);
  g.filter = f.filter(Boolean).join(' ') || 'none';
  // HD pipeline: enhance / colour adjust / chroma key / any upscale go through the WebGL shaders (same code for preview and export)
  const enh = !opts.plain && enhanceOn(clip) ? (clip.enhance.strength ?? DEFAULT_STRENGTH) : 0, adjv = adjustAt(clip, local || 0), adj = !opts.plain && hasAdjust(adjv), key = !opts.noKey && keyOn(clip) ? clip.key : null;
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
    out = processImage(src, sw, sh, ow, oh, { enhance: enh, adjust: adj ? adjv : null, key, fast: !!opts.fast, seed: Math.floor((local || 0) * 30) % 997 });
  }
  let img = out || s.img;
  if (glFx) {   // filters + effects run on the clip's own pixels (at most on-screen size), same code for preview and export
    let iw = out ? ow : s.w, ih = out ? oh : s.h; if (!out && kk < 1) { iw = Math.max(2, Math.round(s.w * kk)); ih = Math.max(2, Math.round(s.h * kk)); }
    const r = applyChain(img, iw, ih, chain); if (r) img = r;
  }
  const sb = clip.stab && clip.type === 'video' ? stabAt(clip.stab, srcTime(clip, clip.start + (local || 0))) : null;
  if (!pro && !st && !sb && out && !s.rot && Math.abs(tr.rotation % 360) < 1e-6 && Math.abs(ow - s.w * k) < 0.75 && Math.abs(oh - s.h * k) < 0.75) {
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
    if (sb) { g.scale(sb.z, sb.z); g.translate(sb.x * s.w, sb.y * s.h); g.rotate(sb.a); g.scale(sb.s, sb.s); }   // stabilisation (raw frame space)
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
  if (crEdit) { box.cropEdit = true; drawCropUI(ctx, box, tr.rotation, cr0 || { x: 0, y: 0, w: 1, h: 1 }, Math.min(W, H) / 400); }
  return box;
}
/** Preview only: the whole picture with the area outside the crop dimmed, a frame, thirds and corner / edge handles. */
function drawCropUI(ctx, b, rotation, c, u) {
  ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
  ctx.translate(b.cx, b.cy); ctx.rotate(rotation * Math.PI / 180);
  const x0 = -b.w / 2, y0 = -b.h / 2, x = x0 + c.x * b.w, y = y0 + c.y * b.h, w = c.w * b.w, h = c.h * b.h;
  ctx.beginPath(); ctx.rect(x0, y0, b.w, b.h); ctx.rect(x, y, w, h); ctx.fillStyle = 'rgba(0,0,0,.58)'; ctx.fill('evenodd');
  ctx.strokeStyle = 'rgba(255,255,255,.45)'; ctx.lineWidth = u;
  ctx.beginPath(); for (const f of [1 / 3, 2 / 3]) { ctx.moveTo(x + w * f, y); ctx.lineTo(x + w * f, y + h); ctx.moveTo(x, y + h * f); ctx.lineTo(x + w, y + h * f); } ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5 * u; ctx.strokeRect(x, y, w, h);
  const L = Math.min(18 * u, w / 3, h / 3); ctx.lineWidth = 4.5 * u; ctx.lineCap = 'round'; ctx.strokeStyle = '#ffd23f';
  ctx.beginPath();
  for (const [px, py, sx, sy] of [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]]) { ctx.moveTo(px + sx * L, py); ctx.lineTo(px, py); ctx.lineTo(px, py + sy * L); }
  for (const [px, py, hor] of [[x + w / 2, y, 1], [x + w / 2, y + h, 1], [x, y + h / 2, 0], [x + w, y + h / 2, 0]]) { if (hor) { ctx.moveTo(px - L / 2, py); ctx.lineTo(px + L / 2, py); } else { ctx.moveTo(px, py - L / 2); ctx.lineTo(px, py + L / 2); } }
  ctx.stroke(); ctx.restore();
}

export function fontCss(text, px) { let c = (FONTS[text.font] || FONTS.bold).css.replace('SIZE', px.toFixed(1)); if (text.bold) c = c.replace(/^\d{3} /, '900 '); if (text.italic) c = 'italic ' + c; return c; }
/* per-letter layout cache: positions of every visible character, with its word / line index */
const layoutCache = new Map();
function textLayout(ctx, lines, align, key) {
  let L = layoutCache.get(key); if (L) return L;
  const chars = []; let ci = 0, wi = 0;
  const widths = lines.map(l => ctx.measureText(l).width), w = Math.max(1, ...widths);
  lines.forEach((l, li) => {
    const lw = widths[li], J = align === 'justify' && li < lines.length - 1, gaps = J ? (l.match(/ /g) || []).length : 0, gx = gaps ? (w - lw) / gaps : 0;
    const x0 = align === 'left' || gaps ? -w / 2 : align === 'right' ? w / 2 - lw : -lw / 2; let prev = 0, inWord = false, sp = 0;
    for (let j = 0; j < l.length; j++) { const ch = l[j], nx = ctx.measureText(l.slice(0, j + 1)).width; if (ch === ' ') sp++;
      if (ch.trim()) { if (!inWord) { inWord = true; } chars.push({ ch, x: x0 + (prev + nx) / 2 + sp * gx, li, ci: ci++, wi }); } else if (inWord) { inWord = false; wi++; }
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
  if (shape === 'ribbon2' || shape === 'scroll') return { bw: w + p * 7, bh: h + p * 2 };
  if (shape === 'ticket' || shape === 'tape' || shape === 'brush' || shape === 'torn') return { bw: w + p * 3.4, bh: h + p * 2.2 };
  if (shape === 'oval') return { bw: (w + p * 2) * 1.3, bh: (h + p * 2) * 1.45 };
  if (shape === 'frame2' || shape === 'corners') return { bw: w + p * 3.4, bh: h + p * 2.6 };
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
    case 'chat': case 'chatR': { const r = Math.min(px * .55, bh / 2), R = shape === 'chatR'; rr(ctx, x, y, bw, bh, r); const tx = R ? x + bw - r * .6 : x + r * .6; ctx.moveTo(tx - px * .2, y + bh - 2); ctx.quadraticCurveTo(tx + (R ? px * .5 : -px * .5), y + bh + px * .1, tx + (R ? px * .55 : -px * .55), y + bh + px * .18); ctx.quadraticCurveTo(tx + (R ? px * .1 : -px * .1), y + bh + px * .12, tx + px * .2, y + bh - 2); ctx.closePath(); break; }
    case 'oval': { ctx.ellipse(0, 0, bw / 2, bh / 2, 0, 0, 7); ctx.moveTo(-bw * .18, bh * .4); ctx.quadraticCurveTo(-bw * .3, bh * .62, -bw * .4, bh * .68); ctx.quadraticCurveTo(-bw * .16, bh * .62, -bw * .04, bh * .46); ctx.closePath(); break; }
    case 'callout': { rr(ctx, x, y, bw, bh, px * .12); ctx.moveTo(x + bw * .08, y + bh - 1); ctx.lineTo(x + bw * .08, y + bh + px * .6); ctx.lineTo(x + bw * .2, y + bh - 1); ctx.closePath(); break; }
    case 'ribbon2': { const n = px * .55, e = px * .9; ctx.rect(x + e, y, bw - 2 * e, bh); const a = y + bh * .22, m = y + bh * .61, z = y + bh, E = e * 1.4, poly = P => { P.forEach(([u, v], k) => ctx[k ? 'lineTo' : 'moveTo'](u, v)); ctx.closePath(); };
      poly([[x, a], [x + E, a], [x + E, z], [x, z], [x + n * .9, m]]); poly([[x + bw - E, a], [x + bw, a], [x + bw - n * .9, m], [x + bw, z], [x + bw - E, z]]); break; }
    case 'scroll': { const e = px * .5; ctx.moveTo(x + e, y); ctx.quadraticCurveTo(0, y + px * .25, x + bw - e, y); ctx.lineTo(x + bw - e, y + bh); ctx.quadraticCurveTo(0, y + bh + px * .25, x + e, y + bh); ctx.closePath(); for (const X of [x + e, x + bw - e]) { ctx.moveTo(X + e * .5, y + bh / 2); ctx.ellipse(X, y + bh / 2, e * .5, bh / 2 + px * .05, 0, 0, 7); } break; }
    case 'ticket': { const r = px * .22; ctx.moveTo(x, y); ctx.lineTo(x + bw, y); ctx.lineTo(x + bw, -r); ctx.arc(x + bw, 0, r, -Math.PI / 2, Math.PI / 2, true); ctx.lineTo(x + bw, y + bh); ctx.lineTo(x, y + bh); ctx.lineTo(x, r); ctx.arc(x, 0, r, Math.PI / 2, -Math.PI / 2, true); ctx.closePath(); break; }
    case 'torn': { const n = Math.max(8, Math.round(bw / (px * .18))); ctx.moveTo(x, y); for (let i = 1; i <= n; i++) ctx.lineTo(x + bw * i / n, y + (i % 2 ? px * .07 : -px * .03) * (1 + (i * 7 % 3) * .4)); for (let i = n; i >= 0; i--) ctx.lineTo(x + bw * i / n, y + bh + (i % 2 ? -px * .07 : px * .03) * (1 + (i * 5 % 3) * .4)); ctx.closePath(); break; }
    case 'tape': { const n = 6; ctx.moveTo(x, y); ctx.lineTo(x + bw, y); for (let i = 1; i <= n; i++) ctx.lineTo(x + bw - (i % 2 ? px * .12 : 0), y + bh * i / n); ctx.lineTo(x, y + bh); for (let i = n - 1; i >= 0; i--) ctx.lineTo(x + (i % 2 ? px * .12 : 0), y + bh * i / n); ctx.closePath(); break; }
    case 'brush': { const n = 14; ctx.moveTo(x + px * .3, y + px * .06); for (let i = 1; i <= n; i++) ctx.lineTo(x + px * .3 + (bw - px * .5) * i / n, y + px * (.04 + .06 * ((i * 7) % 3))); ctx.quadraticCurveTo(x + bw + px * .15, 0, x + bw - px * .25, y + bh - px * .05); for (let i = n; i >= 0; i--) ctx.lineTo(x + px * .2 + (bw - px * .5) * i / n, y + bh - px * (.03 + .06 * ((i * 5) % 3))); ctx.quadraticCurveTo(x - px * .2, 0, x + px * .3, y + px * .06); ctx.closePath(); break; }
    case 'frame2': case 'corners': rr(ctx, x, y, bw, bh, shape === 'frame2' ? px * .06 : 0); break;
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
  if (shape === 'frame2' || shape === 'corners') { const c = (T.bubbleBorder && T.bubbleBorder.color) || '#fff', lw = Math.max(1, px * .03); ctx.strokeStyle = c; ctx.lineWidth = lw; ctx.shadowColor = 'transparent'; const x = -bw / 2, y = -bh / 2;
    if (shape === 'frame2') { ctx.strokeRect(x, y, bw, bh); ctx.strokeRect(x + px * .12, y + px * .12, bw - px * .24, bh - px * .24); }
    else { const g = Math.min(bw, bh) * .3; ctx.beginPath(); for (const [X, Y, sx, sy] of [[x, y, 1, 1], [x + bw, y, -1, 1], [x, y + bh, 1, -1], [x + bw, y + bh, -1, -1]]) { ctx.moveTo(X + sx * g, Y); ctx.lineTo(X, Y); ctx.lineTo(X, Y + sy * g); } ctx.lineWidth = lw * 1.6; ctx.stroke(); } }
  ctx.restore();
}
/* fill paint: solid colour or a gradient laid out over the whole text block (ox, oy = where this glyph sits in the block) */
function fillPaint(ctx, T, w, h, ox, oy, idx) {
  if (T.tex) return texPaint(ctx, T.tex, w, h, ox, oy);
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
  P.push(...fxPasses(ctx, T, px, sc, lh, 'pre'));
  if (s2) P.push(stroke(outer, T.stroke2.color));
  if (ow) P.push((g, x, y) => stroke(ow, T.outlineColor || '#000')(g, x, y));
  P.push((g, x, y) => { const gl = (g.glow || 0) * px * sc + (T.glow ? T.glow.blur * px * sc : 0);
    if (gl > .002) { ctx.shadowColor = T.glow ? T.glow.color : T.color; ctx.shadowBlur = gl; } else ctx.shadowBlur = 0;
    ctx.fillStyle = g.color || fillPaint(ctx, T, w, h, g.ox, g.oy, g.i); ctx.fillText(g.s, x, y);
    if (T.glow && gl > .002) ctx.fillText(g.s, x, y);   // neon: a second pass makes the glow strong
    ctx.shadowBlur = 0; });
  P.push(...fxPasses(ctx, T, px, sc, lh, 'post'));
  if (T.gloss) P.push((g, x, y) => { const gr = ctx.createLinearGradient(0, y - lh / 2, 0, y + lh * 0.05); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = gr; ctx.fillText(g.s, x, y); });
  return P;
}
/** Draw a text clip (exported for the animation picker tiles). local = clip-local time (drives text animations). */
export function drawText(ctx, W, H, clip, tr, local = 0) {
  let T = clip.text; const unit = Math.min(W, H) / 1080, px = T.size * unit;
  ensureFont(T.font);
  const cm = T.caseMode, raw = String(T.content || ''), lines = (cm === 'upper' ? raw.toUpperCase() : cm === 'lower' ? raw.toLowerCase() : cm === 'title' ? raw.toLowerCase().replace(/(^|\s)(\S)/g, (m, a, b) => a + b.toUpperCase()) : raw).split('\n');
  const plan = clip.anim ? textAnimPlan(clip, local, clipDur(clip)) : null, B = plan ? plan.block : null;
  ctx.save();
  ctx.font = fontCss(T, px); ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; if ('letterSpacing' in ctx) ctx.letterSpacing = (T.track ? T.track * px : 0).toFixed(2) + 'px';
  const lh = px * 1.18 * (T.lineH || 1), widths = lines.map(l => ctx.measureText(l).width), w = Math.max(1, ...widths), h0 = lh * lines.length;
  const curve = Math.max(-1, Math.min(1, T.curve || 0)), curved = Math.abs(curve) > 0.01;
  const R = curved ? w / (Math.abs(curve) * Math.PI) : 0, sag = curved ? R * (1 - Math.cos(w / 2 / R)) : 0, h = h0 + sag;
  const shape = bubbleOf(T), sc = tr.scale * (B ? B.s : 1);
  const { bw, bh } = shape ? bubbleSize(shape, w, h, px) : { bw: w + px * 0.2, bh: h + px * 0.2 };
  const ext = T.extrude ? T.extrude.depth * px : 0, deco = (T.outline ? (T.outlineW ?? 0.14) * px : 0) + (T.stroke2 ? 2 * T.stroke2.w * px : 0);
  const SB = T.sub && T.sub.text ? T.sub : null, spx = SB ? px * (SB.scale || .32) : 0, sgap = SB ? px * (SB.gap ?? .28) : 0, sext = SB ? spx + sgap : 0;
  const dpad = T.deco ? decoPad(T.deco, w, h + 2 * sext, px) : { x: 0, y: 0 };
  const cx = tr.x * W, cy = tr.y * H, box = { cx, cy, w: Math.max(bw + (shape ? 0 : deco), w + dpad.x) * tr.scale, h: Math.max(bh + (shape ? 0 : deco + ext) + (shape === 'speech' ? px * 0.55 : 0) + 2 * sext, h + 2 * sext + dpad.y) * tr.scale };
  const alpha = Math.max(0, Math.min(1, tr.opacity * (B ? B.a : 1)));
  if (alpha <= 0.0005 || (B && (B.reveal <= 1e-4 || Math.abs(B.s * B.sx * B.s * B.sy) < 1e-6))) { ctx.restore(); return box; }
  ctx.globalAlpha = alpha;
  ctx.translate(cx, cy); ctx.rotate((tr.rotation + (B ? B.rot : 0)) * Math.PI / 180); ctx.scale(tr.scale * (B ? B.s * B.sx : 1), tr.scale * (B ? B.s * B.sy : 1));
  if (B) { if (Math.abs(B.skx) > 1e-4) ctx.transform(1, 0, B.skx, 1, 0, 0); ctx.translate(B.dx * px, B.dy * px);
    if (B.blur > .002) ctx.filter = `blur(${(B.blur * px * tr.scale).toFixed(2)}px)`;
    if (B.reveal < 1) { ctx.beginPath(); ctx.rect(-bw / 2 - px, -bh / 2 - px, (bw + px) * B.reveal + px, bh + 2 * px); ctx.clip(); } }
  if (shape) drawBubble(ctx, T, shape, bw, bh, px, sc);
  if (T.deco) drawDeco(ctx, T.deco, w, h + 2 * sext, px, T);
  const ax = T.align === 'left' ? -w / 2 : T.align === 'right' ? w / 2 : 0;
  if (T.align === 'justify') T = { ...T, align: lines.length > 1 ? 'justify' : 'center' };
  const passes = textPasses(ctx, T, px, w, h, sc, lh), perChar = (T.align === 'justify' && lines.length > 1) || curved || (plan && plan.units.length) || (T.fill && T.fill.dir === 'letters');
  if (!perChar) {
    ctx.textAlign = T.align === 'justify' ? 'center' : T.align || 'center';
    const gs = lines.map((l, i) => ({ s: l, y: -h0 / 2 + lh * (i + 0.5), glow: B ? B.glow : 0, ox: 0, oy: 0, i }));
    for (const P of passes) for (const g of gs) P(g, ax, g.y);
  } else {
    // per-letter engine: every animation picks its own unit (letter / word / line) and stagger; curved text bends the letters onto an arc
    const Lo = textLayout(ctx, lines, T.align || 'center', ctx.font + '|' + (T.track || 0) + '|' + (T.align || 'center') + '|' + lines.join('\n') + '|' + fontsVersion);
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
  if (SB) { ctx.save(); ctx.shadowBlur = 0; ctx.filter = 'none'; ctx.font = fontCss({ font: SB.font || T.font }, spx); if ('letterSpacing' in ctx) ctx.letterSpacing = ((SB.track ?? .25) * spx).toFixed(2) + 'px'; ctx.textAlign = T.align || 'center';
    ctx.fillStyle = SB.color || T.color; if (SB.glow) { ctx.shadowColor = SB.glow; ctx.shadowBlur = spx * .8 * sc; } const sy = SB.pos === 'above' ? -h0 / 2 - sgap - spx / 2 : h0 / 2 + sgap + spx / 2; ctx.fillText(SB.text, ax, sy); ctx.restore(); }
  if (T.under) { ctx.save(); ctx.shadowBlur = 0; ctx.filter = 'none'; ctx.fillStyle = T.color; widths.forEach((lw, i) => { const L = T.align === 'justify' && i < lines.length - 1 ? w : lw, x0 = T.align === 'left' || (T.align === 'justify' && i < lines.length - 1) ? -w / 2 : T.align === 'right' ? w / 2 - L : -L / 2; ctx.fillRect(x0, -h0 / 2 + lh * (i + 0.5) + px * .56, L, Math.max(1, px * .06)); }); ctx.restore(); }
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
  if (b.type === 'text') { const r = 9 * u; ctx.shadowBlur = 2 * u;
    ctx.fillStyle = '#ff3b5c'; ctx.beginPath(); ctx.arc(-b.w / 2, -b.h / 2, r, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6 * u; ctx.beginPath(); const q = r * .42; ctx.moveTo(-b.w / 2 - q, -b.h / 2 - q); ctx.lineTo(-b.w / 2 + q, -b.h / 2 + q); ctx.moveTo(-b.w / 2 + q, -b.h / 2 - q); ctx.lineTo(-b.w / 2 - q, -b.h / 2 + q); ctx.stroke();
    ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(b.w / 2, b.h / 2, r, 0, 7); ctx.fill(); ctx.strokeStyle = '#222'; ctx.beginPath(); ctx.arc(b.w / 2, b.h / 2, r * .5, -2.6, 1.2); ctx.stroke(); }
  ctx.restore();
}
/** Text-box corner handles: 'del' (top-left ×) or 'rot' (bottom-right rotate/scale). */
export function handleAt(b, x, y, u) { if (!b || b.type !== 'text') return null; const a = -b.rotation * Math.PI / 180, dx = x - b.cx, dy = y - b.cy;
  const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a), R = 22 * u;
  if (Math.hypot(lx + b.w / 2, ly + b.h / 2) < R) return 'del'; if (Math.hypot(lx - b.w / 2, ly - b.h / 2) < R) return 'rot'; return null; }
/** Hit test on rendered boxes (top-most first). */
export function hitTest(boxes, x, y) {
  for (let i = boxes.length - 1; i >= 0; i--) { const b = boxes[i], a = -b.rotation * Math.PI / 180, dx = x - b.cx, dy = y - b.cy;
    const lx = dx * Math.cos(a) - dy * Math.sin(a), ly = dx * Math.sin(a) + dy * Math.cos(a);
    if (Math.abs(lx) <= b.w / 2 && Math.abs(ly) <= b.h / 2) return b; }
  return null;
}

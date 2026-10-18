/* Pro editing tools (panels + operations): Crop / Flip / Rotate, Mask, Cutout (chroma key), Blend & layers,
   Main track <-> Overlay, Freeze frame, Reverse, Replace, Speed curve, background blur and safe-area guides.
   All edits go through the store (undo works); rendering lives in render.js / pro.js (preview == export). */
import { S, act, live, select, selected } from './store.js';
import { find, clipDur, clipEnd, hasSource, newClip, addToMain, split, setCurve, moveToTrack, moveLayer, layerOf, setProp, srcTime, avgSpeed, normalize, hasKeyframes } from './project.js';
import { openSheet, closeSheet, slider, chips } from './panels.js';
import { KEYFRAME_PROPS, CROP_PROPS, MASK_PROPS, propAt } from './registry.js';
import { BLEND_MODES, MASKS, MASK_DEFAULTS, CROP_RATIOS, KEY_DEFAULTS, cropAt } from './pro.js';
import { CURVE_PRESETS, presetById, cvV, validCurve, MIN_V, MAX_V } from './speedcurve.js';
import { media, importFile, decodeAudio } from './media.js';
import { openSource } from './framesource.js';
import { renderFrame } from './render.js';
import { keepPitch } from './audio.js';
import { fmtS } from './timeline.js';
import { icon } from './icons.js';

let X = null;   // app context: { player, timeline, toast, speedSheet }
export function initProTools(ctx) { X = ctx; X.player.guides = localStorage.getItem('evs-guides') || null; }
const $ = s => document.querySelector(s);
const editSel = fn => live(p => { const f = find(p, S.sel); f && fn(f.clip, p); });
const cur = () => selected()?.clip;
const Lt = c => Math.max(0, Math.min(clipDur(c), X.player.t - c.start));
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const hint = t => el('p', 'hint', t);
const btn = (label, id, on, onclick) => { const b = el('button', 'chipbtn' + (on ? ' on' : '')); b.innerHTML = label; if (id) b.id = id; b.onclick = onclick; return b; };
const row = (...kids) => { const r = el('div', 'toggles'); r.append(...kids); return r; };
const kfNote = c => hasKeyframes(c) ? hint(`Animated clip: changes set a keyframe at ${fmtS(Lt(c))}.`) : hint('Tip: add a keyframe (◆) to animate these values.');
const propSlider = (prop, id, label) => { const d = KEYFRAME_PROPS[prop], c = cur(); return slider(label || d.label, { min: d.min, max: d.max, step: d.step, value: propAt(c, prop, Lt(c)), fmt: d.fmt, id, onInput: v => editSel(cl => setProp(cl, prop, v, Lt(cl))) }); };
const isPic = c => c.type === 'video' || c.type === 'image';

/* ---------- displayed size of the picture (after rotation metadata + Rotate 90) ---------- */
function shownSize(c) {
  const s = X.player.source(c), r = media.get(c.mediaId); let w = s ? s.w : r?.width || 16, h = s ? s.h : r?.height || 9;
  if (s && s.rot && ((s.rot % 180) + 180) % 180 === 90) [w, h] = [h, w];
  if ((c.rot90 || 0) % 2) [w, h] = [h, w];
  return { w, h };
}

/* ---------------- Crop / straighten / flip / rotate ---------------- */
export function cropSheet() {
  const c0 = cur(); if (!c0) return;
  X.player.cropEdit = c0.id; X.player.requestDraw();
  openSheet('Crop', body => {
    const L = () => Lt(cur()), crop = () => cropAt(cur(), L()) || { x: 0, y: 0, w: 1, h: 1, angle: 0 };
    const ratioChips = chips(CROP_RATIOS.map(r => ({ value: r.id, label: r.name })), c0.crop?.ratio || 'free', id => {
      editSel(cl => { ensure(cl); cl.crop.ratio = id; const r = ratioOf(id); if (r) setC(cl, fitRatio(cropAt(cl, Lt(cl)), r, 1)); }); sync(); }, 'tabs cropratios');
    const sz = slider('Size', { min: 0.05, max: 1, step: 0.001, value: crop().w, fmt: v => Math.round(v * 100) + '%', id: 'cropSize', onInput: v => editSel(cl => { ensure(cl); const o = cropAt(cl, Lt(cl)), r = ratioOf(cl.crop.ratio);
      if (r) setC(cl, fitRatio(o, r, v)); else { const cx = o.x + o.w / 2, cy = o.y + o.h / 2, k = v / o.w, h = Math.min(1, o.h * k), w = Math.min(1, v); setC(cl, { w, h, x: Math.max(0, Math.min(1 - w, cx - w / 2)), y: Math.max(0, Math.min(1 - h, cy - h / 2)) }); } }) });
    const ws = slider('Width', { min: 0.05, max: 1, step: 0.001, value: crop().w, fmt: v => Math.round(v * 100) + '%', id: 'cropW', onInput: v => editSel(cl => { ensure(cl); const o = cropAt(cl, Lt(cl)), cx = o.x + o.w / 2; setC(cl, { w: v, x: Math.max(0, Math.min(1 - v, cx - v / 2)) }); }) });
    const hs = slider('Height', { min: 0.05, max: 1, step: 0.001, value: crop().h, fmt: v => Math.round(v * 100) + '%', id: 'cropH', onInput: v => editSel(cl => { ensure(cl); const o = cropAt(cl, Lt(cl)), cy = o.y + o.h / 2; setC(cl, { h: v, y: Math.max(0, Math.min(1 - v, cy - v / 2)) }); }) });
    const px = slider('Move left / right', { min: 0, max: 1, step: 0.001, value: crop().x + crop().w / 2, fmt: v => Math.round(v * 100) + '%', id: 'cropX', onInput: v => editSel(cl => { ensure(cl); const o = cropAt(cl, Lt(cl)); setC(cl, { x: Math.max(0, Math.min(1 - o.w, v - o.w / 2)) }); }) });
    const py = slider('Move up / down', { min: 0, max: 1, step: 0.001, value: crop().y + crop().h / 2, fmt: v => Math.round(v * 100) + '%', id: 'cropY', onInput: v => editSel(cl => { ensure(cl); const o = cropAt(cl, Lt(cl)); setC(cl, { y: Math.max(0, Math.min(1 - o.h, v - o.h / 2)) }); }) });
    const st = slider('Straighten', { min: -45, max: 45, step: 0.5, value: crop().angle, fmt: v => (Math.round(v * 10) / 10) + '°', id: 'cropAngle', onInput: v => editSel(cl => setC(cl, { angle: v })) });
    const sync = () => { const o = crop(), free = !ratioOf(cur().crop?.ratio || 'free'); sz.set(o.w); ws.set(o.w); hs.set(o.h); px.set(o.x + o.w / 2); py.set(o.y + o.h / 2); st.set(o.angle); ws.hidden = hs.hidden = !free; sz.hidden = free; };
    const r90 = btn(icon('rotate', 16) + ' Rotate 90°', 'rot90', false, () => { editSel(cl => { cl.rot90 = ((cl.rot90 || 0) + 1) % 4; if (!cl.rot90) delete cl.rot90; const r = cl.crop && ratioOf(cl.crop.ratio); if (r) setC(cl, fitRatio(cropAt(cl, Lt(cl)), r)); }); sync(); });
    const fh = btn(icon('fliph', 16) + ' Flip ↔', 'flipH', !!c0.flipH, () => { editSel(cl => { cl.flipH = !cl.flipH; if (!cl.flipH) delete cl.flipH; }); fh.classList.toggle('on', !!cur().flipH); });
    const fv = btn(icon('flipv', 16) + ' Flip ↕', 'flipV', !!c0.flipV, () => { editSel(cl => { cl.flipV = !cl.flipV; if (!cl.flipV) delete cl.flipV; }); fv.classList.toggle('on', !!cur().flipV); });
    const rs = btn('Reset', 'cropReset', false, () => { editSel(cl => { delete cl.crop; delete cl.flipH; delete cl.flipV; delete cl.rot90; for (const k of CROP_PROPS) delete (cl.keyframes || {})[k]; }); ratioChips.setActive('free'); fh.classList.remove('on'); fv.classList.remove('on'); sync(); });
    cropSync = sync;
    body.append(hint('Drag the corners or edges on the picture to crop; drag inside to move the crop.'), ratioChips, sz, ws, hs, px, py, st, row(r90, fh, fv, rs), kfNote(c0)); sync();
  }, { className: 'tall', onClose: () => { X.player.cropEdit = null; cropSync = null; cropDrag = null; X.player.requestDraw(); } });
}

/* crop handles on the preview (while the Crop sheet is open) */
let cropSync = null, cropDrag = null;
const ensure = cl => { cl.crop ||= { x: 0, y: 0, w: 1, h: 1, angle: 0, ratio: 'free' }; };
const setC = (cl, o) => { ensure(cl); const t = Lt(cl); for (const [k, p] of [['x', 'cropX'], ['y', 'cropY'], ['w', 'cropW'], ['h', 'cropH'], ['angle', 'straighten']]) if (o[k] != null) setProp(cl, p, Math.round(o[k] * 10000) / 10000, t); };
const ratioOf = id => { const R = CROP_RATIOS.find(r => r.id === id); if (!R || !R.r) return 0; if (R.r < 0) { const s = shownSize(cur()); return s.w / s.h; } return R.r; };
// keep the centre, fit the requested ratio inside the picture
const fitRatio = (o, r, size) => { const s = shownSize(cur()), cx = o.x + o.w / 2, cy = o.y + o.h / 2; let w = size ?? o.w, h = w * s.w / (s.h * r);
  if (h > 1) { const k = 1 / h; h = 1; w *= k; } if (w > 1) { const k = 1 / w; w = 1; h *= k; }
  return { w, h, x: Math.max(0, Math.min(1 - w, cx - w / 2)), y: Math.max(0, Math.min(1 - h, cy - h / 2)) }; };
const cropBox = () => X.player.cropEdit && X.player.boxes && X.player.boxes.find(b => b.id === X.player.cropEdit && b.cropEdit);
const toUV = (b, pos) => { const a = -(b.rotation || 0) * Math.PI / 180, dx = pos.x - b.cx, dy = pos.y - b.cy;
  return { u: (dx * Math.cos(a) - dy * Math.sin(a)) / b.w + 0.5, v: (dx * Math.sin(a) + dy * Math.cos(a)) / b.h + 0.5 }; };
/** Pointer down on the preview: grab a crop corner / edge / the inside. Returns true when the crop took the pointer. */
export function cropDragStart(pos) {
  const b = cropBox(), c = cur(); if (!b || !c || c.id !== X.player.cropEdit) return false;
  const o = cropAt(c, Lt(c)) || { x: 0, y: 0, w: 1, h: 1 }, { u, v } = toUV(b, pos);
  const tu = Math.max(14 * (X.player.canvas.width / X.player.canvas.getBoundingClientRect().width || 1), 0) / b.w, tv = tu * b.w / b.h;   // ~14 css px
  const nearL = Math.abs(u - o.x) < tu, nearR = Math.abs(u - (o.x + o.w)) < tu, nearT = Math.abs(v - o.y) < tv, nearB = Math.abs(v - (o.y + o.h)) < tv;
  const inU = u > o.x - tu && u < o.x + o.w + tu, inV = v > o.y - tv && v < o.y + o.h + tv;
  let mode = '';
  if (inV && nearL) mode += 'l'; else if (inV && nearR) mode += 'r';
  if (inU && nearT) mode += 't'; else if (inU && nearB) mode += 'b';
  if (!mode && u > o.x && u < o.x + o.w && v > o.y && v < o.y + o.h) mode = 'move';
  if (!mode) return false;
  cropDrag = { mode, o: { ...o }, u, v };
  return true;
}
export function cropDragMove(pos) {
  if (!cropDrag) return; const b = cropBox(); if (!b) return;
  const { u, v } = toUV(b, pos), d = cropDrag, o = d.o, m = d.mode, MIN = 0.05, cl01 = x => Math.max(0, Math.min(1, x));
  editSel(cl => {
    ensure(cl); const r = ratioOf(cl.crop.ratio);
    if (m === 'move') { setC(cl, { x: Math.max(0, Math.min(1 - o.w, o.x + u - d.u)), y: Math.max(0, Math.min(1 - o.h, o.y + v - d.v)) }); return; }
    let x0 = o.x, y0 = o.y, x1 = o.x + o.w, y1 = o.y + o.h;
    if (m.includes('l')) x0 = Math.min(x1 - MIN, cl01(u)); if (m.includes('r')) x1 = Math.max(x0 + MIN, cl01(u));
    if (m.includes('t')) y0 = Math.min(y1 - MIN, cl01(v)); if (m.includes('b')) y1 = Math.max(y0 + MIN, cl01(v));
    if (r) {   // locked ratio: the dragged side drives the size, the opposite corner / edge centre stays put
      const s = shownSize(cl), k = s.w / (s.h * r);   // h = w * k in normalised units
      let w = x1 - x0, h = y1 - y0;
      if (m === 't' || m === 'b') w = h / k; else h = w * k;
      const ax = m.includes('l') ? o.x + o.w : m.includes('r') ? o.x : o.x + o.w / 2, ay = m.includes('t') ? o.y + o.h : m.includes('b') ? o.y : o.y + o.h / 2;
      const fx = m.includes('l') ? 1 : m.includes('r') ? 0 : 0.5, fy = m.includes('t') ? 1 : m.includes('b') ? 0 : 0.5;
      const lim = Math.min(fx ? ax / fx : Infinity, fx < 1 ? (1 - ax) / (1 - fx) : Infinity, (fy ? ay / fy : Infinity) / k, (fy < 1 ? (1 - ay) / (1 - fy) : Infinity) / k);
      w = Math.max(MIN, Math.min(w, lim)); h = w * k;
      x0 = ax - fx * w; y0 = ay - fy * h; x1 = x0 + w; y1 = y0 + h;
    }
    setC(cl, { x: x0, y: y0, w: x1 - x0, h: y1 - y0 });
  });
  cropSync && cropSync();
}
export function cropDragEnd() { const was = !!cropDrag; cropDrag = null; return was; }

/* ---------------- Mask ---------------- */
const shapeIcon = id => {
  const p = { none: '<circle cx="12" cy="12" r="8"/><path d="M6.5 17.5l11-11"/>', linear: '<path d="M2 13h20"/><path d="M4 9h16" opacity=".4"/><path d="M7 5h10" opacity=".2"/>', mirror: '<path d="M2 8h20M2 16h20"/><path d="M4 12h16" opacity=".35"/>',
    circle: '<circle cx="12" cy="12" r="8"/>', rect: '<rect x="4" y="6" width="16" height="12" rx="3"/>', heart: '<path d="M12 20s-7-4.6-8.6-9.2C2.2 7 5.8 4 8.6 5.6c1.5.8 2.4 2.1 3.4 3.4 1-1.3 1.9-2.6 3.4-3.4C18.2 4 21.8 7 20.6 10.8 19 15.4 12 20 12 20z"/>',
    star: '<path d="M12 3l2.7 5.7 6.3.8-4.6 4.3 1.2 6.2L12 17l-5.6 3 1.2-6.2L3 9.5l6.3-.8z"/>' }[id];
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round">${p}</svg>`;
};
export function maskSheet() {
  const c0 = cur(); if (!c0) return;
  openSheet('Mask', body => {
    const shapes = chips(MASKS.map(m => ({ value: m.id, html: `${shapeIcon(m.id)}<span>${m.name}</span>` })), c0.mask?.shape || 'none', id => {
      editSel(cl => { if (id === 'none') { delete cl.mask; for (const k of MASK_PROPS) delete (cl.keyframes || {})[k]; return; }
        const d = MASK_DEFAULTS[id], old = cl.mask; cl.mask = { x: old?.x ?? 0.5, y: old?.y ?? 0.5, w: d.w, h: d.h, rot: old?.rot ?? 0, feather: old?.feather ?? 0.1, round: old?.round ?? 0.2, invert: !!old?.invert, shape: id };
        for (const k of ['maskW', 'maskH']) delete (cl.keyframes || {})[k]; });
      fill(); }, 'curves masks');
    const ctl = el('div', 'maskctl');
    const fill = () => { ctl.innerHTML = ''; const c = cur(), m = c.mask; if (!m) { ctl.append(hint('Pick a shape: only the part inside it stays visible.')); return; }
      const inv = btn('Invert', 'maskInvert', !!m.invert, () => { editSel(cl => { cl.mask.invert = !cl.mask.invert; }); inv.classList.toggle('on', !!cur().mask.invert); });
      const kids = [propSlider('maskX', 'maskX', 'Position X'), propSlider('maskY', 'maskY', 'Position Y')];
      if (m.shape !== 'linear') kids.push(propSlider('maskW', 'maskW', m.shape === 'mirror' ? 'Band width' : 'Width'));
      if (m.shape !== 'linear' && m.shape !== 'mirror') kids.push(propSlider('maskH', 'maskH', 'Height'));
      kids.push(propSlider('maskRot', 'maskRot', 'Rotate'), propSlider('maskFeather', 'maskFeather', 'Feather'));
      if (m.shape === 'rect') kids.push(slider('Round corners', { min: 0, max: 1, step: 0.01, value: m.round ?? 0.2, fmt: v => Math.round(v * 100) + '%', id: 'maskRound', onInput: v => editSel(cl => { cl.mask.round = v; }) }));
      if (m.shape === 'mirror') { const w = kids.find(k => k.querySelector('#maskW')); w && w.querySelector('input').addEventListener('input', e => editSel(cl => setProp(cl, 'maskH', +e.target.value, Lt(cl)))); }
      ctl.append(...kids, row(inv), kfNote(c)); };
    body.append(shapes, ctl); fill();
  }, { className: 'tall' });
}

/* ---------------- Cutout (chroma key) ---------------- */
let pickHook = null;
/** Called by the preview on a tap; returns true when the tap was used (colour picking). */
export function previewTap(pos) { if (!pickHook) return false; const f = pickHook; pickHook = null; f(pos); return true; }
/** Colour of the picture (without the key) at canvas position x, y — averaged over 5x5 pixels. */
export async function sampleColor(x, y) {
  const P = X.player;
  for (let i = 0; i < 30; i++) {   // wait (max ~1.5 s) until every visible video has its frame
    const act = S.project.tracks.flatMap(t => t.clips).filter(c => c.type === 'video' && c.start <= P.t && P.t < clipEnd(c));
    if (act.every(c => P.source(c))) break; await new Promise(r => setTimeout(r, 50)); }
  const cv = P.canvas, W = cv.width, H = cv.height, c = Object.assign(document.createElement('canvas'), { width: W, height: H }), g = c.getContext('2d', { willReadFrequently: true });
  renderFrame(g, W, H, S.project, P.t, cl => P.source(cl), { noKey: true });
  const d = g.getImageData(Math.max(0, Math.round(x) - 2), Math.max(0, Math.round(y) - 2), 5, 5).data; let r = 0, gg = 0, b = 0; const n = d.length / 4;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
  return '#' + [r, gg, b].map(v => Math.round(v / n).toString(16).padStart(2, '0')).join('');
}
export function cutoutSheet() {
  const c0 = cur(); if (!c0) return;
  openSheet('Cutout', body => {
    const K = () => cur().key || { ...KEY_DEFAULTS, on: false };
    const ensure = cl => { cl.key ||= { ...KEY_DEFAULTS, on: true }; };
    const tg = el('button', 'hdtoggle'); tg.id = 'keyToggle';
    const paint = () => { const k = K(); tg.classList.toggle('on', !!k.on); tg.innerHTML = `${icon('cutout', 26)}<span><b>Chroma key</b><small>${k.on ? 'On — the picked colour is removed' : 'Off'}</small></span><i class="sw"></i>`; sw.querySelector('i').style.background = k.color; sw.querySelector('span').textContent = k.color; };
    tg.onclick = () => { editSel(cl => { ensure(cl); cl.key.on = !cl.key.on; }); paint(); };
    const sw = el('div', 'keycolor'); sw.innerHTML = '<i></i><span></span>';
    const pk = btn(icon('picker', 16) + ' Pick colour on the video', 'keyPick', false, () => {
      pk.classList.add('on'); X.toast('Tap the colour to remove in the preview', 2600);
      pickHook = async pos => { pk.classList.remove('on'); const col = await sampleColor(pos.x, pos.y); editSel(cl => { ensure(cl); cl.key.on = true; cl.key.color = col; }); paint(); X.toast('Colour picked: ' + col); }; });
    const quick = chips([{ value: '#00b140', label: 'Green screen' }, { value: '#0047bb', label: 'Blue screen' }, { value: '#00ff00', label: 'Pure green' }], null, v => { editSel(cl => { ensure(cl); cl.key.on = true; cl.key.color = v; }); paint(); }, 'tabs');
    const sl = (k, label, id) => slider(label, { min: 0, max: 1, step: 0.01, value: K()[k] ?? KEY_DEFAULTS[k], fmt: v => Math.round(v * 100) + '%', id, onInput: v => editSel(cl => { ensure(cl); cl.key[k] = v; }) });
    body.append(row(tg), row(sw, pk), quick, sl('strength', 'Strength', 'keyStrength'), sl('shadow', 'Shadows', 'keyShadow'), sl('spill', 'Remove colour spill', 'keySpill'), sl('feather', 'Edge feather', 'keyFeather'),
      hint('Put the green-screen video on an Overlay line above your background, then pick its colour.'));
    paint();
  }, { className: 'tall', onClose: () => { pickHook = null; } });
}

/* ---------------- Blend, opacity, layers ---------------- */
export function blendSheet() {
  const c0 = cur(); if (!c0) return;
  openSheet('Blend', body => {
    const op = propSlider('opacity', 'blendOpacity', 'Opacity');
    const modes = chips(BLEND_MODES.map(b => ({ value: b.id, label: b.name })), c0.blend || 'normal', v => editSel(cl => { if (v === 'normal') delete cl.blend; else cl.blend = v; }), 'blendmodes');
    body.append(modes, op);
    const f = find(S.project, c0.id);
    if (f.track.kind === 'overlay') {
      const info = el('p', 'hint'); const upd = () => { const l = layerOf(S.project, S.sel); info.textContent = l ? `Layer ${l.n} of ${l.of} (higher layers cover lower ones).` : ''; };
      const up = btn('Bring forward', 'layerUp', false, () => { act(p => moveLayer(p, S.sel, +1)); upd(); X.timeline.render(); });
      const dn = btn('Send backward', 'layerDown', false, () => { act(p => moveLayer(p, S.sel, -1)); upd(); X.timeline.render(); });
      body.append(row(up, dn), info); upd();
    }
    body.append(kfNote(c0));
  });
}
export function toTrack(kind) {
  const f = selected(); if (!f) return;
  const r = act(p => moveToTrack(p, f.clip.id, kind, X.player.t));
  if (!r) { X.toast('Can’t move this clip'); return; }
  select(r.id); X.toast(kind === 'overlay' ? 'Moved to an Overlay line (picture-in-picture)' : 'Moved to the Main track');
}
export function layerOrderSheet() { blendSheet(); }

/* ---------------- Freeze frame ---------------- */
const busy = (on, txt) => { $('#busy').hidden = !on; if (txt) $('#busyText').textContent = txt; };
async function grabFrame(c, t) {
  const rec = media.get(c.mediaId), st = Math.max(0, srcTime(c, t)), src = await openSource(rec, st);
  try { const f = await src.frameAt(st); const q = ((f.rot || 0) % 180 + 180) % 180 === 90, w = q ? f.h : f.w, h = q ? f.w : f.h;
    const cv = new OffscreenCanvas(w, h), x = cv.getContext('2d'); x.translate(w / 2, h / 2); if (f.rot) x.rotate(f.rot * Math.PI / 180); x.drawImage(f.img, -f.w / 2, -f.h / 2, f.w, f.h);
    return await cv.convertToBlob({ type: 'image/png' }); }
  finally { src.close(); }
}
const COPY = ['transform', 'filter', 'adjust', 'enhance', 'crop', 'mask', 'blend', 'key', 'flipH', 'flipV', 'rot90', 'fit'];
export const FREEZE_DURS = [1, 2, 3, 5];
/** Pick how long the frozen picture stays on screen, then freeze. */
export function freezeSheet() {
  const f = selected(); if (!f || f.clip.type !== 'video') { X.toast('Select a video clip'); return; }
  let dur = +localStorage.getItem('studio.freezeDur') || 3; if (!FREEZE_DURS.includes(dur)) dur = 3;
  openSheet('Freeze frame', body => {
    const ch = chips(FREEZE_DURS.map(d => ({ value: d, label: d + ' s' })), dur, v => { dur = +v; }, 'tabs freezedur');
    const go = el('button', 'btn primary big', 'Freeze'); go.id = 'freezeGo';
    go.onclick = () => { localStorage.setItem('studio.freezeDur', dur); closeSheet(); freezeFrame(dur); };
    body.append(hint('The picture under the white line stays still for:'), ch, go);
  }, { gesture: false });
}
export async function freezeFrame(dur = 3) {
  const f = selected(); if (!f || f.clip.type !== 'video') { X.toast('Select a video clip'); return null; }
  const c = f.clip, t = X.player.t; if (!(t >= c.start - 1e-6 && t <= clipEnd(c) + 1e-6)) { X.toast('Move the white line onto the clip'); return null; }
  X.player.pause(); busy(true, 'Freezing frame…');
  try {
    const blob = await grabFrame(c, Math.min(t, clipEnd(c) - 1e-3));
    const rec = await importFile(new File([blob], `freeze-${Math.round(t * 100)}.png`, { type: 'image/png' }));
    const L = Math.max(0, Math.min(clipDur(c), t - c.start));
    let made = null;
    act(p => {
      const ff = find(p, c.id), cc = ff.clip, local = t - cc.start, kind = ff.track.kind;
      const fz = newClip('image', { mediaId: rec.id, dur }); for (const k of COPY) if (cc[k] != null) fz[k] = JSON.parse(JSON.stringify(cc[k]));
      // static copy of the animated values at the frozen moment
      for (const k of Object.keys(cc.keyframes || {})) { const v = propAt(cc, k, L), d = KEYFRAME_PROPS[k]; if (!d || k === 'volume') continue; if (d.set) d.set(fz, v); else fz.transform[k] = v; }
      const b = local > 0.1 && local < clipDur(cc) - 0.1 ? split(p, cc.id, t) : null;
      if (kind === 'main') { const main = p.tracks.find(x => x.kind === 'main'), i = main.clips.findIndex(x => x.id === cc.id); main.clips.splice(local <= 0.1 ? i : i + 1, 0, fz); normalize(p); }
      else { for (const x of ff.track.clips) if (x.start >= t - 1e-6 && x.id !== cc.id) x.start += dur; if (local <= 0.1) cc.start += dur; fz.start = t; ff.track.clips.push(fz); normalize(p); }
      made = fz;
    });
    select(made.id); X.toast(`Freeze frame added (${dur}s)`); return made;
  } catch (e) { console.warn(e); X.toast('Could not freeze this frame'); return null; }
  finally { busy(false); }
}

/* ---------------- Reverse ---------------- */
let reversing = false;
/** Make a reversed copy of rec between source times a..b (video + sound). onProgress(0..1). Returns a File. */
export async function reverseFile(rec, a, b, onProgress = () => {}) {
  const fps = 30, N = Math.max(1, Math.round((b - a) * fps)), SEG = 24;
  const probe = await openSource(rec, a), f0 = await probe.frameAt(a); probe.close();
  const q = ((f0.rot || 0) % 180 + 180) % 180 === 90, sw = q ? f0.h : f0.w, sh = q ? f0.w : f0.h, k = Math.min(1, 1080 / Math.min(sw, sh));
  const W = Math.max(2, Math.round(sw * k / 2) * 2), H = Math.max(2, Math.round(sh * k / 2) * 2);
  const { pickCodecs, defaultBitrate } = await import('./export.js');
  const codecs = await pickCodecs(W, H, fps, defaultBitrate(W, H, fps)); if (!codecs) throw new Error('This browser cannot encode video');
  const abuf = rec.hasAudio === false ? null : await decodeAudio(rec, false).catch(() => null);
  const target = new Mp4Muxer.ArrayBufferTarget();
  const muxer = new Mp4Muxer.Muxer({ target, fastStart: false, firstTimestampBehavior: 'offset', video: { codec: codecs.video.mux, width: W, height: H }, ...(abuf ? { audio: { codec: codecs.audio.mux, sampleRate: 48000, numberOfChannels: 2 } } : {}) });
  let fail = null;
  const venc = new VideoEncoder({ output: (ch, m) => muxer.addVideoChunk(ch, m), error: e => { fail = e; } }); venc.configure(codecs.video.config);
  if (abuf) {   // sound: the same span, played backwards
    const oac = new OfflineAudioContext(2, Math.max(1, Math.round((b - a) * 48000)), 48000), s0 = Math.floor(a * abuf.sampleRate), s1 = Math.min(abuf.length, Math.ceil(b * abuf.sampleRate));
    const rb = new AudioBuffer({ length: Math.max(1, s1 - s0), numberOfChannels: abuf.numberOfChannels, sampleRate: abuf.sampleRate });
    for (let i = 0; i < abuf.numberOfChannels; i++) { const d = abuf.getChannelData(i).slice(s0, s1).reverse(); rb.copyToChannel(d, i); }
    const src = oac.createBufferSource(); src.buffer = rb; src.connect(oac.destination); src.start(0); const mix = await oac.startRendering();
    const aenc = new AudioEncoder({ output: (ch, m) => muxer.addAudioChunk(ch, m), error: e => { fail = e; } }); aenc.configure(codecs.audio.config);
    const Lc = mix.getChannelData(0), Rc = mix.getChannelData(1);
    for (let i = 0; i < mix.length; i += 4096) { const n = Math.min(4096, mix.length - i), data = new Float32Array(n * 2); data.set(Lc.subarray(i, i + n), 0); data.set(Rc.subarray(i, i + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i / 48000 * 1e6), data }); aenc.encode(ad); ad.close(); }
    await aenc.flush(); aenc.close();
  }
  const cv = new OffscreenCanvas(W, H), x = cv.getContext('2d', { alpha: false }); x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high';
  // output frame i shows source time b - (i + 0.5) / fps. Decode forwards in short segments from the end, encode each backwards.
  const tOf = i => Math.max(a, Math.min(b - 1e-3, b - (i + 0.5) / fps));
  for (let s = 0; s < N; s += SEG) {
    const idx = []; for (let i = Math.min(N - 1, s + SEG - 1); i >= s; i--) idx.push(i);   // ascending source time
    const src = await openSource(rec, tOf(idx[0])), frames = [];
    try { for (const i of idx) { const f = await src.frameAt(tOf(i)); x.save(); x.fillStyle = '#000'; x.fillRect(0, 0, W, H); x.translate(W / 2, H / 2); if (f.rot) x.rotate(f.rot * Math.PI / 180);
        const kk = (q ? H : W) / f.w; x.scale(kk, kk); x.drawImage(f.img, -f.w / 2, -f.h / 2, f.w, f.h); x.restore(); frames.push([i, await createImageBitmap(cv)]); } }
    finally { src.close(); }
    for (let j = frames.length - 1; j >= 0; j--) { const [i, bm] = frames[j]; if (fail) throw fail;
      const vf = new VideoFrame(bm, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) }); venc.encode(vf, { keyFrame: i % fps === 0 }); vf.close(); bm.close();
      if (venc.encodeQueueSize > 6) await new Promise(r => setTimeout(r, 5)); }
    onProgress(Math.min(1, (s + SEG) / N));
  }
  await venc.flush(); if (fail) throw fail; venc.close(); muxer.finalize();
  const base = (rec.name || 'clip').replace(/\.[^.]+$/, '');
  return new File([target.buffer], `${base}-reversed.mp4`, { type: 'video/mp4' });
}
export async function reverseClip() {
  const f = selected(); if (!f || f.clip.type !== 'video') { X.toast('Select a video clip'); return null; }
  if (reversing) return null; const c = f.clip;
  if (c.reversed) {   // reverse again = back to the original (instant)
    act(p => { const cc = find(p, c.id).clip, o = cc.reversed; cc.mediaId = o.mediaId; cc.in = o.in; cc.out = o.out; delete cc.reversed; normalize(p); });
    X.toast('Back to the original direction'); return find(S.project, c.id).clip;
  }
  X.player.pause(); reversing = true; busy(true, 'Reversing… 0%');
  try {
    const rec = media.get(c.mediaId), t0 = performance.now();
    const file = await reverseFile(rec, c.in, c.out, p => busy(true, `Reversing… ${Math.round(p * 100)}%`));
    busy(true, 'Reversing… adding'); const nr = await importFile(file);
    act(p => { const cc = find(p, c.id).clip; cc.reversed = { mediaId: cc.mediaId, in: cc.in, out: cc.out }; const len = cc.out - cc.in; cc.mediaId = nr.id; cc.in = 0; cc.out = Math.min(nr.duration, len); normalize(p); });
    X.toast(`Reversed in ${((performance.now() - t0) / 1000).toFixed(1)}s`); return find(S.project, c.id).clip;
  } catch (e) { console.warn(e); X.toast('Could not reverse this clip: ' + (e.message || e)); return null; }
  finally { reversing = false; busy(false); }
}

/* ---------------- Replace ---------------- */
/** Swap the clip's media, keeping its place, length, speed, effects, keyframes and animations. */
export function replaceWith(p, clipId, rec) {
  const f = find(p, clipId); if (!f || !rec || rec.type === 'audio') return null; const c = f.clip, D = clipDur(c);
  if (rec.type === 'image') { c.type = 'image'; c.mediaId = rec.id; c.dur = Math.round(D * 1e6) / 1e6; for (const k of ['in', 'out', 'curve', 'reversed', 'keepPitch', 'muteAudio']) delete c[k]; c.speed = 1; }
  else { const need = hasSource(c) ? c.out - c.in : D, len = Math.min(rec.duration, need);
    if (c.type !== 'video') { c.speed = 1; delete c.dur; }
    c.type = 'video'; c.mediaId = rec.id; c.in = 0; c.out = Math.round(len * 1e6) / 1e6; delete c.reversed; }
  delete c.placeholder; normalize(p); return c;
}
export function replaceClip() {
  const f = selected(); if (!f || !isPic(f.clip)) return;
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'video/*,image/*'; inp.style.display = 'none'; document.body.append(inp);
  inp.onchange = async () => { const file = inp.files[0]; inp.remove(); if (!file) return; busy(true, 'Replacing…');
    try { const rec = await importFile(file), id = f.clip.id, before = clipDur(f.clip); act(p => replaceWith(p, id, rec)); const c = find(S.project, id)?.clip;
      X.toast(c && clipDur(c) + 1e-3 < before ? 'Replaced — the new video is shorter, so the clip got shorter' : 'Clip replaced — edits kept'); }
    catch (e) { console.warn(e); X.toast('Could not open ' + file.name); } finally { busy(false); } };
  inp.click();
}

/* ---------------- Speed curve ---------------- */
const VY = v => Math.log(v / MIN_V) / Math.log(MAX_V / MIN_V), YV = y => MIN_V * Math.pow(MAX_V / MIN_V, y);
export function curveSpeedSheet() {
  const c0 = cur(); if (!c0 || !hasSource(c0)) return;
  openSheet('Speed curve', body => {
    const tabs = chips([{ value: 'normal', label: 'Normal' }, { value: 'curve', label: 'Curve' }], 'curve', v => { if (v === 'normal') X.speedSheet(); }, 'tabs');
    let selPt = -1;
    const pts = () => cur().curve?.pts || null;
    const presets = chips([{ value: 'none', label: 'None' }, ...CURVE_PRESETS.map(p => ({ value: p.id, label: p.name }))], c0.curve?.id || 'none', id => {
      editSel((cl, p) => setCurve(p, cl.id, id === 'none' ? null : { id, pts: presetById(id).pts.map(q => ({ ...q })) })); selPt = -1; draw(); upd(); if (id !== 'none') X.player.playRange(cur().start, clipEnd(cur()), cur().start); }, 'tabs curvepresets');
    const wrap = el('div', 'curvebox'), cv = document.createElement('canvas'); cv.id = 'curveCanvas'; wrap.append(cv);
    const info = el('p', 'hint'); info.id = 'curveInfo';
    const dpr = Math.min(2, devicePixelRatio || 1); let CW = 340, CH = 168;
    const geo = () => { CW = Math.max(200, wrap.clientWidth || 340); cv.width = Math.round(CW * dpr); cv.height = Math.round(CH * dpr); cv.style.width = CW + 'px'; cv.style.height = CH + 'px'; };
    const P = 14, toXY = q => [P + q.x * (CW - 2 * P), P + (1 - VY(q.v)) * (CH - 2 * P)];
    const draw = () => { const g = cv.getContext('2d'), c = cur(); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, CW, CH);
      g.fillStyle = '#17171f'; g.fillRect(0, 0, CW, CH); g.font = '10px system-ui'; g.fillStyle = '#8a8a99';
      for (const v of [0.1, 0.5, 1, 2, 5, 10]) { const y = P + (1 - VY(v)) * (CH - 2 * P); g.strokeStyle = v === 1 ? '#555566' : '#2a2a36'; g.beginPath(); g.moveTo(P, y); g.lineTo(CW - P, y); g.stroke(); g.fillText(v + 'x', 2, y - 2); }
      const pp = pts(); if (!pp) { g.fillStyle = '#aaa'; g.font = '13px system-ui'; g.textAlign = 'center'; g.fillText('Pick a curve above', CW / 2, CH / 2); g.textAlign = 'left'; return; }
      g.strokeStyle = '#ffcc33'; g.lineWidth = 2.2; g.beginPath(); for (let i = 0; i <= 120; i++) { const u = i / 120, [x, y] = toXY({ x: u, v: cvV({ pts: pp }, u) }); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
      pp.forEach((q, i) => { const [x, y] = toXY(q); g.fillStyle = i === selPt ? '#ffcc33' : '#fff'; g.beginPath(); g.arc(x, y, i === selPt ? 7 : 5.5, 0, 7); g.fill(); });
      const u = (X.player.t - c.start) / clipDur(c); if (u >= 0 && u <= 1) { const x = P + u * (CW - 2 * P); g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, 4); g.lineTo(x, CH - 4); g.stroke(); } };
    const upd = () => { const c = cur(); info.textContent = `Clip length: ${fmtS(clipDur(c))} (original ${fmtS(c.out - c.in)})` + (c.curve ? ` · average ${avgSpeed(c).toFixed(2)}x` : ''); };
    let drag = null;
    cv.addEventListener('pointerdown', e => { const pp = pts(); if (!pp) return; const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      let best = -1, bd = 22; pp.forEach((q, i) => { const [x, y] = toXY(q), d = Math.hypot(x - mx, y - my); if (d < bd) { bd = d; best = i; } });
      selPt = best; draw(); if (best < 0) return; cv.setPointerCapture(e.pointerId); drag = { i: best }; X.player.pause(); });
    cv.addEventListener('pointermove', e => { if (!drag) return; const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      editSel((cl, p) => { const q = cl.curve.pts.map(o => ({ ...o })), i = drag.i, n = q.length;
        let v = YV(Math.max(0, Math.min(1, 1 - (my - P) / (CH - 2 * P)))); if (Math.abs(v - 1) < 0.06) v = 1; q[i].v = Math.round(v * 100) / 100;
        if (i > 0 && i < n - 1) q[i].x = Math.round(Math.max(q[i - 1].x + 0.02, Math.min(q[i + 1].x - 0.02, (mx - P) / (CW - 2 * P))) * 1000) / 1000;
        setCurve(p, cl.id, { id: 'custom', pts: q }); });
      presets.setActive('custom'); draw(); upd(); });
    const up = () => { if (drag) { drag = null; X.timeline.render(); } }; cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
    const add = btn('+ Add point', 'curveAdd', false, () => { const c = cur(); let q = c.curve ? c.curve.pts.map(o => ({ ...o })) : presetById('custom').pts.map(o => ({ ...o }));
      let u = (X.player.t - c.start) / clipDur(c); if (!(u > 0.02 && u < 0.98) || q.some(o => Math.abs(o.x - u) < 0.03)) { let g = 0, at = 0.5; for (let i = 1; i < q.length; i++) if (q[i].x - q[i - 1].x > g) { g = q[i].x - q[i - 1].x; at = (q[i].x + q[i - 1].x) / 2; } u = at; }
      q.push({ x: Math.round(u * 1000) / 1000, v: Math.round(cvV({ pts: q.slice().sort((a, b) => a.x - b.x) }, u) * 100) / 100 }); q.sort((a, b) => a.x - b.x);
      editSel((cl, p) => setCurve(p, cl.id, { id: 'custom', pts: q })); selPt = q.findIndex(o => Math.abs(o.x - u) < 1e-3); presets.setActive('custom'); draw(); upd(); });
    const del = btn('Delete point', 'curveDel', false, () => { const q = pts(); if (!q || selPt <= 0 || selPt >= q.length - 1) { X.toast('Tap a middle point first'); return; }
      const n = q.filter((_, i) => i !== selPt); editSel((cl, p) => setCurve(p, cl.id, { id: 'custom', pts: n })); selPt = -1; presets.setActive('custom'); draw(); upd(); });
    const kp = btn('Keep voice pitch', 'curvePitch', keepPitch(c0), () => { editSel(cl => { cl.keepPitch = !keepPitch(cl); }); kp.classList.toggle('on', keepPitch(cur())); });
    const play = btn(icon('play', 14) + ' Preview', 'curvePlay', false, () => { const c = cur(); X.player.playRange(c.start, clipEnd(c), c.start); });
    body.append(tabs, presets, wrap, row(add, del, kp, play), info, hint('Drag the points: up = faster, down = slower. The sound follows the curve.'));
    requestAnimationFrame(() => { geo(); draw(); }); upd();
    const tick = () => { if (!document.body.contains(cv)) return; draw(); requestAnimationFrame(tick); }; requestAnimationFrame(tick);
  }, { className: 'tall' });
}

/* ---------------- Background blur + safe-area guides ---------------- */
export const BG_BLUR = [{ value: 0, label: 'Off' }, { value: 0.3, label: 'Light' }, { value: 0.6, label: 'Medium' }, { value: 1, label: 'Strong' }];
export function bgBlurControls() {
  const w = el('div'); w.append(el('p', 'hint', 'Blurred background (fills the bars around the picture with a blurred copy of the clip)'),
    chips(BG_BLUR, S.project.bgBlur || 0, v => live(p => { if (v) p.bgBlur = v; else delete p.bgBlur; }), 'tabs bgblur'));
  return w;
}
/* Unsafe zones (fractions of a portrait frame) where each app draws its buttons and captions. */
export const GUIDES = {
  tiktok: { name: 'TikTok', zones: [[0, 0, 1, 0.09], [0.84, 0.36, 0.16, 0.5], [0, 0.8, 1, 0.2]] },
  reels: { name: 'Reels', zones: [[0, 0, 1, 0.08], [0.85, 0.48, 0.15, 0.42], [0, 0.78, 1, 0.22]] },
  shorts: { name: 'Shorts', zones: [[0, 0, 1, 0.07], [0.84, 0.42, 0.16, 0.45], [0, 0.81, 1, 0.19]] },
};
export function drawGuides(ctx, W, H, id) {
  const G = GUIDES[id]; if (!G) return; ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalAlpha = 1; ctx.filter = 'none'; ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = 'rgba(255,70,90,.22)'; for (const [x, y, w, h] of G.zones) ctx.fillRect(x * W, y * H, w * W, h * H);
  const u = Math.min(W, H) / 360; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.2 * u; ctx.setLineDash([5 * u, 4 * u]);
  const top = Math.max(...G.zones.filter(z => z[1] === 0).map(z => z[3])), bot = Math.min(...G.zones.filter(z => z[1] + z[3] >= 0.999 && z[1] > 0).map(z => z[1])), right = Math.min(...G.zones.filter(z => z[0] > 0).map(z => z[0]));
  ctx.strokeRect(0.04 * W, top * H, (right - 0.04) * W, (bot - top) * H);
  ctx.setLineDash([]); ctx.font = `600 ${11 * u}px system-ui`; ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.fillText(G.name + ' safe area', 0.05 * W, top * H + 14 * u); ctx.restore();
}
export function guidesSheet() {
  openSheet('Safe area', body => {
    body.append(hint('Shows where TikTok, Reels and Shorts put their buttons and captions. Only on the preview — never in the exported video.'),
      chips([{ value: 'none', label: 'None' }, ...Object.entries(GUIDES).map(([k, g]) => ({ value: k, label: g.name }))], X.player.guides || 'none', v => {
        X.player.guides = v === 'none' ? null : v; if (X.player.guides) localStorage.setItem('evs-guides', v); else localStorage.removeItem('evs-guides'); X.player.requestDraw(); }, 'tabs guides'));
  }, { gesture: false });
}

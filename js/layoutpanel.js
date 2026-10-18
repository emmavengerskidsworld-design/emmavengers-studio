/* Canvas & layout panels (Batch 10): Canvas background sheet (colour / blur / gradient / pattern / image),
   Layout sheet (18 split-screen + collage layouts, gap, round corners, fills empty cells with new media) and the
   Mirror sheet (mirror / kaleidoscope / tiles on a clip). Data in the project; drawing in canvasbg.js + render.js. */
import { S, act, live, select, selected } from './store.js';
import { find, clipDur, clipEnd, newClip, addToKind, normalize } from './project.js';
import { openSheet, slider, chips, swatches } from './panels.js';
import { BG_COLORS, DEFAULT_TRANSFORM } from './registry.js';
import { GRADIENTS, PATTERNS, PATTERN_COLORS, LAYOUTS, layoutById, cellOf, layoutIcon } from './canvasbg.js';
import { media, importFile, kindOf } from './media.js';
import { bgBlurControls } from './protools.js';
import { EFFECTS } from './effects.js';

let X = null;   // { player, timeline, toast, busy }
export function initLayoutPanel(ctx) { X = ctx; }
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const hint = t => el('p', 'hint', t);
const isPic = c => c && (c.type === 'video' || c.type === 'image');
const aspectOf = p => { const [a, b] = String(p.aspect || '9:16').split(':').map(Number); return a && b ? a / b : 9 / 16; };

/* ---------------- Canvas background ---------------- */
export function canvasSheet(tab) {
  const cv0 = S.project.canvas; tab ||= cv0?.type === 'gradient' ? 'gradient' : cv0?.type === 'pattern' ? 'pattern' : cv0?.type === 'image' ? 'image' : 'color';
  openSheet('Canvas', body => {
    const pane = el('div', 'canpane'); pane.id = 'canvasPane';
    const tabs = chips([['color', 'Colour & blur'], ['gradient', 'Gradient'], ['pattern', 'Pattern'], ['image', 'Image']].map(([value, label]) => ({ value, label })), tab, v => { tab = v; fill(); }, 'tabs cantabs');
    const fill = () => { pane.innerHTML = ''; ({ color, gradient, pattern, image })[tab](pane); };
    body.append(hint('The canvas fills the empty space around a picture whose shape is different from the video, and the gaps of a layout.'), tabs, pane); fill();
  }, { className: 'tall' });
}
function color(pane) {
  pane.append(el('p', 'hint', 'Colour'), swatches(BG_COLORS, S.project.bg, v => live(p => { p.bg = v; if (p.canvas && p.canvas.type !== 'image') delete p.canvas; })));
  const pick = Object.assign(el('input'), { type: 'color', id: 'canvasColor', value: /^#[0-9a-f]{6}$/i.test(S.project.bg || '') ? S.project.bg : '#000000' });
  pick.oninput = () => live(p => { p.bg = pick.value; delete p.canvas; });
  const r = el('div', 'toggles'); r.append(el('span', 'hint', 'Any colour'), pick); pane.append(r);
  const bl = bgBlurControls(); bl.querySelectorAll('.chipbtn').forEach(b => b.addEventListener('click', () => live(p => { if (p.bgBlur) delete p.canvas; })));
  pane.append(bl);
}
function gradient(pane) {
  const cur = S.project.canvas?.type === 'gradient' ? S.project.canvas.id : null;
  const g = chips(GRADIENTS.map(gr => ({ value: gr.id, title: gr.name, html: `<i style="background:${gr.r ? `radial-gradient(circle, ${gr.s.join(',')})` : `linear-gradient(${gr.a}deg, ${gr.s.join(',')})`}"></i><span>${gr.name}</span>` })), cur,
    id => live(p => { p.canvas = { type: 'gradient', id }; delete p.bgBlur; }), 'cangrid gradgrid');
  pane.append(g);
}
function pattern(pane) {
  const c = S.project.canvas?.type === 'pattern' ? S.project.canvas : null; let pal = c ? PATTERN_COLORS.findIndex(q => q[0] === c.c1 && q[1] === c.c2) : 0; if (pal < 0) pal = 0;
  const set = o => live(p => { const q = p.canvas?.type === 'pattern' ? p.canvas : { type: 'pattern', id: 'dots', c1: PATTERN_COLORS[pal][0], c2: PATTERN_COLORS[pal][1], size: 12 }; p.canvas = { ...q, ...o }; delete p.bgBlur; });
  const g = chips(PATTERNS.map(pt => ({ value: pt.id, label: pt.name })), c?.id || null, id => set({ id }), 'cangrid patgrid');
  const cols = chips(PATTERN_COLORS.map((q, i) => ({ value: String(i), html: `<i style="background:linear-gradient(135deg, ${q[0]} 50%, ${q[1]} 50%)"></i>` })), String(pal), v => { pal = +v; set({ c1: PATTERN_COLORS[pal][0], c2: PATTERN_COLORS[pal][1] }); }, 'swatches patcols');
  const sz = slider('Size', { min: 4, max: 30, step: 1, value: 34 - (c?.size || 12), fmt: v => Math.round(v), id: 'patSize', onInput: v => set({ size: 34 - v }) });
  pane.append(g, el('p', 'hint', 'Colours'), cols, sz);
}
function image(pane) {
  const c = S.project.canvas?.type === 'image' ? S.project.canvas : null;
  const file = Object.assign(el('input'), { type: 'file', accept: 'image/*', id: 'canvasFile', hidden: true });
  file.onchange = async () => { const f = file.files[0]; if (!f) return; try { const rec = await importFile(f); live(p => { p.canvas = { type: 'image', mediaId: rec.id, blur: p.canvas?.blur || 0 }; delete p.bgBlur; }); pane.innerHTML = ''; image(pane); X.player.requestDraw(); } catch (e) { X.toast('Could not open ' + f.name); } };
  const b = el('button', 'chipbtn', c ? 'Change photo' : 'Choose a photo'); b.id = 'canvasPick'; b.onclick = () => { file.value = ''; file.click(); };
  const r = el('div', 'toggles'); r.append(b);
  if (c) { const rm = el('button', 'chipbtn', 'Remove'); rm.id = 'canvasNoImg'; rm.onclick = () => { live(p => { delete p.canvas; }); pane.innerHTML = ''; image(pane); }; r.append(rm); }
  pane.append(r, file);
  if (c) pane.append(slider('Blur', { min: 0, max: 1, step: .05, value: c.blur || 0, fmt: v => Math.round(v * 100) + '%', id: 'canvasImgBlur', onInput: v => live(p => { if (p.canvas?.type === 'image') p.canvas.blur = v; }) }));
  pane.append(hint('Use any photo as the background (it fills the frame).'));
}

/* ---------------- Layouts (split screen + collage) ---------------- */
/** Picture clips showing at time t: main track first, then overlays (bottom to top). */
export function clipsAt(p, t) {
  const out = [];
  for (const kind of ['main', 'overlay']) for (const tr of p.tracks.filter(x => x.kind === kind)) for (const c of tr.clips) if (isPic(c) && c.start <= t + 1e-6 && t < clipEnd(c) - 1e-6) out.push(c);
  return out;
}
/** Put the clips at the playhead into layout `id`; returns how many cells are still empty. */
export function applyLayout(id, { gap = .02, round = 0, t = X.player.t } = {}) {
  const L = layoutById(id); if (!L) return 0; let empty = 0, hidden = 0;
  act(p => { const cl = clipsAt(p, t), asp = aspectOf(p);
    cl.forEach((c, i) => { if (i < L.cells.length) { c.cell = cellOf(id, i, gap, round, asp); c.transform = { ...DEFAULT_TRANSFORM, ...(c.transform || {}), x: .5, y: .5, scale: 1, rotation: 0 }; } else c.cell = { off: true, lay: id, i, gap, r: round }; });   // extra clips wait off-screen until a bigger layout or “No layout”
    hidden = Math.max(0, cl.length - L.cells.length);
    empty = Math.max(0, L.cells.length - cl.length); });
  if (hidden) X.toast(`${hidden} more clip${hidden > 1 ? 's are' : ' is'} hidden by this layout — pick one with more cells or “No layout” to show ${hidden > 1 ? 'them' : 'it'}.`);
  return empty;
}
export function setLayoutStyle({ gap, round }, t = X.player.t) {
  live(p => { const asp = aspectOf(p); for (const c of clipsAt(p, t)) if (c.cell && !c.cell.off) c.cell = cellOf(c.cell.lay, c.cell.i, gap ?? c.cell.gap ?? 0, round ?? c.cell.r ?? 0, asp); });
}
export function clearLayout(t = X.player.t) { act(p => { for (const c of clipsAt(p, t)) if (c.cell) { delete c.cell; c.transform = { ...c.transform, x: .5, y: .5, scale: c.transform?.scale ?? 1 }; } }); }
/** New media for the empty cells: added to overlay tracks at the same time as the clip under the playhead. */
export async function fillCells(files, id, opts = {}) {
  const t = X.player.t, made = [];
  for (const f of files) { if (!['video', 'image'].includes(kindOf(f))) continue; try { made.push(await importFile(f)); } catch (e) { X.toast('Could not open ' + f.name); } }
  if (!made.length) return 0;
  act(p => { const anchor = clipsAt(p, t)[0], start = anchor ? anchor.start : t, len = anchor ? clipEnd(anchor) - start : 4;
    for (const rec of made) { const base = rec.type === 'image' ? { mediaId: rec.id, dur: len } : { mediaId: rec.id, in: 0, out: Math.min(rec.duration, len) };
      const c = newClip(rec.type, { ...base, transform: { ...DEFAULT_TRANSFORM } }); addToKind(p, 'overlay', c, start); } });
  return applyLayout(id, { ...opts, t });
}
export function layoutSheet() {
  const t = X.player.t, cur = clipsAt(S.project, t).find(c => c.cell && !c.cell.off)?.cell; let lay = cur?.lay || null, gap = cur?.gap ?? .02, round = cur?.r ?? 0;
  openSheet('Layout', body => {
    const file = Object.assign(el('input'), { type: 'file', accept: 'video/*,image/*', multiple: true, id: 'layoutFiles', hidden: true });
    file.onchange = async () => { const fs = [...file.files]; if (!fs.length) return; X.busy && X.busy(true, 'Adding to the layout…'); try { const e = await fillCells(fs, lay, { gap, round }); note(e); } finally { X.busy && X.busy(false); } X.timeline.render(); };
    const info = hint(''); info.id = 'layoutInfo';
    const note = e => { info.textContent = e ? `${e} empty cell${e > 1 ? 's' : ''}: tap “Add media” to fill ${e > 1 ? 'them' : 'it'}.` : 'Drag a cell’s picture to move it inside its cell, pinch to zoom.'; add.hidden = !e; };
    const counts = [2, 3, 4, 5, 6];
    const groups = el('div', 'laygroups');
    for (const n of counts) { const g = chips(LAYOUTS.filter(l => l.cells.length === n).map(l => ({ value: l.id, title: l.name, html: layoutIcon(l) })), lay, id => { lay = id; groups.querySelectorAll('.chipbtn').forEach(b => b.classList.toggle('on', b.dataset.v === id)); const e = applyLayout(id, { gap, round }); X.timeline.render(); note(e); if (e) { file.value = ''; file.click(); } }, 'laygrid');
      const row = el('div', 'layrow'); row.append(el('b', null, n + ' cells'), g); groups.append(row); }
    const sg = slider('Gap', { min: 0, max: .08, step: .005, value: gap, fmt: v => Math.round(v * 1000) / 10 + '%', id: 'layGap', onInput: v => { gap = v; setLayoutStyle({ gap }); } });
    const sr = slider('Round corners', { min: 0, max: 1, step: .05, value: round, fmt: v => Math.round(v * 100) + '%', id: 'layRound', onInput: v => { round = v; setLayoutStyle({ round }); } });
    const add = el('button', 'chipbtn', 'Add media'); add.id = 'layAdd'; add.onclick = () => { file.value = ''; file.click(); };
    const off = el('button', 'chipbtn', 'No layout'); off.id = 'layOff'; off.onclick = () => { clearLayout(); lay = null; groups.querySelectorAll('.chipbtn').forEach(b => b.classList.remove('on')); X.timeline.render(); note(0); };
    const r = el('div', 'toggles'); r.append(add, off);
    body.append(hint('Split screen and collage: the clips under the playhead fill the cells. The canvas background shows in the gaps.'), groups, sg, sr, r, info, file);
    note(lay ? Math.max(0, layoutById(lay).cells.length - clipsAt(S.project, t).length) : 0); if (!lay) add.hidden = true;
  }, { className: 'tall' });
}

/* ---------------- Mirror / kaleidoscope on a clip ---------------- */
export const MIRRORS = () => EFFECTS.filter(e => e.cat === 'mirror');
export function mirrorSheet() {
  const c0 = selected()?.clip; if (!isPic(c0)) return;
  openSheet('Mirror', body => {
    const g = chips([{ value: '', label: 'None' }, ...MIRRORS().map(e => ({ value: e.id, label: e.name }))], c0.mirror?.id || '', id => live(p => { const f = find(p, S.sel); if (!f) return; if (id) f.clip.mirror = { id }; else delete f.clip.mirror; }), 'mirgrid');
    g.id = 'mirrorGrid'; body.append(hint('Mirror the picture, turn it into a kaleidoscope or repeat it as tiles. Works together with filters and effects.'), g);
  });
}

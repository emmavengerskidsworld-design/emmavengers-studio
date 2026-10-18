/* Colour pro panels: Curves, HSL, Wheels, White balance (+ picker), LUTs (own + .cube import), Detail (vignette / grain /
   sharpen with keyframes) — for a clip or an adjustment layer. Edits go through the store (undo); pixels in effects.js. */
import { S, act, live, select, selected } from './store.js';
import { find, clipDur, newClip, addToKind, setProp, hasKeyframes, addKeyframe } from './project.js';
import { openSheet, slider, chips } from './panels.js';
import { KEYFRAME_PROPS, propAt } from './registry.js';
import { HSL_BANDS, CURVE_CH, CURVE_PRESETS, OWN_LUTS, spline, isIdentity, wbFromSample, parseCube, packLut, loadLut, LUT_BASE } from './colorpro.js';
import { setPickHook, sampleColor } from './protools.js';
import { fmtS } from './timeline.js';

let X = null;   // { player, timeline, toast }
export function initColorPanel(ctx) { X = ctx; }
const cur = () => selected()?.clip;
const editSel = fn => live(p => { const f = find(p, S.sel); f && fn(f.clip, p); });
const Lt = c => Math.max(0, Math.min(clipDur(c), X.player.t - c.start));
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const hint = t => el('p', 'hint', t);
const btn = (label, id, onclick, on) => { const b = el('button', 'chipbtn' + (on ? ' on' : '')); b.innerHTML = label; if (id) b.id = id; b.onclick = onclick; return b; };
const row = (...k) => { const r = el('div', 'toggles'); r.append(...k); return r; };
const col = cl => (cl.color ||= {});
export const isAdjLayer = c => !!(c && c.type === 'effect' && c.effect && c.effect.kind === 'adjust');

/** Root tool: add an adjustment layer (3 s, effects track) at the playhead and open its colour panel. */
export function addAdjustmentLayer() {
  const t = X.player.t, c = newClip('effect', { dur: 3, effect: { kind: 'adjust', id: 'adjust', amount: 1 }, color: { con: 1.1, sat: 1.15 } });
  act(p => addToKind(p, 'effect', c, t)); select(c.id); X.timeline.render();
  X.toast('Adjustment layer added: its colour, filter and effects change everything under it. Drag its edges to set the time range.');
  colorSheet('light');
}

export function colorSheet(tab = 'curves') {
  const c0 = cur(); if (!c0) return;
  openSheet(isAdjLayer(c0) ? 'Adjustment layer' : 'Colour', body => {
    const pane = el('div', 'colpane'); pane.id = 'colPane';
    const tabs = chips([['light', 'Light'], ['curves', 'Curves'], ['hsl', 'HSL'], ['wheels', 'Wheels'], ['wb', 'White balance'], ['lut', 'LUT'], ['detail', 'Detail']].map(([v, l]) => ({ value: v, label: l })), tab, v => { tab = v; fill(); }, 'tabs coltabs');
    const fill = () => { pane.innerHTML = ''; ({ light, curves, hsl, wheels, wb, lut, detail })[tab](pane); };
    const reset = btn('Reset colour', 'colProReset', () => { editSel(cl => { delete cl.color; }); fill(); });
    body.append(tabs, pane, row(reset)); fill();
  }, { className: 'tall' });
}
/* ---------- Light (exposure / contrast / saturation; adjustment layer intensity) ---------- */
function light(pane) {
  const c = cur(), q = c.color || {};
  const s = (label, k, min, max, def, id) => slider(label, { min, max, step: .01, value: q[k] ?? def, fmt: v => (k === 'ex' ? (v > 0 ? '+' : '') + v.toFixed(2) : Math.round(v * 100) + '%'), id, onInput: v => editSel(cl => { col(cl)[k] = v; }) });
  pane.append(s('Exposure', 'ex', -2, 2, 0, 'colEx'), s('Contrast', 'con', 0, 2, 1, 'colCon'), s('Saturation', 'sat', 0, 2, 1, 'colSat'));
  if (isAdjLayer(c)) pane.append(slider('Intensity', { min: 0, max: 1, step: .01, value: c.effect.amount ?? 1, fmt: v => Math.round(v * 100) + '%', id: 'adjAmount', onInput: v => editSel(cl => { cl.effect.amount = v; }) }),
    hint('An adjustment layer changes everything under it (main video, overlays, stickers) while it is on the timeline. Use Filters and Effects in its toolbar too.'));
}
/* ---------- Curves ---------- */
function curves(pane) {
  let ch = 'm';
  const cv = el('canvas', 'curvecv'); cv.id = 'curveCv'; cv.width = 600; cv.height = 600; const g = cv.getContext('2d');
  const chs = chips(CURVE_CH.map(([v, l]) => ({ value: v, label: l })), ch, v => { ch = v; draw(); }, 'curvech');
  const pts = () => { const q = cur().color?.curves?.[ch]; return q && q.length >= 2 ? q.map(p => [...p]) : [[0, 0], [1, 1]]; };
  const setPts = P => editSel(cl => { const k = (col(cl).curves ||= {}); k[ch] = P.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]); if (['m', 'r', 'g', 'b'].every(z => isIdentity(k[z]))) delete col(cl).curves; });
  const colr = { m: '#fff', r: '#ff5050', g: '#4fdc6a', b: '#4f8bff' };
  const M = 18, SX = x => M + x * (cv.width - 2 * M), SY = y => M + (1 - y) * (cv.width - 2 * M);
  const draw = () => { const W = cv.width, P = pts(), f = spline(P), I = W - 2 * M; g.clearRect(0, 0, W, W); g.fillStyle = '#16161c'; g.fillRect(0, 0, W, W);
    g.strokeStyle = 'rgba(255,255,255,.12)'; g.lineWidth = 2; for (let i = 0; i < 5; i++) { g.beginPath(); g.moveTo(SX(i / 4), M); g.lineTo(SX(i / 4), M + I); g.moveTo(M, SY(i / 4)); g.lineTo(M + I, SY(i / 4)); g.stroke(); }
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.moveTo(SX(0), SY(0)); g.lineTo(SX(1), SY(1)); g.stroke();
    for (const k of ['r', 'g', 'b', 'm']) if (k !== ch) { const q = cur().color?.curves?.[k]; if (q && !isIdentity(q)) { const ff = spline(q); g.strokeStyle = colr[k] + '66'; g.lineWidth = 2; g.beginPath(); for (let i = 0; i <= 100; i++) { const x = i / 100; g[i ? 'lineTo' : 'moveTo'](SX(x), SY(ff(x))); } g.stroke(); } }
    g.strokeStyle = colr[ch]; g.lineWidth = 5; g.beginPath(); for (let i = 0; i <= 150; i++) { const x = i / 150; g[i ? 'lineTo' : 'moveTo'](SX(x), SY(f(x))); } g.stroke();
    for (const [x, y] of P) { g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(SX(x), SY(y), 14, 0, 7); g.fill(); g.strokeStyle = '#000'; g.lineWidth = 3; g.stroke(); } };
  let drag = -1, P = null, lastTap = 0;
  const pos = e => { const r = cv.getBoundingClientRect(), m = M / cv.width, sc = 1 - 2 * m; return [Math.max(0, Math.min(1, ((e.clientX - r.left) / r.width - m) / sc)), Math.max(0, Math.min(1, 1 - ((e.clientY - r.top) / r.height - m) / sc))]; };
  cv.addEventListener('pointerdown', e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); P = pts(); const [x, y] = pos(e);
    drag = P.findIndex(([px, py]) => Math.hypot(px - x, py - y) < .06);
    const now = performance.now();
    if (drag >= 0 && now - lastTap < 350 && drag > 0 && drag < P.length - 1) { P.splice(drag, 1); setPts(P); drag = -1; draw(); return; }
    lastTap = now;
    if (drag < 0) { P.push([x, y]); P.sort((a, b) => a[0] - b[0]); drag = P.findIndex(p => p[0] === x && p[1] === y); setPts(P); draw(); } });
  cv.addEventListener('pointermove', e => { if (drag < 0) return; const [x, y] = pos(e), lo = drag ? P[drag - 1][0] + .01 : 0, hi = drag < P.length - 1 ? P[drag + 1][0] - .01 : 1;
    P[drag] = [drag === 0 ? Math.min(x, .4) : drag === P.length - 1 ? Math.max(x, .6) : Math.max(lo, Math.min(hi, x)), y]; setPts(P); draw(); });
  cv.addEventListener('pointerup', () => { drag = -1; });
  const pre = chips(CURVE_PRESETS.map(p => ({ value: p.id, label: p.name })), null, id => { const pr = CURVE_PRESETS.find(p => p.id === id); editSel(cl => { if (id === 'none') { delete col(cl).curves; return; } col(cl).curves = { m: pr.m, ...(pr.r ? { r: pr.r } : {}), ...(pr.g ? { g: pr.g } : {}), ...(pr.b ? { b: pr.b } : {}) }; }); draw(); }, 'curvepre');
  pane.append(chs, cv, hint('Tap to add a point, drag to move it, double-tap to remove it.'), pre); draw();
}
/* ---------- HSL ---------- */
function hsl(pane) {
  let band = 0;
  const get = () => cur().color?.hsl?.[band] || [0, 0, 0];
  const set = (i, v) => editSel(cl => { const h = (col(cl).hsl ||= Array.from({ length: 8 }, () => [0, 0, 0])); h[band] = [...(h[band] || [0, 0, 0])]; h[band][i] = v; marks(); });
  const bands = chips(HSL_BANDS.map(([id, name, hex], i) => ({ value: String(i), html: `<i style="background:${hex}"></i><span>${name}</span>` })), '0', v => { band = +v; sync(); }, 'hslbands');
  const sh = slider('Hue', { min: -60, max: 60, step: 1, value: 0, fmt: v => (v > 0 ? '+' : '') + Math.round(v) + '°', id: 'hslHue', onInput: v => set(0, v) });
  const ss = slider('Saturation', { min: -1, max: 1, step: .01, value: 0, fmt: v => (v > 0 ? '+' : '') + Math.round(v * 100), id: 'hslSat', onInput: v => set(1, v) });
  const sl = slider('Luminance', { min: -1, max: 1, step: .01, value: 0, fmt: v => (v > 0 ? '+' : '') + Math.round(v * 100), id: 'hslLum', onInput: v => set(2, v) });
  const sync = () => { const b = get(); sh.set(b[0]); ss.set(b[1]); sl.set(b[2]); };
  const marks = () => bands.querySelectorAll('.chipbtn').forEach(b => { const v = cur().color?.hsl?.[+b.dataset.v]; b.classList.toggle('set', !!v && v.some(x => Math.abs(x) > 1e-4)); });
  pane.append(bands, sh, ss, sl, hint('Pick a colour band, then shift its hue, make it stronger or paler, lighter or darker. Other colours stay as they are.')); sync(); marks();
}
/* ---------- Colour wheels ---------- */
const WHEELS = [['lift', 'Shadows (lift)', .25], ['gamma', 'Midtones (gamma)', .5], ['gain', 'Highlights (gain)', .5]];
function wheels(pane) {
  const wrap = el('div', 'wheels');
  for (const [k, label, scale] of WHEELS) {
    const box = el('div', 'wheel'), cv = el('canvas', 'wheelcv'); cv.width = cv.height = 220; cv.id = 'wheel-' + k; const g = cv.getContext('2d');
    const getPos = () => cur().color?.wheels?.pos?.[k] || [0, 0];
    const draw = () => { const R = 110; g.clearRect(0, 0, 220, 220);
      for (let a = 0; a < 360; a += 3) { g.fillStyle = `hsl(${a},90%,55%)`; g.beginPath(); g.moveTo(R, R); g.arc(R, R, R - 2, (a - 1.5 - 90) * Math.PI / 180, (a + 1.6 - 90) * Math.PI / 180); g.fill(); }
      const gr = g.createRadialGradient(R, R, 0, R, R, R); gr.addColorStop(0, 'rgba(40,40,46,1)'); gr.addColorStop(.85, 'rgba(40,40,46,.35)'); gr.addColorStop(1, 'rgba(40,40,46,0)'); g.fillStyle = gr; g.beginPath(); g.arc(R, R, R - 2, 0, 7); g.fill();
      const [px, py] = getPos(); g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.arc(R + px * (R - 14), R + py * (R - 14), 12, 0, 7); g.stroke(); };
    const apply = (px, py) => { const d = Math.min(1, Math.hypot(px, py)), ang = Math.atan2(py, px) + Math.PI / 2;   // 0 at the top = red
      const hue = ((ang * 180 / Math.PI) + 360) % 360, rgb = [0, 120, 240].map(o => Math.cos((hue - o) * Math.PI / 180) * 2 / 3);
      editSel(cl => { const w = (col(cl).wheels ||= {}); const m = (w[k] || [0, 0, 0, 0])[3] || 0; w[k] = [...rgb.map(x => Math.round(x * d * scale * 1000) / 1000), m]; (w.pos ||= {})[k] = [Math.round(px * 1000) / 1000, Math.round(py * 1000) / 1000]; }); draw(); };
    let on = false;
    const at = e => { const r = cv.getBoundingClientRect(); let x = ((e.clientX - r.left) / r.width - .5) * 2, y = ((e.clientY - r.top) / r.height - .5) * 2; const d = Math.hypot(x, y); if (d > 1) { x /= d; y /= d; } return [x, y]; };
    cv.addEventListener('pointerdown', e => { e.preventDefault(); on = true; cv.setPointerCapture(e.pointerId); apply(...at(e)); });
    cv.addEventListener('pointermove', e => { if (on) apply(...at(e)); }); cv.addEventListener('pointerup', () => { on = false; });
    cv.addEventListener('dblclick', () => apply(0, 0));
    const m = slider('Level', { min: -.5, max: .5, step: .01, value: cur().color?.wheels?.[k]?.[3] || 0, fmt: v => (v > 0 ? '+' : '') + Math.round(v * 100), id: 'wheelM-' + k,
      onInput: v => editSel(cl => { const w = (col(cl).wheels ||= {}); const a = [...(w[k] || [0, 0, 0, 0])]; a[3] = v; w[k] = a; }) });
    box.append(el('b', null, label), cv, m); wrap.append(box); draw();
  }
  pane.append(wrap, hint('Drag a wheel towards a colour to tint the shadows, midtones or highlights. Double-tap to centre it.'));
}
/* ---------- White balance ---------- */
function wb(pane) {
  const q = () => cur().color?.wb || { temp: 0, tint: 0 };
  const st = slider('Temperature', { min: -1.5, max: 1.5, step: .01, value: q().temp, fmt: v => (v > 0 ? 'warm +' : v < 0 ? 'cool ' : '') + Math.round(v * 100), id: 'wbTemp', onInput: v => editSel(cl => { col(cl).wb = { ...q(), temp: v }; }) });
  const sn = slider('Tint', { min: -1.5, max: 1.5, step: .01, value: q().tint, fmt: v => (v > 0 ? 'magenta +' : v < 0 ? 'green ' : '') + Math.round(v * 100), id: 'wbTint', onInput: v => editSel(cl => { col(cl).wb = { ...q(), tint: v }; }) });
  const pick = btn('Pick something white or grey', 'wbPick', () => { pick.classList.add('on'); X.toast('Tap something white or grey in the picture');
    setPickHook(async pos => { pick.classList.remove('on'); await pickWhite(pos.x, pos.y); const v = q(); st.set(v.temp); sn.set(v.tint); }); });
  pane.append(st, sn, row(pick, btn('Reset', 'wbReset', () => { editSel(cl => { delete col(cl).wb; }); st.set(0); sn.set(0); })), hint('The picker makes the colour you tap neutral, so the whole picture gets natural colours.'));
}
/** White balance from a point on the preview (canvas pixels): the picked colour becomes neutral. */
export async function pickWhite(x, y) {
  const hex = await sampleColor(x, y), rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)), d = wbFromSample(rgb);
  editSel(cl => { const w = col(cl).wb || { temp: 0, tint: 0 }; col(cl).wb = { temp: Math.max(-1.5, Math.min(1.5, (w.temp || 0) + d.temp)), tint: Math.max(-1.5, Math.min(1.5, (w.tint || 0) + d.tint)) }; });
  return { sample: rgb, wb: cur().color.wb };
}
/* ---------- LUTs ---------- */
function lut(pane) {
  const q = () => cur().color?.lut;
  const items = [{ value: '', label: 'None' }, ...OWN_LUTS.map(l => ({ value: l.id, label: l.name })), ...Object.entries(S.project.luts || {}).map(([id, L]) => ({ value: id, label: '⬆ ' + L.name }))];
  const grid = chips(items, q()?.id || '', async id => { if (id) await loadLut(id, S.project); editSel(cl => { if (!id) delete col(cl).lut; else col(cl).lut = { id, amount: q()?.amount ?? 1 }; }); }, 'lutgrid');
  const amt = slider('Strength', { min: 0, max: 1, step: .01, value: q()?.amount ?? 1, fmt: v => Math.round(v * 100) + '%', id: 'lutAmount', onInput: v => editSel(cl => { if (col(cl).lut) col(cl).lut.amount = v; }) });
  const file = Object.assign(el('input'), { type: 'file', accept: '.cube,text/plain', id: 'lutFile', hidden: true });
  file.onchange = async () => { const f = file.files[0]; if (!f) return; try { const L = parseCube(await f.text()); const id = 'u-' + Date.now().toString(36); L.title = L.title || f.name.replace(/\.cube$/i, '');
      act(p => { (p.luts ||= {})[id] = packLut(L); const cc = find(p, S.sel); if (cc) (cc.clip.color ||= {}).lut = { id, amount: 1 }; }); await loadLut(id, S.project); X.toast(`LUT “${L.title}” imported (${L.n}³)`); pane.innerHTML = ''; lut(pane); }
    catch (e) { X.toast('Could not read the LUT: ' + e.message); } };
  pane.append(grid, amt, row(btn('Import .cube LUT', 'lutImport', () => file.click())), file, hint('20 own looks, or import any 3D .cube LUT (from Resolve, Premiere, Photoshop…).'));
}
/* ---------- Detail: vignette / grain / sharpen with keyframes ---------- */
function detail(pane) {
  const c = cur();
  for (const [prop, id] of [['adjVignette', 'detVig'], ['adjGrain', 'detGrain'], ['adjSharpen', 'detSharp']]) {
    const d = KEYFRAME_PROPS[prop], r = el('div', 'detrow');
    const s = slider(d.label, { min: d.min, max: d.max, step: d.step, value: propAt(cur(), prop, Lt(cur())), fmt: d.fmt, id, onInput: v => editSel(cl => setProp(cl, prop, v, Lt(cl))) });
    const k = btn('◆', id + 'Kf', () => { editSel(cl => { const L = Lt(cl), a = ((cl.keyframes ||= {})[prop] ||= []), i = a.findIndex(x => Math.abs(x.t - L) < 1 / 60), v = propAt(cl, prop, L);
      if (i >= 0) a[i].v = v; else { a.push({ t: Math.round(L * 1000) / 1000, v, ease: 'linear' }); a.sort((x, y) => x.t - y.t); } }); X.toast(`${d.label} keyframe at ${fmtS(Lt(cur()))}`); });
    k.title = 'Keyframe'; r.append(s, k); pane.append(r);
  }
  pane.append(hint(hasKeyframes(c) ? `Animated: moving a slider sets a keyframe at ${fmtS(Lt(c))}.` : 'Tap ◆ to add a keyframe, move the playhead, then change the value to animate it.'));
}

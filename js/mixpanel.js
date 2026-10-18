/* Audio mix panels (Batch 10): per clip Mix sheet (10-band EQ + presets, compressor / limiter, pan with keyframes,
   voice / music role, tap beat marks) and the project Mix sheet (auto ducking, -14 LUFS loudness). */
import { S, act, live, selected } from './store.js';
import { find, clipDur, clipEnd, srcTime, hasKeyframes } from './project.js';
import { openSheet, slider, chips } from './panels.js';
import { KEYFRAME_PROPS, propAt } from './registry.js';
import { TapTempo } from './beats.js';
import { EQ_BANDS, EQ_PRESETS, COMP_PRESETS, DUCK_DEFAULT, LOUD_TARGET, isVoice, eqOn, loudOn, duckOn } from './audiomix.js';
import { fmtS } from './timeline.js';

let X = null;   // { player, timeline, toast, loudness: () => Promise<{lufs, gain}> }
export function initMixPanel(ctx) { X = ctx; }
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const hint = t => el('p', 'hint', t);
const btn = (label, id, onclick, on) => { const b = el('button', 'chipbtn' + (on ? ' on' : '')); b.innerHTML = label; if (id) b.id = id; b.onclick = onclick; return b; };
const row = (...k) => { const r = el('div', 'toggles'); r.append(...k); return r; };
const editSel = fn => live(p => { const f = find(p, S.sel); f && fn(f.clip, p); });
const cur = () => selected()?.clip;
const Lt = c => Math.max(0, Math.min(clipDur(c), X.player.t - c.start));
const fq = f => f >= 1000 ? (f / 1000) + 'k' : String(f);
const r3 = v => Math.round(v * 1000) / 1000;

/* ---------------- beat marks ---------------- */
/** Add a mark on clip `id` at project time t (stored in file seconds, so it stays on the sound when the clip moves). */
export function addMark(id, t) {
  let ok = false; act(p => { const c = find(p, id)?.clip; if (!c || t < c.start || t > clipEnd(c)) return; const s = r3(srcTime(c, t)); c.marks = [...(c.marks || []).filter(m => Math.abs(m - s) > .04), s].sort((a, b) => a - b); ok = true; });
  return ok;
}
/** Fill marks every beat (from tapped tempo) over the clip, starting at the first mark. */
export function fillMarks(id, bpm, from) {
  act(p => { const c = find(p, id).clip, spb = 60 / bpm, a = from ?? (c.marks?.[0] ?? c.in), out = []; for (let s = a; s <= c.out + 1e-6 && out.length < 4000; s += spb) if (s >= c.in - 1e-6) out.push(r3(s)); c.marks = out; c.markBpm = bpm; });
}

export function mixSheet(tab = 'eq') {
  const c0 = cur(); if (!c0 || !(c0.type === 'audio' || c0.type === 'video')) return;
  openSheet('Audio mix', body => {
    const pane = el('div', 'mixpane'); pane.id = 'mixPane';
    const tabs = chips([['eq', 'EQ'], ['dyn', 'Compressor'], ['pan', 'Pan'], ['role', 'Voice / music'], ['marks', 'Beat marks']].map(([value, label]) => ({ value, label })), tab, v => { tab = v; fill(); }, 'tabs mixtabs');
    const fill = () => { stopTap(); pane.innerHTML = ''; ({ eq, dyn, pan, role, marks })[tab](pane); };
    body.append(tabs, pane); fill();
  }, { className: 'tall', onClose: () => stopTap() });
}
function eq(pane) {
  const g = () => cur().eq?.g || EQ_BANDS.map(() => 0);
  const box = el('div', 'eqbands'); const sl = [];
  EQ_BANDS.forEach((f, i) => { const s = slider(fq(f), { min: -12, max: 12, step: .5, value: g()[i], fmt: v => (v > 0 ? '+' : '') + v + 'dB', id: 'eq' + i,
    onInput: v => editSel(cl => { const a = [...(cl.eq?.g || EQ_BANDS.map(() => 0))]; a[i] = v; cl.eq = { g: a, preset: null }; if (!eqOn(cl)) delete cl.eq; }) }); sl.push(s); box.append(s); });
  const pre = chips(EQ_PRESETS.map(([id, name]) => ({ value: id, label: name })), cur().eq?.preset || (eqOn(cur()) ? null : 'flat'), id => { const P = EQ_PRESETS.find(q => q[0] === id);
    editSel(cl => { if (id === 'flat') delete cl.eq; else cl.eq = { g: [...P[2]], preset: id }; }); P[2].forEach((v, i) => sl[i].set(v)); }, 'eqpre');
  pane.append(pre, box, hint('10-band equaliser, 31 Hz to 16 kHz. Pick a preset, then fine-tune any band.'));
}
function dyn(pane) {
  const q = () => cur().comp || null;
  const pre = chips(COMP_PRESETS.map(([id, name]) => ({ value: id, label: name })), q()?.preset || 'off', id => { const P = COMP_PRESETS.find(x => x[0] === id); editSel(cl => { if (!P[2]) delete cl.comp; else cl.comp = { ...P[2], preset: id }; }); fillCtl(); }, 'comppre');
  const ctl = el('div'); const fillCtl = () => { ctl.innerHTML = ''; const c = q(); if (!c) return;
    const set = (k, v) => editSel(cl => { if (cl.comp) { cl.comp = { ...cl.comp, [k]: v, preset: 'custom' }; } });
    ctl.append(slider('Threshold', { min: -40, max: 0, step: 1, value: c.thr, fmt: v => v + ' dB', id: 'compThr', onInput: v => set('thr', v) }),
      slider('Ratio', { min: 1, max: 10, step: .5, value: c.ratio, fmt: v => v + ':1', id: 'compRatio', onInput: v => set('ratio', v) }),
      slider('Make-up gain', { min: 0, max: 12, step: .5, value: c.makeup || 0, fmt: v => '+' + v + ' dB', id: 'compMakeup', onInput: v => set('makeup', v) }),
      slider('Limiter ceiling', { min: -6, max: 0, step: .5, value: c.ceil ?? -1, fmt: v => v + ' dB', id: 'compCeil', onInput: v => set('ceil', v) })); };
  pane.append(pre, ctl, hint('The compressor evens out loud and quiet parts; the limiter makes sure no peak goes over the ceiling.')); fillCtl();
}
function pan(pane) {
  const d = KEYFRAME_PROPS.pan, c = cur();
  const s = slider('Pan', { min: d.min, max: d.max, step: d.step, value: propAt(c, 'pan', Lt(c)), fmt: d.fmt, id: 'mixPan', onInput: v => editSel(cl => { if ((cl.keyframes?.pan || []).length) { const L = Lt(cl), a = cl.keyframes.pan, i = a.findIndex(x => Math.abs(x.t - L) < 1 / 60); if (i >= 0) a[i].v = v; else { a.push({ t: r3(L), v, ease: 'linear' }); a.sort((x, y) => x.t - y.t); } } else cl.pan = v; }) });
  const k = btn('◆ Keyframe', 'panKf', () => { editSel(cl => { const L = Lt(cl), a = ((cl.keyframes ||= {}).pan ||= []), v = propAt(cl, 'pan', L), i = a.findIndex(x => Math.abs(x.t - L) < 1 / 60); if (i >= 0) a[i].v = v; else { a.push({ t: r3(L), v, ease: 'linear' }); a.sort((x, y) => x.t - y.t); } }); X.toast(`Pan keyframe at ${fmtS(Lt(cur()))}`); });
  pane.append(s, row(k), hint('Left / right placement. Add keyframes to move the sound across (volume keyframes are in Volume).'));
}
function role(pane) {
  const c = cur(), v = c.role || 'auto';
  pane.append(chips([{ value: 'auto', label: 'Automatic' }, { value: 'voice', label: 'This is a voice' }, { value: 'music', label: 'Music / sound' }], v, r => editSel(cl => { if (r === 'auto') delete cl.role; else cl.role = r; }), 'rolechips'),
    hint(`Auto ducking lowers the other sound while a voice talks. Recordings and generated speech count as voice automatically. Now: ${isVoice(c) ? 'voice' : 'not a voice'}.`));
  const nd = btn('Never duck this clip', 'noDuck', () => { editSel(cl => { if (cl.duck === false) delete cl.duck; else cl.duck = false; }); nd.classList.toggle('on', cur().duck === false); }, c.duck === false);
  pane.append(row(nd));
}
let tapper = null, keyH = null;
const stopTap = () => { if (keyH) document.removeEventListener('keydown', keyH); keyH = null; };
function marks(pane) {
  tapper = new TapTempo(); const info = hint(''); info.id = 'marksInfo';
  const say = () => { const c = cur(); info.textContent = `${(c.marks || []).length} marks${c.markBpm ? ` · ${c.markBpm} BPM grid` : ''}. Clips snap to the marks when you drag them.`; };
  const tap = el('button', 'tapbig', 'TAP'); tap.id = 'markTap';
  const doTap = () => { const c = cur(), t = X.player.t; if (addMark(c.id, t)) { tapper.tap(performance.now() / 1000); tap.classList.remove('hit'); void tap.offsetWidth; tap.classList.add('hit'); X.timeline.render(); say(); } else X.toast('Move the playhead over this clip'); };
  tap.addEventListener('pointerdown', e => { e.preventDefault(); doTap(); });
  keyH = e => { if (e.key === 'm' || e.key === 'M') doTap(); }; document.addEventListener('keydown', keyH);
  const play = btn('Play', 'markPlay', () => { const c = cur(); if (X.player.playing) X.player.pause(); else X.player.playRange(Math.max(c.start, Math.min(X.player.t, clipEnd(c) - .5)), clipEnd(c)); });
  const grid = btn('Fill with tapped tempo', 'markGrid', () => { const r = tapper.result(); const c = cur(); if (!r && !(c.marks || []).length) { X.toast('Tap at least 4 beats first'); return; }
    let bpm = (c.marks || []).length >= 2 ? null : r ? r.bpm : null; if (!bpm && c.marks.length >= 2) { const d = c.marks.slice(1).map((m, i) => m - c.marks[i]).sort((a, b) => a - b); bpm = Math.round(60 / d[d.length >> 1] * 10) / 10; }
    if (!bpm) { X.toast('Tap at least 4 beats first'); return; } fillMarks(c.id, bpm); X.timeline.render(); say(); });
  const clr = btn('Clear marks', 'markClear', () => { editSel(cl => { delete cl.marks; delete cl.markBpm; }); X.timeline.render(); say(); });
  pane.append(tap, row(play, grid, clr), info, hint('Play the sound and tap on every beat (or press M). Marks show on the clip in the timeline.')); say();
}

/* ---------------- project mix: ducking + loudness ---------------- */
export function projectMixSheet() {
  openSheet('Mix', body => {
    const d = { ...DUCK_DEFAULT, ...(S.project.duck || {}) }, on = duckOn(S.project);
    const duck = btn('Auto ducking', 'duckOn', () => { live(p => { p.duck = { ...DUCK_DEFAULT, ...(p.duck || {}), on: !duckOn(p) }; }); duck.classList.toggle('on', duckOn(S.project)); }, on);
    const amt = slider('Music under voice', { min: -30, max: -3, step: 1, value: d.amount, fmt: v => v + ' dB', id: 'duckAmount', onInput: v => live(p => { p.duck = { ...DUCK_DEFAULT, ...(p.duck || {}), amount: v }; }) });
    const sens = slider('Voice sensitivity', { min: -55, max: -20, step: 1, value: d.thr, fmt: v => v + ' dBFS', id: 'duckThr', onInput: v => live(p => { p.duck = { ...DUCK_DEFAULT, ...(p.duck || {}), thr: v }; }) });
    const rel = slider('Come back after', { min: .1, max: 1.5, step: .05, value: d.release, fmt: v => v.toFixed(2) + ' s', id: 'duckRel', onInput: v => live(p => { p.duck = { ...DUCK_DEFAULT, ...(p.duck || {}), release: v }; }) });
    const nv = S.project.tracks.flatMap(t => t.clips).filter(isVoice).length;
    const loud = btn(`Loudness ${LOUD_TARGET} LUFS on export`, 'loudOn', () => { live(p => { p.loudness = { on: !loudOn(p) }; }); loud.classList.toggle('on', loudOn(S.project)); meas(); }, loudOn(S.project));
    const info = hint(''); info.id = 'loudInfo';
    const meas = async () => { if (!loudOn(S.project)) { info.textContent = 'Export keeps the mix as it is.'; return; } info.textContent = 'Measuring the mix…'; const r = await X.loudness(); info.textContent = r && isFinite(r.lufs) ? `Mix now ${r.lufs.toFixed(1)} LUFS → export at ${LOUD_TARGET} LUFS (${r.gainDb >= 0 ? '+' : ''}${r.gainDb.toFixed(1)} dB, peaks limited to -1 dB). The preview plays at the same level.` : 'No sound yet.'; };
    body.append(el('h4', 'mixh', 'Auto ducking'), row(duck), amt, sens, rel, hint(`Music and other sounds go down while a voice speaks (${nv} voice clip${nv === 1 ? '' : 's'} now) and come back up after.`), el('h4', 'mixh', 'Loudness'), row(loud), info); meas();
  });
}

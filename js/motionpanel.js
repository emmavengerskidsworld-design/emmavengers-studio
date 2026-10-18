/* Motion panels (Batch 10): Stabilise, Track (sticker / text / emoji follows an object), keyframe Graph editor with
   bezier easing + copy / paste keyframes, Smooth slow-mo. Maths + frame loops in motion.js; edits go through the store. */
import { S, act, live, select, selected } from './store.js';
import { find, clipDur, clipEnd, srcTime, normalize, hasKeyframes, kfTimes } from './project.js';
import { openSheet, closeSheet, slider, chips } from './panels.js';
import { KEYFRAME_PROPS, propAt } from './registry.js';
import { media, importFile, loadBitmap } from './media.js';
import { openSource } from './framesource.js';
import { renderFrame } from './render.js';
import { setPickHook } from './protools.js';
import { STAB_LEVELS, stabilize, restab, grey, trackFrames, simplifyPath, bezierEase, BEZIER_PRESETS, slowmoFile } from './motion.js';
import { fmtS } from './timeline.js';

let X = null;   // { player, timeline, toast, busy }
export function initMotionPanel(ctx) { X = ctx; }
const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt != null) e.textContent = txt; return e; };
const hint = t => el('p', 'hint', t);
const btn = (label, id, onclick, on) => { const b = el('button', 'chipbtn' + (on ? ' on' : '')); b.innerHTML = label; if (id) b.id = id; b.onclick = onclick; return b; };
const row = (...k) => { const r = el('div', 'toggles'); r.append(...k); return r; };
const busy = (on, t) => X.busy && X.busy(on, t);
const r4 = v => Math.round(v * 1e4) / 1e4;

/* ---------------- Stabilise ---------------- */
let working = false;
/** Analyse + stabilise a video clip (level low / med / high, or 'off'). Returns the new clip.stab. */
export async function stabilizeClip(id, level = 'med') {
  const f = find(S.project, id); if (!f || f.clip.type !== 'video') return null; const c = f.clip;
  if (level === 'off') { act(p => { delete find(p, id).clip.stab; }); return null; }
  if (c.stab && c.stab.raw && Math.abs(c.stab.a - c.in) < 1e-6 && c.stab.n >= Math.floor((c.out - c.in) * c.stab.fps)) { const st = restab(c.stab, level); act(p => { find(p, id).clip.stab = st; }); return st; }
  if (working) return null; working = true; X.player.pause(); busy(true, 'Stabilising… 0%');
  try { const t0 = performance.now(), st = await stabilize(media.get(c.mediaId), c.in, c.out, level, q => busy(true, `Stabilising… ${Math.round(q * 100)}%`));
    st.secs = Math.round((performance.now() - t0) / 100) / 10; act(p => { const cc = find(p, id)?.clip; if (cc) cc.stab = st; }); return st; }
  finally { working = false; busy(false); }
}
export function stabSheet() {
  const c0 = selected()?.clip; if (!c0 || c0.type !== 'video') { X.toast('Select a video clip'); return; }
  openSheet('Stabilise', body => {
    const info = hint(''); info.id = 'stabInfo';
    const show = st => { info.textContent = st ? `Stabilised (${STAB_LEVELS[st.level].name}): steadied path, ${Math.round((st.zoom - 1) * 100)}% crop zoom to hide the moving edges · ${st.pts} tracked points per frame.` : 'Smooths shaky hand-held video: the app follows details from frame to frame, steadies the camera path and zooms in a little to hide the edges.'; };
    const ch = chips([{ value: 'off', label: 'Off' }, ...Object.entries(STAB_LEVELS).map(([v, l]) => ({ value: v, label: l.name }))], c0.stab ? c0.stab.level : 'off', async v => {
      const st = await stabilizeClip(c0.id, v); show(v === 'off' ? null : st); X.player.requestDraw(); }, 'stablev');
    ch.id = 'stabLevels'; body.append(ch, info); show(c0.stab);
  });
}

/* ---------------- Motion tracking ---------------- */
/** Low-res renders of the pictures under a clip (video + photos, without the tracked clip), as grey frames. */
async function backgroundFrames(p, skipId, times, w, h, onProgress) {
  const q = { ...p, canvas: null, bgBlur: 0, tracks: p.tracks.filter(t => t.kind === 'main' || t.kind === 'overlay').map(t => ({ ...t, clips: t.clips.filter(c => c.id !== skipId && (c.type === 'video' || c.type === 'image')).map(c => ({ ...c, anim: null })) })) };
  const cv = new OffscreenCanvas(w, h), ctx = cv.getContext('2d', { alpha: false }), sources = new Map(), out = [];
  try {
    for (let i = 0; i < times.length; i++) { const t = times[i], frames = new Map();
      for (const tr of q.tracks) for (const c of tr.clips) { if (!(c.start <= t + 1e-6 && t < clipEnd(c))) continue; const r = media.get(c.mediaId); if (!r) continue;
        if (c.type === 'image') { const bm = await loadBitmap(r); frames.set(c.id, { img: bm, w: bm.width, h: bm.height }); continue; }
        let s = sources.get(c.id); if (!s) { s = await openSource(r, srcTime(c, t)); sources.set(c.id, s); } frames.set(c.id, await s.frameAt(Math.max(0, srcTime(c, t)))); }
      renderFrame(ctx, w, h, q, t, c => frames.get(c.id), { plain: true, fast: true }); out.push(grey(cv, w, h, w, h)); if (i % 5 === 0) onProgress(i / times.length); }
  } finally { for (const s of sources.values()) s.close(); }
  return out;
}
/** Make clip `id` follow what is at canvas fraction (fx, fy) from the playhead to the clip's end. */
export async function trackClip(id, fx, fy, { mode = 'point', size = .15, fps = 15 } = {}) {
  const f = find(S.project, id); if (!f) return null; const c = f.clip, p = S.project;
  const T0 = Math.max(c.start, Math.min(clipEnd(c) - .1, X.player.t)), T1 = clipEnd(c), n = Math.max(2, Math.floor((T1 - T0) * fps) + 1), times = Array.from({ length: n }, (_, i) => Math.min(T1 - 1e-3, T0 + i / fps));
  const [A, B] = String(p.aspect || '9:16').split(':').map(Number), w = A >= B ? 240 : Math.round(240 * A / B), h = A >= B ? Math.round(240 * B / A) : 240;
  if (working) return null; working = true; X.player.pause(); busy(true, 'Tracking… 0%');
  try {
    const t0 = performance.now(), frames = await backgroundFrames(p, id, times, w, h, q => busy(true, `Tracking… ${Math.round(q * 70)}%`));
    const r = mode === 'area' ? Math.max(4, Math.min(22, Math.round(size * w / 2))) : Math.max(4, Math.round(.03 * Math.min(w, h))), R = mode === 'area' ? Math.round(r * .6) + 5 : Math.round(.06 * Math.min(w, h)) + 4;
    const path = trackFrames(frames, w, h, fx * w, fy * h, r, R); busy(true, 'Tracking… 90%');
    const L0 = T0 - c.start, x0 = propAt(c, 'x', L0), y0 = propAt(c, 'y', L0);
    const pts = simplifyPath(path.map((q, i) => ({ t: r4(times[i] - c.start), x: r4(x0 + (q.x - path[0].x) / w), y: r4(y0 + (q.y - path[0].y) / h) })), .0015);
    act(pp => { const cc = find(pp, id).clip; cc.keyframes ||= {};
      for (const k of ['x', 'y']) { const keep = (cc.keyframes[k] || []).filter(q => q.t < L0 - 1e-3); cc.keyframes[k] = [...keep, ...pts.map(q => ({ t: q.t, v: q[k], ease: 'linear' }))]; }
      cc.tracked = { t0: r4(L0), mode, pts: pts.length, lost: path.filter(q => q.score < .45).length }; });
    return { path: path.map(q => [r4(q.x / w), r4(q.y / h), r4(q.score)]), keyframes: pts.length, secs: (performance.now() - t0) / 1000, times };
  } finally { working = false; busy(false); }
}
export function trackSheet() {
  const c0 = selected()?.clip; if (!c0 || c0.type === 'audio' || c0.type === 'effect') return;
  let mode = 'point', size = .15;
  openSheet('Track motion', body => {
    const info = hint(c0.tracked ? `Following an object: ${c0.tracked.pts} keyframes from ${fmtS(c0.tracked.t0)}.` : 'Put the playhead where the object is, tap “Pick the object”, then tap it in the picture. This clip will follow it to its end.'); info.id = 'trackInfo';
    const m = chips([{ value: 'point', label: 'Point' }, { value: 'area', label: 'Area' }], mode, v => { mode = v; sz.hidden = v !== 'area'; }, 'trackmode');
    const sz = slider('Area size', { min: .06, max: .4, step: .01, value: size, fmt: v => Math.round(v * 100) + '%', id: 'trackSize', onInput: v => { size = v; } }); sz.hidden = true;
    const go = btn('Pick the object', 'trackPick', () => { go.classList.add('on'); X.toast('Tap the object to follow');
      setPickHook(async pos => { go.classList.remove('on'); const cv = X.player.canvas; const r = await trackClip(c0.id, pos.x / cv.width, pos.y / cv.height, { mode, size });
        if (r) { info.textContent = `Done in ${r.secs.toFixed(1)}s: ${r.keyframes} keyframes. Press play to see it follow.`; X.timeline.render(); } }); });
    const clr = btn('Remove tracking', 'trackClear', () => { act(p => { const cc = find(p, c0.id).clip; if (cc.keyframes) { delete cc.keyframes.x; delete cc.keyframes.y; } delete cc.tracked; }); info.textContent = 'Tracking removed.'; });
    body.append(m, sz, row(go, clr), info);
  });
}

/* ---------------- keyframe graph editor + bezier + copy / paste ---------------- */
let clipboard = null;
export function copyKeyframes(c, at = null) {
  const kf = {}; for (const [k, a] of Object.entries(c.keyframes || {})) if (a.length) kf[k] = a.map(x => ({ ...x }));
  const t0 = Math.min(...Object.values(kf).flat().map(x => x.t)); clipboard = { kf, t0: isFinite(t0) ? t0 : 0 }; try { localStorage.setItem('evs-kfclip', JSON.stringify(clipboard)); } catch (e) {} return clipboard;
}
export function pasteKeyframes(id, L) {
  const cb = clipboard || (() => { try { return JSON.parse(localStorage.getItem('evs-kfclip')); } catch (e) { return null; } })(); if (!cb) return 0; let n = 0;
  act(p => { const c = find(p, id).clip, D = clipDur(c); c.keyframes ||= {};
    for (const [k, a] of Object.entries(cb.kf)) { if (!KEYFRAME_PROPS[k]) continue; const moved = a.map(x => ({ ...x, t: r4(x.t - cb.t0 + L) })).filter(x => x.t >= -1e-6 && x.t <= D + 1e-6);
      if (!moved.length) continue; const keep = (c.keyframes[k] || []).filter(x => !moved.some(m => Math.abs(m.t - x.t) < 1 / 60)); c.keyframes[k] = [...keep, ...moved].sort((a, b) => a.t - b.t); n += moved.length; } });
  return n;
}
export function graphSheet() {
  const c0 = selected()?.clip; if (!c0) return;
  const props = () => Object.entries(selected().clip.keyframes || {}).filter(([k, a]) => a.length >= 1 && KEYFRAME_PROPS[k]).map(([k]) => k);
  let prop = props().find(k => (c0.keyframes[k] || []).length >= 2) || props()[0], sel = 0;
  openSheet('Keyframe graph', body => {
    const pc = chips(props().map(k => ({ value: k, label: KEYFRAME_PROPS[k].label || k })), prop, v => { prop = v; sel = 0; draw(); syncChips(); }, 'graphprops');
    const cv = el('canvas', 'graphcv'); cv.id = 'graphCv'; cv.width = 680; cv.height = 400; const g = cv.getContext('2d');
    const M = { l: 30, r: 20, t: 24, b: 30 };
    const clip = () => selected().clip, kfs = () => clip().keyframes?.[prop] || [];
    const range = () => { const D = clipDur(clip()); let lo = Infinity, hi = -Infinity; for (let i = 0; i <= 60; i++) { const v = propAt(clip(), prop, D * i / 60); lo = Math.min(lo, v); hi = Math.max(hi, v); } for (const k of kfs()) { lo = Math.min(lo, k.v); hi = Math.max(hi, k.v); } if (hi - lo < 1e-6) { lo -= .5; hi += .5; } const pad = (hi - lo) * .15; return { D, lo: lo - pad, hi: hi + pad }; };
    let RG = range(), drag = null;
    const TX = t => M.l + t / RG.D * (cv.width - M.l - M.r), TY = v => M.t + (1 - (v - RG.lo) / (RG.hi - RG.lo)) * (cv.height - M.t - M.b);
    const FX = x => (x - M.l) / (cv.width - M.l - M.r) * RG.D, FY = y => RG.lo + (1 - (y - M.t) / (cv.height - M.t - M.b)) * (RG.hi - RG.lo);
    const handles = () => { const a = kfs()[sel], b = kfs()[sel + 1]; if (!a || !b) return null; const bz = a.ease === 'bezier' && a.bz ? a.bz : [.33, .33, .67, .67];
      return [[TX(a.t + bz[0] * (b.t - a.t)), TY(a.v + bz[1] * (b.v - a.v))], [TX(a.t + bz[2] * (b.t - a.t)), TY(a.v + bz[3] * (b.v - a.v))]]; };
    const draw = () => { RG = drag && drag.lock ? drag.lock : range(); const Wd = cv.width, Ht = cv.height; g.clearRect(0, 0, Wd, Ht); g.fillStyle = '#16161c'; g.fillRect(0, 0, Wd, Ht);
      g.strokeStyle = 'rgba(255,255,255,.1)'; g.lineWidth = 2; for (let i = 0; i <= 4; i++) { const y = M.t + i * (Ht - M.t - M.b) / 4; g.beginPath(); g.moveTo(M.l, y); g.lineTo(Wd - M.r, y); g.stroke(); }
      const L = X.player.t - clip().start; g.strokeStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(TX(L), M.t); g.lineTo(TX(L), Ht - M.b); g.stroke();
      if (!prop) return;
      g.strokeStyle = '#ffd23f'; g.lineWidth = 4; g.beginPath(); for (let i = 0; i <= 200; i++) { const t = RG.D * i / 200; g[i ? 'lineTo' : 'moveTo'](TX(t), TY(propAt(clip(), prop, t))); } g.stroke();
      const hd = handles(), a = kfs()[sel], b = kfs()[sel + 1];
      if (hd) { g.strokeStyle = '#7cc6ff'; g.lineWidth = 2; g.beginPath(); g.moveTo(TX(a.t), TY(a.v)); g.lineTo(...hd[0]); g.moveTo(TX(b.t), TY(b.v)); g.lineTo(...hd[1]); g.stroke(); for (const h of hd) { g.fillStyle = '#7cc6ff'; g.beginPath(); g.arc(h[0], h[1], 11, 0, 7); g.fill(); } }
      kfs().forEach((k, i) => { g.save(); g.translate(TX(k.t), TY(k.v)); g.rotate(Math.PI / 4); g.fillStyle = i === sel ? '#fff' : '#ffd23f'; g.fillRect(-10, -10, 20, 20); g.strokeStyle = '#000'; g.lineWidth = 3; g.strokeRect(-10, -10, 20, 20); g.restore(); }); };
    const pos = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * cv.width, (e.clientY - r.top) / r.height * cv.height]; };
    cv.addEventListener('pointerdown', e => { e.preventDefault(); cv.setPointerCapture(e.pointerId); const [x, y] = pos(e), hd = handles();
      if (hd) for (let j = 0; j < 2; j++) if (Math.hypot(hd[j][0] - x, hd[j][1] - y) < 24) { drag = { h: j, lock: { ...RG } }; return; }
      const i = kfs().findIndex(k => Math.hypot(TX(k.t) - x, TY(k.v) - y) < 26); if (i >= 0) { sel = Math.min(i, Math.max(0, kfs().length - 2)); drag = { k: i, lock: { ...RG } }; syncEase(); draw(); } });
    cv.addEventListener('pointermove', e => { if (!drag) return; const [x, y] = pos(e);
      if (drag.h != null) { live(p => { const cc = find(p, S.sel).clip, a = cc.keyframes[prop][sel], b = cc.keyframes[prop][sel + 1]; if (!a || !b) return;
        const bz = a.ease === 'bezier' && a.bz ? [...a.bz] : [.33, .33, .67, .67], u = Math.max(0, Math.min(1, (FX(x) - a.t) / Math.max(1e-6, b.t - a.t))), v = Math.abs(b.v - a.v) > 1e-9 ? (FY(y) - a.v) / (b.v - a.v) : bz[drag.h * 2 + 1];
        bz[drag.h * 2] = r4(u); bz[drag.h * 2 + 1] = r4(Math.max(-1, Math.min(2, v))); a.ease = 'bezier'; a.bz = bz; }); draw(); syncEase(); return; }
      live(p => { const cc = find(p, S.sel).clip, A = cc.keyframes[prop], k = A[drag.k], d = KEYFRAME_PROPS[prop], lo = drag.k ? A[drag.k - 1].t + .02 : 0, hi = drag.k < A.length - 1 ? A[drag.k + 1].t - .02 : clipDur(cc);
        const t = Math.max(lo, Math.min(hi, FX(x))), ot = k.t; k.t = r4(t); k.v = Math.max(d.min ?? -Infinity, Math.min(d.max ?? Infinity, r4(FY(y))));
        for (const [kk, arr] of Object.entries(cc.keyframes)) if (kk !== prop) for (const q of arr) if (Math.abs(q.t - ot) < 1e-4) q.t = k.t; });   // keyframes at the same moment move together
      draw(); });
    cv.addEventListener('pointerup', () => { drag = null; draw(); });
    const easeChips = chips([{ value: 'linear', label: 'Linear' }, ...BEZIER_PRESETS.map(([id, name]) => ({ value: id, label: name }))], null, id => {
      editEase(id === 'linear' ? { ease: 'linear' } : { ease: 'bezier', bz: BEZIER_PRESETS.find(b => b[0] === id)[2] }); draw(); }, 'bzpresets');
    const editEase = o => live(p => { const cc = find(p, S.sel).clip, a = cc.keyframes[prop]?.[sel]; if (!a) return; const t = a.t;
      for (const arr of Object.values(cc.keyframes)) for (const q of arr) if (Math.abs(q.t - t) < 1e-4) { q.ease = o.ease; if (o.bz) q.bz = [...o.bz]; else delete q.bz; } });
    const syncEase = () => { const a = kfs()[sel]; const id = !a || a.ease !== 'bezier' ? (a?.ease === 'linear' || !a ? 'linear' : null) : (BEZIER_PRESETS.find(b => b[2].join() === (a.bz || []).join()) || [null])[0]; easeChips.setActive(id ?? '-'); };
    const syncChips = () => syncEase();
    const copy = btn('Copy keyframes', 'kfCopy', () => { const cb = copyKeyframes(clip()); X.toast(`Copied ${Object.values(cb.kf).flat().length} keyframes`); });
    const paste = btn('Paste at playhead', 'kfPaste', () => { const n = pasteKeyframes(clip().id, Math.max(0, X.player.t - clip().start)); X.toast(n ? `Pasted ${n} keyframes at ${fmtS(X.player.t - clip().start)}` : 'Nothing to paste'); draw(); });
    body.append(pc, cv, hint('Drag a ◆ to change its time and value. The blue handles bend the curve to the next keyframe (bezier).'), easeChips, row(copy, paste));
    draw(); syncEase();
  }, { className: 'tall' });
}

/* ---------------- smooth slow motion ---------------- */
export async function slowmoClip(id, speed = .25, blend = true) {
  const f = find(S.project, id); if (!f || f.clip.type !== 'video') return null; const c = f.clip;
  if (speed >= 1) { if (!c.slowmo) return c; act(p => { const cc = find(p, id).clip, o = cc.slowmo; cc.mediaId = o.mediaId; cc.in = o.in; cc.out = o.out; cc.speed = o.speed; delete cc.slowmo; normalize(p); }); return find(S.project, id).clip; }
  if (working) return null; working = true; X.player.pause(); busy(true, 'Smooth slow-mo… 0%');
  try { const orig = c.slowmo || { mediaId: c.mediaId, in: c.in, out: c.out, speed: c.speed }, rec = media.get(orig.mediaId), t0 = performance.now();
    const file = await slowmoFile(rec, orig.in, orig.out, speed, q => busy(true, `Smooth slow-mo… ${Math.round(q * 100)}%`), { blend });
    busy(true, 'Smooth slow-mo… adding'); const nr = await importFile(file);
    act(p => { const cc = find(p, id).clip; cc.slowmo = { ...orig, factor: speed, blend, secs: Math.round((performance.now() - t0) / 100) / 10 }; cc.mediaId = nr.id; cc.in = 0; cc.out = nr.duration; cc.speed = 1; delete cc.curve; normalize(p); });
    return find(S.project, id).clip; }
  catch (e) { console.warn(e); X.toast('Could not make slow motion: ' + (e.message || e)); return null; }
  finally { working = false; busy(false); }
}
export function slowmoSheet() {
  const c0 = selected()?.clip; if (!c0 || c0.type !== 'video') return;
  let blend = true;
  openSheet('Smooth slow-mo', body => {
    const info = hint(c0.slowmo ? `Slowed ${Math.round(1 / c0.slowmo.factor)}× with ${c0.slowmo.blend ? 'blended' : 'repeated'} frames.` : 'Slows the clip down and blends the frames in between, so the movement stays smooth instead of jerky.'); info.id = 'slowInfo';
    const sp = chips([{ value: '1', label: 'Normal' }, { value: '.5', label: '2× slower' }, { value: '.25', label: '4× slower' }, { value: '.125', label: '8× slower' }], c0.slowmo ? String(c0.slowmo.factor).replace(/^0/, '') : '1', async v => {
      const c = await slowmoClip(c0.id, +v, blend); if (c) { info.textContent = +v >= 1 ? 'Back to normal speed.' : `Slowed ${Math.round(1 / +v)}× (${fmtS(clipDur(c))}).`; X.timeline.render(); } }, 'slowsp');
    sp.id = 'slowSpeeds';
    const bl = btn('Frame blending', 'slowBlend', () => { blend = !blend; bl.classList.toggle('on', blend); }, blend);
    body.append(sp, row(bl), info);
  });
}

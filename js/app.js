/* Emmavengers Studio — app shell: wires the store, preview player, timeline, toolbars, panels and export. */
import { S, act, live, load, save, on, undo, redo, canUndo, canRedo, select, selected, reset, begin, end, useProject } from './store.js';
import { newClip, addToMain, addToKind, split, remove, duplicate, setSpeed, projectDuration, clipDur, clipEnd, hasSource, find, ASPECTS, mediaIds, kfTimes, kfAt, hasKeyframes, addKeyframe, removeKeyframe, setEase, setProp, kenBurns, KEN_BURNS, transEff, KF_EPS } from './project.js';
import { TRANSITIONS, TRANSITION_CATS, transitionById, helpers as trHelpers, DEFAULT_TRANSITION_DUR, MIN_TRANSITION, MAX_TRANSITION } from './transitions.js';
import { media, importFile, loadAll, useMedia, onMediaUpdate, kindOf, bitmapOf } from './media.js';
import { Player } from './player.js';
import { Timeline, fmtS } from './timeline.js';
import { openSheet, closeSheet, sheetOpen, slider, chips, swatches } from './panels.js';
import { FONT_GROUPS } from './registry.js';
import * as caps from './captions.js';
import * as stickers from './stickers.js';
import * as templates from './templates.js';
import * as projects from './projects.js';
import * as backupApi from './backup.js';
import { initHome, showHome, hideHome, homeOpen, render as renderHome } from './home.js';
import * as fx from './effects.js';
import { FILTER_CATS } from './registry.js';
import { ensureFont, ensureProjectFonts, onFontLoad } from './fonts.js';
import { TEXT_STYLES, BUBBLES, TITLES, applyStyle, applyTitle } from './textstyles.js';
import { FILTERS, FONTS, COLORS, BG_COLORS, SPEED_PRESETS, KEYFRAME_PROPS, DEFAULT_TRANSFORM, TRACK_KINDS, propAt, kfPropsFor, EASING_LIST, TRANSFORM_PROPS } from './registry.js';
import { exportVideo, exportAudio, exportStill, exportGif, GIF_MAX, AUDIO_BR, outputSize, pickCodecs, recorderMime, planBitrate, qualityFloor, QUALITY, RESOLUTIONS, supportedResolutions, estimateBytes, bitrateFor } from './export.js';
import { ADJUST, DEFAULT_STRENGTH, enhanceOn, glAvailable } from './enhance.js';
import { renderFrame, drawVisual, drawText } from './render.js';
import { CLIP_ANIMS, TEXT_ANIMS, animSetFor, animById, animSpans, DEFAULT_ANIM_DUR, DEFAULT_LOOP_DUR, MIN_ANIM, MAX_ANIM, MIN_LOOP, MAX_LOOP, loopKind } from './animations.js';
import { hitTest } from './render.js';
import { initAudioPanels, enhanceVoiceSheet, voiceFxSheet, recordSheet, speechSheet } from './audiopanels.js';
import { soundsSheet } from './library.js';
import { extractAudio, MAX_FADE, fadeAt } from './project.js';
import { onBaked, keepPitch, VOICE_FX, needsBake, bakedFor } from './audio.js';
import * as audiofx from './audiofx.js';
import { icon } from './icons.js';
import * as pro from './protools.js';
import * as speedcurve from './speedcurve.js';
import * as projectApi from './project.js';
import * as admaker from './admaker.js';
import * as beats from './beats.js';
import { adSheet, shuffleAd, make as makeAd } from './adpanel.js';

const $ = s => document.querySelector(s);
const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return String(m).padStart(2, '0') + ':' + s.toFixed(1).padStart(4, '0'); };
let player, timeline, seekQ = false;

/* ---------------- boot ---------------- */
async function boot() {
  for (const [id, n] of [['menuBtn', 'home'], ['undoBtn', 'undo'], ['redoBtn', 'redo'], ['zoomIn', 'zoomin'], ['zoomOut', 'zoomout'], ['kfPrev', 'kfprev'], ['kfNext', 'kfnext'], ['kfBtn', 'kf']]) $('#' + id).innerHTML = icon(n);
  $('#addMainBtn').innerHTML = icon('plus', 26);
  $('#exportBtn').innerHTML = icon('export', 18) + '<span>Export</span>';
  await load(); await projects.migrate();
  await useMedia(mediaIds(S.project));
  player = new Player($('#preview'), { getProject: () => S.project, selected: () => S.sel, onTime: t => { timeline.setTime(t); showTime(); updateKf(); }, onSeek: () => { if (!seekQ) { seekQ = true; requestAnimationFrame(() => { seekQ = false; showTime(); }); } }, onState: setPlayIcon });
  timeline = new Timeline({ getTime: () => player.t, seek: t => { player.seek(t, true); showTime(); updateKf(); }, onJoint: id => transitionSheet(id), isPlaying: () => player.playing, pause: () => player.pause(), onAdd: k => pick(k), afterEdit: afterEdit });
  on('change', () => { timeline.render(); player.seek(player.t); showTime(); refreshToolbar(); updateEmpty(); updateKf(); });
  on('select', () => { document.body.classList.toggle('has-sel', !!S.sel); timeline.render(); refreshToolbar(); player.requestDraw(); if (sheetOpen()) closeSheet(); updateKf(); });
  on('history', updateUndo);
  onMediaUpdate(() => { timeline.render(); player.requestDraw(); });
  onFontLoad(() => player.requestDraw()); ensureProjectFonts(S.project);
  initAudioPanels({ player, timeline, toast });
  pro.initProTools({ player, timeline, toast, speedSheet });
  onBaked(() => { timeline.render(); if (player.playing) player.sync(player.t); });
  wireUI(); layoutPreview(); timeline.fitZoom(); timeline.render(); refreshToolbar(); updateUndo(); updateEmpty(); showTime(); setPlayIcon(false);
  player.seek(0);
  initHome({ toast, busy, menuSheet, templatesSheet, adSheet: () => adSheet(adCtx()), afterSwitch, leaveProject, deliver });
  on('change', () => { clearTimeout(thumbTimer); thumbTimer = setTimeout(makeThumb, 4000); });
  addEventListener('pagehide', () => makeThumb());
  setTimeout(async () => { try { await projects.askPersist(); await projects.cleanUp(); if (!(await projects.getThumb(S.project.id))) makeThumb(); } catch (e) { console.warn('clean-up', e); } }, 2500);
  const qs = new URLSearchParams(location.search);
  if (qs.has('home') || (matchMedia('(display-mode: standalone)').matches && !qs.has('editor'))) showHome();
  window.studio = { projects, backup: backupApi, home: { show: showHome, hide: hideHome, render: renderHome, open: homeOpen }, makeThumb,  templates, importFile, S, player, timeline, media, act, select, find, projectDuration, exportVideo, pickCodecs, recorderMime, save, propAt, kfTimes, transitions: TRANSITIONS, testTransitions, anims: { clip: CLIP_ANIMS, text: TEXT_ANIMS }, renderStill, audio: { fx: audiofx, VOICE_FX, needsBake, bakedFor, mix: async () => (await import('./export.js')).mixAudio(S.project, projectDuration(S.project)) }, supportedResolutions, bitrateFor, estimateBytes, outputSize, glAvailable, setCompare, pro, speedcurve, project: projectApi, admaker: { ...admaker, beats, adSheet: pre => adSheet(adCtx(), pre), shuffle: () => shuffleAd(adCtx()), make: st => makeAd(adCtx(), st) }, caps, stickers, fx, ready: true };
  document.body.classList.add('ready');
}
/* ---------------- projects ---------------- */
let thumbTimer = 0;
/** Small picture of the project for the home grid: the frame under the playhead (or 1 s in), drawn by the real renderer. */
async function makeThumb() {
  clearTimeout(thumbTimer); const p = S.project; if (!p) return;
  try {
    const [a, b] = ASPECTS[p.aspect] || [9, 16], W = a > b ? 320 : Math.round(320 * a / b), H = Math.round(W * b / a), D = projectDuration(p);
    const cv = new OffscreenCanvas(W, H), x = cv.getContext('2d', { alpha: false }); if (!D) { await projects.setThumb(p.id, null); return; }
    const t = player.t > 0.05 && player.t < D ? player.t : Math.min(1, D / 3), frames = new Map();
    for (const tr of p.tracks) for (const c of tr.clips) if (c.type === 'image' && c.start <= t && t < clipEnd(c)) { const r = media.get(c.mediaId), bm = r && bitmapOf(r); if (bm) frames.set(c.id, { img: bm, w: bm.width, h: bm.height }); }
    renderFrame(x, W, H, p, t, c => frames.get(c.id) || player.source(c), { fast: true });
    await projects.setThumb(p.id, await cv.convertToBlob({ type: 'image/jpeg', quality: .78 }));
  } catch (e) { console.warn('thumb', e); }
}
/** Before going to the home screen / another project: save and refresh the thumbnail. */
async function leaveProject() { player.pause(); closeSheet(); select(null); await save(); await makeThumb(); }
/** The open project changed (opened, created, deleted): refresh everything on screen. */
function afterSwitch() {
  player.pause(); player.gc(); ensureProjectFonts(S.project); $('#ratioBtn').textContent = S.project.aspect;
  layoutPreview(); timeline.fitZoom(); timeline.render(); refreshToolbar(); updateUndo(); updateEmpty(); player.seek(0); showTime();
  clearTimeout(thumbTimer); thumbTimer = setTimeout(makeThumb, 1500);
}
/** Hand a finished file to the user: Save to phone / Share (Drive, Files, WhatsApp…) / Save as (desktop). */
function deliver(blob, name, mime, text, kind = 'file') {
  const file = new File([blob], name, { type: mime || blob.type || 'application/octet-stream', lastModified: Date.now() });
  let share = false; try { share = !!(navigator.share && navigator.canShare && navigator.canShare({ files: [file] })); } catch (e) {}
  window.__lastDelivered = { name, size: blob.size, mime: file.type, kind, share };
  openSheet('Your file is ready', body => {
    body.innerHTML = `<p class="hint dl-text" id="dlText">${text || ''}</p><p class="dl-name" id="dlName">${esc(name)} · ${projects.fmtBytes(blob.size)}</p>`;
    const b = (id, ic, label, fn, cls = '') => { const x = document.createElement('button'); x.className = 'btn ' + cls; x.id = id; x.innerHTML = icon(ic, 20) + ' ' + label; x.onclick = fn; body.append(x); };
    b('dlSave', 'save', 'Save to phone', () => { downloadBlob(file, name); toast(isAndroid() ? 'Saved to Downloads (Files app)' : 'Saved to your Downloads folder', 3000); }, 'primary big');
    if (share) b('dlShare', 'share', 'Share… (Drive, Files, WhatsApp)', async () => { try { await navigator.share({ files: [file], title: name }); } catch (e) { if (e.name !== 'AbortError') { downloadBlob(file, name); toast('Sharing failed, so it was saved instead'); } } }, 'big');
    if (window.showSaveFilePicker && !isAndroid()) b('dlAs', 'download', 'Save as…', async () => { try { const h = await showSaveFilePicker({ suggestedName: name }); const w = await h.createWritable(); await w.write(file); await w.close(); toast('Saved as ' + h.name); } catch (e) {} }, 'ghost');
    if (!share && kind === 'backup') body.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'To put it on Google Drive: Save to phone, then open the Drive app → + → Upload, and pick it from Downloads.' }));
  }, { gesture: false });
}
function afterEdit() { player.seek(Math.min(player.t, projectDuration(S.project))); showTime(); refreshToolbar(); }
function showTime() { $('#tcur').textContent = fmt(player.t); $('#ttot').textContent = fmt(projectDuration(S.project)); }
function setPlayIcon(pl) { $('#playBtn').innerHTML = icon(pl ? 'pause' : 'play', 26); $('#playBtn').setAttribute('aria-label', pl ? 'Pause' : 'Play'); }
function updateUndo() { $('#undoBtn').disabled = !canUndo(); $('#redoBtn').disabled = !canRedo(); }
function updateEmpty() { const empty = !S.project.tracks.some(t => t.clips.length); $('#empty').hidden = !empty; $('#exportBtn').disabled = empty; $('#cmpBtn').hidden = !S.project.tracks.some(t => t.clips.some(isPic)); if ($('#cmpBtn').hidden && player.compare) setCompare(null); }
export function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms); }

/* ---------------- preview canvas ---------------- */
function layoutPreview() {
  const stage = $('#stage'), cv = $('#preview'), [a, b] = ASPECTS[S.project.aspect];
  const W = stage.clientWidth - 16, H = stage.clientHeight - 12; if (W <= 0 || H <= 0) return;
  let w = W, h = W * b / a; if (h > H) { h = H; w = H * a / b; }
  cv.style.width = Math.round(w) + 'px'; cv.style.height = Math.round(h) + 'px';
  const o = $('#cmp'); if (o) { o.style.width = cv.style.width; o.style.height = cv.style.height; }
  const dpr = Math.min(2, devicePixelRatio || 1), k = Math.min(dpr, 1080 / Math.min(w, h));
  cv.width = Math.round(w * k); cv.height = Math.round(h * k);
  player && player.draw();
}
function previewGestures() {
  const cv = $('#preview'), pts = new Map(); let g = null, tap = null;
  const toCanvas = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height, r }; };
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (player.playing) player.pause();
    if (pts.size === 1) {
      const pos = toCanvas(e); if (pro.previewTap(pos)) { pts.delete(e.pointerId); return; }
      if (pro.cropDragStart(pos)) { g = { crop: true }; tap = null; return; }
      const hit = hitTest(player.boxes, pos.x, pos.y);
      tap = { x: e.clientX, y: e.clientY, hit: hit && hit.id };
      const f = S.sel && find(S.project, S.sel);
      const id = f && player.boxes.some(b => b.id === S.sel) ? S.sel : hit && hit.id;
      if (id) { const ff = find(S.project, id); g = { id, x0: e.clientX, y0: e.clientY, tr: trAt(ff.clip), r: pos.r, started: false }; }
    } else if (pts.size === 2 && g && !g.crop) {
      const [a, b] = [...pts.values()]; g.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), tr: trAt(find(S.project, g.id).clip) };
    }
  });
  cv.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!g) return;
    if (g.crop) { pro.cropDragMove(toCanvas(e)); return; }
    if (!g.started && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < 4 && pts.size < 2) return;
    if (!g.started) { g.started = true; begin(); if (S.sel !== g.id) select(g.id); }
    live(p => { const c = find(p, g.id)?.clip; if (!c) return;
      if (pts.size >= 2 && g.pinch) { const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
        const L = player.t - c.start;
        setProp(c, 'scale', Math.max(0.05, Math.min(8, g.pinch.tr.scale * d / g.pinch.d)), L);
        let rot = g.pinch.tr.rotation + (ang - g.pinch.ang) * 180 / Math.PI; for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(rot - s) < 3) rot = s; setProp(c, 'rotation', Math.round(rot * 10) / 10, L);
      } else if (pts.size === 1) {
        let x = g.tr.x + (e.clientX - g.x0) / g.r.width, y = g.tr.y + (e.clientY - g.y0) / g.r.height;
        if (Math.abs(x - .5) < .015) x = .5; if (Math.abs(y - .5) < .015) y = .5;
        const L = player.t - c.start; setProp(c, 'x', Math.round(x * 1000) / 1000, L); setProp(c, 'y', Math.round(y * 1000) / 1000, L);
      } });
  });
  const upH = e => {
    pts.delete(e.pointerId);
    if (pts.size === 0) {
      if (g && g.crop) pro.cropDragEnd();
      else if (g && g.started) end();
      else if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 6) select(tap.hit || null);
      g = null; tap = null;
    } else if (g && !g.crop) { const ff = find(S.project, g.id); const [p0] = [...pts.values()]; g.x0 = p0.x; g.y0 = p0.y; g.tr = trAt(ff.clip); g.pinch = null; }
  };
  cv.addEventListener('pointerup', upH); cv.addEventListener('pointercancel', upH);
}

const localT = c => Math.max(0, Math.min(clipDur(c), player.t - c.start));
const trAt = c => { const L = localT(c), o = {}; for (const k of TRANSFORM_PROPS) o[k] = propAt(c, k, L); return o; };

/* ---------------- keyframes ---------------- */
function kfTarget() { const f = selected(); return f && f.clip; }
function updateKf() {
  const c = kfTarget(), bar = $('#kfBar'); if (!bar) return;
  bar.hidden = !c; if (!c) return;
  const L = player.t - c.start, inside = L >= -1e-6 && L <= clipDur(c) + 1e-6, ts = kfTimes(c), on = inside && kfAt(c, L) != null;
  const b = $('#kfBtn'); b.innerHTML = icon(on ? 'kfon' : 'kf'); b.classList.toggle('on', on); b.disabled = !inside;
  b.setAttribute('aria-label', on ? 'Remove keyframe' : 'Add keyframe');
  $('#kfPrev').disabled = !ts.some(x => x < L - KF_EPS); $('#kfNext').disabled = !ts.some(x => x > L + KF_EPS);
}
function toggleKf() {
  const c = kfTarget(); if (!c) return; const L = Math.round((player.t - c.start) * S.project.fps) / S.project.fps;
  const had = kfAt(c, player.t - c.start);
  act(p => { const cc = find(p, c.id).clip; if (had != null) removeKeyframe(cc, had); else addKeyframe(cc, Math.max(0, Math.min(clipDur(cc), L))); });
  toast(had != null ? 'Keyframe removed' : 'Keyframe added — move the playhead and change position, size, turn, opacity or volume');
}
function jumpKf(dir) {
  const c = kfTarget(); if (!c) return; const L = player.t - c.start, ts = kfTimes(c);
  const t = dir < 0 ? [...ts].reverse().find(x => x < L - KF_EPS) : ts.find(x => x > L + KF_EPS); if (t == null) return;
  player.pause(); player.seek(c.start + t + 1e-4); timeline.setTime(player.t); showTime(); updateKf();
}
function curveSheet() {
  const c = selected().clip, ts = kfTimes(c), L = player.t - c.start;
  const at = kfAt(c, L) ?? [...ts].reverse().find(x => x <= L) ?? ts[0];
  const cur = Object.values(c.keyframes).flat().find(x => Math.abs(x.t - at) <= KF_EPS)?.ease || 'linear';
  openSheet('Keyframe curve', body => {
    const tip = document.createElement('p'); tip.className = 'hint'; tip.textContent = `How the movement starts from the keyframe at ${fmtS(at)} (to the next one).`;
    body.append(tip, chips(EASING_LIST.map(e => ({ value: e.id, html: `${curveIcon(e.id)}<span>${e.name}</span>` })), cur, v => editSel(cl => setEase(cl, at, v)), 'curves'));
    const row = document.createElement('div'); row.className = 'toggles';
    const del = document.createElement('button'); del.className = 'chipbtn'; del.textContent = 'Delete this keyframe'; del.onclick = () => { editSel(cl => removeKeyframe(cl, at)); closeSheet(); };
    const clr = document.createElement('button'); clr.className = 'chipbtn'; clr.textContent = 'Delete all keyframes'; clr.onclick = () => { editSel(cl => { cl.keyframes = {}; }); closeSheet(); };
    row.append(del, clr); body.append(row);
  });
}
function curveIcon(id) { const f = { linear: t => t, in: t => t * t * t, out: t => 1 - Math.pow(1 - t, 3), inOut: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2, bounce: t => { const n = 7.5625, d = 2.75; if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + .75; if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + .9375; return n * (t -= 2.625 / d) * t + .984375; } }[id];
  let d = ''; for (let i = 0; i <= 20; i++) d += (i ? 'L' : 'M') + (2 + i).toFixed(1) + ' ' + (22 - f(i / 20) * 18).toFixed(1); return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${''}<path d="${d}"/></svg>`; }
function kenBurnsSheet() {
  const c = selected().clip;
  openSheet('Ken Burns', body => {
    const tip = document.createElement('p'); tip.className = 'hint'; tip.textContent = 'A slow, smooth camera move over the photo. Pick one, then press play.';
    body.append(tip, chips(Object.entries(KEN_BURNS).map(([k, v]) => ({ value: k, label: v.name })), null, v => { editSel(cl => kenBurns(cl, v)); player.playRange(c.start, clipEnd(selected().clip)); }));
  });
}

/* ---------------- clip + text animations ---------------- */
let animLoop = 0;
function animSheet(startKind) {
  const f0 = selected(); if (!f0) return; const id = f0.clip.id, isText = f0.clip.type === 'text', { reg, tabs } = animSetFor(f0.clip), lk = loopKind(f0.clip);
  let kind = startKind || 'in';
  const clipNow = () => find(S.project, id)?.clip;
  const cur = k => clipNow()?.anim?.[k] || null;
  // preview plays just the animation, then returns the playhead to where it was (the clip stays on screen)
  const preview = k => { const c = clipNow(); if (!c) return; const e = clipEnd(c), { di, dO } = animSpans(c, clipDur(c)), back = Math.max(c.start, Math.min(e - 1e-3, player.playing ? c.start : player.t));
    if (k === 'in') player.playRange(c.start, Math.min(e, c.start + di + 0.4), back); else if (k === 'out') player.playRange(Math.max(c.start, e - dO - 0.4), e, back);
    else player.playRange(c.start, Math.min(e, c.start + Math.max(2.4, 2 * (c.anim[k]?.dur || DEFAULT_LOOP_DUR))), back); };
  openSheet('Animation', body => {
    const tabEl = chips(tabs.map(([v, l]) => ({ value: v, label: l })), kind, v => { kind = v; fill(); }, 'tabs animtabs');
    const markTabs = () => tabEl.querySelectorAll('.chipbtn').forEach(b => b.classList.toggle('set', !!cur(b.dataset.v)?.id));
    const grid = document.createElement('div'); grid.className = 'trgrid angrid';
    const dpr = Math.min(2, devicePixelRatio || 1), TW = Math.round(64 * dpr), TH = Math.round(64 * dpr);
    const [art] = sampleArt(Math.round(TW * .62), Math.round(TH * .62));
    const sl = slider('Duration', { min: MIN_ANIM, max: MAX_ANIM, step: 0.1, value: DEFAULT_ANIM_DUR, fmt: v => v.toFixed(1) + 's', id: 'anDur', onInput: v => { live(p => { const c = find(p, id).clip; if (c.anim?.[kind]?.id) c.anim[kind].dur = v; }); info(); } });
    sl.querySelector('input').addEventListener('change', () => cur(kind)?.id && preview(kind));
    const note = document.createElement('p'); note.className = 'hint';
    const info = () => { const c = clipNow(); if (!c) return; const a = cur(kind);
      if (!a || !a.id) { note.textContent = kind === lk ? (isText ? 'A loop keeps moving the whole time the text is on screen.' : 'A combo loops for the whole clip.') : kind === 'in' ? 'How the clip appears. In and Out can both be used.' : 'How the clip leaves. In and Out can both be used.'; return; }
      const { di, dO } = animSpans(c, clipDur(c)), real = kind === 'in' ? di : kind === 'out' ? dO : a.dur;
      note.textContent = kind === lk ? `${animById(c, kind, a.id)?.name}: one cycle every ${a.dur.toFixed(1)}s, for the whole clip.` : `${animById(c, kind, a.id)?.name}: plays for ${real.toFixed(1)}s${real + 1e-6 < a.dur ? ' (shortened to fit the clip)' : ''}.`; };
    const setSlider = () => { const c = clipNow(), a = cur(kind), loop = kind === lk, max = loop ? MAX_LOOP : Math.max(MIN_ANIM, Math.min(MAX_ANIM, Math.floor(clipDur(c) * 10) / 10));
      const inp = sl.querySelector('input'); inp.min = loop ? MIN_LOOP : MIN_ANIM; inp.max = max; sl.querySelector('.cl').textContent = loop ? 'Speed' : 'Duration';
      sl.set(Math.min(max, a?.dur || (loop ? DEFAULT_LOOP_DUR : Math.min(DEFAULT_ANIM_DUR, max)))); sl.hidden = !a?.id; };
    const fill = () => {
      grid.innerHTML = ''; const list = reg[kind] || [];
      for (const t of [{ id: null, name: 'None' }, ...list]) {
        const b = document.createElement('button'); b.className = 'trtile' + ((cur(kind)?.id || null) === t.id ? ' on' : ''); b.dataset.an = t.id || 'none';
        b.innerHTML = `<canvas width="${TW}" height="${TH}"></canvas><span>${t.name}</span>`;
        if (!t.id) { const x = b.querySelector('canvas').getContext('2d'); x.fillStyle = '#2a2a33'; x.fillRect(0, 0, TW, TH); x.strokeStyle = '#777'; x.lineWidth = 3 * dpr; x.beginPath(); x.arc(TW / 2, TH / 2, TW * .22, 0, 7); x.moveTo(TW * .34, TH * .66); x.lineTo(TW * .66, TH * .34); x.stroke(); }
        b.onclick = () => { const k = kind; live(p => { const c = find(p, id).clip; c.anim = { ...(c.anim || {}) };
            if (t.id) c.anim[k] = { id: t.id, dur: c.anim[k]?.dur || (k === lk ? DEFAULT_LOOP_DUR : Math.min(DEFAULT_ANIM_DUR, clipDur(c))) }; else delete c.anim[k];
            if (!Object.keys(c.anim).length) delete c.anim; });
          grid.querySelectorAll('.trtile').forEach(x => x.classList.toggle('on', x === b)); setSlider(); info(); markTabs(); timeline.render(); if (t.id) preview(k); };
        grid.appendChild(b);
      }
      setSlider(); info(); markTabs();
    };
    body.append(tabEl, grid, sl, note); fill();
    // animated tiles: the real renderer draws every tile (same code as preview + export)
    const tc = { id: 'tile', type: isText ? 'text' : 'image', fit: 'contain', transform: { ...DEFAULT_TRANSFORM }, keyframes: {}, start: 0, dur: 1, text: { ...(f0.clip.text || {}), content: 'Abc', size: 300, align: 'center', box: false } };
    const src = { img: art, w: art.width, h: art.height };
    cancelAnimationFrame(animLoop);
    const loop = now => { if (!document.body.contains(grid)) return;
      grid.querySelectorAll('.trtile').forEach(b => { const aid = b.dataset.an; if (aid === 'none') return; const x = b.querySelector('canvas').getContext('2d');
        let t, D; if (kind === lk) { D = 99; t = now / 1000; tc.anim = { [kind]: { id: aid, dur: 1.2 } }; } else { D = 1; const cyc = (now % 1700) / 1000; t = kind === 'in' ? Math.min(1, cyc) : Math.min(1, Math.max(0, cyc - .3)); tc.anim = { [kind]: { id: aid, dur: .9 } }; }
        tc.dur = D; x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.filter = 'none'; x.fillStyle = '#1b1b24'; x.fillRect(0, 0, TW, TH);
        if (isText) drawText(x, TW, TH, tc, DEFAULT_TRANSFORM, t); else drawVisual(x, TW, TH, src, tc, { ...DEFAULT_TRANSFORM, scale: .62 }, t, { plain: true });
        x.restore(); });
      animLoop = requestAnimationFrame(loop); };
    animLoop = requestAnimationFrame(loop);
  }, { className: 'tall' });
}

/* ---------------- transitions ---------------- */
let thumbLoop = 0;
function sampleArt(W, H) {
  const mk = () => Object.assign(document.createElement('canvas'), { width: W, height: H });
  const a = mk(), b = mk(), x = a.getContext('2d'), y = b.getContext('2d');
  let g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#ffcf3d'); g.addColorStop(1, '#ff7a1a'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = '#fff8'; x.beginPath(); x.arc(W * .32, H * .34, W * .17, 0, 7); x.fill(); x.fillStyle = '#7a3d00'; x.fillRect(0, H * .72, W, H * .28);
  g = y.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#3b5bff'); g.addColorStop(1, '#1fb6ff'); y.fillStyle = g; y.fillRect(0, 0, W, H);
  y.fillStyle = '#fff'; y.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? W * .1 : W * .24, an = -Math.PI / 2 + i * Math.PI / 5; y.lineTo(W * .62 + r * Math.cos(an), H * .45 + r * Math.sin(an)); } y.fill();
  return [a, b];
}
function transitionSheet(clipId) {
  const f0 = find(S.project, clipId); if (!f0) return;
  select(null);
  const track = f0.track, idx = track.clips.indexOf(f0.clip); if (idx < 1) return;
  const cur = f0.clip.transitionIn || null; let cat = cur && transitionById(cur.id) ? transitionById(cur.id).cat : TRANSITION_CATS[0];
  const preview = () => { const f = find(S.project, clipId); if (!f) return; const i = f.track.clips.indexOf(f.clip), a = f.track.clips[i - 1]; player.playRange(Math.max(0, f.clip.start - 0.4), Math.min(projectDuration(S.project), clipEnd(a) + 0.4)); };
  openSheet('Transition', body => {
    const tabs = chips(TRANSITION_CATS.map(c => ({ value: c, label: c })), cat, v => { cat = v; fill(); }, 'tabs');
    const grid = document.createElement('div'); grid.className = 'trgrid';
    const dpr = Math.min(2, devicePixelRatio || 1), TW = Math.round(64 * dpr), TH = Math.round(64 * dpr), [SA, SB] = sampleArt(TW, TH), hh = trHelpers();
    const curId = () => find(S.project, clipId)?.clip.transitionIn?.id || null;
    const fill = () => {
      grid.innerHTML = '';
      const items = [{ id: null, name: 'None' }, ...TRANSITIONS.filter(t => t.cat === cat)];
      for (const t of items) {
        const b = document.createElement('button'); b.className = 'trtile' + (t.id === curId() ? ' on' : ''); b.dataset.tr = t.id || 'none';
        b.innerHTML = `<canvas width="${TW}" height="${TH}"></canvas><span>${t.name}</span>`;
        if (!t.id) { const x = b.querySelector('canvas').getContext('2d'); x.fillStyle = '#2a2a33'; x.fillRect(0, 0, TW, TH); x.strokeStyle = '#777'; x.lineWidth = 3 * dpr; x.beginPath(); x.arc(TW / 2, TH / 2, TW * .22, 0, 7); x.moveTo(TW * .34, TH * .66); x.lineTo(TW * .66, TH * .34); x.stroke(); }
        b.onclick = () => { live(p => { const c = find(p, clipId).clip; c.transitionIn = t.id ? { id: t.id, dur: c.transitionIn?.dur || dur.v } : null; });
          grid.querySelectorAll('.trtile').forEach(x => x.classList.toggle('on', x === b)); info(); if (t.id) preview(); };
        grid.appendChild(b);
      }
    };
    const dur = { v: cur?.dur || DEFAULT_TRANSITION_DUR };
    const sl = slider('Duration', { min: MIN_TRANSITION, max: MAX_TRANSITION, step: 0.1, value: dur.v, fmt: v => v.toFixed(1) + 's', id: 'trDur', onInput: v => { dur.v = v; live(p => { const c = find(p, clipId).clip; if (c.transitionIn) c.transitionIn.dur = v; }); info(); } });
    sl.querySelector('input').addEventListener('change', () => curId() && preview());
    const note = document.createElement('p'); note.className = 'hint';
    const info = () => { const f = find(S.project, clipId); if (!f) return; const i = f.track.clips.indexOf(f.clip), eff = transEff(f.track.clips[i - 1], f.clip);
      note.textContent = !f.clip.transitionIn ? 'Pick a transition for this cut.' : eff + 1e-6 < f.clip.transitionIn.dur ? `Plays for ${eff.toFixed(1)}s — the clips are short, so it can’t be longer.` : `Plays for ${eff.toFixed(1)}s. The clips overlap during the transition.`; };
    const row = document.createElement('div'); row.className = 'toggles';
    const all = document.createElement('button'); all.className = 'chipbtn'; all.id = 'trAll'; all.textContent = 'Apply to all';
    all.onclick = () => { const tr = find(S.project, clipId).clip.transitionIn; if (!tr) { toast('Pick a transition first'); return; }
      live(p => { const t = p.tracks.find(x => x.kind === 'main'); t.clips.forEach((c, i) => { if (i) c.transitionIn = { ...tr }; }); }); toast('Transition added to every cut'); };
    const rm = document.createElement('button'); rm.className = 'chipbtn'; rm.id = 'trRemove'; rm.textContent = 'Remove';
    rm.onclick = () => { live(p => { find(p, clipId).clip.transitionIn = null; }); grid.querySelectorAll('.trtile').forEach(x => x.classList.toggle('on', x.dataset.tr === 'none')); info(); };
    row.append(all, rm);
    body.append(tabs, grid, sl, note, row); fill(); info();
    cancelAnimationFrame(thumbLoop);
    const loop = now => { if (!document.body.contains(grid)) return;
      const p = Math.min(1, ((now / 1500) % 1.3) / 1.1);
      grid.querySelectorAll('.trtile').forEach(b => { const T = transitionById(b.dataset.tr); if (!T) return; const x = b.querySelector('canvas').getContext('2d'); x.save(); x.clearRect(0, 0, TW, TH); T.render(x, SA, SB, p, TW, TH, hh); x.restore(); });
      thumbLoop = requestAnimationFrame(loop); };
    thumbLoop = requestAnimationFrame(loop);
  }, { className: 'tall' });
}
/** Test hook: every transition must look like A at p=0 and like B at p=1. Returns mean colour per p. */
function testTransitions(ps = [0, 0.5, 1]) {
  const W = 90, H = 160, mk = c => { const k = Object.assign(document.createElement('canvas'), { width: W, height: H }); const x = k.getContext('2d'); x.fillStyle = c; x.fillRect(0, 0, W, H); return k; };
  const A = mk('#ff0000'), B = mk('#0000ff'), out = Object.assign(document.createElement('canvas'), { width: W, height: H }), x = out.getContext('2d', { willReadFrequently: true }), hh = trHelpers(), res = {};
  for (const T of TRANSITIONS) { res[T.id] = ps.map(p => { x.save(); x.clearRect(0, 0, W, H); T.render(x, A, B, p, W, H, hh); x.restore(); const d = x.getImageData(0, 0, W, H).data; let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; } const n = d.length / 4; return [r / n, g / n, b / n].map(Math.round); }); }
  return res;
}

/* ---------------- import ---------------- */
let pickTarget = 'main';
function pick(kind) { if (player.playing) player.pause(); pickTarget = kind; const inp = kind === 'audio' ? $('#fileAudio') : $('#fileMedia'); inp.value = ''; inp.click(); }
async function onFiles(files, kind) {
  files = [...files]; if (!files.length) return;
  const at = player.t, made = [];
  $('#busy').hidden = false;
  try {
    for (let i = 0; i < files.length; i++) {
      $('#busyText').textContent = `Adding ${i + 1} of ${files.length}…`;
      const f = files[i], k = kindOf(f);
      if (!k) { toast('Skipped ' + f.name + ' (not a video, photo or sound)'); continue; }
      if (kind === 'audio' && k === 'image') { toast('Pick a sound file for the audio track'); continue; }
      let rec; try { rec = await importFile(f); } catch (e) { console.warn(e); toast('Could not open ' + f.name); continue; }
      made.push(rec);
    }
    if (!made.length) return;
    try { navigator.storage && navigator.storage.persist && navigator.storage.persist(); } catch (e) {}
    const firstEver = !S.project.tracks.some(t => t.clips.length);
    act(p => {
      let t = at;
      for (const rec of made) {
        const asAudio = kind === 'audio' || rec.type === 'audio';
        const base = rec.type === 'image' ? { mediaId: rec.id, dur: 3 } : { mediaId: rec.id, in: 0, out: rec.duration };
        if (asAudio) { const c = newClip('audio', { mediaId: rec.id, in: 0, out: rec.duration }); addToKind(p, 'audio', c, t); t += clipDur(c); }
        else if (kind === 'overlay') { const c = newClip(rec.type, { ...base, transform: { ...DEFAULT_TRANSFORM, scale: 0.55 } }); addToKind(p, 'overlay', c, t); t += clipDur(c); }
        else { const c = newClip(rec.type, base); addToMain(p, [c], t); t = clipEnd(c); }
      }
    });
    if (firstEver) { timeline.fitZoom(); timeline.render(); }
    toast(made.length === 1 ? 'Added ' + made[0].name : `Added ${made.length} files`);
  } finally { $('#busy').hidden = true; }
}

/* ---------------- toolbar ---------------- */
const isVisualClip = c => c.type !== 'audio' && c.type !== 'effect';
const ROOT_TOOLS = [
  { id: 'media', icon: 'media', label: 'Media', run: () => pick('main') },
  { id: 'adshuffle', icon: 'shuffle', label: 'Shuffle ad', when: () => !!(S.project && S.project.ad), run: () => shuffleAd(adCtx()) },
  { id: 'adedit', icon: 'beat', label: 'Edit ad', when: () => !!(S.project && S.project.ad), run: () => adSheet(adCtx(), S.project.ad) },
  { id: 'templates', icon: 'templates', label: 'Templates', run: () => templatesSheet() },
  { id: 'admaker', icon: 'beat', label: 'Beat ad', when: () => !(S.project && S.project.ad), run: () => adSheet(adCtx()) },
  { id: 'audio', icon: 'music', label: 'Audio', run: () => pick('audio') },
  { id: 'sounds', icon: 'sounds', label: 'Sounds', run: () => soundsSheet({ player, timeline, toast }) },
  { id: 'record', icon: 'mic', label: 'Record', run: recordSheet },
  { id: 'speech', icon: 'speech', label: 'Add speech', run: speechSheet },
  { id: 'text', icon: 'text', label: 'Text', run: addText },
  { id: 'titles', icon: 'titles', label: 'Titles', run: addTitle },
  { id: 'captions', icon: 'captions', label: 'Captions', run: captionsSheet },
  { id: 'stickers', icon: 'sticker', label: 'Stickers', run: () => stickers.stickerSheet({ player, toast, media, importFile, act, newClip, addToKind, DEFAULT_TRANSFORM, select }) },
  { id: 'effects', icon: 'effects', label: 'Effects', run: () => { select(null); effectsSheet('track'); } },
  { id: 'overlay', icon: 'overlay', label: 'Overlay', run: () => pick('overlay') },
  { id: 'split', icon: 'split', label: 'Split', run: doSplit },
  { id: 'ratio', icon: 'ratio', label: 'Ratio', run: ratioSheet },
  { id: 'bg', icon: 'bg', label: 'Background', run: bgSheet },
  { id: 'guides', icon: 'safe', label: 'Safe area', run: pro.guidesSheet },
];
const CLIP_TOOLS = [
  { id: 'phreplace', icon: 'replace', label: 'Replace me', when: c => !!c.placeholder && c.placeholder !== 'text' && isPic(c), run: () => pro.replaceClip() },
  { id: 'split', icon: 'split', label: 'Split', run: doSplit },
  { id: 'edit', icon: 'edit', label: 'Edit text', when: c => c.type === 'text', run: () => textSheet('edit') },
  { id: 'captions', icon: 'captions', label: 'Captions', when: c => !!c.caption, run: captionsSheet },
  { id: 'textstyle', icon: 'textstyle', label: 'Text style', when: c => c.type === 'text', run: () => textSheet('style') },
  { id: 'anim', icon: 'anim', label: 'Animation', when: isVisualClip, run: () => animSheet() },
  { id: 'speed', icon: 'speed', label: 'Speed', when: hasSource, run: () => selected().clip.curve ? pro.curveSpeedSheet() : speedSheet() },
  { id: 'crop', icon: 'crop', label: 'Crop', when: c => isPic(c), run: pro.cropSheet },
  { id: 'mask', icon: 'mask', label: 'Mask', when: c => isPic(c), run: pro.maskSheet },
  { id: 'cutout', icon: 'cutout', label: 'Cutout', when: c => isPic(c), run: pro.cutoutSheet },
  { id: 'blend', icon: 'blend', label: 'Blend', when: c => isPic(c), run: pro.blendSheet },
  { id: 'tooverlay', icon: 'overlay', label: 'Overlay', when: c => isPic(c) && find(S.project, c.id)?.track.kind === 'main', run: () => pro.toTrack('overlay') },
  { id: 'tomain', icon: 'tomain', label: 'Main track', when: c => isPic(c) && find(S.project, c.id)?.track.kind === 'overlay', run: () => pro.toTrack('main') },
  { id: 'freeze', icon: 'freeze', label: 'Freeze', when: c => c.type === 'video', run: () => pro.freezeSheet() },
  { id: 'reverse', icon: 'reverse', label: 'Reverse', when: c => c.type === 'video', run: () => pro.reverseClip() },
  { id: 'replace', icon: 'replace', label: 'Replace', when: c => isPic(c) && !(c.placeholder && c.placeholder !== 'text'), run: pro.replaceClip },
  { id: 'volume', icon: 'volume', label: 'Volume', when: hasSource, run: volumeSheet },
  { id: 'enhvoice', icon: 'enhvoice', label: 'Enhance voice', when: hasSource, run: enhanceVoiceSheet },
  { id: 'voicefx', icon: 'voicefx', label: 'Voice effects', when: hasSource, run: voiceFxSheet },
  { id: 'extract', icon: 'extract', label: 'Extract audio', when: c => c.type === 'video', run: doExtract },
  { id: 'mute', icon: 'mute', label: 'Mute sound', when: c => c.type === 'video', run: () => { act(p => { const c = find(p, S.sel).clip; c.muteAudio = !c.muteAudio; }); toast(selected().clip.muteAudio ? 'Original sound muted' : 'Original sound on'); } },
  { id: 'duration', icon: 'clock', label: 'Duration', when: c => !hasSource(c), run: durationSheet },
  { id: 'hd', icon: 'hd', label: 'HD Enhance', when: c => c.type === 'video' || c.type === 'image', run: hdSheet },
  { id: 'adjust', icon: 'adjust', label: 'Adjust', when: c => c.type === 'video' || c.type === 'image', run: colorSheet },
  { id: 'transform', icon: 'move', label: 'Transform', when: isVisualClip, run: transformSheet },
  { id: 'effect', icon: 'effects', label: 'Effect', when: c => c.type === 'effect', run: () => effectsSheet('track') },
  { id: 'clipfx', icon: 'effects', label: 'Effects', when: c => c.type === 'video' || c.type === 'image', run: () => effectsSheet('clip') },
  { id: 'filters', icon: 'filter', label: 'Filters', when: c => c.type === 'video' || c.type === 'image', run: filterSheet },
  { id: 'fit', icon: 'fit', label: 'Fit / Fill', when: c => c.type === 'video' || c.type === 'image', run: toggleFit },
  { id: 'curve', icon: 'curve', label: 'Curve', when: c => hasKeyframes(c), run: curveSheet },
  { id: 'kenburns', icon: 'kenburns', label: 'Ken Burns', when: c => c.type === 'image', run: kenBurnsSheet },
  { id: 'transition', icon: 'transition', label: 'Transition', when: c => { const f = find(S.project, c.id); return f && TRACK_KINDS[f.track.kind].magnetic && f.track.clips.length > 1; }, run: () => { const f = selected(); const i = f.track.clips.indexOf(f.clip); transitionSheet(f.track.clips[Math.max(1, i)].id); } },
  { id: 'duplicate', icon: 'copy', label: 'Duplicate', run: () => { const b = act(p => duplicate(p, S.sel)); b && select(b.id); } },
  { id: 'delete', icon: 'trash', label: 'Delete', run: () => { const id = S.sel; select(null); act(p => remove(p, id)); player.gc(); } },
];
function refreshToolbar() {
  const bar = $('#toolbar'), f = selected();
  const tools = f ? CLIP_TOOLS.filter(t => !t.when || t.when(f.clip)) : ROOT_TOOLS.filter(t => !t.when || t.when());
  const key = (f ? f.clip.id + ':' : 'root:') + tools.map(t => t.id).join(',');
  if (bar.dataset.key === key) return; bar.dataset.key = key;
  bar.innerHTML = (f ? `<button class="tool back" data-tool="back">${icon('back')}<span>Back</span></button>` : '') +
    tools.map(t => `<button class="tool" data-tool="${t.id}">${icon(t.icon)}<span>${t.label}</span></button>`).join('');
  bar.onclick = e => { const b = e.target.closest('.tool'); if (!b) return; if (b.dataset.tool === 'back') { select(null); return; }
    const t = tools.find(x => x.id === b.dataset.tool); if (player.playing) player.pause(); t && t.run(); };
}
function doExtract() {
  const f = selected(); if (!f) return; const r = media.get(f.clip.mediaId);
  if (r && r.hasAudio === false) { toast('This video has no sound'); return; }
  const a = act(p => extractAudio(p, f.clip.id)); if (a) { select(a.id); toast('Sound extracted to the audio line — the video is now muted'); }
}
function doSplit() {
  const t = player.t; let f = selected();
  if (!f || !(f.clip.start < t && t < clipEnd(f.clip))) { const main = S.project.tracks.find(x => x.kind === 'main'); const c = main.clips.find(c => c.start < t && t < clipEnd(c)); f = c && find(S.project, c.id); }
  if (!f) { toast('Move the white line onto a clip to split it'); return; }
  const b = act(p => split(p, f.clip.id, t)); if (!b) toast('Too close to the edge to split'); else select(b.id);
}
function addText(quiet) {
  const c = newClip('text', { dur: 3, transform: { ...DEFAULT_TRANSFORM, y: 0.5 } });
  act(p => addToKind(p, 'text', c, Math.min(player.t, Math.max(0, projectDuration(p) - 0.1))));
  select(c.id); if (quiet !== true) textSheet('edit');
}
function toggleFit() { const f = selected(); act(p => { const c = find(p, f.clip.id).clip; c.fit = c.fit === 'cover' ? 'contain' : 'cover'; }); toast(selected().clip.fit === 'cover' ? 'Fill: covers the whole frame' : 'Fit: shows the whole picture'); }

/* ---------------- panels ---------------- */
const editSel = fn => live(p => { const f = find(p, S.sel); f && fn(f.clip, p); });
function speedSheet() {
  const c = selected().clip, toU = s => Math.log(s / 0.25) / Math.log(16), toS = u => Math.round(0.25 * Math.pow(16, u) * 100) / 100;
  openSheet('Speed', body => {
    body.append(chips([{ value: 'normal', label: 'Normal' }, { value: 'curve', label: 'Curve' }], 'normal', v => { if (v === 'curve') pro.curveSpeedSheet(); }, 'tabs speedtabs'));
    const info = document.createElement('p'); info.className = 'hint';
    const upd = () => { const cc = selected().clip; info.textContent = `Clip length: ${fmtS(clipDur(cc))} (original ${fmtS(cc.out - cc.in)})`; };
    const sl = slider('Speed', { min: 0, max: 1, step: 0.001, value: toU(c.speed), fmt: u => toS(u).toFixed(2).replace(/0$/, '') + 'x', id: 'speedRange', onInput: u => { editSel((cl, p) => setSpeed(p, cl.id, toS(u))); ch.setActive(toS(u)); upd(); } });
    const ch = chips(SPEED_PRESETS.map(v => ({ value: v, label: v + 'x' })), c.speed, v => { editSel((cl, p) => setSpeed(p, cl.id, v)); sl.set(toU(v)); upd(); });
    const row = document.createElement('div'); row.className = 'toggles';
    const kp = document.createElement('button'); kp.id = 'speedPitch'; kp.className = 'chipbtn' + (keepPitch(c) ? ' on' : ''); kp.textContent = 'Keep voice pitch';
    kp.onclick = () => { editSel(cl => { cl.keepPitch = !keepPitch(cl); }); kp.classList.toggle('on', keepPitch(selected().clip)); };
    row.append(kp);
    body.append(sl, ch, row, info, Object.assign(document.createElement('p'), { className: 'hint', textContent: 'Keep voice pitch (on): faster or slower without chipmunk or slow-motion voices.' })); upd();
  });
}
function volumeSheet() {
  const c = selected().clip;
  openSheet('Volume', body => {
    const L = localT(c), cur = propAt(c, 'volume', L);
    body.append(slider('Volume', { min: 0, max: 2, step: 0.01, value: cur, fmt: v => Math.round(v * 100) + '%', id: 'volRange', onInput: v => editSel(cl => setProp(cl, 'volume', v, L)) }));
    body.append(chips([{ value: 0, label: 'Mute' }, { value: 0.5, label: '50%' }, { value: 1, label: '100%' }, { value: 1.5, label: '150%' }, { value: 2, label: '200%' }], cur, v => { editSel(cl => setProp(cl, 'volume', v, L)); body.querySelector('label.ctl').set(v); }));
    if (hasKeyframes(c)) body.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: `Animated clip: this sets the volume at ${fmtS(L)} (a keyframe).` }));
    const mx = () => Math.max(0.1, Math.min(MAX_FADE, Math.floor(clipDur(selected().clip) * 10) / 10));
    body.append(slider('Fade in', { min: 0, max: mx(), step: 0.1, value: c.fadeIn || 0, fmt: v => v.toFixed(1) + 's', id: 'fadeIn', onInput: v => { editSel(cl => { cl.fadeIn = v || undefined; if (!v) delete cl.fadeIn; }); timeline.render(); } }));
    body.append(slider('Fade out', { min: 0, max: mx(), step: 0.1, value: c.fadeOut || 0, fmt: v => v.toFixed(1) + 's', id: 'fadeOut', onInput: v => { editSel(cl => { cl.fadeOut = v || undefined; if (!v) delete cl.fadeOut; }); timeline.render(); } }));
    if (c.type === 'video') { const row = document.createElement('div'); row.className = 'toggles'; const m = document.createElement('button'); m.id = 'muteOrig'; m.className = 'chipbtn' + (c.muteAudio ? ' on' : ''); m.textContent = 'Mute original sound';
      m.onclick = () => { editSel(cl => { cl.muteAudio = !cl.muteAudio; if (!cl.muteAudio) delete cl.muteAudio; }); m.classList.toggle('on', !!selected().clip.muteAudio); timeline.render(); }; row.append(m); body.append(row); }
  });
}
function durationSheet() {
  const c = selected().clip;
  openSheet('Duration', body => body.append(slider('Duration', { min: 0.5, max: 30, step: 0.1, value: c.dur, fmt: v => v.toFixed(1) + 's', id: 'durRange', onInput: v => editSel(cl => { cl.dur = v; }) })));
}
function transformSheet() {
  const c = selected().clip;
  openSheet('Transform', body => {
    const sls = {};
    const L = localT(c);
    for (const k of TRANSFORM_PROPS) { const d = KEYFRAME_PROPS[k]; body.append(sls[k] = slider(d.label, { min: d.min, max: d.max, step: d.step, value: propAt(c, k, L), fmt: d.fmt, id: 'adj-' + k, onInput: v => editSel(cl => setProp(cl, k, v, L)) })); }
    if (hasKeyframes(c)) body.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: `Animated clip: changes here set a keyframe at ${fmtS(L)}.` }));
    const r = document.createElement('button'); r.className = 'btn ghost'; r.textContent = 'Reset';
    r.onclick = () => { const def = c.type === 'video' || c.type === 'image' ? (find(S.project, c.id).track.kind === 'overlay' ? { ...DEFAULT_TRANSFORM, scale: .55 } : DEFAULT_TRANSFORM) : DEFAULT_TRANSFORM; editSel(cl => { cl.transform = { ...def }; for (const k of TRANSFORM_PROPS) delete (cl.keyframes || {})[k]; }); for (const k in sls) sls[k].set(def[k]); };
    const tip = document.createElement('p'); tip.className = 'hint'; tip.textContent = 'Tip: drag on the picture to move it, pinch with two fingers to resize and turn it.';
    body.append(r, tip);
  });
}
/* ---------------- HD Enhance + colour Adjust ---------------- */
const srcSize = c => { const r = media.get(c.mediaId); return r && r.width ? { w: r.width, h: r.height } : null; };
const isPic = c => c.type === 'video' || c.type === 'image';
function hdSheet() {
  const c = selected().clip;
  openSheet('HD Enhance', body => {
    const e = () => selected().clip.enhance || { on: false, strength: DEFAULT_STRENGTH };
    const row = document.createElement('div'); row.className = 'hdrow';
    const tg = document.createElement('button'); tg.id = 'hdToggle'; tg.className = 'hdtoggle';
    const paint = () => { const on = enhanceOn(selected().clip); tg.classList.toggle('on', on); tg.innerHTML = `${icon('hd', 26)}<span><b>HD Enhance</b><small>${on ? 'On — sharper, cleaner, richer' : 'Off'}</small></span><i class="sw"></i>`; tg.setAttribute('aria-pressed', on); };
    tg.onclick = () => { editSel(cl => { const x = cl.enhance || { strength: DEFAULT_STRENGTH }; cl.enhance = { ...x, on: !enhanceOn(cl), strength: x.strength || DEFAULT_STRENGTH }; }); paint(); };
    row.append(tg); body.append(row); paint();
    body.append(slider('Strength', { min: 0, max: 1, step: 0.01, value: e().strength ?? DEFAULT_STRENGTH, fmt: v => Math.round(v * 100) + '%', id: 'hdStrength',
      onInput: v => { editSel(cl => { cl.enhance = { on: true, strength: v }; }); paint(); } }));
    const sz = srcSize(c), out = outputSize(S.project.aspect, +(localStorage.getItem('studio.res') || 1080)), short = sz ? Math.min(sz.w, sz.h) : 0;
    const tip = document.createElement('p'); tip.className = 'hint'; tip.id = 'hdInfo';
    tip.textContent = (sz ? `This ${c.type === 'image' ? 'photo' : 'video'} is ${sz.w} × ${sz.h}. ` : '') + (sz && short < Math.min(out.W, out.H) ? `It is upscaled to ${Math.min(out.W, out.H)}p with the HD upscaler; HD Enhance also cleans noise and sharpens edges.` : 'HD Enhance cleans noise, sharpens edges and adds gentle clarity and colour.') + ' Tap ◐ on the picture to compare before / after.';
    const all = document.createElement('div'); all.className = 'toggles';
    const ba = document.createElement('button'); ba.className = 'chipbtn'; ba.id = 'hdAll'; ba.textContent = 'Apply to all clips';
    ba.onclick = () => { const v = { ...e(), on: enhanceOn(selected().clip) }; live(p => { for (const t of p.tracks) for (const cl of t.clips) if (isPic(cl)) cl.enhance = { ...v }; }); toast(v.on ? 'HD Enhance on for every video and photo' : 'HD Enhance off for every clip'); };
    all.append(ba); body.append(all, tip);
  });
}
function colorSheet() {
  const c = selected().clip; let cur = ADJUST[0].id;
  openSheet('Adjust', body => {
    const val = k => selected().clip.adjust?.[k] || 0, shown = (d, v) => (v > 0 && d.min < 0 ? '+' : '') + Math.round(v * 100);
    const tabs = chips(ADJUST.map(d => ({ value: d.id, html: `<span>${d.label}</span><em></em>` })), cur, v => { cur = v; sync(); }, 'tabs adjtabs');
    const def = () => ADJUST.find(d => d.id === cur);
    const sl = slider('Amount', { min: -1, max: 1, step: 0.01, value: val(cur), fmt: v => shown(def(), v), id: 'colSlider',
      onInput: v => { editSel(cl => { cl.adjust = { ...(cl.adjust || {}), [cur]: v }; }); marks(); } });
    const sync = () => { const d = def(), inp = sl.querySelector('input'); inp.min = d.min; inp.max = d.max; sl.querySelector('.cl').textContent = d.label; sl.set(val(cur)); };
    const marks = () => tabs.querySelectorAll('.chipbtn').forEach(b => { const v = val(b.dataset.v); b.classList.toggle('set', Math.abs(v) > 1e-4); b.querySelector('em').textContent = Math.abs(v) > 1e-4 ? shown(ADJUST.find(d => d.id === b.dataset.v), v) : ''; });
    body.append(tabs, sl);
    const row = document.createElement('div'); row.className = 'toggles';
    const r = document.createElement('button'); r.className = 'chipbtn'; r.id = 'colReset'; r.textContent = 'Reset all';
    r.onclick = () => { editSel(cl => { cl.adjust = null; }); sync(); marks(); };
    const all = document.createElement('button'); all.className = 'chipbtn'; all.id = 'colAll'; all.textContent = 'Apply to all clips';
    all.onclick = () => { const a = { ...(selected().clip.adjust || {}) }; live(p => { for (const t of p.tracks) for (const cl of t.clips) if (isPic(cl)) cl.adjust = { ...a }; }); toast('Adjustments copied to every video and photo'); };
    row.append(r, all); body.append(row); sync(); marks();
  });
}
/* before / after compare on the preview: tap ◐ for a split view (drag the line), press and hold for "before" */
function setCompare(c) { player.compare = c; const o = $('#cmp'); o.hidden = !c || c.mode !== 'split'; if (c && c.mode === 'split') o.querySelector('.cmpline').style.left = (c.x * 100) + '%';
  $('#cmpBtn').classList.toggle('on', !!c); $('#cmpTag').hidden = !c || c.mode !== 'before'; player.requestDraw(); }
function compareUI() {
  const b = $('#cmpBtn'); b.innerHTML = icon('compare', 20); let hold = null, held = false, prev = null, eat = false;
  b.addEventListener('pointerdown', e => { e.preventDefault(); held = false; eat = false; prev = player.compare; hold = setTimeout(() => { held = true; setCompare({ mode: 'before' }); }, 280); });
  const up = () => { clearTimeout(hold); if (held) { setCompare(prev); held = false; eat = true; setTimeout(() => { eat = false; }, 400); } };
  b.addEventListener('pointerup', up); b.addEventListener('pointercancel', up); b.addEventListener('pointerleave', () => { if (held) up(); });
  b.addEventListener('contextmenu', e => e.preventDefault());
  b.addEventListener('click', () => { if (held || eat) { eat = false; return; } setCompare(player.compare && player.compare.mode === 'split' ? null : { mode: 'split', x: 0.5 }); if (player.compare) toast('Left: before · Right: after (HD + adjust). Drag the line.'); });
  const o = $('#cmp'), line = o.querySelector('.cmpline');
  line.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); line.setPointerCapture(e.pointerId);
    const mv = ev => { const r = o.getBoundingClientRect(); setCompare({ mode: 'split', x: Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) }); };
    const fin = () => { line.removeEventListener('pointermove', mv); line.removeEventListener('pointerup', fin); line.removeEventListener('pointercancel', fin); };
    line.addEventListener('pointermove', mv); line.addEventListener('pointerup', fin); line.addEventListener('pointercancel', fin); });
}
/** Test/metrics hook: render the project at time t into a W x H canvas exactly like the exporter does. */
async function renderStill({ t = 0, W, H, plain = false, fast = false, type = 'image/png' } = {}) {
  await ensureProjectFonts(S.project);
  if (!W) ({ W, H } = outputSize(S.project.aspect, 1080));
  const { loadBitmap } = await import('./media.js');
  const cv = new OffscreenCanvas(W, H), ctx = cv.getContext('2d', { alpha: false }), frames = new Map();
  for (const tr of S.project.tracks) for (const c of tr.clips) if (c.type === 'image' && c.start <= t && t < clipEnd(c)) { const bm = await loadBitmap(media.get(c.mediaId)); frames.set(c.id, { img: bm, w: bm.width, h: bm.height }); }
  player.seek(t); await new Promise(r => setTimeout(r, 300));
  renderFrame(ctx, W, H, S.project, t, c => frames.get(c.id) || player.source(c), { plain, fast });
  const blob = await cv.convertToBlob({ type }); const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
}
/* text sheet: Edit / Font / Styles / Bubble / Titles. Tiles are drawn by the real drawText (same as preview + export). */
let textTab = 'edit';
function textTile(x, TW, TH, clip, t = clip.anim ? (clip.dur || 3) / 2 : 0) {
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.filter = 'none'; x.fillStyle = '#23232d'; x.fillRect(0, 0, TW, TH);
  const b = drawText(x, TW, TH, clip, { ...DEFAULT_TRANSFORM, opacity: 0 }, 99), k = Math.min(0.86 * TW / Math.max(1, b.w), 0.8 * TH / Math.max(1, b.h), 3);
  drawText(x, TW, TH, clip, { ...DEFAULT_TRANSFORM, scale: k }, t); x.restore();
}
function textSheet(startTab) {
  const f0 = selected(); if (!f0) return; const id = f0.clip.id; textTab = startTab || textTab || 'edit';
  const clipNow = () => find(S.project, id)?.clip;
  openSheet('Text', body => {
    const T = clipNow().text;
    const ta = document.createElement('textarea'); ta.id = 'textInput'; ta.rows = 2; ta.value = T.content === 'Your text' ? '' : T.content; ta.placeholder = 'Type your text';
    ta.oninput = () => { editSel(cl => { cl.text.content = ta.value || ' '; delete cl.placeholder; }); }; body.append(ta);
    const pane = document.createElement('div'); pane.className = 'textpane';
    const tabEl = chips([['edit', 'Edit'], ['font', 'Font'], ['style', 'Styles'], ['bubble', 'Bubble'], ['title', 'Titles']].map(([value, label]) => ({ value, label })), textTab, v => { textTab = v; show(); }, 'tabs texttabs');
    body.append(tabEl, pane);
    const dpr = Math.min(2, devicePixelRatio || 1), TW = Math.round(76 * dpr), TH = Math.round(54 * dpr);
    let unsub = null;
    const tileGrid = (items, cur, mk, onPick, cls) => {
      const g = document.createElement('div'); g.className = 'trgrid txgrid ' + cls;
      const draw = () => g.querySelectorAll('.trtile').forEach((b, i) => textTile(b.querySelector('canvas').getContext('2d'), TW, TH, mk(items[i])));
      items.forEach(it => { const b = document.createElement('button'); b.className = 'trtile' + (it.id === cur ? ' on' : ''); b.dataset.v = it.id; b.innerHTML = `<canvas width="${TW}" height="${TH}"></canvas><span>${it.name}</span>`;
        b.onclick = () => { g.querySelectorAll('.trtile').forEach(x => x.classList.toggle('on', x === b)); onPick(it); }; g.append(b); });
      setTimeout(draw, 0); unsub && unsub(); unsub = onFontLoad(() => document.body.contains(g) && draw());
      return g;
    };
    const show = () => {
      pane.innerHTML = ''; const T = clipNow().text;
      if (textTab === 'edit') {
        pane.append(swatches(COLORS, T.color, v => editSel(cl => { cl.text.color = v; cl.text.fill = null; })));
        pane.append(slider('Size', { min: 24, max: 300, step: 1, value: T.size, fmt: v => Math.round(v), id: 'textSize', onInput: v => editSel(cl => { cl.text.size = v; }) }));
        pane.append(slider('Curve', { min: -1, max: 1, step: 0.01, value: T.curve || 0, fmt: v => Math.round(v * 100) + '%', id: 'textCurve', onInput: v => editSel(cl => { cl.text.curve = Math.abs(v) < 0.02 ? 0 : v; }) }));
        const row = document.createElement('div'); row.className = 'toggles';
        const tog = (label, key) => { const b = document.createElement('button'); b.className = 'chipbtn' + (T[key] ? ' on' : ''); b.textContent = label; b.onclick = () => { editSel(cl => { cl.text[key] = !cl.text[key]; if (key === 'box' && !cl.text.box) cl.text.bubble = null; }); b.classList.toggle('on', !!clipNow().text[key]); }; return b; };
        row.append(tog('Outline', 'outline'), tog('Background', 'box'));
        for (const a of ['left', 'center', 'right']) { const b = document.createElement('button'); b.className = 'chipbtn al' + (T.align === a ? ' on' : ''); b.textContent = a[0].toUpperCase() + a.slice(1); b.onclick = () => { editSel(cl => { cl.text.align = a; }); row.querySelectorAll('.al').forEach(x => x.classList.toggle('on', x === b)); }; row.append(b); }
        pane.append(row);
        pane.append(slider('Outline width', { min: 0.02, max: 0.4, step: 0.01, value: T.outlineW ?? 0.14, fmt: v => Math.round(v * 100) + '%', id: 'textOutlineW', onInput: v => editSel(cl => { cl.text.outlineW = v; }) }));
        const sub = document.createElement('div'); sub.className = 'sub'; sub.innerHTML = '<span class="cl">Outline / background colour</span>';
        sub.append(swatches(['#000000', '#ffffff', '#ffcc33', '#1b1b2f', '#ff4d4d', '#1fb6ff', '#3ddc84', '#ff5fa2'], T.outlineColor, v => editSel(cl => { cl.text.outlineColor = v; cl.text.boxColor = v; })));
        pane.append(sub);
      } else if (textTab === 'font') {
        let grp = (FONTS[T.font] && FONTS[T.font].group) || (FONTS[T.font] && !FONTS[T.font].bundled ? 'system' : 'kids');
        const list = document.createElement('div');
        const fill = () => { const ids = Object.keys(FONTS).filter(k => (FONTS[k].group || 'system') === grp); ids.forEach(ensureFont);
          list.innerHTML = ''; list.append(chips(ids.map(k => ({ value: k, html: `<span style="font:${FONTS[k].css.replace('SIZE', '17')}">${FONTS[k].name}</span>` })), clipNow().text.font, v => { ensureFont(v); editSel(cl => { cl.text.font = v; }); }, 'fontchips')); };
        pane.append(chips(FONT_GROUPS.map(([value, label]) => ({ value, label })), grp, v => { grp = v; fill(); }, 'tabs fontgroups'), list); fill();
      } else if (textTab === 'style') {
        ensureFont(T.font);
        pane.append(tileGrid(TEXT_STYLES, T.styleId, st => { const c = { ...clipNow(), anim: null, text: applyStyle({ ...clipNow().text, content: 'Abc', curve: 0, size: 160 }, st.id) }; return c; },
          st => editSel(cl => { const keep = { box: cl.text.box && !st.s.bubble }; applyStyle(cl.text, st.id); if (keep.box && !cl.text.bubble) cl.text.box = false; }), 'stylegrid'));
      } else if (textTab === 'bubble') {
        pane.append(chips(BUBBLES.map(b => ({ value: b.id, label: b.name })), T.bubble || (T.box ? 'box' : null), v => editSel(cl => { cl.text.bubble = v; cl.text.box = !!v; }), 'bubblechips'));
        const sub = document.createElement('div'); sub.className = 'sub'; sub.innerHTML = '<span class="cl">Bubble colour</span>';
        sub.append(swatches(['#ffffff', '#000000', '#ffcc33', '#ffe600', '#ff4d4d', '#1fb6ff', '#3ddc84', '#ff5fa2', '#a259ff', '#1b1b2f'], T.boxColor, v => editSel(cl => { cl.text.boxColor = v; if (!cl.text.bubble && !cl.text.box) { cl.text.box = true; cl.text.bubble = 'box'; } })));
        const sub2 = document.createElement('div'); sub2.className = 'sub'; sub2.innerHTML = '<span class="cl">Border</span>';
        sub2.append(swatches(['none', '#000000', '#ffffff', '#1b1b2f', '#e01e37', '#1f7bff'], T.bubbleBorder ? T.bubbleBorder.color : 'none', v => editSel(cl => { cl.text.bubbleBorder = v === 'none' ? null : { color: v, w: 0.07 }; })));
        pane.append(sub, sub2);
      } else if (textTab === 'title') {
        pane.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'A title sets the font, the look and the animation in one tap.' }));
        TITLES.forEach(t => ensureFont(t.font));
        pane.append(tileGrid(TITLES, clipNow().titleId, t => applyTitle({ id: 'tile', type: 'text', start: 0, dur: 3, transform: { ...DEFAULT_TRANSFORM }, keyframes: {}, text: { ...clipNow().text } }, t.id),
          t => { ensureFont(t.font); const typed = ta.value.trim() && !TITLES.some(x => x.content === ta.value); editSel(cl => { applyTitle(cl, t.id, typed); }); if (!typed) ta.value = clipNow().text.content; timeline.render(); }, 'titlegrid'));
      }
    };
    show();
    if (textTab === 'edit') setTimeout(() => ta.focus(), 50);
  }, { className: 'tall' });
}
function addTitle() { addText(true); textSheet('title'); }
/* ---------------- effects + filters (WebGL, shared by preview and export) ---------------- */
function fxThumbBase(TW, TH, clip) {
  const c = Object.assign(document.createElement('canvas'), { width: TW, height: TH }), x = c.getContext('2d');
  const s = clip && clip.type !== 'text' && clip.type !== 'effect' ? player.source(clip) : null, pv = $('#preview');
  const img = s ? s.img : (S.project.tracks.some(t => t.clips.length) ? pv : sampleArt(TW, TH)[0]), iw = s ? s.w : img.width, ih = s ? s.h : img.height;
  const k = Math.max(TW / iw, TH / ih); x.fillStyle = '#1b1b24'; x.fillRect(0, 0, TW, TH); try { x.drawImage(img, (TW - iw * k) / 2, (TH - ih * k) / 2, iw * k, ih * k); } catch (e) {}
  return c;
}
function fxTiles(grid, list, base, kind, TW, TH, t = 0.8) {
  const todo = [...grid.querySelectorAll('.trtile')].filter(b => b.dataset.v !== 'none');
  const step = () => { const b = todo.shift(); if (!b) return; const x = b.querySelector('canvas').getContext('2d');
    const r = fx.applyChain(base, TW, TH, [{ kind, id: b.dataset.v, amount: kind === 'filter' ? 1 : .9, t, dur: 3, seed: 'tile' }]); x.drawImage(r || base, 0, 0, TW, TH);
    if (todo.length) (todo.length % 8 ? step() : requestAnimationFrame(step)); };
  const nb = grid.querySelector('.trtile[data-v="none"] canvas'); if (nb) nb.getContext('2d').drawImage(base, 0, 0, TW, TH);
  requestAnimationFrame(step);
}
function tileGridOf(items, cur, onPick, cls) {
  const dpr = Math.min(2, devicePixelRatio || 1), TW = Math.round(68 * dpr), TH = Math.round(68 * dpr);
  const g = document.createElement('div'); g.className = 'trgrid fxgrid ' + cls;
  for (const it of items) { const b = document.createElement('button'); b.className = 'trtile' + ((it.id || null) === (cur || null) ? ' on' : ''); b.dataset.v = it.id || 'none'; b.dataset.cat = it.cat || '';
    b.innerHTML = `<canvas width="${TW}" height="${TH}"></canvas><span>${it.name}</span>`; b.onclick = () => { g.querySelectorAll('.trtile').forEach(x => x.classList.toggle('on', x === b)); onPick(it.id || null); }; g.append(b); }
  return { g, TW, TH };
}
function catFilter(g, cat) { g.querySelectorAll('.trtile').forEach(b => { b.hidden = !!cat && b.dataset.v !== 'none' && b.dataset.cat !== cat; }); }
/** Effects. mode 'track': add / change an effect clip on the Effects track (applies to everything under it). mode 'clip': effect on the selected photo / video only. */
function effectsSheet(mode) {
  const f0 = selected(); const onEffectClip = f0 && f0.clip.type === 'effect';
  mode = mode || (onEffectClip ? 'track' : 'track'); const editId = onEffectClip ? f0.clip.id : null, clipId = mode === 'clip' && f0 ? f0.clip.id : null;
  if (!fx.fxAvailable()) { toast('Effects need WebGL2 (please use Chrome)'); return; }
  let target = editId;   // the effect clip being edited (track mode)
  const cur = () => clipId ? (find(S.project, clipId)?.clip.effects || [])[0] || null : target ? find(S.project, target)?.clip.effect || null : null;
  openSheet(clipId ? 'Clip effect' : 'Effects', body => {
    let cat = '';
    body.append(Object.assign(document.createElement('p'), { className: 'hint', id: 'fxHint', textContent: clipId ? 'The effect is only on this clip.' : 'Effects sit on the purple Effects track and change everything under them. Drag the ends to set how long.' }));
    const cats = chips([{ value: '', label: 'All' }, ...fx.EFFECT_CATS.map(([value, label]) => ({ value, label }))], '', v => { cat = v; catFilter(T.g, cat); }, 'tabs fxcats');
    const T = tileGridOf([{ id: null, name: 'None', cat: '' }, ...fx.EFFECTS], cur()?.id, id => {
      if (clipId) { editSel(cl => { cl.effects = id ? [{ id, amount: cl.effects?.[0]?.amount ?? fx.DEFAULT_EFFECT_AMOUNT }] : []; if (!cl.effects.length) delete cl.effects; }); }
      else if (!id) { if (target) { const k = target; live(p => remove(p, k)); target = null; } }
      else if (target && find(S.project, target)) live(p => { const c = find(p, target).clip; c.effect = { ...c.effect, kind: 'effect', id }; });
      else { const c = newClip('effect', { dur: 3, effect: { kind: 'effect', id, amount: fx.DEFAULT_EFFECT_AMOUNT } }); live(p => addToKind(p, 'effect', c, Math.min(player.t, Math.max(0, projectDuration(p) - 0.1)))); target = c.id; }
      amt.hidden = !id; timeline.render(); updateEmpty();
      const c = clipId ? find(S.project, clipId)?.clip : target ? find(S.project, target)?.clip : null;
      if (id && c) { const back = player.t; player.playRange(Math.max(c.start, Math.min(player.t, clipEnd(c) - 0.5)), Math.min(clipEnd(c), Math.max(player.t, c.start) + 2), back); }
    }, 'fxtiles');
    T.g.id = 'fxGrid';
    const amt = slider('Intensity', { min: 0, max: 1, step: 0.01, value: cur()?.amount ?? fx.DEFAULT_EFFECT_AMOUNT, fmt: v => Math.round(v * 100) + '%', id: 'fxAmount',
      onInput: v => { if (clipId) editSel(cl => { if (cl.effects?.[0]) cl.effects[0].amount = v; }); else if (target) live(p => { const c = find(p, target)?.clip; if (c) c.effect.amount = v; }); } });
    amt.hidden = !cur(); body.append(cats, T.g, amt);
    fxTiles(T.g, fx.EFFECTS, fxThumbBase(T.TW, T.TH, clipId ? f0.clip : null), 'effect', T.TW, T.TH);
  }, { className: 'tall' });
}
function filterSheet() {
  const c = selected().clip;
  openSheet('Filters', body => {
    const amt = slider('Strength', { min: 0, max: 1, step: 0.01, value: c.filter?.amount ?? 1, fmt: v => Math.round(v * 100) + '%', id: 'filterAmount', onInput: v => editSel(cl => { if (cl.filter) cl.filter.amount = v; }) });
    let cat = '';
    const cats = chips([{ value: '', label: 'All' }, ...FILTER_CATS.map(([value, label]) => ({ value, label }))], '', v => { cat = v; catFilter(T.g, cat); }, 'tabs filtercats');
    const T = tileGridOf(FILTERS.map(f => ({ id: f.id, name: f.name, cat: f.cat })), c.filter?.id ?? null, id => { editSel(cl => { cl.filter = id ? { id, amount: cl.filter?.amount ?? 1 } : null; }); amt.hidden = !id; timeline.render(); }, 'filtertiles');
    T.g.id = 'filterGrid'; amt.hidden = !c.filter?.id;
    body.append(cats, T.g, amt);
    if (fx.fxAvailable()) fxTiles(T.g, FILTERS, fxThumbBase(T.TW, T.TH, c), 'filter', T.TW, T.TH);
  }, { className: 'tall' });
}
/* ---------------- captions (manual: type, paste or import SRT) ---------------- */
function captionsSheet() {
  const f = selected(), sel = f && !f.clip.caption ? f.clip : null, D = projectDuration(S.project);
  const r0 = sel ? sel.start : 0, r1 = sel ? clipEnd(sel) : (D || 10);
  openSheet('Captions', body => {
    const n = () => caps.captions(S.project).length;
    const info = Object.assign(document.createElement('p'), { className: 'hint', id: 'capInfo' });
    const upd = () => { info.textContent = n() ? `${n()} caption line${n() === 1 ? '' : 's'}. Drag a line on the blue Captions track to move it, drag its ends to change the timing.` : 'No captions yet. Add a line at the white playhead, or paste your words below.'; };
    const btns = document.createElement('div'); btns.className = 'capbtns';
    const btn = (id, ic, label, fn) => { const b = document.createElement('button'); b.className = 'chipbtn'; b.id = id; b.innerHTML = icon(ic, 18) + label; b.onclick = fn; btns.append(b); return b; };
    btn('capAdd', 'plus', 'Line at playhead', () => { const c = act(p => caps.addCaptionAt(p, player.t)); closeSheet(); select(c.id); textSheet('edit'); });
    const fileIn = Object.assign(document.createElement('input'), { type: 'file', accept: '.srt,.vtt,text/plain,application/x-subrip', id: 'capFile', hidden: true });
    fileIn.onchange = async () => { const fl = fileIn.files[0]; if (!fl) return; const txt = await fl.text(); let k = 0; live(p => { k = caps.importSRT(p, txt); }); toast(k ? `Imported ${k} caption lines` : 'No captions found in that file'); upd(); timeline.render(); };
    btn('capImport', 'import', 'Import SRT', () => { fileIn.value = ''; fileIn.click(); });
    btn('capExport', 'download', 'Export SRT', () => { if (!n()) { toast('No captions to export yet'); return; } downloadBlob(new Blob([caps.projectSRT(S.project)], { type: 'application/x-subrip' }), (S.project.name || 'captions').replace(/[^\w\- ]+/g, '') + '.srt'); });
    body.append(info, btns, fileIn);
    const h = Object.assign(document.createElement('p'), { className: 'hint', textContent: 'Paste your words: every line becomes one caption, spread evenly over the time below.' });
    const ta = document.createElement('textarea'); ta.id = 'capBulk'; ta.placeholder = 'One caption per line';
    const rg = document.createElement('div'); rg.className = 'caprange';
    rg.innerHTML = `From <input id="capFrom" type="number" min="0" step="0.1" value="${r0.toFixed(1)}"> to <input id="capTo" type="number" min="0" step="0.1" value="${r1.toFixed(1)}"> s`;
    const mk = document.createElement('button'); mk.className = 'chipbtn on'; mk.id = 'capMake'; mk.textContent = 'Make captions';
    mk.onclick = () => { const a = +rg.querySelector('#capFrom').value, b = +rg.querySelector('#capTo').value; let made = [];
      if (!caps.splitLines(ta.value).length) { toast('Paste some lines first'); return; } if (!(b > a)) { toast('The end time must be after the start'); return; }
      live(p => { made = caps.bulkCaptions(p, ta.value, a, b, true); }); toast(`Made ${made.length} caption lines`); upd(); timeline.render(); };
    rg.append(mk); body.append(h, ta, rg);
    body.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'Caption style (changes every line)' }));
    const dpr = Math.min(2, devicePixelRatio || 1), TW = Math.round(76 * dpr), TH = Math.round(54 * dpr);
    const g = document.createElement('div'); g.className = 'trgrid txgrid capstyles'; g.id = 'capStyles';
    const draw = () => g.querySelectorAll('.trtile').forEach(b => { const s = b.dataset.v, c = caps.styleCaption({ id: 'tile', type: 'text', start: 0, dur: 3, transform: { ...DEFAULT_TRANSFORM }, keyframes: {}, text: { ...newClip('text').text, content: 'Caption' } }, s); textTile(b.querySelector('canvas').getContext('2d'), TW, TH, c); });
    for (const s of caps.CAPTION_STYLES) { ensureFont(s.font); const b = document.createElement('button'); b.className = 'trtile' + ((S.project.captionStyle || caps.DEFAULT_CAPTION_STYLE) === s.id ? ' on' : ''); b.dataset.v = s.id;
      b.innerHTML = `<canvas width="${TW}" height="${TH}"></canvas><span>${s.name}</span>`; b.onclick = () => { g.querySelectorAll('.trtile').forEach(x => x.classList.toggle('on', x === b)); live(p => caps.setCaptionStyleAll(p, s.id)); }; g.append(b); }
    body.append(g); setTimeout(draw, 0); onFontLoad(() => document.body.contains(g) && draw());
    body.append(slider('Position', { min: 0.05, max: 0.95, step: 0.01, value: S.project.captionY ?? 0.8, fmt: v => Math.round(v * 100) + '%', id: 'capY', onInput: v => live(p => { p.captionY = v; for (const c of caps.captions(p)) c.transform.y = v; }) }));
    upd();
  }, { className: 'tall' });
}
function ratioSheet() {
  openSheet('Video shape', body => {
    body.append(chips([
      { value: '9:16', html: '<b>9:16</b><small>TikTok · Reels · Shorts</small>' },
      { value: '16:9', html: '<b>16:9</b><small>YouTube</small>' },
      { value: '1:1', html: '<b>1:1</b><small>Square post</small>' }], S.project.aspect, v => { live(p => { p.aspect = v; }); layoutPreview(); }, 'big'));
  });
}
function bgSheet() { openSheet('Background', body => body.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'Colour' }), swatches(BG_COLORS, S.project.bg, v => live(p => { p.bg = v; })), pro.bgBlurControls())); }
/* ---------------- Beat Ad Maker ---------------- */
function adCtx() {
  return { media, importFile, mediaFor: templates.mediaFor, toast, busy, S, act,
    openProject: async p => { player.pause(); if (S.project) await leaveProject(); await ensureProjectFonts(p); await projects.addProject(p); hideHome(); afterSwitch(); },
    afterEdit: () => { $('#ratioBtn').textContent = S.project.aspect; layoutPreview(); timeline.render(); afterEdit(); } };
}
/* ---------------- Templates ---------------- */
function templatesSheet() {
  let cat = '';
  openSheet('Templates', body => {
    const tabs = chips([{ value: '', label: 'All' }, ...templates.TEMPLATE_CATS.map(([v, l]) => ({ value: v, label: l }))], '', v => { cat = v; grid.querySelectorAll('.tpl').forEach(b => { b.hidden = !!cat && b.dataset.cat !== cat; }); }, 'tabs tplcats');
    const grid = document.createElement('div'); grid.className = 'tplgrid'; grid.id = 'tplGrid';
    for (const T of templates.TEMPLATES) {
      const b = document.createElement('button'); b.className = 'tpl'; b.dataset.id = T.id; b.dataset.cat = T.cat;
      const st = T.layers.find(l => l.k === 'sticker'), ti = T.layers.find(l => l.k === 'text');
      b.innerHTML = `<span class="tplpic" style="background-image:url(lib/templates/${T.scenes[0].bg}.webp)">${st ? `<img loading="lazy" alt="" src="lib/stickers/${st.id}.webp">` : ''}${ti ? `<b>${esc(ti.content.split('\n')[0])}</b>` : ''}<i>${Math.round(templates.templateDur(T))}s</i></span><span class="tplname">${esc(T.name)}</span><span class="tpldesc">${esc(T.desc)}</span>`;
      b.onclick = () => useTemplate(T); grid.append(b);
    }
    body.append(tabs, grid, Object.assign(document.createElement('p'), { className: 'hint', textContent: 'A template makes a ready project. Then tap a picture marked “Replace”, and tap Replace me to use your own photo or video. Tap any words to change them.' }));
  }, { className: 'tall', gesture: false });
}
const busy = (on, txt) => { $('#busy').hidden = !on; if (txt) $('#busyText').textContent = txt; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
async function useTemplate(T) {
  closeSheet(); player.pause(); busy(true, 'Making your project…');
  try {
    if (S.project) await leaveProject();
    const p = await templates.buildTemplate({ media, importFile }, T, u => { $('#busyText').textContent = `Making your project… ${Math.round(u * 100)}%`; });
    await ensureProjectFonts(p); await projects.addProject(p); hideHome(); afterSwitch();
    const n = templates.placeholders(S.project).length;
    toast(n ? `New project “${S.project.name}”: replace the ${n} marked pictures with your own` : `New project “${S.project.name}”: tap the words to change them`);
  } catch (e) { console.warn(e); toast('Could not make the template (connect to the internet once)'); }
  finally { busy(false); }
}
function menuSheet() {
  openSheet('Emmavengers Studio', async body => {
    body.innerHTML = `<div class="menu">
      <button class="btn" id="newProj">${icon('home', 18)} My projects</button>
      <button class="btn ghost" id="checkUpd">Check for update</button>
      <p class="hint">Your projects save automatically on this phone, even offline. <span id="storeInfo"></span></p>
      <p class="hint">Tips: tap a clip to edit it · drag its white edges to trim · press and hold a clip, then drag, to move it · pinch the timeline to zoom.</p>
      <p class="hint ver">Version <span id="buildId">…</span></p></div>`;
    $('#newProj').onclick = () => { closeSheet(); showHome(); };
    $('#checkUpd').onclick = async () => { const r = await navigator.serviceWorker?.getRegistration(); if (r) { await r.update().catch(() => {}); toast(r.installing || r.waiting ? 'Downloading the new version…' : 'You have the latest version'); } };
    try { const e = await navigator.storage.estimate(); $('#storeInfo').textContent = `Using ${(e.usage / 1e6).toFixed(0)} MB of storage.`; } catch (e) {}
    $('#buildId').textContent = window.STUDIO_BUILD || 'dev';
  }, { gesture: false });
}

/* ---------------- export ---------------- */
/* Getting the video onto the phone (Android Chrome):
   - "Save to Gallery" downloads <name>.mp4 as video/mp4. Chrome stores it in the phone's Download folder through
     Android's media store, so it shows up in Gallery / Google Photos (Download album) — no file manager needed.
   - "Post to…" opens the Android share sheet with the video (TikTok, YouTube, Instagram, WhatsApp, Photos, Drive…).
     Chrome only shares files up to 50 MiB, so exports are sized to fit when that keeps good quality, and a
     "smaller copy for posting" can be made when a long video is too big.
   - "Download file" (small link): Save-As dialog where the browser has one (desktop), else a normal download. */
const SHARE_LIMIT = () => window.__studioShareLimit || 50 * 1024 * 1024 - 512 * 1024;   // Chrome: 50 MiB per share
const fileFor = r => new File([r.blob], r.name, { type: r.mime, lastModified: Date.now() });
export function canShareVideo(file) {
  try { const f = file || new File([new Uint8Array(16)], 'test.mp4', { type: 'video/mp4' }); return !!(navigator.share && navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) { return false; }
}
function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
const isAndroid = () => /Android/i.test(navigator.userAgent);
function exportView() {
  if (player.playing) player.pause(); closeSheet();
  const v = $('#exportView'); v.hidden = false; document.body.classList.add('exporting'); $('#toast').classList.remove('show');
  let short = +(localStorage.getItem('studio.res') || 1080), fps = +(localStorage.getItem('studio.fps') || 30), quality = QUALITY[localStorage.getItem('studio.q')] ? localStorage.getItem('studio.q') : 'high', ctrl = null, result = null, small = null, can = { 720: true, 1080: true };
  const D = projectDuration(S.project), shareOK = canShareVideo();
  // The saved video is always full quality (sharpness first). Only a "copy for posting" is ever made smaller.
  const plan = () => { const { W, H } = outputSize(S.project.aspect, short); return { W, H, maxBytes: null }; };
  v.innerHTML = `<div class="ex">
    <div class="ex-head"><button class="ib" id="exClose" aria-label="Close">${icon('x')}</button><b id="exTitle">Export video</b><span></span></div>
    <div class="ex-body">
      <div class="ex-set" id="exSet">
        <div class="ex-row"><span class="cl">Make</span><div id="exType"></div></div>
        <div class="ex-row" data-for="video audio gif"><span class="cl">Part</span><div id="exRange"></div></div>
        <div id="exRangeCtl" class="ex-range" hidden></div>
        <div class="ex-row" data-for="video still"><span class="cl">Resolution</span><div id="exRes"></div></div>
        <div class="ex-row" data-for="video"><span class="cl">Frame rate</span><div id="exFps"></div></div>
        <div class="ex-row" data-for="video"><span class="cl">Quality</span><div id="exQ"></div></div>
        <div class="ex-row" data-for="video"><span class="cl">Size</span><div id="exSizeMode"></div></div>
        <div id="exSizeCtl" class="ex-range" data-for="video" hidden></div>
        <div class="ex-row" data-for="audio"><span class="cl">Format</span><div id="exAFmt"></div></div>
        <div class="ex-row" data-for="still"><span class="cl">Format</span><div id="exPFmt"></div></div>
        <div class="ex-row" data-for="gif"><span class="cl">Width</span><div id="exGW"></div></div>
        <div class="ex-row" data-for="gif"><span class="cl">Frame rate</span><div id="exGF"></div></div>
        <p class="ex-size" id="exSize"></p>
        <div class="ex-hd" id="exHd" data-for="video" hidden></div>
        <p class="ex-info" id="exInfo"></p>
        <button class="btn primary big" id="exGo">${icon('export', 20)} Export</button>
        <p class="hint">Keep this screen open while it exports.</p>
      </div>
      <div class="ex-prog" id="exProg" hidden><div class="ring"><b id="exPct">0%</b></div><div class="bar"><i id="exBar"></i></div><p id="exStatus">Preparing…</p><button class="btn ghost" id="exCancel">Cancel</button></div>
      <div class="ex-done" id="exOut" hidden><div id="exOutPrev" class="ex-outprev"></div><p class="ex-ready">${icon('check', 18)} <span id="exOutReady">Ready!</span></p>
        <button class="btn primary huge" id="exOutSave">${icon('save', 24)}<span>Save to phone</span></button>
        <button class="btn huge post" id="exOutShare">${icon('share', 22)}<span>Share…</span><small>WhatsApp · Drive · Files · YouTube</small></button>
        <div class="ex-msg" id="exOutMsg" hidden></div><p class="ex-info small" id="exOutInfo"></p>
        <div class="ex-links"><button class="link" id="exOutAgain">Export something else</button><button class="link" id="exOutBack">Back to editing</button></div></div>
      <div class="ex-done" id="exDone" hidden>
        <video id="exVideo" controls playsinline></video>
        <p class="ex-ready" id="exReady">${icon('check', 18)} Your video is ready!</p>
        <button class="btn primary huge" id="exSave">${icon('save', 24)}<span>Save to Gallery</span></button>
        <button class="btn huge post" id="exShare">${icon('share', 22)}<span>Post to…</span><small>TikTok · YouTube · Instagram · WhatsApp</small></button>
        <div class="ex-msg" id="exMsg" hidden></div>
        <p class="ex-info small" id="exDoneInfo"></p>
        <div class="ex-links"><button class="link" id="exFile">Download file</button><button class="link" id="exBack">Back to editing</button></div>
      </div>
    </div></div>`;
  // what to make + which part (whole video / the selected clip / a custom range)
  let type = localStorage.getItem('studio.exType') || 'video'; if (!['video', 'audio', 'still', 'gif'].includes(type)) type = 'video';
  const selClip = S.sel && find(S.project, S.sel)?.clip, playT = player.t;
  let part = 'all', r0 = 0, r1 = D, sizeMode = 'auto', mbps = 8, targetMB = 20, afmt = localStorage.getItem('studio.afmt') || 'm4a', pfmt = 'png', gw = 360, gf = 12;
  const range = () => part === 'clip' && selClip ? [selClip.start, Math.min(D, clipEnd(selClip))] : part === 'custom' ? [Math.min(r0, r1), Math.max(r0, r1)] : [0, D];
  const span = () => { const [a, b] = range(); return Math.max(0, b - a); };
  const sizeBr = (W, H) => sizeMode === 'bitrate' ? mbps * 1e6 : sizeMode === 'size' ? Math.max(3e5, targetMB * 1e6 * 8 * 0.93 / Math.max(0.1, span()) - AUDIO_BR - 30000) : null;
  const info = async () => {
    $('#exTitle').textContent = { video: 'Export video', audio: 'Export sound', still: 'Export picture', gif: 'Export GIF' }[type];
    v.querySelectorAll('[data-for]').forEach(el => { el.hidden = !el.dataset.for.split(' ').includes(type) || (el.id === 'exSizeCtl' && sizeMode === 'auto') || (el.id === 'exHd' && el.dataset.empty === '1'); });
    $('#exRangeCtl').hidden = part !== 'custom' || type === 'still';
    const [a, b] = range(), DD = b - a;
    if (type !== 'video') {
      $('#exInfo').dataset.vbr = ''; const { W, H } = outputSize(S.project.aspect, short);
      if (type === 'audio') { $('#exSize').innerHTML = `Estimated size: <b>about ${(afmt === 'wav' ? DD * 48000 * 4 / 1e6 : DD * 200000 / 8e6).toFixed(1)} MB</b>`; $('#exInfo').textContent = `${afmt === 'wav' ? 'WAV (16-bit, 48 kHz, stereo)' : 'M4A (AAC) · plays everywhere'} · ${fmt(a)} – ${fmt(b)}`; }
      if (type === 'still') { $('#exSize').innerHTML = `Frame at <b>${fmt(playT)}</b> (where the white line is)`; $('#exInfo').textContent = `${W} × ${H} · ${pfmt.toUpperCase()}`; }
      if (type === 'gif') { const gl = Math.min(DD, GIF_MAX), H2 = Math.round(gw * H / W / 2) * 2; $('#exSize').innerHTML = DD > GIF_MAX + 0.05 ? `GIFs are for short clips: the first <b>${GIF_MAX} s</b> of this part will be used.` : `About <b>${Math.max(0.1, gl * gf * gw * H2 * 0.12 / 1e6).toFixed(1)} MB</b> (GIF files are big)`;
        $('#exInfo').textContent = `${gw} × ${H2} · ${gf} fps · ${fmt(gl)} · loops`; }
      return;
    }
    const { W, H, maxBytes } = plan(); const vbr = sizeBr(W, H) || planBitrate(W, H, fps, DD, maxBytes, quality); const c = await pickCodecs(W, H, fps, vbr, sizeMode !== 'auto');
    const mb = estimateBytes(vbr, DD) / 1e6; { const D = DD;   // the chosen part, not the whole video
    $('#exSize').innerHTML = `Estimated size: <b>about ${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB</b>`; $('#exSize').dataset.bytes = estimateBytes(vbr, D);
    $('#exInfo').textContent = `${W} × ${H} · ${fps} fps · ${fmt(D)} · ${c ? 'MP4 (' + (c.video.mux === 'avc' ? 'H.264' : c.video.mux.toUpperCase()) + ')' : (recorderMime() || 'not supported').split(';')[0].replace('video/', '').toUpperCase() + ' (real-time)'} · ${(vbr / 1e6).toFixed(1)} Mbps`;
    $('#exInfo').dataset.vbr = vbr; }
    // low-res sources: they are upscaled by the HD upscaler; offer HD Enhance for extra sharpness
    const low = []; for (const t of S.project.tracks) for (const cl of t.clips) if (isPic(cl)) { const z = srcSize(cl); if (z && Math.min(z.w, z.h) < Math.min(W, H) * 0.95) low.push(cl); }
    const off = low.filter(cl => !enhanceOn(cl)), hd = $('#exHd'); hd.hidden = !low.length; hd.dataset.empty = low.length ? '0' : '1';
    hd.innerHTML = !low.length ? '' : off.length ? `${icon('hd', 18)}<span>${off.length} clip${off.length > 1 ? 's are' : ' is'} below ${Math.min(W, H)}p. They are upscaled with the HD upscaler — turn on <b>HD Enhance</b> for extra sharpness.</span><button class="chipbtn" id="exHdOn">Turn on</button>` : `${icon('hd', 18)}<span>HD Enhance is on for your low-resolution clips.</span>`;
    const bt = $('#exHdOn'); if (bt) bt.onclick = () => { act(p => { for (const t of p.tracks) for (const cl of t.clips) if (isPic(cl) && low.some(x => x.id === cl.id)) cl.enhance = { on: true, strength: cl.enhance?.strength || DEFAULT_STRENGTH }; }); info(); };
  };
  const resChips = chips(RESOLUTIONS.map(r => ({ value: r.short, label: r.label })), short, x => { if (!can[x]) { toast(x === 2160 ? 'This phone can’t make 4K video' : 'This phone can’t make 2K video'); resChips.setActive(short); return; } short = x; localStorage.setItem('studio.res', x); info(); });
  $('#exRes').append(resChips);
  const checkRes = async () => { can = await supportedResolutions(S.project.aspect, fps, quality);
    resChips.querySelectorAll('.chipbtn').forEach(b => { const ok = can[+b.dataset.v]; b.classList.toggle('off', !ok); b.setAttribute('aria-disabled', !ok); b.title = ok ? '' : 'Not supported on this device'; });
    if (!can[short]) { short = 1080; resChips.setActive(short); } $('#exRes').dataset.checked = '1'; info(); };
  $('#exFps').append(chips([{ value: 24, label: '24' }, { value: 25, label: '25' }, { value: 30, label: '30' }, { value: 60, label: '60' }], fps, x => { fps = x; localStorage.setItem('studio.fps', x); checkRes(); }));
  $('#exQ').append(chips(Object.entries(QUALITY).map(([k, q]) => ({ value: k, label: q.name })), quality, x => { quality = x; localStorage.setItem('studio.q', x); info(); }));
  const ctlRow = (host, label, id, min, max, step, val, f, on) => { const w = slider(label, { min, max, step, value: val, fmt: f, id, onInput: x => { on(x); info(); } }); host.append(w); return w; };
  $('#exType').append(chips([{ value: 'video', html: icon('media', 16) + ' Video' }, { value: 'audio', html: icon('audio', 16) + ' Sound' }, { value: 'still', html: icon('image', 16) + ' Picture' }, { value: 'gif', html: icon('gif', 16) + ' GIF' }], type, x => { type = x; localStorage.setItem('studio.exType', x); if (x === 'gif' && part === 'all' && D > GIF_MAX) { part = 'custom'; r0 = 0; r1 = GIF_MAX; rangeChips.setActive('custom'); fromS.set(r0); toS.set(r1); } info(); }, 'tabs extype'));
  const rangeChips = chips([{ value: 'all', label: 'Whole video' }, ...(selClip ? [{ value: 'clip', label: 'Selected clip' }] : []), { value: 'custom', label: 'Choose part' }], part, x => { part = x; if (x === 'custom' && r1 - r0 < 0.1) { r0 = 0; r1 = D; } info(); }, 'tabs exrange');
  $('#exRange').append(rangeChips);
  const fromS = ctlRow($('#exRangeCtl'), 'From', 'exFrom', 0, D, 0.1, r0, fmt, x => { r0 = x; }), toS = ctlRow($('#exRangeCtl'), 'To', 'exTo', 0, D, 0.1, r1, fmt, x => { r1 = x; });
  $('#exSizeMode').append(chips([{ value: 'auto', label: 'Auto' }, { value: 'bitrate', label: 'Bitrate' }, { value: 'size', label: 'File size' }], 'auto', x => { sizeMode = x; $('#exMbpsW').hidden = x !== 'bitrate'; $('#exMBW').hidden = x !== 'size'; info(); }, 'tabs exsizemode'));
  const mbW = ctlRow($('#exSizeCtl'), 'Bitrate', 'exMbps', 1, 60, 0.5, mbps, x => x.toFixed(1) + ' Mbps', x => { mbps = x; }); mbW.id = 'exMbpsW';
  const szW = ctlRow($('#exSizeCtl'), 'Target file size', 'exMB', 2, 500, 1, targetMB, x => Math.round(x) + ' MB', x => { targetMB = x; }); szW.id = 'exMBW'; szW.hidden = true;
  $('#exAFmt').append(chips([{ value: 'm4a', label: 'M4A (AAC)' }, { value: 'wav', label: 'WAV' }], afmt, x => { afmt = x; localStorage.setItem('studio.afmt', x); info(); }, 'tabs'));
  $('#exPFmt').append(chips([{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }], pfmt, x => { pfmt = x; info(); }, 'tabs'));
  $('#exGW').append(chips([{ value: 240, label: '240' }, { value: 360, label: '360' }, { value: 480, label: '480' }], gw, x => { gw = x; info(); }, 'tabs'));
  $('#exGF').append(chips([{ value: 8, label: '8' }, { value: 12, label: '12' }, { value: 15, label: '15' }], gf, x => { gf = x; info(); }, 'tabs'));
  checkRes();
  info();
  const close = () => { if (ctrl) ctrl.aborted = true; v.hidden = true; v.innerHTML = ''; if (result) URL.revokeObjectURL(result.url); if (small) URL.revokeObjectURL(small.url); document.body.classList.remove('exporting'); layoutPreview(); player.seek(player.t); };
  $('#exClose').onclick = close;
  const msg = (html, kind = 'ok') => { const m = $('#exMsg'); m.className = 'ex-msg ' + kind; m.innerHTML = html; m.hidden = false; };
  const run = async (maxBytes, label) => {
    $('#exSet').hidden = true; $('#exDone').hidden = true; $('#exProg').hidden = false; ctrl = { aborted: false };
    $('#exCancel').textContent = 'Cancel'; $('#exCancel').onclick = () => { ctrl.aborted = true; $('#exStatus').textContent = 'Cancelling…'; };
    let lock = null; try { lock = await navigator.wakeLock?.request('screen'); } catch (e) {}
    try {
      await save();
      const mode = new URLSearchParams(location.search).get('export');
      const { W: VW, H: VH } = outputSize(S.project.aspect, short), forced = maxBytes ? null : sizeBr(VW, VH);
      const r = await exportVideo(S.project, { short, fps, quality, signal: ctrl, mode, maxBytes, range: range(), vbr: forced, targetBytes: !maxBytes && sizeMode === 'size' ? targetMB * 1e6 : null, onProgress: pr => {
        const pct = Math.floor(pr.p * 100); $('#exPct').textContent = pct + '%'; $('#exBar').style.width = pct + '%';
        $('#exStatus').textContent = (label ? label + ' · ' : '') + (pr.phase === 'audio' ? 'Mixing sound…' : pr.phase === 'finishing' ? 'Finishing…' : pr.phase === 'smaller' ? 'Making it smaller…' : pr.eta != null ? `About ${Math.max(1, Math.round(pr.eta))} s left` : 'Exporting…'); } });
      r.name = `Emmavengers-${stamp()}.${r.ext}`; r.url = URL.createObjectURL(r.blob);
      return r;
    } finally { try { lock && lock.release(); } catch (e) {} $('#exProg').hidden = true; }
  };
  const fail = e => { if (e.name === 'AbortError') { close(); return; } console.error(e); $('#exProg').hidden = false; $('#exStatus').textContent = 'Export failed: ' + (e.message || e); $('#exCancel').textContent = 'Close'; $('#exCancel').onclick = close; };
  const showDone = () => {
    const r = result; window.studioLastExport = r;
    $('#exDone').hidden = false; $('#exVideo').src = r.url;
    $('#exDoneInfo').textContent = `${r.W} × ${r.H} · ${fmt(r.duration)} · ${(r.blob.size / 1e6).toFixed(1)} MB · ${r.name}`;
    const post = $('#exShare'), postable = small || (r.blob.size <= SHARE_LIMIT() ? r : null);
    if (!shareOK) post.hidden = true;
    else if (!postable) { post.classList.add('warn'); post.querySelector('span').textContent = 'Make a smaller copy to post'; post.querySelector('small').textContent = `Phones can share up to 50 MB · this one is ${(r.blob.size / 1e6).toFixed(0)} MB`; }
    else { post.classList.remove('warn'); post.querySelector('span').textContent = 'Post to…'; post.querySelector('small').textContent = 'TikTok · YouTube · Instagram · WhatsApp'; }
  };
  const where = () => isAndroid()
    ? `<b>Saved to your phone!</b> Open <b>Gallery</b> → <b>Albums</b> → <b>Download</b> (or <b>Google Photos</b> → <b>Collections</b> → <b>Download</b>). If Chrome asks, tap <b>Download</b>.`
    : `<b>Saved!</b> Look in your <b>Downloads</b> folder.`;
  let out = null;
  const showOut = r => {
    out = r; r.name = `Emmavengers-${stamp()}.${r.ext}`; r.url = URL.createObjectURL(r.blob); window.studioLastExport = r;
    $('#exSet').hidden = true; $('#exProg').hidden = true; $('#exOut').hidden = false; $('#exOutMsg').hidden = true;
    const pv = $('#exOutPrev'); pv.innerHTML = r.mime.startsWith('audio') ? `<audio controls src="${r.url}"></audio>` : `<img alt="" src="${r.url}">`;
    $('#exOutReady').textContent = { audio: 'Your sound is ready!', still: 'Your picture is ready!', gif: 'Your GIF is ready!' }[type] || 'Ready!';
    $('#exOutInfo').textContent = `${r.W ? r.W + ' × ' + r.H + ' · ' : ''}${r.duration ? fmt(r.duration) + ' · ' : ''}${r.codec ? r.codec + ' · ' : ''}${(r.blob.size / 1e6).toFixed(2)} MB · ${r.name}`;
    const f = new File([r.blob], r.name, { type: r.mime }); let ok = false; try { ok = !!(navigator.share && navigator.canShare && navigator.canShare({ files: [f] })); } catch (e) {} $('#exOutShare').hidden = !ok;
  };
  $('#exOutSave').onclick = () => { if (!out) return; downloadBlob(out.blob, out.name); const m = $('#exOutMsg'); m.className = 'ex-msg ok'; m.hidden = false;
    m.innerHTML = isAndroid() ? (type === 'audio' ? '<b>Saved!</b> Find it in the <b>Files</b> app → <b>Downloads</b> (or in your music player).' : '<b>Saved to your phone!</b> Open <b>Gallery</b> → <b>Download</b>.') : '<b>Saved!</b> Look in your <b>Downloads</b> folder.'; };
  $('#exOutShare').onclick = async () => { if (!out) return; try { await navigator.share({ files: [new File([out.blob], out.name, { type: out.mime })], title: 'Emmavengers' }); } catch (e) { if (e.name !== 'AbortError') { downloadBlob(out.blob, out.name); } } };
  const dropOut = () => { $('#exOutPrev').innerHTML = ''; if (out) URL.revokeObjectURL(out.url); out = null; };
  $('#exOutAgain').onclick = () => { dropOut(); $('#exOut').hidden = true; $('#exSet').hidden = false; };
  $('#exOutBack').onclick = () => { dropOut(); close(); };
  const runOther = async () => {
    $('#exSet').hidden = true; $('#exProg').hidden = false; ctrl = { aborted: false }; $('#exPct').textContent = '0%'; $('#exBar').style.width = '0%';
    $('#exCancel').textContent = 'Cancel'; $('#exCancel').onclick = () => { ctrl.aborted = true; $('#exStatus').textContent = 'Cancelling…'; };
    const prog = pr => { const pct = Math.floor(pr.p * 100); $('#exPct').textContent = pct + '%'; $('#exBar').style.width = pct + '%'; $('#exStatus').textContent = pr.phase === 'audio' ? 'Mixing sound…' : pr.phase === 'palette' ? 'Choosing colours…' : 'Making it…'; };
    try { await save();
      if (type === 'audio') return await exportAudio(S.project, { format: afmt, range: range(), onProgress: prog });
      if (type === 'still') return await exportStill(S.project, playT, { short, type: pfmt === 'jpg' ? 'image/jpeg' : 'image/png' });
      return await exportGif(S.project, { range: range(), width: gw, fps: gf, onProgress: prog, signal: ctrl });
    } finally { $('#exProg').hidden = true; }
  };
  $('#exGo').onclick = async () => {
    if (type !== 'video') { try { const r = await runOther(); if (ctrl && ctrl.aborted) { close(); return; } showOut(r); } catch (e) { fail(e); } return; }
    const { maxBytes } = plan();
    try { result = await run(maxBytes); small = null; showDone(); } catch (e) { fail(e); }
  };
  $('#exSave').onclick = () => { if (!result) return; downloadBlob(result.blob, result.name); msg(where()); };
  $('#exFile').onclick = async () => {
    if (!result) return;
    if (window.showSaveFilePicker && !isAndroid()) {
      try { const h = await showSaveFilePicker({ suggestedName: result.name, types: [{ description: 'Video', accept: { [result.mime]: ['.' + result.ext] } }] });
        const w = await h.createWritable(); await w.write(result.blob); await w.close(); msg(`<b>Saved</b> as ${h.name}.`); return; }
      catch (e) { if (e.name === 'AbortError') return; }
    }
    downloadBlob(result.blob, result.name); msg(where());
  };
  $('#exShare').onclick = async () => {
    if (!result) return;
    const target = small || (result.blob.size <= SHARE_LIMIT() ? result : null);
    if (!target) {   // too big for the share sheet: make a smaller copy, then the button posts it
      try { small = await run(SHARE_LIMIT(), 'Making a copy for posting'); $('#exDone').hidden = false; showDone();
        msg(small.blob.size <= SHARE_LIMIT() ? '<b>Ready to post!</b> Tap <b>Post to…</b> again and pick TikTok, YouTube, Instagram or WhatsApp.' : 'This video is too long to post straight from the phone. Tap <b>Save to Gallery</b>, then post it from the TikTok / YouTube app.', small.blob.size <= SHARE_LIMIT() ? 'ok' : 'warn');
        if (small.blob.size > SHARE_LIMIT()) { URL.revokeObjectURL(small.url); small = null; }
      } catch (e) { fail(e); }
      return;
    }
    const file = fileFor(target);
    if (!canShareVideo(file)) { downloadBlob(target.blob, target.name); msg('Sharing isn’t available here, so the video was saved instead. ' + where()); return; }
    try { await navigator.share({ files: [file], title: 'Emmavengers video' }); msg('<b>Sent!</b> Finish posting in the app you picked.'); }
    catch (e) {
      if (e.name === 'AbortError') return;                 // closed the share sheet: nothing to do
      console.warn('share failed', e); downloadBlob(target.blob, target.name);
      msg('Couldn’t open the share menu, so the video was saved to your phone instead. ' + where(), 'warn');
    }
  };
  $('#exBack').onclick = close;
}
const stamp = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}${z(d.getSeconds())}`; };

/* ---------------- wiring ---------------- */
function wireUI() {
  $('#playBtn').onclick = () => player.toggle();
  $('#undoBtn').onclick = () => { player.pause(); undo(); };
  $('#redoBtn').onclick = () => { player.pause(); redo(); };
  $('#kfBtn').onclick = () => { player.pause(); toggleKf(); }; $('#kfPrev').onclick = () => jumpKf(-1); $('#kfNext').onclick = () => jumpKf(1);
  $('#zoomIn').onclick = () => timeline.zoomBy(1.6); $('#zoomOut').onclick = () => timeline.zoomBy(1 / 1.6);
  $('#addMainBtn').onclick = () => pick('main');
  $('#emptyAdd').onclick = () => pick('main');
  $('#menuBtn').onclick = () => showHome();
  $('#ratioBtn').onclick = ratioSheet;
  $('#exportBtn').onclick = exportView;
  $('#fileMedia').onchange = e => onFiles(e.target.files, pickTarget);
  $('#fileAudio').onchange = e => onFiles(e.target.files, 'audio');
  on('change', () => { $('#ratioBtn').textContent = S.project.aspect; layoutPreview(); });
  $('#ratioBtn').textContent = S.project.aspect;
  new ResizeObserver(layoutPreview).observe($('#stage'));
  previewGestures(); compareUI();
  addEventListener('keydown', e => {
    if (e.target.matches('input, textarea')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (e.code === 'Space') { e.preventDefault(); player.toggle(); }
    else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if ((e.key === 'Delete' || e.key === 'Backspace') && S.sel) { const id = S.sel; select(null); act(p => remove(p, id)); }
    else if (e.key.toLowerCase() === 's' && !mod) doSplit();
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { player.pause(); player.seek(player.t + (e.key === 'ArrowLeft' ? -1 : 1) / S.project.fps); timeline.setTime(player.t); showTime(); }
  });
  // drop files on desktop
  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files, 'main'); });
}
boot().catch(e => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<div class="fatal">Sorry, the editor could not start: ${e.message}</div>`); });

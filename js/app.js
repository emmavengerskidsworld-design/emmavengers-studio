/* Emmavengers Studio — app shell: wires the store, preview player, timeline, toolbars, panels and export. */
import { S, act, live, load, save, on, undo, redo, canUndo, canRedo, select, selected, reset, begin, end, useProject } from './store.js';
import { activeVisual } from './compound.js';
import { newClip, addToMain, addToKind, split, remove, duplicate, setSpeed, projectDuration, clipDur, clipEnd, hasSource, find, ASPECTS, mediaIds, kfTimes, kfAt, hasKeyframes, addKeyframe, removeKeyframe, setEase, setProp, kenBurns, KEN_BURNS, transEff, KF_EPS } from './project.js';
import { TRANSITIONS, TRANSITION_CATS, transitionById, helpers as trHelpers, DEFAULT_TRANSITION_DUR, MIN_TRANSITION, MAX_TRANSITION } from './transitions.js';
import { media, importFile, loadAll, useMedia, onMediaUpdate, kindOf, bitmapOf } from './media.js';
import { Player } from './player.js';
import { Timeline, fmtS } from './timeline.js';
import { openSheet, closeSheet, sheetOpen, slider, chips, swatches } from './panels.js';
import { FONT_GROUPS } from './registry.js';
import * as caps from './captions.js';
import * as stickers from './stickers.js';
import * as elempanel from './elempanel.js';
import * as photomode from './photomode.js';
import * as karaoke from './karaoke.js';
import { karaokeSheet } from './karaokepanel.js';
import { ELEMENTS, ELEMENT_CATS } from './elements.js';
import * as templates from './templates.js';
import * as projects from './projects.js';
import * as backupApi from './backup.js';
import { initHome, showHome, hideHome, homeOpen, render as renderHome, themeSheet } from './home.js';
import * as fx from './effects.js';
import { FILTER_CATS } from './registry.js';
import { ensureFont, ensureProjectFonts, onFontLoad } from './fonts.js';
import { onLut } from './colorpro.js';
import { canvasClip } from './canvasbg.js';
import * as work from './workpanel.js';
import * as perfMod from './perf.js';
import { initPerf, perfSheet, bench as perfBench } from './perfpanel.js';
import * as workflow from './workflow.js';
import * as storeApi from './store.js';
import { decodeAudio } from './media.js';
import { initMixPanel, mixSheet, projectMixSheet, addMark, fillMarks } from './mixpanel.js';
import { setDecoder, setMediaGetter, onEnvelope, loudOn } from './audiomix.js';
import { initMotionPanel, stabSheet, trackSheet, graphSheet, slowmoSheet, stabilizeClip, trackClip, pasteKeyframes, copyKeyframes, slowmoClip } from './motionpanel.js';
import { initLayoutPanel, canvasSheet, layoutSheet, mirrorSheet, applyLayout, fillCells, clearLayout } from './layoutpanel.js';
import { initColorPanel, colorSheet as colorProSheet, addAdjustmentLayer, isAdjLayer, pickWhite } from './colorpanel.js';
import { TEXT_STYLES, BUBBLES, TITLES, applyStyle, applyTitle } from './textstyles.js';
import { EFFECTS, EFFECT_CATS, effectById } from './texteffects.js';
import { TEMPLATES, TEMPLATE_CATS, TRENDING_T } from './texttemplates.js';
import { FILTERS, FONTS, COLORS, BG_COLORS, SPEED_PRESETS, KEYFRAME_PROPS, DEFAULT_TRANSFORM, TRACK_KINDS, propAt, kfPropsFor, EASING_LIST, TRANSFORM_PROPS } from './registry.js';
import { exportVideo, exportAudio, exportStill, exportGif, GIF_MAX, AUDIO_BR, outputSize, pickCodecs, recorderMime, planBitrate, qualityFloor, QUALITY, RESOLUTIONS, supportedResolutions, estimateBytes, bitrateFor } from './export.js';
import { ADJUST, DEFAULT_STRENGTH, enhanceOn, glAvailable } from './enhance.js';
import { renderFrame, drawVisual, drawText } from './render.js';
import { CLIP_ANIMS, TEXT_ANIMS, animSetFor, animById, animSpans, DEFAULT_ANIM_DUR, DEFAULT_LOOP_DUR, MIN_ANIM, MAX_ANIM, MIN_LOOP, MAX_LOOP, loopKind, PRO_TEXT_ANIMS } from './animations.js';
import { hitTest, handleAt } from './render.js';
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
import * as wm from './watermark.js';

const $ = s => document.querySelector(s);
const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return String(m).padStart(2, '0') + ':' + s.toFixed(1).padStart(4, '0'); };
let player, timeline, seekQ = false;

/* ---------------- boot ---------------- */
async function boot() {
  for (const [id, n] of [['menuBtn', 'back'], ['undoBtn', 'undo'], ['redoBtn', 'redo'], ['zoomIn', 'zoomin'], ['zoomOut', 'zoomout'], ['kfPrev', 'kfprev'], ['kfNext', 'kfnext'], ['kfBtn', 'kf']]) $('#' + id).innerHTML = icon(n);
  $('#addMainBtn').innerHTML = icon('plus', 26);
  $('#exportBtn').innerHTML = '<span>Export</span>';
  await load(); await projects.migrate();
  await useMedia(mediaIds(S.project));
  player = new Player($('#preview'), { getProject: () => S.project, selected: () => S.sel, onTime: t => { timeline.setTime(t); showTime(); updateKf(); }, onSeek: () => { if (!seekQ) { seekQ = true; requestAnimationFrame(() => { seekQ = false; showTime(); }); } }, onState: setPlayIcon });
  timeline = new Timeline({ getTime: () => player.t, seek: t => { player.seek(t, true); showTime(); updateKf(); }, onJoint: id => transitionSheet(id), isPlaying: () => player.playing, pause: () => player.pause(), scrubbing: on => { player.scrubbing = on; if (!on) player.requestDraw(); }, onAdd: k => pick(k), afterEdit: afterEdit });
  on('change', () => { timeline.render(); player.seek(player.t); showTime(); refreshToolbar(); updateEmpty(); updateKf(); });
  on('select', () => { document.body.classList.toggle('has-sel', !!S.sel); timeline.render(); refreshToolbar(); player.requestDraw(); if (sheetOpen()) closeSheet(); updateKf(); });
  on('history', updateUndo);
  onMediaUpdate(() => { timeline.render(); player.requestDraw(); });
  onFontLoad(() => player.requestDraw()); onLut(() => player.requestDraw()); ensureProjectFonts(S.project);
  initAudioPanels({ player, timeline, toast });
  pro.initProTools({ player, timeline, toast, speedSheet });
  initColorPanel({ player, timeline, toast });
  initMotionPanel({ player, timeline, toast, busy: (on, txt) => { $('#busy').hidden = !on; if (txt) $('#busyText').textContent = txt; } });
  setMediaGetter(id => media.get(id)); setDecoder(rec => decodeAudio(rec, false)); onEnvelope(() => { player.requestDraw(); if (player.playing) player.sync && player.sync(player.t); });
  initMixPanel({ player, timeline, toast, loudness: () => measureLoudness() });
  work.initWork({ player, timeline, toast, refreshToolbar });
  initPerf({ player, timeline, toast });
  { const z = $('#zoom'); const mb = document.createElement('button'); mb.id = 'magBtn'; mb.className = 'ib tlbtn'; mb.innerHTML = icon('magnet', 18); mb.onclick = () => work.toggleMagnetic();
    const sb = document.createElement('button'); sb.id = 'selModeBtn'; sb.className = 'ib tlbtn'; sb.innerHTML = icon('select', 18); sb.title = 'Select several clips'; sb.onclick = () => work.setSelectMode(!timeline.selectMode);
    z.prepend(sb, mb); on('change', work.magBtn); work.magBtn(); }
  initLayoutPanel({ player, timeline, toast, busy: (on, txt) => { $('#busy').hidden = !on; if (txt) $('#busyText').textContent = txt; } });
  onBaked(() => { timeline.render(); if (player.playing) player.sync(player.t); });
  wireUI(); layoutPreview(); timeline.fitZoom(); timeline.render(); refreshToolbar(); updateUndo(); updateEmpty(); showTime(); setPlayIcon(false);
  player.seek(0);
  initHome({ toast, busy, menuSheet, templatesSheet, photoSheet: () => photomode.photoSheet({ ...phCtx(), afterSwitch: (...a) => { hideHome(); afterSwitch(...a); } }), addFiles: f => onFiles(f, 'main'), adSheet: () => adSheet(adCtx()), afterSwitch, leaveProject, deliver });
  on('change', scheduleLoudness);
  on('change', () => { clearTimeout(thumbTimer); thumbTimer = setTimeout(idleThumb, 4000); });
  addEventListener('pagehide', () => makeThumb());
  setTimeout(async () => { try { await projects.askPersist(); await projects.cleanUp(); if (!(await projects.getThumb(S.project.id))) makeThumb(); } catch (e) { console.warn('clean-up', e); } }, 2500);
  const qs = new URLSearchParams(location.search);
  if (qs.has('home') || (matchMedia('(display-mode: standalone)').matches && !qs.has('editor'))) showHome();
  window.studio = { setSubRow, tplSheet: pre => templatesSheet(pre), tplUse: id => useTemplate(templates.templateById(id)), projects, backup: backupApi, home: { show: showHome, hide: hideHome, render: renderHome, open: homeOpen }, makeThumb,  templates, importFile, S, player, timeline, media, act, select, find, projectDuration, exportVideo, pickCodecs, recorderMime, save, propAt, kfTimes, transitions: TRANSITIONS, testTransitions, anims: { clip: CLIP_ANIMS, text: TEXT_ANIMS }, renderStill, audio: { fx: audiofx, VOICE_FX, needsBake, bakedFor, mix: async (o = {}) => (await import('./export.js')).mixAudio(S.project, projectDuration(S.project), null, o) }, supportedResolutions, bitrateFor, estimateBytes, outputSize, glAvailable, setCompare, pro, speedcurve, project: projectApi, admaker: { ...admaker, beats, adSheet: pre => adSheet(adCtx(), pre), shuffle: () => shuffleAd(adCtx()), make: st => makeAd(adCtx(), st) }, caps, stickers, fx, color: { sheet: t => colorProSheet(t), addLayer: () => addAdjustmentLayer(), pickWhite }, layout: { apply: (id, o) => applyLayout(id, o), fill: (f, id, o) => fillCells(f, id, o), clear: () => clearLayout(), sheet: () => layoutSheet(), canvas: t => canvasSheet(t) }, motion: { stab: (id, lv) => stabilizeClip(id, lv), track: (id, x, y, o) => trackClip(id, x, y, o), copy: id => copyKeyframes(find(S.project, id).clip), paste: (id, L) => pasteKeyframes(id, L), slowmo: (id, s, bl) => slowmoClip(id, s, bl) }, mix: { sheet: t => mixSheet(t), project: () => projectMixSheet(), addMark: (id, t) => addMark(id, t), fillMarks: (id, b, f) => fillMarks(id, b, f), loudness: () => measureLoudness() }, work: { ...work, ...workflow, store: storeApi }, perf: { ...perfMod, bench: perfBench, sheet: () => perfSheet() }, photo: { ...photomode, sheet: () => photomode.photoSheet(phCtx()), save: () => photomode.savePhoto(phCtx()), blob: () => photomode.photoBlob(phCtx()) }, karaoke: { ...karaoke, sheet: () => karaokeSheet(kCtx()) }, elements: { list: ELEMENTS, cats: ELEMENT_CATS, sheet: () => elempanel.elementsSheet(elCtx()), add: (id, at) => elempanel.addElement(elCtx(), id, at) }, ready: true };
  document.body.classList.add('ready');
}
/* ---------------- projects ---------------- */
let thumbTimer = 0;
/** Small picture of the project for the home grid: the frame under the playhead (or 1 s in), drawn by the real renderer. */
/** Thumbnail refresh while editing: only when the user is idle (not playing, no touch in the last 1.5 s), never in the middle of a gesture. */
function idleThumb() { if (player.playing || performance.now() - (window.__lastInput || 0) < 1500) { clearTimeout(thumbTimer); thumbTimer = setTimeout(idleThumb, 1500); return; }
  (window.requestIdleCallback || (f => setTimeout(f, 0)))(() => makeThumb(), { timeout: 3000 }); }
async function makeThumb() {
  clearTimeout(thumbTimer); const p = S.project; if (!p) return;
  try {
    const [a, b] = ASPECTS[p.aspect] || [9, 16], W = a > b ? 320 : Math.round(320 * a / b), H = Math.round(W * b / a), D = projectDuration(p);
    const cv = new OffscreenCanvas(W, H), x = cv.getContext('2d', { alpha: false }); if (!D) { await projects.setThumb(p.id, null); return; }
    const t = player.t > 0.05 && player.t < D ? player.t : Math.min(1, D / 3), frames = new Map();
    for (const c of activeVisual(p, t)) if (c.type === 'image') { const r = media.get(c.mediaId), bm = r && bitmapOf(r); if (bm) frames.set(c.id, { img: bm, w: bm.width, h: bm.height }); }
    // cheap path: the preview already shows this frame (no selection box / guides on it) -> just downscale it (no 100+ ms re-render while the user edits)
    const pv = $('#preview');
    if (pv && pv.width && !selected() && !player.compare && !player.guides && Math.abs(player.t - t) < 1e-3 && player.settled()) x.drawImage(pv, 0, 0, W, H);
    else renderFrame(x, W, H, p, t, c => frames.get(c.id) || player.source(c), { fast: true, noWm: true });
    await projects.setThumb(p.id, await cv.convertToBlob({ type: 'image/jpeg', quality: .78 }));
  } catch (e) { console.warn('thumb', e); }
}
/** Before going to the home screen / another project: save and refresh the thumbnail. */
async function leaveProject() { player.pause(); closeSheet(); select(null); await save(); await makeThumb(); }
/** The open project changed (opened, created, deleted): refresh everything on screen. */
function afterSwitch() {
  player.pause(); player.gc(); ensureProjectFonts(S.project); $('#ratioBtn').textContent = S.project.aspect; $('#projName').textContent = S.project.name || 'Untitled';
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
  const W = stage.clientWidth - 32, H = stage.clientHeight - 28; if (W <= 0 || H <= 0) return;
  let w = W, h = W * b / a; if (h > H) { h = H; w = H * a / b; }
  cv.style.width = Math.round(w) + 'px'; cv.style.height = Math.round(h) + 'px';
  const o = $('#cmp'); if (o) { o.style.width = cv.style.width; o.style.height = cv.style.height; }
  const lowEnd = (navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3, dpr = Math.min(lowEnd ? 1.25 : 1.5, devicePixelRatio || 1), k = Math.min(dpr, 1080 / Math.min(w, h));
  const cw = Math.round(w * k), ch = Math.round(h * k);
  // B16: while a panel is open the preview shrinks above it (InShot style); that is a CSS-only rescale, so opening a panel never re-renders the frame
  const cssOnly = document.body.classList.contains('sheet-open') && cv.width && Math.abs(cv.width / cv.height - cw / ch) < 0.01;
  const resized = !cssOnly && (cv.width !== cw || cv.height !== ch);
  if (resized) { cv.width = cw; cv.height = ch; }
  // B16: never render the frame synchronously inside an edit: the next animation frame draws it (taps stay instant)
  if (player) { if (resized) player.draw(); else player.requestDraw(); }
}
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { window.__lastInput = performance.now(); }, { capture: true, passive: true });
function previewGestures() {
  const cv = $('#preview'), pts = new Map(); let g = null, tap = null;
  const toCanvas = e => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * cv.width / r.width, y: (e.clientY - r.top) * cv.height / r.height, r }; };
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (player.playing) player.pause();
    if (pts.size === 1) {
      const pos = toCanvas(e); if (pro.previewTap(pos)) { pts.delete(e.pointerId); return; }
      const R = wm.wmRect; if (!S.sel && R && R.W === cv.width && pos.x >= R.x - 8 && pos.x <= R.x + R.w + 8 && pos.y >= R.y - 8 && pos.y <= R.y + R.h + 8) {
        const L = wm.wmLayout(cv.width, cv.height, wm.wmOf(S.project), player.t); g = { wm: true, x0: e.clientX, y0: e.clientY, p0: pos, cx: L.cx, cy: L.cy, started: false }; tap = null; return; }
      if (pro.cropDragStart(pos)) { g = { crop: true }; tap = null; return; }
      const sb = S.sel && player.boxes.find(b => b.id === S.sel), hd = sb && handleAt(sb, pos.x, pos.y, Math.min(cv.width, cv.height) / 400);
      if (hd === 'del') { pts.delete(e.pointerId); const id = S.sel; select(null); act(p => remove(p, id)); player.gc(); closeSheet(); return; }
      if (hd === 'rot') { const ff = find(S.project, S.sel); g = { id: S.sel, rot: true, cx: sb.cx, cy: sb.cy, d0: Math.hypot(pos.x - sb.cx, pos.y - sb.cy), a0: Math.atan2(pos.y - sb.cy, pos.x - sb.cx), tr: trAt(ff.clip), x0: e.clientX, y0: e.clientY, started: false }; tap = null; return; }
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
    if (g.wm) { if (!g.started && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < 6) return; if (!g.started) { g.started = true; begin(); }
      const pos = toCanvas(e), cx = Math.max(.03, Math.min(.97, (g.cx + pos.x - g.p0.x) / cv.width)), cy = Math.max(.03, Math.min(.97, (g.cy + pos.y - g.p0.y) / cv.height));
      live(p => { p.watermark = { ...wm.wmOf(p), pos: 'custom', cx: Math.round(cx * 1000) / 1000, cy: Math.round(cy * 1000) / 1000 }; }); player.invalidate(); player.requestDraw(); return; }
    if (!g.started && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < 4 && pts.size < 2) return;
    if (!g.started) { g.started = true; begin(); if (S.sel !== g.id) select(g.id); }
    live(p => { const c = find(p, g.id)?.clip; if (!c) return;
      if (g.rot) { const pos = toCanvas(e), d = Math.hypot(pos.x - g.cx, pos.y - g.cy), ang = Math.atan2(pos.y - g.cy, pos.x - g.cx), L = player.t - c.start;
        setProp(c, 'scale', Math.max(0.05, Math.min(8, g.tr.scale * d / Math.max(1, g.d0))), L);
        let rot = g.tr.rotation + (ang - g.a0) * 180 / Math.PI; for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(rot - s) < 3) rot = s; setProp(c, 'rotation', Math.round(rot * 10) / 10, L);
      } else if (pts.size >= 2 && g.pinch) { const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
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
      if (g && g.wm) { if (g.started) { end(); wm.setWmGlobal(wm.wmOf(S.project)); } else wmSheet(); }
      else if (g && g.crop) pro.cropDragEnd();
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
function animSheet(startKind, mount) {
  const f0 = selected(); if (!f0) return; const id = f0.clip.id, isText = f0.clip.type === 'text', { reg, tabs } = animSetFor(f0.clip), lk = loopKind(f0.clip);
  let kind = startKind || 'in';
  const clipNow = () => find(S.project, id)?.clip;
  const cur = k => clipNow()?.anim?.[k] || null;
  // preview plays just the animation, then returns the playhead to where it was (the clip stays on screen)
  const preview = k => { const c = clipNow(); if (!c) return; const e = clipEnd(c), { di, dO } = animSpans(c, clipDur(c)), back = Math.max(c.start, Math.min(e - 1e-3, player.playing ? c.start : player.t));
    if (k === 'in') player.playRange(c.start, Math.min(e, c.start + di + 0.4), back); else if (k === 'out') player.playRange(Math.max(c.start, e - dO - 0.4), e, back);
    else player.playRange(c.start, Math.min(e, c.start + Math.max(2.4, 2 * (c.anim[k]?.dur || DEFAULT_LOOP_DUR))), back); };
  (mount ? (t, b) => b(mount) : openSheet)('Animation', body => {
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
    const pro = !!(mount && isText), AK = 'emma.animFav'; let acat = 'trending', aq = '';
    const abar = document.createElement('div'); abar.className = 'fontbar anbar';
    if (pro) { const sbt = document.createElement('button'); sbt.className = 'iconbtn'; sbt.id = 'anSearchBtn'; sbt.textContent = '🔍';
      const si = document.createElement('input'); si.type = 'search'; si.id = 'anSearch'; si.placeholder = 'Search animations'; si.hidden = true;
      sbt.onclick = () => { si.hidden = !si.hidden; if (!si.hidden) si.focus(); else { aq = ''; si.value = ''; fill(); } }; si.oninput = () => { aq = si.value.trim().toLowerCase(); fill(); };
      abar.append(sbt, chips([['trending', 'Trending'], ['fav', '🔖 Saved'], ['all', 'All']].map(([value, label]) => ({ value, label })), acat, v => { acat = v; fill(); }, 'tabs ancats'), si); }
    const fill = () => {
      grid.innerHTML = ''; let list = reg[kind] || [];
      if (pro) { const favs = new Set(lsGet(AK, [])), P = PRO_TEXT_ANIMS[kind] || [];
        if (aq) list = list.filter(t => t.name.toLowerCase().includes(aq));
        else if (acat === 'trending') list = P.map(i => list.find(t => t.id === i)).filter(Boolean);
        else if (acat === 'fav') list = list.filter(t => favs.has(kind + ':' + t.id));
        else list = [...P.map(i => list.find(t => t.id === i)).filter(Boolean), ...list.filter(t => !P.includes(t.id))];
        if (acat === 'fav' && !aq && !list.length) { grid.innerHTML = '<p class="hint">Press and hold an animation to save it here.</p>'; setSlider(); info(); markTabs(); return; } }
      for (const t of [{ id: null, name: 'None' }, ...list]) {
        const b = document.createElement('button'); b.className = 'trtile' + ((cur(kind)?.id || null) === t.id ? ' on' : ''); b.dataset.an = t.id || 'none';
        b.innerHTML = `<canvas width="${TW}" height="${TH}"></canvas><span>${t.name}</span>`;
        if (!t.id) { const x = b.querySelector('canvas').getContext('2d'); x.fillStyle = '#2a2a33'; x.fillRect(0, 0, TW, TH); x.strokeStyle = '#777'; x.lineWidth = 3 * dpr; x.beginPath(); x.arc(TW / 2, TH / 2, TW * .22, 0, 7); x.moveTo(TW * .34, TH * .66); x.lineTo(TW * .66, TH * .34); x.stroke(); }
        b.onclick = () => { const k = kind; live(p => { const c = find(p, id).clip; c.anim = { ...(c.anim || {}) };
            if (t.id) c.anim[k] = { id: t.id, dur: c.anim[k]?.dur || (k === lk ? DEFAULT_LOOP_DUR : Math.min(DEFAULT_ANIM_DUR, clipDur(c))) }; else delete c.anim[k];
            if (!Object.keys(c.anim).length) delete c.anim; });
          grid.querySelectorAll('.trtile').forEach(x => x.classList.toggle('on', x === b)); setSlider(); info(); markTabs(); timeline.render(); if (t.id) preview(k); };
        if (pro && t.id) { const key = kind + ':' + t.id; if (lsGet(AK, []).includes(key)) b.classList.add('fav'); let ht = 0;
          b.addEventListener('pointerdown', () => { ht = setTimeout(() => { ht = -1; const L = lsGet(AK, []), i = L.indexOf(key); if (i >= 0) L.splice(i, 1); else L.unshift(key); lsSet(AK, L); b.classList.toggle('fav', i < 0); toast(i < 0 ? 'Saved' : 'Removed from Saved'); }, 550); });
          for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) b.addEventListener(ev, () => { if (ht > 0) clearTimeout(ht); });
          b.addEventListener('click', e => { if (ht === -1) { ht = 0; e.stopImmediatePropagation(); } }, true); }
        grid.appendChild(b);
      }
      setSlider(); info(); markTabs();
    };
    if (pro) body.append(tabEl, abar, sl, grid, note); else body.append(tabEl, grid, sl, note); fill();
    // animated tiles: the real renderer draws every tile (same code as preview + export)
    const tc = { id: 'tile', type: isText ? 'text' : 'image', fit: 'contain', transform: { ...DEFAULT_TRANSFORM }, keyframes: {}, start: 0, dur: 1, text: mount ? { ...applyStyle({ ...(f0.clip.text || {}) }, null), font: 'montserrat', color: '#ffffff', content: 'ABC123', size: 190, align: 'center', curve: 0, bold: true, italic: false, under: false, caseMode: null, lineH: 1 } : { ...(f0.clip.text || {}), content: 'Abc', size: 300, align: 'center', box: false, bubble: null, curve: 0 } };
    const src = { img: art, w: art.width, h: art.height };
    cancelAnimationFrame(animLoop); let vis = null, visIO = null;
    const loop = now => { if (!document.body.contains(grid)) return;
      if (!vis) { vis = new Set(); visIO = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? vis.add(e.target) : vis.delete(e.target)), { root: grid }) : null; }
      grid.querySelectorAll('.trtile').forEach(b => { if (visIO && !b._obs) { b._obs = 1; visIO.observe(b); } if (visIO && !vis.has(b)) return; const aid = b.dataset.an; if (aid === 'none') return; const x = b.querySelector('canvas').getContext('2d');
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
const kCtx = () => ({ S, act, player, toast, timeline: { render: () => { timeline.render(); updateEmpty(); } } });
const phCtx = () => ({ S, act, toast, busy, importFile, renderStill, downloadBlob, player, afterSwitch,
  projects: { addProject: async p => { player.pause(); if (S.project) await leaveProject(); await ensureProjectFonts(p); await projects.addProject(p); hideHome(); } } });
const elCtx = () => ({ player, timeline, toast, act, find, newClip, addToKind, DEFAULT_TRANSFORM, select });
const ROOT_TOOLS = [
  work.ROOT_EXTRA.find(t => t.id === 'nestback'),
  { id: 'text', icon: 'text', label: 'Text', run: () => { subRow = 'text'; refreshToolbar(); } },
  { id: 'stickers', icon: 'sticker', label: 'Sticker', run: () => stickers.stickerSheet({ player, toast, media, importFile, act, newClip, addToKind, DEFAULT_TRANSFORM, select }) },
  { id: 'audio', icon: 'music', label: 'Audio', run: () => soundsSheet({ player, timeline, toast, importAudio: () => { closeSheet(); pick('audio'); } }, 'music') },
  { id: 'sounds', icon: 'sounds', label: 'Sounds', run: () => soundsSheet({ player, timeline, toast }) },
  { id: 'effects', icon: 'effects', label: 'Effect', run: () => { select(null); effectsSheet('track'); } },
  { id: 'rootfilter', icon: 'filter', label: 'Filter', run: () => clipAtPlayhead(filterSheet) },
  { id: 'bg', icon: 'bg', label: 'Canvas', run: () => canvasSheet() },
  { id: 'watermark', icon: 'star', label: 'Watermark', run: () => wmSheet() },
  { id: 'overlay', icon: 'overlay', label: 'PIP', run: () => pick('overlay') },
  { id: 'elements', icon: 'elements', label: 'Elements', run: () => { select(null); elempanel.elementsSheet(elCtx()); } },
  { id: 'captions', icon: 'captions', label: 'Captions', run: captionsSheet },
  { id: 'record', icon: 'mic', label: 'Record', run: recordSheet },
  { id: 'speech', icon: 'speech', label: 'Add speech', run: speechSheet },
  { id: 'adjlayer', icon: 'adjust', label: 'Adjust', run: () => addAdjustmentLayer() },
  { id: 'mix', icon: 'duck', label: 'Mix', run: () => projectMixSheet() },
  { id: 'media', icon: 'media', label: 'Media', run: () => pick('main') },
  { id: 'adshuffle', icon: 'shuffle', label: 'Shuffle ad', when: () => !!(S.project && S.project.ad), run: () => shuffleAd(adCtx()) },
  { id: 'adedit', icon: 'beat', label: 'Edit ad', when: () => !!(S.project && S.project.ad), run: () => adSheet(adCtx(), S.project.ad) },
  { id: 'titles', icon: 'titles', label: 'Titles', run: addTitle },
  { id: 'karaoke', icon: 'karaoke', label: 'Karaoke', run: () => { select(null); karaokeSheet(kCtx()); } },
  { id: 'split', icon: 'split', label: 'Split', run: doSplit },
  ...work.ROOT_EXTRA.filter(t => t.id !== 'nestback'),
  { id: 'photo', icon: 'photo', label: 'Photo', run: () => { select(null); photomode.photoSheet(phCtx()); } },
  { id: 'ratio', icon: 'ratio', label: 'Ratio', when: () => !(S.project && S.project.photo), run: ratioSheet },
  { id: 'layout', icon: 'layout', label: 'Layout', run: () => layoutSheet() },
  { id: 'guides', icon: 'safe', label: 'Safe area', run: pro.guidesSheet },
  { id: 'perf', icon: 'speedo', label: 'Performance', run: () => perfSheet() },
];
const CLIP_TOOLS = [
  { id: 'phreplace', icon: 'replace', label: 'Replace me', when: c => !!c.placeholder && c.placeholder !== 'text' && isPic(c), run: () => pro.replaceClip() },
  { id: 'edit', icon: 'edit', label: 'Edit text', when: c => c.type === 'text', run: () => textSheet('edit') },
  { id: 'textstyle', icon: 'textstyle', label: 'Text style', when: c => c.type === 'text', run: () => textSheet('style') },
  { id: 'captions', icon: 'captions', label: 'Captions', when: c => !!c.caption, run: captionsSheet },
  { id: 'split', icon: 'split', label: 'Split', run: doSplit },
  { id: 'delete', icon: 'trash', label: 'Delete', run: () => { const id = S.sel; select(null); act(p => remove(p, id)); player.gc(); } },
  { id: 'speed', icon: 'speed', label: 'Speed', when: hasSource, run: () => selected().clip.curve ? pro.curveSpeedSheet() : speedSheet() },
  { id: 'volume', icon: 'volume', label: 'Volume', when: hasSource, run: volumeSheet },
  { id: 'anim', icon: 'anim', label: 'Animation', when: isVisualClip, run: () => animSheet() },
  { id: 'transition', icon: 'transition', label: 'Transition', when: c => { const f = find(S.project, c.id); return f && TRACK_KINDS[f.track.kind].magnetic && f.track.clips.length > 1; }, run: () => { const f = selected(); const i = f.track.clips.indexOf(f.clip); transitionSheet(f.track.clips[Math.max(1, i)].id); } },
  { id: 'crop', icon: 'crop', label: 'Crop', when: c => isPic(c), run: pro.cropSheet },
  { id: 'hd', icon: 'hd', label: 'HD Enhance', when: c => c.type === 'video' || c.type === 'image', run: hdSheet },
  { id: 'filters', icon: 'filter', label: 'Filter', when: c => c.type === 'video' || c.type === 'image' || isAdjLayer(c), run: filterSheet },
  { id: 'adjust', icon: 'adjust', label: 'Adjust', when: c => c.type === 'video' || c.type === 'image', run: colorSheet },
  { id: 'enhvoice', icon: 'enhvoice', label: 'Voice Enhance', when: hasSource, run: enhanceVoiceSheet },
  { id: 'voicefx', icon: 'voicefx', label: 'Voice Effect', when: hasSource, run: voiceFxSheet },
  { id: 'cutout', icon: 'cutout', label: 'Cutout', when: c => isPic(c), run: pro.cutoutSheet },
  { id: 'mask', icon: 'mask', label: 'Mask', when: c => isPic(c), run: pro.maskSheet },
  { id: 'opacity', icon: 'opacity', label: 'Opacity', when: c => isVisualClip(c) || isAdjLayer(c), run: opacitySheet },
  { id: 'blend', icon: 'blend', label: 'Blend', when: c => isPic(c), run: pro.blendSheet },
  { id: 'replace', icon: 'replace', label: 'Switch', when: c => isPic(c) && !(c.placeholder && c.placeholder !== 'text'), run: pro.replaceClip },
  { id: 'duplicate', icon: 'copy', label: 'Duplicate', run: () => { const b = act(p => duplicate(p, S.sel)); b && select(b.id); } },
  { id: 'rotate', icon: 'rotate', label: 'Rotate / Flip', when: c => isPic(c), run: rotateSheet },
  { id: 'freeze', icon: 'freeze', label: 'Freeze', when: c => c.type === 'video', run: () => pro.freezeSheet() },
  { id: 'capture', icon: 'capture', label: 'Capture', when: c => isPic(c), run: captureFrame },
  { id: 'reverse', icon: 'reverse', label: 'Reverse', when: c => c.type === 'video', run: () => pro.reverseClip() },
  { id: 'stab', icon: 'stab', label: 'Stabilise', when: c => c.type === 'video', run: () => stabSheet() },
  { id: 'track', icon: 'track', label: 'Track', when: c => c.type === 'text' || ((c.type === 'image' || c.type === 'video') && find(S.project, c.id)?.track.kind !== 'main'), run: () => trackSheet() },
  { id: 'keyframe', icon: 'kf', label: 'Keyframe', run: () => { player.pause(); toggleKf(); } },
  { id: 'clipbg', icon: 'bg', label: 'Background', when: c => isPic(c) && find(S.project, c.id)?.track.kind === 'main', run: () => canvasSheet() },
  { id: 'extract', icon: 'extract', label: 'Extract audio', when: c => c.type === 'video', run: doExtract },
  { id: 'colorpro', icon: 'wheel', label: 'Colour', when: c => c.type === 'video' || c.type === 'image' || isAdjLayer(c), run: () => colorProSheet() },
  { id: 'clipfx', icon: 'effects', label: 'Effects', when: c => c.type === 'video' || c.type === 'image' || isAdjLayer(c), run: () => effectsSheet('clip') },
  { id: 'effect', icon: 'effects', label: 'Effect', when: c => c.type === 'effect' && !isAdjLayer(c), run: () => effectsSheet('track') },
  { id: 'transform', icon: 'move', label: 'Transform', when: isVisualClip, run: transformSheet },
  { id: 'mirror', icon: 'mirror', label: 'Mirror', when: c => c.type === 'video' || c.type === 'image', run: () => mirrorSheet() },
  { id: 'fit', icon: 'fit', label: 'Fit / Fill', when: c => c.type === 'video' || c.type === 'image', run: toggleFit },
  { id: 'slowmo', icon: 'slowmo', label: 'Slow-mo', when: c => c.type === 'video', run: () => slowmoSheet() },
  { id: 'tooverlay', icon: 'overlay', label: 'Overlay', when: c => isPic(c) && find(S.project, c.id)?.track.kind === 'main', run: () => pro.toTrack('overlay') },
  { id: 'tomain', icon: 'tomain', label: 'Main track', when: c => isPic(c) && find(S.project, c.id)?.track.kind === 'overlay', run: () => pro.toTrack('main') },
  { id: 'mute', icon: 'mute', label: 'Mute sound', when: c => c.type === 'video', run: () => { act(p => { const c = find(p, S.sel).clip; c.muteAudio = !c.muteAudio; }); toast(selected().clip.muteAudio ? 'Original sound muted' : 'Original sound on'); } },
  { id: 'duration', icon: 'clock', label: 'Duration', when: c => !hasSource(c), run: durationSheet },
  { id: 'audiomix', icon: 'eq', label: 'EQ & mix', when: hasSource, run: () => mixSheet() },
  { id: 'marks', icon: 'marks', label: 'Beat marks', when: hasSource, run: () => mixSheet('marks') },
  { id: 'curve', icon: 'curve', label: 'Curve', when: c => hasKeyframes(c), run: curveSheet },
  { id: 'graph', icon: 'graph', label: 'Graph', when: c => hasKeyframes(c), run: () => graphSheet() },
  { id: 'kenburns', icon: 'kenburns', label: 'Ken Burns', when: c => c.type === 'image', run: kenBurnsSheet },
  ...work.CLIP_EXTRA,
];
function clipAtPlayhead(fn) {
  if (!selected()) { const main = S.project.tracks.find(x => x.kind === 'main'), t = player.t; const c = main && (main.clips.find(c => c.start <= t && t < clipEnd(c)) || main.clips[0]); if (!c) { toast('Add a video or photo first'); return; }
    openSheet('Filters', () => {}); setTimeout(() => { select(c.id); fn(); }, 0); return; }   // panel shows at once, the clip is selected just after
  fn();
}
function opacitySheet() {
  const c = selected().clip, L = localT(c);
  openSheet('Opacity', body => {
    body.append(slider('Opacity', { min: 0, max: 1, step: 0.01, value: propAt(c, 'opacity', L), fmt: v => Math.round(v * 100) + '%', id: 'opacityRange', onInput: v => editSel(cl => setProp(cl, 'opacity', v, L)) }));
    if (hasKeyframes(c)) body.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: `Animated clip: this sets the opacity at ${fmtS(L)} (a keyframe).` }));
  });
}
function rotateSheet() {
  openSheet('Rotate / Flip', body => {
    const row = document.createElement('div'); row.className = 'toggles';
    const mk = (id, html, fn) => { const b = document.createElement('button'); b.className = 'chipbtn'; b.id = id; b.innerHTML = html; b.onclick = fn; row.append(b); return b; };
    mk('rotLeft', icon('rotate', 16) + ' Rotate', () => editSel(cl => { cl.rot90 = ((cl.rot90 || 0) + 1) % 4; if (!cl.rot90) delete cl.rot90; }));
    mk('flipHBtn', icon('fliph', 16) + ' Flip ↔', () => editSel(cl => { cl.flipH = !cl.flipH; if (!cl.flipH) delete cl.flipH; }));
    mk('flipVBtn', icon('flipv', 16) + ' Flip ↕', () => editSel(cl => { cl.flipV = !cl.flipV; if (!cl.flipV) delete cl.flipV; }));
    mk('mirrorMore', icon('mirror', 16) + ' Mirror…', () => mirrorSheet());
    body.append(row, Object.assign(document.createElement('p'), { className: 'hint', textContent: 'Rotate turns the clip 90° each tap. For any angle, pinch with two fingers on the picture.' }));
  });
}
async function captureFrame() {
  player.pause();
  try { const b = await renderStill({ t: player.t, blob: true, type: 'image/png' }); downloadBlob(b, `frame-${fmtS(player.t).replace(/[^0-9]/g, '')}.png`); toast('Frame saved as a picture'); }
  catch (e) { toast('Could not capture this frame'); }
}
let subRow = null;
const SUB_ROWS = { text: () => [
  { id: 'addtext', icon: 'text', label: 'Add text', run: addText },
  { id: 'captions', icon: 'captions', label: 'Auto captions', run: captionsSheet },
  ROOT_TOOLS.find(t => t.id === 'stickers'),
  ...ROOT_TOOLS.filter(t => t.id === 'draw'),
  { id: 'texttpl', icon: 'titles', label: 'Text template', run: addTitle },
  { id: 'speech', icon: 'speech', label: 'Text to audio', run: speechSheet },
  { id: 'karaoke', icon: 'karaoke', label: 'Auto lyrics', run: () => { select(null); karaokeSheet(kCtx()); } },
].filter(Boolean) };
function setSubRow(v) { subRow = v; refreshToolbar(); }
function refreshToolbar() {
  const bar = $('#toolbar'), f = selected();
  const multi = S.multi.length > 1, tools = multi ? work.MULTI_TOOLS.filter(t => !t.when || t.when()) : f ? CLIP_TOOLS.filter(t => !t.when || t.when(f.clip)) : (subRow ? SUB_ROWS[subRow]() : ROOT_TOOLS.filter(t => !t.when || t.when()));
  const key = (multi ? 'multi' + S.multi.length + ':' : f ? f.clip.id + ':' : 'root:' + (subRow || '') + ':') + tools.map(t => t.id).join(',');
  if (bar.dataset.key === key) return; bar.dataset.key = key; bar.classList.toggle('cliprow', !!(f || subRow) && !multi); bar.scrollLeft = 0;
  bar.innerHTML = (multi ? `<span class="multicount" id="multiCount">${S.multi.length} selected</span>` : f || subRow ? `<button class="tool back" data-tool="back">${icon('back')}<span>Back</span></button>` : '') +
    tools.map(t => `<button class="tool" data-tool="${t.id}">${icon(t.icon)}<span>${t.label}</span></button>`).join('');
  bar.onpointerdown = e => { const b = e.target.closest('.tool'); if (!b) return; b.classList.add('pressed'); setTimeout(() => b.classList.remove('pressed'), 220); };
  bar.onclick = e => { const b = e.target.closest('.tool'); if (!b) return; if (b.dataset.tool === 'back') { if (!f && subRow) setSubRow(null); else select(null); return; }
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
  const b = $('#cmpBtn'); b.innerHTML = icon('compare'); let hold = null, held = false, prev = null, eat = false;
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
async function renderStill({ t = 0, W, H, plain = false, fast = false, type = 'image/png', quality = 0.92, blob: asBlob = false } = {}) {
  await ensureProjectFonts(S.project);
  if (!W) ({ W, H } = outputSize(S.project.aspect, 1080));
  const { loadBitmap } = await import('./media.js');
  const cv = new OffscreenCanvas(W, H), ctx = cv.getContext('2d', { alpha: false }), frames = new Map();
  { const cc = canvasClip(S.project); if (cc && media.get(cc.mediaId)) { const bm = await loadBitmap(media.get(cc.mediaId)); frames.set(cc.id, { img: bm, w: bm.width, h: bm.height }); } }
  for (const c of activeVisual(S.project, t)) if (c.type === 'image') { const bm = await loadBitmap(media.get(c.mediaId)); frames.set(c.id, { img: bm, w: bm.width, h: bm.height }); }
  player.seek(t); await new Promise(r => setTimeout(r, 300));
  renderFrame(ctx, W, H, S.project, t, c => frames.get(c.id) || player.source(c), { plain, fast });
  const blob = await cv.convertToBlob({ type, quality }); if (asBlob) return blob; const buf = new Uint8Array(await blob.arrayBuffer());
  let s = ''; for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
  return btoa(s);
}
/* text sheet: Edit / Font / Styles / Bubble / Titles. Tiles are drawn by the real drawText (same as preview + export). */
let textTab = 'edit', textSub = 'text';
function textTile(x, TW, TH, clip, t = clip.anim ? (clip.dur || 3) / 2 : 0) {
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.filter = 'none'; x.fillStyle = '#23232d'; x.fillRect(0, 0, TW, TH);
  const b = drawText(x, TW, TH, clip, { ...DEFAULT_TRANSFORM, opacity: 0 }, 99), k = Math.min(0.86 * TW / Math.max(1, b.w), 0.8 * TH / Math.max(1, b.h), 3);
  drawText(x, TW, TH, clip, { ...DEFAULT_TRANSFORM, scale: k }, t); x.restore();
}
const rgbaOf = (c, a) => { const m = /^#([0-9a-f]{6})$/i.exec(c || ''); if (m) { const n = parseInt(m[1], 16); return a >= 0.999 ? c : `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${+a.toFixed(2)})`; }
  const r = /rgba?\(([^)]+)\)/.exec(c || ''); if (r) { const [R, G, B] = r[1].split(',').map(Number); return `rgba(${R},${G},${B},${+a.toFixed(2)})`; } return c; };
const alphaOf = c => { const r = /rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+)\)/.exec(c || ''); return r ? +r[1] : 1; };
const hexOf = c => { const r = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(c || ''); return r ? '#' + [r[1], r[2], r[3]].map(v => (+v).toString(16).padStart(2, '0')).join('') : (c || '#ffffff'); };
// 'Aa' presets on the Styles tab (quick looks, CapCut style)
const AA_PRESETS = [
  { id: 'none', s: {} }, { id: 'white-black', s: { color: '#ffffff', outline: true, outlineColor: '#000000', outlineW: 0.12 } },
  { id: 'black-white', s: { color: '#000000', outline: true, outlineColor: '#ffffff', outlineW: 0.12 } },
  { id: 'shadow', s: { color: '#ffffff', shadow: { color: 'rgba(0,0,0,.7)', dx: 0.03, dy: 0.06, blur: 0.08 } } },
  { id: 'yellow', s: { color: '#ffe600', outline: true, outlineColor: '#000000', outlineW: 0.12 } },
  { id: 'red', s: { color: '#ff3b3b', outline: true, outlineColor: '#ffffff', outlineW: 0.12 } },
  { id: 'blue-box', s: { color: '#ffffff', box: true, bubble: 'box', boxColor: '#1f7bff' } },
  { id: 'black-box', s: { color: '#ffffff', box: true, bubble: 'box', boxColor: 'rgba(0,0,0,.75)' } },
  { id: 'yellow-box', s: { color: '#000000', box: true, bubble: 'pill', boxColor: '#ffe600' } },
  { id: 'pink-glow', s: { color: '#ffffff', glow: { color: '#ff5fa2', blur: 0.5 } } },
  { id: 'green', s: { color: '#3ddc84', outline: true, outlineColor: '#0b3d1f', outlineW: 0.12 } },
];
// extra generated 'ART' effects so the Effects tab has a big CapCut-like grid (all use the shared drawText)
const FX_HUES = [['Pink', '#ff5fa2'], ['Cyan', '#00e5ff'], ['Lime', '#9dff3d'], ['Violet', '#a259ff'], ['Orange', '#ff8a00'], ['Red', '#ff2d55'], ['Gold', '#ffd23f'], ['Blue', '#1f7bff']];
const FX_GRADS = [['Sunset', ['#ffcc33', '#ff5f6d']], ['Ocean', ['#00e5ff', '#1f3bff']], ['Candy', ['#ff9de2', '#a259ff']], ['Mint', ['#b8ffde', '#00b37e']], ['Fire', ['#fff200', '#ff7a00', '#ff1f1f']], ['Ice', ['#ffffff', '#9be7ff', '#3d7bff']], ['Rainbow', ['#ff4d4d', '#ffcc33', '#3ddc84', '#1fb6ff', '#a259ff']], ['Peach', ['#ffe0c2', '#ff8a65']]];
const EXTRA_FX = [
  ...FX_HUES.map(([n, c]) => ({ id: 'xneon-' + n.toLowerCase(), name: 'Neon ' + n, s: { color: '#ffffff', outline: true, outlineColor: c, outlineW: 0.05, glow: { color: c, blur: 0.6 } } })),
  ...FX_HUES.map(([n, c]) => ({ id: 'x3d-' + n.toLowerCase(), name: '3D ' + n, s: { color: c, outline: true, outlineColor: '#1b1b2f', outlineW: 0.08, extrude: { color: '#1b1b2f', depth: 0.12, angle: 45 } } })),
  ...FX_GRADS.map(([n, cs]) => ({ id: 'xgrad-' + n.toLowerCase(), name: n, s: { color: cs[0], fill: { colors: cs, dir: 'v' }, outline: true, outlineColor: '#1b1b2f', outlineW: 0.07, shadow: { color: 'rgba(0,0,0,.45)', dx: 0, dy: 0.05, blur: 0.05 } } })),
  ...FX_HUES.map(([n, c]) => ({ id: 'xline-' + n.toLowerCase(), name: 'Outline ' + n, s: { color: 'rgba(0,0,0,0)', outline: true, outlineColor: c, outlineW: 0.07 } })),
];

const FX_MORE = [
  ['xhw-pumpkin', 'Pumpkin', 'halloween', { color: '#ff8a00', outline: true, outlineColor: '#2b0a00', outlineW: 0.1, extrude: { color: '#5a1f00', depth: 0.1, angle: 60 } }],
  ['xhw-slime', 'Slime', 'halloween', { color: '#9dff3d', fill: { colors: ['#d4ff7a', '#38c400'], dir: 'v' }, outline: true, outlineColor: '#1a3300', outlineW: 0.1, glow: { color: '#9dff3d', blur: 0.35 } }],
  ['xhw-spooky', 'Spooky', 'halloween', { color: '#ffffff', outline: true, outlineColor: '#6a00ff', outlineW: 0.08, glow: { color: '#a259ff', blur: 0.7 } }],
  ['xhw-blood', 'Vampire', 'halloween', { color: '#c4001a', fill: { colors: ['#ff4d4d', '#5a0010'], dir: 'v' }, outline: true, outlineColor: '#000000', outlineW: 0.08, shadow: { color: 'rgba(0,0,0,.7)', dx: 0, dy: 0.06, blur: 0.06 } }],
  ['xmt-chrome', 'Chrome', 'metallic', { color: '#e8e8e8', fill: { colors: ['#ffffff', '#9aa3ad', '#ffffff', '#5b636b'], dir: 'v' }, outline: true, outlineColor: '#1b1b2f', outlineW: 0.07, gloss: true }],
  ['xmt-silver', 'Silver', 'metallic', { color: '#cfd6dd', fill: { colors: ['#f4f7fa', '#8c96a0'], dir: 'v' }, outline: true, outlineColor: '#33393f', outlineW: 0.07 }],
  ['xmt-bronze', 'Bronze', 'metallic', { color: '#cd7f32', fill: { colors: ['#ffd1a1', '#8a4b14'], dir: 'v' }, outline: true, outlineColor: '#3b1d05', outlineW: 0.07, gloss: true }],
  ['xmt-rosegold', 'Rose gold', 'metallic', { color: '#f4b6a6', fill: { colors: ['#ffe3da', '#c9776b'], dir: 'v' }, outline: true, outlineColor: '#5c2a25', outlineW: 0.07, gloss: true }],
  ['xfr-fire', 'Fire', 'fire', { color: '#ffcc00', fill: { colors: ['#fff200', '#ff7a00', '#ff1f1f'], dir: 'v' }, glow: { color: '#ff5a00', blur: 0.6 } }],
  ['xfr-blue', 'Blue flame', 'fire', { color: '#9be7ff', fill: { colors: ['#ffffff', '#00b3ff', '#1f3bff'], dir: 'v' }, glow: { color: '#00b3ff', blur: 0.6 } }],
  ['xfr-lava', 'Lava', 'fire', { color: '#ff4d00', fill: { colors: ['#ffd000', '#ff3d00', '#7a0000'], dir: 'v' }, outline: true, outlineColor: '#2b0000', outlineW: 0.08, extrude: { color: '#4d0000', depth: 0.08, angle: 90 } }],
  ['xgl-rgb', 'Glitch RGB', 'glitch', { color: '#ffffff', shadow: { color: '#ff0055', dx: -0.05, dy: 0, blur: 0 }, glow: { color: '#00e5ff', blur: 0.15 } }],
  ['xgl-cyan', 'Glitch cyan', 'glitch', { color: '#00e5ff', shadow: { color: '#ff2d55', dx: 0.05, dy: 0.02, blur: 0 }, outline: true, outlineColor: '#000000', outlineW: 0.05 }],
  ['xgl-vhs', 'VHS', 'glitch', { color: '#fffb00', shadow: { color: '#0047ff', dx: 0.04, dy: 0.03, blur: 0.02 }, outline: true, outlineColor: '#000000', outlineW: 0.06 }],
  ['xht-hearts', 'Lovey', 'hearts', { color: '#ff5fa2', outline: true, outlineColor: '#ffffff', outlineW: 0.12, stroke2: { color: '#ff2d7a', w: 0.08 }, glow: { color: '#ff9de2', blur: 0.4 } }],
  ['xht-candy', 'Bubblegum', 'hearts', { color: '#ffffff', fill: { colors: ['#ffd1ec', '#ff5fa2'], dir: 'v' }, outline: true, outlineColor: '#b3005e', outlineW: 0.1, gloss: true }],
  ['xbl-balloon', 'Balloon', 'balloon', { color: '#ff3b5c', fill: { colors: ['#ff9aa9', '#ff1f45'], dir: 'd' }, gloss: true, outline: true, outlineColor: '#8a0018', outlineW: 0.05 }],
  ['xbl-blue', 'Balloon blue', 'balloon', { color: '#1f7bff', fill: { colors: ['#9fd0ff', '#1f5bff'], dir: 'd' }, gloss: true, outline: true, outlineColor: '#00227a', outlineW: 0.05 }],
  ['xsp-splash', 'Splash', 'splash', { color: '#00e5ff', fill: { colors: ['#e0fbff', '#00b3ff'], dir: 'v' }, outline: true, outlineColor: '#003a66', outlineW: 0.1, stroke2: { color: '#ffffff', w: 0.1 } }],
  ['xtp-torn', 'Torn paper', 'paper', { color: '#1b1b2f', box: true, bubble: 'label', boxColor: '#f7f1e3' }],
];
EXTRA_FX.push(...FX_MORE.map(([id, name, cat, s]) => ({ id, name, cat, s })));
const fxCat = st => st.cat || (/neon/i.test(st.id + st.name) ? 'neon' : /3d/i.test(st.id + st.name) ? '3d' : /grad|sunset|ocean|candy|mint|ice|rainbow|peach/i.test(st.id + st.name) ? 'gradient' : /line/i.test(st.id) ? 'outline' : /stick/i.test(st.id + st.name) ? 'sticker' : /gold|metal/i.test(st.id + st.name) ? 'metallic' : /fire|flame/i.test(st.id + st.name) ? 'fire' : 'trending');
const FX_CATS = [['all', 'Trending'], ['fav', '★ Saved'], ['halloween', 'Halloween'], ['neon', 'Neon'], ['3d', '3D'], ['gradient', 'Gradient'], ['sticker', 'Sticker'], ['outline', 'Outline'], ['metallic', 'Metallic'], ['fire', 'Fire'], ['glitch', 'Glitch'], ['hearts', 'Hearts'], ['balloon', 'Balloon'], ['splash', 'Splash'], ['paper', 'Paper']];
const lsGet = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (e) { return d; } }, lsSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} };
// bubble designs: shape x colour x border x type combos, all drawn by the shared drawText bubble renderer
// B22 bubbles: designed shapes that resize to the text (render.js bubblePath). Professional first; cartoon ones only in Kids.
const BUB_DESIGNS = (() => { const L = [], add = (cat, name, word, t, trend) => L.push({ id: 'bd' + L.length, cat, name, word, t, trend: !!trend });
  const B = (bubble, boxColor, color, border, x = {}) => ({ bubble, boxColor, color, bubbleBorder: border, ...x });
  const ink = '#16161c', cream = '#f5efe6', gold = '#d4af37';
  // Speech
  for (const [n, sh, bc, tc, tr] of [['Chat white', 'chat', '#ffffff', ink, 1], ['Chat blue', 'chatR', '#0a84ff', '#ffffff', 1], ['Chat gray', 'chat', '#e9e9eb', ink], ['Chat dark', 'chatR', '#2c2c2e', '#ffffff'], ['Speech round', 'speech', '#ffffff', ink, 1], ['Speech dark', 'speech', 'rgba(16,16,20,.82)', '#ffffff'], ['Oval speech', 'oval', '#ffffff', ink], ['Oval outline', 'oval', 'rgba(0,0,0,0)', '#ffffff', 0, { color: '#ffffff', w: .04 }], ['Thought', 'thought', '#ffffff', ink], ['Callout', 'callout', '#ffffff', ink, 1], ['Callout dark', 'callout', 'rgba(16,16,20,.85)', '#ffffff'], ['Callout gold', 'callout', gold, ink]])
    add('speech', n, 'Hello', B(sh, bc, tc, null), tr);
  L.find(x => x.name === 'Oval outline').t.bubbleBorder = { color: '#ffffff', w: .04 };
  // Ribbons & banners
  for (const [n, sh, bc, tc, tr] of [['Ribbon crimson', 'ribbon2', '#9e1b32', '#ffffff', 1], ['Ribbon navy', 'ribbon2', '#1d2b53', cream], ['Ribbon gold', 'ribbon2', gold, ink, 1], ['Ribbon black', 'ribbon2', '#121214', gold], ['Banner cut', 'banner', '#9e1b32', '#ffffff'], ['Banner slate', 'banner', '#2b2f3a', '#ffffff'], ['Scroll cream', 'scroll', '#efe4cc', '#3a2a14'], ['Scroll gold', 'scroll', '#c9a35a', '#2a1e08']])
    add('ribbons', n, 'SPECIAL', B(sh, bc, tc, null, { font: 'montserrat' }), tr);
  // Frames
  for (const [n, sh, c, bc, tr] of [['Double frame', 'frame2', '#ffffff', 'rgba(0,0,0,0)', 1], ['Gold frame', 'frame2', gold, 'rgba(0,0,0,.35)', 1], ['Corners', 'corners', '#ffffff', 'rgba(0,0,0,0)', 1], ['Gold corners', 'corners', gold, 'rgba(0,0,0,0)'], ['Thin box', 'box', '#ffffff', 'rgba(0,0,0,0)'], ['Round outline', 'pill', '#ffffff', 'rgba(0,0,0,0)'], ['Dark frame', 'frame2', cream, 'rgba(10,10,14,.7)'], ['Black corners', 'corners', ink, 'rgba(255,255,255,.85)']])
    add('frames', n, 'Frame', B(sh, bc, sh === 'corners' && bc.startsWith('rgba(255') ? ink : c, sh === 'frame2' || sh === 'corners' ? { color: c, w: 0 } : { color: c, w: .035 }), tr);
  // Labels & tags
  for (const [n, sh, bc, tc, w, tr] of [['Price tag', 'tag', '#ffffff', ink, '$29', 1], ['Price red', 'tag', '#c8102e', '#ffffff', '$29'], ['Ticket', 'ticket', gold, ink, 'ADMIT ONE', 1], ['Ticket dark', 'ticket', '#1c1c22', cream, 'VIP'], ['Label slant', 'label', '#ffffff', ink, 'NEW'], ['Label black', 'label', '#111114', '#ffffff', 'SALE'], ['Sticker', 'sticker', '#ffffff', ink, 'LABEL'], ['Box solid', 'box', '#111114', '#ffffff', 'LABEL', 1], ['Box white', 'box', '#ffffff', ink, 'LABEL'], ['Box accent', 'box', '#ff5a36', '#ffffff', 'LIVE']])
    add('labels', n, w, B(sh, bc, tc, null), tr);
  // Tape & paper
  for (const [n, sh, bc, tc, tr] of [['Washi tape', 'tape', 'rgba(240,226,190,.88)', '#3a2a14', 1], ['Clear tape', 'tape', 'rgba(255,255,255,.55)', ink], ['Pink tape', 'tape', 'rgba(244,196,196,.9)', '#5a2a2a'], ['Torn white', 'torn', '#f7f5f0', ink, 1], ['Torn kraft', 'torn', '#c8a47a', '#2a1a08'], ['Torn black', 'torn', '#141416', '#ffffff'], ['Note card', 'box', '#fbf7ea', '#2a2a2a', 0, { shadow: null }], ['Paper slip', 'label', '#f7f5f0', ink]])
    add('paper', n, 'Note', B(sh, bc, tc, null), tr);
  // Brush
  for (const [n, bc, tc, tr] of [['Brush black', '#111114', '#ffffff', 1], ['Brush red', '#c8102e', '#ffffff', 1], ['Brush gold', gold, ink], ['Brush white', '#f5f5f5', ink], ['Brush coral', '#ff6b5a', '#ffffff'], ['Brush navy', '#1d2b53', '#ffffff']])
    add('brush', n, 'HIGHLIGHT', B('brush', bc, tc, null), tr);
  // Social
  for (const [n, sh, bc, tc, w, tr] of [['Subscribe', 'box', '#ff0000', '#ffffff', 'SUBSCRIBE', 1], ['Follow pill', 'pill', '#ffffff', ink, '+ Follow', 1], ['Glass pill', 'pill', 'rgba(255,255,255,.18)', '#ffffff', '@yourname', 1], ['Dark pill', 'pill', 'rgba(16,16,20,.75)', '#ffffff', 'Link in bio'], ['Blue pill', 'pill', '#0a84ff', '#ffffff', 'Shop now'], ['Like chat', 'chatR', '#ff2d55', '#ffffff', '♥ 2.4K']])
    add('social', n, w, B(sh, bc, tc, sh === 'pill' && bc.includes('.18') ? { color: 'rgba(255,255,255,.6)', w: .025 } : null, { font: 'poppins' }), tr);
  // Minimal
  for (const [n, sh, bc, tc, tr] of [['Glass', 'pill', 'rgba(255,255,255,.16)', '#ffffff', 1], ['Smoke box', 'box', 'rgba(0,0,0,.55)', '#ffffff', 1], ['White box', 'box', 'rgba(255,255,255,.92)', ink], ['Cream pill', 'pill', cream, '#3a2a14'], ['Line box', 'box', 'rgba(0,0,0,0)', '#ffffff']])
    add('minimal', n, 'minimal', B(sh, bc, tc, bc === 'rgba(0,0,0,0)' || bc.includes('.16') ? { color: 'rgba(255,255,255,.7)', w: .025 } : null), tr);
  // Kids (playful)
  for (const [n, w, sh, bc, tc] of [['BAM', 'BAM!', 'burst', '#ffe600', '#e01e37'], ['POW', 'POW!', 'burst', '#ff2d2d', '#ffe600'], ['WOW', 'WOW!', 'burst', '#1fb6ff', '#ffffff'], ['Comic', 'Hey!', 'speech', '#ffe600', '#1b1b2f'], ['Cloud', 'Dreamy', 'cloud', '#cfeaff', '#1f3bff'], ['Kawaii', 'Cute~', 'pill', '#ffd1ec', '#ff2d7a'], ['Kawaii cloud', 'Yay', 'cloud', '#ffe0c2', '#ff2d7a'], ['Neon OMG', 'OMG', 'speech', 'rgba(0,0,0,0)', '#ffffff']])
    add('kids', n, w, B(sh, bc, tc, n === 'Neon OMG' ? { color: '#ff5fa2', w: .06 } : { color: '#000000', w: .06 }, { font: 'bangers' }));
  return L; })();
const BUB_CATS = [['trending', 'Trending'], ['speech', 'Speech'], ['ribbons', 'Ribbons'], ['frames', 'Frames'], ['labels', 'Labels'], ['paper', 'Tape & Paper'], ['brush', 'Brush'], ['social', 'Social'], ['minimal', 'Minimal'], ['kids', 'Kids']];
const fxStyle = (t, fid) => { const x = EXTRA_FX.find(e => e.id === fid); if (!x) return applyStyle(t, fid); applyStyle(t, null); Object.assign(t, JSON.parse(JSON.stringify(x.s))); t.styleId = fid; return t; };
const FONT_CATS = [['trending', 'Trending'], ['classic', 'Classic'], ['new', 'New'], ['headings', 'Headings'], ['elegant', 'Elegant'], ['bold', 'Bold'], ['handwriting', 'Handwriting'], ['basic', 'Basic'], ['creative', 'Creative'], ['festive', 'Festive'], ['kids', 'Kids']];
const FONT_SETS = {
  trending: ['montserrat', 'playfairdisplay', 'bebasneue', 'cormorantgaramond', 'cinzel', 'inter', 'dmserifdisplay', 'oswald', 'greatvibes', 'poppins', 'anton', 'italiana', 'raleway', 'bodonimoda', 'dancingscript', 'spacegrotesk', 'unbounded', 'leaguespartan'],
  classic: ['classic', 'playfairdisplay', 'librebaskerville', 'lora', 'cormorantgaramond', 'prata', 'marcellus', 'bodonimoda', 'abrilfatface', 'cinzel'],
  headings: ['bebasneue', 'anton', 'oswald', 'archivoblack', 'leaguespartan', 'fjallaone', 'teko', 'dmserifdisplay', 'abrilfatface', 'alfaslabone', 'unbounded', 'montserrat'],
  basic: ['bold', 'clean', 'mono', 'inter', 'montserrat', 'poppins', 'raleway', 'worksans', 'outfit', 'nunito', 'quicksand', 'josefinsans', 'spacegrotesk'],
};
const NEW_FONTS = new Set(['cormorantgaramond', 'cinzel', 'bodonimoda', 'dmserifdisplay', 'librebaskerville', 'lora', 'marcellus', 'prata', 'italiana', 'greatvibes', 'allura', 'parisienne', 'sacramento', 'satisfy', 'kaushanscript', 'yellowtail', 'inter', 'raleway', 'worksans', 'archivoblack', 'teko', 'unbounded', 'syne', 'spacegrotesk', 'josefinsans', 'leaguespartan', 'outfit', 'blackopsone', 'monoton', 'bungeeshade', 'mountainsofchristmas', 'berkshireswash', 'creepster', 'shadowsintolight', 'rocksalt', 'fjallaone', 'alfaslabone']);
const fontCat = (k, cat) => { const f = FONTS[k], g = f.group || 'system';
  if (FONT_SETS[cat]) return FONT_SETS[cat].includes(k); if (cat === 'new') return NEW_FONTS.has(k);
  if (cat === 'elegant') return g === 'elegant' || ['playfairdisplay', 'italiana', 'greatvibes', 'allura', 'parisienne'].includes(k);
  if (cat === 'bold') return g === 'bold' || ['anton', 'bebasneue', 'oswald', 'abrilfatface', 'bungee'].includes(k);
  if (cat === 'handwriting') return g === 'hand' || g === 'script';
  if (cat === 'creative') return g === 'creative' || g === 'display' && !['playfairdisplay', 'abrilfatface'].includes(k) || k === 'righteous';
  if (cat === 'festive') return g === 'festive' || ['lobster', 'pacifico', 'greatvibes', 'berkshireswash'].includes(k);
  if (cat === 'kids') return g === 'kids'; return false; };
const fontOrder = cat => FONT_SETS[cat] ? FONT_SETS[cat].filter(k => FONTS[k]) : null;
// draw thumbnails only when they scroll into view (panel opens instantly)
const lazyDraw = (root, draw) => { if (!('IntersectionObserver' in window)) { setTimeout(() => root.querySelectorAll('[data-lazy]').forEach(draw), 0); return; }
  const q = [], pump = () => { const t0 = performance.now(); while (q.length && performance.now() - t0 < 8) { const b = q.shift(); document.body.contains(b) && draw(b); } if (q.length) setTimeout(pump, 0); };
  const io = new IntersectionObserver(es => { const was = q.length; es.forEach(e => { if (e.isIntersecting) { io.unobserve(e.target); q.push(e.target); } }); if (!was && q.length) setTimeout(pump, 0); }, { root: null, rootMargin: '120px' });
  root.querySelectorAll('[data-lazy]').forEach(b => io.observe(b)); return io; };
function textSheet(startTab) {
  const f0 = selected(); if (!f0) return; const id = f0.clip.id;
  textTab = { font: 'font', style: 'style', bubble: 'bubble', title: 'title', anim: 'anim', edit: 'edit', preset: 'preset' }[startTab || textTab] || 'edit';
  const clipNow = () => find(S.project, id)?.clip;
  openSheet('Text', body => {
    const T = clipNow().text;
    const head = document.createElement('div'); head.className = 'txhead';
    const ta = document.createElement('textarea'); ta.id = 'textInput'; ta.rows = 1; ta.value = T.content === 'Your text' ? '' : T.content; ta.placeholder = 'Enter text';
    ta.oninput = () => { editSel(cl => { cl.text.content = ta.value || ' '; delete cl.placeholder; }); };
    const ex = document.createElement('button'); ex.id = 'textExpand'; ex.className = 'iconbtn'; ex.title = 'Expand'; ex.textContent = '⤢';
    ex.onclick = () => { const big = ta.rows === 1; ta.rows = big ? 4 : 1; ex.classList.toggle('on', big); ta.focus(); };
    head.append(ta, ex); body.append(head);
    const pane = document.createElement('div'); pane.className = 'textpane';
    const TABS = [['title', 'Templates'], ['font', 'Fonts'], ['edit', 'Styles'], ['style', 'Effects'], ['anim', 'Animations'], ['bubble', 'Bubbles'], ['preset', 'Presets']];
    const tabEl = chips(TABS.map(([value, label]) => ({ value, label })), textTab, v => { textTab = v; show(); }, 'tabs texttabs');
    body.append(tabEl, pane);
    const dpr = Math.min(2, devicePixelRatio || 1), TW = Math.round(76 * dpr), TH = Math.round(64 * dpr);
    let unsub = null, io = null;
    const tileGrid = (items, cur, mk, onPick, cls) => {
      const g = document.createElement('div'); g.className = 'trgrid txgrid g4 ' + cls;
      const draw = b => { const it = items[+b.dataset.i]; if (it.none) { const x = b.querySelector('canvas').getContext('2d'); x.fillStyle = '#23232d'; x.fillRect(0, 0, TW, TH); x.strokeStyle = '#888'; x.lineWidth = 3 * dpr; x.beginPath(); x.arc(TW / 2, TH / 2, TH * .22, 0, 7); x.moveTo(TW / 2 - TH * .16, TH / 2 + TH * .16); x.lineTo(TW / 2 + TH * .16, TH / 2 - TH * .16); x.stroke(); return; }
        if (it.font) ensureFont(it.font); textTile(b.querySelector('canvas').getContext('2d'), TW, TH, mk(it)); b.dataset.drawn = 1; };
      items.forEach((it, i) => { const b = document.createElement('button'); b.className = 'trtile' + ((it.id ?? null) === (cur ?? null) ? ' on' : ''); b.dataset.v = it.id ?? 'none'; b.dataset.i = i; b.dataset.lazy = 1; b.innerHTML = `<canvas width="${TW}" height="${TH}"></canvas><span>${it.name}</span>`;
        b.onclick = () => { g.querySelectorAll('.trtile').forEach(x => x.classList.toggle('on', x === b)); onPick(it); }; g.append(b); });
      io && io.disconnect(); requestAnimationFrame(() => { io = lazyDraw(g, draw); });
      unsub && unsub(); unsub = onFontLoad(() => document.body.contains(g) && g.querySelectorAll('[data-drawn]').forEach(draw));
      return g;
    };
    // CapCut-style browser: ⊘ / ★ Saved / category chips + search, 4-col tiles drawn only when visible, animated tiles only while visible, hold to save
    const artBrowser = o => {
      const wrap = document.createElement('div'); wrap.className = 'artbrowser'; let cat = 'trending', q = ''; const favs = new Set(lsGet(o.favKey, []));
      const bar = document.createElement('div'); bar.className = 'fontbar';
      const sb = document.createElement('button'); sb.className = 'iconbtn'; sb.textContent = '🔍'; sb.id = o.cls + 'Search';
      const si = document.createElement('input'); si.type = 'search'; si.placeholder = o.ph; si.hidden = true; si.className = 'artsearch';
      sb.onclick = () => { si.hidden = !si.hidden; if (!si.hidden) si.focus(); else { q = ''; si.value = ''; fill(); } }; si.oninput = () => { q = si.value.trim().toLowerCase(); fill(); };
      const cx = chips([...(o.none ? [{ value: 'none', label: '⊘' }] : []), { value: 'fav', label: '🔖 Saved' }, ...o.cats.map(([value, label]) => ({ value, label }))], cat, v => { if (v === 'none') { o.pick(null); grid.querySelectorAll('.trtile').forEach(x => x.classList.remove('on')); cx.setActive && cx.setActive(cat); return; } cat = v; fill(); }, 'tabs fxcats');
      bar.append(sb, cx); const grid = document.createElement('div'); grid.className = 'trgrid txgrid g4 ' + o.cls; wrap.append(bar, si, grid);
      let io = null, vis = new Set(), raf = 0, list = [];
      const tileT = (it, now) => { const c = o.mk(it); if (!c.anim) return [c, 0]; const cyc = (now / 1000) % 2.6; c.dur = 3; return [c, Math.min(2.9, cyc)]; };
      const draw = (b, now = 0) => { const it = list[+b.dataset.i]; if (!it) return; const x = b.querySelector('canvas').getContext('2d');
        if (it.none) { x.fillStyle = '#23232d'; x.fillRect(0, 0, TW, TH); return; } if (it.font) ensureFont(it.font);
        const [c, t] = o.animated ? tileT(it, now) : [o.mk(it), 0]; textTile(x, TW, TH, c, o.animated ? t : undefined); b.dataset.drawn = 1; };
      const loop = now => { if (!document.body.contains(grid)) return; if (now - (loop.l || 0) > 66) { loop.l = now; for (const b of vis) draw(b, now); } raf = requestAnimationFrame(loop); };
      function fill() { grid.innerHTML = ''; const cur = o.cur() || null;
        list = [...(o.dflt ? [{ id: null, dflt: true, name: 'Default' }] : []), ...o.items.filter(it => q ? (it.name + ' ' + (it.cat || '')).toLowerCase().includes(q) : cat === 'fav' ? favs.has(it.id) : cat === 'trending' ? (o.trending ? o.trending.has(it.id) : it.trend) : it.cat === cat)];
        if (!list.length) grid.innerHTML = `<p class="hint">${cat === 'fav' ? 'Press and hold a tile to save it here.' : 'Nothing found.'}</p>`;
        list.forEach((it, i) => { const b = document.createElement('button'); b.className = 'trtile' + ((it.id ?? null) === cur ? ' on' : '') + (favs.has(it.id) ? ' fav' : ''); b.dataset.v = it.id ?? 'none'; b.dataset.i = i; b.dataset.lazy = 1;
          b.innerHTML = `<canvas width="${TW}" height="${TH}"></canvas><span>${it.name}</span>`;
          let hold = 0, held = false; b.onpointerdown = () => { held = false; hold = setTimeout(() => { held = true; if (!it.id) return; favs.has(it.id) ? favs.delete(it.id) : favs.add(it.id); lsSet(o.favKey, [...favs]); b.classList.toggle('fav', favs.has(it.id)); toast(favs.has(it.id) ? 'Saved' : 'Removed from Saved'); }, 550); };
          b.onpointerup = b.onpointercancel = b.onpointerleave = () => clearTimeout(hold); b.oncontextmenu = e => e.preventDefault();
          b.onclick = () => { if (held) return; grid.querySelectorAll('.trtile').forEach(x => x.classList.toggle('on', x === b)); o.pick(it.dflt ? { dflt: true } : it); }; grid.append(b); });
        io && io.disconnect(); vis = new Set();
        requestAnimationFrame(() => { io = lazyDraw(grid, b => { draw(b, performance.now()); }); if (o.animated && 'IntersectionObserver' in window) { const vio = new IntersectionObserver(es => es.forEach(e => e.isIntersecting ? vis.add(e.target) : vis.delete(e.target)), { root: grid }); grid.querySelectorAll('.trtile').forEach(b => vio.observe(b)); } }); }
      fill(); if (o.animated) { cancelAnimationFrame(raf); raf = requestAnimationFrame(loop); }
      unsub && unsub(); unsub = onFontLoad(() => document.body.contains(grid) && grid.querySelectorAll('[data-drawn]').forEach(b => draw(b, performance.now())));
      return wrap;
    };
    const show = () => {
      pane.innerHTML = ''; const T = clipNow().text; pane.dataset.tab = textTab;
      if (textTab === 'edit') {
        // Aa presets
        const pr = document.createElement('div'); pr.className = 'aarow';
        for (const p of AA_PRESETS) { const b = document.createElement('button'); b.className = 'aa'; b.dataset.v = p.id; const s = p.s;
          if (p.id === 'none') b.innerHTML = '<span class="aa-none">⦸</span>'; else { b.textContent = 'Aa'; b.style.color = s.color || '#fff'; if (s.box) b.style.background = s.boxColor;
            const sh = []; if (s.outline) for (const [dx, dy] of [[1, 1], [-1, 1], [1, -1], [-1, -1]]) sh.push(`${dx * 1.5}px ${dy * 1.5}px 0 ${s.outlineColor}`); if (s.shadow) sh.push('2px 3px 3px rgba(0,0,0,.8)'); if (s.glow) sh.push(`0 0 6px ${s.glow.color}`); b.style.textShadow = sh.join(','); }
          b.onclick = () => { editSel(cl => { applyStyle(cl.text, null); Object.assign(cl.text, JSON.parse(JSON.stringify(p.s))); if (!p.s.box) { cl.text.box = false; cl.text.bubble = null; } }); pr.querySelectorAll('.aa').forEach(x => x.classList.toggle('on', x === b)); sub(); };
          pr.append(b); }
        pane.append(pr);
        let st = textSub || 'text';
        const L = c => Math.max(0, player.t - c.start);
        const SUBS = {
          text: { color: t => t.color, set: (cl, v) => { cl.text.color = v; cl.text.fill = null; },
            size: { label: 'Size', min: 24, max: 300, step: 1, id: 'textSize', get: t => t.size, fmt: v => Math.round(v), set: (cl, v) => { cl.text.size = v; } },
            op: { get: () => propAt(clipNow(), 'opacity', L(clipNow())), set: (cl, v) => setProp(cl, 'opacity', v, L(cl)) } },
          stroke: { color: t => t.outline ? t.outlineColor : 'none', set: (cl, v) => { if (v === 'none') { cl.text.outline = false; return; } cl.text.outline = true; cl.text.outlineColor = rgbaOf(v, alphaOf(cl.text.outlineColor)); },
            size: { label: 'Size', min: 0, max: 0.4, step: 0.01, id: 'textOutlineW', get: t => t.outline ? t.outlineW ?? 0.14 : 0, fmt: v => Math.round(v * 100), set: (cl, v) => { cl.text.outline = v > 0.005; cl.text.outlineW = v; } },
            op: { get: () => alphaOf(clipNow().text.outlineColor), set: (cl, v) => { cl.text.outlineColor = rgbaOf(cl.text.outlineColor, v); } } },
          glow: { color: t => t.glow ? t.glow.color : 'none', set: (cl, v) => { cl.text.glow = v === 'none' ? null : { blur: cl.text.glow?.blur ?? 0.5, color: rgbaOf(v, alphaOf(cl.text.glow?.color)) }; },
            size: { label: 'Size', min: 0, max: 1.2, step: 0.01, id: 'textGlowSize', get: t => t.glow?.blur ?? 0, fmt: v => Math.round(v * 100), set: (cl, v) => { cl.text.glow = v < 0.01 ? null : { color: cl.text.glow?.color || '#ff5fa2', blur: v }; } },
            op: { get: () => alphaOf(clipNow().text.glow?.color), set: (cl, v) => { if (cl.text.glow) cl.text.glow.color = rgbaOf(cl.text.glow.color, v); } } },
          bg: { color: t => t.box ? t.boxColor : 'none', set: (cl, v) => { if (v === 'none') { cl.text.box = false; cl.text.bubble = null; return; } cl.text.boxColor = rgbaOf(v, alphaOf(cl.text.boxColor)); cl.text.box = true; cl.text.bubble = cl.text.bubble || 'box'; },
            op: { get: () => alphaOf(clipNow().text.boxColor), set: (cl, v) => { cl.text.boxColor = rgbaOf(cl.text.boxColor || '#000000', v); } } },
          shadow: { color: t => t.shadow ? t.shadow.color : 'none', set: (cl, v) => { cl.text.shadow = v === 'none' ? null : { dx: 0.03, dy: 0.06, blur: 0.08, ...(cl.text.shadow || {}), color: rgbaOf(v, cl.text.shadow ? alphaOf(cl.text.shadow.color) : 0.7) }; },
            size: { label: 'Size', min: 0, max: 0.4, step: 0.01, id: 'textShadowSize', get: t => t.shadow?.blur ?? 0, fmt: v => Math.round(v * 100), set: (cl, v) => { cl.text.shadow = { dx: 0.03, dy: 0.06, color: 'rgba(0,0,0,.7)', ...(cl.text.shadow || {}), blur: v }; } },
            op: { get: () => alphaOf(clipNow().text.shadow?.color), set: (cl, v) => { if (cl.text.shadow) cl.text.shadow.color = rgbaOf(cl.text.shadow.color, v); } } },
        };
        const subEl = chips([['text', 'Text'], ['brand', 'Brand colors'], ['stroke', 'Stroke'], ['glow', 'Glow'], ['bg', 'Background'], ['shadow', 'Shadow'], ['curve', 'Curve'], ['spacing', 'Spacing'], ['format', 'B I U'], ['case', 'Aa']].map(([value, label]) => ({ value, label })), st, v => { st = textSub = v; sub(); }, 'tabs subtabs stsub');
        const box = document.createElement('div'); box.className = 'stbox'; pane.append(subEl, box);
        const BK = 'emma.brandColors', togg = (opts, cur, on) => { const g = document.createElement('div'); g.className = 'toggles fmtrow'; for (const [v, html, lab] of opts) { const b = document.createElement('button'); b.className = 'chipbtn fmt' + ((typeof cur === 'function' ? cur(v) : cur === v) ? ' on' : ''); b.dataset.v = v; b.innerHTML = html; b.title = lab; b.onclick = () => { on(v); sub(); }; g.append(b); } return g; };
        function extra(t) {
          if (st === 'brand') { const L = lsGet(BK, ['#ffffff', '#16161c', '#d4af37', '#f5efe6', '#9e1b32', '#1d2b53']); const row = document.createElement('div'); row.className = 'colrow brandrow';
            const add = document.createElement('label'); add.className = 'rainbow'; add.title = 'Add a brand colour'; const ci = document.createElement('input'); ci.type = 'color'; ci.id = 'brandAdd'; ci.value = hexOf(t.color);
            ci.onchange = () => { const v = ci.value; if (!L.includes(v)) { L.unshift(v); lsSet(BK, L.slice(0, 16)); } sub(); }; add.append(ci);
            row.append(add, swatches(L, hexOf(t.color), v => editSel(cl => { cl.text.color = v; cl.text.fill = null; cl.text.tex = null; })));
            box.append(row, Object.assign(document.createElement('p'), { className: 'hint', textContent: 'Tap + to save your brand colours. Tap a colour to apply it to the text.' })); return true; }
          if (st === 'curve') { box.append(slider('Curve', { min: -1, max: 1, step: 0.01, value: t.curve || 0, fmt: v => Math.round(v * 100) + '%', id: 'textCurve', onInput: v => editSel(cl => { cl.text.curve = Math.abs(v) < 0.02 ? 0 : v; }) })); return true; }
          if (st === 'spacing') {
            box.append(slider('Character', { min: -0.1, max: 0.8, step: 0.01, value: t.track || 0, fmt: v => Math.round(v * 100), id: 'textTrack', onInput: v => editSel(cl => { cl.text.track = Math.abs(v) < .005 ? 0 : v; }) }));
            box.append(slider('Line', { min: 0.7, max: 2, step: 0.01, value: t.lineH || 1, fmt: v => v.toFixed(2), id: 'textLineH', onInput: v => editSel(cl => { cl.text.lineH = v; }) }));
            const A = [['left', '<svg width="20" height="20" viewBox="0 0 20 20"><path d="M3 5h14M3 9h9M3 13h14M3 17h9" stroke="currentColor" stroke-width="2"/></svg>', 'Left'], ['center', '<svg width="20" height="20" viewBox="0 0 20 20"><path d="M3 5h14M6 9h8M3 13h14M6 17h8" stroke="currentColor" stroke-width="2"/></svg>', 'Center'], ['right', '<svg width="20" height="20" viewBox="0 0 20 20"><path d="M3 5h14M8 9h9M3 13h14M8 17h9" stroke="currentColor" stroke-width="2"/></svg>', 'Right'], ['justify', '<svg width="20" height="20" viewBox="0 0 20 20"><path d="M3 5h14M3 9h14M3 13h14M3 17h14" stroke="currentColor" stroke-width="2"/></svg>', 'Justify']];
            box.append(togg(A, t.align || 'center', v => editSel(cl => { cl.text.align = v; }))); return true; }
          if (st === 'format') { box.append(togg([['bold', '<b>B</b>', 'Bold'], ['italic', '<i>I</i>', 'Italic'], ['under', '<u>U</u>', 'Underline']], v => !!t[v], v => editSel(cl => { cl.text[v] = !cl.text[v]; }))); return true; }
          if (st === 'case') { box.append(togg([['title', 'Aa', 'Title case'], ['upper', 'AA', 'Upper case'], ['lower', 'aa', 'Lower case']], t.caseMode || null, v => editSel(cl => { cl.text.caseMode = cl.text.caseMode === v ? null : v; }))); return true; }
          return false; }
        function sub() { box.innerHTML = ''; if (extra(clipNow().text)) return; const d = SUBS[st], t = clipNow().text, cur = d.color(t);
          const row = document.createElement('div'); row.className = 'colrow';
          const eye = document.createElement('button'); eye.className = 'iconbtn eyedrop'; eye.title = 'Pick colour from the video'; eye.textContent = '💧';
          eye.onclick = async () => { if (!window.EyeDropper) { toast('Colour picker not supported here'); return; } try { const r = await new EyeDropper().open(); editSel(cl => d.set(cl, r.sRGBHex)); sub(); } catch (e) {} };
          const rb = document.createElement('label'); rb.className = 'rainbow'; rb.title = 'Any colour'; const ci = document.createElement('input'); ci.type = 'color'; ci.id = 'textColorAny'; ci.value = hexOf(cur === 'none' ? '#ffffff' : cur);
          ci.oninput = () => editSel(cl => d.set(cl, ci.value)); rb.append(ci);
          row.append(eye, rb, swatches([...(st === 'text' ? [] : ['none']), ...COLORS], st === 'text' ? cur : (cur === 'none' ? 'none' : hexOf(cur)), v => { editSel(cl => d.set(cl, v)); }));
          box.append(row);
          if (d.size) box.append(slider(d.size.label, { min: d.size.min, max: d.size.max, step: d.size.step, value: d.size.get(t), fmt: d.size.fmt, id: d.size.id, onInput: v => editSel(cl => d.size.set(cl, v)) }));
          box.append(slider('Opacity', { min: 0, max: 1, step: 0.01, value: d.op.get(), fmt: v => Math.round(v * 100) + '%', id: 'textOp', onInput: v => editSel(cl => d.op.set(cl, v)) }));
          if (st === 'text') {
            /* curve moved to its own sub-tab */
            const al = document.createElement('div'); al.className = 'toggles';
            for (const a of ['left', 'center', 'right']) { const b = document.createElement('button'); b.className = 'chipbtn al' + (t.align === a ? ' on' : ''); b.textContent = a[0].toUpperCase() + a.slice(1); b.onclick = () => { editSel(cl => { cl.text.align = a; }); al.querySelectorAll('.al').forEach(x => x.classList.toggle('on', x === b)); }; al.append(b); }
            box.append(al); }
        }
        sub();
      } else if (textTab === 'font') {
        let cat = 'trending', q = '';
        const bar = document.createElement('div'); bar.className = 'fontbar';
        const sb = document.createElement('button'); sb.className = 'iconbtn'; sb.id = 'fontSearchBtn'; sb.textContent = '🔍';
        const si = document.createElement('input'); si.type = 'search'; si.id = 'fontSearch'; si.placeholder = 'Search fonts'; si.hidden = true;
        sb.onclick = () => { si.hidden = !si.hidden; if (!si.hidden) si.focus(); else { q = ''; si.value = ''; fill(); } };
        si.oninput = () => { q = si.value.trim().toLowerCase(); fill(); };
        const cats = chips(FONT_CATS.map(([value, label]) => ({ value, label })), cat, v => { cat = v; fill(); }, 'tabs fontgroups');
        bar.append(sb, cats); pane.append(bar, si);
        const grid = document.createElement('div'); grid.className = 'fontgrid'; pane.append(grid);
        let fio = null;
        function fill() { grid.innerHTML = ''; const curF = clipNow().text.font;
          const ids = q ? Object.keys(FONTS).filter(k => FONTS[k].name.toLowerCase().includes(q)) : fontOrder(cat) || Object.keys(FONTS).filter(k => fontCat(k, cat));
          for (const k of ids) { const b = document.createElement('button'); b.className = 'fontpill' + (k === curF ? ' on' : ''); b.dataset.v = k; b.dataset.lazy = 1; b.textContent = FONTS[k].name;
            b.onclick = () => { ensureFont(k); editSel(cl => { cl.text.font = k; }); grid.querySelectorAll('.fontpill').forEach(x => x.classList.toggle('on', x === b)); }; grid.append(b); }
          fio && fio.disconnect(); fio = lazyDraw(grid, b => { ensureFont(b.dataset.v); b.style.font = FONTS[b.dataset.v].css.replace('SIZE', '15'); }); }
        fill();
      } else if (textTab === 'style') {
        ensureFont(T.font);
        const keepB = t => ({ box: t.box, bubble: t.bubble, boxColor: t.boxColor, bubbleBorder: t.bubbleBorder });
        const applyFx = (t, e) => { const kb = keepB(t); applyStyle(t, null); if (e) { Object.assign(t, JSON.parse(JSON.stringify(e.s))); t.styleId = e.id; } Object.assign(t, kb); return t; };
        pane.append(artBrowser({ items: EFFECTS, cats: EFFECT_CATS, favKey: 'emma.fxFav2', cur: () => clipNow().text.styleId, cls: 'stylegrid', none: true, ph: 'Search effects',
          mk: e => ({ ...clipNow(), anim: null, text: applyFx({ ...clipNow().text, content: 'ART', curve: 0, size: 170, box: false, bubble: null, deco: null }, e) }),
          pick: e => editSel(cl => { applyFx(cl.text, e); }) }));
      } else if (textTab === 'anim') {
        animSheet('in', pane);
      } else if (textTab === 'bubble') {
        let bc = 'trending'; const holder = document.createElement('div');
        pane.append(chips(BUB_CATS.map(([value, label]) => ({ value, label })), bc, v => { bc = v; fillB(); }, 'tabs bubcats'), holder);
        function fillB() { holder.innerHTML = ''; const g = document.createElement('div'); g.className = 'bubblechips bubgrid'; const curB = clipNow().text.bubbleId || null;
          const list = [{ id: null, name: 'None', word: '', t: { bubble: null } }, ...BUB_DESIGNS.filter(d => bc === 'trending' ? d.trend : d.cat === bc)];
          const shown = list;
          shown.forEach((bb, i) => { const b = document.createElement('button'); b.className = 'chipbtn bubtile' + ((bb.id ?? null) === curB ? ' on' : ''); b.dataset.v = bb.id ?? 'null'; b.dataset.lazy = 1; b.dataset.i = i; b.innerHTML = `<canvas width="${TW}" height="${TH}"></canvas><span>${bb.name}</span>`;
            b.onclick = () => { editSel(cl => { const t = cl.text; if (bb.basic || !bb.id) { t.bubble = bb.id; t.box = !!bb.id; if (bb.id && !t.boxColor) t.boxColor = '#ffffff'; } else { const font = t.font; applyStyle(t, null); Object.assign(t, JSON.parse(JSON.stringify(bb.t))); if (bb.cat !== 'kids') t.font = font; t.box = true; } t.bubbleId = bb.id; }); g.querySelectorAll('.bubtile').forEach(x => x.classList.toggle('on', x === b)); }; g.append(b); });
          requestAnimationFrame(() => lazyDraw(g, b => { const bb = shown[+b.dataset.i], c = clipNow(), t = applyStyle({ ...c.text, content: bb.word || 'Hi!', curve: 0, size: 130, font: 'montserrat', color: '#ffffff' }, null); t.content = bb.word || 'Hi!'; t.size = 130; t.font = bb.t.font || 'montserrat';
            if (bb.basic || !bb.id) Object.assign(t, { bubble: null, box: false, color: '#ffffff' }); else Object.assign(t, JSON.parse(JSON.stringify(bb.t)), { box: true, outline: bb.t.outline || false, glow: bb.t.glow || null, fill: null });
            textTile(b.querySelector('canvas').getContext('2d'), TW, TH, { ...c, anim: null, text: t }); }));
          holder.append(g); }
        fillB();
        const sub = document.createElement('div'); sub.className = 'sub'; sub.innerHTML = '<span class="cl">Bubble colour</span>';
        sub.append(swatches(['#ffffff', '#16161c', '#f5efe6', '#d4af37', '#9e1b32', '#c8102e', '#1d2b53', '#0a84ff', '#2b2f3a', 'rgba(255,255,255,.16)', 'rgba(0,0,0,.55)'], T.boxColor, v => editSel(cl => { cl.text.boxColor = v; if (!cl.text.bubble && !cl.text.box) { cl.text.box = true; cl.text.bubble = 'box'; } })));
        const sub2 = document.createElement('div'); sub2.className = 'sub'; sub2.innerHTML = '<span class="cl">Border</span>';
        sub2.append(swatches(['none', '#000000', '#ffffff', '#1b1b2f', '#e01e37', '#1f7bff'], T.bubbleBorder ? T.bubbleBorder.color : 'none', v => editSel(cl => { cl.text.bubbleBorder = v === 'none' ? null : { color: v, w: 0.07 }; })));
        pane.append(sub, sub2);
      } else if (textTab === 'preset') {
        const PK = 'emma.textPresets', save = document.createElement('button'); save.className = 'chipbtn presetsave'; save.id = 'presetSave'; save.textContent = '+ Save as preset';
        const holder = document.createElement('div'); pane.append(save, holder);
        save.onclick = () => { const c = clipNow(), t = JSON.parse(JSON.stringify(c.text)); delete t.content; const L = lsGet(PK, []); L.unshift({ id: 'p' + Date.now().toString(36), name: 'Preset ' + (L.length + 1), text: t, anim: c.anim ? JSON.parse(JSON.stringify(c.anim)) : null }); lsSet(PK, L); toast('Preset saved'); fillP(); };
        function fillP() { holder.innerHTML = ''; const L = lsGet(PK, []);
          if (!L.length) { holder.append(Object.assign(document.createElement('p'), { className: 'hint presetempty', textContent: 'Add text presets to your space to quickly use them when editing videos.' })); return; }
          holder.append(tileGrid(L, null, pr => ({ ...clipNow(), anim: null, text: { ...pr.text, content: 'Aa', curve: 0, size: 160 } }), pr => { ensureFont(pr.text.font); editSel(cl => { Object.assign(cl.text, JSON.parse(JSON.stringify(pr.text))); if (pr.anim) cl.anim = JSON.parse(JSON.stringify(pr.anim)); else delete cl.anim; }); timeline.render(); }, 'presetgrid')); }
        fillP();
      } else if (textTab === 'title') {
        const tmpl = (t, c) => { const e = t.fx && effectById(t.fx), tx = c.text; applyStyle(tx, null); if (e) Object.assign(tx, JSON.parse(JSON.stringify(e.s))); if (t.s) Object.assign(tx, JSON.parse(JSON.stringify(t.s))); tx.styleId = t.fx || null; tx.font = t.font; tx.size = t.size; tx.curve = 0; tx.deco = t.deco ? { ...t.deco } : null; tx.box = false; tx.bubble = null; tx.track = t.track || 0; tx.sub = t.sub ? { ...t.sub } : null; tx.align = t.align || 'center';
          c.anim = JSON.parse(JSON.stringify(t.anim)); if (!Object.keys(c.anim).length) delete c.anim; c.titleId = t.id; return c; };
        pane.append(artBrowser({ items: TEMPLATES, cats: TEMPLATE_CATS, trending: TRENDING_T, favKey: 'emma.tplFav', cur: () => clipNow().titleId, cls: 'titlegrid', dflt: true, animated: true, ph: 'Search templates',
          mk: t => t.dflt ? { ...clipNow(), anim: null, text: { ...applyStyle({ ...clipNow().text }, null), content: 'Text', curve: 0, size: 160 } } : tmpl(t, { id: 'tile', type: 'text', start: 0, dur: 3, transform: { ...DEFAULT_TRANSFORM }, keyframes: {}, text: { ...clipNow().text, content: t.word || ' ' } }),
          pick: t => { if (t.dflt) { editSel(cl => { applyStyle(cl.text, null); cl.text.curve = 0; delete cl.titleId; delete cl.anim; }); timeline.render(); return; }
            ensureFont(t.font); const typed = ta.value.trim() && !TEMPLATES.some(x => x.word === ta.value) && !TITLES.some(x => x.content === ta.value);
            editSel(cl => { tmpl(t, cl); if (!typed) { cl.text.content = t.word || ' '; delete cl.placeholder; } }); if (!typed) ta.value = clipNow().text.content; timeline.render(); } }));
      }
    };
    show();
    if (textTab === 'edit' && !startTab) setTimeout(() => ta.focus(), 50);
  }, { className: 'tall textsheet' });
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
    btn('capKaraoke', 'karaoke', 'Karaoke', () => karaokeSheet(kCtx()));
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
/** Watermark: on/off, 9 positions (or drag it on the video), size, opacity. Saved in the project and as the default for new projects. */
function wmSheet() {
  openSheet('Watermark', body => {
    const cur = () => wm.wmOf(S.project);
    const setW = ch => { live(p => { p.watermark = { ...wm.wmOf(p), ...ch }; }); wm.setWmGlobal(wm.wmOf(S.project)); player.invalidate(); player.requestDraw(); };
    const onoff = chips([{ value: 'on', label: 'On' }, { value: 'off', label: 'Off (remove)' }], cur().on ? 'on' : 'off', v => { setW({ on: v === 'on' }); }, 'tabs wmonoff');
    const grid = document.createElement('div'); grid.className = 'wmgrid';
    const paint = () => grid.querySelectorAll('button').forEach(b => b.classList.toggle('on', cur().pos === b.dataset.pos));
    for (const p of wm.WM_POS) { const b = document.createElement('button'); b.dataset.pos = p; b.setAttribute('aria-label', 'Watermark position ' + p); b.innerHTML = '<i></i>'; b.onclick = () => { setW({ pos: p, cx: null, cy: null, on: true }); onoff.setActive && onoff.setActive('on'); paint(); }; grid.append(b); }
    paint();
    const hint = Object.assign(document.createElement('p'), { className: 'hint', textContent: 'Tap a spot, or drag the logo on the video to place it anywhere.' });
    const size = slider('Size', { min: .6, max: 1.8, step: .05, value: cur().size, fmt: v => Math.round(v * 100) + '%', onInput: v => setW({ size: v }), id: 'wmSize' });
    const op = slider('Opacity', { min: .3, max: 1, step: .05, value: cur().opacity, fmt: v => Math.round(v * 100) + '%', onInput: v => setW({ opacity: v }), id: 'wmOpacity' });
    const replay = Object.assign(document.createElement('button'), { className: 'btn', textContent: 'Replay intro' }); replay.onclick = () => { player.seek(0); timeline.setTime(0); player.play(); };
    body.append(onoff, grid, hint, size, op, replay);
  }, { className: 'wmsheet' });
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
/* Browser: search + category chips + a grid of preview cards (lib/templates/previews, rendered by
   tools/templates/render_previews.py with the real renderer). Tapping a card opens its detail page: an animated
   preview (4 frames), what it contains, and "Use this template". */
function templatesSheet(pre = {}) {
  let cat = pre.cat || '', q = pre.q || '';
  openSheet('Templates', body => {
    const T0 = templates.TEMPLATES, count = c => T0.filter(T => !c || T.cat === c).length;
    const search = Object.assign(document.createElement('input'), { type: 'search', id: 'tplSearch', className: 'tplsearch', placeholder: `Search ${T0.length} templates (birthday, quiz, ABC…)`, value: q });
    const tabs = chips([{ value: '', label: `All ${T0.length}` }, ...templates.TEMPLATE_CATS.map(([v, l]) => ({ value: v, label: `${l} <small>${count(v)}</small>` }))], cat, v => { cat = v; filter(); }, 'tabs tplcats');
    const grid = document.createElement('div'); grid.className = 'tplgrid'; grid.id = 'tplGrid';
    const empty = Object.assign(document.createElement('p'), { className: 'hint tplempty', id: 'tplEmpty', hidden: true, textContent: 'No template matches. Try another word.' });
    const detail = document.createElement('div'); detail.id = 'tplDetail'; detail.className = 'tpldetail'; detail.hidden = true;
    for (const T of T0) {
      const b = document.createElement('button'); b.className = 'tpl'; b.dataset.id = T.id; b.dataset.cat = T.cat;
      const slots = tplSlots(T);
      b.innerHTML = `<span class="tplpic" style="background-image:url(lib/templates/previews/${T.id}.webp),url(lib/templates/${T.scenes[0].bg}.webp)">${T.beat ? `<em class="tplbeat">${icon('beat', 12)} beat</em>` : ''}<i>${Math.round(templates.templateDur(T))}s</i></span><span class="tplname">${esc(T.name)}</span><span class="tpldesc">${esc(templates.catName(T.cat))} · ${slots} to replace</span>`;
      b.onclick = () => showDetail(T); grid.append(b);
    }
    const filter = () => {
      const ok = new Set(templates.searchTemplates(q, cat).map(T => T.id)); let n = 0;
      grid.querySelectorAll('.tpl').forEach(b => { b.hidden = !ok.has(b.dataset.id); n += !b.hidden; }); empty.hidden = n > 0;
    };
    search.oninput = () => { q = search.value; filter(); };
    const showDetail = T => {
      const slots = templates.placeholdersOf ? templates.placeholdersOf(T) : [];
      detail.innerHTML = `<button class="btn ghost small" id="tplBack">${icon('back', 16)} All templates</button>
        <div class="tplanim" style="background-image:url(lib/templates/previews/${T.id}-s.webp),url(lib/templates/previews/${T.id}.webp)"></div>
        <h3 class="tplh">${esc(T.name)}</h3><p class="tplmeta">${esc(templates.catName(T.cat))} · ${Math.round(templates.templateDur(T))} s${T.beat ? ` · cut on the beat (${T.bpm} BPM)` : ''}</p>
        <p class="tpldesc2">${esc(T.desc)}</p>
        <p class="tplslots"><b>Replace with your own:</b> ${slots.map(esc).join(' · ') || 'pictures'}<br><b>Words to change:</b> ${T.layers.filter(l => l.k === 'text' || l.k === 'caps').length}</p>
        <button class="btn primary big" id="tplUse">${icon('templates', 18)} Use this template</button>`;
      for (const el of [search, tabs, grid, empty, hint]) el.hidden = true; detail.hidden = false; body.scrollTop = 0;
      detail.querySelector('#tplBack').onclick = () => { detail.hidden = true; for (const el of [search, tabs, grid, hint]) el.hidden = false; filter(); };
      detail.querySelector('#tplUse').onclick = () => useTemplate(T);
    };
    const hint = Object.assign(document.createElement('p'), { className: 'hint', textContent: 'A template makes a ready project. Then tap a picture marked “Replace”, and tap Replace me to use your own photo or video. Tap any words to change them.' });
    body.append(search, tabs, grid, empty, detail, hint); filter();
    if (pre.id) { const T = templates.templateById(pre.id); if (T) showDetail(T); }
  }, { className: 'tall', gesture: false });
}
const tplSlots = T => templates.placeholdersOf(T).length;
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
      <button class="btn ghost" id="homeTheme">Home theme</button>
      <button class="btn ghost" id="checkUpd">Check for update</button>
      <p class="hint">Your projects save automatically on this phone, even offline. <span id="storeInfo"></span></p>
      <p class="hint">Tips: tap a clip to edit it · drag its white edges to trim · press and hold a clip, then drag, to move it · pinch the timeline to zoom.</p>
      <p class="hint ver">Version <span id="buildId">…</span></p></div>`;
    $('#newProj').onclick = () => { closeSheet(); showHome(); };
    $('#homeTheme').onclick = () => themeSheet();
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
  if (S.project && S.project.photo) { photomode.photoSheet(phCtx()); return; }   // photo mode saves a picture
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
  $('#kfBtn').onclick = () => { player.pause(); toggleKf(); }; $('#fsBtn').innerHTML = icon('fit'); const jump = t => { player.pause(); timeline.userScrub = false; player.seek(t); timeline.setTime(player.t); showTime(); updateKf(); }; $('#toStart').innerHTML = icon('kfprev', 18); $('#toEnd').innerHTML = icon('kfnext', 18); $('#toStart').onclick = () => jump(0); $('#toEnd').onclick = () => jump(projectDuration(S.project)); $('#fsBtn').onclick = () => { document.body.classList.toggle('fs'); requestAnimationFrame(() => dispatchEvent(new Event('resize'))); }; $('#kfPrev').onclick = () => jumpKf(-1); $('#kfNext').onclick = () => jumpKf(1);
  $('#zoomIn').onclick = () => timeline.zoomBy(1.6); $('#zoomOut').onclick = () => timeline.zoomBy(1 / 1.6);
  $('#addMainBtn').onclick = () => pick('main');
  $('#emptyAdd').onclick = () => pick('main');
  $('#menuBtn').onclick = () => showHome();
  $('#ratioBtn').onclick = ratioSheet;
  $('#exportBtn').onclick = exportView;
  $('#fileMedia').onchange = e => onFiles(e.target.files, pickTarget);
  $('#fileAudio').onchange = e => onFiles(e.target.files, 'audio');
  on('change', () => { $('#ratioBtn').textContent = S.project.aspect; $('#projName').textContent = S.project.name || 'Untitled'; layoutPreview(); });
  $('#ratioBtn').textContent = S.project.aspect; $('#projName').textContent = S.project.name || 'Untitled';
  new ResizeObserver(layoutPreview).observe($('#stage'));
  new ResizeObserver(() => { const s = $('#sheet'); document.documentElement.style.setProperty('--sheet-h', (s.classList.contains('hidden') ? 0 : s.offsetHeight) + 'px'); }).observe($('#sheet'));
  previewGestures(); compareUI();
  addEventListener('keydown', e => {
    if (e.target.matches('input, textarea, select, [contenteditable]')) return;
    if (work.handleKey(e, { doSplit, showTime })) updateKf();
  });

  // drop files on desktop
  addEventListener('dragover', e => e.preventDefault());
  addEventListener('drop', e => { e.preventDefault(); if (e.dataTransfer.files.length) onFiles(e.dataTransfer.files, 'main'); });
}
boot().catch(e => { console.error(e); document.body.insertAdjacentHTML('beforeend', `<div class="fatal">Sorry, the editor could not start: ${e.message}</div>`); });

/* ---------------- loudness: the preview plays at the level of the -14 LUFS export ---------------- */
let loudTimer = 0, loudSeq = 0, loudLast = null;
let loudSig = '';
async function measureLoudness() {
  const p = S.project, seq = ++loudSeq; if (!p) return null;
  const D = projectDuration(p); if (!D || !p.tracks.some(t => t.clips.some(c => hasSource(c)))) { player.setLoud(1); return loudLast = null; }
  // Only re-measure when something that changes the sound changed (adding text / stickers / effects used to
  // re-mix the whole project each time: a 7-min project = hundreds of MB on every edit, which killed the app on phones).
  const AK = ['mediaId', 'in', 'out', 'start', 'speed', 'volume', 'muteAudio', 'fadeIn', 'fadeOut', 'kf', 'vfx', 'eq', 'comp', 'role', 'duck', 'pitch', 'curve'];
  const sig = JSON.stringify([D, p.duck, p.loudness, p.tracks.map(t => t.clips.filter(c => hasSource(c)).map(c => AK.map(k => c[k])))]);
  if (sig === loudSig && loudLast) { player.setLoud(loudOn(p) && isFinite(loudLast.lufs) ? loudLast.gain : 1); return loudLast; }
  const low = (navigator.deviceMemory || 4) <= 4;
  const ex = await import('./export.js'), mix = await ex.mixAudio(p, D, null, { raw: true, sr: low ? 16000 : 24000, keep: !low }); if (seq !== loudSeq) return loudLast;
  loudSig = sig; window.__loudMixes = (window.__loudMixes || 0) + 1;
  // B16: the LUFS maths (seconds of CPU on a 7-min project) runs in a worker, so taps and scrubbing never freeze
  const r = await lufsOffThread(mix, ex); if (seq !== loudSeq) return loudLast; player.setLoud(loudOn(p) && isFinite(r.lufs) ? r.gain : 1); return loudLast = r;
}
let lufsWorker = null, lufsId = 0;
function lufsOffThread(mix, ex) {
  try { if (!lufsWorker) lufsWorker = new Worker(new URL('./audioworker.js', import.meta.url), { type: 'module' }); } catch (e) { return Promise.resolve(ex.loudnessOf(mix)); }
  const ch = [mix.getChannelData(0), mix.getChannelData(Math.min(1, mix.numberOfChannels - 1))].map(c => c.slice()), id = ++lufsId;
  return new Promise(res => { const on = e => { if (e.data.id !== id) return; lufsWorker.removeEventListener('message', on);
      if (e.data.error) { res(ex.loudnessOf(mix)); return; } const L = e.data.lufs, gainDb = isFinite(L) ? Math.max(-24, Math.min(24, -14 - L)) : 0; res({ lufs: L, gainDb, gain: Math.pow(10, gainDb / 20) }); };
    lufsWorker.addEventListener('message', on); lufsWorker.postMessage({ lufs: true, id, ch, sr: mix.sampleRate }, ch.map(c => c.buffer)); });
}
function scheduleLoudness() { clearTimeout(loudTimer); loudTimer = setTimeout(() => measureLoudness().catch(e => console.warn('loudness', e)), 1500); }

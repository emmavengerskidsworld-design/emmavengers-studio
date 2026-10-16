/* Emmavengers Studio — app shell: wires the store, preview player, timeline, toolbars, panels and export. */
import { S, act, live, load, save, on, undo, redo, canUndo, canRedo, select, selected, reset, begin, end } from './store.js';
import { newClip, addToMain, addToKind, split, remove, duplicate, setSpeed, projectDuration, clipDur, clipEnd, hasSource, find, ASPECTS, mediaIds } from './project.js';
import { media, importFile, loadAll, onMediaUpdate, kindOf } from './media.js';
import { Player } from './player.js';
import { Timeline, fmtS } from './timeline.js';
import { openSheet, closeSheet, sheetOpen, slider, chips, swatches } from './panels.js';
import { FILTERS, FONTS, COLORS, BG_COLORS, SPEED_PRESETS, KEYFRAME_PROPS, DEFAULT_TRANSFORM, TRACK_KINDS } from './registry.js';
import { exportVideo, outputSize, pickCodecs, recorderMime, planBitrate, qualityFloor } from './export.js';
import { hitTest } from './render.js';
import { icon } from './icons.js';

const $ = s => document.querySelector(s);
const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return String(m).padStart(2, '0') + ':' + s.toFixed(1).padStart(4, '0'); };
let player, timeline;

/* ---------------- boot ---------------- */
async function boot() {
  for (const [id, n] of [['menuBtn', 'menu'], ['undoBtn', 'undo'], ['redoBtn', 'redo'], ['zoomIn', 'zoomin'], ['zoomOut', 'zoomout']]) $('#' + id).innerHTML = icon(n);
  $('#addMainBtn').innerHTML = icon('plus', 26);
  $('#exportBtn').innerHTML = icon('export', 18) + '<span>Export</span>';
  await load();
  await loadAll(mediaIds(S.project));
  player = new Player($('#preview'), { getProject: () => S.project, selected: () => S.sel, onTime: t => { timeline.setTime(t); showTime(); }, onState: setPlayIcon });
  timeline = new Timeline({ getTime: () => player.t, seek: t => { player.seek(t); showTime(); }, isPlaying: () => player.playing, pause: () => player.pause(), onAdd: k => pick(k), afterEdit: afterEdit });
  on('change', () => { timeline.render(); player.seek(player.t); showTime(); refreshToolbar(); updateEmpty(); });
  on('select', () => { document.body.classList.toggle('has-sel', !!S.sel); timeline.render(); refreshToolbar(); player.requestDraw(); if (sheetOpen()) closeSheet(); });
  on('history', updateUndo);
  onMediaUpdate(() => { timeline.render(); player.requestDraw(); });
  wireUI(); layoutPreview(); timeline.fitZoom(); timeline.render(); refreshToolbar(); updateUndo(); updateEmpty(); showTime(); setPlayIcon(false);
  player.seek(0);
  window.studio = { S, player, timeline, media, act, select, find, projectDuration, exportVideo, pickCodecs, recorderMime, save, ready: true };
  document.body.classList.add('ready');
}
function afterEdit() { player.seek(Math.min(player.t, projectDuration(S.project))); showTime(); refreshToolbar(); }
function showTime() { $('#tcur').textContent = fmt(player.t); $('#ttot').textContent = fmt(projectDuration(S.project)); }
function setPlayIcon(pl) { $('#playBtn').innerHTML = icon(pl ? 'pause' : 'play', 26); $('#playBtn').setAttribute('aria-label', pl ? 'Pause' : 'Play'); }
function updateUndo() { $('#undoBtn').disabled = !canUndo(); $('#redoBtn').disabled = !canRedo(); }
function updateEmpty() { const empty = !S.project.tracks.some(t => t.clips.length); $('#empty').hidden = !empty; $('#exportBtn').disabled = empty; }
export function toast(msg, ms = 2200) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), ms); }

/* ---------------- preview canvas ---------------- */
function layoutPreview() {
  const stage = $('#stage'), cv = $('#preview'), [a, b] = ASPECTS[S.project.aspect];
  const W = stage.clientWidth - 16, H = stage.clientHeight - 12; if (W <= 0 || H <= 0) return;
  let w = W, h = W * b / a; if (h > H) { h = H; w = H * a / b; }
  cv.style.width = Math.round(w) + 'px'; cv.style.height = Math.round(h) + 'px';
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
      const pos = toCanvas(e), hit = hitTest(player.boxes, pos.x, pos.y);
      tap = { x: e.clientX, y: e.clientY, hit: hit && hit.id };
      const f = S.sel && find(S.project, S.sel);
      const id = f && player.boxes.some(b => b.id === S.sel) ? S.sel : hit && hit.id;
      if (id) { const ff = find(S.project, id); g = { id, x0: e.clientX, y0: e.clientY, tr: { ...ff.clip.transform }, r: pos.r, started: false }; }
    } else if (pts.size === 2 && g) {
      const [a, b] = [...pts.values()]; g.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), ang: Math.atan2(b.y - a.y, b.x - a.x), tr: { ...find(S.project, g.id).clip.transform } };
    }
  });
  cv.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!g) return;
    if (!g.started && Math.hypot(e.clientX - g.x0, e.clientY - g.y0) < 4 && pts.size < 2) return;
    if (!g.started) { g.started = true; begin(); if (S.sel !== g.id) select(g.id); }
    live(p => { const c = find(p, g.id)?.clip; if (!c) return;
      if (pts.size >= 2 && g.pinch) { const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), ang = Math.atan2(b.y - a.y, b.x - a.x);
        c.transform.scale = Math.max(0.05, Math.min(8, g.pinch.tr.scale * d / g.pinch.d));
        let rot = g.pinch.tr.rotation + (ang - g.pinch.ang) * 180 / Math.PI; for (const s of [-180, -90, 0, 90, 180]) if (Math.abs(rot - s) < 3) rot = s; c.transform.rotation = Math.round(rot * 10) / 10;
      } else if (pts.size === 1) {
        let x = g.tr.x + (e.clientX - g.x0) / g.r.width, y = g.tr.y + (e.clientY - g.y0) / g.r.height;
        if (Math.abs(x - .5) < .015) x = .5; if (Math.abs(y - .5) < .015) y = .5;
        c.transform.x = Math.round(x * 1000) / 1000; c.transform.y = Math.round(y * 1000) / 1000;
      } });
  });
  const upH = e => {
    pts.delete(e.pointerId);
    if (pts.size === 0) {
      if (g && g.started) end();
      else if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) < 6) select(tap.hit || null);
      g = null; tap = null;
    } else if (g) { const ff = find(S.project, g.id); const [p0] = [...pts.values()]; g.x0 = p0.x; g.y0 = p0.y; g.tr = { ...ff.clip.transform }; g.pinch = null; }
  };
  cv.addEventListener('pointerup', upH); cv.addEventListener('pointercancel', upH);
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
const isVisualClip = c => c.type !== 'audio';
const ROOT_TOOLS = [
  { id: 'media', icon: 'media', label: 'Media', run: () => pick('main') },
  { id: 'audio', icon: 'music', label: 'Audio', run: () => pick('audio') },
  { id: 'text', icon: 'text', label: 'Text', run: addText },
  { id: 'overlay', icon: 'overlay', label: 'Overlay', run: () => pick('overlay') },
  { id: 'split', icon: 'split', label: 'Split', run: doSplit },
  { id: 'ratio', icon: 'ratio', label: 'Ratio', run: ratioSheet },
  { id: 'bg', icon: 'bg', label: 'Background', run: bgSheet },
];
const CLIP_TOOLS = [
  { id: 'split', icon: 'split', label: 'Split', run: doSplit },
  { id: 'edit', icon: 'edit', label: 'Edit text', when: c => c.type === 'text', run: textSheet },
  { id: 'speed', icon: 'speed', label: 'Speed', when: hasSource, run: speedSheet },
  { id: 'volume', icon: 'volume', label: 'Volume', when: hasSource, run: volumeSheet },
  { id: 'duration', icon: 'clock', label: 'Duration', when: c => !hasSource(c), run: durationSheet },
  { id: 'adjust', icon: 'adjust', label: 'Adjust', when: isVisualClip, run: adjustSheet },
  { id: 'filters', icon: 'filter', label: 'Filters', when: c => c.type === 'video' || c.type === 'image', run: filterSheet },
  { id: 'fit', icon: 'fit', label: 'Fit / Fill', when: c => c.type === 'video' || c.type === 'image', run: toggleFit },
  { id: 'duplicate', icon: 'copy', label: 'Duplicate', run: () => { const b = act(p => duplicate(p, S.sel)); b && select(b.id); } },
  { id: 'delete', icon: 'trash', label: 'Delete', run: () => { const id = S.sel; select(null); act(p => remove(p, id)); player.gc(); } },
];
function refreshToolbar() {
  const bar = $('#toolbar'), f = selected();
  const tools = f ? CLIP_TOOLS.filter(t => !t.when || t.when(f.clip)) : ROOT_TOOLS;
  const key = (f ? f.clip.type + ':' : 'root:') + tools.map(t => t.id).join(',');
  if (bar.dataset.key === key) return; bar.dataset.key = key;
  bar.innerHTML = (f ? `<button class="tool back" data-tool="back">${icon('back')}<span>Back</span></button>` : '') +
    tools.map(t => `<button class="tool" data-tool="${t.id}">${icon(t.icon)}<span>${t.label}</span></button>`).join('');
  bar.onclick = e => { const b = e.target.closest('.tool'); if (!b) return; if (b.dataset.tool === 'back') { select(null); return; }
    const t = tools.find(x => x.id === b.dataset.tool); if (player.playing) player.pause(); t && t.run(); };
}
function doSplit() {
  const t = player.t; let f = selected();
  if (!f || !(f.clip.start < t && t < clipEnd(f.clip))) { const main = S.project.tracks.find(x => x.kind === 'main'); const c = main.clips.find(c => c.start < t && t < clipEnd(c)); f = c && find(S.project, c.id); }
  if (!f) { toast('Move the white line onto a clip to split it'); return; }
  const b = act(p => split(p, f.clip.id, t)); if (!b) toast('Too close to the edge to split'); else select(b.id);
}
function addText() {
  const c = newClip('text', { dur: 3, transform: { ...DEFAULT_TRANSFORM, y: 0.5 } });
  act(p => addToKind(p, 'text', c, Math.min(player.t, Math.max(0, projectDuration(p) - 0.1))));
  select(c.id); textSheet();
}
function toggleFit() { const f = selected(); act(p => { const c = find(p, f.clip.id).clip; c.fit = c.fit === 'cover' ? 'contain' : 'cover'; }); toast(selected().clip.fit === 'cover' ? 'Fill: covers the whole frame' : 'Fit: shows the whole picture'); }

/* ---------------- panels ---------------- */
const editSel = fn => live(p => { const f = find(p, S.sel); f && fn(f.clip, p); });
function speedSheet() {
  const c = selected().clip, toU = s => Math.log(s / 0.25) / Math.log(16), toS = u => Math.round(0.25 * Math.pow(16, u) * 100) / 100;
  openSheet('Speed', body => {
    const info = document.createElement('p'); info.className = 'hint';
    const upd = () => { const cc = selected().clip; info.textContent = `Clip length: ${fmtS(clipDur(cc))} (original ${fmtS(cc.out - cc.in)})`; };
    const sl = slider('Speed', { min: 0, max: 1, step: 0.001, value: toU(c.speed), fmt: u => toS(u).toFixed(2).replace(/0$/, '') + 'x', id: 'speedRange', onInput: u => { editSel((cl, p) => setSpeed(p, cl.id, toS(u))); ch.setActive(toS(u)); upd(); } });
    const ch = chips(SPEED_PRESETS.map(v => ({ value: v, label: v + 'x' })), c.speed, v => { editSel((cl, p) => setSpeed(p, cl.id, v)); sl.set(toU(v)); upd(); });
    body.append(sl, ch, info); upd();
  });
}
function volumeSheet() {
  const c = selected().clip;
  openSheet('Volume', body => {
    body.append(slider('Volume', { min: 0, max: 2, step: 0.01, value: c.volume ?? 1, fmt: v => Math.round(v * 100) + '%', id: 'volRange', onInput: v => editSel(cl => { cl.volume = v; }) }));
    body.append(chips([{ value: 0, label: 'Mute' }, { value: 0.5, label: '50%' }, { value: 1, label: '100%' }, { value: 1.5, label: '150%' }, { value: 2, label: '200%' }], c.volume, v => { editSel(cl => { cl.volume = v; }); body.querySelector('label.ctl').set(v); }));
  });
}
function durationSheet() {
  const c = selected().clip;
  openSheet('Duration', body => body.append(slider('Duration', { min: 0.5, max: 30, step: 0.1, value: c.dur, fmt: v => v.toFixed(1) + 's', id: 'durRange', onInput: v => editSel(cl => { cl.dur = v; }) })));
}
function adjustSheet() {
  const c = selected().clip;
  openSheet('Adjust', body => {
    const sls = {};
    for (const [k, d] of Object.entries(KEYFRAME_PROPS)) body.append(sls[k] = slider(d.label, { min: d.min, max: d.max, step: d.step, value: c.transform[k], fmt: d.fmt, onInput: v => editSel(cl => { cl.transform[k] = v; }) }));
    const r = document.createElement('button'); r.className = 'btn ghost'; r.textContent = 'Reset';
    r.onclick = () => { const def = c.type === 'video' || c.type === 'image' ? (find(S.project, c.id).track.kind === 'overlay' ? { ...DEFAULT_TRANSFORM, scale: .55 } : DEFAULT_TRANSFORM) : DEFAULT_TRANSFORM; editSel(cl => { cl.transform = { ...def }; }); for (const k in sls) sls[k].set(def[k]); };
    const tip = document.createElement('p'); tip.className = 'hint'; tip.textContent = 'Tip: drag on the picture to move it, pinch with two fingers to resize and turn it.';
    body.append(r, tip);
  });
}
function filterSheet() {
  const c = selected().clip;
  openSheet('Filters', body => {
    const amt = slider('Strength', { min: 0, max: 1, step: 0.01, value: c.filter?.amount ?? 1, fmt: v => Math.round(v * 100) + '%', onInput: v => editSel(cl => { if (cl.filter) cl.filter.amount = v; }) });
    body.append(chips(FILTERS.map(f => ({ value: f.id, label: f.name })), c.filter?.id ?? null, id => editSel(cl => { cl.filter = id ? { id, amount: cl.filter?.amount ?? 1 } : null; })), amt);
  });
}
function textSheet() {
  const c = selected().clip, T = c.text;
  openSheet('Text', body => {
    const ta = document.createElement('textarea'); ta.id = 'textInput'; ta.rows = 2; ta.value = T.content === 'Your text' ? '' : T.content; ta.placeholder = 'Type your text';
    ta.oninput = () => editSel(cl => { cl.text.content = ta.value || ' '; }); body.append(ta);
    body.append(chips(Object.entries(FONTS).map(([k, f]) => ({ value: k, html: `<span style="font:${f.css.replace('SIZE', '15')}">${f.name}</span>` })), T.font, v => editSel(cl => { cl.text.font = v; })));
    body.append(swatches(COLORS, T.color, v => editSel(cl => { cl.text.color = v; })));
    body.append(slider('Size', { min: 24, max: 260, step: 1, value: T.size, fmt: v => Math.round(v), id: 'textSize', onInput: v => editSel(cl => { cl.text.size = v; }) }));
    const row = document.createElement('div'); row.className = 'toggles';
    const tog = (label, key) => { const b = document.createElement('button'); b.className = 'chipbtn' + (T[key] ? ' on' : ''); b.textContent = label; b.onclick = () => { editSel(cl => { cl.text[key] = !cl.text[key]; }); b.classList.toggle('on', selected().clip.text[key]); }; return b; };
    row.append(tog('Outline', 'outline'), tog('Background', 'box'));
    for (const a of ['left', 'center', 'right']) { const b = document.createElement('button'); b.className = 'chipbtn al' + (T.align === a ? ' on' : ''); b.textContent = a[0].toUpperCase() + a.slice(1); b.onclick = () => { editSel(cl => { cl.text.align = a; }); row.querySelectorAll('.al').forEach(x => x.classList.toggle('on', x === b)); }; row.append(b); }
    body.append(row);
    const sub = document.createElement('div'); sub.className = 'sub'; sub.innerHTML = '<span class="cl">Outline / background colour</span>';
    sub.append(swatches(['#000000', '#ffffff', '#ffcc33', '#1b1b2f', '#ff4d4d', '#1fb6ff'], T.outlineColor, v => editSel(cl => { cl.text.outlineColor = v; cl.text.boxColor = v; })));
    body.append(sub);
    setTimeout(() => ta.focus(), 50);
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
function bgSheet() { openSheet('Background colour', body => body.append(swatches(BG_COLORS, S.project.bg, v => live(p => { p.bg = v; })))); }
function menuSheet() {
  openSheet('Emmavengers Studio', async body => {
    body.innerHTML = `<div class="menu">
      <button class="btn" id="newProj">${icon('plus', 18)} New project</button>
      <button class="btn ghost" id="checkUpd">Check for update</button>
      <p class="hint">Your project saves automatically on this phone, even offline. <span id="storeInfo"></span></p>
      <p class="hint">Tips: tap a clip to edit it · drag its white edges to trim · press and hold a clip, then drag, to move it · pinch the timeline to zoom.</p>
      <p class="hint ver">Version <span id="buildId">…</span></p></div>`;
    $('#newProj').onclick = async () => { if (!confirm('Start a new project? This one will be deleted.')) return; closeSheet(); player.pause(); await reset(); await loadAll(new Set()); player.gc(); timeline.render(); showTime(); toast('New project'); };
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
  let short = +(localStorage.getItem('studio.res') || 1080), fps = +(localStorage.getItem('studio.fps') || 30), ctrl = null, result = null, small = null;
  const D = projectDuration(S.project), shareOK = canShareVideo();
  // Fit under the share limit up front when that still gives good quality (most short kids' videos).
  const plan = () => { const { W, H } = outputSize(S.project.aspect, short); const fit = planBitrate(W, H, fps, D, SHARE_LIMIT());
    return { W, H, maxBytes: shareOK && fit >= qualityFloor(W, H) ? SHARE_LIMIT() : null }; };
  v.innerHTML = `<div class="ex">
    <div class="ex-head"><button class="ib" id="exClose" aria-label="Close">${icon('x')}</button><b>Export video</b><span></span></div>
    <div class="ex-body">
      <div class="ex-set" id="exSet">
        <div class="ex-row"><span class="cl">Resolution</span><div id="exRes"></div></div>
        <div class="ex-row"><span class="cl">Frame rate</span><div id="exFps"></div></div>
        <p class="ex-info" id="exInfo"></p>
        <button class="btn primary big" id="exGo">${icon('export', 20)} Export</button>
        <p class="hint">Keep this screen open while it exports.</p>
      </div>
      <div class="ex-prog" id="exProg" hidden><div class="ring"><b id="exPct">0%</b></div><div class="bar"><i id="exBar"></i></div><p id="exStatus">Preparing…</p><button class="btn ghost" id="exCancel">Cancel</button></div>
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
  const info = async () => { const { W, H, maxBytes } = plan(); const vbr = planBitrate(W, H, fps, D, maxBytes); const c = await pickCodecs(W, H, fps, vbr);
    const mb = (vbr + 192000) * D / 8 / 1e6;
    $('#exInfo').textContent = `${W} × ${H} · ${fmt(D)} · ${c ? 'MP4 (' + (c.video.mux === 'avc' ? 'H.264' : c.video.mux.toUpperCase()) + ')' : (recorderMime() || 'not supported').split(';')[0].replace('video/', '').toUpperCase() + ' (real-time)'} · about ${mb < 1 ? mb.toFixed(1) : Math.round(mb)} MB`; };
  $('#exRes').append(chips([{ value: 720, label: '720p' }, { value: 1080, label: '1080p' }], short, x => { short = x; localStorage.setItem('studio.res', x); info(); }));
  $('#exFps').append(chips([{ value: 24, label: '24' }, { value: 30, label: '30' }, { value: 60, label: '60' }], fps, x => { fps = x; localStorage.setItem('studio.fps', x); info(); }));
  info();
  const close = () => { if (ctrl) ctrl.aborted = true; if (result) URL.revokeObjectURL(result.url); if (small) URL.revokeObjectURL(small.url); v.hidden = true; v.innerHTML = ''; document.body.classList.remove('exporting'); layoutPreview(); player.seek(player.t); };
  $('#exClose').onclick = close;
  const msg = (html, kind = 'ok') => { const m = $('#exMsg'); m.className = 'ex-msg ' + kind; m.innerHTML = html; m.hidden = false; };
  const run = async (maxBytes, label) => {
    $('#exSet').hidden = true; $('#exDone').hidden = true; $('#exProg').hidden = false; ctrl = { aborted: false };
    $('#exCancel').textContent = 'Cancel'; $('#exCancel').onclick = () => { ctrl.aborted = true; $('#exStatus').textContent = 'Cancelling…'; };
    let lock = null; try { lock = await navigator.wakeLock?.request('screen'); } catch (e) {}
    try {
      await save();
      const mode = new URLSearchParams(location.search).get('export');
      const r = await exportVideo(S.project, { short, fps, signal: ctrl, mode, maxBytes, onProgress: pr => {
        const pct = Math.floor(pr.p * 100); $('#exPct').textContent = pct + '%'; $('#exBar').style.width = pct + '%';
        $('#exStatus').textContent = (label ? label + ' · ' : '') + (pr.phase === 'audio' ? 'Mixing sound…' : pr.phase === 'finishing' ? 'Finishing…' : pr.eta != null ? `About ${Math.max(1, Math.round(pr.eta))} s left` : 'Exporting…'); } });
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
  $('#exGo').onclick = async () => {
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
  $('#zoomIn').onclick = () => timeline.zoomBy(1.6); $('#zoomOut').onclick = () => timeline.zoomBy(1 / 1.6);
  $('#addMainBtn').onclick = () => pick('main');
  $('#emptyAdd').onclick = () => pick('main');
  $('#menuBtn').onclick = menuSheet;
  $('#ratioBtn').onclick = ratioSheet;
  $('#exportBtn').onclick = exportView;
  $('#fileMedia').onchange = e => onFiles(e.target.files, pickTarget);
  $('#fileAudio').onchange = e => onFiles(e.target.files, 'audio');
  on('change', () => { $('#ratioBtn').textContent = S.project.aspect; layoutPreview(); });
  $('#ratioBtn').textContent = S.project.aspect;
  new ResizeObserver(layoutPreview).observe($('#stage'));
  previewGestures();
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

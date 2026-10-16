/* Media library: import from device, metadata, timeline thumbnails and audio waveforms (all cached in IndexedDB). */
import * as db from './db.js';
import { uid } from './project.js';

export const media = new Map();          // id -> record (runtime, with url/bitmap)
const listeners = new Set();
export const onMediaUpdate = f => listeners.add(f);
const emit = rec => listeners.forEach(f => f(rec));
const MAX_IMG = 2048;                    // decoded image long side (keeps phone memory low; export is ≤1080p)
export const TILE = 56;                  // timeline thumbnail tile size (px)

export function kindOf(file) {
  const t = file.type || '', n = (file.name || '').toLowerCase();
  if (t.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv|3gp)$/.test(n)) return 'video';
  if (t.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|heic|avif)$/.test(n)) return 'image';
  if (t.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|amr)$/.test(n)) return 'audio';
  return null;
}

/** Import a File: store the original blob, read metadata, then build thumbs/waveform in the background. */
export async function importFile(file) {
  const type = kindOf(file); if (!type) throw new Error('Unsupported file: ' + file.name);
  const rec = { id: 'm_' + uid(), name: file.name || type, type, mime: file.type, size: file.size, added: Date.now(), blob: file };
  await hydrate(rec);
  if (type === 'video' && !(rec.duration > 0)) throw new Error('Could not read this video: ' + rec.name);
  await db.put('media', strip(rec));
  media.set(rec.id, rec);
  background(rec);
  return rec;
}
const strip = r => { const { url, bitmap, thumbBitmap, audioBuffer, _bmp, ...keep } = r; return keep; };
export const save = rec => db.put('media', strip(rec));

/** Create runtime objects (object URL, decoded image) and read metadata if missing. */
async function hydrate(rec) {
  rec.url = URL.createObjectURL(rec.blob);
  if (rec.type === 'image') { if (!rec.width) { await loadBitmap(rec); } }
  else if (rec.duration == null) {
    const el = document.createElement(rec.type === 'video' ? 'video' : 'audio');
    el.preload = 'metadata'; el.muted = true; el.src = rec.url;
    await once(el, 'loadedmetadata', 15000);
    if (el.duration === Infinity) { el.currentTime = 1e7; await once(el, 'durationchange', 5000).catch(() => {}); }
    rec.duration = isFinite(el.duration) ? el.duration : 0;
    if (rec.type === 'video') { rec.width = el.videoWidth; rec.height = el.videoHeight; }
    el.removeAttribute('src'); el.load();
  }
  if (rec.thumbBlob && !rec.thumbBitmap) rec.thumbBitmap = await createImageBitmap(rec.thumbBlob).catch(() => null);
}
/* Decoded photos are big (a 2048px photo = 16 MB), so only the most recently used ones stay decoded. */
const BITMAP_LRU = 14, lru = [];
export async function loadBitmap(rec) {
  if (rec.bitmap) { touch(rec); return rec.bitmap; }
  if (rec._bmp) return rec._bmp;
  return rec._bmp = (async () => {
    let bm = await createImageBitmap(rec.blob);
    rec.width = bm.width; rec.height = bm.height;
    const k = Math.min(1, MAX_IMG / Math.max(bm.width, bm.height));
    if (k < 1) { bm.close(); bm = await createImageBitmap(rec.blob, { resizeWidth: Math.round(rec.width * k), resizeHeight: Math.round(rec.height * k), resizeQuality: 'high' }); }
    rec.bitmap = bm; touch(rec);
    while (lru.length > BITMAP_LRU) { const old = lru.shift(); if (old.bitmap) { old.bitmap.close(); old.bitmap = null; } }
    return bm;
  })().finally(() => { rec._bmp = null; });
}
function touch(rec) { const i = lru.indexOf(rec); if (i >= 0) lru.splice(i, 1); lru.push(rec); }
/** Synchronous access for drawing: returns the decoded photo, or null while it loads (calls onReady when done). */
export function bitmapOf(rec, onReady) {
  if (rec.bitmap) { touch(rec); return rec.bitmap; }
  loadBitmap(rec).then(() => onReady && onReady(), () => {});
  return null;
}
export const once = (el, ev, ms = 8000) => new Promise((res, rej) => {
  const to = setTimeout(() => { cleanup(); rej(new Error(ev + ' timeout')); }, ms);
  const ok = () => { cleanup(); res(); }, bad = () => { cleanup(); rej(el.error || new Error('media error')); };
  const cleanup = () => { clearTimeout(to); el.removeEventListener(ev, ok); el.removeEventListener('error', bad); };
  el.addEventListener(ev, ok); el.addEventListener('error', bad);
});

/** Load every stored media record (on app start). Only ids in `keep` are loaded; others are deleted. */
export async function loadAll(keep) {
  for (const rec of await db.all('media')) {
    if (!keep.has(rec.id)) { db.del('media', rec.id); continue; }
    try { await hydrate(rec); media.set(rec.id, rec); background(rec); } catch (e) { console.warn('media load failed', rec.name, e); }
  }
}

/* ---------- background: thumbnails + waveform ---------- */
let queue = Promise.resolve();
function background(rec) {
  queue = queue.then(async () => {
    try {
      if (rec.type === 'video' && !rec.thumbBlob) await makeFilmstrip(rec);
      if (rec.type === 'image' && !rec.thumbBlob) await makeImageThumb(rec);
      if ((rec.type === 'audio' || rec.type === 'video') && rec.peaks === undefined) await makePeaks(rec);
    } catch (e) { console.warn('background media job', rec.name, e); }
    emit(rec);
  });
}
export const idle = () => queue;
const tileCanvas = n => { const c = document.createElement('canvas'); c.width = TILE * n; c.height = TILE; return c; };
function drawCover(ctx, src, sw, sh, x, y, w, h) { const k = Math.max(w / sw, h / sh), dw = sw * k, dh = sh * k; ctx.drawImage(src, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); }
async function finishThumb(rec, c) {
  rec.thumbBlob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.75));
  rec.thumbBitmap = await createImageBitmap(rec.thumbBlob); await save(rec);
}
async function makeImageThumb(rec) { await loadBitmap(rec); const c = tileCanvas(1); drawCover(c.getContext('2d'), rec.bitmap, rec.bitmap.width, rec.bitmap.height, 0, 0, TILE, TILE); rec.thumbN = 1; await finishThumb(rec, c); }
async function makeFilmstrip(rec) {
  const n = Math.max(2, Math.min(40, Math.ceil(rec.duration)));
  const el = document.createElement('video'); el.muted = true; el.playsInline = true; el.preload = 'auto'; el.src = rec.url;
  await once(el, 'loadeddata', 15000);
  const c = tileCanvas(n), ctx = c.getContext('2d'); ctx.fillStyle = '#222'; ctx.fillRect(0, 0, c.width, c.height);
  for (let i = 0; i < n; i++) {
    el.currentTime = Math.min(rec.duration - 0.05, (i + 0.5) * rec.duration / n);
    try { await once(el, 'seeked', 4000); } catch (e) { continue; }
    drawCover(ctx, el, el.videoWidth, el.videoHeight, i * TILE, 0, TILE, TILE);
  }
  el.removeAttribute('src'); el.load();
  rec.thumbN = n; await finishThumb(rec, c);
}
export const PEAK_RATE = 50; // peaks per second
async function makePeaks(rec) {
  if (rec.size > 400e6) { rec.peaks = null; rec.hasAudio = true; await save(rec); return; }
  const buf = await decodeAudio(rec, false);
  if (!buf) { rec.peaks = null; rec.hasAudio = false; await save(rec); return; }
  const n = Math.max(1, Math.ceil(buf.duration * PEAK_RATE)), step = buf.length / n, out = new Float32Array(n);
  const chans = [...Array(buf.numberOfChannels)].map((_, i) => buf.getChannelData(i));
  for (let i = 0; i < n; i++) { let m = 0; const a = Math.floor(i * step), b = Math.min(buf.length, Math.floor((i + 1) * step));
    for (const ch of chans) for (let j = a; j < b; j += 4) { const v = Math.abs(ch[j]); if (v > m) m = v; } out[i] = m; }
  rec.peaks = out; rec.hasAudio = true; await save(rec);
}
/** Decode the audio of a media file (for waveform and export mixing). Returns null when the file has no audio. */
const audioCache = new Map();
export async function decodeAudio(rec, keep = true) {
  if (audioCache.has(rec.id)) return audioCache.get(rec.id);
  let buf = null;
  try { const ac = new OfflineAudioContext(2, 48000, 48000); buf = await ac.decodeAudioData(await rec.blob.arrayBuffer()); } catch (e) { buf = null; }
  if (keep) audioCache.set(rec.id, buf);
  return buf;
}
export const dropAudioCache = () => audioCache.clear();

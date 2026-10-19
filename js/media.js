/* Media library: import from device, metadata, timeline thumbnails and audio waveforms (all cached in IndexedDB). */
import * as db from './db.js';
import { uid } from './project.js';

export const media = new Map();          // id -> record (runtime, with url/bitmap)
const listeners = new Set();
export const onMediaUpdate = f => listeners.add(f);
const emit = rec => listeners.forEach(f => f(rec));
const MAX_IMG = 3840;                    // decoded image long side (sharp up to 4K exports, still bounded for phone memory)
export const TILE = 56;                  // timeline thumbnail tile size (px)

export function kindOf(file) {
  const t = file.type || '', n = (file.name || '').toLowerCase();
  if (t.startsWith('video/') || /\.(mp4|mov|m4v|webm|mkv|3gp)$/.test(n)) return 'video';
  if (t.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|heic|avif)$/.test(n)) return 'image';
  if (t.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|oga|opus|flac|amr)$/.test(n)) return 'audio';
  return null;
}

/** Content id of a file: SHA-256 of the bytes (files over 256 MB: size + first and last 4 MB), so the same photo or
    video added to several projects is stored once. */
const HASH_FULL = 256 * 1024 * 1024, HASH_PART = 4 * 1024 * 1024;
export async function hashBlob(blob) {
  const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
  if (!crypto.subtle) return 'n:' + blob.size + ':' + (blob.name || '');
  if (blob.size <= HASH_FULL) return 's:' + hex(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
  const parts = await new Blob([blob.slice(0, HASH_PART), blob.slice(blob.size - HASH_PART)]).arrayBuffer();
  return 'p:' + blob.size + ':' + hex(await crypto.subtle.digest('SHA-256', parts));
}
/** Import a File: store the original blob, read metadata, then build thumbs/waveform in the background.
    The same bytes already stored (in any project) are re-used instead of stored twice. opts.id: keep this id when it is free (backup restore). */
export async function importFile(file, opts = {}) {
  const type = kindOf(file); if (!type) throw new Error('Unsupported file: ' + file.name);
  const hash = await hashBlob(file).catch(() => null);
  if (hash) { const old = await db.byHash(hash).catch(() => null); if (old && old.type === type) return media.get(old.id) || await hydrateStored(old); }
  const id = opts.id && !media.has(opts.id) && !(await db.get('media', opts.id)) ? opts.id : 'm_' + uid();
  const rec = { id, name: opts.name || file.name || type, type, mime: file.type, size: file.size, added: opts.added || Date.now(), blob: file, hash };
  await hydrate(rec);
  if (type === 'video' && !(rec.duration > 0)) throw new Error('Could not read this video: ' + rec.name);
  await db.put('media', strip(rec));
  media.set(rec.id, rec);
  background(rec);
  return rec;
}
async function hydrateStored(rec) { await hydrate(rec); media.set(rec.id, rec); background(rec); return rec; }
const strip = r => { const { url, bitmap, thumbBitmap, audioBuffer, _bmp, proxy, ...keep } = r; return keep; };
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

/** Make exactly these media ids available (the open project): loads the missing ones from storage and lets go of
    the others (they stay stored for the other projects). */
export async function useMedia(keep) {
  for (const [id, r] of [...media]) if (!keep.has(id)) unload(r);
  for (const id of keep) {
    if (media.has(id)) continue;
    const rec = await db.get('media', id); if (!rec) { console.warn('media missing', id); continue; }
    try { await hydrateStored(rec); } catch (e) { console.warn('media load failed', rec.name, e); }
  }
}
function unload(r) { try { r.url && URL.revokeObjectURL(r.url); } catch (e) {} try { r.bitmap && r.bitmap.close(); r.thumbBitmap && r.thumbBitmap.close(); } catch (e) {} const i = lru.indexOf(r); if (i >= 0) lru.splice(i, 1); media.delete(r.id); }
export const loadAll = useMedia;   // older name
/** Delete stored files no project uses any more. Returns the number of files removed. */
export async function gcMedia(used) {
  let n = 0; for (const id of await db.keys('media')) if (!used.has(id)) { await db.del('media', id); const r = media.get(id); if (r) unload(r); n++; }
  return n;
}
/** Give older files (stored before content ids) their hash, so they can be shared too. Small files only, in the background. */
export async function backfillHashes(limit = 64 * 1024 * 1024) {
  const out = [];
  for (const id of await db.keys('media')) { const rec = await db.get('media', id); if (!rec || rec.hash || !rec.blob || rec.size > limit) continue;
    rec.hash = await hashBlob(rec.blob).catch(() => null); if (rec.hash) { await db.put('media', rec); const m = media.get(id); if (m) m.hash = rec.hash; out.push(rec); } }
  return out.length;
}
/** Plain stored record (blob + metadata) without loading it for playback. */
export const storedMedia = id => media.get(id) || db.get('media', id);

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

/* ---------- memory guard hooks ---------- */
export const bitmapBytes = () => lru.reduce((n, r) => n + (r.bitmap ? r.bitmap.width * r.bitmap.height * 4 : 0), 0);
/** Close decoded photos (oldest first) until at most `to` bytes stay, keeping the ids in `keep`. */
export function trimBitmaps(to, keep = new Set()) { let b = bitmapBytes(); for (const r of [...lru]) { if (b <= to) break; if (!r.bitmap || keep.has(r.id)) continue; b -= r.bitmap.width * r.bitmap.height * 4; r.bitmap.close(); r.bitmap = null; lru.splice(lru.indexOf(r), 1); } }
export const audioCacheBytes = () => [...audioCache.values()].reduce((n, b) => n + (b ? b.length * b.numberOfChannels * 4 : 0), 0);
export function trimAudioCache(to) { let b = audioCacheBytes(); for (const [k, v] of [...audioCache]) { if (b <= to) break; b -= v ? v.length * v.numberOfChannels * 4 : 0; audioCache.delete(k); } }

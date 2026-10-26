/* Media library: import from device, metadata, timeline thumbnails and audio waveforms (all cached in IndexedDB). */
import * as db from './db.js';
import { uid } from './project.js';

export const media = new Map();          // id -> record (runtime, with url/bitmap)
const listeners = new Set();
export const onMediaUpdate = f => listeners.add(f);
const emit = rec => listeners.forEach(f => f(rec));
/* Phone memory class (navigator.deviceMemory is 0.25–8 GB, rounded). Phones with ≤4 GB get smaller decode caps. */
export const DEV_GB = (typeof navigator !== 'undefined' && navigator.deviceMemory) || 4;
export const LOW_MEM = DEV_GB <= 4 || (typeof location !== 'undefined' && /[?&]lite=1/.test(location.search));
const MAX_IMG = LOW_MEM ? 2560 : 3840;   // decoded image long side (sharp up to 4K exports, still bounded for phone memory)
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
const HASH_FULL = 32 * 1024 * 1024, HASH_PART = 4 * 1024 * 1024;
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
const BITMAP_LRU = LOW_MEM ? 5 : 14, lru = [];
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
/* Files bigger than this are never read into memory whole: their audio is decoded in small pieces straight from
   storage (WebCodecs AudioDecoder). Reading a 600 MB phone video with blob.arrayBuffer() killed the page on phones. */
const STREAM_OVER = 24 * 1024 * 1024;
async function makePeaks(rec) {
  const n0 = Math.max(1, Math.ceil((rec.duration || 1) * PEAK_RATE));
  if (rec.blob.size > STREAM_OVER) {          // peaks while streaming: nothing big is kept
    const out = new Float32Array(n0); let any = false;
    const r = await streamAudio(rec, (planes, sr, t0) => { for (let j = 0; j < planes[0].length; j += 4) { const i = Math.floor((t0 + j / sr) * PEAK_RATE); if (i >= n0) break;
      let v = 0; for (const c of planes) { const a = Math.abs(c[j]); if (a > v) v = a; } if (v > out[i]) out[i] = v; any = true; } }).catch(() => null);
    if (r) { rec.peaks = any ? out : null; rec.hasAudio = !!r.frames; await save(rec); return; }
    if (rec.blob.size > 160e6) { rec.peaks = null; rec.hasAudio = true; await save(rec); return; }
  }
  const buf = await decodeAudio(rec, false);
  if (!buf) { rec.peaks = null; rec.hasAudio = false; await save(rec); return; }
  const n = Math.max(1, Math.ceil(buf.duration * PEAK_RATE)), step = buf.length / n, out = new Float32Array(n);
  const chans = [...Array(buf.numberOfChannels)].map((_, i) => buf.getChannelData(i));
  for (let i = 0; i < n; i++) { let m = 0; const a = Math.floor(i * step), b = Math.min(buf.length, Math.floor((i + 1) * step));
    for (const ch of chans) for (let j = a; j < b; j += 4) { const v = Math.abs(ch[j]); if (v > m) m = v; } out[i] = m; }
  rec.peaks = out; rec.hasAudio = true; await save(rec);
}
/** Stream-decode the audio track of an MP4/MOV/M4A from storage in small pieces. onData(planes[], sampleRate, startTime)
    gets float planes per decoded block. Returns { sampleRate, channels, frames } or null when it can't (caller falls back). */
export async function streamAudio(rec, onData, onInit) {
  if (typeof MP4Box === 'undefined' || typeof AudioDecoder === 'undefined') return null;
  const blob = rec.blob, head = new Uint8Array(await blob.slice(4, 8).arrayBuffer());
  if (String.fromCharCode(...head) !== 'ftyp') return null;
  const file = MP4Box.createFile(false); let info = null, err = null; file.onError = e => { err = e; }; file.onReady = i => { info = i; };
  let off = 0, guard = 0; const CH = 4 << 20;
  while (!info && !err && off < blob.size && guard++ < 10000) { const ab = await blob.slice(off, off + CH).arrayBuffer(); ab.fileStart = off; const nx = file.appendBuffer(ab); off = nx > off ? nx : off + ab.byteLength; }
  if (!info) file.flush();
  const tr = info && info.audioTracks && info.audioTracks[0]; if (err || !info) return null;
  if (!tr) return { sampleRate: 48000, channels: 0, frames: 0 };
  const trak = file.getTrackById(tr.id), S = trak.samples; if (!S || !S.length) return { sampleRate: 48000, channels: 0, frames: 0 };
  let desc; try { const e = trak.mdia.minf.stbl.stsd.entries[0]; const d = e.esds && e.esds.esd.descs[0].descs[0]; if (d && d.data) desc = new Uint8Array(d.data); } catch (e) {}
  const config = { codec: tr.codec === 'mp4a' ? 'mp4a.40.2' : tr.codec, sampleRate: tr.audio.sample_rate, numberOfChannels: tr.audio.channel_count, description: desc };
  const sup = await AudioDecoder.isConfigSupported(config).catch(() => ({ supported: false })); if (!sup.supported) return null;
  onInit && onInit(S.length * 1024 + 4096, config.sampleRate, Math.min(2, config.numberOfChannels));
  let frames = 0, sr = config.sampleRate, chs = config.numberOfChannels, derr = null, t0 = null;
  const dec = new AudioDecoder({ output: ad => { try { sr = ad.sampleRate; chs = Math.min(2, ad.numberOfChannels); const planes = [];
      for (let c = 0; c < chs; c++) { const a = new Float32Array(ad.numberOfFrames); ad.copyTo(a, { planeIndex: c, format: 'f32-planar' }); planes.push(a); }
      const t = ad.timestamp / 1e6; if (t0 === null) t0 = t; onData(planes, sr, t - t0); frames += ad.numberOfFrames; } finally { ad.close(); } },
    error: e => { derr = e; } });
  dec.configure(config);
  const ts = S[0].timescale, GROUP = 2 << 20;
  for (let i = 0; i < S.length && !derr;) {   // read ~2 MB of consecutive samples at a time
    const lo = S[i].offset; let j = i, hi = lo;
    while (j < S.length && S[j].offset >= lo && S[j].offset + S[j].size <= lo + GROUP) { hi = Math.max(hi, S[j].offset + S[j].size); j++; }
    if (j === i) { j = i + 1; hi = lo + S[i].size; }
    const buf = new Uint8Array(await blob.slice(lo, hi).arrayBuffer());
    for (let k = i; k < j; k++) { const s = S[k]; const rel = s.offset - lo;
      const data = rel >= 0 && rel + s.size <= buf.length ? buf.subarray(rel, rel + s.size) : new Uint8Array(await blob.slice(s.offset, s.offset + s.size).arrayBuffer());
      dec.decode(new EncodedAudioChunk({ type: 'key', timestamp: Math.round(s.cts / ts * 1e6), duration: Math.round(s.duration / ts * 1e6), data })); }
    i = j; if (dec.decodeQueueSize > 200) await new Promise(r => setTimeout(r, 0));
    await dec.flush().catch(e => { derr = e; });
  }
  try { dec.close(); } catch (e) {}
  if (derr) throw derr;
  return { sampleRate: sr, channels: chs, frames };
}
/** Decode the audio of a media file (for waveform and export mixing). Returns null when the file has no audio. */
const audioCache = new Map();
async function decodeStreamed(rec) {
  // decode straight into preallocated channel arrays (AAC = 1024 frames per sample), no second copy
  let chs = null, n = 0, sr = 48000;
  const r = await streamAudio(rec, (planes, s) => { if (!chs) return; sr = s;
    for (let c = 0; c < chs.length; c++) { const src = planes[c] || planes[0], room = chs[c].length - n; if (room <= 0) break; chs[c].set(room < src.length ? src.subarray(0, room) : src, n); }
    n = Math.min(chs[0].length, n + planes[0].length); }, (est, s, c) => { sr = s; chs = [...Array(Math.max(1, c))].map(() => new Float32Array(est)); });
  if (!r) return undefined; if (!r.frames || !n || !chs) return null;
  const ab = new AudioBuffer({ length: n, numberOfChannels: chs.length, sampleRate: r.sampleRate || sr });
  for (let c = 0; c < chs.length; c++) { ab.copyToChannel(chs[c].subarray(0, n), c); chs[c] = null; }
  return ab;
}
export async function decodeAudio(rec, keep = true) {
  if (audioCache.has(rec.id)) return audioCache.get(rec.id);
  let buf = null;
  if (rec.blob && rec.blob.size > STREAM_OVER) {
    buf = await decodeStreamed(rec).catch(e => { console.warn('streamed audio decode failed', e); return undefined; });
    if (buf === undefined) buf = rec.blob.size > 160e6 ? null : await whole(rec);
  } else buf = await whole(rec);
  if (keep) audioCache.set(rec.id, buf);
  return buf;
}
async function whole(rec) { try { const ac = new OfflineAudioContext(2, 48000, 48000); return await ac.decodeAudioData(await rec.blob.arrayBuffer()); } catch (e) { return null; } }
export const dropAudioCache = id => id ? audioCache.delete(id) : audioCache.clear();

/* ---------- memory guard hooks ---------- */
export const bitmapBytes = () => lru.reduce((n, r) => n + (r.bitmap ? r.bitmap.width * r.bitmap.height * 4 : 0), 0);
/** Close decoded photos (oldest first) until at most `to` bytes stay, keeping the ids in `keep`. */
export function trimBitmaps(to, keep = new Set()) { let b = bitmapBytes(); for (const r of [...lru]) { if (b <= to) break; if (!r.bitmap || keep.has(r.id)) continue; b -= r.bitmap.width * r.bitmap.height * 4; r.bitmap.close(); r.bitmap = null; lru.splice(lru.indexOf(r), 1); } }
export const audioCacheBytes = () => [...audioCache.values()].reduce((n, b) => n + (b ? b.length * b.numberOfChannels * 4 : 0), 0);
export function trimAudioCache(to) { let b = audioCacheBytes(); for (const [k, v] of [...audioCache]) { if (b <= to) break; b -= v ? v.length * v.numberOfChannels * 4 : 0; audioCache.delete(k); } }

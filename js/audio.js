/* Clip sound processing ("baking"). A clip with Enhance voice, a voice effect or a pitch-kept speed change gets its
   sound processed once in a Web Worker (js/audiofx.js); the preview plays that buffer through Web Audio and the
   export mixes the very same buffer with OfflineAudioContext — so what you hear is exactly what you export.
   Only the used part of the file (+1 s margin) is processed; results are cached by their settings. */
import { media, decodeAudio } from './media.js';
import { eqOn, compOn, mixOpt, mixKey } from './audiomix.js';
import { processAudio } from './audiofx.js';
import { validCurve } from './speedcurve.js';
import { clipDur } from './project.js';
export { VOICE_FX } from './audiofx.js';

export const SR = 48000, MARGIN = 1, DEFAULT_VOICE_STRENGTH = 0.8;
export const keepPitch = c => c.keepPitch !== false;
export const enhanceLevel = c => c.voice && c.voice.enhance ? (c.voice.strength ?? DEFAULT_VOICE_STRENGTH) : 0;
export function needsBake(c) {
  if (c.type !== 'audio' && c.type !== 'video') return false;
  const r = media.get(c.mediaId); if (!r || r.hasAudio === false) return false;
  return enhanceLevel(c) > 0 || !!(c.voice && c.voice.fx) || eqOn(c) || compOn(c) || (Math.abs(c.speed - 1) > 1e-4 && keepPitch(c)) || validCurve(c.curve);
}
function plan(c) {
  const r = media.get(c.mediaId), dur = r && r.duration > 0 ? r.duration : Infinity;
  const a = Math.max(0, Math.floor(c.in - MARGIN)), b = Math.min(dur, Math.ceil(c.out + MARGIN)), rate = keepPitch(c) && Math.abs(c.speed - 1) > 1e-4 ? c.speed : 1;
  const opt = { enhance: enhanceLevel(c), fx: (c.voice && c.voice.fx) || null, rate, ...mixOpt(c) };
  if (validCurve(c.curve)) {   // speed curve: bake the whole clip on its own timeline (variable speed, pitch kept or not)
    const cv = c.curve; opt.rate = 1; opt.map = { pts: cv.pts, u0: cv.u0 ?? 0, u1: cv.u1 ?? 1, off: c.in - a, len: c.out - c.in, D: clipDur(c), speed: c.speed, keep: keepPitch(c) };
    return { a, b, rate: 1, curve: true, opt, key: [c.mediaId, a, isFinite(b) ? b : 'end', 'curve', c.in, c.out, c.speed, opt.map.keep, JSON.stringify(cv), opt.enhance, opt.fx || '', mixKey(c)].join('|') };
  }
  return { a, b, rate, opt, key: [c.mediaId, a, isFinite(b) ? b : 'end', rate, opt.enhance, opt.fx || '', mixKey(c)].join('|') };
}
export const bakeKey = c => plan(c).key;

/* ---------- worker ---------- */
let worker = null, seq = 0; const jobs = new Map();
function work(ch, sr, opt) {
  if (!worker) { worker = new Worker(new URL('./audioworker.js', import.meta.url), { type: 'module' });
    worker.onmessage = e => { const j = jobs.get(e.data.id); if (!j) return; jobs.delete(e.data.id); e.data.error ? j.rej(new Error(e.data.error)) : j.res(e.data.ch); };
    worker.onerror = e => { for (const j of jobs.values()) j.rej(new Error(e.message || 'audio worker failed')); jobs.clear(); worker = null; }; }
  const id = ++seq; return new Promise((res, rej) => { jobs.set(id, { res, rej }); worker.postMessage({ id, ch, sr, opt }, ch.map(c => c.buffer)); });
}

/* ---------- decoded sources (tiny LRU: the same file is often baked several times in a row) ---------- */
const decoded = new Map();
async function source(rec) {
  if (decoded.has(rec.id)) { const v = decoded.get(rec.id); decoded.delete(rec.id); decoded.set(rec.id, v); return v; }
  const p = decodeAudio(rec, false); decoded.set(rec.id, p); while (decoded.size > 2) decoded.delete(decoded.keys().next().value);
  return p;
}

/* ---------- bake cache ---------- */
const cache = new Map(), listeners = new Set(), BUDGET = 24e6;   // ~24 M samples (~96 MB) of baked sound at most
export const onBaked = f => listeners.add(f);
export const bakingCount = () => [...cache.values()].filter(e => !e.buf && !e.failed).length;
async function bake(c, P) {
  const rec = media.get(c.mediaId); const buf = await source(rec); if (!buf) throw new Error('no audio');
  const s0 = Math.floor(P.a * buf.sampleRate), s1 = Math.min(buf.length, Math.ceil((isFinite(P.b) ? P.b : buf.duration) * buf.sampleRate));
  const ch = []; for (let i = 0; i < Math.min(2, buf.numberOfChannels); i++) ch.push(buf.getChannelData(i).slice(s0, s1));
  const out = await work(ch, buf.sampleRate, P.opt);
  const ab = new AudioBuffer({ length: Math.max(1, out[0].length), numberOfChannels: out.length, sampleRate: buf.sampleRate });
  out.forEach((o, i) => ab.copyToChannel(o, i));
  return ab;
}
function evict(keepKeys) {
  let total = 0; for (const e of cache.values()) if (e.buf) total += e.buf.length * e.buf.numberOfChannels;
  for (const [k, e] of [...cache.entries()].sort((x, y) => x[1].used - y[1].used)) { if (total <= BUDGET) break; if (!e.buf || keepKeys.has(k)) continue; total -= e.buf.length * e.buf.numberOfChannels; cache.delete(k); }
}
function entry(c) {
  const P = plan(c); let e = cache.get(P.key);
  if (!e) {
    e = { key: P.key, a: P.a, rate: P.rate, curve: !!P.curve, buf: null, failed: false, used: performance.now() };
    e.promise = bake(c, P).then(b => { e.buf = b; evict(new Set([P.key])); listeners.forEach(f => f(e)); return e; }, err => { console.warn('audio bake failed', err); e.failed = true; listeners.forEach(f => f(e)); return e; });
    cache.set(P.key, e);
  }
  e.used = performance.now(); return e;
}
/** Ready baked buffer for this clip, or null (starts baking in the background; onReady fires when done). */
export function bakedFor(c, onReady) {
  if (!needsBake(c)) return null; const e = entry(c);
  if (e.buf) return e; if (!e.failed && onReady) e.promise.then(onReady); return null;
}
/** Wait for the baked buffer (export). Returns null when the clip has no processing or processing failed. */
export async function ensureBaked(c) { if (!needsBake(c)) return null; const e = await entry(c).promise; return e.buf ? e : null; }
/** Position (seconds inside the baked buffer) heard at timeline time t, and the playback rate to use. */
export const bakedPos = (e, c, t) => e.curve ? t - c.start : (c.in + (t - c.start) * c.speed - e.a) / e.rate;
export const bakedRate = (e, c) => e.curve ? 1 : c.speed / e.rate;
export const dropBakes = () => cache.clear();

import { loadWatermark } from './watermark.js';
/* Export: renders the project frame by frame with the shared compositor and encodes it.
   Primary path: WebCodecs VideoEncoder (H.264, else VP9/AV1) + AudioEncoder (AAC, else Opus) -> MP4 (mp4-muxer).
   Faster than real time on most phones, frame-exact, no server, no special headers needed (works on GitHub Pages).
   Fallback: real-time MediaRecorder capture of the preview (WebM or MP4, whatever the browser records). */
import { media, decodeAudio, dropAudioCache, loadBitmap } from './media.js';
import { allClips, activeVisual } from './compound.js';
import { renderFrame, visualTracks, activeAt } from './render.js';
import { projectDuration, clipEnd, clipDur, srcTime, hasSource, ASPECTS, gainAt, panAt } from './project.js';
import { ensurePresence, loudOn, LOUD_TARGET } from './audiomix.js';
import { lufs as measureLufs, limit as limitPeaks } from './audiofx.js';
import { openSource, dropDemuxCache } from './framesource.js';
import { Player } from './player.js';
import { ensureProjectFonts } from './fonts.js';
import { canvasClip } from './canvasbg.js';
import { needsBake, ensureBaked, bakedPos, bakedRate } from './audio.js';
import { encodeWav } from './wav.js';
import { GifWriter, buildPalette, indexFrame } from './gif.js';

const SR = 48000;
export function outputSize(aspect, short) {
  const [a, b] = ASPECTS[aspect] || [9, 16], even = x => Math.round(x / 2) * 2;
  return a <= b ? { W: short, H: even(short * b / a) } : { W: even(short * a / b), H: short };
}
const hasWebCodecs = () => typeof VideoEncoder !== 'undefined' && typeof AudioEncoder !== 'undefined' && typeof VideoFrame !== 'undefined' && typeof Mp4Muxer !== 'undefined';

/* Sharp exports. "High" (the default) = 0.23 bits per pixel per frame at 1080p30 (VBR, quality mode):
   1080x1920@30 ≈ 14.3 Mbps, 720x1280@30 ≈ 6.4 Mbps. Above 1080p the bitrate grows with pixels^0.75
   (2K ≈ 22 Mbps, 4K ≈ 40 Mbps), above 30 fps with sqrt(fps/30) (1080p60 ≈ 20 Mbps).
   Standard = 0.6x, Best = 1.5x. */
export const QUALITY = { standard: { name: 'Standard', k: 0.6 }, high: { name: 'High', k: 1 }, best: { name: 'Best', k: 1.5 } };
export const RESOLUTIONS = [{ short: 720, label: '720p' }, { short: 1080, label: '1080p' }, { short: 1440, label: '2K' }, { short: 2160, label: '4K' }];
const REF = 1080 * 1920, REF_BR = REF * 30 * 0.23;
export function bitrateFor(W, H, fps, q = 'high') {
  const px = W * H, pf = px <= REF ? px / REF : Math.pow(px / REF, 0.75), ff = fps <= 30 ? fps / 30 : Math.sqrt(fps / 30);
  return Math.round(Math.max(2.5e6, Math.min(120e6, REF_BR * pf * ff * (QUALITY[q] || QUALITY.high).k)));
}
export const defaultBitrate = (W, H, fps) => bitrateFor(W, H, fps, 'high');
/** Lowest video bitrate we still call good quality (used when fitting a video under the share size limit). */
export const qualityFloor = (W, H) => Math.round(W * H * 2.0);   // ~4.1 Mbps at 1080x1920, ~1.8 Mbps at 720x1280
export const AUDIO_BR = 192000;
/** Estimated file size in bytes (video + audio + container). VBR usually lands a bit under this. */
export const estimateBytes = (vbr, D) => Math.round((vbr + AUDIO_BR) * D / 8 * 1.01 + 40000);
/** Video bitrate so the whole file stays under maxBytes (with a safety margin), never above the chosen quality. */
export function planBitrate(W, H, fps, D, maxBytes, q = 'high') {
  const full = bitrateFor(W, H, fps, q); if (!maxBytes || !D) return full;
  return Math.round(Math.max(400000, Math.min(full, maxBytes * 8 * 0.86 / D - AUDIO_BR - 30000)));
}
/** Smallest H.264 level that fits size, frame rate and bitrate (High profile limits). */
export function avcLevel(W, H, fps, br) {
  const mbs = Math.ceil(W / 16) * Math.ceil(H / 16), rate = mbs * fps;
  const L = [['28', 8192, 245760, 25e6], ['2a', 8704, 522240, 62.5e6], ['32', 22080, 589824, 168.75e6], ['33', 36864, 983040, 300e6], ['34', 36864, 2073600, 300e6], ['3c', 139264, 8355840, 1000e6]];
  for (const [l, f, r, b] of L) if (mbs <= f && rate <= r && br <= b) return l;
  return '3c';
}
async function pickVideo(W, H, fps, bitrate, strict = false) {
  const lvl = avcLevel(W, H, fps, bitrate);
  if (strict) { const v = await pickVideo(W, H, fps, bitrate * 1, false); if (v) { const c = { ...v.config, bitrateMode: 'constant' }; try { if ((await VideoEncoder.isConfigSupported(c)).supported) return { config: c, mux: v.mux }; } catch (e) {} } return v; }
  const vc = [['avc1.6400' + lvl, 'avc'], ['avc1.4d00' + lvl, 'avc'], ['avc1.42e0' + lvl, 'avc'], ['vp09.00.' + (W * H > 2228224 ? '51' : '40') + '.08', 'vp9'], ['av01.0.' + (W * H > 2228224 ? '12' : '08') + 'M.08', 'av1']];
  for (const [codec, mux] of vc) {
    const config = { codec, width: W, height: H, bitrate, bitrateMode: 'variable', framerate: fps, latencyMode: 'quality', ...(mux === 'avc' ? { avc: { format: 'avc' } } : {}) };
    try { if ((await VideoEncoder.isConfigSupported(config)).supported) return { config, mux }; } catch (e) {}
  }
  return null;
}
/** strict: the user set a bitrate / file size, so ask for a constant bitrate (variable overshoots on busy pictures). */
export async function pickCodecs(W, H, fps, vbr, strict = false) {
  if (!hasWebCodecs()) return null;
  const video = await pickVideo(W, H, fps, vbr || defaultBitrate(W, H, fps), strict);
  let audio = null;
  for (const [codec, mux, br] of [['mp4a.40.2', 'aac', AUDIO_BR], ['opus', 'opus', 160000]]) {
    const config = { codec, sampleRate: SR, numberOfChannels: 2, bitrate: br };
    try { if ((await AudioEncoder.isConfigSupported(config)).supported) { audio = { config, mux }; break; } } catch (e) {}
  }
  return video && audio ? { video, audio } : null;
}
/** Which export resolutions this device can encode (asks VideoEncoder.isConfigSupported). 720p/1080p always work
    (real-time recorder fallback); 2K/4K need a WebCodecs encoder that accepts that size. */
export async function supportedResolutions(aspect, fps, q = 'high') {
  const out = {};
  for (const r of RESOLUTIONS) {
    const { W, H } = outputSize(aspect, r.short);
    out[r.short] = r.short <= 1080 ? true : hasWebCodecs() ? !!(await pickVideo(W, H, fps, bitrateFor(W, H, fps, q))) : false;
  }
  return out;
}
export function recorderMime() {
  if (typeof MediaRecorder === 'undefined') return null;
  return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].find(m => MediaRecorder.isTypeSupported(m)) || null;
}

/** Mix every audible clip into one stereo AudioBuffer (same gain/speed rules as the preview). */
export async function mixAudio(p, D, onProgress, { raw = false, sr = SR, keep = true } = {}) {
  await ensurePresence(p);   // voice envelopes for auto ducking (same gain curve as the preview)
  const oac = new OfflineAudioContext(2, Math.max(1, Math.ceil(D * sr)), sr);
  const all = allClips(p).filter(c => hasSource(c) && c.start < D && !c.muteAudio), todo = all.filter(needsBake); let done = 0;
  for (const c of all) {
    const rec = media.get(c.mediaId); if (!rec || rec.hasAudio === false) continue;
    // processed clips: the same baked buffer the preview plays
    const bk = needsBake(c) ? await ensureBaked(c) : null; if (bk) onProgress && onProgress(++done / Math.max(1, todo.length));
    const buf = bk ? bk.buf : await decodeAudio(rec, keep); if (!buf) continue;
    const src = oac.createBufferSource(); src.buffer = buf; src.playbackRate.value = bk ? bakedRate(bk, c) : c.speed;
    // gain curve = volume keyframes x transition crossfade (same function the preview uses)
    const g = oac.createGain(), len = Math.min(clipDur(c), D - c.start), n = Math.max(2, Math.ceil(len * 100)), curve = new Float32Array(n);
    for (let i = 0; i < n; i++) curve[i] = gainAt(p, c, c.start + len * i / (n - 1));
    g.gain.value = curve[0]; if (len > 0.001) g.gain.setValueCurveAtTime(curve, c.start, len);
    const pn = oac.createStereoPanner(), pc = new Float32Array(n); let panned = false; for (let i = 0; i < n; i++) { pc[i] = panAt(c, c.start + len * i / (n - 1)); if (pc[i]) panned = true; }
    pn.pan.value = pc[0]; if (panned && len > 0.001) pn.pan.setValueCurveAtTime(pc, c.start, len);
    src.connect(g).connect(pn).connect(oac.destination);
    if (bk) { const o = Math.max(0, bakedPos(bk, c, c.start)); src.start(c.start, Math.min(o, buf.duration), Math.max(0, Math.min(buf.duration - o, clipDur(c) * bakedRate(bk, c)))); }
    else src.start(c.start, Math.min(c.in, buf.duration), Math.max(0, Math.min(c.out, buf.duration) - c.in));
    src.stop(Math.min(D, clipEnd(c)));
  }
  const mix = await oac.startRendering();
  return raw || !loudOn(p) ? mix : loudnessNormalize(mix);
}
/** Loudness of a mix and the gain that brings it to -14 LUFS. */
export function loudnessOf(buf) { const ch = [buf.getChannelData(0), buf.getChannelData(Math.min(1, buf.numberOfChannels - 1))], L = measureLufs(ch, buf.sampleRate);
  const gainDb = isFinite(L) ? Math.max(-24, Math.min(24, LOUD_TARGET - L)) : 0; return { lufs: L, gainDb, gain: Math.pow(10, gainDb / 20) }; }
/** Export loudness: the whole mix to -14 LUFS (integrated), sample peaks limited to -1 dBFS. */
export function loudnessNormalize(buf) {
  const { gain, lufs: L } = loudnessOf(buf); if (!isFinite(L)) return buf;
  const ch = [0, 1].map(i => { const d = buf.getChannelData(Math.min(i, buf.numberOfChannels - 1)), o = new Float32Array(d.length); for (let k = 0; k < d.length; k++) o[k] = d[k] * gain; return o; });
  const out = limitPeaks(ch, buf.sampleRate, -1), ab = new AudioBuffer({ length: buf.length, numberOfChannels: 2, sampleRate: buf.sampleRate }); out.forEach((o, i) => ab.copyToChannel(o, i)); return ab;
}

/** Time range to export: opt.range = [t0, t1] (seconds), clamped to the project. Default: everything. */
export function rangeOf(p, range) {
  const D = projectDuration(p); let [a, b] = range || [0, D]; a = Math.max(0, Math.min(D, +a || 0)); b = Math.max(0, Math.min(D, b == null ? D : +b));
  return b - a >= 0.05 ? [a, b] : [0, D];
}
export async function exportVideo(p, opt) {
  await loadWatermark();
  const { short = 1080, fps = 30, onProgress = () => {}, signal = {}, mode, maxBytes, quality = 'high', vbr: forceBr } = opt;
  if (!projectDuration(p)) throw new Error('Nothing to export yet');
  const [t0, t1] = rangeOf(p, opt.range), D = t1 - t0;
  await ensureProjectFonts(p);
  const { W, H } = opt.size || outputSize(p.aspect, short), vbr = forceBr ? Math.round(Math.max(3e5, Math.min(120e6, forceBr))) : planBitrate(W, H, fps, D, maxBytes, quality);
  const strict = !!(forceBr || maxBytes), codecs = mode === 'recorder' ? null : await pickCodecs(W, H, fps, vbr, strict);
  try {
    if (codecs) {
      let r = { ...(await encodeWebCodecs(p, D, W, H, fps, codecs, onProgress, signal, t0)), bitrate: vbr, range: [t0, t1] };
      // a file-size target that was missed (encoders drift on very busy pictures): one more pass at a corrected bitrate
      const goal = opt.targetBytes || maxBytes;
      if (goal && r.blob.size > goal * 1.03 && !signal.aborted) {
        const br2 = Math.round(Math.max(2e5, vbr * goal / r.blob.size * 0.9)), c2 = await pickCodecs(W, H, fps, br2, true);
        if (c2) { onProgress({ phase: 'smaller', p: 0 }); const r2 = { ...(await encodeWebCodecs(p, D, W, H, fps, c2, onProgress, signal, t0)), bitrate: br2, range: [t0, t1] }; if (r2.blob.size < r.blob.size) r = r2; }
      }
      return r;
    }
    if (recorderMime()) return { ...(await encodeRecorder(p, D, W, H, fps, onProgress, signal, vbr, t0)), bitrate: vbr, range: [t0, t1] };
    throw new Error('This browser cannot export video. Please use Chrome.');
  } finally { dropAudioCache(); dropDemuxCache(); }
}
/** The project's sound between t0 and t1 as an AudioBuffer-like { L, R, length }. */
async function mixRange(p, t0, t1, onProgress) {
  const mix = await mixAudio(p, t1, onProgress), a = Math.min(mix.length, Math.round(t0 * SR)), b = Math.min(mix.length, Math.round(t1 * SR));
  return { L: mix.getChannelData(0).subarray(a, b), R: mix.getChannelData(1).subarray(a, b), length: b - a };
}
/** Audio only: 'm4a' (AAC in MP4; Opus in MP4 when this browser has no AAC encoder) or 'wav' (16-bit PCM). */
export async function exportAudio(p, { format = 'm4a', range, onProgress = () => {} } = {}) {
  if (!projectDuration(p)) throw new Error('Nothing to export yet');
  const [t0, t1] = rangeOf(p, range), t = performance.now();
  try {
    onProgress({ phase: 'audio', p: 0 });
    const m = await mixRange(p, t0, t1, x => onProgress({ phase: 'audio', p: x * .5 }));
    if (format === 'wav') { const blob = encodeWav([m.L, m.R], SR); return { blob, ext: 'wav', mime: 'audio/wav', codec: 'PCM 16-bit', duration: t1 - t0, range: [t0, t1], seconds: (performance.now() - t) / 1000 }; }
    let audio = null;
    for (const [codec, mux, br] of [['mp4a.40.2', 'aac', AUDIO_BR], ['opus', 'opus', 160000]]) { const config = { codec, sampleRate: SR, numberOfChannels: 2, bitrate: br };
      try { if (typeof AudioEncoder !== 'undefined' && (await AudioEncoder.isConfigSupported(config)).supported) { audio = { config, mux }; break; } } catch (e) {} }
    if (!audio || typeof Mp4Muxer === 'undefined') { const blob = encodeWav([m.L, m.R], SR); return { blob, ext: 'wav', mime: 'audio/wav', codec: 'PCM 16-bit (no compressed audio encoder here)', duration: t1 - t0, range: [t0, t1], fallback: true }; }
    const target = new Mp4Muxer.ArrayBufferTarget(), muxer = new Mp4Muxer.Muxer({ target, fastStart: 'in-memory', firstTimestampBehavior: 'offset', audio: { codec: audio.mux, sampleRate: SR, numberOfChannels: 2 } });
    let fail = null; const enc = new AudioEncoder({ output: (c, md) => muxer.addAudioChunk(c, md), error: e => { fail = e; } }); enc.configure(audio.config);
    const CH = 4096;
    for (let i = 0; i < m.length; i += CH) { const n = Math.min(CH, m.length - i), data = new Float32Array(n * 2); data.set(m.L.subarray(i, i + n), 0); data.set(m.R.subarray(i, i + n), n);
      const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i / SR * 1e6), data }); enc.encode(ad); ad.close();
      if (enc.encodeQueueSize > 16) await drain(enc, 4); if (i % (CH * 40) === 0) onProgress({ phase: 'audio', p: .5 + .5 * i / m.length }); if (fail) throw fail; }
    await enc.flush(); if (fail) throw fail; enc.close(); muxer.finalize();
    return { blob: new Blob([target.buffer], { type: 'audio/mp4' }), ext: 'm4a', mime: 'audio/mp4', codec: audio.mux === 'aac' ? 'AAC 192 kbps' : 'Opus 160 kbps', duration: t1 - t0, range: [t0, t1], seconds: (performance.now() - t) / 1000 };
  } finally { dropAudioCache(); }
}
/** Frame-exact picture of time t at full export resolution (same decoders as the video export). */
async function framesAt(p, t, sources, clips) {
  const frames = new Map();
  for (const c of canvasClip(p) ? [canvasClip(p)] : []) { const r = media.get(c.mediaId); if (r) { const bm = await loadBitmap(r); frames.set(c.id, { img: bm, w: bm.width, h: bm.height }); } }
  for (const c of activeVisual(p, t)) {
    if (c.type === 'image') { const r = media.get(c.mediaId); if (r) { const bm = await loadBitmap(r); frames.set(c.id, { img: bm, w: bm.width, h: bm.height }); } continue; }
    if (c.type !== 'video') continue;
    let s = sources.get(c.id); if (!s) { s = await openSource(media.get(c.mediaId), srcTime(c, t)); sources.set(c.id, s); clips.set(c.id, c); }
    frames.set(c.id, await s.frameAt(Math.max(0, srcTime(c, t))));
  }
  for (const [id, s] of sources) if (clipEnd(clips.get(id)) <= t + 1e-9 || clips.get(id).start > t + 1e-9) { s.close(); sources.delete(id); }
  return frames;
}
export async function exportStill(p, t, { short = 1080, type = 'image/png', quality = .92 } = {}) {
  await ensureProjectFonts(p); const D = projectDuration(p); t = Math.max(0, Math.min(Math.max(0, D - 1e-3), t));
  const { W, H } = outputSize(p.aspect, short), cv = new OffscreenCanvas(W, H), ctx = cv.getContext('2d', { alpha: false }); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const sources = new Map(), clips = new Map();
  try { const fr = await framesAt(p, t, sources, clips); renderFrame(ctx, W, H, p, t, c => fr.get(c.id)); }
  finally { for (const s of sources.values()) s.close(); dropDemuxCache(); }
  const blob = await cv.convertToBlob(type === 'image/jpeg' ? { type, quality } : { type });
  return { blob, ext: type === 'image/jpeg' ? 'jpg' : 'png', mime: type, W, H, t };
}
export const GIF_MAX = 15;   // seconds: GIFs get very big, so only short clips
/** Animated GIF of a short range (max 15 s): width 240-480 px, 8-15 fps. */
export async function exportGif(p, { range, width = 360, fps = 12, onProgress = () => {}, signal = {} } = {}) {
  await ensureProjectFonts(p);
  let [t0, t1] = rangeOf(p, range); if (t1 - t0 > GIF_MAX) t1 = t0 + GIF_MAX;
  const { W: W0, H: H0 } = outputSize(p.aspect, 1080), W = Math.round(width / 2) * 2, H = Math.round(W * H0 / W0 / 2) * 2, N = Math.max(1, Math.round((t1 - t0) * fps)), tm = performance.now();
  const cv = new OffscreenCanvas(W, H), ctx = cv.getContext('2d', { alpha: false, willReadFrequently: true }); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const sources = new Map(), clips = new Map(), grab = async t => { const fr = await framesAt(p, t, sources, clips); renderFrame(ctx, W, H, p, t, c => fr.get(c.id)); return ctx.getImageData(0, 0, W, H).data; };
  try {
    const samples = [], step = Math.max(1, Math.floor(N / 12));
    for (let i = 0; i < N; i += step) { samples.push(new Uint8ClampedArray(await grab(t0 + i / fps))); onProgress({ phase: 'palette', p: i / N * .2 }); }
    for (const s of sources.values()) s.close(); sources.clear(); clips.clear();
    const { pal, lut } = buildPalette(samples), gw = new GifWriter(W, H, pal); let acc = 0;
    for (let i = 0; i < N; i++) {
      if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
      const d = await grab(t0 + i / fps), next = Math.round((i + 1) * 100 / fps), delay = next - acc; acc = next;
      gw.add(indexFrame(d, W, H, lut), delay); onProgress({ phase: 'video', p: .2 + .8 * (i + 1) / N, frame: i + 1, frames: N });
      if (i % 4 === 3) await new Promise(r => setTimeout(r, 0));
    }
    return { blob: gw.finish(), ext: 'gif', mime: 'image/gif', W, H, fps, frames: N, duration: t1 - t0, range: [t0, t1], seconds: (performance.now() - tm) / 1000 };
  } finally { for (const s of sources.values()) s.close(); dropDemuxCache(); }
}

async function encodeWebCodecs(p, D, W, H, fps, codecs, onProgress, signal, tStart = 0) {
  const t0 = performance.now();
  const target = new Mp4Muxer.ArrayBufferTarget();
  const muxer = new Mp4Muxer.Muxer({ target, fastStart: false, firstTimestampBehavior: 'offset',
    video: { codec: codecs.video.mux, width: W, height: H }, audio: { codec: codecs.audio.mux, sampleRate: SR, numberOfChannels: 2 } });
  let fail = null;
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: e => { fail = e; } });
  venc.configure(codecs.video.config);
  const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: e => { fail = e; } });
  aenc.configure(codecs.audio.config);

  // 1) sound
  onProgress({ phase: 'audio', p: 0 });
  const mix = await mixRange(p, tStart, tStart + D, x => onProgress({ phase: 'audio', p: x }));
  const L = mix.L, R = mix.R, CH = 4096;
  for (let i = 0; i < mix.length; i += CH) {
    const n = Math.min(CH, mix.length - i), data = new Float32Array(n * 2); data.set(L.subarray(i, i + n), 0); data.set(R.subarray(i, i + n), n);
    const ad = new AudioData({ format: 'f32-planar', sampleRate: SR, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i / SR * 1e6), data });
    aenc.encode(ad); ad.close();
    if (aenc.encodeQueueSize > 16) await drain(aenc, 4);
  }
  // 2) pictures
  const N = Math.max(1, Math.round(D * fps));
  const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(W, H) : Object.assign(document.createElement('canvas'), { width: W, height: H });
  const ctx = canvas.getContext('2d', { alpha: false }); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const sources = new Map(), clips = new Map(), kinds = {};
  const vtracks = visualTracks(p);
  for (let i = 0; i < N; i++) {
    if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
    if (fail) throw fail;
    const t = tStart + i / fps, frames = new Map();
    for (const c of canvasClip(p) ? [canvasClip(p)] : []) { const r = media.get(c.mediaId); if (r) { const bm = await loadBitmap(r); frames.set(c.id, { img: bm, w: bm.width, h: bm.height }); } }
    for (const c of activeVisual(p, t)) {
      if (c.type === 'image') { const r = media.get(c.mediaId); if (r) { const bm = await loadBitmap(r); frames.set(c.id, { img: bm, w: bm.width, h: bm.height }); } continue; }
      if (c.type !== 'video') continue;
      let s = sources.get(c.id);
      if (!s) { s = await openSource(media.get(c.mediaId), srcTime(c, t)); sources.set(c.id, s); clips.set(c.id, c); kinds[s.kind] = (kinds[s.kind] || 0) + 1; }
      frames.set(c.id, await s.frameAt(Math.max(0, srcTime(c, t))));
    }
    for (const [id, s] of sources) if (clipEnd(clips.get(id)) <= t + 1e-9) { s.close(); sources.delete(id); }
    renderFrame(ctx, W, H, p, t, c => frames.get(c.id));
    const vf = new VideoFrame(canvas, { timestamp: Math.round(i * 1e6 / fps), duration: Math.round(1e6 / fps) });
    venc.encode(vf, { keyFrame: i % (fps * 2) === 0 }); vf.close();
    if (venc.encodeQueueSize > 4) await drain(venc, 2);
    if (i % 3 === 0 || i === N - 1) { const el = (performance.now() - t0) / 1000, done = (i + 1) / N; onProgress({ phase: 'video', p: done, eta: el / done * (1 - done), frame: i + 1, frames: N }); }
  }
  for (const s of sources.values()) s.close();
  onProgress({ phase: 'finishing', p: 1 });
  await venc.flush(); await aenc.flush(); if (fail) throw fail;
  venc.close(); aenc.close(); muxer.finalize();
  const blob = new Blob([target.buffer], { type: 'video/mp4' });
  return { blob, ext: 'mp4', mime: 'video/mp4', W, H, fps, duration: D, codec: codecs.video.config.codec + ' + ' + codecs.audio.config.codec, path: 'webcodecs', sources: kinds, seconds: (performance.now() - t0) / 1000 };
}
function drain(enc, below) {
  return new Promise(res => { const check = () => { if (enc.encodeQueueSize <= below || enc.state === 'closed') { enc.removeEventListener?.('dequeue', check); res(); } else setTimeout(check, 8); }; enc.addEventListener?.('dequeue', check); check(); });
}

/* Real-time fallback: plays the project into a hidden canvas and records it (takes as long as the video). */
async function encodeRecorder(p, D, W, H, fps, onProgress, signal, vbr, tStart = 0) {
  const t0 = performance.now(), mime = recorderMime();
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  let dest = null;
  const player = new Player(canvas, { getProject: () => p, showSelection: false, silent: true, recordDest: ac => (dest = ac.createMediaStreamDestination()) });
  player.ensureAudio();
  player.seek(tStart); await new Promise(r => setTimeout(r, 800)); player.draw();
  const stream = canvas.captureStream(fps); if (dest) dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.round(Math.min(25e6, vbr || defaultBitrate(W, H, fps))), audioBitsPerSecond: 160000 });
  const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const stopped = new Promise(r => rec.onstop = r);
  await new Promise(res => {
    player.o.onEnd = res;
    player.o.onTime = t => { onProgress({ phase: 'video', p: (t - tStart) / D, eta: D - (t - tStart) }); if (signal.aborted) res(); };
    rec.start(500); player.stopAt = tStart + D; player.play();
  });
  await new Promise(r => setTimeout(r, 250)); rec.stop(); await stopped; player.destroy();
  if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
  const type = mime.split(';')[0], blob = new Blob(chunks, { type });
  return { blob, ext: type === 'video/mp4' ? 'mp4' : 'webm', mime: type, W, H, fps, duration: D, codec: mime, path: 'recorder', seconds: (performance.now() - t0) / 1000 };
}

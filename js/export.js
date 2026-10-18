/* Export: renders the project frame by frame with the shared compositor and encodes it.
   Primary path: WebCodecs VideoEncoder (H.264, else VP9/AV1) + AudioEncoder (AAC, else Opus) -> MP4 (mp4-muxer).
   Faster than real time on most phones, frame-exact, no server, no special headers needed (works on GitHub Pages).
   Fallback: real-time MediaRecorder capture of the preview (WebM or MP4, whatever the browser records). */
import { media, decodeAudio, dropAudioCache, loadBitmap } from './media.js';
import { renderFrame, visualTracks, activeAt } from './render.js';
import { projectDuration, clipEnd, clipDur, srcTime, hasSource, ASPECTS, gainAt } from './project.js';
import { openSource, dropDemuxCache } from './framesource.js';
import { Player } from './player.js';

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
async function pickVideo(W, H, fps, bitrate) {
  const lvl = avcLevel(W, H, fps, bitrate);
  const vc = [['avc1.6400' + lvl, 'avc'], ['avc1.4d00' + lvl, 'avc'], ['avc1.42e0' + lvl, 'avc'], ['vp09.00.' + (W * H > 2228224 ? '51' : '40') + '.08', 'vp9'], ['av01.0.' + (W * H > 2228224 ? '12' : '08') + 'M.08', 'av1']];
  for (const [codec, mux] of vc) {
    const config = { codec, width: W, height: H, bitrate, bitrateMode: 'variable', framerate: fps, latencyMode: 'quality', ...(mux === 'avc' ? { avc: { format: 'avc' } } : {}) };
    try { if ((await VideoEncoder.isConfigSupported(config)).supported) return { config, mux }; } catch (e) {}
  }
  return null;
}
export async function pickCodecs(W, H, fps, vbr) {
  if (!hasWebCodecs()) return null;
  const video = await pickVideo(W, H, fps, vbr || defaultBitrate(W, H, fps));
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
export async function mixAudio(p, D) {
  const oac = new OfflineAudioContext(2, Math.max(1, Math.ceil(D * SR)), SR);
  for (const track of p.tracks) for (const c of track.clips) {
    if (!hasSource(c) || c.start >= D) continue;
    const rec = media.get(c.mediaId); if (!rec || rec.hasAudio === false) continue;
    const buf = await decodeAudio(rec); if (!buf) continue;
    const src = oac.createBufferSource(); src.buffer = buf; src.playbackRate.value = c.speed;
    // gain curve = volume keyframes x transition crossfade (same function the preview uses)
    const g = oac.createGain(), len = Math.min(clipDur(c), D - c.start), n = Math.max(2, Math.ceil(len * 100)), curve = new Float32Array(n);
    for (let i = 0; i < n; i++) curve[i] = gainAt(p, c, c.start + len * i / (n - 1));
    g.gain.value = curve[0]; if (len > 0.001) g.gain.setValueCurveAtTime(curve, c.start, len);
    src.connect(g).connect(oac.destination);
    src.start(c.start, Math.min(c.in, buf.duration), Math.max(0, Math.min(c.out, buf.duration) - c.in)); src.stop(Math.min(D, clipEnd(c)));
  }
  return oac.startRendering();
}

export async function exportVideo(p, opt) {
  const { short = 1080, fps = 30, onProgress = () => {}, signal = {}, mode, maxBytes, quality = 'high' } = opt;
  const D = projectDuration(p); if (!D) throw new Error('Nothing to export yet');
  const { W, H } = outputSize(p.aspect, short), vbr = planBitrate(W, H, fps, D, maxBytes, quality);
  const codecs = mode === 'recorder' ? null : await pickCodecs(W, H, fps, vbr);
  try {
    if (codecs) return { ...(await encodeWebCodecs(p, D, W, H, fps, codecs, onProgress, signal)), bitrate: vbr };
    if (recorderMime()) return { ...(await encodeRecorder(p, D, W, H, fps, onProgress, signal, vbr)), bitrate: vbr };
    throw new Error('This browser cannot export video. Please use Chrome.');
  } finally { dropAudioCache(); dropDemuxCache(); }
}

async function encodeWebCodecs(p, D, W, H, fps, codecs, onProgress, signal) {
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
  const mix = await mixAudio(p, D);
  const L = mix.getChannelData(0), R = mix.getChannelData(1), CH = 4096;
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
    const t = i / fps, frames = new Map();
    for (const tr of vtracks) for (const c of activeAt(tr, t)) {
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
async function encodeRecorder(p, D, W, H, fps, onProgress, signal, vbr) {
  const t0 = performance.now(), mime = recorderMime();
  const canvas = Object.assign(document.createElement('canvas'), { width: W, height: H });
  let dest = null;
  const player = new Player(canvas, { getProject: () => p, showSelection: false, silent: true, recordDest: ac => (dest = ac.createMediaStreamDestination()) });
  player.ensureAudio();
  player.seek(0); await new Promise(r => setTimeout(r, 800)); player.draw();
  const stream = canvas.captureStream(fps); if (dest) dest.stream.getAudioTracks().forEach(t => stream.addTrack(t));
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: Math.round(Math.min(25e6, vbr || defaultBitrate(W, H, fps))), audioBitsPerSecond: 160000 });
  const chunks = []; rec.ondataavailable = e => e.data.size && chunks.push(e.data);
  const stopped = new Promise(r => rec.onstop = r);
  await new Promise(res => {
    player.o.onEnd = res;
    player.o.onTime = t => { onProgress({ phase: 'video', p: t / D, eta: D - t }); if (signal.aborted) res(); };
    rec.start(500); player.play();
  });
  await new Promise(r => setTimeout(r, 250)); rec.stop(); await stopped; player.destroy();
  if (signal.aborted) throw new DOMException('Export cancelled', 'AbortError');
  const type = mime.split(';')[0], blob = new Blob(chunks, { type });
  return { blob, ext: type === 'video/mp4' ? 'mp4' : 'webm', mime: type, W, H, fps, duration: D, codec: mime, path: 'recorder', seconds: (performance.now() - t0) / 1000 };
}

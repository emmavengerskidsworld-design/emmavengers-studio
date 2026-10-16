/* Frame-accurate video frames for export.
   1) DecoderSource: MP4/MOV demuxed with mp4box.js and decoded with WebCodecs VideoDecoder (fast, exact frames).
   2) SeekSource: fallback for other formats / unsupported codecs: seeks a <video> element to every frame time.
   Both answer frameAt(t) for non-decreasing source times t and return { img, w, h, rot }. */
import { once } from './media.js';

const demuxCache = new Map();
export const dropDemuxCache = () => demuxCache.clear();

function rotationOf(matrix) {
  if (!matrix) return 0;
  const a = matrix[0] / 65536, b = matrix[1] / 65536;
  return ((Math.round(Math.atan2(b, a) * 180 / Math.PI / 90) * 90) % 360 + 360) % 360;
}
function description(trak) {
  for (const e of trak.mdia.minf.stbl.stsd.entries) {
    const box = e.avcC || e.hvcC || e.vpcC || e.av1C;
    if (box) { const s = new DataStream(undefined, 0, DataStream.BIG_ENDIAN); box.write(s); return new Uint8Array(s.buffer, 8); }
  }
  return undefined;
}
/** Read the sample table of an MP4/MOV video track (no frame data is loaded: frames are read from disk on demand,
    so a long phone video does not have to fit in memory). Returns null if it is not an MP4 or has no video. */
export async function demux(rec) {
  if (demuxCache.has(rec.id)) return demuxCache.get(rec.id);
  const p = (async () => {
    if (typeof MP4Box === 'undefined') return null;
    const head = new Uint8Array(await rec.blob.slice(4, 8).arrayBuffer());
    if (String.fromCharCode(...head) !== 'ftyp' && !/mp4|quicktime|m4v|3gp/.test(rec.mime || '')) return null;
    const file = MP4Box.createFile(false); let info = null, err = null;
    file.onError = e => { err = e; }; file.onReady = i => { info = i; };
    const CH = 4 << 20; let off = 0, guard = 0;
    while (!info && !err && off < rec.blob.size && guard++ < 10000) {
      const ab = await rec.blob.slice(off, off + CH).arrayBuffer(); ab.fileStart = off;
      const next = file.appendBuffer(ab);
      off = next > off ? next : off + ab.byteLength;   // mp4box skips over the big media data box
    }
    if (!info) file.flush();
    const track = info && info.videoTracks[0]; if (err || !track) return null;
    const trak = file.getTrackById(track.id), raw = trak.samples; if (!raw || !raw.length) return null;
    const ts = raw[0].timescale; let minCts = Infinity; for (const s of raw) if (s.cts < minCts) minCts = s.cts;
    const samples = raw.map(s => ({ t: (s.cts - minCts) / ts, dur: s.duration / ts, key: s.is_sync, off: s.offset, size: s.size }));
    const config = { codec: track.codec.startsWith('vp08') ? 'vp8' : track.codec, codedWidth: track.video.width, codedHeight: track.video.height, description: description(trak) };
    const sup = await VideoDecoder.isConfigSupported(config).catch(() => ({ supported: false }));
    if (!sup.supported) return null;
    return { blob: rec.blob, config, samples, rot: rotationOf(track.matrix), w: track.video.width, h: track.video.height };
  })().catch(e => { console.warn('demux failed', e); return null; });
  demuxCache.set(rec.id, p); return p;
}

export class DecoderSource {
  constructor(dm, startT) {
    this.dm = dm; this.frames = []; this.done = false; this.error = null; this._wake = null;
    const S = dm.samples; let k = 0;
    // feed from the last key frame (in decode order) whose presentation time <= startT
    for (let i = 0; i < S.length; i++) if (S[i].key && S[i].t <= startT + 1e-4) k = i;
    this.i = k;
    this.dec = new VideoDecoder({
      output: f => { this.frames.push(f); this.wake(); },
      error: e => { this.error = e; this.wake(); },
    });
    this.dec.configure(dm.config);
  }
  wake() { const w = this._wake; this._wake = null; w && w(); }
  /** Read the next batch of compressed frames from disk (one read per batch) and queue them on the decoder. */
  async feed() {
    if (this.reading) return this.reading;
    return this.reading = (async () => {
      const S = this.dm.samples;
      if (this.i < S.length && this.dec.decodeQueueSize < 8) {
        const n = Math.min(S.length - this.i, 24), batch = S.slice(this.i, this.i + n);
        let lo = Infinity, hi = 0; for (const s of batch) { lo = Math.min(lo, s.off); hi = Math.max(hi, s.off + s.size); }
        let buf;
        if (hi - lo <= 48 << 20) buf = new Uint8Array(await this.dm.blob.slice(lo, hi).arrayBuffer());
        for (const s of batch) {
          const data = buf ? buf.subarray(s.off - lo, s.off - lo + s.size) : new Uint8Array(await this.dm.blob.slice(s.off, s.off + s.size).arrayBuffer());
          if (this.dec.state === 'closed') return;
          this.dec.decode(new EncodedVideoChunk({ type: s.key ? 'key' : 'delta', timestamp: Math.round(s.t * 1e6), duration: Math.round(s.dur * 1e6), data }));
        }
        this.i += n;
      }
      if (this.i >= S.length && !this.flushing && this.dec.state === 'configured') this.flushing = this.dec.flush().then(() => { this.done = true; this.wake(); }, e => { if (this.dec.state !== 'closed') this.error = e; this.wake(); });
    })().finally(() => { this.reading = null; });
  }
  async frameAt(t) {
    const us = t * 1e6 + 500;
    for (let guard = 0; guard < 100000; guard++) {
      if (this.error) throw this.error;
      const F = this.frames;
      while (F.length >= 2 && F[1].timestamp <= us) F.shift().close();
      if (F.length && (F.length >= 2 || F[0].timestamp > us || this.done)) return this.wrap(F[0]);
      if (this.done) return null;
      if (this.dec.decodeQueueSize < 8) await this.feed();
      if (this.frames.length < 2 && !this.done) await new Promise(r => { this._wake = r; setTimeout(r, 20); });
    }
    return null;
  }
  wrap(f) { return { img: f, w: f.displayWidth, h: f.displayHeight, rot: this.dm.rot }; }
  close() { for (const f of this.frames) f.close(); this.frames = []; try { if (this.dec.state !== 'closed') this.dec.close(); } catch (e) {} }
}

export class SeekSource {
  constructor(rec) { this.rec = rec; }
  async init() {
    const el = this.el = document.createElement('video'); el.muted = true; el.playsInline = true; el.preload = 'auto'; el.src = this.rec.url;
    await once(el, 'loadeddata', 20000);
  }
  async frameAt(t) {
    const el = this.el; if (!el) await this.init();
    const v = this.el, tt = Math.min(t, (v.duration || t) - 0.001);
    if (Math.abs(v.currentTime - tt) > 0.0005) {
      v.currentTime = tt; await once(v, 'seeked', 10000);
      if (v.requestVideoFrameCallback) await Promise.race([new Promise(r => v.requestVideoFrameCallback(r)), new Promise(r => setTimeout(r, 120))]);
    }
    return { img: v, w: v.videoWidth, h: v.videoHeight, rot: 0 };
  }
  close() { if (this.el) { this.el.removeAttribute('src'); this.el.load(); } }
}

/** Best source for a clip: WebCodecs decoder for MP4, element seeking otherwise (or if decoding fails later). */
export async function openSource(rec, startT, forceSeek) {
  if (!forceSeek && typeof VideoDecoder !== 'undefined') {
    const dm = await demux(rec);
    if (dm) {
      const ds = new DecoderSource(dm, startT); let fb = null;
      return { kind: 'decoder',
        frameAt: async t => {
          if (fb) return fb.frameAt(t);
          try { return await ds.frameAt(t); }
          catch (e) { console.warn('decoder failed, falling back to seeking', e); ds.close(); fb = new SeekSource(rec); return fb.frameAt(t); }
        },
        close: () => { ds.close(); fb && fb.close(); } };
    }
  }
  const s = new SeekSource(rec); return { kind: 'seek', frameAt: t => s.frameAt(t), close: () => s.close() };
}

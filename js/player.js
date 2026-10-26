/* Live preview: plays the project with real <video>/<audio> elements (hardware decoding, low memory) and draws
   every frame through the shared compositor. A master clock drives playback; elements are re-synced to it, and the
   clock waits while a video is still buffering so picture and sound never drift apart. */
import { media, bitmapOf } from './media.js';
import { FrameCache, playUrl } from './perf.js';
import { fontsVersion } from './fonts.js';
import { allClips } from './compound.js';
import { renderFrame } from './render.js';
import { drawGuides } from './protools.js';
import { clipEnd, projectDuration, srcTime, speedAt, hasSource, gainAt, panAt } from './project.js';
import { needsBake, bakedFor, bakedPos, bakedRate, keepPitch } from './audio.js';

const PRELOAD = 1.5, RESYNC = 0.3, MAX_EL = 10;

export class Player {
  constructor(canvas, o) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.o = o;
    this.t = 0; this.playing = false; this.slots = new Map(); this.pool = []; this.boxes = []; this.count = 0;
    this._raf = 0; this._drawQueued = false; this.voices = new Map(); this.muted = false;
    this.fcache = new FrameCache(128e6); this._bx = new Map(); this.ver = 0; this.adaptive = true; this.lowScale = 1; this.stats = { frames: 0, ms: 0, hits: 0, cached: 0, slow: 0, t0: performance.now(), list: [] };
  }
  /** Mute everything (used while recording a voice-over so the mic doesn't pick up the video). */
  setMuted(m) { this.muted = !!m; if (this.master) this.master.gain.value = m ? 0 : this.loud; }
  /** Master level that matches the loudness-normalised export (-14 LUFS). */
  setLoud(g) { this.loud = Math.max(0, Math.min(16, g || 1)); if (this.master && !this.muted) this.master.gain.value = this.loud; }
  get loud() { return this._loud ?? 1; }
  set loud(v) { this._loud = v; }
  get project() { return this.o.getProject(); }
  get duration() { return projectDuration(this.project); }

  /* ---------- audio graph (created on first user gesture) ---------- */
  ensureAudio() {
    if (!this.ac) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ac = new AC({ latencyHint: 'interactive' }); this.master = this.ac.createGain(); this.master.gain.value = this.muted ? 0 : this.loud; if (!this.o.silent) this.master.connect(this.ac.destination);
      if (this.o.recordDest) this.master.connect(this.o.recordDest(this.ac));
      for (const s of [...this.slots.values(), ...this.pool]) this.route(s);
    }
    if (this.ac.state === 'suspended') this.ac.resume().catch(() => {});
  }
  route(s) {
    if (s.gain || !this.ac) return;
    try { s.src = this.ac.createMediaElementSource(s.el); s.gain = this.ac.createGain(); s.pan = this.ac.createStereoPanner(); s.src.connect(s.gain).connect(s.pan).connect(this.master); } catch (e) { console.warn(e); }
  }

  /* ---------- element slots ---------- */
  makeSlot(rec) {
    const el = document.createElement(rec.type === 'audio' ? 'audio' : 'video');
    el.preload = 'auto'; el.playsInline = true; el.setAttribute('playsinline', ''); el.preservesPitch = false; const url = playUrl(rec, this.project); el.src = url;
    const s = { el, mediaId: rec.id, url };
    const redraw = () => { if (!this.playing) this.requestDraw(); };
    el.addEventListener('seeked', redraw); el.addEventListener('loadeddata', redraw);
    this.count++; this.route(s); return s;
  }
  release(s) { if (!s.el.paused) s.el.pause(); s.clipId = null; this.pool.push(s); }
  /** Make sure every clip that is audible/visible now (or starts soon while playing) has a synced element. */
  sync(t) {
    const p = this.project, want = new Map();
    for (const c of allClips(p)) {
      if (!hasSource(c) || !media.has(c.mediaId)) continue;
      const active = c.start <= t + 1e-9 && t < clipEnd(c) - 1e-9;
      const soon = this.playing && t < c.start && c.start - t < PRELOAD;
      if (active || soon) want.set(c.id, { c, active });
    }
    for (const [id, s] of this.slots) if (!want.has(id) || want.get(id).c.mediaId !== s.mediaId) { this.slots.delete(id); this.release(s); }
    for (const id of [...this.voices.keys()]) if (!want.has(id) || !want.get(id).active) this.stopVoice(id);
    for (const [id, w] of want) {
      let s = this.slots.get(id);
      if (!s) {
        const i = this.pool.findIndex(x => x.mediaId === w.c.mediaId);
        if (i >= 0) s = this.pool.splice(i, 1)[0];
        else if (this.count < MAX_EL) s = this.makeSlot(media.get(w.c.mediaId));
        else { const j = this.pool.findIndex(() => true); if (j < 0) continue; const old = this.pool.splice(j, 1)[0]; old.url = playUrl(media.get(w.c.mediaId), p); old.el.src = old.url; old.mediaId = w.c.mediaId; s = old; }
        s.clipId = id; this.slots.set(id, s);
      }
      { const u = playUrl(media.get(w.c.mediaId), p); if (s.url !== u) { s.url = u; s.el.src = u; } }   // proxy became ready / switched off
      const { c, active } = w, el = s.el, target = active ? srcTime(c, t) : c.in;
      const vol = active ? gainAt(p, c, t) : 0;
      // processed sound (enhance / voice effect / pitch-kept speed) plays from the baked buffer; the element only gives the picture
      const bk = needsBake(c) ? bakedFor(c, () => { if (this.playing) this.sync(this.t); }) : null, useBk = !!(bk && this.ac);
      if (s.gain) s.gain.gain.value = useBk ? 0 : vol; else el.volume = useBk ? 0 : Math.max(0, Math.min(1, vol));
      if (s.pan) s.pan.pan.value = active ? panAt(c, t) : 0;
      this.voice(c, useBk ? bk : null, t, vol, active);
      const pp = keepPitch(c) && !useBk; if (el.preservesPitch !== pp) el.preservesPitch = pp;
      if (active && this.playing) {
        const rate = Math.max(0.0625, Math.min(16, speedAt(c, t)));
        if (Math.abs(el.playbackRate - rate) > 1e-3) el.playbackRate = rate;
        if (el.paused) { if (Math.abs(el.currentTime - target) > 0.05) el.currentTime = target; el.play().catch(() => {}); }
        else if (Math.abs(el.currentTime - target) > RESYNC * Math.max(1, rate)) el.currentTime = target;
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - target) > 0.01) this.seekEl(el, target);
      }
    }
  }
  /** Keep a Web Audio voice for a baked clip running in step with the clock (restarts if it drifts > 50 ms). */
  voice(c, bk, t, vol, active) {
    let v = this.voices.get(c.id);
    if (!bk || !active || !this.playing || !this.ac) { if (v) this.stopVoice(c.id); return; }
    const rate = bakedRate(bk, c), pos = bakedPos(bk, c, t), now = this.ac.currentTime;
    if (v && (v.buf !== bk.buf || Math.abs(v.rate - rate) > 1e-6 || Math.abs(v.off + (now - v.t0) * rate - pos) > 0.05)) { this.stopVoice(c.id); v = null; }
    if (!v) {
      if (pos >= bk.buf.duration) return;
      const src = this.ac.createBufferSource(), g = this.ac.createGain(), pn = this.ac.createStereoPanner(); src.buffer = bk.buf; src.playbackRate.value = rate; g.gain.value = vol; pn.pan.value = panAt(c, t);
      src.connect(g).connect(pn).connect(this.master); src.start(now, Math.max(0, pos));
      this.voices.set(c.id, v = { src, g, pn, buf: bk.buf, rate, off: Math.max(0, pos), t0: now });
    } else { v.g.gain.setTargetAtTime(vol, now, 0.008); v.pn.pan.setTargetAtTime(panAt(c, t), now, 0.008); }
  }
  /** Coalesced seeking: while a video is still seeking, only the newest target is kept (no queue of stale seeks on long videos).
      While the finger is scrubbing, fastSeek (nearest keyframe) is used when available; the exact frame follows on release. */
  seekEl(el, target) {
    if (el.seeking) { if (!el._pend) el.addEventListener('seeked', () => { const x = el._pend; el._pend = null; if (x != null && Math.abs(el.currentTime - x) > 0.01) this.seekEl(el, x); }, { once: true }); el._pend = target; return; }
    const scrub = performance.now() - (this._lastSeek || 0) < 120 && this.scrubbing;
    if (scrub && el.fastSeek) el.fastSeek(target); else el.currentTime = target;
  }
  stopVoice(id) { const v = this.voices.get(id); if (!v) return; this.voices.delete(id); try { v.src.stop(); } catch (e) {} try { v.src.disconnect(); v.g.disconnect(); v.pn && v.pn.disconnect(); } catch (e) {} }
  stalled() {
    for (const s of this.slots.values()) { const f = this.project && this.slots.get(s.clipId) && s.el;
      if (f && s.el.tagName === 'VIDEO' && !s.el.paused && (s.el.seeking || s.el.readyState < 3)) return true; }
    return false;
  }

  /* ---------- transport ---------- */
  play() {
    const d = this.duration; if (!d) return;
    this.ensureAudio();
    if (this.t >= d - 0.02) this.t = 0;
    this.playing = true; this.t0 = this.t; this.n0 = performance.now();
    this.sync(this.t); this.o.onState && this.o.onState(true);
    // B16: the first frame is drawn on the next animation frame, so the Play tap paints its new icon at once
    cancelAnimationFrame(this._raf); this._raf = requestAnimationFrame(() => { if (this.playing) { this.n0 = performance.now(); this.t0 = this.t; this.loop(); } });
  }
  pause() {
    this.stopAt = null; if (!this.playing) return; this.playing = false; cancelAnimationFrame(this._raf);
    for (const s of this.slots.values()) s.el.pause();
    for (const id of [...this.voices.keys()]) this.stopVoice(id);
    this.sync(this.t); this.draw(); this.o.onState && this.o.onState(false);
  }
  /** Play just a section (used to preview a transition), then stop. */
  playRange(a, b, back = null) { this.pause(); this.seek(a); this.stopAt = b; this._back = back; this.play(); }
  toggle() { this.playing ? this.pause() : this.play(); }
  seek(t, scrub = false) {
    const d = this.duration; this.t = Math.max(0, Math.min(d || 0, t)); if (scrub) this._lastSeek = performance.now();
    if (this.playing) { this.t0 = this.t; this.n0 = performance.now(); }
    this.sync(this.t); this.requestDraw(); this.o.onSeek && this.o.onSeek(this.t);
  }
  loop() {
    const now = performance.now();
    if (this.stalled()) { this.t0 = this.t; this.n0 = now; }
    else this.t = this.t0 + (now - this.n0) / 1000;
    const d = this.stopAt != null ? Math.min(this.duration, this.stopAt) : this.duration;
    if (this.t >= d) { const back = this.stopAt != null ? this._back : null; this.stopAt = null; this._back = null; this.t = d; this.sync(this.t); this.draw(); this.o.onTime && this.o.onTime(this.t); this.pause(); this.o.onEnd && this.o.onEnd(); if (back != null) { this.seek(back); this.o.onTime && this.o.onTime(this.t); } return; }
    this.sync(this.t); this.draw(); this.o.onTime && this.o.onTime(this.t);
    this._raf = requestAnimationFrame(() => this.loop());
  }
  /** Preview redraw after UI changes: the UI (sheet, toolbar, timeline) is painted first, the frame right after it (taps never wait for the picture). */
  requestDraw() { if (this._drawQueued) return; this._drawQueued = true; const go = () => setTimeout(() => { this._drawQueued = false; this.draw(); }, 0);
    // after an input, wait until the UI frame has been presented (2 frames) before the heavy preview render
    if (performance.now() - (window.__lastInput || 0) < 300 && !this.scrubbing) requestAnimationFrame(() => requestAnimationFrame(go)); else requestAnimationFrame(go); }
  /** Forget cached preview frames (the project, a media file or a font changed). */
  invalidate() { this.ver++; this.fcache.clear(); this._bx.clear(); }
  /** Every element is at its time and has a picture: the frame on screen is final (safe to cache). */
  settled() { for (const s of this.slots.values()) if (s.el.tagName === 'VIDEO' && (s.el.seeking || s.el.readyState < 2)) return false; return !this._miss; }
  frameKey(sel) { const p = this.project; return `${this.ver}|${fontsVersion}|${Math.round(this.t * (p.fps || 30))}|${this.canvas.width}x${this.canvas.height}|${sel || ''}|${this.cropEdit || ''}`; }
  draw() {
    const { canvas, ctx } = this, p = this.project; if (!p) return;
    const T0 = performance.now();
    if (!this.playing && !this.compare && !this.guides && this.fcache.max > 0) {   // frame cache: scrubbing back over frames already seen
      const sel0 = this.o.showSelection === false ? null : this.o.selected && this.o.selected(), key = this.frameKey(sel0), bm = this.fcache.get(key);
      if (bm) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.globalCompositeOperation = 'copy'; ctx.drawImage(bm, 0, 0); ctx.restore(); this.boxes = this._bx.get(key) || this.boxes; this.stats.hits++; this.lastDraw = { ms: performance.now() - T0, cached: true }; return; }
    }
    this._miss = false;
    // lighter HD pass while playing / scrubbing; the full pass is drawn as soon as the picture settles
    const now = performance.now(), fast = this.playing || now - (this._lastSeek || 0) < 220;
    if (fast && !this.playing) { clearTimeout(this._settle); this._settle = setTimeout(() => this.requestDraw(), 240); }
    const sel = this.o.showSelection === false ? null : this.o.selected && this.o.selected(), cmp = this.compare;
    const src = c => { const r = this.source(c); if (!r) this._miss = true; return r; };
    if (cmp && cmp.mode === 'before') { this.boxes = renderFrame(ctx, canvas.width, canvas.height, p, this.t, src, { plain: true, selectedId: sel }); if (this.guides) drawGuides(ctx, canvas.width, canvas.height, this.guides); return; }
    const low = this.playing && this.adaptive && this.lowScale < 1 && !cmp;
    if (low) {   // smooth preview: a slow frame rate drops the internal resolution while playing (full quality when paused)
      const w = Math.max(2, Math.round(canvas.width * this.lowScale)), h = Math.max(2, Math.round(canvas.height * this.lowScale));
      if (!this._lo || this._lo.width !== w || this._lo.height !== h) this._lo = Object.assign(document.createElement('canvas'), { width: w, height: h });
      renderFrame(this._lo.getContext('2d'), w, h, p, this.t, src, { selectedId: null, fast: true });
      ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.imageSmoothingQuality = 'medium'; ctx.drawImage(this._lo, 0, 0, canvas.width, canvas.height); ctx.restore();
    } else this.boxes = renderFrame(ctx, canvas.width, canvas.height, p, this.t, src, { selectedId: cmp || this.cropEdit ? null : sel, fast, cropEdit: cmp ? null : this.cropEdit });
    const ms = performance.now() - T0; this.lastDraw = { ms, cached: false, low: low ? this.lowScale : 1 };
    if (this.playing) { const S_ = this.stats; S_.frames++; S_.ms += ms; S_.list.push(ms); if (S_.list.length > 600) S_.list.shift(); if (ms > 16.7) S_.slow++;
      if (this.adaptive) { this._ema = (this._ema ?? ms) * 0.85 + ms * 0.15;
        if (this._ema > 22 && this.lowScale > 0.5) { this.lowScale = Math.max(0.5, this.lowScale - 0.25); this._ema = 14; }
        else if (this._ema < 7 && this.lowScale < 1) { this.lowScale = Math.min(1, this.lowScale + 0.25); this._ema = 12; } } }
    else if (!fast && !cmp && !this.guides && this.fcache.max > 0 && this.settled()) {
      const key = this.frameKey(sel), bx = this.boxes, v = this.ver; this.stats.cached++;
      createImageBitmap(canvas).then(bm => { if (v === this.ver) { this.fcache.put(key, bm); this._bx.set(key, bx); } else bm.close(); }, () => {});
    }
    if (cmp && cmp.mode === 'split') {   // left of the line: original (plain), right: with HD / adjust
      const w = canvas.width, h = canvas.height, x = Math.max(0, Math.min(w, Math.round(cmp.x * w)));
      if (!this._before || this._before.width !== w || this._before.height !== h) this._before = Object.assign(document.createElement('canvas'), { width: w, height: h });
      renderFrame(this._before.getContext('2d'), w, h, p, this.t, src, { plain: true });
      if (x > 0) ctx.drawImage(this._before, 0, 0, x, h, 0, 0, x, h);
    }
    if (this.guides) drawGuides(ctx, canvas.width, canvas.height, this.guides);   // preview only, never exported
  }
  source(c) {
    const rec = media.get(c.mediaId); if (!rec) return null;
    if (c.type === 'image') { const bm = bitmapOf(rec, () => this.requestDraw()); return bm ? { img: bm, w: bm.width, h: bm.height } : null; }
    const s = this.slots.get(c.id); if (!s || s.el.readyState < 2 || !s.el.videoWidth) return null;
    return { img: s.el, w: s.el.videoWidth, h: s.el.videoHeight };
  }
  /** Drop elements for media that was removed (keeps phone decoders free). */
  gc() { const ids = new Set(); for (const c of allClips(this.project)) ids.add(c.mediaId);
    this.pool = this.pool.filter(s => { if (ids.has(s.mediaId)) return true; s.el.removeAttribute('src'); s.el.load(); this.count--; return false; }); }
  destroy() { this.pause(); for (const id of [...this.voices.keys()]) this.stopVoice(id); for (const s of [...this.slots.values(), ...this.pool]) { s.el.pause(); s.el.removeAttribute('src'); s.el.load(); } this.slots.clear(); this.pool = []; if (this.ac) this.ac.close(); }
}

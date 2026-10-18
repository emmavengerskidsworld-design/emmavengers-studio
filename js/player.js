/* Live preview: plays the project with real <video>/<audio> elements (hardware decoding, low memory) and draws
   every frame through the shared compositor. A master clock drives playback; elements are re-synced to it, and the
   clock waits while a video is still buffering so picture and sound never drift apart. */
import { media, bitmapOf } from './media.js';
import { renderFrame } from './render.js';
import { clipEnd, projectDuration, srcTime, hasSource, gainAt } from './project.js';
import { needsBake, bakedFor, bakedPos, bakedRate, keepPitch } from './audio.js';

const PRELOAD = 1.5, RESYNC = 0.3, MAX_EL = 10;

export class Player {
  constructor(canvas, o) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.o = o;
    this.t = 0; this.playing = false; this.slots = new Map(); this.pool = []; this.boxes = []; this.count = 0;
    this._raf = 0; this._drawQueued = false; this.voices = new Map(); this.muted = false;
  }
  /** Mute everything (used while recording a voice-over so the mic doesn't pick up the video). */
  setMuted(m) { this.muted = !!m; if (this.master) this.master.gain.value = m ? 0 : 1; }
  get project() { return this.o.getProject(); }
  get duration() { return projectDuration(this.project); }

  /* ---------- audio graph (created on first user gesture) ---------- */
  ensureAudio() {
    if (!this.ac) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ac = new AC({ latencyHint: 'interactive' }); this.master = this.ac.createGain(); this.master.gain.value = this.muted ? 0 : 1; if (!this.o.silent) this.master.connect(this.ac.destination);
      if (this.o.recordDest) this.master.connect(this.o.recordDest(this.ac));
      for (const s of [...this.slots.values(), ...this.pool]) this.route(s);
    }
    if (this.ac.state === 'suspended') this.ac.resume().catch(() => {});
  }
  route(s) {
    if (s.gain || !this.ac) return;
    try { s.src = this.ac.createMediaElementSource(s.el); s.gain = this.ac.createGain(); s.src.connect(s.gain).connect(this.master); } catch (e) { console.warn(e); }
  }

  /* ---------- element slots ---------- */
  makeSlot(rec) {
    const el = document.createElement(rec.type === 'audio' ? 'audio' : 'video');
    el.preload = 'auto'; el.playsInline = true; el.setAttribute('playsinline', ''); el.preservesPitch = false; el.src = rec.url;
    const s = { el, mediaId: rec.id };
    const redraw = () => { if (!this.playing) this.requestDraw(); };
    el.addEventListener('seeked', redraw); el.addEventListener('loadeddata', redraw);
    this.count++; this.route(s); return s;
  }
  release(s) { if (!s.el.paused) s.el.pause(); s.clipId = null; this.pool.push(s); }
  /** Make sure every clip that is audible/visible now (or starts soon while playing) has a synced element. */
  sync(t) {
    const p = this.project, want = new Map();
    for (const track of p.tracks) for (const c of track.clips) {
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
        else { const j = this.pool.findIndex(() => true); if (j < 0) continue; const old = this.pool.splice(j, 1)[0]; old.el.src = media.get(w.c.mediaId).url; old.mediaId = w.c.mediaId; s = old; }
        s.clipId = id; this.slots.set(id, s);
      }
      const { c, active } = w, el = s.el, target = active ? srcTime(c, t) : c.in;
      const vol = active ? gainAt(p, c, t) : 0;
      // processed sound (enhance / voice effect / pitch-kept speed) plays from the baked buffer; the element only gives the picture
      const bk = needsBake(c) ? bakedFor(c, () => { if (this.playing) this.sync(this.t); }) : null, useBk = !!(bk && this.ac);
      if (s.gain) s.gain.gain.value = useBk ? 0 : vol; else el.volume = useBk ? 0 : Math.max(0, Math.min(1, vol));
      this.voice(c, useBk ? bk : null, t, vol, active);
      const pp = keepPitch(c) && !useBk; if (el.preservesPitch !== pp) el.preservesPitch = pp;
      if (active && this.playing) {
        if (el.playbackRate !== c.speed) el.playbackRate = c.speed;
        if (el.paused) { if (Math.abs(el.currentTime - target) > 0.05) el.currentTime = target; el.play().catch(() => {}); }
        else if (Math.abs(el.currentTime - target) > RESYNC * Math.max(1, c.speed)) el.currentTime = target;
      } else {
        if (!el.paused) el.pause();
        if (Math.abs(el.currentTime - target) > 0.01) el.currentTime = target;
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
      const src = this.ac.createBufferSource(), g = this.ac.createGain(); src.buffer = bk.buf; src.playbackRate.value = rate; g.gain.value = vol;
      src.connect(g).connect(this.master); src.start(now, Math.max(0, pos));
      this.voices.set(c.id, v = { src, g, buf: bk.buf, rate, off: Math.max(0, pos), t0: now });
    } else v.g.gain.setTargetAtTime(vol, now, 0.008);
  }
  stopVoice(id) { const v = this.voices.get(id); if (!v) return; this.voices.delete(id); try { v.src.stop(); } catch (e) {} try { v.src.disconnect(); v.g.disconnect(); } catch (e) {} }
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
    this.sync(this.t); this.loop(); this.o.onState && this.o.onState(true);
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
    this.sync(this.t); this.requestDraw();
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
  requestDraw() { if (this._drawQueued) return; this._drawQueued = true; requestAnimationFrame(() => { this._drawQueued = false; this.draw(); }); }
  draw() {
    const { canvas, ctx } = this, p = this.project; if (!p) return;
    // lighter HD pass while playing / scrubbing; the full pass is drawn as soon as the picture settles
    const now = performance.now(), fast = this.playing || now - (this._lastSeek || 0) < 220;
    if (fast && !this.playing) { clearTimeout(this._settle); this._settle = setTimeout(() => this.requestDraw(), 240); }
    const sel = this.o.showSelection === false ? null : this.o.selected && this.o.selected(), cmp = this.compare;
    const src = c => this.source(c);
    if (cmp && cmp.mode === 'before') { this.boxes = renderFrame(ctx, canvas.width, canvas.height, p, this.t, src, { plain: true, selectedId: sel }); return; }
    this.boxes = renderFrame(ctx, canvas.width, canvas.height, p, this.t, src, { selectedId: cmp ? null : sel, fast });
    if (cmp && cmp.mode === 'split') {   // left of the line: original (plain), right: with HD / adjust
      const w = canvas.width, h = canvas.height, x = Math.max(0, Math.min(w, Math.round(cmp.x * w)));
      if (!this._before || this._before.width !== w || this._before.height !== h) this._before = Object.assign(document.createElement('canvas'), { width: w, height: h });
      renderFrame(this._before.getContext('2d'), w, h, p, this.t, src, { plain: true });
      if (x > 0) ctx.drawImage(this._before, 0, 0, x, h, 0, 0, x, h);
    }
  }
  source(c) {
    const rec = media.get(c.mediaId); if (!rec) return null;
    if (c.type === 'image') { const bm = bitmapOf(rec, () => this.requestDraw()); return bm ? { img: bm, w: bm.width, h: bm.height } : null; }
    const s = this.slots.get(c.id); if (!s || s.el.readyState < 2 || !s.el.videoWidth) return null;
    return { img: s.el, w: s.el.videoWidth, h: s.el.videoHeight };
  }
  /** Drop elements for media that was removed (keeps phone decoders free). */
  gc() { const ids = new Set(); for (const t of this.project.tracks) for (const c of t.clips) ids.add(c.mediaId);
    this.pool = this.pool.filter(s => { if (ids.has(s.mediaId)) return true; s.el.removeAttribute('src'); s.el.load(); this.count--; return false; }); }
  destroy() { this.pause(); for (const id of [...this.voices.keys()]) this.stopVoice(id); for (const s of [...this.slots.values(), ...this.pool]) { s.el.pause(); s.el.removeAttribute('src'); s.el.load(); } this.slots.clear(); this.pool = []; if (this.ac) this.ac.close(); }
}

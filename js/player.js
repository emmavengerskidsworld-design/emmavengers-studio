/* Live preview: plays the project with real <video>/<audio> elements (hardware decoding, low memory) and draws
   every frame through the shared compositor. A master clock drives playback; elements are re-synced to it, and the
   clock waits while a video is still buffering so picture and sound never drift apart. */
import { media, bitmapOf } from './media.js';
import { renderFrame } from './render.js';
import { clipEnd, projectDuration, srcTime, hasSource } from './project.js';

const PRELOAD = 1.5, RESYNC = 0.3, MAX_EL = 10;

export class Player {
  constructor(canvas, o) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.o = o;
    this.t = 0; this.playing = false; this.slots = new Map(); this.pool = []; this.boxes = []; this.count = 0;
    this._raf = 0; this._drawQueued = false;
  }
  get project() { return this.o.getProject(); }
  get duration() { return projectDuration(this.project); }

  /* ---------- audio graph (created on first user gesture) ---------- */
  ensureAudio() {
    if (!this.ac) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ac = new AC({ latencyHint: 'interactive' }); this.master = this.ac.createGain(); if (!this.o.silent) this.master.connect(this.ac.destination);
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
      const vol = c.volume ?? 1;
      if (s.gain) s.gain.gain.value = vol; else el.volume = Math.min(1, vol);
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
    if (!this.playing) return; this.playing = false; cancelAnimationFrame(this._raf);
    for (const s of this.slots.values()) s.el.pause();
    this.sync(this.t); this.draw(); this.o.onState && this.o.onState(false);
  }
  toggle() { this.playing ? this.pause() : this.play(); }
  seek(t) {
    const d = this.duration; this.t = Math.max(0, Math.min(d || 0, t));
    if (this.playing) { this.t0 = this.t; this.n0 = performance.now(); }
    this.sync(this.t); this.requestDraw();
  }
  loop() {
    const now = performance.now();
    if (this.stalled()) { this.t0 = this.t; this.n0 = now; }
    else this.t = this.t0 + (now - this.n0) / 1000;
    const d = this.duration;
    if (this.t >= d) { this.t = d; this.sync(this.t); this.draw(); this.o.onTime && this.o.onTime(this.t); this.pause(); this.o.onEnd && this.o.onEnd(); return; }
    this.sync(this.t); this.draw(); this.o.onTime && this.o.onTime(this.t);
    this._raf = requestAnimationFrame(() => this.loop());
  }
  requestDraw() { if (this._drawQueued) return; this._drawQueued = true; requestAnimationFrame(() => { this._drawQueued = false; this.draw(); }); }
  draw() {
    const { canvas, ctx } = this, p = this.project; if (!p) return;
    this.boxes = renderFrame(ctx, canvas.width, canvas.height, p, this.t, c => this.source(c), { selectedId: this.o.showSelection === false ? null : this.o.selected && this.o.selected() });
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
  destroy() { this.pause(); for (const s of [...this.slots.values(), ...this.pool]) { s.el.pause(); s.el.removeAttribute('src'); s.el.load(); } this.slots.clear(); this.pool = []; if (this.ac) this.ac.close(); }
}

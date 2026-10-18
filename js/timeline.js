/* CapCut-style timeline: fixed centre playhead, horizontally scrolling tracks, pinch / buttons to zoom.
   Tap = select, drag edges = trim, long-press (touch) or drag (mouse) = move / reorder. */
import { animSpans, loopKind } from './animations.js';
import { S, live, begin, end, select } from './store.js';
import { TRACK_KINDS } from './registry.js';
import { clipDur, clipEnd, projectDuration, hasSource, reorder, moveTo, trim, find, kfTimes, fadeAt, MAX_FADE, srcTime, beatTimes } from './project.js';
import { propAt } from './registry.js';
import { voiceFxById } from './audiofx.js';
import { transitionById } from './transitions.js';
import { media, TILE, PEAK_RATE } from './media.js';
import { icon } from './icons.js';
import { effectById, filterGL } from './effects.js';

const MIN_PPS = 4, MAX_PPS = 600, LONG_PRESS = 350, SNAP_PX = 10;
const fmtS = s => s < 10 ? s.toFixed(1) + 's' : s < 60 ? Math.round(s) + 's' : Math.floor(s / 60) + ':' + String(Math.round(s % 60)).padStart(2, '0');

export class Timeline {
  constructor(o) {
    this.o = o; this.pps = 50; this._expect = null; this.drag = null; this.pinch = null;
    this.scroll = document.getElementById('tlScroll'); this.content = document.getElementById('tlContent');
    this.tracksEl = document.getElementById('tracks'); this.ruler = document.getElementById('ruler'); this.tip = document.getElementById('tlTip');
    this.scroll.addEventListener('scroll', () => this.onScroll(), { passive: true });
    this.tracksEl.addEventListener('pointerdown', e => this.down(e));
    addEventListener('pointermove', e => this.move(e)); addEventListener('pointerup', e => this.up(e)); addEventListener('pointercancel', e => this.cancel(e));
    this.scroll.addEventListener('touchstart', e => this.touchStart(e), { passive: true });
    this.scroll.addEventListener('touchmove', e => this.touchMove(e), { passive: false });
    this.scroll.addEventListener('touchend', e => { if (e.touches.length < 2) this.pinch = null; });
    this.scroll.addEventListener('wheel', e => { if (e.ctrlKey || e.metaKey) { e.preventDefault(); this.zoomBy(Math.exp(-e.deltaY / 300)); } }, { passive: false });
    this.scroll.addEventListener('contextmenu', e => e.preventDefault());
    new ResizeObserver(() => { this.render(); this.setTime(this.o.getTime()); }).observe(this.scroll);
  }
  get pad() { return Math.round(this.scroll.clientWidth / 2); }
  timeAtClientX(x) { const r = this.scroll.getBoundingClientRect(); return (x - r.left + this.scroll.scrollLeft - this.pad) / this.pps; }

  /* ---------- scrolling = scrubbing ---------- */
  setTime(t) {
    const x = Math.round(t * this.pps); if (Math.abs(this.scroll.scrollLeft - x) < 0.5) { this.drawRuler(); return; }
    this._expect = x; this.scroll.scrollLeft = x; this.drawRuler();
  }
  onScroll() {
    this.drawRuler();
    const x = this.scroll.scrollLeft;
    if (this._expect != null && Math.abs(x - this._expect) <= 1) { this._expect = null; return; }
    this._expect = null;
    if (this.o.isPlaying()) this.o.pause();
    this.o.seek(Math.max(0, Math.min(projectDuration(S.project), x / this.pps)), true);
  }
  zoomBy(f) { this.setZoom(this.pps * f); }
  setZoom(pps) { const t = this.o.getTime(); this.pps = Math.max(MIN_PPS, Math.min(MAX_PPS, pps)); this.render(); this.setTime(t); }
  fitZoom() { const d = projectDuration(S.project); if (d) this.pps = Math.max(MIN_PPS, Math.min(MAX_PPS, (this.scroll.clientWidth * 0.8) / d)); }

  touchStart(e) { if (e.touches.length === 2) { const [a, b] = e.touches; this.pinch = { d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), pps: this.pps }; if (this.drag) this.cancel(); } }
  touchMove(e) {
    if (this.drag && this.drag.active) { e.preventDefault(); return; }
    if (this.pinch && e.touches.length === 2) { e.preventDefault(); const [a, b] = e.touches; const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); this.setZoom(this.pinch.pps * d / this.pinch.d); }
  }

  /* ---------- drawing ---------- */
  render() {
    const p = S.project, pps = this.pps, D = projectDuration(p), w = Math.max(1, Math.ceil(D * pps));
    this.content.style.width = (w + this.pad * 2) + 'px';
    this.tracksEl.style.paddingLeft = this.pad + 'px'; this.tracksEl.style.paddingRight = this.pad + 'px';
    const frag = document.createDocumentFragment();
    for (const t of p.tracks) {
      const K = TRACK_KINDS[t.kind], row = document.createElement('div');
      row.className = 'row k-' + t.kind; row.dataset.track = t.id; row.style.height = K.height + 'px'; row.style.width = w + 'px';
      if (t.kind === 'main' && !t.clips.length) { row.classList.add('hint'); row.innerHTML = `<button class="rowhint" data-add="main">${icon('plus', 16)} Add video or photo</button>`; }
      for (const c of t.clips) row.appendChild(this.clipEl(c, t, K));
      if (K.magnetic) t.clips.forEach((b, i) => { if (!i) return; const a = t.clips[i - 1];
        if (S.sel === a.id || S.sel === b.id) return;            // keep trim handles free on the selected clip
        const x = (b.start + (clipEnd(a) - b.start) / 2) * this.pps, tr = b.transitionIn && transitionById(b.transitionIn.id);
        const j = document.createElement('button'); j.className = 'joint' + (tr ? ' on' : ''); j.dataset.joint = b.id; j.style.left = (x - 12) + 'px';
        j.title = tr ? tr.name : 'Add transition'; j.setAttribute('aria-label', j.title);
        j.innerHTML = tr ? '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M4 5l8 7-8 7zM20 5l-8 7 8 7z" fill="currentColor"/></svg>' : '<svg viewBox="0 0 24 24" width="12" height="12"><path d="M5 12h14" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
        row.appendChild(j); });
      frag.appendChild(row);
    }
    if (!p.tracks.some(t => t.kind === 'audio')) { const row = document.createElement('div'); row.className = 'row hint k-audio'; row.style.height = TRACK_KINDS.audio.height + 'px'; row.innerHTML = `<button class="rowhint" data-add="audio">${icon('music', 16)} Add audio</button>`; frag.appendChild(row); }
    this.tracksEl.replaceChildren(frag);
    this.drawRuler();
  }
  clipEl(c, t, K) {
    const el = document.createElement('div'), d = clipDur(c), wpx = Math.max(2, d * this.pps);
    el.className = 'clip c-' + c.type + (S.sel === c.id ? ' sel' : ''); el.dataset.id = c.id;
    el.style.left = (c.start * this.pps) + 'px'; el.style.width = wpx + 'px';
    const rec = media.get(c.mediaId), h = K.height - 4;
    if (c.type === 'video' || c.type === 'image' || c.type === 'audio') {
      const cv = document.createElement('canvas'), cw = Math.min(4096, Math.ceil(wpx));
      cv.width = cw; cv.height = h; cv.className = 'thumbs'; el.appendChild(cv);
      if (rec) this.paintClip(cv.getContext('2d'), c, rec, cw, h, cw / wpx);
    }
    const badges = [];
    if (c.type === 'text') badges.push(`<span class="ctext">${esc(c.text.content.split('\n')[0] || 'Text')}</span>`);
    else if (c.type === 'effect') { const e = c.effect && (c.effect.kind === 'filter' ? filterGL(c.effect.id) : effectById(c.effect.id)); badges.push(`<span class="ctext">${icon('effects', 12)} ${esc(e ? e.name : 'Effect')}</span>`); }
    else if (c.type === 'audio') badges.push(`<span class="cname">${esc(rec ? rec.name : 'Audio')}</span>`) && c.beat && badges.push(`<span class="spd bpm" title="Beat markers">♩${Math.round(c.beat.bpm)}</span>`);
    if (S.sel === c.id || c.type === 'video') badges.push(`<span class="dur">${fmtS(d)}</span>`);
    if (c.curve) badges.push(`<span class="spd">curve</span>`); else if (c.speed !== 1) badges.push(`<span class="spd">${c.speed}x</span>`);
    if (hasSource(c) && (c.volume === 0 || c.muteAudio)) badges.push(`<span class="spd">${icon('volume', 11)}✕</span>`);
    if (c.voice && c.voice.enhance) badges.push('<span class="spd" title="Enhance voice">✨</span>');
    if (c.voice && c.voice.fx && voiceFxById(c.voice.fx)) badges.push(`<span class="spd" title="${voiceFxById(c.voice.fx).name}">${voiceFxById(c.voice.fx).emoji}</span>`);
    if ((c.filter && c.filter.id) || (c.effects && c.effects.length)) badges.push(`<span class="spd">FX</span>`);
    if (c.placeholder && c.placeholder !== 'text') badges.push(`<span class="ph" title="${esc(c.placeholder)}">Replace</span>`);
    if (!rec && c.type !== 'text' && c.type !== 'effect') badges.push('<span class="spd">missing</span>');
    el.insertAdjacentHTML('beforeend', `<div class="badges">${badges.join('')}</div>`);
    if (c.anim) { const { di, dO } = animSpans(c, d), lp = c.anim[loopKind(c)];
      if (di > 0) el.insertAdjacentHTML('beforeend', `<i class="anin" style="width:${(di * this.pps).toFixed(1)}px"></i>`);
      if (dO > 0) el.insertAdjacentHTML('beforeend', `<i class="anout" style="width:${(dO * this.pps).toFixed(1)}px"></i>`);
      if (lp && lp.id) el.insertAdjacentHTML('beforeend', '<i class="anloop">∞</i>'); }
    const kts = kfTimes(c); if (kts.length) el.insertAdjacentHTML('beforeend', kts.filter(k => k <= d + 1e-6).map(k => `<i class="kfd" style="left:${(k * this.pps).toFixed(1)}px"></i>`).join(''));
    if (S.sel === c.id) el.insertAdjacentHTML('beforeend', '<div class="h l" data-edge="left"><i></i></div><div class="h r" data-edge="right"><i></i></div>');
    if (S.sel === c.id && hasSource(c) && wpx > 60) el.insertAdjacentHTML('beforeend', `<b class="fh fi" data-fade="in" style="left:${Math.max(10, (c.fadeIn || 0) * this.pps).toFixed(1)}px" title="Fade in"></b><b class="fh fo" data-fade="out" style="right:${Math.max(10, (c.fadeOut || 0) * this.pps).toFixed(1)}px" title="Fade out"></b>`);
    return el;
  }
  /** Waveform (peaks, shaped by the volume envelope: keyframes x fades), envelope line and fade ramps. */
  paintWave(ctx, c, rec, cw, y0, h, pps, color, line) {
    const pk = rec.peaks, gAt = x => { const L = x / pps; return Math.max(0, propAt(c, 'volume', L)) * fadeAt(c, c.start + L) * (c.muteAudio ? 0 : 1); };
    if (pk) { ctx.fillStyle = color; for (let x = 0; x < cw; x += 2) { const st = srcTime(c, c.start + x / pps), v = pk[Math.min(pk.length - 1, Math.floor(st * PEAK_RATE))] || 0, bh = Math.max(1, Math.min(1, v * Math.min(2, gAt(x))) * (h - 4)); ctx.fillRect(x, y0 + (h - bh) / 2, 1.4, bh); } }
    const d = clipDur(c), fi = Math.min(c.fadeIn || 0, d) * pps, fo = Math.min(c.fadeOut || 0, d) * pps;
    ctx.fillStyle = 'rgba(0,0,0,.38)';
    if (fi > 0) { ctx.beginPath(); ctx.moveTo(0, y0); ctx.lineTo(fi, y0); ctx.lineTo(0, y0 + h); ctx.fill(); }
    if (fo > 0) { ctx.beginPath(); ctx.moveTo(cw, y0); ctx.lineTo(cw - fo, y0); ctx.lineTo(cw, y0 + h); ctx.fill(); }
    if (line) { ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 1.5; ctx.beginPath(); for (let x = 0; x <= cw; x += 3) { const yy = y0 + h - 2 - Math.min(2, gAt(Math.min(x, cw - 0.01))) / 2 * (h - 4); x ? ctx.lineTo(x, yy) : ctx.moveTo(x, yy); } ctx.stroke(); }
  }
  /** Beat markers of library music: a full-height line on each bar, a short tick on each beat. */
  paintBeats(ctx, c, h, pps) {
    const bt = beatTimes(c), sparse = bt.length > 1 && (bt[1].t - bt[0].t) * pps < 5;
    for (const b of bt) { if (sparse && !b.down) continue; const x = Math.round((b.t - c.start) * pps);
      ctx.fillStyle = b.down ? 'rgba(255,240,170,.9)' : 'rgba(255,255,255,.8)'; if (b.down) ctx.fillRect(x, 0, 1.5, h); else { ctx.fillRect(x, 0, 1.5, h * .3); ctx.fillRect(x, h * .7, 1.5, h * .3); } }
  }
  paintClip(ctx, c, rec, cw, h, k) {
    const pps = this.pps * k;
    if (c.type === 'audio' || (c.type === 'video' && !rec.thumbBitmap && rec.peaks)) {
      ctx.fillStyle = '#1d6b57'; ctx.fillRect(0, 0, cw, h);
      this.paintWave(ctx, c, rec, cw, 0, h, pps, '#7ef0c8', c.type === 'audio');
      if (c.beat) this.paintBeats(ctx, c, h, pps);
      return;
    }
    const bm = rec.thumbBitmap; if (!bm) { ctx.fillStyle = '#333'; ctx.fillRect(0, 0, cw, h); return; }
    const n = rec.thumbN || 1;
    for (let x = 0; x < cw; x += h) {
      let idx = 0;
      if (c.type === 'video') { const st = srcTime(c, c.start + (x + h / 2) / pps); idx = Math.max(0, Math.min(n - 1, Math.floor(st / rec.duration * n))); }
      ctx.drawImage(bm, idx * TILE, 0, TILE, TILE, x, 0, h, h);
    }
    // the video's own sound: a waveform strip along the bottom
    if (c.type === 'video' && rec.peaks && rec.hasAudio !== false) { const wh = Math.round(h * 0.34); ctx.fillStyle = 'rgba(10,40,32,.72)'; ctx.fillRect(0, h - wh, cw, wh); this.paintWave(ctx, c, rec, cw, h - wh, wh, pps, c.muteAudio ? '#6a7a74' : '#7ef0c8', false); }
  }
  drawRuler() {
    const cv = this.ruler, dpr = Math.min(2, devicePixelRatio || 1), W = cv.clientWidth, H = cv.clientHeight; if (!W) return;
    if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const ctx = cv.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const steps = [0.1, 0.2, 0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300], step = steps.find(s => s * this.pps >= 64) || 600;
    const t0 = (this.scroll.scrollLeft - this.pad) / this.pps, t1 = t0 + W / this.pps, D = projectDuration(S.project);
    ctx.fillStyle = '#8b8b96'; ctx.font = '600 10px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let s = Math.max(0, Math.floor(t0 / step) * step); s <= t1 + step; s += step) {
      const x = (s - t0) * this.pps; if (s > D + step) break;
      ctx.fillText(rulerLabel(s, step), x, 3);
      ctx.fillRect(x - 1, H - 6, 2, 2);
      for (let j = 1; j < 2; j++) { const xm = x + j * step * this.pps / 2; ctx.globalAlpha = .45; ctx.fillRect(xm - 1, H - 5, 2, 2); ctx.globalAlpha = 1; }
    }
  }

  /* ---------- gestures ---------- */
  down(e) {
    const add = e.target.closest('[data-add]'); if (add) { this.o.onAdd(add.dataset.add); return; }
    const jt = e.target.closest('[data-joint]'); if (jt) { e.preventDefault(); if (this.o.isPlaying()) this.o.pause(); this.o.onJoint(jt.dataset.joint); return; }
    if (e.button > 0) return;
    const fh = e.target.closest('.fh');
    if (fh) { const ce = fh.closest('.clip'), f0 = find(S.project, ce.dataset.id); if (!f0) return; e.preventDefault(); e.stopPropagation();
      this.drag = { id: f0.clip.id, el: ce, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, sl0: this.scroll.scrollLeft, pid: e.pointerId, mode: 'fade', fade: fh.dataset.fade, v0: f0.clip[fh.dataset.fade === 'in' ? 'fadeIn' : 'fadeOut'] || 0, active: false, orig: '' };
      this.startDrag(); try { ce.setPointerCapture(e.pointerId); } catch (er) {} return; }
    const clipEl = e.target.closest('.clip'), handle = e.target.closest('.h');
    if (this.o.isPlaying()) this.o.pause();
    if (!clipEl) { this.downEmpty = { x: e.clientX, y: e.clientY }; return; }
    const id = clipEl.dataset.id, f = find(S.project, id); if (!f) return;
    const d = { id, el: clipEl, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, sl0: this.scroll.scrollLeft, touch: e.pointerType !== 'mouse', pid: e.pointerId,
      orig: JSON.stringify(f.clip), kind: f.track.kind, track: f.track.id, start0: f.clip.start, active: false, mode: handle ? 'trim' : 'move', edge: handle && handle.dataset.edge };
    this.drag = d;
    if (handle) { e.preventDefault(); this.startDrag(); try { clipEl.setPointerCapture(e.pointerId); } catch (er) {} }
    else if (d.touch) d.timer = setTimeout(() => { if (this.drag === d) { this.startDrag(); navigator.vibrate && navigator.vibrate(12); } }, LONG_PRESS);
  }
  startDrag() {
    const d = this.drag; d.active = true; begin(); document.body.classList.add('tl-dragging');
    if (d.mode === 'move') { select(d.id); d.el = this.tracksEl.querySelector(`.clip[data-id="${d.id}"]`) || d.el; d.el.classList.add('dragging'); }
    this.autoScroll();
  }
  autoScroll() {
    const d = this.drag; if (!d || !d.active) return;
    const r = this.scroll.getBoundingClientRect(), edge = 36; let v = 0;
    if (d.x < r.left + edge) v = -Math.ceil((r.left + edge - d.x) / 3); else if (d.x > r.right - edge) v = Math.ceil((d.x - (r.right - edge)) / 3);
    if (v) { this._expect = null; this.scroll.scrollLeft += v; this.apply(); }
    requestAnimationFrame(() => this.autoScroll());
  }
  move(e) {
    const d = this.drag; if (!d || e.pointerId !== d.pid) return;
    d.x = e.clientX; d.y = e.clientY;
    const dist = Math.hypot(d.x - d.x0, d.y - d.y0);
    if (!d.active) {
      if (d.touch) { if (dist > 8) { clearTimeout(d.timer); this.drag = null; } return; }
      if (dist > 5) this.startDrag(); else return;
    }
    e.preventDefault(); this.apply();
  }
  apply() {
    const d = this.drag, p = S.project, pps = this.pps;
    const dt = (d.x - d.x0 + this.scroll.scrollLeft - d.sl0) / pps, f = find(p, d.id); if (!f) return;
    if (d.mode === 'fade') {
      const v = Math.round(Math.max(0, Math.min(MAX_FADE, clipDur(f.clip), d.v0 + (d.fade === 'in' ? dt : -dt))) * 10) / 10, key = d.fade === 'in' ? 'fadeIn' : 'fadeOut';
      live(pp => { const c = find(pp, d.id).clip; if (v > 0) c[key] = v; else delete c[key]; }); this.render(); this.showTip((d.fade === 'in' ? 'Fade in ' : 'Fade out ') + v.toFixed(1) + 's', d.x); return;
    }
    if (d.mode === 'trim') {
      Object.assign(f.clip, JSON.parse(d.orig));
      const c0 = JSON.parse(d.orig), t = this.o.getTime(); let dd = dt;
      if (d.edge === 'right') { const e0 = c0.start + clipDur(c0); if (Math.abs(e0 + dt - t) * pps < SNAP_PX) dd = t - e0; }
      else if (!TRACK_KINDS[d.kind].magnetic && Math.abs(c0.start + dt - t) * pps < SNAP_PX) dd = t - c0.start;
      live(pp => trim(pp, d.id, d.edge, dd, media.get(f.clip.mediaId)?.duration));
      this.render(); const c = find(S.project, d.id).clip; this.showTip(fmtS(clipDur(c)), d.x);
      return;
    }
    // move
    d.el.style.transform = `translate(${d.x - d.x0 + this.scroll.scrollLeft - d.sl0}px, ${TRACK_KINDS[d.kind].magnetic ? 0 : d.y - d.y0}px)`;
    if (TRACK_KINDS[d.kind].magnetic) {
      const len = clipDur(f.clip), mid = d.start0 + dt + len / 2, others = f.track.clips.filter(c => c.id !== d.id);
      let acc = 0, idx = 0; const starts = [];
      for (const c of others) { starts.push(acc); if (mid > acc + clipDur(c) / 2) idx++; acc += clipDur(c); }
      starts.push(acc); d.target = idx; this.showMarker(f.track, starts[idx]);
    } else {
      let s = Math.max(0, d.start0 + dt); const len = clipDur(f.clip), t = this.o.getTime();
      const snaps = [t, 0]; for (const tr of p.tracks) for (const c of tr.clips) if (c.id !== d.id) snaps.push(c.start, clipEnd(c));
      for (const tr of p.tracks) for (const c of tr.clips) if (c.id !== d.id && c.beat) for (const b of beatTimes(c)) snaps.push(b.t);   // snap to the music's beats
      for (const x of snaps) { if (Math.abs(s - x) * pps < SNAP_PX) { s = x; break; } if (Math.abs(s + len - x) * pps < SNAP_PX) { s = x - len; break; } }
      d.target = s; const row = document.elementsFromPoint(d.x, d.y).map(n => n.closest && n.closest('.row')).find(r => r && r.dataset.track);
      d.targetTrack = row && find(p, d.id) && p.tracks.find(t => t.id === row.dataset.track && t.kind === d.kind) ? row.dataset.track : d.track;
      this.showTip(fmtS(s), d.x);
    }
  }
  showMarker(track, x) {
    let m = document.getElementById('tlMarker'); const row = this.tracksEl.querySelector(`.row[data-track="${track.id}"]`); if (!row) return;
    if (!m) { m = document.createElement('div'); m.id = 'tlMarker'; }
    m.style.left = (x * this.pps - 2) + 'px'; row.appendChild(m);
  }
  showTip(text, x) { const r = this.scroll.parentElement.getBoundingClientRect(); this.tip.textContent = text; this.tip.style.left = (x - r.left) + 'px'; this.tip.hidden = false; }
  up(e) {
    if (this.downEmpty && !this.drag) { if (Math.hypot(e.clientX - this.downEmpty.x, e.clientY - this.downEmpty.y) < 8 && e.target.closest('#tlScroll')) select(null); this.downEmpty = null; }
    const d = this.drag; if (!d || e.pointerId !== d.pid) return;
    clearTimeout(d.timer); this.drag = null; this.tip.hidden = true; document.body.classList.remove('tl-dragging');
    if (!d.active) { select(d.id); return; }
    if (d.mode === 'move' && d.target != null) {
      if (TRACK_KINDS[d.kind].magnetic) live(p => reorder(p, d.id, d.target));
      else live(p => moveTo(p, d.id, d.target, d.targetTrack));
    }
    end(); this.render(); this.o.afterEdit && this.o.afterEdit();
  }
  cancel(e) { const d = this.drag; if (!d || (e && e.pointerId !== d.pid)) return; clearTimeout(d.timer); this.drag = null; this.tip.hidden = true; document.body.classList.remove('tl-dragging'); if (d.active) { end(); this.render(); } }
}
function rulerLabel(s, step) { const m = Math.floor(s / 60), sec = s % 60; if (step < 1) return (m ? m + ':' : '') + (m ? sec.toFixed(1).padStart(4, '0') : sec.toFixed(1)) ; return String(m).padStart(2, '0') + ':' + String(Math.round(sec)).padStart(2, '0'); }
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export { fmtS };

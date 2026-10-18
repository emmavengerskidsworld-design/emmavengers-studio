/* Project data model + pure editing operations.
   Everything the editor knows lives in one plain JSON object (the "project"), so undo/redo, autosave and export
   all work from the same data. New features (transitions, keyframes, stickers, filters...) are new fields on a clip
   plus an entry in js/registry.js — no rewrite of the timeline or the renderer. */
import { TRACK_KINDS, DEFAULT_TRANSFORM, propAt, kfPropsFor, KEYFRAME_PROPS, setBase } from './registry.js';
import { duckAt } from './audiomix.js';
import { MIN_TRANSITION, MAX_TRANSITION } from './transitions.js';
import { cvMean, cvV, curveSrc, subCurve, validCurve } from './speedcurve.js';

export const uid = () => Math.random().toString(36).slice(2, 9) + (Date.now() % 1e6).toString(36);
export const SCHEMA = 1;
export const ASPECTS = { '9:16': [9, 16], '16:9': [16, 9], '1:1': [1, 1] };
export const MIN_CLIP = 0.1; // seconds

export function newProject() {
  return { id: 'p_' + uid(), schema: SCHEMA, name: 'My video', aspect: '9:16', fps: 30, bg: '#000000',
    created: Date.now(), tracks: [newTrack('main')] };
}
export const newTrack = kind => ({ id: 't_' + uid(), kind, clips: [] });

export function newClip(type, opts = {}) {
  const c = { id: 'c_' + uid(), type, start: 0, speed: 1, volume: 1,
    transform: { ...DEFAULT_TRANSFORM }, keyframes: {}, filter: null, transitionIn: null, ...opts };
  if (type === 'text') c.text = { content: 'Your text', size: 96, color: '#ffffff', font: 'bold', outline: true, outlineColor: '#000000', box: false, boxColor: '#000000', align: 'center', ...(opts.text || {}) };
  return c;
}

/* ---------- time helpers ---------- */
export const hasSource = c => c.type === 'video' || c.type === 'audio';
/** Average speed: the constant speed, times the curve's mean when the clip has a speed curve. */
export const avgSpeed = c => c.speed * (validCurve(c.curve) ? cvMean(c.curve) : 1);
export const clipDur = c => hasSource(c) ? (c.out - c.in) / avgSpeed(c) : c.dur;
export const clipEnd = c => c.start + clipDur(c);
export const isVisualTrack = t => TRACK_KINDS[t.kind].visual;
export function projectDuration(p) {
  let v = 0, a = 0;
  for (const t of p.tracks) for (const c of t.clips) { if (isVisualTrack(t)) v = Math.max(v, clipEnd(c)); else a = Math.max(a, clipEnd(c)); }
  return v || a;
}
/** source time (seconds inside the media file) shown at timeline time t */
export const srcTime = (c, t) => validCurve(c.curve) ? c.in + curveSrc(c.curve, c.out - c.in, clipDur(c), t - c.start) : c.in + (t - c.start) * c.speed;
/** Beat grid of a library music clip (c.beat = {bpm, m: beats per bar, o: first beat in the file (s), dr: drops in the file (s), sec: [[section, start s]]}): the timeline time of
    every beat inside the clip, [{t, down}] (down = first beat of a bar). Follows trims, speed and speed curves. */
export function beatTimes(c, maxN = 3000) {
  const b = c.beat; if (!b || !(b.bpm > 0) || !hasSource(c)) return [];
  const spb = 60 / b.bpm, o = b.o || 0, m = b.m || 4, d = clipDur(c), out = [], isDown = k => ((k % m) + m) % m === 0;
  if (!validCurve(c.curve)) {
    const sp = c.speed || 1;
    for (let k = Math.ceil((c.in - o) / spb - 1e-9); out.length < maxN; k++) { const t = c.start + (o + k * spb - c.in) / sp; if (t > c.start + d + 1e-6) break; if (t >= c.start - 1e-6) out.push({ t, down: isDown(k) }); }
  } else {
    const N = Math.min(6000, Math.ceil(d * 240)); let prev = Math.floor((srcTime(c, c.start) - o) / spb + 1e-9);
    if (Math.abs((srcTime(c, c.start) - o) / spb - Math.round((srcTime(c, c.start) - o) / spb)) < 1e-6) out.push({ t: c.start, down: isDown(Math.round((srcTime(c, c.start) - o) / spb)) });
    for (let i = 1; i <= N && out.length < maxN; i++) { const t = c.start + d * i / N, k = Math.floor((srcTime(c, t) - o) / spb + 1e-9); if (k !== prev) { out.push({ t, down: isDown(Math.max(k, prev)) }); prev = k; } }
  }
  return out;
}
/** Timeline times of a music clip's drops / big hits (c.beat.dr, file seconds), for cutting on the drop. */
export function dropTimes(c) {
  const dr = (c.beat && c.beat.dr) || []; if (!dr.length || !hasSource(c)) return [];
  const d = clipDur(c), out = [];
  if (!validCurve(c.curve)) { const sp = c.speed || 1; for (const x of dr) { const t = c.start + (x - c.in) / sp; if (t >= c.start - 1e-6 && t <= c.start + d + 1e-6) out.push(t); } return out; }
  const N = Math.min(6000, Math.ceil(d * 240)); let prev = srcTime(c, c.start);
  for (let i = 1; i <= N; i++) { const t = c.start + d * i / N, s = srcTime(c, t); for (const x of dr) if (x > prev - 1e-9 && x <= s + 1e-9 && !(i > 1 && x === prev)) out.push(t); prev = s; }
  return out;
}
/** Playback speed at timeline time t (constant, or from the speed curve). */
export const speedAt = (c, t) => validCurve(c.curve) ? c.speed * cvV(c.curve, Math.max(0, Math.min(1, (t - c.start) / clipDur(c)))) : c.speed;

export function find(p, clipId) {
  for (const track of p.tracks) { const i = track.clips.findIndex(c => c.id === clipId); if (i >= 0) return { track, clip: track.clips[i], index: i }; }
  return null;
}
export const trackOf = (p, id) => p.tracks.find(t => t.id === id);

/** Main (magnetic) tracks never have gaps: clip starts follow array order. Other tracks are kept sorted by start. */
export function normalize(p) {
  if (!p.tracks.some(t => t.kind === 'main')) p.tracks.unshift(newTrack('main'));
  for (const t of p.tracks) {
    if (TRACK_KINDS[t.kind].magnetic) { let s = 0; t.clips.forEach((c, i) => { const eff = i ? transEff(t.clips[i - 1], c) : 0; c.start = round(Math.max(0, s - eff)); s = c.start + clipDur(c); }); }
    else t.clips.sort((a, b) => a.start - b.start);
  }
  // drop empty secondary tracks (main always stays)
  p.tracks = p.tracks.filter(t => t.kind === 'main' || t.clips.length);
  // stable display order: by kind order in registry, then creation
  const order = Object.keys(TRACK_KINDS);
  p.tracks.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return p;
}
/** Effective transition length between main clips a -> b (clips overlap by this much; at most half of either clip). */
export function transEff(a, b) {
  const tr = b.transitionIn; if (!tr || !tr.id) return 0;
  return round(Math.max(0, Math.min(Math.max(MIN_TRANSITION, Math.min(MAX_TRANSITION, tr.dur)), clipDur(a) / 2, clipDur(b) / 2)));
}
const round = x => Math.round(x * 1e6) / 1e6;

const overlaps = (t, s, e, ignoreId) => t.clips.some(c => c.id !== ignoreId && c.start < e - 1e-6 && clipEnd(c) > s + 1e-6);
/** Put clip on a free track of `kind`, preferring `prefer` track, creating a new one if all are busy at that time. */
export function placeFree(p, kind, clip, prefer) {
  const s = clip.start, e = clip.start + clipDur(clip);
  const tracks = p.tracks.filter(t => t.kind === kind);
  if (prefer) tracks.sort((a, b) => (b.id === prefer.id) - (a.id === prefer.id));
  let t = tracks.find(t => !overlaps(t, s, e, clip.id));
  if (!t) { t = newTrack(kind); p.tracks.push(t); }
  t.clips.push(clip);
  return t;
}

/* ---------- operations (mutate p; caller records history) ---------- */
export function addToMain(p, clips, atTime) {
  const main = p.tracks.find(t => t.kind === 'main');
  // insert after the clip under the playhead (CapCut style); append when the playhead is at the end
  let idx = main.clips.length;
  if (atTime != null) { const i = main.clips.findIndex(c => atTime < clipEnd(c) - 1e-6); if (i >= 0) idx = atTime <= main.clips[i].start + 1e-6 ? i : i + 1; }
  main.clips.splice(idx, 0, ...clips);
  normalize(p);
}
export function addToKind(p, kind, clip, atTime) { clip.start = Math.max(0, atTime || 0); placeFree(p, kind, clip); normalize(p); }

export function split(p, clipId, t) {
  const f = find(p, clipId); if (!f) return null;
  const c = f.clip, local = t - c.start, d = clipDur(c);
  if (local < MIN_CLIP || local > d - MIN_CLIP) return null;
  const b = JSON.parse(JSON.stringify(c)); b.id = 'c_' + uid(); b.start = round(t); b.transitionIn = null;
  if (hasSource(c)) { const s = round(srcTime(c, t)); if (validCurve(c.curve)) { const u = local / d; b.curve = subCurve(c.curve, u, 1); c.curve = subCurve(c.curve, 0, u); } c.out = s; b.in = s; }
  else { c.dur = round(local); b.dur = round(d - local); }
  // keyframes are clip-local: keep the ones before the cut on A, shift the rest onto B
  for (const k of Object.keys(c.keyframes || {})) {
    const all = c.keyframes[k]; if (!all.length) continue;
    const v = propAt(c, k, local), prev = [...all].reverse().find(x => x.t <= local);
    const A = all.filter(x => x.t < local - 1e-6), B = all.filter(x => x.t > local + 1e-6).map(x => ({ ...x, t: round(x.t - local) }));
    A.push({ t: round(local), v, ease: 'linear' }); B.unshift({ t: 0, v, ease: prev ? prev.ease || 'linear' : 'linear' });
    c.keyframes[k] = A; b.keyframes[k] = B;
  }
  // animations: the In stays on the first part, the Out moves to the second part, a loop keeps running on both
  if (c.anim) { if (c.anim.out) delete c.anim.out; if (b.anim && b.anim.in) delete b.anim.in; }
  // sound fades: the fade-in stays at the start of A, the fade-out moves to the end of B
  delete c.fadeOut; delete b.fadeIn;
  f.track.clips.splice(f.index + 1, 0, b);
  normalize(p); return b;
}
export function remove(p, clipId) { const f = find(p, clipId); if (!f) return; f.track.clips.splice(f.index, 1); normalize(p); }
export function duplicate(p, clipId) {
  const f = find(p, clipId); if (!f) return null;
  const b = JSON.parse(JSON.stringify(f.clip)); b.id = 'c_' + uid();
  if (TRACK_KINDS[f.track.kind].magnetic) f.track.clips.splice(f.index + 1, 0, b);
  else { b.start = clipEnd(f.clip); placeFree(p, f.track.kind, b, f.track); }
  normalize(p); return b;
}
/** Main track: move clip to array index. */
export function reorder(p, clipId, newIndex) {
  const f = find(p, clipId); if (!f) return;
  f.track.clips.splice(f.index, 1); f.track.clips.splice(Math.max(0, Math.min(newIndex, f.track.clips.length)), 0, f.clip); normalize(p);
}
/** Free tracks: move clip to a start time (and optionally another track of the same kind). */
export function moveTo(p, clipId, start, targetTrackId) {
  const f = find(p, clipId); if (!f) return;
  f.track.clips.splice(f.index, 1); f.clip.start = round(Math.max(0, start));
  const target = trackOf(p, targetTrackId);
  placeFree(p, f.track.kind, f.clip, target && target.kind === f.track.kind ? target : f.track);
  normalize(p);
}
/** Trim an edge. `dt` = timeline seconds the edge moved (+ = right). mediaDur = length of the source file. */
export function trim(p, clipId, edge, dt, mediaDur) {
  const f = find(p, clipId); if (!f) return; const c = f.clip, mag = TRACK_KINDS[f.track.kind].magnetic;
  const sp = avgSpeed(c), off0 = hasSource(c) ? c.in / sp : 0;
  if (hasSource(c)) {
    if (edge === 'left') { const nIn = clamp(c.in + dt * sp, 0, c.out - MIN_CLIP * sp); if (!mag) c.start = round(c.start + (nIn - c.in) / sp); c.in = round(nIn); }
    else c.out = round(clamp(c.out + dt * sp, c.in + MIN_CLIP * sp, mediaDur ?? Infinity));
  } else {
    if (edge === 'left') { let d = clamp(dt, -(mag ? Infinity : c.start), c.dur - MIN_CLIP); if (mag) d = Math.max(d, -(600 - c.dur)); c.dur = round(c.dur - d); if (!mag) c.start = round(c.start + d); }
    else c.dur = round(Math.max(MIN_CLIP, c.dur + dt));
  }
  if (c.start < 0) c.start = 0;
  if (edge === 'left') { // keyframes stay attached to the picture, not to the clip edge
    const shift = hasSource(c) ? c.in / sp - off0 : 0;
    if (shift) shiftKeyframes(c, -shift);
  }
  normalize(p);
}
export function shiftKeyframes(c, dt) { for (const k in c.keyframes || {}) c.keyframes[k] = c.keyframes[k].map(x => ({ ...x, t: round(x.t + dt) })); }
export function setSpeed(p, clipId, speed) {
  const f = find(p, clipId); if (!f) return; const c = f.clip, d0 = clipDur(c); c.speed = clamp(speed, 0.25, 4); delete c.curve;   // normal speed replaces a speed curve
  rescaleKeyframes(c, d0); normalize(p);
}
/** Keyframes follow the picture when the clip's length changes (speed / speed curve). */
export function rescaleKeyframes(c, d0) { const k = clipDur(c) / Math.max(1e-9, d0); if (Math.abs(k - 1) < 1e-9) return; for (const q in c.keyframes || {}) c.keyframes[q] = c.keyframes[q].map(x => ({ ...x, t: round(x.t * k) })); }
/** Set (or remove with null) a speed curve: { id, pts:[{x,v}] }. The clip's constant speed goes back to 1x. */
export function setCurve(p, clipId, curve) {
  const f = find(p, clipId); if (!f || !hasSource(f.clip)) return; const c = f.clip, d0 = clipDur(c);
  if (curve && validCurve(curve)) { c.curve = { id: curve.id || 'custom', pts: curve.pts.map(q => ({ x: clamp(q.x, 0, 1), v: clamp(q.v, 0.1, 10) })).sort((a, b) => a.x - b.x) }; c.speed = 1; }
  else delete c.curve;
  rescaleKeyframes(c, d0); normalize(p);
}
/** Move a video/photo between the main track and an overlay track (same time on screen). */
export function moveToTrack(p, clipId, kind, atTime) {
  const f = find(p, clipId); if (!f || f.track.kind === kind || !TRACK_KINDS[kind].accepts.includes(f.clip.type)) return null;
  const c = f.clip, start = c.start; f.track.clips.splice(f.index, 1); c.transitionIn = null;
  if (kind === 'main') { c.start = 0; addToMain(p, [c], atTime ?? start); }
  else { c.start = start; placeFree(p, kind, c); normalize(p); }
  return c;
}
/** Overlay layers: move a clip one layer up (+1, drawn above) or down (-1). Creates a layer when needed. */
export function moveLayer(p, clipId, dir) {
  const f = find(p, clipId); if (!f || f.track.kind !== 'overlay') return false;
  const c = f.clip, ov = p.tracks.filter(t => t.kind === 'overlay'), i = ov.indexOf(f.track), j = i + dir, e = clipEnd(c);
  const busy = t => overlaps(t, c.start, e, c.id), alone = f.track.clips.length === 1;
  if (j < 0 || j >= ov.length) { if (alone) return false; f.track.clips.splice(f.index, 1); const t = newTrack('overlay'); t.clips.push(c); p.tracks.splice(p.tracks.indexOf(f.track) + (dir > 0 ? 1 : 0), 0, t); normalize(p); return true; }
  f.track.clips.splice(f.index, 1);
  if (!busy(ov[j])) ov[j].clips.push(c);
  else { const t = newTrack('overlay'); t.clips.push(c); p.tracks.splice(p.tracks.indexOf(ov[j]) + (dir > 0 ? 1 : 0), 0, t); }
  normalize(p); return true;
}
/** Layer number (1 = lowest overlay) and count, for the UI. */
export function layerOf(p, clipId) { const f = find(p, clipId); const ov = p.tracks.filter(t => t.kind === 'overlay'); return f && f.track.kind === 'overlay' ? { n: ov.indexOf(f.track) + 1, of: ov.length } : null; }

/* ---------- keyframes ---------- */
export const KF_EPS = 1 / 60;
export const kfTimes = c => [...new Set(Object.values(c.keyframes || {}).flat().map(x => x.t))].sort((a, b) => a - b).filter((t, i, a) => !i || t - a[i - 1] > KF_EPS / 2);
export const hasKeyframes = c => Object.values(c.keyframes || {}).some(a => a.length);
export const kfAt = (c, t) => kfTimes(c).find(x => Math.abs(x - t) <= KF_EPS);
function upsert(c, prop, t, v, ease) {
  const a = (c.keyframes[prop] ||= []), i = a.findIndex(x => Math.abs(x.t - t) <= KF_EPS);
  if (i >= 0) { a[i].v = v; if (ease) a[i].ease = ease; } else { a.push({ t: round(t), v, ease: ease || 'linear' }); a.sort((x, y) => x.t - y.t); }
}
/** Add a keyframe for every animatable property at clip-local time t (CapCut-style "◆"). */
export function addKeyframe(c, t) { c.keyframes ||= {}; for (const k of kfPropsFor(c)) upsert(c, k, t, propAt(c, k, t)); }
export function removeKeyframe(c, t) { for (const k in c.keyframes || {}) { c.keyframes[k] = c.keyframes[k].filter(x => Math.abs(x.t - t) > KF_EPS); if (!c.keyframes[k].length) delete c.keyframes[k]; } }
export function setEase(c, t, ease) { for (const k in c.keyframes || {}) for (const x of c.keyframes[k]) if (Math.abs(x.t - t) <= KF_EPS) x.ease = ease; }
/** Change a property at clip-local time t: updates/creates a keyframe when the clip is animated, else the static value. */
export function setProp(c, prop, v, t) {
  if (hasKeyframes(c)) { c.keyframes ||= {}; upsert(c, prop, Math.max(0, Math.min(clipDur(c), t)), v); return; }
  setBase(c, prop, v);
}
export const KEN_BURNS = {
  zoomIn:  { name: 'Zoom in',  a: { scale: 1 },    b: { scale: 1.25 } },
  zoomOut: { name: 'Zoom out', a: { scale: 1.25 }, b: { scale: 1 } },
  panL:    { name: 'Pan left',  a: { scale: 1.2, x: .56 }, b: { scale: 1.2, x: .44 } },
  panR:    { name: 'Pan right', a: { scale: 1.2, x: .44 }, b: { scale: 1.2, x: .56 } },
  panU:    { name: 'Pan up',    a: { scale: 1.2, y: .56 }, b: { scale: 1.2, y: .44 } },
  panD:    { name: 'Pan down',  a: { scale: 1.2, y: .44 }, b: { scale: 1.2, y: .56 } },
};
export function kenBurns(c, id) {
  const kb = KEN_BURNS[id]; if (!kb) return; const d = clipDur(c);
  for (const k of ['x', 'y', 'scale']) delete (c.keyframes ||= {})[k];
  c.fit = 'cover';
  for (const k of ['x', 'y', 'scale']) { const base = c.transform[k]; c.keyframes[k] = [{ t: 0, v: kb.a[k] ?? base, ease: 'inOut' }, { t: round(d), v: kb.b[k] ?? base, ease: 'linear' }]; }
}

/* ---------- audio gain (volume keyframes x transition crossfade) ---------- */
/** Equal-power crossfade factor for a main-track clip at timeline time t. */
export function xfadeAt(track, c, t) {
  if (!track || !TRACK_KINDS[track.kind].magnetic) return 1;
  const i = track.clips.indexOf(c); let g = 1;
  if (i > 0 && c.transitionIn) { const e = clipEnd(track.clips[i - 1]) - c.start; if (e > 0 && t < c.start + e) g *= Math.sin(Math.max(0, (t - c.start) / e) * Math.PI / 2); }
  const n = track.clips[i + 1]; if (n && n.transitionIn) { const e = clipEnd(c) - n.start; if (e > 0 && t > n.start) g *= Math.cos(Math.min(1, (t - n.start) / e) * Math.PI / 2); }
  return g;
}
/** Fade in / fade out envelope (linear, clip-local). */
export const MAX_FADE = 10;
export function fadeAt(c, t) {
  const L = t - c.start, d = clipDur(c), fi = Math.min(c.fadeIn || 0, d), fo = Math.min(c.fadeOut || 0, d); let g = 1;
  if (fi > 0 && L < fi) g *= Math.max(0, L / fi);
  if (fo > 0 && L > d - fo) g *= Math.max(0, (d - L) / fo);
  return g;
}
export function gainAt(p, c, t) { if (c.muteAudio) return 0; const f = find(p, c.id); return Math.max(0, propAt(c, 'volume', t - c.start)) * fadeAt(c, t) * xfadeAt(f && f.track, c, t) * duckAt(p, c, t, srcTime); }
/** Stereo position -1 (left) .. 1 (right) of a clip at project time t (pan keyframes). */
export const panAt = (c, t) => Math.max(-1, Math.min(1, propAt(c, 'pan', t - c.start) || 0));
/** Timeline times of a clip's tapped beat marks (c.marks are file seconds). */
export function markTimes(c) { if (!c.marks || !c.marks.length || !hasSource(c)) return []; const sp = c.speed || 1; return c.marks.filter(m => m >= c.in - 1e-6 && m <= c.out + 1e-6).map(m => c.start + (m - c.in) / sp); }
/** "Extract audio": a new audio clip playing the video's sound (same file, same timing); the video is muted. */
export function extractAudio(p, clipId) {
  const f = find(p, clipId); if (!f || f.clip.type !== 'video') return null; const v = f.clip;
  const a = newClip('audio', { mediaId: v.mediaId, in: v.in, out: v.out, speed: v.speed, start: v.start, volume: v.volume ?? 1 });
  for (const k of ['keepPitch', 'fadeIn', 'fadeOut', 'reversed']) if (v[k] != null) a[k] = v[k];
  if (v.curve) a.curve = JSON.parse(JSON.stringify(v.curve));
  if (v.voice) a.voice = { ...v.voice };
  if (v.keyframes && v.keyframes.volume) a.keyframes = { volume: v.keyframes.volume.map(x => ({ ...x })) };
  v.muteAudio = true; placeFree(p, 'audio', a); normalize(p); return a;
}
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** Remove references to media that no longer exist (e.g. storage was cleared). */
export function mediaIds(p) { const s = new Set(); for (const t of p.tracks) for (const c of t.clips) if (c.mediaId) s.add(c.mediaId); if (p.canvas && p.canvas.mediaId) s.add(p.canvas.mediaId); return s; }

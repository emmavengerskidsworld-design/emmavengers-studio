/* Project data model + pure editing operations.
   Everything the editor knows lives in one plain JSON object (the "project"), so undo/redo, autosave and export
   all work from the same data. New features (transitions, keyframes, stickers, filters...) are new fields on a clip
   plus an entry in js/registry.js — no rewrite of the timeline or the renderer. */
import { TRACK_KINDS, DEFAULT_TRANSFORM } from './registry.js';

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
export const clipDur = c => hasSource(c) ? (c.out - c.in) / c.speed : c.dur;
export const clipEnd = c => c.start + clipDur(c);
export const isVisualTrack = t => TRACK_KINDS[t.kind].visual;
export function projectDuration(p) {
  let v = 0, a = 0;
  for (const t of p.tracks) for (const c of t.clips) { if (isVisualTrack(t)) v = Math.max(v, clipEnd(c)); else a = Math.max(a, clipEnd(c)); }
  return v || a;
}
/** source time (seconds inside the media file) shown at timeline time t */
export const srcTime = (c, t) => c.in + (t - c.start) * c.speed;

export function find(p, clipId) {
  for (const track of p.tracks) { const i = track.clips.findIndex(c => c.id === clipId); if (i >= 0) return { track, clip: track.clips[i], index: i }; }
  return null;
}
export const trackOf = (p, id) => p.tracks.find(t => t.id === id);

/** Main (magnetic) tracks never have gaps: clip starts follow array order. Other tracks are kept sorted by start. */
export function normalize(p) {
  if (!p.tracks.some(t => t.kind === 'main')) p.tracks.unshift(newTrack('main'));
  for (const t of p.tracks) {
    if (TRACK_KINDS[t.kind].magnetic) { let s = 0; for (const c of t.clips) { c.start = round(s); s += clipDur(c); } }
    else t.clips.sort((a, b) => a.start - b.start);
  }
  // drop empty secondary tracks (main always stays)
  p.tracks = p.tracks.filter(t => t.kind === 'main' || t.clips.length);
  // stable display order: by kind order in registry, then creation
  const order = Object.keys(TRACK_KINDS);
  p.tracks.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
  return p;
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
  if (hasSource(c)) { const s = round(c.in + local * c.speed); c.out = s; b.in = s; }
  else { c.dur = round(local); b.dur = round(d - local); }
  // keyframes are clip-local: keep the ones before the cut on A, shift the rest onto B
  for (const k of Object.keys(c.keyframes || {})) {
    const all = c.keyframes[k]; c.keyframes[k] = all.filter(x => x.t <= local); b.keyframes[k] = all.filter(x => x.t >= local).map(x => ({ ...x, t: round(x.t - local) }));
  }
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
  if (hasSource(c)) {
    if (edge === 'left') { const nIn = clamp(c.in + dt * c.speed, 0, c.out - MIN_CLIP * c.speed); if (!mag) c.start = round(c.start + (nIn - c.in) / c.speed); c.in = round(nIn); }
    else c.out = round(clamp(c.out + dt * c.speed, c.in + MIN_CLIP * c.speed, mediaDur ?? Infinity));
  } else {
    if (edge === 'left') { let d = clamp(dt, -(mag ? Infinity : c.start), c.dur - MIN_CLIP); if (mag) d = Math.max(d, -(600 - c.dur)); c.dur = round(c.dur - d); if (!mag) c.start = round(c.start + d); }
    else c.dur = round(Math.max(MIN_CLIP, c.dur + dt));
  }
  if (c.start < 0) c.start = 0;
  normalize(p);
}
export function setSpeed(p, clipId, speed) { const f = find(p, clipId); if (!f) return; f.clip.speed = clamp(speed, 0.25, 4); normalize(p); }
export const clamp = (x, a, b) => Math.min(b, Math.max(a, x));

/** Remove references to media that no longer exist (e.g. storage was cleared). */
export function mediaIds(p) { const s = new Set(); for (const t of p.tracks) for (const c of t.clips) if (c.mediaId) s.add(c.mediaId); return s; }

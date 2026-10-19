/* Batch 11 workflow operations on a project (pure data; callers record history with act()):
   groups, compound clips, copy / paste of clips and attributes (works across projects), detach / link audio, timeline markers. */
import { uid, find, newClip, newTrack, normalize, clipEnd, clipDur, placeFree, addToMain, addToKind, extractAudio, magnetic, hasSource } from './project.js';
import { DEFAULT_TRANSFORM } from './registry.js';
import { innerTracks } from './compound.js';

const clone = x => JSON.parse(JSON.stringify(x));
const r6 = x => Math.round(x * 1e6) / 1e6;
export const allOf = p => p.tracks.flatMap(t => t.clips.map(c => ({ c, t })));

/* ---------- groups ---------- */
export function groupClips(p, ids) { if (ids.length < 2) return null; const g = 'g_' + uid(); for (const id of ids) { const f = find(p, id); if (f) f.clip.group = g; } return g; }
export function ungroupClips(p, ids) { const gs = new Set(ids.map(id => find(p, id)?.clip.group).filter(Boolean)); for (const { c } of allOf(p)) if (gs.has(c.group)) delete c.group; return gs.size; }
/** The clip plus everything grouped or linked with it. */
export function partners(p, id) {
  const f = find(p, id); if (!f) return []; const g = f.clip.group, l = f.clip.link;
  return allOf(p).filter(({ c }) => c.id === id || (g && c.group === g) || (l && c.link === l)).map(x => x.c.id);
}
/** Move clips (not on a magnetic track) by dt seconds, keeping their tracks. */
export function shiftClips(p, ids, dt) {
  for (const id of ids) { const f = find(p, id); if (!f || magnetic(f.track)) continue; f.clip.start = r6(Math.max(0, f.clip.start + dt)); }
  normalize(p);
}

/* ---------- compound clips ---------- */
export function makeCompound(p, ids) {
  const fs = ids.map(id => find(p, id)).filter(Boolean).filter(f => f.clip.type !== 'compound' || true); if (!fs.length) return null;
  const t0 = Math.min(...fs.map(f => f.clip.start)), t1 = Math.max(...fs.map(f => clipEnd(f.clip)));
  const kinds = new Map(), mainF = fs.filter(f => f.track.kind === 'main'), idx = mainF.length ? Math.min(...mainF.map(f => f.index)) : -1;
  for (const f of fs) {
    let it = kinds.get(f.track.id); if (!it) { it = { ...newTrack(f.track.kind) }; if (f.track.kind === 'main') it.free = true; kinds.set(f.track.id, it); }
    const c = clone(f.clip); c.start = r6(c.start - t0); delete c.group; it.clips.push(c);
  }
  for (const f of fs) { const g = find(p, f.clip.id); if (g) g.track.clips.splice(g.index, 1); }
  const tracks = [...kinds.values()]; if (!tracks.some(t => t.kind === 'main')) tracks.unshift({ ...newTrack('main'), free: true });
  for (const t of tracks) t.clips.sort((a, b) => a.start - b.start);
  const cc = newClip('compound', { dur: r6(t1 - t0), off: 0, inner: { tracks, v: 1 }, name: 'Compound clip', transform: { ...DEFAULT_TRANSFORM } });
  if (idx >= 0) { const m = p.tracks.find(t => t.kind === 'main'); m.clips.splice(Math.min(idx, m.clips.length), 0, cc); if (!magnetic(m)) cc.start = r6(t0); }
  else { cc.start = r6(t0); placeFree(p, 'overlay', cc); }
  normalize(p); return cc;
}
/** Put the contents of a compound clip back on the timeline (where they play now). */
export function breakApart(p, id) {
  const f = find(p, id); if (!f || f.clip.type !== 'compound') return null; const cc = f.clip, tracks = clone(innerTracks(cc)), onMain = f.track.kind === 'main', out = [];
  f.track.clips.splice(f.index, 1);
  const main = p.tracks.find(t => t.kind === 'main');
  for (const t of tracks) for (const c of t.clips) { delete c._in; out.push(c.id);
    if (t.kind === 'main' && onMain && magnetic(main)) { const i = main.clips.findIndex(x => x.start >= c.start - 1e-6); main.clips.splice(i < 0 ? main.clips.length : i, 0, c); }
    else if (t.kind === 'main' && !onMain) { c.transform ||= { ...DEFAULT_TRANSFORM }; placeFree(p, 'overlay', c); }
    else if (t.kind === 'main') { main.clips.push(c); }
    else placeFree(p, t.kind, c); }
  normalize(p); return out;
}

/* ---------- clipboard (localStorage, so it works in another project too) ---------- */
const CB = 'evs-clipboard', CBA = 'evs-clipattrs';
function freshIds(c, map) { c.id = 'c_' + uid(); if (c.group) { map.has(c.group) || map.set(c.group, 'g_' + uid()); c.group = map.get(c.group); } if (c.link) { map.has(c.link) || map.set(c.link, 'l_' + uid()); c.link = map.get(c.link); }
  if (c.type === 'compound') for (const t of c.inner.tracks) { t.id = 't_' + uid(); for (const x of t.clips) freshIds(x, map); } }
export function copyClips(p, ids) {
  const fs = ids.map(id => find(p, id)).filter(Boolean); if (!fs.length) return 0; const t0 = Math.min(...fs.map(f => f.clip.start));
  localStorage.setItem(CB, JSON.stringify({ v: 1, from: p.id, t0, at: Date.now(), clips: fs.map(f => ({ kind: f.track.kind, clip: clone(f.clip) })) })); return fs.length;
}
export const clipboard = () => { try { return JSON.parse(localStorage.getItem(CB) || 'null'); } catch (e) { return null; } };
/** Paste the clipboard at time t; returns the new clip ids. */
export function pasteClips(p, t) {
  const cb = clipboard(); if (!cb || !cb.clips.length) return []; const map = new Map(), ids = [], mains = [];
  for (const { kind, clip } of cb.clips) { const c = clone(clip); freshIds(c, map); ids.push(c.id);
    if (kind === 'main') mains.push(c); else addToKind(p, kind, c, r6(t + (clip.start - cb.t0))); }
  if (mains.length) addToMain(p, mains, t);
  normalize(p); return ids;
}
export const ATTRS = ['filter', 'effects', 'adjust', 'color', 'enhance', 'anim', 'mask', 'crop', 'blend', 'chroma', 'voice', 'eq', 'comp', 'pan', 'volume', 'fadeIn', 'fadeOut', 'transform', 'keyframes', 'mirror', 'stab'];
export function copyAttrs(c) {
  const a = {}; for (const k of ATTRS) if (c[k] != null) a[k] = clone(c[k]);
  if (c.type === 'text') { const { content, ...style } = c.text; a.textStyle = clone(style); }
  localStorage.setItem(CBA, JSON.stringify({ type: c.type, a })); return Object.keys(a).length;
}
export const attrClipboard = () => { try { return JSON.parse(localStorage.getItem(CBA) || 'null'); } catch (e) { return null; } };
/** Paste attributes onto clip c (only what makes sense for its type). */
export function pasteAttrs(c, only) {
  const cb = attrClipboard(); if (!cb) return 0; let n = 0;
  for (const [k, v] of Object.entries(cb.a)) {
    if (only && !only.includes(k)) continue;
    if (k === 'textStyle') { if (c.type === 'text') { c.text = { ...c.text, ...clone(v) }; n++; } continue; }
    if (['voice', 'eq', 'comp', 'pan', 'fadeIn', 'fadeOut'].includes(k) && !hasSource(c)) continue;
    if (['filter', 'effects', 'adjust', 'color', 'enhance', 'mask', 'crop', 'chroma', 'mirror', 'stab'].includes(k) && !(c.type === 'video' || c.type === 'image' || c.type === 'compound')) continue;
    if (k === 'keyframes') { const d = clipDur(c), kv = {}; for (const [q, a] of Object.entries(v)) { const L = a.filter(x => x.t <= d + 1e-6); if (L.length) kv[q] = L; } c.keyframes = kv; n++; continue; }
    c[k] = clone(v); n++;
  }
  return n;
}

/* ---------- detach / link ---------- */
export function detachAudio(p, id) {
  const a = extractAudio(p, id); if (!a) return null; const v = find(p, id).clip, l = 'l_' + uid(); v.link = l; find(p, a.id).clip.link = l; return a;
}
export function linkClips(p, ids) { if (ids.length < 2) return null; const l = 'l_' + uid(); for (const id of ids) { const f = find(p, id); if (f) f.clip.link = l; } return l; }
export function unlinkClips(p, ids) { const ls = new Set(ids.map(id => find(p, id)?.clip.link).filter(Boolean)); for (const { c } of allOf(p)) if (ls.has(c.link)) delete c.link; return ls.size; }
/** Put a detached sound back into its video (the audio clip is removed, the video plays its own sound again). */
export function reattach(p, id) {
  const f = find(p, id); if (!f || !f.clip.link) return false; const l = f.clip.link, all = allOf(p).filter(x => x.c.link === l);
  const v = all.find(x => x.c.type === 'video'), a = all.find(x => x.c.type === 'audio' && v && x.c.mediaId === v.c.mediaId); if (!v || !a) return false;
  const g = find(p, a.c.id); g.track.clips.splice(g.index, 1); v.c.muteAudio = false; delete v.c.link; normalize(p); return true;
}

/* ---------- timeline markers ---------- */
export const MARKER_COLORS = ['#ff4d6d', '#ffb020', '#3ddc84', '#4fa3ff', '#b57bff', '#ffffff'];
export function addMarker(p, t, label = '', color = MARKER_COLORS[0]) { const m = { id: 'm_' + uid(), t: r6(Math.max(0, t)), label, color }; (p.markers ||= []).push(m); p.markers.sort((a, b) => a.t - b.t); return m; }
export function editMarker(p, id, o) { const m = (p.markers || []).find(x => x.id === id); if (m) { Object.assign(m, o); if (o.t != null) m.t = r6(Math.max(0, o.t)); p.markers.sort((a, b) => a.t - b.t); } return m; }
export function removeMarker(p, id) { p.markers = (p.markers || []).filter(x => x.id !== id); if (!p.markers.length) delete p.markers; }

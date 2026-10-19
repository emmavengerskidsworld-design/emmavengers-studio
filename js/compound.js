/* Compound clips: a selection nested into one clip (type 'compound', inner = { tracks, v }).
   The inner clips keep their own (inner) times; innerTracks() gives copies placed at outer time and cut to the compound's window,
   so the compositor, the player and the exporter all see the same clips. */
import { clipDur, clipEnd, hasSource, shiftKeyframes } from './project.js';

const cache = new WeakMap();
const r6 = x => Math.round(x * 1e6) / 1e6;
/** Inner tracks of a compound clip at outer time (window [start, start + dur), offset `off` into the inner timeline). */
export function innerTracks(cc) {
  const key = `${cc.start}|${cc.off || 0}|${cc.dur}|${cc.inner && cc.inner.v || 0}`, hit = cache.get(cc); if (hit && hit.key === key) return hit.tracks;
  const sh = cc.start - (cc.off || 0), a = cc.start, b = cc.start + cc.dur, tracks = [];
  for (const t of (cc.inner && cc.inner.tracks) || []) {
    const clips = [];
    for (const c0 of t.clips) {
      const c = JSON.parse(JSON.stringify(c0)); c.start = r6(c.start + sh); c._in = cc.id;
      let e = clipEnd(c); if (e <= a + 1e-6 || c.start >= b - 1e-6) continue;
      if (c.start < a) { const d = a - c.start; if (hasSource(c)) { c.in = r6(c.in + d * (c.speed || 1)); delete c.curve; } else c.dur = r6(c.dur - d); shiftKeyframes(c, -d); c.start = a; e = clipEnd(c); c.transitionIn = null; }
      if (e > b) { const d = e - b; if (hasSource(c)) { c.out = r6(c.out - d * (c.speed || 1)); delete c.curve; } else c.dur = r6(c.dur - d); }
      if (clipDur(c) > 1e-3) clips.push(c);
    }
    tracks.push({ id: t.id, kind: t.kind, free: t.free, clips });
  }
  cache.set(cc, { key, tracks }); return tracks;
}
/** Every clip of the project, compound contents included (at outer time). */
export function allClips(p, out = []) {
  const walk = tracks => { for (const t of tracks) for (const c of t.clips) { out.push(c); if (c.type === 'compound') walk(innerTracks(c)); } };
  walk(p.tracks); return out;
}
/** Media ids used inside compound clips (stored inner data, not windowed). */
export function nestedMediaIds(c, s) { for (const t of (c.inner && c.inner.tracks) || []) for (const x of t.clips) { if (x.mediaId) s.add(x.mediaId); if (x.type === 'compound') nestedMediaIds(x, s); } return s; }
export const compoundCount = c => ((c.inner && c.inner.tracks) || []).reduce((n, t) => n + t.clips.length, 0);
/** Visual clips (compound contents included) on screen at time t. */
export function activeVisual(p, t, out = []) {
  const walk = tracks => { for (const tr of tracks) { if (tr.kind === 'audio') continue; for (const c of tr.clips) if (c.start <= t + 1e-9 && t < clipEnd(c) - 1e-9) { out.push(c); if (c.type === 'compound') walk(innerTracks(c)); } } };
  walk(p.tracks); return out;
}

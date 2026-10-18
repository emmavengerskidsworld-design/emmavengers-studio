/* Manual captions (no speech recognition): a caption track of text clips, bulk paste, style presets for all lines,
   SRT import / export. Pure functions here; the sheet lives in js/app.js (captionsSheet). */
import { newClip, addToKind, normalize, clipEnd, clipDur, projectDuration } from './project.js';
import { DEFAULT_TRANSFORM } from './registry.js';
import { applyStyle } from './textstyles.js';

export const CAPTION_STYLES = [
  { id: 'clean', name: 'Clean', font: 'poppins', size: 58, style: 'softShadow' },
  { id: 'boxed', name: 'Boxed', font: 'poppins', size: 54, style: 'labelBlack' },
  { id: 'bold', name: 'Bold outline', font: 'montserrat', size: 60, style: 'classic' },
  { id: 'kids', name: 'Kids', font: 'fredoka', size: 64, style: 'stickerYellow' },
  { id: 'emma', name: 'Emma 3D', font: 'luckiestguy', size: 62, style: 'emma3d' },
  { id: 'pill', name: 'Yellow pill', font: 'baloo2', size: 56, style: 'labelYellow' },
  { id: 'speech', name: 'Speech', font: 'lilitaone', size: 56, style: 'speech' },
  { id: 'neon', name: 'Neon', font: 'nunito', size: 58, style: 'neonBlue' },
  { id: 'comic', name: 'Comic', font: 'bangers', size: 66, style: 'comic' },
  { id: 'story', name: 'Story book', font: 'grandstander', size: 58, style: 'gold' },
  { id: 'hand', name: 'Handwritten', font: 'patrickhand', size: 62, style: 'stickerLabel' },
  { id: 'plainBig', name: 'Big & simple', font: 'bold', size: 70, style: 'classic' },
];
export const DEFAULT_CAPTION_STYLE = 'boxed';
export const captionStyleById = id => CAPTION_STYLES.find(s => s.id === id) || CAPTION_STYLES.find(s => s.id === DEFAULT_CAPTION_STYLE);
/** Put a caption style on one caption clip (keeps its words and timing). */
export function styleCaption(c, id) {
  const s = captionStyleById(id); applyStyle(c.text, s.style); c.text.font = s.font; c.text.size = s.size; c.text.curve = 0; c.text.align = 'center'; c.captionStyle = s.id; return c;
}
export const isCaption = c => !!(c && c.caption);
export const captionTracks = p => p.tracks.filter(t => t.kind === 'caption');
export const captions = p => captionTracks(p).flatMap(t => t.clips).sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
const r3 = x => Math.round(x * 1000) / 1000;
export function newCaption(p, content, start, dur) {
  const c = newClip('text', { dur: r3(Math.max(0.2, dur)), caption: true, transform: { ...DEFAULT_TRANSFORM, y: p.captionY ?? 0.8 }, text: { content } });
  c.start = r3(Math.max(0, start)); return styleCaption(c, p.captionStyle || DEFAULT_CAPTION_STYLE);
}
/** Add one line at time t. It lasts 2 s, or until the next caption starts. */
export function addCaptionAt(p, t, content = 'New caption') {
  const next = captions(p).find(c => c.start > t + 0.05), end = next ? Math.min(next.start, t + 2) : t + 2;
  const c = newCaption(p, content, t, Math.max(0.4, end - t)); addToKind(p, 'caption', c, c.start); return c;
}
export const splitLines = text => String(text || '').replace(/\r/g, '').split('\n').map(s => s.trim()).filter(Boolean);
/** Bulk paste: one caption per line, spread evenly over [t0, t1]. replace = first remove the captions inside that range. */
export function bulkCaptions(p, text, t0, t1, replace = true) {
  const lines = splitLines(text); if (!lines.length || !(t1 - t0 > 0.05)) return [];
  if (replace) for (const t of captionTracks(p)) t.clips = t.clips.filter(c => clipEnd(c) <= t0 + 1e-6 || c.start >= t1 - 1e-6);
  const d = (t1 - t0) / lines.length, made = [];
  lines.forEach((l, i) => { const s = r3(t0 + d * i), e = i === lines.length - 1 ? r3(t1) : r3(t0 + d * (i + 1)); const c = newCaption(p, l, s, e - s); addToKind(p, 'caption', c, s); made.push(c); });
  normalize(p); return made;
}
export function setCaptionStyleAll(p, id) { p.captionStyle = id; for (const c of captions(p)) styleCaption(c, id); }
/* ---------- SRT ---------- */
export function srtTime(t) {
  const ms = Math.max(0, Math.round(t * 1000)), h = Math.floor(ms / 3600000), m = Math.floor(ms / 60000) % 60, s = Math.floor(ms / 1000) % 60, f = ms % 1000;
  const z = (n, k = 2) => String(n).padStart(k, '0'); return `${z(h)}:${z(m)}:${z(s)},${z(f, 3)}`;
}
export function parseSrtTime(s) {
  const m = /(\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})/.exec(s); if (!m) return NaN;
  return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, '0') / 1000;
}
/** Parse SubRip text -> [{ start, end, text }] (also accepts WebVTT-style dots and missing index lines). */
export function parseSRT(src) {
  const out = [], blocks = String(src || '').replace(/^\uFEFF/, '').replace(/\r/g, '').split(/\n\s*\n/);
  for (const b of blocks) {
    const ls = b.split('\n').filter(l => l.trim() !== ''); const ti = ls.findIndex(l => l.includes('-->')); if (ti < 0) continue;
    const [a, z] = ls[ti].split('-->'), start = parseSrtTime(a), end = parseSrtTime(z); if (!(end > start)) continue;
    const text = ls.slice(ti + 1).join('\n').replace(/<\/?[a-z][^>]*>/gi, '').trim(); if (text) out.push({ start, end, text });
  }
  return out.sort((x, y) => x.start - y.start);
}
export function toSRT(list) { return list.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n'); }
export const projectSRT = p => toSRT(captions(p).map(c => ({ start: c.start, end: clipEnd(c), text: c.text.content })));
/** Import: replaces all captions (an empty project gets a black main clip long enough to show them). */
export function importSRT(p, src) {
  const list = parseSRT(src); if (!list.length) return 0;
  for (const t of captionTracks(p)) t.clips = [];
  for (const l of list) { const c = newCaption(p, l.text, l.start, l.end - l.start); addToKind(p, 'caption', c, c.start); }
  normalize(p); return list.length;
}
export { projectDuration, clipDur };

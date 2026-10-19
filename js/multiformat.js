/* Multi-format export: one project -> 9:16, 16:9, 1:1 (and 4:5) in one go. Each format has its own manual "camera"
   (no AI): mode 'crop' = a window into the original frame, keyframable centre x / y and zoom; mode 'fit' = the whole
   frame inside the new shape over a blurred copy. Stored in p.formats[aspect] = { mode, keys: [{ t, x, y, z }] }.
   reframed(p, aspect) gives a project copy with p.reframe set; renderFrame draws it (so preview == export). */
import { ASPECTS, registerAspect, projectDuration } from './project.js';

export const PLATFORMS = [
  { id: 'youtube', name: 'YouTube', aspect: '16:9', short: 1080, fps: 30, mbps: 12, maxMB: 0, maxS: 0, note: '1920×1080 · 12 Mbps' },
  { id: 'shorts', name: 'YouTube Shorts', aspect: '9:16', short: 1080, fps: 30, mbps: 10, maxMB: 0, maxS: 180, note: '1080×1920 · up to 3 min' },
  { id: 'tiktok', name: 'TikTok', aspect: '9:16', short: 1080, fps: 30, mbps: 8, maxMB: 287, maxS: 600, note: '1080×1920 · ≤ 287 MB' },
  { id: 'reel', name: 'Instagram Reel', aspect: '9:16', short: 1080, fps: 30, mbps: 8, maxMB: 0, maxS: 180, note: '1080×1920 · up to 3 min' },
  { id: 'igpost', name: 'Instagram Post', aspect: '1:1', short: 1080, fps: 30, mbps: 6, maxMB: 0, maxS: 60, note: '1080×1080 · up to 60 s' },
  { id: 'igportrait', name: 'Instagram Post 4:5', aspect: '4:5', short: 1080, fps: 30, mbps: 6, maxMB: 0, maxS: 60, note: '1080×1350' },
  { id: 'facebook', name: 'Facebook', aspect: '16:9', short: 1080, fps: 30, mbps: 8, maxMB: 0, maxS: 0, note: '1920×1080 · 8 Mbps' },
  { id: 'fbsquare', name: 'Facebook Feed 1:1', aspect: '1:1', short: 1080, fps: 30, mbps: 6, maxMB: 0, maxS: 0, note: '1080×1080' },
];
export const platformById = id => PLATFORMS.find(x => x.id === id) || null;
export const FORMATS = ['9:16', '16:9', '1:1', '4:5'];
registerAspect('4:5');
/** Safe areas (fractions of the frame kept clear of app buttons / captions UI): [left, top, right, bottom] margins. */
export const SAFE = { '9:16': [.06, .1, .12, .2], '16:9': [.05, .05, .05, .08], '1:1': [.05, .05, .05, .05], '4:5': [.05, .06, .05, .1] };
export const fmtOf = (p, a) => { const f = (p.formats || {})[a]; return { mode: 'crop', keys: [{ t: 0, x: .5, y: .5, z: 1 }], ...(f || {}) }; };
export function setFormat(p, a, f) { p.formats = { ...(p.formats || {}), [a]: { ...fmtOf(p, a), ...f } }; return p.formats[a]; }
/** Camera at time t (linear between keyframes, held before the first / after the last). */
export function camAt(f, t) {
  const K = [...(f.keys || [])].sort((a, b) => a.t - b.t); if (!K.length) return { x: .5, y: .5, z: 1 };
  if (t <= K[0].t) return K[0]; if (t >= K[K.length - 1].t) return K[K.length - 1];
  for (let i = 0; i < K.length - 1; i++) if (t <= K[i + 1].t) { const a = K[i], b = K[i + 1], u = (t - a.t) / Math.max(1e-6, b.t - a.t), s = u * u * (3 - 2 * u); return { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s, z: a.z + (b.z - a.z) * s }; }
  return K[K.length - 1];
}
export function setKey(p, a, t, cam) { const f = fmtOf(p, a), keys = (f.keys || []).filter(k => Math.abs(k.t - t) > 0.04); keys.push({ t: Math.round(t * 1000) / 1000, x: cam.x, y: cam.y, z: cam.z }); keys.sort((x, y) => x.t - y.t); return setFormat(p, a, { keys }); }
/** Project copy for one output shape (the original shape needs no reframing). */
export function reframed(p, a) { if (a === p.aspect) return p; return { ...p, aspect: a, reframe: { src: p.aspect, ...fmtOf(p, a) } }; }
/** Source window (in source pixels SW x SH) for an output W x H at camera c. */
export function cropWindow(SW, SH, W, H, c) {
  const z = Math.max(1, c.z || 1); let ww, wh; if (W / H > SW / SH) { ww = SW; wh = SW * H / W; } else { wh = SH; ww = SH * W / H; }
  ww /= z; wh /= z; const cx = Math.min(SW - ww / 2, Math.max(ww / 2, (c.x ?? .5) * SW)), cy = Math.min(SH - wh / 2, Math.max(wh / 2, (c.y ?? .5) * SH));
  return { sx: cx - ww / 2, sy: cy - wh / 2, sw: ww, sh: wh };
}
/** Source render size for output W x H: big enough that the crop window maps 1:1 to the output (capped). */
export function sourceSize(src, W, H, c, mode) {
  const [a, b] = ASPECTS[src] || [9, 16]; if (mode === 'fit') { const k = Math.min(W / a, H / b); return { SW: Math.round(a * k / 2) * 2, SH: Math.round(b * k / 2) * 2 }; }
  const z = Math.max(1, c.z || 1), base = W / H > a / b ? W : H * a / b; let SW = base * z; const cap = 4096 / Math.max(1, Math.max(SW, SW * b / a)); if (cap < 1) SW *= cap;
  return { SW: Math.round(SW / 2) * 2, SH: Math.round(SW * b / a / 2) * 2 };
}
/** Safe-area check: which text / sticker boxes (output coordinates) leave the safe area or the frame. boxesAt(t) -> [{ id, cx, cy, w, h }] */
export function safeCheck(p, a, W, H, boxesAt) {
  const [l, t, r, b] = SAFE[a] || [.05, .05, .05, .05], out = [], seen = new Set();
  const clips = p.tracks.filter(tr => tr.kind === 'text' || tr.kind === 'caption' || tr.kind === 'overlay').flatMap(tr => tr.clips.filter(c => c.type === 'text' || c.sticker || c.brand === 'wm' || (tr.kind === 'overlay' && c.type === 'image')));
  for (const c of clips) { if (seen.has(c.id)) continue; const tm = c.start + Math.min(Math.max(.05, (c.dur || 1) * .5), 3);
    const bx = boxesAt(tm).find(x => x.id === c.id); if (!bx) continue; seen.add(c.id);
    const x0 = bx.cx - bx.w / 2, x1 = bx.cx + bx.w / 2, y0 = bx.cy - bx.h / 2, y1 = bx.cy + bx.h / 2;
    const off = x0 < -1 || y0 < -1 || x1 > W + 1 || y1 > H + 1, unsafe = x0 < l * W || y0 < t * H || x1 > W * (1 - r) || y1 > H * (1 - b);
    if (off || unsafe) out.push({ id: c.id, name: c.type === 'text' ? (c.text.content || '').split('\n')[0].slice(0, 24) : (c.name || 'Picture'), level: off ? 'cut' : 'unsafe', t: tm }); }
  return out;
}
/** Plan the queue: estimated size + warnings per platform. */
export function planQueue(p, ids) { const D = projectDuration(p);
  return ids.map(platformById).filter(Boolean).map(P => { const MB = (P.mbps * 1e6 + 192000) * D / 8 / 1e6, warn = [];
    if (P.maxS && D > P.maxS) warn.push(`longer than ${P.maxS} s`); if (P.maxMB && MB > P.maxMB) warn.push(`over ${P.maxMB} MB`);
    return { ...P, D, estMB: Math.round(MB * 10) / 10, warn }; }); }

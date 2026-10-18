/* Registries: the data-driven extension points of Emmavengers Studio.
   To add a feature, add an entry here; the timeline, panels, renderer and exporter read these tables.
   - TRACK_KINDS: what kinds of tracks exist, what they accept, how they stack.
   - FILTERS: colour looks, drawn with canvas ctx.filter (works in preview and export identically).
   - TRANSITIONS (js/transitions.js): how clip A blends into clip B on the main track; render(ctx, A, B, p, W, H).
   - KEYFRAME_PROPS: animatable transform properties; the renderer already evaluates clip.keyframes[prop]. */

export const TRACK_KINDS = {
  caption: { label: 'Captions', visual: true,  magnetic: false, accepts: ['text'],           z: 4, height: 30 },
  text:    { label: 'Text',    visual: true,  magnetic: false, accepts: ['text'],           z: 3, height: 34 },
  effect:  { label: 'Effects', visual: true,  magnetic: false, accepts: ['effect'],         z: 2.5, height: 30 },
  overlay: { label: 'Overlay', visual: true,  magnetic: false, accepts: ['video', 'image'], z: 2, height: 44 },
  main:    { label: 'Main',    visual: true,  magnetic: true,  accepts: ['video', 'image'], z: 1, height: 58 },
  audio:   { label: 'Audio',   visual: false, magnetic: false, accepts: ['audio'],          z: 0, height: 36 },
};

export const DEFAULT_TRANSFORM = { x: 0.5, y: 0.5, scale: 1, rotation: 0, opacity: 1 };

export const KEYFRAME_PROPS = {
  x:        { label: 'Position X', min: -0.5, max: 1.5, step: 0.001, fmt: v => Math.round(v * 100) + '%' },
  y:        { label: 'Position Y', min: -0.5, max: 1.5, step: 0.001, fmt: v => Math.round(v * 100) + '%' },
  scale:    { label: 'Scale',      min: 0.05, max: 5,   step: 0.01,  fmt: v => Math.round(v * 100) + '%' },
  rotation: { label: 'Rotate',     min: -180, max: 180, step: 1,     fmt: v => Math.round(v) + '°' },
  opacity:  { label: 'Opacity',    min: 0,    max: 1,   step: 0.01,  fmt: v => Math.round(v * 100) + '%' },
  volume:   { label: 'Volume',     min: 0,    max: 2,   step: 0.01,  fmt: v => Math.round(v * 100) + '%', base: 'clip' },
};
/* Crop and mask values live on clip.crop / clip.mask; they animate like the transform when the clip has keyframes. */
const pct = v => Math.round(v * 100) + '%', deg = v => Math.round(v) + '°';
const sub = (obj, key, label, min, max, step, fmt, def) => ({ label, min, max, step, fmt, get: c => c[obj]?.[key] ?? def, set: (c, v) => { (c[obj] ||= {})[key] = v; } });
Object.assign(KEYFRAME_PROPS, {
  cropX: sub('crop', 'x', 'Crop left', 0, 0.95, 0.001, pct, 0), cropY: sub('crop', 'y', 'Crop top', 0, 0.95, 0.001, pct, 0),
  cropW: sub('crop', 'w', 'Crop width', 0.05, 1, 0.001, pct, 1), cropH: sub('crop', 'h', 'Crop height', 0.05, 1, 0.001, pct, 1),
  straighten: sub('crop', 'angle', 'Straighten', -45, 45, 0.5, deg, 0),
  maskX: sub('mask', 'x', 'Mask X', -0.5, 1.5, 0.001, pct, 0.5), maskY: sub('mask', 'y', 'Mask Y', -0.5, 1.5, 0.001, pct, 0.5),
  maskW: sub('mask', 'w', 'Mask width', 0.02, 2, 0.001, pct, 0.6), maskH: sub('mask', 'h', 'Mask height', 0.02, 2, 0.001, pct, 0.6),
  maskRot: sub('mask', 'rot', 'Mask rotate', -180, 180, 1, deg, 0), maskFeather: sub('mask', 'feather', 'Feather', 0, 1, 0.01, pct, 0),
});
export const CROP_PROPS = ['cropX', 'cropY', 'cropW', 'cropH', 'straighten'];
export const MASK_PROPS = ['maskX', 'maskY', 'maskW', 'maskH', 'maskRot', 'maskFeather'];
export const TRANSFORM_PROPS = ['x', 'y', 'scale', 'rotation', 'opacity'];
/** Which properties a clip type can animate. */
export const kfPropsFor = c => c.type === 'audio' ? ['volume'] : [...TRANSFORM_PROPS, ...(c.type === 'video' ? ['volume'] : []), ...(c.crop ? CROP_PROPS : []), ...(c.mask && c.mask.shape !== 'none' ? MASK_PROPS : [])];
export { E as EASINGS } from './transitions.js';
import { E } from './transitions.js';
export const EASING_LIST = [{ id: 'linear', name: 'Linear' }, { id: 'in', name: 'Ease in' }, { id: 'out', name: 'Ease out' }, { id: 'inOut', name: 'Ease in-out' }, { id: 'bounce', name: 'Bounce' }];
const baseOf = (clip, prop) => { const d = KEYFRAME_PROPS[prop]; return d?.get ? d.get(clip) : d?.base === 'clip' ? (clip[prop] ?? 1) : clip.transform[prop]; };
/** Set the static (non-keyframed) value of an animatable property. */
export function setBase(clip, prop, v) { const d = KEYFRAME_PROPS[prop]; if (d?.set) d.set(clip, v); else if (d?.base === 'clip') clip[prop] = v; else clip.transform[prop] = v; }
/** Value of an animatable property at clip-local time t. Keyframes win over the static value.
    The easing stored on a keyframe shapes the movement that LEAVES it (towards the next keyframe). */
export function propAt(clip, prop, t) {
  const kf = clip.keyframes && clip.keyframes[prop];
  if (!kf || !kf.length) return baseOf(clip, prop);
  if (t <= kf[0].t) return kf[0].v;
  for (let i = 1; i < kf.length; i++) if (t <= kf[i].t) {
    const a = kf[i - 1], b = kf[i], e = E[a.ease || 'linear'] || E.linear;
    return a.v + (b.v - a.v) * e((t - a.t) / Math.max(1e-6, b.t - a.t));
  }
  return kf[kf.length - 1].v;
}

/* colour filters: GL grades from js/filterdefs.js (CSS approximation only when WebGL2 is missing) */
import { FILTER_DEFS, FILTER_CATS } from './filterdefs.js';
import { gradeCss } from './effects.js';
export { FILTER_CATS };
export const FILTERS = [{ id: null, name: 'None', css: () => '' }, ...FILTER_DEFS.map(f => ({ id: f.id, name: f.name, cat: f.cat, css: i => gradeCss(f.id, i) }))];
export const filterCss = f => { if (!f || !f.id) return ''; const d = FILTERS.find(x => x.id === f.id); return d ? d.css(f.amount ?? 1) : ''; };

export { TRANSITIONS, TRANSITION_CATS, transitionById } from './transitions.js';

export const FONTS = {
  bold:    { name: 'Bold',    css: '800 SIZEpx system-ui, "Segoe UI", Roboto, sans-serif' },
  classic: { name: 'Classic', css: '700 SIZEpx Georgia, "Times New Roman", serif' },
  round:   { name: 'Round',   css: '700 SIZEpx "Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive, sans-serif' },
  clean:   { name: 'Clean',   css: '500 SIZEpx system-ui, "Segoe UI", Roboto, sans-serif' },
  mono:    { name: 'Mono',    css: '700 SIZEpx ui-monospace, "Roboto Mono", monospace' },
};
/* bundled open-licence fonts (js/fontlist.js, lib/fonts); variable fonts are pinned to one display weight, so every face is 400 */
import { FONT_LIST } from './fontlist.js';
for (const [id, family, group, licence] of FONT_LIST) FONTS[id] = { name: family, group, licence, bundled: true, css: `400 SIZEpx "EVF-${id}", system-ui, sans-serif` };
export const FONT_GROUPS = [['kids', 'Kids'], ['hand', 'Hand'], ['script', 'Script'], ['clean', 'Clean'], ['display', 'Display'], ['system', 'System']];
export const COLORS = ['#ffffff', '#000000', '#ffcc33', '#ff4d4d', '#ff8a00', '#ffe600', '#3ddc84', '#1fb6ff', '#3b5bff', '#a259ff', '#ff5fa2', '#8b5a2b'];
export const BG_COLORS = ['#000000', '#ffffff', '#1b1b2f', '#ffcc33', '#1fb6ff', '#3ddc84', '#ff5fa2'];
export const SPEED_PRESETS = [0.25, 0.5, 1, 1.5, 2, 3, 4];
export const EXPORT_PRESETS = { '720p': 720, '1080p': 1080 };

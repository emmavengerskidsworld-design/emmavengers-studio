/* Registries: the data-driven extension points of Emmavengers Studio.
   To add a feature, add an entry here; the timeline, panels, renderer and exporter read these tables.
   - TRACK_KINDS: what kinds of tracks exist, what they accept, how they stack.
   - FILTERS: colour looks, drawn with canvas ctx.filter (works in preview and export identically).
   - TRANSITIONS: (next step) how clip A blends into clip B on the main track; render(ctx, drawA, drawB, progress).
   - KEYFRAME_PROPS: animatable transform properties; the renderer already evaluates clip.keyframes[prop]. */

export const TRACK_KINDS = {
  text:    { label: 'Text',    visual: true,  magnetic: false, accepts: ['text'],           z: 3, height: 34 },
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
};
export const EASINGS = {
  linear: t => t,
  inOut: t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
};
/** Value of a transform property at clip-local time t: keyframes win over the static transform. */
export function propAt(clip, prop, t) {
  const kf = clip.keyframes && clip.keyframes[prop];
  if (!kf || !kf.length) return clip.transform[prop];
  if (t <= kf[0].t) return kf[0].v;
  for (let i = 1; i < kf.length; i++) if (t <= kf[i].t) {
    const a = kf[i - 1], b = kf[i], e = EASINGS[b.ease || 'linear'] || EASINGS.linear;
    return a.v + (b.v - a.v) * e((t - a.t) / Math.max(1e-6, b.t - a.t));
  }
  return kf[kf.length - 1].v;
}

export const FILTERS = [
  { id: null,     name: 'None',   css: () => '' },
  { id: 'vivid',  name: 'Vivid',  css: i => `saturate(${1 + .8 * i}) contrast(${1 + .12 * i})` },
  { id: 'warm',   name: 'Warm',   css: i => `sepia(${.35 * i}) saturate(${1 + .3 * i}) brightness(${1 + .04 * i})` },
  { id: 'cool',   name: 'Cool',   css: i => `hue-rotate(${-12 * i}deg) saturate(${1 + .15 * i})` },
  { id: 'bright', name: 'Bright', css: i => `brightness(${1 + .25 * i}) contrast(${1 + .05 * i})` },
  { id: 'fade',   name: 'Fade',   css: i => `contrast(${1 - .25 * i}) brightness(${1 + .08 * i}) saturate(${1 - .2 * i})` },
  { id: 'bw',     name: 'B&W',    css: i => `grayscale(${i}) contrast(${1 + .1 * i})` },
  { id: 'old',    name: 'Old film', css: i => `sepia(${.8 * i}) contrast(${1 + .1 * i}) brightness(${1 - .05 * i})` },
];
export const filterCss = f => { if (!f || !f.id) return ''; const d = FILTERS.find(x => x.id === f.id); return d ? d.css(f.amount ?? 1) : ''; };

/* Transitions: next step. A transition sits on clip.transitionIn = {id, dur}; renderer will call render() while
   the previous main clip and this one overlap. Kept here so the data shape is fixed from day one. */
export const TRANSITIONS = [
  { id: null, name: 'None' },
];

export const FONTS = {
  bold:    { name: 'Bold',    css: '800 SIZEpx system-ui, "Segoe UI", Roboto, sans-serif' },
  classic: { name: 'Classic', css: '700 SIZEpx Georgia, "Times New Roman", serif' },
  round:   { name: 'Round',   css: '700 SIZEpx "Comic Sans MS", "Chalkboard SE", "Comic Neue", cursive, sans-serif' },
  clean:   { name: 'Clean',   css: '500 SIZEpx system-ui, "Segoe UI", Roboto, sans-serif' },
  mono:    { name: 'Mono',    css: '700 SIZEpx ui-monospace, "Roboto Mono", monospace' },
};
export const COLORS = ['#ffffff', '#000000', '#ffcc33', '#ff4d4d', '#ff8a00', '#ffe600', '#3ddc84', '#1fb6ff', '#3b5bff', '#a259ff', '#ff5fa2', '#8b5a2b'];
export const BG_COLORS = ['#000000', '#ffffff', '#1b1b2f', '#ffcc33', '#1fb6ff', '#3ddc84', '#ff5fa2'];
export const SPEED_PRESETS = [0.25, 0.5, 1, 1.5, 2, 3, 4];
export const EXPORT_PRESETS = { '720p': 720, '1080p': 1080 };

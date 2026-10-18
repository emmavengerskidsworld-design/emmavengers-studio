/* Animation registries (our own designs, plain maths — no AI).
   CLIP_ANIMS: In / Out / Combo for video, photo and overlay/sticker clips. TEXT_ANIMS: In / Out / Loop for text,
   with a per-letter / per-word / per-line engine. Each entry is ONE object: f(q) -> partial state.
   A state is a small set of offsets that the compositor (js/render.js) applies on top of the clip's own
   transform + keyframes, so preview and export are drawn by the same code.
     clip state: dx, dy (fraction of the frame), s, sx, sy (scale), rot (deg), a (opacity), blur (px at 1080p),
                 bright (extra brightness), skx (skew), wipe {x0,y0,x1,y1} (visible part of the clip, 0..1)
     text state: same, but dx/dy/blur in "em" (font size), plus glow (em), color, reveal, underline [u0,u1]
   Contract (tests/test_anim.py): an In animation ends on the untouched picture (q = 1 -> identity),
   Out entries are mirrors of In entries (q -> 1 - q), loops are periodic in the phase. */
import { E } from './transitions.js';
const PI = Math.PI, TAU = 2 * PI;
const back = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const elastic = t => t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - .75) * (TAU / 3)) + 1;
const out = E.out, inOut = E.inOut, cl = x => Math.max(0, Math.min(1, x));
const settle = (q, f = 3) => (1 - q) * (1 - q) * Math.cos(f * TAU * q);          // decaying swing, exactly 0 at q = 1
const beat = ph => { const x = ph % 1; return Math.exp(-Math.pow((x - .12) / .05, 2)) + .6 * Math.exp(-Math.pow((x - .32) / .06, 2)); };
const hash = (i, j) => { const v = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453; return v - Math.floor(v); };
const wave = ph => .5 - .5 * Math.cos(TAU * ph);

/* ---------------- clip animations ---------------- */
const IN = [
  { id: 'fade', name: 'Fade in', out: 'Fade out', f: q => ({ a: q }) },
  { id: 'zoomIn', name: 'Zoom in', out: 'Zoom out', f: q => ({ s: .3 + .7 * out(q), a: cl(q * 2.5) }) },
  { id: 'zoomOut', name: 'Zoom down', out: 'Zoom up', f: q => ({ s: 1.8 - .8 * out(q), a: q }) },
  { id: 'slideL', name: 'From left', out: 'To left', f: q => ({ dx: -(1 - out(q)) }) },
  { id: 'slideR', name: 'From right', out: 'To right', f: q => ({ dx: 1 - out(q) }) },
  { id: 'slideU', name: 'From top', out: 'To top', f: q => ({ dy: -(1 - out(q)) }) },
  { id: 'slideD', name: 'From bottom', out: 'To bottom', f: q => ({ dy: 1 - out(q) }) },
  { id: 'rise', name: 'Rise', out: 'Sink', f: q => ({ dy: .12 * (1 - out(q)), a: q }) },
  { id: 'drop', name: 'Drop', out: 'Lift off', f: q => ({ dy: -.6 * (1 - E.bounce(q)), a: cl(q * 3) }) },
  { id: 'pop', name: 'Pop', out: 'Pop away', f: q => ({ s: Math.max(.001, back(q)), a: cl(q * 3) }) },
  { id: 'bounce', name: 'Bounce', out: 'Bounce away', f: q => ({ s: Math.max(.001, E.bounce(q)), a: cl(q * 4) }) },
  { id: 'spin', name: 'Spin in', out: 'Spin out', f: q => ({ rot: -360 * (1 - out(q)), s: .2 + .8 * out(q), a: cl(q * 2) }) },
  { id: 'swing', name: 'Swing', out: 'Swing away', f: q => ({ rot: 35 * settle(q), a: cl(q * 3) }) },
  { id: 'flip', name: 'Flip', out: 'Flip away', f: q => ({ sx: Math.max(.001, Math.sin(q * PI / 2)), a: cl(q * 4) }) },
  { id: 'rotateIn', name: 'Rotate in', out: 'Rotate out', f: q => ({ rot: -90 * (1 - out(q)), s: .8 + .2 * out(q), a: q }) },
  { id: 'blurIn', name: 'Blur in', out: 'Blur out', f: q => ({ blur: 40 * (1 - q), a: cl(q * 1.5) }) },
  { id: 'wipe', name: 'Wipe right', out: 'Wipe off right', f: q => ({ wipe: { x0: 0, y0: 0, x1: inOut(q), y1: 1 } }) },
  { id: 'wipeUp', name: 'Wipe up', out: 'Wipe off up', f: q => ({ wipe: { x0: 0, y0: 1 - inOut(q), x1: 1, y1: 1 } }) },
  { id: 'shake', name: 'Shake in', out: 'Shake out', f: q => ({ dx: .05 * (1 - q) * Math.sin(q * 40), rot: 4 * (1 - q) * Math.sin(q * 33), a: cl(q * 3) }) },
  { id: 'stretch', name: 'Stretch', out: 'Stretch out', f: q => ({ sx: 1 + 1.5 * (1 - out(q)), sy: 1 - .5 * (1 - out(q)), a: q }) },
  { id: 'squeeze', name: 'Squeeze', out: 'Squeeze out', f: q => ({ sx: .5 + .5 * out(q), sy: 2 - out(q), a: q }) },
  { id: 'elastic', name: 'Elastic', out: 'Elastic out', f: q => ({ s: Math.max(.001, elastic(q)), a: cl(q * 4) }) },
  { id: 'flash', name: 'Flash in', out: 'Flash out', f: q => ({ bright: 2.2 * (1 - q), a: cl(q * 2) }) },
  { id: 'tilt', name: 'Tilt in', out: 'Tilt out', f: q => ({ skx: .6 * (1 - out(q)), dx: -.35 * (1 - out(q)), a: q }) },
  { id: 'fly', name: 'Fly in', out: 'Fly away', f: q => ({ s: 3 - 2 * out(q), a: q, blur: 14 * (1 - q) }) },
  { id: 'roll', name: 'Roll in', out: 'Roll out', f: q => ({ dx: -(1 - out(q)), rot: -360 * (1 - out(q)) }) },
];
const COMBO = [
  { id: 'pulse', name: 'Pulse', f: ph => ({ s: 1 + .08 * wave(ph) }) },
  { id: 'wobble', name: 'Wobble', f: ph => ({ rot: 6 * Math.sin(TAU * ph), sx: 1 + .03 * Math.sin(2 * TAU * ph) }) },
  { id: 'float', name: 'Float', f: ph => ({ dy: -.025 * Math.sin(TAU * ph) }) },
  { id: 'heartbeat', name: 'Heartbeat', f: ph => ({ s: 1 + .12 * beat(ph) }) },
  { id: 'swingLoop', name: 'Swing', f: ph => ({ rot: 12 * Math.sin(TAU * ph) }) },
  { id: 'spinLoop', name: 'Spin', f: ph => ({ rot: 360 * (ph % 1) }) },
  { id: 'shakeLoop', name: 'Shake', f: ph => ({ dx: .012 * Math.sin(TAU * 7 * ph), dy: .008 * Math.sin(TAU * 5 * ph + 1) }) },
  { id: 'jelly', name: 'Jelly', f: ph => ({ sx: 1 + .08 * Math.sin(TAU * ph), sy: 1 - .08 * Math.sin(TAU * ph) }) },
  { id: 'breathe', name: 'Breathe', f: ph => ({ s: 1 + .04 * wave(ph), a: .85 + .15 * Math.cos(TAU * ph) }) },
  { id: 'tiltLoop', name: 'Tilt', f: ph => ({ skx: .12 * Math.sin(TAU * ph) }) },
  { id: 'hop', name: 'Hop', f: ph => ({ dy: -.05 * Math.abs(Math.sin(PI * ph)) }) },
  { id: 'blink', name: 'Blink', f: ph => ({ a: .6 + .4 * Math.cos(TAU * ph) }) },
  { id: 'sway', name: 'Sway', f: ph => ({ dx: .03 * Math.sin(TAU * ph) }) },
  { id: 'rock', name: 'Rock', f: ph => ({ rot: 8 * Math.sin(TAU * ph), dy: -.01 * Math.abs(Math.cos(TAU * ph)) }) },
  { id: 'orbit', name: 'Orbit', f: ph => ({ dx: .02 * Math.cos(TAU * ph) - .02, dy: .02 * Math.sin(TAU * ph) }) },
  { id: 'shine', name: 'Shine', f: ph => ({ bright: .3 * wave(ph) }) },
];
const mirror = list => list.map(a => ({ id: a.id, name: a.out || a.name, f: (q, u) => a.f(1 - q, u), unit: a.unit, stagger: a.stagger }));
export const CLIP_ANIMS = { in: IN.map(a => ({ id: a.id, name: a.name, f: a.f })), out: mirror(IN), combo: COMBO };

/* ---------------- text animations ---------------- */
const T_IN = [
  { id: 'typewriter', name: 'Typewriter', out: 'Backspace', unit: 'char', stagger: 1, f: q => ({ a: q > 1e-3 ? 1 : 0 }) },
  { id: 'pop', name: 'Pop letters', out: 'Pop letters', unit: 'char', stagger: .8, f: q => ({ s: Math.max(.001, back(q)), a: cl(q * 3) }) },
  { id: 'waveIn', name: 'Wave in', out: 'Wave out', unit: 'char', stagger: .7, f: q => ({ dy: .8 * (1 - out(q)), a: q }) },
  { id: 'bounceIn', name: 'Bouncy letters', out: 'Bouncy letters', unit: 'char', stagger: .7, f: q => ({ dy: -1.2 * (1 - E.bounce(q)), a: cl(q * 4) }) },
  { id: 'fadeWords', name: 'Fade by word', out: 'Fade by word', unit: 'word', stagger: .8, f: q => ({ a: q }) },
  { id: 'riseWords', name: 'Rise by word', out: 'Sink by word', unit: 'word', stagger: .6, f: q => ({ dy: .8 * (1 - out(q)), a: q }) },
  { id: 'zoom', name: 'Zoom', out: 'Zoom', unit: 'block', f: q => ({ s: .2 + .8 * out(q), a: q }) },
  { id: 'slide', name: 'Slide', out: 'Slide', unit: 'block', f: q => ({ dx: -4 * (1 - out(q)), a: q }) },
  { id: 'spring', name: 'Spring', out: 'Spring', unit: 'block', f: q => ({ s: Math.max(.001, elastic(q)), a: cl(q * 4) }) },
  { id: 'blur', name: 'Blur', out: 'Blur', unit: 'block', f: q => ({ blur: .5 * (1 - q), a: q }) },
  { id: 'riseLines', name: 'Rise by line', out: 'Sink by line', unit: 'line', stagger: .6, f: q => ({ dy: 1 * (1 - out(q)), a: q }) },
  { id: 'dropLetters', name: 'Drop letters', out: 'Lift letters', unit: 'char', stagger: .6, f: q => ({ dy: -2 * (1 - out(q)), a: q }) },
  { id: 'spinLetters', name: 'Spin letters', out: 'Spin letters', unit: 'char', stagger: .6, f: q => ({ rot: -180 * (1 - out(q)), s: Math.max(.001, out(q)), a: q }) },
  { id: 'reveal', name: 'Reveal', out: 'Hide', unit: 'block', f: q => ({ reveal: inOut(q) }) },
  { id: 'underline', name: 'Underline sweep', out: 'Underline sweep', unit: 'block', f: q => ({ a: cl(q * 2), underline: [cl(2 * q - 1), cl(2 * q)] }) },
  { id: 'flickerIn', name: 'Flicker on', out: 'Flicker off', unit: 'char', stagger: .5, f: (q, u) => ({ a: q >= .85 ? 1 : q <= 0 ? 0 : (hash(u.i, Math.floor(q * 9)) > .45 ? 1 : .12) }) },
  { id: 'glowIn', name: 'Glow in', out: 'Glow out', unit: 'block', f: q => ({ glow: .6 * (1 - q), a: q }) },
  { id: 'stretchIn', name: 'Stretch letters', out: 'Squash letters', unit: 'char', stagger: .6, f: q => ({ sy: Math.max(.001, out(q)), a: cl(q * 2) }) },
];
const T_LOOP = [
  { id: 'wave', name: 'Wave', unit: 'char', f: (ph, u) => ({ dy: -.25 * Math.sin(TAU * (ph - u.i * .08)) }) },
  { id: 'glowPulse', name: 'Glow pulse', unit: 'block', f: ph => ({ glow: .45 * wave(ph) }) },
  { id: 'flicker', name: 'Flicker', unit: 'char', f: (ph, u) => ({ a: hash(u.i, Math.floor((ph - Math.floor(ph)) * 10)) > .2 ? 1 : .3 }) },
  { id: 'rainbow', name: 'Rainbow', unit: 'char', f: (ph, u) => ({ color: `hsl(${((ph * 360 + u.i * 25) % 360).toFixed(0)},90%,60%)` }) },
  { id: 'shake', name: 'Shake', unit: 'block', f: ph => ({ dx: .06 * Math.sin(TAU * 5 * ph), dy: .04 * Math.sin(TAU * 7 * ph + 1) }) },
  { id: 'bounce', name: 'Bounce', unit: 'char', f: (ph, u) => ({ dy: -.35 * Math.abs(Math.sin(PI * (ph - u.i * .1))) }) },
  { id: 'pulse', name: 'Pulse', unit: 'block', f: ph => ({ s: 1 + .07 * wave(ph) }) },
  { id: 'jelly', name: 'Jelly', unit: 'char', f: (ph, u) => { const v = Math.sin(TAU * (ph - u.i * .06)); return { sx: 1 + .12 * v, sy: 1 - .12 * v }; } },
  { id: 'swing', name: 'Swing', unit: 'block', f: ph => ({ rot: 6 * Math.sin(TAU * ph) }) },
  { id: 'heartbeat', name: 'Heartbeat', unit: 'block', f: ph => ({ s: 1 + .1 * beat(ph) }) },
  { id: 'sparkle', name: 'Sparkle', unit: 'char', f: (ph, u) => { const k = Math.pow(Math.max(0, Math.sin(TAU * (ph + hash(u.i, 3)))), 8); return { s: 1 + .25 * k, glow: .3 * k }; } },
];
export const TEXT_ANIMS = { in: T_IN.map(a => ({ id: a.id, name: a.name, unit: a.unit, stagger: a.stagger, f: a.f })), out: mirror(T_IN), loop: T_LOOP };

/* which registry / tab names a clip uses */
export const animSetFor = c => c.type === 'text' ? { reg: TEXT_ANIMS, tabs: [['in', 'In'], ['out', 'Out'], ['loop', 'Loop']] } : { reg: CLIP_ANIMS, tabs: [['in', 'In'], ['out', 'Out'], ['combo', 'Combo']] };
export const animById = (c, kind, id) => (animSetFor(c).reg[kind] || []).find(a => a.id === id);
export const DEFAULT_ANIM_DUR = 0.5, DEFAULT_LOOP_DUR = 1.2, MIN_ANIM = 0.1, MAX_ANIM = 5, MIN_LOOP = 0.3, MAX_LOOP = 4;
export const hasAnim = c => !!(c.anim && Object.values(c.anim).some(x => x && x.id));
export const loopKind = c => c.type === 'text' ? 'loop' : 'combo';

/** In / Out lengths actually used (they share the clip; if they don't fit they are shrunk together). */
export function animSpans(c, D) {
  const a = c.anim || {}; let di = a.in && a.in.id ? a.in.dur : 0, dO = a.out && a.out.id ? a.out.dur : 0;
  if (di + dO > D && di + dO > 0) { const k = D / (di + dO); di *= k; dO *= k; }
  return { di, dO };
}
/** Active animations at clip-local time t: [{ a: entry, q }] with q = progress (In/Out) or phase (loop). */
export function activeAnims(c, t, D) {
  const a = c.anim; if (!a) return null;
  const { di, dO } = animSpans(c, D), r = [], lk = loopKind(c);
  if (di > 0 && t < di) { const e = animById(c, 'in', a.in.id); e && r.push({ a: e, q: Math.max(0, t / di), kind: 'in' }); }
  if (dO > 0 && t > D - dO) { const e = animById(c, 'out', a.out.id); e && r.push({ a: e, q: Math.min(1, (t - (D - dO)) / dO), kind: 'out' }); }
  const L = a[lk]; if (L && L.id) { const e = animById(c, lk, L.id); e && r.push({ a: e, q: t / Math.max(.05, L.dur || DEFAULT_LOOP_DUR), kind: 'loop' }); }
  return r.length ? r : null;
}
export const IDENT = Object.freeze({ dx: 0, dy: 0, s: 1, sx: 1, sy: 1, rot: 0, a: 1, blur: 0, bright: 0, skx: 0, glow: 0, wipe: null, color: null, reveal: 1, underline: null });
/** Combine partial states (offsets add, scales/opacity multiply, wipes intersect). */
export function combine(st, p) {
  if (!p) return st;
  if (p.dx) st.dx += p.dx; if (p.dy) st.dy += p.dy; if (p.s != null) st.s *= p.s; if (p.sx != null) st.sx *= p.sx; if (p.sy != null) st.sy *= p.sy;
  if (p.rot) st.rot += p.rot; if (p.a != null) st.a *= p.a; if (p.blur) st.blur += p.blur; if (p.bright) st.bright += p.bright; if (p.skx) st.skx += p.skx;
  if (p.glow) st.glow += p.glow; if (p.color) st.color = p.color; if (p.reveal != null) st.reveal = Math.min(st.reveal, p.reveal);
  if (p.wipe) st.wipe = st.wipe ? { x0: Math.max(st.wipe.x0, p.wipe.x0), y0: Math.max(st.wipe.y0, p.wipe.y0), x1: Math.min(st.wipe.x1, p.wipe.x1), y1: Math.min(st.wipe.y1, p.wipe.y1) } : { ...p.wipe };
  if (p.underline) st.underline = p.underline;
  return st;
}
/** Whole-clip state for a video / photo / overlay clip at local time t (null = untouched). */
export function clipAnimState(c, t, D) {
  const act = activeAnims(c, t, D); if (!act) return null;
  const st = { ...IDENT }; for (const { a, q } of act) combine(st, a.f(q, { i: 0, n: 1 })); return st;
}
/** Unit progress with stagger: unit i of n starts at stagger*i/n and lasts the rest so all end together at q = 1. */
export function unitQ(q, i, n, stagger = 0) {
  if (n <= 1 || !stagger) return q; const len = 1 - stagger * (n - 1) / n, st = stagger * i / n;
  return cl((q - st) / Math.max(1e-6, len));
}
/** Text: split the active animations into a block state and per-unit functions. */
export function textAnimPlan(c, t, D) {
  const act = activeAnims(c, t, D); if (!act) return null;
  const block = { ...IDENT }, units = [];
  for (const { a, q, kind } of act) {
    if (!a.unit || a.unit === 'block') combine(block, a.f(q, { i: 0, n: 1 }));
    else units.push({ unit: a.unit, loop: kind === 'loop', stagger: a.stagger || 0, q, f: a.f });
  }
  return { block, units };
}

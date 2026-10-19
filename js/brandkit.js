/* Brand Kit: your logos, colours, fonts, intro / outro, watermark and call-to-action lines, saved once on this device and
   applied to any project with one tap (Beat Ad Maker and templates use it too). Pure project edits here; the sheet is in
   brandpanel.js. Every clip the kit adds is tagged clip.brand = 'intro' | 'outro' | 'wm' | 'cta', so applying again
   replaces the old brand clips instead of stacking them. */
import { newClip, newTrack, normalize, projectDuration, clipEnd, clipDur, addToKind, shiftKeyframes } from './project.js';
import { DEFAULT_TRANSFORM } from './registry.js';
import { applyStyle } from './textstyles.js';

export const KIT_KEY = 'evs-brandkit';
export const BRAND_COLORS = ['#ffd23f', '#ff7a00', '#7b3cff', '#1d6fe0', '#ffffff'];
export const INTRO_STYLES = [['pop', 'Logo pop'], ['slide', 'Slide in'], ['spin', 'Spin in'], ['zoom', 'Big zoom']];
export const OUTRO_STYLES = [['burst', 'Logo + CTA'], ['confetti', 'Party'], ['bubbles', 'Bubbles'], ['clean', 'Clean']];
export const WM_POS = [['tl', 'Top left'], ['tr', 'Top right'], ['bl', 'Bottom left'], ['br', 'Bottom right'], ['c', 'Centre']];
export const DEFAULT_KIT = () => ({ v: 1, name: 'Emmavengers', logos: [], logo: 0, colors: [...BRAND_COLORS], fonts: { title: 'luckiestguy', body: 'poppins' },
  intro: { on: true, style: 'pop', dur: 2.5, title: 'Emmavengers' }, outro: { on: true, style: 'burst', dur: 3, cta: 0 },
  watermark: { on: true, pos: 'tr', opacity: 0.6, scale: 0.16 }, cta: ['Subscribe to Emmavengers!', 'Like & share with a friend', 'See you next time!'], auto: true });
export function getKit() { try { const k = JSON.parse(localStorage.getItem(KIT_KEY) || 'null'); if (k && k.v) { const d = DEFAULT_KIT(); return { ...d, ...k, fonts: { ...d.fonts, ...k.fonts }, intro: { ...d.intro, ...k.intro }, outro: { ...d.outro, ...k.outro }, watermark: { ...d.watermark, ...k.watermark } }; } } catch (e) {} return DEFAULT_KIT(); }
/** touched = the user changed the kit (only then do Beat Ad Maker / templates start using it). */
export const saveKit = (k, touched = true) => { if (touched) k.saved = true; localStorage.setItem(KIT_KEY, JSON.stringify(k)); return k; };
export const kitActive = k => !!(k && k.auto && k.saved);
export const kitLogo = k => (k.logos || [])[k.logo || 0] || (k.logos || [])[0] || null;
export const kitMediaIds = (k = getKit()) => (k.logos || []).filter(Boolean);
const r3 = x => Math.round(x * 1000) / 1000;
const brandClips = p => p.tracks.flatMap(t => t.clips.filter(c => c.brand).map(c => ({ t, c })));
const shiftAll = (p, d, skipMain = true) => { for (const t of p.tracks) { if (skipMain && t.kind === 'main') continue; for (const c of t.clips) c.start = r3(Math.max(0, c.start + d)); } for (const m of p.markers || []) m.t = r3(Math.max(0, m.t + d)); };
const textClip = (content, font, size, o = {}) => { const c = newClip('text', { dur: o.dur || 2, transform: { ...DEFAULT_TRANSFORM, y: o.y ?? .5, scale: 1 }, text: { content, font, size } }); if (o.style) applyStyle(c.text, o.style); if (o.color) c.text.color = o.color; if (o.anim) c.anim = { in: { id: o.anim, dur: .6 } }; return c; };
/** Remove everything the kit added before (intro / outro shift the rest back). */
export function removeBrand(p) {
  const main = p.tracks.find(t => t.kind === 'main'), intro = main && main.clips.find(c => c.brand === 'intro');
  for (const t of p.tracks) t.clips = t.clips.filter(c => !c.brand || c.brand === 'cta');
  if (intro) { normalize(p); shiftAll(p, -clipDur(intro), !main.free); }
  normalize(p); return p;
}
function compound(name, dur, tracks, brand) { const cc = newClip('compound', { dur: r3(dur), off: 0, inner: { tracks, v: 1 }, name, transform: { ...DEFAULT_TRANSFORM } }); cc.brand = brand; return cc; }
function bg(kind, dur, colors) { const c = newClip('element', { dur, element: { id: { sweep: 'brand-1', rays: 'brand-2', bubbles: 'brand-3', confetti: 'brand-4' }[kind] || 'brand-1', colors: [...colors] }, name: 'Brand background', fit: 'cover' }); return c; }
const logoClip = (id, dur, o = {}) => Object.assign(newClip('image', { mediaId: id, dur, fit: 'contain', transform: { ...DEFAULT_TRANSFORM, y: o.y ?? .42, scale: o.scale ?? .62 } }), o.anim ? { anim: { in: { id: o.anim, dur: .7 }, combo: o.combo ? { id: o.combo, dur: 1.6 } : null } } : {});
export function introClip(p, k) {
  const L = kitLogo(k), D = Math.max(1, k.intro.dur || 2.5), st = k.intro.style, wide = p.aspect === '16:9';
  const anim = { pop: 'pop', slide: 'springL', spin: 'zoomRotate', zoom: 'flashZoom' }[st] || 'pop';
  const m = { ...newTrack('main'), free: true, clips: [bg(st === 'spin' ? 'rays' : st === 'zoom' ? 'bubbles' : 'sweep', D, k.colors)] }, ov = { ...newTrack('overlay'), clips: [] }, tx = { ...newTrack('text'), clips: [] };
  if (L) ov.clips.push(logoClip(L, D, { anim, combo: 'breathe', scale: wide ? .42 : .62, y: wide ? .4 : .42 }));
  if (k.intro.title) { const t = textClip(k.intro.title, k.fonts.title, wide ? 110 : 96, { dur: r3(D - .5), y: L ? (wide ? .78 : .7) : .5, style: 'emma3d', color: k.colors[0], anim: 'popWords' }); t.start = .5; tx.clips.push(t); }
  return compound('Brand intro', D, [m, ov, tx], 'intro');
}
export function outroClip(p, k) {
  const L = kitLogo(k), D = Math.max(1, k.outro.dur || 3), st = k.outro.style, wide = p.aspect === '16:9', line = (k.cta || [])[k.outro.cta || 0] || '';
  const m = { ...newTrack('main'), free: true, clips: [bg(st === 'confetti' ? 'confetti' : st === 'bubbles' ? 'bubbles' : st === 'clean' ? 'sweep' : 'rays', D, k.colors)] }, ov = { ...newTrack('overlay'), clips: [] }, tx = { ...newTrack('text'), clips: [] };
  if (L) ov.clips.push(logoClip(L, D, { anim: 'pop', combo: 'pulse', scale: wide ? .38 : .56, y: wide ? .38 : .38 }));
  if (line) { const t = textClip(line, k.fonts.body, wide ? 80 : 70, { dur: r3(D - .4), y: wide ? .78 : .7, style: 'labelBlack', anim: 'riseWords' }); t.start = .4; t.text.boxColor = k.colors[2] || '#000000'; tx.clips.push(t); }
  return compound('Brand outro', D, [m, ov, tx], 'outro');
}
const POS = { tl: [.13, .08], tr: [.87, .08], bl: [.13, .92], br: [.87, .92], c: [.5, .5] };
export function watermarkClip(p, k, t0, t1) {
  const L = kitLogo(k); if (!L || !(t1 - t0 > .1)) return null; const w = k.watermark, [x, y] = POS[w.pos] || POS.tr, wide = p.aspect === '16:9';
  const c = newClip('image', { mediaId: L, dur: r3(t1 - t0), fit: 'contain', transform: { ...DEFAULT_TRANSFORM, x: wide && w.pos !== 'c' ? (x < .5 ? .08 : .92) : x, y: wide && w.pos !== 'c' ? (y < .5 ? .12 : .88) : y, scale: w.scale, opacity: w.opacity } });
  c.brand = 'wm'; c.name = 'Watermark'; c.start = r3(t0); return c;
}
/** Fonts + colours on the project's own text (titles = big text get the title font). Captions keep their style but get the body font. */
export function brandText(p, k, { colors = true } = {}) { let n = 0;
  for (const t of p.tracks) for (const c of t.clips) if (c.type === 'text' && !c.brand && !c.karaoke) { const big = (c.text.size || 0) >= 90 && !c.caption; c.text.font = big ? k.fonts.title : k.fonts.body; if (colors && big) { c.text.color = k.colors[0]; if (c.text.fill) c.text.fill = { ...c.text.fill, colors: [k.colors[0], k.colors[1]] }; } if (colors && c.text.box) c.text.boxColor = k.colors[2] || c.text.boxColor; n++; }
  return n; }
/** One tap: apply the kit. o = which parts (default: what the kit has switched on). */
export function applyBrand(p, k, o = {}) {
  const want = { intro: k.intro.on, outro: k.outro.on, watermark: k.watermark.on, fonts: true, colors: true, ...o };
  removeBrand(p);
  if (want.fonts) brandText(p, k, { colors: want.colors });
  const main = p.tracks.find(t => t.kind === 'main'); let i0 = 0;
  if (want.intro && main.clips.length) { const ic = introClip(p, k); shiftAll(p, clipDur(ic)); if (main.free) { for (const c of main.clips) c.start = r3(c.start + clipDur(ic)); ic.start = 0; } main.clips.unshift(ic); normalize(p); i0 = clipDur(ic); }
  const end = Math.max(...main.clips.map(clipEnd), i0);
  if (want.outro && main.clips.length) { const oc = outroClip(p, k); oc.start = r3(end); main.clips.push(oc); normalize(p); }
  if (want.watermark) { const wm = watermarkClip(p, k, i0, end); if (wm) addToKind(p, 'overlay', wm, wm.start); }
  p.brand = { applied: Date.now(), name: k.name }; normalize(p); return p;
}
/** A call-to-action line at time t, in the kit's look. */
export function ctaClip(p, k, i, t) { const c = textClip((k.cta || [])[i] || 'Subscribe!', k.fonts.title, p.aspect === '16:9' ? 84 : 72, { dur: 3, y: .8, style: 'labelYellow', anim: 'popWords' }); c.text.boxColor = k.colors[0]; c.brand = 'cta'; addToKind(p, 'text', c, t); return c; }

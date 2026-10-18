/* Beat Ad Maker (no AI): photos + video clips + a beat-marked song + a style -> a normal, editable project whose cuts land
   on the music's beats. Pieces:
   - planAd(): the cut list in beats (pacing per style, faster after drops, a cut forced on every drop, outro bars)
   - analyzeVideo() / bestSegment(): picks the liveliest well-exposed part of each video (frame-difference motion +
     brightness + contrast heuristics)
   - buildAd(): turns the plan into clips — Ken Burns on photos, transitions that END on the beat (the new shot is
     fully on screen exactly on the beat), accents on drops / downbeats, title + call to action, Emmavengers logo outro.
   Everything lands on the shared renderer, so preview == export. Shuffle = same choices with another seed. */
import { newProject, newClip, addToKind, normalize, kenBurns, KEN_BURNS } from './project.js';
import { DEFAULT_TRANSFORM } from './registry.js';
import { applyTitle } from './textstyles.js';
import { MIN_TRANSITION } from './transitions.js';

const TPL = new URL('../lib/templates/', import.meta.url).href;
export const LOGO_URL = TPL + 'emma-logo.webp', OUTRO_BG_URL = TPL + 'bg-outro.webp';
export const AD_LENGTHS = [15, 30, 60, 'song'];
export const DEFAULT_TITLE = 'Emmavengers World', DEFAULT_CTA = 'Watch now on Emmavengers World';

/* Styles. cut: beats per shot (cycled); drop: beats per shot for 2 bars after a drop; first: beats of the title shot;
   tr: transitions (ids) + trB: transition length in beats (0 = hard cut); kb: Ken Burns moves for photos;
   onDrop / onDown: accent effects [id, amount, beats]; fx: effect over the whole ad; words: pop words on drops;
   music: preferred library categories. */
export const AD_STYLES = [
  { id: 'promo', name: 'Promo', desc: 'Bright and punchy', col: '#ffcc33', cut: [2], drop: 1, first: 4, tr: ['zoomPunch', 'whipL', 'whipR', 'crossZoom', 'slideL'], trB: .5, kb: ['zoomIn', 'zoomOut', 'panL', 'panR'],
    onDrop: [['flash', .8, 1], ['beatpunch', 1, 1]], onDown: [['beatpunch', .45, 1]], title: 'emmaTitle', music: ['happy', 'adventure'] },
  { id: 'trailer', name: 'Trailer', desc: 'Slow build, fast finish', col: '#d94a3a', cut: [4], drop: 2, first: 8, ramp: true, tr: ['black', 'flash', 'zoomBlurIn', 'filmBurn', 'dipGold'], trB: .5, kb: ['zoomIn', 'panL', 'panR', 'zoomOut'],
    onDrop: [['flash', 1, 1], ['beatshake', .9, 2]], fx: ['vignettepulse', .35], title: 'chapter', music: ['adventure', 'suspense'] },
  { id: 'energetic', name: 'Energetic', desc: 'A cut on every beat', col: '#ff3d7f', cut: [1, 1, 2], drop: 1, first: 4, tr: ['zoomPunch', 'whipL', 'glitch', 'spinBlur'], trB: .25, hardShort: true, kb: ['zoomIn', 'zoomOut'],
    onDrop: [['flash', 1, 1], ['beatrgb', 1, 1]], onDown: [['beatpunch', .7, 1]], title: 'bigWow', music: ['happy', 'funny', 'african'], minBpm: 105 },
  { id: 'funkids', name: 'Fun kids', desc: 'Bouncy, colourful, confetti', col: '#33c3ff', cut: [2, 2, 1, 1], drop: 1, first: 4, tr: ['bubbles', 'balloons', 'starBurst', 'springL', 'confetti', 'cloud', 'heartsFloat'], trB: .5, kb: ['zoomIn', 'panU', 'zoomOut'],
    onDrop: [['confetti', .9, 4], ['beatpunch', .8, 1]], words: ['YAY!', 'WOW!', 'FUN!'], wordTitle: 'candy', title: 'candy', music: ['funny', 'happy'] },
  { id: 'bible', name: 'Bible story', desc: 'Warm light, gentle cuts', col: '#f2b542', cut: [4], drop: 2, first: 8, tr: ['dissolve', 'glowFade', 'lightSweep', 'dipGold', 'fade'], trB: 1, kb: ['zoomIn', 'panR', 'zoomOut', 'panL'],
    onDrop: [['flash', .45, 1]], fx: ['sunbeams', .45], title: 'bible', music: ['worship', 'calm'] },
  { id: 'calm', name: 'Calm', desc: 'Soft and slow', col: '#8fd3c7', cut: [8], drop: 4, first: 8, slowCut: 4, tr: ['dissolve', 'fade', 'dreamy', 'glowFade'], trB: 1.5, kb: ['zoomIn', 'zoomOut', 'panL', 'panR', 'panU'],
    fx: ['dreamy', .3], title: 'pastel', music: ['calm', 'lullaby'] },
  { id: 'countdown', name: 'Countdown', desc: '3-2-1, then go!', col: '#7a5cff', cut: [2], drop: 1, first: 0, countdown: true, tr: ['zoomPunch', 'zoomIn', 'pushL', 'flash'], trB: .25, kb: ['zoomIn', 'zoomOut'],
    onDrop: [['flash', 1, 1], ['fireworks', .8, 4]], onDown: [['beatpunch', .5, 1]], title: 'countdown', music: ['adventure', 'happy'] },
  { id: 'slideshow', name: 'Slideshow', desc: 'Classic photo show', col: '#5fb85f', cut: [4], drop: 4, first: 4, tr: ['fade', 'slideL', 'pushL', 'dissolve', 'cardIn'], trB: 1, kb: ['zoomIn', 'zoomOut', 'panL', 'panR', 'panU', 'panD'],
    title: 'welcome', music: ['happy', 'calm', 'holiday'] },
  { id: 'comic', name: 'Comic', desc: 'POW! Comic-book cuts', col: '#ff8a1f', cut: [2, 1, 1], drop: 1, first: 4, tr: ['comicBurst', 'halftone', 'speedLines', 'pow'], trB: .5, kb: ['zoomIn', 'zoomOut'],
    onDrop: [['beatshake', 1, 1], ['flash', .7, 1]], fx: ['halftone', .25], words: ['POW!', 'BAM!', 'ZOOM!', 'WOW!'], wordTitle: 'comicPow', title: 'comicPow', music: ['funny', 'adventure'] },
  { id: 'magic', name: 'Magic', desc: 'Sparkles and shader magic', col: '#b05cff', cut: [2, 4], drop: 2, first: 4, tr: ['waterDrop', 'vortex', 'spiral', 'liquid', 'sunburst', 'pixelRain', 'inkBlot'], trB: 1, kb: ['zoomIn', 'zoomOut', 'panU'],
    onDrop: [['glitter', .9, 4], ['beatpunch', .7, 1]], fx: ['sparkle', .45], title: 'galaxy', music: ['adventure', 'lullaby', 'holiday'] },
  { id: 'retro', name: 'Retro', desc: 'VHS, glitch, 8-bit vibes', col: '#25b8a5', cut: [2], drop: 1, first: 4, tr: ['vhs', 'tvOff', 'blocks', 'scanlines', 'glitch', 'rgb'], trB: .5, kb: ['zoomIn', 'panL'],
    onDrop: [['beatrgb', 1, 1], ['glitch', .7, 1]], fx: ['vhs', .45], title: 'retro', music: ['funny', 'african', 'happy'] },
  { id: 'cleanpro', name: 'Clean pro', desc: 'Minimal, smooth, professional', col: '#e8e8e8', cut: [4, 2, 2], drop: 2, first: 4, tr: ['fade', 'slideU', 'pushL', 'softWipe', 'iris'], trB: .5, kb: ['zoomIn', 'zoomOut', 'panL', 'panR'],
    onDrop: [['beatpunch', .4, 1]], title: 'lowerThird', music: ['happy', 'calm', 'adventure'] },
];
export const adStyle = id => AD_STYLES.find(s => s.id === id) || AD_STYLES[0];

/** Small seeded random number generator (mulberry32), so Shuffle is repeatable. */
export function rng(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pick = (R, a) => a[Math.floor(R() * a.length) % a.length];
const r6 = x => Math.round(x * 1e6) / 1e6;

/** Where the song ends (last beat of the music) — library tracks carry nb (beats). */
export const musicEnd = (beat, dur) => Math.min(dur, beat.nb ? (beat.o || 0) + beat.nb * 60 / beat.bpm : dur);

/**
 * Plan the cuts. beat = { bpm, m, o, dr, sec }, end = last usable second of the song, length = seconds | 'song'.
 * Returns timeline times: { S0 (music start in the file), L, spb, bar, cuts:[{t0, t1, b0, b1, drop}], drops, downs, outro:[t0,t1] }.
 */
export function planAd({ beat, end, style, length = 30, seed = 1, nMedia = 1, outro = true }) {
  const st = typeof style === 'string' ? adStyle(style) : style, R = rng(seed * 7919 + 13);
  const spb = 60 / beat.bpm, m = beat.m || 4, bar = m * spb, o = ((beat.o || 0) % bar + bar) % bar;
  const downs0 = []; for (let t = o; t <= end + 1e-6; t += bar) downs0.push(t);
  const dropsF = (beat.dr || []).filter(d => d > 0 && d < end);
  // length in whole bars
  let S0 = o, nBars;
  if (length === 'song') nBars = Math.max(2, Math.floor((end - o) / bar + 1e-6));
  else {
    nBars = Math.max(2, Math.round(length / bar));
    const fits = s => s + nBars * bar <= end + 0.02;
    const starts = [...new Set([o, ...(beat.sec || []).map(x => x[1]).filter(t => Math.abs(((t - o) / bar) - Math.round((t - o) / bar)) < .02).map(t => r6(o + Math.round((t - o) / bar) * bar))])].filter(fits);   // snapped exactly onto the bar grid
    if (!starts.length) nBars = Math.max(2, Math.floor((end - o) / bar + 1e-6));
    else {   // prefer a start where a drop comes after the opening bar but early enough to enjoy it
      const good = starts.filter(s => dropsF.some(d => d >= s + bar - 1e-6 && d <= s + nBars * bar * .7));
      const pool = good.length ? good : starts; S0 = seed <= 1 ? pool[0] : pick(R, pool);
    }
  }
  const L = r6(nBars * bar), outroBars = outro ? (bar >= 2 ? 1 : 2) : 0, mediaEnd = r6((nBars - outroBars) * bar);
  const MB = (nBars - outroBars) * m;                               // media beats
  const dropB = dropsF.map(d => Math.round((d - S0) / spb)).filter(b => b > 0 && b < MB);
  let cutPat = st.cut; if (st.slowCut && beat.bpm < 80) cutPat = [st.slowCut];
  const cuts = []; let b = 0, ci = 0;
  const first = st.countdown ? m : (st.first || cutPat[0]);
  while (b < MB) {
    let len;
    if (!cuts.length) len = first;
    else {
      const since = dropB.filter(d => d <= b).map(d => b - d).sort((x, y) => x - y)[0];
      if (since != null && since < 2 * m) len = st.drop;
      else if (st.ramp) { const u = b / MB; len = u < .45 ? cutPat[0] : u < .8 ? Math.max(1, cutPat[0] / 2) : 1; }
      else len = cutPat[ci++ % cutPat.length];
    }
    let nb = Math.min(MB, b + Math.max(1, len));
    const d = dropB.find(x => x > b && x < nb); if (d != null) nb = d;      // always cut on a drop
    if (MB - nb > 0 && MB - nb < Math.min(2, len)) nb = MB;                  // no tiny last shot
    cuts.push({ b0: b, b1: nb, t0: r6(b * spb), t1: r6(nb * spb), drop: dropB.includes(b) });
    b = nb;
  }
  // more shots than pictures is fine (they repeat); fewer shots than pictures: split the longest shots
  while (cuts.length < Math.min(nMedia, MB)) {
    let k = -1, w = 1; cuts.forEach((c, i) => { if (c.b1 - c.b0 > w) { w = c.b1 - c.b0; k = i; } }); if (k < 0) break;
    const c = cuts[k], mid = c.b0 + Math.floor(w / 2); cuts.splice(k, 1, { ...c, b1: mid, t1: r6(mid * spb) }, { b0: mid, b1: c.b1, t0: r6(mid * spb), t1: c.t1, drop: dropB.includes(mid) });
  }
  const downs = []; for (let k = 0; k * m < nBars * m; k++) downs.push(r6(k * bar));
  return { S0: r6(S0), L, spb, bar, m, cuts, drops: dropB.map(x => r6(x * spb)), downs, mediaEnd, outro: outroBars ? [mediaEnd, L] : null };
}

/* ---------------- video analysis ---------------- */
const statsCache = new Map();
/** Sample a video: brightness, contrast and motion (mean frame difference) at up to 48 points. */
export async function analyzeVideo(rec) {
  if (statsCache.has(rec.id)) return statsCache.get(rec.id);
  const D = rec.duration || 0, n = Math.max(6, Math.min(48, Math.round(D * 3))), el = document.createElement('video');
  el.muted = true; el.playsInline = true; el.preload = 'auto'; el.src = rec.url;
  const once = ev => new Promise((res, rej) => { const to = setTimeout(() => rej(new Error(ev)), 6000); el.addEventListener(ev, () => { clearTimeout(to); res(); }, { once: true }); });
  const out = { t: [], b: [], c: [], m: [] };
  try {
    await once('loadeddata'); const cv = document.createElement('canvas'); cv.width = 32; cv.height = 18; const g = cv.getContext('2d', { willReadFrequently: true }); let prev = null;
    for (let i = 0; i < n; i++) {
      const t = Math.min(D - .05, (i + .5) * D / n); el.currentTime = t; try { await once('seeked'); } catch (e) { continue; }
      g.drawImage(el, 0, 0, 32, 18); const px = g.getImageData(0, 0, 32, 18).data, Y = new Float32Array(576);
      let s = 0; for (let k = 0; k < 576; k++) { Y[k] = (.299 * px[k * 4] + .587 * px[k * 4 + 1] + .114 * px[k * 4 + 2]) / 255; s += Y[k]; }
      const mean = s / 576; let v = 0, md = 0; for (let k = 0; k < 576; k++) { v += (Y[k] - mean) ** 2; if (prev) md += Math.abs(Y[k] - prev[k]); }
      out.t.push(t); out.b.push(mean); out.c.push(Math.sqrt(v / 576)); out.m.push(prev ? md / 576 : 0); prev = Y;
    }
    if (out.m.length > 1) out.m[0] = out.m[1];
  } catch (e) { console.warn('video analysis', e); }
  el.removeAttribute('src'); el.load(); statsCache.set(rec.id, out); return out;
}
/** Best start for a `len`-second piece of the video: lively (motion), well exposed, contrasty; avoids parts already used. */
export function bestSegment(stats, D, len, used = [], R = Math.random) {
  if (len >= D - .05) return 0;
  const N = stats.t.length; if (!N) return Math.max(0, (D - len) / 2);
  const mx = Math.max(1e-3, ...stats.m), steps = Math.min(60, Math.max(8, Math.ceil(D * 2))); let best = -1e9, at = 0;
  for (let i = 0; i <= steps; i++) {
    const s = (D - len - .05) * i / steps, e = s + len; let sc = 0, k = 0;
    for (let j = 0; j < N; j++) if (stats.t[j] >= s - .2 && stats.t[j] <= e + .2) { sc += .6 * stats.m[j] / mx + .3 * (1 - Math.min(1, Math.abs(stats.b[j] - .5) * 2.2)) + .1 * Math.min(1, stats.c[j] * 4); k++; }
    sc = k ? sc / k : 0;
    for (const [a, b] of used) { const ov = Math.max(0, Math.min(b, e) - Math.max(a, s)); sc -= .8 * ov / len; }
    sc += (R() - .5) * .08;                                      // a little variety for Shuffle
    if (sc > best) { best = sc; at = s; }
  }
  return Math.max(0, at);
}

/**
 * Build the ad project. X = { media, importFile, mediaFor }. o = {
 *   items: [mediaId…] (in order), music: { mediaId | url, name, beat, dur }, style, aspect, length, title, cta, logo, seed }
 */
export async function buildAd(X, o, onProgress = () => {}) {
  const st = adStyle(o.style), seed = o.seed || 1, R = rng(seed);
  const recs = o.items.map(id => X.media.get(id)).filter(Boolean); if (!recs.length) throw new Error('Pick some photos or videos first');
  const mus = o.music; if (!mus || !mus.beat || !(mus.beat.bpm > 0)) throw new Error('Pick a song with a beat');
  const mrec = mus.mediaId ? X.media.get(mus.mediaId) : await X.mediaFor(X, mus.url, mus.name ? mus.name + '.mp3' : undefined);
  const end = musicEnd(mus.beat, mrec.duration || mus.dur || 0);
  const plan = planAd({ beat: mus.beat, end, style: st, length: o.length, seed, nMedia: recs.length, outro: o.logo !== false });
  const p = newProject(); p.aspect = o.aspect || '9:16'; p.name = o.title || 'My ad'; p.captionStyle = 'kids';
  p.ad = { items: o.items, music: { ...mus, mediaId: mrec.id }, style: st.id, aspect: p.aspect, length: o.length, title: o.title, cta: o.cta, logo: o.logo !== false, seed, plan: { S0: plan.S0, L: plan.L, bpm: mus.beat.bpm, cuts: plan.cuts.map(c => c.t0), drops: plan.drops } };
  const main = p.tracks.find(t => t.kind === 'main'), used = new Map(), spb = plan.spb;
  const trOf = (i, segPrev, seg) => {
    if (!i || !st.trB) return null;
    if (st.hardShort && Math.min(segPrev, seg) <= spb * 1.01 && R() < .75) return null;
    const eff = r6(Math.min(st.trB * spb, .4 * segPrev, .4 * seg, 1.5)); return eff >= MIN_TRANSITION ? { id: pick(R, st.tr), dur: eff } : null;
  };
  let prevSeg = 0, n = 0;
  for (const [i, cut] of plan.cuts.entries()) {
    const rec = recs[i % recs.length], seg = cut.t1 - cut.t0, tr = trOf(i, prevSeg, seg), eff = tr ? tr.dur : 0, dur = r6(seg + eff);
    let c;
    if (rec.type === 'video') {
      const D = rec.duration || dur, stats = await analyzeVideo(rec); let s = 0, speed = 1, srcLen = dur;
      if (D - .05 < dur) { srcLen = Math.max(.1, D - .05); speed = Math.max(.25, srcLen / dur); srcLen = dur * speed; }
      else { const u = used.get(rec.id) || []; s = bestSegment(stats, D, dur, u, R); u.push([s, s + dur]); used.set(rec.id, u); }
      c = newClip('video', { mediaId: rec.id, in: r6(s), out: r6(s + srcLen), speed: r6(speed), fit: 'cover', volume: 0 });
    } else {
      c = newClip('image', { mediaId: rec.id, dur, fit: 'cover' }); kenBurns(c, pick(R, st.kb));
    }
    c.transitionIn = tr; c.adCut = cut.t0; main.clips.push(c); prevSeg = seg; onProgress(++n / (plan.cuts.length + 3));
  }
  // outro: the Emmavengers logo
  if (plan.outro) {
    const bg = await X.mediaFor(X, OUTRO_BG_URL, 'bg-outro.webp'), logo = await X.mediaFor(X, LOGO_URL, 'emma-logo.webp');
    const seg = plan.outro[1] - plan.outro[0], tr = { id: st.outroTr || pick(R, ['zoomIn', 'starBurst', 'circle', 'flash']), dur: r6(Math.min(spb, .4 * seg, .4 * prevSeg)) };
    const oc = newClip('image', { mediaId: bg.id, dur: r6(seg + tr.dur), fit: 'cover' }); oc.transitionIn = tr.dur >= MIN_TRANSITION ? tr : null; oc.adCut = plan.outro[0]; oc.adOutro = true; main.clips.push(oc);
    normalize(p);
    const lw = p.aspect === '16:9' ? .5 : .78;
    addToKind(p, 'overlay', Object.assign(newClip('image', { mediaId: logo.id, dur: r6(seg), fit: 'contain', transform: { ...DEFAULT_TRANSFORM, y: p.aspect === '16:9' ? .4 : .42, scale: lw } }), { anim: { in: { id: 'pop', dur: Math.min(.6, spb * 1.5) }, combo: null } }), plan.outro[0]);
    const sub = newClip('text', { dur: r6(Math.max(.5, seg - spb)), transform: { ...DEFAULT_TRANSFORM }, text: { content: 'SUBSCRIBE' } }); applyTitle(sub, 'subscribe', true); sub.transform.y = p.aspect === '16:9' ? .8 : .74;
    addToKind(p, 'text', sub, r6(plan.outro[0] + spb));
    addToKind(p, 'effect', newClip('effect', { dur: r6(seg), effect: { kind: 'effect', id: 'sparkle', amount: .6 } }), plan.outro[0]);
  }
  normalize(p);
  // words: title on the first shot, call to action before the outro
  const title = (o.title ?? DEFAULT_TITLE).trim(), cta = (o.cta ?? DEFAULT_CTA).trim();
  if (st.countdown) {
    const nums = plan.m >= 4 ? ['3', '2', '1', 'GO!'] : ['3', '2', '1'];
    nums.forEach((w, k) => { const t = newClip('text', { dur: r6(spb), transform: { ...DEFAULT_TRANSFORM }, text: { content: w } }); applyTitle(t, 'countdown', true); t.transform.y = .45; t.text.size = 260; addToKind(p, 'text', t, r6(k * spb));
      addToKind(p, 'effect', newClip('effect', { dur: r6(Math.min(spb, .6)), effect: { kind: 'effect', id: 'flash', amount: .6 } }), r6(k * spb)); });
  }
  if (title) {
    const t0 = st.countdown ? plan.cuts[0].t1 : 0, t1 = st.countdown ? (plan.cuts[1] || plan.cuts[0]).t1 : Math.min(plan.cuts[0].t1, plan.bar * 2);
    const t = newClip('text', { dur: r6(Math.max(spb, t1 - t0)), transform: { ...DEFAULT_TRANSFORM }, text: { content: title } }); applyTitle(t, st.title, true); t.transform.y = .36; t.text.size = Math.min(t.text.size || 110, p.aspect === '16:9' ? 120 : 112);
    addToKind(p, 'text', t, r6(t0));
  }
  if (cta) {
    const t1 = plan.mediaEnd, t0 = r6(Math.max(plan.cuts[0].t1, t1 - Math.min(2 * plan.bar, Math.max(2.5, plan.bar))));
    const t = newClip('text', { dur: r6(t1 - t0), transform: { ...DEFAULT_TRANSFORM }, text: { content: cta } }); applyTitle(t, 'lowerThird', true); t.transform.y = .82; t.text.size = p.aspect === '16:9' ? 60 : 54;
    addToKind(p, 'text', t, t0);
  }
  // accents
  const fxAt = (id, amount, t, d) => addToKind(p, 'effect', newClip('effect', { dur: r6(d), effect: { kind: 'effect', id, amount } }), r6(t));
  for (const d of plan.drops) for (const [id, a, beats] of st.onDrop || []) fxAt(id, a, d, Math.min(beats * spb, plan.mediaEnd - d));
  if (st.onDown) for (const t of plan.downs) if (t > 0 && t < plan.mediaEnd - 1e-6 && !plan.drops.some(d => Math.abs(d - t) < 1e-6) && plan.cuts.some(c => Math.abs(c.t0 - t) < 1e-6)) for (const [id, a, beats] of st.onDown) fxAt(id, a, t, Math.min(beats * spb, plan.mediaEnd - t));
  if (st.words) plan.drops.forEach((d, k) => { const w = newClip('text', { dur: r6(Math.min(2 * spb, plan.mediaEnd - d)), transform: { ...DEFAULT_TRANSFORM }, text: { content: st.words[(k + seed) % st.words.length] } }); applyTitle(w, st.wordTitle || 'bigWow', true); w.transform.y = .2; w.transform.rot = (R() - .5) * 16; addToKind(p, 'text', w, d); });
  if (st.fx) fxAt(st.fx[0], st.fx[1], 0, plan.mediaEnd);
  // music, from a downbeat, with its beat grid so the timeline shows the markers
  const b = mus.beat, a = newClip('audio', { mediaId: mrec.id, in: plan.S0, out: r6(Math.min((mrec.duration || 1e9), plan.S0 + plan.L)), volume: 1, fadeIn: 0, fadeOut: Math.min(1.5, plan.bar),
    beat: { bpm: b.bpm, m: b.m || 4, o: b.o || 0, ...(b.dr && b.dr.length ? { dr: b.dr } : {}), ...(b.sec && b.sec.length ? { sec: b.sec } : {}) } });
  addToKind(p, 'audio', a, 0);
  normalize(p); onProgress(1); return { project: p, plan };
}
/** Shot boundaries on the timeline: the time each main-track shot is fully on screen (end of its transition). */
export function shotTimes(p) {
  const main = p.tracks.find(t => t.kind === 'main'); return main.clips.map((c, i) => i ? c.start + Math.max(0, main.clips[i - 1].start + (main.clips[i - 1].dur ?? ((main.clips[i - 1].out - main.clips[i - 1].in) / main.clips[i - 1].speed)) - c.start) : 0);
}

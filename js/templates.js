/* Kids project templates (no AI): data-driven recipes that build a normal project — main-track pictures, stickers,
   titles, captions, effects and music. Every picture marked as a placeholder ("ph") is meant to be swapped for the
   user's own photo or video with Replace; placeholder words are just text clips to edit.
   Pictures: our own CC0 backgrounds + Emmavengers art (lib/templates/, built by tools/templates/build_assets.py),
   stickers from the sticker library, music from the CC0 sound library. */
import { newProject, newClip, addToKind, normalize, kenBurns, projectDuration, clipDur } from './project.js';
import { DEFAULT_TRANSFORM } from './registry.js';
import { applyTitle, applyStyle } from './textstyles.js';
import { newCaption, styleCaption } from './captions.js';
import { loadStickers } from './stickers.js';
import { TEMPLATES2 } from './tplpack.js';

const TPL = new URL('../lib/templates/', import.meta.url).href, SND = new URL('../lib/sounds/', import.meta.url).href;
const MEDIA = 'studio.templateMedia';
export const TEMPLATE_CATS = [['bible', 'Bible stories'], ['learn', 'Learning'], ['quiz', 'Quizzes'], ['promo', 'Promos & ads'], ['brand', 'Intros & outros'], ['trailer', 'Channel trailer'],
  ['party', 'Birthdays & holidays'], ['story', 'Story cards'], ['prayer', 'Prayer'], ['facts', 'Fun facts'], ['countdown', 'Countdowns'], ['beforeafter', 'Before / after'], ['fun', 'Fun']];

/* recipe parts: scenes = main track in order; layers = [kind, start, dur, opts] */
const S = (bg, dur, o = {}) => ({ bg, dur, ...o });
const txt = (at, dur, title, content, o = {}) => ({ k: 'text', at, dur, title, content, ...o });
const stk = (at, dur, id, o = {}) => ({ k: 'sticker', at, dur, id, ...o });
const efx = (at, dur, id, amount = .8) => ({ k: 'effect', at, dur, id, amount });
const cap = (at, to, lines, style = 'kids') => ({ k: 'caps', at, to, lines, style });

export const TEMPLATES = [
  { id: 'bible', cat: 'bible', name: 'Bible story short', desc: 'Title, 3 story pictures with captions, memory verse and The End.', music: ['emmavengers-originals-music/ark-adventure.mp3', .35],
    scenes: [S('bg-sunburst', 3), S('noah-1', 4, { ph: 'Story picture 1', kb: 'zoomIn', tr: 'dissolve' }), S('noah-2', 4, { ph: 'Story picture 2', kb: 'panR', tr: 'dissolve' }),
      S('noah-3', 4, { ph: 'Story picture 3', kb: 'zoomOut', tr: 'dissolve' }), S('bg-rainbow', 4, { tr: 'fade' }), S('bg-sky', 3, { tr: 'fade' })],
    layers: [txt(0, 3, 'bible', 'Noah’s Ark', { y: .4, size: 140 }), txt(.4, 2.6, 'lowerThird', 'An Emmavengers Bible story', { y: .56, size: 52 }),
      cap(3, 15, ['Long ago, Noah loved God.', 'God told Noah: build a big boat!', 'The rain came, but the ark floated safely.'], 'story'),
      efx(11, 4, 'rain', .7), txt(15, 4, 'verse', '“I have set my rainbow in the clouds.”\nGenesis 9:13', { y: .32, size: 64 }), efx(15, 4, 'sparkle', .6),
      txt(19, 3, 'theEnd', 'The End', { y: .4 }), stk(19.3, 2.7, 'emma/characters/thanks', { y: .72, s: .5 })] },
  { id: 'quiz', cat: 'quiz', name: '“What is it?” quiz', desc: 'A hidden picture, a 3-2-1 countdown, then the big reveal.', music: ['emmavengers-originals-music/hide-and-seek.mp3', .35],
    scenes: [S('bg-purpleburst', 3), S('quiz-cup', 8, { ph: 'The mystery picture', tr: 'zoomIn' }), S('bg-sunburst', 3, { tr: 'fade' })],
    layers: [txt(0, 3, 'quiz', 'What is it?', { y: .42 }), stk(.5, 2.5, 'art/numbers/digit-q', { y: .68, s: .34, anim: 'jelly' }),
      efx(3, 4.6, 'pixel', 1), txt(3.2, 1.3, 'countdown', '3', { y: .2 }), txt(4.5, 1.3, 'countdown', '2', { y: .2 }), txt(5.8, 1.3, 'countdown', '1', { y: .2 }),
      efx(7.6, .5, 'flash', 1), txt(7.8, 3.2, 'bigWow', 'It’s a CUP!', { y: .2 }), efx(7.8, 3.2, 'confetti', .9),
      txt(11, 3, 'think', 'Did you guess it?', { y: .45 })] },
  { id: 'letter', cat: 'learn', name: 'Letter lesson', desc: 'Big letter, “A is for…”, say it together.', music: ['emmavengers-originals-music/hop-skip-jump.mp3', .3],
    scenes: [S('bg-pastel', 4), S('bg-sky', 4, { tr: 'slideL' }), S('bg-pastel', 4, { tr: 'slideL' })],
    layers: [txt(0, 4, 'letterA', 'Letter A', { y: .2 }), stk(.3, 3.7, 'emma/letters/letter-a', { y: .58, s: .62, anim: 'jelly', ph: 'The letter' }),
      txt(4, 4, 'letterA', 'A is for Apple', { y: .2, size: 96 }), stk(4.3, 3.7, 'emoji/1f34e', { y: .58, s: .55, anim: 'hop', ph: 'A picture for the letter' }),
      stk(8, 4, 'emma/letters/letter-a', { x: .3, y: .5, s: .36, anim: 'jelly' }), stk(8.3, 3.7, 'emoji/1f34e', { x: .7, y: .5, s: .34, anim: 'hop' }),
      cap(8, 12, ['Say it with me: A… A… Apple!'], 'kids'), efx(8, 4, 'twinkle', .6)] },
  { id: 'number', cat: 'learn', name: 'Number lesson', desc: 'A big number, then count the things one by one.', music: ['emmavengers-originals-music/sunny-day.mp3', .3],
    scenes: [S('bg-chalk', 4), S('bg-chalk', 8, { tr: 'fade' })],
    layers: [txt(0, 4, 'count', 'Number 3', { y: .2 }), stk(.3, 3.7, 'art/numbers/digit-3', { y: .56, s: .6, anim: 'hop', ph: 'The number' }),
      txt(4, 8, 'count', 'Let’s count!', { y: .14, size: 96 }),
      ...[0, 1, 2].flatMap(i => [stk(5 + i * 1.3, 7 - i * 1.3, 'emma/counting/apple', { x: .22 + i * .28, y: .48, s: .28, anim: 'pop', ph: i ? '' : 'The thing to count' }),
        txt(5 + i * 1.3, 7 - i * 1.3, 'countdown', String(i + 1), { x: .22 + i * .28, y: .66, size: 110 })]),
      txt(9.2, 2.8, 'bigWow', 'Three apples!', { y: .84, size: 90 }), efx(9.2, 2.8, 'confetti', .7)] },
  { id: 'animals', cat: 'facts', name: 'Animal facts', desc: 'An animal with a title and three fun facts.', music: ['emmavengers-originals-music/brave-little-hero.mp3', .3],
    scenes: [S('bg-savanna', 15, { ph: 'Your animal photo or video' })],
    layers: [txt(0, 3.5, 'jungle', 'Lion facts', { y: .16 }), stk(.4, 14.6, 'emma/animals/lion', { y: .56, s: .62, anim: 'hop', ph: 'The animal' }),
      txt(3.5, 3.8, 'funFact', 'Fun fact 1', { y: .14, size: 80 }), txt(7.3, 3.8, 'funFact', 'Fun fact 2', { y: .14, size: 80 }), txt(11.1, 3.9, 'funFact', 'Fun fact 3', { y: .14, size: 80 }),
      cap(3.5, 15, ['Lions live in Africa.', 'A lion’s ROAR can be heard far away!', 'Lion families are called prides.'], 'emma'), efx(0, 15, 'halo', .45)] },
  { id: 'countdown', cat: 'countdown', name: 'Countdown 5-4-3-2-1', desc: 'Big numbers with a zoom pulse, then GO! with fireworks.', music: ['emmavengers-originals-music/praise-party.mp3', .35],
    scenes: [S('bg-purpleburst', 7.5, { ph: 'Your background' })],
    layers: [...[5, 4, 3, 2, 1].map((n, i) => txt(i, 1, 'countdown', String(n), { y: .45, size: 300 })), efx(0, 5, 'zoompulse', .7),
      txt(5, 2.5, 'bigWow', 'GO!', { y: .45, size: 200 }), efx(5, 2.5, 'fireworks', .9), efx(5, .4, 'flash', .8)] },
  { id: 'intro', cat: 'brand', name: 'Emmavengers intro', desc: 'Channel intro with the Emmavengers kids and title.', music: ['emmavengers-originals-music/praise-party.mp3', .45, 5],
    scenes: [S('bg-sunburst', 5, { ph: 'Your channel picture' })],
    layers: [txt(.3, 4.7, 'emmaTitle', 'EMMAVENGERS', { y: .3, size: 110 }), txt(1, 4, 'welcome', 'World', { y: .41 }),
      ...['morning', 'meal', 'bedtime', 'thanks'].map((c, i) => stk(.6 + i * .25, 4.4 - i * .25, 'emma/characters/' + c, { x: .2 + i * .2, y: .68, s: .3, anim: 'hop' })),
      txt(2, 3, 'lowerThird', 'Fun learning videos for kids', { y: .86, size: 50 }), efx(0, 5, 'sparkle', .7)] },
  { id: 'outro', cat: 'brand', name: 'Emmavengers outro', desc: 'Thanks for watching, subscribe and see you next time.', music: ['emmavengers-originals-music/joyful-joyful-ode-to-joy.mp3', .4, 7],
    scenes: [S('bg-sky', 7)],
    layers: [txt(0, 7, 'welcome', 'Thanks for watching!', { y: .2, size: 92 }), stk(.4, 6.6, 'emma/characters/thanks', { y: .5, s: .55, anim: 'breathe', ph: 'Your picture' }),
      txt(1.5, 5.5, 'subscribe', 'SUBSCRIBE', { y: .76 }), stk(2, 5, 'art/arrows/pointer-hand', { x: .82, y: .84, s: .2, anim: 'pulse' }),
      txt(3, 4, 'lowerThird', 'See you next time in Emmavengers World!', { y: .9, size: 42 }), efx(0, 7, 'hearts', .6)] },
  { id: 'colours', cat: 'learn', name: 'Colours lesson', desc: 'Red, blue, yellow: a big shape and the colour name.', music: ['emmavengers-originals-music/bubble-parade.mp3', .3],
    scenes: [S('bg-pastel', 3.5), S('bg-pastel', 3.5, { tr: 'slideU' }), S('bg-pastel', 3.5, { tr: 'slideU' }), S('bg-rainbow', 3.5, { tr: 'fade' })],
    layers: [stk(0, 3.5, 'art/stars/heart-red', { y: .5, s: .55, anim: 'heartbeat', ph: 'Something red' }), txt(0, 3.5, 'candy', 'RED', { y: .82, style: 'red3d' }),
      stk(3.5, 3.5, 'art/stars/star-blue', { y: .5, s: .55, anim: 'pulse', ph: 'Something blue' }), txt(3.5, 3.5, 'ocean', 'BLUE', { y: .82, style: 'blue3d' }),
      stk(7, 3.5, 'art/stars/sun', { y: .5, s: .55, anim: 'spinLoop', ph: 'Something yellow' }), txt(7, 3.5, 'candy', 'YELLOW', { y: .82, style: 'gold3d' }),
      txt(10.5, 3.5, 'rainbowArc', 'Colours everywhere!', { y: .25, size: 96 }), efx(10.5, 3.5, 'sparkle', .6)] },
  { id: 'prayer', cat: 'prayer', name: 'Bedtime prayer', desc: 'A calm picture, twinkling stars and a short prayer.', music: ['emmavengers-originals-music/lullaby-brahms-music-box.mp3', .35],
    scenes: [S('day-pray', 14, { ph: 'Your picture', kb: 'zoomIn' })],
    layers: [txt(0, 3.5, 'verse', 'Bedtime prayer', { y: .14, size: 92 }), cap(3.5, 14, ['Dear God, thank You for today.', 'Thank You for my family and friends.', 'Please keep us safe tonight.', 'Amen.'], 'story'),
      efx(0, 14, 'twinkle', .6), efx(0, 14, 'dreamy', .35)] },
  { id: 'myday', cat: 'story', name: 'My morning', desc: 'Three moments of the day, each with a caption.', music: ['emmavengers-originals-music/sunny-day.mp3', .3],
    scenes: [S('day-wake', 4, { ph: 'Waking up', kb: 'zoomIn' }), S('day-brush', 4, { ph: 'Brushing teeth', kb: 'panL', tr: 'slideL' }), S('day-breakfast', 4, { ph: 'Breakfast', kb: 'zoomOut', tr: 'slideL' })],
    layers: [txt(0, 3, 'welcome', 'Good morning!', { y: .16 }), cap(0, 12, ['Wake up, sleepy head!', 'Brush, brush, brush my teeth.', 'Yummy breakfast time!'], 'kids'), efx(0, 1.2, 'lightleak', .6)] },
  ...TEMPLATES2,
];
export const templateById = id => TEMPLATES.find(t => t.id === id);
/** Seconds per recipe time unit: beat templates are written in beats of their song. */
export const tplUnit = T => T.beat && T.bpm ? 60 / T.bpm : 1;
export const templateDur = T => Math.round(T.scenes.reduce((s, x) => s + x.dur, 0) * tplUnit(T) * 1e6) / 1e6;
export const catName = id => (TEMPLATE_CATS.find(c => c[0] === id) || [id, id])[1];
/** Words a template can be found by (search box). */
export const templateWords = T => [T.name, T.desc, catName(T.cat), T.cat, ...(T.tags || []), T.beat ? 'beat music synced' : '', ...T.layers.filter(l => l.k === 'text').map(l => l.content)].join(' ').toLowerCase();
export function searchTemplates(q, cat = '') {
  const w = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
  return TEMPLATES.filter(T => (!cat || T.cat === cat) && (!w.length || (s => w.every(x => s.includes(x)))(templateWords(T))));
}
/** Every picture / sound file a template needs (urls). */
export async function templateAssets(T) {
  const L = await loadStickers(), byId = new Map(L.items.map(i => [i.id, i])), out = new Set();
  for (const s of T.scenes) out.add(TPL + s.bg + '.webp');
  for (const l of T.layers) if (l.k === 'pic') out.add(TPL + l.bg + '.webp');
  for (const l of T.layers) if (l.k === 'sticker') { const it = byId.get(l.id); if (!it) throw new Error('template sticker missing: ' + l.id); out.add(it.url); }
  if (T.music) out.add(SND + T.music[0]);
  return [...out];
}
/* pack templates: long words get a smaller size so they stay inside the frame; long captions go on two lines */
const fitSize = s => Math.round(1700 / Math.max(6, ...String(s).split('\n').map(x => x.length)));
const wrap2 = s => { if (s.length <= 30 || s.includes('\n')) return s; const m = s.length / 2; let best = -1;
  for (let i = 0; i < s.length; i++) if (s[i] === ' ' && (best < 0 || Math.abs(i - m) < Math.abs(best - m))) best = i; return best < 0 ? s : s.slice(0, best) + '\n' + s.slice(best + 1); };
/** Import (or re-use) one file into the media store. */
export async function mediaFor(X, url, name) {
  const map = JSON.parse(localStorage.getItem(MEDIA) || '{}'); let rec = map[url] && X.media.get(map[url]);
  if (rec) return rec;
  const r = await fetch(url); if (!r.ok) throw new Error('download failed ' + url); const blob = await r.blob();
  rec = await X.importFile(new File([blob], name || url.split('/').pop(), { type: blob.type || '' }));
  map[url] = rec.id; localStorage.setItem(MEDIA, JSON.stringify(map)); return rec;
}
/** Build the project for a template. X = { media, importFile }. Returns a new project object (not yet the current one). */
export async function buildTemplate(X, T, onProgress) {
  const L = await loadStickers(), byId = new Map(L.items.map(i => [i.id, i])), urls = await templateAssets(T), recs = new Map();
  let n = 0; for (const u of urls) { recs.set(u, await mediaFor(X, u, decodeURIComponent(u.split('/').pop()))); onProgress && onProgress(++n / urls.length); }
  const p = newProject(); p.name = T.name; p.template = T.id; p.captionStyle = 'kids';
  const main = p.tracks.find(t => t.kind === 'main');
  const u = tplUnit(T), beat = !!(T.beat && T.bpm);
  if (beat) p.beatTemplate = { bpm: T.bpm, m: T.meter || 4 };
  T.scenes.forEach((s, i) => {
    const rec = recs.get(TPL + s.bg + '.webp'), n = s.dur * u;
    // beat templates: a transition ENDS on the beat, so the clip grows by the transition length (the cut stays on the grid)
    const trd = s.tr && i ? (beat ? Math.min(.5, u, n * .4, T.scenes[i - 1].dur * u * .4) : .5) : 0;
    const c = newClip('image', { mediaId: rec.id, dur: beat ? n + trd : n, fit: 'cover' });
    if (s.ph) c.placeholder = s.ph; if (trd) c.transitionIn = { id: s.tr, dur: trd }; if (s.kb) kenBurns(c, s.kb);
    main.clips.push(c);
  });
  main.clips[0].transitionIn = null; normalize(p);
  for (const l0 of T.layers) {
    const l = { ...l0, at: l0.at * u, dur: l0.dur * u, ...(l0.to != null ? { to: l0.to * u } : {}) };
    if (l.k === 'pic') {
      const rec = recs.get(TPL + l.bg + '.webp'), c = newClip('image', { mediaId: rec.id, dur: l.dur, fit: l.fit || 'cover', transform: { ...DEFAULT_TRANSFORM, x: l.x ?? .5, y: l.y ?? .5, scale: l.s ?? 1 } });
      if (l.mask) c.mask = { invert: false, ...l.mask };
      if (l.maskKf) c.keyframes = { ...(c.keyframes || {}), maskX: l.maskKf.map(([t, v], i) => ({ t: Math.round(t * u * 1e6) / 1e6, v, ease: i ? 'linear' : 'inOut' })) };
      if (l.anim === 'pop') c.anim = { in: { id: 'pop', dur: Math.min(.5, l.dur / 3) } }; else if (l.anim) c.anim = { combo: { id: l.anim, dur: 1.2 } };
      if (l.ph) c.placeholder = l.ph; addToKind(p, 'overlay', c, l.at);
    } else if (l.k === 'text') {
      const c = newClip('text', { dur: l.dur, transform: { ...DEFAULT_TRANSFORM, x: l.x ?? .5 }, text: { content: l.content } });
      applyTitle(c, l.title, true); if (l.style) applyStyle(c.text, l.style); if (l.size) c.text.size = l.size;
      if (T.pack) c.text.size = Math.min(c.text.size, fitSize(l.content)); c.transform.y = l.y ?? c.transform.y; c.placeholder = 'text';
      addToKind(p, 'text', c, l.at);
    } else if (l.k === 'sticker') {
      const it = byId.get(l.id), rec = recs.get(it.url), c = newClip('image', { mediaId: rec.id, dur: l.dur, sticker: it.id, fit: 'contain', transform: { ...DEFAULT_TRANSFORM, x: l.x ?? .5, y: l.y ?? .5, scale: l.s ?? .36 } });
      const a = l.anim || it.anim; if (a === 'pop') c.anim = { in: { id: 'pop', dur: .4 } }; else if (a) c.anim = { combo: { id: a, dur: 1.2 } };
      if (l.ph) c.placeholder = l.ph; addToKind(p, 'overlay', c, l.at);
    } else if (l.k === 'effect') {
      addToKind(p, 'effect', newClip('effect', { dur: l.dur, effect: { kind: 'effect', id: l.id, amount: l.amount } }), l.at);
    } else if (l.k === 'caps') {
      const d = (l.to - l.at) / l.lines.length;
      l.lines.forEach((line, i) => { const c = styleCaption(newCaption(p, T.pack ? wrap2(line) : line, l.at + d * i, d), l.style); c.placeholder = 'text'; addToKind(p, 'caption', c, c.start); });
      p.captionStyle = l.style;
    }
  }
  if (T.music) {
    const rec = recs.get(SND + T.music[0]), D = Math.min(T.music[2] || projectDuration(p), rec.duration || 0);
    if (D > .2) addToKind(p, 'audio', newClip('audio', { mediaId: rec.id, in: 0, out: D, volume: T.music[1], fadeIn: beat ? 0 : .3, fadeOut: Math.min(1.5, D / 3),
      ...(beat ? { beat: { bpm: T.bpm, m: T.meter || 4, o: 0 } } : {}) }), 0);
  }
  normalize(p); return p;
}
/** Labels of the replaceable pictures in a recipe. */
export const placeholdersOf = T => [...T.scenes.filter(s => s.ph).map(s => s.ph), ...T.layers.filter(l => (l.k === 'sticker' || l.k === 'pic') && l.ph).map(l => l.ph)];
/** Media ids used by a project (so the media store keeps them). */
export const placeholders = p => p.tracks.flatMap(t => t.clips.filter(c => c.placeholder && c.placeholder !== 'text').map(c => ({ id: c.id, label: c.placeholder, kind: t.kind })));

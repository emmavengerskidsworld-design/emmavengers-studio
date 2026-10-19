/* Kids-creator builders (no AI, pure project data): Bible verse cards (public-domain King James text) in styled templates,
   quiz cards (question, 2-4 answers, countdown, reveal, sounds), and counting / ABC auto-builders.
   Each builder returns { clip, sounds }: one compound clip (bg + text + stickers inside, rendered by the normal renderFrame,
   so preview == export) and the sound effects to place on the audio track (times relative to the clip start). */
import { newClip, newTrack, clipEnd, normalize } from './project.js';
import { DEFAULT_TRANSFORM } from './registry.js';
import { applyStyle } from './textstyles.js';

const r3 = x => Math.round(x * 1000) / 1000;
const SND = n => `lib/sounds/emmavengers-originals/${n}.mp3`;
const EMO = c => `lib/stickers/emoji/${c}.webp`;
/* KJV (1769 text, public domain; Crown patent applies only inside the UK). part: true = part of the verse. */
export const VERSES = [
  ['John 3:16', 'For God so loved the world, that he gave his only begotten Son, that whosoever believeth in him should not perish, but have everlasting life.', 'love'],
  ['Psalm 23:1', 'The LORD is my shepherd; I shall not want.', 'trust'],
  ['Philippians 4:13', 'I can do all things through Christ which strengtheneth me.', 'brave'],
  ['Genesis 1:1', 'In the beginning God created the heaven and the earth.', 'creation'],
  ['Proverbs 3:5', 'Trust in the LORD with all thine heart; and lean not unto thine own understanding.', 'trust'],
  ['Joshua 1:9', 'Be strong and of a good courage; be not afraid, neither be thou dismayed: for the LORD thy God is with thee whithersoever thou goest.', 'brave', true],
  ['Matthew 19:14', 'Suffer little children, and forbid them not, to come unto me: for of such is the kingdom of heaven.', 'love', true],
  ['Psalm 118:24', 'This is the day which the LORD hath made; we will rejoice and be glad in it.', 'joy'],
  ['1 John 4:19', 'We love him, because he first loved us.', 'love'],
  ['1 John 4:8', 'He that loveth not knoweth not God; for God is love.', 'love'],
  ['Ephesians 6:1', 'Children, obey your parents in the Lord: for this is right.', 'family'],
  ['Psalm 119:105', 'Thy word is a lamp unto my feet, and a light unto my path.', 'light'],
  ['Matthew 5:14', 'Ye are the light of the world. A city that is set on an hill cannot be hid.', 'light'],
  ['Psalm 56:3', 'What time I am afraid, I will trust in thee.', 'trust'],
  ['Isaiah 41:10', 'Fear thou not; for I am with thee: be not dismayed; for I am thy God: I will strengthen thee; yea, I will help thee.', 'brave', true],
  ['Romans 8:28', 'And we know that all things work together for good to them that love God, to them who are the called according to his purpose.', 'trust'],
  ['Jeremiah 29:11', 'For I know the thoughts that I think toward you, saith the LORD, thoughts of peace, and not of evil, to give you an expected end.', 'hope'],
  ['Psalm 136:1', 'O give thanks unto the LORD; for he is good: for his mercy endureth for ever.', 'thanks'],
  ['1 Thessalonians 5:17', 'Pray without ceasing.', 'prayer'],
  ['1 Thessalonians 5:18', 'In every thing give thanks: for this is the will of God in Christ Jesus concerning you.', 'thanks'],
  ['Ephesians 4:32', "And be ye kind one to another, tenderhearted, forgiving one another, even as God for Christ's sake hath forgiven you.", 'kind'],
  ['Proverbs 17:17', 'A friend loveth at all times, and a brother is born for adversity.', 'family'],
  ['Psalm 46:1', 'God is our refuge and strength, a very present help in trouble.', 'trust'],
  ['Psalm 46:10', 'Be still, and know that I am God.', 'peace', true],
  ['Matthew 6:33', 'But seek ye first the kingdom of God, and his righteousness; and all these things shall be added unto you.', 'trust'],
  ['Matthew 22:39', 'Thou shalt love thy neighbour as thyself.', 'kind', true],
  ['Luke 1:37', 'For with God nothing shall be impossible.', 'hope'],
  ['John 14:6', 'I am the way, the truth, and the life: no man cometh unto the Father, but by me.', 'jesus', true],
  ['John 8:12', 'I am the light of the world: he that followeth me shall not walk in darkness, but shall have the light of life.', 'light', true],
  ['John 11:35', 'Jesus wept.', 'jesus'],
  ['Romans 12:12', 'Rejoicing in hope; patient in tribulation; continuing instant in prayer.', 'prayer'],
  ['Galatians 5:22', 'But the fruit of the Spirit is love, joy, peace, longsuffering, gentleness, goodness, faith.', 'joy'],
  ['Psalm 139:14', 'I will praise thee; for I am fearfully and wonderfully made: marvellous are thy works.', 'creation', true],
  ['Psalm 150:6', 'Let every thing that hath breath praise the LORD. Praise ye the LORD.', 'joy'],
  ['Proverbs 22:6', 'Train up a child in the way he should go: and when he is old, he will not depart from it.', 'family'],
  ['Colossians 3:20', 'Children, obey your parents in all things: for this is well pleasing unto the Lord.', 'family'],
  ['Hebrews 13:8', 'Jesus Christ the same yesterday, and to day, and for ever.', 'jesus'],
  ['1 Peter 5:7', 'Casting all your care upon him; for he careth for you.', 'peace'],
  ['Nehemiah 8:10', 'For the joy of the LORD is your strength.', 'joy', true],
  ['Lamentations 3:22-23', "It is of the LORD's mercies that we are not consumed, because his compassions fail not. They are new every morning: great is thy faithfulness.", 'hope'],
  ['Genesis 9:13', 'I do set my bow in the cloud, and it shall be for a token of a covenant between me and the earth.', 'creation'],
  ['Psalm 34:8', 'O taste and see that the LORD is good: blessed is the man that trusteth in him.', 'joy'],
  ['Deuteronomy 31:6', 'Be strong and of a good courage, fear not, nor be afraid of them: for the LORD thy God, he it is that doth go with thee; he will not fail thee, nor forsake thee.', 'brave'],
  ['Matthew 28:20', 'Lo, I am with you alway, even unto the end of the world. Amen.', 'jesus', true],
  ['Mark 12:30', 'And thou shalt love the Lord thy God with all thy heart, and with all thy soul, and with all thy mind, and with all thy strength.', 'love', true],
  ['Acts 16:31', 'Believe on the Lord Jesus Christ, and thou shalt be saved, and thy house.', 'jesus', true],
  ['2 Corinthians 5:17', 'Therefore if any man be in Christ, he is a new creature: old things are passed away; behold, all things are become new.', 'hope'],
  ['Psalm 121:2', 'My help cometh from the LORD, which made heaven and earth.', 'trust'],
  ['Psalm 100:1', 'Make a joyful noise unto the LORD, all ye lands.', 'joy'],
  ['Matthew 5:9', 'Blessed are the peacemakers: for they shall be called the children of God.', 'peace'],
].map(([ref, text, theme, part]) => ({ id: ref.toLowerCase().replace(/[^a-z0-9]+/g, '-'), ref, text, theme, part: !!part }));
export const verseById = id => VERSES.find(v => v.id === id) || null;
/* verse card templates (our own designs): background element + colours, text styles, font, sticker, sparkle effect, sound */
export const CARD_STYLES = [
  { id: 'sunrise', name: 'Sunrise', bg: 'brand-1', colors: ['#ffb347', '#ff6f59', '#ffd23f', '#fff3d6', '#ffffff'], verse: 'heavenly', ref: 'labelWhite', font: 'fredoka', sticker: '1f305', fx: 'sunburst', snd: 'harp-glissando-up' },
  { id: 'night', name: 'Starry night', bg: 'brand-3', colors: ['#1b1b5a', '#3a2d8f', '#7b2ff7', '#0b0b2a', '#ffd23f'], verse: 'glowGold', ref: 'pillPurple', font: 'fredoka', sticker: '1f31f', fx: 'twinkle', snd: 'twinkle-shimmer' },
  { id: 'parchment', name: 'Scroll', bg: 'brand-1', colors: ['#f3e2b8', '#e3c58a', '#c9a35f', '#fff6e0', '#5a3a12'], verse: 'ink', ref: 'parchment', font: 'grandstander', sticker: '1f4d6', fx: null, snd: 'page' },
  { id: 'rainbow', name: 'Rainbow promise', bg: 'brand-2', colors: ['#ff4d4d', '#ffe600', '#3ddc84', '#1fb6ff', '#a259ff'], verse: 'stickerWhite', ref: 'labelBlack', font: 'luckiestguy', sticker: '1f308', fx: 'sparkle', snd: 'magic-rise-1' },
  { id: 'meadow', name: 'Green pastures', bg: 'brand-1', colors: ['#8ef08a', '#22b04b', '#d4ffd6', '#0b4d1e', '#ffffff'], verse: 'stickerGreen', ref: 'pillGreen', font: 'fredoka', sticker: '1f411', fx: 'petals', snd: 'chime-tree' },
  { id: 'dove', name: 'Peace dove', bg: 'brand-3', colors: ['#bfe9ff', '#8fd8ff', '#ffffff', '#1f7bff', '#ffffff'], verse: 'calm', ref: 'labelBlue', font: 'fredoka', sticker: '1f54a', fx: 'bubblerings', snd: 'fairy-chime-1' },
  { id: 'gold', name: 'Golden glory', bg: 'brand-2', colors: ['#6b4300', '#e0a800', '#fff3b0', '#3d2600', '#ffd23f'], verse: 'scripture', ref: 'stickerLabel', font: 'luckiestguy', sticker: '271d', fx: 'halo', snd: 'harp-glissando-up-and-down' },
  { id: 'pop', name: 'Kids pop', bg: 'brand-4', colors: ['#ff4fa3', '#ffe600', '#1fb6ff', '#3ddc84', '#ffffff'], verse: 'emma3d', ref: 'labelYellow', font: 'luckiestguy', sticker: '1f64f', fx: 'confetti', snd: 'ta-da-1' },
];
export const cardStyle = id => CARD_STYLES.find(s => s.id === id) || CARD_STYLES[0];

/* ---- helpers ---- */
export function wrap(s, n) { const out = []; let line = ''; for (const w of String(s).split(/\s+/).filter(Boolean)) { if (line && (line + ' ' + w).length > n) { out.push(line); line = w; } else line = line ? line + ' ' + w : w; } if (line) out.push(line); return out.join('\n'); }
const T = (content, o = {}) => { const c = newClip('text', { dur: o.dur || 2, transform: { ...DEFAULT_TRANSFORM, x: o.x ?? .5, y: o.y ?? .5, scale: 1, opacity: o.opacity ?? 1 }, text: { content, font: o.font || 'luckiestguy', size: o.size || 80, align: 'center' } });
  if (o.style) applyStyle(c.text, o.style); if (o.font) c.text.font = o.font; if (o.color) c.text.color = o.color; if (o.box) { c.text.box = true; c.text.boxColor = o.box; }
  c.start = r3(o.start || 0); c.dur = r3(o.dur || 2); if (o.anim) c.anim = { in: { id: o.anim, dur: o.animDur || .6 }, ...(o.combo ? { combo: { id: o.combo, dur: 1.4 } } : {}) }; return c; };
const BG = (id, colors, dur) => newClip('element', { dur: r3(dur), element: { id, colors: [...colors] }, name: 'Background', fit: 'cover' });
const IMG = (url, o) => { const c = newClip('image', { mediaId: null, dur: r3(o.dur), fit: 'contain', transform: { ...DEFAULT_TRANSFORM, x: o.x ?? .5, y: o.y ?? .5, scale: o.scale ?? .3 } }); c.start = r3(o.start || 0); c.src = url; c.name = o.name || 'Sticker';
  if (o.anim) c.anim = { in: { id: o.anim, dur: .5 }, ...(o.combo ? { combo: { id: o.combo, dur: 1.4 } } : {}) }; return c; };
const FX = (id, start, dur, amount = .7) => { const c = newClip('effect', { dur: r3(dur), effect: { id, amount } }); c.start = r3(start); return c; };
function compound(name, dur, tracks, kind) {
  const inner = { tracks: [{ ...newTrack('main'), free: true, clips: [] }, ...tracks], v: 1 };
  const c = newClip('compound', { dur: r3(dur), off: 0, inner, name, transform: { ...DEFAULT_TRANSFORM } }); c.kids = kind; return c; }
const trk = (kind, clips) => ({ ...newTrack(kind), clips });
/** Image urls a built clip needs (the panel imports them and fills in mediaId). */
export const clipUrls = clip => [...new Set(clip.inner.tracks.flatMap(t => t.clips).filter(c => c.src).map(c => c.src))];
export function fillMedia(clip, map) { for (const t of clip.inner.tracks) for (const c of t.clips) if (c.src && map[c.src]) { c.mediaId = map[c.src]; delete c.src; } return clip; }
const wide = a => a === '16:9', square = a => a === '1:1' || a === '4:5';

/* ---- 1) Bible verse card ---- */
export function verseCard(aspect, v, styleId = 'sunrise', o = {}) {
  const S = cardStyle(styleId), W = wide(aspect), Q = square(aspect), text = v.text, n = text.length;
  const per = W ? 34 : Q ? 26 : 20, lines = wrap(text, per), L = lines.split('\n').length;
  const size = Math.round(Math.max(44, Math.min(W ? 90 : 96, (W ? 520 : Q ? 600 : 760) / Math.max(3, L + 1.2))));
  const D = r3(o.dur || Math.max(4.5, Math.min(14, 2.2 + text.split(/\s+/).length * .36)));
  const bg = BG(S.bg, S.colors, D), vy = W ? .5 : .5;
  const verse = T(lines, { dur: D - .5, start: .5, y: vy, size, style: S.verse, font: S.font, anim: L > 4 ? 'riseWords' : 'popWords', animDur: Math.min(2.4, .4 + text.split(/\s+/).length * .06) });
  const ref = T(v.ref + (v.part ? '' : ''), { dur: D - 1.2, start: 1.2, y: W ? .88 : Q ? .88 : .84, size: W ? 54 : 58, style: S.ref, font: 'luckiestguy', anim: 'pop' });
  const stk = S.sticker ? IMG(EMO(S.sticker), { dur: D - .2, start: .2, y: W ? .14 : Q ? .13 : .14, scale: W ? .16 : .2, anim: 'pop', combo: 'breathe', name: 'Verse sticker' }) : null;
  const tracks = [trk('main', [bg]), ...(stk ? [trk('overlay', [stk])] : []), ...(S.fx ? [trk('effect', [FX(S.fx, 0, D, .6)])] : []), trk('text', [verse, ref])];
  tracks[0].free = true;
  const clip = compound('Verse ' + v.ref, D, tracks, 'verse'); clip.inner.tracks.shift();   // our own free main (with the background) replaces the empty one
  clip.kidsData = { verse: v.id, style: S.id };
  return { clip, sounds: S.snd && S.snd !== 'page' ? [{ url: SND(S.snd), start: .3, volume: .7 }] : [{ url: SND('swipe-2'), start: .2, volume: .6 }] };
}

/* ---- 2) Quiz card ---- */
export const QUIZ_STYLES = [
  { id: 'gameshow', name: 'Game show', bg: 'brand-2', colors: ['#1b1b5a', '#7b2ff7', '#ffd23f', '#0b0b2a', '#ffffff'], q: 'emma3d', a: ['labelYellow', 'pillPurple', 'labelBlue', 'pillGreen'] },
  { id: 'school', name: 'Classroom', bg: 'brand-1', colors: ['#1f4d36', '#2f6b4a', '#f6f3e4', '#123d2a', '#ffffff'], q: 'chalkboard', a: ['labelWhite', 'labelWhite', 'labelWhite', 'labelWhite'] },
  { id: 'candy', name: 'Candy', bg: 'brand-3', colors: ['#ffb3d9', '#ff4fa3', '#ffffff', '#8a3ffc', '#ffe600'], q: 'stickerPink', a: ['pillRed', 'pillPurple', 'pillGreen', 'labelBlue'] },
  { id: 'bible', name: 'Bible quiz', bg: 'brand-1', colors: ['#6b4300', '#e0a800', '#fff3b0', '#3d2600', '#ffffff'], q: 'scripture', a: ['parchment', 'parchment', 'parchment', 'parchment'] },
];
export const quizStyle = id => QUIZ_STYLES.find(s => s.id === id) || QUIZ_STYLES[0];
export function quizCard(aspect, q, o = {}) {
  const S = quizStyle(o.style), W = wide(aspect), Q = square(aspect), answers = (q.answers || []).map(s => String(s || '').trim()).filter(Boolean).slice(0, 4);
  if (answers.length < 2) throw new Error('A quiz needs 2 to 4 answers');
  const right = Math.max(0, Math.min(answers.length - 1, q.right | 0)), N = Math.max(1, Math.min(15, Math.round(q.countdown ?? 5))), sound = o.sound !== false;
  const t0 = .8, step = .35, tc = r3(t0 + answers.length * step + .4), tr = r3(tc + N), D = r3(tr + 2.6);
  const ql = wrap(q.question || 'Question?', W ? 30 : Q ? 22 : 18), qL = ql.split('\n').length, qy = W ? .2 : Q ? .2 : .2;
  const tx = [T(ql, { dur: D, y: qy, size: Math.round(Math.min(W ? 84 : 90, (W ? 300 : 420) / Math.max(2, qL + .6))), style: S.q, font: 'luckiestguy', anim: 'popWords', animDur: .8 })];
  const L = 'ABCD', ys = W ? [.45, .6, .75, .9] : Q ? [.42, .56, .7, .84] : [.4, .52, .64, .76], xs = W && answers.length > 2 ? [.28, .72, .28, .72] : null, yw = W && answers.length > 2 ? [.5, .5, .74, .74] : ys;
  const asz = W ? 56 : 62, snd = [];
  answers.forEach((a, i) => {
    const s = r3(t0 + i * step), lab = `${L[i]}  ${wrap(a, W ? 22 : 16).replace(/\n/g, ' ')}`, x = xs ? xs[i] : .5, y = xs ? yw[i] : ys[i];
    tx.push(T(lab, { start: s, dur: r3(tr - s), x, y, size: asz, style: S.a[i % 4], font: 'fredoka', anim: 'pop' }));
    if (i === right) tx.push(T('✓ ' + lab, { start: tr, dur: r3(D - tr), x, y, size: asz + 4, style: 'pillGreen', font: 'fredoka', anim: 'pop', combo: 'pulse' }));
    else tx.push(T(lab, { start: tr, dur: r3(D - tr), x, y, size: asz, style: S.a[i % 4], font: 'fredoka', opacity: .35 }));
    if (sound) snd.push({ url: SND('pop-' + (1 + i % 4)), start: s, volume: .6 });
  });
  const cy = W ? .32 : Q ? .3 : .9, cs = W ? 120 : 140;
  for (let k = 0; k < N; k++) { const n = N - k, s = r3(tc + k); tx.push(T(String(n), { start: s, dur: 1, x: W ? .9 : .5, y: W ? .14 : cy, size: cs, style: n <= 3 ? 'red3d' : 'white3d', font: 'luckiestguy', anim: 'pop', animDur: .35 })); if (sound) snd.push({ url: SND('select-blip'), start: s, volume: .8 }); }
  tx.push(T('Answer!', { start: tr, dur: r3(D - tr), x: W ? .85 : .5, y: W ? .14 : cy, size: W ? 70 : 90, style: 'wow', font: 'luckiestguy', anim: 'pop' }));
  if (sound) snd.push({ url: SND('ta-da-1'), start: tr, volume: .9 });
  const tracks = [trk('main', [BG(S.bg, S.colors, D)]), trk('effect', [FX('confetti', tr, r3(D - tr), .8)]), trk('text', tx)]; tracks[0].free = true;
  const clip = compound('Quiz', D, tracks, 'quiz'); clip.inner.tracks.shift();
  clip.kidsData = { question: q.question, answers, right, countdown: N, reveal: tr, style: S.id };
  return { clip, sounds: snd };
}

/* ---- 3) counting + ABC ---- */
export const COUNT_ITEMS = [['apple', 'Apples', '1f34e'], ['star', 'Stars', '2b50'], ['duck', 'Ducks', '1f986'], ['ball', 'Balls', '26bd'], ['heart', 'Hearts', '2764'], ['fish', 'Fish', '1f41f'], ['car', 'Cars', '1f697'], ['sheep', 'Sheep', '1f411'], ['banana', 'Bananas', '1f34c'], ['dog', 'Puppies', '1f436']];
const WORDS = ['Zero', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty'];
const NOTES = ['c', 'd', 'e', 'f', 'g', 'a', 'b', 'c-2'];
/** Grid slots for n items in the picture area (x, y, scale). */
export function gridSlots(n, aspect) { const W = wide(aspect), cols = n <= 3 ? n : n <= 4 ? 2 : n <= 6 ? 3 : n <= 12 ? 4 : 5, rows = Math.ceil(n / cols);
  const x0 = W ? .3 : .1, x1 = W ? .7 : .9, y0 = W ? .14 : .1, y1 = W ? .64 : .58, cw = (x1 - x0) / cols, ch = (y1 - y0) / rows, sc = Math.min(cw * (W ? 1.7 : 1), ch * (W ? 1 : 1.75)) * .8;
  return Array.from({ length: n }, (_, i) => ({ x: x0 + cw * (i % cols + .5), y: y0 + ch * (Math.floor(i / cols) + .5), scale: r3(Math.min(.32, sc)) })); }
export function countingVideo(aspect, itemId = 'apple', to = 10, o = {}) {
  const it = COUNT_ITEMS.find(x => x[0] === itemId) || COUNT_ITEMS[0], N = Math.max(1, Math.min(20, to | 0)), d = o.step || 1.6, D = r3(1.6 + N * d + 1.6), W = wide(aspect);
  const slots = gridSlots(N, aspect), ov = [], tx = [], snd = [];
  tx.push(T(`Let's count ${it[1].toLowerCase()}!`, { start: 0, dur: 1.6, y: .45, size: W ? 90 : 84, style: 'emma3d', anim: 'popWords' }));
  for (let k = 1; k <= N; k++) { const s = r3(1.6 + (k - 1) * d);
    ov.push(IMG(EMO(it[2]), { start: s, dur: r3(D - s), ...slots[k - 1], anim: 'pop', name: `${it[1]} ${k}` }));
    tx.push(T(String(k), { start: s, dur: d, y: W ? .8 : .74, size: W ? 150 : 190, style: ['red3d', 'emma3d', 'blue3d', 'green3d', 'purple3d', 'pink3d'][k % 6], anim: 'pop', animDur: .35 }));
    tx.push(T(WORDS[k] || String(k), { start: r3(s + .25), dur: r3(d - .25), y: W ? .93 : .88, size: W ? 60 : 70, style: 'labelYellow', font: 'fredoka', anim: 'pop' }));
    snd.push({ url: SND('xylophone-' + NOTES[(k - 1) % 8]), start: s, volume: .8 }); }
  const e = r3(1.6 + N * d); tx.push(T(`${WORDS[N] || N} ${it[1].toLowerCase()}!`, { start: e, dur: 1.6, y: W ? .82 : .8, size: W ? 90 : 96, style: 'rainbow3d', anim: 'popWords', combo: 'pulse' }));
  snd.push({ url: SND('ta-da-2'), start: e, volume: .9 });
  const tracks = [trk('main', [BG('brand-3', ['#8fd8ff', '#bfe9ff', '#ffffff', '#1f7bff', '#ffd23f'], D)]), trk('overlay', ov), trk('effect', [FX('confetti', e, 1.6, .7)]), trk('text', tx)]; tracks[0].free = true;
  const clip = compound(`Count to ${N}`, D, tracks, 'count'); clip.inner.tracks.shift(); clip.kidsData = { item: it[0], to: N, step: d };
  return { clip, sounds: snd };
}
export const ABC_WORDS = { A: ['Apple', '1f34e'], B: ['Banana', '1f34c'], C: ['Cat', '1f431'], D: ['Dog', '1f436'], E: ['Elephant', '1f418'], F: ['Fish', '1f41f'], G: ['Grapes', '1f347'], H: ['Horse', '1f434'], I: ['Ice cream', '1f366'],
  J: ['Juice', '1f9c3'], K: ['Kite', '1fa81'], L: ['Lion', '1f981'], M: ['Moon', '1f319'], N: ['Notebook', '1f4d3'], O: ['Owl', '1f989'], P: ['Pig', '1f437'], Q: ['Question', '2753'], R: ['Rainbow', '1f308'], S: ['Sun', '2600'],
  T: ['Tiger', '1f42f'], U: ['Umbrella', '2602'], V: ['Volcano', '1f30b'], W: ['Whale', '1f433'], X: ['Xylophone', '1f3b5'], Y: ['Yacht', '26f5'], Z: ['Zebra', '1f993'] };
export function abcVideo(aspect, from = 'A', to = 'Z', o = {}) {
  const a = from.toUpperCase().charCodeAt(0), b = to.toUpperCase().charCodeAt(0), lo = Math.max(65, Math.min(a, b)), hi = Math.min(90, Math.max(a, b)), d = o.step || 2.2, n = hi - lo + 1, D = r3(1.4 + n * d + 1.6), W = wide(aspect);
  const ov = [], tx = [], snd = [];
  tx.push(T('ABC time!', { start: 0, dur: 1.4, y: .45, size: W ? 110 : 120, style: 'rainbow3d', anim: 'popWords' }));
  for (let i = 0; i < n; i++) { const L = String.fromCharCode(lo + i), [word, emo] = ABC_WORDS[L], s = r3(1.4 + i * d);
    ov.push(IMG(`lib/stickers/art/abc/letter3d-${L.toLowerCase()}.webp`, { start: s, dur: d, x: W ? .3 : .5, y: W ? .45 : .3, scale: W ? .3 : .42, anim: 'pop', combo: 'breathe', name: 'Letter ' + L }));
    ov.push(IMG(EMO(emo), { start: r3(s + .4), dur: r3(d - .4), x: W ? .7 : .5, y: W ? .45 : .62, scale: W ? .26 : .34, anim: 'pop', name: word }));
    tx.push(T(`${L} is for ${word}`, { start: r3(s + .4), dur: r3(d - .4), y: W ? .85 : .86, size: W ? 72 : 76, style: 'labelYellow', font: 'fredoka', anim: 'pop' }));
    snd.push({ url: SND('xylophone-' + NOTES[i % 8]), start: s, volume: .8 }); }
  const e = r3(1.4 + n * d); tx.push(T('Well done!', { start: e, dur: 1.6, y: .5, size: W ? 110 : 120, style: 'emma3d', anim: 'popWords', combo: 'pulse' })); snd.push({ url: SND('ta-da-1'), start: e, volume: .9 });
  const tracks = [trk('main', [BG('brand-4', ['#ff4fa3', '#ffe600', '#1fb6ff', '#3ddc84', '#ffffff'], D)]), trk('overlay', ov), trk('effect', [FX('confetti', e, 1.6, .7)]), trk('text', tx)]; tracks[0].free = true;
  const clip = compound(`ABC ${String.fromCharCode(lo)}–${String.fromCharCode(hi)}`, D, tracks, 'abc'); clip.inner.tracks.shift(); clip.kidsData = { from: String.fromCharCode(lo), to: String.fromCharCode(hi), step: d };
  return { clip, sounds: snd };
}
/** Insert a built clip at the playhead on the main track (after the clip under the playhead) + its sounds on audio tracks. */
export function insertKids(p, built, t, soundIds = {}) {
  const main = p.tracks.find(x => x.kind === 'main'), c = built.clip;
  if (main.free) { c.start = r3(main.clips.reduce((m, x) => Math.max(m, clipEnd(x)), 0)); main.clips.push(c); }
  else { const i = main.clips.findIndex(x => t < clipEnd(x) - 1e-6); const at = i < 0 ? main.clips.length : t <= main.clips[i].start + .05 ? i : i + 1; main.clips.splice(at, 0, c); }
  normalize(p);
  const audio = []; for (const s of built.sounds || []) { const id = soundIds[s.url]; if (!id) continue; const a = newClip('audio', { mediaId: id.id, in: 0, out: Math.min(id.duration || 2, 4), volume: s.volume ?? .8 }); a.start = r3(c.start + s.start); a.kids = c.id; audio.push(a); }
  for (const a of audio) { let tr = p.tracks.find(x => x.kind === 'audio' && x.kidsSfx && !x.clips.some(y => y.start < a.start + (a.out - a.in) && a.start < y.start + (y.out - y.in))); if (!tr) { tr = { ...newTrack('audio'), kidsSfx: true }; p.tracks.push(tr); } tr.clips.push(a); }
  normalize(p); return c;
}

/* Text looks (our own designs): style presets, bubble / label backgrounds and title presets (font + style + animation).
   A style is plain data on clip.text, drawn by drawText in js/render.js (same code for preview and export):
     color, outline + outlineColor + outlineW (em), fill {colors, dir: 'v'|'h'|'d'|'letters'}, stroke2 {color, w} (outer outline),
     shadow {color, dx, dy, blur}, glow {color, blur}, extrude {color, depth, angle} (3D), gloss (shine on the top half),
     bubble (background shape) + boxColor + bubbleBorder {color, w}. Sizes are in em (fraction of the font size). */
export const STYLE_KEYS = ['color', 'outline', 'outlineColor', 'outlineW', 'fill', 'stroke2', 'shadow', 'glow', 'extrude', 'gloss', 'box', 'bubble', 'boxColor', 'bubbleBorder', 'tex', 'fx', 'deco', 'track', 'sub'];
export const STYLE_DEFAULTS = { color: '#ffffff', outline: false, outlineColor: '#000000', outlineW: 0.14, fill: null, stroke2: null, shadow: null, glow: null, extrude: null, gloss: false, box: false, bubble: null, boxColor: '#000000', bubbleBorder: null, tex: null, fx: null, deco: null, track: 0, sub: null };
const RAINBOW = ['#ff4d4d', '#ff9f1c', '#ffe600', '#3ddc84', '#1fb6ff', '#a259ff'];
const GOLD = ['#fff6c2', '#ffd23f', '#d49a00', '#ffe27a', '#b07800'];
const d3 = (top, bot, line, side, extra = {}) => ({ color: top, fill: { colors: [top, bot], dir: 'v' }, outline: true, outlineColor: line, outlineW: 0.1, extrude: { color: side, depth: 0.12, angle: 90 }, gloss: true, ...extra });
const neon = c => ({ color: '#ffffff', outline: true, outlineColor: c, outlineW: 0.05, glow: { color: c, blur: 0.55 } });
const sticker = (fill, line) => ({ color: fill, outline: true, outlineColor: line, outlineW: 0.12, stroke2: { color: '#ffffff', w: 0.12 }, shadow: { color: 'rgba(0,0,0,.45)', dx: 0, dy: 0.06, blur: 0.12 } });
const bub = (shape, bg, color, extra = {}) => ({ color, bubble: shape, box: true, boxColor: bg, ...extra });
export const TEXT_STYLES = [
  { id: 'plain', name: 'Plain', s: {} },
  { id: 'classic', name: 'Classic', s: { outline: true } },
  { id: 'emma3d', name: 'Emma 3D', s: d3('#ffe14d', '#ff9f1c', '#5a2d0c', '#8a4b14') },
  { id: 'blue3d', name: 'Sky 3D', s: d3('#8fe3ff', '#1f7bff', '#0b2a66', '#143f8f') },
  { id: 'red3d', name: 'Cherry 3D', s: d3('#ff8a8a', '#e01e37', '#4a0710', '#8a1020') },
  { id: 'green3d', name: 'Jungle 3D', s: d3('#b6f36b', '#2fb54a', '#123d14', '#1d6b25') },
  { id: 'purple3d', name: 'Grape 3D', s: d3('#e2b6ff', '#8a3ffc', '#2a0b52', '#4b1a8f') },
  { id: 'pink3d', name: 'Candy 3D', s: d3('#ffc2e2', '#ff4fa3', '#5c0b33', '#a2186e') },
  { id: 'white3d', name: 'Snow 3D', s: d3('#ffffff', '#d9e6f2', '#1b2a3a', '#5f7d99') },
  { id: 'gold', name: 'Gold', s: { color: '#ffd23f', fill: { colors: GOLD, dir: 'v' }, outline: true, outlineColor: '#6b4300', outlineW: 0.08, shadow: { color: 'rgba(0,0,0,.5)', dx: 0, dy: 0.05, blur: 0.1 }, gloss: true } },
  { id: 'gold3d', name: 'Gold 3D', s: { color: '#ffd23f', fill: { colors: GOLD, dir: 'v' }, outline: true, outlineColor: '#5a3a00', outlineW: 0.08, extrude: { color: '#7a4f00', depth: 0.12, angle: 90 }, gloss: true } },
  { id: 'silver', name: 'Silver', s: { color: '#e6e9ee', fill: { colors: ['#ffffff', '#b8c1cc', '#f2f4f7', '#8792a0'], dir: 'v' }, outline: true, outlineColor: '#2b3440', outlineW: 0.08, gloss: true } },
  { id: 'rainbow', name: 'Rainbow', s: { color: '#ffe600', fill: { colors: RAINBOW, dir: 'h' }, outline: true, outlineColor: '#ffffff', outlineW: 0.1, stroke2: { color: '#2a1a4a', w: 0.06 } } },
  { id: 'rainbowV', name: 'Rainbow stripes', s: { color: '#ffe600', fill: { colors: RAINBOW, dir: 'v' }, outline: true, outlineColor: '#1b1b2f', outlineW: 0.1 } },
  { id: 'party', name: 'Party letters', s: { color: '#ff4d4d', fill: { colors: RAINBOW, dir: 'letters' }, outline: true, outlineColor: '#ffffff', outlineW: 0.14, shadow: { color: 'rgba(0,0,0,.4)', dx: 0, dy: 0.06, blur: 0.08 } } },
  { id: 'party3d', name: 'Party 3D', s: { color: '#ff4d4d', fill: { colors: RAINBOW, dir: 'letters' }, outline: true, outlineColor: '#1b1b2f', outlineW: 0.08, extrude: { color: '#1b1b2f', depth: 0.1, angle: 90 } } },
  { id: 'neonPink', name: 'Neon pink', s: neon('#ff3fb4') },
  { id: 'neonBlue', name: 'Neon blue', s: neon('#1fb6ff') },
  { id: 'neonGreen', name: 'Neon green', s: neon('#39ff88') },
  { id: 'neonYellow', name: 'Neon yellow', s: neon('#ffe600') },
  { id: 'neonPurple', name: 'Neon purple', s: neon('#b14dff') },
  { id: 'glow', name: 'Soft glow', s: { color: '#ffffff', glow: { color: '#ffffff', blur: 0.4 } } },
  { id: 'glowGold', name: 'Warm glow', s: { color: '#fff4c2', glow: { color: '#ffb300', blur: 0.5 } } },
  { id: 'double', name: 'Double outline', s: { color: '#ffe600', outline: true, outlineColor: '#ff4d4d', outlineW: 0.1, stroke2: { color: '#ffffff', w: 0.08 } } },
  { id: 'doubleBlue', name: 'Double blue', s: { color: '#ffffff', outline: true, outlineColor: '#1f7bff', outlineW: 0.1, stroke2: { color: '#0b1d4a', w: 0.07 } } },
  { id: 'doubleCandy', name: 'Double candy', s: { color: '#ff5fa2', outline: true, outlineColor: '#ffffff', outlineW: 0.1, stroke2: { color: '#ff5fa2', w: 0.07 } } },
  { id: 'sticker', name: 'Sticker', s: sticker('#ff4d4d', '#ff4d4d') },
  { id: 'stickerBlue', name: 'Blue sticker', s: sticker('#1fb6ff', '#0b2a66') },
  { id: 'stickerYellow', name: 'Yellow sticker', s: sticker('#ffcc33', '#5a2d0c') },
  { id: 'stickerGreen', name: 'Green sticker', s: sticker('#3ddc84', '#123d14') },
  { id: 'shadow', name: 'Drop shadow', s: { color: '#ffffff', shadow: { color: 'rgba(0,0,0,.85)', dx: 0.05, dy: 0.07, blur: 0 } } },
  { id: 'softShadow', name: 'Soft shadow', s: { color: '#ffffff', shadow: { color: 'rgba(0,0,0,.7)', dx: 0, dy: 0.04, blur: 0.3 } } },
  { id: 'longShadow', name: 'Long shadow', s: { color: '#ffffff', extrude: { color: 'rgba(0,0,0,.35)', depth: 0.3, angle: 45 } } },
  { id: 'retro', name: 'Retro', s: { color: '#ffcc33', outline: true, outlineColor: '#1b1b2f', outlineW: 0.06, extrude: { color: '#ff4d4d', depth: 0.09, angle: 45 }, shadow: { color: '#1fb6ff', dx: 0.16, dy: 0.16, blur: 0 } } },
  { id: 'comic', name: 'Comic', s: { color: '#ffe600', outline: true, outlineColor: '#000000', outlineW: 0.16, shadow: { color: '#000000', dx: 0.08, dy: 0.08, blur: 0 } } },
  { id: 'fire', name: 'Fire', s: { color: '#ff8a00', fill: { colors: ['#fff36b', '#ff8a00', '#ff2d2d'], dir: 'v' }, glow: { color: '#ff6a00', blur: 0.45 } } },
  { id: 'ice', name: 'Ice', s: { color: '#bdefff', fill: { colors: ['#ffffff', '#9be7ff'], dir: 'v' }, outline: true, outlineColor: '#1f7bff', outlineW: 0.06, glow: { color: '#9be7ff', blur: 0.35 } } },
  { id: 'candy', name: 'Candy', s: { color: '#ff7ac8', fill: { colors: ['#ffb3df', '#b14dff'], dir: 'v' }, outline: true, outlineColor: '#ffffff', outlineW: 0.12, extrude: { color: '#a2186e', depth: 0.08, angle: 90 } } },
  { id: 'bubblegum', name: 'Bubblegum', s: { color: '#ff8fc7', outline: true, outlineColor: '#ffffff', outlineW: 0.2, shadow: { color: 'rgba(162,24,110,.6)', dx: 0, dy: 0.08, blur: 0.05 }, gloss: true } },
  { id: 'ocean', name: 'Ocean', s: { color: '#1fb6ff', fill: { colors: ['#9ff3ff', '#1fb6ff', '#0b3a8a'], dir: 'v' }, outline: true, outlineColor: '#ffffff', outlineW: 0.08 } },
  { id: 'sunset', name: 'Sunset', s: { color: '#ff7a59', fill: { colors: ['#ffd23f', '#ff7a59', '#b14dff'], dir: 'v' }, outline: true, outlineColor: '#2a0b3a', outlineW: 0.08 } },
  { id: 'galaxy', name: 'Galaxy', s: { color: '#b14dff', fill: { colors: ['#7b2ff7', '#f107a3'], dir: 'd' }, glow: { color: '#b14dff', blur: 0.4 }, outline: true, outlineColor: '#ffffff', outlineW: 0.04 } },
  { id: 'mint', name: 'Mint', s: { color: '#9ff5d0', outline: true, outlineColor: '#0d5c46', outlineW: 0.1, extrude: { color: '#0d5c46', depth: 0.06, angle: 90 } } },
  { id: 'chocolate', name: 'Chocolate', s: { color: '#8b5a2b', fill: { colors: ['#b07a45', '#5c3311'], dir: 'v' }, outline: true, outlineColor: '#fff2df', outlineW: 0.1, extrude: { color: '#3a1f08', depth: 0.08, angle: 90 } } },
  { id: 'pastel', name: 'Soft pastel', s: { color: '#ffd6e8', fill: { colors: ['#ffe4f1', '#d6e4ff'], dir: 'v' }, outline: true, outlineColor: '#9a6bb8', outlineW: 0.07 } },
  { id: 'chalk', name: 'Chalk', s: { color: 'rgba(246,243,228,.86)', shadow: { color: 'rgba(255,255,255,.5)', dx: 0.025, dy: 0.025, blur: 0.22 } } },
  { id: 'hollow', name: 'Outline only', s: { color: 'rgba(0,0,0,0)', outline: true, outlineColor: '#ffffff', outlineW: 0.07 } },
  { id: 'ink', name: 'Ink', s: { color: '#111111' } },
  { id: 'labelBlack', name: 'Black label', s: bub('box', '#000000', '#ffffff') },
  { id: 'labelYellow', name: 'Yellow pill', s: bub('pill', '#ffcc33', '#1b1b2f') },
  { id: 'speech', name: 'Speech bubble', s: bub('speech', '#ffffff', '#1b1b2f', { bubbleBorder: { color: '#1b1b2f', w: 0.08 } }) },
  { id: 'thought', name: 'Thought bubble', s: bub('thought', '#ffffff', '#1b1b2f', { bubbleBorder: { color: '#1b1b2f', w: 0.06 } }) },
  { id: 'cloud', name: 'Cloud', s: bub('cloud', '#ffffff', '#1f7bff', { bubbleBorder: { color: '#9bd4ff', w: 0.06 } }) },
  { id: 'banner', name: 'Ribbon', s: bub('banner', '#e01e37', '#ffffff', { bubbleBorder: { color: '#7a0a1a', w: 0.05 } }) },
  { id: 'tag', name: 'Tag', s: bub('tag', '#3ddc84', '#ffffff', { bubbleBorder: { color: '#145c33', w: 0.05 } }) },
  { id: 'burst', name: 'Burst', s: bub('burst', '#ffe600', '#e01e37', { bubbleBorder: { color: '#e01e37', w: 0.06 }, outline: true, outlineColor: '#ffffff', outlineW: 0.08 }) },
  { id: 'stickerLabel', name: 'Sticker label', s: bub('sticker', '#ffffff', '#1b1b2f') },
  { id: 'slant', name: 'Slant label', s: bub('label', '#1fb6ff', '#ffffff') },
];
export const styleById = id => TEXT_STYLES.find(s => s.id === id);
/** Put a style preset on a text object (resets every style field first, so presets never mix by accident). */
export function applyStyle(text, id) {
  const st = styleById(id);
  for (const k of STYLE_KEYS) text[k] = STYLE_DEFAULTS[k];
  if (!st) { delete text.styleId; return text; }
  Object.assign(text, JSON.parse(JSON.stringify(st.s))); text.styleId = id; return text;
}
export const BUBBLES = [
  { id: null, name: 'None' }, { id: 'box', name: 'Box' }, { id: 'pill', name: 'Pill' }, { id: 'speech', name: 'Speech' }, { id: 'thought', name: 'Thought' },
  { id: 'cloud', name: 'Cloud' }, { id: 'banner', name: 'Ribbon' }, { id: 'tag', name: 'Tag' }, { id: 'burst', name: 'Burst' }, { id: 'sticker', name: 'Sticker' }, { id: 'label', name: 'Slant' },
];
const A = (inId, loopId, outId, d = 0.6) => ({ ...(inId ? { in: { id: inId, dur: d } } : {}), ...(loopId ? { loop: { id: loopId, dur: 1.2 } } : {}), ...(outId ? { out: { id: outId, dur: 0.4 } } : {}) });
/* Title presets: one tap sets font + style + animation (+ curve, size, sample words) */
export const TITLES = [
  { id: 'emmaTitle', name: 'Emmavengers', content: 'EMMAVENGERS', font: 'luckiestguy', style: 'emma3d', size: 120, anim: A('bounceIn', 'pulse', 'pop') },
  { id: 'onceUpon', name: 'Once upon a time', content: 'Once upon a time', font: 'pacifico', style: 'gold', size: 96, anim: A('typewriter', null, 'blur', 1.6) },
  { id: 'bigWow', name: 'WOW!', content: 'WOW!', font: 'bangers', style: 'burst', size: 150, anim: A('pop', 'shake', 'pop') },
  { id: 'letterA', name: 'Letter lesson', content: 'A is for Apple', font: 'fredoka', style: 'party', size: 104, anim: A('dropLetters', 'wave', 'fadeWords', 1) },
  { id: 'count', name: 'Count with me', content: '1 2 3', font: 'titanone', style: 'blue3d', size: 150, anim: A('spinLetters', 'bounce', 'zoom') },
  { id: 'quiz', name: 'What is it?', content: 'What is it?', font: 'lilitaone', style: 'speech', size: 96, anim: A('pop', 'swing', 'pop') },
  { id: 'rainbowArc', name: 'Rainbow arc', content: 'Hello friends!', font: 'chewy', style: 'rainbow', size: 110, curve: 0.45, anim: A('waveIn', 'wave', 'fadeWords', 1) },
  { id: 'smileArc', name: 'Smile arc', content: 'Good job!', font: 'baloo2', style: 'stickerYellow', size: 120, curve: -0.4, anim: A('bounceIn', 'jelly', 'pop') },
  { id: 'neonNight', name: 'Neon night', content: 'Good night', font: 'pacifico', style: 'neonPink', size: 104, anim: A('flickerIn', 'flicker', 'blur', 1) },
  { id: 'subscribe', name: 'Subscribe', content: 'SUBSCRIBE', font: 'bowlbyone', style: 'banner', size: 84, anim: A('slide', 'heartbeat', 'slide') },
  { id: 'theEnd', name: 'The End', content: 'The End', font: 'abrilfatface', style: 'gold3d', size: 130, anim: A('zoom', null, 'blur', 1) },
  { id: 'chapter', name: 'Chapter', content: 'Chapter 1', font: 'bebasneue', style: 'labelBlack', size: 90, anim: A('reveal', null, 'reveal') },
  { id: 'funFact', name: 'Fun fact', content: 'FUN FACT!', font: 'bubblegumsans', style: 'tag', size: 100, anim: A('slide', 'swing', 'slide') },
  { id: 'comicPow', name: 'POW!', content: 'POW!', font: 'bangers', style: 'comic', size: 170, anim: A('pop', 'shake', 'pop', 0.35) },
  { id: 'bible', name: 'Bible story', content: 'Noah and the Ark', font: 'grandstander', style: 'gold', size: 100, anim: A('riseWords', 'glowPulse', 'fadeWords', 1) },
  { id: 'verse', name: 'Memory verse', content: 'God loves you', font: 'patrickhand', style: 'stickerLabel', size: 88, anim: A('typewriter', null, 'fadeWords', 1.4) },
  { id: 'fire', name: 'On fire', content: 'AMAZING', font: 'anton', style: 'fire', size: 130, anim: A('stretchIn', 'flicker', 'zoom') },
  { id: 'frozen', name: 'Frozen', content: 'Brrr!', font: 'sniglet', style: 'ice', size: 140, anim: A('blur', 'shake', 'blur') },
  { id: 'jungle', name: 'Jungle', content: 'Animal Facts', font: 'luckiestguy', style: 'green3d', size: 110, anim: A('dropLetters', 'bounce', 'pop') },
  { id: 'ocean', name: 'Ocean', content: 'Under the sea', font: 'fredoka', style: 'ocean', size: 100, curve: 0.3, anim: A('waveIn', 'wave', 'riseWords', 1) },
  { id: 'candy', name: 'Sweet', content: 'Yummy!', font: 'chewy', style: 'candy', size: 140, anim: A('bounceIn', 'jelly', 'pop') },
  { id: 'party', name: 'Party time', content: 'PARTY TIME', font: 'sigmarone', style: 'party3d', size: 100, anim: A('spinLetters', 'rainbow', 'pop') },
  { id: 'galaxy', name: 'Space', content: 'To the stars', font: 'righteous', style: 'galaxy', size: 96, anim: A('glowIn', 'glowPulse', 'blur', 1) },
  { id: 'retro', name: 'Retro', content: 'RETRO', font: 'bungee', style: 'retro', size: 130, anim: A('slide', null, 'slide') },
  { id: 'think', name: 'Thinking', content: 'Hmm…', font: 'gochihand', style: 'thought', size: 110, anim: A('pop', 'swing', 'pop') },
  { id: 'cloudy', name: 'Cloudy', content: 'Hello!', font: 'grandstander', style: 'cloud', size: 110, anim: A('spring', 'pulse', 'spring') },
  { id: 'countdown', name: 'Countdown', content: '3', font: 'titanone', style: 'red3d', size: 260, anim: A('pop', 'heartbeat', 'zoom', 0.3) },
  { id: 'welcome', name: 'Welcome', content: 'Welcome back!', font: 'dynapuff', style: 'double', size: 100, anim: A('bounceIn', 'wave', 'fadeWords') },
  { id: 'lowerThird', name: 'Name label', content: 'Emmanuel', font: 'poppins', style: 'slant', size: 70, y: 0.8, anim: A('reveal', null, 'reveal') },
  { id: 'handwritten', name: 'Handwritten', content: 'made with love', font: 'caveat', style: 'softShadow', size: 104, anim: A('typewriter', null, 'blur', 1.2) },
  { id: 'chalkboard', name: 'Chalkboard', content: 'Today we learn', font: 'amaticsc', style: 'chalk', size: 120, anim: A('fadeWords', null, 'fadeWords', 1) },
  { id: 'pastel', name: 'Soft & sweet', content: 'Sweet dreams', font: 'quicksand', style: 'pastel', size: 100, curve: 0.25, anim: A('blur', 'glowPulse', 'blur', 1) },
];
export const titleById = id => TITLES.find(t => t.id === id);
/** Apply a title preset to a text clip (content only replaces the placeholder text). */
export function applyTitle(clip, id, keepContent = false) {
  const t = titleById(id); if (!t) return clip;
  applyStyle(clip.text, t.style); clip.text.font = t.font; clip.text.size = t.size; clip.text.curve = t.curve || 0;
  if (!keepContent) clip.text.content = t.content;
  if (t.y != null) clip.transform.y = t.y;
  clip.anim = JSON.parse(JSON.stringify(t.anim)); clip.titleId = id; return clip;
}

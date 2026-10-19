/* Captions pro: word-by-word karaoke captions (no speech recognition). Words come from typed text or an SRT file and are
   timed by an even split or by tapping along. A karaoke caption is a normal caption text clip with
   clip.karaoke = { style, words: [{ w, a, b }] (seconds inside the clip), lyric, next }.
   Drawing is pure (clip + time) and shared by preview and export. */
import { captions, captionTracks, newCaption, parseSRT, splitLines } from './captions.js';
import { addToKind, normalize, clipDur, clipEnd } from './project.js';
import { ensureFont } from './fonts.js';

export const KARAOKE_STYLES = [
  { id: 'sweep', name: 'Classic sweep', font: 'montserrat', size: 64, base: '#ffffff', hi: '#ffd400', fx: 'sweep', outline: '#000000' },
  { id: 'box', name: 'Word box', font: 'poppins', size: 60, base: '#ffffff', hi: '#ffffff', box: '#7b3cff', fx: 'box', outline: '#000000' },
  { id: 'pop', name: 'Pop word', font: 'luckiestguy', size: 66, base: '#ffffff', hi: '#3ddc84', fx: 'pop', outline: '#000000' },
  { id: 'bounce', name: 'Bounce', font: 'fredoka', size: 64, base: '#ffffff', hi: '#ff5fa2', fx: 'bounce', outline: '#2a0a3a' },
  { id: 'neon', name: 'Neon glow', font: 'nunito', size: 60, base: 'rgba(255,255,255,0.55)', hi: '#4fe3ff', fx: 'glow' },
  { id: 'under', name: 'Underline', font: 'poppins', size: 58, base: '#ffffff', hi: '#ffb020', fx: 'underline', shadow: true },
  { id: 'reveal', name: 'Reveal', font: 'montserrat', size: 62, base: '#ffffff', hi: '#ffffff', fx: 'reveal', outline: '#000000' },
  { id: 'comic', name: 'Comic shout', font: 'bangers', size: 70, base: '#ffffff', hi: '#ff3b3b', fx: 'pop', outline: '#111111' },
  { id: 'pill', name: 'Yellow pill', font: 'baloo2', size: 58, base: '#1b1b1b', hi: '#1b1b1b', pill: '#ffd400', bar: '#ffffff', fx: 'box' },
  { id: 'rainbow', name: 'Rainbow', font: 'lilitaone', size: 64, base: '#ffffff', hi: 'rainbow', fx: 'fill', outline: '#000000' },
  { id: 'story', name: 'Story gold', font: 'grandstander', size: 60, base: '#fff3d6', hi: '#ffae00', fx: 'sweep', outline: '#5a3200' },
  { id: 'single', name: 'One word', font: 'luckiestguy', size: 104, base: '#ffffff', hi: '#ffd400', fx: 'single', outline: '#000000' },
];
export const karaokeStyleById = id => KARAOKE_STYLES.find(s => s.id === id) || KARAOKE_STYLES[0];
const RAINBOW = ['#ff4d4d', '#ffb020', '#ffe600', '#3ddc84', '#4fa3ff', '#b57bff'];
const r3 = x => Math.round(x * 1000) / 1000;
export const splitWords = s => String(s || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);

/** Even split: every word gets the same time inside [0, D]. */
export function evenWords(text, D) { const ws = splitWords(text), d = D / Math.max(1, ws.length); return ws.map((w, i) => ({ w, a: r3(i * d), b: r3(i === ws.length - 1 ? D : (i + 1) * d) })); }
/** Tap-to-time: taps = clip-local start times of the words (as many as tapped); untapped words share what is left. */
export function tapWords(text, D, taps) {
  const ws = splitWords(text), a = []; let last = 0;
  ws.forEach((w, i) => { if (i < taps.length) last = Math.max(last, Math.min(D - 0.02, taps[i])); else { const left = ws.length - i, end = D; last = last + (end - last) / (left + 1); } a.push(r3(last)); });
  return ws.map((w, i) => ({ w, a: a[i], b: r3(i + 1 < ws.length ? a[i + 1] : D) }));
}
/** Make (or re-time) one caption clip a karaoke caption. */
export function makeKaraoke(c, style, words, lyric = false) {
  const s = karaokeStyleById(style || c.karaoke?.style); c.karaoke = { style: s.id, words: words || evenWords(c.text.content, clipDur(c)), lyric: !!lyric };
  c.text.font = s.font; c.text.size = s.size; return c;
}
/** Lyric mode: each caption also shows the next line under it (filled in here). */
export function linkLyrics(p) { const list = captions(p).filter(c => c.karaoke); list.forEach((c, i) => { c.karaoke.next = c.karaoke.lyric && list[i + 1] ? list[i + 1].text.content : ''; }); }
/** Turn all captions (or the given lines of text / SRT) into karaoke captions. */
export function karaokeAll(p, style, { lyric = false } = {}) {
  const list = captions(p); for (const c of list) { const D = clipDur(c); const keep = c.karaoke && c.karaoke.words.map(w => w.w).join(' ') === splitWords(c.text.content).join(' ') && Math.abs((c.karaoke.words.at(-1)?.b || 0) - D) < 1e-3;
    makeKaraoke(c, style, keep ? c.karaoke.words : evenWords(c.text.content, D), lyric); }
  linkLyrics(p); return list.length;
}
export function karaokeFromText(p, text, t0, t1, style, opt = {}) {
  const lines = splitLines(text); if (!lines.length || !(t1 - t0 > 0.1)) return [];
  for (const t of captionTracks(p)) t.clips = t.clips.filter(c => clipEnd(c) <= t0 + 1e-6 || c.start >= t1 - 1e-6);
  const n = lines.reduce((s, l) => s + splitWords(l).length, 0), per = (t1 - t0) / Math.max(1, n); let t = t0; const made = [];
  for (const l of lines) { const d = per * splitWords(l).length, c = newCaption(p, l, r3(t), r3(d)); makeKaraoke(c, style, null, opt.lyric); addToKind(p, 'caption', c, c.start); made.push(c); t += d; }
  normalize(p); linkLyrics(p); return made;
}
export function karaokeFromSRT(p, src, style, opt = {}) {
  const list = parseSRT(src); if (!list.length) return 0;
  for (const t of captionTracks(p)) t.clips = [];
  for (const l of list) { const c = newCaption(p, l.text.replace(/\n/g, ' '), l.start, l.end - l.start); makeKaraoke(c, style, null, opt.lyric); addToKind(p, 'caption', c, c.start); }
  normalize(p); linkLyrics(p); return list.length;
}
export const activeWord = (c, local) => { const ws = c.karaoke?.words || []; for (let i = 0; i < ws.length; i++) if (local >= ws[i].a && local < ws[i].b) return i; return local >= (ws.at(-1)?.b ?? 0) ? ws.length : -1; };

/* ---------- drawing ---------- */
const cl = x => Math.max(0, Math.min(1, x));
const backOut = x => { x = cl(x); const c = 1.7; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
function rr(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
function layout(ctx, words, maxW, sp) {
  const lines = []; let cur = [], w = 0;
  for (let i = 0; i < words.length; i++) { const ww = ctx.measureText(words[i].w).width; if (cur.length && w + sp + ww > maxW) { lines.push({ items: cur, w }); cur = []; w = 0; } cur.push({ i, ww, x: cur.length ? w + sp : 0 }); w = cur.length > 1 ? w + sp + ww : ww; }
  if (cur.length) lines.push({ items: cur, w }); return lines;
}
/** Draw a karaoke caption. fontCss is the text renderer's font helper (same fonts as normal text). */
export function drawKaraoke(ctx, W, H, clip, tr, local, fontCss) {
  const K = clip.karaoke, S = karaokeStyleById(K.style), unit = Math.min(W, H) / 1080, D = clipDur(clip); let words = K.words || [];
  const px = (clip.text.size || S.size) * unit; ensureFont(S.font);
  if (words.map(w => w.w).join(' ') !== splitWords(clip.text.content).join(' ')) words = evenWords(clip.text.content, D);   // text edited after timing: even split until re-timed
  const fade = K.lyric ? cl(Math.min(local / 0.18, (D - local) / 0.18)) : 1, alpha = cl(tr.opacity) * fade;
  const cx = tr.x * W, cy = tr.y * H, box = { cx, cy, w: W * 0.9 * tr.scale, h: px * 2.4 * tr.scale };
  if (alpha <= 0.0005 || !words.length) return box;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate((tr.rotation || 0) * Math.PI / 180); ctx.scale(tr.scale, tr.scale); ctx.globalAlpha = alpha;
  ctx.font = fontCss({ font: S.font }, px); ctx.textBaseline = 'middle'; ctx.textAlign = 'left'; ctx.lineJoin = 'round';
  const ai = activeWord(clip, local), sp = ctx.measureText(' ').width, lh = px * 1.22;
  const prog = i => i < ai ? 1 : i > ai ? 0 : cl((local - words[i].a) / Math.max(0.01, words[i].b - words[i].a));
  const hiCol = i => S.hi === 'rainbow' ? RAINBOW[i % RAINBOW.length] : S.hi;
  const ink = (txt, x, y, col, glow) => { if (S.shadow) { ctx.shadowColor = 'rgba(0,0,0,.6)'; ctx.shadowBlur = px * .12; ctx.shadowOffsetY = px * .05; }
    if (S.outline) { ctx.strokeStyle = S.outline; ctx.lineWidth = px * 0.16; ctx.strokeText(txt, x, y); }
    if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = px * .45; } ctx.fillStyle = col; ctx.fillText(txt, x, y); ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; };
  if (S.fx === 'single') {
    const i = Math.min(words.length - 1, Math.max(0, ai)), w = words[i], s = backOut((local - w.a) / 0.16), ww = ctx.measureText(w.w).width;
    ctx.save(); ctx.scale(s, s); ink(w.w, -ww / 2, 0, i === ai ? S.hi : S.base); ctx.restore(); ctx.restore(); return box;
  }
  const lines = layout(ctx, words, W * 0.86 / Math.max(.2, tr.scale), sp), y0 = -(lines.length - 1) * lh / 2 - (K.lyric && K.next ? lh * 0.45 : 0);
  if (S.bar) { const bw = Math.max(...lines.map(l => l.w)) + px * .8, bh = lines.length * lh + px * .35; ctx.fillStyle = S.bar; rr(ctx, -bw / 2, y0 - lh / 2 - px * .18, bw, bh, px * .3); ctx.fill(); }
  lines.forEach((L, li) => { const y = y0 + li * lh, x0 = -L.w / 2;
    for (const it of L.items) { const i = it.i, w = words[i], p = prog(i), x = x0 + it.x, act = i === ai;
      if (S.fx === 'box' && act) { ctx.fillStyle = S.pill || S.box; rr(ctx, x - px * .14, y - px * .6, it.ww + px * .28, px * 1.18, px * .22); ctx.fill(); }
      if (S.fx === 'underline' && p > 0) { ctx.fillStyle = S.hi; ctx.fillRect(x, y + px * .52, it.ww * p, px * .1); }
      if (S.fx === 'sweep') { ink(w.w, x, y, S.base); if (p > 0) { ctx.save(); ctx.beginPath(); ctx.rect(x - px * .1, y - px, (it.ww + px * .2) * p, px * 2); ctx.clip(); ink(w.w, x, y, hiCol(i)); ctx.restore(); } continue; }
      if (S.fx === 'reveal') { const a = i < ai ? 1 : act ? cl(p * 4) : 0; if (a <= 0) continue; ctx.save(); ctx.globalAlpha = alpha * a; ctx.translate(0, (1 - a) * px * .3); ink(w.w, x, y, S.base); ctx.restore(); continue; }
      if (S.fx === 'pop' && act) { const s = 1 + .22 * Math.sin(Math.PI * cl((local - w.a) / 0.22)) + .06; ctx.save(); ctx.translate(x + it.ww / 2, y); ctx.scale(s, s); ink(w.w, -it.ww / 2, 0, hiCol(i)); ctx.restore(); continue; }
      if (S.fx === 'bounce' && act) { ink(w.w, x, y - px * .28 * Math.sin(Math.PI * p), hiCol(i)); continue; }
      if (S.fx === 'glow') { ink(w.w, x, y, p > 0 ? hiCol(i) : S.base, act ? hiCol(i) : null); continue; }
      ink(w.w, x, y, (S.fx === 'fill' || S.fx === 'underline' || S.fx === 'box') && (act || (S.fx === 'fill' && p > 0)) ? hiCol(i) : S.base);
    } });
  if (K.lyric && K.next) { const y = y0 + lines.length * lh + lh * .15; ctx.font = fontCss({ font: S.font }, px * .78); ctx.textAlign = 'center'; ctx.globalAlpha = alpha * .55; ink(K.next, 0, y, S.bar ? S.base : '#ffffff'); }
  if (K.lyric) { ctx.globalAlpha = alpha * .9; ctx.font = `${Math.round(px * .7)}px system-ui, sans-serif`; ctx.textAlign = 'center'; ctx.fillStyle = S.hi === 'rainbow' ? RAINBOW[0] : S.hi; ctx.fillText('♪', -Math.max(...lines.map(l => l.w)) / 2 - px * .6, y0); }
  ctx.restore(); return box;
}
/** Tap-to-time over all karaoke captions: taps[k] = project time when word k (counting through every line) starts. */
export function applyTaps(p, taps) {
  const list = captions(p).filter(c => c.karaoke); let used = 0;
  for (const c of list) { const n = c.karaoke.words.length, e = clipEnd(c), mine = taps.filter(t => t >= c.start - 0.05 && t < e - 0.02).slice(0, n).map(t => Math.max(0, t - c.start));   // taps land in the line playing at that moment
    if (mine.length) { c.karaoke.words = tapWords(c.text.content, clipDur(c), mine); used += mine.length; } }
  linkLyrics(p); return used;
}
export const karaokeWordCount = p => captions(p).filter(c => c.karaoke).reduce((s, c) => s + c.karaoke.words.length, 0);

/* Canvas & layout (Batch 10): canvas background for mismatched ratios (colour / blur / gradient / pattern / image)
   and split-screen + collage layouts (clip.cell). Pure drawing + data; used by render.js for preview AND export. */
import { drawBgBlur } from './pro.js';

/* ---------- 12 own gradients ---------- */
export const GRADIENTS = [
  { id: 'sunrise', name: 'Sunrise', a: 160, s: ['#ff9a3c', '#ff5e7e', '#7b4bff'] },
  { id: 'ocean', name: 'Ocean', a: 180, s: ['#33d6ff', '#1d6fe0', '#0b2a6b'] },
  { id: 'candy', name: 'Candy', a: 135, s: ['#ff8ad8', '#ffd36e'] },
  { id: 'meadow', name: 'Meadow', a: 180, s: ['#c8f560', '#3fbf6a', '#13744a'] },
  { id: 'night', name: 'Night', a: 180, s: ['#1b1446', '#3b1f7a', '#0a0a1f'] },
  { id: 'gold', name: 'Gold', a: 135, s: ['#fff1a8', '#ffc83d', '#c27b10'] },
  { id: 'mint', name: 'Mint', a: 160, s: ['#b9ffe8', '#5ad7c0'] },
  { id: 'berry', name: 'Berry', a: 135, s: ['#ff3f6c', '#8a1bd1'] },
  { id: 'sky', name: 'Sky', a: 180, s: ['#bfe9ff', '#7cc6ff', '#ffffff'] },
  { id: 'lava', name: 'Lava', a: 200, s: ['#ffd23f', '#ff6a00', '#a3001b'] },
  { id: 'glow', name: 'Glow', r: true, s: ['#fff6c4', '#ffb347', '#5b2a86'] },
  { id: 'spot', name: 'Spotlight', r: true, s: ['#5a5a6e', '#16161c'] },
];
/* ---------- 10 procedural patterns (tile size follows the frame height, so preview == export) ---------- */
export const PATTERNS = [['dots', 'Dots'], ['stripes', 'Stripes'], ['checks', 'Checks'], ['stars', 'Stars'], ['hearts', 'Hearts'],
  ['zigzag', 'Zigzag'], ['grid', 'Grid'], ['waves', 'Waves'], ['confetti', 'Confetti'], ['bubbles', 'Bubbles']].map(([id, name]) => ({ id, name }));
export const PATTERN_COLORS = [['#ffd23f', '#ff7a00'], ['#7cc6ff', '#1d6fe0'], ['#ffb3dd', '#ff4fa3'], ['#b6f27a', '#3fbf6a'], ['#2b2b38', '#ffd23f'], ['#ffffff', '#c9c9d6']];
export const gradientById = id => GRADIENTS.find(g => g.id === id) || GRADIENTS[0];

function star(g, x, y, r, n = 5) { g.beginPath(); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, q = i % 2 ? r * .45 : r; g.lineTo(x + Math.cos(a) * q, y + Math.sin(a) * q); } g.closePath(); g.fill(); }
function heart(g, x, y, r) { g.beginPath(); g.moveTo(x, y + r * .9); g.bezierCurveTo(x - r * 1.6, y - r * .1, x - r * .7, y - r * 1.2, x, y - r * .35); g.bezierCurveTo(x + r * .7, y - r * 1.2, x + r * 1.6, y - r * .1, x, y + r * .9); g.fill(); }
const tiles = new Map();
/** One pattern tile (cached), s = tile size in px. */
export function patternTile(id, c1, c2, s) {
  s = Math.max(8, Math.round(s)); const key = [id, c1, c2, s].join('|'); if (tiles.has(key)) return tiles.get(key);
  const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(s, s) : Object.assign(document.createElement('canvas'), { width: s, height: s }), g = cv.getContext('2d');
  g.fillStyle = c1; g.fillRect(0, 0, s, s); g.fillStyle = c2; g.strokeStyle = c2; g.lineCap = 'round'; g.lineJoin = 'round';
  const h = s / 2;
  switch (id) {
    case 'dots': for (const [x, y] of [[h / 2, h / 2], [h * 1.5, h * 1.5]]) { g.beginPath(); g.arc(x, y, s * .13, 0, 7); g.fill(); } break;
    case 'stripes': g.lineWidth = s * .25; g.lineCap = 'square'; for (const k of [-1, 0, 1]) { g.beginPath(); g.moveTo(k * s, s); g.lineTo(k * s + s, 0); g.stroke(); } break;
    case 'checks': g.fillRect(0, 0, h, h); g.fillRect(h, h, h, h); break;
    case 'stars': star(g, h / 2, h / 2, s * .18); star(g, h * 1.5, h * 1.5, s * .12); break;
    case 'hearts': heart(g, h / 2, h / 2, s * .16); heart(g, h * 1.5, h * 1.5, s * .12); break;
    case 'zigzag': g.lineWidth = s * .09; for (const y0 of [s * .3, s * .8]) { g.beginPath(); g.moveTo(0, y0); g.lineTo(h / 2, y0 - s * .22); g.lineTo(h, y0); g.lineTo(h * 1.5, y0 - s * .22); g.lineTo(s, y0); g.stroke(); } break;
    case 'grid': g.lineWidth = Math.max(1, s * .05); g.strokeRect(0, 0, s, s); break;
    case 'waves': g.lineWidth = s * .08; for (const y0 of [s * .25, s * .75]) { g.beginPath(); for (let i = 0; i <= 24; i++) { const x = i / 24 * s; g.lineTo(x, y0 + Math.sin(i / 24 * Math.PI * 2) * s * .1); } g.stroke(); } break;
    case 'confetti': { let r = 7; const rnd = () => (r = (r * 16807) % 2147483647) / 2147483647; for (let i = 0; i < 7; i++) { g.save(); g.translate(rnd() * s, rnd() * s); g.rotate(rnd() * 6); g.globalAlpha = .6 + rnd() * .4; g.fillRect(-s * .06, -s * .025, s * .12, s * .05); g.restore(); } break; }
    case 'bubbles': g.lineWidth = Math.max(1, s * .04); for (const [x, y, r] of [[s * .3, s * .3, .17], [s * .75, s * .62, .11], [s * .25, s * .8, .07]]) { g.beginPath(); g.arc(x, y, s * r, 0, 7); g.stroke(); } break;
  }
  tiles.set(key, cv); if (tiles.size > 40) tiles.delete(tiles.keys().next().value); return cv;
}
export function drawGradient(ctx, W, H, gr) {
  let G;
  if (gr.r) { G = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.hypot(W, H) / 2); }
  else { const a = (gr.a ?? 180) * Math.PI / 180, dx = Math.sin(a), dy = -Math.cos(a), L = (Math.abs(W * dx) + Math.abs(H * dy)) / 2; G = ctx.createLinearGradient(W / 2 - dx * L, H / 2 - dy * L, W / 2 + dx * L, H / 2 + dy * L); }
  gr.s.forEach((c, i) => G.addColorStop(i / (gr.s.length - 1), c)); ctx.fillStyle = G; ctx.fillRect(0, 0, W, H);
}
const pseudo = new Map();
/** The canvas image as a source-able pseudo clip (player.source / export frames handle it like a photo clip). */
export function canvasClip(p) {
  const c = p.canvas; if (!c || c.type !== 'image' || !c.mediaId) return null;
  if (!pseudo.has(c.mediaId)) pseudo.set(c.mediaId, { id: '__canvas_' + c.mediaId, type: 'image', mediaId: c.mediaId, start: 0, transform: { x: .5, y: .5, scale: 1, rotation: 0, opacity: 1 } });
  return pseudo.get(c.mediaId);
}
/** Everything under the clips: background colour, then the canvas (blur of the main clip / gradient / pattern / image). */
export function drawCanvasBg(ctx, W, H, p, t, getSource, mainClip) {
  ctx.fillStyle = p.bg || '#000'; ctx.fillRect(0, 0, W, H);
  const cv = p.canvas, type = cv && cv.type;
  if (type === 'gradient') drawGradient(ctx, W, H, gradientById(cv.id));
  else if (type === 'pattern') { const tile = patternTile(cv.id || 'dots', cv.c1 || '#ffd23f', cv.c2 || '#ff7a00', H / (cv.size || 12)); ctx.save(); ctx.fillStyle = ctx.createPattern(tile, 'repeat'); ctx.fillRect(0, 0, W, H); ctx.restore(); }
  else if (type === 'image') { const pc = canvasClip(p), s = pc && getSource(pc, t);
    if (s) { if ((cv.blur || 0) > 0) drawBgBlur(ctx, W, H, s, pc, cv.blur); else { const k = Math.max(W / s.w, H / s.h); ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; ctx.drawImage(s.img, (W - s.w * k) / 2, (H - s.h * k) / 2, s.w * k, s.h * k); ctx.restore(); } } }
  if ((type === 'blur' || (!type && p.bgBlur > 0)) && mainClip && mainClip.type !== 'text') { const s = getSource(mainClip, t); if (s) drawBgBlur(ctx, W, H, s, mainClip, type === 'blur' ? (cv.amount ?? p.bgBlur ?? .6) : p.bgBlur); }
}

/* ---------- split-screen + collage layouts: 18 layouts, 2-6 cells (x, y, w, h in 0..1 of the frame) ---------- */
const R = (x, y, w, h) => [x, y, w, h], T3 = 1 / 3;
export const LAYOUTS = [
  { id: 'h2', name: 'Top / bottom', cells: [R(0, 0, 1, .5), R(0, .5, 1, .5)] },
  { id: 'v2', name: 'Left / right', cells: [R(0, 0, .5, 1), R(.5, 0, .5, 1)] },
  { id: 'h2b', name: 'Big + strip', cells: [R(0, 0, 1, 2 * T3), R(0, 2 * T3, 1, T3)] },
  { id: 'h3', name: '3 rows', cells: [R(0, 0, 1, T3), R(0, T3, 1, T3), R(0, 2 * T3, 1, T3)] },
  { id: 'v3', name: '3 columns', cells: [R(0, 0, T3, 1), R(T3, 0, T3, 1), R(2 * T3, 0, T3, 1)] },
  { id: 't3', name: '1 + 2', cells: [R(0, 0, 1, .5), R(0, .5, .5, .5), R(.5, .5, .5, .5)] },
  { id: 'b3', name: '2 + 1', cells: [R(0, 0, .5, .5), R(.5, 0, .5, .5), R(0, .5, 1, .5)] },
  { id: 'l3', name: 'Big left', cells: [R(0, 0, .6, 1), R(.6, 0, .4, .5), R(.6, .5, .4, .5)] },
  { id: 'g4', name: '2 × 2', cells: [R(0, 0, .5, .5), R(.5, 0, .5, .5), R(0, .5, .5, .5), R(.5, .5, .5, .5)] },
  { id: 'h4', name: '4 rows', cells: [0, 1, 2, 3].map(i => R(0, i / 4, 1, .25)) },
  { id: 't4', name: '1 + 3', cells: [R(0, 0, 1, .6), R(0, .6, T3, .4), R(T3, .6, T3, .4), R(2 * T3, .6, T3, .4)] },
  { id: 'l4', name: 'Big + 3 side', cells: [R(0, 0, .62, 1), R(.62, 0, .38, T3), R(.62, T3, .38, T3), R(.62, 2 * T3, .38, T3)] },
  { id: 'g5a', name: '2 + 3', cells: [R(0, 0, .5, .5), R(.5, 0, .5, .5), R(0, .5, T3, .5), R(T3, .5, T3, .5), R(2 * T3, .5, T3, .5)] },
  { id: 'g5b', name: '1 + 4', cells: [R(0, 0, 1, .4), R(0, .4, .5, .3), R(.5, .4, .5, .3), R(0, .7, .5, .3), R(.5, .7, .5, .3)] },
  { id: 'g5c', name: '3 + 2', cells: [R(0, 0, T3, .5), R(T3, 0, T3, .5), R(2 * T3, 0, T3, .5), R(0, .5, .5, .5), R(.5, .5, .5, .5)] },
  { id: 'g6', name: '2 × 3', cells: [0, 1, 2].flatMap(r => [R(0, r * T3, .5, T3), R(.5, r * T3, .5, T3)]) },
  { id: 'g6b', name: '3 × 2', cells: [0, 1].flatMap(r => [0, 1, 2].map(c => R(c * T3, r * .5, T3, .5))) },
  { id: 'g6c', name: 'Big + 5', cells: [R(0, 0, 2 * T3, 2 * T3), R(2 * T3, 0, T3, T3), R(2 * T3, T3, T3, T3), R(0, 2 * T3, T3, T3), R(T3, 2 * T3, T3, T3), R(2 * T3, 2 * T3, T3, T3)] },
];
export const layoutById = id => LAYOUTS.find(l => l.id === id);
/** Cell of layout `lay` number i with a gap (fraction of the short side) — stored on the clip as clip.cell. */
export function cellOf(lay, i, gap = 0, round = 0, aspect = 9 / 16) {
  const [x, y, w, h] = layoutById(lay).cells[i], gx = gap, gy = gap * aspect;   // equal gap in pixels both ways
  const x0 = x + (x < 1e-6 ? gx : gx / 2), x1 = x + w - (x + w > 1 - 1e-6 ? gx : gx / 2), y0 = y + (y < 1e-6 ? gy : gy / 2), y1 = y + h - (y + h > 1 - 1e-6 ? gy : gy / 2);
  const r4 = v => Math.round(v * 1e4) / 1e4;
  return { x: r4(x0), y: r4(y0), w: r4(Math.max(.01, x1 - x0)), h: r4(Math.max(.01, y1 - y0)), r: round, lay, i, gap };
}
/** Rounded-rect clip path of a cell in pixels. */
export function cellPath(g, c, W, H) {
  const x = c.x * W, y = c.y * H, w = c.w * W, h = c.h * H, r = Math.min(w, h) / 2 * Math.max(0, Math.min(1, c.r || 0));
  g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h);
}
/** Layout thumbnail (SVG) for the picker. */
export const layoutIcon = l => `<svg viewBox="0 0 36 64" width="27" height="48">${l.cells.map(([x, y, w, h]) => `<rect x="${x * 36 + 1.5}" y="${y * 64 + 1.5}" width="${w * 36 - 3}" height="${h * 64 - 3}" rx="2.5" fill="currentColor" opacity=".85"/>`).join('')}</svg>`;

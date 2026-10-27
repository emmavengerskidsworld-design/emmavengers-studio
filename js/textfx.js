/* B20 text effect layers shared by preview + export: procedural textures, multi-layer passes (offset, glitch, neon tube, drips,
   gradient 3D, inline, highlight, sparkles) and decorative elements (ribbon, badge, burst, frame, swipe, stars). Pure canvas 2D. */
const hash = (i, j) => { const v = Math.sin(i * 12.9898 + j * 78.233) * 43758.5453; return v - Math.floor(v); };
const TEX = new Map();
const lin = (x, y0, y1, stops) => { const g = x.createLinearGradient(0, y0, 0, y1); stops.forEach(([o, c]) => g.addColorStop(o, c)); return g; };
const DRAW = {
  fire: x => { x.fillStyle = lin(x, 0, 256, [[0, '#fff7a0'], [.35, '#ffcc00'], [.65, '#ff6a00'], [1, '#c4000c']]); x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(255,${200 + 55 * hash(i, 1) | 0},80,.35)`; x.beginPath(); const cx = hash(i, 2) * 256, cy = 120 + hash(i, 3) * 140; x.ellipse(cx, cy, 8 + 14 * hash(i, 4), 30 + 40 * hash(i, 5), 0, 0, 7); x.fill(); } },
  gold: x => { x.fillStyle = lin(x, 0, 256, [[0, '#fff3b0'], [.3, '#ffd23f'], [.48, '#b8860b'], [.52, '#fff0a0'], [.75, '#d9a520'], [1, '#7a5200']]); x.fillRect(0, 0, 256, 256); },
  chrome: x => { x.fillStyle = lin(x, 0, 256, [[0, '#ffffff'], [.25, '#cfe3ff'], [.49, '#5d7ea8'], [.5, '#2b2b2b'], [.62, '#9a8a6a'], [1, '#ffffff']]); x.fillRect(0, 0, 256, 256); },
  silver: x => { x.fillStyle = lin(x, 0, 256, [[0, '#ffffff'], [.45, '#b8c0c8'], [.5, '#6f7880'], [1, '#e8eef4']]); x.fillRect(0, 0, 256, 256); },
  ice: x => { x.fillStyle = lin(x, 0, 256, [[0, '#ffffff'], [.4, '#b9f3ff'], [1, '#2a8cff']]); x.fillRect(0, 0, 256, 256);
    x.strokeStyle = 'rgba(255,255,255,.7)'; x.lineWidth = 3; for (let i = 0; i < 18; i++) { x.beginPath(); const a = hash(i, 1) * 256, b = hash(i, 2) * 256; x.moveTo(a, b); x.lineTo(a + 30 * (hash(i, 3) - .5), b + 40 * hash(i, 4)); x.stroke(); } },
  candy: x => { x.fillStyle = '#fff'; x.fillRect(0, 0, 256, 256); x.fillStyle = '#ff3d7f'; for (let i = -256; i < 512; i += 48) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 24, 0); x.lineTo(i + 24 + 256, 256); x.lineTo(i + 256, 256); x.fill(); } },
  mint: x => { x.fillStyle = '#e9fff6'; x.fillRect(0, 0, 256, 256); x.fillStyle = '#20c997'; for (let i = -256; i < 512; i += 40) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 18, 0); x.lineTo(i + 18 + 256, 256); x.lineTo(i + 256, 256); x.fill(); } },
  rainbow: x => { const g = x.createLinearGradient(0, 0, 256, 0); ['#ff3b3b', '#ff9f1c', '#ffe600', '#3ddc84', '#1fb6ff', '#a259ff'].forEach((c, i) => g.addColorStop(i / 5, c)); x.fillStyle = g; x.fillRect(0, 0, 256, 256); },
  galaxy: x => { const g = x.createRadialGradient(90, 90, 10, 128, 128, 200); g.addColorStop(0, '#ff6ad5'); g.addColorStop(.4, '#7b2ff7'); g.addColorStop(1, '#0b0630'); x.fillStyle = g; x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 90; i++) { x.fillStyle = `rgba(255,255,255,${.4 + .6 * hash(i, 9)})`; x.fillRect(hash(i, 1) * 256, hash(i, 2) * 256, 1.5 + 2 * hash(i, 3), 1.5 + 2 * hash(i, 3)); } },
  wood: x => { x.fillStyle = '#a0612a'; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 26; i++) { x.strokeStyle = i % 2 ? 'rgba(80,40,10,.45)' : 'rgba(220,150,80,.35)'; x.lineWidth = 2 + 4 * hash(i, 1); x.beginPath(); const y = i * 10; x.moveTo(0, y); x.bezierCurveTo(80, y + 12 * (hash(i, 2) - .5), 170, y - 10 * hash(i, 3), 256, y + 6); x.stroke(); } },
  metal: x => { x.fillStyle = lin(x, 0, 256, [[0, '#d9dde2'], [.5, '#8d949c'], [1, '#c7ccd2']]); x.fillRect(0, 0, 256, 256); for (let i = 0; i < 256; i += 2) { x.fillStyle = `rgba(255,255,255,${.12 * hash(i, 4)})`; x.fillRect(0, i, 256, 1); } },
  lava: x => { x.fillStyle = '#2a0000'; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 26; i++) { const g = x.createRadialGradient(0, 0, 1, 0, 0, 40); g.addColorStop(0, '#ffe066'); g.addColorStop(.5, '#ff4d00'); g.addColorStop(1, 'rgba(120,0,0,0)'); x.save(); x.translate(hash(i, 1) * 256, hash(i, 2) * 256); x.fillStyle = g; x.fillRect(-40, -40, 80, 80); x.restore(); } },
  marble: x => { x.fillStyle = '#f4f1ec'; x.fillRect(0, 0, 256, 256); x.strokeStyle = 'rgba(90,90,110,.35)'; for (let i = 0; i < 14; i++) { x.lineWidth = 1 + 3 * hash(i, 1); x.beginPath(); x.moveTo(-10, hash(i, 2) * 256); for (let k = 1; k < 8; k++) x.lineTo(k * 40, hash(i, 2) * 256 + 40 * Math.sin(k + i) * hash(i, k)); x.stroke(); } },
  camo: x => { x.fillStyle = '#5b6b3a'; x.fillRect(0, 0, 256, 256); ['#2f3a1d', '#8a8f5a', '#3e4a28'].forEach((c, j) => { x.fillStyle = c; for (let i = 0; i < 14; i++) { x.beginPath(); x.ellipse(hash(i, j + 1) * 256, hash(i, j + 5) * 256, 14 + 22 * hash(i, j), 10 + 16 * hash(j, i), hash(i, 7) * 3, 0, 7); x.fill(); } }); },
  denim: x => { x.fillStyle = '#2f5f9e'; x.fillRect(0, 0, 256, 256); for (let i = -256; i < 512; i += 4) { x.strokeStyle = 'rgba(255,255,255,.08)'; x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 256, 256); x.stroke(); } },
  sunset: x => { x.fillStyle = lin(x, 0, 256, [[0, '#ffe259'], [.5, '#ff7a59'], [1, '#c2185b']]); x.fillRect(0, 0, 256, 256); },
  ocean: x => { x.fillStyle = lin(x, 0, 256, [[0, '#a8ffef'], [.5, '#00b4d8'], [1, '#023e8a']]); x.fillRect(0, 0, 256, 256); for (let i = 0; i < 8; i++) { x.strokeStyle = 'rgba(255,255,255,.35)'; x.lineWidth = 3; x.beginPath(); for (let k = 0; k <= 256; k += 16) x.lineTo(k, 30 + i * 30 + 6 * Math.sin(k / 20 + i)); x.stroke(); } },
  toxic: x => { x.fillStyle = lin(x, 0, 256, [[0, '#eaff7a'], [.5, '#7dff3d'], [1, '#1f8a00']]); x.fillRect(0, 0, 256, 256); for (let i = 0; i < 30; i++) { x.fillStyle = 'rgba(255,255,255,.35)'; x.beginPath(); x.arc(hash(i, 1) * 256, hash(i, 2) * 256, 3 + 8 * hash(i, 3), 0, 7); x.fill(); } },
  pumpkin: x => { x.fillStyle = lin(x, 0, 256, [[0, '#ffb347'], [1, '#d35400']]); x.fillRect(0, 0, 256, 256); x.strokeStyle = 'rgba(120,40,0,.35)'; x.lineWidth = 6; for (let i = 0; i < 256; i += 32) { x.beginPath(); x.moveTo(i, 0); x.quadraticCurveTo(i + 16, 128, i, 256); x.stroke(); } },
  confetti: x => { x.fillStyle = '#fff6fb'; x.fillRect(0, 0, 256, 256); const C = ['#ff4d6d', '#ffd23f', '#3ddc84', '#1fb6ff', '#a259ff']; for (let i = 0; i < 120; i++) { x.fillStyle = C[i % 5]; x.save(); x.translate(hash(i, 1) * 256, hash(i, 2) * 256); x.rotate(hash(i, 3) * 6); x.fillRect(-4, -2, 8, 4); x.restore(); } },
  holo: x => { const g = x.createLinearGradient(0, 0, 256, 256); ['#ffd1ff', '#c1fff4', '#fff4b8', '#d1d4ff', '#ffd1e8'].forEach((c, i) => g.addColorStop(i / 4, c)); x.fillStyle = g; x.fillRect(0, 0, 256, 256); },
  leopard: x => { x.fillStyle = '#e8b04a'; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 40; i++) { x.fillStyle = '#3a2208'; x.beginPath(); x.ellipse(hash(i, 1) * 256, hash(i, 2) * 256, 8 + 6 * hash(i, 3), 6 + 5 * hash(i, 4), hash(i, 5) * 3, 0, 7); x.fill(); } },
  stars: x => { x.fillStyle = '#16205a'; x.fillRect(0, 0, 256, 256); x.fillStyle = '#ffe066'; for (let i = 0; i < 30; i++) { star(x, hash(i, 1) * 256, hash(i, 2) * 256, 4 + 6 * hash(i, 3)); x.fill(); } },
};
export const TEXTURES = Object.keys(DRAW);
function star(x, cx, cy, r) { x.beginPath(); for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr = k % 2 ? r * .45 : r; x.lineTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a)); } x.closePath(); }
function texCanvas(name) { let c = TEX.get(name); if (c) return c; c = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(256, 256) : Object.assign(document.createElement('canvas'), { width: 256, height: 256 }); (DRAW[name] || DRAW.gold)(c.getContext('2d')); TEX.set(name, c); return c; }
export function texPaint(ctx, name, w, h, ox = 0, oy = 0) {
  const p = ctx.createPattern(texCanvas(name), 'no-repeat') || '#fff'; if (p.setTransform) { const sx = (w + 4) / 256, sy = (h + 4) / 256; p.setTransform(new DOMMatrix([sx, 0, 0, sy, -w / 2 - 2 - ox, -h / 2 - 2 - oy])); } return p;
}
const lerpC = (a, b, t) => { const p = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16)); const A = p(a), B = p(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
/** Extra glyph passes; `pos` 'pre' = under the main fill, 'post' = over it. */
export function fxPasses(ctx, T, px, sc, lh, pos) {
  const P = []; for (const L of T.fx || []) {
    const post = L.k === 'inline' || L.k === 'hl' || L.k === 'spark' || L.k === 'emboss' || L.k === 'scan';
    if ((pos === 'post') !== post) continue;
    if (L.k === 'off') P.push((g, x, y) => { ctx.fillStyle = ctx.strokeStyle = L.color; ctx.lineJoin = 'round'; ctx.lineWidth = (L.w || 0) * px; const X = x + L.dx * px, Y = y + L.dy * px; if (L.w) ctx.strokeText(g.s, X, Y); ctx.fillText(g.s, X, Y); });
    else if (L.k === 'stk') P.push((g, x, y) => { ctx.lineJoin = 'round'; ctx.lineWidth = L.w * px; ctx.strokeStyle = L.color; if (L.blur) { ctx.shadowColor = L.color; ctx.shadowBlur = L.blur * px * sc; } ctx.strokeText(g.s, x, y); ctx.shadowBlur = 0; });
    else if (L.k === 'glitch') P.push((g, x, y) => { const d = (L.d || .05) * px; ctx.fillStyle = L.a || '#00f0ff'; ctx.fillText(g.s, x - d, y); ctx.fillStyle = L.b || '#ff2d75'; ctx.fillText(g.s, x + d, y + d * .3); });
    else if (L.k === 'neon') P.push((g, x, y) => { ctx.lineJoin = 'round'; ctx.strokeStyle = L.color; ctx.shadowColor = L.color; for (const [lw, bl] of [[.16, 1.1], [.1, .5], [.06, .2]]) { ctx.lineWidth = lw * px; ctx.shadowBlur = bl * px * sc * (L.blur || 1); ctx.strokeText(g.s, x, y); } ctx.shadowBlur = 0; });
    else if (L.k === 'ext3d') { const d = L.depth * px, a = (L.angle ?? 60) * Math.PI / 180, n = Math.max(2, Math.min(36, Math.ceil(d * sc / 1.1)));
      P.push((g, x, y) => { ctx.lineJoin = 'round'; ctx.lineWidth = (L.w || 0) * px; for (let i = n; i >= 1; i--) { const c = lerpC(L.colors[0], L.colors[1], i / n); ctx.fillStyle = ctx.strokeStyle = c; const X = x + Math.cos(a) * d * i / n, Y = y + Math.sin(a) * d * i / n; if (L.w) ctx.strokeText(g.s, X, Y); ctx.fillText(g.s, X, Y); } }); }
    else if (L.k === 'drip') P.push((g, x, y) => { const m = ctx.measureText(g.s).width; if (!m || g.s === ' ') return; ctx.fillStyle = L.color; const seed = (g.s.charCodeAt(0) || 1) + (g.i || 0) * 7, n = 1 + (hash(seed, 1) > .5 ? 1 : 0);
      const x0 = ctx.textAlign === 'center' ? x - m / 2 : ctx.textAlign === 'right' ? x - m : x;
      for (let k = 0; k < n; k++) { const dx = x0 + m * (.2 + .6 * hash(seed, k + 2)), len = px * (.25 + .45 * hash(seed, k + 5)), r = px * .07, top = y + px * .18;
        ctx.beginPath(); ctx.moveTo(dx - r, top); ctx.lineTo(dx - r, top + len); ctx.arc(dx, top + len, r * 1.25, Math.PI, 0, true); ctx.lineTo(dx + r, top); ctx.closePath(); ctx.fill(); } });
    else if (L.k === 'inline') P.push((g, x, y) => { ctx.lineJoin = 'round'; ctx.lineWidth = (L.w || .025) * px; ctx.strokeStyle = L.color; ctx.strokeText(g.s, x, y); });
    else if (L.k === 'hl') P.push((g, x, y) => { const gr = ctx.createLinearGradient(0, y - lh / 2, 0, y + lh * .1); gr.addColorStop(0, L.color || 'rgba(255,255,255,.7)'); gr.addColorStop(.55, 'rgba(255,255,255,0)'); ctx.fillStyle = gr; ctx.fillText(g.s, x, y); });
    else if (L.k === 'emboss') P.push((g, x, y) => { const d = .02 * px; ctx.lineWidth = .02 * px; ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.strokeText(g.s, x - d, y - d); ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.strokeText(g.s, x + d, y + d); });
    else if (L.k === 'spark') P.push((g, x, y) => { if (g.s === ' ') return; const seed = (g.s.charCodeAt(0) || 1) + (g.i || 0) * 3; if (hash(seed, 1) > .55) return; ctx.fillStyle = L.color || '#fff'; ctx.shadowColor = L.color || '#fff'; ctx.shadowBlur = px * .15 * sc; star(ctx, x + px * (hash(seed, 2) - .5) * .5, y - px * (.3 + .2 * hash(seed, 3)), px * .09); ctx.fill(); ctx.shadowBlur = 0; });
    else if (L.k === 'scan') P.push((g, x, y) => { ctx.fillStyle = L.color || 'rgba(0,0,0,.35)'; const m = ctx.measureText(g.s).width, x0 = ctx.textAlign === 'center' ? x - m / 2 : x; for (let k = -0.4; k < 0.4; k += 0.1) ctx.fillRect(x0, y + k * px, m, px * .025); });
  }
  return P;
}
/** Decorative element behind the text: sized to the text block (w x h). */
export function drawDeco(ctx, D, w, h, px) {
  if (!D) return; ctx.save(); ctx.shadowBlur = 0; const c1 = D.color || '#ffcc33', c2 = D.color2 || '#e01e37';
  const W = w + px * .9, H = h + px * .5;
  if (D.k === 'ribbon') { ctx.fillStyle = c2; for (const s of [-1, 1]) { ctx.beginPath(); const x0 = s * W / 2; ctx.moveTo(x0, -H * .3); ctx.lineTo(x0 + s * px * .7, -H * .3); ctx.lineTo(x0 + s * px * .45, 0); ctx.lineTo(x0 + s * px * .7, H * .3); ctx.lineTo(x0, H * .3); ctx.fill(); }
    ctx.fillStyle = c1; ctx.fillRect(-W / 2, -H * .42, W, H * .84); }
  else if (D.k === 'badge') { ctx.fillStyle = c1; ctx.beginPath(); const R = Math.max(W, H) * .58; for (let k = 0; k < 32; k++) { const a = k * Math.PI / 16, r = k % 2 ? R * .9 : R; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r * Math.min(1, H / W * 1.6)); } ctx.fill(); ctx.strokeStyle = c2; ctx.lineWidth = px * .06; ctx.stroke(); }
  else if (D.k === 'burst') { ctx.fillStyle = c1; ctx.strokeStyle = c2; ctx.lineWidth = px * .08; ctx.beginPath(); for (let k = 0; k < 24; k++) { const a = k * Math.PI / 12, r = k % 2 ? .62 : 1 + .15 * hash(k, 1); ctx.lineTo(Math.cos(a) * W * .62 * r, Math.sin(a) * H * .95 * r); } ctx.closePath(); ctx.fill(); ctx.stroke(); }
  else if (D.k === 'frame') { ctx.strokeStyle = c1; ctx.lineWidth = px * .07; ctx.strokeRect(-W / 2, -H / 2, W, H); ctx.lineWidth = px * .025; ctx.strokeRect(-W / 2 - px * .14, -H / 2 - px * .14, W + px * .28, H + px * .28); }
  else if (D.k === 'swipe') { ctx.fillStyle = c1; ctx.beginPath(); ctx.moveTo(-W / 2, -H * .05); ctx.quadraticCurveTo(0, -H * .3, W / 2 + px * .2, -H * .12); ctx.lineTo(W / 2, H * .38); ctx.quadraticCurveTo(0, H * .2, -W / 2 - px * .2, H * .42); ctx.closePath(); ctx.fill(); }
  else if (D.k === 'stars') { ctx.fillStyle = c1; for (const [sx, sy, r] of [[-.55, -.55, .22], [.56, -.5, .16], [.6, .45, .2], [-.6, .5, .13], [0, -.75, .1]]) { star(ctx, sx * W, sy * H, r * px); ctx.fill(); } }
  else if (D.k === 'sparkles') { ctx.fillStyle = c1; ctx.shadowColor = c1; ctx.shadowBlur = px * .2; for (const [sx, sy, r] of [[-.58, -.45, .16], [.55, -.6, .2], [.6, .5, .12], [-.5, .55, .1]]) { const X = sx * W, Y = sy * H, R = r * px; ctx.beginPath(); ctx.moveTo(X, Y - R); ctx.quadraticCurveTo(X, Y, X + R, Y); ctx.quadraticCurveTo(X, Y, X, Y + R); ctx.quadraticCurveTo(X, Y, X - R, Y); ctx.quadraticCurveTo(X, Y, X, Y - R); ctx.fill(); } }
  else if (D.k === 'bar') { ctx.fillStyle = c1; ctx.fillRect(-W / 2, H * .3, W, px * .14); ctx.fillRect(-W / 2, -H * .3 - px * .14, W, px * .14); }
  else if (D.k === 'pill') { ctx.fillStyle = c1; ctx.beginPath(); const r = H / 2; ctx.moveTo(-W / 2 + r, -H / 2); ctx.arcTo(W / 2, -H / 2, W / 2, H / 2, r); ctx.arcTo(W / 2, H / 2, -W / 2, H / 2, r); ctx.arcTo(-W / 2, H / 2, -W / 2, -H / 2, r); ctx.arcTo(-W / 2, -H / 2, W / 2, -H / 2, r); ctx.fill(); if (D.color2) { ctx.strokeStyle = c2; ctx.lineWidth = px * .05; ctx.stroke(); } }
  else if (D.k === 'hearts') { ctx.fillStyle = c1; for (const [sx, sy, r] of [[-.6, -.5, .2], [.6, -.45, .16], [.55, .55, .12]]) { const X = sx * W, Y = sy * H, R = r * px; ctx.beginPath(); ctx.moveTo(X, Y + R); ctx.bezierCurveTo(X - R * 2, Y - R * .4, X - R * .6, Y - R * 1.6, X, Y - R * .5); ctx.bezierCurveTo(X + R * .6, Y - R * 1.6, X + R * 2, Y - R * .4, X, Y + R); ctx.fill(); } }
  else if (D.k === 'cross') { ctx.fillStyle = c1; const s = px * .5; ctx.fillRect(-s * .12, -H / 2 - s * 1.1, s * .24, s); ctx.fillRect(-s * .35, -H / 2 - s * .85, s * .7, s * .22); ctx.shadowColor = c1; ctx.shadowBlur = px * .3; ctx.fillRect(-s * .12, -H / 2 - s * 1.1, s * .24, s); }
  ctx.restore();
}

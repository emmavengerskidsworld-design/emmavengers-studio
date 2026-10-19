/* Overlay library: 176 of our own procedural overlay elements (made in code, so they are ours, CC0, and look exactly the
   same in the preview and in the export — no files to download). Each element draws one frame for a local time t into a
   full-frame layer; the clip then goes through the normal pipeline (position / scale / opacity / keyframes / effects)
   with its preset blend mode (screen for light, normal for graphics, green-screen elements come with the colour key on). */

const TAU = Math.PI * 2;
const fract = x => x - Math.floor(x);
const hash = (i, s = 0) => fract(Math.sin(i * 127.1 + s * 311.7 + 74.7) * 43758.5453);
const ease = x => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3);
const back = x => { x = Math.max(0, Math.min(1, x)); const c = 1.9; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };
const rgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
const PAL = {
  warm: ['#ff9a3c', '#ff4e50', '#ffd35c'], cool: ['#4fc3ff', '#7b5cff', '#7dffd8'], pink: ['#ff5fa2', '#ffb3d1', '#ff8e53'], gold: ['#ffd700', '#ffae00', '#fff1a8'],
  sunset: ['#ff6b6b', '#ffa94d', '#c56cf0'], ocean: ['#00c2ff', '#00ffa3', '#2f6bff'], fire: ['#ff3d00', '#ff9100', '#ffea00'], ice: ['#e0f7ff', '#8fd3ff', '#ffffff'],
  purple: ['#b06cff', '#ff6cf0', '#6c8bff'], green: ['#3ddc84', '#b4ff6c', '#00e5c7'], mono: ['#ffffff', '#e8e8e8', '#cfcfcf'], rainbow: ['#ff4d4d', '#ffb020', '#ffe600', '#3ddc84', '#4fa3ff', '#b57bff'],
};
const PN = Object.keys(PAL);
const black = (x, W, H) => { x.fillStyle = '#000'; x.fillRect(0, 0, W, H); };
function glow(x, cx, cy, r, col, a) { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0)); x.fillStyle = g; x.fillRect(cx - r, cy - r, r * 2, r * 2); }
function star4(x, cx, cy, r) { x.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, rr = i % 2 ? r * .22 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); x.fill(); }
function heart(x, cx, cy, s) { x.beginPath(); x.moveTo(cx, cy + s * .35); x.bezierCurveTo(cx - s * 1.1, cy - s * .35, cx - s * .45, cy - s * 1.05, cx, cy - s * .45); x.bezierCurveTo(cx + s * .45, cy - s * 1.05, cx + s * 1.1, cy - s * .35, cx, cy + s * .35); x.fill(); }
function rrect(x, a, b, w, h, r) { x.beginPath(); x.moveTo(a + r, b); x.arcTo(a + w, b, a + w, b + h, r); x.arcTo(a + w, b + h, a, b + h, r); x.arcTo(a, b + h, a, b, r); x.arcTo(a, b, a + w, b, r); x.closePath(); }
const font = (px, w = 900) => `${w} ${Math.round(px)}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
const emojiFont = px => `${Math.round(px)}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;

/* ---------- families ---------- */
const F = {
  leak(x, W, H, t, D, v) { black(x, W, H); const P = PAL[v.pal], m = Math.max(W, H); x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) { const sp = v.speed * (0.6 + i * .25), ph = hash(i, v.seed) * TAU;
      const cx = W * (v.side === 'left' ? .05 : v.side === 'right' ? .95 : .5) + W * .45 * Math.sin(t * sp + ph), cy = H * (.2 + .6 * hash(i + 4, v.seed)) + H * .25 * Math.cos(t * sp * .7 + ph);
      glow(x, cx, cy, m * (.45 + .2 * Math.sin(t * sp * 1.3 + i)), P[i % P.length], .55 + .3 * Math.sin(t * sp * 2 + ph)); }
    x.globalCompositeOperation = 'source-over'; },
  bokeh(x, W, H, t, D, v) { black(x, W, H); const P = PAL[v.pal]; x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < v.n; i++) { const r = Math.min(W, H) * (v.big ? .06 + .1 * hash(i, 3 + v.seed) : .025 + .06 * hash(i, 3 + v.seed)), sp = .02 + .05 * hash(i, 5);
      const cx = W * fract(hash(i, v.seed) + Math.sin(t * .3 + i) * .03), cy = H * fract(hash(i, 9 + v.seed) - t * sp * v.speed), a = .25 + .35 * (0.5 + 0.5 * Math.sin(t * 1.5 + i * 2.1));
      const g = x.createRadialGradient(cx, cy, r * .2, cx, cy, r); const c = P[i % P.length]; g.addColorStop(0, rgba(c, a)); g.addColorStop(.8, rgba(c, a * .8)); g.addColorStop(1, rgba(c, 0)); x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill(); }
    x.globalCompositeOperation = 'source-over'; },
  smoke(x, W, H, t, D, v) { black(x, W, H); const c = v.tint; x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 16; i++) { const r = Math.max(W, H) * (.18 + .2 * hash(i, 2 + v.seed)), sp = (.015 + .03 * hash(i, 7)) * v.speed;
      const cx = W * (fract(hash(i, v.seed) + t * sp * (v.dir || 1)) * 1.6 - .3), cy = H * (v.low ? .55 + .45 * hash(i, 11) : hash(i, 11)) + Math.sin(t * .4 + i) * H * .03;
      glow(x, cx, cy, r, c, v.a * (0.6 + 0.4 * Math.sin(t * .5 + i))); }
    x.globalCompositeOperation = 'source-over'; },
  dust(x, W, H, t, D, v) { black(x, W, H); const f = Math.floor(t * 12), u = Math.min(W, H); x.fillStyle = v.col; x.strokeStyle = v.col;
    for (let i = 0; i < v.n; i++) { if (hash(i, f) > .35) continue; const cx = W * hash(i, f + 1), cy = H * hash(i, f + 2), r = u * (.001 + .004 * hash(i, f + 3)); x.globalAlpha = .4 + .6 * hash(i, f + 4); x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill(); }
    for (let i = 0; i < v.hairs; i++) { if (hash(i, f * 3) > .3) continue; const cx = W * hash(i, f + 5), cy = H * hash(i, f + 6), L = u * (.02 + .05 * hash(i, f + 7)); x.globalAlpha = .7; x.lineWidth = Math.max(1, u * .0015); x.beginPath(); x.moveTo(cx, cy); x.quadraticCurveTo(cx + L * .6, cy - L * .4, cx + L, cy + L * .3 * (hash(i, f) - .5)); x.stroke(); }
    for (let i = 0; i < v.scratches; i++) { const sx = W * fract(hash(i, Math.floor(t * 3) + v.seed) + Math.sin(t * 7 + i) * .002); x.globalAlpha = .35 + .3 * hash(i, f); x.fillRect(sx, 0, Math.max(1, u * .0018), H); }
    x.globalAlpha = 1; },
  burn(x, W, H, t, D, v) { black(x, W, H); const k = Math.sin(Math.PI * Math.min(1, t / D)), m = Math.max(W, H), P = PAL[v.pal], [ax, ay] = v.at; x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) { const cx = W * ax + Math.sin(t * 3 + i * 1.7) * W * .08, cy = H * ay + Math.cos(t * 2.3 + i) * H * .06; glow(x, cx, cy, m * (.15 + .55 * k) * (1 - i * .12), P[i % P.length], .9 * k); }
    glow(x, W * ax, H * ay, m * .35 * k, '#ffffff', .8 * k * k); x.globalCompositeOperation = 'source-over'; },
  sparkle(x, W, H, t, D, v) { black(x, W, H); const P = PAL[v.pal], u = Math.min(W, H); x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < v.n; i++) { const ph = hash(i, v.seed) * TAU, tw = Math.max(0, Math.sin(t * (2 + 3 * hash(i, 4)) * v.speed + ph)), cx = W * hash(i, 1 + v.seed), cy = H * fract(hash(i, 2 + v.seed) + (v.fall ? t * .05 * hash(i, 8) : 0));
      if (tw < .05) continue; const r = u * (v.glitter ? .006 : .02 + .03 * hash(i, 6)) * tw, c = P[i % P.length]; glow(x, cx, cy, r * 3, c, .5 * tw); x.fillStyle = rgba(c, 1); if (v.glitter) { x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill(); } else star4(x, cx, cy, r); }
    x.globalCompositeOperation = 'source-over'; },
  rain(x, W, H, t, D, v) { black(x, W, H); const u = Math.min(W, H), ang = v.angle; x.strokeStyle = rgba('#cfe8ff', v.a); x.lineCap = 'round';
    for (let i = 0; i < v.n; i++) { const sp = 1.4 + hash(i, 2) * 1.2, L = H * (.03 + .05 * hash(i, 3)), p = fract(hash(i, v.seed) + t * sp), cx = W * (hash(i, 1 + v.seed) * 1.3 - .15) + p * H * ang, cy = p * (H + L) - L;
      x.lineWidth = Math.max(1, u * (.0015 + .002 * hash(i, 5))); x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + L * ang, cy + L); x.stroke(); }
    if (v.storm) { const f = Math.floor(t * 8); if (hash(f, 99) > .93) { x.fillStyle = 'rgba(220,230,255,.55)'; x.fillRect(0, 0, W, H); } } },
  snow(x, W, H, t, D, v) { black(x, W, H); const u = Math.min(W, H); x.fillStyle = '#fff';
    for (let i = 0; i < v.n; i++) { const r = u * (v.size * (.004 + .01 * hash(i, 3))), sp = (.05 + .1 * hash(i, 2)) * v.speed, cy = H * fract(hash(i, v.seed) + t * sp) * 1.1 - H * .05, cx = W * hash(i, 1 + v.seed) + Math.sin(t * (1 + hash(i, 4)) + i) * u * .03 + (v.wind || 0) * t * W * .05;
      x.globalAlpha = .55 + .45 * hash(i, 6); x.beginPath(); x.arc(((cx % W) + W) % W, cy, r, 0, TAU); x.fill(); }
    x.globalAlpha = 1; },
  confetti(x, W, H, t, D, v) { const P = PAL[v.pal], u = Math.min(W, H);
    for (let i = 0; i < v.n; i++) { let cx, cy; const s = u * (.012 + .012 * hash(i, 4)), rot = t * (3 + 5 * hash(i, 5)) + i, fl = Math.cos(t * (4 + 4 * hash(i, 6)) + i);
      if (v.burst) { const a = -Math.PI / 2 + (hash(i, 1) - .5) * 1.6, sp = H * (1.1 + .7 * hash(i, 2)), tt = t * .9; cx = W * .5 + Math.cos(a) * sp * tt * .45 + Math.sin(t * 2 + i) * u * .02; cy = H * 1.02 + Math.sin(a) * sp * tt + H * 1.2 * tt * tt; }
      else { cx = W * hash(i, v.seed) + Math.sin(t * 1.5 + i) * u * .04; cy = H * fract(hash(i, 3 + v.seed) + t * (.12 + .1 * hash(i, 7))) * 1.1 - H * .05; }
      if (cy > H + s * 2 || cy < -H) continue; x.save(); x.translate(cx, cy); x.rotate(rot); x.scale(1, Math.max(.15, Math.abs(fl))); x.fillStyle = P[i % P.length];
      if (v.shape === 'circle' || (v.shape === 'mix' && i % 3 === 0)) { x.beginPath(); x.arc(0, 0, s * .6, 0, TAU); x.fill(); } else if (v.shape === 'star') star4(x, 0, 0, s); else x.fillRect(-s * .5, -s * .25, s, s * .5); x.restore(); } },
  frame(x, W, H, t, D, v) { const u = Math.min(W, H), m = u * v.m, P = PAL[v.pal];
    x.lineJoin = 'round';
    if (v.kind === 'round' || v.kind === 'neon') { x.lineWidth = u * v.w; const fl = v.kind === 'neon' ? (.75 + .25 * Math.sin(t * 9) * Math.sin(t * 3.7)) : 1; if (v.kind === 'neon') { const lw = x.lineWidth; for (const [k, a] of [[5, .12], [3, .22]]) { x.lineWidth = lw * k; x.strokeStyle = rgba(P[0], a * fl); rrect(x, m, m, W - 2 * m, H - 2 * m, u * .06); x.stroke(); } x.lineWidth = lw; }
      x.lineWidth *= 1 + .3 * Math.sin(t * 2); x.strokeStyle = v.kind === 'neon' ? rgba(P[0], fl) : P[0]; rrect(x, m, m, W - 2 * m, H - 2 * m, u * .06); x.stroke(); x.shadowBlur = 0; }
    else if (v.kind === 'ants') { x.lineWidth = u * v.w; x.setLineDash([u * .04, u * .03]); x.lineDashOffset = -t * u * .15; x.strokeStyle = P[0]; rrect(x, m, m, W - 2 * m, H - 2 * m, u * .03); x.stroke(); x.setLineDash([]); }
    else if (v.kind === 'gradient') { const g = x.createLinearGradient(0, 0, W, H), o = fract(t * .2); P.forEach((c, i) => g.addColorStop(fract(i / P.length + o), c)); x.fillStyle = g; x.beginPath(); x.rect(0, 0, W, H); rrect(x, m + u * v.w, m + u * v.w, W - 2 * (m + u * v.w), H - 2 * (m + u * v.w), u * .05); x.fill('evenodd'); }
    else if (v.kind === 'film') { x.fillStyle = '#111'; const bw = u * .1; x.fillRect(0, 0, bw, H); x.fillRect(W - bw, 0, bw, H); x.fillStyle = '#eee'; const hh = u * .035, step = hh * 2, off = (t * step * 1.7) % step;
      for (let y = -step + off; y < H; y += step) { rrect(x, bw * .3, y, bw * .4, hh, hh * .2); x.fill(); rrect(x, W - bw * .7, y, bw * .4, hh, hh * .2); x.fill(); } }
    else if (v.kind === 'polaroid') { x.fillStyle = '#fbfaf5'; x.beginPath(); x.rect(0, 0, W, H); x.rect(u * .06, u * .06, W - u * .12, H - u * .3); x.fill('evenodd'); x.fillStyle = '#555'; x.font = font(u * .06, 700); x.textAlign = 'center'; x.globalAlpha = .75 + .25 * Math.sin(t * 2); x.fillText(v.label || 'memories', W / 2, H - u * (.1 + .01 * Math.sin(t * 3))); x.globalAlpha = 1; }
    else if (v.kind === 'hearts' || v.kind === 'stars') { x.fillStyle = P[0]; const n = Math.round((W + H) * 2 / (u * .09)), per = 2 * (W + H);
      for (let i = 0; i < n; i++) { let d = fract(i / n + t * .03) * per, px, py; if (d < W) { px = d; py = m; } else if ((d -= W) < H) { px = W - m; py = d; } else if ((d -= H) < W) { px = W - d; py = H - m; } else { px = m; py = H - (d - W); }
        x.fillStyle = P[i % P.length]; const s = u * .03 * (1 + .25 * Math.sin(t * 4 + i)); if (v.kind === 'hearts') heart(x, px, py, s); else star4(x, px, py, s * 1.3); } }
    else if (v.kind === 'comic') { x.lineWidth = u * .025; x.strokeStyle = '#111'; x.fillStyle = P[0]; x.globalAlpha = .8 + .2 * Math.sin(t * 2); x.beginPath(); x.rect(0, 0, W, H); x.rect(m, m, W - 2 * m, H - 2 * m); x.fill('evenodd'); x.globalAlpha = 1; x.strokeRect(m, m, W - 2 * m, H - 2 * m);
      x.fillStyle = 'rgba(0,0,0,.25)'; for (let yy = 0; yy < m; yy += u * .018) for (let xx = (yy / (u * .018)) % 2 ? u * .009 : 0; xx < W; xx += u * .018) { x.beginPath(); x.arc(xx, yy, u * .004 * (1 + .3 * Math.sin(t * 3)), 0, TAU); x.fill(); x.beginPath(); x.arc(xx, H - yy, u * .004 * (1 + .3 * Math.sin(t * 3)), 0, TAU); x.fill(); } }
    else if (v.kind === 'vignette') { const g = x.createRadialGradient(W / 2, H / 2, u * (.25 + .12 * Math.sin(t * 1.5)), W / 2, H / 2, Math.hypot(W, H) * .6); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, rgba(v.col || '#000000', .85)); x.fillStyle = g; x.fillRect(0, 0, W, H); }
    else if (v.kind === 'corners') { x.strokeStyle = P[0]; x.lineWidth = u * v.w; const L = u * .16 * (1 + .08 * Math.sin(t * 3)); for (const [sx, sy] of [[m, m], [W - m, m], [m, H - m], [W - m, H - m]]) { const dx = sx < W / 2 ? 1 : -1, dy = sy < H / 2 ? 1 : -1; x.beginPath(); x.moveTo(sx, sy + dy * L); x.lineTo(sx, sy); x.lineTo(sx + dx * L, sy); x.stroke(); }
      x.fillStyle = '#ff3b3b'; if (Math.sin(t * 5) > 0) { x.beginPath(); x.arc(m + u * .06, m + u * .07, u * .018, 0, TAU); x.fill(); x.font = font(u * .04, 800); x.fillText('REC', m + u * .1, m + u * .085); } } },
  countdown(x, W, H, t, D, v) { const N = v.n, i = Math.min(N - 1, Math.floor(t / D * N)), num = N - i, f = fract(t / D * N), u = Math.min(W, H), cx = W / 2, cy = H / 2;
    if (v.style === 'leader') { x.fillStyle = '#9a9a9a'; x.fillRect(0, 0, W, H); x.fillStyle = '#5a5a5a'; x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, Math.hypot(W, H), -Math.PI / 2, -Math.PI / 2 + f * TAU); x.fill();
      x.strokeStyle = '#222'; x.lineWidth = u * .012; x.beginPath(); x.moveTo(0, cy); x.lineTo(W, cy); x.moveTo(cx, 0); x.lineTo(cx, H); x.stroke(); for (const r of [.3, .38]) { x.beginPath(); x.arc(cx, cy, u * r, 0, TAU); x.stroke(); }
      x.fillStyle = '#111'; x.font = font(u * .42); x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(num, cx, cy + u * .02); return; }
    const P = PAL[v.pal]; x.textAlign = 'center'; x.textBaseline = 'middle';
    if (v.dim) { x.fillStyle = 'rgba(0,0,0,.45)'; x.fillRect(0, 0, W, H); }
    if (v.style === 'ring') { x.lineWidth = u * .03; x.strokeStyle = 'rgba(255,255,255,.25)'; x.beginPath(); x.arc(cx, cy, u * .3, 0, TAU); x.stroke(); x.strokeStyle = P[0]; x.lineCap = 'round'; x.beginPath(); x.arc(cx, cy, u * .3, -Math.PI / 2, -Math.PI / 2 + (1 - f) * TAU); x.stroke(); x.fillStyle = '#fff'; x.font = font(u * .3); x.fillText(num, cx, cy + u * .015); }
    else if (v.style === 'pop') { const s = back(f * 3) * (1 - ease((f - .75) * 4) * .4); x.save(); x.translate(cx, cy); x.scale(s, s); x.fillStyle = P[i % P.length]; x.strokeStyle = '#111'; x.lineWidth = u * .03; x.font = font(u * .5); x.strokeText(num, 0, u * .02); x.fillText(num, 0, u * .02); x.restore(); }
    else if (v.style === 'neon') { const fl = .8 + .2 * Math.sin(t * 30); x.shadowColor = P[0]; x.shadowBlur = u * .06; x.strokeStyle = rgba(P[0], fl); x.lineWidth = u * .012; x.font = font(u * .45, 800); x.strokeText(num, cx, cy); x.shadowBlur = 0; }
    else { x.globalAlpha = 1 - ease((f - .6) * 2.5); x.fillStyle = '#fff'; x.font = font(u * .4, 300); x.fillText(num, cx, cy); x.globalAlpha = 1; } },
  green(x, W, H, t, D, v) { x.fillStyle = '#00ff00'; x.fillRect(0, 0, W, H); const u = Math.min(W, H), cx = W / 2, cy = H * (v.y ?? .5), k = back(t * 2.5);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    if (v.kind === 'subscribe') { const clicked = t > D * .45, bw = u * .62, bh = u * .16, s = k * (clicked && t < D * .45 + .15 ? .92 : 1); x.save(); x.translate(cx, cy); x.scale(s, s);
      x.fillStyle = clicked ? '#606060' : v.col; rrect(x, -bw / 2, -bh / 2, bw, bh, bh * .25); x.fill(); x.fillStyle = '#fff'; x.font = font(bh * .42, 800); x.fillText(clicked ? v.done : v.label, clicked && v.bell ? -bh * .3 : 0, bh * .03);
      if (clicked && v.bell) { x.font = emojiFont(bh * .5); x.save(); x.translate(bw / 2 - bh * .55, 0); x.rotate(Math.sin(t * 25) * .35 * Math.max(0, 1 - (t - D * .45))); x.fillText('🔔', 0, 0); x.restore(); }
      x.restore(); const hp = Math.min(1, t / (D * .4)), hx = cx + u * .5 * (1 - ease(hp)) + u * .1, hy = cy + u * .35 * (1 - ease(hp)) + u * .06; x.font = emojiFont(u * .12); x.fillText('👆', hx, hy); }
    else if (v.kind === 'emoji') { const s = back(t * 2.2) * (1 + .06 * Math.sin(t * 6)); x.font = emojiFont(u * .38 * s); x.fillText(v.e, cx, cy);
      if (t < 1.2) { x.fillStyle = v.col || '#ffd700'; for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, r = u * (.18 + .3 * ease(t / 1.2)); x.globalAlpha = 1 - t / 1.2; star4(x, cx + Math.cos(a) * r, cy + Math.sin(a) * r, u * .03); } x.globalAlpha = 1; } }
    else if (v.kind === 'arrow') { const b = Math.sin(t * 6) * u * .05, [dx, dy] = v.dir; x.save(); x.translate(cx + dx * b, cy + dy * b); x.rotate(Math.atan2(dy, dx)); x.scale(k, k); x.fillStyle = v.col; x.strokeStyle = '#111'; x.lineWidth = u * .015;
      const L = u * .36, w = u * .08; x.beginPath(); x.moveTo(-L / 2, -w / 2); x.lineTo(L * .1, -w / 2); x.lineTo(L * .1, -w * 1.4); x.lineTo(L / 2, 0); x.lineTo(L * .1, w * 1.4); x.lineTo(L * .1, w / 2); x.lineTo(-L / 2, w / 2); x.closePath(); x.fill(); x.stroke(); x.restore(); }
    else if (v.kind === 'curved') { const p = ease(t * 1.2); x.translate(Math.sin(t * 5) * u * .02, 0); x.strokeStyle = v.col; x.lineWidth = u * .035; x.lineCap = 'round'; const a0 = Math.PI * .9, a1 = a0 + Math.PI * 1.1 * p, r = u * .25; x.beginPath(); x.arc(cx, cy, r, a0, a1); x.stroke();
      const ex = cx + Math.cos(a1) * r, ey = cy + Math.sin(a1) * r, ta = a1 + Math.PI / 2; x.fillStyle = v.col; x.beginPath(); x.moveTo(ex + Math.cos(ta) * u * .07, ey + Math.sin(ta) * u * .07); x.lineTo(ex + Math.cos(ta + 2.4) * u * .06, ey + Math.sin(ta + 2.4) * u * .06); x.lineTo(ex + Math.cos(ta - 2.4) * u * .06, ey + Math.sin(ta - 2.4) * u * .06); x.fill(); }
    else if (v.kind === 'burst') { const s = back(t * 2.5); x.save(); x.translate(cx, cy); x.rotate(Math.sin(t * 2) * .08); x.scale(s, s); x.fillStyle = v.col; x.beginPath(); for (let i = 0; i < 24; i++) { const a = i / 24 * TAU, r = i % 2 ? u * .2 : u * .3; x.lineTo(Math.cos(a) * r, Math.sin(a) * r); } x.closePath(); x.fill();
      x.lineWidth = u * .012; x.strokeStyle = '#111'; x.stroke(); x.fillStyle = '#fff'; x.font = font(u * .12); x.strokeText(v.label, 0, u * .01); x.fillText(v.label, 0, u * .01); x.restore(); }
    else if (v.kind === 'like') { const s = back(t * 2.5), liked = t > D * .4; x.save(); x.translate(cx, cy); x.scale(s, s); x.fillStyle = liked ? v.col : '#fff'; x.beginPath(); x.arc(0, 0, u * .18, 0, TAU); x.fill(); x.font = emojiFont(u * .2 * (liked && t < D * .4 + .25 ? 1.25 : 1)); x.fillText(v.e, 0, u * .01); x.restore();
      if (liked) { x.fillStyle = '#fff'; x.font = font(u * .07); x.fillText(v.count, cx, cy + u * .27); } } },
  rays(x, W, H, t, D, v) { black(x, W, H); const [ox, oy] = v.at, P = PAL[v.pal], R = Math.hypot(W, H) * 1.2; x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 9; i++) { const a = (i / 9 - .5) * 1.4 + Math.sin(t * .4 * v.speed + i) * .05 + Math.atan2(H * .5 - H * oy, W * .5 - W * ox), w = .03 + .04 * hash(i, 3), al = .14 + .12 * Math.sin(t * 1.3 + i * 1.7);
      const g = x.createLinearGradient(W * ox, H * oy, W * ox + Math.cos(a) * R, H * oy + Math.sin(a) * R); g.addColorStop(0, rgba(P[i % P.length], al)); g.addColorStop(1, rgba(P[i % P.length], 0)); x.fillStyle = g;
      x.beginPath(); x.moveTo(W * ox, H * oy); x.lineTo(W * ox + Math.cos(a - w) * R, H * oy + Math.sin(a - w) * R); x.lineTo(W * ox + Math.cos(a + w) * R, H * oy + Math.sin(a + w) * R); x.fill(); }
    x.globalCompositeOperation = 'source-over'; },
  hearts(x, W, H, t, D, v) { const P = PAL[v.pal], u = Math.min(W, H);
    for (let i = 0; i < v.n; i++) { const sp = .08 + .1 * hash(i, 2), cy = H * (1.1 - fract(hash(i, v.seed) + t * sp) * 1.25), cx = W * hash(i, 1 + v.seed) + Math.sin(t * 2 + i) * u * .04, s = u * (.025 + .03 * hash(i, 3));
      x.globalAlpha = Math.min(1, (H * 1.1 - cy) / (H * .2)) * .9; x.fillStyle = P[i % P.length]; heart(x, cx, cy, s); } x.globalAlpha = 1; },
  bubbles(x, W, H, t, D, v) { const u = Math.min(W, H);
    for (let i = 0; i < v.n; i++) { const r = u * (.015 + .045 * hash(i, 3)), sp = .06 + .08 * hash(i, 2), cy = H * (1.1 - fract(hash(i, v.seed) + t * sp) * 1.25), cx = W * hash(i, 1 + v.seed) + Math.sin(t * 1.6 + i) * u * .03;
      x.lineWidth = Math.max(1, r * .08); x.strokeStyle = rgba(v.col, .7); x.fillStyle = rgba(v.col, .12); x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill(); x.stroke(); x.fillStyle = 'rgba(255,255,255,.75)'; x.beginPath(); x.arc(cx - r * .35, cy - r * .35, r * .18, 0, TAU); x.fill(); } },
  glitch(x, W, H, t, D, v) { black(x, W, H); const f = Math.floor(t * v.rate); x.globalCompositeOperation = 'lighter';
    for (let i = 0; i < v.n; i++) { if (hash(i, f) > .45) continue; const y = H * hash(i, f + 1), h = H * (.005 + .04 * hash(i, f + 2)), x0 = W * hash(i, f + 3) * .6, w = W * (.2 + .6 * hash(i, f + 4));
      x.fillStyle = ['rgba(255,0,60,.55)', 'rgba(0,255,220,.5)', 'rgba(255,255,255,.4)'][i % 3]; x.fillRect(x0, y, w, h); }
    if (v.scan) { x.fillStyle = 'rgba(255,255,255,.06)'; for (let y = (t * 40) % 4; y < H; y += 4) x.fillRect(0, y, W, 1); }
    x.globalCompositeOperation = 'source-over'; },
};

/* ---------- the library (176 elements) ---------- */
export const ELEMENT_CATS = [
  ['leak', 'Light leaks'], ['bokeh', 'Bokeh'], ['smoke', 'Smoke & fog'], ['dust', 'Dust & film'], ['burn', 'Film burns'], ['sparkle', 'Sparkles'], ['rain', 'Rain'], ['snow', 'Snow'],
  ['confetti', 'Confetti'], ['frame', 'Frames & borders'], ['countdown', 'Countdowns'], ['green', 'Green screen'], ['rays', 'Light rays'], ['hearts', 'Hearts'], ['bubbles', 'Bubbles'], ['glitch', 'Glitch'],
];
const L = [];
const add = (cat, name, blend, dur, v, extra = {}) => L.push({ id: `${cat}-${L.filter(e => e.cat === cat).length + 1}`, cat, name, blend, dur, v: { seed: L.length, ...v }, ...extra });
['warm', 'cool', 'pink', 'gold', 'sunset', 'ocean', 'fire', 'purple', 'green', 'ice', 'rainbow', 'mono'].forEach((pal, i) => add('leak', `${pal[0].toUpperCase() + pal.slice(1)} leak`, 'screen', 5, { pal, speed: .5 + (i % 3) * .3, side: ['left', 'right', 'mid'][i % 3] }));
PN.forEach((pal, i) => add('bokeh', `${pal[0].toUpperCase() + pal.slice(1)} bokeh${i % 2 ? ' big' : ''}`, 'screen', 6, { pal, n: i % 2 ? 14 : 26, big: i % 2 === 1, speed: 1 + (i % 3) * .5 }));
[['White fog', '#ffffff', .18], ['Low mist', '#dfe8ff', .2, 1], ['Warm haze', '#ffb070', .16], ['Blue smoke', '#6fa8ff', .2], ['Pink dream', '#ff8fd0', .17], ['Thick smoke', '#ffffff', .3], ['Green swamp', '#8fffb0', .15, 1], ['Purple mist', '#b98bff', .18], ['Fire smoke', '#ff7a3c', .22], ['Night fog', '#9aa3c7', .2, 1]]
  .forEach(([name, tint, a, low], i) => add('smoke', name, 'screen', 6, { tint, a, low: !!low, speed: 1 + (i % 3) * .6, dir: i % 2 ? -1 : 1 }));
[['Light dust', '#ffffff', 60, 2, 0], ['Heavy dust', '#ffffff', 160, 6, 1], ['Old film', '#fff2d6', 90, 4, 3], ['Scratches', '#ffffff', 20, 1, 5], ['Warm grain', '#ffd9a0', 120, 3, 1], ['Hair & dust', '#ffffff', 50, 10, 0], ['Silent movie', '#ffffff', 140, 8, 4], ['Soft specks', '#e8f0ff', 80, 0, 0], ['Projector', '#fff6e0', 100, 5, 2], ['Super 8', '#ffe2b8', 130, 4, 3]]
  .forEach(([name, col, n, hairs, scratches]) => add('dust', name, 'screen', 5, { col, n, hairs, scratches }));
[[.05, .1], [.95, .1], [.05, .9], [.95, .9], [.5, 0], [.5, 1], [0, .5], [1, .5], [.3, .3], [.7, .7]].forEach((at, i) => add('burn', `Film burn ${i + 1}`, 'screen', 2.5, { at, pal: ['fire', 'warm', 'gold', 'sunset', 'pink'][i % 5] }));
PN.forEach((pal, i) => add('sparkle', `${pal[0].toUpperCase() + pal.slice(1)} ${i % 3 === 2 ? 'glitter' : 'sparkles'}`, 'screen', 5, { pal, n: i % 3 === 2 ? 140 : 40, glitter: i % 3 === 2, fall: i % 2 === 1, speed: 1 + (i % 4) * .4 }));
[['Light rain', 90, .05, .35], ['Heavy rain', 260, .08, .5], ['Slanted rain', 160, .35, .45], ['Storm', 300, .25, .55, 1], ['Drizzle', 60, .02, .3], ['Windy rain', 200, -.4, .45], ['Night storm', 240, .15, .5, 1], ['Rain streaks', 120, .1, .7]]
  .forEach(([name, n, angle, a, storm]) => add('rain', name, 'screen', 5, { n, angle, a, storm: !!storm }));
[['Light snow', 70, 1, .8], ['Heavy snow', 220, 1.2, 1], ['Big flakes', 50, 2.2, .7], ['Blizzard', 300, 1, 1.8, .9], ['Gentle snow', 100, .9, .5], ['Windy snow', 160, 1.1, 1.2, -.7], ['Snow globe', 130, 1.6, .6], ['Tiny snow', 260, .6, .9]]
  .forEach(([name, n, size, speed, wind]) => add('snow', name, 'screen', 6, { n, size, speed, wind: wind || 0 }));
[['Party rain', 'rainbow', 0, 'rect'], ['Gold rain', 'gold', 0, 'rect'], ['Pink rain', 'pink', 0, 'mix'], ['Confetti cannon', 'rainbow', 1, 'rect'], ['Gold cannon', 'gold', 1, 'mix'], ['Dots rain', 'rainbow', 0, 'circle'], ['Star rain', 'gold', 0, 'star'], ['Ocean party', 'ocean', 0, 'mix'], ['Sunset cannon', 'sunset', 1, 'rect'], ['Purple party', 'purple', 0, 'rect'], ['Mint cannon', 'green', 1, 'circle'], ['Fire party', 'fire', 0, 'mix']]
  .forEach(([name, pal, burst, shape]) => add('confetti', name, 'normal', burst ? 3 : 5, { pal, burst: !!burst, shape, n: burst ? 140 : 90 }));
[['White border', 'round', 'mono', .03, .012], ['Gold border', 'round', 'gold', .04, .018], ['Neon pink', 'neon', 'pink', .05, .012], ['Neon blue', 'neon', 'ocean', .05, .012], ['Marching ants', 'ants', 'mono', .04, .01], ['Rainbow frame', 'gradient', 'rainbow', .0, .04], ['Sunset frame', 'gradient', 'sunset', .0, .035], ['Film strip', 'film', 'mono', 0, 0], ['Polaroid', 'polaroid', 'mono', 0, 0], ['Heart border', 'hearts', 'pink', .05, 0], ['Star border', 'stars', 'gold', .05, 0],
  ['Comic frame', 'comic', 'gold', .05, 0], ['Dark vignette', 'vignette', 'mono', 0, 0], ['Camera REC', 'corners', 'mono', .06, .01], ['Kids crayon', 'round', 'rainbow', .025, .03], ['Ocean frame', 'gradient', 'ocean', .0, .03]]
  .forEach(([name, kind, pal, m, w]) => add('frame', name, kind === 'vignette' ? 'multiply' : 'normal', 5, { kind, pal, m, w }));
[[3, 'pop', 'rainbow'], [3, 'ring', 'gold'], [3, 'leader', 'mono'], [5, 'pop', 'sunset'], [5, 'ring', 'ocean'], [5, 'neon', 'pink'], [10, 'ring', 'green'], [10, 'clean', 'mono'], [3, 'neon', 'ocean'], [5, 'leader', 'mono']]
  .forEach(([n, style, pal]) => add('countdown', `${n}…1 ${style}`, 'normal', n, { n, style, pal, dim: style !== 'leader' }));
const KEY = { on: true, color: '#00ff00', strength: 0.42, shadow: 0.3, spill: 0.6, feather: 0.15 };
const g = (name, v, dur = 3) => add('green', name, 'normal', dur, v, { key: KEY });
g('Subscribe red', { kind: 'subscribe', col: '#e62117', label: 'SUBSCRIBE', done: 'SUBSCRIBED', bell: 1 }, 4); g('Subscribe blue', { kind: 'subscribe', col: '#1e6bff', label: 'SUBSCRIBE', done: 'SUBSCRIBED', bell: 1 }, 4);
g('Follow pink', { kind: 'subscribe', col: '#ff2e7a', label: 'FOLLOW', done: 'FOLLOWING' }, 4); g('Join purple', { kind: 'subscribe', col: '#7b3cff', label: 'JOIN', done: 'JOINED' }, 4); g('Subscribe low', { kind: 'subscribe', col: '#e62117', label: 'SUBSCRIBE', done: 'SUBSCRIBED', bell: 1, y: .8 }, 4);
g('Like thumbs', { kind: 'like', e: '👍', col: '#1e6bff', count: '1.2K' }); g('Love heart', { kind: 'like', e: '❤️', col: '#ff2e55', count: '999' }); g('Star rating', { kind: 'like', e: '⭐', col: '#ffb020', count: '5.0' });
for (const [n, d] of [['right', [1, 0]], ['left', [-1, 0]], ['up', [0, -1]], ['down', [0, 1]], ['up-right', [.7, -.7]], ['down-left', [-.7, .7]]]) g(`Arrow ${n}`, { kind: 'arrow', dir: d, col: '#ffd400' });
g('Red arrow right', { kind: 'arrow', dir: [1, 0], col: '#ff3b3b' }); g('Blue arrow down', { kind: 'arrow', dir: [0, 1], col: '#3b8bff' }); g('Curved arrow', { kind: 'curved', col: '#ffd400' }); g('Curved red arrow', { kind: 'curved', col: '#ff3b3b' });
for (const e of ['😀', '😂', '😍', '🔥', '🎉', '😮', '🥳', '👏', '💯', '🌟']) g(`Emoji pop ${e}`, { kind: 'emoji', e }, 2.5);
g('WOW burst', { kind: 'burst', label: 'WOW!', col: '#ff3b8b' }); g('NEW burst', { kind: 'burst', label: 'NEW', col: '#ffb020' }); g('OMG burst', { kind: 'burst', label: 'OMG', col: '#3ddc84' }); g('SALE burst', { kind: 'burst', label: 'SALE', col: '#ff3b3b' });
[[[0, 0], 'gold'], [[1, 0], 'warm'], [[.5, -.1], 'ice'], [[0, 0], 'pink'], [[1, 0], 'ocean'], [[.5, -.1], 'gold'], [[0, .3], 'sunset'], [[1, .3], 'purple']].forEach(([at, pal], i) => add('rays', `Light rays ${i + 1}`, 'screen', 6, { at, pal, speed: 1 + (i % 3) * .5 }));
[['pink', 24], ['sunset', 30], ['purple', 20], ['fire', 26], ['rainbow', 34], ['ice', 18]].forEach(([pal, n], i) => add('hearts', `Floating hearts ${i + 1}`, 'normal', 5, { pal, n }));
[['#bfe9ff', 26], ['#ffffff', 34], ['#ffc8f0', 24], ['#c8ffd8', 30], ['#fff2a8', 22], ['#d0c8ff', 40]].forEach(([col, n], i) => add('bubbles', `Bubbles ${i + 1}`, 'normal', 6, { col, n }));
[[24, 14, 0], [40, 24, 1], [12, 10, 0], [60, 30, 1], [18, 18, 1], [30, 40, 0]].forEach(([rate, n, scan], i) => add('glitch', `Glitch bars ${i + 1}`, 'screen', 3, { rate, n, scan: !!scan }));

export const ELEMENTS = L;
export const elementById = id => L.find(e => e.id === id) || null;
/** Draw element `id` at local time t (seconds) for a clip that lasts D seconds into a W x H context. */
export function drawElement(x, W, H, id, t, D) {
  const e = elementById(id); if (!e) return false;
  x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = 1; x.globalCompositeOperation = 'source-over'; x.filter = 'none'; x.clearRect(0, 0, W, H);
  try { F[e.cat](x, W, H, Math.max(0, t), Math.max(.1, D || e.dur), e.v); } finally { x.restore(); }
  return true;
}

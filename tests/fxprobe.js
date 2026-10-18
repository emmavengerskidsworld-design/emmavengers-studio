/* In-page probes used by tests/test_anim.py (not part of the app). Imported with dynamic import() from the page. */
import { TRANSITIONS, helpers } from '../js/transitions.js';
const mk = (W, H) => Object.assign(document.createElement('canvas'), { width: W, height: H });
export function art(W, H, which) {
  const c = mk(W, H), x = c.getContext('2d');
  let g = x.createLinearGradient(0, 0, W, H);
  if (which) { g.addColorStop(0, '#3b5bff'); g.addColorStop(1, '#1fb6ff'); } else { g.addColorStop(0, '#ffcf3d'); g.addColorStop(1, '#ff7a1a'); }
  x.fillStyle = g; x.fillRect(0, 0, W, H);
  x.fillStyle = which ? '#ffffff' : '#7a3d00';
  for (let i = 0; i < 6; i++) for (let j = 0; j < 10; j++) if ((i + j) % 2 === which) x.fillRect(i * W / 6, j * H / 10, W / 12, H / 20);
  x.fillStyle = which ? '#ff5fa2' : '#3ddc84'; x.beginPath(); x.arc(W * (which ? .7 : .3), H * .4, W * .18, 0, 7); x.fill();
  return c;
}
export function mad(a, b) { let s = 0; for (let i = 0; i < a.length; i += 4) s += Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]); return s / (a.length / 4) / 3; }
export function probeTransitions(W = 90, H = 160) {
  const A = art(W, H, 0), B = art(W, H, 1), out = mk(W, H), x = out.getContext('2d', { willReadFrequently: true }), h = helpers();
  const px = c => c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, W, H).data, pa = px(A), pb = px(B), res = {}, errors = [];
  for (const T of TRANSITIONS) {
    const shot = p => { x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, W, H); T.render(x, A, B, p, W, H, h); x.restore(); return x.getImageData(0, 0, W, H).data; };
    try {
      const r0 = shot(0), r1 = shot(1), mids = [.25, .5, .75].map(shot);
      res[T.id] = { cat: T.cat, name: T.name, d0: mad(r0, pa), d1: mad(r1, pb), midA: Math.min(...mids.map(m => mad(m, pa))), midB: Math.min(...mids.map(m => mad(m, pb))), mid5A: mad(mids[1], pa), mid5B: mad(mids[1], pb) };
    } catch (e) { errors.push(T.id + ': ' + e.message); }
  }
  return { res, errors };
}
export function timeTransitions(W = 540, H = 960, reps = 3) {
  const A = art(W, H, 0), B = art(W, H, 1), out = mk(W, H), x = out.getContext('2d'), h = helpers(), t = {};
  for (const T of TRANSITIONS) { const t0 = performance.now(); for (let i = 0; i < reps; i++) T.render(x, A, B, (i + 1) / (reps + 1), W, H, h); x.getImageData(0, 0, 1, 1); t[T.id] = (performance.now() - t0) / reps; }
  return t;
}
/* contact sheet: rows = transitions, columns = progress steps (PNG data URL) */
export function sheetTransitions(ids, ps = [0, .2, .35, .5, .65, .8, 1], W = 72, H = 128) {
  const A = art(W, H, 0), B = art(W, H, 1), h = helpers(), list = TRANSITIONS.filter(t => !ids || ids.includes(t.id));
  const S = mk(ps.length * (W + 4) + 110, list.length * (H + 4)), sx = S.getContext('2d'), cell = mk(W, H), cx = cell.getContext('2d');
  sx.fillStyle = '#222'; sx.fillRect(0, 0, S.width, S.height); sx.font = '12px sans-serif'; sx.fillStyle = '#fff';
  list.forEach((T, r) => { sx.fillText(T.id, 4, r * (H + 4) + H / 2); ps.forEach((p, c) => { cx.save(); cx.clearRect(0, 0, W, H); T.render(cx, A, B, p, W, H, h); cx.restore(); sx.drawImage(cell, 110 + c * (W + 4), r * (H + 4)); }); });
  return S.toDataURL('image/png');
}

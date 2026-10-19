/* Overlay library sheet: 178 of our own procedural elements in 16 groups. Tap one to drop it on the Overlay track at the
   playhead, full frame, with its preset blend mode (and the green-screen key already on for green-screen elements). */
import { openSheet, chips } from './panels.js';
import { ELEMENTS, ELEMENT_CATS, elementById, drawElement } from './elements.js';
import { BLEND_MODES, KEY_DEFAULTS } from './pro.js';

const tileBg = (x, W, H, e) => { if (e.blend === 'screen') { x.fillStyle = '#000'; x.fillRect(0, 0, W, H); return; }
  const s = Math.max(4, Math.round(W / 8)); for (let y = 0; y < H; y += s) for (let i = 0; i < W; i += s) { x.fillStyle = ((i + y) / s) % 2 ? '#3a3f4b' : '#2a2e37'; x.fillRect(i, y, s, s); } };
/** Draw one library tile (a frame from the middle of the element). */
export function drawTile(cv, e, t) {
  const W = cv.width, H = cv.height, x = cv.getContext('2d'), L = drawTile.L || (drawTile.L = document.createElement('canvas')); L.width = W; L.height = H;
  drawElement(L.getContext('2d'), W, H, e.id, t ?? e.dur * .5, e.dur); x.clearRect(0, 0, W, H); tileBg(x, W, H, e);
  x.save(); x.globalCompositeOperation = e.blend === 'screen' ? 'screen' : e.blend === 'multiply' ? 'multiply' : 'source-over'; x.drawImage(L, 0, 0); x.restore();
}
/** Build the clip for element `id` (plain data — same object in preview and export). */
export function elementClip(newClip, DEFAULT_TRANSFORM, id) {
  const e = elementById(id); if (!e) return null;
  const c = newClip('element', { dur: e.dur, element: { id }, name: e.name, fit: 'cover', transform: { ...DEFAULT_TRANSFORM } });
  if (e.blend && e.blend !== 'normal') c.blend = e.blend;
  if (e.key) c.key = { ...KEY_DEFAULTS, ...e.key, on: true };
  return c;
}
export function addElement(ctx, id, at) {
  const { act, newClip, addToKind, DEFAULT_TRANSFORM, player } = ctx; let made = null;
  act(p => { made = elementClip(newClip, DEFAULT_TRANSFORM, id); if (made) addToKind(p, 'overlay', made, at ?? player.t); }, 'Add element');
  return made;
}
export function elementsSheet(ctx) {
  const { player, select, timeline, toast, act } = ctx;
  openSheet('Elements', body => {
    let cat = ELEMENT_CATS[0][0], last = null;
    const hint = Object.assign(document.createElement('p'), { className: 'hint', id: 'elHint', textContent: `${ELEMENTS.length} overlay elements, all made by Emmavengers Studio. Tap to add at the playhead. Light effects use Screen blend; green-screen ones come keyed.` });
    const tabs = chips(ELEMENT_CATS.map(([value, label]) => ({ value, label: `${label} <i>${ELEMENTS.filter(e => e.cat === value).length}</i>` })), cat, v => { cat = v; fill(); }, 'tabs elcats');
    const dpr = Math.min(2, devicePixelRatio || 1), TW = Math.round(54 * dpr), TH = Math.round(96 * dpr);
    const grid = document.createElement('div'); grid.className = 'trgrid elgrid'; grid.id = 'elGrid';
    const blendRow = document.createElement('div'); blendRow.className = 'elblend'; blendRow.id = 'elBlend'; blendRow.hidden = true;
    let job = 0;
    function fill() {
      grid.innerHTML = ''; const my = ++job, list = ELEMENTS.filter(e => e.cat === cat);
      for (const e of list) { const b = document.createElement('button'); b.className = 'trtile eltile'; b.dataset.v = e.id; b.innerHTML = `<canvas width="${TW}" height="${TH}"></canvas><span>${e.name}</span>`;
        b.onclick = () => { const c = addElement(ctx, e.id); if (!c) return; last = c.id; grid.querySelectorAll('.eltile').forEach(x => x.classList.toggle('on', x === b)); select(c.id, true); timeline.render();
          showBlend(c); const back = player.t; player.playRange(c.start, Math.min(c.start + Math.min(2.5, c.dur), c.start + c.dur), back); toast(`${e.name} added`); };
        grid.append(b); }
      const todo = [...grid.querySelectorAll('.eltile')]; const step = () => { if (my !== job) return; const b = todo.shift(); if (!b) return; drawTile(b.querySelector('canvas'), elementById(b.dataset.v)); requestAnimationFrame(step); }; requestAnimationFrame(step);
    }
    function showBlend(c) {
      blendRow.hidden = false; blendRow.innerHTML = '';
      blendRow.append(Object.assign(document.createElement('span'), { className: 'lbl', textContent: 'Blend' }), chips(BLEND_MODES.map(b => ({ value: b.id, label: b.name })), c.blend || 'normal', v => {
        act(p => { const f = ctx.find(p, last); if (f) { if (v === 'normal') delete f.clip.blend; else f.clip.blend = v; } }, 'Blend mode'); }, 'elblends'));
    }
    body.append(hint, tabs, grid, blendRow); fill();
  }, { className: 'elsheet' });
}

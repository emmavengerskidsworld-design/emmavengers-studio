/* Bottom sheets (CapCut-style panels) built from small reusable controls. */
import { begin, end } from './store.js';
import { icon } from './icons.js';

const sheet = () => document.getElementById('sheet');
let onClose = null;
export const sheetOpen = () => !sheet().classList.contains('hidden');
export function openSheet(title, build, { gesture = true, className = '', onClose: extraClose = null } = {}) {
  closeSheet();
  const el = sheet(); el.className = 'sheet ' + className;
  el.innerHTML = `<div class="sh-head"><b>${title}</b><button class="ib sh-done" aria-label="Done">${icon('check')}</button></div><div class="sh-body"></div>`;
  if (gesture) begin();
  onClose = () => { try { extraClose && extraClose(); } finally { if (gesture) end(); } };
  el.querySelector('.sh-done').onclick = () => closeSheet();
  document.body.classList.add('sheet-open');
  // Instant panels: the sheet (title + Done) is painted right away; its content is built just after that first frame,
  // so a tap shows a response within one frame even on slow phones.
  const body = el.querySelector('.sh-body'), tok = ++buildTok; body.classList.add('sh-loading');
  const run = () => { if (tok !== buildTok || !body.isConnected) return; body.classList.remove('sh-loading'); build(body); };
  pending = run; requestAnimationFrame(() => setTimeout(() => { if (pending === run) pending = null; run(); }, 0));
}
let buildTok = 0, pending = null;
/** Build a sheet that is still waiting for its first frame right now (used by code/tests that need its controls immediately). */
export function flushSheet() { const f = pending; pending = null; f && f(); }
export function closeSheet() {
  const el = sheet(); if (el.classList.contains('hidden')) return;
  buildTok++; pending = null; el.classList.add('hidden'); el.innerHTML = ''; document.body.classList.remove('sheet-open');
  const f = onClose; onClose = null; f && f();
}
export function slider(label, { min, max, step = 0.01, value, fmt = v => v, onInput, id }) {
  const w = document.createElement('label'); w.className = 'ctl';
  w.innerHTML = `<span class="cl">${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}" ${id ? `id="${id}"` : ''}><output>${fmt(+value)}</output>`;
  const inp = w.querySelector('input'), out = w.querySelector('output');
  inp.addEventListener('input', () => { out.textContent = fmt(+inp.value); onInput(+inp.value); });
  w.set = v => { inp.value = v; out.textContent = fmt(+v); };
  return w;
}
export function chips(items, active, onPick, cls = '') {
  const w = document.createElement('div'); w.className = 'chips ' + cls;
  for (const it of items) { const b = document.createElement('button'); b.className = 'chipbtn' + (it.value === active ? ' on' : ''); b.innerHTML = it.html || it.label; b.dataset.v = String(it.value);
    if (it.title) b.title = it.title;
    b.onclick = () => { w.querySelectorAll('.chipbtn').forEach(x => x.classList.toggle('on', x === b)); onPick(it.value); }; w.appendChild(b); }
  w.setActive = v => w.querySelectorAll('.chipbtn').forEach(x => x.classList.toggle('on', x.dataset.v === String(v)));
  return w;
}
export function swatches(colors, active, onPick) {
  return chips(colors.map(c => ({ value: c, html: `<i style="background:${c}"></i>`, title: c })), active, onPick, 'swatches');
}

// First sheet open used to cost ~130 ms (cold style/layout of the sheet subtree). Warm it once while idle, invisibly.
(window.requestIdleCallback || (f => setTimeout(f, 2000)))(() => { const el = sheet(); if (!el || !el.classList.contains('hidden')) return;
  el.style.opacity = '0.01'; el.style.pointerEvents = 'none'; el.className = 'sheet tall'; el.innerHTML = `<div class="sh-head"><b>.</b><button class="ib sh-done">${icon('check')}</button></div><div class="sh-body"><div class="chips tabs"><button class="chipbtn">a</button></div><div class="stkgrid"><button class="stk"></button></div></div>`;
  document.body.classList.add('sheet-open'); el.getBoundingClientRect(); document.querySelector('#stage, canvas')?.getBoundingClientRect(); document.body.classList.remove('sheet-open'); document.body.getBoundingClientRect(); requestAnimationFrame(() => requestAnimationFrame(() => { if (el.style.opacity === '0.01' && el.querySelector('.sh-head b')?.textContent === '.') { el.className = 'sheet hidden'; el.innerHTML = ''; } el.style.opacity = ''; el.style.pointerEvents = ''; })); }, { timeout: 3000 });

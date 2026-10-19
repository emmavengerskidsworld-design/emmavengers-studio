/* Bottom sheets (CapCut-style panels) built from small reusable controls. */
import { begin, end } from './store.js';
import { icon } from './icons.js';

const sheet = () => document.getElementById('sheet');
let onClose = null;
export const sheetOpen = () => !sheet().classList.contains('hidden');
import { HELP } from './helptips.js';
export function openSheet(title, build, { gesture = true, className = '', onClose: extraClose = null } = {}) {
  closeSheet();
  const el = sheet(); el.className = 'sheet ' + className;
  el.innerHTML = `<div class="sh-head"><b>${title}</b><button class="ib sh-done" aria-label="Done">${icon('check')}</button></div><div class="sh-body"></div>`;
  if (gesture) begin();
  onClose = () => { try { extraClose && extraClose(); } finally { if (gesture) end(); } };
  el.querySelector('.sh-done').onclick = () => closeSheet();
  build(el.querySelector('.sh-body'));
  helpButton(el, title);
  document.body.classList.add('sheet-open');
}
/* "?" in the sheet header: this tool's tips (js/helptips.js). Shown once by itself the first time a tool opens (not under automation). */
const SEEN = 'evs-tips-seen';
function helpButton(el, title) {
  const tips = HELP[title]; if (!tips) return;
  const head = el.querySelector('.sh-head'), hb = document.createElement('button'); hb.className = 'ib sh-help'; hb.setAttribute('aria-label', 'Help for ' + title); hb.textContent = '?';
  head.insertBefore(hb, head.querySelector('.sh-done')); hb.onclick = () => toggleTip(el, title, tips);
  let seen = []; try { seen = JSON.parse(localStorage.getItem(SEEN) || '[]'); } catch (e) {}
  if (!seen.includes(title) && !navigator.webdriver) toggleTip(el, title, tips);
}
export function toggleTip(el, title, tips = HELP[title]) {
  const body = el.querySelector('.sh-body'), old = body.querySelector('.sh-tip'); if (old) { old.remove(); return false; }
  const d = document.createElement('div'); d.className = 'sh-tip'; d.id = 'shTip';
  d.innerHTML = `<b>💡 ${title}</b><ul>${tips.map(t => `<li>${t}</li>`).join('')}</ul><button class="chipbtn" id="shTipOk">Got it</button>`;
  d.querySelector('#shTipOk').onclick = () => d.remove(); body.prepend(d);
  try { const seen = JSON.parse(localStorage.getItem(SEEN) || '[]'); if (!seen.includes(title)) localStorage.setItem(SEEN, JSON.stringify([...seen, title])); } catch (e) {}
  return true;
}
export function closeSheet() {
  const el = sheet(); if (el.classList.contains('hidden')) return;
  el.classList.add('hidden'); el.innerHTML = ''; document.body.classList.remove('sheet-open');
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

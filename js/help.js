/* First-run tour (spotlight + bubble, 8 steps) and the Help centre (all tool tips, searchable). Tips per sheet come from
   helptips.js and appear behind the "?" in every sheet header (panels.js). */
import { openSheet, closeSheet } from './panels.js';
import { HELP, TOOL_HELP, TOUR } from './helptips.js';

export const TOUR_KEY = 'evs-tour-done';
export const tourDone = () => !!localStorage.getItem(TOUR_KEY);
let cur = null;
export function startTour(steps = TOUR) {
  endTour(false); closeSheet();
  const ov = document.createElement('div'); ov.id = 'tour'; ov.className = 'tour';
  ov.innerHTML = '<div class="tour-hole"></div><div class="tour-tip" role="dialog" aria-live="polite"><b class="tour-t"></b><p class="tour-x"></p><div class="tour-dots"></div><div class="tour-btns"><button class="chipbtn" id="tourSkip">Skip</button><button class="chipbtn primary" id="tourNext">Next</button></div></div>';
  document.body.append(ov); let i = 0;
  const hole = ov.querySelector('.tour-hole'), tip = ov.querySelector('.tour-tip');
  const show = () => { const s = steps[i], el = s.sel && document.querySelector(s.sel), r = el && el.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
    ov.dataset.step = i; tip.querySelector('.tour-t').textContent = s.title; tip.querySelector('.tour-x').textContent = s.text;
    tip.querySelector('.tour-dots').innerHTML = steps.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('');
    ov.querySelector('#tourNext').textContent = i === steps.length - 1 ? 'Start editing!' : 'Next';
    if (r && r.width) { const p = 6; Object.assign(hole.style, { display: 'block', left: r.left - p + 'px', top: r.top - p + 'px', width: r.width + 2 * p + 'px', height: r.height + 2 * p + 'px' });
      const below = r.bottom + 12 + 170 < vh; tip.style.top = (below ? r.bottom + 12 : Math.max(12, r.top - 12 - tip.offsetHeight)) + 'px'; }
    else { hole.style.display = 'none'; tip.style.top = Math.round(vh * .32) + 'px'; }
    tip.style.left = Math.max(10, Math.min(vw - tip.offsetWidth - 10, ((r && r.width) ? r.left + r.width / 2 : vw / 2) - tip.offsetWidth / 2)) + 'px'; };
  ov.querySelector('#tourNext').onclick = () => { if (++i >= steps.length) endTour(); else show(); };
  ov.querySelector('#tourSkip').onclick = () => endTour();
  ov.addEventListener('click', e => { if (e.target === ov || e.target === hole) { e.stopPropagation(); } });
  cur = { ov, show }; show(); requestAnimationFrame(show); return ov;
}
export function endTour(mark = true) { if (cur) { cur.ov.remove(); cur = null; } if (mark) localStorage.setItem(TOUR_KEY, '1'); }
/** First run: show the tour once (not under automation unless ?tour is in the address). */
export function maybeTour() { const force = /[?&]tour\b/.test(location.search); if (force || (!tourDone() && !navigator.webdriver)) { setTimeout(() => startTour(), force ? 50 : 600); return true; } return false; }
/** Help centre: tour replay + every tool's tips, searchable. */
export function helpCentre(tools = []) {
  openSheet('Help', body => {
    const top = document.createElement('div'); top.className = 'capbtns';
    const tb = Object.assign(document.createElement('button'), { className: 'bigbtn', id: 'hcTour', textContent: '▶ Replay the tour' }); tb.onclick = () => { closeSheet(); setTimeout(() => startTour(), 200); };
    const q = Object.assign(document.createElement('input'), { type: 'search', id: 'hcSearch', className: 'kmin', placeholder: 'Search help (export, stickers, quiz…)' });
    const list = document.createElement('div'); list.id = 'hcList'; list.className = 'hclist';
    const rows = [...tools.filter(t => TOOL_HELP[t.id]).map(t => ({ k: t.label, lines: [TOOL_HELP[t.id], ...(HELP[t.label] || HELP[t.title] || [])] })),
      ...Object.entries(HELP).filter(([k]) => !tools.some(t => t.label === k)).map(([k, v]) => ({ k, lines: v }))];
    const fill = () => { const s = q.value.trim().toLowerCase(); list.innerHTML = '';
      for (const r of rows.filter(r => !s || (r.k + ' ' + r.lines.join(' ')).toLowerCase().includes(s))) { const d = document.createElement('details'); d.className = 'hcrow'; d.dataset.k = r.k;
        d.innerHTML = `<summary>${r.k}</summary><ul>${r.lines.map(l => `<li>${l}</li>`).join('')}</ul>`; if (s) d.open = true; list.append(d); } };
    q.oninput = fill; top.append(tb); body.append(top, q, list); fill();
  }, { className: 'helpsheet' });
}

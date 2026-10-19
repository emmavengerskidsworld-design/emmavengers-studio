/* Batch 11 workflow UI: multi-select tools, groups, compound clips (open / back / break apart), markers, magnetic main track,
   copy / paste (clips + attributes, across projects), undo history panel, detach / link, desktop keyboard shortcuts. */
import { S, act, live, select, selected, setMulti, multiIds, history, jump, enterNest, exitNest, undo, redo, on } from './store.js';
import { find, clipEnd, projectDuration, remove, duplicate, split, magnetic, mediaIds } from './project.js';
import { openSheet, closeSheet, sheetOpen, chips } from './panels.js';
import { useMedia } from './media.js';
import { groupClips, ungroupClips, makeCompound, breakApart, copyClips, pasteClips, clipboard, copyAttrs, pasteAttrs, attrClipboard, detachAudio, linkClips, unlinkClips, reattach, addMarker, editMarker, removeMarker, MARKER_COLORS, allOf } from './workflow.js';

let X = null;   // { player, timeline, toast, refreshToolbar }
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export function initWork(ctx) {
  X = ctx;
  on('multi', () => { document.body.classList.toggle('has-multi', S.multi.length > 1); X.refreshToolbar(); X.timeline.render(); });
  on('change', nestBar); nestBar();
  X.timeline.o.onMarker = m => markerSheet(m.id);
}
const sel = () => multiIds();
const done = (msg, ids) => { if (ids) { setMulti(ids.length > 1 ? ids : []); select(ids[ids.length - 1] || null); } X.timeline.render(); X.refreshToolbar(); msg && X.toast(msg); };

/* ---------- actions ---------- */
export function doGroup() { const ids = sel(); if (ids.length < 2) return X.toast('Select 2 or more clips (long-press, or the Select button)'); act(p => groupClips(p, ids), 'Group'); done(`Grouped ${ids.length} clips — they move together`, ids); }
export function doUngroup() { const ids = sel(); const n = act(p => ungroupClips(p, ids), 'Ungroup'); done(n ? 'Ungrouped' : 'Nothing grouped here', ids); }
export function doCompound() { const ids = sel(); if (!ids.length) return; const c = act(p => makeCompound(p, ids), 'Compound clip'); setMulti([]); if (c) { select(c.id); done(`Made a compound clip from ${ids.length} clip${ids.length > 1 ? 's' : ''} — tap Open to edit inside`); } }
export function doOpen(id = S.sel) { if (enterNest(id)) { X.timeline.fitZoom(); X.timeline.render(); X.player.seek(0); X.timeline.setTime(0); X.toast('Editing inside the compound clip — tap ◀ Main timeline to go back'); } }
export function doBack() { if (exitNest()) { X.timeline.render(); X.player.seek(Math.min(X.player.t, projectDuration(S.project))); X.toast('Back on the main timeline'); } }
export function doBreak() { const ids = act(p => breakApart(p, S.sel), 'Break apart'); if (ids) done('Compound clip broken apart', ids); }
export function doCopy() { const ids = sel(); const n = copyClips(S.project, ids); X.toast(n ? `Copied ${n} clip${n > 1 ? 's' : ''} — paste here or in another project` : 'Select a clip to copy'); X.refreshToolbar(); }
export function doCut() { const ids = sel(); if (!copyClips(S.project, ids)) return; setMulti([]); select(null); act(p => ids.forEach(id => remove(p, id)), 'Cut'); X.toast('Cut — paste with Paste or Ctrl+V'); }
export async function doPaste() {
  const cb = clipboard(); if (!cb) return X.toast('Nothing copied yet');
  const ids = act(p => pasteClips(p, X.player.t), `Paste ${cb.clips.length} clip${cb.clips.length > 1 ? 's' : ''}`);
  await useMedia(mediaIds(S.project)); X.player.requestDraw(); done(`Pasted ${ids.length} clip${ids.length > 1 ? 's' : ''}${cb.from !== S.project.id ? ' from another project' : ''}`, ids);
}
export function doCopyAttrs() { const f = selected(); if (!f) return; const n = copyAttrs(f.clip); X.toast(`Copied ${n} attribute${n === 1 ? '' : 's'} (look, effects, animation, sound…)`); X.refreshToolbar(); }
export function pasteAttrsSheet() {
  const cb = attrClipboard(); if (!cb) return X.toast('Copy attributes from a clip first');
  const groups = [['look', 'Look (filter, colour, adjust, HD)', ['filter', 'color', 'adjust', 'enhance', 'mask', 'crop', 'chroma', 'mirror', 'stab', 'blend']], ['fx', 'Effects', ['effects']], ['anim', 'Animation', ['anim']], ['pos', 'Position & size', ['transform']], ['kf', 'Keyframes', ['keyframes']], ['sound', 'Sound (volume, fades, voice, EQ, pan)', ['volume', 'fadeIn', 'fadeOut', 'voice', 'eq', 'comp', 'pan']], ['text', 'Text style', ['textStyle']]]
    .filter(g => g[2].some(k => k in cb.a));
  const on = new Set(groups.filter(g => !['pos', 'kf'].includes(g[0])).map(g => g[0]));
  openSheet('Paste attributes', body => {
    const box = el('div', 'toggles attrs'); for (const [id, name] of groups) { const b = el('button', 'chipbtn' + (on.has(id) ? ' on' : ''), esc(name)); b.dataset.g = id; b.onclick = () => { on.has(id) ? on.delete(id) : on.add(id); b.classList.toggle('on', on.has(id)); }; box.append(b); }
    const go = el('button', 'btn primary', 'Paste to selected'); go.id = 'attrGo';
    go.onclick = () => { const keys = groups.filter(g => on.has(g[0])).flatMap(g => g[2]), ids = sel(); let n = 0; act(p => { for (const id of ids) { const f = find(p, id); if (f) n += pasteAttrs(f.clip, keys); } }, 'Paste attributes'); closeSheet(); X.toast(n ? `Pasted onto ${ids.length} clip${ids.length > 1 ? 's' : ''}` : 'Nothing matching to paste'); };
    body.append(box, go, el('p', 'hint', `Copied from a ${cb.type} clip. Works on several selected clips at once, and in other projects.`));
  });
}
export function doDetach() { const f = selected(); if (!f) return; const a = act(p => detachAudio(p, f.clip.id), 'Detach audio'); if (a) { done('Sound detached and linked — move one, both move. Unlink to move freely', [f.clip.id, a.id]); } }
export function doLink() { const ids = sel(); if (ids.length < 2) return X.toast('Select the clips to link'); act(p => linkClips(p, ids), 'Link'); done('Linked — they move together', ids); }
export function doUnlink() { const ids = sel(); act(p => unlinkClips(p, ids), 'Unlink'); done('Unlinked'); }
export function doReattach() { if (act(p => reattach(p, S.sel), 'Re-attach audio')) done('Sound is back inside the video'); else X.toast('No detached sound for this clip'); }
export function doDelete() { const ids = sel(); setMulti([]); select(null); act(p => ids.forEach(id => remove(p, id)), ids.length > 1 ? `Delete ${ids.length} clips` : 'Delete clip'); X.player.gc(); }
export function selectAll() { const ids = allOf(S.project).map(x => x.c.id); setMulti(ids); select(ids[ids.length - 1] || null); X.toast(`${ids.length} clips selected`); }
export function clearMulti() { setMulti([]); select(null); setSelectMode(false); }
export function setSelectMode(v) { X.timeline.selectMode = v; document.body.classList.toggle('tl-select', v); const b = document.getElementById('selModeBtn'); if (b) b.classList.toggle('on', v); X.refreshToolbar(); }
export function toggleMagnetic() {
  const m = S.project.tracks.find(t => t.kind === 'main'), was = magnetic(m);
  act(p => { const t = p.tracks.find(x => x.kind === 'main'); if (was) t.free = true; else delete t.free; }, was ? 'Main track: free' : 'Main track: magnetic');
  X.toast(was ? 'Main track is free: clips stay where you put them (gaps allowed)' : 'Main track is magnetic: clips close up, no gaps'); magBtn(); X.refreshToolbar();
}
export function magBtn() { const b = document.getElementById('magBtn'); if (b) { const on = magnetic(S.project.tracks.find(t => t.kind === 'main')); b.classList.toggle('on', on); b.title = on ? 'Magnetic main track (tap for free)' : 'Free main track (tap for magnetic)'; b.setAttribute('aria-pressed', on); } }

/* ---------- tools ---------- */
export const MULTI_TOOLS = [
  { id: 'mgroup', icon: 'group', label: 'Group', run: doGroup },
  { id: 'mungroup', icon: 'ungroup', label: 'Ungroup', when: () => sel().some(id => find(S.project, id)?.clip.group), run: doUngroup },
  { id: 'mcompound', icon: 'compound', label: 'Compound', run: doCompound },
  { id: 'mcopy', icon: 'copy', label: 'Copy', run: doCopy },
  { id: 'mpasteattr', icon: 'attrs', label: 'Paste attrs', when: () => !!attrClipboard(), run: pasteAttrsSheet },
  { id: 'mlink', icon: 'link', label: 'Link', run: doLink },
  { id: 'munlink', icon: 'unlink', label: 'Unlink', when: () => sel().some(id => find(S.project, id)?.clip.link), run: doUnlink },
  { id: 'mdelete', icon: 'trash', label: 'Delete', run: doDelete },
  { id: 'mdone', icon: 'check', label: 'Done', run: clearMulti },
];
export const ROOT_EXTRA = [
  { id: 'select', icon: 'select', label: 'Select', run: () => { setSelectMode(!X.timeline.selectMode); X.toast(X.timeline.selectMode ? 'Tap clips to select them, or drag a box over the timeline' : 'Select mode off'); } },
  { id: 'paste', icon: 'paste', label: 'Paste', when: () => !!clipboard(), run: doPaste },
  { id: 'markers', icon: 'marker', label: 'Markers', run: () => markerSheet() },
  { id: 'history', icon: 'history', label: 'History', run: () => historySheet() },
  { id: 'magnetic', icon: 'magnet', label: 'Magnetic', run: toggleMagnetic },
  { id: 'nestback', icon: 'back', label: 'Main timeline', when: () => S.nests.length > 0, run: doBack },
];
export const CLIP_EXTRA = [
  { id: 'open', icon: 'compound', label: 'Open', when: c => c.type === 'compound', run: () => doOpen() },
  { id: 'breakapart', icon: 'ungroup', label: 'Break apart', when: c => c.type === 'compound', run: doBreak },
  { id: 'compound', icon: 'compound', label: 'Compound', when: c => c.type !== 'compound', run: doCompound },
  { id: 'copy', icon: 'copy', label: 'Copy', run: doCopy },
  { id: 'copyattr', icon: 'attrs', label: 'Copy attrs', run: doCopyAttrs },
  { id: 'pasteattr', icon: 'attrs', label: 'Paste attrs', when: () => !!attrClipboard(), run: pasteAttrsSheet },
  { id: 'detach', icon: 'extract', label: 'Detach audio', when: c => c.type === 'video' && !c.muteAudio, run: doDetach },
  { id: 'reattach', icon: 'link', label: 'Re-attach', when: c => !!c.link && (c.type === 'video' || c.type === 'audio'), run: doReattach },
  { id: 'unlink', icon: 'unlink', label: 'Unlink', when: c => !!c.link, run: doUnlink },
  { id: 'ungroup', icon: 'ungroup', label: 'Ungroup', when: c => !!c.group, run: doUngroup },
];

/* ---------- compound breadcrumb ---------- */
function nestBar() {
  let b = document.getElementById('nestBar'); const n = S.nests.length;
  if (!n) { if (b) b.hidden = true; document.body.classList.remove('in-nest'); return; }
  if (!b) { b = el('div', '', ''); b.id = 'nestBar'; document.getElementById('timeline').prepend(b); b.addEventListener('click', e => { if (e.target.closest('button')) doBack(); }); }
  b.hidden = false; document.body.classList.add('in-nest');
  b.innerHTML = `<button class="chipbtn" id="nestBack">◀ Main timeline</button><span>▣ ${esc(S.project.name || 'Compound clip')}${n > 1 ? ` (level ${n})` : ''}</span>`;
}

/* ---------- markers ---------- */
export function markerSheet(focus) {
  openSheet('Markers', body => {
    const list = el('div', 'mklist'); list.id = 'mkList';
    const add = el('button', 'btn primary', '＋ Add marker at the white line'); add.id = 'mkAdd';
    add.onclick = () => { const m = act(p => addMarker(p, X.player.t, '', MARKER_COLORS[(S.project.markers || []).length % MARKER_COLORS.length]), 'Add marker'); focus = m.id; fill(); X.timeline.render(); };
    const fill = () => { list.innerHTML = ''; for (const m of S.project.markers || []) {
      const r = el('div', 'mkrow' + (m.id === focus ? ' on' : '')); r.dataset.id = m.id;
      const go = el('button', 'mkt', `<i style="background:${m.color}"></i>${fmt(m.t)}`); go.onclick = () => { X.player.seek(m.t); X.timeline.setTime(m.t); };
      const lb = el('input', 'mklabel'); lb.value = m.label || ''; lb.placeholder = 'Label'; lb.maxLength = 40; lb.oninput = () => { live(p => editMarker(p, m.id, { label: lb.value })); X.timeline.drawRuler(); };
      lb.onchange = () => act(() => {}, 'Rename marker');
      const cs = el('div', 'mkcols'); for (const c of MARKER_COLORS) { const s = el('button', 'mkc' + (c === m.color ? ' on' : '')); s.style.background = c; s.dataset.c = c; s.onclick = () => { act(p => editMarker(p, m.id, { color: c }), 'Marker colour'); fill(); X.timeline.render(); }; cs.append(s); }
      const mv = el('button', 'chipbtn', 'Move here'); mv.onclick = () => { act(p => editMarker(p, m.id, { t: X.player.t }), 'Move marker'); fill(); X.timeline.render(); };
      const del = el('button', 'chipbtn', 'Delete'); del.onclick = () => { act(p => removeMarker(p, m.id), 'Delete marker'); fill(); X.timeline.render(); };
      r.append(go, lb, cs, mv, del); list.append(r); }
      if (!(S.project.markers || []).length) list.append(el('p', 'hint', 'No markers yet. Markers are labelled flags on the timeline: clips snap to them, tap a flag to jump there. Press M on a keyboard to add one.')); };
    body.append(add, list); fill();
    if (focus) setTimeout(() => list.querySelector(`.mkrow[data-id="${focus}"] .mklabel`)?.focus(), 50);
  }, { className: 'tall' });
}
const fmt = t => { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s.toFixed(2).padStart(5, '0')}`; };

/* ---------- undo history ---------- */
export function historySheet() {
  openSheet('History', body => {
    const list = el('div', 'histlist'); list.id = 'histList';
    const fill = () => { const h = history(); list.innerHTML = '';
      const row = (txt, cls, n, t) => { const b = el('button', 'histrow ' + cls, `<span>${esc(txt)}</span>${t ? `<small>${new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</small>` : ''}`); b.dataset.n = n; b.onclick = () => { if (n) { jump(n); fill(); X.timeline.render(); X.player.requestDraw(); } }; list.append(b); };
      for (const f of h.future) row(f.label, 'fut', -f.fwd, f.t);
      row('Now', 'now', 0);
      for (const p of [...h.past].reverse()) row(p.label, 'past', p.back, p.t);
      if (!h.past.length && !h.future.length) list.append(el('p', 'hint', 'Your edits will be listed here. Tap any step to go back to it (you can come forward again).')); };
    body.append(list, el('p', 'hint', 'Newest first. Greyed steps are ones you undid — tap to redo them. Up to 100 steps.')); fill();
  }, { className: 'tall' });
}

/* ---------- keyboard shortcuts (desktop) ---------- */
export const SHORTCUTS = [
  ['Space / K', 'Play / pause'], ['← / →', 'One frame back / forward'], ['Shift + ← / →', 'One second back / forward'], ['Home / End', 'Start / end'],
  ['S', 'Split at the white line'], ['M', 'Add marker'], ['Ctrl + C / X / V', 'Copy / cut / paste clips'], ['Ctrl + Shift + C / V', 'Copy / paste attributes'],
  ['Ctrl + D', 'Duplicate'], ['Delete', 'Delete selected'], ['Ctrl + A', 'Select all clips'], ['Shift + click / drag', 'Add to selection / box select'],
  ['Ctrl + G / Ctrl + Shift + G', 'Group / ungroup'], ['Alt + G', 'Make compound clip'], ['Enter / Esc', 'Open compound / back, clear selection'],
  ['N', 'Magnetic main track on / off'], ['+ / −', 'Zoom timeline'], ['Ctrl + Z / Ctrl + Shift + Z', 'Undo / redo'], ['H', 'History panel'], ['?', 'This list'],
];
export function shortcutsSheet() { openSheet('Keyboard shortcuts', body => { const t = el('div', 'kbd'); t.id = 'kbdList'; t.innerHTML = SHORTCUTS.map(([k, v]) => `<kbd>${esc(k)}</kbd><span>${esc(v)}</span>`).join(''); body.append(t); }, { className: 'tall' }); }
/** Returns true when the key was handled. */
export function handleKey(e, { doSplit, showTime }) {
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(), P = X.player, fps = S.project.fps || 30;
  const seekTo = t => { P.pause(); P.seek(Math.max(0, Math.min(projectDuration(S.project), t))); X.timeline.setTime(P.t); showTime(); };
  if (e.code === 'Space' || (k === 'k' && !mod)) { e.preventDefault(); P.toggle(); }
  else if (mod && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if (mod && k === 'y') { e.preventDefault(); redo(); }
  else if (mod && k === 'c') { e.preventDefault(); e.shiftKey ? doCopyAttrs() : doCopy(); }
  else if (mod && k === 'x') { e.preventDefault(); doCut(); }
  else if (mod && k === 'v') { e.preventDefault(); e.shiftKey ? pasteAttrsSheet() : doPaste(); }
  else if (mod && k === 'd') { e.preventDefault(); if (S.sel) { const b = act(p => duplicate(p, S.sel), 'Duplicate'); b && select(b.id); } }
  else if (mod && k === 'a') { e.preventDefault(); selectAll(); }
  else if (mod && k === 'g') { e.preventDefault(); e.shiftKey ? doUngroup() : doGroup(); }
  else if (e.altKey && k === 'g') { e.preventDefault(); doCompound(); }
  else if ((e.key === 'Delete' || e.key === 'Backspace') && (S.sel || S.multi.length)) doDelete();
  else if (e.key === 'Escape') { if (sheetOpen()) closeSheet(); else if (S.multi.length || S.sel) clearMulti(); else if (S.nests.length) doBack(); }
  else if (e.key === 'Enter' && S.sel && find(S.project, S.sel)?.clip.type === 'compound') doOpen();
  else if (k === 's' && !mod) doSplit();
  else if (k === 'm' && !mod && !sheetOpen()) { act(p => addMarker(p, P.t, '', MARKER_COLORS[(S.project.markers || []).length % MARKER_COLORS.length]), 'Add marker'); X.timeline.render(); X.toast('Marker added'); }
  else if (k === 'n' && !mod) toggleMagnetic();
  else if (k === 'h' && !mod) historySheet();
  else if (e.key === '?') shortcutsSheet();
  else if (e.key === '+' || e.key === '=') X.timeline.smoothZoom(1.6);
  else if (e.key === '-' || e.key === '_') X.timeline.smoothZoom(1 / 1.6);
  else if (e.key === 'Home') seekTo(0);
  else if (e.key === 'End') seekTo(projectDuration(S.project));
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); seekTo(P.t + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? 1 : 1 / fps)); }
  else return false;
  return true;
}

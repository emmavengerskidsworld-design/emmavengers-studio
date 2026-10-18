/* Home screen: my projects (grid with thumbnails), new project, templates, search / sort, rename / duplicate / back up /
   delete, backup restore, storage use + warnings. */
import * as P from './projects.js';
import { makeBackup, restoreBackup, BACKUP_EXT } from './backup.js';
import { openSheet, closeSheet, chips } from './panels.js';
import { icon } from './icons.js';
import { S } from './store.js';

let X = null, sort = localStorage.getItem('studio.homeSort') || 'edited', q = '';
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtD = d => { const m = Math.floor(d / 60), s = Math.round(d - m * 60); return d ? `${m}:${String(s).padStart(2, '0')}` : 'empty'; };
const thumbUrls = new Map();
export const homeOpen = () => !$('#home').hidden;

export function initHome(ctx) {
  X = ctx; const h = $('#home');
  h.innerHTML = `<header class="hm-top"><div class="brand">Emmavengers <b>Studio</b></div><button class="ib" id="homeMenu" aria-label="Settings">${icon('menu')}</button></header>
  <div class="hm-body">
    <div class="hm-new"><button class="btn primary big" id="newProjBtn">${icon('plus', 20)} New project</button><button class="btn big ghost" id="homeTemplates">${icon('templates', 20)} Templates</button></div>
    <div class="hm-tools"><label class="sndsearch hm-search">${icon('search', 18)}<input id="homeSearch" type="search" placeholder="Search my projects" autocomplete="off"></label></div>
    <div id="homeSort"></div>
    <div class="hm-grid" id="homeGrid"></div>
    <div class="hm-store" id="homeStorage"></div>
    <div class="hm-backup"><button class="btn ghost" id="homeBackupAll">${icon('backup', 18)} Back up all</button><button class="btn ghost" id="homeImport">${icon('restore', 18)} Restore backup</button></div>
    <p class="hint">Projects are saved on this phone. Back up to keep a copy in Files or Google Drive (use Share → Drive), and to move projects to another phone.</p>
  </div><input type="file" id="homeFile" accept="${BACKUP_EXT},application/zip,application/octet-stream" hidden>`;
  $('#homeMenu').onclick = () => X.menuSheet();
  $('#newProjBtn').onclick = newSheet;
  $('#homeTemplates').onclick = () => X.templatesSheet();
  $('#homeSort').append(chips([{ value: 'edited', label: 'Last edited' }, { value: 'name', label: 'Name' }, { value: 'created', label: 'Newest' }, { value: 'length', label: 'Longest' }], sort, v => { sort = v; localStorage.setItem('studio.homeSort', v); render(); }, 'tabs hmsort'));
  let tm = 0; $('#homeSearch').oninput = e => { clearTimeout(tm); tm = setTimeout(() => { q = e.target.value; render(); }, 120); };
  $('#homeBackupAll').onclick = () => backup('all');
  $('#homeImport').onclick = () => { $('#homeFile').value = ''; $('#homeFile').click(); };
  $('#homeFile').onchange = async e => { const f = e.target.files[0]; if (f) await restore(f); e.target.value = ''; };
}
export async function showHome() {
  if (S.project) await X.leaveProject();
  document.body.classList.add('home-open'); $('#home').hidden = false; closeSheet(); await render();
}
export function hideHome() { $('#home').hidden = true; document.body.classList.remove('home-open'); }
async function open(id) { X.busy(true, 'Opening…'); try { await P.openById(id); hideHome(); X.afterSwitch(); } catch (e) { console.warn(e); X.toast('Could not open this project'); } finally { X.busy(false); } }
export async function render() {
  const list = P.sortProjects(await P.listProjects(), sort, q), g = $('#homeGrid'), info = await P.storageInfo();
  for (const u of thumbUrls.values()) URL.revokeObjectURL(u); thumbUrls.clear();
  g.innerHTML = list.length ? '' : `<p class="hint hm-none">${q ? 'No projects match “' + esc(q) + '”.' : 'No projects yet. Tap New project to start.'}</p>`;
  for (const p of list) {
    const b = document.createElement('div'); b.className = 'pcard'; b.dataset.id = p.id; b.dataset.aspect = p.aspect;
    const th = await P.getThumb(p.id); let url = ''; if (th) { url = URL.createObjectURL(th); thumbUrls.set(p.id, url); }
    b.innerHTML = `<button class="pthumb" aria-label="Open ${esc(p.name)}">${url ? `<img alt="" src="${url}">` : `<span class="pnone">${icon('media', 28)}</span>`}<i>${p.aspect}</i></button>
      <div class="pinfo"><b class="pname">${esc(p.name)}</b><span class="pmeta">${fmtD(p.dur)} · ${P.ago(p.updated)}${info.per[p.id] ? ' · ' + P.fmtBytes(info.per[p.id]) : ''}</span></div>
      <button class="ib pmore" aria-label="More for ${esc(p.name)}">${icon('more')}</button>`;
    b.querySelector('.pthumb').onclick = () => open(p.id);
    b.querySelector('.pinfo').onclick = () => open(p.id);
    b.querySelector('.pmore').onclick = () => moreSheet(p);
    g.append(b);
  }
  const st = $('#homeStorage'), pct = info.quota ? Math.min(100, info.usage / info.quota * 100) : 0;
  st.className = 'hm-store ' + info.level;
  st.innerHTML = `<div class="hs-row">${icon('storage', 18)}<span id="storeText">${list.length} project${list.length === 1 ? '' : 's'} · files ${P.fmtBytes(info.files)}${info.quota ? ` · ${P.fmtBytes(info.free)} free on this phone` : ''}</span></div>
    ${info.quota ? `<div class="hs-bar"><i style="width:${pct.toFixed(1)}%"></i></div>` : ''}
    ${info.level === 'full' ? '<p class="hs-warn" id="storeWarn">Storage is almost full. Back up and delete old projects, or new videos may not save.</p>' : info.level === 'low' ? '<p class="hs-warn" id="storeWarn">Storage is getting low. Back up projects you are done with, then delete them here.</p>' : ''}
    ${info.persisted ? '<p class="hs-ok" id="storePersist">Your projects are kept safe: the browser will not clear them.</p>' : '<button class="link" id="storePersist">Keep my projects safe on this phone</button>'}`;
  const pb = $('#storePersist'); if (pb && pb.tagName === 'BUTTON') pb.onclick = async () => { const ok = await P.askPersist(true); X.toast(ok ? 'Done: your projects will not be cleared' : 'This browser decides by itself. Install the app to keep projects safe.'); render(); };
  window.__homeInfo = { count: list.length, info };
}
function newSheet() {
  openSheet('New project', body => {
    body.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'Pick the video shape. You can change it later.' }));
    body.append(chips([{ value: '9:16', html: '<b>9:16</b><small>TikTok · Reels · Shorts</small>' }, { value: '16:9', html: '<b>16:9</b><small>YouTube</small>' }, { value: '1:1', html: '<b>1:1</b><small>Square post</small>' }], null, async v => {
      closeSheet(); X.busy(true, 'Making your project…'); try { await P.createProject(v); hideHome(); X.afterSwitch(); X.toast('New project ' + v); } finally { X.busy(false); } }, 'big newratio'));
  }, { gesture: false });
}
function moreSheet(p) {
  openSheet(esc(p.name), body => {
    const b = (id, ic, label, fn, cls = '') => { const x = document.createElement('button'); x.className = 'btn ghost menuitem ' + cls; x.id = id; x.innerHTML = icon(ic, 18) + ' ' + label; x.onclick = fn; body.append(x); };
    b('pmOpen', 'edit', 'Open', () => { closeSheet(); open(p.id); });
    b('pmRename', 'text', 'Rename', () => renameSheet(p));
    b('pmDup', 'copy', 'Duplicate', async () => { closeSheet(); const d = await P.duplicateProject(p.id); X.toast('Made “' + d.name + '”'); render(); });
    b('pmBackup', 'backup', 'Back up (.emmaproj)', () => { closeSheet(); backup([p.id]); });
    b('pmDelete', 'trash', 'Delete', async () => {
      if (!confirm(`Delete “${p.name}”? This cannot be undone. Back it up first if you want to keep a copy.`)) return;
      closeSheet(); const r = await P.deleteProject(p.id); X.afterSwitch(true); X.toast(`Deleted “${p.name}”` + (r.removed ? ` · freed ${r.removed} file${r.removed > 1 ? 's' : ''}` : '')); render(); }, 'danger');
  }, { gesture: false });
}
function renameSheet(p) {
  openSheet('Rename', body => {
    body.innerHTML = `<input id="renameInput" class="txtin" maxlength="80" value="${esc(p.name)}"><button class="btn primary" id="renameOk">Save name</button>`;
    const i = $('#renameInput'); i.focus(); i.select();
    const go = async () => { const n = await P.renameProject(p.id, i.value); closeSheet(); if (n) { X.toast('Renamed to “' + n + '”'); if (S.project && S.project.id === p.id) X.afterSwitch(); } render(); };
    $('#renameOk').onclick = go; i.onkeydown = e => { if (e.key === 'Enter') go(); };
  }, { gesture: false });
}
async function backup(ids) {
  X.busy(true, 'Making the backup…');
  try { const r = await makeBackup(ids, u => { $('#busyText').textContent = `Making the backup… ${Math.round(u * 100)}%`; }); window.__lastBackup = r; X.busy(false);
    X.deliver(r.blob, r.name, 'application/octet-stream', `Backup ready: ${r.projects} project${r.projects > 1 ? 's' : ''}, ${r.files} file${r.files === 1 ? '' : 's'}, ${P.fmtBytes(r.bytes)}.`, 'backup');
  } catch (e) { console.warn(e); X.toast('Backup failed: ' + (e.message || e)); } finally { X.busy(false); }
}
async function restore(file) {
  X.busy(true, 'Restoring…');
  try { const r = await restoreBackup(file, { onProgress: u => { $('#busyText').textContent = `Restoring… ${Math.round(u * 100)}%`; } }); window.__lastRestore = r;
    await P.cleanUp(); X.toast(`Restored ${r.ids.length} project${r.ids.length > 1 ? 's' : ''}` + (r.reused ? ` (${r.reused} file${r.reused > 1 ? 's were' : ' was'} already here)` : '')); await render();
  } catch (e) { console.warn(e); X.toast('Could not restore: ' + (e.message || e), 4000); } finally { X.busy(false); }
}

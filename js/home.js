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
  const CLK = '<svg viewBox="0 0 24 24" width="15" height="15"><circle cx="12" cy="12" r="10" fill="#fff"/><path d="M12 6v6l3 2" stroke="#2b1a10" stroke-width="2.4" fill="none" stroke-linecap="round"/></svg>';
  h.innerHTML = `<header class="hm-top"><div class="brand hm-logo" aria-label="Emmavengers">Emmavengers</div><button class="ib" id="homeMenu" aria-label="Settings">${icon('gear')}</button></header>
  <div class="hm-body" id="hvHome">
    <div class="hm-space"></div>
    <h4 class="hm-label">CREATE NEW</h4>
    <div class="hm-create">
      <div class="hm-cb"><button class="hm-circ c-video" id="newProjBtn" aria-label="New video">${icon('media', 34)}</button><button class="hm-clock" id="draftsVideo" aria-label="Drafts">${CLK}</button><span>Video</span></div>
      <div class="hm-cb"><button class="hm-circ c-photo" id="homePhoto" aria-label="Photo">${icon('photo', 32)}</button><button class="hm-clock" id="draftsPhoto" aria-label="Drafts">${CLK}</button><span>Photo</span></div>
      <div class="hm-cb"><button class="hm-circ c-ad" id="homeAd" aria-label="Beat Ad">${icon('beat', 32)}</button><span>Beat Ad</span></div>
    </div>
    <div class="hm-wnrow"><h4 class="hm-label">WHAT'S NEW</h4><button class="hm-all" id="homeAll">ALL ›</button></div>
    <div class="hm-wn">
      <button class="wn wn-tpl" id="wnTemplates"><svg viewBox="0 0 100 70" aria-hidden="true"><rect x="10" y="8" width="36" height="52" rx="6" fill="#ffb3c7"/><rect x="52" y="8" width="38" height="24" rx="6" fill="#9fd0ff"/><rect x="52" y="36" width="38" height="24" rx="6" fill="#ffe27a"/><circle cx="28" cy="26" r="8" fill="#fff"/></svg><b>TEMPLATES</b></button>
      <button class="wn wn-stk" id="wnStickers"><svg viewBox="0 0 100 70" aria-hidden="true"><path d="M26 10l6 14 15 1-12 9 4 15-13-8-13 8 4-15-12-9 15-1z" fill="#fff6e0"/><path d="M70 54c-14-9-20-17-14-24 4-5 10-3 14 2 4-5 10-7 14-2 6 7 0 15-14 24z" fill="#ff9de2"/><circle cx="72" cy="16" r="9" fill="#5fd0ff"/></svg><b>STICKERS</b></button>
      <button class="wn wn-new" id="wnNew"><svg viewBox="0 0 100 70" aria-hidden="true"><rect x="26" y="16" width="48" height="36" rx="10" fill="#ffe0b8"/><text x="50" y="41" font-size="16" font-weight="800" text-anchor="middle" fill="#c26a1a" font-family="system-ui">New</text><path d="M14 20l2 5 5 2-5 2-2 5-2-5-5-2 5-2zM86 44l2 4 4 2-4 2-2 4-2-4-4-2 4-2z" fill="#fff"/></svg><b>NEW &amp; FEATURED</b></button>
    </div>
  </div>
  <div class="hm-drafts" id="homeDrafts" hidden><div class="hd-stack">
    <button class="hd-new" id="draftNew"><b>NEW</b><span class="hd-plus">${icon('plus', 22)}</span></button>
    <div id="homeRecent" class="hd-list"></div>
    <button class="hd-more" id="homeSeeAll">DRAFTS ›</button>
  </div></div>
  <div class="hm-body" id="hvProjects" hidden>
    <h2 class="hm-title">Projects</h2>
    <div class="hm-tools"><label class="sndsearch hm-search">${icon('search', 18)}<input id="homeSearch" type="search" placeholder="Search my projects" autocomplete="off"></label></div>
    <div id="homeSort"></div>
    <div class="hm-grid" id="homeGrid"></div>
    <div class="hm-store" id="homeStorage"></div>
    <div class="hm-backup"><button class="btn ghost" id="homeBackupAll">${icon('backup', 18)} Back up all</button><button class="btn ghost" id="homeImport">${icon('restore', 18)} Restore backup</button></div>
    <p class="hint">Projects are saved on this phone. Back up to keep a copy in Files or Google Drive (use Share → Drive), and to move projects to another phone.</p>
  </div>
  <nav class="hm-tabs" id="homeTabs"><button id="tabHome" class="on">${icon('home', 22)}<span>Home</span></button><button id="homeTemplates">${icon('templates', 22)}<span>Templates</span></button><button id="tabProjects">${icon('media', 22)}<span>Projects</span></button></nav>
  <input type="file" id="homeFile" accept="${BACKUP_EXT},application/zip,application/octet-stream" hidden>`;
  $('#homeMenu').onclick = () => X.menuSheet();
  $('#newProjBtn').onclick = newSheet;
  $('#homeTemplates').onclick = () => X.templatesSheet();
  $('#homeAd').onclick = () => X.adSheet();
  $('#homePhoto').onclick = () => X.photoSheet();
  const drafts = on => { $('#homeDrafts').hidden = !on; };
  $('#draftsVideo').onclick = $('#draftsPhoto').onclick = () => drafts(true);
  $('#homeDrafts').onclick = e => { if (e.target.id === 'homeDrafts' || e.target.classList.contains('hd-stack')) drafts(false); };
  $('#draftNew').onclick = () => { drafts(false); newSheet(); };
  $('#homeSeeAll').onclick = () => { drafts(false); tab('projects'); };
  $('#homeAll').onclick = $('#wnTemplates').onclick = $('#wnNew').onclick = () => X.templatesSheet();
  $('#wnStickers').onclick = () => X.templatesSheet();
  $('#tabHome').onclick = () => tab('home');
  $('#tabProjects').onclick = () => tab('projects');
  $('#homeSort').append(chips([{ value: 'edited', label: 'Last edited' }, { value: 'name', label: 'Name' }, { value: 'created', label: 'Newest' }, { value: 'length', label: 'Longest' }], sort, v => { sort = v; localStorage.setItem('studio.homeSort', v); render(); }, 'tabs hmsort'));
  let tm = 0; $('#homeSearch').oninput = e => { clearTimeout(tm); tm = setTimeout(() => { q = e.target.value; render(); }, 120); };
  $('#homeBackupAll').onclick = () => backup('all');
  $('#homeImport').onclick = () => { $('#homeFile').value = ''; $('#homeFile').click(); };
  $('#homeFile').onchange = async e => { const f = e.target.files[0]; if (f) await restore(f); e.target.value = ''; };
}
export function tab(t) {
  $('#hvHome').hidden = t !== 'home'; $('#hvProjects').hidden = t !== 'projects';
  $('#tabHome').classList.toggle('on', t === 'home'); $('#tabProjects').classList.toggle('on', t === 'projects');
  (t === 'home' ? $('#hvHome') : $('#hvProjects')).scrollTop = 0;
}
export async function showHome() {
  if (S.project) await X.leaveProject();
  document.body.classList.add('home-open'); $('#home').hidden = false; $('#homeDrafts').hidden = true; tab('home'); closeSheet(); await render();
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
  const all = P.sortProjects(await P.listProjects(), 'edited', ''), rec = all.slice(0, 3), rr = $('#homeRecent'); rr.innerHTML = '';
  $('#homeSeeAll').textContent = `${all.length} DRAFT${all.length === 1 ? '' : 'S'} ›`;
  if (!rec.length) rr.innerHTML = '<p class="hint hm-none">No drafts yet. Tap NEW to start.</p>';
  const ymd = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  for (const p of rec) {
    let url = thumbUrls.get(p.id); if (!url) { const th = await P.getThumb(p.id); if (th) { url = URL.createObjectURL(th); thumbUrls.set(p.id, url); } }
    const b = document.createElement('div'); b.className = 'rcard drow'; b.dataset.id = p.id;
    b.innerHTML = `<button class="dr-main" aria-label="Open ${esc(p.name)}"><span class="dr-txt"><small>${ymd(p.updated || p.created || Date.now())}</small><i>${p.dur ? fmtD(p.dur) : '0:00'}</i></span><span class="rthumb">${url ? `<img alt="" src="${url}">` : icon('media', 22)}</span></button><button class="ib dr-more" aria-label="More for ${esc(p.name)}">⋮</button>`;
    b.querySelector('.dr-main').onclick = () => { $('#homeDrafts').hidden = true; open(p.id); };
    b.querySelector('.dr-more').onclick = () => moreSheet(p); rr.append(b);
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
  let kind = 'video', aspect = '9:16'; const items = [];   // { f, url, type, dur, on }
  openSheet('New video', body => {
    const tabs = chips([{ value: 'video', label: 'Videos' }, { value: 'image', label: 'Photos' }], kind, v => { kind = v; draw(); }, 'tabs nptabs'); tabs.id = 'npTabs';
    const fi = Object.assign(document.createElement('input'), { type: 'file', accept: 'video/*,image/*', multiple: true, hidden: true, id: 'npFile' });
    const pick = Object.assign(document.createElement('button'), { className: 'btn ghost', id: 'npPick' }); pick.innerHTML = icon('import', 18) + ' Choose from phone';
    pick.onclick = () => { fi.value = ''; fi.click(); };
    const grid = Object.assign(document.createElement('div'), { className: 'npgrid', id: 'npGrid' });
    const hdOn = () => +(localStorage.getItem('studio.res') || 1080) >= 1080;
    const hd = Object.assign(document.createElement('button'), { className: 'nphd', id: 'npHD' });
    const hdDraw = () => { hd.classList.toggle('on', hdOn()); hd.innerHTML = `<b>HD</b><span>${hdOn() ? 'On · 1080p or more' : 'Off · 720p'}</span>`; };
    hd.onclick = () => { localStorage.setItem('studio.res', hdOn() ? 720 : 1080); hdDraw(); }; hdDraw();
    const ratio = chips([{ value: '9:16', html: '<b>9:16</b><small>Shorts · TikTok</small>' }, { value: '16:9', html: '<b>16:9</b><small>YouTube</small>' }, { value: '1:1', html: '<b>1:1</b><small>Square</small>' }], aspect, v => { aspect = v; }, 'newratio');
    const add = Object.assign(document.createElement('button'), { className: 'btn primary big', id: 'npAdd' });
    const bar = Object.assign(document.createElement('div'), { className: 'npbar' }); bar.append(hd, add);
    const fmt = d => d ? `${Math.floor(d / 60)}:${String(Math.round(d % 60)).padStart(2, '0')}` : '';
    function draw() {
      grid.innerHTML = ''; const list = items.filter(x => x.type === kind);
      if (!list.length) grid.innerHTML = `<p class="hint npnone">${kind === 'video' ? 'No videos picked yet.' : 'No photos picked yet.'} Tap Choose from phone.</p>`;
      for (const it of list) {
        const c = document.createElement('button'); c.className = 'nptile' + (it.on ? ' on' : '');
        c.innerHTML = (it.type === 'image' ? `<img alt="" src="${it.url}">` : `<video muted playsinline preload="metadata" src="${it.url}#t=0.1"></video>`) + `<em class="npsel">${it.on ? items.filter(x => x.on).indexOf(it) + 1 : ''}</em>${it.dur ? `<i>${fmt(it.dur)}</i>` : ''}`;
        c.onclick = () => { it.on = !it.on; draw(); }; grid.append(c);
      }
      const n = items.filter(x => x.on).length; add.textContent = n ? `Add (${n})` : 'Start empty';
    }
    fi.onchange = () => { for (const f of fi.files) { const type = /^image\//.test(f.type) ? 'image' : /^video\//.test(f.type) ? 'video' : null; if (!type) continue;
        const it = { f, url: URL.createObjectURL(f), type, dur: 0, on: true }; items.push(it);
        if (type === 'video') { const v = document.createElement('video'); v.preload = 'metadata'; v.onloadedmetadata = () => { it.dur = v.duration; draw(); }; v.src = it.url; } }
      if (fi.files.length && ![...fi.files].some(f => f.type.startsWith(kind))) { kind = kind === 'video' ? 'image' : 'video'; tabs.setActive && tabs.setActive(kind); }
      draw(); };
    add.onclick = async () => { const files = items.filter(x => x.on).map(x => x.f); closeSheet(); X.busy(true, 'Making your project…');
      try { await P.createProject(aspect); hideHome(); X.afterSwitch(); X.toast('New project ' + aspect); } finally { X.busy(false); }
      if (files.length) await X.addFiles(files); for (const x of items) URL.revokeObjectURL(x.url); };
    body.append(tabs, pick, fi, grid, Object.assign(document.createElement('p'), { className: 'hint', textContent: 'Video shape (you can change it later)' }), ratio, bar); draw();
  }, { gesture: false, className: 'npsheet' });
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

/* Projects on this phone: list, create, open, rename, duplicate, delete, thumbnails, storage use, clean-up.
   Each project is one JSON record in IndexedDB ('projects'); files live once in 'media' and can be shared by
   several projects (content hash), so duplicating a project costs no extra space. */
import * as db from './db.js';
import { S, save, openProject } from './store.js';
import { newProject, normalize, projectDuration, mediaIds, uid } from './project.js';
import { useMedia, gcMedia, backfillHashes, media } from './media.js';

const THUMB = id => 'thumb:' + id, MIGRATED = 'projectsV';
export const projectMeta = p => ({ id: p.id, name: p.name || 'My video', aspect: p.aspect || '9:16', created: p.created || 0, updated: p.updated || p.created || 0,
  dur: projectDuration(p), clips: p.tracks.reduce((n, t) => n + t.clips.length, 0), template: p.template || null });
export async function listProjects() { return (await db.all('projects')).map(p => projectMeta(normalize(p))); }
export const getProject = id => db.get('projects', id);
export const getThumb = id => db.kvGet(THUMB(id));
export const setThumb = (id, blob) => db.kvSet(THUMB(id), blob);

/** Sort + search for the home grid. sort: 'edited' | 'name' | 'created' | 'length'. */
export function sortProjects(list, sort = 'edited', q = '') {
  const w = q.trim().toLowerCase(), out = list.filter(p => !w || p.name.toLowerCase().includes(w));
  const by = { edited: (a, b) => b.updated - a.updated, created: (a, b) => b.created - a.created, name: (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }) || b.updated - a.updated, length: (a, b) => b.dur - a.dur };
  return out.sort(by[sort] || by.edited);
}
/** Open a stored project (or a project object) as the current one, with only its files loaded. */
export async function openById(id) {
  const p = typeof id === 'string' ? await db.get('projects', id) : id; if (!p) throw new Error('Project not found');
  await useMedia(mediaIds(normalize(p))); await openProject(p); return S.project;
}
export async function createProject(aspect = '9:16', name) {
  const p = newProject(); p.aspect = aspect; p.name = name || await freeName('My video'); p.created = p.updated = Date.now();
  await db.put('projects', p); return openById(p);
}
/** Store a project built elsewhere (a template, a restored backup) as a new project and open it. */
export async function addProject(p, open = true) {
  p.name = await freeName(p.name || 'My video', p.id); p.created ||= Date.now(); p.updated ||= Date.now(); await db.put('projects', p);
  return open ? openById(p) : p;
}
export async function freeName(base, selfId) {
  const names = new Set((await db.all('projects')).filter(p => p.id !== selfId).map(p => (p.name || '').toLowerCase()));
  if (!names.has(base.toLowerCase())) return base;
  for (let i = 2; ; i++) if (!names.has(`${base} ${i}`.toLowerCase())) return `${base} ${i}`;
}
export async function renameProject(id, name) {
  name = String(name || '').trim().slice(0, 80); if (!name) return null;
  if (S.project && S.project.id === id) { S.project.name = name; await save(); return name; }
  const p = await db.get('projects', id); if (!p) return null; p.name = name; await db.put('projects', p); return name;
}
export async function duplicateProject(id) {
  if (S.project && S.project.id === id) await save();
  const p = await db.get('projects', id); if (!p) return null;
  const q = JSON.parse(JSON.stringify(p)); q.id = 'p_' + uid(); q.name = await freeName((p.name || 'My video') + ' copy'); q.created = q.updated = Date.now();
  await db.put('projects', q); const th = await getThumb(id); if (th) await setThumb(q.id, th); return projectMeta(normalize(q));
}
/** Delete a project and the files only it used. When it is open, the newest other project opens (or a new empty one). */
export async function deleteProject(id) {
  await db.del('projects', id); await db.del('kv', THUMB(id));
  if (S.project && S.project.id === id) {
    const rest = (await db.all('projects')).sort((a, b) => (b.updated || 0) - (a.updated || 0));
    if (rest.length) await openById(rest[0].id); else await createProject();
  }
  return cleanUp();
}
/** Files used by any project (the open one included, even if not saved yet). */
export async function usedMedia() {
  const used = new Set(); for (const p of await db.all('projects')) for (const id of mediaIds(normalize(p))) used.add(id);
  if (S.project) for (const id of mediaIds(S.project)) used.add(id);
  for (const id of media.keys()) used.add(id);   // loaded this session: undo can still bring a deleted clip back
  return used;
}
/** Remove files no project uses; merge files stored twice (same content) into one. */
export async function cleanUp() {
  await backfillHashes();
  const recs = []; for (const id of await db.keys('media')) { const r = await db.get('media', id); if (r) recs.push({ id, hash: r.hash, added: r.added || 0 }); }
  const keepFor = new Map(), remap = new Map();
  for (const r of recs.sort((a, b) => a.added - b.added)) { if (!r.hash) continue; const k = keepFor.get(r.hash); if (k) remap.set(r.id, k); else keepFor.set(r.hash, r.id); }
  let merged = 0;
  if (remap.size) {
    const fix = p => { let n = 0; const walk = ts => { for (const t of ts) for (const c of t.clips) { if (remap.has(c.mediaId)) { c.mediaId = remap.get(c.mediaId); n++; } if (c.type === 'compound' && c.inner) walk(c.inner.tracks); } }; walk(p.tracks); if (p.canvas && remap.has(p.canvas.mediaId)) { p.canvas.mediaId = remap.get(p.canvas.mediaId); n++; } return n; };
    for (const p of await db.all('projects')) if (S.project && p.id === S.project.id) continue; else if (fix(p)) await db.put('projects', p);
    if (S.project && fix(S.project)) { await useMedia(mediaIds(S.project)); await save(); }
    merged = remap.size;
  }
  const removed = await gcMedia(await usedMedia());
  return { removed, merged };
}
/** First run after the update to many projects: the single old project simply becomes the first one in the list. */
export async function migrate() {
  if ((await db.kvGet(MIGRATED)) >= 2) return false;
  for (const p of await db.all('projects')) { let ch = false;
    if (!p.name) { p.name = 'My video'; ch = true; } if (!p.created) { p.created = p.updated || Date.now(); ch = true; } if (!p.updated) { p.updated = p.created; ch = true; }
    if (ch) await db.put('projects', p); }
  await db.kvSet(MIGRATED, 2); return true;
}

/* ---------- storage ---------- */
/** Bytes used per project (files shared by projects are counted for each) + the browser's figures. */
export async function storageInfo() {
  const sizes = new Map(); for (const id of await db.keys('media')) { const r = media.get(id) || await db.get('media', id); if (r) sizes.set(id, r.size || 0); }
  const per = {}; let files = 0; for (const v of sizes.values()) files += v;
  for (const p of await db.all('projects')) { let b = 0; for (const id of mediaIds(normalize(p))) b += sizes.get(id) || 0; per[p.id] = b; }
  let usage = files, quota = 0, persisted = false;
  try { const e = await navigator.storage.estimate(); usage = e.usage ?? usage; quota = e.quota ?? 0; } catch (e) {}
  try { persisted = await navigator.storage.persisted(); } catch (e) {}
  const free = quota ? Math.max(0, quota - usage) : Infinity;
  const level = !quota ? 'ok' : usage / quota > 0.9 || free < 300e6 ? 'full' : usage / quota > 0.7 || free < 1e9 ? 'low' : 'ok';
  return { usage, quota, free, files, per, persisted, level };
}
/** Ask the browser to keep our storage (not cleared when the phone runs low). Asked once; returns the state. */
export async function askPersist(force = false) {
  try {
    if (!navigator.storage || !navigator.storage.persist) return false;
    if (await navigator.storage.persisted()) return true;
    if (!force && localStorage.getItem('studio.persistAsked')) return false;
    localStorage.setItem('studio.persistAsked', '1'); return await navigator.storage.persist();
  } catch (e) { return false; }
}
export const fmtBytes = b => b >= 1e9 ? (b / 1e9).toFixed(1) + ' GB' : b >= 1e6 ? Math.round(b / 1e6) + ' MB' : b >= 1e3 ? Math.round(b / 1e3) + ' KB' : b + ' B';
export function ago(t, now = Date.now()) {
  const s = Math.max(0, (now - t) / 1000); if (s < 60) return 'just now'; if (s < 3600) return Math.floor(s / 60) + ' min ago'; if (s < 86400) return Math.floor(s / 3600) + ' h ago';
  if (s < 7 * 86400) { const d = Math.floor(s / 86400); return d === 1 ? 'yesterday' : d + ' days ago'; }
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: new Date(t).getFullYear() === new Date(now).getFullYear() ? undefined : 'numeric' });
}

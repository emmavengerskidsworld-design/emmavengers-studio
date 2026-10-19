/* Backup / restore: one project (or all of them) as a single .emmaproj file = ZIP of the timeline JSON + the original
   media files, byte for byte. Saved through the normal Save / Share path, so it can go to Files, Drive, WhatsApp...
   (no sign-in inside the app). Restoring keeps ids when they are free, so backup -> restore -> backup gives the same bytes. */
import * as db from './db.js';
import { S, save } from './store.js';
import { normalize, mediaIds, uid } from './project.js';
import { importFile, storedMedia } from './media.js';
import { makeZip, readZip, checkEntry } from './zip.js';
import { freeName } from './projects.js';

export const BACKUP_EXT = '.emmaproj', FORMAT = 'emmavengers-studio-backup', VERSION = 1;
const EXT = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg', 'audio/webm': 'webm' };
const extOf = r => EXT[(r.mime || '').split(';')[0]] || (r.name && /\.(\w{2,5})$/.exec(r.name)?.[1].toLowerCase()) || 'bin';
const META = ['id', 'name', 'type', 'mime', 'size', 'hash', 'added', 'duration', 'width', 'height', 'hasAudio'];
const safe = s => String(s || 'project').replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 40) || 'project';

/** Build the backup Blob for these project ids ('all' = every project). */
export async function makeBackup(ids, onProgress) {
  if (S.project) await save();
  const all = ids === 'all', projects = [];
  for (const id of all ? (await db.keys('projects')) : ids) { const p = await db.get('projects', id); if (p) projects.push(p); }
  if (!projects.length) throw new Error('Nothing to back up');
  projects.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const used = new Set(); for (const p of projects) for (const id of mediaIds(normalize(p))) used.add(id);
  const recs = []; for (const id of [...used].sort()) { const r = await storedMedia(id); if (r && r.blob) recs.push(r); else console.warn('backup: file missing', id); }
  const manifest = { format: FORMAT, version: VERSION, kind: all ? 'all' : 'project', projects: projects.map(p => ({ id: p.id, name: p.name || 'My video', file: `projects/${p.id}.json` })),
    media: recs.map(r => { const m = {}; for (const k of META) if (r[k] != null) m[k] = r[k]; m.file = `media/${r.id}.${extOf(r)}`; return m; }) };
  const files = [{ name: 'emmaproj.json', data: JSON.stringify(manifest, null, 1) }, ...projects.map(p => ({ name: `projects/${p.id}.json`, data: JSON.stringify(p) })), ...recs.map((r, i) => ({ name: manifest.media[i].file, data: r.blob }))];
  const blob = await makeZip(files, onProgress);
  const name = all ? `Emmavengers-backup-${projects.length}-projects${BACKUP_EXT}` : `${safe(projects[0].name)}${BACKUP_EXT}`;
  return { blob, name, projects: projects.length, files: recs.length, bytes: blob.size };
}
/** Restore a .emmaproj file. Returns { ids: restored project ids, files: number of files added, reused: files already here }. */
export async function restoreBackup(file, { verify = true, onProgress } = {}) {
  const z = await readZip(file), me = z.get('emmaproj.json'); if (!me) throw new Error('This is not an Emmavengers Studio backup');
  const man = JSON.parse(await me.slice().text()); if (man.format !== FORMAT) throw new Error('This is not an Emmavengers Studio backup');
  if (man.version > VERSION) throw new Error('This backup was made by a newer version of the app. Update the app first.');
  const map = new Map(); let added = 0, reused = 0, n = 0;
  for (const m of man.media) {
    const ent = z.get(m.file); if (!ent) throw new Error('Backup is missing a file: ' + m.name);
    if (verify && !(await checkEntry(ent))) throw new Error('Backup file is damaged: ' + m.name);
    const here = await db.get('media', m.id);
    if (here && (here.hash ? here.hash === m.hash : here.size === m.size)) { map.set(m.id, m.id); reused++; }
    else { const rec = await importFile(new File([ent.slice(m.mime)], m.name || m.file.split('/').pop(), { type: m.mime || '' }), { id: m.id, name: m.name, added: m.added });
      map.set(m.id, rec.id); if (rec.id === m.id) added++; else reused++; }
    onProgress && onProgress(++n / Math.max(1, man.media.length));
  }
  const ids = [];
  for (const pm of man.projects) {
    const ent = z.get(pm.file); if (!ent) continue; const p = JSON.parse(await ent.slice().text());
    const walk = ts => { for (const t of ts || []) for (const c of t.clips || []) { if (c.mediaId && map.has(c.mediaId)) c.mediaId = map.get(c.mediaId); if (c.type === 'compound' && c.inner) walk(c.inner.tracks); } }; walk(p.tracks);
    if (p.canvas && p.canvas.mediaId && map.has(p.canvas.mediaId)) p.canvas.mediaId = map.get(p.canvas.mediaId);
    if (await db.get('projects', p.id)) { p.id = 'p_' + uid(); p.name = await freeName((p.name || 'My video') + ' (restored)'); }
    await db.put('projects', normalize(p)); ids.push(p.id);
  }
  return { ids, files: added, reused, kind: man.kind };
}

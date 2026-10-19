/* App state + undo/redo + autosave. Every edit goes through act() (one undo step) or live() (continuous edits such
   as dragging a slider; call begin() first and end() after, so the whole gesture is one undo step). */
import * as db from './db.js';
import { newProject, normalize, find } from './project.js';

export const S = { project: null, sel: null, multi: [], nests: [] };
const hist = { u: [], r: [], lu: [], lr: [], tu: [], tr: [] }, LIMIT = 100;   // u/r = snapshots, lu/lr = labels, tu/tr = times
const subs = { change: new Set(), select: new Set(), history: new Set(), multi: new Set() };
let nextLabel = null;
/** Name the next undo step (shown in the history panel). */
export const label = l => { nextLabel = l; };
export const on = (ev, f) => subs[ev].add(f);
const emit = (ev, ...a) => subs[ev].forEach(f => f(...a));
export const snap = () => JSON.stringify(S.project);

export function act(fn, l) { if (l) nextLabel = l; const b = snap(); const r = fn(S.project); normalize(S.project); push(b); changed(); return r; }
export function live(fn) { const r = fn(S.project); normalize(S.project); changed(); return r; }
let gesture = null;
export const begin = () => { gesture ??= snap(); };
export const end = () => { if (gesture != null) { push(gesture); gesture = null; emit('history'); } };
function push(before) { const l = nextLabel; nextLabel = null; if (before === snap()) return; hist.u.push(before); hist.lu.push(l || guessLabel(before)); hist.tu.push(Date.now());
  if (hist.u.length > LIMIT) { hist.u.shift(); hist.lu.shift(); hist.tu.shift(); } hist.r = []; hist.lr = []; hist.tr = []; emit('history'); }
/** A readable name for an unnamed step: what changed between the snapshot and now. */
function guessLabel(before) {
  try { const a = JSON.parse(before), b = S.project, n = p => p.tracks.reduce((k, t) => k + t.clips.length, 0);
    if (n(b) > n(a)) return 'Add clip'; if (n(b) < n(a)) return 'Delete clip';
    if ((b.markers || []).length !== (a.markers || []).length) return 'Marker';
    if (a.aspect !== b.aspect) return 'Ratio ' + b.aspect;
    const ids = new Map(); for (const t of a.tracks) for (const c of t.clips) ids.set(c.id, JSON.stringify(c));
    for (const t of b.tracks) for (const c of t.clips) { const o = ids.get(c.id); if (o && o !== JSON.stringify(c)) { const x = JSON.parse(o);
      for (const k of ['start', 'in', 'out', 'dur', 'speed', 'volume', 'filter', 'effects', 'transform', 'keyframes', 'text', 'anim', 'color', 'transitionIn']) if (JSON.stringify(x[k]) !== JSON.stringify(c[k])) return ({ start: 'Move clip', in: 'Trim', out: 'Trim', dur: 'Trim', speed: 'Speed', volume: 'Volume', filter: 'Filter', effects: 'Effect', transform: 'Move / scale', keyframes: 'Keyframe', text: 'Edit text', anim: 'Animation', color: 'Colour', transitionIn: 'Transition' })[k];
      return 'Edit clip'; } }
  } catch (e) {} return 'Edit'; }
/** Undo history for the panel: oldest first; index = number of steps back from now (0 = current). */
export function history() { return { past: hist.lu.map((l, i) => ({ label: l, t: hist.tu[i], back: hist.u.length - i })), future: hist.lr.map((l, i) => ({ label: l, t: hist.tr[i], fwd: hist.lr.length - i })).reverse() }; }
/** Jump n steps back (n > 0) or forward (n < 0) in one go. */
export function jump(n) { if (n > 0) for (let i = 0; i < n && hist.u.length; i++) stepU(); else for (let i = 0; i < -n && hist.r.length; i++) stepR(); fixSel(); changed(); emit('history'); }
function stepU() { hist.r.push(snap()); hist.lr.push(hist.lu.pop()); hist.tr.push(hist.tu.pop()); S.project = JSON.parse(hist.u.pop()); }
function stepR() { hist.u.push(snap()); hist.lu.push(hist.lr.pop()); hist.tu.push(hist.tr.pop()); S.project = JSON.parse(hist.r.pop()); }
export const canUndo = () => hist.u.length > 0, canRedo = () => hist.r.length > 0;
export function undo() { if (!hist.u.length) return; stepU(); fixSel(); changed(); emit('history'); }
export function redo() { if (!hist.r.length) return; stepR(); fixSel(); changed(); emit('history'); }
function fixSel() { if (S.sel && !find(S.project, S.sel)) select(null); setMulti(S.multi.filter(id => find(S.project, id))); }
export function select(id) { if (id == null && S.multi.length) setMulti([]); if (S.sel === id) return; S.sel = id; emit('select', id); }
/* ---------- multi-select ---------- */
export function setMulti(ids) { const n = [...new Set(ids)]; if (n.join() === S.multi.join()) return; S.multi = n; emit('multi', n); }
export function toggleMulti(id) { const has = S.multi.includes(id); let n = has ? S.multi.filter(x => x !== id) : [...S.multi, id];
  if (!has && S.sel && S.sel !== id && !n.includes(S.sel) && !S.multi.length) n = [S.sel, ...n]; setMulti(n); if (n.length) select(n[n.length - 1]); else select(null); }
export const multiIds = () => S.multi.length ? S.multi.filter(id => find(S.project, id)) : (S.sel ? [S.sel] : []);
/* ---------- editing inside a compound clip ---------- */
const clone = x => JSON.parse(JSON.stringify(x));
/** Write the open (inner) timeline back into the compound clip of every level above it; returns the root project. */
export function syncNests() {
  let inner = S.project;
  for (let i = S.nests.length - 1; i >= 0; i--) { const n = S.nests[i], f = find(n.root, n.id); if (!f) break; const c = f.clip;
    const D = inner.tracks.reduce((m, t) => Math.max(m, ...t.clips.map(x => x.start + (x.type === 'video' || x.type === 'audio' ? (x.out - x.in) / (x.speed || 1) : x.dur))), 0.1);
    c.inner = { tracks: clone(inner.tracks), v: (c.inner?.v || 0) + 1 }; const full = Math.abs(n.dur0 - (n.d0 - (c.off || 0))) < 1e-3; c.dur = Math.round(Math.max(0.1, full ? D - (c.off || 0) : Math.min(n.dur0, D - (c.off || 0))) * 1e6) / 1e6; normalize(n.root); inner = n.root; }
  return inner;
}
export function enterNest(id) {
  const f = find(S.project, id); if (!f || f.clip.type !== 'compound') return false; const c = f.clip;
  const inner = { ...S.project, tracks: clone(c.inner.tracks), _nest: (S.project._nest || 0) + 1, markers: undefined, name: c.name || 'Compound clip' };
  const d0 = (c.inner.tracks || []).reduce((m, t) => Math.max(m, ...t.clips.map(x => x.start + (x.type === 'video' || x.type === 'audio' ? (x.out - x.in) / (x.speed || 1) : x.dur))), 0);
  S.nests.push({ root: S.project, id, before: snap(), hist: { ...hist, u: [...hist.u], r: [...hist.r], lu: [...hist.lu], lr: [...hist.lr], tu: [...hist.tu], tr: [...hist.tr] }, dur0: c.dur, d0 });
  S.project = normalize(inner); Object.assign(hist, { u: [], r: [], lu: [], lr: [], tu: [], tr: [] }); select(null); setMulti([]); emit('change'); emit('history'); return true;
}
export function exitNest() {
  if (!S.nests.length) return false; const root = syncNests(), n = S.nests.pop(); S.project = n.root;
  Object.assign(hist, n.hist); const now = snap(); if (now !== n.before) { nextLabel = 'Edit compound clip'; hist.r = []; hist.lr = []; hist.tr = []; push(n.before); }
  select(n.id); setMulti([]); changed(); emit('history'); return root;
}
export const selected = () => S.sel && find(S.project, S.sel);

let saveTimer = 0, dirty = false;
function changed() { dirty = true; emit('change'); clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }
/** Save the open project. Its "last edited" time only moves when something was changed. */
export async function save() { clearTimeout(saveTimer); if (!S.project) return; const P = S.nests.length ? syncNests() : S.project; if (dirty || !P.updated) P.updated = Date.now(); dirty = false; await db.put('projects', P); await db.kvSet('current', S.project.id); }
export async function load() {
  const id = await db.kvGet('current'); let p = id && await db.get('projects', id);
  if (!p) { const all = await db.all('projects'); p = all.sort((a, b) => (b.updated || 0) - (a.updated || 0))[0]; }   // current one missing: newest project
  if (!p) { p = newProject(); await db.put('projects', p); }
  await db.kvSet('current', p.id);
  S.project = normalize(p); return p;
}
/** Switch to another (already stored or brand-new) project: saves the open one first, fresh undo history. */
export async function openProject(p) {
  if (S.project && S.project.id !== p.id) await save();
  if (S.nests.length) { syncNests(); S.nests = []; }
  S.project = normalize(p); Object.assign(hist, { u: [], r: [], lu: [], lr: [], tu: [], tr: [] }); setMulti([]); gesture = null; select(null); dirty = false;
  await save(); emit('change'); emit('history');
}
/** Old name kept for callers: a template / new project now opens as its own project (nothing is deleted). */
export const useProject = openProject;
export async function reset() { await openProject(newProject()); }
addEventListener('pagehide', () => save());
document.addEventListener('visibilitychange', () => document.hidden && save());

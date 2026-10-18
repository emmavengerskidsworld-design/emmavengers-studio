/* App state + undo/redo + autosave. Every edit goes through act() (one undo step) or live() (continuous edits such
   as dragging a slider; call begin() first and end() after, so the whole gesture is one undo step). */
import * as db from './db.js';
import { newProject, normalize, find } from './project.js';

export const S = { project: null, sel: null };
const hist = { u: [], r: [] }, LIMIT = 100;
const subs = { change: new Set(), select: new Set(), history: new Set() };
export const on = (ev, f) => subs[ev].add(f);
const emit = (ev, ...a) => subs[ev].forEach(f => f(...a));
export const snap = () => JSON.stringify(S.project);

export function act(fn) { const b = snap(); const r = fn(S.project); normalize(S.project); push(b); changed(); return r; }
export function live(fn) { const r = fn(S.project); normalize(S.project); changed(); return r; }
let gesture = null;
export const begin = () => { gesture ??= snap(); };
export const end = () => { if (gesture != null) { push(gesture); gesture = null; emit('history'); } };
function push(before) { if (before === snap()) return; hist.u.push(before); if (hist.u.length > LIMIT) hist.u.shift(); hist.r = []; emit('history'); }
export const canUndo = () => hist.u.length > 0, canRedo = () => hist.r.length > 0;
export function undo() { if (!hist.u.length) return; hist.r.push(snap()); S.project = JSON.parse(hist.u.pop()); fixSel(); changed(); emit('history'); }
export function redo() { if (!hist.r.length) return; hist.u.push(snap()); S.project = JSON.parse(hist.r.pop()); fixSel(); changed(); emit('history'); }
function fixSel() { if (S.sel && !find(S.project, S.sel)) select(null); }
export function select(id) { if (S.sel === id) return; S.sel = id; emit('select', id); }
export const selected = () => S.sel && find(S.project, S.sel);

let saveTimer = 0;
function changed() { emit('change'); clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }
export async function save() { clearTimeout(saveTimer); if (!S.project) return; S.project.updated = Date.now(); await db.put('projects', S.project); await db.kvSet('current', S.project.id); }
export async function load() {
  const id = await db.kvGet('current'); let p = id && await db.get('projects', id);
  if (!p) { p = newProject(); await db.put('projects', p); await db.kvSet('current', p.id); }
  S.project = normalize(p); return p;
}
export async function reset() {
  const old = S.project; S.project = newProject(); hist.u = []; hist.r = []; select(null);
  if (old) await db.del('projects', old.id);
  await save(); changed(); emit('history');
}
/** Make p the current project (a template, for example): replaces the current one, fresh undo history. */
export async function useProject(p) {
  const old = S.project; S.project = normalize(p); hist.u = []; hist.r = []; select(null);
  if (old && old.id !== p.id) await db.del('projects', old.id);
  await save(); changed(); emit('history');
}
addEventListener('pagehide', () => save());
document.addEventListener('visibilitychange', () => document.hidden && save());

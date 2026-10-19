/* Batch 11 performance: proxy editing, preview frame cache, adaptive preview resolution and a memory guard.
   - Proxies: 1080p-and-up videos get a small (540p short side) copy made in the background with the app's own encoder.
     The preview plays the proxy; export ALWAYS reads the original file (framesource opens rec.blob, never the proxy).
   - Frame cache: settled preview frames (paused / scrubbing) are kept as ImageBitmaps, keyed by project version + frame.
   - Memory guard: every cache reports its bytes; above the budget the least useful ones are trimmed. */
import * as db from './db.js';
import { media } from './media.js';

export const PROXY_SHORT = 540, PROXY_MIN = 1080;
const listeners = new Set(); export const onPerf = f => listeners.add(f); const emit = () => listeners.forEach(f => { try { f(); } catch (e) {} });
let enabled = true;
export const proxiesOn = p => !(p && p.perf && p.perf.proxy === false);
export const needsProxy = rec => rec && rec.type === 'video' && Math.min(rec.width || 0, rec.height || 0) >= PROXY_MIN;
export const proxyState = new Map();   // mediaId -> 'queued' | 'making' | 'ready' | 'failed'
const queue = []; let busy = false, encoder = null;
/** encoder(rec, W, H) -> Promise<Blob>: set by the app (uses exportVideo on a one-clip project). */
export const setProxyEncoder = f => { encoder = f; };
/** URL the preview should play for this media (proxy when ready and wanted, else the original). */
export function playUrl(rec, p) { return enabled && proxiesOn(p) && rec.proxy && rec.proxy.url ? rec.proxy.url : rec.url; }
export const usingProxy = (rec, p) => playUrl(rec, p) !== rec.url;
export function proxySize(rec) { const w = rec.width, h = rec.height, k = PROXY_SHORT / Math.min(w, h), ev = x => Math.max(2, Math.round(x * k / 2) * 2); return { W: ev(w), H: ev(h) }; }
/** Make sure every big video of the project has a proxy (loads stored ones, queues the rest). */
export async function ensureProxies(p) {
  if (!proxiesOn(p)) return;
  for (const id of mediaIdsOf(p)) { const rec = media.get(id); if (!needsProxy(rec) || rec.proxy || proxyState.has(id)) continue;
    const blob = await db.kvGet('proxy:' + id).catch(() => null);
    if (blob && blob.size) { setProxy(rec, blob); continue; }
    proxyState.set(id, 'queued'); queue.push(id); }
  pump();
}
function setProxy(rec, blob) { const { W, H } = proxySize(rec); rec.proxy = { url: URL.createObjectURL(blob), size: blob.size, W, H }; proxyState.set(rec.id, 'ready'); emit(); }
async function pump() {
  if (busy || !encoder) return; busy = true;
  try { while (queue.length) { const id = queue.shift(), rec = media.get(id); if (!rec || rec.proxy) continue; proxyState.set(id, 'making'); emit();
      const t0 = performance.now();
      try { const { W, H } = proxySize(rec), blob = await encoder(rec, W, H); await db.kvSet('proxy:' + id, blob).catch(() => {}); setProxy(rec, blob); rec.proxy.secs = (performance.now() - t0) / 1000; }
      catch (e) { console.warn('proxy failed', rec.name, e); proxyState.set(id, 'failed'); emit(); } } }
  finally { busy = false; }
}
export const proxiesBusy = () => busy || queue.length > 0;
export async function dropProxy(id) { const rec = media.get(id); if (rec && rec.proxy) { URL.revokeObjectURL(rec.proxy.url); delete rec.proxy; } proxyState.delete(id); await db.del('kv', 'proxy:' + id).catch(() => {}); emit(); }
function mediaIdsOf(p) { const s = new Set(), walk = ts => { for (const t of ts) for (const c of t.clips) { if (c.mediaId) s.add(c.mediaId); if (c.type === 'compound' && c.inner) walk(c.inner.tracks); } }; walk(p.tracks); return s; }

/* ---------- preview frame cache ---------- */
export class FrameCache {
  constructor(maxBytes = 96e6) { this.map = new Map(); this.bytes = 0; this.max = maxBytes; this.hits = 0; this.miss = 0; }
  get(k) { const v = this.map.get(k); if (v) { this.map.delete(k); this.map.set(k, v); this.hits++; return v.bm; } this.miss++; return null; }
  put(k, bm) { if (this.map.has(k)) this.drop(k); const b = bm.width * bm.height * 4; this.map.set(k, { bm, b }); this.bytes += b; this.trim(this.max); }
  drop(k) { const v = this.map.get(k); if (!v) return; this.map.delete(k); this.bytes -= v.b; try { v.bm.close(); } catch (e) {} }
  trim(to) { for (const k of this.map.keys()) { if (this.bytes <= to) break; this.drop(k); } }
  clear() { for (const k of [...this.map.keys()]) this.drop(k); }
  get size() { return this.map.size; }
}

/* ---------- memory guard ---------- */
const caches = new Map();   // name -> { bytes(), trim(toBytes), prio }  (lower prio = trimmed first)
export const registerCache = (name, c) => caches.set(name, c);
let budgetOverride = 0; export const setBudget = b => { budgetOverride = b || 0; };
export function budget() { if (budgetOverride) return budgetOverride; const gb = navigator.deviceMemory || 4; return Math.round(Math.max(192e6, Math.min(1.2e9, gb * 128e6))); }
export function memStats() {
  const out = {}; let total = 0; for (const [n, c] of caches) { const b = Math.max(0, c.bytes() || 0); out[n] = b; total += b; }
  const heap = performance.memory ? performance.memory.usedJSHeapSize : null;
  return { total, budget: budget(), caches: out, heap, trims: guardTrims };
}
let guardTrims = 0, timer = 0;
/** Trim caches (least important first) until the total is under `frac` of the budget. Returns bytes freed. */
export function guard(frac = 1) {
  const lim = budget() * frac; let s = memStats(), freed = 0; if (s.total <= lim) return 0;
  for (const [n, c] of [...caches].sort((a, b) => (a[1].prio || 0) - (b[1].prio || 0))) { const over = s.total - lim; if (over <= 0) break;
    const b0 = c.bytes(); c.trim(Math.max(0, b0 - over)); const d = b0 - c.bytes(); freed += d; s.total -= d; }
  if (freed > 0) { guardTrims++; emit(); } return freed;
}
export function startGuard(ms = 3000) { clearInterval(timer); timer = setInterval(() => guard(1), ms); }
/** Long projects: more than 10 minutes or 80 clips. */
export const isLong = (p, D) => D > 600 || p.tracks.reduce((n, t) => n + t.clips.length, 0) > 80;
export const setProxyEnabled = v => { enabled = !!v; emit(); };

/* Performance sheet + wiring: proxies, frame cache, smooth preview, memory guard, before/after benchmark. */
import { S, live, on } from './store.js';
import { projectDuration, newClip } from './project.js';
import { openSheet } from './panels.js';
import { media, onMediaUpdate, bitmapBytes, trimBitmaps, audioCacheBytes, trimAudioCache } from './media.js';
import { bakedBytes, trimBaked } from './audio.js';
import { activeVisual } from './compound.js';
import * as perf from './perf.js';

let X = null;
const mb = b => (b / 1e6).toFixed(b < 1e7 ? 1 : 0) + ' MB';
export function initPerf(ctx) {
  X = ctx; const P = X.player;
  perf.setProxyEncoder(async (rec, W, H) => {
    const ex = await import('./export.js');
    const p = { id: 'proxy_' + rec.id, name: 'proxy', aspect: '9:16', fps: 30, bg: '#000000', loudness: { on: false }, duck: { on: false },
      tracks: [{ id: 't_px', kind: 'main', clips: [newClip('video', { mediaId: rec.id, in: 0, out: rec.duration, start: 0 })] }] };
    const r = await ex.exportVideo(p, { short: Math.min(W, H), size: { W, H }, fps: 30, quality: 'standard' }); return r.blob;
  });
  on('change', () => P.invalidate()); onMediaUpdate(() => P.invalidate());
  // the timeline only needs a redraw when a proxy badge changes (not when the memory guard trims caches), and never mid-drag
  let tlSig = '', tlT = 0; const tlSoon = () => { clearTimeout(tlT); if (X.timeline.drag || X.timeline.box) { tlT = setTimeout(tlSoon, 120); return; } X.timeline.render(); };
  perf.onPerf(() => { P.invalidate(); P.sync(P.t); P.requestDraw(); const sig = [...perf.proxyState].join('|') + perf.proxiesOn(S.project); if (sig !== tlSig) { tlSig = sig; tlSoon(); } });
  // proxies are made in the background, but never while a finger / mouse is busy on the editor (no jank during drags)
  let pt = 0, lastInput = 0; for (const ev of ['pointerdown', 'pointermove', 'wheel']) addEventListener(ev, () => { lastInput = performance.now(); }, { capture: true, passive: true });
  const run = () => { if (performance.now() - lastInput < 1500) { pt = setTimeout(run, 600); return; } perf.ensureProxies(S.project).catch(e => console.warn('proxies', e)); };
  const proxies = () => { clearTimeout(pt); pt = setTimeout(run, 800); };
  on('change', proxies); onMediaUpdate(proxies); proxies();
  perf.registerCache('frames', { prio: 0, bytes: () => P.fcache.bytes, trim: to => P.fcache.trim(to) });
  perf.registerCache('decoded-audio', { prio: 1, bytes: audioCacheBytes, trim: trimAudioCache });
  perf.registerCache('baked-audio', { prio: 2, bytes: bakedBytes, trim: trimBaked });
  perf.registerCache('photos', { prio: 3, bytes: bitmapBytes, trim: to => trimBitmaps(to, new Set(activeVisual(S.project, P.t).map(c => c.mediaId))) });
  perf.startGuard(3000);
  let warned = null; on('change', () => { const p = S.project, D = projectDuration(p), long = perf.isLong(p, D);
    P.fcache.max = long ? 48e6 : 128e6; if (long && warned !== p.id) { warned = p.id; X.toast('Long project: lighter preview caches and proxies keep editing smooth'); } });
  P.adaptive = !(S.project.perf && S.project.perf.adaptive === false);
}
/** Play `secs` from t0 and report the preview frame rate. */
export async function bench(secs = 3, t0 = 0) {
  const P = X.player; P.pause(); P.seek(t0); await new Promise(r => setTimeout(r, 400));
  P.stats = { frames: 0, ms: 0, hits: 0, cached: 0, slow: 0, t0: performance.now(), list: [] }; P.lowScale = 1; P._ema = null;
  let raf = 0, n = 0; const tick = () => { n++; raf = requestAnimationFrame(tick); };
  const a = performance.now(); P.play(); tick(); await new Promise(r => setTimeout(r, secs * 1000)); cancelAnimationFrame(raf); P.pause(); const el = (performance.now() - a) / 1000;
  const L = [...P.stats.list].sort((x, y) => x - y);
  return { fps: P.stats.frames / el, draws: P.stats.frames, avgMs: P.stats.ms / Math.max(1, P.stats.frames), p95: L[Math.floor(L.length * .95)] || 0, slow: P.stats.slow, raf: n / el, lowScale: P.lowScale };
}
export function perfSheet() {
  openSheet('Performance', body => {
    const P = X.player, p = S.project;
    const row = (label, on, id, f) => { const b = document.createElement('button'); b.className = 'chipbtn' + (on ? ' on' : ''); b.id = id; b.textContent = label; b.onclick = () => { f(); b.classList.toggle('on'); fill(); }; return b; };
    const tg = document.createElement('div'); tg.className = 'toggles';
    tg.append(row('Proxy editing', perf.proxiesOn(p), 'pxOn', () => live(q => { q.perf = { ...(q.perf || {}), proxy: !perf.proxiesOn(q) }; })),
      row('Smooth preview', P.adaptive, 'adOn', () => { P.adaptive = !P.adaptive; live(q => { q.perf = { ...(q.perf || {}), adaptive: P.adaptive }; }); }),
      row('Free memory now', false, 'memFree', () => { perf.guard(0.25); P.fcache.clear(); }));
    const info = document.createElement('div'); info.className = 'perfinfo'; info.id = 'perfInfo';
    const fill = () => { const st = perf.memStats(), vids = [...new Set(activeAll())].map(id => media.get(id)).filter(perf.needsProxy);
      info.innerHTML = `<h4>Proxies</h4>` + (vids.length ? vids.map(r => `<div class="pxrow"><span>${esc(r.name)} · ${r.width}×${r.height}</span><b>${r.proxy ? (perf.usingProxy(r, p) ? 'playing ' : 'ready ') + r.proxy.W + '×' + r.proxy.H + ' · ' + mb(r.proxy.size) : perf.proxyState.get(r.id) || 'waiting'}</b></div>`).join('') : '<p class="hint">No 1080p or bigger videos in this project.</p>')
        + `<p class="hint">Big videos (1080p, 4K) get a small copy for smooth editing. Export always uses the original files at full quality.</p>`
        + `<h4>Memory</h4><div class="membar"><i style="width:${Math.min(100, st.total / st.budget * 100).toFixed(1)}%"></i></div><p class="hint">${mb(st.total)} of ${mb(st.budget)} budget${st.heap ? ` · JS heap ${mb(st.heap)}` : ''}</p>`
        + Object.entries(st.caches).map(([k, v]) => `<div class="pxrow"><span>${k}</span><b>${mb(v)}</b></div>`).join('')
        + `<h4>Preview</h4><div class="pxrow"><span>Frame cache</span><b>${P.fcache.size} frames · ${P.stats.hits} reused</b></div>`
        + (P.lastDraw ? `<div class="pxrow"><span>Last frame</span><b>${P.lastDraw.ms.toFixed(1)} ms${P.lastDraw.cached ? ' (cached)' : ''}</b></div>` : ''); };
    body.append(tg, info); fill(); const iv = setInterval(() => { if (!document.body.contains(info)) clearInterval(iv); else fill(); }, 1000);
  }, { className: 'tall' });
}
const activeAll = () => { const s = []; const walk = ts => { for (const t of ts) for (const c of t.clips) { if (c.mediaId) s.push(c.mediaId); if (c.type === 'compound' && c.inner) walk(c.inner.tracks); } }; walk(S.project.tracks); return s; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

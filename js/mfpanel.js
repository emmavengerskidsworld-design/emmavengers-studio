/* Multi-format export sheet: platform presets, per-format manual crop (keyframable), safe-area check, export queue. */
import { openSheet, chips, slider } from './panels.js';
import { renderFrame } from './render.js';
import { outputSize } from './export.js';
import * as M from './multiformat.js';

const LAST = 'evs-mf-last';
export function mfSheet(ctx) {
  const { S, act, player, toast } = ctx, p0 = S.project;
  let sel = JSON.parse(localStorage.getItem(LAST) || 'null') || ['youtube', 'shorts', 'igpost'], cur = null, jobs = [], running = false;
  const need = () => [...new Set(sel.map(id => M.platformById(id)?.aspect).filter(Boolean))];
  openSheet('Multi-format export', body => {
    body.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: `One project → every shape. Your video is ${p0.aspect}; other shapes use your own crop (move / zoom, keyframes) or fit with a blurred background.` }));
    const plats = document.createElement('div'); plats.className = 'mfplats'; plats.id = 'mfPlatforms';
    const drawPlats = () => { plats.innerHTML = ''; for (const P of M.planQueue(S.project, M.PLATFORMS.map(x => x.id))) { const l = document.createElement('label'); l.className = 'mfp'; l.dataset.id = P.id;
      l.innerHTML = `<input type="checkbox" ${sel.includes(P.id) ? 'checked' : ''}><b>${P.name}</b><small>${P.aspect} · ${P.note} · ~${P.estMB} MB${P.warn.length ? ' · <em>' + P.warn.join(', ') + '</em>' : ''}</small>`;
      l.querySelector('input').onchange = e => { sel = e.target.checked ? [...new Set([...sel, P.id])] : sel.filter(x => x !== P.id); localStorage.setItem(LAST, JSON.stringify(sel)); drawFmts(); go.textContent = `Export ${sel.length} video${sel.length === 1 ? '' : 's'}`; }; plats.append(l); } };
    const fmts = document.createElement('div'); fmts.id = 'mfFmtWrap';
    const ed = document.createElement('div'); ed.className = 'mfedit'; ed.id = 'mfEdit';
    const cv = document.createElement('canvas'); cv.id = 'mfPrev'; cv.className = 'mfprev';
    const safe = document.createElement('div'); safe.id = 'mfSafe'; safe.className = 'mfsafe';
    const modeW = document.createElement('div');
    const sx = slider('Left / right', { min: 0, max: 1, step: .01, value: .5, fmt: v => Math.round(v * 100) + '%', id: 'mfX', onInput: v => camEdit({ x: v }) });
    const sy = slider('Up / down', { min: 0, max: 1, step: .01, value: .5, fmt: v => Math.round(v * 100) + '%', id: 'mfY', onInput: v => camEdit({ y: v }) });
    const sz = slider('Zoom', { min: 1, max: 3, step: .01, value: 1, fmt: v => v.toFixed(2) + '×', id: 'mfZ', onInput: v => camEdit({ z: v }) });
    const kr = document.createElement('div'); kr.className = 'capbtns';
    const kb = (id, label, fn) => { const b = Object.assign(document.createElement('button'), { className: 'chipbtn', id, textContent: label }); b.onclick = fn; kr.append(b); return b; };
    kb('mfKey', '◆ Keyframe at playhead', () => { const c = M.camAt(M.fmtOf(S.project, cur), player.t); act(p => M.setKey(p, cur, player.t, c), 'Format keyframe'); info(); draw(); });
    kb('mfClear', 'Clear keyframes', () => { const c = M.camAt(M.fmtOf(S.project, cur), player.t); act(p => M.setFormat(p, cur, { keys: [{ t: 0, ...c }] }), 'Clear format keyframes'); info(); draw(); });
    kb('mfFix', 'Fit text into safe area', () => fixSafe());
    const kinfo = document.createElement('small'); kinfo.id = 'mfKeys';
    ed.append(modeW, cv, safe, sx, sy, sz, kr, kinfo);
    function camEdit(d) { const f = M.fmtOf(S.project, cur), keys = f.keys || [], t = player.t;
      const near = keys.find(k => Math.abs(k.t - t) < .04) || (keys.length === 1 ? keys[0] : null);
      if (near) act(p => { const ff = M.fmtOf(p, cur); const kk = ff.keys.map(k => k === near || (Math.abs(k.t - near.t) < 1e-6) ? { ...k, ...d } : k); M.setFormat(p, cur, { keys: kk }); }, 'Reframe');
      else act(p => M.setKey(p, cur, t, { ...M.camAt(f, t), ...d }), 'Reframe');
      draw(); }
    function drawFmts() { fmts.innerHTML = ''; const list = need().filter(a => a !== S.project.aspect);
      if (!list.length) { ed.hidden = true; fmts.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'All chosen platforms use your video\'s own shape.' })); return; }
      if (!list.includes(cur)) cur = list[0]; ed.hidden = false;
      const c = chips(list.map(a => ({ value: a, label: 'Reframe ' + a })), cur, v => { cur = v; sync(); }, 'mffmts'); c.id = 'mfFmt'; fmts.append(c); sync(); }
    function sync() { const f = M.fmtOf(S.project, cur); modeW.innerHTML = '';
      const m = chips([{ value: 'crop', label: 'Crop (move & zoom)' }, { value: 'fit', label: 'Fit + blur' }], f.mode, v => { act(p => M.setFormat(p, cur, { mode: v }), 'Format mode'); sync(); }, 'mfmode'); m.id = 'mfMode'; modeW.append(m);
      const c = M.camAt(f, player.t); sx.set(c.x); sy.set(c.y); sz.set(c.z); [sx, sy, sz].forEach(s => s.hidden = f.mode === 'fit'); info(); draw(); }
    function info() { const f = M.fmtOf(S.project, cur); kinfo.textContent = `${(f.keys || []).length} keyframe${(f.keys || []).length === 1 ? '' : 's'}: ` + (f.keys || []).map(k => k.t.toFixed(1) + 's').join(', '); }
    const boxesAt = (pf, W, H) => t => { const c = new OffscreenCanvas(W, H), x = c.getContext('2d'); return renderFrame(x, W, H, pf, t, cl => player.source(cl)) || []; };
    function draw() { if (!cur) return; const pf = M.reframed(S.project, cur), dpr = Math.min(2, devicePixelRatio || 1), { W: w0, H: h0 } = outputSize(cur, 1080), k = Math.min(260 / w0, 220 / h0);
      const W = Math.round(w0 * k * dpr), H = Math.round(h0 * k * dpr); cv.width = W; cv.height = H; cv.style.width = W / dpr + 'px'; cv.style.height = H / dpr + 'px';
      const x = cv.getContext('2d'); renderFrame(x, W, H, pf, player.t, c => player.source(c));
      const [l, t, r, b] = M.SAFE[cur]; x.save(); x.setLineDash([6, 5]); x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 1.5; x.strokeRect(l * W, t * H, W * (1 - l - r), H * (1 - t - b)); x.restore();
      const bad = M.safeCheck(pf, cur, W, H, boxesAt(pf, W, H)); safe.innerHTML = bad.length ? '⚠️ ' + bad.map(z => `<span class="${z.level}">“${z.name}” ${z.level === 'cut' ? 'is cut off' : 'is outside the safe area'} at ${z.t.toFixed(1)}s</span>`).join(' ') : '✅ All text and stickers are inside the safe area';
      safe.dataset.bad = bad.length; }
    function fixSafe() { // zoom out / re-centre the camera keys until every box is safe (manual tool, no AI: simple search)
      const f = M.fmtOf(S.project, cur); if (f.mode === 'fit') { toast('Fit mode keeps the whole picture'); return; }
      const W = 216, H = Math.round(216 * outputSize(cur, 1080).H / outputSize(cur, 1080).W); let best = null;
      for (const z of [1, 1.1, 1.25]) for (const y of [.5, .45, .55, .4, .6, .35, .65, .3, .7]) for (const xx of [.5, .4, .6]) { const keys = [{ t: 0, x: xx, y, z }];
        const pf = { ...S.project, aspect: cur, reframe: { src: S.project.aspect, mode: 'crop', keys } }, n = M.safeCheck(pf, cur, W, H, boxesAt(pf, W, H)).length;
        if (!best || n < best.n) best = { n, keys }; if (!n) break; }
      act(p => M.setFormat(p, cur, { keys: best.keys }), 'Fit text into safe area'); sync(); toast(best.n ? `${best.n} item(s) still outside — try Fit + blur` : 'Everything is inside the safe area'); }
    const go = Object.assign(document.createElement('button'), { className: 'bigbtn', id: 'mfGo', textContent: `Export ${sel.length} video${sel.length === 1 ? '' : 's'}` });
    const queue = document.createElement('div'); queue.id = 'mfQueue'; queue.className = 'mfqueue';
    const saveAll = Object.assign(document.createElement('button'), { className: 'chipbtn', id: 'mfSaveAll', textContent: 'Save all', hidden: true });
    saveAll.onclick = () => { for (const j of jobs) if (j.blob) ctx.downloadBlob(j.blob, j.file); };
    go.onclick = async () => { if (running) { jobs.forEach(j => j.signal.aborted = true); return; } if (!sel.length) { toast('Pick at least one platform'); return; }
      running = true; go.textContent = 'Cancel'; saveAll.hidden = true; queue.innerHTML = ''; const plan = M.planQueue(S.project, sel), base = (S.project.name || 'video').replace(/[^\w\- ]+/g, '').trim() || 'video';
      jobs = plan.map(P => ({ P, signal: {}, file: `${base}-${P.id}-${P.aspect.replace(':', 'x')}.mp4` }));
      for (const j of jobs) { const r = document.createElement('div'); r.className = 'mfrow'; r.dataset.id = j.P.id; r.innerHTML = `<b>${j.P.name}</b> <small>${j.P.aspect}</small><i class="bar"><u style="width:0%"></u></i><span class="st">waiting</span>`; queue.append(r); j.row = r; }
      player.pause();
      for (const j of jobs) { const st = j.row.querySelector('.st'), bar = j.row.querySelector('u'); st.textContent = 'exporting…'; j.row.classList.add('busy');
        try { const pf = M.reframed(S.project, j.P.aspect), t0 = performance.now();
          const r = await ctx.exportVideo(pf, { short: j.P.short, fps: j.P.fps, vbr: j.P.mbps * 1e6, maxBytes: j.P.maxMB ? j.P.maxMB * 1e6 : undefined, signal: j.signal, onProgress: e => { if (e && e.phase === 'video') bar.style.width = Math.round(e.p * 100) + '%'; } });
          j.blob = r.blob; j.secs = (performance.now() - t0) / 1000; bar.style.width = '100%'; st.innerHTML = `${(r.blob.size / 1e6).toFixed(1)} MB <button class="chipbtn mfsave">Save</button>`; j.row.classList.replace('busy', 'done');
          st.querySelector('.mfsave').onclick = () => ctx.downloadBlob(j.blob, j.file);
        } catch (e) { j.error = String(e && e.message || e); st.textContent = e && e.name === 'AbortError' ? 'cancelled' : 'failed'; j.row.classList.replace('busy', 'failed'); if (e && e.name === 'AbortError') break; } }
      running = false; go.textContent = `Export ${sel.length} video${sel.length === 1 ? '' : 's'}`; saveAll.hidden = !jobs.some(j => j.blob); ctx.onQueueDone && ctx.onQueueDone(jobs);
      toast(`${jobs.filter(j => j.blob).length} of ${jobs.length} videos ready`); };
    body.append(plats, fmts, ed, go, queue, saveAll); drawPlats(); drawFmts();
    ctx.expose && ctx.expose({ jobs: () => jobs, draw, sync, setCur: a => { cur = a; sync(); } });
  }, { className: 'mfsheet' });
}

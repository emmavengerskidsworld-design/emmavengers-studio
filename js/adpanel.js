/* Beat Ad Maker sheet: pick photos / videos (drag to reorder), a style, a beat-marked song (or your own music: beats are
   detected, with tap tempo as a fallback), shape, length and words -> a normal project. */
import { openSheet, closeSheet, chips } from './panels.js';
import { icon } from './icons.js';
import { AD_STYLES, AD_LENGTHS, adStyle, buildAd, DEFAULT_TITLE, DEFAULT_CTA } from './admaker.js';
import { detectBeats, TapTempo } from './beats.js';
import { loadCatalog } from './library.js';
import { decodeAudio } from './media.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const KEY = 'studio.adLast';
export const libBeat = it => ({ bpm: it.bpm, m: it.meter || 4, o: it.beat0 || 0, dr: it.drops || [], sec: it.secs || [], nb: it.nb || 0 });

export function adSheet(X, preset) {
  const last = JSON.parse(localStorage.getItem(KEY) || '{}');
  const s = window.__adState = preset ? JSON.parse(JSON.stringify(preset)) : { items: [], music: null, style: last.style || 'promo', aspect: last.aspect || '9:16', length: last.length || 30, title: DEFAULT_TITLE, cta: DEFAULT_CTA, logo: true, seed: 1 };
  let audio = null, playing = null, cat = null, q = '', detected = null; const tt = new TapTempo();
  const stop = () => { if (audio) { audio.pause(); audio = null; } playing = null; };
  openSheet('Beat Ad Maker', async body => {
    body.innerHTML = `<p class="hint">Pick photos and videos, a style and a song. The app cuts on the beat — then edit anything you like.</p>
      <h4 class="adh">1 · Photos &amp; videos <small id="adCount"></small></h4>
      <div class="admedia" id="adMedia"></div>
      <input type="file" id="adFiles" accept="image/*,video/*" multiple hidden>
      <h4 class="adh">2 · Style</h4><div class="adstyles" id="adStyles"></div>
      <h4 class="adh">3 · Music <small id="adBeatInfo"></small></h4>
      <label class="sndsearch">${icon('search', 18)}<input id="adMusicQ" type="search" placeholder="Search beat-marked songs" autocomplete="off"></label>
      <div class="admusic" id="adMusic"></div>
      <div class="adrow"><button class="btn ghost" id="adMyMusic">${icon('music', 18)} My own music</button><button class="btn ghost" id="adTap" hidden>${icon('beat', 18)} Tap the beat</button></div>
      <input type="file" id="adAudioFile" accept="audio/*,video/mp4" hidden>
      <h4 class="adh">4 · Shape &amp; length</h4><div id="adAspect"></div><div id="adLength"></div>
      <h4 class="adh">5 · Words</h4>
      <label class="ctl adtxt"><span class="cl">Title</span><input class="txtin" id="adTitle" maxlength="60"></label>
      <label class="ctl adtxt"><span class="cl">Call to action</span><input class="txtin" id="adCta" maxlength="80"></label>
      <label class="adchk"><input type="checkbox" id="adLogo"> Emmavengers logo at the end + Subscribe</label>
      <button class="btn primary big" id="adMake">${icon('beat', 20)} Make my ad</button>`;
    const $ = q => body.querySelector(q);
    $('#adTitle').value = s.title ?? DEFAULT_TITLE; $('#adCta').value = s.cta ?? DEFAULT_CTA; $('#adLogo').checked = s.logo !== false;
    $('#adTitle').oninput = e => { s.title = e.target.value; }; $('#adCta').oninput = e => { s.cta = e.target.value; }; $('#adLogo').onchange = e => { s.logo = e.target.checked; };
    // ---- media grid with drag-to-reorder
    const grid = $('#adMedia');
    const renderMedia = () => {
      grid.innerHTML = ''; $('#adCount').textContent = s.items.length ? `${s.items.length} picked · drag to reorder` : '';
      s.items.forEach((id, i) => { const r = X.media.get(id); if (!r) return; const d = document.createElement('div'); d.className = 'adtile'; d.dataset.i = i; d.dataset.id = id;
        d.innerHTML = (r.type === 'video' ? `<video muted playsinline preload="metadata" src="${r.url}#t=0.4"></video><i>${Math.round(r.duration)}s</i>` : `<img alt="" src="${r.url}">`) + `<b>${i + 1}</b><button class="ib adx" aria-label="Remove">${icon('x', 14)}</button>`;
        d.querySelector('.adx').onclick = e => { e.stopPropagation(); s.items.splice(i, 1); renderMedia(); };
        grid.append(d); });
      const add = document.createElement('button'); add.className = 'adtile adadd'; add.id = 'adAdd'; add.innerHTML = icon('plus', 26) + '<span>Add</span>'; add.onclick = () => { $('#adFiles').value = ''; $('#adFiles').click(); }; grid.append(add);
    };
    let drag = null;
    grid.addEventListener('pointerdown', e => { const t = e.target.closest('.adtile:not(.adadd)'); if (!t || e.target.closest('.adx')) return; drag = { el: t, i: +t.dataset.i, x: e.clientX, y: e.clientY, on: false }; t.setPointerCapture(e.pointerId); });
    grid.addEventListener('pointermove', e => { if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (!drag.on && Math.hypot(dx, dy) > 8) { drag.on = true; drag.el.classList.add('drag'); }
      if (drag.on) drag.el.style.transform = `translate(${dx}px,${dy}px) scale(1.06)`; });
    const drop = e => { if (!drag) return; const d = drag; drag = null; d.el.classList.remove('drag'); d.el.style.transform = ''; if (!d.on) return;
      d.el.style.visibility = 'hidden'; const over = document.elementFromPoint(e.clientX, e.clientY)?.closest('.adtile'); d.el.style.visibility = '';
      let j = over ? (over.classList.contains('adadd') ? s.items.length - 1 : +over.dataset.i) : d.i; if (j !== d.i) { const [x] = s.items.splice(d.i, 1); s.items.splice(j, 0, x); } renderMedia(); };
    grid.addEventListener('pointerup', drop); grid.addEventListener('pointercancel', drop);
    $('#adFiles').onchange = async e => { const files = [...e.target.files]; if (!files.length) return; X.busy(true, 'Adding…');
      try { for (const f of files) { try { const r = await X.importFile(f); s.items.push(r.id); } catch (err) { console.warn(err); X.toast('Could not add ' + f.name); } } } finally { X.busy(false); } renderMedia(); };
    // ---- styles
    const sw = $('#adStyles'); const renderStyles = () => { sw.innerHTML = AD_STYLES.map(st => `<button class="adstyle${st.id === s.style ? ' on' : ''}" data-v="${st.id}" style="--c:${st.col}"><b>${esc(st.name)}</b><small>${esc(st.desc)}</small></button>`).join(''); };
    sw.onclick = e => { const b = e.target.closest('.adstyle'); if (!b) return; s.style = b.dataset.v; renderStyles(); if (!s.music || s.music.lib) { s.music = null; renderMusic(true); } };
    // ---- music
    const C = await loadCatalog().catch(() => null); const beatItems = C ? C.items.filter(i => i.kind === 'music' && i.bpm > 0 && i.dur > 12) : [];
    const ml = $('#adMusic');
    function renderMusic(autopick) {
      const st = adStyle(s.style), words = q.toLowerCase().split(/\s+/).filter(Boolean);
      let list = beatItems.filter(i => words.every(w => i.name.toLowerCase().includes(w) || i.cat.includes(w) || i.tags.some(t => t.includes(w)) || w === i.bpm + 'bpm'));
      const rank = i => (st.music.indexOf(i.cat) + 1 || 99) * 1000 + (st.minBpm && i.bpm < st.minBpm ? 500 : 0) + (i.pack.endsWith('-2') ? 0 : 100);
      list = [...list].sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name)).slice(0, q ? 40 : 8);
      if (autopick && list.length && !s.music) { const it = list[0]; s.music = { lib: true, url: it.url, name: it.name, beat: libBeat(it), dur: it.dur, id: it.id }; }
      ml.innerHTML = list.map(it => `<div class="snd admrow${s.music && s.music.id === it.id ? ' on' : ''}" data-id="${esc(it.id)}"><button class="ib sp" data-play="${esc(it.id)}" aria-label="Play">${icon(playing === it.id ? 'pause' : 'play', 16)}</button>
        <span class="sn"><b>${esc(it.name)}</b><small>${Math.round(it.dur)}s · ${it.bpm} BPM · ${esc(it.cat)}</small></span><button class="chipbtn sa" data-use="${esc(it.id)}">${s.music && s.music.id === it.id ? icon('check', 14) + ' Picked' : 'Use'}</button></div>`).join('') || '<p class="hint">No songs found.</p>';
      info();
    }
    const info = () => { const m = s.music; $('#adBeatInfo').textContent = m ? `${m.name} · ♩ ${Math.round(m.beat.bpm * 10) / 10} BPM${m.beat.tapped ? ' · tapped' : m.beat.auto ? ` · detected${m.beat.conf != null ? ` (${Math.round(m.beat.conf * 100)}%)` : ''}` : ''}` : 'pick a song'; $('#adTap').hidden = !(m && !m.lib); };
    ml.onclick = e => { const pb = e.target.closest('[data-play]'), ub = e.target.closest('[data-use]');
      if (pb) { const id = pb.dataset.play, was = playing; stop(); if (was !== id) { const it = beatItems.find(i => i.id === id); audio = new Audio(it.url); playing = id; audio.play().catch(() => X.toast('Could not play — are you offline?')); } renderMusic(); }
      if (ub) { const it = beatItems.find(i => i.id === ub.dataset.use); s.music = { lib: true, url: it.url, name: it.name, beat: libBeat(it), dur: it.dur, id: it.id }; renderMusic(); } };
    let tm = 0; $('#adMusicQ').oninput = e => { clearTimeout(tm); tm = setTimeout(() => { q = e.target.value; renderMusic(); }, 120); };
    $('#adMyMusic').onclick = () => { $('#adAudioFile').value = ''; $('#adAudioFile').click(); };
    $('#adAudioFile').onchange = async e => { const f = e.target.files[0]; if (!f) return; stop(); X.busy(true, 'Finding the beat…');
      try { const r = await X.importFile(f); const buf = await decodeAudio(r); if (!buf) throw new Error('no sound in this file');
        detected = detectBeats(buf) || { bpm: 120, m: 4, o: 0, dr: [], auto: true, conf: 0 }; tt.reset();
        s.music = { lib: false, mediaId: r.id, name: r.name.replace(/\.\w+$/, ''), beat: detected, dur: r.duration, id: r.id }; renderMusic();
        X.toast(detected.conf < .3 ? `Beat found (${Math.round(detected.bpm)} BPM) but not sure — tap the beat to fix it` : `Beat found: ${Math.round(detected.bpm)} BPM`, 3500);
      } catch (err) { console.warn(err); X.toast('Could not read this music: ' + (err.message || err)); } finally { X.busy(false); } };
    $('#adTap').onclick = () => { const m = s.music; if (!m || m.lib) return; const r = X.media.get(m.mediaId);
      if (!audio) { audio = new Audio(r.url); playing = m.id; audio.play().catch(() => {}); tt.reset(); $('#adTap').innerHTML = icon('beat', 18) + ' Tap on every beat…'; return; }
      const res = tt.tap(audio.currentTime); if (res) { m.beat = { ...res, dr: (detected && detected.dr) || [] }; $('#adTap').innerHTML = `${icon('beat', 18)} ${Math.round(res.bpm)} BPM · keep tapping`; info(); } };
    // ---- shape, length
    $('#adAspect').append(chips([{ value: '9:16', html: '<b>9:16</b><small>TikTok · Shorts</small>' }, { value: '16:9', html: '<b>16:9</b><small>YouTube</small>' }, { value: '1:1', html: '<b>1:1</b><small>Square</small>' }], s.aspect, v => { s.aspect = v; }, 'big adaspect'));
    $('#adLength').append(chips(AD_LENGTHS.map(v => ({ value: v, label: v === 'song' ? 'Whole song' : v + ' s' })), s.length, v => { s.length = v === 'song' ? 'song' : +v; }, 'adlength'));
    $('#adMake').onclick = () => make(X, s, stop);
    renderMedia(); renderStyles(); renderMusic(true);
  }, { className: 'tall', gesture: false, onClose: () => stop() });
}
export async function make(X, s, stop = () => {}) {
  if (!s.items.length) { X.toast('Add some photos or videos first'); return; }
  if (!s.music) { X.toast('Pick a song first'); return; }
  stop(); localStorage.setItem(KEY, JSON.stringify({ style: s.style, aspect: s.aspect, length: s.length }));
  closeSheet(); X.busy(true, 'Making your ad…');
  try { const { project, plan } = await buildAd(X, s, u => X.busy(true, `Making your ad… ${Math.round(u * 100)}%`)); await X.openProject(project);
    X.toast(`Ad ready: ${plan.cuts.length} shots cut on the beat · tap Shuffle for another version`, 3500); window.__adPlan = plan; }
  catch (e) { console.warn(e); X.toast('Could not make the ad: ' + (e.message || e), 4000); } finally { X.busy(false); }
}
/** Another version of the open ad (new seed): same pictures, song and style — replaces the project content (undoable). */
export async function shuffleAd(X) {
  const p = X.S.project; if (!p.ad) return; X.busy(true, 'Shuffling…');
  try { const o = { ...p.ad, seed: (p.ad.seed || 1) + 1 }; const { project, plan } = await buildAd(X, o);
    X.act(q => { q.tracks = project.tracks; q.ad = project.ad; q.aspect = project.aspect; }); X.afterEdit(); window.__adPlan = plan; X.toast(`New version ${o.seed}: ${plan.cuts.length} shots`); }
  catch (e) { console.warn(e); X.toast('Could not shuffle: ' + (e.message || e)); } finally { X.busy(false); }
}

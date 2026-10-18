/* Sounds library: music + sound effects, all CC0 / public domain (see LICENSES.md).
   Data-driven and built to grow to thousands of sounds:
   - lib/sounds/index.json lists packs; each pack has its own pack.json with its items. Adding a pack = one entry.
   - Nothing is precached: a sound downloads when you preview or add it (the service worker keeps it), and
     favourites are saved for offline use. Added sounds are stored inside the project like any imported audio. */
import { openSheet, chips } from './panels.js';
import { addSoundBlob } from './audiopanels.js';
import { icon } from './icons.js';

const BASE = new URL('../lib/sounds/', import.meta.url).href, LIB_CACHE = 'evs-lib-v1';
export const SFX_CATS = [
  ['cartoon', 'Cartoon'], ['animals', 'Animals'], ['nature', 'Nature'], ['funny', 'Funny'], ['magic', 'Magic & sparkle'], ['whoosh', 'Whoosh & transition'],
  ['game', 'Game & UI'], ['cheers', 'Kids, cheers & applause'], ['household', 'Household'], ['weather', 'Weather'], ['bible', 'Bible-story ambience'],
  ['instruments', 'Instruments'], ['voices', 'Voices & reactions'],
];
export const MUSIC_CATS = [['happy', 'Happy'], ['calm', 'Calm'], ['worship', 'Worship & hymns'], ['adventure', 'Adventure'], ['lullaby', 'Lullaby'], ['funny', 'Funny'], ['jingles', 'Jingles & stingers']];
let catalog = null;
/** Load the catalogue (index + every pack manifest; small JSON files). */
export function loadCatalog() {
  if (catalog) return catalog;
  catalog = (async () => {
    const idx = await (await fetch(BASE + 'index.json')).json(), items = [], packs = [];
    await Promise.all(idx.packs.map(async p => { try {
      const m = await (await fetch(BASE + p.dir + '/pack.json')).json(); packs.push({ ...p, ...m, items: undefined });
      for (const it of m.items) items.push({ id: p.dir + '/' + it.f, url: BASE + p.dir + '/' + it.f, name: it.n, cat: it.c, tags: it.t || [], dur: it.d, kind: m.kind || p.kind, pack: p.dir, author: it.a || m.author, license: it.l || m.license, src: it.s || m.source });
    } catch (e) { console.warn('sound pack failed', p.dir, e); } }));
    items.sort((a, b) => a.name.localeCompare(b.name));
    return { packs, items };
  })().catch(e => { catalog = null; throw e; });
  return catalog;
}
const favs = () => new Set(JSON.parse(localStorage.getItem('studio.favSounds') || '[]'));
const saveFavs = s => localStorage.setItem('studio.favSounds', JSON.stringify([...s]));
async function keepOffline(url) { try { const c = await caches.open(LIB_CACHE); if (!(await c.match(url))) { const r = await fetch(url); if (r.ok) await c.put(url, r); } } catch (e) {} }
export function searchItems(items, { kind, cat, q, fav }) {
  const words = (q || '').toLowerCase().split(/\s+/).filter(Boolean), F = fav ? favs() : null;
  return items.filter(it => it.kind === kind && (!cat || it.cat === cat) && (!F || F.has(it.id)) && words.every(w => it.name.toLowerCase().includes(w) || it.tags.some(t => t.includes(w)) || it.cat.includes(w)));
}
const fmtD = d => d < 60 ? d.toFixed(1) + 's' : Math.floor(d / 60) + ':' + String(Math.round(d % 60)).padStart(2, '0');

export function soundsSheet(X, startKind = 'sfx') {
  const P = X.player; let kind = startKind, cat = '', q = '', fav = false, audio = null, playing = null, shown = 80;
  openSheet('Sounds', async body => {
    const tabs = chips([{ value: 'music', label: 'Music' }, { value: 'sfx', label: 'Sound effects' }], kind, v => { kind = v; cat = ''; fav = false; shown = 80; cats(); list(); }, 'tabs sndtabs');
    const sb = Object.assign(document.createElement('label'), { className: 'sndsearch' }); sb.innerHTML = `${icon('search', 18)}<input id="sndSearch" type="search" placeholder="Search sounds (e.g. sheep, pop, rain)" autocomplete="off">`;
    const catRow = document.createElement('div'), ul = Object.assign(document.createElement('div'), { className: 'sndlist', id: 'sndList' }), foot = Object.assign(document.createElement('p'), { className: 'hint', id: 'sndInfo' });
    body.append(tabs, sb, catRow, ul, foot);
    ul.textContent = 'Loading sounds…';
    let C; try { C = await loadCatalog(); } catch (e) { ul.textContent = 'Could not load the sound library. Connect to the internet once to open it.'; return; }
    const cats = () => { const defs = kind === 'music' ? MUSIC_CATS : SFX_CATS, have = new Set(C.items.filter(i => i.kind === kind).map(i => i.cat));
      const c = chips([{ value: '', label: 'All' }, { value: '*', html: `${icon('star', 14)} Favourites` }, ...defs.filter(([id]) => have.has(id)).map(([id, l]) => ({ value: id, label: l }))], fav ? '*' : cat, v => { fav = v === '*'; cat = fav ? '' : v; shown = 80; list(); }, 'sndcats');
      catRow.replaceChildren(c); };
    const stop = () => { if (audio) { audio.pause(); audio = null; } if (playing) { const b = ul.querySelector(`[data-play="${CSS.escape(playing)}"]`); b && (b.innerHTML = icon('play', 16)); } playing = null; };
    const list = () => {
      const res = searchItems(C.items, { kind, cat, q, fav }), F = favs();
      ul.innerHTML = res.length ? '' : `<p class="hint">${fav ? 'No favourites yet — tap ☆ on a sound to keep it (also offline).' : 'No sounds found.'}</p>`;
      for (const it of res.slice(0, shown)) {
        const r = document.createElement('div'); r.className = 'snd'; r.dataset.id = it.id;
        r.innerHTML = `<button class="ib sp" data-play="${it.id}" aria-label="Play">${icon(playing === it.id ? 'pause' : 'play', 16)}</button><span class="sn"><b>${it.name}</b><small>${fmtD(it.dur)} · ${(kind === 'music' ? MUSIC_CATS : SFX_CATS).find(c => c[0] === it.cat)?.[1] || it.cat}</small></span>` +
          `<button class="ib sf${F.has(it.id) ? ' on' : ''}" data-fav="${it.id}" aria-label="Favourite">${icon('star', 16)}</button><button class="chipbtn sa" data-add="${it.id}">${icon('plus', 14)} Add</button>`;
        ul.append(r);
      }
      if (res.length > shown) { const m = document.createElement('button'); m.className = 'btn ghost'; m.id = 'sndMore'; m.textContent = `Show more (${res.length - shown})`; m.onclick = () => { shown += 120; list(); }; ul.append(m); }
      foot.textContent = `${res.length} ${kind === 'music' ? 'music tracks' : 'sound effects'} · ${C.items.length} sounds in ${C.packs.length} packs · all free to use (CC0 / public domain)`;
    };
    ul.onclick = async e => {
      const pb = e.target.closest('[data-play]'), fb = e.target.closest('[data-fav]'), ab = e.target.closest('[data-add]');
      if (pb) { const id = pb.dataset.play; if (playing === id) { stop(); return; } stop(); const it = C.items.find(i => i.id === id);
        if (P.playing) P.pause(); audio = new Audio(it.url); playing = id; pb.innerHTML = icon('pause', 16); audio.onended = stop; audio.play().catch(() => { X.toast('Could not play — are you offline?'); stop(); }); }
      if (fb) { const s = favs(), id = fb.dataset.fav; if (s.has(id)) s.delete(id); else { s.add(id); keepOffline(C.items.find(i => i.id === id).url); } saveFavs(s); fb.classList.toggle('on', s.has(id)); if (fav) list(); }
      if (ab) { const it = C.items.find(i => i.id === ab.dataset.add); ab.disabled = true; stop();
        try { const r = await fetch(it.url); if (!r.ok) throw new Error(r.status); const blob = await r.blob(); keepOffline(it.url);
          await addSoundBlob(blob, it.name + '.' + it.url.split('.').pop(), P.t); X.timeline.render(); X.toast('Added ' + it.name); }
        catch (err) { console.warn(err); X.toast('Could not download this sound — check the internet connection'); }
        ab.disabled = false; }
    };
    const inp = sb.querySelector('input'); let tmr = 0; inp.oninput = () => { clearTimeout(tmr); tmr = setTimeout(() => { q = inp.value; shown = 80; list(); }, 120); };
    cats(); list();
  }, { className: 'tall', gesture: false, onClose: () => { if (audio) audio.pause(); } });
}

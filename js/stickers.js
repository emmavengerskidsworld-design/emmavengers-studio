/* Sticker library (data-driven: lib/stickers/index.json, built by tools/stickers/build_library.py).
   Emmavengers 3D art, Noto 3D emoji (Apache-2.0) and our own designs (CC0). Pictures load lazily (only the open category,
   <img loading="lazy">); the service worker keeps what was used, favourites are kept for offline use.
   A sticker becomes a normal photo clip on an overlay track; animated stickers come with a Combo loop. */
import { openSheet, chips } from './panels.js';
import { icon } from './icons.js';
const BASE = new URL('../lib/stickers/', import.meta.url).href, LIB_CACHE = 'evs-lib-v1', FAV = 'studio.favStickers', MEDIA = 'studio.stickerMedia';
let lib = null;
export function loadStickers() {
  if (lib) return lib;
  lib = fetch(BASE + 'index.json').then(r => { if (!r.ok) throw new Error('stickers ' + r.status); return r.json(); })
    .then(L => { for (const it of L.items) { it.url = BASE + it.file; it.hay = (it.name + ' ' + (it.tags || []).join(' ') + ' ' + it.cat).toLowerCase(); } return L; })
    .catch(e => { lib = null; throw e; });
  return lib;
}
export const favs = () => new Set(JSON.parse(localStorage.getItem(FAV) || '[]'));
export function toggleFav(id) { const s = favs(); s.has(id) ? s.delete(id) : s.add(id); localStorage.setItem(FAV, JSON.stringify([...s])); return s.has(id); }
async function keepOffline(url) { try { const c = await caches.open(LIB_CACHE); if (!(await c.match(url))) { const r = await fetch(url); if (r.ok) await c.put(url, r); } } catch (e) {} }
/** Filter: cat = category id | 'fav' | 'anim' | '' (all), q = search words (name, tags, category). */
export function filterStickers(L, { cat, q }) {
  const words = (q || '').toLowerCase().split(/\s+/).filter(Boolean), F = cat === 'fav' ? favs() : null;
  return L.items.filter(it => (!cat || (cat === 'fav' ? F.has(it.id) : cat === 'anim' ? !!it.anim : it.cat === cat)) && words.every(w => it.hay.includes(w)));
}
/** Add a sticker at time t: imports the picture once (re-used afterwards), then puts it on an overlay track. */
export async function addSticker(X, it, t) {
  const { media, importFile, act, newClip, addToKind, DEFAULT_TRANSFORM, select } = X;
  const map = JSON.parse(localStorage.getItem(MEDIA) || '{}');
  let rec = map[it.id] && media.get(map[it.id]);
  if (!rec) {
    const r = await fetch(it.url); if (!r.ok) throw new Error('sticker download failed');
    const blob = await r.blob(); rec = await importFile(new File([blob], it.name + '.' + (it.file.split('.').pop() || 'webp'), { type: blob.type || 'image/webp' }));
    map[it.id] = rec.id; localStorage.setItem(MEDIA, JSON.stringify(map));
  }
  const big = it.cat === 'frames', c = newClip('image', { mediaId: rec.id, dur: 3, sticker: it.id, fit: 'contain', transform: { ...DEFAULT_TRANSFORM, scale: big ? 0.9 : 0.36 } });
  if (it.anim) c.anim = { combo: { id: it.anim, dur: 1.2 } };
  act(p => addToKind(p, 'overlay', c, t)); select(c.id); keepOffline(it.url); return c;
}
export function stickerSheet(X) {
  let cat = 'emma-characters', q = '', shown = 60;
  openSheet('Stickers', async body => {
    const sb = Object.assign(document.createElement('label'), { className: 'sndsearch' });
    sb.innerHTML = `${icon('search', 18)}<input id="stkSearch" type="search" placeholder="Search stickers (e.g. lion, star, A)" autocomplete="off">`;
    const catRow = document.createElement('div'), grid = Object.assign(document.createElement('div'), { className: 'stkgrid', id: 'stkGrid' }), foot = Object.assign(document.createElement('p'), { className: 'hint', id: 'stkInfo' });
    body.append(sb, catRow, grid, foot); grid.textContent = 'Loading stickers…';
    let L; try { L = await loadStickers(); } catch (e) { grid.textContent = 'Could not load the sticker library. Connect to the internet once to open it.'; return; }
    const cats = [{ value: 'fav', html: icon('heart', 14) + ' Favourites' }, { value: 'anim', html: icon('anim', 14) + ' Animated' }, ...L.cats.map(c => ({ value: c.id, label: c.name }))];
    const catChips = chips(cats, cat, v => { cat = v; shown = 60; list(); }, 'tabs stkcats'); catRow.append(catChips);
    const list = () => {
      const all = filterStickers(L, { cat: q ? '' : cat, q }), F = favs(); grid.innerHTML = '';
      if (!all.length) grid.innerHTML = `<p class="hint">${cat === 'fav' && !q ? 'Tap the heart on a sticker to keep it here.' : 'No stickers found.'}</p>`;
      for (const it of all.slice(0, shown)) {
        const b = document.createElement('button'); b.className = 'stk' + (it.anim ? ' anim' : ''); b.dataset.id = it.id; b.title = it.name;
        b.innerHTML = `<img loading="lazy" decoding="async" alt="${it.name.replace(/"/g, '&quot;')}" src="${it.url}"><span class="fav${F.has(it.id) ? ' on' : ''}" role="button" aria-label="Favourite">${icon('heart', 14)}</span>${it.anim ? `<span class="am">${icon('anim', 12)}</span>` : ''}`;
        b.onclick = async e => {
          if (e.target.closest('.fav')) { e.stopPropagation(); const on = toggleFav(it.id); e.target.closest('.fav').classList.toggle('on', on); if (on) keepOffline(it.url); else if (cat === 'fav') list(); return; }
          b.classList.add('busy'); try { await addSticker(X, it, X.player.t); X.toast('Added ' + it.name + (it.anim ? ' (animated)' : '')); } catch (err) { console.warn(err); X.toast('Could not add this sticker'); } finally { b.classList.remove('busy'); }
        };
        grid.append(b);
      }
      if (all.length > shown) { const m = document.createElement('button'); m.className = 'chipbtn more'; m.id = 'stkMore'; m.textContent = `Show more (${all.length - shown})`; m.onclick = () => { shown += 90; list(); }; grid.append(m); }
      foot.textContent = q ? `${all.length} stickers for “${q}”` : `${all.length} stickers · ${L.items.length} in the library · tap to add, ♥ to keep as favourite`;
    };
    const inp = sb.querySelector('input'); let h = 0; inp.oninput = () => { clearTimeout(h); h = setTimeout(() => { q = inp.value.trim(); shown = 60; catChips.style.opacity = q ? .45 : 1; list(); }, 160); };
    list();
  }, { className: 'tall', gesture: false });
}

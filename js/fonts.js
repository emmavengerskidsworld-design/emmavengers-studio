/* Bundled open-licence fonts, loaded on demand with FontFace (lib/ is runtime-cached, so a font used once works offline).
   drawText asks for its font every frame; the first ask starts the download, and onFontLoad() lets the preview redraw.
   The exporter and stills await ensureProjectFonts() first, so an export never uses a fallback font. */
import { FONT_LIST } from './fontlist.js';
const BASE = new URL('../lib/fonts/', import.meta.url).href;
const state = new Map(), listeners = new Set();
export const BUNDLED = new Set(FONT_LIST.map(f => f[0]));
export const fontFamily = id => 'EVF-' + id;
export let fontsVersion = 0;
export const onFontLoad = fn => { listeners.add(fn); return () => listeners.delete(fn); };
export const fontLoaded = id => !BUNDLED.has(id) || state.get(id) === true;
export function ensureFont(id) {
  if (!BUNDLED.has(id) || typeof FontFace === 'undefined') return Promise.resolve(true);
  const s = state.get(id); if (s === true) return Promise.resolve(true); if (s && s.then) return s;
  const p = new FontFace(fontFamily(id), `url(${BASE}${id}.woff2) format("woff2")`, { display: 'swap' }).load()
    .then(f => { (self.document ? document.fonts : self.fonts).add(f); state.set(id, true); fontsVersion++; listeners.forEach(fn => { try { fn(id); } catch (e) {} }); return true; })
    .catch(e => { console.warn('font', id, e); state.set(id, false); return false; });
  state.set(id, p); return p;
}
/** Every bundled font a project uses (text + captions). */
const textFonts = tracks => (tracks || []).flatMap(t => t.clips.flatMap(c => c.type === 'text' ? [c.text.font] : c.type === 'compound' && c.inner ? textFonts(c.inner.tracks) : []));   // compounds too (brand intro, kids cards)
export const projectFonts = p => [...new Set(textFonts(p.tracks))].filter(id => BUNDLED.has(id));
import { ensureLuts } from './colorpro.js';
/** Fonts + colour LUTs a project needs (called before preview, stills and export). */
export const ensureProjectFonts = p => Promise.all([...projectFonts(p).map(ensureFont), ensureLuts(p)]);

/* Brand Kit sheet. ctx = { S, act, toast, busy, media, importFile, mediaFor, player, timeline } */
import { openSheet, chips, slider } from './panels.js';
import { FONT_LIST } from './fontlist.js';
import * as B from './brandkit.js';
import { LOGO_URL } from './admaker.js';

/** Make sure the kit has at least the Emmavengers logo (downloaded once, then kept in the media store). */
export async function ensureKitLogo(ctx, k = B.getKit()) {
  if (ctx.loadMedia) await ctx.loadMedia(k.logos || []);
  if (B.kitLogo(k) && ctx.media.get(B.kitLogo(k))) return k;
  k.logos = (k.logos || []).filter(id => ctx.media.get(id));
  if (!k.logos.length) { try { const rec = await ctx.mediaFor(ctx, LOGO_URL, 'emma-logo.webp'); k.logos = [rec.id]; k.logo = 0; } catch (e) { console.warn('brand logo', e); } }
  return B.saveKit(k, false);
}
export async function applyKit(ctx, o = {}) { const k = await ensureKitLogo(ctx); ctx.act(p => B.applyBrand(p, k, o), 'Apply brand kit'); ctx.timeline.render(); return k; }
const FONTS = FONT_LIST.filter(f => ['kids', 'display', 'sans', 'fun', 'hand', 'serif'].includes(f[2]) || true).slice(0, 18);
export function brandSheet(ctx) {
  let k = B.getKit(); const save = () => { B.saveKit(k); };
  openSheet('Brand Kit', async body => {
    const sec = (t, id) => { const h = Object.assign(document.createElement('h4'), { className: 'bkh', textContent: t }); if (id) h.id = id; body.append(h); };
    body.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'Save your logo, colours, fonts, intro / outro, watermark and call-to-action lines once. One tap puts them on any project; Beat Ad Maker and templates use them too.' }));
    sec('Logos');
    const logos = document.createElement('div'); logos.className = 'bklogos'; logos.id = 'bkLogos'; body.append(logos);
    const file = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', id: 'bkLogoFile', hidden: true }); body.append(file);
    const drawLogos = () => { logos.innerHTML = '';
      (k.logos || []).forEach((id, i) => { const r = ctx.media.get(id); if (!r) return; const b = document.createElement('button'); b.className = 'bklogo' + (i === (k.logo || 0) ? ' on' : ''); b.dataset.i = i;
        const im = document.createElement('img'); im.alt = r.name || 'logo'; ctx.media.thumbUrl ? (im.src = ctx.media.thumbUrl(r)) : (r.url && (im.src = r.url)); b.append(im);
        const x = Object.assign(document.createElement('span'), { className: 'bkx', textContent: '×' }); x.onclick = e => { e.stopPropagation(); k.logos.splice(i, 1); k.logo = 0; save(); drawLogos(); }; b.append(x);
        b.onclick = () => { k.logo = i; save(); drawLogos(); }; logos.append(b); });
      const add = Object.assign(document.createElement('button'), { className: 'bklogo add', id: 'bkLogoAdd', textContent: '+ Logo' }); add.onclick = () => { file.value = ''; file.click(); }; logos.append(add); };
    file.onchange = async () => { const f = file.files[0]; if (!f) return; const rec = await ctx.importFile(f); if (!rec || rec.type !== 'image') { ctx.toast('Please pick a picture'); return; } k.logos = [...(k.logos || []), rec.id]; k.logo = k.logos.length - 1; save(); drawLogos(); ctx.toast('Logo saved to your Brand Kit'); };
    k = await ensureKitLogo(ctx, k); drawLogos();
    sec('Brand colours');
    const cols = document.createElement('div'); cols.className = 'bkcolors'; cols.id = 'bkColors';
    k.colors.forEach((c, i) => { const inp = Object.assign(document.createElement('input'), { type: 'color', value: c }); inp.dataset.i = i; inp.oninput = () => { k.colors[i] = inp.value; save(); }; cols.append(inp); }); body.append(cols);
    sec('Fonts');
    const fc = (id, key) => { const w = chips(FONTS.map(f => ({ value: f[0], html: `<span style="font-family:'EVF-${f[0]}'">${f[1]}</span>` })), k.fonts[key], v => { k.fonts[key] = v; save(); }, 'bkfonts'); w.id = id; return w; };
    body.append(Object.assign(document.createElement('small'), { textContent: 'Titles' }), fc('bkTitleFont', 'title'), Object.assign(document.createElement('small'), { textContent: 'Text & captions' }), fc('bkBodyFont', 'body'));
    const tog = (id, label, obj, key) => { const l = document.createElement('label'); l.className = 'bktog'; l.innerHTML = `<input type="checkbox" id="${id}"${obj[key] ? ' checked' : ''}> ${label}`; l.querySelector('input').onchange = e => { obj[key] = e.target.checked; save(); }; return l; };
    sec('Intro'); body.append(tog('bkIntroOn', 'Start videos with my intro', k.intro, 'on'));
    const ist = chips(B.INTRO_STYLES.map(([value, label]) => ({ value, label })), k.intro.style, v => { k.intro.style = v; save(); }); ist.id = 'bkIntro'; body.append(ist);
    const it = Object.assign(document.createElement('input'), { type: 'text', id: 'bkIntroTitle', value: k.intro.title || '', placeholder: 'Intro title (optional)' }); it.className = 'bkinput'; it.oninput = () => { k.intro.title = it.value; save(); }; body.append(it);
    sec('Outro'); body.append(tog('bkOutroOn', 'End videos with my outro', k.outro, 'on'));
    const ost = chips(B.OUTRO_STYLES.map(([value, label]) => ({ value, label })), k.outro.style, v => { k.outro.style = v; save(); }); ost.id = 'bkOutro'; body.append(ost);
    sec('Watermark'); body.append(tog('bkWmOn', 'Show my logo as a watermark', k.watermark, 'on'));
    const wp = chips(B.WM_POS.map(([value, label]) => ({ value, label })), k.watermark.pos, v => { k.watermark.pos = v; save(); }); wp.id = 'bkWmPos'; body.append(wp);
    body.append(slider('Opacity', { min: .1, max: 1, step: .05, value: k.watermark.opacity, fmt: v => Math.round(v * 100) + '%', id: 'bkWmOp', onInput: v => { k.watermark.opacity = v; save(); } }));
    body.append(slider('Size', { min: .06, max: .4, step: .01, value: k.watermark.scale, fmt: v => Math.round(v * 100) + '%', id: 'bkWmSize', onInput: v => { k.watermark.scale = v; save(); } }));
    sec('Call-to-action lines');
    const ta = Object.assign(document.createElement('textarea'), { id: 'bkCta', rows: 3, value: (k.cta || []).join('\n') }); ta.className = 'bkinput'; ta.oninput = () => { k.cta = ta.value.split('\n').map(s => s.trim()).filter(Boolean); save(); }; body.append(ta);
    body.append(tog('bkAuto', 'Use my Brand Kit in Beat Ad Maker & templates', k, 'auto'));
    const row = document.createElement('div'); row.className = 'capbtns';
    const btn = (id, label, fn, cls = 'chipbtn') => { const b = Object.assign(document.createElement('button'), { className: cls, id, textContent: label }); b.onclick = fn; row.append(b); return b; };
    btn('bkApply', 'Apply to this project', async () => { if (!ctx.S.project.tracks.some(t => t.clips.length)) { ctx.toast('Add some clips first'); return; } ctx.busy(true, 'Applying your brand…'); try { await applyKit(ctx); ctx.toast('Brand Kit applied'); } finally { ctx.busy(false); } }, 'chipbtn on');
    btn('bkCtaAdd', 'Add CTA at playhead', () => { ctx.act(p => B.ctaClip(p, k, 0, ctx.player.t), 'Add call to action'); ctx.timeline.render(); });
    btn('bkRemove', 'Remove brand', () => { ctx.act(p => B.removeBrand(p), 'Remove brand'); ctx.timeline.render(); });
    btn('bkReset', 'Reset kit', () => { k = B.saveKit(B.DEFAULT_KIT(), false); brandSheet(ctx); });
    body.append(row);
  }, { className: 'bksheet' });
}

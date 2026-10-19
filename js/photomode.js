/* Photo mode: edit one picture with every tool of the editor (filters, colour, text, stickers, elements...) and save it as
   PNG / JPG at the picture's own size. Thumbnail maker: YouTube 1280x720 presets. A photo project is a normal project with
   p.photo = { W, H, fmt, quality, kind } and an aspect equal to the picture's shape, so the still uses the same renderer. */
import { openSheet, chips } from './panels.js';
import { newProject, newClip, addToKind, addToMain, registerAspect } from './project.js';
import { DEFAULT_TRANSFORM } from './registry.js';
import { applyStyle } from './textstyles.js';
import { elementClip } from './elempanel.js';

export const THUMB_W = 1280, THUMB_H = 720, PHOTO_MAX = 4096;
const gcd = (a, b) => b ? gcd(b, a % b) : a;
export function photoSize(w, h, max = PHOTO_MAX) { const k = Math.min(1, max / Math.max(w, h)); return { W: Math.max(16, Math.round(w * k)), H: Math.max(16, Math.round(h * k)) }; }
export function ratioOf(w, h) { const g = gcd(Math.round(w), Math.round(h)) || 1; let a = Math.round(w) / g, b = Math.round(h) / g;
  for (const [x, y] of [[9, 16], [16, 9], [1, 1], [4, 5], [3, 4], [4, 3], [2, 3], [3, 2]]) if (Math.abs(a / b - x / y) < 0.002) return `${x}:${y}`; return `${a}:${b}`; }
export const isPhoto = p => !!(p && p.photo);

const T = (content, o = {}) => { const c = newClip('text', { dur: 5, transform: { ...DEFAULT_TRANSFORM, x: o.x ?? .5, y: o.y ?? .5, rotation: o.rot || 0 }, text: { content, size: o.size || 150, font: o.font || 'luckiestguy', align: o.align || 'center' } });
  if (o.style) applyStyle(c.text, o.style); if (o.color) c.text.color = o.color; return c; };
export const THUMB_PRESETS = [
  { id: 'shock', name: 'Big reaction', bg: { type: 'gradient', id: 'lava' }, items: [['t', 'NO WAY!', { x: .34, y: .38, size: 190, style: 'classic', color: '#ffe600', rot: -4 }], ['t', 'you won\'t believe it', { x: .34, y: .68, size: 70, font: 'montserrat', style: 'labelBlack' }], ['e', 'green-25', { x: .78, y: .5, scale: .9 }]] },
  { id: 'kids', name: 'Kids fun', bg: { type: 'pattern', id: 'stars', c1: '#ffd23f', c2: '#ff7a00', size: 8 }, items: [['t', 'FUN TIME!', { y: .42, size: 200, font: 'fredoka', style: 'emma3d' }], ['t', 'Episode 1', { y: .75, size: 80, font: 'baloo2', style: 'labelYellow' }]] },
  { id: 'gaming', name: 'Gaming neon', bg: { type: 'gradient', id: 'night' }, items: [['t', 'EPIC WIN', { y: .45, size: 200, font: 'bangers', style: 'neonPurple' }], ['e', 'frame-3', {}], ['t', 'LEVEL 99', { y: .78, size: 70, font: 'montserrat', style: 'neonBlue' }]] },
  { id: 'howto', name: 'How-to', bg: { type: 'color', bg: '#f4f4f6' }, items: [['t', 'HOW TO', { x: .3, y: .32, size: 120, font: 'montserrat', color: '#111111' }], ['t', 'in 5 minutes', { x: .3, y: .58, size: 90, font: 'poppins', style: 'labelYellow' }], ['e', 'green-9', { x: .78, y: .5, scale: .8 }]] },
  { id: 'top10', name: 'Top 10', bg: { type: 'gradient', id: 'berry' }, items: [['t', 'TOP', { x: .25, y: .3, size: 120, font: 'luckiestguy', style: 'white3d' }], ['t', '10', { x: .25, y: .62, size: 300, font: 'luckiestguy', style: 'gold3d' }], ['t', 'best moments', { x: .7, y: .5, size: 90, font: 'lilitaone', style: 'sticker' }]] },
  { id: 'vlog', name: 'Vlog day', bg: { type: 'gradient', id: 'sky' }, items: [['t', 'MY DAY', { y: .4, size: 190, font: 'grandstander', style: 'softShadow' }], ['t', 'vlog #1', { y: .74, size: 80, font: 'patrickhand', style: 'stickerLabel' }], ['e', 'frame-14', {}]] },
  { id: 'story', name: 'Story time', bg: { type: 'gradient', id: 'gold' }, items: [['t', 'Once upon a time', { y: .45, size: 120, font: 'grandstander', style: 'gold3d' }], ['e', 'frame-11', {}]] },
  { id: 'news', name: 'Breaking', bg: { type: 'gradient', id: 'spot' }, items: [['t', 'BREAKING', { x: .5, y: .35, size: 160, font: 'montserrat', style: 'red3d' }], ['t', 'big news today', { y: .65, size: 80, font: 'poppins', style: 'labelBlack' }], ['e', 'green-31', { x: .85, y: .2, scale: .5 }]] },
  { id: 'versus', name: 'Versus', bg: { type: 'gradient', id: 'sunrise' }, items: [['t', 'VS', { y: .5, size: 260, font: 'bangers', style: 'comic' }], ['t', 'THIS', { x: .2, y: .5, size: 120, font: 'luckiestguy', style: 'blue3d' }], ['t', 'THAT', { x: .8, y: .5, size: 120, font: 'luckiestguy', style: 'pink3d' }]] },
  { id: 'clean', name: 'Clean title', bg: { type: 'gradient', id: 'ocean' }, items: [['t', 'Your title here', { y: .5, size: 130, font: 'poppins', style: 'softShadow' }]] },
];
export const thumbPresetById = id => THUMB_PRESETS.find(t => t.id === id) || THUMB_PRESETS[0];
/** Build a 1280x720 thumbnail project from a preset (optional picture: becomes the background / right side). */
export function buildThumb(id, { mediaId = null, title = null } = {}) {
  const P = thumbPresetById(id), p = newProject(); p.name = 'Thumbnail · ' + P.name; p.aspect = '16:9'; p.photo = { W: THUMB_W, H: THUMB_H, fmt: 'jpg', quality: .92, kind: 'thumb', preset: P.id };
  if (P.bg.type === 'color') { p.bg = P.bg.bg; } else p.canvas = { ...P.bg };
  if (mediaId) { const c = newClip('image', { mediaId, dur: 5, fit: 'cover' }); addToMain(p, [c], 0); }
  let first = true;
  for (const [k, v, o] of P.items) {
    if (k === 't') { const c = T(first && title ? title : v, o); first = false; addToKind(p, 'text', c, 0); }
    else { const c = elementClip(newClip, DEFAULT_TRANSFORM, v); if (!c) continue; c.dur = 5; c.transform = { ...c.transform, x: o.x ?? .5, y: o.y ?? .5, scale: o.scale ?? 1 }; addToKind(p, 'overlay', c, 0); }
  }
  p.photo.t = 1.2; return p;
}
/** A photo project for one picture (rec = imported media record with width / height). */
export function buildPhoto(rec) {
  const { W, H } = photoSize(rec.width || 1080, rec.height || 1080), p = newProject(); p.name = 'Photo · ' + (rec.name || 'picture').replace(/\.[a-z0-9]+$/i, '');
  p.aspect = ratioOf(rec.width || W, rec.height || H); registerAspect(p.aspect); p.photo = { W, H, fmt: /png/i.test(rec.mime || rec.name || '') ? 'png' : 'jpg', quality: .92, kind: 'photo', t: 0 };
  addToMain(p, [newClip('image', { mediaId: rec.id, dur: 5, fit: 'cover' })], 0); return p;
}
export const photoFile = p => `${(p.name || 'photo').replace(/[^\w\- ·]+/g, '').replace(/\s*·\s*/g, '-').trim() || 'photo'}.${p.photo.fmt === 'png' ? 'png' : 'jpg'}`;

/** Sheet: start a photo / thumbnail, or (inside one) save it. ctx = { S, act, toast, busy, media, importFile, projects, renderStill, downloadBlob, player, afterSwitch } */
export function photoSheet(ctx) {
  const { S } = ctx, p = S.project;
  openSheet(isPhoto(p) ? (p.photo.kind === 'thumb' ? 'Thumbnail' : 'Photo') : 'Photo mode', body => {
    if (isPhoto(p)) {
      const info = Object.assign(document.createElement('p'), { className: 'hint', id: 'phInfo', textContent: `${p.photo.W} × ${p.photo.H} px · edit with all the tools (filters, colour, text, stickers, elements), then save.` });
      const fmt = chips([{ value: 'png', label: 'PNG' }, { value: 'jpg', label: 'JPG' }], p.photo.fmt, v => ctx.act(q => { q.photo.fmt = v; }, 'Picture format'), 'phfmt'); fmt.id = 'phFmt';
      const q = chips([{ value: .8, label: 'Small' }, { value: .92, label: 'High' }, { value: 1, label: 'Best' }], p.photo.quality, v => ctx.act(x => { x.photo.quality = v; }, 'JPG quality'), 'phq'); q.id = 'phQ';
      const save = Object.assign(document.createElement('button'), { className: 'bigbtn', id: 'phSave', textContent: 'Save picture' });
      save.onclick = async () => { ctx.busy(true, 'Saving picture…'); try { const b = await savePhoto(ctx); ctx.toast(`Saved ${photoFile(S.project)} (${Math.round(b.size / 1024)} KB)`); } finally { ctx.busy(false); } };
      body.append(info, fmt, q, save);
      if (p.photo.kind === 'thumb') body.append(presetGrid(ctx, true));
      return;
    }
    body.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'Edit a single picture and save it as PNG / JPG, or make a YouTube thumbnail (1280 × 720).' }));
    const fi = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/*', id: 'phFile', hidden: true });
    fi.onchange = async () => { const f = fi.files[0]; if (!f) return; ctx.busy(true, 'Opening picture…'); try { await startPhoto(ctx, f); } finally { ctx.busy(false); } };
    const b = Object.assign(document.createElement('button'), { className: 'bigbtn', id: 'phPick', textContent: 'Edit a picture' }); b.onclick = () => { fi.value = ''; fi.click(); };
    body.append(b, fi, Object.assign(document.createElement('h4'), { textContent: 'YouTube thumbnail · 1280 × 720' }), presetGrid(ctx, false));
  }, { className: 'phsheet' });
}
function presetGrid(ctx, inside) {
  const g = document.createElement('div'); g.className = 'thgrid'; g.id = 'thPresets';
  for (const P of THUMB_PRESETS) { const b = document.createElement('button'); b.className = 'thp'; b.dataset.v = P.id; b.innerHTML = `<i class="thsw" style="background:${swatch(P)}"></i><span>${P.name}</span>`;
    b.onclick = async () => { ctx.busy(true, 'Making thumbnail…'); try { await startThumb(ctx, P.id, inside ? ctx.S.project : null); } finally { ctx.busy(false); } }; g.append(b); }
  return g;
}
const SW = { lava: '#ff6a00,#a3001b', night: '#1b1446,#3b1f7a', berry: '#ff3f6c,#8a1bd1', sky: '#bfe9ff,#7cc6ff', gold: '#fff1a8,#c27b10', spot: '#5a5a6e,#16161c', sunrise: '#ff9a3c,#7b4bff', ocean: '#33d6ff,#0b2a6b' };
const swatch = P => P.bg.type === 'color' ? P.bg.bg : P.bg.type === 'pattern' ? `${P.bg.c1}` : `linear-gradient(135deg,${SW[P.bg.id] || '#444,#222'})`;
export async function startPhoto(ctx, file) {
  const rec = await ctx.importFile(file); if (!rec || rec.type !== 'image') { ctx.toast('Please pick a picture'); return null; }
  if (!rec.width) { const bm = await createImageBitmap(file); rec.width = bm.width; rec.height = bm.height; bm.close(); }
  const p = buildPhoto(rec); await ctx.projects.addProject(p); ctx.afterSwitch(); ctx.toast(`Photo mode · ${p.photo.W}×${p.photo.H}`); return ctx.S.project;
}
export async function startThumb(ctx, id, from = null) {
  const keep = from && from.tracks.find(t => t.kind === 'main')?.clips.find(c => c.type === 'image')?.mediaId;
  const p = buildThumb(id, { mediaId: keep || null }); await ctx.projects.addProject(p); ctx.afterSwitch(); ctx.toast(`Thumbnail · ${thumbPresetById(id).name} · 1280×720`); return ctx.S.project;
}
/** Render the picture at its full size (same renderer as the preview) and download it. Returns the Blob. */
export async function photoBlob(ctx, p = ctx.S.project) {
  const { W, H, fmt, quality, t = 0 } = p.photo; return ctx.renderStill({ t, W, H, type: fmt === 'png' ? 'image/png' : 'image/jpeg', quality, blob: true });
}
export async function savePhoto(ctx) { const b = await photoBlob(ctx); ctx.downloadBlob(b, photoFile(ctx.S.project)); return b; }

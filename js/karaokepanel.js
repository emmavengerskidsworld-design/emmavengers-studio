/* Karaoke captions sheet: words from your captions, typed lines or an SRT file; 12 styles; lyric mode; even split or
   tap-to-time (play and tap once per word). */
import { openSheet, chips } from './panels.js';
import { captions } from './captions.js';
import { clipEnd } from './project.js';
import { projectDuration } from './project.js';
import * as K from './karaoke.js';
import { fontCss } from './render.js';
import { ensureFont } from './fonts.js';
import { DEFAULT_TRANSFORM } from './registry.js';

export function drawStyleTile(cv, id) {
  const x = cv.getContext('2d'), W = cv.width, H = cv.height, s = K.karaokeStyleById(id); ensureFont(s.font);
  x.clearRect(0, 0, W, H); const g = x.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#2b2f3a'); g.addColorStop(1, '#4a3b63'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  const c = { id: 'tile', type: 'text', start: 0, dur: 2, text: { content: 'Sing it now', font: s.font, size: s.size * (s.fx === 'single' ? 2.2 : 3.4) }, karaoke: { style: id, words: K.evenWords('Sing it now', 2) } };
  K.drawKaraoke(x, W, H, c, { ...DEFAULT_TRANSFORM }, 1.0, fontCss);
}
export function karaokeSheet(ctx) {
  const { S, act, player, toast, timeline } = ctx;
  const cur = captions(S.project), first = cur.find(c => c.karaoke);
  let style = first?.karaoke.style || 'sweep', lyric = !!first?.karaoke.lyric, taps = null;
  openSheet('Karaoke captions', body => {
    const hint = Object.assign(document.createElement('p'), { className: 'hint', id: 'kHint', textContent: cur.length ? `${cur.length} caption lines → word-by-word highlight. Pick a style, then time the words.` : 'Type the lines (one per line) or import an SRT file.' });
    const ta = Object.assign(document.createElement('textarea'), { id: 'kText', rows: 3, placeholder: 'One line per caption…', value: cur.map(c => c.text.content.replace(/\n/g, ' ')).join('\n') });
    const dpr = Math.min(2, devicePixelRatio || 1), TW = Math.round(96 * dpr), TH = Math.round(54 * dpr);
    const grid = document.createElement('div'); grid.className = 'kgrid'; grid.id = 'kStyles';
    for (const s of K.KARAOKE_STYLES) { const b = document.createElement('button'); b.className = 'kst' + (s.id === style ? ' on' : ''); b.dataset.v = s.id; b.innerHTML = `<canvas width="${TW}" height="${TH}"></canvas><span>${s.name}</span>`;
      b.onclick = () => { style = s.id; grid.querySelectorAll('.kst').forEach(x => x.classList.toggle('on', x === b)); if (captions(S.project).some(c => c.karaoke)) act(p => K.karaokeAll(p, style, { lyric }), 'Karaoke style'); }; grid.append(b); }
    const draw = () => grid.querySelectorAll('.kst').forEach(b => drawStyleTile(b.querySelector('canvas'), b.dataset.v)); draw(); setTimeout(draw, 700);
    const opts = chips([{ value: 'line', label: 'Captions' }, { value: 'lyric', label: '♪ Lyric mode' }], lyric ? 'lyric' : 'line', v => { lyric = v === 'lyric'; if (captions(S.project).some(c => c.karaoke)) act(p => K.karaokeAll(p, style, { lyric }), 'Lyric mode'); }, 'kmode'); opts.id = 'kLyric';
    const row = document.createElement('div'); row.className = 'capbtns';
    const btn = (id, label, fn) => { const b = document.createElement('button'); b.className = 'chipbtn'; b.id = id; b.textContent = label; b.onclick = fn; row.append(b); return b; };
    const fileIn = Object.assign(document.createElement('input'), { type: 'file', accept: '.srt,.vtt,text/plain', id: 'kSrt', hidden: true });
    fileIn.onchange = async () => { const f = fileIn.files[0]; if (!f) return; const src = await f.text(); let n = 0; act(p => { n = K.karaokeFromSRT(p, src, style, { lyric }); }, 'Karaoke from SRT'); toast(n ? `${n} karaoke lines from ${f.name}` : 'No lines found in that file'); ta.value = captions(S.project).map(c => c.text.content).join('\n'); timeline.render(); };
    btn('kEven', 'Even split', () => {
      const same = ta.value.trim() === captions(S.project).map(c => c.text.content.replace(/\n/g, ' ')).join('\n').trim();
      if (same && captions(S.project).length) act(p => { for (const c of captions(p)) { delete c.karaoke; } K.karaokeAll(p, style, { lyric }); }, 'Karaoke (even split)');
      else { const end = Math.max(projectDuration(S.project), 2); act(p => K.karaokeFromText(p, ta.value, 0, end, style, { lyric }), 'Karaoke from text'); }
      timeline.render(); toast(`Karaoke: ${K.karaokeWordCount(S.project)} words, evenly timed`); });
    const tapBtn = Object.assign(document.createElement('button'), { className: 'ktap', id: 'kTapBtn', hidden: true, textContent: 'TAP each word' });
    btn('kTap', 'Tap to time', () => {
      if (!captions(S.project).some(c => c.karaoke)) act(p => K.karaokeAll(p, style, { lyric }), 'Karaoke');
      const list = captions(S.project), t0 = list[0] ? Math.max(0, list[0].start - 1) : 0, t1 = list.length ? clipEnd(list.at(-1)) : projectDuration(S.project);
      taps = []; tapBtn.hidden = false; tapBtn.textContent = `TAP word 1 / ${K.karaokeWordCount(S.project)}`; player.playRange(t0, t1, null); });
    tapBtn.onpointerdown = e => { e.preventDefault(); if (!taps) return; taps.push(player.t); const n = K.karaokeWordCount(S.project);
      tapBtn.textContent = taps.length >= n ? 'Done — saving' : `TAP word ${taps.length + 1} / ${n}`; if (taps.length >= n) finishTaps(); };
    const finishTaps = () => { if (!taps || !taps.length) return; const t = taps; taps = null; player.pause(); act(p => K.applyTaps(p, t), 'Tap-to-time karaoke'); tapBtn.hidden = true; toast(`Timed ${t.length} words by tapping`); timeline.render(); };
    btn('kTapDone', 'Save taps', finishTaps);
    btn('kImport', 'Import SRT', () => { fileIn.value = ''; fileIn.click(); });
    btn('kOff', 'Plain captions', () => { act(p => { for (const c of captions(p)) delete c.karaoke; }, 'Karaoke off'); timeline.render(); });
    body.append(hint, ta, grid, opts, row, tapBtn, fileIn);
    ctx.onTapApi && ctx.onTapApi({ tap: t => { if (taps) { taps.push(t ?? player.t); } }, finish: finishTaps, start: () => row.querySelector('#kTap').click() });
  }, { className: 'ksheet' });
}

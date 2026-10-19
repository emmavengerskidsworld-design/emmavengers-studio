/* Kids maker sheet: Bible verse cards, quiz builder, counting + ABC auto-builders (js/kids.js).
   ctx = { S, act, player, toast, busy, media, importFile, mediaFor, select, timeline } */
import { openSheet, chips } from './panels.js';
import { renderFrame } from './render.js';
import { outputSize } from './export.js';
import { ensureFont } from './fonts.js';
import * as K from './kids.js';

const LAST = 'evs-kids-last';
/** Import the stickers + sounds a built clip needs, then put it on the timeline at the playhead. */
export async function addBuilt(ctx, built, label) {
  const urls = K.clipUrls(built.clip), map = {}, snd = {};
  for (const u of urls) { try { map[u] = (await ctx.mediaFor(ctx, u, u.split('/').pop())).id; } catch (e) { console.warn('kids sticker', u, e); } }
  K.fillMedia(built.clip, map);
  for (const u of new Set((built.sounds || []).map(s => s.url))) { try { const r = await ctx.mediaFor(ctx, u, u.split('/').pop()); snd[u] = { id: r.id, duration: r.duration }; } catch (e) { console.warn('kids sound', u, e); } }
  let c; ctx.act(p => { c = K.insertKids(p, built, ctx.player.t, snd); }, label);
  ctx.timeline && ctx.timeline.render(); if (c) { ctx.select && ctx.select(c.id); ctx.player.seek(c.start); ctx.timeline && ctx.timeline.setTime && ctx.timeline.setTime(c.start); }
  return c;
}
export function kidsSheet(ctx, tab0) {
  const { S, toast } = ctx, last = JSON.parse(localStorage.getItem(LAST) || '{}'), save = () => localStorage.setItem(LAST, JSON.stringify(last));
  let tab = tab0 || last.tab || 'verse';
  openSheet('Kids maker', body => {
    body.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'Ready-made kids segments: one tap adds a finished clip (with sounds) at the playhead. Everything stays editable — open it like any group.' }));
    const tabs = chips([{ value: 'verse', label: '📖 Verse card' }, { value: 'quiz', label: '❓ Quiz' }, { value: 'count', label: '🔢 Counting' }, { value: 'abc', label: '🔤 ABC' }], tab, v => { tab = last.tab = v; save(); draw(); }, 'tabs kmtabs'); tabs.id = 'kmTabs';
    const pane = document.createElement('div'); pane.id = 'kmPane'; body.append(tabs, pane);
    const btn = (id, text, fn, cls = 'bigbtn') => { const b = Object.assign(document.createElement('button'), { className: cls, id, textContent: text }); b.onclick = fn; return b; };
    const lab = t => Object.assign(document.createElement('h4'), { className: 'bkh', textContent: t });
    const prevCanvas = () => { const cv = document.createElement('canvas'); cv.className = 'kmprev'; return cv; };
    async function preview(cv, built, t) { const a = S.project.aspect, { W: w0, H: h0 } = outputSize(a, 1080), k = Math.min(240 / w0, 200 / h0), dpr = Math.min(2, devicePixelRatio || 1);
      const W = Math.round(w0 * k * dpr), H = Math.round(h0 * k * dpr); cv.width = W; cv.height = H; cv.style.width = W / dpr + 'px'; cv.style.height = H / dpr + 'px';
      const fonts = [...new Set(built.clip.inner.tracks.flatMap(t => t.clips).filter(c => c.type === 'text').map(c => c.text.font))]; await Promise.all(fonts.map(f => ensureFont(f).catch(() => {})));
      renderFrame(cv.getContext('2d'), W, H, { aspect: a, bg: '#000', tracks: [{ id: 'pv', kind: 'main', clips: [{ ...built.clip, start: 0 }] }] }, t ?? built.clip.dur * .75, () => null); }
    function draw() { pane.innerHTML = ''; ({ verse, quiz, count, abc })[tab](); }
    function verse() {
      let v = K.verseById(last.verse) || K.VERSES[0], st = last.vstyle || 'sunrise';
      const cv = prevCanvas(); cv.id = 'kvPrev';
      const q = Object.assign(document.createElement('input'), { id: 'kvSearch', type: 'search', placeholder: 'Search verses (love, brave, John…)', className: 'kmin' });
      const list = document.createElement('div'); list.id = 'kvList'; list.className = 'kvlist';
      const txt = Object.assign(document.createElement('textarea'), { id: 'kvText', rows: 3, className: 'kmin' }), ref = Object.assign(document.createElement('input'), { id: 'kvRef', className: 'kmin' });
      const cur = () => ({ ...v, text: txt.value.trim() || v.text, ref: ref.value.trim() || v.ref });
      const show = () => preview(cv, K.verseCard(S.project.aspect, cur(), st));
      const fill = () => { list.innerHTML = ''; const s = q.value.trim().toLowerCase();
        for (const x of K.VERSES.filter(x => !s || (x.ref + ' ' + x.text + ' ' + x.theme).toLowerCase().includes(s)).slice(0, 60)) { const b = document.createElement('button'); b.className = 'kv' + (x.id === v.id ? ' on' : ''); b.dataset.id = x.id;
          b.innerHTML = `<b>${x.ref}</b> <small>${x.text.slice(0, 60)}${x.text.length > 60 ? '…' : ''}</small>`; b.onclick = () => { v = x; last.verse = x.id; save(); txt.value = x.text; ref.value = x.ref; list.querySelectorAll('.kv').forEach(y => y.classList.toggle('on', y === b)); show(); }; list.append(b); } };
      q.oninput = fill; txt.value = v.text; ref.value = v.ref; txt.oninput = ref.oninput = () => show();
      const sty = chips(K.CARD_STYLES.map(s => ({ value: s.id, label: s.name })), st, x => { st = last.vstyle = x; save(); show(); }, 'kvstyles'); sty.id = 'kvStyles';
      pane.append(cv, lab('Card style'), sty, lab('Verse (King James Version, public domain)'), q, list, txt, ref,
        btn('kvAdd', 'Add verse card', async () => { const c = await addBuilt(ctx, K.verseCard(S.project.aspect, cur(), st), 'Add verse card'); toast(`Verse card added (${c.dur.toFixed(1)} s)`); }));
      fill(); show(); }
    function quiz() {
      const qd = last.quiz || { question: 'Who built the big boat (the ark)?', answers: ['Noah', 'Moses', 'David', ''], right: 0, countdown: 5, style: 'gameshow', sound: true };
      const cv = prevCanvas(); cv.id = 'kqPrev';
      const qq = Object.assign(document.createElement('input'), { id: 'kqQ', className: 'kmin', value: qd.question, placeholder: 'Question' });
      const ans = document.createElement('div'); ans.id = 'kqA'; ans.className = 'kqa';
      for (let i = 0; i < 4; i++) { const r = document.createElement('label'); r.innerHTML = `<b>${'ABCD'[i]}</b>`; const inp = Object.assign(document.createElement('input'), { className: 'kmin kqai', value: qd.answers[i] || '', placeholder: i < 2 ? 'Answer (needed)' : 'Answer (optional)' }); inp.dataset.i = i; inp.oninput = () => { qd.answers[i] = inp.value; upd(); }; r.append(inp); ans.append(r); }
      qq.oninput = () => { qd.question = qq.value; upd(); };
      const right = chips([0, 1, 2, 3].map(i => ({ value: i, label: 'Right: ' + 'ABCD'[i] })), qd.right, v => { qd.right = v; upd(); }, 'kqright'); right.id = 'kqRight';
      const time = chips([3, 5, 10].map(n => ({ value: n, label: n + ' s' })), qd.countdown, v => { qd.countdown = v; upd(); }, 'kqtime'); time.id = 'kqTime';
      const sty = chips(K.QUIZ_STYLES.map(s => ({ value: s.id, label: s.name })), qd.style, v => { qd.style = v; upd(); }, 'kqstyle'); sty.id = 'kqStyle';
      const snd = document.createElement('label'); snd.className = 'kmchk'; snd.innerHTML = `<input type="checkbox" id="kqSound" ${qd.sound !== false ? 'checked' : ''}> Sounds (pop, tick, ta-da)`; snd.querySelector('input').onchange = e => { qd.sound = e.target.checked; upd(); };
      const err = Object.assign(document.createElement('small'), { id: 'kqErr', className: 'kmerr' });
      const build = () => K.quizCard(S.project.aspect, qd, { style: qd.style, sound: qd.sound });
      function upd() { last.quiz = qd; save(); try { const b = build(); err.textContent = ''; preview(cv, b, b.clip.kidsData.reveal + .8); } catch (e) { err.textContent = e.message; } }
      pane.append(cv, lab('Question'), qq, lab('Answers (2 to 4)'), ans, right, lab('Countdown'), time, lab('Look'), sty, snd, err,
        btn('kqAdd', 'Add quiz', async () => { let b; try { b = build(); } catch (e) { toast(e.message); return; } const c = await addBuilt(ctx, b, 'Add quiz'); toast(`Quiz added (${c.dur.toFixed(1)} s)`); }));
      upd(); }
    function count() {
      let item = last.citem || 'apple', to = last.cto || 10; const cv = prevCanvas(); cv.id = 'kcPrev';
      const show = () => preview(cv, K.countingVideo(S.project.aspect, item, to), 1.6 + Math.min(to, 5) * 1.6 - .2);
      const it = chips(K.COUNT_ITEMS.map(x => ({ value: x[0], label: x[1] })), item, v => { item = last.citem = v; save(); show(); }, 'kcitem'); it.id = 'kcItem';
      const n = chips([3, 5, 10, 20].map(x => ({ value: x, label: '1 – ' + x })), to, v => { to = last.cto = v; save(); show(); }, 'kcto'); n.id = 'kcTo';
      pane.append(cv, lab('Count what?'), it, lab('Count to'), n, btn('kcAdd', 'Add counting video', async () => { const c = await addBuilt(ctx, K.countingVideo(S.project.aspect, item, to), 'Add counting'); toast(`Counting added (${c.dur.toFixed(1)} s)`); }));
      show(); }
    function abc() {
      let rg = last.arange || 'A-E'; const cv = prevCanvas(); cv.id = 'kaPrev';
      const show = () => preview(cv, K.abcVideo(S.project.aspect, rg[0], rg[2]), 1.4 + 2.2 * .7);
      const r = chips(['A-E', 'F-J', 'K-O', 'P-T', 'U-Z', 'A-Z'].map(x => ({ value: x, label: x.replace('-', ' – ') })), rg, v => { rg = last.arange = v; save(); show(); }, 'karange'); r.id = 'kaRange';
      pane.append(cv, lab('Letters'), r, btn('kaAdd', 'Add ABC video', async () => { const c = await addBuilt(ctx, K.abcVideo(S.project.aspect, rg[0], rg[2]), 'Add ABC'); toast(`ABC video added (${c.dur.toFixed(1)} s)`); }));
      show(); }
    draw();
  }, { className: 'kidssheet' });
}

/* Audio panels: Enhance voice, Voice effects, Record voice-over, Add speech, Sounds (music + sound effects). */
import { S, act, live, select, selected } from './store.js';
import { newClip, addToKind, find, clipDur, clipEnd, projectDuration } from './project.js';
import { DEFAULT_TRANSFORM } from './registry.js';
import { openSheet, closeSheet, slider, chips } from './panels.js';
import { importFile, media } from './media.js';
import { VOICE_FX, DEFAULT_VOICE_STRENGTH, enhanceLevel, bakedFor, needsBake, onBaked } from './audio.js';
import { encodeWav } from './wav.js';
import { icon } from './icons.js';

let X = null;   // { player, timeline, toast }
export const initAudioPanels = ctx => { X = ctx; };
const editSel = fn => live(p => { const f = find(p, S.sel); f && fn(f.clip, p); });
const el = (tag, props = {}, html) => { const e = Object.assign(document.createElement(tag), props); if (html != null) e.innerHTML = html; return e; };
const fmtT = s => { const m = Math.floor(s / 60), r = s - m * 60; return m + ':' + r.toFixed(1).padStart(4, '0'); };

/** Show "processing…" until the clip's sound is baked, then optionally preview it. */
function processing(note, then) {
  const c = selected()?.clip; if (!c) return;
  if (!needsBake(c)) { note.textContent = ''; then && then(); return; }
  if (bakedFor(c)) { note.textContent = ''; then && then(); return; }
  note.textContent = 'Processing the sound…';
  bakedFor(c, () => { if (selected()?.clip.id !== c.id) return; note.textContent = 'Ready'; setTimeout(() => { if (note.textContent === 'Ready') note.textContent = ''; }, 1200); then && then(); });
}
function previewClip() { const c = selected()?.clip; if (!c) return; const t = X.player.t, a = t >= c.start && t < clipEnd(c) - 0.3 ? t : c.start; X.player.playRange(a, Math.min(clipEnd(c), a + 5), a); }

/* ---------------- Enhance voice ---------------- */
export function enhanceVoiceSheet() {
  const c0 = selected().clip;
  openSheet('Enhance voice', body => {
    const row = el('div', { className: 'hdrow' }), tg = el('button', { id: 'evToggle', className: 'hdtoggle' }), note = el('p', { className: 'hint', id: 'evNote' });
    const paint = () => { const on = enhanceLevel(selected().clip) > 0; tg.classList.toggle('on', on); tg.innerHTML = `${icon('enhvoice', 26)}<span><b>Enhance voice</b><small>${on ? 'On — less noise, clearer, even loudness' : 'Off'}</small></span><i class="sw"></i>`; tg.setAttribute('aria-pressed', on); };
    tg.onclick = () => { editSel(cl => { const v = cl.voice || {}; cl.voice = { ...v, enhance: !v.enhance, strength: v.strength ?? DEFAULT_VOICE_STRENGTH }; }); paint(); processing(note, previewClip); };
    row.append(tg); body.append(row); paint();
    const sl = slider('Strength', { min: 0.1, max: 1, step: 0.01, value: c0.voice?.strength ?? DEFAULT_VOICE_STRENGTH, fmt: v => Math.round(v * 100) + '%', id: 'evStrength',
      onInput: v => { editSel(cl => { cl.voice = { ...(cl.voice || {}), enhance: true, strength: v }; }); paint(); } });
    sl.querySelector('input').addEventListener('change', () => processing(note, previewClip));
    body.append(sl, note, el('p', { className: 'hint' }, 'Removes steady background noise (learned from the quiet parts), rumble and harsh “s” sounds, adds clarity and makes the loudness even (−14 LUFS, right for YouTube and TikTok).'));
    const all = el('div', { className: 'toggles' }), b = el('button', { className: 'chipbtn', id: 'evAll', textContent: 'Apply to all voice clips' });
    b.onclick = () => { const v = selected().clip.voice || {}; live(p => { for (const t of p.tracks) for (const cl of t.clips) if (cl.type === 'audio' || cl.type === 'video') cl.voice = { ...(cl.voice || {}), enhance: !!v.enhance, strength: v.strength ?? DEFAULT_VOICE_STRENGTH }; }); X.toast('Enhance voice copied to every clip with sound'); };
    all.append(b); body.append(all);
  });
}

/* ---------------- Voice effects ---------------- */
export function voiceFxSheet() {
  const c0 = selected().clip;
  openSheet('Voice effects', body => {
    const note = el('p', { className: 'hint', id: 'vfxNote' });
    const ch = chips([{ value: '', html: '<b class="fxe">∅</b><span>None</span>' }, ...VOICE_FX.map(f => ({ value: f.id, html: `<b class="fxe">${f.emoji}</b><span>${f.name}</span>` }))], c0.voice?.fx || '', v => {
      editSel(cl => { const x = { ...(cl.voice || {}) }; if (v) x.fx = v; else delete x.fx; cl.voice = Object.keys(x).length ? x : undefined; if (!cl.voice) delete cl.voice; });
      processing(note, previewClip); }, 'fxgrid');
    body.append(ch, note, el('p', { className: 'hint' }, 'Tap an effect to hear it. Works on recorded voice, speech, sounds and the sound of videos.'));
  }, { className: 'tall' });
}

/* ---------------- add a generated / recorded sound as a clip ---------------- */
export async function addSoundBlob(blob, name, start, extra = {}) {
  const rec = await importFile(new File([blob], name, { type: blob.type || 'audio/wav' }));
  let id = null;
  act(p => { const c = newClip('audio', { mediaId: rec.id, in: 0, out: rec.duration, ...extra }); addToKind(p, 'audio', c, start); id = c.id; });
  return { rec, id };
}

/* ---------------- Record voice-over ---------------- */
export function recordSheet() {
  const P = X.player; let stream = null, rec = null, an = null, src = null, raf = 0, state = 'idle', t0 = 0, chunks = [], takes = [], cdTimer = 0;
  const stopMeter = () => { cancelAnimationFrame(raf); try { src && src.disconnect(); } catch (e) {} src = null; };
  const release = () => { stopMeter(); if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };
  let mode = localStorage.getItem('evs-recmode') || 'voice', tpOn = localStorage.getItem('evs-tp') === '1', tpRaf = 0, tpT0 = 0;
  const stage = document.getElementById('stage');
  const prompter = document.getElementById('prompter') || stage.appendChild(el('div', { id: 'prompter', hidden: true }, '<div class="tpinner"></div><i class="tpline"></i>'));
  const cam = document.getElementById('camLive') || stage.appendChild(el('video', { id: 'camLive', muted: true, autoplay: true, playsInline: true, hidden: true }));
  const tpStop = () => { cancelAnimationFrame(tpRaf); prompter.hidden = true; };
  /** Teleprompter: the text scrolls up at the chosen words per minute while recording (shown during the countdown too). */
  const tpStart = () => { const txt = (localStorage.getItem('evs-tptext') || '').trim(); if (!tpOn || !txt) return; const inner = prompter.querySelector('.tpinner');
    inner.textContent = txt; inner.style.fontSize = (localStorage.getItem('evs-tpsize') || 26) + 'px'; prompter.hidden = false; inner.style.transform = 'translateY(0)'; prompter._wall = 0;
    const words = Math.max(1, txt.split(/\s+/).length), step = () => { const wpm = +(localStorage.getItem('evs-tpspeed') || 130), el2 = prompter._wall ? (performance.now() - prompter._wall) / 1000 : 0;
      const pxs = wpm / 60 * inner.scrollHeight / words, y = Math.min(inner.scrollHeight, el2 * pxs); inner.style.transform = `translateY(${-y.toFixed(1)}px)`; prompter.dataset.y = y.toFixed(1); tpRaf = requestAnimationFrame(step); }; step(); };
  openSheet('Record voice', body => {
    const btn = el('button', { id: 'recBtn', className: 'recbtn' }, '<i></i>'), meter = el('canvas', { id: 'recMeter', width: 600, height: 36, className: 'recmeter' });
    const status = el('p', { className: 'rec-status', id: 'recStatus', textContent: 'Tap the red button. Recording starts at the white line after 3, 2, 1.' });
    const list = el('div', { className: 'takes', id: 'recTakes' });
    body.append(el('div', { className: 'recrow' }), status, meter, list, el('p', { className: 'hint' }, 'The video plays without sound while you record, so only your voice is recorded. Record again for another take — every take is kept on its own audio line.'));
    body.querySelector('.recrow').append(btn);
    const modeC = chips([{ value: 'voice', label: 'Voice' }, { value: 'camera', label: 'Camera' }], mode, v => { mode = v; localStorage.setItem('evs-recmode', v); status.textContent = v === 'camera' ? 'Records you with the camera (picture + sound) onto an overlay at the white line.' : 'Tap the red button. Recording starts at the white line after 3, 2, 1.'; }, 'tabs recmode');
    modeC.id = 'recMode';
    const tpB = el('button', { className: 'chipbtn' + (tpOn ? ' on' : ''), id: 'tpOn', textContent: 'Teleprompter' });
    const tpBox = el('div', { className: 'tpbox', hidden: !tpOn });
    const ta = el('textarea', { id: 'tpText', rows: 3, placeholder: 'Type or paste what you want to say — it scrolls on the screen while you record' }); ta.value = localStorage.getItem('evs-tptext') || ''; ta.oninput = () => localStorage.setItem('evs-tptext', ta.value);
    const sp = slider('Speed', { min: 60, max: 220, step: 5, value: +(localStorage.getItem('evs-tpspeed') || 130), fmt: v => v + ' words/min', id: 'tpSpeed', onInput: v => localStorage.setItem('evs-tpspeed', v) });
    const sz = slider('Text size', { min: 16, max: 44, step: 1, value: +(localStorage.getItem('evs-tpsize') || 26), fmt: v => v + 'px', id: 'tpSize', onInput: v => localStorage.setItem('evs-tpsize', v) });
    tpBox.append(ta, sp, sz);
    tpB.onclick = () => { tpOn = !tpOn; localStorage.setItem('evs-tp', tpOn ? '1' : '0'); tpB.classList.toggle('on', tpOn); tpBox.hidden = !tpOn; };
    const tr = el('div', { className: 'toggles' }); tr.append(tpB); body.prepend(modeC); body.append(tr, tpBox);
    const drawMeter = () => { const x = meter.getContext('2d'), W = meter.width, H = meter.height; x.clearRect(0, 0, W, H); x.fillStyle = '#2a2a33'; x.fillRect(0, 0, W, H);
      if (an) { const d = new Float32Array(an.fftSize); an.getFloatTimeDomainData(d); let s = 0, pk = 0; for (const v of d) { s += v * v; pk = Math.max(pk, Math.abs(v)); }
        const db = 10 * Math.log10(s / d.length + 1e-12), lv = Math.max(0, Math.min(1, (db + 60) / 60)); meter.dataset.level = db.toFixed(1);
        const g = x.createLinearGradient(0, 0, W, 0); g.addColorStop(0, '#3ddc84'); g.addColorStop(.75, '#ffcc33'); g.addColorStop(1, '#ff4d4d'); x.fillStyle = g; x.fillRect(0, 6, W * lv, H - 12);
        if (pk > 0.98) { x.fillStyle = '#ff4d4d'; x.fillRect(W - 8, 0, 8, H); } }
      if (state === 'rec') { x.fillStyle = '#fff'; x.font = '600 20px system-ui'; x.textBaseline = 'middle'; x.textAlign = 'right'; x.fillText(fmtT(P.t - t0 >= 0 ? (performance.now() - t0wall) / 1000 : 0), W - 14, H / 2); }
      raf = requestAnimationFrame(drawMeter); };
    let t0wall = 0;
    const paintTakes = () => { list.innerHTML = ''; takes.forEach((tk, i) => { const live_ = find(S.project, tk.id); if (!live_) return;
      const r = el('div', { className: 'take' }, `<span>${icon('mic', 16)} Take ${i + 1} · ${fmtT(tk.dur)} at ${fmtT(tk.start)}</span>`);
      const pl = el('button', { className: 'chipbtn', textContent: 'Play' }); pl.onclick = () => { const c = find(S.project, tk.id)?.clip; c && P.playRange(c.start, clipEnd(c), c.start); };
      const del = el('button', { className: 'chipbtn', textContent: 'Delete' }); del.onclick = () => { act(p => { const f = find(p, tk.id); if (f) f.track.clips.splice(f.index, 1); }); paintTakes(); };
      r.append(pl, del); list.append(r); }); };
    const countdown = () => new Promise(res => { const o = document.getElementById('recCount'); let n = 3; o.hidden = false; o.textContent = n; state = 'count';
      cdTimer = setInterval(() => { n--; if (n <= 0) { clearInterval(cdTimer); o.hidden = true; res(); } else o.textContent = n; }, 1000); });
    const start = async () => {
      try { stream = await navigator.mediaDevices.getUserMedia(mode === 'camera' ? { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 1280 } } } : { audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: true, channelCount: 1 } }); }
      catch (e) { status.textContent = (mode === 'camera' ? 'Camera' : 'Microphone') + ' not available — allow it for this site and try again.'; return; }
      if (mode === 'camera') { cam.srcObject = stream; cam.hidden = false; cam.play().catch(() => {}); }
      P.pause(); P.ensureAudio(); const ac = P.ac; an = ac.createAnalyser(); an.fftSize = 2048; src = ac.createMediaStreamSource(stream); src.connect(an); drawMeter();
      btn.classList.add('armed'); status.textContent = 'Get ready…';
      tpStart(); await countdown(); if (state !== 'count') { tpStop(); return; }
      const mime = (mode === 'camera' ? ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'] : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']).find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
      rec = new MediaRecorder(stream, mime ? { mimeType: mime, ...(mode === 'camera' ? { videoBitsPerSecond: 4e6 } : { audioBitsPerSecond: 128000 }) } : {}); chunks = [];
      rec.ondataavailable = e => e.data.size && chunks.push(e.data);
      rec.onstart = () => { t0 = P.t; t0wall = performance.now(); prompter._wall = t0wall; P.setMuted(true); if (P.t < projectDuration(S.project) - 0.05) P.play(); };
      rec.start(250); state = 'rec'; btn.classList.remove('armed'); btn.classList.add('on'); status.textContent = 'Recording… tap to stop';
    };
    const stop = async () => {
      if (state === 'count') { clearInterval(cdTimer); document.getElementById('recCount').hidden = true; state = 'idle'; btn.classList.remove('armed'); release(); status.textContent = 'Cancelled.'; return; }
      state = 'saving'; btn.classList.remove('on'); status.textContent = 'Saving your recording…';
      const done = new Promise(r => rec.onstop = r); rec.stop(); await done; P.pause(); P.setMuted(false); release(); tpStop(); cam.hidden = true; cam.srcObject = null;
      if (mode === 'camera') { try { const blob = new Blob(chunks, { type: rec.mimeType || 'video/webm' }), ext = /mp4/.test(blob.type) ? 'mp4' : 'webm';
          const r = await importFile(new File([blob], `Camera ${takes.length + 1}.${ext}`, { type: blob.type })); let id = null;
          act(p => { const c = newClip('video', { mediaId: r.id, in: 0, out: r.duration, rec: 'voice', transform: { ...DEFAULT_TRANSFORM } }); addToKind(p, 'overlay', c, t0); id = c.id; });
          takes.push({ id, start: t0, dur: r.duration }); paintTakes(); status.textContent = `Saved camera take ${takes.length} (${fmtT(r.duration)}).`; X.timeline.render(); }
        catch (e) { console.error(e); status.textContent = 'Could not save the recording: ' + (e.message || e); } state = 'idle'; return; }
      try {
        const blob = new Blob(chunks, { type: rec.mimeType || 'audio/webm' });
        const ac = new OfflineAudioContext(1, 48000, 48000), buf = await ac.decodeAudioData(await blob.arrayBuffer());
        const wav = encodeWav([buf.getChannelData(0)], buf.sampleRate);
        const { id } = await addSoundBlob(wav, `Voice ${takes.length + 1}.wav`, t0, { rec: 'voice' });
        takes.push({ id, start: t0, dur: buf.duration }); paintTakes();
        status.textContent = `Saved take ${takes.length} (${fmtT(buf.duration)}). Tap the red button to record another take.`;
        X.timeline.render();
      } catch (e) { console.error(e); status.textContent = 'Could not save the recording: ' + (e.message || e); }
      state = 'idle';
    };
    btn.onclick = () => { if (state === 'idle') start(); else if (state === 'rec' || state === 'count') stop(); };
  }, { gesture: false, onClose: () => { if (state === 'rec') { try { rec.stop(); } catch (e) {} } clearInterval(cdTimer); const o = document.getElementById('recCount'); if (o) o.hidden = true; P.setMuted(false); release(); tpStop(); cam.hidden = true; cam.srcObject = null; } });
}

/* ---------------- Add speech (Kokoro kid voices, on the phone) ---------------- */
export function speechSheet() {
  openSheet('Add speech', async body => {
    const { KID_VOICES, speak, ttsInfo } = await import('./tts.js');
    let voice = localStorage.getItem('studio.ttsVoice') || 'mia', caption = localStorage.getItem('studio.ttsCaption') !== '0', busy = false, last = null;
    const ta = el('textarea', { id: 'ttsText', rows: 3, placeholder: 'Type what the voice should say' });
    const vc = chips(KID_VOICES.map(v => ({ value: v.id, html: `<b class="fxe">${v.emoji}</b><span>${v.label}</span>` })), voice, v => { voice = v; localStorage.setItem('studio.ttsVoice', v); }, 'fxgrid voices');
    const capB = el('button', { className: 'chipbtn' + (caption ? ' on' : ''), id: 'ttsCaption', textContent: 'Also add a caption' });
    capB.onclick = () => { caption = !caption; capB.classList.toggle('on', caption); localStorage.setItem('studio.ttsCaption', caption ? '1' : '0'); };
    const status = el('p', { className: 'hint', id: 'ttsStatus' }), bar = el('div', { className: 'bar tts-bar', hidden: true }, '<i></i>');
    const play = el('button', { className: 'btn ghost', id: 'ttsPlay' }, icon('play', 18) + ' Listen'), add = el('button', { className: 'btn primary', id: 'ttsAdd' }, icon('plus', 18) + ' Add speech');
    const row = el('div', { className: 'toggles' }); row.append(capB);
    const btns = el('div', { className: 'tts-btns' }); btns.append(play, add);
    body.append(ta, vc, row, btns, bar, status, el('p', { className: 'hint' }, ttsInfo));
    const make = async () => {
      const text = ta.value.trim(); if (!text) { status.textContent = 'Type something first.'; ta.focus(); return null; }
      if (last && last.text === text && last.voice === voice) return last;
      busy = true; add.disabled = play.disabled = true; bar.hidden = false;
      try {
        const out = await speak(text, voice, pr => { status.textContent = pr.msg; bar.firstChild.style.width = Math.round((pr.p || 0) * 100) + '%'; });
        last = { text, voice, ...out }; return last;
      } catch (e) { console.error(e); status.textContent = 'Could not make the speech: ' + (e.message || e); return null; }
      finally { busy = false; add.disabled = play.disabled = false; bar.hidden = true; }
    };
    play.onclick = async () => { const r = await make(); if (!r) return; status.textContent = `${fmtT(r.duration)} of speech`; const a = new Audio(URL.createObjectURL(r.wav)); a.play().catch(() => {}); };
    add.onclick = async () => {
      const r = await make(); if (!r) return; const at = X.player.t, v = KID_VOICES.find(x => x.id === voice);
      const { id } = await addSoundBlob(r.wav, `Speech - ${v.label}.wav`, at, { rec: 'tts' });
      if (caption) act(p => { const c = newClip('text', { dur: r.duration, transform: { ...DEFAULT_TRANSFORM, y: 0.82 }, text: { content: r.text, size: 64, box: true, boxColor: '#000000', outline: false }, speechOf: id }); addToKind(p, 'text', c, at); });
      status.textContent = `Added ${fmtT(r.duration)} of speech${caption ? ' with a caption' : ''}.`; X.timeline.render(); X.toast(`Added speech (${v.label})`);
    };
    setTimeout(() => ta.focus(), 50);
  }, { className: 'tall' });
}

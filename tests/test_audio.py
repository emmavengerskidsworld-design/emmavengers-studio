"""Batch 4 test: audio (Google Chrome, 390x844 phone).   python3 tests/test_audio.py [shots_dir]
- DSP in the shipped code (js/audiofx.js, run in the page): Enhance voice lowers the noise floor and hum while keeping the
  speech band and hitting the loudness target; every voice effect changes the spectrum; speed with "keep voice pitch"
  keeps the fundamental frequency
- clip tools: fades (mix + waveform drawing), waveforms on audio and video clips, Extract audio, Mute original sound,
  enhance / voice effect panels with undo, redo and autosave, preview voices
- export: the MP4's audio equals the studio's own mix (correlation, loudness)
- recording with a fake microphone: 3-2-1 countdown, level meter, muted playback, two takes
- Add speech: Kokoro kid voice in the browser -> audio clip + caption
- sound library: catalogue, categories, search, favourites, preview, add, licences, loudness of the files"""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, base64, re
from pathlib import Path
import numpy as np
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]; FX = ROOT / 'tests/fixtures'
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-audio-')); fails = []; T0 = time.time(); PORT = 8772; METRICS = {}
HF = Path('/workspace/hf-cache/kokoro')   # local copy of onnx-community/Kokoro-82M-v1.0-ONNX (optional; else downloads)
def log(*a): print(f'[{time.time()-T0:6.1f}s]', *a, flush=True)
def ok(c, m):
    log(('  ok   ' if c else '  FAIL ') + m)
    if not c: fails.append(m)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def handle(self):
        try: super().handle()
        except Exception: pass
P = lambda pg, js: pg.evaluate(js)
HELPERS = '''(() => { window.__b64 = a => { const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
window.__load = async (url) => { const ab = await (await fetch(url)).arrayBuffer(); const b = await new OfflineAudioContext(1, 48000, 48000).decodeAudioData(ab); return [...Array(b.numberOfChannels)].map((_, i) => b.getChannelData(i)); };
window.__setRange = (sel, v) => { const e = document.querySelector(sel); e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); }; return 1; })()'''
async def new_page(b, ctx=None):
    ctx = ctx or await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
    pg = await ctx.new_page(); pg.errs = []
    pg.on('pageerror', lambda e: pg.errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and pg.errs.append(m.text))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=20000); await P(pg, HELPERS); return ctx, pg
async def tracks(pg): return await P(pg, 'studio.S.project.tracks.map(t=>({kind:t.kind,clips:t.clips.map(c=>({id:c.id,type:c.type,start:c.start,in:c.in,out:c.out,speed:c.speed,mediaId:c.mediaId,voice:c.voice||null,muteAudio:!!c.muteAudio,fadeIn:c.fadeIn||0,fadeOut:c.fadeOut||0,speechOf:c.speechOf||null,text:c.text?c.text.content:null,dur:c.dur||null}))}))')
async def clips_of(pg, kind): return [c for t in await tracks(pg) if t['kind'] == kind for c in t['clips']]
async def add_audio(pg, f, at=0.0):
    n = len(await clips_of(pg, 'audio'))
    await P(pg, f'(()=>{{studio.player.pause();studio.player.seek({at});studio.timeline.setTime({at})}})()')
    await pg.set_input_files('#fileAudio', str(f)); await pg.wait_for_function(f'studio.S.project.tracks.filter(t=>t.kind==="audio").reduce((a,t)=>a+t.clips.length,0)>{n}', timeout=20000)
    a = await clips_of(pg, 'audio'); return [c for c in a if c['start'] >= at - 0.01][-1]
async def add_video(pg, f):
    await pg.set_input_files('#fileMedia', str(f)); await pg.wait_for_function('studio.S.project.tracks.find(t=>t.kind==="main").clips.length>0', timeout=20000)
    await pg.wait_for_function('(()=>{const c=studio.S.project.tracks.find(t=>t.kind==="main").clips[0];const r=studio.media.get(c.mediaId);return r&&r.peaks!==undefined})()', timeout=20000)
    return (await clips_of(pg, 'main'))[0]
async def mix(pg):
    r = await P(pg, '(async()=>{const m=await studio.audio.mix();return {sr:m.sampleRate,ch:[...Array(m.numberOfChannels)].map((_,i)=>__b64(m.getChannelData(i)))}})()')
    return r['sr'], np.array([np.frombuffer(base64.b64decode(c), np.float32) for c in r['ch']])
def rms(x): return float(np.sqrt(np.mean(np.square(x)) + 1e-20))
def db(x): return 20 * np.log10(max(x, 1e-10))
def f0(x, sr, lo=60, hi=1200):
    x = x - x.mean(); n = len(x); c = np.fft.irfft(np.abs(np.fft.rfft(x, 2 * n)) ** 2)[:n]; c /= c[0] + 1e-12
    a, b = int(sr / hi), int(sr / lo); l = a + int(np.argmax(c[a:b]))
    for k in range(a + 1, b - 1):   # first strong peak (avoids octave errors)
        if c[k] > 0.9 * c[l] and c[k] >= c[k - 1] and c[k] >= c[k + 1]: l = k; break
    y0, y1, y2 = c[l - 1], c[l], c[l + 1]; d = (y0 - y2) / (2 * (y0 - 2 * y1 + y2) or 1); return sr / (l + d)
def decode(f, sr=48000):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(f), '-vn', '-ac', '2', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True, check=True)
    return np.frombuffer(r.stdout, np.float32).reshape(-1, 2).T
async def export(pg, tag, res=720):
    await pg.click('#exportBtn'); await pg.click(f'#exRes .chipbtn[data-v="{res}"]'); await pg.click('#exGo'); await pg.wait_for_selector('#exDone:not([hidden])', timeout=300000)
    async with pg.expect_download() as dl: await pg.click('#exSave')
    d = await dl.value; f = OUT / (tag + '.mp4'); await d.save_as(str(f)); await pg.click('#exBack'); await pg.wait_for_timeout(300); return f
async def tool(pg, t): await pg.click(f'#toolbar .tool[data-tool="{t}"]'); await pg.wait_for_timeout(250)
async def done(pg):
    if await pg.locator('.sh-done').count(): await pg.click('.sh-done'); await pg.wait_for_timeout(350)

# ------------------------------------------------------------------ DSP
async def test_dsp(b):
    log('== DSP (js/audiofx.js in the page)')
    ctx, pg = await new_page(b)
    r = await P(pg, '''(async()=>{ const fx = studio.audio.fx, SR = 48000; const noisy = await __load('tests/fixtures/voice_noisy.wav'), clean = await __load('tests/fixtures/voice_clean.wav');
      const m = ch => { const L = fx.lufs([ch[0], ch[0]], SR); return { lufs: L, floor: fx.noiseFloor(ch, SR) - L, hum: fx.bandEnergy(ch, SR, 45, 56) - fx.bandEnergy(ch, SR, 300, 3400), speech: fx.bandEnergy(ch, SR, 300, 3400) - fx.bandEnergy(ch, SR, 20, 20000), peak: 20 * Math.log10(fx.peak(ch)) }; };
      const t = performance.now(), e = fx.enhance(noisy, SR, 0.8), ms = performance.now() - t; const ec = fx.enhance(clean, SR, 0.8);
      return { before: m(noisy), after: m(e), ms, sec: noisy[0].length / SR, clean: m(clean), cleanAfter: m(ec) }; })()''')
    bf, af = r['before'], r['after']; METRICS['enhance'] = r
    log(f"       noisy voice: noise floor {bf['floor']:.1f} -> {af['floor']:.1f} dB (re loudness), 50 Hz hum {bf['hum']:.1f} -> {af['hum']:.1f} dB (re speech band), speech band share {bf['speech']:.2f} -> {af['speech']:.2f} dB, loudness {bf['lufs']:.1f} -> {af['lufs']:.2f} LUFS, peak {af['peak']:.2f} dBFS, {r['ms']:.0f} ms for {r['sec']:.1f} s")
    ok(bf['floor'] - af['floor'] >= 10, f"Enhance lowers the noise floor by >= 10 dB ({bf['floor'] - af['floor']:.1f} dB)")
    ok(bf['hum'] - af['hum'] >= 10, f"Enhance removes mains hum / rumble by >= 10 dB ({bf['hum'] - af['hum']:.1f} dB)")
    ok(abs(af['speech'] - bf['speech']) <= 3, f"speech band (300-3400 Hz) kept within 3 dB ({af['speech'] - bf['speech']:+.2f} dB)")
    ok(abs(af['lufs'] - (-14)) <= 1, f"loudness normalised to -14 LUFS ({af['lufs']:.2f})"); ok(af['peak'] <= -0.9, f"peak <= -1 dBFS ({af['peak']:.2f})")
    ok(abs(r['cleanAfter']['speech'] - r['clean']['speech']) <= 2, f"clean voice keeps its speech band ({r['cleanAfter']['speech'] - r['clean']['speech']:+.2f} dB)")
    ok(r['ms'] / r['sec'] < 200, f"enhance runs at {r['ms'] / r['sec']:.0f} ms per second of sound")
    # voice effects
    r = await P(pg, '''(async()=>{ const fx = studio.audio.fx, SR = 48000; const v = await __load('tests/fixtures/voice_clean.wav'), tone = await __load('tests/fixtures/tone220.wav'); const out = {};
      const spec = ch => { const x = ch[0], N = 2048, re = new Float32Array(N), im = new Float32Array(N), S = []; for (let s = 0; s + N <= Math.min(x.length, SR * 8); s += N) { for (let i = 0; i < N; i++) { re[i] = x[s + i] * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / N)); im[i] = 0; } fx.fft(re, im); const f = []; for (let k = 2; k < 342; k++) f.push(Math.max(-80, 10 * Math.log10(re[k] * re[k] + im[k] * im[k] + 1e-12))); S.push(f); } return S; };
      const norm = ch => { const L = fx.lufs([ch[0], ch[0]], SR), g = Math.pow(10, (-20 - L) / 20); return [ch[0].map(s => s * g)]; };
      const A = spec(norm(v));
      for (const F of studio.audio.VOICE_FX) { const t = performance.now(); const y = fx.processAudio(v, SR, { fx: F.id }); const ms = performance.now() - t; const B = spec(norm(y)); let d = 0, n = 0;
        for (let i = 0; i < Math.min(A.length, B.length); i++) for (let k = 0; k < A[i].length; k++) { d += Math.abs(A[i][k] - B[i][k]); n++; }
        const bands = [[80, 300], [300, 3400], [3400, 8000]].map(([a, b]) => fx.bandEnergy(y, SR, a, b) - fx.bandEnergy(y, SR, 80, 8000) - (fx.bandEnergy(v, SR, a, b) - fx.bandEnergy(v, SR, 80, 8000)));
        const tp = fx.processAudio(tone, SR, { fx: F.id }); out[F.id] = { name: F.name, dist: d / n, bands, ms, f0: fx.pitchOf(tp[0], SR, 60, 1200), len: y[0].length / v[0].length, peak: fx.peak(y) }; }
      return out; })()''')
    METRICS['voicefx'] = r
    for k, v in r.items(): log(f"       {v['name']:<16} spectral distance {v['dist']:5.1f} dB, bands lo/mid/hi {v['bands'][0]:+6.1f}/{v['bands'][1]:+6.1f}/{v['bands'][2]:+6.1f} dB, 220 Hz tone -> {v['f0']:6.1f} Hz, {v['ms']:.0f} ms")
    ok(len(r) >= 10, f'{len(r)} voice effects'); flat = [k for k, v in r.items() if v['dist'] < 3]; ok(not flat, f'every effect changes the spectrum by >= 3 dB on average {flat}')
    for k, ratio in (('chipmunk', 1.7), ('deep', 0.72), ('cartoon', 1.38), ('monster', 0.62)):
        if k in r: ok(abs(r[k]['f0'] / (220 * ratio) - 1) < 0.04, f"{k}: 220 Hz -> {r[k]['f0']:.1f} Hz (expected {220 * ratio:.0f})")
    ok(all(v['peak'] <= 1.0 for v in r.values()), 'no effect clips (peak <= 0 dBFS)')
    # speed with keep pitch (WSOLA)
    r = await P(pg, '''(async()=>{ const fx = studio.audio.fx, SR = 48000; const t = await __load('tests/fixtures/tone220.wav'); const o = {};
      for (const rate of [0.5, 0.75, 1.25, 1.5, 2, 3]) { const y = fx.stretch(t, rate, SR); o[rate] = { f0: fx.pitchOf(y[0], SR, 60, 1200), len: y[0].length / t[0].length }; } return o; })()''')
    METRICS['stretch'] = r
    for k, v in r.items(): log(f"       speed {k}x keep pitch: f0 {v['f0']:.2f} Hz, length x{v['len']:.3f}")
    bad = [k for k, v in r.items() if abs(v['f0'] - 220) > 220 * 0.01 or abs(v['len'] * float(k) - 1) > 0.02]
    ok(not bad, f'pitch-kept speed keeps 220 Hz within 1% and the right length for every rate {bad}')
    ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

# ------------------------------------------------------------------ clip tools in the editor
async def test_tools(b):
    log('== clip tools: speed/pitch, fades, waveforms, extract audio, mute, enhance + effects panels')
    ctx, pg = await new_page(b)
    a = await add_audio(pg, FX / 'tone220.wav', 0)
    sr, m = await mix(pg); f_1 = f0(m[0][int(1.5 * sr):int(2.5 * sr)], sr)
    await P(pg, f'studio.select("{a["id"]}")'); await tool(pg, 'speed')
    ok(await pg.locator('#speedPitch.on').count() == 1, '"Keep voice pitch" is on by default')
    await pg.click('#speedRate .chipbtn[data-v="2"]') if await pg.locator('#speedRate').count() else await pg.click('.sheet .chips .chipbtn[data-v="2"]')
    await pg.wait_for_timeout(200); c = (await clips_of(pg, 'audio'))[0]; ok(abs(c['speed'] - 2) < 1e-6, f'speed set to {c["speed"]}x')
    sr, m = await mix(pg); f_2 = f0(m[0][int(0.5 * sr):int(1.5 * sr)], sr); dur2 = m.shape[1] / sr
    await pg.click('#speedPitch'); await pg.wait_for_timeout(200); sr, m = await mix(pg); f_3 = f0(m[0][int(0.5 * sr):int(1.5 * sr)], sr); await done(pg)
    METRICS['speed_mix'] = dict(f0_1x=f_1, f0_2x_keep=f_2, f0_2x_nokeep=f_3, dur_2x=dur2)
    log(f'       mix: 1x {f_1:.1f} Hz | 2x keep pitch {f_2:.1f} Hz | 2x pitch not kept {f_3:.1f} Hz | 2x length {dur2:.2f}s')
    ok(abs(f_2 / f_1 - 1) < 0.01, f'2x with keep pitch: fundamental stays {f_2:.1f} Hz (1x {f_1:.1f})'); ok(abs(f_3 / (2 * f_1) - 1) < 0.02, f'2x without keep pitch: {f_3:.1f} Hz (octave up)')
    ok(abs(dur2 - 2.0) < 0.05, f'2x clip lasts {dur2:.2f}s'); await pg.click('#undoBtn'); await pg.wait_for_timeout(200)
    c = (await clips_of(pg, 'audio'))[0]; ok(c['speed'] == 1, 'undo restores 1x')
    # fades
    await P(pg, f'studio.select("{a["id"]}")'); await tool(pg, 'volume'); await P(pg, '__setRange("#fadeIn", 1)'); await P(pg, '__setRange("#fadeOut", 1)'); await pg.wait_for_timeout(250)
    await pg.screenshot(path=str(SHOTS / 'audio-fades-volume-390.png')); log('  shot audio-fades-volume-390.png'); await done(pg)
    c = (await clips_of(pg, 'audio'))[0]; ok(c['fadeIn'] == 1 and c['fadeOut'] == 1, f'fade in/out set ({c["fadeIn"]}s / {c["fadeOut"]}s)')
    sr, m = await mix(pg); seg = lambda t: rms(m[0][int((t - .05) * sr):int((t + .05) * sr)]); mid = seg(2.0)
    METRICS['fades'] = dict(t0_1=seg(.1) / mid, t0_5=seg(.5) / mid, t3_5=seg(3.5) / mid, t3_9=seg(3.9) / mid)
    log('       fade gain at 0.1/0.5/2.0/3.5/3.9 s: ' + ' / '.join(f'{v:.2f}' for v in (seg(.1) / mid, seg(.5) / mid, 1, seg(3.5) / mid, seg(3.9) / mid)))
    ok(seg(.1) / mid < 0.15 and abs(seg(.5) / mid - 0.5) < 0.08 and abs(seg(3.5) / mid - 0.5) < 0.08 and seg(3.9) / mid < 0.15, 'mix follows the linear fade in / fade out')
    ok(await pg.locator('.fh.fi').count() == 1 and await pg.locator('.fh.fo').count() == 1, 'fade handles shown on the selected clip')
    wav = await P(pg, f'''(()=>{{ const c = studio.find(studio.S.project, "{a['id']}").clip, r = studio.media.get(c.mediaId), cv = new OffscreenCanvas(400, 60), x = cv.getContext('2d');
      studio.timeline.paintClip(x, c, r, 400, 60, 1); const d = x.getImageData(0, 0, 400, 60).data, col = cx => {{ let n = 0; for (let y = 0; y < 60; y++) {{ const i = (y * 400 + cx) * 4; if (d[i + 1] > 150 && d[i + 2] > 120 && d[i] < 200) n++; }} return n; }};
      let s0 = 0, s1 = 0; for (let x = 0; x < 30; x += 2) s0 += col(x); for (let x = 180; x < 220; x += 2) s1 += col(x); return {{ start: s0 / 15, mid: s1 / 20, yellow: [...Array(400).keys()].some(cx => {{ for (let y = 0; y < 60; y++) {{ const i = (y * 400 + cx) * 4; if (d[i] > 230 && d[i + 1] > 190 && d[i + 2] < 120) return true; }} return false; }}) }}; }})()''')
    log(f'       waveform drawing: wave pixels per column at the start {wav["start"]:.1f} vs middle {wav["mid"]:.1f}, envelope line {wav["yellow"]}')
    ok(wav['mid'] > 20 and wav['start'] < wav['mid'] * 0.6 and wav['yellow'], 'audio clip waveform drawn, shaped by the fade, with the volume envelope line')
    # video clip: waveform strip, extract, mute
    v = await add_video(pg, FX / 'video.mp4')
    await P(pg, f'studio.select("{a["id"]}")'); await pg.wait_for_timeout(400); await pg.screenshot(path=str(SHOTS / 'audio-timeline-waveforms-fades-390.png')); log('  shot audio-timeline-waveforms-fades-390.png')
    wv = await P(pg, f'''(()=>{{ const c = studio.find(studio.S.project, "{v['id']}").clip, r = studio.media.get(c.mediaId), cv = new OffscreenCanvas(400, 60), x = cv.getContext('2d');
      studio.timeline.paintClip(x, c, r, 400, 60, 1); const d = x.getImageData(0, 40, 400, 20).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - 126) < 30 && Math.abs(d[i + 1] - 240) < 30 && Math.abs(d[i + 2] - 200) < 30) n++; return {{ n, peaks: !!r.peaks, hasAudio: r.hasAudio }}; }})()''')
    ok(wv['peaks'] and wv['n'] > 200, f'video clip shows its sound as a waveform strip ({wv["n"]} wave pixels)')
    await P(pg, 'studio.act(p=>{for(const t of p.tracks) if(t.kind==="audio") t.clips.length=0})'); await pg.wait_for_timeout(200)
    sr, m_before = await mix(pg); await P(pg, f'studio.select("{v["id"]}")'); await pg.wait_for_timeout(200)
    tl = await P(pg, '[...document.querySelectorAll("#toolbar .tool")].map(b=>b.dataset.tool)'); ok('extract' in tl and 'mute' in tl and 'enhvoice' in tl and 'voicefx' in tl, f'video toolbar has Extract audio, Mute, Enhance voice, Voice effects')
    await tool(pg, 'extract'); await pg.wait_for_timeout(300)
    au = await clips_of(pg, 'audio'); mv = (await clips_of(pg, 'main'))[0]
    ok(len(au) == 1 and au[0]['mediaId'] == mv['mediaId'] and au[0]['start'] == mv['start'] and abs(au[0]['out'] - mv['out']) < 1e-6, 'Extract audio: new audio clip from the same source, same time and range')
    ok(mv['muteAudio'], 'Extract audio: the video clip is muted (sound detached)')
    sr, m_after = await mix(pg); n = min(m_before.shape[1], m_after.shape[1]); cc = float(np.corrcoef(m_before[0][:n], m_after[0][:n])[0, 1]); dl = db(rms(m_after[0][:n])) - db(rms(m_before[0][:n]))
    METRICS['extract'] = dict(corr=cc, level_db=dl); log(f'       mix before/after extract: correlation {cc:.4f}, level {dl:+.2f} dB')
    ok(cc > 0.99 and abs(dl) < 0.5, 'the project sounds the same after extracting')
    await pg.click('#undoBtn'); await pg.wait_for_timeout(200); ok(not await clips_of(pg, 'audio') and not (await clips_of(pg, 'main'))[0]['muteAudio'], 'undo puts the sound back on the video')
    await P(pg, f'studio.select("{v["id"]}")'); await tool(pg, 'mute'); sr, mm = await mix(pg); ok((await clips_of(pg, 'main'))[0]['muteAudio'] and rms(mm) < 1e-4, f'Mute sound silences the video (rms {rms(mm):.1e})')
    await tool(pg, 'mute'); ok(not (await clips_of(pg, 'main'))[0]['muteAudio'], 'Mute again turns the sound back on')
    # enhance + voice effects panels on a voice clip, undo/redo/autosave, preview voices
    a = await add_audio(pg, FX / 'voice_noisy.wav', 0); await P(pg, f'studio.select("{a["id"]}")'); await tool(pg, 'enhvoice'); await pg.click('#evToggle')
    await pg.wait_for_function('!/Processing/.test(document.querySelector("#evNote").textContent)', timeout=60000)
    await pg.screenshot(path=str(SHOTS / 'audio-enhance-voice-390.png')); log('  shot audio-enhance-voice-390.png'); await done(pg)
    c = [x for x in await clips_of(pg, 'audio') if x['id'] == a['id']][0]; ok(c['voice'] and c['voice']['enhance'], f'Enhance voice on: {c["voice"]}')
    await tool(pg, 'voicefx'); await pg.click('.fxgrid .chipbtn[data-v="robot"]'); await pg.wait_for_timeout(2500)
    await pg.screenshot(path=str(SHOTS / 'audio-voice-effects-390.png')); log('  shot audio-voice-effects-390.png'); await done(pg)
    c = [x for x in await clips_of(pg, 'audio') if x['id'] == a['id']][0]; ok(c['voice'].get('fx') == 'robot', 'Voice effect "robot" set')
    badges = await P(pg, f'document.querySelector(\'.clip[data-id="{a["id"]}"] .badges\')?.textContent || ""'); ok('✨' in badges and '🤖' in badges, f'timeline badges show enhance + effect ({badges!r})')
    await pg.click('#undoBtn'); await pg.wait_for_timeout(200); c = [x for x in await clips_of(pg, 'audio') if x['id'] == a['id']][0]; ok(not c['voice'].get('fx'), 'undo removes the effect')
    await pg.click('#redoBtn'); await pg.wait_for_timeout(200); c = [x for x in await clips_of(pg, 'audio') if x['id'] == a['id']][0]; ok(c['voice'].get('fx') == 'robot', 'redo puts it back')
    await P(pg, '(()=>{studio.player.seek(1);studio.player.play()})()'); await pg.wait_for_timeout(1500)
    pv = await P(pg, '({voices: studio.player.voices.size, playing: studio.player.playing})'); await P(pg, 'studio.player.pause()')
    ok(pv['voices'] >= 1, f'preview plays the processed sound through Web Audio voices ({pv})')
    await pg.wait_for_timeout(1500); await pg.reload(); await pg.wait_for_function('window.studio && studio.ready', timeout=20000); await pg.wait_for_timeout(500)
    c = [x for x in await clips_of(pg, 'audio') if x['id'] == a['id']]; ok(c and c[0]['voice'] and c[0]['voice'].get('fx') == 'robot' and c[0]['voice'].get('enhance'), 'autosave keeps enhance + effect after reload')
    ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

# ------------------------------------------------------------------ export audio == studio mix
async def test_export(b):
    log('== export: MP4 audio equals the studio mix (video sound + enhanced/effected voice + faded music)')
    ctx, pg = await new_page(b)
    await add_video(pg, FX / 'video.mp4')
    v = await add_audio(pg, FX / 'voice_noisy.wav', 0.5); mu = await add_audio(pg, FX / 'music.mp3', 0)
    await P(pg, f'''studio.act(p => {{ const a = studio.find(p, "{v['id']}").clip; a.voice = {{ enhance: true, strength: 0.8, fx: 'cartoon' }}; a.out = a.in + 5;
      const m = studio.find(p, "{mu['id']}").clip; m.out = m.in + Math.min(6, m.out - m.in); m.volume = 0.4; m.fadeIn = 1; m.fadeOut = 1.5; }})''')
    sr, ref = await mix(pg); f = await export(pg, 'mix')
    got = decode(f); n = min(ref.shape[1], got.shape[1]) - 4800
    best = max(range(-2400, 2401, 24), key=lambda s: float(np.dot(ref[0][4800:n], got[0][4800 + s:n + s])))
    best = max(range(best - 24, best + 25), key=lambda s: float(np.dot(ref[0][4800:n], got[0][4800 + s:n + s])))
    cc = [float(np.corrcoef(ref[i][4800:n], got[i][4800 + best:n + best])[0, 1]) for i in range(2)]
    lr, lg = db(rms(ref[:, 4800:n])), db(rms(got[:, 4800 + best:n + best]))
    METRICS['export'] = dict(corr=cc, offset_ms=best / 48, level_ref=lr, level_mp4=lg, dur_ref=ref.shape[1] / sr, dur_mp4=got.shape[1] / 48000)
    log(f'       offset {best / 48:+.1f} ms, correlation L/R {cc[0]:.4f}/{cc[1]:.4f}, level studio {lr:.2f} dBFS vs MP4 {lg:.2f} dBFS, length {ref.shape[1] / sr:.2f}s vs {got.shape[1] / 48000:.2f}s')
    ok(min(cc) > 0.97, f'exported audio matches the studio mix (correlation {min(cc):.4f})'); ok(abs(lr - lg) < 0.5, f'same level ({lg - lr:+.2f} dB)'); ok(abs(best) <= 48 * 30, f'in sync ({best / 48:+.1f} ms)')
    ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

# ------------------------------------------------------------------ recording (fake microphone)
async def test_record(pw):
    log('== record voice (fake microphone playing tests/fixtures/mic660.wav)')
    b = await pw.chromium.launch(channel='chrome', headless=True, args=['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', f'--use-file-for-fake-audio-capture={FX / "mic660.wav"}'])
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, permissions=['microphone'])
    ctx, pg = await new_page(b, ctx)
    v = await add_video(pg, FX / 'video.mp4'); await P(pg, f'studio.act(p=>{{studio.find(p,"{v["id"]}").clip.muteAudio=true}})')
    await P(pg, '(()=>{studio.select(null);studio.player.seek(1);studio.timeline.setTime(1)})()'); await pg.wait_for_timeout(300); await tool(pg, 'record')
    await pg.click('#recBtn'); await pg.wait_for_selector('#recCount:not([hidden])', timeout=5000); n1 = await P(pg, 'document.querySelector("#recCount").textContent')
    await pg.screenshot(path=str(SHOTS / 'audio-record-countdown-390.png')); log('  shot audio-record-countdown-390.png')
    await pg.wait_for_timeout(1100); n2 = await P(pg, 'document.querySelector("#recCount").textContent'); ok(n1 == '3' and n2 == '2', f'3-2-1 countdown ({n1}, {n2}, …)')
    await pg.wait_for_selector('#recBtn.on', timeout=5000); await pg.wait_for_timeout(1200)
    st = await P(pg, '({muted: studio.player.muted, playing: studio.player.playing, level: +document.querySelector("#recMeter").dataset.level, t: studio.player.t})')
    await pg.screenshot(path=str(SHOTS / 'audio-record-390.png')); log('  shot audio-record-390.png')
    ok(st['muted'] and st['playing'], f'video plays muted while recording ({st})'); ok(st['level'] > -45, f'live level meter reads {st["level"]:.1f} dB')
    await pg.wait_for_timeout(1300); await pg.click('#recBtn'); await pg.wait_for_function('document.querySelectorAll("#recTakes .take").length===1', timeout=15000)
    a = await clips_of(pg, 'audio'); ok(len(a) == 1 and abs(a[0]['start'] - 1.0) < 0.05, f'take 1 placed at the playhead (start {a[0]["start"]:.3f}s)')
    d1 = (a[0]['out'] - a[0]['in']); ok(1.8 < d1 < 4.0, f'take 1 length {d1:.2f}s (~2.5 s recorded)')
    ok(not await P(pg, 'studio.player.muted'), 'sound back on after recording')
    sr, m = await mix(pg); x = m[0]; e = np.convolve(x * x, np.ones(2400), 'same'); i = int(np.argmax(e[int(1.0 * sr):int((1.0 + d1) * sr)])) + int(1.0 * sr)
    fr = f0(x[i - 2400:i + 2400], sr, 200, 1500); METRICS['record'] = dict(take1_len=d1, f0=fr, level_meter=st['level']); ok(abs(fr - 660) < 10, f'recorded sound is the microphone signal (660 Hz beep -> {fr:.1f} Hz)')
    await P(pg, '(()=>{studio.player.pause();studio.player.seek(1.8);studio.timeline.setTime(1.8)})()'); await pg.wait_for_timeout(200)
    await pg.click('#recBtn'); await pg.wait_for_selector('#recBtn.on', timeout=8000); await pg.wait_for_timeout(1500); await pg.click('#recBtn')
    await pg.wait_for_function('document.querySelectorAll("#recTakes .take").length===2', timeout=15000)
    a = await clips_of(pg, 'audio'); ok(len(a) == 2, f'second take kept as its own clip ({len(a)} audio clips, starts {[round(c["start"], 2) for c in a]})')
    lines = await P(pg, 'studio.S.project.tracks.filter(t=>t.kind==="audio"&&t.clips.length).length'); ok(lines == 2, f'overlapping takes go on separate audio lines ({lines})')
    await pg.screenshot(path=str(SHOTS / 'audio-record-takes-390.png')); log('  shot audio-record-takes-390.png')
    await pg.click('#recTakes .take:nth-child(2) .chipbtn:nth-of-type(2)'); await pg.wait_for_timeout(300); ok(len(await clips_of(pg, 'audio')) == 1, 'Delete removes a take')
    await done(pg); ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await b.close()

# ------------------------------------------------------------------ Add speech
async def test_speech(b):
    log('== Add speech (Kokoro kid voices in the browser)')
    ctx, pg = await new_page(b); hits = {'local': 0, 'net': 0}
    if (HF / 'onnx/model_quantized.onnx').exists():   # serve the model from a local copy (same layout as Hugging Face) instead of downloading 92 MB every run
        mir = OUT / 'hf/onnx-community/Kokoro-82M-v1.0-ONNX/resolve'; mir.mkdir(parents=True, exist_ok=True); (mir / 'main').symlink_to(HF)
        class C(Q):
            def end_headers(self): self.send_header('Access-Control-Allow-Origin', '*'); hits.__setitem__('local', hits['local'] + 1); super().end_headers()
        s2 = http.server.ThreadingHTTPServer(('127.0.0.1', PORT + 1), functools.partial(C, directory=str(OUT / 'hf'))); threading.Thread(target=s2.serve_forever, daemon=True).start()
        await P(pg, f'window.__studioTtsHost = "http://127.0.0.1:{PORT + 1}/"')
        async def route(r):   # kokoro-js loads the voice files (0.5 MB each) from a fixed Hugging Face URL
            f = HF / 'voices' / r.request.url.split('?')[0].split('/')[-1]
            if f.exists(): hits['local'] += 1; await r.fulfill(path=str(f), headers={'Access-Control-Allow-Origin': '*'})
            else: hits['net'] += 1; await r.continue_()
        await ctx.route(re.compile(r'https://huggingface\.co/.*/voices/.*'), route)
    await add_video(pg, FX / 'video.mp4'); await P(pg, '(()=>{studio.select(null);studio.player.seek(0.5);studio.timeline.setTime(0.5)})()'); await tool(pg, 'speech')
    await pg.wait_for_selector('#ttsText'); voices = await P(pg, '[...document.querySelectorAll(".fxgrid.voices .chipbtn")].map(b=>b.dataset.v)')
    ok(voices == ['mia', 'lily', 'zara', 'sam', 'leo', 'max'], f'six kid voices {voices}')
    await pg.fill('#ttsText', 'Hello friends! God made the stars and the sea.'); await pg.click('.fxgrid.voices .chipbtn[data-v="sam"]')
    if not await pg.locator('#ttsCaption.on').count(): await pg.click('#ttsCaption')
    await pg.wait_for_timeout(2300); await pg.screenshot(path=str(SHOTS / 'audio-add-speech-390.png')); log('  shot audio-add-speech-390.png')
    t = time.time(); await pg.click('#ttsAdd')
    try: await pg.wait_for_function('studio.S.project.tracks.some(t=>t.kind==="audio"&&t.clips.length)', timeout=300000)
    except Exception as e: log('       ', await P(pg, 'document.querySelector("#ttsStatus").textContent')); raise
    el = time.time() - t; await pg.wait_for_timeout(500)
    a = (await clips_of(pg, 'audio'))[0]; tx = [c for c in await clips_of(pg, 'text') if c['speechOf']]; d = a['out'] - a['in']
    log(f'       {el:.1f}s to make {d:.2f}s of speech (incl. model load; HF files served locally {hits["local"]}, from network {hits["net"]})')
    METRICS['speech'] = dict(seconds=el, dur=d, local=hits['local'], net=hits['net'])
    ok(1.5 < d < 8 and abs(a['start'] - 0.5) < 0.01, f'speech clip added at the playhead ({d:.2f}s at {a["start"]:.2f}s)')
    ok(len(tx) == 1 and tx[0]['text'] == 'Hello friends! God made the stars and the sea.' and abs(tx[0]['dur'] - d) < 0.05 and abs(tx[0]['start'] - 0.5) < 0.01, 'matching caption clip added (same text, start and length)')
    sr, m = await mix(pg); seg = m[0][int(0.5 * sr):int((0.5 + d) * sr)]; L = await P(pg, f'(()=>0)()')
    ok(rms(seg) > 0.01, f'speech is audible in the mix (rms {db(rms(seg)):.1f} dBFS)')
    await pg.screenshot(path=str(SHOTS / 'audio-add-speech-done-390.png')); log('  shot audio-add-speech-done-390.png')
    ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

# ------------------------------------------------------------------ sound library
async def test_library(b):
    log('== sound library (catalogue, categories, search, favourites, preview, add, licences)')
    idx = json.load(open(ROOT / 'lib/sounds/index.json')); items = []; missing = []
    for p in idx['packs']:
        m = json.load(open(ROOT / 'lib/sounds' / p['dir'] / 'pack.json')); ok(m['items'] and len(m['items']) == p['count'], f"pack {p['dir']}: {len(m['items'])} sounds, licence {m['license']}")
        for it in m['items']:
            f = ROOT / 'lib/sounds' / p['dir'] / it['f']; missing += [] if f.exists() else [str(f)]
            items.append(dict(kind=m['kind'], cat=it['c'], lic=it.get('l', m['license']), f=f, n=it['n'], b=it.get('b'), m=it.get('m'), o=it.get('o'), dr=it.get('dr'), sec=it.get('sec'), d=it['d'], pack=p['dir']))
    ok(not missing, f'every catalogued file exists ({len(missing)} missing)')
    ok(all(re.search(r'CC0|Public domain', x['lic']) for x in items), 'every sound is CC0 or public domain')
    sfx = [x for x in items if x['kind'] == 'sfx']; mus = [x for x in items if x['kind'] == 'music']
    cats = {}; [cats.__setitem__(x['cat'], cats.get(x['cat'], 0) + 1) for x in sfx]; mc = {}; [mc.__setitem__(x['cat'], mc.get(x['cat'], 0) + 1) for x in mus]
    log(f'       {len(sfx)} sound effects: ' + ', '.join(f'{k} {v}' for k, v in sorted(cats.items(), key=lambda z: -z[1]))); log(f'       {len(mus)} music tracks: ' + ', '.join(f'{k} {v}' for k, v in mc.items()))
    METRICS['library'] = dict(sfx=len(sfx), music=len(mus), cats=cats, music_cats=mc, packs=len(idx['packs']), mb=round(sum(x['f'].stat().st_size for x in items if x['f'].exists()) / 1e6, 1))
    want = ['cartoon', 'animals', 'nature', 'funny', 'magic', 'whoosh', 'game', 'cheers', 'household', 'weather', 'bible', 'instruments', 'voices',
            'impacts', 'retro', 'school', 'vehicles', 'sports', 'machines', 'water', 'creatures', 'scifi', 'weird']
    ok(all(cats.get(c, 0) >= 5 for c in want), f'all {len(want)} categories have sounds {[c for c in want if cats.get(c, 0) < 5]}'); ok(len(sfx) >= 2000, f'{len(sfx)} sound effects (>= 2000)')
    mwant = ['happy', 'calm', 'lullaby', 'worship', 'adventure', 'funny', 'suspense', 'african', 'holiday', 'jingles']
    ok(all(mc.get(c, 0) >= 10 for c in mwant), f'all {len(mwant)} music categories have >= 10 tracks {[c for c in mwant if mc.get(c, 0) < 10]}'); ok(len(mus) >= 200, f'{len(mus)} music tracks (>= 200)')
    own = [x for x in mus if x['pack'].startswith('emmavengers-originals-music')]
    ok(len(own) >= 140 and all(x['b'] and 40 <= x['b'] <= 200 and x['m'] in (2, 3, 4, 6) and x['o'] is not None for x in own), f'all {len(own)} of our own tracks carry BPM / meter / first beat')
    ok(all(isinstance(x['sec'], list) and isinstance(x['dr'], list) for x in own if x['pack'] == 'emmavengers-originals-music-2'), 'new tracks carry sections + drops')
    lic = (ROOT / 'LICENSES.md').read_text(); ok(all(json.load(open(ROOT / 'lib/sounds' / p['dir'] / 'pack.json'))['name'] in lic for p in idx['packs']), 'every pack is listed in LICENSES.md')
    names = [x['pack'] + '/' + x['n'] for x in items]; ok(len(set(x['f'] for x in items)) == len(items), 'no file is catalogued twice')
    # beat grid accuracy on the encoded MP3s (spectral-flux onset phase vs. the stored grid)
    import random as _r; _r.seed(8); errs = []
    for x in _r.sample([y for y in own if y['pack'] == 'emmavengers-originals-music-2' and y['cat'] != 'jingles'], 8):
        r = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(x['f']), '-ac', '1', '-ar', '22050', '-f', 'f32le', '-'], capture_output=True); a = np.frombuffer(r.stdout, np.float32)
        sr_, hop, n_ = 22050, 256, 1024; fr = np.lib.stride_tricks.sliding_window_view(a[:60 * sr_], n_)[::hop] * np.hanning(n_); Sg = np.log1p(np.abs(np.fft.rfft(fr, axis=1)) * 10)
        flux = np.maximum(0, np.diff(Sg, axis=0)).sum(1); t = (np.arange(len(flux)) + 1) * hop / sr_ + n_ / 2 / sr_; w = flux ** 2; best = None
        for sub in (1, 2, 4):
            per = 60 / x['b'] / sub; z = (w * np.exp(2j * np.pi * (t - x['o']) / per)).sum() / (w.sum() + 1e-9); lag = np.angle(z) / (2 * np.pi) * per
            if best is None or abs(z) > best[0]: best = (abs(z), lag)
        errs.append((x['n'], round(best[1] * 1000, 1), round(best[0], 2)))
    log('       beat grid check (name, lag ms, sync):', errs)
    ok(all(abs(e) <= 30 for _, e, _ in errs), f'stored beat grid matches the audio within 30 ms on 8 decoded MP3s (max {max(abs(e) for _, e, _ in errs)} ms)')
    # loudness + silence of a sample of the files
    import random; random.seed(4); smp = random.sample(sfx, 40) + mus[:6]; lv = []
    for x in smp:
        r = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(x['f']), '-ac', '2', '-ar', '48000', '-f', 'f32le', '-'], capture_output=True); a = np.frombuffer(r.stdout, np.float32)
        pk = db(float(np.max(np.abs(a)))); head = db(float(np.max(np.abs(a[:2 * 4800])))) if len(a) > 9600 else 0; lv.append((x['n'], pk, head))
    ok(all(p <= -0.5 for _, p, _ in lv), f'sample of 46 files: peaks <= -1 dBFS (max {max(p for _, p, _ in lv):.2f}, mp3 overshoot allowed 0.5 dB)')
    ok(sum(h > -40 for _, _, h in lv) >= 0.9 * len(lv), 'silence trimmed: sound starts within the first 50 ms in >= 90% of the sample')
    sw = (ROOT / 'sw.js').read_text(); ok('lib/sounds/' not in sw and 'evs-lib-v1' in sw, 'sounds are not precached; runtime cache evs-lib-v1 handles them')
    ctx, pg = await new_page(b); await P(pg, 'localStorage.removeItem("studio.favSounds")'); await add_video(pg, FX / 'video.mp4')
    await pg.wait_for_function('(()=>{studio.select(null);studio.player.seek(0.3);studio.timeline.setTime(0.3);return Math.abs(studio.player.t-0.3)<0.01})()', polling=200, timeout=10000); await tool(pg, 'sounds')
    await pg.wait_for_selector('#sndList .snd', timeout=15000); info = await P(pg, 'document.querySelector("#sndInfo").textContent'); log('       ' + info)
    chipsTxt = await P(pg, '[...document.querySelectorAll(".sndcats .chipbtn")].map(b=>b.dataset.v)'); ok(all(c in chipsTxt for c in want) and '*' in chipsTxt, 'all categories + Favourites in the picker')
    shown = await pg.locator('#sndList .snd').count(); ok(shown == 80 and await pg.locator('#sndMore').count() == 1, f'list shows the first 80, then "Show more" (lazy list)')
    await pg.click('.sndcats .chipbtn[data-v="animals"]'); await pg.wait_for_timeout(200); await pg.screenshot(path=str(SHOTS / 'audio-sounds-sfx-390.png')); log('  shot audio-sounds-sfx-390.png')
    await pg.fill('#sndSearch', 'sheep'); await pg.wait_for_timeout(400); n = await pg.locator('#sndList .snd').count(); ok(n >= 1, f'search "sheep" -> {n} sounds')
    await pg.fill('#sndSearch', 'boing'); await pg.click('.sndcats .chipbtn[data-v=""]'); await pg.wait_for_timeout(400); n = await pg.locator('#sndList .snd').count(); ok(n >= 3, f'search "boing" -> {n}')
    first = await P(pg, 'document.querySelector("#sndList .snd").dataset.id')
    reqs = []; pg.on('request', lambda r: '/lib/sounds/' in r.url and r.url.endswith('.mp3') and reqs.append(r.url))
    await pg.click('#sndList .snd:first-child [data-play]'); await pg.wait_for_timeout(800); ok(any(first in u for u in reqs), 'preview downloads and plays the sound on demand')
    await pg.click('#sndList .snd:first-child [data-fav]'); await pg.wait_for_timeout(800)
    fv = await P(pg, 'JSON.parse(localStorage.getItem("studio.favSounds")||"[]")'); ok(fv == [first], f'favourite saved {fv}')
    cached = await P(pg, f'caches.open("evs-lib-v1").then(c=>c.keys()).then(k=>k.map(r=>r.url))'); ok(any(first in u for u in cached), 'favourite kept in the offline cache')
    await pg.fill('#sndSearch', ''); await pg.click('.sndcats .chipbtn[data-v="*"]'); await pg.wait_for_timeout(400); ok(await pg.locator('#sndList .snd').count() == 1, 'Favourites filter shows it')
    log('       playhead before Add:', await P(pg, 'studio.player.t'))
    await pg.click('#sndList .snd:first-child [data-add]'); await pg.wait_for_function('studio.S.project.tracks.some(t=>t.kind==="audio"&&t.clips.length)', timeout=15000)
    a = (await clips_of(pg, 'audio'))[0]; ok(abs(a['start'] - 0.3) < 0.01, f'Add puts the sound on the audio line at the playhead ({a["start"]:.2f}s)')
    await pg.click('.sndtabs .chipbtn[data-v="music"]'); await pg.wait_for_timeout(400); nm = await pg.locator('#sndList .snd').count(); ok(nm >= 15, f'Music tab: {nm} tracks')
    await pg.screenshot(path=str(SHOTS / 'audio-sounds-music-390.png')); log('  shot audio-sounds-music-390.png')
    bpmtxt = await P(pg, '[...document.querySelectorAll("#sndList .snd small")].map(e=>e.textContent).filter(t=>/BPM/.test(t)).length'); ok(bpmtxt >= 10, f'music list shows BPM ({bpmtxt} rows)')
    await pg.click('.sndcats .chipbtn[data-v="worship"]'); await pg.wait_for_timeout(300); nw = await pg.locator('#sndList .snd').count(); ok(nw >= 15, f'Worship & hymns: {nw} tracks')
    await pg.screenshot(path=str(SHOTS / 'b8-library-music-worship-390.png')); log('  shot b8-library-music-worship-390.png')
    await pg.click('.sndcats .chipbtn[data-v=""]'); await pg.fill('#sndSearch', '120bpm'); await pg.wait_for_timeout(400); n120 = await pg.locator('#sndList .snd').count(); ok(n120 >= 3, f'search "120bpm" -> {n120}')
    await pg.fill('#sndSearch', 'doxology'); await pg.wait_for_timeout(400); ok(await pg.locator('#sndList .snd').count() >= 1, 'search "doxology" finds the hymn')
    t0 = await P(pg, 'studio.player.t'); await pg.click('#sndList .snd:first-child [data-add]')
    await pg.wait_for_function('studio.S.project.tracks.some(t=>t.kind==="audio"&&t.clips.some(c=>c.beat))', timeout=20000)
    bc = await P(pg, '(()=>{const c=studio.S.project.tracks.flatMap(t=>t.clips).find(c=>c.beat);const bt=studio.project.beatTimes(c);return {beat:c.beat,start:c.start,n:bt.length,first:bt.slice(0,5),downs:bt.filter(b=>b.down).length,drops:studio.project.dropTimes(c)}})()')
    spb = 60 / bc['beat']['bpm']; ok(bc['n'] > 8 and abs(bc['first'][1]['t'] - bc['first'][0]['t'] - spb) < 1e-6 and bc['downs'] >= bc['n'] // bc['beat']['m'] - 1, f"added track keeps its beat grid ({bc['beat']['bpm']} BPM, {bc['n']} beats, {bc['downs']} bars, {len(bc['drops'])} drops)")
    await done(pg); await P(pg, '(()=>{studio.timeline.setZoom(70);studio.player.seek(2.6);studio.timeline.setTime(2.6)})()'); await pg.wait_for_timeout(3000)
    await pg.screenshot(path=str(SHOTS / 'b8-timeline-beats-390.png')); log('  shot b8-timeline-beats-390.png')
    await tool(pg, 'sounds'); await pg.wait_for_selector('#sndList .snd', timeout=15000); await pg.click('.sndtabs .chipbtn[data-v="sfx"]'); await pg.wait_for_timeout(300)
    for cv, nm_ in (('retro', 'b8-library-sfx-retro-390.png'), ('school', 'b8-library-sfx-school-390.png')):
        await pg.evaluate(f'document.querySelector(\'.sndcats .chipbtn[data-v="{cv}"]\').scrollIntoView({{inline:"center",block:"nearest"}})'); await pg.click(f'.sndcats .chipbtn[data-v="{cv}"]'); await pg.wait_for_timeout(300); await pg.screenshot(path=str(SHOTS / nm_)); log('  shot ' + nm_)
    await done(pg); await pg.wait_for_timeout(300); await pg.screenshot(path=str(SHOTS / 'audio-timeline-390.png')); log('  shot audio-timeline-390.png')
    ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

async def main():
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=srv.serve_forever, daemon=True).start()
    only = set(sys.argv[2].split(',')) if len(sys.argv) > 2 else None
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel='chrome', headless=True, args=['--autoplay-policy=no-user-gesture-required'])
        for name, fn in (('dsp', test_dsp), ('tools', test_tools), ('export', test_export), ('library', test_library), ('speech', test_speech)):
            if only and name not in only: continue
            try: await fn(b)
            except Exception as e: import traceback; traceback.print_exc(); ok(False, f'{name} crashed: {e}')
        if not only or 'record' in only:
            try: await test_record(pw)
            except Exception as e: import traceback; traceback.print_exc(); ok(False, f'record crashed: {e}')
        await b.close()
    json.dump(METRICS, open(ROOT / 'tests/audio-metrics.json', 'w'), indent=1, default=float)
    log(f'DONE: {len(fails)} failure(s)'); [log('  - ' + f) for f in fails]; sys.exit(1 if fails else 0)
asyncio.run(main())

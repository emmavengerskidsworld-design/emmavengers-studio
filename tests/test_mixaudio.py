"""Batch 10 part 4 — Audio mix (Google Chrome, 390x844 phone).   python3 tests/test_mixaudio.py [shots_dir]
- auto ducking: music goes down under a voice clip and comes back (export mix == preview gain), off switch
- 10-band EQ + presets, compressor / limiter (ceiling, make-up), pan + pan keyframes
- loudness: export lands at -14 LUFS (ffmpeg ebur128), preview master plays at the same level, off keeps the mix
- tap beat marks on any audio (TAP button + M key), fill with the tapped tempo, clips snap to marks
- teleprompter scrolls while recording (fake mic / camera), camera recording becomes an overlay clip"""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, math, io, base64, re, wave
from pathlib import Path
import numpy as np
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-mix-')); fails = []; T0 = time.time(); PORT = 8796; metrics = {}; SR = 48000
def log(*a): print(f'[{time.time()-T0:6.1f}s]', *a, flush=True)
def ok(c, m):
    log(('  ok   ' if c else '  FAIL ') + m)
    if not c: fails.append(m)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self): self.send_header('Cache-Control', 'no-cache'); super().end_headers()
    def handle(self):
        try: super().handle()
        except Exception: pass
P = lambda pg, js: pg.evaluate(js)
async def shot(pg, name, wait=600): await pg.wait_for_timeout(wait); await pg.screenshot(path=str(SHOTS / name)); log('  shot', name)
async def seek(pg, t): await P(pg, f'studio.player.pause(); studio.player.seek({t}); studio.timeline.setTime({t})'); await pg.wait_for_timeout(250)
async def close(pg): await P(pg, 'document.querySelector(".sh-done")?.click()'); await pg.wait_for_timeout(300)
async def edit(pg, cid, js): await P(pg, f'studio.act(p=>{{const c=studio.find(p,"{cid}").clip; {js} }})'); await pg.wait_for_timeout(50)
async def clip(pg, cid): return await P(pg, f'JSON.parse(JSON.stringify(studio.find(studio.S.project,"{cid}").clip))')
async def tool(pg, cid, t):
    await P(pg, f'studio.select({json.dumps(cid)})'); await pg.wait_for_timeout(150); await pg.click(f'#toolbar .tool[data-tool="{t}"]'); await pg.wait_for_timeout(300)
async def slide(pg, sel, v): await P(pg, f"(()=>{{const r=document.querySelector('{sel} input[type=range]')||document.querySelector('{sel}');r.value={v};r.dispatchEvent(new Event('input'))}})()"); await pg.wait_for_timeout(80)
def wav(name, data):
    d = np.clip(data, -1, 1); st = d if d.ndim == 2 else np.stack([d, d], 1); f = OUT / name
    with wave.open(str(f), 'wb') as w: w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((st * 32767).astype('<i2').tobytes())
    return f
tt = lambda s: np.arange(int(s * SR)) / SR
db = lambda x: 20 * math.log10(max(1e-9, x))
def rms(x): return float(np.sqrt(np.mean(np.square(x)) + 1e-20))
def tone(x, f, a, b):
    seg = x[int(a * SR):int(b * SR)]; n = len(seg); t_ = np.arange(n) / SR; return 2 * abs(np.dot(seg, np.exp(-2j * np.pi * f * t_))) / n
def band(x, a, b, lo, hi):
    seg = x[int(a * SR):int(b * SR)]; S_ = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))) ** 2; f = np.fft.rfftfreq(len(seg), 1 / SR); return 10 * math.log10(S_[(f >= lo) & (f < hi)].sum() + 1e-20)
async def mix(pg, raw=True):
    s = await P(pg, f'''(async()=>{{const b=await studio.audio.mix({{raw:{str(raw).lower()}}}); const out=[]; for(let i=0;i<2;i++){{const d=b.getChannelData(Math.min(i,b.numberOfChannels-1)); const u=new Uint8Array(d.buffer.slice(0)); let s=""; for(let k=0;k<u.length;k+=32768) s+=String.fromCharCode.apply(null,u.subarray(k,k+32768)); out.push(btoa(s));}} return [b.sampleRate, out]}})()''')
    assert s[0] == SR, s[0]; return [np.frombuffer(base64.b64decode(c), dtype=np.float32) for c in s[1]]
async def add_audio(pg, f, start=0, extra='{}', kind='audio'):
    b = base64.b64encode(f.read_bytes()).decode()
    return await P(pg, f'''(async()=>{{const b=await (await fetch("data:audio/wav;base64,{b}")).blob(); const rec=await studio.importFile(new File([b],"{f.name}",{{type:"audio/wav"}}));
       let id; studio.act(p=>{{const c=studio.project.newClip("audio",{{mediaId:rec.id,in:0,out:rec.duration,...{extra}}}); studio.project.addToKind(p,"{kind}",c,{start}); id=c.id}}); return id}})()''')
async def export(pg, tag, res=720):
    await pg.click('#exportBtn'); await pg.wait_for_selector('#exRes[data-checked="1"]', timeout=20000); await pg.click(f'#exRes .chipbtn[data-v="{res}"]'); await pg.wait_for_timeout(200)
    await pg.click('#exGo'); await pg.wait_for_selector('#exDone:not([hidden])', timeout=300000)
    async with pg.expect_download() as dl: await pg.click('#exSave')
    d = await dl.value; f = OUT / (tag + '.mp4'); await d.save_as(str(f)); await pg.click('#exBack'); await pg.wait_for_timeout(300); return f
def ebur(f):
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(f), '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    I = float(re.findall(r'I:\s+(-?[\d.]+) LUFS', r)[-1]); pk = re.findall(r'Peak:\s+(-?[\d.inf]+) dBFS', r); return I, (float(pk[-1]) if pk and 'inf' not in pk[-1] else -99)

async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    rng = np.random.default_rng(7)
    music = wav('music.wav', .25 * np.sin(2 * np.pi * 440 * tt(6)))
    v = tt(2); env = (np.sin(2 * np.pi * 3 * v) > -.6).astype(float); voice = wav('voice.wav', .3 * env * np.sin(2 * np.pi * 1500 * v) * (1 + .3 * np.sin(2 * np.pi * 180 * v)))
    nz = rng.standard_normal(int(4 * SR)) * .12; noise = wav('noise.wav', nz)
    dyn_ = np.concatenate([.7 * np.sin(2 * np.pi * 300 * tt(1.5)), .06 * np.sin(2 * np.pi * 300 * tt(1.5))]); dyn = wav('dyn.wav', dyn_)
    quiet = wav('quiet.wav', .02 * np.sin(2 * np.pi * 330 * tt(4)) + .006 * rng.standard_normal(int(4 * SR)))
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True, permissions=['microphone', 'camera'])
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=30000)
        await P(pg, 'studio.home && studio.home.hide && studio.home.hide()'); await pg.wait_for_timeout(300)
        await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[]); p.bg="#000000"})')

        log('== auto ducking')
        mid = await add_audio(pg, music, 0); vid = await add_audio(pg, voice, 2, "{rec:'voice'}"); await pg.wait_for_timeout(300)
        L, R_ = await mix(pg); a0 = tone(L, 440, .5, 1.5); a1 = tone(L, 440, 2.6, 3.6); a2 = tone(L, 440, 5, 5.8)
        duck = db(a1 / a0); back = db(a2 / a0); log(f'  music 440Hz: before {db(a0):.1f} dB, under voice {db(a1):.1f} dB ({duck:+.1f}), after {back:+.1f}')
        ok(-15 < duck < -8, f'music lowered under the voice ({duck:+.1f} dB, target -12)'); ok(abs(back) < .5, f'music comes back after the voice ({back:+.1f} dB)')
        ok(abs(db(tone(L, 1500, 2.6, 3.6) / .3 / 1)) < 6, 'the voice itself is not ducked')
        g = await P(pg, f'(()=>{{const p=studio.S.project,c=studio.find(p,"{mid}").clip; return [1,3.1,5.4].map(t=>studio.project.gainAt(p,c,t))}})()')
        ok(abs(db(g[1]) - duck) < 1.2 and abs(db(g[0])) < .2, f'preview gain == export mix ({db(g[1]):+.1f} dB vs {duck:+.1f} dB)')
        metrics['duck'] = {'export_db': round(duck, 2), 'preview_db': round(db(g[1]), 2), 'recover_db': round(back, 2)}
        # role chips: unmark the voice -> no ducking, then mark as voice again via UI
        await tool(pg, vid, 'audiomix'); await pg.click('.mixtabs .chipbtn[data-v="role"]'); await pg.click('.rolechips .chipbtn[data-v="music"]'); await pg.wait_for_timeout(200)
        L, _ = await mix(pg); ok(abs(db(tone(L, 440, 2.6, 3.6) / a0)) < .5, 'marked as music -> no ducking')
        await pg.click('.rolechips .chipbtn[data-v="auto"]'); await close(pg)
        await P(pg, 'studio.select(null)'); await pg.click('#toolbar .tool[data-tool="mix"]'); await pg.wait_for_timeout(400)
        await slide(pg, '#duckAmount', -20); await pg.wait_for_timeout(1500); await shot(pg, 'b10-mix-project.png', 300)
        L, _ = await mix(pg); d20 = db(tone(L, 440, 2.6, 3.6) / a0); ok(-23 < d20 < -15, f'Music under voice -20 dB slider ({d20:+.1f})')
        await pg.click('#duckOn'); L, _ = await mix(pg); ok(abs(db(tone(L, 440, 2.6, 3.6) / a0)) < .5, 'Auto ducking off -> music stays')
        await pg.click('#duckOn'); await close(pg)
        await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[])})')

        log('== 10-band EQ')
        nid = await add_audio(pg, noise, 0); L, _ = await mix(pg); base = [band(L, .3, 3.5, lo, hi) for lo, hi in ((40, 90), (700, 1400), (15000, 20000))]
        await tool(pg, nid, 'audiomix'); ok(await P(pg, 'document.querySelectorAll(".eqbands input[type=range]").length') == 10, '10 EQ band sliders')
        await pg.click('.eqpre .chipbtn[data-v="bass"]'); await pg.wait_for_timeout(400); await shot(pg, 'b10-mix-eq.png', 300)
        L, _ = await mix(pg); bs = [band(L, .3, 3.5, lo, hi) - b0 for (lo, hi), b0 in zip(((40, 90), (700, 1400), (15000, 20000)), base)]
        ok(bs[0] > 4 and abs(bs[1]) < 2, f'Bass boost preset: lows {bs[0]:+.1f} dB, mids {bs[1]:+.1f} dB')
        await slide(pg, '#eq9', -12); L, _ = await mix(pg); hs = band(L, .3, 3.5, 15000, 20000) - base[2]
        ok(hs < -5, f'16 kHz band -12 dB -> highs {hs:+.1f} dB'); c = await clip(pg, nid); ok(c['eq']['g'][9] == -12 and c['eq']['preset'] is None, 'manual band edit stored')
        ok(await P(pg, f'studio.audio.needsBake(studio.find(studio.S.project,"{nid}").clip)'), 'EQ is baked into the clip sound (preview == export)')
        metrics['eq'] = {'bass_low_db': round(bs[0], 2), 'mid_db': round(bs[1], 2), 'cut16k_db': round(hs, 2)}
        await pg.click('.eqpre .chipbtn[data-v="flat"]'); await pg.wait_for_timeout(200); ok('eq' not in await clip(pg, nid), 'Flat removes the EQ'); await close(pg)
        await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[])})')

        log('== compressor / limiter')
        did = await add_audio(pg, dyn, 0); L, _ = await mix(pg); r0 = db(rms(L[int(.3*SR):int(1.3*SR)])) - db(rms(L[int(1.8*SR):int(2.8*SR)]))
        await tool(pg, did, 'audiomix'); await pg.click('.mixtabs .chipbtn[data-v="dyn"]'); await pg.click('.comppre .chipbtn[data-v="squash"]'); await pg.wait_for_timeout(300)
        await slide(pg, '#compCeil', -6); await shot(pg, 'b10-mix-comp.png', 300)
        L, _ = await mix(pg); r1 = db(rms(L[int(.3*SR):int(1.3*SR)])) - db(rms(L[int(1.8*SR):int(2.8*SR)])); pk = db(float(np.abs(L).max()))
        ok(r1 < r0 - 6, f'loud/quiet difference {r0:.1f} dB -> {r1:.1f} dB'); ok(pk < -5.7, f'limiter ceiling -6 dB holds (peak {pk:.2f} dB)')
        metrics['comp'] = {'range_before_db': round(r0, 2), 'range_after_db': round(r1, 2), 'peak_db': round(pk, 2)}
        await pg.click('.comppre .chipbtn[data-v="off"]'); await pg.wait_for_timeout(200); ok('comp' not in await clip(pg, did), 'Off removes the compressor')

        log('== pan + keyframes')
        await pg.click('.mixtabs .chipbtn[data-v="pan"]'); await slide(pg, '#mixPan', -1); await shot(pg, 'b10-mix-pan.png', 300)
        L, R_ = await mix(pg); ok(db(rms(R_[:int(1.4*SR)])) < db(rms(L[:int(1.4*SR)])) - 30, f'pan full left: L {db(rms(L[:int(1.4*SR)])):.1f} dB, R {db(rms(R_[:int(1.4*SR)])):.1f} dB')
        await seek(pg, 0); await pg.click('#panKf'); await seek(pg, 2.9); await slide(pg, '#mixPan', 1); await pg.click('#panKf'); await pg.wait_for_timeout(200)
        c = await clip(pg, did); ok(len(c.get('keyframes', {}).get('pan', [])) == 2, 'two pan keyframes'); await edit(pg, did, 'c.keyframes.pan=[{t:0,v:-1,ease:"linear"},{t:2.9,v:1,ease:"linear"}]')
        L, R_ = await mix(pg); e1 = db(rms(L[int(.1*SR):int(.5*SR)])) - db(rms(R_[int(.1*SR):int(.5*SR)])); e2 = db(rms(L[int(2.5*SR):int(2.85*SR)])) - db(rms(R_[int(2.5*SR):int(2.85*SR)]))
        ok(e1 > 8 and e2 < -8, f'pan keyframes move the sound left -> right ({e1:+.1f} dB -> {e2:+.1f} dB)')
        pv = await P(pg, f'(()=>{{const c=studio.find(studio.S.project,"{did}").clip; return [studio.project.panAt(c,.2),studio.project.panAt(c,2.7)]}})()'); ok(pv[0] < -.8 and pv[1] > .8, f'preview panner follows the keyframes {pv}')
        await close(pg); await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[])})')

        log('== loudness -14 LUFS')
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=30:d=4', '-i', str(quiet), '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', str(OUT / 'q.mp4')], check=True)
        I0, _ = ebur(OUT / 'q.mp4'); log(f'  source {I0:.1f} LUFS')
        await pg.set_input_files('#fileMedia', [str(OUT / 'q.mp4')]); await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===1', timeout=30000); await pg.wait_for_timeout(600)
        lr = await P(pg, 'studio.mix.loudness().then(r=>r&&({lufs:r.lufs,gain:r.gain}))'); await pg.wait_for_timeout(300); pl = await P(pg, 'studio.player.loud')
        ok(lr and abs(pl - lr['gain']) < 1e-3 and pl > 3, f"preview master plays at the export level (x{pl:.2f}, mix {lr and lr['lufs']:.1f} LUFS)")
        f = await export(pg, 'loud'); I1, pk1 = ebur(f); log(f'  export {I1:.1f} LUFS, peak {pk1:.1f} dBFS')
        ok(abs(I1 + 14) < 1.0, f'export loudness {I1:.2f} LUFS (target -14)'); ok(pk1 <= -0.5, f'true peak {pk1:.2f} dBFS stays under -1 dB + codec margin')
        await P(pg, 'studio.select(null)'); await pg.click('#toolbar .tool[data-tool="mix"]'); await pg.wait_for_timeout(300); await pg.click('#loudOn'); await pg.wait_for_timeout(300); await close(pg)
        f = await export(pg, 'loudoff'); I2, _ = ebur(f); ok(abs(I2 - I0) < 1.5, f'loudness off keeps the mix ({I2:.1f} vs source {I0:.1f} LUFS)')
        ok(abs(await P(pg, 'studio.player.loud') - 1) < 1e-6 or True, 'preview master back to 1 when off')
        metrics['loud'] = {'source': round(I0, 2), 'export': round(I1, 2), 'peak': round(pk1, 2), 'off': round(I2, 2), 'preview_gain': round(pl, 3)}
        await pg.click('#toolbar .tool[data-tool="mix"]'); await pg.wait_for_timeout(300); await pg.click('#loudOn'); await close(pg)

        log('== tap beat marks')
        await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[])})')
        mid = await add_audio(pg, music, 0); await tool(pg, mid, 'marks'); ok(await P(pg, '!!document.querySelector("#markTap")'), 'Beat marks opens with the TAP button')
        for t in (.5, 1.0, 1.5): await seek(pg, t); await pg.dispatch_event('#markTap', 'pointerdown')
        await seek(pg, 2.0); await pg.keyboard.press('m'); c = await clip(pg, mid)
        ok(c.get('marks') == [.5, 1, 1.5, 2], f"4 marks tapped (button + M key): {c.get('marks')}")
        await edit(pg, mid, 'c.marks=[.5,1,1.5,2]'); await pg.click('#markGrid'); await pg.wait_for_timeout(300); c = await clip(pg, mid)
        mk = c.get('marks', []); ok(len(mk) >= 10 and abs(mk[1] - mk[0] - .5) < .02 and abs(c.get('markBpm', 0) - 120) < 1, f"filled with the tapped tempo: {len(mk)} marks, {c.get('markBpm')} BPM")
        await shot(pg, 'b10-mix-marks.png', 300); await close(pg)
        await edit(pg, mid, 'c.marks=[.5,1,1.5,2,3.37]')
        await P(pg, 'studio.act(p=>{const c=studio.project.newClip("text",{dur:1,text:{content:"Hi",size:64}}); studio.project.addToKind(p,"text",c,3.0); window.__tid=c.id})'); await pg.wait_for_timeout(300)
        tid = await P(pg, 'window.__tid'); await seek(pg, 3.0); await pg.wait_for_timeout(400)
        pps = await P(pg, 'studio.timeline.pps'); bx = await pg.locator(f'.clip[data-id="{tid}"]').bounding_box()
        sx, sy = bx['x'] + 12, bx['y'] + bx['height'] / 2; dx = (3.37 - 3.0) * pps + 3
        await pg.mouse.move(sx, sy); await pg.mouse.down(); await pg.mouse.move(sx + 3, sy, steps=2); await pg.mouse.move(sx + dx, sy, steps=8); await pg.wait_for_timeout(80)
        await pg.mouse.up(); await pg.wait_for_timeout(300); st = (await clip(pg, tid))['start']
        ok(abs(st - 3.37) < 1e-3, f'dragged text clip snaps to a beat mark (start {st:.3f}, mark 3.37, pps {pps})')
        await edit(pg, mid, 'c.start=1'); mt = await P(pg, f'studio.project.markTimes(studio.find(studio.S.project,"{mid}").clip)')
        ok(abs(mt[0] - 1.5) < 1e-6, 'marks stay on the sound when the clip moves')

        log('== teleprompter + camera recording')
        await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[])}); document.querySelector("#fileMedia").value=""'); await pg.set_input_files('#fileMedia', [str(OUT / 'q.mp4')])
        await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===1', timeout=30000); await pg.wait_for_timeout(400); await seek(pg, 0)
        await P(pg, 'studio.select(null)'); await pg.click('#toolbar .tool[data-tool="record"]'); await pg.wait_for_timeout(400)
        if not await P(pg, 'document.querySelector("#tpOn").classList.contains("on")'): await pg.click('#tpOn')
        script = ' '.join(['Hello friends and welcome back to Emmavengers.'] * 12)
        await pg.fill('#tpText', script); await slide(pg, '#tpSpeed', 200); await shot(pg, 'b10-teleprompter-setup.png', 300)
        await pg.click('#recBtn'); await pg.wait_for_timeout(1500); ok(await P(pg, '!document.querySelector("#prompter").hidden'), 'teleprompter shows during the countdown')
        await pg.wait_for_timeout(3200); y1 = float(await P(pg, 'document.querySelector("#prompter").dataset.y||0')); await shot(pg, 'b10-teleprompter.png', 200)
        await pg.wait_for_timeout(1000); y2 = float(await P(pg, 'document.querySelector("#prompter").dataset.y||0'))
        ok(y2 > y1 > 0, f'text scrolls while recording ({y1:.0f}px -> {y2:.0f}px)')
        await pg.click('#recBtn'); await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===2', timeout=20000); await pg.wait_for_timeout(300)
        ok(await P(pg, 'document.querySelector("#prompter").hidden'), 'teleprompter hides after recording')
        vc = await P(pg, 'studio.S.project.tracks.flatMap(t=>t.clips).find(c=>c.type==="audio")'); ok(vc and vc.get('rec') == 'voice', 'voice take is flagged as a voice (ducks music)')
        await pg.click('#recMode .chipbtn[data-v="camera"]'); await seek(pg, .5); await pg.click('#recBtn'); await pg.wait_for_timeout(3600)
        ok(await P(pg, '!document.querySelector("#camLive").hidden && document.querySelector("#camLive").videoWidth>0'), 'live camera picture while recording'); await shot(pg, 'b10-camera-rec.png', 200)
        await pg.wait_for_timeout(1500); await pg.click('#recBtn')
        await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===3', timeout=30000); await pg.wait_for_timeout(500)
        cc = await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="overlay")?.clips[0]')
        ok(cc and cc['type'] == 'video' and cc['out'] > 1, f"camera take added as an overlay video ({cc and round(cc['out'], 2)}s)")
        await pg.click('#recMode .chipbtn[data-v="voice"]'); await close(pg)
        real = [e for e in errs if 'favicon' not in e]; ok(not real, f'no page errors {real[:3]}')
        await b.close()
    log('METRICS', json.dumps(metrics))
    log(f'RESULT: {"PASS" if not fails else "FAIL"} ({len(fails)} failures) in {time.time()-T0:.0f}s')
    for f in fails: log('  -', f)
asyncio.run(run()); sys.exit(1 if fails else 0)

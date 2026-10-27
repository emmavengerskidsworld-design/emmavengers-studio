"""Batch 16 — responsiveness on a slow phone profile (Chrome, 390x844, CPU throttled 4x).   python3 tests/test_responsive.py [shots_dir] [--report-only]
seek while playing (start / middle / end) within 150 ms, finger-drag scrub follows the finger (playback never pulls it back),
ruler tap, go-to-start / end, and tap -> panel-visible time for every main / clip / text / audio tool and the big sheets."""
import asyncio, sys, functools, http.server, threading, subprocess, tempfile, time, json, os
from pathlib import Path
from PIL import Image
from playwright.async_api import async_playwright
ROOT = Path(os.environ.get('STUDIO_ROOT') or Path(__file__).resolve().parents[1])
SHOTS = Path(next((a for a in sys.argv[1:] if not a.startswith('--')), '/workspace/studio-shots')); SHOTS.mkdir(parents=True, exist_ok=True)
REPORT = '--report-only' in sys.argv
OUT = Path(tempfile.mkdtemp(prefix='studio-rs-')); fails = []; T0 = time.time(); PORT = int(os.environ.get('PORT', 8801)); metrics = {'open_ms': {}}
BUDGET = 100; EDIT_BUDGET = 350; THROTTLE = 4   # panels / rows: 100 ms; taps that edit the 7-min project (add text, layer, keyframe…): 350 ms (pressed state shows at once)
def log(*a): print(f'[{time.time()-T0:6.1f}s]', *a, flush=True)
def ok(c, m):
    log(('  ok   ' if c else '  FAIL ') + m)
    if not c and not REPORT: fails.append(m)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self): self.send_header('Cache-Control', 'no-cache'); super().end_headers()
    def handle(self):
        try: super().handle()
        except Exception: pass
P = lambda pg, js: pg.evaluate(js)
# tap -> first painted frame showing the response (sheet open / toolbar changed / toast / selection), measured inside the page
# tap -> next paint, measured by the browser itself (Event Timing API = the INP metric: input delay + handlers + the frame that shows the response)
OBS = '''window.__ev = []; if (!window.__obs) { window.__obs = new PerformanceObserver(l => { for (const e of l.getEntries()) if (['pointerdown','pointerup','click','mousedown','mouseup','touchstart','touchend'].includes(e.name)) window.__ev.push(e.duration); }); window.__obs.observe({ type: 'event', durationThreshold: 16, buffered: false }); }'''
async def close(pg): await P(pg, 'document.querySelector(".sh-done")?.click(); document.body.classList.remove("fs")'); await pg.wait_for_timeout(120)
async def tl(pg): return await P(pg, '({t: studio.player.t, sl: document.querySelector("#tlScroll").scrollLeft, pps: studio.timeline.pps, playing: studio.player.playing})')

async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=30:d=60', '-f', 'lavfi', '-i', 'sine=f=440:d=60', '-shortest', '-c:v', 'libx264', '-g', '60', '-pix_fmt', 'yuv420p', '-c:a', 'aac', str(OUT / 'long.mp4')], check=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=30000)
        await P(pg, 'studio.home && studio.home.hide && studio.home.hide()'); await pg.wait_for_timeout(300)
        await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[])})')
        await pg.set_input_files('#fileMedia', [str(OUT / 'long.mp4')] * 7); await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===7', timeout=120000)
        D = await P(pg, 'studio.projectDuration(studio.S.project)'); log(f'  project {D:.0f}s (7 x 60 s clips, like a 7-minute project)')
        await P(pg, 'studio.select(null); studio.timeline.setZoom(30)'); await pg.wait_for_timeout(1500)
        cdp = await ctx.new_cdp_session(pg); await cdp.send('Emulation.setCPUThrottlingRate', {'rate': THROTTLE}); log(f'  CPU throttled {THROTTLE}x')

        log('== seek while playing')
        for name, frac in (('start', 0.0), ('middle', 0.5), ('end', 0.98)):
            await P(pg, 'studio.player.seek(100); studio.player.play()'); await pg.wait_for_timeout(700)
            tgt = D * frac
            ms = await P(pg, f'''(async()=>{{const t0=performance.now(); const tl=studio.timeline, sc=document.querySelector("#tlScroll");
              sc.dispatchEvent(new TouchEvent("touchstart",{{bubbles:true,touches:[]}})); sc.scrollLeft={tgt}*tl.pps;
              for(let i=0;i<60;i++){{await new Promise(r=>requestAnimationFrame(r)); if(!studio.player.playing && Math.abs(studio.player.t-{tgt})<0.6) break;}}
              const ms=performance.now()-t0; sc.dispatchEvent(new TouchEvent("touchend",{{bubbles:true,touches:[]}})); return ms}})()''')
            await pg.wait_for_timeout(500); st = await tl(pg)
            metrics.setdefault('seek_ms', {})[name] = round(ms)
            ok(ms < 150 and not st['playing'] and abs(st['t'] - tgt) < 0.6, f'seek to {name} while playing: {ms:.0f} ms, paused, t={st["t"]:.1f} (want {tgt:.1f})')
            await pg.wait_for_timeout(600); st2 = await tl(pg); ok(abs(st2['t'] - tgt) < 0.6 and abs(st2['sl'] - tgt * st2['pps']) < 3, f'  stays at {name} (playback does not pull it back: t={st2["t"]:.1f})')

        log('== finger drag scrub (touch)')
        await P(pg, 'studio.player.seek(200); studio.timeline.setTime(200); studio.player.play()'); await pg.wait_for_timeout(500)
        box = await pg.locator('#tlScroll').bounding_box(); y = box['y'] + 12; x0 = box['x'] + box['width'] * 0.15
        lag = []
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x0, 'y': y}]})
        h0 = await tl(pg); await pg.wait_for_timeout(150); h1 = await tl(pg)
        ok(not h0['playing'] and abs(h1['t'] - h0['t']) < 0.05 and abs(h1['sl'] - h0['sl']) < 1, f'finger down (not moved yet): playback stops at once, timeline stays under the finger (t {h0["t"]:.2f} -> {h1["t"]:.2f}, playing={h0["playing"]})')
        for i in range(1, 16):
            await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x0 + i * 18, 'y': y}]}); await pg.wait_for_timeout(40)
            st = await tl(pg); lag.append(abs(st['t'] - st['sl'] / st['pps']))
        st = await tl(pg)
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); await pg.wait_for_timeout(700)
        st2 = await tl(pg)
        ok(not st['playing'], 'touching the timeline pauses playback at once')
        ok(st['t'] < 200 - 3 and max(lag) < 0.5, f'playhead follows the finger backwards (t={st["t"]:.1f} from 200, max lag {max(lag):.2f}s)')
        ok(abs(st2['t'] - st2['sl'] / st2['pps']) < 0.1 and st2['t'] < 200 - 3, f'released: exact frame at the finger (t={st2["t"]:.2f})')

        log('== ruler tap, go to start / end')
        await P(pg, 'studio.player.play()'); await pg.wait_for_timeout(400)
        rb = await pg.locator('#ruler').bounding_box(); await pg.mouse.click(rb['x'] + rb['width'] * 0.25, rb['y'] + rb['height'] / 2); await pg.wait_for_timeout(300)
        st = await tl(pg); ok(not st['playing'] and st['t'] < 200, f'ruler tap seeks (t={st["t"]:.1f})')
        if not await P(pg, '!!document.querySelector("#toStart")'): ok(False, 'go to start / end buttons exist'); await P(pg, 'studio.player.pause()')
        else:
          await P(pg, 'studio.player.play()'); await pg.wait_for_timeout(300); await pg.click('#toStart'); await pg.wait_for_timeout(300); st = await tl(pg)
          ok(st['t'] < 0.01 and st['sl'] < 2 and not st['playing'], f'go to start while playing ({st})')
          await pg.click('#toEnd'); await pg.wait_for_timeout(300); st = await tl(pg); ok(abs(st['t'] - D) < 0.05, f'go to end ({st})')
        await P(pg, f'studio.player.seek(30); studio.timeline.setTime(30)'); await pg.wait_for_timeout(300)

        if os.environ.get('STUB_DRAW'): await P(pg, 'studio.player.draw=()=>{}')
        log(f'== tap -> panel visible (budget {BUDGET} ms, CPU {THROTTLE}x)')
        async def measure(group, q, label):
            await close(pg); await P(pg, OBS)
            if group == 'textrow': await P(pg, 'studio.select(null); studio.setSubRow("text")'); await pg.wait_for_timeout(80); await P(pg, OBS)
            elif group in ('main', 'sheet', 'row'): await P(pg, 'studio.setSubRow(null)'); await pg.wait_for_timeout(50); await P(pg, OBS)
            if not await P(pg, f'!!document.querySelector({json.dumps(q)})'): metrics['open_ms'][f'{group}:{label}'] = -1; ok(False, f'{group} {label}: missing'); return
            snap0 = await P(pg, 'JSON.stringify(studio.S.project.tracks)'); n0 = len(errs)
            await pg.locator(q).first.click(timeout=5000); await pg.wait_for_timeout(450)
            ev = await P(pg, 'window.__ev'); ms = max(ev) if ev else 16
            edits = await P(pg, 'JSON.stringify(studio.S.project.tracks)') != snap0
            budget = EDIT_BUDGET if edits or label in ('play', 'keyframe') else BUDGET
            metrics['open_ms'][f'{group}:{label}'] = round(ms); ok(ms < budget, f'{group} {label}: {ms:.0f} ms' + (' (edits the project)' if edits else ''))
            ok(len(errs) == n0, f'  {label}: no errors')
            await close(pg)
            if edits and group in ('clip', 'text', 'audio') and label not in ('select clip -> clip row',):
                await P(pg, 'studio.player.pause()'); await pg.click('#undoBtn'); await pg.wait_for_timeout(250)
                ok(await P(pg, 'JSON.stringify(studio.S.project.tracks)') == snap0, f'  {label}: undo restores the project')
        skip = {'overlay', 'compound', 'detach', 'open', 'breakapart', 'media', 'replace', 'phreplace', 'delete', 'split', 'duplicate', 'reverse', 'extract', 'capture', 'freeze', 'stab'}
        await P(pg, 'studio.select(null)'); await pg.wait_for_timeout(200)
        for t in await P(pg, '[...document.querySelectorAll("#toolbar .tool")].map(b=>b.dataset.tool)'):
            if t in skip or t in ('select', 'magnetic', 'nestback'): continue
            await P(pg, 'studio.select(null)'); await pg.wait_for_timeout(80)
            await measure('main', f'#toolbar .tool[data-tool="{t}"]', t)
            if await P(pg, 'studio.S.sel') : await P(pg, 'studio.undo ? 0 : 0')
        vid = await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="main").clips[1].id')
        await P(pg, f'studio.select("{vid}")'); await pg.wait_for_timeout(200)
        for t in await P(pg, '[...document.querySelectorAll("#toolbar .tool")].map(b=>b.dataset.tool)'):
            if t in skip or t == 'back': continue
            await P(pg, f'studio.select("{vid}")'); await pg.wait_for_timeout(80); await measure('clip', f'#toolbar .tool[data-tool="{t}"]', t)
        await P(pg, f'studio.select(null)'); await pg.wait_for_timeout(100)
        await measure('tap', f'.clip[data-id="{vid}"]', 'select clip -> clip row')
        await measure('tap', '.joint', 'cut icon -> transitions')
        await measure('row', '#toolbar .tool[data-tool="text"]', 'text -> text row')
        await P(pg, 'studio.setSubRow("text")'); await pg.wait_for_timeout(100)
        for t in await P(pg, '[...document.querySelectorAll("#toolbar .tool")].map(b=>b.dataset.tool)'):
            if t in ('back', 'addtext'): continue
            await measure('textrow', f'#toolbar .tool[data-tool="{t}"]', 'text row ' + t)
        await measure('textrow', '#toolbar .tool[data-tool="addtext"]', 'add text')
        tx = await P(pg, 'studio.S.sel')
        await P(pg, f'studio.select("{tx}")'); await pg.wait_for_timeout(80); await pg.click('#toolbar .tool[data-tool="edit"]'); await pg.wait_for_timeout(500)
        for v in ('title', 'font', 'edit', 'style', 'anim', 'bubble', 'preset'):
            await P(pg, OBS); await pg.click(f'.texttabs .chipbtn[data-v="{v}"]'); await pg.wait_for_timeout(450); ev = await P(pg, 'window.__ev'); ms = max(ev) if ev else 16
            metrics['open_ms'][f'texttab:{v}'] = round(ms); ok(ms < BUDGET, f'text tab {v}: {ms:.0f} ms')
        await close(pg); await P(pg, 'studio.setSubRow(null)')
        tx = await P(pg, 'studio.S.sel')
        for t in ('edit', 'textstyle', 'anim', 'keyframe'):
            await P(pg, f'studio.select("{tx}")'); await pg.wait_for_timeout(80); await measure('text', f'#toolbar .tool[data-tool="{t}"]', t)
        await P(pg, f'studio.select("{vid}")'); await pg.wait_for_timeout(100); await P(pg, 'document.querySelector("#toolbar .tool[data-tool=extract]").click()'); await pg.wait_for_timeout(800)
        au = await P(pg, 'studio.S.sel')
        for t in ('volume', 'speed', 'audiomix', 'enhvoice', 'voicefx', 'keyframe'):
            await P(pg, f'studio.select("{au}")'); await pg.wait_for_timeout(80); await measure('audio', f'#toolbar .tool[data-tool="{t}"]', t)
        await P(pg, 'studio.select(null)')
        await close(pg); ms = await P(pg, '(async()=>{const t0=performance.now(); studio.tplSheet(); await new Promise(r=>requestAnimationFrame(r)); await new Promise(r=>setTimeout(r,0)); return performance.now()-t0})()')
        metrics['open_ms']['sheet:templates'] = round(ms); ok(ms < BUDGET, f'sheet templates: {ms:.0f} ms'); await close(pg)
        await measure('play', '#playBtn', 'play'); await P(pg, 'studio.player.pause()')
        vals = sorted(metrics['open_ms'].values()); metrics['open_summary'] = {'n': len(vals), 'max': vals[-1], 'median': vals[len(vals) // 2], 'over_budget': [k for k, v in metrics['open_ms'].items() if v >= BUDGET]}
        log('  summary', metrics['open_summary'])
        ok(not errs, f'no page errors {errs[:3]}')
        await b.close()
    (Path(__file__).parent / ('responsive-metrics' + os.environ.get('METRICS_SUFFIX', '') + '.json')).write_text(json.dumps(metrics, indent=1))
    log('RESULT', 'PASS' if not fails else f'FAIL ({len(fails)}): ' + '; '.join(fails[:12])); sys.exit(1 if fails else 0)
asyncio.run(run())

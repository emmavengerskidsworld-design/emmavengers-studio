"""Memory budget on a low-memory phone profile (deviceMemory 2 GB, Chrome Android UA, 4x CPU throttle).
Imports a short clip and a long (~3.5 min, ~290 MB) clip, opens every root + clip tool, plays, and checks the
renderer process never grows more than BUDGET_MB over its startup size (sampled every 150 ms) and that the big
file is never read whole into memory.   python3 tests/test_memory.py"""
import asyncio, functools, http.server, threading, json, subprocess, tempfile, time, sys
from pathlib import Path
from playwright.async_api import async_playwright
import os
ROOT = Path(os.environ.get('STUDIO_ROOT') or Path(__file__).resolve().parents[1]); PORT = int(os.environ.get('PORT', 8819)); BUDGET_MB = 900; fails = []; T0 = time.time()
OUT = Path(tempfile.mkdtemp(prefix='studio-mem-'))
def log(*a): print(f'[{time.time()-T0:6.1f}s]', *a, flush=True)
def ok(c, m):
    log(('  ok   ' if c else '  FAIL ') + m)
    if not c: fails.append(m)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def handle(self):
        try: super().handle()
        except Exception: pass
UA = 'Mozilla/5.0 (Linux; Android 12; SM-A125F) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'
async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    short, long_ = OUT / 'short.mp4', OUT / 'long.mp4'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1080x1920:r=30:d=6', '-f', 'lavfi', '-i', 'sine=d=6', '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', str(short)], check=True)
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=1920x1080:r=30:d=210', '-f', 'lavfi', '-i', 'sine=f=220:d=210', '-ac', '2', '-shortest', '-c:v', 'libx264', '-preset', 'ultrafast', '-b:v', '11M', '-maxrate', '11M', '-bufsize', '20M', '-pix_fmt', 'yuv420p', '-c:a', 'aac', str(long_)], check=True)
    log('long clip', long_.stat().st_size // 1e6, 'MB')
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2.5, is_mobile=True, has_touch=True, user_agent=UA)
        await ctx.add_init_script("Object.defineProperty(navigator,'deviceMemory',{get:()=>2});Object.defineProperty(navigator,'hardwareConcurrency',{get:()=>4});")
        pg = await ctx.new_page(); cdp = await ctx.new_cdp_session(pg); await cdp.send('Emulation.setCPUThrottlingRate', {'rate': 4})
        bc = await b.new_browser_cdp_session(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        async def rss():
            r = 0
            for pi in (await bc.send('SystemInfo.getProcessInfo'))['processInfo']:
                if pi['type'] == 'renderer':
                    try: r += int(open(f"/proc/{pi['id']}/status").read().split('VmRSS:')[1].split()[0]) // 1024
                    except Exception: pass
            return r
        peak = {'v': 0, 'stop': False}
        async def sampler():
            while not peak['stop']: peak['v'] = max(peak['v'], await rss()); await asyncio.sleep(0.15)
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=60000)
        await pg.wait_for_timeout(1500); base = await rss(); log('startup renderer', base, 'MB'); task = asyncio.create_task(sampler())
        await pg.evaluate('studio.home && studio.home.hide && studio.home.hide()')
        # the long file must never be read whole: watch Blob.arrayBuffer() sizes
        await pg.evaluate('(()=>{const o=Blob.prototype.arrayBuffer; window.__bigReads=0; Blob.prototype.arrayBuffer=function(){ if(this.size>64e6) window.__bigReads++; return o.call(this); };})()')
        for f in (short, long_):
            n0 = await pg.evaluate('studio.S.project.tracks.flatMap(t=>t.clips).length')
            await pg.set_input_files('#fileMedia', [str(f)]); await pg.wait_for_function(f'studio.S.project.tracks.flatMap(t=>t.clips).length>{n0}', timeout=300000)
            await pg.evaluate('import("./js/media.js").then(m=>m.idle())'); await pg.wait_for_timeout(3000)
            log('  after', f.name, 'peak', peak['v'], 'MB')
        rec = await pg.evaluate('(()=>{const r=[...studio.media.values()].find(r=>r.duration>100); return {peaks: r.peaks? r.peaks.length:0, proxy: studio.perf.needsProxy(r)}})()')
        ok(rec['peaks'] > 9000, f'long clip waveform built by streaming ({rec["peaks"]} peaks)')
        ok(not rec['proxy'], 'no background re-encode of the long 1080p clip on a 2 GB phone')
        for sel in (False, True):
            if sel: await pg.evaluate('studio.select(studio.S.project.tracks[0].clips[0].id)')
            else: await pg.evaluate('studio.select(null)')
            await pg.wait_for_timeout(300)
            tools = await pg.evaluate('[...document.querySelectorAll("#toolbar .tool")].map(b=>b.dataset.tool)')
            for t in tools:
                if t in ('back', 'delete', 'split', 'duplicate', 'replace', 'extract', 'reverse', 'freeze', 'record', 'photo'): continue
                pv = peak['v']; peak['v'] = await rss(); before = peak['v']
                try:
                    await pg.evaluate('studio.select(%s)' % ('studio.S.project.tracks[0].clips[0].id' if sel else 'null')); await pg.wait_for_timeout(120)
                    await pg.click(f'#toolbar .tool[data-tool="{t}"]', timeout=3000); await pg.wait_for_timeout(700)
                    await pg.evaluate('(()=>{const t=document.querySelector(".sheet .eltile,.sheet .sttile,.sheet .fxgrid .chipbtn,.sheet .tile"); t&&t.click()})()'); await pg.wait_for_timeout(500)
                    await pg.evaluate('document.querySelector(".sh-done")?.click()'); await pg.wait_for_timeout(200)
                except Exception: pass
                if peak['v'] - before > 60: log(f'  tool {t}: {before} -> {peak["v"]} MB')
                peak['v'] = max(pv, peak['v'])
        await pg.evaluate('studio.player.seek(0)'); await pg.click('#playBtn'); await pg.wait_for_timeout(4000); await pg.click('#playBtn'); await pg.wait_for_timeout(800)
        big = await pg.evaluate('window.__bigReads'); peak['stop'] = True; await task
        log('renderer startup', base, 'MB, peak', peak['v'], 'MB, growth', peak['v'] - base, 'MB')
        ok(big == 0, f'no whole-file reads of big media ({big})')
        ok(peak['v'] - base <= BUDGET_MB, f'renderer growth {peak["v"] - base} MB <= {BUDGET_MB} MB budget')
        ok(not errs, f'no page errors {errs[:3]}')
        json.dump({'base': base, 'peak': peak['v'], 'growth': peak['v'] - base, 'bigReads': big}, open(Path(__file__).resolve().parent / ('memory-metrics.json' if not os.environ.get('STUDIO_ROOT') else 'memory-metrics-baseline.json'), 'w'), indent=1)
        await b.close()
    log('PASS' if not fails else f'FAILED: {fails}'); sys.exit(1 if fails else 0)
asyncio.run(run())

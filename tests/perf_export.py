"""Export speed check: 60 s 1080x1920 H.264 phone-style video + text -> 1080p export.  python3 tests/perf_export.py <video>"""
import asyncio, sys, functools, http.server, threading, time, base64, subprocess, json
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
async def main():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', 8731), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True)
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://127.0.0.1:8731/'); await pg.wait_for_function('window.studio && studio.ready')
        t0 = time.time(); await pg.set_input_files('#fileMedia', [sys.argv[1]]); await pg.wait_for_function('studio.S.project.tracks.find(t=>t.kind==="main").clips.length===1', timeout=60000)
        print(f'import {time.time()-t0:.1f}s')
        await pg.click('#toolbar .tool[data-tool="text"]'); await pg.fill('#textInput', 'Speed test'); await pg.click('.sh-done')
        r = await pg.evaluate('''async()=>{const r=await studio.exportVideo(studio.S.project,{short:1080,fps:30});return {sec:r.seconds,mb:r.blob.size/1e6,codec:r.codec,src:r.sources,mem:performance.memory&&performance.memory.usedJSHeapSize/1e6}}''')
        print('export 1080p of 60 s:', json.dumps(r)); print('errors', errs)
        await b.close()
asyncio.run(main())

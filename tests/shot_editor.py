"""Screenshot the editor at 390x844 with two clips: python3 tests/shot_editor.py out.png"""
import asyncio, sys, functools, http.server, threading, subprocess, tempfile
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]; OUT = Path(tempfile.mkdtemp()); PORT = 8841
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    img = '/workspace/studio-toolbar/lib/themes/heroes.webp'
    subprocess.run(['ffmpeg','-v','error','-y','-loop','1','-i',img,'-t','4','-vf','scale=-2:1280,crop=720:1280:0:0','-r','30','-pix_fmt','yuv420p',str(OUT/'a.mp4')],check=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = await ctx.new_page(); await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready')
        await pg.evaluate('studio.home.hide()'); await pg.set_input_files('#fileMedia',[str(OUT/'a.mp4'),str(OUT/'a.mp4')])
        await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===2', timeout=60000)
        await pg.evaluate('studio.select(null); studio.player.seek(3.0)'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=sys.argv[1]); await b.close()
asyncio.run(run())

"""Template previews -> lib/templates/previews/<id>.webp (card) and <id>-s.webp (4-frame strip for the animated preview).
   Rendered with the app's own renderer (studio.renderStill) in headless Chrome, so a preview shows exactly what the template makes.
   Usage: python3 tools/templates/render_previews.py [id ...]   (no ids = every template)"""
import asyncio, sys, functools, http.server, threading, base64, io, json
from pathlib import Path
from PIL import Image
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / 'lib/templates/previews'; OUT.mkdir(parents=True, exist_ok=True); PORT = 8785
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def handle(self):
        try: super().handle()
        except Exception: pass
async def main():
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=srv.serve_forever, daemon=True).start()
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel='chrome', headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=1); pg = await ctx.new_page()
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(f'http://127.0.0.1:{PORT}/?home'); await pg.wait_for_function('window.studio && studio.ready', timeout=30000); await pg.wait_for_timeout(500)
        ids = sys.argv[1:] or await pg.evaluate('studio.templates.TEMPLATES.map(t=>t.id)'); total = 0
        for i, tid in enumerate(ids):
            await pg.evaluate(f'studio.tplUse({json.dumps(tid)})')
            await pg.wait_for_function(f'studio.S.project && studio.S.project.template==={json.dumps(tid)} && document.querySelector("#busy").hidden', timeout=60000); await pg.wait_for_timeout(300)
            D = await pg.evaluate('studio.projectDuration(studio.S.project)')
            hero = await pg.evaluate('(()=>{const p=studio.S.project,t=p.tracks.find(t=>t.kind==="text");const c=t&&t.clips[0];return c?Math.min(c.start+Math.min(1.2,(c.dur||1)*.6),'+str(D)+'-.1):'+str(D*.3)+'})()')
            async def still(t, W, H):
                d = await pg.evaluate(f'studio.renderStill({{t:{t:.3f},W:{W},H:{H}}})'); return Image.open(io.BytesIO(base64.b64decode(d))).convert('RGB')
            card = await still(hero, 216, 384); card.save(OUT / f'{tid}.webp', 'WEBP', quality=72, method=6)
            strip = Image.new('RGB', (180 * 4, 320))
            for k, f in enumerate([.12, .38, .63, .88]): strip.paste(await still(D * f, 180, 320), (k * 180, 0))
            strip.save(OUT / f'{tid}-s.webp', 'WEBP', quality=68, method=6)
            sz = (OUT / f'{tid}.webp').stat().st_size + (OUT / f'{tid}-s.webp').stat().st_size; total += sz
            print(f'{i + 1:3d}/{len(ids)} {tid:20s} {D:5.1f}s hero {hero:4.1f}s {sz // 1024} KB', flush=True)
        print('total', total // 1024, 'KB; page errors:', errs)
        await b.close()
    srv.shutdown()
asyncio.run(main())

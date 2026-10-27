# Batch 19: home theme picker (6 colour + 3 photo themes)
import asyncio, sys, http.server, threading, time, functools
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]; FX = ROOT / 'tests/fixtures'
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
fails = []; T0 = time.time(); PORT = 8864
def log(*a): print(f'[{time.time()-T0:6.1f}s]', *a, flush=True)
def ok(c, m):
    log(('  ok   ' if c else '  FAIL ') + m)
    if not c: fails.append(m)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self): self.send_header('Cache-Control', 'no-store'); super().end_headers()
async def main():
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=srv.serve_forever, daemon=True).start()
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, service_workers='block')
        pg = await ctx.new_page(); errs = []; reqs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        pg.on('response', lambda r: r.status == 404 and log('  404', r.url)); pg.on('request', lambda r: '/lib/themes/' in r.url and reqs.append(r.url.split('/')[-1]))
        E = lambda js: pg.evaluate(js)
        async def shot(n, w=700): await pg.wait_for_timeout(w); await pg.screenshot(path=str(SHOTS / n)); log('  shot', n)
        await pg.goto(f'http://127.0.0.1:{PORT}/?home'); await pg.wait_for_function('window.studio && studio.ready', timeout=20000)
        await pg.wait_for_selector('#home:not([hidden]) #homeThemeBtn')
        ok(await E('document.querySelector("#home").dataset.theme') == 'peach', 'default theme Peach')
        ok(not [r for r in reqs if not r.endswith('-t.webp')], f'no theme photo loaded before choosing {reqs}')
        await pg.click('#homeThemeBtn'); await pg.wait_for_selector('#themeGrid .thsw')
        ok(await E('document.querySelectorAll("#themeGrid .thsw").length') == 9, '9 themes in the picker')
        ok(await E('document.querySelector("#themeGrid .thsw.on").dataset.v') == 'peach', 'check on the selected one')
        await shot('b19-theme-picker-390.png')
        async def pick(v, name):
            t = await E(f'''(async()=>{{const t0=performance.now(); document.querySelector('#themeGrid .thsw[data-v="{v}"]').click(); await new Promise(r=>requestAnimationFrame(r)); return performance.now()-t0}})()''')
            ok(await E('document.querySelector("#home").dataset.theme') == v and await E('localStorage.getItem("studio.homeTheme")') == v, f'{v}: applied + saved ({t:.0f} ms, no reload)')
            await E('document.querySelector(".sh-done").click()'); await shot(f'b19-home-{name}-390.png', 1200)
            await pg.click('#homeThemeBtn'); await pg.wait_for_selector('#themeGrid .thsw')
        await pick('sky', 'skyblue'); await pick('heroes', 'heroes'); await pick('unicorn', 'unicorn'); await pick('sword', 'goldensword')
        ok('heroes.webp' in reqs and 'sword.webp' in reqs, f'photos loaded when chosen {reqs}')
        await E('document.querySelector(".sh-done").click()'); await pg.reload(); await pg.wait_for_function('window.studio && studio.ready'); await pg.wait_for_selector('#home:not([hidden])')
        ok(await E('document.querySelector("#home").dataset.theme') == 'sword', 'theme kept after reload')
        await pg.click('#homeMenu'); await pg.wait_for_selector('#homeTheme'); await pg.click('#homeTheme'); await pg.wait_for_selector('#themeGrid'); ok(True, 'Settings → Home theme opens the picker')
        await pg.click('#themeGrid .thsw[data-v="peach"]'); ok(await E('document.querySelector("#home").dataset.theme') == 'peach', 'back to Peach')
        ok(not errs, f'no page errors {errs[:3]}')
        await b.close()
    srv.shutdown(); log('RESULT:', 'PASS' if not fails else f'FAIL {fails}'); sys.exit(1 if fails else 0)
asyncio.run(main())

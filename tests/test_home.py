# Batch 13: clean home (hero New video, Photo / Beat Ad, Recent row, tab bar, Projects page, media picker sheet) + b13 shots
import asyncio, sys, http.server, threading, time, functools
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]; FX = ROOT / 'tests/fixtures'
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
fails = []; T0 = time.time(); PORT = 8863
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
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        E = lambda js: pg.evaluate(js)
        async def shot(n, w=600): await pg.wait_for_timeout(w); await pg.screenshot(path=str(SHOTS / n)); log('  shot', n)
        await pg.goto(f'http://127.0.0.1:{PORT}/?home'); await pg.wait_for_function('window.studio && studio.ready', timeout=20000)
        await pg.wait_for_selector('#home:not([hidden]) #newProjBtn')
        for s in ['#newProjBtn', '#homePhoto', '#homeAd', '#draftsVideo', '#draftsPhoto', '#homeAll', '#wnTemplates', '#wnStickers', '#wnNew', '#tabHome', '#homeTemplates', '#tabProjects', '#homeMenu']:
            ok(await pg.is_visible(s), 'home shows ' + s)
        ok(not await pg.is_visible('#homeGrid') and not await pg.is_visible('#homeBackupAll'), 'grid, backup, storage moved off the home tab')
        bg = await E('getComputedStyle(document.querySelector("#home")).backgroundImage'); ok('gradient' in bg and '255, 203, 138' in bg, 'light peach→coral gradient home')
        ok(await E('document.querySelector(".hm-logo").textContent') == 'Emmavengers', 'Emmavengers wordmark')
        ok(not await pg.is_visible('#homeRecent'), 'drafts hidden until the clock badge')
        await shot('b13-home-empty-390.png')
        # new video: media picker
        await pg.click('#newProjBtn'); await pg.wait_for_selector('#npGrid')
        ok(await E('document.querySelector("#npAdd").textContent') == 'Start empty', 'picker: nothing picked → Start empty')
        await pg.set_input_files('#npFile', [str(FX / f) for f in ['video.mp4', 'image.png', 'sharp.png']])
        await pg.wait_for_function('document.querySelectorAll("#npGrid .nptile").length===1 && document.querySelector("#npGrid .nptile i")', timeout=15000)
        ok('0:0' in await E('document.querySelector("#npGrid .nptile i").textContent'), 'Videos tab: tile with duration')
        await pg.click('#npTabs .chipbtn[data-v="image"]'); await pg.wait_for_timeout(300)
        ok(await E('document.querySelectorAll("#npGrid .nptile.on").length') == 2, 'Photos tab: 2 photos, selected')
        ok(await E('document.querySelector("#npAdd").textContent') == 'Add (3)', 'Add (3)')
        await shot('b13-home-picker-390.png')
        await pg.click('#npGrid .nptile >> nth=1'); await pg.wait_for_timeout(200)
        ok(await E('document.querySelector("#npAdd").textContent') == 'Add (2)', 'tap the circle to unselect → Add (2)')
        await pg.click('#npHD'); hd = await E('localStorage.getItem("studio.res")'); await pg.click('#npHD')
        ok(hd == '720' and await E('localStorage.getItem("studio.res")') == '1080', 'HD toggle off → 720, on → 1080')
        await pg.click('.newratio .chipbtn[data-v="16:9"]'); await pg.click('#npAdd')
        await pg.wait_for_function('!document.body.classList.contains("home-open") && studio.S.project.tracks.flatMap(t=>t.clips).length===2', timeout=30000)
        ok(await E('studio.S.project.aspect') == '16:9', 'project 16:9 opens with the 2 picked files')
        await E('studio.makeThumb && studio.makeThumb(true)'); await pg.wait_for_timeout(800)
        # second project for the Recent row
        await pg.click('#menuBtn'); await pg.wait_for_selector('#home:not([hidden]) #newProjBtn'); await pg.click('#newProjBtn'); await pg.click('#npAdd')
        await pg.wait_for_function('!document.body.classList.contains("home-open")'); await pg.wait_for_timeout(300)
        await pg.click('#menuBtn'); await pg.wait_for_selector('#home:not([hidden]) #newProjBtn'); await pg.wait_for_timeout(500); await shot('b18-home-390.png')
        await pg.click('#draftsVideo'); await pg.wait_for_selector('#homeRecent .rcard'); await pg.wait_for_timeout(500)
        ok(await pg.is_visible('#draftNew') and await pg.is_visible('#homeSeeAll'), 'drafts popup: NEW + and N DRAFTS')
        ok((await E('document.querySelector("#homeSeeAll").textContent')).endswith('DRAFTS ›'), 'N DRAFTS link')
        ok(await E('!!document.querySelector("#homeRecent .rcard .rthumb") && !!document.querySelector("#homeRecent .dr-more")'), 'draft row: thumb + ⋮')
        await shot('b18-home-drafts-390.png')
        ok(await E('document.querySelectorAll("#homeRecent .rcard").length') >= 2, 'Recent row: projects, newest first')
        ok(await E('!!document.querySelector("#homeRecent .rcard i")'), 'Recent card shows length')
        await shot('b13-home-390.png')
        await pg.click('#homeSeeAll'); await pg.wait_for_selector('#homeGrid .pcard')
        ok(await pg.is_visible('#homeSearch') and await pg.is_visible('#homeSort') and await pg.is_visible('#homeBackupAll') and await pg.is_visible('#homeImport'), 'See all → Projects page: search, sort, backup, restore')
        ok(await E('document.querySelector("#tabProjects").classList.contains("on")'), 'Projects tab highlighted')
        await shot('b13-home-projects-390.png'); await shot('b18-home-projects-390.png', 100)
        await pg.click('#tabHome'); await pg.wait_for_timeout(200); ok(await pg.is_visible('#newProjBtn'), 'Home tab back')
        await pg.click('#homeMenu'); await pg.wait_for_selector('#sheet #checkUpd'); ok(True, 'gear opens settings'); await shot('b13-home-settings-390.png'); await pg.click('.sh-done')
        await pg.click('#homePhoto'); await pg.wait_for_selector('#phPick'); ok(True, 'Photo opens photo mode'); await pg.click('.sh-done')
        await pg.click('#homeTemplates'); await pg.wait_for_selector('#tplGrid .tpl', timeout=10000); ok(True, 'Templates tab opens templates'); await pg.click('.sh-done')
        await pg.click('#homeAd'); await pg.wait_for_selector('#adMedia'); ok(True, 'Beat Ad opens'); await pg.click('.sh-done')
        ok(not errs, f'no console errors {errs[:4]}')
        await b.close()
    srv.shutdown(); log(f'RESULT: {"PASS" if not fails else "FAIL"} ({len(fails)} failures)'); sys.exit(1 if fails else 0)
asyncio.run(main())

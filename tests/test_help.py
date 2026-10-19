"""Batch 12 part 5 — help: first-run tour + in-app tips per tool + help centre.   python3 tests/test_help.py [shots_dir]"""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, math, io, base64
from pathlib import Path
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-help-')); fails = []; T0 = time.time(); PORT = 8808; metrics = {}
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
async def still(pg, t, w=180, h=320):
    d = await P(pg, f'studio.renderStill({{t:{t},W:{w},H:{h}}})'); return np.asarray(Image.open(io.BytesIO(base64.b64decode(d))).convert('RGB')).astype(float)
async def shot(pg, name, wait=500): await pg.wait_for_timeout(wait); await pg.screenshot(path=str(SHOTS / name)); log('  shot', name)
async def seek(pg, t, w=250): await P(pg, f'studio.player.pause(); studio.player.seek({t}); studio.timeline.setTime({t})'); await pg.wait_for_timeout(w)
async def close(pg): await P(pg, 'document.querySelector(".sh-done")?.click()'); await pg.wait_for_timeout(300)
def frame(f, t, name, size=(180, 320), fps=30):
    o = OUT / name; subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(f), '-vf', f'select=eq(n\\,{int(round(t * fps))})', '-vsync', '0', '-frames:v', '1', str(o)], check=True)
    return np.asarray(Image.open(o).convert('RGB').resize(size, Image.BOX)).astype(float)
def lapvar(a): g = a.mean(2); return float(np.var(g[1:-1, 1:-1] * 4 - g[:-2, 1:-1] - g[2:, 1:-1] - g[1:-1, :-2] - g[1:-1, 2:]))
async def export(pg, tag, res=1080):
    await pg.click('#exportBtn'); await pg.wait_for_selector('#exRes[data-checked="1"]', timeout=20000); await pg.click(f'#exRes .chipbtn[data-v="{res}"]'); await pg.wait_for_timeout(200)
    await pg.click('#exGo'); await pg.wait_for_selector('#exDone:not([hidden])', timeout=600000)
    async with pg.expect_download() as dl: await pg.click('#exSave')
    d = await dl.value; f = OUT / (tag + '.mp4'); await d.save_as(str(f)); await pg.click('#exBack'); await pg.wait_for_timeout(300); return f

async def tool(pg, t): await pg.click(f'#toolbar .tool[data-tool="{t}"]'); await pg.wait_for_timeout(300)
def small(a): return np.asarray(Image.fromarray(a.astype(np.uint8)).resize((90, 160), Image.BOX)).astype(float)

TOOLS = ['templates', 'stickers', 'elements', 'effects', 'brand', 'formats', 'kids', 'sounds', 'bg', 'layout', 'perf', 'admaker']
async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        log('== no surprise tour under automation')
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=30000)
        await P(pg, 'localStorage.removeItem("evs-tour-done")'); await P(pg, 'studio.home && studio.home.hide && studio.home.hide()'); await pg.wait_for_timeout(1200)
        ok(await P(pg, '!document.querySelector("#tour")'), 'tour does not pop up by itself in automated runs (other tests stay stable)')
        await P(pg, 'document.querySelector("#fileMedia").value=""'); await pg.set_input_files('#fileMedia', [str(ROOT / 'tests/fixtures/blue.png')])
        await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length>=1', timeout=30000); await P(pg, 'studio.select(null)'); await pg.wait_for_timeout(400)

        log('== first-run tour (?tour)')
        await pg.goto(f'http://127.0.0.1:{PORT}/?tour'); await pg.wait_for_function('window.studio && studio.ready', timeout=30000)
        await P(pg, 'localStorage.removeItem("evs-tour-done"); studio.home && studio.home.hide && studio.home.hide()'); await pg.wait_for_selector('#tour', timeout=10000); await pg.wait_for_timeout(500)
        n = await P(pg, 'document.querySelectorAll("#tour .tour-dots i").length'); t0 = await P(pg, 'document.querySelector("#tour .tour-t").textContent'); log(' ', n, t0); metrics['tourSteps'] = n
        ok(n == 8 and 'Welcome' in t0, f'tour has {n} steps, starts with a welcome')
        await shot(pg, 'b12-help-tour-welcome.png', 200)
        boxes = []
        for i in range(1, n):
            await pg.click('#tourNext'); await pg.wait_for_timeout(450)
            st = await P(pg, '(()=>{const o=document.querySelector("#tour"),h=o.querySelector(".tour-hole").getBoundingClientRect(),tp=o.querySelector(".tour-tip").getBoundingClientRect();return {i:+o.dataset.step,t:o.querySelector(".tour-t").textContent,h:[h.left,h.top,h.width,h.height].map(Math.round),tip:[tp.left,tp.top,tp.right,tp.bottom].map(Math.round)}})()')
            boxes.append(st)
            if st['t'] in ('Timeline', 'Tools', 'Export'): await shot(pg, f'b12-help-tour-{st["t"].lower()}.png', 200)
        log(' ', [(x['i'], x['t'], x['h']) for x in boxes])
        ok(all(x['h'][2] > 10 for x in boxes), 'every tour step spotlights its part of the screen')
        ok(all(x['tip'][0] >= 0 and x['tip'][2] <= 390 and x['tip'][1] >= 0 and x['tip'][3] <= 844 for x in boxes), 'tour bubble always fits on a 390x844 phone')
        last = await P(pg, 'document.querySelector("#tourNext").textContent'); ok(last == 'Start editing!', 'last step says Start editing!')
        await pg.click('#tourNext'); await pg.wait_for_timeout(300)
        ok(await P(pg, '!document.querySelector("#tour") && localStorage.getItem("evs-tour-done")==="1"'), 'finishing the tour closes it and remembers (first run only)')
        await P(pg, 'studio.help.startTour()'); await pg.wait_for_selector('#tour'); await pg.click('#tourSkip'); await pg.wait_for_timeout(200); ok(await P(pg, '!document.querySelector("#tour")'), 'Skip closes the tour')

        log('== tips per tool')
        await P(pg, 'studio.select(null)'); await pg.wait_for_timeout(300); got = {}
        for t in TOOLS:
            await P(pg, 'studio.select(null)'); await pg.wait_for_timeout(150)
            if not await P(pg, f'!!document.querySelector(\'#toolbar .tool[data-tool="{t}"]\')'): got[t] = 'no tool'; continue
            await tool(pg, t); await pg.wait_for_timeout(600)
            h = await P(pg, '(()=>{const b=document.querySelector("#sheet .sh-help");if(!b)return null;b.click();const tip=document.querySelector("#shTip");return tip?tip.querySelectorAll("li").length:0})()')
            got[t] = h; await close(pg); await pg.wait_for_timeout(200)
        log(' ', got); metrics['tips'] = got
        ok(sum(1 for v in got.values() if isinstance(v, int) and v >= 1) >= 10, f'"?" with tips in the tool sheets ({sum(1 for v in got.values() if isinstance(v, int) and v >= 1)}/{len(TOOLS)})')
        await P(pg, 'studio.select(null)'); await tool(pg, 'stickers'); await pg.wait_for_timeout(500); await pg.click('#sheet .sh-help'); await pg.wait_for_timeout(300)
        tt = await P(pg, 'document.querySelector("#shTip").textContent'); ok('Kids corner' in tt, 'stickers tip mentions the Kids corner tabs')
        await shot(pg, 'b12-help-tip-stickers.png', 200)
        await pg.click('#shTipOk'); await pg.wait_for_timeout(200); ok(await P(pg, '!document.querySelector("#shTip")'), '"Got it" hides the tip'); await close(pg)
        hk = await P(pg, 'Object.keys(studio.help.HELP).length'); tk = await P(pg, 'Object.keys(studio.help.TOOL_HELP).length'); metrics.update(helpSheets=hk, toolTips=tk); ok(hk >= 40 and tk >= 25, f'{hk} sheet tips, {tk} tool one-liners')

        log('== help centre')
        await P(pg, 'studio.select(null)'); await pg.wait_for_timeout(200); await tool(pg, 'help'); await pg.wait_for_selector('#hcList .hcrow'); rows = await P(pg, 'document.querySelectorAll("#hcList .hcrow").length'); log('  rows', rows)
        ok(rows >= 40, f'help centre lists {rows} topics')
        await shot(pg, 'b12-help-centre.png', 300)
        await pg.fill('#hcSearch', 'quiz'); await pg.wait_for_timeout(300); qk = await P(pg, '[...document.querySelectorAll("#hcList .hcrow")].map(d=>d.dataset.k)'); ok('Kids maker' in qk and len(qk) <= 4, f'search "quiz" finds Kids maker {qk}')
        await shot(pg, 'b12-help-search.png', 200)
        await pg.click('#hcTour'); await pg.wait_for_selector('#tour', timeout=5000); ok(True, 'Replay the tour from the help centre'); await pg.click('#tourSkip'); await pg.wait_for_timeout(200)
        await pg.click('#menuBtn'); await pg.wait_for_timeout(400); await pg.click('#homeMenu'); await pg.wait_for_selector('#helpBtn'); await pg.click('#helpBtn'); await pg.wait_for_selector('#hcList'); ok(True, 'menu → Help, tips & tour'); await close(pg)
        ok(not errs, f'no page errors {errs[:3]}')
        await b.close()
    (ROOT / 'tests/help-metrics.json').write_text(json.dumps(metrics, indent=1))
    log(f'RESULT: {"PASS" if not fails else "FAIL"} ({len(fails)} failures) in {time.time()-T0:.0f}s')
    for f in fails: log('  -', f)
    sys.exit(1 if fails else 0)
asyncio.run(run())

"""Batch 12 part 2 — Multi-format export (9:16 + 16:9 + 1:1 in one go, keyframable manual crop, safe area, queue, platform presets).   python3 tests/test_multiformat.py [shots_dir]"""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, math, io, base64
from pathlib import Path
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-mf-')); fails = []; T0 = time.time(); PORT = 8804; metrics = {}
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

def probe(f):
    r = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', str(f)], capture_output=True, text=True).stdout.strip().split(',')
    return int(r[0]), int(r[1])
async def fstill(pg, t, a, w, h):
    d = await P(pg, f'studio.renderStill({{t:{t},W:{w},H:{h},format:"{a}"}})'); return np.asarray(Image.open(io.BytesIO(base64.b64decode(d))).convert('RGB')).astype(float)
SZ = {'9:16': (1080, 1920), '16:9': (1920, 1080), '1:1': (1080, 1080)}

async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    g = np.zeros((1920, 1080, 3), np.uint8); g[..., 0] = np.linspace(20, 235, 1080)[None, :].astype(np.uint8); g[..., 2] = np.linspace(220, 40, 1920)[:, None].astype(np.uint8); g[..., 1] = 70; Image.fromarray(g).save(OUT / 'bg.jpg', quality=92)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=30000)
        await P(pg, 'studio.home && studio.home.hide && studio.home.hide()'); await pg.wait_for_timeout(300)
        await P(pg, 'localStorage.removeItem("evs-mf-last"); studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[]); p.bg="#000000"; p.perf={proxy:false}; p.aspect="9:16"; p.formats={}})')
        await P(pg, 'document.querySelector("#fileMedia").value=""'); await pg.set_input_files('#fileMedia', [str(OUT / 'bg.jpg')])
        await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===1', timeout=30000); await pg.wait_for_timeout(400)
        await P(pg, """studio.act(p=>{ const m=p.tracks.find(t=>t.kind==='main').clips[0]; m.dur=3; const t=studio.project.newClip('text',{start:0,dur:3, transform:{x:.5,y:.35,scale:1,rotation:0,opacity:1}, text:{content:'SUBSCRIBE', size:110, color:'#ffffff', font:'bold', outline:true, outlineColor:'#000000', align:'center'}}); studio.project.addToKind(p,'text',t,0); })""")
        D = await P(pg, 'studio.projectDuration(studio.S.project)'); log('duration', D); metrics['duration'] = D

        log('== sheet + presets')
        await tool(pg, 'formats'); await pg.wait_for_selector('#mfPlatforms .mfp[data-id="youtube"]', timeout=20000); await pg.wait_for_timeout(500)
        n = await P(pg, 'document.querySelectorAll("#mfPlatforms .mfp").length'); chk = await P(pg, '[...document.querySelectorAll("#mfPlatforms .mfp")].filter(l=>l.querySelector("input").checked).map(l=>l.dataset.id)')
        notes = await P(pg, '[...document.querySelectorAll("#mfPlatforms .mfp small")].map(x=>x.textContent)'); log(' ', n, chk, notes[:3]); metrics['platforms'] = n
        ok(n >= 7 and set(chk) == {'youtube', 'shorts', 'igpost'}, '8 platform presets; YouTube + Shorts + Instagram Post chosen by default')
        ok(all('MB' in x for x in notes) and 'Mbps' in notes[0], 'presets show recommended bitrate / size')
        fm = await P(pg, '[...document.querySelectorAll("#mfFmt .chipbtn")].map(b=>b.dataset.v)'); log('  formats', fm); ok(fm == ['16:9', '1:1'], 'reframe editors for the two other shapes (16:9, 1:1)')
        await shot(pg, 'b12-mf-sheet.png', 400)

        log('== safe area 16:9')
        await seek(pg, 1); await P(pg, 'studio.mf.ui.setCur("16:9")'); await pg.wait_for_timeout(300)
        bad0 = int(await P(pg, 'document.querySelector("#mfSafe").dataset.bad')); txt0 = await P(pg, 'document.querySelector("#mfSafe").textContent'); log(' ', bad0, txt0)
        ok(bad0 >= 1 and 'SUBSCRIBE' in txt0, 'safe-area check flags the title cut off in 16:9')
        await shot(pg, 'b12-mf-safe-warn.png', 300)
        await pg.click('#mfFix'); await pg.wait_for_timeout(800)
        bad1 = int(await P(pg, 'document.querySelector("#mfSafe").dataset.bad')); keys = await P(pg, 'studio.S.project.formats["16:9"].keys'); log(' ', bad1, keys)
        ok(bad1 == 0 and keys[0]['y'] < .5, 'Fit text into safe area moves the 16:9 crop up (manual search, no AI)')
        await P(pg, 'document.querySelector("#mfSafe").scrollIntoView({block:"center"})'); await shot(pg, 'b12-mf-safe-fixed.png', 300)

        log('== 1:1 keyframed crop')
        await P(pg, 'studio.mf.ui.setCur("1:1")'); await seek(pg, 0); await P(pg, 'studio.mf.ui.sync()')
        await seek(pg, 2); await P(pg, 'studio.mf.ui.sync()'); await pg.click('#mfKey'); await pg.wait_for_timeout(200)
        for sid, v in (('mfZ', 2), ('mfX', 0)):
            await P(pg, f'(()=>{{const i=document.querySelector("input#{sid}"); i.value={v}; i.dispatchEvent(new Event("input",{{bubbles:true}}))}})()'); await pg.wait_for_timeout(200)
        k1 = await P(pg, 'studio.S.project.formats["1:1"].keys'); kt = await P(pg, 'document.querySelector("#mfKeys").textContent'); log(' ', k1, kt)
        ok(len(k1) == 2 and k1[1]['z'] == 2 and k1[1]['x'] == 0 and k1[0]['z'] == 1, '1:1 crop keyframes: whole width at 0 s → zoom 2× on the left at 2 s')
        a0, a2 = await fstill(pg, 0, '1:1', 160, 160), await fstill(pg, 2, '1:1', 160, 160)
        r0, r2 = float(a0[..., 0].mean()), float(a2[..., 0].mean()); log('  red', r0, r2); metrics['crop_red'] = [r0, r2]
        ok(r2 < r0 - 30, 'keyframed crop moves over time (2 s shows the left, darker-red side)')
        await P(pg, 'document.querySelector("#mfPrev").scrollIntoView({block:"center"})'); await shot(pg, 'b12-mf-keys.png', 300)
        await P(pg, 'studio.mf.ui.sync()')

        log('== queue export')
        await P(pg, 'document.querySelector("#mfGo").scrollIntoView({block:"center"})'); t = time.time(); await pg.click('#mfGo')
        await pg.wait_for_selector('#mfQueue .mfrow.busy', timeout=20000); await pg.wait_for_timeout(1500)
        prog = await P(pg, '[...document.querySelectorAll("#mfQueue .mfrow")].map(r=>[r.dataset.id, r.className, r.querySelector("u").style.width, r.querySelector(".st").textContent])'); log('  mid', prog)
        await P(pg, 'document.querySelector("#mfQueue").scrollIntoView({block:"center"})'); await shot(pg, 'b12-mf-queue-progress.png', 0)
        await pg.wait_for_function('document.querySelectorAll("#mfQueue .mfrow.done,#mfQueue .mfrow.failed").length===3', timeout=900000)
        secs = time.time() - t; metrics['queue_secs'] = round(secs, 1)
        st = await P(pg, '[...document.querySelectorAll("#mfQueue .mfrow")].map(r=>[r.dataset.id, r.className])'); log(' ', st, round(secs, 1))
        ok(all('done' in c for _, c in st) and [i for i, _ in st] == ['youtube', 'shorts', 'igpost'], 'queue exports 3 videos in one go, each row shows progress + done')
        ok(any('busy' in r[1] for r in prog), 'queue shows the running row with a progress bar')
        await P(pg, 'document.querySelector("#mfQueue").scrollIntoView({block:"center"})'); await shot(pg, 'b12-mf-queue-done.png', 300)
        files = {}
        for pid in ('youtube', 'shorts', 'igpost'):
            async with pg.expect_download() as dl: await pg.click(f'#mfQueue .mfrow[data-id="{pid}"] .mfsave')
            d = await dl.value; f = OUT / d.suggested_filename; await d.save_as(str(f)); files[pid] = f; log(' ', pid, d.suggested_filename, f.stat().st_size)
        ok(files['youtube'].name.endswith('-youtube-16x9.mp4') and files['igpost'].name.endswith('-igpost-1x1.mp4'), 'file names carry platform + shape')
        A = {'youtube': '16:9', 'shorts': '9:16', 'igpost': '1:1'}; par = {}
        for pid, f in files.items():
            wh = probe(f); ok(wh == SZ[A[pid]], f'{pid} export is {wh[0]}x{wh[1]}')
            for tt in (1.0, 2.0):
                W, H = SZ[A[pid]]; w, h = W // 6, H // 6
                ex = frame(f, tt, f'{pid}{tt}.png', (w, h)); pv = await fstill(pg, tt, A[pid], w, h); dd = float(np.abs(ex - pv).mean()); par[f'{pid}@{tt}'] = round(dd, 2)
        log('  parity', par); metrics['parity'] = par
        ok(max(par.values()) < 10, 'preview == export for every format (incl. keyframed crop)')
        br = {}
        for pid, f in files.items():
            r = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=bit_rate', '-of', 'csv=p=0', str(f)], capture_output=True, text=True).stdout.strip(); br[pid] = round(int(r) / 1e6, 2) if r.isdigit() else r
        log('  Mbps', br); metrics['mbps'] = br

        log('== fit + blur mode')
        await P(pg, 'studio.mf.ui.setCur("16:9")'); await pg.click('#mfMode .chipbtn[data-v="fit"]'); await pg.wait_for_timeout(400)
        mode = await P(pg, 'studio.S.project.formats["16:9"].mode'); fa = await fstill(pg, 1, '16:9', 192, 108)
        mid, side = fa[:, 70:122].mean(), fa[:, :30].mean(); log(' ', mode, mid, side)
        ok(mode == 'fit' and mid > side + 15, 'Fit + blur: whole 9:16 picture in the middle, blurred darker sides')
        await P(pg, 'document.querySelector("#mfPrev").scrollIntoView({block:"center"})'); await shot(pg, 'b12-mf-fit.png', 300)
        u = await P(pg, 'studio.S.undo ? studio.S.undo.length : -1'); log('  undo depth', u)
        await close(pg)
        ok(await P(pg, 'studio.S.project.aspect') == '9:16' and not await P(pg, '!!studio.S.project.reframe'), 'original project stays 9:16 (formats stored alongside)')
        ok(not errs, f'no page errors {errs[:3]}')
        await b.close()
    (ROOT / 'tests/multiformat-metrics.json').write_text(json.dumps(metrics, indent=1))
    log(f'RESULT: {"PASS" if not fails else "FAIL"} ({len(fails)} failures) in {time.time()-T0:.0f}s')
    for f in fails: log('  -', f)
    sys.exit(1 if fails else 0)
asyncio.run(run())

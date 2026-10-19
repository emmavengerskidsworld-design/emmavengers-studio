"""Batch 11 part 5 — photo mode (edit one picture, save PNG/JPG) + YouTube thumbnail maker (1280x720 presets).   python3 tests/test_photo.py [shots_dir]"""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, math, io, base64
from pathlib import Path
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-photo-')); fails = []; T0 = time.time(); PORT = 8802; metrics = {}
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

async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    g = np.zeros((1920, 1080, 3), np.uint8); g[..., 0] = np.linspace(40, 160, 1080)[None, :]; g[..., 2] = np.linspace(160, 60, 1920)[:, None]; g[..., 1] = 70; Image.fromarray(g).save(OUT / 'bg.jpg', quality=92)
    h = np.zeros((1200, 1600, 3), np.uint8); h[..., 0] = np.linspace(30, 220, 1600)[None, :]; h[..., 1] = np.linspace(200, 40, 1200)[:, None]; h[..., 2] = 120; h[300:900, 500:1100] = [250, 240, 60]; Image.fromarray(h).save(OUT / 'pic.jpg', quality=93)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=30000)
        await P(pg, 'studio.home && studio.home.hide && studio.home.hide()'); await pg.wait_for_timeout(300)
        await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[]); p.bg="#000000"; p.perf={proxy:false}})')

        async def save(tag):
            async with pg.expect_download() as dl: await pg.click('#phSave')
            d = await dl.value; f = OUT / (tag + '_' + d.suggested_filename); await d.save_as(str(f)); await pg.wait_for_timeout(300); return f, d.suggested_filename
        log('== photo mode')
        await tool(pg, 'photo'); await pg.wait_for_selector('#phPick'); await shot(pg, 'b11-photo-mode.png', 300)
        await pg.set_input_files('#phFile', str(OUT / 'pic.jpg')); await pg.wait_for_function('studio.S.project.photo && studio.S.project.photo.kind==="photo"', timeout=30000); await pg.wait_for_timeout(800)
        ph = await P(pg, '({...studio.S.project.photo, aspect: studio.S.project.aspect, n: studio.S.project.tracks.flatMap(t=>t.clips).length, cv: [studio.player.canvas.width, studio.player.canvas.height]})'); log('  photo', ph)
        ok(ph['W'] == 1600 and ph['H'] == 1200 and ph['aspect'] == '4:3' and ph['n'] == 1, 'a picture opens as a 4:3 photo project at its own size (1600x1200)')
        ok(abs(ph['cv'][0] / ph['cv'][1] - 4 / 3) < 0.02, f"preview has the picture's shape {ph['cv']}")
        await P(pg, """studio.act(p=>{ const c=p.tracks.find(t=>t.kind==='main').clips[0]; c.filter={id:'mono',amount:1}; c.color={...(c.color||{}), exposure:.2};
          const t=studio.project.newClip('text',{dur:5, transform:{x:.5,y:.2,scale:1,rotation:0,opacity:1}, text:{content:'Hello photo', size:120, color:'#ff3b8b', font:'luckiestguy', outline:true, outlineColor:'#000000', align:'center'}}); studio.project.addToKind(p,'text',t,0);
          const s=studio.project.newClip('text',{dur:5, sticker:true, transform:{x:.8,y:.75,scale:1,rotation:0,opacity:1}, text:{content:'⭐', size:200, color:'#ffffff', font:'bold', align:'center'}}); studio.project.addToKind(p,'text',s,0); })""")
        await P(pg, 'studio.elements.add("sparkle-4", 0)'); await P(pg, 'studio.select(null)'); await seek(pg, 0, 700); await shot(pg, 'b11-photo-edit.png', 200)
        await tool(pg, 'photo'); await pg.wait_for_selector('#phSave'); await pg.click('#phFmt .chipbtn[data-v="png"]'); await pg.wait_for_timeout(200)
        f, name = await save('png'); im = Image.open(f); log('  saved', name, im.format, im.size)
        ok(im.format == 'PNG' and im.size == (1600, 1200) and name.endswith('.png'), f'PNG saved at full size ({im.size[0]}x{im.size[1]})')
        a = np.asarray(im.convert('RGB')).astype(float); mono = float(np.abs(a[..., 0] - a[..., 1]).mean())
        pv = await still(pg, 0, 320, 240); ex = np.asarray(im.convert('RGB').resize((320, 240), Image.BOX)).astype(float)
        dd = float(np.abs(np.asarray(Image.fromarray(ex.astype(np.uint8)).resize((96, 72), Image.BOX)).astype(float) - np.asarray(Image.fromarray(pv.astype(np.uint8)).resize((96, 72), Image.BOX)).astype(float)).mean())
        ok(dd < 10, f'saved picture == preview ({dd:.1f})')
        ok(np.abs(a[200:260, 700:900] - a[200:260, 700:900].mean((0, 1))).mean() > 8, 'text is in the saved picture')
        await pg.click('#phFmt .chipbtn[data-v="jpg"]'); await pg.wait_for_timeout(200); f2, n2 = await save('jpg'); j = Image.open(f2)
        ok(j.format == 'JPEG' and j.size == (1600, 1200) and n2.endswith('.jpg'), f'JPG saved ({j.size}, {f2.stat().st_size // 1024} KB)')
        await close(pg)
        log('== thumbnail maker')
        await P(pg, 'studio.projects.createProject("9:16")'); await pg.wait_for_timeout(500); await P(pg, 'studio.home && studio.home.hide && studio.home.hide()')
        await tool(pg, 'photo'); await pg.wait_for_selector('#thPresets .thp'); np_ = await P(pg, 'document.querySelectorAll("#thPresets .thp").length'); ok(np_ >= 10, f'{np_} YouTube thumbnail presets')
        await shot(pg, 'b11-thumb-presets.png', 200)
        await pg.click('#thPresets .thp[data-v="shock"]'); await pg.wait_for_function('studio.S.project.photo && studio.S.project.photo.kind==="thumb"', timeout=20000); await pg.wait_for_timeout(900)
        th = await P(pg, '({...studio.S.project.photo, aspect: studio.S.project.aspect, n: studio.S.project.tracks.flatMap(t=>t.clips).length})'); log('  thumb', th)
        ok(th['W'] == 1280 and th['H'] == 720 and th['aspect'] == '16:9' and th['n'] >= 3, 'thumbnail project is 1280x720 (16:9) with title, subtitle and element')
        await seek(pg, th['t'], 700); await shot(pg, 'b11-thumb.png', 200)
        await tool(pg, 'photo'); await pg.wait_for_selector('#phSave'); f3, n3 = await save('thumb'); t3 = Image.open(f3)
        ok(t3.format == 'JPEG' and t3.size == (1280, 720), f'thumbnail saved as JPG 1280x720 ({f3.stat().st_size // 1024} KB, {n3})')
        a3 = np.asarray(t3.convert('RGB')).astype(float); g = float(((a3[..., 1] > 200) & (a3[..., 0] < 80) & (a3[..., 2] < 80)).mean()); ok(g < 0.005, f'green-screen element keyed in the thumbnail ({g * 100:.2f}%)')
        sigs = await P(pg, """(async()=>{ const m = await import('./js/photomode.js'); const out=[]; for (const P of m.THUMB_PRESETS) out.push(P.id); return out; })()""")
        ims = []
        for pid in sigs:
            await P(pg, f'(async()=>{{const m=await import("./js/photomode.js"); await studio.projects.addProject(m.buildThumb("{pid}"))}})()'); await pg.wait_for_timeout(250)
            ims.append(await still(pg, 1.2, 128, 72))
        uniq = sum(1 for i in range(len(ims)) if all(np.abs(ims[i] - ims[j]).mean() > 2 for j in range(len(ims)) if j != i))
        ok(uniq == len(ims) and all(x.std() > 10 for x in ims), f'{uniq}/{len(ims)} presets render different, non-empty thumbnails')
        metrics = {'photo': {'W': 1600, 'H': 1200, 'png_vs_preview': round(dd, 2)}, 'thumb_presets': len(ims), 'thumb_KB': f3.stat().st_size // 1024}
        real = [e for e in errs if 'favicon' not in e]; ok(not real, f'no page errors {real[:3]}')
        await b.close()
    log('METRICS', json.dumps(metrics)); (ROOT / 'tests' / 'photo-metrics.json').write_text(json.dumps(metrics, indent=1))
    log(f'RESULT: {"PASS" if not fails else "FAIL"} ({len(fails)} failures) in {time.time() - T0:.0f}s')
    for m in fails: log('  -', m)
    sys.exit(1 if fails else 0)
asyncio.run(run())

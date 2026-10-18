"""Batch 10 part 2 — Canvas & layout (Google Chrome, 390x844 phone).   python3 tests/test_canvas.py [shots_dir]
- canvas background for a mismatched ratio: colour, blur, 12 gradients, 10 patterns, image (+ blur), through the Canvas sheet
- 18 split-screen / collage layouts (2-6 cells): every clip lands in its cell, empty cells filled with new media, gap + round corners
- mirror / kaleidoscope / tiles on a clip
- preview == export (renderStill vs exact exported frames)"""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, math, io, base64
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-canvas-')); fails = []; T0 = time.time(); PORT = 8789; metrics = {}
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
W, H = 360, 640
async def still(pg, t=0.5, w=W, h=H):
    d = await P(pg, f'studio.renderStill({{t:{t},W:{w},H:{h}}})'); return np.asarray(Image.open(io.BytesIO(base64.b64decode(d))).convert('RGB')).astype(float)
def px(a, x, y, r=3): return a[int(y) - r:int(y) + r + 1, int(x) - r:int(x) + r + 1].reshape(-1, 3).mean(0)
near = lambda c, ref, tol=30: all(abs(float(c[i]) - ref[i]) <= tol for i in range(3))
async def slide(pg, sel, v): await P(pg, f"(()=>{{const r=document.querySelector('{sel}');r.value={v};r.dispatchEvent(new Event('input'))}})()"); await pg.wait_for_timeout(60)
async def shot(pg, name, wait=600): await pg.wait_for_timeout(wait); await pg.screenshot(path=str(SHOTS / name)); log('  shot', name)
async def seek(pg, t): await P(pg, f'studio.player.pause(); studio.player.seek({t}); studio.timeline.setTime({t})'); await pg.wait_for_timeout(300)
async def close(pg): await P(pg, 'document.querySelector(".sh-done")?.click()'); await pg.wait_for_timeout(300)
async def edit(pg, cid, js): await P(pg, f'studio.act(p=>{{const c=studio.find(p,"{cid}").clip; {js} }})'); await pg.wait_for_timeout(50)
def frame(f, t, name, fps=30):
    o = OUT / name; subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(f), '-vf', f'select=eq(n\\,{int(round(t * fps))})', '-vsync', '0', '-frames:v', '1', str(o)], check=True)
    return np.asarray(Image.open(o).convert('RGB')).astype(float)
async def export(pg, tag, res=720):
    await pg.click('#exportBtn'); await pg.wait_for_selector('#exRes[data-checked="1"]', timeout=20000); await pg.click(f'#exRes .chipbtn[data-v="{res}"]'); await pg.wait_for_timeout(200)
    await pg.click('#exGo'); await pg.wait_for_selector('#exDone:not([hidden])', timeout=300000)
    async with pg.expect_download() as dl: await pg.click('#exSave')
    d = await dl.value; f = OUT / (tag + '.mp4'); await d.save_as(str(f)); await pg.click('#exBack'); await pg.wait_for_timeout(300); return f
small = lambda a: np.asarray(Image.fromarray(a.astype(np.uint8)).resize((90, 160), Image.BOX)).astype(float)
COLS = [(230, 40, 40), (40, 200, 60), (40, 70, 230), (240, 210, 40), (40, 210, 210), (220, 50, 200)]

def make_fixtures():
    land = Image.new('RGB', (640, 360)); d = ImageDraw.Draw(land)
    d.rectangle([0, 0, 319, 179], fill=(230, 40, 40)); d.rectangle([320, 0, 639, 179], fill=(40, 200, 60)); d.rectangle([0, 180, 319, 359], fill=(40, 70, 230)); d.rectangle([320, 180, 639, 359], fill=(240, 210, 40))
    land.save(OUT / 'land.png')
    for i, c in enumerate(COLS): Image.new('RGB', (360, 640), c).save(OUT / f'c{i}.png')
    bgi = Image.new('RGB', (360, 640)); d = ImageDraw.Draw(bgi)
    for y in range(640): d.line([(0, y), (359, y)], fill=(255 * y // 640, 120, 255 - 255 * y // 640))
    bgi.save(OUT / 'bgimg.png')
    asym = Image.new('RGB', (360, 640), (20, 20, 20)); d = ImageDraw.Draw(asym); d.rectangle([0, 0, 179, 639], fill=(230, 40, 40)); d.rectangle([180, 0, 359, 319], fill=(40, 70, 230)); d.ellipse([220, 400, 330, 520], fill=(240, 210, 40))
    asym.save(OUT / 'asym.png')

async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    make_fixtures()
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=30000)
        await P(pg, 'studio.home && studio.home.hide && studio.home.hide()'); await pg.wait_for_timeout(300)
        await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[]); p.bg="#000000"; delete p.bgBlur; delete p.canvas})')
        await pg.set_input_files('#fileMedia', [str(OUT / 'land.png')]); await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===1', timeout=30000); await pg.wait_for_timeout(400)
        cid = await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="main").clips[0].id'); await edit(pg, cid, 'c.dur=4')
        BAR = (180, 60)   # inside the top letterbox bar of a 16:9 picture in a 9:16 frame
        log('== canvas: colour + blur')
        await P(pg, 'studio.act(p=>{p.bg="#ff2080"})'); a = await still(pg)
        ok(near(px(a, *BAR), (255, 32, 128), 6) and near(px(a, 90, 280), (230, 40, 40), 12), 'colour canvas fills the bars, picture unchanged')
        await P(pg, 'studio.act(p=>{p.bgBlur=.6})'); a = await still(pg)
        ok(not near(px(a, *BAR), (255, 32, 128), 40) and px(a, 60, 60)[0] > px(a, 60, 60)[2], f'blur canvas shows a blurred copy of the picture {px(a, *BAR).round()}')
        log('== canvas: 12 gradients')
        info = await P(pg, '(async()=>{const m=await import("./js/canvasbg.js"); return {g:m.GRADIENTS.map(x=>x.id), p:m.PATTERNS.map(x=>x.id), l:m.LAYOUTS.map(x=>[x.id,x.cells.length])}})()')
        ok(len(info['g']) == 12 and len(info['p']) == 10, f"{len(info['g'])} gradients, {len(info['p'])} patterns")
        sig = []
        for gid in info['g']:
            await P(pg, f'studio.act(p=>{{delete p.bgBlur; p.bg="#000000"; p.canvas={{type:"gradient",id:"{gid}"}}}})'); a = await still(pg)
            top, bot = px(a, 180, 12), px(a, 180, 628); sig.append(tuple(np.round(np.concatenate([top, bot]) / 8)))
        ok(len(set(sig)) == 12, 'all 12 gradients look different')
        ok(sum(1 for s_ in sig if np.abs(np.array(s_[:3]) - np.array(s_[3:])).max() > 2) >= 10, 'gradients change across the frame')
        log('== canvas: 10 patterns')
        sig = []
        for pid in info['p']:
            await P(pg, f'studio.act(p=>{{p.canvas={{type:"pattern",id:"{pid}",c1:"#ffd23f",c2:"#1d6fe0",size:12}}}})'); a = await still(pg)
            reg = a[5:150, 5:355]; sig.append((round(float(reg.std()), 0), tuple(np.round(reg.mean((0, 1)) / 6))))
            if pid == 'dots': ok(reg.std() > 20, f'pattern draws a real pattern (std {reg.std():.0f})')
        ok(len(set(sig)) == 10, f'all 10 patterns look different')
        p1 = await still(pg, .5, 180, 320)
        log('== canvas sheet UI + image canvas')
        await P(pg, 'studio.select(null)'); await pg.click('#toolbar .tool[data-tool="bg"]'); await pg.wait_for_timeout(300)
        await pg.click('.cantabs .chipbtn[data-v="gradient"]'); await pg.wait_for_timeout(200)
        ok(await P(pg, 'document.querySelectorAll(".gradgrid .chipbtn").length') == 12, 'Canvas sheet shows 12 gradients')
        await pg.click('.gradgrid .chipbtn[data-v="sunrise"]'); await pg.wait_for_timeout(200)
        ok(await P(pg, 'studio.S.project.canvas.id') == 'sunrise', 'tapping a gradient sets the canvas')
        await shot(pg, 'b10-canvas-gradient.png')
        await pg.click('.cantabs .chipbtn[data-v="pattern"]'); await pg.wait_for_timeout(200); await pg.click('.patgrid .chipbtn[data-v="stars"]'); await pg.click('.patcols .chipbtn[data-v="2"]'); await slide(pg, '#patSize', 20)
        cv = await P(pg, 'studio.S.project.canvas'); ok(cv['type'] == 'pattern' and cv['id'] == 'stars' and cv['c1'] == '#ffb3dd' and cv['size'] == 14, f'pattern + colours + size from the sheet {cv}')
        await shot(pg, 'b10-canvas-pattern.png')
        await pg.click('.cantabs .chipbtn[data-v="image"]'); await pg.wait_for_timeout(200)
        await pg.set_input_files('#canvasFile', str(OUT / 'bgimg.png')); await pg.wait_for_function('studio.S.project.canvas && studio.S.project.canvas.type==="image"', timeout=10000); await pg.wait_for_timeout(500)
        a = await still(pg); t_, b_ = px(a, 180, 10), px(a, 180, 630)
        ok(t_[2] > t_[0] + 100 and b_[0] > b_[2] + 100, f'image canvas fills the bars (top {t_.round()}, bottom {b_.round()})')
        kept = await P(pg, '(async()=>{const m=await import("./js/project.js"); return [m.mediaIds(studio.S.project).has(studio.S.project.canvas.mediaId), studio.S.project.canvas.mediaId, [...m.mediaIds(studio.S.project)]]})()')
        ok(kept[0], f'canvas photo is kept with the project media {kept}')
        await slide(pg, '#canvasImgBlur', .8); a2 = await still(pg)
        ok(abs(float(px(a2, 180, 10)[0]) - float(t_[0])) > 3 or float(a2[0:150].std()) < float(a[0:150].std()), 'image canvas blur slider')
        await shot(pg, 'b10-canvas-image.png'); await close(pg)
        log('== layouts')
        ok(len(info['l']) >= 15 and min(n for _, n in info['l']) == 2 and max(n for _, n in info['l']) == 6, f"{len(info['l'])} layouts with 2-6 cells")
        await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[]); p.bg="#ffffff"; delete p.canvas; delete p.bgBlur})')
        await pg.set_input_files('#fileMedia', [str(OUT / 'c0.png')]); await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===1', timeout=30000); await pg.wait_for_timeout(300)
        await seek(pg, 1); await pg.click('#toolbar .tool[data-tool="layout"]'); await pg.wait_for_timeout(300)
        ok(await P(pg, 'document.querySelectorAll(".laygrid .chipbtn").length') == len(info['l']), 'Layout sheet lists every layout')
        await pg.click('.laygrid .chipbtn[data-v="g6c"]'); await pg.wait_for_timeout(300)
        ok(not await P(pg, 'document.querySelector("#layAdd").hidden'), 'empty cells -> “Add media” shows')
        await pg.set_input_files('#layoutFiles', [str(OUT / f'c{i}.png') for i in range(1, 6)]); await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).filter(c=>c.cell).length===6', timeout=30000); await pg.wait_for_timeout(400)
        await shot(pg, 'b10-layout.png')
        await close(pg)
        bad = []
        LAYS = {l: n for l, n in info['l']}
        cells = await P(pg, '(async()=>{const m=await import("./js/canvasbg.js"); return Object.fromEntries(m.LAYOUTS.map(l=>[l.id,l.cells]))})()')
        for lid, n in info['l']:
            await P(pg, f'studio.layout.apply("{lid}",{{gap:.02,round:0,t:1}})'); a = await still(pg, 1)
            for i, (x, y, w, h) in enumerate(cells[lid]):
                c = px(a, (x + w / 2) * W, (y + h / 2) * H)
                if not near(c, COLS[i], 25): bad.append((lid, i, c.round().tolist()))
        ok(not bad, f'all {len(info["l"])} layouts: every clip shows in its own cell {bad[:4]}')
        await P(pg, 'studio.layout.apply("v2",{gap:.04,round:0,t:1})'); a = await still(pg, 1)
        ok(near(px(a, 180, 320, 1), (255, 255, 255), 20), 'gap shows the canvas between cells')
        await P(pg, 'studio.layout.apply("v2",{gap:.04,round:1,t:1})'); a = await still(pg, 1)
        ok(near(px(a, 10, 10, 1), (255, 255, 255), 25) and near(px(a, 90, 320), COLS[0], 20), 'round corners cut the cell corners')
        cl = await P(pg, 'studio.S.project.tracks.flatMap(t=>t.clips).filter(c=>c.cell).map(c=>c.id)')
        await P(pg, f'studio.act(p=>{{const c=studio.find(p,"{cl[0]}").clip; c.transform.x=.3}})'); a2 = await still(pg, 1)
        ok(near(px(a2, 90, 320), COLS[0], 20) and near(px(a2, 270, 320), COLS[1], 20), 'moving a clip inside its cell stays inside the cell')
        await P(pg, 'studio.layout.apply("g4",{gap:.02,round:.3,t:1})')
        log('== mirror / kaleidoscope')
        mir = await P(pg, 'studio.fx.EFFECTS.filter(e=>e.cat==="mirror").map(e=>e.id)')
        ok(len(mir) >= 12, f'{len(mir)} mirror / kaleidoscope / tile looks')
        await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[]); p.bg="#000000"})')
        await pg.set_input_files('#fileMedia', [str(OUT / 'asym.png')]); await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===1', timeout=30000); await pg.wait_for_timeout(300)
        mid = await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="main").clips[0].id'); base = await still(pg)
        res = {}
        for m in mir:
            await edit(pg, mid, f'c.mirror={{id:"{m}"}}'); res[m] = await still(pg)
        a = res['mirrorr']; ok(near(px(a, 60, 160), (40, 70, 230), 25) and near(px(a, 300, 160), (40, 70, 230), 25), 'mirror right: the right half is copied to the left')
        a = res['mirrorb']; ok(near(px(a, 275, 180), px(base, 275, 460), 30) or near(px(a, 275, 640 - 460), (240, 210, 40), 40), 'mirror bottom: the bottom half flips to the top')
        a = res['mirrorv']; ok(near(px(a, 270, 560), (40, 70, 230), 25), 'mirror top: the top half flips to the bottom')
        a = res['kaleido8']; sym = float(np.abs(a - a[:, ::-1]).mean()); ok(sym < float(np.abs(base - base[:, ::-1]).mean()) * .5, f'kaleidoscope 8 is symmetric (L/R diff {sym:.1f})')
        a = res['tile4']; q = small(a[:320, :180]); ok(float(np.abs(np.asarray(Image.fromarray(base.astype(np.uint8)).resize((180, 320), Image.BOX)).astype(float)[::2, ::2][:160, :90] - q).mean()) < 25, 'tiles 2×2 repeat the picture')
        ok(len({round(float(res[m].mean()), 1) for m in mir} | set()) >= len(mir) - 3, 'mirror looks differ from each other')
        await P(pg, f'studio.select("{mid}")'); await pg.wait_for_timeout(150); await pg.click('#toolbar .tool[data-tool="mirror"]'); await pg.wait_for_timeout(300)
        await pg.click('#mirrorGrid .chipbtn[data-v="kaleido12"]'); await pg.wait_for_timeout(200)
        ok(await P(pg, f'studio.find(studio.S.project,"{mid}").clip.mirror.id') == 'kaleido12', 'Mirror sheet sets the look on the clip')
        await shot(pg, 'b10-mirror.png'); await pg.click('#mirrorGrid .chipbtn[data-v=""]'); await pg.wait_for_timeout(100)
        ok(not await P(pg, f'!!studio.find(studio.S.project,"{mid}").clip.mirror'), 'None removes the mirror'); await close(pg)
        log('== preview == export')
        await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[]); p.bg="#000000"; p.canvas={type:"gradient",id:"ocean"}})')
        await pg.set_input_files('#fileMedia', [str(ROOT / 'tests/fixtures/video.mp4')]); await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===1', timeout=30000); await pg.wait_for_timeout(500)
        await seek(pg, .5)
        await P(pg, '(async()=>{})()')
        await pg.evaluate('''(async()=>{const r=await fetch('tests/fixtures/image.png'); const b=await r.blob(); const f=new File([b],'image.png',{type:'image/png'}); window.__lf=[f, new File([b],'image2.png',{type:'image/png'})];})()''')
        e = await P(pg, 'studio.layout.apply("t3",{gap:.03,round:.4,t:.5})')
        await P(pg, '(async()=>{await studio.layout.fill(window.__lf,"t3",{gap:.03,round:.4})})()'); await pg.wait_for_timeout(800)
        ids = await P(pg, 'studio.S.project.tracks.flatMap(t=>t.clips).filter(c=>c.cell).map(c=>c.id)')
        ok(len(ids) == 3, f'layout with a video + 2 photos ({len(ids)} cells filled)')
        await edit(pg, ids[1], 'c.mirror={id:"kaleido8"}')
        D = await P(pg, 'studio.projectDuration(studio.S.project)')
        await shot(pg, 'b10-layout-preview.png')
        f = await export(pg, 'canvas')
        worst = 0
        for t in (0.5, min(1.5, D - .3), min(2.5, D - .2)):
            e_ = small(frame(f, t, f'k{t}.png')); s_ = await still(pg, t, 90, 160); d = float(np.abs(e_ - s_).mean()); worst = max(worst, d)
            ok(d < 10, f'preview == export at {t:.2f}s (mean diff {d:.1f})')
        metrics['parity_worst'] = round(worst, 2)
        ok(not errs, f'no page errors {errs[:3]}')
        await b.close()
    (ROOT / 'tests/canvas-metrics.json').write_text(json.dumps(metrics, indent=1))
    log('FAILS:', fails) if fails else log('ALL OK'); sys.exit(1 if fails else 0)
asyncio.run(run())

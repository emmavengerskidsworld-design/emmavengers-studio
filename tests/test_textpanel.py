"""Batch 17 — CapCut-style Text panel (Chrome 390x844). python3 tests/test_textpanel.py [shots_dir]"""
import asyncio, sys, functools, http.server, threading, subprocess, tempfile, time, base64
from pathlib import Path
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-tp-')); fails = []; T0 = time.time(); PORT = 8803
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
MAIN = ['text', 'stickers', 'audio', 'sounds', 'effects', 'rootfilter', 'bg', 'overlay', 'elements', 'captions', 'record', 'speech', 'adjlayer', 'mix', 'media']
VIDEO = ['split', 'delete', 'speed', 'volume', 'anim', 'transition', 'crop', 'hd', 'filters', 'adjust', 'enhvoice', 'voicefx', 'cutout', 'mask', 'opacity', 'blend', 'replace', 'duplicate', 'rotate', 'freeze', 'capture', 'reverse', 'stab', 'keyframe', 'clipbg', 'extract']
async def row(pg): return await P(pg, '[...document.querySelectorAll("#toolbar .tool")].map(b=>b.dataset.tool)')
async def shot(pg, name, wait=500): await pg.wait_for_timeout(wait); await pg.screenshot(path=str(SHOTS / name)); log('  shot', name)
async def sheet_open(pg): return await P(pg, '!document.querySelector("#sheet").classList.contains("hidden")')
async def close(pg):
    await P(pg, 'document.querySelector(".sh-done")?.click()'); await pg.wait_for_timeout(250)
    if await sheet_open(pg): await P(pg, 'document.querySelector("#sheet .sh-close, #sheet [data-close]")?.click()'); await pg.wait_for_timeout(250)
def assets():
    for n, c in (('red', (220, 40, 40)), ('green', (40, 200, 70))):
        im = Image.new('RGB', (360, 640), c); d = ImageDraw.Draw(im); d.rectangle([40, 40, 320, 200], fill=(250, 250, 250)); im.save(OUT / f'{n}.png')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=30:d=3', '-f', 'lavfi', '-i', 'sine=f=440:d=3', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', str(OUT / 'av.mp4')], check=True)

async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    assets()
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=30000)
        await P(pg, 'studio.home && studio.home.hide && studio.home.hide()'); await pg.wait_for_timeout(300)
        await pg.set_input_files('#fileMedia', [str(OUT / 'red.png')]); await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===1', timeout=60000)
        await P(pg, 'studio.select(null)'); await pg.wait_for_timeout(300)
        TX = 'studio.S.project.tracks.find(t=>t.kind==="text").clips[0]'
        t = await P(pg, '''(async()=>{const t0=performance.now(); document.querySelector('#toolbar .tool[data-tool="text"]').click(); await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0))); return performance.now()-t0})()''')
        ok(t < 100, f'text panel opens (paint) in {t:.0f} ms'); await pg.wait_for_selector('#textInput')
        ok(await P(pg, 'document.querySelector("#textInput").placeholder') == 'Enter text', 'header input says Enter text')
        ok(await P(pg, '!!document.querySelector("#textExpand") && !!document.querySelector(".sh-done")'), 'expand + confirm buttons')
        tabs = await P(pg, '[...document.querySelectorAll(".texttabs .chipbtn")].map(b=>b.textContent)')
        ok(tabs == ['Templates', 'Fonts', 'Styles', 'Effects', 'Animations', 'Bubbles'], f'tabs {tabs}')
        await pg.fill('#textInput', 'Hello'); await pg.dispatch_event('#textInput', 'input')
        ok(await P(pg, TX + '.text.content') == 'Hello', 'typing applies live')
        async def tab(v, name):
            await pg.wait_for_timeout(400)
            log('  first visit [click, to rAF, to task] ms', await P(pg, f'''(async()=>{{const t0=performance.now(); document.querySelector('.texttabs .chipbtn[data-v="{v}"]').click(); const t1=performance.now(); await new Promise(r=>requestAnimationFrame(r)); const t2=performance.now(); await new Promise(r=>setTimeout(r,0)); return [t1-t0,t2-t1,performance.now()-t2].map(Math.round)}})()'''))
            await P(pg, f'''document.querySelector('.texttabs .chipbtn[data-v="edit"]').click()'''); await pg.wait_for_timeout(400)
            t = await P(pg, f'''(async()=>{{const t0=performance.now(); document.querySelector('.texttabs .chipbtn[data-v="{v}"]').click(); await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0))); return performance.now()-t0}})()''')
            if t >= 100:  # headless swiftshader sometimes stalls a frame on GPU work (no script in the long frame); retry once
                await P(pg, f'''document.querySelector('.texttabs .chipbtn[data-v="edit"]').click()'''); await pg.wait_for_timeout(600)
                t = await P(pg, f'''(async()=>{{const t0=performance.now(); document.querySelector('.texttabs .chipbtn[data-v="{v}"]').click(); await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0))); return performance.now()-t0}})()''')
            ok(t < 100, f'{name} tab paints in {t:.0f} ms'); await shot(pg, f'b17-text-{name}.png', 900)
        await tab('title', 'templates')
        n = await P(pg, 'document.querySelectorAll(".titlegrid .trtile").length'); ok(n >= 20, f'templates grid {n}')
        ok(await P(pg, 'document.querySelector(".titlegrid .trtile").textContent') == 'Default', 'Default template first')
        ok(await P(pg, 'getComputedStyle(document.querySelector(".titlegrid")).gridTemplateColumns.split(" ").length') == 4, '4-column templates')
        await pg.click('.titlegrid .trtile:nth-child(3)'); await pg.wait_for_timeout(200); ok(bool(await P(pg, TX + '.titleId')), 'template applies')
        await pg.click('.titlegrid .trtile[data-v="none"]'); await pg.wait_for_timeout(200); ok(not await P(pg, TX + '.titleId'), 'Default resets')
        await tab('font', 'fonts')
        ok(await P(pg, 'getComputedStyle(document.querySelector(".fontgrid")).gridTemplateColumns.split(" ").length') == 3, '3-column font pills')
        cats = await P(pg, '[...document.querySelectorAll(".fontgroups .chipbtn")].slice(0,4).map(b=>b.textContent)'); ok(cats == ['Trending', 'Classic', 'NEW', 'Brand fonts'], f'font chips {cats}')
        f = await P(pg, 'document.querySelectorAll(".fontpill")[2].dataset.v'); await pg.click('.fontpill >> nth=2'); await pg.wait_for_timeout(150)
        ok(await P(pg, TX + '.text.font') == f and await P(pg, 'document.querySelectorAll(".fontpill")[2].classList.contains("on")'), 'font pick applies + outlined')
        await pg.click('#fontSearchBtn'); await pg.fill('#fontSearch', FONTS0 := (await P(pg, 'document.querySelectorAll(".fontpill")[0].textContent'))[:4]); await pg.wait_for_timeout(150)
        ok(await P(pg, 'document.querySelectorAll(".fontpill").length') >= 1, 'font search finds')
        await tab('edit', 'styles')
        ok(await P(pg, 'document.querySelectorAll(".aarow .aa").length') >= 8, 'Aa preset row')
        await pg.click('.aarow .aa[data-v="yellow"]'); await pg.wait_for_timeout(150); ok(await P(pg, TX + '.text.color') == '#ffe600', 'yellow preset')
        subs = await P(pg, '[...document.querySelectorAll(".stsub .chipbtn")].map(b=>b.textContent)'); ok(subs == ['Text', 'Stroke', 'Glow', 'Background', 'Shadow'], f'style sub-tabs {subs}')
        ok(await P(pg, '!!document.querySelector(".eyedrop") && !!document.querySelector("#textColorAny") && !!document.querySelector("#textSize") && !!document.querySelector("#textOp")'), 'eyedropper, rainbow, size, opacity')
        await pg.click('.stsub .chipbtn[data-v="stroke"]'); await pg.click('.stbox .swatches .chipbtn[data-v="#ff4d4d"]'); await pg.wait_for_timeout(100)
        await P(pg, "(()=>{const r=document.querySelector('#textOp');r.value=.5;r.dispatchEvent(new Event('input'))})()")
        oc = await P(pg, TX + '.text.outlineColor'); ok(oc.startswith('rgba(') and oc.endswith(',0.5)'), f'stroke colour+opacity {oc}')
        await pg.click('.stsub .chipbtn[data-v="glow"]'); await pg.click('.stbox .swatches .chipbtn[data-v="#1fb6ff"]'); await pg.wait_for_timeout(100); ok(bool(await P(pg, TX + '.text.glow')), 'glow applies')
        await pg.click('.stsub .chipbtn[data-v="bg"]'); await pg.click('.stbox .swatches .chipbtn[data-v="#1fb6ff"]'); await pg.wait_for_timeout(100); ok(await P(pg, TX + '.text.box') is True, 'background applies')
        await pg.click('.stsub .chipbtn[data-v="shadow"]'); await pg.click('.stbox .swatches .chipbtn[data-v="#000000"]'); await pg.wait_for_timeout(100); ok(bool(await P(pg, TX + '.text.shadow')), 'shadow applies')
        await shot(pg, 'b17-text-styles-shadow.png', 300)
        await tab('style', 'effects')
        n = await P(pg, 'document.querySelectorAll(".stylegrid .trtile").length'); ok(n >= 61, f'{n} effect tiles')
        ok(await P(pg, 'document.querySelector(".stylegrid .trtile").dataset.v') == 'none', 'None first')
        await pg.click('.stylegrid .trtile[data-v="xneon-pink"]'); await pg.wait_for_timeout(150); ok(await P(pg, TX + '.text.styleId') == 'xneon-pink', 'effect applies')
        await tab('anim', 'animations')
        at = await P(pg, '[...document.querySelectorAll(".animtabs .chipbtn")].map(b=>b.textContent).join()'); ok(at.lower().startswith('in'), f'In/Out/Loop sub-tabs {at}')
        await pg.click('.angrid .trtile >> nth=2'); await pg.wait_for_timeout(200); ok(bool(await P(pg, TX + '.anim?.in?.id')), 'in animation applies')
        await tab('bubble', 'bubbles')
        await pg.click('.bubblechips .chipbtn[data-v="speech"]'); await pg.wait_for_timeout(150); ok(await P(pg, TX + '.text.bubble') == 'speech', 'speech bubble')
        await P(pg, 'document.querySelector(".sh-done").click()'); await pg.wait_for_timeout(400)
        # preview handles: rotate/scale then ×
        await P(pg, 'studio.select(' + TX + '.id)'); await pg.wait_for_timeout(500)
        hb = await P(pg, '''(()=>{const b=studio.player.boxes.find(b=>b.id===studio.S.sel), cv=document.querySelector('#preview'), r=cv.getBoundingClientRect(), k=r.width/cv.width, a=b.rotation*Math.PI/180;
          const pt=(lx,ly)=>({x:r.left+(b.cx+lx*Math.cos(a)-ly*Math.sin(a))*k, y:r.top+(b.cy+lx*Math.sin(a)+ly*Math.cos(a))*k}); return {rot:pt(b.w/2,b.h/2), del:pt(-b.w/2,-b.h/2), c:pt(0,0)}})()''')
        s0 = await P(pg, 'studio.player.boxes.find(b=>b.id===studio.S.sel).w')
        await pg.mouse.move(hb['rot']['x'], hb['rot']['y']); await pg.mouse.down(); await pg.mouse.move(hb['rot']['x'] + 30, hb['rot']['y'] + 40, steps=8); await pg.mouse.up(); await pg.wait_for_timeout(400)
        tr = await P(pg, TX + '.transform'); ok(abs(tr['rotation']) > 1 or abs(tr['scale'] - 1) > .05, f'rotate/scale handle {tr}')
        await shot(pg, 'b17-text-preview-handles.png', 200)
        hb = await P(pg, '''(()=>{const b=studio.player.boxes.find(b=>b.id===studio.S.sel), cv=document.querySelector('#preview'), r=cv.getBoundingClientRect(), k=r.width/cv.width, a=b.rotation*Math.PI/180;
          return {x:r.left+(b.cx+(-b.w/2)*Math.cos(a)-(-b.h/2)*Math.sin(a))*k, y:r.top+(b.cy+(-b.w/2)*Math.sin(a)+(-b.h/2)*Math.cos(a))*k}})()''')
        await pg.mouse.click(hb['x'], hb['y']); await pg.wait_for_timeout(300)
        ok(await P(pg, '(studio.S.project.tracks.find(t=>t.kind==="text")?.clips.length||0)') == 0, '× deletes the text')
        ok(not errs, f'no page errors {errs[:3]}')
        await b.close()
    s.shutdown()
asyncio.run(run()); log('FAILS:', fails) if fails else log('ALL OK'); sys.exit(1 if fails else 0)

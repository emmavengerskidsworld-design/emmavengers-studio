"""B26: animated Emmavengers watermark. On/off in export, 9 positions + drag, preview == export, cost per frame.
python3 tests/test_watermark.py [shots_dir]"""
import asyncio, sys, functools, http.server, threading, subprocess, tempfile, time, base64, io
from pathlib import Path
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]; SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-wm-')); T0 = time.time(); fails = []; PORT = 8823
def log(*a): print(f'[{time.time()-T0:6.1f}s]', *a, flush=True)
def ok(c, m): log(('  ok   ' if c else '  FAIL ') + m); c or fails.append(m)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
P = lambda pg, js: pg.evaluate(js)
EXPORT = '''(async()=>{const r=await studio.exportVideo(studio.S.project,{short:720,fps:30}); const buf=new Uint8Array(await r.blob.arrayBuffer()); let s=''; for(let i=0;i<buf.length;i+=32768) s+=String.fromCharCode.apply(null,buf.subarray(i,i+32768)); return btoa(s)})()'''
def frame_at(mp4, t):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(t), '-i', str(mp4), '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', '-'], capture_output=True).stdout
    return np.asarray(Image.open(io.BytesIO(raw)).convert('RGB')).astype(float)
def psnr(a, b): m = ((a - b) ** 2).mean(); return 99 if m == 0 else 10 * np.log10(255 ** 2 / m)
async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-loop', '1', '-i', str(ROOT / 'lib/themes/heroes.webp'), '-t', '5', '-vf', 'scale=-2:1280,crop=720:1280:0:0', '-r', '30', '-pix_fmt', 'yuv420p', str(OUT / 'a.mp4')], check=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=30000)
        await P(pg, 'localStorage.removeItem("emma.watermark"); studio.home.hide()')
        await pg.set_input_files('#fileMedia', [str(OUT / 'a.mp4')]); await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===1', timeout=60000)
        await P(pg, 'studio.select(null)'); await pg.wait_for_timeout(500)
        for t, n in ((1.0, 'wordmark'), (2.3, 'folding'), (4.0, 'symbol')):
            await P(pg, f'studio.player.seek({t})'); await pg.wait_for_timeout(700); await pg.screenshot(path=str(SHOTS / f'b26-watermark-{n}-390.png'))
        # default: on, bottom-right
        r = await P(pg, '(async()=>{const m=await import("./js/watermark.js"); return [m.wmOf(studio.S.project), m.wmRect, document.querySelector("#preview").width, document.querySelector("#preview").height]})()')
        w, R, W, H = r; ok(w['on'] and w['pos'] == 'br', f'default watermark on, bottom-right ({w["pos"]})')
        ok(R and R['x'] > W * .7 and R['y'] > H * .8, f'drawn in the bottom-right corner of the preview ({R and round(R["x"])},{R and round(R["y"])} of {W}x{H})')
        # perf: draw cost with / without
        cost = await P(pg, '''(async()=>{const m=await import("./js/watermark.js"); const c=document.createElement('canvas'); c.width=1080; c.height=1920; const x=c.getContext('2d'); const p=studio.S.project; let t0=performance.now(); for(let i=0;i<60;i++) m.drawWatermark(x,1080,1920,p,i/30); return (performance.now()-t0)/60})()''')
        ok(cost < 4, f'watermark costs {cost:.2f} ms per 1080x1920 frame (budget 4)')
        # tap on the watermark opens its settings; 9 positions
        await P(pg, 'studio.player.seek(4)'); await pg.wait_for_timeout(600)
        R = await P(pg, '(async()=>{const m=await import("./js/watermark.js"); const r=m.wmRect, c=document.querySelector("#preview").getBoundingClientRect(), k=c.width/m.wmRect.W; return {x:c.left+(r.x+r.w/2)*k, y:c.top+(r.y+r.h/2)*k}})()')
        t0 = time.time(); await pg.touchscreen.tap(R['x'], R['y']); await pg.wait_for_selector('.wmgrid', timeout=3000)
        ok(True, f'tap on the watermark opens its settings'); await pg.wait_for_timeout(300); await pg.screenshot(path=str(SHOTS / 'b26-watermark-settings-390.png'))
        ms = await P(pg, '''(async()=>{const t0=performance.now(); document.querySelector('.wmgrid button[data-pos="tl"]').click(); await new Promise(r=>requestAnimationFrame(()=>setTimeout(r,0))); return performance.now()-t0})()''')
        ok(ms < 100, f'position tap responds in {ms:.0f} ms')
        await pg.wait_for_timeout(500); R2 = await P(pg, '(async()=>(await import("./js/watermark.js")).wmRect)()')
        ok(R2 and R2['x'] < W * .2 and R2['y'] < H * .15, 'top-left position moves it to the top-left')
        await pg.screenshot(path=str(SHOTS / 'b26-watermark-topleft-390.png'))
        await P(pg, 'document.querySelector(".sh-done").click()'); await pg.wait_for_timeout(400)
        # drag it freely
        R = await P(pg, '(async()=>{const m=await import("./js/watermark.js"); const r=m.wmRect, c=document.querySelector("#preview").getBoundingClientRect(), k=c.width/r.W; return {x:c.left+(r.x+r.w/2)*k, y:c.top+(r.y+r.h/2)*k}})()')
        await pg.mouse.move(R['x'], R['y']); await pg.mouse.down(); await pg.mouse.move(R['x'] + 120, R['y'] + 200, steps=8); await pg.mouse.up(); await pg.wait_for_timeout(500)
        w = await P(pg, '(async()=>(await import("./js/watermark.js")).wmOf(studio.S.project))()')
        ok(w['pos'] == 'custom' and .3 < w['cx'] < .8 and .2 < w['cy'] < .6, f'drag places it freely ({w["pos"]} {w["cx"]},{w["cy"]})')
        ok((await P(pg, 'JSON.parse(localStorage.getItem("emma.watermark")||"{}").pos')) == 'custom', 'saved as the default for new projects')
        await pg.screenshot(path=str(SHOTS / 'b26-watermark-dragged-390.png'))
        # parity: preview frame vs exported frame at 4.0 s (custom position)
        await P(pg, 'studio.select(null); studio.player.seek(4)'); await pg.wait_for_timeout(900)
        pv = await P(pg, '''(()=>{const c=document.querySelector('#preview'), k=document.createElement('canvas'); k.width=720; k.height=1280; k.getContext('2d').drawImage(c,0,0,720,1280); return k.toDataURL('image/png')})()''')
        pva = np.asarray(Image.open(io.BytesIO(base64.b64decode(pv.split(',')[1]))).convert('RGB')).astype(float)
        f = OUT / 'on.mp4'; f.write_bytes(base64.b64decode(await P(pg, EXPORT)))
        ex = frame_at(f, 4.0); wr = await P(pg, '(async()=>{const m=await import("./js/watermark.js"); return m.wmLayout(720,1280,m.wmOf(studio.S.project),4).rect})()')
        x0, y0, x1, y1 = int(wr['x']), int(wr['y']), int(wr['x'] + wr['w']), int(wr['y'] + wr['h'])
        ok(ex.shape[:2] == (1280, 720), f'export is 720x1280 ({ex.shape})')
        reg = psnr(pva[y0:y1, x0:x1], ex[y0:y1, x0:x1]); ok(reg > 26, f'watermark region preview vs export PSNR {reg:.1f} dB')
        Image.fromarray(np.concatenate([pva, ex], 1).astype('uint8')).resize((720, 640)).save(SHOTS / 'b26-watermark-parity.png')
        # off: exported frame has no watermark there
        await P(pg, '(async()=>{const m=await import("./js/watermark.js"); studio.act(p=>{p.watermark={...m.wmOf(p),on:false}})})()'); await pg.wait_for_timeout(300)
        f2 = OUT / 'off.mp4'; f2.write_bytes(base64.b64decode(await P(pg, EXPORT))); ex2 = frame_at(f2, 4.0)
        d_on = np.abs(ex[y0:y1, x0:x1] - ex2[y0:y1, x0:x1]).mean(); d_rest = np.abs(ex[:200, :200] - ex2[:200, :200]).mean()
        ok(d_on > 8 and d_rest < 2, f'off removes it from the export (region diff {d_on:.1f}, elsewhere {d_rest:.1f})')
        # sample: default position export (bottom-right) for review
        await P(pg, '(async()=>{const m=await import("./js/watermark.js"); studio.act(p=>{p.watermark={...m.WM_DEFAULT}})})()')
        Path('/workspace/wm-anim/wm-export-sample.mp4').write_bytes(base64.b64decode(await P(pg, EXPORT)))
        ok(not errs, f'no page errors {errs[:2]}')
        await b.close()
    log('RESULT:', 'PASS' if not fails else f'FAIL {fails}'); sys.exit(1 if fails else 0)
asyncio.run(run())

"""B25: join (transition) button needs a deliberate tap; gapless playback across a cut (no black frame) in preview and export.
python3 tests/test_gapless.py [shots_dir]"""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, base64
from pathlib import Path
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]; SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-gap-')); T0 = time.time(); fails = []; PORT = 8819
def log(*a): print(f'[{time.time()-T0:6.1f}s]', *a, flush=True)
def ok(c, m): log(('  ok   ' if c else '  FAIL ') + m); c or fails.append(m)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
P = lambda pg, js: pg.evaluate(js)
async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    for n, c in (('a', '0xd03030'), ('b', '0x3060d0')):
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', f'color=c={c}:s=360x640:r=30:d=2', '-f', 'lavfi', '-i', 'sine=f=440:d=2', '-shortest', '-c:v', 'libx264', '-g', '30', '-pix_fmt', 'yuv420p', '-c:a', 'aac', str(OUT / f'{n}.mp4')], check=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=30000)
        await P(pg, 'studio.home.hide()'); await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[])})')
        await pg.set_input_files('#fileMedia', [str(OUT / 'a.mp4'), str(OUT / 'b.mp4')]); await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===2', timeout=60000)
        await P(pg, 'studio.select(null); studio.timeline.setZoom(60)'); await pg.wait_for_timeout(800)
        jid = await P(pg, 'document.querySelector(".joint").dataset.joint')
        bb = await pg.locator('.joint i').bounding_box(); cx, cy = bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2
        ok(bb['width'] <= 18 and bb['height'] <= 18, f"join icon hit area is small ({bb['width']:.0f}x{bb['height']:.0f})")
        sheet = 'document.querySelector("#sheet") && !document.querySelector("#sheet").classList.contains("hidden") && !!document.querySelector(".trgrid")'
        # 1) a drag that starts on the join icon must not open Transitions
        await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.mouse.move(cx + 30, cy, steps=5); await pg.mouse.up(); await pg.wait_for_timeout(400)
        ok(not await P(pg, sheet), 'drag across the join icon does not open Transitions')
        await P(pg, """window._ev=[]; for (const t of ['pointerdown','pointerup','pointercancel','touchstart','touchend','click']) addEventListener(t, e=>_ev.push(t+':'+(e.target.className||e.target.tagName)), true)""")
        miss = 0
        for i in range(15):
            await P(pg, 'studio.select(null); _ev.length=0'); await pg.wait_for_timeout(250)
            await pg.touchscreen.tap(cx - 40 - i, cy); await pg.wait_for_timeout(250)
            if not await P(pg, 'studio.S.sel'): miss += 1; log('miss', await P(pg, '_ev.join(" ")'))
        ok(miss == 0 and not await P(pg, sheet), f'15 taps on the clip near the join all select the clip ({miss} missed), none open Transitions')
        await P(pg, 'studio.select(null)'); await pg.wait_for_timeout(300)
        bb = await pg.locator('.joint i').bounding_box(); cx, cy = bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2
        # 3) a long press on the icon (not a tap) does nothing
        await pg.mouse.move(cx, cy); await pg.mouse.down(); await pg.wait_for_timeout(700); await pg.mouse.up(); await pg.wait_for_timeout(300)
        ok(not await P(pg, sheet), 'long press on the join icon does not open Transitions')
        # 4) a deliberate tap opens it
        await pg.touchscreen.tap(cx, cy); await pg.wait_for_timeout(500)
        ok(await P(pg, sheet), 'a deliberate tap on the join icon opens Transitions')
        await P(pg, 'document.querySelector(".sh-done").click()'); await pg.wait_for_timeout(300)
        # 5) gapless playback: sample the preview every frame across the cut
        await P(pg, 'studio.select(null); studio.player.seek(1.0)'); await pg.wait_for_timeout(600)
        res = await P(pg, '''(async()=>{const cv=document.querySelector('#preview'), k=document.createElement('canvas'); k.width=8; k.height=8; const x=k.getContext('2d',{willReadFrequently:true}); const out=[];
          studio.player.play(); const t0=performance.now();
          await new Promise(r=>{const f=()=>{x.drawImage(cv,0,0,8,8); const d=x.getImageData(0,0,8,8).data; let m=0; for(let i=0;i<d.length;i+=4) m+=d[i]+d[i+1]+d[i+2]; out.push([+studio.player.t.toFixed(3), Math.round(m/64/3)]); if(studio.player.t<3.0 && performance.now()-t0<6000) requestAnimationFrame(f); else r();}; requestAnimationFrame(f)});
          studio.player.pause(); return {out, held: studio.player.stats.held||0}})()''')
        near = [v for t, v in res['out'] if 1.6 < t < 2.5]; dark = [v for v in near if v < 25]
        ok(len(near) > 5 and not dark, f"no black frame across the cut in playback ({len(near)} frames sampled near the cut, darkest {min(near) if near else None}, held {res['held']})")
        # 6) export: frames around the cut are never black
        r = await P(pg, '''(async()=>{const r=await studio.exportVideo(studio.S.project,{short:720,fps:30}); const buf=new Uint8Array(await r.blob.arrayBuffer()); let s=''; for(let i=0;i<buf.length;i+=32768) s+=String.fromCharCode.apply(null,buf.subarray(i,i+32768)); return btoa(s)})()''')
        f = OUT / 'gap.mp4'; f.write_bytes(base64.b64decode(r))
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(f), '-vf', 'scale=8:8', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], capture_output=True).stdout
        fr = np.frombuffer(raw, np.uint8).reshape(-1, 8, 8, 3).mean(axis=(1, 2, 3)); n = len(fr)
        ok(n >= 110 and fr.min() > 25, f'export: {n} frames, darkest frame mean {fr.min():.0f} (no black frame at the cut)')
        ok(not errs, f'no page errors {errs[:2]}')
        await b.close()
    log('RESULT:', 'PASS' if not fails else f'FAIL {fails}'); sys.exit(1 if fails else 0)
asyncio.run(run())

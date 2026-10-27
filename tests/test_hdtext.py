"""B22 HD export check for the new text looks: a 1080x1920 export of a clip carrying a pro template (gold texture, subtitle, letterbox deco),
a designed bubble, B/I/U, tracking, line spacing and justify. Checks ffprobe (1080x1920 h264, duration) and that the exported frame matches
the preview renderer (PSNR on the text area).   python3 tests/test_hdtext.py [shots_dir]"""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, base64, io, math, os
from pathlib import Path
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]; SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-hd-')); T0 = time.time(); fails = []; PORT = 8817
def log(*a): print(f'[{time.time()-T0:6.1f}s]', *a, flush=True)
def ok(c, m): log(('  ok   ' if c else '  FAIL ') + m); c or fails.append(m)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
P = lambda pg, js: pg.evaluate(js)
def psnr(a, b): m = ((a - b) ** 2).mean(); return 99 if m < 1e-9 else 10 * math.log10(255 ** 2 / m)
async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x2a3550:s=1080x1920:r=30:d=4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(OUT / 'bg.mp4')], check=True)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        pg = await (await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, accept_downloads=True)).new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=30000)
        await P(pg, 'studio.home.hide()'); await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[])})')
        await pg.set_input_files('#fileMedia', [str(OUT / 'bg.mp4')]); await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===1', timeout=30000)
        await pg.click('#toolbar .tool[data-tool="text"]'); await pg.wait_for_timeout(200); await pg.click('#toolbar .tool[data-tool="addtext"]'); await pg.wait_for_timeout(500)
        await P(pg, '''(async()=>{const T=(await import('./js/texttemplates.js')).TEMPLATES; const t=T.find(x=>x.id==='t_45'); studio.act(p=>{const c=p.tracks.find(k=>k.kind==='text').clips[0]; c.start=0; c.dur=4; c.anim=null;
          Object.assign(c.text,JSON.parse(JSON.stringify(t.s)),{content:'PREMIUM', font:t.font, size:t.size, track:t.track, sub:t.sub, deco:t.deco}); c.transform={...c.transform,y:.3}});
          const L=studio.S.project.tracks.filter(k=>k.kind==='text'); })()''')
        await P(pg, '''studio.act(p=>{const tr=p.tracks.find(k=>k.kind==='text'); const c0=tr.clips[0]; const c=JSON.parse(JSON.stringify(c0)); c.id=c0.id+'b'; c.transform={...c.transform,y:.65};
          c.text={...c.text,content:'Golden hour\\nby the sea together',size:70,tex:null,sub:null,deco:null,track:.08,lineH:1.3,align:'justify',bold:true,italic:true,under:true,color:'#16161c',bubble:'ribbon2',box:true,boxColor:'#d4af37',bubbleBorder:null,shadow:null,fx:null}; tr.clips.push(c)})''')
        await pg.wait_for_timeout(800)
        d = await P(pg, 'studio.renderStill({t:2,W:1080,H:1920})'); still = Image.open(io.BytesIO(base64.b64decode(d))).convert('RGB'); still.save(SHOTS / 'b22-hd-preview-frame.png')
        t0 = time.time(); r = await P(pg, '''(async()=>{const r=await studio.exportVideo(studio.S.project,{short:1080,fps:30}); const buf=new Uint8Array(await r.blob.arrayBuffer()); let s=''; for(let i=0;i<buf.length;i+=32768) s+=String.fromCharCode.apply(null,buf.subarray(i,i+32768)); return {b64:btoa(s),codec:r.codec,sec:r.seconds}})()''')
        f = OUT / 'hd.mp4'; f.write_bytes(base64.b64decode(r['b64'])); log(f'  exported {f.stat().st_size/1e6:.2f} MB in {time.time()-t0:.1f}s codec {r["codec"]}')
        pr = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(f)], capture_output=True, text=True).stdout)
        v = next(x for x in pr['streams'] if x['codec_type'] == 'video'); ok(v['width'] == 1080 and v['height'] == 1920, f"HD export is {v['width']}x{v['height']} {v['codec_name']}")
        ok(abs(float(pr['format']['duration']) - 4) < .2, f"duration {pr['format']['duration']}")
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', '2', '-i', str(f), '-frames:v', '1', str(SHOTS / 'b22-hd-export-frame.png')], check=True)
        ex = np.asarray(Image.open(SHOTS / 'b22-hd-export-frame.png').convert('RGB')).astype(float); st = np.asarray(still).astype(float)
        q = psnr(ex, st); ok(q > 30, f'export frame matches the preview render (PSNR {q:.1f} dB)')
        Image.fromarray(np.hstack([st, ex]).astype('uint8')).resize((1080, 960)).save(SHOTS / 'b22-hd-parity.png')
        ok(not errs, f'no page errors {errs[:2]}')
        await b.close()
    log('RESULT:', 'PASS' if not fails else f'FAIL {fails}')
    sys.exit(1 if fails else 0)
asyncio.run(run())

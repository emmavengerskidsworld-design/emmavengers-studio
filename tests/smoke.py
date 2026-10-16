import asyncio, sys, functools, http.server, threading
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]; FX = ROOT / 'tests/fixtures'
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
def serve(port):
    s = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start(); return s
async def main():
    serve(8711)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--autoplay-policy=no-user-gesture-required'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
        pg = await ctx.new_page(); errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type in ('error', 'warning') else None); pg.on('pageerror', lambda e: errs.append('PAGEERR ' + str(e)))
        await pg.goto('http://127.0.0.1:8711/'); await pg.wait_for_function('window.studio && studio.ready', timeout=15000)
        await pg.set_input_files('#fileMedia', [str(FX/'video.mp4'), str(FX/'image.png')])
        await pg.wait_for_function('studio.S.project.tracks[0].clips.length==2', timeout=15000)
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path='/tmp/smoke1.png')
        print(await pg.evaluate('JSON.stringify(studio.S.project.tracks.map(t=>[t.kind,t.clips.map(c=>[c.type,c.start,c.in,c.out,c.dur])]))'))
        r = await pg.evaluate('''async()=>{const r=await studio.exportVideo(studio.S.project,{short:720,fps:30,onProgress:()=>{}});const b=new Uint8Array(await r.blob.arrayBuffer());let s='';for(let i=0;i<b.length;i+=0x8000)s+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));return {b64:btoa(s),codec:r.codec,sec:r.seconds,src:r.sources}}''')
        import base64; open('/tmp/smoke.mp4','wb').write(base64.b64decode(r['b64'])); print(r['codec'], r['sec'], r['src'])
        print('errors', errs)
        await b.close()
asyncio.run(main())

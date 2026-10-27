import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, io, base64, math
from pathlib import Path
from PIL import Image, ImageChops, ImageStat
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]; FX = ROOT / 'tests/fixtures'
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-fxp-')); fails = []; T0 = time.time(); PORT = 8776; METRICS = {}
def log(*a): print(f'[{time.time()-T0:6.1f}s]', *a, flush=True)
def ok(c, m):
    log(('  ok   ' if c else '  FAIL ') + m)
    if not c: fails.append(m)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def handle(self):
        try: super().handle()
        except Exception: pass
def frame(f, t, name):
    o = OUT / name; subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t:.3f}', '-i', str(f), '-frames:v', '1', str(o)], check=True); return Image.open(o).convert('RGB')
def psnr(a, b):
    b = b.resize(a.size); d = ImageChops.difference(a, b); st = ImageStat.Stat(d); mse = sum(x * x for x in st.rms) / 3
    return 99.0 if mse == 0 else 10 * math.log10(255 * 255 / mse)
def psnr_lo(a, b):
    w, h = a.size[0] // 4, a.size[1] // 4; return psnr(a.resize((w, h), Image.BOX), b.resize(a.size).resize((w, h), Image.BOX))
def mdiff(a, b): b = b.resize(a.size); return sum(ImageStat.Stat(ImageChops.difference(a, b)).mean) / 3
async def new_page(b):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
    pg = await ctx.new_page(); pg.errs = []
    pg.on('pageerror', lambda e: pg.errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and pg.errs.append(m.text))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=20000); return ctx, pg
P = lambda pg, js: pg.evaluate(js)
async def seek_exact(pg, t): await P(pg, f'(()=>{{studio.player.pause();studio.player.seek({t});studio.timeline.setTime({t})}})()'); await pg.wait_for_timeout(500)
async def set_time(pg, t):
    await P(pg, f'(()=>{{const tl=studio.timeline;tl.scroll.scrollLeft=Math.round({t}*tl.pps)}})()'); await pg.wait_for_timeout(250); return await P(pg, 'studio.player.t')
async def still(pg, t, W=540, H=960):
    d = await P(pg, f'studio.renderStill({{t:{t},W:{W},H:{H}}})'); return Image.open(io.BytesIO(base64.b64decode(d))).convert('RGB')
async def export(pg, tag, res=720):
    await pg.click('#exportBtn'); await pg.click(f'#exRes .chipbtn[data-v="{res}"]'); await pg.click('#exGo'); await pg.wait_for_selector('#exDone:not([hidden])', timeout=300000)
    async with pg.expect_download() as dl: await pg.click('#exSave')
    d = await dl.value; f = OUT / (tag + '.mp4'); await d.save_as(str(f)); await pg.click('#exBack'); await pg.wait_for_timeout(300); return f
async def shot(pg, name): await pg.screenshot(path=str(SHOTS / name)); log('  shot ' + name)
async def base_project(pg, files=('sharp.png',)):
    await pg.set_input_files('#fileMedia', [str(FX / f) for f in files])
    await pg.wait_for_function(f'studio.S.project.tracks.find(t=>t.kind==="main").clips.length==={len(files)}', timeout=20000); await pg.wait_for_timeout(400)
async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--enable-unsafe-swiftshader'])
        ctx, pg = await new_page(b)
        await P(pg, 'studio.home && studio.home.hide && studio.home.hide()')
        await P(pg, "document.head.insertAdjacentHTML('beforeend','<style>#toast,#fsBtn,#cmpBtn{display:none!important}</style>')")
        await base_project(pg)
        TX = 'studio.S.project.tracks.find(t=>t.kind==="text").clips'
        # three texts with three effects + one template, all on screen at t=1
        await P(pg, """(async()=>{const E=await import('./js/texteffects.js'), pj=await import('./js/project.js'), R=await import('./js/registry.js'), TS=await import('./js/textstyles.js'), TT=await import('./js/texttemplates.js');
          const mk=(eid,word,y,font)=>{const c=pj.newClip('text',{dur:4,transform:{...R.DEFAULT_TRANSFORM,y}}); c.text.content=word; c.text.size=170; if(font)c.text.font=font; TS.applyStyle(c.text,null); Object.assign(c.text, JSON.parse(JSON.stringify(E.effectById(eid).s))); c.text.styleId=eid; return c;};
          studio.act(p=>{ pj.addToKind(p,'text',mk('e_fire','FIRE',0.18,'anton'),0); pj.addToKind(p,'text',mk('e_neonmulti','NEON',0.38,'righteous'),0); pj.addToKind(p,'text',mk('e_graffiti','DRIP',0.58,'bangers'),0);
            const t=TT.TEMPLATES[0], c=mk(t.fx,t.word,0.8,t.font); c.text.deco={...t.deco}; pj.addToKind(p,'text',c,0); }); })()""")
        await pg.wait_for_timeout(300); await P(pg, 'document.fonts.ready'); await pg.wait_for_timeout(1200)
        n = await P(pg, 'studio.S.project.tracks.filter(t=>t.kind==="text").reduce((a,t)=>a+t.clips.length,0)'); ok(n == 4, f'{n} effect texts on the timeline')
        await seek_exact(pg, 1.0); await P(pg, 'studio.select(null)'); await pg.wait_for_timeout(600)
        await pg.locator('#preview').screenshot(path=str(SHOTS / 'b20-effects-preview-390.png')); log('  shot b20-effects-preview-390.png')
        await shot(pg, 'b20-effects-applied-390.png')
        f = await export(pg, 'fxparity', 720); ex = frame(f, 1.0, 'fx_ex.png'); ex.save(SHOTS / 'b20-export-frame.png'); log('  shot b20-export-frame.png')
        st = await still(pg, 1.0, 720, 1280); st.save(SHOTS / 'b20-renderer-frame.png')
        ps = psnr_lo(st, ex); ok(ps > 28, f'export frame == preview renderer with multi-layer effects (PSNR at 1/4 size {ps:.1f} dB)')
        # preview canvas vs renderer (same size)
        pv = Image.open(SHOTS / 'b20-effects-preview-390.png').convert('RGB'); md = mdiff(st.resize(pv.size), pv); ok(md < 12, f'preview == renderer (mean diff {md:.1f})')
        side = Image.new('RGB', (st.width * 2 + 10, st.height), 'white'); side.paste(st, (0, 0)); side.paste(ex.resize(st.size), (st.width + 10, 0)); side.save(SHOTS / 'b20-parity-side-by-side.png'); log('  shot b20-parity-side-by-side.png')
        ok(not pg.errs, f'no page errors {pg.errs[:3]}')
        await b.close()
    s.shutdown(); log('RESULT:', 'PASS' if not fails else f'FAIL {fails}'); sys.exit(1 if fails else 0)
asyncio.run(run())

"""Batch 12 part 1 — Brand Kit (logos, colours, fonts, intro/outro, watermark, CTA; one tap; Beat Ad Maker + templates).   python3 tests/test_brand.py [shots_dir]"""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, math, io, base64
from pathlib import Path
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-brand-')); fails = []; T0 = time.time(); PORT = 8803; metrics = {}
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
    lg = Image.new('RGBA', (400, 400), (0, 0, 0, 0)); from PIL import ImageDraw; d = ImageDraw.Draw(lg); d.ellipse((20, 20, 380, 380), fill=(230, 30, 60, 255)); d.rectangle((150, 120, 250, 280), fill=(255, 255, 255, 255)); lg.save(OUT / 'mylogo.png')
    Image.fromarray(np.full((1920, 1080, 3), (40, 160, 90), np.uint8)).save(OUT / 'green.jpg', quality=92)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=30000)
        await P(pg, 'studio.home && studio.home.hide && studio.home.hide()'); await pg.wait_for_timeout(300)
        await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[]); p.bg="#000000"; p.perf={proxy:false}})')

        FX = ROOT / 'tests/fixtures'
        await P(pg, 'localStorage.removeItem("evs-brandkit")')
        await P(pg, 'document.querySelector("#fileMedia").value=""'); await pg.set_input_files('#fileMedia', [str(OUT / 'bg.jpg'), str(OUT / 'green.jpg')])
        await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===2', timeout=30000); await pg.wait_for_timeout(400)
        await P(pg, """studio.act(p=>{ const t=studio.project.newClip('text',{dur:3, transform:{x:.5,y:.3,scale:1,rotation:0,opacity:1}, text:{content:'My big title', size:120, color:'#ffffff', font:'bold', outline:true, outlineColor:'#000000', align:'center'}}); studio.project.addToKind(p,'text',t,1); })""")
        D0 = await P(pg, 'studio.projectDuration(studio.S.project)'); t0 = await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="text").clips[0].start')
        log('== kit sheet')
        await P(pg, 'studio.select(null)'); await tool(pg, 'brand'); await pg.wait_for_selector('#bkLogos .bklogo[data-i="0"]', timeout=30000); await pg.wait_for_timeout(300)
        ok(await P(pg, 'document.querySelectorAll("#bkLogos .bklogo[data-i]").length') == 1, 'kit starts with the Emmavengers logo')
        await pg.set_input_files('#bkLogoFile', str(OUT / 'mylogo.png')); await pg.wait_for_function('document.querySelectorAll("#bkLogos .bklogo[data-i]").length===2', timeout=20000)
        await P(pg, """(()=>{const c=document.querySelectorAll('#bkColors input'); const v=['#ff2255','#ffcc00','#2244ff','#22aa66','#ffffff']; c.forEach((x,i)=>{x.value=v[i]; x.dispatchEvent(new Event('input'))})})()""")
        await pg.click('#bkTitleFont .chipbtn[data-v="fredoka"]'); await pg.click('#bkWmPos .chipbtn[data-v="bl"]')
        await P(pg, "(()=>{const s=document.querySelector('input#bkWmOp'); s.value=0.4; s.dispatchEvent(new Event('input'))})()")
        await P(pg, "(()=>{const t=document.querySelector('#bkCta'); t.value='Follow Emma for more!\\nShare with a friend'; t.dispatchEvent(new Event('input'))})()")
        await shot(pg, 'b12-brand-kit.png', 300)
        k = await P(pg, 'JSON.parse(localStorage.getItem("evs-brandkit"))'); log('  kit', {x: k[x] for x in ['logos', 'logo', 'colors', 'fonts', 'watermark', 'cta', 'saved']})
        ok(len(k['logos']) == 2 and k['logo'] == 1 and k['colors'][0] == '#ff2255' and k['fonts']['title'] == 'fredoka' and k['watermark']['pos'] == 'bl' and abs(k['watermark']['opacity'] - .4) < .01 and k['cta'][0] == 'Follow Emma for more!' and k['saved'], 'kit saves logos, colours, fonts, watermark, CTA lines')
        log('== one tap apply')
        await pg.click('#bkApply'); await pg.wait_for_function('document.querySelector("#busy").hidden && studio.S.project.brand', timeout=30000); await pg.wait_for_timeout(500)
        st = await P(pg, """(()=>{const p=studio.S.project, m=p.tracks.find(t=>t.kind==='main').clips, all=p.tracks.flatMap(t=>t.clips), wm=all.find(c=>c.brand==='wm'), tx=p.tracks.find(t=>t.kind==='text').clips.find(c=>!c.brand);
          return {first:m[0].brand, last:m[m.length-1].brand, n:m.length, introDur:m[0].dur, outroDur:m[m.length-1].dur, wm: wm&&{mid:wm.mediaId, op:wm.transform.opacity, x:wm.transform.x, y:wm.transform.y, start:wm.start, dur:wm.dur}, txFont:tx.text.font, txColor:tx.text.color, txStart:tx.start, D:studio.projectDuration(p), logos:JSON.parse(localStorage.getItem('evs-brandkit')).logos, brandN: all.filter(c=>c.brand).length}})()""")
        log('  applied', st)
        ok(st['first'] == 'intro' and st['last'] == 'outro' and st['n'] == 4, 'intro first, outro last on the main track')
        ok(st['wm'] and st['wm']['mid'] == st['logos'][1] and abs(st['wm']['op'] - .4) < .01 and st['wm']['x'] < .5 and st['wm']['y'] > .5, 'watermark = my logo, bottom left, 40%')
        ok(abs(st['wm']['start'] - st['introDur']) < .01 and abs(st['wm']['start'] + st['wm']['dur'] - (st['D'] - st['outroDur'])) < .02, 'watermark runs between intro and outro')
        ok(st['txFont'] == 'fredoka' and st['txColor'] == '#ff2255', 'my title gets the brand font + colour')
        ok(abs(st['txStart'] - (t0 + st['introDur'])) < .01 and abs(st['D'] - (D0 + st['introDur'] + st['outroDur'])) < .02, 'everything else moves after the intro (text stays in sync)')
        await close(pg); await seek(pg, 1.2, 900); await shot(pg, 'b12-brand-intro.png', 200)
        await seek(pg, st['D'] - 1.0, 900); await shot(pg, 'b12-brand-outro.png', 200)
        await seek(pg, st['introDur'] + 1.0, 700); await shot(pg, 'b12-brand-applied.png', 200)
        ins = await P(pg, """(()=>{const o=studio.S.project.tracks.find(t=>t.kind==='main').clips.at(-1); return o.inner.tracks.flatMap(t=>t.clips).map(c=>[c.type, c.mediaId||'', c.text?c.text.content:'', c.element?c.element.colors[0]:''])})()"""); log('  outro', ins)
        ok(any(x[2] == 'Follow Emma for more!' for x in ins) and any(x[1] == st['logos'][1] for x in ins) and any(x[3] == '#ff2255' for x in ins), 'outro = brand colours + my logo + my CTA line')
        await tool(pg, 'brand'); await pg.wait_for_selector('#bkApply'); await pg.click('#bkApply'); await pg.wait_for_function('document.querySelector("#busy").hidden', timeout=30000); await pg.wait_for_timeout(400)
        st2 = await P(pg, """(()=>{const p=studio.S.project; return {n:p.tracks.find(t=>t.kind==='main').clips.length, D:studio.projectDuration(p), brandN:p.tracks.flatMap(t=>t.clips).filter(c=>c.brand).length, txStart:p.tracks.find(t=>t.kind==='text').clips.find(c=>!c.brand).start}})()""")
        ok(st2['n'] == 4 and st2['brandN'] == st['brandN'] and abs(st2['D'] - st['D']) < .01 and abs(st2['txStart'] - st['txStart']) < .01, f'applying again replaces (no stacking) {st2}')
        log('== preview == export')
        f = await export(pg, 'brand', 720); Ds = []
        for t in [1.2, st['introDur'] + 1.0, st['D'] - 1.0]:
            ex = frame(f, t, f'e{t}.png', (180, 320)); pv = await still(pg, t, 180, 320); Ds.append(float(np.abs(small(ex) - small(pv)).mean()))
        log('  preview vs export', Ds); ok(max(Ds) < 10, f'preview == export (max {max(Ds):.1f})')
        await pg.click('#bkRemove') if await pg.locator('#bkRemove').count() else None
        await tool(pg, 'brand'); await pg.wait_for_selector('#bkRemove'); await pg.click('#bkRemove'); await pg.wait_for_timeout(300); await close(pg)
        st3 = await P(pg, """(()=>{const p=studio.S.project; return {n:p.tracks.find(t=>t.kind==='main').clips.length, D:studio.projectDuration(p), tx:p.tracks.find(t=>t.kind==='text').clips[0].start}})()""")
        ok(st3['n'] == 2 and abs(st3['D'] - D0) < .02 and abs(st3['tx'] - t0) < .01, f'Remove brand restores the project {st3}')
        log('== kit in templates + Beat Ad Maker')
        await P(pg, 'studio.tplUse("promo-newvideo")'); await pg.wait_for_function('studio.S.project.template && document.querySelector("#busy").hidden', timeout=90000); await pg.wait_for_timeout(600)
        tp = await P(pg, """(()=>{const a=studio.S.project.tracks.flatMap(t=>t.clips); return {wm:(a.find(c=>c.brand==='wm')||{}).mediaId||null, outro:a.some(c=>c.brand==='outro')}})()"""); log('  template', tp)
        ok(tp['wm'] == st['logos'][1] and tp['outro'], 'a new template gets my watermark + outro')
        await pg.goto(f'http://127.0.0.1:{PORT}/?home'); await pg.wait_for_function('window.studio && studio.ready', timeout=30000); await pg.wait_for_timeout(500)
        await pg.click('#homeAd'); await pg.wait_for_selector('#adMedia'); await pg.wait_for_timeout(500)
        await pg.set_input_files('#adFiles', [str(FX / 'red.png'), str(FX / 'blue.png'), str(FX / 'sharp.png')])
        await pg.wait_for_function('document.querySelectorAll("#adMedia .adtile:not(.adadd)").length===3', timeout=30000); await pg.wait_for_timeout(500)
        await pg.click('#adMake'); await pg.wait_for_function('studio.S.project && studio.S.project.ad && document.querySelector("#busy").hidden', timeout=120000); await pg.wait_for_timeout(700)
        ad = await P(pg, """(()=>{const a=studio.S.project.tracks.flatMap(t=>t.clips), k=JSON.parse(localStorage.getItem('evs-brandkit')); return {wm:(a.find(c=>c.brand==='wm')||{}).mediaId||null, logoOutro:a.some(c=>c.type==='image'&&c.mediaId===k.logos[1]&&!c.brand), cta:a.some(c=>c.type==='text'&&c.text.content==='Follow Emma for more!'), fonts:[...new Set(a.filter(c=>c.type==='text').map(c=>c.text.font))], mine:k.logos[1]}})()"""); log('  ad', ad)
        ok(ad['wm'] == ad['mine'] and ad['logoOutro'] and ad['cta'], 'Beat Ad Maker uses my logo (outro + watermark) and my CTA line')
        ok(set(ad['fonts']) <= {'fredoka', 'poppins'}, f"ad text uses the brand fonts {ad['fonts']}")
        await shot(pg, 'b12-brand-ad.png', 300)
        metrics = {'parity': [round(x, 2) for x in Ds], 'intro_s': st['introDur'], 'outro_s': st['outroDur']}
        real = [e for e in errs if 'favicon' not in e]; ok(not real, f'no page errors {real[:3]}')
        await b.close()
    log('METRICS', json.dumps(metrics)); (ROOT / 'tests' / 'brand-metrics.json').write_text(json.dumps(metrics, indent=1))
    log(f'RESULT: {"PASS" if not fails else "FAIL"} ({len(fails)} failures) in {time.time() - T0:.0f}s')
    for m in fails: log('  -', m)
    sys.exit(1 if fails else 0)
asyncio.run(run())

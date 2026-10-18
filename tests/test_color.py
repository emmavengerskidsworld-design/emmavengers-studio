"""Batch 10 part 1 — Colour pro (Google Chrome, 390x844 phone).   python3 tests/test_color.py [shots_dir]
- curves (RGB + per channel), HSL 8 bands, colour wheels (lift/gamma/gain), white balance + picker
- 20 own LUTs (files parse, all distinct) + .cube import through the UI, LUT strength
- adjustment layer: colour/filter/effects on everything under it, only inside its time range
- vignette / grain / sharpen per clip with keyframes; Colour sheet UI (curve editor, HSL, wheels, ◆)
- preview == export (renderStill vs exact exported frames)"""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, math, io, base64
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-color-')); fails = []; T0 = time.time(); PORT = 8788; metrics = {}
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
PATCH = [[(240, 240, 240), (128, 128, 128), (20, 20, 20)], [(220, 40, 40), (40, 200, 60), (40, 60, 220)], [(170, 140, 110)] * 3,
         [(220, 200, 40), (40, 200, 200), (210, 50, 190)], None, [(128, 128, 128)] * 3]
def make_patches(f):
    im = Image.new('RGB', (540, 960)); px_ = im.load()
    for r in range(6):
        for c in range(3):
            for y in range(r * 160, r * 160 + 160):
                for x in range(c * 180, c * 180 + 180):
                    px_[x, y] = PATCH[r][c] if PATCH[r] else (128, 128, 128)
    rng = np.random.default_rng(7); tex = Image.fromarray((rng.random((160, 540)) * 255).astype(np.uint8)).resize((540, 160), Image.NEAREST).filter(ImageFilter.GaussianBlur(2.5))
    im.paste(Image.merge('RGB', [tex] * 3), (0, 640)); im.save(f)
def cen(r, c, w=W, h=H): return ((90 + 180 * c) * w / 540, (80 + 160 * r) * h / 960)
async def still(pg, t=0.5, w=W, h=H):
    d = await P(pg, f'studio.renderStill({{t:{t},W:{w},H:{h}}})'); return np.asarray(Image.open(io.BytesIO(base64.b64decode(d))).convert('RGB')).astype(float)
def px(a, x, y, r=4): return a[int(y) - r:int(y) + r + 1, int(x) - r:int(x) + r + 1].reshape(-1, 3).mean(0)
def pat(a, r, c, rad=4): x, y = cen(r, c, a.shape[1], a.shape[0]); return px(a, x, y, rad)
async def edit(pg, cid, js): await P(pg, f'studio.act(p=>{{const c=studio.find(p,"{cid}").clip; {js} }})'); await pg.wait_for_timeout(50)
async def slide(pg, sel, v): await P(pg, f"(()=>{{const r=document.querySelector('{sel}');r.value={v};r.dispatchEvent(new Event('input'))}})()"); await pg.wait_for_timeout(60)
async def tool(pg, cid, t):
    await P(pg, f'studio.select("{cid}")'); await pg.wait_for_timeout(150); await pg.click(f'#toolbar .tool[data-tool="{t}"]'); await pg.wait_for_timeout(300)
async def shot(pg, name, wait=600): await pg.wait_for_timeout(wait); await pg.screenshot(path=str(SHOTS / name)); log('  shot', name)
async def seek(pg, t): await P(pg, f'studio.player.pause(); studio.player.seek({t}); studio.timeline.setTime({t})'); await pg.wait_for_timeout(300)
async def close(pg): await P(pg, 'document.querySelector(".sh-done")?.click()'); await pg.wait_for_timeout(300)
def frame(f, t, name, fps=30):
    o = OUT / name; subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(f), '-vf', f'select=eq(n\\,{int(round(t * fps))})', '-vsync', '0', '-frames:v', '1', str(o)], check=True)
    return np.asarray(Image.open(o).convert('RGB')).astype(float)
async def export(pg, tag, res=720):
    await pg.click('#exportBtn'); await pg.wait_for_selector('#exRes[data-checked="1"]', timeout=20000); await pg.click(f'#exRes .chipbtn[data-v="{res}"]'); await pg.wait_for_timeout(200)
    await pg.click('#exGo'); await pg.wait_for_selector('#exDone:not([hidden])', timeout=300000)
    async with pg.expect_download() as dl: await pg.click('#exSave')
    d = await dl.value; f = OUT / (tag + '.mp4'); await d.save_as(str(f)); await pg.click('#exBack'); await pg.wait_for_timeout(300); return f
small = lambda a: np.asarray(Image.fromarray(a.astype(np.uint8)).resize((90, 160), Image.BOX)).astype(float)
spread = lambda c: float(max(c) - min(c))

async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    make_patches(OUT / 'patches.png')
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=30000)
        await P(pg, 'studio.home && studio.home.hide && studio.home.hide()'); await pg.wait_for_timeout(300)
        await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[]); p.bg="#000000"})')
        await pg.set_input_files('#fileMedia', [str(OUT / 'patches.png')]); await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===1', timeout=30000); await pg.wait_for_timeout(400)
        cid = await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="main").clips[0].id')
        await edit(pg, cid, 'c.dur=6')
        base = await still(pg)
        ok(all(np.abs(pat(base, r, c) - np.array(PATCH[r][c])).max() < 12 for r in (0, 1, 2, 3) for c in range(3)), 'baseline patches render unchanged (no colour = identity)')

        log('== curves')
        await edit(pg, cid, 'c.color={curves:{m:[[0,0],[.5,.75],[1,1]]}}'); a = await still(pg)
        g0, g1 = pat(base, 0, 1).mean(), pat(a, 0, 1).mean(); ok(g1 > g0 + 45, f'RGB curve lifts mid-grey {g0:.0f} -> {g1:.0f}')
        ok(abs(pat(a, 0, 0).mean() - pat(base, 0, 0).mean()) < 12 and pat(a, 0, 2).mean() < 40, 'curve keeps white and black ends')
        await edit(pg, cid, 'c.color={curves:{r:[[0,0],[.5,.8],[1,1]]}}'); a = await still(pg); c = pat(a, 0, 1)
        ok(c[0] > 180 and abs(c[1] - 128) < 12 and abs(c[2] - 128) < 12, f'red-channel curve only lifts red on grey {c.round()}')
        await edit(pg, cid, 'c.color={curves:{m:[[0,0],[.5,.75],[1,1]],b:[[0,0],[.5,.3],[1,1]]}}'); a = await still(pg); c = pat(a, 0, 1)
        ok(c[0] > 170 and c[2] < c[0] - 25, f'channel curve stacks after the master curve {c.round()}')
        metrics['curves'] = 'ok'

        log('== HSL (8 bands)')
        await edit(pg, cid, 'c.color={hsl:[[0,-1,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]]}'); a = await still(pg)
        ok(spread(pat(a, 1, 0)) < 30, f'red band saturation -100 makes red grey {pat(a, 1, 0).round()}')
        ok(np.abs(pat(a, 1, 2) - pat(base, 1, 2)).max() < 14 and np.abs(pat(a, 1, 1) - pat(base, 1, 1)).max() < 14, 'blue and green untouched by the red band')
        await edit(pg, cid, 'c.color={hsl:[[40,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0]]}'); a = await still(pg); c = pat(a, 1, 0)
        ok(c[1] > pat(base, 1, 0)[1] + 50, f'red band hue +40° turns red towards orange {c.round()}')
        await edit(pg, cid, 'c.color={hsl:[[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,-.8],[0,0,0],[0,0,0]]}'); a = await still(pg)
        ok(pat(a, 1, 2).mean() < pat(base, 1, 2).mean() - 25 and abs(pat(a, 0, 1).mean() - 128) < 10, 'blue band luminance darkens blue only (grey stays)')
        bands_ok = []
        for i, rc in enumerate([(1, 0), None, (3, 0), (1, 1), (3, 1), (1, 2), None, (3, 2)]):
            if rc is None: continue
            h = [[0, 0, 0] for _ in range(8)]; h[i] = [0, -1, 0]
            await edit(pg, cid, f'c.color={{hsl:{json.dumps(h)}}}'); a = await still(pg); bands_ok.append(spread(pat(a, *rc)) < spread(pat(base, *rc)) * .5)
        ok(all(bands_ok), f'each colour band desaturates its own patch ({sum(bands_ok)}/{len(bands_ok)})')

        log('== colour wheels')
        await edit(pg, cid, 'c.color={wheels:{gain:[.25,-.1,-.15,0]}}'); a = await still(pg); w, k = pat(a, 0, 0), pat(a, 0, 2)
        ok(w[0] > w[2] + 25 and spread(k) < 14, f'gain tints highlights {w.round()} not shadows {k.round()}')
        await edit(pg, cid, 'c.color={wheels:{lift:[-.05,0,.15,0]}}'); a = await still(pg); w, k = pat(a, 0, 0), pat(a, 0, 2)
        ok(k[2] > k[0] + 15 and spread(w) < 22, f'lift tints shadows {k.round()} and keeps highlights {w.round()}')
        await edit(pg, cid, 'c.color={wheels:{gamma:[0,0,0,.3]}}'); a = await still(pg)
        ok(pat(a, 0, 1).mean() > 142 and pat(a, 0, 0).mean() > 225 and pat(a, 0, 2).mean() < 50, 'gamma master brightens midtones, keeps ends')

        log('== white balance + picker')
        await edit(pg, cid, 'c.color={wb:{temp:.6,tint:0}}'); a = await still(pg); c = pat(a, 0, 1)
        ok(c[0] > c[2] + 25, f'temperature + warms the picture {c.round()}')
        await edit(pg, cid, 'delete c.color'); await seek(pg, 1)
        cw = await P(pg, '[studio.player.canvas.width, studio.player.canvas.height]'); x, y = cen(2, 1, cw[0], cw[1])
        res = await P(pg, f'(async()=>{{studio.select("{cid}"); return studio.color.pickWhite({x},{y})}})()')
        a = await still(pg); c = pat(a, 2, 1)
        ok(spread(c) < 10, f'picker on a warm-grey patch {res["sample"]} -> neutral {c.round()} (wb {res["wb"]})')
        metrics['wb'] = {'sample': res['sample'], 'after': c.round().tolist(), 'wb': res['wb']}

        log('== LUTs')
        info = await P(pg, '''(async()=>{const m=await import('./js/colorpro.js'); const idx=(await (await fetch('lib/luts/index.json')).json()).luts; const out=[];
          for(const L of idx){ const t=await (await fetch('lib/luts/'+L.id+'.cube')).text(); const c=m.parseCube(t); const d=c.data; let s=0; for(let i=0;i<d.length;i+=37) s=(s*31+d[i])%1000003; out.push([L.id,c.n,d.length,s]); }
          return {n:idx.length, own:m.OWN_LUTS.length, out}})()''')
        ok(info['n'] == 20 and info['own'] == 20, f"{info['n']} own LUT files listed")
        ok(all(o[1] == 17 and o[2] == 17 ** 3 * 4 for o in info['out']), 'every LUT parses as 17³')
        ok(len({o[3] for o in info['out']}) == 20, 'all 20 LUTs are different looks')
        await edit(pg, cid, 'c.color={lut:{id:"bw-classic",amount:1}}'); await P(pg, 'studio.renderStill({t:.5,W:36,H:64})'); a = await still(pg)
        ok(spread(pat(a, 1, 0)) < 12 and spread(pat(a, 1, 2)) < 12, f'B&W LUT makes colours grey {pat(a, 1, 0).round()}')
        await edit(pg, cid, 'c.color.lut.amount=.5'); a2 = await still(pg)
        ok(spread(pat(base, 1, 0)) * .3 < spread(pat(a2, 1, 0)) < spread(pat(base, 1, 0)) * .8, 'LUT strength 50% mixes half')
        diffs = []
        for lid in [o[0] for o in info['out']]:
            await edit(pg, cid, f'c.color={{lut:{{id:"{lid}",amount:1}}}}'); a = await still(pg, .5, 90, 160)
            diffs.append(float(np.abs(a - small(base)).mean()))
        ok(min(diffs) > 2, f'each of the 20 LUTs changes the picture (min mean diff {min(diffs):.1f})')
        metrics['lut_diffs'] = [round(d, 1) for d in diffs]
        # .cube import through the UI: a LUT that swaps red and blue
        n = 9; lines = ['TITLE "Swap RB"', f'LUT_3D_SIZE {n}']
        for bb in range(n):
            for gg in range(n):
                for rr in range(n): lines.append(f'{bb/(n-1):.6f} {gg/(n-1):.6f} {rr/(n-1):.6f}')
        (OUT / 'swap.cube').write_text('\n'.join(lines))
        await edit(pg, cid, 'delete c.color'); await tool(pg, cid, 'colorpro'); await pg.click('.coltabs .chipbtn[data-v="lut"]'); await pg.wait_for_timeout(300)
        ok(await P(pg, 'document.querySelectorAll(".lutgrid .chipbtn").length') == 21, 'LUT grid shows None + 20 own LUTs')
        await shot(pg, 'b10-color-lut.png')
        await pg.set_input_files('#lutFile', str(OUT / 'swap.cube')); await pg.wait_for_function('studio.S.project.luts && Object.keys(studio.S.project.luts).length===1', timeout=10000); await pg.wait_for_timeout(500)
        a = await still(pg); c = pat(a, 1, 0)
        ok(c[2] > 180 and c[0] < 70, f'imported .cube (swap R/B) turns red into blue {c.round()}')
        ok(await P(pg, 'document.querySelectorAll(".lutgrid .chipbtn").length') == 22, 'imported LUT shows in the grid')
        await close(pg)

        log('== adjustment layer (time range)')
        await edit(pg, cid, 'delete c.color'); await seek(pg, 1.2)
        await P(pg, 'studio.select(null)'); await pg.wait_for_timeout(200)
        await pg.click('#toolbar .tool[data-tool="adjlayer"]'); await pg.wait_for_timeout(500)
        aid = await P(pg, 'studio.S.sel'); al = await P(pg, f'JSON.parse(JSON.stringify(studio.find(studio.S.project,"{aid}").clip))')
        ok(al['type'] == 'effect' and al['effect']['kind'] == 'adjust', 'Adjust layer tool adds an adjustment clip on the effects track')
        await pg.click('.coltabs .chipbtn[data-v="light"]'); await slide(pg, '#colSat', 0); await slide(pg, '#colCon', 1)
        await shot(pg, 'b10-adjust-layer.png')
        await close(pg)
        st = al['start']; en = st + 3
        a_in, a_before, a_after = await still(pg, st + 1.5), await still(pg, max(0, st - .6) if st > .7 else 0.05), await still(pg, en + .8)
        ok(spread(pat(a_in, 1, 0)) < 15 and spread(pat(a_in, 1, 2)) < 15, f'inside the layer the picture is black & white {pat(a_in, 1, 0).round()}')
        ok(spread(pat(a_after, 1, 0)) > 120, f'after the layer the colours are back {pat(a_after, 1, 0).round()}')
        if st > .7: ok(spread(pat(a_before, 1, 0)) > 120, 'before the layer the colours are normal')
        # a text above the picture is also changed by the layer
        await edit(pg, aid, 'c.effect.amount=.5'); a = await still(pg, st + 1.5)
        ok(30 < spread(pat(a, 1, 0)) < 150, 'layer intensity 50% = half the change')
        await edit(pg, aid, 'c.effect.amount=1; c.color={}; c.effects=[{id:"thermal",amount:1}]'); a = await still(pg, st + 1.5); a2 = await still(pg, en + .8)
        ok(float(np.abs(small(a) - small(base)).mean()) > 25 and float(np.abs(small(a2) - small(base)).mean()) < 6, 'effects on an adjustment layer change everything under it, only in its range')
        await edit(pg, aid, 'delete c.effects; c.filter={id:"bw",amount:1}'); a = await still(pg, st + 1.5)
        ok(spread(pat(a, 1, 0)) < 15, 'a filter on the adjustment layer applies to the picture under it')
        await edit(pg, aid, 'delete c.filter')
        await edit(pg, aid, 'delete c.effects; c.color={vig:.9}'); a = await still(pg, st + 1.5)
        ok(px(a, 8, 8).mean() < px(base, 8, 8).mean() - 40, 'vignette on the adjustment layer darkens the corners')
        await edit(pg, aid, 'c.adjust={vignette:0}; delete c.color; c.keyframes={adjVignette:[{t:0,v:0,ease:"linear"},{t:3,v:1,ease:"linear"}]}')
        k0, k1 = (await still(pg, st + .05))[8, 8].mean(), (await still(pg, st + 2.9))[8, 8].mean()
        ok(k1 < k0 - 40, f'keyframed vignette on the layer animates ({k0:.0f} -> {k1:.0f})')
        await P(pg, f'studio.act(p=>{{for(const t of p.tracks) t.clips=t.clips.filter(c=>c.id!=="{aid}")}})')

        log('== vignette / grain / sharpen per clip (+ keyframes)')
        await edit(pg, cid, 'c.keyframes={adjVignette:[{t:0,v:0,ease:"linear"},{t:4,v:1,ease:"linear"}]}')
        v0, v1 = await still(pg, .05), await still(pg, 4)
        ok(px(v1, 10, 10).mean() < px(v0, 10, 10).mean() - 50 and abs(pat(v1, 2, 1).mean() - pat(v0, 2, 1).mean()) < 25, 'clip vignette keyframes: corners darken over time, centre stays')
        await edit(pg, cid, 'c.keyframes={}; c.adjust={grain:.8}'); a = await still(pg)
        g = a[int(cen(5, 1)[1]) - 20:int(cen(5, 1)[1]) + 20, int(cen(5, 1)[0]) - 20:int(cen(5, 1)[0]) + 20].std()
        g0 = base[int(cen(5, 1)[1]) - 20:int(cen(5, 1)[1]) + 20, int(cen(5, 1)[0]) - 20:int(cen(5, 1)[0]) + 20].std()
        ok(g > g0 + 4, f'grain adds noise on a flat area (std {g0:.1f} -> {g:.1f})')
        await edit(pg, cid, 'c.adjust={sharpen:1}'); a = await still(pg)
        y = int(cen(4, 1)[1]); hf = lambda im: (lambda g: float((4 * g[1:-1, 1:-1] - g[:-2, 1:-1] - g[2:, 1:-1] - g[1:-1, :-2] - g[1:-1, 2:]).var()))(im[y - 30:y + 30, 20:340].mean(2))
        ok(hf(a) > hf(base) * 1.2, f'sharpen raises fine detail ({hf(base):.2f} -> {hf(a):.2f})')
        await edit(pg, cid, 'c.adjust={}; c.keyframes={}')

        log('== Colour sheet UI')
        await seek(pg, 1); await tool(pg, cid, 'colorpro')
        ok(await P(pg, '!!document.querySelector("#colPane")'), 'Colour tool opens the Colour pro sheet')
        await pg.click('.coltabs .chipbtn[data-v="curves"]'); await pg.wait_for_timeout(300)
        bx = await pg.locator('#curveCv').bounding_box()
        await pg.mouse.move(bx['x'] + bx['width'] * .5, bx['y'] + bx['height'] * .5); await pg.mouse.down(); await pg.mouse.move(bx['x'] + bx['width'] * .5, bx['y'] + bx['height'] * .25, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(200)
        cm = await P(pg, f'JSON.parse(JSON.stringify(studio.find(studio.S.project,"{cid}").clip.color?.curves?.m||null))')
        ok(cm and len(cm) == 3 and cm[1][1] > .65, f'tap + drag on the curve adds a point {cm}')
        await pg.click('.curvech .chipbtn[data-v="b"]'); await pg.wait_for_timeout(100)
        await pg.mouse.click(bx['x'] + bx['width'] * .5, bx['y'] + bx['height'] * .7); await pg.wait_for_timeout(200)
        cb = await P(pg, f'JSON.parse(JSON.stringify(studio.find(studio.S.project,"{cid}").clip.color?.curves?.b||null))')
        ok(cb and len(cb) == 3, 'blue channel tab edits its own curve')
        await shot(pg, 'b10-color-curves.png')
        await pg.mouse.click(bx['x'] + bx['width'] * .5, bx['y'] + bx['height'] * .7); await pg.wait_for_timeout(60); await pg.mouse.click(bx['x'] + bx['width'] * .5, bx['y'] + bx['height'] * .7); await pg.wait_for_timeout(200)
        cb = await P(pg, f'JSON.parse(JSON.stringify(studio.find(studio.S.project,"{cid}").clip.color?.curves?.b||null))')
        ok(not cb or len(cb) == 2, 'double-tap removes a curve point')
        await pg.click('.curvepre .chipbtn[data-v="scurve"]'); await pg.wait_for_timeout(100)
        ok(len(await P(pg, f'studio.find(studio.S.project,"{cid}").clip.color.curves.m')) == 4, 'curve preset applies')
        await pg.click('.coltabs .chipbtn[data-v="hsl"]'); await pg.wait_for_timeout(200)
        ok(await P(pg, 'document.querySelectorAll(".hslbands .chipbtn").length') == 8, 'HSL shows 8 colour bands')
        await pg.click('.hslbands .chipbtn[data-v="5"]'); await slide(pg, '#hslSat', -.7); await slide(pg, '#hslHue', 20)
        hs = await P(pg, f'studio.find(studio.S.project,"{cid}").clip.color.hsl[5]')
        ok(abs(hs[1] + .7) < .01 and hs[0] == 20, f'HSL sliders set the blue band {hs}')
        await shot(pg, 'b10-color-hsl.png')
        await pg.click('.coltabs .chipbtn[data-v="wheels"]'); await pg.wait_for_timeout(200)
        wb_ = await pg.locator('#wheel-gain').bounding_box()
        await pg.mouse.move(wb_['x'] + wb_['width'] / 2, wb_['y'] + wb_['height'] / 2); await pg.mouse.down(); await pg.mouse.move(wb_['x'] + wb_['width'] / 2, wb_['y'] + wb_['height'] * .1, steps=5); await pg.mouse.up()
        gw = await P(pg, f'studio.find(studio.S.project,"{cid}").clip.color.wheels.gain')
        ok(gw[0] > .2 and gw[1] < 0 and gw[2] < 0, f'dragging the gain wheel up pushes highlights red {gw}')
        await slide(pg, '#wheelM-lift', .1)
        await shot(pg, 'b10-color-wheels.png')
        await pg.click('.coltabs .chipbtn[data-v="wb"]'); await pg.wait_for_timeout(200); await slide(pg, '#wbTemp', .4)
        ok(abs((await P(pg, f'studio.find(studio.S.project,"{cid}").clip.color.wb.temp')) - .4) < .01, 'temperature slider')
        await pg.click('#wbPick'); await pg.wait_for_timeout(200)
        cvb = await pg.locator('#preview').first.bounding_box()
        await pg.mouse.click(cvb['x'] + cvb['width'] * .5, cvb['y'] + cvb['height'] * (80 + 320) / 960); await pg.wait_for_timeout(1500)
        t2 = await P(pg, f'studio.find(studio.S.project,"{cid}").clip.color.wb')
        ok(abs(t2['temp'] - .4) > .05, f'tapping the preview with the picker sets white balance {t2}')
        await shot(pg, 'b10-color-wb.png')
        await pg.click('.coltabs .chipbtn[data-v="detail"]'); await pg.wait_for_timeout(200)
        await slide(pg, '#detVig', .3); await pg.click('#detVigKf'); await seek(pg, 3); await slide(pg, '#detVig', .9)
        kv = await P(pg, f'JSON.parse(JSON.stringify(studio.find(studio.S.project,"{cid}").clip.keyframes.adjVignette||[]))')
        ok(len(kv) == 2 and abs(kv[0]['v'] - .3) < .01 and abs(kv[1]['v'] - .9) < .01, f'◆ + slider make vignette keyframes {[(k["t"], k["v"]) for k in kv]}')
        await shot(pg, 'b10-color-detail.png')
        await pg.click('#colProReset'); await pg.wait_for_timeout(100)
        ok(await P(pg, f'!studio.find(studio.S.project,"{cid}").clip.color'), 'Reset colour clears the grade')
        await close(pg)

        log('== preview == export')
        await edit(pg, cid, 'c.keyframes={}; c.adjust={vignette:.4}; c.color={curves:{m:[[0,0],[.3,.22],[.7,.8],[1,1]]},hsl:[[0,0,0],[0,0,0],[0,0,0],[0,0,0],[0,0,0],[20,-.4,0],[0,0,0],[0,0,0]],wheels:{gain:[.08,0,-.06,0]},wb:{temp:-.2,tint:.1},lut:{id:"golden-hour",amount:.7}}')
        await P(pg, 'studio.select(null)'); await seek(pg, 3.5); await P(pg, 'studio.select(null)'); await pg.click('#toolbar .tool[data-tool="adjlayer"]'); await pg.wait_for_timeout(400); await close(pg)
        aid = await P(pg, 'studio.S.sel'); await edit(pg, aid, 'c.color={sat:.4,lut:{id:"cinema",amount:1}}; c.keyframes={adjGrain:[{t:0,v:0,ease:"linear"}]}')
        await edit(pg, cid, 'c.dur=6'); await P(pg, 'studio.select(null)')
        await shot(pg, 'b10-color-preview.png')
        f = await export(pg, 'color')
        worst = 0
        for t in (1.0, 3.0, 4.5, 5.5):
            e = small(frame(f, t, f'c{t}.png')); s_ = await still(pg, t, 90, 160); d = float(np.abs(e - s_).mean()); worst = max(worst, d)
            ok(d < 10, f'preview == export at {t}s (mean diff {d:.1f})')
        metrics['parity_worst'] = round(worst, 2)
        ok(not errs, f'no page errors {errs[:3]}')
        await b.close()
    (ROOT / 'tests/color-metrics.json').write_text(json.dumps(metrics, indent=1))
    log('FAILS:', fails) if fails else log('ALL OK'); sys.exit(1 if fails else 0)
asyncio.run(run())

"""Batch 11 part 3 — overlay library (176 procedural elements).   python3 tests/test_elements.py [shots_dir]"""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, math, io, base64
from pathlib import Path
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-el-')); fails = []; T0 = time.time(); PORT = 8800; metrics = {}
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
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=30000)
        await P(pg, 'studio.home && studio.home.hide && studio.home.hide()'); await pg.wait_for_timeout(300)
        await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[]); p.bg="#000000"; p.perf={proxy:false}})')

        log('== library')
        info = await P(pg, """(async()=>{ const m = await import('./js/elements.js'); const cv = new OffscreenCanvas(72, 128), x = cv.getContext('2d');
          const px = () => x.getImageData(0, 0, 72, 128).data; const out = { n: m.ELEMENTS.length, cats: m.ELEMENT_CATS.length, ids: new Set(m.ELEMENTS.map(e => e.id)).size, empty: [], still: [], nondet: [], green: 0, keyed: 0, screen: 0, perCat: {} };
          for (const e of m.ELEMENTS) { out.perCat[e.cat] = (out.perCat[e.cat] || 0) + 1; if (e.blend === 'screen') out.screen++; if (e.cat === 'green') { out.green++; if (e.key && e.key.on) out.keyed++; }
            const sig = t => { m.drawElement(x, 72, 128, e.id, t, e.dur); const d = px(); let v = 0; for (let i = 0; i < d.length; i += 4) { const l = d[i] + d[i + 1] + d[i + 2]; if (d[i + 3] > 8 && (e.blend !== 'screen' || l > 24)) v++; } return { d: new Uint8Array(d), v }; }; const md = (p, q) => { let s = 0; for (let i = 0; i < p.length; i++) s += Math.abs(p[i] - q[i]); return s / p.length; };
            const a = sig(e.dur * .3), b = sig(e.dur * .7), a2 = sig(e.dur * .3); if (a.v < 3 && b.v < 3) out.empty.push(e.id); if (md(a.d, b.d) < 0.05) out.still.push(e.id); if (md(a.d, a2.d) > 0.5) out.nondet.push(e.id); }
          return out; })()""")
        log('  library', {k: v for k, v in info.items() if k != 'perCat'}); log('  per category', info['perCat'])
        ok(info['n'] >= 150 and info['ids'] == info['n'], f"{info['n']} elements, unique ids")
        ok(info['cats'] == 16 and all(info['perCat'].get(c, 0) >= 6 for c in ['leak','bokeh','smoke','dust','burn','sparkle','rain','snow','confetti','frame','countdown','green']), '16 groups incl. light leaks, bokeh, smoke, dust, film burns, sparkles, rain, snow, confetti, frames, countdowns, green screen')
        ok(not info['empty'], f"every element draws something {info['empty'][:5]}")
        ok(len(info['still']) == 0, f"every element moves over time {info['still'][:5]}")
        ok(not info['nondet'], f"deterministic (same time = same frame) {info['nondet'][:5]}")
        ok(info['keyed'] == info['green'] and info['green'] >= 30, f"{info['green']} green-screen elements come with the colour key on")
        ok(info['screen'] >= 80, f"{info['screen']} light elements preset to Screen blend")
        metrics['library'] = {k: info[k] for k in ['n', 'cats', 'green', 'screen', 'perCat']}

        log('== sheet + add')
        await P(pg, 'document.querySelector("#fileMedia").value=""'); await pg.set_input_files('#fileMedia', [str(OUT / 'bg.jpg')])
        await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===1', timeout=30000); await pg.wait_for_timeout(500)
        await P(pg, 'studio.select(null)'); await seek(pg, 0.5); await tool(pg, 'elements')
        await pg.wait_for_selector('#elGrid .eltile'); await pg.wait_for_timeout(1200)
        n = await P(pg, 'document.querySelectorAll("#elGrid .eltile").length'); ok(n == info['perCat']['leak'], f'sheet shows the light-leak group ({n} tiles)')
        drawn = await P(pg, '[...document.querySelectorAll("#elGrid canvas")].filter(c=>{const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data; let v=0; for(let i=0;i<d.length;i+=16) v+=d[i]+d[i+1]; return v>0}).length')
        ok(drawn >= n - 1, f'tiles are drawn ({drawn}/{n})'); await shot(pg, 'b11-elements.png')
        await pg.click('#elGrid .eltile[data-v="leak-1"]'); await pg.wait_for_timeout(600)
        c1 = await P(pg, '(()=>{const c=studio.S.project.tracks.flatMap(t=>t.clips).find(c=>c.type==="element"); const t=studio.S.project.tracks.find(t=>t.clips.includes(c)); return c&&{kind:t.kind, blend:c.blend, id:c.element.id, dur:c.dur}})()')
        ok(c1 and c1['kind'] == 'overlay' and c1['blend'] == 'screen' and c1['id'] == 'leak-1', f'tap adds it to the Overlay track with Screen blend {c1}')
        ok(await P(pg, '!document.querySelector("#elBlend").hidden && document.querySelectorAll("#elBlend .chipbtn").length>=10'), 'blend preset can be changed right there')
        await pg.click('.elcats .chipbtn[data-v="green"]'); await pg.wait_for_timeout(1500); await shot(pg, 'b11-elements-green.png', 200)
        await pg.click('#elGrid .eltile[data-v="green-1"]'); await pg.wait_for_timeout(500)
        await pg.click('.elcats .chipbtn[data-v="confetti"]'); await pg.wait_for_timeout(400); await pg.click('#elGrid .eltile[data-v="confetti-1"]'); await pg.wait_for_timeout(500)
        await close(pg)
        kinds = await P(pg, 'studio.S.project.tracks.flatMap(t=>t.clips).filter(c=>c.type==="element").map(c=>[c.element.id, !!(c.key&&c.key.on), c.blend||"normal", c.start])')
        log('  elements', kinds); ok(len(kinds) == 3 and kinds[1][1], 'subscribe button added with the key on')
        await P(pg, 'studio.act(p=>{for(const c of p.tracks.flatMap(t=>t.clips)) if(c.type==="element") c.start=0.2; p.tracks.forEach(t=>t.clips.sort((a,b)=>a.start-b.start))})')
        await seek(pg, 2.0, 700); await shot(pg, 'b11-elements-preview.png', 200)
        ok(await P(pg, '!!document.querySelector(".clip .ctext") && [...document.querySelectorAll(".clip .ctext")].some(e=>e.textContent.includes("✦"))'), 'timeline labels element clips')
        ok(not await P(pg, '[...document.querySelectorAll(".clip .spd")].some(e=>e.textContent==="missing")'), 'element clips are not flagged as missing media')

        log('== look + preview == export')
        st = await still(pg, 2.0, 180, 320); gfrac = float(((st[..., 1] > 200) & (st[..., 0] < 80) & (st[..., 2] < 80)).mean())
        ok(gfrac < 0.01, f'green background keyed out ({gfrac * 100:.2f}% pure green left)')
        hid = await P(pg, '(async()=>{const ids=[]; studio.act(p=>{for(const c of p.tracks.flatMap(t=>t.clips)) if(c.type==="element"){c._o=c.transform.opacity; c.transform.opacity=0}}); return 1})()')
        base = await still(pg, 2.0, 180, 320); await P(pg, 'studio.S.project && studio.act(p=>{for(const c of p.tracks.flatMap(t=>t.clips)) if(c.type==="element"){c.transform.opacity=c._o??1; delete c._o}})')
        dl = float(st.mean() - base.mean()); ok(dl > 4, f'screen-blended leak + elements change the picture (+{dl:.1f} brightness)')
        f = await export(pg, 'el', 720); D = []
        for t in [0.6, 1.5, 2.6]:
            ex = frame(f, t, f'e{t}.png', (180, 320)); pv = await still(pg, t, 180, 320); D.append(float(np.abs(small(ex) - small(pv)).mean()))
        log('  preview vs export', D); ok(max(D) < 10, f'preview == export at 90x160 (max {max(D):.1f})')
        metrics['parity'] = [round(d, 2) for d in D]; metrics['keyed_green_left'] = round(gfrac, 4)
        real = [e for e in errs if 'favicon' not in e]; ok(not real, f'no page errors {real[:3]}')
        await b.close()
    log('METRICS', json.dumps(metrics)); (ROOT / 'tests' / 'elements-metrics.json').write_text(json.dumps(metrics, indent=1))
    log(f'RESULT: {"PASS" if not fails else "FAIL"} ({len(fails)} failures) in {time.time() - T0:.0f}s')
    for m in fails: log('  -', m)
    sys.exit(1 if fails else 0)
asyncio.run(run())

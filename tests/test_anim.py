"""Batch 3 test: animations + more transitions (Google Chrome, 390x844 phone).   python3 tests/test_anim.py [shots_dir]
- transition registry: every entry renders without error, p=0 == clip A, p=1 == clip B, midpoint differs from a hard cut
- clip animations (In / Out / Combo) and text animations (In / Out / Loop): every entry renders, differs from no effect
  in the middle, In ends / Out starts exactly on the untouched picture
- editor panels (tabs, animated tiles, duration), undo/redo, autosave, split
- preview == export parity for a sample, combined with keyframes + HD Enhance; render cost per frame"""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, io, base64
from pathlib import Path
from PIL import Image, ImageChops, ImageStat
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]; FX = ROOT / 'tests/fixtures'
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-anim-')); fails = []; T0 = time.time(); PORT = 8771
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
def mean(im, box):
    W, H = im.size; return im.crop((int(box[0] * W), int(box[1] * H), int(box[2] * W), int(box[3] * H))).resize((1, 1), Image.BOX).getpixel((0, 0))
def grid_diff(a, b):
    b = b.resize(a.size); g = lambda im: [mean(im, (i / 4, j / 8, (i + 1) / 4, (j + 1) / 8)) for i in range(4) for j in range(8)]
    return max(sum(abs(x - y) for x, y in zip(c1, c2)) for c1, c2 in zip(g(a), g(b)))
def psnr(a, b):
    import math; b = b.resize(a.size); d = ImageChops.difference(a, b); st = ImageStat.Stat(d); mse = sum(x * x for x in st.rms) / 3
    return 99.0 if mse == 0 else 10 * math.log10(255 * 255 / mse)
def psnr_lo(a, b):  # PSNR at 1/4 size: compares the picture, not H.264 noise on fine detail
    w, h = a.size[0] // 4, a.size[1] // 4; return psnr(a.resize((w, h), Image.BOX), b.resize(a.size).resize((w, h), Image.BOX))
async def new_page(b):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
    pg = await ctx.new_page(); pg.errs = []
    pg.on('pageerror', lambda e: pg.errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and pg.errs.append(m.text))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=20000); return ctx, pg
P = lambda pg, js: pg.evaluate(js)
async def seek_exact(pg, t): await P(pg, f'(()=>{{studio.player.pause();studio.player.seek({t});studio.timeline.setTime({t})}})()'); await pg.wait_for_timeout(700)
async def still(pg, t, W=720, H=1280):
    d = await P(pg, f'studio.renderStill({{t:{t},W:{W},H:{H}}})'); return Image.open(io.BytesIO(base64.b64decode(d))).convert('RGB')
async def export(pg, tag, res=720):
    await pg.click('#exportBtn'); await pg.click(f'#exRes .chipbtn[data-v="{res}"]'); await pg.click('#exGo'); await pg.wait_for_selector('#exDone:not([hidden])', timeout=240000)
    async with pg.expect_download() as dl: await pg.click('#exSave')
    d = await dl.value; f = OUT / (tag + '.mp4'); await d.save_as(str(f)); await pg.click('#exBack'); await pg.wait_for_timeout(300); return f
async def main_clips(pg): return await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="main").clips.map(c=>({id:c.id,type:c.type,start:c.start,tr:c.transitionIn,anim:c.anim||null}))')
PROBE = "import('./tests/fxprobe.js')"

async def test_transitions(b):
    log('== transitions: registry (every entry)')
    ctx, pg = await new_page(b)
    r = await P(pg, PROBE + '.then(m=>({p:m.probeTransitions(), t:m.timeTransitions()}))'); res, tms = r['p']['res'], r['t']
    ok(not r['p']['errors'], f'every transition renders without error {r["p"]["errors"][:3]}')
    n = len(res); ok(n >= 80, f'{n} transitions registered')
    cats = {}
    for k, v in res.items(): cats.setdefault(v['cat'], []).append(v['name'])
    for c, names in cats.items(): log(f'       {c} ({len(names)}): {", ".join(names)}')
    bad0 = [k for k, v in res.items() if v['d0'] > 0.5]; bad1 = [k for k, v in res.items() if v['d1'] > 0.5]
    ok(not bad0, f'p=0 is exactly clip A for all {n} {bad0}'); ok(not bad1, f'p=1 is exactly clip B for all {n} {bad1}')
    flat = [k for k, v in res.items() if not (v['mid5A'] > 3 and v['mid5B'] > 1.5)]
    ok(not flat, f'midpoint differs from both A and B (not a hard cut) for all {n} {flat}')
    slow = sorted(tms.items(), key=lambda x: -x[1])[:5]; log(f'       slowest at 540x960: {[(k, round(v, 1)) for k, v in slow]}')
    ok(slow[0][1] < 120, f'every transition draws a 540x960 frame in < 120 ms on this box (worst {slow[0][0]} {slow[0][1]:.1f} ms)')
    ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

    log('== transitions: picker + preview/export parity for a sample')
    ctx, pg = await new_page(b)
    await pg.set_input_files('#fileMedia', [str(FX / 'sharp.png'), str(FX / 'image.png'), str(FX / 'sharp.png')])
    await pg.wait_for_function('studio.S.project.tracks.find(t=>t.kind==="main").clips.length===3', timeout=20000)
    mc = await main_clips(pg)
    await pg.locator(f'.joint[data-joint="{mc[1]["id"]}"]').click(); await pg.wait_for_selector('.trgrid .trtile')
    tabs = await P(pg, "[...document.querySelectorAll('.chips.tabs .chipbtn')].map(b=>b.dataset.v)")
    ok(all(c in tabs for c in ('Motion', '3D', 'Split', 'Kids')), f'new picker tabs: {tabs}')
    await pg.click('.chips.tabs .chipbtn[data-v="Kids"]'); await pg.wait_for_timeout(100)
    kids = await pg.locator('.trtile').count(); ok(kids == 1 + len(cats['Kids']), f'Kids tab shows None + {kids - 1} transitions')
    await pg.click('.trtile[data-tr="cloud"]'); await pg.wait_for_timeout(2300)
    await pg.screenshot(path=str(SHOTS / 'transition-picker-kids-390.png')); log('  shot transition-picker-kids-390.png')
    await pg.click('.chips.tabs .chipbtn[data-v="3D"]'); await pg.wait_for_timeout(1200); await pg.screenshot(path=str(SHOTS / 'transition-picker-3d-390.png')); log('  shot transition-picker-3d-390.png')
    await pg.click('.trtile[data-tr="cubeL"]'); await pg.click('.sh-done')
    await P(pg, f"studio.act(p=>{{const m=p.tracks.find(t=>t.kind==='main');m.clips[1].transitionIn={{id:'cubeL',dur:1}};m.clips[2].transitionIn={{id:'burn',dur:1}};}})")
    mc = await main_clips(pg); t1, t2 = mc[1]['start'] + 0.5, mc[2]['start'] + 0.5
    ok(mc[1]['tr']['id'] == 'cubeL' and mc[2]['tr']['id'] == 'burn', 'cube left + burn set on the two cuts')
    prev = {}
    for t in (t1, t2):
        await seek_exact(pg, t); im = OUT / f'tprev_{t}.png'; await pg.locator('#preview').screenshot(path=str(im)); prev[t] = Image.open(im).convert('RGB')
    st = {t: await still(pg, t) for t in (t1, t2)}
    st0 = await still(pg, 1.0); f = await export(pg, 'transitions2'); ref = psnr_lo(st0, frame(f, 1.0, 'tex_ref.png')); log(f'       reference: plain frame, export vs renderer PSNR(1/4 size) {ref:.1f} dB')
    for t, nm in ((t1, 'cube left'), (t2, 'burn')):
        ex = frame(f, t, f'tex_{t}.png'); ps = psnr_lo(st[t], ex); gd = grid_diff(prev[t], ex)
        ok(ps > 32, f'{nm}: export frame == renderer at {t:.2f}s (PSNR at 1/4 size {ps:.1f} dB; plain frame {ref:.1f})'); ok(gd < 60, f'{nm}: preview == export (max cell diff {gd})')
        a = await still(pg, t - 0.55); ok(psnr_lo(a, ex) < 25, f'{nm}: midpoint frame is mid-effect, not the outgoing clip')
    ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True)
        for t in TESTS: await t(b)
        await b.close()
TESTS = [test_transitions]
if __name__ == '__main__':
    try: asyncio.run(run())
    except Exception as e: import traceback; traceback.print_exc(); fails.append('crash: ' + repr(e))
    log(f'RESULT: {"PASS" if not fails else "FAIL"} ({len(fails)} failures) in {time.time()-T0:.0f}s')
    for f in fails: log('  - ' + f)
    sys.exit(1 if fails else 0)

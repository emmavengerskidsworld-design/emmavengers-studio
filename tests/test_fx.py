"""Transitions + keyframes test (Google Chrome, 390x844 phone).   python3 tests/test_fx.py [shots_dir]
- all 40 transitions: p=0 looks like clip A, p=1 like clip B (registry contract)
- UI: joint button -> picker (tabs, animated tiles, duration, apply to all, remove), project duration shrinks
- export: frames at transition midpoints (fade = mix, slide = half/half), durations, audio crossfade (-3 dB at middle)
- keyframes: diamond add, auto-keyframe from Adjust, prev/next, easing curve, delete, Ken Burns, undo, reload
- preview/export parity at transition and keyframe midpoints"""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, re, time, math
from pathlib import Path
from PIL import Image
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]; FX = ROOT / 'tests/fixtures'
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-fx-')); fails = []; T0 = time.time()
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
    W, H = im.size; c = im.crop((int(box[0] * W), int(box[1] * H), int(box[2] * W), int(box[3] * H))).resize((1, 1), Image.BOX).getpixel((0, 0)); return c
near = lambda c, ref, tol=30: all(abs(a - b) <= tol for a, b in zip(c, ref))
def duration(f): return float(json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_format', '-of', 'json', str(f)], capture_output=True, text=True).stdout)['format']['duration'])
def rms_db(f, t, d=0.1):
    r = subprocess.run(['ffmpeg', '-ss', f'{t}', '-t', f'{d}', '-i', str(f), '-vn', '-af', 'astats=metadata=0', '-f', 'null', '-'], capture_output=True, text=True)
    m = re.findall(r'RMS level dB: ([-\d.inf]+)', r.stderr); v = m[-1] if m else '-inf'; return -200.0 if 'inf' in v else float(v)
def grid_diff(a, b):
    b = b.resize(a.size); g = lambda im: [mean(im, (i / 4, j / 8, (i + 1) / 4, (j + 1) / 8)) for i in range(4) for j in range(8)]
    return max(sum(abs(x - y) for x, y in zip(c1, c2)) for c1, c2 in zip(g(a), g(b)))
def red_centroid(im):
    W, H = im.size; xs = [x for y in range(0, H, 4) for x in range(0, W, 4) if (lambda c: c[0] > 90 and c[0] > c[2] - 20 and c[1] < 60)(im.getpixel((x, y)))]
    return (sum(xs) / len(xs) / W if xs else -1), len(xs)
async def new_page(b):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
    await ctx.add_init_script("addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='#toast,#fsBtn{visibility:hidden!important}';document.head.append(s)})")  # B16: toasts / overlay buttons never in preview captures
    pg = await ctx.new_page(); pg.errs = []
    pg.on('pageerror', lambda e: pg.errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and pg.errs.append(m.text))
    await pg.goto('http://127.0.0.1:8751/'); await pg.wait_for_function('window.studio && studio.ready', timeout=20000); return ctx, pg
P = lambda pg, js: pg.evaluate(js)
async def set_time(pg, t): await P(pg, f'(()=>{{const tl=studio.timeline;tl.scroll.scrollLeft=Math.round({t}*tl.pps)}})()'); await pg.wait_for_timeout(250); return await P(pg, 'studio.player.t')
async def seek_exact(pg, t): await P(pg, f'(()=>{{studio.player.pause();studio.player.seek({t});studio.timeline.setTime({t})}})()'); await pg.wait_for_timeout(700)
async def export(pg, tag, res=720):
    await pg.click('#exportBtn'); await pg.click(f'#exRes .chipbtn[data-v="{res}"]'); await pg.click('#exGo'); await pg.wait_for_selector('#exDone:not([hidden])', timeout=180000)
    info = await P(pg, '({dur:studioLastExport.duration,bitrate:studioLastExport.bitrate,codec:studioLastExport.codec})')
    async with pg.expect_download() as dl: await pg.click('#exSave')
    d = await dl.value; f = OUT / (tag + '.mp4'); await d.save_as(str(f)); await pg.click('#exBack'); await pg.wait_for_timeout(300); return f, info
async def main_clips(pg): return await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="main").clips.map(c=>({id:c.id,type:c.type,start:c.start,tr:c.transitionIn}))')
async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', 8751), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True)
        log('== transition registry contract')
        ctx, pg = await new_page(b)
        res = await P(pg, 'studio.testTransitions([0,0.5,1])'); n = len(res)
        ok(n >= 40, f'{n} transitions registered')
        bad0 = [k for k, v in res.items() if not near(v[0], (255, 0, 0), 6)]; bad1 = [k for k, v in res.items() if not near(v[2], (0, 0, 255), 6)]
        ok(not bad0, f'every transition starts exactly on clip A {bad0}'); ok(not bad1, f'every transition ends exactly on clip B {bad1}')
        mid_diff = [k for k, v in res.items() if not near(v[1], (255, 0, 0), 20) and not near(v[1], (0, 0, 255), 20)]
        ok(len(mid_diff) >= 30, f'{len(mid_diff)}/{n} transitions show a blend/effect at the midpoint (solid-colour test; pixelate/glitch keep one side)')
        stuck = [k for k, v in res.items() if near(v[1], (255, 0, 0), 4)]; ok(len(stuck) <= 2, f'midpoint has moved away from A for nearly all ({stuck})')

        log('== transitions in the editor + export')
        await pg.set_input_files('#fileMedia', [str(FX / 'red.png'), str(FX / 'blue.png'), str(FX / 'green.mp4')])
        await pg.wait_for_function('studio.S.project.tracks.find(t=>t.kind==="main").clips.length===3', timeout=20000)
        await pg.wait_for_function("[...studio.media.values()].every(m=>m.type!=='video'||m.thumbBitmap)", timeout=20000)
        mc = await main_clips(pg); ok(await P(pg, 'studio.projectDuration(studio.S.project)') == 9, 'three 3 s clips = 9 s')
        joints = await pg.locator('.joint').count(); ok(joints == 2, f'two joint buttons between the clips ({joints})')
        await pg.locator(f'.joint[data-joint="{mc[1]["id"]}"]').click(); await pg.wait_for_selector('.trgrid .trtile')
        tabs = await pg.locator('.chips.tabs .chipbtn').count(); ok(tabs >= 10, f'picker has {tabs} category tabs')
        await pg.click('.trtile[data-tr="fade"]'); await P(pg, "(()=>{const r=document.querySelector('#trDur');r.value=1;r.dispatchEvent(new Event('input'))})()")
        await pg.wait_for_timeout(2300)  # let the import toast go away
        await pg.wait_for_function('(performance.now() % 1950) > 700 && (performance.now() % 1950) < 760', polling=5)  # thumbnails mid-way
        await pg.wait_for_timeout(30)
        await pg.screenshot(path=str(SHOTS / 'transition-picker-390.png')); log('  shot transition-picker-390.png')
        anim = await P(pg, "(async()=>{const c=document.querySelector('.trtile[data-tr=\"fade\"] canvas');const a=c.toDataURL();await new Promise(r=>setTimeout(r,350));return a!==c.toDataURL()})()")
        ok(anim, 'picker thumbnails are animated')
        await pg.click('.sh-done')
        mc = await main_clips(pg); ok(mc[1]['tr'] == {'id': 'fade', 'dur': 1}, f'fade 1.0 s set on cut 1 ({mc[1]["tr"]})')
        ok(abs(await P(pg, 'studio.projectDuration(studio.S.project)') - 8) < 1e-6 and abs(mc[1]['start'] - 2) < 1e-6, 'clips overlap by the transition: 8 s total, clip 2 starts at 2 s')
        await pg.locator(f'.joint[data-joint="{mc[2]["id"]}"]').click(); await pg.wait_for_selector('.trgrid .trtile')
        await pg.click('.chips.tabs .chipbtn[data-v="Slide"]'); await pg.click('.trtile[data-tr="slideL"]')
        await P(pg, "(()=>{const r=document.querySelector('#trDur');r.value=1;r.dispatchEvent(new Event('input'))})()"); await pg.click('.sh-done')
        D = await P(pg, 'studio.projectDuration(studio.S.project)'); ok(abs(D - 7) < 1e-6, f'second transition (slide left 1 s): total {D} s')
        ok(await pg.locator('.joint.on').count() == 2, 'both joints show an active transition')
        # parity snapshots from the preview
        prev = {}
        for t in (2.5, 4.5):
            await seek_exact(pg, t); im = OUT / f'prev_{t}.png'; await pg.locator('#preview').screenshot(path=str(im)); prev[t] = Image.open(im).convert('RGB')
        f, info = await export(pg, 'transitions')
        dd = duration(f); ok(abs(dd - 7) < 0.15, f'export duration {dd:.2f}s ≈ 7 s')
        f1, f25, f35, f45, f6 = (frame(f, t, f'tr_{t}.png') for t in (1.0, 2.5, 3.5, 4.5, 6.0))
        ok(near(mean(f1, (.2, .2, .8, .8)), (255, 0, 0), 25) and near(mean(f35, (.2, .2, .8, .8)), (0, 0, 255), 25) and near(mean(f6, (.2, .2, .8, .8)), (0, 255, 0), 30), 'outside transitions each clip shows plainly (red / blue / green)')
        m = mean(f25, (.2, .2, .8, .8)); ok(near(m, (128, 0, 128), 30), f'fade midpoint is a red-blue mix {m}')
        l, r_ = mean(f45, (.05, .2, .45, .8)), mean(f45, (.55, .2, .95, .8)); ok(near(l, (0, 0, 255), 30) and near(r_, (0, 255, 0), 35), f'slide-left midpoint: left half blue {l}, right half green {r_}')
        for t, im in prev.items(): dif = grid_diff(im, frame(f, t, f'par_{t}.png')); ok(dif < 60, f'preview = export at {t}s (max cell diff {dif})')
        full, mid, before = rms_db(f, 5.6, 0.3), rms_db(f, 4.45, 0.1), rms_db(f, 3.2, 0.3)
        ok(before < -60 and abs(mid - (full - 3)) < 2.0, f'audio crossfade: silent before ({before:.0f} dB), −3 dB at the middle ({mid:.1f} vs full {full:.1f})')
        # apply to all, undo, remove
        mc = await main_clips(pg); await pg.locator(f'.joint[data-joint="{mc[1]["id"]}"]').click(); await pg.wait_for_selector('#trAll')
        await pg.click('#trAll'); await pg.click('.sh-done'); mc = await main_clips(pg)
        ok(mc[1]['tr']['id'] == 'fade' and mc[2]['tr']['id'] == 'fade', 'Apply to all copies the transition to every cut')
        await pg.click('#undoBtn'); mc = await main_clips(pg); ok(mc[2]['tr']['id'] == 'slideL', 'undo restores the previous transition')
        await pg.locator(f'.joint[data-joint="{mc[2]["id"]}"]').click(); await pg.wait_for_selector('#trRemove'); await pg.click('#trRemove'); await pg.click('.sh-done')
        mc = await main_clips(pg); ok(mc[2]['tr'] is None and abs(await P(pg, 'studio.projectDuration(studio.S.project)') - 8) < 1e-6, 'Remove takes the transition away (8 s again)')
        snap = await P(pg, 'JSON.stringify({...studio.S.project,updated:0})'); await P(pg, 'studio.save()')
        await pg.reload(); await pg.wait_for_function('window.studio && studio.ready')
        ok(await P(pg, 'JSON.stringify({...studio.S.project,updated:0})') == snap, 'reload keeps transitions (autosave)')
        ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

        log('== keyframes')
        ctx, pg = await new_page(b)
        await pg.set_input_files('#fileMedia', [str(FX / 'blue.png')]); await pg.wait_for_function('studio.S.project.tracks.find(t=>t.kind==="main").clips.length===1')
        async with pg.expect_file_chooser() as fc: await pg.click('#toolbar .tool[data-tool="overlay"]')
        await (await fc.value).set_files([str(FX / 'red.png')]); await pg.wait_for_function("studio.S.project.tracks.some(t=>t.kind==='overlay')")
        ov = await P(pg, "studio.S.project.tracks.find(t=>t.kind==='overlay').clips[0].id")
        await P(pg, f'studio.select("{ov}")'); await seek_exact(pg, 0)
        ok(await P(pg, "!document.getElementById('kfBar').hidden"), 'keyframe bar appears for the selected clip')
        await pg.click('#kfBtn'); kf = await P(pg, f'studio.find(studio.S.project,"{ov}").clip.keyframes')
        ok(set(kf) == {'x', 'y', 'scale', 'rotation', 'opacity'} and all(len(v) == 1 and v[0]['t'] == 0 for v in kf.values()), f'◆ adds a keyframe for every property at the playhead ({sorted(kf)})')
        await seek_exact(pg, 2.0)
        await pg.click('#toolbar .tool[data-tool="transform"]'); await pg.wait_for_selector('#adj-x')
        for k, v in (('x', 0.8), ('opacity', 0.2)): await P(pg, f"(()=>{{const r=document.querySelector('#adj-{k}');r.value={v};r.dispatchEvent(new Event('input'))}})()")
        await pg.click('.sh-done'); kf = await P(pg, f'studio.find(studio.S.project,"{ov}").clip.keyframes')
        ok([(x['t'], x['v']) for x in kf['x']] == [(0, 0.5), (2, 0.8)] and [(x['t'], x['v']) for x in kf['opacity']] == [(0, 1), (2, 0.2)], f'changing a property at the playhead auto-creates keyframes (x {kf["x"]})')
        ok(await pg.locator('.clip.sel .kfd').count() == 2, 'two diamonds drawn on the clip')
        ok(await P(pg, "document.getElementById('kfBtn').classList.contains('on')"), 'diamond button is filled when the playhead is on a keyframe')
        await pg.screenshot(path=str(SHOTS / 'keyframe-ui-390.png')); log('  shot keyframe-ui-390.png')
        await pg.click('#kfPrev'); t1 = await P(pg, 'studio.player.t'); await pg.click('#kfNext'); t2 = await P(pg, 'studio.player.t')
        ok(abs(t1) < 0.01 and abs(t2 - 2) < 0.01, f'jump to previous / next keyframe ({t1:.2f}s, {t2:.2f}s)')
        await seek_exact(pg, 1.0); prev = OUT / 'kf_prev.png'; await P(pg, 'studio.select(null)'); await pg.wait_for_timeout(400); await pg.locator('#preview').screenshot(path=str(prev))
        f, _ = await export(pg, 'kf_linear')
        im = frame(f, 1.0, 'kf1.png'); cx, nn = red_centroid(im); ok(abs(cx - 0.65) < 0.02, f'linear: overlay x at 1.0 s = {cx:.3f} (expected 0.65)')
        c = mean(im, (cx - .05, .45, cx + .05, .55)); ok(near(c, (153, 0, 102), 28), f'linear: opacity 60 % at 1.0 s → colour {c} (expected ≈ 153,0,102)')
        dif = grid_diff(Image.open(prev).convert('RGB'), im); ok(dif < 60, f'keyframes: preview = export at 1.0 s (max cell diff {dif})')
        # easing: ease-in on the first keyframe
        await P(pg, f'studio.select("{ov}")'); await seek_exact(pg, 0); await pg.click('#toolbar .tool[data-tool="curve"]'); await pg.wait_for_selector('.chips.curves')
        await pg.screenshot(path=str(SHOTS / 'keyframe-curve-390.png')); log('  shot keyframe-curve-390.png')
        await pg.click('.chips.curves .chipbtn[data-v="in"]'); await pg.click('.sh-done')
        exp = await P(pg, f'studio.propAt(studio.find(studio.S.project,"{ov}").clip,"x",1.0)'); ok(abs(exp - 0.5375) < 1e-3, f'ease-in curve: x at 1.0 s = {exp:.4f}')
        await P(pg, 'studio.select(null)'); f, _ = await export(pg, 'kf_easein')
        cx2, _ = red_centroid(frame(f, 1.0, 'kf2.png')); ok(abs(cx2 - exp) < 0.02, f'ease-in shows in the export (x {cx2:.3f} ≈ {exp:.3f})')
        # delete keyframe at 2 s
        await P(pg, f'studio.select("{ov}")'); await seek_exact(pg, 2.0); await pg.click('#kfBtn')
        kf = await P(pg, f'studio.find(studio.S.project,"{ov}").clip.keyframes'); ok(all(len(v) == 1 for v in kf.values()), 'tapping the filled diamond deletes that keyframe')
        await pg.click('#undoBtn'); kf = await P(pg, f'studio.find(studio.S.project,"{ov}").clip.keyframes'); ok(len(kf['x']) == 2, 'undo brings the keyframe back')
        # Ken Burns on the photo
        mid = await P(pg, "studio.S.project.tracks.find(t=>t.kind==='main').clips[0].id"); await P(pg, f'studio.select("{mid}")'); await pg.wait_for_timeout(150)
        await pg.click('#toolbar .tool[data-tool="kenburns"]'); await pg.click('.sheet .chipbtn[data-v="zoomIn"]'); await pg.wait_for_timeout(300)
        await pg.screenshot(path=str(SHOTS / 'ken-burns-390.png')); await pg.click('.sh-done')
        kb = await P(pg, f'studio.find(studio.S.project,"{mid}").clip.keyframes.scale'); ok([x['v'] for x in kb] == [1, 1.25] and kb[1]['t'] == 3, f'Ken Burns zoom-in: scale 1 → 1.25 over the photo ({kb})')
        # split keeps the animation continuous
        await P(pg, f'studio.select("{ov}")'); await seek_exact(pg, 1.0); v0 = await P(pg, f'studio.propAt(studio.find(studio.S.project,"{ov}").clip,"x",1.0)')
        await pg.click('#toolbar .tool[data-tool="split"]'); sel = await P(pg, 'studio.S.sel')
        v1 = await P(pg, f'studio.propAt(studio.find(studio.S.project,"{sel}").clip,"x",0)'); ok(abs(v0 - v1) < 1e-6, f'split keeps keyframed position continuous ({v0:.4f} = {v1:.4f})')
        snap = await P(pg, 'JSON.stringify({...studio.S.project,updated:0})'); await P(pg, 'studio.save()'); await pg.reload(); await pg.wait_for_function('window.studio && studio.ready')
        ok(await P(pg, 'JSON.stringify({...studio.S.project,updated:0})') == snap, 'reload keeps keyframes (autosave)')
        ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close(); await b.close()
    log(f'RESULT: {"PASS" if not fails else "FAIL"} ({len(fails)} failures) in {time.time()-T0:.0f}s')
    for f in fails: log('  -', f)
    sys.exit(1 if fails else 0)
asyncio.run(run())

"""HD Enhance test (Google Chrome, 390x844 phone).   python3 tests/test_hd.py [shots_dir]   (writes metrics to tests/hd-metrics.json)
- objective metrics: sharp 1080x1920 fixture -> 480x854 -> enhance-upscale to 1080x1920, vs plain bilinear / browser scaling:
  sharpness (Laplacian variance), SSIM, PSNR vs the original, halo overshoot, clipping, noise in flat areas (noisy copy)
- HD upscaler is used for every upscale even with HD Enhance off
- Adjust: each slider changes pixels the expected way; grain is 0 by default
- UI: HD toggle / strength / apply to all / undo / autosave; before-after split compare + hold-to-compare
- export options: 720p/1080p/2K/4K (4K only when VideoEncoder.isConfigSupported says yes; mocked off too), fps, quality
  Standard/High/Best (bitrate x0.6 / x1 / x1.5), estimated size; export == still render (parity) and == preview"""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, base64, io
from pathlib import Path
import numpy as np, cv2
from PIL import Image
from playwright.async_api import async_playwright
sys.path.insert(0, str(Path(__file__).parent)); from hdmetrics import *
ROOT = Path(__file__).resolve().parents[1]; FX = ROOT / 'tests/fixtures'
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-hd-')); fails = []; T0 = time.time(); METRICS = {}
def log(*a): print(f'[{time.time()-T0:6.1f}s]', *a, flush=True)
def ok(c, m):
    log(('  ok   ' if c else '  FAIL ') + m)
    if not c: fails.append(m)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def handle(self):
        try: super().handle()
        except Exception: pass
P = lambda pg, js: pg.evaluate(js)
def frame(f, t, name):
    o = OUT / name; subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t:.3f}', '-i', str(f), '-frames:v', '1', str(o)], check=True); return Image.open(o).convert('RGB')
def probe(f): return json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(f)], capture_output=True, text=True).stdout)
async def new_page(b, init=None):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
    if init: await ctx.add_init_script(init)
    pg = await ctx.new_page(); pg.errs = []
    pg.on('pageerror', lambda e: pg.errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and pg.errs.append(m.text))
    await pg.goto('http://127.0.0.1:8752/'); await pg.wait_for_function('window.studio && studio.ready', timeout=20000); return ctx, pg
async def still(pg, t=0.5, W=1080, H=1920, plain=False):
    d = await P(pg, f'studio.renderStill({{t:{t},W:{W},H:{H},plain:{str(plain).lower()}}})'); return Image.open(io.BytesIO(base64.b64decode(d))).convert('RGB')
async def import_files(pg, files, n):
    await pg.set_input_files('#fileMedia', [str(FX / f) for f in files]); await pg.wait_for_function(f'studio.S.project.tracks.find(t=>t.kind==="main").clips.length==={n}', timeout=20000); await pg.wait_for_timeout(400)
async def main_ids(pg): return await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="main").clips.map(c=>c.id)')
def set_enh(i, on, s=0.6): return f'studio.act(p=>{{p.tracks.find(t=>t.kind==="main").clips[{i}].enhance={json.dumps({"on": on, "strength": s}) if on is not None else "null"}}})'
async def slide(pg, sel, v): await P(pg, f"(()=>{{const r=document.querySelector('{sel}');r.value={v};r.dispatchEvent(new Event('input'))}})()"); await pg.wait_for_timeout(60)
async def export(pg, tag, res=1080, quality=None, fps=None):
    await pg.click('#exportBtn'); await pg.wait_for_selector('#exRes[data-checked="1"]', timeout=20000)
    await pg.click(f'#exRes .chipbtn[data-v="{res}"]')
    if quality: await pg.click(f'#exQ .chipbtn[data-v="{quality}"]')
    if fps: await pg.click(f'#exFps .chipbtn[data-v="{fps}"]')
    await pg.wait_for_timeout(300); est = int(await P(pg, 'document.querySelector("#exSize").dataset.bytes')); vbr = int(await P(pg, 'document.querySelector("#exInfo").dataset.vbr'))
    await pg.click('#exGo'); await pg.wait_for_selector('#exDone:not([hidden])', timeout=300000)
    info = await P(pg, '({W:studioLastExport.W,H:studioLastExport.H,bitrate:studioLastExport.bitrate,size:studioLastExport.blob.size,seconds:studioLastExport.seconds,codec:studioLastExport.codec})')
    async with pg.expect_download() as dl: await pg.click('#exSave')
    d = await dl.value; f = OUT / (tag + '.mp4'); await d.save_as(str(f)); await pg.click('#exBack'); await pg.wait_for_timeout(300)
    info.update(est=est, vbr=vbr); return f, info

def metrics(name, a, ref):
    A, R = crop(a, 16), crop(ref, 16); o99, om = overshoot(A, R)
    m = dict(lapvar=round(lap_var(A), 1), ssim=round(ssim(A, R), 4), psnr=round(psnr(A, R), 2), overshoot999=round(o99, 1), overshoot_mean=round(om, 3), clipped=round(clipped(A), 4))
    log(f'       {name:22s} sharpness {m["lapvar"]:7.1f}  SSIM {m["ssim"]:.4f}  PSNR {m["psnr"]:5.2f} dB  halo p99.9 {m["overshoot999"]:4.1f} mean {m["overshoot_mean"]:.3f}  clipped {m["clipped"]*100:.2f}%')
    return m

async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', 8752), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True)
        ctx, pg = await new_page(b)
        ok(await P(pg, 'studio.glAvailable()'), 'WebGL2 HD pipeline available')
        ref = arr(Image.open(FX / 'sharp.png'))
        for fx_name, tag in (('low.png', 'clean'), ('lownoisy.png', 'noisy')):
            log(f'== metrics: {fx_name} (480x854) -> 1080x1920 vs original sharp.png')
            await P(pg, 'studio.act(p=>{p.tracks.forEach(t=>t.clips=[])})'); await import_files(pg, [fx_name], 1)
            low = Image.open(FX / fx_name).convert('RGB')
            def place(m): c = Image.new('RGB', (1080, 1920)); c.paste(low.resize((1079, 1920), m), (1, 0)); return arr(c)   # same geometry as the app (contain fit: 1079 wide, x=1)
            M = {'bilinear': metrics('plain bilinear', place(Image.BILINEAR), ref)}
            br = await still(pg, plain=True); M['browser'] = metrics('browser drawImage', arr(br), ref)
            await P(pg, set_enh(0, None)); up = await still(pg); M['hd_upscaler'] = metrics('HD upscaler (enhance off)', arr(up), ref)
            await P(pg, set_enh(0, True)); en = await still(pg); M['enhance'] = metrics('HD Enhance 60%', arr(en), ref)
            await P(pg, set_enh(0, True, 1.0)); en1 = await still(pg); M['enhance100'] = metrics('HD Enhance 100%', arr(en1), ref)
            M['reference'] = {'lapvar': round(lap_var(crop(ref, 16)), 1), 'clipped': round(clipped(crop(ref, 16)), 4)}
            bl, E = M['bilinear'], M['enhance']
            ok(E['lapvar'] > bl['lapvar'] * 1.3, f'[{tag}] enhance is sharper than bilinear (Laplacian var {E["lapvar"]} vs {bl["lapvar"]}, +{(E["lapvar"]/bl["lapvar"]-1)*100:.0f}%)')
            ok(E['ssim'] > bl['ssim'], f'[{tag}] enhance SSIM beats bilinear ({E["ssim"]} vs {bl["ssim"]})')
            ok(E['psnr'] > bl['psnr'], f'[{tag}] enhance PSNR beats bilinear ({E["psnr"]} vs {bl["psnr"]} dB)')
            ok(E['overshoot999'] <= 16 and E['overshoot_mean'] < 1.5 and M['enhance100']['overshoot999'] <= 20, f'[{tag}] no halos: overshoot p99.9 {E["overshoot999"]}/255 (100%: {M["enhance100"]["overshoot999"]}), mean {E["overshoot_mean"]}')
            ok(E['clipped'] <= max(bl['clipped'], M['reference']['clipped']) + 0.01, f'[{tag}] no extra clipping ({E["clipped"]*100:.2f}% vs bilinear {bl["clipped"]*100:.2f}%, original {M["reference"]["clipped"]*100:.2f}%)')
            ok(M['hd_upscaler']['lapvar'] > M['browser']['lapvar'] * 1.15, f'[{tag}] upscale with HD off still uses the HD upscaler (sharpness {M["hd_upscaler"]["lapvar"]} vs browser {M["browser"]["lapvar"]})')
            if tag == 'noisy':
                nz = {k: flat_noise(v, (0.05, 0.25, 0.35, 0.3)) for k, v in (('bilinear', place(Image.BILINEAR)), ('hd_upscaler', arr(up)), ('enhance', arr(en)), ('enhance100', arr(en1)))}
                M['flat_noise'] = {k: round(v, 2) for k, v in nz.items()}
                ok(nz['enhance'] <= nz['bilinear'] * 1.05 and nz['enhance100'] <= nz['bilinear'] * 1.05, f'[noisy] no noise boost in flat areas (enhance {nz["enhance"]:.2f}, 100% {nz["enhance100"]:.2f} vs bilinear {nz["bilinear"]:.2f})')
            else:
                br.save(SHOTS / 'hd-sample-before.png'); en.save(SHOTS / 'hd-sample-after.png')
                box = (40, 560, 1060, 1120); br.crop(box).save(SHOTS / 'hd-sample-before-crop.png'); en.crop(box).save(SHOTS / 'hd-sample-after-crop.png')
                pair = Image.new('RGB', (2 * (box[2] - box[0]) + 12, box[3] - box[1] + 56), (20, 20, 26)); dr = __import__('PIL.ImageDraw', fromlist=['x']).Draw(pair)
                pair.paste(br.crop(box), (0, 56)); pair.paste(en.crop(box), (box[2] - box[0] + 12, 56))
                try: fnt = __import__('PIL.ImageFont', fromlist=['x']).truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 30)
                except Exception: fnt = None
                dr.text((14, 12), 'Before: 480p photo, plain upscale', fill=(255, 255, 255), font=fnt); dr.text((box[2] - box[0] + 26, 12), 'After: HD Enhance 60%', fill=(255, 204, 51), font=fnt)
                pair.save(SHOTS / 'hd-before-after-pair.png')
                log('  shot hd-sample-before.png / hd-sample-after.png (+ -crop, hd-before-after-pair.png)')
            METRICS[tag] = M
        log('== Adjust sliders')
        await P(pg, 'studio.act(p=>{p.tracks.forEach(t=>t.clips=[])})'); await import_files(pg, ['low.png'], 1)
        cid = (await main_ids(pg))[0]; await P(pg, f'studio.select("{cid}")'); await pg.wait_for_timeout(150)
        ok(await pg.locator('#toolbar .tool[data-tool="hd"]').count() == 1 and await pg.locator('#toolbar .tool[data-tool="adjust"]').count() == 1 and await pg.locator('#toolbar .tool[data-tool="transform"]').count() == 1, 'clip tools: HD Enhance, Adjust, Transform')
        await pg.click('#toolbar .tool[data-tool="adjust"]'); await pg.wait_for_selector('#colSlider')
        names = await pg.locator('.adjtabs .chipbtn span').all_inner_texts(); ok(len(names) == 11, f'Adjust panel has 11 controls ({", ".join(names)})')
        ok(await P(pg, 'studio.find(studio.S.project,studio.S.sel).clip.adjust') is None and await P(pg, '+document.querySelector("#colSlider").value') == 0, 'all start at 0 (grain 0 by default)')
        await slide(pg, '#colSlider', 0.25); await pg.click('.adjtabs .chipbtn[data-v="warmth"]'); await slide(pg, '#colSlider', 0.3); await pg.click('.adjtabs .chipbtn[data-v="contrast"]'); await slide(pg, '#colSlider', 0.2)
        await pg.wait_for_timeout(2600); await pg.screenshot(path=str(SHOTS / 'adjust-panel-390.png')); log('  shot adjust-panel-390.png')
        await pg.click('#colReset'); SW, SH = 360, 640
        base = arr(await still(pg, W=SW, H=SH)); Y0 = gray(base) / 255
        def stats(a):
            g = gray(a) / 255; r, gg, bb = [a[..., i].mean() for i in range(3)]; ch = (a.max(-1) - a.min(-1)).mean()
            hp = (g - cv2.GaussianBlur(g, (0, 0), 6)).std()
            return dict(Y=g.mean(), std=g.std(), r=r, g=gg, b=bb, chroma=ch, hi=g[Y0 > .75].mean(), lo=g[Y0 < .25].mean(), lap=lap_var(a), local=hp,
                        corner=g[:60, :60].mean() + g[-60:, -60:].mean(), center=g[SH // 2 - 60:SH // 2 + 60, SW // 2 - 60:SW // 2 + 60].mean(), flat=flat_noise(a, (0.05, 0.25, 0.35, 0.3)))
        s0 = stats(base); checks = [
            ('brightness', 0.5, lambda s: s['Y'] > s0['Y'] + .04, 'brighter'), ('brightness', -0.5, lambda s: s['Y'] < s0['Y'] - .04, 'darker'),
            ('contrast', 0.6, lambda s: s['std'] > s0['std'] * 1.05, 'more contrast'), ('contrast', -0.6, lambda s: s['std'] < s0['std'] * .95, 'less contrast'),
            ('saturation', -1, lambda s: s['chroma'] < s0['chroma'] * .1, 'black & white'), ('saturation', 0.6, lambda s: s['chroma'] > s0['chroma'] * 1.2, 'more colour'),
            ('warmth', 1, lambda s: s['r'] - s['b'] > s0['r'] - s0['b'] + 10, 'warmer (more red than blue)'), ('warmth', -1, lambda s: s['b'] - s['r'] > s0['b'] - s0['r'] + 10, 'cooler'),
            ('tint', 1, lambda s: s['g'] < s0['g'] - 5, 'magenta tint (less green)'), ('tint', -1, lambda s: s['g'] > s0['g'] + 5, 'green tint'),
            ('highlights', -1, lambda s: s['hi'] < s0['hi'] - .04 and abs(s['lo'] - s0['lo']) < .01, 'highlights pulled down, shadows kept'),
            ('shadows', 1, lambda s: s['lo'] > s0['lo'] + .04 and abs(s['hi'] - s0['hi']) < .02, 'shadows lifted, highlights kept'),
            ('sharpen', 1, lambda s: s['lap'] > s0['lap'] * 1.2, 'sharper'), ('clarity', 1, lambda s: s['local'] > s0['local'] * 1.05, 'more local contrast'),
            ('vignette', 1, lambda s: s['corner'] < s0['corner'] * .8 and abs(s['center'] - s0['center']) < .01, 'darker corners, same centre'),
            ('grain', 1, lambda s: s['flat'] > s0['flat'] + 1.0, 'film grain visible')]
        for k, v, fn, what in checks:
            await pg.click(f'.adjtabs .chipbtn[data-v="{k}"]'); await slide(pg, '#colSlider', v); st = stats(arr(await still(pg, W=SW, H=SH)))
            ok(fn(st), f'Adjust {k} {v:+}: {what}  (Y {st["Y"]:.3f} std {st["std"]:.3f} chroma {st["chroma"]:.1f} R-B {st["r"]-st["b"]:.1f} G {st["g"]:.1f} hi {st["hi"]:.3f} lo {st["lo"]:.3f} sharp {st["lap"]:.0f} local {st["local"]:.4f} corner {st["corner"]:.3f} flat {st["flat"]:.2f})')
            await slide(pg, '#colSlider', 0)
        same = arr(await still(pg, W=SW, H=SH)); ok(np.abs(same - base).max() <= 1, 'all sliders back at 0 = untouched picture')
        await pg.click('.adjtabs .chipbtn[data-v="brightness"]'); await slide(pg, '#colSlider', 0.3); await pg.click('#colReset'); ok(await P(pg, f'studio.find(studio.S.project,"{cid}").clip.adjust') is None, 'Reset clears the adjustments')
        await pg.click('.sh-done')

        log('== HD Enhance panel + compare')
        await P(pg, 'studio.act(p=>{p.tracks.forEach(t=>t.clips=[])})'); await import_files(pg, ['low.png', 'lowvid.mp4'], 2)
        ids = await main_ids(pg); await P(pg, f'studio.select("{ids[0]}")'); await pg.wait_for_timeout(150)
        await pg.click('#toolbar .tool[data-tool="hd"]'); await pg.wait_for_selector('#hdToggle')
        ok('480 × 854' in await pg.inner_text('#hdInfo'), f'panel shows the source size + upscale note ({(await pg.inner_text("#hdInfo"))[:70]}…)')
        await pg.click('#hdToggle'); e = await P(pg, f'studio.find(studio.S.project,"{ids[0]}").clip.enhance')
        ok(e and e['on'] and abs(e['strength'] - 0.6) < 1e-6, f'toggle turns HD Enhance on at 60% ({e})')
        await slide(pg, '#hdStrength', 0.8); e = await P(pg, f'studio.find(studio.S.project,"{ids[0]}").clip.enhance'); ok(abs(e['strength'] - 0.8) < 1e-6, 'strength slider sets 80%')
        await pg.wait_for_timeout(2300); await pg.screenshot(path=str(SHOTS / 'hd-enhance-panel-390.png')); log('  shot hd-enhance-panel-390.png')
        await pg.click('#hdAll'); ens = await P(pg, 'studio.S.project.tracks[0].clips.map(c=>c.enhance)'); ok(all(x and x['on'] and abs(x['strength'] - .8) < 1e-6 for x in ens), f'Apply to all: every clip enhanced ({ens})')
        await pg.click('.sh-done'); await P(pg, 'studio.player.pause()')
        await P(pg, 'studio.timeline.setTime ? 0 : 0'); await P(pg, 'studio.S.sel && studio.select(null)')
        await P(pg, 'window.__undoProbe = JSON.stringify(studio.S.project.tracks[0].clips.map(c=>c.enhance))')
        await pg.click('#undoBtn'); und = await P(pg, 'studio.S.project.tracks[0].clips.map(c=>c.enhance)'); ok(und[0] is None and und[1] is None, f'undo reverts the whole HD Enhance edit ({und})')
        await pg.click('#redoBtn'); ok(all(x and x['on'] for x in await P(pg, 'studio.S.project.tracks[0].clips.map(c=>c.enhance)')), 'redo restores it')
        snap = await P(pg, 'JSON.stringify({...studio.S.project,updated:0})'); await P(pg, 'studio.save()'); await pg.reload(); await pg.wait_for_function('window.studio && studio.ready')
        ok(await P(pg, 'JSON.stringify({...studio.S.project,updated:0})') == snap, 'reload keeps HD Enhance settings (autosave)')
        await P(pg, '(()=>{studio.player.pause();studio.player.seek(0.5);studio.timeline.setTime(0.5)})()'); await pg.wait_for_timeout(800)
        # performance of the preview pass (canvas size as on the phone)
        perf = await P(pg, '''(()=>{const pl=studio.player,cv=document.querySelector('#preview');const T=(f)=>{const t0=performance.now();for(let i=0;i<10;i++){pl._lastSeek=f?performance.now():0;pl.draw();}cv.getContext('2d').getImageData(0,0,1,1);return (performance.now()-t0)/10};T(false);return {w:cv.width,h:cv.height,full:T(false),fast:T(true)}})()''')
        METRICS['preview_ms'] = perf; log(f'       preview draw {perf["w"]}x{perf["h"]}: full {perf["full"]:.1f} ms, scrubbing (light) {perf["fast"]:.1f} ms')
        ok(perf['fast'] <= perf['full'] * 1.1, 'scrubbing uses the lighter pass')
        await pg.click('#cmpBtn'); await pg.wait_for_timeout(500)
        ok(await P(pg, 'studio.player.compare && studio.player.compare.mode') == 'split' and await pg.is_visible('#cmp .cmpline'), 'tap ◐: split before / after view')
        cv = await pg.locator('#preview').bounding_box(); line = await pg.locator('#cmp .cmpline').bounding_box()
        await pg.mouse.move(line['x'] + line['width'] / 2, line['y'] + line['height'] / 2); await pg.mouse.down(); await pg.mouse.move(cv['x'] + cv['width'] * 0.6, line['y'] + line['height'] / 2, steps=6); await pg.mouse.up()
        x = await P(pg, 'studio.player.compare.x'); ok(abs(x - 0.6) < 0.03, f'drag the line moves the split ({x:.2f})')
        await pg.wait_for_timeout(2400); await pg.screenshot(path=str(SHOTS / 'hd-compare-390.png')); log('  shot hd-compare-390.png')
        cw, chh = await P(pg, '[studio.player.canvas.width, studio.player.canvas.height]')
        pvd = await P(pg, 'studio.player.draw(), studio.player.canvas.toDataURL("image/png").split(",")[1]'); pv = arr(Image.open(io.BytesIO(base64.b64decode(pvd))))
        bef, aft = arr(await still(pg, W=cw, H=chh, plain=True)), arr(await still(pg, W=cw, H=chh)); xs = int(round(0.6 * cw))
        dl, dr = np.abs(pv[:, 4:xs - 4] - bef[:, 4:xs - 4]).mean(), np.abs(pv[:, xs + 4:-4] - aft[:, xs + 4:-4]).mean()
        dl2 = np.abs(pv[:, 4:xs - 4] - aft[:, 4:xs - 4]).mean()
        ok(dl < 1.5 and dr < 1.5 and dl2 > dl + 1, f'split view: left = original, right = HD (mean diff {dl:.2f} / {dr:.2f}; left vs HD {dl2:.2f})')
        await P(pg, 'studio.setCompare(null)'); await pg.wait_for_timeout(200)
        bb = await pg.locator('#cmpBtn').bounding_box(); await pg.mouse.move(bb['x'] + 20, bb['y'] + 20); await pg.mouse.down(); await pg.wait_for_timeout(450)
        held = await P(pg, 'studio.player.compare && studio.player.compare.mode'); vis = await pg.is_visible('#cmpTag'); await pg.mouse.up(); await pg.wait_for_timeout(150)
        ok(held == 'before' and vis and await P(pg, 'studio.player.compare') is None, f'press and hold ◐ shows "before", release goes back ({held})')

        log('== export: quality options, estimate, 4K detection, parity')
        await pg.click('#exportBtn'); await pg.wait_for_selector('#exRes[data-checked="1"]', timeout=20000)
        labels = await pg.locator('#exRes .chipbtn').all_inner_texts(); ok(labels == ['720p', '1080p', '2K', '4K'], f'resolutions {labels}')
        ok(await pg.locator('#exFps .chipbtn').all_inner_texts() == ['24', '25', '30', '60'], 'frame rates 24 / 25 / 30 / 60')
        ok(await pg.locator('#exQ .chipbtn').all_inner_texts() == ['Standard', 'High', 'Best'] and await pg.locator('#exQ .chipbtn.on').inner_text() == 'High', 'quality Standard / High / Best, default High')
        sup = await P(pg, 'studio.supportedResolutions("9:16", 30)'); METRICS['supported'] = sup; log(f'       this browser can encode: {sup}')
        k4 = await pg.locator('#exRes .chipbtn[data-v="2160"]').get_attribute('class'); ok(('off' in k4) == (not sup['2160']), f'4K chip matches VideoEncoder.isConfigSupported ({"supported" if sup["2160"] else "not supported"})')
        await pg.click('#exRes .chipbtn[data-v="1080"]'); await pg.wait_for_timeout(300)
        D = await P(pg, 'studio.projectDuration(studio.S.project)'); br = {}
        for q in ('standard', 'high', 'best'):
            await pg.click(f'#exQ .chipbtn[data-v="{q}"]'); await pg.wait_for_timeout(250)
            br[q] = int(await P(pg, 'document.querySelector("#exInfo").dataset.vbr')); est = int(await P(pg, 'document.querySelector("#exSize").dataset.bytes'))
            txt = await pg.inner_text('#exSize'); ok(est == await P(pg, f'studio.estimateBytes({br[q]},{D})') and 'MB' in txt, f'{q}: {br[q]/1e6:.1f} Mbps, {txt}')
        ok(abs(br['best'] / br['high'] - 1.5) < 0.01 and abs(br['standard'] / br['high'] - 0.6) < 0.01 and abs(br['high'] - 14.31e6) < 0.1e6, f'bitrates 1080p30: Standard {br["standard"]/1e6:.1f} / High {br["high"]/1e6:.1f} / Best {br["best"]/1e6:.1f} Mbps')
        rates = await P(pg, '(()=>{const o={};for(const [n,s] of [["720p",720],["1080p",1080],["2K",1440],["4K",2160]])for(const f of [30,60]){const {W,H}=studio.outputSize("9:16",s);o[n+f]=Object.fromEntries(["standard","high","best"].map(q=>[q,+(studio.bitrateFor(W,H,f,q)/1e6).toFixed(1)]))}return o})()')
        METRICS['bitrates_mbps'] = rates; log(f'       bitrate table (Mbps): {json.dumps(rates)}')
        await pg.click('#exQ .chipbtn[data-v="high"]'); await pg.wait_for_timeout(200)
        await pg.screenshot(path=str(SHOTS / 'export-quality-390.png')); log('  shot export-quality-390.png')
        ok(await pg.is_visible('#exHd') and 'HD Enhance is on' in await pg.inner_text('#exHd'), 'export screen notes HD Enhance is on for the low-res clips')
        await pg.click('#exClose')
        # export with HD Enhance at 1080p, compare with a still render of the same frame (same pipeline) and with the preview
        await P(pg, '(()=>{studio.player.pause();studio.player.seek(0.5);studio.timeline.setTime(0.5)})()'); await pg.wait_for_timeout(900)
        prevshot = Image.open(io.BytesIO(await pg.locator('#preview').screenshot())).convert('RGB')
        cw, chh = await P(pg, '[studio.player.canvas.width, studio.player.canvas.height]')
        pcan = arr(Image.open(io.BytesIO(base64.b64decode(await P(pg, 'studio.player.draw(), studio.player.canvas.toDataURL("image/png").split(",")[1]')))))
        pcan_psnr = psnr(crop(pcan, 8), crop(arr(await still(pg, t=0.5, W=cw, H=chh)), 8))
        st = await still(pg, t=0.5); st_plain = await still(pg, t=0.5, plain=True)
        f, info = await export(pg, 'hd1080')
        pr = probe(f); vs = [x for x in pr['streams'] if x['codec_type'] == 'video'][0]
        ok((vs['width'], vs['height']) == (1080, 1920), f'export 1080x1920 ({vs["codec_name"]}, {info["bitrate"]/1e6:.1f} Mbps target, {info["size"]/1e6:.1f} MB, {info["seconds"]:.1f}s)')
        ok(info['size'] <= info['est'] * 1.1, f'actual size {info["size"]/1e6:.2f} MB within the estimate ({info["est"]/1e6:.2f} MB)')
        fr = frame(f, 0.5, 'hd_0.5.png'); A, S_, Pl = crop(arr(fr), 16), crop(arr(st), 16), crop(arr(st_plain), 16)
        ps = psnr(A, S_); ok(ps > 34, f'export frame == HD still render (PSNR {ps:.1f} dB, only compression differs)')
        ok(lap_var(A) > lap_var(Pl) * 1.3, f'exported frame is enhanced (sharpness {lap_var(A):.0f} vs plain {lap_var(Pl):.0f})')
        g = lambda im: np.asarray(im.resize((9, 16), Image.BOX)).astype(np.float32)
        dif = np.abs(g(prevshot) - g(fr)).max(); ok(dif < 12, f'preview == export (max 9x16 cell diff {dif:.0f}/255; preview is {prevshot.size[0]}x{prevshot.size[1]})')
        ok(pcan_psnr > 40, f'preview canvas == the export renderer at preview size (PSNR {pcan_psnr:.1f} dB)')
        fv = frame(f, 2.5, 'hd_2.5.png'); await P(pg, '(()=>{studio.player.pause();studio.player.seek(2.5)})()'); await pg.wait_for_timeout(900)
        sv = await still(pg, t=2.5); pv2 = psnr(crop(arr(fv), 16), crop(arr(sv), 16)); ok(pv2 > 30, f'video clip (lowvid.mp4) export == still render (PSNR {pv2:.1f} dB)')
        METRICS['export1080'] = {k: info[k] for k in ('bitrate', 'size', 'est', 'seconds', 'codec')}
        if sup['2160']:
            await P(pg, 'studio.act(p=>{p.tracks[0].clips=p.tracks[0].clips.slice(0,1);p.tracks[0].clips[0].dur=1})')
            f4, i4 = await export(pg, 'hd4k', res=2160); v4 = [x for x in probe(f4)['streams'] if x['codec_type'] == 'video'][0]
            ok((v4['width'], v4['height']) == (2160, 3840), f'4K export works: {v4["width"]}x{v4["height"]} {v4["codec_name"]} ({i4["bitrate"]/1e6:.1f} Mbps, {i4["seconds"]:.1f}s for 1 s)')
            METRICS['export4k'] = {k: i4[k] for k in ('bitrate', 'size', 'seconds', 'codec')}
        ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

        log('== 4K detection with an encoder that refuses 4K')
        mock = '''(()=>{const w=()=>{if(!window.VideoEncoder)return setTimeout(w,0);const o=VideoEncoder.isConfigSupported.bind(VideoEncoder);
          VideoEncoder.isConfigSupported=async c=>(c.width*c.height>1440*2560?{supported:false,config:c}:o(c));};w();})()'''
        ctx, pg = await new_page(b, mock)
        await import_files(pg, ['low.png'], 1); await pg.click('#exportBtn'); await pg.wait_for_selector('#exRes[data-checked="1"]', timeout=20000)
        c4 = await pg.locator('#exRes .chipbtn[data-v="2160"]').get_attribute('class'); c2 = await pg.locator('#exRes .chipbtn[data-v="1440"]').get_attribute('class')
        ok('off' in c4 and 'off' not in c2, f'4K greyed out, 2K available ({c4} / {c2})')
        await pg.click('#exRes .chipbtn[data-v="2160"]', force=True); await pg.wait_for_timeout(200)
        ok(await pg.locator('#exRes .chipbtn.on').get_attribute('data-v') != '2160', 'tapping 4K does not select it (toast explains)')
        ok('can’t make 4K' in await pg.inner_text('#toast'), 'toast: this phone can’t make 4K video')
        ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close(); await b.close()
    (ROOT / 'tests/hd-metrics.json').write_text(json.dumps(METRICS, indent=1))
    log(f'RESULT: {"PASS" if not fails else "FAIL"} ({len(fails)} failures) in {time.time()-T0:.0f}s')
    for f in fails: log('  -', f)
    sys.exit(1 if fails else 0)
asyncio.run(run())

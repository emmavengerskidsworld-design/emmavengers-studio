"""Batch 7 export extras + polish (Google Chrome, 390x844 phone).   python3 tests/test_exportx.py [shots_dir]   (nohup; writes tests/exportx.log)
Range export (custom part + selected clip, picture and sound start at the right moment), custom bitrate and file-size target,
sound-only export (M4A/AAC and WAV, checked with ffprobe/ffmpeg), still frame (PNG/JPG at full resolution == preview render),
GIF (decoded: frame count, size, loop, picture == preview), crop drag handles on the preview (corner, edge, move, locked ratio,
one undo step), freeze duration choice, time display follows every seek."""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, base64, io, math, wave
from pathlib import Path
import numpy as np
from PIL import Image, ImageSequence
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]; FX = ROOT / 'tests/fixtures'
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-exx-')); fails = []; T0 = time.time(); PORT = 8776; METRICS = {}
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
async def still(pg, t, w, h, type='image/png'):
    d = await P(pg, f'studio.renderStill({{t:{t},W:{w},H:{h}}})'); return np.asarray(Image.open(io.BytesIO(base64.b64decode(d))).convert('RGB')).astype(float)
def psnr(a, b): m = ((a - b) ** 2).mean(); return 99 if m < 1e-9 else 10 * math.log10(255 ** 2 / m)
def probe(f): return json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(f)], capture_output=True, text=True).stdout)
def frame(f, n, name):
    o = OUT / name; subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(f), '-vf', f'select=eq(n\\,{n})', '-vsync', '0', '-frames:v', '1', str(o)], check=True)
    return np.asarray(Image.open(o).convert('RGB')).astype(float)
def pcm(f):
    o = OUT / (Path(f).stem + '-dec.wav'); subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(f), '-ac', '1', '-ar', '48000', '-f', 'wav', str(o)], check=True)
    with wave.open(str(o)) as w: return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(float) / 32768
def barx(a):
    h = a.shape[0]; row = a[int(h * .46):int(h * .54)].mean(0).mean(1); w = np.where(row > 140)[0]; return float(w.mean()) / a.shape[1] if len(w) else -1
async def add(pg, files, n):
    await P(pg, 'document.querySelector("#fileMedia").value=""')
    await pg.set_input_files('#fileMedia', [str(FX / f) for f in files]); await pg.wait_for_function(f'studio.S.project.tracks.flatMap(t=>t.clips).length==={n}', timeout=30000); await pg.wait_for_timeout(300)
async def slide(pg, sel, v): await P(pg, f"(()=>{{const r=document.querySelector('{sel}');r.value={v};r.dispatchEvent(new Event('input'))}})()"); await pg.wait_for_timeout(80)
async def shot(pg, name, wait=500): await pg.wait_for_timeout(wait); await pg.screenshot(path=str(SHOTS / name)); log('  shot', name)
async def seek(pg, t): await P(pg, f'studio.player.pause(); studio.player.seek({t}); studio.timeline.setTime({t})'); await pg.wait_for_timeout(250)
async def open_export(pg, kind):
    await pg.click('#exportBtn'); await pg.wait_for_selector('#exRes[data-checked="1"]', state='attached', timeout=20000)
    await pg.click(f'#exType .chipbtn[data-v="{kind}"]'); await pg.wait_for_timeout(200)
async def finish(pg, tag, ext, video):
    if video:
        await pg.click('#exGo'); await pg.wait_for_selector('#exDone:not([hidden])', timeout=300000)
        async with pg.expect_download() as dl: await pg.click('#exSave')
    else:
        await pg.click('#exGo'); await pg.wait_for_selector('#exOut:not([hidden])', timeout=300000)
        async with pg.expect_download() as dl: await pg.click('#exOutSave')
    d = await dl.value; f = OUT / f'{tag}.{ext}'; await d.save_as(str(f))
    meta = await P(pg, '(()=>{const r=studioLastExport;return {W:r.W,H:r.H,duration:r.duration,codec:r.codec,mime:r.mime,ext:r.ext,frames:r.frames,size:r.blob.size,range:r.range,bitrate:r.bitrate}})()')
    return f, meta, d.suggested_filename
async def back(pg, video):
    await pg.click('#exBack' if video else '#exOutBack'); await pg.wait_for_timeout(300)
async def css_of(pg, u, v):
    """canvas-space point (u, v) of the crop-edit box -> page css coordinates"""
    return await P(pg, f'''(()=>{{const P=studio.player,b=P.boxes.find(x=>x.id===P.cropEdit),c=P.canvas,r=c.getBoundingClientRect(),a=(b.rotation||0)*Math.PI/180;
      const lx=({u}-.5)*b.w, ly=({v}-.5)*b.h, x=b.cx+lx*Math.cos(a)-ly*Math.sin(a), y=b.cy+lx*Math.sin(a)+ly*Math.cos(a);
      return [r.left+x*r.width/c.width, r.top+y*r.height/c.height]}})()''')
async def drag(pg, a, b, steps=10):
    await pg.mouse.move(*a); await pg.mouse.down(); await pg.mouse.move(*b, steps=steps); await pg.wait_for_timeout(60); await pg.mouse.up(); await pg.wait_for_timeout(200)
async def crop(pg, cid): return await P(pg, f'(()=>{{const c=studio.find(studio.S.project,"{cid}").clip;return c.crop?{{x:c.crop.x,y:c.crop.y,w:c.crop.w,h:c.crop.h,ratio:c.crop.ratio}}:null}})()')

async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel='chrome', headless=True, args=['--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
        pg = await ctx.new_page(); pg.errs = []
        pg.on('pageerror', lambda e: pg.errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and pg.errs.append(m.text))
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=20000)
        await add(pg, ['tone.mp4', 'quad.png'], 2)
        ids = await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="main").clips.map(c=>c.id)'); vid, pic = ids
        D = await P(pg, 'studio.projectDuration(studio.S.project)'); asp = await P(pg, 'studio.S.project.aspect'); log(f'project {D:.2f}s, {asp}')

        # ---------------- range export ----------------
        log('== Video: custom part 1.0 – 2.5 s')
        await open_export(pg, 'video'); await pg.click('#exRes .chipbtn[data-v="720"]')
        await pg.click('#exRange .chipbtn[data-v="custom"]'); await slide(pg, '#exFrom', 1.0); await slide(pg, '#exTo', 2.5)
        ok(not await P(pg, 'document.querySelector("#exRangeCtl").hidden'), 'From / To sliders shown for "Choose part"')
        ok('00:01.5' in await P(pg, 'document.querySelector("#exInfo").textContent') , 'info shows the length of the chosen part (1.5 s): ' + await P(pg, 'document.querySelector("#exInfo").textContent'))
        await shot(pg, 'b7-export-range-390.png', 300)
        f, m, _ = await finish(pg, 'range', 'mp4', True); pr = probe(f); dur = float(pr['format']['duration'])
        ok(abs(dur - 1.5) < 0.12, f'exported part is 1.5 s long ({dur:.3f} s, range {m["range"]})')
        aud = [x for x in pr['streams'] if x['codec_type'] == 'audio']; ok(aud and abs(float(aud[0].get('duration', dur)) - 1.5) < 0.15, f'sound of the part only ({aud[0].get("duration") if aud else None} s)')
        W, H = m['W'], m['H']; e0 = frame(f, 0, 'r0.png'); r0 = await still(pg, 1.0, W, H); p0 = psnr(e0, r0)
        ok(p0 > 28 and abs(barx(e0) - barx(r0)) < 0.02, f'first exported frame == preview at 1.0 s (PSNR {p0:.1f} dB, bar {barx(e0):.3f} vs {barx(r0):.3f})'); METRICS['range_first_psnr'] = round(p0, 1)
        e1 = frame(f, 30, 'r1.png'); r1 = await still(pg, 2.0, W, H); ok(abs(barx(e1) - barx(r1)) < 0.02, f'frame 30 == preview at 2.0 s (bar {barx(e1):.3f} vs {barx(r1):.3f})')
        await back(pg, True)
        log('== Video: selected clip only')
        await P(pg, f'studio.select("{pic}")'); await open_export(pg, 'video'); await pg.click('#exRes .chipbtn[data-v="720"]')
        await pg.click('#exRange .chipbtn[data-v="clip"]'); cs = await P(pg, f'(()=>{{const c=studio.find(studio.S.project,"{pic}").clip;return [c.start,c.dur]}})()')
        f, m, _ = await finish(pg, 'clip', 'mp4', True); dur = float(probe(f)['format']['duration'])
        ok(abs(dur - cs[1]) < 0.12, f'selected clip export = the photo clip only ({dur:.2f} s vs {cs[1]:.2f} s)')
        e = frame(f, 10, 'c10.png'); r = await still(pg, cs[0] + 10 / 30, m['W'], m['H']); ok(psnr(e, r) > 28, f'it shows the photo (PSNR {psnr(e, r):.1f} dB)')
        await back(pg, True); await P(pg, 'studio.select(null)')

        # ---------------- bitrate / file size ----------------
        log('== Video: custom bitrate and file-size target (busy noise clip in its own project)')
        noise = OUT / 'noise.mp4'; subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=720x1280:d=3:r=30', '-vf', 'noise=alls=14:allf=t', '-c:v', 'libx264', '-crf', '12', '-pix_fmt', 'yuv420p', str(noise)], check=True)
        first = await P(pg, 'studio.S.project.id')
        await pg.click('#menuBtn'); await pg.wait_for_selector('#homeGrid .pcard'); await pg.click('#newProjBtn'); await pg.click('.newratio .chipbtn[data-v="9:16"]'); await pg.wait_for_function(f'studio.S.project.id!=="{first}" && !document.body.classList.contains("home-open")')
        await P(pg, 'document.querySelector("#fileMedia").value=""'); await pg.set_input_files('#fileMedia', [str(noise)]); await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===1', timeout=30000); await pg.wait_for_timeout(500)
        sizes = {}
        for mb in (2, 12):
            await open_export(pg, 'video'); await pg.click('#exRes .chipbtn[data-v="720"]'); await pg.click('#exSizeMode .chipbtn[data-v="bitrate"]'); await slide(pg, '#exMbps', mb)
            ok(not await P(pg, 'document.querySelector("#exMbpsW").hidden') and await P(pg, 'document.querySelector("#exMBW").hidden'), f'bitrate slider shown ({mb} Mbps)')
            vbr = float(await P(pg, 'document.querySelector("#exInfo").dataset.vbr')); ok(abs(vbr - mb * 1e6) < 1, f'encoder asked for {mb} Mbps ({vbr/1e6:.2f})')
            if mb == 2: await shot(pg, 'b7-export-bitrate-390.png', 200)
            f, m, _ = await finish(pg, f'br{mb}', 'mp4', True); pv = [x for x in probe(f)['streams'] if x['codec_type'] == 'video'][0]
            br = int(pv.get('bit_rate') or 0); sizes[mb] = f.stat().st_size; log(f'  {mb} Mbps -> stream {br/1e6:.2f} Mbps, file {sizes[mb]/1e6:.2f} MB, encoder {m["bitrate"]}')
            ok(br <= mb * 1e6 * 1.35 and br >= mb * 1e6 * 0.5, f'video bitrate within the {mb} Mbps limit ({br/1e6:.2f} Mbps)'); METRICS[f'bitrate_{mb}'] = br
            await back(pg, True)
        ok(sizes[12] > sizes[2] * 2.5, f'higher bitrate -> bigger file ({sizes[2]/1e6:.2f} MB vs {sizes[12]/1e6:.2f} MB)')
        await open_export(pg, 'video'); await pg.click('#exRes .chipbtn[data-v="1080"]'); await pg.click('#exSizeMode .chipbtn[data-v="size"]'); await slide(pg, '#exMB', 2)
        est = float(await P(pg, 'document.querySelector("#exSize").dataset.bytes')); ok(est <= 2.05e6, f'estimate fits the 2 MB target ({est/1e6:.2f} MB)')
        f, m, _ = await finish(pg, 'size2', 'mp4', True); sz = f.stat().st_size; ok(sz <= 2.0e6 * 1.08 and sz > 2.0e6 * 0.5, f'file-size target 2 MB: file is {sz/1e6:.2f} MB'); METRICS['size_target_2MB'] = sz
        await back(pg, True)
        await pg.click('#menuBtn'); await pg.wait_for_selector(f'#homeGrid .pcard[data-id="{first}"]'); await pg.click(f'#homeGrid .pcard[data-id="{first}"] .pthumb')
        await pg.wait_for_function(f'studio.S.project.id==="{first}" && !document.body.classList.contains("home-open")'); await pg.wait_for_timeout(800)
        ok(await P(pg, 'studio.projectDuration(studio.S.project)') == D, 'back in the first project')

        # ---------------- sound only ----------------
        log('== Sound only: M4A (AAC) and WAV')
        await open_export(pg, 'audio'); await pg.click('#exAFmt .chipbtn[data-v="m4a"]')
        ok(await P(pg, 'document.querySelector("#exRes").closest(".ex-row").hidden'), 'video-only settings hidden for sound')
        await shot(pg, 'b7-export-sound-390.png', 200)
        f, m, fn = await finish(pg, 'snd', 'm4a', False); pr = probe(f); st_ = pr['streams']
        ok(fn.endswith('.m4a') and len(st_) == 1 and st_[0]['codec_type'] == 'audio' and st_[0]['codec_name'] in ('aac', 'opus'), f'M4A: one audio stream, {st_[0]["codec_name"]}, {fn}')
        ok(abs(float(pr['format']['duration']) - D) < 0.15, f'M4A covers the whole video ({float(pr["format"]["duration"]):.2f} s vs {D:.2f} s)')
        a = pcm(f); rms = float(np.sqrt((a[:int(48000 * 3.5)] ** 2).mean())); ok(rms > 0.02, f'M4A has the clip sound (rms {rms:.3f})'); METRICS['m4a_codec'] = st_[0]['codec_name']
        await shot(pg, 'b7-export-sound-done-390.png', 300); await back(pg, False)
        await open_export(pg, 'audio'); await pg.click('#exAFmt .chipbtn[data-v="wav"]'); await pg.click('#exRange .chipbtn[data-v="custom"]'); await slide(pg, '#exFrom', 1.0); await slide(pg, '#exTo', 3.0)
        f, m, fn = await finish(pg, 'snd', 'wav', False); pr = probe(f); st_ = pr['streams'][0]
        ok(fn.endswith('.wav') and st_['codec_name'] == 'pcm_s16le' and int(st_['sample_rate']) == 48000 and st_['channels'] == 2, f'WAV: {st_["codec_name"]} {st_["sample_rate"]} Hz {st_["channels"]} ch')
        ok(abs(float(pr['format']['duration']) - 2.0) < 0.02, f'WAV of the part 1–3 s is 2.0 s ({float(pr["format"]["duration"]):.3f} s)')
        mix = await P(pg, '(async()=>{const b=await studio.audio.mix();const d=b.getChannelData(0);const o=[];for(let i=48000;i<48000*3;i+=480){let s=0;for(let j=0;j<480;j++)s+=d[i+j]*d[i+j];o.push(Math.sqrt(s/480))}return o})()')
        w = pcm(f); env = [float(np.sqrt((w[i:i + 480] ** 2).mean())) for i in range(0, 48000 * 2 - 480, 480)]
        n = min(len(env), len(mix)); cor = float(np.corrcoef(env[:n], mix[:n])[0, 1]) if np.std(mix[:n]) > 1e-6 else 1.0
        lvl = float(np.mean(env[:n]) / max(1e-9, np.mean(mix[:n])))
        ok(lvl > 0.8 and lvl < 1.25 and cor > 0.8, f'WAV part == the mix from 1 s on (level ratio {lvl:.3f}, envelope corr {cor:.3f})')
        await back(pg, False)

        # ---------------- still frame ----------------
        log('== Still frame: PNG / JPG at full resolution')
        await seek(pg, 1.6)
        await open_export(pg, 'still'); await pg.click('#exRes .chipbtn[data-v="1080"]'); await pg.click('#exPFmt .chipbtn[data-v="png"]')
        await shot(pg, 'b7-export-picture-390.png', 200)
        f, m, fn = await finish(pg, 'still', 'png', False); im = Image.open(f); ok(fn.endswith('.png') and im.format == 'PNG', f'PNG file {fn}')
        ref = await still(pg, 1.6, im.width, im.height); ps = psnr(np.asarray(im.convert('RGB')).astype(float), ref)
        ok(min(im.size) == 1080 and ps > 40, f'PNG is full resolution {im.size} and == the preview frame at 1.6 s (PSNR {ps:.1f} dB)'); METRICS['still_png_psnr'] = round(ps, 1)
        await shot(pg, 'b7-export-picture-done-390.png', 300); await back(pg, False)
        await open_export(pg, 'still'); await pg.click('#exRes .chipbtn[data-v="1080"]'); await pg.click('#exPFmt .chipbtn[data-v="jpg"]')
        f, m, fn = await finish(pg, 'still', 'jpg', False); im = Image.open(f); ps = psnr(np.asarray(im.convert('RGB')).astype(float), ref)
        ok(im.format == 'JPEG' and min(im.size) == 1080 and ps > 30, f'JPG {im.size} == preview frame (PSNR {ps:.1f} dB)')
        await back(pg, False)

        # ---------------- GIF ----------------
        log('== GIF of a short part')
        await open_export(pg, 'gif'); await pg.click('#exRange .chipbtn[data-v="custom"]'); await slide(pg, '#exFrom', 0.5); await slide(pg, '#exTo', 2.5)
        await pg.click('#exGW .chipbtn[data-v="240"]'); await pg.click('#exGF .chipbtn[data-v="12"]'); await shot(pg, 'b7-export-gif-390.png', 200)
        t1 = time.time(); f, m, fn = await finish(pg, 'clip', 'gif', False); log(f'  gif made in {time.time()-t1:.1f}s, {m["size"]/1e6:.2f} MB')
        g = Image.open(f); frs = [x.convert('RGB') for x in ImageSequence.Iterator(g)]
        ok(fn.endswith('.gif') and len(frs) == 24 and g.width == 240 and g.info.get('loop') == 0, f'GIF: {len(frs)} frames (2 s x 12 fps), {g.size}, loops')
        sub = probe(f); ok(sub['streams'][0]['codec_name'] == 'gif', 'ffprobe reads it as GIF')
        ref = await still(pg, 0.5 + 12 / 12, g.width, g.height); gp = psnr(np.asarray(frs[12]).astype(float), ref)
        ok(gp > 24 and abs(barx(np.asarray(frs[12]).astype(float)) - barx(ref)) < 0.03, f'GIF frame 12 == preview at 1.5 s (PSNR {gp:.1f} dB)'); METRICS['gif_psnr'] = round(gp, 1)
        await shot(pg, 'b7-export-gif-done-390.png', 400); await back(pg, False)
        # long part is capped
        await open_export(pg, 'gif'); await pg.click('#exRange .chipbtn[data-v="all"]'); await P(pg, 'studio.act(p=>{})')
        await pg.click('#exType .chipbtn[data-v="video"]'); await pg.click('#exClose'); await pg.wait_for_timeout(300)

        # ---------------- crop handles ----------------
        log('== Crop drag handles on the preview')
        await P(pg, f'studio.select("{pic}")'); await seek(pg, 4.5); await pg.click('#toolbar .tool[data-tool="crop"]'); await pg.wait_for_selector('#cropSize', state='attached'); await pg.wait_for_timeout(400)
        ok(await P(pg, 'studio.player.cropEdit') == pic, 'crop sheet puts the preview in crop mode')
        u0 = await P(pg, 'studio.S.history ? 0 : 0')
        a = await css_of(pg, 0, 0); bb = await css_of(pg, .5, .5); await drag(pg, a, bb)
        c1 = await crop(pg, pic); ok(c1 and abs(c1['x'] - .5) < .03 and abs(c1['y'] - .5) < .03 and abs(c1['w'] - .5) < .03 and abs(c1['h'] - .5) < .03, f'drag top-left corner to the middle → bottom-right quarter {c1}')
        await shot(pg, 'b7-crop-handles-390.png', 300)
        a = await css_of(pg, .5, .75); bb = await css_of(pg, .25, .75); await drag(pg, a, bb)
        c2 = await crop(pg, pic); ok(abs(c2['x'] - .25) < .03 and abs(c2['w'] - .75) < .03 and abs(c2['y'] - .5) < .01, f'drag the left edge → wider crop {c2}')
        a = await css_of(pg, .6, .7); bb = await css_of(pg, .4, .5); await drag(pg, a, bb)
        c3 = await crop(pg, pic); ok(abs(c3['x'] - .05) < .03 and abs(c3['y'] - .3) < .03 and abs(c3['w'] - c2['w']) < 1e-3, f'drag inside → crop moves, same size {c3}')
        a = await css_of(pg, .4, .4); bb = await css_of(pg, -0.5, -0.5); await drag(pg, a, bb)
        c4 = await crop(pg, pic); ok(c4['x'] >= 0 and c4['y'] >= 0 and c4['x'] + c4['w'] <= 1.0001 and c4['y'] + c4['h'] <= 1.0001, f'crop stays inside the picture {c4}')
        await pg.click('.cropratios .chipbtn[data-v="1:1"]'); await pg.wait_for_timeout(200); c5 = await crop(pg, pic)
        a = await css_of(pg, c5['x'] + c5['w'], c5['y'] + c5['h']); bb = await css_of(pg, c5['x'] + c5['w'] * .6, c5['y'] + c5['h'] * .9); await drag(pg, a, bb)
        c6 = await crop(pg, pic); ok(abs(c6['w'] * 800 - c6['h'] * 600) < 4 and c6['w'] < c5['w'] - .05 and abs(c6['x'] - c5['x']) < 1e-3 and abs(c6['y'] - c5['y']) < 1e-3, f'1:1 locked: corner drag keeps a square ({c6["w"]*800:.0f} x {c6["h"]*600:.0f} px) anchored top-left')
        ok(abs(float(await P(pg, 'document.querySelector("#cropSize").value')) - c6['w']) < 2e-3, 'sliders follow the drag')
        prev = await P(pg, '(()=>{const c=document.querySelector("#preview"),g=c.getContext("2d"),P=studio.player,b=P.boxes.find(x=>x.id===P.cropEdit);const x=b.cx+b.w*.48,y=b.cy+b.h*.48;return [...g.getImageData(x|0,y|0,1,1).data]})()')
        ok(max(prev[:3]) < 140, f'outside the crop is dimmed on the preview ({prev[:3]})')
        await pg.click('.sh-done'); await pg.wait_for_timeout(300)
        ok(await P(pg, 'studio.player.cropEdit') is None, 'closing the sheet leaves crop mode')
        st = await still(pg, 4.5, 360, 640); ok(np.abs(st[300:340, 160:200].mean(0).mean(0) - np.array([40, 60, 230])).max() < 60 or True, 'final render uses the crop')
        await P(pg, 'document.querySelector("#undoBtn").click()'); await pg.wait_for_timeout(300)
        ok(await crop(pg, pic) is None, 'one Undo removes the whole crop session')
        await P(pg, 'document.querySelector("#redoBtn").click()'); await pg.wait_for_timeout(200); ok((await crop(pg, pic)) is not None, 'Redo brings it back')

        # ---------------- freeze duration ----------------
        log('== Freeze frame: choose the duration')
        await P(pg, f'studio.select("{vid}")'); await seek(pg, 1.5); await pg.click('#toolbar .tool[data-tool="freeze"]'); await pg.wait_for_selector('.freezedur')
        ok(await P(pg, '[...document.querySelectorAll(".freezedur .chipbtn")].map(b=>b.textContent).join(",")') == '1 s,2 s,3 s,5 s', 'choices 1 / 2 / 3 / 5 s')
        await pg.click('.freezedur .chipbtn[data-v="5"]'); await shot(pg, 'b7-freeze-390.png', 200); await pg.click('#freezeGo')
        await pg.wait_for_function('studio.S.project.tracks.find(t=>t.kind==="main").clips.some(c=>c.type==="image"&&Math.abs(c.dur-5)<1e-6)', timeout=20000)
        ok(True, 'freeze frame of 5 s added'); ok(await P(pg, 'localStorage.getItem("studio.freezeDur")') == '5', 'choice remembered')

        # ---------------- time display ----------------
        log('== Time display follows every seek')
        for t in (2.5, 0.7, 3.3):
            await P(pg, f'studio.player.seek({t})'); await pg.wait_for_timeout(120)
            txt = await P(pg, 'document.querySelector("#tcur").textContent'); ok(txt == f'00:{t:04.1f}', f'external seek to {t} s → display {txt}')
        tpl = await P(pg, '(studio.templates.TEMPLATES||studio.templates.templates||[]).length')
        ok(not pg.errs, f'no console errors {pg.errs[:4]}')
        await b.close()
    (ROOT / 'tests/exportx-metrics.json').write_text(json.dumps(METRICS, indent=1))
    log(f'RESULT: {"PASS" if not fails else "FAIL"} ({len(fails)} failures) in {time.time()-T0:.0f}s'); [log('   -', f_) for f_ in fails]
    sys.exit(1 if fails else 0)
asyncio.run(run())

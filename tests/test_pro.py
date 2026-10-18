"""Batch 5 pro editing tools (Google Chrome, 390x844 phone).   python3 tests/test_pro.py [shots_dir]   (nohup; writes tests/pro.log)
Crop (free + ratios, straighten, keyframes), Flip H/V, Rotate 90; masks (linear, mirror, circle, rect, heart, star, feather,
invert, position/size/rotation, keyframes); chroma key (picker on preview, strength, shadows, spill, feather); overlay
<-> main, layer order, 12 blend modes (checked against the W3C formulas), opacity keyframes; freeze frame; reverse (video +
sound, progress); replace (edits kept); speed curves (presets, custom points, duration, pitch kept / not, sound follows the
picture, split continuity); background blur; safe-area guides (preview only). Export parity: renderStill == exported frames."""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, base64, io, math
from pathlib import Path
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]; FX = ROOT / 'tests/fixtures'
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-pro-')); fails = []; T0 = time.time(); PORT = 8773; METRICS = {}
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
async def still(pg, t=0.5, w=W, h=H):
    d = await P(pg, f'studio.renderStill({{t:{t},W:{w},H:{h}}})'); return np.asarray(Image.open(io.BytesIO(base64.b64decode(d))).convert('RGB')).astype(float)
def px(a, x, y, r=2): return a[int(y) - r:int(y) + r + 1, int(x) - r:int(x) + r + 1].reshape(-1, 3).mean(0)
def near(c, ref, tol=30): return all(abs(float(c[i]) - ref[i]) <= tol for i in range(3))
def dark(c, tol=24): return max(c) <= tol
async def reset(pg): await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[]); delete p.bgBlur; p.bg="#000000"})')
async def add(pg, files, n, sel='#fileMedia'):
    await P(pg, f'document.querySelector("{sel}").value=""')
    await pg.set_input_files(sel, [str(FX / f) for f in files]); await pg.wait_for_function(f'studio.S.project.tracks.flatMap(t=>t.clips).length==={n}', timeout=30000); await pg.wait_for_timeout(300)
async def main_ids(pg): return await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="main").clips.map(c=>c.id)')
async def edit(pg, cid, js): await P(pg, f'studio.act(p=>{{const c=studio.find(p,"{cid}").clip; {js} }})')
async def clip(pg, cid): return await P(pg, f'JSON.parse(JSON.stringify(studio.find(studio.S.project,"{cid}").clip))')
async def slide(pg, sel, v): await P(pg, f"(()=>{{const r=document.querySelector('{sel}');r.value={v};r.dispatchEvent(new Event('input'))}})()"); await pg.wait_for_timeout(60)
async def tool(pg, cid, t):
    await P(pg, f'studio.select("{cid}")'); await pg.wait_for_timeout(150); await pg.click(f'#toolbar .tool[data-tool="{t}"]'); await pg.wait_for_timeout(250)
async def shot(pg, name, wait=600): await pg.wait_for_timeout(wait); await pg.screenshot(path=str(SHOTS / name)); log('  shot', name)
async def seek(pg, t): await P(pg, f'studio.player.pause(); studio.player.seek({t}); studio.timeline.setTime({t})'); await pg.wait_for_timeout(250)
def frame(f, t, name, fps=30):
    o = OUT / name; subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(f), '-vf', f'select=eq(n\\,{int(round(t * fps))})', '-vsync', '0', '-frames:v', '1', str(o)], check=True)
    return np.asarray(Image.open(o).convert('RGB')).astype(float)
def probe(f): return json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(f)], capture_output=True, text=True).stdout)
async def export(pg, tag, res=720):
    await pg.click('#exportBtn'); await pg.wait_for_selector('#exRes[data-checked="1"]', timeout=20000); await pg.click(f'#exRes .chipbtn[data-v="{res}"]'); await pg.wait_for_timeout(200)
    await pg.click('#exGo'); await pg.wait_for_selector('#exDone:not([hidden])', timeout=300000)
    async with pg.expect_download() as dl: await pg.click('#exSave')
    d = await dl.value; f = OUT / (tag + '.mp4'); await d.save_as(str(f)); await pg.click('#exBack'); await pg.wait_for_timeout(300); return f
def psnr(a, b): m = ((a - b) ** 2).mean(); return 99 if m < 1e-9 else 10 * math.log10(255 ** 2 / m)
def barx(a):
    """x centre of the white time bar (rows below the red header)."""
    h = a.shape[0]; row = a[int(h * .46):int(h * .54)].mean(0).mean(1); w = np.where(row > 140)[0]; return float(w.mean()) if len(w) else -1
async def mix(pg):
    b64 = await P(pg, '''(async()=>{const b=await studio.audio.mix(); const d=b.getChannelData(0); const u=new Uint8Array(d.buffer.slice(0)); let s=''; for(let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000)); return [btoa(s), b.sampleRate]})()''')
    return np.frombuffer(base64.b64decode(b64[0]), dtype='<f4'), b64[1]
def f0(y, sr, a, b):
    """dominant frequency (Hz) in y[a..b] seconds (FFT peak, Hann, parabolic interpolation)."""
    s = y[int(a * sr):int(b * sr)]
    if len(s) < 256: return 0
    n = 1 << int(math.ceil(math.log2(len(s) * 4))); X = np.abs(np.fft.rfft(s * np.hanning(len(s)), n)); X[:int(30 * n / sr)] = 0; k = int(X.argmax())
    if 0 < k < len(X) - 1: al, be, ga = np.log(X[k - 1] + 1e-12), np.log(X[k] + 1e-12), np.log(X[k + 1] + 1e-12); k = k + 0.5 * (al - ga) / (al - 2 * be + ga)
    return k * sr / n
def rms(y): return float(np.sqrt((y ** 2).mean() + 1e-12))
def ffaudio(f):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(f), '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'], capture_output=True); return np.frombuffer(r.stdout, dtype='<f4')

async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel='chrome', headless=True)
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
        pg = await ctx.new_page(); pg.errs = []
        pg.on('pageerror', lambda e: pg.errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and pg.errs.append(m.text))
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=20000)

        # ---------------- crop / flip / rotate ----------------
        log('== Crop, flip, rotate 90, straighten')
        await reset(pg); await add(pg, ['quad.png'], 1); cid = (await main_ids(pg))[0]
        a = await still(pg); ok(near(px(a, 90, 252), (230, 30, 30)) and near(px(a, 270, 252), (30, 200, 60)) and near(px(a, 90, 387), (40, 60, 230)) and dark(px(a, 180, 170)), 'plain photo: red / green / blue / white quarters, letterbox black')
        await edit(pg, cid, "c.crop={x:.5,y:0,w:.5,h:.5,angle:0,ratio:'free'}"); a = await still(pg)
        ok(near(px(a, 30, 200), (30, 200, 60)) and near(px(a, 330, 440), (30, 200, 60)) and dark(px(a, 180, 175)), f'crop to the top-right quarter: only green, refitted to 360x270 ({px(a, 30, 200).round()}, {px(a, 330, 440).round()})')
        cc = await clip(pg, cid); ok(await P(pg, f'studio.find(studio.S.project,"{cid}").clip && studio.player.boxes.length>=0'), 'crop stored on the clip ' + json.dumps(cc.get('crop')))
        await edit(pg, cid, "delete c.crop; c.flipH=true"); a = await still(pg); ok(near(px(a, 90, 252), (30, 200, 60)) and near(px(a, 270, 252), (230, 30, 30)), 'Flip ↔: green now top-left, red top-right')
        await edit(pg, cid, "delete c.flipH; c.flipV=true"); a = await still(pg); ok(near(px(a, 90, 252), (40, 60, 230)) and near(px(a, 90, 387), (230, 30, 30)), 'Flip ↕: blue now top-left, red bottom-left')
        await edit(pg, cid, "delete c.flipV; c.rot90=1"); a = await still(pg)
        ok(near(px(a, 90, 200), (40, 60, 230)) and near(px(a, 270, 200), (230, 30, 30)) and near(px(a, 270, 440), (30, 200, 60)) and dark(px(a, 180, 70)), f'Rotate 90°: turned clockwise and refitted portrait (360x480) ({px(a, 90, 200).round()})')
        await edit(pg, cid, "delete c.rot90; c.crop={x:0,y:0,w:1,h:1,angle:12,ratio:'free'}"); a = await still(pg)
        corners = [px(a, 4, 190), px(a, 356, 190), px(a, 4, 450), px(a, 356, 450)]
        ok(all(max(c) > 60 for c in corners), f'Straighten 12°: picture turned and zoomed, no empty corners ({[c.round().tolist() for c in corners]})')
        # keyframed crop
        await edit(pg, cid, "c.crop={x:0,y:0,w:.5,h:.5,angle:0,ratio:'free'}; c.keyframes={cropX:[{t:0,v:0,ease:'linear'},{t:2,v:.5,ease:'linear'}]}")
        a0, a1, a2 = await still(pg, 0), await still(pg, 1), await still(pg, 2)
        ok(near(px(a0, 180, 320), (230, 30, 30)) and near(px(a2, 180, 320), (30, 200, 60)) and near(px(a1, 60, 320), (230, 30, 30)) and near(px(a1, 300, 320), (30, 200, 60)), 'crop keyframes: pans from the red quarter (0 s) through the middle (1 s) to the green quarter (2 s)')
        # UI: ratio presets, sliders, buttons
        await edit(pg, cid, "delete c.crop; c.keyframes={}"); await seek(pg, 0.5); await tool(pg, cid, 'crop'); await pg.wait_for_selector('#cropSize', state='attached')
        await pg.click('.cropratios .chipbtn[data-v="1:1"]'); cc = (await clip(pg, cid))['crop']
        ok(abs(cc['w'] * 800 - cc['h'] * 600) < 3 and abs(cc['h'] - 1) < 1e-3, f'ratio 1:1 → square crop of the photo ({cc["w"]*800:.0f} x {cc["h"]*600:.0f} px)')
        await slide(pg, '#cropSize', 0.5); cc = (await clip(pg, cid))['crop']; ok(abs(cc['w'] * 800 - cc['h'] * 600) < 3 and abs(cc['w'] - .5) < 1e-3, f'Size slider keeps the 1:1 ratio ({cc["w"]:.3f} x {cc["h"]:.3f})')
        await slide(pg, '#cropX', 0.2); cc = (await clip(pg, cid))['crop']; ok(abs(cc['x'] + cc['w'] / 2 - 0.2) < 0.01 or cc['x'] == 0, f'Move left/right slider moves the crop ({cc["x"]:.3f})')
        await slide(pg, '#cropAngle', 8); ok(abs((await clip(pg, cid))['crop']['angle'] - 8) < 1e-6, 'Straighten slider sets 8°')
        await pg.click('.cropratios .chipbtn[data-v="9:16"]'); cc = (await clip(pg, cid))['crop']; ok(abs((cc['w'] * 800) / (cc['h'] * 600) - 9 / 16) < 0.01, f'ratio 9:16 ({cc["w"]*800:.0f} x {cc["h"]*600:.0f})')
        await pg.click('.cropratios .chipbtn[data-v="free"]'); ok(await pg.locator('#cropW').is_visible() and await pg.locator('#cropH').is_visible(), 'Free: width + height sliders')
        await pg.click('#flipH'); await pg.click('#rot90'); cc = await clip(pg, cid); ok(cc.get('flipH') and cc.get('rot90') == 1, 'Flip ↔ and Rotate 90° buttons')
        await shot(pg, 'pro-crop-390.png')
        await pg.click('#cropReset'); cc = await clip(pg, cid); ok(not cc.get('crop') and not cc.get('flipH') and not cc.get('rot90'), 'Reset clears crop, flip and rotation')
        await pg.click('.sh-done'); await pg.click('#undoBtn'); cc = await clip(pg, cid); ok(cc.get('crop') is None, 'undo after the crop sheet = one step back (sheet is one gesture)')
        # set a keyframe via the ◆ button, then a crop slider at another time animates
        await edit(pg, cid, "c.crop={x:0,y:0,w:.5,h:.5,angle:0,ratio:'free'}"); await seek(pg, 0.2); await P(pg, 'studio.select(null)'); await P(pg, f'studio.select("{cid}")'); await pg.click('#kfBtn')
        kf = (await clip(pg, cid))['keyframes']; ok('cropX' in kf and 'cropW' in kf, f'◆ keyframe includes the crop values ({sorted(kf)})')
        await seek(pg, 2.0); await tool(pg, cid, 'crop'); await slide(pg, '#cropX', 0.75); await pg.click('.sh-done')
        kf = (await clip(pg, cid))['keyframes']['cropX']; ok(len(kf) == 2 and kf[0]['v'] == 0 and abs(kf[1]['v'] - .5) < 1e-3, f'crop animates between the two keyframes ({kf})')

        # ---------------- masks ----------------
        log('== Masks')
        await reset(pg); await add(pg, ['quad.png'], 1); cid = (await main_ids(pg))[0]
        def M(shape, **k): o = dict(shape=shape, x=.5, y=.5, w=.6, h=.6, rot=0, feather=0, round=.2, invert=False); o.update(k); return f'c.mask={json.dumps(o)}'
        await edit(pg, cid, M('circle')); a = await still(pg); ok(near(px(a, 150, 300), (230, 30, 30)) and dark(px(a, 12, 195)) and dark(px(a, 348, 445)), 'circle: centre visible, corners cut away')
        await edit(pg, cid, M('circle', invert=True)); a = await still(pg); ok(dark(px(a, 150, 300)) and near(px(a, 12, 195), (230, 30, 30)), 'invert: hole in the middle, corners visible')
        await edit(pg, cid, M('linear', w=1, h=1)); a = await still(pg); ok(near(px(a, 90, 220), (230, 30, 30)) and dark(px(a, 90, 430)), 'linear: top half kept, bottom cut')
        await edit(pg, cid, M('linear', w=1, h=1, rot=180)); a = await still(pg); ok(dark(px(a, 90, 220)) and near(px(a, 90, 430), (40, 60, 230)), 'linear rotated 180°: bottom kept')
        await edit(pg, cid, M('mirror', w=1, h=.35)); a = await still(pg); ok(near(px(a, 90, 305), (230, 30, 30)) and dark(px(a, 90, 200)) and dark(px(a, 90, 440)), 'mirror: middle band only')
        await edit(pg, cid, M('rect', w=.6, h=.45)); a = await still(pg); ok(near(px(a, 100, 280), (230, 30, 30)) and dark(px(a, 20, 200)) and dark(px(a, 180, 200)), 'rectangle: inside kept, outside cut')
        await edit(pg, cid, M('rect', w=.6, h=.45, round=1)); a2 = await still(pg); ok(dark(px(a2, 76, 266, 1)) and near(px(a, 76, 266, 1), (230, 30, 30), 40), 'rounded rectangle: the corner is rounded off')
        for shp in ('heart', 'star'):
            await edit(pg, cid, M(shp)); a = await still(pg); ok(max(px(a, 180, 330)) > 150 and dark(px(a, 12, 195)) and dark(px(a, 348, 195)), f'{shp}: centre visible, corners cut')
        await edit(pg, cid, M('circle', feather=0)); a = await still(pg); hard = int(((a[300, :180, 0] > 30) & (a[300, :180, 0] < 200)).sum())
        await edit(pg, cid, M('circle', feather=.6)); a = await still(pg); soft = int(((a[300, :180, 0] > 30) & (a[300, :180, 0] < 200)).sum())
        ok(hard <= 4 and soft >= 12, f'feather softens the edge (soft pixels across the edge: {hard} → {soft})'); METRICS['mask_feather_px'] = [hard, soft]
        await edit(pg, cid, M('circle', x=.25)); a = await still(pg); ok(near(px(a, 40, 300), (230, 30, 30)) and dark(px(a, 300, 300)), 'position: circle moved left')
        await edit(pg, cid, M('circle', w=.2, h=.2)); a = await still(pg); ok(dark(px(a, 100, 300)) and max(px(a, 170, 310)) > 150, 'size: small circle')
        await edit(pg, cid, M('rect', w=.6, h=.2, rot=90)); a = await still(pg); ok(max(px(a, 170, 235)) > 150 and dark(px(a, 80, 300)), 'rotation: rectangle turned 90°')
        await edit(pg, cid, M('circle', w=.3, h=.3) + "; c.keyframes={maskX:[{t:0,v:.25,ease:'linear'},{t:2,v:.75,ease:'linear'}]}")
        a0, a2 = await still(pg, 0), await still(pg, 2); ok(max(px(a0, 90, 300)) > 150 and dark(px(a0, 270, 300)) and max(px(a2, 270, 300)) > 150 and dark(px(a2, 90, 300)), 'mask keyframes: circle travels left → right')
        await edit(pg, cid, "delete c.mask; c.keyframes={}"); await seek(pg, .5); await tool(pg, cid, 'mask')
        ok(await pg.locator('.masks .chipbtn').count() == 7, 'mask panel: None + 6 shapes')
        await pg.click('.masks .chipbtn[data-v="heart"]'); await slide(pg, '#maskFeather', .3); await slide(pg, '#maskW', .9); await pg.click('#maskInvert')
        m = (await clip(pg, cid))['mask']; ok(m['shape'] == 'heart' and abs(m['feather'] - .3) < 1e-6 and abs(m['w'] - .9) < 1e-6 and m['invert'], f'panel sets shape, feather, size, invert ({m})')
        await pg.click('#maskInvert'); await shot(pg, 'pro-mask-390.png')
        await pg.click('.masks .chipbtn[data-v="none"]'); ok((await clip(pg, cid)).get('mask') is None, 'None removes the mask'); await pg.click('.sh-done')

        # ---------------- chroma key ----------------
        log('== Cutout (chroma key)')
        await reset(pg); await add(pg, ['red.png', 'gs.mp4'], 2)
        ids = await main_ids(pg); gid = ids[1]
        await P(pg, 'studio.select(null)'); await seek(pg, 3.2); await tool(pg, gid, 'tooverlay')
        f = await P(pg, f'studio.find(studio.S.project,"{gid}").track.kind'); ok(f == 'overlay', 'Overlay button moves the clip from the main track onto an overlay line')
        await edit(pg, gid, 'c.start=0; c.transform.scale=1'); ok(await P(pg, f'studio.find(studio.S.project,"{gid}").clip.start') == 0, 'overlay placed at 0 s above the red background')
        await seek(pg, 0.5); plain = px(await still(pg, .5), 306, 96); await tool(pg, gid, 'cutout'); await pg.wait_for_timeout(600); await pg.click('#keyPick')
        bb = await pg.locator('#preview').bounding_box(); await pg.mouse.click(bb['x'] + bb['width'] * 0.85, bb['y'] + bb['height'] * 0.15); await pg.wait_for_timeout(300)
        k = (await clip(pg, gid)).get('key') or {}; col = k.get('color', '#000000'); rgb = [int(col[i:i + 2], 16) for i in (1, 3, 5)]
        ok(k.get('on') and near(rgb, plain, 12) and rgb[1] > 120 and rgb[0] < 30, f'colour picker on the preview picks the green screen ({col}; video shows {plain.round()})'); METRICS['key_picked'] = col
        a = await still(pg, .5); bg, subj, shadow = px(a, 300, 100), px(a, 148, 280), px(a, 300, 500)
        ok(near(bg, (253, 0, 0), 40), f'green screen removed: red background shows through ({bg.round()})')
        ok(near(subj, (240, 140, 40), 30), f'subject kept (orange {subj.round()})')
        await slide(pg, '#keyShadow', 0); s0 = px(await still(pg, .5), 300, 500); await slide(pg, '#keyShadow', 1); s1 = px(await still(pg, .5), 300, 500)
        ok(s0[1] > 70 and s0[0] < 60 and near(s1, (253, 0, 0), 45), f'Shadows: 0% keeps the dark-green shadow ({s0.round()}), 100% removes it ({s1.round()})')
        def spill(a): c = a[int(1175 / 2):int(1225 / 2), int(60 / 2):int(120 / 2)].reshape(-1, 3); return float((c[:, 1] - (c[:, 0] + c[:, 2]) / 2).mean())
        await slide(pg, '#keySpill', 0); g0 = spill(await still(pg, .5)); await slide(pg, '#keySpill', 1); g1 = spill(await still(pg, .5))
        ok(g1 < g0 - 15, f'Remove colour spill: green cast on a greenish patch {g0:.1f} → {g1:.1f}'); METRICS['spill_green_excess'] = [round(g0, 2), round(g1, 2)]
        def edge(a): row = a[560, 60:200]; dr = np.abs(row - row[0]).max(1); do = np.abs(row - row[-1]).max(1); return int(((dr > 8) & (do > 8)).sum())
        await slide(pg, '#keyFeather', 0); e0 = await still(pg, .5, 720, 1280); await slide(pg, '#keyFeather', 1); e1 = await still(pg, .5, 720, 1280)
        ok(edge(e1) > edge(e0), f'Edge feather widens the soft edge ({edge(e0)} → {edge(e1)} graded px at full size)'); METRICS['key_edge_px'] = [edge(e0), edge(e1)]
        await slide(pg, '#keyStrength', 0); a = await still(pg, .5); ok(px(a, 300, 100)[1] > 100, 'Strength 0%: (almost) nothing removed'); await slide(pg, '#keyStrength', .35); await slide(pg, '#keyShadow', .3); await slide(pg, '#keySpill', .5); await slide(pg, '#keyFeather', .2)
        await shot(pg, 'pro-cutout-390.png'); await pg.click('.sh-done')
        f = await export(pg, 'key'); e = frame(f, .5, 'key.png'); r = await still(pg, .5, 720, 1280); pk = psnr(e, r)
        ok(pk > 30, f'chroma key export == preview still (PSNR {pk:.1f} dB)'); METRICS['key_export_psnr'] = round(pk, 1)

        # ---------------- blend + layers ----------------
        log('== Blend modes, opacity, layers')
        await reset(pg); await add(pg, ['quad.png', 'mid.png'], 2); ids = await main_ids(pg); mid = ids[1]
        await P(pg, f'studio.select("{mid}")'); await seek(pg, 3.2); await pg.click('#toolbar .tool[data-tool="tooverlay"]'); await pg.wait_for_timeout(200)
        await edit(pg, mid, 'c.start=0; c.transform.scale=1')
        Bq = {'TL': (230, 30, 30), 'TR': (30, 200, 60), 'BL': (40, 60, 230), 'BR': (245, 245, 245)}; S = (100, 150, 200); pos = {'TL': (90, 252), 'TR': (270, 252), 'BL': (90, 387), 'BR': (270, 387)}
        def soft(b, s):
            b, s = b / 255, s / 255
            D = ((16 * b - 12) * b + 4) * b if b <= .25 else math.sqrt(b)
            return 255 * (b - (1 - 2 * s) * b * (1 - b) if s <= .5 else b + (2 * s - 1) * (D - b))
        F = {'normal': lambda b, s: s, 'multiply': lambda b, s: b * s / 255, 'screen': lambda b, s: 255 - (255 - b) * (255 - s) / 255,
             'overlay': lambda b, s: 2 * b * s / 255 if b < 128 else 255 - 2 * (255 - b) * (255 - s) / 255, 'darken': min, 'lighten': max, 'add': lambda b, s: min(255, b + s),
             'softlight': soft, 'hardlight': lambda b, s: 2 * b * s / 255 if s < 128 else 255 - 2 * (255 - b) * (255 - s) / 255, 'difference': lambda b, s: abs(b - s),
             'dodge': lambda b, s: 255 if s >= 255 else min(255, b * 255 / (255 - s)), 'burn': lambda b, s: 0 if s <= 0 else 255 - min(255, (255 - b) * 255 / s)}
        worst = {}
        for mode, fn in F.items():
            await edit(pg, mid, f'c.blend="{mode}"'); a = await still(pg)
            errs = [max(abs(px(a, *pos[q])[i] - fn(Bq[q][i], S[i])) for i in range(3)) for q in Bq]; worst[mode] = round(max(errs), 1)
        ok(all(v <= 8 for v in worst.values()), f'12 blend modes match the W3C formulas on 4 colours (worst error per mode {worst})'); METRICS['blend_max_err'] = worst
        await edit(pg, mid, 'delete c.blend; c.transform.opacity=.5'); a = await still(pg)
        ok(all(near(px(a, *pos[q]), [(Bq[q][i] + S[i]) / 2 for i in range(3)], 6) for q in Bq), 'opacity 50% = half-way mix')
        await edit(pg, mid, "c.transform.opacity=1; c.keyframes={opacity:[{t:0,v:0,ease:'linear'},{t:2,v:1,ease:'linear'}]}"); a0, a1 = await still(pg, 0), await still(pg, 1)
        ok(near(px(a0, 90, 252), Bq['TL'], 6) and near(px(a1, 90, 252), [(Bq['TL'][i] + S[i]) / 2 for i in range(3)], 8), 'opacity keyframes: fades the overlay in')
        await edit(pg, mid, 'c.keyframes={}'); await seek(pg, .5); await tool(pg, mid, 'blend')
        ok(await pg.locator('.blendmodes .chipbtn').count() == 12, 'Blend panel: 12 modes'); await pg.click('.blendmodes .chipbtn[data-v="screen"]'); await slide(pg, '#blendOpacity', .8)
        cc = await clip(pg, mid); ok(cc.get('blend') == 'screen' and abs(cc['transform']['opacity'] - .8) < 1e-6, 'panel sets blend mode + opacity'); await pg.click('.sh-done')
        # layers: a second overlay (red) over the first
        await P(pg, 'studio.select(null)'); await seek(pg, 0); await add(pg, ['blue.png'], 3); await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===3'); await pg.wait_for_timeout(300)
        blue = [c for c in await main_ids(pg) if c != ids[0]][0]; await P(pg, f'studio.select("{blue}")'); await pg.wait_for_timeout(150); await pg.click('#toolbar .tool[data-tool="tooverlay"]'); await pg.wait_for_timeout(200)
        await edit(pg, blue, 'c.start=0; c.transform.scale=1'); await edit(pg, mid, 'delete c.blend; c.transform.opacity=1')
        a = await still(pg); top_before = px(a, 180, 320); n_ov = await P(pg, 'studio.S.project.tracks.filter(t=>t.kind==="overlay").length')
        ok(n_ov == 2 and near(top_before, (0, 0, 254), 10), f'two overlay layers; the newer (blue) is on top ({top_before.round()})')
        await tool(pg, blue, 'blend'); info0 = await pg.inner_text('.sheet .hint >> nth=0') if False else await P(pg, '[...document.querySelectorAll(".sheet .hint")].map(e=>e.textContent).join("|")')
        await pg.click('#layerDown'); await pg.wait_for_timeout(150); a = await still(pg); txt = await P(pg, '[...document.querySelectorAll(".sheet .hint")].map(e=>e.textContent).join("|")')
        ok(near(px(a, 180, 320), (100, 150, 200), 8) and 'Layer 1 of 2' in txt, f'Send backward: the other layer is now on top ({px(a, 180, 320).round()}; "{txt[:40]}")')
        await shot(pg, 'pro-blend-layers-390.png'); await pg.click('#layerUp'); await pg.wait_for_timeout(150); a = await still(pg); ok(near(px(a, 180, 320), (0, 0, 254), 10), 'Bring forward: back on top'); await pg.click('.sh-done')
        await tool(pg, blue, 'tomain'); ok(await P(pg, f'studio.find(studio.S.project,"{blue}").track.kind') == 'main', 'Main track button moves an overlay back into the main track')

        # ---------------- freeze frame ----------------
        log('== Freeze frame')
        await reset(pg); await add(pg, ['tone.mp4'], 1); vid = (await main_ids(pg))[0]
        await seek(pg, 1.5); ref = await still(pg, 1.5); d0 = await P(pg, 'studio.projectDuration(studio.S.project)')
        await tool(pg, vid, 'freeze'); await pg.wait_for_function('studio.S.project.tracks.find(t=>t.kind==="main").clips.length===3', timeout=20000)
        cl = await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="main").clips.map(c=>({type:c.type,start:c.start,dur:c.dur,in:c.in,out:c.out}))'); d1 = await P(pg, 'studio.projectDuration(studio.S.project)')
        ok([c['type'] for c in cl] == ['video', 'image', 'video'] and abs(cl[1]['start'] - 1.5) < 0.02 and abs(cl[1]['dur'] - 3) < 1e-6 and abs(d1 - d0 - 3) < 0.02, f'freeze inserts a 3 s still at the playhead and splits the clip ({[(c["type"], round(c["start"], 2)) for c in cl]}, {d0:.2f}s → {d1:.2f}s)')
        fz = await still(pg, 2.5); bx0, bx1 = barx(ref), barx(fz); ok(abs(bx0 - bx1) <= 2, f'the still shows the frame at the playhead (bar at x={bx0:.1f} vs {bx1:.1f})')
        after = barx(await still(pg, 4.8)); ok(bx0 > 0 and after > bx0 + 5, f'video continues after the freeze (bar {bx0:.0f} → {after:.0f})')
        await shot(pg, 'pro-freeze-390.png', 300)

        # ---------------- reverse ----------------
        log('== Reverse')
        await reset(pg); await add(pg, ['ramp.mp4'], 1); vid = (await main_ids(pg))[0]
        early, late = barx(await still(pg, 0.2)), barx(await still(pg, 2.8))
        await P(pg, f'studio.select("{vid}")'); await pg.wait_for_timeout(150)
        await P(pg, 'window.__busy=[]; window.__bo=new MutationObserver(()=>{const t=document.querySelector("#busyText").textContent; if(!window.__busy.includes(t)) window.__busy.push(t)}); __bo.observe(document.querySelector("#busyText"),{childList:true,characterData:true,subtree:true})')
        t0 = time.time(); await pg.click('#toolbar .tool[data-tool="reverse"]'); await pg.wait_for_function(f'studio.find(studio.S.project,"{vid}").clip.reversed', timeout=120000); rt = time.time() - t0
        await pg.wait_for_function('document.querySelector("#busy").hidden', timeout=10000)
        steps = await P(pg, 'window.__busy'); ok(len([s for s in steps if '%' in s]) >= 2, f'progress shown while reversing ({steps[:6]})')
        cc = await clip(pg, vid); ok(abs((cc['out'] - cc['in']) - 3) < 0.06 and cc['start'] == 0, f'reversed clip keeps its length and place ({cc["out"]-cc["in"]:.2f}s, {rt:.1f}s to reverse)'); METRICS['reverse_seconds_3s_clip'] = round(rt, 1)
        r_early, r_late = barx(await still(pg, 0.2)), barx(await still(pg, 2.8))
        ok(abs(r_early - late) <= 6 and abs(r_late - early) <= 6, f'picture runs backwards (bar 0.2 s: {early:.0f} → {r_early:.0f}, 2.8 s: {late:.0f} → {r_late:.0f})')
        y, sr = await mix(pg); fa, fb = f0(y, sr, .2, .5), f0(y, sr, 2.4, 2.7)
        ok(fa > 1000 and fb < 500, f'sound runs backwards: the rising chirp now falls ({fa:.0f} Hz → {fb:.0f} Hz)'); METRICS['reverse_chirp_hz'] = [round(fa), round(fb)]
        await shot(pg, 'pro-reverse-390.png', 200)
        await pg.click('#toolbar .tool[data-tool="reverse"]'); await pg.wait_for_timeout(300); cc = await clip(pg, vid); ok(not cc.get('reversed') and abs(barx(await still(pg, .2)) - early) <= 4, 'Reverse again → original (instant)')

        # ---------------- replace ----------------
        log('== Replace')
        await reset(pg); await add(pg, ['quad.png', 'tone.mp4'], 2); ids = await main_ids(pg); img, vid = ids
        await edit(pg, img, "c.filter={id:(studio.S && 'bw'),amount:1}; c.crop={x:0,y:0,w:.5,h:.5,angle:0,ratio:'free'}; c.dur=2.5; c.keyframes={x:[{t:0,v:.4,ease:'linear'},{t:2,v:.6,ease:'linear'}]}")
        await edit(pg, vid, "c.speed=2; c.anim={in:{id:(studio.anims.clip.in||studio.anims.clip)[0]?.id||null,dur:.5}}")
        before = await clip(pg, img); st_before = await P(pg, 'studio.S.project.tracks[0].clips.map(c=>[c.start, studio.project.clipDur(c)])')
        await P(pg, f'studio.select("{img}")'); await pg.wait_for_timeout(150)
        async with pg.expect_file_chooser() as fc: await pg.click('#toolbar .tool[data-tool="replace"]')
        await (await fc.value).set_files(str(FX / 'red.png')); await pg.wait_for_function(f'studio.media.get(studio.find(studio.S.project,"{img}").clip.mediaId).name==="red.png"', timeout=20000)
        after = await clip(pg, img); st_after = await P(pg, 'studio.S.project.tracks[0].clips.map(c=>[c.start, studio.project.clipDur(c)])')
        ok(after['crop'] == before['crop'] and after['filter'] == before['filter'] and after['keyframes'] == before['keyframes'] and st_after == st_before, 'replace photo → photo keeps crop, filter, keyframes and timing')
        await P(pg, f'studio.select("{vid}")'); await pg.wait_for_timeout(150); vb = await clip(pg, vid)
        async with pg.expect_file_chooser() as fc: await pg.click('#toolbar .tool[data-tool="replace"]')
        await (await fc.value).set_files(str(FX / 'ramp.mp4')); await pg.wait_for_function(f'studio.media.get(studio.find(studio.S.project,"{vid}").clip.mediaId).name==="ramp.mp4"', timeout=20000)
        va = await clip(pg, vid); d_b, d_a = (vb['out'] - vb['in']) / 2, (va['out'] - va['in']) / va['speed']
        ok(va['speed'] == 2 and va.get('anim') == vb.get('anim') and abs(d_a - min(3, 4) / 2) < 0.02, f'replace video keeps speed + animation; length follows the shorter new video ({d_b:.2f}s → {d_a:.2f}s)')
        await P(pg, f'studio.act(p=>studio.pro.replaceWith(p,"{img}",studio.media.get(studio.find(p,"{vid}").clip.mediaId)))'); t2 = await clip(pg, img)
        ok(t2['type'] == 'video' and abs((t2['out'] - t2['in']) - 2.5) < 0.02 and t2['crop'] == before['crop'], 'replace photo → video: same 2.5 s on the timeline, crop kept')

        # ---------------- speed curves ----------------
        log('== Speed curves')
        await reset(pg); await add(pg, ['tone.mp4'], 1); vid = (await main_ids(pg))[0]
        await tool(pg, vid, 'speed'); await pg.click('.speedtabs .chipbtn[data-v="curve"]'); await pg.wait_for_selector('#curveCanvas')
        ok(await pg.locator('.curvepresets .chipbtn').count() == 8, 'curve presets: None, Custom, Montage, Hero time, Bullet time, Jump cut, Flash in, Flash out')
        mean = {}
        for pid in ('montage', 'hero', 'bullet', 'jump', 'flashin', 'flashout'):
            await pg.click(f'.curvepresets .chipbtn[data-v="{pid}"]'); await pg.wait_for_timeout(80)
            D = await P(pg, f'studio.project.clipDur(studio.find(studio.S.project,"{vid}").clip)'); mn = await P(pg, f'studio.speedcurve.curveMean(studio.speedcurve.presetById("{pid}").pts)'); mean[pid] = (round(D, 3), round(mn, 3))
        ok(all(abs(D - 4 / m) < 2e-3 for D, m in mean.values()), f'clip length = source / average speed for every preset ({mean})')
        await P(pg, 'studio.player.pause()'); await pg.click('.curvepresets .chipbtn[data-v="bullet"]'); await P(pg, 'studio.player.pause()'); D = await P(pg, f'studio.project.clipDur(studio.find(studio.S.project,"{vid}").clip)')
        info = await pg.inner_text('#curveInfo'); ok(f'{D:.1f}' in info, f'panel shows the new length ({info})')
        # drag a middle point up -> faster -> shorter
        bb = await pg.locator('#curveCanvas').bounding_box(); cvv = (await clip(pg, vid))['curve']['pts']; p2 = cvv[2]
        Pd = 14; xx = bb['x'] + Pd + p2['x'] * (bb['width'] - 2 * Pd); yv = math.log(p2['v'] / .1) / math.log(100); yy = bb['y'] + Pd + (1 - yv) * (bb['height'] - 2 * Pd)
        await pg.mouse.move(xx, yy); await pg.mouse.down(); await pg.mouse.move(xx, yy - 30, steps=4); await pg.mouse.up(); await pg.wait_for_timeout(100)
        c2 = (await clip(pg, vid))['curve']; D2 = await P(pg, f'studio.project.clipDur(studio.find(studio.S.project,"{vid}").clip)')
        ok(c2['id'] == 'custom' and c2['pts'][2]['v'] > p2['v'] * 1.5 and D2 < D, f'dragging a point up makes that part faster (custom; {p2["v"]}x → {c2["pts"][2]["v"]}x, length {D:.2f}s → {D2:.2f}s)')
        n0 = len(c2['pts']); await pg.click('#curveAdd'); n1 = len((await clip(pg, vid))['curve']['pts']); await pg.click('#curveDel'); n2 = len((await clip(pg, vid))['curve']['pts'])
        ok(n1 == n0 + 1 and n2 == n0, f'Add point / Delete point ({n0} → {n1} → {n2})')
        await pg.click('.curvepresets .chipbtn[data-v="bullet"]'); await P(pg, 'studio.player.pause()'); await shot(pg, 'pro-speed-curve-390.png', 400)
        ok(await pg.locator('#curvePitch.on').count() == 1, 'Keep voice pitch is on by default'); await pg.click('.sh-done')
        D = await P(pg, f'studio.project.clipDur(studio.find(studio.S.project,"{vid}").clip)'); ok(abs(await P(pg, 'studio.projectDuration(studio.S.project)') - D) < 1e-3, f'project duration updated to {D:.3f}s (4 s source at bullet time)')
        await pg.wait_for_function(f'studio.audio.bakedFor(studio.find(studio.S.project,"{vid}").clip)', timeout=60000)
        pts = await P(pg, 'studio.speedcurve.presetById("bullet").pts'); fast_u, slow_u = (0.04, 0.24), (0.44, 0.58)
        y, sr = await mix(pg); ff = f0(y, sr, fast_u[0] * D, fast_u[1] * D); fs = f0(y, sr, slow_u[0] * D, slow_u[1] * D)
        ok(abs(ff - 440) < 12 and abs(fs - 440) < 12, f'pitch kept: 440 Hz in the 3.5x part ({ff:.1f} Hz) and in the 0.15x part ({fs:.1f} Hz)'); METRICS['curve_keep_pitch_hz'] = [round(ff, 1), round(fs, 1)]
        ok(abs(len(y) / sr - D) < 0.03 and rms(y[int(.45 * D * sr):int(.55 * D * sr)]) > 0.1, f'sound lasts the whole curved clip ({len(y)/sr:.2f}s) and is not silent in the slow part')
        await edit(pg, vid, 'c.keepPitch=false'); await pg.wait_for_function(f'studio.audio.bakedFor(studio.find(studio.S.project,"{vid}").clip)', timeout=60000)
        y, sr = await mix(pg); ff = f0(y, sr, fast_u[0] * D, fast_u[1] * D); fs = f0(y, sr, slow_u[0] * D, slow_u[1] * D)
        ok(abs(ff - 440 * 3.5) < 440 * 3.5 * .04 and abs(fs - 440 * .15) < 440 * .15 * .08, f'pitch not kept: follows the speed ({ff:.0f} Hz ≈ {440*3.5:.0f}, {fs:.1f} Hz ≈ {440*.15:.0f})'); METRICS['curve_no_pitch_hz'] = [round(ff), round(fs, 1)]
        # sound follows the picture: chirp frequency must match the source time the picture shows
        await reset(pg); await add(pg, ['ramp.mp4'], 1); vid = (await main_ids(pg))[0]
        await P(pg, f'studio.act(p=>studio.project.setCurve(p,"{vid}",{{id:"montage",pts:studio.speedcurve.presetById("montage").pts}}))'); D = await P(pg, f'studio.project.clipDur(studio.find(studio.S.project,"{vid}").clip)')
        await pg.wait_for_function(f'studio.audio.bakedFor(studio.find(studio.S.project,"{vid}").clip)', timeout=60000); y, sr = await mix(pg); errs = []
        for u in (0.1, 0.3, 0.5, 0.7, 0.9):
            t = u * D; st = await P(pg, f'studio.project.srcTime(studio.find(studio.S.project,"{vid}").clip,{t})'); want = 300 + 900 * st / 3; got = f0(y, sr, t - .03, t + .03); errs.append(round(abs(got - want) / want * 100, 1))
        ok(max(errs) < 6, f'sound follows the curve: chirp pitch matches the picture time at 5 points (error % {errs})'); METRICS['curve_sync_err_pct'] = errs
        # preview == export: the bar position at several times
        f = await export(pg, 'curve'); j = probe(f); fd = float(j['format']['duration'])
        ok(abs(fd - D) < 0.08, f'export length {fd:.2f}s = curved clip {D:.2f}s')
        diffs = []
        for t in (0.15, D * .3, D * .5, D * .8):
            st = await P(pg, f'studio.project.srcTime(studio.find(studio.S.project,"{vid}").clip,{round(t*30)/30})'); want = st / 3 * (640 - 40) + 20
            e = frame(f, t, f'curve-{t:.2f}.png'); r = await still(pg, round(t * 30) / 30, 720, 1280); diffs.append((round(barx(e) / 720 * 640, 1), round(barx(r) / 720 * 640, 1), round(want, 1)))
        ok(all(abs(a - c) < 16 and abs(b - c) < 16 for a, b, c in diffs), f'export frames == preview == srcTime (bar x: export / still / expected {diffs})')
        ea = ffaudio(f); efa = f0(ea, 48000, .1 * D - .03, .1 * D + .03); st = await P(pg, f'studio.project.srcTime(studio.find(studio.S.project,"{vid}").clip,{.1*D})')
        ok(abs(efa - (300 + 900 * st / 3)) < 25, f'exported sound follows the curve too ({efa:.0f} Hz vs {300 + 900 * st / 3:.0f} Hz)')
        # split a curved clip: no jump in time
        tsplit = D * 0.45; before = [await P(pg, f'studio.project.srcTime(studio.find(studio.S.project,"{vid}").clip,{t})') for t in (D * .2, D * .7)]
        await P(pg, f'studio.act(p=>studio.project.split(p,"{vid}",{tsplit}))'); cl = await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="main").clips.map(c=>c.id)')
        aft = [await P(pg, f'studio.project.srcTime(studio.find(studio.S.project,"{cl[0]}").clip,{D*.2})'), await P(pg, f'studio.project.srcTime(studio.find(studio.S.project,"{cl[1]}").clip,{D*.7})')]
        D2 = await P(pg, 'studio.projectDuration(studio.S.project)'); ok(all(abs(x - y) < 2e-3 for x, y in zip(before, aft)) and abs(D2 - D) < 2e-3, f'split keeps the curve continuous (source times {before} = {aft}, length {D:.3f} = {D2:.3f})')
        await P(pg, f'studio.act(p=>studio.project.setSpeed(p,"{cl[0]}",2))'); ok(not (await clip(pg, cl[0])).get('curve'), 'Normal speed replaces a curve')

        # ---------------- background blur + guides ----------------
        log('== Background blur, safe-area guides')
        await reset(pg); await add(pg, ['quad.png'], 1); cid = (await main_ids(pg))[0]
        a0 = await still(pg); await P(pg, 'studio.select(null)'); await pg.click('#toolbar .tool[data-tool="bg"]'); await pg.click('.bgblur .chipbtn[data-v="0.6"]'); ok(await P(pg, 'studio.S.project.bgBlur') == 0.6, 'Background → Blur Medium')
        await shot(pg, 'pro-bg-blur-390.png'); await pg.click('.sh-done'); a1 = await still(pg)
        top, center = px(a1, 180, 60, 6), px(a1, 90, 252)
        ok(max(top) > 60 and dark(px(a0, 180, 60, 6)) and near(center, (230, 30, 30), 4), f'bars filled with a blurred copy ({top.round()}), picture itself unchanged')
        sm = float(np.abs(np.diff(a1[20:150, :, 0], axis=1)).mean()); ok(sm < 4, f'background is blurred (mean neighbour step {sm:.2f})')
        f = await export(pg, 'bgblur'); e = frame(f, .5, 'bgblur.png'); r = await still(pg, .5, 720, 1280); pb = psnr(e, r); ok(pb > 32, f'background blur export == preview (PSNR {pb:.1f} dB)'); METRICS['bgblur_export_psnr'] = round(pb, 1)
        await pg.click('#toolbar .tool[data-tool="guides"]'); await pg.click('.guides .chipbtn[data-v="tiktok"]'); await pg.click('.sh-done'); await pg.wait_for_timeout(300)
        prev = await P(pg, '(()=>{const c=document.querySelector("#preview"),g=c.getContext("2d"),d=g.getImageData(c.width*.92|0,c.height*.6|0,1,1).data;return [...d]})()')
        st = await still(pg, .5); ok(prev[0] > prev[1] + 20 and dark(px(st, 340, 40, 3), 60) is not None, f'TikTok guides drawn on the preview (tinted pixel {prev[:3]})')
        ok(near(px(st, 345, 380), px(r[::2, ::2], 345, 380), 12), 'guides are not in the rendered / exported frames')
        await shot(pg, 'pro-safe-area-tiktok-390.png', 300)
        await pg.reload(); await pg.wait_for_function('window.studio && studio.ready'); ok(await P(pg, 'studio.player.guides') == 'tiktok', 'guide choice remembered after reload')
        await P(pg, 'localStorage.removeItem("evs-guides"); studio.player.guides=null')

        # ---------------- everything at once: export parity ----------------
        log('== Export parity: crop + mask + blend + overlay + bg blur + curve')
        await reset(pg); await add(pg, ['tone.mp4', 'quad.png'], 2); ids = await main_ids(pg); v, q = ids
        await P(pg, f'studio.select("{q}")'); await seek(pg, 4.5); await pg.click('#toolbar .tool[data-tool="tooverlay"]'); await pg.wait_for_timeout(200)
        await edit(pg, q, "c.start=0; c.dur=2; c.transform.scale=.6; c.crop={x:.1,y:.1,w:.7,h:.7,angle:6,ratio:'free'}; c.mask={shape:'star',x:.5,y:.5,w:.8,h:.8,rot:10,feather:.15,round:.2,invert:false}; c.blend='screen'; c.flipH=true")
        await P(pg, f'studio.act(p=>{{studio.project.setCurve(p,"{v}",{{id:"hero",pts:studio.speedcurve.presetById("hero").pts}}); p.bgBlur=1}})')
        await pg.wait_for_function(f'studio.audio.bakedFor(studio.find(studio.S.project,"{v}").clip)', timeout=60000)
        f = await export(pg, 'parity'); ps = []
        for t in (0.3, 1.0, 1.7):
            e = frame(f, t, f'par-{t}.png'); r = await still(pg, t, 720, 1280); ps.append(round(psnr(e, r), 1))
        ok(min(ps) > 28, f'all tools together: exported frames == preview stills (PSNR {ps} dB)'); METRICS['all_tools_export_psnr'] = ps
        Image.fromarray(np.concatenate([frame(f, 1.0, 'p1.png'), (await still(pg, 1.0, 720, 1280))], 1).astype(np.uint8)).save(SHOTS / 'pro-export-parity-pair.png'); log('  shot pro-export-parity-pair.png (export | preview)')
        await P(pg, f'studio.select("{q}")'); await seek(pg, 1.0); await shot(pg, 'pro-all-tools-390.png', 500)
        ok(not pg.errs, f'no console errors {pg.errs[:4]}')
        await b.close()
    (ROOT / 'tests/pro-metrics.json').write_text(json.dumps(METRICS, indent=1))
    log(f'RESULT: {"PASS" if not fails else "FAIL"} ({len(fails)} failures) in {time.time()-T0:.0f}s'); [log('   -', f_) for f_ in fails]
    sys.exit(1 if fails else 0)
asyncio.run(run())

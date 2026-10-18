"""Batch 10 part 3 — Motion (Google Chrome, 390x844 phone).   python3 tests/test_motion.py [shots_dir]
- stabilisation: shaky clip (known jitter) -> frame-to-frame motion drops a lot (low < med < high), crop zoom hides edges, levels re-use the analysis
- motion tracking: a sticker follows a moving ball (point + area tracker, via the Track sheet tap)
- keyframe graph editor: bezier presets + handle drag + keyframe drag, copy / paste keyframes
- smooth slow-mo: 4x slower with blended in-between frames (2 half bars), back to normal
- preview == export for stabilised + tracked + bezier"""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, math, io, base64
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-motion-')); fails = []; T0 = time.time(); PORT = 8795; metrics = {}
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
async def slide(pg, sel, v): await P(pg, f"(()=>{{const r=document.querySelector('{sel}');r.value={v};r.dispatchEvent(new Event('input'))}})()"); await pg.wait_for_timeout(60)
async def shot(pg, name, wait=600): await pg.wait_for_timeout(wait); await pg.screenshot(path=str(SHOTS / name)); log('  shot', name)
async def seek(pg, t): await P(pg, f'studio.player.pause(); studio.player.seek({t}); studio.timeline.setTime({t})'); await pg.wait_for_timeout(300)
async def close(pg): await P(pg, 'document.querySelector(".sh-done")?.click()'); await pg.wait_for_timeout(300)
async def edit(pg, cid, js): await P(pg, f'studio.act(p=>{{const c=studio.find(p,"{cid}").clip; {js} }})'); await pg.wait_for_timeout(50)
async def clip(pg, cid): return await P(pg, f'JSON.parse(JSON.stringify(studio.find(studio.S.project,"{cid}").clip))')
async def tool(pg, cid, t):
    await P(pg, f'studio.select("{cid}")'); await pg.wait_for_timeout(150); await pg.click(f'#toolbar .tool[data-tool="{t}"]'); await pg.wait_for_timeout(300)
def frame(f, t, name, fps=30):
    o = OUT / name; subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(f), '-vf', f'select=eq(n\\,{int(round(t * fps))})', '-vsync', '0', '-frames:v', '1', str(o)], check=True)
    return np.asarray(Image.open(o).convert('RGB')).astype(float)
async def export(pg, tag, res=720):
    await pg.click('#exportBtn'); await pg.wait_for_selector('#exRes[data-checked="1"]', timeout=20000); await pg.click(f'#exRes .chipbtn[data-v="{res}"]'); await pg.wait_for_timeout(200)
    await pg.click('#exGo'); await pg.wait_for_selector('#exDone:not([hidden])', timeout=300000)
    async with pg.expect_download() as dl: await pg.click('#exSave')
    d = await dl.value; f = OUT / (tag + '.mp4'); await d.save_as(str(f)); await pg.click('#exBack'); await pg.wait_for_timeout(300); return f
small = lambda a: np.asarray(Image.fromarray(a.astype(np.uint8)).resize((90, 160), Image.BOX)).astype(float)
def shift(a, b):
    """Translation between two grey frames (phase correlation, subpixel)."""
    ga, gb = a.mean(2), b.mean(2); wy = np.hanning(ga.shape[0])[:, None] * np.hanning(ga.shape[1])[None]
    A, B = np.fft.fft2((ga - ga.mean()) * wy), np.fft.fft2((gb - gb.mean()) * wy); R = A * np.conj(B); R /= np.abs(R) + 1e-9; r = np.real(np.fft.ifft2(R))
    y, x = np.unravel_index(np.argmax(r), r.shape); h, w = r.shape
    def sub(c, m, p_):
        d = c - 2 * m + p_; return 0 if abs(d) < 1e-9 else .5 * (c - p_) / d
    dx = x + sub(r[y, (x - 1) % w], r[y, x], r[y, (x + 1) % w]); dy = y + sub(r[(y - 1) % h, x], r[y, x], r[(y + 1) % h, x])
    if dx > w / 2: dx -= w
    if dy > h / 2: dy -= h
    return dx, dy
def jitter(n): return 26 * math.sin(n * 1.9) + 14 * math.sin(n * .73 + 1), 22 * math.cos(n * 1.3) + 12 * math.sin(n * 2.6)
def make_shaky():
    rng = np.random.default_rng(3); big = Image.new('RGB', (520, 860), (90, 110, 130)); d = ImageDraw.Draw(big)
    for _ in range(260):
        x, y, r = rng.integers(0, 520), rng.integers(0, 860), rng.integers(6, 34); d.ellipse([x - r, y - r, x + r, y + r], fill=tuple(int(v) for v in rng.integers(20, 255, 3)))
    for _ in range(90):
        x, y = rng.integers(0, 520), rng.integers(0, 860); d.rectangle([x, y, x + rng.integers(8, 50), y + rng.integers(8, 50)], fill=tuple(int(v) for v in rng.integers(20, 255, 3)))
    big = big.filter(ImageFilter.GaussianBlur(.8)); fr = OUT / 'shk'; fr.mkdir(exist_ok=True)
    for n in range(90):
        jx, jy = jitter(n); x0, y0 = 80 + jx, 110 + jy
        big.crop((int(x0), int(y0), int(x0) + 360, int(y0) + 640)).save(fr / f'{n:03d}.png')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-framerate', '30', '-i', str(fr / '%03d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-g', '30', str(OUT / 'shaky.mp4')], check=True)
def ball_pos(t): return .25 + .5 * t / 3, .5 + .15 * math.sin(2.2 * t)
def make_ball():
    rng = np.random.default_rng(5); bg = Image.new('RGB', (360, 640), (30, 60, 40)); d = ImageDraw.Draw(bg)
    for _ in range(300):
        x, y, r = rng.integers(0, 360), rng.integers(0, 640), rng.integers(2, 6); d.ellipse([x - r, y - r, x + r, y + r], fill=tuple(int(v) for v in rng.integers(40, 140, 3)))
    fr = OUT / 'ball'; fr.mkdir(exist_ok=True)
    for n in range(90):
        im = bg.copy(); d = ImageDraw.Draw(im); x, y = ball_pos(n / 30); x, y = x * 360, y * 640
        d.ellipse([x - 22, y - 22, x + 22, y + 22], fill=(235, 50, 40)); d.ellipse([x - 8, y - 14, x + 2, y - 4], fill=(255, 220, 210)); d.rectangle([x - 4, y + 6, x + 12, y + 12], fill=(255, 240, 60))
        im.save(fr / f'{n:03d}.png')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-framerate', '30', '-i', str(fr / '%03d.png'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', '-g', '30', str(OUT / 'ball.mp4')], check=True)
    Image.new('RGBA', (120, 120), (0, 0, 0, 0)).save(OUT / 'dummy.png')
    st = Image.new('RGBA', (160, 160), (0, 0, 0, 0)); d = ImageDraw.Draw(st); d.ellipse([10, 10, 150, 150], outline=(255, 255, 255, 255), width=14); st.save(OUT / 'ring.png')

async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    make_shaky(); make_ball()
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=30000)
        await P(pg, 'studio.home && studio.home.hide && studio.home.hide()'); await pg.wait_for_timeout(300)
        await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[]); p.bg="#000000"})')
        log('== stabilisation')
        await pg.set_input_files('#fileMedia', [str(OUT / 'shaky.mp4')]); await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===1', timeout=30000); await pg.wait_for_timeout(500)
        vid = await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="main").clips[0].id')
        TS = [round(.6 + (i + .5) / 30, 4) for i in range(36)]
        async def motion_of():
            fr = [await still(pg, t, 180, 320) for t in TS]; sh = [shift(fr[i], fr[i + 1]) for i in range(len(fr) - 1)]
            return float(np.mean([math.hypot(*v) for v in sh])), fr
        m0, fr0 = await motion_of()
        await tool(pg, vid, 'stab'); await pg.click('#stabLevels .chipbtn[data-v="med"]'); await pg.wait_for_function('studio.find(studio.S.project, studio.S.sel)?.clip.stab', timeout=120000); await pg.wait_for_timeout(400)
        st = await clip(pg, vid); stab = st['stab']; log('  analysis', stab['n'], 'frames', stab['pts'], 'points/frame', 'zoom', stab['zoom'], stab.get('secs'), 's')
        await shot(pg, 'b10-stabilise.png'); await close(pg)
        m_med, frm = await motion_of()
        raw = stab['raw']; est = [(raw['x'][i + 1] - raw['x'][i]) * stab['w'] * 360 / stab['w'], (raw['y'][i + 1] - raw['y'][i]) * 640] if False else None
        truth = [jitter(n) for n in range(90)]; ex = [(truth[i + 1][0] - truth[i][0]) for i in range(89)]; gx = [(raw['x'][i + 1] - raw['x'][i]) * 360 for i in range(89)]
        corr = float(np.corrcoef(ex, [-v for v in gx])[0, 1]) if len(gx) == 89 else 0
        ok(abs(corr) > .95, f'tracked camera path matches the real shake (corr {corr:.3f})')
        ok(m_med < m0 * .35, f'medium: frame-to-frame motion {m0:.2f}px -> {m_med:.2f}px')
        ok(1.02 < stab['zoom'] <= 1.41, f"crop zoom {stab['zoom']} hides the moving edges")
        edge = float(np.mean([f[:6].mean() for f in frm] + [f[-6:].mean() for f in frm] + [f[:, :4].mean() for f in frm]))
        ok(edge > 40, f'no black borders after stabilising (edge mean {edge:.0f})')
        res = {'med': m_med}; rough = {}
        def roughness(st_):
            path = np.array(st_['raw']['x']) + np.array(st_['dx']); return float(np.abs(np.diff(path, 2)).mean() * 1e4)
        rough['med'] = roughness(stab)
        for lv in ('low', 'high'):
            t0 = time.time(); st_ = await P(pg, f'(async()=>{{studio.select("{vid}"); return await studio.motion.stab("{vid}","{lv}")}})()'); dt = time.time() - t0
            res[lv], _ = await motion_of(); rough[lv] = roughness(st_); log(f'  {lv}: {res[lv]:.2f}px ({dt:.1f}s) path roughness {rough[lv]:.2f}')
        ok(all(v < m0 * .3 for v in res.values()), f"all levels steady the shake (low {res['low']:.2f}, med {res['med']:.2f}, high {res['high']:.2f} px)")
        ok(rough['low'] > rough['med'] > rough['high'], f"higher level = smoother camera path ({rough['low']:.2f} > {rough['med']:.2f} > {rough['high']:.2f})")
        ok(dt < 3, 'changing the level re-uses the analysis (fast)')
        metrics['stab'] = {'before': round(m0, 2), **{k: round(v, 2) for k, v in res.items()}, 'zoom': stab['zoom'], 'pts': stab['pts']}
        await P(pg, f'studio.motion.stab("{vid}","med")')
        await P(pg, 'studio.select(null)'); f = await export(pg, 'stab'); worst = 0
        for t in (.8, 1.5, 2.2):
            d = float(np.abs(small(frame(f, t, f's{t}.png')) - await still(pg, t, 90, 160)).mean()); worst = max(worst, d); ok(d < 10, f'stabilised: preview == export at {t}s ({d:.1f})')
        metrics['stab_parity'] = round(worst, 2)
        await P(pg, f'studio.motion.stab("{vid}","off")'); ok(not (await clip(pg, vid)).get('stab'), 'Off removes stabilisation')

        log('== motion tracking')
        await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[])})')
        await pg.set_input_files('#fileMedia', [str(OUT / 'ball.mp4')]); await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===1', timeout=30000); await pg.wait_for_timeout(400)
        await P(pg, 'document.querySelector("#fileMedia").value=""'); await P(pg, 'window.__pickOverlay=1')
        await P(pg, '''(async()=>{const r=await fetch(location.origin+"/__ring"); })()''') if False else None
        ring = base64.b64encode((OUT / 'ring.png').read_bytes()).decode()
        sid = await P(pg, f'''(async()=>{{const b=await (await fetch("data:image/png;base64,{ring}")).blob(); const rec=await studio.importFile(new File([b],"ring.png",{{type:"image/png"}}));
           let id; studio.act(p=>{{const c=studio.project.newClip("image",{{mediaId:rec.id,dur:3,transform:{{x:.25,y:.5,scale:.2,rotation:0,opacity:1}}}}); studio.project.addToKind(p,"overlay",c,0); id=c.id}}); return id}})()''')
        await seek(pg, 0); await tool(pg, sid, 'track')
        await pg.click('#trackPick'); await pg.wait_for_timeout(200)
        cvb = await pg.locator('#preview').bounding_box(); bx, by = ball_pos(0)
        await pg.mouse.click(cvb['x'] + cvb['width'] * bx, cvb['y'] + cvb['height'] * by)
        await pg.wait_for_function(f'!!studio.find(studio.S.project,"{sid}").clip.tracked', timeout=120000); await pg.wait_for_timeout(300)
        await shot(pg, 'b10-track.png'); await close(pg)
        c = await clip(pg, sid); errs_ = []
        for t in [i / 10 for i in range(0, 29)]:
            x = await P(pg, f'studio.propAt(studio.find(studio.S.project,"{sid}").clip,"x",{t})'); y = await P(pg, f'studio.propAt(studio.find(studio.S.project,"{sid}").clip,"y",{t})')
            tx, ty = ball_pos(t); errs_.append(math.hypot(x - tx, (y - ty) * 640 / 360))
        ok(max(errs_) < .03, f"point tracker: sticker follows the ball (max err {max(errs_)*360:.1f}px of 360, {c['tracked']['pts']} keyframes)")
        ok(c['tracked']['pts'] < 45, 'tracking keyframes are simplified')
        metrics['track_point_err_px'] = round(max(errs_) * 360, 2)
        await P(pg, f'(async()=>{{studio.select("{sid}"); studio.player.seek(0); await studio.motion.track("{sid}",{ball_pos(0)[0]},{ball_pos(0)[1]},{{mode:"area",size:.2}})}})()')
        errs_ = []
        for t in [i / 10 for i in range(0, 29)]:
            x = await P(pg, f'studio.propAt(studio.find(studio.S.project,"{sid}").clip,"x",{t})'); y = await P(pg, f'studio.propAt(studio.find(studio.S.project,"{sid}").clip,"y",{t})')
            tx, ty = ball_pos(t); errs_.append(math.hypot(x - tx, (y - ty) * 640 / 360))
        ok(max(errs_) < .03, f'area tracker follows too (max err {max(errs_)*360:.1f}px)')
        metrics['track_area_err_px'] = round(max(errs_) * 360, 2)
        a = await still(pg, 2.0); tx, ty = ball_pos(2.0); ring_px = a[int(ty * 640) - 25:int(ty * 640) + 25, int(tx * 360) - 25:int(tx * 360) + 25]
        ok(float((ring_px.min(2) > 200).mean()) > .05, 'the ring sits on the ball at 2 s')
        f = await export(pg, 'track'); worst = 0
        for t in (.5, 1.5, 2.5):
            d = float(np.abs(small(frame(f, t, f't{t}.png')) - await still(pg, t, 90, 160)).mean()); worst = max(worst, d); ok(d < 10, f'tracked: preview == export at {t}s ({d:.1f})')

        log('== keyframe graph editor (bezier) + copy / paste')
        await edit(pg, sid, 'delete c.tracked; c.keyframes={x:[{t:0,v:.3,ease:"linear"},{t:2,v:.7,ease:"linear"}],y:[{t:0,v:.5,ease:"linear"},{t:2,v:.5,ease:"linear"}]}')
        await seek(pg, .5); await tool(pg, sid, 'graph')
        ok(await P(pg, '!!document.querySelector("#graphCv")'), 'Graph tool opens the keyframe graph')
        await pg.click('.graphprops .chipbtn[data-v="x"]'); await pg.click('.bzpresets .chipbtn[data-v="easeInOut"]'); await pg.wait_for_timeout(150)
        k = (await clip(pg, sid))['keyframes']['x'][0]
        ok(k['ease'] == 'bezier' and k['bz'] == [.42, 0, .58, 1], f'bezier preset on the segment {k}')
        v = await P(pg, f'studio.propAt(studio.find(studio.S.project,"{sid}").clip,"x",.5)')
        exp = .3 + .4 * 0.129; ok(abs(v - exp) < .005, f'bezier ease-in-out evaluated: x(0.5s) = {v:.4f} (expected {exp:.4f})')
        bb = await pg.locator('#graphCv').bounding_box()
        hd = await P(pg, '''(()=>{const c=document.querySelector('#graphCv'); return [c.width,c.height]})()''')
        # drag the first handle (at 0.42 of the segment, near the start value) upwards
        def to_css(px, py): return bb['x'] + px / hd[0] * bb['width'], bb['y'] + py / hd[1] * bb['height']
        rg = await P(pg, f'''(()=>{{const c=studio.find(studio.S.project,"{sid}").clip; let lo=1e9,hi=-1e9; for(let i=0;i<=60;i++){{const v=studio.propAt(c,"x",3*i/60); lo=Math.min(lo,v); hi=Math.max(hi,v)}} for(const k of c.keyframes.x){{lo=Math.min(lo,k.v);hi=Math.max(hi,k.v)}} const pad=(hi-lo)*.15; return [lo-pad,hi+pad,3]}})()''')
        Mx = lambda t: 30 + t / rg[2] * (hd[0] - 50); My = lambda v: 24 + (1 - (v - rg[0]) / (rg[1] - rg[0])) * (hd[1] - 54)
        sx, sy = to_css(Mx(.42 * 2), My(.3)); ex_, ey_ = to_css(Mx(.42 * 2), My(.6))
        await pg.mouse.move(sx, sy); await pg.mouse.down(); await pg.mouse.move(ex_, ey_, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(150)
        k = (await clip(pg, sid))['keyframes']['x'][0]
        ok(k['bz'][1] > .5, f'dragging a handle bends the curve {k["bz"]}')
        rg = await P(pg, f'''(()=>{{const c=studio.find(studio.S.project,"{sid}").clip; let lo=1e9,hi=-1e9; for(let i=0;i<=60;i++){{const v=studio.propAt(c,"x",3*i/60); lo=Math.min(lo,v); hi=Math.max(hi,v)}} for(const k of c.keyframes.x){{lo=Math.min(lo,k.v);hi=Math.max(hi,k.v)}} const pad=(hi-lo)*.15; return [lo-pad,hi+pad,3]}})()''')
        sx, sy = to_css(Mx(2), My(.7)); ex_, ey_ = to_css(Mx(2.4), My(.8))
        await pg.mouse.move(sx, sy); await pg.mouse.down(); await pg.mouse.move(ex_, ey_, steps=6); await pg.mouse.up(); await pg.wait_for_timeout(150)
        kk = (await clip(pg, sid))['keyframes']
        ok(abs(kk['x'][1]['t'] - 2.4) < .08 and abs(kk['x'][1]['v'] - .8) < .03 and abs(kk['y'][1]['t'] - kk['x'][1]['t']) < 1e-3, f"dragging a ◆ moves its time + value (and the other props at that moment) {kk['x'][1]}")
        await shot(pg, 'b10-graph.png')
        await pg.click('#kfCopy'); await close(pg)
        await P(pg, f'''(async()=>{{const b=await (await fetch("data:image/png;base64,{ring}")).blob(); const rec=await studio.importFile(new File([b],"ring2.png",{{type:"image/png"}}));
           studio.act(p=>{{const c=studio.project.newClip("image",{{mediaId:rec.id,dur:3,transform:{{x:.5,y:.3,scale:.15,rotation:0,opacity:1}}}}); studio.project.addToKind(p,"overlay",c,0); window.__s2=c.id}})}})()''')
        s2 = await P(pg, 'window.__s2'); await seek(pg, .5); await tool(pg, s2, 'graph') if await P(pg, f'studio.project.hasKeyframes(studio.find(studio.S.project,"{s2}").clip)') else None
        n = await P(pg, f'studio.motion.paste("{s2}", .5)')
        k2 = (await clip(pg, s2))['keyframes']
        ok(n == 4 and abs(k2['x'][0]['t'] - .5) < 1e-3 and k2['x'][0]['ease'] == 'bezier' and abs(k2['x'][1]['t'] - 2.9) < .08, f'paste puts the copied keyframes at the playhead ({n}: {[(q["t"], q["v"]) for q in k2["x"]]})')
        await close(pg)
        f = await export(pg, 'graph'); worst = 0
        for t in (.4, 1.1, 1.9):
            d = float(np.abs(small(frame(f, t, f'g{t}.png')) - await still(pg, t, 90, 160)).mean()); worst = max(worst, d); ok(d < 10, f'bezier keyframes: preview == export at {t}s ({d:.1f})')

        log('== smooth slow-mo')
        await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[])})')
        await pg.set_input_files('#fileMedia', [str(ROOT / 'tests/fixtures/ramp.mp4')]); await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===1', timeout=30000); await pg.wait_for_timeout(400)
        rid = await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="main").clips[0].id'); await edit(pg, rid, 'c.out=1')
        await tool(pg, rid, 'slowmo'); await pg.click('#slowSpeeds .chipbtn[data-v=".25"]')
        await pg.wait_for_function(f'!!studio.find(studio.S.project,"{rid}").clip.slowmo', timeout=180000); await pg.wait_for_timeout(500)
        c = await clip(pg, rid); D = await P(pg, f'studio.project.clipDur(studio.find(studio.S.project,"{rid}").clip)')
        ok(abs(D - 4) < .1, f'4× slower: 1 s becomes {D:.2f} s ({c["slowmo"].get("secs")} s to bake)')
        await shot(pg, 'b10-slowmo.png'); await close(pg)
        async def centroids(t0, n):
            out = []
            for i in range(n):
                a = await still(pg, (t0 + i + .5) / 30, 720, 1280); r = a[560:720, :].mean(2).mean(0); w_ = np.clip(r - 60, 0, None); out.append(float((w_ * np.arange(len(r))).sum() / max(1e-6, w_.sum())))
            return np.abs(np.diff(out))
        dc = await centroids(40, 9); still_steps = int((dc < .35).sum())
        ok(still_steps <= 1 and dc.min() > 0, f'frame blending: the bar moves smoothly every frame (steps {np.round(dc, 2).tolist()})')
        metrics['slowmo_steps'] = np.round(dc, 2).tolist()
        await P(pg, f'studio.motion.slowmo("{rid}", 1)'); c = await clip(pg, rid)
        ok(not c.get('slowmo') and abs(c['out'] - 1) < 1e-3, 'Normal restores the original clip')
        await P(pg, f'(async()=>{{await studio.motion.slowmo("{rid}", .5, false)}})()'); await pg.wait_for_timeout(300)
        dc2 = await centroids(20, 9)
        ok(int((dc2 < .35).sum()) >= 3, f'without blending, frames repeat (steps {np.round(dc2, 2).tolist()})')
        ok(not errs, f'no page errors {errs[:3]}')
        await b.close()
    (ROOT / 'tests/motion-metrics.json').write_text(json.dumps(metrics, indent=1))
    log('FAILS:', fails) if fails else log('ALL OK'); sys.exit(1 if fails else 0)
asyncio.run(run())

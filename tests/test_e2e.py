"""Emmavengers Studio end-to-end test (Google Chrome, phone portrait).
   python3 tests/test_e2e.py [shots_dir]      (run with nohup; writes tests/e2e.log)
Imports generated fixtures, trims, splits, reorders, changes speed, adds text, undo/redo, touch long-press move,
autosave reload, exports 720p + 1080p MP4 (WebCodecs) and checks them with ffprobe/ffmpeg (duration, streams,
audio level, full decode), checks frame accuracy (PSNR vs source), rotated MP4 + WebM sources, other ratios,
MediaRecorder fallback, offline reload and the update-ready button."""
import asyncio, sys, functools, http.server, threading, json, subprocess, shutil, tempfile, os, re, time, math
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]; FX = ROOT / 'tests/fixtures'
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-e2e-'))
fails, t_start = [], time.time()
def log(*a): print(f'[{time.time()-t_start:6.1f}s]', *a, flush=True)
def ok(c, msg):
    log(('  ok   ' if c else '  FAIL ') + msg)
    if not c: fails.append(msg)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def end_headers(self): self.send_header('Cache-Control', 'no-cache'); super().end_headers()
    def handle(self):
        try: super().handle()
        except Exception: pass
def serve(root, port):
    s = http.server.ThreadingHTTPServer(('127.0.0.1', port), functools.partial(Q, directory=str(root))); threading.Thread(target=s.serve_forever, daemon=True).start(); return s
def probe(path):
    j = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(path)], capture_output=True, text=True).stdout or '{}')
    return j
def decode_ok(path):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', str(path), '-f', 'null', '-'], capture_output=True, text=True); return r.returncode == 0 and not r.stderr.strip(), r.stderr[-300:]
def decoded_duration(path):
    r = subprocess.run(['ffmpeg', '-i', str(path), '-f', 'null', '-'], capture_output=True, text=True)
    ts = re.findall(r'time=(\d+):(\d+):([\d.]+)', r.stderr); h, m, s = ts[-1]; return int(h) * 3600 + int(m) * 60 + float(s)
def mean_volume(path):
    r = subprocess.run(['ffmpeg', '-i', str(path), '-vn', '-af', 'volumedetect', '-f', 'null', '-'], capture_output=True, text=True)
    m = re.search(r'mean_volume: ([-\d.]+) dB', r.stderr); return float(m.group(1)) if m else -999
def check_video(path, dur, W, H, tag, vcodec=None):
    j = probe(path); st = j.get('streams', []); v = [s for s in st if s['codec_type'] == 'video']; a = [s for s in st if s['codec_type'] == 'audio']
    fd = float(j.get('format', {}).get('duration', 'nan')) if j.get('format', {}).get('duration') not in (None, 'N/A') else decoded_duration(path)
    ok(bool(v) and v[0]['width'] == W and v[0]['height'] == H, f'{tag}: video stream {W}x{H} (got {[(s["codec_name"], s.get("width"), s.get("height")) for s in v]})')
    if vcodec: ok(v and v[0]['codec_name'] == vcodec, f'{tag}: video codec {vcodec} (got {v and v[0]["codec_name"]})')
    ok(bool(a), f'{tag}: has audio stream ({[s["codec_name"] for s in a]})')
    ok(abs(fd - dur) < 0.25, f'{tag}: duration {fd:.2f}s ≈ project {dur:.2f}s')
    d_ok, err = decode_ok(path); ok(d_ok, f'{tag}: decodes cleanly with ffmpeg {err}')
    mv = mean_volume(path); ok(mv > -45, f'{tag}: audio is not silent (mean {mv} dB)')
    return j

OVERFLOW = """()=>{const W=innerWidth,bad=[];document.querySelectorAll('#top *,#transport *,#toolbar,.sheet,.sheet *,#exportView *').forEach(e=>{const r=e.getBoundingClientRect();if(!r.width||e.closest('#toolbar')&&e.id!=='toolbar'||e.parentElement.closest('.chips,.toggles'))return;if(r.left<-1||r.right>W+1)bad.push((e.id||e.className||e.tagName)+':'+Math.round(r.left)+'-'+Math.round(r.right))});return {sw:document.documentElement.scrollWidth,W,bad:bad.slice(0,5)}}"""
async def no_overflow(pg, tag):
    r = await pg.evaluate(OVERFLOW); ok(r['sw'] <= r['W'] + 1 and not r['bad'], f'{tag}: no horizontal overflow {r["bad"]}')

async def new_page(b, port, w=390, h=844, path='/'):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
    pg = await ctx.new_page(); pg.errs = []
    pg.on('console', lambda m: pg.errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: pg.errs.append('PAGEERROR ' + str(e)))
    await pg.goto(f'http://127.0.0.1:{port}{path}'); await pg.wait_for_function('window.studio && studio.ready', timeout=20000)
    return ctx, pg
P = lambda pg, js: pg.evaluate(js)
async def tracks(pg): return await P(pg, 'studio.S.project.tracks.map(t=>({kind:t.kind,clips:t.clips.map(c=>({id:c.id,type:c.type,start:+c.start.toFixed(3),in:c.in,out:c.out,dur:c.dur,speed:c.speed,text:c.text&&c.text.content}))}))')
async def main_clips(pg): return [t for t in await tracks(pg) if t['kind'] == 'main'][0]['clips']
async def tap_tool(pg, tool): await pg.click(f'#toolbar .tool[data-tool="{tool}"]')
async def set_time(pg, t):
    await P(pg, f'(()=>{{const tl=studio.timeline;tl.scroll.scrollLeft=Math.round({t}*tl.pps)}})()'); await pg.wait_for_timeout(250)
    return await P(pg, 'studio.player.t')
async def clip_box(pg, cid): return await pg.locator(f'.clip[data-id="{cid}"]').bounding_box()
async def mouse_drag(pg, x0, y0, x1, y1, steps=12):
    await pg.mouse.move(x0, y0); await pg.mouse.down(); await pg.mouse.move(x0 + 3, y0, steps=2); await pg.mouse.move(x1, y1, steps=steps); await pg.wait_for_timeout(80); await pg.mouse.up(); await pg.wait_for_timeout(250)
async def export_ui(pg, res, tag, fname):
    await pg.click('#exportBtn'); await pg.wait_for_selector('#exGo')
    await pg.click(f'#exRes .chipbtn[data-v="{res}"]'); await pg.wait_for_timeout(300)
    if fname == 'first': await pg.screenshot(path=str(SHOTS / 'export-screen-390.png')); log('  shot export-screen-390.png')
    t0 = time.time(); await pg.click('#exGo')
    await pg.wait_for_selector('#exDone:not([hidden])', timeout=240000)
    info = await P(pg, '({codec:studioLastExport.codec,path:studioLastExport.path,sec:studioLastExport.seconds,src:studioLastExport.sources,dur:studioLastExport.duration})')
    log(f'  {tag}: exported in {time.time()-t0:.1f}s', info)
    if fname == 'first': await pg.wait_for_timeout(600); await pg.screenshot(path=str(SHOTS / 'export-done-desktop-390.png')); log('  shot export-done-desktop-390.png')
    async with pg.expect_download() as dl: await pg.click('#exSave')
    d = await dl.value; path = OUT / (tag + '_' + d.suggested_filename); await d.save_as(str(path))
    await pg.click('#exBack'); await pg.wait_for_timeout(300)
    return path, info

async def run():
    serve(ROOT, 8721)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--autoplay-policy=no-user-gesture-required'])
        log('== editor flow (390x844)')
        ctx, pg = await new_page(b, 8721)
        await no_overflow(pg, 'empty editor')
        async with pg.expect_file_chooser() as fc: await tap_tool(pg, 'media')
        await (await fc.value).set_files([str(FX / 'video.mp4'), str(FX / 'image.png')])
        await pg.wait_for_function('studio.S.project.tracks[0].clips.length===2', timeout=20000)
        async with pg.expect_file_chooser() as fc: await tap_tool(pg, 'audio')
        await (await fc.value).set_files([str(FX / 'music.mp3')])
        await pg.wait_for_function("studio.S.project.tracks.some(t=>t.kind==='audio')", timeout=20000)
        await pg.wait_for_function("[...studio.media.values()].every(m=>m.type==='image'||m.peaks!==undefined)&&[...studio.media.values()].every(m=>m.type!=='video'||m.thumbBitmap)", timeout=20000)
        T = await tracks(pg); mc = await main_clips(pg)
        ok([c['type'] for c in mc] == ['video', 'image'] and abs(mc[0]['out'] - 6) < 0.05, f'import: main = video(6s) + image ({[(c["type"], c["out"] or c["dur"]) for c in mc]})')
        ok(any(t['kind'] == 'audio' and len(t['clips']) == 1 for t in T), 'import: audio track with music')
        dur = await P(pg, 'studio.projectDuration(studio.S.project)'); ok(abs(dur - 9) < 0.01, f'project duration 9s (got {dur})')
        # trim: select video, drag right handle left by 1 second
        vid = mc[0]['id']; await set_time(pg, 4.5)
        bx = await clip_box(pg, vid); await pg.mouse.click(bx['x'] + bx['width'] / 2, bx['y'] + bx['height'] / 2); await pg.wait_for_timeout(200)
        ok(await P(pg, 'studio.S.sel') == vid, 'tap selects clip')
        hb = await pg.locator('.clip.sel .h.r').bounding_box(); pps = await P(pg, 'studio.timeline.pps')
        await mouse_drag(pg, hb['x'] + hb['width'] / 2, hb['y'] + hb['height'] / 2, hb['x'] + hb['width'] / 2 - pps * 1.0, hb['y'] + hb['height'] / 2)
        mc = await main_clips(pg); ok(abs(mc[0]['out'] - 5.0) < 0.12, f'trim right edge: out {mc[0]["out"]:.2f} ≈ 5.0')
        # trim left edge by 0.5 s
        hb = await pg.locator('.clip.sel .h.l').bounding_box()
        await mouse_drag(pg, hb['x'] + hb['width'] / 2, hb['y'] + hb['height'] / 2, hb['x'] + hb['width'] / 2 + pps * 0.5, hb['y'] + hb['height'] / 2)
        mc = await main_clips(pg); ok(abs(mc[0]['in'] - 0.5) < 0.12 and mc[0]['start'] == 0, f'trim left edge: in {mc[0]["in"]:.2f} ≈ 0.5, still starts at 0')
        # split at 2.0 s
        t = await set_time(pg, 2.0); ok(abs(t - 2.0) < 0.05, f'scrolling the timeline moves the playhead (t={t:.2f})')
        await tap_tool(pg, 'split'); await pg.wait_for_timeout(200)
        mc = await main_clips(pg)
        ok(len(mc) == 3 and abs(mc[0]['out'] - (mc[0]['in'] + 2.0)) < 0.05 and abs(mc[1]['in'] - mc[0]['out']) < 1e-6, f'split: 3 clips {[(c["type"], c["in"], c["out"]) for c in mc]}')
        # reorder: drag image (last) to the front
        img = mc[2]['id']; await P(pg, 'studio.select(null)'); await pg.wait_for_timeout(100)
        await P(pg, 'studio.timeline.setZoom(20)'); await set_time(pg, 0)
        bi = await clip_box(pg, img); b0 = await clip_box(pg, mc[0]['id'])
        await mouse_drag(pg, bi['x'] + bi['width'] / 2, bi['y'] + bi['height'] / 2, b0['x'] - 20, bi['y'] + bi['height'] / 2, steps=25)
        mc = await main_clips(pg); ok(mc[0]['id'] == img, f'reorder: image moved to the front ({[c["type"] for c in mc]})')
        # speed 2x on the second video part
        part2 = [c for c in mc if c['type'] == 'video'][1]; await P(pg, f'studio.select("{part2["id"]}")'); await pg.wait_for_timeout(150)
        before_d = part2['out'] - part2['in']
        await tap_tool(pg, 'speed'); await pg.click('.sheet .chipbtn[data-v="2"]'); await pg.wait_for_timeout(150)
        await pg.click('.sh-done')
        mc = await main_clips(pg); p2 = [c for c in mc if c['id'] == part2['id']][0]
        ok(p2['speed'] == 2 and abs(await P(pg, f'(()=>{{const f=studio.find(studio.S.project,"{part2["id"]}");return (f.clip.out-f.clip.in)/f.clip.speed}})()') - before_d / 2) < 0.01, f'speed 2x: clip now {before_d/2:.2f}s')
        # volume 50% on the music
        aud = [t for t in await tracks(pg) if t['kind'] == 'audio'][0]['clips'][0]['id']
        await P(pg, f'studio.select("{aud}")'); await pg.wait_for_timeout(100); await tap_tool(pg, 'volume'); await pg.click('.sheet .chipbtn[data-v="0.5"]'); await pg.click('.sh-done')
        ok(await P(pg, f'studio.find(studio.S.project,"{aud}").clip.volume') == 0.5, 'volume 50% on music')
        # text
        await P(pg, 'studio.select(null)'); await set_time(pg, 1.0); await pg.wait_for_timeout(100)
        await tap_tool(pg, 'text'); await pg.wait_for_selector('#textInput')
        await pg.fill('#textInput', 'Jesus loves me!'); await pg.click('.sheet .swatches .chipbtn[data-v="#ffcc33"]')
        await P(pg, "(()=>{const r=document.querySelector('#textSize');r.value=120;r.dispatchEvent(new Event('input'))})()")
        await pg.wait_for_timeout(300); await pg.screenshot(path=str(SHOTS / 'text-editing-390.png')); log('  shot text-editing-390.png')
        await no_overflow(pg, 'text sheet')
        await pg.click('.sh-done'); await pg.wait_for_timeout(150)
        T = await tracks(pg); tx = [t for t in T if t['kind'] == 'text']
        ok(tx and tx[0]['clips'][0]['text'] == 'Jesus loves me!' and abs(tx[0]['clips'][0]['start'] - 1.0) < 0.05, f'text clip added at 1.0s: {tx and tx[0]["clips"][0]}')
        tcol = await P(pg, f'studio.find(studio.S.project,"{tx[0]["clips"][0]["id"]}").clip.text')
        ok(tcol['color'] == '#ffcc33' and tcol['size'] == 120, f'text colour + size ({tcol["color"]}, {tcol["size"]})')
        # undo / redo
        snap = await P(pg, 'JSON.stringify(studio.S.project)')
        await pg.click('#undoBtn'); await pg.wait_for_timeout(100)
        ok(not any(t['kind'] == 'text' and t['clips'] and t['clips'][0]['text'] == 'Jesus loves me!' for t in await tracks(pg)), 'undo reverts the text edit')
        await pg.click('#redoBtn'); await pg.wait_for_timeout(100)
        await pg.click('#redoBtn') if await P(pg, '!document.querySelector("#redoBtn").disabled') else None
        ok(await P(pg, 'JSON.stringify(studio.S.project)') == snap, 'redo restores it exactly')
        # duplicate + delete
        tid = tx[0]['clips'][0]['id']; await P(pg, f'studio.select("{tid}")'); await pg.wait_for_timeout(100)
        await tap_tool(pg, 'duplicate'); n = sum(len(t['clips']) for t in await tracks(pg) if t['kind'] == 'text'); ok(n == 2, 'duplicate text clip')
        await tap_tool(pg, 'delete'); n = sum(len(t['clips']) for t in await tracks(pg) if t['kind'] == 'text'); ok(n == 1, 'delete clip')
        # touch: long-press + drag the text clip 1 s to the right
        await P(pg, f'studio.select("{tid}")'); await set_time(pg, 1.0); await pg.wait_for_timeout(150)
        bt = await clip_box(pg, tid); cdp = await ctx.new_cdp_session(pg); pps = await P(pg, 'studio.timeline.pps')
        x, y = bt['x'] + bt['width'] / 2, bt['y'] + bt['height'] / 2
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': x, 'y': y}]}); await pg.wait_for_timeout(550)
        for i in range(1, 13): await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': x + pps * 1.0 * i / 12, 'y': y}]}); await pg.wait_for_timeout(16)
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); await pg.wait_for_timeout(300)
        st = await P(pg, f'studio.find(studio.S.project,"{tid}").clip.start'); ok(abs(st - 2.0) < 0.15, f'touch long-press drag moves text clip to ~2.0s (got {st:.2f})')
        # touch swipe on the timeline scrolls (scrubs) instead of moving clips
        t_before = await P(pg, 'studio.player.t')
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': 300, 'y': y}]})
        for i in range(1, 10): await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': 300 - 15 * i, 'y': y}]}); await pg.wait_for_timeout(16)
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); await pg.wait_for_timeout(500)
        ok(await P(pg, 'studio.player.t') > t_before + 0.3 and abs(await P(pg, f'studio.find(studio.S.project,"{tid}").clip.start') - st) < 1e-6, 'touch swipe scrubs the timeline and leaves clips in place')
        # move text on the preview by dragging
        await set_time(pg, 2.5); await P(pg, f'studio.select("{tid}")'); await pg.wait_for_timeout(200)
        cb = await pg.locator('#preview').bounding_box()
        await mouse_drag(pg, cb['x'] + cb['width'] / 2, cb['y'] + cb['height'] / 2, cb['x'] + cb['width'] / 2, cb['y'] + cb['height'] * 0.25)
        ty = await P(pg, f'studio.find(studio.S.project,"{tid}").clip.transform.y'); ok(abs(ty - 0.25) < 0.03, f'drag on preview moves text up (y={ty:.2f})')
        # play a bit: clock advances, no errors
        await set_time(pg, 0); await pg.click('#playBtn'); await pg.wait_for_timeout(1500); await pg.click('#playBtn')
        pt = await P(pg, 'studio.player.t'); ok(0.8 < pt < 2.2, f'playback advances in real time (t={pt:.2f} after 1.5s)')
        # accurate seek: preview draws the right video frame (video starts at image end)
        await P(pg, 'studio.select(null)'); await set_time(pg, 2.0); await pg.wait_for_timeout(600)
        await pg.screenshot(path=str(SHOTS / 'editor-clips-390.png')); log('  shot editor-clips-390.png')
        await no_overflow(pg, 'editor with clips')
        await P(pg, f'studio.select("{vid}")'); await pg.wait_for_timeout(200); await pg.screenshot(path=str(SHOTS / 'editor-clip-selected-390.png')); log('  shot editor-clip-selected-390.png')
        await P(pg, 'studio.select(null)')
        # autosave + reload
        await P(pg, 'studio.save()'); snap = await P(pg, 'JSON.stringify({...studio.S.project,updated:0})')
        await pg.reload(); await pg.wait_for_function('window.studio && studio.ready', timeout=20000)
        ok(await P(pg, 'JSON.stringify({...studio.S.project,updated:0})') == snap, 'reload: project restored from IndexedDB')
        ok(await P(pg, '[...studio.media.values()].length') == 3 and await P(pg, '[...studio.media.values()].every(m=>m.url)'), 'reload: 3 media files restored')
        await pg.wait_for_timeout(500)
        # export 720p + 1080p
        dur = await P(pg, 'studio.projectDuration(studio.S.project)')
        f720, i720 = await export_ui(pg, 720, 'exp720', 'first')
        check_video(f720, dur, 720, 1280, 'export 720p', 'h264')
        f1080, i1080 = await export_ui(pg, 1080, 'exp1080', '')
        check_video(f1080, dur, 1080, 1920, 'export 1080p', 'h264')
        # text visible in exported frame at 2.5 s (gold pixels near y=25%)
        fr = OUT / 'fr.png'; subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', '2.5', '-i', str(f720), '-frames:v', '1', str(fr)])
        from PIL import Image
        im = Image.open(fr).convert('RGB'); W, H = im.size
        gold = sum(1 for xx in range(0, W, 3) for yy in range(int(H * .18), int(H * .32), 3) if (lambda c: c[0] > 200 and 150 < c[1] < 230 and c[2] < 110)(im.getpixel((xx, yy))))
        ok(gold > 150, f'exported frame shows the gold text near the top ({gold} gold samples)')
        ok(not pg.errs, f'editor: no console errors {pg.errs[:3]}')
        for w in (360, 412):
            await pg.set_viewport_size({'width': w, 'height': 800 if w == 360 else 915}); await pg.wait_for_timeout(400)
            await no_overflow(pg, f'editor {w}px'); await pg.screenshot(path=str(SHOTS / f'editor-clips-{w}.png'))
        await pg.set_viewport_size({'width': 390, 'height': 844})
        # offline: service worker serves the app; project + media still there
        await pg.reload(); await pg.wait_for_function('window.studio && studio.ready', timeout=20000)
        await pg.wait_for_function('navigator.serviceWorker.controller', timeout=20000)
        await pg.wait_for_function("caches.keys().then(k=>k.some(x=>x.startsWith('ev-studio-')))", timeout=20000); await pg.wait_for_timeout(1500)
        await ctx.set_offline(True); await pg.reload(); await pg.wait_for_function('window.studio && studio.ready', timeout=20000)
        ok(await P(pg, 'JSON.stringify({...studio.S.project,updated:0})') == snap, 'offline reload: editor + project load from the service worker')
        fo, _ = await export_ui(pg, 720, 'offline720', '')
        check_video(fo, dur, 720, 1280, 'offline export')
        await ctx.set_offline(False); await ctx.close()

        log('== frame accuracy + 16:9 (video only)')
        ctx, pg = await new_page(b, 8721)
        await pg.set_input_files('#fileMedia', [str(FX / 'video.mp4')]); await pg.wait_for_function('studio.S.project.tracks[0].clips.length===1', timeout=20000)
        await tap_tool(pg, 'ratio'); await pg.click('.sheet .chipbtn[data-v="16:9"]'); await pg.click('.sh-done')
        ok(await P(pg, 'studio.S.project.aspect') == '16:9', 'ratio 16:9 selected')
        cvs = await pg.locator('#preview').bounding_box(); ok(abs(cvs['width'] / cvs['height'] - 16 / 9) < 0.02, f'preview canvas is 16:9 ({cvs["width"]:.0f}x{cvs["height"]:.0f})')
        f169, _ = await export_ui(pg, 720, 'exp169', '')
        check_video(f169, 6.0, 1280, 720, 'export 16:9')
        def psnr(off):
            e = f'[0:v]trim=start_frame={max(0,-off)},setpts=PTS-STARTPTS[e]'; r_ = f'[1:v]trim=start_frame={max(0,off)},scale=1280:720:flags=bicubic,setpts=PTS-STARTPTS[r]'
            r = subprocess.run(['ffmpeg', '-i', str(f169), '-i', str(FX / 'video.mp4'), '-filter_complex', f'{e};{r_};[e][r]psnr', '-f', 'null', '-'], capture_output=True, text=True)
            m = re.search(r'average:([\d.]+|inf)', r.stderr); return float(m.group(1)) if m and m.group(1) != 'inf' else 99
        ps = {o: psnr(o) for o in (-1, 0, 1)}
        ok(ps[0] > max(ps[-1], ps[1]) + 1.5 and ps[0] > 20, f'frame-exact export: best match at offset 0 (PSNR {ps})')
        await tap_tool(pg, 'ratio'); await pg.click('.sheet .chipbtn[data-v="1:1"]'); await pg.click('.sh-done')
        f11, _ = await export_ui(pg, 1080, 'exp11', ''); check_video(f11, 6.0, 1080, 1080, 'export 1:1 1080p')
        ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

        log('== rotated MP4 + WebM sources, overlay, image clip')
        ctx, pg = await new_page(b, 8721)
        await pg.set_input_files('#fileMedia', [str(FX / 'rotated.mp4'), str(FX / 'clip.webm')]); await pg.wait_for_function('studio.S.project.tracks[0].clips.length===2', timeout=20000)
        async with pg.expect_file_chooser() as fc: await tap_tool(pg, 'overlay')
        await (await fc.value).set_files([str(FX / 'image.png')])
        await pg.wait_for_function("studio.S.project.tracks.some(t=>t.kind==='overlay')", timeout=20000)
        await set_time(pg, 1.0); await P(pg, 'studio.select(null)'); await pg.wait_for_timeout(800)
        prev = OUT / 'prev_rot.png'; await pg.locator('#preview').screenshot(path=str(prev))
        fr_, inf = await export_ui(pg, 720, 'exprot', '')
        check_video(fr_, 8.0, 720, 1280, 'rotated+webm export')
        ok(inf['src'] == {'decoder': 1, 'seek': 1}, f'MP4 uses WebCodecs decoder, WebM uses seek fallback ({inf["src"]})')
        ex = OUT / 'ex_rot.png'; subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', '1.0', '-i', str(fr_), '-frames:v', '1', str(ex)])
        a = Image.open(prev).convert('RGB'); e = Image.open(ex).convert('RGB').resize(a.size)
        def grid(im):
            W, H = im.size; return [im.crop((int(W * i / 4), int(H * j / 8), int(W * (i + 1) / 4), int(H * (j + 1) / 8))).resize((1, 1), Image.BILINEAR).getpixel((0, 0)) for i in range(4) for j in range(8)]
        diff = max(sum(abs(x - y) for x, y in zip(c1, c2)) for c1, c2 in zip(grid(a), grid(e)))
        ok(diff < 90, f'rotated video: export matches preview orientation (max cell diff {diff})')
        ok(not pg.errs, f'no console errors {pg.errs[:3]}')
        log('== MediaRecorder fallback (?export=recorder)')
        await pg.goto('http://127.0.0.1:8721/?export=recorder'); await pg.wait_for_function('window.studio && studio.ready', timeout=20000)
        await P(pg, "(()=>{const t=studio.S.project.tracks.find(t=>t.kind==='main');t.clips.splice(1)})()")
        await P(pg, "studio.act(p=>{})")
        fm, im_ = await export_ui(pg, 720, 'exprec', '')
        ok(im_['path'] == 'recorder', f'fallback path used ({im_["path"]}, {im_["codec"]})')
        dd = decoded_duration(fm); ok(abs(dd - 4.0) < 0.6, f'recorder export duration {dd:.2f}s ≈ 4s')
        j = probe(fm); ok(any(s['codec_type'] == 'video' for s in j['streams']) and any(s['codec_type'] == 'audio' for s in j['streams']), f'recorder export has video + audio {[s["codec_name"] for s in j["streams"]]}')
        await ctx.close()

        log('== update-ready button')
        tmp = Path(tempfile.mkdtemp(prefix='studio-upd-')) / 'site'; shutil.copytree(ROOT, tmp, ignore=shutil.ignore_patterns('.git', 'tests'))
        serve(tmp, 8722)
        ctx, pg = await new_page(b, 8722)
        await pg.wait_for_function('navigator.serviceWorker.controller', timeout=20000); await pg.wait_for_timeout(500)
        await pg.set_input_files('#fileMedia', [str(FX / 'image.png')]); await pg.wait_for_function('studio.S.project.tracks[0].clips.length===1'); await P(pg, 'studio.save()')
        b1 = await P(pg, 'new Promise(r=>{navigator.serviceWorker.addEventListener("message",e=>e.data.build&&r(e.data.build));navigator.serviceWorker.controller.postMessage("build")})')
        (tmp / 'css/studio.css').write_text((tmp / 'css/studio.css').read_text() + '\n/* update test */\n')
        subprocess.run(['python3', str(tmp / 'tools/build_sw.py')], check=True, capture_output=True)
        await P(pg, 'navigator.serviceWorker.getRegistration().then(r=>r.update())')
        await pg.wait_for_selector('#updBtn', timeout=20000); ok(True, 'update button appears when a new version is published')
        await pg.screenshot(path=str(SHOTS / 'update-ready-390.png'))
        async with pg.expect_navigation(timeout=20000): await pg.click('#updBtn')
        await pg.wait_for_function('window.studio && studio.ready', timeout=20000); await pg.wait_for_timeout(800)
        b2 = await P(pg, 'new Promise(r=>{navigator.serviceWorker.addEventListener("message",e=>e.data.build&&r(e.data.build));navigator.serviceWorker.controller.postMessage("build")})')
        ok(b1 != b2, f'after tapping, the new version runs ({b1} -> {b2})')
        ok(await P(pg, 'studio.S.project.tracks[0].clips.length') == 1, 'project kept across the update')
        await ctx.close(); await b.close()
    log(f'RESULT: {"PASS" if not fails else "FAIL"} ({len(fails)} failures) in {time.time()-t_start:.0f}s')
    for f in fails: log('  -', f)
    sys.exit(1 if fails else 0)
asyncio.run(run())

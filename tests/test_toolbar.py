"""Batch 14 — InShot-style editor toolbar (Google Chrome, 390x844 phone).   python3 tests/test_toolbar.py [shots_dir]
main tool row order, clip tool row (+ back), text / audio context rows, subtle cut icons on the timeline -> transition picker, every tool opens."""
import asyncio, sys, functools, http.server, threading, subprocess, tempfile, time, base64
from pathlib import Path
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-tb-')); fails = []; T0 = time.time(); PORT = 8799
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
MAIN = ['text', 'stickers', 'audio', 'sounds', 'effects', 'rootfilter', 'bg', 'overlay', 'elements', 'captions', 'record', 'speech', 'adjlayer', 'mix', 'media']
VIDEO = ['split', 'delete', 'speed', 'volume', 'anim', 'transition', 'crop', 'hd', 'filters', 'adjust', 'enhvoice', 'voicefx', 'cutout', 'mask', 'opacity', 'blend', 'replace', 'duplicate', 'rotate', 'freeze', 'capture', 'reverse', 'stab', 'keyframe', 'clipbg', 'extract']
async def row(pg): return await P(pg, '[...document.querySelectorAll("#toolbar .tool")].map(b=>b.dataset.tool)')
async def shot(pg, name, wait=500): await pg.wait_for_timeout(wait); await pg.screenshot(path=str(SHOTS / name)); log('  shot', name)
async def sheet_open(pg): return await P(pg, '!document.querySelector("#sheet").classList.contains("hidden")')
async def close(pg):
    await P(pg, 'document.querySelector(".sh-done")?.click()'); await pg.wait_for_timeout(250)
    if await sheet_open(pg): await P(pg, 'document.querySelector("#sheet .sh-close, #sheet [data-close]")?.click()'); await pg.wait_for_timeout(250)
def assets():
    for n, c in (('red', (220, 40, 40)), ('green', (40, 200, 70))):
        im = Image.new('RGB', (360, 640), c); d = ImageDraw.Draw(im); d.rectangle([40, 40, 320, 200], fill=(250, 250, 250)); im.save(OUT / f'{n}.png')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=30:d=3', '-f', 'lavfi', '-i', 'sine=f=440:d=3', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', str(OUT / 'av.mp4')], check=True)

async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    assets()
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=30000)
        await P(pg, 'studio.home && studio.home.hide && studio.home.hide()'); await pg.wait_for_timeout(300)
        await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[])})')
        await pg.set_input_files('#fileMedia', [str(OUT / 'av.mp4'), str(OUT / 'red.png'), str(OUT / 'green.png')]); await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===3', timeout=60000)
        await P(pg, 'studio.select(null); studio.timeline.setZoom(40)'); await pg.wait_for_timeout(400)

        log('== b16 compact timeline (only the main track)')
        ok(await P(pg, 'document.querySelectorAll(".rowhint").length') == 0, 'no dashed "Add video" / "Add audio" lanes')
        th = await P(pg, 'document.querySelector("#timeline").getBoundingClientRect().height'); ok(th <= 95, f'timeline is just strip + ruler ({th:.0f}px)')
        tt = await P(pg, 'document.querySelector("#toolbar").getBoundingClientRect().top'); ok(tt >= 844 * 0.78, f'tool row sits low like InShot (top {tt:.0f}px = {tt/844:.0%})')
        sh = await P(pg, 'document.querySelector("#stage").getBoundingClientRect().height'); ok(sh >= 560, f'preview gets the space ({sh:.0f}px)')
        await shot(pg, 'b16-editor-390.png')
        log('== main tool row')
        r = await row(pg); ok(r[:len(MAIN)] == MAIN, f'main row order Text … Media ({r[:len(MAIN)]})')
        ok('templates' not in r and 'admaker' not in r, 'Templates and Beat ad are not in the editor bar (they live on Home)')
        labels = await P(pg, '[...document.querySelectorAll("#toolbar .tool span")].slice(0,15).map(s=>s.textContent)')
        ok(labels[:6] == ['Text', 'Sticker', 'Audio', 'Sounds', 'Effect', 'Filter'], f'labels {labels[:6]}')
        h = await P(pg, 'document.querySelector("#toolbar").getBoundingClientRect().height'); ok(h <= 64, f'compact tool row ({h:.0f}px)')
        fs = await P(pg, 'parseFloat(getComputedStyle(document.querySelector("#toolbar .tool span")).fontSize)'); ok(10 <= fs <= 12, f'small readable labels ({fs}px)')
        pv = await P(pg, 'document.querySelector("#stage").getBoundingClientRect().height'); ok(pv >= 300, f'preview stays large ({pv:.0f}px)')
        ok(await P(pg, 'document.querySelector("#toolbar").scrollWidth > document.querySelector("#toolbar").clientWidth'), 'single scrollable row')
        await shot(pg, 'b14-main-row-390.png')

        log('== timeline cut icons')
        j = await P(pg, '[...document.querySelectorAll(".joint")].map(j=>({w:j.querySelector("i").getBoundingClientRect().width, svg:!!j.querySelector("i svg")}))')
        ok(len(j) == 2, f'one cut icon per cut ({len(j)})'); ok(all(x['w'] <= 13 and not x['svg'] for x in j), f'cut icons are small plain squares, no "-" buttons ({j})')
        await shot(pg, 'b14-timeline-390.png')
        await pg.locator('.joint').first.click(); await pg.wait_for_timeout(400)
        ok(await sheet_open(pg) and 'ransition' in (await P(pg, 'document.querySelector("#sheet").textContent')), 'tapping the cut icon opens the transition picker')
        await pg.click('.trtile[data-tr="fade"]'); await pg.wait_for_timeout(300); await close(pg)
        on = await P(pg, 'document.querySelectorAll(".joint.on").length'); ok(on == 1, f'a set transition shows a filled icon at the cut ({on})')
        log('== clip tool row')
        vid = await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="main").clips[0].id')
        await pg.locator(f'.clip[data-id="{vid}"]').click(); await pg.wait_for_timeout(400)
        r = await row(pg); ok(await P(pg, '!!document.querySelector("#toolbar .tool.back")'), 'back arrow shown first')
        got = [t for t in r if t in VIDEO]; ok(got == [t for t in VIDEO if t in r] and len(got) >= len(VIDEO) - 1, f'clip row order Split, Delete, Speed … Extract audio ({len(got)}/{len(VIDEO)})')
        ok(r[1:3] == ['split', 'delete'], f'Split, Delete first ({r[1:3]})')
        ok(await P(pg, 'document.querySelectorAll(".joint.sel").length') >= 1, 'selected clip shows its cut icon')
        await shot(pg, 'b14-clip-row-390.png')
        await P(pg, 'document.querySelector("#toolbar").scrollLeft = 99999'); await shot(pg, 'b14-clip-row-scrolled-390.png')
        await pg.click('#toolbar .tool.back'); await pg.wait_for_timeout(300)
        ok((await row(pg))[:len(MAIN)] == MAIN and await P(pg, 'studio.S.sel===null'), 'back returns to the main row')

        log('== every clip tool opens')
        for t in VIDEO + ['colorpro', 'clipfx', 'transform', 'mirror', 'fit', 'slowmo', 'tooverlay', 'mute', 'audiomix', 'marks']:
            if t in ('delete', 'split', 'duplicate', 'reverse', 'extract', 'tooverlay'): continue
            await P(pg, f'studio.select("{vid}")'); await pg.wait_for_timeout(200)
            if not await P(pg, f'!!document.querySelector("#toolbar .tool[data-tool={t}]")'): ok(False, f'clip tool {t} present'); continue
            n0 = len(errs); key0 = await P(pg, 'JSON.stringify(studio.find(studio.S.project,"' + vid + '").clip)')
            if t == 'replace':
                async with pg.expect_file_chooser() as fc: await pg.click(f'#toolbar .tool[data-tool={t}]')
                ok(bool(await fc.value), 'Switch (replace) opens the picker'); continue
            if t == 'capture':
                async with pg.expect_download() as dl: await pg.click(f'#toolbar .tool[data-tool={t}]')
                ok((await dl.value).suggested_filename.endswith('.png'), 'Capture saves the frame as a PNG'); continue
            await pg.click(f'#toolbar .tool[data-tool={t}]'); await pg.wait_for_timeout(350)
            changed = key0 != await P(pg, 'JSON.stringify(studio.find(studio.S.project,"' + vid + '")?.clip||null)')
            ok(len(errs) == n0 and (await sheet_open(pg) or changed or t in ('keyframe',)), f'clip tool {t} opens')
            if t == 'rotate':
                await pg.click('#flipHBtn'); await pg.wait_for_timeout(200); ok(await P(pg, f'!!studio.find(studio.S.project,"{vid}").clip.flipH'), 'Flip works')
            if t == 'opacity':
                await P(pg, 'const i=document.querySelector("#opacityRange input")||document.querySelector("#opacityRange"); i.value=0.5; i.dispatchEvent(new Event("input",{bubbles:true}))'); await pg.wait_for_timeout(200)
                ok(abs(await P(pg, f'studio.find(studio.S.project,"{vid}").clip.transform.opacity') - 0.5) < 0.02, 'Opacity slider works')
            await close(pg)
        await P(pg, f'studio.select("{vid}")'); await pg.wait_for_timeout(200); await pg.click('#toolbar .tool[data-tool=duplicate]'); await pg.wait_for_timeout(300)
        ok(await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="main").clips.length') == 4, 'Duplicate')
        await pg.click('#toolbar .tool[data-tool=delete]'); await pg.wait_for_timeout(300)
        ok(await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="main").clips.length') == 3, 'Delete')

        log('== text + audio rows')
        await P(pg, 'studio.select(null)'); await pg.wait_for_timeout(200); await pg.click('#toolbar .tool[data-tool=text]'); await pg.wait_for_timeout(300)
        r = await row(pg); ok(r == ['back', 'addtext', 'captions', 'stickers', 'texttpl', 'speech', 'karaoke'] or r[:4] == ['back', 'addtext', 'captions', 'stickers'], f'text sub-row {r}'); await shot(pg, 'b17-text-subrow.png', 300)
        await pg.click('#toolbar .tool[data-tool=addtext]'); await pg.wait_for_timeout(400); await close(pg)
        r = await row(pg); want = ['edit', 'textstyle', 'split', 'delete', 'anim', 'duplicate', 'keyframe']
        ok(all(t in r for t in want) and r[1:3] == ['edit', 'textstyle'], f'text row: Edit, Style, Split, Delete, Animation, Duplicate, Keyframe ({r[:10]})')
        await shot(pg, 'b14-text-row-390.png')
        await P(pg, '''(()=>{const P_=studio.project; const v=studio.S.project.tracks.find(t=>t.kind==="main").clips[0]; studio.select(v.id)})()'''); await pg.wait_for_timeout(200)
        await pg.click('#toolbar .tool[data-tool=extract]'); await pg.wait_for_timeout(500)
        r = await row(pg); ok(await P(pg, 'studio.find(studio.S.project,studio.S.sel)?.clip.type') == 'audio' and all(t in r for t in ['volume', 'split', 'delete', 'duplicate', 'keyframe', 'enhvoice', 'voicefx']), f'audio row: Volume/Fade, Split, Delete, Duplicate, Keyframe, voice ({r[:10]})')

        log('== b15 layout: tools above a slim timeline')
        await P(pg, 'studio.select(null)'); await pg.wait_for_timeout(300)
        y = await P(pg, '["#stage","#transport","#toolbar","#timeline"].map(q=>document.querySelector(q).getBoundingClientRect().top)')
        ok(y == sorted(y), f'order: preview, playback, tool row, timeline ({y})')
        tl = await P(pg, '(()=>{const r=document.querySelector("#timeline").getBoundingClientRect();return {b:r.bottom,h:r.height}})()'); ok(tl['b'] <= 844.5 and tl['h'] <= 175, f'timeline at the bottom, slim ({tl})')
        mh = await P(pg, 'document.querySelector(".row.k-main").getBoundingClientRect().height'); ok(46 <= mh <= 54, f'main strip ~50px ({mh})')
        th = await P(pg, '[...document.querySelectorAll(".row.thin")].map(r=>r.getBoundingClientRect().height)'); ok(th and all(h <= 22 for h in th), f'extra tracks are thin lanes ({th})')
        ok(await P(pg, 'document.querySelectorAll(".clip .dur").length') == 0, 'no duration badges unless selected')
        ab = await P(pg, '(()=>{const r=document.querySelector("#addMainBtn").getBoundingClientRect();return {x:r.left,w:r.width,h:r.height}})()'); ok(ab['x'] < 40 and abs(ab['w'] - ab['h']) < 1, f'round + at the left ({ab})')
        await shot(pg, 'b15-editor-390.png')
        txid = await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="text").clips[0].id'); await P(pg, f'studio.select("{txid}")'); await pg.wait_for_timeout(400)
        eh = await P(pg, '(()=>{const r=document.querySelector(".row.k-text");return r.getBoundingClientRect().height})()'); ok(eh > 22, f'selected lane expands ({eh})')
        await shot(pg, 'b15-editor-tracks-390.png'); await shot(pg, 'b16-editor-tracks-390.png', 0)
        th2 = await P(pg, 'document.querySelector("#timeline").getBoundingClientRect().height'); ok(th2 > 95, f'timeline grows with extra tracks ({th2:.0f}px)')
        await P(pg, 'studio.select(studio.S.project.tracks.find(t=>t.kind==="main").clips[0].id)'); await pg.wait_for_timeout(400)
        ok(await P(pg, 'document.querySelectorAll(".clip.sel .dur").length') == 1, 'duration badge on the selected clip')
        await shot(pg, 'b15-editor-clip-390.png'); await shot(pg, 'b16-editor-clip-390.png', 0)
        await pg.click('#fsBtn'); await pg.wait_for_timeout(300); ok(await P(pg, 'getComputedStyle(document.querySelector("#timeline")).display') == 'none', 'full-screen preview'); await pg.click('#fsBtn'); await pg.wait_for_timeout(300)

        log('== every main tool opens')
        for t in MAIN + ['titles', 'karaoke', 'photo', 'ratio', 'layout', 'guides', 'perf', 'markers', 'history', 'select', 'magnetic']:
            await P(pg, 'studio.select(null)'); await pg.wait_for_timeout(200); n0 = len(errs)
            await P(pg, 'studio.setSubRow(null)'); await pg.wait_for_timeout(60)
            if not await P(pg, f'!!document.querySelector("#toolbar .tool[data-tool={t}]")'): ok(False, f'main tool {t} present'); continue
            if t == 'audio':
                await pg.click('#toolbar .tool[data-tool=audio]'); await pg.wait_for_selector('#sndImport', timeout=8000)
                async with pg.expect_file_chooser() as fc: await pg.click('#sndImport')
                ok(bool(await fc.value) and len(errs) == n0, 'Audio opens the music library (+ From my phone picker)'); await close(pg); continue
            if t in ('media',):
                async with pg.expect_file_chooser() as fc: await pg.click(f'#toolbar .tool[data-tool={t}]')
                ok(bool(await fc.value), f'main tool {t} opens the picker'); continue
            await pg.click(f'#toolbar .tool[data-tool={t}]'); await pg.wait_for_timeout(400)
            ok(len(errs) == n0, f'main tool {t} opens without errors'); await close(pg)
            if t == 'select': await P(pg, 'document.querySelector("#toolbar .tool[data-tool=select]")?.click()')
            if t == 'magnetic': await P(pg, 'document.querySelector("#toolbar .tool[data-tool=magnetic]")?.click()')
        ok(not errs, f'no page errors ({errs[:3]})')
        await b.close()
    log('RESULT', 'PASS' if not fails else f'FAIL ({len(fails)}): ' + '; '.join(fails)); sys.exit(1 if fails else 0)
asyncio.run(run())

"""Export done screen: Save to Gallery / Post to… / Download file  (Google Chrome, 390x844, Android UA).
   python3 tests/test_share.py [shots_dir]   — navigator.share / canShare are mocked (Chrome on Linux has none),
   with Chrome-for-Android rules: video/* files only, 50 MiB total, and a user gesture is required."""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, re, time
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]; FX = ROOT / 'tests/fixtures'
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-share-')); fails = []; T0 = time.time()
ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Mobile Safari/537.36'
MOCK = """(()=>{window.__shares=[];window.__shareMode='ok';
 const can=d=>!!(d&&d.files&&d.files.length&&d.files.length<=10&&d.files.every(f=>/\\.(mp4|webm|m4v)$/.test(f.name)&&/^video\\//.test(f.type))&&d.files.reduce((a,f)=>a+f.size,0)<=50*1024*1024);
 Object.defineProperty(navigator,'canShare',{value:can,configurable:true});
 Object.defineProperty(navigator,'share',{configurable:true,value:async d=>{
   if(!navigator.userActivation.isActive)throw new DOMException('Must be handling a user gesture to perform a share request.','NotAllowedError');
   if(!can(d))throw new DOMException('Permission denied','NotAllowedError');
   window.__shares.push(d.files.map(f=>({name:f.name,type:f.type,size:f.size})));
   if(window.__shareMode==='abort')throw new DOMException('Share canceled','AbortError');
   if(window.__shareMode==='deny')throw new DOMException('Permission denied','NotAllowedError');}});})()"""
def log(*a): print(f'[{time.time()-T0:6.1f}s]', *a, flush=True)
def ok(c, m):
    log(('  ok   ' if c else '  FAIL ') + m)
    if not c: fails.append(m)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def handle(self):
        try: super().handle()
        except Exception: pass
def probe(f): return json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(f)], capture_output=True, text=True).stdout or '{}')
async def page(b, mock=True, ua=ANDROID_UA):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True, user_agent=ua)
    if mock: await ctx.add_init_script(MOCK)
    pg = await ctx.new_page(); pg.errs = []; pg.downloads = []
    pg.on('pageerror', lambda e: pg.errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and pg.errs.append(m.text))
    pg.on('download', lambda d: pg.downloads.append(d))
    await pg.goto('http://127.0.0.1:8741/'); await pg.wait_for_function('window.studio && studio.ready', timeout=20000)
    await pg.set_input_files('#fileMedia', [str(FX / 'video.mp4'), str(FX / 'image.png')])
    await pg.wait_for_function('studio.S.project.tracks.find(t=>t.kind==="main").clips.length===2', timeout=20000)
    async with pg.expect_file_chooser() as fc: await pg.click('#toolbar .tool[data-tool="audio"]')
    await (await fc.value).set_files([str(FX / 'music.mp3')]); await pg.wait_for_function("studio.S.project.tracks.some(t=>t.kind==='audio')")
    return ctx, pg
async def export(pg, res):
    await pg.click('#exportBtn'); await pg.click(f'#exRes .chipbtn[data-v="{res}"]'); await pg.click('#exGo')
    await pg.wait_for_selector('#exDone:not([hidden])', timeout=120000); await pg.wait_for_timeout(300)
    return await pg.evaluate('({name:studioLastExport.name,size:studioLastExport.blob.size,mime:studioLastExport.mime,bitrate:studioLastExport.bitrate})')
async def save_dl(d, tag): f = OUT / (tag + '_' + d.suggested_filename); await d.save_as(str(f)); return f
async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', 8741), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True)
        log('== Android phone with share sheet')
        ctx, pg = await page(b)
        r = await export(pg, 720)
        ok(re.fullmatch(r'Emmavengers-\d{8}-\d{6}\.mp4', r['name']) and r['mime'] == 'video/mp4', f'result named {r["name"]} ({r["mime"]})')
        vis = await pg.evaluate("['exSave','exShare','exFile','exBack'].map(i=>{const e=document.getElementById(i);return e&&!e.hidden&&e.getBoundingClientRect().height>0})")
        ok(all(vis), f'done screen shows Save to Gallery, Post to…, Download file, Back {vis}')
        ok((await pg.inner_text('#exSave')).strip() == 'Save to Gallery' and 'Post to' in await pg.inner_text('#exShare'), 'button labels')
        hs = await pg.evaluate("[document.getElementById('exSave').getBoundingClientRect().height, document.getElementById('exFile').getBoundingClientRect().height]")
        ok(hs[0] >= 60 and hs[1] < 45, f'Save to Gallery is the big button, Download file is secondary {hs}')
        sb = await pg.locator('#exShare').bounding_box(); ok(sb['y'] + sb['height'] <= 844, f'Post to… visible without scrolling (bottom {sb["y"]+sb["height"]:.0f})')
        await pg.screenshot(path=str(SHOTS / 'export-done-390.png')); log('  shot export-done-390.png')
        # Post to… -> share sheet with a proper mp4 File
        await pg.click('#exShare'); await pg.wait_for_timeout(300)
        sh = await pg.evaluate('window.__shares')
        ok(len(sh) == 1 and sh[0][0]['name'] == r['name'] and sh[0][0]['type'] == 'video/mp4' and sh[0][0]['size'] == r['size'], f'Post to… shares the mp4 File inside the tap gesture {sh}')
        ok('Sent' in await pg.inner_text('#exMsg') and not pg.downloads, 'after sharing: "Sent!" and no download')
        # Save to Gallery -> download of a real mp4, with guidance
        async with pg.expect_download() as dl: await pg.click('#exSave')
        d = await dl.value; f = await save_dl(d, 'gallery')
        j = probe(f); ok(d.suggested_filename == r['name'] and j.get('format', {}).get('format_name', '').startswith('mov,mp4') and len(j['streams']) == 2, f'Save to Gallery downloads {d.suggested_filename} (valid MP4, {len(j.get("streams", []))} streams)')
        m = await pg.inner_text('#exMsg'); ok('Gallery' in m and 'Download' in m, f'guidance says where it went: "{m[:90]}…"')
        await pg.screenshot(path=str(SHOTS / 'export-saved-390.png')); log('  shot export-saved-390.png')
        # user closes the share sheet -> nothing happens
        n0 = len(pg.downloads); await pg.evaluate("window.__shareMode='abort'"); await pg.click('#exShare'); await pg.wait_for_timeout(400)
        ok(len(pg.downloads) == n0 and 'Couldn' not in await pg.inner_text('#exMsg'), 'closing the share sheet: no error, no download')
        # share refused -> falls back to saving
        await pg.evaluate("window.__shareMode='deny'")
        async with pg.expect_download() as dl: await pg.click('#exShare')
        d = await dl.value; ok(d.suggested_filename == r['name'], 'share refused: video is saved instead')
        ok('saved to your phone instead' in await pg.inner_text('#exMsg'), 'share refused: explains it was saved')
        # Download file (secondary)
        async with pg.expect_download() as dl: await pg.click('#exFile')
        ok((await dl.value).suggested_filename.endswith('.mp4'), 'Download file link downloads the .mp4')
        ok(not pg.errs, f'no console errors {pg.errs[:3]}')
        await pg.click('#exBack'); await pg.wait_for_timeout(200); ok(await pg.evaluate("document.getElementById('exportView').hidden"), 'Back to editing closes the export screen')
        # Sharpness first: the saved export always uses the full bitrate, even when sharing is possible
        r = await export(pg, 1080)
        ok(r['bitrate'] >= 14e6, f'1080p export uses the full high bitrate ({r["bitrate"]/1e6:.1f} Mbps, {r["size"]/1e6:.1f} MB)')
        ok('Post to' in await pg.inner_text('#exShare'), 'export under 50 MB can be posted directly')
        await pg.click('#exBack')
        # Too big even for good quality -> "make a copy small enough to post"
        await pg.evaluate('window.__studioShareLimit=1.5e6; window.__shares=[]; window.__shareMode="ok"')
        r = await export(pg, 1080)
        ok(r['size'] > 1.5e6 and 'smaller copy' in await pg.inner_text('#exShare'), f'big video ({r["size"]/1e6:.1f} MB): button offers a smaller copy')
        await pg.screenshot(path=str(SHOTS / 'export-too-big-390.png'))
        await pg.click('#exShare'); await pg.wait_for_selector('#exDone:not([hidden])', timeout=120000); await pg.wait_for_timeout(300)
        ok('Ready to post' in await pg.inner_text('#exMsg') and 'Post to' in await pg.inner_text('#exShare'), 'smaller copy made: "Ready to post"')
        await pg.click('#exShare'); await pg.wait_for_timeout(300); sh = await pg.evaluate('window.__shares')
        ok(len(sh) == 1 and sh[0][0]['size'] <= 1.5e6 and sh[0][0]['type'] == 'video/mp4', f'second tap shares the small copy ({sh and sh[0][0]["size"]/1e6:.2f} MB)')
        async with pg.expect_download() as dl: await pg.click('#exSave')
        d = await dl.value; f = await save_dl(d, 'full'); ok(f.stat().st_size == r['size'], 'Save to Gallery still saves the full-quality video')
        ok(not pg.errs, f'no console errors {pg.errs[:3]}')
        await ctx.close()
        log('== browser without file sharing (desktop Chrome on Linux)')
        ctx, pg = await page(b, mock=False, ua=None) if False else await page(b, mock=False, ua='Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36')
        r = await export(pg, 720)
        ok(await pg.evaluate("document.getElementById('exShare').hidden"), 'no share support: Post to… is hidden')
        async with pg.expect_download() as dl: await pg.click('#exSave')
        ok((await dl.value).suggested_filename == r['name'] and 'Downloads' in await pg.inner_text('#exMsg'), 'Save still downloads, guidance says Downloads folder')
        ok(not pg.errs, f'no console errors {pg.errs[:3]}')
        await ctx.close(); await b.close()
    log(f'RESULT: {"PASS" if not fails else "FAIL"} ({len(fails)} failures)')
    for f in fails: log('  -', f)
    sys.exit(1 if fails else 0)
asyncio.run(run())

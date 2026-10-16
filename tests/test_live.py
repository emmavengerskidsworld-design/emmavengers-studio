"""Check the published site: python3 tests/test_live.py [url]  — loads, imports, exports 720p, verifies with ffprobe, offline reload."""
import asyncio, sys, json, subprocess, tempfile, time
from pathlib import Path
from playwright.async_api import async_playwright
URL = sys.argv[1] if len(sys.argv) > 1 else 'https://emmavengerskidsworld-design.github.io/emmavengers-studio/'
FX = Path(__file__).resolve().parent / 'fixtures'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True)
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
        pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.goto(URL); await pg.wait_for_function('window.studio && studio.ready', timeout=30000)
        await pg.set_input_files('#fileMedia', [str(FX / 'video.mp4'), str(FX / 'image.png')]); await pg.wait_for_function('studio.S.project.tracks.find(t=>t.kind==="main").clips.length===2', timeout=30000)
        await pg.click('#exportBtn'); await pg.click('#exRes .chipbtn[data-v="720"]'); await pg.click('#exGo'); await pg.wait_for_selector('#exDone:not([hidden])', timeout=120000)
        async with pg.expect_download() as dl: await pg.click('#exSave')
        f = Path(tempfile.mkdtemp()) / 'live.mp4'; await (await dl.value).save_as(str(f))
        j = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(f)], capture_output=True, text=True).stdout)
        print('live export:', [(s['codec_name'], s.get('width'), s.get('height')) for s in j['streams']], 'duration', j['format']['duration'])
        await pg.wait_for_function('navigator.serviceWorker.controller', timeout=30000); await pg.wait_for_timeout(3000)
        await ctx.set_offline(True); await pg.reload(); await pg.wait_for_function('window.studio && studio.ready', timeout=30000)
        print('offline reload ok, clips:', await pg.evaluate('studio.S.project.tracks.find(t=>t.kind==="main").clips.length'))
        b_ = await pg.evaluate('new Promise(r=>{navigator.serviceWorker.addEventListener("message",e=>e.data.build&&r(e.data.build));navigator.serviceWorker.controller.postMessage("build")})'); print('build', b_)
        print('errors', errs); await b.close()
asyncio.run(main())

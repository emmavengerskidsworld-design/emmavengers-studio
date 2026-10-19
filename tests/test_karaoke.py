"""Batch 11 part 4 — karaoke captions (word-by-word, 12 styles, lyric mode, even split / tap-to-time, SRT).   python3 tests/test_karaoke.py [shots_dir]"""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, math, io, base64
from pathlib import Path
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-kar-')); fails = []; T0 = time.time(); PORT = 8801; metrics = {}
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
async def still(pg, t, w=180, h=320):
    d = await P(pg, f'studio.renderStill({{t:{t},W:{w},H:{h}}})'); return np.asarray(Image.open(io.BytesIO(base64.b64decode(d))).convert('RGB')).astype(float)
async def shot(pg, name, wait=500): await pg.wait_for_timeout(wait); await pg.screenshot(path=str(SHOTS / name)); log('  shot', name)
async def seek(pg, t, w=250): await P(pg, f'studio.player.pause(); studio.player.seek({t}); studio.timeline.setTime({t})'); await pg.wait_for_timeout(w)
async def close(pg): await P(pg, 'document.querySelector(".sh-done")?.click()'); await pg.wait_for_timeout(300)
def frame(f, t, name, size=(180, 320), fps=30):
    o = OUT / name; subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(f), '-vf', f'select=eq(n\\,{int(round(t * fps))})', '-vsync', '0', '-frames:v', '1', str(o)], check=True)
    return np.asarray(Image.open(o).convert('RGB').resize(size, Image.BOX)).astype(float)
def lapvar(a): g = a.mean(2); return float(np.var(g[1:-1, 1:-1] * 4 - g[:-2, 1:-1] - g[2:, 1:-1] - g[1:-1, :-2] - g[1:-1, 2:]))
async def export(pg, tag, res=1080):
    await pg.click('#exportBtn'); await pg.wait_for_selector('#exRes[data-checked="1"]', timeout=20000); await pg.click(f'#exRes .chipbtn[data-v="{res}"]'); await pg.wait_for_timeout(200)
    await pg.click('#exGo'); await pg.wait_for_selector('#exDone:not([hidden])', timeout=600000)
    async with pg.expect_download() as dl: await pg.click('#exSave')
    d = await dl.value; f = OUT / (tag + '.mp4'); await d.save_as(str(f)); await pg.click('#exBack'); await pg.wait_for_timeout(300); return f

async def tool(pg, t): await pg.click(f'#toolbar .tool[data-tool="{t}"]'); await pg.wait_for_timeout(300)
def small(a): return np.asarray(Image.fromarray(a.astype(np.uint8)).resize((90, 160), Image.BOX)).astype(float)

async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    g = np.zeros((1920, 1080, 3), np.uint8); g[..., 0] = np.linspace(40, 160, 1080)[None, :]; g[..., 2] = np.linspace(160, 60, 1920)[:, None]; g[..., 1] = 70; Image.fromarray(g).save(OUT / 'bg.jpg', quality=92)
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=30000)
        await P(pg, 'studio.home && studio.home.hide && studio.home.hide()'); await pg.wait_for_timeout(300)
        await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[]); p.bg="#000000"; p.perf={proxy:false}})')

        await P(pg, 'document.querySelector("#fileMedia").value=""'); await pg.set_input_files('#fileMedia', [str(OUT / 'bg.jpg')])
        await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===1', timeout=30000); await pg.wait_for_timeout(500)
        await P(pg, 'studio.act(p=>{p.tracks[0].clips[0].dur=6; studio.caps.bulkCaptions(p, "We sing a happy song\\nclap your hands with me\\nlet the music play", 0, 6)})'); await P(pg, 'studio.select(null)')
        log('== karaoke sheet')
        await tool(pg, 'karaoke'); await pg.wait_for_selector('#kStyles .kst'); await pg.wait_for_timeout(900)
        n = await P(pg, 'document.querySelectorAll("#kStyles .kst").length'); ok(n == 12, f'{n} karaoke styles')
        sig = await P(pg, '[...document.querySelectorAll("#kStyles canvas")].map(c=>{const d=c.getContext("2d").getImageData(0,0,c.width,c.height).data; let s=0; for(let i=0;i<d.length;i+=4) s+=(d[i]*3+d[i+1]*5+d[i+2]*7)*(i%97); return s})')
        ok(len(set(sig)) == 12, f'all 12 style tiles look different ({len(set(sig))})')
        await pg.click('#kEven'); await pg.wait_for_timeout(400); await shot(pg, 'b11-karaoke-sheet.png', 300)
        ks = await P(pg, 'studio.caps.captions(studio.S.project).map(c=>({n:c.karaoke&&c.karaoke.words.length, s:c.karaoke&&c.karaoke.style, w:c.karaoke&&c.karaoke.words.map(w=>+(w.b-w.a).toFixed(3)), D:c.dur}))')
        log('  captions', ks)
        ok(len(ks) == 3 and all(k['n'] for k in ks), 'even split: every caption is word-by-word')
        ok(all(max(k['w']) - min(k['w']) < 0.01 for k in ks) and abs(sum(ks[0]['w']) - ks[0]['D']) < 0.01, 'even split = same time per word, words fill the line')
        log('== highlight moves word by word')
        await close(pg)
        w = await P(pg, 'studio.caps.captions(studio.S.project)[0].karaoke.words')
        a = await still(pg, (w[0]['a'] + w[0]['b']) / 2, 360, 640); b2 = await still(pg, (w[3]['a'] + w[3]['b']) / 2, 360, 640)
        band = lambda im: im[int(640 * .7):int(640 * .9)]
        dif = np.abs(band(a) - band(b2)).mean(2) > 40; cols = np.where(dif.any(0))[0]
        ok(dif.mean() > 0.002, f'highlight changes between word 1 and word 4 ({dif.mean() * 100:.2f}% of the caption band)')
        aw = await P(pg, f'(async()=>{{const K=await import("./js/karaoke.js"); const c=studio.caps.captions(studio.S.project)[0]; return [K.activeWord(c,{(w[0]["a"]+w[0]["b"])/2}), K.activeWord(c,{(w[3]["a"]+w[3]["b"])/2})]}})()')
        ok(aw == [0, 3], f'active word follows time {aw}')
        await seek(pg, (w[1]['a'] + w[1]['b']) / 2, 600); await shot(pg, 'b11-karaoke-preview.png', 200)
        log('== 12 styles render')
        sigs = []
        for sid in ['sweep','box','pop','bounce','neon','under','reveal','comic','pill','rainbow','story','single']:
            await P(pg, f'studio.act(p=>studio.karaoke.karaokeAll(p,"{sid}"))'); im = await still(pg, (w[1]['a'] + w[1]['b']) / 2, 90, 160); sigs.append(im)
        uniq = sum(1 for i in range(12) if all(np.abs(sigs[i] - sigs[j]).mean() > 0.3 for j in range(12) if j != i))
        ok(uniq >= 11, f'{uniq}/12 styles look different in the frame')
        log('== lyric mode')
        await P(pg, 'studio.act(p=>studio.karaoke.karaokeAll(p,"sweep"))'); plain = await still(pg, 1.0, 180, 320)
        await tool(pg, 'karaoke'); await pg.wait_for_selector('#kLyric'); await pg.click('#kLyric .chipbtn[data-v="lyric"]'); await pg.wait_for_timeout(300); await close(pg)
        ly = await P(pg, 'studio.caps.captions(studio.S.project).map(c=>[c.karaoke.lyric, c.karaoke.next])'); log('  lyric', ly)
        ok(all(x[0] for x in ly) and ly[0][1] == 'clap your hands with me' and ly[2][1] == '', 'lyric mode: each line shows the next line under it')
        lyr = await still(pg, 1.0, 180, 320); ok(np.abs(lyr - plain).mean() > 0.5, 'lyric mode draws the next line + note')
        await seek(pg, 1.0, 500); await shot(pg, 'b11-karaoke-lyric.png', 200)
        log('== tap to time')
        await tool(pg, 'karaoke'); await pg.wait_for_selector('#kTap'); await pg.click('#kTap'); await pg.wait_for_timeout(300)
        nw = await P(pg, 'studio.karaoke.karaokeWordCount(studio.S.project)'); taps = []
        await shot(pg, 'b11-karaoke-tap.png', 100)
        for i in range(6):
            await pg.wait_for_timeout(420); await pg.dispatch_event('#kTapBtn', 'pointerdown'); taps.append(await P(pg, 'studio.player.t'))
        await pg.click('#kTapDone'); await pg.wait_for_timeout(400); await close(pg)
        w2 = await P(pg, 'studio.caps.captions(studio.S.project)[0].karaoke.words'); c0 = await P(pg, 'studio.caps.captions(studio.S.project)[0].start')
        log('  taps', [round(t, 2) for t in taps], 'words', [(x['w'], x['a']) for x in w2])
        ok(abs(w2[1]['a'] - (taps[1] - c0)) < 0.12 and abs(w2[2]['a'] - (taps[2] - c0)) < 0.12, f'tapped times become word starts ({nw} words)')
        ok(all(w2[i]['a'] < w2[i + 1]['a'] for i in range(len(w2) - 1)), 'word times stay in order')
        log('== SRT')
        (OUT / 'song.srt').write_text("1\n00:00:00,500 --> 00:00:02,000\nTwinkle twinkle little star\n\n2\n00:00:02,000 --> 00:00:04,000\nhow I wonder what you are\n\n3\n00:00:04,200 --> 00:00:05,800\nup above the world so high\n")
        await tool(pg, 'karaoke'); await pg.wait_for_selector('#kSrt', state='attached'); await pg.set_input_files('#kSrt', str(OUT / 'song.srt')); await pg.wait_for_timeout(700); await close(pg)
        sr = await P(pg, 'studio.caps.captions(studio.S.project).map(c=>[c.start, c.dur, c.karaoke&&c.karaoke.words.length, c.karaoke&&c.karaoke.lyric])'); log('  srt', sr)
        ok(len(sr) == 3 and abs(sr[0][0] - .5) < .01 and sr[0][2] == 4 and sr[1][2] == 6, 'SRT import -> karaoke lines with word timing')
        log('== preview == export')
        f = await export(pg, 'kar', 720); D = []
        for t in [0.9, 2.7, 4.9]:
            ex = frame(f, t, f'e{t}.png', (180, 320)); pv = await still(pg, t, 180, 320); D.append(float(np.abs(small(ex) - small(pv)).mean()))
        log('  preview vs export', D); ok(max(D) < 10, f'preview == export at 90x160 (max {max(D):.1f})')
        metrics = {'styles': 12, 'unique_styles': uniq, 'parity': [round(d, 2) for d in D], 'taps': len(taps)}
        real = [e for e in errs if 'favicon' not in e]; ok(not real, f'no page errors {real[:3]}')
        await b.close()
    log('METRICS', json.dumps(metrics)); (ROOT / 'tests' / 'karaoke-metrics.json').write_text(json.dumps(metrics, indent=1))
    log(f'RESULT: {"PASS" if not fails else "FAIL"} ({len(fails)} failures) in {time.time() - T0:.0f}s')
    for m in fails: log('  -', m)
    sys.exit(1 if fails else 0)
asyncio.run(run())

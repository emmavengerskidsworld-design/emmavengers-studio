"""Batch 12 part 4 — kids-creator extras (Bible verse cards, quiz builder, counting + ABC auto-builders).   python3 tests/test_kids.py [shots_dir]"""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, math, io, base64
from pathlib import Path
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-kids-')); fails = []; T0 = time.time(); PORT = 8807; metrics = {}
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

KC = 'studio.S.project.tracks.find(t=>t.kind==="main").clips.filter(c=>c.kids)'
async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=30000)
        await P(pg, 'studio.home && studio.home.hide && studio.home.hide()'); await pg.wait_for_timeout(300)
        await P(pg, 'localStorage.removeItem("evs-kids-last"); studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[]); p.bg="#000000"; p.perf={proxy:false}; p.aspect="9:16"})')
        await P(pg, 'document.querySelector("#fileMedia").value=""'); await pg.set_input_files('#fileMedia', [str(ROOT / 'tests/fixtures/blue.png')])
        await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===1', timeout=30000); await pg.wait_for_timeout(400); await seek(pg, 999)

        log('== verse card')
        await P(pg, 'studio.select(null)'); await pg.wait_for_timeout(200); await tool(pg, 'kids'); await pg.wait_for_selector('#kvList .kv', timeout=20000); await pg.wait_for_timeout(500)
        nv = await P(pg, 'studio.kids.VERSES.length'); nl = await P(pg, 'document.querySelectorAll("#kvList .kv").length'); ns = await P(pg, 'document.querySelectorAll("#kvStyles .chipbtn").length'); log(' ', nv, nl, ns); metrics.update(verses=nv, cardStyles=ns)
        ok(nv >= 50 and nl == nv and ns >= 8, f'{nv} KJV verses, {ns} card styles')
        await pg.fill('#kvSearch', 'brave'); await pg.wait_for_timeout(300); br = await P(pg, '[...document.querySelectorAll("#kvList .kv")].map(b=>b.dataset.id)'); ok('joshua-1-9' in br and len(br) < 10, f'verse search "brave" {br}')
        await pg.fill('#kvSearch', ''); await pg.wait_for_timeout(200)
        await pg.click('#kvList .kv[data-id="psalm-23-1"]'); await pg.click('#kvStyles .chipbtn[data-v="night"]'); await pg.wait_for_timeout(900)
        txt = await P(pg, 'document.querySelector("#kvText").value'); ok(txt == 'The LORD is my shepherd; I shall not want.', 'picking a verse fills the editable verse text (KJV)')
        pv = await P(pg, '(()=>{const c=document.querySelector("#kvPrev"),x=c.getContext("2d").getImageData(0,0,c.width,c.height).data;let s=0;for(let i=0;i<x.length;i+=4)s+=x[i]+x[i+1]+x[i+2];return s/(x.length/4)/3})()'); ok(pv > 15, f'style preview drawn ({pv:.0f})')
        await shot(pg, 'b12-kids-verse-sheet.png', 300)
        await pg.click('#kvAdd'); await pg.wait_for_function(KC + '.length===1', timeout=30000); await pg.wait_for_timeout(400)
        v = await P(pg, f'(()=>{{const c={KC}.find(c=>c.kids==="verse");const tx=c.inner.tracks.filter(t=>t.kind==="text").flatMap(t=>t.clips).map(x=>x.text.content);const im=c.inner.tracks.flatMap(t=>t.clips).filter(x=>x.type==="image");return {{d:c.dur,s:c.start,tx,img:im.map(x=>!!studio.media.get(x.mediaId)),fx:c.inner.tracks.filter(t=>t.kind==="effect").length,snd:studio.S.project.tracks.filter(t=>t.kind==="audio").flatMap(t=>t.clips).filter(a=>a.kids===c.id).length}}}})()')
        log(' ', v); ok(v['tx'][0].replace('\n', ' ') == 'The LORD is my shepherd; I shall not want.' and v['tx'][1] == 'Psalm 23:1' and all(v['img']) and v['fx'] == 1 and v['snd'] >= 1, 'verse card = background + verse + reference + sticker + sparkle effect + sound')
        VD = v['d']
        VS = v["s"]; await close(pg); await seek(pg, VS + VD * .7, 600); await shot(pg, 'b12-kids-verse-card.png', 600)

        log('== quiz')
        await seek(pg, 999); await P(pg, 'studio.select(null)'); await pg.wait_for_timeout(200); await tool(pg, 'kids'); await pg.click('#kmTabs .chipbtn[data-v="quiz"]'); await pg.wait_for_selector('#kqQ')
        await pg.fill('#kqQ', 'Who was swallowed by a big fish?')
        for i, a in enumerate(['Noah', 'Jonah', 'Peter', '']): await pg.fill(f'#kqA .kqai[data-i="{i}"]', a)
        await pg.click('#kqRight .chipbtn[data-v="1"]'); await pg.click('#kqTime .chipbtn[data-v="3"]'); await pg.click('#kqStyle .chipbtn[data-v="gameshow"]'); await pg.wait_for_timeout(600)
        await shot(pg, 'b12-kids-quiz-sheet.png', 300)
        await pg.fill('#kqA .kqai[data-i="1"]', ''); await pg.fill('#kqA .kqai[data-i="2"]', ''); await pg.wait_for_timeout(200); e1 = await P(pg, 'document.querySelector("#kqErr").textContent'); ok('2 to 4' in e1, f'quiz needs at least 2 answers ({e1})')
        await pg.fill('#kqA .kqai[data-i="1"]', 'Jonah'); await pg.fill('#kqA .kqai[data-i="2"]', 'Peter'); await pg.wait_for_timeout(200)
        await pg.click('#kqAdd'); await pg.wait_for_function(KC + '.length===2', timeout=30000); await pg.wait_for_timeout(400)
        q = await P(pg, f'(()=>{{const c={KC}.find(c=>c.kids==="quiz");return {{d:c.dur,s:c.start,k:c.kidsData,snd:studio.S.project.tracks.filter(t=>t.kind==="audio").flatMap(t=>t.clips).filter(a=>a.kids===c.id).map(a=>+(a.start-c.start).toFixed(2))}}}})()')
        log(' ', q); qs, tr = q['s'], q['k']['reveal']
        ok(q['k']['answers'] == ['Noah', 'Jonah', 'Peter'] and q['k']['right'] == 1 and q['k']['countdown'] == 3, 'quiz: question, 3 answers, right = B, 3 s countdown')
        ok(len(q['snd']) == 3 + 3 + 1 and abs(q['snd'][-1] - tr) < .01 if q['snd'] else False, f'quiz sounds: pop per answer, tick per second, ta-da at reveal ({len(q["snd"])})')
        await close(pg)
        a0, a1 = await still(pg, qs + tr - .3), await still(pg, qs + tr + .9)
        y0, y1 = int(320 * .52) - 14, int(320 * .52) + 14   # answer B row
        g0, g1 = a0[y0:y1, 30:150], a1[y0:y1, 30:150]; gr0, gr1 = float(g0[..., 1].mean() - g0[..., 0].mean()), float(g1[..., 1].mean() - g1[..., 0].mean()); log('  green-red B', gr0, gr1)
        ok(gr1 > gr0 + 20 and float(np.abs(a0 - a1).mean()) > 4, 'reveal turns the right answer green (others dim) + confetti')
        await seek(pg, qs + tr + .9, 600); await shot(pg, 'b12-kids-quiz-reveal.png', 600)
        await seek(pg, qs + tr - 1.5, 600); await shot(pg, 'b12-kids-quiz-countdown.png', 400)
        n0 = await P(pg, 'studio.S.project.tracks.flatMap(t=>t.clips).length'); await P(pg, 'studio.undo ? studio.undo() : document.querySelector("#undoBtn").click()'); await pg.wait_for_timeout(300)
        n1 = await P(pg, 'studio.S.project.tracks.flatMap(t=>t.clips).length'); kc = await P(pg, KC + '.length'); ok(kc == 1 and n0 - n1 == 1 + len(q['snd']), f'one undo removes the whole quiz + its sounds ({n0}->{n1})')
        await P(pg, 'studio.redo ? studio.redo() : document.querySelector("#redoBtn").click()'); await pg.wait_for_timeout(300); ok(await P(pg, KC + '.length') == 2, 'redo brings it back')

        log('== counting + ABC')
        await seek(pg, 999); await P(pg, 'studio.select(null)'); await pg.wait_for_timeout(200); await tool(pg, 'kids'); await pg.click('#kmTabs .chipbtn[data-v="count"]'); await pg.wait_for_selector('#kcItem')
        await pg.click('#kcItem .chipbtn[data-v="duck"]'); await pg.click('#kcTo .chipbtn[data-v="3"]'); await pg.wait_for_timeout(600); await shot(pg, 'b12-kids-counting-sheet.png', 300)
        await pg.click('#kcAdd'); await pg.wait_for_function(KC + '.length===3', timeout=30000); await pg.wait_for_timeout(400)
        c = await P(pg, f'(()=>{{const c={KC}.find(c=>c.kids==="count"),ov=c.inner.tracks.filter(t=>t.kind==="overlay").flatMap(t=>t.clips);const at=t=>ov.filter(x=>x.start<=t&&t<x.start+x.dur).length;return {{s:c.start,d:c.dur,n:[at(1.0),at(1.7),at(3.3),at(4.9),at(6.5)],tx:c.inner.tracks.filter(t=>t.kind==="text").flatMap(t=>t.clips).map(x=>x.text.content)}}}})()')
        log(' ', c); ok(c['n'] == [0, 1, 2, 3, 3] and 'Three' in c['tx'] and 'Three ducks!' in c['tx'], 'counting 1-3 ducks: one more duck each step, number + word, finale')
        await close(pg); await seek(pg, c['s'] + 5.2, 600); await shot(pg, 'b12-kids-counting.png', 600)
        await seek(pg, 999); await P(pg, 'studio.select(null)'); await pg.wait_for_timeout(200); await tool(pg, 'kids'); await pg.click('#kmTabs .chipbtn[data-v="abc"]'); await pg.wait_for_selector('#kaRange'); await pg.click('#kaRange .chipbtn[data-v="A-E"]'); await pg.wait_for_timeout(500)
        await pg.click('#kaAdd'); await pg.wait_for_function(KC + '.length===4', timeout=30000); await pg.wait_for_timeout(400)
        ab = await P(pg, f'(()=>{{const c={KC}.find(c=>c.kids==="abc");return {{s:c.start,d:c.dur,tx:c.inner.tracks.filter(t=>t.kind==="text").flatMap(t=>t.clips).map(x=>x.text.content),img:c.inner.tracks.flatMap(t=>t.clips).filter(x=>x.type==="image").map(x=>!!studio.media.get(x.mediaId))}}}})()')
        log(' ', ab['tx'][:4], len(ab['img'])); ok('A is for Apple' in ab['tx'] and 'E is for Elephant' in ab['tx'] and len(ab['img']) == 10 and all(ab['img']), 'ABC A-E: 3D letter + picture + "A is for Apple" each')
        await close(pg); await seek(pg, ab['s'] + 1.4 + 2.2 + 1.2, 600); await shot(pg, 'b12-kids-abc.png', 600)
        ok(await P(pg, 'studio.kids.ABC_WORDS && Object.keys(studio.kids.ABC_WORDS).length') == 26, 'ABC builder knows A-Z')

        log('== preview == export')
        D = await P(pg, 'studio.projectDuration(studio.S.project)'); log('  total', D); metrics['total'] = D
        f = await export(pg, 'kids', 720)
        par = {}
        for tt in [VS + VD * .7, qs + 1.5, qs + tr - .5, qs + tr + 1.0, c['s'] + 5.2, ab['s'] + 4.5]:
            ex = small(frame(f, tt, f'k{tt:.2f}.png', (90, 160))); pv = small(await still(pg, tt, 90, 160)); par[f'{tt:.2f}'] = round(float(np.abs(ex - pv).mean()), 2)
        log('  parity', par); metrics['parity'] = par; ok(max(par.values()) < 10, 'preview == export (verse card, quiz before/after reveal, counting, ABC)')
        au = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', str(f)], capture_output=True, text=True).stdout.strip(); ok(bool(au), f'export has the sounds (audio stream {au})')
        ok(not errs, f'no page errors {errs[:3]}')
        await b.close()
    (ROOT / 'tests/kids-metrics.json').write_text(json.dumps(metrics, indent=1))
    log(f'RESULT: {"PASS" if not fails else "FAIL"} ({len(fails)} failures) in {time.time()-T0:.0f}s')
    for f in fails: log('  -', f)
    sys.exit(1 if fails else 0)
asyncio.run(run())

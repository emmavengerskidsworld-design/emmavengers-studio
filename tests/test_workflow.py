"""Batch 11 part 1 — Workflow pro (Google Chrome, 390x844 phone).   python3 tests/test_workflow.py [shots_dir]
multi-select (long-press, select mode, box, shift-click), group / ungroup, compound clips (nest, edit inside, break apart, preview == export),
markers, magnetic / free main track, copy / paste clips + attributes (across projects), undo history panel, pinch + smooth zoom,
keyboard shortcuts, detach / link / re-attach audio."""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, math, io, base64
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-wf-')); fails = []; T0 = time.time(); PORT = 8797; metrics = {}
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
async def still(pg, t=0.5, w=90, h=160):
    d = await P(pg, f'studio.renderStill({{t:{t},W:{w},H:{h}}})'); return np.asarray(Image.open(io.BytesIO(base64.b64decode(d))).convert('RGB')).astype(float)
async def shot(pg, name, wait=500): await pg.wait_for_timeout(wait); await pg.screenshot(path=str(SHOTS / name)); log('  shot', name)
async def seek(pg, t): await P(pg, f'studio.player.pause(); studio.player.seek({t}); studio.timeline.setTime({t})'); await pg.wait_for_timeout(250)
async def close(pg): await P(pg, 'document.querySelector(".sh-done")?.click()'); await pg.wait_for_timeout(300)
async def clip(pg, cid): return await P(pg, f'(()=>{{const f=studio.find(studio.S.project,"{cid}"); return f?JSON.parse(JSON.stringify(f.clip)):null}})()')
async def tb(pg, t): await pg.click(f'#toolbar .tool[data-tool="{t}"]'); await pg.wait_for_timeout(300)
async def clips(pg): return await P(pg, 'studio.S.project.tracks.flatMap(t=>t.clips.map(c=>({id:c.id,type:c.type,kind:t.kind,start:c.start,group:c.group||null,link:c.link||null})))')
async def box(pg, cid): return await pg.locator(f'.clip[data-id="{cid}"]').bounding_box()
async def drag(pg, cid, dx, dy=0, mid=False):
    b = await box(pg, cid); x, y = b['x'] + (b['width'] / 2 if mid else min(14, b['width'] / 2)), b['y'] + b['height'] / 2
    await pg.mouse.move(x, y); await pg.mouse.down(); await pg.mouse.move(x + 3, y, steps=2); await pg.mouse.move(x + dx, y + dy, steps=10); await pg.wait_for_timeout(80); await pg.mouse.up(); await pg.wait_for_timeout(300)
async def longpress(pg, cid):
    b = await box(pg, cid); x, y = b['x'] + min(14, b['width'] / 2), b['y'] + b['height'] / 2
    await P(pg, f'''(()=>{{const el=document.elementFromPoint({x},{y}); el.dispatchEvent(new PointerEvent('pointerdown',{{bubbles:true,pointerType:'touch',pointerId:7,clientX:{x},clientY:{y},isPrimary:true}}))}})()''')
    await pg.wait_for_timeout(480); await P(pg, f'''window.dispatchEvent(new PointerEvent('pointerup',{{bubbles:true,pointerType:'touch',pointerId:7,clientX:{x},clientY:{y}}}))'''); await pg.wait_for_timeout(250)
def frame(f, t, name, fps=30):
    o = OUT / name; subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(f), '-vf', f'select=eq(n\\,{int(round(t * fps))})', '-vsync', '0', '-frames:v', '1', str(o)], check=True)
    return np.asarray(Image.open(o).convert('RGB').resize((90, 160), Image.BOX)).astype(float)
async def export(pg, tag, res=720):
    await pg.click('#exportBtn'); await pg.wait_for_selector('#exRes[data-checked="1"]', timeout=20000); await pg.click(f'#exRes .chipbtn[data-v="{res}"]'); await pg.wait_for_timeout(200)
    await pg.click('#exGo'); await pg.wait_for_selector('#exDone:not([hidden])', timeout=300000)
    async with pg.expect_download() as dl: await pg.click('#exSave')
    d = await dl.value; f = OUT / (tag + '.mp4'); await d.save_as(str(f)); await pg.click('#exBack'); await pg.wait_for_timeout(300); return f
def assets():
    for n, c in (('red', (220, 40, 40)), ('green', (40, 200, 70)), ('blue', (40, 80, 220))):
        im = Image.new('RGB', (360, 640), c); d = ImageDraw.Draw(im); d.rectangle([40, 40, 320, 200], fill=(250, 250, 250)); d.ellipse([120, 380, 240, 500], fill=(20, 20, 20)); im.save(OUT / f'{n}.png')
    st = Image.new('RGBA', (200, 200), (0, 0, 0, 0)); d = ImageDraw.Draw(st); d.ellipse([10, 10, 190, 190], fill=(255, 210, 40, 255)); d.rectangle([60, 80, 140, 120], fill=(20, 20, 20, 255)); st.save(OUT / 'sticker.png')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=s=360x640:r=30:d=3', '-f', 'lavfi', '-i', 'sine=f=440:d=3', '-shortest', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', str(OUT / 'av.mp4')], check=True)

async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    assets()
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=30000)
        await P(pg, 'studio.home && studio.home.hide && studio.home.hide()'); await pg.wait_for_timeout(300)
        await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[]); p.bg="#000000"})')
        await pg.set_input_files('#fileMedia', [str(OUT / f'{n}.png') for n in ('red', 'green', 'blue')]); await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===3', timeout=30000)
        sk = base64.b64encode((OUT / 'sticker.png').read_bytes()).decode()
        ids = await P(pg, f'''(async()=>{{const b=await (await fetch("data:image/png;base64,{sk}")).blob(); const rec=await studio.importFile(new File([b],"sticker.png",{{type:"image/png"}}));
          const P_=studio.project; let o,t; studio.act(p=>{{const c=P_.newClip("image",{{mediaId:rec.id,dur:2,transform:{{x:.3,y:.3,scale:.35,rotation:0,opacity:1}}}}); P_.addToKind(p,"overlay",c,1); o=c.id;
          const x=P_.newClip("text",{{dur:2,transform:{{x:.5,y:.75,scale:1,rotation:0,opacity:1}},text:{{content:"GROUP",size:90}}}}); P_.addToKind(p,"text",x,1.5); t=x.id}}); return [o,t]}})()''')
        ov, tx = ids; await pg.wait_for_timeout(500); main = [c['id'] for c in await clips(pg) if c['kind'] == 'main']
        await P(pg, 'studio.timeline.setZoom(60)'); await seek(pg, 0)

        log('== multi-select')
        await longpress(pg, ov); await longpress(pg, tx); ms = await P(pg, 'studio.S.multi')
        ok(set(ms) == {ov, tx}, f'long-press adds clips to the selection ({len(ms)})'); ok(await P(pg, '!!document.querySelector("#multiCount")') and await P(pg, '!!document.querySelector("#toolbar .tool[data-tool=mgroup]")'), 'multi-select toolbar (count + Group / Compound / Copy …)')
        await shot(pg, 'b11-multi.png')
        await tb(pg, 'mdone'); ok(await P(pg, 'studio.S.multi.length') == 0, 'Done clears the selection')
        await pg.click('#selModeBtn'); await pg.wait_for_timeout(150)
        tl = await pg.locator('#tlScroll').bounding_box(); bo, bt = await box(pg, ov), await box(pg, tx)
        x0, y0 = tl['x'] + 6, min(bo['y'], bt['y']) + 2; x1, y1 = max(bo['x'] + bo['width'], bt['x'] + bt['width']) - 20, max(bo['y'] + bo['height'], bt['y'] + bt['height']) - 2
        await pg.mouse.move(x0, y0); await pg.mouse.down(); await pg.mouse.move((x0 + x1) / 2, (y0 + y1) / 2, steps=4); await pg.mouse.move(x1, y1, steps=4); await shot(pg, 'b11-box-select.png', 100); await pg.mouse.up(); await pg.wait_for_timeout(300)
        ms = await P(pg, 'studio.S.multi'); ok(ov in ms and tx in ms, f'box select picks the clips under the box ({len(ms)} clips)')
        await tb(pg, 'mdone'); await pg.click(f'.clip[data-id="{main[0]}"]', modifiers=['Shift']); await pg.click(f'.clip[data-id="{main[1]}"]', modifiers=['Shift'])
        ok(set(await P(pg, 'studio.S.multi')) == {main[0], main[1]}, 'shift-click selects several clips (desktop)'); await tb(pg, 'mdone')

        log('== group / ungroup')
        await P(pg, f'studio.work.store.setMulti(["{ov}","{tx}"]); studio.select("{tx}")'); await pg.wait_for_timeout(200); await tb(pg, 'mgroup')
        a, c2 = await clip(pg, ov), await clip(pg, tx); ok(a['group'] and a['group'] == c2['group'], 'Group gives both clips one group id'); await shot(pg, 'b11-group.png')
        await tb(pg, 'mdone'); s0 = (await clip(pg, tx))['start']; pps = await P(pg, 'studio.timeline.pps'); await drag(pg, ov, .5 * pps)
        d1, d2 = (await clip(pg, ov))['start'] - 1, (await clip(pg, tx))['start'] - s0; ok(abs(d1 - .5) < .1 and abs(d1 - d2) < 1e-6, f'dragging one grouped clip moves the group ({d1:.2f}s / {d2:.2f}s)')
        await P(pg, f'studio.select("{ov}")'); await pg.wait_for_timeout(200); await tb(pg, 'ungroup'); ok(not (await clip(pg, tx)).get('group'), 'Ungroup')
        await P(pg, f'studio.act(p=>{{studio.find(p,"{ov}").clip.start=1; studio.find(p,"{tx}").clip.start=1.5}})')

        log('== compound clip')
        tA = 2.0; ref = await still(pg, tA)
        await P(pg, f'studio.work.store.setMulti(["{ov}","{tx}"]); studio.select("{tx}")'); await pg.wait_for_timeout(200); await tb(pg, 'mcompound')
        cs = await clips(pg); cc = next((c for c in cs if c['type'] == 'compound'), None)
        ok(cc and not any(c['id'] in (ov, tx) for c in cs) and abs(cc['start'] - 1) < 1e-6, f'compound clip replaces the 2 clips (start {cc and cc["start"]})')
        d = float(np.abs(await still(pg, tA) - ref).mean()); ok(d < 2, f'compound looks the same as the clips it holds ({d:.2f})'); await shot(pg, 'b11-compound.png')
        await P(pg, f'studio.act(p=>{{const c=studio.find(p,"{cc["id"]}").clip; c.transform={{...c.transform,scale:.6,x:.35}}}})'); small_ = await still(pg, tA)
        ok(float(np.abs(small_ - ref).mean()) > 3, 'compound can be scaled / moved as one picture')
        f = await export(pg, 'comp'); dd = float(np.abs(frame(f, tA, 'c.png') - small_).mean()); ok(dd < 10, f'compound: preview == export ({dd:.1f})'); metrics['compound_parity'] = round(dd, 2)
        await P(pg, f'studio.select("{cc["id"]}")'); await pg.wait_for_timeout(200); await tb(pg, 'open')
        ok(await P(pg, 'studio.S.nests.length') == 1 and not await P(pg, 'document.querySelector("#nestBar").hidden'), 'Open shows the inside (breadcrumb bar)')
        inner = await clips(pg); ok({c['id'] for c in inner} >= {ov, tx}, f'inside: the 2 original clips ({len(inner)} clips)'); await shot(pg, 'b11-compound-inside.png')
        await P(pg, f'studio.act(p=>{{studio.find(p,"{tx}").clip.text.content="CHANGED"}})'); await pg.click('#nestBack'); await pg.wait_for_timeout(400)
        ok(await P(pg, 'studio.S.nests.length') == 0, 'back to the main timeline'); cin = await clip(pg, cc['id'])
        ok(any(c.get('text', {}).get('content') == 'CHANGED' for t in cin['inner']['tracks'] for c in t['clips']), 'edit inside is kept in the compound clip')
        await P(pg, 'studio.work.store.undo()'); await pg.wait_for_timeout(200); cin = await clip(pg, cc['id'])
        ok(any(c.get('text', {}).get('content') == 'GROUP' for t in cin['inner']['tracks'] for c in t['clips']), 'one Undo reverts the whole inside edit'); await P(pg, 'studio.work.store.redo()')
        await P(pg, f'studio.act(p=>{{const c=studio.find(p,"{cc["id"]}").clip; c.transform={{...c.transform,scale:1,x:.5}}}})')
        await P(pg, f'studio.select("{cc["id"]}")'); await pg.wait_for_timeout(200); await tb(pg, 'breakapart'); cs = await clips(pg)
        ok(not any(c['type'] == 'compound' for c in cs) and {ov, tx} <= {c['id'] for c in cs}, 'Break apart puts the clips back')
        ok(abs(next(c for c in cs if c['id'] == ov)['start'] - 1) < 1e-6, 'clips keep their times after break apart')

        log('== markers')
        await P(pg, 'studio.select(null)'); await seek(pg, 1.25); await pg.keyboard.press('m'); await seek(pg, 2.5); await pg.keyboard.press('m')
        mk = await P(pg, 'studio.S.project.markers||[]'); ok(len(mk) == 2 and abs(mk[0]['t'] - 1.25) < 1e-3, f'M adds markers ({len(mk)})')
        await tb(pg, 'markers'); await pg.fill('#mkList .mkrow:first-child .mklabel', 'Intro'); await pg.click('#mkList .mkrow:first-child .mkc[data-c="#3ddc84"]'); await pg.wait_for_timeout(200)
        mk = await P(pg, 'studio.S.project.markers'); ok(mk[0]['label'] == 'Intro' and mk[0]['color'] == '#3ddc84', 'label + colour'); await shot(pg, 'b11-markers.png'); await close(pg)
        await seek(pg, 0); fl = await pg.locator('#mkBar .mkf').first.bounding_box(); await pg.mouse.click(fl['x'] + 5, fl['y'] + 8); await pg.wait_for_timeout(400)
        ok(abs(await P(pg, 'studio.player.t') - 1.25) < .02, 'tap a marker flag jumps there'); await close(pg)
        ok(await P(pg, 'document.querySelectorAll(".mkl").length') == 2, 'marker lines across the tracks')

        log('== magnetic / free main track')
        await P(pg, 'studio.select(null)'); ok(await P(pg, 'document.querySelector("#magBtn").classList.contains("on")'), 'main track starts magnetic'); await pg.click('#magBtn'); await pg.wait_for_timeout(200)
        ok(await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="main").free===true'), 'tap = free main track')
        m2 = main[1]; s_ = (await clip(pg, m2))['start']; await seek(pg, s_ + 1.2); await drag(pg, m2, 1.0 * await P(pg, 'studio.timeline.pps'), mid=True)
        m = {c['id']: c['start'] for c in await clips(pg) if c['kind'] == 'main'}; gap = m[m2] - (s_)
        ok(gap > .8 and m[main[2]] >= m[m2] + 2.99, f'free: a main clip can leave a gap ({gap:.2f}s), the next one is pushed, not overlapped')
        gp = await still(pg, s_ + .3); ok(gp.mean() < 30, 'the gap shows the background'); await shot(pg, 'b11-magnetic-free.png')
        await pg.click('#magBtn'); await pg.wait_for_timeout(200); m = {c['id']: c['start'] for c in await clips(pg) if c['kind'] == 'main'}
        ok(abs(m[m2] - s_) < 1e-6, 'magnetic again closes the gap')

        log('== copy / paste clips + attributes')
        await P(pg, f'studio.select("{ov}")'); await pg.wait_for_timeout(150); await pg.keyboard.press('Control+c'); await seek(pg, 4); await pg.keyboard.press('Control+v'); await pg.wait_for_timeout(400)
        cs = await clips(pg); ok(sum(1 for c in cs if c['kind'] == 'overlay') == 2, 'Ctrl+C / Ctrl+V pastes a copy at the white line')
        await P(pg, f'studio.act(p=>{{const c=studio.find(p,"{main[0]}").clip; c.filter={{id:"mono",amount:1}}; c.anim={{in:{{id:"fade",dur:.5}}}}}})')
        await P(pg, f'studio.select("{main[0]}")'); await pg.wait_for_timeout(200); await tb(pg, 'copyattr')
        await P(pg, f'studio.select("{main[2]}")'); await pg.wait_for_timeout(200); await tb(pg, 'pasteattr'); await shot(pg, 'b11-paste-attrs.png'); await pg.click('#attrGo'); await pg.wait_for_timeout(300)
        c3 = await clip(pg, main[2]); ok(c3.get('filter', {}) and c3['filter']['id'] == 'mono' and c3.get('anim', {}).get('in', {}).get('id') == 'fade', 'paste attributes: filter + animation copied')
        await P(pg, f'studio.select("{main[1]}")'); await pg.wait_for_timeout(150); await pg.keyboard.press('Control+c'); pid0 = await P(pg, 'studio.S.project.id')
        await P(pg, '(async()=>{await studio.work.store.openProject(studio.project.newProject())})()'); await pg.wait_for_timeout(600)
        ok(await P(pg, 'studio.S.project.id') != pid0, 'opened another project'); await pg.keyboard.press('Control+v'); await pg.wait_for_timeout(800)
        cs = await clips(pg); im = await still(pg, .5); ok(len(cs) == 1 and im[..., 1].mean() > 120, f'paste in another project brings the clip + its media (green {im[...,1].mean():.0f})')
        await P(pg, f'(async()=>{{const r=await studio.projects.get?.("{pid0}"); }})()')
        await P(pg, f'(async()=>{{const db=await import("./js/db.js"); const p=await db.get("projects","{pid0}"); await studio.work.store.openProject(p)}})()'); await pg.wait_for_timeout(800)

        log('== undo history panel')
        await P(pg, 'studio.select(null)'); n0 = len(await clips(pg)); await P(pg, f'studio.act(p=>studio.project.remove(p,"{tx}"),"Delete text")'); await pg.keyboard.press('h'); await pg.wait_for_timeout(400)
        rows = await P(pg, '[...document.querySelectorAll("#histList .histrow")].map(b=>b.textContent)'); ok(len(rows) >= 2 and 'Delete text' in rows[1] and rows[0].startswith('Now'), f'history lists steps newest first ({len(rows)} rows: {rows[:3]})')
        await shot(pg, 'b11-history.png'); await pg.click('#histList .histrow.past >> nth=0'); await pg.wait_for_timeout(300)
        ok(len(await clips(pg)) == n0, 'tap a step goes back to it'); ok(await P(pg, 'document.querySelectorAll("#histList .histrow.fut").length') >= 1, 'undone steps stay listed (redo)')
        await pg.click('#histList .histrow.fut >> nth=-1'); await pg.wait_for_timeout(300); ok(len(await clips(pg)) == n0 - 1, 'tap a greyed step = redo'); await close(pg)
        await P(pg, 'studio.work.store.undo()')

        log('== pinch + smooth zoom')
        await P(pg, 'studio.timeline.setZoom(40)'); cdp = await ctx.new_cdp_session(pg); tl = await pg.locator('#tlScroll').bounding_box(); cx, cy = tl['x'] + tl['width'] / 2, tl['y'] + 60
        pt = lambda dx: [{'x': cx - dx, 'y': cy, 'id': 1}, {'x': cx + dx, 'y': cy, 'id': 2}]
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': pt(30)})
        for k in range(1, 9): await cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': pt(30 + k * 7.5)}); await pg.wait_for_timeout(20)
        await cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []}); await pg.wait_for_timeout(200)
        z = await P(pg, 'studio.timeline.pps'); ok(110 < z < 130, f'pinch out x3 zooms in (40 -> {z:.0f} px/s)')
        await pg.keyboard.press('-'); await pg.wait_for_timeout(60); zm = await P(pg, 'studio.timeline.pps'); await pg.wait_for_timeout(300); z2 = await P(pg, 'studio.timeline.pps')
        ok(abs(z2 - z / 1.6) < 1 and z2 < zm < z, f'smooth zoom animates ({z:.0f} -> {zm:.0f} -> {z2:.0f})')

        log('== keyboard shortcuts')
        await pg.keyboard.press('?'); await pg.wait_for_timeout(300); ok(await P(pg, 'document.querySelectorAll("#kbdList kbd").length') >= 18, 'the ? key lists the shortcuts'); await shot(pg, 'b11-shortcuts.png'); await pg.keyboard.press('Escape')
        n0 = len(await clips(pg)); await pg.keyboard.press('Control+a'); ok(await P(pg, 'studio.S.multi.length') == n0, 'Ctrl+A selects every clip')
        await pg.keyboard.press('Delete'); await pg.wait_for_timeout(200); ok(len(await clips(pg)) == 0, 'Delete removes the selection'); await pg.keyboard.press('Control+z'); await pg.wait_for_timeout(300); ok(len(await clips(pg)) == n0, 'Ctrl+Z brings it back')
        await seek(pg, 1.0); await pg.keyboard.press('ArrowRight'); ok(abs(await P(pg, 'studio.player.t') - (1 + 1 / 30)) < 1e-3, 'arrow = one frame'); await pg.keyboard.press('End'); ok(abs(await P(pg, 'studio.player.t') - await P(pg, 'studio.projectDuration(studio.S.project)')) < 1e-3, 'End jumps to the end')
        await P(pg, f'studio.select("{main[0]}")'); await pg.keyboard.press('Control+d'); await pg.wait_for_timeout(200); ok(len(await clips(pg)) == n0 + 1, 'Ctrl+D duplicates'); await pg.keyboard.press('Control+z')

        log('== detach / link audio')
        await P(pg, 'studio.select(null); studio.act(p=>{p.tracks.forEach(t=>t.clips=[]); delete p.markers}); document.querySelector("#fileMedia").value=""')
        await pg.set_input_files('#fileMedia', [str(OUT / 'av.mp4')]); await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length===1', timeout=30000); await pg.wait_for_timeout(500)
        vid = (await clips(pg))[0]['id']; await P(pg, f'studio.select("{vid}")'); await pg.wait_for_timeout(200); await tb(pg, 'detach')
        cs = await clips(pg); au = next((c for c in cs if c['type'] == 'audio'), None); v = await clip(pg, vid)
        ok(au and v['muteAudio'] and au['link'] and au['link'] == v['link'], 'Detach audio: sound on its own line, linked to the video'); await shot(pg, 'b11-detach.png')
        await pg.click('#magBtn'); await pg.wait_for_timeout(150); await P(pg, 'studio.select(null)'); await seek(pg, 0); await drag(pg, au['id'], .6 * await P(pg, 'studio.timeline.pps'))
        a2, v2 = await clip(pg, au['id']), await clip(pg, vid); ok(a2['start'] > .4 and abs(a2['start'] - v2['start']) < 1e-6, f'moving the sound moves the linked video ({a2["start"]:.2f} / {v2["start"]:.2f})')
        await P(pg, f'studio.select("{au["id"]}")'); await pg.wait_for_timeout(200); await tb(pg, 'unlink'); ok(not (await clip(pg, vid)).get('link'), 'Unlink')
        await P(pg, f'studio.act(p=>{{studio.work.linkClips(p,["{vid}","{au["id"]}"])}})'); await P(pg, f'studio.select("{vid}")'); await pg.wait_for_timeout(200); await tb(pg, 'reattach')
        cs = await clips(pg); ok(len(cs) == 1 and not (await clip(pg, vid)).get('muteAudio'), 'Re-attach puts the sound back into the video'); await pg.click('#magBtn')
        real = [e for e in errs if 'favicon' not in e]; ok(not real, f'no page errors {real[:3]}')
        await b.close()
    log('METRICS', json.dumps(metrics))
    log(f'RESULT: {"PASS" if not fails else "FAIL"} ({len(fails)} failures) in {time.time()-T0:.0f}s')
    for f in fails: log('  -', f)
asyncio.run(run()); sys.exit(1 if fails else 0)

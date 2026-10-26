"""Batch 3 test: animations + more transitions (Google Chrome, 390x844 phone).   python3 tests/test_anim.py [shots_dir]
- transition registry: every entry renders without error, p=0 == clip A, p=1 == clip B, midpoint differs from a hard cut
- clip animations (In / Out / Combo) and text animations (In / Out / Loop): every entry renders, differs from no effect
  in the middle, In ends / Out starts exactly on the untouched picture
- editor panels (tabs, animated tiles, duration), undo/redo, autosave, split
- preview == export parity for a sample, combined with keyframes + HD Enhance; render cost per frame"""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, io, base64
from pathlib import Path
from PIL import Image, ImageChops, ImageStat
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]; FX = ROOT / 'tests/fixtures'
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-anim-')); fails = []; T0 = time.time(); PORT = 8771
def log(*a): print(f'[{time.time()-T0:6.1f}s]', *a, flush=True)
def ok(c, m):
    log(('  ok   ' if c else '  FAIL ') + m)
    if not c: fails.append(m)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def handle(self):
        try: super().handle()
        except Exception: pass
def frame(f, t, name):
    o = OUT / name; subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{t:.3f}', '-i', str(f), '-frames:v', '1', str(o)], check=True); return Image.open(o).convert('RGB')
def mean(im, box):
    W, H = im.size; return im.crop((int(box[0] * W), int(box[1] * H), int(box[2] * W), int(box[3] * H))).resize((1, 1), Image.BOX).getpixel((0, 0))
def grid_diff(a, b):
    b = b.resize(a.size); g = lambda im: [mean(im, (i / 4, j / 8, (i + 1) / 4, (j + 1) / 8)) for i in range(4) for j in range(8)]
    return max(sum(abs(x - y) for x, y in zip(c1, c2)) for c1, c2 in zip(g(a), g(b)))
def psnr(a, b):
    import math; b = b.resize(a.size); d = ImageChops.difference(a, b); st = ImageStat.Stat(d); mse = sum(x * x for x in st.rms) / 3
    return 99.0 if mse == 0 else 10 * math.log10(255 * 255 / mse)
def psnr_lo(a, b):  # PSNR at 1/4 size: compares the picture, not H.264 noise on fine detail
    w, h = a.size[0] // 4, a.size[1] // 4; return psnr(a.resize((w, h), Image.BOX), b.resize(a.size).resize((w, h), Image.BOX))
async def new_page(b):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
    await ctx.add_init_script("addEventListener('DOMContentLoaded',()=>{const s=document.createElement('style');s.textContent='#toast,#fsBtn{visibility:hidden!important}';document.head.append(s)})")  # B16: toasts / overlay buttons never in preview captures
    pg = await ctx.new_page(); pg.errs = []
    pg.on('pageerror', lambda e: pg.errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and pg.errs.append(m.text))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=20000); return ctx, pg
P = lambda pg, js: pg.evaluate(js)
async def seek_exact(pg, t): await P(pg, f'(()=>{{studio.player.pause();studio.player.seek({t});studio.timeline.setTime({t})}})()'); await pg.wait_for_timeout(700)
async def still(pg, t, W=720, H=1280):
    d = await P(pg, f'studio.renderStill({{t:{t},W:{W},H:{H}}})'); return Image.open(io.BytesIO(base64.b64decode(d))).convert('RGB')
async def export(pg, tag, res=720):
    await pg.click('#exportBtn'); await pg.click(f'#exRes .chipbtn[data-v="{res}"]'); await pg.click('#exGo'); await pg.wait_for_selector('#exDone:not([hidden])', timeout=240000)
    async with pg.expect_download() as dl: await pg.click('#exSave')
    d = await dl.value; f = OUT / (tag + '.mp4'); await d.save_as(str(f)); await pg.click('#exBack'); await pg.wait_for_timeout(300); return f
async def main_clips(pg): return await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="main").clips.map(c=>({id:c.id,type:c.type,start:c.start,tr:c.transitionIn,anim:c.anim||null}))')
PROBE = "import('./tests/fxprobe.js')"

async def test_transitions(b):
    log('== transitions: registry (every entry)')
    ctx, pg = await new_page(b)
    r = await P(pg, PROBE + '.then(m=>({p:m.probeTransitions(), t:m.timeTransitions()}))'); res, tms = r['p']['res'], r['t']
    ok(not r['p']['errors'], f'every transition renders without error {r["p"]["errors"][:3]}')
    n = len(res); ok(n >= 150, f'{n} transitions registered')
    cats = {}
    for k, v in res.items(): cats.setdefault(v['cat'], []).append(v['name'])
    for c, names in cats.items(): log(f'       {c} ({len(names)}): {", ".join(names)}')
    bad0 = [k for k, v in res.items() if v['d0'] > 0.5]; bad1 = [k for k, v in res.items() if v['d1'] > 0.5]
    ok(not bad0, f'p=0 is exactly clip A for all {n} {bad0}'); ok(not bad1, f'p=1 is exactly clip B for all {n} {bad1}')
    flat = [k for k, v in res.items() if not (v['mid5A'] > 3 and v['mid5B'] > 1.5)]
    ok(not flat, f'midpoint differs from both A and B (not a hard cut) for all {n} {flat}')
    slow = sorted(tms.items(), key=lambda x: -x[1])[:5]; log(f'       slowest at 540x960: {[(k, round(v, 1)) for k, v in slow]}')
    ok(slow[0][1] < 120, f'every transition draws a 540x960 frame in < 120 ms on this box (worst {slow[0][0]} {slow[0][1]:.1f} ms)')
    ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

    log('== transitions: picker + preview/export parity for a sample')
    ctx, pg = await new_page(b)
    await pg.set_input_files('#fileMedia', [str(FX / 'sharp.png'), str(FX / 'image.png'), str(FX / 'sharp.png')])
    await pg.wait_for_function('studio.S.project.tracks.find(t=>t.kind==="main").clips.length===3', timeout=20000)
    mc = await main_clips(pg)
    await pg.locator(f'.joint[data-joint="{mc[1]["id"]}"]').click(); await pg.wait_for_selector('.trgrid .trtile')
    tabs = await P(pg, "[...document.querySelectorAll('.chips.tabs .chipbtn')].map(b=>b.dataset.v)")
    ok(all(c in tabs for c in ('Motion', '3D', 'Split', 'Kids', 'Comic', 'Magic')), f'new picker tabs: {tabs}')
    await pg.click('.chips.tabs .chipbtn[data-v="Kids"]'); await pg.wait_for_timeout(100)
    kids = await pg.locator('.trtile').count(); ok(kids == 1 + len(cats['Kids']), f'Kids tab shows None + {kids - 1} transitions')
    await pg.click('.trtile[data-tr="cloud"]'); await pg.wait_for_timeout(2300)
    await pg.screenshot(path=str(SHOTS / 'transition-picker-kids-390.png')); log('  shot transition-picker-kids-390.png')
    await pg.click('.chips.tabs .chipbtn[data-v="3D"]'); await pg.wait_for_timeout(1200); await pg.screenshot(path=str(SHOTS / 'transition-picker-3d-390.png')); log('  shot transition-picker-3d-390.png')
    await pg.click('.chips.tabs .chipbtn[data-v="Magic"]'); await pg.wait_for_timeout(100)
    magic = await pg.locator('.trtile').count(); ok(magic == 1 + len(cats['Magic']), f'Magic (GPU) tab shows None + {magic - 1} transitions')
    await pg.click('.trtile[data-tr="waterDrop"]'); await pg.wait_for_timeout(2300); await pg.screenshot(path=str(SHOTS / 'b8-transition-picker-magic-390.png')); log('  shot b8-transition-picker-magic-390.png')
    await pg.click('.chips.tabs .chipbtn[data-v="Comic"]'); await pg.wait_for_timeout(1200); await pg.screenshot(path=str(SHOTS / 'b8-transition-picker-comic-390.png')); log('  shot b8-transition-picker-comic-390.png')
    await pg.click('.trtile[data-tr="pow"]'); await pg.click('.sh-done')
    await P(pg, f"studio.act(p=>{{const m=p.tracks.find(t=>t.kind==='main');m.clips[1].transitionIn={{id:'waterDrop',dur:1}};m.clips[2].transitionIn={{id:'heartsFloat',dur:1}};}})")
    mc = await main_clips(pg); t1, t2 = mc[1]['start'] + 0.5, mc[2]['start'] + 0.5
    ok(mc[1]['tr']['id'] == 'waterDrop' and mc[2]['tr']['id'] == 'heartsFloat', 'water drop (GPU) + floating hearts set on the two cuts')
    prev = {}
    for t in (t1, t2):
        await seek_exact(pg, t); im = OUT / f'tprev_{t}.png'; await pg.locator('#preview').screenshot(path=str(im)); prev[t] = Image.open(im).convert('RGB')
    st = {t: await still(pg, t) for t in (t1, t2)}
    st0 = await still(pg, 1.0); f = await export(pg, 'transitions2'); ref = psnr_lo(st0, frame(f, 1.0, 'tex_ref.png')); log(f'       reference: plain frame, export vs renderer PSNR(1/4 size) {ref:.1f} dB')
    for t, nm in ((t1, 'water drop (GPU)'), (t2, 'floating hearts')):
        ex = frame(f, t, f'tex_{t}.png'); ps = psnr_lo(st[t], ex); gd = grid_diff(prev[t], ex)
        ok(ps > 32, f'{nm}: export frame == renderer at {t:.2f}s (PSNR at 1/4 size {ps:.1f} dB; plain frame {ref:.1f})'); ok(gd < 60, f'{nm}: preview == export (max cell diff {gd})')
        a = await still(pg, t - 0.55); ok(psnr_lo(a, ex) < 25, f'{nm}: midpoint frame is mid-effect, not the outgoing clip')
    ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

async def test_anim_registries(b):
    log('== clip + text animation registries (every entry)')
    ctx, pg = await new_page(b)
    r = await P(pg, PROBE + '.then(m=>({p:m.probeAnims(), t:m.timeAnims()}))'); res, tms = r['p']['res'], r['t']
    ok(not r['p']['errors'], f'every animation renders without error {r["p"]["errors"][:3]}')
    cnt = {}
    for k, v in res.items(): cnt.setdefault((v['type'], v['kind']), []).append(v['name'])
    for (ty, kd), names in cnt.items(): log(f'       {"clip" if ty == "image" else "text"} {kd} ({len(names)}): {", ".join(names)}')
    nclip = sum(len(v) for (ty, _), v in cnt.items() if ty == 'image'); ntext = sum(len(v) for (ty, _), v in cnt.items() if ty == 'text')
    ok(nclip >= 150, f'{nclip} clip animations (In {len(cnt[("image","in")])} / Out {len(cnt[("image","out")])} / Combo {len(cnt[("image","combo")])})')
    ok(ntext >= 100, f'{ntext} text animations (In {len(cnt[("text","in")])} / Out {len(cnt[("text","out")])} / Loop {len(cnt[("text","loop")])})')
    flat = [k for k, v in res.items() if v['mid'] < 0.9]; ok(not flat, f'every animation visibly changes the picture mid-way {flat}')
    ends = [k for k, v in res.items() if v['kind'] in ('in', 'out') and v['end'] > 0.5]; ok(not ends, f'In ends / Out starts on the untouched picture {ends}')
    after = [k for k, v in res.items() if v['kind'] in ('in', 'out') and v['after'] > 0.01]; ok(not after, f'outside the In / Out time the clip is untouched {after}')
    per = [k for k, v in res.items() if v['kind'] in ('combo', 'loop') and v['end'] > 0.5]; ok(not per, f'Combo / Loop animations repeat seamlessly (cycle start == cycle end) {per}')
    slow = sorted(tms.items(), key=lambda x: -x[1])[:4]; log(f'       slowest draw at 540x960: {[(k, round(v, 1)) for k, v in slow]}')
    ok(slow[0][1] < 40, f'every animation draws in < 40 ms at 540x960 on this box (worst {slow[0][0]} {slow[0][1]:.1f} ms)')
    ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

async def pick_anim(pg, tab, aid, dur=None):
    await pg.click(f'.chips.animtabs .chipbtn[data-v="{tab}"]'); await pg.wait_for_timeout(80); await pg.click(f'.angrid .trtile[data-an="{aid}"]'); await pg.wait_for_timeout(80)
    if dur is not None: await P(pg, f"(()=>{{const r=document.querySelector('#anDur');r.value={dur};r.dispatchEvent(new Event('input'))}})()")

async def test_anim_editor(b):
    log('== Animation panel (clip): tabs, tiles, duration, undo, autosave, split')
    ctx, pg = await new_page(b)
    await pg.set_input_files('#fileMedia', [str(FX / 'sharp.png'), str(FX / 'image.png')])
    await pg.wait_for_function('studio.S.project.tracks.find(t=>t.kind==="main").clips.length===2', timeout=20000)
    mc = await main_clips(pg); c0 = mc[0]['id']
    await P(pg, f'studio.select("{c0}")'); await pg.wait_for_timeout(150)
    ok(await pg.locator('#toolbar .tool[data-tool="anim"]').count() == 1, 'clip toolbar has Animation')
    await pg.click('#toolbar .tool[data-tool="anim"]'); await pg.wait_for_selector('.angrid .trtile')
    tabs = await P(pg, "[...document.querySelectorAll('.chips.animtabs .chipbtn')].map(b=>b.textContent)"); ok(tabs == ['In', 'Out', 'Combo'], f'tabs {tabs}')
    nin = await pg.locator('.angrid .trtile').count(); ok(nin >= 55, f'In tab: None + {nin - 1} animated tiles')
    anim = await P(pg, "(async()=>{const c=document.querySelector('.angrid .trtile[data-an=\"zoomIn\"] canvas');const a=c.toDataURL();await new Promise(r=>setTimeout(r,300));return a!==c.toDataURL()})()")
    ok(anim, 'tiles are animated (drawn by the real renderer)')
    ok(await P(pg, "document.querySelector('#anDur').closest('label').hidden"), 'duration slider hidden until an animation is picked')
    await pick_anim(pg, 'in', 'zoomIn', 1.0)
    await pick_anim(pg, 'out', 'slideL', 0.8)
    await pick_anim(pg, 'combo', 'pulse', 1.5)
    lab = await P(pg, "document.querySelector('#anDur').closest('label').querySelector('.cl').textContent"); ok(lab == 'Speed', f'Combo tab slider is the loop speed ({lab})')
    await pg.click('.chips.animtabs .chipbtn[data-v="in"]'); await pg.wait_for_timeout(2300)
    await pg.screenshot(path=str(SHOTS / 'clip-animation-panel-390.png')); log('  shot clip-animation-panel-390.png')
    marks = await P(pg, "[...document.querySelectorAll('.chips.animtabs .chipbtn.set')].length"); ok(marks == 3, f'tabs with an animation are marked ({marks})')
    note = await P(pg, "document.querySelector('.sheet .hint').textContent"); ok('1.0s' in note, f'note shows the play time ({note})')
    await pg.click('.sh-done')
    a = (await main_clips(pg))[0]['anim']
    ok(a == {'in': {'id': 'zoomIn', 'dur': 1}, 'out': {'id': 'slideL', 'dur': 0.8}, 'combo': {'id': 'pulse', 'dur': 1.5}}, f'clip.anim saved: {a}')
    ok(await pg.locator(f'.clip[data-id="{c0}"] .anin').count() == 1 and await pg.locator(f'.clip[data-id="{c0}"] .anout').count() == 1 and await pg.locator(f'.clip[data-id="{c0}"] .anloop').count() == 1, 'timeline shows In / Out ramps and the loop mark')
    await pg.click('#undoBtn'); ok((await main_clips(pg))[0]['anim'] is None, 'one undo removes the whole Animation edit')
    await pg.click('#redoBtn'); ok((await main_clips(pg))[0]['anim'] == a, 'redo brings it back')
    await P(pg, f'studio.select("{c0}")'); await pg.wait_for_timeout(150); await pg.click('#toolbar .tool[data-tool="anim"]'); await pg.wait_for_selector('.angrid .trtile')
    await pick_anim(pg, 'out', 'none'); await pg.click('.sh-done'); a2 = (await main_clips(pg))[0]['anim']
    ok(a2 == {'in': {'id': 'zoomIn', 'dur': 1}, 'combo': {'id': 'pulse', 'dur': 1.5}}, f'None removes just that tab ({a2})')
    await pg.click('#undoBtn')
    snap = await P(pg, 'JSON.stringify({...studio.S.project,updated:0})'); await P(pg, 'studio.save()')
    await pg.reload(); await pg.wait_for_function('window.studio && studio.ready')
    ok(await P(pg, 'JSON.stringify({...studio.S.project,updated:0})') == snap, 'reload keeps animations (autosave)')
    await P(pg, f'(()=>{{studio.select("{c0}");studio.player.seek(1.5);studio.timeline.setTime(1.5)}})()'); await pg.wait_for_timeout(300)
    await pg.click('#toolbar .tool[data-tool="split"]'); await pg.wait_for_timeout(200); mc = await main_clips(pg)
    ok(set(mc[0]['anim'] or {}) == {'in', 'combo'} and set(mc[1]['anim'] or {}) == {'out', 'combo'}, f'split: In stays on part 1, Out moves to part 2, Combo on both ({mc[0]["anim"]}, {mc[1]["anim"]})')
    ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

    log('== Animation panel (text): In / Out / Loop')
    ctx, pg = await new_page(b)
    await pg.set_input_files('#fileMedia', [str(FX / 'sharp.png')]); await pg.wait_for_function('studio.S.project.tracks.find(t=>t.kind==="main").clips.length===1')
    await P(pg, 'studio.select(null)'); await pg.click('#toolbar .tool[data-tool="text"]'); await pg.wait_for_timeout(300); await pg.click('.sh-done')
    tid = await P(pg, "studio.S.project.tracks.find(t=>t.kind==='text').clips[0].id")
    await P(pg, f"studio.act(p=>{{const t=studio.find(p,'{tid}').clip;t.start=0;t.text.content='Jesus loves me';t.text.size=130;t.transform.y=.3}})"); await seek_exact(pg, 0.2)
    await P(pg, f'studio.select("{tid}")'); await pg.wait_for_timeout(150)
    await pg.click('#toolbar .tool[data-tool="anim"]'); await pg.wait_for_selector('.angrid .trtile')
    tabs = await P(pg, "[...document.querySelectorAll('.chips.animtabs .chipbtn')].map(b=>b.textContent)"); ok(tabs == ['In', 'Out', 'Loop'], f'text tabs {tabs}')
    ok(await pg.locator('.angrid .trtile[data-an="typewriter"]').count() == 1, 'text In tab has Typewriter')
    await pick_anim(pg, 'in', 'typewriter', 1.2); await pick_anim(pg, 'loop', 'wave'); await pick_anim(pg, 'out', 'fadeWords', 0.6)
    await pg.click('.chips.animtabs .chipbtn[data-v="loop"]'); await pg.wait_for_timeout(2300); await seek_exact(pg, 1.6)
    await pg.screenshot(path=str(SHOTS / 'text-animation-panel-390.png')); log('  shot text-animation-panel-390.png')
    await pg.click('.chips.animtabs .chipbtn[data-v="in"]'); await pg.wait_for_timeout(1200)
    await pg.screenshot(path=str(SHOTS / 'text-animation-in-390.png')); log('  shot text-animation-in-390.png')
    await pg.click('.sh-done'); ta = await P(pg, f'studio.find(studio.S.project,"{tid}").clip.anim')
    ok(ta == {'in': {'id': 'typewriter', 'dur': 1.2}, 'loop': {'id': 'wave', 'dur': 1.2}, 'out': {'id': 'fadeWords', 'dur': 0.6}}, f'text anim saved: {ta}')
    ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

async def test_anim_export(b):
    log('== preview == export with animations + keyframes + HD Enhance + transition')
    ctx, pg = await new_page(b)
    await pg.set_input_files('#fileMedia', [str(FX / 'low.png'), str(FX / 'image.png')])
    await pg.wait_for_function('studio.S.project.tracks.find(t=>t.kind==="main").clips.length===2', timeout=20000)
    await P(pg, 'studio.select(null)'); await pg.click('#toolbar .tool[data-tool="text"]'); await pg.wait_for_timeout(300); await pg.click('.sh-done'); await P(pg, 'studio.select(null)')
    await P(pg, """studio.act(p=>{const m=p.tracks.find(t=>t.kind==='main'), a=m.clips[0], b=m.clips[1], t=p.tracks.find(t=>t.kind==='text').clips[0];
      a.anim={in:{id:'spin',dur:1},combo:{id:'zoomPulse',dur:1}}; a.enhance={on:true,strength:.6}; a.keyframes={x:[{t:0,v:.4,ease:'linear'},{t:3,v:.6,ease:'linear'}]};
      b.anim={out:{id:'springR',dur:1}}; b.transitionIn={id:'whipL',dur:.6};
      t.start=0; t.dur=3; t.text.content='Jesus loves me'; t.anim={in:{id:'springLetters',dur:1.5},loop:{id:'glowWave',dur:1}};})""")
    await P(pg, 'studio.select(null)'); await pg.wait_for_timeout(200)
    D = await P(pg, 'studio.projectDuration(studio.S.project)'); times = [0.5, 1.2, 2.7, round(D - 0.5, 3)]
    prev, st = {}, {}
    for t in times:
        await seek_exact(pg, t); im = OUT / f'aprev_{t}.png'; await pg.locator('#preview').screenshot(path=str(im)); prev[t] = Image.open(im).convert('RGB')
        st[t] = await still(pg, t)
    calm = await still(pg, 1.6)
    ok(psnr_lo(st[0.5], calm) < 25, 'the In animation is visible at 0.5 s (differs from the settled frame)')
    rf = await P(pg, """import('./js/render.js').then(R=>{const W=1080,H=1920,c=new OffscreenCanvas(W,H),x=c.getContext('2d');const go=t=>{studio.player.seek(t);const t0=performance.now();for(let i=0;i<5;i++)R.renderFrame(x,W,H,studio.S.project,t+i/30,cl=>studio.player.source(cl),{});x.getImageData(0,0,1,1);return (performance.now()-t0)/5};return {anim:go(0.4),calm:go(1.6)}})""")
    log(f'       full 1080x1920 frame (HD Enhance + animation + text): {rf["anim"]:.1f} ms animating, {rf["calm"]:.1f} ms settled')
    ok(rf['anim'] < rf['calm'] * 2 + 30, 'animating costs about the same as a still frame (the HD pass is not redone at a new size)')
    f = await export(pg, 'anims')
    for t in times:
        ex = frame(f, t, f'aex_{t}.png'); ps = psnr_lo(st[t], ex); gd = grid_diff(prev[t], ex)
        ok(ps > 30, f'{t:.2f}s: export frame == renderer (PSNR at 1/4 size {ps:.1f} dB; fast spin = harder to compress)'); ok(gd < 60, f'{t:.2f}s: preview == export (max cell diff {gd})')
    a0, a1 = frame(f, 0.5, 'p1.png'), frame(f, 1.6, 'p2.png'); pair = Image.new('RGB', (a0.width * 2, a0.height)); pair.paste(a0, (0, 0)); pair.paste(a1, (a0.width, 0))
    pair.resize((pair.width // 2, pair.height // 2)).save(SHOTS / 'anim-export-frames.png'); log('  shot anim-export-frames.png (export at 0.5 s mid-animation | 1.6 s settled)')
    ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True)
        for t in TESTS: await t(b)
        await b.close()
TESTS = [test_transitions, test_anim_registries, test_anim_editor, test_anim_export]
if __name__ == '__main__':
    try: asyncio.run(run())
    except Exception as e: import traceback; traceback.print_exc(); fails.append('crash: ' + repr(e))
    log(f'RESULT: {"PASS" if not fails else "FAIL"} ({len(fails)} failures) in {time.time()-T0:.0f}s')
    for f in fails: log('  - ' + f)
    sys.exit(1 if fails else 0)

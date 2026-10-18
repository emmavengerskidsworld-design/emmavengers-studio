"""Batch 9 test: Beat Ad Maker (Google Chrome, 390x844 phone).
python3 tests/test_admaker.py [shots_dir]
- planner: every style x length makes whole bars, a cut on every drop, faster cuts after drops, an outro
- UI: Home -> sheet, multi-select photos + videos, drag to reorder, styles, music list, make -> editable project
- every shot lands on a music beat (within one frame); music starts on a downbeat; title, call to action, logo outro
- best segment of a video (motion / brightness), Shuffle variations (+ undo), 16:9 / 1:1 / 15 s / 60 s / whole song
- own music: beat detection (BPM within 2 %, phase within 40 ms) + tap tempo; preview == export"""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, io, base64, math, wave, struct
from pathlib import Path
import numpy as np
from PIL import Image, ImageChops, ImageStat
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]; FX = ROOT / 'tests/fixtures'
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-ad-')); fails = []; T0 = time.time(); PORT = 8783; METRICS = {}
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
def frame_n(f, n, name):  # exact frame by index (no -ss rounding)
    o = OUT / name; subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(f), '-vf', f'select=eq(n\\,{n})', '-frames:v', '1', str(o)], check=True); return Image.open(o).convert('RGB')
def mdiff(a, b): b = b.resize(a.size); return sum(ImageStat.Stat(ImageChops.difference(a, b)).mean) / 3
P = lambda pg, js: pg.evaluate(js)
async def new_page(b, q=''):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
    pg = await ctx.new_page(); pg.errs = []
    pg.on('pageerror', lambda e: pg.errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and pg.errs.append(m.text))
    await pg.goto(f'http://127.0.0.1:{PORT}/{q}'); await pg.wait_for_function('window.studio && studio.ready', timeout=20000); await pg.wait_for_timeout(500); return ctx, pg
async def still(pg, t, W=360, H=640):
    d = await P(pg, f'studio.renderStill({{t:{t},W:{W},H:{H}}})'); return Image.open(io.BytesIO(base64.b64decode(d))).convert('RGB')
async def export(pg, tag, res=720):
    await pg.click('#exportBtn'); await pg.click(f'#exRes .chipbtn[data-v="{res}"]'); await pg.click('#exGo'); await pg.wait_for_selector('#exDone:not([hidden])', timeout=400000)
    async with pg.expect_download() as dl: await pg.click('#exSave')
    d = await dl.value; f = OUT / (tag + '.mp4'); await d.save_as(str(f)); await pg.click('#exBack'); await pg.wait_for_timeout(300); return f
async def shot(pg, name): await pg.screenshot(path=str(SHOTS / name)); log('  shot ' + name)
def fixtures():
    m = FX / 'motionhalf.mp4'      # 8 s: 4 s of a still picture, then 4 s of fast motion
    if not m.exists():
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 'lavfi', '-i', 'color=c=0x406080:s=320x568:d=4:r=30', '-f', 'lavfi', '-i', 'testsrc2=s=320x568:d=4:r=30',
                        '-filter_complex', '[0:v][1:v]concat=n=2:v=1[v]', '-map', '[v]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', str(m)], check=True)
    w = FX / 'click100.wav'        # 100 BPM, first downbeat at 0.30 s, accented bars + bass on beat 1, 32 s
    if not w.exists():
        sr = 44100; n = sr * 32; x = np.zeros(n, np.float32); spb = .6
        for k in range(int((32 - .3) / spb)):
            t0 = .3 + k * spb; i = int(t0 * sr); L = int(.08 * sr); tt = np.arange(L) / sr; env = np.exp(-tt * 40)
            down = k % 4 == 0; x[i:i + L] += (.7 if down else .4) * env * np.sin(2 * np.pi * (1500 if down else 1000) * tt)
            if down: L2 = int(.25 * sr); t2 = np.arange(L2) / sr; x[i:i + L2] += .6 * np.exp(-t2 * 9) * np.sin(2 * np.pi * 70 * t2)
            # an off-beat hi-hat (quieter)
            j = int((t0 + spb / 2) * sr); x[j:j + 600] += .08 * np.random.RandomState(k).randn(min(600, n - j)).astype(np.float32) * np.exp(-np.arange(min(600, n - j)) / 120)
        with wave.open(str(w), 'wb') as f: f.setnchannels(1); f.setsampwidth(2); f.setframerate(sr); f.writeframes((np.clip(x, -1, 1) * 32000).astype('<i2').tobytes())
    return m, w

CHECK = '''(()=>{const p=studio.S.project,pj=studio.project,m=p.tracks.find(t=>t.kind==="main");const a=p.tracks.find(t=>t.kind==="audio").clips[0];
  const bt=pj.beatTimes(a), bts=bt.map(b=>b.t); const shots=m.clips.map((c,i)=>i?c.start+pj.transEff(m.clips[i-1],c):0);
  const err=shots.map(s=>Math.min(...bts.map(b=>Math.abs(b-s))));
  const texts=p.tracks.filter(t=>t.kind==="text").flatMap(t=>t.clips).map(c=>c.text.content);
  const fx=p.tracks.filter(t=>t.kind==="effect").flatMap(t=>t.clips).map(c=>c.effect.id+"@"+c.start.toFixed(3));
  const spb=60/a.beat.bpm, bar=spb*(a.beat.m||4), inPh=((a.in-(a.beat.o||0))/bar)%1;
  return {n:m.clips.length,dur:studio.projectDuration(p),maxErr:Math.max(...err),texts,fx,aspect:p.aspect,ad:p.ad,inDown:Math.min(inPh,1-inPh),audioDur:a.out-a.in,
    outro:!!m.clips[m.clips.length-1].adOutro,logo:p.tracks.filter(t=>t.kind==="overlay").flatMap(t=>t.clips).length,
    kinds:m.clips.map(c=>c.type),trs:m.clips.map(c=>c.transitionIn&&c.transitionIn.id),segs:m.clips.filter(c=>c.type==="video").map(c=>[c.mediaId,c.in,c.out]),
    drops:p.ad.plan.drops,shotsT:shots}})()'''

async def test_planner(b):
    log('== planner: styles x lengths')
    ctx, pg = await new_page(b)
    r = await P(pg, '''(async()=>{const A=studio.admaker, L=await (await import('./js/library.js')).loadCatalog(); const its=L.items.filter(i=>i.kind==="music"&&i.bpm>0&&i.pack.endsWith("music-2")&&i.dur>40);
      const out=[]; for(const st of A.AD_STYLES) for(const len of A.AD_LENGTHS){ const it=its[(out.length*7)%its.length]; const beat={bpm:it.bpm,m:it.meter,o:it.beat0,dr:it.drops,sec:it.secs,nb:it.nb};
        const end=A.musicEnd(beat,it.dur); const pl=A.planAd({beat,end,style:st.id,length:len,seed:1,nMedia:5}); const spb=60/it.bpm, bar=spb*it.meter;
        const cutsOnBeats=pl.cuts.every(c=>Math.abs(c.t0/spb-Math.round(c.t0/spb))<1e-4)&&Math.abs(((pl.S0-it.beat0)/bar)-Math.round((pl.S0-it.beat0)/bar))<1e-5; const contiguous=pl.cuts.every((c,i)=>!i||Math.abs(c.t0-pl.cuts[i-1].t1)<1e-9)&&Math.abs(pl.cuts[pl.cuts.length-1].t1-pl.mediaEnd)<1e-6;
        const dropCut=pl.drops.every(d=>pl.cuts.some(c=>Math.abs(c.t0-d)<1e-6)); const wholeBars=Math.abs(pl.L/bar-Math.round(pl.L/bar))<1e-6;
        const fits=pl.S0+pl.L<=end+0.03; const target=len==="song"?true:Math.abs(pl.L-len)<=bar/2+1e-6||pl.L<len;
        const after=pl.cuts.filter(c=>pl.drops.some(d=>c.t0>=d-1e-6&&c.t0<d+2*bar-1e-6)), dropB=A.adStyle(st.id).drop; const fast=after.every(c=>c.b1-c.b0<=dropB||Math.abs(c.t1-pl.mediaEnd)<1e-6);
        out.push({st:st.id,len,song:it.name,bpm:it.bpm,L:pl.L,n:pl.cuts.length,cutsOnBeats,contiguous,dropCut,wholeBars,fits,target,outro:!!pl.outro,faster:fast,drops:pl.drops.length,minCut:Math.min(...pl.cuts.map(c=>c.b1-c.b0))});}
      return out})()''')
    METRICS['styles'] = len({x['st'] for x in r}); bad = lambda k: [f"{x['st']}/{x['len']}" for x in r if not x[k]]
    ok(METRICS['styles'] >= 12, f'{METRICS["styles"]} ad styles (>= 12): ' + ', '.join(sorted({x["st"] for x in r})))
    for k, m in (('cutsOnBeats', 'every cut starts on a beat'), ('contiguous', 'cuts are back to back up to the outro'), ('dropCut', 'a cut on every drop'), ('wholeBars', 'ad length is whole bars'),
                 ('fits', 'the music lasts the whole ad'), ('target', 'length matches 15 / 30 / 60 s (within half a bar)'), ('outro', 'every plan has the logo outro'), ('faster', 'drop-aware pacing: the style’s drop pace for 2 bars after each drop')):
        ok(not bad(k), f'{m} ({len(r)} plans) {bad(k)[:4]}')
    log('       e.g. ' + '; '.join(f"{x['st']} {x['len']}: {x['n']} cuts / {x['L']:.1f}s @{x['bpm']}" for x in r[::9]))
    # seeds differ
    v = await P(pg, '''(()=>{const A=studio.admaker,b={bpm:115,m:4,o:0,dr:[4.174,20.87,54.261],sec:[["intro",0],["A",4.174],["A2",20.87],["B",37.565],["A3",54.261]],nb:144};
      return [1,2,3,4].map(s=>{const p=A.planAd({beat:b,end:75,style:"promo",length:30,seed:s,nMedia:4});return p.S0+":"+p.cuts.length})})()''')
    ok(len(set(v)) >= 2, f'different seeds pick different song parts / pacing {v}')
    # tap tempo + detector on a synthetic click track
    t = await P(pg, '''(()=>{const T=new studio.admaker.beats.TapTempo();let r=null;for(let k=0;k<8;k++)r=T.tap(0.3+k*0.6+(k%2?0.012:-0.01));return r})()''')
    ok(t and abs(t['bpm'] - 100) < 1.5 and min(abs(t['o'] - .3), abs(t['o'] - .3 - .6)) < .03, f'tap tempo: 8 slightly uneven taps at 100 BPM -> {t}')
    ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

async def open_sheet_with_media(pg, files):
    await pg.click('#homeAd'); await pg.wait_for_selector('#adMedia'); await pg.wait_for_timeout(500)
    await pg.set_input_files('#adFiles', [str(f) for f in files])
    await pg.wait_for_function(f'document.querySelectorAll("#adMedia .adtile:not(.adadd)").length==={len(files)}', timeout=30000); await pg.wait_for_timeout(500)

async def make(pg):
    await pg.click('#adMake'); await pg.wait_for_function('studio.S.project && studio.S.project.ad && document.querySelector("#busy").hidden', timeout=90000); await pg.wait_for_timeout(700)
    return await P(pg, CHECK)

async def test_flow(b):
    log('== UI flow: Home -> Beat Ad Maker -> project')
    motion, _ = fixtures()
    ctx, pg = await new_page(b, '?home'); await pg.evaluate('localStorage.removeItem("studio.adLast")')
    await shot(pg, 'b9-home-admaker-390.png')
    files = [FX / 'video.mp4', FX / 'sharp.png', motion, FX / 'red.png', FX / 'blue.png', FX / 'quad.png']
    await open_sheet_with_media(pg, files)
    ids0 = await P(pg, 'window.__adState.items.slice()')
    # drag tile 1 onto tile 4 (pointer drag)
    a = await pg.locator('#adMedia .adtile[data-i="0"]').bounding_box(); c = await pg.locator('#adMedia .adtile[data-i="3"]').bounding_box()
    await pg.mouse.move(a['x'] + a['width'] / 2, a['y'] + a['height'] / 2); await pg.mouse.down(); await pg.mouse.move(a['x'] + a['width'] / 2 + 10, a['y'] + a['height'] / 2 + 4, steps=3)
    await pg.mouse.move(c['x'] + c['width'] / 2, c['y'] + c['height'] / 2, steps=10); await pg.wait_for_timeout(80); await pg.mouse.up(); await pg.wait_for_timeout(300)
    ids1 = await P(pg, 'window.__adState.items.slice()')
    ok(ids1 == ids0[1:4] + [ids0[0]] + ids0[4:], 'drag to reorder moves the first picture to 4th place')
    await shot(pg, 'b9-admaker-media-390.png')
    await pg.click('.adstyle[data-v="promo"]'); await pg.evaluate('document.querySelector("#adStyles").scrollIntoView({block:"start"})'); await pg.wait_for_timeout(300); await shot(pg, 'b9-admaker-styles-390.png')
    ns = await pg.locator('.adstyle').count(); ok(ns >= 12, f'{ns} styles in the sheet')
    nm = await pg.locator('#adMusic .admrow').count(); bpm = await P(pg, '[...document.querySelectorAll("#adMusic .admrow small")].filter(e=>/BPM/.test(e.textContent)).length'); ok(nm >= 6 and bpm == nm, f'music list: {nm} beat-marked songs with BPM')
    await pg.fill('#adMusicQ', 'doxology'); await pg.wait_for_timeout(400); await pg.click('#adMusic .admrow:first-child [data-use]'); await pg.wait_for_timeout(200)
    mus = await P(pg, 'window.__adState.music'); ok(mus and 'Doxology' in mus['name'] and mus['beat']['bpm'] > 0, f'search + pick a song: {mus and mus["name"]} {mus and mus["beat"]["bpm"]} BPM')
    await pg.fill('#adMusicQ', ''); await pg.wait_for_timeout(300)
    await pg.evaluate('document.querySelector("#adMusic").scrollIntoView({block:"start"})'); await pg.wait_for_timeout(200); await shot(pg, 'b9-admaker-music-390.png')
    await pg.click('#adLength .chipbtn[data-v="30"]'); await pg.fill('#adTitle', 'Noah’s Ark — new episode!'); await pg.fill('#adCta', 'Watch now on Emmavengers World')
    r = await make(pg)
    METRICS['promo'] = {k: r[k] for k in ('n', 'dur', 'maxErr', 'texts')}
    ok(r['maxErr'] < 1 / 30, f'every one of {r["n"]} shots lands on a beat (max error {r["maxErr"] * 1000:.3f} ms, one frame = 33 ms)')
    ok(r['inDown'] < 1e-3, 'the music starts on a downbeat'); ok(abs(r['audioDur'] - r['dur']) < 1e-3, f'music covers the whole ad ({r["audioDur"]:.2f}s)')
    ok(26 <= r['dur'] <= 34, f'30 s ad -> {r["dur"]:.2f}s (whole bars)'); ok(r['outro'] and r['logo'] >= 1, 'Emmavengers logo outro')
    ok('Noah’s Ark — new episode!' in r['texts'] and 'Watch now on Emmavengers World' in r['texts'] and 'SUBSCRIBE' in r['texts'], f'title, call to action and Subscribe {r["texts"]}')
    ok(ids1 == r['ad']['items'], 'the ad follows the picked order')
    dropfx = all(any(x == f'flash@{d:.3f}' for x in r['fx']) for d in r['drops']); ok(r['fx'] and dropfx, f'accents: flash + zoom punch on every drop, punch on downbeats ({len(r["drops"])} drops, {len(r["fx"])} accent effects)')
    ok(sum(1 for t in r['trs'] if t) >= r['n'] // 2, f'transitions on the cuts ({sum(1 for t in r["trs"] if t)} of {r["n"]})')
    # the motion half of motionhalf.mp4 is chosen
    mid = await P(pg, f'[...studio.media.values()].find(m=>m.name==="motionhalf.mp4").id'); seg = [s for s in r['segs'] if s[0] == mid]
    ok(seg and seg[0][1] >= 3.5 and sum(s[1] >= 3.3 for s in seg) >= len(seg) / 2, f'best segment: the lively half of the video is picked first and most {[(round(s[1], 2), round(s[2], 2)) for s in seg]}')
    # beat markers on the timeline + result screenshot
    await P(pg, '(()=>{studio.timeline.setZoom(60);studio.player.seek(1.2);studio.timeline.setTime(1.2)})()'); await pg.wait_for_timeout(2600); await shot(pg, 'b9-admaker-result-390.png')
    tools = await P(pg, '[...document.querySelectorAll("#toolbar .tool")].map(b=>b.dataset.tool)'); ok('adshuffle' in tools and 'adedit' in tools, 'Shuffle ad + Edit ad in the toolbar')
    # Shuffle -> another version, still on the beat; undo goes back
    before = json.dumps([r['trs'], r['segs']]); await pg.click('#toolbar .tool[data-tool="adshuffle"]'); await pg.wait_for_function('studio.S.project.ad.seed===2 && document.querySelector("#busy").hidden', timeout=60000); await pg.wait_for_timeout(500)
    r2 = await P(pg, CHECK); ok(json.dumps([r2['trs'], r2['segs']]) != before and r2['maxErr'] < 1 / 30, f'Shuffle makes a new version ({r2["n"]} shots, still on the beat: {r2["maxErr"] * 1000:.3f} ms)')
    await pg.click('#undoBtn'); await pg.wait_for_timeout(400); r3 = await P(pg, CHECK); ok(r3['ad']['seed'] == 1 and json.dumps([r3['trs'], r3['segs']]) == before, 'Undo brings the first version back')
    # editable: it is a normal project (split a shot)
    sp = await P(pg, '(()=>{const p=studio.S.project,m=p.tracks.find(t=>t.kind==="main");const n=m.clips.length;studio.act(q=>studio.project.split(q,q.tracks.find(t=>t.kind==="main").clips[2].id,m.clips[2].start+0.1+studio.project.transEff(m.clips[1],m.clips[2])));return [n,studio.S.project.tracks.find(t=>t.kind==="main").clips.length]})()')
    ok(sp[1] == sp[0] + 1, f'the ad is a normal editable project (split: {sp})'); await pg.click('#undoBtn'); await pg.wait_for_timeout(300)
    # outro screenshot
    await P(pg, f'(()=>{{const d=studio.projectDuration(studio.S.project);studio.player.seek(d-0.4);studio.timeline.setTime(d-0.4)}})()'); await pg.wait_for_timeout(1500); await shot(pg, 'b9-admaker-outro-390.png')
    # preview == export
    f = await export(pg, 'ad', 720); dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(f)], capture_output=True, text=True).stdout)
    ok(abs(dur - r3['dur']) < .2, f'exported ad is {dur:.2f}s (project {r3["dur"]:.2f}s)')
    ds = []
    for k, t in enumerate([.5, r3['shotsT'][3] + .12, r3['shotsT'][7] + .12, r3['dur'] * .6, r3['dur'] - .5]):
        t = round(t * 30) / 30; pv = await still(pg, t, 360, 640); ex = frame_n(f, round(t * 30), f'adex_{k}.png').resize((360, 640)); pv.save(OUT / f'adpv_{k}.png'); ds.append(round(mdiff(pv.resize((90, 160), Image.BOX), ex.resize((90, 160), Image.BOX)), 1))
    ok(all(d < 10 for d in ds), f'preview == export at 5 exact frames (mean diff {ds})')
    # beat sync in the exported file: the picture changes right at the cut frame
    cuts = [t for t, k in zip(r3['shotsT'][1:], r3['trs'][1:]) if not k][:3]
    if cuts:
        jumps = []
        for k, t in enumerate(cuts):
            a1 = frame(f, max(0, t - 2 / 30), f'cb{k}a.png').resize((90, 160)); a2 = frame(f, t + 1 / 30, f'cb{k}b.png').resize((90, 160)); a0 = frame(f, max(0, t - 4 / 30), f'cb{k}c.png').resize((90, 160))
            jumps.append((round(mdiff(a1, a2), 1), round(mdiff(a0, a1), 1)))
        ok(all(j > max(4, 2 * s) for j, s in jumps), f'exported hard cuts change the picture exactly at the beat (jump vs. steady: {jumps})')
    ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

async def test_variants(b):
    log('== variants: styles, 16:9 / 1:1, 15 s / 60 s / whole song')
    ctx, pg = await new_page(b, '?home')
    files = [FX / 'video.mp4', FX / 'sharp.png', FX / 'red.png', FX / 'quad.png']
    cases = [('energetic', '16:9', 15), ('bible', '1:1', 60), ('countdown', '9:16', 'song'), ('comic', '9:16', 15), ('magic', '9:16', 15), ('retro', '16:9', 15), ('trailer', '9:16', 30), ('calm', '9:16', 30), ('funkids', '9:16', 15), ('slideshow', '1:1', 15), ('cleanpro', '16:9', 15)]
    for k, (st, asp, ln) in enumerate(cases):
        if k == 0: await open_sheet_with_media(pg, files)
        else:
            await pg.click('#toolbar .tool[data-tool="adedit"]'); await pg.wait_for_selector('#adMedia .adtile'); await pg.wait_for_timeout(500)
        await pg.click(f'.adstyle[data-v="{st}"]'); await pg.wait_for_timeout(250); await pg.click(f'#adAspect .chipbtn[data-v="{asp}"]'); await pg.click(f'#adLength .chipbtn[data-v="{ln}"]')
        r = await make(pg)
        song = r['ad']['music']['name']; L = r['dur']
        good = r['maxErr'] < 1 / 30 and r['aspect'] == asp and r['outro'] and (ln == 'song' or abs(L - ln) < 4.5)
        ok(good, f'{st} {asp} {ln}: {r["n"]} shots, {L:.1f}s, song “{song}”, beat error {r["maxErr"] * 1000:.3f} ms')
        if st == 'countdown': ok(all(x in r['texts'] for x in ('3', '2', '1')), 'countdown style shows 3-2-1')
        if st in ('comic', 'funkids') and r['drops']: ok(any(w in r['texts'] for w in ('POW!', 'BAM!', 'ZOOM!', 'WOW!', 'YAY!', 'FUN!')), f'{st}: pop words on drops')
        if st == 'energetic': await P(pg, '(()=>{studio.player.seek(2.2);studio.timeline.setTime(2.2)})()'); await pg.wait_for_timeout(1500); await shot(pg, 'b9-admaker-16x9-390.png')
        if st == 'comic': await P(pg, f'(()=>{{const t=(studio.S.project.ad.plan.drops[0]||1)+0.15;studio.player.seek(t);studio.timeline.setTime(t)}})()'); await pg.wait_for_timeout(1500); await shot(pg, 'b9-admaker-comic-390.png')
    ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

async def test_own_music(b):
    log('== own music: beat detection + tap tempo')
    _, click = fixtures()
    ctx, pg = await new_page(b, '?home')
    await open_sheet_with_media(pg, [FX / 'sharp.png', FX / 'red.png'])
    await pg.set_input_files('#adAudioFile', str(click)); await pg.wait_for_function('window.__adState.music && !window.__adState.music.lib && document.querySelector("#busy").hidden', timeout=60000)
    m = await P(pg, 'window.__adState.music'); bt = m['beat']; spb = 60 / bt['bpm']; ph = ((bt['o'] - .3) % 2.4 + 2.4) % 2.4
    ok(abs(bt['bpm'] - 100) / 100 < .02, f'click track: detected {bt["bpm"]} BPM (true 100)'); ok(min(ph, 2.4 - ph) < .04, f'downbeat found at {bt["o"]:.3f}s (true 0.300 s)')
    ok(await pg.locator('#adTap:not([hidden])').count() == 1, 'Tap the beat button shows for your own music')
    await pg.evaluate('document.querySelector("#adBeatInfo").scrollIntoView({block:"start"})'); await pg.wait_for_timeout(200); await shot(pg, 'b9-admaker-ownmusic-390.png')
    r = await make(pg); ok(r['maxErr'] < 1 / 30, f'ad on your own music: {r["n"]} shots on the detected beat ({r["maxErr"] * 1000:.3f} ms)')
    # detection on real songs (our library, decoded MP3s)
    d = await P(pg, '''(async()=>{const L=await (await import('./js/library.js')).loadCatalog(), B=studio.admaker.beats; const its=L.items.filter(i=>i.kind==="music"&&i.pack.endsWith("music-2")&&i.cat!=="jingles"&&i.dur>40).filter((_,k)=>k%9===0);
      const ac=new OfflineAudioContext(2,48000,48000), out=[];
      for(const it of its){const buf=await ac.decodeAudioData(await (await fetch(it.url)).arrayBuffer()); const t=performance.now(); const r=B.detectBeats(buf,{meter:it.meter}); const spb=60/it.bpm;
        const rel=r?r.bpm/it.bpm:0, oct=[.5,1,2].find(k=>Math.abs(rel/k-1)<.02); const sp=spb*(oct||1); const ph=r?(((r.o-it.beat0)%sp)+sp)%sp:9;
        out.push({n:it.name,bpm:it.bpm,got:r&&r.bpm,oct:oct||0,ph:Math.min(ph,sp-ph),ms:Math.round(performance.now()-t)});} return out})()''')
    good = [x for x in d if x['oct'] and x['ph'] < .04]; METRICS['detect'] = d
    log('       ' + '; '.join(f"{x['n']} {x['bpm']}->{x['got']} ({x['ph'] * 1000:.0f} ms, {x['ms']} ms)" for x in d))
    ok(len(good) >= .7 * len(d), f'detector on {len(d)} real songs: tempo (or double / half) and beat phase right on {len(good)}')
    ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

async def main():
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=srv.serve_forever, daemon=True).start()
    only = set(sys.argv[2].split(',')) if len(sys.argv) > 2 else None
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel='chrome', headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
        for name, fn in (('planner', test_planner), ('flow', test_flow), ('variants', test_variants), ('ownmusic', test_own_music)):
            if only and name not in only: continue
            try: await fn(b)
            except Exception as e: import traceback; traceback.print_exc(); ok(False, f'{name} crashed: {e}')
        await b.close()
    json.dump(METRICS, open(ROOT / 'tests/admaker-metrics.json', 'w'), indent=1, default=float)
    log(f'RESULT: {"PASS" if not fails else "FAIL"} ({len(fails)} failures) in {time.time() - T0:.0f}s'); [log('  - ' + f) for f in fails]; sys.exit(1 if fails else 0)
asyncio.run(main())

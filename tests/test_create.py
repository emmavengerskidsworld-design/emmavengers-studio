"""Batch 6 test: text looks, captions, stickers, effects, filters, templates (Google Chrome, 390x844 phone).
python3 tests/test_create.py [shots_dir]
- fonts: every bundled font loads; text style presets / bubbles / curve / title presets render and differ
- captions: line at playhead (UI), bulk paste spread evenly, style for all, drag timing, SRT export -> import round trip
- stickers: library manifest, every category, search, favourites, add to overlay, animated sticker loops
- effects + filters: every entry renders (WebGL), intensity 0 == untouched, preview == export parity
- templates: every template builds a project; placeholders can be swapped with Replace"""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, io, base64, math
from pathlib import Path
from PIL import Image, ImageChops, ImageStat
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]; FX = ROOT / 'tests/fixtures'
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-create-')); fails = []; T0 = time.time(); PORT = 8774; METRICS = {}
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
def psnr(a, b):
    b = b.resize(a.size); d = ImageChops.difference(a, b); st = ImageStat.Stat(d); mse = sum(x * x for x in st.rms) / 3
    return 99.0 if mse == 0 else 10 * math.log10(255 * 255 / mse)
def psnr_lo(a, b):
    w, h = a.size[0] // 4, a.size[1] // 4; return psnr(a.resize((w, h), Image.BOX), b.resize(a.size).resize((w, h), Image.BOX))
def mdiff(a, b): b = b.resize(a.size); return sum(ImageStat.Stat(ImageChops.difference(a, b)).mean) / 3
async def new_page(b):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
    pg = await ctx.new_page(); pg.errs = []
    pg.on('pageerror', lambda e: pg.errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and pg.errs.append(m.text))
    await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=20000); return ctx, pg
P = lambda pg, js: pg.evaluate(js)
async def seek_exact(pg, t): await P(pg, f'(()=>{{studio.player.pause();studio.player.seek({t});studio.timeline.setTime({t})}})()'); await pg.wait_for_timeout(500)
async def set_time(pg, t):
    await P(pg, f'(()=>{{const tl=studio.timeline;tl.scroll.scrollLeft=Math.round({t}*tl.pps)}})()'); await pg.wait_for_timeout(250); return await P(pg, 'studio.player.t')
async def still(pg, t, W=540, H=960):
    d = await P(pg, f'studio.renderStill({{t:{t},W:{W},H:{H}}})'); return Image.open(io.BytesIO(base64.b64decode(d))).convert('RGB')
async def export(pg, tag, res=720):
    await pg.click('#exportBtn'); await pg.click(f'#exRes .chipbtn[data-v="{res}"]'); await pg.click('#exGo'); await pg.wait_for_selector('#exDone:not([hidden])', timeout=300000)
    async with pg.expect_download() as dl: await pg.click('#exSave')
    d = await dl.value; f = OUT / (tag + '.mp4'); await d.save_as(str(f)); await pg.click('#exBack'); await pg.wait_for_timeout(300); return f
async def shot(pg, name): await pg.screenshot(path=str(SHOTS / name)); log('  shot ' + name)
async def tap_tool(pg, tool): await pg.click(f'#toolbar .tool[data-tool="{tool}"]')
async def mouse_drag(pg, x0, y0, x1, y1, steps=12):
    await pg.mouse.move(x0, y0); await pg.mouse.down(); await pg.mouse.move(x0 + 3, y0, steps=2); await pg.mouse.move(x1, y1, steps=steps); await pg.wait_for_timeout(80); await pg.mouse.up(); await pg.wait_for_timeout(250)
async def base_project(pg, files=('sharp.png',)):
    await pg.set_input_files('#fileMedia', [str(FX / f) for f in files])
    await pg.wait_for_function(f'studio.S.project.tracks.find(t=>t.kind==="main").clips.length==={len(files)}', timeout=20000); await pg.wait_for_timeout(400)

# ---------------- text ----------------
async def test_text(b):
    log('== text: fonts, style presets, bubbles, curve, title presets')
    ctx, pg = await new_page(b)
    r = await P(pg, """(async()=>{const F=await import('./js/fontlist.js'), fo=await import('./js/fonts.js'), R=await import('./js/registry.js');
      const res=await Promise.all(F.FONT_LIST.map(f=>fo.ensureFont(f[0])));
      // a loaded font measures differently from the fallback
      const c=new OffscreenCanvas(10,10).getContext('2d'); const diff=F.FONT_LIST.filter(f=>{c.font='400 60px "EVF-'+f[0]+'", system-ui, sans-serif';const a=c.measureText('Emmavengers 123').width;c.font='400 60px system-ui, sans-serif';return Math.abs(a-c.measureText('Emmavengers 123').width)>0.5}).length;
      return {n:F.FONT_LIST.length, loaded:res.filter(Boolean).length, diff, groups:[...new Set(F.FONT_LIST.map(f=>f[2]))], lic:[...new Set(F.FONT_LIST.map(f=>f[3]))], kids:F.FONT_LIST.filter(f=>f[2]==='kids').map(f=>f[1])}})()""")
    METRICS['fonts'] = r['n']; log(f'       {r["n"]} fonts, groups {r["groups"]}, licences {r["lic"]}'); log(f'       kids fonts: {", ".join(r["kids"])}')
    ok(r['n'] >= 40, f'{r["n"]} bundled open-licence fonts (>= 40)'); ok(r['loaded'] == r['n'], f'every font file loads ({r["loaded"]}/{r["n"]})')
    ok(r['diff'] >= r['n'] - 2, f'loaded fonts really change the lettering ({r["diff"]}/{r["n"]} measure differently from the fallback)')
    for need in ('Luckiest Guy', 'Fredoka', 'Baloo 2', 'Bubblegum Sans', 'Chewy', 'Lilita One', 'Titan One'): ok(need in r['kids'], f'kids font {need} bundled')
    r = await P(pg, """(async()=>{const ts=await import('./js/textstyles.js'), R=await import('./js/render.js'), pj=await import('./js/project.js');
      const W=300,H=200,cv=new OffscreenCanvas(W,H),x=cv.getContext('2d'); const img=c=>{x.setTransform(1,0,0,1,0,0);x.fillStyle='#406080';x.fillRect(0,0,W,H);R.drawText(x,W,H,c,{x:.5,y:.5,scale:1,rotation:0,opacity:1},1);return x.getImageData(0,0,W,H).data};
      const dif=(a,b)=>{let s=0;for(let i=0;i<a.length;i+=4)s+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);return s/(a.length/4)/3};
      const mk=()=>{const c=pj.newClip('text',{dur:3});c.text.content='Abc';c.text.size=300;c.text.font='luckiestguy';return c};
      const b0=mk();ts.applyStyle(b0.text,'plain');const base=img(b0), out={}, errs=[]; const sigs=[];
      for(const s of ts.TEXT_STYLES){try{const c=mk();ts.applyStyle(c.text,s.id);const d=img(c);out[s.id]=dif(d,base);sigs.push(d)}catch(e){errs.push(s.id+':'+e.message)}}
      let same=0; for(let i=0;i<sigs.length;i++)for(let j=0;j<i;j++)if(dif(sigs[i],sigs[j])<0.3)same++;
      const cu=mk();cu.text.curve=0.6; const cn=mk();cn.text.curve=-0.6; const curve=[dif(img(cu),base),dif(img(cn),base),dif(img(cu),img(cn))];
      const bub={}; for(const b of ts.BUBBLES.filter(b=>b.id)){const c=mk();c.text.bubble=b.id;c.text.box=true;c.text.boxColor='#ffcc33';bub[b.id]=dif(img(c),base)}
      const tit={}; for(const t of ts.TITLES){try{const c=mk();ts.applyTitle(c,t.id);tit[t.id]={d:dif(img(c),base),font:c.text.font,anim:!!c.anim}}catch(e){errs.push(t.id+':'+e.message)}}
      return {n:ts.TEXT_STYLES.length,out,same,curve,bub,tit,errs}})()""")
    METRICS['textStyles'] = r['n']; METRICS['titles'] = len(r['tit']); METRICS['bubbles'] = len(r['bub'])
    ok(not r['errs'], f'every style / title renders without error {r["errs"][:3]}')
    ok(r['n'] >= 50, f'{r["n"]} text style presets (>= 50)')
    flat = [k for k, v in r['out'].items() if v < 0.5 and k != 'plain']; ok(not flat, f'every style changes the look vs plain {flat}')
    ok(r['same'] <= 2, f'style presets are distinct from each other ({r["same"]} near-identical pairs)')
    ok(min(r['curve']) > 1, f'curved text (up and down) bends the letters {[round(x, 1) for x in r["curve"]]}')
    ok(len(r['bub']) >= 10 and min(r['bub'].values()) > 1, f'{len(r["bub"])} bubble / label backgrounds render {dict((k, round(v, 1)) for k, v in r["bub"].items())}')
    ok(len(r['tit']) >= 30 and all(v['anim'] for v in r['tit'].values()), f'{len(r["tit"])} title presets (font + style + animation)')
    ok(min(v['d'] for v in r['tit'].values()) > 1, 'every title preset renders')
    # UI: Titles tool -> grid -> tap; Text style tab; curve slider
    await tap_tool(pg, 'titles'); await pg.wait_for_selector('.titlegrid .trtile'); await P(pg, 'document.fonts.ready'); await pg.wait_for_timeout(900)
    await shot(pg, 'b6-titles-390.png')
    await pg.click('.titlegrid .trtile[data-v="rainbowArc"]'); await pg.wait_for_timeout(300)
    c = await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="text").clips[0]')
    ok(c['text']['font'] == 'chewy' and c['text']['curve'] > 0 and c['anim']['in']['id'] == 'waveIn', 'tapping a title applies font + style + curve + animation')
    await pg.click('.texttabs .chipbtn[data-v="style"]'); await pg.wait_for_selector('.stylegrid .trtile'); await pg.wait_for_timeout(700)
    await shot(pg, 'b6-text-styles-390.png')
    await pg.click('.stylegrid .trtile[data-v="emma3d"]'); await pg.wait_for_timeout(200)
    c = await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="text").clips[0].text')
    ok(c['styleId'] == 'emma3d' and c['extrude'] and c['fill'], 'tapping a style puts the 3D look on the text')
    await pg.click('.texttabs .chipbtn[data-v="font"]'); await pg.wait_for_selector('.fontchips .chipbtn'); await pg.wait_for_timeout(600); await shot(pg, 'b6-fonts-390.png')
    await pg.click('.fontchips .chipbtn[data-v="titanone"]'); c = await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="text").clips[0].text.font'); ok(c == 'titanone', 'font picker sets the font')
    await pg.click('.texttabs .chipbtn[data-v="bubble"]'); await pg.click('.bubblechips .chipbtn[data-v="speech"]'); c = await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="text").clips[0].text'); ok(c['bubble'] == 'speech' and c['box'], 'bubble picker sets a speech bubble')
    await pg.click('.texttabs .chipbtn[data-v="edit"]'); await pg.fill('#textCurve', '-0.5'); await pg.dispatch_event('#textCurve', 'input')
    c = await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="text").clips[0].text.curve'); ok(abs(c + 0.5) < 0.01, 'curve slider bends the text')
    await pg.click('.sh-done'); await pg.wait_for_timeout(200)
    await pg.click('#undoBtn'); await pg.wait_for_timeout(200); u = await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="text")?.clips[0]?.text.curve ?? null')
    ok(u != -0.5, f'undo reverts the text sheet edits ({u})')
    ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

# ---------------- captions ----------------
async def test_captions(b):
    log('== captions: line at playhead, bulk paste, style for all, drag timing, SRT round trip')
    ctx, pg = await new_page(b); await base_project(pg, ['sharp.png', 'image.png'])
    await P(pg, 'studio.act(p=>{p.tracks.find(t=>t.kind==="main").clips.forEach(c=>c.dur=5)})')
    await set_time(pg, 1.0); await tap_tool(pg, 'captions'); await pg.wait_for_selector('#capAdd'); await pg.wait_for_timeout(500)
    await shot(pg, 'b6-captions-sheet-390.png')
    await pg.click('#capAdd'); await pg.wait_for_selector('#textInput'); await pg.fill('#textInput', 'Hello Emmavengers'); await pg.dispatch_event('#textInput', 'input'); await pg.click('.sh-done')
    cs = await P(pg, 'studio.caps.captions(studio.S.project).map(c=>({s:c.start,d:c.dur,t:c.text.content,cap:c.caption}))')
    ok(len(cs) == 1 and abs(cs[0]['s'] - 1.0) < 0.05 and cs[0]['t'] == 'Hello Emmavengers', f'caption line added at the playhead {cs}')
    trk = await P(pg, 'studio.S.project.tracks.map(t=>t.kind)'); ok(trk[0] == 'caption', f'captions get their own track at the top {trk}')
    # bulk paste over 3..9 s
    await P(pg, 'studio.select(null)'); await tap_tool(pg, 'captions'); await pg.wait_for_selector('#capBulk')
    await pg.fill('#capBulk', 'In the beginning\n\nGod made the world\nHe made the sun\nand the moon\nand the stars  \n'); await pg.fill('#capFrom', '3'); await pg.fill('#capTo', '9'); await pg.click('#capMake'); await pg.wait_for_timeout(300)
    cs = await P(pg, 'studio.caps.captions(studio.S.project).map(c=>({s:c.start,e:c.start+c.dur,t:c.text.content}))')
    bulk = [c for c in cs if c['s'] >= 2.99]
    ok(len(bulk) == 5 and [c['t'] for c in bulk] == ['In the beginning', 'God made the world', 'He made the sun', 'and the moon', 'and the stars'], f'bulk paste: one caption per non-empty line {[c["t"] for c in bulk]}')
    ok(all(abs((c['e'] - c['s']) - 1.2) < 0.002 for c in bulk) and abs(bulk[0]['s'] - 3) < 1e-3 and abs(bulk[-1]['e'] - 9) < 1e-3, 'bulk lines are spread evenly over 3..9 s (1.2 s each)')
    ok(all(abs(bulk[i]['e'] - bulk[i + 1]['s']) < 1e-3 for i in range(4)), 'bulk lines follow each other with no gap')
    # style presets for all lines
    await pg.click('#capStyles .trtile[data-v="kids"]'); await pg.wait_for_timeout(300)
    st = await P(pg, 'studio.caps.captions(studio.S.project).map(c=>c.text.font+"/"+c.captionStyle)')
    ok(len(set(st)) == 1 and st[0] == 'fredoka/kids', f'caption style changes every line {set(st)}')
    await pg.wait_for_timeout(400); await shot(pg, 'b6-captions-styled-390.png'); await pg.click('.sh-done')
    # drag timing on the timeline: move the first bulk line right, then trim its end
    cid = await P(pg, 'studio.caps.captions(studio.S.project).find(c=>c.start>2.9).id')
    await P(pg, f'studio.select("{cid}")'); await pg.wait_for_timeout(250)
    pps = await P(pg, 'studio.timeline.pps'); bb = await pg.locator(f'.clip[data-id="{cid}"]').bounding_box()
    s0 = await P(pg, f'studio.find(studio.S.project,"{cid}").clip.start')
    await mouse_drag(pg, bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2, bb['x'] + bb['width'] / 2 - pps * 0.5, bb['y'] + bb['height'] / 2)
    s1 = await P(pg, f'studio.find(studio.S.project,"{cid}").clip.start'); ok(abs((s1 - s0) + 0.5) < 0.15, f'drag moves a caption in time ({s0:.2f} -> {s1:.2f} s)')
    hb = await pg.locator(f'.clip[data-id="{cid}"] [data-edge="right"]').bounding_box() if await pg.locator(f'.clip[data-id="{cid}"] [data-edge="right"]').count() else None
    if hb:
        d0 = await P(pg, f'studio.find(studio.S.project,"{cid}").clip.dur')
        await mouse_drag(pg, hb['x'] + hb['width'] / 2, hb['y'] + hb['height'] / 2, hb['x'] + hb['width'] / 2 + pps * 0.4, hb['y'] + hb['height'] / 2)
        d1 = await P(pg, f'studio.find(studio.S.project,"{cid}").clip.dur'); ok(d1 > d0 + 0.2, f'dragging the end makes the caption longer ({d0:.2f} -> {d1:.2f} s)')
    else: ok(False, 'caption has trim handles')
    # caption preview == export
    s = await still(pg, 4.6); ok(mdiff(s, await still(pg, 0.2)) > 0.3, 'caption visible in the picture')
    # SRT export via UI -> file, round trip
    await P(pg, 'studio.select(null)'); await tap_tool(pg, 'captions'); await pg.wait_for_selector('#capExport')
    async with pg.expect_download() as dl: await pg.click('#capExport')
    d = await dl.value; f = OUT / 'caps.srt'; await d.save_as(str(f)); srt = f.read_text()
    log('       exported SRT starts: ' + srt[:120].replace('\n', ' | '))
    ok(srt.startswith('1\n00:00:01,000 --> ') and srt.count('-->') == 6, 'SRT export: 6 numbered cues, HH:MM:SS,mmm')
    before = await P(pg, 'studio.caps.captions(studio.S.project).map(c=>[Math.round(c.start*1000),Math.round((c.start+c.dur)*1000),c.text.content])')
    # import a different file, then the exported one back
    other = OUT / 'other.srt'; other.write_text('\ufeff1\r\n00:00:00,500 --> 00:00:02,250\r\n<i>Line one</i>\r\n\r\n2\r\n00:00:02.500 --> 00:00:04,000\r\nLine two\r\nsecond row\r\n\r\n')
    await pg.set_input_files('#capFile', str(other)); await pg.wait_for_timeout(400)
    got = await P(pg, 'studio.caps.captions(studio.S.project).map(c=>[Math.round(c.start*1000),Math.round((c.start+c.dur)*1000),c.text.content])')
    ok(got == [[500, 2250, 'Line one'], [2500, 4000, 'Line two\nsecond row']], f'SRT import (BOM, CRLF, tags, dot millis, 2-line cue) {got}')
    await pg.set_input_files('#capFile', str(f)); await pg.wait_for_timeout(400)
    after = await P(pg, 'studio.caps.captions(studio.S.project).map(c=>[Math.round(c.start*1000),Math.round((c.start+c.dur)*1000),c.text.content])')
    ok(after == before, 'SRT round trip: export -> import gives the same captions')
    srt2 = await P(pg, 'studio.caps.projectSRT(studio.S.project)'); ok(srt2 == srt, 'SRT round trip: export again is byte-identical')
    pr = await P(pg, """import('./js/captions.js').then(C=>{const a=C.parseSRT('1\\n01:02:03,004 --> 01:02:05,999\\nx\\n');return [a[0].start,a[0].end,C.srtTime(3723.004),C.srtTime(0.0005)]})""")
    ok(abs(pr[0] - 3723.004) < 1e-6 and pr[2] == '01:02:03,004' and pr[3] == '00:00:00,001', f'SRT time maths {pr}')
    await pg.click('.sh-done'); await pg.wait_for_timeout(200)
    await P(pg, 'studio.save && studio.save()'); await pg.wait_for_timeout(600)
    await pg.reload(); await pg.wait_for_function('window.studio && studio.ready'); await pg.wait_for_timeout(400)
    n = await P(pg, 'studio.caps.captions(studio.S.project).length'); ok(n == len(after), f'captions survive a reload ({n})')
    f2 = await export(pg, 'captions', 720); ex = frame(f2, 4.6, 'cap_ex.png'); st = await still(pg, 4.6, 720, 1280)
    ps = psnr_lo(st, ex); ok(ps > 30, f'captions: export frame == renderer (PSNR {ps:.1f} dB)')
    ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

# ---------------- stickers ----------------
async def test_stickers(b):
    log('== stickers: library, categories, search, favourites, animated, add to overlay')
    ctx, pg = await new_page(b); await base_project(pg, ['image.png'])
    L = await P(pg, "studio.stickers.loadStickers().then(L=>({n:L.items.length,cats:L.cats.map(c=>[c.id,c.name,c.group,c.count]),lic:[...new Set(L.items.map(i=>i.lic))],anim:L.items.filter(i=>i.anim).length,files:L.items.map(i=>i.url)}))")
    METRICS['stickers'] = L['n']; METRICS['stickerCats'] = {c[0]: c[3] for c in L['cats']}; METRICS['animatedStickers'] = L['anim']
    for c in L['cats']: log(f'       {c[2]:6s} {c[1]:18s} {c[3]}')
    ok(L['n'] >= 400, f'{L["n"]} stickers in the library'); ok(all(c[3] > 0 for c in L['cats']), 'every category has stickers')
    need = ['emma-characters', 'emma-animals', 'emma-house', 'emma-letters', 'numbers', 'flags', 'emoji-faces', 'arrows', 'stars', 'frames', 'bubbles', 'shapes']
    ok(all(any(c[0] == n for c in L['cats']) for n in need), 'categories: Emmavengers (characters, animals, items, letters, numbers, flags), emoji, arrows, stars/hearts, frames, speech bubbles, shapes')
    ok(set(L['lic']) <= {'emma', 'noto', 'own'}, f'every sticker has a known licence {L["lic"]}'); ok(L['anim'] >= 40, f'{L["anim"]} animated stickers')
    bad = await P(pg, "Promise.all(" + json.dumps(L['files'][::7]) + ".map(u=>fetch(u).then(r=>r.ok&&r.headers.get('content-type')).catch(()=>false))).then(a=>a.filter(x=>!x||!String(x).startsWith('image')).length)")
    ok(bad == 0, f'sticker files exist and are images (sampled {len(L["files"][::7])})')
    await tap_tool(pg, 'stickers'); await pg.wait_for_selector('#stkGrid .stk'); await pg.wait_for_timeout(900)
    n0 = await pg.locator('#stkGrid .stk').count(); lazy = await P(pg, "[...document.querySelectorAll('#stkGrid img')].every(i=>i.loading==='lazy')")
    ok(0 < n0 <= 60 and lazy, f'only the open category is shown, lazily ({n0} tiles, loading=lazy)')
    await shot(pg, 'b6-stickers-390.png')
    await pg.click('.stkcats .chipbtn[data-v="emma-animals"]'); await pg.wait_for_timeout(500); await shot(pg, 'b6-stickers-animals-390.png')
    await pg.fill('#stkSearch', 'lion'); await pg.wait_for_timeout(500)
    names = await P(pg, "[...document.querySelectorAll('#stkGrid .stk')].map(b=>b.title)"); ok(any('Lion' in n for n in names) and len(names) < 12, f'search "lion" finds lions {names}')
    await pg.fill('#stkSearch', 'zzqx'); await pg.wait_for_timeout(400); ok(await pg.locator('#stkGrid .stk').count() == 0, 'search with no match shows nothing')
    await pg.fill('#stkSearch', ''); await pg.wait_for_timeout(400)
    await pg.click('.stkcats .chipbtn[data-v="stars"]'); await pg.wait_for_timeout(400)
    fid = await P(pg, "document.querySelector('#stkGrid .stk').dataset.id"); await pg.click(f'#stkGrid .stk[data-id="{fid}"] .fav')
    await pg.click('.stkcats .chipbtn[data-v="fav"]'); await pg.wait_for_timeout(300)
    fv = await P(pg, "[...document.querySelectorAll('#stkGrid .stk')].map(b=>b.dataset.id)"); ok(fv == [fid], f'favourite shows in Favourites {fv}')
    await pg.click('.stkcats .chipbtn[data-v="emma-animals"]'); await pg.wait_for_timeout(300)
    await P(pg, 'studio.player.seek(0.5)')
    await pg.click('#stkGrid .stk[data-id="emma/animals/lion"]'); await pg.wait_for_function('studio.S.project.tracks.some(t=>t.kind==="overlay"&&t.clips.length)', timeout=10000)
    c = await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="overlay").clips[0]')
    ok(c['type'] == 'image' and c['sticker'] == 'emma/animals/lion' and abs(c['start'] - 0.5) < 0.05, f'tap adds the sticker on an overlay track at the playhead ({c["start"]:.2f}s)')
    ok(bool(c.get('anim') and c['anim'].get('combo')), f'animated sticker comes with a Combo loop {c.get("anim")}')
    await pg.wait_for_timeout(300)
    await P(pg, 'studio.select(null)'); await pg.wait_for_timeout(200)
    if await pg.locator('#sheet .sh-done').count(): await pg.click('#sheet .sh-done')
    await tap_tool(pg, 'stickers'); await pg.wait_for_selector('#stkGrid .stk'); await pg.click('.stkcats .chipbtn[data-v="emma-animals"]'); await pg.wait_for_timeout(300)
    await pg.click('#stkGrid .stk[data-id="emma/animals/lion"]'); await pg.wait_for_timeout(800)
    ids = await P(pg, 'studio.S.project.tracks.filter(t=>t.kind==="overlay").flatMap(t=>t.clips.map(c=>c.mediaId))'); ok(len(ids) == 2 and len(set(ids)) == 1, f'adding the same sticker again re-uses the imported picture {ids}')
    a, b2 = await still(pg, 0.6), await still(pg, 1.1); ok(mdiff(a, b2) > 0.05, 'animated sticker moves in the picture')
    tp = await P(pg, "fetch('lib/stickers/emma/house/teddy-bear.webp').then(r=>r.blob()).then(createImageBitmap).then(b=>{const c=new OffscreenCanvas(b.width,b.height),x=c.getContext('2d');x.drawImage(b,0,0);const d=x.getImageData(0,0,b.width,b.height).data;let z=0;for(let i=3;i<d.length;i+=4)if(d[i]<10)z++;return z/(d.length/4)})")
    ok(tp > 0.1, f'Emmavengers cut-out stickers are transparent around the object ({tp:.0%} clear)')
    ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

# ---------------- effects + filters ----------------
async def test_effects(b):
    log('== effects + filters: registry, intensity, determinism, preview == export')
    ctx, pg = await new_page(b)
    r = await P(pg, """(async()=>{const fx=studio.fx; if(!fx.fxAvailable()) return {gl:false};
      const W=180,H=320,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');const im=new Image();im.src='tests/fixtures/sharp.png';await im.decode();x.drawImage(im,0,0,W,H);
      const base=x.getImageData(0,0,W,H).data,o=document.createElement('canvas');o.width=W;o.height=H;const y=o.getContext('2d',{willReadFrequently:true});
      const get=r=>{y.clearRect(0,0,W,H);y.drawImage(r,0,0);return y.getImageData(0,0,W,H).data}, dif=(a,b)=>{let s=0;for(let i=0;i<a.length;i+=4)s+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);return s/(a.length/4)/3};
      const E={},F={},errs=[]; const t0=performance.now();
      for(const e of fx.EFFECTS){ let mx=0, same=0; for(const t of [0.05,0.7,1.3,2.1]){ const r=fx.applyChain(c,W,H,[{kind:'effect',id:e.id,amount:.9,t,dur:3,seed:'s'}]); if(!r){errs.push(e.id);break;} const d=get(r); mx=Math.max(mx,dif(d,base));
          if(t===0.7){ const r2=fx.applyChain(c,W,H,[{kind:'effect',id:e.id,amount:.9,t,dur:3,seed:'s'}]); same=dif(get(r2),d);} }
        E[e.id]={cat:e.cat,name:e.name,max:mx,repeat:same,zero:fx.applyChain(c,W,H,[{kind:'effect',id:e.id,amount:0,t:1,dur:3}])===null}; }
      for(const f of fx.FILTER_DEFS){ const r=fx.applyChain(c,W,H,[{kind:'filter',id:f.id,amount:1}]); if(!r){errs.push(f.id);continue;} const full=dif(get(r),base); const h=fx.applyChain(c,W,H,[{kind:'filter',id:f.id,amount:.5}]); const half=dif(get(h),base);
        F[f.id]={cat:f.cat,name:f.name,full,half}; }
      return {gl:true,E,F,errs,ms:performance.now()-t0}})()""")
    ok(r['gl'], 'WebGL2 effects pipeline available')
    up = await P(pg, """(async()=>{const fx=studio.fx,h=document.createElement('canvas');h.width=h.height=40;const x=h.getContext('2d');x.fillStyle='red';x.fillRect(0,0,40,20);x.fillStyle='blue';x.fillRect(0,20,40,20);
      const top=r=>{const c=new OffscreenCanvas(40,40),y=c.getContext('2d');y.drawImage(r,0,0);return y.getImageData(20,5,1,1).data[0]>200};
      const o=[];for(const s of [h,await createImageBitmap(h)]){o.push(top(fx.applyChain(s,40,40,[{kind:'filter',id:'vivid',amount:1}])));o.push(top(fx.applyChain(s,40,40,[{kind:'filter',id:'vivid',amount:1},{kind:'effect',id:'glow',amount:.2,t:1}])));}return o})()""")
    ok(all(up), f'filters / effects keep the picture the right way up for canvas and decoded-photo sources {up}')
    E, F = r['E'], r['F']; METRICS['effects'] = len(E); METRICS['filters'] = len(F)
    cats = {}
    for k, v in E.items(): cats.setdefault(v['cat'], []).append(v['name'])
    METRICS['effectCats'] = {k: len(v) for k, v in cats.items()}
    for k, v in cats.items(): log(f'       effects/{k} ({len(v)}): {", ".join(v)}')
    fc = {}
    for k, v in F.items(): fc.setdefault(v['cat'], []).append(v['name'])
    METRICS['filterCats'] = {k: len(v) for k, v in fc.items()}
    for k, v in fc.items(): log(f'       filters/{k} ({len(v)}): {", ".join(v)}')
    ok(not r['errs'], f'every effect / filter shader compiles and runs {r["errs"][:4]}')
    ok(len(E) >= 60, f'{len(E)} effects (>= 60)'); ok(len(F) >= 50, f'{len(F)} filters (>= 50)')
    flat = [k for k, v in E.items() if v['max'] < 0.8]; ok(not flat, f'every effect visibly changes the picture {flat} {[round(E[k]["max"], 2) for k in flat]}')
    ok(all(v['repeat'] == 0 for v in E.values()), 'effects are deterministic (same time + seed -> identical pixels)')
    ok(all(v['zero'] for v in E.values()), 'intensity 0 = effect off')
    flatf = [k for k, v in F.items() if v['full'] < 2]; ok(not flatf, f'every filter changes the colours {flatf}')
    ok(all(v['half'] < v['full'] for v in F.values()), 'filter intensity: 50% is between none and full for every filter')
    log(f'       all effects x4 + filters at 180x320: {r["ms"]:.0f} ms')
    cost = await P(pg, """(()=>{const fx=studio.fx,W=1080,H=1920,c=new OffscreenCanvas(W,H);c.getContext('2d').fillRect(0,0,9,9);const o={};
      for(const id of ['bloom','dreamy','lensblur','fireworks','confetti','snow','halo','cartoon']){fx.applyChain(c,W,H,[{kind:'effect',id,amount:.8,t:1}]);const t0=performance.now();for(let i=0;i<4;i++){const r=fx.applyChain(c,W,H,[{kind:'effect',id,amount:.8,t:1+i/30}]);r.getContext('webgl2').finish();}o[id]=(performance.now()-t0)/4}return o})()""")
    log(f'       1080x1920 cost per frame (ms, software GL on this box): {dict((k, round(v, 1)) for k, v in cost.items())}')
    await base_project(pg, ['sharp.png', 'image.png'])
    await P(pg, 'studio.act(p=>{p.tracks.find(t=>t.kind==="main").clips.forEach(c=>c.dur=2)})')
    await set_time(pg, 0.3); await tap_tool(pg, 'effects'); await pg.wait_for_selector('#fxGrid .trtile'); await pg.wait_for_timeout(1200)
    await shot(pg, 'b6-effects-390.png')
    await pg.click('.fxcats .chipbtn[data-v="weather"]'); await pg.wait_for_timeout(200)
    vis = await P(pg, "[...document.querySelectorAll('#fxGrid .trtile')].filter(b=>!b.hidden).map(b=>b.dataset.v)"); ok('snow' in vis and 'confetti' not in vis, 'effect categories filter the grid')
    await pg.click('#fxGrid .trtile[data-v="snow"]'); await pg.wait_for_timeout(400)
    await pg.fill('#fxAmount', '1'); await pg.dispatch_event('#fxAmount', 'input'); await pg.click('.sh-done'); await pg.wait_for_timeout(300)
    ec = await P(pg, 'studio.S.project.tracks.filter(t=>t.kind==="effect").flatMap(t=>t.clips).map(c=>({s:c.start,d:c.dur,e:c.effect}))')
    ok(len(ec) == 1 and ec[0]['e']['id'] == 'snow' and ec[0]['e']['amount'] == 1, f'Effects tool puts an effect clip on the Effects track {ec}')
    order = await P(pg, 'studio.S.project.tracks.map(t=>t.kind)'); ok(order.index('effect') < order.index('main'), f'Effects track shows above the video tracks {order}')
    await P(pg, 'studio.act(p=>{const e=p.tracks.find(t=>t.kind==="effect").clips[0];e.start=0;e.dur=1.6; const m=p.tracks.find(t=>t.kind==="main").clips; m[1].filter={id:"cinematic",amount:1}; m[1].effects=[{id:"zoompulse",amount:1}];})')
    mid = await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="main").clips[0].id'); await P(pg, f'studio.select("{mid}")'); await pg.wait_for_timeout(200)
    await tap_tool(pg, 'filters'); await pg.wait_for_selector('#filterGrid .trtile'); await pg.wait_for_timeout(1200); await shot(pg, 'b6-filters-390.png')
    await pg.click('#filterGrid .trtile[data-v="golden"]'); await pg.fill('#filterAmount', '0.8'); await pg.dispatch_event('#filterAmount', 'input'); await pg.click('.sh-done')
    fl = await P(pg, f'studio.find(studio.S.project,"{mid}").clip.filter'); ok(fl == {'id': 'golden', 'amount': 0.8}, f'filter tile + strength set the clip filter {fl}')
    await tap_tool(pg, 'clipfx'); await pg.wait_for_selector('#fxGrid .trtile'); await pg.click('#fxGrid .trtile[data-v="sparkle"]'); await pg.wait_for_timeout(300); await pg.click('.sh-done')
    ce = await P(pg, f'studio.find(studio.S.project,"{mid}").clip.effects'); ok(bool(ce) and ce[0]['id'] == 'sparkle', f'per-clip effect set {ce}')
    await P(pg, 'studio.select(null)')
    s_on = await still(pg, 0.8)
    await P(pg, 'studio.act(p=>{p.tracks.find(t=>t.kind==="effect").clips[0].effect.amount=0})'); s_off = await still(pg, 0.8)
    ok(mdiff(s_on, s_off) > 1, f'effect track changes the frame under it ({mdiff(s_on, s_off):.1f})')
    await P(pg, 'studio.act(p=>{p.tracks.find(t=>t.kind==="effect").clips[0].effect.amount=1})')
    times = [0.4, 1.0, 1.5, 2.6, 3.4]
    prev = {}
    for t in times:
        await seek_exact(pg, t); d = await P(pg, "(document.querySelector('#preview canvas')||document.querySelector('#preview')).toDataURL('image/png').split(',')[1]"); prev[t] = Image.open(io.BytesIO(base64.b64decode(d))).convert('RGB'); prev[t].save(OUT / f'fxprev_{t}.png')
    st = {t: await still(pg, t, 720, 1280) for t in times}
    f = await export(pg, 'effects', 720)
    for t in times:
        ex = frame(f, t, f'fxex_{t}.png'); ps = psnr_lo(st[t], ex); gd = mdiff(prev[t].resize((180, 320), Image.BOX), ex.resize((180, 320), Image.BOX))
        ok(ps > 28, f'{t:.1f}s: export frame == renderer with effects + filters (PSNR at 1/4 size {ps:.1f} dB)'); ok(gd < 8, f'{t:.1f}s: preview == export (mean diff {gd:.1f})')
    ex = frame(f, 1.0, 'fx_pair.png'); pair = Image.new('RGB', (360 * 2, 640)); pair.paste(prev[1.0].resize((360, 640)), (0, 0)); pair.paste(ex.resize((360, 640)), (360, 0)); pair.save(SHOTS / 'b6-effects-preview-vs-export.png'); log('  shot b6-effects-preview-vs-export.png (preview | export at 1.0 s)')
    ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

# ---------------- templates ----------------
async def test_templates(b):
    log('== templates: build every template, placeholders, Replace, preview == export')
    ctx, pg = await new_page(b)
    info = await P(pg, """(async()=>{const T=studio.templates,out=[];for(const t of T.TEMPLATES){const urls=await T.templateAssets(t);const bad=(await Promise.all(urls.map(u=>fetch(u).then(r=>r.ok).catch(()=>false)))).filter(x=>!x).length;
      const p=await T.buildTemplate({media:studio.media,importFile:studio.importFile},t);const k={};for(const tr of p.tracks)k[tr.kind]=(k[tr.kind]||0)+tr.clips.length;
      out.push({id:t.id,name:t.name,cat:t.cat,dur:studio.projectDuration(p),want:T.templateDur(t),tracks:k,ph:T.placeholders(p).length,bad,missing:p.tracks.flatMap(x=>x.clips).filter(c=>c.mediaId&&!studio.media.get(c.mediaId)).length});}return out})()""")
    METRICS['templates'] = len(info); METRICS['templateList'] = [i['name'] for i in info]
    for i in info: log(f"       {i['id']:9s} {i['name']:24s} {i['dur']:5.1f}s tracks={i['tracks']} placeholders={i['ph']}")
    ok(len(info) >= 10, f'{len(info)} kids templates (>= 10)')
    need = ['bible', 'quiz', 'letter', 'number', 'animals', 'countdown', 'intro', 'outro']
    ok(all(any(i['id'] == n for i in info) for n in need), 'Bible story, quiz, letter, number, animal facts, countdown, intro, outro all there')
    ok(all(i['bad'] == 0 and i['missing'] == 0 for i in info), 'every template picture / sticker / music file exists and imports')
    ok(all(abs(i['dur'] - i['want']) < 0.05 for i in info), 'template projects have the planned length')
    ok(all(i['ph'] >= 1 for i in info), 'every template has pictures to replace')
    ok(all(i['tracks'].get('text', 0) + i['tracks'].get('caption', 0) >= 1 and i['tracks'].get('audio', 0) == 1 for i in info), 'every template has words and music')
    await P(pg, 'studio.tplSheet()'); await pg.wait_for_selector('#tplGrid .tpl'); await pg.wait_for_timeout(1200)
    ok(await pg.locator('#tplGrid .tpl').count() == len(info), 'Templates sheet lists every template'); await shot(pg, 'b6-templates-390.png')
    await pg.click('.tplcats .chipbtn[data-v="learn"]'); await pg.wait_for_timeout(200)
    vis = await P(pg, "[...document.querySelectorAll('#tplGrid .tpl')].filter(b=>!b.hidden).map(b=>b.dataset.id)"); ok('letter' in vis and 'intro' not in vis, f'category chips filter templates {vis}')
    await pg.click('.tplcats .chipbtn[data-v=""]'); await pg.wait_for_timeout(200)
    await pg.click('#tplGrid .tpl[data-id="bible"]'); await pg.click('#tplUse'); await pg.wait_for_function('studio.S.project.template==="bible" && document.querySelector("#busy").hidden', timeout=30000); await pg.wait_for_timeout(800)
    p = await P(pg, '({name:studio.S.project.name,kinds:studio.S.project.tracks.map(t=>t.kind),d:studio.projectDuration(studio.S.project),media:[...studio.media.keys()].length,ids:studio.project.mediaIds(studio.S.project).size})')
    ok(p['name'] == 'Bible story short' and abs(p['d'] - 22) < .05, f'tapping a template makes the project {p}')
    ok(p['media'] == p['ids'], f'only the template’s own media are kept ({p["media"]} in memory, {p["ids"]} used)')
    await set_time(pg, 1.2); await shot(pg, 'b6-template-bible-390.png')
    ph = await P(pg, 'studio.templates.placeholders(studio.S.project)'); ok(len(ph) == 3, f'3 story pictures are marked to replace {[x["label"] for x in ph]}')
    badge = await pg.locator('.badges .ph').count(); ok(badge >= 1, f'placeholders show a Replace badge on the timeline ({badge})')
    await P(pg, f'studio.select("{ph[0]["id"]}")'); await pg.wait_for_timeout(300)
    tools = await P(pg, "[...document.querySelectorAll('#toolbar .tool')].map(b=>b.dataset.tool)"); ok(tools[1] == 'phreplace', f'Replace me is the first tool on a placeholder {tools[:4]}')
    async with pg.expect_file_chooser() as fc: await pg.click('#toolbar .tool[data-tool="phreplace"]')
    await (await fc.value).set_files(str(FX / 'image.png')); await pg.wait_for_timeout(1500)
    c = await P(pg, f'studio.find(studio.S.project,"{ph[0]["id"]}").clip'); rec = await P(pg, f'studio.media.get("{c["mediaId"]}").name')
    ok(rec == 'image.png' and 'placeholder' not in c and c['dur'] == 4 and bool(c.get('keyframes', {}).get('scale')), f'Replace swaps in my photo, keeps length + zoom, clears the marker ({rec}, {c["dur"]}s)')
    ok(len(await P(pg, 'studio.templates.placeholders(studio.S.project)')) == 2, '2 pictures left to replace')
    await P(pg, 'studio.select(null)'); await pg.wait_for_timeout(200)
    times = [1.2, 5.0, 13.0, 17.0]; prev = {}
    for t in times:
        await seek_exact(pg, t); d = await P(pg, "(document.querySelector('#preview canvas')||document.querySelector('#preview')).toDataURL('image/png').split(',')[1]"); prev[t] = Image.open(io.BytesIO(base64.b64decode(d))).convert('RGB')
    f = await export(pg, 'template', 720)
    for t in times:
        ex = frame(f, t, f'tplex_{t}.png'); gd = mdiff(prev[t].resize((180, 320), Image.BOX), ex.resize((180, 320), Image.BOX)); ok(gd < 8, f'{t:.1f}s: template preview == export (mean diff {gd:.1f})')
    dur = float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(f)], capture_output=True, text=True).stdout.strip() or 0)
    ok(abs(dur - 22) < .3, f'exported template video is {dur:.2f}s')
    ex = frame(f, 1.2, 'tpl_pair.png'); ex.resize((360, 640)).save(SHOTS / 'b6-template-bible-export.png'); log('  shot b6-template-bible-export.png')
    await pg.reload(); await pg.wait_for_function('window.studio && studio.ready', timeout=20000); await pg.wait_for_timeout(800)
    r = await P(pg, '({t:studio.S.project.template,miss:studio.S.project.tracks.flatMap(x=>x.clips).filter(c=>c.mediaId&&!studio.media.get(c.mediaId)).length})')
    ok(r['t'] == 'bible' and r['miss'] == 0, f'template project survives a reload with all its media {r}')
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await P(pg, 'studio.tplSheet()'); await pg.wait_for_selector('#tplGrid .tpl'); await pg.click('#tplGrid .tpl[data-id="quiz"]'); await pg.click('#tplUse')
    await pg.wait_for_function('studio.S.project.template==="quiz" && document.querySelector("#busy").hidden', timeout=30000); await pg.wait_for_timeout(600)
    r = await P(pg, '({miss:studio.S.project.tracks.flatMap(x=>x.clips).filter(c=>c.mediaId&&!studio.media.get(c.mediaId)).length, mem:[...studio.media.keys()].length, used:studio.project.mediaIds(studio.S.project).size})')
    ok(r['miss'] == 0 and r['mem'] == r['used'], f'switching template (after confirming) replaces the project cleanly {r}')
    await set_time(pg, 8.6); await shot(pg, 'b6-template-quiz-390.png')
    ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--enable-unsafe-swiftshader'])
        only = [a for a in sys.argv[2:]]
        for t in TESTS:
            if only and t.__name__.replace('test_', '') not in only: continue
            await t(b)
        await b.close()
TESTS = [test_text, test_captions, test_stickers, test_effects, test_templates]
if __name__ == '__main__':
    try: asyncio.run(run())
    except Exception as e: import traceback; traceback.print_exc(); fails.append('crash: ' + repr(e))
    (ROOT / 'tests/create-metrics.json').write_text(json.dumps(METRICS, indent=1))
    log(f'RESULT: {"PASS" if not fails else "FAIL"} ({len(fails)} failures) in {time.time()-T0:.0f}s')
    for f in fails: log('  - ' + f)
    sys.exit(1 if fails else 0)

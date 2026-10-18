"""Batch 9 test: the template pack (60+ own templates) and the template browser (Google Chrome, 390x844 phone).
- every template builds a normal project: its pictures / stickers / music exist, planned length, replaceable slots, words + music
- beat templates: every cut, accent and the music beat grid line up (cuts exactly on the song's beats)
- before / after templates use masks; browser: categories, search, previews, detail page, Use; preview == export"""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, io, base64
from pathlib import Path
from PIL import Image, ImageChops, ImageStat
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-tpl-')); fails = []; T0 = time.time(); PORT = 8787; METRICS = {}
def log(*a): print(f'[{time.time()-T0:6.1f}s]', *a, flush=True)
def ok(c, m):
    log(('  ok   ' if c else '  FAIL ') + m)
    if not c: fails.append(m)
class Q(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
    def handle(self):
        try: super().handle()
        except Exception: pass
P = lambda pg, js: pg.evaluate(js)
def frame_n(f, n, name):
    o = OUT / name; subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(f), '-vf', f'select=eq(n\\,{n})', '-frames:v', '1', str(o)], check=True); return Image.open(o).convert('RGB')
def mdiff(a, b): b = b.resize(a.size); return sum(ImageStat.Stat(ImageChops.difference(a, b)).mean) / 3
async def still(pg, t, W=360, H=640):
    d = await P(pg, f'studio.renderStill({{t:{t},W:{W},H:{H}}})'); return Image.open(io.BytesIO(base64.b64decode(d))).convert('RGB')
async def export(pg, tag, res=720):
    await pg.click('#exportBtn'); await pg.click(f'#exRes .chipbtn[data-v="{res}"]'); await pg.click('#exGo'); await pg.wait_for_selector('#exDone:not([hidden])', timeout=400000)
    async with pg.expect_download() as dl: await pg.click('#exSave')
    d = await dl.value; f = OUT / (tag + '.mp4'); await d.save_as(str(f)); await pg.click('#exBack'); await pg.wait_for_timeout(300); return f
async def shot(pg, name): await pg.screenshot(path=str(SHOTS / name)); log('  shot ' + name)
async def new_page(b, q='?home'):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
    pg = await ctx.new_page(); pg.errs = []
    pg.on('pageerror', lambda e: pg.errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and pg.errs.append(m.text))
    await pg.goto(f'http://127.0.0.1:{PORT}/{q}'); await pg.wait_for_function('window.studio && studio.ready', timeout=20000); await pg.wait_for_timeout(500); return ctx, pg

BUILD_ALL = '''(async()=>{const T=studio.templates,pj=studio.project,out=[];
 for(const t of T.TEMPLATES){const urls=await T.templateAssets(t);let bad=0;for(const u of urls){let okk=false;for(let k=0;k<3&&!okk;k++)okk=await fetch(u).then(r=>r.ok).catch(()=>false);if(!okk){bad++;console.warn("missing "+u);}}
  const p=await T.buildTemplate({media:studio.media,importFile:studio.importFile},t);const k={};for(const x of p.tracks)k[x.kind]=(k[x.kind]||0)+1;
  const m=p.tracks.find(x=>x.kind==="main"),a=(p.tracks.find(x=>x.kind==="audio")||{clips:[]}).clips[0];let cutErr=0,fxErr=0,nCuts=0,nFx=0;
  if(t.beat){const spb=60/t.bpm,on=x=>{const r=x/spb;return Math.abs(r-Math.round(r))*spb};
   m.clips.forEach((c,i)=>{if(!i)return;const e=pj.transEff(m.clips[i-1],c);cutErr=Math.max(cutErr,on(c.start+e));nCuts++;});
   for(const tr of p.tracks.filter(x=>x.kind==="effect"))for(const c of tr.clips)if(/^beat/.test(c.effect.id)){fxErr=Math.max(fxErr,on(c.start));nFx++;}}
  const masks=p.tracks.flatMap(x=>x.clips).filter(c=>c.mask&&c.mask.shape&&c.mask.shape!=="none").length;
  out.push({id:t.id,name:t.name,cat:t.cat,beat:!!t.beat,bpm:t.bpm||0,dur:studio.projectDuration(p),want:T.templateDur(t),
   tracks:k,ph:T.placeholders(p).length,bad,missing:p.tracks.flatMap(x=>x.clips).filter(c=>c.mediaId&&!studio.media.get(c.mediaId)).length,cutErr,fxErr,nCuts,nFx,
   audioBeat:!!(a&&a.beat&&a.beat.bpm===t.bpm),audioEnd:a?a.start+(a.out-a.in):0,beatsN:a?pj.beatTimes(a).length:0,masks,clips:p.tracks.reduce((s,x)=>s+x.clips.length,0)});}
 return out})()'''

async def test_pack(b):
    log('== pack: build every template')
    ctx, pg = await new_page(b)
    info = await P(pg, BUILD_ALL); cats = {}
    for i in info: cats[i['cat']] = cats.get(i['cat'], 0) + 1
    catdefs = await P(pg, 'studio.templates.TEMPLATE_CATS')
    METRICS.update(templates=len(info), beatTemplates=sum(i['beat'] for i in info), categories=cats, list=[(i['id'], i['name'], i['cat'], round(i['dur'], 2), i['beat']) for i in info])
    for i in info: log(f"       {i['id']:18s} {i['cat']:11s} {i['dur']:5.1f}s {'beat %3d' % i['bpm'] if i['beat'] else '        '} slots={i['ph']} clips={i['clips']}")
    ok(len(info) >= 60, f'{len(info)} templates (>= 60)')
    ok(len(catdefs) >= 12 and all(cats.get(c, 0) >= 2 for c, _ in catdefs), f'{len(catdefs)} categories, each with 2+ templates {cats}')
    need = ['bible', 'learn', 'quiz', 'promo', 'brand', 'party', 'trailer', 'story', 'prayer', 'facts', 'countdown', 'beforeafter']
    ok(all(c in cats for c in need), 'Bible, learning, quizzes, promos, intros/outros, birthdays/holidays, channel trailer, story cards, prayer, facts, countdowns, before/after all there')
    ok(len({i['id'] for i in info}) == len(info), 'template ids are unique')
    ok(all(i['bad'] == 0 and i['missing'] == 0 for i in info), f"every picture / sticker / music file exists and imports {[i['id'] for i in info if i['bad'] or i['missing']]}")
    ok(all(abs(i['dur'] - i['want']) < .05 for i in info), f"every template project has its planned length {[(i['id'], i['dur'], i['want']) for i in info if abs(i['dur'] - i['want']) >= .05]}")
    ok(all(i['ph'] >= 1 for i in info), f"every template has pictures to replace {[i['id'] for i in info if i['ph'] < 1]}")
    ok(all(i['tracks'].get('text', 0) + i['tracks'].get('caption', 0) >= 1 and i['tracks'].get('audio', 0) == 1 for i in info), 'every template has words and music')
    beat = [i for i in info if i['beat']]
    ok(len(beat) >= 40, f'{len(beat)} templates are beat-synced (>= 40)')
    ok(all(i['cutErr'] < 1e-4 for i in beat), f"beat templates: every cut is on a beat (worst {max(i['cutErr'] for i in beat) * 1000:.3f} ms over {sum(i['nCuts'] for i in beat)} cuts)")
    ok(all(i['fxErr'] < 1e-4 for i in beat) and sum(i['nFx'] for i in beat) > 100, f"beat templates: beat accents start on beats ({sum(i['nFx'] for i in beat)} accents, worst {max(i['fxErr'] for i in beat) * 1000:.3f} ms)")
    ok(all(i['audioBeat'] and i['beatsN'] > 4 for i in beat), 'beat templates: the music clip carries the beat grid (markers on the timeline)')
    ok(all(abs(i['audioEnd'] - i['dur']) < .05 for i in beat), 'beat templates: the music runs to the end')
    ba = [i for i in info if i['cat'] == 'beforeafter']; ok(len(ba) >= 3 and all(i['masks'] >= 1 for i in ba), f"before/after templates use masks {[(i['id'], i['masks']) for i in ba]}")
    ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

async def test_browser(b):
    log('== browser: categories, search, previews, detail, use')
    ctx, pg = await new_page(b)
    n = await P(pg, 'studio.templates.TEMPLATES.length')
    await pg.click('#homeTemplates'); await pg.wait_for_selector('#tplGrid .tpl'); await pg.wait_for_timeout(1500)
    ok(await pg.locator('#tplGrid .tpl').count() == n, f'browser lists all {n} templates'); await shot(pg, 'b9-templates-browser-390.png')
    prev = await P(pg, '(async()=>{const ids=studio.templates.TEMPLATES.map(t=>t.id);const r=await Promise.all(ids.flatMap(id=>[fetch(`lib/templates/previews/${id}.webp`),fetch(`lib/templates/previews/${id}-s.webp`)].map(p=>p.then(x=>x.ok).catch(()=>false))));return r.filter(x=>!x).length})()')
    ok(prev == 0, f'every template has a card preview and an animated preview strip ({prev} missing)')
    chips = await P(pg, '[...document.querySelectorAll(".tplcats .chipbtn")].map(b=>b.dataset.v)'); ok(len(chips) >= 13, f'{len(chips) - 1} category chips + All')
    vis = lambda: P(pg, "[...document.querySelectorAll('#tplGrid .tpl')].filter(b=>!b.hidden).map(b=>b.dataset.id)")
    await pg.click('.tplcats .chipbtn[data-v="bible"]'); await pg.wait_for_timeout(300); v = await vis()
    ok(len(v) >= 12 and 'bible' in v and 'b-creation' in v and 'letter' not in v, f'Bible stories chip: {len(v)} templates'); await shot(pg, 'b9-templates-bible-390.png')
    await pg.click('.tplcats .chipbtn[data-v="learn"]'); await pg.wait_for_timeout(200); v = await vis(); ok('letter' in v and 'abc-beat' in v and 'intro' not in v, f'Learning chip {len(v)}')
    await pg.click('.tplcats .chipbtn[data-v=""]'); await pg.fill('#tplSearch', 'birthday'); await pg.wait_for_timeout(300); v = await vis()
    ok('birthday' in v and 'birthday-invite' in v and 'quiz' not in v, f'search “birthday” -> {v}'); await shot(pg, 'b9-templates-search-390.png')
    await pg.fill('#tplSearch', 'abc'); await pg.wait_for_timeout(200); v = await vis(); ok('abc-beat' in v, f'search “abc” -> {v}')
    await pg.fill('#tplSearch', 'zzqx'); await pg.wait_for_timeout(200); ok(await P(pg, '!document.querySelector("#tplEmpty").hidden') and not await vis(), 'no match shows a hint')
    await pg.fill('#tplSearch', 'before after'); await pg.wait_for_timeout(200); v = await vis(); ok(all(x in v for x in ['ba-split', 'ba-wipe', 'ba-thennow']), f'search “before after” -> {v}')
    await pg.click('#tplGrid .tpl[data-id="ba-split"]'); await pg.wait_for_selector('#tplDetail:not([hidden])'); await pg.wait_for_timeout(1200)
    d = await P(pg, '({h:document.querySelector(".tplh").textContent,meta:document.querySelector(".tplmeta").textContent,anim:getComputedStyle(document.querySelector(".tplanim")).animationName,grid:document.querySelector("#tplGrid").hidden})')
    ok(d['h'] == 'Before | after split' and 'beat' in d['meta'] and d['anim'] == 'tplanim' and d['grid'], f'detail page with animated preview {d}'); await shot(pg, 'b9-template-detail-390.png')
    await pg.click('#tplBack'); await pg.wait_for_timeout(300); ok(await P(pg, '!document.querySelector("#tplGrid").hidden && document.querySelector("#tplDetail").hidden'), 'Back returns to the list')
    # use a beat template from its detail page
    await pg.fill('#tplSearch', ''); await pg.click('#tplGrid .tpl[data-id="promo-newvideo"]'); await pg.wait_for_selector('#tplDetail:not([hidden])'); await pg.click('#tplUse')
    await pg.wait_for_function('studio.S.project && studio.S.project.template==="promo-newvideo" && document.querySelector("#busy").hidden', timeout=60000); await pg.wait_for_timeout(1000)
    r = await P(pg, '(()=>{const p=studio.S.project,a=p.tracks.find(t=>t.kind==="audio").clips[0],m=p.tracks.find(t=>t.kind==="main");return {d:studio.projectDuration(p),beats:studio.project.beatTimes(a).length,ph:studio.templates.placeholders(p).length,cuts:m.clips.slice(1).map((c,i)=>c.start+studio.project.transEff(m.clips[i],c))}})()')
    spb = 60 / 121; ok(r['ph'] == 4 and r['beats'] > 20 and all(abs(c / spb - round(c / spb)) * spb < 1e-4 for c in r['cuts']), f'“Use this template” makes the beat project ({r["ph"]} clips to replace, cuts on beats {[round(c, 3) for c in r["cuts"]]})')
    await P(pg, '(()=>{studio.timeline.setZoom(40);studio.player.seek(2.4);studio.timeline.setTime(2.4)})()'); await pg.wait_for_timeout(1800); await shot(pg, 'b9-template-beat-390.png')
    # preview == export, and the picture changes right at a cut
    f = await export(pg, 'tplbeat', 720); ds = []
    for k, t in enumerate([1.0, r['cuts'][1] + .2, r['cuts'][3] + .3, r['d'] - 1.0]):
        n_ = round(t * 30); pv = await still(pg, n_ / 30, 360, 640); ex = frame_n(f, n_, f'tex_{k}.png'); ds.append(round(mdiff(pv.resize((90, 160), Image.BOX), ex.resize((90, 160), Image.BOX)), 1))
    ok(all(x < 10 for x in ds), f'beat template: preview == export at 4 exact frames (mean diff {ds})')
    c = r['cuts'][0]; nc = round(c * 30); a0, a1, a2 = frame_n(f, nc - 3, 'c0.png'), frame_n(f, nc - 1, 'c1.png'), frame_n(f, nc + 1, 'c2.png')
    METRICS['cutFrames'] = [round(mdiff(a0, a1), 1), round(mdiff(a1, a2), 1)]; log(f'       export frames around the first cut: {METRICS["cutFrames"]}')
    # before/after template in the editor
    await P(pg, 'studio.tplUse("ba-split")'); await pg.wait_for_function('studio.S.project.template==="ba-split" && document.querySelector("#busy").hidden', timeout=60000); await pg.wait_for_timeout(600)
    await P(pg, '(()=>{const t=60/112*6;studio.player.seek(t);studio.timeline.setTime(t)})()'); await pg.wait_for_timeout(1500); await shot(pg, 'b9-template-beforeafter-390.png')
    im = await still(pg, 60 / 112 * 6, 360, 640); L, R = im.crop((20, 200, 160, 500)), im.crop((200, 200, 340, 500))
    ok(mdiff(L, R) > 8, f'before/after: the two halves show different pictures (diff {mdiff(L, R):.1f})')
    # a Bible beat template in the editor
    await P(pg, 'studio.tplUse("b-joseph-coat")'); await pg.wait_for_function('studio.S.project.template==="b-joseph-coat" && document.querySelector("#busy").hidden', timeout=60000); await pg.wait_for_timeout(600)
    await P(pg, '(()=>{const t=60/125*10;studio.player.seek(t);studio.timeline.setTime(t)})()'); await pg.wait_for_timeout(1500); await shot(pg, 'b9-template-bible-390.png')
    ok(not pg.errs, f'no console errors {pg.errs[:3]}'); await ctx.close()

async def main():
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=srv.serve_forever, daemon=True).start()
    only = set(sys.argv[2].split(',')) if len(sys.argv) > 2 else None
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel='chrome', headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'])
        for name, fn in (('pack', test_pack), ('browser', test_browser)):
            if only and name not in only: continue
            try: await fn(b)
            except Exception as e: import traceback; traceback.print_exc(); ok(False, f'{name} crashed: {e}')
        await b.close()
    json.dump(METRICS, open(ROOT / 'tests/templates-metrics.json', 'w'), indent=1, default=float)
    log(f'RESULT: {"PASS" if not fails else "FAIL"} ({len(fails)} failures) in {time.time() - T0:.0f}s'); [log('  - ' + f) for f in fails]; sys.exit(1 if fails else 0)
asyncio.run(main())

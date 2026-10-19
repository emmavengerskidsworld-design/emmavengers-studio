"""Batch 12 part 3 — library growth round 2 (effects 150+, filters 120+, text styles 120+, stickers 1000+, kids categories, licences).   python3 tests/test_library.py [shots_dir]"""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, math, io, base64
from pathlib import Path
import numpy as np
from PIL import Image
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-lib-')); fails = []; T0 = time.time(); PORT = 8806; metrics = {}
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

KIDS = ['kids-school', 'kids-bible', 'kids-animals', 'kids-food', 'kids-space', 'kids-sports', 'kids-weather', 'kids-holidays', 'kids-feelings', 'abc']
async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=s.serve_forever, daemon=True).start()
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome', headless=True, args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True)
        pg = await ctx.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=30000)
        await P(pg, 'studio.home && studio.home.hide && studio.home.hide()'); await pg.wait_for_timeout(300)
        log('== counts')
        n = await P(pg, """(async()=>{const ts=await import('./js/textstyles.js'); const L=await studio.stickers.loadStickers(); return {fx:studio.fx.EFFECTS.length, fl:studio.fx.FILTER_DEFS.length, ts:ts.TEXT_STYLES.length,
          st:L.items.length, cats:L.cats.map(c=>[c.id,c.name,c.group,c.count]), lic:L.items.reduce((o,i)=>(o[i.lic]=(o[i.lic]||0)+1,o),{}), fxc:studio.fx.EFFECTS.reduce((o,e)=>(o[e.cat]=(o[e.cat]||0)+1,o),{}),
          ids:[studio.fx.EFFECTS,studio.fx.FILTER_DEFS,ts.TEXT_STYLES,L.items].map(a=>a.length-new Set(a.map(x=>x.id)).size), files:L.items.map(i=>i.url)}})()""")
        log(' ', {k: n[k] for k in ('fx', 'fl', 'ts', 'st', 'lic', 'fxc', 'ids')}); metrics.update({k: n[k] for k in ('fx', 'fl', 'ts', 'st', 'lic', 'fxc')}); metrics['stickerCats'] = {c[0]: c[3] for c in n['cats']}
        ok(n['fx'] >= 150, f'{n["fx"]} effects (>= 150)'); ok(n['fl'] >= 120, f'{n["fl"]} filters (>= 120)'); ok(n['ts'] >= 120, f'{n["ts"]} text styles (>= 120)'); ok(n['st'] >= 1000, f'{n["st"]} stickers (>= 1000)')
        ok(n['ids'] == [0, 0, 0, 0], 'no duplicate ids in any library')
        kc = {c[0]: c[3] for c in n['cats']}; ok(all(kc.get(k, 0) >= 10 for k in KIDS), f'kids categories (school, Bible, animals, food, space, sports, weather, holidays, feelings, ABC) {[kc.get(k) for k in KIDS]}')
        ok(set(n['lic']) <= {'emma', 'noto', 'own'}, f'every sticker has a known licence (no CC-BY) {n["lic"]}')
        bad = await P(pg, "Promise.all(" + json.dumps(n['files'][::9]) + ".map(u=>fetch(u).then(r=>r.ok&&r.headers.get('content-type')).catch(()=>false))).then(a=>a.filter(x=>!x||!String(x).startsWith('image')).length)")
        ok(bad == 0, f'sticker files exist and are images (sampled {len(n["files"][::9])})')
        lic = (ROOT / 'LICENSES.md').read_text(); ok(str(n['st']) in lic and 'emoji2' in lic and 'make_art2' in lic, 'LICENSES.md lists the new sticker sets and counts')

        log('== new effects / filters / styles render')
        r = await P(pg, """(async()=>{const fx=studio.fx;const W=180,H=320,c=document.createElement('canvas');c.width=W;c.height=H;const x=c.getContext('2d');const im=new Image();im.src='tests/fixtures/sharp.png';await im.decode();x.drawImage(im,0,0,W,H);
          const base=x.getImageData(0,0,W,H).data,o=document.createElement('canvas');o.width=W;o.height=H;const y=o.getContext('2d',{willReadFrequently:true});
          const get=r=>{y.clearRect(0,0,W,H);y.drawImage(r,0,0);return y.getImageData(0,0,W,H).data}, dif=(a,b)=>{let s=0;for(let i=0;i<a.length;i+=4)s+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);return s/(a.length/4)/3};
          const flat=[],errs=[],nondet=[];
          for(const e of fx.EFFECTS.slice(79)){let mx=0;for(const t of [0.05,0.7,1.3,2.1]){const r=fx.applyChain(c,W,H,[{kind:'effect',id:e.id,amount:.9,t,dur:3,seed:'s'}]);if(!r){errs.push(e.id);break;}const d=get(r);mx=Math.max(mx,dif(d,base));
            if(t===0.7&&dif(get(fx.applyChain(c,W,H,[{kind:'effect',id:e.id,amount:.9,t,dur:3,seed:'s'}])),d)>0)nondet.push(e.id);} if(mx<0.8)flat.push(e.id);}
          const fflat=[];for(const f of fx.FILTER_DEFS.slice(52)){const r=fx.applyChain(c,W,H,[{kind:'filter',id:f.id,amount:1}]);if(!r){errs.push(f.id);continue;}const full=dif(get(r),base),half=dif(get(fx.applyChain(c,W,H,[{kind:'filter',id:f.id,amount:.5}])),base);if(full<2||half>=full)fflat.push(f.id);}
          // contact sheet of 40 new effects at t=1 (same renderer as preview/export)
          const S=document.createElement('canvas');S.width=8*90;S.height=5*160;const sx=S.getContext('2d');fx.EFFECTS.slice(79,119).forEach((e,i)=>{const r=fx.applyChain(c,W,H,[{kind:'effect',id:e.id,amount:.9,t:1.2,dur:3,seed:'s'}]);sx.drawImage(r,(i%8)*90,Math.floor(i/8)*160,90,160);});
          return {flat,errs,nondet,fflat,sheet:S.toDataURL('image/png')}})()""")
        log(' ', {k: r[k] for k in ('flat', 'errs', 'nondet', 'fflat')})
        ok(not r['errs'] and not r['flat'] and not r['nondet'], 'all 81 new effects compile, visibly change the picture and are deterministic (preview == export)')
        ok(not r['fflat'], 'all 70 new filters change colours, 50% between none and full')
        (SHOTS / 'b12-lib-effects-grid.png').write_bytes(base64.b64decode(r['sheet'].split(',')[1])); log('  shot b12-lib-effects-grid.png')
        t = await P(pg, """(async()=>{const ts=await import('./js/textstyles.js'),R=await import('./js/render.js'),pj=await import('./js/project.js'),F=await import('./js/fonts.js');await F.ensureFont('luckiestguy');
          const W=300,H=200,cv=new OffscreenCanvas(W,H),x=cv.getContext('2d',{willReadFrequently:true}); const img=c=>{x.setTransform(1,0,0,1,0,0);x.fillStyle='#406080';x.fillRect(0,0,W,H);R.drawText(x,W,H,c,{x:.5,y:.5,scale:1,rotation:0,opacity:1},1);return x.getImageData(0,0,W,H).data};
          const dif=(a,b)=>{let s=0;for(let i=0;i<a.length;i+=4)s+=Math.abs(a[i]-b[i])+Math.abs(a[i+1]-b[i+1])+Math.abs(a[i+2]-b[i+2]);return s/(a.length/4)/3};
          const mk=()=>{const c=pj.newClip('text',{dur:3});c.text.content='Abc';c.text.size=300;c.text.font='luckiestguy';return c};const sig=[],same=[];
          for(const s of ts.TEXT_STYLES){const c=mk();ts.applyStyle(c.text,s.id);sig.push([s.id,img(c)])}
          for(let i=58;i<sig.length;i++)for(let j=0;j<i;j++)if(dif(sig[i][1],sig[j][1])<0.3)same.push(sig[i][0]+'~'+sig[j][0]);
          const S=document.createElement('canvas');S.width=6*200;S.height=11*90;const sx=S.getContext('2d');sx.fillStyle='#2a3448';sx.fillRect(0,0,S.width,S.height);
          ts.TEXT_STYLES.slice(58).forEach((s,i)=>{const c=pj.newClip('text',{dur:3});c.text.content=s.name.split(' ')[0];c.text.size=70;c.text.font='luckiestguy';ts.applyStyle(c.text,s.id);const o=new OffscreenCanvas(200,90);R.drawText(o.getContext('2d'),200,90,c,{x:.5,y:.5,scale:1,rotation:0,opacity:1},1);sx.drawImage(o,(i%6)*200,Math.floor(i/6)*90)});
          return {same,sheet:S.toDataURL('image/png')}})()""")
        ok(not t['same'], f'new text styles are distinct from every other style {t["same"][:4]}')
        (SHOTS / 'b12-lib-textstyles.png').write_bytes(base64.b64decode(t['sheet'].split(',')[1])); log('  shot b12-lib-textstyles.png')

        log('== pickers (UI)')
        FX = ROOT / 'tests/fixtures'
        await P(pg, 'document.querySelector("#fileMedia").value=""'); await pg.set_input_files('#fileMedia', [str(FX / 'sharp.png')])
        await pg.wait_for_function('studio.S.project.tracks.flatMap(t=>t.clips).length>=1', timeout=30000); await seek(pg, .5)
        await tool(pg, 'effects'); await pg.wait_for_selector('#fxGrid .trtile'); await pg.click('.fxcats .chipbtn[data-v="kids"]'); await pg.wait_for_timeout(1500)
        vis = await P(pg, "[...document.querySelectorAll('#fxGrid .trtile')].filter(b=>!b.hidden).map(b=>b.dataset.v)"); ok('heartrain' in vis and 'snow' not in vis and len(vis) >= 10, f'effects picker has a Kids tab ({len(vis)})')
        await shot(pg, 'b12-lib-effects-kids.png', 800)
        await pg.click('.fxcats .chipbtn[data-v="frame"]'); await pg.wait_for_timeout(1500); await shot(pg, 'b12-lib-effects-frames.png', 600)
        await close(pg)
        mid = await P(pg, 'studio.S.project.tracks.find(t=>t.kind==="main").clips[0].id'); await P(pg, f'studio.select("{mid}")'); await pg.wait_for_timeout(200)
        await tool(pg, 'filters'); await pg.wait_for_selector('#filterGrid .trtile'); await pg.click('.filtercats .chipbtn[data-v="season"]'); await pg.wait_for_timeout(1500)
        fv = await P(pg, "[...document.querySelectorAll('#filterGrid .trtile')].filter(b=>!b.hidden).map(b=>b.dataset.v)"); ok('christmas' in fv and len(fv) >= 10, f'filters picker has Holidays ({len(fv)})')
        await shot(pg, 'b12-lib-filters-holidays.png', 600); await close(pg); await P(pg, 'studio.select(null)')
        await tool(pg, 'stickers'); await pg.wait_for_selector('#stkGrid .stk'); await pg.click('.stkcats .chipbtn[data-v="kids-bible"]'); await pg.wait_for_timeout(1500)
        sv = await P(pg, "[...document.querySelectorAll('#stkGrid .stk')].map(b=>b.title)"); log('  bible', sv[:8]); ok(len(sv) >= 20 and any('Amen' in x for x in sv), 'Bible & faith sticker tab (Amen, crosses, doves...)')
        await shot(pg, 'b12-lib-stickers-bible.png', 600)
        await pg.click('.stkcats .chipbtn[data-v="kids-school"]'); await pg.wait_for_timeout(1500); await shot(pg, 'b12-lib-stickers-school.png', 600)
        await pg.click('.stkcats .chipbtn[data-v="abc"]'); await pg.wait_for_timeout(1500); await shot(pg, 'b12-lib-stickers-abc.png', 600)
        await pg.fill('#stkSearch', 'amen'); await pg.wait_for_timeout(500); am = await P(pg, "[...document.querySelectorAll('#stkGrid .stk')].map(b=>b.title)"); ok(len(am) >= 2, f'search "amen" {am}')
        await close(pg)
        ok(not errs, f'no page errors {errs[:3]}')
        await b.close()
    (ROOT / 'tests/library-metrics.json').write_text(json.dumps(metrics, indent=1))
    log(f'RESULT: {"PASS" if not fails else "FAIL"} ({len(fails)} failures) in {time.time()-T0:.0f}s')
    for f in fails: log('  -', f)
    sys.exit(1 if fails else 0)
asyncio.run(run())

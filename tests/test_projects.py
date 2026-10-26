"""Batch 7 projects + backup (Google Chrome, 390x844 phone).   python3 tests/test_projects.py [shots_dir]   (nohup; writes tests/projects.log)
Migration: the old single-project app (commit d813dfd, served from the same origin) makes a project with a video, a photo and a
title; the new app must show it in the project list with every clip and byte-identical media. Then: project list (grid, thumbnails,
name, length, last edited), New project with ratio, open, rename, duplicate, delete (confirm, cancel keeps it), sort and search,
templates make a NEW project, storage line + low/full warnings, keep-safe (persist) button, media de-duplicated across projects and
cleaned up when no project uses it. Backup: one project -> .emmaproj (zip checked with Python), delete, restore, back up again ->
byte-identical; restore next to an existing copy -> "(restored)"; Back up all -> restore in a fresh browser profile."""
import asyncio, sys, functools, http.server, threading, json, subprocess, tempfile, time, hashlib, zipfile, io, shutil
from pathlib import Path
from playwright.async_api import async_playwright
ROOT = Path(__file__).resolve().parents[1]; FX = ROOT / 'tests/fixtures'
SHOTS = Path(sys.argv[1] if len(sys.argv) > 1 else '/workspace/studio-shots'); SHOTS.mkdir(parents=True, exist_ok=True)
OUT = Path(tempfile.mkdtemp(prefix='studio-proj-')); fails = []; T0 = time.time(); PORT = 8777; OLD_COMMIT = 'd813dfd'
def log(*a): print(f'[{time.time()-T0:6.1f}s]', *a, flush=True)
def ok(c, m):
    log(('  ok   ' if c else '  FAIL ') + m)
    if not c: fails.append(m)
SERVE = {'dir': str(ROOT)}
class Q(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k): super().__init__(*a, directory=SERVE['dir'], **k)
    def log_message(self, *a): pass
    def end_headers(self): self.send_header('Cache-Control', 'no-store'); super().end_headers()
    def handle(self):
        try: super().handle()
        except Exception: pass
P = lambda pg, js: pg.evaluate(js)
def h(b): return hashlib.sha256(b).hexdigest()
async def new_page(b, path='/'):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True, service_workers='block')
    pg = await ctx.new_page(); pg.errs = []
    pg.on('pageerror', lambda e: pg.errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and pg.errs.append(m.text))
    await pg.goto(f'http://127.0.0.1:{PORT}{path}'); await pg.wait_for_function('window.studio && studio.ready', timeout=20000)
    return ctx, pg
async def add(pg, files, n):
    await P(pg, 'document.querySelector("#fileMedia").value=""')
    await pg.set_input_files('#fileMedia', [str(FX / f) for f in files]); await pg.wait_for_function(f'studio.S.project.tracks.flatMap(t=>t.clips).length==={n}', timeout=30000); await pg.wait_for_timeout(400)
async def shot(pg, name, wait=500): await pg.wait_for_timeout(wait); await pg.screenshot(path=str(SHOTS / name)); log('  shot', name)
async def home(pg):
    if not await P(pg, 'document.body.classList.contains("home-open")'): await pg.click('#menuBtn')
    await pg.wait_for_selector('#home:not([hidden]) #tabProjects'); await pg.click('#tabProjects')
    await pg.wait_for_selector('#home:not([hidden]) #homeGrid'); await pg.wait_for_function('window.__homeInfo'); await pg.wait_for_timeout(300)
async def cards(pg): return await P(pg, '[...document.querySelectorAll("#homeGrid .pcard")].map(c=>({id:c.dataset.id,name:c.querySelector(".pname").textContent,meta:c.querySelector(".pmeta").textContent,img:!!c.querySelector(".pthumb img")}))')
async def more(pg, pid, item): await pg.click(f'#homeGrid .pcard[data-id="{pid}"] .pmore'); await pg.wait_for_selector('#' + item); await pg.click('#' + item)
async def db_media(pg): return await P(pg, '''(async()=>{const d=await new Promise((r,j)=>{const q=indexedDB.open('emmavengers-studio');q.onsuccess=()=>r(q.result);q.onerror=j});
  const all=await new Promise(r=>{const q=d.transaction('media').objectStore('media').getAll();q.onsuccess=()=>r(q.result)});
  const out=[];for(const m of all){const b=new Uint8Array(await m.blob.arrayBuffer());const x=await crypto.subtle.digest('SHA-256',b);out.push({id:m.id,name:m.name,size:m.size,hash:m.hash||null,sha:[...new Uint8Array(x)].map(v=>v.toString(16).padStart(2,'0')).join('')})}
  const v=d.version, idx=[...d.transaction('media').objectStore('media').indexNames]; d.close(); return {v,idx,media:out}})()''')
async def clips_of(pg): return await P(pg, 'studio.S.project.tracks.map(t=>({kind:t.kind,clips:t.clips.map(c=>({id:c.id,type:c.type,mediaId:c.mediaId||null,start:+c.start.toFixed(3),dur:+(c.dur||0).toFixed(3),text:c.text&&c.text.content||null}))}))')
async def save_dl(pg, click, name):
    async with pg.expect_download() as dl: await pg.click(click)
    d = await dl.value; f = OUT / name; await d.save_as(str(f)); return f, d.suggested_filename

async def run():
    s = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), Q); threading.Thread(target=s.serve_forever, daemon=True).start()
    old = OUT / 'old'; old.mkdir()
    subprocess.run(f'git -C {ROOT} archive {OLD_COMMIT} | tar -x -C {old}', shell=True, check=True)
    fx = {f: h((FX / f).read_bytes()) for f in ('video.mp4', 'image.png', 'sharp.png', 'music.mp3')}
    async with async_playwright() as pw:
        b = await pw.chromium.launch(channel='chrome', headless=True, args=['--enable-unsafe-swiftshader'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True, accept_downloads=True, service_workers='block')

        # ---------------- migration from the old single-project app ----------------
        log(f'== Migration: old app ({OLD_COMMIT}) on the same origin')
        SERVE['dir'] = str(old)
        pg = await ctx.new_page(); pg.errs = []; pg.on('pageerror', lambda e: pg.errs.append(str(e)))
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=20000)
        ok(not await P(pg, '!!studio.projects'), 'old app has no project list')
        await add(pg, ['video.mp4', 'image.png'], 2)
        await P(pg, '''studio.act(p=>{const tt=p.tracks.find(t=>t.kind==='text')||(p.tracks.push({id:'t_txt',kind:'text',clips:[]}),p.tracks[p.tracks.length-1]);})''')
        await P(pg, 'studio.save && studio.save()'); await pg.wait_for_timeout(1500)
        before = await clips_of(pg); old_id = await P(pg, 'studio.S.project.id'); oldm = await db_media(pg)
        ok(oldm['v'] == 1 and len(oldm['media']) == 2, f'old storage: DB v{oldm["v"]}, {len(oldm["media"])} files, project {old_id}')
        await pg.close()
        SERVE['dir'] = str(ROOT)
        pg = await ctx.new_page(); pg.errs = []
        pg.on('pageerror', lambda e: pg.errs.append(str(e))); pg.on('console', lambda m: m.type == 'error' and pg.errs.append(m.text))
        await pg.goto(f'http://127.0.0.1:{PORT}/'); await pg.wait_for_function('window.studio && studio.ready', timeout=20000); await pg.wait_for_timeout(800)
        after = await clips_of(pg)
        ok(await P(pg, 'studio.S.project.id') == old_id and [t for t in after if t['clips']] == [t for t in before if t['clips']], 'new app opens the old project with every clip unchanged')
        newm = await db_media(pg)
        ok(newm['v'] == 2 and 'hash' in newm['idx'], f'DB upgraded to v{newm["v"]} with a hash index {newm["idx"]}')
        ok(sorted((m['id'], m['sha']) for m in newm['media']) == sorted((m['id'], m['sha']) for m in oldm['media']) and sorted(m['sha'] for m in newm['media']) == sorted([fx['video.mp4'], fx['image.png']]), 'media byte-identical after the upgrade (SHA-256 == fixtures)')
        ok(await P(pg, 'studio.media.size') == 2 and await P(pg, '[...studio.media.values()].every(m=>m.url)'), 'media loaded for the editor')
        mig = await P(pg, '''(async()=>{const l=await studio.projects.listProjects();return {n:l.length,name:l[0]&&l[0].name,created:l[0]&&l[0].created}})()''')
        ok(mig['n'] == 1 and mig['name'] and mig['created'] > 0, f'one project in the list, named “{mig["name"]}”')
        await pg.wait_for_timeout(3000)   # background: hashes, thumbnail
        hashed = await db_media(pg); ok(all(m['hash'] == 's:' + m['sha'] for m in hashed['media']), 'old files got their content hash (for de-duplication)')
        await pg.reload(); await pg.wait_for_function('window.studio && studio.ready'); await pg.wait_for_timeout(500)
        ok(await clips_of(pg) == after and await P(pg, '(async()=>(await studio.projects.listProjects()).length)()') == 1, 'reload: migration runs once, nothing duplicated')

        # ---------------- project list ----------------
        log('== Project list')
        await P(pg, 'studio.makeThumb && studio.makeThumb(true)'); await pg.wait_for_timeout(800)
        await home(pg); c = await cards(pg)
        ok(len(c) == 1 and c[0]['img'] and '0:0' in c[0]['meta'] and ('ago' in c[0]['meta'] or 'just now' in c[0]['meta']), f'home: card with thumbnail, name, length, last edited {c}')
        await pg.click('#newProjBtn'); await pg.wait_for_selector('.newratio'); await shot(pg, 'b7-new-project-390.png', 300)
        await pg.click('.newratio .chipbtn[data-v="16:9"]'); await pg.click('#npAdd'); await pg.wait_for_function(f'studio.S.project.id!=="{old_id}" && !document.body.classList.contains("home-open")')
        p2 = await P(pg, 'studio.S.project.id'); ok(await P(pg, 'studio.S.project.aspect') == '16:9' and await P(pg, 'studio.S.project.tracks.flatMap(t=>t.clips).length') == 0, 'New project 16:9 opens empty')
        await add(pg, ['image.png', 'sharp.png'], 2)
        m2 = await db_media(pg); img_old = [m['id'] for m in newm['media'] if m['sha'] == fx['image.png']][0]
        ok(len(m2['media']) == 3, f'same photo in a second project is stored once ({len(m2["media"])} files for 4 clips)')
        ok(await P(pg, f'studio.S.project.tracks[0].clips[0].mediaId') == img_old, 'second project points at the existing file')
        await P(pg, 'studio.act(p=>{p.tracks[0].clips[0].dur=2})'); await pg.wait_for_timeout(200)
        await home(pg); c = await cards(pg); ok(len(c) == 2 and c[0]['id'] == p2, f'2 cards, last edited first {[x["name"] for x in c]}')
        ok(await P(pg, 'document.querySelector("#homeGrid .pcard").dataset.aspect') == '16:9', 'card shows the ratio')
        await shot(pg, 'b7-home-390.png', 600)
        # rename
        await more(pg, old_id, 'pmRename'); await pg.fill('#renameInput', 'Zebra trip'); await pg.click('#renameOk'); await pg.wait_for_timeout(500)
        await more(pg, p2, 'pmRename'); await pg.fill('#renameInput', 'Apple party'); await pg.click('#renameOk'); await pg.wait_for_timeout(500)
        c = await cards(pg); ok({x['name'] for x in c} == {'Zebra trip', 'Apple party'}, f'rename both {[x["name"] for x in c]}')
        ok(await P(pg, 'studio.S.project.name') == 'Apple party', 'renaming the open project updates it too')
        # sort / search
        await pg.click('#homeSort .chipbtn[data-v="name"]'); await pg.wait_for_timeout(400); c = await cards(pg); ok([x['name'] for x in c] == ['Apple party', 'Zebra trip'], 'sort by name')
        await pg.click('#homeSort .chipbtn[data-v="length"]'); await pg.wait_for_timeout(400); c = await cards(pg); ok([x['name'] for x in c] == ['Zebra trip', 'Apple party'], 'sort by length (longest first)')
        await pg.fill('#homeSearch', 'zeb'); await pg.wait_for_timeout(500); c = await cards(pg); ok([x['name'] for x in c] == ['Zebra trip'], 'search “zeb”')
        await pg.fill('#homeSearch', 'nothing here'); await pg.wait_for_timeout(500); ok(len(await cards(pg)) == 0 and 'No projects match' in await P(pg, 'document.querySelector("#homeGrid").textContent'), 'search without hits says so')
        await pg.fill('#homeSearch', ''); await pg.wait_for_timeout(400); await pg.click('#homeSort .chipbtn[data-v="edited"]'); await pg.wait_for_timeout(300)
        # duplicate
        await more(pg, old_id, 'pmDup'); await pg.wait_for_timeout(700); c = await cards(pg); dup = [x for x in c if x['name'] == 'Zebra trip copy']
        ok(len(c) == 3 and dup and dup[0]['img'], f'duplicate → “Zebra trip copy” with thumbnail {[x["name"] for x in c]}')
        dd = await P(pg, f'(async()=>{{const a=await studio.projects.getProject("{old_id}"),b=await studio.projects.getProject("{dup[0]["id"]}");return [JSON.stringify(a.tracks.map(t=>t.clips.map(c=>[c.type,c.mediaId,c.start,c.dur]))),JSON.stringify(b.tracks.map(t=>t.clips.map(c=>[c.type,c.mediaId,c.start,c.dur])))]}})()')
        ok(dd[0] == dd[1] and len((await db_media(pg))['media']) == 3, 'copy has the same clips and shares the files (no extra storage)')
        # open
        await pg.click(f'#homeGrid .pcard[data-id="{old_id}"] .pthumb'); await pg.wait_for_function(f'studio.S.project.id==="{old_id}" && !document.body.classList.contains("home-open")')
        ok(await P(pg, 'studio.S.project.tracks[0].clips.length') == 2 and await P(pg, 'studio.media.size') == 2, 'open: project + only its own media loaded')
        ok(await P(pg, 'document.querySelector("#tcur").textContent') == '00:00.0', 'time display reset on open')
        # templates make a NEW project
        await home(pg); n0 = len(await cards(pg)); await pg.click('#homeTemplates'); await pg.wait_for_selector('#sheet .tpl', timeout=10000)
        await pg.click('#sheet .tpl >> nth=0'); await pg.click('#tplUse'); await pg.wait_for_function('!document.body.classList.contains("home-open")', timeout=20000); await pg.wait_for_timeout(800)
        tp = await P(pg, 'studio.S.project.id'); ok(tp not in (old_id, p2, dup[0]['id']), 'template opens as a new project')
        ok(await P(pg, f'(async()=>(await studio.projects.getProject("{old_id}")).tracks[0].clips.length)()') == 2, 'other projects untouched by the template')
        t_disp = await P(pg, '[document.querySelector("#tcur").textContent, studio.player.t]'); ok(t_disp[0] == f'00:{t_disp[1]:04.1f}', f'time display matches the playhead after a template {t_disp}')
        await home(pg); ok(len(await cards(pg)) == n0 + 1, f'{n0 + 1} projects after the template')
        # delete: cancel then confirm
        pg.once('dialog', lambda d: asyncio.ensure_future(d.dismiss())); await more(pg, dup[0]['id'], 'pmDelete'); await pg.wait_for_timeout(500)
        ok(any(x['id'] == dup[0]['id'] for x in await cards(pg)), 'delete → Cancel keeps the project')
        await pg.click('.sh-done'); await pg.wait_for_timeout(200)
        msgs = []; pg.once('dialog', lambda d: (msgs.append(d.message), asyncio.ensure_future(d.accept()))); await more(pg, dup[0]['id'], 'pmDelete'); await pg.wait_for_timeout(900)
        ok(msgs and 'cannot be undone' in msgs[0] and not any(x['id'] == dup[0]['id'] for x in await cards(pg)), f'delete → confirm “{msgs[0][:40] if msgs else ""}…” removes it')
        ok({fx['video.mp4'], fx['image.png'], fx['sharp.png']} <= {m['sha'] for m in (await db_media(pg))['media']}, 'files still used by other projects are kept')
        # storage
        st = await P(pg, 'document.querySelector("#storeText").textContent'); ok('projects' in st and 'files' in st, f'storage line: {st}')
        await P(pg, 'navigator.storage.estimate=async()=>({usage:9.6e9,quota:10e9}); studio.home.render()'); await pg.wait_for_timeout(500)
        ok('almost full' in (await P(pg, 'document.querySelector("#storeWarn")?.textContent||""')), 'storage nearly full → warning'); await shot(pg, 'b7-home-storage-warn-390.png', 200)
        await P(pg, 'navigator.storage.estimate=async()=>({usage:7.5e9,quota:10e9}); studio.home.render()'); await pg.wait_for_timeout(400)
        ok('getting low' in (await P(pg, 'document.querySelector("#storeWarn")?.textContent||""')), 'storage low → softer warning')
        await P(pg, 'delete navigator.storage.estimate; studio.home.render()'); await pg.wait_for_timeout(400)
        asked = await P(pg, '(async()=>{const o=navigator.storage.persist.bind(navigator.storage);let n=0;navigator.storage.persist=async()=>{n++;return o()};const b=document.querySelector("#storePersist");if(b.tagName==="BUTTON"){b.click();await new Promise(r=>setTimeout(r,500))}return {n,tag:b.tagName,stored:localStorage.getItem("studio.persistAsked")}})()')
        ok(asked['tag'] != 'BUTTON' or asked['n'] == 1, f'“Keep my projects safe” asks navigator.storage.persist() {asked}')
        ok(await P(pg, 'localStorage.getItem("studio.persistAsked")') is not None, 'persistent storage was requested at start-up')

        # ---------------- backup / restore ----------------
        log('== Backup one project → delete → restore → back up again (byte-equal)')
        await home(pg)
        await more(pg, old_id, 'pmBackup'); await pg.wait_for_selector('#dlSave'); await shot(pg, 'b7-backup-ready-390.png', 300)
        f1, fn1 = await save_dl(pg, '#dlSave', 'b1.emmaproj'); lb = await P(pg, 'window.__lastBackup && {name:__lastBackup.name,files:__lastBackup.files,projects:__lastBackup.projects}')
        ok(fn1 == 'Zebra-trip.emmaproj' and lb['files'] == 2, f'backup file {fn1} ({f1.stat().st_size/1e6:.2f} MB, {lb})')
        z = zipfile.ZipFile(f1); names = z.namelist(); man = json.loads(z.read('emmaproj.json'))
        ok(z.testzip() is None and man['format'] == 'emmavengers-studio-backup' and man['version'] == 1 and [p['name'] for p in man['projects']] == ['Zebra trip'], f'valid zip, CRCs ok, manifest {names}')
        ok(sorted(h(z.read(m['file'])) for m in man['media']) == sorted([fx['video.mp4'], fx['image.png']]), 'media inside the backup == the original files (SHA-256)')
        pj = json.loads(z.read(f'projects/{old_id}.json')); ok(pj['name'] == 'Zebra trip' and len(pj['tracks'][0]['clips']) == 2, 'project timeline inside')
        await pg.click('.sh-done'); await pg.wait_for_timeout(200)
        pg.once('dialog', lambda d: asyncio.ensure_future(d.accept())); await more(pg, old_id, 'pmDelete'); await pg.wait_for_timeout(1200)
        m3 = await db_media(pg); ok(fx['video.mp4'] not in [m['sha'] for m in m3['media']], f'deleting the only project with the video frees the video ({len(m3["media"])} files left)')
        await pg.set_input_files('#homeFile', str(f1)); await pg.wait_for_function('window.__lastRestore', timeout=30000); await pg.wait_for_timeout(800)
        lr = await P(pg, 'window.__lastRestore'); ok(lr['ids'] == [old_id] and lr['files'] == 1 and lr['reused'] == 1, f'restore: same project id, 1 file added, 1 already here {lr}')
        c = await cards(pg); ok(any(x['id'] == old_id and x['name'] == 'Zebra trip' for x in c), 'restored project back in the list')
        m4 = await db_media(pg); ok(fx['video.mp4'] in [m['sha'] for m in m4['media']], 'video file restored byte-identical')
        await more(pg, old_id, 'pmBackup'); await pg.wait_for_selector('#dlSave'); f2, _ = await save_dl(pg, '#dlSave', 'b2.emmaproj'); await pg.click('.sh-done')
        ok(f1.read_bytes() == f2.read_bytes(), f'round trip: second backup is byte-identical ({h(f1.read_bytes())[:12]} == {h(f2.read_bytes())[:12]}, {f1.stat().st_size} bytes)')
        await pg.click(f'#homeGrid .pcard[data-id="{old_id}"] .pthumb'); await pg.wait_for_function(f'studio.S.project.id==="{old_id}"'); await pg.wait_for_timeout(800)
        ok([t for t in await clips_of(pg) if t['clips']] == [t for t in after if t['clips']], 'restored project opens with the same clips')
        ok(await P(pg, '[...studio.media.values()].every(m=>m.url&&(m.type!=="video"||m.duration>0))'), 'restored media plays (metadata read)')
        await home(pg)
        await pg.set_input_files('#homeFile', str(f1)); await pg.wait_for_function(f'window.__lastRestore && window.__lastRestore.ids[0]!=="{old_id}"', timeout=30000); await pg.wait_for_timeout(600)
        c = await cards(pg); ok(any(x['name'] == 'Zebra trip (restored)' for x in c) and len((await db_media(pg))['media']) == len(m4['media']), f'restoring next to the original → “Zebra trip (restored)”, no extra files')
        log('== Back up all → restore in a fresh browser')
        await pg.click('#homeBackupAll'); await pg.wait_for_selector('#dlSave'); fa, fna = await save_dl(pg, '#dlSave', 'all.emmaproj'); await pg.click('.sh-done')
        za = zipfile.ZipFile(fa); mana = json.loads(za.read('emmaproj.json')); allp = await P(pg, '(async()=>(await studio.projects.listProjects()).map(p=>p.name).sort())()')
        ok(mana['kind'] == 'all' and sorted(p['name'] for p in mana['projects']) == allp and za.testzip() is None, f'{fna}: {len(mana["projects"])} projects, {len(mana["media"])} files')
        await shot(pg, 'b7-home-final-390.png', 400)
        ok(not pg.errs, f'no console errors {pg.errs[:4]}')
        ctx2, pg2 = await new_page(b, '/?home'); await pg2.wait_for_selector('#home:not([hidden])')
        await pg2.set_input_files('#homeFile', str(fa)); await pg2.wait_for_function('window.__lastRestore', timeout=60000); await pg2.wait_for_timeout(800)
        names2 = await P(pg2, '(async()=>(await studio.projects.listProjects()).map(p=>p.name).sort())()')
        ok([n for n in names2 if n in allp] == allp, f'fresh browser: all projects restored {names2}')
        mm = await db_media(pg2); ok(sorted(m['sha'] for m in mm['media']) == sorted(h(za.read(m['file'])) for m in mana['media']), 'fresh browser: every file byte-identical')
        await shot(pg2, 'b7-restored-all-390.png', 500)
        ok(not pg2.errs, f'no console errors in the fresh browser {pg2.errs[:4]}')
        await b.close()
    shutil.rmtree(old, ignore_errors=True)
    log(f'RESULT: {"PASS" if not fails else "FAIL"} ({len(fails)} failures) in {time.time()-T0:.0f}s'); [log('   -', f_) for f_ in fails]
    sys.exit(1 if fails else 0)
asyncio.run(run())

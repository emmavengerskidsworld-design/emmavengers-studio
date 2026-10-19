"""Batch 12 sticker round 2 — our own designs (CC0, no AI):
 - word badges for kids creators (school, Bible & faith, feelings, holidays, sports, space, weather, animals), drawn by Studio's own text
   engine (js/render.js drawText + our text styles) in bundled fonts (Luckiest Guy Apache-2.0 / OFL fonts; output art is ours),
 - 3D letters A-Z and numbers 10-20 (same engine),
 - colour variants of our SVG shapes / stars / hearts.
Writes lib/stickers/art/<cat>/<id>.webp + tools/stickers/art2.json.   python3 tools/stickers/make_art2.py"""
import json, math, asyncio, base64, functools, http.server, threading, io, re
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / 'lib/stickers/art'
WORDS = {
 'kids-school': ['A+', 'Great job!', 'Well done!', 'Star student', 'Homework', 'Class time', "Let's learn!", 'Back to school', 'Spelling bee', 'Math time', 'Reading time', 'Recess!', 'Smart!', 'Quiz time', 'Gold star', 'You did it!', 'Keep going!', 'ABC', '123', 'Lesson 1'],
 'kids-bible': ['Amen', 'Hallelujah', 'Praise God', 'Jesus loves me', 'God is good', 'Pray', 'Blessed', 'Faith', 'Hope', 'Love', 'Joy', 'Peace', 'Grace', 'Psalm 23', 'John 3:16', 'Sunday school', 'Bible time', 'Thank you God', 'He is risen', 'Shine your light'],
 'kids-feelings': ['Happy', 'Sad', 'Wow!', 'Yay!', 'Oops!', 'Brave', 'Calm', 'Excited', 'Proud', 'Silly', 'Kind', 'Thank you', 'Sorry', 'Love you', 'Hello!', 'Bye bye!', 'Yes!', 'No!', 'Hmm...', 'LOL'],
 'kids-holidays': ['Merry Christmas', 'Happy Easter', 'Happy Birthday', 'Happy New Year', 'Ho ho ho!', 'Party time!', 'Celebrate!', 'Harvest', 'Gifts!', 'Happy holidays'],
 'kids-sports': ['Goal!', 'Score!', 'Winner!', 'Go team!', '1st place', 'Ready, set, go!', 'Champion', 'Game on!'],
 'kids-space': ['Blast off!', 'To the moon!', '3, 2, 1...', 'Space time', 'Zoom!', 'Out of this world'],
 'kids-weather': ['Sunny', 'Rainy', 'Snow day', 'Windy', 'Cloudy', 'Rainbow'],
 'kids-animals': ['Roar!', 'Moo!', 'Woof!', 'Meow!', 'Quack!', 'Oink!', 'Baa!', 'Hiss!'],
}
STY = ['emma3d', 'blue3d', 'red3d', 'green3d', 'purple3d', 'pink3d', 'orange3d', 'teal3d', 'sticker', 'stickerBlue', 'stickerPink', 'stickerPurple', 'labelYellow', 'scripture', 'party3d', 'rainbow3d']
CAT_STY = {'kids-bible': ['scripture', 'heavenly', 'gold3d', 'royal', 'stickerWhite', 'white3d'], 'kids-school': ['pencil', 'chalkboard', 'emma3d', 'blue3d', 'stickerYellow', 'labelYellow'],
           'kids-feelings': ['happy', 'pink3d', 'love', 'stickerPink', 'emma3d', 'wow'], 'kids-holidays': ['christmas', 'birthday', 'easter', 'gold3d', 'party3d'], 'kids-sports': ['sporty', 'trophy', 'team', 'red3d'],
           'kids-space': ['space', 'planet', 'rocket', 'neonCyan'], 'kids-weather': ['sunny', 'rainy', 'snowy', 'rainbow3d'], 'kids-animals': ['jungle', 'tiger', 'zebra', 'orange3d']}
FONTS = ['luckiestguy', 'luckiestguy', 'fredoka', 'titanone', 'bangers', 'lilitaone']
slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-') or 'x'
JOBS = []   # (id, cat, name, text, style, font, tags, anim)
for cat, words in WORDS.items():
    ss = CAT_STY[cat]
    for i, w in enumerate(words):
        for v in range(2):
            st = ss[(i + v * 3) % len(ss)]; fo = FONTS[(i + v) % len(FONTS)] if v else 'luckiestguy'
            JOBS.append((f'w-{slug(w)}-{v + 1}', cat, w + (' (2)' if v else ''), w, st, fo, [t for t in re.split(r'\W+', w.lower()) if t] + [cat.split('-')[1], 'word'], 'pop' if i % 5 == 0 and not v else None))
for i, ch in enumerate('ABCDEFGHIJKLMNOPQRSTUVWXYZ'):
    JOBS.append((f'letter3d-{ch.lower()}', 'abc', f'Letter {ch}', ch, STY[i % 8], 'luckiestguy', ['letter', 'abc', ch.lower(), 'alphabet'], 'hop' if i % 4 == 0 else None))
    JOBS.append((f'letterlc-{ch.lower()}', 'abc', f'Letter {ch.lower()}', ch.lower(), STY[(i + 3) % 8], 'fredoka', ['letter', 'abc', ch.lower(), 'alphabet', 'small'], None))
for n in range(10, 21):
    JOBS.append((f'num-{n}', 'numbers', f'Number {n}', str(n), STY[n % 8], 'luckiestguy', ['number', 'count', str(n), 'math'], 'hop' if n % 5 == 0 else None))
# SVG colour variants (same shapes as make_art.py, new colours) -----------------------------------------------------------
C = {'red': ('#ff6b6b', '#d91f3a', '#7a0a1a'), 'orange': ('#ffb347', '#ff7a00', '#7a3300'), 'yellow': ('#fff07a', '#ffc400', '#7a5200'), 'green': ('#8ef08a', '#22b04b', '#0b4d1e'),
     'blue': ('#8fd8ff', '#1f7bff', '#0b2a66'), 'purple': ('#d6a6ff', '#8a3ffc', '#2e0b5c'), 'pink': ('#ffb3d9', '#ff4fa3', '#6b0b3e'), 'teal': ('#9ff5e8', '#00b3a4', '#003d38'), 'mint': ('#d4ffe9', '#5ce0a0', '#0d5c46'), 'brown': ('#e8c39e', '#9c6233', '#2b1405'), 'navy': ('#c7d6ff', '#3354d1', '#060f3a')}
def svg(body, vb=256): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vb} {vb}" width="{vb}" height="{vb}">{body}</svg>'
def solid(path, col, sw=10):
    a, b, d = C[col]
    return svg(f'<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient><radialGradient id="h" cx=".35" cy=".25" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>'
               f'<g stroke-linejoin="round"><path fill-rule="evenodd" d="{path}" fill="{d}" transform="translate(0 9)"/><path fill-rule="evenodd" d="{path}" fill="url(#g)" stroke="{d}" stroke-width="{sw}"/><path fill-rule="evenodd" d="{path}" fill="url(#h)"/></g>')
def star_pts(cx, cy, n, r1, r2, rot=-90): return ' '.join(f'{cx + (r1 if i % 2 == 0 else r2) * math.cos(math.radians(rot + i * 180 / n)):.1f},{cy + (r1 if i % 2 == 0 else r2) * math.sin(math.radians(rot + i * 180 / n)):.1f}' for i in range(2 * n))
poly = lambda pts: 'M' + ' L'.join(pts.split()) + ' Z'
rpoly = lambda n, r=100, cx=128, cy=124, rot=-90: 'M' + ' L'.join(f'{cx + r * math.cos(math.radians(rot + i * 360 / n)):.1f},{cy + r * math.sin(math.radians(rot + i * 360 / n)):.1f}' for i in range(n)) + ' Z'
HEART = 'M128 222 C 60 170 18 130 18 84 C 18 50 44 26 76 26 C 100 26 118 40 128 60 C 138 40 156 26 180 26 C 212 26 238 50 238 84 C 238 130 196 170 128 222 Z'
CROSS = 'M108 14 H148 V74 H206 V114 H148 V242 H108 V114 H50 V74 H108 Z'
SHP = [('star', 'star', poly(star_pts(128, 132, 5, 116, 50)), 'stars'), ('heart', 'heart love', HEART, 'stars'), ('circle', 'circle', 'M128 18 A110 110 0 1 1 127.9 18 Z', 'shapes'),
       ('hexagon', 'hexagon', rpoly(6, 112, 128, 128, 0), 'shapes'), ('triangle', 'triangle', 'M128 18 L240 220 H16 Z', 'shapes'), ('diamond', 'diamond', 'M128 10 L238 128 L128 246 L18 128 Z', 'shapes'),
       ('cross', 'cross bible faith church', CROSS, 'kids-bible'), ('badge', 'badge award', poly(star_pts(128, 128, 18, 120, 104)), 'kids-school'), ('burst', 'burst wow', poly(star_pts(128, 128, 14, 120, 88)), 'stars')]
SVGS = []
for sid, tags, path, cat in SHP:
    for col in ['teal', 'mint', 'brown', 'navy', 'red', 'yellow'] if sid in ('cross', 'badge') else ['teal', 'mint', 'brown', 'navy']:
        SVGS.append((f'{sid}-{col}2', cat, f'{col.title()} {sid}', solid(path, col), tags.split() + [col]))
async def render():
    from playwright.async_api import async_playwright
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8805), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=srv.serve_forever, daemon=True).start()
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome'); pg = await b.new_page(); await pg.goto('http://127.0.0.1:8805/index.html'); await pg.wait_for_function('window.studio && studio.ready', timeout=30000)
        res = {}
        for id, cat, name, text, st, fo, tags, anim in JOBS:
            res[id] = await pg.evaluate("""async([t,sty,fo])=>{const ts=await import('./js/textstyles.js'),R=await import('./js/render.js'),pj=await import('./js/project.js'),F=await import('./js/fonts.js');await F.ensureFont(fo);
              const c=pj.newClip('text',{dur:3});c.text.content=t;c.text.size=t.length>12?110:t.length>6?150:t.length>2?220:330;ts.applyStyle(c.text,sty);c.text.font=fo;c.text.align='center';
              const W=t.length>2?900:460,H=t.length>2?520:460,cv=document.createElement('canvas');cv.width=W;cv.height=H;R.drawText(cv.getContext('2d'),W,H,c,{x:.5,y:.5,scale:1,rotation:0,opacity:1},0);return cv.toDataURL('image/png')}""", [text, st, fo])
        for id, cat, name, s, tags in SVGS:
            res[id] = await pg.evaluate("""async s=>{const im=new Image();im.src='data:image/svg+xml;base64,'+btoa(s);await im.decode();const c=document.createElement('canvas');c.width=c.height=320;c.getContext('2d').drawImage(im,0,0,320,320);return c.toDataURL('image/png')}""", s)
        await b.close(); srv.shutdown(); return res
res = asyncio.run(render()); out = []
def save(id, cat, name, data, tags, anim, maxw=360):
    im = Image.open(io.BytesIO(base64.b64decode(data.split(',')[1]))).convert('RGBA'); bb = im.getchannel('A').getbbox(); im = im.crop(bb) if bb else im
    if im.width > maxw: im = im.resize((maxw, max(1, round(im.height * maxw / im.width))), Image.LANCZOS)
    d = OUT / cat; d.mkdir(parents=True, exist_ok=True); f = d / (id + '.webp'); im.save(f, 'WEBP', quality=86, method=4)
    e = {'cat': cat, 'name': name, 'file': str(f.relative_to(ROOT / 'lib/stickers')), 'w': im.width, 'h': im.height, 'tags': tags, 'lic': 'own'}
    if anim: e['anim'] = anim
    out.append(e)
for id, cat, name, text, st, fo, tags, anim in JOBS: save(id, cat, name, res[id], tags, anim)
for id, cat, name, s, tags in SVGS: save(id, cat, name, res[id], tags, None, 256)
(Path(__file__).parent / 'art2.json').write_text(json.dumps(out, indent=1)); print('DONE', len(out))

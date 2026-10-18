"""Placeholder pictures for the kids project templates -> lib/templates/*.webp (720x1280).
   - Backgrounds: our own drawings (CC0), made here with plain PIL drawing (no AI).
   - Scene placeholders: Emmavengers art (© Cletus Emmanuel) copied read-only from the Emmavengers House game repo
     (/workspace/repos/emmavengers-house-game/img). Story pictures with a text banner are cropped above the banner and put
     on a soft blurred copy of themselves so they fill a 9:16 frame. The game repo is never written to."""
import math, random, json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter
ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / 'lib/templates'; OUT.mkdir(parents=True, exist_ok=True)
GAME = Path('/workspace/repos/emmavengers-house-game/img')
W, H, SS = 720, 1280, 2
def canvas(): return Image.new('RGB', (W * SS, H * SS)), (W * SS, H * SS)
def vgrad(im, top, bot):
    w, h = im.size; d = ImageDraw.Draw(im)
    for y in range(h):
        u = y / (h - 1); d.line([(0, y), (w, y)], fill=tuple(int(top[i] + (bot[i] - top[i]) * u) for i in range(3)))
def save(im, name, q=84):
    im = im.resize((W, H), Image.LANCZOS) if im.size != (W, H) else im
    im.save(OUT / (name + '.webp'), 'WEBP', quality=q, method=6); print('  ', name, (OUT / (name + '.webp')).stat().st_size // 1024, 'KB')
def cloud(d, x, y, s, col=(255, 255, 255)):
    for dx, dy, r in [(-1.1, .25, .55), (-.45, -.2, .75), (.35, -.35, .85), (1.05, .15, .6), (0, .3, .7)]:
        d.ellipse([x + (dx - r) * s, y + (dy - r) * s, x + (dx + r) * s, y + (dy + r) * s], fill=col)
def star(d, cx, cy, r, col, n=5, inner=.45, rot=-90):
    pts = [(cx + math.cos(math.radians(rot + i * 180 / n)) * (r if i % 2 == 0 else r * inner), cy + math.sin(math.radians(rot + i * 180 / n)) * (r if i % 2 == 0 else r * inner)) for i in range(2 * n)]
    d.polygon(pts, fill=col)

def bg_sky():
    im, (w, h) = canvas(); vgrad(im, (86, 170, 255), (200, 236, 255)); d = ImageDraw.Draw(im); random.seed(3)
    for x, y, s in [(.2, .12, 90), (.78, .22, 70), (.35, .42, 60), (.85, .55, 80), (.15, .7, 70), (.6, .85, 90)]: cloud(d, x * w, y * h, s * SS)
    save(im, 'bg-sky')
def bg_sunburst(c1=(255, 205, 40), c2=(255, 160, 20), name='bg-sunburst', centre=(.5, .42)):
    im, (w, h) = canvas(); d = ImageDraw.Draw(im); cx, cy = centre[0] * w, centre[1] * h; R = 3 * max(w, h); n = 24
    d.rectangle([0, 0, w, h], fill=c1)
    for i in range(n):
        if i % 2: continue
        a0, a1 = 2 * math.pi * i / n, 2 * math.pi * (i + 1) / n
        d.polygon([(cx, cy), (cx + R * math.cos(a0), cy + R * math.sin(a0)), (cx + R * math.cos(a1), cy + R * math.sin(a1))], fill=c2)
    glow = Image.new('L', im.size, 0); ImageDraw.Draw(glow).ellipse([cx - w * .45, cy - w * .45, cx + w * .45, cy + w * .45], fill=170)
    glow = glow.filter(ImageFilter.GaussianBlur(60 * SS)); im = Image.composite(Image.new('RGB', im.size, (255, 250, 220)), im, glow)
    save(im, name)
def bg_night():
    im, (w, h) = canvas(); vgrad(im, (14, 18, 64), (60, 40, 120)); d = ImageDraw.Draw(im); random.seed(7)
    for _ in range(140):
        x, y, r = random.random() * w, random.random() * h * .8, random.choice([1.5, 2, 2.5, 3.5]) * SS
        d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 250, 220))
    for _ in range(9): star(d, random.random() * w, random.random() * h * .7, random.uniform(12, 22) * SS, (255, 226, 120))
    d.ellipse([w * .62, h * .08, w * .62 + 170 * SS, h * .08 + 170 * SS], fill=(255, 240, 190)); d.ellipse([w * .62 + 55 * SS, h * .08 - 20 * SS, w * .62 + 225 * SS, h * .08 + 150 * SS], fill=(26, 26, 76))
    for i, col in enumerate([(40, 34, 96), (30, 26, 80)]):
        d.pieslice([-w * .4 + i * w * .5, h * (.78 + i * .04), w * (.9 + i * .5), h * (1.3 + i * .04)], 180, 360, fill=col)
    im = im.filter(ImageFilter.GaussianBlur(.6)); save(im, 'bg-night')
def bg_savanna():
    im, (w, h) = canvas(); vgrad(im, (255, 196, 110), (255, 238, 190)); d = ImageDraw.Draw(im)
    d.ellipse([w * .28, h * .2, w * .72, h * .2 + w * .44], fill=(255, 150, 60))
    d.polygon([(0, h * .62), (w * .3, h * .57), (w * .65, h * .6), (w, h * .56), (w, h), (0, h)], fill=(214, 170, 72))
    d.polygon([(0, h * .7), (w * .4, h * .66), (w, h * .69), (w, h), (0, h)], fill=(190, 150, 60))
    tx, ty = w * .78, h * .58; d.polygon([(tx - 10 * SS, ty), (tx + 10 * SS, ty), (tx + 5 * SS, ty - 150 * SS), (tx - 4 * SS, ty - 150 * SS)], fill=(92, 60, 30))
    d.ellipse([tx - 120 * SS, ty - 205 * SS, tx + 120 * SS, ty - 140 * SS], fill=(70, 110, 40)); d.ellipse([tx - 80 * SS, ty - 225 * SS, tx + 90 * SS, ty - 170 * SS], fill=(84, 128, 48))
    random.seed(5)
    for _ in range(80):
        x = random.random() * w; y = h * (.72 + random.random() * .28); d.line([(x, y), (x + random.uniform(-6, 6) * SS, y - random.uniform(14, 30) * SS)], fill=(160, 120, 40), width=3 * SS)
    save(im, 'bg-savanna')
def bg_stage():
    im, (w, h) = canvas(); vgrad(im, (60, 10, 60), (20, 0, 30)); d = ImageDraw.Draw(im)
    for side in (0, 1):
        for i in range(6):
            x0 = (i * w * .045) if side == 0 else w - (i + 1) * w * .045
            d.rectangle([x0, 0, x0 + w * .045, h], fill=(170 - i * 12, 20, 40) if i % 2 else (140 - i * 10, 14, 30))
    d.rectangle([0, 0, w, h * .07], fill=(150, 18, 36)); d.rectangle([0, h * .07, w, h * .085], fill=(230, 180, 40))
    sp = Image.new('L', im.size, 0); ImageDraw.Draw(sp).polygon([(w * .44, 0), (w * .56, 0), (w * .85, h * .8), (w * .15, h * .8)], fill=120); sp = sp.filter(ImageFilter.GaussianBlur(40 * SS))
    im = Image.composite(Image.new('RGB', im.size, (255, 236, 180)), im, sp); d = ImageDraw.Draw(im)
    d.ellipse([w * .12, h * .74, w * .88, h * .86], fill=(110, 60, 30)); save(im, 'bg-stage')
def bg_pastel():
    im, (w, h) = canvas(); vgrad(im, (255, 214, 236), (210, 220, 255)); d = ImageDraw.Draw(im); random.seed(11)
    cols = [(255, 255, 255), (255, 240, 160), (190, 240, 220), (255, 190, 220), (200, 200, 255)]
    for _ in range(70):
        x, y, r = random.random() * w, random.random() * h, random.uniform(6, 16) * SS; d.ellipse([x - r, y - r, x + r, y + r], fill=random.choice(cols))
    save(im, 'bg-pastel')
def bg_chalk():
    im, (w, h) = canvas(); vgrad(im, (36, 82, 62), (26, 64, 48)); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w, h], outline=(160, 110, 60), width=34 * SS); random.seed(2)
    for _ in range(400):
        x, y = random.random() * w, random.random() * h; d.point((x, y), fill=(70, 120, 96))
    im = im.filter(ImageFilter.GaussianBlur(1.2)); save(im, 'bg-chalk')
def bg_rainbow():
    im, (w, h) = canvas(); vgrad(im, (120, 200, 255), (225, 245, 255)); d = ImageDraw.Draw(im)
    cols = [(255, 70, 70), (255, 150, 40), (255, 220, 50), (80, 200, 90), (60, 150, 255), (150, 90, 230)]; cx, cy, r0 = w / 2, h * .62, w * .62
    for i, c in enumerate(cols): r = r0 - i * 34 * SS; d.pieslice([cx - r, cy - r, cx + r, cy + r], 180, 360, fill=c)
    r = r0 - 6 * 34 * SS; d.pieslice([cx - r, cy - r, cx + r, cy + r], 180, 360, fill=(170, 225, 255))
    cloud(d, w * .16, cy, 110 * SS); cloud(d, w * .84, cy, 110 * SS)
    d.rectangle([0, cy + 40 * SS, w, h], fill=(120, 210, 110)); save(im, 'bg-rainbow')

def scene(src, name, crop=(0, 0, 1, 1), focus=.5):
    """Game picture -> 9:16: crop (fractions), sharp copy centred on a blurred, darkened fill of itself."""
    im = Image.open(src).convert('RGB'); iw, ih = im.size; im = im.crop((int(crop[0] * iw), int(crop[1] * ih), int(crop[2] * iw), int(crop[3] * ih)))
    iw, ih = im.size; k = max(W / iw, H / ih); bg = im.resize((math.ceil(iw * k), math.ceil(ih * k)), Image.LANCZOS)
    bg = bg.crop(((bg.width - W) // 2, (bg.height - H) // 2, (bg.width - W) // 2 + W, (bg.height - H) // 2 + H)).filter(ImageFilter.GaussianBlur(28))
    bg = Image.blend(bg, Image.new('RGB', bg.size, (0, 0, 0)), .18)
    fh = round(H * .6); fg = im.resize((round(iw * fh / ih), fh), Image.LANCZOS)
    if fg.width > W: x = int(max(0, min(fg.width - W, focus * fg.width - W / 2))); fg = fg.crop((x, 0, x + W, fh))
    mask = Image.new('L', fg.size, 255)
    md = ImageDraw.Draw(mask); f = 18
    for i in range(f): md.rectangle([0, i, fg.width, i], fill=int(255 * i / f)); md.rectangle([0, fg.height - 1 - i, fg.width, fg.height - 1 - i], fill=int(255 * i / f))
    bg.paste(fg, ((W - fg.width) // 2, (H - fg.height) // 2), mask); save(bg, name)
def photo(src, name, focus=.5, border=0):
    """Clean game scene (no text) -> 9:16 cover crop around focus x (border = frame to trim, fraction)."""
    im = Image.open(src).convert('RGB'); iw, ih = im.size
    if border: im = im.crop((int(iw * border), int(ih * border), int(iw * (1 - border)), int(ih * (1 - border)))); iw, ih = im.size
    k = H / ih; im = im.resize((round(iw * k), H), Image.LANCZOS)
    x = int(max(0, min(im.width - W, focus * im.width - W / 2))); save(im.crop((x, 0, x + W, H)), name)

# ---- Batch 9: more own backgrounds (CC0, plain PIL drawing) ----
def confetti(d, w, h, n, seed, cols, big=1):
    random.seed(seed)
    for _ in range(n):
        x, y, r = random.random() * w, random.random() * h, random.uniform(5, 13) * SS * big; a = random.random() * math.pi
        c = random.choice(cols); d.polygon([(x + math.cos(a) * r, y + math.sin(a) * r * .5), (x - math.sin(a) * r * .5, y + math.cos(a) * r), (x - math.cos(a) * r, y - math.sin(a) * r * .5), (x + math.sin(a) * r * .5, y - math.cos(a) * r)], fill=c)
def balloon(d, x, y, s, col):
    d.line([(x, y + s * 1.2), (x + s * .2, y + s * 3.2)], fill=(250, 250, 250), width=2 * SS)
    d.ellipse([x - s, y - s * 1.2, x + s, y + s * 1.2], fill=col); d.polygon([(x - s * .15, y + s * 1.25), (x + s * .15, y + s * 1.25), (x, y + s * 1.1)], fill=col)
    d.ellipse([x - s * .55, y - s * .8, x - s * .2, y - s * .3], fill=tuple(min(255, c + 70) for c in col))
PARTY = [(255, 90, 120), (255, 200, 40), (70, 180, 255), (120, 220, 110), (190, 110, 255), (255, 140, 40)]
def bg_party():
    im, (w, h) = canvas(); vgrad(im, (255, 120, 170), (255, 200, 120)); d = ImageDraw.Draw(im); confetti(d, w, h, 160, 21, PARTY + [(255, 255, 255)])
    random.seed(4)
    for i, (x, y) in enumerate([(.12, .2), (.86, .16), (.18, .82), (.82, .78), (.5, .9)]): balloon(d, x * w, y * h, 70 * SS, PARTY[i])
    save(im, 'bg-party')
def bg_christmas():
    im, (w, h) = canvas(); vgrad(im, (12, 70, 52), (6, 36, 30)); d = ImageDraw.Draw(im); random.seed(25)
    for _ in range(170):
        x, y, r = random.random() * w, random.random() * h, random.uniform(2, 7) * SS; d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255))
    for k in range(9):  # ribbon of baubles along the top
        x = w * (k + .5) / 9; y = h * .05 + math.sin(k * 1.3) * 40 * SS; d.line([(x, 0), (x, y)], fill=(230, 200, 90), width=3 * SS)
        d.ellipse([x - 34 * SS, y, x + 34 * SS, y + 68 * SS], fill=[(220, 40, 50), (240, 200, 60), (60, 140, 230)][k % 3])
    d.rectangle([0, h * .9, w, h], fill=(240, 248, 255)); im = im.filter(ImageFilter.GaussianBlur(.5)); save(im, 'bg-christmas')
def bg_easter():
    im, (w, h) = canvas(); vgrad(im, (200, 236, 255), (255, 246, 210)); d = ImageDraw.Draw(im)
    d.pieslice([-w * .3, h * .7, w * 1.3, h * 1.4], 180, 360, fill=(150, 220, 120)); random.seed(8)
    for i in range(7):
        x = w * (.08 + i * .14); y = h * (.8 + (i % 2) * .05); c = [(255, 170, 200), (180, 160, 255), (255, 220, 120), (140, 220, 230)][i % 4]
        d.ellipse([x - 40 * SS, y - 55 * SS, x + 40 * SS, y + 55 * SS], fill=c)
        for j in range(3): d.line([(x - 36 * SS, y - 20 * SS + j * 22 * SS), (x + 36 * SS, y - 20 * SS + j * 22 * SS)], fill=(255, 255, 255), width=6 * SS)
    for x, y, s in [(.2, .12, 70), (.75, .2, 60)]: cloud(d, x * w, y * h, s * SS)
    d.ellipse([w * .62, h * .3, w * .62 + 150 * SS, h * .3 + 150 * SS], fill=(255, 226, 120)); save(im, 'bg-easter')
def firework(d, cx, cy, r, col, n=18):
    for i in range(n):
        a = 2 * math.pi * i / n; d.line([(cx + math.cos(a) * r * .25, cy + math.sin(a) * r * .25), (cx + math.cos(a) * r, cy + math.sin(a) * r)], fill=col, width=5 * SS)
        d.ellipse([cx + math.cos(a) * r - 7 * SS, cy + math.sin(a) * r - 7 * SS, cx + math.cos(a) * r + 7 * SS, cy + math.sin(a) * r + 7 * SS], fill=col)
def bg_newyear():
    im, (w, h) = canvas(); vgrad(im, (10, 10, 40), (50, 20, 80)); d = ImageDraw.Draw(im)
    for (x, y, r, c) in [(.25, .2, 150, (255, 200, 60)), (.75, .3, 120, (255, 90, 160)), (.5, .1, 90, (90, 200, 255)), (.2, .55, 90, (140, 255, 140)), (.8, .62, 140, (200, 140, 255))]: firework(d, x * w, y * h, r * SS, c)
    for i in range(14): x = w * i / 13; d.rectangle([x - 18 * SS, h * (.86 - (i % 3) * .03), x + 22 * SS, h], fill=(20, 16, 50))
    im = im.filter(ImageFilter.GaussianBlur(.8)); save(im, 'bg-newyear')
def bg_notebook():
    im, (w, h) = canvas(); d = ImageDraw.Draw(im); d.rectangle([0, 0, w, h], fill=(252, 250, 240))
    for y in range(int(h * .1), h, 56 * SS): d.line([(0, y), (w, y)], fill=(170, 200, 240), width=3 * SS)
    d.line([(w * .14, 0), (w * .14, h)], fill=(240, 120, 120), width=4 * SS)
    for y in range(int(h * .08), h, int(h * .12)): d.ellipse([w * .04, y, w * .04 + 34 * SS, y + 34 * SS], fill=(220, 220, 220))
    save(im, 'bg-notebook')
def bg_space():
    im, (w, h) = canvas(); vgrad(im, (6, 6, 30), (30, 10, 60)); d = ImageDraw.Draw(im); random.seed(31)
    for _ in range(260):
        x, y, r = random.random() * w, random.random() * h, random.choice([1, 1.5, 2, 3]) * SS; d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 255, 255))
    d.ellipse([w * .55, h * .62, w * 1.15, h * .62 + w * .6], fill=(255, 140, 70)); d.ellipse([w * .62, h * .66, w * 1.1, h * .66 + w * .2], fill=(255, 175, 110))
    d.ellipse([w * .06, h * .1, w * .3, h * .1 + w * .24], fill=(110, 170, 255)); d.arc([w * -.02, h * .15, w * .38, h * .15 + w * .14], 0, 360, fill=(200, 220, 255), width=6 * SS)
    save(im, 'bg-space')
def bg_comic():
    im, (w, h) = canvas(); d = ImageDraw.Draw(im); d.rectangle([0, 0, w, h], fill=(255, 220, 40))
    for y in range(0, h, 40 * SS):
        for x in range(0 if (y // (40 * SS)) % 2 == 0 else 20 * SS, w, 40 * SS): r = 7 * SS + 6 * SS * y / h; d.ellipse([x - r, y - r, x + r, y + r], fill=(255, 150, 30))
    cx, cy = w / 2, h * .42
    for i in range(32):
        if i % 2: continue
        a0, a1 = 2 * math.pi * i / 32, 2 * math.pi * (i + 1) / 32; d.polygon([(cx, cy), (cx + 3 * w * math.cos(a0), cy + 3 * w * math.sin(a0)), (cx + 3 * w * math.cos(a1), cy + 3 * w * math.sin(a1))], fill=(255, 255, 255, 0) if False else (255, 236, 120))
    d.rectangle([0, 0, w, h], outline=(20, 20, 20), width=24 * SS); save(im, 'bg-comic')
def bg_cinema():
    im, (w, h) = canvas(); vgrad(im, (20, 24, 40), (4, 4, 10)); d = ImageDraw.Draw(im)
    sp = Image.new('L', im.size, 0); sd = ImageDraw.Draw(sp)
    for x0 in (.2, .5, .8): sd.polygon([(w * x0 - 20 * SS, h), (w * x0 + 20 * SS, h), (w * (x0 + (x0 - .5) * .8) + 160 * SS, 0), (w * (x0 + (x0 - .5) * .8) - 160 * SS, 0)], fill=70)
    sp = sp.filter(ImageFilter.GaussianBlur(30 * SS)); im = Image.composite(Image.new('RGB', im.size, (120, 170, 255)), im, sp); d = ImageDraw.Draw(im)
    d.rectangle([0, 0, w, h * .1], fill=(0, 0, 0)); d.rectangle([0, h * .9, w, h], fill=(0, 0, 0)); save(im, 'bg-cinema')
def bg_paper():
    im, (w, h) = canvas(); vgrad(im, (246, 230, 196), (230, 204, 158)); d = ImageDraw.Draw(im); random.seed(13)
    for _ in range(900): x, y = random.random() * w, random.random() * h; d.point((x, y), fill=(214, 186, 140))
    d.rectangle([w * .05, h * .04, w * .95, h * .96], outline=(160, 110, 60), width=8 * SS); d.rectangle([w * .07, h * .055, w * .93, h * .945], outline=(200, 150, 80), width=3 * SS)
    for cx, cy in [(.07, .055), (.93, .055), (.07, .945), (.93, .945)]: star(d, cx * w, cy * h, 30 * SS, (200, 140, 50), 4, .35, 45)
    im = im.filter(ImageFilter.GaussianBlur(.7)); save(im, 'bg-paper')
def bg_dawn():
    im, (w, h) = canvas(); vgrad(im, (120, 160, 240), (255, 196, 150)); d = ImageDraw.Draw(im)
    glow = Image.new('L', im.size, 0); ImageDraw.Draw(glow).ellipse([w * .1, h * .5, w * .9, h * .5 + w * .8], fill=200); glow = glow.filter(ImageFilter.GaussianBlur(70 * SS))
    im = Image.composite(Image.new('RGB', im.size, (255, 236, 170)), im, glow); d = ImageDraw.Draw(im)
    d.ellipse([w * .35, h * .62, w * .65, h * .62 + w * .3], fill=(255, 220, 110))
    d.polygon([(0, h * .72), (w * .3, h * .68), (w * .6, h * .73), (w, h * .69), (w, h), (0, h)], fill=(110, 170, 100)); d.polygon([(0, h * .8), (w * .5, h * .76), (w, h * .8), (w, h), (0, h)], fill=(90, 150, 84))
    for x, y, s in [(.2, .2, 60), (.8, .3, 50)]: cloud(d, x * w, y * h, s * SS, (255, 240, 236))
    save(im, 'bg-dawn')
def bg_quiz():
    im, (w, h) = canvas(); vgrad(im, (40, 90, 220), (120, 60, 220)); d = ImageDraw.Draw(im); random.seed(17)
    for _ in range(26):
        x, y, s = random.random() * w, random.random() * h, random.uniform(30, 70) * SS
        d.arc([x - s, y - s, x + s, y + s * .6], 200, 20, fill=(150, 170, 255), width=int(s * .28)); d.ellipse([x - s * .16, y + s * 1.05, x + s * .16, y + s * 1.37], fill=(150, 170, 255))
    save(im, 'bg-quiz')
def bg_neon():
    im, (w, h) = canvas(); vgrad(im, (20, 0, 50), (90, 0, 90)); d = ImageDraw.Draw(im); hz = h * .55
    d.ellipse([w * .2, hz - w * .55, w * .8, hz + w * .05], fill=(255, 120, 60)); d.rectangle([0, hz, w, h], fill=(25, 0, 45))
    for i in range(6): y = hz - w * .25 + i * 34 * SS; d.rectangle([0, y, w, y + 12 * SS], fill=(20, 0, 50) if i else (25, 0, 45))
    for i in range(14): y = hz + (h - hz) * (i / 13) ** 1.8; d.line([(0, y), (w, y)], fill=(255, 60, 200), width=3 * SS)
    for i in range(-10, 11): d.line([(w / 2 + i * 30 * SS, hz), (w / 2 + i * 180 * SS, h)], fill=(255, 60, 200), width=3 * SS)
    save(im, 'bg-neon')
def bg_split():
    im, (w, h) = canvas(); d = ImageDraw.Draw(im); d.rectangle([0, 0, w, h / 2], fill=(150, 160, 180)); d.rectangle([0, h / 2, w, h], fill=(255, 200, 70))
    save(im, 'bg-split')
def land(src, name, top=.13):
    im = Image.open(src).convert('RGB'); iw, ih = im.size; im = im.crop((0, int(ih * top), iw, ih)); iw, ih = im.size
    k = max(W / iw, H / ih); im = im.resize((math.ceil(iw * k), math.ceil(ih * k)), Image.LANCZOS); x, y = (im.width - W) // 2, (im.height - H) // 2; save(im.crop((x, y, x + W, y + H)), name)
STORIES = {'creation': (1, 3, 6), 'adam-and-eve': (1, 4, 7), 'cain-and-abel': (1, 3, 6), 'abraham': (1, 4, 7), 'abraham-and-isaac': (1, 4, 7), 'jacob-and-esau': (1, 3, 6),
           'joseph-coat': (1, 4, 7), 'joseph-in-egypt': (1, 4, 7), 'joseph-forgives': (1, 4, 7), 'tower-of-babel': (1, 4, 7)}
def batch9():
    print('batch 9 backgrounds'); bg_party(); bg_christmas(); bg_easter(); bg_newyear(); bg_notebook(); bg_space(); bg_comic(); bg_cinema(); bg_paper(); bg_dawn(); bg_quiz(); bg_neon(); bg_split()
    bg_sunburst((90, 200, 255), (50, 160, 240), 'bg-blueburst'); bg_sunburst((255, 110, 140), (240, 70, 110), 'bg-pinkburst'); bg_sunburst((120, 220, 110), (70, 180, 80), 'bg-greenburst')
    print('Bible story pictures (game art, read only)'); cut = (.015, .015, .985, .64)
    for s, pages in STORIES.items():
        for i, n in enumerate(pages): scene(GAME / f'bible/{s}/p{n:02d}.jpg', f'{s}-{i + 1}', cut, .5)
    for n in ['bath', 'dress', 'makebed', 'greet', 'clean', 'day', 'champion']: photo(GAME / f'morning/{n}.jpg', 'day-' + n, .5)
    for n in ['letter', 'number', 'faith', 'nature', 'world']: land(GAME / f'world/{n}-land.jpg', 'land-' + n)

if __name__ == '__main__':
    import sys
    if 'batch9' in sys.argv: batch9(); files = sorted(p.name for p in OUT.glob('*.webp')); json.dump({'files': files}, open(OUT / 'assets.json', 'w'), indent=1); print(len(files), 'files'); sys.exit()
    print('backgrounds (own drawings, CC0)')
    bg_sky(); bg_sunburst(); bg_sunburst((120, 90, 230), (90, 60, 200), 'bg-purpleburst'); bg_night(); bg_savanna(); bg_stage(); bg_pastel(); bg_chalk(); bg_rainbow()
    print('Emmavengers scenes (copied from the game, read only)')
    B = GAME / 'bible/noah'; cut = (.015, .015, .985, .64)
    scene(B / 'p01.jpg', 'noah-1', cut, .38); scene(B / 'p03.jpg', 'noah-2', cut, .55); scene(B / 'p05.jpg', 'noah-3', cut, .53)
    photo(GAME / 'p01.jpg', 'quiz-cup', .5, .03)
    for n, fx in [('wake', .5), ('brush', .5), ('breakfast', .5), ('pray', .5)]: photo(GAME / f'morning/{n}.jpg', 'day-' + n, fx)
    batch9()
    files = sorted(p.name for p in OUT.glob('*.webp')); json.dump({'files': files}, open(OUT / 'assets.json', 'w'), indent=1)
    print(len(files), 'files,', sum((OUT / f).stat().st_size for f in files) // 1024, 'KB')

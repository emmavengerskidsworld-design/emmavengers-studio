"""Emmavengers World logo (our own design, drawn here with PIL) -> lib/templates/emma-logo.webp (transparent)
   and the outro background lib/templates/bg-outro.webp. Font: Luckiest Guy (SIL OFL, bundled in lib/fonts)."""
import io, math
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont, ImageFilter
from fontTools.ttLib import TTFont
ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / 'lib/templates'
def font(name, size):
    f = TTFont(ROOT / f'lib/fonts/{name}.woff2'); f.flavor = None; b = io.BytesIO(); f.save(b); b.seek(0); return ImageFont.truetype(b, size)
def star(d, cx, cy, r, col, inner=.45, rot=-90):
    d.polygon([(cx + math.cos(math.radians(rot + i * 36)) * (r if i % 2 == 0 else r * inner), cy + math.sin(math.radians(rot + i * 36)) * (r if i % 2 == 0 else r * inner)) for i in range(10)], fill=col)
def text_c(d, cx, y, s, f, fill, stroke, sw):
    w = d.textlength(s, font=f); d.text((cx - w / 2, y), s, font=f, fill=fill, stroke_width=sw, stroke_fill=stroke)
def logo():
    SS = 2; W, H = 1000 * SS, 640 * SS; im = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(im)
    # badge: a gold circle with a play triangle and a ring of stars (film / video + kids' stars)
    cx, cy, R = W / 2, 215 * SS, 175 * SS
    sh = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(sh).ellipse([cx - R, cy - R + 14 * SS, cx + R, cy + R + 14 * SS], fill=(20, 10, 60, 140)); im.alpha_composite(sh.filter(ImageFilter.GaussianBlur(12 * SS)))
    d.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(255, 196, 30), outline=(255, 255, 255), width=12 * SS)
    d.ellipse([cx - R * .78, cy - R * .78, cx + R * .78, cy + R * .78], fill=(255, 220, 70))
    t = R * .42; d.polygon([(cx - t * .7, cy - t), (cx - t * .7, cy + t), (cx + t * 1.05, cy)], fill=(122, 48, 200))
    for i in range(8):
        a = math.radians(-90 + i * 45); star(d, cx + math.cos(a) * R * .9, cy + math.sin(a) * R * .9, 16 * SS, (255, 255, 255))
    # wordmark
    f1, f2 = font('luckiestguy', 150 * SS), font('luckiestguy', 92 * SS)
    text_c(d, cx, 395 * SS, 'EMMAVENGERS', f1, (255, 214, 40), (90, 30, 160), 12 * SS)
    # ribbon "WORLD"
    rw, ry = 330 * SS, 545 * SS; d.rounded_rectangle([cx - rw, ry - 8 * SS, cx + rw, ry + 92 * SS], 46 * SS, fill=(40, 150, 255), outline=(255, 255, 255), width=8 * SS)
    text_c(d, cx, ry + 2 * SS, 'WORLD', f2, (255, 255, 255), (20, 70, 160), 6 * SS)
    star(d, cx - rw + 60 * SS, ry + 42 * SS, 26 * SS, (255, 214, 40)); star(d, cx + rw - 60 * SS, ry + 42 * SS, 26 * SS, (255, 214, 40))
    im = im.resize((W // SS, H // SS), Image.LANCZOS); im.save(OUT / 'emma-logo.webp', 'WEBP', quality=90, method=6, lossless=False)
def outro_bg():
    W, H = 720, 1280; im = Image.new('RGB', (W * 2, H * 2)); d = ImageDraw.Draw(im); w, h = im.size
    for y in range(h):
        u = y / (h - 1); d.line([(0, y), (w, y)], fill=(int(70 + 40 * u), int(30 + 20 * u), int(150 + 60 * u)))
    cx, cy, Rr = w / 2, h * .42, 3 * h
    for i in range(0, 28, 2):
        a0, a1 = 2 * math.pi * i / 28, 2 * math.pi * (i + 1) / 28
        d.polygon([(cx, cy), (cx + Rr * math.cos(a0), cy + Rr * math.sin(a0)), (cx + Rr * math.cos(a1), cy + Rr * math.sin(a1))], fill=(110, 50, 200))
    import random; random.seed(11)
    for _ in range(60): star(d, random.random() * w, random.random() * h, random.uniform(6, 16) * 2, (255, 230, 120))
    im = im.filter(ImageFilter.GaussianBlur(1)).resize((W, H), Image.LANCZOS); im.save(OUT / 'bg-outro.webp', 'WEBP', quality=84, method=6)
if __name__ == '__main__':
    logo(); outro_bg(); print('ok')

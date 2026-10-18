"""Builds the HD Enhance test fixtures (deterministic):
   sharp.png    1080x1920 reference: cartoon art with outlines, text, real photo detail (scikit-image sample photos at
                native size), fine stripes, skin tones, gradients
   low.png      sharp.png downscaled to 480x854 (area filter) — what a soft low-res phone clip looks like
   lownoisy.png low.png + sensor-like noise (sigma 5)
   lowvid.mp4   2 s 480x854 H.264 video of low.png (high quality, BT.709 tagged)"""
import subprocess, numpy as np, cv2
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
from skimage import data
F = Path(__file__).parent / 'fixtures'
W, H = 1080, 1920
rng = np.random.default_rng(7)
im = Image.new('RGB', (W, H)); d = ImageDraw.Draw(im)
for y in range(H // 3):   # sky gradient
    t = y / (H / 3); d.line([(0, y), (W, y)], fill=(int(90 + 80 * t), int(170 + 50 * t), 255))
d.rectangle([0, H // 3, W, H], fill=(250, 244, 228))
# cartoon sun + character with thick black outlines
d.ellipse([760, 60, 1000, 300], fill=(255, 204, 51), outline=(0, 0, 0), width=8)
d.ellipse([120, 120, 420, 420], fill=(246, 205, 170), outline=(20, 20, 20), width=7)       # face (skin)
d.ellipse([200, 220, 240, 260], fill=(30, 30, 30)); d.ellipse([300, 220, 340, 260], fill=(30, 30, 30))
d.arc([200, 260, 340, 360], 20, 160, fill=(150, 40, 40), width=7)
d.polygon([(440, 560), (620, 380), (800, 560)], fill=(61, 220, 132), outline=(0, 0, 0))
try: font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 84); small = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 30)
except Exception: font = small = ImageFont.load_default()
d.text((60, 600), 'Jesus loves me!', font=font, fill=(255, 77, 77), stroke_width=5, stroke_fill=(0, 0, 0))
d.text((60, 720), 'For God so loved the world (John 3:16) — small text test', font=small, fill=(20, 20, 40))
# real photo detail at native resolution (sharp)
ph = [data.astronaut(), data.chelsea(), data.coffee()]
im.paste(Image.fromarray(ph[0]).resize((540, 540), Image.LANCZOS), (0, 780))
im.paste(Image.fromarray(ph[1]), (560, 800))
im.paste(Image.fromarray(ph[2]).resize((500, 375), Image.LANCZOS), (560, 1120))
bricks = np.stack([data.brick()] * 3, -1)[:420, :540]; im.paste(Image.fromarray(bricks), (0, 1340))
# fine stripes + zone plate
z = np.zeros((420, 500)); yy, xx = np.mgrid[0:420, 0:500]; z = 0.5 + 0.5 * np.cos(((xx - 250) ** 2 + (yy - 210) ** 2) / 900.0)
im.paste(Image.fromarray(np.stack([(z * 255).astype(np.uint8)] * 3, -1)), (560, 1500))
im.save(F / 'sharp.png')
a = cv2.resize(np.array(im), (480, 854), interpolation=cv2.INTER_AREA); Image.fromarray(a).save(F / 'low.png')
n = np.clip(a.astype(np.float32) + rng.normal(0, 5, a.shape), 0, 255).astype(np.uint8); Image.fromarray(n).save(F / 'lownoisy.png')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-loop', '1', '-i', str(F / 'low.png'), '-t', '2', '-r', '30',
  '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-crf', '12', '-preset', 'slow',
  '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv', '-movflags', '+faststart', str(F / 'lowvid.mp4')], check=True)
print('ok')

"""Emmavengers sticker pack from the Emmavengers World game art (READ ONLY: /workspace/repos/emmavengers-house-game/img).
- house items (100 3D scene pictures p??.jpg without text, 4 rooms): background removed offline with rembg (u2net),
  largest object kept, trimmed; cutouts that touch 3+ picture edges (object is the room itself) are skipped
- letters, counting objects, animals, flags, African food, places, prayer characters: already transparent (.webp) -> copied
- writes lib/stickers/emma/<cat>/<name>.webp (max 384 px) + tools/stickers/emma.json (used by build_library.py)
python3 tools/stickers/build_emma.py   (nohup; ~5-10 min on CPU)"""
import json, subprocess, re, sys, io
from pathlib import Path
from PIL import Image
GAME = Path('/workspace/repos/emmavengers-house-game/img'); ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'lib/stickers/emma'; OUT.mkdir(parents=True, exist_ok=True)
slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
def save(im, cat, name, max_side=384):
    im = im.convert('RGBA'); bb = im.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    if bb: im = im.crop(bb)
    im.thumbnail((max_side, max_side), Image.LANCZOS)
    d = OUT / cat; d.mkdir(exist_ok=True); p = d / (slug(name) + '.webp'); im.save(p, 'WEBP', quality=88, method=6)
    return {'cat': cat, 'name': name, 'file': str(p.relative_to(ROOT / 'lib/stickers')), 'w': im.width, 'h': im.height}
items = json.loads(subprocess.run(['node', str(Path(__file__).parent / 'game_items.js')], capture_output=True, text=True, check=True).stdout)
out = []
for sub, cat in (('letters', 'letters'), ('numbers', 'counting'), ('animals', 'animals'), ('countries', 'flags'), ('places', 'places'), ('prayers', 'characters')):
    for f in sorted((GAME / 'world' / sub).glob('*.webp')):
        name = f.stem.replace('-', ' '); c = cat
        if sub == 'countries': c = 'flags' if f.stem.endswith('flag') else 'food'
        if sub == 'letters': name = 'Letter ' + f.stem.upper()
        out.append(save(Image.open(f), c, name)); print('copied', c, name, flush=True)
from rembg import remove, new_session
import numpy as np
from scipy import ndimage
sess = new_session('u2net')
EXCLUDE = {'blinds', 'fork', 'knife', 'whisk', 'oven mitt'}   # checked by eye: rembg picked the wrong object
for it in items:
    if it['name'] in EXCLUDE: continue
    src = GAME / (it['prefix'] + 'p' + it['id'] + '.jpg')
    if not src.exists(): continue
    cut = remove(Image.open(src).convert('RGB'), session=sess, post_process_mask=True); arr = np.array(cut); a = arr[:, :, 3] > 128
    lab, n = ndimage.label(a)
    if not n: print('skip (empty)', it['name'], flush=True); continue
    k = int(np.argmax(ndimage.sum(a, lab, range(1, n + 1)))) + 1; m = lab == k
    arr[:, :, 3] = np.where(ndimage.binary_dilation(m, iterations=3), arr[:, :, 3], 0)
    ys, xs = np.nonzero(m); H, W = m.shape; edges = (ys.min() < 3) + (ys.max() > H - 4) + (xs.min() < 3) + (xs.max() > W - 4)
    cov = m.mean()
    if cov < 0.03 or cov > 0.7 or edges >= 3: print('skip (bad cutout)', it['name'], round(cov, 2), edges, flush=True); continue
    out.append(save(Image.fromarray(arr), 'house', it['name'])); out[-1]['room'] = it['room']; print('cut', it['room'], it['name'], round(cov, 2), flush=True)
(Path(__file__).parent / 'emma.json').write_text(json.dumps(out, indent=1)); print('DONE', len(out))

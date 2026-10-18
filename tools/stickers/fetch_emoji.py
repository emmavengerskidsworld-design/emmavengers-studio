"""Kid-friendly emoji stickers from Google Noto Emoji, 3D set (https://github.com/googlefonts/noto-emoji/tree/main/3D/png):
image resources are Apache License 2.0 (repository LICENSE + README; flag artwork is based on public-domain region-flags).
512 px PNG -> 256 px WebP (the 3D look matches the Emmavengers 3D art).
Writes lib/stickers/emoji/<code>.webp + tools/stickers/emoji.json.   python3 tools/stickers/fetch_emoji.py"""
import json, io, unicodedata, urllib.request, time
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / 'lib/stickers/emoji'; OUT.mkdir(parents=True, exist_ok=True)
RAW = 'https://raw.githubusercontent.com/googlefonts/noto-emoji/main/3D/png/512/emoji_u{}.png'
S = lambda s: [int(x, 16) for x in s.split()]
CATS = {
 'emoji-faces': S('1f600 1f601 1f602 1f603 1f604 1f605 1f606 1f607 1f609 1f60a 1f60b 1f60c 1f60d 1f60e 1f618 1f61b 1f61c 1f61d 1f622 1f62d 1f62e 1f631 1f632 1f633 1f634 1f642 1f643 1f644 1f914 1f917 1f929 1f973 1f970 1f92a 1f92b 1f92d 1f97a 1f971 1f920 1f913 1f47b 1f47d 1f916 1f921 1f648 1f649 1f64a 1f44d 1f44f 1f64c 1f44b 1f64f 1f4aa 270c 1f440 1f91e 1f446'),
 'emoji-animals': S('1f436 1f431 1f42d 1f439 1f430 1f98a 1f43b 1f43c 1f428 1f42f 1f981 1f42e 1f437 1f438 1f435 1f414 1f427 1f426 1f424 1f986 1f989 1f984 1f41d 1f98b 1f41e 1f422 1f40d 1f996 1f995 1f419 1f42c 1f433 1f41f 1f420 1f988 1f418 1f992 1f993 1f98f 1f99b 1f40a 1f411 1f410 1f42a 1f40e 1f40c 1f98e 1f99c 1f9a9 1f994 1f43e'),
 'emoji-food': S('1f34e 1f34c 1f347 1f353 1f349 1f34a 1f34d 1f96d 1f965 1f352 1f351 1f955 1f33d 1f966 1f35e 1f95e 1f355 1f354 1f35f 1f366 1f368 1f369 1f36a 1f382 1f9c1 1f36d 1f36c 1f36b 1f95b 1f9c3 1f95a 1f35a 1f35d 1f37f 1f9c7'),
 'emoji-nature': S('2600 1f31e 1f319 1f31f 2b50 1f308 2601 26c5 1f327 2744 26c4 26a1 1f525 1f4a7 1f30a 1f33b 1f337 1f339 1f338 1f33c 1f340 1f333 1f334 1f335 1f344 1f342 1f30d 1f30b 1f3d4 1f3dd 1fab4'),
 'emoji-fun': S('1f388 1f389 1f38a 1f381 1f380 1f3c6 1f947 1f451 1f3a8 1f58d 270f 1f4da 1f4d6 1f392 1f3b5 1f3b6 1f3b8 1f941 1f3b9 1f3ba 26bd 1f3c0 1f3ae 1f9f8 1fa81 1f680 1f6f8 2708 1f697 1f68c 1f682 1f6b2 26f5 1f3e0 1f3f0 1f3a0 1f3a1 1f9e9 1fa84 1f4f7 1f4a1 23f0 1f514 1f4e3 1f3ac 1f3a4 1f52d 1fa90'),
 'emoji-symbols': S('2764 1f9e1 1f49b 1f49a 1f499 1f49c 1f90e 1f496 1f497 1f495 1f498 1f49d 2728 1f4ab 1f4a5 1f4af 2705 274c 2753 2757 2795 1f4ac 1f4ad 1f4a4 1f4a2 1f4a8 1f3b6'),
}
FLAGS = ['NG', 'GH', 'KE', 'ZA', 'CM', 'TZ', 'UG', 'ET', 'EG', 'SN', 'CI', 'RW', 'CD', 'ZM', 'ZW', 'BJ', 'TG', 'JM', 'US', 'GB', 'CA', 'FR', 'BR', 'IN', 'AE']
FLAG_NAMES = {'NG': 'Nigeria', 'GH': 'Ghana', 'KE': 'Kenya', 'ZA': 'South Africa', 'CM': 'Cameroon', 'TZ': 'Tanzania', 'UG': 'Uganda', 'ET': 'Ethiopia', 'EG': 'Egypt', 'SN': 'Senegal', 'CI': "Côte d'Ivoire", 'RW': 'Rwanda', 'CD': 'DR Congo', 'ZM': 'Zambia', 'ZW': 'Zimbabwe', 'BJ': 'Benin', 'TG': 'Togo', 'JM': 'Jamaica', 'US': 'United States', 'GB': 'United Kingdom', 'CA': 'Canada', 'FR': 'France', 'BR': 'Brazil', 'IN': 'India', 'AE': 'United Arab Emirates'}
def get(url):
    for i in range(4):
        try: return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'emmavengers-studio'}), timeout=40).read()
        except Exception as e:
            if i == 3: raise
            time.sleep(2 + i * 2)
out = []
def save(code, name, cat, tags):
    f = OUT / f'{code}.webp'
    if not f.exists():
        im = Image.open(io.BytesIO(get(RAW.format(code)))).convert('RGBA'); im = im.resize((256, round(256 * im.height / im.width)), Image.LANCZOS); im.save(f, 'WEBP', quality=90, alpha_quality=100, method=6)
    im = Image.open(f); out.append({'cat': cat, 'name': name, 'file': f'emoji/{code}.webp', 'w': im.width, 'h': im.height, 'tags': tags, 'lic': 'noto'})
for cat, cps in CATS.items():
    seen = set()
    for cp in cps:
        if cp in seen: continue
        seen.add(cp)
        try: name = unicodedata.name(chr(cp)).title()
        except ValueError: name = hex(cp)
        try: save(f'{cp:04x}', name, cat, [w.lower() for w in name.split()])
        except Exception as e: print('missing', hex(cp), name, e, flush=True); continue
        print('ok', cat, name, flush=True)
for cc in FLAGS:
    code = '_'.join(f'{0x1f1e6 + ord(ch) - 65:x}' for ch in cc)
    try: save(code, 'Flag ' + FLAG_NAMES[cc], 'flags', ['flag', FLAG_NAMES[cc].lower(), cc.lower()]); print('ok flag', cc, flush=True)
    except Exception as e: print('missing flag', cc, e, flush=True)
(Path(__file__).parent / 'emoji.json').write_text(json.dumps(out, indent=1)); print('DONE', len(out))

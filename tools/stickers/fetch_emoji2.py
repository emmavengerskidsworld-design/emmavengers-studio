"""Batch 12 sticker round 2: more Google Noto Emoji 3D stickers (Apache License 2.0, same source + terms as fetch_emoji.py)
sorted into kids-friendly categories: school, Bible & faith, animals, food, space, sports, weather, holidays, feelings.
Skips anything already in emoji.json. Writes lib/stickers/emoji/<code>.webp + tools/stickers/emoji2.json.
python3 tools/stickers/fetch_emoji2.py"""
import json, io, unicodedata, urllib.request, time, sys
from pathlib import Path
from PIL import Image
H = Path(__file__).parent; ROOT = H.parents[1]; OUT = ROOT / 'lib/stickers/emoji'
RAW = 'https://raw.githubusercontent.com/googlefonts/noto-emoji/main/3D/png/512/emoji_u{}.png'
CATS = {
 'kids-school': '1f4d6 270f 1f58d 1f58a 1f4dd 1f4cf 1f4d0 2702 1f4ce 1f4cc 1f392 1f3eb 1f9ee 1f52c 1f52d 1f9ea 1f9ec 1f5fa 1f4bb 1f4d3 1f4d2 1f4d5 1f4d7 1f4d8 1f4d9 1f4c1 1f4c5 1f9d1_200d_1f3eb 1f469_200d_1f393 1f393 1f514 23f0 1f4a1 1f50d 1f9e0 1f58c 1f3bc 1f4e3 2796 2716 2797 1f522 1f524 1f520 1f521 1f9e9 1f948 1f949 1f3c5 1f396 1f9d1_200d_1f52c 1f9d1_200d_1f3a8 1f4cb 1f587',
 'kids-bible': '271d 26ea 1f64f 1f54a 1f47c 1f56f 1f411 1f410 1f41f 1f33e 1fad2 1f33f 26f0 1f3dc 1f42b 1f42a 1f451 1f4ef 1f6d0 1f492 1f305 1f304 1f6a2 26f5 1f40b 1f433 1f985 1faf6 1f450 1f932 1f3fa 1fa94 2693 1f5dd 1f6e1 1f48e 1faa8 1f30c 1f46a 1f476 1f9d4 1f9d5 1f474 1f475 1f3f0',
 'kids-animals': '1f415 1f429 1f408 1f405 1f406 1f434 1f40e 1f993 1f992 1f418 1f98f 1f99b 1f998 1f9a5 1f9a6 1f9a8 1f9a1 1f43f 1f994 1f987 1f413 1f423 1f425 1f99c 1f99a 1f9a9 1f9a2 1f40a 1f98e 1f409 1f432 1f420 1f421 1f988 1f991 1f990 1f99e 1f980 1f41a 1f40c 1f41b 1f41c 1f997 1f404 1f402 1f403 1f416 1f40f 1f999 1f401 1f407 1f9ab 1f9ad 1f9ac 1f9a3 1f412 1f98d 1f9a7 1f43a 1f98c 1f983 1f43e 1fab2 1fab1 1f9a4 1fab6 1f40d 1f981 1f42f 1f43c',
 'kids-food': '1f350 1f34b 1f348 1f95d 1f345 1f346 1f951 1f96c 1f952 1f336 1fad1 1f9c4 1f9c5 1f954 1f360 1f950 1f96f 1f956 1f968 1f9c0 1f95a 1f373 1f9c8 1f9c7 1f357 1f356 1f32d 1f96a 1f32e 1f32f 1f957 1f35d 1f35c 1f372 1f35b 1f363 1f371 1f95f 1f364 1f359 1f35a 1f358 1f365 1f960 1f362 1f361 1f367 1f967 1f370 1f36e 1f36f 1f37c 1f9cb 1f964 1f375 1fad6 1f37f 1f95c 1f330 1fad0 1fad3 1fad4 1f959 1f9c6',
 'kids-space': '1f30e 1f30f 1fa90 1f311 1f312 1f313 1f314 1f315 1f316 1f317 1f318 1f31a 1f31d 1f31b 1f31c 2604 1f320 1f6f0 1f47d 1f47e 1f916 1f9d1_200d_1f680 1f30c 1f6f8 1f680 1f52d',
 'kids-sports': '1f3c8 26be 1f94e 1f3be 1f3d0 1f3c9 1f94f 1f3b1 1f3d3 1f3f8 1f3d2 1f3d1 1f94d 1f3cf 1f945 26f3 1f3f9 1f3a3 1f94a 1f94b 1f3bd 1f6f9 1f6fc 1f6f7 26f8 1f94c 1f3bf 1f6b4 1f3ca 1f938 1f3c3 26f9 1f3cb 1f6b2 1f6f4 1f3df 1f3af 1f3b3 1fa83 1f93e 1f9d7 1f93d 1f3c4 1f3c6 1f947',
 'kids-weather': '1f324 1f325 1f326 26c8 1f329 1f328 2603 1f32c 1f32a 1f32b 2602 2614 1f321 1f300 1f302 1f9e3 1f9e4 1f9e5 1f576 1fa74 1f3d6 1f305 1f307 1f306 1f301 1f30b',
 'kids-holidays': '1f384 1f385 1f936 1f383 1f386 1f387 1f9e8 1f973 1fa85 1f38e 1f38f 1f390 1f391 1f9e7 1f490 1f48c 1f397 1f39f 1f3ab 1f3ee 1f3a0 1f3a1 1f3a2 1f3aa 1f921 1fa84 1f3ad 1f9fa 1f6cd 1f9e6',
 'kids-feelings': '1f970 1f929 1f60f 1f612 1f61e 1f61f 1f620 1f621 1f623 1f624 1f625 1f626 1f627 1f628 1f629 1f62a 1f62b 1f62c 1f630 1f635 1f636 1f637 1f641 1f910 1f911 1f912 1f913 1f915 1f920 1f922 1f923 1f924 1f925 1f927 1f928 1f92a 1f92b 1f92d 1f92f 1f971 1f972 1f974 1f975 1f976 1f978 1f97a 1f9d0 1fae0 1fae1 1fae2 1fae3 1fae4 1fae5 263a 2639 1f610 1f611 1f615 1f616 1f617 1f619 1f61a 1f613 1f614 1f62f 1f44d 1f44e 1f44f 1f44b 1f44c 270c 1f91e 1f91f 1f918 1f919 1f4aa 1f64c 1f64b 1f646 1f645 1f937 1f926 1f63a 1f638 1f639 1f63b 1f63c 1f63d 1f640 1f63f 1f63e 1f648 1f649 1f64a',
}
NAMES = {'1f9d1_200d_1f3eb': 'Teacher', '1f469_200d_1f393': 'Student', '1f9d1_200d_1f52c': 'Scientist', '1f9d1_200d_1f3a8': 'Artist', '1f9d1_200d_1f680': 'Astronaut'}
def get(url):
    for i in range(4):
        try: return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'emmavengers-studio'}), timeout=40).read()
        except urllib.error.HTTPError as e:
            if e.code == 404: raise
            time.sleep(2 + i * 2)
        except Exception:
            if i == 3: raise
            time.sleep(2 + i * 2)
have = {e['file'] for e in json.loads((H / 'emoji.json').read_text())}
out, seen, miss = [], set(), []
for cat, codes in CATS.items():
    for code in codes.split():
        f = f'emoji/{code}.webp'
        if f in have or f in seen: continue
        name = NAMES.get(code) or (unicodedata.name(chr(int(code, 16)), code).title() if '_' not in code else code)
        p = OUT / f'{code}.webp'
        try:
            if not p.exists():
                im = Image.open(io.BytesIO(get(RAW.format(code)))).convert('RGBA'); im = im.resize((256, round(256 * im.height / im.width)), Image.LANCZOS); im.save(p, 'WEBP', quality=88, alpha_quality=100, method=6)
        except Exception as e: miss.append(code); print('missing', code, name, e, flush=True); continue
        im = Image.open(p); seen.add(f)
        out.append({'cat': cat, 'name': name, 'file': f, 'w': im.width, 'h': im.height, 'tags': [w.lower() for w in name.replace('-', ' ').split()] + [cat.split('-')[1]], 'lic': 'noto'})
(H / 'emoji2.json').write_text(json.dumps(out, indent=1)); print('DONE', len(out), 'missing', miss)

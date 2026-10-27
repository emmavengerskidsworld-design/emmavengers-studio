"""Bundle open-licence fonts (Google Fonts repo: OFL / Apache 2.0) into lib/fonts as WOFF2.
Variable fonts are pinned to one display weight (smaller files). Writes lib/fonts/fonts.json + licence texts.
python3 tools/fonts/fetch_fonts.py"""
import json, urllib.request, io, re, time, sys
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer
ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / 'lib/fonts'; OUT.mkdir(parents=True, exist_ok=True)
UA = {'User-Agent': 'emmavengers-studio font bundler (https://github.com/emmavengerskidsworld-design/emmavengers-studio)'}
# (family, css name, group, weight for variable fonts)
FONTS = [
 ('Luckiest Guy', 'kids', 400), ('Fredoka', 'kids', 650), ('Baloo 2', 'kids', 800), ('Bubblegum Sans', 'kids', 400), ('Chewy', 'kids', 400),
 ('Lilita One', 'kids', 400), ('Titan One', 'kids', 400), ('Bangers', 'kids', 400), ('Sniglet', 'kids', 800), ('Boogaloo', 'kids', 400),
 ('Carter One', 'kids', 400), ('Bowlby One', 'kids', 400), ('Paytone One', 'kids', 400), ('Passion One', 'kids', 700), ('Modak', 'kids', 400),
 ('Londrina Solid', 'kids', 900), ('Grandstander', 'kids', 800), ('Mochiy Pop One', 'kids', 400), ('DynaPuff', 'kids', 700), ('Gluten', 'kids', 700),
 ('Kavoon', 'kids', 400), ('Concert One', 'kids', 400), ('Coiny', 'kids', 400), ('Rammetto One', 'kids', 400), ('Sigmar One', 'kids', 400),
 ('Galindo', 'kids', 400), ('Rubik Bubbles', 'kids', 400), ('Comic Neue', 'kids', 700), ('Patrick Hand', 'hand', 400), ('Gochi Hand', 'hand', 400),
 ('Permanent Marker', 'hand', 400), ('Caveat', 'hand', 700), ('Pacifico', 'script', 400), ('Lobster', 'script', 400), ('Dancing Script', 'script', 700),
 ('Poppins', 'clean', 800), ('Montserrat', 'clean', 800), ('Nunito', 'clean', 900), ('Quicksand', 'clean', 700), ('Anton', 'clean', 400),
 ('Bebas Neue', 'clean', 400), ('Oswald', 'clean', 700), ('Righteous', 'clean', 400), ('Bungee', 'display', 400), ('Press Start 2P', 'display', 400),
 ('Abril Fatface', 'display', 400), ('Playfair Display', 'display', 800), ('Amatic SC', 'hand', 700),
 # B22: professional / elegant / creative / festive additions
 ('Cormorant Garamond', 'elegant', 600), ('Cinzel', 'elegant', 600), ('Bodoni Moda', 'elegant', 600), ('DM Serif Display', 'elegant', 400), ('Libre Baskerville', 'elegant', 700),
 ('Lora', 'elegant', 600), ('Marcellus', 'elegant', 400), ('Prata', 'elegant', 400), ('Italiana', 'elegant', 400), ('Great Vibes', 'script', 400),
 ('Allura', 'script', 400), ('Parisienne', 'script', 400), ('Sacramento', 'script', 400), ('Satisfy', 'script', 400), ('Kaushan Script', 'script', 400),
 ('Yellowtail', 'script', 400), ('Inter', 'clean', 700), ('Raleway', 'clean', 700), ('Work Sans', 'clean', 600), ('Archivo Black', 'bold', 400),
 ('Teko', 'bold', 600), ('Unbounded', 'creative', 700), ('Syne', 'creative', 700), ('Space Grotesk', 'clean', 700), ('Josefin Sans', 'clean', 600),
 ('League Spartan', 'bold', 800), ('Outfit', 'clean', 700), ('Black Ops One', 'creative', 400), ('Monoton', 'creative', 400), ('Bungee Shade', 'creative', 400),
 ('Mountains of Christmas', 'festive', 700), ('Berkshire Swash', 'festive', 400), ('Creepster', 'festive', 400), ('Shadows Into Light', 'hand', 400), ('Rock Salt', 'hand', 400),
 ('Fjalla One', 'bold', 400), ('Alfa Slab One', 'bold', 400), ('Bodoni Moda', 'elegant', 600),
]
def get(url, tries=4):
    for i in range(tries):
        try: return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=60).read()
        except Exception as e:
            if i == tries - 1: raise
            time.sleep(3 * (i + 1))
def listing(fam):
    key = re.sub(r'[^a-z0-9]', '', fam.lower())
    for lic in ('ofl', 'apache', 'ufl'):
        try: return lic, json.loads(get(f'https://api.github.com/repos/google/fonts/contents/{lic}/{key}', 1))
        except Exception: pass
    raise RuntimeError('not found ' + fam)
done = json.loads((OUT / 'fonts.json').read_text()) if (OUT / 'fonts.json').exists() else []
have = {d['family'] for d in done}
for fam, group, wght in FONTS:
    if fam in have: continue
    lic, files = listing(fam)
    ttfs = [f for f in files if f['name'].endswith('.ttf') and 'Italic' not in f['name']]
    pick = next((f for f in ttfs if '[' in f['name']), None) or next((f for f in ttfs if f['name'].endswith('-Regular.ttf')), None) or next((f for f in ttfs if re.search(r'-(Bold|Black|ExtraBold)\.ttf$', f['name'])), None) or ttfs[0]
    if '[' not in pick['name'] and wght >= 700:   # static family: prefer a bold cut when we want bold
        for w in ('Black', 'ExtraBold', 'Bold'):
            alt = next((f for f in ttfs if f['name'].endswith(f'-{w}.ttf')), None)
            if alt: pick = alt; break
    ft = TTFont(io.BytesIO(get(pick['download_url'])))
    if 'fvar' in ft:
        axes = {a.axisTag: a for a in ft['fvar'].axes}; loc = {t: (max(a.minValue, min(a.maxValue, wght)) if t == 'wght' else a.defaultValue) for t, a in axes.items()}
        ft = instancer.instantiateVariableFont(ft, loc)
    key = re.sub(r'[^a-z0-9]', '', fam.lower()); ft.flavor = 'woff2'; ft.save(OUT / f'{key}.woff2')
    lt = next((f for f in files if f['name'] in ('OFL.txt', 'LICENSE.txt')), None)
    if lt: (OUT / f'{key}.LICENSE.txt').write_bytes(get(lt['download_url']))
    done.append({'family': fam, 'id': key, 'group': group, 'file': f'{key}.woff2', 'licence': {'ofl': 'SIL Open Font License 1.1', 'apache': 'Apache License 2.0', 'ufl': 'Ubuntu Font Licence 1.0'}[lic], 'source': f'https://github.com/google/fonts/tree/main/{lic}/{key}', 'bytes': (OUT / f'{key}.woff2').stat().st_size})
    (OUT / 'fonts.json').write_text(json.dumps(done, indent=1)); print('ok', fam, lic, pick['name'], done[-1]['bytes'], flush=True)
print('DONE', len(done), sum(d['bytes'] for d in done))

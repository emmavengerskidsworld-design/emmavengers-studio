"""Download CC0 sound packs from OpenGameArt.org, checking each page's licence field first.
   python3 tools/sounds/crawl_oga.py DEST slug1 slug2 ...
A pack is taken only when its page lists exactly one licence and it is CC0 (no BY / BY-SA / GPL / OGA-BY variants).
Writes DEST/<slug>/ (files, unzipped) and DEST/oga.json [{slug, title, author, url, licence, files}]."""
import sys, os, re, json, html, zipfile, io, requests
UA = {'User-Agent': 'EmmavengersStudioBot/1.0 (CC0 sound library builder; https://github.com/emmavengerskidsworld-design/emmavengers-studio)'}
DEST = sys.argv[1]; os.makedirs(DEST, exist_ok=True)
meta_f = f'{DEST}/oga.json'; META = json.load(open(meta_f)) if os.path.exists(meta_f) else {}
for slug in sys.argv[2:]:
    url = f'https://opengameart.org/content/{slug}'
    try: h = requests.get(url, headers=UA, timeout=60).text
    except Exception as e: print('fail', slug, e); continue
    lic_block = re.search(r'field-name-field-art-licenses.*?</div></div></div>', h, re.S)
    lics = re.findall(r"class='license-name'>([^<]+)<", lic_block.group(0)) if lic_block else []
    mt = re.search(r'property="dc:title"><h2>([^<]+)', h) or re.search(r'<title>([^<|]+)', h)
    title = html.unescape(mt.group(1).strip()) if mt else slug
    author = html.unescape((re.search(r'field-name-author-submitter.*?<a href="/users/[^"]+">([^<]+)</a>', h, re.S) or [None, '?'])[1])
    if lics != ['CC0']: print('SKIP licence', slug, lics); continue
    files = re.findall(r'field-name-field-art-files.*', h, re.S)
    links = re.findall(r'<a href="(https://opengameart.org/sites/default/files/[^"]+)"[^>]*download=', files[0]) if files else []
    d = f'{DEST}/{slug}'; os.makedirs(d, exist_ok=True); got = []
    for L in links:
        fn = html.unescape(L.rsplit('/', 1)[1])
        try: b = requests.get(L, headers=UA, timeout=300).content
        except Exception as e: print('  fail', L, e); continue
        if fn.lower().endswith('.zip'):
            try:
                z = zipfile.ZipFile(io.BytesIO(b))
                for n in z.namelist():
                    if re.search(r'\.(wav|ogg|mp3|flac)$', n, re.I) and '__MACOSX' not in n:
                        out = os.path.join(d, re.sub(r'[\\/]+', '__', n)); open(out, 'wb').write(z.read(n)); got.append(os.path.basename(out))
            except Exception as e: print('  badzip', fn, e)
        elif re.search(r'\.(wav|ogg|mp3|flac)$', fn, re.I): open(os.path.join(d, fn), 'wb').write(b); got.append(fn)
    META[slug] = dict(slug=slug, title=title, author=author, url=url, licence='CC0-1.0', files=got); print('ok', slug, author, len(got), flush=True)
    json.dump(META, open(meta_f, 'w'), indent=1, ensure_ascii=False)

import re, requests, json, html
S = requests.Session(); S.headers['User-Agent'] = 'EmmavengersStudio/1.0'
idx = open('index.html').read()
pages = sorted(set(re.findall(r'href="(/yell/learn/photosmultimedia/[^"]*sound[^"]*\.htm)"', idx)))
out = []
for p in pages:
    try: h = S.get('https://www.nps.gov' + p, timeout=30).text
    except Exception as e: print('fail', p); continue
    title = html.unescape(re.search(r'<title>([^<]*)', h).group(1)).split('-')[0].strip()
    mp3 = sorted(set(re.findall(r'(https?://[^"\']+\.mp3|/[^"\']+\.mp3)', h)))
    cr = bool(re.search(r'©|copyright', h, re.I))
    for m in mp3:
        u = m if m.startswith('http') else 'https://www.nps.gov' + m
        out.append(dict(page='https://www.nps.gov' + p, title=title, url=u, copyright_mention=cr))
    print(len(mp3), cr, title, flush=True)
json.dump(out, open('candidates.json', 'w'), indent=1); print('total', len(out))

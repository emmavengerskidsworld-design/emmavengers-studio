"""Build lib/stickers/index.json (the data-driven sticker library) from emma.json (Emmavengers art), emoji.json (Noto 3D emoji)
and art.json (our own designs). Adding stickers = add files + entries, run this.   python3 tools/stickers/build_library.py"""
import json, re
from pathlib import Path
H = Path(__file__).parent; ROOT = H.parents[1]
CATS = [  # id, name, group
    ('emma-characters', 'Emma kids', 'emma'), ('emma-animals', 'Animals', 'emma'), ('emma-house', 'Things', 'emma'), ('emma-letters', 'Letters', 'emma'),
    ('numbers', 'Numbers', 'emma'), ('flags', 'Flags', 'emma'), ('emma-food', 'African food', 'emma'), ('emma-places', 'Places', 'emma'),
    ('emoji-faces', 'Faces', 'emoji'), ('emoji-animals', 'Emoji animals', 'emoji'), ('emoji-food', 'Yummy', 'emoji'), ('emoji-nature', 'Nature', 'emoji'), ('emoji-fun', 'Fun & toys', 'emoji'), ('emoji-symbols', 'Hearts & symbols', 'emoji'),
    ('stars', 'Stars & hearts', 'shapes'), ('arrows', 'Arrows', 'shapes'), ('bubbles', 'Speech bubbles', 'shapes'), ('frames', 'Frames', 'shapes'), ('shapes', 'Shapes', 'shapes'),
]
MAP = {'characters': 'emma-characters', 'animals': 'emma-animals', 'house': 'emma-house', 'letters': 'emma-letters', 'counting': 'numbers', 'flags': 'flags', 'food': 'emma-food', 'places': 'emma-places'}
LIC = {'emma': 'Emmavengers original art (© Cletus Emmanuel)', 'noto': 'Apache-2.0 (Google Noto Emoji 3D)', 'own': 'CC0-1.0 (Emmavengers Studio original design)'}
SHORT = [(r'^Smiling Face With ', ''), (r'^Face With ', ''), (r'^Grinning Face With ', 'Grin, '), (r' Face$', ''), (r'^Black ', ''), (r'^Heavy ', ''), (r'^White ', '')]
def short(n):
    for a, b in SHORT: n = re.sub(a, b, n)
    return n[:1].upper() + n[1:]
items = []
for e in json.loads((H / 'emma.json').read_text()):
    cat = MAP[e['cat']]; tags = [w.lower() for w in re.split(r'\W+', e['name']) if w] + [e['cat'], 'emmavengers'] + ([e['room']] if e.get('room') else [])
    name = e['name'].title() if e['cat'] != 'letters' else e['name']
    if e['cat'] == 'counting': name = name + ' (count)'
    items.append({**e, 'cat': cat, 'name': name, 'tags': tags, 'lic': 'emma'})
for e in json.loads((H / 'emoji.json').read_text()): items.append({**e, 'name': short(e['name'])})
for e in json.loads((H / 'art.json').read_text()): items.append(e)
# animated stickers: a simple Combo loop (our own animations in js/animations.js) comes with the sticker
def auto_anim(it, i):
    n, c = it['name'].lower(), it['cat']
    if it.get('anim'): return it['anim']
    if 'heart' in n: return 'heartbeat'
    if c == 'emma-characters': return 'breathe'
    if c == 'emma-animals': return ['hop', 'sway', 'wobble'][i % 3]
    if c == 'emma-letters' and n[-1:] in 'aeiou': return 'jelly'
    if c == 'emoji-faces' and i % 4 == 0: return 'jelly'
    if c == 'emoji-animals' and i % 4 == 1: return 'hop'
    if c in ('emoji-fun', 'emoji-nature') and i % 5 == 2: return ['float', 'pulse', 'swingLoop'][i % 3]
    return None
seen, uniq = set(), []
for it in items:
    it['id'] = re.sub(r'\.\w+$', '', it['file'])
    if it['id'] not in seen: seen.add(it['id']); uniq.append(it)
items = uniq
for i, it in enumerate(items):
    a = auto_anim(it, i)
    if a: it['anim'] = a
    else: it.pop('anim', None)
    it.pop('room', None)
cats = [{'id': c, 'name': n, 'group': g, 'count': sum(1 for it in items if it['cat'] == c)} for c, n, g in CATS]
assert all(c['count'] for c in cats), [c for c in cats if not c['count']]
out = {'version': 1, 'groups': [{'id': 'emma', 'name': 'Emmavengers'}, {'id': 'emoji', 'name': 'Emoji'}, {'id': 'shapes', 'name': 'Shapes & more'}], 'cats': cats, 'licences': LIC,
       'items': [{k: it[k] for k in ('id', 'cat', 'name', 'file', 'w', 'h', 'tags', 'lic', 'anim') if k in it} for it in items]}
(ROOT / 'lib/stickers/index.json').write_text(json.dumps(out, separators=(',', ':')))
print('DONE', len(items), {c['id']: c['count'] for c in cats}, 'animated', sum(1 for it in items if it.get('anim')))

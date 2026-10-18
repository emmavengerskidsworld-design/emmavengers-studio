"""Batch 8 library expansion: adds new packs to lib/sounds/ without rebuilding the older ones.
   python3 tools/sounds/build_b8.py [SRC=/workspace/sfx-src]
- Music: SRC/music2 (tools/sounds/compose.py output) -> emmavengers-originals-music-2, with beat metadata per track:
  b = BPM, m = beats per bar, o = time of beat 1 (s), n = number of beats, sec = [[section, start s]], dr = drop / hit times (s).
  Beat k is at o + k * 60 / b; downbeats are the beats with k % m == 0. Tempo is constant (we wrote the music).
- Sound effects: SRC/originals2 (tools/sounds/synth2.py) + SRC/oga (tools/sounds/crawl_oga.py, CC0 pages only).
  Every sound: decoded -> trimmed -> liveliest part -> loudness normalised (same rules as build_library.py) -> MP3,
  then de-duplicated against each other AND the existing library (exact audio hash + spectral fingerprint).
- Rewrites lib/sounds/index.json (old packs kept as they are) and LICENSES.md."""
import os, sys, re, json, glob, hashlib, numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
_argv = sys.argv; sys.argv = [_argv[0]]
import build_library as BL
sys.argv = _argv
from build_library import decode, trim, liveliest, loudnorm, integrated, SR, LIB, ROOT
import subprocess
SRC = sys.argv[1] if len(sys.argv) > 1 else '/workspace/sfx-src'
def enc(x, path, br):
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', str(x.shape[0]), '-i', '-', '-c:a', 'libmp3lame', '-b:a', br, '-ar', '44100', path], stdin=subprocess.PIPE)
    p.communicate(np.ascontiguousarray(x.T, dtype=np.float32).tobytes())
def slugify(s): return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')[:48] or 'sound'

# ---------------- fingerprints (dedupe) ----------------
EDGES = np.geomspace(60, 11000, 25)
def fingerprint(x):
    m = x.mean(0) if x.ndim == 2 else x; m = m[::6]; sr = SR / 6   # 8 kHz mono
    if len(m) < 512: m = np.pad(m, (0, 512 - len(m)))
    F = 16; seg = np.array_split(m, F); f = np.fft.rfftfreq(1024, 1 / sr); out = []
    for s in seg:
        s = np.pad(s, (0, max(0, 1024 - len(s))))[:max(1024, len(s))]
        S = np.abs(np.fft.rfft(s[:1024] * np.hanning(1024))) ** 2; fq = np.fft.rfftfreq(1024, 1 / sr)
        out.append([np.log10(S[(fq >= a) & (fq < b)].sum() + 1e-9) for a, b in zip(EDGES[:-1], EDGES[1:]) if b <= sr / 2])
    v = np.array(out).ravel(); v = v - v.mean(); return v / (np.linalg.norm(v) + 1e-9)
def audio_hash(x): return hashlib.md5(np.round(x.mean(0) if x.ndim == 2 else x, 3).astype(np.float32)[::4].tobytes()).hexdigest()

# ---------------- OpenGameArt naming + categories ----------------
OGA = json.load(open(f'{SRC}/oga/oga.json'))
SKIP_PAGES = {'teleport', 'random-sfx', 'supertuxkart-sound-effects', 'misc-sfx-pack', 'gui-sound-effects'}   # third-party Freesound file / unnamed / empty
BAD = re.compile(r'death|scream|\bdie\b|_die|retro_die|creature_die|hurt|shot|shoot|gun|cannon|grenade|ammo|shotgun|machinegun|melee|weapon|attack|blood|wolf-whistle|freakedbreath|scared-breathing|breath-(fe)?male|kill', re.I)
RULES = [  # (regex on path, cat)
    (r'spell|magic|gem-gather|magical|sparkle', 'magic'), (r'bell|gong', 'instruments'), (r'thunder|rain|wind', 'weather'),
    (r'splash|bubble|slime|mud|plop|water|drip|liquid', 'water'), (r'firework|\bfw|bang', 'impacts'),
    (r'alien|monster|troll|creature|roar|howl|bug|burble|grunt|cute_|stomp', 'creatures'), (r'barking|crickets', 'animals'),
    (r'burp|cough|snore|eat_|spit|nose|ooh|yawn|gasp|laugh|shh|sniff|snap|clap|whistle|sip|human_', 'voices'),
    (r'stationery|paper|book|scissors', 'school'), (r'heli|blinker|car_|cardoor|door_clos|door_open\.wav|highway|engine', 'vehicles'),
    (r'machine|construction|pump|saw\b|saw\.|rolling|alarm|terminal', 'machines'),
    (r'kitchen|dishes|microwave|pot_|glass|drink|toilet|key|lock|door|switch|cloth|plastic|velcro|money|coin_|phone|camera|photo|fidget|nasal|wooded_box|items|item_|chain|footstep|step', 'household'),
    (r'hit|slam|break|crack|fall|hammer|tools|metal|wood|stones|rock|clamour|impact|blade|djembe|fruit|toaster', 'impacts'),
    (r'teleport|laser|beep|rocket|sci|sfx_\d', 'scifi'), (r'power_up|retro|synth_|coin', 'retro'), (r'weird|misc|other|noise|spinning|ambient|ambience', 'weird')]
J512 = {'Alarms': 'retro', 'Coins': 'retro', 'Explosions': 'retro', 'Falling Sounds': 'retro', 'Fanfares': 'retro', 'Footsteps': 'retro', 'General Sounds': 'retro', 'Movement': 'retro', 'Weapons': 'retro'}
FOLDERCAT = {'Camera': 'household', 'Cloth': 'household', 'Drink': 'household', 'Keys, Locks, Door': 'household', 'Kitchen': 'household', 'Misc': 'household', 'Money': 'household', 'Paper & Stationery': 'school',
             'Phone': 'household', 'Plastic': 'household', 'Velcro': 'household', 'Ambience': 'nature', 'Cloth, Rustle': 'household', 'Footsteps': 'household', 'Human': 'voices', 'Impacts': 'impacts',
             'Misc Foley': 'household', 'Paper': 'school', 'Scifi': 'scifi', 'Technology': 'machines', 'UI': 'game', 'Water': 'water'}
FOLDERNAME = {'Keys, Locks, Door': 'Key and lock', 'Paper & Stationery': 'Paper', 'Cloth, Rustle': 'Cloth rustle', 'Misc Foley': 'Foley', 'UI': 'Button'}
TOPIC = {'100-cc0-sfx': 'Clatter', '100-cc0-sfx-2': 'Clatter', '100-cc0-metal-and-wood-sfx': 'Knock', '25-cc0-bang-firework-sfx': 'Firework', '25-cc0-mud-sfx': 'Mud', '30-cc0-sfx-loops': 'Loop',
         '30-weird-cc0-sfx': 'Weird', '40-cc0-water-splash-slime-sfx': 'Splash', '50-cc0-retro-synth-sfx': 'Synth', '50-cc0-sci-fi-sfx': 'Sci-fi', '60-cc0-sci-fi-sfx': 'Sci-fi', '75-cc0-breaking-falling-hit-sfx': 'Crash',
         '80-cc0-creature-sfx': 'Creature', '80-cc0-creture-sfx-2': 'Creature', '80-cc0-rpg-sfx': 'Adventure'}
SLUGCAT = {'elevator-ding': 'household', 'open-chest-sfx': 'game', 'boings': 'cartoon', 'spinning-wheel-0': 'game', 'camera': 'household'}
GENERIC = {'', 'misc', 'weird', 'sfx', 'other', 'sound', 'sounds'}
def oga_items():
    out = []
    for slug, meta in OGA.items():
        if slug in SKIP_PAGES or not meta['files']: continue
        pack = 'oga-junkala-512' if slug.startswith('512') else ('oga-rubberduck' if meta['author'] == 'rubberduck' else ('oga-owlishmedia' if meta['author'] == 'OwlishMedia' else 'oga-assorted'))
        for f in meta['files']:
            path = f'{SRC}/oga/{slug}/{f}'; low = f.lower()
            if BAD.search(f) and not re.search(r'laser', low): continue
            if slug == 'rain-loopable' and low.endswith('.mp3'): continue   # same loops as the .ogg files
            parts = f.split('__'); stem = re.sub(r'\.(wav|ogg|mp3|flac)$', '', parts[-1], flags=re.I)
            stem = re.sub(r'^\d{4,}__?[a-z0-9]+__', '', stem); stem = re.sub(r'%20', ' ', stem)
            stem = re.sub(r'^(sfx100v2_|bfh1_|sfx_|Stationery_|Kitchen_|Money_|Plastic_|Cloth_|Drink_|Key_Lock_Door_|Camera_|Phone_|Velcro_)', '', stem)
            m = re.match(r'^(.*?)[ _-]*(\d+)([a-z]?)$', stem); base, num = (m.group(1), m.group(2).lstrip('0') + m.group(3)) if m and m.group(1) else (stem, '')
            name = re.sub(r'[_-]+', ' ', base).strip().capitalize() or 'Sound'
            if pack == 'oga-junkala-512':
                cat = 'retro'; name = '8-bit ' + name.lower()
                if 'Lasers' not in f and 'Weapons' in f: continue
            elif slug == '60-cc0-sci-fi-sfx': cat, name, num = 'scifi', 'Sci-fi', stem
            elif slug == 'pond-pals-sfx-pack': cat = 'retro'; name = name.replace('Sfx ', '')
            elif slug == 'rain-loopable': cat, name = 'weather', 'Rain loop'
            else:
                fold = parts[0].split('/')[-1] if len(parts) > 1 else ''
                cat = FOLDERCAT.get(fold) or SLUGCAT.get(slug) or ('creatures' if re.search('creat|cretu', slug) else None) or next((c for rx, c in RULES if re.search(rx, path.split('/oga/')[1], re.I)), 'weird')
                if name.isdigit(): num, name = name.lstrip('0') or '0', ''
                if name.lower() in GENERIC:
                    name = (FOLDERNAME.get(fold, fold) if fold else TOPIC.get(slug, 'Sound')) + ('' if name.lower() in GENERIC or name.isdigit() else ' ' + name.lower())
                    if name.isdigit() or not name.strip(): name = 'Sound'
            name = name.replace('8-bit sounds ', '8-bit ')
            name = (name + (' ' + num if num else '')).replace('  ', ' ')
            folder = ' / '.join(parts[1:-1]) if len(parts) > 2 else (parts[0] if len(parts) > 1 else '')
            tags = sorted(set(w for w in re.split(r'[^a-z]+', (base + ' ' + folder).lower()) if len(w) > 2 and w not in ('sfx', 'the', 'and', 'wav', 'ogg', 'collection', 'essential', 'sounds', 'sound', 'video', 'game', 'retro', 'juhani', 'junkala', 'effects')))[:6]
            out.append(dict(pack=pack, src=path, kind='sfx', cat=cat, name=name, tags=tags + [cat], author=meta['author'] if meta['author'] != 'SubspaceAudio' else 'Juhani Junkala (SubspaceAudio)', license='CC0-1.0', source=meta['url']))
    return out
def orig2_items():
    d = json.load(open(f'{SRC}/originals2/items-sfx2.json'))
    return [dict(pack='emmavengers-originals-2', src=f'{SRC}/originals2/{it["id"]}.wav', kind='sfx', cat=it['cat'], name=it['name'], tags=it['tags']) for it in d]

PACK_META = {
    'emmavengers-originals-music-2': dict(name='Emmavengers Originals vol. 2 (music)', kind='music', license='CC0-1.0', author='Emmavengers Studio',
        source='Composed by our own rule-based composer tools/sounds/compose.py (no samples, no AI) and played by our own synthesised instruments; public-domain melodies (traditional / pre-1900) in our own arrangements',
        beats='b = BPM, m = beats per bar, o = first beat (s), n = beats, sec = sections [[name, start s]], dr = drops / hits (s); beat k at o + k*60/b, downbeat when k % m == 0'),
    'emmavengers-originals-2': dict(name='Emmavengers Originals vol. 2 (sound effects)', kind='sfx', license='CC0-1.0', author='Emmavengers Studio', source='Made from scratch with plain synthesis maths: tools/sounds/synth2.py (no samples, no AI)'),
    'oga-junkala-512': dict(name='Juhani Junkala — 512 retro sound effects', kind='sfx', license='CC0-1.0', author='Juhani Junkala (SubspaceAudio)', source='https://opengameart.org/content/512-sound-effects-8-bit-style'),
    'oga-rubberduck': dict(name='rubberduck — CC0 sound packs (OpenGameArt)', kind='sfx', license='CC0-1.0', author='rubberduck', source='https://opengameart.org/users/rubberduck (13 CC0 packs, see LICENSES.md)'),
    'oga-owlishmedia': dict(name='OwlishMedia — home recordings (OpenGameArt)', kind='sfx', license='CC0-1.0', author='OwlishMedia', source='https://opengameart.org/content/202-more-sound-effects and https://opengameart.org/content/sound-effects-pack'),
    'oga-assorted': dict(name='OpenGameArt — assorted CC0 sounds', kind='sfx', license='CC0-1.0', author='various (per file)', source='https://opengameart.org (per file, see LICENSES.md)'),
}
ORIG_BPM = {'Twinkle Twinkle (music box)': (84, 4), 'Lullaby (Brahms, music box)': (66, 3), 'Joyful, Joyful (Ode to Joy)': (100, 4), 'Amazing Grace (piano)': (76, 3), 'Joy to the World': (96, 4),
            'Jesus Loves Me (ukulele)': (104, 4), 'Row Your Boat (round)': (120, 3), 'Sunny Day': (112, 4), 'Bubble Parade': (120, 4), 'Hop Skip Jump': (128, 4), 'Quiet Meadow': (72, 4), 'Still Waters': (66, 4),
            'Brave Little Hero': (118, 4), 'Ark Adventure': (104, 4), 'Silly Socks': (140, 4), 'Hide and Seek': (96, 4), 'Praise Party': (124, 4)}

def build_music(packs):
    d = json.load(open(f'{SRC}/music2/items-music2.json')); out = []; od = f'{LIB}/emmavengers-originals-music-2'; os.makedirs(od, exist_ok=True)
    for it in d:
        x = decode(f'{SRC}/music2/{it["id"]}.wav'); x = loudnorm(x, 'music', it['cat']); f = f'{od}/{it["id"]}.mp3'; enc(x, f, '96k')
        dur = round(x.shape[1] / SR, 2); spb = 60 / it['bpm']; n = int((min(it['music_end'], dur) - it['offset']) / spb + 1e-6) + 1
        rec = dict(f=it['id'] + '.mp3', n=it['name'], c=it['cat'], t=sorted(set(it['tags'])), d=dur, b=it['bpm'], m=it['meter'], o=it['offset'], n_=n, sec=[[a, b] for a, b in it['sections']], dr=it['drops'])
        rec['nb'] = rec.pop('n_'); out.append(rec)
    packs['emmavengers-originals-music-2'] = out; print('music', len(out), flush=True)
    p = f'{LIB}/emmavengers-originals-music/pack.json'; m = json.load(open(p))   # beat grid for the 17 older originals (tempo known from synth.py)
    for it in m['items']:
        if it['n'] in ORIG_BPM: it['b'], it['m'] = ORIG_BPM[it['n']]; it['o'] = 0.0; it['nb'] = int(it['d'] / (60 / it['b']))
    json.dump(m, open(p, 'w'), ensure_ascii=False, separators=(',', ':'))

def build_sfx(packs):
    seen_h, fps = set(), []
    # existing library fingerprints
    idx = json.load(open(f'{LIB}/index.json'))
    for p in idx['packs']:
        if p['kind'] != 'sfx' or p['dir'] in PACK_META: continue
        for it in json.load(open(f'{LIB}/{p["dir"]}/pack.json'))['items']:
            x = decode(f'{LIB}/{p["dir"]}/{it["f"]}'); seen_h.add(audio_hash(x)); fps.append((fingerprint(x), x.shape[1] / SR, p['dir'] + '/' + it['f']))
    print('existing fingerprints', len(fps), flush=True)
    F = np.array([f for f, _, _ in fps]) if fps else np.zeros((0, 1)); D = np.array([d for _, d, _ in fps]); dups = []; seenslug = {}
    for k, it in enumerate(orig2_items() + oga_items()):
        try:
            x = decode(it['src'])
            if x.size == 0: continue
            x = trim(x); x = liveliest(x, 30 if it['cat'] in BL.AMBIENT else 12); x = loudnorm(x, 'sfx', it['cat'])
        except Exception as e: print('skip', it['src'], e); continue
        dur = x.shape[1] / SR
        if dur < .05: continue
        h = audio_hash(x)
        if h in seen_h: dups.append((it['name'], 'exact')); continue
        fp = fingerprint(x)
        if len(F):
            sim = F @ fp; ok = np.abs(D - dur) <= .08 * dur + .05; j = np.argmax(np.where(ok, sim, -1))
            if ok[j] and sim[j] > .995: dups.append((it['name'], fps[j][2])); continue
        seen_h.add(h); fps.append((fp, dur, it['name'])); F = np.vstack([F, fp[None]]) if len(F) else fp[None]; D = np.append(D, dur)
        od = f'{LIB}/{it["pack"]}'; os.makedirs(od, exist_ok=True); s = slugify(it['name']); kk = (it['pack'], s); seenslug[kk] = seenslug.get(kk, 0) + 1
        if seenslug[kk] > 1: s += f'-{seenslug[kk]}'
        enc(x, f'{od}/{s}.mp3', '128k' if x.shape[0] == 2 else '96k')
        rec = dict(f=s + '.mp3', n=it['name'], c=it['cat'], t=sorted(set(it['tags'])), d=round(dur, 2))
        if it['pack'].startswith('oga-'): rec.update(a=it['author'], l=it['license'], s=it['source'])
        packs.setdefault(it['pack'], []).append(rec)
        if k % 100 == 0: print(' ', k, sum(len(v) for v in packs.values()), flush=True)
    json.dump(dups, open(f'{SRC}/b8-dups.json', 'w'), indent=0); print('duplicates removed', len(dups), flush=True)

def write_index_and_licences(packs):
    idx = json.load(open(f'{LIB}/index.json')); keep = [p for p in idx['packs'] if p['dir'] not in PACK_META]
    music = [p for p in keep if p['kind'] == 'music']; sfx = [p for p in keep if p['kind'] == 'sfx']; new = []
    for k, m in PACK_META.items():
        if k not in packs: continue
        meta = {a: b for a, b in m.items()}; json.dump(dict(id=k, **meta, items=packs[k]), open(f'{LIB}/{k}/pack.json', 'w'), ensure_ascii=False, separators=(',', ':'))
        new.append(dict(dir=k, name=m['name'], kind=m['kind'], license=m['license'], count=len(packs[k])))
    for p in keep: p['count'] = len(json.load(open(f'{LIB}/{p["dir"]}/pack.json'))['items'])
    idx['packs'] = music[:1] + [p for p in new if p['kind'] == 'music'] + music[1:] + sfx[:1] + [p for p in new if p['dir'] == 'emmavengers-originals-2'] + sfx[1:] + [p for p in new if p['kind'] == 'sfx' and p['dir'] != 'emmavengers-originals-2']
    json.dump(idx, open(f'{LIB}/index.json', 'w'), ensure_ascii=False, indent=1)
    allp = {p['dir']: json.load(open(f'{LIB}/{p["dir"]}/pack.json')) for p in idx['packs']}
    nm = sum(p['count'] for p in idx['packs'] if p['kind'] == 'music'); ns = sum(p['count'] for p in idx['packs'] if p['kind'] == 'sfx')
    L_ = ['# Licences', '', 'Emmavengers Studio code: © Emmavengers. Bundled third-party code and content are listed below.', '',
          '## Sound library (lib/sounds/)', '', f'{nm} music tracks and {ns} sound effects. Every sound in the library is **CC0 1.0** (public-domain dedication) or **public domain**. No attribution is required and all may be used in monetised YouTube / TikTok videos. We still credit every source here.',
          'Excluded on purpose: Creative-Commons-BY / BY-SA / NC / ND sounds, OGA-BY, GPL, “royalty-free” licences that forbid redistributing the raw sounds (e.g. the Sonniss GDC bundle licence, Pixabay licence, BBC RemArc), Freesound files that are not CC0, commercial music recordings and anything registered with YouTube Content ID (even when old), anything AI-generated, weapon / gunshot / death-scream sounds and Kenney’s military voice lines (not suitable for kids).',
          'Music: all of our music is our own work (CC0): original compositions and our own arrangements of public-domain melodies (traditional tunes and hymns / carols / nursery songs published before 1900), synthesised from scratch — no samples and no recordings by anyone else, so there is nothing for Content ID to match. No credit text is needed (we include none of the CC-BY tracks that would need one).',
          'Beat markers: music tracks carry their tempo and beat grid in pack.json (b = BPM, m = beats per bar, o = first beat, sec = sections, dr = drops). Our own tracks were written to that grid, so the markers are exact.', '',
          '| Pack | Sounds | Licence | Source |', '|---|---|---|---|']
    for p in idx['packs']: m = allp[p['dir']]; L_.append(f"| {m['name']} | {p['count']} | {m['license']} | {m['source']} |")
    L_ += ['', 'Kenney packs: each zip’s License.txt states “License: (Creative Commons Zero, CC0) http://creativecommons.org/publicdomain/zero/1.0/ — free to use in personal, educational and commercial projects”.',
           'Yellowstone Sound Library: “These sounds are in the public domain. They may be downloaded and used without limitation; however, please credit the National Park Service where appropriate.” Credits: NPS & MSU Acoustic Atlas.',
           'Wikimedia Commons: each file’s licence was read from Commons’ own file metadata (License = cc0 / pd, AttributionRequired = false) by tools/sounds/crawl_commons.py and is listed per file below.',
           'OpenGameArt.org: a page was used only when its licence field lists exactly one licence, CC0 (checked by tools/sounds/crawl_oga.py). Pages used:', '']
    for slug, meta in OGA.items():
        if slug in SKIP_PAGES or not meta['files']: continue
        L_.append(f"- {meta['title']} — {meta['author']} — CC0 — {meta['url']}")
    L_ += ['', '### Per-file credits (Wikimedia Commons and NPS)', '', '| Sound | Licence | Author | Original |', '|---|---|---|---|']
    for k in ('commons-cc0', 'nps-yellowstone'):
        for it in allp.get(k, {}).get('items', []): L_.append(f"| {it['n']} | {it.get('l', '')} | {it.get('a', '').replace('|', '/')} | {it.get('s', '')} |")
    old = open(os.path.join(ROOT, 'LICENSES.md')).read(); tail = old[old.index('## Speech engine'):]
    open(os.path.join(ROOT, 'LICENSES.md'), 'w').write('\n'.join(L_) + '\n\n' + tail)
    print('index: music', nm, 'sfx', ns)

if __name__ == '__main__':
    packs = {}
    what = os.environ.get('WHAT', 'all')
    if what in ('all', 'music'): build_music(packs)
    else: packs['emmavengers-originals-music-2'] = json.load(open(f'{LIB}/emmavengers-originals-music-2/pack.json'))['items']
    if what in ('all', 'sfx'): build_sfx(packs)
    else:
        for k in PACK_META:
            if PACK_META[k]['kind'] == 'sfx' and os.path.exists(f'{LIB}/{k}/pack.json'): packs[k] = json.load(open(f'{LIB}/{k}/pack.json'))['items']
    write_index_and_licences(packs)

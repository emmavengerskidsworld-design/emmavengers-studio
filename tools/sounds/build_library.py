"""Build the Studio sound library (lib/sounds/) from verified CC0 / public-domain sources.
   python3 tools/sounds/build_library.py [SRC_DIR=/workspace/sfx-src]
Every sound is: decoded -> silence trimmed -> long recordings cut to their liveliest part -> loudness normalised
(BS.1770: effects -16 LUFS short-term max, ambiences -20 LUFS, music -16 LUFS) with peaks <= -1 dBFS -> MP3.
Writes lib/sounds/<pack>/pack.json, lib/sounds/index.json and LICENSES.md (one line per source + per-file credits).
To add a pack later: put its files + a pack.json in lib/sounds/<dir>/ and add one entry to index.json."""
import json, re, subprocess, sys, os, hashlib, glob
import numpy as np, requests
from scipy.signal import lfilter
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))); LIB = os.path.join(ROOT, 'lib/sounds')
SRC = sys.argv[1] if len(sys.argv) > 1 else '/workspace/sfx-src'; SR = 48000
UA = {'User-Agent': 'EmmavengersStudioBot/1.0 (https://github.com/emmavengerskidsworld-design/emmavengers-studio; CC0 sound library builder)'}
AMBIENT = {'nature', 'weather', 'bible'}

# ---------------- loudness (ITU-R BS.1770-4) ----------------
def _bq(b0, b1, b2, a0, a1, a2): return np.array([b0, b1, b2]) / a0, np.array([a0, a1, a2]) / a0
def kweight(x):
    import math
    f0, G, Q = 1681.974450955533, 3.999843853973347, 0.7071752369554196; K = math.tan(math.pi * f0 / SR); Vh = 10 ** (G / 20); Vb = Vh ** 0.4996667741545416
    a0 = 1 + K / Q + K * K; b, a = _bq(Vh + Vb * K / Q + K * K, 2 * (K * K - Vh), Vh - Vb * K / Q + K * K, a0, 2 * (K * K - 1), 1 - K / Q + K * K)
    y = lfilter(b, a, x, axis=-1)
    f0, Q = 38.13547087602444, 0.5003270373238773; K = math.tan(math.pi * f0 / SR)
    b, a = _bq(1, -2, 1, 1 + K / Q + K * K, 2 * (K * K - 1), 1 - K / Q + K * K)  # rbj-like high-pass as in BS.1770
    return lfilter(b, a, y, axis=-1)
def blocks(x, B=0.4, H=0.1):
    y = kweight(np.atleast_2d(x)); p = np.sum(y ** 2, axis=0); n, b, h = len(p), int(B * SR), int(H * SR)
    if n < b: return np.array([p.mean()]) if n else np.array([0.0])
    c = np.concatenate([[0], np.cumsum(p)]); idx = np.arange(0, n - b + 1, h); return (c[idx + b] - c[idx]) / b
L = lambda v: -0.691 + 10 * np.log10(np.maximum(v, 1e-12))
def integrated(x):
    z = blocks(x); g = z[L(z) > -70]
    if not len(g): return -99.0
    g = g[L(g) > L(g.mean()) - 10]; return float(L(g.mean())) if len(g) else -99.0
def short_term_max(x): z = blocks(x, 3.0 if np.atleast_2d(x).shape[1] > 3 * SR else 0.4, 0.1); return float(L(z.max()))

# ---------------- io ----------------
def decode(path):
    r = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True)
    a = np.frombuffer(r.stdout, np.float32).reshape(-1, 2).T.astype(np.float64)
    return a if np.max(np.abs(a[0] - a[1])) > 1e-3 else a[:1]   # mono when both channels are the same
def encode(x, path, music=False):
    stereo = x.shape[0] == 2; br = '160k' if music else ('128k' if stereo else '96k')
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'f32le', '-ar', str(SR), '-ac', str(x.shape[0]), '-i', '-', '-c:a', 'libmp3lame', '-b:a', br, '-ar', '44100', path], stdin=subprocess.PIPE)
    p.communicate(np.ascontiguousarray(x.T, dtype=np.float32).tobytes())
def trim(x, thr_db=-50, keep=0.02):
    m = np.max(np.abs(x), axis=0); T = 10 ** (thr_db / 20) * max(1e-9, m.max()) if m.max() > 0 else 1
    T = max(T, 10 ** (-60 / 20)); idx = np.nonzero(m > T)[0]
    if not len(idx): return x
    a, b = max(0, idx[0] - int(keep * SR)), min(x.shape[1], idx[-1] + int(keep * SR) + 1); return x[:, a:b]
def liveliest(x, maxdur):
    n = int(maxdur * SR)
    if x.shape[1] <= n: return x
    e = np.convolve(np.sum(x ** 2, axis=0), np.ones(SR // 10), 'same'); c = np.concatenate([[0], np.cumsum(e)])
    starts = np.arange(0, x.shape[1] - n, SR // 4); s = starts[np.argmax(c[starts + n] - c[starts])]
    y = x[:, s:s + n].copy(); f = int(0.25 * SR); y[:, :f] *= np.linspace(0, 1, f); y[:, -f:] *= np.linspace(1, 0, f); return y
def loudnorm(x, kind, cat):
    if kind == 'music': cur, tgt = integrated(x), -16.0
    elif cat in AMBIENT: cur, tgt = integrated(x), -20.0
    else: cur, tgt = short_term_max(x), -16.0
    g = 10 ** ((tgt - cur) / 20) if cur > -90 else 1.0
    pk = np.max(np.abs(x)) * g; lim = 10 ** (-1 / 20)
    if pk > lim: g *= lim / pk          # never clip: peaks stay at or below -1 dBFS
    return x * g
def process(path, kind, cat, out, maxdur=None):
    if os.path.exists(out) and os.path.getmtime(out) > os.path.getmtime(path) and os.environ.get('REBUILD') != '1':   # already built: reuse
        x = decode(out); return round(x.shape[1] / SR, 2), round(integrated(x), 1), round(20 * np.log10(np.max(np.abs(x)) + 1e-12), 1)
    x = decode(path)
    if x.size == 0: raise ValueError('empty')
    x = trim(x)
    if maxdur is None: maxdur = 9999 if kind == 'music' else (30 if cat in AMBIENT else 12)
    x = liveliest(x, maxdur)
    x = loudnorm(x, kind, cat); encode(x, out, kind == 'music')
    y = x if x.shape[0] == 1 else x
    return round(x.shape[1] / SR, 2), round(integrated(x), 1), round(20 * np.log10(np.max(np.abs(x)) + 1e-12), 1)

# ---------------- sources ----------------
def kenney_items():
    rules = [  # pack, file regex -> (kind, cat, nice name, tags) ; excluded: war_* voice lines, knives, previews
        ('interface-sounds', r'.*', 'sfx', 'game', None, ['ui', 'button', 'click']),
        ('ui-audio', r'.*', 'sfx', 'game', None, ['ui', 'click', 'switch']),
        ('digital-audio', r'.*', 'sfx', 'game', None, ['retro', 'game', 'laser', 'power up']),
        ('casino-audio', r'.*', 'sfx', 'game', None, ['cards', 'dice', 'chips', 'board game']),
        ('sci-fi-sounds', r'.*', 'sfx', 'game', None, ['space', 'sci-fi', 'robot']),
        ('impact-sounds', r'footstep', 'sfx', 'household', None, ['footsteps', 'walk']),
        ('impact-sounds', r'impactBell', 'sfx', 'instruments', None, ['bell', 'hit']),
        ('impact-sounds', r'impactPunch|impactSoft|impactGeneric', 'sfx', 'cartoon', None, ['hit', 'bump', 'thud']),
        ('impact-sounds', r'impact', 'sfx', 'household', None, ['hit', 'knock', 'clatter']),
        ('rpg-audio', r'book|door|creak|cloth|footstep|coins|metalPot|metalLatch|metalClick|chop|beltHandle|dropLeather|handleSmallLeather', 'sfx', 'household', None, ['book', 'door', 'everyday']),
        ('voiceover-pack', r'^(?!.*war_).*', 'sfx', 'voices', None, ['announcer', 'voice', 'game show']),
        ('music-jingles', r'jingles', 'music', 'jingles', None, ['jingle', 'stinger', 'intro', 'outro']),
    ]
    out = []
    for d in sorted(glob.glob(f'{SRC}/kenney/*/')):
        pk = os.path.basename(d.rstrip('/')); lic = open(glob.glob(d + '*icense*')[0], errors='ignore').read()
        assert 'CC0' in lic or 'Creative Commons Zero' in lic, pk
        files = sorted(f for f in glob.glob(d + '**/*', recursive=True) if re.search(r'\.(ogg|wav|mp3)$', f, re.I) and 'Preview' not in f)
        for f in files:
            base = os.path.splitext(os.path.basename(f))[0]
            if re.search(r'knife|drawKnife|war_', base, re.I): continue
            sub = os.path.relpath(os.path.dirname(f), d)
            for p_, rx, kind, cat, nm, tags in rules:
                if p_ == pk and re.search(rx, base):
                    name = re.sub(r'([a-z])([A-Z])', r'\1 \2', base).replace('_', ' ').replace('-', ' ').strip()
                    if pk == 'voiceover-pack': name = ('Female: ' if 'emale' in sub else 'Male: ' if 'ale' in sub else '') + (name if not name.isdigit() else 'Number ' + name)
                    if pk == 'music-jingles': name = 'Jingle ' + name.replace('jingles ', '').title()
                    name = re.sub(r'\s+', ' ', name).strip(); name = name[0].upper() + name[1:]
                    if pk == 'voiceover-pack' and re.search(r'congratulations|you_win|new_highscore|level_up|correct|mission_completed|objective_achieved', base): cat = 'cheers'
                    out.append(dict(pack='kenney-' + pk, src=f, kind=kind, cat=cat, name=name, tags=tags + [w.lower() for w in re.findall(r'[A-Za-z]+', base)][:3]))
                    break
    return out
# hand-picked Commons files (licence re-checked from Commons metadata in crawl.py: CC0 or public domain, no attribution required)
COMMONS = {
 'Sheep bleating.ogg': ('Sheep bleating', 'animals', ['sheep', 'lamb', 'farm']), 'Sheep bleat.ogg': ('Sheep bleat (short)', 'animals', ['sheep', 'baa']),
 'Herd of goats bleating.ogg': ('Goats bleating', 'animals', ['goat', 'farm', 'herd']), 'Cow in Vezo.ogg': ('Cow moo 1', 'animals', ['cow', 'moo', 'farm']),
 'Cow in Antefasy.wav': ('Cow moo 2', 'animals', ['cow', 'moo', 'farm']), 'felix-blume a-donkey-is-braying': ('Donkey braying', 'animals', ['donkey', 'hee haw', 'bethlehem']),
 'Bray (avk).wav': ('Donkey bray (short)', 'animals', ['donkey', 'hee haw']), 'Small rooster crowing.ogg': ('Rooster crowing 1', 'animals', ['rooster', 'morning', 'peter']),
 'Medium rooster crowing.ogg': ('Rooster crowing 2', 'animals', ['rooster', 'morning', 'farm']), 'Hen announcing shes lain an egg.ogg': ('Hen clucking', 'animals', ['hen', 'chicken', 'egg']),
 'Chickens demanding food.ogg': ('Chickens', 'animals', ['chicken', 'farm']), 'Duck in Vezo.ogg': ('Duck quack', 'animals', ['duck', 'quack']),
 'Bark (avk).wav': ('Dog bark', 'animals', ['dog', 'woof', 'bark']), 'Cynomys ludovicianus barking-audio.ogg': ('Prairie dog calls', 'animals', ['prairie dog', 'squeak']),
 'Meow of a pleading cat.oga': ('Cat meowing', 'animals', ['cat', 'meow', 'kitty']), 'Meow of a Siamese cat - freemaster2.wav': ('Cat meow', 'animals', ['cat', 'meow']),
 'Elephant voice - trumpeting.ogg': ('Elephant trumpet', 'animals', ['elephant', 'zoo', 'ark']), 'Monkey in Antefasy.wav': ('Monkey', 'animals', ['monkey', 'jungle', 'zoo']),
 'Gull 2.ogg': ('Seagulls 1', 'animals', ['seagull', 'beach', 'sea']), 'Gull 1.ogg': ('Seagulls 2', 'animals', ['seagull', 'harbour', 'sea']),
 'XC707075 - European Herring Gull - Larus argentatus.mp3': ('Herring gull', 'animals', ['gull', 'sea', 'galilee']), 'Western Gull Golden Gate National Recreation Area.ogg': ('Western gull', 'animals', ['gull', 'sea']),
 'Dove cooing.ogg': ('Dove cooing', 'animals', ['dove', 'pigeon', 'peace', 'noah', 'holy spirit']), 'Wolf howls.ogg': ('Wolf howls', 'animals', ['wolf', 'howl', 'night']),
 'MarcParrot (veu).ogg': ('Parrot', 'animals', ['parrot', 'bird']), 'Parrots perroquets.ogg': ('Parrots', 'animals', ['parrot', 'jungle', 'birds']),
 'Mosquito attack.ogg': ('Mosquito buzz', 'animals', ['mosquito', 'insect', 'buzz']),
 'Bones breaking wood fire ice crackling.ogg': ('Fire crackling', 'nature', ['fire', 'crackle', 'campfire']),
 'Rain (1).ogg': ('Rain', 'weather', ['rain', 'shower']), 'Rain and thunder.ogg': ('Rain and thunder', 'weather', ['rain', 'thunder', 'storm']),
 'Rain on a veranda and t.ogg': ('Rain on a veranda', 'weather', ['rain', 'porch']), 'Rain against the window.ogg': ('Rain on the window', 'weather', ['rain', 'window', 'cozy']),
 'Rain thunder and birds.ogg': ('Rain, thunder and birds', 'weather', ['rain', 'thunder', 'birds']), 'Rain and thunder (1).ogg': ('Thunderstorm', 'weather', ['thunder', 'storm', 'rain', 'flood']),
 'Thunder and rain on a v.ogg': ('Thunder and rain', 'weather', ['thunder', 'rain']), 'Howling wind.ogg': ('Howling wind', 'weather', ['wind', 'storm', 'howl']),
 'Knocking on wood or door.ogg': ('Knock on wood', 'household', ['knock', 'door']), 'Door knocker audio.ogg': ('Door knocker', 'household', ['knock', 'door', 'visitor']),
 'Knock on door.wav': ('Knock on the door', 'household', ['knock', 'door']), 'Door handle creaking.ogg': ('Door handle creak', 'household', ['door', 'creak', 'spooky']),
 'Metal cabinet door jarring.ogg': ('Cabinet door', 'household', ['cupboard', 'door', 'metal']), 'Clock ticking.ogg': ('Clock ticking', 'household', ['clock', 'tick', 'time']),
 'Alarm clock ticking.ogg': ('Alarm clock ticking', 'household', ['clock', 'tick']), 'LA2 kitchen clock.ogg': ('Kitchen clock', 'household', ['clock', 'tick', 'kitchen']),
 'Alarm Clock (Directory.Audio).mp3': ('Alarm clock ringing', 'household', ['alarm', 'wake up', 'morning']), 'Telephone.ogg': ('Telephone ringing', 'household', ['phone', 'ring', 'call']),
 'Electric kettle and a gastherme.ogg': ('Kettle boiling', 'household', ['kettle', 'tea', 'kitchen']), 'typewriter-ding-near-mono.wav': ('Typewriter ding', 'household', ['typewriter', 'ding', 'bell']),
 'Toilet flush.flac': ('Toilet flush', 'household', ['toilet', 'flush', 'funny']), 'Doorbell-old-tring.ogg': ('Doorbell (old)', 'household', ['doorbell', 'ring']),
 'Doorbell-classic-dingdong.ogg': ('Doorbell ding-dong', 'household', ['doorbell', 'ding dong', 'visitor']), 'Doorbell-cheap-dingdong.ogg': ('Doorbell (short)', 'household', ['doorbell', 'ding dong']),
 'Electronic doorbell.ogg': ('Electronic doorbell', 'household', ['doorbell', 'chime']), 'Sound Effect - Door Bell.ogg': ('Door bell', 'household', ['doorbell']),
 'Taiwan railways EP727 train cars sounds.ogg': ('Train passing', 'household', ['train', 'travel', 'railway']),
 'Douzen kids on playground.ogg': ('Kids on the playground', 'cheers', ['children', 'kids', 'play', 'school']), 'Indoor swimming pool children.ogg': ('Kids at the pool', 'cheers', ['children', 'swimming', 'fun']),
 'Church bells - Leverkusen, 2007.oga': ('Church bells', 'instruments', ['church', 'bells', 'sunday', 'wedding']), 'Sound of church bells and birds.oga': ('Church bells and birds', 'bible', ['church', 'bells', 'birds', 'village']),
 'String harmonic overtones on a harp.oga': ('Harp harmonics', 'instruments', ['harp', 'heaven', 'david']), "Jew's harp example.ogg": ('Mouth harp boing', 'funny', ['mouth harp', 'boing', 'twang']),
 'Drum Roll Intro.ogg': ('Drum roll intro', 'instruments', ['drum roll', 'intro']), 'Drum Roll - Concert Band - United States Air Force Band.mp3': ('Concert drum roll', 'instruments', ['drum roll', 'announcement']),
 'Cymbal sounds.ogg': ('Cymbals', 'instruments', ['cymbal', 'crash']), 'CrashCymbalSample.ogg': ('Crash cymbal', 'instruments', ['cymbal', 'crash', 'hit']),
 'Natural trumpet B-flat.ogg': ('Natural trumpet', 'instruments', ['trumpet', 'fanfare', 'jericho']), 'Trumpet cornet.ogg': ('Cornet', 'instruments', ['trumpet', 'cornet']),
 '02. B3-flat-trumpet.ogg': ('Trumpet note B♭', 'instruments', ['trumpet', 'note']), '05. D5-trumpet.ogg': ('Trumpet note D', 'instruments', ['trumpet', 'note']), '06. F5-trumpet.ogg': ('Trumpet note F', 'instruments', ['trumpet', 'note']),
 'Flute 3.ogg': ('Flute melody 1', 'instruments', ['flute', 'shepherd']), 'Flute 2.ogg': ('Flute melody 2', 'instruments', ['flute', 'shepherd']),
 'Tambourine.ogg': ('Tambourine', 'instruments', ['tambourine', 'miriam', 'praise']), 'Headless tambourine.wav': ('Tambourine shake', 'instruments', ['tambourine', 'shake']),
 'Gong or bell vibrant (short).ogg': ('Gong (short)', 'instruments', ['gong', 'bell']), 'Gong55.ogg': ('Gong', 'instruments', ['gong']), 'chinese-gong-finish': ('Big gong', 'instruments', ['gong', 'finish']),
 'Windchimes.ogg': ('Wind chimes', 'instruments', ['chimes', 'wind', 'dream']), 'Windchime.ogg': ('Wind chime', 'instruments', ['chimes', 'calm']), 'C Major Scale Ukulele.ogg': ('Ukulele scale', 'instruments', ['ukulele', 'scale']),
 'Sneezing 0.ogg': ('Sneeze 1', 'voices', ['sneeze', 'achoo', 'funny']), 'Sneeze.ogg': ('Sneeze 2', 'voices', ['sneeze', 'achoo']), 'Sneezing.ogg': ('Sneeze 3', 'voices', ['sneeze', 'achoo']),
 'Baby sneeze.ogg': ('Baby sneeze', 'voices', ['baby', 'sneeze', 'cute']), 'Soft whistle.ogg': ('Soft whistle', 'voices', ['whistle']), 'Human whistling.ogg': ('Whistle', 'voices', ['whistle', 'hey']),
 'Burp.ogg': ('Burp', 'voices', ['burp', 'funny']), 'Woman humming a nondescript tune.wav': ('Humming', 'voices', ['humming', 'happy']),
 'Shopping mall less crowded.ogg': ('Crowd murmur', 'bible', ['crowd', 'people', 'market', 'murmur']),
 'sandermotions applause-2.wav': ('Applause and cheers', 'cheers', ['applause', 'clap', 'cheer', 'yay']), 'Applause i.ogg': ('Applause 1', 'cheers', ['applause', 'clap']),
 'Applause ii.ogg': ('Applause 2', 'cheers', ['applause', 'clap']), 'Clapping hurray (cropped).oga': ('Clapping and hooray', 'cheers', ['hooray', 'hurray', 'clap', 'cheer', 'yay']),
 'Slow starting applause.ogg': ('Applause building up', 'cheers', ['applause', 'clap', 'audience']), 'Sound Effects - Applause after a concert.ogg': ('Concert applause', 'cheers', ['applause', 'audience', 'concert']),
 'Clapping for Carers in Oxford, April 2020.opus': ('Street clapping', 'cheers', ['clap', 'applause', 'neighbours']), 'Ohhh ahhh.ogg': ('Crowd ooh and aah', 'cheers', ['ooh', 'aah', 'crowd', 'wow']),
}
EXTRA_COMMONS = [k for k in ['File:277021 sandermotions applause-2.wav', 'File:Applause i.ogg', 'File:Applause ii.ogg', 'File:Clapping hurray (cropped).oga', 'File:Slow starting applause.ogg',
                 'File:Sound Effects - Applause after a concert.ogg', 'File:Clapping for Carers in Oxford, April 2020.opus', 'File:Ohhh ahhh.ogg']]
def extra_commons(cand):
    """Add hand-picked files found after the category crawl (licence read from Commons metadata the same way)."""
    have = {c['title'] for c in cand}; todo = [t for t in EXTRA_COMMONS if t not in have]
    if not todo: return cand
    r = requests.get('https://commons.wikimedia.org/w/api.php', params=dict(action='query', format='json', titles='|'.join(todo), prop='imageinfo', iiprop='url|extmetadata', iiextmetadatafilter='License|Artist|AttributionRequired'), headers=UA, timeout=60).json()
    for pg in r['query']['pages'].values():
        ii = pg['imageinfo'][0]; md = ii.get('extmetadata', {}); lic = md.get('License', {}).get('value', '').lower()
        if not (lic == 'cc0' or lic.startswith('pd')) or md.get('AttributionRequired', {}).get('value', 'false') == 'true': print('  not CC0/PD, skipped:', pg['title'], lic); continue
        artist = re.sub(r'<[^>]+>', '', md.get('Artist', {}).get('value', '')).strip()
        cand.append(dict(cat='cheers', stem='extra', title=pg['title'], url=ii['url'], page=ii['descriptionurl'], license=lic, artist=artist, len=0))
    json.dump(cand, open(f'{SRC}/commons/candidates.json', 'w'), indent=1); return cand
NPS = {  # file name fragment -> (name, cat, tags)
 'YELLWolves20160111': ('Wolf pack howling', 'animals', ['wolf', 'howl', 'night']), 'YELLWolvesDec252013': ('Wolves howling', 'animals', ['wolf', 'howl']),
 'yell-Coyotes.mp3': ('Coyotes yipping', 'animals', ['coyote', 'night']), 'ElkBugle1': ('Elk bugle', 'animals', ['elk', 'deer', 'call']), 'YELLBisonEating': ('Bison grazing', 'animals', ['bison', 'buffalo']),
 'YELL-BisonRut': ('Bison bellowing', 'animals', ['bison', 'buffalo', 'roar']), 'ChorusFrogs': ('Chorus frogs', 'animals', ['frog', 'croak', 'pond', 'plague']), 'BorealfrogSACRWISN': ('Boreal frog', 'animals', ['frog', 'pond']),
 'SpadefootToads': ('Spadefoot toads', 'animals', ['toad', 'frog', 'night']), 'YELLAMRO': ('American robin song', 'animals', ['robin', 'bird', 'spring']), 'YELLWEME': ('Meadowlark song', 'animals', ['meadowlark', 'bird', 'field']),
 'YELLCOLO': ('Common loon call', 'animals', ['loon', 'lake', 'bird']), 'RavenBlackSandBasin': ('Raven calls', 'animals', ['raven', 'crow', 'elijah', 'noah']), 'YELLEagle140829': ('Eagle calls', 'animals', ['eagle', 'bird']),
 'YELLCAGE': ('Canada geese', 'animals', ['geese', 'goose', 'honk']), 'YELLFLBCSACR': ('Sandhill cranes', 'animals', ['crane', 'bird', 'call']), 'RuffedGrouse': ('Ruffed grouse drumming', 'animals', ['grouse', 'drumming', 'forest']),
 'yell-Snipe': ('Snipe winnowing', 'animals', ['snipe', 'bird']), 'YELLredwingedblackbird': ('Red-winged blackbird', 'animals', ['blackbird', 'marsh', 'bird']), 'YELLSGYredsquirrel': ('Red squirrel chatter', 'animals', ['squirrel', 'forest']),
 'redfox': ('Red fox calls', 'animals', ['fox', 'night']), 'YELLUintagroundsquirrel': ('Ground squirrel', 'animals', ['squirrel', 'chirp']), 'YELLDawnChorus': ('Dawn chorus', 'nature', ['birds', 'morning', 'dawn', 'creation']),
 'Thunderandbirds': ('Thunder and birds', 'weather', ['thunder', 'birds', 'storm']), 'WindInTrees': ('Wind in the trees', 'nature', ['wind', 'trees', 'forest']), 'CabinSoundsWind': ('Wind at the cabin', 'weather', ['wind', 'cabin']),
 'YELLMapleFire20160814T04': ('Forest fire crackling', 'nature', ['fire', 'crackle']), 'PealeCabinWoodstove': ('Wood stove fire', 'household', ['fire', 'stove', 'cozy']), 'ChopKindling': ('Chopping kindling', 'household', ['chop', 'wood', 'axe']),
 'YELLSplitLogs': ('Splitting logs', 'household', ['wood', 'axe', 'chop']), 'YELLLakeSoundscape20160913': ('Lake shore', 'nature', ['lake', 'water', 'calm', 'galilee']), 'YellowstoneLakeSings': ('Singing lake ice', 'nature', ['lake', 'ice', 'strange']),
 'DipperandGeeseFireholeRiver': ('River with birds', 'nature', ['river', 'water', 'jordan', 'birds']), 'GeyserHillStreamOffBoardwalk': ('Stream and wind', 'nature', ['stream', 'water', 'wind']),
 'OldFaithful11162014': ('Geyser eruption', 'nature', ['geyser', 'water', 'steam']), 'BlackSandPoolImplodingBubbles': ('Bubbling hot spring', 'nature', ['bubbles', 'water', 'spring']),
 'YELLhorsebackriders': ('Horseback riders', 'animals', ['horse', 'riding', 'hooves']), 'GrizzlyBearVocalizations': ('Grizzly bear growls', 'animals', ['bear', 'growl', 'david']),
}
def fetch(url, dest):
    if os.path.exists(dest) and os.path.getsize(dest) > 100: return dest
    import time
    for i in range(6):   # be polite to Wikimedia / NPS: pause between files, back off on 429
        time.sleep(2)
        r = requests.get(url.split('?')[0], headers=UA, timeout=120)
        if r.status_code == 429: time.sleep(30 * (i + 1)); continue
        r.raise_for_status(); open(dest, 'wb').write(r.content); return dest
    raise RuntimeError('rate limited')
def commons_items():
    cand = extra_commons(json.load(open(f'{SRC}/commons/candidates.json'))); os.makedirs(f'{SRC}/commons/files', exist_ok=True); out = []
    for c in cand:
        key = next((k for k in COMMONS if k in c['title']), None)
        if not key: continue
        name, cat, tags = COMMONS[key]; url = c['url'].split('?')[0]; ext = os.path.splitext(url)[1]; dest = f'{SRC}/commons/files/' + hashlib.md5(url.encode()).hexdigest()[:10] + ext
        try: fetch(c['url'], dest)
        except Exception as e: print('download failed', c['title'], e); continue
        out.append(dict(pack='commons-cc0', src=dest, kind='sfx', cat=cat, name=name, tags=tags, author=c['artist'] or 'Wikimedia Commons contributor', license=('CC0-1.0' if c['license'].lower() == 'cc0' else 'Public domain'), source=c['page'], title=c['title']))
    return out
def nps_items():
    cand = json.load(open(f'{SRC}/nps/candidates.json')); os.makedirs(f'{SRC}/nps/files', exist_ok=True); out, used = [], set()
    for c in cand:
        fn = c['url'].split('/')[-1]; key = next((k for k in NPS if k in fn and k not in used), None)
        if not key: continue
        used.add(key); name, cat, tags = NPS[key]; dest = f'{SRC}/nps/files/' + fn
        try: fetch(c['url'], dest)
        except Exception as e: print('download failed', fn, e); continue
        out.append(dict(pack='nps-yellowstone', src=dest, kind='sfx', cat=cat, name=name, tags=tags, author='U.S. National Park Service (Yellowstone sound library)', license='Public domain', source=c['page']))
    return out
def originals_items():
    out = []
    for f in ('items-sfx.json', 'items-music.json'):
        for it in json.load(open(f'{SRC}/originals/{f}')):
            out.append(dict(pack='emmavengers-originals' + ('-music' if it['kind'] == 'music' else ''), src=f'{SRC}/originals/{it["id"]}.wav', kind=it['kind'], cat=it['cat'], name=it['name'], tags=it['tags']))
    return out

PACK_META = {
 'emmavengers-originals': dict(name='Emmavengers Originals (sound effects)', kind='sfx', license='CC0-1.0', author='Emmavengers Studio', source='Made from scratch with plain synthesis maths: tools/sounds/synth.py (no samples, no AI)'),
 'emmavengers-originals-music': dict(name='Emmavengers Originals (music)', kind='music', license='CC0-1.0', author='Emmavengers Studio', source='Our own arrangements of public-domain melodies (Twinkle Twinkle, Brahms’ Lullaby, Ode to Joy, Amazing Grace, Joy to the World, Jesus Loves Me, Row Your Boat) and our own compositions, synthesised with tools/sounds/synth.py (no samples, no AI)'),
 'bible-ambience': dict(name='Bible-story ambiences', kind='sfx', license='CC0-1.0', author='Emmavengers Studio (mixed from the CC0 / public-domain sounds in this library)', source='tools/sounds/build_library.py (bible_mixes)'),
 'commons-cc0': dict(name='Wikimedia Commons (CC0 / public domain)', kind='sfx', license='CC0-1.0 or Public domain (per file, see LICENSES.md)', author='Wikimedia Commons contributors', source='https://commons.wikimedia.org'),
 'nps-yellowstone': dict(name='Yellowstone Sound Library (U.S. National Park Service)', kind='sfx', license='Public domain', author='U.S. National Park Service', source='https://www.nps.gov/yell/learn/photosmultimedia/soundlibrary.htm'),
}
for k, t in [('interface-sounds', 'Interface Sounds'), ('ui-audio', 'UI Audio'), ('digital-audio', 'Digital Audio'), ('casino-audio', 'Casino Audio'), ('sci-fi-sounds', 'Sci-fi Sounds'), ('impact-sounds', 'Impact Sounds'), ('rpg-audio', 'RPG Audio'), ('voiceover-pack', 'Voiceover Pack'), ('music-jingles', 'Music Jingles')]:
    PACK_META['kenney-' + k] = dict(name='Kenney — ' + t, kind='music' if k == 'music-jingles' else 'sfx', license='CC0-1.0', author='Kenney (www.kenney.nl)', source=f'https://kenney.nl/assets/{k}')

def bible_mixes(done):
    """Bible-story ambiences: layered from processed CC0/PD sounds of this library (30 s each)."""
    def get(name):
        it = next((i for i in done if i['name'] == name), None)
        return decode(it['out']) if it else None
    def lay(spec, D=30):
        mix = np.zeros((2, int(D * SR)))
        for name, gain, at, loop in spec:
            x = get(name)
            if x is None: print('   (bible mix: missing', name, ')'); continue
            if x.shape[0] == 1: x = np.vstack([x, x])
            s = int(at * SR)
            while s < mix.shape[1]:
                n = min(x.shape[1], mix.shape[1] - s); mix[:, s:s + n] += x[:, :n] * gain; s += x.shape[1] if loop else mix.shape[1]
        f = int(1.5 * SR); mix[:, :f] *= np.linspace(0, 1, f); mix[:, -f:] *= np.linspace(1, 0, f); return mix
    M = [
        ('shepherds-field', "Shepherds' field at night", ['shepherds', 'bethlehem', 'christmas', 'night', 'sheep'], [('Night crickets (synth)', .8, 0, True), ('Gentle wind (synth)', .35, 0, True), ('Sheep bleating', .5, 3, False), ('Sheep bleat (short)', .5, 14, False), ('Goats bleating', .3, 20, False)]),
        ('stormy-galilee', 'Stormy Sea of Galilee', ['storm', 'jesus calms the storm', 'sea', 'waves', 'disciples'], [('Ocean waves (synth)', 1.0, 0, True), ('Strong wind (synth)', .7, 0, True), ('Thunder 1 (synth)', .8, 4, False), ('Thunder 2 (synth)', .7, 17, False), ('Heavy rain (synth)', .4, 0, True)]),
        ('noahs-rain', "Noah's rain", ['noah', 'ark', 'flood', 'rain', 'storm'], [('Heavy rain (synth)', 1.0, 0, True), ('Thunder 3 (synth)', .8, 2, False), ('Thunderstorm', .5, 10, False), ('Thunder 1 (synth)', .6, 22, False)]),
        ('desert-journey', 'Desert journey', ['desert', 'exodus', 'wilderness', 'wind', 'moses'], [('Desert wind (synth)', 1.0, 0, True), ('Footstep grass 000', .3, 2, False), ('Footstep grass 001', .3, 2.6, False), ('Footstep grass 002', .3, 3.2, False), ('Wind chime', .25, 8, False)]),
        ('bethlehem-stable', 'Bethlehem stable', ['manger', 'christmas', 'stable', 'animals', 'jesus born'], [('Night crickets (synth)', .6, 0, True), ('Cow moo 1', .6, 2, False), ('Donkey bray (short)', .5, 9, False), ('Sheep bleat (short)', .5, 15, False), ('Hen clucking', .25, 20, False), ('Cow moo 2', .5, 25, False)]),
        ('walls-of-jericho', 'Walls of Jericho', ['jericho', 'joshua', 'trumpets', 'shout', 'walls'], [('Crowd murmur', .5, 0, True), ('Natural trumpet', .8, 3, False), ('Fanfare 1', .6, 9, False), ('Natural trumpet', .8, 14, False), ('Whoosh + boom 2', 1.0, 20, False)]),
        ('jordan-river', 'Jordan River', ['jordan', 'baptism', 'river', 'john the baptist'], [('River with birds', 1.0, 0, True), ('Babbling brook (synth)', .4, 0, True), ('Dove cooing', .5, 10, False)]),
        ('garden-of-eden', 'Garden of Eden', ['eden', 'creation', 'garden', 'adam and eve', 'birds'], [('Dawn chorus', 1.0, 0, True), ('Babbling brook (synth)', .4, 0, True), ('American robin song', .4, 8, False), ('Meadowlark song', .4, 18, False)]),
        ('lakeside-campfire', 'Lakeside campfire', ['peter', 'fish', 'breakfast', 'campfire', 'galilee'], [('Campfire crackle (synth)', .9, 0, True), ('Lake shore', .6, 0, True), ('Night crickets (synth)', .3, 0, True)]),
        ('davids-hillside', "David's hillside", ['david', 'shepherd', 'harp', 'psalm', 'sheep'], [('Gentle wind (synth)', .5, 0, True), ('Harp glissando up', .6, 2, False), ('Sheep bleating', .4, 8, False), ('Harp glissando down', .6, 15, False), ('Meadowlark song', .3, 22, False)]),
        ('fishing-boat', 'Fishing boat on the lake', ['fishermen', 'boat', 'nets', 'disciples', 'galilee'], [('Ocean waves (synth)', .6, 0, True), ('Herring gull', .5, 3, False), ('Seagulls 1', .4, 16, False), ('Gentle wind (synth)', .3, 0, True)]),
        ('village-market', 'Village market', ['market', 'crowd', 'jerusalem', 'people', 'town'], [('Crowd murmur', 1.0, 0, True), ('Chickens', .3, 5, False), ('Donkey braying', .3, 14, False)]),
        ('creation-light', 'Let there be light', ['creation', 'light', 'genesis', 'magic', 'beginning'], [('Riser 6s', .5, 0, False), ('Magic rise 4', .7, 4, False), ('Chime tree', .6, 9, False), ('Dawn chorus', .6, 10, True)]),
        ('lions-den', "Daniel in the lions' den", ['daniel', 'lions', 'den', 'cave', 'night'], [('Night crickets (synth)', .3, 0, True), ('Grizzly bear growls', .7, 3, False), ('Grizzly bear growls', .6, 17, False), ('Gentle wind (synth)', .3, 0, True)]),
        ('angels-sing', 'Angels in the sky', ['angels', 'christmas', 'heaven', 'glory', 'shepherds'], [('Glitter shimmer 1', .6, 0, False), ('Harp glissando up and down', .6, 2, False), ('Fairy chime 1', .5, 9, False), ('Glitter shimmer 2', .6, 12, False), ('Chime tree', .5, 20, False)]),
    ]
    out = []
    os.makedirs(f'{LIB}/bible-ambience', exist_ok=True)
    for id_, name, tags, spec in M:
        x = lay(spec); x = loudnorm(x, 'sfx', 'bible'); f = f'{LIB}/bible-ambience/{id_}.mp3'; encode(x, f)
        out.append(dict(pack='bible-ambience', f=id_ + '.mp3', n=name, c='bible', t=tags, d=round(x.shape[1] / SR, 2), lufs=round(integrated(x), 1)))
    return out

def main():
    srcs = originals_items() + kenney_items() + commons_items() + nps_items()
    print('sources:', len(srcs))
    packs, done, seen = {}, [], {}
    for it in srcs:
        d = f'{LIB}/{it["pack"]}'; os.makedirs(d, exist_ok=True)
        slug = re.sub(r'[^a-z0-9]+', '-', it['name'].lower()).strip('-')[:40] or 'sound'; k = (it['pack'], slug); seen[k] = seen.get(k, 0) + 1
        if seen[k] > 1: slug += f'-{seen[k]}'
        out = f'{d}/{slug}.mp3'
        try: dur, lu, pk = process(it['src'], it['kind'], it['cat'], out)
        except Exception as e: print('skip', it['name'], e); continue
        if dur < 0.05: os.remove(out); continue
        rec = dict(f=slug + '.mp3', n=it['name'], c=it['cat'], t=sorted(set(it['tags'])), d=dur)
        for a, b in (('author', 'a'), ('license', 'l'), ('source', 's')):
            if it.get(a): rec[b] = it[a]
        packs.setdefault(it['pack'], []).append(rec); done.append(dict(name=it['name'], out=out)); it['lufs'], it['peak'] = lu, pk
        if len(done) % 50 == 0: print(' ', len(done), flush=True)
    for b in bible_mixes(done): packs.setdefault('bible-ambience', []).append({k: v for k, v in b.items() if k not in ('pack', 'lufs')})
    index = dict(version=1, note='Each pack: lib/sounds/<dir>/pack.json. Add a pack = add one entry here.', packs=[])
    order = ['emmavengers-originals-music', 'kenney-music-jingles', 'emmavengers-originals', 'bible-ambience', 'commons-cc0', 'nps-yellowstone'] + sorted(k for k in packs if k.startswith('kenney-') and k != 'kenney-music-jingles')
    for k in order:
        if k not in packs: continue
        m = PACK_META[k]; json.dump(dict(id=k, **m, items=packs[k]), open(f'{LIB}/{k}/pack.json', 'w'), ensure_ascii=False, separators=(',', ':'))
        index['packs'].append(dict(dir=k, name=m['name'], kind=m['kind'], license=m['license'], count=len(packs[k])))
    json.dump(index, open(f'{LIB}/index.json', 'w'), ensure_ascii=False, indent=1)
    write_licenses(index, packs)
    tot = sum(len(v) for v in packs.values()); print('packs', len(packs), 'items', tot)
def write_licenses(index, packs):
    L_ = ['# Licences', '', 'Emmavengers Studio code: © Emmavengers. Bundled third-party code and content are listed below.', '',
          '## Sound library (lib/sounds/)', '', 'Every sound in the library is **CC0 1.0** (public-domain dedication) or **public domain**. No attribution is required and all may be used in monetised YouTube / TikTok videos. We still credit every source here.',
          'Excluded on purpose: Creative-Commons-BY / BY-SA / NC sounds, “royalty-free” licences that forbid redistributing the raw sounds (e.g. the Sonniss GDC bundle licence, Pixabay licence, BBC RemArc), Freesound files that are not CC0, commercial music recordings (Content ID risk, even when old), anything AI-generated, and Kenney’s military voice lines (not suitable for kids).',
          '', '| Pack | Sounds | Licence | Source |', '|---|---|---|---|']
    for p in index['packs']: m = PACK_META[p['dir']]; L_.append(f"| {m['name']} | {p['count']} | {m['license']} | {m['source']} |")
    L_ += ['', 'Kenney packs: each zip’s License.txt states “License: (Creative Commons Zero, CC0) http://creativecommons.org/publicdomain/zero/1.0/ — free to use in personal, educational and commercial projects”.',
           'Yellowstone Sound Library: “These sounds are in the public domain. They may be downloaded and used without limitation; however, please credit the National Park Service where appropriate.” Credits: NPS & MSU Acoustic Atlas.',
           'Wikimedia Commons: each file’s licence was read from Commons’ own file metadata (License = cc0 / pd, AttributionRequired = false) by tools/sounds/crawl_commons.py and is listed per file below.', '',
           '### Per-file credits (Wikimedia Commons and NPS)', '', '| Sound | Licence | Author | Original |', '|---|---|---|---|']
    for k in ('commons-cc0', 'nps-yellowstone'):
        for it in packs.get(k, []): L_.append(f"| {it['n']} | {it.get('l', '')} | {it.get('a', '').replace('|', '/')} | {it.get('s', '')} |")
    L_ += ['', '## Speech engine (lib/kokoro-1.2.1/, downloaded model)', '',
           '- kokoro-js 1.2.1 — Apache-2.0 (lib/kokoro-1.2.1/LICENSE-kokoro-js.txt), https://github.com/hexgrad/kokoro',
           '- Transformers.js 3.5.1 + ONNX Runtime Web (bundled in kokoro.web.js / ort-wasm-simd-threaded.jsep.*) — Apache-2.0 / MIT (lib/kokoro-1.2.1/LICENSE-transformers.txt)',
           '- Kokoro-82M model weights (onnx-community/Kokoro-82M-v1.0-ONNX, 8-bit), voices af_heart, af_jessica, af_bella, am_puck, am_liam, am_fenrir — Apache-2.0; downloaded from Hugging Face on first use, not stored in this repository.',
           '- phonemizer 1.2.1 (npm, bundled in kokoro.web.js) — declared Apache-2.0; it embeds eSpeak NG, which is GPL-3.0-or-later (https://github.com/espeak-ng/espeak-ng). Shipped unmodified as part of the kokoro.web.js file.', '',
           '## Other bundled code', '', '- mp4-muxer (js/vendor/mp4-muxer.js) — MIT', '- mp4box.js (js/vendor/mp4box.all.min.js) — BSD-3-Clause', '']
    open(os.path.join(ROOT, 'LICENSES.md'), 'w').write('\n'.join(L_))
if __name__ == '__main__': main()

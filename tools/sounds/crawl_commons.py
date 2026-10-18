"""Find CC0 / public-domain sound files on Wikimedia Commons for the Studio sound library.
Every file's licence is read from Commons' own metadata (extmetadata License / LicenseShortName / AttributionRequired)."""
import requests, json, re, time
S = requests.Session(); S.headers['User-Agent'] = 'EmmavengersStudio/1.0 (CC0 sound library builder; kids video editor)'
def q(**p):
    p.update(action='query', format='json')
    for t in range(4):
        try: return S.get('https://commons.wikimedia.org/w/api.php', params=p, timeout=40).json()
        except Exception: time.sleep(2 + t * 3)
    return {}
# (category, display-name stem, search query, title must match regex)
Q = [
 ('animals','Sheep','sheep bleating','sheep|lamb|bleat'),('animals','Goat','goat bleat','goat'),('animals','Cow','cow moo','cow|cattle|moo'),('animals','Horse','horse neigh','horse|neigh|whinn'),
 ('animals','Donkey','donkey bray','donkey|bray'),('animals','Pig','pig grunt','pig|oink|grunt'),('animals','Rooster','rooster crowing','rooster|cock'),('animals','Chicken','hen clucking','hen|chicken|cluck'),
 ('animals','Duck','duck quack','duck|quack'),('animals','Goose','goose honk','goose|geese'),('animals','Turkey','turkey gobble','turkey'),('animals','Dog','dog barking','dog|bark|puppy'),
 ('animals','Cat','cat meow','cat|meow|kitten|purr'),('animals','Lion','lion roar','lion'),('animals','Elephant','elephant trumpet','elephant'),('animals','Monkey','monkey','monkey|chimp|gibbon|baboon'),
 ('animals','Owl','owl hoot','owl'),('animals','Frog','frog croak','frog|toad'),('animals','Cricket','cricket chirping','cricket'),('animals','Bee','bee buzzing','bee|buzz'),
 ('animals','Cuckoo','cuckoo','cuckoo'),('animals','Crow','crow caw','crow|raven|caw'),('animals','Seagull','seagull','gull'),('animals','Dove','dove cooing','dove|pigeon'),
 ('animals','Wolf','wolf howl','wolf|howl'),('animals','Camel','camel','camel'),('animals','Parrot','parrot','parrot|macaw'),('animals','Woodpecker','woodpecker','woodpecker'),
 ('animals','Songbird','bird song','song|bird|warbler|robin|blackbird|thrush|wren'),('animals','Whale','whale song','whale'),('animals','Mosquito','mosquito','mosquito'),('animals','Fly','fly buzzing','fly|flies'),
 ('nature','Stream','stream water','stream|brook|creek'),('nature','River','river','river'),('nature','Waterfall','waterfall','waterfall'),('nature','Ocean waves','ocean waves','wave|ocean|sea|surf'),
 ('nature','Forest','forest ambience','forest|woods'),('nature','Campfire','fire crackling','fire|crackl'),('nature','Leaves','leaves rustling','leaves|rustl'),('nature','Water drops','water dripping','drip|drop'),
 ('nature','Night','night ambience','night'),('nature','Birds dawn','dawn chorus','dawn|morning'),
 ('weather','Rain','rain','rain'),('weather','Thunder','thunder','thunder'),('weather','Storm','storm','storm'),('weather','Wind','wind howling','wind'),('weather','Hail','hail','hail'),
 ('household','Door knock','knocking door','knock'),('household','Door creak','door creak','creak|door'),('household','Footsteps','footsteps','footstep|steps|walking'),('household','Clock','clock ticking','clock|tick'),
 ('household','Alarm clock','alarm clock','alarm'),('household','Telephone','telephone ringing','telephone|phone|ring'),('household','Kettle','kettle','kettle'),('household','Typewriter','typewriter','typewriter|typing'),
 ('household','Keys','keys jingling','keys|key'),('household','Pouring water','pouring water','pour'),('household','Toilet','toilet flush','toilet|flush'),('household','Vacuum','vacuum cleaner','vacuum'),
 ('household','Doorbell','doorbell','doorbell|bell'),('household','Dishes','dishes clatter','dish|plate|cutlery|spoon|cup'),('household','Zipper','zipper','zip'),('household','Paper','paper rustle','paper'),
 ('household','Scissors','scissors','scissor'),('household','Brushing teeth','toothbrush','tooth'),('household','Car','car engine','car|engine|horn'),('household','Train','train','train|locomotive'),
 ('cheers','Applause','applause','applause|clap'),('cheers','Cheering','cheering crowd','cheer|crowd'),('cheers','Children playing','children playing','child|kids|playground|school'),('cheers','Laughter','laughing','laugh|giggl'),
 ('instruments','Church bell','church bells','bell'),('instruments','Harp','harp','harp'),('instruments','Piano','piano note','piano'),('instruments','Guitar','guitar strum','guitar'),
 ('instruments','Drum','drum roll','drum'),('instruments','Cymbal','cymbal','cymbal'),('instruments','Trumpet','trumpet','trumpet|bugle|fanfare'),('instruments','Flute','flute','flute|recorder'),
 ('instruments','Xylophone','xylophone','xylophone|marimba|glockenspiel'),('instruments','Triangle','triangle instrument','triangle'),('instruments','Tambourine','tambourine','tambourine'),('instruments','Shofar','shofar','shofar'),
 ('instruments','Organ','pipe organ chord','organ'),('instruments','Gong','gong','gong'),('instruments','Chimes','wind chimes','chime'),('instruments','Ukulele','ukulele','ukulele'),('instruments','Violin','violin','violin|fiddle'),
 ('voices','Laugh','laugh','laugh'),('voices','Gasp','gasp','gasp'),('voices','Sneeze','sneeze','sneez'),('voices','Cough','cough','cough'),('voices','Yawn','yawn','yawn'),('voices','Hiccup','hiccup','hiccup'),
 ('voices','Whistle','whistling','whistl'),('voices','Baby','baby laughing','baby'),('voices','Snore','snoring','snor'),('voices','Burp','burp','burp|belch'),('voices','Humming','humming','humm'),
 ('bible','Crowd murmur','crowd murmur','crowd|murmur|market'),('bible','Desert wind','desert wind','desert|wind'),('bible','Sheep flock','flock of sheep','flock|sheep'),('bible','Boat on water','rowing boat','row|boat|oar'),
]
BAD = re.compile(r'^File:(LL-|En-|De-|Fr-|Es-|It-|Nl-|Pl-|Ru-|Ja-|Zh-|Ar-|Sv-)|\.mid$|\(\d{4}\)|op\.|opus \d|symphon|sonata|concerto|nocturne|prelude|recording of|song|march|polka|waltz|rag\b|blues|lecture|speech|interview|pronunc|word|hymn|anthem|\bpoem|audiobook|librivox|chapter|test tone', re.I)
def ok_lic(em):
    g = lambda k: (em.get(k, {}) or {}).get('value', '') or ''
    lic, short, attr = g('License').lower(), g('LicenseShortName').lower(), g('AttributionRequired').lower()
    good = lic in ('cc0', 'pd') or lic.startswith('pd') or short.startswith('cc0') or short.startswith('public domain')
    return good and attr != 'true', g('License'), g('LicenseShortName'), re.sub('<[^>]+>', '', g('Artist')).strip()[:120]
out, seen = [], set()
for cat, stem, term, rx in Q:
    r = q(generator='search', gsrsearch=f'{term} filetype:audio', gsrnamespace=6, gsrlimit=50, prop='imageinfo', iiprop='url|size|mime|extmetadata|metadata',
          iiextmetadatafilter='LicenseShortName|License|AttributionRequired|Artist|UsageTerms')
    n = 0
    for pg in sorted((r.get('query', {}).get('pages', {}) or {}).values(), key=lambda p: p.get('index', 0)):
        t = pg['title']
        if t in seen or BAD.search(t) or not re.search(rx, t, re.I): continue
        ii = pg['imageinfo'][0]; good, lic, short, artist = ok_lic(ii.get('extmetadata', {}))
        if not good: continue
        md = {m['name']: m['value'] for m in (ii.get('metadata') or []) if isinstance(m, dict) and 'name' in m}
        try: L = float(md.get('length') or md.get('playtime_seconds') or 0)
        except Exception: L = 0
        if L and (L < 0.25 or L > 240) or ii['size'] > 25e6: continue
        seen.add(t); n += 1
        out.append(dict(cat=cat, stem=stem, title=t, url=ii['url'], page=ii.get('descriptionurl') or 'https://commons.wikimedia.org/wiki/' + t.replace(' ', '_'), license=lic, licenseName=short, artist=artist, len=L, size=ii['size'], mime=ii['mime']))
        if n >= 6: break
    print(f'{cat:12s} {stem:16s} {n}', flush=True)
json.dump(out, open('/workspace/sfx-src/commons/candidates.json', 'w'), indent=1)
print('total', len(out))

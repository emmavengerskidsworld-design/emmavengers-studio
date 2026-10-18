"""Emmavengers Originals (sound effects, volume 2): more sounds made from scratch with plain synthesis maths
(numpy / scipy; no samples, no AI): vehicles, sports, school, kitchen & house, weather, cartoon voices (formant synthesis),
transitions / risers / impacts, UI & game, Bible-story sounds. Our own work, released as CC0.
   python3 tools/sounds/synth2.py OUTDIR      -> OUTDIR/<id>.wav + OUTDIR/items-sfx2.json"""
import sys, os, json, numpy as np
_argv = sys.argv; sys.argv = [_argv[0], '/tmp/synth2-scratch']
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import synth as S
from compose import organ, strings, choir, kalimba, whistle, brass as cbrass, timpani, tom, sleigh, woodblock, harp, steel, celesta, m2f
sys.argv = _argv
from synth import SR, T, env, expd, ph, sweep, bp, lp, hp, tv_lp, tv_bp, reverb, pluck_fast, bell, marimba, glock, piano, pad, flute, brass, bassn, kick, snare, hat, clap, shaker, pan, place, norm, fade, hz
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/originals2'; os.makedirs(OUT, exist_ok=True)
R = np.random.default_rng(2027); items = []
def noise(d): return R.standard_normal(int(d * SR))
def Z(d): return np.zeros(int(d * SR))
def save(id_, name, cat, x, tags=(), stereo=False):
    import soundfile as sf
    x = np.asarray(x, dtype=np.float64)
    if not np.all(np.isfinite(x)) or np.max(np.abs(x)) < 1e-6: print('BAD', id_); return
    x = norm(fade(x, .003, .02)); sf.write(f'{OUT}/{id_}.wav', x.T if stereo else x, SR, subtype='PCM_16')
    items.append(dict(id=id_, name=name, cat=cat, kind='sfx', tags=list(tags) + ['original']))
def st(x, p0=-1, p1=1):  # moving pan
    a = np.linspace(p0, p1, len(x)); return np.stack([x * np.cos((a + 1) * np.pi / 4), x * np.sin((a + 1) * np.pi / 4)])
def saw(f): return 2 * ((np.cumsum(f) / SR) % 1) - 1
def sq(f, duty=.5): return np.where(((np.cumsum(f) / SR) % 1) < duty, 1.0, -1.0)
def tri(f): return 2 * np.abs(saw(f)) - 1
def arr(v, n): return np.full(n, float(v)) if np.isscalar(v) else np.pad(np.asarray(v, float), (0, max(0, n - len(v))), mode='edge')[:n]
def am(x, rate, depth=1.0): t = np.arange(len(x)) / SR; return x * (1 - depth * .5 * (1 + np.sin(2 * np.pi * rate * t)))
def seq(parts):  # [(sound, at)]
    n = max(int(a * SR) + len(s) for s, a in parts); x = np.zeros(n)
    for s, a in parts: place(x, s, a)
    return x

# ---------------- formant voice (cartoon voices) ----------------
VOW = dict(a=(800, 1200, 2500), e=(500, 1900, 2600), i=(300, 2300, 3000), o=(500, 850, 2500), u=(330, 800, 2300), ae=(660, 1700, 2400), m=(280, 1200, 2400), er=(500, 1350, 1700))
def voice(pitch, vowels, d, breath=.08, vib=5.5, vibd=.02, shift=1.0, rough=0.0):
    """pitch: Hz scalar or array; vowels: list of vowel keys spread over d; shift scales formants (child/chipmunk > 1)."""
    n = int(d * SR); t = np.arange(n) / SR; f = arr(pitch, n)[:n] * (1 + vibd * np.sin(2 * np.pi * vib * t))
    if rough: f = f * (1 + rough * lp(R.standard_normal(n), 40) * 3)
    src = saw(f) * .7 + sq(f, .3) * .2 + breath * noise(d)[:n]
    k = len(vowels); out = np.zeros(n); seg = np.linspace(0, n, k + 1)
    for j, g in enumerate((1.0, .55, .25)):
        pts = [VOW[v][j] * shift for v in vowels]; F = np.interp(np.arange(n), (seg[:-1] + seg[1:]) / 2, pts)
        out += tv_bp(src, F, q=6 + 2 * j, block=128) * g
    return out * env(n, .02, .05, .9, .06)
def vline(*segs, **kw):  # segments: (vowel, pitch0, pitch1, dur)
    parts = []; t = 0
    for v, p0, p1, d in segs: parts.append((voice(np.linspace(p0, p1, int(d * SR)), [v], d, **kw), t)); t += d * .92
    return seq(parts)
def lin(a, b, d): return np.linspace(a, b, int(d * SR))
def cat_(*xs): return np.concatenate(xs)

def gen_voices():
    for i, (p, sh) in enumerate([(220, 1.0), (330, 1.25), (150, .9)]):
        save(f'v_uhoh{i+1}', f'Uh-oh (cartoon {["voice", "kid", "low"][i]})', 'voices', vline(('u', p, p * .97, .22), ('o', p * .8, p * .75, .38), shift=sh), ['uh oh', 'oops', 'mistake', 'cartoon voice'])
    for i, (p, sh) in enumerate([(200, 1.0), (300, 1.3), (140, .9)]):
        save(f'v_wow{i+1}', f'Wow! (cartoon {["voice", "kid", "low"][i]})', 'voices', voice(cat_(lin(p, p * 1.5, .35), lin(p * 1.5, p * 1.1, .45)), ['u', 'a', 'a', 'u'], .8, shift=sh), ['wow', 'amazed', 'surprise', 'cartoon voice'])
    for i, p in enumerate([260, 340]):
        save(f'v_yay{i+1}', f'Yay! (cartoon {i+1})', 'voices', voice(lin(p, p * 1.35, .6), ['i', 'e', 'a', 'i'], .6, shift=1.2), ['yay', 'hooray', 'happy', 'cartoon voice'])
    for i, p in enumerate([180, 260]):
        save(f'v_oooh{i+1}', f'Oooh (impressed {i+1})', 'voices', voice(cat_(lin(p, p * 1.25, .4), lin(p * 1.25, p * .9, .6)), ['u', 'o', 'u'], 1.0), ['ooh', 'impressed', 'cartoon voice'])
    for i, p in enumerate([170, 240, 320]):
        save(f'v_hmm{i+1}', f'Hmm? (thinking {i+1})', 'voices', voice(cat_(np.full(int(.3 * SR), float(p)), lin(p, p * 1.3, .3)), ['m', 'm'], .6, breath=.02), ['hmm', 'thinking', 'question', 'cartoon voice'])
    for i, p in enumerate([110, 90]):
        save(f'v_boo{i+1}', f'Boo! {i+1}', 'voices', voice(lin(p * 1.2, p, .7), ['u', 'u'], .7), ['boo', 'scare', 'ghost', 'cartoon voice'])
    for i, (p, n) in enumerate([(380, 4), (480, 5), (300, 3)]):
        save(f'v_heehee{i+1}', f'Hee hee giggle {i+1}', 'voices', seq([(voice(lin(p * (1 + .05 * k), p * (1.1 + .05 * k), .12), ['i'], .12, breath=.25, shift=1.2), .02 + k * .16) for k in range(n)]), ['giggle', 'laugh', 'hee hee', 'funny', 'cartoon voice'])
    for i, (p, n) in enumerate([(200, 4), (150, 5), (280, 4)]):
        save(f'v_haha{i+1}', f'Ha ha laugh {i+1}', 'voices', seq([(voice(lin(p * (1.1 - .04 * k), p * (1 - .04 * k), .15), ['a'], .15, breath=.3), k * .19) for k in range(n)]), ['laugh', 'ha ha', 'funny', 'cartoon voice'])
    for i in range(4):
        p = [420, 520, 360, 600][i]; parts = []; t = 0
        for k in range(10 + 2 * i):
            d = R.uniform(.06, .12); v = R.choice(list('aeiou')); p0 = p * R.uniform(.85, 1.2); parts.append((voice(lin(p0, p0 * R.uniform(.9, 1.15), d), [v], d, shift=1.5), t)); t += d * R.uniform(.9, 1.3)
        save(f'v_chipmunk{i+1}', f'Chipmunk chatter {i+1}', 'voices', seq(parts), ['chipmunk', 'babble', 'squeaky', 'talk', 'cartoon voice'])
    for i, p in enumerate([60, 48, 75]):
        n = int(1.4 * SR); x = voice(p * (1 + .2 * np.sin(np.linspace(0, 6, n))), ['o', 'a', 'o'], 1.4, breath=.4, rough=.05, shift=.75)
        save(f'v_monster{i+1}', f'Monster growl (friendly) {i+1}', 'voices', x + .3 * lp(noise(1.4), 400)[:n] * env(n, .1, .2, .7, .3), ['monster', 'growl', 'roar', 'cartoon voice'])
    for i in range(4):
        parts = []; t = 0
        for k in range(6 + i):
            d = R.uniform(.08, .16); f0 = [180, 240, 120, 300][i] * R.choice([1, 1.25, 1.5]); v = R.choice(list('aeiou'))
            s = voice(f0, [v], d, vibd=0, breath=0); s = np.round(s / (np.max(np.abs(s)) + 1e-9) * 6) / 6; parts.append((s, t)); t += d + .02
        save(f'v_robot{i+1}', f'Robot talk {i+1}', 'voices', seq(parts), ['robot', 'beep boop', 'computer', 'talk', 'cartoon voice'])
    for i in range(3):
        parts = []; t = 0
        for k in range(8):
            d = R.uniform(.08, .2); f0 = R.uniform(200, 500); s = voice(lin(f0, f0 * R.uniform(.7, 1.4), d), [R.choice(list('aeiou'))], d, shift=1.3)
            s = s * np.sin(2 * np.pi * R.uniform(30, 90) * np.arange(len(s)) / SR); parts.append((s, t)); t += d
        save(f'v_alien{i+1}', f'Alien gibberish {i+1}', 'voices', seq(parts), ['alien', 'space', 'gibberish', 'cartoon voice'])
    for i, p in enumerate([420, 500]):
        save(f'v_babycoo{i+1}', f'Baby coo {i+1}', 'voices', voice(cat_(lin(p, p * 1.3, .3), lin(p * 1.3, p * .9, .4)), ['u', 'o', 'u'], .7, shift=1.6, breath=.15), ['baby', 'coo', 'cute', 'cartoon voice'])
    for i, p in enumerate([200, 300]):
        save(f'v_huh{i+1}', f'Huh? {i+1}', 'voices', voice(lin(p, p * 1.45, .35), ['a', 'a'], .35, breath=.25), ['huh', 'question', 'confused', 'cartoon voice'])
    for i, p in enumerate([260, 200]):
        save(f'v_aww{i+1}', f'Aww {i+1}', 'voices', voice(cat_(lin(p * 1.2, p * 1.3, .3), lin(p * 1.3, p * .8, .6)), ['a', 'o', 'u'], .9), ['aww', 'cute', 'sad', 'cartoon voice'])
    for i, p in enumerate([300, 220]):
        save(f'v_oops{i+1}', f'Oops! {i+1}', 'voices', vline(('u', p * 1.2, p * 1.3, .18), ('u', p, p * .85, .25), shift=1.1), ['oops', 'mistake', 'cartoon voice'])
    for i in range(2):
        parts = []
        for k in range(3): n = int(1.1 * SR); parts.append((lp(noise(1.1), 600 + 200 * i)[:n] * env(n, .5, .1, .7, .4) * .6, k * 2.4)); parts.append((voice(70 + 10 * i, ['o'], .9, breath=.6) * .3, k * 2.4 + 1.2))
        save(f'v_snore{i+1}', f'Cartoon snore {i+1}', 'voices', seq(parts), ['snore', 'sleep', 'zzz', 'cartoon voice'])
    for i, p in enumerate([300, 220]):
        n = int(.35 * SR); x = seq([(voice(lin(p, p * 1.3, .5), ['a', 'a'], .5, breath=.3), 0), (hp(noise(.35), 1500)[:n] * env(n, .005, .1, .4, .2) * 1.5, .62), (voice(p * 1.2, ['u'], .2, breath=.4) * .6, .62)])
        save(f'v_achoo{i+1}', f'Sneeze (a-choo!) {i+1}', 'voices', x, ['sneeze', 'achoo', 'cold', 'cartoon voice'])
    for i, p in enumerate([180, 240]):
        save(f'v_yawn{i+1}', f'Yawn {i+1}', 'voices', voice(cat_(lin(p, p * 1.6, .8), lin(p * 1.6, p * .7, 1.0)), ['a', 'a', 'o', 'u'], 1.8, breath=.35), ['yawn', 'tired', 'sleepy', 'cartoon voice'])
    for i in range(2):
        save(f'v_hiccup{i+1}', f'Hiccups {i+1}', 'voices', seq([(voice(lin(400, 520, .07), ['i'], .07, breath=.4) + hp(noise(.07), 2000)[:int(.07 * SR)] * .3, k * (.9 + .2 * i)) for k in range(4)]), ['hiccup', 'funny', 'cartoon voice'])
    for i in range(2):
        n = int(.5 * SR); x = hp(noise(.5), 1200 + 600 * i)[:n] * cat_(np.linspace(0, 1, int(.12 * SR)), np.exp(-np.linspace(0, 5, n - int(.12 * SR)))) + voice(lin(300, 420, .5), ['a'], .5, breath=.9) * .2
        save(f'v_gasp{i+1}', f'Gasp {i+1}', 'voices', x, ['gasp', 'shock', 'surprise', 'cartoon voice'])
    save('v_kiss', 'Mwah! (kiss)', 'voices', seq([(voice(250, ['m'], .15, breath=.1), 0), (bp(noise(.06), 1500, 6000) * expd(int(.06 * SR), 60), .14), (voice(lin(320, 260, .25), ['a'], .25), .16)]), ['kiss', 'mwah', 'love', 'cartoon voice'])
    for i in range(3):
        parts = []; t = 0
        for k in range(7):
            d = R.uniform(.1, .18); f0 = [160, 240, 120][i] * R.uniform(.9, 1.1); parts.append((voice(lin(f0, f0 * .95, d), ['a', 'e'] if k % 2 else ['o', 'a'], d), t)); t += d + .02
        save(f'v_blah{i+1}', f'Blah blah talk {i+1}', 'voices', seq(parts), ['talk', 'blah', 'chatter', 'cartoon voice'])
    for i, p in enumerate([150, 210]):
        save(f'v_yummy{i+1}', f'Mmm, yummy! {i+1}', 'voices', vline(('m', p, p * 1.3, .5), ('m', p * 1.3, p * 1.1, .3)), ['yummy', 'food', 'tasty', 'cartoon voice'])
    for i, p in enumerate([180, 260]):
        save(f'v_ewww{i+1}', f'Ewww! {i+1}', 'voices', voice(lin(p * 1.3, p * .9, .8), ['i', 'i', 'u'], .8, breath=.2, shift=1.1), ['eww', 'gross', 'yuck', 'cartoon voice'])
    for i, p in enumerate([160, 230]):
        save(f'v_ouch{i+1}', f'Ouch! (cartoon) {i+1}', 'voices', vline(('a', p * 1.5, p * 1.7, .12), ('u', p * 1.6, p * 1.0, .25)), ['ouch', 'hurt', 'cartoon voice'])
    for i in range(2):
        save(f'v_tada{i+1}', f'Ta-daa! (voice) {i+1}', 'voices', vline(('a', 260 + 60 * i, 260 + 60 * i, .14), ('a', 390 + 90 * i, 400 + 90 * i, .6)), ['tada', 'reveal', 'cartoon voice'])

def engine(f_arr, rough=.4, bright=900):
    n = len(f_arr); pulses = np.maximum(0, np.sin(ph(f_arr))) ** 6
    return lp(pulses + rough * lp(noise(n / SR)[:n], 300) * .5, bright) + .3 * lp(saw(f_arr * .5), bright * .6)
def horn(fs, d): n = int(d * SR); x = sum(sq(np.full(n, float(f))) for f in fs); return bp(x, 300, 3000) * env(n, .01, .05, .9, .04)
def siren(kind, d=4):
    t = T(d)
    if kind == 'wail': f = 700 + 600 * (.5 - .5 * np.cos(2 * np.pi * t / 2.0))
    elif kind == 'yelp': f = 700 + 600 * (.5 - .5 * np.cos(2 * np.pi * t * 4))
    elif kind == 'hilo': f = np.where((t % 1.0) < .5, 960.0, 770.0)
    else: f = 500 + 800 * np.clip(t / d * 1.4, 0, 1)
    return bp(sq(f, .4) * .6 + tri(f) * .4, 400, 4000)
def gen_vehicles():
    for i, (rpm, nm) in enumerate([(26, 'Car engine idle'), (20, 'Truck engine idle'), (34, 'Small car engine idle'), (16, 'Tractor engine idle')]):
        t = T(6); f = rpm * (1 + .03 * np.sin(2 * np.pi * .7 * t)); save(f'veh_idle{i+1}', nm, 'vehicles', engine(f, .5, 700 - 80 * i), ['engine', 'car' if i != 3 else 'tractor', 'idle', 'vehicle'])
    for i, (a, b) in enumerate([(25, 90), (30, 120), (20, 70), (35, 140)]):
        d = 2.5; t = T(d); f = a + (b - a) * np.sin(np.pi * np.clip(t / d, 0, 1)) ** 1.5; save(f'veh_rev{i+1}', f'Engine rev {i+1}', 'vehicles', engine(f, .3, 1400), ['engine', 'rev', 'race', 'car', 'vehicle'])
    for i, (f0, d) in enumerate([(70, 3), (90, 2.4), (55, 3.6)]):
        t = T(d); n = len(t); dop = 1 + .12 * np.tanh((d / 2 - t) * 2.5); x = engine(f0 * dop, .5, 1600) + .5 * bp(noise(d), 300, 3000)[:n]; x = x * (np.exp(-((t - d / 2) / (d / 4)) ** 2) + .02)
        save(f'veh_driveby{i+1}', f'Car drive-by {i+1}', 'vehicles', st(x), ['car', 'drive by', 'pass', 'road', 'vehicle'], stereo=True)
    for i in range(2):
        t = T(3.0); f = arr(cat_(np.linspace(8, 14, int(.8 * SR)), 22 + 4 * np.sin(np.linspace(0, 3, int(2.2 * SR)))), len(t))
        save(f'veh_start{i+1}', f'Car starting {i+1}', 'vehicles', engine(f, .6, 900 + 200 * i) * np.clip(t * 2, 0, 1), ['car', 'start', 'ignition', 'engine', 'vehicle'])
    save('veh_horn1', 'Car horn (beep)', 'vehicles', horn([420, 500], .35), ['horn', 'beep', 'car', 'vehicle'])
    save('veh_horn2', 'Car horn (double beep)', 'vehicles', seq([(horn([420, 500], .18), 0), (horn([420, 500], .3), .26)]), ['horn', 'beep', 'car', 'vehicle'])
    save('veh_horn3', 'Car horn (long)', 'vehicles', horn([400, 480], 1.2), ['horn', 'car', 'traffic', 'vehicle'])
    save('veh_horn4', 'Toy car horn (meep meep)', 'vehicles', seq([(horn([700, 880], .15), 0), (horn([700, 880], .2), .22)]), ['horn', 'toy', 'cartoon', 'vehicle'])
    n = int(1.6 * SR); save('veh_airhorn', 'Truck air horn', 'vehicles', lp(sum(saw(np.full(n, float(f))) for f in (155, 185, 233)), 2500) * env(n, .05, .1, .9, .2), ['truck', 'horn', 'big', 'vehicle'])
    for i in range(3):
        save(f'veh_bikebell{i+1}', f'Bicycle bell {i+1}', 'vehicles', seq([(bell(2400 + 300 * i, 1.0, 1.41, 1.2, 4) + bell(3300 + 300 * i, 1.0, 1.3, 1, 5) * .4, k * .14) for k in range(2 + i % 2)]), ['bicycle', 'bell', 'bike', 'ring', 'vehicle'])
    for i, (k, nm) in enumerate([('wail', 'Police siren (wail)'), ('yelp', 'Police siren (yelp)'), ('hilo', 'Ambulance siren (hi-lo)'), ('rise', 'Fire engine siren')]):
        tg = ['siren', 'emergency', 'police' if i < 2 else ('ambulance' if i == 2 else 'fire engine'), 'vehicle']
        save(f'veh_siren{i+1}', nm, 'vehicles', siren(k), tg)
        t = T(6); x = siren(k, 6) * np.exp(-((t - 3) / 1.6) ** 2); save(f'veh_sirenpass{i+1}', nm + ' passing by', 'vehicles', st(x), tg + ['pass'], stereo=True)
    for i, rate in enumerate([2.0, 3.5]):
        d = 6; x = Z(d); tt = 0; k = 0
        while tt < d - .3: m = int(.25 * SR); place(x, bp(noise(.25), 150, 2500)[:m] * env(m, .01, .1) * (1 if k % 2 == 0 else .6), tt); tt += 1 / (rate * (1 + tt / d)); k += 1
        save(f'veh_train{i+1}', f'Steam train chugging {i+1}', 'vehicles', x + .2 * lp(noise(d), 120)[:len(x)], ['train', 'steam', 'chug', 'railway', 'vehicle'])
    for i in range(2):
        d = 2.2; n = int(d * SR); x = sum(organ(hz(m), d) for m in (['A4', 'C#5', 'E5'] if i == 0 else ['G4', 'B4', 'D5', 'F5'])) + .3 * hp(noise(d), 2000)[:n] * env(n, .05, .1, .8, .2)
        save(f'veh_trainwhistle{i+1}', f'Train whistle {i+1}', 'vehicles', x * env(n, .08, .1, .9, .3), ['train', 'whistle', 'choo choo', 'vehicle'])
    save('veh_crossing', 'Railway crossing bell', 'vehicles', seq([(bell(1150, .5, 2.8, 1, 6), k * .5) for k in range(8)]), ['railway', 'crossing', 'bell', 'train', 'vehicle'])
    for i in range(2):
        d = 6; t = T(d); n = len(t); x = lp(noise(d), 600 + 300 * i)[:n] * (1 + .5 * np.sin(2 * np.pi * .3 * t)); x = x * np.exp(-((t - 3) / 1.8) ** 2) + .3 * bp(noise(d), 2000, 6000)[:n] * np.exp(-((t - 3.2) / 1.2) ** 2)
        save(f'veh_plane{i+1}', ['Aeroplane fly-by', 'Jet fly-over'][i], 'vehicles', st(x), ['plane', 'aeroplane', 'airport', 'sky', 'vehicle'], stereo=True)
    for i, rate in enumerate([11, 14]):
        d = 5; t = T(d); n = len(t); x = lp(noise(d), 900)[:n] * (np.maximum(0, np.sin(2 * np.pi * rate * t)) ** 4) + .3 * engine(np.full(n, 45.0), .2, 600)
        save(f'veh_heli{i+1}', f'Helicopter {i+1}', 'vehicles', x, ['helicopter', 'chopper', 'rescue', 'vehicle'])
    for i, f in enumerate([98, 73]):
        d = 2.8; n = int(d * SR); x = lp(saw(np.full(n, float(f))) + saw(np.full(n, f * 1.006)), 900) * env(n, .15, .1, .9, .4)
        save(f'veh_boathorn{i+1}', f'Ship horn {i+1}', 'vehicles', reverb(x, 2.0, .3), ['ship', 'boat', 'horn', 'harbour', 'vehicle'])
    for i in range(2):
        d = 5; t = T(d); n = len(t); x = engine(np.full(n, 40.0 + 10 * i), .3, 1200) * .7 + .5 * hp(noise(d), 800)[:n] * (1 + .3 * np.sin(2 * np.pi * .8 * t))
        save(f'veh_motorboat{i+1}', f'Motorboat {i+1}', 'vehicles', x, ['boat', 'motorboat', 'water', 'lake', 'vehicle'])
    for i in range(2):
        n = int(.45 * SR); save(f'veh_reverse{i+1}', f'Truck reversing beeps {i+1}', 'vehicles', seq([(np.sin(2 * np.pi * (1000 + 200 * i) * T(.45)) * env(n, .005, .02, .9, .01), k * .9) for k in range(5)]), ['truck', 'reverse', 'beep', 'construction', 'vehicle'])
    for i in range(2):
        d = 5; t = T(d); n = len(t); x = tv_lp(noise(d)[:n], 200 + 2500 * (t / d) ** 2, 512) * np.clip(t * 1.5, 0, 1) * 1.3 + .6 * lp(noise(d), 120)[:n]
        save(f'veh_rocket{i+1}', f'Rocket launch {i+1}', 'vehicles', x, ['rocket', 'launch', 'space', 'blast off', 'vehicle'])
    for i, (a, b) in enumerate([(40, 160), (50, 200)]):
        t = T(2); f = a + (b - a) * (1 - np.exp(-t * 2.5)); save(f'veh_motorbike{i+1}', f'Motorbike rev {i+1}', 'vehicles', engine(f, .3, 2200), ['motorbike', 'scooter', 'rev', 'vehicle'])
    save('veh_icecream', 'Ice-cream van chime', 'vehicles', seq([(glock(hz(m), .5) * .6, k * .22) for k, m in enumerate(['C6', 'E6', 'G6', 'E6', 'F6', 'D6', 'B5', 'C6'])]), ['chime', 'ice cream', 'van', 'music', 'vehicle'])
    for i in range(2):
        d = 4; x = Z(d); m = int(.12 * SR)
        for k in range(int(d * 2.2)): place(x, (lp(noise(.12), 900)[:m] + .4 * np.sin(2 * np.pi * 60 * T(.12))) * expd(m, 30), k / 2.2 + (.1 if k % 2 else 0))
        save(f'veh_tracks{i+1}', f'Train on the tracks {i+1}', 'vehicles', x + engine(np.full(len(x), 30.0), .4, 500) * .3, ['train', 'tracks', 'clickety clack', 'vehicle'])

def whistle_pea(d, f=2900):
    t = T(d); n = len(t); trill = 1 + .5 * np.sin(2 * np.pi * 34 * t); x = np.sin(ph(f * (1 + .02 * np.sin(2 * np.pi * 34 * t)))) * trill + .25 * bp(noise(d), 2000, 5000)[:n]
    return x * env(n, .01, .03, .9, .04)
def bounce(f=110, ring=600):
    t = T(.35); n = len(t); return np.sin(ph(sweep(f * 1.8, f, .35))) * expd(n, 18) + .25 * np.sin(2 * np.pi * ring * t) * expd(n, 25) + .3 * bp(noise(.35), 300, 3000)[:n] * expd(n, 60)
def crowd(d, nv, excite=1.0):
    n = int(d * SR); x = bp(noise(d), 300, 3000)[:n] * .6
    for v in range(nv):
        f0 = R.uniform(150, 400); dd = R.uniform(.6, d * .8); at = R.uniform(0, d - dd)
        place(x, voice(lin(f0, f0 * R.uniform(1.0, 1.5) * excite, dd), [R.choice(['a', 'e', 'o'])], dd, breath=.4) * R.uniform(.1, .3), at)
    return x * env(n, .4, .2, .9, 1.0)
def gen_sports():
    save('sp_whistle1', 'Referee whistle (short)', 'sports', whistle_pea(.25), ['whistle', 'referee', 'foul', 'sport'])
    save('sp_whistle2', 'Referee whistle (long)', 'sports', whistle_pea(1.1), ['whistle', 'referee', 'start', 'sport'])
    save('sp_whistle3', 'Referee whistle (three blasts)', 'sports', seq([(whistle_pea(.25), 0), (whistle_pea(.25), .4), (whistle_pea(.9), .8)]), ['whistle', 'referee', 'final whistle', 'sport'])
    save('sp_whistle4', 'Coach whistle (double)', 'sports', seq([(whistle_pea(.18, 3200), 0), (whistle_pea(.35, 3200), .28)]), ['whistle', 'coach', 'pe', 'sport'])
    save('sp_basketball1', 'Basketball bounce', 'sports', bounce(), ['basketball', 'ball', 'bounce', 'sport'])
    for i, rate in enumerate([2.2, 3.0]):
        save(f'sp_dribble{i+1}', f'Basketball dribble {i+1}', 'sports', seq([(bounce(110 + 5 * (k % 3)) * (1 - .03 * k), k / rate) for k in range(8)]), ['basketball', 'dribble', 'bounce', 'sport'])
    for i in range(3):
        n = int(.3 * SR); x = np.sin(ph(sweep(180 + 30 * i, 60, .3))) * expd(n, 14) + .6 * bp(noise(.3), 400, 4000)[:n] * expd(n, 40); save(f'sp_kick{i+1}', f'Ball kick {i+1}', 'sports', x, ['football', 'soccer', 'kick', 'ball', 'sport'])
    for i, f in enumerate([1100, 1300, 950]):
        n = int(.2 * SR); save(f'sp_tennis{i+1}', f'Tennis ball hit {i+1}', 'sports', (np.sin(2 * np.pi * f * T(.2)) * .6 + bp(noise(.2), 800, 5000)[:n]) * expd(n, 45), ['tennis', 'racket', 'hit', 'sport'])
    for i in range(2):
        parts = []; tt = 0; n = int(.06 * SR)
        for k in range(10): parts.append(((np.sin(2 * np.pi * (2200 if k % 2 else 1800) * T(.06)) + .5 * bp(noise(.06), 2000, 8000)[:n]) * expd(n, 90), tt)); tt += .38 - .01 * k - .05 * i
        save(f'sp_pingpong{i+1}', f'Ping-pong rally {i+1}', 'sports', seq(parts), ['ping pong', 'table tennis', 'rally', 'sport'])
    for i in range(2):
        n = int(.4 * SR); save(f'sp_bat{i+1}', f'Baseball bat crack {i+1}', 'sports', bp(noise(.4), 1200, 7000)[:n] * expd(n, 30) + np.sin(2 * np.pi * (900 + 200 * i) * T(.4)) * expd(n, 20) * .6, ['baseball', 'cricket', 'bat', 'hit', 'sport'])
    n = int(.4 * SR); m = int(.15 * SR)
    save('sp_golf', 'Golf swing and hit', 'sports', seq([(tv_bp(noise(.4)[:n], sweep(400, 3000, .4), 2) * np.sin(np.linspace(0, np.pi, n)), 0), ((np.sin(2 * np.pi * 2600 * T(.15)) + bp(noise(.15), 2000, 8000)[:m]) * expd(m, 50), .38)]), ['golf', 'swing', 'hit', 'sport'])
    d = 3.5; n = int(d * SR); roll = lp(noise(d), 300)[:n] * np.linspace(.3, 1, n) * (1 + .3 * np.sin(2 * np.pi * 9 * T(d))); pins = Z(1.5); m = int(.3 * SR)
    for k in range(10): place(pins, (np.sin(2 * np.pi * R.uniform(700, 1400) * T(.3)) * .5 + bp(noise(.3), 600, 6000)[:m]) * expd(m, R.uniform(15, 30)) * R.uniform(.4, 1), R.uniform(0, .5))
    save('sp_bowling', 'Bowling strike', 'sports', seq([(roll, 0), (pins, d - .05)]), ['bowling', 'strike', 'pins', 'sport'])
    save('sp_boxingbell', 'Ring bell (ding ding ding)', 'sports', seq([(bell(1400, 1.5, 2.4, 1.6, 2.5), k * .35) for k in range(3)]), ['bell', 'round', 'ring', 'sport'])
    for i, (f, d) in enumerate([(220, 1.2), (180, 2.0), (300, .7)]):
        n = int(d * SR); save(f'sp_buzzer{i+1}', f'Scoreboard buzzer {i+1}', 'sports', bp(sq(np.full(n, float(f))) + saw(np.full(n, f * 1.5)) * .5, 200, 3000) * env(n, .01, .05, .95, .05), ['buzzer', 'game over', 'time up', 'scoreboard', 'sport'])
    n = int(.25 * SR); m = int(.7 * SR)
    save('sp_startbeeps', 'Race start beeps (3-2-1-go)', 'sports', seq([(np.sin(2 * np.pi * 800 * T(.25)) * env(n, .005, .02, .9, .02), k) for k in range(3)] + [(np.sin(2 * np.pi * 1600 * T(.7)) * env(m, .005, .02, .9, .05), 3)]), ['race', 'start', 'countdown', 'go', 'sport'])
    n = int(.03 * SR); save('sp_stopwatch', 'Stopwatch click', 'sports', seq([((np.sin(2 * np.pi * 3000 * T(.03)) + bp(noise(.03), 2000, 8000)[:n]) * expd(n, 150), k * .25) for k in (0, 1)]), ['stopwatch', 'timer', 'click', 'sport'])
    for i, (nv, nm) in enumerate([(14, 'Crowd cheer'), (24, 'Stadium cheer'), (8, 'Small crowd cheer')]):
        x = crowd(4, nv, 1.2); cl = Z(4); m = int(.03 * SR)
        for p in range(nv * 2):
            rate = R.uniform(3.5, 6)
            for k in range(int(3.5 * rate)): place(cl, bp(noise(.03), 800, 4000)[:m] * expd(m, 120) * R.uniform(.1, .4), R.uniform(0, .3) + k / rate)
        save(f'sp_cheer{i+1}', nm, 'sports', x + cl[:len(x)], ['cheer', 'crowd', 'goal', 'win', 'sport'])
    for i in range(2): save(f'sp_ooh{i+1}', f'Crowd “ooh” {i+1}', 'sports', crowd(2.2, 16, .8), ['crowd', 'ooh', 'near miss', 'sport'])
    for i in range(2):
        n = int(1.2 * SR); save(f'sp_airhorn{i+1}', f'Stadium air horn {i+1}', 'sports', bp(sum(saw(np.full(n, float(f))) for f in ([466, 587, 698] if i == 0 else [392, 494, 587])), 300, 5000) * env(n, .02, .05, .9, .1), ['air horn', 'stadium', 'goal', 'celebrate', 'sport'])
    n = int(.25 * SR); m = int(.04 * SR)
    save('sp_skipping', 'Skipping rope', 'sports', seq([(tv_bp(noise(.25)[:n], sweep(500, 2500, .25), 2) * np.sin(np.linspace(0, np.pi, n)) * .6, k * .5) for k in range(8)] + [(bp(noise(.04), 1000, 5000)[:m] * expd(m, 100), k * .5 + .25) for k in range(8)]), ['skipping', 'jump rope', 'playground', 'sport'])
    for i in range(2):
        d = 1.6; n = int(d * SR); x = lp(noise(d), 4000)[:n] * expd(n, 3) + .5 * bp(noise(d), 200, 1200)[:n] * expd(n, 5)
        for k in range(30): place(x, np.sin(ph(sweep(R.uniform(400, 1500), R.uniform(1500, 3000), .03))) * expd(int(.03 * SR), 100) * .3, R.uniform(.05, 1.2))
        save(f'sp_dive{i+1}', f'Swimming pool dive {i+1}', 'sports', x, ['swimming', 'dive', 'splash', 'pool', 'sport'])
    n = int(.4 * SR); save('sp_trampoline', 'Trampoline bounces', 'sports', seq([(np.sin(ph(sweep(90, 220, .4))) * expd(n, 6) + .3 * bp(noise(.4), 200, 1500)[:n] * expd(n, 20), k * .7) for k in range(4)]), ['trampoline', 'bounce', 'jump', 'sport'])
    for i in range(2):
        t = T(.6); n = len(t); save(f'sp_net{i+1}', f'Goal net swish {i+1}', 'sports', bp(noise(.6), 2000, 8000)[:n] * env(n, .02, .1, .5, .3) * (1 + .3 * np.sin(2 * np.pi * 20 * t)), ['net', 'goal', 'swish', 'basketball', 'sport'])

def strokes(d, make, gap=(.02, .15)):
    x = Z(d); tt = 0
    while tt < d - .3: s = make(); place(x, s, tt); tt += len(s) / SR + R.uniform(*gap)
    return x
def win(n): return np.sin(np.linspace(0, np.pi, n))
def gen_school():
    for i, f in enumerate([1600, 2100, 1300]):
        d = 3; t = T(d); x = bell(f, d, 2.76, 1.0, .5) * (1 + .9 * np.sign(np.sin(2 * np.pi * 25 * t))) * .5
        save(f'sc_bell{i+1}', f'School bell ringing {i+1}', 'school', x * env(len(t), .01, .05, .9, .2), ['school bell', 'break', 'class', 'school'])
    for i in range(2):
        save(f'sc_handbell{i+1}', f'Teacher’s hand bell {i+1}', 'school', seq([(bell(1700 + 200 * i, 1.0, 2.2, 1.6, 3), k * .28) for k in range(6)]), ['bell', 'hand bell', 'teacher', 'school'])
    def chalk():
        L_ = R.uniform(.12, .35); n = int(L_ * SR); s = bp(noise(L_), 1500, 6000)[:n] * win(n) * .6
        if R.random() < .3: s = s + .15 * np.sin(ph(np.full(n, R.uniform(1800, 3000)))) * win(n)
        return s
    for i in range(3): save(f'sc_chalk{i+1}', f'Chalk on the board {i+1}', 'school', strokes(2.5, chalk), ['chalk', 'blackboard', 'writing', 'teacher', 'school'])
    def pencil(): L_ = R.uniform(.05, .2); n = int(L_ * SR); return hp(noise(L_), 3000)[:n] * win(n) * .5
    for i in range(3): save(f'sc_pencil{i+1}', f'Pencil writing {i+1}', 'school', strokes(2.5, pencil, (0, .08)), ['pencil', 'writing', 'homework', 'school'])
    for i in range(2):
        n = int(.18 * SR); save(f'sc_eraser{i+1}', f'Eraser rubbing {i+1}', 'school', seq([(bp(noise(.18), 500 + 300 * i, 3000)[:n] * win(n) * .6, k * .22) for k in range(6)]), ['eraser', 'rubber', 'mistake', 'school'])
    for i in range(4):
        d = .5 + .1 * i; n = int(d * SR); x = tv_bp(noise(d)[:n], sweep(800, 5000, d), 1.2) * win(n) ** .8 + .3 * bp(noise(d), 200, 800)[:n] * expd(n, 8)
        save(f'sc_page{i+1}', f'Page turn {i+1}', 'school', x, ['page', 'book', 'turn', 'reading', 'story', 'school'])
    for i, f in enumerate([160, 220, 120]):
        d = 1.2; t = T(d); x = np.sin(2 * np.pi * f * t * (1 + .1 * np.exp(-t * 4) * np.sin(2 * np.pi * 14 * t))) * expd(len(t), 3.5); m = int(.03 * SR); x[:m] += bp(noise(.03), 1000, 5000)[:m] * expd(m, 100)
        save(f'sc_ruler{i+1}', f'Ruler twang {i+1}', 'school', x, ['ruler', 'twang', 'desk', 'funny', 'school'])
    for i in range(2):
        t = T(.6); n = len(t); x = (np.sin(2 * np.pi * (180 + 30 * i) * t) + .5 * np.sin(2 * np.pi * 410 * t) + .4 * np.sin(2 * np.pi * 870 * t)) * expd(n, 9) + .6 * bp(noise(.6), 300, 5000)[:n] * expd(n, 25)
        save(f'sc_locker{i+1}', f'Locker slam {i+1}', 'school', x, ['locker', 'slam', 'metal', 'hallway', 'school'])
    def key_(): n = int(.04 * SR); return (bp(noise(.04), 1500, 7000)[:n] + .3 * np.sin(2 * np.pi * R.uniform(400, 900) * T(.04))) * expd(n, 120) * R.uniform(.4, 1)
    for i in range(2): save(f'sc_typing{i+1}', f'Keyboard typing {i+1}', 'school', strokes(3, key_, (.03, .16)), ['typing', 'keyboard', 'computer', 'school'])
    for i in range(2):
        d = .7 + .3 * i; n = int(d * SR); f = 300 + 200 * np.sin(np.linspace(0, 3, n)); x = tv_bp(noise(d)[:n] + .5 * saw(f), f * 3, 4) * win(n)
        save(f'sc_chair{i+1}', f'Chair scrape {i+1}', 'school', x, ['chair', 'scrape', 'classroom', 'school'])
    for i, notes in enumerate([['C6', 'E6', 'G6', 'C7'], ['G5', 'C6', 'E6'], ['E6', 'G6'], ['C6', 'G6', 'C7', 'E7']]):
        save(f'sc_correct{i+1}', f'Correct answer {i+1}', 'school', reverb(seq([(glock(hz(m), 1.0) * .7, k * .1) for k, m in enumerate(notes)]), 1.0, .2), ['correct', 'right', 'quiz', 'answer', 'school'])
    for i, (f, k_) in enumerate([(150, 2), (110, 1), (200, 3)]):
        n = int(.3 * SR); save(f'sc_wrong{i+1}', f'Wrong answer {i+1}', 'school', seq([(bp(sq(np.full(n, float(f))), 100, 2000) * env(n, .005, .05, .8, .03), k * .35) for k in range(k_)]), ['wrong', 'incorrect', 'quiz', 'buzzer', 'school'])
    for i in range(2):
        notes = (['C5', 'E5', 'G5', 'E5'] * 4) if i == 0 else (['A4', 'C5', 'E5', 'C5', 'B4', 'D5', 'E5', 'D5'] * 2)
        save(f'sc_quizthink{i+1}', f'Quiz thinking music {i+1}', 'school', seq([(marimba(hz(m), .4) * .6, k * .25) for k, m in enumerate(notes)] + [(woodblock() * .5, k * .5) for k in range(8)]), ['quiz', 'thinking', 'countdown', 'school'])
    n = int(2 * SR); save('sc_pencilsharpen', 'Pencil sharpener', 'school', am(bp(noise(2.0), 800, 5000)[:n], 9, .7) * env(n, .05, .1, .9, .1), ['pencil', 'sharpener', 'school'])
    n = int(.15 * SR); save('sc_stamp', 'Rubber stamp', 'school', (lp(noise(.15), 1500)[:n] + np.sin(2 * np.pi * 120 * T(.15))) * expd(n, 30), ['stamp', 'teacher', 'approved', 'school'])
    save('sc_goldstar', 'Gold star!', 'school', reverb(seq([(glock(hz(m), 1.2) * .5, k * .06) for k, m in enumerate(['G6', 'B6', 'D7', 'G7'])] + [(bell(R.uniform(3000, 6000), .3, 2.3, 1, 15) * .3, .3 + k * .04) for k in range(12)]), 1.2, .3), ['star', 'well done', 'reward', 'school'])
    for i in range(2):
        n = int(.25 * SR); save(f'sc_backpack{i+1}', f'Backpack zip {i+1}', 'school', tv_bp(noise(.25)[:n] + .3 * sq(np.full(n, 90.0 + 30 * i)), sweep(1500, 4000, .25) if i == 0 else sweep(4000, 1500, .25), 3) * env(n, .01, .05, .8, .03), ['zip', 'backpack', 'bag', 'school'])

def gen_house():
    for i, f in enumerate([2300, 1900]):
        d = 3.5; t = T(d); n = len(t); amp = np.clip(t / 1.5, 0, 1) ** 2; x = (np.sin(ph(f * (1 + .01 * np.sin(2 * np.pi * 7 * t)))) * amp + .5 * bp(noise(d), 1500, 5000)[:n] * (.3 + amp)) * env(n, .3, .1, .9, .2)
        save(f'h_kettle{i+1}', f'Kettle whistling {i+1}', 'household', x, ['kettle', 'tea', 'whistle', 'kitchen'])
    for i, k_ in enumerate([3, 1, 5]):
        n = int(.2 * SR); save(f'h_microwave{i+1}', f'Microwave beeps {i+1}', 'household', seq([(np.sin(2 * np.pi * 2000 * T(.2)) * env(n, .003, .02, .9, .02), k * .5) for k in range(k_)]), ['microwave', 'beep', 'done', 'kitchen'])
    for i, f in enumerate([2600, 3200]): save(f'h_ovending{i+1}', f'Oven timer ding {i+1}', 'household', bell(f, 2.0, 2.0, 1.0, 2.0), ['oven', 'timer', 'ding', 'cooking', 'kitchen'])
    for i in range(2):
        t = T(.5); n = len(t); x = (np.sin(2 * np.pi * 900 * t) * .5 + bp(noise(.5), 1000, 6000)[:n]) * expd(n, 25) + .3 * np.sin(2 * np.pi * (300 + 50 * i) * t) * expd(n, 10)
        save(f'h_toaster{i+1}', f'Toaster pop {i+1}', 'household', seq([(woodblock() * .3, 0), (x, .05)]), ['toaster', 'toast', 'pop', 'breakfast', 'kitchen'])
    for i in range(2):
        d = 6; n = int(d * SR); x = hp(noise(d), 2500)[:n] * .3 * (1 + .3 * lp(noise(d), 3)[:n]); m = int(.01 * SR)
        for k in range(1500 + 800 * i): place(x, bp(noise(.01), 2000, 9000)[:m] * expd(m, 300) * R.uniform(.1, .7), R.uniform(0, d))
        save(f'h_sizzle{i+1}', f'Frying pan sizzle {i+1}', 'household', x, ['frying', 'sizzle', 'cooking', 'pancakes', 'kitchen'])
    for i in range(2):
        d = 6; x = lp(noise(d), 500) * .2; m = int(.05 * SR)
        for k in range(300 + 200 * i): f = R.uniform(200, 900); place(x, np.sin(ph(np.linspace(f, f * 2.2, m))) * expd(m, 60) * R.uniform(.1, .5), R.uniform(0, d))
        save(f'h_boil{i+1}', f'Pot boiling bubbles {i+1}', 'household', x, ['boiling', 'bubbles', 'pot', 'soup', 'kitchen'])
    t = T(8); n = len(t); save('h_fridge', 'Fridge hum', 'household', (lp(noise(8), 200)[:n] * .5 + .3 * np.sin(2 * np.pi * 100 * t) + .1 * np.sin(2 * np.pi * 200 * t)) * (1 + .05 * np.sin(2 * np.pi * .3 * t)), ['fridge', 'hum', 'kitchen', 'night'])
    for i in range(2):
        d = 4; t = T(d); n = len(t); f = 180 + 60 * i + 20 * np.sin(2 * np.pi * .5 * t); x = lp(saw(f) * .5 + bp(noise(d), 300, 4000)[:n], 3500) * env(n, .3, .1, .9, .5)
        save(f'h_blender{i+1}', f'Blender {i+1}', 'household', x, ['blender', 'smoothie', 'motor', 'kitchen'])
    for i, (a, b) in enumerate([('E6', 'C6'), ('G5', 'E5'), ('C6', 'A5'), ('B5', 'G5')]):
        save(f'h_doorbell{i+1}', f'Doorbell ding-dong {i+1}', 'household', reverb(seq([(bell(hz(a), 2.2, 2.0, 1.1, 1.8), 0), (bell(hz(b), 2.6, 2.0, 1.1, 1.6), .55)]), 1.0, .2), ['doorbell', 'ding dong', 'visitor', 'door', 'house'])
    for i, k_ in enumerate([2, 3, 4, 3]):
        f = [180, 140, 220, 160][i]; n = int(.15 * SR); kn = (np.sin(2 * np.pi * f * T(.15)) + .6 * bp(noise(.15), 200, 2500)[:n]) * expd(n, 35)
        save(f'h_knock{i+1}', f'Knock knock {i+1}', 'household', seq([(kn * (1 if j % 2 == 0 else .85), j * (.18 if i != 3 else .12) + (.15 if i == 3 and j == 2 else 0)) for j in range(k_)]), ['knock', 'door', 'visitor', 'who is there', 'house'])
    for i in range(3):
        t = T(2); fa, fb = [(440, 480), (853, 960), (1300, 1500)][i]; gate = ((t % 1.0) < .8) if i < 2 else (np.sin(2 * np.pi * 20 * t) > 0) * ((t % 1.0) < .8)
        x = (np.sin(2 * np.pi * fa * t) + np.sin(2 * np.pi * fb * t)) * gate * .5
        save(f'h_phone{i+1}', ['Old telephone ring', 'Phone ringing', 'Bell phone ring'][i], 'household', np.tile(x, 2), ['phone', 'ring', 'call', 'house'])
    for i in range(2):
        n = int(.08 * SR); save(f'h_alarm{i+1}', f'Alarm clock beeping {i+1}', 'household', seq([(np.sin(2 * np.pi * (2700 + 300 * i) * T(.08)) * env(n, .002, .01, .9, .01), j * .5 + k * .12) for j in range(6) for k in range(4)]), ['alarm', 'clock', 'wake up', 'morning', 'house'])
    n = int(6 * SR); save('h_vacuum', 'Vacuum cleaner', 'household', lp(bp(noise(6), 200, 6000)[:n] + .4 * saw(np.full(n, 230.0)), 5000) * env(n, .6, .1, .9, .6), ['vacuum', 'cleaning', 'house', 'chores'])
    for i, notes in enumerate([['E5', 'C5', 'D5', 'G4', None, 'G4', 'D5', 'E5', 'C5'], ['C5', 'E5', 'D5', 'G4']]):
        save(f'h_clockchime{i+1}', f'Clock chime {i+1}', 'household', reverb(seq([(bell(hz(m), 2.5, 2.0, 1.2, 1.2) * .6, k * .55) for k, m in enumerate(notes) if m]), 1.6, .25), ['clock', 'chime', 'hour', 'house'])
    for i, rate in enumerate([1, 2]): save(f'h_tick{i+1}', f'Wall clock ticking {i+1}', 'household', seq([(woodblock() * (.5 if k % 2 else .35), k / rate) for k in range(10 * rate)]), ['clock', 'tick tock', 'time', 'house'])
    for i in range(3):
        n = int(.6 * SR); x = np.sin(ph(sweep(300 - 40 * i, 60, .6))) * expd(n, 7) + .5 * lp(noise(.6), 1200)[:n] * expd(n, 18)
        save(f'h_doorslam{i+1}', f'Door slam {i+1}', 'household', x, ['door', 'slam', 'close', 'house'])
    for i in range(3):
        d = .9 + .4 * i; n = int(d * SR); f = 250 + 150 * np.sin(np.linspace(0, 2 + i, n)); x = tv_bp(saw(f * 2) * .5 + noise(d)[:n] * .5, f * 4, 8) * win(n)
        save(f'h_creak{i+1}', f'Door creak {i+1}', 'household', x, ['door', 'creak', 'squeak', 'spooky', 'house'])
    for i in range(2):
        d = 3; n = int(d * SR); x = hp(noise(d), 300)[:n] * .5 * env(n, .3, .1, .9, .5); m = int(.04 * SR)
        for k in range(80): f = R.uniform(300, 1200); place(x, np.sin(ph(np.linspace(f, f * 1.8, m))) * expd(m, 80) * .2, R.uniform(0, d))
        save(f'h_tap{i+1}', f'Tap running {i+1}', 'household', x, ['tap', 'water', 'sink', 'wash', 'kitchen'])
    n = int(4 * SR); save('h_flush', 'Toilet flush (cartoon)', 'household', lp(noise(4), 1500)[:n] * cat_(np.linspace(0, 1, int(.3 * SR)), np.exp(-np.linspace(0, 3, n - int(.3 * SR)))) * (1 + .4 * np.sin(2 * np.pi * 4 * T(4))), ['toilet', 'flush', 'bathroom', 'funny', 'house'])
    for i in range(2):
        m = int(.03 * SR); c = (bp(noise(.03), 1000, 6000)[:m] + np.sin(2 * np.pi * 1800 * T(.03))) * expd(m, 150)
        save(f'h_switch{i+1}', f'Light switch {i+1}', 'household', seq([(c, 0)] + ([(c * .8, .5)] if i else [])), ['light', 'switch', 'click', 'house'])
    for i in range(3):
        m = int(.12 * SR); x = Z(1.2)
        for k in range(14): place(x, np.sin(2 * np.pi * R.uniform(2500, 6000) * np.arange(m) / SR) * expd(m, 40) * R.uniform(.2, .6), R.uniform(0, .7))
        save(f'h_cutlery{i+1}', f'Cutlery clatter {i+1}', 'household', x, ['cutlery', 'spoon', 'fork', 'dinner', 'kitchen'])
    for i in range(3):
        t = T(1.5); f = 2800 + 400 * i; save(f'h_glassclink{i+1}', f'Glasses clink {i+1}', 'household', (np.sin(2 * np.pi * f * t) + .6 * np.sin(2 * np.pi * f * 2.3 * t)) * expd(len(t), 4) * env(len(t), .001), ['glass', 'clink', 'cheers', 'kitchen'])
    for i in range(2):
        d = 3; x = Z(d); m = int(.08 * SR)
        for k in range(int(d * 4)): place(x, (lp(noise(.08), 2500)[:m] * .8 + .3 * np.sin(2 * np.pi * 150 * T(.08))) * expd(m, 40), max(0, k * (.25 - .05 * i) + R.uniform(-.01, .01)))
        save(f'h_chop{i+1}', f'Chopping vegetables {i+1}', 'household', x, ['chopping', 'knife', 'cooking', 'kitchen'])
    for i in range(2):
        d = 2.5; n = int(d * SR); x = Z(d); m = int(.05 * SR)
        for k in range(14): place(x, np.sin(ph(np.linspace(R.uniform(200, 400) + 100 * i, R.uniform(500, 900), m))) * expd(m, 40) * .5, k * .17)
        save(f'h_pour{i+1}', f'Pouring a drink {i+1}', 'household', x + bp(noise(d), 500, 4000)[:n] * .3 * win(n), ['pour', 'drink', 'juice', 'water', 'kitchen'])
    n = int(.8 * SR); save('h_slurp', 'Drinking slurp', 'household', tv_bp(noise(.8)[:n], sweep(300, 1600, .8), 3) * win(n), ['slurp', 'drink', 'funny', 'kitchen'])
    for i in range(3):
        n = int(.18 * SR); save(f'h_crunch{i+1}', f'Crunchy bite {i+1}', 'household', seq([(bp(noise(.18), 800, 7000)[:n] * expd(n, 22) * R.uniform(.6, 1), k * .22) for k in range(2 + i)]), ['crunch', 'bite', 'eat', 'apple', 'kitchen'])
    t = T(6); n = len(t); save('h_washer', 'Washing machine', 'household', lp(noise(6), 400)[:n] * (1 + .6 * np.sin(2 * np.pi * .8 * t)) + .2 * np.sin(2 * np.pi * 50 * t), ['washing machine', 'laundry', 'house'])

def drops(d, nd, lo, hi, base=.2, blo=4000):
    x = lp(noise(d), blo)[:int(d * SR)] * base; m = int(.02 * SR)
    for k in range(nd): place(x, bp(noise(.02), lo, hi)[:m] * expd(m, 200) * R.uniform(.1, .8), R.uniform(0, d))
    return x
def gen_weather():
    for i, (nd, lo, hi, blo, tg, nm) in enumerate([(600, 2500, 9000, 4000, 'drizzle', 'Drizzle'), (2500, 600, 3500, 1500, 'roof', 'Rain on the roof'), (1200, 1500, 6000, 3000, 'umbrella', 'Rain on an umbrella'), (1800, 3000, 9000, 5000, 'window', 'Rain on the window')]):
        save(f'w_rain{i+1}', nm, 'weather', drops(15, nd, lo, hi, .2, blo), ['rain', tg, 'wet', 'weather'])
    for i in range(2):
        x = drops(15, 3000, 1500, 9000, .5, 5000); place(x, lp(noise(6), 150, 4)[:int(6 * SR)] * np.exp(-np.linspace(0, 4, int(6 * SR))) * 6, 3 + 5 * i); place(x, lp(noise(5), 200, 4)[:int(5 * SR)] * np.exp(-np.linspace(0, 5, int(5 * SR))) * 4, 9)
        save(f'w_storm{i+1}', f'Thunderstorm {i+1}', 'weather', x, ['storm', 'thunder', 'rain', 'weather'])
    for i in range(2):
        d = 10; x = lp(noise(d), 3000)[:int(d * SR)] * .1; m = int(.02 * SR)
        for k in range(1400 + 600 * i): place(x, (np.sin(2 * np.pi * R.uniform(2000, 5000) * T(.02)) + bp(noise(.02), 2000, 8000)[:m]) * expd(m, 220) * R.uniform(.1, .8), R.uniform(0, d))
        save(f'w_hail{i+1}', f'Hail {i+1}', 'weather', x, ['hail', 'ice', 'storm', 'weather'])
    for i, (lo, amt, nm) in enumerate([(400, 1.6, 'Howling wind'), (250, .6, 'Gentle breeze'), (180, 2.0, 'Wind gusts'), (500, 1.2, 'Whistling wind')]):
        d = 15; t = T(d); fc = lo * (2 + amt * np.sin(2 * np.pi * .11 * t) + amt * .7 * np.sin(2 * np.pi * .29 * t + 1)); x = tv_bp(noise(d)[:len(t)], np.maximum(fc, 60), 4 if i in (0, 3) else 2) * (.5 + .5 * np.sin(2 * np.pi * .17 * t) ** 2)
        save(f'w_wind{i+1}', nm, 'weather', x, ['wind', 'air', 'outside', 'weather'])
    t = T(15); n = len(t); save('w_blizzard', 'Blizzard', 'weather', tv_bp(noise(15)[:n], 600 * (2 + 1.5 * np.sin(2 * np.pi * .13 * t)), 3) + .4 * hp(noise(15), 3000)[:n], ['snow', 'blizzard', 'winter', 'cold', 'weather'])
    for i in range(3):
        d = 4; n = int(d * SR); m = int(.08 * SR); x = Z(d); place(x, (hp(noise(.08), 800)[:m] * 2 + lp(noise(.08), 2000)[:m]) * expd(m, 30), 0)
        x += lp(noise(d), 300 + 100 * i, 4)[:n] * np.exp(-np.linspace(0, 3 + i, n)) * 5
        save(f'w_thunderclap{i+1}', f'Thunder clap (close) {i+1}', 'weather', x, ['thunder', 'lightning', 'clap', 'storm', 'weather'])
    for i in range(2):
        d = 7; n = int(d * SR); save(f'w_rumble{i+1}', f'Distant thunder rumble {i+1}', 'weather', lp(noise(d), 120 + 30 * i, 4)[:n] * win(n) ** 2 * (1 + .5 * np.sin(np.linspace(0, 18, n))), ['thunder', 'distant', 'rumble', 'weather'])
    n = int(.6 * SR); save('w_lightning', 'Lightning zap', 'weather', hp(noise(.6), 1500)[:n] * cat_(np.ones(int(.05 * SR)), np.exp(-np.linspace(0, 6, n - int(.05 * SR)))) * (1 + np.sign(np.sin(2 * np.pi * 37 * T(.6)))), ['lightning', 'zap', 'electric', 'weather'])
    save('w_rainbow', 'Rainbow appears (sparkle)', 'weather', reverb(seq([(glock(hz(m), 1.2) * .5, k * .08) for k, m in enumerate(['C6', 'D6', 'E6', 'G6', 'A6', 'C7', 'D7'])]), 1.6, .4), ['rainbow', 'sun', 'sparkle', 'weather'])
    save('w_sunshine', 'Sunshine shimmer', 'weather', reverb(pad(hz('C5'), 3) + pad(hz('G5'), 3) * .7 + pad(hz('E5'), 3) * .6, 1.6, .4), ['sun', 'warm', 'morning', 'weather'])
    for i in range(2):
        d = 12; x = drops(d, 400, 1000, 5000, .05, 2000); m = int(.05 * SR)
        for k in range(int(d * 1.2)): f = R.uniform(500, 1400); place(x, np.sin(ph(np.linspace(f, f * 1.5, m))) * expd(m, 50) * .4, R.uniform(0, d))
        save(f'w_puddles{i+1}', f'Dripping after the rain {i+1}', 'weather', x, ['drip', 'puddle', 'rain', 'cave', 'weather'])

def gen_transitions():
    for i, d in enumerate([1, 2, 3, 4, 6, 8]):
        t = T(d); n = len(t); g = (t / d) ** 2.2; x = tv_bp(noise(d)[:n], sweep(150, 7000, d), 3) * g + .4 * np.sin(ph(sweep(80, 900, d))) * g
        save(f'tr_riser{i+1}', f'Noise riser {d}s', 'impacts', st(x, -.4, .4), ['riser', 'build up', 'tension', 'transition'], stereo=True)
    for i, d in enumerate([2, 4, 6]):
        t = T(d); x = np.zeros(len(t))
        for k in range(6): f = 110 * 2 ** k * 2 ** (t / d); amp = np.exp(-((np.log2(f) - 8.5) / 1.8) ** 2); x += np.sin(ph(f)) * amp
        save(f'tr_tonalriser{i+1}', f'Tonal riser {d}s', 'impacts', x * (t / d) ** 1.2, ['riser', 'tonal', 'build up', 'transition'])
    for i, d in enumerate([2, 3]):
        t = T(d); x = np.zeros(len(t) + SR)
        for k in range(int(d * 30)): at = (k / (d * 30)) ** .6 * d; place(x, bell(R.uniform(2000, 6000) * (1 + at / d), .2, 2.3, 1, 18) * (at / d), at)
        x[:len(t)] += .3 * hp(noise(d), 4000)[:len(t)] * (t / d) ** 3
        save(f'tr_sparkleriser{i+1}', f'Sparkle riser {d}s', 'impacts', reverb(x, 1.2, .3), ['riser', 'sparkle', 'magic', 'transition'])
    for i, d in enumerate([1, 2, 3, 4, 1.5, 2.5]):
        t = T(d); n = len(t); x = tv_bp(noise(d)[:n], sweep(6000, 150, d), 2.5) * (1 - t / d) ** 1.5 + .4 * np.sin(ph(sweep(700, 40, d))) * (1 - t / d)
        save(f'tr_down{i+1}', f'Downlifter {d}s', 'impacts', x, ['downlifter', 'drop', 'fall', 'transition'])
    for i, d in enumerate([1, 1.5, 2, 3]):
        t = T(d); n = len(t); x = hp(noise(d), 3000)[:n] * (t / d) ** 3; x[-int(.02 * SR):] *= np.linspace(1, 0, int(.02 * SR))
        save(f'tr_revcymbal{i+1}', f'Reverse cymbal {d}s', 'impacts', x, ['reverse', 'cymbal', 'swell', 'transition'])
    for i, (a, b, d) in enumerate([(80, 25, 1.2), (60, 20, 2), (120, 30, .8), (50, 18, 3)]):
        save(f'tr_subdrop{i+1}', f'Sub drop {i+1}', 'impacts', np.sin(ph(sweep(a, b, d))) * expd(int(d * SR), 2.5 / d), ['sub drop', 'bass', 'boom', 'transition'])
    for i in range(6):
        d = 2.5; n = int(d * SR); x = np.sin(ph(np.pad(sweep(110 - 10 * i, 32, d * .6), (0, n - int(d * .6 * SR)), mode='edge'))) * expd(n, 2.5) + lp(noise(d), 500 + 200 * i)[:n] * expd(n, 4) * .8 + hp(noise(d), 3000)[:n] * expd(n, 8) * .3
        save(f'tr_boom{i+1}', f'Boom impact {i+1}', 'impacts', reverb(x, 1.8, .25), ['boom', 'impact', 'hit', 'trailer', 'transition'])
    for i, root in enumerate([41, 38, 44, 36]):
        d = 3.5; n = int(d * SR); x = sum(lp(saw(np.full(n, m2f(root + o) * (1 + dt))), 1500) for o in (0, 7, 12, 15 if i % 2 else 16) for dt in (-.003, .004)) * env(n, .01, .4, .5, 1.5) * .3
        save(f'tr_braam{i+1}', f'Cinematic brass hit {i+1}', 'impacts', reverb(x + timpani(m2f(root), d)[:n] * 1.5, 2.0, .3), ['braam', 'cinematic', 'epic', 'hit', 'trailer'])
    for i in range(4):
        a = int(.5 * SR); b = int(.6 * SR); w = tv_bp(noise(.5)[:a], sweep(300 + 100 * i, 4000, .5), 1.5) * np.linspace(0, 1, a) ** 2; h_ = (np.sin(ph(sweep(150 + 20 * i, 50, .6))) + .5 * lp(noise(.6), 2000)[:b]) * expd(b, 8)
        save(f'tr_whooshhit{i+1}', f'Whoosh into hit {i+1}', 'impacts', seq([(w, 0), (h_, .5)]), ['whoosh', 'hit', 'transition', 'impact'])
    for i in range(8):
        d = [.2, .25, .3, .35, .4, .5, .6, .8][i]; n = int(d * SR); fc = sweep(600 + 300 * (i % 3), 8000 - 600 * i, d) if i % 2 == 0 else sweep(7000 - 500 * i, 500, d)
        save(f'tr_swish{i+1}', f'Swish {i+1}', 'impacts', st(tv_bp(noise(d)[:n], fc, 2) * win(n) ** 1.2, -.8 if i % 2 else .8, .8 if i % 2 else -.8), ['swish', 'swoosh', 'fast', 'transition'], stereo=True)
    for i in range(4):
        m = int(.12 * SR); src = np.sin(ph(np.full(m, 220.0 * (i + 1)))) + bp(noise(.12), 500, 6000)[:m] * .5; x = Z(1.2); tt = 0
        while tt < 1.0: place(x, src[:int(R.uniform(.03, .1) * SR)] * R.uniform(.5, 1), tt); tt += R.choice([.04, .06, .08, .12])
        save(f'tr_glitch{i+1}', f'Glitch stutter {i+1}', 'impacts', np.round(x * 8) / 8, ['glitch', 'stutter', 'digital', 'transition'])
    for i, f0 in enumerate([220, 330, 165]):
        t = T(1.0); f = f0 * (1 - t) ** 1.5 + 5; save(f'tr_tapestop{i+1}', f'Tape stop {i+1}', 'impacts', lp((saw(f) * .4 + np.sin(ph(f)) * .6) * (1 - t), 3000), ['tape stop', 'slow down', 'record', 'transition'])
    for i in range(3):
        d = .5 + .2 * i; t = T(d); n = len(t); f = 600 + 2500 * np.abs(np.sin(2 * np.pi * (2 + i) * t)); save(f'tr_scratch{i+1}', f'Record scratch {i+1}', 'impacts', tv_bp(noise(d)[:n], f, 4) * env(n, .01, .05, .9, .05), ['record scratch', 'dj', 'stop', 'funny', 'transition'])
    for i in range(2):
        a = int(.03 * SR); b = int(.05 * SR); x = seq([((bp(noise(.03), 1500, 8000)[:a] + np.sin(2 * np.pi * 2000 * T(.03))) * expd(a, 150), 0), (bp(noise(.05), 800, 6000)[:b] * expd(b, 80) * .7, .09 + .03 * i)])
        save(f'tr_shutter{i+1}', f'Camera shutter {i+1}', 'impacts', x, ['camera', 'shutter', 'photo', 'snap', 'transition'])
    b = int(.05 * SR); save('tr_flash', 'Camera flash charge + snap', 'impacts', seq([(np.sin(ph(sweep(1000, 9000, 1.0))) * np.linspace(0, .4, SR), 0), (bp(noise(.05), 1500, 8000)[:b] * expd(b, 80), 1.0)]), ['flash', 'camera', 'photo', 'transition'])
    for i in range(2):
        d = 1.2; t = T(d); n = len(t); f = 200 + 2000 * (t / d) ** 2; save(f'tr_rewind{i+1}', f'Rewind {i+1}', 'impacts', tv_bp(noise(d)[:n] + saw(f) * .3, f * 2, 3) * env(n, .02, .05, .9, .05), ['rewind', 'go back', 'tape', 'transition'])
    for i in range(3):
        a = int(.15 * SR); b = int(.1 * SR); save(f'tr_pop{i+1}', f'Pop transition {i+1}', 'impacts', seq([(tv_bp(noise(.15)[:a], sweep(800, 4000, .15), 2) * np.linspace(0, 1, a), 0), (np.sin(ph(sweep(1200 + 300 * i, 400, .1))) * expd(b, 30), .15)]), ['pop', 'transition', 'appear'])
    for i in range(3):
        d = .6; n = int(d * SR); x = np.pad(tv_bp(noise(d)[:n], sweep(1000 + 500 * i, 7000, d), 2) * win(n) * .7, (0, SR))
        for k in range(8): place(x, bell(R.uniform(3000, 7000), .3, 2.3, 1, 14) * .3, k * .06)
        save(f'tr_sparkleswipe{i+1}', f'Sparkle swipe {i+1}', 'impacts', reverb(x, 1.0, .3), ['sparkle', 'swipe', 'magic', 'transition'])
    for i in range(3):
        m = int(1.5 * SR); save(f'tr_drumfill{i+1}', f'Drum fill transition {i+1}', 'impacts', seq([(tom(220 - 30 * k + 20 * i, .4) * .7, k * (.12 - .015 * i)) for k in range(6)] + [(kick() * .9, .72), (hp(noise(1.5), 4000)[:m] * expd(m, 2.5) * .5, .72)]), ['drum fill', 'drums', 'transition', 'intro'])
    for i in range(3):
        d = 1.5 + .5 * i; t = T(d); n = len(t); x = sum(np.sin(ph(sweep(200 * k, 1600 * k, d))) / k for k in (1, 2, 3)) * np.linspace(0, 1, n) ** 2
        save(f'tr_powerup{i+1}', f'Power-up whoosh {i+1}', 'impacts', reverb(x + .2 * hp(noise(d), 3000)[:n] * np.linspace(0, 1, n) ** 3, 1.0, .25), ['power up', 'charge', 'rise', 'transition'])
    for i in range(3):
        n = int(.8 * SR); a = int(.3 * SR); save(f'tr_punch{i+1}', f'Cartoon punch hit {i+1}', 'impacts', np.pad(np.sin(ph(sweep(200 + 40 * i, 60, .3))) * expd(a, 12), (0, n - a)) + .7 * bp(noise(.8), 500, 5000)[:n] * expd(n, 30), ['punch', 'hit', 'pow', 'cartoon', 'impact'])
    for i in range(3):
        n = int(1.2 * SR); save(f'tr_thud{i+1}', f'Heavy thud {i+1}', 'impacts', np.sin(ph(sweep(90 - 10 * i, 35, 1.2))) * expd(n, 6) + .5 * lp(noise(1.2), 600)[:n] * expd(n, 12), ['thud', 'heavy', 'land', 'impact'])

def tone(f, d, w='sine'):
    n = int(d * SR); fr = arr(f, n)
    return {'sine': np.sin(ph(fr)), 'sq': sq(fr) * .5, 'tri': tri(fr)}[w]
def gen_ui():
    for i in range(20):
        f = R.uniform(500, 2500); d = R.uniform(.04, .12); w = ['sine', 'sq', 'tri'][i % 3]; n = int(d * SR); fr = f * (1 + R.uniform(-.4, .6) * np.arange(n) / n)
        save(f'ui_blip{i+1}', f'UI blip {i+1}', 'game', tone(fr, d, w) * env(n, .002, d * .4, .3, d * .3), ['blip', 'click', 'ui', 'button', 'tap'])
    for i, (fs, nm) in enumerate([([660, 990], 'Confirm'), ([880, 1320], 'Confirm (bright)'), ([523, 784, 1047], 'Confirm (triple)'), ([990, 660], 'Cancel'), ([600, 400], 'Back'), ([440, 330, 220], 'Cancel (down)')]):
        n = int(.09 * SR); save(f'ui_conf{i+1}', nm, 'game', seq([(tone(f, .09) * env(n, .002, .04, .5, .03), k * .07) for k, f in enumerate(fs)]), ['ui', 'confirm' if i < 3 else 'cancel', 'button', 'menu'])
    for i, notes in enumerate([['E6', 'B6'], ['C6', 'G6', 'C7'], ['A5', 'E6'], ['G6', 'E6', 'C7'], ['D6', 'F#6', 'A6'], ['F6', 'C7']]):
        save(f'ui_notify{i+1}', f'Notification {i+1}', 'game', reverb(seq([(bell(hz(m), .8, 2.0, .9, 5) * .6, k * .09) for k, m in enumerate(notes)]), .8, .2), ['notification', 'alert', 'message', 'ui'])
    for i in range(10):
        base = R.uniform(600, 1200); k_ = int(R.integers(2, 5)); step = R.uniform(1.15, 1.5); n = int(.06 * SR)
        save(f'ui_pickup{i+1}', f'Pickup {i+1}', 'game', seq([(tone(base * step ** k, .06, 'sq') * .8 * env(n, .002, .03, .6, .02), k * .05) for k in range(k_)]), ['pickup', 'collect', 'item', 'game'])
    for i in range(6):
        d = R.uniform(.15, .3); n = int(d * SR); save(f'ui_jump{i+1}', f'Jump {i+1}', 'game', tone(sweep(R.uniform(150, 300), R.uniform(500, 1100), d), d, 'sq') * env(n, .002, d * .6, .3, d * .2), ['jump', 'hop', 'platform', 'game'])
    for i in range(6):
        d = R.uniform(.15, .35); n = int(d * SR); save(f'ui_zap{i+1}', f'Zap {i+1}', 'game', tone(sweep(R.uniform(1500, 3000), R.uniform(100, 300), d), d, 'sq') * expd(n, 6 / d), ['zap', 'laser', 'space', 'game'])
    for i in range(4):
        d = .6 + .2 * i; n = int(d * SR); save(f'ui_powerdown{i+1}', f'Power down {i+1}', 'game', tone(sweep(800, 80, d), d, 'sq') * np.linspace(1, 0, n), ['power down', 'lose', 'fail', 'game'])
    for i, notes in enumerate([['C5', 'E5', 'G5', 'C6', 'G5', 'C6'], ['G5', 'A5', 'B5', 'D6', 'G6'], ['E5', 'G5', 'E6', 'C6', 'D6', 'G6'], ['C5', 'C5', 'G5', 'G5', 'C6']]):
        n = int(.12 * SR); save(f'ui_win{i+1}', f'Level complete {i+1}', 'game', seq([(tone(hz(m), .12, 'sq') * env(n, .003, .05, .6, .03), k * .11) for k, m in enumerate(notes)]), ['win', 'level up', 'victory', 'game'])
    for i, notes in enumerate([['G4', 'F#4', 'F4', 'E4'], ['C5', 'G4', 'E4', 'C4'], ['E4', 'D#4', 'D4', 'C#4']]):
        n = int(.22 * SR); save(f'ui_lose{i+1}', f'Game over {i+1}', 'game', seq([(tone(hz(m), .22, 'sq') * env(n, .003, .1, .6, .05), k * .22) for k, m in enumerate(notes)]), ['game over', 'lose', 'fail', 'game'])
    for i in range(4):
        n = int(.025 * SR); save(f'ui_typewriter{i+1}', f'Text typing blips {i+1}', 'game', seq([(tone(R.uniform(700, 900) * (1 + .3 * i), .025, 'sq') * expd(n, 80), k * .07) for k in range(14)]), ['text', 'typing', 'dialogue', 'speech bubble', 'game'])
    for i in range(3):
        d = 1.0; t = T(d); f = 300 + 1500 * np.abs(np.sin(2 * np.pi * (3 + i) * t)) * (t / d); save(f'ui_teleport{i+1}', f'Teleport {i+1}', 'game', tone(f, d, 'sq') * env(len(t), .01, .1, .7, .2), ['teleport', 'warp', 'magic', 'game'])
    for i, notes in enumerate([['C6', 'E6', 'G6', 'C7', 'E7'], ['A5', 'C#6', 'E6', 'A6'], ['F6', 'A6', 'C7', 'F7']]):
        save(f'ui_heart{i+1}', f'Extra heart {i+1}', 'game', reverb(seq([(glock(hz(m), .5) * .6, k * .07) for k, m in enumerate(notes)]), .8, .2), ['heart', 'life', 'health', 'love', 'game'])
    for i in range(3):
        n = int(.05 * SR); save(f'ui_hover{i+1}', f'Soft hover {i+1}', 'game', tone(1200 + 300 * i, .05) * win(n) * .5, ['hover', 'soft', 'ui'])
    for i in range(3):
        n = int(.03 * SR); save(f'ui_toggle{i+1}', f'Toggle switch {i+1}', 'game', seq([(tone(900 + 300 * i, .03) * expd(n, 100), 0), (tone(1300 + 300 * i, .03) * expd(n, 100), .05)]), ['toggle', 'switch', 'ui'])

def gen_bible():
    for i, f0 in enumerate([233, 196, 262]):
        d = 2.6; t = T(d); n = len(t); f = lp(f0 * np.where(t < .5, 1.0, 1.5) * (1 + .02 * np.sin(2 * np.pi * 5 * t)), 20); x = tv_lp(saw(f), 500 + 2200 * env(n, .1, .3, .7, .3)) + .2 * bp(noise(d), 300, 2000)[:n]
        save(f'b_shofar{i+1}', f'Shofar (ram’s horn) blast {i+1}', 'bible', reverb(x * env(n, .06, .1, .9, .3), 1.6, .3), ['shofar', 'ram horn', 'jericho', 'trumpet', 'bible'])
    for i in range(2):
        save(f'b_trumpets{i+1}', f'Trumpet blast (Jericho) {i+1}', 'bible', reverb(sum(cbrass(hz(m), 2.2) for m in (['C4', 'G4', 'C5'] if i == 0 else ['D4', 'A4', 'D5', 'F#5'])), 2.0, .3), ['trumpet', 'jericho', 'blast', 'army', 'bible'])
    for i, notes in enumerate([['D4', 'F#4', 'A4', 'D5', 'E5'], ['G3', 'B3', 'D4', 'G4', 'A4'], ['A3', 'C4', 'E4', 'A4', 'B4'], ['C4', 'E4', 'G4', 'C5', 'D5']]):
        save(f'b_lyre{i+1}', f'David’s lyre strum {i+1}', 'bible', reverb(seq([(pluck_fast(hz(m), 2.5, .45, .997) * .5, k * .06) for k, m in enumerate(notes)] + [(pluck_fast(hz(m), 2.0, .45, .997) * .35, .9 + k * .05) for k, m in enumerate(notes[::-1])]), 1.4, .3), ['lyre', 'harp', 'david', 'psalm', 'bible'])
    for i in range(2):
        save(f'b_templebells{i+1}', f'Temple bells {i+1}', 'bible', reverb(seq([(bell(R.uniform(500, 1200), 3, 2.76, 1.2, 1.2) * .5, k * .7) for k in range(5)]), 2.0, .35), ['temple', 'bells', 'worship', 'bible'])
    for i in range(2):
        d = 6; n = int(d * SR); x = lp(noise(d), 250, 4)[:n] * cat_(np.linspace(0, 1, SR), np.ones(3 * SR), np.linspace(1, 0, n - 4 * SR)) * 3; m = int(.2 * SR)
        for k in range(120): place(x, (lp(noise(.2), 1500)[:m] + .3 * np.sin(2 * np.pi * R.uniform(80, 200) * T(.2))) * expd(m, 15) * R.uniform(.2, 1), R.uniform(.5, 5))
        save(f'b_walls{i+1}', f'Walls tumbling down {i+1}', 'bible', x, ['jericho', 'walls', 'crumble', 'collapse', 'bible'])
    d = 10; t = T(d); n = len(t); x = tv_bp(noise(d)[:n], 200 * (2 + 1.5 * np.sin(np.pi * t / d)), 1.5) * np.sin(np.pi * t / d) + lp(noise(d), 400)[:n] * np.sin(np.pi * t / d) ** 2 * 1.5
    save('b_redsea', 'Red Sea parting', 'bible', reverb(x, 2.0, .3), ['red sea', 'moses', 'water', 'miracle', 'bible'])
    for i in range(2):
        d = 6; t = T(d); n = len(t); x = lp(noise(d), 80 + 30 * i, 4)[:n] * (1 + .7 * np.sin(2 * np.pi * 3 * t)) * np.sin(np.pi * t / d) * 4; m = int(.15 * SR)
        for k in range(40): place(x, lp(noise(.15), 1200)[:m] * expd(m, 20) * R.uniform(.1, .5), R.uniform(.5, 5.5))
        save(f'b_earthquake{i+1}', f'Earthquake rumble {i+1}', 'bible', x, ['earthquake', 'rumble', 'shake', 'bible'])
    for i in range(2):
        w = Z(1.6); a = int(.3 * SR); b = int(.4 * SR)
        for k in range(4): place(w, tv_bp(noise(.3)[:a], sweep(400, 1800, .3), 2) * win(a) * (.5 + .15 * k), k * (.3 - .03 * i))
        save(f'b_sling{i+1}', f'Sling whirl and release {i+1}', 'bible', seq([(w, 0), (tv_bp(noise(.4)[:b], sweep(2500, 600, .4), 2) * win(b), 1.2), ((np.sin(ph(sweep(160, 50, .4))) + .5 * lp(noise(.4), 1500)[:b]) * expd(b, 12), 1.65)]), ['sling', 'david', 'goliath', 'stone', 'bible'])
    for i, (p, sh) in enumerate([(260, 1.0), (340, 1.2), (200, .9), (420, 1.3)]):
        t = T(.9); save(f'b_sheep{i+1}', f'Sheep baa (cartoon) {i+1}', 'bible', voice(p * (1 + .06 * np.sin(2 * np.pi * 9 * t)), ['ae', 'ae', 'e'], .9, breath=.25, vib=9, vibd=.05, shift=sh), ['sheep', 'lamb', 'baa', 'shepherd', 'animals', 'bible'])
    for i in range(2):
        x = seq([(voice(lin(500, 700, .35), ['i'], .35, breath=.3, shift=1.1), 0), (voice(lin(220, 180, .5), ['a', 'o'], .5, breath=.4, rough=.04), .4), (voice(lin(520, 700, .3), ['i'], .3, breath=.3), 1.0), (voice(lin(220, 170, .5), ['a'], .5, breath=.4, rough=.04), 1.35)])
        save(f'b_donkey{i+1}', f'Donkey hee-haw (cartoon) {i+1}', 'bible', x, ['donkey', 'hee haw', 'animals', 'bible'])
    for i in range(2):
        d = 2.0; n = int(d * SR); x = voice(cat_(lin(90 + 10 * i, 140, .6), lin(140, 70, 1.4)), ['a', 'o', 'u'], d, breath=1.2, rough=.08, shift=.7) + lp(noise(d), 700)[:n] * env(n, .2, .2, .7, .6)
        save(f'b_lion{i+1}', f'Lion roar (friendly) {i+1}', 'bible', reverb(x, 1.2, .2), ['lion', 'roar', 'daniel', 'animals', 'bible'])
    for i, ch in enumerate([['C4', 'E4', 'G4', 'C5'], ['F4', 'A4', 'C5', 'F5'], ['D4', 'F#4', 'A4', 'D5']]):
        x = sum(choir(hz(m), 4) for m in ch); x[:int(1.5 * SR) + 0] += sum(celesta(hz(m) * 2, 1.5)[:int(1.5 * SR)] * .2 for m in ch)
        save(f'b_angels{i+1}', f'Angel choir “ahh” {i+1}', 'bible', reverb(x, 2.4, .45), ['angels', 'choir', 'heaven', 'holy', 'bible'])
    x = seq([(bell(R.uniform(2500, 6000), .4, 2.3, 1, 10) * R.uniform(.2, .5), R.uniform(0, 3)) for k in range(60)]); x[:int(3.5 * SR)] += pad(hz('C5'), 3.5)[:int(3.5 * SR)][:len(x)] * .3 if len(x) >= int(3.5 * SR) else 0
    save('b_manna', 'Manna from heaven (sparkle)', 'bible', reverb(x, 1.8, .4), ['manna', 'heaven', 'sparkle', 'miracle', 'bible'])
    for i in range(2):
        save(f'b_dove{i+1}', f'Dove cooing {i+1}', 'bible', seq([(voice(cat_(lin(330 - 20 * i, 300, .25), lin(300, 360, .35)), ['u', 'u'], .6, breath=.4, shift=.8) * .8, k * .9) for k in range(3)]), ['dove', 'bird', 'peace', 'spirit', 'noah', 'bible'])
    d = 8; n = int(d * SR); x = lp(noise(d), 300)[:n] * .4; m = int(.01 * SR)
    for k in range(500): place(x, hp(noise(.01), 1000)[:m] * expd(m, 400) * R.uniform(.1, 1), R.uniform(0, d))
    save('b_burningbush', 'Burning bush (fire and glory)', 'bible', x + reverb(sum(choir(hz(q), d) for q in ['A3', 'E4', 'A4']) * .25, 2.0, .4)[:n], ['burning bush', 'moses', 'fire', 'holy', 'bible'])
    save('b_rooster', 'Rooster crow (cartoon)', 'bible', vline(('o', 500, 600, .15), ('a', 650, 700, .15), ('u', 700, 760, .2), ('o', 760, 520, .5), shift=1.2, breath=.3), ['rooster', 'morning', 'peter', 'animals', 'bible'])
    for i in range(2):
        d = 8; x = bp(noise(d), 200, 1500)[:int(d * SR)] * .4
        for v in range(18): f0 = R.uniform(100, 260); dd = R.uniform(.5, 1.5); at = R.uniform(0, d - dd); place(x, voice(f0 * (1 + .1 * np.sin(np.linspace(0, 6, int(dd * SR)))), [R.choice(['a', 'e', 'o', 'u'])], dd, breath=.3) * .25, at)
        save(f'b_crowd{i+1}', f'Crowd murmuring {i+1}', 'bible', lp(x, 2500), ['crowd', 'people', 'market', 'town', 'bible'])
    a = int(.5 * SR); b = int(1.2 * SR)
    save('b_net', 'Fishing net splash', 'bible', seq([(tv_bp(noise(.5)[:a], sweep(600, 3000, .5), 1.5) * win(a) * .5, 0), (lp(noise(1.2), 4000)[:b] * expd(b, 4), .5)]), ['fishing', 'net', 'galilee', 'water', 'bible'])
    for i in range(2):
        d = 6; x = Z(d)
        for k in range(5): L_ = R.uniform(.6, 1.2); m = int(L_ * SR); f = R.uniform(200, 450) * (1 + .3 * np.sin(np.linspace(0, 2, m))); place(x, tv_bp(saw(f) * .4 + noise(L_)[:m] * .6, f * 3, 10) * win(m), R.uniform(0, d - L_))
        save(f'b_boatcreak{i+1}', f'Wooden boat creaking {i+1}', 'bible', x + .3 * lp(noise(d), 800)[:len(x)] * (1 + .5 * np.sin(2 * np.pi * .15 * T(d)))[:len(x)], ['boat', 'creak', 'jonah', 'galilee', 'bible'])
    a = int(.6 * SR); b = int(.8 * SR); c = int(.1 * SR)
    save('b_well', 'Bucket into the well', 'bible', seq([(tv_bp(noise(.6)[:a], sweep(500, 300, .6), 6) * .3, 0), (lp(noise(.8), 3000)[:b] * expd(b, 6) + np.pad(np.sin(ph(sweep(500, 1200, .1))) * expd(c, 30), (0, b - c)) * .5, 1.4)]), ['well', 'water', 'bucket', 'bible'])
    n = int(3.5 * SR); x = lp(noise(3.5), 500)[:n] * (1 + .6 * np.sin(2 * np.pi * 2.5 * T(3.5))) * env(n, .3, .1, .8, .6) * 1.5; place(x, timpani(55, 1.5) * .8, 3.0)
    save('b_stone', 'Stone rolled away (tomb)', 'bible', x, ['stone', 'tomb', 'easter', 'resurrection', 'bible'])
    for i in range(2):
        d = 4; n = int(d * SR); x = lp(noise(d), 120 + 40 * i, 4)[:n] * 3 * env(n, .5, .2, .8, 1.5) + reverb(sum(choir(hz(q), d) for q in ['C3', 'G3', 'C4']) * .3, 2.0, .3)[:n]
        save(f'b_glory{i+1}', f'Glory of God (rumble + choir) {i+1}', 'bible', x, ['glory', 'holy', 'mountain', 'sinai', 'bible'])
    m = int(.05 * SR)
    save('b_waterwine', 'Water into wine (miracle sparkle)', 'bible', reverb(seq([(np.sin(ph(np.linspace(R.uniform(300, 600), R.uniform(900, 1500), m))) * expd(m, 50) * .3, R.uniform(0, 1.5)) for k in range(30)] + [(glock(hz(q), 1.5) * .4, 1.5 + k * .1) for k, q in enumerate(['C6', 'E6', 'G6', 'C7'])]), 1.6, .35), ['miracle', 'wine', 'wedding', 'cana', 'bible'])
    for i in range(2):
        d = 10; t = T(d); n = len(t); x = lp(noise(d), 500 + 200 * i)[:n] * (.15 + .85 * (.5 + .5 * np.sin(2 * np.pi * t / 5 - 1.5)) ** 3) * 1.5
        place(x, lp(noise(5), 180, 4)[:5 * SR] * np.exp(-np.linspace(0, 4, 5 * SR)) * 5, 2 + 3 * i)
        save(f'b_stormsea{i+1}', f'Storm on the sea (Jonah) {i+1}', 'bible', x + tv_bp(noise(d)[:n], 300 * (2 + np.sin(2 * np.pi * .2 * t)), 3) * .5, ['storm', 'sea', 'jonah', 'waves', 'bible'])
    for i in range(2):
        m = int(.2 * SR); save(f'b_hammer{i+1}', f'Carpenter hammering {i+1}', 'bible', seq([((np.sin(2 * np.pi * (900 + 100 * i) * T(.2)) + .6 * bp(noise(.2), 500, 6000)[:m]) * expd(m, 30), k * .45) for k in range(6)]), ['hammer', 'carpenter', 'joseph', 'noah', 'ark', 'bible'])
    m = int(.5 * SR); save('b_sawwood', 'Sawing wood (building the ark)', 'bible', seq([(bp(noise(.5), 1500, 6000)[:m] * win(m) * (1 + .5 * np.sin(2 * np.pi * 60 * T(.5))), k * .55) for k in range(6)]), ['saw', 'wood', 'ark', 'noah', 'carpenter', 'bible'])
    save('b_camelbells', 'Camel caravan bells', 'bible', seq([(bell(float(R.choice([900, 1100, 1300])), .8, 2.4, 1, 6) * .4, k * .6 + R.uniform(0, .1)) for k in range(12)]), ['camel', 'caravan', 'desert', 'wise men', 'bible'])

if __name__ == '__main__':
    only = sys.argv[2:]
    for g in (gen_voices, gen_vehicles, gen_sports, gen_school, gen_house, gen_weather, gen_transitions, gen_ui, gen_bible):
        if only and g.__name__ not in only: continue
        n0 = len(items)
        try: g()
        except Exception as e: import traceback; traceback.print_exc(); print('FAILED in', g.__name__)
        print(g.__name__, len(items) - n0, flush=True)
    json.dump(items, open(f'{OUT}/items-sfx2.json', 'w'), indent=0, ensure_ascii=False); print('made', len(items))

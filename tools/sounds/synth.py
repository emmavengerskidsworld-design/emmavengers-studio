"""Emmavengers Originals: sound effects and music made from scratch with plain synthesis maths (numpy) — no samples,
no AI. Everything this script makes is our own work, released as CC0.   python3 tools/sounds/synth.py OUTDIR
Writes OUTDIR/<id>.wav + OUTDIR/items.json ([{id, name, cat, kind, tags}])."""
import numpy as np, json, sys, os
from scipy.signal import butter, sosfilt, fftconvolve
SR = 48000; R = np.random.default_rng(2026)
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/originals'; os.makedirs(OUT, exist_ok=True)
items = []
def T(d): return np.arange(int(d * SR)) / SR
def env(n, a=0.005, d=0.1, s=0.0, r=0.05, sus=None):
    """ADSR envelope of n samples (sus = sustain time; default fills)."""
    A, D, Rl = int(a * SR), int(d * SR), int(r * SR); S = max(0, n - A - D - Rl) if sus is None else int(sus * SR)
    e = np.concatenate([np.linspace(0, 1, A, False), np.linspace(1, s, D, False), np.full(S, s), np.linspace(s, 0, Rl)]) if s > 0 else np.concatenate([np.linspace(0, 1, A, False), np.exp(-np.linspace(0, 6, max(1, n - A)))])
    return np.pad(e, (0, max(0, n - len(e))))[:n]
def expd(n, k): return np.exp(-np.arange(n) / SR * k)
def ph(freq):  # phase from a per-sample frequency array
    return 2 * np.pi * np.cumsum(freq) / SR
def sweep(f0, f1, d, curve='exp'):
    t = np.linspace(0, 1, int(d * SR)); return f0 * (f1 / f0) ** t if curve == 'exp' else f0 + (f1 - f0) * t
def noise(d): return R.standard_normal(int(d * SR))
def bp(x, lo, hi, o=2): return sosfilt(butter(o, [lo, min(hi, SR / 2 - 100)], 'band', fs=SR, output='sos'), x)
def lp(x, f, o=2): return sosfilt(butter(o, min(f, SR / 2 - 100), 'low', fs=SR, output='sos'), x)
def hp(x, f, o=2): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)
def tv_lp(x, fc, block=256):  # time-varying low-pass (1-pole) with cutoff array
    y = np.zeros_like(x); z = 0.0
    for i in range(0, len(x), block):
        a = 1 - np.exp(-2 * np.pi * fc[min(i, len(fc) - 1)] / SR)
        for j in range(i, min(i + block, len(x))): z += a * (x[j] - z); y[j] = z
    return y
def tv_bp(x, fc, q=4, block=128):  # time-varying state-variable band-pass
    y = np.zeros_like(x); lo = bd = 0.0
    for i in range(0, len(x), block):
        f = 2 * np.sin(np.pi * min(fc[min(i, len(fc) - 1)], SR / 6) / SR)
        for j in range(i, min(i + block, len(x))):
            hi_ = x[j] - lo - bd / q; bd += f * hi_; lo += f * bd; y[j] = bd
    return y
IR = {}
def reverb(x, t=1.2, wet=0.25, pre=0.01):
    if t not in IR:
        n = int(t * SR); ir = R.standard_normal(n) * np.exp(-np.arange(n) / SR * 6.9 / t); ir = lp(ir, 6000); ir[:int(pre * SR)] = 0; IR[t] = ir / np.sqrt(np.sum(ir ** 2))
    y = fftconvolve(x, IR[t])[:len(x) + int(t * SR * .6)]; x2 = np.pad(x, (0, len(y) - len(x)))
    return x2 * (1 - wet * .3) + y * wet * 0.5
def pluck(f, d, bright=0.5, decay=0.996):
    """Karplus-Strong plucked string."""
    n, P = int(d * SR), max(2, int(SR / f)); buf = (R.random(P) * 2 - 1) * 1.0; buf = lp(buf, 1500 + 7000 * bright, 1); out = np.zeros(n)
    for i in range(n):
        j = i % P; out[i] = buf[j]; buf[j] = decay * 0.5 * (buf[j] + buf[(j + 1) % P])
    return out
def pluck_fast(f, d, bright=0.5, decay=0.996):
    """Vectorised Karplus-Strong (period-by-period)."""
    n, P = int(d * SR), max(2, int(round(SR / f))); buf = lp(R.random(P) * 2 - 1, 1500 + 7000 * bright, 1); out = np.zeros(n + P)
    for k in range(0, n + P, P):
        out[k:k + P] = buf[:len(out[k:k + P])]; buf = decay * 0.5 * (buf + np.roll(buf, -1))
    return out[:n]
def bell(f, d, ratio=3.5, idx=2.2, k=3.0):
    t = T(d); e = expd(len(t), k); return np.sin(2 * np.pi * f * t + idx * e * np.sin(2 * np.pi * f * ratio * t)) * e
def mbox(f, d): return 0.7 * bell(f, d, 5.0, 1.2, 4.0) + 0.3 * bell(2 * f, d, 3.0, 0.6, 7.0)
def marimba(f, d): t = T(d); return (np.sin(2 * np.pi * f * t) * expd(len(t), 7) + 0.25 * np.sin(2 * np.pi * f * 4 * t) * expd(len(t), 25)) * env(len(t), .002)
def glock(f, d): t = T(d); return (np.sin(2 * np.pi * f * t) + .4 * np.sin(2 * np.pi * f * 2.76 * t) * expd(len(t), 6) + .2 * np.sin(2 * np.pi * f * 5.4 * t) * expd(len(t), 12)) * expd(len(t), 2.5) * env(len(t), .001)
def piano(f, d):
    t = T(d); x = sum(np.sin(2 * np.pi * f * h * t * (1 + 0.0004 * h * h)) * (0.6 ** (h - 1)) * expd(len(t), 1.2 + 0.9 * h) for h in range(1, 8)); return x * env(len(t), .003) * 0.6
def pad(f, d, att=.4):
    t = T(d); x = sum(np.sign(np.sin(2 * np.pi * f * t * (1 + dt))) * 0 + (2 * ((f * (1 + dt) * t) % 1) - 1) for dt in (-.004, 0, .005)) / 3
    return lp(x, 1400) * env(len(t), att, .2, .8, att)
def flute(f, d):
    t = T(d); vib = 1 + 0.006 * np.sin(2 * np.pi * 5 * t) * np.clip(t * 3 - .3, 0, 1)
    x = np.sin(ph(f * vib)) + 0.15 * np.sin(2 * ph(f * vib)) + 0.02 * lp(noise(d), 3000); return x * env(len(t), .04, .05, .85, .06)
def brass(f, d):
    t = T(d); fc = 600 + 2500 * env(len(t), .03, .2, .6, .08); x = 2 * ((f * t) % 1) - 1
    return tv_lp(x, fc) * env(len(t), .02, .1, .8, .08)
def bassn(f, d): t = T(d); return (np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t)) * env(len(t), .005, .15, .6, .05)
def kick(d=.35): t = T(d); return np.sin(ph(sweep(150, 45, d))) * expd(len(t), 9)
def snare(d=.2): t = T(d); return (0.6 * bp(noise(d), 1500, 9000) + 0.4 * np.sin(2 * np.pi * 190 * t)) * expd(len(t), 22)
def hat(d=.06): return hp(noise(d), 7000) * expd(int(d * SR), 60) * .4
def clap(d=.18):
    x = np.zeros(int(d * SR))
    for o in (0, .011, .023): n = bp(noise(.08), 900, 5000) * expd(int(.08 * SR), 45); s = int(o * SR); x[s:s + len(n)] += n[:len(x) - s]
    return x
def shaker(d=.09): return hp(noise(d), 5000) * env(int(d * SR), .02, .05) * .5
def norm(x, peak=0.89): m = np.max(np.abs(x)) + 1e-12; return x / m * peak
def addp(*xs):
    n = max(len(x) for x in xs); return sum(np.pad(x, (0, n - len(x))) for x in xs)
def fade(x, a=.004, b=.01):
    A, B = int(a * SR), int(b * SR); x = x.copy()
    if A: x[..., :A] *= np.linspace(0, 1, A)
    if B: x[..., -B:] *= np.linspace(1, 0, B)
    return x
def save(id_, name, cat, x, tags=(), kind='sfx', stereo=False):
    import soundfile as sf
    x = fade(np.asarray(x, dtype=np.float64)); x = norm(x)
    sf.write(f'{OUT}/{id_}.wav', x.T if stereo else x, SR, subtype='PCM_24')
    items.append(dict(id=id_, name=name, cat=cat, kind=kind, tags=list(tags)))
def place(dst, x, at):
    s = int(at * SR)
    if s >= len(dst): return
    n = min(len(x), len(dst) - s); dst[s:s + n] += x[:n]
def pan(x, p):  # p -1..1 -> stereo
    return np.stack([x * np.cos((p + 1) * np.pi / 4), x * np.sin((p + 1) * np.pi / 4)])
NOTE = {n: i for i, n in enumerate(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])}; NOTE.update(Db=1, Eb=3, Gb=6, Ab=8, Bb=10)
def hz(n):  # 'C4', 'F#5'
    o = int(n[-1]); return 440 * 2 ** ((NOTE[n[:-1]] + 12 * (o + 1) - 69) / 12)

# ======================= SOUND EFFECTS =======================
def gen_sfx():
    # cartoon: boings
    for i, (f0, f1, d, wob) in enumerate([(220, 520, .55, 18), (160, 400, .7, 14), (300, 760, .45, 22), (120, 300, .9, 10), (400, 900, .35, 26), (90, 240, 1.1, 8)]):
        t = T(d); f = sweep(f0, f1, d) * (1 + 0.12 * np.sin(2 * np.pi * wob * t) * np.exp(-t * 3)); x = np.sin(ph(f)) * expd(len(t), 4.5 / d)
        save(f'boing{i+1}', f'Boing {i+1}', 'cartoon', x, ['boing', 'spring', 'bounce', 'jump'])
    for i, (f, d) in enumerate([(900, .06), (650, .08), (1200, .05), (500, .1), (1600, .04), (750, .07)]):
        t = T(d); x = np.sin(ph(sweep(f * 1.8, f, d))) * expd(len(t), 50 / d / 10) * env(len(t), .001); save(f'pop{i+1}', f'Pop {i+1}', 'cartoon', x, ['pop', 'click', 'bubble'])
    for i in range(4):
        d = .12 + .04 * i; t = T(d); f = sweep(300 + 120 * i, 1400 + 300 * i, d); save(f'bubble{i+1}', f'Bubble pop {i+1}', 'cartoon', np.sin(ph(f)) * expd(len(t), 22) * env(len(t), .002), ['bubble', 'pop', 'water'])
    for i, (a, b, d) in enumerate([(300, 2400, .25), (2400, 300, .25), (200, 3000, .4), (3000, 200, .4)]):
        x = bp(noise(d), 200, 6000) * 0.4 + np.sign(np.sin(ph(sweep(a, b, d)))) * 0.25; x = tv_bp(x, sweep(a, b, d), 3) * env(int(d * SR), .01, .1, .7, .05)
        save(f'zip{i+1}', ['Zip up', 'Zip down', 'Long zip up', 'Long zip down'][i], 'cartoon', x, ['zip', 'fast', 'swoosh'])
    for i, f in enumerate([180, 240, 140]):
        d = .3; t = T(d); x = (np.sin(2 * np.pi * f * t) + .5 * np.sin(2 * np.pi * f * 2.3 * t) + .3 * bp(noise(d), 800, 3000) * expd(len(t), 60)) * expd(len(t), 18)
        save(f'bonk{i+1}', f'Bonk {i+1}', 'cartoon', x, ['bonk', 'hit', 'knock', 'head'])
    for i, (f0, f1) in enumerate([(1800, 2600), (2600, 1700), (1500, 3200)]):
        d = .22; t = T(d); f = sweep(f0, f1, d, 'lin') * (1 + .03 * np.sin(2 * np.pi * 40 * t)); save(f'squeak{i+1}', f'Squeak {i+1}', 'cartoon', np.sin(ph(f)) * env(len(t), .01, .05, .7, .05), ['squeak', 'mouse', 'toy'])
    for i in range(2):
        d = 1.2; t = T(d); f = 260 * (1 + .25 * np.sin(2 * np.pi * (9 - 3 * i) * t) * np.exp(-t * 2)); save(f'springwobble{i+1}', f'Spring wobble {i+1}', 'cartoon', np.sin(ph(f)) * expd(len(t), 3), ['spring', 'wobble', 'boing'])
    for i, sp in enumerate([14, 20]):
        d = 1.4; x = np.zeros(int(d * SR))
        for k in range(int(d * sp)): f = 500 + 300 * (k % 2); n = int(.035 * SR); place(x, np.sin(2 * np.pi * f * np.arange(n) / SR) * expd(n, 90), k / sp)
        save(f'cartoonrun{i+1}', ['Cartoon run', 'Cartoon run (fast)'][i], 'cartoon', x, ['run', 'feet', 'escape'])
    for i in range(2):
        notes = ['C5', 'E5', 'G5', 'E5', 'C5', 'E5', 'G5', 'C6'] if i == 0 else ['G4', 'B4', 'D5', 'B4', 'G4', 'B4', 'D5', 'G5']; x = np.zeros(int(1.8 * SR))
        for k, n in enumerate(notes): place(x, pluck_fast(hz(n), .3, .7, .99), k * .2)
        save(f'tiptoe{i+1}', f'Tiptoe {i+1}', 'cartoon', x, ['sneak', 'tiptoe', 'quiet', 'pizzicato'])
    for i, (a, b, d) in enumerate([(2000, 300, 1.2), (1600, 400, .8)]):
        t = T(d); f = sweep(a, b, d, 'lin') * (1 + .01 * np.sin(2 * np.pi * 6 * t)); x = np.sin(ph(f)) * env(len(t), .05, .1, .8, .05)
        x = np.concatenate([x, np.zeros(int(.05 * SR))]); bo = T(.35); x = np.concatenate([x, (np.sin(2 * np.pi * 110 * bo) + .4 * bp(noise(.35), 100, 1500)) * expd(len(bo), 14)])
        save(f'fall{i+1}', f'Falling + bonk {i+1}', 'cartoon', x, ['fall', 'drop', 'slide whistle', 'crash'])
    for i, (a, b, d) in enumerate([(400, 2000, .9), (300, 1600, .6), (2000, 400, .9), (1500, 300, .6)]):
        t = T(d); f = sweep(a, b, d, 'lin') * (1 + .012 * np.sin(2 * np.pi * 6 * t)); x = np.sin(ph(f)) + 0.05 * lp(noise(d), 4000)
        save(f'slidewhistle{i+1}', ['Slide whistle up', 'Slide whistle up (short)', 'Slide whistle down', 'Slide whistle down (short)'][i], 'cartoon', x * env(len(t), .03, .1, .9, .05), ['slide whistle', 'whistle', 'up' if a < b else 'down'])
    # funny
    for i, (f, d) in enumerate([(330, .35), (260, .5), (420, .25)]):
        t = T(d); x = np.sign(np.sin(2 * np.pi * f * t)) * .5 + (2 * ((f * 1.5 * t) % 1) - 1) * .3; x = bp(x, 400, 2500) * env(len(t), .01, .05, .9, .05)
        save(f'honk{i+1}', f'Honk {i+1}', 'funny', x, ['horn', 'honk', 'clown', 'bike'])
    d = .45; t = T(d); x = np.concatenate([bp(np.sign(np.sin(2 * np.pi * 380 * T(.18))), 400, 2500), np.zeros(int(.05 * SR)), bp(np.sign(np.sin(2 * np.pi * 300 * T(.22))), 300, 2500)]); save('clownhorn', 'Clown horn (double)', 'funny', x, ['clown', 'horn', 'honk'])
    for i, base in enumerate([294, 262]):
        x = np.zeros(int(2.6 * SR)); notes = [base, base * 2 ** (-1 / 12), base * 2 ** (-2 / 12), base * 2 ** (-3 / 12)]
        for k, f in enumerate(notes):
            d = .45 if k < 3 else 1.3; tt = T(d); fr = f * (1 + (0.025 * np.sin(2 * np.pi * 6 * tt) * (tt > .3) if k == 3 else 0)); w = brass(1, d) * 0 + tv_lp(2 * ((np.cumsum(fr) / SR) % 1) - 1, 500 + 1500 * env(len(tt), .05, .1, .6, .1)) * env(len(tt), .03, .1, .8, .1)
            place(x, w, k * .5)
        save(f'sadtrombone{i+1}', f'Sad trombone {i+1} (wah wah)', 'funny', x, ['fail', 'sad', 'trombone', 'wah wah', 'oops'])
    for i, k in enumerate([9, 13]):
        d = .7; t = T(d); x = (np.sign(np.sin(2 * np.pi * (80 + 30 * i) * t * (1 + .3 * np.sin(2 * np.pi * k * t)))) * .4 + .6 * bp(noise(d), 150, 900)) * env(len(t), .02, .1, .8, .1)
        save(f'raspberry{i+1}', f'Raspberry {i+1}', 'funny', lp(x, 1800), ['raspberry', 'silly', 'blow'])
    for i, (f0, f1) in enumerate([(900, 1500), (1500, 800)]):
        d = .3; t = T(d); save(f'rubber{i+1}', f'Rubber toy squeak {i+1}', 'funny', bp(np.sign(np.sin(ph(sweep(f0, f1, d)))), 500, 4000) * env(len(t), .01, .05, .8, .05), ['squeak', 'toy', 'rubber duck'])
    for i in range(2):
        x = np.zeros(int(1.6 * SR)); place(x, snare(.15) * .8, 0); place(x, kick(.3) * .9, .18 + .02 * i); c = hp(noise(1.2), 4000) * expd(int(1.2 * SR), 3.5) * .5; place(x, c, .5); place(x, snare(.2) * .6, .5)
        save(f'rimshot{i+1}', f'Ba-dum-tss {i+1}', 'funny', x, ['joke', 'drum', 'rimshot', 'punchline'])
    for i, f in enumerate([600, 750]):
        d = .25; t = T(d); x = bp(np.sign(np.sin(2 * np.pi * f * t * (1 - .2 * t))), 400, 3000) * env(len(t), .01, .05, .7, .05); save(f'quack{i+1}', f'Toy quack {i+1}', 'funny', x, ['duck', 'quack', 'toy'])
    for i in range(2):
        x = np.concatenate([np.sin(ph(sweep(200, 700, .3))) * expd(int(.3 * SR), 6), np.sin(ph(sweep(250, 800, .3))) * expd(int(.3 * SR), 6)]) if i == 0 else np.sin(ph(sweep(700, 150, .6) * (1 + .15 * np.sin(2 * np.pi * 12 * T(.6))))) * expd(int(.6 * SR), 4)
        save(f'silly{i+1}', ['Boing boing', 'Wobbly fall'][i], 'funny', x, ['silly', 'boing', 'funny'])
    # magic
    for i in range(6):
        d = 1.2 + .2 * i; x = np.zeros(int(d * SR) + SR)
        for k in range(10 + 3 * i): f = R.uniform(2200, 6000); place(x, bell(f, .35, 2.0 + R.random(), 1.0, 12) * R.uniform(.3, 1), R.uniform(0, d * .8))
        save(f'sparkle{i+1}', f'Sparkle {i+1}', 'magic', reverb(x, 1.0, .3), ['sparkle', 'magic', 'glitter', 'twinkle', 'shine'])
    scales = [['C6', 'E6', 'G6', 'C7'], ['G5', 'B5', 'D6', 'G6', 'B6'], ['C7', 'G6', 'E6', 'C6'], ['A5', 'C#6', 'E6', 'A6', 'C#7', 'E7']]
    for i, sc in enumerate(scales):
        x = np.zeros(int(2.2 * SR))
        for k, n in enumerate(sc): place(x, glock(hz(n), 1.2), k * .09)
        save(f'twinkle{i+1}', ['Twinkle up', 'Twinkle up (long)', 'Twinkle down', 'Twinkle shimmer'][i], 'magic', reverb(x, 1.4, .35), ['twinkle', 'magic', 'chime', 'star'])
    for i in range(4):
        d = 1.5 + .5 * i; t = T(d); x = sum(np.sin(ph(sweep(300 * (k + 1), 1200 * (k + 1), d))) / (k + 1) for k in range(4)) * np.linspace(0, 1, len(t)) ** 2
        x += 0.3 * hp(noise(d), 3000) * np.linspace(0, 1, len(t)) ** 3
        for k in range(int(d * 8)): place(x, bell(R.uniform(2500, 6000), .25, 2.5, .8, 14) * (k / (d * 8)), k / 8)
        save(f'magicrise{i+1}', f'Magic rise {i+1}', 'magic', reverb(x, 1.2, .3), ['magic', 'rise', 'shimmer', 'reveal', 'transform'])
    for i, root in enumerate(['E6', 'A5', 'D6']):
        x = np.zeros(int(2.5 * SR)); f = hz(root)
        for k, m in enumerate([1, 1.26, 1.5, 2, 2.52]): place(x, bell(f * m, 1.5, 3.01, 1.5, 3) * .6, k * .06)
        save(f'fairychime{i+1}', f'Fairy chime {i+1}', 'magic', reverb(x, 1.6, .35), ['fairy', 'chime', 'magic', 'bell'])
    for i in range(3):
        d = .5; t = T(d); x = np.sin(ph(sweep(2500, 400 + 200 * i, d))) * expd(len(t), 7) + .3 * hp(noise(d), 4000) * expd(len(t), 10)
        for k in range(6): place(x, bell(R.uniform(3000, 7000), .2, 2.3, 1, 18) * .5, .05 + k * .05)
        save(f'wand{i+1}', f'Magic wand {i+1}', 'magic', reverb(x, .8, .25), ['wand', 'magic', 'zap', 'spell'])
    for i in range(3):
        d = 3.0; x = np.zeros(int(d * SR))
        for k in range(90): f = R.uniform(3000, 9000); n = int(.05 * SR); place(x, np.sin(2 * np.pi * f * np.arange(n) / SR) * expd(n, 70) * R.uniform(.1, .5), R.uniform(0, d - .1))
        x *= np.sin(np.linspace(0, np.pi, len(x))); save(f'glitter{i+1}', f'Glitter shimmer {i+1}', 'magic', reverb(x, 1.0, .4), ['glitter', 'shimmer', 'sparkle', 'magic'])
    for i, ch in enumerate([['C5', 'E5', 'G5', 'C6'], ['F5', 'A5', 'C6', 'F6']]):
        x = np.zeros(int(3 * SR)); place(x, magicrise(1.0) if False else np.zeros(1), 0)
        for k, n in enumerate(ch): place(x, glock(hz(n), 2.0) * .6, k * .07); place(x, brass(hz(n) / 2, 1.6) * .25, .3)
        save(f'tada{i+1}', f'Ta-da! {i+1}', 'magic', reverb(x, 1.4, .3), ['tada', 'reveal', 'magic', 'surprise'])
    # whoosh
    for i, (d, lo, hi) in enumerate([(.35, 300, 3000), (.5, 200, 2500), (.7, 150, 2000), (.9, 120, 1800), (1.2, 100, 1500), (.4, 600, 6000), (.6, 400, 5000), (.8, 250, 4000), (1.5, 80, 1200)]):
        t = T(d); fc = lo * (hi / lo) ** np.sin(np.linspace(0, np.pi, len(t))); x = tv_bp(noise(d), fc, 1.5) * np.sin(np.linspace(0, np.pi, len(t))) ** 1.5
        st = np.stack([x * np.linspace(1, .3, len(x)), x * np.linspace(.3, 1, len(x))])
        save(f'whoosh{i+1}', f'Whoosh {i+1} ({d:.1f}s)', 'whoosh', st, ['whoosh', 'swoosh', 'transition', 'fast', 'swing'], stereo=True)
    for i in range(4):
        d = .18 + .05 * i; t = T(d); x = tv_bp(noise(d), sweep(800, 6000, d), 2) * np.sin(np.linspace(0, np.pi, len(t))); save(f'swipe{i+1}', f'Swipe {i+1}', 'whoosh', x, ['swipe', 'transition', 'slide'])
    for i, d in enumerate([2, 3, 4, 6]):
        t = T(d); x = tv_bp(noise(d), sweep(200, 6000, d), 3) * np.linspace(0, 1, len(t)) ** 2 + 0.3 * np.sin(ph(sweep(100, 800, d))) * np.linspace(0, 1, len(t)) ** 2
        save(f'riser{i+1}', f'Riser {d}s', 'whoosh', x, ['riser', 'build up', 'transition', 'tension'])
    for i, d in enumerate([1, 1.5, 2, 3]):
        t = T(d); x = tv_bp(noise(d), sweep(5000, 120, d), 2.5) * np.linspace(1, 0, len(t)) ** 1.5 + .4 * np.sin(ph(sweep(600, 50, d))) * np.linspace(1, 0, len(t))
        save(f'downer{i+1}', f'Down sweep {d}s', 'whoosh', x, ['drop', 'down', 'transition', 'fall'])
    for i in range(4):
        d = 2.2; x = np.zeros(int(d * SR)); w = tv_bp(noise(.6), sweep(300, 3000, .6), 1.5) * np.linspace(0, 1, int(.6 * SR)) ** 2; place(x, w, 0)
        b = (np.sin(ph(sweep(90 - 10 * i, 35, 1.6))) + .5 * lp(noise(1.6), 300)) * expd(int(1.6 * SR), 3); place(x, b, .6)
        save(f'whooshhit{i+1}', f'Whoosh + boom {i+1}', 'whoosh', reverb(x, 1.5, .2), ['impact', 'boom', 'hit', 'transition', 'trailer'])
    # game
    def blips(seq, step, w='sq', dur=.09):
        x = np.zeros(int((len(seq) * step + .4) * SR))
        for k, f in enumerate(seq):
            tt = T(dur); s = np.sign(np.sin(2 * np.pi * f * tt)) * .5 if w == 'sq' else np.sin(2 * np.pi * f * tt); place(x, s * env(len(tt), .002, .03, .6, .02), k * step)
        return x
    save('coin', 'Coin', 'game', blips([988, 1319], .08), ['coin', 'collect', 'money', 'point'])
    save('coin2', 'Coin (bright)', 'game', blips([1319, 1760], .06, 'sine'), ['coin', 'collect', 'point'])
    save('powerup', 'Power up', 'game', blips([523, 659, 784, 1047, 1319, 1568], .05), ['power up', 'level', 'bonus'])
    save('levelup', 'Level up', 'game', blips([523, 659, 784, 1047, 784, 1047], .1, 'sine', .15), ['level up', 'win', 'success'])
    save('jump', 'Jump', 'game', np.sign(np.sin(ph(sweep(300, 900, .18)))) * .5 * env(int(.18 * SR), .002, .1, .3, .05), ['jump', 'hop'])
    save('oneup', 'Extra life', 'game', blips([1319, 1568, 2637, 2093, 2349, 3136], .07), ['1up', 'life', 'bonus'])
    save('error', 'Error buzz', 'game', np.sign(np.sin(2 * np.pi * 110 * T(.4))) * .5 * env(int(.4 * SR), .005, .05, .8, .05), ['error', 'wrong', 'buzz', 'no'])
    save('success', 'Success chime', 'game', reverb(addp(*[np.pad(bell(hz(n), 1.2, 2, 1, 4), (int(k * .1 * SR), 0)) for k, n in enumerate(['C6', 'E6', 'G6'])]), 1, .2), ['success', 'correct', 'right', 'yes'])
    save('select', 'Select blip', 'game', blips([880], .1, 'sine', .06), ['select', 'click', 'ui'])
    save('countdown', 'Countdown 3-2-1-Go', 'game', blips([660, 0, 660, 0, 660, 0, 1320], .33, 'sine', .2), ['countdown', 'start', 'race', 'go'])
    save('ticktimer', 'Timer ticking', 'game', blips([2000, 1500] * 5, .5, 'sine', .03), ['timer', 'tick', 'clock', 'wait'])
    # instruments
    scale = ['C5', 'D5', 'E5', 'F5', 'G5', 'A5', 'B5', 'C6']
    for i, n in enumerate(scale): save(f'xylo_{n}', f'Xylophone {n[:-1]}', 'instruments', marimba(hz(n), 1.0), ['xylophone', 'note', 'marimba'])
    for i, (seq, nm) in enumerate([(scale, 'up'), (scale[::-1], 'down'), (scale + scale[::-1][1:], 'up and down')]):
        x = np.zeros(int((len(seq) * .07 + 1) * SR))
        for k, n in enumerate(seq): place(x, marimba(hz(n), .8), k * .07)
        save(f'xylogliss{i+1}', f'Xylophone run {nm}', 'instruments', x, ['xylophone', 'glissando', 'run', 'transition'])
    for i, seq in enumerate([['C5', 'E5', 'G5', 'C6', 'G5', 'E5', 'C5'], ['A5', 'C6', 'E6', 'A6'], ['G5', 'D6', 'B5', 'G6']]):
        x = np.zeros(int((len(seq) * .18 + 1.5) * SR))
        for k, n in enumerate(seq): place(x, mbox(hz(n), 1.5) * .7, k * .18)
        save(f'musicbox{i+1}', f'Music box {i+1}', 'instruments', reverb(x, 1.2, .25), ['music box', 'lullaby', 'bell'])
    harp_sc = [hz(n) for n in ['C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6', 'G6']]
    for i, (seq, nm) in enumerate([(harp_sc, 'up'), (harp_sc[::-1], 'down'), (harp_sc + harp_sc[::-1], 'up and down')]):
        x = np.zeros(int((len(seq) * .045 + 2) * SR))
        for k, f in enumerate(seq): place(x, pluck_fast(f, 1.8, .4, .998) * .5, k * .045)
        save(f'harp{i+1}', f'Harp glissando {nm}', 'instruments', reverb(x, 1.8, .3), ['harp', 'glissando', 'dream', 'heaven', 'transition'])
    chords = {'C': ['C4', 'E4', 'G4', 'C5'], 'F': ['F4', 'A4', 'C5', 'F5'], 'G': ['G4', 'B4', 'D5', 'G5'], 'Am': ['A4', 'C5', 'E5', 'A5']}
    for nm, ch in chords.items():
        x = np.zeros(int(2.2 * SR))
        for k, n in enumerate(ch): place(x, pluck_fast(hz(n), 2.0, .55, .997) * .5, k * .025)
        save(f'uke_{nm}', f'Ukulele {nm} chord', 'instruments', x, ['ukulele', 'guitar', 'chord', 'strum'])
    for i in range(2):
        d = 2.2 + i; x = np.zeros(int((d + 2) * SR)); rate = 28
        for k in range(int(d * rate)): place(x, snare(.08) * (.3 + .7 * k / (d * rate)), k / rate)
        place(x, addp(hp(noise(2), 3000) * expd(int(2 * SR), 2.2) * .9, kick(.4)), d)
        save(f'drumroll{i+1}', f'Drum roll + cymbal {i+1}', 'instruments', x, ['drum roll', 'cymbal', 'reveal', 'announcement'])
    for i, ch in enumerate([['C4', 'E4', 'G4', 'C5'], ['D4', 'F#4', 'A4', 'D5']]):
        x = np.zeros(int(3 * SR)); seq = [(ch[0], 0, .15), (ch[0], .18, .15), (ch[0], .36, .15), (None, .54, 1.8)]
        for n, at, d in seq:
            if n: place(x, brass(hz(n), d) * .6, at)
            else:
                for m in ch: place(x, brass(hz(m), d) * .4, at)
        save(f'fanfare{i+1}', f'Fanfare {i+1}', 'instruments', reverb(x, 1.6, .25), ['fanfare', 'trumpet', 'victory', 'announce', 'king'])
    for i, f in enumerate([880, 1320, 660]): save(f'ding{i+1}', f'Bell ding {i+1}', 'instruments', bell(f, 2.5, 2.0, 1.2, 1.6), ['bell', 'ding', 'notification'])
    x = np.zeros(int(4 * SR))
    for k in range(18): place(x, bell(R.uniform(1200, 3500), 2.5, 2.76, .5, 1.8) * .4, k * .11 + R.uniform(0, .05))
    save('chimetree', 'Chime tree', 'instruments', reverb(x, 1.5, .3), ['chimes', 'wind chimes', 'dream'])
    # nature / weather (synthesised)
    d = 20; x = lp(noise(d), 9000) * .25 + hp(noise(d), 2500) * .2
    for k in range(1600): place(x, bp(noise(.02), 2000, 8000) * expd(int(.02 * SR), 200) * R.uniform(.05, .5), R.uniform(0, d))
    save('rain_synth_light', 'Light rain (synth)', 'weather', x, ['rain', 'drizzle', 'calm'])
    x = lp(noise(d), 6000) * .6
    for k in range(4000): place(x, bp(noise(.015), 1500, 9000) * expd(int(.015 * SR), 250) * R.uniform(.1, .8), R.uniform(0, d))
    save('rain_synth_heavy', 'Heavy rain (synth)', 'weather', x, ['rain', 'downpour', 'storm', 'flood'])
    for i, (lo, amt, nm) in enumerate([(300, .5, 'Gentle wind'), (200, 1.0, 'Strong wind'), (150, 1.3, 'Desert wind')]):
        t = T(d); fc = lo * (2.5 + amt * 1.6 * np.sin(2 * np.pi * .13 * t) + amt * np.sin(2 * np.pi * .37 * t + 1)); x = tv_bp(noise(d), fc, 2.5) * (0.6 + 0.4 * np.sin(2 * np.pi * .21 * t) ** 2)
        save(f'wind_synth{i+1}', f'{nm} (synth)', 'weather' if i < 2 else 'bible', x, ['wind', 'air', 'storm' if i else 'breeze', 'desert' if i == 2 else 'outside'])
    t = T(d); x = lp(noise(d), 1200) * (0.15 + 0.85 * (0.5 + 0.5 * np.sin(2 * np.pi * t / 6.5 - 1.5)) ** 3) + hp(noise(d), 3000) * .15 * (0.5 + 0.5 * np.sin(2 * np.pi * t / 6.5 - 1.2)) ** 4
    save('waves_synth', 'Ocean waves (synth)', 'nature', np.stack([x, np.roll(x, 2400)]), ['sea', 'ocean', 'waves', 'beach', 'galilee'], stereo=True)
    x = bp(noise(d), 400, 4000) * .2
    for k in range(2500): f = R.uniform(400, 1800); n = int(.03 * SR); place(x, np.sin(ph(np.linspace(f, f * 1.6, n))) * expd(n, 120) * R.uniform(.05, .3), R.uniform(0, d))
    save('stream_synth', 'Babbling brook (synth)', 'nature', x, ['stream', 'brook', 'water', 'river'])
    x = lp(noise(d), 300) * .4
    for k in range(900): place(x, hp(noise(.01), 1000) * expd(int(.01 * SR), 400) * R.uniform(.1, 1), R.uniform(0, d))
    for k in range(60): place(x, bp(noise(.08), 500, 3000) * expd(int(.08 * SR), 40) * R.uniform(.3, 1), R.uniform(0, d))
    save('fire_synth', 'Campfire crackle (synth)', 'nature', x, ['fire', 'campfire', 'crackle', 'night', 'cozy'])
    for i in range(3):
        dd = 6 + i * 2; x = np.zeros(int(dd * SR)); c = (lp(noise(.25), 3000) + noise(.25) * .3) * expd(int(.25 * SR), 10) * 1.0; place(x, c, .1)
        r = lp(noise(dd), 160 + 40 * i, 4) * np.exp(-np.linspace(0, 4 + i, int(dd * SR))) * (1 + .5 * np.sin(np.linspace(0, 25, int(dd * SR)))) * 6; x += r
        save(f'thunder_synth{i+1}', f'Thunder {i+1} (synth)', 'weather', x, ['thunder', 'storm', 'lightning'])
    x = np.zeros(int(d * SR))
    for c in range(5):
        f = R.uniform(4200, 5200); rate = R.uniform(2.5, 4); t0 = R.uniform(0, 1)
        for k in range(int(d * rate)):
            for j in range(3): n = int(.012 * SR); place(x, np.sin(2 * np.pi * f * np.arange(n) / SR) * np.sin(np.linspace(0, np.pi, n)) * .3, t0 + k / rate + j * .02)
    save('crickets_synth', 'Night crickets (synth)', 'nature', x, ['crickets', 'night', 'insects', 'summer'])
    x = np.zeros(int(8 * SR))
    for k in range(10): place(x, lp(kick(.18), 200) * .9, k * .8); place(x, lp(kick(.15), 200) * .6, k * .8 + .22)
    save('heartbeat', 'Heartbeat', 'household', x, ['heart', 'beat', 'tension', 'love'])
    # applause (synthesised from hundreds of claps)
    for i, (n, d, nm) in enumerate([(8, 5, 'Small applause'), (30, 6, 'Applause'), (80, 7, 'Big applause')]):
        x = np.zeros(int(d * SR))
        for p in range(n):
            rate = R.uniform(3.5, 6); t0 = R.uniform(0, .4); fq = R.uniform(800, 2500); amp = R.uniform(.3, 1)
            for k in range(int((d - t0) * rate)):
                at = t0 + k / rate + R.uniform(-.01, .01); env_ = min(1, at / .3) * min(1, (d - at) / 1.5)
                c = bp(noise(.03), fq * .6, fq * 2.5) * expd(int(.03 * SR), 120) * amp * env_; place(x, c, at)
        save(f'applause_synth{i+1}', f'{nm} (synth)', 'cheers', reverb(x, .8, .2), ['applause', 'clap', 'well done', 'bravo'])

def magicrise(d): return np.zeros(1)

# ======================= MUSIC =======================
def render(song):
    bpm, bars, sec = song['bpm'], song['bars'], 60 / song['bpm']; beats = song.get('beats', 4); L = bars * beats * sec + 3
    L_, R_ = np.zeros(int(L * SR)), np.zeros(int(L * SR))
    def put(x, at, p=0, g=1.0):
        st = pan(x * g, p); place(L_, st[0], at); place(R_, st[1], at)
    for part in song['parts']: part(put, sec)
    mix = np.stack([L_, R_]); wet = song.get('verb', .22)
    if wet: mix = np.stack([reverb(mix[0], 1.6, wet)[:mix.shape[1]], reverb(mix[1], 1.7, wet)[:mix.shape[1]]])
    end = int((bars * beats * sec + 2.0) * SR); mix = mix[:, :end]; mix[:, -int(1.5 * SR):] *= np.linspace(1, 0, int(1.5 * SR)) ** 2
    return mix
def melody(notes, inst, g=1.0, p=0.0, start=0.0, legato=1.0):
    """notes: list of (note or None, beats)."""
    def part(put, sec):
        t = start
        for n, b in notes:
            if n: put(inst(hz(n), max(.12, b * sec * legato + .15)), t * sec, p, g)
            t += b
    return part
def chords_part(prog, inst, beats_per, g=.5, p=0.0, style='block', start=0, repeat=1, octave=0):
    CH = {'C': [0, 4, 7], 'G': [7, 11, 14], 'Am': [9, 12, 16], 'F': [5, 9, 12], 'Dm': [2, 5, 9], 'Em': [4, 7, 11], 'D': [2, 6, 9], 'Bm': [11, 14, 18], 'A': [9, 13, 16], 'Bb': [10, 14, 17], 'E': [4, 8, 11], 'G7': [7, 11, 14, 17], 'C7': [0, 4, 7, 10]}
    def part(put, sec):
        t = start
        for _ in range(repeat):
            for c in prog:
                fs = [261.63 * 2 ** ((s + 12 * octave) / 12) for s in CH[c]]
                if style == 'block':
                    for f in fs: put(inst(f, beats_per * sec + .3), t * sec, p, g / len(fs))
                elif style == 'arp':
                    seq = fs + [fs[0] * 2] + fs[1:][::-1]; step = beats_per / len(seq)
                    for k, f in enumerate(seq): put(inst(f, step * sec * 2.5), (t + k * step) * sec, p + .3 * np.sin(k), g / 2)
                elif style == 'strum':
                    for b in range(int(beats_per)):
                        acc = 1.0 if b % 2 == 0 else .7
                        for k, f in enumerate(fs + [fs[0] * 2]): put(inst(f, sec * 1.2), (t + b) * sec + k * .012, p, g * acc / 3)
                elif style == 'bass':
                    for b in range(int(beats_per)):
                        f = fs[0] / 2 if b % 2 == 0 else fs[2] / 2
                        put(inst(f / (2 if f > 200 else 1), sec * .9), (t + b) * sec, 0, g)
                t += beats_per
    return part
def drums_part(bars, pattern, beats=4, g=.6, start=0):
    g = g * 0.55   # keep percussion soft under the tune
    def part(put, sec):
        for bar in range(bars):
            for k, ch in enumerate(pattern):
                at = (start + bar * beats + k * beats / len(pattern)) * sec
                if 'k' in ch: put(kick(), at, 0, g)
                if 's' in ch: put(snare(), at, 0, g * .6)
                if 'h' in ch: put(hat(), at, .3, g * .5)
                if 'c' in ch: put(clap(), at, -.1, g * .5)
                if 'z' in ch: put(shaker(), at, .4, g * .5)
    return part
def song_twinkle():
    m = [('C5', 1), ('C5', 1), ('G5', 1), ('G5', 1), ('A5', 1), ('A5', 1), ('G5', 2), ('F5', 1), ('F5', 1), ('E5', 1), ('E5', 1), ('D5', 1), ('D5', 1), ('C5', 2),
         ('G5', 1), ('G5', 1), ('F5', 1), ('F5', 1), ('E5', 1), ('E5', 1), ('D5', 2), ('G5', 1), ('G5', 1), ('F5', 1), ('F5', 1), ('E5', 1), ('E5', 1), ('D5', 2)]
    m = m + m[:14]; prog = ['C', 'C', 'F', 'C', 'F', 'C', 'G', 'C', 'C', 'F', 'C', 'G', 'C', 'F', 'C', 'G', 'C', 'C', 'F', 'C', 'G', 'C']
    return dict(bpm=84, bars=22, parts=[melody(m, mbox, .9), melody(m, mbox, .35, .4, start=44), chords_part(prog[:11], pad, 4, .25, repeat=2), chords_part(prog[:11], marimba, 4, .3, -.3, 'arp', repeat=2)], verb=.3)
def song_ode():
    a = [('E5', 1), ('E5', 1), ('F5', 1), ('G5', 1), ('G5', 1), ('F5', 1), ('E5', 1), ('D5', 1), ('C5', 1), ('C5', 1), ('D5', 1), ('E5', 1)]
    m = a + [('E5', 1.5), ('D5', .5), ('D5', 2)] + a + [('D5', 1.5), ('C5', .5), ('C5', 2)] + \
        [('D5', 1), ('D5', 1), ('E5', 1), ('C5', 1), ('D5', 1), ('E5', .5), ('F5', .5), ('E5', 1), ('C5', 1), ('D5', 1), ('E5', .5), ('F5', .5), ('E5', 1), ('D5', 1), ('C5', 1), ('D5', 1), ('G4', 2)] + a + [('D5', 1.5), ('C5', .5), ('C5', 2)]
    prog = ['C', 'G', 'C', 'G', 'C', 'G', 'C', 'G', 'G', 'C', 'G', 'C', 'C', 'G', 'C', 'G']
    return dict(bpm=100, bars=32, parts=[melody(m, glock, .55), melody(m, flute, .5, .2, start=64), chords_part(prog, piano, 4, .5, -.2, 'arp', repeat=2), chords_part(prog, bassn, 4, .35, style='bass', repeat=2), drums_part(16, ['k', 'z', 'kc', 'z'], start=64, g=.45)], verb=.25)
def song_amazing():
    m = [('D4', 1), ('G4', 2), ('B4', .5), ('G4', .5), ('B4', 2), ('A4', 1), ('G4', 2), ('E4', 1), ('D4', 2), ('D4', 1), ('G4', 2), ('B4', .5), ('G4', .5), ('B4', 2), ('A4', 1), ('D5', 5),
         ('B4', 1), ('D5', 1.5), ('B4', .5), ('D5', .5), ('B4', .5), ('G4', 2), ('D4', 1), ('E4', 1.5), ('G4', .5), ('G4', .5), ('E4', .5), ('D4', 2), ('D4', 1), ('G4', 2), ('B4', .5), ('G4', .5), ('B4', 2), ('A4', 1), ('G4', 5)]
    prog = ['G', 'G', 'C', 'G', 'G', 'Em', 'D', 'D', 'G', 'G', 'C', 'G', 'Em', 'D', 'G', 'G']
    return dict(bpm=76, beats=3, bars=32, parts=[melody(m, piano, .8, 0, start=0), melody(m, flute, .5, .25, start=48), chords_part(prog, pad, 3, .3, repeat=2, octave=-1), chords_part(prog, pluck_fast, 3, .35, -.3, 'arp', repeat=2)], verb=.35)
def song_joy():
    m = [('C6', 1), ('B5', .75), ('A5', .25), ('G5', 1.5), ('F5', .5), ('E5', 1), ('D5', 1), ('C5', 1.5), ('G5', .5), ('A5', 1.5), ('A5', .5), ('B5', 1.5), ('B5', .5), ('C6', 3), ('C6', .5),
         ('C6', .5), ('B5', .5), ('A5', .5), ('G5', .5), ('G5', .75), ('F5', .25), ('E5', .5), ('C6', .5), ('C6', .5), ('B5', .5), ('A5', .5), ('G5', .5), ('G5', .75), ('F5', .25), ('E5', .5), ('E5', .5),
         ('E5', .5), ('E5', .5), ('E5', .5), ('E5', .25), ('F5', .25), ('G5', 1.5), ('F5', .25), ('E5', .25), ('D5', .5), ('D5', .5), ('D5', .5), ('D5', .25), ('E5', .25), ('F5', 1.5), ('E5', .25), ('D5', .25),
         ('C5', .5), ('C6', 1), ('A5', .5), ('G5', .75), ('F5', .25), ('E5', .5), ('F5', .5), ('E5', 1), ('D5', 1), ('C5', 2)]
    prog = ['C', 'G', 'C', 'F', 'G', 'C', 'C', 'C', 'C', 'G', 'G', 'C', 'F', 'G', 'C', 'C']
    return dict(bpm=96, bars=16, parts=[melody(m, glock, .5), melody(m, brass, .3, .2), chords_part(prog, brass, 4, .35, -.2, 'block', octave=-1), chords_part(prog, bassn, 4, .35, style='bass'), drums_part(16, ['k', 'h', 'ks', 'h'], g=.4)], verb=.3)
def song_jesusloves():
    v = [('G4', 1), ('E4', .5), ('E4', .5), ('D4', .5), ('E4', .5), ('G4', 1), ('G4', 2), (None, 2), ('A4', 1), ('A4', .5), ('C5', .5), ('A4', .5), ('A4', .5), ('G4', 1), ('G4', 2), (None, 2),
         ('G4', 1), ('E4', .5), ('E4', .5), ('D4', .5), ('E4', .5), ('G4', 1), ('G4', 2), (None, 2), ('A4', 1), ('A4', .5), ('G4', .5), ('C4', 1), ('E4', .5), ('D4', .5), ('C4', 2), (None, 2)]
    c = [('G4', 1), ('E4', 1), ('G4', 1), ('A4', 1), ('C5', 4), ('G4', 1), ('E4', 1), ('C4', 1), ('E4', 1), ('D4', 4), ('G4', 1), ('E4', 1), ('G4', 1), ('A4', 1), ('C5', 3), ('A4', 1), ('G4', 1), ('C4', 1), ('E4', 1), ('D4', 1), ('C4', 4)]
    m = v + c; m = m + m
    pv = ['C', 'C', 'F', 'C', 'C', 'C', 'G', 'C']; pc = ['C', 'F', 'C', 'G', 'C', 'F', 'C', 'G', 'C']
    prog = (pv + pc) * 2
    return dict(bpm=104, bars=34, parts=[melody(m, glock, .55), melody(m, flute, .35, .25, start=68), chords_part(prog, pluck_fast, 4, .4, -.25, 'strum'), chords_part(prog, bassn, 4, .35, style='bass'), drums_part(34, ['k', 'z', 'c', 'z'], g=.35)], verb=.25)
def song_brahms():
    m = [('E5', 1), ('E5', 1), ('G5', 4), ('E5', 1), ('E5', 1), ('G5', 4), ('E5', 1), ('G5', 1), ('C6', 2), ('B5', 2), ('A5', 2), ('A5', 2), ('G5', 2), ('D5', 1), ('E5', 1), ('F5', 2), ('D5', 2), ('D5', 1), ('E5', 1), ('F5', 4),
         ('D5', 1), ('F5', 1), ('B5', 1), ('A5', 1), ('G5', 2), ('B5', 2), ('C6', 4)]
    m = [(n, b / 2 * 1.5) for n, b in m]; m = m + m
    prog = ['C', 'C', 'C', 'G', 'G', 'G', 'G', 'C', 'C', 'F', 'G', 'C']
    return dict(bpm=66, beats=3, bars=24, parts=[melody(m, mbox, .8), chords_part(prog, pad, 3, .25, repeat=2, octave=-1), chords_part(prog, marimba, 3, .2, .3, 'arp', repeat=2)], verb=.4)
def song_row():
    m = [('C5', 1.5), ('C5', 1.5), ('C5', 1), ('D5', .5), ('E5', 1.5), ('E5', 1), ('D5', .5), ('E5', 1), ('F5', .5), ('G5', 3),
         ('C6', .5), ('C6', .5), ('C6', .5), ('G5', .5), ('G5', .5), ('G5', .5), ('E5', .5), ('E5', .5), ('E5', .5), ('C5', .5), ('C5', .5), ('C5', .5), ('G5', 1), ('F5', .5), ('E5', 1), ('D5', .5), ('C5', 3)]
    def round_(put, sec):
        for k, (inst, p, g) in enumerate([(marimba, -.4, .6), (glock, .4, .4), (pluck_fast, 0, .5)]): melody(m * 2, inst, g, p, start=k * 6)(put, sec)
    prog = ['C', 'C', 'G', 'C'] * 6
    return dict(bpm=120, beats=3, bars=24, parts=[round_, chords_part(prog, bassn, 3, .35, style='bass'), drums_part(24, ['k', 'z', 'z'], beats=3, g=.35)], verb=.2)
ORIGINALS = []
def original(name, cat, bpm, prog, motif, lead, back, style, drums, bars=None, verb=.25, tags=()):
    n = len(prog) * 4; reps = (bars or 32) // len(prog)
    m = motif * (reps * len(prog) * 4 // max(1, int(sum(b for _, b in motif))))
    parts = [melody(m, lead, .5, 0, start=0), chords_part(prog, back, 4, .4, -.25, style, repeat=reps), chords_part(prog, bassn, 4, .35, style='bass', repeat=reps)]
    if drums: parts.append(drums_part(reps * len(prog), drums, g=.4))
    return dict(bpm=bpm, bars=reps * len(prog), parts=parts, verb=verb), name, cat, tags
def gen_music():
    songs = [
        ('twinkle', 'Twinkle Twinkle (music box)', 'lullaby', song_twinkle(), ['twinkle', 'star', 'night', 'sleep', 'traditional']),
        ('brahms', 'Lullaby (Brahms, music box)', 'lullaby', song_brahms(), ['lullaby', 'sleep', 'baby', 'calm']),
        ('odetojoy', 'Joyful, Joyful (Ode to Joy)', 'worship', song_ode(), ['hymn', 'joy', 'beethoven', 'praise']),
        ('amazinggrace', 'Amazing Grace (piano)', 'worship', song_amazing(), ['hymn', 'grace', 'calm', 'church']),
        ('joytotheworld', 'Joy to the World', 'worship', song_joy(), ['christmas', 'hymn', 'joy', 'celebration']),
        ('jesuslovesme', 'Jesus Loves Me (ukulele)', 'worship', song_jesusloves(), ['jesus', 'kids', 'hymn', 'sunday school']),
        ('rowyourboat', 'Row Your Boat (round)', 'funny', song_row(), ['boat', 'round', 'nursery', 'traditional']),
    ]
    O = [
        original('Sunny Day', 'happy', 112, ['C', 'G', 'Am', 'F'], [('E5', 1), ('G5', .5), ('E5', .5), ('D5', 1), ('C5', 1), ('D5', .5), ('E5', .5), ('G5', 1), ('A5', 1), ('G5', 1), ('E5', .5), ('D5', .5), ('C5', 1), ('D5', 1), ('E5', 2), (None, 2), ('F5', 1), ('E5', 1), ('D5', 1), ('C5', 1)], glock, pluck_fast, 'strum', ['k', 'z', 'kc', 'z'], tags=['sunny', 'ukulele', 'cheerful', 'vlog']),
        original('Bubble Parade', 'happy', 120, ['F', 'C', 'Dm', 'Bb'], [('A5', .5), ('C6', .5), ('A5', .5), ('F5', .5), ('G5', 1), ('C5', 1), ('A5', .5), ('Bb5', .5), ('A5', .5), ('G5', .5), ('F5', 2), ('D5', .5), ('F5', .5), ('A5', .5), ('D6', .5), ('C6', 1), ('A5', 1), ('Bb5', .5), ('A5', .5), ('G5', .5), ('F5', .5), ('G5', 2)], mbox, marimba, 'arp', ['k', 'h', 'c', 'h'], tags=['bubbles', 'playful', 'music box']),
        original('Hop Skip Jump', 'happy', 128, ['G', 'D', 'Em', 'C'], [('G5', .5), (None, .5), ('B5', .5), (None, .5), ('D6', .5), ('B5', .5), ('G5', 1), ('A5', .5), (None, .5), ('F#5', .5), (None, .5), ('D5', 1), (None, 1), ('E5', .5), ('G5', .5), ('B5', .5), ('E6', .5), ('D6', 1), ('B5', 1), ('C6', .5), ('B5', .5), ('A5', .5), ('G5', .5), ('A5', 2)], marimba, pluck_fast, 'strum', ['k', 'z', 'ks', 'z'], tags=['bouncy', 'kids', 'playground']),
        original('Quiet Meadow', 'calm', 72, ['C', 'Am', 'F', 'G'], [('E5', 2), ('G5', 1), ('E5', 1), ('D5', 3), (None, 1), ('C5', 2), ('E5', 1), ('A5', 1), ('G5', 3), (None, 1)], flute, piano, 'arp', None, verb=.35, tags=['peaceful', 'nature', 'prayer', 'reading']),
        original('Still Waters', 'calm', 66, ['D', 'Bm', 'G', 'A'], [('F#5', 2), ('A5', 2), ('B5', 2), ('A5', 2), ('G5', 2), ('F#5', 1), ('E5', 1), ('F#5', 4)], piano, pluck_fast, 'arp', None, verb=.4, tags=['psalm 23', 'peaceful', 'water', 'prayer']),
        original('Brave Little Hero', 'adventure', 118, ['Am', 'F', 'C', 'G'], [('A4', .75), ('A4', .25), ('C5', .5), ('E5', .5), ('A5', 1), ('G5', 1), ('F5', .75), ('F5', .25), ('A5', .5), ('C6', .5), ('G5', 2), ('E5', .75), ('E5', .25), ('G5', .5), ('C6', .5), ('E6', 1), ('D6', 1), ('B5', 1), ('G5', 1), ('A5', 2)], brass, pad, 'block', ['k', 'h', 'ks', 'kh'], tags=['brave', 'march', 'david', 'hero', 'epic']),
        original('Ark Adventure', 'adventure', 104, ['Dm', 'Bb', 'C', 'A'], [('D5', 1), ('F5', .5), ('A5', .5), ('D6', 1), ('C6', 1), ('Bb5', 1), ('A5', .5), ('G5', .5), ('A5', 2), ('C6', .5), ('Bb5', .5), ('A5', .5), ('G5', .5), ('F5', 1), ('E5', 1), ('C#5', 2), ('E5', 2)], flute, pluck_fast, 'arp', ['k', 'z', 'ks', 'z'], tags=['noah', 'journey', 'animals', 'quest']),
        original('Silly Socks', 'funny', 140, ['C', 'C7', 'F', 'G7'], [('C5', .5), (None, .5), ('E5', .5), ('G5', .5), ('A5', .5), ('G#5', .5), ('G5', 1), ('C5', .5), (None, .5), ('D#5', .5), ('E5', .5), ('G5', 1), (None, 1), ('F5', .5), ('E5', .5), ('D5', .5), ('C5', .5), ('B4', .5), ('D5', .5), ('G5', 1)], marimba, pluck_fast, 'strum', ['k', 'h', 's', 'h'], tags=['silly', 'comedy', 'clown', 'bouncy']),
        original('Hide and Seek', 'funny', 96, ['Am', 'E', 'Am', 'E'], [('A4', .5), (None, .5), ('C5', .5), (None, .5), ('E5', .5), (None, .5), ('D#5', .5), ('E5', .5), ('C5', 1), (None, 1), ('B4', .5), (None, .5), ('G#4', .5), ('B4', .5), ('E5', 1), (None, 1)], pluck_fast, marimba, 'arp', ['k', '', 'h', ''], tags=['sneaky', 'tiptoe', 'mystery', 'quiet']),
        original('Praise Party', 'worship', 124, ['G', 'C', 'D', 'C'], [('B5', .5), ('B5', .5), ('A5', .5), ('G5', .5), ('A5', 1), ('D5', 1), ('B5', .5), ('C6', .5), ('B5', .5), ('A5', .5), ('G5', 2), ('G5', .5), ('A5', .5), ('B5', .5), ('D6', .5), ('E6', 1), ('D6', 1), ('C6', .5), ('B5', .5), ('A5', .5), ('G5', .5), ('A5', 2)], glock, pluck_fast, 'strum', ['k', 'hc', 'k', 'hc'], tags=['praise', 'clap', 'celebrate', 'church']),
    ]
    for k, (song, name, cat, tags) in enumerate(O): songs.append((name.lower().replace(' ', ''), name, cat, song, tags))
    for id_, name, cat, song, tags in songs:
        x = render(song); save('music_' + id_, name, cat, x, tags, kind='music', stereo=True); print('music', name, x.shape[1] / SR, flush=True)
if __name__ == '__main__':
    what = sys.argv[2] if len(sys.argv) > 2 else 'all'
    if what in ('all', 'sfx'): gen_sfx()
    if what in ('all', 'music'): gen_music()
    json.dump(items, open(f'{OUT}/items-{what}.json', 'w'), indent=0)
    print('made', len(items))

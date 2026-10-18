"""Emmavengers Originals, volume 2: a small rule-based composer (no samples, no AI, no machine learning).
Every track is written by the rules below (scale -> chord progression -> phrase rhythm cells -> chord-tone melody,
form intro / A / A' / B / A'' / outro) and played by the plain-maths instruments in synth.py plus a few new ones.
Public-domain melodies (traditional / pre-1900 hymns, carols and nursery tunes) get our own arrangements.
All output is our own work, released as CC0.     python3 tools/sounds/compose.py OUTDIR [N_WORKERS] [ONLY_ID ...]
Writes OUTDIR/<id>.wav + OUTDIR/items-music2.json ([{id, name, cat, kind, tags, bpm, meter, offset}])."""
import sys, os, json, numpy as np
_argv = sys.argv; sys.argv = [_argv[0], '/tmp/compose-scratch']
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import synth as S
sys.argv = _argv
from synth import SR, T, env, expd, ph, sweep, bp, lp, hp, reverb, pluck_fast, bell, mbox, marimba, glock, piano, pad, flute, brass, bassn, kick, snare, hat, clap, shaker, pan, place, norm, fade
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/music2'
RNG = np.random.default_rng(7)
def noise(d): return RNG.standard_normal(int(d * SR))

# ---------------- extra instruments (plain synthesis) ----------------
def organ(f, d):
    t = T(d); v = 1 + .002 * np.sin(2 * np.pi * 6.2 * t)
    x = sum(a * np.sin(ph(f * h * v)) for h, a in ((.5, .5), (1, 1), (2, .6), (3, .35), (4, .25), (6, .12), (8, .08)))
    return x * env(len(t), .03, .05, .9, .08) * .35
def strings(f, d):
    t = T(d); vib = 1 + .004 * np.sin(2 * np.pi * 5.3 * t) * np.clip(t * 2, 0, 1)
    x = sum(2 * ((np.cumsum(f * vib * (1 + dt)) / SR) % 1) - 1 for dt in (-.006, -.002, .003, .007)) / 4
    return lp(x, min(3200, f * 6)) * env(len(t), min(.25, d * .3), .1, .85, .2)
def pizz(f, d): return pluck_fast(f, min(d, .5), .3, .985) * env(int(min(d, .5) * SR), .002, .1)
def harp(f, d): return pluck_fast(f, max(d, 1.2), .6, .997)
def choir(f, d):
    t = T(d); vib = 1 + .005 * np.sin(2 * np.pi * 5 * t + f)
    src = sum(2 * ((np.cumsum(f * vib * (1 + dt)) / SR) % 1) - 1 for dt in (-.004, 0, .005)) / 3
    x = bp(src, 600, 1000) * 1.0 + bp(src, 1100, 1400) * .5 + bp(src, 2400, 2800) * .15
    return x * env(len(t), min(.18, d * .3), .1, .9, .2) * 1.6
def kalimba(f, d):
    t = T(max(d, .9)); x = np.sin(2 * np.pi * f * t) * expd(len(t), 3.2) + .35 * np.sin(2 * np.pi * f * 5.4 * t) * expd(len(t), 18) + .2 * np.sin(2 * np.pi * f * 3.02 * t) * expd(len(t), 9)
    return x * env(len(t), .001)
def balafon(f, d):
    t = T(max(d, .6)); x = marimba(f, max(d, .6)) * 1.0; buzz = bp(noise(max(d, .6)), f * 2, f * 6) * expd(len(t), 14) * .25
    return x + buzz * (1 + np.sin(2 * np.pi * 31 * t))
def whistle(f, d):
    t = T(d); vib = 1 + .012 * np.sin(2 * np.pi * 6 * t) * np.clip(t * 4 - .4, 0, 1)
    return (np.sin(ph(f * vib)) + .04 * bp(noise(d), f, f * 3)) * env(len(t), .02, .05, .8, .05)
def bassoon(f, d):
    t = T(d); x = np.sign(np.sin(ph(f * (1 + .006 * np.sin(2 * np.pi * 5 * t))))) * .6 + (2 * ((f * t) % 1) - 1) * .4
    return lp(x, min(2400, f * 5)) * env(len(t), .02, .05, .85, .05)
def tuba(f, d): t = T(d); x = lp(2 * ((f * t) % 1) - 1, f * 3) + .6 * np.sin(2 * np.pi * f * t); return x * env(len(t), .02, .1, .7, .05) * .8
def synbass(f, d): t = T(d); x = lp(2 * ((f * t) % 1) - 1, 380) + .5 * np.sin(2 * np.pi * f * t); return x * env(len(t), .004, .15, .6, .04)
def celesta(f, d): return glock(f, max(d, 1.0)) * .8 + .2 * mbox(f, max(d, 1.0))
def epiano(f, d):
    t = T(max(d, .8)); e = expd(len(t), 2.2); return np.sin(2 * np.pi * f * t + 1.2 * e * np.sin(2 * np.pi * f * t)) * e * env(len(t), .003) * .8
def steel(f, d): t = T(max(d, .7)); return (np.sin(2 * np.pi * f * t) + .5 * np.sin(2 * np.pi * f * 2 * t) * expd(len(t), 5) + .3 * np.sin(2 * np.pi * f * 3.9 * t) * expd(len(t), 9)) * expd(len(t), 3.5) * env(len(t), .002)
def accordion(f, d):
    t = T(d); x = sum(2 * ((f * (1 + dt) * t) % 1) - 1 for dt in (-.008, 0, .008)) / 3
    return bp(x, 300, 3500) * env(len(t), .04, .05, .85, .06)
def lowstr(f, d): return strings(f, d) * .9 + bassn(f, d) * .3
INST = dict(mbox=mbox, marimba=marimba, glock=glock, piano=piano, pad=pad, flute=flute, brass=brass, bass=bassn, pluck=pluck_fast, organ=organ, strings=strings, pizz=pizz, harp=harp,
            choir=choir, kalimba=kalimba, balafon=balafon, whistle=whistle, bassoon=bassoon, tuba=tuba, synbass=synbass, celesta=celesta, epiano=epiano, steel=steel, accordion=accordion, lowstr=lowstr)
CACHE = {}
def note(inst, f, d):
    k = (inst, round(f, 2), round(d, 2))
    if k not in CACHE:
        if len(CACHE) > 2500: CACHE.clear()
        CACHE[k] = INST[inst](f, d)
    return CACHE[k]
# drums
def tom(f=110, d=.5): t = T(d); return (np.sin(ph(sweep(f * 1.6, f, d))) * expd(len(t), 7) + .2 * bp(noise(d), 200, 2000) * expd(len(t), 30))
def timpani(f=73, d=1.2): t = T(d); return (np.sin(2 * np.pi * f * t) + .4 * np.sin(2 * np.pi * f * 1.5 * t) * expd(len(t), 4) + .3 * lp(noise(d), 500) * expd(len(t), 20)) * expd(len(t), 3)
def djembe_bass(d=.35): t = T(d); return np.sin(ph(sweep(110, 65, d))) * expd(len(t), 10)
def djembe_tone(d=.25): t = T(d); return (np.sin(ph(sweep(330, 260, d))) * .7 + .3 * bp(noise(d), 300, 1500)) * expd(len(t), 16)
def djembe_slap(d=.15): t = T(d); return (bp(noise(d), 900, 6000) + .3 * np.sin(2 * np.pi * 420 * t)) * expd(len(t), 35)
def agogo(f=1100, d=.3): t = T(d); return (np.sin(2 * np.pi * f * t) + .5 * np.sin(2 * np.pi * f * 2.68 * t)) * expd(len(t), 14) * .5
def woodblock(d=.12): t = T(d); return (np.sin(2 * np.pi * 900 * t) + .4 * np.sin(2 * np.pi * 2300 * t)) * expd(len(t), 45)
def sleigh(d=.25):
    x = np.zeros(int(d * SR))
    for k in range(7): n = int(.12 * SR); s = int(RNG.uniform(0, .03) * SR); f = RNG.uniform(5000, 9000); x[s:s + n] += np.sin(2 * np.pi * f * np.arange(n) / SR) * expd(n, 30) * .25
    return x + hp(noise(d), 6000) * expd(int(d * SR), 25) * .3
def rim(d=.08): t = T(d); return (bp(noise(d), 1500, 7000) * .5 + np.sin(2 * np.pi * 1700 * t)) * expd(len(t), 70) * .5
def crash(d=2.0): return hp(noise(d), 4000) * expd(int(d * SR), 2.5) * .5
def talking(f=200, d=.4): t = T(d); return np.sin(ph(sweep(f * 1.5, f * .8, d))) * expd(len(t), 6) * env(len(t), .005)
DR = {}
def drum(ch):
    if ch not in DR:
        DR[ch] = {'k': lambda: kick(), 's': lambda: snare(), 'h': lambda: hat(), 'o': lambda: hat(.22) * .8, 'c': lambda: clap(), 'z': lambda: shaker(), 't': lambda: tom(),
                  'T': lambda: timpani(), 'd': lambda: djembe_bass(), 'n': lambda: djembe_tone(), 'p': lambda: djembe_slap(), 'b': lambda: agogo(), 'B': lambda: agogo(760),
                  'w': lambda: woodblock(), 'j': lambda: sleigh(), 'r': lambda: rim(), 'x': lambda: crash(), 'g': lambda: talking()}[ch]()
    return DR[ch]
DGAIN = dict(k=1, s=.6, h=.45, o=.35, c=.5, z=.45, t=.7, T=.9, d=1, n=.7, p=.55, b=.4, B=.4, w=.45, j=.4, r=.5, x=.4, g=.6)
DPAN = dict(h=.3, o=.3, z=.4, b=-.35, B=-.35, j=.25, w=-.2, n=-.15, p=.15, t=-.2)

# ---------------- music theory ----------------
SCALES = dict(major=[0, 2, 4, 5, 7, 9, 11], minor=[0, 2, 3, 5, 7, 8, 10], hminor=[0, 2, 3, 5, 7, 8, 11], dorian=[0, 2, 3, 5, 7, 9, 10], mixo=[0, 2, 4, 5, 7, 9, 10])
def m2f(m): return 440 * 2 ** ((m - 69) / 12)
NN = {n: i for i, n in enumerate(['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'])}; NN.update(Db=1, Eb=3, Gb=6, Ab=8, Bb=10)
def n2m(n): return NN[n[:-1]] + 12 * (int(n[-1]) + 1)
class Key:
    def __init__(s, root, mode): s.root, s.mode, s.sc = root, mode, SCALES[mode]
    def deg(s, d, base=0):   # scale degree (any integer) -> midi
        n = len(s.sc); return s.root + base + 12 * (d // n) + s.sc[d % n]
    def chord(s, d, seventh=False):  # diatonic triad on degree d (0-based): list of degrees
        c = [d, d + 2, d + 4]; return c + [d + 6] if seventh else c
    def degree_of(s, midi):  # nearest scale degree to a midi note
        best = None
        for d in range(-21, 29):
            e = abs(s.deg(d) - midi)
            if best is None or e < best[0]: best = (e, d)
        return best[1]

# ---------------- melody writer ----------------
CELLS = {
    'happy': [[1, 1, 1, 1], [.5, .5, 1, 1, 1], [1, .5, .5, 1, 1], [.5, .5, .5, .5, 1, 1], [1.5, .5, 1, 1], [1, 1, 2], [.5, .5, 1, .5, .5, 1]],
    'calm': [[2, 2], [1, 1, 2], [3, 1], [2, 1, 1], [1.5, .5, 2], [4]],
    'lullaby': [[1, 1, 1], [2, 1], [1.5, .5, 1], [3]],
    'worship': [[1, 1, 1, 1], [2, 1, 1], [1, 1, 2], [1.5, .5, 1, 1], [.5, .5, 1, 2]],
    'adventure': [[.75, .25, .5, .5, 1, 1], [1, .5, .5, 2], [.5, .5, .5, .5, 2], [1.5, .5, 1, 1], [.75, .25, 1, .75, .25, 1]],
    'funny': [[.5, -.5, .5, -.5, 1, 1], [.5, .5, .5, .5, 1, -1], [.25, .25, .5, -.5, .5, 1, 1], [1, -.5, .5, 1, 1], [.5, .5, -.5, .5, 2]],
    'suspense': [[2, 2], [1, 1, 1, 1], [-1, 1, 2], [1.5, .5, 2], [-2, 1, 1]],
    'african': [[.75, .75, .5, 1, 1], [.5, 1, .5, 1, 1], [1, .5, .5, .5, .5, 1], [-.5, .5, .5, .5, 1, 1], [.75, .25, .5, .5, .5, .5, 1]],
    'holiday': [[1, 1, 1, 1], [.5, .5, 1, 2], [1, 1, 2], [1.5, .5, 1, 1], [.5, .5, .5, .5, 2]],
    'waltz': [[1, 1, 1], [2, 1], [1.5, .5, 1], [3], [.5, .5, 1, 1]],
}
def write_phrase(r, key, chords, beats, cells, start_deg, final=False, lo=-3, hi=9, pent=False):
    """Two bars of melody over chords (list of 2 chord degree lists). Returns ([(midi|None, beats)], last_deg)."""
    out, d, t = [], start_deg, 0.0; up = r.random() < .5
    rh = [c for c in cells[r.integers(len(cells))]] + [c for c in cells[r.integers(len(cells))]]
    if final:  # end on a long note
        while rh and sum(abs(x) for x in rh) > beats * 2 - 2: rh.pop()
        rh.append(beats * 2 - sum(abs(x) for x in rh))
    n = len(rh)
    for i, b in enumerate(rh):
        bar = min(1, int(t // beats)); ch = chords[bar]
        if b < 0: out.append((None, -b)); t += -b; continue
        tones = [c + 7 * o for c in ch for o in (-2, -1, 0, 1, 2)]
        if i == n - 1 and final: cand = [c for c in tones if (c - ch[0]) % 7 == 0 and lo <= c <= hi] or tones; d = min(cand, key=lambda c: abs(c - d))
        elif abs(t - round(t)) < 1e-6:
            cand = [c for c in tones if lo <= c <= hi and abs(c - d) <= 4 and c != d] or [d]
            w = np.array([1.0 / (1 + abs(c - d)) * (1.6 if (c > d) == up else 1) for c in cand]); d = cand[r.choice(len(cand), p=w / w.sum())]
        else:
            step = 1 if up else -1
            if r.random() < .25: step = -step
            if r.random() < .15: step *= 2
            d = int(np.clip(d + step, lo, hi))
        if pent and key.sc[d % 7] in (5, 11) and key.mode == 'major': d += 1 if r.random() < .5 else -1
        if pent and key.sc[d % 7] in (1, 8) and key.mode != 'major': d += 1
        if d >= hi - 1: up = False
        if d <= lo + 1: up = True
        if i == n // 2 and r.random() < .5: up = not up
        out.append((d, b)); t += b
    return out, d
def section_melody(r, key, prog, beats, cells, bars, pent=False, lo=-3, hi=9):
    """bars (4 or 8) of melody: antecedent / consequent pairs, repeating motifs."""
    mel, d = [], 2 + int(r.integers(3))
    ant, d1 = write_phrase(r, key, [key.chord(prog[0]), key.chord(prog[1])], beats, cells, d, False, lo, hi, pent)
    con, _ = write_phrase(r, key, [key.chord(prog[2 % len(prog)]), key.chord(prog[3 % len(prog)])], beats, cells, d1, True, lo, hi, pent)
    mel += ant + con
    if bars == 8:
        # repeat the antecedent (same rhythm, re-fitted pitches) and end with a fresh cadence on the tonic
        con2, _ = write_phrase(r, key, [key.chord(prog[2 % len(prog)]), key.chord(0)], beats, cells, d1, True, lo, hi, pent)
        mel += ant + con2
    return mel
def harmonize(mel, key, beats, choices=(0, 3, 4, 5, 1)):
    """Pick a chord per bar for a given melody (scale degrees), last bar = tonic."""
    bars, t = {}, 0.0
    for d, b in mel:
        if d is not None:
            bar = int(t // beats); w = b * (1.5 if abs(t - round(t)) < 1e-6 and int(round(t)) % beats == 0 else 1); bars.setdefault(bar, []).append((d % 7, w))
        t += b
    nb = int(np.ceil(t / beats - 1e-6)); out = []
    for i in range(nb):
        notes = bars.get(i, [])
        def score(c):
            ct = {c % 7, (c + 2) % 7, (c + 4) % 7}; return sum(w for n, w in notes if n in ct) - (0.3 if c != 0 else 0) * 0.5 - (.4 if c == 1 else 0)
        best = max(choices, key=score) if notes else (out[-1] if out else 0)
        out.append(best)
    if out: out[-1] = 0
    if len(out) > 1 and out[-2] == 0 and out[-1] == 0 and bars.get(nb - 2): pass
    return out

# ---------------- arranger ----------------
class Mix:
    def __init__(s, secs): n = int(secs * SR); s.L, s.R = np.zeros(n), np.zeros(n)
    def put(s, x, at, p=0.0, g=1.0):
        if at < 0: return
        st = pan(x * g, p); place(s.L, st[0], at); place(s.R, st[1], at)
def play_melody(M, mel, key, inst, sec, start, g=.5, p=0.0, base=12, legato=1.0, oct_=0):
    t = start
    for d, b in mel:
        if d is not None: M.put(note(inst, m2f(key.deg(d, base + 12 * oct_)), max(.12, b * sec * legato + .12)), t * sec, p, g)
        t += b
def play_given(M, mel, inst, sec, start, g=.5, p=0.0, shift=0, legato=1.0):
    t = start
    for m, b in mel:
        if m is not None: M.put(note(inst, m2f(m + shift), max(.12, b * sec * legato + .12)), t * sec, p, g)
        t += b
def play_chords(M, key, prog, inst, style, beats, sec, start, g=.4, p=-.25, base=0, r=None):
    t = start
    for c in prog:
        ds = key.chord(c); fs = [m2f(key.deg(x, base)) for x in ds]
        if style == 'block':
            for f in fs: M.put(note(inst, f, beats * sec + .25), t * sec, p, g / len(fs))
        elif style == 'arp':
            ext = fs + [fs[0] * 2]; seq = [ext[[0, 1, 2, 3, 2, 1][k % 6]] for k in range(int(beats * 2))]; step = beats / len(seq)  # 8th notes
            for k, f in enumerate(seq): M.put(note(inst, f, step * sec * 2.2), (t + k * step) * sec, p + .25 * np.sin(k), g / 2)
        elif style == 'alberti':
            seq = [fs[0], fs[2], fs[1], fs[2]] * int(beats // 2) if beats % 2 == 0 else [fs[0], fs[2], fs[1], fs[2], fs[1], fs[2]]
            step = beats / len(seq)
            for k, f in enumerate(seq): M.put(note(inst, f, step * sec * 2), (t + k * step) * sec, p, g / 2.2)
        elif style == 'strum':
            for b in range(int(beats)):
                acc = 1.0 if b % 2 == 0 else .7
                for k, f in enumerate(fs + [fs[0] * 2]): M.put(note(inst, f, sec * 1.1), (t + b) * sec + k * .012, p, g * acc / 3)
        elif style == 'stab':   # off-beat chops (highlife / reggae / funny)
            for b in range(int(beats)):
                for f in fs: M.put(note(inst, f, sec * .35), (t + b + .5) * sec, p, g / len(fs) * 1.2)
        elif style == 'waltz':  # oom-pah-pah (chords on 2 and 3)
            for b in range(1, int(beats)):
                for f in fs: M.put(note(inst, f, sec * .6), (t + b) * sec, p, g / len(fs))
        elif style == 'pulse':  # repeated 8ths (suspense / adventure ostinato)
            for k in range(int(beats * 2)):
                f = fs[0] if k % 4 != 3 else fs[1 + (k // 4) % 2]; M.put(note(inst, f, sec * .45), (t + k / 2) * sec, p, g / 2)
        elif style == 'kalimba':  # interlocking pattern
            pat = [0, 2, 1, 3, 2, 0, 3, 1]; ext = fs + [fs[0] * 2]
            for k in range(int(beats * 2)): M.put(note(inst, ext[pat[k % 8]], sec), (t + k / 2) * sec, p + (.3 if k % 2 else -.3), g / 2.4)
        t += beats
def play_bass(M, key, prog, style, beats, sec, start, g=.4, inst='bass'):
    t = start
    for c in prog:
        r0 = m2f(key.deg(c, -24)); fifth = m2f(key.deg(c + 4, -24))
        if r0 > 130: r0 /= 2; fifth /= 2
        if style == 'root': M.put(note(inst, r0, beats * sec * .95), t * sec, 0, g)
        elif style == 'half':
            for b in range(0, int(beats), 2): M.put(note(inst, r0 if b == 0 else fifth, sec * 1.9), (t + b) * sec, 0, g)
        elif style == 'walk':
            for b in range(int(beats)): M.put(note(inst, [r0, fifth, r0 * 2, fifth][b % 4] if beats == 4 else [r0, fifth, fifth][b % 3], sec * .9), (t + b) * sec, 0, g)
        elif style == 'oompah':
            M.put(note(inst, r0, sec * .9), t * sec, 0, g)
            if beats == 4: M.put(note(inst, fifth, sec * .9), (t + 2) * sec, 0, g)
        elif style == 'octave':
            for k in range(int(beats * 2)): M.put(note(inst, r0 * (2 if k % 2 else 1), sec * .45), (t + k / 2) * sec, 0, g * .8)
        elif style == 'syncop':
            for at, f in ((0, r0), (.75, r0), (1.5, fifth), (2.5, r0 * 2), (3, fifth)):
                if at < beats: M.put(note(inst, f, sec * .6), (t + at) * sec, 0, g)
        elif style == 'pedal': M.put(note(inst, m2f(key.deg(0, -24)) / (2 if m2f(key.deg(0, -24)) > 130 else 1), beats * sec), t * sec, 0, g)
        t += beats
def play_drums(M, pattern, bars, beats, sec, start, g=.5, fill=False):
    steps = len(pattern); g = g * .6   # keep percussion under the tune
    for bar in range(bars):
        pat = pattern
        if fill and bar == bars - 1: pat = pattern[:steps // 2] + ''.join('t' if k % 2 == 0 else 's' for k in range(steps - steps // 2))
        for k, chs in enumerate(pat.split(' ') if ' ' in pat else list(pat)):
            at = (start + bar * beats + k * beats / steps) * sec
            for ch in chs:
                if ch in DGAIN: M.put(drum(ch), at, DPAN.get(ch, 0) + RNG.uniform(-.03, .03), g * DGAIN[ch] * RNG.uniform(.85, 1.0))

# category styles: bpm range, modes, progressions (degrees), drum patterns (16 steps 4/4, 12 steps 3/4), instruments
PROG = {
    'happy': [[0, 4, 5, 3], [0, 3, 4, 0], [0, 5, 3, 4], [3, 4, 0, 0], [0, 3, 0, 4], [0, 1, 4, 0]],
    'calm': [[0, 5, 3, 4], [0, 2, 3, 0], [3, 0, 4, 0], [0, 3, 5, 4], [5, 3, 0, 4]],
    'lullaby': [[0, 3, 4, 0], [0, 5, 3, 4], [0, 0, 3, 4], [0, 3, 0, 4]],
    'worship': [[0, 3, 4, 0], [0, 4, 5, 3], [3, 0, 4, 0], [0, 5, 3, 4], [0, 3, 5, 4]],
    'adventure': [[0, 5, 2, 6], [0, 5, 6, 4], [0, 3, 6, 2], [0, 6, 5, 6], [5, 6, 0, 0]],
    'adventure_maj': [[0, 4, 5, 3], [0, 3, 4, 4], [3, 4, 0, 5]],
    'funny': [[0, 3, 4, 0], [0, 0, 3, 4], [0, 5, 1, 4], [0, 3, 0, 4]],
    'suspense': [[0, 5, 0, 4], [0, 1, 0, 4], [0, 6, 5, 4], [0, 0, 5, 5], [0, 3, 0, 4]],
    'african': [[0, 3, 4, 3], [0, 3, 0, 4], [0, 4, 3, 0], [3, 0, 4, 0], [0, 5, 3, 4]],
    'holiday': [[0, 3, 4, 0], [0, 5, 3, 4], [0, 3, 0, 4], [3, 4, 0, 5]],
}
DRUMS = {
    'happy': ['k...z...c...z...', 'k.h.c.h.k.h.c.h.', 'k..zc.z.k.z.c.zz', 'k...s...k.k.s...', 'kzhzczhzkzhzczhz'],
    'calm': ['z.......z.......', '', 'k.......z.......'],
    'lullaby': ['', 'z.....z.....'],
    'worship': ['k...c...k...c...', 'k.h.c.h.kkh.c.h.', 'k...s...k...s..s', ''],
    'adventure': ['T...t.t.T...t.tt', 'k.hhs.hhk.hhs.hh', 'k..k..k.s...k.k.', 'T.......t...t...'],
    'funny': ['k...w...k.k.w...', 'k.w.s.w.k.w.s.w.', 'kz.zsz.zkz.zs.zz', 'w.ww.w.ww.w.ww.w'],
    'suspense': ['k.......k.......', 'r...r...r...r.r.', 'T...............', 'k..r..r.k..r....'],
    'african': ['dzbznzpzdzbzpznz', 'd.bnp.nbd.bnpnnb', 'dbz.nbzpdbz.nbzp', 'kzbzczbzkzbzcbzb', 'd.b.n.bpd.b.nnbp'],
    'holiday': ['k.j.s.j.k.j.s.j.', 'kjjjsjjjkjjjsjjj', 'j.j.j.j.j.j.j.j.'],
    'waltz': ['k...z...z...', 'k.z.c.z.c.z.', 'k...j...j...'],
}
INSTR = {  # (leads, second leads, accompaniment (inst, style), bass (inst, style))
    'happy': (['glock', 'marimba', 'mbox', 'whistle', 'steel', 'celesta', 'flute'], ['flute', 'pizz', 'glock', 'epiano', 'accordion', 'brass'], [('pluck', 'strum'), ('piano', 'arp'), ('marimba', 'arp'), ('epiano', 'stab'), ('pluck', 'stab')], [('bass', 'walk'), ('bass', 'half'), ('synbass', 'walk'), ('tuba', 'oompah')]),
    'calm': (['flute', 'piano', 'epiano', 'harp', 'strings'], ['strings', 'flute', 'celesta', 'choir'], [('piano', 'alberti'), ('harp', 'arp'), ('pad', 'block'), ('epiano', 'arp')], [('bass', 'root'), ('bass', 'half')]),
    'lullaby': (['mbox', 'celesta', 'harp', 'flute', 'kalimba'], ['strings', 'flute', 'mbox', 'choir'], [('harp', 'arp'), ('pad', 'block'), ('piano', 'alberti'), ('celesta', 'arp')], [('bass', 'root')]),
    'worship': (['organ', 'piano', 'choir', 'brass', 'flute', 'glock'], ['strings', 'choir', 'brass', 'flute'], [('organ', 'block'), ('piano', 'arp'), ('pluck', 'strum'), ('strings', 'block')], [('bass', 'half'), ('bass', 'walk'), ('bass', 'root')]),
    'adventure': (['brass', 'strings', 'flute', 'whistle'], ['brass', 'strings', 'choir', 'glock'], [('strings', 'pulse'), ('lowstr', 'pulse'), ('pad', 'block'), ('pizz', 'pulse')], [('bass', 'octave'), ('lowstr', 'half'), ('synbass', 'octave')]),
    'funny': (['bassoon', 'pizz', 'whistle', 'marimba', 'accordion', 'glock'], ['pizz', 'glock', 'bassoon', 'marimba'], [('pizz', 'stab'), ('piano', 'stab'), ('marimba', 'stab'), ('accordion', 'waltz')], [('tuba', 'oompah'), ('bassoon', 'oompah'), ('bass', 'walk')]),
    'suspense': (['pizz', 'strings', 'celesta', 'piano', 'flute'], ['celesta', 'strings', 'choir', 'glock'], [('lowstr', 'pulse'), ('pizz', 'pulse'), ('pad', 'block'), ('piano', 'pulse')], [('bass', 'pedal'), ('lowstr', 'pedal'), ('synbass', 'half')]),
    'african': (['kalimba', 'balafon', 'whistle', 'flute', 'steel', 'marimba'], ['choir', 'balafon', 'kalimba', 'brass'], [('kalimba', 'kalimba'), ('pluck', 'stab'), ('balafon', 'kalimba'), ('epiano', 'stab')], [('bass', 'syncop'), ('synbass', 'syncop')]),
    'holiday': (['glock', 'celesta', 'mbox', 'brass', 'flute'], ['strings', 'choir', 'glock', 'brass'], [('piano', 'arp'), ('celesta', 'arp'), ('pluck', 'strum'), ('strings', 'block')], [('bass', 'walk'), ('tuba', 'oompah'), ('bass', 'half')]),
}
BPM = dict(happy=(108, 132), calm=(64, 80), lullaby=(60, 72), worship=(84, 120), adventure=(104, 128), funny=(112, 140), suspense=(76, 100), african=(100, 122), holiday=(100, 128))
MODES = dict(happy=['major'], calm=['major', 'major', 'dorian'], lullaby=['major'], worship=['major'], adventure=['minor', 'hminor', 'dorian', 'major'], funny=['major', 'major', 'mixo'], suspense=['minor', 'hminor'], african=['major', 'major', 'mixo'], holiday=['major'])

def sec_len(bpm, beats): return 60 / bpm * beats
def compose(seed, cat, opts=None):
    """An original track for category cat. Returns (stereo array, bpm, beats-per-bar)."""
    r = np.random.default_rng(seed); o = dict(opts or {})
    beats = o.get('beats', 3 if cat == 'lullaby' and r.random() < .6 else 4)
    lo_, hi_ = BPM[cat]; bpm = int(o.get('bpm', r.integers(lo_, hi_ + 1))); sec = 60 / bpm
    mode = o.get('mode', MODES[cat][r.integers(len(MODES[cat]))])
    root = int(o.get('root', 55 + r.integers(0, 10)))  # G3..E4 tonic for chords
    key = Key(root, mode)
    pk = 'adventure_maj' if cat == 'adventure' and mode == 'major' else cat
    progA = list(PROG[pk][r.integers(len(PROG[pk]))]); progB = list(PROG[pk][r.integers(len(PROG[pk]))])
    if progB == progA: progB = progA[2:] + progA[:2]
    cells = CELLS['waltz'] if beats == 3 else CELLS[cat]
    bar_s = sec * beats; S_ = 8 if (2 + 4 * 4 + 2) * bar_s < 44 else 4
    leads, leads2, accs, basses = INSTR[cat]
    l1 = o.get('lead', leads[r.integers(len(leads))]); l2 = o.get('lead2', leads2[r.integers(len(leads2))])
    acc, accst = accs[r.integers(len(accs))]; acc = o.get('acc', acc); accst = o.get('accst', accst)
    if accst == 'block' and l1 in ('strings', 'choir', 'organ', 'flute') and not o.get('accst'): acc, accst = ('harp', 'arp') if cat in ('calm', 'lullaby') else ('piano', 'arp')  # keep a clear pulse
    if beats == 3 and accst in ('stab', 'pulse', 'kalimba'): accst = 'waltz' if cat != 'lullaby' else 'arp'
    bi, bst = basses[r.integers(len(basses))]
    dpats = DRUMS['waltz'] if beats == 3 else DRUMS[cat]; dp = o.get('drums', dpats[r.integers(len(dpats))])
    pent = cat in ('african',) or (cat in ('happy', 'lullaby') and r.random() < .3)
    lo, hi = (-2, 8) if cat != 'suspense' else (-3, 6)
    A = section_melody(r, key, progA * (S_ // 4) if S_ == 8 else progA, beats, cells, S_, pent, lo, hi)
    B = section_melody(r, key, progB, beats, cells, S_, pent, lo, hi)
    pA = (progA * 2)[:S_] if S_ == 8 else progA; pB = (progB * 2)[:S_] if S_ == 8 else progB
    if S_ == 8: pA = pA[:7] + [0]; pB = pB[:7] + [progA[0]]
    form = [('intro', 2), ('A', S_), ('A2', S_), ('B', S_), ('A3', S_), ('outro', 2)]
    total = sum(b for _, b in form) * bar_s + 4; M = Mix(total)
    oct_ = 0 if l1 not in ('bassoon', 'tuba') else -1
    t = 0  # in beats
    has_drums = bool(dp.strip('.'))
    dgain = .42 if cat not in ('calm', 'lullaby', 'suspense') else .3
    gl = .55
    secs = []
    for name, bars in form:
        secs.append((name, round(t * sec, 3)))
        if name == 'intro':
            play_chords(M, key, [progA[0], progA[-1]] if progA[-1] != progA[0] else [progA[0], 4], acc, accst, beats, sec, t, .42)
            if has_drums and cat in ('african', 'adventure', 'funny', 'happy'): play_drums(M, dp, bars, beats, sec, t, dgain * .7)
            if cat == 'african': M.put(drum('g'), (t + beats * 2 - 1) * sec, -.2, .5); M.put(drum('g'), (t + beats * 2 - .5) * sec, -.2, .4)
            if cat == 'adventure': M.put(drum('T'), t * sec, 0, .8)
        elif name == 'outro':
            for d in key.chord(0): M.put(note(acc if acc not in ('pizz',) else 'pad', m2f(key.deg(d)), bars * bar_s), t * sec, -.2, .16)
            M.put(note(l1, m2f(key.deg(0, 12 + 12 * oct_)), bars * bar_s * .8), t * sec, 0, gl * .9)
            play_bass(M, key, [0], 'root', beats * bars, sec, t, .4, bi if bi not in ('lowstr',) else 'bass')
            if has_drums and cat not in ('calm', 'lullaby'): M.put(drum('k'), t * sec, 0, .6); M.put(drum('x'), t * sec, .1, .5)
        else:
            mel, prog = (B, pB) if name == 'B' else (A, pA)
            lead = l2 if name == 'B' else l1
            play_melody(M, mel, key, lead, sec, t, gl, 0, 12, .95 if cat != 'funny' else .6, 0 if lead not in ('bassoon', 'tuba') else -1)
            if name == 'A2' and cat not in ('suspense',):  # a soft harmony a third below
                h = [(d - 2 if d is not None else None, b) for d, b in mel]; play_melody(M, h, key, l2 if l2 != lead else leads[0], sec, t, gl * .35, .35, 12)
            if name == 'A3': play_melody(M, mel, key, l2, sec, t, gl * .4, -.3, 24 if l2 not in ('bassoon', 'tuba', 'strings', 'brass', 'choir') else 12)
            play_chords(M, key, prog, acc, accst, beats, sec, t, .42 if name != 'B' else .38)
            if name in ('B', 'A3') and cat in ('worship', 'calm', 'holiday', 'adventure', 'lullaby'): play_chords(M, key, prog, 'strings' if acc != 'strings' else 'pad', 'block', beats, sec, t, .22, .3)
            play_bass(M, key, prog, bst, beats, sec, t, .42, bi)
            if has_drums and not (name == 'A' and cat in ('calm', 'lullaby', 'worship', 'suspense')):
                play_drums(M, dp, bars, beats, sec, t, dgain * (1.0 if name != 'B' else .85), fill=(name in ('A2', 'B')))
            if name in ('A2', 'A3') and cat in ('happy', 'holiday', 'worship', 'african', 'adventure'): M.put(drum('x'), t * sec, .2, .3)
            if cat == 'suspense' and name in ('A2', 'A3'): M.put(note('lowstr', m2f(key.deg(0, -12)), bars * bar_s), t * sec, 0, .18)
        t += bars * beats
    mix = np.stack([M.L, M.R]); wet = dict(calm=.35, lullaby=.4, worship=.33, suspense=.32).get(cat, .22)
    mix = np.stack([reverb(mix[0], 1.6, wet)[:mix.shape[1]], reverb(mix[1], 1.7, wet)[:mix.shape[1]]])
    end = int((t * sec + 2.6) * SR); mix = mix[:, :end]; f = int(1.8 * SR); mix[:, -f:] *= np.linspace(1, 0, f) ** 2
    drops = [s for n, s in secs if n in ('A', 'A2', 'A3')] if has_drums else [s for n, s in secs if n in ('A2', 'A3')]
    return mix, bpm, beats, dict(sections=secs, drops=drops, end=round(t * sec, 3), arr=dict(lead=l1, lead2=l2, acc=acc, accst=accst, bass=bi, bst=bst, drums=dp, key=root, mode=mode))

# ---------------- public-domain melodies (our own arrangements) ----------------
def mel_from(names):
    out = []
    for n, b in names: out.append((n2m(n) if n else None, b))
    return out
PD = {}
PD['doxology'] = dict(beats=4, key=(55, 'major'), mel=[('G4', 2), ('G4', 1), ('F#4', 1), ('E4', 1), ('D4', 1), ('G4', 1), ('A4', 1), ('B4', 2), (None, 2),
    ('B4', 2), ('B4', 1), ('B4', 1), ('A4', 1), ('G4', 1), ('C5', 1), ('B4', 1), ('A4', 2), (None, 2),
    ('G4', 2), ('A4', 1), ('B4', 1), ('A4', 1), ('G4', 1), ('E4', 1), ('F#4', 1), ('G4', 2), (None, 2),
    ('D5', 2), ('B4', 1), ('G4', 1), ('A4', 1), ('C5', 1), ('B4', 1), ('A4', 1), ('G4', 4)])
PD['saints'] = dict(beats=4, key=(60, 'major'), mel=[(None, 1), ('C4', 1), ('E4', 1), ('F4', 1), ('G4', 4), (None, 1), ('C4', 1), ('E4', 1), ('F4', 1), ('G4', 4),
    (None, 1), ('C4', 1), ('E4', 1), ('F4', 1), ('G4', 2), ('E4', 2), ('C4', 2), ('E4', 2), ('D4', 4), (None, 1),
    ('E4', 1), ('E4', 1), ('D4', 1), ('C4', 3), ('C4', 1), ('E4', 2), ('G4', 2), ('G4', 1), ('F4', 3), (None, 1),
    ('E4', 1), ('F4', 1), ('G4', 2), ('E4', 2), ('C4', 2), ('D4', 2), ('C4', 4)])
PD['michael'] = dict(beats=4, key=(60, 'major'), mel=[('C4', 1), ('E4', 1), ('G4', 1.5), ('E4', .5), ('G4', 1), ('A4', 1), ('G4', 2), ('E4', 1), ('G4', 1), ('A4', 2), ('G4', 4),
    ('E4', 1), ('G4', 1), ('G4', 1.5), ('E4', .5), ('F4', 1), ('E4', 1), ('D4', 2), ('C4', 1), ('D4', 1), ('E4', 1), ('D4', 1), ('C4', 4)])
PD['silentnight'] = dict(beats=3, key=(60, 'major'), mel=[('G4', 1.5), ('A4', .5), ('G4', 1), ('E4', 3), ('G4', 1.5), ('A4', .5), ('G4', 1), ('E4', 3), ('D5', 2), ('D5', 1), ('B4', 3), ('C5', 2), ('C5', 1), ('G4', 3),
    ('A4', 2), ('A4', 1), ('C5', 1.5), ('B4', .5), ('A4', 1), ('G4', 1.5), ('A4', .5), ('G4', 1), ('E4', 3), ('A4', 2), ('A4', 1), ('C5', 1.5), ('B4', .5), ('A4', 1), ('G4', 1.5), ('A4', .5), ('G4', 1), ('E4', 3),
    ('D5', 2), ('D5', 1), ('F5', 1.5), ('D5', .5), ('B4', 1), ('C5', 3), ('E5', 3), ('C5', 1.5), ('G4', .5), ('E4', 1), ('G4', 1.5), ('F4', .5), ('D4', 1), ('C4', 3), (None, 3)])
PD['jinglebells'] = dict(beats=4, key=(60, 'major'), mel=[('E4', 1), ('E4', 1), ('E4', 2), ('E4', 1), ('E4', 1), ('E4', 2), ('E4', 1), ('G4', 1), ('C4', 1.5), ('D4', .5), ('E4', 4),
    ('F4', 1), ('F4', 1), ('F4', 1.5), ('F4', .5), ('F4', 1), ('E4', 1), ('E4', 1), ('E4', .5), ('E4', .5), ('E4', 1), ('D4', 1), ('D4', 1), ('E4', 1), ('D4', 2), ('G4', 2),
    ('E4', 1), ('E4', 1), ('E4', 2), ('E4', 1), ('E4', 1), ('E4', 2), ('E4', 1), ('G4', 1), ('C4', 1.5), ('D4', .5), ('E4', 4),
    ('F4', 1), ('F4', 1), ('F4', 1.5), ('F4', .5), ('F4', 1), ('E4', 1), ('E4', 1), ('E4', .5), ('E4', .5), ('G4', 1), ('G4', 1), ('F4', 1), ('D4', 1), ('C4', 4)])
PD['wewish'] = dict(beats=3, key=(55, 'major'), mel=[(None, 2), ('D4', 1), ('G4', 1), ('G4', .5), ('A4', .5), ('G4', .5), ('F#4', .5), ('E4', 1), ('E4', 1), ('E4', 1), ('A4', 1), ('A4', .5), ('B4', .5), ('A4', .5), ('G4', .5),
    ('F#4', 1), ('D4', 1), ('D4', 1), ('B4', 1), ('B4', .5), ('C5', .5), ('B4', .5), ('A4', .5), ('G4', 1), ('E4', 1), ('D4', .5), ('D4', .5), ('E4', 1), ('A4', 1), ('F#4', 1), ('G4', 2), (None, 1)])
PD['deckthehalls'] = dict(beats=4, key=(60, 'major'), mel=[('G4', 1.5), ('F4', .5), ('E4', 1), ('D4', 1), ('C4', 1), ('D4', 1), ('E4', 1), ('C4', 1), ('D4', .5), ('E4', .5), ('F4', .5), ('D4', .5), ('E4', 1.5), ('D4', .5), ('C4', 1), ('B3', 1), ('C4', 2),
    ('G4', 1.5), ('F4', .5), ('E4', 1), ('D4', 1), ('C4', 1), ('D4', 1), ('E4', 1), ('C4', 1), ('D4', .5), ('E4', .5), ('F4', .5), ('D4', .5), ('E4', 1.5), ('D4', .5), ('C4', 1), ('B3', 1), ('C4', 2),
    ('D4', 1.5), ('E4', .5), ('F4', 1), ('D4', 1), ('E4', 1.5), ('F4', .5), ('G4', 1), ('D4', 1), ('E4', .5), ('F#4', .5), ('G4', 1), ('A4', .5), ('B4', .5), ('C5', 1), ('B4', 1), ('A4', 1), ('G4', 2),
    ('G4', 1.5), ('F4', .5), ('E4', 1), ('D4', 1), ('C4', 1), ('D4', 1), ('E4', 1), ('C4', 1), ('A4', .5), ('A4', .5), ('A4', .5), ('A4', .5), ('G4', 1.5), ('F4', .5), ('E4', 1), ('D4', 1), ('C4', 2)])
PD['frerejacques'] = dict(beats=4, key=(60, 'major'), mel=[('C4', 1), ('D4', 1), ('E4', 1), ('C4', 1)] * 2 + [('E4', 1), ('F4', 1), ('G4', 2)] * 2 + [('G4', .5), ('A4', .5), ('G4', .5), ('F4', .5), ('E4', 1), ('C4', 1)] * 2 + [('C4', 1), ('G3', 1), ('C4', 2)] * 2)
PD['marylamb'] = dict(beats=4, key=(60, 'major'), mel=[('E4', 1), ('D4', 1), ('C4', 1), ('D4', 1), ('E4', 1), ('E4', 1), ('E4', 2), ('D4', 1), ('D4', 1), ('D4', 2), ('E4', 1), ('G4', 1), ('G4', 2),
    ('E4', 1), ('D4', 1), ('C4', 1), ('D4', 1), ('E4', 1), ('E4', 1), ('E4', 1), ('E4', 1), ('D4', 1), ('D4', 1), ('E4', 1), ('D4', 1), ('C4', 4)])
PD['oldmacdonald'] = dict(beats=4, key=(55, 'major'), mel=[('G4', 1), ('G4', 1), ('G4', 1), ('D4', 1), ('E4', 1), ('E4', 1), ('D4', 2), ('B4', 1), ('B4', 1), ('A4', 1), ('A4', 1), ('G4', 3), ('D4', 1),
    ('G4', 1), ('G4', 1), ('G4', 1), ('D4', 1), ('E4', 1), ('E4', 1), ('D4', 2), ('B4', 1), ('B4', 1), ('A4', 1), ('A4', 1), ('G4', 4),
    ('D4', .5), ('D4', .5), ('G4', 1), ('G4', 1), ('G4', 1), ('D4', .5), ('D4', .5), ('G4', 1), ('G4', 1), ('G4', 2), ('G4', .5), ('G4', .5), ('G4', 1), ('G4', .5), ('G4', .5), ('G4', 1), ('G4', .5), ('G4', .5), ('G4', .5), ('G4', .5), ('G4', 1), ('G4', 1),
    ('G4', 1), ('G4', 1), ('G4', 1), ('D4', 1), ('E4', 1), ('E4', 1), ('D4', 2), ('B4', 1), ('B4', 1), ('A4', 1), ('A4', 1), ('G4', 4)])
PD['londonbridge'] = dict(beats=4, key=(60, 'major'), mel=[('G4', 1.5), ('A4', .5), ('G4', 1), ('F4', 1), ('E4', 1), ('F4', 1), ('G4', 2), ('D4', 1), ('E4', 1), ('F4', 2), ('E4', 1), ('F4', 1), ('G4', 2),
    ('G4', 1.5), ('A4', .5), ('G4', 1), ('F4', 1), ('E4', 1), ('F4', 1), ('G4', 2), ('D4', 2), ('G4', 2), ('E4', 1), ('C4', 3)])
def arrange_pd(spec, seed, inst):
    """Our own arrangement of a public-domain melody: intro, melody, melody with harmony + drums, melody (lead 2, fuller), tag."""
    r = np.random.default_rng(seed); beats = spec['beats']; bpm = inst['bpm']; sec = 60 / bpm
    root, mode = spec['key']; root += inst.get('shift', 0); key = Key(root - 12 if root >= 60 else root, mode)
    mel = [(m + inst.get('shift', 0) if m is not None else None, b) for m, b in mel_from(spec['mel'])]
    degs = [(key.degree_of(m - 12) if m is not None else None, b) for m, b in mel]
    prog = harmonize(degs, key, beats); nb = len(prog); bar_s = beats * sec
    reps = inst.get('reps', 3 if nb * bar_s < 22 else 2)
    total = (2 + nb * reps + 2) * bar_s + 4; M = Mix(total); t = 0
    acc, accst = inst['acc']; bi, bst = inst['bass']; dp = inst.get('drums', '')
    secs = [('intro', 0.0)]; drops = []
    play_chords(M, key, [prog[0], 4 if beats == 4 else prog[0]], acc, accst, beats, sec, t, .4); t += 2 * beats
    for k in range(reps):
        secs.append(('verse%d' % (k + 1), round(t * sec, 3)))
        if dp and (k == 1 or (k == 0 and inst.get('drums_all'))): drops.append(round(t * sec, 3))
        lead = inst['lead'] if k != reps - 1 or reps == 1 else inst.get('lead2', inst['lead'])
        play_given(M, mel, lead, sec, t, .55, 0, inst.get('oct', 0) * 12, inst.get('legato', .95))
        if k >= 1: play_given(M, mel, inst.get('lead2', inst['lead']), sec, t, .22, .3, 12 + inst.get('oct', 0) * 12)
        play_chords(M, key, prog, acc, accst, beats, sec, t, .4)
        if k >= 1 and inst.get('pad'): play_chords(M, key, prog, inst['pad'], 'block', beats, sec, t, .2, .3)
        play_bass(M, key, prog, bst, beats, sec, t, .4, bi)
        if dp and (k >= 1 or inst.get('drums_all')): play_drums(M, dp, nb, beats, sec, t, .4 * inst.get('dg', 1))
        if k >= 1: M.put(drum('x'), t * sec, .2, .25) if dp else None
        t += nb * beats
    secs.append(('outro', round(t * sec, 3)))
    for d in key.chord(0): M.put(note(acc if acc != 'pizz' else 'pad', m2f(key.deg(d, 12)), 2 * bar_s), t * sec, -.2, .15)
    M.put(note(inst['lead'], m2f(key.deg(0, 12 + 12 * inst.get('oct', 0))), 2 * bar_s * .8), t * sec, 0, .45); play_bass(M, key, [0], 'root', 2 * beats, sec, t, .4, bi)
    t += 2 * beats
    mix = np.stack([M.L, M.R]); wet = inst.get('verb', .28)
    mix = np.stack([reverb(mix[0], 1.6, wet)[:mix.shape[1]], reverb(mix[1], 1.7, wet)[:mix.shape[1]]])
    end = int((t * sec + 2.6) * SR); mix = mix[:, :end]; f = int(1.8 * SR); mix[:, -f:] *= np.linspace(1, 0, f) ** 2
    return mix, bpm, beats, dict(sections=secs, drops=drops, end=round(t * sec, 3))

# ---------------- stingers (intros / outros, 2-8 s) ----------------
def stinger(kind, seed):
    r = np.random.default_rng(seed); root = 57 + int(r.integers(0, 8)); key = Key(root, 'major'); bpm = 120; sec = .5; M = Mix(9)
    up = [key.deg(d, 12) for d in (0, 2, 4, 7)]
    def ch(at, inst, g=.4, d=2.0, base=0, deg=0):
        for x in key.chord(deg): M.put(note(inst, m2f(key.deg(x, base)), d), at, 0, g / 3)
    if kind == 'fanfare':
        for k, m in enumerate(up[:3]): M.put(note('brass', m2f(m), .3), k * .18, 0, .5)
        ch(.54, 'brass', .9, 2.2, 12); M.put(drum('T'), .54, 0, .8); M.put(drum('x'), .54, .2, .5)
    elif kind == 'sparkle':
        for k in range(10): M.put(note('celesta', m2f(key.deg(k, 12)), 1.2), k * .07, np.sin(k), .35)
        ch(.75, 'pad', .7, 2.5, 0); ch(.75, 'glock', .5, 2, 12)
    elif kind == 'tada':
        M.put(drum('s'), 0, 0, .3)
        for k in range(10): M.put(drum('s'), .05 * k, 0, .15 + .05 * k)
        ch(.6, 'brass', .9, 1.6, 12); ch(.6, 'glock', .5, 1.6, 12); M.put(drum('x'), .6, 0, .6); M.put(drum('k'), .6, 0, .6)
    elif kind == 'drumhit':
        for k, c in enumerate('k.k.s.k.kkt.tsx'):
            if c in DGAIN: M.put(drum(c), k * .125, 0, .7)
        ch(1.75, 'pluck', .7, 1.5)
    elif kind == 'happyup':
        for k, d in enumerate([0, 1, 2, 3, 4, 7]): M.put(note('marimba', m2f(key.deg(d, 12)), .5), k * .12, 0, .5)
        ch(.72, 'pluck', .7, 1.5, 0); M.put(drum('c'), .72, 0, .5); M.put(drum('k'), .72, 0, .6)
    elif kind == 'outrodown':
        for k, d in enumerate([7, 6, 4, 2, 0]): M.put(note('glock', m2f(key.deg(d, 12)), .8), k * .14, 0, .45)
        ch(.7, 'pad', .7, 2.6); ch(.7, 'harp', .4, 2.6, 12)
    elif kind == 'worship':
        ch(0, 'organ', .7, 3.2); ch(0, 'choir', .55, 3.2, 12); M.put(note('choir', m2f(key.deg(4, 12)), 1.6), 1.6, 0, .3)
    elif kind == 'african':
        for k, c in enumerate('dbnp.bnpd.bngpdd'):
            if c in DGAIN: M.put(drum(c), k * .14, 0, .6)
        for k, d in enumerate([0, 2, 4, 2, 4, 7]): M.put(note('kalimba', m2f(key.deg(d, 12)), .8), 1.1 + k * .14, 0, .45)
    elif kind == 'funny':
        for k, d in enumerate([0, 4, 0, 4]): M.put(note('bassoon', m2f(key.deg(d, -12)), .22), k * .25, 0, .5)
        M.put(drum('w'), 1.0, 0, .6); M.put(note('whistle', m2f(key.deg(0, 12)), .5), 1.1, 0, .4); M.put(drum('c'), 1.25, 0, .5)
    elif kind == 'suspense':
        M.put(note('lowstr', m2f(key.deg(0, -12)), 2.6), 0, 0, .5); M.put(note('strings', m2f(key.deg(0, 0) + 1), 2.6), .3, 0, .25); M.put(drum('T'), 2.4, 0, .9); M.put(drum('x'), 2.4, 0, .3)
    elif kind == 'holiday':
        for k in range(8): M.put(drum('j'), k * .18, .2, .45)
        for k, d in enumerate([4, 4, 4, 2, 0]): M.put(note('celesta', m2f(key.deg(d, 12)), .6), .36 + k * .18, 0, .45)
        ch(1.26, 'strings', .6, 1.8)
    mix = np.stack([M.L, M.R]); mix = np.stack([reverb(mix[0], 1.4, .25)[:mix.shape[1]], reverb(mix[1], 1.5, .25)[:mix.shape[1]]])
    m = np.max(np.abs(mix), axis=0); idx = np.nonzero(m > m.max() * 10 ** (-50 / 20))[0]; end = min(mix.shape[1], idx[-1] + int(.1 * SR)); mix = mix[:, :end]
    f = int(.3 * SR); mix[:, -f:] *= np.linspace(1, 0, f)
    hit = dict(fanfare=.54, sparkle=.75, tada=.6, drumhit=1.75, happyup=.72, outrodown=.7, worship=0.0, african=1.1, funny=1.0, suspense=2.4, holiday=1.26)[kind]
    return mix, bpm, 4, dict(sections=[('sting', 0.0)], drops=[hit], end=round(mix.shape[1] / SR, 3))

# ---------------- catalogue ----------------
TRACKS = []
def add(id_, name, cat, tags, fn, *a):
    TRACKS.append(dict(id=id_, name=name, cat=cat, tags=tags, fn=fn, args=a))
def slug(s):
    import re, unicodedata; s = unicodedata.normalize('NFKD', s).encode('ascii', 'ignore').decode(); return re.sub(r'[^a-z0-9]+', '-', s.lower().replace('’', '')).strip('-')
NAMES = {
 'happy': [('Sunshine Skip', ['sunny', 'skip', 'cheerful']), ('Lemonade Stand', ['summer', 'cheerful']), ('Jelly Bean Jamboree', ['party', 'sweets']), ('Rainbow Ride', ['rainbow', 'colours']),
           ('Puddle Splash', ['rain', 'play']), ('Kite Day', ['wind', 'outdoors']), ('Giggle Garden', ['garden', 'giggle']), ('Bouncy Castle', ['bounce', 'party']), ('Happy Feet Parade', ['parade', 'march', 'dance']),
           ('Picnic Party', ['picnic', 'family']), ('Playground Pals', ['friends', 'school']), ('Cupcake Sprinkles', ['baking', 'sweet']), ('Balloon Breeze', ['balloons', 'birthday']), ('Morning Smiles', ['morning', 'vlog']),
           ('Hooray Hooray', ['celebrate', 'win']), ('Busy Little Bees', ['bees', 'busy', 'nature'])],
 'calm': [('Gentle Brook', ['water', 'peaceful']), ('Soft Clouds', ['sky', 'dreamy']), ('Morning Prayer', ['prayer', 'devotion']), ('Quiet Garden', ['garden', 'reading']), ('Little Lamb Fields', ['lamb', 'shepherd']),
          ('Starlit Lake', ['night', 'stars']), ('Peaceful Valley', ['valley', 'nature']), ('Feather Float', ['light', 'gentle']), ('Golden Hour', ['sunset', 'warm']), ('Breath of Peace', ['peace', 'relax'])],
 'lullaby': [('Moonbeam Cradle', ['moon', 'baby']), ('Sleepy Bear', ['bear', 'sleep']), ('Firefly Waltz', ['firefly', 'waltz']), ('Dreamboat', ['dream', 'boat']), ('Hush Now', ['hush', 'quiet']),
             ('Twinkling Nursery', ['nursery', 'stars']), ('Counting Sheep', ['sheep', 'sleep']), ('Pillow Clouds', ['clouds', 'soft']), ('Night Light', ['night', 'cosy']), ('Sweet Dreams Little One', ['dreams', 'baby'])],
 'worship': [('Hallelujah Sunday', ['praise', 'church']), ('Morning Praise', ['praise', 'morning']), ('Grace Upon Grace', ['grace', 'hymn']), ('Joyful Noise', ['psalm 100', 'praise']), ('Shepherd Psalm', ['psalm 23', 'shepherd']),
             ('Heavenly Choir', ['choir', 'angels']), ('Clap for the King', ['clap', 'king', 'praise']), ('Promise Rainbow', ['noah', 'promise'])],
 'adventure': [('Treasure Map', ['treasure', 'pirates']), ('Dragon Mountain', ['dragon', 'mountain', 'fantasy']), ('Jungle Expedition', ['jungle', 'explore']), ('Brave Knights', ['knights', 'castle']),
               ('Sky Pirates', ['pirates', 'flying']), ('Desert Caravan', ['desert', 'camels', 'journey']), ('Lion’s Den Courage', ['daniel', 'lion', 'brave']), ('Shepherd Boy’s Sling', ['david', 'goliath', 'hero']),
               ('Red Sea Crossing', ['moses', 'exodus', 'epic']), ('Rocket to the Stars', ['space', 'rocket']), ('Hidden Temple', ['temple', 'explore']), ('The Big Quest', ['quest', 'journey'])],
 'funny': [('Wobbly Jelly', ['wobble', 'silly']), ('Banana Peel Slip', ['slip', 'comedy']), ('Tickle Monster', ['tickle', 'monster']), ('Sneaky Cat', ['cat', 'sneak']), ('Clumsy Clown', ['clown', 'circus']),
           ('Pogo Penguin', ['penguin', 'bounce']), ('Hiccup Hop', ['hiccup', 'hop']), ('Silly Goose Chase', ['goose', 'chase']), ('Rubber Duck Race', ['duck', 'bath']), ('Bubble Gum Pop', ['bubble', 'pop'])],
 'suspense': [('Who Took the Cookie?', ['mystery', 'cookie']), ('Dark Forest', ['forest', 'night']), ('Mystery Box', ['mystery', 'surprise']), ('Creaky Stairs', ['spooky', 'house']), ('Shadow Steps', ['sneak', 'shadow']),
              ('Detective Pup', ['detective', 'dog']), ('Ticking Clock', ['clock', 'hurry']), ('Into the Cave', ['cave', 'explore']), ('Goliath Approaches', ['goliath', 'giant', 'tension']), ('Storm Is Coming', ['storm', 'jonah'])],
 'african': [('Savanna Sunrise', ['savanna', 'morning']), ('Market Day', ['market', 'busy']), ('Kalimba Dreams', ['kalimba', 'thumb piano']), ('Highlife Happy', ['highlife', 'dance', 'ghana']), ('Drum Circle', ['drums', 'djembe']),
             ('Village Dance', ['village', 'dance']), ('Baobab Breeze', ['baobab', 'tree']), ('Lagos Morning', ['nigeria', 'city']), ('Rhythm of the River', ['river', 'rhythm']), ('Ubuntu Together', ['together', 'friends']),
             ('Harvest Celebration', ['harvest', 'thanksgiving']), ('Jollof Party', ['party', 'food'])],
 'holiday': [('Snowflake Waltz', ['winter', 'snow', 'christmas']), ('Gingerbread Shuffle', ['christmas', 'baking']), ('Easter Morning Joy', ['easter', 'resurrection']), ('Harvest Thanks', ['thanksgiving', 'harvest']),
             ('Birthday Bounce', ['birthday', 'party']), ('New Year Countdown', ['new year', 'celebrate'])],
}
OPTS = {'Firefly Waltz': dict(beats=3), 'Snowflake Waltz': dict(beats=3, drums='k...j...j...'), 'Kalimba Dreams': dict(lead='kalimba', acc='kalimba', accst='kalimba'), 'Drum Circle': dict(drums='dbnpdbnpdbnndbpp', lead='balafon'),
        'Heavenly Choir': dict(lead='choir', acc='organ', accst='block', drums=''), 'Clap for the King': dict(drums='k...c...k.k.c...'), 'Gingerbread Shuffle': dict(drums='kjjjsjjjkjjjsjjj'),
        'Sneaky Cat': dict(lead='pizz', accst='stab'), 'Ticking Clock': dict(drums='w.r.w.r.w.r.w.r.'), 'Goliath Approaches': dict(drums='T...T...T...T.TT', lead='strings'),
        'Rocket to the Stars': dict(lead='celesta', acc='pad', accst='block'), 'Easter Morning Joy': dict(lead='brass', acc='organ', accst='block'), 'Highlife Happy': dict(lead='steel', acc='pluck', accst='stab'),
        'Lagos Morning': dict(lead='brass', acc='epiano', accst='stab'), 'Hush Now': dict(beats=3), 'Counting Sheep': dict(beats=3), 'Sleepy Bear': dict(beats=4)}
def catalogue():
    seed = 100
    for cat, lst in NAMES.items():
        for name, tags in lst:
            seed += 1; add(slug(name), name, cat, tags + ['original'], 'compose', seed, cat, OPTS.get(name))
    P = [('doxology', 'Doxology (Old Hundredth, organ)', 'worship', ['hymn', 'praise', 'traditional', 'church'], dict(bpm=84, lead='organ', lead2='choir', acc=('organ', 'block'), bass=('bass', 'half'), pad='strings', reps=2, verb=.38)),
         ('doxology', 'Doxology (kids band)', 'worship', ['hymn', 'praise', 'traditional', 'kids'], dict(bpm=112, lead='glock', lead2='flute', acc=('pluck', 'strum'), bass=('bass', 'walk'), drums='k...c...k.k.c...', reps=3, shift=2)),
         ('saints', 'When the Saints Go Marching In', 'worship', ['spiritual', 'march', 'traditional', 'brass'], dict(bpm=118, lead='brass', lead2='whistle', acc=('piano', 'stab'), bass=('tuba', 'oompah'), drums='k.h.s.h.k.h.s.hh', reps=3)),
         ('michael', 'Michael, Row the Boat Ashore', 'worship', ['spiritual', 'boat', 'traditional', 'folk'], dict(bpm=96, lead='flute', lead2='choir', acc=('pluck', 'strum'), bass=('bass', 'half'), drums='k...z...k...z...', reps=3, shift=-2)),
         ('silentnight', 'Silent Night', 'holiday', ['christmas', 'carol', 'traditional', 'calm'], dict(bpm=84, lead='celesta', lead2='choir', acc=('harp', 'arp'), bass=('bass', 'root'), pad='strings', reps=2, verb=.4)),
         ('jinglebells', 'Jingle Bells', 'holiday', ['christmas', 'sleigh', 'traditional'], dict(bpm=126, lead='glock', lead2='brass', acc=('piano', 'stab'), bass=('bass', 'walk'), drums='kjjjsjjjkjjjsjjj', drums_all=True, reps=2)),
         ('wewish', 'We Wish You a Merry Christmas', 'holiday', ['christmas', 'carol', 'traditional'], dict(bpm=150, lead='celesta', lead2='brass', acc=('strings', 'waltz'), bass=('tuba', 'oompah'), drums='k...j...j...', reps=3)),
         ('deckthehalls', 'Deck the Halls', 'holiday', ['christmas', 'carol', 'traditional'], dict(bpm=120, lead='flute', lead2='glock', acc=('pluck', 'strum'), bass=('bass', 'walk'), drums='k.j.s.j.k.j.s.j.', reps=2, oct=1)),
         ('frerejacques', 'Frère Jacques (round)', 'funny', ['round', 'nursery', 'traditional'], dict(bpm=112, lead='marimba', lead2='pizz', acc=('pizz', 'stab'), bass=('bassoon', 'oompah'), drums='k.w.s.w.k.w.s.w.', reps=3, oct=1)),
         ('marylamb', 'Mary Had a Little Lamb', 'funny', ['nursery', 'lamb', 'traditional'], dict(bpm=116, lead='whistle', lead2='glock', acc=('accordion', 'stab'), bass=('tuba', 'oompah'), drums='k.w.s.w.k.w.s.w.', reps=3, oct=1)),
         ('oldmacdonald', 'Old MacDonald Had a Farm', 'funny', ['farm', 'animals', 'nursery', 'traditional'], dict(bpm=120, lead='bassoon', lead2='whistle', acc=('pluck', 'strum'), bass=('tuba', 'oompah'), drums='k.h.s.h.k.h.s.h.', reps=2)),
         ('londonbridge', 'London Bridge', 'funny', ['nursery', 'bridge', 'traditional'], dict(bpm=120, lead='glock', lead2='pizz', acc=('marimba', 'stab'), bass=('bass', 'walk'), drums='k.w.s.w.k.w.s.w.', reps=3, oct=1))]
    for k, (pid, name, cat, tags, ins) in enumerate(P): add(slug(name), name, cat, tags + ['public domain melody'], 'pd', pid, 300 + k, ins)
    ST = [('fanfare', 'Intro fanfare'), ('sparkle', 'Intro sparkle'), ('tada', 'Ta-da reveal'), ('drumhit', 'Drum intro'), ('happyup', 'Happy intro'), ('outrodown', 'Outro twinkle'),
          ('worship', 'Amen outro'), ('african', 'African drum intro'), ('funny', 'Funny bumper'), ('suspense', 'Suspense sting'), ('holiday', 'Holiday bells intro')]
    for k, (kind, nm) in enumerate(ST):
        for v in (1, 2): add(slug(nm) + f'-{v}', f'{nm} {v}', 'jingles', ['stinger', 'intro' if 'utro' not in nm else 'outro', kind, 'original'], 'sting', kind, 500 + 10 * k + v)
    return TRACKS
def render_one(tr):
    import soundfile as sf
    f = f'{OUT}/{tr["id"]}.wav'
    if tr['fn'] == 'compose': x, bpm, beats, info = compose(*tr['args'])
    elif tr['fn'] == 'pd': x, bpm, beats, info = arrange_pd(PD[tr['args'][0]], tr['args'][1], tr['args'][2])
    else: x, bpm, beats, info = stinger(*tr['args'])
    x = norm(fade(x, .002, .05)); sf.write(f, x.T, SR, subtype='PCM_16')
    return dict(id=tr['id'], name=tr['name'], cat=tr['cat'], kind='music', tags=tr['tags'], bpm=bpm, meter=beats, offset=0.0, dur=round(x.shape[1] / SR, 2),
                sections=info['sections'], drops=info['drops'], music_end=info['end'])
if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True); cat_ = catalogue(); nw = int(sys.argv[2]) if len(sys.argv) > 2 else 4; only = set(sys.argv[3:])
    todo = [t for t in cat_ if not only or t['id'] in only]
    from multiprocessing import Pool
    res = []
    with Pool(nw) as pool:
        for i, it in enumerate(pool.imap_unordered(render_one, todo)): res.append(it); print(f'{i + 1}/{len(todo)}', it['id'], it['dur'], 's', it['bpm'], 'bpm', flush=True)
    order = {t['id']: k for k, t in enumerate(cat_)}; res.sort(key=lambda r: order[r['id']])
    json.dump(res, open(f'{OUT}/items-music2.json' if not only else f'{OUT}/items-partial.json', 'w'), indent=0, ensure_ascii=False)
    print('made', len(res))

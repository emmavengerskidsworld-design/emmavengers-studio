"""Audio test fixtures: a real spoken sentence (Kokoro af_heart, made offline here) with pauses, then the same with
added background noise (pink-ish hiss + 50 Hz hum + rumble); a steady 220 Hz tone; a fake microphone file."""
import numpy as np, soundfile as sf, subprocess
from pathlib import Path
FX = Path(__file__).resolve().parent / 'fixtures'; SR = 48000; rng = np.random.default_rng(7)
def rs(a, sr):  # resample to 48k via ffmpeg
    sf.write('/tmp/_a.wav', a, sr); subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', '/tmp/_a.wav', '-ar', str(SR), '/tmp/_b.wav'], check=True); return sf.read('/tmp/_b.wav')[0]
from kokoro_onnx import Kokoro
k = Kokoro('/workspace/kok/kokoro-v1.0.int8.onnx', '/workspace/kok/voices-v1.0.bin')
parts = []
for t in ["Jesus loves the little children.", "All the children of the world.", "Red and yellow, black and white, they are precious in his sight."]:
    a, sr = k.create(t, voice='af_heart', speed=0.9, lang='en-us'); parts += [rs(a, sr), np.zeros(int(0.6 * SR))]
clean = np.concatenate([np.zeros(int(0.8 * SR))] + parts).astype(np.float32); clean *= 0.25 / np.max(np.abs(clean))
n = len(clean); w = rng.standard_normal(n); b = np.cumsum(w); b -= np.convolve(b, np.ones(200) / 200, 'same')   # brown-ish rumble
pink = np.convolve(w, np.ones(3) / 3, 'same'); t = np.arange(n) / SR
noise = 0.012 * pink + 0.004 * b / (np.std(b) + 1e-9) + 0.006 * np.sin(2 * np.pi * 50 * t) + 0.003 * np.sin(2 * np.pi * 150 * t)
sf.write(FX / 'voice_clean.wav', clean, SR, subtype='PCM_16'); sf.write(FX / 'voice_noisy.wav', (clean + noise).astype(np.float32), SR, subtype='PCM_16')
tone = 0.4 * np.sin(2 * np.pi * 220 * np.arange(4 * SR) / SR) + 0.15 * np.sin(2 * np.pi * 440 * np.arange(4 * SR) / SR)
sf.write(FX / 'tone220.wav', tone.astype(np.float32), SR, subtype='PCM_16')
# fake mic: 660 Hz beeps (0.5 s on / 0.25 s off) for 20 s, mono 48k
tm = np.arange(20 * SR) / SR; mic = 0.3 * np.sin(2 * np.pi * 660 * tm) * ((tm % 0.75) < 0.5)
sf.write(FX / 'mic660.wav', mic.astype(np.float32), SR, subtype='PCM_16')
print('fixtures ok', n / SR)

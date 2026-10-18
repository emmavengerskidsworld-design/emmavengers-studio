"""Fixtures for tests/test_pro.py (Batch 5 pro tools). python3 tests/make_pro_fixtures.py
- quad.png  800x600: four coloured quarters (TL red, TR green, BL blue, BR white) -> crop / flip / rotate checks
- mid.png   800x600 flat (100,150,200): blend-mode overlay
- gs.mp4    720x1280 3 s: green screen (#00b140, with a darker green shadow band) + orange disc subject, 440 Hz sound
- ramp.mp4  640x360 3 s 30 fps: white bar whose x position = time, sound = rising chirp 300 -> 1200 Hz (reverse checks)
- tone.mp4  640x360 4 s 30 fps: bar = time, steady 440 Hz (speed curve: duration, pitch kept, sync)"""
import subprocess, numpy as np, wave
from pathlib import Path
from PIL import Image
FX = Path(__file__).parent / 'fixtures'; FX.mkdir(exist_ok=True)
SR = 48000
def wav(path, y):
    y = (np.clip(y, -1, 1) * 32767).astype('<i2'); w = wave.open(str(path), 'wb'); w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(y.tobytes()); w.close()
def video(name, frames, W, H, audio, fps=30):
    a = FX / (name + '.wav'); wav(a, audio)
    p = subprocess.Popen(['ffmpeg', '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(fps), '-i', '-', '-i', str(a),
                          '-c:v', 'libx264', '-preset', 'medium', '-crf', '14', '-pix_fmt', 'yuv420p', '-g', '30', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', str(FX / (name + '.mp4'))], stdin=subprocess.PIPE)
    for f in frames: p.stdin.write(f.astype(np.uint8).tobytes())
    p.stdin.close(); p.wait(); a.unlink()

q = np.zeros((600, 800, 3), np.uint8); q[:300, :400] = (230, 30, 30); q[:300, 400:] = (30, 200, 60); q[300:, :400] = (40, 60, 230); q[300:, 400:] = (245, 245, 245)
Image.fromarray(q).save(FX / 'quad.png')
Image.new('RGB', (800, 600), (100, 150, 200)).save(FX / 'mid.png')   # flat colour for blend-mode maths

def gs():
    W, H, N = 720, 1280, 90; yy, xx = np.mgrid[0:H, 0:W]
    for i in range(N):
        f = np.zeros((H, W, 3)); f[:] = (0, 177, 64)
        sh = (yy > 900) & (yy < 1100); f[sh] = (0, 110, 40)                       # shadow on the green screen
        f[1150:1250, 40:140] = (150, 200, 90)                                       # greenish "spill" patch (not keyed, de-spilled)
        cx, cy = 260 + i * 2.5, 560; d = (xx - cx) ** 2 + (yy - cy) ** 2 < 170 ** 2; f[d] = (240, 140, 40)   # subject
        yield f
t = np.arange(int(3 * SR)) / SR
video('gs', gs(), 720, 1280, 0.3 * np.sin(2 * np.pi * 440 * t))

def bars(N, W=640, H=360):
    for i in range(N):
        f = np.full((H, W, 3), 30, np.uint8); x = int(round(i / (N - 1) * (W - 40))); f[:, x:x + 40] = 255; f[:40, :] = (200, 60, 60); yield f
f0, f1, T = 300, 1200, 3.0; ph = 2 * np.pi * (f0 * t + (f1 - f0) * t * t / (2 * T))
video('ramp', bars(90), 640, 360, 0.35 * np.sin(ph))
t4 = np.arange(int(4 * SR)) / SR
video('tone', bars(120), 640, 360, 0.35 * np.sin(2 * np.pi * 440 * t4))
print('ok', [p.name for p in FX.glob('*') if p.stem in ('quad', 'mid', 'gs', 'ramp', 'tone')])

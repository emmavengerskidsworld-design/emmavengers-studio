"""Our own sticker designs (CC0, made from scratch as SVG maths, no AI): arrows, stars / hearts / sparkles, frames,
speech bubbles, shapes, and 3D number digits (drawn by Studio's own text engine in the Luckiest Guy font).
Rasterised in Chrome (Playwright) to transparent WebP: lib/stickers/art/<cat>/<id>.webp + tools/stickers/art.json.
python3 tools/stickers/make_art.py"""
import json, math, asyncio, base64, functools, http.server, threading, io
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parents[2]; OUT = ROOT / 'lib/stickers/art'
C = {'red': ('#ff6b6b', '#d91f3a', '#7a0a1a'), 'orange': ('#ffb347', '#ff7a00', '#7a3300'), 'yellow': ('#fff07a', '#ffc400', '#7a5200'), 'green': ('#8ef08a', '#22b04b', '#0b4d1e'),
     'blue': ('#8fd8ff', '#1f7bff', '#0b2a66'), 'purple': ('#d6a6ff', '#8a3ffc', '#2e0b5c'), 'pink': ('#ffb3d9', '#ff4fa3', '#6b0b3e'), 'white': ('#ffffff', '#dfe7f0', '#3a4a5c'), 'gold': ('#fff3b0', '#e0a800', '#6b4300')}
def defs(col, gid='g'):
    a, b, d = C[col]
    return f'''<defs><linearGradient id="{gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{a}"/><stop offset="1" stop-color="{b}"/></linearGradient>
<radialGradient id="{gid}h" cx=".35" cy=".25" r=".6"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>'''
def svg(body, vb=256): return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {vb} {vb}" width="{vb}" height="{vb}">{body}</svg>'
def solid(path, col, sw=10, shine=True, extra=''):
    a, b, d = C[col]
    return svg(defs(col) + f'<g stroke-linejoin="round" stroke-linecap="round"><path d="{path}" fill="{d}" transform="translate(0 9)"/><path d="{path}" fill="url(#g)" stroke="{d}" stroke-width="{sw}"/>' + (f'<path d="{path}" fill="url(#gh)"/>' if shine else '') + extra + '</g>')
def star_pts(cx, cy, n, r1, r2, rot=-90):
    return ' '.join(f'{cx + (r1 if i % 2 == 0 else r2) * math.cos(math.radians(rot + i * 180 / n)):.1f},{cy + (r1 if i % 2 == 0 else r2) * math.sin(math.radians(rot + i * 180 / n)):.1f}' for i in range(2 * n))
def poly(pts): return 'M' + ' L'.join(pts.split()) + ' Z'
def rpoly(n, r=100, cx=128, cy=124, rot=-90): return 'M' + ' L'.join(f'{cx + r * math.cos(math.radians(rot + i * 360 / n)):.1f},{cy + r * math.sin(math.radians(rot + i * 360 / n)):.1f}' for i in range(n)) + ' Z'
HEART = 'M128 222 C 60 170 18 130 18 84 C 18 50 44 26 76 26 C 100 26 118 40 128 60 C 138 40 156 26 180 26 C 212 26 238 50 238 84 C 238 130 196 170 128 222 Z'
ITEMS = []
def add(cat, id, name, s, tags='', anim=None): ITEMS.append({'cat': cat, 'id': id, 'name': name, 'svg': s, 'tags': tags.split(), 'anim': anim})
# ---- arrows
ARROW = 'M20 100 H150 V52 L236 128 L150 204 V156 H20 Z'
for i, col in enumerate(['red', 'yellow', 'blue', 'green', 'pink', 'white']):
    add('arrows', f'arrow-{col}', f'{col.title()} arrow', solid(ARROW, col), 'arrow right point', 'hop' if i == 0 else None)
add('arrows', 'arrow-down', 'Down arrow', svg(defs('orange') + f'<g transform="rotate(90 128 128)"><path d="{ARROW}" fill="#7a3300" transform="translate(-9 0)"/><path d="{ARROW}" fill="url(#g)" stroke="#7a3300" stroke-width="10" stroke-linejoin="round"/><path d="{ARROW}" fill="url(#gh)"/></g>'), 'arrow down point', 'float')
add('arrows', 'arrow-curve', 'Curved arrow', svg(defs('purple') + '<path d="M40 200 C 40 110 100 70 176 74" fill="none" stroke="#2e0b5c" stroke-width="40" stroke-linecap="round"/><path d="M40 200 C 40 110 100 70 176 74" fill="none" stroke="url(#g)" stroke-width="24" stroke-linecap="round"/><path d="M160 30 L236 76 L164 126 Z" fill="url(#g)" stroke="#2e0b5c" stroke-width="10" stroke-linejoin="round"/>'), 'arrow curve turn')
add('arrows', 'arrow-double', 'Double arrow', solid('M8 128 L72 64 V100 H184 V64 L248 128 L184 192 V156 H72 V192 Z', 'green'), 'arrow both left right')
add('arrows', 'arrow-squiggle', 'Squiggle arrow', svg('<path d="M24 170 C 60 90 90 210 128 130 S 180 80 200 96" fill="none" stroke="#1b1b2f" stroke-width="16" stroke-linecap="round"/><path d="M178 60 L232 100 L170 128" fill="none" stroke="#1b1b2f" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/><path d="M24 170 C 60 90 90 210 128 130 S 180 80 200 96" fill="none" stroke="#ffcc33" stroke-width="7" stroke-linecap="round"/>'), 'arrow hand drawn doodle', 'sway')
add('arrows', 'arrow-circle', 'Circle arrow', svg(defs('blue') + '<path d="M196 128 A 68 68 0 1 1 168 72" fill="none" stroke="#0b2a66" stroke-width="40" stroke-linecap="round"/><path d="M196 128 A 68 68 0 1 1 168 72" fill="none" stroke="url(#g)" stroke-width="24" stroke-linecap="round"/><path d="M140 30 L214 58 L170 118 Z" fill="url(#g)" stroke="#0b2a66" stroke-width="10" stroke-linejoin="round"/>'), 'arrow round again repeat', 'spinLoop')
add('arrows', 'chevrons', 'Chevrons', svg(''.join(f'<path d="M{40 + i * 60} 60 L{100 + i * 60} 128 L{40 + i * 60} 196" fill="none" stroke="{c}" stroke-width="30" stroke-linecap="round" stroke-linejoin="round"/>' for i, c in enumerate(['#ffe07a', '#ffb347', '#ff6b6b']))), 'arrow chevron next go', 'shine')
add('arrows', 'pointer-hand', 'Tap here', svg(defs('white') + '<circle cx="104" cy="76" r="38" fill="none" stroke="#ffcc33" stroke-width="10" opacity=".9"/><path d="M96 70 V170 L76 150 C 64 140 48 150 58 166 L104 230 H190 C 200 200 206 176 206 150 V122 C 206 108 186 106 184 120 C 184 104 164 102 162 116 C 162 100 140 98 140 112 V70 C 140 46 96 46 96 70 Z" fill="url(#g)" stroke="#3a4a5c" stroke-width="10" stroke-linejoin="round"/>'), 'hand tap click finger point', 'pulse')
# ---- stars, hearts, sparkles
for col, anim in [('yellow', 'pulse'), ('gold', None), ('pink', None), ('blue', None), ('purple', None)]:
    add('stars', f'star-{col}', f'{col.title()} star', solid(poly(star_pts(128, 132, 5, 116, 50)), col, 12), 'star', anim)
add('stars', 'star-face', 'Happy star', solid(poly(star_pts(128, 132, 5, 116, 52)), 'yellow', 12, extra='<circle cx="104" cy="122" r="10" fill="#3a2600"/><circle cx="152" cy="122" r="10" fill="#3a2600"/><path d="M104 152 Q128 176 152 152" fill="none" stroke="#3a2600" stroke-width="9" stroke-linecap="round"/><circle cx="90" cy="148" r="9" fill="#ff8a8a" opacity=".7"/><circle cx="166" cy="148" r="9" fill="#ff8a8a" opacity=".7"/>'), 'star face happy smile', 'jelly')
for col, anim in [('red', 'heartbeat'), ('pink', 'heartbeat'), ('purple', None), ('orange', None)]:
    add('stars', f'heart-{col}', f'{col.title()} heart', solid(HEART, col, 12), 'heart love', anim)
add('stars', 'heart-outline', 'Heart outline', svg(f'<path d="{HEART}" fill="none" stroke="#ff4fa3" stroke-width="22" stroke-linejoin="round"/>'), 'heart love outline')
add('stars', 'hearts-two', 'Two hearts', svg(defs('red') + f'<g transform="translate(12 30) scale(.62)"><path d="{HEART}" fill="url(#g)" stroke="#7a0a1a" stroke-width="16"/></g><g transform="translate(96 70) scale(.6) rotate(14 128 128)"><path d="{HEART}" fill="#ff7ac8" stroke="#6b0b3e" stroke-width="16"/></g>'), 'hearts love two', 'float')
SP = lambda cx, cy, r, w: f'M{cx} {cy - r} C {cx + w} {cy - w} {cx + w} {cy - w} {cx + r} {cy} C {cx + w} {cy + w} {cx + w} {cy + w} {cx} {cy + r} C {cx - w} {cy + w} {cx - w} {cy + w} {cx - r} {cy} C {cx - w} {cy - w} {cx - w} {cy - w} {cx} {cy - r} Z'
add('stars', 'sparkle', 'Sparkle', solid(SP(128, 128, 116, 18), 'yellow', 8), 'sparkle shine twinkle', 'shine')
add('stars', 'sparkles', 'Sparkles', svg(defs('yellow') + ''.join(f'<path d="{SP(x, y, r, r * .16)}" fill="url(#g)" stroke="#7a5200" stroke-width="6" stroke-linejoin="round"/>' for x, y, r in [(100, 120, 84), (196, 64, 44), (192, 192, 34)])), 'sparkles shine twinkle magic', 'pulse')
add('stars', 'sparkle-white', 'White twinkle', svg('<defs><radialGradient id="w"><stop offset="0" stop-color="#fff"/><stop offset=".3" stop-color="#fff" stop-opacity=".8"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><circle cx="128" cy="128" r="70" fill="url(#w)"/>' + f'<path d="{SP(128, 128, 120, 10)}" fill="#fff"/>'), 'twinkle shine glint white', 'blink')
add('stars', 'shooting-star', 'Shooting star', svg(defs('yellow') + '<path d="M20 230 L150 110" stroke="#ffb3d9" stroke-width="26" stroke-linecap="round" opacity=".7"/><path d="M50 236 L160 130" stroke="#8fd8ff" stroke-width="14" stroke-linecap="round" opacity=".8"/>' + f'<g transform="translate(70 -40) scale(.68)"><path d="{poly(star_pts(128, 132, 5, 116, 50))}" fill="url(#g)" stroke="#7a5200" stroke-width="14" stroke-linejoin="round"/></g>'), 'shooting star wish', 'fly' if False else 'float')
add('stars', 'burst-star', 'Wow burst', solid(poly(star_pts(128, 128, 14, 120, 88)), 'orange', 8), 'burst wow pow boom', 'pulse')
add('stars', 'moon-star', 'Moon & star', svg(defs('yellow') + '<path d="M150 24 A 104 104 0 1 0 232 168 A 84 84 0 1 1 150 24 Z" fill="url(#g)" stroke="#7a5200" stroke-width="10" stroke-linejoin="round"/>' + f'<g transform="translate(140 30) scale(.32)"><path d="{poly(star_pts(128, 132, 5, 116, 50))}" fill="#fff07a" stroke="#7a5200" stroke-width="22" stroke-linejoin="round"/></g>'), 'moon star night sleep', 'rock')
add('stars', 'sun', 'Happy sun', svg(defs('yellow') + ''.join(f'<path d="M128 6 L140 40 L116 40 Z" fill="#ffb300" transform="rotate({a} 128 128)"/>' for a in range(0, 360, 30)) + '<circle cx="128" cy="128" r="76" fill="url(#g)" stroke="#7a5200" stroke-width="10"/><circle cx="104" cy="118" r="9" fill="#3a2600"/><circle cx="152" cy="118" r="9" fill="#3a2600"/><path d="M100 146 Q128 172 156 146" fill="none" stroke="#3a2600" stroke-width="9" stroke-linecap="round"/>'), 'sun sunny happy day', 'spinLoop')
add('stars', 'rainbow', 'Rainbow', svg(''.join(f'<path d="M{20 + i * 14} 200 A {108 - i * 14} {108 - i * 14} 0 0 1 {236 - i * 14} 200" fill="none" stroke="{c}" stroke-width="15"/>' for i, c in enumerate(['#ff4d4d', '#ff9f1c', '#ffe600', '#3ddc84', '#1fb6ff', '#a259ff'])) + '<g fill="#fff" stroke="#c9d6e6" stroke-width="5"><circle cx="34" cy="204" r="22"/><circle cx="58" cy="210" r="18"/><circle cx="222" cy="204" r="22"/><circle cx="198" cy="210" r="18"/></g>'), 'rainbow colours weather', 'breathe')
add('stars', 'cloud', 'Cloud', svg(defs('white') + '<path d="M60 190 C 24 190 18 140 54 132 C 52 92 102 80 118 108 C 132 64 200 70 198 120 C 236 118 244 190 200 190 Z" fill="url(#g)" stroke="#9bb3cc" stroke-width="10" stroke-linejoin="round"/>'), 'cloud sky weather', 'float')
add('stars', 'lightning', 'Lightning', solid('M150 10 L52 142 H118 L92 246 L204 100 H136 L170 10 Z', 'yellow', 10), 'lightning bolt flash zap power', 'blink')
add('stars', 'crown', 'Crown', solid('M30 196 L18 70 L82 124 L128 44 L174 124 L238 70 L226 196 Z', 'gold', 10, extra='<circle cx="128" cy="160" r="14" fill="#ff4fa3" stroke="#6b4300" stroke-width="6"/><circle cx="76" cy="166" r="10" fill="#1fb6ff" stroke="#6b4300" stroke-width="5"/><circle cx="180" cy="166" r="10" fill="#3ddc84" stroke="#6b4300" stroke-width="5"/>'), 'crown king queen prince princess', 'swingLoop')
# ---- frames (transparent middle)
def frame(id, name, outer, inner, col, extra='', tags='frame border'):
    a, b, d = C[col]
    add('frames', id, name, svg(defs(col) + f'<path d="{outer} {inner}" fill-rule="evenodd" fill="url(#g)" stroke="{d}" stroke-width="6"/>' + extra, 512), tags)
rect = lambda x, y, w, h, r: f'M{x + r} {y} H{x + w - r} A{r} {r} 0 0 1 {x + w} {y + r} V{y + h - r} A{r} {r} 0 0 1 {x + w - r} {y + h} H{x + r} A{r} {r} 0 0 1 {x} {y + h - r} V{y + r} A{r} {r} 0 0 1 {x + r} {y} Z'
frame('frame-yellow', 'Sunny frame', rect(8, 8, 496, 496, 60), rect(52, 52, 408, 408, 30), 'yellow')
frame('frame-blue', 'Sky frame', rect(8, 8, 496, 496, 60), rect(52, 52, 408, 408, 30), 'blue')
frame('frame-pink', 'Candy frame', rect(8, 8, 496, 496, 60), rect(52, 52, 408, 408, 30), 'pink', ''.join(f'<circle cx="{x}" cy="{y}" r="12" fill="#fff"/>' for x, y in [(30, 256), (482, 256), (256, 30), (256, 482), (30, 30), (482, 30), (30, 482), (482, 482)]))
frame('frame-gold', 'Gold frame', rect(8, 8, 496, 496, 24), rect(60, 60, 392, 392, 8), 'gold', '<path d="' + rect(34, 34, 444, 444, 16) + '" fill="none" stroke="#6b4300" stroke-width="4" stroke-dasharray="14 10"/>')
frame('frame-polaroid', 'Photo card', rect(28, 16, 456, 480, 14), rect(64, 52, 384, 340, 4), 'white', '<text x="256" y="452" font-family="Comic Sans MS, sans-serif" font-size="40" text-anchor="middle" fill="#8aa0b8">my picture</text>')
frame('frame-circle', 'Circle frame', 'M256 8 A248 248 0 1 1 255.9 8 Z', 'M256 60 A196 196 0 1 0 256.1 60 Z', 'green')
frame('frame-heart', 'Heart frame', 'M256 500 C 110 390 10 300 10 180 C 10 90 80 30 160 30 C 210 30 240 60 256 96 C 272 60 302 30 352 30 C 432 30 502 90 502 180 C 502 300 402 390 256 500 Z', 'M256 430 C 140 340 70 270 70 186 C 70 126 112 88 164 88 C 204 88 236 116 256 160 C 276 116 308 88 348 88 C 400 88 442 126 442 186 C 442 270 372 340 256 430 Z', 'red', tags='frame heart love')
frame('frame-star', 'Star frame', poly(star_pts(256, 270, 5, 250, 124)), poly(star_pts(256, 270, 5, 190, 94)), 'yellow', tags='frame star')
add('frames', 'frame-film', 'Film strip', svg('<path fill-rule="evenodd" fill="#1b1b24" d="M0 40 H512 V472 H0 Z M40 96 H472 V416 H40 Z"/>' + ''.join(f'<rect x="{14 + i * 42}" y="{54}" width="24" height="26" rx="5" fill="#fff"/><rect x="{14 + i * 42}" y="{432}" width="24" height="26" rx="5" fill="#fff"/>' for i in range(12)), 512), 'frame film movie cinema')
add('frames', 'frame-tv', 'TV frame', svg(defs('orange') + f'<path fill-rule="evenodd" d="{rect(8, 60, 496, 400, 50)} {rect(56, 104, 400, 312, 30)}" fill="url(#g)" stroke="#7a3300" stroke-width="8"/><path d="M200 60 L150 6 M312 60 L362 6" stroke="#7a3300" stroke-width="14" stroke-linecap="round"/><rect x="120" y="460" width="60" height="30" rx="8" fill="#7a3300"/><rect x="332" y="460" width="60" height="30" rx="8" fill="#7a3300"/>', 512), 'frame tv television screen')
add('frames', 'frame-dots', 'Party lights', svg(''.join(f'<circle cx="{x}" cy="{y}" r="17" fill="{["#ff4d4d", "#ffe600", "#3ddc84", "#1fb6ff", "#a259ff", "#ff9f1c"][i % 6]}" stroke="#fff" stroke-width="5"/>' for i, (x, y) in enumerate([(24 + k * 58, 24) for k in range(9)] + [(488, 24 + k * 58) for k in range(1, 9)] + [(488 - k * 58, 488) for k in range(1, 9)] + [(24, 488 - k * 58) for k in range(1, 8)])), 512), 'frame lights party dots', 'blink')
# ---- speech bubbles (empty: put Text on top)
def bubble(id, name, path, fill='#ffffff', line='#1b1b2f', sw=10, tags='speech bubble talk', extra=''):
    add('bubbles', id, name, svg(f'<path d="{path}" fill="{line}" opacity=".25" transform="translate(6 10)"/><path d="{path}" fill="{fill}" stroke="{line}" stroke-width="{sw}" stroke-linejoin="round"/>' + extra), tags)
bubble('bubble-round', 'Speech bubble', 'M128 22 C 62 22 14 58 14 104 C 14 140 42 168 82 180 L 58 232 L 128 186 C 194 186 242 150 242 104 C 242 58 194 22 128 22 Z')
bubble('bubble-rect', 'Speech box', 'M36 24 H220 Q240 24 240 44 V156 Q240 176 220 176 H112 L60 230 L72 176 H36 Q16 176 16 156 V44 Q16 24 36 24 Z')
bubble('bubble-thought', 'Thought cloud', 'M70 160 C 30 160 20 110 54 98 C 44 56 96 36 118 64 C 134 26 196 34 198 76 C 238 76 248 140 206 150 C 210 184 160 192 146 170 C 128 194 84 190 70 160 Z M52 200 A16 16 0 1 0 52.1 200 Z M28 236 A9 9 0 1 0 28.1 236 Z', tags='thought bubble think cloud')
bubble('bubble-shout', 'Shout!', poly(star_pts(128, 120, 12, 120, 84, -80)), fill='#ffe600', line='#d91f3a', tags='shout bubble wow boom')
bubble('bubble-yellow', 'Yellow bubble', 'M128 22 C 62 22 14 58 14 104 C 14 140 42 168 82 180 L 58 232 L 128 186 C 194 186 242 150 242 104 C 242 58 194 22 128 22 Z', fill='#fff07a', line='#7a5200')
bubble('bubble-blue', 'Blue bubble', 'M36 24 H220 Q240 24 240 44 V156 Q240 176 220 176 H184 L196 230 L144 176 H36 Q16 176 16 156 V44 Q16 24 36 24 Z', fill='#bfe9ff', line='#0b2a66')
bubble('bubble-whisper', 'Whisper', 'M128 30 C 66 30 20 64 20 106 C 20 140 46 166 84 176 L 66 222 L 126 182 C 190 182 236 148 236 106 C 236 64 190 30 128 30 Z', line='#5f7d99', sw=7, tags='whisper quiet bubble', extra='')
bubble('bubble-heart', 'Love note', HEART, fill='#ffd6ea', line='#ff4fa3', tags='love bubble heart note')
bubble('bubble-question', 'Question', 'M128 22 C 62 22 14 58 14 104 C 14 140 42 168 82 180 L 58 232 L 128 186 C 194 186 242 150 242 104 C 242 58 194 22 128 22 Z', fill='#ffffff', line='#8a3ffc', tags='question ask why what bubble', extra='<text x="128" y="140" font-family="Arial Black, sans-serif" font-weight="900" font-size="110" text-anchor="middle" fill="#8a3ffc">?</text>')
bubble('bubble-exclaim', 'Exclaim', poly(star_pts(128, 120, 10, 118, 88, -90)), fill='#ffffff', line='#ff7a00', tags='wow exclaim bubble', extra='<text x="128" y="160" font-family="Arial Black, sans-serif" font-weight="900" font-size="130" text-anchor="middle" fill="#ff7a00">!</text>')
# ---- shapes
SH = [('circle', 'Circle', 'M128 18 A110 110 0 1 1 127.9 18 Z', 'red'), ('square', 'Square', rect(22, 22, 212, 212, 30), 'blue'), ('triangle', 'Triangle', 'M128 18 L240 220 H16 Z', 'green'),
      ('diamond', 'Diamond', 'M128 10 L238 128 L128 246 L18 128 Z', 'purple'), ('hexagon', 'Hexagon', rpoly(6, 112, 128, 128, 0), 'orange'), ('pentagon', 'Pentagon', rpoly(5, 116, 128, 136), 'pink'),
      ('oval', 'Oval', 'M128 50 A118 78 0 1 1 127.9 50 Z', 'yellow'), ('rectangle', 'Rectangle', rect(14, 64, 228, 128, 22), 'green'), ('octagon', 'Octagon', rpoly(8, 114, 128, 128, 22.5), 'red'),
      ('crescent', 'Crescent', 'M160 20 A110 110 0 1 0 236 180 A90 90 0 1 1 160 20 Z', 'yellow'), ('plus', 'Plus', 'M96 18 H160 V96 H238 V160 H160 V238 H96 V160 H18 V96 H96 Z', 'blue'),
      ('ring', 'Ring', 'M128 14 A114 114 0 1 1 127.9 14 Z M128 70 A58 58 0 1 0 128.1 70 Z', 'pink'), ('star6', 'Six star', poly(star_pts(128, 128, 6, 118, 64)), 'gold'),
      ('blob', 'Blob', 'M130 22 C 196 18 240 70 228 130 C 218 190 176 236 118 230 C 60 224 16 180 24 120 C 32 64 70 26 130 22 Z', 'purple'), ('drop', 'Drop', 'M128 14 C 170 80 210 120 210 164 A82 82 0 1 1 46 164 C 46 120 86 80 128 14 Z', 'blue'),
      ('badge', 'Badge', poly(star_pts(128, 128, 18, 120, 104)), 'orange')]
for id, name, path, col in SH: add('shapes', 'shape-' + id, name, solid(path, col, 10).replace('<path d="' + path + '" fill="url', '<path fill-rule="evenodd" d="' + path + '" fill="url'), 'shape ' + id)
add('shapes', 'ribbon-banner', 'Ribbon banner', svg(defs('red') + '<path d="M6 96 H56 V176 H6 L28 136 Z M250 96 H200 V176 H250 L228 136 Z" fill="#7a0a1a"/><path d="M36 70 H220 V160 H36 Z" fill="url(#g)" stroke="#7a0a1a" stroke-width="8"/><path d="M36 70 H220 V100 H36 Z" fill="#fff" opacity=".25"/>'), 'ribbon banner label title')
add('shapes', 'label-tag', 'Label tag', solid('M70 50 H236 V206 H70 L14 128 Z', 'green', 10, extra='<circle cx="64" cy="128" r="14" fill="#fff" stroke="#0b4d1e" stroke-width="6"/>'), 'label tag price')
async def render(items, digits):
    from playwright.async_api import async_playwright
    class Q(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *a): pass
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 8786), functools.partial(Q, directory=str(ROOT))); threading.Thread(target=srv.serve_forever, daemon=True).start()
    async with async_playwright() as p:
        b = await p.chromium.launch(channel='chrome'); pg = await b.new_page(); await pg.goto('http://127.0.0.1:8786/index.html'); await pg.wait_for_function('window.studio && studio.ready', timeout=30000)
        res = {}
        for it in items:
            res[it['id']] = await pg.evaluate("""async s=>{const im=new Image();im.src='data:image/svg+xml;base64,'+btoa(unescape(encodeURIComponent(s)));await im.decode();const N=Math.max(im.naturalWidth,256)>300?512:320;const c=document.createElement('canvas');c.width=c.height=N;c.getContext('2d').drawImage(im,0,0,N,N);return c.toDataURL('image/png')}""", it['svg'])
        # 3D digits with the Studio text engine (Luckiest Guy + 3D styles)
        for d, sty in digits:
            res['digit-' + d] = await pg.evaluate("""async([d,sty])=>{const ts=await import('./js/textstyles.js'),R=await import('./js/render.js'),pj=await import('./js/project.js'),fo=await import('./js/fonts.js');await fo.ensureFont('luckiestguy');
              const c=pj.newClip('text',{dur:3});c.text.content=d;c.text.size=360;ts.applyStyle(c.text,sty);c.text.font='luckiestguy';const cv=document.createElement('canvas');cv.width=cv.height=420;
              R.drawText(cv.getContext('2d'),420,420,c,{x:.5,y:.5,scale:1,rotation:0,opacity:1},0);return cv.toDataURL('image/png')}""", [d, sty])
        await b.close(); srv.shutdown(); return res
DIGITS = [(str(i), s) for i, s in zip(range(10), ['red3d', 'emma3d', 'blue3d', 'green3d', 'purple3d', 'pink3d', 'emma3d', 'blue3d', 'red3d', 'green3d'])] + [('+', 'emma3d'), ('-', 'blue3d'), ('=', 'purple3d'), ('?', 'pink3d'), ('!', 'red3d')]
res = asyncio.run(render(ITEMS, DIGITS)); out = []
def save(id, cat, name, data, tags, anim):
    im = Image.open(io.BytesIO(base64.b64decode(data.split(',')[1]))).convert('RGBA'); bb = im.getchannel('A').getbbox(); im = im.crop(bb) if bb else im
    d = OUT / cat; d.mkdir(parents=True, exist_ok=True); f = d / (id + '.webp'); im.save(f, 'WEBP', quality=90, method=6)
    e = {'cat': cat, 'name': name, 'file': str(f.relative_to(ROOT / 'lib/stickers')), 'w': im.width, 'h': im.height, 'tags': tags, 'lic': 'own'}
    if anim: e['anim'] = anim
    out.append(e)
for it in ITEMS: save(it['id'], it['cat'], it['name'], res[it['id']], it['tags'], it['anim'])
NAMES = {'+': 'Plus', '-': 'Minus', '=': 'Equals', '?': 'Question mark', '!': 'Exclamation mark'}
for d, s in DIGITS: save('digit-' + {'+': 'plus', '-': 'minus', '=': 'equals', '?': 'q', '!': 'ex'}.get(d, d), 'numbers', NAMES.get(d, 'Number ' + d), res['digit-' + d], ['number', 'digit', d, 'count', 'math'], 'hop' if d in '0123456789' and int(d) % 3 == 0 else None)
(Path(__file__).parent / 'art.json').write_text(json.dumps(out, indent=1)); print('DONE', len(out))

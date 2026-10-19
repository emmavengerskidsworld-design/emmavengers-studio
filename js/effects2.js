/* Effects round 2 (Batch 12): 80 more of our own shaders, same rules as effects.js — plain maths, clip-local time t + seed S
   only, so preview == export. Families: kid particles, frames & windows, light & colour, distort, art, retro. */
const fx = (id, name, cat, body) => ({ id, name, cat, body });
export const EFFECT_CATS2 = [['kids', 'Kids'], ['frame', 'Frames']];

/* ---- particles: one shape function, a colour, a drift ---- */
const SHAPES = {
  heart: 'sdHeart(p * 3.2 + vec2(0., .55)) / 3.2',
  star: 'sdStar(p, .24, .45)',
  dot: 'length(p) - .2',
  ring: 'abs(length(p) - .18) - .04',
  gem: '(abs(p.x) * 1.4 + abs(p.y) - .26) * .7',
  plus: 'min(max(abs(p.x) - .06, abs(p.y) - .22), max(abs(p.y) - .06, abs(p.x) - .22))',
  drop: 'max(length(p - vec2(0., -.05)) - .15, 0.) + max(0., (abs(p.x) * 1.3 + p.y * .6 - .1)) * step(-.05, p.y)',
  flower: 'length(p) - .12 - .09 * cos(5. * atan(p.y, p.x))',
  square: 'max(abs(p.x), abs(p.y)) - .16',
  moon: 'max(length(p) - .2, -(length(p - vec2(.09, .05)) - .17))',
  note: 'min(length((p - vec2(-.06, -.12)) * vec2(1., 1.35)) - .1, max(abs(p.x - .03) - .025, abs(p.y - .04) - .17))',
  tri: 'max(abs(p.x) * .866 + p.y * .5, -p.y) - .12',
  flake: 'min(min(max(abs(p.x) - .03, abs(p.y) - .24), max(abs((rot(1.047) * p).x) - .03, abs((rot(1.047) * p).y) - .24)), max(abs((rot(-1.047) * p).x) - .03, abs((rot(-1.047) * p).y) - .24))',
  cloud: 'min(min(length(p - vec2(-.1, 0.)) - .12, length(p - vec2(.1, 0.)) - .11), length(p - vec2(0., .07)) - .14)',
  fly: 'min(length((p - vec2(-.11, .04)) * vec2(1. / (.4 + .6 * abs(sin(t * 9. + e.z * 6.))), 1.)) - .1, length((p - vec2(.11, .04)) * vec2(1. / (.4 + .6 * abs(sin(t * 9. + e.z * 6.))), 1.)) - .1)',
};
const COLS = {
  pink: 'vec3(1., .42, .66)', gold: 'vec3(1., .82, .25)', rainbow: 'hsv(vec3(e.z, .75, 1.))', white: 'vec3(1.)', sky: 'vec3(.55, .82, 1.)',
  candy: 'hsv(vec3(.85 + e.z * .3, .55, 1.))', mint: 'hsv(vec3(.38 + e.z * .15, .55, 1.))', red: 'vec3(1., .22, .3)', purple: 'vec3(.7, .45, 1.)', sun: 'hsv(vec3(.08 + e.z * .07, .8, 1.))',
};
// vel: drift (y > 0 rises), n: cells per unit, dens: 0..1 share of cells with a particle, sway, spin
function parts(id, name, shape, col, { vel = [0, -.12], n = 6, dens = .5, sway = .04, spin = 1, cat = 'kids', glow = 0 } = {}) {
  const v = `vec2(${vel[0].toFixed(3)}, ${vel[1].toFixed(3)})`;
  return fx(id, name, cat, `float SHP(vec2 p, vec4 e){ return ${SHAPES[shape]}; }
vec4 fx(vec2 u){ vec4 c = src(u); vec2 q = u * ASP;
  for (int k = 0; k < 2; k++){ float fk = float(k), n = ${n.toFixed(1)} * (1. + fk * .7);
    vec2 qq = q + vec2(sin(t * 1.3 + q.y * 4. + fk * 2.) * ${sway.toFixed(3)}, 0.);
    vec4 e = cell(qq, n, ${v} * (1. + fk * .35), S + fk * 7.);
    float sc = .7 + .5 * e.w; vec2 p = rot((t * ${spin.toFixed(2)} + e.z * 6.283) * (e.z - .5) * 2.) * e.xy / sc;
    float d = SHP(p, e) * sc, aa = 1.5 * n / R.y * max(ASP.x, ASP.y);
    float a = smoothstep(aa, -aa, d) * step(1. - ${dens.toFixed(2)}, fract(e.w * 7.13 + e.z));
    vec3 col = ${COLS[col]} * (.85 + .25 * smoothstep(.0, -.12, d));
    c = over(c, col, a * A);${glow ? ` c = addl(c, col * exp(-max(d, 0.) * 18.) * .35 * A * step(1. - ${dens.toFixed(2)}, fract(e.w * 7.13 + e.z)));` : ''} }
  return c; }`);
}
const P = [
  parts('heartrain', 'Heart rain', 'heart', 'pink', { vel: [0, -.14] }),
  parts('lovebubbles', 'Love bubbles', 'heart', 'candy', { vel: [0, .1], glow: 1 }),
  parts('risingstars', 'Rising stars', 'star', 'gold', { vel: [0, .12], glow: 1 }),
  parts('rainbowstars', 'Rainbow stars', 'star', 'rainbow', { vel: [.03, -.1] }),
  parts('polkarain', 'Polka dot rain', 'dot', 'rainbow', { vel: [0, -.16], n: 8 }),
  parts('gumballs', 'Gumballs', 'dot', 'candy', { vel: [0, -.25], n: 5, sway: 0 }),
  parts('bubblerings', 'Bubble rings', 'ring', 'sky', { vel: [0, .09], glow: 1 }),
  parts('gemrain', 'Gem rain', 'gem', 'rainbow', { vel: [0, -.13], glow: 1 }),
  parts('plussparks', 'Plus sparkles', 'plus', 'gold', { vel: [0, .04], n: 8, glow: 1 }),
  parts('paintdrops', 'Paint drops', 'drop', 'rainbow', { vel: [0, -.3], sway: 0, spin: 0 }),
  parts('raindrops2', 'Big raindrops', 'drop', 'sky', { vel: [0, -.4], sway: 0, spin: 0, cat: 'weather' }),
  parts('petals', 'Flower petals', 'flower', 'pink', { vel: [.04, -.09], sway: .08 }),
  parts('blossoms', 'Spring blossoms', 'flower', 'candy', { vel: [0, .07] }),
  parts('squareconfetti', 'Square confetti', 'square', 'rainbow', { vel: [0, -.2], n: 9, spin: 3, cat: 'party' }),
  parts('pixelrain', 'Pixel rain', 'square', 'mint', { vel: [0, -.22], n: 12, spin: 0, sway: 0 }),
  parts('moons', 'Sleepy moons', 'moon', 'gold', { vel: [0, .05], glow: 1 }),
  parts('notesup', 'Music notes', 'note', 'purple', { vel: [.02, .1], spin: .5, cat: 'party' }),
  parts('notesrain', 'Note rain', 'note', 'rainbow', { vel: [0, -.12], spin: .5, cat: 'party' }),
  parts('triparty', 'Triangle party', 'tri', 'rainbow', { vel: [0, -.15], spin: 2, cat: 'party' }),
  parts('bigflakes', 'Big snowflakes', 'flake', 'white', { vel: [.02, -.08], n: 4, cat: 'weather' }),
  parts('clouds', 'Drifting clouds', 'cloud', 'white', { vel: [.06, 0], n: 3, sway: 0, spin: 0, cat: 'weather' }),
  parts('butterflies', 'Butterflies', 'fly', 'candy', { vel: [.05, .06], n: 4, spin: .3 }),
  parts('goldcoins', 'Gold coins', 'dot', 'gold', { vel: [0, -.3], n: 6, sway: 0, cat: 'party', glow: 1 }),
  parts('redhearts', 'Red hearts burst', 'heart', 'red', { vel: [0, .18], n: 7, cat: 'party' }),
  parts('sunnydots', 'Sunny dots', 'dot', 'sun', { vel: [0, .05], n: 10, dens: .35, glow: 1 }),
];

/* ---- frames & windows ---- */
const EDGE = 'vec2 p = u * ASP; float e = min(min(p.x, ASP.x - p.x), min(p.y, ASP.y - p.y)), w = .06;';
const F = [
  fx('rainbowframe', 'Rainbow frame', 'frame', `vec4 fx(vec2 u){ vec4 c = src(u); ${EDGE} vec3 col = hsv(vec3(fract((p.x + p.y) * .6 - t * .3), .8, 1.)); return over(c, col, smoothstep(w + .004, w, e) * A); }`),
  fx('dotframe', 'Dotty frame', 'frame', `vec4 fx(vec2 u){ vec4 c = src(u); ${EDGE} vec2 g = fract(p * 16.) - .5; vec3 col = hsv(vec3(fract(floor(p.x * 16.) * .13 + floor(p.y * 16.) * .29 + t * .2), .7, 1.));
    c = over(c, vec3(1.), smoothstep(w + .004, w, e) * A); return over(c, col, smoothstep(w + .004, w, e) * smoothstep(.33, .28, length(g)) * A); }`),
  fx('glowframe', 'Glow frame', 'frame', `vec4 fx(vec2 u){ vec4 c = src(u); ${EDGE} float g = smoothstep(w * 2.2, 0., e) * (.65 + .35 * sin(t * 4.)); return addl(c, vec3(1., .8, .3) * g * A); }`),
  fx('neonframe', 'Neon frame', 'frame', `vec4 fx(vec2 u){ vec4 c = src(u); ${EDGE} vec3 col = mix(vec3(1., .2, .8), vec3(.2, .9, 1.), .5 + .5 * sin(t * 2.)); float l = exp(-abs(e - w * .6) * 90.); return addl(c, col * l * 1.4 * A); }`),
  fx('filmframe', 'Film strip', 'frame', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 p = u * ASP; float e = min(p.x, ASP.x - p.x), w = .1;
    vec2 h = vec2(abs(e - w * .5), fract(p.y * 7. - t * .5) - .5); float hole = step(abs(h.x), .022) * step(abs(h.y), .22);
    float band = step(e, w); return over(c, mix(vec3(.05), vec3(.95), hole), band * A); }`),
  fx('polaroid', 'Polaroid', 'frame', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 p = u * ASP; float m = .05; float inside = step(m, p.x) * step(p.x, ASP.x - m) * step(m * 4., p.y) * step(p.y, ASP.y - m);
    return over(c, vec3(.98, .97, .93), (1. - inside) * A); }`),
  fx('scallop', 'Scallop frame', 'frame', `vec4 fx(vec2 u){ vec4 c = src(u); ${EDGE} float s = .02 * (.5 + .5 * cos((p.x + p.y) * 70.)); return over(c, vec3(1., .65, .8), smoothstep(w + s + .004, w + s, e) * A); }`),
  fx('candyframe', 'Candy stripes', 'frame', `vec4 fx(vec2 u){ vec4 c = src(u); ${EDGE} float st = step(.5, fract((p.x + p.y) * 14. - t * .8)); return over(c, mix(vec3(1.), vec3(.95, .15, .25), st), smoothstep(w + .004, w, e) * A); }`),
  fx('starcorners', 'Star corners', 'frame', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 p = u * ASP; float a = 0.;
    for (int i = 0; i < 4; i++){ vec2 k = vec2(i == 1 || i == 3 ? ASP.x - .16 : .16, i >= 2 ? ASP.y - .16 : .16); a = max(a, smoothstep(.01, -.01, sdStar(rot(t * 1.5 + float(i)) * (p - k), .12, .45))); }
    return over(c, vec3(1., .85, .2), a * A); }`),
  fx('comicframe', 'Comic frame', 'frame', `vec4 fx(vec2 u){ vec4 c = src(u); ${EDGE} vec2 g = fract(p * 40.) - .5; float dots = step(length(g), .3);
    c = over(c, vec3(1., .9, .2), smoothstep(w * 1.6, w * 1.6 - .004, e) * dots * A); return over(c, vec3(.05), smoothstep(.024, .02, abs(e - w * .5)) * A); }`),
  fx('heartwindow', 'Heart window', 'frame', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 p = (u - vec2(.5, .47)) * ASP / min(ASP.x, ASP.y) * 2.6; float d = sdHeart(p + vec2(0., .55));
    return over(c, vec3(1., .55, .75) * (.9 + .1 * sin(t * 3.)), smoothstep(-.01, .01, d) * A); }`),
  fx('circlewindow', 'Circle window', 'frame', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 p = (u - .5) * ASP / min(ASP.x, ASP.y); float d = length(p) - .45;
    c = over(c, vec3(.1, .1, .16), smoothstep(-.004, .004, d) * A); return addl(c, vec3(1., .8, .3) * exp(-abs(d) * 120.) * A); }`),
  fx('starwindow', 'Star window', 'frame', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 p = (u - .5) * ASP / min(ASP.x, ASP.y); float d = sdStar(rot(sin(t) * .1) * p, .5, .5);
    return over(c, vec3(.2, .3, .9), smoothstep(-.005, .005, d) * A); }`),
];

/* ---- light & colour ---- */
const HUE = `vec3 hueRot(vec3 c, float a){ mat3 toY = mat3(.299, .596, .211, .587, -.274, -.523, .114, -.322, .312); mat3 toR = mat3(1., 1., 1., .956, -.272, -1.106, .621, -.647, 1.703);
  vec3 y = toY * c; y.yz = mat2(cos(a), sin(a), -sin(a), cos(a)) * y.yz; return toR * y; }
`;
const L = [
  fx('rainbowsweep', 'Rainbow sweep', 'light', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 p = u * ASP; vec3 col = hsv(vec3(fract(p.x * .7 - p.y * .4 + t * .25), .7, 1.)); return addl(c, col * .35 * A); }`),
  fx('colourcycle', 'Colour cycle', 'light', `${HUE}vec4 fx(vec2 u){ vec4 C = src(u); vec3 c = unpm(C); vec3 r = clamp(hueRot(c, t * 2.), 0., 1.); return vec4(mix(c, r, A) * C.a, C.a); }`),
  fx('spotlight', 'Spotlight', 'light', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 p = (u - vec2(.5 + .25 * sin(t * .9), .5 + .2 * cos(t * .7))) * ASP; float l = smoothstep(.42, .2, length(p));
    return vec4(c.rgb * mix(1., .25 + .95 * l, A), c.a); }`),
  fx('partylights', 'Party spotlights', 'party', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 p = u * ASP; vec3 s = vec3(0.);
    for (int i = 0; i < 3; i++){ float fi = float(i); vec2 o = vec2(ASP.x * (.2 + .3 * fi), 0.); vec2 d = p - o; float a = atan(d.x, d.y) - sin(t * (1. + fi * .3) + fi * 2.) * .6;
      s += hsv(vec3(fi / 3. + t * .05, .8, 1.)) * smoothstep(.16, .05, abs(a)) * smoothstep(1.6, .2, length(d)); }
    return addl(c, s * .7 * A); }`),
  fx('warmleak', 'Warm light leak', 'light', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 p = u * ASP; float n = fbm(p * 1.2 + vec2(t * .15, S)); float g = smoothstep(.35, .8, n) * smoothstep(.0, .6, 1. - u.x * .8);
    return addl(c, vec3(1., .55, .2) * g * .9 * A); }`),
  fx('pinkleak', 'Pink light leak', 'light', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 p = u * ASP; float n = fbm(p * 1.3 + vec2(-t * .12, S + 3.)); float g = smoothstep(.35, .8, n) * smoothstep(-.3, 1., u.y);
    return addl(c, vec3(1., .35, .7) * g * .9 * A); }`),
  fx('blueleak', 'Cool light leak', 'light', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 p = u * ASP; float n = fbm(p * 1.1 + vec2(t * .1, S + 9.)); float g = smoothstep(.35, .8, n) * smoothstep(.1, .9, u.x);
    return addl(c, vec3(.3, .6, 1.) * g * .9 * A); }`),
  fx('goldenhour', 'Golden hour', 'light', `vec4 fx(vec2 u){ vec4 C = src(u); vec3 c = unpm(C); float g = smoothstep(.2, 1., u.y); vec3 r = c * vec3(1.12, 1., .82) + vec3(.25, .12, 0.) * g * (.85 + .15 * sin(t));
    return vec4(mix(c, clamp(r, 0., 1.), A) * C.a, C.a); }`),
  fx('moonlight', 'Moonlight', 'light', `vec4 fx(vec2 u){ vec4 C = src(u); vec3 c = unpm(C); float l = lum(c); vec3 r = mix(vec3(l), c, .3) * vec3(.6, .75, 1.1) * .8 + vec3(.02, .03, .08);
    return vec4(mix(c, clamp(r, 0., 1.), A) * C.a, C.a); }`),
  fx('nightvision', 'Night vision', 'light', `vec4 fx(vec2 u){ vec4 C = src(u); vec3 c = unpm(C); float l = lum(c) * 1.4 + (hash(floor(u * R / 2.) + floor(t * 24.)) - .5) * .2; l *= .85 + .15 * sin(u.y * R.y * 1.5);
    vec2 p = (u - .5) * ASP; l *= smoothstep(1.1, .3, length(p)); return vec4(mix(c, vec3(.1, 1., .2) * l, A) * C.a, C.a); }`),
  fx('pulseglow', 'Pulse glow', 'light', `vec4 fx(vec2 u){ vec4 C = src(u); vec3 c = unpm(C); float k = pow(.5 + .5 * sin(t * 6.283), 3.); vec3 b = unpm(blurD(u, .04));
    return vec4(mix(c, clamp(c + b * k * .7, 0., 1.), A) * C.a, C.a); }`),
  fx('prism', 'Prism', 'light', `vec4 fx(vec2 u){ vec4 C = src(u); vec2 d = (u - .5) * (.012 + .008 * sin(t * 2.)) * A; float r = src(u + d).r, g = C.g, b = src(u - d).b;
    vec2 p = u * ASP; vec3 rb = hsv(vec3(fract(p.x * 1.5 + p.y + t * .2), .6, 1.)) * smoothstep(.75, 1., sin(p.x * 4. + p.y * 2. - t * 1.5)) * .25;
    return addl(vec4(r, g, b, C.a), rb * A); }`),
  fx('sunburst', 'Sunburst rays', 'light', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 p = (u - vec2(.5, .55)) * ASP; float a = atan(p.y, p.x) + t * .4; float r = step(.5, fract(a * 12. / 6.283));
    return addl(c, vec3(1., .85, .4) * r * smoothstep(1.2, .1, length(p)) * .35 * A); }`),
];

/* ---- distort ---- */
const DS = [
  fx('waveh', 'Wavy', 'distort', `vec4 fx(vec2 u){ return src(u + vec2(sin(u.y * 18. + t * 4.) * .012 * A, 0.)); }`),
  fx('wavev', 'Wavy up', 'distort', `vec4 fx(vec2 u){ return src(u + vec2(0., sin(u.x * 16. + t * 4.) * .012 * A)); }`),
  fx('jelly', 'Jelly', 'distort', `vec4 fx(vec2 u){ float k = sin(t * 9.) * .05 * A * exp(-mod(t, 1.2) * 2.); vec2 p = u - .5; p.x *= 1. + k; p.y *= 1. - k; return src(p + .5); }`),
  fx('twirl', 'Twirl', 'distort', `vec4 fx(vec2 u){ vec2 p = (u - .5) * ASP; float r = length(p), a = (1. - smoothstep(0., .6, r)) * 2.5 * A * sin(t * .8); p = rot(a) * p; return src(clamp(p / ASP + .5, 0., 1.)); }`),
  fx('pinch', 'Pinch', 'distort', `vec4 fx(vec2 u){ vec2 p = (u - .5) * ASP; float r = length(p), k = 1. + .5 * A * (.6 + .4 * sin(t * 2.)) * smoothstep(.6, 0., r); return src(clamp(p * k / ASP + .5, 0., 1.)); }`),
  fx('stretch', 'Stretch bounce', 'distort', `vec4 fx(vec2 u){ float k = .12 * A * abs(sin(t * 3.)); vec2 p = u - vec2(.5, 0.); p.x /= 1. - k * .5; p.y /= 1. + k; return src(clamp(p + vec2(.5, 0.), 0., 1.)); }`),
  fx('reflection', 'Water reflection', 'distort', `vec4 fx(vec2 u){ vec4 c = src(u); if (u.y > .5) return c; vec2 q = vec2(u.x + sin(u.y * 60. + t * 3.) * .006, 1. - u.y); vec4 r = src(q) * vec4(.75, .85, 1., 1.);
    return mix(c, r, A); }`),
  fx('bricks', 'Brick shift', 'distort', `vec4 fx(vec2 u){ float row = floor(u.y * 10.); float off = (mod(row, 2.) - .5) * .06 * A * sin(t * 2.); return src(vec2(fract(u.x + off), u.y)); }`),
  fx('zigzag', 'Zigzag', 'distort', `vec4 fx(vec2 u){ float z = abs(fract(u.y * 8. + t * .5) - .5) * 2. - .5; return src(u + vec2(z * .03 * A, 0.)); }`),
  fx('dizzy', 'Dizzy', 'distort', `vec4 fx(vec2 u){ vec2 p = (u - .5) * ASP; p = rot(sin(t * 2.) * .08 * A) * p * (1. + .04 * A * sin(t * 3.)); vec4 a = src(clamp(p / ASP + .5, 0., 1.)), b = src(clamp(rot(.06 * A) * p / ASP + .5, 0., 1.));
    return mix(a, b, .35 * A); }`),
];

/* ---- art ---- */
const DUO = (id, name, a, b) => fx(id, name, 'art', `vec4 fx(vec2 u){ vec4 C = src(u); vec3 c = unpm(C); float l = smoothstep(.05, .95, lum(c)); return vec4(mix(c, mix(${a}, ${b}, l), A) * C.a, C.a); }`);
const AR = [
  fx('crosshatch', 'Crosshatch', 'art', `vec4 fx(vec2 u){ vec4 C = src(u); vec3 c = unpm(C); float l = lum(c); vec2 p = u * R; float h = 1.;
    if (l < .8) h *= step(.25, fract((p.x + p.y) / 9.)); if (l < .55) h *= step(.25, fract((p.x - p.y) / 9.)); if (l < .35) h *= step(.25, fract(p.x / 6.)); if (l < .18) h *= .2;
    return vec4(mix(c, vec3(.98, .96, .9) * h + vec3(.05) * (1. - h), A) * C.a, C.a); }`),
  fx('mosaic', 'Mosaic tiles', 'art', `vec4 fx(vec2 u){ vec2 n = vec2(28.) * ASP / ASP.x; vec2 g = floor(u * n), f = fract(u * n); vec4 C = src((g + .5) / n); float grout = step(.08, f.x) * step(.08, f.y) * step(f.x, .92) * step(f.y, .92);
    vec3 c = unpm(C) * (.9 + .2 * hash(g + S)); vec4 base = src(u); return mix(base, vec4(c * grout + vec3(.85) * (1. - grout), 1.) * C.a, A); }`),
  fx('stainedglass', 'Stained glass', 'art', `vec4 fx(vec2 u){ vec2 q = u * ASP * 7.; vec2 g = floor(q), f = fract(q); float d1 = 9., d2 = 9.; vec2 best = vec2(0.);
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++){ vec2 o = vec2(float(x), float(y)), h = hash2(g + o + S); vec2 r = o + h - f; float d = dot(r, r);
      if (d < d1){ d2 = d1; d1 = d; best = g + o + h; } else if (d < d2) d2 = d; }
    vec4 C = src(clamp(best / (ASP * 7.), 0., 1.)); vec3 c = unpm(C) * 1.15; float lead = smoothstep(.04, .12, sqrt(d2) - sqrt(d1));
    vec4 base = src(u); return mix(base, vec4(clamp(c, 0., 1.) * lead, 1.) * base.a, A); }`),
  fx('pointillism', 'Pointillism', 'art', `vec4 fx(vec2 u){ vec2 n = R / 7.; vec2 g = floor(u * n), f = fract(u * n) - .5; vec4 C = src((g + .5) / n); float r = .3 + .2 * hash(g + S);
    vec3 c = mix(vec3(.97, .95, .9), unpm(C) * 1.1, smoothstep(r, r - .1, length(f))); vec4 base = src(u); return mix(base, vec4(clamp(c, 0., 1.), 1.) * base.a, A); }`),
  fx('crayon', 'Crayon', 'art', `vec4 fx(vec2 u){ vec4 C = src(u); vec3 c = unpm(C); vec2 px = 1. / R; float e = length(unpm(src(u + vec2(px.x, 0.))) - unpm(src(u - vec2(px.x, 0.)))) + length(unpm(src(u + vec2(0., px.y))) - unpm(src(u - vec2(0., px.y))));
    float paper = .85 + .15 * noise(u * R * vec2(.15, 1.2)); vec3 r = floor(c * 5. + .5) / 5. * paper; r = mix(r, vec3(.1), smoothstep(.15, .5, e)); return vec4(mix(c, r, A) * C.a, C.a); }`),
  fx('watercolor', 'Watercolour', 'art', `vec4 fx(vec2 u){ vec2 w = vec2(fbm(u * 6. + S), fbm(u * 6. + 4.1 + S)) - .5; vec4 C = src(u + w * .02); vec3 c = unpm(C); vec3 r = floor(c * 6.) / 6. * .7 + c * .3;
    r = mix(r, vec3(1.), .12 + .1 * fbm(u * 20.)); vec4 base = src(u); return mix(base, vec4(clamp(r, 0., 1.), 1.) * base.a, A); }`),
  fx('blueprint', 'Blueprint', 'art', `vec4 fx(vec2 u){ vec4 C = src(u); vec2 px = 1. / R; float e = length(unpm(src(u + px)) - unpm(src(u - px))) * 2.; vec2 g = abs(fract(u * R / 24.) - .5);
    vec3 r = vec3(.08, .25, .6) + vec3(.3) * step(.47, max(g.x, g.y)) + vec3(.9) * smoothstep(.08, .3, e); return vec4(mix(unpm(C), clamp(r, 0., 1.), A) * C.a, C.a); }`),
  fx('chalkboard', 'Chalkboard', 'art', `vec4 fx(vec2 u){ vec4 C = src(u); vec2 px = 1.5 / R; float e = length(unpm(src(u + vec2(px.x, 0.))) - unpm(src(u - vec2(px.x, 0.)))) + length(unpm(src(u + vec2(0., px.y))) - unpm(src(u - vec2(0., px.y))));
    float n = .8 + .2 * hash(floor(u * R / 2.)); vec3 r = vec3(.12, .25, .18) + vec3(.9) * smoothstep(.1, .35, e) * n; return vec4(mix(unpm(C), r, A) * C.a, C.a); }`),
  fx('asciiblocks', 'Block letters', 'art', `vec4 fx(vec2 u){ vec2 n = R / 10.; vec2 g = floor(u * n), f = fract(u * n); float l = lum(unpm(src((g + .5) / n)));
    float m = l > .75 ? step(.2, f.x) * step(f.x, .8) * step(.2, f.y) * step(f.y, .8) : l > .5 ? step(abs(f.x - .5), .12) + step(abs(f.y - .5), .12) : l > .25 ? step(abs(f.x - f.y), .12) : 0.;
    vec4 base = src(u); return mix(base, vec4(vec3(.2, 1., .45) * clamp(m, 0., 1.), 1.) * base.a, A); }`),
  fx('popart4', 'Pop art ×4', 'art', `${HUE}vec4 fx(vec2 u){ vec2 g = floor(u * 2.), f = fract(u * 2.); vec4 C = src(f); float l = lum(unpm(C)); float i = g.x + g.y * 2.;
    vec3 a = hsv(vec3(i * .25 + .05, .9, 1.)), b = hsv(vec3(i * .25 + .55, .9, .5)); vec3 r = l > .5 ? a : b; vec4 base = src(u); return mix(base, vec4(r, 1.) * C.a, A); }`),
  DUO('duopink', 'Duotone candy', 'vec3(.25, .1, .45)', 'vec3(1., .55, .75)'),
  DUO('duosun', 'Duotone sunshine', 'vec3(.35, .1, .5)', 'vec3(1., .88, .3)'),
  DUO('duomint', 'Duotone mint', 'vec3(.05, .2, .3)', 'vec3(.6, 1., .8)'),
  DUO('duofire', 'Duotone fire', 'vec3(.3, 0., .05)', 'vec3(1., .7, .2)'),
];

/* ---- retro ---- */
const RE = [
  fx('eightbit', '8-bit', 'retro', `vec4 fx(vec2 u){ vec2 n = vec2(64., 64. * ASP.y / ASP.x); vec2 g = (floor(u * n) + .5) / n; vec4 C = src(g); vec3 c = floor(unpm(C) * 4. + .5) / 4.;
    vec4 base = src(u); return mix(base, vec4(c, 1.) * C.a, A); }`),
  fx('gameboy', 'Game Boy', 'retro', `vec4 fx(vec2 u){ vec2 n = vec2(120., 120. * ASP.y / ASP.x); vec4 C = src((floor(u * n) + .5) / n); float l = floor(lum(unpm(C)) * 3.99) / 3.;
    vec3 r = mix(mix(vec3(.06, .22, .06), vec3(.19, .38, .19), step(.3, l)), mix(vec3(.55, .67, .06), vec3(.61, .74, .06), step(.9, l)), step(.6, l)); vec4 base = src(u); return mix(base, vec4(r, 1.) * C.a, A); }`),
  fx('oldphoto', 'Old photo', 'retro', `vec4 fx(vec2 u){ vec4 C = src(u); vec3 c = unpm(C); float l = lum(c); vec3 r = vec3(l) * vec3(1.07, .92, .72) + .05; float sc = step(.997, hash(vec2(floor(u.x * 300.), floor(t * 8.))));
    vec2 p = (u - .5) * ASP; r *= smoothstep(1.2, .3, length(p)); r = mix(r, vec3(.9, .85, .7), sc * .7); return vec4(mix(c, clamp(r, 0., 1.), A) * C.a, C.a); }`),
  fx('newspaper', 'Newspaper', 'retro', `vec4 fx(vec2 u){ vec4 C = src(u); float l = lum(unpm(C)); vec2 p = rot(.785) * u * R / 5.; vec2 f = fract(p) - .5; float d = smoothstep(.0, .1, sqrt(1. - l) * .6 - length(f));
    vec3 r = mix(vec3(.93, .91, .85), vec3(.12), d); return vec4(mix(unpm(C), r, A) * C.a, C.a); }`),
  fx('speedlines', 'Speed lines', 'motion', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 p = (u - .5) * ASP; float a = atan(p.y, p.x), r = length(p); float l = step(.82, hash(vec2(floor(a * 60.), floor(t * 12.))));
    return over(c, vec3(1.), l * smoothstep(.25, .7, r) * .85 * A); }`),
  fx('retrosun', 'Retro sunset', 'retro', `vec4 fx(vec2 u){ vec4 C = src(u); vec3 c = unpm(C); vec3 g = mix(vec3(.4, .1, .6), vec3(1., .5, .3), u.y); float bars = step(.3, fract(u.y * 20. - t * .5)) + step(.6, u.y);
    vec3 r = mix(c, c * g * 1.5, .7) * mix(.8, 1., clamp(bars, 0., 1.)); return vec4(mix(c, clamp(r, 0., 1.), A) * C.a, C.a); }`),
];

export const EFFECTS2 = [...P, ...F, ...L, ...DS, ...AR, ...RE];

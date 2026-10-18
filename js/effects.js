/* Effects + Filters: a data-driven WebGL2 pipeline (our own shaders, plain maths, no AI) shared by preview and export.
   - FILTERS_GL: ~50 colour grades ("LUT-style" looks) built from one parametric grade shader; intensity mixes with the original.
   - EFFECTS: ~60 effects, each a small GLSL function fx(u). Particles (snow, confetti, hearts...) come from hashed grids
     driven only by clip-local time t and a seed, so every frame is deterministic: preview == export.
   Use: applyChain(src, w, h, [{ kind: 'filter'|'effect', id, amount, t, dur, seed }]) -> canvas (premultiplied RGBA) or null.
   Effects can sit on an Effects track (applied to everything under them) or on one clip. */
import { FILTER_DEFS } from './filterdefs.js';
export { FILTER_DEFS };

const VS = `#version 300 es
in vec2 p; out vec2 v; void main(){ v = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;
const HEAD = `#version 300 es
precision highp float; in vec2 v; out vec4 o; uniform sampler2D T; uniform vec2 R; uniform float t, A, D, S;
#define PI 3.14159265
vec2 ASP; vec4 src(vec2 u){ return texture(T, u); }
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float hash1(float n){ return fract(sin(n * 12.9898 + 4.1) * 43758.5453); }
vec2 hash2(vec2 p){ float n = hash(p); return vec2(n, hash(p + n * 17.17 + 3.1)); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0., a = .5; for (int i = 0; i < 4; i++){ s += a * noise(p); p = p * 2.03 + 7.1; a *= .5; } return s; }
vec3 hsv(vec3 c){ vec3 p = abs(fract(c.xxx + vec3(0., 2. / 3., 1. / 3.)) * 6. - 3.); return c.z * mix(vec3(1.), clamp(p - 1., 0., 1.), c.y); }
float lum(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
vec3 unpm(vec4 c){ return c.a > 1e-5 ? c.rgb / c.a : vec3(0.); }
vec4 over(vec4 c, vec3 col, float a){ a = clamp(a, 0., 1.); return c * (1. - a) + vec4(col * a, a); }   // premultiplied "over"
vec4 addl(vec4 c, vec3 col){ vec3 r = c.rgb + col; float a = max(c.a, clamp(max(col.r, max(col.g, col.b)), 0., 1.)); return vec4(min(r, vec3(a)), a); }
mat2 rot(float a){ float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
vec4 blurD(vec2 u, float r){ vec4 s = vec4(0.); vec2 k = r / ASP; for (int i = 0; i < 32; i++){ float fi = float(i) + .5, a = fi * 2.39996; s += src(u + vec2(cos(a), sin(a)) * sqrt(fi / 32.) * k); } return s / 32.; }
vec2 KAL(vec2 u, float n){ vec2 p = (u - .5) * ASP; float r = length(p), a = atan(p.y, p.x), s = 2. * PI / n; a = mod(a, s); a = abs(a - s * .5); return clamp(vec2(cos(a), sin(a)) * r / ASP + .5, 0., 1.); }
vec4 blurDir(vec2 u, vec2 d){ vec4 s = vec4(0.); for (int i = 0; i < 24; i++){ s += src(u + d * (float(i) / 23. - .5)); } return s / 24.; }
float glint(vec2 d, float s){ d /= s; float c = exp(-dot(d, d) * 30.); float r = exp(-abs(d.x) * 40.) * exp(-abs(d.y) * 3.) + exp(-abs(d.y) * 40.) * exp(-abs(d.x) * 3.); return c + .8 * r; }
float sdHeart(vec2 p){ p.x = abs(p.x); if (p.y + p.x > 1.) return sqrt(dot(p - vec2(.25, .75), p - vec2(.25, .75))) - sqrt(2.) / 4.;
  vec2 a = p - vec2(0., 1.), b = p - .5 * max(p.x + p.y, 0.); return sqrt(min(dot(a, a), dot(b, b))) * sign(p.x - p.y); }
float sdStar(vec2 p, float r, float rf){ const vec2 k1 = vec2(.809016994375, -.587785252292); const vec2 k2 = vec2(-k1.x, k1.y);
  p.x = abs(p.x); p -= 2. * max(dot(k1, p), 0.) * k1; p -= 2. * max(dot(k2, p), 0.) * k2; p.x = abs(p.x); p.y -= r;
  vec2 ba = rf * vec2(-k1.y, k1.x) - vec2(0, 1); float h = clamp(dot(p, ba) / dot(ba, ba), 0., r); return length(p - ba * h) * sign(p.y * ba.x - p.x * ba.y); }
/* one particle per grid cell: q = square coords, n = cells per unit, vel = drift (units / s). Returns (offset from particle in cell units, two random values). */
vec4 cell(vec2 q, float n, vec2 vel, float sd){ q = q * n - vel * t * n; vec2 g = floor(q), f = fract(q); vec2 r = hash2(g + sd); return vec4(f - (.25 + .5 * r), hash(g + sd + 7.3), hash(g + sd + 1.7)); }
`;
const MAIN = `void main(){ ASP = vec2(R.x / min(R.x, R.y), R.y / min(R.x, R.y)); o = fx(v); }`;
const GRADE = `uniform vec3 lift, gam, gain, shc, hic, bwt; uniform float ex, con, sat, temp, tnt, hue, fade, vib, split, bw, vig, cross;
vec4 fx(vec2 u){ vec4 C = src(u); vec3 c = unpm(C), c0 = c;
  c *= exp2(ex); c *= vec3(1. + temp * .16, 1. + tnt * .1, 1. - temp * .16);
  c = (c - .5) * con + .5; c = clamp(c, 0., 1.);
  c = pow(max(c * gain + lift * (1. - c), 0.), 1. / gam);
  float l = lum(c); c = mix(vec3(l), c, sat);
  float s = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)); c = mix(vec3(l), c, 1. + vib * (1. - s));
  if (abs(hue) > 1e-4){ float a = hue * PI / 180.; mat3 toY = mat3(.299, .596, .211, .587, -.274, -.523, .114, -.322, .312); mat3 toR = mat3(1., 1., 1., .956, -.272, -1.106, .621, -.647, 1.703);
    vec3 y = toY * c; y.yz = mat2(cos(a), sin(a), -sin(a), cos(a)) * y.yz; c = toR * y; }
  if (cross > 0.){ c = mix(c, vec3(smoothstep(.1, .9, c.r), c.g, smoothstep(-.1, 1.1, c.b) * .9 + .05), cross); }
  l = lum(c); c += split * (mix(shc, hic, smoothstep(.1, .9, l)) - .5) * .35;
  c = mix(c, vec3(l) * bwt, bw);
  c = c * (1. - fade * .22) + fade * .1;
  vec2 p = (u - .5) * ASP / max(ASP.x, ASP.y) * 1.4; c *= 1. - vig * smoothstep(.25, 1.1, length(p));
  c = mix(c0, clamp(c, 0., 1.), A); return vec4(c * C.a, C.a); }`;

/* Colour pro pass (js/colorpro.js): white balance -> wheels (lift / gamma / gain) -> exposure, contrast, saturation -> curves
   -> HSL per hue band -> 3D LUT -> sharpen, vignette, grain. One pass, same for preview, export and adjustment layers. */
const COLOR = `uniform sampler2D CV, LT; uniform float useCv, LN, LA, ex, con, sat, vig, grain, sharp; uniform vec3 wl, wg, wn; uniform vec2 wb; uniform float hs[24];
vec3 rgb2hsl(vec3 c){ float mx = max(c.r, max(c.g, c.b)), mn = min(c.r, min(c.g, c.b)), l = (mx + mn) * .5, d = mx - mn; if (d < 1e-5) return vec3(0., 0., l);
  float s = l > .5 ? d / (2. - mx - mn) : d / (mx + mn), h = mx == c.r ? (c.g - c.b) / d + (c.g < c.b ? 6. : 0.) : mx == c.g ? (c.b - c.r) / d + 2. : (c.r - c.g) / d + 4.; return vec3(h / 6., s, l); }
float h2r(float p, float q, float t){ t = fract(t); if (t < 1. / 6.) return p + (q - p) * 6. * t; if (t < .5) return q; if (t < 2. / 3.) return p + (q - p) * (2. / 3. - t) * 6.; return p; }
vec3 hsl2rgb(vec3 h){ if (h.y < 1e-5) return vec3(h.z); float q = h.z < .5 ? h.z * (1. + h.y) : h.z + h.y - h.z * h.y, p = 2. * h.z - q; return vec3(h2r(p, q, h.x + 1. / 3.), h2r(p, q, h.x), h2r(p, q, h.x - 1. / 3.)); }
const float BC[8] = float[8](0., 30., 60., 120., 180., 225., 270., 315.);
vec3 lutAt(vec3 c){ float n = LN, b = c.b * (n - 1.), b0 = floor(b), b1 = min(n - 1., b0 + 1.), f = b - b0;
  vec2 q = vec2(c.r * (n - 1.) + .5, c.g * (n - 1.) + .5) / vec2(n * n, n);
  vec3 x0 = texture(LT, q + vec2(b0 / n, 0.)).rgb, x1 = texture(LT, q + vec2(b1 / n, 0.)).rgb; return mix(x0, x1, f); }
vec3 grade(vec3 c, vec2 u){
  c *= vec3(exp(wb.x * .5 + wb.y * .25), exp(-wb.y * .5), exp(-wb.x * .5 + wb.y * .25));
  vec3 gn = max(vec3(0.), 1. + wn), gm = clamp(1. + wg, .2, 5.); c = pow(max(c * gn + wl * (1. - c), 0.), 1. / gm);
  c *= exp2(ex); c = (c - .5) * con + .5; c = clamp(c, 0., 1.); float l = lum(c); c = clamp(mix(vec3(l), c, sat), 0., 1.);
  if (useCv > .5) c = vec3(texture(CV, vec2(c.r * 255. / 256. + .5 / 256., .5)).r, texture(CV, vec2(c.g * 255. / 256. + .5 / 256., .5)).g, texture(CV, vec2(c.b * 255. / 256. + .5 / 256., .5)).b);
  vec3 h = rgb2hsl(c); float dh = 0., ds = 0., dl = 0., any = 0.;
  for (int i = 0; i < 8; i++){ any += abs(hs[i * 3]) + abs(hs[i * 3 + 1]) + abs(hs[i * 3 + 2]); }
  if (any > 1e-4 && h.y > 1e-4){ float hd = h.x * 360.;
    for (int i = 0; i < 8; i++){ float lo = BC[(i + 7) % 8], hi = BC[(i + 1) % 8], cc = BC[i];
      float dlo = mod(cc - lo + 360., 360.), dhi = mod(hi - cc + 360., 360.), d = mod(hd - cc + 540., 360.) - 180.;
      float w = d < 0. ? max(0., 1. + d / dlo) : max(0., 1. - d / dhi); w = w * w * (3. - 2. * w);
      dh += w * hs[i * 3]; ds += w * hs[i * 3 + 1]; dl += w * hs[i * 3 + 2]; }
    float k = smoothstep(0., .25, h.y);
    h.x = fract(h.x + dh * .5 * k); h.y = clamp(h.y * (1. + ds), 0., 1.); h.z = clamp(h.z + dl * .25 * k * (1. - abs(2. * h.z - 1.)), 0., 1.); c = hsl2rgb(h); }
  if (LA > 0.) c = mix(c, lutAt(clamp(c, 0., 1.)), LA);
  return c; }
vec4 fx(vec2 u){ vec4 C = src(u); vec3 c = unpm(C), c0 = c;
  if (sharp > 1e-4){ vec2 px = 1. / R; vec3 b = (unpm(src(u + vec2(px.x, 0.))) + unpm(src(u - vec2(px.x, 0.))) + unpm(src(u + vec2(0., px.y))) + unpm(src(u - vec2(0., px.y)))) * .25;
    vec3 d = c - b; c = c + clamp(d * sharp * 2., -.2, .2); }
  c = grade(clamp(c, 0., 1.), u);
  if (vig > 1e-4){ vec2 p = (u - .5) * ASP / max(ASP.x, ASP.y) * 1.4; c *= 1. - vig * smoothstep(.25, 1.1, length(p)); }
  if (grain > 1e-4){ float g = hash(floor(u * R) + floor(S * 13.) + floor(t * 24.) * 7.31) - .5; c += g * grain * .16; }
  c = mix(c0, clamp(c, 0., 1.), A); return vec4(c * C.a, C.a); }`;

/* ---------------- effects (our own designs) ---------------- */
const fx = (id, name, cat, body, extra = {}) => ({ id, name, cat, body, ...extra });
export const EFFECT_CATS = [['magic', 'Magic'], ['party', 'Party'], ['weather', 'Weather'], ['light', 'Light'], ['retro', 'Retro'], ['motion', 'Motion'], ['distort', 'Distort'], ['mirror', 'Mirror'], ['art', 'Art']];
export const EFFECTS = [
  // magic
  fx('sparkle', 'Sparkle', 'magic', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 q = u * ASP; float g = 0.;
    for (int k = 0; k < 2; k++){ float n = 7. + float(k) * 6.; vec4 e = cell(q, n, vec2(0.), S + float(k) * 9.); float ph = fract(e.z * 5. + t * (.5 + e.w));
      float life = pow(sin(ph * PI), 8.); g += glint(e.xy, .9 - float(k) * .3) * life * step(.35, e.w); }
    return addl(c, vec3(1., .95, .75) * g * A * 1.6); }`),
  fx('glitter', 'Glitter', 'magic', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 q = u * ASP; vec4 e = cell(q, 60., vec2(0.), S); float tw = pow(.5 + .5 * sin(t * 9. + e.z * 40.), 12.);
    float d = smoothstep(.35, .0, length(e.xy)) * tw * step(.55, e.w); vec3 col = hsv(vec3(e.z, .45, 1.));
    return addl(c, col * d * A * 1.3 + vec3(.04) * A * (lum(unpm(c)) > .6 ? 1. : 0.)); }`),
  fx('magicdust', 'Magic dust', 'magic', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 q = u * ASP; vec3 s = vec3(0.);
    for (int k = 0; k < 3; k++){ float fk = float(k); vec4 e = cell(q + vec2(sin(t * .7 + fk) * .05, 0.), 9. + fk * 5., vec2(.02 * (fk - 1.), .12 + fk * .05), S + fk * 4.);
      float tw = .5 + .5 * sin(t * 6. + e.z * 30.); s += vec3(1., .82, .35) * (smoothstep(.22, .0, length(e.xy)) * 1.4 + glint(e.xy, .5) * .5) * tw * step(.4, e.w); }
    return addl(c, s * A); }`),
  fx('twinkle', 'Twinkle stars', 'magic', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 q = u * ASP; vec4 e = cell(q, 6., vec2(0.), S); float ph = fract(e.z * 3. + t * .6);
    float life = smoothstep(0., .25, ph) * smoothstep(1., .5, ph); vec2 p = rot(t * .8 + e.z * 6.) * e.xy;
    float d = sdStar(p, .26 * (.6 + .4 * e.w), .45); float a = smoothstep(.02, -.02, d) * life * step(.3, e.w);
    vec3 col = mix(vec3(1., .85, .2), vec3(1.), .3); return over(c, col, a * A); }`),
  fx('bokeh', 'Bokeh', 'magic', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 q = u * ASP; vec3 s = vec3(0.);
    for (int k = 0; k < 2; k++){ float fk = float(k); vec4 e = cell(q, 3. + fk * 2., vec2(.015, .03 + fk * .02), S + fk * 3.);
      float r = .3 + .15 * e.z; float d = length(e.xy); float m = smoothstep(r, r - .06, d) * (.55 + .45 * smoothstep(r - .1, r, d)); s += hsv(vec3(.08 + e.w * .25, .5, 1.)) * m * .35 * step(.3, e.z); }
    return addl(c, s * A); }`),
  fx('fireflies', 'Fireflies', 'magic', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 q = u * ASP; vec4 e = cell(q + .03 * vec2(sin(t + u.y * 6.), cos(t * .8 + u.x * 5.)), 7., vec2(.0, .02), S);
    float pul = .5 + .5 * sin(t * 3. + e.z * 20.); float d = length(e.xy); vec3 col = vec3(.75, 1., .35);
    return addl(c * (1. - .25 * A), col * (exp(-d * d * 60.) * 1.2 + exp(-d * d * 8.) * .25) * pul * step(.45, e.w) * A); }`),
  fx('shimmer', 'Shimmer sweep', 'magic', `vec4 fx(vec2 u){ vec4 c = src(u); float ph = fract(t / 1.6); float x = (u.x + u.y * .5) - (ph * 2.4 - .6);
    float b = exp(-x * x * 120.) + .4 * exp(-x * x * 20.); return addl(c, vec3(1., .97, .85) * b * .55 * A * c.a); }`),
  fx('halo', 'Halo rays', 'magic', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 lp = vec2(.5, 1.05); vec2 d = u - lp; float a = atan(d.x, -d.y);
    float r = .5 + .5 * sin(a * 18. + t * .8) * sin(a * 7. - t * .5); float fall = smoothstep(1.2, .0, length(d * ASP));
    vec4 acc = vec4(0.); for (int i = 0; i < 12; i++){ float k = float(i) / 12.; acc += src(mix(u, lp, k * .35)); } float br = max(lum(unpm(acc / 12.)) - .55, 0.) * 2.;
    return addl(c, vec3(1., .95, .8) * (r * fall * .35 + br * .35) * A); }`),
  // party
  fx('confetti', 'Confetti', 'party', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 q = u * ASP;
    for (int k = 0; k < 3; k++){ float fk = float(k); vec4 e = cell(q + vec2(sin(t * 2. + fk + u.y * 5.) * .02, 0.), 6. + fk * 3., vec2(.03, .25 + fk * .06), S + fk * 5.);
      vec2 p = rot(t * (2. + e.z * 4.) + e.w * 6.) * e.xy; p.x *= 1. + .9 * abs(sin(t * 5. + e.z * 9.)); vec2 b = abs(p) - vec2(.16, .07); float d = length(max(b, 0.)) + min(max(b.x, b.y), 0.);
      vec3 col = hsv(vec3(fract(e.z * 3.7), .75, 1.)); c = over(c, col, smoothstep(.02, -.01, d) * step(.25, e.w) * A); }
    return c; }`),
  fx('bubbles', 'Bubbles', 'party', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 q = u * ASP;
    for (int k = 0; k < 2; k++){ float fk = float(k); vec4 e = cell(q + vec2(sin(t * 1.3 + u.y * 8. + fk) * .02, 0.), 4. + fk * 3., vec2(0., -.12 - fk * .05), S + fk * 7.);
      float r = .18 + .14 * e.z; float d = length(e.xy); float ring = smoothstep(r, r - .03, d) * smoothstep(r - .09, r - .02, d); vec2 hl = e.xy - vec2(-.35, .35) * r;
      float sh = smoothstep(r * .3, 0., length(hl)); vec3 col = mix(vec3(.75, .95, 1.), hsv(vec3(fract(d * 2. + t * .2), .4, 1.)), .4);
      c = over(c, col, (ring * .7 + sh * .9 + smoothstep(r, 0., d) * .08) * step(.35, e.w) * A); }
    return c; }`),
  fx('hearts', 'Floating hearts', 'party', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 q = u * ASP;
    for (int k = 0; k < 2; k++){ float fk = float(k); vec4 e = cell(q + vec2(sin(t * 1.5 + u.y * 6. + fk * 2.) * .03, 0.), 4. + fk * 3., vec2(0., -.14 - fk * .05), S + fk * 11.);
      vec2 p = rot(sin(t * 2. + e.z * 6.) * .3) * e.xy; float s = .22 + .1 * e.z; float d = sdHeart(p / s * vec2(1., -1.) + vec2(0., .55)) * s;
      vec3 col = mix(vec3(1., .25, .45), vec3(1., .55, .75), e.w); c = over(c, col * (1. - .25 * smoothstep(-.1, .05, p.y)), smoothstep(.01, -.01, d) * step(.35, e.w) * A); }
    return c; }`),
  fx('fireworks', 'Fireworks', 'party', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 q = u * ASP; vec3 s = vec3(0.);
    for (int b = 0; b < 4; b++){ float fb = float(b), per = 1.7 + fb * .23; float k = floor((t + fb * .41) / per), ph = fract((t + fb * .41) / per);
      vec2 cen = vec2(.15 + .7 * hash1(k * 7.1 + fb + S), .45 + .4 * hash1(k * 3.3 + fb * 2. + S)) * ASP; vec3 col = hsv(vec3(hash1(k + fb * 5. + S), .7, 1.));
      float rad = .32 * sqrt(ph), fade = (1. - ph) * (1. - ph);
      for (int i = 0; i < 18; i++){ float a = float(i) / 18. * 2. * PI + hash1(k + fb) * 6.; vec2 pp = cen + vec2(cos(a), sin(a)) * rad - vec2(0., .08 * ph * ph);
        float d = length(q - pp); s += col * (exp(-d * d * 2500.) * 1.6 + exp(-d * d * 300.) * .3) * fade; } }
    return addl(c, s * A); }`),
  fx('rainbow', 'Rainbow glow', 'party', `vec4 fx(vec2 u){ vec4 c = src(u); vec3 col = hsv(vec3(fract(u.x * .6 + u.y * .3 - t * .25), .7, 1.)); vec3 b = unpm(c);
    vec3 r = mix(b, b * .6 + col * .55 * (.4 + lum(b)), A * .8); return vec4(r * c.a, c.a); }`),
  fx('disco', 'Disco lights', 'party', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 p = (u - vec2(.5, 1.1)) * ASP; float a = atan(p.x, -p.y); vec3 s = vec3(0.);
    for (int i = 0; i < 3; i++){ float fi = float(i); float beam = smoothstep(.12, .0, abs(sin(a * 3. + t * (1. + fi * .4) + fi * 2.)) ); s += hsv(vec3(fi / 3. + t * .1, .8, 1.)) * beam * .45; }
    vec3 b = unpm(c) * (1. - .35 * A); return vec4((b + s * A * smoothstep(1.6, .2, length(p))) * c.a, c.a); }`),
  fx('starrain', 'Star shower', 'party', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 q = u * ASP;
    for (int k = 0; k < 2; k++){ float fk = float(k); vec4 e = cell(q, 5. + fk * 3., vec2(.02, .3 + fk * .1), S + fk * 13.); vec2 p = rot(t * 2. + e.z * 9.) * e.xy;
      float d = sdStar(p, .17 + .06 * e.z, .45); vec3 col = hsv(vec3(.12 + .1 * e.w, .8, 1.)); c = over(c, col, smoothstep(.02, -.01, d) * step(.4, e.w) * A); }
    return c; }`),
  fx('balloons', 'Balloons', 'party', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 q = u * ASP; vec4 e = cell(q + vec2(sin(t + u.y * 4.) * .02, 0.), 3., vec2(0., -.1), S);
    vec2 p = e.xy * vec2(1., .85); float d = length(p - vec2(0., .06)) - .2; float str = smoothstep(.012, .0, abs(e.x + sin(e.y * 20.) * .01)) * step(e.y, -.14) * step(-.4, e.y);
    vec3 col = hsv(vec3(e.z, .75, 1.)); float sh = smoothstep(.08, .0, length(p - vec2(-.07, .14)));
    return over(over(c, vec3(.9), str * step(.35, e.w) * A), col + sh * .5, smoothstep(.01, -.01, d) * step(.35, e.w) * A); }`),
  // weather
  fx('snow', 'Snow', 'weather', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 q = u * ASP; float s = 0.;
    for (int k = 0; k < 3; k++){ float fk = float(k); vec4 e = cell(q + vec2(sin(t * .8 + u.y * 4. + fk * 2.) * .03, 0.), 5. + fk * 5., vec2(.02, .12 + fk * .06), S + fk * 3.);
      s += smoothstep(.2 - fk * .03, .05, length(e.xy)) * step(.25, e.w) * (1. - fk * .2); }
    return over(c, vec3(1.), s * A); }`),
  fx('rain', 'Rain', 'weather', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 q = u * ASP; q.x += q.y * .15; float s = 0.;
    for (int k = 0; k < 3; k++){ float fk = float(k); vec2 g = q * vec2(30. + fk * 10., 2.5 + fk) + vec2(0., t * (5. + fk * 2.)); vec2 id = floor(g), f = fract(g); float r = hash(id + S + fk);
      s += smoothstep(.1, .0, abs(f.x - .5) - .02) * smoothstep(.0, .3, f.y) * smoothstep(1., .55, f.y) * step(.6, r) * .55; }
    vec3 b = unpm(c) * (1. - .2 * A) + vec3(.0, .02, .05) * A; return over(vec4(b * c.a, c.a), vec3(.8, .88, 1.), s * A); }`),
  fx('leaves', 'Falling leaves', 'weather', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 q = u * ASP;
    for (int k = 0; k < 2; k++){ float fk = float(k); vec4 e = cell(q + vec2(sin(t * 1.4 + u.y * 5. + fk) * .05, 0.), 4. + fk * 2., vec2(.04, .14 + fk * .04), S + fk * 17.);
      vec2 p = rot(t * (1. + e.z) + e.w * 6.) * e.xy; p.x *= 1. + .6 * sin(t * 3. + e.z * 7.); float d = length(p * vec2(1., 2.2)) - .17;
      vec3 col = mix(vec3(1., .45, .05), vec3(.85, .15, .05), e.z); col = mix(col, vec3(.95, .75, .1), step(.7, e.z)); c = over(c, col * (.8 + .4 * smoothstep(.1, -.1, p.x)), smoothstep(.01, -.01, d) * step(.4, e.w) * A); }
    return c; }`),
  fx('fog', 'Fog', 'weather', `vec4 fx(vec2 u){ vec4 c = src(u); float f = fbm(u * ASP * 2.5 + vec2(t * .08, t * .03)) * .8 + fbm(u * ASP * 6. - vec2(t * .12, 0.)) * .3;
    f *= .5 + .7 * (1. - u.y); return over(c, vec3(.92, .94, .97), clamp(f, 0., 1.) * .75 * A); }`),
  fx('lightning', 'Lightning', 'weather', `vec4 fx(vec2 u){ vec4 c = src(u); float k = floor(t / 1.3), ph = fract(t / 1.3); float fl = (exp(-ph * 30.) + .6 * exp(-abs(ph - .12) * 40.)) * step(.2, hash1(k + S));
    float x = .3 + .4 * hash1(k * 3. + S); float bolt = 0.; float px = x; for (int i = 0; i < 10; i++){ float y0 = 1. - float(i) * .1; float nx = px + (hash1(k * 11. + float(i)) - .5) * .12; if (u.y < y0 && u.y > y0 - .1){ float xx = mix(px, nx, (y0 - u.y) / .1); bolt = max(bolt, smoothstep(.006, .0, abs(u.x - xx))); } px = nx; }
    vec3 b = unpm(c) * (1. - .3 * A) + vec3(.7, .75, 1.) * fl * .7 * A; return addl(vec4(b * c.a, c.a), vec3(.85, .9, 1.) * bolt * fl * 2. * A); }`),
  fx('sunbeams', 'Sunbeams', 'weather', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 d = u - vec2(.85, 1.); float a = atan(d.y, d.x); float r = .5 + .5 * sin(a * 24. + sin(t * .7) * 2.) * sin(a * 9. - t * .4);
    float f = smoothstep(1.4, 0., length(d * ASP)); vec3 col = vec3(1., .9, .6); return addl(c * (1. + .1 * A), col * (r * .35 + .25) * f * A); }`),
  // light
  fx('glow', 'Glow', 'light', `vec4 fx(vec2 u){ vec4 c = src(u), b = blurD(u, .03); vec3 g = max(unpm(b) - .45, 0.) * b.a; return addl(c, g * 1.6 * A); }`),
  fx('bloom', 'Bloom', 'light', `vec4 fx(vec2 u){ vec4 c = src(u); vec4 b = blurD(u, .06) * .6 + blurD(u, .02) * .4; vec3 g = max(b.rgb - .55, 0.) * 2.2; return addl(c, g * A); }`),
  fx('lightleak', 'Light leak', 'light', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 p = u * ASP; vec3 s = vec3(0.);
    for (int i = 0; i < 3; i++){ float fi = float(i); vec2 cen = vec2(.5 + .8 * sin(t * .23 + fi * 2.1 + S), .5 + .6 * cos(t * .19 + fi * 1.3)) * ASP; float d = length(p - cen);
      s += mix(vec3(1., .45, .15), vec3(1., .2, .45), fi / 2.) * exp(-d * d * 3.) * .55; }
    vec3 b = unpm(c); vec3 r = 1. - (1. - b) * (1. - s * A); return vec4(r * c.a, c.a); }`),
  fx('flash', 'Flash', 'light', `vec4 fx(vec2 u){ vec4 c = src(u); float f = exp(-t * 6.) + exp(-max(D - t, 0.) * 6.) * .0; vec3 b = unpm(c); return vec4(mix(b, vec3(1.), clamp(f * A * 1.2, 0., 1.)) * c.a, c.a); }`),
  fx('strobe', 'Strobe', 'light', `vec4 fx(vec2 u){ vec4 c = src(u); float on = step(.5, fract(t * 6.)); vec3 b = unpm(c); b = mix(b, mix(vec3(1.), b * .3, on), A * .85); return vec4(b * c.a, c.a); }`),
  fx('vignettepulse', 'Vignette pulse', 'light', `vec4 fx(vec2 u){ vec4 c = src(u); float p = .5 + .5 * sin(t * PI * 1.6); vec2 q = (u - .5) * ASP / max(ASP.x, ASP.y);
    float v = smoothstep(.25 + .12 * p, .85, length(q) * 1.3); return vec4(c.rgb * (1. - v * A * .95), c.a); }`),
  fx('dreamy', 'Dreamy', 'light', `vec4 fx(vec2 u){ vec4 c = src(u), b = blurD(u, .04); vec3 x = unpm(c), y = unpm(b); vec3 sl = 1. - (1. - x) * (1. - y * .85); vec3 r = mix(x, sl * vec3(1.02, .98, 1.04) + .03, A * .9); return vec4(clamp(r, 0., 1.) * c.a, c.a); }`),
  fx('lensflare', 'Lens flare', 'light', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 lp = vec2(.75 + .1 * sin(t * .5), .8); vec2 p = (u - lp) * ASP, ax = (vec2(.5) - lp) * ASP; vec3 s = vec3(1., .9, .7) * exp(-dot(p, p) * 30.) * 1.2;
    for (int i = 1; i < 6; i++){ float fi = float(i); vec2 g = p - ax * fi * .45; float r = .03 + .025 * fi; s += hsv(vec3(fi * .17, .5, 1.)) * smoothstep(r, r * .7, length(g)) * .18; }
    s += vec3(1., .85, .6) * exp(-abs(p.y) * 120.) * exp(-abs(p.x) * 3.) * .5; return addl(c, s * A); }`),
  // retro
  fx('grain', 'Film grain', 'retro', `vec4 fx(vec2 u){ vec4 c = src(u); float n = hash(floor(u * R / max(1., min(R.x, R.y) / 540.)) + floor(t * 24.) * 1.37) - .5; vec3 b = unpm(c); b += n * .22 * A * (1. - abs(lum(b) - .5)); return vec4(clamp(b, 0., 1.) * c.a, c.a); }`),
  fx('vhs', 'VHS', 'retro', `vec4 fx(vec2 u){ float j = (noise(vec2(u.y * 40., t * 8.)) - .5) * .006 * A + step(.985, hash(vec2(floor(u.y * 60.), floor(t * 12.)))) * .02 * A; vec2 uu = u + vec2(j, 0.);
    float sh = .004 * A; vec4 r = src(uu + vec2(sh, 0.)), g = src(uu), b = src(uu - vec2(sh, 0.)); vec3 col = vec3(r.r, g.g, b.b);
    col *= .92 + .08 * sin(u.y * R.y * 1.2); col = mix(col, vec3(lum(col)) * vec3(1.05, 1., .9), .25 * A); col += (hash(u * R + t) - .5) * .06 * A;
    float bar = smoothstep(.0, .04, abs(fract(u.y - t * .15) - .5) - .45) ; col *= 1. - (1. - bar) * .15 * A; return vec4(clamp(col, 0., 1.), g.a); }`),
  fx('oldfilm', 'Old film', 'retro', `vec4 fx(vec2 u){ vec2 uu = u + vec2(0., (hash1(floor(t * 12.) + S) - .5) * .004 * A); vec4 c = src(uu); vec3 b = unpm(c); float l = lum(b);
    vec3 sep = vec3(l) * vec3(1.07, .93, .72) + .03; float fl = .92 + .08 * hash1(floor(t * 12.)); vec2 q = (u - .5) * ASP / max(ASP.x, ASP.y); float vg = 1. - smoothstep(.3, .95, length(q) * 1.25);
    float scr = smoothstep(.003, .0, abs(u.x - hash1(floor(t * 6.) + 1.))) * step(.5, hash1(floor(t * 6.) + 2.)); float dust = step(.997, hash(floor(u * R / 3.) + floor(t * 12.)));
    vec3 r = mix(b, sep * fl * vg, A); r = mix(r, vec3(.95), (scr * .5 + dust * .6) * A); r += (hash(u * R + floor(t * 24.)) - .5) * .08 * A; return vec4(clamp(r, 0., 1.) * c.a, c.a); }`),
  fx('scanlines', 'Scanlines', 'retro', `vec4 fx(vec2 u){ vec4 c = src(u); float s = .5 + .5 * sin(u.y * min(R.x, R.y) * .9 * PI); return vec4(c.rgb * (1. - .35 * A * s), c.a); }`),
  fx('glitch', 'Glitch', 'retro', `vec4 fx(vec2 u){ float k = floor(t * 10.); float on = step(.45, hash1(k + S)); float band = step(.7, hash(vec2(floor(u.y * 18.), k)));
    vec2 uu = u + vec2((hash(vec2(floor(u.y * 18.), k + 1.)) - .5) * .12 * band * on * A, 0.); float s = .012 * A * (.3 + on);
    vec4 r = src(uu + vec2(s, 0.)), g = src(uu), b = src(uu - vec2(s, 0.)); vec3 col = vec3(r.r, g.g, b.b); col = mix(col, 1. - col, band * on * step(.85, hash1(k * 3.)) * A); return vec4(col, max(g.a, max(r.a, b.a))); }`),
  fx('rgbsplit', 'RGB split', 'retro', `vec4 fx(vec2 u){ float s = (.006 + .004 * sin(t * 4.)) * A; vec2 d = (u - .5) * s * 2. + vec2(s, 0.); vec4 r = src(u + d), g = src(u), b = src(u - d); return vec4(r.r, g.g, b.b, max(g.a, max(r.a, b.a))); }`),
  fx('crt', 'Old TV', 'retro', `vec4 fx(vec2 u){ vec2 p = u * 2. - 1.; vec2 w = p * (1. + A * .12 * dot(p.yx, p.yx)); vec2 uu = w * .5 + .5; vec4 c = src(uu);
    float m = step(0., uu.x) * step(uu.x, 1.) * step(0., uu.y) * step(uu.y, 1.); vec3 col = c.rgb * (.85 + .15 * sin(uu.y * R.y * 1.5)); col *= 1. - .4 * A * smoothstep(.6, 1.4, length(p));
    return vec4(col * m, c.a * m); }`),
  fx('static', 'TV static', 'retro', `vec4 fx(vec2 u){ vec4 c = src(u); float n = hash(floor(u * R / max(1., min(R.x, R.y) / 360.)) + floor(t * 30.)); float roll = smoothstep(.0, .1, abs(fract(u.y + t * .6) - .5)); vec3 b = mix(unpm(c), vec3(n) * roll, A * .55); return vec4(b * c.a, c.a); }`),
  // motion (the picture moves; keyframe-free)
  fx('shake', 'Shake', 'motion', `vec4 fx(vec2 u){ vec2 o = (vec2(noise(vec2(t * 18., S)), noise(vec2(S, t * 18.))) - .5) * .05 * A; return src((u - .5) / (1. + .06 * A) + .5 + o); }`),
  fx('earthquake', 'Earthquake', 'motion', `vec4 fx(vec2 u){ vec2 o = (vec2(noise(vec2(t * 30., S)), noise(vec2(S + 3., t * 30.))) - .5) * .12 * A; float r = (noise(vec2(t * 20., 9.)) - .5) * .06 * A; vec2 p = rot(r) * (u - .5); return src(p / (1. + .14 * A) + .5 + o); }`),
  fx('zoompulse', 'Zoom pulse', 'motion', `vec4 fx(vec2 u){ float z = 1. + .12 * A * pow(.5 + .5 * sin(t * PI * 2. * .9), 2.); return src((u - .5) / z + .5); }`),
  fx('heartbeat', 'Heartbeat zoom', 'motion', `vec4 fx(vec2 u){ float x = fract(t * 1.1); float b = exp(-pow((x - .1) / .05, 2.)) + .6 * exp(-pow((x - .3) / .06, 2.)); float z = 1. + .1 * A * b; return src((u - .5) / z + .5); }`),
  fx('motionblur', 'Motion blur', 'motion', `vec4 fx(vec2 u){ return blurDir(u, vec2(.06 * A, 0.)); }`),
  fx('lensblur', 'Lens blur', 'motion', `vec4 fx(vec2 u){ return blurD(u, .035 * A); }`),
  fx('zoomblur', 'Zoom blur', 'motion', `vec4 fx(vec2 u){ vec4 s = vec4(0.); for (int i = 0; i < 24; i++){ float k = float(i) / 23.; s += src(.5 + (u - .5) * (1. - k * .14 * A)); } return s / 24.; }`),
  fx('swingcam', 'Swing', 'motion', `vec4 fx(vec2 u){ float a = sin(t * 2.2) * .07 * A; vec2 p = rot(a) * ((u - .5) * ASP) / ASP; return src(p / (1. + .1 * A) + .5); }`),
  // beat accents: strongest at the clip's first frame, then decay (put the effect clip on the beat)
  fx('beatpunch', 'Zoom punch (beat)', 'motion', `vec4 fx(vec2 u){ float z = 1. + .2 * A * exp(-t * 7.); return src((u - .5) / z + .5); }`),
  fx('beatshake', 'Hit shake (beat)', 'motion', `vec4 fx(vec2 u){ float e = exp(-t * 5.); vec2 o = (vec2(noise(vec2(t * 26., S)), noise(vec2(S + 5., t * 26.))) - .5) * .09 * A * e; return src((u - .5) / (1. + .1 * A * e) + .5 + o); }`),
  fx('beatrgb', 'RGB hit (beat)', 'motion', `vec4 fx(vec2 u){ float e = exp(-t * 6.) * A; vec2 d = (u - .5) * .04 * e; vec4 c = src(u); float r = src(u + d).r, b = src(u - d).b; float z = 1. + .08 * e; vec4 m = src((u - .5) / z + .5); return vec4(r, m.g, b, c.a); }`),
  fx('slowzoom', 'Slow zoom', 'motion', `vec4 fx(vec2 u){ float z = 1. + .25 * A * clamp(t / max(D, .1), 0., 1.); return src((u - .5) / z + .5); }`),
  fx('wobble', 'Wobble', 'motion', `vec4 fx(vec2 u){ vec2 o = vec2(sin(u.y * 10. + t * 4.), cos(u.x * 10. + t * 3.)) * .01 * A; return src(u + o); }`),
  // distort
  fx('heatwave', 'Heat wave', 'distort', `vec4 fx(vec2 u){ float n = noise(vec2(u.x * 12., u.y * 18. - t * 4.)) - .5; return src(u + vec2(n * .012, n * .008) * A * (1.2 - u.y)); }`),
  fx('underwater', 'Underwater', 'distort', `vec4 fx(vec2 u){ vec2 o = vec2(sin(u.y * 14. + t * 2.), cos(u.x * 11. + t * 1.6)) * .006 * A; vec4 c = src(u + o); vec3 b = unpm(c);
    float cau = pow(noise(u * ASP * 9. + vec2(t * .6, t * .4)) * noise(u * ASP * 7. - t * .5), 1.5) * 1.6; b = mix(b, b * vec3(.55, .85, 1.05) + vec3(0., .05, .1) + cau * vec3(.25, .4, .45), A); return vec4(clamp(b, 0., 1.) * c.a, c.a); }`),
  fx('ripple', 'Ripple', 'distort', `vec4 fx(vec2 u){ vec2 p = (u - .5) * ASP; float d = length(p); vec2 o = normalize(p + 1e-5) * sin(d * 40. - t * 6.) * .008 * A * smoothstep(1., .0, d); return src(u + o / ASP); }`),
  fx('swirl', 'Swirl', 'distort', `vec4 fx(vec2 u){ vec2 p = (u - .5) * ASP; float d = length(p); float a = (1. - smoothstep(0., .7, d)) * 2.5 * A * sin(t * 1.2); p = rot(a) * p; return src(p / ASP + .5); }`),
  fx('fisheye', 'Fisheye', 'distort', `vec4 fx(vec2 u){ vec2 p = (u - .5) * 2.; float r = length(p); vec2 q = p * mix(1., .55 + .45 * r * r, A * .9); vec2 uu = q * .5 + .5; float m = step(0., uu.x) * step(uu.x, 1.) * step(0., uu.y) * step(uu.y, 1.); return src(uu) * m; }`),
  fx('bulge', 'Bulge pulse', 'distort', `vec4 fx(vec2 u){ vec2 p = (u - .5) * ASP; float d = length(p); float k = .35 * A * (.5 + .5 * sin(t * 3.)); vec2 q = p * (1. - k * smoothstep(.6, 0., d)); return src(q / ASP + .5); }`),
  fx('mirror', 'Mirror', 'mirror', `vec4 fx(vec2 u){ vec2 m = vec2(u.x < .5 ? u.x : 1. - u.x, u.y); return mix(src(u), src(m), step(.001, A)); }`),
  fx('mirror4', 'Mirror ×4', 'mirror', `vec4 fx(vec2 u){ return src(abs(u * 2. - 1.) * .5 + .25); }`),
  fx('kaleidoscope', 'Kaleidoscope', 'mirror', `vec4 fx(vec2 u){ vec2 p = (u - .5) * ASP; float r = length(p), a = atan(p.y, p.x) + t * .2; float n = 6., s = 2. * PI / n; a = mod(a, s); a = abs(a - s * .5);
    vec2 q = vec2(cos(a), sin(a)) * r; return mix(src(u), src(q / ASP + .5), step(.001, A) * clamp(A * 1.5, 0., 1.)); }`),
  // mirror (Batch 10)
  fx('mirrorv', 'Mirror top', 'mirror', `vec4 fx(vec2 u){ vec2 m = vec2(u.x, u.y > .5 ? u.y : 1. - u.y);   /* GL v runs bottom -> top */ return mix(src(u), src(m), step(.001, A)); }`),
  fx('mirrorr', 'Mirror right', 'mirror', `vec4 fx(vec2 u){ vec2 m = vec2(u.x > .5 ? u.x : 1. - u.x, u.y); return mix(src(u), src(m), step(.001, A)); }`),
  fx('mirrorb', 'Mirror bottom', 'mirror', `vec4 fx(vec2 u){ vec2 m = vec2(u.x, u.y < .5 ? u.y : 1. - u.y); return mix(src(u), src(m), step(.001, A)); }`),
  fx('kaleido4', 'Kaleido 4', 'mirror', `vec4 fx(vec2 u){ return mix(src(u), src(KAL(u, 4.)), step(.001, A)); }`),
  fx('kaleido8', 'Kaleido 8', 'mirror', `vec4 fx(vec2 u){ return mix(src(u), src(KAL(u, 8.)), step(.001, A)); }`),
  fx('kaleido12', 'Kaleido 12', 'mirror', `vec4 fx(vec2 u){ return mix(src(u), src(KAL(u, 12.)), step(.001, A)); }`),
  fx('kaleidospin', 'Kaleido spin', 'mirror', `vec4 fx(vec2 u){ vec2 p = (u - .5) * ASP; float r = length(p), a = atan(p.y, p.x) + t * .6; float s = 2. * PI / 8.; a = mod(a, s); a = abs(a - s * .5);
    vec2 q = vec2(cos(a), sin(a)) * r; return mix(src(u), src(clamp(q / ASP + .5, 0., 1.)), step(.001, A)); }`),
  fx('tile4', 'Tiles 2×2', 'mirror', `vec4 fx(vec2 u){ return mix(src(u), src(fract(u * 2.)), step(.001, A)); }`),
  fx('tile9', 'Tiles 3×3', 'mirror', `vec4 fx(vec2 u){ return mix(src(u), src(fract(u * 3.)), step(.001, A)); }`),
  fx('mirrortile', 'Mirror tiles', 'mirror', `vec4 fx(vec2 u){ vec2 g = u * 3., f = fract(g), k = floor(g); f = mix(f, 1. - f, mod(k, 2.)); return mix(src(u), src(f), step(.001, A)); }`),
  fx('pixel', 'Pixel', 'distort', `vec4 fx(vec2 u){ float n = mix(min(R.x, R.y), 24., A); vec2 g = vec2(n) * ASP; return src((floor(u * g) + .5) / g); }`),
  // art
  fx('cartoon', 'Cartoon', 'art', `vec4 fx(vec2 u){ vec4 c = src(u); vec3 b = unpm(blurD(u, .006)); b = floor(b * 6. + .5) / 6.; vec2 px = 1.5 / R;
    float e = length(vec2(lum(src(u + vec2(px.x, 0.)).rgb) - lum(src(u - vec2(px.x, 0.)).rgb), lum(src(u + vec2(0., px.y)).rgb) - lum(src(u - vec2(0., px.y)).rgb)));
    b = mix(b, vec3(.05), smoothstep(.12, .3, e)); b = mix(vec3(lum(b)), b, 1.3); return vec4(mix(unpm(c), clamp(b, 0., 1.), A) * c.a, c.a); }`),
  fx('posterize', 'Posterize', 'art', `vec4 fx(vec2 u){ vec4 c = src(u); vec3 b = unpm(c); float n = mix(16., 3., A); return vec4(floor(b * n + .5) / n * c.a, c.a); }`),
  fx('edges', 'Edge outline', 'art', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 px = 1.2 / R * max(1., min(R.x, R.y) / 720.); float gx = 0., gy = 0.;
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++){ float l = lum(src(u + vec2(i, j) * px).rgb); gx += l * float(i) * (j == 0 ? 2. : 1.); gy += l * float(j) * (i == 0 ? 2. : 1.); }
    float e = smoothstep(.15, .5, length(vec2(gx, gy))); vec3 b = mix(unpm(c), vec3(1. - e * .9), A); return vec4(b * c.a, c.a); }`),
  fx('halftone', 'Comic dots', 'art', `vec4 fx(vec2 u){ vec4 c = src(u); vec3 b = unpm(c); float n = 90.; vec2 q = rot(.6) * (u * ASP) * n; vec2 f = fract(q) - .5; float l = lum(b);
    float dot_ = smoothstep(.05, -.05, length(f) - .55 * sqrt(1. - l)); vec3 r = mix(b * 1.1, b * .25, dot_); return vec4(mix(b, clamp(r, 0., 1.), A) * c.a, c.a); }`),
  fx('sketch', 'Pencil sketch', 'art', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 px = 1.5 / R; float l = lum(unpm(c)); float bl = lum(unpm(blurD(u, .01)));
    float s = clamp(l / max(bl, .01), 0., 1.); s = pow(s, 3.); float hat = .92 + .08 * sin((u.x + u.y) * R.y * .7); vec3 r = vec3(s * hat) * vec3(1., .98, .94); return vec4(mix(unpm(c), r, A) * c.a, c.a); }`),
  fx('neonedges', 'Neon edges', 'art', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 px = 1.5 / R * max(1., min(R.x, R.y) / 720.); float e = length(vec2(lum(src(u + vec2(px.x, 0.)).rgb) - lum(src(u - vec2(px.x, 0.)).rgb), lum(src(u + vec2(0., px.y)).rgb) - lum(src(u - vec2(0., px.y)).rgb))) * 4.;
    vec3 col = hsv(vec3(fract(u.x * .5 + u.y * .5 + t * .2), .8, 1.)) * clamp(e, 0., 1.) * 1.5; vec3 r = mix(unpm(c), unpm(c) * .15 + col, A); return vec4(clamp(r, 0., 1.) * c.a, c.a); }`),
  fx('emboss', 'Emboss', 'art', `vec4 fx(vec2 u){ vec4 c = src(u); vec2 px = 1.5 / R; float e = lum(src(u - px).rgb) - lum(src(u + px).rgb); vec3 r = vec3(.5 + e * 2.) * vec3(1., .97, .92); return vec4(mix(unpm(c), clamp(r, 0., 1.), A) * c.a, c.a); }`),
  fx('thermal', 'Heat vision', 'art', `vec4 fx(vec2 u){ vec4 c = src(u); float l = lum(unpm(c)); vec3 r = l < .33 ? mix(vec3(0., 0., .4), vec3(.6, 0., .8), l * 3.) : l < .66 ? mix(vec3(.6, 0., .8), vec3(1., .5, 0.), (l - .33) * 3.) : mix(vec3(1., .5, 0.), vec3(1., 1., .6), (l - .66) * 3.); return vec4(mix(unpm(c), r, A) * c.a, c.a); }`),
];
export const effectById = id => EFFECTS.find(e => e.id === id);
export const filterGL = id => FILTER_DEFS.find(f => f.id === id);
export const DEFAULT_EFFECT_AMOUNT = 0.8;

/* ---------------- GL plumbing ---------------- */
let G = null, failed = false;
function init() {
  if (G || failed) return G;
  try {
    const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(4, 4) : document.createElement('canvas');
    const gl = cv.getContext('webgl2', { premultipliedAlpha: true, preserveDrawingBuffer: true, antialias: false, alpha: true });
    if (!gl) { failed = true; return null; }
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    G = { cv, gl, progs: new Map(), tex: [], fbo: [], w: 0, h: 0, src: gl.createTexture() };
    cv.addEventListener && cv.addEventListener('webglcontextlost', e => { e.preventDefault(); G = null; });
    return G;
  } catch (e) { console.warn('effects GL', e); failed = true; return null; }
}
export const fxAvailable = () => !!init();
function prog(key, body, head = HEAD, main = MAIN) {
  let P = G.progs.get(key); if (P) return P;
  const gl = G.gl, sh = (type, s) => { const o = gl.createShader(type); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(key + ': ' + gl.getShaderInfoLog(o)); return o; };
  const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, head + body + main)); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(key + ': ' + gl.getProgramInfoLog(p));
  const U = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); U[a.name] = gl.getUniformLocation(p, a.name); }
  P = { p, U }; G.progs.set(key, P); return P;
}
function texSetup(gl, t) { gl.bindTexture(gl.TEXTURE_2D, t); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
function targets(w, h) {
  const gl = G.gl; if (G.w === w && G.h === h && G.tex.length) return;
  for (const t of G.tex) gl.deleteTexture(t); for (const f of G.fbo) gl.deleteFramebuffer(f); G.tex = []; G.fbo = [];
  for (let i = 0; i < 2; i++) { const t = gl.createTexture(); texSetup(gl, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0); G.tex.push(t); G.fbo.push(f); }
  G.w = w; G.h = h; G.cv.width = w; G.cv.height = h;
}
const seedOf = s => { if (typeof s === 'number') return s; let h = 7; for (const ch of String(s || '')) h = (h * 31 + ch.charCodeAt(0)) % 9973; return h / 97; };
/** Run a chain of filters / effects over an image. Returns the GL canvas (valid until the next call) or null when unavailable. */
export function applyChain(img, w, h, chain) {
  chain = (chain || []).filter(x => x && x.id && (x.amount ?? 1) > 0.001 && (x.kind === 'color' ? !!x.p : x.kind === 'filter' ? filterGL(x.id) : effectById(x.id)));
  if (!chain.length || !init()) return null;
  w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
  const gl = G.gl;
  try {
    targets(w, h);
    // ImageBitmap / VideoFrame ignore UNPACK_FLIP_Y, so bring them onto a 2D canvas first (keeps every source the same way up)
    if ((typeof ImageBitmap !== 'undefined' && img instanceof ImageBitmap) || (typeof VideoFrame !== 'undefined' && img instanceof VideoFrame)) {
      const sw = img.width || img.displayWidth, sh = img.height || img.displayHeight;
      if (!G.up || G.up.width !== sw || G.up.height !== sh) G.up = new OffscreenCanvas(sw, sh);
      const ux = G.up.getContext('2d'); ux.clearRect(0, 0, sw, sh); ux.drawImage(img, 0, 0); img = G.up;
    }
    gl.bindTexture(gl.TEXTURE_2D, G.src); texSetup(gl, G.src);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.viewport(0, 0, w, h); gl.disable(gl.BLEND); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    let input = G.src;
    chain.forEach((x, i) => {
      const last = i === chain.length - 1, f = x.kind === 'filter' ? filterGL(x.id) : null, P = x.kind === 'color' ? prog('color', COLOR) : f ? prog('grade', GRADE) : prog('fx:' + x.id, effectById(x.id).body);
      gl.useProgram(P.p); gl.bindFramebuffer(gl.FRAMEBUFFER, last ? null : G.fbo[i % 2]);
      gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, input); gl.uniform1i(P.U.T, 0);
      gl.uniform2f(P.U.R, w, h); gl.uniform1f(P.U.t, x.t || 0); gl.uniform1f(P.U.A, Math.max(0, Math.min(1, x.amount ?? 1))); gl.uniform1f(P.U.D, x.dur || 3); gl.uniform1f(P.U.S, seedOf(x.seed));
      if (f) { const q = { ...GRADE_DEFAULTS, ...f.p }; for (const k of ['lift', 'gam', 'gain', 'shc', 'hic', 'bwt']) P.U[k] && gl.uniform3fv(P.U[k], q[k]);
        for (const k of ['ex', 'con', 'sat', 'temp', 'tnt', 'hue', 'fade', 'vib', 'split', 'bw', 'vig', 'cross']) P.U[k] && gl.uniform1f(P.U[k], q[k]); }
      if (x.kind === 'color') colorUniforms(gl, P, x.p);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      input = G.tex[i % 2];
    });
    return G.cv;
  } catch (e) { console.warn('effects', e); return null; }
}

/* data textures for the colour pass (curve table 256x1, LUT atlas n² x n), cached by key */
function dataTex(key, w, h, data) {
  const gl = G.gl; G.dt ||= new Map(); let t = G.dt.get(key);
  if (!t) { t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); texSetup(gl, t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data); G.dt.set(key, t);
    if (G.dt.size > 40) { const k0 = G.dt.keys().next().value; gl.deleteTexture(G.dt.get(k0)); G.dt.delete(k0); } }
  return t;
}
function colorUniforms(gl, P, q) {
  const U = P.U;
  gl.uniform1f(U.useCv, q.cv ? 1 : 0); gl.uniform1f(U.LA, q.lut ? q.lutAmt : 0); gl.uniform1f(U.LN, q.lut ? q.lut.n : 2);
  for (const k of ['ex', 'con', 'sat', 'vig', 'grain', 'sharp']) U[k] && gl.uniform1f(U[k], q[k]);
  U.wl && gl.uniform3fv(U.wl, q.wl); U.wg && gl.uniform3fv(U.wg, q.wg); U.wn && gl.uniform3fv(U.wn, q.wn); U.wb && gl.uniform2fv(U.wb, q.wb);
  const hl = U['hs[0]'] || U.hs; hl && gl.uniform1fv(hl, q.hs);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, q.cv ? dataTex(q.cvKey, 256, 1, q.cv) : dataTex('cv:none', 1, 1, new Uint8Array(4))); gl.uniform1i(U.CV, 1);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, q.lut ? dataTex(q.lut.key, q.lut.n * q.lut.n, q.lut.n, q.lut.data) : dataTex('lt:none', 1, 1, new Uint8Array(4))); gl.uniform1i(U.LT, 2);
  gl.activeTexture(gl.TEXTURE0);
}
export const GRADE_DEFAULTS = { lift: [0, 0, 0], gam: [1, 1, 1], gain: [1, 1, 1], shc: [.5, .5, .5], hic: [.5, .5, .5], bwt: [1, 1, 1], ex: 0, con: 1, sat: 1, temp: 0, tnt: 0, hue: 0, fade: 0, vib: 0, split: 0, bw: 0, vig: 0, cross: 0 };
/** CSS approximation of a grade (used only when WebGL2 is missing). */
export function gradeCss(id, a = 1) {
  const f = filterGL(id); if (!f) return ''; const q = { ...GRADE_DEFAULTS, ...f.p }, m = (x, y) => x + (y - x) * a;
  return [`brightness(${m(1, Math.pow(2, q.ex) * (1 + q.fade * .05)).toFixed(3)})`, `contrast(${m(1, q.con * (1 - q.fade * .2)).toFixed(3)})`, `saturate(${m(1, q.sat * (1 - q.bw) * (1 + q.vib * .5)).toFixed(3)})`,
    q.temp > 0 ? `sepia(${(q.temp * .35 * a).toFixed(3)})` : '', q.hue || q.temp < 0 ? `hue-rotate(${((q.hue + (q.temp < 0 ? q.temp * 14 : 0)) * a).toFixed(1)}deg)` : ''].filter(Boolean).join(' ');
}

/* ---------------- GPU transitions (js/transitions.js, cat "Magic") ----------------
   body = GLSL defining vec4 tr(vec2 u, float p): u = 0..1 (y up), a(u) / b(u) = outgoing / incoming picture (premultiplied). */
const THEAD = `#version 300 es
precision highp float; in vec2 v; out vec4 o; uniform sampler2D TA, TB; uniform vec2 R; uniform float P;
#define PI 3.14159265
vec2 ASP; vec4 a(vec2 u){ return texture(TA, clamp(u, 0., 1.)); } vec4 b(vec2 u){ return texture(TB, clamp(u, 0., 1.)); }
float hash(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float noise(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y); }
float fbm(vec2 p){ float s = 0., k = .5; for (int i = 0; i < 4; i++){ s += k * noise(p); p = p * 2.03 + 7.1; k *= .5; } return s; }
float lum(vec3 c){ return dot(c, vec3(.299, .587, .114)); }
mat2 rot(float t){ float c = cos(t), s = sin(t); return mat2(c, -s, s, c); }
float bell(float p){ return sin(PI * clamp(p, 0., 1.)); }
vec4 ab(vec2 u, float m){ return mix(a(u), b(u), clamp(m, 0., 1.)); }
/* soft threshold: 0 while p' < v, 1 once p' > v + w (p' runs a bit past 0..1 so everything is covered at the ends) */
float thr(float v, float p, float w){ return smoothstep(v, v + w, p * (1. + 2. * w) - w); }
`;
const TMAIN = `void main(){ ASP = vec2(R.x / min(R.x, R.y), R.y / min(R.x, R.y)); o = tr(v, P); }`;
/** Draw a GPU transition. Returns the GL canvas (valid until the next GL call) or null when WebGL2 is missing. */
export function glTransition(key, body, A, B, p, w, h) {
  if (!init()) return null;
  w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h));
  const gl = G.gl;
  try {
    targets(w, h); const P = prog('tr:' + key, body, THEAD, TMAIN);
    if (!G.ta) { G.ta = gl.createTexture(); G.tb = gl.createTexture(); }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    for (const [t, img] of [[G.ta, A], [G.tb, B]]) { texSetup(gl, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.useProgram(P.p); gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, w, h); gl.disable(gl.BLEND);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, G.ta); gl.uniform1i(P.U.TA, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, G.tb); gl.uniform1i(P.U.TB, 1); gl.activeTexture(gl.TEXTURE0);
    gl.uniform2f(P.U.R, w, h); gl.uniform1f(P.U.P, p);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return G.cv;
  } catch (e) { console.warn('transition', key, e); return null; }
}

/* HD Enhance + colour Adjust: a small WebGL2 image pipeline used by the shared compositor (so preview == export).
   No AI / ML: classic, deterministic image processing.
     1. denoise   – edge-preserving bilateral filter at the source's own pixel scale (light, spatial only)
     2. upscale   – Lanczos-2 resampling with anti-ringing clamp (no halos) straight to the on-screen size.
                    Every upscale goes through this, even with HD Enhance off (never plain browser stretching).
     3. finish    – contrast-adaptive sharpening (CAS-style, self-limiting so it can't overshoot), clarity
                    (soft-limited local contrast from a 2-level blur pyramid), tone (brightness, contrast,
                    highlights, shadows), white balance (warmth, tint), saturation + skin-safe vibrance,
                    vignette and film grain. Highlights/shadows/brightness curves never clip.
   Works on premultiplied RGBA so transparent PNG overlays keep clean edges. */

export const ADJUST = [
  { id: 'brightness', label: 'Brightness' }, { id: 'contrast', label: 'Contrast' }, { id: 'saturation', label: 'Saturation' },
  { id: 'warmth', label: 'Warmth' }, { id: 'tint', label: 'Tint' }, { id: 'highlights', label: 'Highlights' },
  { id: 'shadows', label: 'Shadows' }, { id: 'sharpen', label: 'Sharpen', min: 0 }, { id: 'clarity', label: 'Clarity' },
  { id: 'vignette', label: 'Vignette', min: 0 }, { id: 'grain', label: 'Grain', min: 0 },
].map(a => ({ min: -1, max: 1, ...a }));
export const DEFAULT_STRENGTH = 0.6;
export const hasAdjust = a => !!a && ADJUST.some(d => Math.abs(a[d.id] || 0) > 1e-4);
export const enhanceOn = c => !!(c.enhance && c.enhance.on && (c.enhance.strength ?? DEFAULT_STRENGTH) > 0);

/* What HD Enhance does at strength s (0..1) and upscale factor f. One place to tune the look. */
export function enhanceParams(s, f) {
  const up = Math.max(0, Math.min(1.5, f - 1));
  return {
    denoise: 0.7 * s, sigma: 0.03 + 0.03 * s,                // bilateral blend + range sigma
    sharp: s * Math.min(1, 0.5 + 0.3 * up), sharpness: Math.min(1, 0.35 + 0.45 * s + 0.15 * up),
    clarity: 0.22 * s, vibrance: 0.22 * s,
  };
}

const VS = `#version 300 es
in vec2 p; out vec2 uv; uniform float flip;
void main(){ uv = p * .5 + .5; if (flip > .5) uv.y = 1. - uv.y; gl_Position = vec4(p, 0., 1.); }`;
const HEAD = `#version 300 es
precision highp float; in vec2 uv; out vec4 o; uniform sampler2D T; uniform vec2 px;
float luma(vec3 c){ return dot(c, vec3(.2126, .7152, .0722)); }
`;
const FS_DENOISE = HEAD + `uniform float amt, sr;
void main(){ vec4 c = texture(T, uv); vec4 s = vec4(0); float w = 0.;
  float k = .5 / (sr * sr);
  for (int j = -2; j <= 2; j++) for (int i = -2; i <= 2; i++) { vec2 d = vec2(i, j); vec4 q = texture(T, uv + d * px);
    vec4 e = q - c; float ww = exp(-dot(d, d) * .222 - dot(e, e) * k); s += q * ww; w += ww; }
  o = mix(c, s / w, amt); }`;
const FS_LANCZOS = HEAD + `uniform vec2 srcSize; uniform float antiring;
float L(float x){ x = abs(x); if (x < 1e-4) return 1.; if (x >= 2.) return 0.; float a = 3.14159265 * x; return 2. * sin(a) * sin(a * .5) / (a * a); }
void main(){ vec2 pos = uv * srcSize - .5; vec2 b = floor(pos), f = pos - b; ivec2 mxI = ivec2(srcSize) - 1;
  vec4 s = vec4(0); float ws = 0.; vec4 mn = vec4(1e9), mx = vec4(-1e9);
  for (int j = -1; j <= 2; j++) { float wy = L(float(j) - f.y);
    for (int i = -1; i <= 2; i++) { float w = L(float(i) - f.x) * wy;
      vec4 c = texelFetch(T, clamp(ivec2(b) + ivec2(i, j), ivec2(0), mxI), 0); s += c * w; ws += w;
      if (i >= 0 && i <= 1 && j >= 0 && j <= 1) { mn = min(mn, c); mx = max(mx, c); } } }
  vec4 r = s / ws; o = clamp(mix(r, clamp(r, mn, mx), antiring), 0., 1.); }`;
const FS_DOWN4 = HEAD + `void main(){ vec2 d = px; o = .25 * (texture(T, uv + vec2(-d.x, -d.y)) + texture(T, uv + vec2(d.x, -d.y)) + texture(T, uv + vec2(-d.x, d.y)) + texture(T, uv + d)); }`;
const FS_FINISH = HEAD + `uniform sampler2D B1, B2; uniform float sharp, sharpness, clarity, vibrance, bri, con, sat, warm, tint, hil, sha, vig, grain, seed, aspect;
float hash(vec2 p){ p = fract(p * vec2(443.897, 441.423)); p += dot(p, p.yx + 19.19); return fract((p.x + p.y) * p.x); }
vec3 unpm(vec4 c){ return c.a > 1e-5 ? c.rgb / c.a : vec3(0); }
void main(){
  vec4 C = texture(T, uv);
  // 1) contrast-adaptive sharpening (bounded by local min/max -> no halos)
  if (sharp > 0.) {
    vec4 a = texture(T, uv - vec2(0, px.y)), b = texture(T, uv - vec2(px.x, 0)), e = texture(T, uv + vec2(px.x, 0)), f = texture(T, uv + vec2(0, px.y));
    vec3 mn = min(min(min(a.rgb, b.rgb), min(e.rgb, f.rgb)), C.rgb), mx = max(max(max(a.rgb, b.rgb), max(e.rgb, f.rgb)), C.rgb);
    vec3 amp = sqrt(clamp(min(mn, 1. - mx) / max(mx, 1e-4), 0., 1.));
    vec3 w = amp * -1. / mix(8., 5., sharpness);
    vec3 r = (C.rgb + (a.rgb + b.rgb + e.rgb + f.rgb) * w) / (1. + 4. * w);
    float rng = max(mx.r - mn.r, max(mx.g - mn.g, mx.b - mn.b));
    float core = smoothstep(.025, .09, rng);   // coring: leave flat, noisy areas alone, sharpen real edges
    C.rgb = mix(C.rgb, clamp(r, mn, mx), sharp * core);
  }
  float A = C.a; vec3 c = unpm(C); float Y = luma(c);
  // 2) clarity: local contrast against a soft blur, soft-limited (no halos), mid-tones only
  if (abs(clarity) > 0.) {
    float Yb = .5 * (luma(unpm(texture(B1, uv))) + luma(unpm(texture(B2, uv))));
    float d = Y - Yb; d = d / (1. + abs(d) * 5.);
    float Y2 = clamp(Y + clarity * 1.6 * d * (.35 + 2.6 * Y * (1. - Y)), 0., 1.);
    c = Y2 > Y ? c + (Y2 - Y) * (1. - c) / max(1. - Y, 1e-3) : c * (Y2 / max(Y, 1e-3)); Y = luma(c);
  }
  // 3) tone: brightness (gamma-style), contrast (S-curve), highlights / shadows (luma-masked) — never clips
  if (bri != 0.) c = pow(clamp(c, 0., 1.), vec3(exp2(-bri * .9)));
  if (con != 0.) c = c + con * c * (1. - c) * (2. * c - 1.);
  Y = luma(c);
  if (hil != 0. || sha != 0.) {
    float hm = smoothstep(.45, 1., Y), sm = 1. - smoothstep(0., .55, Y);
    float Y2 = Y + hil * hm * (hil > 0. ? (1. - Y) * .7 : Y * .45) + sha * sm * (sha > 0. ? (1. - Y) * .55 : Y * .6);
    Y2 = clamp(Y2, 0., 1.);
    c = Y2 > Y ? c + (Y2 - Y) * (1. - c) / max(1. - Y, 1e-3) : c * (Y2 / max(Y, 1e-3)); Y = luma(c);
  }
  // 4) white balance
  if (warm != 0. || tint != 0.) { c *= vec3(1. + .12 * warm + .04 * tint, 1. - .1 * tint, 1. - .12 * warm + .04 * tint); }
  // 5) saturation + vibrance (boosts dull colours most, protects skin tones)
  Y = luma(c);
  if (sat != 0.) c = mix(vec3(Y), c, 1. + sat);
  if (vibrance > 0.) {
    float mxc = max(c.r, max(c.g, c.b)), mnc = min(c.r, min(c.g, c.b)), s0 = mxc - mnc;
    float skin = (c.r > c.g && c.g > c.b && c.r > .2) ? smoothstep(.0, .12, c.g - c.b) * (1. - smoothstep(.55, .8, (c.g - c.b) / max(c.r - c.b, 1e-3))) * (1. - smoothstep(.45, .7, s0)) : 0.;
    float v = vibrance * (1. - s0) * (1. - .75 * skin);
    vec3 cv = mix(vec3(Y), c, 1. + v); float lo = min(cv.r, min(cv.g, cv.b)), hi = max(cv.r, max(cv.g, cv.b));
    c = (lo < 0. || hi > 1.) ? c : cv;   // never push a colour out of range
  }
  // 6) vignette + grain
  if (vig > 0.) { vec2 q = (uv - .5) * vec2(aspect, 1.) / max(aspect, 1.) * 2.; c *= 1. - vig * .6 * smoothstep(.35, 1.25, length(q)); }
  if (grain > 0.) { vec2 g = floor(gl_FragCoord.xy); float n = (hash(g + seed) + hash(g * 1.37 + seed * 3.1) - 1.); c += n * grain * .09 * (1. - .6 * abs(2. * luma(c) - 1.)); }
  o = vec4(clamp(c, 0., 1.) * A, A);
}`;

/* Chroma key ("Cutout"): pixels close to the picked colour become transparent. Distance is measured in chroma
   (Cb/Cr); "shadow" also matches darker / lighter versions of the colour, "spill" removes the colour cast left on
   edges, "feather" softens the edge. Works on the source picture before any resize. */
const FS_KEY = HEAD + `uniform vec3 kc; uniform float strength, shadow, spill, feather;
vec2 cbcr(vec3 c){ return vec2(-.1146 * c.r - .3854 * c.g + .5 * c.b, .5 * c.r - .4542 * c.g - .0458 * c.b); }
float dist(vec3 c){ vec2 a = cbcr(c), b = cbcr(kc); float Y = luma(c), Yk = max(luma(kc), .05);
  float d = length(a - b); float dn = length(a * (Yk / max(Y, .03)) - b);   // luma-normalised: shadows of the colour still match
  float dy = abs(Y - Yk) * (1. - shadow) * .5; return mix(d, min(d, dn), shadow) + dy; }
float alphaAt(vec2 p){ vec4 q = texture(T, p); vec3 c = q.a > 1e-5 ? q.rgb / q.a : vec3(0);
  float th = .02 + .3 * strength, sw = .01 + .2 * feather; return smoothstep(th, th + sw, dist(c)) * q.a; }
void main(){ vec4 C = texture(T, uv); vec3 c = C.a > 1e-5 ? C.rgb / C.a : vec3(0);
  float a = alphaAt(uv);
  if (feather > .01) { vec2 d = px * (1. + 3. * feather); a = (a * 4. + alphaAt(uv + vec2(d.x, 0)) + alphaAt(uv - vec2(d.x, 0)) + alphaAt(uv + vec2(0, d.y)) + alphaAt(uv - vec2(0, d.y))) / 8.; }
  // spill: pull the key colour's chroma out of what is left
  vec2 k2 = cbcr(kc); float kl = length(k2);
  if (spill > 0. && kl > 1e-3) { vec2 dir = k2 / kl, cc = cbcr(c); float s = max(0., dot(cc, dir)); float Y = luma(c);
    vec2 nc = cc - dir * s * spill * (1. - .3 * a);
    c = clamp(vec3(Y + 1.5748 * nc.y, Y - .1873 * nc.x - .4681 * nc.y, Y + 1.8556 * nc.x), 0., 1.); }
  o = vec4(c * a, a); }`;
const hex3 = h => { const m = /^#?([0-9a-f]{6})$/i.exec(h || ''); const n = m ? parseInt(m[1], 16) : 0x00ff00; return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; };

let G = null;   // lazily created GL state
function init() {
  if (G) return G.ok ? G : null;
  G = { ok: false };
  try {
    const cv = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(16, 16) : Object.assign(document.createElement('canvas'), { width: 16, height: 16 });
    const gl = cv.getContext('webgl2', { premultipliedAlpha: true, alpha: true, preserveDrawingBuffer: true, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
    if (!gl) return null;
    cv.addEventListener?.('webglcontextlost', e => { e.preventDefault(); G = null; });
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const vs = sh(gl.VERTEX_SHADER, VS);
    const prog = fs => { const p = gl.createProgram(); gl.attachShader(p, vs); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.bindAttribLocation(p, 0, 'p'); gl.linkProgram(p);
      if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); } return { p, u }; };
    const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    G = { ok: true, cv, gl, maxTex: gl.getParameter(gl.MAX_TEXTURE_SIZE), P: { den: prog(FS_DENOISE), lan: prog(FS_LANCZOS), down: prog(FS_DOWN4), fin: prog(FS_FINISH), key: prog(FS_KEY) }, tex: {}, fbo: gl.createFramebuffer() };
    return G;
  } catch (e) { console.warn('HD Enhance: WebGL2 unavailable, using plain drawing', e); G = { ok: false }; return null; }
}
export const glAvailable = () => !!init();
export const maxSide = () => (init() ? Math.min(4096, G.maxTex) : 0);

function tex(name, w, h) {
  const { gl } = G; let t = G.tex[name];
  if (!t) { t = G.tex[name] = { t: gl.createTexture(), w: 0, h: 0 }; gl.bindTexture(gl.TEXTURE_2D, t.t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); }
  if (w && (t.w !== w || t.h !== h)) { gl.bindTexture(gl.TEXTURE_2D, t.t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); t.w = w; t.h = h; }
  return t;
}
let scratch = null;
function upload(img, w, h) {
  const { gl } = G, t = tex('src');
  gl.bindTexture(gl.TEXTURE_2D, t.t); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  try { gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img); }
  catch (e) {   // some sources (older VideoFrame support) can't be uploaded directly: copy through a 2D canvas
    if (!scratch || scratch.width !== w || scratch.height !== h) scratch = new OffscreenCanvas(w, h);
    const x = scratch.getContext('2d'); x.clearRect(0, 0, w, h); x.drawImage(img, 0, 0, w, h); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, scratch);
  }
  t.w = w; t.h = h; return t;
}
function pass(prog, inputs, out, uni, v3 = null) {
  const { gl } = G; gl.useProgram(prog.p);
  if (out) { gl.bindFramebuffer(gl.FRAMEBUFFER, G.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, out.t, 0); gl.viewport(0, 0, out.w, out.h); }
  else { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, G.cv.width, G.cv.height); }
  inputs.forEach(([name, t], i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, t.t); if (prog.u[name]) gl.uniform1i(prog.u[name], i); });
  if (prog.u.flip) gl.uniform1f(prog.u.flip, out ? 0 : 1);
  for (const k in uni) { const v = uni[k], l = prog.u[k]; if (!l) continue; Array.isArray(v) ? gl.uniform2f(l, v[0], v[1]) : gl.uniform1f(l, v); }
  for (const k in v3 || {}) { const l = prog.u[k]; if (l) gl.uniform3f(l, ...v3[k]); }
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

/**
 * Process one picture: img (sw x sh) -> canvas of exactly ow x oh pixels.
 * o: { enhance: strength 0..1 or 0, adjust: {...}, fast: bool (lighter pass while scrubbing), seed }
 * Returns the GL canvas (draw it right away; it is reused) or null when WebGL2 is unavailable.
 */
export function processImage(img, sw, sh, ow, oh, o = {}) {
  if (!init()) return null;
  const { gl } = G, a = o.adjust || {}, s = o.enhance || 0, f = Math.max(ow / sw, oh / sh);
  const E = s > 0 ? enhanceParams(s, f) : { denoise: 0, sigma: .05, sharp: 0, sharpness: 0, clarity: 0, vibrance: 0 };
  let cur = upload(img, sw, sh);
  if (o.key) { const t = tex('key', sw, sh), K = o.key; pass(G.P.key, [['T', cur]], t, { px: [1 / sw, 1 / sh], strength: K.strength ?? .35, shadow: K.shadow ?? .3, spill: K.spill ?? .5, feather: K.feather ?? .2 }, { kc: hex3(K.color) }); cur = t; }
  if (E.denoise > 0 && !o.fast) { const t = tex('den', sw, sh); pass(G.P.den, [['T', cur]], t, { px: [1 / sw, 1 / sh], amt: E.denoise, sr: E.sigma }); cur = t; }
  if (ow !== sw || oh !== sh) { const t = tex('up', ow, oh); pass(G.P.lan, [['T', cur]], t, { px: [1 / sw, 1 / sh], srcSize: [sw, sh], antiring: 0.75 }); cur = t; }
  const sharpAmt = Math.min(1, E.sharp + Math.max(0, a.sharpen || 0) * 0.9), sharpness = Math.max(E.sharpness, Math.max(0, a.sharpen || 0));
  const clarity = Math.max(-1, Math.min(1, E.clarity + (a.clarity || 0) * 0.8)) * (o.fast ? 0 : 1);
  let b1 = cur, b2 = cur;
  if (clarity) {
    b1 = tex('b1', Math.max(1, Math.ceil(ow / 4)), Math.max(1, Math.ceil(oh / 4))); pass(G.P.down, [['T', cur]], b1, { px: [1 / ow, 1 / oh] });
    const t2 = tex('b1b', Math.max(1, Math.ceil(b1.w / 2)), Math.max(1, Math.ceil(b1.h / 2))); pass(G.P.down, [['T', b1]], t2, { px: [1 / b1.w, 1 / b1.h] });
    b2 = tex('b2', Math.max(1, Math.ceil(t2.w / 2)), Math.max(1, Math.ceil(t2.h / 2))); pass(G.P.down, [['T', t2]], b2, { px: [1 / t2.w, 1 / t2.h] });
  }
  if (G.cv.width !== ow || G.cv.height !== oh) { G.cv.width = ow; G.cv.height = oh; }
  pass(G.P.fin, [['T', cur], ['B1', b1], ['B2', b2]], null, { px: [1 / ow, 1 / oh], sharp: sharpAmt, sharpness, clarity, vibrance: E.vibrance,
    bri: a.brightness || 0, con: a.contrast || 0, sat: a.saturation || 0, warm: a.warmth || 0, tint: a.tint || 0, hil: a.highlights || 0, sha: a.shadows || 0,
    vig: a.vignette || 0, grain: a.grain || 0, seed: o.seed || 0, aspect: ow / oh });
  return G.cv;
}

/* Audio mix (Batch 10): auto ducking (music lowers under voice), 10-band EQ + presets, compressor / limiter settings,
   loudness target, beat marks. Pure data + maths; the per-clip EQ / compressor run in the bake worker (audiofx.js),
   ducking is part of gainAt (project.js) so preview and export use the same gain curve. */
export const EQ_BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
export const EQ_PRESETS = [
  ['flat', 'Flat', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]], ['voice', 'Voice clarity', [-8, -6, -3, -1, 0, 2, 4, 4, 2, 0]],
  ['podcast', 'Podcast', [-6, -3, 1, 2, 1, 0, 2, 3, 1, -1]], ['bass', 'Bass boost', [7, 6, 4, 2, 0, 0, 0, 0, 0, 0]],
  ['treble', 'Treble boost', [0, 0, 0, 0, 0, 1, 2, 4, 6, 7]], ['warm', 'Warm', [3, 3, 2, 1, 0, 0, -1, -2, -2, -3]],
  ['bright', 'Bright', [-2, -1, 0, 0, 0, 1, 2, 3, 4, 4]], ['radio', 'Old radio', [-12, -12, -8, -2, 3, 5, 3, -4, -12, -12]],
  ['phone', 'Phone call', [-12, -12, -12, -6, 2, 6, 4, -6, -12, -12]], ['music', 'Music pop', [3, 2, 0, -1, -1, 0, 1, 2, 3, 3]],
  ['deep', 'Deep voice', [4, 5, 4, 2, 0, -1, -2, -2, -1, 0]], ['kids', 'Kids show', [-3, -2, 0, 1, 2, 3, 3, 2, 1, 0]],
];
export const eqOn = c => !!(c && c.eq && Array.isArray(c.eq.g) && c.eq.g.some(v => Math.abs(v) > .05));
export const COMP_PRESETS = [['off', 'Off', null], ['gentle', 'Gentle', { thr: -20, ratio: 2, att: .01, rel: .2, makeup: 2, ceil: -1 }],
  ['voice', 'Voice', { thr: -24, ratio: 3.5, att: .005, rel: .12, makeup: 5, ceil: -1 }], ['punch', 'Punchy', { thr: -18, ratio: 4, att: .02, rel: .08, makeup: 4, ceil: -1 }],
  ['limit', 'Limiter only', { thr: 0, ratio: 1, att: .005, rel: .1, makeup: 0, ceil: -1 }], ['squash', 'Loud & even', { thr: -30, ratio: 6, att: .003, rel: .15, makeup: 9, ceil: -1 }]];
export const compOn = c => !!(c && c.comp && c.comp.on !== false && (c.comp.ratio > 1.01 || c.comp.ceil != null));
/** Settings that change the baked sound (part of the bake cache key). */
export const mixKey = c => (eqOn(c) ? 'eq' + c.eq.g.map(v => Math.round(v * 10)).join(',') : '') + (compOn(c) ? '|cp' + ['thr', 'ratio', 'att', 'rel', 'makeup', 'ceil'].map(k => c.comp[k]).join(',') : '');
export const mixOpt = c => ({ eq: eqOn(c) ? c.eq.g.slice(0, 10) : null, comp: compOn(c) ? { ...c.comp } : null });

/* ---------------- ducking ---------------- */
export const DUCK_DEFAULT = { on: true, amount: -12, attack: .08, release: .45, thr: -38 };
/** A voice: recorded voice-over, generated speech, or a clip the user marked as voice. */
export const isVoice = c => !!c && (c.type === 'audio' || c.type === 'video') && (c.role === 'voice' || (c.role !== 'music' && (c.rec === 'voice' || c.rec === 'tts')));
const envs = new Map(), pending = new Set(), envListeners = new Set(); let decode = null, getRec = () => null;
export const setMediaGetter = f => { getRec = f; };
export const onEnvelope = f => envListeners.add(f);
export const setDecoder = f => { decode = f; };
const HOP = .02;
/** Voice presence 0..1 over the source file (20 ms steps): gate at thr dBFS, look-ahead + attack / release smoothing. */
function presence(buf, d) {
  const sr = buf.sampleRate, n = Math.ceil(buf.duration / HOP), H = Math.round(HOP * sr), ch = [...Array(Math.min(2, buf.numberOfChannels)).keys()].map(i => buf.getChannelData(i));
  const on = new Float32Array(n), T = Math.pow(10, d.thr / 20);
  for (let k = 0; k < n; k++) { let s = 0, m = 0; for (const c of ch) for (let i = k * H, e = Math.min(c.length, (k + 1) * H); i < e; i++) { s += c[i] * c[i]; m++; } on[k] = Math.sqrt(s / Math.max(1, m)) > T ? 1 : 0; }
  // hold short gaps between words (250 ms), so the music does not pump
  const hold = Math.round(.25 / HOP); let last = -1e9; const held = new Float32Array(n); for (let k = 0; k < n; k++) { if (on[k]) last = k; held[k] = k - last <= hold && last >= 0 ? 1 : 0; }
  const la = Math.round(.1 / HOP), out = new Float32Array(n), aa = 1 - Math.exp(-HOP / d.attack), ar = 1 - Math.exp(-HOP / d.release); let e = 0;
  for (let k = 0; k < n; k++) { const x = held[Math.min(n - 1, k + la)]; e += (x - e) * (x > e ? aa : ar); out[k] = e; }
  return out;
}
const envKey = (id, d) => [id, d.thr, d.attack, d.release].join('|');
/** Presence curve for a media record, or null while it is being computed (listeners fire when ready). */
export function presenceNow(rec, d) {
  const k = envKey(rec.id, d); if (envs.has(k)) return envs.get(k);
  if (!pending.has(k) && decode) { pending.add(k); decode(rec).then(buf => { if (buf) envs.set(k, presence(buf, d)); pending.delete(k); envListeners.forEach(f => f()); }, () => pending.delete(k)); }
  return null;
}
export async function ensurePresence(p) {
  const d = { ...DUCK_DEFAULT, ...(p.duck || {}) }; if (!duckOn(p)) return;
  for (const t of p.tracks) for (const c of t.clips) if (isVoice(c)) { const r = getRec(c.mediaId); if (!r) continue; const k = envKey(r.id, d); if (envs.has(k)) continue;
    const buf = await decode(r).catch(() => null); if (buf) envs.set(k, presence(buf, d)); }
}
/** Gain factor for clip c at project time t from ducking (1 = no change). Voices themselves are never ducked. */
export function duckAt(p, c, t, srcTimeOf) {
  const D = p.duck; if ((D && D.on === false) || isVoice(c) || c.duck === false) return 1;
  const d = { ...DUCK_DEFAULT, ...(D || {}) }; let pr = 0;
  for (const tr of p.tracks) for (const v of tr.clips) { if (!isVoice(v) || v.muteAudio || !(v.start <= t && t < v.start + (v.out - v.in) / (v.speed || 1) + .5)) continue;
    const r = getRec(v.mediaId); if (!r) continue; const P = presenceNow(r, d); if (!P) continue;
    const k = Math.floor(srcTimeOf(v, Math.min(t, v.start + (v.out - v.in) / (v.speed || 1) - 1e-3)) / HOP), vEnd = v.start + (v.out - v.in) / (v.speed || 1), x = (P[Math.max(0, Math.min(P.length - 1, k))] || 0) * (t < vEnd ? 1 : Math.exp(-(t - vEnd) / Math.max(.05, d.release / 3)));
    if (x > pr) pr = x; }
  return 1 - (1 - Math.pow(10, d.amount / 20)) * pr;
}

/* ---------------- loudness ---------------- */
/** Auto ducking is on unless switched off in Mix (only does anything when a voice clip is playing). */
export const duckOn = p => !(p && p.duck && p.duck.on === false);
export const LOUD_TARGET = -14;
export const loudOn = p => !p || !p.loudness || p.loudness.on !== false;   // on by default: exports land at -14 LUFS

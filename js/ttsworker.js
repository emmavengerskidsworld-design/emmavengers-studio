/* Speech worker: Kokoro (kokoro-js + ONNX Runtime Web, WebAssembly) + kid-voice post-processing. */
import { pitchShift, trimSilence, normalize } from './audiofx.js';
const MODEL = 'onnx-community/Kokoro-82M-v1.0-ONNX';
let ttsP = null;
async function engine(base, model, progress, host) {
  if (host && !self.__hfHost) {   // optional self-hosted copy of the model + voices (same folder layout as Hugging Face)
    const f = self.fetch.bind(self), HF = 'https://huggingface.co/'; self.__hfHost = host;
    self.fetch = (u, o) => f(typeof u === 'string' && u.startsWith(HF) ? host + u.slice(HF.length) : u, o);
  }
  if (!ttsP) ttsP = (async () => {
    const { KokoroTTS, env } = await import(base + 'kokoro.web.js');
    env.wasmPaths = base;
    const seen = {};
    return KokoroTTS.from_pretrained(model || MODEL, { dtype: 'q8', device: 'wasm', progress_callback: e => {
      if (e.status === 'progress' && e.total > 1e6) { seen[e.file] = [e.loaded, e.total]; const L = Object.values(seen).reduce((a, b) => a + b[0], 0), T = Object.values(seen).reduce((a, b) => a + b[1], 0);
        progress({ msg: `Downloading the voice model (first time only): ${Math.round(L / 1e6)} of ${Math.round(T / 1e6)} MB`, p: L / T }); } } });
  })().catch(e => { ttsP = null; throw e; });
  return ttsP;
}
/** Split into chunks of whole sentences (<= ~240 characters) so long texts work and progress can be shown. */
function chunks(text) {
  const parts = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?…])\s+/), out = [];
  for (const s of parts) { if (out.length && (out[out.length - 1] + ' ' + s).length <= 240) out[out.length - 1] += ' ' + s; else out.push(s); }
  return out.filter(Boolean);
}
self.onmessage = async e => {
  const { id, text, voice, base, model, host } = e.data, progress = p => self.postMessage({ id, progress: p });
  try {
    progress({ msg: 'Starting the speech engine…', p: 0 });
    const tts = await engine(base, model, progress, host);
    const cs = chunks(text), pieces = []; let sr = 24000;
    for (let i = 0; i < cs.length; i++) {
      progress({ msg: cs.length > 1 ? `Making speech… sentence ${i + 1} of ${cs.length}` : 'Making speech…', p: i / cs.length });
      const a = await tts.generate(cs[i], { voice: voice.kokoro, speed: voice.speed }); sr = a.sampling_rate;
      // kid voice: raise the pitch, keep the timing (like ffmpeg asetrate+atempo in the game's generator)
      let y = pitchShift([a.audio], voice.pitch, sr); y = trimSilence(y, sr, -50, 0.02); pieces.push(y[0]);
    }
    const gap = Math.round(0.22 * sr), tail = Math.round(0.15 * sr), n = pieces.reduce((s, p) => s + p.length, 0) + gap * (pieces.length - 1) + tail;
    const out = new Float32Array(n); let o = 0; pieces.forEach((p, i) => { out.set(p, o); o += p.length + (i < pieces.length - 1 ? gap : 0); });
    const fin = normalize([out], sr, -16)[0];
    progress({ msg: 'Done', p: 1 });
    self.postMessage({ id, audio: fin, sr }, [fin.buffer]);
  } catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); }
};

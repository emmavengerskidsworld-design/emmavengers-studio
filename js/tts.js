/* Add speech: text-to-speech with the six Emmavengers kid voices (the same Kokoro voice packs as the
   Emmavengers House game: tools/gen_voice.py there). Runs fully on the phone: Kokoro-82M (8-bit ONNX, Apache-2.0)
   in a Web Worker via kokoro-js + ONNX Runtime Web (WebAssembly). The model (~88 MB) downloads once from
   Hugging Face and is then cached by the browser, so it also works offline afterwards. Each pack = Kokoro voice +
   speaking speed + kid pitch shift (WSOLA, js/audiofx.js), silence trimmed, 150 ms tail — like the game's clips. */
import { encodeWav } from './wav.js';

export const KID_VOICES = [
  { id: 'mia',  kokoro: 'af_heart',   speed: 0.72, pitch: 1.18, gender: 'girl', label: 'Mia',  emoji: '👧' },
  { id: 'lily', kokoro: 'af_jessica', speed: 0.72, pitch: 1.28, gender: 'girl', label: 'Lily', emoji: '🌸' },
  { id: 'zara', kokoro: 'af_bella',   speed: 0.78, pitch: 1.38, gender: 'girl', label: 'Zara', emoji: '⭐' },
  { id: 'sam',  kokoro: 'am_puck',    speed: 0.70, pitch: 2.30, gender: 'boy',  label: 'Sam',  emoji: '🧒' },
  { id: 'leo',  kokoro: 'am_liam',    speed: 0.75, pitch: 2.20, gender: 'boy',  label: 'Leo',  emoji: '🦁' },
  { id: 'max',  kokoro: 'am_fenrir',  speed: 0.68, pitch: 2.10, gender: 'boy',  label: 'Max',  emoji: '🚀' },
];
export const ttsInfo = 'Speech is made on this phone with the same six kid voices as the Emmavengers game. The first time, the voice model (about 88 MB) downloads once — use Wi-Fi. After that it works offline. A sentence takes a few seconds to make.';

let worker = null, seq = 0; const jobs = new Map();
function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./ttsworker.js', import.meta.url), { type: 'module' });
  worker.onmessage = e => { const d = e.data, j = jobs.get(d.id); if (!j) return;
    if (d.progress) { j.onProgress && j.onProgress(d.progress); return; }
    jobs.delete(d.id); d.error ? j.rej(new Error(d.error)) : j.res(d); };
  worker.onerror = e => { for (const j of jobs.values()) j.rej(new Error(e.message || 'speech engine failed to start')); jobs.clear(); worker = null; };
  return worker;
}
/** Make speech: resolves { wav: Blob, duration, sr, text }. onProgress({ msg, p }). */
export function speak(text, voiceId, onProgress) {
  const v = KID_VOICES.find(x => x.id === voiceId) || KID_VOICES[0], id = ++seq;
  return new Promise((res, rej) => {
    jobs.set(id, { res: d => res({ wav: encodeWav([d.audio], d.sr), duration: d.audio.length / d.sr, sr: d.sr, text }), rej, onProgress });
    getWorker().postMessage({ id, text, voice: v, base: new URL('../lib/kokoro-1.2.1/', import.meta.url).href, model: window.__studioTtsModel || null });
  });
}

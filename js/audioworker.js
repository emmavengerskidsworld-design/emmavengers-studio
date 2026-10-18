/* Bakes processed clip audio off the main thread (enhance, voice effect, pitch-kept speed). */
import { processAudio } from './audiofx.js';
self.onmessage = e => {
  const { id, ch, sr, opt } = e.data;
  try {
    const out = processAudio(ch, sr, opt);
    self.postMessage({ id, ch: out }, out.map(c => c.buffer));
  } catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); }
};

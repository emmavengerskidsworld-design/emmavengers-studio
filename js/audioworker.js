/* Bakes processed clip audio off the main thread (enhance, voice effect, pitch-kept speed). */
import { processAudio, lufs } from './audiofx.js';
self.onmessage = e => {
  if (e.data && e.data.lufs) { const { id, ch, sr } = e.data; try { self.postMessage({ id, lufs: lufs(ch, sr) }); } catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); } return; }
  const { id, ch, sr, opt } = e.data;
  try {
    const out = processAudio(ch, sr, opt);
    self.postMessage({ id, ch: out }, out.map(c => c.buffer));
  } catch (err) { self.postMessage({ id, error: String(err && err.message || err) }); }
};

/* IndexedDB storage: media files (original blobs) + project JSON + small key/value settings. */
const NAME = 'emmavengers-studio', VERSION = 1;
let dbp;
function open() {
  return dbp ||= new Promise((res, rej) => {
    const r = indexedDB.open(NAME, VERSION);
    r.onupgradeneeded = () => { const db = r.result;
      for (const s of ['media', 'projects', 'kv']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: s === 'kv' ? 'k' : 'id' }); };
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((res, rej) => { const t = db.transaction(store, mode); const s = t.objectStore(store); let out; const r = fn(s);
    if (r) r.onsuccess = () => { out = r.result; }; t.oncomplete = () => res(out); t.onerror = t.onabort = () => rej(t.error); });
}
export const put = (store, v) => tx(store, 'readwrite', s => s.put(v));
export const get = (store, k) => tx(store, 'readonly', s => s.get(k));
export const all = (store) => tx(store, 'readonly', s => s.getAll());
export const del = (store, k) => tx(store, 'readwrite', s => s.delete(k));
export const kvGet = async k => (await get('kv', k))?.v;
export const kvSet = (k, v) => put('kv', { k, v });

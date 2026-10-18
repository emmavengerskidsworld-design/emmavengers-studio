/* Minimal ZIP (stored, no compression: our files are already compressed video / photos). Built from Blob slices,
   so a backup of a 1 GB project never needs 1 GB of memory. Deterministic: fixed date, given order -> same bytes. */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(bytes, crc = 0) { crc = ~crc >>> 0; for (let i = 0; i < bytes.length; i++) crc = CRC[(crc ^ bytes[i]) & 255] ^ (crc >>> 8); return ~crc >>> 0; }
async function crcBlob(blob, onBytes) {
  let c = 0; const STEP = 8 * 1024 * 1024;
  for (let o = 0; o < blob.size; o += STEP) { const b = new Uint8Array(await blob.slice(o, o + STEP).arrayBuffer()); c = crc32(b, c); onBytes && onBytes(b.length); }
  return c;
}
const enc = new TextEncoder(), DOS_TIME = 0, DOS_DATE = (2026 - 1980) << 9 | 1 << 5 | 1;   // 2026-01-01 00:00
const MAX = 0xfffffff0;
/** files: [{ name, data: Blob | string | Uint8Array }] -> Blob (application/zip). */
export async function makeZip(files, onProgress) {
  const parts = [], central = []; let off = 0, total = 0, done = 0;
  const blobs = files.map(f => f.data instanceof Blob ? f.data : new Blob([typeof f.data === 'string' ? enc.encode(f.data) : f.data]));
  for (const b of blobs) total += b.size;
  for (let i = 0; i < files.length; i++) {
    const name = enc.encode(files[i].name), b = blobs[i];
    if (b.size > MAX || off > MAX) throw new Error('Backup is too big (over 4 GB). Back up projects one by one.');
    const crc = await crcBlob(b, n => { done += n; onProgress && onProgress(total ? done / total : 1); });
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, DOS_TIME, true); h.setUint16(12, DOS_DATE, true);
    h.setUint32(14, crc, true); h.setUint32(18, b.size, true); h.setUint32(22, b.size, true); h.setUint16(26, name.length, true); h.setUint16(28, 0, true);
    parts.push(h.buffer, name, b);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true); c.setUint16(10, 0, true); c.setUint16(12, DOS_TIME, true); c.setUint16(14, DOS_DATE, true);
    c.setUint32(16, crc, true); c.setUint32(20, b.size, true); c.setUint32(24, b.size, true); c.setUint16(28, name.length, true); c.setUint32(42, off, true);
    central.push(c.buffer, name); off += 30 + name.length + b.size;
  }
  const cdSize = central.reduce((n, x) => n + (x.byteLength ?? x.length), 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, cdSize, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...central, e.buffer], { type: 'application/zip' });
}
/** Read the table of contents of a ZIP Blob (stored entries only). Returns Map name -> { blob(type), size, crc }. */
export async function readZip(blob) {
  const tailLen = Math.min(blob.size, 22 + 65535), tail = new DataView(await blob.slice(blob.size - tailLen).arrayBuffer());
  let e = -1; for (let i = tail.byteLength - 22; i >= 0; i--) if (tail.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('Not a backup file');
  const n = tail.getUint16(e + 10, true), cdSize = tail.getUint32(e + 12, true), cdOff = tail.getUint32(e + 16, true);
  const cd = new DataView(await blob.slice(cdOff, cdOff + cdSize).arrayBuffer()), dec = new TextDecoder(), out = new Map();
  let p = 0;
  for (let i = 0; i < n; i++) {
    if (cd.getUint32(p, true) !== 0x02014b50) throw new Error('Damaged backup file');
    const method = cd.getUint16(p + 10, true), crc = cd.getUint32(p + 16, true), size = cd.getUint32(p + 20, true), nl = cd.getUint16(p + 28, true), xl = cd.getUint16(p + 30, true), cl = cd.getUint16(p + 32, true), lo = cd.getUint32(p + 42, true);
    const name = dec.decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nl)); p += 46 + nl + xl + cl;
    if (method !== 0) throw new Error('This backup uses compression we cannot read: ' + name);
    const lh = new DataView(await blob.slice(lo, lo + 30).arrayBuffer()), start = lo + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
    out.set(name, { size, crc, slice: type => blob.slice(start, start + size, type || '') });
  }
  return out;
}
export async function checkEntry(ent) { return (await crcBlob(ent.slice())) === ent.crc; }

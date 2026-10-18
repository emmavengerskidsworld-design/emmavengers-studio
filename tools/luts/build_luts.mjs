// Bakes our 20 own looks (js/colorpro.js OWN_LUTS, plain colour maths, CC0) into lib/luts/<id>.cube (17³).
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
const R = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { OWN_LUTS, cubeText } = await import(R + '/js/colorpro.js');
fs.mkdirSync(R + '/lib/luts', { recursive: true });
for (const L of OWN_LUTS) fs.writeFileSync(`${R}/lib/luts/${L.id}.cube`, cubeText(L.name, 17, L.f));
fs.writeFileSync(R + '/lib/luts/index.json', JSON.stringify({ license: 'CC0-1.0', author: 'Emmavengers Studio', luts: OWN_LUTS.map(l => ({ id: l.id, name: l.name })) }, null, 1));
console.log(OWN_LUTS.length, 'LUTs');

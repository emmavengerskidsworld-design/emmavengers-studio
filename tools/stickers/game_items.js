const fs=require('fs'); const s=fs.readFileSync('/workspace/repos/emmavengers-house-game/index.html','utf8').split('\n');
const blk=s.slice(518,634).join('\n'); const IMG='img/';
const f=new Function(blk+';return {ITEMS,BEDROOM_ITEMS,BATHROOM_ITEMS,LIVING_ITEMS}');
const r=f(); const out=[]; for(const k in r) for(const it of r[k]) out.push({name:it.name,room:it.room,prefix:it.prefix||'',id:it.id});
console.log(JSON.stringify(out));

/* B20 Effects: real multi-layer looks (textures, 3D, neon tubes, comic, glitch, drips, stickers, emboss…), all drawn by
   render.js drawText + textfx.js so preview == export. s = text style patch (STYLE_KEYS). */
const E = [], add = (id, name, cat, s, trend) => E.push({ id: 'e_' + id, name, cat, s, trend: !!trend });
const st = (color, w) => ({ k: 'stk', color, w }), off = (color, dx, dy, w = 0) => ({ k: 'off', color, dx, dy, w });
const ext = (c0, c1, depth = .14, angle = 60, w = 0) => ({ k: 'ext3d', colors: [c0, c1], depth, angle, w });
const sh = (color = 'rgba(0,0,0,.5)', dx = 0, dy = .06, blur = .08) => ({ color, dx, dy, blur });
// --- Textured (pattern fills)
add('fire', 'Inferno', 'fire', { tex: 'fire', outline: true, outlineColor: '#5a0000', outlineW: .08, glow: { color: '#ff6a00', blur: .5 }, fx: [st('#ffcc00', .2)] }, 1);
add('gold', 'Gold Bar', 'metal', { tex: 'gold', outline: true, outlineColor: '#5a3a00', outlineW: .07, fx: [ext('#a06a00', '#3a2400', .1, 70, .07), { k: 'hl' }], shadow: sh() }, 1);
add('chrome', 'Chrome', 'metal', { tex: 'chrome', outline: true, outlineColor: '#111', outlineW: .06, fx: [st('#ffffff', .16), st('#1b1b2f', .24), { k: 'hl' }] }, 1);
add('silver', 'Silver Plate', 'metal', { tex: 'silver', outline: true, outlineColor: '#3a3f45', outlineW: .06, fx: [ext('#6f7880', '#2b2f33', .08, 80, .06), { k: 'emboss' }] });
add('ice', 'Frozen', 'fireice', { tex: 'ice', outline: true, outlineColor: '#0b3d91', outlineW: .06, glow: { color: '#9be7ff', blur: .35 }, fx: [st('#ffffff', .18), { k: 'spark', color: '#ffffff' }] }, 1);
add('candy', 'Candy Cane', 'festive', { tex: 'candy', outline: true, outlineColor: '#8a0030', outlineW: .08, fx: [st('#ffffff', .2), st('#8a0030', .28)] }, 1);
add('mint', 'Peppermint', 'kids', { tex: 'mint', outline: true, outlineColor: '#0b5d3b', outlineW: .08, fx: [st('#ffffff', .2)] });
add('rainbow', 'Rainbow Pop', 'kids', { tex: 'rainbow', outline: true, outlineColor: '#1b1b2f', outlineW: .08, fx: [st('#ffffff', .2), off('#1b1b2f', .05, .07, .2)] }, 1);
add('galaxy', 'Galaxy', 'textured', { tex: 'galaxy', outline: true, outlineColor: '#ffffff', outlineW: .04, glow: { color: '#a259ff', blur: .45 }, fx: [{ k: 'spark', color: '#fff6a0' }] }, 1);
add('wood', 'Woodcut', 'textured', { tex: 'wood', outline: true, outlineColor: '#3a1d05', outlineW: .07, fx: [ext('#6b3a12', '#2a1405', .1, 75, .07)] });
add('metal', 'Brushed Steel', 'metal', { tex: 'metal', outline: true, outlineColor: '#2b2f33', outlineW: .05, fx: [{ k: 'emboss' }, { k: 'inline', color: 'rgba(255,255,255,.6)', w: .02 }] });
add('lava', 'Lava Flow', 'fireice', { tex: 'lava', outline: true, outlineColor: '#000', outlineW: .07, glow: { color: '#ff3d00', blur: .4 }, fx: [{ k: 'drip', color: '#ff3d00' }] });
add('marble', 'Marble', 'textured', { tex: 'marble', outline: true, outlineColor: '#3a3a48', outlineW: .04, shadow: sh('rgba(0,0,0,.35)', .03, .05, .06) });
add('camo', 'Camo', 'textured', { tex: 'camo', outline: true, outlineColor: '#1b2210', outlineW: .08, fx: [off('#1b2210', .06, .06, .08)] });
add('denim', 'Denim Stitch', 'textured', { tex: 'denim', outline: true, outlineColor: '#f4c542', outlineW: .025, fx: [st('#1d3b66', .16)] });
add('sunsettex', 'Golden Hour', 'gradient', { tex: 'sunset', outline: true, outlineColor: '#4a0f2a', outlineW: .06, fx: [{ k: 'hl', color: 'rgba(255,255,255,.5)' }], shadow: sh('rgba(194,24,91,.5)', 0, .08, .15) }, 1);
add('ocean', 'Ocean Wave', 'gradient', { tex: 'ocean', outline: true, outlineColor: '#012a5e', outlineW: .07, fx: [st('#ffffff', .18)] });
add('toxic', 'Toxic', 'halloween', { tex: 'toxic', outline: true, outlineColor: '#0b2b00', outlineW: .08, glow: { color: '#7dff3d', blur: .4 }, fx: [{ k: 'drip', color: '#7dff3d' }] }, 1);
add('pumpkin', 'Pumpkin', 'halloween', { tex: 'pumpkin', outline: true, outlineColor: '#3a1300', outlineW: .08, fx: [ext('#8a3000', '#2a0e00', .1, 70, .08)] });
add('confetti', 'Party Confetti', 'festive', { tex: 'confetti', outline: true, outlineColor: '#1b1b2f', outlineW: .07, fx: [st('#ffffff', .2), st('#ff4d6d', .28)] }, 1);
add('holo', 'Holographic', 'gradient', { tex: 'holo', outline: true, outlineColor: '#7b6cff', outlineW: .04, glow: { color: '#c1fff4', blur: .3 }, fx: [{ k: 'hl' }] });
add('leopard', 'Wild Print', 'textured', { tex: 'leopard', outline: true, outlineColor: '#1b0e02', outlineW: .07, shadow: sh() });
add('starry', 'Starry Night', 'kids', { tex: 'stars', outline: true, outlineColor: '#ffe066', outlineW: .04, fx: [st('#16205a', .18)] });
// --- 3D extrusions
add('block3d', 'Block 3D', '3d', { color: '#ffd23f', outline: true, outlineColor: '#1b1b2f', outlineW: .06, fx: [ext('#ff7a00', '#7a2a00', .18, 60, .06)] }, 1);
add('long', 'Long Shadow', '3d', { color: '#ffffff', fx: [ext('#3d5afe', '#0d1a66', .5, 45)] });
add('iso', 'Isometric', '3d', { color: '#3ddc84', outline: true, outlineColor: '#0b3d24', outlineW: .05, fx: [ext('#1f8a50', '#0b3d24', .2, 30, .05)] });
add('retro', 'Retro 80s', '3d', { tex: 'chrome', outline: true, outlineColor: '#ff2d95', outlineW: .05, fx: [ext('#ff2d95', '#3a006b', .2, 90, .05)], glow: { color: '#ff2d95', blur: .25 } }, 1);
add('bubble3d', 'Bubble 3D', 'kids', { color: '#ff7ac8', outline: true, outlineColor: '#ffffff', outlineW: .1, fx: [ext('#c2187a', '#5a0a38', .12, 80, .1), { k: 'hl' }] }, 1);
add('toy', 'Toy Block', 'kids', { color: '#1fb6ff', outline: true, outlineColor: '#ffffff', outlineW: .09, fx: [ext('#ffcc00', '#c48a00', .14, 50, .09)] });
add('stone', 'Stone Carve', '3d', { color: '#b0aca4', outline: true, outlineColor: '#4a463f', outlineW: .05, fx: [ext('#6e6a62', '#2e2b26', .12, 70, .05), { k: 'emboss' }] });
add('goldblock', 'Gold Block', '3d', { tex: 'gold', fx: [ext('#b8860b', '#3a2400', .22, 55)] }, 1);
add('ice3d', 'Ice Cube', 'fireice', { tex: 'ice', outline: true, outlineColor: '#ffffff', outlineW: .05, fx: [ext('#5ab8ff', '#0b3d91', .15, 65, .05)] });
add('cherry3d', 'Cherry Soda', '3d', { color: '#ff3b5c', outline: true, outlineColor: '#ffffff', outlineW: .07, fx: [ext('#a3002a', '#3a000f', .16, 90, .07), { k: 'hl' }] });
add('mint3d', 'Mint Chip', '3d', { color: '#b8ffde', outline: true, outlineColor: '#0b5d3b', outlineW: .06, fx: [ext('#20c997', '#0b5d3b', .14, 120, .06)] });
add('wood3d', 'Plank 3D', '3d', { tex: 'wood', fx: [ext('#5a2e0c', '#2a1405', .16, 60)] });
// --- Neon tubes
for (const [n, c, core] of [['pink', '#ff2d95', '#ffd1ec'], ['cyan', '#00e5ff', '#e0fbff'], ['lime', '#9dff3d', '#f0ffd6'], ['violet', '#a259ff', '#efe0ff'], ['orange', '#ff8a00', '#fff0d6'], ['red', '#ff2d2d', '#ffe0e0']])
  add('neon' + n, 'Neon ' + n[0].toUpperCase() + n.slice(1), 'neon', { color: core, fx: [{ k: 'neon', color: c }] }, n === 'pink' || n === 'cyan');
add('neonmulti', 'Neon Duo', 'neon', { color: 'rgba(0,0,0,0)', fx: [{ k: 'neon', color: '#ff2d95' }, { k: 'inline', color: '#00e5ff', w: .03 }] }, 1);
add('neonsign', 'Bar Sign', 'neon', { color: '#fff6e0', fx: [{ k: 'neon', color: '#ffb000' }, st('#2b1a00', .02)] });
add('neonhollow', 'Hollow Tube', 'neon', { color: 'rgba(0,0,0,0)', fx: [{ k: 'neon', color: '#00ffa3' }, { k: 'inline', color: '#ffffff', w: .02 }] });
add('neonrainbow', 'Neon Rainbow', 'glow', { tex: 'rainbow', glow: { color: '#ffffff', blur: .6 }, fx: [st('#ffffff', .04)] }, 1);
// --- Glow
add('halo', 'Angel Halo', 'glow', { color: '#ffffff', glow: { color: '#ffe066', blur: .9 }, fx: [{ k: 'spark', color: '#ffe066' }] });
add('magic', 'Magic Dust', 'glow', { color: '#ffffff', glow: { color: '#a259ff', blur: .7 }, fx: [{ k: 'spark', color: '#ffd1ff' }, st('#a259ff', .05)] }, 1);
add('ember', 'Ember Glow', 'glow', { color: '#fff1c2', glow: { color: '#ff5a00', blur: .8 }, fx: [st('#ff5a00', .03)] });
add('aura', 'Blue Aura', 'glow', { color: '#ffffff', glow: { color: '#1fb6ff', blur: 1 }, fx: [{ k: 'stk', color: '#1fb6ff', w: .1, blur: .6 }] });
add('starlight', 'Starlight', 'glow', { tex: 'gold', glow: { color: '#fff3b0', blur: .6 }, fx: [{ k: 'spark', color: '#ffffff' }] }, 1);
add('ghostglow', 'Ghostly', 'halloween', { color: 'rgba(255,255,255,.85)', glow: { color: '#9dffde', blur: .8 }, fx: [{ k: 'off', color: 'rgba(157,255,222,.35)', dx: .06, dy: -.04 }] });
// --- Comic
add('comic', 'Comic Pow', 'comic', { color: '#ffe600', outline: true, outlineColor: '#000', outlineW: .12, fx: [off('#e01e37', .09, .09, .12)] }, 1);
add('comicblue', 'Hero Blue', 'comic', { color: '#ffffff', outline: true, outlineColor: '#000', outlineW: .12, fx: [off('#1f5bff', .09, .09, .12), off('#000', .13, .13, .12)] }, 1);
add('kapow', 'Kapow', 'comic', { tex: 'sunset', outline: true, outlineColor: '#000', outlineW: .1, fx: [st('#ffffff', .22), off('#000', .1, .1, .22)] });
add('popart', 'Pop Art', 'comic', { color: '#ff3b8d', outline: true, outlineColor: '#000', outlineW: .1, fx: [off('#00e5ff', -.07, .07, .1), off('#ffe600', .07, .07, .1)] });
add('sketch', 'Ink Sketch', 'comic', { color: '#ffffff', outline: true, outlineColor: '#111', outlineW: .05, fx: [off('#111', .04, .05, .05), { k: 'scan', color: 'rgba(0,0,0,.25)' }] });
add('manga', 'Manga Shout', 'comic', { color: '#000', outline: true, outlineColor: '#ffffff', outlineW: .14, fx: [st('#000', .2)] });
add('zap', 'Zap!', 'comic', { color: '#00e5ff', outline: true, outlineColor: '#000', outlineW: .1, fx: [off('#ffe600', .08, .1, .1), off('#000', .12, .14, .1)] });
add('boom', 'Boom Burst', 'comic', { color: '#ffffff', outline: true, outlineColor: '#e01e37', outlineW: .1, fx: [st('#ffe600', .24), off('#000', .08, .08, .24)] });
// --- Glitch
add('glitch', 'Glitch RGB', 'trend', { color: '#ffffff', fx: [{ k: 'glitch', d: .05 }] }, 1);
add('glitchvhs', 'VHS Tape', 'trend', { color: '#fffb00', fx: [{ k: 'glitch', d: .07, a: '#0047ff', b: '#ff0055' }, { k: 'scan' }] });
add('glitchmatrix', 'Matrix', 'glow', { color: '#9dff3d', glow: { color: '#00ff66', blur: .4 }, fx: [{ k: 'glitch', d: .04, a: '#003b10', b: '#00ff66' }, { k: 'scan', color: 'rgba(0,40,0,.4)' }] });
add('glitchpink', 'Signal Lost', 'trend', { color: '#ffffff', outline: true, outlineColor: '#000', outlineW: .04, fx: [{ k: 'glitch', d: .09, a: '#00ffd5', b: '#ff2d95' }] });
// --- Drips
add('slime', 'Slime Drip', 'halloween', { color: '#7dff3d', outline: true, outlineColor: '#0b2b00', outlineW: .07, fx: [{ k: 'drip', color: '#7dff3d' }] }, 1);
add('blood', 'Vampire Drip', 'halloween', { color: '#c4001a', fx: [{ k: 'drip', color: '#c4001a' }, { k: 'hl', color: 'rgba(255,120,120,.5)' }], shadow: sh('rgba(0,0,0,.7)') });
add('paintdrip', 'Paint Drip', 'textured', { color: '#ff3b8d', fx: [{ k: 'drip', color: '#ff3b8d' }, st('#ffffff', .06)] });
add('choco', 'Chocolate', 'kids', { color: '#6b3a1e', outline: true, outlineColor: '#3a1d0c', outlineW: .05, fx: [{ k: 'drip', color: '#6b3a1e' }, { k: 'hl', color: 'rgba(255,220,180,.45)' }] });
add('honey', 'Honey', 'kids', { tex: 'gold', fx: [{ k: 'drip', color: '#f2a900' }, { k: 'hl' }] });
add('graffiti', 'Graffiti', 'trend', { tex: 'rainbow', outline: true, outlineColor: '#000', outlineW: .08, fx: [{ k: 'drip', color: '#ff3b8d' }, st('#ffffff', .2), off('#000', .06, .07, .2)] }, 1);
// --- Stickers / multi-stroke
for (const [n, f, a, b] of [['pop', '#ff4d6d', '#ffffff', '#1b1b2f'], ['sun', '#ffcc00', '#ff5a00', '#ffffff'], ['sky', '#1fb6ff', '#ffffff', '#003a66'], ['grape', '#a259ff', '#ffe600', '#1b1b2f'], ['lime', '#9dff3d', '#1b1b2f', '#ffffff']])
  add('stk' + n, 'Sticker ' + n[0].toUpperCase() + n.slice(1), 'kids', { color: f, outline: true, outlineColor: a, outlineW: .1, fx: [st(b, .22), st(a, .3)], shadow: sh('rgba(0,0,0,.35)', 0, .05, .06) }, n === 'pop');
add('triple', 'Triple Line', 'trend', { color: '#ffffff', fx: [st('#ff2d95', .1), st('#ffe600', .18), st('#00e5ff', .26)] }, 1);
add('outline', 'Hollow Line', 'trend', { color: 'rgba(0,0,0,0)', fx: [{ k: 'inline', color: '#ffffff', w: .04 }] });
add('double', 'Double Line', 'trend', { color: 'rgba(0,0,0,0)', fx: [{ k: 'inline', color: '#ffe600', w: .03 }, { k: 'off', color: 'rgba(0,0,0,0)', dx: 0, dy: 0 }, st('#ff2d95', .02)] });
add('inline', 'Inline', 'trend', { color: '#e01e37', fx: [{ k: 'inline', color: '#ffffff', w: .025 }, st('#1b1b2f', .08)] });
// --- Emboss / letterpress
add('emboss', 'Emboss', 'textured', { color: '#d0c8be', fx: [{ k: 'emboss' }] });
add('letterpress', 'Letterpress', 'textured', { color: '#3a3a48', fx: [{ k: 'off', color: 'rgba(255,255,255,.6)', dx: 0, dy: .03 }] });
add('cutout', 'Paper Cut', 'kids', { color: '#ffffff', fx: [off('rgba(0,0,0,.35)', .04, .06), st('#ff9de2', .14), off('rgba(0,0,0,.25)', .05, .07, .14)] });
add('gloss', 'Glossy Gel', 'kids', { color: '#1fb6ff', outline: true, outlineColor: '#003a66', outlineW: .06, fx: [{ k: 'hl', color: 'rgba(255,255,255,.85)' }], shadow: sh() }, 1);
add('jelly', 'Jelly', 'kids', { color: '#ff5fa2', fx: [{ k: 'hl', color: 'rgba(255,255,255,.8)' }, { k: 'inline', color: 'rgba(255,255,255,.4)', w: .03 }], shadow: sh('rgba(160,0,80,.5)', 0, .06, .1) });
// --- Festive
add('xmas', 'Christmas', 'festive', { color: '#e01e37', outline: true, outlineColor: '#ffffff', outlineW: .08, fx: [st('#0b8a3c', .2), { k: 'spark', color: '#ffe066' }] }, 1);
add('snow', 'Snowy', 'festive', { color: '#ffffff', outline: true, outlineColor: '#9be7ff', outlineW: .06, fx: [st('#1f5bff', .16), { k: 'spark', color: '#ffffff' }] });
add('bday', 'Birthday', 'festive', { tex: 'confetti', outline: true, outlineColor: '#ff3b8d', outlineW: .07, fx: [st('#ffffff', .18), { k: 'spark', color: '#ffd23f' }] });
add('love', 'Valentine', 'festive', { color: '#ff3b5c', outline: true, outlineColor: '#ffffff', outlineW: .09, fx: [st('#ff9de2', .2)], glow: { color: '#ff9de2', blur: .3 } });
add('eid', 'Crescent Gold', 'festive', { tex: 'gold', outline: true, outlineColor: '#0b3d2c', outlineW: .05, fx: [st('#0b6b4a', .14), { k: 'spark', color: '#fff3b0' }] });
add('newyear', 'Fireworks', 'festive', { tex: 'gold', glow: { color: '#ffd23f', blur: .5 }, fx: [{ k: 'spark', color: '#ffffff' }, st('#1b1b2f', .05)] });
add('easter', 'Pastel Egg', 'festive', { tex: 'holo', outline: true, outlineColor: '#a259ff', outlineW: .05, fx: [st('#ffffff', .16)] });
// --- Halloween
add('spooky', 'Spooky', 'halloween', { color: '#ff8a00', outline: true, outlineColor: '#000', outlineW: .08, glow: { color: '#a259ff', blur: .5 } });
add('bones', 'Bones', 'halloween', { color: '#f4f1ec', outline: true, outlineColor: '#000', outlineW: .1, fx: [off('#000', .05, .07, .1)] });
add('witch', 'Witch Brew', 'halloween', { color: '#a259ff', outline: true, outlineColor: '#000', outlineW: .07, fx: [{ k: 'drip', color: '#7dff3d' }], glow: { color: '#7dff3d', blur: .3 } });
add('zombie', 'Zombie', 'halloween', { tex: 'camo', outline: true, outlineColor: '#000', outlineW: .08, fx: [{ k: 'drip', color: '#5a6b2a' }] });
// --- Gradient
add('sunsetfade', 'Sunset Fade', 'gradient', { fill: { colors: ['#ffe259', '#ff5f6d'], dir: 'v' }, color: '#ff8a65', outline: true, outlineColor: '#4a0f2a', outlineW: .05 });
add('aqua', 'Aqua Fade', 'gradient', { fill: { colors: ['#a8ffef', '#00b4d8', '#3d5afe'], dir: 'v' }, color: '#00b4d8', fx: [st('#ffffff', .1)] });
add('berry', 'Berry Fade', 'gradient', { fill: { colors: ['#ff9de2', '#a259ff'], dir: 'd' }, color: '#c77dff', outline: true, outlineColor: '#2e1a55', outlineW: .05, fx: [{ k: 'hl' }] });
add('lemon', 'Lemonade', 'gradient', { fill: { colors: ['#fffb7a', '#9dff3d'], dir: 'v' }, color: '#d4ff7a', outline: true, outlineColor: '#1f5a00', outlineW: .06 });
add('fireice', 'Fire & Ice', 'fireice', { fill: { colors: ['#ff6a00', '#ffe066', '#9be7ff', '#1f5bff'], dir: 'h' }, color: '#ffe066', outline: true, outlineColor: '#111', outlineW: .06, glow: { color: '#ffffff', blur: .2 } }, 1);
add('dusk', 'Dusk', 'gradient', { fill: { colors: ['#3a1c71', '#d76d77', '#ffaf7b'], dir: 'v' }, color: '#d76d77', fx: [ext('#1b0e3a', '#0b0518', .08, 80)] });
// --- Kids extras / cinematic
add('crayon', 'Crayon', 'kids', { color: '#ff7a00', fx: [{ k: 'scan', color: 'rgba(255,255,255,.35)' }, st('#ffffff', .08)] });
add('chalk', 'Chalkboard', 'kids', { color: '#f4f1ec', fx: [{ k: 'scan', color: 'rgba(40,60,40,.4)' }], shadow: sh('rgba(255,255,255,.25)', 0, 0, .1) });
add('cloudy', 'Cloud Puff', 'kids', { color: '#ffffff', fx: [st('#bfe6ff', .3), st('#ffffff', .4)], shadow: sh('rgba(0,80,160,.3)', 0, .08, .1) });
add('cine', 'Cinematic', 'trend', { tex: 'silver', fx: [{ k: 'hl' }], shadow: sh('rgba(0,0,0,.8)', 0, .04, .25) }, 1);
add('trailer', 'Trailer Gold', 'metal', { tex: 'gold', glow: { color: '#000', blur: .3 }, fx: [{ k: 'inline', color: 'rgba(255,255,255,.5)', w: .015 }] });
add('steel3d', 'Steel Hero', 'metal', { tex: 'chrome', fx: [ext('#5d7ea8', '#0b1a33', .14, 80), st('#0b1a33', .06)] });
add('bronze', 'Bronze Medal', 'metal', { fill: { colors: ['#ffd1a1', '#cd7f32', '#6b3a10'], dir: 'v' }, color: '#cd7f32', outline: true, outlineColor: '#3b1d05', outlineW: .06, fx: [{ k: 'hl' }, { k: 'emboss' }] });
add('rosegold', 'Rose Gold', 'metal', { fill: { colors: ['#ffe3da', '#e8a598', '#a65f55'], dir: 'v' }, color: '#e8a598', outline: true, outlineColor: '#5c2a25', outlineW: .05, fx: [{ k: 'spark', color: '#ffffff' }] });
add('lightning', 'Lightning', 'glow', { color: '#ffffff', glow: { color: '#00b3ff', blur: .7 }, fx: [{ k: 'glitch', d: .03, a: '#7af', b: '#cff' }] });
add('plasma', 'Plasma', 'neon', { tex: 'galaxy', fx: [{ k: 'neon', color: '#ff6ad5', blur: .7 }] });
add('frost', 'Frostbite', 'fireice', { color: '#e0fbff', fx: [{ k: 'drip', color: '#9be7ff' }, st('#1f5bff', .08)], glow: { color: '#9be7ff', blur: .4 } });
add('blaze', 'Blaze', 'fireice', { tex: 'fire', fx: [{ k: 'neon', color: '#ff5a00', blur: .8 }] }, 1);
// B24 audit: Trending shows only pro-grade looks (cartoon/kids ones stay in their own chips)
const PRO_TREND = ['e_cine', 'e_trailer', 'e_gold', 'e_chrome', 'e_silver', 'e_rosegold', 'e_bronze', 'e_sunsettex', 'e_neoncyan', 'e_neonpink', 'e_neonmulti', 'e_starlight', 'e_aura', 'e_ember', 'e_glitch', 'e_glitchvhs', 'e_triple', 'e_double', 'e_inline', 'e_emboss', 'e_letterpress', 'e_marble', 'e_holo', 'e_metal', 'e_steel3d', 'e_goldblock', 'e_block3d', 'e_long', 'e_ice', 'e_blaze', 'e_fireice', 'e_dusk', 'e_aqua', 'e_lightning'];
for (const e of E) e.trend = PRO_TREND.includes(e.id);
E.sort((a, b) => (b.trend ? 1 : 0) - (a.trend ? 1 : 0) || (PRO_TREND.indexOf(a.id) - PRO_TREND.indexOf(b.id)) * (a.trend ? 1 : 0));
export const EFFECTS = E;
export const EFFECT_CATS = [['trending', 'Trending'], ['kids', 'Kids'], ['comic', 'Comic'], ['metal', 'Metal'], ['glow', 'Glow'], ['textured', 'Textured'], ['3d', '3D'], ['neon', 'Neon'], ['fireice', 'Fire & Ice'], ['gradient', 'Gradient'], ['festive', 'Festive'], ['halloween', 'Halloween'], ['trend', 'Style']];
export const effectById = id => E.find(e => e.id === id);

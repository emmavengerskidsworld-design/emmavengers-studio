/* B21 Templates: professional lockups — refined type (serif/display, tracking, thin+bold pairs, small-caps subtitles), subtle effects,
   multi-line lockups, lower thirds, CTA cards, tickers, luxury, cinematic, vlog, sport, events, elegant faith; smooth cinematic motion.
   Kids keeps the playful designs. Each: style patch s + font/size/track/sub/deco + anim. Rendered by drawText (preview == export). */
const T = [];
const add = (cat, word, o) => T.push({ id: 't_' + T.length, cat, name: o.name || word.replace(/\n/g, ' '), word, font: o.font, size: o.size || 120, s: o.s || {}, track: o.track || 0, sub: o.sub || null, deco: o.deco || null, align: o.align || 'center', fx: o.fx || null, anim: o.anim || { in: { id: 'cineFade', dur: 1 } }, trend: !!o.trend });
const A = (i, l, d = 1) => ({ ...(i ? { in: { id: i, dur: d } } : {}), ...(l ? { loop: { id: l, dur: 3 } } : {}) });
const sub = (text, o = {}) => ({ text, font: o.font || 'montserrat', scale: o.scale || .26, color: o.color || 'rgba(255,255,255,.82)', track: o.track ?? .45, pos: o.pos || 'below', gap: o.gap, glow: o.glow });
const GOLD = { tex: 'gold', shadow: { color: 'rgba(0,0,0,.45)', dx: 0, dy: .03, blur: .12 } }, SILVER = { tex: 'silver', shadow: { color: 'rgba(0,0,0,.5)', dx: 0, dy: .03, blur: .12 } };
const WHITE = { color: '#ffffff', shadow: { color: 'rgba(0,0,0,.45)', dx: 0, dy: .02, blur: .14 } }, CREAM = { color: '#f5efe6', shadow: { color: 'rgba(0,0,0,.4)', dx: 0, dy: .02, blur: .12 } };
const GLOW = c => ({ color: '#ffffff', glow: { color: c, blur: .35 } }), SOFT = c => ({ color: c, shadow: { color: 'rgba(0,0,0,.35)', dx: 0, dy: .02, blur: .1 } });
// ---------- Cinematic
add('cinematic', 'COMING SOON', { font: 'bebasneue', size: 150, track: .32, s: SILVER, deco: { k: 'letterbox', color: 'rgba(0,0,0,.85)' }, sub: sub('IN THEATERS 2026'), anim: A('cineFade', 'slowZoom', 1.4), trend: 1 });
add('cinematic', 'CINEMATIC', { font: 'playfairdisplay', size: 140, track: .22, s: CREAM, deco: { k: 'lines', color: 'rgba(245,239,230,.8)', len: .7 }, sub: sub('A FILM BY YOU'), anim: A('trackIn', 'slowZoom', 1.4), trend: 1 });
add('cinematic', 'MOVIE MOMENT', { font: 'oswald', size: 120, track: .3, s: WHITE, deco: { k: 'letterbox', color: '#000' }, anim: A('cineFade', null, 1.2) });
add('cinematic', 'THE END', { font: 'playfairdisplay', size: 160, track: .18, s: CREAM, sub: sub('THANK YOU FOR WATCHING', { scale: .2 }), anim: A('cineFade', null, 1.6), trend: 1 });
add('cinematic', 'DRAMA', { font: 'bebasneue', size: 200, track: .4, s: { color: '#e9e4dc', shadow: { color: 'rgba(120,0,0,.6)', dx: 0, dy: 0, blur: .4 } }, anim: A('trackIn', null, 1.4) });
add('cinematic', 'CHAPTER ONE', { font: 'playfairdisplay', size: 110, track: .3, s: CREAM, sub: sub('THE BEGINNING', { scale: .3, font: 'playfairdisplay', track: .35 }), deco: { k: 'lines', color: 'rgba(245,239,230,.7)', side: 1 }, anim: A('letterFade', null, 1.4) });
add('cinematic', 'BASED ON A TRUE STORY', { font: 'montserrat', size: 70, track: .4, s: WHITE, anim: A('cineFade', null, 1.6) });
add('cinematic', 'LEGEND', { font: 'abrilfatface', size: 170, track: .12, s: GOLD, deco: { k: 'leak', color: 'rgba(255,170,80,.9)' }, anim: A('cineFade', 'slowZoom', 1.4), trend: 1 });
add('cinematic', 'MIDNIGHT', { font: 'bebasneue', size: 170, track: .5, s: GLOW('#6aa8ff'), deco: { k: 'mist', color: 'rgba(90,140,255,.7)' }, anim: A('letterFade', 'softGlow', 1.4) });
add('cinematic', 'NEW EPISODE', { font: 'oswald', size: 110, track: .28, s: WHITE, deco: { k: 'lines', color: '#e50914', len: .5 }, sub: sub('EPISODE 04 · OUT NOW', { color: '#e50914', scale: .24 }), anim: A('wipeIn', null, 1), trend: 1 });
add('cinematic', 'PREMIERE', { font: 'playfairdisplay', size: 130, track: .2, s: GOLD, deco: { k: 'goldframe', color: '#d4af37' }, sub: sub('FRIDAY · 8 PM', { color: '#d4af37' }), anim: A('cineFade', 'softGlow', 1.2) });
// ---------- Titles
add('titles', 'Title Here', { font: 'playfairdisplay', size: 130, s: CREAM, sub: sub('SUBTITLE GOES HERE'), anim: A('riseSoft', null, 1), trend: 1 });
add('titles', 'THE STORY', { font: 'montserrat', size: 120, track: .5, s: WHITE, deco: { k: 'lines', color: 'rgba(255,255,255,.75)', len: .6 }, anim: A('trackIn', null, 1.2) });
add('titles', 'Episode 1', { font: 'playfairdisplay', size: 120, s: WHITE, sub: sub('THE JOURNEY BEGINS', { pos: 'above', scale: .22 }), anim: A('riseSoft', null, 1) });
add('titles', 'BREAKING NEWS', { font: 'oswald', size: 90, track: .12, s: WHITE, deco: { k: 'ticker', color: '#c8102e' }, align: 'center', anim: A('wipeIn', null, .8) });
add('titles', 'TOP 10', { font: 'bebasneue', size: 180, track: .1, s: GOLD, sub: sub('MOMENTS OF THE YEAR', { color: '#e8d9b0' }), anim: A('riseSoft', 'slowZoom', 1) });
add('titles', 'INTRODUCING', { font: 'montserrat', size: 80, track: .6, s: WHITE, sub: sub('THE NEW COLLECTION', { scale: .32, font: 'playfairdisplay', track: .1 }), anim: A('letterFade', null, 1.2) });
add('titles', 'Part Two', { font: 'dancingscript', size: 150, s: CREAM, deco: { k: 'lines', color: 'rgba(245,239,230,.6)', side: 1 }, anim: A('cineFade', null, 1.2) });
add('titles', 'BEHIND THE SCENES', { font: 'montserrat', size: 70, track: .35, s: WHITE, deco: { k: 'glass', color: 'rgba(255,255,255,.6)' }, anim: A('riseSoft', null, 1) });
// ---------- Lower thirds
add('lower', 'Jordan Hayes', { font: 'montserrat', size: 90, align: 'left', s: WHITE, deco: { k: 'lower', color: '#d4af37' }, sub: sub('CREATIVE DIRECTOR', { color: '#d4af37', scale: .3, track: .3 }), anim: A('wipeIn', null, .9), trend: 1 });
add('lower', 'Sarah Lee', { font: 'poppins', size: 90, align: 'left', s: WHITE, deco: { k: 'lower', color: '#3d8bff' }, sub: sub('HOST · DAILY BRIEF', { scale: .3 }), anim: A('wipeIn', null, .9) });
add('lower', 'Dr. Ade Bello', { font: 'playfairdisplay', size: 90, align: 'left', s: CREAM, deco: { k: 'lower', color: '#ffffff', color2: 'rgba(20,20,24,.6)' }, sub: sub('GUEST SPEAKER', { scale: .3 }), anim: A('riseSoft', null, .9) });
add('lower', 'LIVE', { font: 'montserrat', size: 80, track: .3, align: 'left', s: WHITE, deco: { k: 'dot', color: '#ff3b30' }, sub: sub('DUBAI · 7:30 PM', { scale: .34 }), anim: A('cineFade', 'softGlow', .8) });
add('lower', 'Podcast', { font: 'playfairdisplay', size: 110, s: CREAM, deco: { k: 'play', color: '#d4af37', color2: '#111' }, sub: sub('EPISODE 12 · THE CREATIVE MIND', { scale: .22 }), anim: A('riseSoft', null, 1), trend: 1 });
add('lower', 'NEWS', { font: 'oswald', size: 90, track: .2, s: WHITE, deco: { k: 'ticker', color: '#1f5bff' }, sub: sub('MARKETS CLOSE HIGHER TODAY', { scale: .3, track: .1 }), anim: A('wipeIn', null, .8) });
add('lower', 'Location', { font: 'montserrat', size: 90, align: 'left', s: WHITE, deco: { k: 'pin', color: '#ff4d4d', color2: '#fff' }, sub: sub('SANTORINI, GREECE', { scale: .3 }), anim: A('riseSoft', null, 1), trend: 1 });
add('lower', 'Chef Amara', { font: 'playfairdisplay', size: 90, align: 'left', s: CREAM, deco: { k: 'lower', color: '#c9a36b', color2: 'rgba(30,20,10,.6)' }, sub: sub('HEAD CHEF', { color: '#c9a36b', scale: .3 }), anim: A('wipeIn', null, .9) });
// ---------- Social
add('social', 'SUBSCRIBE', { font: 'montserrat', size: 80, track: .2, s: WHITE, deco: { k: 'subbtn', color: '#ff0000', color2: '#fff' }, anim: A('riseSoft', null, .8), trend: 1 });
add('social', 'THANKS FOR\nWATCHING', { font: 'playfairdisplay', size: 110, track: .08, s: CREAM, sub: sub('SEE YOU IN THE NEXT ONE', { scale: .22 }), anim: A('letterFade', null, 1.4), trend: 1 });
add('social', '@yourname', { font: 'poppins', size: 90, s: WHITE, deco: { k: 'handle', color: 'rgba(255,255,255,.85)' }, anim: A('riseSoft', null, .8) });
add('social', 'Install', { font: 'poppins', size: 100, s: WHITE, deco: { k: 'glass', color: 'rgba(255,255,255,.7)', color2: 'rgba(0,122,255,.75)' }, sub: sub('FREE ON THE APP STORE', { scale: .22 }), anim: A('riseSoft', null, .8) });
add('social', 'NEW VIDEO', { font: 'oswald', size: 110, track: .25, s: WHITE, deco: { k: 'play', color: '#ff0000', color2: '#fff' }, anim: A('wipeIn', null, .8) });
add('social', 'LINK IN BIO', { font: 'montserrat', size: 80, track: .4, s: WHITE, deco: { k: 'handle', color: 'rgba(255,255,255,.75)' }, anim: A('trackIn', null, 1) });
add('social', 'FOLLOW FOR MORE', { font: 'montserrat', size: 70, track: .35, s: WHITE, sub: sub('@yourname', { font: 'poppins', scale: .4, track: 0 }), anim: A('riseSoft', null, 1) });
add('social', 'Let’s Cook With Me', { font: 'dancingscript', size: 130, s: SOFT('#fff4e0'), sub: sub('EASY HOMEMADE RECIPES', { scale: .2 }), anim: A('cineFade', null, 1.2), trend: 1 });
add('social', 'POV', { font: 'bebasneue', size: 160, track: .3, s: WHITE, sub: sub('you finally made it', { font: 'playfairdisplay', scale: .3, track: .05 }), anim: A('cineFade', null, 1) });
// ---------- Vlog & travel
add('vlog', 'TRAVEL JOURNAL', { font: 'playfairdisplay', size: 110, track: .2, s: CREAM, deco: { k: 'lines', color: 'rgba(245,239,230,.7)', len: .8 }, sub: sub('DAY 01 · LISBON'), anim: A('trackIn', null, 1.3), trend: 1 });
add('vlog', 'Beautiful', { font: 'dancingscript', size: 170, s: SOFT('#ffffff'), deco: { k: 'leak', color: 'rgba(255,190,120,.8)' }, anim: A('cineFade', 'slowZoom', 1.4), trend: 1 });
add('vlog', 'Weekend Vlog', { font: 'playfairdisplay', size: 120, s: CREAM, sub: sub('SAT · 26 OCT', { pos: 'above' }), anim: A('riseSoft', null, 1) });
add('vlog', 'WANDERLUST', { font: 'montserrat', size: 110, track: .55, s: WHITE, anim: A('trackIn', 'slowZoom', 1.4) });
add('vlog', 'Day in My Life', { font: 'playfairdisplay', size: 110, s: WHITE, deco: { k: 'glass', color: 'rgba(255,255,255,.5)' }, anim: A('riseSoft', null, 1) });
add('vlog', 'Paris', { font: 'playfairdisplay', size: 180, track: .1, s: CREAM, deco: { k: 'pin', color: '#f5efe6', color2: '#222' }, sub: sub('FRANCE · 48.85° N', { scale: .16 }), anim: A('cineFade', null, 1.2) });
add('vlog', 'GOLDEN HOUR', { font: 'montserrat', size: 100, track: .45, s: { tex: 'sunset', shadow: { color: 'rgba(0,0,0,.3)', dx: 0, dy: .02, blur: .1 } }, deco: { k: 'leak', color: 'rgba(255,170,70,.9)' }, anim: A('trackIn', 'softGlow', 1.4), trend: 1 });
add('vlog', 'ROAD TRIP', { font: 'bebasneue', size: 170, track: .2, s: WHITE, deco: { k: 'marker', color: 'rgba(200,30,40,.9)' }, anim: A('wipeIn', null, .9) });
add('vlog', 'Coffee & Chill', { font: 'playfairdisplay', size: 110, s: SOFT('#f3e3cf'), sub: sub('SUNDAY MORNINGS'), anim: A('cineFade', null, 1.2) });
// ---------- Luxury
add('luxury', 'PREMIUM', { font: 'playfairdisplay', size: 130, track: .35, s: GOLD, deco: { k: 'lines', color: '#d4af37', len: .9 }, sub: sub('COLLECTION', { color: '#d4af37' }), anim: A('trackIn', 'softGlow', 1.4), trend: 1 });
add('luxury', 'LUX', { font: 'playfairdisplay', size: 220, track: .45, s: GOLD, anim: A('cineFade', 'slowZoom', 1.4), trend: 1 });
add('luxury', '4K QUALITY', { font: 'montserrat', size: 110, track: .3, s: SILVER, deco: { k: 'goldframe', color: '#cfd6dd' }, anim: A('cineFade', null, 1) });
add('luxury', 'GOLDEN', { font: 'abrilfatface', size: 170, track: .08, s: GOLD, deco: { k: 'goldframe', color: '#d4af37' }, anim: A('cineFade', 'softGlow', 1.4), trend: 1 });
add('luxury', 'EXCLUSIVE', { font: 'playfairdisplay', size: 110, track: .4, s: CREAM, deco: { k: 'glass', color: 'rgba(212,175,55,.8)', color2: 'rgba(0,0,0,.45)' }, anim: A('trackIn', null, 1.2) });
add('luxury', 'Maison', { font: 'playfairdisplay', size: 160, s: GOLD, sub: sub('PARIS · EST. 1998', { color: '#d4af37', scale: .18 }), anim: A('cineFade', null, 1.4) });
add('luxury', 'LIMITED EDITION', { font: 'montserrat', size: 80, track: .5, s: GOLD, deco: { k: 'lines', color: '#d4af37', len: 1 }, anim: A('letterFade', null, 1.4) });
add('luxury', 'Noir', { font: 'abrilfatface', size: 190, s: { color: '#111111', fx: [{ k: 'stk', color: 'rgba(212,175,55,.9)', w: .03 }] }, anim: A('cineFade', null, 1.4) });
// ---------- Glow
add('glow', 'GLOW MIST', { font: 'montserrat', size: 110, track: .4, s: GLOW('#ffd1ec'), deco: { k: 'mist', color: 'rgba(255,190,230,.8)' }, anim: A('letterFade', 'softGlow', 1.4), trend: 1 });
add('glow', 'AURA MODE', { font: 'bebasneue', size: 160, track: .3, s: GLOW('#a98bff'), deco: { k: 'mist', color: 'rgba(170,140,255,.8)' }, anim: A('cineFade', 'softGlow', 1.4), trend: 1 });
add('glow', 'STARLIGHT', { font: 'playfairdisplay', size: 140, track: .25, s: { tex: 'gold', glow: { color: '#fff3b0', blur: .3 } }, deco: { k: 'sparkles', color: '#fff6d6' }, anim: A('letterFade', 'softGlow', 1.4), trend: 1 });
add('glow', 'The Glow Up', { font: 'playfairdisplay', size: 130, s: GLOW('#ffcf9e'), sub: sub('SKINCARE ROUTINE', { scale: .2 }), anim: A('cineFade', 'softGlow', 1.4), trend: 1 });
add('glow', 'BLAZE', { font: 'bebasneue', size: 200, track: .25, s: { color: '#fff1d6', glow: { color: '#ff6a00', blur: .45 } }, anim: A('cineFade', 'softGlow', 1.2), trend: 1 });
add('glow', 'Dreamscape', { font: 'dancingscript', size: 160, s: GLOW('#9be7ff'), deco: { k: 'mist', color: 'rgba(150,220,255,.7)' }, anim: A('cineFade', 'slowZoom', 1.4) });
add('glow', 'NEON', { font: 'montserrat', size: 150, track: .4, s: { color: '#ffe9f6', fx: [{ k: 'neon', color: '#ff4fa3', blur: .6 }] }, anim: A('cineFade', 'softGlow', 1) });
add('glow', '', { name: 'Glow Butterfly', font: 'montserrat', size: 120, s: GLOW('#9be7ff'), deco: { k: 'butterfly', color: '#9be7ff' }, anim: A('cineFade', 'softGlow', 1.4) });
// ---------- Minimal
add('minimal', 'minimal', { font: 'montserrat', size: 110, track: .6, s: WHITE, anim: A('trackIn', null, 1.2), trend: 1 });
add('minimal', 'Less is more.', { font: 'playfairdisplay', size: 110, s: WHITE, anim: A('letterFade', null, 1.4) });
add('minimal', 'MONDAY', { font: 'montserrat', size: 120, track: .5, s: WHITE, sub: sub('09.00 — 17.00', { scale: .22 }), anim: A('riseSoft', null, 1) });
add('minimal', 'focus', { font: 'quicksand', size: 140, track: .3, s: WHITE, deco: { k: 'lines', color: 'rgba(255,255,255,.6)', side: 1 }, anim: A('cineFade', null, 1.2) });
add('minimal', 'NOTES', { font: 'oswald', size: 100, track: .4, s: WHITE, deco: { k: 'glass', color: 'rgba(255,255,255,.55)' }, anim: A('wipeIn', null, 1) });
add('minimal', '', { name: 'Red Marker', font: 'bebasneue', size: 140, s: WHITE, deco: { k: 'marker', color: 'rgba(214,32,40,.95)' }, anim: A('wipeIn', null, .8) });
add('minimal', '', { name: 'Gold Frame', font: 'playfairdisplay', size: 140, s: WHITE, deco: { k: 'goldframe', color: '#d4af37' }, anim: A('cineFade', 'softGlow', 1.2) });
// ---------- Sport
add('sport', 'MATCHDAY', { font: 'bebasneue', size: 170, track: .18, s: { tex: 'silver', shadow: { color: 'rgba(0,0,0,.6)', dx: .03, dy: .04, blur: .05 } }, sub: sub('HOME VS AWAY · 20:00'), deco: { k: 'marker', color: 'rgba(20,60,160,.9)' }, anim: A('wipeIn', null, .8), trend: 1 });
add('sport', 'HIGHLIGHT', { font: 'oswald', size: 140, track: .2, s: WHITE, deco: { k: 'marker', color: 'rgba(214,32,40,.92)' }, anim: A('wipeIn', null, .8), trend: 1 });
add('sport', 'FINAL SCORE', { font: 'bebasneue', size: 120, track: .25, s: WHITE, sub: sub('3 — 1', { font: 'bebasneue', scale: .7, track: .2 }), anim: A('riseSoft', null, .9) });
add('sport', 'GAME DAY', { font: 'anton', size: 160, track: .1, s: WHITE, deco: { k: 'letterbox', color: 'rgba(0,0,0,.8)' }, anim: A('cineFade', 'slowZoom', 1) });
add('sport', 'MVP', { font: 'bebasneue', size: 220, track: .3, s: GOLD, sub: sub('PLAYER OF THE MATCH', { color: '#e8d9b0' }), anim: A('trackIn', null, 1.2) });
add('sport', 'TRAINING', { font: 'oswald', size: 130, track: .35, s: WHITE, deco: { k: 'lines', color: '#ff3b30', len: .5 }, anim: A('wipeIn', null, .8) });
// ---------- Events
add('events', 'Happy Birthday', { font: 'dancingscript', size: 150, s: GOLD, sub: sub('CELEBRATING YOU', { color: '#e8d9b0' }), deco: { k: 'sparkles', color: '#fff3c4' }, anim: A('cineFade', 'softGlow', 1.4), trend: 1 });
add('events', 'Save the Date', { font: 'playfairdisplay', size: 130, s: CREAM, sub: sub('12 · 06 · 2026'), deco: { k: 'lines', color: 'rgba(245,239,230,.7)', len: .6 }, anim: A('letterFade', null, 1.4), trend: 1 });
add('events', 'Just Married', { font: 'dancingscript', size: 160, s: CREAM, deco: { k: 'goldframe', color: '#e8d9b0' }, anim: A('cineFade', 'softGlow', 1.4) });
add('events', 'Graduation', { font: 'playfairdisplay', size: 130, s: GOLD, sub: sub('CLASS OF 2026', { color: '#e8d9b0' }), anim: A('riseSoft', null, 1.2) });
add('events', 'Anniversary', { font: 'playfairdisplay', size: 130, s: { color: '#f3d1c8', shadow: { color: 'rgba(0,0,0,.35)', dx: 0, dy: .02, blur: .1 } }, sub: sub('TEN YEARS TOGETHER'), anim: A('letterFade', null, 1.4) });
add('events', 'Welcome', { font: 'playfairdisplay', size: 150, s: CREAM, sub: sub('TO OUR CELEBRATION', { scale: .2 }), anim: A('cineFade', null, 1.2) });
// ---------- Festive (elegant)
add('festive', 'Merry Christmas', { font: 'dancingscript', size: 140, s: GOLD, deco: { k: 'sparkles', color: '#fff3c4' }, sub: sub('SEASON’S GREETINGS', { color: '#e8d9b0' }), anim: A('cineFade', 'softGlow', 1.4) });
add('festive', 'HAPPY NEW YEAR', { font: 'montserrat', size: 90, track: .4, s: GOLD, sub: sub('2027', { font: 'playfairdisplay', scale: 1.1, track: .3, color: '#f5efe6' }), anim: A('trackIn', 'softGlow', 1.4) });
add('festive', 'Eid Mubarak', { font: 'playfairdisplay', size: 140, s: GOLD, deco: { k: 'goldframe', color: '#d4af37' }, anim: A('cineFade', 'softGlow', 1.4) });
add('festive', 'Happy Easter', { font: 'dancingscript', size: 150, s: CREAM, deco: { k: 'leak', color: 'rgba(255,220,180,.7)' }, anim: A('cineFade', null, 1.4) });
// ---------- Faith (elegant)
add('faith', 'Bible Story', { font: 'playfairdisplay', size: 130, track: .1, s: CREAM, deco: { k: 'rays', color: 'rgba(255,240,200,.9)' }, sub: sub('GENESIS 1:1', { color: '#e8d9b0' }), anim: A('cineFade', 'softGlow', 1.6), trend: 1 });
add('faith', 'Amen', { font: 'playfairdisplay', size: 180, track: .3, s: { color: '#fff8e8', glow: { color: '#ffe8a8', blur: .3 } }, deco: { k: 'rays', color: 'rgba(255,240,200,.9)' }, anim: A('cineFade', 'softGlow', 1.6) });
add('faith', 'Grace', { font: 'playfairdisplay', size: 170, track: .2, s: CREAM, deco: { k: 'crossline', color: '#f5e6c4' }, anim: A('letterFade', null, 1.6) });
add('faith', 'God Is Good', { font: 'playfairdisplay', size: 130, s: GOLD, sub: sub('ALL THE TIME', { color: '#e8d9b0' }), anim: A('riseSoft', 'softGlow', 1.4) });
add('faith', 'Memory Verse', { font: 'playfairdisplay', size: 110, s: CREAM, deco: { k: 'lines', color: 'rgba(245,230,196,.8)', len: .7 }, sub: sub('PSALM 23:1', { color: '#e8d9b0' }), anim: A('letterFade', null, 1.4) });
add('faith', 'Worship', { font: 'montserrat', size: 110, track: .55, s: { color: '#ffffff', glow: { color: '#ffd98a', blur: .25 } }, deco: { k: 'rays', color: 'rgba(255,230,170,.8)' }, anim: A('trackIn', 'softGlow', 1.6) });
add('faith', 'Sunday Service', { font: 'playfairdisplay', size: 120, s: CREAM, sub: sub('10:00 AM · ALL WELCOME'), deco: { k: 'crossline', color: '#f5e6c4' }, anim: A('cineFade', null, 1.2) });
// ---------- Kids (playful; kept separate)
const KID = (word, fx, font, deco, i, l, size = 150) => T.push({ id: 't_' + T.length, cat: 'kids', name: word, word, font, size, fx: 'e_' + fx, s: null, track: 0, sub: null, deco, align: 'center', anim: A(i, l, .8), trend: false });
KID('KABOOM!', 'comic', 'bangers', { k: 'burst', color: '#ffe600', color2: '#000' }, 'g_slam', 'beatZoom', 170);
KID('Well Done!', 'stksun', 'luckiestguy', { k: 'stars', color: '#ffd23f' }, 'loveBounce', 'beatZoom');
KID('Story Time', 'starry', 'chewy', { k: 'sparkles', color: '#ffe066' }, 'waveIn', 'floaty');
KID('Great Job!', 'bubble3d', 'fredoka', { k: 'stars', color: '#ffe600' }, 'jellyPop', 'jellyLoop');
KID('Hooray!', 'confetti', 'chewy', { k: 'burst', color: '#ffffff', color2: '#ff4d6d' }, 'fireworkBloom', 'beatZoom', 160);
KID('ABC', 'rainbow', 'luckiestguy', null, 'g_hop', 'wave', 200);
KID('Super Star', 'goldblock', 'carterone', { k: 'stars', color: '#ffd23f' }, 'starShower', 'sparkleLoop');
KID('Oops!', 'cherry3d', 'luckiestguy', { k: 'burst', color: '#ffe600', color2: '#000' }, 'g_quirky', 'swing', 160);
KID('Fun Fact', 'stksky', 'baloo2', { k: 'pill', color: '#ffe600' }, 'bounceIn', null, 140);
KID('Yummy!', 'choco', 'chewy', null, 'jellyPop', 'jellyLoop', 160);
export const TEMPLATES = T;
export const TEMPLATE_CATS = [['trending', 'Trending'], ['cinematic', 'Cinematic'], ['titles', 'Titles'], ['lower', 'Lower thirds'], ['social', 'Social'], ['vlog', 'Vlog & Travel'], ['luxury', 'Luxury'], ['glow', 'Glow'], ['minimal', 'Minimal'], ['sport', 'Sport'], ['events', 'Events'], ['faith', 'Faith'], ['kids', 'Kids'], ['festive', 'Festive']];
export const TRENDING_T = new Set(T.filter(t => t.trend).map(t => t.id));

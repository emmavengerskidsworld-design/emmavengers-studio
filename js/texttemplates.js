/* B20 Templates: designed lockups = effect + font + decorative element + In/Loop animation + sample word. */
const T = [], add = (cat, word, fx, font, deco, inA, loop, size = 150) => T.push({ id: 't_' + T.length, cat, name: word.replace(/\n/g, ' '), word, fx: 'e_' + fx, font, deco, anim: { ...(inA ? { in: { id: inA, dur: .8 } } : {}), ...(loop ? { loop: { id: loop, dur: 1.4 } } : {}) }, size });
const D = (k, color, color2) => ({ k, color, color2 });
// Action
add('action', 'KABOOM!', 'comic', 'bangers', D('burst', '#ffe600', '#000'), 'g_slam', 'beatZoom', 170);
add('action', 'FIGHT!', 'boom', 'bangers', D('burst', '#e01e37', '#000'), 'g_slam', 'swing', 170);
add('action', 'POW!', 'kapow', 'luckiestguy', D('burst', '#1fb6ff', '#000'), 'pop', 'beatZoom', 170);
add('action', 'BOSS', 'steel3d', 'anton', D('bar', '#e01e37'), 'zoom', null, 180);
add('action', 'LEVEL UP', 'neonlime', 'pressstart2p', D('frame', '#9dff3d'), 'g_pixel', 'neonBuzz', 110);
add('action', 'GAME OVER', 'glitch', 'pressstart2p', null, 'g_glitchSweep', 'glitchLoop', 110);
add('action', 'MATCHDAY', 'block3d', 'bebasneue', D('swipe', '#1f5bff'), 'g_race', null, 170);
add('action', 'HIGHLIGHT', 'zap', 'anton', D('swipe', '#ffe600'), 'g_skid', null, 160);
add('action', 'BATTLE', 'blaze', 'bangers', D('burst', '#2a0000', '#ff5a00'), 'flamePuff', 'flameDance', 170);
add('action', 'VICTORY', 'goldblock', 'bowlbyone', D('stars', '#ffd23f'), 'g_beatUp', 'sparkleLoop', 150);
// Titles / cinematic
add('titles', 'COMING SOON', 'cine', 'bebasneue', D('bar', '#c0c0c0'), 'fadeWords', null, 150);
add('titles', 'THE END', 'trailer', 'playfairdisplay', D('frame', '#d4af37'), 'blur', null, 160);
add('cinematic', 'GOLDEN HOUR', 'sunsettex', 'playfairdisplay', D('sparkles', '#fff3b0'), 'riseWords', null, 140);
add('cinematic', 'STARLIGHT', 'starlight', 'abrilfatface', D('sparkles', '#ffffff'), 'g_stellar', 'sparkleLoop', 150);
add('cinematic', 'CHAPTER ONE', 'silver', 'playfairdisplay', D('bar', '#ffffff'), 'fadeWords', null, 130);
add('cinematic', 'EPIC', 'chrome', 'anton', null, 'g_optic', null, 200);
add('cinematic', 'LEGEND', 'gold', 'abrilfatface', D('frame', '#d4af37'), 'zoom', 'cometOrbit', 170);
add('cinematic', 'MIDNIGHT', 'galaxy', 'oswald', D('stars', '#fff6a0'), 'g_aurora', null, 160);
add('titles', 'BREAKING NEWS', 'inline', 'oswald', D('ribbon', '#e01e37', '#8a0012'), 'slide', null, 110);
add('titles', 'TOP 10', 'goldblock', 'bowlbyone', D('badge', '#e01e37', '#ffd23f'), 'pop', 'beatZoom', 150);
add('titles', 'EPISODE 1', 'retro', 'righteous', null, 'g_stellar', null, 140);
add('titles', 'BEHIND THE SCENES', 'letterpress', 'oswald', D('pill', '#ffe600'), 'riseWords', null, 100);
// Social
add('social', 'SUBSCRIBE', 'stkpop', 'luckiestguy', D('pill', '#e01e37', '#ffffff'), 'pop', 'beatZoom', 130);
add('social', 'THANKS FOR\nWATCHING', 'neonpink', 'pacifico', D('hearts', '#ff5fa2'), 'typewriter', 'glowPulse', 120);
add('social', 'LIKE & SHARE', 'gloss', 'fredoka', D('hearts', '#ff3b5c'), 'bounceIn', 'heartBeat', 120);
add('social', 'FOLLOW ME', 'neonmulti', 'righteous', null, 'g_cursorType', 'neonBuzz', 130);
add('social', 'LINK IN BIO', 'triple', 'poppins', D('pill', '#1b1b2f'), 'slide', null, 110);
add('social', 'NEW VIDEO', 'stksun', 'bowlbyone', D('burst', '#ffffff', '#ff5a00'), 'g_popup', 'beatZoom', 140);
add('social', 'WAIT FOR IT…', 'glitchpink', 'montserrat', null, 'typewriter', null, 120);
add('social', 'TRENDING', 'blaze', 'anton', D('ribbon', '#ff5a00', '#7a2a00'), 'g_slam', null, 150);
add('social', 'MEGA SALE', 'comic', 'luckiestguy', D('badge', '#e01e37', '#ffe600'), 'g_slam', 'beatZoom', 150);
add('social', '50% OFF', 'goldblock', 'bowlbyone', D('burst', '#e01e37', '#000'), 'pop', 'swing', 170);
add('social', 'POV:', 'outline', 'montserrat', D('pill', 'rgba(0,0,0,.6)'), 'slide', null, 140);
add('social', 'STORY TIME', 'stkgrape', 'fredoka', D('sparkles', '#ffe600'), 'bounceIn', 'floaty', 140);
// Kids
add('kids', 'Well Done!', 'stksun', 'luckiestguy', D('stars', '#ffd23f'), 'loveBounce', 'beatZoom', 150);
add('kids', 'Great Job!', 'bubble3d', 'fredoka', D('stars', '#ffe600'), 'jellyPop', 'jellyLoop', 150);
add('kids', 'Story Time', 'starry', 'chewy', D('sparkles', '#ffe066'), 'waveIn', 'floaty', 150);
add('kids', 'ABC', 'rainbow', 'luckiestguy', null, 'g_hop', 'wave', 200);
add('kids', '123', 'toy', 'titanone', null, 'pop', 'floaty', 200);
add('kids', 'Hooray!', 'confetti', 'chewy', D('burst', '#ffffff', '#ff4d6d'), 'fireworkBloom', 'beatZoom', 160);
add('kids', 'Fun Fact', 'stksky', 'baloo2', D('pill', '#ffe600'), 'bounceIn', null, 140);
add('kids', 'Let’s Learn', 'cutout', 'grandstander', D('swipe', '#ffcc00'), 'g_bubbleUp', null, 140);
add('kids', 'Super Star', 'goldblock', 'carterone', D('stars', '#ffd23f'), 'starShower', 'sparkleLoop', 150);
add('kids', 'Bedtime', 'halo', 'pacifico', D('stars', '#fff3b0'), 'featherPoof', 'floaty', 150);
add('kids', 'Yummy!', 'choco', 'chewy', null, 'jellyPop', 'jellyLoop', 160);
add('kids', 'Oops!', 'cherry3d', 'luckiestguy', D('burst', '#ffe600', '#000'), 'g_quirky', 'swing', 160);
add('kids', 'Play Time', 'stklime', 'dynapuff', null, 'g_hop', 'floaty', 150);
add('kids', 'Cartoon', 'popart', 'bangers', null, 'pop', 'swing', 170);
// Faith
add('faith', 'Bible Story', 'gold', 'playfairdisplay', D('cross', '#ffe066'), 'riseWords', 'glowPulse', 140);
add('faith', 'Amen!', 'halo', 'pacifico', D('sparkles', '#ffe066'), 'g_aurora', 'glowPulse', 170);
add('faith', 'Jesus Loves Me', 'love', 'pacifico', D('hearts', '#ff9de2'), 'loveBounce', 'heartBeat', 130);
add('faith', 'God Is Good', 'starlight', 'abrilfatface', D('sparkles', '#fff3b0'), 'fadeWords', null, 140);
add('faith', 'Hallelujah', 'magic', 'dancingscript', D('stars', '#ffe066'), 'g_stellar', 'sparkleLoop', 150);
add('faith', 'Pray', 'ice', 'playfairdisplay', D('cross', '#ffffff'), 'blur', null, 170);
add('faith', 'Blessed', 'rosegold', 'lobster', D('sparkles', '#ffffff'), 'riseWords', null, 160);
add('faith', 'Sunday School', 'stksky', 'fredoka', D('ribbon', '#1fb6ff', '#0b5394'), 'bounceIn', null, 120);
add('faith', 'Memory Verse', 'letterpress', 'playfairdisplay', D('frame', '#d4af37'), 'typewriter', null, 120);
add('faith', 'Faith', 'aura', 'abrilfatface', D('cross', '#9be7ff'), 'g_aurora', 'glowPulse', 170);
// Glow
add('glow', 'NEON NIGHTS', 'neoncyan', 'righteous', null, 'g_laser', 'neonBuzz', 130);
add('glow', 'PARTY', 'neonmulti', 'bungee', D('sparkles', '#ff2d95'), 'pop', 'beatZoom', 160);
add('glow', 'DREAM', 'holo', 'pacifico', D('sparkles', '#c1fff4'), 'featherPoof', 'floaty', 170);
add('glow', 'OPEN', 'neonsign', 'pacifico', D('frame', '#ffb000'), 'g_laser', 'neonBuzz', 170);
add('glow', 'GLOW UP', 'neonrainbow', 'bungee', null, 'g_ember', 'glowPulse', 150);
add('glow', 'MAGIC', 'magic', 'lobster', D('stars', '#ffd1ff'), 'g_glitter', 'sparkleLoop', 170);
add('glow', 'ELECTRIC', 'lightning', 'anton', null, 'g_pixel', 'glitchLoop', 160);
// Festive
add('festive', 'Happy Birthday!', 'bday', 'chewy', D('stars', '#ffd23f'), 'fireworkBloom', 'floaty', 130);
add('festive', 'Merry Christmas', 'xmas', 'lobster', D('stars', '#ffe066'), 'g_floatDown', 'sparkleLoop', 120);
add('festive', 'Happy New Year', 'newyear', 'abrilfatface', D('sparkles', '#ffd23f'), 'fireworkBloom', 'sparkleLoop', 120);
add('festive', 'Eid Mubarak', 'eid', 'playfairdisplay', D('stars', '#fff3b0'), 'riseWords', null, 130);
add('festive', 'Be Mine', 'love', 'pacifico', D('hearts', '#ff3b5c'), 'loveBounce', 'heartBeat', 160);
add('festive', 'Let It Snow', 'snow', 'fredoka', D('sparkles', '#ffffff'), 'g_floatDown', 'floaty', 140);
add('festive', 'Happy Easter', 'easter', 'chewy', D('sparkles', '#ff9de2'), 'g_hop', null, 140);
add('festive', 'Congrats!', 'confetti', 'luckiestguy', D('burst', '#ffd23f', '#ff4d6d'), 'g_popup', 'beatZoom', 150);
// Halloween
add('halloween', 'BOO!', 'ghostglow', 'creepster' in {} ? 'creepster' : 'bangers', D('burst', '#1b1b2f', '#a259ff'), 'g_ghost', 'floaty', 180);
add('halloween', 'Trick or Treat', 'pumpkin', 'chewy', D('stars', '#ff8a00'), 'g_wobble', 'swing', 120);
add('halloween', 'SPOOKY', 'slime', 'bangers', null, 'g_smoke', 'floaty', 170);
add('halloween', 'Haunted', 'blood', 'abrilfatface', null, 'g_ghost', null, 160);
add('halloween', 'Witchy', 'witch', 'lobster', D('stars', '#7dff3d'), 'g_acid', 'glowPulse', 160);
add('halloween', 'ZOMBIE', 'zombie', 'bangers', null, 'g_wobble', 'swing', 170);
// Trending mixes
add('social', 'NO WAY!', 'graffiti', 'permanentmarker', null, 'g_slam', 'swing', 160);
add('action', 'FIRE', 'fire', 'anton', null, 'flamePuff', 'flameDance', 200);
add('cinematic', 'FROZEN', 'ice3d', 'bebasneue', D('sparkles', '#ffffff'), 'g_aurora', null, 180);
add('kids', 'Cool!', 'iso', 'titanone', null, 'pop', 'beatZoom', 170);
export const TEMPLATES = T;
export const TEMPLATE_CATS = [['trending', 'Trending'], ['kids', 'Kids'], ['faith', 'Faith'], ['titles', 'Titles'], ['social', 'Social'], ['action', 'Action'], ['glow', 'Glow'], ['cinematic', 'Cinematic'], ['festive', 'Festive'], ['halloween', 'Halloween']];
export const TRENDING_T = new Set([0, 3, 10, 12, 13, 22, 23, 30, 34, 36, 48, 49, 57, 64, 72].map(i => 't_' + i));

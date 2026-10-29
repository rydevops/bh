// Vanguard is drawn from art/vanguard.png everywhere (battle sprite, portraits, home, title); other heroes stay procedural.
const { chromium } = require('playwright'); const { spawn } = require('child_process');
(async () => {
  const srv = spawn('node', [require('path').join(__dirname, '../serve.mjs'), '8098'], { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 600));
  const b = await chromium.launch();
  let fails = 0; const ok = (m) => console.log('ok  - ' + m); const fail = (m) => { fails++; console.log('FAIL: ' + m); };
  const p = await (await b.newContext({ viewport: { width: 402, height: 874 }, deviceScaleFactor: 2 })).newPage();
  const reqs = []; p.on('request', (r) => reqs.push(r.url())); p.on('pageerror', (e) => fail('pageerror ' + e.message));
  await p.goto('http://localhost:8098/'); await p.waitForSelector('text=Tap to play');
  if (reqs.some((u) => u.endsWith('/art/vanguard.png')) && reqs.some((u) => u.endsWith('/art/vanguard.json'))) ok('the sprite sheet and its atlas are loaded at boot'); else fail('sheet not requested');
  const r = await p.evaluate(async () => {
    const art = await import('/js/render/art.js'); const sp = await import('/js/render/sprites.js');
    const fr = art.artFrame('vanguard', 'default', 'fire_1');
    const px = (cv) => { const x = cv.getContext('2d'); const d = x.getImageData(0, 0, cv.width, cv.height).data; let opaque = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 200) opaque++; return { corner: d[3], opaque }; };
    const idle = sp.heroSprite('vanguard', 'default', 2), fire = sp.heroSprite('vanguard', 'default', 2, 'fire_1'), fire2 = sp.heroSprite('vanguard', 'default', 2, 'fire_2'), ability = sp.heroSprite('vanguard', 'default', 2, 'overdrive_1'), ability2 = sp.heroSprite('vanguard', 'default', 2, 'overdrive_2');
    const rook = sp.heroSprite("rook", "default", 2), rookFire = sp.heroSprite("rook", "default", 2, "fire_1");
    const arctic = sp.heroSprite('vanguard', 'arctic', 2), arcticProc = sp.proceduralHero('vanguard', 'arctic', 2);
    const url = sp.heroPortrait('vanguard', 'default', 64);
    const img = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.src = url; });
    return { hasFire: !!fr, idleSize: [idle.lw, idle.lh, idle.width, idle.height], idle: px(idle), fireDiffers: new Set([idle, fire, fire2, ability, ability2]).size === 5, rookSame: rook === rookFire,
      arcticProcedural: arctic === arcticProc, portraitSize: [img.width, img.height], isArt: idle !== sp.proceduralHero('vanguard', 'default', 2) };
  });
  if (r.hasFire && r.isArt) ok('Vanguard\'s sprite comes from the sheet, not the procedural drawing'); else fail('not using the sheet ' + JSON.stringify(r));
  if (r.idleSize[0] === 72 && r.idleSize[1] === 112 && r.idle.corner === 0 && r.idle.opaque > 500) ok('the sprite keeps the 72x112 world box and a transparent background'); else fail('sprite ' + JSON.stringify(r.idle));
  if (r.fireDiffers) ok('the idle, two fire and two Overdrive frames are five separate bitmaps'); else fail('frames identical');
  if (r.rookSame && r.arcticProcedural) ok('other heroes and Vanguard\'s other skins still use the procedural art'); else fail('fallback broken ' + JSON.stringify(r));
  if (r.portraitSize[0] === 128) ok('portraits are built from the icon frame'); else fail('portrait size ' + r.portraitSize);
  // art that cannot load falls back to procedural instead of breaking the game
  const p2 = await (await b.newContext({ viewport: { width: 402, height: 874 } })).newPage();
  await p2.route('**/art/vanguard.png', (rt) => rt.abort());
  p2.on('pageerror', (e) => fail('pageerror (fallback) ' + e.message));
  await p2.goto('http://localhost:8098/'); await p2.waitForSelector('text=Tap to play');
  const fb = await p2.evaluate(async () => { const sp = await import('/js/render/sprites.js'); return sp.heroSprite('vanguard', 'default', 2) === sp.proceduralHero('vanguard', 'default', 2); });
  if (fb) ok('a missing sheet falls back to the procedural sprite'); else fail('no fallback');
  await b.close(); srv.kill();
  console.log(fails ? 'ART: ' + fails + ' FAILED' : 'ART: ALL CHECKS PASSED'); process.exit(fails ? 1 : 0);
})();

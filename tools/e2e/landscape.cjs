// Landscape: phone sideways, tablet and desktop. No horizontal overflow, side rail nav, battlefield input maps correctly,
// rotating live works, reward cards fit. SHOTS=/dir saves screenshots.
const { chromium } = require('playwright'); const { spawn } = require('child_process');
const SHOTS = process.env.SHOTS ? process.env.SHOTS + '/land_' : null;
(async () => {
  const srv = spawn('node', [require('path').join(__dirname, '../serve.mjs'), '8099'], { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 600));
  const b = await chromium.launch(); let fails = 0;
  const ok = (m) => console.log('ok  - ' + m); const fail = (m) => { fails++; console.log('FAIL: ' + m); };
  for (const [w, h, name] of [[844, 390, 'phone'], [1180, 820, 'tablet'], [1440, 800, 'desktop']]) {
    const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, hasTouch: true });
    const p = await ctx.newPage(); p.on('pageerror', (e) => fail(name + ' pageerror ' + e.message));
    await p.goto('http://localhost:8099/');
    await p.evaluate(async () => { const { defaultProfile } = await import('/js/save.js'); const { store } = await import('/js/store.js'); const pr = defaultProfile(); pr.flags.tutorial = true; pr.flags.heroMenu = true; pr.flags.seen = { tipAuto: 1, tipAbility: 1, tipCut: 1, tipExposed: 1, tipAmmo: 1 }; pr.coins = 900; store.replace(pr); });
    await p.reload(); await p.waitForSelector('text=Tap to play');
    if (await p.evaluate(() => document.body.classList.contains('landscape'))) ok(name + ': landscape layout is on'); else fail(name + ': not landscape');
    await p.click('text=Tap to play'); await p.waitForSelector('.nav');
    for (const [scr, label] of [['home', 'Battle'], ['heroes', 'Heroes'], ['research', 'Research'], ['missions', 'Missions'], ['shop', 'Wardrobe']]) {
      await p.click(`.nav >> text=${label}`); await p.waitForTimeout(150);
      const o = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: innerWidth, nav: document.querySelector('.nav').getBoundingClientRect().toJSON() }));
      if (o.sw <= o.iw + 1) ok(`${name}/${scr}: fits the width`); else fail(`${name}/${scr}: overflows ${o.sw} > ${o.iw}`);
      if (scr === 'home' && !(o.nav.width < 140 && o.nav.height >= h - 4)) fail(name + ': nav is not a side rail ' + JSON.stringify(o.nav));
      if (SHOTS && name === 'tablet') await p.screenshot({ path: SHOTS + name + '_' + scr + '.png' });
    }
    // battle
    await p.click('.nav >> text=Battle'); await p.click('button.primary.big'); await p.waitForSelector('.sheet .lead-btn, .ab', { timeout: 8000 });
    if (await p.locator('.sheet button.primary:has-text("Start")').count()) await p.click('.sheet button.primary:has-text("Start")');
    await p.waitForSelector('.ab'); await p.waitForTimeout(1200);
    const geo = await p.evaluate(async () => {
      const hud = document.querySelector('#hud'); const cs = getComputedStyle(hud);
      const fx = parseFloat(cs.getPropertyValue('--field-x')), fw = parseFloat(cs.getPropertyValue('--field-w'));
      const r = (s) => document.querySelector(s).getBoundingClientRect().toJSON();
      return { fx, fw, ab: r('.abil'), top: r('.hud-top'), cut: r('.cutmeter'), iw: innerWidth, ih: innerHeight };
    });
    if (geo.fx > 100 && Math.abs(geo.fx * 2 + geo.fw - geo.iw) < 2) ok(`${name}: battlefield is a centred ${Math.round(geo.fw)}px column`); else fail(name + ' field ' + JSON.stringify(geo));
    if (geo.ab.left >= geo.fx + geo.fw - 2 && geo.ab.right <= geo.iw + 1 && geo.ab.bottom <= geo.ih + 1) ok(name + ': ability buttons sit in the right panel'); else fail(name + ' abilities ' + JSON.stringify(geo.ab));
    if (geo.top.right <= geo.fx + 2 && geo.top.left >= 0) ok(name + ': pause / wave / wall HUD sits in the left panel'); else fail(name + ' hud-top ' + JSON.stringify(geo.top));
    // input: a swipe across an enemy bullet must cut it (screen position -> world position through the column offset and scale)
    const target = await p.evaluate(async () => {
      const { currentSession } = await import('/js/ui/combat.js'); const s = currentSession(); const g = s.game, L = s.layout;
      const r = document.getElementById('game').getBoundingClientRect();
      g.spawnQ.length = 0; g.cut.energy = g.cut.max;
      const b = g.spawnEnemyBullet(250, 200, 0, 0, 1, 6, 1, 'spit'); // hangs in the air
      return { x: r.left + L.ox + 250 * L.k, y: r.top + 200 * L.k, n: g.ebullets.items.length, cuts: g.stats.cuts };
    });
    await p.mouse.move(target.x - 40, target.y); await p.mouse.down(); await p.mouse.move(target.x, target.y, { steps: 6 }); await p.mouse.move(target.x + 40, target.y, { steps: 6 }); await p.mouse.up();
    const cuts = await p.evaluate(async () => (await import('/js/ui/combat.js')).currentSession().game.stats.cuts);
    if (cuts > target.cuts) ok(name + ': swiping the screen cuts the bullet under the finger'); else fail(name + ': swipe missed the bullet');
    if (SHOTS) await p.screenshot({ path: SHOTS + name + '_combat.png' });
    await ctx.close();
  }
  // rotate a live phone: portrait menu -> landscape menu -> portrait again
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const p = await ctx.newPage(); p.on('pageerror', (e) => fail('rotate pageerror ' + e.message));
  await p.goto('http://localhost:8099/');
  await p.evaluate(async () => { const { defaultProfile } = await import('/js/save.js'); const { store } = await import('/js/store.js'); const pr = defaultProfile(); pr.flags.tutorial = true; store.replace(pr); });
  await p.reload(); await p.waitForSelector('text=Tap to play'); await p.click('text=Tap to play'); await p.waitForSelector('.nav');
  const land0 = await p.evaluate(() => document.body.classList.contains('landscape'));
  await p.setViewportSize({ width: 844, height: 390 }); await p.waitForTimeout(500);
  const land1 = await p.evaluate(() => ({ l: document.body.classList.contains('landscape'), rail: document.querySelector('.nav').getBoundingClientRect().width }));
  await p.setViewportSize({ width: 390, height: 844 }); await p.waitForTimeout(500);
  const land2 = await p.evaluate(() => ({ l: document.body.classList.contains('landscape'), nav: document.querySelector('.nav').getBoundingClientRect().height }));
  if (!land0 && land1.l && land1.rail < 140 && !land2.l && land2.nav < 140) ok('rotating a phone switches the menu between bottom bar and side rail'); else fail('rotation ' + JSON.stringify({ land0, land1, land2 }));
  await b.close(); srv.kill();
  console.log(fails ? 'LANDSCAPE: ' + fails + ' FAILED' : 'LANDSCAPE: ALL CHECKS PASSED'); process.exit(fails ? 1 : 0);
})();

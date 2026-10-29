// Browser test of the battle rules and settings:
//  - a new game starts a battle with ONE hero and 2x speed is locked until the stage is cleared
//  - once cleared, 2x works; extra heroes arrive via random summon cards (never two reward rounds in a row without one)
//  - Settings is reachable from every main screen; "Reset all progress" really starts over
//   node tools/e2e/summon-reset.cjs
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

(async () => {
  const srv = spawn('node', [path.join(__dirname, '../serve.mjs'), '8093'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 600));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const bad = [];
  const ok = (m) => console.log('ok  -', m);
  const fail = (m) => { bad.push(m); console.error('FAIL:', m); process.exitCode = 1; };
  p.on('pageerror', (e) => fail('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') fail('console error: ' + m.text()); });
  const save = () => p.evaluate(() => JSON.parse(JSON.parse(localStorage.getItem('bullet-heroes.save')).d));
  const startFromSplash = async () => { await p.waitForSelector('text=Tap to play'); await p.click('text=Tap to play'); };

  // ---- 1. brand-new game: one hero, 2x locked
  await p.goto('http://localhost:8093/');
  // (a brand-new profile starts with the tutorial; tools/e2e/tutorial.cjs covers it - here we mark it seen)
  await p.evaluate(async () => { const { store } = await import('/js/store.js'); store.update((pr) => { pr.flags.tutorial = true; }); store.save(true); });
  await p.reload();
  await startFromSplash();
  await p.waitForSelector('.nav');
  await p.click('button:has-text("Battle")');
  await p.waitForSelector('.ab');
  const total = await p.locator('.ab').count();
  const locked = await p.locator('.ab.locked').count();
  if (total === 3 && locked === 2) ok(`new battle starts with 1 hero deployed (${total - locked}/${total})`); else fail(`expected 3 slots / 2 locked, got ${total}/${locked}`);
  const speedLabel = await p.getAttribute('.hud-top .hud-btn:last-child', 'aria-label');
  if (/locked/i.test(speedLabel)) ok('2x speed is locked on an uncleared stage'); else fail('speed button not locked: ' + speedLabel);
  await p.click('.hud-top .hud-btn:last-child');
  if (await p.locator('.toast', { hasText: 'unlock 2' }).count()) ok('tapping it explains how to unlock'); else fail('no unlock explanation toast');

  // ---- 2. clear 1-1 (seeded), then 2x is available and summons are random-with-pity
  await p.click('[aria-label="Pause"]'); await p.click('button:has-text("Quit")'); await p.locator('.sheet button:has-text("Quit")').last().click();
  await p.waitForSelector('.res-title');
  await p.evaluate(async () => {
    const { store } = await import('/js/store.js');
    store.update((pr) => { pr.stages['1-1'] = { stars: 3, hard: false, hardStars: 0 }; pr.flags.heroMenu = true; });
  });
  await p.click('text=Home'); await p.click('button:has-text("Battle")');
  await p.waitForSelector('.ab');
  const label2 = await p.getAttribute('.hud-top .hud-btn:last-child', 'aria-label');
  // Battle now launches 1-2, which is NOT cleared yet: the unlock is per stage, so 2x must still be locked here.
  if (/locked/i.test(label2)) ok('2x is per stage: clearing 1-1 does not unlock it on 1-2'); else fail('2x unlocked on an uncleared stage: ' + label2);
  // Now mark 1-2 cleared as well
  await p.evaluate(async () => { const { store } = await import('/js/store.js'); store.update((pr) => { pr.stages['1-2'] = { stars: 3, hard: false, hardStars: 0 }; }); });
  await p.click('[aria-label="Pause"]'); await p.click('button:has-text("Quit")'); await p.locator('.sheet button:has-text("Quit")').last().click();
  await p.waitForSelector('.res-title'); await p.click('text=Home');
  await p.evaluate(async () => { const { store } = await import('/js/store.js'); store.update((pr) => { pr.flags.lastStage = '1-2'; }); });
  await p.reload(); await startFromSplash(); await p.waitForSelector('.nav');
  await p.click('button:has-text("Battle")'); await p.waitForSelector('.ab');
  await p.click('.hud-top .hud-btn:last-child');
  const sp = (await p.textContent('.hud-top .hud-btn:last-child')).trim();
  if (sp === '2×') ok('2x speed toggles on a cleared stage'); else fail('speed button shows ' + sp);

  let misses = 0, joined = 0, rounds = 0;
  while (joined < 2 && rounds < 6) {
    await p.waitForSelector('.overlay.on .upg', { timeout: 150000 });
    rounds++;
    const first = p.locator('.overlay.on .upg').first();
    const isSummon = /^Summon /.test((await first.getAttribute('aria-label')) || '');
    if (isSummon) { joined++; misses = 0; } else { misses++; }
    if (misses > 1) fail('two reward rounds in a row without a hero card');
    await first.click();
    await p.waitForTimeout(400);
  }
  const nowLocked = await p.locator('.ab.locked').count();
  if (joined === 2 && nowLocked === 0) ok(`both reserve heroes arrived through summon cards within ${rounds} reward rounds`); else fail(`joined=${joined} locked=${nowLocked} rounds=${rounds}`);

  // ---- 3. settings gear on every main screen
  await p.click('[aria-label="Pause"]'); await p.click('button:has-text("Quit")'); await p.locator('.sheet button:has-text("Quit")').last().click();
  await p.waitForSelector('.res-title'); await p.click('text=Home');
  for (const [tab, name] of [['Battle', 'Battle'], ['Heroes', 'Heroes'], ['Research', 'Research'], ['Missions', 'Missions'], ['Wardrobe', 'Wardrobe']]) {
    await p.click(`.nav >> text=${tab}`);
    await p.waitForTimeout(250);
    if (await p.locator('[aria-label="Settings"]').count()) ok(`Settings button on ${name}`); else fail(`no Settings button on ${name}`);
  }
  await p.click('.nav >> text=Battle');
  await p.click('button:has-text("Stages")');
  if (await p.locator('[aria-label="Settings"]').count()) ok('Settings button on Stages'); else fail('no Settings on Stages');
  await p.click('[aria-label="Back"]');

  // ---- 4. reset all progress
  await p.click('[aria-label="Settings"]');
  await p.locator('[aria-label="Reset all progress"]').scrollIntoViewIfNeeded();
  await p.click('[aria-label="Reset all progress"]');
  await p.click('text=Yes, continue');
  await p.click('text=Erase everything');
  await p.waitForSelector('text=Tap to play', { timeout: 15000 });
  const after = await save();
  if (Object.keys(after.stages).length === 0 && after.coins === 0 && after.stats.runs === 0 && after.checkpoint === null) ok('reset wiped stages, coins and stats');
  else fail('reset left progress behind: ' + JSON.stringify({ stages: after.stages, coins: after.coins }));
  await p.click('text=Tap to play');
  await p.waitForSelector('.coach.on .coach-card');
  ok('after a reset the first-run tutorial comes back');
  await p.click('text=Skip tutorial');
  await p.waitForSelector('.nav');
  await p.click('button:has-text("Battle")');
  await p.waitForSelector('.ab');
  if ((await p.locator('.ab.locked').count()) === 2) ok('after reset a brand-new game starts with one hero again'); else fail('new game after reset not fresh');

  await browser.close();
  srv.kill();
  console.log(bad.length ? `\n${bad.length} CHECK(S) FAILED` : '\nBATTLE RULES + SETTINGS + RESET: ALL CHECKS PASSED');
})().catch((e) => { console.error(e); process.exit(1); });

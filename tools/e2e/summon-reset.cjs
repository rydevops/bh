// Browser test: (1) a new game starts a battle with ONE hero, the others arrive via summon reward cards;
// (2) Settings is reachable from every main screen; (3) "Reset all progress" really starts over.
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

  await p.goto('http://localhost:8093/');
  await p.waitForSelector('text=Tap to play');
  await p.click('text=Tap to play');
  await p.waitForSelector('.ab');

  // ---- 1. one hero at the start
  const total = await p.locator('.ab').count();
  const locked = await p.locator('.ab.locked').count();
  if (total === 3 && locked === 2) ok(`new battle starts with 1 hero deployed (${total - locked}/${total}); the other ${locked} are locked`); else fail(`expected 3 slots / 2 locked, got ${total}/${locked}`);

  // ---- summon via reward cards
  await p.click('[aria-label="Combat speed"]');
  const joined = [];
  for (let i = 0; i < 2; i++) {
    await p.waitForSelector('.overlay.on .upg', { timeout: 120000 });
    const cards = await p.locator('.overlay.on .upg').count();
    const first = await p.locator('.overlay.on .upg').first();
    const label = await first.getAttribute('aria-label');
    if (!/^Summon /.test(label || '')) fail('first card is not a summon card: ' + label); else joined.push(label);
    if (cards !== 3) fail('expected 3 cards, got ' + cards);
    await first.click();
    await p.waitForSelector('.overlay.on', { state: 'detached', timeout: 5000 }).catch(() => {});
    await p.waitForTimeout(300);
    const nowLocked = await p.locator('.ab.locked').count();
    if (nowLocked !== 1 - i) fail(`after summon #${i + 1} expected ${1 - i} locked slots, got ${nowLocked}`);
  }
  ok('summoned via reward cards: ' + joined.join(', '));
  await p.waitForSelector('.res-title', { timeout: 150000 });
  ok('stage cleared with the assembled squad');
  const afterWin = await save();
  if (afterWin.stages['1-1'] && afterWin.coins > 0) ok(`progress saved (coins ${afterWin.coins})`); else fail('win not saved');

  // ---- 2. settings gear on every main screen
  await p.click('text=Home');
  for (const [tab, name] of [['Home', 'Battle'], ['Heroes', 'Heroes'], ['Research', 'Research'], ['Missions', 'Missions'], ['Wardrobe', 'Wardrobe']]) {
    await p.click(`.nav >> text=${tab === 'Home' ? 'Battle' : tab}`);
    await p.waitForTimeout(250);
    const n = await p.locator('[aria-label="Settings"]').count();
    if (n >= 1) ok(`Settings button on ${name}`); else fail(`no Settings button on ${name}`);
  }
  await p.click('.nav >> text=Battle');
  await p.click('text=Stages');
  if (await p.locator('[aria-label="Settings"]').count()) ok('Settings button on Stages'); else fail('no Settings on Stages');
  await p.click('[aria-label="Back"]');

  // ---- 3. reset all progress
  await p.evaluate(() => { document.querySelector('.scroll').scrollTop = 0; });
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
  await p.waitForSelector('.ab');
  const lockedAfter = await p.locator('.ab.locked').count();
  if (lockedAfter === 2) ok('after reset a brand-new game starts with one hero again'); else fail('new game after reset not fresh: locked=' + lockedAfter);

  await browser.close();
  srv.kill();
  console.log(bad.length ? `\n${bad.length} CHECK(S) FAILED` : '\nSUMMON + SETTINGS + RESET: ALL CHECKS PASSED');
})().catch((e) => { console.error(e); process.exit(1); });

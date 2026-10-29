// First-run tutorial: shows on a brand-new profile, can be skipped from any card, finishes at the main menu,
// never shows again, and shows again after "Reset all progress". SHOTS=/dir saves screenshots.
const { chromium } = require('playwright'); const { spawn } = require('child_process');
const SHOTS = process.env.SHOTS ? process.env.SHOTS + '/tut_' : null;
(async () => {
  const srv = spawn('node', [require('path').join(__dirname, '../serve.mjs'), '8097'], { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 600));
  const b = await chromium.launch();
  let fails = 0;
  const ok = (m) => console.log('ok  - ' + m);
  const fail = (m) => { fails++; console.log('FAIL: ' + m); };
  const fresh = async (vp = { width: 402, height: 874 }) => {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
    const p = await ctx.newPage();
    p.on('pageerror', e => fail('pageerror: ' + e.message));
    await p.goto('http://localhost:8097/'); await p.waitForSelector('text=Tap to play');
    return p;
  };
  const home = (p) => p.waitForSelector('.nav', { timeout: 8000 }).then(() => true, () => false);

  // 1) brand new profile -> tutorial, with a skip button, and skipping goes to the main menu
  let p = await fresh();
  await p.click('text=Tap to play');
  await p.waitForSelector('.coach.on .coach-card', { timeout: 8000 });
  const first = await p.textContent('.coach-card');
  if (/Welcome/.test(first) && /Skip tutorial/.test(first)) ok('a new profile opens with the tutorial and a Skip button'); else fail('first card: ' + first);
  if (SHOTS) await p.screenshot({ path: SHOTS + '1_welcome.png' });
  const flagBefore = await p.evaluate(async () => (await import('/js/store.js')).store.profile.flags.tutorial);
  await p.click('text=Skip tutorial');
  if (await home(p)) ok('Skip tutorial goes to the main menu'); else fail('skip did not reach the menu');
  const st = await p.evaluate(async () => { const { store } = await import('/js/store.js'); const pr = store.profile; return { flag: pr.flags.tutorial, stages: Object.keys(pr.stages).length, runs: pr.stats.runs, coins: pr.coins }; });
  if (!flagBefore && st.flag && st.stages === 0 && st.runs === 0) ok('skipping marks the tutorial as seen and gives no progress or rewards'); else fail('state after skip ' + JSON.stringify(st));
  await p.reload(); await p.waitForSelector('text=Tap to play'); await p.click('text=Tap to play');
  if (await home(p)) ok('the tutorial does not show again'); else fail('tutorial showed again');
  await p.context().close();

  // 2) play it through: every modal card, the two practice steps, the reward cards, then the tour
  p = await fresh();
  await p.click('text=Tap to play');
  await p.waitForSelector('.coach.on .coach-card', { timeout: 8000 });
  const seen = new Set();
  let shots = 0, reachedHome = false, pickedCard = false;
  for (let i = 0; i < 400 && !reachedHome; i++) {
    const t = await p.evaluate(() => { const c = document.querySelector('.coach.on .coach-card'); return c ? c.querySelector('h3').textContent : null; });
    if (t && !seen.has(t)) { seen.add(t); if (SHOTS && shots < 14) await p.screenshot({ path: SHOTS + '2_' + String(++shots).padStart(2, '0') + '.png' }); }
    if (t === 'Pick a reward') {
      await p.click('.coach-card >> text=Got it');
      await p.waitForSelector('.upg'); await p.click('.upg >> nth=1'); pickedCard = true; continue;
    }
    if (t === 'Try it: cut a bullet' || t === 'Try it: use an ability') { await p.waitForTimeout(400); const skip = p.locator('.coach-card >> text=Skip step'); if (await skip.count()) await skip.click(); continue; }
    const btn = p.locator('.coach-card button.primary');
    if (t && await btn.count()) { await btn.click(); await p.waitForTimeout(80); continue; }
    reachedHome = await p.locator('.nav').count() > 0;
    await p.waitForTimeout(250);
  }
  const need = ['Welcome, Commander!', 'Waves', 'Pause and speed', 'Your hero fires by themselves', 'The revolver is your ammo', 'Try it: cut a bullet', 'Try it: use an ability', 'Pick a reward', 'Winning stages', 'Your heroes', 'Research', 'Missions and rewards', 'Wardrobe and settings', 'You’re ready!'];
  const missing = need.filter((n) => !seen.has(n));
  if (!missing.length) ok('every feature card was shown (' + seen.size + ')'); else fail('missing cards: ' + missing.join(' | '));
  if (pickedCard && reachedHome) ok('finishing the tour lands on the main menu'); else fail('did not finish (picked=' + pickedCard + ', home=' + reachedHome + ')');
  const st2 = await p.evaluate(async () => { const { store } = await import('/js/store.js'); const pr = store.profile; return { flag: pr.flags.tutorial, stages: Object.keys(pr.stages).length, runs: pr.stats.runs }; });
  if (st2.flag && st2.stages === 0 && st2.runs === 0) ok('the tutorial round gives no rewards and clears no stage'); else fail('state ' + JSON.stringify(st2));
  // 3) reset all progress brings it back
  await p.evaluate(async () => { const { store } = await import('/js/store.js'); store.reset(); });
  await p.reload(); await p.waitForSelector('text=Tap to play'); await p.click('text=Tap to play');
  const again = await p.waitForSelector('.coach.on .coach-card', { timeout: 8000 }).then(() => true, () => false);
  if (again) ok('after a reset the tutorial shows again'); else fail('no tutorial after reset');
  await b.close(); srv.kill();
  console.log(fails ? 'TUTORIAL: ' + fails + ' FAILED' : 'TUTORIAL: ALL CHECKS PASSED');
  process.exit(fails ? 1 : 0);
})();

// Seeds a mid-game profile and walks every screen. Fails on console errors or stray markup/"undefined" text.
//   node tools/e2e/screens.cjs            (SHOTS=/some/dir to also save screenshots)
const { chromium } = require('playwright'); const { spawn } = require('child_process');
const OUT = process.env.SHOTS ? process.env.SHOTS + '/s_' : null;
(async () => {
  const srv = spawn('node', [require('path').join(__dirname, '../serve.mjs'), '8094'], { stdio: 'ignore' }); await new Promise(r => setTimeout(r, 600));
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const errs = [];
  p.on('console', m => { if (['error', 'warning'].includes(m.type())) { errs.push(m.text()); console.log('[' + m.type() + ']', m.text()); } });
  p.on('pageerror', e => { errs.push(e.message); console.log('[pageerror]', e.message, (e.stack || '').split('\n')[1]); });
  await p.goto('http://localhost:8094/');
  await p.evaluate(async () => {
    const { defaultProfile } = await import('/js/save.js'); const { store } = await import('/js/store.js');
    const pr = defaultProfile();
    pr.coins = 5400; pr.gems = 210; pr.tokens = 6; pr.flags.heroMenu = true; pr.flags.tutorial = true;
    for (const id of ['1-1','1-2','1-3','1-4','2-1','2-2','2-3','2-4']) pr.stages[id] = { stars: 3, hard: false, hardStars: 0 };
    pr.heroes.vanguard.lv = 9; pr.heroes.rook.lv = 8; pr.heroes.patch.lv = 7;
    pr.heroes.pulse = { lv: 5, rank: 2, skin: 'default' }; pr.heroes.specter = { lv: 4, rank: 1, skin: 'default' }; pr.heroes.ember = { lv: 3, rank: 1, skin: 'default' };
    pr.frags = { pulse: 12, specter: 7, ember: 3, rook: 4 };
    pr.squad = ['vanguard', 'rook', 'pulse', 'ember'];
    pr.survivalBest = 7; pr.flags.seen = { tipAuto: true, tipAbility: true, tipCut: true, tipExposed: true };
    store.replace(pr);
  });
  await p.reload();
  await p.waitForSelector('text=Tap to play'); await p.click('text=Tap to play');
  await p.waitForSelector('.nav', { timeout: 10000 });
  const leaks = [];
  const shot = async (n) => {
    await p.waitForTimeout(500);
    if (OUT) await p.screenshot({ path: OUT + n + '.png' });
    const txt = await p.evaluate(() => document.body.innerText);
    const bad = txt.match(/viewBox|<svg|\[object|undefined|NaN|\bnull\b/);
    if (bad) leaks.push(n + ': "' + bad[0] + '"');
  };
  await shot('home');
  await p.click('.nav >> text=Heroes'); await shot('heroes');
  await p.click('.card >> nth=3'); await shot('hero_detail');
  await p.click('[aria-label="Back"]');
  await p.click('.nav >> text=Research'); await shot('research');
  await p.click('.nav >> text=Missions'); await shot('missions');
  await p.click('.nav >> text=Wardrobe'); await shot('wardrobe');
  await p.click('.nav >> text=Battle');
  await p.click('text=Stages'); await shot('stages');
  await p.click('.node >> nth=0'); await shot('stage_sheet');
  await p.click('.sheet button:has-text("Squad")'); await shot('squad');
  await p.click('.sheet >> text=Confirm squad');
  await p.click('.sheet-bg', { position: { x: 10, y: 10 } });
  await p.click('[aria-label="Back"]');
  await p.click('[aria-label="Settings"]'); await shot('settings');
  await p.click('.sheet [aria-label="Close"]');
  // survival run, pause menu, then ability use and cutting
  await p.click('text=Survive'); await p.waitForSelector('.ab');
  await p.waitForTimeout(2500);
  await p.keyboard.press('1'); await p.keyboard.press('2');
  await p.waitForTimeout(5000);
  // swipe through the field to exercise blade
  await p.mouse.move(40, 300); await p.mouse.down(); for (let i = 0; i < 12; i++) await p.mouse.move(40 + i * 28, 300 + i * 12); await p.mouse.up();
  await shot('combat_survival');
  await p.click('[aria-label="Pause"]'); await shot('pause');
  await p.click('.sheet >> text=Resume');
  await p.waitForTimeout(500);
  console.log('screen text leaks:', leaks.length ? leaks.join('; ') : 'none');
  console.log('errors:', errs.length);
  if (errs.length || leaks.length) process.exitCode = 1;
  await b.close(); srv.kill();
})().catch(e => { console.error('SCRIPT FAIL', e.message); process.exit(1); });

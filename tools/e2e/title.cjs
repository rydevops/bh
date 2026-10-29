// Browser test: the title screen is laid out lower and animates, and menu screens have no fade/gradient at the top.
//   node tools/e2e/title.cjs
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

(async () => {
  const srv = spawn('node', [path.join(__dirname, '../serve.mjs'), '8088'], { stdio: 'ignore' });
  await new Promise((r) => setTimeout(r, 600));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  const ok = (m) => console.log('ok  -', m);
  const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
  p.on('pageerror', (e) => fail('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') fail('console error: ' + m.text()); });

  await p.goto('http://localhost:8088/');
  await p.waitForSelector('text=Tap to play');
  // ---- title position: no longer jammed at the top
  const box = await p.locator('.splash .logo').boundingBox();
  const centre = (box.y + box.height / 2) / 844;
  if (centre > 0.18 && centre < 0.4) ok(`title is lower on the screen (centre at ${(centre * 100).toFixed(0)}% of the height)`); else fail(`title centre at ${(centre * 100).toFixed(0)}%`);
  const btn = await p.locator('text=Tap to play').boundingBox();
  if (btn.y > box.y + box.height) ok('button sits below the title'); else fail('button overlaps the title');

  // ---- scenery is really animated
  const snap = () => p.evaluate(() => document.querySelector('canvas.scene').toDataURL());
  const a = await snap(); await p.waitForTimeout(700); const b = await snap(); await p.waitForTimeout(700); const c = await snap();
  if (a !== b && b !== c && a.length > 5000) ok('scene canvas changes from frame to frame (animating)'); else fail('scene is static');

  // ---- no top fade on menu screens
  await p.evaluate(async () => {
    const { store } = await import('/js/store.js');
    store.update((pr) => { pr.stages['1-1'] = { stars: 3, hard: false, hardStars: 0 }; pr.flags.tutorial = true; pr.flags.heroMenu = true; });
  });
  await p.reload(); await p.waitForSelector('text=Tap to play'); await p.click('text=Tap to play'); await p.waitForSelector('.nav');
  const topGradients = () => p.evaluate(() => {
    const bad = [];
    for (const y of [2, 20, 40]) for (const x of [10, 195, 380]) {
      for (const el of document.elementsFromPoint(x, y)) {
        const bg = getComputedStyle(el).backgroundImage;
        if (bg && bg !== 'none' && !(el.tagName === 'CANVAS')) bad.push(`${el.tagName}.${el.className} @${x},${y}: ${bg.slice(0, 60)}`);
      }
    }
    return bad;
  });
  for (const [tab, name] of [['Battle', 'Home'], ['Heroes', 'Heroes'], ['Research', 'Research'], ['Missions', 'Missions'], ['Wardrobe', 'Wardrobe']]) {
    await p.click(`.nav >> text=${tab}`); await p.waitForTimeout(300);
    const bad = await topGradients();
    if (bad.length === 0) ok(`${name}: nothing gradient/faded covers the top of the screen`); else fail(`${name}: ${bad.join(' | ')}`);
  }
  const flat = await p.evaluate(() => [document.documentElement, document.body, document.getElementById('app')].map((e) => getComputedStyle(e).backgroundColor));
  if (new Set(flat).size === 1) ok('page, body and app share one flat background colour: ' + flat[0]); else fail('backgrounds differ: ' + flat);

  await browser.close(); srv.kill();
  console.log(process.exitCode ? '\nTITLE / TOP-FADE: FAILED' : '\nTITLE + FLAT TOP: ALL CHECKS PASSED');
})().catch((e) => { console.error(e); process.exit(1); });

// Browser test of the PWA auto-update requirement (needs Playwright + Chromium):
//   node tools/e2e/update.cjs
// 1. Publish build A to a temp "server", open the app (service worker installs, A is cached).
// 2. Publish build B (a changed file) while the app is closed.
// 3. Re-open the app: it must detect B on launch, install it and reload into it - without any user action.
// 4. Go offline and re-open: it must still start from the cache.
const { chromium } = require('playwright');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

(async () => {
  const { ROOT, shippedFiles, stamp } = await import('../stamp.mjs');
  const { serve } = await import('../serve.mjs');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bh-update-'));
  // Copy the project into the temp dir and stamp there (stamp.mjs resolves ROOT from its own location, so copy tools too).
  for (const f of [...shippedFiles(), 'tools/stamp.mjs', 'package.json']) {
    fs.mkdirSync(path.dirname(path.join(tmp, f)), { recursive: true });
    fs.copyFileSync(path.join(ROOT, f), path.join(tmp, f));
  }
  const tmpStamp = await import(path.join(tmp, 'tools/stamp.mjs'));
  const A = tmpStamp.stamp('build-A');
  const server = await serve(8777, tmp);
  const fail = (m) => { console.error('FAIL:', m); process.exitCode = 1; };
  const ok = (m) => console.log('ok  -', m);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => fail('pageerror ' + e.message));
  const url = 'http://localhost:8777/';
  const build = () => page.evaluate(async () => (await import('/js/version.js?x=' + Date.now())).BUILD).catch(() => null);
  const runningBuild = () => page.evaluate(() => document.querySelector('.splash .muted:last-child')?.textContent || '');

  await page.goto(url);
  await page.waitForSelector('text=Tap to play', { timeout: 15000 });
  ok('first launch reaches "Tap to play" on ' + A);
  await page.waitForFunction(async () => { const r = await navigator.serviceWorker.getRegistration(); return !!(r && r.active); }, null, { timeout: 15000 });
  const keysA = await page.evaluate(() => caches.keys());
  if (!keysA.includes('bullet-heroes-build-A')) fail('cache for build-A missing: ' + keysA); else ok('build-A pre-cached: ' + keysA);
  await page.close();

  // ---- publish build B while the app is closed (change a shipped file, re-stamp)
  fs.appendFileSync(path.join(tmp, 'css/style.css'), '\n/* release B */\n');
  const B = tmpStamp.stamp('build-B');
  ok('published ' + B);

  // ---- re-open: the update must be applied automatically
  const page2 = await ctx.newPage();
  page2.on('pageerror', (e) => fail('pageerror ' + e.message));
  const navs = [];
  page2.on('framenavigated', (f) => { if (f === page2.mainFrame()) navs.push(f.url()); });
  await page2.goto(url);
  await page2.waitForFunction(() => document.body.textContent.includes('build-B'), null, { timeout: 30000 }).catch(() => fail('page never reported build-B'));
  const shown = await page2.textContent('.splash');
  if (/build-B/.test(shown)) ok('app restarted into build-B automatically'); else fail('still on old build: ' + shown);
  const keysB = await page2.evaluate(() => caches.keys());
  if (keysB.includes('bullet-heroes-build-B') && !keysB.includes('bullet-heroes-build-A')) ok('old cache removed, new cache present: ' + keysB); else fail('caches after update: ' + keysB);
  const css = await page2.evaluate(() => fetch('css/style.css').then((r) => r.text()));
  if (css.includes('release B')) ok('new CSS served from the updated cache'); else fail('stale CSS served');
  await page2.waitForSelector('text=Tap to play');

  // ---- same build again: no reload loop
  const before = navs.length;
  await page2.reload();
  await page2.waitForSelector('text=Tap to play');
  await page2.waitForTimeout(1500);
  ok(`relaunch on current build stays put (${navs.length - before} navigation)`);

  // ---- offline launch
  await ctx.setOffline(true);
  const page3 = await ctx.newPage();
  await page3.goto(url);
  await page3.waitForSelector('text=Tap to play', { timeout: 15000 }).then(() => ok('launches offline from the cache')).catch(() => fail('offline launch failed'));
  const status = await page3.textContent('.splash .status');
  if (/Offline/i.test(status)) ok('offline status shown: "' + status + '"'); else fail('offline status missing: ' + status);
  await ctx.setOffline(false);

  await browser.close();
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
  if (!process.exitCode) console.log('\nAUTO-UPDATE: ALL CHECKS PASSED');
})().catch((e) => { console.error(e); process.exit(1); });

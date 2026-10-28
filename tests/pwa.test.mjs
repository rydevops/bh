import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, shippedFiles, computeBuildId, readStamp } from '../tools/stamp.mjs';

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

test('build stamp is current and consistent across sw.js, version.js and version.json', () => {
  const s = readStamp();
  const want = computeBuildId();
  assert.equal(s.sw, want, 'sw.js BUILD is stale - run `npm run stamp`');
  assert.equal(s.js, want);
  assert.equal(s.json, want);
});

test('service worker pre-caches every shipped file (except itself and the version probe)', () => {
  const { precache } = readStamp();
  const files = shippedFiles().filter((f) => f !== 'sw.js' && f !== 'version.json').map((f) => './' + f);
  assert.deepEqual(precache, files);
  for (const f of precache) assert.ok(fs.existsSync(path.join(ROOT, f)), f + ' exists');
  assert.ok(precache.includes('./index.html') && precache.includes('./js/main.js'));
});

test('service worker never caches the update probe and takes over immediately', () => {
  const sw = read('sw.js');
  assert.match(sw, /version\.json/);
  assert.match(sw, /no-store/);
  assert.match(sw, /skipWaiting/);
  assert.match(sw, /clients\.claim/);
  assert.match(sw, /cache: 'reload'/);
});

test('manifest is installable: standalone, relative scope (GitHub Pages sub-path), real icons', () => {
  const m = JSON.parse(read('manifest.webmanifest'));
  assert.equal(m.display, 'standalone');
  assert.ok(m.start_url.startsWith('.') && m.scope.startsWith('.'), 'relative so it works under /repo-name/');
  const sizes = m.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  for (const i of m.icons) assert.ok(fs.existsSync(path.join(ROOT, i.src)), i.src);
});

test('index.html uses only relative URLs and links manifest/icons', () => {
  const html = read('index.html');
  assert.doesNotMatch(html, /(src|href)="\//, 'no root-absolute URLs');
  for (const m of html.matchAll(/(?:src|href)="([^":]+)"/g)) assert.ok(fs.existsSync(path.join(ROOT, m[1])), m[1]);
  assert.match(html, /viewport-fit=cover/);
});

test('every ES module import in the app resolves to a shipped file', () => {
  const shipped = new Set(shippedFiles());
  for (const f of shipped) {
    if (!f.startsWith('js/')) continue;
    for (const m of read(f).matchAll(/from '(\.[^']+)'|import '(\.[^']+)'/g)) {
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(f), m[1] || m[2]));
      assert.ok(shipped.has(target), `${f} imports missing ${target}`);
    }
  }
});

test('the game ships no ads, trackers or payment SDKs', () => {
  const banned = /(admob|adsense|doubleclick|google-analytics|googletagmanager|facebook\.net|stripe\.(com|js)|paypal\.com|storekit|applovin|unityads|segment\.io|mixpanel|sentry\.io)/i;
  for (const f of shippedFiles()) {
    if (/\.(png|ico)$/.test(f)) continue;
    assert.doesNotMatch(read(f), banned, f);
  }
});

test('no external network origins are referenced by shipped code (fully offline-capable)', () => {
  for (const f of shippedFiles()) {
    if (/\.(png|ico)$/.test(f)) continue;
    const bad = [...read(f).matchAll(/https?:\/\/[^\s'")]+/g)].map((m) => m[0]).filter((u) => !/w3\.org/.test(u));
    assert.deepEqual(bad, [], f);
  }
});

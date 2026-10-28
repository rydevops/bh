// Renders the app icons with headless Chromium using the game's own procedural sprites.
//   node tools/gen-icons.mjs
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { serve } from './serve.mjs';
import { ROOT } from './stamp.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const server = await serve(8765, ROOT);
const browser = await chromium.launch();
const jobs = [
  ['icon-192.png', 192, 0], ['icon-512.png', 512, 0], ['icon-maskable-512.png', 512, 1],
  ['apple-touch-icon.png', 180, 1], ['favicon-32.png', 32, 0],
];
fs.mkdirSync(path.join(ROOT, 'icons'), { recursive: true });
for (const [name, size, maskable] of jobs) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.goto(`http://localhost:8765/tools/dev/icon.html?size=${size}&maskable=${maskable}`);
  await page.waitForFunction('window.done === true');
  const data = await page.evaluate(() => document.getElementById('c').toDataURL('image/png'));
  fs.writeFileSync(path.join(ROOT, 'icons', name), Buffer.from(data.split(',')[1], 'base64'));
  console.log('wrote icons/' + name);
  await page.close();
}
await browser.close();
server.close();

// Exports a hero's procedural sprite as the first-version sprite sheet (art/<hero>.png + art/<hero>.json).
// An artist's finished sheet replaces the PNG; keep the same frame layout (or update the JSON next to it).
//   node tools/art/export-sheet.mjs vanguard
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { serve } from '../serve.mjs';
import { ROOT } from '../stamp.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const hero = process.argv[2] || 'vanguard';
const server = await serve(8766, ROOT);
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`http://localhost:8766/tools/dev/export-art.html?hero=${hero}`);
await page.waitForFunction('window.done === true');
const { png, atlas } = await page.evaluate(() => window.result);
fs.mkdirSync(path.join(ROOT, 'art'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'art', `${hero}.png`), Buffer.from(png.split(',')[1], 'base64'));
fs.writeFileSync(path.join(ROOT, 'art', `${hero}.json`), JSON.stringify(atlas, null, 2) + '\n');
console.log(`wrote art/${hero}.png and art/${hero}.json`);
await browser.close();
server.close();

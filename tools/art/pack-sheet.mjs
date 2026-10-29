// Packs an artist's raw hero sheet (art_src/<hero>_raw.webp|png) into the layout the game reads:
// art/<hero>.png (transparent PNG) + art/<hero>.json (atlas).
//
// The artist's own coordinates are not trusted. The raw sheet is read as: three poses side by side in the top row
// (idle, fire, ability) and a bust icon underneath. Each pose is found from the transparency (gaps between them), then
// scaled by one common factor and placed in a fixed cell with the feet on a shared baseline and centred on the feet, so
// the hero does not jump when the frame changes. Any `animations` block from the artist's atlas is carried over.
//
//   node tools/art/pack-sheet.mjs vanguard
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../stamp.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const hero = process.argv[2] || 'vanguard';
const rawPath = ['webp', 'png'].map((e) => path.join(ROOT, 'art_src', `${hero}_raw.${e}`)).find((p) => fs.existsSync(p));
if (!rawPath) throw new Error(`art_src/${hero}_raw.webp|png not found`);
const artistAtlasPath = path.join(ROOT, 'art_src', `${hero}_artist_atlas.json`);
const artist = fs.existsSync(artistAtlasPath) ? JSON.parse(fs.readFileSync(artistAtlasPath, 'utf8')) : {};

const SCALE = 6, LW = 72, LH = 112;       // sheet scale and the hero's world box
const CELL_W = LW * SCALE, CELL_H = LH * SCALE, ICON = 256;
const FEET_Y = 100 * SCALE;                // feet sit 12 world px above the bottom of the box (as the original sprites did)
const POSE_SCALE = 0.75;                   // raw pixels -> sheet pixels for the three poses

const mime = rawPath.endsWith('.webp') ? 'image/webp' : 'image/png';
const dataUrl = `data:${mime};base64,${fs.readFileSync(rawPath).toString('base64')}`;
const browser = await chromium.launch();
const page = await browser.newPage();
const out = await page.evaluate(async ({ dataUrl, CELL_W, CELL_H, ICON, FEET_Y, POSE_SCALE }) => {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
  const W = img.width, H = img.height;
  const src = document.createElement('canvas'); src.width = W; src.height = H;
  const sx = src.getContext('2d', { willReadFrequently: true }); sx.drawImage(img, 0, 0);
  const A = sx.getImageData(0, 0, W, H).data;
  const solid = (x, y) => A[(y * W + x) * 4 + 3] > 8;
  const bands = (n, test) => { const out = []; let s = -1; for (let i = 0; i <= n; i++) { const on = i < n && test(i); if (on && s < 0) s = i; if (!on && s >= 0) { out.push([s, i]); s = -1; } } return out; };
  // rows: the pose row and the icon row are separated by an empty band
  const rowOn = (y) => { for (let x = 0; x < W; x++) if (solid(x, y)) return true; return false; };
  const rows = bands(H, rowOn).filter(([a, b]) => b - a > 20);
  if (rows.length < 2) throw new Error('expected a row of poses and an icon row, found ' + rows.length + ' rows');
  const [poseRow, iconRow] = rows;
  // poses: runs of columns that contain pixels; effects (flash, aura) are part of their pose
  const colOn = (x) => { for (let y = poseRow[0]; y < poseRow[1]; y++) if (solid(x, y)) return true; return false; };
  const cols = bands(W, colOn).filter(([a, b]) => b - a > 20);
  if (cols.length !== 3) throw new Error('expected 3 poses (idle, fire, ability), found ' + cols.length);
  const bboxOf = (x0, y0, x1, y1) => { let a = 1e9, b = 1e9, c = -1, d = -1; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (solid(x, y)) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; } return [a, b, c + 1, d + 1]; };
  // feet: the lowest 40 raw rows of the body, centred horizontally
  const feet = ([x0, y0, x1, y1]) => { const [a, , c] = bboxOf(x0, y1 - 40, x1, y1); return (a + c) / 2; };
  const sheet = document.createElement('canvas'); sheet.width = CELL_W * 3; sheet.height = CELL_H + ICON;
  const ctx = sheet.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  const names = ['idle', 'fire', 'ability'], report = {};
  cols.forEach(([cx0, cx1], i) => {
    const [x0, y0, x1, y1] = bboxOf(cx0, poseRow[0], cx1, poseRow[1]);
    const fx = feet([x0, y0, x1, y1]);
    const dx = i * CELL_W + CELL_W / 2 - (fx - x0) * POSE_SCALE;      // feet centre -> cell centre
    const dy = FEET_Y - (y1 - y0) * POSE_SCALE;                        // feet bottom -> baseline
    ctx.drawImage(src, x0, y0, x1 - x0, y1 - y0, dx, dy, (x1 - x0) * POSE_SCALE, (y1 - y0) * POSE_SCALE);
    report[names[i]] = { raw: [x0, y0, x1, y1], at: [Math.round(dx), Math.round(dy)] };
  });
  // icon: fill the square, bottom-aligned and centred (the artist's bust is cropped flat at the bottom)
  const [ix0, iy0, ix1, iy1] = bboxOf(0, iconRow[0], W, iconRow[1]);
  const k = Math.min(ICON / (iy1 - iy0), ICON / (ix1 - ix0));
  ctx.drawImage(src, ix0, iy0, ix1 - ix0, iy1 - iy0, (ICON - (ix1 - ix0) * k) / 2, CELL_H + ICON - (iy1 - iy0) * k, (ix1 - ix0) * k, (iy1 - iy0) * k);
  report.icon = { raw: [ix0, iy0, ix1, iy1], scale: +k.toFixed(3) };
  return { png: sheet.toDataURL('image/png'), report, rawSize: [W, H] };
}, { dataUrl, CELL_W, CELL_H, ICON, FEET_Y, POSE_SCALE });
await browser.close();

const atlas = {
  image: `${hero}.png`, scale: SCALE, logical: { w: LW, h: LH },
  frames: {
    idle: { x: 0, y: 0, w: CELL_W, h: CELL_H },
    fire: { x: CELL_W, y: 0, w: CELL_W, h: CELL_H },
    ability: { x: CELL_W * 2, y: 0, w: CELL_W, h: CELL_H },
    icon: { x: 0, y: CELL_H, w: ICON, h: ICON },
  },
};
for (const [name, f] of Object.entries(artist.frames || {})) if (atlas.frames[name]) for (const key of ['duration', 'loop', 'description']) if (f[key] !== undefined) atlas.frames[name][key] = f[key];
if (artist.animations) atlas.animations = artist.animations;
fs.mkdirSync(path.join(ROOT, 'art'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'art', `${hero}.png`), Buffer.from(out.png.split(',')[1], 'base64'));
fs.writeFileSync(path.join(ROOT, 'art', `${hero}.json`), JSON.stringify(atlas, null, 2) + '\n');
console.log(`raw ${out.rawSize.join('x')} -> art/${hero}.png (${CELL_W * 3}x${CELL_H + ICON}) + art/${hero}.json`);
console.log(JSON.stringify(out.report));

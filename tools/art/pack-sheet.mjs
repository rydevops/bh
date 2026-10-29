// Packs an artist's raw hero sheet (art_src/<hero>_raw.webp|png + art_src/<hero>_artist_atlas.json) into the layout the
// game reads: art/<hero>.png (transparent PNG) + art/<hero>.json (atlas).
//
// Poses (every frame in the artist's atlas except `icon`) are found with the artist's rectangles, but because glows can spill
// across a cell edge the cut between two neighbouring poses is moved to the quietest column nearby and softened with a short
// fade. Every pose is then scaled by one common factor and placed in a fixed cell with the boots on a shared baseline, centred
// on the boots, so the hero never jumps when the frame changes. The artist's `animations` (frame lists and timings) are carried
// over unchanged.
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
const artist = JSON.parse(fs.readFileSync(path.join(ROOT, 'art_src', `${hero}_artist_atlas.json`), 'utf8'));
const rects = Object.fromEntries(Object.entries(artist.frames).map(([n, f]) => [n, f.frame || f]));
const poseNames = Object.keys(rects).filter((n) => n !== 'icon');
if (!rects.icon || !poseNames.includes('idle')) throw new Error('the artist atlas needs an `idle` pose and an `icon`');

const SCALE = 4, LW = 72, LH = 112;       // sheet scale and the hero's world box
const CELL_W = LW * SCALE, CELL_H = LH * SCALE, ICON = 256;
const FEET_Y = 100 * SCALE;                // boots sit 12 world px above the bottom of the box
const POSE_SCALE = 0.72;                   // raw pixels -> sheet pixels for every pose
const FADE = 24;                           // px fade where a cut goes through a glow

const mime = rawPath.endsWith('.webp') ? 'image/webp' : 'image/png';
const dataUrl = `data:${mime};base64,${fs.readFileSync(rawPath).toString('base64')}`;
const browser = await chromium.launch();
const page = await browser.newPage();
const out = await page.evaluate(async ({ dataUrl, rects, poseNames, CELL_W, CELL_H, ICON, FEET_Y, POSE_SCALE, FADE, expect }) => {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = dataUrl; });
  const W = img.width, H = img.height;
  if (expect && (expect.w !== W || expect.h !== H)) throw new Error(`the artist atlas says ${expect.w}x${expect.h} but the picture is ${W}x${H}; fix the atlas rectangles`);
  const src = document.createElement('canvas'); src.width = W; src.height = H;
  const sx = src.getContext('2d', { willReadFrequently: true }); sx.drawImage(img, 0, 0);
  const D = sx.getImageData(0, 0, W, H).data;
  const alpha = (x, y) => D[(y * W + x) * 4 + 3];
  const dark = (x, y) => { const i = (y * W + x) * 4; return D[i + 3] > 200 && D[i] + D[i + 1] + D[i + 2] < 250; }; // outlines and boots

  // 1. cut positions between neighbouring poses: the column with the least ink near the artist's cell edge
  const order = poseNames.slice().sort((a, b) => rects[a].x - rects[b].x);
  const top = Math.min(...order.map((n) => rects[n].y)), bot = Math.max(...order.map((n) => rects[n].y + rects[n].h));
  const ink = (x) => { let c = 0; for (let y = top; y < bot; y++) if (alpha(x, y) > 24) c++; return c; };
  const cuts = [0];
  for (let i = 0; i < order.length - 1; i++) {
    const edge = rects[order[i]].x + rects[order[i]].w;
    let best = edge, bestInk = 1e9;
    for (let x = edge - 50; x <= edge + 50; x++) { const c = ink(x) * 1000 + Math.abs(x - edge); if (c < bestInk) { bestInk = c; best = x; } }
    cuts.push(best);
  }
  cuts.push(W);

  const sheet = document.createElement('canvas'); sheet.width = CELL_W * order.length; sheet.height = CELL_H + ICON;
  const ctx = sheet.getContext('2d'); ctx.imageSmoothingQuality = 'high';
  const report = {};
  order.forEach((name, i) => {
    const x0 = cuts[i], x1 = cuts[i + 1], y0 = rects[name].y, y1 = rects[name].y + rects[name].h;
    // crop, with a fade on any side that was cut through ink
    const w = x1 - x0, h = y1 - y0;
    const crop = document.createElement('canvas'); crop.width = w; crop.height = h;
    const cx = crop.getContext('2d'); cx.drawImage(src, x0, y0, w, h, 0, 0, w, h);
    // the generator leaves a faint haze (alpha 1-14) around every pose; remove it, with a smooth ramp so glows still fade out
    const px = cx.getImageData(0, 0, w, h), pd = px.data;
    for (let j = 3; j < pd.length; j += 4) pd[j] = pd[j] <= 12 ? 0 : Math.min(255, ((pd[j] - 12) * 255) / 243);
    cx.putImageData(px, 0, 0);
    const cut = (x) => { let c = 0; for (let y = y0; y < y1; y++) if (alpha(x, y) > 24) c++; return c > 40; }; // a few stray sparks are not worth fading
    const fadeL = i > 0 && cut(x0), fadeR = i < order.length - 1 && cut(x1 - 1);
    if (fadeL || fadeR) {
      cx.globalCompositeOperation = 'destination-in';
      const g = cx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, fadeL ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)');
      if (fadeL) g.addColorStop(Math.min(0.49, FADE / w), 'rgba(0,0,0,1)');
      if (fadeR) g.addColorStop(Math.max(0.51, 1 - FADE / w), 'rgba(0,0,0,1)');
      g.addColorStop(1, fadeR ? 'rgba(0,0,0,0)' : 'rgba(0,0,0,1)');
      cx.fillStyle = g; cx.fillRect(0, 0, w, h);
    }
    // boots: lowest dark pixel, and the centre of the dark pixels in the lowest part of the figure
    let bottom = -1; const pts = [];
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (dark(x, y)) { if (y > bottom) bottom = y; pts.push([x, y]); }
    const lowCut = bottom - 90;
    const low = pts.filter(([, y]) => y > lowCut);
    const feetX = low.reduce((a, [x]) => a + x, 0) / low.length;
    const dx = i * CELL_W + CELL_W / 2 - (feetX - x0) * POSE_SCALE;
    const dy = FEET_Y - (bottom + 1 - y0) * POSE_SCALE;
    ctx.save(); ctx.beginPath(); ctx.rect(i * CELL_W, 0, CELL_W, CELL_H); ctx.clip();
    ctx.drawImage(crop, dx, dy, w * POSE_SCALE, h * POSE_SCALE);
    ctx.restore();
    report[name] = { window: [x0, x1], bootsBottom: bottom + 1, feetX: Math.round(feetX), faded: [fadeL, fadeR] };
  });
  // icon: fill the square, bottom-aligned and centred (the artist's bust is cropped flat at the bottom)
  const ir = rects.icon;
  let a = 1e9, b = 1e9, c = -1, d = -1;
  for (let y = ir.y; y < ir.y + ir.h; y++) for (let x = ir.x; x < ir.x + ir.w; x++) if (alpha(x, y) > 8) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; }
  const iw = c + 1 - a, ih = d + 1 - b, k = Math.min(ICON / ih, ICON / iw);
  ctx.drawImage(src, a, b, iw, ih, (ICON - iw * k) / 2, CELL_H + ICON - ih * k, iw * k, ih * k);
  report.icon = { bbox: [a, b, c + 1, d + 1], scale: +k.toFixed(3) };
  return { png: sheet.toDataURL('image/png'), report, cells: order };
}, { dataUrl, rects, poseNames, CELL_W, CELL_H, ICON, FEET_Y, POSE_SCALE, FADE, expect: artist.size || null });
await browser.close();

const atlas = { image: `${hero}.png`, scale: SCALE, logical: { w: LW, h: LH }, frames: {} };
out.cells.forEach((name, i) => { atlas.frames[name] = { x: i * CELL_W, y: 0, w: CELL_W, h: CELL_H }; });
atlas.frames.icon = { x: 0, y: CELL_H, w: ICON, h: ICON };
if (artist.animations) atlas.animations = artist.animations;
fs.mkdirSync(path.join(ROOT, 'art'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'art', `${hero}.png`), Buffer.from(out.png.split(',')[1], 'base64'));
fs.writeFileSync(path.join(ROOT, 'art', `${hero}.json`), JSON.stringify(atlas, null, 2) + '\n');
console.log(`-> art/${hero}.png (${CELL_W * out.cells.length}x${CELL_H + ICON}) + art/${hero}.json`);
console.log(JSON.stringify(out.report));

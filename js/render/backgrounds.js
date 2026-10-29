// Procedurally painted battlefields, one per world. Rendered once per (world, size, scale) into a bitmap.

import { WORLDS } from '../data/stages.js';
import { RNG } from '../util.js';
import { makeCanvas, shade } from './sprites.js';

const cache = new Map();
export function clearBackgroundCache() { cache.clear(); }

export function background(world, H, wallY, scale) {
  const key = `${world}:${H}:${wallY}:${scale}`;
  if (cache.has(key)) return cache.get(key);
  const W = 360;
  const c = makeCanvas(Math.ceil(W * scale), Math.ceil(H * scale));
  const ctx = c.getContext('2d');
  ctx.scale(scale, scale);
  const pal = WORLDS[world].bg;
  const rng = new RNG(1234 + world * 77);

  // sky / far field
  const g = ctx.createLinearGradient(0, 0, 0, wallY);
  // Starts at the mid tone (not the darker `top` tone) so the top edge of the screen never fades to black.
  g.addColorStop(0, pal.mid);
  g.addColorStop(1, pal.bottom);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (world === 0) wasteland(ctx, W, wallY, pal, rng);
  else if (world === 1) orbital(ctx, W, wallY, pal, rng);
  else monster(ctx, W, wallY, pal, rng);

  // ground plane (perspective floor) from y=110 to wall
  const gy = 100;
  const fg = ctx.createLinearGradient(0, gy, 0, wallY);
  fg.addColorStop(0, 'rgba(0,0,0,0.25)');
  fg.addColorStop(1, 'rgba(0,0,0,0.05)');
  ctx.fillStyle = fg;
  ctx.fillRect(0, gy, W, wallY - gy);
  // lane guides (subtle perspective hint)
  ctx.strokeStyle = 'rgba(255,255,255,0.045)';
  ctx.lineWidth = 1;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath(); ctx.moveTo(W / 2 + i * 24, gy); ctx.lineTo(W / 2 + i * 70, wallY); ctx.stroke();
  }

  // defender platform
  const pg = ctx.createLinearGradient(0, wallY, 0, H);
  pg.addColorStop(0, shade(pal.ground, 0.06));
  pg.addColorStop(1, shade(pal.ground, -0.12));
  ctx.fillStyle = pg;
  ctx.fillRect(0, wallY, W, H - wallY);
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 2;
  for (let y = wallY + 24; y < H; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  for (let x = 0; x <= W; x += 60) { ctx.beginPath(); ctx.moveTo(x, wallY); ctx.lineTo(x, H); ctx.stroke(); }
  ctx.fillStyle = 'rgba(255,255,255,0.05)';
  for (let x = 0; x < W; x += 60) ctx.fillRect(x + 2, wallY + 2, 56, 3);

  cache.set(key, c);
  return c;
}

function wasteland(ctx, W, wallY, pal, rng) {
  // sun glow
  const s = ctx.createRadialGradient(250, 70, 4, 250, 70, 150);
  s.addColorStop(0, 'rgba(255,200,120,0.85)'); s.addColorStop(1, 'rgba(255,140,80,0)');
  ctx.fillStyle = s; ctx.fillRect(0, 0, W, 220);
  // ruined skyline (two depth layers)
  for (let layer = 0; layer < 2; layer++) {
    ctx.fillStyle = layer ? '#1c1626' : '#34223a';
    let x = -10;
    while (x < W) {
      const w = 16 + rng.next() * 30, h = (layer ? 28 : 48) + rng.next() * (layer ? 30 : 46);
      const top = 112 - h;
      ctx.beginPath(); ctx.moveTo(x, 112);
      ctx.lineTo(x, top + rng.next() * 8); ctx.lineTo(x + w * 0.4, top - rng.next() * 6); ctx.lineTo(x + w * 0.7, top + rng.next() * 12); ctx.lineTo(x + w, top + 4);
      ctx.lineTo(x + w, 112); ctx.fill();
      ctx.fillStyle = layer ? 'rgba(255,200,120,.12)' : 'rgba(255,200,120,.2)';
      for (let k = 0; k < 4; k++) ctx.fillRect(x + 3 + rng.next() * (w - 8), top + 8 + rng.next() * (h - 14), 3, 4);
      ctx.fillStyle = layer ? '#1c1626' : '#34223a';
      x += w * 0.85;
    }
  }
  // dusty haze
  const hz = ctx.createLinearGradient(0, 80, 0, 150);
  hz.addColorStop(0, 'rgba(255,170,110,0)'); hz.addColorStop(1, 'rgba(255,170,110,0.28)');
  ctx.fillStyle = hz; ctx.fillRect(0, 80, W, 70);
  // cracked ground
  ctx.fillStyle = '#4a3a3e'; ctx.fillRect(0, 112, W, wallY - 112);
  const gg = ctx.createLinearGradient(0, 112, 0, wallY);
  gg.addColorStop(0, 'rgba(120,70,60,0.5)'); gg.addColorStop(1, 'rgba(40,30,40,0.5)');
  ctx.fillStyle = gg; ctx.fillRect(0, 112, W, wallY - 112);
  ctx.strokeStyle = 'rgba(20,12,18,0.5)'; ctx.lineWidth = 1.4;
  for (let i = 0; i < 26; i++) {
    let x = rng.range(0, W), y = rng.range(120, wallY);
    ctx.beginPath(); ctx.moveTo(x, y);
    for (let k = 0; k < 4; k++) { x += rng.range(-18, 18); y += rng.range(4, 20); ctx.lineTo(x, y); }
    ctx.stroke();
  }
  for (let i = 0; i < 70; i++) {
    ctx.fillStyle = rng.chance(0.5) ? 'rgba(0,0,0,.2)' : 'rgba(255,200,150,.07)';
    const y = rng.range(120, wallY);
    const r = 1 + (y / wallY) * 3;
    ctx.beginPath(); ctx.ellipse(rng.range(0, W), y, r * 1.8, r, 0, 0, 7); ctx.fill();
  }
  // wrecked car silhouettes on the edges
  ctx.fillStyle = 'rgba(15,10,20,.55)';
  ctx.fillRect(-4, 260, 34, 14); ctx.fillRect(4, 252, 18, 10); ctx.fillRect(W - 36, 330, 40, 15); ctx.fillRect(W - 28, 322, 20, 10);
}

function orbital(ctx, W, wallY, pal, rng) {
  for (let i = 0; i < 90; i++) {
    ctx.fillStyle = `rgba(255,255,255,${0.2 + rng.next() * 0.7})`;
    const s = rng.next() < 0.1 ? 2 : 1;
    ctx.fillRect(rng.range(0, W), rng.range(0, 150), s, s);
  }
  // planet with ring
  const pg = ctx.createRadialGradient(80, 70, 4, 90, 80, 56);
  pg.addColorStop(0, '#7fb8ff'); pg.addColorStop(0.7, '#2f5ab0'); pg.addColorStop(1, '#14275a');
  ctx.fillStyle = pg; ctx.beginPath(); ctx.arc(90, 80, 52, 0, 7); ctx.fill();
  ctx.strokeStyle = 'rgba(190,230,255,.55)'; ctx.lineWidth = 5;
  ctx.beginPath(); ctx.ellipse(90, 82, 86, 16, -0.25, 0, 7); ctx.stroke();
  // station girders
  ctx.fillStyle = '#10183a';
  ctx.fillRect(0, 110, W, 10);
  for (let x = 0; x < W; x += 36) { ctx.fillRect(x, 100, 6, 20); }
  ctx.fillStyle = pal.accent;
  for (let x = 6; x < W; x += 36) ctx.fillRect(x, 108, 4, 2);
  // metal floor
  const fg = ctx.createLinearGradient(0, 120, 0, wallY);
  fg.addColorStop(0, '#15204a'); fg.addColorStop(1, '#0c1432');
  ctx.fillStyle = fg; ctx.fillRect(0, 120, W, wallY - 120);
  ctx.strokeStyle = 'rgba(76,240,255,0.12)'; ctx.lineWidth = 1.2;
  for (let y = 130; y < wallY; y += 26 + (y - 130) * 0.12) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
  for (let i = -8; i <= 8; i++) { ctx.beginPath(); ctx.moveTo(W / 2 + i * 22, 120); ctx.lineTo(W / 2 + i * 60, wallY); ctx.stroke(); }
  ctx.fillStyle = 'rgba(76,240,255,.5)';
  for (let y = 150; y < wallY; y += 44) { ctx.fillRect(10, y, 3, 14); ctx.fillRect(W - 13, y, 3, 14); }
  ctx.fillStyle = 'rgba(255,60,90,.35)';
  for (let y = 172; y < wallY; y += 88) { ctx.fillRect(10, y, 3, 8); ctx.fillRect(W - 13, y, 3, 8); }
}

function monster(ctx, W, wallY, pal, rng) {
  // cavern ceiling
  ctx.fillStyle = '#12081f';
  ctx.beginPath(); ctx.moveTo(0, 0);
  for (let x = 0; x <= W; x += 14) ctx.lineTo(x, 28 + rng.next() * 50 + (x % 56 < 14 ? 30 : 0));
  ctx.lineTo(W, 0); ctx.fill();
  // glowing spores
  for (let i = 0; i < 60; i++) {
    const x = rng.range(0, W), y = rng.range(20, wallY), r = rng.range(1, 3.2);
    const gl = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
    gl.addColorStop(0, 'rgba(155,255,107,.55)'); gl.addColorStop(1, 'rgba(155,255,107,0)');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(x, y, r * 4, 0, 7); ctx.fill();
  }
  // organic floor
  const fg = ctx.createLinearGradient(0, 110, 0, wallY);
  fg.addColorStop(0, '#1a3b30'); fg.addColorStop(1, '#10261f');
  ctx.fillStyle = fg; ctx.fillRect(0, 110, W, wallY - 110);
  ctx.strokeStyle = 'rgba(190,120,255,.25)'; ctx.lineWidth = 2;
  for (let i = 0; i < 16; i++) {
    let x = rng.range(0, W), y = 110;
    ctx.beginPath(); ctx.moveTo(x, y);
    while (y < wallY) { x += rng.range(-22, 22); y += rng.range(14, 36); ctx.quadraticCurveTo(x + rng.range(-12, 12), y - 10, x, y); }
    ctx.stroke();
  }
  for (let i = 0; i < 30; i++) {
    const y = rng.range(120, wallY), r = 4 + (y / wallY) * 12;
    ctx.fillStyle = 'rgba(20,10,40,.32)';
    ctx.beginPath(); ctx.ellipse(rng.range(0, W), y, r * 1.6, r, 0, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(150,255,110,.1)';
    ctx.beginPath(); ctx.ellipse(rng.range(0, W), y + 2, r, r * 0.6, 0, 0, 7); ctx.fill();
  }
}

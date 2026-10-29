// Shared painted scenery for the title screen and the battlefield: gradient sky, sun / planet / moon, drifting
// clouds, parallax skylines, per-world details (crows, drones + searchlights, glowing spores), perspective floor.
// Everything static is pre-rendered once per size; each frame only draws the moving layers.

import { makeCanvas } from './sprites.js';
import { RNG } from '../util.js';

export const W = 360;
// Colours chosen so the top of the sky is never darker than the horizon band (no dark fade at the top edge).
export const SKY = [
  { top: '#6a5aa8', mid: '#d0715f', hor: '#ffb87a', far: '#4a2f55', near: '#2a1a38', ground: '#4a3a3e', glow: '#ffd9a0' },
  { top: '#3d5fc0', mid: '#4f86dd', hor: '#8fd0ff', far: '#233b7a', near: '#16255a', ground: '#1c2a58', glow: '#bfeaff' },
  { top: '#6a3fa8', mid: '#4f4aa0', hor: '#4fc9a0', far: '#32225e', near: '#1c1440', ground: '#1d4a3c', glow: '#b6ff9a' },
];
export const skyTop = (wi) => SKY[wi].top;

/**
 * @param o { pxW, pxH, k, H, hy, wallY, withWall } bitmap size, world scale, world height, horizon y, wall y
 * @returns { draw(ctx, world, alpha, t, lite) } draws one world's layers (leaves ctx scaled by k)
 */
export function makeScenery({ pxW, pxH, k, H, hy, wallY, withWall = true }) {
  const shadeHex = (hex, amt) => {
    const n = parseInt(hex.slice(1), 16);
    const f = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
    return '#' + ((1 << 24) | (f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1);
  };

  function buildCache(wi) {
    const c = SKY[wi], r = new RNG(100 + wi * 17);
    const sky = makeCanvas(pxW, pxH);
    const x = sky.getContext('2d'); x.scale(k, k);
    const g = x.createLinearGradient(0, 0, 0, hy);
    g.addColorStop(0, c.top); g.addColorStop(0.55, c.mid); g.addColorStop(1, c.hor);
    x.fillStyle = g; x.fillRect(0, 0, W, hy + 2);
    if (wi === 1) for (let i = 0; i < 80; i++) { x.fillStyle = `rgba(255,255,255,${0.25 + r.next() * 0.6})`; const s = r.next() < 0.12 ? 2 : 1; x.fillRect(r.range(0, W), r.range(0, hy * 0.85), s, s); }
    if (wi === 2) { // hanging stalactites
      x.fillStyle = '#241547';
      for (let i = 0; i < 14; i++) { const bx = i * 28 + r.range(-6, 6), bw = r.range(12, 24), bh = r.range(26, 78); x.beginPath(); x.moveTo(bx - bw / 2, 0); x.lineTo(bx + bw / 2, 0); x.lineTo(bx + r.range(-3, 3), bh); x.fill(); }
    }
    // ground (perspective floor) + platform
    const gr = x.createLinearGradient(0, hy, 0, wallY);
    gr.addColorStop(0, c.ground); gr.addColorStop(1, shadeHex(c.ground, -0.12));
    x.fillStyle = gr; x.fillRect(0, hy, W, wallY - hy + 2);
    x.strokeStyle = 'rgba(255,255,255,.07)'; x.lineWidth = 1;
    for (let i = -6; i <= 6; i++) { x.beginPath(); x.moveTo(W / 2 + i * 14, hy); x.lineTo(W / 2 + i * 70, wallY); x.stroke(); }
    for (let i = 0; i < 70; i++) { const y = r.range(hy, wallY), s = 1 + ((y - hy) / (wallY - hy)) * 3; x.fillStyle = r.chance(0.5) ? 'rgba(0,0,0,.18)' : 'rgba(255,255,255,.05)'; x.beginPath(); x.ellipse(r.range(0, W), y, s * 1.8, s, 0, 0, 7); x.fill(); }
    const pg = x.createLinearGradient(0, wallY, 0, H);
    pg.addColorStop(0, shadeHex(c.ground, 0.05)); pg.addColorStop(1, shadeHex(c.ground, -0.18));
    x.fillStyle = pg; x.fillRect(0, wallY, W, H - wallY);
    x.strokeStyle = 'rgba(0,0,0,.25)'; x.lineWidth = 2;
    for (let y = wallY + 26; y < H; y += 34) { x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); }
    if (withWall) for (let i = 0; i < 12; i++) { x.fillStyle = i % 2 ? '#5a6078' : '#686f8a'; x.fillRect(i * 30 + 1, wallY - 14, 28, 20); x.fillStyle = 'rgba(255,255,255,.18)'; x.fillRect(i * 30 + 1, wallY - 14, 28, 4); }
    if (withWall) { x.fillStyle = '#ffd23f'; for (let i = 0; i < 24; i += 2) x.fillRect(i * 15, wallY + 6, 8, 3); }
    // two scrolling skyline tiles (drawn twice to wrap)
    const tile = (col, hMin, hMax, seed) => {
      const tc = makeCanvas(Math.ceil(W * k), Math.ceil((hy + 4) * k));
      const tx = tc.getContext('2d'); tx.scale(k, k);
      const rr = new RNG(seed); tx.fillStyle = col;
      let px = 0;
      while (px < W) {
        const w = rr.range(14, 34), h = rr.range(hMin, hMax);
        const e = px + w >= W - 2 ? W - px : w; // last building closes the tile cleanly
        if (wi === 0) { tx.beginPath(); tx.moveTo(px, hy); tx.lineTo(px, hy - h); tx.lineTo(px + e * 0.4, hy - h - rr.range(0, 8)); tx.lineTo(px + e * 0.7, hy - h + rr.range(0, 10)); tx.lineTo(px + e, hy - h + 3); tx.lineTo(px + e, hy); tx.fill(); }
        else if (wi === 1) { tx.fillRect(px, hy - h, e, h); tx.fillRect(px + e * 0.4, hy - h - 12, 3, 12); }
        else { tx.beginPath(); tx.moveTo(px, hy); tx.quadraticCurveTo(px + e / 2, hy - h * 1.6, px + e, hy); tx.fill(); }
        px += e;
      }
      return tc;
    };
    return { sky, far: tile(c.far, 24, 62, 7 + wi), near: tile(c.near, 14, 44, 31 + wi) };
  }

  const cache = SKY.map((_, wi) => buildCache(wi));

  function draw(ctx, wi, alpha, tt, lite = false) {
    const c = SKY[wi], cc = cache[wi];
    ctx.globalAlpha = alpha;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cc.sky, 0, 0);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    // sun / ringed planet / glowing moon
    const bx = wi === 1 ? 92 : wi === 0 ? 262 : 250, by = wi === 1 ? hy * 0.5 : hy * 0.74, br = wi === 1 ? 38 : 30;
    const pulse = 1 + 0.04 * Math.sin(tt * 1.4);
    const gl = ctx.createRadialGradient(bx, by, 2, bx, by, br * 3.2 * pulse);
    gl.addColorStop(0, c.glow + 'cc'); gl.addColorStop(1, c.glow + '00');
    ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(bx, by, br * 3.2 * pulse, 0, 7); ctx.fill();
    ctx.fillStyle = wi === 1 ? '#7fb8ff' : c.glow; ctx.beginPath(); ctx.arc(bx, by, br, 0, 7); ctx.fill();
    if (wi === 1) { ctx.strokeStyle = 'rgba(210,235,255,.7)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.ellipse(bx, by + 2, br * 1.8, br * 0.38, -0.25 + Math.sin(tt * 0.3) * 0.04, 0, 7); ctx.stroke(); }
    // twinkling stars (orbital)
    if (wi === 1) for (let i = 0; i < 14; i++) { ctx.fillStyle = `rgba(255,255,255,${0.35 + 0.55 * Math.abs(Math.sin(tt * (0.8 + (i % 5) * 0.3) + i))})`; ctx.fillRect(14 + ((i * 53) % 330), 10 + ((i * 37) % 130), 2, 2); }
    // soft clouds drifting at two speeds
    ctx.fillStyle = wi === 0 ? 'rgba(255,205,170,.28)' : wi === 1 ? 'rgba(220,240,255,.18)' : 'rgba(190,255,200,.14)';
    for (let i = 0; i < 6; i++) {
      const sp = 5 + (i % 3) * 4, cx = ((i * 83 + tt * sp) % (W + 160)) - 80, cy = 30 + (i * 29) % (hy * 0.6);
      for (let j = 0; j < 4; j++) { ctx.beginPath(); ctx.ellipse(cx + j * 16 - 24, cy + (j % 2) * 3, 22 - j * 2, 6, 0, 0, 7); ctx.fill(); }
    }
    // parallax skylines
    const sx = (layer, sp) => { const o = (tt * sp) % W; ctx.drawImage(layer, 0, 0, layer.width, layer.height, -o, 0, W, layer.height / k); ctx.drawImage(layer, 0, 0, layer.width, layer.height, W - o, 0, W, layer.height / k); };
    sx(cc.far, 3); sx(cc.near, 7);
    // world details
    if (wi === 0) { // crows
      ctx.strokeStyle = '#1b1226'; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
      for (let i = 0; i < 4; i++) { const x = ((tt * (22 + i * 4) + i * 120) % (W + 80)) - 40, y = 40 + i * 20 + Math.sin(tt * 2 + i) * 4, f = Math.sin(tt * 9 + i * 2) * 4; ctx.beginPath(); ctx.moveTo(x - 7, y - f); ctx.quadraticCurveTo(x - 3, y - 2, x, y); ctx.quadraticCurveTo(x + 3, y - 2, x + 7, y - f); ctx.stroke(); }
    } else if (wi === 1) { // patrolling drones + searchlights from the wall
      for (let i = 0; i < 3; i++) {
        const x = 60 + i * 110 + Math.sin(tt * 0.6 + i * 2) * 36, y = 50 + i * 22 + Math.sin(tt * 1.3 + i) * 5;
        ctx.fillStyle = '#10163a'; ctx.beginPath(); ctx.ellipse(x, y, 11, 4.5, 0, 0, 7); ctx.fill(); ctx.fillRect(x - 15, y - 1, 30, 1.6);
        ctx.fillStyle = Math.sin(tt * 5 + i) > 0 ? '#ff4a4a' : '#4cf0ff'; ctx.beginPath(); ctx.arc(x, y + 1, 2, 0, 7); ctx.fill();
      }
      ctx.globalCompositeOperation = 'lighter';
      if (!lite) for (let i = 0; i < 2; i++) {
        const bx2 = i ? W - 30 : 30, a = -Math.PI / 2 + Math.sin(tt * 0.7 + i * 2.2) * 0.55 * (i ? -1 : 1), L = wallY - 10;
        const sg = ctx.createLinearGradient(bx2, wallY, bx2 + Math.cos(a) * L, wallY + Math.sin(a) * L);
        sg.addColorStop(0, 'rgba(190,240,255,.34)'); sg.addColorStop(1, 'rgba(190,240,255,0)');
        ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(bx2, wallY); ctx.lineTo(bx2 + Math.cos(a - 0.07) * L, wallY + Math.sin(a - 0.07) * L); ctx.lineTo(bx2 + Math.cos(a + 0.07) * L, wallY + Math.sin(a + 0.07) * L); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = 'rgba(76,240,255,.22)'; ctx.lineWidth = 1; // sliding floor lights
      for (let i = 0; i < 6; i++) { const f = ((tt * 0.35 + i / 6) % 1); const y = hy + (wallY - hy) * f * f; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    } else { // glowing spores drifting up + pulsing floor veins
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < (lite ? 8 : 26); i++) {
        const x = (i * 47 + Math.sin(tt * 0.7 + i) * 14) % W, y = H * 0.62 - ((tt * (8 + (i % 5) * 3) + i * 41) % (H * 0.6));
        const a = 0.25 + 0.4 * Math.abs(Math.sin(tt * 1.6 + i)), r = 1.4 + (i % 3);
        const sg = ctx.createRadialGradient(x, y, 0, x, y, r * 4); sg.addColorStop(0, `rgba(160,255,120,${a})`); sg.addColorStop(1, 'rgba(160,255,120,0)');
        ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(x, y, r * 4, 0, 7); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (wi === 0) { // drifting dust bands + rising embers
      ctx.fillStyle = 'rgba(255,200,150,.10)';
      for (let i = 0; i < 4; i++) { const x = ((tt * (14 + i * 6) + i * 140) % (W + 200)) - 100, y = hy + 20 + i * 52; ctx.beginPath(); ctx.ellipse(x, y, 90, 7 + i * 2, 0, 0, 7); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,170,90,.8)';
      for (let i = 0; i < 16; i++) { const x = (i * 61 + Math.sin(tt + i) * 18) % W, y = wallY - ((tt * (12 + (i % 4) * 5) + i * 53) % (wallY * 0.8)); ctx.fillRect(x, y, 1.6, 1.6); }
    }
    ctx.globalAlpha = 1;
  }

  return { draw };
}

// Animated title-screen scenery. A small diorama that slowly cycles through the three worlds:
// parallax skylines, drifting clouds, flying creatures, ambient particles, and the squad on the wall
// shooting at enemies that march in from the horizon. Pure canvas, no assets.

import { heroSprite, enemySprite } from './sprites.js';
import { SKY, makeScenery } from './scenery.js';
import { RNG } from '../util.js';

const W = 360;
const WORLD_SECONDS = 11; // how long each world stays on screen
const FADE = 1.4;         // crossfade between worlds

const FOES = [['grunt', 'runner', 'grunt', 'bulwark'], ['grunt', 'drone', 'sentinel', 'runner'], ['slimeling', 'splitter', 'grunt', 'slimeling']];
const FOE_R = { grunt: 11, runner: 9, bulwark: 17, sentinel: 13, drone: 10, splitter: 15, slimeling: 7 };

/**
 * @param canvas the full-screen <canvas>
 * @param squad  [{ id, skin }] heroes to put on the wall
 * @param opts   { animate: false } renders a single still frame (reduced motion)
 * @returns stop()
 */
export function startTitleScene(canvas, squad, opts = {}) {
  const ctx = canvas.getContext('2d');
  const rng = new RNG(2024);
  let raf = 0, stopped = false, t = 0, last = performance.now();
  let k = 1, H = 700, hy = 260, wallY = 480, scn = null;
  let foes = [], shots = [], parts = [], spawnT = 0.5, lastTop = null;
  const heroes = (squad && squad.length ? squad : [{ id: 'vanguard', skin: 'default' }, { id: 'rook', skin: 'default' }, { id: 'patch', skin: 'default' }]).slice(0, 4)
    .map((s, i, a) => ({ ...s, x: (W * (i + 1)) / (a.length + 1), cd: 0.3 + i * 0.17, recoil: 0 }));

  function resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) return false;
    if (canvas.width === Math.round(cw * dpr) && scn) return true;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    k = canvas.width / W; H = canvas.height / k;
    hy = H * 0.34; wallY = H * 0.78;
    scn = makeScenery({ pxW: canvas.width, pxH: canvas.height, k, H, hy, wallY });
    return true;
  }

  // ------------------------------------------------------------------ one world's layers
  function drawWorld(wi, alpha, tt) { scn.draw(ctx, wi, alpha, tt); }

  // ------------------------------------------------------------------ actors
  const depth = (y) => 0.7 + 0.7 * Math.max(0, Math.min(1, (y - hy) / (wallY - hy))); // perspective: bigger as they near the wall
  function spawnFoe(wi) {
    const type = FOES[wi][Math.floor(rng.next() * FOES[wi].length)];
    foes.push({ type, wi, x: 30 + rng.next() * 300, y: hy + 4, hp: type === 'bulwark' ? 7 : 3, t: rng.next() * 6, sp: type === 'runner' || type === 'slimeling' ? 38 : type === 'bulwark' ? 16 : 26, fly: type === 'drone' });
  }
  function burst(x, y, n, col, speed = 90) { for (let i = 0; i < n; i++) { const a = rng.next() * 6.28, s = speed * (0.3 + rng.next() * 0.7); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 20, life: 0.5 + rng.next() * 0.3, max: 0.8, col }); } }

  function stepActors(dt, wi) {
    spawnT -= dt;
    if (spawnT <= 0 && foes.length < 9) { spawnT = 0.7 + rng.next() * 0.8; spawnFoe(wi); }
    for (const f of foes) { f.t += dt; f.y += f.sp * depth(f.y) * dt * (f.fly ? 1.1 : 1); f.x += Math.sin(f.t * 1.8) * 6 * dt; }
    for (const h of heroes) {
      h.recoil = Math.max(0, h.recoil - dt * 8); h.cd -= dt;
      if (h.cd > 0) continue;
      const tgt = foes.filter((f) => f.y > hy + (wallY - hy) * 0.5).sort((a, b) => b.y - a.y)[0]; // let them march a while first
      if (!tgt) { h.cd = 0.2; continue; }
      h.cd = 0.55 + rng.next() * 0.45; h.recoil = 1;
      const hyy = wallY + (H - wallY) * 0.5 - 24;
      shots.push({ x1: h.x, y1: hyy, x2: tgt.x, y2: tgt.y, life: 0.16 });
      burst(h.x, hyy, 2, '#fff3b0', 60);
      tgt.hp--;
      if (tgt.hp <= 0) { burst(tgt.x, tgt.y, 12, '#ffd9a0', 120); tgt.dead = true; }
    }
    foes = foes.filter((f) => { if (f.y > wallY - 6 && !f.dead) { burst(f.x, f.y, 10, '#ff9a5a', 100); return false; } return !f.dead; });
    for (const s of shots) s.life -= dt; shots = shots.filter((s) => s.life > 0);
    for (const p of parts) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 180 * dt; } parts = parts.filter((p) => p.life > 0);
  }

  function drawActors(wi) {
    const list = foes.slice().sort((a, b) => a.y - b.y);
    for (const f of list) {
      const s = enemySprite(f.type, f.wi, Math.floor(f.t * 4) % 2, FOE_R[f.type], k), d = depth(f.y);
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(f.x, f.y + FOE_R[f.type] * d * 0.9 + (f.fly ? 12 * d : 0), FOE_R[f.type] * d, FOE_R[f.type] * d * 0.3, 0, 0, 7); ctx.fill();
      ctx.drawImage(s, f.x - (s.lw * d) / 2, f.y - (s.lh * d) / 2 + (f.fly ? Math.sin(f.t * 3) * 3 - 8 : 0), s.lw * d, s.lh * d);
    }
    const fy = wallY + (H - wallY) * 0.5;
    for (const h of heroes) {
      const sp = heroSprite(h.id, h.skin, k);
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(h.x, fy + 28, 18, 6, 0, 0, 7); ctx.fill();
      ctx.drawImage(sp, h.x - sp.lw / 2, fy - 6 + Math.sin(t * 2.2 + h.x) * 1.3 + h.recoil * 3 - sp.lh / 2 + 4, sp.lw, sp.lh);
    }
    ctx.lineCap = 'round'; ctx.globalCompositeOperation = 'lighter';
    for (const s of shots) { ctx.globalAlpha = s.life / 0.16; ctx.strokeStyle = '#ffe9a0'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(s.x1, s.y1); ctx.lineTo(s.x2, s.y2); ctx.stroke(); }
    for (const p of parts) { ctx.globalAlpha = Math.max(0, p.life / p.max); ctx.fillStyle = p.col; ctx.fillRect(p.x - 1.2, p.y - 1.2, 2.4, 2.4); }
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  // ------------------------------------------------------------------ loop
  function draw(dt) {
    if (!resize()) return;
    t += dt;
    const phase = Math.max(0, t) / WORLD_SECONDS, wi = Math.floor(phase) % 3, within = (phase % 1) * WORLD_SECONDS;
    const next = (wi + 1) % 3, fading = within > WORLD_SECONDS - FADE;
    const a = fading ? (within - (WORLD_SECONDS - FADE)) / FADE : 0;
    // Tell the page which sky colour is at the top of the screen so the status-bar strip can match it.
    const topNow = SKY[fading && a > 0 ? next : wi].top;
    if (topNow !== lastTop) { lastTop = topNow; if (opts.onTop) opts.onTop(topNow); }
    drawWorld(wi, 1, t);
    if (fading) drawWorld(next, a, t);
    stepActors(dt, fading && a > 0.5 ? next : wi);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    drawActors(wi);
  }
  function frame(now) {
    if (stopped) return;
    raf = requestAnimationFrame(frame);
    // The first rAF timestamp can precede `last`; never let time run backwards.
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
    draw(dt);
  }

  if (opts.animate === false) { // reduced motion: warm up a few seconds of action, then hold one still frame
    raf = requestAnimationFrame(() => { for (let i = 0; i < 90; i++) draw(1 / 30); });
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }
  raf = requestAnimationFrame(frame);
  return () => { stopped = true; cancelAnimationFrame(raf); };
}

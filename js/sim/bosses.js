// World boss behavior (GDD 6 / 11.2): telegraphed attacks, distinct phases, vulnerability windows.
// Boss entities are ordinary enemies with an `e.boss` state machine attached.

import { BOSSES, TUNE } from '../data/enemies.js';
import { W } from './game.js';
import { clamp, lerp } from '../util.js';

export function spawnBoss(g, id) {
  const def = BOSSES[id];
  const sc = g.scale();
  const pseudo = {
    id, names: [def.name, def.name, def.name], hp: def.hp, speed: def.speed, r: def.r, wallDps: 0, coins: def.coins,
    armor: def.armor, shield: 0, behavior: 'boss', tags: ['boss'],
  };
  const e = g.spawnEnemy(pseudo, W / 2, { y: -def.r * 1.3 });
  e.gated = false; // bosses manage their own targetability (see updateBoss)
  e.hp = e.max = def.hp * (1 + (sc.hp - 1) * TUNE.bossHp);
  e.armor = def.armor;
  e.world = def.world;
  e.boss = { def, phase: 0, mode: 'enter', t: 0, cycle: 0, atk: null, exposed: 0, invuln: 0, pendingShift: false, hadShield: false, label: '' };
  g.boss = e;
  g.ev('bossWarn', { name: def.name, id });
  return e;
}

export function bossDamageHook(g, e, dmg) {
  const b = e.boss;
  if (b.invuln > 0 || b.mode === 'enter') return 0;
  if (b.exposed > 0) dmg *= 1.5;
  const next = b.def.phases[b.phase + 1];
  if (next) {
    const room = e.shield + (e.hp - next.at * e.max);
    if (dmg >= room) { dmg = Math.max(0, room); b.pendingShift = true; }
  }
  return dmg;
}

export function killAllMinions(g, boss) {
  g.spawnQ.length = 0;
  for (const o of g.enemies) if (!o.dead && o !== boss) { o.noSplit = true; g.killEnemy(o); }
  for (const b of g.ebullets.items) b.dead = true;
  g.telegraphs.length = 0;
  g.beamHazard = null;
  g.boss = null;
}

const phaseOf = (e) => e.boss.def.phases[e.boss.phase];

export function updateBoss(g, e, dt) {
  const b = e.boss;
  const def = b.def;
  const ph = phaseOf(e);
  e.untargetable = b.invuln > 0 || b.mode === 'enter';
  if (b.invuln > 0) b.invuln -= dt;
  if (b.exposed > 0) { b.exposed -= dt; e.armor = 0; } else e.armor = def.armor;
  if (b.hadShield && e.shield <= 0) { b.hadShield = false; b.exposed = 3.5; g.ev('shieldBreak', { x: e.x, y: e.y }); }
  e.vx = 0; e.vy = 0;

  if (b.mode === 'enter') {
    e.y += 60 * dt; e.vy = 60;
    if (e.y >= def.holdY) { e.y = def.holdY; b.mode = 'idle'; b.t = 1.4; }
    return;
  }
  e.x = clamp(W / 2 + Math.sin(e.t * 0.5) * 64, def.r, W - def.r);
  updateBeamHazard(g, e, dt);

  if (b.pendingShift && b.mode !== 'shift') { startShift(g, e); return; }

  if (b.mode === 'shift') {
    b.t -= dt;
    if (b.t <= 0) { b.mode = 'idle'; b.t = 0.6; }
    return;
  }
  if (b.mode === 'idle') {
    b.t -= dt;
    if (b.t <= 0) {
      const name = ph.cycle[b.cycle % ph.cycle.length];
      b.cycle++;
      b.atk = { name, t: 0, step: 0 };
      b.mode = 'atk';
      beginAttack(g, e, b.atk, ph.tempo);
      g.ev('bossAttack', { name, x: e.x, y: e.y });
    }
    return;
  }
  if (b.mode === 'atk') {
    b.atk.t += dt;
    if (tickAttack(g, e, b.atk, ph.tempo)) { b.mode = 'idle'; b.t = 0.5 * ph.tempo; b.atk = null; }
  }
}

function startShift(g, e) {
  const b = e.boss;
  b.pendingShift = false;
  b.phase++;
  b.mode = 'shift';
  b.t = 2.4;
  b.invuln = 2.4;
  b.cycle = 0;
  b.atk = null;
  b.exposed = 0;
  for (const bl of g.ebullets.items) bl.dead = true;
  g.telegraphs.length = 0;
  g.beamHazard = null;
  g.ev('phase', { phase: b.phase, x: e.x, y: e.y });
  // The boss calls for help while it transforms.
  summonAdds(g, e);
}

function summonAdds(g, e) {
  for (const [type, n] of e.boss.def.summon) {
    for (let k = 0; k < n; k++) g.spawnEnemy(type, clamp(e.x + g.rng.range(-90, 90), 20, W - 20), { y: e.y + e.r * 0.6 });
  }
}

function updateBeamHazard(g, e, dt) {
  const bh = g.beamHazard;
  if (!bh) return;
  bh.t += dt;
  const p = clamp(bh.t / bh.dur, 0, 1);
  bh.x = lerp(bh.from, bh.to, p);
  g.damageBase(bh.dps * dt);
  for (const h of g.heroes) if (Math.abs(h.x - bh.x) < 26) h.disabled = Math.max(h.disabled, 0.35);
  if (bh.t >= bh.dur) g.beamHazard = null;
}

function beginAttack(g, e, a, tempo) {
  const R = g.rng;
  const ph = e.boss.phase;
  switch (a.name) {
    case 'volley':
      g.telegraphs.push({ kind: 'fan', x: e.x, y: e.y + e.r, t: 1.0 * tempo, dur: 1.0 * tempo });
      break;
    case 'bombs': {
      const n = 2 + ph;
      a.xs = [];
      const slot = (W - 80) / n;
      for (let i = 0; i < n; i++) a.xs.push(40 + slot * i + R.range(0, slot));
      for (const x of a.xs) g.telegraphs.push({ kind: 'circle', x, y: g.wallY, r: 34, t: 3.4, dur: 3.4 });
      break;
    }
    case 'summon':
      g.telegraphs.push({ kind: 'ring', x: e.x, y: e.y, r: e.r + 20, t: 0.8, dur: 0.8 });
      break;
    case 'sweep': {
      const left = R.chance(0.5);
      a.from = left ? 30 : W - 30; a.to = left ? W - 30 : 30;
      g.telegraphs.push({ kind: 'line', x: e.x, y: e.y + e.r, x2: a.from, y2: g.wallY + 20, t: 1.4 * tempo, dur: 1.4 * tempo });
      break;
    }
    case 'spit':
      g.telegraphs.push({ kind: 'ring', x: e.x, y: e.y, r: e.r + 16, t: 0.9, dur: 0.9 });
      break;
    case 'shieldup':
    case 'rest':
      break;
  }
}

/** Returns true when the attack is finished. */
function tickAttack(g, e, a, tempo) {
  const sc = e.dmg;
  const R = g.rng;
  const ph = e.boss.phase;
  switch (a.name) {
    case 'volley': {
      if (a.step === 0 && a.t >= 1.0 * tempo) {
        a.step = 1;
        const n = 5 + ph * 2;
        for (let i = 0; i < n; i++) {
          const ang = Math.PI / 2 + (i - (n - 1) / 2) * 0.17;
          g.spawnEnemyBullet(e.x, e.y + e.r, Math.cos(ang) * 135, Math.sin(ang) * 135, 6 * sc, 6, 1, 'spit');
        }
        g.ev('bossFire', { x: e.x, y: e.y + e.r });
      }
      return a.t >= 1.7 * tempo;
    }
    case 'bombs': {
      if (a.step === 0 && a.t >= 1.2 * tempo) {
        a.step = 1;
        for (const x of a.xs) {
          const dx = x - e.x, dy = g.wallY - (e.y + e.r);
          const d = Math.hypot(dx, dy);
          g.spawnEnemyBullet(e.x, e.y + e.r, (dx / d) * 80, (dy / d) * 80, 22 * sc, 14, 3, 'bomb');
        }
        g.ev('bossFire', { x: e.x, y: e.y + e.r });
      }
      return a.t >= 2.0 * tempo;
    }
    case 'summon':
      if (a.step === 0 && a.t >= 0.8) { a.step = 1; summonAdds(g, e); g.ev('bossSummon', { x: e.x, y: e.y }); }
      return a.t >= 1.5;
    case 'sweep': {
      if (a.step === 0 && a.t >= 1.4 * tempo) {
        a.step = 1;
        g.beamHazard = { from: a.from, to: a.to, x: a.from, t: 0, dur: 2.4 * tempo, dps: 18 * sc, bx: e.x, by: e.y + e.r };
        g.ev('bossBeam', {});
      }
      if (g.beamHazard) { g.beamHazard.bx = e.x; g.beamHazard.by = e.y + e.r; }
      return a.t >= (1.4 + 2.4) * tempo + 0.4;
    }
    case 'spit': {
      const bursts = [0.9, 1.4, 1.9];
      if (a.step < 3 && a.t >= bursts[a.step] * tempo) {
        a.step++;
        const n = 11;
        for (let i = 0; i < n; i++) {
          const ang = Math.PI * 0.12 + (i / (n - 1)) * Math.PI * 0.76 + (a.step % 2 ? 0.05 : -0.05);
          g.spawnEnemyBullet(e.x, e.y + e.r * 0.6, Math.cos(ang) * 108, Math.sin(ang) * 108, 4 * sc, 5, 1, 'spit');
        }
        g.ev('bossFire', { x: e.x, y: e.y });
      }
      return a.t >= 2.5 * tempo;
    }
    case 'shieldup':
      if (a.step === 0 && a.t >= 0.5) {
        a.step = 1;
        e.shield = e.max * 0.12; e.shieldMax = e.shield;
        e.boss.hadShield = true;
        g.ev('bossShield', { x: e.x, y: e.y });
      }
      return a.t >= 1.1;
    case 'rest':
      if (a.step === 0) { a.step = 1; e.boss.exposed = 4.2 * tempo; g.ev('bossExposed', { x: e.x, y: e.y }); }
      return a.t >= 4.2 * tempo;
  }
  return true;
}

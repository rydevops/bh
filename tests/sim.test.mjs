import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/sim/game.js';
import { STAGE_BY_ID } from '../js/data/stages.js';
import { computeDamage, resistMult, absorb } from '../js/sim/damage.js';
import { UPGRADES, modsFromUpgrades, rollUpgrades, defaultMods } from '../js/data/upgrades.js';
import { RNG } from '../js/util.js';
import { playRun, expectedSquad } from '../tools/balance.mjs';

const LAYOUT = { H: 680, wallY: 470, heroY: 524 };
const squad = (...ids) => ids.map((id) => ({ id, lv: 1, rank: 1, skin: 'default' }));
const mk = (ids = ['vanguard', 'rook', 'patch'], extra = {}) =>
  new Game({ stage: STAGE_BY_ID['1-1'], squad: squad(...ids), seed: 7, layout: LAYOUT, emit: false, ...extra });
const step = (g, secs) => { for (let i = 0; i < secs * 60; i++) { if (g.state === 'upgrade') return; g.update(1 / 60); } };
const clearField = (g) => { g.spawnQ.length = 0; g.enemies.length = 0; };

test('damage formula: Attack x Skill x Crit x Resistance', () => {
  assert.equal(computeDamage({ attack: 10, skill: 1.5, crit: false, critMult: 2, resist: 0.5 }), 7.5);
  assert.equal(computeDamage({ attack: 10, skill: 1.5, crit: true, critMult: 2, resist: 0.5 }), 15);
});

test('armor and armor-piercing resistance', () => {
  const e = { armor: 0.5, aura: 0 };
  assert.equal(resistMult(e, 0), 0.5);
  assert.ok(Math.abs(resistMult(e, 0.3) - 0.8) < 1e-9);
  assert.equal(resistMult({ armor: 0.5, aura: 0.4 }, 0), 0.5 * 0.6);
});

test('shield absorbs before health', () => {
  const e = { shield: 30, hp: 100 };
  const r = absorb(e, 50);
  assert.deepEqual(r, { shield: 30, hp: 20 });
  assert.equal(e.hp, 80);
});

test('simulation is deterministic for a given seed', () => {
  const run = () => { const g = playRun({ stage: STAGE_BY_ID['1-2'], squad: expectedSquad(1, ['vanguard', 'rook', 'patch']), seed: 3, cutSkill: 0 }); return [g.state, g.stats.kills, Math.round(g.t * 100)]; };
  assert.deepEqual(run(), run());
});

test('a stage can be won start to finish and produces a result', () => {
  const g = playRun({ stage: STAGE_BY_ID['1-1'], squad: expectedSquad(0, ['vanguard', 'rook', 'patch']), seed: 1 });
  assert.equal(g.state, 'victory');
  const r = g.result();
  assert.equal(r.win, true);
  assert.ok(r.kills > 10 && r.coinsEarned > 0);
});

test('targeting prioritises the enemy closest to the wall and stays stable', () => {
  const g = mk(['vanguard']);
  clearField(g);
  const far = g.spawnEnemy('grunt', 180, { y: 200 });
  const near = g.spawnEnemy('grunt', 190, { y: 330 });
  const h = g.heroes[0];
  assert.equal(g.acquire(h), near);
  h.tgt = far; // hysteresis should not override a clearly closer threat
  assert.equal(g.acquire(h), near);
});

test('an enemy dying while several heroes target it causes clean retargeting', () => {
  const g = mk(['vanguard', 'rook', 'pulse']);
  clearField(g);
  g.spawnEnemy('grunt', 180, { y: 300 });
  const other = g.spawnEnemy('grunt', 120, { y: 280 });
  step(g, 0.5);
  const dying = g.enemies[0];
  for (const h of g.heroes) h.tgt = dying;
  g.killEnemy(dying);
  g.enemies = g.enemies.filter((e) => !e.dead);
  step(g, 0.5);
  for (const h of g.heroes) assert.ok(h.tgt === null || !h.tgt.dead);
  assert.ok(other.hp < other.max || other.dead, 'remaining enemy is being engaged');
  for (const e of g.enemies) assert.ok(e.pend >= 0);
});

test('a piercing projectile applies different resistances to different enemies', () => {
  const g = mk(['specter']);
  clearField(g);
  const soft = g.spawnEnemy('grunt', 180, { y: 400 });
  const armored = g.spawnEnemy('bulwark', 180, { y: 360 });
  soft.hp = soft.max = armored.hp = armored.max = 1e6;
  const dealtSoft = g.hit(null, soft, 100, { crit: false, critMult: 1, armorPierce: 0 });
  const dealtArm = g.hit(null, armored, 100, { crit: false, critMult: 1, armorPierce: 0 });
  assert.ok(Math.abs(dealtArm - dealtSoft * 0.5) < 1e-6);
  const ap = g.hit(null, armored, 100, { crit: false, critMult: 1, armorPierce: 0.3 });
  assert.ok(ap > dealtArm);
});

test('boss phase shifts while taking damage: no overkill past the threshold, brief invulnerability, adds', () => {
  const g = new Game({ stage: STAGE_BY_ID['1-4'], squad: squad('vanguard', 'rook', 'patch'), seed: 2, layout: LAYOUT, emit: false });
  g.startWave(3);
  step(g, 2.5);
  const boss = g.boss;
  assert.ok(boss, 'boss spawned');
  for (let i = 0; i < 20 && boss.boss.mode === 'enter'; i++) step(g, 1);
  const thresh = boss.boss.def.phases[1].at * boss.max;
  boss.boss.exposed = 0;
  g.hurt(boss, boss.max * 0.9); // would cross 66%
  assert.ok(boss.hp >= thresh - 1e-6, 'clamped at phase threshold');
  step(g, 0.05);
  assert.equal(boss.boss.phase, 1);
  assert.ok(boss.boss.invuln > 0);
  const hpBefore = boss.hp;
  assert.equal(g.hurt(boss, 500), 0, 'invulnerable during transformation');
  assert.equal(boss.hp, hpBefore);
  assert.ok(g.enemies.length > 1, 'summoned adds');
});

test('boss kill ends the stage in victory', () => {
  const g = new Game({ stage: STAGE_BY_ID['1-4'], squad: squad('vanguard', 'rook', 'patch'), seed: 2, layout: LAYOUT, emit: false });
  g.startWave(3);
  step(g, 2.5);
  const boss = g.boss;
  for (let i = 0; i < 6 && boss.boss.mode === 'enter'; i++) step(g, 1);
  for (let k = 0; k < 3; k++) { boss.boss.invuln = 0; boss.boss.exposed = 5; g.hurt(boss, boss.max); step(g, 3); }
  step(g, 0.5);
  assert.equal(g.state, 'victory');
  assert.equal(g.stats.bosses, 1);
});

test('bullet cutting severs projectiles, bombs need multiple cuts, energy is spent', () => {
  const g = mk();
  clearField(g);
  g.spawnEnemyBullet(100, 200, 0, 50, 5, 5, 1, 'spit');
  g.spawnEnemyBullet(200, 200, 0, 50, 20, 14, 3, 'bomb');
  const e0 = g.cut.energy;
  assert.equal(g.cutSegment(80, 200, 120, 200), 1);
  assert.ok(g.cut.energy < e0);
  assert.equal(g.cutSegment(180, 200, 220, 200), 0, 'bomb survives first cut');
  g.ebullets.items.find((b) => b.kind === 'bomb').cutCd = 0;
  g.cutSegment(180, 200, 220, 200);
  g.ebullets.items.find((b) => b.kind === 'bomb').cutCd = 0;
  assert.equal(g.cutSegment(180, 200, 220, 200), 1, 'third cut destroys the bomb');
  assert.equal(g.stats.cuts, 2);
});

test('enemy bullets that reach the wall damage it; barrier absorbs first', () => {
  const g = mk();
  clearField(g);
  const hp0 = g.base.hp;
  g.base.barrier.hp = 20; g.base.barrier.t = 5;
  g.spawnEnemyBullet(180, g.wallY - 1, 0, 100, 15, 5, 1, 'spit');
  step(g, 0.1);
  assert.equal(g.base.hp, hp0, 'fully absorbed');
  assert.equal(g.base.barrier.hp, 5);
});

test('upgrades produce their documented effects', () => {
  const m = modsFromUpgrades({ heavy_rounds: 2, quick_trigger: 3, phase_rounds: 1, energy_shield: 2 });
  assert.ok(Math.abs(m.dmg - 0.36) < 1e-9);
  assert.ok(Math.abs(m.rate - 0.3) < 1e-9);
  assert.equal(m.pierce, 1);
  assert.ok(Math.abs(m.reduce - 0.16) < 1e-9);
  const g = mk();
  clearField(g);
  g.state = 'upgrade'; g.choices = ['reinforced_wall'];
  const max0 = g.base.max;
  g.pickUpgrade('reinforced_wall');
  assert.ok(g.base.max > max0 * 1.19);
  assert.equal(g.stats.upgrades, 1);
});

test('upgrade rolls: three distinct, respect caps and prerequisites', () => {
  const rng = new RNG(5);
  for (let i = 0; i < 200; i++) {
    const owned = i % 2 ? { heavy_rounds: 6, quick_trigger: 5 } : {};
    const picks = rollUpgrades(rng, { owned, squadTags: new Set(['rapid']), enemyTags: new Set(['armored']), wave: i % 6, baseFrac: 0.7 });
    assert.equal(picks.length, 3);
    assert.equal(new Set(picks).size, 3);
    for (const id of picks) {
      assert.ok((owned[id] || 0) < UPGRADES[id].max);
      if (id.startsWith('turret_')) assert.fail('turret upgrades offered without a turret');
    }
  }
});

test('dense combat: hundreds of enemies and bullets stay stable and fast', () => {
  const g = mk(['vanguard', 'rook', 'pulse', 'ember']);
  clearField(g);
  for (let i = 0; i < 250; i++) g.spawnEnemy('slimeling', 10 + (i * 37) % 340, { y: 20 + (i % 25) * 15 });
  for (let i = 0; i < 150; i++) g.spawnEnemyBullet(20 + (i * 13) % 320, 100 + (i % 10) * 20, 0, 40, 1, 4, 1, 'spit');
  const t0 = performance.now();
  step(g, 8);
  const per = (performance.now() - t0) / (8 * 60);
  assert.ok(per < 8, `tick took ${per.toFixed(2)}ms`);
  for (const b of g.bullets.items) assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y));
  assert.ok(g.bullets.items.length < 600, 'bullets are pooled/bounded');
});

test('checkpoint snapshot restores upgrades and wall health', () => {
  const g = mk();
  g.state = 'upgrade'; g.choices = ['heavy_rounds'];
  let snap = null;
  g.emit = true;
  g.pickUpgrade('heavy_rounds');
  for (const e of g.events) if (e.type === 'checkpoint') snap = e.snap;
  assert.ok(snap && snap.owned.heavy_rounds === 1 && snap.wave === 1);
  const g2 = new Game({ stage: STAGE_BY_ID['1-1'], squad: squad('vanguard', 'rook', 'patch'), seed: 1, layout: LAYOUT, emit: false, resume: snap });
  assert.equal(g2.owned.heavy_rounds, 1);
  assert.equal(g2.waveIdx, 1);
  assert.ok(Math.abs(g2.mods.dmg - 0.18) < 1e-9);
});

test('every hero ability can be used and has a cooldown', () => {
  for (const id of ['vanguard', 'rook', 'pulse', 'patch', 'specter', 'ember']) {
    const g = mk([id]);
    g.startWave(0);
    for (let i = 0; i < 30; i++) g.spawnEnemy('grunt', 100 + i * 5, { y: 200 + (i % 5) * 20 });
    g.heroes[0].ab.cd = 0;
    assert.ok(g.useAbility(0), id + ' ability fires');
    assert.ok(g.heroes[0].ab.cd > 0);
    step(g, 4);
    assert.ok(Number.isFinite(g.base.hp));
  }
});

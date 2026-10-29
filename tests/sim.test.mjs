import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/sim/game.js';
import { STAGE_BY_ID, STAGES, WAVES_PER_STAGE, buildWaves, waveCurve } from '../js/data/stages.js';
import { computeDamage, resistMult, absorb } from '../js/sim/damage.js';
import { UPGRADES, modsFromUpgrades, rollUpgrades, defaultMods } from '../js/data/upgrades.js';
import { RNG } from '../js/util.js';
import { playRun, expectedSquad } from '../tools/balance.mjs';
import { ENEMIES } from '../js/data/enemies.js';
const ENEMY_HP = Object.fromEntries(Object.entries(ENEMIES).map(([k, v]) => [k, v.hp]));

const LAYOUT = { H: 680, wallY: 470, heroY: 524 };
const squad = (...ids) => ids.map((id) => ({ id, lv: 1, rank: 1, skin: 'default' }));
// Most tests want the whole squad on the field; the summon tests below use the real default (lead hero only).
const mk = (ids = ['vanguard', 'rook', 'patch'], extra = {}) =>
  new Game({ stage: STAGE_BY_ID['1-1'], squad: squad(...ids), seed: 7, layout: LAYOUT, emit: false, deploy: 'all', ...extra });
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
  const g = new Game({ stage: STAGE_BY_ID['1-4'], squad: squad('vanguard', 'rook', 'patch'), seed: 2, layout: LAYOUT, emit: false, deploy: 'all' });
  g.startWave(11);
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
  const g = new Game({ stage: STAGE_BY_ID['1-4'], squad: squad('vanguard', 'rook', 'patch'), seed: 2, layout: LAYOUT, emit: false, deploy: 'all' });
  g.startWave(11);
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
  const m = modsFromUpgrades({ heavy_rounds: 2, quick_reload: 2, phase_rounds: 1, energy_shield: 2 });
  assert.ok(Math.abs(m.dmg - 0.36) < 1e-9);
  assert.ok(Math.abs(m.reload - 0.4) < 1e-9);
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
    const owned = i % 2 ? { heavy_rounds: 6, quick_reload: 2 } : {};
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

// ---------------------------------------------------------------- summoning (one hero per battle, rest are random rewards)
const fresh = (ids = ['vanguard', 'rook', 'patch'], extra = {}) =>
  new Game({ stage: STAGE_BY_ID['1-1'], squad: squad(...ids), seed: 11, layout: LAYOUT, emit: false, ...extra });
/** Clear the field so the wave ends and the reward round opens. */
const checkpoint = (g) => { g.spawnQ.length = 0; g.enemies.length = 0; step(g, 0.2); assert.equal(g.state, 'upgrade'); };

test('a battle starts with only the lead hero; the rest wait in reserve', () => {
  const g = fresh();
  assert.deepEqual(g.heroes.map((h) => h.id), ['vanguard']);
  assert.deepEqual(g.reserve.map((h) => h.id), ['rook', 'patch']);
  assert.equal(g.heroes[0].tx, 180, 'lone hero is centred');
  assert.equal(g.useAbility(1), false, 'reserve heroes cannot act');
});

test('hero rewards are random, but never two reward rounds in a row without one', () => {
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const g = fresh(['vanguard', 'rook', 'patch', 'pulse'], { seed });
    let misses = 0, offers = 0, sawMiss = false;
    for (let i = 0; i < 12 && g.reserve.length; i++) {
      checkpoint(g);
      const offered = g.choices[0].startsWith('summon:');
      if (offered) { offers++; misses = 0; assert.equal(g.choices[0], 'summon:' + g.reserve[0].id, 'next hero in squad order'); g.pickUpgrade(g.choices[0]); }
      else { misses++; sawMiss = true; g.pickUpgrade(g.choices[0]); }
      assert.ok(misses <= 1, `seed ${seed}: two reward rounds in a row without a hero`);
    }
    assert.equal(g.reserve.length, 0, `seed ${seed}: squad assembled within 12 rounds`);
    assert.ok(g.heroes.length === 4 && offers === 3);
  }
});

test('hero timing really is random: different seeds assemble the squad on different rounds', () => {
  const when = new Set();
  for (let seed = 1; seed <= 12; seed++) {
    const g = fresh(['vanguard', 'rook'], { seed });
    let n = 0;
    while (g.reserve.length && n < 5) { checkpoint(g); n++; if (g.choices[0].startsWith('summon:')) g.pickUpgrade(g.choices[0]); else g.pickUpgrade(g.choices[0]); }
    when.add(n);
  }
  assert.ok(when.has(1) && when.has(2), 'sometimes the first reward round has the hero, sometimes the second: ' + [...when]);
});

test('rerolling keeps an offered hero card; the card deploys the hero and re-centres the formation', () => {
  let g;
  for (let seed = 1; seed < 30; seed++) { g = fresh(['vanguard', 'rook', 'patch'], { seed }); checkpoint(g); if (g.choices[0].startsWith('summon:')) break; }
  assert.equal(g.choices[0], 'summon:rook');
  g.rerolls = 2; g.reroll();
  assert.equal(g.choices[0], 'summon:rook');
  assert.equal(g.choices.length, 3);
  assert.ok(g.pickUpgrade('summon:rook'));
  assert.deepEqual(g.heroes.map((h) => h.id), ['vanguard', 'rook']);
  assert.deepEqual(g.heroes.map((h) => h.tx), [120, 240]);
  assert.ok(g.hero(1).spawnT > 0 && g.hero(1).ab.cd > 0);
  assert.equal(g.state, 'combat');
  step(g, 1.5);
  assert.ok(Math.abs(g.heroes[0].x - 120) < 15, 'existing hero glides to the new formation');
});

test('summon state (and the pity counter) survives a checkpoint / resume', () => {
  let g, snap;
  for (let seed = 1; seed < 30 && !snap; seed++) {
    g = fresh(['vanguard', 'rook', 'patch'], { seed, emit: true }); checkpoint(g);
    if (!g.choices[0].startsWith('summon:')) continue;
    g.pickUpgrade('summon:rook');
    snap = g.events.filter((e) => e.type === 'checkpoint').pop().snap;
  }
  assert.deepEqual(snap.deployed, [0, 1]);
  assert.equal(snap.missed, 0);
  const g2 = new Game({ stage: STAGE_BY_ID['1-1'], squad: squad('vanguard', 'rook', 'patch'), seed: 1, layout: LAYOUT, emit: false, resume: snap });
  assert.deepEqual(g2.heroes.map((h) => h.id), ['vanguard', 'rook']);
  assert.deepEqual(g2.reserve.map((h) => h.id), ['patch']);
});

test('a single-hero squad never offers summons', () => {
  const g = fresh(['specter']);
  checkpoint(g);
  assert.ok(g.choices.every((c) => !c.startsWith('summon:')));
});

// ---------------------------------------------------------------- revolver ammo economy
const lone = (extra = {}) => {
  const g = fresh(['vanguard'], extra);
  g.spawnQ.length = 0; g.enemies.length = 0;
  // An inert, untargetable enemy far off-screen keeps the wave "running" so the sim doesn't stop for a reward round.
  const dummy = g.spawnEnemy('grunt', 10, { y: -500 }); dummy.speed = 0; dummy.hp = dummy.max = 1e12;
  return g;
};
const freezeHand = (g) => { g.ammo.rev = 1e9; g.ammo.revBase = 1e9; };
const target = (g, y = 250) => { const e = g.spawnEnemy('grunt', 180, { y }); e.hp = e.max = 1e12; e.speed = 0; return e; };

test('the revolver starts with one loaded chamber, a 1.2s sweep and a small pile', () => {
  const g = lone();
  assert.equal(g.ammo.unlocked, 1);
  assert.equal(g.ammo.pile, 6);
  assert.equal(g.ammo.rev, 1.2);
});

test('the slicer hand adds a bullet each time it passes a loaded chamber (one per sweep with one loaded)', () => {
  const g = lone();
  g.ammo.pile = 0;
  step(g, 6); // five sweeps
  assert.ok(g.ammo.pile >= 4 && g.ammo.pile <= 6, 'about 1 per sweep: ' + g.ammo.pile);
  step(g, 30);
  assert.equal(g.ammo.pile, g.ammo.cap, 'never overfills');
});

test('every loaded chamber the hand passes yields exactly one bullet per sweep, locked chambers none', () => {
  for (let k = 1; k <= 6; k++) {
    const g = lone();
    g.owned = { slicer_chambers: k - 1 }; g.recomputeMods(false);
    assert.equal(g.ammo.unlocked, k);
    g.ammo.pile = 0; g.ammo.cap = 1000;
    const slots = new Set();
    g.emit = true;
    step(g, 1.2 * 3);
    for (const e of g.events) if (e.type === 'slice') slots.add(e.slot);
    assert.ok(g.ammo.pile >= 3 * k - 1 && g.ammo.pile <= 3 * k + 1, `${k} loaded -> ~${3 * k} bullets in 3 sweeps, got ${g.ammo.pile}`);
    assert.equal(slots.size, k, 'only the loaded chambers fire');
    if (k === 2) assert.deepEqual([...slots].sort(), [0, 3], 'the second chamber sits opposite the first');
  }
});

test('each hero shot takes one bullet from the pile; a dry pile makes the hero wait for the slicer hand', () => {
  const g = lone(); target(g);
  g.ammo.pile = 3; freezeHand(g);
  g.heroes[0].cd = 0;
  step(g, 8); // three shots at 1.2s reload would take 3.6s
  assert.equal(g.ammo.pile, 0, 'three bullets spent');
  assert.equal(g.ammo.taken, 3);
  assert.ok(g.heroes[0].dry, 'hero is dry and waiting');
  const shots = g.heroes[0].shots;
  step(g, 2);
  assert.equal(g.heroes[0].shots, shots, 'no shots without ammo');
  g.ammo.pile = 2; // the revolver delivers
  step(g, 1);
  assert.ok(g.heroes[0].shots > shots, 'fires again once bullets arrive');
  assert.equal(g.heroes[0].dry, false);
});

test('slicer upgrades: 1 -> 6 loaded chambers, faster hand, deeper pile (capped)', () => {
  const g = lone();
  g.owned = { slicer_chambers: 5, quick_slicer: 3, deep_pile: 3 }; g.recomputeMods(false);
  assert.equal(g.ammo.unlocked, 6);
  assert.ok(g.ammo.rev < 1.2 * 0.6);
  assert.equal(g.ammo.cap, 12 + 24);
  g.owned = { slicer_chambers: 99 }; g.recomputeMods(false);
  assert.equal(g.ammo.unlocked, 6, 'hard cap of six');
});

test('multi-shot: default one bullet per shot, up to five via upgrades, each costing ammo', () => {
  const g = lone(); target(g, 260);
  g.heroes[0].cd = 0; freezeHand(g); g.ammo.pile = 20;
  step(g, 0.03);
  assert.equal(g.ammo.taken, 1, 'default: one bullet');
  const g2 = lone(); target(g2, 260);
  g2.owned = { extended_mag: 4 }; g2.recomputeMods(false);
  assert.equal(g2.mods.proj, 4);
  g2.heroes[0].cd = 0; freezeHand(g2); g2.ammo.pile = 20;
  step(g2, 0.03);
  assert.equal(g2.ammo.taken, 5, 'max: five bullets from one shot');
  const g3 = lone(); target(g3, 260);
  g3.owned = { extended_mag: 4 }; g3.recomputeMods(false);
  g3.heroes[0].cd = 0; freezeHand(g3); g3.ammo.pile = 2;
  step(g3, 0.03);
  assert.equal(g3.ammo.taken, 2, 'partial volley when the pile runs short');
});

test('cutting an enemy bullet recycles it onto the pile', () => {
  const g = lone(); freezeHand(g); g.ammo.pile = 2;
  g.spawnEnemyBullet(100, 200, 0, 50, 5, 5, 1, 'spit');
  g.spawnEnemyBullet(200, 200, 0, 50, 20, 14, 1, 'bomb');
  g.cutSegment(80, 200, 120, 200);
  assert.equal(g.ammo.pile, 3);
  g.cutSegment(180, 200, 220, 200);
  assert.equal(g.ammo.pile, 5, 'a bomb is worth two');
});

test('beam and flame heroes fire one burst per bullet, then reload; they idle when dry', () => {
  for (const id of ['pulse', 'ember']) {
    const g = fresh([id], { deploy: 'all' });
    g.spawnQ.length = 0; g.enemies.length = 0;
    const e = g.spawnEnemy('grunt', 180, { y: g.wallY - 90 }); e.hp = e.max = 1e12; e.speed = 0;
    g.ammo.pile = 2; freezeHand(g);
    g.heroes[0].cd = 0;
    step(g, 0.3);
    assert.equal(g.ammo.pile, 1, id + ': one bullet pulled at the start of the burst');
    assert.ok(g.heroes[0].burstT > 0 && e.hp < e.max, id + ' is bursting and damaging');
    step(g, 0.5); // 0.8s in: the burst (<=0.6s) is over but the reload (>=1.4s) is not
    e.burnT = 0; e.burnDps = 0; // Ember's burn keeps ticking for 3s after the flames stop: ignore it here
    const hp = e.hp;
    assert.ok(g.heroes[0].burstT <= 0 && g.heroes[0].cd > 0, id + ' is reloading');
    step(g, 0.3);
    assert.equal(e.hp, hp, id + ' deals nothing while reloading');
    step(g, 4);
    assert.equal(g.ammo.pile, 0, id + ' used the second bullet after the reload');
    step(g, 1.5); e.burnT = 0; e.burnDps = 0;
    const hp2 = e.hp;
    step(g, 3);
    assert.equal(e.hp, hp2, id + ' idles when dry');
    assert.ok(g.heroes[0].dry);
  }
});

test('burst heroes deal the same damage per second as before (volley x tick damage / reload)', async () => {
  const { heroDps } = await import('../js/progression.js');
  assert.ok(Math.abs(heroDps('pulse', 1, 1) - 52.5) < 4, 'pulse ~50 dps: ' + heroDps('pulse', 1, 1));
  assert.ok(Math.abs(heroDps('ember', 1, 1) - 42) < 5, 'ember ~40 dps: ' + heroDps('ember', 1, 1));
  assert.ok(Math.abs(heroDps('vanguard', 1, 1) - 52.5) < 4);
});

test('Overdrive loads bullets onto the pile', () => {
  const g = fresh(['vanguard'], { deploy: 'all' });
  g.ammo.pile = 0; freezeHand(g); g.heroes[0].ab.cd = 0;
  g.spawnEnemy('grunt', 180, { y: 250 });
  assert.ok(g.useAbility(0));
  assert.equal(g.ammo.pile, 6);
});

// ---------------------------------------------------------------- reload cooldowns
test('every hero has a reload: the next shot cannot come sooner (Vanguard 1.2s) and the bar data tracks it', () => {
  const g = lone(); target(g, 260);
  const h = g.heroes[0];
  g.ammo.pile = 50; freezeHand(g);
  h.cd = 0;
  step(g, 0.05);
  assert.equal(h.shots, 1);
  assert.ok(Math.abs(h.cdMax - 1.2) < 1e-9, 'bar length is the reload time');
  assert.ok(h.cd > 1.0 && h.cd <= 1.2);
  const t0 = g.t;
  let t1 = null;
  while (g.t - t0 < 3 && t1 === null) { g.update(1 / 60); if (h.shots === 2) t1 = g.t - t0; }
  assert.ok(Math.abs(t1 - 1.15) < 0.12, 'second shot ~1.2s after the first: ' + t1);
});

test('reload bar is stable: a ready hero stays at 0 cooldown (full bar) whether idle, out of ammo or a burst weapon', () => {
  // idle: nothing to shoot
  const g = lone(); const h = g.heroes[0];
  step(g, 1); // let the opening cooldown finish
  const seen = new Set();
  for (let i = 0; i < 240; i++) { g.update(1 / 60); seen.add(h.cd); }
  assert.deepEqual([...seen], [0], 'idle hero keeps cd at exactly 0 (bar stays full, no draining/refilling)');
  // out of ammo with a target in range
  const g2 = lone(); target(g2, 260); freezeHand(g2); g2.ammo.pile = 0;
  step(g2, 1);
  const seen2 = new Set();
  for (let i = 0; i < 240; i++) { g2.update(1 / 60); seen2.add(g2.heroes[0].cd); }
  assert.deepEqual([...seen2], [0], 'dry hero keeps cd at 0');
  assert.ok(g2.heroes[0].dry);
  // burst weapons, idle and dry
  for (const id of ['pulse', 'ember']) {
    const g3 = fresh([id], { deploy: 'all' });
    g3.spawnQ.length = 0; g3.enemies.length = 0;
    const d = g3.spawnEnemy('grunt', 10, { y: -500 }); d.speed = 0; d.hp = d.max = 1e12;
    step(g3, 1);
    const seen3 = new Set();
    for (let i = 0; i < 180; i++) { g3.update(1 / 60); seen3.add(g3.heroes[0].cd); }
    assert.deepEqual([...seen3], [0], id + ' idle cd stays 0');
  }
});

test('reload bar only ever fills between shots: the cooldown never goes UP except at the moment of firing', () => {
  const g = lone(); target(g, 260); freezeHand(g); g.ammo.pile = 50;
  const h = g.heroes[0];
  let prevCd = h.cd, prevShots = h.shots, jumps = 0, fills = 0;
  for (let i = 0; i < 60 * 8; i++) {
    g.update(1 / 60);
    if (h.shots === prevShots) assert.ok(h.cd <= prevCd + 1e-12, `cd rose without a shot (${prevCd} -> ${h.cd}) at frame ${i}`);
    else jumps++;
    if (h.cd < prevCd) fills++;
    prevCd = h.cd; prevShots = h.shots;
  }
  assert.ok(jumps >= 5 && fills > 100, `shots=${jumps}, filling frames=${fills}`);
});

test('Quick Reload: -20% reload per level, at most two levels (-40%)', () => {
  const g = lone(); const h = g.heroes[0];
  const base = g.reloadTime(h);
  assert.ok(Math.abs(base - 1.2) < 1e-9);
  g.owned = { quick_reload: 1 }; g.recomputeMods(false);
  assert.ok(Math.abs(g.reloadTime(h) - base * 0.8) < 1e-9);
  g.owned = { quick_reload: 2 }; g.recomputeMods(false);
  assert.ok(Math.abs(g.reloadTime(h) - base * 0.6) < 1e-9);
  assert.equal(UPGRADES.quick_reload.max, 2);
});

test('reload speed-ups stack with ability buffs and are reflected in the next bar length', () => {
  const g = lone(); const h = g.heroes[0];
  g.owned = { quick_reload: 2 }; g.recomputeMods(false);
  h.buff.rate = 2; h.buff.rateT = 5; // Overdrive doubles fire rate
  assert.ok(Math.abs(g.reloadTime(h) - 1.2 * 0.5 * 0.6) < 1e-9);
});

test('starved squads see more revolver upgrade cards', () => {
  const rng = (seed) => new RNG(seed);
  const count = (pressure) => {
    let n = 0;
    for (let i = 0; i < 300; i++) if (rollUpgrades(rng(i), { owned: {}, squadTags: new Set(['rapid']), enemyTags: new Set(), wave: 3, baseFrac: 1, ammoPressure: pressure }).includes('slicer_chambers')) n++;
    return n;
  };
  assert.ok(count(1) > count(0) * 2, `${count(1)} vs ${count(0)}`);
});

// ---------------------------------------------------------------- stage structure and difficulty curve
test('every stage has 12 rounds and the boss only appears in the last', () => {
  for (const st of STAGES) {
    const waves = buildWaves(st);
    assert.equal(waves.length, 12, st.id);
    assert.equal(WAVES_PER_STAGE, 12);
    waves.forEach((groups, k) => assert.equal(groups.some((x) => x.boss), !!st.boss && k === 11, `${st.id} wave ${k}`));
  }
});

test('difficulty rises smoothly: round pressure is monotonic and round enemy-hit-points grow within a stage', () => {
  for (let k = 1; k < 12; k++) assert.ok(waveCurve(k) > waveCurve(k - 1));
  assert.ok(waveCurve(11) / waveCurve(0) > 8, 'a real climb from the opening to the finale');
  const hpOf = (st, k) => buildWaves(st)[k].reduce((a, g) => a + (g.e ? g.n * ENEMY_HP[g.e] : 0), 0);
  for (const st of [STAGE_BY_ID['1-2'], STAGE_BY_ID['2-3'], STAGE_BY_ID['3-3']]) {
    let early = 0, late = 0;
    for (let k = 0; k < 4; k++) early += hpOf(st, k);
    for (let k = 8; k < 12; k++) late += hpOf(st, k);
    assert.ok(late > early * 3, `${st.id}: late rounds (${Math.round(late)}) should dwarf early rounds (${Math.round(early)})`);
  }
});

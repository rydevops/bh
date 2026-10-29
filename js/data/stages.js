// Data-driven campaign (GDD section 9). Designers configure stages here:
// spawn schedules (explicit `waves`, or generated from `pool`), modifiers, bosses, rewards.

import { ENEMIES, TUNE, statScale } from './enemies.js';
import { heroDps, expectedLevel, expectedRank } from '../progression.js';

export const WORLDS = [
  {
    id: 0, name: 'Wasteland', theme: 'Post-apocalyptic ruins', boss: 'colossus',
    blurb: 'Zombies and scavenger robots pick through the ruins.',
    bg: { top: '#27193a', mid: '#8c4a3c', bottom: '#2b2230', ground: '#3b2f33', accent: '#ffb347' },
  },
  {
    id: 1, name: 'Orbital Frontier', theme: 'Space stations and alien terrain', boss: 'leviathan',
    blurb: 'Drones, shields and alien swarms on a broken station.',
    bg: { top: '#050816', mid: '#16295c', bottom: '#0b1330', ground: '#1c2548', accent: '#4cf0ff' },
  },
  {
    id: 2, name: 'Monster Realm', theme: 'Unusual organic environments', boss: 'broodmother',
    blurb: 'Slimes, mutants and splitting horrors from living caves.',
    bg: { top: '#1b0f2e', mid: '#43256b', bottom: '#102a24', ground: '#1d3b30', accent: '#9bff6b' },
  },
];

/** Every stage is 12 rounds long. */
export const WAVES_PER_STAGE = 12;

/**
 * Round difficulty across a stage, as a multiple of what ONE expected hero can kill in the round's time window:
 * a gentle opening for the lone starting hero, then a steady climb as reinforcements and upgrades arrive. Hero reinforcements arrive randomly but never more
 * than one checkpoint apart, so the curve never outruns the squad for long.
 */
export const waveCurve = (k) => {
  const x = k / (WAVES_PER_STAGE - 1);
  const [a, b, c] = TUNE.curve;
  return a + b * x + c * x * x;
};

// pool entries: e = enemy id, from = first *intro tier* it appears in (scaled onto the 12 rounds), w = relative share.
const STAGE_DEFS = [
  // ---- World 1 ----
  { id: '1-1', name: 'Dusty Outskirts', world: 0, waveCount: WAVES_PER_STAGE, pool: [{ e: 'grunt', from: 0, w: 1 }],
    coins: 40, gems: 5, frag: [{ hero: 'pulse', n: 3 }] },
  { id: '1-2', name: 'Broken Highway', world: 0, waveCount: WAVES_PER_STAGE, pool: [{ e: 'grunt', from: 0, w: 3 }, { e: 'runner', from: 1, w: 2 }],
    coins: 60, gems: 6, frag: [{ hero: 'pulse', n: 4 }] },
  { id: '1-3', name: 'Scrapyard Siege', world: 0, waveCount: WAVES_PER_STAGE, mod: 'swift',
    pool: [{ e: 'grunt', from: 0, w: 3 }, { e: 'runner', from: 0, w: 2 }, { e: 'bulwark', from: 1, w: 2 }],
    coins: 85, gems: 7, frag: [{ hero: 'pulse', n: 4 }, { hero: 'specter', n: 2 }] },
  { id: '1-4', name: 'The Siege Colossus', world: 0, waveCount: WAVES_PER_STAGE, boss: 'colossus',
    pool: [{ e: 'grunt', from: 0, w: 3 }, { e: 'runner', from: 0, w: 2 }, { e: 'bulwark', from: 2, w: 1 }],
    coins: 140, gems: 15, tokens: 3, frag: [{ hero: 'specter', n: 6 }, { hero: 'rook', n: 3 }] },

  // ---- World 2 ----
  { id: '2-1', name: 'Docking Ring', world: 1, waveCount: WAVES_PER_STAGE,
    pool: [{ e: 'grunt', from: 0, w: 3 }, { e: 'runner', from: 0, w: 2 }, { e: 'drone', from: 1, w: 2 }],
    coins: 110, gems: 8, frag: [{ hero: 'specter', n: 4 }, { hero: 'ember', n: 3 }, { hero: 'vanguard', n: 3 }] },
  { id: '2-2', name: 'Shield Array', world: 1, waveCount: WAVES_PER_STAGE, mod: 'hardened',
    pool: [{ e: 'grunt', from: 0, w: 2 }, { e: 'drone', from: 0, w: 2 }, { e: 'sentinel', from: 1, w: 2 }, { e: 'spitter', from: 2, w: 2 }],
    coins: 135, gems: 9, frag: [{ hero: 'ember', n: 4 }, { hero: 'patch', n: 3 }] },
  { id: '2-3', name: 'Alien Hive Deck', world: 1, waveCount: WAVES_PER_STAGE, mod: 'swarm',
    pool: [{ e: 'runner', from: 0, w: 3 }, { e: 'grunt', from: 0, w: 2 }, { e: 'bulwark', from: 1, w: 1 }, { e: 'drone', from: 2, w: 2 }, { e: 'sentinel', from: 3, w: 1 }],
    coins: 165, gems: 10, frag: [{ hero: 'ember', n: 5 }, { hero: 'specter', n: 4 }] },
  { id: '2-4', name: 'The Void Leviathan', world: 1, waveCount: WAVES_PER_STAGE, boss: 'leviathan',
    pool: [{ e: 'drone', from: 0, w: 3 }, { e: 'runner', from: 0, w: 2 }, { e: 'sentinel', from: 2, w: 1 }, { e: 'spitter', from: 1, w: 1 }],
    coins: 240, gems: 20, tokens: 3, frag: [{ hero: 'ember', n: 6 }, { hero: 'pulse', n: 4 }] },

  // ---- World 3 ----
  { id: '3-1', name: 'Slime Caverns', world: 2, waveCount: WAVES_PER_STAGE,
    pool: [{ e: 'grunt', from: 0, w: 3 }, { e: 'splitter', from: 0, w: 2 }, { e: 'slimeling', from: 2, w: 2 }, { e: 'spitter', from: 3, w: 1 }],
    coins: 195, gems: 10, frag: [{ hero: 'ember', n: 4 }, { hero: 'rook', n: 3 }] },
  { id: '3-2', name: 'Mutant Gardens', world: 2, waveCount: WAVES_PER_STAGE, mod: 'regen',
    pool: [{ e: 'splitter', from: 0, w: 3 }, { e: 'bulwark', from: 1, w: 2 }, { e: 'sentinel', from: 1, w: 1 }, { e: 'spitter', from: 1, w: 2 }, { e: 'runner', from: 2, w: 2 }],
    coins: 225, gems: 11, frag: [{ hero: 'specter', n: 5 }, { hero: 'vanguard', n: 4 }] },
  { id: '3-3', name: 'Pulsing Nest', world: 2, waveCount: WAVES_PER_STAGE, mod: 'swarm',
    pool: [{ e: 'slimeling', from: 0, w: 3 }, { e: 'splitter', from: 0, w: 2 }, { e: 'runner', from: 1, w: 2 }, { e: 'drone', from: 2, w: 2 }, { e: 'bulwark', from: 2, w: 1 }, { e: 'sentinel', from: 3, w: 1 }],
    coins: 260, gems: 12, frag: [{ hero: 'pulse', n: 5 }, { hero: 'patch', n: 4 }, { hero: 'ember', n: 3 }] },
  { id: '3-4', name: 'The Brood Mother', world: 2, waveCount: WAVES_PER_STAGE, boss: 'broodmother',
    pool: [{ e: 'splitter', from: 0, w: 2 }, { e: 'slimeling', from: 0, w: 3 }, { e: 'spitter', from: 1, w: 2 }, { e: 'bulwark', from: 2, w: 1 }],
    coins: 380, gems: 30, tokens: 4, frag: [{ hero: 'specter', n: 8 }, { hero: 'ember', n: 8 }] },
];

export const STAGES = STAGE_DEFS.map((s, idx) => {
  const enemyIds = new Set(s.pool.map((p) => p.e));
  const tags = new Set();
  for (const id of enemyIds) for (const t of ENEMIES[id].tags) tags.add(t);
  if (s.boss) tags.add('boss');
  return { ...s, idx, tags: [...tags], enemies: [...enemyIds] };
});

export const STAGE_BY_ID = Object.fromEntries(STAGES.map((s) => [s.id, s]));
export const stagesOfWorld = (w) => STAGES.filter((s) => s.world === w);

/** Recommended squad power per stage (tuned with tools/balance.mjs). */
export const recPower = (idx) => 1100 + 360 * idx;

/** Milestones (GDD 10.4): stage index that must be cleared. */
export const MILESTONES = {
  slot4: { stage: '2-2', label: 'Fourth squad slot' },
  survival: { stage: '2-4', label: 'Survival mode' },
  hard: { stage: '3-4', label: 'Hard difficulty' },
};

/** "Cost" in grunt-equivalents - heavier enemies appear in smaller numbers. */
// Effective durability relative to a grunt, counting armor, shields and what an enemy spawns when it dies.
const COST = { grunt: 1, runner: 0.8, bulwark: 9, sentinel: 4.5, spitter: 2, drone: 2.5, splitter: 4.5, slimeling: 0.5 };

/**
 * Build the spawn schedule for a stage. Returns an array of waves; each wave is a list of groups:
 *   { e: enemyId, n, every, at }   or   { boss: bossId, at }
 * A stage may supply `waves` explicitly instead - this generator is just the default authoring tool.
 */
export function buildWaves(stage, { hard = false } = {}) {
  if (stage.waves) return stage.waves;
  const out = [];
  const swarm = stage.mod === 'swarm' ? 1.3 : 1;
  for (let k = 0; k < stage.waveCount; k++) {
    const last = k === stage.waveCount - 1;
    const groups = [];
    const span = 10 + k * 1.2;
    // Budget in "plain grunts": the hit points a typical player's lone hero can chew through in `span` seconds,
    // scaled by the round curve, then divided by how tough this stage's enemies are. Counts therefore stay sane even
    // when enemy health scales steeply, and difficulty rises smoothly from round to round and stage to stage.
    const solo = heroDps('vanguard', expectedLevel(stage.idx), expectedRank(stage.idx));
    const hpMul = statScale(stage.idx, k, hard).hp * (stage.mod === 'swarm' ? 0.8 : 1);
    // Early stages ease in: with one-bullet-per-shot ammo, big waves of fragile enemies are ammo-limited, not damage-limited.
    const ease = 1 - TUNE.earlyEase * Math.max(0, 1 - stage.idx / 6);
    const pressure = TUNE.pressure * (1 + TUNE.pressureIdx * stage.idx) * ease;
    const budget = ((solo * span) / (ENEMIES.grunt.hp * hpMul)) * waveCurve(k) * pressure * swarm * (last && stage.boss ? 0.6 : 1);
    // Intro tiers 0..3 spread over the 12 rounds; the heaviest enemy (Bulwark) debuts two rounds later than its tier.
    const introAt = (p) => Math.round(p.from * 2.2) + (COST[p.e] >= 9 ? 2 : 0);
    const avail = stage.pool.filter((p) => introAt(p) <= k);
    const wsum = avail.reduce((a, p) => a + p.w, 0);
    avail.forEach((p, i) => {
      let n = Math.round((budget * p.w) / wsum / COST[p.e]);
      // A new enemy type debuts in small numbers (heavy types as a single unit so the round stays affordable).
      if (introAt(p) === k && introAt(p) > 0) n = Math.max(n, COST[p.e] <= 3 ? 2 : 1);
      if (n < 1) return;
      const at = i * 1.6;
      groups.push({ e: p.e, n, every: Math.max(0.3, (span - at) / n), at });
    });
    if (last && stage.boss) groups.push({ boss: stage.boss, at: 1.0 });
    out.push(groups);
  }
  return out;
}

/** Endless wave generator for Survival mode. */
export function survivalWave(n) {
  const pool = [
    { e: 'grunt', from: 0, w: 3 }, { e: 'runner', from: 1, w: 2 }, { e: 'bulwark', from: 2, w: 1.5 },
    { e: 'drone', from: 3, w: 2 }, { e: 'spitter', from: 3, w: 1.5 }, { e: 'splitter', from: 4, w: 2 },
    { e: 'sentinel', from: 5, w: 1.2 }, { e: 'slimeling', from: 6, w: 2 },
  ];
  const isBoss = n > 0 && n % 10 === 9;
  const budget = (9 + n * 2.2) * Math.min(1, 0.35 + 0.1 * n) * (isBoss ? 0.6 : 1);
  const avail = pool.filter((p) => p.from <= n);
  const wsum = avail.reduce((a, p) => a + p.w, 0);
  const span = Math.min(30, 12 + n * 0.6);
  const groups = [];
  avail.forEach((p, i) => {
    const c = Math.round((budget * p.w) / wsum / COST[p.e]);
    if (c < 1) return;
    const at = i * 1.4;
    groups.push({ e: p.e, n: c, every: Math.max(0.28, (span - at) / c), at });
  });
  if (isBoss) groups.push({ boss: ['colossus', 'leviathan', 'broodmother'][Math.floor(n / 10) % 3], at: 1.0 });
  return groups;
}

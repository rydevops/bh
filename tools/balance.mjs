// Headless balance bot: plays the real simulation with simple heuristics and reports win rates.
//   node tools/balance.mjs            -> table over all stages at the expected progression
//   node tools/balance.mjs 1-4 5      -> one stage, 5 seeds
import { Game } from '../js/sim/game.js';
import { TUNE } from '../js/data/enemies.js';
import { STAGES, STAGE_BY_ID } from '../js/data/stages.js';
import { HEROES, levelCap } from '../js/data/heroes.js';
import { UPGRADES } from '../js/data/upgrades.js';
import { squadPower, expectedLevel, expectedRank } from '../js/progression.js';

export function expectedSquad(stageIdx, ids) {
  // Rough "typical player" model (shared with the wave budget in js/data/stages.js).
  const lv = expectedLevel(stageIdx), rank = expectedRank(stageIdx);
  return ids.map((id) => ({ id, lv, rank, skin: 'default' }));
}

export function playRun({ stage, hard = false, squad, seed = 1, research = {}, cutSkill = 0.5, maxTime = 900, survival = false }) {
  const g = new Game({ stage: survival ? null : stage, hard, squad, seed, research, emit: false, autoAbility: true,
    layout: { H: 680, wallY: 470, heroY: 524 } });
  const dt = 1 / 60;
  let steps = 0;
  const rng = (() => { let s = seed * 9301 + 49297; return () => ((s = (s * 9301 + 49297) % 233280) / 233280); })();
  while (g.state !== 'victory' && g.state !== 'defeat' && g.t < maxTime) {
    if (g.state === 'upgrade') {
      // Prefer offense/defense by simple scoring.
      const score = (id) => {
        if (id.startsWith('summon:')) return 99; // a sensible player always takes the new hero
        if (id === 'slicer_chambers') return 50 + g.ammo.starve * 40; // ...and feeds the revolver when heroes are waiting on ammo
        if (id === 'quick_slicer' || id === 'deep_pile') return 4 + g.ammo.starve * 25 + rng();
        const u = UPGRADES[id];
        let s = rng();
        if (u.cat === 'defense' && g.base.hp / g.base.max < 0.6) s += 1.2;
        if (u.cat === 'ammo' || u.cat === 'skill') s += 0.4;
        if (id === 'aux_turret') s += 0.5;
        if (u.rarity === 'epic') s += 0.3;
        return s;
      };
      const pick = [...g.choices].sort((a, b) => score(b) - score(a))[0];
      g.pickUpgrade(pick);
      continue;
    }
    g.update(dt);
    steps++;
    if (g.enemies.length > (g.maxEn || 0)) g.maxEn = g.enemies.length;
    // Imperfect "player" cutting: sever bullets with probability proportional to skill.
    if (cutSkill > 0) {
      for (const b of g.ebullets.items) {
        if (!b.dead && b.y > 120 && rng() < cutSkill * 0.06) g.cutSegment(b.x - 14, b.y - 6, b.x + 14, b.y + 6);
      }
    }
    g.events.length = 0;
  }
  return g;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  if (process.env.TUNE) Object.assign(TUNE, JSON.parse(process.env.TUNE));
  const squadIds = (process.env.SQUAD || 'vanguard,rook,patch').split(',');
  const seeds = Number(args[1] || 6);
  const list = args[0] ? [STAGE_BY_ID[args[0]]] : STAGES;
  const levelOverride = process.env.LV ? Number(process.env.LV) : null;
  const lvMul = Number(process.env.LVMUL || 1);
  console.log('stage  power  win%  avgTime  avgBase%  waveFail');
  for (const stage of list) {
    let wins = 0, tsum = 0, bsum = 0, mx = 0;
    const fails = [];
    const sq = expectedSquad(stage.idx, squadIds).map((s) => (levelOverride ? { ...s, lv: levelOverride } : { ...s, lv: Math.max(1, Math.round(s.lv * lvMul)), rank: lvMul < 1 ? Math.max(1, s.rank - 1) : s.rank }));
    const profile = { heroes: Object.fromEntries(sq.map((s) => [s.id, s])), squad: squadIds };
    for (let sd = 1; sd <= seeds; sd++) {
      const g = playRun({ stage, squad: sq, seed: sd, hard: process.env.HARD === '1' });
      if (g.state === 'victory') wins++; else fails.push(g.waveIdx + 1);
      tsum += g.t; bsum += g.base.hp / g.base.max; mx = Math.max(mx, g.maxEn || 0);
    }
    console.log(
      stage.id.padEnd(6), String(squadPower(profile)).padStart(6), String(Math.round((wins / seeds) * 100)).padStart(5),
      String(Math.round(tsum / seeds)).padStart(7) + 's', String(Math.round((bsum / seeds) * 100)).padStart(8), 'max' + mx, fails.join(',')
    );
  }
}

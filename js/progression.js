// Hero stat derivation, power rating and unlock rules shared by UI and simulation.

import { HEROES, LEVEL_GROWTH, RANK_GROWTH, RANK_PERKS, levelCap } from './data/heroes.js';
import { researchBonuses } from './data/research.js';

export const levelMult = (lv) => 1 + LEVEL_GROWTH * (lv - 1);
export const rankMult = (rank) => 1 + RANK_GROWTH * (rank - 1);

/** Sum the generic perks a hero has earned by rank. */
export function rankBonuses(rank) {
  const b = { abilityPower: 0, cooldown: 0, passive: 0, dmg: 0, pierce: 0 };
  for (let r = 2; r <= rank; r++) for (const k in RANK_PERKS[r]) b[k] += RANK_PERKS[r][k];
  return b;
}

/** Attack power before in-run modifiers: the "Attack Power" term of the damage formula. */
export function attackPower(heroId, lv, rank) {
  const h = HEROES[heroId];
  return h.base.atk * levelMult(lv) * rankMult(rank) * (1 + rankBonuses(rank).dmg);
}

// Rough "effective targets / utility" weights so Power is comparable across roles.
const POWER_WEIGHT = { vanguard: 1.05, rook: 1.5, patch: 2.7, pulse: 1.45, specter: 1.45, ember: 1.35 };

export function heroDps(heroId, lv, rank) {
  const h = HEROES[heroId];
  const crit = 1 + h.base.crit * (h.base.critMult - 1);
  return (attackPower(heroId, lv, rank) * crit) / h.base.interval;
}

export function heroPower(heroId, lv, rank) {
  return Math.round(heroDps(heroId, lv, rank) * 10 * POWER_WEIGHT[heroId]);
}

export function squadPower(profile, ids = profile.squad) {
  return ids.reduce((s, id) => {
    const h = profile.heroes[id];
    return h ? s + heroPower(id, h.lv, h.rank) : s;
  }, 0);
}

/** Pre-battle strengths/weaknesses derived from hero tags (GDD 5.2). */
export function squadAnalysis(ids) {
  const tags = new Set();
  for (const id of ids) for (const t of HEROES[id].tags) tags.add(t);
  const checks = [
    { label: 'Single-target damage', ok: tags.has('single') || tags.has('rapid') },
    { label: 'Area damage', ok: tags.has('area') || tags.has('explosive') || tags.has('pierce') },
    { label: 'Armor-piercing', ok: tags.has('armor') || tags.has('sniper') },
    { label: 'Anti-shield', ok: tags.has('shield') || tags.has('energy') },
    { label: 'Wall defense', ok: tags.has('defense') || tags.has('support') },
    { label: 'Long range', ok: ids.some((id) => HEROES[id].base.range >= 440) },
  ];
  return { tags, checks, strengths: checks.filter((c) => c.ok).map((c) => c.label), gaps: checks.filter((c) => !c.ok).map((c) => c.label) };
}

export function slotCount(profile) {
  return profile.stages['2-2'] ? 4 : 3;
}

export { levelCap, researchBonuses };

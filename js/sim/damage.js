// Damage model (GDD 4.5):
//   Damage = Attack Power x Skill Multiplier x Critical Multiplier x Resistance Multiplier
// Shields are a separate layer that absorbs damage before health.

import { clamp } from '../util.js';

export function computeDamage({ attack, skill = 1, crit = false, critMult = 2, resist = 1 }) {
  return attack * skill * (crit ? critMult : 1) * resist;
}

/** Resistance multiplier from armor (reduced by armor-piercing) and any damage-reduction aura. */
export function resistMult(enemy, armorPierce = 0) {
  const armor = clamp(enemy.armor - armorPierce, 0, 0.85);
  let r = 1 - armor;
  if (enemy.aura > 0) r *= 1 - enemy.aura;
  return r;
}

/** Apply damage to an enemy's shield then health. Returns { shield, hp } actually removed. */
export function absorb(enemy, dmg) {
  let shield = 0;
  if (enemy.shield > 0) {
    shield = Math.min(enemy.shield, dmg);
    enemy.shield -= shield;
    dmg -= shield;
  }
  const hp = Math.min(enemy.hp, dmg);
  enemy.hp -= hp;
  return { shield, hp };
}

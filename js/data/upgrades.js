// In-run roguelike upgrades (GDD section 7). Three main categories from the GDD
// (skill / firepower / ammo) plus defense and utility cards.
//
// Each upgrade is applied by calling perLevel(mods) once per owned level, so mods are
// always re-derivable from `{id: level}` - which is exactly what we persist in a checkpoint.

import { HEROES, HERO_ORDER } from './heroes.js';

export const CATEGORY = {
  skill: { name: 'Skill', group: 'Offense', color: '#ffb02e' },
  firepower: { name: 'Firepower', group: 'Offense', color: '#ff6b4a' },
  ammo: { name: 'Ammunition', group: 'Offense', color: '#4cb4ff' },
  defense: { name: 'Defense', group: 'Defense', color: '#3fc98a' },
  utility: { name: 'Utility', group: 'Utility', color: '#c066ff' },
};

export function defaultMods() {
  return {
    dmg: 0, rate: 0, crit: 0, critMult: 0, pierce: 0, speed: 0, range: 0,
    splashR: 0, splashFrac: 0, armorPierce: 0, haste: 0, burn: 0, frost: 0,
    turrets: 0, turretDmg: 0, turretRate: 0, focus: 0, homing: 0,
    reduce: 0, hpMult: 0, regen: 0, coin: 0, cut: 0, rerolls: 0, reload: 0,
    slicer: 0, cycle: 0, pile: 0, // revolver: extra bullets per cut, cycle speed-up, pile capacity
    projBy: {}, // Multi-Shot is per hero: { heroId: extra bullets per shot }
    abilityPower: 0, abilityTargets: 0,
  };
}

const p = (v) => Math.round(v * 100) + '%';

export const multishotId = (heroId) => `multishot_${heroId}`;

export const UPGRADES = {
  // ---------- Skill ----------
  quick_reload: {
    id: 'quick_reload', name: 'Quick Reload', cat: 'skill', rarity: 'rare', max: 2, icon: 'bolt',
    tags: ['rapid', 'ballistic', 'energy', 'fire', 'sniper'], counters: ['swarm', 'fast'],
    text: (l) => `Every hero's reload time -${20 * l}%${l > 1 ? ' (-20% each)' : ''}`,
    perLevel: (m) => { m.reload += 0.2; },
  },
  overclock: {
    id: 'overclock', name: 'Overclock', cat: 'skill', rarity: 'rare', max: 4, icon: 'clock',
    tags: ['support', 'ability'], counters: [],
    text: (l) => `Ability cooldowns -${p(0.12 * l)}${l > 1 ? ' (-12% each)' : ''}`,
    perLevel: (m) => { m.haste += 0.12; },
  },
  sharpshooter: {
    id: 'sharpshooter', name: 'Sharpshooter', cat: 'skill', rarity: 'rare', max: 5, icon: 'target',
    tags: ['sniper', 'crit', 'rapid'], counters: [],
    text: (l) => `Crit chance +${p(0.07 * l)}, crit damage +${p(0.1 * l)}`,
    perLevel: (m) => { m.crit += 0.07; m.critMult += 0.1; },
  },
  phase_rounds: {
    id: 'phase_rounds', name: 'Phase Rounds', cat: 'skill', rarity: 'rare', max: 3, icon: 'pierce',
    tags: ['pierce', 'sniper', 'ballistic', 'rapid'], counters: ['swarm'],
    text: (l) => `Shots pierce ${l} extra target${l > 1 ? 's' : ''} (+1)`,
    perLevel: (m) => { m.pierce += 1; },
  },
  ignition: {
    id: 'ignition', name: 'Ignition', cat: 'skill', rarity: 'rare', max: 3, icon: 'flame',
    tags: ['fire', 'burn', 'area'], counters: ['armored'],
    text: (l) => `Hits ignite foes: burn for ${p(0.4 * l)} of hit damage per second`,
    perLevel: (m) => { m.burn += 1; },
  },
  resonance: {
    id: 'resonance', name: 'Resonance', cat: 'skill', rarity: 'epic', max: 3, icon: 'wave',
    tags: ['support', 'ability'], counters: [],
    text: (l) => `Ability power +${p(0.25 * l)} and +${2 * l} ability targets`,
    perLevel: (m) => { m.abilityPower += 0.25; m.abilityTargets += 2; },
  },

  // ---------- Firepower ----------
  aux_turret: {
    id: 'aux_turret', name: 'Auxiliary Turret', cat: 'firepower', rarity: 'rare', max: 2, icon: 'turret',
    tags: ['turret', 'support'], counters: [],
    text: (l) => (l === 1 ? 'Deploy a turret on the left wall flank' : 'Deploy a second turret on the right flank'),
    perLevel: (m) => { m.turrets += 1; },
  },
  turret_dmg: {
    id: 'turret_dmg', name: 'Turret Calibration', cat: 'firepower', rarity: 'common', max: 4, icon: 'turret',
    tags: ['turret'], counters: [], requires: (u) => (u.aux_turret || 0) > 0,
    text: (l) => `Turret damage +${p(0.4 * l)}${l > 1 ? ' (+40% each)' : ''}`,
    perLevel: (m) => { m.turretDmg += 0.4; },
  },
  turret_rate: {
    id: 'turret_rate', name: 'Rapid Servos', cat: 'firepower', rarity: 'common', max: 3, icon: 'turret',
    tags: ['turret', 'rapid'], counters: ['swarm'], requires: (u) => (u.aux_turret || 0) > 0,
    text: (l) => `Turret fire rate +${p(0.3 * l)}${l > 1 ? ' (+30% each)' : ''}`,
    perLevel: (m) => { m.turretRate += 0.3; },
  },
  target_lock: {
    id: 'target_lock', name: 'Target Lock', cat: 'firepower', rarity: 'common', max: 3, icon: 'scope',
    tags: ['sniper', 'ballistic', 'rapid'], counters: ['ranged'],
    text: (l) => `Weapon range +${p(0.12 * l)}, bullets curve toward targets`,
    perLevel: (m) => { m.range += 0.12; m.homing += 1; },
  },
  focus_fire: {
    id: 'focus_fire', name: 'Focus Fire', cat: 'firepower', rarity: 'rare', max: 3, icon: 'crosshair',
    tags: ['single', 'rapid', 'sniper'], counters: ['armored', 'boss'],
    text: (l) => `Each consecutive hit on one target adds +${l * 3}% damage (max 6 stacks)`,
    perLevel: (m) => { m.focus += 1; },
  },

  // ---------- Ammunition ----------
  heavy_rounds: {
    id: 'heavy_rounds', name: 'Heavy Rounds', cat: 'ammo', rarity: 'common', max: 6, icon: 'bullet',
    tags: ['ballistic', 'explosive', 'sniper', 'rapid'], counters: ['armored'],
    text: (l) => `Projectile damage +${p(0.18 * l)}${l > 1 ? ' (+18% each)' : ''}`,
    perLevel: (m) => { m.dmg += 0.18; },
  },
  hypervelocity: {
    id: 'hypervelocity', name: 'Hypervelocity', cat: 'ammo', rarity: 'common', max: 3, icon: 'speed',
    tags: ['ballistic', 'sniper'], counters: ['fast'],
    text: (l) => `Bullet speed +${p(0.2 * l)}, damage +${p(0.06 * l)}`,
    perLevel: (m) => { m.speed += 0.2; m.dmg += 0.06; },
  },
  slicer_chambers: {
    id: 'slicer_chambers', name: 'Slicer Chambers', cat: 'ammo', rarity: 'rare', max: 5, icon: 'revolver',
    tags: ['ammo', 'support'], counters: [],
    text: (l) => `The revolver loads ${1 + l} bullets for the slicer hand to cut (max 6)`,
    perLevel: (m) => { m.slicer += 1; },
  },
  quick_slicer: {
    id: 'quick_slicer', name: 'Quick Slicer', cat: 'ammo', rarity: 'common', max: 3, icon: 'bolt',
    tags: ['ammo', 'rapid'], counters: [],
    text: (l) => `The slicer hand sweeps ${Math.round(l * 15)}% faster${l > 1 ? ' (15% each)' : ''}`,
    perLevel: (m) => { m.cycle += 0.15; },
  },
  deep_pile: {
    id: 'deep_pile', name: 'Deep Pile', cat: 'ammo', rarity: 'common', max: 3, icon: 'bullet',
    tags: ['ammo', 'support'], counters: [],
    text: (l) => `The ammo pile holds ${8 * l} more bullets`,
    perLevel: (m) => { m.pile += 8; },
  },
  armor_piercing: {
    id: 'armor_piercing', name: 'Armor-Piercing Rounds', cat: 'ammo', rarity: 'rare', max: 3, icon: 'drill',
    tags: ['ballistic', 'armor', 'sniper'], counters: ['armored'],
    text: (l) => `Ignore ${p(0.15 * l)} of enemy armor${l > 1 ? ' (+15% each)' : ''}`,
    perLevel: (m) => { m.armorPierce += 0.15; },
  },
  cryo_rounds: {
    id: 'cryo_rounds', name: 'Cryo Rounds', cat: 'ammo', rarity: 'rare', max: 3, icon: 'snow',
    tags: ['frost', 'support', 'rapid'], counters: ['fast', 'swarm'],
    text: (l) => `Hits slow enemies by ${p(0.18 * l)} for 1.5s`,
    perLevel: (m) => { m.frost += 1; },
  },
  explosive_rounds: {
    id: 'explosive_rounds', name: 'Explosive Rounds', cat: 'ammo', rarity: 'epic', max: 3, icon: 'blast',
    tags: ['explosive', 'area', 'ballistic'], counters: ['swarm'],
    text: (l) => `Bullets explode for ${p(0.35)} damage in a ${24 + l * 8}px radius`,
    perLevel: (m) => { m.splashR += 8; m.splashFrac = 0.35; if (m.splashR < 32) m.splashR = 32; },
  },

  // ---------- Defense ----------
  energy_shield: {
    id: 'energy_shield', name: 'Energy Shield', cat: 'defense', rarity: 'common', max: 4, icon: 'shield',
    tags: ['defense'], counters: ['ranged'],
    text: (l) => `Incoming damage -${p(0.08 * l)}${l > 1 ? ' (-8% each)' : ''}`,
    perLevel: (m) => { m.reduce += 0.08; },
  },
  reinforced_wall: {
    id: 'reinforced_wall', name: 'Reinforced Wall', cat: 'defense', rarity: 'common', max: 4, icon: 'wall',
    tags: ['defense'], counters: [],
    text: (l) => `Wall max health +${p(0.2 * l)}${l > 1 ? ' (+20% each)' : ''}`,
    perLevel: (m) => { m.hpMult += 0.2; },
  },
  field_repair: {
    id: 'field_repair', name: 'Field Repair', cat: 'defense', rarity: 'common', max: 99, icon: 'wrench', instant: true,
    tags: ['defense'], counters: [],
    text: () => 'Instantly repair 25% of wall health',
    perLevel: () => {},
  },
  nanite_mesh: {
    id: 'nanite_mesh', name: 'Nanite Mesh', cat: 'defense', rarity: 'rare', max: 3, icon: 'nano',
    tags: ['defense', 'support'], counters: [],
    text: (l) => `Wall regenerates +${(0.8 * l).toFixed(1)} health per second`,
    perLevel: (m) => { m.regen += 0.8; },
  },

  // ---------- Utility ----------
  salvage_crew: {
    id: 'salvage_crew', name: 'Salvage Crew', cat: 'utility', rarity: 'common', max: 3, icon: 'coin',
    tags: ['economy'], counters: [],
    text: (l) => `Coins earned this run +${p(0.2 * l)}${l > 1 ? ' (+20% each)' : ''}`,
    perLevel: (m) => { m.coin += 0.2; },
  },
  razor_edge: {
    id: 'razor_edge', name: 'Razor Edge', cat: 'utility', rarity: 'rare', max: 3, icon: 'blade',
    tags: ['cut', 'defense'], counters: ['ranged'],
    text: (l) => `Cut energy +${p(0.3 * l)}, regenerates faster`,
    perLevel: (m) => { m.cut += 0.3; },
  },
  quick_charge: {
    id: 'quick_charge', name: 'Quick Charge', cat: 'utility', rarity: 'rare', max: 99, icon: 'battery', instant: true,
    tags: ['support', 'ability'], counters: [],
    text: () => 'Instantly recharge all abilities by 60%',
    perLevel: () => {},
  },
  lucky_draw: {
    id: 'lucky_draw', name: 'Lucky Draw', cat: 'utility', rarity: 'common', max: 2, icon: 'dice',
    tags: ['economy'], counters: [],
    text: () => 'Gain one extra reroll for upgrade choices',
    perLevel: (m) => { m.rerolls += 1; },
  },
};

// Multi-Shot belongs to one hero: every hero has their own card (and their own levels), up to 5 bullets per shot.
for (const heroId of HERO_ORDER) {
  const hero = HEROES[heroId];
  const id = multishotId(heroId);
  UPGRADES[id] = {
    id, hero: heroId, name: `${hero.name}: Multi-Shot`, cat: 'ammo', rarity: 'rare', max: 4, icon: 'magazine',
    tags: hero.tags, counters: ['swarm'],
    text: (l) => `${hero.name} fires ${1 + l} bullets per shot, in a row with no reload between them (max 5). Every bullet uses ammo`,
    perLevel: (m) => { m.projBy[heroId] = (m.projBy[heroId] || 0) + 1; },
  };
}

export const UPGRADE_IDS = Object.keys(UPGRADES);

/** Rebuild the modifier set from {id: level}. */
export function modsFromUpgrades(owned) {
  const m = defaultMods();
  for (const id in owned) {
    const u = UPGRADES[id];
    if (!u || u.instant) continue;
    for (let i = 0; i < owned[id]; i++) u.perLevel(m);
  }
  return m;
}

/**
 * Weighted choice of `n` distinct upgrades (GDD 7.5). Weight inputs:
 * rarity, squad tag synergy, previously chosen tags, enemy composition, level caps and prerequisites.
 */
export function rollUpgrades(rng, { owned, squadTags, enemyTags, wave, baseFrac, n = 3, exclude = [], ammoPressure = 0, heroes = null }) {
  const ownedTags = new Map();
  for (const id in owned) for (const t of UPGRADES[id].tags) ownedTags.set(t, (ownedTags.get(t) || 0) + 1);
  const rarityBoost = 1 + Math.min(wave, 8) * 0.06; // later checkpoints skew toward rarer cards
  const pool = [];
  for (const id of UPGRADE_IDS) {
    const u = UPGRADES[id];
    if (exclude.includes(id)) continue;
    const lv = owned[id] || 0;
    if (lv >= u.max) continue;
    if (u.requires && !u.requires(owned)) continue;
    if (u.hero && heroes && !heroes.has(u.hero)) continue; // hero-specific cards only for heroes on the field
    let w = u.rarity === 'common' ? 70 : u.rarity === 'rare' ? 24 * rarityBoost : 6 * rarityBoost * rarityBoost;
    for (const t of u.tags) {
      if (squadTags.has(t)) w *= 1.35;
      if (ownedTags.has(t)) w *= 1 + 0.12 * Math.min(ownedTags.get(t), 3);
    }
    for (const t of u.counters) if (enemyTags.has(t)) w *= 1.3;
    if (lv > 0) w *= 1.15; // gentle commitment bias so builds can form
    if (id === 'field_repair') w *= baseFrac > 0.85 ? 0.1 : baseFrac < 0.5 ? 3 : 1;
    // When the squad is burning ammo faster than the revolver makes it, the revolver cards surface.
    if (id === 'slicer_chambers') w *= 1 + ammoPressure * 6;
    if (id === 'quick_slicer' || id === 'deep_pile') w *= 1 + ammoPressure * 2;
    if (u.hero) w *= 0.5; // one card per hero: keep the combined odds close to a single Multi-Shot card
    if (id === 'aux_turret' && lv === 0) w *= 1.5; // a visible, fun milestone early
    pool.push({ id, w });
  }
  const out = [];
  const catCount = {};
  for (let k = 0; k < n && pool.length; k++) {
    // Soft variety: cards sharing a category with one already offered are less likely.
    const weights = pool.map((e) => e.w * (catCount[UPGRADES[e.id].cat] ? 0.5 : 1));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rng.next() * total;
    let idx = 0;
    for (; idx < pool.length - 1; idx++) { r -= weights[idx]; if (r <= 0) break; }
    const pick = pool.splice(idx, 1)[0];
    out.push(pick.id);
    const c = UPGRADES[pick.id].cat;
    catCount[c] = (catCount[c] || 0) + 1;
  }
  return out;
}

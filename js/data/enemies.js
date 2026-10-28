// Enemy and boss archetypes (GDD section 6). Stage-scaling lives in `statScale`.
// `names` is per world so the same behavior can wear a different identity.

export const ENEMIES = {
  grunt: {
    id: 'grunt', names: ['Shambler', 'Skitter Drone', 'Gloop Brute'],
    hp: 40, speed: 28, r: 11, wallDps: 6, coins: 2, armor: 0, shield: 0,
    behavior: 'melee', tags: [],
    blurb: 'Low health, steady march. Teaches targeting.',
  },
  runner: {
    id: 'runner', names: ['Sprinter', 'Dart Scout', 'Lunger'],
    hp: 22, speed: 66, r: 9, wallDps: 4, coins: 2, armor: 0, shield: 0,
    behavior: 'melee', zig: 26, tags: ['fast'],
    blurb: 'Fragile but very fast. Rapid-fire weapons shine.',
  },
  bulwark: {
    id: 'bulwark', names: ['Scrap Bruiser', 'Plated Crawler', 'Carapace Ogre'],
    hp: 240, speed: 17, r: 17, wallDps: 14, coins: 8, armor: 0.5, shield: 0,
    behavior: 'melee', tags: ['armored'],
    blurb: 'Heavy armor halves damage. Use armor-piercing and rockets.',
  },
  sentinel: {
    id: 'sentinel', names: ['Shield Bot', 'Aegis Node', 'Ward Shaman'],
    hp: 120, speed: 22, r: 13, wallDps: 0, coins: 8, armor: 0, shield: 0,
    behavior: 'support', holdDist: 190, aura: { r: 88, reduce: 0.4 }, tags: ['support'],
    blurb: 'Projects a field that cuts nearby damage by 40%. Kill it first.',
  },
  spitter: {
    id: 'spitter', names: ['Toxic Spitter', 'Plasma Gunner', 'Acid Hurler'],
    hp: 58, speed: 24, r: 11, wallDps: 0, coins: 5, armor: 0, shield: 0,
    behavior: 'ranged', holdDist: 215, fireEvery: 2.7,
    bullet: { speed: 125, dmg: 7, r: 5, cutHp: 1 }, tags: ['ranged'],
    blurb: 'Lobs slow shots at the wall. Swipe to cut them out of the air.',
  },
  drone: {
    id: 'drone', names: ['Scrap Drone', 'Orbital Drone', 'Spore Flyer'],
    hp: 46, speed: 44, r: 10, wallDps: 0, coins: 6, armor: 0, shield: 44,
    behavior: 'ranged', holdDist: 135, fireEvery: 1.5, fly: true,
    bullet: { speed: 175, dmg: 3, r: 4, cutHp: 1 }, tags: ['shielded', 'ranged', 'flying'],
    blurb: 'Hovers with a shield layer and pelts the wall. Beams break shields fast.',
  },
  splitter: {
    id: 'splitter', names: ['Bloat Zombie', 'Mitotic Alien', 'Splitter Slime'],
    hp: 135, speed: 22, r: 15, wallDps: 8, coins: 6, armor: 0, shield: 0,
    behavior: 'melee', splits: { into: 'slimeling', n: 2 }, tags: ['swarm'],
    blurb: 'Bursts into two fast slimelings when destroyed.',
  },
  slimeling: {
    id: 'slimeling', names: ['Maggot', 'Larva', 'Slimeling'],
    hp: 20, speed: 50, r: 7, wallDps: 3, coins: 1, armor: 0, shield: 0,
    behavior: 'melee', zig: 14, tags: ['fast'],
    blurb: 'Tiny, quick, and everywhere.',
  },
};

/**
 * Boss definitions. `cycle` lists the attacks used in each phase (looping).
 * Phase thresholds are fractions of max HP: boss goes invulnerable on crossing them
 * while it changes form and summons help (GDD 6, "distinct phases").
 */
export const BOSSES = {
  colossus: {
    id: 'colossus', name: 'Siege Colossus', world: 0,
    hp: 3000, speed: 16, r: 46, armor: 0.3, coins: 140, holdY: 150,
    phases: [
      { at: 1.0, cycle: ['volley', 'rest', 'bombs', 'rest'], tempo: 1.0 },
      { at: 0.66, cycle: ['bombs', 'summon', 'volley', 'rest'], tempo: 0.85 },
      { at: 0.33, cycle: ['bombs', 'volley', 'bombs', 'rest'], tempo: 0.7 },
    ],
    summon: [['grunt', 6], ['runner', 3]],
    blurb: 'A walking fortress. Cut its bombs before they land, then strike while its core is exposed.',
  },
  leviathan: {
    id: 'leviathan', name: 'Void Leviathan', world: 1,
    hp: 3400, speed: 18, r: 46, armor: 0.2, coins: 180, holdY: 140,
    phases: [
      { at: 1.0, cycle: ['volley', 'sweep', 'rest'], tempo: 1.0 },
      { at: 0.66, cycle: ['shieldup', 'sweep', 'summon', 'rest'], tempo: 0.85 },
      { at: 0.33, cycle: ['sweep', 'volley', 'shieldup', 'sweep', 'rest'], tempo: 0.7 },
    ],
    summon: [['drone', 4]],
    blurb: 'Sweeping beams and regenerating shields. Pulse and Patch shine here.',
  },
  broodmother: {
    id: 'broodmother', name: 'Brood Mother', world: 2,
    hp: 3800, speed: 14, r: 48, armor: 0.15, coins: 240, holdY: 150,
    phases: [
      { at: 1.0, cycle: ['spit', 'rest', 'summon', 'rest'], tempo: 1.0 },
      { at: 0.66, cycle: ['spit', 'bombs', 'summon', 'rest'], tempo: 0.85 },
      { at: 0.33, cycle: ['spit', 'spit', 'bombs', 'summon', 'rest'], tempo: 0.7 },
    ],
    summon: [['splitter', 2], ['slimeling', 5]],
    blurb: 'Spawns endless brood and spits bullet storms. Keep swiping.',
  },
};

/** Stage index -> multipliers (GDD 6: Health(stage) = Base * (1 + alpha * stage)). */
/** Balance knobs - tools/balance.mjs sweeps these. */
export const TUNE = { alphaHp: 0.9, alphaDmg: 0.3, waveHp: 0.05, budgetBase: 5.5, budgetIdx: 3.0, waveGrow: 0.4, bossHp: 0.45 };
export function statScale(stageIdx, waveIdx = 0, hard = false) {
  const hp = (1 + TUNE.alphaHp * stageIdx) * (1 + TUNE.waveHp * waveIdx) * (hard ? 2.1 : 1);
  const dmg = (1 + TUNE.alphaDmg * stageIdx) * (hard ? 1.5 : 1);
  return { hp, dmg };
}

export const MODIFIERS = {
  swift: { name: 'Swift Foes', desc: 'Enemies move 20% faster.', icon: '»', speed: 1.2 },
  hardened: { name: 'Hardened Hides', desc: 'Enemies gain extra armor.', icon: '▣', armorAdd: 0.15 },
  swarm: { name: 'Swarm Tide', desc: '30% more enemies, each with less health.', icon: '∷', count: 1.3, hp: 0.8 },
  regen: { name: 'Regeneration', desc: 'Enemies slowly heal over time.', icon: '+', regen: 0.012 },
};

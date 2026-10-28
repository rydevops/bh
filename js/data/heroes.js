// Hero definitions (GDD section 5). All values are data - tune here, not in the engine.
// Stable IDs are used everywhere in saves; display names are never keys.

export const ROLES = {
  dps: { name: 'Rapid DPS', short: 'DPS' },
  artillery: { name: 'Artillery', short: 'Artillery' },
  energy: { name: 'Energy', short: 'Energy' },
  support: { name: 'Support', short: 'Support' },
  sniper: { name: 'Sniper', short: 'Sniper' },
  pyro: { name: 'Pyro', short: 'Pyro' },
};

export const RARITY = {
  common: { name: 'Common', color: '#8ea2c0', weight: 70 },
  rare: { name: 'Rare', color: '#4cb4ff', weight: 24 },
  epic: { name: 'Epic', color: '#c066ff', weight: 6 },
};

/** Level multiplier: attack grows 12% per level (additive). Rank adds 10% per rank. */
export const LEVEL_GROWTH = 0.12;
export const RANK_GROWTH = 0.1;
export const MAX_RANK = 5;
/** Level cap by rank: rank 1 -> 10, rank 2 -> 14 ... rank 5 -> 26. */
export const levelCap = (rank) => 6 + 4 * rank;
/** Fragments needed to go from rank r to r+1. */
export const RANK_COST = [0, 10, 20, 40, 80];
/** Coins to go from level L to L+1. */
export const levelCost = (L) => Math.round(30 * Math.pow(1.27, L - 1));

/** Generic perks unlocked by rank (numbers apply to every hero; text is hero-specific). */
export const RANK_PERKS = {
  2: { abilityPower: 0.25 },
  3: { cooldown: -0.15 },
  4: { passive: 0.5 },
  5: { dmg: 0.15, pierce: 1 },
};

export const HEROES = {
  vanguard: {
    id: 'vanguard',
    name: 'Vanguard',
    title: 'Frontline Gunner',
    role: 'dps',
    rarity: 'common',
    weapon: 'Automatic rifle',
    kind: 'rifle',
    tags: ['rapid', 'ballistic', 'single'],
    base: { atk: 9, interval: 0.18, range: 440, speed: 560, crit: 0.05, critMult: 1.8, pierce: 0, splash: 0, spread: 0.05 },
    ability: {
      name: 'Overdrive',
      cd: 18,
      dur: 5,
      desc: 'Doubles Vanguard\'s fire rate and boosts the rest of the squad by 25% for 5s.',
    },
    passive: { name: 'Adrenaline', desc: '+25% fire rate while enemies are close to the wall.' },
    perks: ['+25% Overdrive power', '-15% ability cooldown', 'Adrenaline bonus x1.5', '+15% damage, +1 pierce'],
    unlock: { start: true },
    skins: [
      { id: 'default', name: 'Standard Issue', cost: 0, c: { main: '#e8553d', dark: '#9c2f22', light: '#ff8a6b', accent: '#ffd23f', glow: '#ffb347' } },
      { id: 'arctic', name: 'Arctic Ops', cost: 60, c: { main: '#8fd3ff', dark: '#3c7ea8', light: '#e2f5ff', accent: '#ffffff', glow: '#9be3ff' } },
      { id: 'gold', name: 'Gilded Guard', cost: 140, c: { main: '#f2c14e', dark: '#a8741a', light: '#fff0a8', accent: '#3a2a00', glow: '#ffe27a' } },
    ],
  },
  rook: {
    id: 'rook',
    name: 'Rook',
    title: 'Heavy Artillery',
    role: 'artillery',
    rarity: 'rare',
    weapon: 'Rocket launcher',
    kind: 'rocket',
    tags: ['explosive', 'armor', 'area'],
    base: { atk: 62, interval: 1.5, range: 480, speed: 310, crit: 0.05, critMult: 1.8, pierce: 0, splash: 46, spread: 0.02 },
    ability: {
      name: 'Cluster Salvo',
      cd: 16,
      dur: 0,
      desc: 'Fires a salvo of 8 rockets at different enemies, each dealing 120% damage in an area.',
    },
    passive: { name: 'Demolisher', desc: '+40% damage against armored enemies.' },
    perks: ['+25% Salvo power', '-15% ability cooldown', 'Demolisher bonus x1.5', '+15% damage, +1 pierce'],
    unlock: { start: true },
    skins: [
      { id: 'default', name: 'Steel Bastion', cost: 0, c: { main: '#4a7fd6', dark: '#27478a', light: '#8fb6ff', accent: '#ffb02e', glow: '#ffcf6b' } },
      { id: 'forest', name: 'Forest Hammer', cost: 60, c: { main: '#5fae5a', dark: '#2f6a33', light: '#a8e8a0', accent: '#f4e04d', glow: '#c8f29a' } },
      { id: 'void', name: 'Void Siege', cost: 140, c: { main: '#6b4bd6', dark: '#35238a', light: '#b39bff', accent: '#ff5dd0', glow: '#d79bff' } },
    ],
  },
  patch: {
    id: 'patch',
    name: 'Patch',
    title: 'Field Medic',
    role: 'support',
    rarity: 'common',
    weapon: 'Support drone',
    kind: 'drone',
    tags: ['support', 'defense', 'drone'],
    base: { atk: 5, interval: 0.34, range: 340, speed: 420, crit: 0.05, critMult: 1.8, pierce: 0, splash: 0, spread: 0.02 },
    ability: {
      name: 'Emergency Barrier',
      cd: 22,
      dur: 8,
      desc: 'Raises a barrier that soaks incoming damage for 8s and repairs 15% of wall health.',
    },
    passive: { name: 'Triage Drone', desc: 'Repairs the wall over time and intercepts an enemy bullet every few seconds.' },
    perks: ['+25% barrier strength', '-15% ability cooldown', 'Triage bonus x1.5', '+15% damage, +1 pierce'],
    unlock: { start: true },
    skins: [
      { id: 'default', name: 'Field Medic', cost: 0, c: { main: '#3fc98a', dark: '#1d7a52', light: '#9ff2c8', accent: '#ffffff', glow: '#7dffc4' } },
      { id: 'rose', name: 'Rose Cross', cost: 60, c: { main: '#ff6f91', dark: '#a82f52', light: '#ffc2d1', accent: '#ffffff', glow: '#ff9fb8' } },
      { id: 'night', name: 'Night Shift', cost: 140, c: { main: '#35456b', dark: '#1a2240', light: '#7188c4', accent: '#4cf0ff', glow: '#4cf0ff' } },
    ],
  },
  pulse: {
    id: 'pulse',
    name: 'Pulse',
    title: 'Energy Specialist',
    role: 'energy',
    rarity: 'rare',
    weapon: 'Focused beam',
    kind: 'beam',
    tags: ['energy', 'beam', 'pierce', 'shield'],
    base: { atk: 5, interval: 0.1, range: 380, speed: 0, crit: 0.05, critMult: 1.8, pierce: 99, splash: 0, spread: 0 },
    ability: {
      name: 'Sustained Beam',
      cd: 20,
      dur: 3.5,
      desc: 'Widens the beam for 3.5s, tripling its damage. It tracks the toughest target.',
    },
    passive: { name: 'Shield Breaker', desc: '+50% damage against shielded enemies.' },
    perks: ['+25% Beam power', '-15% ability cooldown', 'Shield Breaker x1.5', '+15% damage, +1 pierce'],
    unlock: { frags: 10, hint: 'Drops from World 1 stages' },
    skins: [
      { id: 'default', name: 'Neon Pulse', cost: 0, c: { main: '#a45cff', dark: '#5a2aa8', light: '#d6b0ff', accent: '#47f3ff', glow: '#47f3ff' } },
      { id: 'sun', name: 'Solar Flare', cost: 60, c: { main: '#ff9a3c', dark: '#a85a12', light: '#ffd29b', accent: '#fff36b', glow: '#ffe14f' } },
      { id: 'mono', name: 'Mono Array', cost: 140, c: { main: '#cfd6e6', dark: '#6a7388', light: '#ffffff', accent: '#ff3d71', glow: '#ff7a9d' } },
    ],
  },
  specter: {
    id: 'specter',
    name: 'Specter',
    title: 'Long-Range Marksman',
    role: 'sniper',
    rarity: 'epic',
    weapon: 'Piercing sniper rifle',
    kind: 'sniper',
    tags: ['sniper', 'pierce', 'crit', 'single'],
    base: { atk: 78, interval: 1.7, range: 640, speed: 950, crit: 0.25, critMult: 2.2, pierce: 3, splash: 0, spread: 0 },
    ability: {
      name: 'Dead Eye',
      cd: 15,
      dur: 6,
      desc: 'For 6s Specter fires twice as fast and every shot is a critical hit.',
    },
    passive: { name: 'Apex Hunter', desc: '+50% damage against bosses and the highest-health enemy.' },
    perks: ['+25% Dead Eye power', '-15% ability cooldown', 'Apex Hunter x1.5', '+15% damage, +1 pierce'],
    unlock: { frags: 20, hint: 'Drops from Stage 1-4 onward' },
    skins: [
      { id: 'default', name: 'Ghost Cloak', cost: 0, c: { main: '#5a7a8a', dark: '#2a3d48', light: '#9fc3d3', accent: '#ff4b4b', glow: '#ff6b6b' } },
      { id: 'sand', name: 'Dune Walker', cost: 60, c: { main: '#c9a56a', dark: '#7a5a2a', light: '#f0d9a8', accent: '#2f2a24', glow: '#ffd27a' } },
      { id: 'crimson', name: 'Crimson Eye', cost: 140, c: { main: '#8a1f3d', dark: '#4a0f20', light: '#d65a7a', accent: '#ffe14f', glow: '#ff5a7e' } },
    ],
  },
  ember: {
    id: 'ember',
    name: 'Ember',
    title: 'Flame Trooper',
    role: 'pyro',
    rarity: 'epic',
    weapon: 'Flamethrower',
    kind: 'flame',
    tags: ['fire', 'area', 'close', 'burn'],
    base: { atk: 4.5, interval: 0.1, range: 215, speed: 0, crit: 0.05, critMult: 1.8, pierce: 99, splash: 0, spread: 0 },
    ability: {
      name: 'Firestorm',
      cd: 17,
      dur: 5,
      desc: 'Ignites the densest cluster of enemies, burning everything inside for 5s.',
    },
    passive: { name: 'Fuel Rush', desc: 'Burning enemies take +15% damage from the whole squad.' },
    perks: ['+25% Firestorm power', '-15% ability cooldown', 'Fuel Rush x1.5', '+15% damage, +1 pierce'],
    unlock: { frags: 25, hint: 'Drops in Worlds 2 and 3' },
    skins: [
      { id: 'default', name: 'Hot Streak', cost: 0, c: { main: '#ff8a1f', dark: '#9c4a08', light: '#ffc46b', accent: '#2a2230', glow: '#ff6a1f' } },
      { id: 'toxic', name: 'Toxic Waste', cost: 60, c: { main: '#8be04a', dark: '#468a1a', light: '#d2ff9f', accent: '#2a2230', glow: '#b6ff4a' } },
      { id: 'ice', name: 'Cold Burn', cost: 140, c: { main: '#4cc9f0', dark: '#1d6f95', light: '#b8ecff', accent: '#ffffff', glow: '#7ae6ff' } },
    ],
  },
};

export const HERO_ORDER = ['vanguard', 'rook', 'patch', 'pulse', 'specter', 'ember'];

export const TRAILS = [
  { id: 'default', name: 'Standard Tracers', cost: 0, desc: 'Each hero uses their own colors.' },
  { id: 'rainbow', name: 'Prismatic Rounds', cost: 120, desc: 'Shifting rainbow tracers.' },
  { id: 'mono', name: 'Monochrome', cost: 80, desc: 'Clean white tracers - great for readability.' },
  { id: 'neon', name: 'Neon Pink', cost: 100, desc: 'Hot pink bullets with a bright glow.' },
];

export function skinColors(heroId, skinId) {
  const h = HEROES[heroId];
  return (h.skins.find((s) => s.id === skinId) || h.skins[0]).c;
}

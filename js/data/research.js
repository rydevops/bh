// Permanent account research (GDD 10.3): modest global bonuses bought with Research Tokens.
// Tokens come from bosses, 3-star first clears and weekly missions.

export const RESEARCH = {
  fortify: { id: 'fortify', name: 'Fortified Wall', icon: 'wall', max: 5, cost: [1, 1, 2, 3, 4], desc: (l) => `Wall health +${8 * l}%`, perLevel: '+8% wall health' },
  overwatch: { id: 'overwatch', name: 'Overwatch', icon: 'target', max: 5, cost: [1, 2, 2, 3, 4], desc: (l) => `All squad damage +${4 * l}%`, perLevel: '+4% damage' },
  quick_hands: { id: 'quick_hands', name: 'Quick Hands', icon: 'clock', max: 5, cost: [1, 1, 2, 3, 3], desc: (l) => `Ability cooldowns -${6 * l}%`, perLevel: '-6% cooldowns' },
  prospector: { id: 'prospector', name: 'Prospector', icon: 'coin', max: 5, cost: [1, 1, 2, 2, 3], desc: (l) => `Coins earned +${6 * l}%`, perLevel: '+6% coins' },
  field_kit: { id: 'field_kit', name: 'Field Kit', icon: 'dice', max: 3, cost: [1, 2, 3], desc: (l) => `+${l} upgrade reroll${l > 1 ? 's' : ''} each run`, perLevel: '+1 reroll' },
  blade_mastery: { id: 'blade_mastery', name: 'Blade Mastery', icon: 'blade', max: 4, cost: [1, 2, 2, 3], desc: (l) => `CUT bar +${15 * l}% bigger and refills +${12 * l}% faster`, perLevel: 'Bigger CUT bar, refills faster', help: 'CUT bar = your swipe energy. Every enemy bullet you slice costs 5.' },
  keen_edge: { id: 'keen_edge', name: 'Keen Edge', icon: 'blade', max: 3, cost: [1, 2, 3], desc: (l) => `Each bullet you slice costs ${Math.round(5 * (1 - 0.1 * l) * 10) / 10} CUT energy instead of 5`, perLevel: 'Slicing costs 10% less CUT energy', help: 'Cheaper cuts = more bullets sliced from one full bar.' },
  quick_draw: { id: 'quick_draw', name: 'Quick Draw', icon: 'bolt', max: 4, cost: [1, 2, 3, 4], desc: (l) => `Every hero's reload time -${4 * l}%`, perLevel: '-4% hero reload time' },
  keen_eye: { id: 'keen_eye', name: 'Keen Eye', icon: 'target', max: 5, cost: [1, 1, 2, 3, 4], desc: (l) => `Crit chance +${2 * l}%`, perLevel: '+2% crit chance' },
  armor_plating: { id: 'armor_plating', name: 'Armor Plating', icon: 'wall', max: 5, cost: [1, 2, 2, 3, 4], desc: (l) => `Damage to the wall -${3 * l}%`, perLevel: '-3% wall damage taken' },
  field_repairs: { id: 'field_repairs', name: 'Field Repairs', icon: 'wall', max: 4, cost: [1, 2, 3, 4], desc: (l) => `The wall repairs itself: +${0.5 * l} HP per second`, perLevel: '+0.5 wall HP per second' },
  ammo_crates: { id: 'ammo_crates', name: 'Ammo Crates', icon: 'magazine', max: 3, cost: [1, 2, 3], desc: (l) => `Ammo pile holds +${2 * l} more bullets`, perLevel: '+2 ammo pile capacity' },
  slicer_tuning: { id: 'slicer_tuning', name: 'Slicer Tuning', icon: 'clock', max: 4, cost: [1, 2, 2, 3], desc: (l) => `The revolver's slicer hand sweeps ${3 * l}% faster`, perLevel: 'Slicer hand sweeps 3% faster' },
  tactician: { id: 'tactician', name: 'Tactician', icon: 'bolt', max: 4, cost: [1, 2, 3, 4], desc: (l) => `Hero ability power +${8 * l}%`, perLevel: '+8% ability power' },
  treasure: { id: 'treasure', name: 'Treasure Hunter', icon: 'gem', max: 3, cost: [1, 2, 3], desc: (l) => `Gems earned from stages +${10 * l}%`, perLevel: '+10% gems' },
  arsenal: { id: 'arsenal', name: 'Starting Arsenal', icon: 'magazine', max: 2, cost: [2, 4], desc: (l) => `Begin each run with ${l} free upgrade pick${l > 1 ? 's' : ''}`, perLevel: '+1 free pick' },
};
export const RESEARCH_ORDER = ['fortify', 'armor_plating', 'field_repairs', 'overwatch', 'keen_eye', 'quick_draw', 'quick_hands', 'tactician', 'ammo_crates', 'slicer_tuning', 'blade_mastery', 'keen_edge', 'prospector', 'treasure', 'field_kit', 'arsenal'];

export function researchBonuses(levels = {}) {
  const l = (id) => levels[id] || 0;
  return {
    hp: 0.08 * l('fortify'),
    dmg: 0.04 * l('overwatch'),
    haste: 0.06 * l('quick_hands'),
    coin: 0.06 * l('prospector'),
    rerolls: l('field_kit'),
    cut: 0.15 * l('blade_mastery'),
    startPicks: l('arsenal'),
    cutCost: 0.1 * l('keen_edge'),
    reload: 0.04 * l('quick_draw'),
    crit: 0.02 * l('keen_eye'),
    reduce: 0.03 * l('armor_plating'),
    regen: 0.5 * l('field_repairs'),
    pile: 2 * l('ammo_crates'),
    cycle: 0.03 * l('slicer_tuning'),
    abilityPower: 0.08 * l('tactician'),
    gems: 0.1 * l('treasure'),
  };
}

// Permanent account research (GDD 10.3): modest global bonuses bought with Research Tokens.
// Tokens come from bosses, 3-star first clears and weekly missions.

export const RESEARCH = {
  fortify: { id: 'fortify', name: 'Fortified Wall', icon: 'wall', max: 5, cost: [1, 1, 2, 3, 4], desc: (l) => `Wall health +${8 * l}%`, perLevel: '+8% wall health' },
  overwatch: { id: 'overwatch', name: 'Overwatch', icon: 'target', max: 5, cost: [1, 2, 2, 3, 4], desc: (l) => `All squad damage +${4 * l}%`, perLevel: '+4% damage' },
  quick_hands: { id: 'quick_hands', name: 'Quick Hands', icon: 'clock', max: 5, cost: [1, 1, 2, 3, 3], desc: (l) => `Ability cooldowns -${6 * l}%`, perLevel: '-6% cooldowns' },
  prospector: { id: 'prospector', name: 'Prospector', icon: 'coin', max: 5, cost: [1, 1, 2, 2, 3], desc: (l) => `Coins earned +${6 * l}%`, perLevel: '+6% coins' },
  field_kit: { id: 'field_kit', name: 'Field Kit', icon: 'dice', max: 3, cost: [1, 2, 3], desc: (l) => `+${l} upgrade reroll${l > 1 ? 's' : ''} each run`, perLevel: '+1 reroll' },
  blade_mastery: { id: 'blade_mastery', name: 'Blade Mastery', icon: 'blade', max: 4, cost: [1, 2, 2, 3], desc: (l) => `Cut energy +${15 * l}%`, perLevel: '+15% cut energy' },
  arsenal: { id: 'arsenal', name: 'Starting Arsenal', icon: 'magazine', max: 2, cost: [2, 4], desc: (l) => `Begin each run with ${l} free upgrade pick${l > 1 ? 's' : ''}`, perLevel: '+1 free pick' },
};
export const RESEARCH_ORDER = ['fortify', 'overwatch', 'quick_hands', 'prospector', 'field_kit', 'blade_mastery', 'arsenal'];

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
  };
}

// Hero roster (cards, unlock states, role filters) and hero detail (attributes, abilities, upgrades, skins).

import { h } from './dom.js';
import { icon } from './icons.js';
import { registerScreen, go, navBar, currencyChips, topBar, gearButton, toast, confirmBox, refresh, sfx } from './app.js';
import { store } from '../store.js';
import { HEROES, HERO_ORDER, ROLES, RARITY, MAX_RANK, RANK_COST, levelCap, levelCost } from '../data/heroes.js';
import { heroPortrait } from '../render/sprites.js';
import { attackPower, heroDps, heroPower, rankBonuses } from '../progression.js';
import { levelUpHero, rankUpHero, unlockHero, buySkin, equipSkin, ownsSkin, setSquad } from '../economy.js';
import { slotCount } from '../progression.js';
import { fmtFull } from '../util.js';

let filter = 'all';

registerScreen('heroes', () => {
  const p = store.profile;
  const roles = ['all', ...new Set(HERO_ORDER.map((id) => HEROES[id].role))];
  const chips = h('div', { class: 'filters' }, roles.map((r) => h('button', {
    class: 'chip' + (filter === r ? ' sel' : ''), onclick: () => { filter = r; refresh(); },
  }, r === 'all' ? 'All' : ROLES[r].name)));
  const cards = HERO_ORDER.filter((id) => filter === 'all' || HEROES[id].role === filter).map((id) => {
    const d = HEROES[id], hero = p.heroes[id];
    const frags = p.frags[id] || 0;
    const need = d.unlock.frags;
    return h('button', { class: `card ${d.rarity}` + (hero ? '' : ' locked'), 'aria-label': `${d.name}${hero ? '' : ' locked'}`, onclick: () => go('hero', { id }) },
      h('img', { class: 'portrait', src: heroPortrait(id, hero ? hero.skin : 'default', 140), alt: '' }),
      hero ? null : h('div', { class: 'lockmark', html: icon('lock') }),
      p.squad.includes(id) ? h('span', { class: 'tag-sel' }, 'IN SQUAD') : null,
      h('div', { class: 'nm' }, h('span', null, d.name), hero ? h('span', { class: 'sub' }, `Lv ${hero.lv}`) : null),
      h('div', { class: 'sub' }, ROLES[d.role].name),
      hero
        ? h('div', { class: 'sub', style: { color: '#ffd23f' }, html: `${icon('bolt')} ${fmtFull(heroPower(id, hero.lv, hero.rank))} · Rank ${hero.rank}` })
        : [h('div', { class: 'bar', style: { marginTop: '6px' } }, h('i', { style: { width: Math.min(100, (frags / need) * 100) + '%' } })),
          h('div', { class: 'sub' }, `${frags}/${need} fragments`)]);
  });
  const el = h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } },
    topBar(p),
    h('div', { class: 'scroll' },
      h('h2', { class: 'title', style: { marginBottom: '8px' } }, 'Heroes'),
      p.flags.heroMenu ? null : h('div', { class: 'banner-note', style: { marginBottom: '10px' } }, 'Finish your first battle to unlock hero upgrades.'),
      chips, h('div', { class: 'grid' }, cards)),
    navBar('heroes'));
  return { el };
});

registerScreen('hero', ({ id }) => {
  const p = store.profile;
  const d = HEROES[id], hero = p.heroes[id];
  const lv = hero ? hero.lv : 1, rank = hero ? hero.rank : 1;
  const atk = attackPower(id, lv, rank);
  const upgradesOpen = p.flags.heroMenu;
  const stat = (k, v) => h('div', null, h('span', { class: 'muted' }, k), h('b', null, v));
  const cap = levelCap(rank);
  const lvCost = levelCost(lv);
  const rb = rankBonuses(rank);

  const actions = [];
  if (!hero) {
    const have = p.frags[id] || 0;
    actions.push(h('button', { class: 'btn primary block', disabled: have < d.unlock.frags,
      onclick: () => { const r = store.update((pr) => unlockHero(pr, id)); if (r.ok) { toast(`${d.name} joined your roster!`); refresh(); } } }, `Recruit (${have}/${d.unlock.frags} fragments)`));
    actions.push(h('p', { class: 'muted center', style: { fontSize: '.8rem' } }, d.unlock.hint));
  } else if (!upgradesOpen) {
    actions.push(h('div', { class: 'banner-note' }, 'Finish your first battle to unlock upgrades.'));
  } else {
    const atCap = lv >= cap;
    actions.push(h('button', { class: 'btn primary block', disabled: atCap || p.coins < lvCost, onclick: () => { const r = store.update((pr) => levelUpHero(pr, id)); if (r.ok) { sfx('ui_buy'); refresh(); } else toast(r.reason, true); },
      html: atCap ? 'Level cap - rank up to continue' : `Level up &nbsp; ${icon('coin')} ${fmtFull(lvCost)}` }));
    if (rank < MAX_RANK) {
      const need = RANK_COST[rank], have = p.frags[id] || 0;
      actions.push(h('button', { class: 'btn good block', disabled: have < need, onclick: () => { const r = store.update((pr) => rankUpHero(pr, id)); if (r.ok) { sfx('ui_buy'); toast(`${d.name} reached rank ${rank + 1}!`); refresh(); } } },
        `Rank up  (${have}/${need} fragments)`));
    }
  }

  const inSquad = p.squad.includes(id);
  if (hero) actions.push(h('button', { class: 'btn block', onclick: () => {
    if (inSquad) { if (p.squad.length <= 1) { toast('A squad needs at least one hero', true); return; } store.update((pr) => setSquad(pr, pr.squad.filter((x) => x !== id))); }
    else if (p.squad.length >= slotCount(p)) { toast('Squad is full - remove a hero first', true); return; }
    else store.update((pr) => setSquad(pr, [...pr.squad, id]));
    refresh();
  } }, inSquad ? 'Remove from squad' : 'Add to squad'));

  const skins = hero ? h('div', null,
    h('h3', { class: 'title', style: { margin: '16px 0 6px' } }, 'Outfits'),
    h('div', { class: 'skin-row' }, d.skins.map((s) => {
      const owned = ownsSkin(p, id, s.id);
      const on = hero.skin === s.id;
      return h('button', { class: 'skin' + (on ? ' on' : ''), 'aria-label': `${s.name}${owned ? '' : ` costs ${s.cost} gems`}`, onclick: async () => {
        if (owned) { store.update((pr) => equipSkin(pr, id, s.id)); refresh(); return; }
        if (p.gems < s.cost) { toast(`Need ${s.cost} gems - earn them from stages and missions`, true); return; }
        if (await confirmBox(`Buy ${s.name}?`, `Spend ${s.cost} gems on this outfit.`, 'Buy')) { const r = store.update((pr) => buySkin(pr, id, s.id)); if (r.ok) { store.update((pr) => equipSkin(pr, id, s.id)); sfx('ui_buy'); refresh(); } }
      } },
        h('img', { src: heroPortrait(id, s.id, 70), alt: '' }),
        h('div', { class: 'swatches' }, [s.c.main, s.c.dark, s.c.accent].map((c) => h('i', { style: { background: c } }))),
        s.name, h('div', { class: owned ? 'muted' : 'gem', html: on ? 'Equipped' : owned ? 'Owned' : `${icon('gem')} ${s.cost}` }));
    }))) : null;

  const el = h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } },
    h('div', { class: 'head' }, h('button', { class: 'back', 'aria-label': 'Back', onclick: () => go('heroes'), html: icon('back') }), h('h2', { class: 'title' }, d.name), currencyChips(p), gearButton()),
    h('div', { class: 'scroll nonav' },
      h('div', { class: 'panel' },
        h('div', { class: 'hero-top' },
          h('img', { src: heroPortrait(id, hero ? hero.skin : 'default', 170), alt: d.name }),
          h('div', { class: 'grow' },
            h('div', { class: 'muted' }, d.title),
            h('div', { class: 'row', style: { margin: '4px 0', flexWrap: 'wrap' } },
              h('span', { class: 'pill', style: { color: RARITY[d.rarity].color } }, RARITY[d.rarity].name),
              h('span', { class: 'pill muted' }, ROLES[d.role].name)),
            hero ? h('div', null,
              h('div', { style: { fontWeight: 900 } }, `Level ${lv} / ${cap}`),
              h('div', { class: 'stars', html: Array.from({ length: MAX_RANK }, (_, i) => `<span class="${i < rank ? '' : 'off'}">★</span>`).join('') }),
              h('div', { class: 'power ok', style: { marginTop: '4px' }, html: `${icon('bolt')} ${fmtFull(heroPower(id, lv, rank))}` })) : h('div', { class: 'muted' }, 'Not recruited yet'))),
        h('div', { class: 'stat-grid' },
          stat('Weapon', d.weapon),
          stat('Attack', atk.toFixed(1)),
          stat('Fire rate', (1 / d.base.interval).toFixed(1) + '/s'),
          stat('Range', d.base.range),
          stat('Crit chance', Math.round(d.base.crit * 100) + '%'),
          stat('Crit damage', '×' + d.base.critMult),
          stat('Pierce', d.base.pierce >= 99 ? 'All in line' : d.base.pierce + rb.pierce),
          stat('DPS (est.)', fmtFull(heroDps(id, lv, rank))))),
      h('div', { class: 'panel' },
        h('div', { class: 'row' }, h('b', null, `Ability: ${d.ability.name}`), h('span', { class: 'muted', style: { marginLeft: 'auto', fontSize: '.78rem' }, html: `${icon('clock')} ${Math.round(d.ability.cd * (1 - rb.cooldown * -1 * 0))}s` })),
        h('p', { class: 'muted', style: { fontSize: '.86rem', margin: '4px 0 10px' } }, d.ability.desc),
        h('b', null, `Passive: ${d.passive.name}`),
        h('p', { class: 'muted', style: { fontSize: '.86rem', margin: '4px 0 0' } }, d.passive.desc)),
      h('div', { class: 'panel' },
        h('b', null, 'Rank perks'),
        d.perks.map((t, i) => h('div', { class: 'perk' + (rank >= i + 2 ? ' on' : '') }, h('span', { class: 'r' }, i + 2), t))),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '12px' } }, actions),
      skins));
  return { el };
});

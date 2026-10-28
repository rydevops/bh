// Research, Missions and the cosmetic Wardrobe (GDD 11.2 "Shop" - with no real-money purchases).

import { h } from './dom.js';
import { icon } from './icons.js';
import { registerScreen, go, navBar, currencyChips, toast, confirmBox, refresh, sfx } from './app.js';
import { store } from '../store.js';
import { RESEARCH, RESEARCH_ORDER } from '../data/research.js';
import { DAILY_POOL, WEEKLY_POOL, LOGIN_CALENDAR } from '../data/missions.js';
import { HEROES, HERO_ORDER, TRAILS } from '../data/heroes.js';
import { heroPortrait } from '../render/sprites.js';
import { buyResearch, researchCost, claimMission, missionDef, claimLogin, loginState, ownsSkin, buySkin, equipSkin, buyTrail, equipTrail, ensureMissions } from '../economy.js';

const rewardHtml = (r) => [r.coins ? `<span class="coin">${icon('coin')} ${r.coins}</span>` : '', r.gems ? `<span class="gem">${icon('gem')} ${r.gems}</span>` : '', r.tokens ? `<span class="token">${icon('token')} ${r.tokens}</span>` : ''].filter(Boolean).join(' ');

// ------------------------------------------------------------------ research
registerScreen('research', () => {
  const p = store.profile;
  const rows = RESEARCH_ORDER.map((id) => {
    const r = RESEARCH[id];
    const lv = p.research[id] || 0;
    const cost = researchCost(p, id);
    return h('div', { class: 'panel rs' },
      h('div', { class: 'ico', html: icon(r.icon) }),
      h('div', { class: 'grow' },
        h('div', { style: { fontWeight: 900 } }, r.name),
        h('div', { class: 'muted', style: { fontSize: '.8rem' } }, lv ? r.desc(lv) : r.perLevel),
        h('div', { class: 'pips' }, Array.from({ length: r.max }, (_, i) => h('i', { class: i < lv ? 'on' : '' })))),
      cost == null
        ? h('span', { class: 'pill', style: { color: '#3fc98a' } }, 'MAX')
        : h('button', { class: 'btn small primary', disabled: p.tokens < cost, 'aria-label': `Research ${r.name} for ${cost} tokens`,
          onclick: () => { const res = store.update((pr) => buyResearch(pr, id)); if (res.ok) { sfx('ui_buy'); refresh(); } else toast(res.reason, true); }, html: `${icon('token')} ${cost}` }));
  });
  const el = h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } },
    h('div', { class: 'topbar' }, currencyChips(p)),
    h('div', { class: 'scroll' },
      h('h2', { class: 'title' }, 'Research'),
      h('p', { class: 'muted', style: { fontSize: '.84rem', margin: '4px 0 12px' } }, 'Permanent bonuses that apply to every run. Research tokens come from bosses, 3-star clears and weekly missions.'),
      rows),
    navBar('research'));
  return { el };
});

// ------------------------------------------------------------------ missions
registerScreen('missions', () => {
  const p = store.profile;
  store.update((pr) => ensureMissions(pr));
  const ls = loginState(p);
  const claimedDays = ls.claimedToday ? ls.streak : ls.streak % LOGIN_CALENDAR.length;
  const cal = h('div', { class: 'cal' }, LOGIN_CALENDAR.map((r, i) => {
    const doneN = ls.claimedToday ? ((ls.streak - 1) % LOGIN_CALENDAR.length) + 1 : ls.streak % LOGIN_CALENDAR.length;
    const done = i < doneN;
    const today = !ls.claimedToday && i === ls.streak % LOGIN_CALENDAR.length;
    return h('div', { class: 'day' + (done ? ' done' : '') + (today ? ' today' : '') }, h('span', { class: 'muted' }, `Day ${i + 1}`), h('div', { style: { fontSize: '.7rem', lineHeight: 1.5 }, html: rewardHtml(r).replace(/ /g, '<br>') }), done ? h('span', { html: icon('check') }) : h('span'));
  }));

  const list = (kind, items) => items.map((m, i) => {
    const d = missionDef(m.id);
    const ready = m.prog >= d.goal && !m.claimed;
    return h('div', { class: 'panel mission' },
      h('div', null, h('div', { style: { fontWeight: 800 } }, d.text), h('div', { class: 'muted', style: { fontSize: '.78rem' }, html: `${m.prog}/${d.goal} · ${rewardHtml(d.reward)}` })),
      h('button', { class: 'btn small ' + (ready ? 'good' : ''), disabled: !ready, onclick: () => { const r = store.update((pr) => claimMission(pr, kind, i)); if (r.ok) { sfx('ui_buy'); refresh(); } } }, m.claimed ? 'Claimed' : ready ? 'Claim' : 'Go'),
      h('div', { class: 'bar' + (m.claimed ? ' good' : '') }, h('i', { style: { width: Math.min(100, (m.prog / d.goal) * 100) + '%' } })));
  });

  const el = h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } },
    h('div', { class: 'topbar' }, currencyChips(p)),
    h('div', { class: 'scroll' },
      h('h2', { class: 'title' }, 'Missions'),
      h('div', { class: 'panel', style: { marginTop: '10px' } },
        h('div', { class: 'row' }, h('b', { class: 'grow', html: icon('gift') + ' Daily login' }),
          h('button', { class: 'btn small primary', disabled: ls.claimedToday, onclick: () => { const r = store.update((pr) => claimLogin(pr)); if (r.ok) { sfx('ui_buy'); toast('Reward claimed!'); refresh(); } } }, ls.claimedToday ? 'Claimed' : 'Claim')),
        cal),
      h('h3', { class: 'title', style: { margin: '16px 0 6px' } }, 'Daily'), list('daily', p.missions.daily),
      h('h3', { class: 'title', style: { margin: '16px 0 6px' } }, 'Weekly'), list('weekly', p.missions.weekly)),
    navBar('missions'));
  return { el };
});

// ------------------------------------------------------------------ wardrobe (cosmetics, gems only)
registerScreen('shop', () => {
  const p = store.profile;
  const heroBlocks = HERO_ORDER.filter((id) => p.heroes[id]).map((id) => {
    const d = HEROES[id];
    return h('div', { class: 'panel' },
      h('div', { style: { fontWeight: 900, marginBottom: '6px' } }, d.name),
      h('div', { class: 'skin-row' }, d.skins.map((s) => {
        const owned = ownsSkin(p, id, s.id), on = p.heroes[id].skin === s.id;
        return h('button', { class: 'skin' + (on ? ' on' : ''), 'aria-label': `${d.name} ${s.name}`, onclick: async () => {
          if (owned) { store.update((pr) => equipSkin(pr, id, s.id)); refresh(); return; }
          if (p.gems < s.cost) { toast(`Need ${s.cost} gems - earn them in-game`, true); return; }
          if (await confirmBox(`Buy ${s.name}?`, `Spend ${s.cost} gems on this outfit.`, 'Buy')) { store.update((pr) => { buySkin(pr, id, s.id); equipSkin(pr, id, s.id); }); sfx('ui_buy'); refresh(); }
        } }, h('img', { src: heroPortrait(id, s.id, 70), alt: '' }), s.name, h('div', { class: owned ? 'muted' : 'gem', html: on ? 'Equipped' : owned ? 'Owned' : `${icon('gem')} ${s.cost}` }));
      })));
  });
  const trails = h('div', { class: 'panel' },
    h('div', { style: { fontWeight: 900, marginBottom: '6px' } }, 'Bullet trails'),
    TRAILS.map((t) => {
      const owned = p.trails.includes(t.id), on = p.trail === t.id;
      return h('div', { class: 'setting' }, h('div', null, h('b', null, t.name), h('small', null, t.desc)),
        h('button', { class: 'btn small ' + (on ? 'good' : owned ? '' : 'primary'), onclick: async () => {
          if (owned) { store.update((pr) => equipTrail(pr, t.id)); refresh(); return; }
          if (p.gems < t.cost) { toast(`Need ${t.cost} gems`, true); return; }
          if (await confirmBox(`Buy ${t.name}?`, `Spend ${t.cost} gems.`, 'Buy')) { store.update((pr) => { buyTrail(pr, t.id); equipTrail(pr, t.id); }); sfx('ui_buy'); refresh(); }
        }, html: on ? 'Equipped' : owned ? 'Equip' : `${icon('gem')} ${t.cost}` }));
    }));
  const el = h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } },
    h('div', { class: 'topbar' }, currencyChips(p)),
    h('div', { class: 'scroll' },
      h('h2', { class: 'title' }, 'Wardrobe'),
      h('div', { class: 'banner-note', style: { margin: '10px 0' } }, h('span', { html: icon('shield') }), 'No ads. No real-money purchases. Gems are earned by playing, and only buy cosmetics.'),
      heroBlocks, trails),
    navBar('shop'));
  return { el };
});

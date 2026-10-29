// Squad selection sheet (GDD 5.2): slots, power, synergy, presets.

import { h } from './dom.js';
import { icon } from './icons.js';
import { openSheet, toast, sfx } from './app.js';
import { store } from '../store.js';
import { HEROES, HERO_ORDER, ROLES } from '../data/heroes.js';
import { heroPortrait } from '../render/sprites.js';
import { setSquad, savePreset, loadPreset } from '../economy.js';
import { slotCount, squadPower, squadAnalysis, heroPower } from '../progression.js';
import { recPower } from '../data/stages.js';
import { fmtFull } from '../util.js';

export function powerClass(have, need) { return have >= need ? 'ok' : have >= need * 0.8 ? 'warn' : 'low'; }

/**
 * "Start with" row: pick which squad hero opens the battle alone. The rest of the squad is summoned at random
 * by reward cards after each wave. Choosing moves that hero to the front of the saved squad.
 */
export function leadPicker(onChange) {
  const p = store.profile;
  return h('div', { class: 'lead-pick' },
    h('div', { class: 'muted', style: { fontSize: '.72rem', fontWeight: 900, letterSpacing: '.08em', marginBottom: '4px' } }, 'START WITH'),
    h('div', { class: 'lead-row' }, p.squad.map((id, i) => h('button', {
      class: 'lead-btn' + (i === 0 ? ' on' : ''), 'aria-pressed': String(i === 0), 'aria-label': `${HEROES[id].name}${i === 0 ? ' (starting hero)' : ': start with this hero'}`,
      onclick: () => { if (i === 0) return; sfx('ui_click'); store.update((pr) => setSquad(pr, [id, ...pr.squad.filter((x) => x !== id)])); onChange(); },
    }, h('img', { src: heroPortrait(id, p.heroes[id].skin, 64), alt: '' }), h('span', null, HEROES[id].name)))),
    p.squad.length > 1 ? h('div', { class: 'muted', style: { fontSize: '.72rem', marginTop: '4px' } }, 'The other heroes join at random through reward cards after each wave.') : null);
}

export function openSquad({ stage = null, onDone } = {}) {
  let sheet;
  const render = () => {
    const p = store.profile;
    const slots = slotCount(p);
    const squad = p.squad;
    const an = squadAnalysis(squad);
    const power = squadPower(p);
    const slotEls = [];
    for (let i = 0; i < 4; i++) {
      if (i >= slots) { slotEls.push(h('div', { class: 'slot lock', title: 'Unlocks after stage 2-2' }, h('span', { html: icon('lock') }))); continue; }
      const id = squad[i];
      if (!id) { slotEls.push(h('div', { class: 'slot', 'aria-label': 'Empty slot' }, h('span', { class: 'muted' }, '+'))); continue; }
      const hero = p.heroes[id];
      const remove = () => { if (squad.length <= 1) { toast('A squad needs at least one hero', true); return; } store.update((pr) => setSquad(pr, pr.squad.filter((x) => x !== id))); render(); };
      const makeLead = () => { if (i === 0) return; store.update((pr) => setSquad(pr, [id, ...pr.squad.filter((x) => x !== id)])); render(); };
      slotEls.push(h('div', { class: 'slot filled' + (i === 0 ? ' lead' : '') },
        h('button', { class: 'slot-main', 'aria-label': i === 0 ? `${HEROES[id].name}, starts the battle` : `Make ${HEROES[id].name} the lead hero`, onclick: makeLead },
          h('img', { src: heroPortrait(id, hero.skin, 80), alt: '' }), h('span', { class: 'nm' }, `${HEROES[id].name} · Lv${hero.lv}`)),
        h('span', { class: 'lead-tag' + (i === 0 ? '' : ' alt') }, i === 0 ? 'START' : 'RANDOM'),
        h('button', { class: 'slot-x', 'aria-label': `Remove ${HEROES[id].name}`, onclick: remove }, '×')));
    }
    const picks = HERO_ORDER.map((id) => {
      const def = HEROES[id], hero = p.heroes[id];
      const inSquad = squad.includes(id);
      return h('button', {
        class: 'pick' + (inSquad ? ' on' : '') + (hero ? '' : ' locked'), 'aria-label': def.name + (hero ? '' : ' (locked)'),
        onclick: () => {
          if (!hero) { toast(`${def.name}: ${def.unlock.frags} fragments needed. ${def.unlock.hint}`, true); return; }
          if (inSquad) return;
          if (squad.length >= slots) { toast('Squad is full - tap a hero above to swap them out', true); return; }
          store.update((pr) => setSquad(pr, [...pr.squad, id])); render();
        },
      }, h('img', { src: heroPortrait(id, hero ? hero.skin : 'default', 80), alt: '' }), def.name, h('div', { class: 'muted' }, hero ? `⚡${fmtFull(heroPower(id, hero.lv, hero.rank))}` : '🔒'));
    });
    const rec = stage ? recPower(stage.idx) : null;
    const preset = (k) => h('div', { class: 'row', style: { gap: '4px' } },
      h('button', { class: 'btn small grow', onclick: () => { store.update((pr) => savePreset(pr, k)); toast(`Saved squad ${k}`); render(); } }, `Save ${k}`),
      h('button', { class: 'btn small grow', disabled: !p.presets[k], onclick: () => { store.update((pr) => loadPreset(pr, k)); render(); } }, `Load ${k}`));
    const body = h('div', null,
      h('div', { class: 'row', style: { justifyContent: 'space-between', marginBottom: '8px' } },
        h('h3', { class: 'title' }, 'Your squad'),
        h('span', { class: 'power ' + (rec ? powerClass(power, rec) : 'ok'), html: `${icon('bolt')} ${fmtFull(power)}${rec ? ` <small class="muted">/ ${fmtFull(rec)} rec.</small>` : ''}` })),
      h('p', { class: 'muted', style: { fontSize: '.78rem', margin: '0 0 8px' } }, 'Your lead hero starts every battle alone (you can also change them on the stage screen). The others are summoned at random by reward cards after each wave.'),
      h('div', { class: 'slots' }, slotEls),
      h('div', { class: 'panel', style: { marginTop: '10px' } },
        h('div', { class: 'muted', style: { fontSize: '.72rem', fontWeight: 900, letterSpacing: '.08em', marginBottom: '4px' } }, 'SQUAD STRENGTHS & GAPS'),
        an.checks.map((c) => h('div', { class: 'check ' + (c.ok ? 'ok' : 'no') }, h('span', { html: icon(c.ok ? 'check' : 'x') }), c.label))),
      h('div', { class: 'muted', style: { fontSize: '.72rem', fontWeight: 900, letterSpacing: '.08em', margin: '12px 0 4px' } }, 'ROSTER'),
      h('div', { class: 'hscroll' }, picks),
      h('div', { class: 'row', style: { gap: '8px' } }, preset('A'), preset('B')),
      h('button', { class: 'btn primary block', style: { marginTop: '12px' }, onclick: () => { sheet.close(); if (onDone) onDone(); } }, stage ? 'Confirm squad' : 'Done'));
    sheet.el.replaceChildren(body);
  };
  sheet = openSheet(h('div'));
  render();
  return sheet;
}

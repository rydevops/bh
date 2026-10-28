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
      slotEls.push(h('button', {
        class: 'slot filled', 'aria-label': `Remove ${HEROES[id].name}`,
        onclick: () => { if (squad.length <= 1) { toast('A squad needs at least one hero', true); return; } store.update((pr) => setSquad(pr, pr.squad.filter((x) => x !== id))); render(); },
      }, h('img', { src: heroPortrait(id, hero.skin, 80), alt: '' }), h('span', { class: 'nm' }, `${HEROES[id].name} · Lv${hero.lv}`)));
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

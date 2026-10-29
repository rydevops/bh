// Every way into a battle (Home "Battle", Survive, results "Next" / "Retry", the stage sheet) lets the player choose
// which squad hero starts it. This is the shared prompt for the entry points that have no stage sheet of their own.

import { h } from './dom.js';
import { openSheet } from './app.js';
import { leadPicker } from './squad.js';
import { startCombat } from './combat.js';
import { store } from '../store.js';
import { STAGE_BY_ID } from '../data/stages.js';

/**
 * Ask "who starts?" and then begin the battle described by `opts` ({ stageId, hard } or { survival: true }).
 * A one-hero squad has nothing to choose, so it starts straight away.
 */
export function startWithLeadPick(opts) {
  if (store.profile.squad.length < 2) { startCombat(opts); return; }
  const stage = opts.survival ? null : STAGE_BY_ID[opts.stageId];
  let sheet;
  const render = () => sheet.el.replaceChildren(h('div', null,
    h('div', { class: 'muted', style: { fontWeight: 900, fontSize: '.72rem', letterSpacing: '.1em' } }, stage ? `STAGE ${stage.id}` : 'SURVIVAL'),
    h('h2', { class: 'title', style: { fontSize: '1.5rem' } }, stage ? stage.name : 'Endless waves'),
    h('p', { class: 'muted', style: { margin: '6px 0 10px', fontSize: '.85rem' } }, 'Choose who starts the battle. Your other heroes join at random through the reward cards after each wave.'),
    leadPicker(() => render()),
    h('button', { class: 'btn primary big block', style: { marginTop: '12px' }, onclick: () => { sheet.close(); startCombat(opts); } }, 'Start')));
  sheet = openSheet(h('div'));
  render();
}

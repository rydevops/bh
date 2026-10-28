// Stage selection (GDD 11.2): worlds, stage map, rewards, difficulty, enemy preview.

import { h } from './dom.js';
import { icon, stars } from './icons.js';
import { registerScreen, go, navBar, currencyChips, openSheet, toast, refresh } from './app.js';
import { startCombat } from './combat.js';
import { openSquad, powerClass } from './squad.js';
import { store } from '../store.js';
import { STAGES, WORLDS, stagesOfWorld, recPower, MILESTONES } from '../data/stages.js';
import { ENEMIES, BOSSES, MODIFIERS } from '../data/enemies.js';
import { HEROES } from '../data/heroes.js';
import { enemyPortrait, bossPortrait } from '../render/sprites.js';
import { isStageUnlocked, survivalUnlocked, hardUnlocked } from '../economy.js';
import { squadPower } from '../progression.js';
import { fmtFull } from '../util.js';

let viewWorld = null;

registerScreen('stages', ({ world } = {}) => {
  const p = store.profile;
  if (world != null) viewWorld = world;
  if (viewWorld == null) viewWorld = (STAGES.find((s) => !p.stages[s.id]) || STAGES[STAGES.length - 1]).world;
  const bossOf = (w) => STAGES.find((s) => s.world === w && s.boss);
  const unlockedWorld = (w) => w === 0 || !!p.stages[bossOf(w - 1).id];

  const tabs = h('div', { class: 'world-tabs' }, WORLDS.map((w) => h('button', {
    class: 'tabw' + (viewWorld === w.id ? ' on' : '') + (unlockedWorld(w.id) ? '' : ' lock'),
    onclick: () => { if (!unlockedWorld(w.id)) { toast('Defeat the previous world\'s boss to travel here', true); return; } viewWorld = w.id; go('stages'); },
  }, unlockedWorld(w.id) ? '' : '🔒 ', w.name)));

  const list = stagesOfWorld(viewWorld);
  const map = h('div', { class: 'map' }, list.map((s, i) => {
    const rec = p.stages[s.id];
    const unlocked = isStageUnlocked(p, s);
    const cur = unlocked && !rec;
    return h('button', {
      class: 'node' + (s.boss ? ' boss' : '') + (rec ? ' cleared' : '') + (cur ? ' cur' : '') + (unlocked ? '' : ' locked'),
      'aria-label': `Stage ${s.id} ${s.name}${unlocked ? '' : ' locked'}`,
      onclick: () => { if (!unlocked) { toast('Clear the previous stage first', true); return; } openStage(s); },
    },
      h('div', { class: 'num' }, unlocked ? (s.boss ? h('span', { html: icon('skull') }) : s.id) : h('span', { html: icon('lock') })),
      h('div', { class: 'grow' },
        h('div', { class: 'title', style: { fontSize: '1rem' } }, s.name),
        h('div', { class: 'row muted', style: { fontSize: '.74rem', gap: '10px' } },
          h('span', null, `Stage ${s.id}`),
          s.mod ? h('span', null, `${MODIFIERS[s.mod].icon} ${MODIFIERS[s.mod].name}`) : null),
        rec ? h('div', { class: 'stars', html: stars(rec.stars) }) : null),
      h('div', { class: 'muted', style: { fontSize: '.7rem', textAlign: 'right' }, html: `${icon('bolt')} ${fmtFull(recPower(s.idx))}` }));
  }));

  const surv = h('div', { class: 'panel', style: { margin: '0 0 12px' } },
    h('div', { class: 'row' },
      h('div', { class: 'grow' },
        h('div', { class: 'title', style: { fontSize: '1.05rem' }, html: icon(survivalUnlocked(p) ? 'wave' : 'lock') + ' Survival' }),
        h('div', { class: 'muted', style: { fontSize: '.78rem' } }, survivalUnlocked(p) ? `Endless escalating waves. Best: wave ${p.survivalBest + 1 > 1 ? p.survivalBest + 1 : '-'}` : `Clear stage ${MILESTONES.survival.stage} to unlock.`)),
      h('button', { class: 'btn small primary', disabled: !survivalUnlocked(p), onclick: () => startCombat({ survival: true }) }, 'Start')));

  const el = h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } },
    h('div', { class: 'head' }, h('button', { class: 'back', 'aria-label': 'Back', onclick: () => go('home'), html: icon('back') }), h('h2', { class: 'title' }, 'Campaign')),
    tabs,
    h('div', { class: 'scroll' }, h('p', { class: 'muted', style: { margin: '0 4px 10px', fontSize: '.82rem' } }, WORLDS[viewWorld].blurb), surv, map),
    navBar('home'));
  return { el };
});

function openStage(s) {
  const p = store.profile;
  const rec = p.stages[s.id];
  const first = !rec;
  const hardOn = !!p.flags.hardMode && hardUnlocked(p);
  let sheet;
  const render = () => {
    const power = squadPower(p);
    const need = recPower(s.idx) * (p.flags.hardMode && hardUnlocked(p) ? 1.5 : 1);
    const enemies = s.enemies.map((id) => h('div', { class: 'enemy-chip', title: ENEMIES[id].blurb }, h('img', { src: enemyPortrait(id, s.world, 32), alt: '' }), ENEMIES[id].names[s.world]));
    if (s.boss) enemies.unshift(h('div', { class: 'enemy-chip', style: { borderColor: '#ff6a6a' } }, h('img', { src: bossPortrait(s.boss, 36), alt: '' }), BOSSES[s.boss].name));
    const frags = s.frag.map((f) => h('span', { class: 'reward', html: `${icon('star')} ${HEROES[f.hero].name} ×${first ? f.n : Math.ceil(f.n / 2)}` }));
    sheet.el.replaceChildren(h('div', null,
      h('div', { class: 'muted', style: { fontWeight: 900, fontSize: '.72rem', letterSpacing: '.1em' } }, `${WORLDS[s.world].name.toUpperCase()} · STAGE ${s.id}`),
      h('h2', { class: 'title', style: { fontSize: '1.5rem' } }, s.name),
      s.boss ? h('p', { class: 'muted', style: { margin: '6px 0', fontSize: '.85rem' } }, BOSSES[s.boss].blurb) : null,
      s.mod ? h('div', { class: 'banner-note', style: { margin: '8px 0' } }, `${MODIFIERS[s.mod].icon} ${MODIFIERS[s.mod].name}: ${MODIFIERS[s.mod].desc}`) : null,
      h('div', { class: 'muted', style: { fontSize: '.72rem', fontWeight: 900, letterSpacing: '.08em', marginTop: '10px' } }, 'ENEMIES'),
      h('div', { class: 'chips-row' }, enemies),
      h('div', { class: 'muted', style: { fontSize: '.72rem', fontWeight: 900, letterSpacing: '.08em', marginTop: '10px' } }, first ? 'REWARDS (FIRST CLEAR BONUS)' : 'REWARDS'),
      h('div', { class: 'chips-row' },
        h('span', { class: 'reward coin', html: `${icon('coin')} ${s.coins * (first ? 2 : 1)}+` }),
        first ? h('span', { class: 'reward gem', html: `${icon('gem')} ${s.gems}` }) : null,
        s.tokens ? h('span', { class: 'reward token', html: `${icon('token')} ${first ? s.tokens : 1}` }) : null,
        frags),
      hardUnlocked(p) ? h('div', { class: 'row', style: { margin: '8px 0' } },
        h('span', { class: 'grow' }, h('b', null, 'Hard mode'), h('div', { class: 'muted', style: { fontSize: '.72rem' } }, 'Tougher enemies, +80% rewards')),
        h('button', { class: 'switch', role: 'switch', 'aria-label': 'Hard mode', 'aria-checked': String(!!p.flags.hardMode), onclick: () => { store.update((pr) => { pr.flags.hardMode = !pr.flags.hardMode; }); render(); } })) : null,
      h('div', { class: 'row', style: { justifyContent: 'space-between', margin: '10px 0' } },
        h('span', { class: 'muted' }, 'Squad power'),
        h('b', { class: 'power ' + powerClass(power, need), html: `${icon('bolt')} ${fmtFull(power)} / ${fmtFull(need)}` })),
      h('div', { class: 'row' },
        h('button', { class: 'btn grow', onclick: () => openSquad({ stage: s, onDone: () => render() }), html: icon('heroes') + ' Squad' }),
        h('button', { class: 'btn primary grow', onclick: () => { sheet.close(); store.update((pr) => { pr.flags.lastStage = s.id; }); startCombat({ stageId: s.id, hard: !!store.profile.flags.hardMode && hardUnlocked(store.profile) }); } }, 'Start'))));
  };
  sheet = openSheet(h('div'));
  render();
}

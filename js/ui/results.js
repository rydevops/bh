// Victory / defeat screen (GDD 11.2): rewards, performance, retry and continue.

import { h } from './dom.js';
import { icon } from './icons.js';
import { registerScreen, go, sfx, topBar } from './app.js';
import { startWithLeadPick } from './lead.js';
import { STAGE_BY_ID, STAGES } from '../data/stages.js';
import { HEROES } from '../data/heroes.js';
import { fmtFull } from '../util.js';
import { audio } from '../audio/index.js';
import { store } from '../store.js';
import { isStageUnlocked } from '../economy.js';

registerScreen('results', ({ result, reward, stageId, hard, survival }) => {
  const stage = stageId ? STAGE_BY_ID[stageId] : null;
  const win = result.win;
  const next = stage && win ? STAGES[stage.idx + 1] : null;
  const p = store.profile;
  const line = (ic, label, value, delay) => h('div', { class: 'line', style: { animationDelay: delay + 's' } },
    h('span', { html: icon(ic) + ' ' + label }), h('b', null, value));
  const lines = [];
  let d = 0.2;
  if (reward.coins) lines.push(line('coin', 'Coins', '+' + fmtFull(reward.coins), (d += 0.15)));
  if (reward.gems) lines.push(line('gem', 'Gems', '+' + reward.gems, (d += 0.15)));
  if (reward.tokens) lines.push(line('token', 'Research tokens', '+' + reward.tokens, (d += 0.15)));
  for (const id in reward.frags) lines.push(line('star', `${HEROES[id].name} fragments`, '+' + reward.frags[id], (d += 0.15)));
  if (reward.converted) lines.push(line('coin', 'Surplus fragments converted', '+' + reward.converted, (d += 0.15)));
  if (!lines.length) lines.push(h('div', { class: 'muted center' }, 'Nothing earned this time.'));

  const el = h('div', { class: 'scroll nonav pad-top', style: { flex: 1 } },
    h('h1', { class: 'title res-title ' + (win ? 'win' : 'lose') }, survival ? `Wave ${result.wave + 1}` : win ? 'Victory!' : 'Defeat'),
    survival
      ? h('div', { class: 'center muted' }, reward.newBest ? '🏆 New personal best!' : `Best: wave ${p.survivalBest + 1}`)
      : win
        ? [h('div', { class: 'big-stars' }, [1, 2, 3].map((i) => h('span', { class: i <= reward.stars ? 'on' : '', style: { animationDelay: 0.2 + i * 0.25 + 's' } }, '★'))),
          h('div', { class: 'center muted' }, reward.firstClear ? 'First clear bonus applied!' : 'Stage cleared')]
        : h('div', { class: 'center muted', style: { margin: '6px 0 12px' } }, 'The wall fell - but you still earned a share. Upgrade your heroes and try again.'),
    h('div', { class: 'panel', style: { marginTop: '14px' } }, h('div', { class: 'rew' }, lines)),
    ...reward.unlocks.map((u) => h('div', { class: 'unlock-note' }, '🔓 ' + u)),
    h('div', { class: 'panel' },
      h('div', { class: 'stat-line' }, h('span', null, 'Enemies defeated'), h('b', null, result.kills)),
      h('div', { class: 'stat-line' }, h('span', null, 'Bullets cut'), h('b', null, result.cuts)),
      h('div', { class: 'stat-line' }, h('span', null, 'Abilities used'), h('b', null, result.abilities)),
      h('div', { class: 'stat-line' }, h('span', null, 'Wall health left'), h('b', null, Math.round(result.baseFrac * 100) + '%')),
      h('div', { class: 'stat-line' }, h('span', null, 'Time'), h('b', null, `${Math.floor(result.time / 60)}:${String(Math.floor(result.time % 60)).padStart(2, '0')}`))),
    h('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '14px' } },
      next && isStageUnlocked(p, next)
        ? h('button', { class: 'btn primary big block', onclick: () => startWithLeadPick({ stageId: next.id }) }, `Next: ${next.id}`)
        : null,
      h('div', { class: 'row' },
        h('button', { class: 'btn grow', onclick: () => startWithLeadPick(survival ? { survival: true } : { stageId, hard }) }, 'Retry'),
        h('button', { class: 'btn grow', onclick: () => go('home') }, 'Home'))));
  audio.playMusic('menu');
  return { el: h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } }, topBar(p), el) };
});

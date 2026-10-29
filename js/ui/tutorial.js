// First-run tutorial: a real (forgiving) battle on stage 1-1 with coach marks, followed by a short tour of the
// rest of the game. Shown once on a new device or after "Reset all progress"; every card has a Skip button.
// The battle is wired in combat.js (startCombat({ tutorial: true })); this module only owns the coaching.

import { h } from './dom.js';
import { W } from '../sim/game.js';
import { stripY } from '../render/renderer.js';

// ---- what the coach says -------------------------------------------------------------------------------------
// modal: freezes the battle and dims everything except the highlighted part.
// task:  the battle keeps running and the player is asked to try something (can be skipped).
const BATTLE = [
  { id: 'welcome', modal: true, target: (c) => c.el('base'),
    title: 'Welcome, Commander!', text: 'Monsters march down the screen toward your wall. If the WALL bar runs out, you lose. Hold the wall for all 12 waves of a stage to win it.' },
  { id: 'wave', modal: true, target: (c) => c.union(c.el('wave'), c.el('waveBar')),
    title: 'Waves', text: 'The thin bar shows how many enemies are left in this wave. Monsters come out from behind these bars, and they cannot hurt you (or be hurt) until they walk past them.' },
  { id: 'controls', modal: true, target: (c) => c.rect('.hud-top'),
    title: 'Pause and speed', text: 'The button on the left pauses. The one on the right switches to 2× speed, which unlocks the first time you clear a stage.' },
  { id: 'hero', modal: true, when: (g) => g.t > 0.4, target: (c) => c.hero(),
    title: 'Your hero fires by themselves', text: 'You start each battle with one hero. The bar under their feet is their reload: when it is full they shoot. Upgrades like Multi-Shot make a hero fire several bullets in a row.' },
  { id: 'ammo', modal: true, target: (c) => c.strip(),
    title: 'The revolver is your ammo', text: 'Every shot uses a bullet from the ammo pile on the right. The clock hand sweeps around the revolver and each loaded chamber it passes drops a new bullet onto the pile. Out of ammo? Heroes wait for the hand. Upgrades load more chambers.' },
  { id: 'cut', task: true, when: (g) => g.t > 3, target: (c) => c.rect('.cutmeter'),
    setup: (g, st) => { st.cuts0 = g.stats.cuts; for (let i = 0; i < 3; i++) g.spawnEnemyBullet(90 + i * 90, 235 + (i % 2) * 40, 0, 0, 1, 6, 1, 'spit'); }, // hang in the air until cut
    done: (g, st) => g.stats.cuts > st.cuts0,
    title: 'Try it: cut a bullet', text: 'Enemies shoot bullets at your wall. Swipe your finger across one of these to slice it before it lands. Each cut costs CUT energy (the bar at the bottom), and a cut bullet drops into your ammo pile.' },
  { id: 'ability', task: true, target: (c) => c.rect('.abil'),
    setup: (g, st) => { st.ab0 = g.stats.abilities; for (const hh of g.heroes) hh.ab.cd = 0; },
    done: (g, st) => g.stats.abilities > st.ab0,
    title: 'Try it: use an ability', text: 'Tap your hero’s portrait at the bottom to fire their special ability. It recharges over time, and cutting bullets charges it faster.' },
  { id: 'cards', info: true, when: (g) => g.state === 'upgrade',
    title: 'Pick a reward', text: 'After every wave you choose 1 of 3 cards. Upgrades last for this battle. A gold Summon card calls another hero from your squad into the fight, picked at random, so your squad builds up as you go.' },
];

const TOUR = [
  { title: 'Winning stages', text: 'Clear a stage to earn coins, gems, hero fragments and research tokens. The first clear pays extra, and replays still pay coins and research tokens. Lose and you keep part of the coins and a few fragments.' },
  { title: 'Your heroes', text: 'Spend coins to level heroes up and fragments to rank them up. Every stage drops fragments for Vanguard, Rook and Patch. Recruit Pulse, Specter and Ember with their own fragments. On the stage screen you choose who starts the battle.' },
  { title: 'Research', text: 'Research tokens, earned on every stage, buy permanent bonuses for every battle: a tougher wall, faster reloads, more ammo and more. Open the Research tab to spend them.' },
  { title: 'Missions and rewards', text: 'Daily and weekly missions and a 7-day login calendar give out coins, gems and tokens.' },
  { title: 'Wardrobe and settings', text: 'Spend gems on cosmetic skins and bullet trails. The gear icon opens Settings: sound, accessibility, saving a backup, and Reset all progress. There are no ads and no real-money purchases, ever.' },
  { title: 'You’re ready!', text: 'That’s everything. Tap below to open the main menu and start your first real stage.', last: true },
];

/** Total number of coaching cards, for the “Step n of N” label. */
const TOTAL = BATTLE.length + TOUR.length;

// ---- plumbing --------------------------------------------------------------------------------------------------
export function initTutorial(s) {
  const hud = document.getElementById('hud');
  const root = h('div', { class: 'coach', 'aria-live': 'polite' });
  hud.append(root);
  s.tut = { root, i: 0, step: null, st: {}, phase: 'battle', tour: 0, seenCards: false };
}

function geometry(s) {
  const hud = document.getElementById('hud');
  const box = hud.getBoundingClientRect();
  const k = s.cssW / W;
  const rel = (r) => ({ x: r.left - box.left, y: r.top - box.top, w: r.width, h: r.height });
  const q = (sel) => { const e = hud.querySelector(sel); return e ? rel(e.getBoundingClientRect()) : null; };
  const g = s.game;
  return {
    box,
    el: (name) => { const e = s.hud[name]; return e ? rel(e.getBoundingClientRect()) : null; },
    rect: q,
    union: (a, b) => { if (!a || !b) return a || b; const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y); return { x, y, w: Math.max(a.x + a.w, b.x + b.w) - x, h: Math.max(a.y + a.h, b.y + b.h) - y }; },
    hero: () => { const hh = g.heroes[0]; return hh ? { x: (hh.x - 38) * k, y: (hh.y - 62) * k, w: 76 * k, h: 116 * k } : null; },
    strip: () => ({ x: 6 * k, y: (stripY(g) - 34) * k, w: 348 * k, h: 68 * k }),
  };
}

function show(s, def, { n, modal, target, task, info, last }) {
  const t = s.tut;
  const geo = geometry(s);
  const r = target ? target(geo) : null;
  const pad = 6;
  const spot = r ? h('div', { class: 'coach-spot' + (modal ? ' dim' : ''), style: { left: r.x - pad + 'px', top: r.y - pad + 'px', width: r.w + pad * 2 + 'px', height: r.h + pad * 2 + 'px' } }) : null;
  const H = geo.box.height;
  const cy = r ? r.y + r.h / 2 : H * 0.4;
  // Practice steps keep the lane above the card clear; modal cards sit on the opposite half from what they point at.
  const pos = info ? { bottom: 'calc(var(--sab) + 16px)' } : { top: (task || cy < H * 0.5 ? H * 0.46 : Math.max(H * 0.2, 150)) + 'px' };
  const ov = s.hud && s.hud.overlay;
  if (ov) ov.style.paddingBottom = info ? '250px' : ''; // lift the reward cards clear of the coach card
  const actions = [h('button', { class: 'btn small ghost', onclick: () => s.tutExit('skip') }, 'Skip tutorial')];
  if (task) actions.push(h('button', { class: 'btn small', onclick: () => next(s) }, 'Skip step'));
  else actions.push(h('button', { class: 'btn small primary', onclick: () => (last ? s.tutExit('done') : next(s)) }, last ? 'Start playing' : info ? 'Got it' : 'Next'));
  const card = h('div', { class: 'coach-card', style: pos },
    h('div', { class: 'coach-step' }, `Step ${n} of ${TOTAL}`),
    h('h3', { class: 'title' }, def.title),
    h('p', null, def.text),
    h('div', { class: 'row coach-actions' }, actions));
  t.root.replaceChildren(...(modal ? [h('div', { class: 'coach-block' + (r ? '' : ' dim') })] : []), ...(spot ? [spot] : []), card);
  t.root.classList.add('on');
}

function hide(s) {
  s.tut.root.classList.remove('on'); s.tut.root.replaceChildren();
  if (s.hud && s.hud.overlay) s.hud.overlay.style.paddingBottom = '';
}

function release(s) {
  const t = s.tut;
  if (t.pausedByCoach) { t.pausedByCoach = false; s.paused = false; s.last = performance.now(); }
}

/** The player pressed Next / Skip step / Got it. */
function next(s) {
  const t = s.tut;
  hide(s);
  if (t.phase === 'tour') { t.tour++; t.step = null; return tick(s); }
  const def = t.step;
  if (def && def.id === 'cards') { t.cardAck = true; return; } // the card stays until they actually pick a reward
  t.step = null; t.st = {}; t.i++;
  release(s);
  tick(s);
}

/** Called every frame from combat.js. */
export function tutorialTick(s) { if (s.tut && !s.ended) tick(s); }

function tick(s) {
  const t = s.tut, g = s.game;
  if (t.phase === 'tour') {
    if (t.step) return;
    const card = TOUR[t.tour];
    if (!card) { s.tutExit('done'); return; }
    t.step = card;
    s.paused = true; t.pausedByCoach = true;
    show(s, card, { n: BATTLE.length + t.tour + 1, modal: true, last: !!card.last });
    return;
  }
  const cardsIdx = BATTLE.findIndex((d) => d.id === 'cards');
  const def = BATTLE[t.i];
  if (!def) { t.phase = 'tour'; t.step = null; release(s); return tick(s); }
  // A reward round opened before the player finished the practice steps: go straight to explaining it.
  if (g.state === 'upgrade' && def.id !== 'cards' && t.i < cardsIdx) {
    hide(s); release(s); t.step = null; t.st = {}; t.i = cardsIdx; return tick(s);
  }
  if (t.step) {
    if (def.task && def.done(g, t.st)) next(s);
    else if (def.id === 'cards' && g.state !== 'upgrade') { hide(s); t.step = null; t.i++; tick(s); } // they picked a card: lesson over
    return;
  }
  if (g.state === 'victory' || g.state === 'defeat') { t.phase = 'tour'; return; }
  if (def.when && !def.when(g)) return;
  t.step = def;
  if (def.setup) def.setup(g, t.st);
  if (def.modal) { s.paused = true; t.pausedByCoach = true; }
  show(s, def, { n: t.i + 1, modal: !!def.modal, target: def.target, task: !!def.task, info: !!def.info });
}

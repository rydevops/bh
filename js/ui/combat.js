// Combat session controller: owns the Game, Renderer, input, HUD and in-battle overlays.

import { h, clear } from './dom.js';
import { icon } from './icons.js';
import { Game, W } from '../sim/game.js';
import { Renderer, layoutFor, skyTop } from '../render/renderer.js';
import { heroPortrait } from '../render/sprites.js';
import { STAGE_BY_ID } from '../data/stages.js';
import { RARITY } from '../data/heroes.js';
import { UPGRADES, CATEGORY } from '../data/upgrades.js';
import { applyRunResult } from '../economy.js';
import { store } from '../store.js';
import { audio } from '../audio/index.js';
import { go, haptic, openSheet, confirmBox, applySettings, sfx, toast, setEdgeColor } from './app.js';

const STEP = 1 / 60;
let session = null;
let safeBottom = 0;

export function measureSafeArea() {
  const probe = h('div', { style: { position: 'fixed', bottom: '0', height: 'env(safe-area-inset-bottom, 0px)', visibility: 'hidden' } });
  document.body.append(probe);
  safeBottom = probe.getBoundingClientRect().height || 0;
  probe.remove();
}

export const inCombat = () => !!session;

/**
 * Begin a battle.
 * opts: { stageId?: string, survival?: bool, hard?: bool, resume?: checkpoint }
 */
export function startCombat(opts) {
  if (session) endSession();
  const p = store.profile;
  const cp = opts.resume || null;
  const stage = cp ? (cp.survival ? null : STAGE_BY_ID[cp.stageId]) : opts.survival ? null : STAGE_BY_ID[opts.stageId];
  const hard = cp ? cp.hard : !!opts.hard;
  const squadSrc = cp ? cp.squad : p.squad.map((id) => ({ id, lv: p.heroes[id].lv, rank: p.heroes[id].rank, skin: p.heroes[id].skin }));
  // always use the *current* hero progression for display skin, but the checkpointed levels for fairness
  const app = document.getElementById('app');
  const canvas = document.getElementById('game');
  const cssW = app.clientWidth, cssH = app.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const layout = layoutFor(cssW, cssH, safeBottom);
  const settings = p.settings;

  const runId = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const game = new Game({
    stage, hard, squad: squadSrc, research: p.research, layout, seed: (Math.random() * 2 ** 31) | 0,
    autoAbility: settings.autoAbility, resume: cp,
  });
  const renderer = new Renderer(canvas);
  renderer.resize(cssW, cssH, dpr);
  renderer.attach(game, settings, p.trail);

  const s = session = {
    opts, stage, hard, game, renderer, canvas, runId, cssW, cssH, layout, dpr,
    // 2x speed is a reward for clearing the stage once (Survival: once you have a best wave).
    canFast: stage ? !!p.stages[stage.id] : p.survivalBest > 0,
    paused: false, raf: 0, acc: 0, last: performance.now(), speed: 1, trailPts: [], cutBlade: [],
    hud: null, ended: false, endTimer: 0, tipT: 0, shown: {}, lastMusic: null,
  };
  document.body.classList.add('in-combat');
  buildHud(s);
  renderer.onEvent = (e) => onEvent(s, e);
  // The status-bar strip matches the top row of this world's sky (see setEdgeColor).
  renderer.onWorld = (w) => setEdgeColor(skyTop(w));
  bindInput(s);
  const world = stage ? stage.world : 0;
  playBattleMusic(s, false, world);
  s.last = performance.now();
  s.raf = requestAnimationFrame((t) => frame(s, t));
  if (!cp) { store.update((pr) => { pr.checkpoint = null; }); }
  return s;
}

function playBattleMusic(s, boss, world) {
  const name = boss ? 'boss' : 'battle' + (world ?? 0);
  if (s.lastMusic === name) return;
  s.lastMusic = name;
  audio.playMusic(name);
}

// ---------------------------------------------------------------------- loop
function frame(s, now) {
  if (session !== s) return;
  s.raf = requestAnimationFrame((t) => frame(s, t));
  const g = s.game;
  const dt = Math.max(0, Math.min(0.1, (now - s.last) / 1000)); // the first rAF timestamp can precede `last`
  s.last = now;
  if (!s.paused) {
    s.acc += dt * s.speed;
    let n = 0;
    while (s.acc >= STEP && n < 8) { g.update(STEP); s.acc -= STEP; n++; }
    if (n === 8) s.acc = 0;
  }
  // blade trail fades after ~170ms
  const tNow = performance.now();
  s.trailPts = s.trailPts.filter((p) => tNow - p.t < 170);
  s.renderer.draw(g, s.paused ? 0 : dt * s.speed, s.paused, s.trailPts);
  updateHud(s);
  updateLoops(s);
  updateTips(s, dt);
  if ((g.state === 'victory' || g.state === 'defeat') && !s.ended) {
    const wait = g.state === 'victory' ? (g.boss === null && g.stage && g.stage.boss ? 1.9 : 1.2) : 1.3;
    if (g.endT > wait) finish(s);
  }
}

function updateLoops(s) {
  const g = s.game;
  let beam = false, flame = false;
  if (!s.paused && g.state === 'combat') {
    for (const h of g.heroes) { if (h.disabled > 0) continue; if (h.beam) beam = true; if (h.flameOn) flame = true; }
  }
  audio.loop('beam', beam);
  audio.loop('flame', flame);
}

// ---------------------------------------------------------------------- events
function onEvent(s, e) {
  audio.fromEvent(e);
  const g = s.game;
  switch (e.type) {
    case 'wave': {
      if (e.boss) playBattleMusic(s, true);
      const label = g.survival ? `WAVE ${e.wave + 1}` : `WAVE ${e.wave + 1}`;
      const sub = g.survival ? 'SURVIVAL' : `of ${e.total}`;
      showBanner(s, e.boss ? 'BOSS WAVE' : label, s.joined ? `${s.joined} JOINS THE SQUAD` : sub, e.boss, s.joined ? 2.6 : 2.1);
      s.joined = null;
      break;
    }
    case 'bossWarn': showBanner(s, '⚠ WARNING', e.name.toUpperCase(), true); haptic(60); break;
    case 'phase': showBanner(s, `PHASE ${g.boss ? g.boss.boss.phase + 1 : ''}`, 'IT GROWS ANGRY', true); haptic(60); break;
    case 'bossExposed': showBanner(s, 'CORE EXPOSED', 'FULL FIREPOWER!', false, 1.2); tip(s, 'tipExposed', 'The boss is exposed - it takes 50% extra damage right now!'); break;
    case 'upgradeOpen': showUpgrade(s); break;
    case 'slice': break;
    case 'summon': s.joined = g.allHeroes[e.i].def.name.toUpperCase(); haptic(40); break; // announced with the next wave banner
    case 'checkpoint':
      store.update((p) => { p.checkpoint = e.snap; });
      store.save(true);
      break;
    case 'baseHit': haptic(18); break;
    case 'ability': haptic(15); break;
    case 'cut': haptic(6); break;
    case 'explosion': if (e.big && e.enemy) haptic(35); break;
    case 'victory': audio.stopMusic(); break;
    case 'defeat': audio.stopMusic(); break;
    default: break;
  }
}

function showBanner(s, title, sub, boss, secs = 2.1) {
  const b = s.hud.banner;
  b.className = 'banner title';
  b.innerHTML = '';
  b.append(title, h('small', null, sub));
  void b.offsetWidth;
  b.className = 'banner title show' + (boss ? ' boss' : '');
  b.style.animationDuration = secs + 's';
}

// First-time hints (stored in profile flags so they never repeat).
function tip(s, key, text, secs = 4) {
  const seen = store.profile.flags.seen;
  if (seen[key] || s.tipT > 0) return;
  seen[key] = true;
  store.save();
  s.hud.tip.textContent = text;
  s.hud.tip.classList.add('show');
  s.tipT = secs;
}
function updateTips(s, dt) {
  if (s.tipT > 0) { s.tipT -= s.paused ? 0 : dt; if (s.tipT <= 0) s.hud.tip.classList.remove('show'); }
  const g = s.game;
  if (g.state !== 'combat' || s.paused) return;
  if (g.t > 0.8) tip(s, 'tipAuto', g.reserve.length ? 'Your hero fires automatically. Clear waves to summon the rest of your squad!' : 'Your heroes fire automatically. Hold the wall!');
  if (g.t > 8 && g.heroes.some((h) => h.ab.cd <= 0)) tip(s, 'tipAbility', 'Tap a hero portrait below to unleash their ability.');
  if (g.ammo.starve > 0.35 && g.ammo.pile < 1) tip(s, 'tipAmmo', 'Out of ammo! Heroes wait while the revolver slices more. Pick Slicer Chambers to cut more bullets per cycle.', 5);
  if (g.ebullets.items.length > 0) tip(s, 'tipCut', 'Swipe across enemy bullets to CUT them before they hit the wall!', 5);
}

// ---------------------------------------------------------------------- input (bullet cutting)
function bindInput(s) {
  const c = s.canvas;
  const toWorld = (e) => {
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * s.game.H };
  };
  let down = false, last = null;
  const add = (e) => {
    const p = toWorld(e);
    p.t = performance.now();
    if (last && s.game.state === 'combat' && !s.paused) s.game.cutSegment(last.x, last.y, p.x, p.y);
    s.trailPts.push(p);
    if (s.trailPts.length > 24) s.trailPts.shift();
    last = p;
  };
  s.handlers = {
    down: (e) => { audio.unlock(); down = true; last = null; try { c.setPointerCapture(e.pointerId); } catch { /* ignore */ } add(e); },
    move: (e) => {
      if (!down) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs.length ? evs : [e]) add(ev);
    },
    up: () => { down = false; last = null; },
    key: (e) => {
      if (e.key === 'Escape' || e.key === 'p' || e.key === ' ') { e.preventDefault(); s.paused ? null : pause(s); }
      const n = Number(e.key);
      if (n >= 1 && n <= 4 && !s.paused) s.game.useAbility(n - 1);
    },
    vis: () => { if (document.visibilityState === 'hidden' && !s.paused && !s.ended) pause(s); },
  };
  c.addEventListener('pointerdown', s.handlers.down);
  c.addEventListener('pointermove', s.handlers.move);
  c.addEventListener('pointerup', s.handlers.up);
  c.addEventListener('pointercancel', s.handlers.up);
  addEventListener('keydown', s.handlers.key);
  document.addEventListener('visibilitychange', s.handlers.vis);
  s.handlers.resize = () => relayout(s);
  addEventListener('resize', s.handlers.resize);
}

function relayout(s) {
  const app = document.getElementById('app');
  const cssW = app.clientWidth, cssH = app.clientHeight;
  if (!cssW || !cssH || (cssW === s.cssW && cssH === s.cssH)) return;
  s.cssW = cssW; s.cssH = cssH;
  const L = layoutFor(cssW, cssH, safeBottom);
  const g = s.game;
  g.H = L.H; g.wallY = L.wallY; g.heroY = L.heroY;
  for (const hh of g.allHeroes) hh.y = L.heroY;
  for (const t of g.turrets) t.y = L.wallY - 6;
  s.renderer.resize(cssW, cssH, s.dpr);
}

// ---------------------------------------------------------------------- HUD
function buildHud(s) {
  const hud = document.getElementById('hud');
  clear(hud);
  const g = s.game;
  const hd = {};
  hd.wave = h('div', { class: 'hud-wave' });
  hd.baseFill = h('i'); hd.barrier = h('b'); hd.baseTxt = h('span');
  hd.base = h('div', { class: 'basebar', role: 'progressbar', 'aria-label': 'Wall health' }, hd.baseFill, hd.barrier, hd.baseTxt);
  hd.bossName = h('span'); hd.bossPct = h('span');
  hd.bossFill = h('i'); hd.bossShield = h('b');
  hd.boss = h('div', { class: 'bossbar' }, hd.bossFill, hd.bossShield, h('em', { style: { left: '66%' } }), h('em', { style: { left: '33%' } }), h('span', null, hd.bossName, hd.bossPct));
  hd.pauseBtn = h('button', { class: 'hud-btn', 'aria-label': 'Pause', onclick: () => pause(s), html: icon('pause') });
  const speedLabel = () => (s.canFast ? s.speed + '×' : '🔒');
  hd.speedBtn = h('button', {
    class: 'hud-btn', 'aria-label': s.canFast ? 'Combat speed' : 'Double speed (locked: clear this stage once)',
    onclick: () => {
      if (!s.canFast) { toast('Clear this stage once to unlock 2× speed', true); return; }
      s.speed = s.speed === 1 ? 2 : 1;
      store.update((p) => { p.settings.speed = s.speed; });
      hd.speedBtn.textContent = speedLabel();
    },
  }, speedLabel());
  s.speed = s.canFast && store.profile.settings.speed === 2 ? 2 : 1;
  hd.speedBtn.textContent = speedLabel();
  hd.banner = h('div', { class: 'banner title' });
  hd.tip = h('div', { class: 'tip', role: 'status' });
  hd.cutFill = h('i');
  hd.abs = g.allHeroes.map((hero, i) => {
    const img = h('img', { src: heroPortrait(hero.id, hero.skin, 64), alt: hero.def.name });
    const shade = h('div', { class: 'shade' });
    const cd = h('div', { class: 'cd' });
    const b = h('button', {
      class: 'ab', 'aria-label': `${hero.def.name}: ${hero.def.ability.name}`, dataset: { quiet: '1' },
      onpointerdown: (e) => { e.stopPropagation(); audio.unlock(); g.useAbility(i); },
    }, img, shade, h('span', { class: 'key' }, String(i + 1)), cd, h('span', { class: 'nm' }, hero.def.ability.name));
    return { b, shade, cd, last: '' };
  });
  hud.append(
    h('div', { class: 'hud-top' }, hd.pauseBtn, h('div', { class: 'hud-mid' }, hd.wave, hd.base, hd.boss), hd.speedBtn),
    hd.banner, hd.tip,
    h('div', { class: 'tray' },
      h('div', { class: 'cutmeter' }, h('span', { html: icon('blade') }), 'CUT', h('div', { class: 'bar cyan' }, hd.cutFill)),
      h('div', { class: 'abil' }, hd.abs.map((a) => a.b))),
    hd.overlay = h('div', { class: 'overlay' }));
  s.hud = hd;
  s.hudCache = {};
}

function setIf(s, key, val, fn) { if (s.hudCache[key] !== val) { s.hudCache[key] = val; fn(val); } }

function updateHud(s) {
  const g = s.game, hd = s.hud;
  const frac = Math.max(0, g.base.hp / g.base.max);
  setIf(s, 'wave', `${g.waveIdx}|${g.waveCount}`, () => { hd.wave.textContent = g.survival ? `SURVIVAL · WAVE ${g.waveIdx + 1}` : `WAVE ${Math.max(1, g.waveIdx + 1)} / ${g.waveCount}`; });
  setIf(s, 'base', Math.round(frac * 200), () => {
    hd.baseFill.style.width = frac * 100 + '%';
    hd.baseFill.className = frac < 0.3 ? 'low' : frac < 0.6 ? 'mid' : '';
    hd.baseTxt.textContent = `WALL ${Math.ceil(g.base.hp)} / ${Math.round(g.base.max)}`;
  });
  const bar = g.base.barrier.hp > 0 ? Math.min(100, (g.base.barrier.hp / g.base.max) * 100) : 0;
  setIf(s, 'barrier', Math.round(bar), () => { hd.barrier.style.width = bar + '%'; hd.barrier.style.display = bar > 0 ? '' : 'none'; hd.barrier.style.opacity = '.6'; });
  const boss = g.boss;
  setIf(s, 'bossOn', !!boss, (v) => hd.boss.classList.toggle('on', v));
  if (boss) {
    const bf = Math.max(0, boss.hp / boss.max);
    setIf(s, 'boss', Math.round(bf * 300) + ':' + boss.boss.phase + ':' + (boss.boss.exposed > 0) + ':' + Math.round((boss.shield / boss.max) * 100), () => {
      hd.bossFill.style.width = bf * 100 + '%';
      hd.bossShield.style.width = Math.min(100, (boss.shield / boss.max) * 400) + '%';
      hd.bossName.textContent = `${boss.boss.def.name.toUpperCase()}${boss.boss.invuln > 0 ? ' · SHIFTING' : boss.boss.exposed > 0 ? ' · EXPOSED' : ''}`;
      hd.bossPct.textContent = `P${boss.boss.phase + 1}  ${Math.ceil(bf * 100)}%`;
      hd.boss.classList.toggle('exposed', boss.boss.exposed > 0);
    });
  }
  const cutp = Math.round((g.cut.energy / g.cut.max) * 100);
  setIf(s, 'cut', cutp, () => { hd.cutFill.style.width = cutp + '%'; });
  g.allHeroes.forEach((full, i) => {
    const a = hd.abs[i];
    const hero = g.hero(i);
    if (!hero) { // still in reserve: shown dimmed until a summon card brings them in
      if (a.last !== 'locked') { a.last = 'locked'; a.b.className = 'ab locked'; a.b.style.setProperty('--p', 0); a.cd.textContent = '🔒'; }
      return;
    }
    const ready = hero.ab.cd <= 0 && hero.disabled <= 0;
    const p = hero.ab.max > 0 ? Math.round((hero.ab.cd / hero.ab.max) * 100) : 0;
    const key = `${p}|${ready}|${hero.disabled > 0}|${hero.ab.active > 0}|${Math.ceil(hero.ab.cd)}`;
    if (a.last !== key) {
      a.last = key;
      a.b.classList.remove('locked');
      a.b.style.setProperty('--p', p);
      a.b.classList.toggle('ready', ready);
      a.b.classList.toggle('stunned', hero.disabled > 0);
      a.b.classList.toggle('active', hero.ab.active > 0);
      a.cd.textContent = hero.disabled > 0 ? '✖' : hero.ab.cd > 0 ? Math.ceil(hero.ab.cd) : '';
    }
  });
}

// ---------------------------------------------------------------------- upgrade overlay
function showUpgrade(s) {
  const g = s.game, ov = s.hud.overlay;
  clear(ov);
  const render = () => {
    clear(ov);
    const cards = g.choices.map((id) => upgradeCard(s, id));
    const reroll = h('button', {
      class: 'btn small', disabled: g.rerolls <= 0, onclick: () => { if (g.reroll()) { sfx('ui_click'); render(); } }, 'aria-label': 'Reroll upgrade choices',
      html: `${icon('dice')} Reroll (${g.rerolls})`,
    });
    const owned = Object.entries(g.owned).map(([id, lv]) => {
      const u = UPGRADES[id];
      return h('span', { title: `${u.name} Lv${lv}`, style: { background: CATEGORY[u.cat].color + '55', border: `1.5px solid ${CATEGORY[u.cat].color}` }, html: icon(u.icon) + `<em>${lv}</em>` });
    });
    ov.append(h('div', { style: { width: '100%' } },
      h('div', { class: 'center' },
        h('div', { class: 'muted', style: { fontWeight: 800, letterSpacing: '.12em', fontSize: '.78rem' } }, g.survival ? `WAVE ${g.waveIdx + 1} CLEARED` : `WAVE ${g.waveIdx + 1} / ${g.waveCount} CLEARED`),
        h('h2', { class: 'title', style: { fontSize: '1.8rem', margin: '2px 0 4px' } }, 'Choose an upgrade'),
        h('div', { class: 'muted', style: { fontSize: '.8rem' } }, g.reserve.length ? 'Summon your next hero - or take an upgrade. Summon rewards keep coming each wave.' : 'Upgrades last until the end of this run.')),
      cards,
      h('div', { class: 'row', style: { justifyContent: 'center', marginTop: '14px' } }, reroll),
      owned.length ? h('div', { class: 'owned-row' }, owned) : null));
  };
  render();
  ov.classList.add('on');
  s.paused = false;
}

function summonCard(s, id) {
  const g = s.game;
  const hero = g.reserve.find((r) => r.id === id.slice(7));
  const def = hero.def;
  return h('button', {
    class: 'upg summon', dataset: { quiet: '1' }, 'aria-label': `Summon ${def.name}`,
    onclick: () => { if (g.pickUpgrade(id)) { s.hud.overlay.classList.remove('on'); s.last = performance.now(); } },
  },
    h('div', { class: 'ic portrait' }, h('img', { src: heroPortrait(hero.id, hero.skin, 64), alt: '' })),
    h('div', { class: 'grow' },
      h('div', { class: 'nm' }, `Summon ${def.name}`),
      h('div', { class: 'fx' }, `${def.weapon} · ${def.ability.name}: ${def.ability.desc.split('.')[0]}.`),
      h('div', { class: 'meta' },
        h('span', { class: 'pill', style: { color: '#ffd23f' } }, 'New hero'),
        h('span', { class: 'pill', style: { color: RARITY[def.rarity].color } }, RARITY[def.rarity].name),
        h('span', { class: 'muted' }, `Lv ${hero.lv}`))),
    h('div', { class: 'lv' }, 'JOIN', h('br'), 'NOW'));
}

function upgradeCard(s, id) {
  if (id.startsWith('summon:')) return summonCard(s, id);
  const g = s.game;
  const u = UPGRADES[id];
  const cat = CATEGORY[u.cat];
  const have = g.owned[id] || 0;
  const next = u.instant ? 1 : have + 1;
  const rar = RARITY[u.rarity];
  return h('button', {
    class: `upg ${u.rarity}`, dataset: { quiet: '1' },
    onclick: () => {
      if (g.pickUpgrade(id)) {
        s.hud.overlay.classList.remove('on');
        s.last = performance.now();
        const world = s.stage ? s.stage.world : 0;
        s.lastMusic = null;
        playBattleMusic(s, !!g.boss, world);
      }
    },
  },
    h('div', { class: 'ic', style: { background: `linear-gradient(${cat.color}, ${cat.color}88)` }, html: icon(u.icon) }),
    h('div', { class: 'grow' },
      h('div', { class: 'nm' }, u.name),
      h('div', { class: 'fx' }, u.text(next)),
      h('div', { class: 'meta' },
        h('span', { class: 'pill', style: { color: rar.color } }, rar.name),
        h('span', { class: 'pill', style: { color: cat.color } }, `${cat.name}`),
        ...u.tags.slice(0, 2).map((t) => h('span', { class: 'muted' }, '#' + t)))),
    h('div', { class: 'lv' }, u.instant ? 'INSTANT' : [`Lv ${have}`, h('br'), `→ ${next}/${u.max}`]));
}

// ---------------------------------------------------------------------- pause / quit
function pause(s) {
  if (s.paused || s.ended || s.game.state === 'victory' || s.game.state === 'defeat') return;
  s.paused = true;
  audio.suspend();
  const p = store.profile.settings;
  const toggle = (label, key, after) => {
    const sw = h('button', { class: 'switch', role: 'switch', 'aria-checked': String(!!p[key]), 'aria-label': label,
      onclick: () => { store.update((pr) => { pr.settings[key] = !pr.settings[key]; }); sw.setAttribute('aria-checked', String(!!store.profile.settings[key])); if (after) after(); } });
    return h('div', { class: 'setting' }, h('span', null, label), sw);
  };
  const slider = (label, key) => h('div', { class: 'setting' }, h('span', null, label),
    h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: p[key], 'aria-label': label, oninput: (e) => { store.update((pr) => { pr.settings[key] = Number(e.target.value); }); applySettings(); } }));
  const sheet = openSheet(h('div', null,
    h('h2', { class: 'title center', style: { fontSize: '1.8rem', marginBottom: '8px' } }, 'Paused'),
    slider('Music', 'music'), slider('Sound effects', 'sfx'),
    toggle('Auto-cast abilities', 'autoAbility', () => { s.game.opts.autoAbility = store.profile.settings.autoAbility; }),
    toggle('Vibration', 'haptics'),
    h('div', { class: 'row', style: { marginTop: '14px' } },
      h('button', { class: 'btn grow danger', onclick: async () => { if (await confirmBox('Quit battle?', 'You keep a share of the coins you collected, but this run ends.', 'Quit', true)) { sheet.close(); quit(s); } } }, 'Quit'),
      h('button', { class: 'btn grow', onclick: async () => { if (await confirmBox('Restart battle?', 'Progress in this run will be lost.', 'Restart')) { sheet.close(); restart(s); } } }, 'Restart')),
    h('button', { class: 'btn primary big block', style: { marginTop: '12px' }, onclick: () => sheet.close() }, 'Resume')),
  { center: true, onClose: () => resume(s) });
}
function resume(s) {
  if (session !== s) return;
  s.paused = false;
  s.last = performance.now();
  audio.resume();
}
function quit(s) {
  s.game.state = 'defeat'; s.game.endT = 99;
  finish(s);
}
function restart(s) {
  const o = s.opts.resume ? { stageId: s.stage ? s.stage.id : null, survival: !s.stage, hard: s.hard } : s.opts;
  endSession();
  store.update((p) => { p.checkpoint = null; });
  startCombat(o);
}

// ---------------------------------------------------------------------- end of run
function finish(s) {
  if (s.ended) return;
  s.ended = true;
  const result = s.game.result();
  result.runId = s.runId;
  const reward = store.update((p) => applyRunResult(p, result));
  store.save(true);
  const stage = s.stage;
  const hard = s.hard;
  endSession();
  go('results', { result, reward, stageId: stage ? stage.id : null, hard, survival: !stage });
}

export function endSession() {
  const s = session;
  if (!s) return;
  cancelAnimationFrame(s.raf);
  const c = s.canvas;
  c.removeEventListener('pointerdown', s.handlers.down);
  c.removeEventListener('pointermove', s.handlers.move);
  c.removeEventListener('pointerup', s.handlers.up);
  c.removeEventListener('pointercancel', s.handlers.up);
  removeEventListener('keydown', s.handlers.key);
  removeEventListener('resize', s.handlers.resize);
  document.removeEventListener('visibilitychange', s.handlers.vis);
  setEdgeColor(null);
  audio.stopLoops && audio.ctx && audio.stopLoops();
  audio.resume();
  clear(document.getElementById('hud'));
  document.body.classList.remove('in-combat');
  session = null;
}


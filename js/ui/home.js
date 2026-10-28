// Home screen (GDD 11.1): identity, currency, campaign entry, squad showcase, missions hook.

import { h } from './dom.js';
import { icon } from './icons.js';
import { registerScreen, go, navBar, currencyChips, toast, confirmBox, refresh } from './app.js';
import { startCombat } from './combat.js';
import { openSquad, powerClass } from './squad.js';
import { store } from '../store.js';
import { STAGES, STAGE_BY_ID, WORLDS, recPower } from '../data/stages.js';
import { MODIFIERS } from '../data/enemies.js';
import { HEROES } from '../data/heroes.js';
import { background } from '../render/backgrounds.js';
import { heroSprite, enemySprite } from '../render/sprites.js';
import { nextStage, isStageUnlocked, survivalUnlocked, hardUnlocked, claimLogin, loginState } from '../economy.js';
import { squadPower } from '../progression.js';
import { fmtFull, RNG } from '../util.js';
import { audio } from '../audio/index.js';
import { LOGIN_CALENDAR } from '../data/missions.js';
import { openSettings } from './settings.js';

export function selectedStage(p) {
  const s = STAGE_BY_ID[p.flags.lastStage];
  if (s && isStageUnlocked(p, s)) return s;
  return nextStage(p) || STAGES[STAGES.length - 1];
}

export function rewardText(r) {
  const parts = [];
  if (r.coins) parts.push(`${fmtFull(r.coins)} coins`);
  if (r.gems) parts.push(`${r.gems} gems`);
  if (r.tokens) parts.push(`${r.tokens} research token${r.tokens > 1 ? 's' : ''}`);
  return parts.join(', ');
}

registerScreen('home', () => {
  const p = store.profile;
  const stage = selectedStage(p);
  const world = WORLDS[stage.world];
  const power = squadPower(p);
  const rec = recPower(stage.idx);
  const hard = !!p.flags.hardMode && hardUnlocked(p);
  const cp = p.checkpoint;

  const canvas = h('canvas', { 'aria-label': 'Your squad standing guard' });
  const stopShowcase = showcase(canvas, p, stage.world);

  const battle = () => {
    audio.unlock();
    if (cp) { startCombat({ resume: cp }); return; }
    startCombat({ stageId: stage.id, hard });
  };

  const ls = loginState(p);
  const login = !ls.claimedToday
    ? h('button', { class: 'banner-note', style: { width: '100%', textAlign: 'left' }, onclick: () => {
      const r = store.update((pr) => claimLogin(pr));
      if (r.ok) { toast('Daily reward claimed! 🎁'); refresh(); }
    } }, h('span', { html: icon('gift') }), h('span', { class: 'grow' }, `Daily reward ready - day ${(ls.nextDay % LOGIN_CALENDAR.length) + 1}`), h('b', { class: 'coin' }, 'CLAIM'))
    : null;

  const el = h('div', { style: { display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 } },
    h('div', { class: 'topbar' }, currencyChips(p), h('button', { class: 'icon-btn', 'aria-label': 'Settings', onclick: () => openSettings(), html: icon('gear') })),
    h('div', { class: 'scroll', style: { padding: '0 0 calc(var(--nav-h) + var(--sab) + 24px)' } },
      h('div', { class: 'showcase' }, canvas, h('span', { class: 'chip world' }, world.name)),
      h('div', { class: 'panel stage-card', style: { marginLeft: '14px', marginRight: '14px' } },
        h('div', { class: 'row' },
          h('div', { class: 'grow' },
            h('div', { class: 'muted', style: { fontSize: '.72rem', fontWeight: 900, letterSpacing: '.1em' } }, cp ? 'RUN IN PROGRESS' : (p.stages[stage.id] ? 'REPLAY' : 'NEXT MISSION')),
            h('div', { class: 'name title' }, cp ? (cp.survival ? 'Survival' : `${cp.stageId}`) + ` · wave ${cp.wave + 1}` : `${stage.id} · ${stage.name}`)),
          h('div', { class: 'center' },
            h('div', { class: 'power ' + powerClass(power, rec), html: `${icon('bolt')} ${fmtFull(power)}` }),
            h('div', { class: 'muted', style: { fontSize: '.68rem' } }, `rec. ${fmtFull(rec)}`))),
        (stage.boss || stage.mod || hard) ? h('div', { class: 'chips-row' },
          stage.boss ? h('span', { class: 'chip', html: icon('skull') + ' Boss' }) : null,
          stage.mod ? h('span', { class: 'chip', title: MODIFIERS[stage.mod].desc }, `${MODIFIERS[stage.mod].icon} ${MODIFIERS[stage.mod].name}`) : null,
          hard ? h('span', { class: 'chip', style: { color: '#ff8a7a' } }, 'HARD') : null) : null),
      h('div', { class: 'battle-wrap' },
        login,
        h('button', { class: 'btn primary big block', onclick: battle, 'aria-label': cp ? 'Continue battle' : 'Start battle' }, cp ? 'Continue' : 'Battle'),
        cp ? h('button', { class: 'btn small block', onclick: async () => { if (await confirmBox('Abandon this run?', 'The checkpoint will be discarded. You keep nothing from it.', 'Abandon', true)) { store.update((pr) => { pr.checkpoint = null; }); refresh(); } } }, 'Abandon run') : null,
        h('div', { class: 'row' },
          h('button', { class: 'btn grow', onclick: () => openSquad({ onDone: () => refresh() }), html: icon('heroes') + ' Squad' }),
          h('button', { class: 'btn grow', onclick: () => go('stages'), html: icon('list') + ' Stages' }),
          h('button', { class: 'btn grow', onclick: () => { if (!survivalUnlocked(p)) { toast('Survival unlocks after clearing 2-4', true); return; } startCombat({ survival: true }); }, html: icon(survivalUnlocked(p) ? 'wave' : 'lock') + ' Survive' })))),
    navBar('home'));
  return { el, destroy: stopShowcase };
});

/** A small living diorama: the squad idles, shoots at passing enemies. */
function showcase(canvas, p, worldId) {
  let raf = 0, stopped = false;
  const rng = new RNG(7);
  const squad = p.squad.map((id) => ({ id, skin: p.heroes[id].skin }));
  const enemies = Array.from({ length: 4 }, (_, i) => ({ x: 40 + rng.next() * 280, y: -20 - i * 70, t: rng.next() * 6, type: ['grunt', 'runner', 'grunt', 'bulwark'][i] }));
  const bullets = [];
  let last = performance.now(), shootT = 0, t = 0;
  const draw = (now) => {
    if (stopped) return;
    raf = requestAnimationFrame(draw);
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    const cw = canvas.clientWidth, ch = canvas.clientHeight;
    if (!cw || !ch) return;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    if (canvas.width !== Math.round(cw * dpr)) { canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr); }
    const k = canvas.width / 360;
    const Hw = canvas.height / k;
    const wallY = Hw * 0.5;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(background(worldId, Hw, wallY, k), 0, 0, canvas.width, canvas.height);
    ctx.setTransform(k, 0, 0, k, 0, 0);
    // wall
    for (let i = 0; i < 12; i++) { ctx.fillStyle = i % 2 ? '#5a6078' : '#686f8a'; ctx.fillRect(i * 30 + 1, wallY - 12, 28, 18); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(i * 30 + 1, wallY - 12, 28, 3); }
    // enemies march in the distance and are shot
    for (const e of enemies) {
      e.y += (e.type === 'runner' ? 40 : 18) * dt; e.t += dt;
      if (e.y > wallY - 18) { e.y = -20; e.x = 30 + rng.next() * 300; }
      const r = e.type === 'bulwark' ? 17 : e.type === 'runner' ? 9 : 11;
      const s = enemySprite(e.type, worldId, Math.floor(e.t * 4) % 2, r, k);
      ctx.drawImage(s, e.x - s.lw / 2, e.y - s.lh / 2, s.lw, s.lh);
    }
    shootT -= dt;
    const heroY = wallY + (Hw - wallY) * 0.58;
    const n = squad.length;
    if (shootT <= 0) {
      shootT = 0.35;
      squad.forEach((s, i) => {
        const near = enemies.filter((e) => e.y > 0).sort((a, b) => b.y - a.y)[0];
        if (near) bullets.push({ x: (360 * (i + 1)) / (n + 1), y: heroY - 24, vx: 0, vy: 0, tx: near.x, ty: near.y, life: 0.5 });
      });
    }
    ctx.lineCap = 'round';
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.life -= dt;
      const d = Math.hypot(b.tx - b.x, b.ty - b.y) || 1;
      b.x += ((b.tx - b.x) / d) * 700 * dt; b.y += ((b.ty - b.y) / d) * 700 * dt;
      ctx.strokeStyle = '#ffe9a0'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x - ((b.tx - b.x) / d) * 12, b.y - ((b.ty - b.y) / d) * 12); ctx.stroke();
      if (b.life <= 0 || d < 8) bullets.splice(i, 1);
    }
    squad.forEach((s, i) => {
      const sp = heroSprite(s.id, s.skin, k);
      const x = (360 * (i + 1)) / (n + 1);
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(x, heroY + 28, 18, 6, 0, 0, 7); ctx.fill();
      ctx.drawImage(sp, x - sp.lw / 2, heroY - 2 + Math.sin(t * 2.2 + i) * 1.4 - sp.lh / 2 + 4, sp.lw, sp.lh);
    });
  };
  raf = requestAnimationFrame(draw);
  return () => { stopped = true; cancelAnimationFrame(raf); };
}

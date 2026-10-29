// Boot: apply settings -> register service worker -> check for updates -> tap to play.

import { h, clear } from './ui/dom.js';
import { icon } from './ui/icons.js';
import { go, applySettings, installClickSounds, registerScreen, currentScreen, toast, setEdgeColor } from './ui/app.js';
import './ui/home.js';
import './ui/stages.js';
import './ui/heroes.js';
import './ui/meta.js';
import './ui/results.js';
import { startCombat, measureSafeArea, inCombat } from './ui/combat.js';
import { store } from './store.js';
import { audio } from './audio/index.js';
import { startTitleScene } from './render/titleScene.js';
import { registerServiceWorker, checkForUpdate, watchForUpdates, currentBuild } from './update.js';

registerScreen('splash', ({ status }) => {
  const bar = h('i', { style: { width: '8%' } });
  const st = h('div', { class: 'status', role: 'status' }, status || '');
  const btn = h('button', { class: 'btn primary big', style: { display: 'none', minWidth: '220px' } }, 'Tap to play');
  const scene = h('canvas', { class: 'scene', 'aria-hidden': 'true' });
  const el = h('div', { class: 'splash', style: { flex: 1 } },
    scene,
    h('div', { class: 'logo title' }, 'Bullet', h('b', null, 'Heroes')),
    h('div', { class: 'tagline' }, 'Squad up. Hold the wall.'),
    h('div', { class: 'actions' }, h('div', { class: 'bar' }, bar), st, btn),
    h('div', { class: 'muted foot', style: { fontSize: '.7rem' } }, `No ads · No purchases · Build ${currentBuild()}`));
  const p = store.profile;
  const calm = matchMedia('(prefers-reduced-motion: reduce)').matches || p.settings.reduceFlash;
  const stopScene = startTitleScene(scene, p.squad.map((id) => ({ id, skin: p.heroes[id].skin })), { animate: !calm, onTop: setEdgeColor });
  return { el, ui: { bar, st, btn }, destroy: stopScene };
});

async function boot() {
  measureSafeArea();
  applySettings();
  installClickSounds();
  const splash = go('splash', {});
  const { bar, st, btn } = splash.ui;
  const say = (t) => { st.textContent = t; };
  const progress = (n) => { bar.style.width = n + '%'; };
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    audio.unlock();
    const p = store.profile;
    const brandNew = Object.keys(p.stages).length === 0 && !p.flags.tutorial && p.stats.runs === 0;
    audio.playMusic('menu');
    if (splash.destroy) splash.destroy(); // stop the title animation
    if (brandNew) { p.flags.tutorial = true; store.save(true); startCombat({ stageId: '1-1' }); } // first fight within seconds
    else go('home');
  };
  progress(20);
  say('Checking for updates…');
  await registerServiceWorker();
  progress(45);
  const result = await checkForUpdate({ timeoutMs: 4500, onStatus: say });
  if (result === 'updating') { progress(90); say('Restarting with the new version…'); return; }
  progress(100);
  say(result === 'offline' ? 'Offline mode - playing the installed version' : 'Ready');
  btn.style.display = '';
  btn.onclick = start;
  btn.focus();
  watchForUpdates(() => !inCombat() && ['home', 'heroes', 'research', 'missions', 'shop', 'stages'].includes(currentScreen()));
}

boot().catch((e) => { console.error(e); const s = document.getElementById('screen'); if (s && !s.firstChild) s.textContent = 'Failed to start: ' + e.message; });
addEventListener('unhandledrejection', (e) => console.warn('[unhandled]', e.reason));

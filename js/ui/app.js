// UI shell: screen router, bottom navigation, toasts, sheets and settings application.

import { h, clear } from './dom.js';
import { icon } from './icons.js';
import { store } from '../store.js';
import { audio } from '../audio/index.js';
import { fmt } from '../util.js';
import { openSettings } from './settings.js';

const screens = {};
export const registerScreen = (name, fn) => { screens[name] = fn; };

export const root = () => document.getElementById('app');
const mount = () => document.getElementById('screen');

let current = null; // { name, destroy }
export const currentScreen = () => current && current.name;

/**
 * Colour of the solid bar over the status-bar area (#edge). Match it to the top row of whatever is on screen so it blends
 * in. Pass null for the default menu background.
 */
export function setEdgeColor(color) {
  document.documentElement.style.setProperty('--edge', color || 'var(--bg)');
}

export function go(name, params = {}) {
  setEdgeColor(null); // screens that want a different colour (title, combat) set it themselves
  if (current && current.destroy) { try { current.destroy(); } catch (e) { console.error(e); } }
  const fn = screens[name];
  if (!fn) throw new Error('Unknown screen ' + name);
  const m = mount();
  clear(m);
  const res = fn(params);
  current = { name, destroy: res.destroy, params };
  m.append(res.el);
  if (res.el.querySelector('.scroll')) res.el.querySelector('.scroll').scrollTop = 0;
  const musicFor = name === 'home' || name === 'heroes' || name === 'research' || name === 'missions' || name === 'shop' || name === 'stages' ? 'menu' : null;
  if (musicFor && audio.ctx) audio.playMusic(musicFor);
  return res;
}

/** Re-render the current screen (after a purchase etc.), keeping scroll position. */
export function refresh(params = {}) {
  const sc = mount().querySelector('.scroll');
  const top = sc ? sc.scrollTop : 0;
  go(current.name, { ...(current.params || {}), ...params });
  const sc2 = mount().querySelector('.scroll');
  if (sc2) sc2.scrollTop = top;
}

export function sfx(name) { audio.sfx(name); }

// -------------------------------------------------------------------- toasts / sheets
export function toast(msg, bad = false) {
  const box = document.getElementById('toast');
  const t = h('div', { class: 'toast' + (bad ? ' bad' : '') }, msg);
  box.append(t);
  setTimeout(() => t.remove(), 2700);
  sfx(bad ? 'ui_deny' : 'coin');
}

export function openSheet(content, { center = false, onClose } = {}) {
  const bg = h('div', { class: 'sheet-bg' + (center ? ' mid' : '') });
  const sheet = h('div', { class: 'sheet' + (center ? ' center-modal' : ''), role: 'dialog', 'aria-modal': 'true' }, content);
  bg.append(sheet);
  const close = () => { bg.remove(); if (onClose) onClose(); };
  bg.addEventListener('click', (e) => { if (e.target === bg) { sfx('ui_back'); close(); } });
  root().append(bg);
  return { close, el: sheet, bg };
}

export function confirmBox(title, text, okLabel = 'OK', danger = false) {
  return new Promise((resolve) => {
    const s = openSheet(h('div', null,
      h('h3', { class: 'title' }, title),
      h('p', { class: 'muted', style: { margin: '10px 0 16px' } }, text),
      h('div', { class: 'row' },
        h('button', { class: 'btn grow', onclick: () => { s.close(); resolve(false); } }, 'Cancel'),
        h('button', { class: 'btn grow ' + (danger ? 'danger' : 'primary'), onclick: () => { s.close(); resolve(true); } }, okLabel))), { center: true });
  });
}

// -------------------------------------------------------------------- shared widgets
export function currencyChips(p) {
  return h('div', { class: 'chips' },
    h('span', { class: 'chip coin', html: icon('coin') + `<b>${fmt(p.coins)}</b>` }),
    h('span', { class: 'chip gem', html: icon('gem') + `<b>${fmt(p.gems)}</b>` }),
    h('span', { class: 'chip token', html: icon('token') + `<b>${fmt(p.tokens)}</b>` }));
}

/** The Settings gear - present on every main screen so reset/backup/audio are always one tap away. */
export function gearButton() {
  return h('button', { class: 'icon-btn', 'aria-label': 'Settings', onclick: () => openSettings(), html: icon('gear') });
}

/** Standard top bar: currency balances + Settings. */
export function topBar(p) {
  return h('div', { class: 'topbar' }, currencyChips(p), gearButton());
}

export function navBar(active) {
  const claimable = claimableCount();
  const tab = (name, label, ic, extra = '') => h('button', {
    class: 'tab' + (active === name ? ' on' : '') + extra, 'aria-label': label, 'aria-current': active === name ? 'page' : null,
    onclick: () => { sfx('ui_click'); if (active !== name) go(name); },
  }, h('span', { html: icon(ic) }), label, name === 'missions' && claimable ? h('span', { class: 'dot' }, claimable) : null);
  return h('nav', { class: 'nav' },
    tab('heroes', 'Heroes', 'heroes'), tab('research', 'Research', 'flask'),
    tab('home', 'Battle', 'sword', active === 'home' ? ' main' : ' main'),
    tab('missions', 'Missions', 'list'), tab('shop', 'Wardrobe', 'bag'));
}

import { claimableMissions } from '../economy.js';
function claimableCount() { return claimableMissions(store.profile); }

// -------------------------------------------------------------------- settings -> DOM/audio
export function applySettings() {
  const s = store.profile.settings;
  document.documentElement.style.setProperty('--ts', s.textScale);
  document.body.classList.toggle('hc', !!s.highContrast);
  document.body.classList.toggle('calm', !!s.reduceFlash);
  audio.setVolumes(s.music, s.sfx);
}

// Button click feedback for every screen without wiring each handler.
export function installClickSounds() {
  document.addEventListener('pointerdown', (e) => {
    audio.unlock();
    if (audio.pendingMusic && audio.music && !audio.music.name) audio.playMusic(audio.pendingMusic);
    const b = e.target.closest && e.target.closest('button, .card, .node, .pick, .skin');
    if (b && !b.disabled && !b.dataset.quiet) audio.sfx('ui_click');
  }, true);
}

export function haptic(ms = 12) {
  if (!store.profile.settings.haptics) return;
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* unsupported (iOS Safari) */ }
}

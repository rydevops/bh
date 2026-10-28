// Settings (GDD 11.4): independent audio, haptics, accessibility, text scaling, save backup, updates.

import { h } from './dom.js';
import { icon } from './icons.js';
import { openSheet, applySettings, toast, confirmBox, sfx } from './app.js';
import { store } from '../store.js';
import { exportText, importText, wipeSave, defaultProfile } from '../save.js';
import { currentBuild, checkForUpdate } from '../update.js';
import { audio } from '../audio/index.js';

export function openSettings() {
  let sheet;
  const p = () => store.profile.settings;
  const set = (k, v) => { store.update((pr) => { pr.settings[k] = v; }); applySettings(); };
  const toggle = (label, key, hint) => {
    const sw = h('button', { class: 'switch', role: 'switch', 'aria-checked': String(!!p()[key]), 'aria-label': label,
      onclick: () => { set(key, !p()[key]); sw.setAttribute('aria-checked', String(!!p()[key])); } });
    return h('div', { class: 'setting' }, h('div', null, label, hint ? h('small', null, hint) : null), sw);
  };
  const slider = (label, key, min, max, step, onInput) => h('div', { class: 'setting' }, h('span', null, label),
    h('input', { type: 'range', min, max, step, value: p()[key], 'aria-label': label, oninput: (e) => { set(key, Number(e.target.value)); if (onInput) onInput(); } }));

  const status = h('small', { style: { display: 'block' } }, `Build ${currentBuild()}`);
  const exportArea = h('textarea', { class: 'save', readonly: true, 'aria-label': 'Exported save code', style: { display: 'none' } });

  const body = h('div', null,
    h('div', { class: 'row' }, h('h2', { class: 'title grow' }, 'Settings'), h('button', { class: 'back', 'aria-label': 'Close', onclick: () => sheet.close(), html: icon('x') })),
    h('h3', { class: 'muted', style: { fontSize: '.75rem', letterSpacing: '.1em', margin: '12px 0 0' } }, 'AUDIO & FEEL'),
    slider('Music', 'music', 0, 1, 0.05), slider('Sound effects', 'sfx', 0, 1, 0.05, () => sfx('ui_click')),
    toggle('Vibration', 'haptics', 'Haptic feedback on supported devices'),
    h('h3', { class: 'muted', style: { fontSize: '.75rem', letterSpacing: '.1em', margin: '14px 0 0' } }, 'GAMEPLAY'),
    toggle('Auto-cast abilities', 'autoAbility', 'Heroes use abilities when ready'),
    toggle('Damage numbers', 'damageNumbers'),
    h('div', { class: 'setting' }, h('span', null, 'Default combat speed'),
      h('div', { class: 'row' }, [1, 2].map((v) => h('button', { class: 'chip' + (p().speed === v ? ' sel' : ''), onclick: (e) => { set('speed', v); e.target.parentNode.querySelectorAll('.chip').forEach((c, i) => c.classList.toggle('sel', i + 1 === v)); } }, v + '×')))),
    h('h3', { class: 'muted', style: { fontSize: '.75rem', letterSpacing: '.1em', margin: '14px 0 0' } }, 'ACCESSIBILITY'),
    toggle('Reduce screen shake', 'reduceShake'),
    toggle('Reduce flashing', 'reduceFlash', 'Softer flashes, calmer UI motion'),
    toggle('High contrast', 'highContrast', 'Brighter panels and outlines'),
    slider('Text size', 'textScale', 0.9, 1.35, 0.05),
    h('h3', { class: 'muted', style: { fontSize: '.75rem', letterSpacing: '.1em', margin: '14px 0 0' } }, 'SAVE BACKUP'),
    h('p', { class: 'muted', style: { fontSize: '.78rem', margin: '6px 0' } }, 'Progress is stored on this device. Export a code to back it up or move to another device.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn small grow', onclick: () => { exportArea.value = exportText(store.profile); exportArea.style.display = 'block'; exportArea.select(); try { navigator.clipboard.writeText(exportArea.value); toast('Save code copied'); } catch { /* manual copy */ } } }, 'Export'),
      h('button', { class: 'btn small grow', onclick: () => {
        const imp = h('textarea', { class: 'save', 'aria-label': 'Paste save code', placeholder: 'Paste a save code here' });
        const s2 = openSheet(h('div', null, h('h3', { class: 'title' }, 'Import save'), h('p', { class: 'muted', style: { fontSize: '.8rem', margin: '6px 0' } }, 'This replaces the progress on this device.'), imp,
          h('div', { class: 'row', style: { marginTop: '10px' } }, h('button', { class: 'btn grow', onclick: () => s2.close() }, 'Cancel'),
            h('button', { class: 'btn primary grow', onclick: () => { try { store.replace(importText(imp.value)); applySettings(); s2.close(); sheet.close(); toast('Save imported'); location.reload(); } catch { toast('That code is not valid', true); } } }, 'Import'))), { center: true });
      } }, 'Import')),
    exportArea,
    h('h3', { class: 'muted', style: { fontSize: '.75rem', letterSpacing: '.1em', margin: '14px 0 0' } }, 'ABOUT'),
    h('div', { class: 'setting' }, h('div', null, 'Bullet Heroes', status),
      h('button', { class: 'btn small', html: icon('refresh') + ' Check for update', onclick: async (e) => {
        e.currentTarget.disabled = true; status.textContent = 'Checking…';
        const r = await checkForUpdate({ timeoutMs: 6000, onStatus: (t) => { status.textContent = t; } });
        status.textContent = r === 'current' ? `Up to date · build ${currentBuild()}` : r === 'offline' ? 'Offline - could not check' : r === 'skipped' ? 'Update already attempted - restart the app' : 'Updating…';
        e.currentTarget.disabled = false;
      } })),
    h('p', { class: 'muted', style: { fontSize: '.78rem', margin: '8px 0' } }, 'Install it: on iPhone tap Share → Add to Home Screen; on Android use the browser menu → Install app. The game updates itself every time you open it.'),
    h('p', { class: 'muted', style: { fontSize: '.78rem', margin: '8px 0' } }, 'Privacy: no ads, no trackers, no accounts, no analytics. Nothing leaves your device.'),
    h('button', { class: 'btn danger small block', style: { marginTop: '12px' }, onclick: async () => {
      if (await confirmBox('Erase all progress?', 'This deletes your save on this device. It cannot be undone (export a backup first).', 'Erase', true)) { wipeSave(); store.profile = defaultProfile(); location.reload(); }
    } }, 'Erase progress'));
  sheet = openSheet(body);
  return sheet;
}

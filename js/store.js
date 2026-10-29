// Single in-memory profile with debounced persistence. Saves immediately when the page is hidden.

import { loadProfile, writeProfile, wipeSave, defaultProfile } from './save.js';
import { ensureMissions } from './economy.js';

export const store = {
  profile: loadProfile(),
  timer: null,
  listeners: new Set(),
  /** Mutate the profile through a function, then persist and notify. */
  update(fn) {
    const r = fn(this.profile);
    this.save();
    this.listeners.forEach((l) => l(this.profile));
    return r;
  },
  save(now = false) {
    clearTimeout(this.timer);
    if (now) { writeProfile(this.profile); return; }
    this.timer = setTimeout(() => writeProfile(this.profile), 350);
  },
  /** Erase all progress (keeps the player's audio/accessibility settings) and persist the fresh profile. */
  reset() {
    clearTimeout(this.timer);
    const keep = this.profile.settings;
    wipeSave();
    const fresh = defaultProfile();
    fresh.settings = { ...fresh.settings, ...keep };
    this.profile = fresh;
    ensureMissions(fresh);
    writeProfile(fresh);
    this.listeners.forEach((l) => l(fresh));
  },
  replace(p) { this.profile = p; ensureMissions(p); this.save(true); this.listeners.forEach((l) => l(p)); },
  on(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); },
};

ensureMissions(store.profile);
for (const ev of ['visibilitychange', 'pagehide']) {
  addEventListener(ev, () => { if (ev === 'pagehide' || document.visibilityState === 'hidden') store.save(true); });
}

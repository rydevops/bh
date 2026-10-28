// Persistence (GDD 13.3): versioned, checksummed local save with a rolling backup.
// A corrupted main save falls back to the backup; an unreadable one starts fresh - never crashes.

import { HERO_ORDER } from './data/heroes.js';

export const SAVE_VERSION = 1;
const KEY = 'bullet-heroes.save';
const BAK = 'bullet-heroes.save.bak';

export function defaultSettings() {
  return {
    music: 0.6, sfx: 0.9, haptics: true,
    reduceShake: false, reduceFlash: false, highContrast: false,
    textScale: 1, speed: 1, autoAbility: false, damageNumbers: true,
  };
}

export function defaultProfile(now = Date.now()) {
  return {
    v: SAVE_VERSION,
    created: now,
    coins: 0, gems: 0, tokens: 0,
    frags: {},
    heroes: {
      vanguard: { lv: 1, rank: 1, skin: 'default' },
      rook: { lv: 1, rank: 1, skin: 'default' },
      patch: { lv: 1, rank: 1, skin: 'default' },
    },
    skins: {}, // heroId -> [owned non-default skin ids]
    trails: ['default'], trail: 'default',
    squad: ['vanguard', 'rook', 'patch'],
    presets: { A: null, B: null },
    stages: {}, // id -> { stars, hard, hardStars }
    survivalBest: 0,
    research: {},
    missions: { day: '', daily: [], week: '', weekly: [] },
    login: { last: '', streak: 0 },
    stats: { kills: 0, cuts: 0, wins: 0, losses: 0, bosses: 0, crits: 0, abilities: 0, upgrades: 0, time: 0, runs: 0 },
    settings: defaultSettings(),
    flags: { tutorial: false, heroMenu: false, seen: {} },
    checkpoint: null,
    claimed: [],
  };
}

/** Bring older saves up to SAVE_VERSION. Each step is idempotent. Add steps as the schema grows. */
const MIGRATIONS = {
  // 1: (p) => { ...; p.v = 2; return p; }
};
export function migrate(p) {
  while (p.v < SAVE_VERSION) {
    const step = MIGRATIONS[p.v];
    if (!step) break;
    p = step(p);
  }
  return p;
}

/** Fill in any missing fields (forward-compat with partial/hand-edited saves). */
export function sanitize(raw) {
  const base = defaultProfile(raw && raw.created);
  const p = { ...base, ...raw };
  p.settings = { ...base.settings, ...(raw.settings || {}) };
  p.stats = { ...base.stats, ...(raw.stats || {}) };
  p.flags = { ...base.flags, ...(raw.flags || {}) };
  p.flags.seen = { ...(raw.flags && raw.flags.seen) };
  p.login = { ...base.login, ...(raw.login || {}) };
  p.missions = { ...base.missions, ...(raw.missions || {}) };
  p.presets = { ...base.presets, ...(raw.presets || {}) };
  for (const k of ['coins', 'gems', 'tokens', 'survivalBest']) if (!Number.isFinite(p[k]) || p[k] < 0) p[k] = 0;
  if (!p.heroes || typeof p.heroes !== 'object') p.heroes = base.heroes;
  p.squad = (Array.isArray(p.squad) ? p.squad : []).filter((id, i, a) => p.heroes[id] && a.indexOf(id) === i);
  if (p.squad.length === 0) p.squad = HERO_ORDER.filter((id) => p.heroes[id]).slice(0, 3);
  if (!Array.isArray(p.claimed)) p.claimed = [];
  return p;
}

function checksum(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export function encode(profile) {
  const d = JSON.stringify(profile);
  return JSON.stringify({ v: profile.v, h: checksum(d), d });
}

export function decode(text) {
  const w = JSON.parse(text);
  if (!w || typeof w.d !== 'string' || checksum(w.d) !== w.h) throw new Error('checksum mismatch');
  return sanitize(migrate(JSON.parse(w.d)));
}

// Storage access can throw (private mode, quota). Fall back to memory.
const mem = {};
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return mem[k] ?? null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { mem[k] = v; } },
  del(k) { try { localStorage.removeItem(k); } catch { delete mem[k]; } },
};

export function loadProfile() {
  for (const key of [KEY, BAK]) {
    const text = store.get(key);
    if (!text) continue;
    try {
      const p = decode(text);
      if (key === BAK) console.warn('[save] main save unreadable - restored from backup');
      return p;
    } catch (e) {
      console.warn('[save] failed to read', key, e);
    }
  }
  return defaultProfile();
}

export function writeProfile(profile) {
  const prev = store.get(KEY);
  const next = encode(profile);
  if (prev && prev !== next) store.set(BAK, prev);
  store.set(KEY, next);
}

export function wipeSave() { store.del(KEY); store.del(BAK); }

/** Portable text for the export/import feature (iOS may evict PWA storage - players should be able to back up). */
export function exportText(profile) {
  const s = encode(profile);
  return btoa(unescape(encodeURIComponent(s)));
}
export function importText(text) {
  const s = decodeURIComponent(escape(atob(text.trim())));
  return decode(s);
}

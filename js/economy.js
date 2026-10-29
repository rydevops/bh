// Profile mutations: leveling, ranks, cosmetics, research, rewards, missions, daily login.
// Pure functions over the profile object (no DOM) so they can be unit-tested.
// All currencies are earned in-game. There is no real-money purchase path.

import { HEROES, TRAILS, MAX_RANK, RANK_COST, levelCap, levelCost, HERO_ORDER } from './data/heroes.js';
import { RESEARCH, researchBonuses } from './data/research.js';
import { STAGES, STAGE_BY_ID, MILESTONES, STARTERS, replayTokens } from './data/stages.js';
import { DAILY_POOL, WEEKLY_POOL, LOGIN_CALENDAR } from './data/missions.js';
import { slotCount } from './progression.js';

const fail = (reason) => ({ ok: false, reason });
const ok = (extra = {}) => ({ ok: true, ...extra });

// ---------------- Heroes ----------------
export const isOwned = (p, id) => !!p.heroes[id];

export function unlockHero(p, id) {
  const def = HEROES[id];
  if (isOwned(p, id)) return fail('Already recruited');
  if (!def.unlock.frags) return fail('Not recruitable');
  if ((p.frags[id] || 0) < def.unlock.frags) return fail('Not enough fragments');
  p.frags[id] -= def.unlock.frags;
  p.heroes[id] = { lv: 1, rank: 1, skin: 'default' };
  return ok();
}

export function levelUpHero(p, id) {
  const h = p.heroes[id];
  if (!h) return fail('Locked');
  if (h.lv >= levelCap(h.rank)) return fail('Rank up to raise the level cap');
  const cost = levelCost(h.lv);
  if (p.coins < cost) return fail('Not enough coins');
  p.coins -= cost;
  h.lv++;
  return ok({ cost });
}

export function rankUpHero(p, id) {
  const h = p.heroes[id];
  if (!h) return fail('Locked');
  if (h.rank >= MAX_RANK) return fail('Max rank');
  const need = RANK_COST[h.rank];
  if ((p.frags[id] || 0) < need) return fail('Not enough fragments');
  p.frags[id] -= need;
  h.rank++;
  return ok();
}

// ---------------- Cosmetics (gems only; gems are earned, never sold) ----------------
export function buySkin(p, heroId, skinId) {
  const hero = HEROES[heroId];
  const skin = hero.skins.find((s) => s.id === skinId);
  if (!skin) return fail('Unknown skin');
  const owned = p.skins[heroId] || (p.skins[heroId] = []);
  if (skin.cost === 0 || owned.includes(skinId)) return fail('Already owned');
  if (p.gems < skin.cost) return fail('Not enough gems');
  p.gems -= skin.cost;
  owned.push(skinId);
  return ok();
}
export const ownsSkin = (p, heroId, skinId) => skinId === 'default' || (p.skins[heroId] || []).includes(skinId);
export function equipSkin(p, heroId, skinId) {
  if (!p.heroes[heroId]) return fail('Locked');
  if (!ownsSkin(p, heroId, skinId)) return fail('Not owned');
  p.heroes[heroId].skin = skinId;
  return ok();
}
export function buyTrail(p, id) {
  const t = TRAILS.find((x) => x.id === id);
  if (!t) return fail('Unknown');
  if (p.trails.includes(id)) return fail('Already owned');
  if (p.gems < t.cost) return fail('Not enough gems');
  p.gems -= t.cost;
  p.trails.push(id);
  return ok();
}
export function equipTrail(p, id) {
  if (!p.trails.includes(id)) return fail('Not owned');
  p.trail = id;
  return ok();
}

// ---------------- Research ----------------
export function researchCost(p, id) {
  const r = RESEARCH[id];
  const lv = p.research[id] || 0;
  return lv >= r.max ? null : r.cost[lv];
}
export function buyResearch(p, id) {
  const cost = researchCost(p, id);
  if (cost == null) return fail('Max level');
  if (p.tokens < cost) return fail('Not enough research tokens');
  p.tokens -= cost;
  p.research[id] = (p.research[id] || 0) + 1;
  return ok();
}

// ---------------- Squad ----------------
export function setSquad(p, ids) {
  const slots = slotCount(p);
  const clean = ids.filter((id, i, a) => p.heroes[id] && a.indexOf(id) === i).slice(0, slots);
  if (clean.length === 0) return fail('Squad needs at least one hero');
  p.squad = clean;
  return ok();
}
export function savePreset(p, key) { p.presets[key] = [...p.squad]; return ok(); }
export function loadPreset(p, key) {
  const s = p.presets[key];
  if (!s) return fail('Empty preset');
  return setSquad(p, s);
}

// ---------------- Stage access ----------------
export function isStageUnlocked(p, stage) {
  if (stage.idx === 0) return true;
  return !!p.stages[STAGES[stage.idx - 1].id];
}
export const nextStage = (p) => STAGES.find((s) => !p.stages[s.id]) || null;
export const survivalUnlocked = (p) => !!p.stages[MILESTONES.survival.stage];
export const hardUnlocked = (p) => !!p.stages[MILESTONES.hard.stage];
export const bossStageIds = () => STAGES.filter((s) => s.boss).map((s) => s.id);

// ---------------- Run results ----------------
export function starsFor(win, baseFrac) {
  if (!win) return 0;
  return 1 + (baseFrac >= 0.5 ? 1 : 0) + (baseFrac >= 0.85 ? 1 : 0);
}

/**
 * Apply a finished run to the profile exactly once per runId (GDD 17: "same reward transaction more than once").
 * result: { runId, mode, stageId, hard, win, baseFrac, coinsEarned, wave, kills, cuts, crits, abilities, upgrades, time, bosses }
 */
export function applyRunResult(p, result) {
  if (p.claimed.includes(result.runId)) return { duplicate: true };
  p.claimed.push(result.runId);
  if (p.claimed.length > 25) p.claimed.shift();

  const out = { coins: 0, gems: 0, tokens: 0, frags: {}, stars: 0, newStars: 0, firstClear: false, unlocks: [], converted: 0 };
  const st = p.stats;
  st.runs++;
  st.kills += result.kills || 0;
  st.cuts += result.cuts || 0;
  st.crits += result.crits || 0;
  st.abilities += result.abilities || 0;
  st.upgrades += result.upgrades || 0;
  st.time += result.time || 0;
  st.bosses += result.bosses || 0;
  if (result.win) st.wins++; else st.losses++;

  const wasSlots = slotCount(p);
  const hadSurvival = survivalUnlocked(p);
  const hadHard = hardUnlocked(p);

  if (result.mode === 'survival') {
    const waves = result.wave || 0;
    out.coins = Math.round((result.coinsEarned || 0) + waves * 25);
    out.tokens = Math.floor(waves / 10);
    out.gems = Math.floor(waves / 5);
    // Survival has no stage drops, so it pays out starter fragments instead (1 per hero per 8 waves).
    for (const id of STARTERS) if (waves >= 8) out.frags[id] = Math.floor(waves / 8);
    if (waves > p.survivalBest) { out.newBest = true; p.survivalBest = waves; }
  } else {
    const stage = STAGE_BY_ID[result.stageId];
    const rec = p.stages[stage.id] || { stars: 0, hard: false, hardStars: 0 };
    const hardMul = result.hard ? 1.8 : 1;
    if (result.win) {
      const first = result.hard ? !rec.hard : !p.stages[stage.id];
      out.firstClear = first;
      out.stars = starsFor(true, result.baseFrac);
      const prevStars = result.hard ? rec.hardStars : rec.stars;
      out.newStars = Math.max(0, out.stars - prevStars);
      out.coins = Math.round(((result.coinsEarned || 0) + stage.coins * (first ? 2 : 1)) * hardMul);
      for (const f of stage.frag) {
        const n = Math.max(1, first ? f.n : Math.ceil(f.n / 2)) * (result.hard ? 1.5 : 1);
        out.frags[f.hero] = (out.frags[f.hero] || 0) + Math.ceil(n);
      }
      if (first) out.gems += stage.gems;
      out.gems += out.newStars * 2;
      out.tokens += first ? stage.tokens : replayTokens(stage.tokens);
      if (result.hard) { rec.hard = true; rec.hardStars = Math.max(rec.hardStars || 0, out.stars); } else rec.stars = Math.max(rec.stars, out.stars);
      p.stages[stage.id] = rec;
    } else {
      // Failed attempts still progress: partial coins, a consolation fragment.
      out.coins = Math.round((result.coinsEarned || 0) * 0.6);
      const f = stage.frag[0];
      if (f && (result.wave || 0) >= 1) out.frags[f.hero] = 1;
      if ((result.wave || 0) >= 1) for (const id of STARTERS) out.frags[id] = (out.frags[id] || 0) + 1;
    }
  }

  out.gems = Math.round(out.gems * (1 + researchBonuses(p.research).gems));
  p.coins += out.coins;
  p.gems += out.gems;
  p.tokens += out.tokens;
  for (const id in out.frags) {
    if (p.heroes[id] && p.heroes[id].rank >= MAX_RANK) {
      // Duplicate fragments with nothing left to rank are converted to coins.
      const c = out.frags[id] * 20;
      p.coins += c;
      out.converted += c;
    } else {
      p.frags[id] = (p.frags[id] || 0) + out.frags[id];
    }
  }

  if (!p.flags.heroMenu) { p.flags.heroMenu = true; out.unlocks.push('Hero upgrades unlocked!'); }
  if (slotCount(p) > wasSlots) out.unlocks.push(MILESTONES.slot4.label + ' unlocked!');
  if (!hadSurvival && survivalUnlocked(p)) out.unlocks.push('Survival mode unlocked!');
  if (!hadHard && hardUnlocked(p)) out.unlocks.push('Hard difficulty unlocked!');
  for (const id of HERO_ORDER) {
    const d = HEROES[id];
    if (!p.heroes[id] && d.unlock.frags && (p.frags[id] || 0) >= d.unlock.frags) out.unlocks.push(`${d.name} can be recruited!`);
  }

  // Mission progress
  addProgress(p, 'kills', result.kills || 0);
  addProgress(p, 'cuts', result.cuts || 0);
  addProgress(p, 'crits', result.crits || 0);
  addProgress(p, 'abilities', result.abilities || 0);
  addProgress(p, 'upgrades', result.upgrades || 0);
  addProgress(p, 'bosses', result.bosses || 0);
  if (result.win) addProgress(p, 'wins', 1);

  p.checkpoint = null;
  return out;
}

// ---------------- Missions & login ----------------
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export function weekKey(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Monday = 0
  x.setDate(x.getDate() - dow);
  return dayKey(x);
}

function hashStr(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
function pickN(pool, n, seed) {
  const a = pool.slice();
  let s = seed || 1;
  const out = [];
  while (out.length < n && a.length) {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0;
    out.push(a.splice(s % a.length, 1)[0]);
  }
  return out;
}

/** Ensure today's daily and this week's weekly missions exist. Returns true if anything changed. */
export function ensureMissions(p, now = new Date()) {
  let changed = false;
  const dk = dayKey(now), wk = weekKey(now);
  if (p.missions.day !== dk) {
    p.missions.day = dk;
    p.missions.daily = pickN(DAILY_POOL, 3, hashStr(dk)).map((m) => ({ id: m.id, prog: 0, claimed: false }));
    changed = true;
  }
  if (p.missions.week !== wk) {
    p.missions.week = wk;
    p.missions.weekly = pickN(WEEKLY_POOL, 2, hashStr(wk)).map((m) => ({ id: m.id, prog: 0, claimed: false }));
    changed = true;
  }
  return changed;
}
export function missionDef(id) { return DAILY_POOL.find((m) => m.id === id) || WEEKLY_POOL.find((m) => m.id === id); }
export function addProgress(p, stat, n) {
  if (!n) return;
  for (const list of [p.missions.daily, p.missions.weekly]) {
    for (const m of list) {
      const d = missionDef(m.id);
      if (d && d.stat === stat && !m.claimed) m.prog = Math.min(d.goal, m.prog + n);
    }
  }
}
export function claimMission(p, kind, index) {
  const m = (kind === 'weekly' ? p.missions.weekly : p.missions.daily)[index];
  if (!m) return fail('Missing');
  const d = missionDef(m.id);
  if (m.claimed) return fail('Already claimed');
  if (m.prog < d.goal) return fail('Not complete');
  m.claimed = true;
  grant(p, d.reward);
  return ok({ reward: d.reward });
}
export function grant(p, r) { p.coins += r.coins || 0; p.gems += r.gems || 0; p.tokens += r.tokens || 0; }

export function loginState(p, now = new Date()) {
  const today = dayKey(now);
  const y = new Date(now); y.setDate(y.getDate() - 1);
  let streak = p.login.streak;
  const claimedToday = p.login.last === today;
  if (!claimedToday && p.login.last !== dayKey(y) && p.login.last !== '') streak = 0; // streak broken
  return { claimedToday, streak, nextDay: claimedToday ? streak - 1 : streak % LOGIN_CALENDAR.length };
}
export function claimLogin(p, now = new Date()) {
  const s = loginState(p, now);
  if (s.claimedToday) return fail('Already claimed today');
  const reward = LOGIN_CALENDAR[s.streak % LOGIN_CALENDAR.length];
  grant(p, reward);
  p.login.streak = s.streak + 1;
  p.login.last = dayKey(now);
  return ok({ reward, day: s.streak % LOGIN_CALENDAR.length });
}

/** Number of rewards waiting to be claimed (missions + today's login reward) - drives the nav badge. */
export function claimableMissions(p, now = new Date()) {
  let n = loginState(p, now).claimedToday ? 0 : 1;
  for (const list of [p.missions.daily, p.missions.weekly]) {
    for (const m of list) { const d = missionDef(m.id); if (d && !m.claimed && m.prog >= d.goal) n++; }
  }
  return n;
}

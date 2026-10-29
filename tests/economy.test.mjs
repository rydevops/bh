import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultProfile, encode, decode, sanitize, migrate, SAVE_VERSION, exportText, importText, loadProfile, writeProfile } from '../js/save.js';
import * as eco from '../js/economy.js';
import { STAGE_BY_ID } from '../js/data/stages.js';
import { levelCost, levelCap } from '../js/data/heroes.js';
import { slotCount, squadPower, heroPower } from '../js/progression.js';

const win = (p, stageId, extra = {}) => eco.applyRunResult(p, {
  runId: stageId + Math.random(), mode: 'campaign', stageId, hard: false, win: true, baseFrac: 0.9, coinsEarned: 50,
  kills: 40, cuts: 3, crits: 5, abilities: 2, upgrades: 3, time: 90, bosses: STAGE_BY_ID[stageId].boss ? 1 : 0, wave: 3, ...extra,
});

test('save round-trips through encode/decode and export/import', () => {
  const p = defaultProfile();
  p.coins = 1234; p.heroes.vanguard.lv = 7;
  assert.equal(decode(encode(p)).coins, 1234);
  assert.equal(importText(exportText(p)).heroes.vanguard.lv, 7);
});

test('corrupted saves are rejected by checksum', () => {
  const text = encode(defaultProfile());
  const bad = text.replace('"coins\\":0', '"coins\\":999');
  assert.notEqual(bad, text);
  assert.throws(() => decode(bad));
});

test('main save corruption falls back to the backup copy', () => {
  const store = {};
  globalThis.localStorage = { getItem: (k) => store[k] ?? null, setItem: (k, v) => { store[k] = v; }, removeItem: (k) => { delete store[k]; } };
  const p = defaultProfile(); p.coins = 10; writeProfile(p);
  p.coins = 20; writeProfile(p);
  store['bullet-heroes.save'] = '{broken';
  assert.equal(loadProfile().coins, 10);
  store['bullet-heroes.save.bak'] = 'also broken';
  assert.equal(loadProfile().coins, 0, 'fresh profile if everything is unreadable');
  delete globalThis.localStorage;
});

test('older/partial saves migrate and are sanitised', () => {
  const old = { v: 0, coins: 55, heroes: { vanguard: { lv: 3, rank: 1, skin: 'default' } }, squad: ['vanguard', 'ghost', 'vanguard'] };
  const p = sanitize(migrate(old));
  assert.equal(p.coins, 55);
  assert.deepEqual(p.squad, ['vanguard']);
  assert.ok(p.settings && p.stats && p.flags);
  assert.equal(SAVE_VERSION, 1);
});

test('hero level-up spends coins, respects the rank cap', () => {
  const p = defaultProfile();
  assert.equal(eco.levelUpHero(p, 'vanguard').ok, false);
  p.coins = 100000;
  for (let i = 0; i < 9; i++) assert.ok(eco.levelUpHero(p, 'vanguard').ok);
  assert.equal(p.heroes.vanguard.lv, levelCap(1));
  assert.match(eco.levelUpHero(p, 'vanguard').reason, /Rank/);
  p.frags.vanguard = 10;
  assert.ok(eco.rankUpHero(p, 'vanguard').ok);
  assert.ok(eco.levelUpHero(p, 'vanguard').ok);
  assert.ok(p.coins < 100000 - levelCost(1));
});

test('first clear grants bonus rewards; replay grants less; failure still progresses', () => {
  const p = defaultProfile();
  const first = win(p, '1-1');
  assert.equal(first.firstClear, true);
  assert.equal(first.stars, 3);
  assert.ok(first.gems >= STAGE_BY_ID['1-1'].gems);
  assert.equal(first.frags.pulse, 3);
  const replay = win(p, '1-1');
  assert.equal(replay.firstClear, false);
  assert.ok(replay.coins < first.coins);
  assert.equal(replay.gems, 0);
  const lose = eco.applyRunResult(p, { runId: 'l1', mode: 'campaign', stageId: '1-2', win: false, baseFrac: 0, coinsEarned: 100, wave: 2, kills: 10 });
  assert.equal(lose.coins, 60);
  assert.ok(!p.stages['1-2'], 'a loss does not clear the stage');
  assert.ok(lose.frags.pulse >= 1);
});

test('the same reward transaction is never applied twice', () => {
  const p = defaultProfile();
  const r = { runId: 'dup-1', mode: 'campaign', stageId: '1-1', win: true, baseFrac: 1, coinsEarned: 10, wave: 3 };
  eco.applyRunResult(p, r);
  const coins = p.coins;
  assert.equal(eco.applyRunResult(p, r).duplicate, true);
  assert.equal(p.coins, coins);
});

test('progression milestones: stage unlocks, hero recruitment, fourth slot, survival, hard', () => {
  const p = defaultProfile();
  assert.equal(eco.isStageUnlocked(p, STAGE_BY_ID['1-2']), false);
  win(p, '1-1');
  assert.equal(eco.isStageUnlocked(p, STAGE_BY_ID['1-2']), true);
  assert.equal(p.flags.heroMenu, true);
  win(p, '1-2'); win(p, '1-3');
  assert.ok(p.frags.pulse >= 10);
  assert.ok(eco.unlockHero(p, 'pulse').ok);
  assert.equal(p.heroes.pulse.lv, 1);
  assert.equal(slotCount(p), 3);
  for (const id of ['1-4', '2-1', '2-2']) win(p, id);
  assert.equal(slotCount(p), 4);
  assert.equal(eco.survivalUnlocked(p), false);
  win(p, '2-3'); const r = win(p, '2-4');
  assert.ok(r.unlocks.some((u) => /Survival/.test(u)));
  assert.equal(eco.survivalUnlocked(p), true);
  assert.equal(eco.hardUnlocked(p), false);
  for (const id of ['3-1', '3-2', '3-3', '3-4']) win(p, id);
  assert.equal(eco.hardUnlocked(p), true);
  assert.ok(p.tokens >= 9, 'bosses grant research tokens');
});

test('squad rules: no duplicates, slot limit, presets', () => {
  const p = defaultProfile();
  eco.setSquad(p, ['vanguard', 'vanguard', 'rook', 'patch', 'pulse']);
  assert.deepEqual(p.squad, ['vanguard', 'rook', 'patch']);
  assert.equal(eco.setSquad(p, ['pulse']).ok, false, 'locked heroes cannot be selected');
  eco.setSquad(p, ['rook', 'patch']);
  eco.savePreset(p, 'A');
  eco.setSquad(p, ['vanguard']);
  eco.loadPreset(p, 'A');
  assert.deepEqual(p.squad, ['rook', 'patch']);
});

test('cosmetics cost gems only and can be equipped once owned', () => {
  const p = defaultProfile();
  assert.equal(eco.buySkin(p, 'vanguard', 'arctic').ok, false);
  p.gems = 100;
  assert.ok(eco.buySkin(p, 'vanguard', 'arctic').ok);
  assert.equal(p.gems, 40);
  assert.equal(eco.equipSkin(p, 'vanguard', 'gold').ok, false);
  assert.ok(eco.equipSkin(p, 'vanguard', 'arctic').ok);
  p.gems += 200;
  assert.ok(eco.buyTrail(p, 'mono').ok);
  assert.ok(eco.equipTrail(p, 'mono').ok);
});

test('research spends tokens up to the cap', () => {
  const p = defaultProfile();
  p.tokens = 100;
  for (let i = 0; i < 3; i++) assert.ok(eco.buyResearch(p, 'field_kit').ok);
  assert.equal(eco.buyResearch(p, 'field_kit').ok, false);
  assert.equal(p.research.field_kit, 3);
});

test('daily/weekly missions generate deterministically, track progress and pay out once', () => {
  const p = defaultProfile();
  const day = new Date(2026, 9, 28);
  assert.ok(eco.ensureMissions(p, day));
  const copy = defaultProfile(); eco.ensureMissions(copy, day);
  assert.deepEqual(p.missions.daily.map((m) => m.id), copy.missions.daily.map((m) => m.id));
  assert.equal(p.missions.daily.length, 3);
  assert.equal(p.missions.weekly.length, 2);
  for (const m of p.missions.daily) { const d = eco.missionDef(m.id); eco.addProgress(p, d.stat, 9999); }
  const before = p.coins + p.gems;
  assert.ok(eco.claimMission(p, 'daily', 0).ok);
  assert.equal(eco.claimMission(p, 'daily', 0).ok, false);
  assert.ok(p.coins + p.gems > before);
  assert.equal(eco.ensureMissions(p, day), false, 'same day keeps missions');
  assert.ok(eco.ensureMissions(p, new Date(2026, 9, 29)), 'new day rerolls');
});

test('login calendar: one claim per day, streak continues, breaks after a missed day', () => {
  const p = defaultProfile();
  const d1 = new Date(2026, 9, 28), d2 = new Date(2026, 9, 29), d4 = new Date(2026, 9, 31);
  assert.ok(eco.claimLogin(p, d1).ok);
  assert.equal(eco.claimLogin(p, d1).ok, false);
  assert.equal(eco.claimLogin(p, d2).day, 1);
  assert.equal(eco.claimLogin(p, d4).day, 0, 'streak reset after a gap');
});

test('hero power scales with level and rank', () => {
  assert.ok(heroPower('vanguard', 10, 1) > heroPower('vanguard', 1, 1) * 2);
  assert.ok(heroPower('vanguard', 10, 3) > heroPower('vanguard', 10, 1));
  const p = defaultProfile();
  assert.equal(squadPower(p), heroPower('vanguard', 1, 1) + heroPower('rook', 1, 1) + heroPower('patch', 1, 1));
});

test('every stage drops fragments for every starting hero, and a loss still gives each of them one', async () => {
  const { STAGES, STARTERS } = await import('../js/data/stages.js');
  assert.deepEqual([...STARTERS].sort(), ['patch', 'rook', 'vanguard']);
  for (const s of STAGES) for (const id of STARTERS) assert.ok(s.frag.some((f) => f.hero === id && f.n >= 2), `${s.id} drops ${id}`);
  const p = defaultProfile();
  const win1 = win(p, '1-1');
  for (const id of STARTERS) assert.ok(win1.frags[id] >= 2, `first clear of 1-1 gives ${id} fragments`);
  const lose = eco.applyRunResult(p, { runId: 'l9', mode: 'campaign', stageId: '1-2', win: false, baseFrac: 0, coinsEarned: 10, wave: 2, kills: 5 });
  for (const id of STARTERS) assert.ok(lose.frags[id] >= 1, `a loss still gives ${id} a fragment`);
  assert.ok(p.frags.vanguard > 0 && p.frags.rook > 0 && p.frags.patch > 0);
});

test('starting heroes can rank up from stage fragments', () => {
  const p = defaultProfile();
  for (const id of ['1-1', '1-2', '1-3', '1-4']) win(p, id);
  assert.ok(p.frags.rook >= 10, 'enough Rook fragments for rank 2 after World 1');
  assert.ok(eco.rankUpHero(p, 'rook').ok);
});

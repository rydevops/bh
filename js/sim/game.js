// Combat simulation (GDD sections 3, 4, 6, 7). No DOM, no rendering, no audio:
// the presentation layer reads state and drains `events` every frame.
// Fixed-timestep, seeded RNG -> deterministic runs that can be replayed in Node for balance tests.

import { clamp, dist, pointSegDist2, Pool, RNG } from '../util.js';
import { HEROES } from '../data/heroes.js';
import { ENEMIES, BOSSES, MODIFIERS, statScale } from '../data/enemies.js';
import { UPGRADES, modsFromUpgrades, rollUpgrades } from '../data/upgrades.js';
import { buildWaves, survivalWave } from '../data/stages.js';
import { researchBonuses } from '../data/research.js';
import { attackPower, levelMult, rankBonuses } from '../progression.js';
import { computeDamage, resistMult, absorb } from './damage.js';
import { spawnBoss, updateBoss, bossDamageHook, killAllMinions } from './bosses.js';

export const W = 360;
const STEP_MAX = 1 / 30;
/** Order in which chambers become loaded (spread around the ring so a 2nd chamber sits opposite the 1st, etc). */
export const CHAMBER_ORDER = [0, 3, 1, 4, 2, 5];
const TICK = 0.1; // beam / flame damage tick
/** Chance that a post-wave reward round offers a new hero (guaranteed after one miss). */
export const SUMMON_CHANCE = 0.5;

export class Game {
  /**
   * @param {object} o
   *  stage: stage def (null => survival), hard, squad: [{id, lv, rank, skin}], research: levels,
   *  layout: {H, wallY, heroY}, seed, resume: checkpoint, emit: whether to queue presentation events
   */
  constructor(o) {
    this.opts = o;
    this.W = W;
    this.H = o.layout?.H ?? 680;
    this.wallY = o.layout?.wallY ?? this.H - 200;
    this.heroY = o.layout?.heroY ?? this.wallY + 54;
    this.rng = new RNG(o.seed ?? 1);
    this.emit = o.emit !== false;
    this.events = [];
    this.stage = o.stage || null;
    this.survival = !o.stage;
    this.hard = !!o.hard;
    this.bonus = researchBonuses(o.research || {});
    this.stageIdx = this.stage ? this.stage.idx : 0;
    this.modifier = this.stage?.mod ? MODIFIERS[this.stage.mod] : null;

    this.t = 0;
    this.state = 'combat'; // combat | upgrade | victory | defeat
    this.waveIdx = -1;
    this.waveT = 0;
    this.spawnQ = [];
    this.bannerT = 0;
    this.waves = this.survival ? null : buildWaves(this.stage, { hard: this.hard });
    this.waveCount = this.survival ? Infinity : this.waves.length;

    this.owned = {};
    this.mods = modsFromUpgrades(this.owned);
    this.enemies = [];
    this.bullets = new Pool(() => ({ tgt: null, hit: [] }));
    this.ebullets = new Pool(() => ({}));
    this.zones = [];
    this.telegraphs = [];
    this.turrets = [];
    this.queue = []; // delayed actions (e.g. salvo rockets)
    this.nextId = 1;
    this.boss = null;
    this.beamHazard = null;
    this.squadBuff = { t: 0, mult: 1 };
    this.nearWall = false;
    this.maxHpEnemy = null;
    this.auraT = 0;
    this.endT = 0;

    this.stats = { kills: 0, cuts: 0, crits: 0, abilities: 0, upgrades: 0, bosses: 0, coins: 0, hitsTaken: 0 };

    // Wall (objective)
    const baseMax = 320 * (1 + 0.05 * this.stageIdx);
    this.baseMax0 = baseMax;
    this.base = { hp: baseMax, max: baseMax, barrier: { hp: 0, t: 0 }, flash: 0, regenAcc: 0 };

    // Cut energy for bullet cutting (GDD 4.4)
    this.cut = { energy: 100, max: 100 };

    // Revolver ammo economy: the slicer cuts bullets from the cylinder into a pile; heroes draw from the pile.
    // Base output (1 bullet / 0.36s) exactly feeds one rifle; upgrades raise it to 6 per cycle.
    // The revolver is static: 6 chambers around a ring. The slicer is a clock hand that sweeps around it once every
    // `rev` seconds, and each LOADED (unlocked) chamber it passes drops one bullet onto the pile.
    // Base: 1 loaded chamber, one sweep per 1.2s = 1 bullet/s (exactly one Vanguard's appetite).
    this.ammo = {
      pile: 6, cap0: 12, cap: 12, ph: 5.2, revBase: 1.2, rev: 1.2, unlocked: 1,
      made: 0, taken: 0, waiting: false, starve: 0, flash: [0, 0, 0, 0, 0, 0],
    };
    this.summonMissed = 0;
    this.summonOffer = false;

    // Heroes
    // Each battle deploys only the lead hero; the rest of the squad waits in `reserve` and is
    // summoned by reward cards after waves (see rollChoices / summon).
    const n = o.squad.length;
    this.allHeroes = o.squad.map((s, i) => this.makeHero(s, i, n));
    const startN = o.deploy === 'all' ? n : Math.max(1, Math.min(n, o.deploy ?? 1));
    this.heroes = this.allHeroes.slice(0, startN);
    this.reserve = this.allHeroes.slice(startN);
    this.layoutHeroes(true);
    this.rerolls = this.bonus.rerolls;
    this.choices = null;
    this.pendingPicks = this.bonus.startPicks;
    this.recomputeMods(true);

    if (o.resume) this.restore(o.resume);

    if (this.pendingPicks > 0 && !o.resume) this.openUpgrade();
    else this.startWave(o.resume ? o.resume.wave : 0);
  }

  // ------------------------------------------------------------------ setup
  makeHero(s, i, n) {
    const def = HEROES[s.id];
    const rb = rankBonuses(s.rank);
    return {
      idx: i, id: s.id, def, lv: s.lv, rank: s.rank, skin: s.skin || 'default', rb,
      x: W / 2, tx: W / 2, y: this.heroY, spawnT: 0,
      atk: attackPower(s.id, s.lv, s.rank),
      // damage per 0.1s tick if the weapon fired continuously (used by Sustained Beam, Firestorm and burn)
      cont: (attackPower(s.id, s.lv, s.rank) * (def.base.volley || 1) * 0.1) / def.base.interval,
      cd: 0.3 + i * 0.11, cdMax: 0.3 + i * 0.11, retryT: 0, burstT: 0, tickCd: 0, dry: false, tgt: null, recoil: 0, disabled: 0, flash: 0,
      ab: { cd: def.ability.cd * 0.35, max: def.ability.cd, active: 0, activeMax: 0 },
      buff: { rate: 1, rateT: 0 },
      deadEyeT: 0, beamBoost: 0, beam: null, flameOn: false, interceptCd: 3,
      shots: 0, droneT: i * 1.7,
    };
  }

  /** Hero by squad slot, or null while that hero is still in reserve. */
  hero(i) { return this.heroes.find((h) => h.idx === i) || null; }

  /** Spread the deployed heroes evenly across the wall, in squad order. Heroes glide to their new spot. */
  layoutHeroes(snap = false) {
    this.heroes.sort((a, b) => a.idx - b.idx);
    const n = this.heroes.length;
    this.heroes.forEach((h, k) => { h.tx = (W * (k + 1)) / (n + 1); if (snap) h.x = h.tx; });
  }

  /** Bring a reserve hero into the battle (reward card). */
  summon(heroId) {
    const k = this.reserve.findIndex((h) => h.id === heroId);
    if (k < 0) return false;
    const h = this.reserve.splice(k, 1)[0];
    this.heroes.push(h);
    this.layoutHeroes();
    h.x = h.tx; h.spawnT = 0.8; h.cd = h.cdMax = 0.4;
    h.ab.cd = h.ab.max * 0.5;
    this.ev('summon', { i: h.idx, id: h.id, x: h.x, y: h.y });
    return true;
  }

  recomputeMods(initial) {
    this.mods = modsFromUpgrades(this.owned);
    const newMax = this.baseMax0 * (1 + this.mods.hpMult + this.bonus.hp);
    const delta = newMax - this.base.max;
    this.base.max = newMax;
    if (delta > 0) this.base.hp += delta;
    this.cut.max = 100 * (1 + this.mods.cut + this.bonus.cut);
    const am = this.ammo;
    am.unlocked = Math.min(6, 1 + this.mods.slicer);
    am.rev = am.revBase * (1 - Math.min(0.6, this.mods.cycle));
    am.cap = am.cap0 + this.mods.pile;
    if (initial) this.cut.energy = this.cut.max;
    // Turrets (GDD 7.2): flank positions on the wall.
    const want = Math.min(2, this.mods.turrets);
    while (this.turrets.length < want) {
      const left = this.turrets.length === 0;
      this.turrets.push({ x: left ? 30 : W - 30, y: this.wallY - 6, cd: 0.2, recoil: 0, tgt: null });
      if (!initial) this.ev('turret', { x: left ? 30 : W - 30, y: this.wallY - 6 });
    }
    // Ability cooldown maxima honour haste (upgrades + research + rank).
    for (const h of this.allHeroes) {
      const haste = clamp(this.mods.haste + this.bonus.haste - h.rb.cooldown, 0, 0.65);
      const frac = h.ab.max > 0 ? h.ab.cd / h.ab.max : 1;
      h.ab.max = h.def.ability.cd * (1 - haste);
      h.ab.cd = h.ab.max * frac;
    }
  }

  ev(type, d) {
    if (!this.emit) return;
    if (this.events.length > 700) return;
    d.type = type;
    this.events.push(d);
  }

  // ------------------------------------------------------------------ waves
  startWave(i) {
    this.waveIdx = i;
    this.waveT = 0;
    this.state = 'combat';
    const groups = this.survival ? survivalWave(i) : this.waves[i];
    this.spawnQ = [];
    for (const g of groups) {
      if (g.boss) { this.spawnQ.push({ t: g.at, boss: g.boss }); continue; }
      for (let k = 0; k < g.n; k++) this.spawnQ.push({ t: g.at + k * g.every, e: g.e });
    }
    this.spawnQ.sort((a, b) => a.t - b.t);
    this.bannerT = 2.2;
    const isBossWave = groups.some((g) => g.boss);
    this.ev('wave', { wave: i, total: this.waveCount, boss: isBossWave });
  }

  scale() {
    const idx = this.survival ? 2 + this.waveIdx * 0.55 : this.stageIdx;
    return statScale(idx, this.survival ? 0 : this.waveIdx, this.hard);
  }

  spawnEnemy(typeOrDef, x, opts = {}) {
    const def = typeof typeOrDef === 'string' ? ENEMIES[typeOrDef] : typeOrDef;
    const type = def.id;
    const sc = this.scale();
    const m = this.modifier || {};
    const hp = def.hp * sc.hp * (m.hp || 1);
    const e = {
      id: this.nextId++, type, def, boss: null,
      x: x ?? this.rng.range(24, W - 24), y: opts.y ?? -16,
      hp, max: hp, shield: def.shield * sc.hp, shieldMax: def.shield * sc.hp,
      armor: clamp(def.armor + (m.armorAdd || 0), 0, 0.8),
      speed: def.speed * (m.speed || 1), r: def.r,
      dmg: sc.dmg, regen: m.regen || 0, regenT: 0,
      vx: 0, vy: 0, t: this.rng.range(0, 6), zig: this.rng.range(0, 6.28),
      slowF: 1, slowT: 0, burnDps: 0, burnT: 0, burnTick: 0,
      aura: 0, focusN: 0, focusT: 0, flash: 0, pend: 0, dead: false,
      fireT: this.rng.range(0.8, def.fireEvery || 2), atWall: false,
      holdY: def.holdDist ? this.wallY - def.holdDist : null,
      world: this.stage ? this.stage.world : Math.floor(this.waveIdx / 10) % 3,
      untargetable: false, hitFlash: 0,
    };
    this.enemies.push(e);
    return e;
  }

  // ------------------------------------------------------------------ main update
  update(dtRaw) {
    const dt = Math.min(dtRaw, STEP_MAX);
    if (this.state === 'upgrade') return;
    this.t += dt;
    if (this.state === 'victory' || this.state === 'defeat') { this.endT += dt; this.updateFx(dt); return; }

    this.waveT += dt;
    if (this.bannerT > 0) this.bannerT -= dt;
    this.updateSpawns();
    this.updateStatus(dt);
    this.updateAmmo(dt);
    this.updateEnemies(dt);
    this.updateHeroes(dt);
    this.updateTurrets(dt);
    this.updateBullets(dt);
    this.updateEnemyBullets(dt);
    this.updateZones(dt);
    this.updateQueue(dt);
    this.updateBase(dt);
    this.updateFx(dt);
    this.autoAbilities();

    this.bullets.sweep((b) => this.releaseBullet(b));
    this.ebullets.sweep();
    this.enemies = this.enemies.filter((e) => !e.dead);
    for (const h of this.heroes) if (h.tgt && h.tgt.dead) { h.tgt = null; if (h.beam) h.beam = null; }

    if (this.base.hp <= 0 && this.state === 'combat') { this.state = 'defeat'; this.endT = 0; this.ev('defeat', {}); return; }
    this.checkWaveClear();
  }

  updateSpawns() {
    while (this.spawnQ.length && this.spawnQ[0].t <= this.waveT) {
      const s = this.spawnQ.shift();
      if (s.boss) { spawnBoss(this, s.boss); continue; }
      this.spawnEnemy(s.e);
    }
  }

  checkWaveClear() {
    if (this.spawnQ.length > 0 || this.enemies.length > 0 || this.state !== 'combat') return;
    // Boss victory handled in bosses.js via kill chain; here only regular wave clear.
    const lastWave = !this.survival && this.waveIdx >= this.waveCount - 1;
    if (lastWave) {
      this.state = 'victory';
      this.endT = 0;
      this.ev('victory', {});
      return;
    }
    this.ev('waveClear', { wave: this.waveIdx });
    if (this.survival) this.base.hp = Math.min(this.base.max, this.base.hp + this.base.max * 0.08);
    // Survival offers upgrades every 2nd wave to keep runs flowing.
    if (this.survival && (this.waveIdx % 2 === 1 || this.reserve.length)) { this.openUpgrade(); return; }
    if (this.survival) { this.checkpoint(this.waveIdx + 1); this.startWave(this.waveIdx + 1); return; }
    this.openUpgrade();
  }

  // ------------------------------------------------------------------ upgrades
  openUpgrade() {
    this.state = 'upgrade';
    // Extra heroes are a random reward: SUMMON_CHANCE per checkpoint, but never two checkpoints in a row without one.
    this.summonOffer = this.reserve.length > 0 && (this.summonMissed >= 1 || this.rng.chance(SUMMON_CHANCE));
    this.summonMissed = this.summonOffer ? 0 : this.summonMissed + 1;
    this.choices = this.rollChoices();
    this.ev('upgradeOpen', {});
  }
  squadTags() { const s = new Set(); for (const h of this.allHeroes) for (const t of h.def.tags) s.add(t); return s; }
  rollChoices(exclude = []) {
    const summon = this.summonOffer && this.reserve.length > 0;
    const picks = rollUpgrades(this.rng, {
      owned: this.owned, squadTags: this.squadTags(),
      enemyTags: new Set(this.stage ? this.stage.tags : ['swarm', 'armored', 'ranged']),
      wave: Math.max(0, this.waveIdx), baseFrac: this.base.hp / this.base.max, n: summon ? 2 : 3, exclude,
      ammoPressure: this.ammo.starve,
    });
    return summon ? ['summon:' + this.reserve[0].id, ...picks] : picks;
  }
  reroll() {
    if (this.state !== 'upgrade' || this.rerolls <= 0) return false;
    this.rerolls--;
    this.choices = this.rollChoices(this.choices);
    this.ev('reroll', {});
    return true;
  }
  pickUpgrade(id) {
    if (this.state !== 'upgrade' || !this.choices || !this.choices.includes(id)) return false;
    this.stats.upgrades++;
    if (id.startsWith('summon:')) {
      this.summon(id.slice(7));
      this.recomputeMods(false);
      this.ev('upgradePicked', { id, cat: 'summon' });
    } else {
      const u = UPGRADES[id];
      this.owned[id] = (this.owned[id] || 0) + 1;
      if (id === 'field_repair') this.base.hp = Math.min(this.base.max, this.base.hp + this.base.max * 0.25);
      if (id === 'quick_charge') for (const h of this.heroes) h.ab.cd = Math.max(0, h.ab.cd - h.ab.max * 0.6);
      if (id === 'lucky_draw') this.rerolls++;
      this.recomputeMods(false);
      this.ev('upgradePicked', { id, cat: u.cat });
    }
    this.choices = null;
    if (this.pendingPicks > 0) {
      this.pendingPicks--;
      if (this.pendingPicks > 0) { this.openUpgrade(); return true; }
      if (this.waveIdx < 0 || this.waveIdx === undefined) { this.startWave(0); return true; }
    }
    const next = this.waveIdx < 0 ? 0 : this.waveIdx + 1;
    this.checkpoint(next);
    this.startWave(next);
    return true;
  }

  // Save-on-wave-boundary snapshot (GDD: interrupted gameplay can recover safely).
  snapshot(nextWave) {
    return {
      stageId: this.stage ? this.stage.id : null, survival: this.survival, hard: this.hard,
      wave: nextWave, owned: { ...this.owned }, baseFrac: this.base.hp / this.base.max,
      rerolls: this.rerolls, stats: { ...this.stats }, seed: (this.opts.seed ?? 1) + nextWave * 7919,
      squad: this.opts.squad.map((s) => ({ ...s })),
      deployed: this.heroes.map((h) => h.idx), missed: this.summonMissed,
    };
  }
  checkpoint(nextWave) { this.ev('checkpoint', { snap: this.snapshot(nextWave) }); }
  restore(cp) {
    this.owned = { ...cp.owned };
    this.stats = { ...this.stats, ...cp.stats };
    this.rerolls = cp.rerolls;
    this.pendingPicks = 0;
    this.summonMissed = cp.missed ?? 0;
    if (cp.deployed) {
      const set = new Set(cp.deployed);
      this.heroes = this.allHeroes.filter((h) => set.has(h.idx));
      this.reserve = this.allHeroes.filter((h) => !set.has(h.idx));
      if (!this.heroes.length) { this.heroes = [this.reserve.shift()]; }
      this.layoutHeroes(true);
    }
    this.recomputeMods(true);
    this.base.hp = Math.max(1, this.base.max * cp.baseFrac);
    this.rng = new RNG(cp.seed);
  }

  // ------------------------------------------------------------------ status effects
  updateStatus(dt) {
    this.nearWall = false;
    let maxHp = null;
    this.auraT -= dt;
    const doAura = this.auraT <= 0;
    if (doAura) {
      this.auraT = 0.2;
      for (const e of this.enemies) e.aura = 0;
    }
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (e.y > this.wallY - 150) this.nearWall = true;
      if (!maxHp || e.hp > maxHp.hp) maxHp = e;
      if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slowF = 1; }
      if (e.focusT > 0) { e.focusT -= dt; if (e.focusT <= 0) e.focusN = 0; }
      if (e.flash > 0) e.flash -= dt;
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.burnTick -= dt;
        if (e.burnTick <= 0) { e.burnTick = 0.5; this.hurt(e, e.burnDps * 0.5, { dot: true, el: 'fire' }); }
      }
      if (e.regen && e.hp > 0 && e.hp < e.max && !e.boss) {
        e.hp = Math.min(e.max, e.hp + e.max * e.regen * dt);
      }
      if (doAura && e.def.aura && !e.dead) {
        const a = e.def.aura;
        for (const o of this.enemies) {
          if (o !== e && !o.dead && Math.abs(o.x - e.x) < a.r && Math.abs(o.y - e.y) < a.r && dist(o.x, o.y, e.x, e.y) < a.r) o.aura = Math.max(o.aura, a.reduce);
        }
      }
    }
    this.maxHpEnemy = maxHp;
    if (this.squadBuff.t > 0) { this.squadBuff.t -= dt; if (this.squadBuff.t <= 0) this.squadBuff.mult = 1; }
    if (this.base.barrier.t > 0) { this.base.barrier.t -= dt; if (this.base.barrier.t <= 0) this.base.barrier.hp = 0; }
    if (this.base.flash > 0) this.base.flash -= dt;
    this.cut.energy = Math.min(this.cut.max, this.cut.energy + 14 * (1 + this.mods.cut * 0.8 + this.bonus.cut * 0.8) * dt);
    for (const h of this.heroes) {
      h.x += (h.tx - h.x) * Math.min(1, dt * 5);
      if (h.spawnT > 0) h.spawnT -= dt;
      if (h.disabled > 0) h.disabled -= dt;
      if (h.recoil > 0) h.recoil -= dt * 8;
      if (h.flash > 0) h.flash -= dt;
      if (h.buff.rateT > 0) { h.buff.rateT -= dt; if (h.buff.rateT <= 0) h.buff.rate = 1; }
      if (h.deadEyeT > 0) h.deadEyeT -= dt;
      if (h.beamBoost > 0) h.beamBoost -= dt;
      if (h.ab.cd > 0) h.ab.cd = Math.max(0, h.ab.cd - dt);
      if (h.ab.active > 0) h.ab.active = Math.max(0, h.ab.active - dt);
      h.droneT += dt;
    }
  }

  // ------------------------------------------------------------------ enemies
  updateEnemies(dt) {
    const E = this.enemies;
    for (let i = 0; i < E.length; i++) {
      const e = E[i];
      if (e.dead) continue;
      e.t += dt;
      if (e.boss) { updateBoss(this, e, dt); continue; }
      const def = e.def;
      const sp = e.speed * e.slowF;
      let vx = 0, vy = 0;
      const stopY = e.holdY ?? this.wallY - e.r * 0.5;
      if (def.behavior === 'melee') {
        if (e.y < stopY) vy = sp;
        else { e.atWall = true; this.damageBase(def.wallDps * e.dmg * dt); }
        if (def.zig && !e.atWall) vx = Math.sin(e.t * 3 + e.zig) * def.zig;
      } else {
        // ranged / support hold at a standoff distance
        if (e.y < stopY) vy = sp;
        if (def.fly) vx = Math.sin(e.t * 1.6 + e.zig) * 34;
        if (def.behavior === 'ranged' && e.y > 6) {
          e.fireT -= dt;
          if (e.fireT <= 0) { e.fireT = def.fireEvery; this.enemyShoot(e); }
        }
      }
      e.vx = vx; e.vy = vy;
      e.x = clamp(e.x + vx * dt, e.r, W - e.r);
      e.y += vy * dt;
    }
    // soft separation so groups don't stack on one pixel
    for (let i = 0; i < E.length; i++) {
      const a = E[i];
      if (a.dead || a.boss) continue;
      for (let j = i + 1; j < E.length; j++) {
        const b = E[j];
        if (b.dead || b.boss) continue;
        const dy = b.y - a.y;
        if (dy > 22 || dy < -22) continue;
        const dx = b.x - a.x;
        const min = (a.r + b.r) * 0.8;
        if (dx > min || dx < -min) continue;
        const d2 = dx * dx + dy * dy;
        if (d2 < min * min && d2 > 0.0001) {
          const d = Math.sqrt(d2);
          const push = ((min - d) / d) * 0.25;
          a.x -= dx * push; b.x += dx * push;
          if (!a.atWall) a.y -= dy * push * 0.4;
          if (!b.atWall) b.y += dy * push * 0.4;
        }
      }
    }
  }

  enemyShoot(e) {
    const b = e.def.bullet;
    const tx = clamp(e.x + this.rng.range(-50, 50), 30, W - 30);
    const ty = this.wallY + 4;
    const a = Math.atan2(ty - e.y, tx - e.x);
    this.spawnEnemyBullet(e.x, e.y + e.r, Math.cos(a) * b.speed, Math.sin(a) * b.speed, b.dmg * e.dmg, b.r, b.cutHp, 'spit');
    this.ev('enemyShot', { x: e.x, y: e.y });
  }

  spawnEnemyBullet(x, y, vx, vy, dmg, r, cutHp, kind) {
    const b = this.ebullets.spawn();
    b.x = x; b.y = y; b.vx = vx; b.vy = vy; b.dmg = dmg; b.r = r; b.cutHp = cutHp; b.kind = kind; b.cutCd = 0; b.t = 0;
    return b;
  }

  updateEnemyBullets(dt) {
    for (const b of this.ebullets.items) {
      b.t += dt;
      if (b.cutCd > 0) b.cutCd -= dt;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.y >= this.wallY || b.x < -40 || b.x > W + 40) {
        b.dead = true;
        if (b.y >= this.wallY) {
          this.damageBase(b.dmg);
          this.stats.hitsTaken++;
          if (b.kind === 'bomb') this.bombBlast(b.x, this.wallY, b.dmg);
          else this.ev('baseHit', { x: b.x, y: this.wallY, big: false });
        }
      }
    }
  }

  bombBlast(x, y) {
    this.ev('explosion', { x, y, r: 60, big: true, enemy: true });
    for (const h of this.heroes) if (Math.abs(h.x - x) < 62) { h.disabled = Math.max(h.disabled, 2.2); this.ev('heroStun', { i: h.idx }); }
  }

  // ------------------------------------------------------------------ base
  damageBase(amount) {
    if (amount <= 0 || this.state !== 'combat') return;
    amount *= 1 - clamp(this.mods.reduce, 0, 0.8);
    const br = this.base.barrier;
    if (br.hp > 0) {
      const a = Math.min(br.hp, amount);
      br.hp -= a; amount -= a;
      if (br.hp <= 0) { br.t = 0; this.ev('barrierBreak', {}); }
    }
    if (amount > 0) { this.base.hp -= amount; if (amount > 1.5) this.base.flash = 0.12; } // flash on real hits, not continuous DoT
  }
  updateBase(dt) {
    const regen = this.mods.regen + this.patchRegen();
    if (regen > 0 && this.base.hp > 0) this.base.hp = Math.min(this.base.max, this.base.hp + regen * dt);
  }
  patchRegen() {
    for (const h of this.heroes) if (h.id === 'patch') return 1.3 * (1 + h.rb.passive) * levelMult(h.lv) * 0.7;
    return 0;
  }

  // ------------------------------------------------------------------ heroes
  heroRate(h) {
    let m = 1 + this.mods.rate;
    if (h.id === 'vanguard' && this.nearWall) m *= 1 + 0.25 * (1 + h.rb.passive);
    if (this.squadBuff.t > 0) m *= this.squadBuff.mult;
    if (h.buff.rateT > 0) m *= h.buff.rate;
    if (h.deadEyeT > 0) m *= 2;
    return m;
  }
  /** Seconds between shots for a hero: base reload, sped up by buffs/passives and by Quick Reload upgrades (-20% each). */
  reloadTime(h) { return (h.def.base.interval / this.heroRate(h)) * (1 - Math.min(0.6, this.mods.reload)); }
  heroRange(h) { return h.def.base.range * (1 + this.mods.range); }

  /** Skill multiplier shared by all damage from a hero against a particular enemy. */
  skillMult(h, e) {
    let s = 1 + this.mods.dmg + this.bonus.dmg;
    if (h) {
      const p = 1 + h.rb.passive;
      if (h.id === 'rook' && e.armor > 0) s *= 1 + 0.4 * p;
      if (h.id === 'pulse' && (e.shield > 0 || e.aura > 0)) s *= 1 + 0.5 * p;
      if (h.id === 'specter' && (e.boss || e === this.maxHpEnemy)) s *= 1 + 0.5 * p;
      if (h.id === 'ember' && false) s *= 1;
    }
    if (this.mods.focus > 0 && e.focusN > 0) s *= 1 + 0.03 * this.mods.focus * e.focusN;
    if (e.burnT > 0 && this.hasEmber) s *= 1 + 0.15 * (1 + this.emberPassive);
    return s;
  }
  get hasEmber() { for (const h of this.heroes) if (h.id === 'ember') return true; return false; }
  get emberPassive() { for (const h of this.heroes) if (h.id === 'ember') return h.rb.passive; return 0; }

  acquire(h, mode) {
    const range = this.heroRange(h);
    const kind = h.def.kind;
    let best = null, bs = -1e9, fb = null, fbs = -1e9;
    const E = this.enemies;
    for (let i = 0; i < E.length; i++) {
      const e = E[i];
      if (e.dead || e.untargetable || e.y < -2) continue;
      const d = dist(h.x, h.y, e.x, e.y);
      if (d - e.r > range) continue;
      let s = e.y - e.id * 1e-4;
      if (h.tgt === e) s += 14; // stability: avoid flip-flopping between near-equal targets
      if (mode === 'toughest') s = e.hp + e.shield;
      else if (kind === 'rocket') {
        let c = 0;
        for (let j = 0; j < E.length; j++) if (!E[j].dead && dist(E[j].x, E[j].y, e.x, e.y) < 60) c++;
        s += c * 14;
      } else if (kind === 'sniper') {
        if (e.boss || e.armor > 0.3 || e.def.behavior === 'support') s += 70;
        if (e === this.maxHpEnemy) s += 40;
      } else if (kind === 'beam') {
        if (e.shield > 0 || e.aura > 0) s += 40;
      }
      const overkill = (kind === 'rocket' || kind === 'sniper' || kind === 'rifle') && e.pend >= e.hp + e.shield;
      if (overkill) { if (s > fbs) { fbs = s; fb = e; } continue; }
      if (s > bs) { bs = s; best = e; }
    }
    return best || fb;
  }

  // ------------------------------------------------------------------ revolver ammo
  updateAmmo(dt) {
    const a = this.ammo;
    for (let j = 0; j < 6; j++) if (a.flash[j] > 0) a.flash[j] -= dt;
    const prev = a.ph;
    a.ph += (6 / a.rev) * dt; // chamber-units; 6 per revolution
    for (let k = Math.floor(prev) + 1; k <= Math.floor(a.ph); k++) {
      const slot = k % 6;
      if (CHAMBER_ORDER.indexOf(slot) >= a.unlocked) continue; // a locked chamber: nothing to cut
      a.flash[slot] = 0.25;
      if (a.pile < a.cap) { a.pile += 1; a.made += 1; this.ev('slice', { slot }); }
    }
    // How long recently was a hero waiting on the revolver? Drives the "feed the squad" upgrade weighting.
    a.starve += ((a.waiting ? 1 : 0) - a.starve) * Math.min(1, dt / 3);
    a.waiting = false;
  }
  /** Heroes pull bullets from the pile. Returns how many they actually got (0 = wait for the slicer). */
  takeAmmo(n) {
    const a = this.ammo;
    const got = Math.min(n, Math.floor(a.pile));
    a.pile -= got; a.taken += got;
    return got;
  }
  addAmmo(n, overflow = false) {
    const a = this.ammo;
    a.pile = overflow ? a.pile + n : Math.min(a.cap, a.pile + n);
  }
  updateHeroes(dt) {
    for (const h of this.heroes) {
      if (h.disabled > 0) { h.beam = null; h.flameOn = false; h.burstT = 0; continue; }
      const kind = h.def.kind;
      if (h.tgt && (h.tgt.dead || h.tgt.untargetable || dist(h.x, h.y, h.tgt.x, h.tgt.y) - h.tgt.r > this.heroRange(h))) h.tgt = null;
      // Reload cooldown counts down to exactly 0 and stays there (bar full) until the hero fires again.
      h.cd = Math.max(0, h.cd - dt);
      h.retryT -= dt; // separate, invisible timer for "nothing to shoot / out of ammo, look again shortly"
      if (kind === 'beam') { this.updateBeam(h, dt); }
      else if (kind === 'flame') { this.updateFlame(h, dt); }
      else if (h.cd <= 0 && h.retryT <= 0) {
        const t = this.acquire(h);
        h.tgt = t;
        if (t) {
          const got = this.takeAmmo(1 + this.mods.proj);
          h.dry = got <= 0;
          if (got <= 0) { h.retryT = 0.05; this.ammo.waiting = true; } // empty pile: wait for the revolver
          else {
            const rl = this.reloadTime(h);
            h.cd += rl; h.cdMax = rl;
            if (h.cd < 0) h.cd = 0;
            this.fire(h, t, got);
            this.ev('pull', { i: h.idx, n: got });
          }
        } else { h.retryT = 0.05; h.dry = false; }
      }
      if (h.id === 'patch') this.updateTriage(h, dt);
    }
  }

  muzzle(h) {
    if (h.def.kind === 'drone') return { x: h.x + Math.sin(h.droneT * 1.7) * 24, y: h.y - 44 + Math.sin(h.droneT * 3) * 4 };
    return { x: h.x, y: h.y - 22 };
  }

  fire(h, t, n = 1) {
    const base = h.def.base;
    const m = this.muzzle(h);
    const speed = base.speed * (1 + this.mods.speed);
    const tt = Math.max(0.02, dist(m.x, m.y, t.x, t.y) / speed);
    const px = t.x + t.vx * tt, py = t.y + t.vy * tt;
    const a0 = Math.atan2(py - m.y, px - m.x);
    const crit = h.deadEyeT > 0 || this.rng.chance(base.crit + this.mods.crit);
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * 0.13;
      const a = a0 + off + this.rng.range(-base.spread, base.spread);
      const b = this.bullets.spawn();
      b.x = m.x; b.y = m.y; b.vx = Math.cos(a) * speed; b.vy = Math.sin(a) * speed;
      b.src = h; b.kind = h.def.kind; b.r = h.def.kind === 'rocket' ? 5 : h.def.kind === 'sniper' ? 3.5 : 3;
      b.attack = h.atk * (i === 0 ? 1 : 0.75);
      b.crit = i === 0 ? crit : this.rng.chance(base.crit + this.mods.crit);
      b.critMult = base.critMult + this.mods.critMult;
      b.pierce = base.pierce + this.mods.pierce + h.rb.pierce;
      b.splashR = (base.splash > 0 ? base.splash : 0) + this.mods.splashR;
      b.splashFrac = base.splash > 0 ? 0.7 : this.mods.splashFrac;
      b.armorPierce = this.mods.armorPierce;
      b.skillBoost = h.deadEyeT > 0 ? 1.0 : 1;
      b.life = (h.def.range ?? this.heroRange(h) + 120) / speed + 0.6;
      b.homing = this.mods.homing;
      b.tgt = t; b.est = b.attack * (b.crit ? b.critMult : 1) * this.skillMult(h, t) * resistMult(t, b.armorPierce);
      t.pend += b.est;
      b.hit.length = 0;
      b.el = h.def.kind === 'rocket' ? 'blast' : 'phys';
      b.turret = false;
      b.dead = false;
    }
    h.recoil = 1;
    h.shots++;
    this.ev('shoot', { i: h.idx, x: m.x, y: m.y, kind: h.def.kind, crit });
  }

  releaseBullet(b) {
    if (b.tgt) { b.tgt.pend = Math.max(0, b.tgt.pend - b.est); b.tgt = null; }
  }

  // Pulse: instant beam that hits everything along a line (GDD 5, "strong against aligned targets").
  /**
   * Beam and flame heroes fire in bursts: a shot pulls one bullet, then the weapon ticks every 0.1s for `burst`
   * seconds, then reloads - the same reload cycle (and progress bar) as every other hero.
   * Returns true when a burst has just begun.
   */
  startBurst(h) {
    if (h.cd > 0 || h.retryT > 0) return false;
    const t = this.acquire(h);
    h.tgt = t;
    if (!t) { h.retryT = 0.05; h.dry = false; return false; }
    if (this.takeAmmo(1) <= 0) { h.retryT = 0.05; h.dry = true; this.ammo.waiting = true; return false; }
    h.dry = false;
    const rl = this.reloadTime(h);
    h.cd += rl; h.cdMax = rl;
    if (h.cd < 0) h.cd = 0;
    h.burstT = h.def.base.burst;
    h.tickCd = 0;
    this.ev('pull', { i: h.idx, n: 1 });
    return true;
  }

  // Pulse: instant beam that hits everything along a line (GDD 5, "strong against aligned targets").
  updateBeam(h, dt) {
    const boost = h.beamBoost > 0; // Sustained Beam: continuous and free while it lasts
    if (!boost) {
      if (h.burstT <= 0 && !this.startBurst(h)) { h.beam = null; return; }
      h.burstT -= dt;
    }
    let t = h.tgt;
    if (!t || boost) t = this.acquire(h, boost ? 'toughest' : undefined);
    h.tgt = t;
    if (!t) { h.beam = null; if (!boost) h.burstT = 0; return; }
    const range = this.heroRange(h);
    const m = this.muzzle(h);
    const ang = Math.atan2(t.y - m.y, t.x - m.x);
    const ex = m.x + Math.cos(ang) * range, ey = m.y + Math.sin(ang) * range;
    const width = (boost ? 15 : 7) * (1 + this.mods.proj * 0.25);
    h.beam = { x1: m.x, y1: m.y, x2: ex, y2: ey, w: width, boost };
    h.tickCd -= dt;
    if (h.tickCd > 0) return;
    h.tickCd = TICK;
    const power = 1 + this.mods.abilityPower + h.rb.abilityPower;
    const atk = boost ? h.cont * 3 * power : h.atk;
    const crit = this.rng.chance(h.def.base.crit + this.mods.crit);
    for (const e of this.enemies) {
      if (e.dead || e.untargetable) continue;
      if (pointSegDist2(e.x, e.y, m.x, m.y, ex, ey) > (e.r + width * 0.5) * (e.r + width * 0.5)) continue;
      this.hit(h, e, atk, { crit, critMult: h.def.base.critMult + this.mods.critMult, armorPierce: this.mods.armorPierce, el: 'energy', tick: true, x: e.x, y: e.y });
    }
    this.ev('beamTick', { i: h.idx });
  }

  // Ember: short-range cone of fire that also ignites (GDD 5 roster).
  updateFlame(h, dt) {
    if (h.burstT <= 0 && !this.startBurst(h)) { h.flameOn = false; return; }
    h.burstT -= dt;
    const t = this.acquire(h) || null;
    h.tgt = t;
    if (!t) { h.flameOn = false; h.burstT = 0; return; }
    h.flameOn = true;
    const range = this.heroRange(h);
    const m = this.muzzle(h);
    h.flameAng = Math.atan2(t.y - m.y, t.x - m.x);
    h.flameRange = range;
    h.tickCd -= dt;
    if (h.tickCd > 0) return;
    h.tickCd = TICK;
    const crit = this.rng.chance(h.def.base.crit + this.mods.crit);
    const half = 0.42 + this.mods.proj * 0.1;
    for (const e of this.enemies) {
      if (e.dead || e.untargetable) continue;
      const dx = e.x - m.x, dy = e.y - m.y;
      const d = Math.hypot(dx, dy);
      if (d - e.r > range) continue;
      let da = Math.atan2(dy, dx) - h.flameAng;
      da = Math.atan2(Math.sin(da), Math.cos(da));
      if (Math.abs(da) > half + Math.atan2(e.r, Math.max(d, 1))) continue;
      this.hit(h, e, h.atk, { crit, critMult: h.def.base.critMult + this.mods.critMult, armorPierce: this.mods.armorPierce, el: 'fire', tick: true, x: e.x, y: e.y, burn: h.cont * 1.6 });
    }
  }

  updateTriage(h, dt) {
    h.interceptCd -= dt;
    if (h.interceptCd > 0 || h.disabled > 0) return;
    let best = null, bd = 260 * 260;
    for (const b of this.ebullets.items) {
      if (b.dead || b.kind === 'bomb') continue;
      const d = (b.x - h.x) ** 2 + (b.y - h.y) ** 2;
      if (d < bd) { bd = d; best = b; }
    }
    if (best) {
      best.dead = true;
      h.interceptCd = 4 / (1 + h.rb.passive);
      this.ev('intercept', { x: best.x, y: best.y, from: h.idx });
    }
  }

  // ------------------------------------------------------------------ turrets
  updateTurrets(dt) {
    if (!this.turrets.length) return;
    let avgLv = 0;
    for (const h of this.heroes) avgLv += h.lv;
    avgLv /= this.heroes.length;
    for (const tu of this.turrets) {
      tu.cd -= dt;
      if (tu.recoil > 0) tu.recoil -= dt * 8;
      if (tu.cd > 0) continue;
      let best = null, bs = -1e9;
      for (const e of this.enemies) {
        if (e.dead || e.untargetable || e.y < 0) continue;
        if (dist(tu.x, tu.y, e.x, e.y) - e.r > 360) continue;
        const s = e.y - (e.pend >= e.hp + e.shield ? 500 : 0);
        if (s > bs) { bs = s; best = e; }
      }
      if (!best) { tu.cd = 0.1; continue; }
      tu.cd = 0.45 / (1 + this.mods.turretRate);
      const speed = 520;
      const a = Math.atan2(best.y + best.vy * 0.3 - tu.y, best.x - tu.x);
      const b = this.bullets.spawn();
      b.x = tu.x; b.y = tu.y - 8; b.vx = Math.cos(a) * speed; b.vy = Math.sin(a) * speed;
      b.src = null; b.kind = 'turret'; b.r = 3;
      b.attack = 15 * levelMult(avgLv) * (1 + this.mods.turretDmg);
      b.crit = false; b.critMult = 1.8; b.pierce = this.mods.pierce; b.splashR = this.mods.splashR; b.splashFrac = this.mods.splashFrac;
      b.armorPierce = this.mods.armorPierce; b.skillBoost = 1; b.life = 1.4; b.homing = this.mods.homing;
      b.tgt = best; b.est = b.attack; best.pend += b.est; b.hit.length = 0; b.el = 'phys'; b.turret = true; b.dead = false;
      tu.recoil = 1;
      this.ev('turretShot', { x: tu.x, y: tu.y - 8 });
    }
  }

  // ------------------------------------------------------------------ bullets
  updateBullets(dt) {
    const E = this.enemies;
    for (const b of this.bullets.items) {
      if (b.dead) continue;
      if (b.homing && b.tgt && !b.tgt.dead) {
        const sp = Math.hypot(b.vx, b.vy);
        const want = Math.atan2(b.tgt.y - b.y, b.tgt.x - b.x);
        let cur = Math.atan2(b.vy, b.vx);
        let da = Math.atan2(Math.sin(want - cur), Math.cos(want - cur));
        da = clamp(da, -2.2 * b.homing * dt, 2.2 * b.homing * dt);
        cur += da;
        b.vx = Math.cos(cur) * sp; b.vy = Math.sin(cur) * sp;
      }
      const px = b.x, py = b.y;
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.x < -30 || b.x > W + 30 || b.y < -60 || b.y > this.H + 30) {
        if (b.kind === 'rocket' && b.y > 0) this.explodeBullet(b, b.x, b.y, null);
        b.dead = true;
        continue;
      }
      for (let i = 0; i < E.length; i++) {
        const e = E[i];
        if (e.dead || e.y < -4) continue;
        if (b.hit.indexOf(e.id) !== -1) continue;
        const rr = e.r + b.r;
        if (pointSegDist2(e.x, e.y, px, py, b.x, b.y) > rr * rr) continue;
        b.hit.push(e.id);
        this.bulletHit(b, e);
        if (b.kind === 'rocket' || b.pierce < 0 || (b.pierce-- <= 0)) { b.dead = true; break; }
      }
    }
  }

  bulletHit(b, e) {
    const h = b.src;
    const opts = { crit: b.crit, critMult: b.critMult, armorPierce: b.armorPierce, el: b.el, x: b.x, y: b.y };
    const dealt = this.hit(h, e, b.attack * (b.skillBoost || 1), opts);
    if (this.mods.burn > 0 && !e.dead) this.ignite(e, dealt * 0.4 * this.mods.burn * 2);
    if (this.mods.frost > 0 && !e.dead) this.chill(e, 1 - 0.18 * this.mods.frost);
    if (b.splashR > 0 && b.splashFrac > 0) this.explodeBullet(b, b.x, b.y, e);
    else this.ev('impact', { x: b.x, y: b.y, kind: b.kind });
  }

  explodeBullet(b, x, y, direct) {
    this.ev('explosion', { x, y, r: b.splashR || 30, big: b.kind === 'rocket' });
    if (!(b.splashR > 0)) return;
    for (const e of this.enemies) {
      if (e.dead || e === direct) continue;
      if (dist(e.x, e.y, x, y) - e.r > b.splashR) continue;
      this.hit(b.src, e, b.attack * (b.splashFrac || 0.7), { crit: b.crit, critMult: b.critMult, armorPierce: b.armorPierce, el: 'blast', x: e.x, y: e.y, splash: true });
    }
  }

  ignite(e, dps) { if (dps > e.burnDps || e.burnT <= 0) e.burnDps = Math.max(dps, e.burnT > 0 ? e.burnDps : 0); e.burnT = 3; if (e.burnTick <= 0) e.burnTick = 0.5; }
  chill(e, f) { if (f < e.slowF || e.slowT <= 0) e.slowF = Math.min(e.slowF, f); e.slowT = 1.5; }

  /** Full damage pipeline: formula -> shield/health -> status riders -> events. Returns hp+shield removed. */
  hit(h, e, attack, o) {
    const skill = this.skillMult(h, e);
    const dmg = computeDamage({ attack, skill, crit: o.crit, critMult: o.critMult, resist: resistMult(e, o.armorPierce || 0) });
    if (this.mods.focus > 0 && !o.tick && !o.splash) { e.focusN = Math.min(6, e.focusN + 1); e.focusT = 2; }
    if (o.burn) this.ignite(e, o.burn);
    if (o.crit && !o.tick) this.stats.crits++;
    const dealt = this.hurt(e, dmg, { crit: o.crit, el: o.el, x: o.x, y: o.y, tick: o.tick });
    return dealt;
  }

  /** Apply already-computed damage. Handles boss phases, shields, death. */
  hurt(e, dmg, o = {}) {
    if (e.dead || dmg <= 0) return 0;
    if (e.boss) {
      const r = bossDamageHook(this, e, dmg);
      if (r <= 0) { this.ev('immune', { x: e.x, y: e.y }); return 0; }
      dmg = r;
    }
    const { shield, hp } = absorb(e, dmg);
    e.flash = 0.08;
    if (!o.dot) this.ev('hit', { x: o.x ?? e.x, y: o.y ?? e.y, dmg: shield + hp, crit: !!o.crit, el: o.el || 'phys', id: e.id, tick: !!o.tick, shield: shield > 0 && hp === 0 });
    if (e.hp <= 0.0001) this.killEnemy(e);
    return shield + hp;
  }

  killEnemy(e) {
    if (e.dead) return;
    e.dead = true;
    const coins = e.def.coins * (e.boss ? 1 : 1) * (1 + this.mods.coin + this.bonus.coin);
    if (e.boss) { this.stats.bosses++; }
    this.stats.coins += e.boss ? e.boss.def.coins * (1 + this.mods.coin + this.bonus.coin) : coins;
    this.stats.kills++;
    this.ev('kill', { x: e.x, y: e.y, r: e.r, type: e.type, boss: !!e.boss, world: e.world });
    if (e.def.splits && !e.boss && !e.noSplit) {
      for (let k = 0; k < e.def.splits.n; k++) {
        const c = this.spawnEnemy(e.def.splits.into, clamp(e.x + (k ? 14 : -14), 10, W - 10), { y: e.y });
        c.t = 0;
      }
    }
    if (e.boss) killAllMinions(this, e);
  }

  // ------------------------------------------------------------------ zones (Firestorm etc.)
  updateZones(dt) {
    for (let i = this.zones.length - 1; i >= 0; i--) {
      const z = this.zones[i];
      z.t -= dt;
      z.tick -= dt;
      if (z.tick <= 0) {
        z.tick = 0.25;
        for (const e of this.enemies) {
          if (e.dead || e.untargetable) continue;
          if (dist(e.x, e.y, z.x, z.y) - e.r < z.r) {
            this.hit(z.src, e, z.dps * 0.25, { crit: false, critMult: 1, armorPierce: 0, el: 'fire', tick: true, x: e.x, y: e.y, burn: z.dps * 0.5 });
          }
        }
      }
      if (z.t <= 0) this.zones.splice(i, 1);
    }
    for (let i = this.telegraphs.length - 1; i >= 0; i--) {
      this.telegraphs[i].t -= dt;
      if (this.telegraphs[i].t <= 0) this.telegraphs.splice(i, 1);
    }
  }

  updateQueue(dt) {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      const q = this.queue[i];
      q.t -= dt;
      if (q.t <= 0) { this.queue.splice(i, 1); q.fn(); }
    }
  }
  updateFx() {}

  // ------------------------------------------------------------------ player input
  /** Swipe cut (GDD 4.4). Returns how many enemy projectiles were severed. */
  cutSegment(x1, y1, x2, y2) {
    if (this.state !== 'combat' || this.cut.energy <= 0) return 0;
    let n = 0;
    for (const b of this.ebullets.items) {
      if (b.dead || b.cutCd > 0) continue;
      const rr = b.r + 9;
      if (pointSegDist2(b.x, b.y, x1, y1, x2, y2) > rr * rr) continue;
      if (this.cut.energy < 5) break;
      this.cut.energy -= 5;
      b.cutHp--;
      b.cutCd = 0.2;
      this.ev('cut', { x: b.x, y: b.y, big: b.kind === 'bomb' });
      if (b.cutHp <= 0) {
        b.dead = true; n++;
        this.stats.cuts++;
        this.addAmmo(b.kind === 'bomb' ? 2 : 1);
        this.ev('recycle', { x: b.x, y: b.y });
        // Reward the skill: each severed bullet charges abilities slightly.
        for (const h of this.heroes) if (h.ab.cd > 0) h.ab.cd = Math.max(0, h.ab.cd - 0.35);
        if (b.kind === 'bomb') this.ev('explosion', { x: b.x, y: b.y, r: 36, big: false });
      }
    }
    return n;
  }

  useAbility(i) {
    const h = this.hero(i);
    if (!h || this.state !== 'combat' || h.ab.cd > 0 || h.disabled > 0) return false;
    const power = 1 + this.mods.abilityPower + h.rb.abilityPower;
    const dur = h.def.ability.dur * (1 + (power - 1) * 0.5);
    const id = h.id;
    const hasTargets = this.enemies.some((e) => !e.dead && e.y > 0);
    if ((id === 'rook' || id === 'ember') && !hasTargets) return false;
    h.ab.cd = h.ab.max;
    h.ab.active = dur;
    h.ab.activeMax = dur;
    this.stats.abilities++;
    if (id === 'vanguard') {
      this.addAmmo(6); // Overdrive also loads the pile
      h.buff.rate = 1 + 1 * power; h.buff.rateT = dur;
      this.squadBuff.mult = 1 + 0.25 * power; this.squadBuff.t = dur;
    } else if (id === 'rook') {
      const count = 8 + this.mods.abilityTargets;
      for (let k = 0; k < count; k++) this.queue.push({ t: k * 0.09, fn: () => this.salvoRocket(h, power) });
    } else if (id === 'pulse') {
      h.beamBoost = dur;
    } else if (id === 'patch') {
      const hp = Math.max(120, this.base.max * 0.5) * power * (1 + 0.05 * (h.lv - 1));
      this.base.barrier.hp = hp; this.base.barrier.t = dur;
      this.base.hp = Math.min(this.base.max, this.base.hp + this.base.max * 0.15);
    } else if (id === 'specter') {
      h.deadEyeT = dur; h.cd = 0;
    } else if (id === 'ember') {
      this.firestorm(h, power, dur);
    }
    this.ev('ability', { i, id });
    return true;
  }

  salvoRocket(h, power) {
    const live = this.enemies.filter((e) => !e.dead && e.y > 0 && !e.untargetable);
    let tx, ty, tgt = null;
    if (live.length) { tgt = this.rng.pick(live); tx = tgt.x; ty = tgt.y; }
    else { tx = this.rng.range(40, W - 40); ty = this.rng.range(80, this.wallY - 60); }
    const m = { x: h.x + this.rng.range(-8, 8), y: h.y - 22 };
    const speed = 340;
    const a = Math.atan2(ty - m.y, tx - m.x);
    const b = this.bullets.spawn();
    b.x = m.x; b.y = m.y; b.vx = Math.cos(a) * speed; b.vy = Math.sin(a) * speed;
    b.src = h; b.kind = 'rocket'; b.r = 5; b.attack = h.atk * 1.2 * power; b.crit = this.rng.chance(h.def.base.crit + this.mods.crit);
    b.critMult = h.def.base.critMult + this.mods.critMult; b.pierce = 0;
    b.splashR = h.def.base.splash + this.mods.splashR; b.splashFrac = 0.7; b.armorPierce = this.mods.armorPierce; b.skillBoost = 1;
    b.life = dist(m.x, m.y, tx, ty) / speed + 0.05; b.homing = 0; b.tgt = null; b.est = 0; b.hit.length = 0; b.el = 'blast'; b.turret = false; b.dead = false;
    this.ev('shoot', { i: h.idx, x: m.x, y: m.y, kind: 'rocket', crit: false });
  }

  firestorm(h, power, dur) {
    let best = null, bc = -1;
    for (const e of this.enemies) {
      if (e.dead || e.y < 0) continue;
      let c = 0;
      for (const o of this.enemies) if (!o.dead && dist(o.x, o.y, e.x, e.y) < 75) c++;
      c += e.y / 2000;
      if (c > bc) { bc = c; best = e; }
    }
    const x = best ? best.x : W / 2, y = best ? best.y : this.wallY - 140;
    this.zones.push({ x, y, r: 74 + this.mods.abilityTargets * 4, t: dur, tick: 0, dps: h.cont * 15 * power, src: h });
  }

  autoAbilities() {
    if (!this.opts.autoAbility) return;
    for (const h of this.heroes) {
      if (h.ab.cd > 0 || h.disabled > 0) continue;
      const id = h.id;
      if (id === 'patch') { if (this.base.hp / this.base.max > 0.6 && !this.boss) continue; }
      else if (id === 'vanguard' || id === 'specter' || id === 'pulse') { if (this.enemies.length < 3 && !this.boss) continue; }
      else if (this.enemies.length < 4 && !this.boss) continue;
      this.useAbility(h.idx);
    }
  }

  // ------------------------------------------------------------------ results
  result() {
    const win = this.state === 'victory';
    return {
      win, mode: this.survival ? 'survival' : 'campaign', stageId: this.stage ? this.stage.id : null, hard: this.hard,
      baseFrac: clamp(this.base.hp / this.base.max, 0, 1), coinsEarned: this.stats.coins,
      wave: this.survival ? this.waveIdx : win ? this.waveCount : this.waveIdx,
      kills: this.stats.kills, cuts: this.stats.cuts, crits: this.stats.crits, abilities: this.stats.abilities,
      upgrades: this.stats.upgrades, time: this.t, bosses: this.stats.bosses,
    };
  }
}

// Canvas presentation layer. Reads the simulation, never mutates it.
// Particles, damage numbers and screen shake live here (GDD 13.2 presentation layer).

import { W, CHAMBER_ORDER } from '../sim/game.js';
import { WORLDS } from '../data/stages.js';
import { skinColors } from '../data/heroes.js';
import { enemySprite, bossSprite, heroSprite, droneSprite, turretSprite, flashOf, clearSpriteCache, WORLD_PAL } from './sprites.js';
import { makeScenery, skyTop } from './scenery.js';
import { artPose, artBob } from './art.js';
import { clamp, fmt, RNG } from '../util.js';

const EL_COLOR = { phys: '#ffffff', fire: '#ff9a3c', energy: '#7df4ff', frost: '#9bd8ff', blast: '#ffd23f' };
const MAX_PARTS = 520;
const MAX_NUMS = 40;

/** Where the sky meets the ground, in world px: the HUD sits in the sky above it and enemies march out of it. */
export const horizonFor = (H) => Math.round(clamp(H * 0.22, 140, 190));
export { skyTop };
export const TRAY_CSS = 128; // px reserved at the bottom for ability buttons / cut meter
export const STRIP = 66; // world px between the heroes' feet and the tray: the revolver / ammo pile strip
/** Where ammo is drawn, in world coordinates. */
export const REV = { cx: 58, pileX: 218 };
export const stripY = (g) => g.heroY + 70;
/** Centre of chamber `slot` (0 = 12 o'clock, clockwise) on the static revolver. */
export const chamberPos = (g, slot) => { const a = -Math.PI / 2 + (slot * Math.PI) / 3; return { x: REV.cx + Math.cos(a) * 14.5, y: stripY(g) + Math.sin(a) * 14.5 }; };

/** World layout for a given viewport: wall + hero row sit above the bottom tray. */
export function layoutFor(cssW, cssH, safeBottom = 0) {
  const k = cssW / W;
  const H = cssH / k;
  const tray = (TRAY_CSS + safeBottom) / k;
  const heroY = H - tray - 34 - STRIP;
  return { H, wallY: heroY - 56, heroY, k };
}

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.parts = Array.from({ length: MAX_PARTS }, () => ({ a: false }));
    this.nums = Array.from({ length: MAX_NUMS }, () => ({ a: false }));
    this.numByEnemy = new Map();
    this.shake = 0;
    this.flash = 0;
    this.flashColor = '#fff';
    this.t = 0;
    this.fxScale = 1;
    this.slowFrames = 0;
    this.rng = new RNG(99);
    this.settings = { reduceShake: false, reduceFlash: false, highContrast: false, damageNumbers: true };
    this.trail = 'default';
    this.onEvent = null;
    this.sorted = [];
  }

  resize(cssW, cssH, dpr) {
    this.cssW = cssW; this.cssH = cssH; this.dpr = dpr;
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.k = (cssW * dpr) / W;
    clearSpriteCache();
    this.scn = null;
  }

  attach(game, settings, trail) {
    this.game = game;
    this.settings = settings;
    this.trail = trail || 'default';
    for (const p of this.parts) p.a = false;
    for (const n of this.nums) n.a = false;
    this.numByEnemy.clear();
    this.shake = 0; this.flash = 0;
    this.heroCols = game.allHeroes.map((h) => skinColors(h.id, h.skin));
  }

  // ------------------------------------------------------------ particles
  spawn(kind, x, y, vx, vy, life, size, color, extra) {
    if (this.fxScale < 1 && this.rng.next() > this.fxScale && kind !== 'ring') return;
    for (let i = 0; i < MAX_PARTS; i++) {
      const p = this.parts[i];
      if (p.a) continue;
      p.a = true; p.kind = kind; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = life; p.max = life;
      p.size = size; p.color = color; p.g = extra?.g ?? 0; p.grow = extra?.grow ?? 0; p.rot = this.rng.next() * 6;
      return;
    }
  }
  burst(x, y, n, speed, life, size, color, kind = 'spark', g = 0) {
    n = Math.ceil(n * this.fxScale);
    for (let i = 0; i < n; i++) {
      const a = this.rng.next() * 6.283, s = speed * (0.35 + this.rng.next() * 0.65);
      this.spawn(kind, x, y, Math.cos(a) * s, Math.sin(a) * s, life * (0.6 + this.rng.next() * 0.6), size, color, { g });
    }
  }
  number(e, dmg, crit, el, x, y) {
    if (!this.settings.damageNumbers) return;
    const prev = this.numByEnemy.get(e);
    if (prev && prev.a && prev.max - prev.life < 0.3 && !crit) { prev.dmg += dmg; prev.life = Math.max(prev.life, prev.max * 0.8); prev.y = Math.min(prev.y, y - 6); return; }
    for (let i = 0; i < MAX_NUMS; i++) {
      const n = this.nums[i];
      if (n.a) continue;
      n.a = true; n.dmg = dmg; n.crit = crit; n.el = el; n.x = x + this.rng.range(-6, 6); n.y = y - 10; n.life = n.max = crit ? 0.9 : 0.6;
      this.numByEnemy.set(e, n);
      return;
    }
  }

  // ------------------------------------------------------------ events -> effects
  processEvents(g, dt) {
    const evs = g.events;
    const motion = !this.settings.reduceShake;
    for (let i = 0; i < evs.length; i++) {
      const e = evs[i];
      switch (e.type) {
        case 'shoot': {
          const c = this.heroCols[e.i];
          const col = this.trailColor(c, 0);
          this.burst(e.x, e.y - 2, e.kind === 'rocket' ? 5 : 2, 90, 0.18, 1.8, col, 'spark');
          this.spawn('dot', e.x, e.y - 2, 0, -30, 0.08, e.kind === 'rocket' ? 7 : 4, '#fff');
          break;
        }
        case 'slice': { // the hand cut a loaded chamber: the bullet drops down the chute onto the pile
          const ry = stripY(g), c = chamberPos(g, e.slot), life = 0.34;
          this.burst(c.x, c.y, 4, 120, 0.18, 1.6, '#fff6c8');
          const tx = REV.pileX + this.rng.range(-26, 26), ty = ry - 6;
          this.spawn('shell', c.x, c.y, (tx - c.x) / life, (ty - c.y) / life, life, 1, '#e0a93a');
          break;
        }
        case 'pull': {
          const h = g.hero(e.i);
          if (!h) break;
          const ry = stripY(g);
          for (let k = 0; k < Math.min(e.n, 3); k++) {
            const life = 0.2 + k * 0.03;
            const sx = REV.pileX + this.rng.range(-20, 20);
            this.spawn('shell', sx, ry - 10, (h.x - sx) / life, (h.y + 14 - ry + 10) / life, life, 1, '#ffd96a');
          }
          break;
        }
        case 'recycle': {
          const ry = stripY(g), life = 0.55;
          this.spawn('ring', e.x, e.y, 0, 0, 0.25, 3, '#ffd96a', { grow: 34 });
          this.spawn('shell', e.x, e.y, (REV.pileX - e.x) / life, (ry - 8 - e.y) / life, life, 1, '#ffd96a');
          break;
        }
        case 'turretShot': this.spawn('dot', e.x, e.y, 0, -20, 0.07, 3.5, '#ffe27a'); break;
        case 'hit':
          if (!e.tick || this.rng.next() < 0.18) this.burst(e.x, e.y, e.crit ? 7 : 2, e.crit ? 130 : 70, 0.22, e.crit ? 2.6 : 1.7, e.crit ? '#ffe14f' : EL_COLOR[e.el] || '#fff');
          if (!e.tick || e.crit) this.number(e.id, e.dmg, e.crit, e.el, e.x, e.y);
          else this.number(e.id, e.dmg, false, e.el, e.x, e.y);
          break;
        case 'impact': this.burst(e.x, e.y, 3, 60, 0.18, 1.6, '#ffd9a0'); break;
        case 'explosion': {
          const r = e.r;
          this.spawn('ring', e.x, e.y, 0, 0, 0.35, 6, e.enemy ? '#ff6a3a' : '#ffd23f', { grow: r * 3.2 });
          this.burst(e.x, e.y, e.big ? 16 : 7, e.big ? 190 : 110, 0.4, 2.6, e.enemy ? '#ff7a4a' : '#ffb02e');
          this.burst(e.x, e.y, e.big ? 8 : 3, 40, 0.8, 8, 'rgba(70,60,60,.55)', 'smoke');
          this.spawn('dot', e.x, e.y, 0, 0, 0.14, r * 0.9, '#fff3c4');
          if (e.big && motion) this.shake = Math.max(this.shake, e.enemy ? 7 : 3.5);
          break;
        }
        case 'kill': {
          const pal = WORLD_PAL[e.world % 3];
          const col = e.type === 'sentinel' || e.type === 'drone' ? '#9fb4ff' : pal.skin;
          this.burst(e.x, e.y, e.boss ? 40 : 8 + e.r * 0.5, e.boss ? 260 : 130, 0.5, e.boss ? 4 : 2.6, col, 'shard', 140);
          this.burst(e.x, e.y, e.boss ? 14 : 3, 60, 0.7, e.boss ? 14 : 7, 'rgba(60,50,60,.5)', 'smoke');
          this.spawn('ring', e.x, e.y, 0, 0, e.boss ? 0.8 : 0.3, 4, '#fff', { grow: e.boss ? 180 : e.r * 3 });
          if (e.boss) { this.flash = this.settings.reduceFlash ? 0 : 0.7; this.flashColor = '#fff'; if (motion) this.shake = 14; }
          break;
        }
        case 'cut':
          this.burst(e.x, e.y, e.big ? 12 : 7, 150, 0.25, 2.2, '#bff4ff');
          this.spawn('ring', e.x, e.y, 0, 0, 0.22, 3, '#ffffff', { grow: 46 });
          break;
        case 'intercept': this.spawn('ring', e.x, e.y, 0, 0, 0.3, 3, '#7dffc4', { grow: 40 }); this.burst(e.x, e.y, 6, 90, 0.3, 2, '#7dffc4'); break;
        case 'baseHit': this.burst(e.x, this.game.wallY, 6, 90, 0.3, 2, '#ff8a6a'); if (motion) this.shake = Math.max(this.shake, 3); break;
        case 'phase':
          this.flash = this.settings.reduceFlash ? 0 : 0.55; this.flashColor = '#ffffff';
          this.spawn('ring', e.x, e.y, 0, 0, 1, 10, '#ffd23f', { grow: 400 });
          if (motion) this.shake = 10;
          break;
        case 'bossFire': case 'bossBeam': if (motion) this.shake = Math.max(this.shake, 4); break;
        case 'summon': {
          const c = this.heroCols[e.i];
          this.spawn('ring', e.x, e.y + 24, 0, 0, 0.7, 6, c.glow, { grow: 220 });
          this.spawn('ring', e.x, e.y, 0, 0, 0.5, 4, '#ffffff', { grow: 120 });
          this.burst(e.x, e.y, 26, 240, 0.7, 2.8, c.glow);
          this.burst(e.x, e.y + 20, 10, 60, 0.9, 7, 'rgba(255,255,255,.35)', 'smoke');
          if (!this.settings.reduceFlash) { this.flash = 0.35; this.flashColor = c.glow; }
          if (motion) this.shake = Math.max(this.shake, 5);
          break;
        }
        case 'ability': {
          const h = g.hero(e.i);
          if (!h) break;
          this.spawn('ring', h.x, h.y - 10, 0, 0, 0.5, 8, this.heroCols[e.i].glow, { grow: 150 });
          this.burst(h.x, h.y - 10, 12, 140, 0.5, 2.6, this.heroCols[e.i].glow);
          break;
        }
        case 'heroStun': { const h = g.hero(e.i); if (h) this.burst(h.x, h.y - 20, 8, 120, 0.4, 2.4, '#ffe14f'); break; }
        case 'victory': case 'defeat': break;
        default: break;
      }
      if (this.onEvent) this.onEvent(e);
    }
    evs.length = 0;
  }

  trailColor(c, t) {
    if (this.trail === 'rainbow') return `hsl(${(this.t * 220 + t * 90) % 360},95%,62%)`;
    if (this.trail === 'mono') return '#ffffff';
    if (this.trail === 'neon') return '#ff4fd8';
    return c.glow;
  }

  // ------------------------------------------------------------ main draw
  draw(g, dt, paused, blade) {
    const ctx = this.ctx;
    if (!paused) this.t += dt;
    // adaptive effects budget (GDD 17: VFX budgets on weaker devices)
    if (dt > 0.034) this.slowFrames++; else this.slowFrames = Math.max(0, this.slowFrames - 1);
    this.fxScale = this.slowFrames > 40 ? 0.45 : this.slowFrames > 15 ? 0.7 : 1;

    if (!paused) this.processEvents(g, dt); else g.events.length = 0;
    if (!paused) this.updateFx(g, dt);

    const k = this.k;
    const sx = this.shake > 0.1 && !this.settings.reduceShake ? (this.rng.next() - 0.5) * this.shake : 0;
    const sy = this.shake > 0.1 && !this.settings.reduceShake ? (this.rng.next() - 0.5) * this.shake : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const world = g.stage ? g.stage.world : Math.floor(Math.max(0, g.waveIdx) / 10) % 3;
    if (world !== this.worldNow) { this.worldNow = world; if (this.onWorld) this.onWorld(world); }
    this.hy = horizonFor(g.H);
    const key = `${g.H}:${g.wallY}`;
    if (!this.scn || this.scnKey !== key) { this.scnKey = key; this.scn = makeScenery({ pxW: this.canvas.width, pxH: this.canvas.height, k, H: g.H, hy: this.hy, wallY: g.wallY, withWall: false }); }
    // Same living scenery as the title screen; frozen when flashing / motion is reduced, trimmed when the device is struggling.
    this.scn.draw(ctx, world, 1, this.settings.reduceFlash ? 8 : this.t, this.fxScale < 0.7);
    ctx.setTransform(k, 0, 0, k, sx * k, sy * k);

    this.drawZones(ctx, g);
    this.drawTelegraphs(ctx, g);
    this.drawWall(ctx, g);
    this.drawRevolver(ctx, g);
    this.drawTurrets(ctx, g);
    this.drawEnemies(ctx, g);
    this.drawHeroes(ctx, g);
    this.drawBeamHazard(ctx, g);
    this.drawBullets(ctx, g);
    this.drawParticles(ctx);
    this.drawNumbers(ctx);
    if (blade) this.drawBlade(ctx, blade);

    ctx.setTransform(k, 0, 0, k, 0, 0);
    // low-health vignette
    const frac = g.base.hp / g.base.max;
    if (frac < 0.35 && g.state === 'combat') {
      const a = (0.35 - frac) * 1.1 * (this.settings.reduceFlash ? 0.6 : 0.7 + 0.3 * Math.sin(this.t * 6));
      const vg = ctx.createRadialGradient(W / 2, g.H / 2, g.H * 0.25, W / 2, g.H / 2, g.H * 0.75);
      vg.addColorStop(0, 'rgba(255,0,0,0)'); vg.addColorStop(1, `rgba(255,30,30,${a})`);
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, g.H);
    }
    if (this.flash > 0.01) { ctx.globalAlpha = this.flash; ctx.fillStyle = this.flashColor; ctx.fillRect(0, 0, W, g.H); ctx.globalAlpha = 1; }
  }

  updateFx(g, dt) {
    this.shake *= Math.pow(0.0008, dt);
    this.flash = Math.max(0, this.flash - dt * 1.6);
    for (const p of this.parts) {
      if (!p.a) continue;
      p.life -= dt;
      if (p.life <= 0) { p.a = false; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += p.g * dt;
      if (p.kind === 'smoke') { p.vx *= 0.96; p.vy *= 0.96; p.size += dt * 14; }
      else if (p.kind === 'spark' || p.kind === 'shard') { p.vx *= 0.97; }
      if (p.kind === 'ring') p.size += p.grow * dt;
    }
    for (const n of this.nums) {
      if (!n.a) continue;
      n.life -= dt;
      if (n.life <= 0) { n.a = false; continue; }
      n.y -= (n.crit ? 30 : 22) * dt;
    }
    // continuous emitters: flames, burning enemies, rocket smoke
    for (const h of g.heroes) {
      if (h.def.kind === 'flame' && h.flameOn && h.disabled <= 0) {
        const m = g.muzzle(h);
        const n = Math.ceil(3 * this.fxScale);
        for (let i = 0; i < n; i++) {
          const a = h.flameAng + (this.rng.next() - 0.5) * 0.75;
          const s = 150 + this.rng.next() * 150;
          this.spawn('flame', m.x, m.y, Math.cos(a) * s, Math.sin(a) * s, 0.32 + this.rng.next() * 0.18, 5 + this.rng.next() * 3, '#ffb02e');
        }
      }
    }
    for (const e of g.enemies) {
      if (e.burnT > 0 && this.rng.next() < dt * 14) this.spawn('flame', e.x + this.rng.range(-e.r, e.r) * 0.6, e.y - e.r * 0.2, 0, -26, 0.4, 4, '#ff8a2e');
    }
    for (const z of g.zones) {
      if (this.rng.next() < dt * 40) {
        const a = this.rng.next() * 6.28, r = Math.sqrt(this.rng.next()) * z.r;
        this.spawn('flame', z.x + Math.cos(a) * r, z.y + Math.sin(a) * r * 0.8, 0, -50, 0.5, 6, '#ff7a1f');
      }
    }
    for (const b of g.bullets.items) {
      if (b.kind === 'rocket' && !b.dead && this.rng.next() < dt * 40) this.spawn('smoke', b.x - b.vx * 0.012, b.y - b.vy * 0.012, 0, 8, 0.4, 3, 'rgba(210,200,190,.5)');
    }
  }

  // ------------------------------------------------------------ world pieces
  drawWall(ctx, g) {
    const y = g.wallY;
    const frac = clamp(g.base.hp / g.base.max, 0, 1);
    const col = frac > 0.6 ? '#7fd1a0' : frac > 0.3 ? '#ffd23f' : '#ff5a4a';
    const flash = g.base.flash > 0;
    // blocks
    for (let i = 0; i < 12; i++) {
      const x = i * 30;
      ctx.fillStyle = flash ? '#ffffff' : i % 2 ? '#5a6078' : '#686f8a';
      ctx.fillRect(x + 1, y - 14, 28, 22);
      ctx.fillStyle = flash ? '#fff' : 'rgba(255,255,255,.18)';
      ctx.fillRect(x + 1, y - 14, 28, 4);
      ctx.fillStyle = 'rgba(0,0,0,.25)';
      ctx.fillRect(x + 1, y + 4, 28, 4);
      if (frac < 0.65 && (i * 7) % 5 < Math.floor((0.65 - frac) * 8)) {
        ctx.strokeStyle = 'rgba(10,10,20,.8)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.moveTo(x + 8, y - 12); ctx.lineTo(x + 14, y - 3); ctx.lineTo(x + 10, y + 6); ctx.stroke();
      }
    }
    ctx.fillStyle = '#ffd23f';
    for (let i = 0; i < 24; i++) if (i % 2 === 0) ctx.fillRect(i * 15, y + 6, 8, 3);
    ctx.fillStyle = col; ctx.globalAlpha = 0.9;
    ctx.fillRect(0, y - 17, W * frac, 3);
    ctx.globalAlpha = 1;
    const br = g.base.barrier;
    if (br.hp > 0) {
      const a = 0.25 + 0.35 * clamp(br.hp / (g.base.max * 0.5), 0, 1);
      const gr = ctx.createLinearGradient(0, y - 90, 0, y - 14);
      gr.addColorStop(0, 'rgba(125,255,196,0)'); gr.addColorStop(1, `rgba(125,255,196,${a})`);
      ctx.fillStyle = gr; ctx.fillRect(0, y - 90, W, 76);
      ctx.strokeStyle = `rgba(190,255,230,${0.5 + 0.3 * Math.sin(this.t * 8)})`; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, y - 52); for (let x = 0; x <= W; x += 20) ctx.lineTo(x, y - 52 + Math.sin(x * 0.05 + this.t * 3) * 3); ctx.stroke();
    }
  }

  /**
   * The revolver is static. A clock-hand "slicer" sweeps around it; every loaded chamber it passes gets cut and the
   * bullet drops onto the pile that heroes draw from. Locked chambers (not yet unlocked by upgrades) are crossed out.
   */
  drawRevolver(ctx, g) {
    const a = g.ammo, ry = stripY(g), cx = REV.cx, px = REV.pileX;
    // backing tray
    ctx.fillStyle = 'rgba(4,7,18,.55)';
    ctx.beginPath(); ctx.roundRect(8, ry - 28, W - 16, 56, 14); ctx.fill();
    ctx.strokeStyle = 'rgba(120,150,230,.35)'; ctx.lineWidth = 1.5; ctx.stroke();
    // chute from the cylinder to the pile
    ctx.fillStyle = '#4a5370'; ctx.strokeStyle = '#10131f'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx + 26, ry + 4); ctx.lineTo(px - 52, ry + 20); ctx.lineTo(px - 52, ry + 25); ctx.lineTo(cx + 26, ry + 10); ctx.closePath(); ctx.fill(); ctx.stroke();

    // --- static cylinder with 6 chambers and clock ticks
    ctx.save(); ctx.translate(cx, ry);
    const body = ctx.createRadialGradient(-6, -6, 3, 0, 0, 25);
    body.addColorStop(0, '#9aa6c4'); body.addColorStop(1, '#4a5370');
    ctx.fillStyle = body; ctx.strokeStyle = '#10131f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 24, 0, 7); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = 'rgba(10,14,30,.55)'; ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) { const t = (i * Math.PI) / 6; ctx.beginPath(); ctx.moveTo(Math.cos(t) * 21.5, Math.sin(t) * 21.5); ctx.lineTo(Math.cos(t) * 23.5, Math.sin(t) * 23.5); ctx.stroke(); }
    for (let slot = 0; slot < 6; slot++) {
      const ang = -Math.PI / 2 + (slot * Math.PI) / 3;
      const x = Math.cos(ang) * 14.5, y = Math.sin(ang) * 14.5;
      const live = CHAMBER_ORDER.indexOf(slot) < a.unlocked;
      const fl = a.flash[slot] > 0 ? a.flash[slot] / 0.25 : 0;
      ctx.fillStyle = '#151a2c'; ctx.strokeStyle = live ? '#d8b14a' : '#10131f'; ctx.lineWidth = live ? 1.5 : 1;
      ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.fill(); ctx.stroke();
      if (live) {
        ctx.fillStyle = fl > 0 ? '#fff6c8' : '#e0a93a'; ctx.beginPath(); ctx.arc(x, y, 4.2 + fl * 1.2, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff2b0'; ctx.beginPath(); ctx.arc(x - 1.2, y - 1.2, 1.4, 0, 7); ctx.fill();
        if (fl > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = `rgba(255,230,140,${fl * 0.7})`; ctx.beginPath(); ctx.arc(x, y, 9, 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
      } else { ctx.strokeStyle = 'rgba(90,100,140,.8)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 2, y - 2); ctx.lineTo(x + 2, y + 2); ctx.moveTo(x + 2, y - 2); ctx.lineTo(x - 2, y + 2); ctx.stroke(); }
    }

    // --- the slicer: a clock hand on top of the revolver (fading sweep trail behind it)
    const ha = -Math.PI / 2 + ((a.ph % 6) / 6) * Math.PI * 2;
    const trail = ctx.createConicGradient ? ctx.createConicGradient(ha - 1.1, 0, 0) : null;
    if (trail) {
      trail.addColorStop(0, 'rgba(255,240,170,0)'); trail.addColorStop(1 / (Math.PI * 2) * 1.1, 'rgba(255,240,170,.38)'); trail.addColorStop(1 / (Math.PI * 2) * 1.1 + 0.001, 'rgba(255,240,170,0)'); trail.addColorStop(1, 'rgba(255,240,170,0)');
      ctx.fillStyle = trail; ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, 25, ha - 1.1, ha); ctx.closePath(); ctx.fill();
    }
    ctx.rotate(ha);
    ctx.fillStyle = '#e9eef9'; ctx.strokeStyle = '#10131f'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-8, -1.8); ctx.lineTo(26, -0.8); ctx.lineTo(32, 0); ctx.lineTo(26, 0.8); ctx.lineTo(-8, 1.8); ctx.closePath(); ctx.fill(); ctx.stroke(); // blade
    ctx.fillStyle = '#ff4a4a'; ctx.beginPath(); ctx.moveTo(24, -1); ctx.lineTo(32, 0); ctx.lineTo(24, 1); ctx.closePath(); ctx.fill(); // red tip
    ctx.fillStyle = '#4a5370'; ctx.beginPath(); ctx.arc(-9, 0, 3, 0, 7); ctx.fill(); ctx.stroke(); // counterweight
    ctx.restore();
    ctx.save(); ctx.translate(cx, ry);
    ctx.fillStyle = '#2b3350'; ctx.strokeStyle = '#10131f'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(0, 0, 4.2, 0, 7); ctx.fill(); ctx.stroke(); // pivot cap
    ctx.restore();

    // --- the pile: a heap of brass shells (one per bullet, up to what fits), plus the count
    const count = Math.floor(a.pile), shown = Math.min(count, 36);
    let idx = 0;
    for (let row = 0, per = 12; idx < shown && per > 0; row++, per--) {
      for (let c = 0; c < per && idx < shown; c++, idx++) {
        const x = px - ((per - 1) * 6) / 2 + c * 6 + ((idx * 7) % 3) * 0.4;
        const y = ry + 21 - row * 7;
        ctx.fillStyle = '#e0a93a'; ctx.strokeStyle = '#3a2a08'; ctx.lineWidth = 0.9;
        ctx.beginPath(); ctx.roundRect(x - 2.2, y - 6, 4.4, 8, 1.6); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#b87c22'; ctx.fillRect(x - 2.2, y - 0.5, 4.4, 2);
        ctx.fillStyle = '#fff2b0'; ctx.fillRect(x - 1.2, y - 5, 1, 4);
      }
    }
    const starving = a.starve > 0.4 && count < 2;
    ctx.textAlign = 'left'; ctx.font = '900 12px system-ui, sans-serif';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(8,10,22,.9)';
    const label = starving ? 'EMPTY' : `${count}/${a.cap}`;
    ctx.globalAlpha = starving && !this.settings.reduceFlash ? 0.65 + 0.35 * Math.sin(this.t * 12) : 1;
    ctx.strokeText(label, px + 46, ry + 4); ctx.fillStyle = starving ? '#ff7a6a' : '#ffe9a0'; ctx.fillText(label, px + 46, ry + 4);
    ctx.globalAlpha = 1;
    ctx.font = '800 9px system-ui, sans-serif'; ctx.fillStyle = 'rgba(190,205,255,.75)';
    ctx.fillText(`${a.unlocked}/6 LOADED`, px + 46, ry + 17);
    ctx.textAlign = 'center';
  }

  drawTurrets(ctx, g) {
    for (const t of g.turrets) {
      const s = turretSprite(this.k);
      ctx.drawImage(s, t.x - s.lw / 2, t.y - s.lh / 2 + t.recoil * 2, s.lw, s.lh);
    }
  }

  drawEnemies(ctx, g) {
    const arr = this.sorted; arr.length = 0;
    for (const e of g.enemies) if (!e.dead) arr.push(e);
    arr.sort((a, b) => a.y - b.y);
    const k = this.k;
    const hc = this.settings.highContrast;
    const hy = this.hy || 150;
    for (const e of arr) {
      // enemies come out of the horizon haze instead of dropping out of the sky
      const ey = g.engageY > -1e8 ? g.engageY : hy - 6; // fully there just past the HUD bars
      const fade = e.boss ? 1 : clamp((e.y - (ey - 30)) / 40, 0, 1);
      if (fade <= 0.02) continue;
      ctx.globalAlpha = fade;
      const walker = e.def.behavior === 'melee' || e.def.behavior === 'ranged';
      const frame = Math.floor((e.t * (e.def.fly ? 10 : 4 * Math.max(0.6, e.speed / 28))) % 2);
      let s;
      if (e.boss) s = bossSprite(e.boss.def.id, e.boss.exposed > 0, e.r, k);
      else s = enemySprite(e.type, e.world, e.atWall ? 0 : frame, e.r, k);
      const bob = e.boss ? Math.sin(e.t * 2) * 2 : e.def.fly ? Math.sin(e.t * 3) * 3 : walker && !e.atWall ? Math.abs(Math.sin(e.t * 7)) * -2 : 0;
      const atk = e.atWall ? Math.sin(e.t * 14) * 1.8 : 0;
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,.28)';
      ctx.beginPath(); ctx.ellipse(e.x, e.y + e.r * 0.9 + (e.def.fly ? 14 : 0), e.r * 0.95, e.r * 0.35, 0, 0, 7); ctx.fill();
      // aura ring for sentinel
      if (e.def.aura) {
        ctx.strokeStyle = `rgba(160,190,255,${0.25 + 0.15 * Math.sin(this.t * 3)})`; ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.arc(e.x, e.y, e.def.aura.r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(160,190,255,.06)'; ctx.fill();
      }
      const dy = e.y + bob + atk;
      if (e.boss && e.boss.invuln > 0) ctx.globalAlpha = fade * (0.55 + 0.25 * Math.sin(this.t * 20));
      ctx.drawImage(s, e.x - s.lw / 2, dy - s.lh / 2, s.lw, s.lh);
      ctx.globalAlpha = fade;
      if (e.flash > 0) { const f = flashOf(s); ctx.globalAlpha = 0.75 * fade; ctx.drawImage(f, e.x - s.lw / 2, dy - s.lh / 2, s.lw, s.lh); ctx.globalAlpha = fade; }
      // aura-protected marker (damage reduction), shown with a shape not just colour
      if (e.aura > 0 && !e.def.aura) {
        ctx.strokeStyle = 'rgba(170,200,255,.9)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(e.x, dy, e.r + 3, 0, 7); ctx.setLineDash([3, 3]); ctx.stroke(); ctx.setLineDash([]);
      }
      if (e.shield > 0) {
        ctx.strokeStyle = `rgba(90,230,255,${0.35 + 0.5 * (e.shield / (e.shieldMax || 1))})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(e.x, dy, e.r + 4, 0, 7); ctx.stroke();
        ctx.fillStyle = 'rgba(90,230,255,.1)'; ctx.fill();
      }
      if (e.slowT > 0) { ctx.strokeStyle = '#9bd8ff'; ctx.lineWidth = 1.4; this.snow(ctx, e.x + e.r * 0.8, dy - e.r * 0.9, 4); }
      // health bar
      if ((e.hp < e.max || e.boss) && !e.boss) {
        const w = Math.max(16, e.r * 1.9), x = e.x - w / 2, y = dy - e.r - 9;
        ctx.fillStyle = 'rgba(0,0,0,.75)'; ctx.fillRect(x - 1, y - 1, w + 2, 5);
        const f = e.hp / e.max;
        ctx.fillStyle = hc ? '#fff' : f > 0.5 ? '#6be07a' : f > 0.25 ? '#ffd23f' : '#ff5a4a';
        ctx.fillRect(x, y, w * f, 3);
        if (e.shieldMax > 0 && e.shield > 0) { ctx.fillStyle = '#5ae6ff'; ctx.fillRect(x, y - 2.5, w * (e.shield / e.shieldMax), 1.8); }
      }
    }
    ctx.globalAlpha = 1;
  }

  snow(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 3; i++) { const a = (i * Math.PI) / 3; ctx.moveTo(x - Math.cos(a) * r, y - Math.sin(a) * r); ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r); }
    ctx.stroke();
  }

  drawHeroes(ctx, g) {
    const k = this.k;
    for (const h of g.heroes) {
      // sprite-sheet heroes have a firing frame and an ability frame; procedural ones ignore the name
      // h.recoil is 1 at the shot and falls by 8 per second, so the time since the shot is (1 - recoil) / 8
      const pose = artPose(h.id, h.skin, { ability: h.ab.active > 0, sinceShot: h.recoil > 0 ? (1 - h.recoil) / 8 : Infinity, time: this.t });
      const s = heroSprite(h.id, h.skin, k, pose);
      const ab = artBob(h.id, h.skin);
      const bob = ab ? Math.sin((this.t / ab.bobSec) * 6.2832 + h.idx) * (ab.bobY / 2) : Math.sin(this.t * 2.2 + h.idx) * 1.2;
      const rc = Math.max(0, h.recoil) * 3;
      const dis = h.disabled > 0;
      ctx.fillStyle = 'rgba(0,0,0,.3)';
      ctx.beginPath(); ctx.ellipse(h.x, h.y + 28, 18, 6, 0, 0, 7); ctx.fill();
      const c = this.heroCols[h.idx];
      if (h.ab.cd <= 0 && !dis) { // ability ready ring
        ctx.strokeStyle = c.glow; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(this.t * 5); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(h.x, h.y + 28, 22, 8, 0, 0, 7); ctx.stroke(); ctx.globalAlpha = 1;
      }
      if (h.ab.active > 0) {
        ctx.globalCompositeOperation = 'lighter';
        const gl = ctx.createRadialGradient(h.x, h.y, 4, h.x, h.y, 42);
        gl.addColorStop(0, c.glow + 'aa'); gl.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gl; ctx.beginPath(); ctx.arc(h.x, h.y, 42, 0, 7); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      }
      // Summoned heroes materialise inside a column of light.
      const arriving = h.spawnT > 0 ? h.spawnT / 0.8 : 0;
      if (arriving > 0) {
        ctx.globalCompositeOperation = 'lighter';
        const col = ctx.createLinearGradient(0, h.y - 260, 0, h.y + 30);
        col.addColorStop(0, 'rgba(255,255,255,0)'); col.addColorStop(1, c.glow);
        ctx.globalAlpha = 0.75 * arriving; ctx.fillStyle = col;
        ctx.fillRect(h.x - 18 * (1.2 - arriving * 0.6), h.y - 260, 36 * (1.2 - arriving * 0.6), 290);
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
      if (dis) ctx.globalAlpha = 0.6;
      if (arriving > 0) ctx.globalAlpha = Math.min(ctx.globalAlpha, 1 - arriving * 0.8);
      ctx.drawImage(s, h.x - s.lw / 2, h.y - 6 + bob + rc - arriving * 30 - s.lh / 2 + 4, s.lw, s.lh);
      ctx.globalAlpha = 1;
      if (dis) {
        for (let i = 0; i < 3; i++) {
          const a = this.t * 5 + (i * 6.28) / 3;
          ctx.fillStyle = '#ffe14f';
          this.star(ctx, h.x + Math.cos(a) * 14, h.y - 38 + Math.sin(a) * 4, 3.2);
        }
      }
      if (h.spawnT <= 0) this.drawReloadBar(ctx, h, c);
      if (h.dry && !dis) { // waiting on the revolver
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(this.t * 10);
        ctx.fillStyle = '#ff5a4a'; ctx.beginPath(); ctx.roundRect(h.x - 4, h.y - 52, 8, 14, 3); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.fillRect(h.x - 1, h.y - 49, 2, 5); ctx.fillRect(h.x - 1, h.y - 42, 2, 2);
        ctx.globalAlpha = 1;
      }
      if (h.def.kind === 'drone') {
        const m = g.muzzle(h);
        const d = droneSprite(h.skin, k);
        ctx.fillStyle = 'rgba(0,0,0,.22)'; ctx.beginPath(); ctx.ellipse(m.x, m.y + 32, 8, 3, 0, 0, 7); ctx.fill();
        ctx.drawImage(d, m.x - d.lw / 2, m.y - d.lh / 2 + h.recoil * 2, d.lw, d.lh);
      }
      if (h.beam && !dis) this.drawBeam(ctx, h, c);
      if (h.deadEyeT > 0) { ctx.strokeStyle = 'rgba(255,60,60,.7)'; ctx.lineWidth = 1; if (h.tgt) { ctx.setLineDash([4, 5]); ctx.beginPath(); const m = g.muzzle(h); ctx.moveTo(m.x, m.y); ctx.lineTo(h.tgt.x, h.tgt.y); ctx.stroke(); ctx.setLineDash([]); } }
    }
  }

  /** Progress bar under a hero: fills as the weapon reloads; glows when the next shot is ready; red when out of ammo. */
  drawReloadBar(ctx, h, c) {
    const bw = 46, bx = h.x - bw / 2, by = h.y + 32;
    const ready = h.cd <= 0;
    const p = h.dry || ready ? 1 : Math.max(0, Math.min(1, 1 - h.cd / (h.cdMax || 1)));
    ctx.fillStyle = 'rgba(4,7,18,.85)';
    ctx.beginPath(); ctx.roundRect(bx - 1.5, by - 1.5, bw + 3, 7, 3.5); ctx.fill();
    ctx.fillStyle = h.dry ? '#ff5a4a' : ready ? '#ffffff' : c.glow;
    if (h.dry && !this.settings.reduceFlash) ctx.globalAlpha = 0.5 + 0.5 * Math.sin(this.t * 10);
    ctx.beginPath(); ctx.roundRect(bx, by, Math.max(3, bw * p), 4, 2); ctx.fill();
    ctx.globalAlpha = 1;
    if (ready && !h.dry) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = c.glow + '66'; ctx.beginPath(); ctx.roundRect(bx - 2, by - 2, bw + 4, 8, 4); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; }
  }

  star(ctx, x, y, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) { const a = (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
  }

  drawBeam(ctx, h, c) {
    const b = h.beam;
    const w = b.w;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.strokeStyle = c.glow; ctx.globalAlpha = 0.28; ctx.lineWidth = w * 2.4;
    ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
    ctx.globalAlpha = 0.7; ctx.lineWidth = w * 1.1;
    ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
    ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = w * 0.4 * (0.85 + 0.15 * Math.sin(this.t * 40));
    ctx.beginPath(); ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
  }

  drawBullets(ctx, g) {
    ctx.lineCap = 'round';
    const hc = this.settings.highContrast;
    // Bullet upgrades change how the bullets look, so a build is visible on screen:
    // Heavy Rounds = fatter, Hypervelocity = longer streaks, Cryo = icy, Explosive = fiery head, Armor-Piercing = gold needle core.
    const ow = g.owned;
    const heavy = ow.heavy_rounds || 0, fast = ow.hypervelocity || 0, cryo = ow.cryo_rounds || 0, boom = ow.explosive_rounds || 0, pierce = ow.armor_piercing || 0;
    const wide = 3 + heavy * 0.6, streak = 1 + fast * 0.3;
    for (const b of g.bullets.items) {
      if (b.dead) continue;
      const c = b.src ? this.heroCols[b.src.idx] : { glow: '#ffd23f' };
      const col = cryo && b.kind !== 'rocket' ? '#a8e0ff' : this.trailColor(c, b.x * 0.01);
      if (b.kind === 'rocket') {
        const a = Math.atan2(b.vy, b.vx);
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a);
        ctx.fillStyle = '#ffb02e'; ctx.beginPath(); ctx.moveTo(-9, 0); ctx.lineTo(-17 - Math.random() * 4, -3); ctx.lineTo(-17 - Math.random() * 4, 3); ctx.fill();
        ctx.fillStyle = '#e9edf7'; ctx.strokeStyle = OLC; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.roundRect(-9, -3.4, 15, 6.8, 3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ff5a3a'; ctx.beginPath(); ctx.moveTo(6, -3.4); ctx.lineTo(11, 0); ctx.lineTo(6, 3.4); ctx.fill();
        ctx.restore();
      } else if (b.kind === 'sniper') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = col; ctx.globalAlpha = 0.5; ctx.lineWidth = 5 + heavy * 0.8;
        ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.05 * streak, b.y - b.vy * 0.05 * streak); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.globalAlpha = 1; ctx.strokeStyle = pierce ? '#ffe27a' : '#fff'; ctx.lineWidth = 2 + heavy * 0.3;
        ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.04 * streak, b.y - b.vy * 0.04 * streak); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.globalCompositeOperation = 'source-over';
      } else if (b.kind === 'drone') {
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(b.x, b.y, 3.4, 0, 7); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, 1.5, 0, 7); ctx.fill();
      } else {
        ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = col; ctx.globalAlpha = 0.9; ctx.lineWidth = wide;
        ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.032 * streak, b.y - b.vy * 0.032 * streak); ctx.lineTo(b.x, b.y); ctx.stroke();
        ctx.globalAlpha = 1; ctx.strokeStyle = pierce ? '#ffe27a' : '#fff'; ctx.lineWidth = 1.2 + heavy * 0.25;
        ctx.beginPath(); ctx.moveTo(b.x - b.vx * 0.016 * (1 + pierce * 0.8) * streak, b.y - b.vy * 0.016 * (1 + pierce * 0.8) * streak); ctx.lineTo(b.x, b.y); ctx.stroke();
        if (boom) { ctx.globalAlpha = 0.55; ctx.fillStyle = '#ff8a3a'; ctx.beginPath(); ctx.arc(b.x, b.y, 3.5 + boom * 1.6, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
        ctx.globalCompositeOperation = 'source-over';
      }
    }
    // Enemy projectiles: dark outline + hot core + a notched ring so they read as "cuttable" without colour.
    for (const b of g.ebullets.items) {
      if (b.dead) continue;
      const pulse = 1 + 0.12 * Math.sin(this.t * 14 + b.x);
      if (b.kind === 'bomb') {
        ctx.fillStyle = 'rgba(255,40,40,.25)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 2.2 * pulse, 0, 7); ctx.fill();
        ctx.fillStyle = '#2a1230'; ctx.strokeStyle = hc ? '#fff' : '#ff4a6a'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ff4a6a'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 0.45 * pulse, 0, 7); ctx.fill();
        for (let i = 0; i < b.cutHp; i++) { ctx.fillStyle = '#fff'; ctx.fillRect(b.x - 6 + i * 5, b.y - b.r - 7, 3.4, 3.4); }
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(b.x - 5, b.y - 5); ctx.lineTo(b.x + 5, b.y + 5); ctx.moveTo(b.x + 5, b.y - 5); ctx.lineTo(b.x - 5, b.y + 5); ctx.stroke();
      } else {
        ctx.fillStyle = 'rgba(255,90,60,.28)'; ctx.beginPath(); ctx.arc(b.x, b.y, (b.r + 3) * pulse, 0, 7); ctx.fill();
        ctx.fillStyle = '#ff5a3a'; ctx.strokeStyle = hc ? '#fff' : '#2a0a0a'; ctx.lineWidth = hc ? 2 : 1.6;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 7); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#ffe9b0'; ctx.beginPath(); ctx.arc(b.x - 1, b.y - 1, b.r * 0.4, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 1;
        ctx.setLineDash([2.5, 2.5]); ctx.beginPath(); ctx.arc(b.x, b.y, b.r + 2.5, 0, 7); ctx.stroke(); ctx.setLineDash([]);
      }
    }
  }

  drawZones(ctx, g) {
    for (const z of g.zones) {
      const a = Math.min(1, z.t / 0.6);
      const gr = ctx.createRadialGradient(z.x, z.y, 4, z.x, z.y, z.r);
      gr.addColorStop(0, `rgba(255,170,40,${0.5 * a})`); gr.addColorStop(0.7, `rgba(255,80,20,${0.3 * a})`); gr.addColorStop(1, 'rgba(255,60,10,0)');
      ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7); ctx.fill();
      ctx.strokeStyle = `rgba(255,200,80,${0.6 * a})`; ctx.lineWidth = 2; ctx.setLineDash([6, 4]); ctx.lineDashOffset = -this.t * 20;
      ctx.beginPath(); ctx.arc(z.x, z.y, z.r, 0, 7); ctx.stroke(); ctx.setLineDash([]);
    }
  }

  drawTelegraphs(ctx, g) {
    const calm = this.settings.reduceFlash;
    for (const t of g.telegraphs) {
      const p = 1 - t.t / t.dur;
      const a = calm ? 0.45 : 0.3 + 0.25 * Math.sin(this.t * 22);
      ctx.strokeStyle = `rgba(255,70,70,${0.5 + p * 0.5})`; ctx.fillStyle = `rgba(255,50,50,${a * (0.5 + p)})`;
      if (t.kind === 'fan') {
        ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.arc(t.x, t.y, g.wallY - t.y + 20, Math.PI / 2 - 0.55, Math.PI / 2 + 0.55); ctx.closePath();
        ctx.globalAlpha = 0.4 * p + 0.1; ctx.fill(); ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.setLineDash([8, 6]); ctx.stroke(); ctx.setLineDash([]);
      } else if (t.kind === 'circle') {
        ctx.beginPath(); ctx.arc(t.x, t.y, t.r, 0, 7); ctx.globalAlpha = 0.25 + 0.35 * p; ctx.fill(); ctx.globalAlpha = 1; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.beginPath(); ctx.arc(t.x, t.y, t.r * (1 - p * 0.8), 0, 7); ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = 'bold 16px system-ui'; ctx.textAlign = 'center'; ctx.fillText('!', t.x, t.y + 6);
      } else if (t.kind === 'line') {
        ctx.lineWidth = 2 + p * 6; ctx.globalAlpha = 0.4 + 0.5 * p; ctx.setLineDash([10, 8]);
        ctx.beginPath(); ctx.moveTo(t.x, t.y); ctx.lineTo(t.x2, t.y2); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
      } else if (t.kind === 'ring') {
        ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(t.x, t.y, t.r * (1.5 - p * 0.5), 0, 7); ctx.stroke();
      }
    }
  }

  drawBeamHazard(ctx, g) {
    const b = g.beamHazard;
    if (!b) return;
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    const flick = this.settings.reduceFlash ? 1 : 0.85 + 0.15 * Math.sin(this.t * 50);
    ctx.strokeStyle = '#c066ff'; ctx.globalAlpha = 0.4 * flick; ctx.lineWidth = 34;
    ctx.beginPath(); ctx.moveTo(b.bx, b.by); ctx.lineTo(b.x, g.wallY + 10); ctx.stroke();
    ctx.globalAlpha = 0.9 * flick; ctx.strokeStyle = '#e3a6ff'; ctx.lineWidth = 14;
    ctx.beginPath(); ctx.moveTo(b.bx, b.by); ctx.lineTo(b.x, g.wallY + 10); ctx.stroke();
    ctx.globalAlpha = 1; ctx.strokeStyle = '#fff'; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(b.bx, b.by); ctx.lineTo(b.x, g.wallY + 10); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    this.spawn('spark', b.x + this.rng.range(-12, 12), g.wallY, this.rng.range(-80, 80), this.rng.range(-160, -40), 0.3, 2, '#e3a6ff');
  }

  drawParticles(ctx) {
    for (const p of this.parts) {
      if (!p.a) continue;
      const f = p.life / p.max;
      switch (p.kind) {
        case 'spark':
          ctx.globalCompositeOperation = 'lighter'; ctx.strokeStyle = p.color; ctx.globalAlpha = f; ctx.lineWidth = p.size;
          ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04); ctx.stroke();
          ctx.globalCompositeOperation = 'source-over'; break;
        case 'dot':
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = f; ctx.fillStyle = p.color;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.5 + 0.5 * f), 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; break;
        case 'smoke':
          ctx.globalAlpha = f * 0.6; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.fill(); break;
        case 'ring':
          ctx.globalAlpha = f; ctx.strokeStyle = p.color; ctx.lineWidth = 2.5 * f + 0.5;
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 7); ctx.stroke(); break;
        case 'flame': {
          ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = f * 0.8;
          ctx.fillStyle = f > 0.6 ? '#fff0a0' : f > 0.3 ? '#ffa030' : '#d03a10';
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.4 + f * 0.8), 0, 7); ctx.fill(); ctx.globalCompositeOperation = 'source-over'; break;
        }
        case 'shell': {
          ctx.globalAlpha = 1;
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(Math.atan2(p.vy, p.vx) + Math.PI / 2);
          ctx.fillStyle = p.color; ctx.strokeStyle = '#3a2a08'; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.roundRect(-1.8, -4, 3.6, 8, 1.4); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#fff6c8'; ctx.fillRect(-0.8, -3, 1, 4);
          ctx.restore(); break;
        }
        case 'shard':
          ctx.globalAlpha = f; ctx.fillStyle = p.color; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot + p.life * 8);
          ctx.fillRect(-p.size, -p.size * 0.6, p.size * 2, p.size * 1.2); ctx.restore(); break;
        default: break;
      }
    }
    ctx.globalAlpha = 1;
  }

  drawNumbers(ctx) {
    ctx.textAlign = 'center';
    for (const n of this.nums) {
      if (!n.a) continue;
      const f = n.life / n.max;
      const size = n.crit ? 17 : n.dmg > 100 ? 13 : 11;
      ctx.globalAlpha = Math.min(1, f * 2);
      ctx.font = `800 ${size}px system-ui, sans-serif`;
      const col = n.crit ? '#ffe14f' : EL_COLOR[n.el] || '#fff';
      const txt = fmt(n.dmg) + (n.crit ? '!' : '');
      const w = ctx.measureText(txt).width;
      ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(10,12,24,.9)';
      ctx.strokeText(txt, n.x + 4, n.y); ctx.fillStyle = col; ctx.fillText(txt, n.x + 4, n.y);
      this.elementGlyph(ctx, n.el, n.x + 4 - w / 2 - 6, n.y - size * 0.35, col);
    }
    ctx.globalAlpha = 1;
  }

  /** Damage-type icon so element is never communicated by colour alone (GDD 11.4). */
  elementGlyph(ctx, el, x, y, col) {
    ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (el === 'fire') { ctx.moveTo(x, y - 4); ctx.lineTo(x + 3.2, y + 3); ctx.lineTo(x - 3.2, y + 3); ctx.closePath(); ctx.fill(); }
    else if (el === 'energy') { ctx.moveTo(x, y - 4); ctx.lineTo(x + 3.4, y); ctx.lineTo(x, y + 4); ctx.lineTo(x - 3.4, y); ctx.closePath(); ctx.fill(); }
    else if (el === 'frost') { ctx.moveTo(x - 3.5, y); ctx.lineTo(x + 3.5, y); ctx.moveTo(x, y - 3.5); ctx.lineTo(x, y + 3.5); ctx.stroke(); }
    else if (el === 'blast') { ctx.fillRect(x - 3, y - 3, 6, 6); }
    else { ctx.arc(x, y, 2.6, 0, 7); ctx.fill(); }
  }

  drawBlade(ctx, pts) {
    if (pts.length < 2) return;
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i];
      const f = i / pts.length;
      ctx.strokeStyle = `rgba(160,235,255,${f})`; ctx.lineWidth = 2 + f * 7;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.strokeStyle = `rgba(255,255,255,${f})`; ctx.lineWidth = 1 + f * 3;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';
  }
}

const OLC = '#10131f';

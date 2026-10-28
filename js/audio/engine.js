// WebAudio engine: every sound effect is synthesised (no audio files to ship or cache).
// Mixing (GDD 12): master compressor, voice limiting per effect, music ducking on big impacts.

import { Music } from './music.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.vol = { music: 0.6, sfx: 0.9 };
    this.limits = new Map();
    this.loops = {};
    this.music = null;
    this.noiseBuf = null;
  }

  /** Must be called from a user gesture (iOS/Safari requirement). Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC({ latencyHint: 'interactive' });
      this.build(this.ctx);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return true;
  }

  build(ctx) {
    this.master = ctx.createGain();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.knee.value = 12; this.comp.ratio.value = 5;
    this.comp.attack.value = 0.003; this.comp.release.value = 0.2;
    this.master.connect(this.comp); this.comp.connect(ctx.destination);
    this.musicBus = ctx.createGain(); this.sfxBus = ctx.createGain();
    this.musicBus.connect(this.master); this.sfxBus.connect(this.master);
    this.noiseBuf = makeNoise(ctx);
    this.applyVolumes();
    this.music = new Music(ctx, this.musicBus, this.noiseBuf);
  }

  setVolumes(music, sfx) { this.vol.music = music; this.vol.sfx = sfx; this.applyVolumes(); }
  applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.musicBus.gain.setTargetAtTime(this.vol.music * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.vol.sfx * 0.9, t, 0.05);
  }

  suspend() { if (this.ctx && this.ctx.state === 'running') this.ctx.suspend(); }
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

  playMusic(name) { if (this.music) this.music.play(name); this.pendingMusic = name; }
  stopMusic() { if (this.music) this.music.stop(); this.pendingMusic = null; }
  duck(amount = 0.45, dur = 0.3) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, g = this.musicBus.gain, base = this.vol.music * 0.55;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(base * (1 - amount), t + 0.02);
    g.linearRampToValueAtTime(base, t + dur);
  }

  // ---------------------------------------------------------------- sfx
  /** Fire a named effect, honouring per-effect rate limits so dense combat never turns to noise. */
  sfx(name, o = {}) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running' || this.vol.sfx <= 0) return;
    const def = SFX[name];
    if (!def) return;
    const now = ctx.currentTime;
    const lim = this.limits.get(name) || { last: -1, n: 0 };
    if (now - lim.last < (def.gap ?? 0.03)) return;
    lim.last = now;
    this.limits.set(name, lim);
    def.play(this, ctx, now + 0.005, o);
  }

  /** Continuous loops (beam hum, flamethrower roar) are gain-faded rather than retriggered. */
  loop(name, on) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    let l = this.loops[name];
    if (!l) {
      l = this.loops[name] = LOOPS[name](this, ctx);
      l.gain.connect(this.sfxBus);
    }
    l.gain.gain.setTargetAtTime(on ? l.level : 0, ctx.currentTime, 0.06);
  }
  stopLoops() { for (const k in this.loops) this.loops[k].gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05); }

  /** Map simulation events to sounds. */
  fromEvent(e) {
    switch (e.type) {
      case 'shoot': this.sfx('shoot_' + (e.kind === 'drone' ? 'drone' : e.kind === 'rocket' ? 'rocket' : e.kind === 'sniper' ? 'sniper' : 'rifle')); break;
      case 'turretShot': this.sfx('shoot_turret'); break;
      case 'hit': if (e.crit) this.sfx('crit'); else if (!e.tick) this.sfx('hit'); break;
      case 'explosion': this.sfx(e.big ? 'explosion_big' : 'explosion'); if (e.big) this.duck(0.35, 0.3); break;
      case 'kill': this.sfx(e.boss ? 'boss_die' : 'kill'); if (e.boss) this.duck(0.7, 1.2); break;
      case 'cut': this.sfx('cut'); break;
      case 'intercept': this.sfx('intercept'); break;
      case 'enemyShot': this.sfx('enemy_shot'); break;
      case 'baseHit': this.sfx('base_hit'); break;
      case 'barrierBreak': this.sfx('barrier_break'); break;
      case 'ability': this.sfx('ability', { id: e.id }); this.duck(0.3, 0.4); break;
      case 'heroStun': this.sfx('stun'); break;
      case 'wave': this.sfx(e.boss ? 'boss_horn' : 'wave'); break;
      case 'bossWarn': this.sfx('boss_horn'); break;
      case 'bossAttack': this.sfx('warn'); break;
      case 'bossFire': this.sfx('boss_fire'); break;
      case 'bossBeam': this.sfx('boss_beam'); break;
      case 'bossExposed': this.sfx('exposed'); break;
      case 'bossShield': case 'shieldBreak': this.sfx('shield'); break;
      case 'phase': this.sfx('phase'); this.duck(0.5, 1.0); break;
      case 'upgradeOpen': this.sfx('upgrade_open'); break;
      case 'upgradePicked': this.sfx('upgrade_pick'); break;
      case 'reroll': this.sfx('ui_click'); break;
      case 'victory': this.sfx('victory'); break;
      case 'defeat': this.sfx('defeat'); break;
      case 'immune': this.sfx('immune'); break;
      case 'turret': this.sfx('turret_deploy'); break;
      default: break;
    }
  }
}

function makeNoise(ctx) {
  const len = ctx.sampleRate * 1.5;
  const b = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = b.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < len; i++) { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; d[i] = s / 2147483648 - 1; }
  return b;
}

// ------------------------------------------------------------------ synthesis helpers
function osc(ctx, type, f0, f1, t, dur, vol, dest, a = 0.002) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(dest);
  o.start(t); o.stop(t + dur + 0.02);
  return o;
}
function noise(eng, ctx, type, f0, f1, t, dur, vol, dest, q = 1) {
  const s = ctx.createBufferSource();
  s.buffer = eng.noiseBuf;
  s.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = type; f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1 !== f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f); f.connect(g); g.connect(dest);
  s.start(t, Math.random()); s.stop(t + dur + 0.02);
}
const rnd = (a, b) => a + Math.random() * (b - a);
const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

export const SFX = {
  shoot_rifle: { gap: 0.045, play(e, c, t) { const p = rnd(0.92, 1.1); noise(e, c, 'highpass', 2400, 1800, t, 0.05, 0.1, e.sfxBus); osc(c, 'square', 330 * p, 110, t, 0.06, 0.05, e.sfxBus); } },
  shoot_rocket: { gap: 0.08, play(e, c, t) { noise(e, c, 'bandpass', 900, 220, t, 0.28, 0.2, e.sfxBus, 0.8); osc(c, 'sawtooth', 150, 55, t, 0.25, 0.1, e.sfxBus); } },
  shoot_sniper: { gap: 0.1, play(e, c, t) { noise(e, c, 'highpass', 1500, 600, t, 0.2, 0.2, e.sfxBus); osc(c, 'sine', 1100, 90, t, 0.28, 0.18, e.sfxBus); osc(c, 'square', 600, 150, t + 0.07, 0.15, 0.04, e.sfxBus); } },
  shoot_drone: { gap: 0.06, play(e, c, t) { osc(c, 'triangle', rnd(900, 1100), 1500, t, 0.07, 0.055, e.sfxBus); } },
  shoot_turret: { gap: 0.07, play(e, c, t) { osc(c, 'square', 520, 260, t, 0.05, 0.04, e.sfxBus); } },
  turret_deploy: { gap: 0.2, play(e, c, t) { osc(c, 'square', 200, 400, t, 0.18, 0.08, e.sfxBus); osc(c, 'triangle', 800, 1200, t + 0.12, 0.12, 0.08, e.sfxBus); } },
  hit: { gap: 0.045, play(e, c, t) { osc(c, 'triangle', rnd(420, 560), 200, t, 0.03, 0.045, e.sfxBus); } },
  crit: { gap: 0.06, play(e, c, t) { osc(c, 'sine', 1320, 1320, t, 0.12, 0.09, e.sfxBus); osc(c, 'sine', 1976, 1976, t + 0.05, 0.16, 0.08, e.sfxBus); } },
  kill: { gap: 0.04, play(e, c, t) { osc(c, 'sine', rnd(260, 340), 70, t, 0.1, 0.1, e.sfxBus); noise(e, c, 'lowpass', 1800, 300, t, 0.1, 0.08, e.sfxBus); } },
  explosion: { gap: 0.05, play(e, c, t) { noise(e, c, 'lowpass', 1600, 180, t, 0.3, 0.2, e.sfxBus); osc(c, 'sine', 110, 40, t, 0.28, 0.2, e.sfxBus); } },
  explosion_big: { gap: 0.07, play(e, c, t) { noise(e, c, 'lowpass', 2200, 120, t, 0.55, 0.34, e.sfxBus); osc(c, 'sine', 90, 30, t, 0.5, 0.34, e.sfxBus); osc(c, 'sawtooth', 70, 28, t, 0.4, 0.1, e.sfxBus); } },
  boss_die: { gap: 0.5, play(e, c, t) { for (let i = 0; i < 5; i++) { noise(e, c, 'lowpass', 2400 - i * 300, 100, t + i * 0.16, 0.5, 0.3, e.sfxBus); osc(c, 'sine', 100, 28, t + i * 0.16, 0.45, 0.3, e.sfxBus); } } },
  cut: { gap: 0.04, play(e, c, t) { noise(e, c, 'highpass', 3000, 9000, t, 0.09, 0.14, e.sfxBus, 2); osc(c, 'sine', 1800, 2600, t, 0.08, 0.08, e.sfxBus); } },
  intercept: { gap: 0.1, play(e, c, t) { osc(c, 'sine', 1500, 2200, t, 0.1, 0.09, e.sfxBus); } },
  enemy_shot: { gap: 0.1, play(e, c, t) { osc(c, 'sawtooth', 300, 120, t, 0.12, 0.04, e.sfxBus); } },
  base_hit: { gap: 0.12, play(e, c, t) { osc(c, 'sine', 90, 45, t, 0.22, 0.25, e.sfxBus); noise(e, c, 'bandpass', 700, 300, t, 0.15, 0.14, e.sfxBus); } },
  barrier_break: { gap: 0.2, play(e, c, t) { noise(e, c, 'highpass', 4000, 800, t, 0.3, 0.2, e.sfxBus); osc(c, 'triangle', 900, 120, t, 0.3, 0.12, e.sfxBus); } },
  stun: { gap: 0.15, play(e, c, t) { osc(c, 'square', 220, 90, t, 0.18, 0.1, e.sfxBus); } },
  immune: { gap: 0.12, play(e, c, t) { osc(c, 'square', 700, 700, t, 0.05, 0.04, e.sfxBus); } },
  ability: {
    gap: 0.08,
    play(e, c, t, o) {
      const notes = { vanguard: [57, 64, 69], rook: [45, 52, 57], pulse: [64, 71, 76], patch: [60, 67, 72], specter: [69, 76, 81], ember: [50, 57, 62] }[o.id] || [60, 64, 67];
      notes.forEach((n, i) => osc(c, 'sawtooth', midi(n), midi(n + 12), t + i * 0.05, 0.4, 0.08, e.sfxBus, 0.01));
      noise(e, c, 'bandpass', 400, 3200, t, 0.45, 0.12, e.sfxBus, 0.7);
    },
  },
  wave: { gap: 0.3, play(e, c, t) { osc(c, 'square', midi(57), midi(57), t, 0.18, 0.07, e.sfxBus); osc(c, 'square', midi(64), midi(64), t + 0.14, 0.26, 0.07, e.sfxBus); } },
  boss_horn: { gap: 0.8, play(e, c, t) { for (const f of [55, 82.4, 110]) osc(c, 'sawtooth', f, f * 0.96, t, 1.4, 0.12, e.sfxBus, 0.12); noise(e, c, 'lowpass', 400, 100, t, 1.2, 0.14, e.sfxBus); } },
  warn: { gap: 0.15, play(e, c, t) { for (let i = 0; i < 3; i++) osc(c, 'square', i % 2 ? 520 : 760, i % 2 ? 520 : 760, t + i * 0.18, 0.16, 0.06, e.sfxBus); } },
  boss_fire: { gap: 0.1, play(e, c, t) { noise(e, c, 'bandpass', 1200, 300, t, 0.3, 0.2, e.sfxBus); osc(c, 'sawtooth', 140, 60, t, 0.3, 0.15, e.sfxBus); } },
  boss_beam: { gap: 0.3, play(e, c, t) { osc(c, 'sawtooth', 80, 220, t, 0.8, 0.14, e.sfxBus, 0.05); osc(c, 'square', 160, 420, t, 0.8, 0.07, e.sfxBus, 0.05); } },
  exposed: { gap: 0.3, play(e, c, t) { osc(c, 'sine', 600, 1200, t, 0.3, 0.1, e.sfxBus); osc(c, 'sine', 900, 1800, t + 0.08, 0.3, 0.08, e.sfxBus); } },
  shield: { gap: 0.2, play(e, c, t) { osc(c, 'triangle', 300, 900, t, 0.4, 0.1, e.sfxBus); } },
  phase: { gap: 0.5, play(e, c, t) { osc(c, 'sawtooth', 60, 480, t, 1.4, 0.16, e.sfxBus, 0.1); noise(e, c, 'bandpass', 300, 4000, t, 1.4, 0.16, e.sfxBus, 0.6); osc(c, 'sine', 80, 30, t + 1.3, 0.7, 0.3, e.sfxBus); } },
  upgrade_open: { gap: 0.2, play(e, c, t) { [60, 67, 72].forEach((n, i) => osc(c, 'triangle', midi(n), midi(n), t + i * 0.07, 0.25, 0.08, e.sfxBus)); } },
  upgrade_pick: { gap: 0.1, play(e, c, t) { [60, 64, 67, 72, 76].forEach((n, i) => osc(c, 'square', midi(n), midi(n), t + i * 0.055, 0.2, 0.06, e.sfxBus)); } },
  victory: { gap: 1, play(e, c, t) { [[60, 0], [64, 0.13], [67, 0.26], [72, 0.4], [67, 0.6], [72, 0.72], [76, 0.86]].forEach(([n, d]) => { osc(c, 'square', midi(n), midi(n), t + d, 0.4, 0.07, e.sfxBus); osc(c, 'triangle', midi(n - 12), midi(n - 12), t + d, 0.4, 0.1, e.sfxBus); }); } },
  defeat: { gap: 1, play(e, c, t) { [[67, 0], [63, 0.25], [60, 0.5], [55, 0.8]].forEach(([n, d]) => { osc(c, 'triangle', midi(n), midi(n) * 0.97, t + d, 0.6, 0.12, e.sfxBus, 0.02); }); } },
  ui_click: { gap: 0.03, play(e, c, t) { osc(c, 'triangle', 760, 640, t, 0.05, 0.08, e.sfxBus); } },
  ui_back: { gap: 0.03, play(e, c, t) { osc(c, 'triangle', 520, 380, t, 0.06, 0.08, e.sfxBus); } },
  ui_buy: { gap: 0.05, play(e, c, t) { osc(c, 'sine', 1318, 1318, t, 0.1, 0.1, e.sfxBus); osc(c, 'sine', 1760, 1760, t + 0.07, 0.18, 0.1, e.sfxBus); } },
  ui_deny: { gap: 0.1, play(e, c, t) { osc(c, 'square', 200, 150, t, 0.12, 0.06, e.sfxBus); } },
  coin: { gap: 0.04, play(e, c, t) { osc(c, 'square', 988, 988, t, 0.06, 0.05, e.sfxBus); osc(c, 'square', 1319, 1319, t + 0.05, 0.12, 0.05, e.sfxBus); } },
};

const LOOPS = {
  beam(e, c) {
    const g = c.createGain(); g.gain.value = 0;
    const o1 = c.createOscillator(); o1.type = 'sawtooth'; o1.frequency.value = 96;
    const o2 = c.createOscillator(); o2.type = 'square'; o2.frequency.value = 192.7;
    const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
    const lfo = c.createOscillator(); lfo.frequency.value = 9; const lg = c.createGain(); lg.gain.value = 40; lfo.connect(lg); lg.connect(o1.frequency);
    const m = c.createGain(); m.gain.value = 0.5;
    o1.connect(f); o2.connect(m); m.connect(f); f.connect(g);
    o1.start(); o2.start(); lfo.start();
    return { gain: g, level: 0.05 };
  },
  flame(e, c) {
    const g = c.createGain(); g.gain.value = 0;
    const s = c.createBufferSource(); s.buffer = e.noiseBuf; s.loop = true;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 700; f.Q.value = 0.6;
    const lfo = c.createOscillator(); lfo.frequency.value = 13; const lg = c.createGain(); lg.gain.value = 250; lfo.connect(lg); lg.connect(f.frequency);
    s.connect(f); f.connect(g); s.start(); lfo.start();
    return { gain: g, level: 0.2 };
  },
};

// Generative music: each track is a short data description (tempo, chords, 16-step patterns)
// rendered live by a look-ahead step sequencer built on WebAudio oscillators. No audio files.
//
// Pattern strings are 16 characters (one bar of 16th notes):
//   drums: '1' = hit            bass: '1' root, '2' octave up, '5' fifth
//   arp/lead: '1'-'4' chord-tone index, 'A'-'D' same tones one octave up, '0' rest

const m = (t) => 440 * Math.pow(2, (t - 69) / 12);
const MINOR = [0, 3, 7, 12], MAJOR = [0, 4, 7, 12];

const C = (root, minor) => ({ root, tones: minor ? MINOR : MAJOR });

export const TRACKS = {
  menu: {
    bpm: 84, level: 0.9,
    chords: [C(45, 1), C(41), C(48), C(43)],
    kick: ['1000000010000000'], snare: ['0000000000000000'], hat: ['0010001000100010'], hatVol: 0.25,
    bass: ['1000000050000000'], arp: ['1020304030204020'], arpOct: 24, arpVol: 0.5,
    pad: true, padVol: 0.9,
    lead: ['0000000000000000', 'A000000000C00000', '0000000000000000', 'B0000000A0000C00'], leadVol: 0.7,
  },
  battle0: { // Wasteland - driving minor groove
    bpm: 124, level: 1,
    chords: [C(38, 1), C(34), C(41), C(36)],
    kick: ['1000100010001000'], snare: ['0000100000001000'], hat: ['0010001000100011'], hatVol: 0.5,
    bass: ['1011201110112011', '1011201150112011'], arp: ['1234321012343210'], arpOct: 24, arpVol: 0.4,
    pad: false,
    lead: ['00000000A0000000', '0000C00000B000A0', '00000000A000B000', 'C0000B0000A00000'], leadVol: 0.8,
  },
  battle1: { // Orbital Frontier - bright synth arps
    bpm: 132, level: 1,
    chords: [C(40, 1), C(36), C(43), C(38)],
    kick: ['1000100110001010'], snare: ['0000100000001000'], hat: ['1010101010101011'], hatVol: 0.42,
    bass: ['1010101020101010'], arp: ['1A2B3C4D3C2B1A00', '1B3D2C4A1B3D2C4A'], arpOct: 36, arpVol: 0.36,
    pad: true, padVol: 0.5,
    lead: ['0000000000000000', 'D000C000B000A000', '0000000000000000', 'C0A0B0D000000000'], leadVol: 0.7,
  },
  battle2: { // Monster Realm - broken, eerie
    bpm: 112, level: 1,
    chords: [C(36, 1), C(32), C(34), C(43)],
    kick: ['1001001010010010'], snare: ['0000100000001001'], hat: ['0101010101010111'], hatVol: 0.4,
    bass: ['1000001000100000', '1000000150002000'], arp: ['10304020', '1030402010304020'], arpOct: 24, arpVol: 0.38,
    pad: true, padVol: 0.7,
    lead: ['00000000000A0000', '0000B0000000C000', '00000000A0000000', 'D000000C0000B000'], leadVol: 0.7,
  },
  boss: {
    bpm: 150, level: 1.05,
    chords: [C(45, 1), C(41), C(43), C(40)],
    kick: ['1000101010001011', '1010100010101011'], snare: ['0000100000001010'], hat: ['1111111111111111'], hatVol: 0.45,
    bass: ['1111211111112111', '1121211111212111'], arp: ['1324132413241324'], arpOct: 24, arpVol: 0.4,
    pad: true, padVol: 0.7,
    lead: ['A0A0B000C0000000', 'D0000C0B0000A000', 'A0A0B000C000D000', 'C0B0A000B0A00000'], leadVol: 0.9,
  },
};

export class Music {
  constructor(ctx, bus, noiseBuf) {
    this.ctx = ctx; this.bus = bus; this.noiseBuf = noiseBuf;
    this.cur = null; this.timer = null; this.name = null;
  }

  play(name) {
    if (this.name === name && this.timer) return;
    this.stop(0.8);
    const track = TRACKS[name];
    if (!track) return;
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    out.gain.linearRampToValueAtTime(track.level, ctx.currentTime + 0.6);
    out.connect(this.bus);
    this.cur = { track, out, step: 0, next: ctx.currentTime + 0.1 };
    this.name = name;
    const tick = () => {
      const c = this.cur;
      if (!c) return;
      const dur = 60 / c.track.bpm / 4;
      while (c.next < ctx.currentTime + 0.3) {
        this.scheduleStep(c.track, c.out, c.next, c.step, dur);
        c.next += dur; c.step++;
      }
    };
    tick();
    this.timer = setInterval(tick, 50);
  }

  stop(fade = 0.4) {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.cur) {
      const { out } = this.cur;
      const t = this.ctx.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setValueAtTime(out.gain.value, t);
      out.gain.linearRampToValueAtTime(0.0001, t + fade);
      setTimeout(() => { try { out.disconnect(); } catch { /* already gone */ } }, fade * 1000 + 200);
    }
    this.cur = null; this.name = null;
  }

  /** Schedule every step of `bars` bars at once (used for offline rendering in tests/tools). */
  scheduleAll(trackName, dest, bars) {
    const track = TRACKS[trackName];
    const dur = 60 / track.bpm / 4;
    for (let s = 0; s < bars * 16; s++) this.scheduleStep(track, dest, 0.05 + s * dur, s, dur);
    return bars * 16 * dur;
  }

  scheduleStep(tr, dest, t, step, dur) {
    const ctx = this.ctx;
    const s16 = step % 16, bar = Math.floor(step / 16);
    const chord = tr.chords[bar % tr.chords.length];
    const pick = (arr) => arr[bar % arr.length];
    const at = (pat) => (pat.length === 16 ? pat[s16] : pat[s16 % pat.length]) || '0';
    // drums
    if (at(pick(tr.kick)) === '1') this.kick(dest, t);
    if (at(pick(tr.snare)) === '1') this.snare(dest, t);
    const h = at(pick(tr.hat));
    if (h === '1') this.hat(dest, t, tr.hatVol * (s16 % 4 === 2 ? 1 : 0.6), s16 % 8 === 6 && tr.bpm > 120);
    // bass
    const b = at(pick(tr.bass));
    if (b !== '0') {
      const mul = b === '2' ? 2 : b === '5' ? 1.4983 : 1;
      this.bass(dest, t, m(chord.root) * mul, dur * 1.8);
    }
    // arpeggio
    const a = at(pick(tr.arp));
    if (a !== '0') {
      const up = a >= 'A' ? 12 : 0;
      const idx = (a >= 'A' ? a.charCodeAt(0) - 65 : Number(a) - 1) % 4;
      this.pluck(dest, t, m(chord.root + chord.tones[idx] + tr.arpOct + up), dur * 1.6, tr.arpVol);
    }
    // pad once per bar
    if (tr.pad && s16 === 0) this.pad(dest, t, chord.tones.slice(0, 3).map((x) => m(chord.root + 12 + x)), dur * 16, tr.padVol);
    // lead
    const l = at(tr.lead[bar % tr.lead.length]);
    if (l !== '0') {
      const up = l >= 'A' ? 12 : 0;
      const idx = (l >= 'A' ? l.charCodeAt(0) - 65 : Number(l) - 1) % 4;
      this.lead(dest, t, m(chord.root + chord.tones[idx] + 36 + up), dur * 3, tr.leadVol);
    }
  }

  // ------------------------------------------------------------ instruments
  kick(d, t) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
    g.gain.setValueAtTime(0.85, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g); g.connect(d); o.start(t); o.stop(t + 0.22);
  }
  snare(d, t) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.7;
    const g = c.createGain(); g.gain.setValueAtTime(0.4, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    s.connect(f); f.connect(g); g.connect(d); s.start(t, 0.3); s.stop(t + 0.18);
    const o = c.createOscillator(), og = c.createGain();
    o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(120, t + 0.1);
    og.gain.setValueAtTime(0.3, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(og); og.connect(d); o.start(t); o.stop(t + 0.14);
  }
  hat(d, t, vol, open) {
    const c = this.ctx;
    const s = c.createBufferSource(); s.buffer = this.noiseBuf;
    const f = c.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 7500;
    const g = c.createGain(); const len = open ? 0.11 : 0.035;
    g.gain.setValueAtTime(vol * 0.35, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    s.connect(f); f.connect(g); g.connect(d); s.start(t, 0.6); s.stop(t + len + 0.02);
  }
  bass(d, t, f0, len) {
    const c = this.ctx;
    const o = c.createOscillator(), o2 = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'sawtooth'; o2.type = 'sine'; o.frequency.value = f0; o2.frequency.value = f0 / 2;
    f.type = 'lowpass'; f.frequency.setValueAtTime(900, t); f.frequency.exponentialRampToValueAtTime(220, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.32, t + 0.01); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(f); o2.connect(g); f.connect(g); g.connect(d);
    o.start(t); o2.start(t); o.stop(t + len + 0.02); o2.stop(t + len + 0.02);
  }
  pluck(d, t, f0, len, vol) {
    const c = this.ctx;
    const o = c.createOscillator(), f = c.createBiquadFilter(), g = c.createGain();
    o.type = 'square'; o.frequency.value = f0;
    f.type = 'lowpass'; f.frequency.setValueAtTime(3200, t); f.frequency.exponentialRampToValueAtTime(500, t + len);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.09 * vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(f); f.connect(g); g.connect(d); o.start(t); o.stop(t + len + 0.02);
  }
  pad(d, t, freqs, len, vol) {
    const c = this.ctx;
    const g = c.createGain(), f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1100;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.055 * vol, t + len * 0.3); g.gain.linearRampToValueAtTime(0.0001, t + len);
    f.connect(g); g.connect(d);
    for (const fr of freqs) for (const det of [-6, 6]) {
      const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = fr; o.detune.value = det;
      o.connect(f); o.start(t); o.stop(t + len + 0.05);
    }
  }
  lead(d, t, f0, len, vol) {
    const c = this.ctx;
    const o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    o.type = 'triangle'; o.frequency.value = f0;
    lfo.frequency.value = 5.5; lg.gain.value = f0 * 0.006; lfo.connect(lg); lg.connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.13 * vol, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + len);
    o.connect(g); g.connect(d); o.start(t); lfo.start(t); o.stop(t + len + 0.02); lfo.stop(t + len + 0.02);
  }
}

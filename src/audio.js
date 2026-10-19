// Fully synthesized audio (no files, works offline): generative music, sound effects
// and nature ambience, each on its own bus with a shared reverb.

const SCALES = {
  // day: warm D major pentatonic-ish; night: dreamy A minor
  day: {
    chords: [[50, 57, 62, 66, 69], [47, 54, 59, 62, 66], [43, 50, 55, 59, 62], [45, 52, 57, 61, 64]],
    melody: [62, 64, 66, 69, 71, 74, 76, 78, 81],
    bar: 4.2,
  },
  night: {
    chords: [[45, 52, 57, 60, 64], [41, 48, 53, 57, 60], [48, 55, 60, 64, 67], [43, 50, 55, 59, 62]],
    melody: [57, 60, 62, 64, 67, 69, 72, 74],
    bar: 5.6,
  },
};
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.night = false;
    this.settings = { music: true, sfx: true, amb: true, volume: 0.8 };
    this.prox = { waterfall: 0, fire: 0 };
  }

  get on() {
    return !!this.ctx && (this.settings.music || this.settings.sfx || this.settings.amb);
  }

  // Must be called from a user gesture (browser autoplay rules).
  unlock() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.bus = {};
    for (const k of ['music', 'sfx', 'amb']) {
      this.bus[k] = ctx.createGain();
      this.bus[k].connect(this.master);
    }
    // reverb from a generated impulse response
    this.reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 3.2;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    this.reverb.buffer = ir;
    this.reverbOut = ctx.createGain();
    this.reverbOut.gain.value = 0.55;
    this.reverb.connect(this.reverbOut).connect(this.master);
    this.noise = this.makeNoise();
    this.applySettings();
    this.startAmbience();
    this.nextBar = ctx.currentTime + 0.5;
    this.barIndex = 0;
    this.scheduler = setInterval(() => this.scheduleMusic(), 250);
    this.ambTimer();
  }

  setSettings(s) {
    Object.assign(this.settings, s);
    this.applySettings();
  }

  applySettings() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, S = this.settings;
    this.master.gain.setTargetAtTime(S.volume, t, 0.2);
    this.bus.music.gain.setTargetAtTime(S.music ? 0.32 : 0, t, 0.6);
    this.bus.sfx.gain.setTargetAtTime(S.sfx ? 0.9 : 0, t, 0.05);
    this.bus.amb.gain.setTargetAtTime(S.amb ? 0.7 : 0, t, 0.6);
  }

  makeNoise() {
    const ctx = this.ctx;
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ---------------------------------------------------------------- helpers
  env(gainNode, t, a, peak, d) {
    const g = gainNode.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(peak, t + a);
    g.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  tone({ freq, type = 'sine', t = this.ctx.currentTime, a = 0.005, d = 0.3, peak = 0.2, bus = 'sfx', glide, wet = 0.2, detune = 0, filter }) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.detune.value = detune;
    if (glide) o.frequency.exponentialRampToValueAtTime(glide, t + a + d);
    let node = o;
    if (filter) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(this.bus[bus]);
    if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w).connect(this.reverb); }
    this.env(g, t, a, peak, d);
    o.start(t);
    o.stop(t + a + d + 0.05);
  }

  noiseBurst({ t = this.ctx.currentTime, a = 0.005, d = 0.2, peak = 0.2, type = 'bandpass', freq = 1200, q = 1, sweep, bus = 'sfx', wet = 0.1 }) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweep) f.frequency.exponentialRampToValueAtTime(sweep, t + a + d);
    f.Q.value = q;
    const g = ctx.createGain();
    src.connect(f).connect(g).connect(this.bus[bus]);
    if (wet) { const w = ctx.createGain(); w.gain.value = wet; g.connect(w).connect(this.reverb); }
    this.env(g, t, a, peak, d);
    src.start(t, Math.random());
    src.stop(t + a + d + 0.05);
  }

  // ---------------------------------------------------------------- sound effects
  sfx(name, vol = 1) {
    if (!this.ctx || !this.settings.sfx) return;
    const t = this.ctx.currentTime;
    const v = (x) => x * vol;
    switch (name) {
      case 'click':
        this.tone({ freq: 1400, type: 'triangle', d: 0.05, peak: v(0.05), wet: 0 });
        break;
      case 'paint':
        this.noiseBurst({ d: 0.09, peak: v(0.12), freq: 900 + Math.random() * 600, q: 0.8, wet: 0 });
        break;
      case 'build':
        this.tone({ freq: 140, type: 'sine', d: 0.25, peak: v(0.4), glide: 70, wet: 0.1 });
        this.noiseBurst({ d: 0.12, peak: v(0.25), freq: 500, q: 0.7, wet: 0.05 });
        [784, 988].forEach((f, i) => this.tone({ freq: f, type: 'triangle', t: t + 0.12 + i * 0.09, d: 0.5, peak: v(0.07), wet: 0.4 }));
        break;
      case 'landmark':
        [62, 66, 69, 74, 78, 81].forEach((m, i) => this.tone({ freq: mtof(m + 12), type: 'sine', t: t + i * 0.07, d: 1.4, peak: v(0.06), wet: 0.7 }));
        this.noiseBurst({ a: 0.4, d: 1.2, peak: v(0.05), type: 'highpass', freq: 5000, wet: 0.6 });
        break;
      case 'herd':
        // low grunt
        this.tone({ freq: 95, type: 'sawtooth', a: 0.04, d: 0.45, peak: v(0.16), glide: 70, filter: 420, wet: 0.2 });
        this.tone({ freq: 90, type: 'sawtooth', t: t + 0.55, a: 0.04, d: 0.35, peak: v(0.12), glide: 65, filter: 380, wet: 0.2 });
        break;
      case 'whale':
        this.tone({ freq: 260, type: 'sine', a: 0.4, d: 1.8, peak: v(0.12), glide: 420, wet: 0.8 });
        this.tone({ freq: 420, type: 'sine', t: t + 1.6, a: 0.3, d: 1.6, peak: v(0.08), glide: 230, wet: 0.8 });
        break;
      case 'bird':
        [0, 0.12, 0.22].forEach((o) => this.tone({ freq: 2600 + Math.random() * 600, type: 'sine', t: t + o, d: 0.09, peak: v(0.05), glide: 1900, wet: 0.3 }));
        break;
      case 'remove':
        this.noiseBurst({ a: 0.02, d: 0.35, peak: v(0.2), type: 'bandpass', freq: 3000, sweep: 300, q: 1.2, wet: 0.15 });
        break;
      case 'error':
        this.tone({ freq: 196, type: 'square', d: 0.09, peak: v(0.05), filter: 900, wet: 0 });
        this.tone({ freq: 165, type: 'square', t: t + 0.11, d: 0.12, peak: v(0.05), filter: 900, wet: 0 });
        break;
      case 'coin':
        this.tone({ freq: 1318, type: 'triangle', d: 0.12, peak: v(0.08), wet: 0.3 });
        this.tone({ freq: 1760, type: 'triangle', t: t + 0.08, d: 0.4, peak: v(0.08), wet: 0.4 });
        break;
      case 'chime':
        [72, 76, 79, 84].forEach((m, i) => this.tone({ freq: mtof(m), type: 'sine', t: t + i * 0.12, d: 1.2, peak: v(0.08), wet: 0.6 }));
        break;
      case 'fanfare': {
        const chords = [[62, 66, 69], [64, 67, 71], [66, 69, 74]];
        chords.forEach((c, i) => c.forEach((m) => {
          this.tone({ freq: mtof(m), type: 'sawtooth', t: t + i * 0.32, a: 0.03, d: i === 2 ? 1.6 : 0.3, peak: v(0.05), filter: 1800, wet: 0.5 });
          this.tone({ freq: mtof(m - 12), type: 'triangle', t: t + i * 0.32, a: 0.03, d: i === 2 ? 1.6 : 0.3, peak: v(0.05), wet: 0.4 });
        }));
        this.noiseBurst({ t: t + 0.64, a: 0.01, d: 0.8, peak: v(0.06), type: 'highpass', freq: 6000, wet: 0.5 });
        break;
      }
      case 'geyser':
        this.noiseBurst({ a: 0.6, d: 3.5, peak: v(0.35), type: 'bandpass', freq: 400, sweep: 1600, q: 0.6, wet: 0.3 });
        this.tone({ freq: 60, type: 'sine', a: 0.3, d: 2.5, peak: v(0.25), glide: 45, wet: 0.1 });
        break;
      case 'season':
        [79, 84, 88].forEach((m, i) => this.tone({ freq: mtof(m), type: 'sine', t: t + i * 0.18, d: 1.6, peak: v(0.04), wet: 0.8 }));
        break;
      default:
        break;
    }
  }

  // ---------------------------------------------------------------- music
  scheduleMusic() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== 'running') return;
    while (this.nextBar < ctx.currentTime + 1.0) {
      this.playBar(this.nextBar);
      this.nextBar += (this.night ? SCALES.night : SCALES.day).bar;
    }
  }

  playBar(t) {
    if (!this.settings.music) { this.barIndex++; return; }
    const S = this.night ? SCALES.night : SCALES.day;
    const chord = S.chords[Math.floor(this.barIndex / 2) % S.chords.length];
    const len = S.bar;
    // warm pad
    chord.slice(0, 4).forEach((m, i) => {
      for (const det of [-6, 6]) {
        this.tone({ freq: mtof(m), type: i === 0 ? 'triangle' : 'sine', t, a: len * 0.35, d: len * 0.9, peak: 0.035, bus: 'music', detune: det, filter: this.night ? 700 : 1100, wet: 0.5 });
      }
    });
    // plucked melody (kalimba-like), sparse and random but always in key
    const notes = this.night ? 2 + Math.floor(Math.random() * 2) : 3 + Math.floor(Math.random() * 3);
    let when = t + Math.random() * 0.4;
    for (let n = 0; n < notes; n++) {
      if (Math.random() < 0.18) { when += len / notes; continue; }
      const m = Math.random() < 0.4 ? chord[2 + Math.floor(Math.random() * 3)] + 12 : S.melody[Math.floor(Math.random() * S.melody.length)];
      this.tone({ freq: mtof(m), type: 'sine', t: when, a: 0.004, d: 1.6, peak: 0.07, bus: 'music', wet: 0.55 });
      this.tone({ freq: mtof(m) * 3, type: 'sine', t: when, a: 0.002, d: 0.25, peak: 0.012, bus: 'music', wet: 0.3 });
      when += (len / notes) * (0.7 + Math.random() * 0.6);
    }
    // soft bass on chord root
    this.tone({ freq: mtof(chord[0] - 12), type: 'sine', t, a: 0.3, d: len * 0.8, peak: 0.07, bus: 'music', wet: 0.15 });
    this.barIndex++;
  }

  // ---------------------------------------------------------------- ambience
  loopNoise(filterType, freq, q) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(f).connect(g).connect(this.bus.amb);
    src.start();
    return g;
  }

  startAmbience() {
    const ctx = this.ctx;
    // wind with slow swells
    this.wind = this.loopNoise('lowpass', 420, 0.5);
    this.wind.gain.value = 0.18;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lg = ctx.createGain();
    lg.gain.value = 0.1;
    lfo.connect(lg).connect(this.wind.gain);
    lfo.start();
    this.falls = this.loopNoise('bandpass', 900, 0.4);
    this.fire = this.loopNoise('highpass', 2500, 0.7);
  }

  ambTimer() {
    const tick = () => {
      if (this.ctx && this.settings.amb && this.ctx.state === 'running') {
        if (this.night) this.cricket(); else if (Math.random() < 0.55) this.birdsong();
        if (this.prox.fire > 0.05 && Math.random() < 0.8) {
          for (let i = 0; i < 4; i++) this.noiseBurst({ t: this.ctx.currentTime + Math.random() * 0.5, d: 0.03, peak: 0.25 * this.prox.fire, type: 'highpass', freq: 2000, bus: 'amb', wet: 0 });
        }
      }
      setTimeout(tick, this.night ? 700 + Math.random() * 800 : 1400 + Math.random() * 3500);
    };
    tick();
  }

  birdsong() {
    const t = this.ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2200 + Math.random() * 1800;
    for (let i = 0; i < notes; i++) {
      const st = t + i * (0.09 + Math.random() * 0.06);
      this.tone({ freq: base * (1 + Math.random() * 0.2), type: 'sine', t: st, a: 0.01, d: 0.08, peak: 0.03, glide: base * (0.75 + Math.random() * 0.6), bus: 'amb', wet: 0.35 });
    }
  }

  cricket() {
    const t = this.ctx.currentTime;
    for (let i = 0; i < 3; i++) this.tone({ freq: 4400 + Math.random() * 200, type: 'sine', t: t + i * 0.06, a: 0.01, d: 0.03, peak: 0.012, bus: 'amb', wet: 0.2 });
  }

  // Called every frame with how close the camera is to noisy features (0..1).
  setProximity(p) {
    this.prox = p;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.falls.gain.setTargetAtTime(p.waterfall * 0.35, t, 0.4);
    this.fire.gain.setTargetAtTime(p.fire * 0.12, t, 0.4);
  }
}

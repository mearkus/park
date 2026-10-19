// Tiny synthesized soundscape: wind, birdsong by day, crickets by night, and UI plucks.
export class Audio {
  constructor() {
    this.ctx = null;
    this.on = false;
    this.night = false;
  }

  ensure() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0;
    this.master.connect(ctx.destination);

    // wind: filtered brown noise with slow swells
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.2;
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.35;
    src.connect(lp).connect(this.windGain).connect(this.master);
    src.start();
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.07;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.18;
    lfo.connect(lfoGain).connect(this.windGain.gain);
    lfo.start();
    this.schedule();
  }

  schedule() {
    const tick = () => {
      if (this.on && this.ctx) {
        if (this.night) this.cricket(); else if (Math.random() < 0.6) this.bird();
      }
      setTimeout(tick, this.night ? 600 + Math.random() * 900 : 1500 + Math.random() * 4000);
    };
    tick();
  }

  bird() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2200 + Math.random() * 1800;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (pan) { pan.pan.value = Math.random() * 1.6 - 0.8; pan.connect(this.master); }
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const st = t + i * (0.09 + Math.random() * 0.06);
      o.type = 'sine';
      o.frequency.setValueAtTime(base * (1 + Math.random() * 0.2), st);
      o.frequency.exponentialRampToValueAtTime(base * (0.75 + Math.random() * 0.6), st + 0.08);
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.035, st + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, st + 0.09);
      o.connect(g).connect(pan || this.master);
      o.start(st);
      o.stop(st + 0.1);
    }
  }

  cricket() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      const st = t + i * 0.06;
      o.frequency.value = 4400 + Math.random() * 200;
      g.gain.setValueAtTime(0, st);
      g.gain.linearRampToValueAtTime(0.012, st + 0.01);
      g.gain.linearRampToValueAtTime(0, st + 0.04);
      o.connect(g).connect(this.master);
      o.start(st);
      o.stop(st + 0.05);
    }
  }

  pluck(freq = 520, vol = 0.12) {
    if (!this.on || !this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.5, t + 0.25);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.32);
  }

  chime() {
    if (!this.on || !this.ctx) return;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => setTimeout(() => this.pluck(f, 0.1), i * 140));
  }

  toggle(force) {
    this.ensure();
    if (!this.ctx) return false;
    this.on = force ?? !this.on;
    this.ctx.resume?.();
    this.master.gain.setTargetAtTime(this.on ? 0.8 : 0, this.ctx.currentTime, 0.4);
    return this.on;
  }
}

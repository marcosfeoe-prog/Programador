// Áudio 100% procedural (Web Audio): tiros, passos, gemidos dos infectados, explosões,
// ambiente de vento e corvos, trilha de tensão que cresce no combate e batimentos com pouca vida.
import { clamp, rand, pick } from './util.js';

const VOICES = {
  groan: { f0: 82, fm: 96, f1: 68, dur: 1.15, gain: 0.5, formants: [[520, 6, 1], [1150, 8, 0.55], [2500, 10, 0.18]] },
  alert: { f0: 150, fm: 215, f1: 118, dur: 0.75, gain: 0.85, formants: [[720, 5, 1], [1260, 7, 0.7], [2650, 9, 0.28]] },
  attack: { f0: 165, fm: 240, f1: 140, dur: 0.5, gain: 0.8, formants: [[760, 5, 1], [1300, 7, 0.7], [2700, 9, 0.3]] },
  pain: { f0: 210, fm: 270, f1: 120, dur: 0.38, gain: 0.75, formants: [[800, 5, 1], [1400, 7, 0.6], [2800, 9, 0.25]] },
  death: { f0: 150, fm: 125, f1: 52, dur: 1.25, gain: 0.75, formants: [[600, 6, 1], [1100, 8, 0.6], [2400, 10, 0.2]] },
  crawler: { f0: 420, fm: 950, f1: 300, dur: 0.6, gain: 0.6, formants: [[1500, 4, 1], [3100, 6, 0.6]] },
  crawlerDie: { f0: 700, fm: 400, f1: 120, dur: 0.9, gain: 0.6, formants: [[1300, 4, 1], [2600, 6, 0.5]] },
  boss: { f0: 52, fm: 68, f1: 40, dur: 2.3, gain: 1.5, formants: [[300, 4, 1], [720, 5, 0.85], [1500, 6, 0.4]] },
  bossPain: { f0: 78, fm: 110, f1: 52, dur: 0.85, gain: 1.2, formants: [[340, 4, 1], [800, 5, 0.8], [1600, 6, 0.35]] },
  bossDeath: { f0: 70, fm: 60, f1: 28, dur: 3.2, gain: 1.6, formants: [[300, 4, 1], [650, 5, 0.85], [1400, 6, 0.4]] },
  hurt: { f0: 120, fm: 150, f1: 95, dur: 0.3, gain: 0.7, formants: [[600, 5, 1], [1100, 7, 0.6], [2500, 9, 0.2]] },
  playerDie: { f0: 130, fm: 115, f1: 70, dur: 1.0, gain: 0.75, formants: [[560, 5, 1], [1000, 7, 0.6], [2400, 9, 0.2]] },
};

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.listener = { x: 0, z: 0, yaw: 0 };
    this.voices = 0;
    this.paused = false;
    this.nextBeat = 0;
    this.beat = 0;
    this.nextHeart = 0;
    this.nextCrow = 8;
    this.nextSting = 5;
    this.nextCreak = 14;
    this._targets = {};
    this.indoor = 0;
  }

  init() {
    if (this.ctx) {
      this.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch (e) {
      this.ctx = null;
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.settings.volume;
    this.master.connect(c.destination);
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.25;
    comp.connect(this.master);
    this.sfx = c.createGain();
    this.sfx.connect(comp);
    this.musicBus = c.createGain();
    this.musicBus.gain.value = this.settings.music * 0.7;
    this.musicBus.connect(comp);
    this.amb = c.createGain();
    this.amb.gain.value = 0.8;
    this.amb.connect(comp);
    this.reverb = c.createConvolver();
    this.reverb.buffer = this.impulse(2.8, 2.6);
    this.revIn = c.createGain();
    this.revIn.gain.value = 0.55;
    this.revIn.connect(this.reverb);
    this.reverb.connect(comp);
    this.noiseBuf = this.makeNoise(2);
    this.brownBuf = this.makeBrown(4);
    this.startAmbience();
    this.startMusic();
    this.resume();
  }

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }

  setVolume(v) {
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05);
  }

  setMusic(v) {
    if (this.musicBus) this.musicBus.gain.setTargetAtTime(v * 0.7, this.ctx.currentTime, 0.1);
  }

  setListener(x, z, yaw) {
    this.listener.x = x;
    this.listener.z = z;
    this.listener.yaw = yaw;
  }

  makeNoise(sec) {
    const c = this.ctx;
    const b = c.createBuffer(1, Math.floor(c.sampleRate * sec), c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }

  makeBrown(sec) {
    const c = this.ctx;
    const b = c.createBuffer(1, Math.floor(c.sampleRate * sec), c.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    return b;
  }

  impulse(sec, decay) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * sec);
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay);
    }
    return b;
  }

  // Saída com volume, pan e abafamento conforme a distância ao ouvinte.
  out(pos, vol = 1, rev = 0.25) {
    const c = this.ctx;
    const g = c.createGain();
    let gain = vol,
      pan = 0,
      cutoff = 20000;
    if (pos) {
      const dx = pos.x - this.listener.x,
        dz = pos.z - this.listener.z;
      const d = Math.sqrt(dx * dx + dz * dz);
      gain = vol / (1 + d * d * 0.012);
      if (d > 0.4) {
        const rx = -Math.cos(this.listener.yaw),
          rz = Math.sin(this.listener.yaw);
        pan = clamp((dx * rx + dz * rz) / d, -1, 1) * 0.75;
      }
      cutoff = 20000 / (1 + d * 0.13);
    }
    g.gain.value = gain;
    let head = g;
    if (cutoff < 15000) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = cutoff;
      g.connect(f);
      head = f;
    }
    if (c.createStereoPanner && Math.abs(pan) > 0.02) {
      const p = c.createStereoPanner();
      p.pan.value = pan;
      head.connect(p);
      head = p;
    }
    head.connect(this.sfx);
    if (rev > 0) {
      const s = c.createGain();
      s.gain.value = rev;
      head.connect(s);
      s.connect(this.revIn);
    }
    return g;
  }

  noise(t, dest, { type = 'bandpass', freq = 1000, q = 1, gain = 1, a = 0.002, rel = 0.2, freqEnd = 0, loop = false } = {}) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.noiseBuf;
    src.loop = loop;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + a + rel);
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + rel);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, loop ? 0 : Math.random() * Math.max(0, 1.9 - a - rel));
    src.stop(t + a + rel + 0.05);
    return src;
  }

  tone(t, dest, { type = 'sine', freq = 440, freqEnd = 0, gain = 0.5, a = 0.004, rel = 0.2, hold = 0 } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + a + hold + rel);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gain, t + a);
    if (hold) g.gain.setValueAtTime(gain, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
    o.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + a + hold + rel + 0.05);
    return o;
  }

  get ok() {
    return !!this.ctx && this.ctx.state !== 'closed';
  }

  // ------------------------------------------------------------ armas
  shot(kind, pos = null) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const big = kind === 'shotgun';
    const o = this.out(pos, big ? 1.2 : 0.9, big ? 0.75 : 0.6);
    this.noise(t, o, { type: 'highpass', freq: big ? 500 : 1000, q: 0.5, gain: 1, a: 0.001, rel: big ? 0.42 : 0.17 });
    this.noise(t, o, { type: 'bandpass', freq: big ? 900 : 2300, q: 0.9, gain: 0.8, a: 0.001, rel: big ? 0.25 : 0.09 });
    this.tone(t, o, { freq: big ? 110 : 165, freqEnd: 36, gain: big ? 1.1 : 0.8, a: 0.001, rel: big ? 0.36 : 0.18 });
    if (big) {
      this.noise(t, o, { type: 'lowpass', freq: 420, gain: 0.7, a: 0.002, rel: 0.7 });
      this.pump(t + 0.45);
    }
  }

  pump(t) {
    if (!this.ok) return;
    t = t || this.ctx.currentTime;
    const o = this.out(null, 0.5, 0.1);
    this.noise(t, o, { type: 'bandpass', freq: 1800, q: 3, gain: 0.7, rel: 0.05 });
    this.noise(t + 0.17, o, { type: 'bandpass', freq: 1300, q: 3, gain: 0.8, rel: 0.06 });
  }

  dry() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.noise(t, this.out(null, 0.5, 0.05), { type: 'bandpass', freq: 3200, q: 4, gain: 0.9, rel: 0.025 });
  }

  click(t, f = 2500, v = 0.5) {
    this.noise(t, this.out(null, v, 0.05), { type: 'bandpass', freq: f, q: 4, gain: 0.9, rel: 0.035 });
  }

  reload(kind) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    if (kind === 'pistol') {
      this.click(t + 0.1, 2200, 0.45);
      this.click(t + 0.75, 1600, 0.6);
      this.click(t + 1.12, 2600, 0.5);
      this.click(t + 1.2, 1900, 0.5);
    } else {
      this.click(t + 0.12, 1500, 0.5);
    }
  }

  casing(pos, shell) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const o = this.out(pos, shell ? 0.18 : 0.22, 0.05);
    if (shell) this.noise(t, o, { type: 'bandpass', freq: 900, q: 3, gain: 0.8, rel: 0.05 });
    else this.tone(t, o, { freq: rand(4200, 5600), freqEnd: rand(3800, 4600), gain: 0.5, a: 0.001, rel: 0.12 });
  }

  whoosh(v = 0.4) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.noise(t, this.out(null, v, 0.05), { type: 'bandpass', freq: 600, freqEnd: 2600, q: 1.5, gain: 0.8, a: 0.04, rel: 0.14 });
  }

  hit(kind, pos) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const o = this.out(pos, 0.6, 0.1);
    if (kind === 'flesh') {
      this.noise(t, o, { type: 'lowpass', freq: 700, gain: 0.9, rel: 0.12 });
      this.tone(t, o, { freq: 220, freqEnd: 90, gain: 0.35, rel: 0.1 });
    } else if (kind === 'head') {
      this.noise(t, o, { type: 'lowpass', freq: 900, gain: 1, rel: 0.16 });
      this.tone(t, o, { freq: 300, freqEnd: 80, gain: 0.45, rel: 0.14 });
      this.noise(t + 0.02, o, { type: 'bandpass', freq: 3000, q: 2, gain: 0.25, rel: 0.08 });
    } else if (kind === 'metal') {
      this.tone(t, o, { freq: rand(1800, 2600), freqEnd: rand(900, 1300), gain: 0.35, rel: 0.25, type: 'triangle' });
      this.noise(t, o, { type: 'bandpass', freq: 4000, q: 2, gain: 0.3, rel: 0.05 });
    } else if (kind === 'wood') {
      this.noise(t, o, { type: 'bandpass', freq: 700, q: 2.5, gain: 0.8, rel: 0.08 });
    } else if (kind === 'water') {
      this.noise(t, o, { type: 'bandpass', freq: 1200, freqEnd: 400, q: 1, gain: 0.4, rel: 0.2 });
    } else {
      this.noise(t, o, { type: 'bandpass', freq: 1500, q: 1.5, gain: 0.5, rel: 0.06 });
    }
  }

  kick(pos) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const o = this.out(pos, 0.9, 0.2);
    this.tone(t, o, { freq: 120, freqEnd: 45, gain: 1, a: 0.002, rel: 0.2 });
    this.noise(t, o, { type: 'lowpass', freq: 900, gain: 0.8, rel: 0.12 });
  }

  // ------------------------------------------------------------ passos e corpo
  step(pos, surface = 'dirt', vol = 0.3) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const o = this.out(pos, vol, 0.06);
    if (surface === 'wood') {
      this.noise(t, o, { type: 'bandpass', freq: 480, q: 2, gain: 0.8, rel: 0.09 });
      this.tone(t, o, { freq: 130, freqEnd: 70, gain: 0.35, rel: 0.08 });
    } else if (surface === 'stone') {
      this.noise(t, o, { type: 'bandpass', freq: 2400, q: 1.2, gain: 0.45, rel: 0.05 });
      this.noise(t, o, { type: 'lowpass', freq: 400, gain: 0.6, rel: 0.06 });
    } else {
      this.noise(t, o, { type: 'lowpass', freq: rand(550, 750), gain: 0.75, rel: 0.1 });
      this.noise(t, o, { type: 'bandpass', freq: 3200, q: 1, gain: 0.12, rel: 0.06 });
    }
  }

  heavyStep(pos, vol = 1) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const o = this.out(pos, vol, 0.3);
    this.tone(t, o, { freq: 70, freqEnd: 30, gain: 1, a: 0.003, rel: 0.35 });
    this.noise(t, o, { type: 'lowpass', freq: 300, gain: 0.8, rel: 0.25 });
  }

  voice(pos, kind = 'groan', pitch = 1) {
    if (!this.ok || this.voices >= 5) return;
    const cfg = VOICES[kind];
    if (!cfg) return;
    const c = this.ctx,
      t = c.currentTime;
    const o = this.out(pos, cfg.gain, 0.4);
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    const f0 = cfg.f0 * pitch * rand(0.9, 1.1);
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.linearRampToValueAtTime(cfg.fm * pitch, t + cfg.dur * 0.4);
    osc.frequency.exponentialRampToValueAtTime(cfg.f1 * pitch, t + cfg.dur);
    const lfo = c.createOscillator();
    lfo.frequency.value = rand(4, 7);
    const lg = c.createGain();
    lg.gain.value = f0 * 0.05;
    lfo.connect(lg);
    lg.connect(osc.frequency);
    const env = c.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(1, t + 0.06);
    env.gain.setValueAtTime(1, t + cfg.dur * 0.7);
    env.gain.exponentialRampToValueAtTime(0.0001, t + cfg.dur);
    for (const [ff, q, gg] of cfg.formants) {
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = ff * rand(0.9, 1.1);
      bp.Q.value = q;
      const gn = c.createGain();
      gn.gain.value = gg * 1.6;
      osc.connect(bp);
      bp.connect(gn);
      gn.connect(env);
    }
    env.connect(o);
    this.noise(t, o, { type: 'bandpass', freq: 1700, q: 1.2, gain: 0.1, a: 0.05, rel: cfg.dur });
    if (kind.startsWith('boss')) this.noise(t, o, { type: 'lowpass', freq: 160, gain: 0.8, a: 0.2, rel: cfg.dur });
    osc.start(t);
    lfo.start(t);
    osc.stop(t + cfg.dur + 0.05);
    lfo.stop(t + cfg.dur + 0.05);
    this.voices++;
    osc.onended = () => {
      this.voices = Math.max(0, this.voices - 1);
    };
  }

  // ------------------------------------------------------------ mundo
  explosion(pos) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const o = this.out(pos, 1.5, 0.9);
    this.tone(t, o, { freq: 85, freqEnd: 22, gain: 1.3, a: 0.003, rel: 0.9 });
    this.noise(t, o, { type: 'lowpass', freq: 1400, freqEnd: 200, gain: 1.1, a: 0.002, rel: 1.4 });
    this.noise(t, o, { type: 'highpass', freq: 2000, gain: 0.5, a: 0.001, rel: 0.25 });
    for (let i = 0; i < 6; i++) this.noise(t + rand(0.1, 0.8), o, { type: 'bandpass', freq: rand(1500, 4000), q: 3, gain: 0.25, rel: 0.04 });
  }

  slam(pos, vol = 1.3) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const o = this.out(pos, vol, 0.8);
    this.tone(t, o, { freq: 60, freqEnd: 24, gain: 1.4, a: 0.002, rel: 0.8 });
    this.noise(t, o, { type: 'lowpass', freq: 800, freqEnd: 120, gain: 1, rel: 0.7 });
    this.tone(t, o, { type: 'triangle', freq: 340, freqEnd: 300, gain: 0.25, rel: 1.4 });
  }

  breakWood(pos) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const o = this.out(pos, 0.8, 0.2);
    for (let i = 0; i < 4; i++) this.noise(t + i * 0.03, o, { type: 'bandpass', freq: rand(500, 1400), q: 2, gain: 0.8, rel: 0.09 });
  }

  fuse(pos) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.noise(t, this.out(pos, 0.5, 0.05), { type: 'highpass', freq: 3000, gain: 0.6, a: 0.02, rel: 0.25 });
  }

  pickup() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const o = this.out(null, 0.32, 0.3);
    this.tone(t, o, { freq: 660, gain: 0.5, rel: 0.25 });
    this.tone(t + 0.07, o, { freq: 990, gain: 0.4, rel: 0.35 });
  }

  keyItem() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const o = this.out(null, 0.35, 0.5);
    [523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.08, o, { freq: f, gain: 0.4, rel: 0.6, type: 'triangle' }));
  }

  heal() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const o = this.out(null, 0.4, 0.1);
    for (let i = 0; i < 3; i++) this.noise(t + i * 0.22, o, { type: 'bandpass', freq: 400, freqEnd: 250, q: 2, gain: 0.6, a: 0.02, rel: 0.12 });
    this.tone(t + 0.7, this.out(null, 0.25, 0.4), { freq: 520, freqEnd: 780, gain: 0.4, rel: 0.5, type: 'triangle' });
  }

  ui(kind = 'move') {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const o = this.out(null, 0.18, 0.05);
    if (kind === 'select') this.tone(t, o, { freq: 520, freqEnd: 700, gain: 0.5, rel: 0.12, type: 'triangle' });
    else if (kind === 'back') this.tone(t, o, { freq: 400, freqEnd: 300, gain: 0.5, rel: 0.1, type: 'triangle' });
    else this.tone(t, o, { freq: 900, gain: 0.25, rel: 0.05, type: 'triangle' });
  }

  hurt() {
    this.voice(null, 'hurt', rand(0.95, 1.05));
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.noise(t, this.out(null, 0.6, 0.05), { type: 'lowpass', freq: 500, gain: 0.8, rel: 0.12 });
  }

  creak(pos, dur = 1.6) {
    if (!this.ok) return;
    const c = this.ctx,
      t = c.currentTime;
    const o = this.out(pos, 0.7, 0.4);
    const osc = c.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(60, t);
    for (let i = 1; i < 8; i++) osc.frequency.linearRampToValueAtTime(rand(45, 110), t + (dur * i) / 8);
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 900;
    bp.Q.value = 6;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.9, t + 0.1);
    g.gain.setValueAtTime(0.9, t + dur * 0.8);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(bp);
    bp.connect(g);
    g.connect(o);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  chain(pos, n = 6, gap = 0.08) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const o = this.out(pos, 0.6, 0.3);
    for (let i = 0; i < n; i++) {
      this.tone(t + i * gap + rand(0, 0.03), o, { type: 'triangle', freq: rand(1800, 3200), freqEnd: rand(1200, 1800), gain: 0.25, rel: 0.12 });
      this.noise(t + i * gap, o, { type: 'bandpass', freq: 4000, q: 3, gain: 0.25, rel: 0.03 });
    }
  }

  ratchet(pos) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    this.noise(t, this.out(pos, 0.5, 0.15), { type: 'bandpass', freq: 2200, q: 5, gain: 0.8, rel: 0.03 });
  }

  rumble(pos, dur = 3) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const o = this.out(pos, 1.0, 0.5);
    const src = this.ctx.createBufferSource();
    src.buffer = this.brownBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 180;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(1.2, t + 0.3);
    g.gain.setValueAtTime(1.2, t + dur - 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(o);
    src.start(t);
    src.stop(t + dur + 0.1);
    this.chain(pos, Math.floor(dur * 6), 0.16);
  }

  sting() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const o = this.out(null, 0.5, 0.9);
    this.tone(t, o, { type: 'sawtooth', freq: 55, gain: 0.5, a: 0.01, rel: 2.2 });
    this.tone(t, o, { type: 'sawtooth', freq: 58.3, gain: 0.4, a: 0.01, rel: 2.2 });
    this.noise(t, o, { type: 'highpass', freq: 3000, gain: 0.4, a: 0.005, rel: 1.2 });
    this.tone(t, o, { type: 'triangle', freq: 1661, freqEnd: 1568, gain: 0.25, a: 0.005, rel: 2.5 });
  }

  // ------------------------------------------------------------ ambiente e trilha
  startAmbience() {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.brownBuf;
    src.loop = true;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    lp.Q.value = 0.7;
    const g = c.createGain();
    g.gain.value = 0.32;
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.09;
    const lg = c.createGain();
    lg.gain.value = 230;
    lfo.connect(lg);
    lg.connect(lp.frequency);
    const lfo2 = c.createOscillator();
    lfo2.frequency.value = 0.053;
    const lg2 = c.createGain();
    lg2.gain.value = 0.14;
    lfo2.connect(lg2);
    lg2.connect(g.gain);
    src.connect(lp);
    lp.connect(g);
    g.connect(this.amb);
    src.start();
    lfo.start();
    lfo2.start();
    this.windGain = g;
  }

  crow() {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const a = Math.random() * Math.PI * 2;
    const pos = { x: this.listener.x + Math.cos(a) * 30, z: this.listener.z + Math.sin(a) * 30 };
    const o = this.out(pos, 2.2, 0.8);
    const n = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const tt = t + i * rand(0.3, 0.42);
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(rand(620, 760), tt);
      osc.frequency.exponentialRampToValueAtTime(rand(380, 460), tt + 0.22);
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1300;
      bp.Q.value = 3;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, tt);
      g.gain.linearRampToValueAtTime(0.8, tt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.24);
      osc.connect(bp);
      bp.connect(g);
      g.connect(o);
      osc.start(tt);
      osc.stop(tt + 0.3);
    }
  }

  startMusic() {
    const c = this.ctx;
    this.drone = c.createGain();
    this.drone.gain.value = 0;
    this.drone.connect(this.musicBus);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 200;
    lp.Q.value = 2;
    lp.connect(this.drone);
    for (const f of [55, 55.7, 82.4]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.value = 0.22;
      o.connect(g);
      g.connect(lp);
      o.start();
    }
    const lfo = c.createOscillator();
    lfo.frequency.value = 0.06;
    const lg = c.createGain();
    lg.gain.value = 90;
    lfo.connect(lg);
    lg.connect(lp.frequency);
    lfo.start();

    this.tension = c.createGain();
    this.tension.gain.value = 0;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1000;
    bp.Q.value = 0.7;
    bp.connect(this.tension);
    this.tension.connect(this.musicBus);
    const send = c.createGain();
    send.gain.value = 0.4;
    this.tension.connect(send);
    send.connect(this.revIn);
    const trem = c.createGain();
    trem.gain.value = 0.5;
    trem.connect(bp);
    const tl = c.createOscillator();
    tl.frequency.value = 7.5;
    const tlg = c.createGain();
    tlg.gain.value = 0.5;
    tl.connect(tlg);
    tlg.connect(trem.gain);
    tl.start();
    for (const f of [220, 233.1, 311.1, 329.6]) {
      const o = c.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.value = 0.16;
      o.connect(g);
      g.connect(trem);
      o.start();
    }
  }

  _target(name, param, value, tc) {
    const last = this._targets[name];
    if (last !== undefined && Math.abs(last - value) < 0.004) return;
    this._targets[name] = value;
    param.setTargetAtTime(value, this.ctx.currentTime, tc);
  }

  drum(t, step, k, boss) {
    const s = step % 16;
    const kick = boss ? [0, 3, 6, 8, 10, 11, 14] : [0, 6, 8, 11];
    const o = this.out(null, 0.55 * k, 0.15);
    if (kick.includes(s)) this.tone(t, o, { freq: 75, freqEnd: 34, gain: 1, a: 0.002, rel: 0.28 });
    if (s === 4 || s === 12) this.noise(t, o, { type: 'bandpass', freq: 260, q: 1.5, gain: boss ? 0.9 : 0.6, rel: 0.2 });
    if (boss && s % 2 === 1) this.noise(t, o, { type: 'highpass', freq: 7000, gain: 0.18, rel: 0.04 });
    if (!boss && (s === 14 || s === 15) && k > 0.6) this.noise(t, o, { type: 'bandpass', freq: 180, q: 2, gain: 0.5, rel: 0.18 });
    if (boss && s === 0 && step % 32 === 0) this.tone(t, o, { type: 'sawtooth', freq: 41.2, gain: 0.5, a: 0.02, rel: 1.6 });
  }

  // intensity 0..1 (inimigos alertas por perto), hpFrac 0..1
  update(dt, intensity, boss, hpFrac, playing) {
    if (!this.ok) return;
    const t = this.ctx.currentTime;
    const p = this.paused || !playing;
    this._target('drone', this.drone.gain, p ? 0.05 : 0.2 + intensity * 0.08, 0.8);
    this._target('tension', this.tension.gain, p ? 0 : clamp(intensity, 0, 1) * 0.085, 0.7);
    this._target('wind', this.amb.gain, p ? 0.3 : 0.8 * (1 - this.indoor * 0.6), 0.6);
    if (!p && intensity > 0.22) {
      const spb = 60 / (boss ? 132 : 96);
      if (this.nextBeat < t) this.nextBeat = t + 0.05;
      while (this.nextBeat < t + 0.2) {
        this.drum(this.nextBeat, this.beat, Math.min(1, intensity), boss);
        this.nextBeat += spb / 2;
        this.beat++;
      }
    } else {
      this.nextBeat = 0;
    }
    if (p) return;
    // batimentos com pouca vida
    if (hpFrac < 0.35) {
      if (this.nextHeart < t) this.nextHeart = t + 0.05;
      if (this.nextHeart < t + 0.2) {
        const k = 1 - hpFrac / 0.35;
        const o = this.out(null, 0.4 + k * 0.5, 0);
        this.tone(this.nextHeart, o, { freq: 62, freqEnd: 40, gain: 1, a: 0.005, rel: 0.14 });
        this.tone(this.nextHeart + 0.2, o, { freq: 58, freqEnd: 38, gain: 0.7, a: 0.005, rel: 0.16 });
        this.nextHeart += hpFrac < 0.15 ? 0.6 : 0.85;
      }
    }
    this.nextCrow -= dt;
    if (this.nextCrow <= 0) {
      this.nextCrow = rand(14, 34);
      if (this.indoor < 0.5) this.crow();
    }
    this.nextSting -= dt;
    if (this.nextSting <= 0) {
      this.nextSting = rand(7, 16);
      const notes = [440, 466.2, 523.3, 622.3, 659.3, 880, 932.3];
      const o = this.out(null, 0.12 * (1 - intensity * 0.5), 1.2);
      const f = pick(notes) * (Math.random() < 0.5 ? 0.5 : 1);
      this.tone(t, o, { type: 'sine', freq: f, gain: 0.6, a: 1.2, hold: 0.6, rel: 2.5 });
      this.tone(t, o, { type: 'triangle', freq: f * 1.005, gain: 0.3, a: 1.4, hold: 0.4, rel: 2.5 });
    }
    this.nextCreak -= dt;
    if (this.nextCreak <= 0) {
      this.nextCreak = rand(20, 45);
      const a = Math.random() * Math.PI * 2;
      this.creak({ x: this.listener.x + Math.cos(a) * 18, z: this.listener.z + Math.sin(a) * 18 }, rand(0.8, 1.6));
    }
  }
}

// Áudio procedural (Web Audio): zumbido das lâmpadas, reverberação da sala,
// passos por tipo de piso, vozes espaciais das criaturas, música de perseguição,
// batimentos e efeitos. Nenhum arquivo de som.
import { clamp } from './util.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.vol = 0.8;
    this.voices = new Set();
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this.vol;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    this.verb = ctx.createConvolver();
    this.verbGain = ctx.createGain();
    this.verbGain.gain.value = 0.35;
    this.verb.connect(this.verbGain).connect(this.master);
    this.bus = ctx.createGain(); // entrada comum (seco + envio para reverberação)
    this.bus.connect(this.dry);
    this.send = ctx.createGain();
    this.send.gain.value = 0.5;
    this.bus.connect(this.send).connect(this.verb);
    this.noiseBuf = this.makeNoise(2);
    this.brownBuf = this.makeNoise(4, true);
    this.setRoom(1.6, 0.35);
    this.buildAmbience();
  }

  setVolume(v) {
    this.vol = v;
    if (this.master) this.master.gain.value = v;
  }

  makeNoise(sec, brown = false) {
    const ctx = this.ctx;
    const b = ctx.createBuffer(1, ctx.sampleRate * sec, ctx.sampleRate);
    const d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return b;
  }

  setRoom(seconds, wet) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const len = Math.floor(ctx.sampleRate * seconds);
    const b = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < len; i++) {
        const t = i / len;
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t, 3.2) * (i < 200 ? i / 200 : 1);
      }
    }
    this.verb.buffer = b;
    this.verbGain.gain.value = wet;
  }

  noiseSrc(loop = true, brown = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = brown ? this.brownBuf : this.noiseBuf;
    s.loop = loop;
    if (!loop) s.loopStart = 0;
    return s;
  }

  // -------------------------------------------------------------- ambiente --
  buildAmbience() {
    const ctx = this.ctx;
    // zumbido das fluorescentes (120 Hz + harmônicos + chiado do reator)
    this.hum = ctx.createGain();
    this.hum.gain.value = 0;
    this.hum.connect(this.bus);
    const freqs = [
      [120, 'sine', 0.5],
      [240, 'triangle', 0.18],
      [360, 'sawtooth', 0.025],
      [480, 'sine', 0.05],
    ];
    for (const [f, type, g] of freqs) {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const gg = ctx.createGain();
      gg.gain.value = g;
      o.connect(gg).connect(this.hum);
      o.start();
    }
    const n = this.noiseSrc();
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 3200;
    bp.Q.value = 3;
    const ng = ctx.createGain();
    ng.gain.value = 0.06;
    n.connect(bp).connect(ng).connect(this.hum);
    n.start();
    // ruído grave de fundo
    this.drone = ctx.createGain();
    this.drone.gain.value = 0.0;
    const b = this.noiseSrc(true, true);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 180;
    b.connect(lp).connect(this.drone).connect(this.bus);
    b.start();
    // música de perseguição: dois serrotes graves desafinados e um agudo dissonante
    this.chase = ctx.createGain();
    this.chase.gain.value = 0;
    this.chase.connect(this.master);
    const clp = ctx.createBiquadFilter();
    clp.type = 'lowpass';
    clp.frequency.value = 420;
    clp.connect(this.chase);
    for (const f of [55, 55.7, 82.4]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      const g = ctx.createGain();
      g.gain.value = 0.12;
      o.connect(g).connect(clp);
      o.start();
    }
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 2.2;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 260;
    lfo.connect(lfoG).connect(clp.frequency);
    lfo.start();
    const hi = ctx.createGain();
    hi.gain.value = 0.025;
    hi.connect(this.chase);
    for (const f of [880, 932.3]) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      o.connect(hi);
      o.start();
    }
    this.heartT = 0;
    this.musicT = 0;
  }

  setLevel(kind) {
    this.kind = kind;
    if (!this.ctx) return;
    if (kind === 'l1') this.setRoom(3.2, 0.55);
    else if (kind === 'fun') this.setRoom(1.4, 0.3);
    else this.setRoom(1.7, 0.38);
    this.drone.gain.value = kind === 'l1' ? 0.05 : 0.025;
    this.dripT = 2;
  }

  update(dt, s) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const humTarget = clamp(s.light * 0.05, 0, 0.06) * (this.kind === 'fun' ? 0.5 : 1);
    this.hum.gain.setTargetAtTime(humTarget, t, 0.15);
    this.chase.gain.setTargetAtTime(clamp(s.chase, 0, 1) * 0.5, t, s.chase > 0.1 ? 0.3 : 1.2);
    // batimentos
    if (s.heart > 0.05) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = 1.1 - s.heart * 0.6;
        this.thump(0.5 * s.heart, 0);
        this.thump(0.35 * s.heart, 0.22);
      }
    }
    // pingos (nível 1)
    if (this.kind === 'l1') {
      this.dripT -= dt;
      if (this.dripT <= 0) {
        this.dripT = 0.6 + Math.random() * 3;
        this.drip();
      }
    }
    // música da festa ao longe
    if (this.kind === 'fun') {
      this.musicT -= dt;
      if (this.musicT <= 0) this.musicT = this.partyPhrase(s.music ?? 0.5);
    }
    for (const v of this.voices) v.update && v.update(dt);
  }

  setListener(cam) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const e = cam.matrixWorld.elements;
    const fx = -e[8], fy = -e[9], fz = -e[10];
    const ux = e[4], uy = e[5], uz = e[6];
    const p = cam.position;
    if (l.positionX) {
      const t = this.ctx.currentTime;
      l.positionX.setValueAtTime(p.x, t);
      l.positionY.setValueAtTime(p.y, t);
      l.positionZ.setValueAtTime(p.z, t);
      l.forwardX.setValueAtTime(fx, t);
      l.forwardY.setValueAtTime(fy, t);
      l.forwardZ.setValueAtTime(fz, t);
      l.upX.setValueAtTime(ux, t);
      l.upY.setValueAtTime(uy, t);
      l.upZ.setValueAtTime(uz, t);
    } else {
      l.setPosition(p.x, p.y, p.z);
      l.setOrientation(fx, fy, fz, ux, uy, uz);
    }
  }

  panner(x, y, z, ref = 1.5, roll = 1.4) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = roll;
    p.maxDistance = 60;
    this.setPos(p, x, y, z);
    p.connect(this.bus);
    return p;
  }
  setPos(p, x, y, z) {
    if (p.positionX) {
      const t = this.ctx.currentTime;
      p.positionX.setTargetAtTime(x, t, 0.03);
      p.positionY.setTargetAtTime(y, t, 0.03);
      p.positionZ.setTargetAtTime(z, t, 0.03);
    } else p.setPosition(x, y, z);
  }

  // ------------------------------------------------------------ one-shots --
  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  burst({ dur = 0.08, type = 'lowpass', f = 1000, q = 0.8, gain = 0.3, at = 0, out = null, attack = 0.004, rate = 1 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const s = this.noiseSrc(false);
    s.playbackRate.value = rate;
    const fl = ctx.createBiquadFilter();
    fl.type = type;
    fl.frequency.value = f;
    fl.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, attack, gain, dur);
    s.connect(fl).connect(g).connect(out || this.bus);
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + attack + 0.05);
  }

  tone({ f = 440, f2 = null, type = 'sine', dur = 0.2, gain = 0.2, at = 0, out = null, attack = 0.005 }) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + at;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain();
    this.env(g, t, attack, gain, dur);
    o.connect(g).connect(out || this.bus);
    o.start(t);
    o.stop(t + dur + attack + 0.05);
  }

  step(surface, loud = 0.5) {
    const v = 0.5 + loud * 0.7;
    if (surface === 'carpet') {
      this.burst({ dur: 0.07, f: 700 + Math.random() * 300, gain: 0.12 * v });
      this.tone({ f: 85, f2: 50, dur: 0.07, gain: 0.12 * v });
    } else if (surface === 'wet') {
      this.burst({ dur: 0.06, f: 900, gain: 0.1 * v });
      this.burst({ dur: 0.16, type: 'bandpass', f: 1800 + Math.random() * 900, q: 1.5, gain: 0.12 * v, at: 0.01, rate: 0.8 });
    } else {
      this.burst({ dur: 0.045, type: 'bandpass', f: 2200 + Math.random() * 800, q: 1.2, gain: 0.16 * v });
      this.tone({ f: 120, f2: 60, dur: 0.05, gain: 0.1 * v });
    }
  }
  click() {
    this.burst({ dur: 0.02, type: 'highpass', f: 3000, gain: 0.25 });
    this.tone({ f: 1900, dur: 0.02, gain: 0.05, type: 'square' });
  }
  rattle() {
    for (let i = 0; i < 6; i++) this.burst({ dur: 0.03, type: 'bandpass', f: 2500 + i * 300, q: 3, gain: 0.12, at: i * 0.09 });
  }
  jump() {
    this.burst({ dur: 0.06, f: 600, gain: 0.08 });
  }
  pickup() {
    this.burst({ dur: 0.06, type: 'bandpass', f: 1500, q: 1, gain: 0.15 });
    this.tone({ f: 660, f2: 990, dur: 0.12, gain: 0.05, at: 0.03 });
  }
  drink() {
    for (let i = 0; i < 4; i++) this.burst({ dur: 0.09, type: 'bandpass', f: 500 + Math.random() * 300, q: 4, gain: 0.18, at: i * 0.28 });
  }
  paper() {
    for (let i = 0; i < 3; i++) this.burst({ dur: 0.08, type: 'highpass', f: 2500, gain: 0.12, at: i * 0.07 });
  }
  beep(ok = true) {
    this.tone({ f: ok ? 1320 : 330, dur: ok ? 0.07 : 0.25, gain: 0.08, type: 'square' });
  }
  success() {
    [880, 1100, 1320].forEach((f, i) => this.tone({ f, dur: 0.12, gain: 0.07, type: 'square', at: i * 0.1 }));
  }
  locked() {
    this.burst({ dur: 0.08, type: 'bandpass', f: 900, q: 4, gain: 0.3 });
    this.burst({ dur: 0.08, type: 'bandpass', f: 700, q: 4, gain: 0.25, at: 0.12 });
  }
  clank(x, y, z) {
    if (!this.ctx) return;
    const out = x !== undefined ? this.panner(x, y, z, 2) : null;
    this.burst({ dur: 0.4, type: 'bandpass', f: 600, q: 6, gain: 0.5, out });
    this.tone({ f: 210, f2: 180, dur: 0.6, gain: 0.15, type: 'triangle', out });
    this.tone({ f: 523, dur: 0.5, gain: 0.05, type: 'sine', out, at: 0.01 });
  }
  door(x, y, z) {
    if (!this.ctx) return;
    const out = x !== undefined ? this.panner(x, y, z, 2) : null;
    this.tone({ f: 160, f2: 110, dur: 0.9, gain: 0.12, type: 'sawtooth', out });
    this.burst({ dur: 0.8, type: 'bandpass', f: 1400, q: 8, gain: 0.08, out, attack: 0.2 });
    this.clank(x, y, z);
  }
  lever() {
    this.burst({ dur: 0.12, type: 'bandpass', f: 800, q: 5, gain: 0.4 });
    this.tone({ f: 90, dur: 0.3, gain: 0.3, type: 'triangle', at: 0.1 });
  }
  powerDown() {
    this.tone({ f: 120, f2: 30, dur: 1.6, gain: 0.25, type: 'sawtooth' });
    this.burst({ dur: 0.3, f: 300, gain: 0.4 });
  }
  powerUp() {
    this.tone({ f: 40, f2: 120, dur: 1.4, gain: 0.2, type: 'sawtooth' });
    for (let i = 0; i < 5; i++) this.burst({ dur: 0.03, type: 'highpass', f: 2000, gain: 0.2, at: 0.3 + i * 0.12 });
  }
  buzz(x, y, z, strength = 1) {
    if (!this.ctx) return;
    const out = this.panner(x, y, z, 2, 1.6);
    this.burst({ dur: 0.05 + Math.random() * 0.08, type: 'bandpass', f: 3000, q: 2, gain: 0.25 * strength, out });
    this.tone({ f: 120, dur: 0.1, gain: 0.12 * strength, type: 'sawtooth', out });
  }
  hurt() {
    this.burst({ dur: 0.25, f: 500, gain: 0.5 });
    this.tone({ f: 180, f2: 90, dur: 0.3, gain: 0.25, type: 'sawtooth' });
  }
  thump(gain, at) {
    this.tone({ f: 55, f2: 38, dur: 0.12, gain, at, out: this.master });
  }
  stinger() {
    if (!this.ctx) return;
    [196, 207.6, 293.7, 311.1].forEach((f) => this.tone({ f, dur: 1.6, gain: 0.08, type: 'sawtooth', out: this.master, attack: 0.01 }));
    this.burst({ dur: 0.9, type: 'highpass', f: 2500, gain: 0.25, out: this.master });
  }
  jumpscare() {
    if (!this.ctx) return;
    this.burst({ dur: 1.0, f: 4000, gain: 0.9, out: this.master, attack: 0.002 });
    [130, 138, 185, 277].forEach((f) => this.tone({ f, f2: f * 0.7, dur: 1.2, gain: 0.18, type: 'sawtooth', out: this.master }));
  }
  scream(x, y, z) {
    if (!this.ctx) return;
    const out = this.panner(x, y, z, 3, 1.1);
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(260, t);
    o.frequency.exponentialRampToValueAtTime(780, t + 0.35);
    o.frequency.exponentialRampToValueAtTime(420, t + 1.3);
    const sh = ctx.createWaveShaper();
    sh.curve = distCurve(40);
    const f1 = ctx.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 1100;
    f1.Q.value = 2;
    const g = ctx.createGain();
    this.env(g, t, 0.05, 0.5, 1.3);
    o.connect(sh).connect(f1).connect(g).connect(out);
    o.start(t);
    o.stop(t + 1.5);
    this.burst({ dur: 1.2, type: 'bandpass', f: 2500, q: 1, gain: 0.3, out });
  }
  skitter(x, y, z, loud = 1) {
    if (!this.ctx) return;
    const out = this.panner(x, y, z, 1.2, 1.5);
    this.burst({ dur: 0.03, type: 'highpass', f: 2200 + Math.random() * 1500, gain: 0.25 * loud, out });
    if (Math.random() < 0.5) this.burst({ dur: 0.05, f: 500, gain: 0.15 * loud, out, at: 0.02 });
  }
  squeak(x, y, z) {
    if (!this.ctx) return;
    const out = this.panner(x, y, z, 1.5, 1.4);
    this.tone({ f: 900 + Math.random() * 500, f2: 1300 + Math.random() * 300, dur: 0.07, gain: 0.08, type: 'sine', out });
  }
  giggle(x, y, z, loud = 1) {
    if (!this.ctx) return;
    const out = this.panner(x, y, z, 2, 1.2);
    const base = 280 + Math.random() * 120;
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      this.tone({ f: base * (1.2 - i * 0.04), f2: base * 0.9, dur: 0.11, gain: 0.12 * loud, type: 'sawtooth', at: i * 0.15, out });
      this.burst({ dur: 0.08, type: 'bandpass', f: 1400, q: 3, gain: 0.08 * loud, at: i * 0.15, out });
    }
  }
  pop(x, y, z) {
    if (!this.ctx) return;
    const out = this.panner(x, y, z, 3, 1.1);
    this.burst({ dur: 0.08, type: 'highpass', f: 600, gain: 0.9, out, attack: 0.001 });
    this.tone({ f: 140, f2: 60, dur: 0.12, gain: 0.3, out });
  }
  drip() {
    if (!this.ctx) return;
    const x = (Math.random() - 0.5) * 30, z = (Math.random() - 0.5) * 30;
    const p = this.ctx.listener;
    const lx = p.positionX ? p.positionX.value : 0, lz = p.positionZ ? p.positionZ.value : 0;
    const out = this.panner(lx + x, 3, lz + z, 2, 1.2);
    const f = 1200 + Math.random() * 1400;
    this.tone({ f, f2: f * 1.6, dur: 0.06, gain: 0.08, out });
  }
  whisper(x, y, z, loud = 1) {
    if (!this.ctx) return;
    const out = this.panner(x, y, z, 1.5, 1.6);
    for (let i = 0; i < 5; i++) this.burst({ dur: 0.12 + Math.random() * 0.2, type: 'bandpass', f: 1800 + Math.random() * 2500, q: 4, gain: 0.07 * loud, at: i * 0.18 + Math.random() * 0.1, out, attack: 0.05 });
  }
  // frase de caixinha de música desafinada (Nível Fun)
  partyPhrase(level) {
    if (!this.ctx) return 5;
    const notes = [0, 4, 7, 12, 7, 4, 2, 5, 9, 5, 2, -1, 0];
    const root = 392 * (Math.random() < 0.3 ? 0.94 : 1);
    const ctx = this.ctx;
    const out = ctx.createGain();
    out.gain.value = 0.035 * level;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1400;
    out.connect(lp).connect(this.bus);
    notes.forEach((n, i) => {
      const f = root * Math.pow(2, n / 12) * (1 + (Math.random() - 0.5) * 0.012);
      this.tone({ f, dur: 0.5, gain: 0.5, at: i * 0.32, out, type: 'triangle' });
      this.tone({ f: f * 2.01, dur: 0.25, gain: 0.12, at: i * 0.32, out });
    });
    return notes.length * 0.32 + 4 + Math.random() * 8;
  }
  elevator() {
    this.tone({ f: 70, dur: 3, gain: 0.25, type: 'sawtooth', attack: 0.5 });
    this.tone({ f: 1046, dur: 0.6, gain: 0.08, at: 3.2 });
  }

  // voz contínua espacial (criaturas)
  voice(kind) {
    if (!this.ctx) return null;
    const ctx = this.ctx;
    const pan = this.panner(0, 0, 0, 1.6, 1.3);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.connect(pan);
    const nodes = [];
    if (kind === 'hound') {
      // respiração rouca
      const n = this.noiseSrc();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 650;
      bp.Q.value = 1.2;
      const am = ctx.createGain();
      am.gain.value = 0.5;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.7;
      const lg = ctx.createGain();
      lg.gain.value = 0.5;
      lfo.connect(lg).connect(am.gain);
      n.connect(bp).connect(am).connect(g);
      // rosnado
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 62;
      const sh = ctx.createWaveShaper();
      sh.curve = distCurve(20);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 380;
      const gg = ctx.createGain();
      gg.gain.value = 0;
      o.connect(sh).connect(lp).connect(gg).connect(g);
      n.start();
      lfo.start();
      o.start();
      nodes.push(n, lfo, o);
      return this.wrap(pan, g, nodes, { growl: gg, lfo, osc: o });
    }
    if (kind === 'smiler') {
      const o = ctx.createOscillator();
      o.frequency.value = 3150;
      const trem = ctx.createOscillator();
      trem.frequency.value = 7;
      const tg = ctx.createGain();
      tg.gain.value = 0.5;
      const og = ctx.createGain();
      og.gain.value = 0.04;
      trem.connect(tg).connect(og.gain);
      o.connect(og).connect(g);
      const n = this.noiseSrc();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 160;
      bp.Q.value = 3;
      const ng = ctx.createGain();
      ng.gain.value = 0.6;
      n.connect(bp).connect(ng).connect(g);
      o.start();
      trem.start();
      n.start();
      nodes.push(o, trem, n);
      return this.wrap(pan, g, nodes, {});
    }
    // festeiro: zumbido abafado de festa
    const n = this.noiseSrc(true, true);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 300;
    bp.Q.value = 2;
    n.connect(bp).connect(g);
    n.start();
    nodes.push(n);
    return this.wrap(pan, g, nodes, {});
  }
  wrap(pan, g, nodes, extra) {
    const self = this;
    const v = {
      ...extra,
      pan,
      g,
      set(x, y, z, level) {
        self.setPos(pan, x, y, z);
        g.gain.setTargetAtTime(level, self.ctx.currentTime, 0.1);
      },
      stop() {
        g.gain.setTargetAtTime(0, self.ctx.currentTime, 0.1);
        setTimeout(() => nodes.forEach((n) => n.stop()), 600);
        self.voices.delete(v);
      },
    };
    this.voices.add(v);
    return v;
  }
  stopVoices() {
    for (const v of [...this.voices]) v.stop();
  }
}

function distCurve(k) {
  const n = 1024;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / n) * 2 - 1;
    c[i] = ((3 + k) * x * 20 * (Math.PI / 180)) / (Math.PI + k * Math.abs(x));
  }
  return c;
}

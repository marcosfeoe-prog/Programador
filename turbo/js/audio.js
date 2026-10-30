// Áudio procedural (Web Audio): motor com marchas, vento, efeitos e uma
// trilha simples por mundo gerada por um sequenciador.

const CHORDS = [
  // graus em semitons a partir da tônica, uma progressão por mundo
  [[0, 4, 7], [5, 9, 12], [7, 11, 14], [9, 12, 16]],
  [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]],
  [[0, 3, 7], [5, 8, 12], [10, 14, 17], [7, 10, 14]],
  [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]],
  [[0, 3, 7], [1, 5, 8], [0, 3, 7], [10, 13, 17]],
  [[0, 4, 7], [4, 7, 11], [9, 12, 16], [5, 9, 12]],
];
const ROOTS = [48, 45, 50, 52, 43, 47];
const TEMPO = [132, 120, 126, 116, 140, 124];

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioFX {
  constructor() {
    this.ctx = null;
    this.sound = 0.8;
    this.musicVol = 0.5;
    this.engine = null;
  }

  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    const c = this.ctx;
    this.master = c.createGain();
    this.master.connect(c.destination);
    this.sfx = c.createGain();
    this.sfx.gain.value = this.sound;
    this.sfx.connect(this.master);
    this.mus = c.createGain();
    this.mus.gain.value = this.musicVol * 0.5;
    this.mus.connect(this.master);
    // ruído compartilhado
    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setVolumes(sound, music) {
    this.sound = sound;
    this.musicVol = music;
    if (!this.ctx) return;
    this.sfx.gain.setTargetAtTime(sound, this.ctx.currentTime, 0.05);
    this.mus.gain.setTargetAtTime(music * 0.5, this.ctx.currentTime, 0.05);
  }

  // ------------------------------------------------------------- motor
  engineStart() {
    if (!this.ctx || this.engine) return;
    const c = this.ctx;
    const e = {};
    e.o1 = c.createOscillator();
    e.o1.type = 'sawtooth';
    e.o2 = c.createOscillator();
    e.o2.type = 'square';
    e.f = c.createBiquadFilter();
    e.f.type = 'lowpass';
    e.f.Q.value = 4;
    e.g = c.createGain();
    e.g.gain.value = 0;
    const g2 = c.createGain();
    g2.gain.value = 0.45;
    e.o1.connect(e.f);
    e.o2.connect(g2).connect(e.f);
    e.f.connect(e.g).connect(this.sfx);
    e.wind = c.createBufferSource();
    e.wind.buffer = this.noise;
    e.wind.loop = true;
    e.wf = c.createBiquadFilter();
    e.wf.type = 'bandpass';
    e.wf.frequency.value = 900;
    e.wg = c.createGain();
    e.wg.gain.value = 0;
    e.wind.connect(e.wf).connect(e.wg).connect(this.sfx);
    e.scr = c.createBufferSource();
    e.scr.buffer = this.noise;
    e.scr.loop = true;
    const sf = c.createBiquadFilter();
    sf.type = 'highpass';
    sf.frequency.value = 2500;
    e.sg = c.createGain();
    e.sg.gain.value = 0;
    e.scr.connect(sf).connect(e.sg).connect(this.sfx);
    for (const o of [e.o1, e.o2, e.wind, e.scr]) o.start();
    this.engine = e;
  }

  engineUpdate(speed, vmax, throttle, boost, scraping, air) {
    const e = this.engine;
    if (!e) return;
    const t = this.ctx.currentTime;
    const r = Math.min(1.3, speed / Math.max(1, vmax));
    // marchas: rpm sobe dentro de cada faixa de velocidade
    const gears = [0, 0.18, 0.36, 0.56, 0.78, 1.4];
    let g = 0;
    while (g < gears.length - 2 && r > gears[g + 1]) g++;
    const inGear = (r - gears[g]) / (gears[g + 1] - gears[g]);
    let rpm = 0.3 + inGear * 0.7;
    if (air) rpm = Math.min(1.1, rpm + 0.25);
    const f = 48 + rpm * 110 + g * 6;
    e.o1.frequency.setTargetAtTime(f, t, 0.04);
    e.o2.frequency.setTargetAtTime(f * 0.5, t, 0.04);
    e.f.frequency.setTargetAtTime(380 + rpm * 1400 * (0.5 + throttle * 0.5) + boost * 900, t, 0.05);
    e.g.gain.setTargetAtTime(0.05 + throttle * 0.07 + boost * 0.04, t, 0.08);
    e.wg.gain.setTargetAtTime(Math.min(0.22, r * r * 0.16 + boost * 0.08), t, 0.1);
    e.wf.frequency.setTargetAtTime(600 + r * 900, t, 0.1);
    e.sg.gain.setTargetAtTime(scraping ? 0.12 : 0, t, 0.03);
  }

  engineStop() {
    const e = this.engine;
    if (!e) return;
    const t = this.ctx.currentTime;
    for (const g of [e.g, e.wg, e.sg]) g.gain.setTargetAtTime(0, t, 0.05);
    const stopAt = t + 0.4;
    for (const o of [e.o1, e.o2, e.wind, e.scr]) o.stop(stopAt);
    this.engine = null;
  }

  // ----------------------------------------------------------- efeitos
  tone(type, f0, f1, dur, vol, delay = 0) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.sfx);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  burst(dur, vol, type = 'lowpass', freq = 800, delay = 0, q = 1) {
    const c = this.ctx;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f).connect(g).connect(this.sfx);
    s.start(t, Math.random());
    s.stop(t + dur + 0.02);
  }

  play(name, power = 1) {
    if (!this.ctx) return;
    switch (name) {
      case 'coin':
        this.tone('square', 1320, 1320, 0.06, 0.06);
        this.tone('square', 1760, 1760, 0.12, 0.06, 0.06);
        break;
      case 'boost':
        this.burst(0.7, 0.3, 'bandpass', 1400, 0, 0.8);
        this.tone('sawtooth', 200, 900, 0.5, 0.06);
        break;
      case 'nitro':
        this.burst(0.5, 0.25, 'bandpass', 2200, 0, 0.6);
        break;
      case 'hit':
        this.burst(0.35, Math.min(0.6, 0.2 + power * 0.02), 'lowpass', 500);
        this.tone('square', 140, 50, 0.25, 0.12);
        break;
      case 'bump':
        this.burst(0.18, Math.min(0.35, 0.08 + power * 0.02), 'lowpass', 700);
        break;
      case 'crate':
        this.burst(0.25, 0.3, 'bandpass', 900, 0, 2);
        this.burst(0.15, 0.2, 'highpass', 2000, 0.05);
        break;
      case 'land':
        this.burst(0.3, Math.min(0.5, 0.1 + power * 0.015), 'lowpass', 300);
        this.tone('sine', 90, 40, 0.25, Math.min(0.4, 0.05 + power * 0.012));
        break;
      case 'jump':
        this.burst(0.5, 0.12, 'bandpass', 600, 0, 0.5);
        break;
      case 'fall':
        this.tone('sawtooth', 600, 80, 1.0, 0.08);
        break;
      case 'beep':
        this.tone('square', 660, 660, 0.25, 0.12);
        break;
      case 'go':
        this.tone('square', 1320, 1320, 0.5, 0.14);
        break;
      case 'click':
        this.tone('triangle', 900, 700, 0.06, 0.12);
        break;
      case 'buy':
        [0, 4, 7, 12].forEach((s, i) => this.tone('square', mtof(72 + s), mtof(72 + s), 0.12, 0.07, i * 0.07));
        break;
      case 'error':
        this.tone('square', 220, 160, 0.25, 0.08);
        break;
      case 'win':
        [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => this.tone('square', mtof(67 + s), mtof(67 + s), 0.18, 0.06, i * 0.09));
        break;
      case 'finish':
        [0, 7, 12].forEach((s, i) => this.tone('triangle', mtof(64 + s), mtof(64 + s), 0.3, 0.1, i * 0.12));
        break;
      case 'whoosh':
        this.burst(0.35, 0.15, 'bandpass', 1200, 0, 1.5);
        break;
    }
  }

  // ------------------------------------------------------------ música
  musicStart(world) {
    if (!this.ctx) return;
    this.musicStop();
    const c = this.ctx;
    const tempo = TEMPO[world % 6];
    const step = 60 / tempo / 4; // semicolcheia
    const chords = CHORDS[world % 6];
    const root = ROOTS[world % 6];
    let n = 0;
    let next = c.currentTime + 0.1;
    const out = c.createGain();
    out.gain.value = 1;
    out.connect(this.mus);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    lp.connect(out);
    const note = (type, m, t, dur, vol, dest = lp) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = mtof(m);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + dur + 0.02);
    };
    const drum = (kind, t) => {
      if (kind === 'k') {
        const o = c.createOscillator();
        o.frequency.setValueAtTime(140, t);
        o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
        const g = c.createGain();
        g.gain.setValueAtTime(0.5, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
        o.connect(g).connect(out);
        o.start(t);
        o.stop(t + 0.22);
      } else {
        const s = c.createBufferSource();
        s.buffer = this.noise;
        const f = c.createBiquadFilter();
        f.type = kind === 'h' ? 'highpass' : 'bandpass';
        f.frequency.value = kind === 'h' ? 7000 : 1800;
        const g = c.createGain();
        const d = kind === 'h' ? 0.04 : 0.14;
        g.gain.setValueAtTime(kind === 'h' ? 0.08 : 0.22, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + d);
        s.connect(f).connect(g).connect(out);
        s.start(t, Math.random());
        s.stop(t + d + 0.02);
      }
    };
    const tick = () => {
      while (next < c.currentTime + 0.15) {
        const bar = Math.floor(n / 16);
        const st = n % 16;
        const ch = chords[bar % chords.length];
        if (st % 4 === 0) drum('k', next);
        if (st === 4 || st === 12) drum('s', next);
        if (st % 2 === 0) drum('h', next);
        if (st % 2 === 0) note('sawtooth', root - 12 + ch[0] + (st % 8 === 6 ? 12 : 0), next, step * 1.6, 0.09);
        const arp = [0, 1, 2, 1, 2, 0, 1, 2];
        if (bar % 8 >= 2) note('square', root + 12 + ch[arp[st % 8]] + (st >= 8 ? 12 : 0), next, step * 0.9, 0.035);
        if (st === 0) for (const k of ch) note('triangle', root + k, next, step * 15, 0.03);
        next += step;
        n++;
      }
    };
    this.musicTimer = setInterval(tick, 40);
    tick();
    this.musicOut = out;
  }

  musicStop() {
    if (this.musicTimer) clearInterval(this.musicTimer);
    this.musicTimer = null;
    if (this.musicOut && this.ctx) {
      const o = this.musicOut;
      o.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1);
      setTimeout(() => o.disconnect(), 600);
    }
    this.musicOut = null;
  }
}

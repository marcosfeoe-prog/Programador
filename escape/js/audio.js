// Sons procedurais com Web Audio: zumbido das lâmpadas, ambiências, passos,
// rosnados das entidades, batimentos cardíacos e o grito do susto.

export class Audio {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.ambience = null;
    this.loops = new Map();
  }

  // O contexto só pode nascer depois de um gesto do usuário.
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.volume;
      this.comp = this.ctx.createDynamicsCompressor();
      this.master.connect(this.comp).connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.brown = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const b = this.brown.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
        b[i] = last * 3.5;
      }
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  get t() {
    return this.ctx.currentTime;
  }

  src(buffer, loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = loop;
    return s;
  }

  env(gain, a, peak, d, t0 = this.t) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(peak, t0 + a);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }

  // Saída com volume e posição estéreo opcionais.
  out(vol = 1, pan = 0) {
    const g = this.ctx.createGain();
    g.gain.value = vol;
    if (pan && this.ctx.createStereoPanner) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan));
      g.connect(p).connect(this.master);
    } else g.connect(this.master);
    return g;
  }

  // ---------- Ambiências contínuas ----------

  setAmbience(kind) {
    if (!this.ctx) return;
    if (this.ambience) {
      const old = this.ambience;
      old.gain.gain.setTargetAtTime(0.0001, this.t, 0.4);
      setTimeout(() => old.nodes.forEach((n) => n.stop && n.stop()), 2000);
    }
    this.ambience = null;
    if (!kind) return;
    const gain = this.ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(1, this.t, 0.8);
    gain.connect(this.master);
    const nodes = [];
    const osc = (type, f, v, filt) => {
      const o = this.ctx.createOscillator();
      o.type = type;
      o.frequency.value = f;
      const g = this.ctx.createGain();
      g.gain.value = v;
      if (filt) {
        const bq = this.ctx.createBiquadFilter();
        bq.type = filt[0];
        bq.frequency.value = filt[1];
        bq.Q.value = filt[2] || 1;
        o.connect(bq).connect(g);
      } else o.connect(g);
      g.connect(gain);
      o.start();
      nodes.push(o);
      return { o, g };
    };
    const noise = (buf, v, type, f, q = 0.7) => {
      const s = this.src(buf, true);
      const bq = this.ctx.createBiquadFilter();
      bq.type = type;
      bq.frequency.value = f;
      bq.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.value = v;
      s.connect(bq).connect(g).connect(gain);
      s.start();
      nodes.push(s);
      return { s, g, bq };
    };
    if (kind === 'lobby') {
      // O zumbido elétrico das fluorescentes (60 Hz e harmônicos).
      osc('sawtooth', 60, 0.05, ['lowpass', 900]);
      osc('square', 120, 0.012, ['bandpass', 240, 4]);
      osc('sine', 180, 0.02);
      const tr = osc('sine', 3760, 0.0035);
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.13;
      const lg = this.ctx.createGain();
      lg.gain.value = 0.002;
      lfo.connect(lg).connect(tr.g.gain);
      lfo.start();
      nodes.push(lfo);
      noise(this.noise, 0.015, 'highpass', 3000);
    } else if (kind === 'warehouse') {
      osc('sine', 48, 0.12);
      osc('sawtooth', 60, 0.015, ['lowpass', 400]);
      noise(this.brown, 0.25, 'lowpass', 300);
      noise(this.noise, 0.01, 'bandpass', 1200, 0.5);
    } else if (kind === 'pipes') {
      noise(this.brown, 0.45, 'lowpass', 180);
      osc('sine', 38, 0.16);
      osc('triangle', 77, 0.03);
      noise(this.noise, 0.008, 'bandpass', 4200, 2);
    } else if (kind === 'hotel') {
      osc('sine', 55, 0.1);
      const a = osc('sine', 220, 0.012);
      const b = osc('sine', 223.5, 0.012);
      a.o.detune.value = -20;
      b.o.detune.value = 15;
      osc('sawtooth', 60, 0.012, ['lowpass', 500]);
      noise(this.brown, 0.18, 'lowpass', 250);
    } else if (kind === 'run') {
      osc('sawtooth', 41, 0.08, ['lowpass', 200]);
      noise(this.brown, 0.35, 'lowpass', 220);
      // Sirene de dois tons.
      const s = osc('square', 620, 0.02, ['bandpass', 800, 2]);
      const lfo = this.ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 1.1;
      const lg = this.ctx.createGain();
      lg.gain.value = 160;
      lfo.connect(lg).connect(s.o.frequency);
      lfo.start();
      nodes.push(lfo);
    }
    this.ambience = { gain, nodes };
  }

  // Laço posicional (fenda do noclip, vapor, respiração de entidade).
  loop(id, kind) {
    if (!this.ctx || this.loops.has(id)) return;
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (pan) gain.connect(pan).connect(this.master);
    else gain.connect(this.master);
    const nodes = [];
    if (kind === 'glitch') {
      const s = this.src(this.noise, true);
      const bq = this.ctx.createBiquadFilter();
      bq.type = 'bandpass';
      bq.frequency.value = 700;
      bq.Q.value = 3;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 7;
      const lg = this.ctx.createGain();
      lg.gain.value = 500;
      lfo.connect(lg).connect(bq.frequency);
      s.connect(bq).connect(gain);
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 33;
      const og = this.ctx.createGain();
      og.gain.value = 0.4;
      o.connect(og).connect(gain);
      [s, lfo, o].forEach((n) => n.start());
      nodes.push(s, lfo, o);
    } else if (kind === 'breath') {
      const s = this.src(this.noise, true);
      const bq = this.ctx.createBiquadFilter();
      bq.type = 'bandpass';
      bq.frequency.value = 420;
      bq.Q.value = 1.4;
      const am = this.ctx.createGain();
      am.gain.value = 0.5;
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.9;
      const lg = this.ctx.createGain();
      lg.gain.value = 0.5;
      lfo.connect(lg).connect(am.gain);
      const o = this.ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 52;
      const og = this.ctx.createGain();
      og.gain.value = 0.25;
      o.connect(og).connect(am);
      s.connect(bq).connect(am).connect(gain);
      [s, lfo, o].forEach((n) => n.start());
      nodes.push(s, lfo, o);
    } else if (kind === 'steam') {
      const s = this.src(this.noise, true);
      const bq = this.ctx.createBiquadFilter();
      bq.type = 'highpass';
      bq.frequency.value = 2500;
      s.connect(bq).connect(gain);
      s.start();
      nodes.push(s);
    }
    this.loops.set(id, { gain, pan, nodes });
  }

  loopSet(id, vol, panV = 0) {
    const l = this.loops.get(id);
    if (!l) return;
    l.gain.gain.setTargetAtTime(Math.max(0, vol), this.t, 0.08);
    if (l.pan) l.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, panV)), this.t, 0.08);
  }

  stopLoops() {
    for (const l of this.loops.values()) {
      l.gain.gain.setTargetAtTime(0, this.t, 0.05);
      const nodes = l.nodes;
      setTimeout(() => nodes.forEach((n) => n.stop()), 400);
    }
    this.loops.clear();
  }

  // ---------- Efeitos curtos ----------

  footstep(surface = 'carpet', run = false) {
    if (!this.ctx) return;
    const s = this.src(this.noise);
    s.playbackRate.value = 0.6 + Math.random() * 0.3;
    const bq = this.ctx.createBiquadFilter();
    const g = this.ctx.createGain();
    let f = 380;
    let v = run ? 0.5 : 0.3;
    let d = 0.09;
    if (surface === 'concrete') {
      f = 900;
      d = 0.06;
    } else if (surface === 'wet') {
      f = 1600;
      d = 0.14;
      v *= 0.7;
    } else if (surface === 'metal') {
      f = 1400;
      v *= 0.8;
    }
    bq.type = 'bandpass';
    bq.frequency.value = f * (0.85 + Math.random() * 0.3);
    bq.Q.value = 1.2;
    s.connect(bq).connect(g).connect(this.master);
    this.env(g, 0.005, v, d);
    s.start();
    s.stop(this.t + 0.3);
    if (surface === 'metal') this.tone(260 + Math.random() * 60, 0.08, 0.04, 'triangle');
  }

  tone(f, dur, vol = 0.2, type = 'sine', t0 = 0, slideTo = 0, pan = 0) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    const t = this.t + t0;
    o.frequency.setValueAtTime(f, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const g = this.ctx.createGain();
    o.connect(g).connect(this.out(1, pan));
    this.env(g, 0.01, vol, dur, t);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  noiseBurst(dur, vol, type, f, q = 1, pan = 0, t0 = 0) {
    if (!this.ctx) return;
    const s = this.src(this.noise);
    const bq = this.ctx.createBiquadFilter();
    bq.type = type;
    bq.frequency.value = f;
    bq.Q.value = q;
    const g = this.ctx.createGain();
    s.connect(bq).connect(g).connect(this.out(1, pan));
    const t = this.t + t0;
    this.env(g, 0.01, vol, dur, t);
    s.start(t, Math.random());
    s.stop(t + dur + 0.1);
  }

  pickup() {
    this.tone(660, 0.12, 0.15, 'triangle');
    this.tone(990, 0.2, 0.12, 'triangle', 0.08);
  }

  click() {
    this.noiseBurst(0.03, 0.4, 'highpass', 3000);
    this.tone(1800, 0.02, 0.08, 'square');
  }

  drink() {
    for (let i = 0; i < 5; i++) {
      this.noiseBurst(0.12, 0.25, 'bandpass', 500 + i * 40, 4, 0, 0.2 + i * 0.28);
      this.tone(180 + Math.random() * 40, 0.1, 0.05, 'sine', 0.22 + i * 0.28, 120);
    }
    this.tone(500, 0.3, 0.06, 'sine', 1.7, 900);
  }

  door() {
    this.tone(220, 0.6, 0.07, 'sawtooth', 0, 160);
    this.noiseBurst(0.5, 0.15, 'bandpass', 900, 6);
    this.noiseBurst(0.12, 0.3, 'lowpass', 300, 1, 0, 0.55);
  }

  locked() {
    this.noiseBurst(0.08, 0.4, 'bandpass', 1200, 3);
    this.noiseBurst(0.08, 0.4, 'bandpass', 1000, 3, 0, 0.12);
  }

  valve() {
    this.tone(330 + Math.random() * 80, 0.25, 0.05, 'sawtooth', 0, 280);
    this.noiseBurst(0.2, 0.08, 'bandpass', 2200, 8);
  }

  clank(vol = 0.3, pan = 0) {
    this.tone(140 + Math.random() * 90, 0.6, vol * 0.3, 'triangle', 0, 0, pan);
    this.tone(523 + Math.random() * 200, 0.4, vol * 0.15, 'sine', 0, 0, pan);
    this.noiseBurst(0.05, vol, 'bandpass', 2000, 2, pan);
  }

  drip(pan = 0) {
    this.tone(1200 + Math.random() * 800, 0.08, 0.06, 'sine', 0, 600, pan);
  }

  lampBurst(pan = 0) {
    this.noiseBurst(0.25, 0.5, 'highpass', 2500, 1, pan);
    this.tone(90, 0.3, 0.1, 'square', 0, 40, pan);
  }

  powerDown() {
    this.tone(180, 1.6, 0.25, 'sawtooth', 0, 25);
    this.noiseBurst(0.6, 0.3, 'lowpass', 400);
  }

  powerUp() {
    this.tone(40, 1.2, 0.2, 'sawtooth', 0, 180);
    this.noiseBurst(0.3, 0.2, 'bandpass', 1500, 2, 0, 0.9);
  }

  elevator() {
    this.tone(880, 0.6, 0.15, 'sine');
    this.tone(660, 0.9, 0.12, 'sine', 0.35);
  }

  growl(vol = 0.5, pan = 0) {
    if (!this.ctx) return;
    const o = this.ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70 + Math.random() * 30, this.t);
    o.frequency.linearRampToValueAtTime(45, this.t + 1.2);
    const ws = this.ctx.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const x = (i / 128) - 1;
      curve[i] = Math.tanh(x * 4);
    }
    ws.curve = curve;
    const bq = this.ctx.createBiquadFilter();
    bq.type = 'lowpass';
    bq.frequency.value = 700;
    const g = this.ctx.createGain();
    o.connect(ws).connect(bq).connect(g).connect(this.out(1, pan));
    this.env(g, 0.15, vol * 0.35, 1.2);
    o.start();
    o.stop(this.t + 1.5);
    this.noiseBurst(1.1, vol * 0.25, 'bandpass', 350, 2, pan);
  }

  screech(vol = 0.5, pan = 0) {
    this.tone(1400, 0.7, vol * 0.12, 'sawtooth', 0, 700, pan);
    this.tone(1510, 0.7, vol * 0.1, 'square', 0, 640, pan);
    this.noiseBurst(0.7, vol * 0.3, 'bandpass', 2600, 3, pan);
  }

  scream() {
    if (!this.ctx) return;
    this.tone(900, 1.4, 0.35, 'sawtooth', 0, 300);
    this.tone(933, 1.4, 0.3, 'square', 0, 280);
    this.tone(1800, 1.0, 0.15, 'sawtooth', 0, 500);
    this.noiseBurst(1.5, 0.9, 'bandpass', 1800, 0.8);
    this.noiseBurst(1.5, 0.7, 'lowpass', 200, 0.7);
  }

  heartbeat(vol = 0.5) {
    this.tone(55, 0.12, vol, 'sine', 0, 35);
    this.tone(50, 0.12, vol * 0.7, 'sine', 0.18, 32);
  }

  noclip() {
    this.tone(400, 2.2, 0.25, 'sawtooth', 0, 30);
    this.tone(60, 2.4, 0.3, 'sine', 0, 400);
    this.noiseBurst(2.2, 0.5, 'bandpass', 600, 0.5);
  }

  distantSteps(pan = 0) {
    for (let i = 0; i < 4; i++) this.noiseBurst(0.08, 0.08, 'lowpass', 300, 1, pan, i * 0.45);
  }

  win() {
    [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 1.2, 0.12, 'triangle', i * 0.25));
  }
}

export const audio = new Audio();

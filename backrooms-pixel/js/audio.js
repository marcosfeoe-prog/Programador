// Todo o som é sintetizado com Web Audio: zumbido fluorescente, passos,
// a entidade, sussurros, batimentos, vapor, estática e efeitos de interface.

export class Sound {
  constructor() { this.ctx = null; this.hbT = 0; this.level = 0; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -16;
    comp.ratio.value = 6;
    comp.connect(c.destination);
    this.master = c.createGain();
    this.master.gain.value = 0.85;
    this.master.connect(comp);

    const len = c.sampleRate * 2;
    this.noise = c.createBuffer(1, len, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.brown = c.createBuffer(1, len, c.sampleRate);
    const b = this.brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5; }

    // zumbido das lâmpadas
    this.hum = this.gain(0);
    const o1 = this.osc('sawtooth', 120), bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 360; bp.Q.value = 1.4;
    o1.connect(bp); bp.connect(this.hum);
    const o2 = this.osc('sine', 60), g2 = this.gain(0.6, this.hum);
    o2.connect(g2);
    this.humOsc = [o1, o2];

    // drone grave de fundo
    this.drone = this.gain(0);
    this.droneOsc = [this.osc('sine', 55), this.osc('sine', 55.6), this.osc('triangle', 82.4)];
    this.droneOsc.forEach((o, i) => o.connect(this.gain(i === 2 ? 0.25 : 0.5, this.drone)));

    // rosnado da entidade
    this.growl = this.gain(0);
    this.growlPan = c.createStereoPanner ? c.createStereoPanner() : null;
    const gl = c.createBiquadFilter();
    gl.type = 'lowpass'; gl.frequency.value = 420;
    const ws = c.createWaveShaper();
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; curve[i] = Math.tanh(x * 4); }
    ws.curve = curve;
    const ga = this.osc('sawtooth', 48), gb = this.osc('sawtooth', 51.5);
    const lfo = this.osc('sine', 5.5), lg = c.createGain();
    lg.gain.value = 6; lfo.connect(lg); lg.connect(ga.frequency); lg.connect(gb.frequency);
    ga.connect(ws); gb.connect(ws); ws.connect(gl);
    if (this.growlPan) { gl.connect(this.growlPan); this.growlPan.connect(this.growl); } else gl.connect(this.growl);

    // camadas de ruído contínuo
    this.stat = this.noiseLayer('bandpass', 3200, 0.6);
    this.steam = this.noiseLayer('highpass', 2600, 0.7);
    this.rumble = this.noiseLayer('lowpass', 140, 0.8, this.brown);
    this.machines = this.noiseLayer('bandpass', 90, 4, this.brown);
  }

  t() { return this.ctx.currentTime; }
  gain(v, dest) {
    const g = this.ctx.createGain();
    g.gain.value = v;
    g.connect(dest || this.master);
    return g;
  }
  osc(type, freq) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.start();
    return o;
  }
  noiseLayer(type, freq, q, buf) {
    const c = this.ctx, s = c.createBufferSource();
    s.buffer = buf || this.noise;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = this.gain(0);
    s.connect(f); f.connect(g);
    s.start();
    return g;
  }
  set(param, v, k = 0.08) { if (this.ctx) param.setTargetAtTime(v, this.t(), k); }
  panNode(pan, dest) {
    const c = this.ctx;
    if (c.createStereoPanner) {
      const p = c.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, pan || 0));
      p.connect(dest || this.master);
      return p;
    }
    return dest || this.master;
  }

  burst({ dur = 0.1, type = 'lowpass', freq = 800, q = 1, gain = 0.3, pan = 0, attack = 0.005, freqEnd, buf, rate = 1, delay = 0 }) {
    if (!this.ctx) return;
    const c = this.ctx, t = this.t() + delay;
    const s = c.createBufferSource();
    s.buffer = buf || this.noise;
    s.loop = true;
    s.playbackRate.value = rate;
    const f = c.createBiquadFilter();
    f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freq, t);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.panNode(pan));
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.05);
  }

  tone({ type = 'sine', freq = 440, freqEnd, dur = 0.1, gain = 0.1, pan = 0, attack = 0.005, delay = 0 }) {
    if (!this.ctx) return;
    const c = this.ctx, t = this.t() + delay;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.panNode(pan));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  setLevel(id) {
    this.level = id;
    if (!this.ctx) return;
    const freqs = [[120, 60], [100, 50], [80, 40]][id];
    this.humOsc[0].frequency.value = freqs[0];
    this.humOsc[1].frequency.value = freqs[1];
    const base = [55, 49, 41.2][id];
    this.droneOsc[0].frequency.value = base;
    this.droneOsc[1].frequency.value = base * 1.011;
    this.droneOsc[2].frequency.value = base * 1.498;
  }

  // Ajusta as camadas contínuas a cada quadro.
  update(dt, s) {
    if (!this.ctx) return;
    this.set(this.hum.gain, s.hum);
    this.set(this.drone.gain, s.drone, 0.5);
    this.set(this.growl.gain, s.growl, 0.15);
    if (this.growlPan) this.set(this.growlPan.pan, s.growlPan || 0, 0.1);
    this.set(this.stat.gain, s.stat, 0.05);
    this.set(this.steam.gain, s.steam, 0.1);
    this.set(this.rumble.gain, s.rumble, 0.4);
    this.set(this.machines.gain, s.machines, 0.4);
    if (s.heart > 0) {
      this.hbT -= dt;
      if (this.hbT <= 0) {
        this.hbT = 60 / (60 + s.heart * 90);
        this.heartbeat(0.2 + s.heart * 0.5);
      }
    }
  }

  step(kind, run) {
    const v = run ? 1.3 : 1, r = 0.9 + Math.random() * 0.2;
    if (kind === 'carpet') {
      this.burst({ dur: 0.13, type: 'lowpass', freq: 520 * r, gain: 0.22 * v });
      this.tone({ freq: 75 * r, freqEnd: 40, dur: 0.09, gain: 0.16 * v });
    } else if (kind === 'concrete') {
      this.burst({ dur: 0.08, type: 'bandpass', freq: 1500 * r, q: 1.2, gain: 0.3 * v });
      this.tone({ freq: 95 * r, freqEnd: 50, dur: 0.07, gain: 0.14 * v });
      if (Math.random() < 0.2) this.burst({ dur: 0.12, type: 'bandpass', freq: 2400, q: 3, gain: 0.05, delay: 0.05 });
    } else {
      this.burst({ dur: 0.16, type: 'bandpass', freq: 2600 * r, q: 7, gain: 0.22 * v });
      this.tone({ type: 'square', freq: 330 * r, freqEnd: 300, dur: 0.06, gain: 0.03 * v });
      this.tone({ freq: 70, freqEnd: 40, dur: 0.1, gain: 0.15 * v });
    }
  }

  entityStep(vol, pan) {
    if (vol < 0.01) return;
    this.tone({ freq: 52, freqEnd: 28, dur: 0.28, gain: 0.5 * vol, pan });
    this.burst({ dur: 0.2, type: 'lowpass', freq: 260, gain: 0.35 * vol, pan });
    if (Math.random() < 0.3) this.burst({ dur: 0.35, type: 'bandpass', freq: 900, freqEnd: 500, q: 9, gain: 0.08 * vol, pan, delay: 0.1 });
  }

  click(on) {
    this.burst({ dur: 0.03, type: 'highpass', freq: 3000, gain: 0.25 });
    this.tone({ type: 'square', freq: on ? 1400 : 900, dur: 0.025, gain: 0.04 });
  }

  pickup(kind) {
    const notes = kind === 'water' ? [523, 659, 784, 1046] : [392, 523, 784];
    notes.forEach((n, i) => this.tone({ type: 'square', freq: n, dur: 0.09, gain: 0.05, delay: i * 0.065 }));
    if (kind === 'water') this.burst({ dur: 0.3, type: 'bandpass', freq: 1200, freqEnd: 600, q: 4, gain: 0.08 });
  }

  whisper(pan) {
    if (!this.ctx) return;
    const c = this.ctx, t = this.t(), dur = 1.2 + Math.random() * 1.4;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    const out = c.createGain();
    out.gain.setValueAtTime(0.0001, t);
    out.gain.exponentialRampToValueAtTime(0.16, t + 0.25);
    out.gain.setValueAtTime(0.16, t + dur - 0.4);
    out.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const trem = c.createGain();
    const lfo = c.createOscillator();
    lfo.frequency.value = 6 + Math.random() * 6;
    const lg = c.createGain();
    lg.gain.value = 0.5;
    lfo.connect(lg); lg.connect(trem.gain);
    trem.gain.value = 0.5;
    for (const [a, b] of [[600, 1100], [1700, 2500], [3000, 2600]]) {
      const f = c.createBiquadFilter();
      f.type = 'bandpass'; f.Q.value = 10;
      f.frequency.setValueAtTime(a, t);
      f.frequency.linearRampToValueAtTime(b, t + dur * 0.5);
      f.frequency.linearRampToValueAtTime(a * 1.1, t + dur);
      s.connect(f); f.connect(trem);
    }
    trem.connect(out);
    out.connect(this.panNode(pan));
    s.start(t, Math.random());
    s.stop(t + dur + 0.1);
    lfo.start(t);
    lfo.stop(t + dur + 0.1);
  }

  heartbeat(v) {
    this.tone({ freq: 58, freqEnd: 34, dur: 0.16, gain: 0.5 * v });
    this.tone({ freq: 52, freqEnd: 30, dur: 0.14, gain: 0.35 * v, delay: 0.22 });
  }

  flicker(v = 1) {
    this.tone({ type: 'square', freq: 120, dur: 0.06, gain: 0.04 * v });
    this.burst({ dur: 0.04, type: 'highpass', freq: 4000, gain: 0.08 * v });
  }

  drip(pan, v = 1) {
    const f = 1400 + Math.random() * 1200;
    this.tone({ freq: f, freqEnd: f * 0.55, dur: 0.09, gain: 0.07 * v, pan });
    this.tone({ freq: f * 0.8, freqEnd: f * 0.5, dur: 0.06, gain: 0.03 * v, pan, delay: 0.12 });
  }

  clank(pan, v = 1) {
    const f = 180 + Math.random() * 300;
    this.tone({ type: 'triangle', freq: f, freqEnd: f * 0.97, dur: 0.9, gain: 0.08 * v, pan });
    this.tone({ type: 'triangle', freq: f * 2.76, dur: 0.5, gain: 0.04 * v, pan });
    this.burst({ dur: 0.08, type: 'bandpass', freq: 2000, q: 2, gain: 0.15 * v, pan });
  }

  spotted() {
    this.tone({ type: 'sawtooth', freq: 220, freqEnd: 110, dur: 1.2, gain: 0.08 });
    this.tone({ type: 'sawtooth', freq: 233, freqEnd: 104, dur: 1.2, gain: 0.08 });
    this.burst({ dur: 0.8, type: 'bandpass', freq: 400, freqEnd: 2000, q: 2, gain: 0.2 });
  }

  jumpscare() {
    this.burst({ dur: 0.7, type: 'highpass', freq: 200, gain: 0.9 });
    this.tone({ type: 'sawtooth', freq: 90, freqEnd: 40, dur: 0.9, gain: 0.5 });
    this.tone({ type: 'sawtooth', freq: 1300, freqEnd: 500, dur: 0.6, gain: 0.18 });
    this.tone({ type: 'square', freq: 1370, freqEnd: 480, dur: 0.6, gain: 0.1 });
  }

  noclip() {
    this.tone({ type: 'sawtooth', freq: 900, freqEnd: 30, dur: 2.6, gain: 0.12 });
    this.tone({ type: 'sine', freq: 300, freqEnd: 20, dur: 2.8, gain: 0.25 });
    this.burst({ dur: 2.6, type: 'bandpass', freq: 4000, freqEnd: 200, q: 0.7, gain: 0.35, attack: 1.2 });
  }

  powerDown() {
    this.tone({ type: 'sawtooth', freq: 120, freqEnd: 25, dur: 1.4, gain: 0.15 });
    this.burst({ dur: 0.3, type: 'lowpass', freq: 300, gain: 0.5 });
  }

  powerUp() {
    this.burst({ dur: 0.2, type: 'lowpass', freq: 400, gain: 0.45 });
    this.tone({ type: 'sawtooth', freq: 30, freqEnd: 120, dur: 1.0, gain: 0.1 });
  }

  steamHiss(pan, v) { this.burst({ dur: 1.4, type: 'highpass', freq: 2200, gain: 0.2 * v, pan, attack: 0.05 }); }

  ui(sel) { this.tone({ type: 'square', freq: sel ? 660 : 440, freqEnd: sel ? 990 : 440, dur: sel ? 0.12 : 0.04, gain: 0.05 }); }

  dead() {
    this.tone({ type: 'sawtooth', freq: 200, freqEnd: 20, dur: 3, gain: 0.2 });
    this.burst({ dur: 3, type: 'lowpass', freq: 2000, freqEnd: 60, gain: 0.4, attack: 0.05 });
  }
}

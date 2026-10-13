// Áudio procedural (Web Audio): vento, chuva, rugido do tornado ("trem de carga"),
// trovões com atraso pela distância, sirene de tornado, clarões elétricos e grilos.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.ready = false;
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
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp);
    comp.connect(ctx.destination);

    this.white = this.noiseBuffer(3, 'white');
    this.brown = this.noiseBuffer(4, 'brown');

    const loop = (buf) => {
      const s = ctx.createBufferSource();
      s.buffer = buf;
      s.loop = true;
      s.loopStart = Math.random();
      s.start(0, Math.random() * buf.duration);
      return s;
    };
    const filt = (type, f, q = 0.7) => {
      const b = ctx.createBiquadFilter();
      b.type = type;
      b.frequency.value = f;
      b.Q.value = q;
      return b;
    };
    const gain = (v = 0) => {
      const g = ctx.createGain();
      g.gain.value = v;
      return g;
    };
    // Vento
    this.windF = filt('bandpass', 500, 0.5);
    this.windG = gain();
    loop(this.white).connect(this.windF).connect(this.windG).connect(this.master);
    this.howlF = filt('bandpass', 700, 9);
    this.howlG = gain();
    loop(this.white).connect(this.howlF).connect(this.howlG).connect(this.master);
    // Chuva
    const rh = filt('highpass', 1300);
    const rl = filt('lowpass', 8000);
    this.rainG = gain();
    loop(this.white).connect(rh).connect(rl).connect(this.rainG).connect(this.master);
    // Tornado: rugido grave + chiado
    this.roarF = filt('lowpass', 260, 0.9);
    this.roarG = gain();
    loop(this.brown).connect(this.roarF).connect(this.roarG).connect(this.master);
    this.rumbleF = filt('lowpass', 70, 1.2);
    this.rumbleG = gain();
    loop(this.brown).connect(this.rumbleF).connect(this.rumbleG).connect(this.master);
    this.jetF = filt('bandpass', 1100, 0.4);
    this.jetG = gain();
    loop(this.white).connect(this.jetF).connect(this.jetG).connect(this.master);
    // Sirene
    this.sirenOsc = ctx.createOscillator();
    this.sirenOsc.type = 'sawtooth';
    this.sirenOsc2 = ctx.createOscillator();
    this.sirenOsc2.type = 'square';
    const sf = filt('lowpass', 1500, 1);
    this.sirenG = gain();
    this.sirenPan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const so2g = gain(0.25);
    this.sirenOsc.connect(sf);
    this.sirenOsc2.connect(so2g).connect(sf);
    if (this.sirenPan) sf.connect(this.sirenG).connect(this.sirenPan).connect(this.master);
    else sf.connect(this.sirenG).connect(this.master);
    this.sirenOsc.start();
    this.sirenOsc2.start();
    // Grilos (noite calma)
    this.cricketOsc = ctx.createOscillator();
    this.cricketOsc.frequency.value = 4300;
    this.cricketAM = gain(0);
    this.cricketG = gain(0);
    this.cricketOsc.connect(this.cricketAM).connect(this.cricketG).connect(this.master);
    this.cricketOsc.start();
    const lfo = ctx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 28;
    const lfoG = gain(0.5);
    lfo.connect(lfoG).connect(this.cricketAM.gain);
    lfo.start();
    this.sirenT = 0;
    this.ready = true;
  }

  noiseBuffer(sec, type) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * sec);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'brown') {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    // suaviza a emenda do loop
    const fade = Math.min(2000, n / 10);
    for (let i = 0; i < fade; i++) {
      const k = i / fade;
      d[n - fade + i] = d[n - fade + i] * (1 - k) + d[i] * k;
    }
    return buf;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.1);
  }

  set(param, v, tc = 0.25) {
    param.setTargetAtTime(v, this.ctx.currentTime, tc);
  }

  // Atualização contínua (chamada a cada quadro)
  update(dt, s) {
    if (!this.ready) return;
    const w = s.wind;
    this.set(this.windG.gain, Math.min(0.5, 0.02 + (w / 40) ** 1.5 * 0.35) * s.outdoor);
    this.set(this.windF.frequency, 300 + w * 14);
    this.set(this.howlG.gain, Math.max(0, (w - 14) / 60) * 0.12 * (0.6 + 0.4 * Math.sin(this.ctx.currentTime * 0.7)));
    this.set(this.howlF.frequency, 500 + w * 9 + Math.sin(this.ctx.currentTime * 1.3) * 120);
    this.set(this.rainG.gain, s.rain * 0.22);
    // Tornado
    const tr = s.tornadoLoud;
    this.set(this.roarG.gain, Math.min(1.1, tr * 1.2), 0.4);
    this.set(this.rumbleG.gain, Math.min(1.2, tr * 1.4), 0.4);
    this.set(this.jetG.gain, Math.min(0.25, s.tornadoNear * 0.3), 0.3);
    this.set(this.roarF.frequency, 180 + s.tornadoNear * 500);
    // Sirene (ciclo de subida/descida de ~10 s)
    this.sirenT += dt;
    const ph = (this.sirenT % 10) / 10;
    const f = ph < 0.5 ? 380 + 460 * Math.sin(ph * Math.PI) : 380 + 460 * Math.sin(ph * Math.PI);
    this.sirenOsc.frequency.setTargetAtTime(f, this.ctx.currentTime, 0.05);
    this.sirenOsc2.frequency.setTargetAtTime(f * 1.5, this.ctx.currentTime, 0.05);
    const rot = 0.55 + 0.45 * Math.sin(this.sirenT * 0.8);
    this.set(this.sirenG.gain, s.siren * rot * 0.07, 0.08);
    if (this.sirenPan) this.set(this.sirenPan.pan, s.sirenPan, 0.1);
    // Grilos
    this.set(this.cricketG.gain, s.crickets * 0.012, 1.0);
  }

  thunder(dist, close) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const delay = dist / 343;
    const t0 = ctx.currentTime + delay;
    const vol = Math.min(1, 2.2 / (1 + dist / 1200));
    const src = ctx.createBufferSource();
    src.buffer = this.brown;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = close ? 1600 : Math.max(180, 900 - dist * 0.08);
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(lp).connect(g).connect(this.master);
    const dur = 3 + Math.random() * 4;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol * (close ? 1.6 : 1), t0 + (close ? 0.02 : 0.3));
    let t = t0 + 0.3;
    while (t < t0 + dur) {
      g.gain.linearRampToValueAtTime(vol * (0.3 + Math.random() * 0.7), t);
      t += 0.15 + Math.random() * 0.4;
    }
    g.gain.linearRampToValueAtTime(0, t0 + dur + 0.8);
    src.start(t0, Math.random() * 2);
    src.stop(t0 + dur + 1);
    if (close) {
      const c = ctx.createBufferSource();
      c.buffer = this.white;
      const cg = ctx.createGain();
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 900;
      c.connect(hp).connect(cg).connect(this.master);
      cg.gain.setValueAtTime(0.6 * vol, t0);
      cg.gain.exponentialRampToValueAtTime(0.001, t0 + 0.35);
      c.start(t0);
      c.stop(t0 + 0.4);
    }
  }

  impact(dist, strength) {
    if (!this.ready || dist > 250) return;
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.brown;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500 + strength * 600;
    const g = ctx.createGain();
    const v = Math.min(0.6, strength / (1 + dist / 25));
    const t0 = ctx.currentTime + dist / 343;
    g.gain.setValueAtTime(v, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.3);
    s.connect(lp).connect(g).connect(this.master);
    s.start(t0, Math.random());
    s.stop(t0 + 0.35);
  }

  powerFlash(dist) {
    if (!this.ready || dist > 2500) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + dist / 343;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 120;
    const g = ctx.createGain();
    const v = Math.min(0.35, 0.6 / (1 + dist / 150));
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(v, t0 + 0.02);
    g.gain.linearRampToValueAtTime(v * 0.6, t0 + 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + 0.75);
    this.impact(dist * 0.5, 1.2);
  }
}

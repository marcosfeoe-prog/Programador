// Áudio procedural (Web Audio): torcida em camadas que reage ao jogo,
// cantos com bumbo e palmas, apito do árbitro, chute, trave, rede, chuva,
// vento e trovão. Sem arquivos de som.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.vol = 0.8;
    this.started = false;
  }

  start() {
    if (this.started) {
      if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.started = true;
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = this.vol;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp);
    comp.connect(c.destination);
    this.noise = this.makeNoise(4);
    this.pink = this.makePink(4);
  }

  setVolume(v) {
    this.vol = v;
    if (this.master) this.master.gain.value = v;
  }

  makeNoise(sec) {
    const c = this.ctx;
    const b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  }
  makePink(sec) {
    const c = this.ctx;
    const b = c.createBuffer(1, c.sampleRate * sec, c.sampleRate);
    const d = b.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    for (let i = 0; i < d.length; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99886 * b0 + w * 0.0555179;
      b1 = 0.99332 * b1 + w * 0.0750759;
      b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856;
      b4 = 0.55 * b4 + w * 0.5329522;
      b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + w * 0.5362) * 0.11;
    }
    return b;
  }

  loop(buf, rate = 1) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.playbackRate.value = rate;
    s.loopStart = Math.random();
    s.start(0, Math.random() * 3);
    return s;
  }

  // Ambiente da partida (torcida + clima).
  beginMatch(env, capacityFactor = 1) {
    if (!this.ctx) return;
    this.endMatch();
    const c = this.ctx;
    const out = c.createGain();
    out.gain.value = 0;
    out.connect(this.master);
    out.gain.setTargetAtTime(1, c.currentTime, 1.2);
    this.matchOut = out;
    this.nodes = [];
    // torcida: várias bandas de ruído
    const bands = [
      [250, 0.8, 0.5],
      [520, 1.2, 0.45],
      [1050, 1.4, 0.3],
      [2100, 1.6, 0.12],
    ];
    this.crowd = c.createGain();
    this.crowd.gain.value = 0.25 * capacityFactor;
    this.crowd.connect(out);
    for (const [f, q, g] of bands) {
      const s = this.loop(this.pink, 0.9 + Math.random() * 0.2);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = f;
      bp.Q.value = q;
      const gn = c.createGain();
      gn.gain.value = g;
      s.connect(bp);
      bp.connect(gn);
      gn.connect(this.crowd);
      this.nodes.push(s);
    }
    // camada de "uh" (vogal) para lances perigosos
    const s2 = this.loop(this.pink);
    const f1 = c.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 420;
    f1.Q.value = 4;
    const f2 = c.createBiquadFilter();
    f2.type = 'bandpass';
    f2.frequency.value = 900;
    f2.Q.value = 5;
    this.ooh = c.createGain();
    this.ooh.gain.value = 0;
    s2.connect(f1);
    s2.connect(f2);
    f1.connect(this.ooh);
    f2.connect(this.ooh);
    this.ooh.connect(out);
    this.oohF = [f1, f2];
    this.nodes.push(s2);
    // chuva
    if (env.rain > 0) {
      const r = this.loop(this.noise);
      const hp = c.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 1400;
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 7000;
      const g = c.createGain();
      g.gain.value = 0.05 + env.rain * 0.09;
      r.connect(hp);
      hp.connect(lp);
      lp.connect(g);
      g.connect(out);
      this.nodes.push(r);
    }
    // vento
    if (env.windSpeed > 6) {
      const w = this.loop(this.pink, 0.5);
      const bp = c.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 380;
      bp.Q.value = 0.8;
      const g = c.createGain();
      g.gain.value = Math.min(0.35, (env.windSpeed - 6) * 0.03);
      const lfo = c.createOscillator();
      lfo.frequency.value = 0.15;
      const lg = c.createGain();
      lg.gain.value = g.gain.value * 0.6;
      lfo.connect(lg);
      lg.connect(g.gain);
      lfo.start();
      w.connect(bp);
      bp.connect(g);
      g.connect(out);
      this.nodes.push(w, lfo);
    }
    this.chantT = 6 + Math.random() * 6;
    this.capacity = capacityFactor;
  }

  endMatch() {
    if (!this.ctx || !this.matchOut) return;
    const out = this.matchOut;
    out.gain.setTargetAtTime(0, this.ctx.currentTime, 0.3);
    const nodes = this.nodes;
    setTimeout(() => {
      for (const n of nodes) {
        try {
          n.stop();
        } catch (e) {
          /* ignorado */
        }
      }
      out.disconnect();
    }, 1500);
    this.matchOut = null;
    this.nodes = [];
  }

  // Intensidade da torcida (0..1) a cada quadro.
  update(dt, excite, paused) {
    if (!this.ctx || !this.matchOut) return;
    const c = this.ctx;
    const target = paused ? 0.06 : (0.16 + excite * 0.42) * this.capacity;
    this.crowd.gain.setTargetAtTime(target, c.currentTime, 0.6);
    if (!paused) {
      this.chantT -= dt;
      if (this.chantT <= 0) {
        this.chant();
        this.chantT = 14 + Math.random() * 18;
      }
    }
  }

  // Canto com bumbo e palmas (≈6 s).
  chant() {
    const c = this.ctx;
    const t0 = c.currentTime + 0.05;
    const bpm = 112 + Math.random() * 20;
    const beat = 60 / bpm;
    for (let i = 0; i < 16; i++) {
      const t = t0 + i * beat * 0.5;
      if (i % 4 === 0 || i % 4 === 3) this.drum(t, 0.22);
      if (i % 2 === 1) this.clap(t, 0.06 * this.capacity);
    }
    // vozes
    const s = c.createBufferSource();
    s.buffer = this.pink;
    const f1 = c.createBiquadFilter();
    f1.type = 'bandpass';
    f1.frequency.value = 600;
    f1.Q.value = 3;
    const g = c.createGain();
    g.gain.value = 0;
    for (let i = 0; i < 4; i++) {
      const t = t0 + i * beat * 2;
      g.gain.setTargetAtTime(0.25 * this.capacity, t, 0.05);
      g.gain.setTargetAtTime(0.06, t + beat * 1.2, 0.1);
      f1.frequency.setValueAtTime(i % 2 ? 520 : 700, t);
    }
    g.gain.setTargetAtTime(0, t0 + beat * 8, 0.3);
    s.connect(f1);
    f1.connect(g);
    g.connect(this.matchOut);
    s.start(t0);
    s.stop(t0 + beat * 9);
  }

  drum(t, v) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(48, t + 0.18);
    const g = c.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g);
    g.connect(this.matchOut || this.master);
    o.start(t);
    o.stop(t + 0.32);
  }

  clap(t, v) {
    const c = this.ctx;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1500;
    bp.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    s.connect(bp);
    bp.connect(g);
    g.connect(this.matchOut || this.master);
    s.start(t, Math.random() * 2);
    s.stop(t + 0.14);
  }

  // Apito: curto, longo, ou fim (três apitos).
  whistle(kind = 'short') {
    if (!this.ctx) return;
    const c = this.ctx;
    const seq = kind === 'end' ? [0.22, 0.22, 0.9] : kind === 'long' ? [0.85] : kind === 'adv' ? [0.12] : [0.28];
    let t = c.currentTime + 0.02;
    for (const d of seq) {
      const o = c.createOscillator();
      o.type = 'triangle';
      o.frequency.value = 2900;
      const lfo = c.createOscillator();
      lfo.frequency.value = 28;
      const lg = c.createGain();
      lg.gain.value = 140;
      lfo.connect(lg);
      lg.connect(o.frequency);
      const g = c.createGain();
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.16, t + 0.02);
      g.gain.setValueAtTime(0.16, t + d - 0.04);
      g.gain.linearRampToValueAtTime(0, t + d);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      lfo.start(t);
      o.stop(t + d + 0.02);
      lfo.stop(t + d + 0.02);
      t += d + 0.12;
    }
  }

  kick(power = 0.5, pan = 0, dist = 30) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const v = (0.12 + power * 0.4) * Math.max(0.25, 1 - dist / 120);
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900 + power * 1600;
    const g = c.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
    const o = c.createOscillator();
    o.frequency.setValueAtTime(140, t);
    o.frequency.exponentialRampToValueAtTime(55, t + 0.09);
    const og = c.createGain();
    og.gain.setValueAtTime(v * 1.2, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    const pn = c.createStereoPanner ? c.createStereoPanner() : null;
    const dest = pn || this.master;
    if (pn) {
      pn.pan.value = Math.max(-1, Math.min(1, pan));
      pn.connect(this.master);
    }
    s.connect(lp);
    lp.connect(g);
    g.connect(dest);
    o.connect(og);
    og.connect(dest);
    s.start(t, Math.random() * 3);
    s.stop(t + 0.1);
    o.start(t);
    o.stop(t + 0.14);
  }

  post() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    for (const [f, a, d] of [
      [640, 0.12, 0.9],
      [1420, 0.07, 0.6],
      [2310, 0.05, 0.45],
      [3600, 0.03, 0.3],
    ]) {
      const o = c.createOscillator();
      o.frequency.value = f;
      const g = c.createGain();
      g.gain.setValueAtTime(a, t);
      g.gain.exponentialRampToValueAtTime(0.0008, t + d);
      o.connect(g);
      g.connect(this.master);
      o.start(t);
      o.stop(t + d);
    }
    this.kick(0.5, 0, 10);
    this.oohSwell(0.9);
  }

  net(speed = 10) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const hp = c.createBiquadFilter();
    hp.type = 'bandpass';
    hp.frequency.value = 2600;
    hp.Q.value = 0.6;
    const g = c.createGain();
    g.gain.setValueAtTime(Math.min(0.25, speed * 0.012), t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    s.connect(hp);
    hp.connect(g);
    g.connect(this.master);
    s.start(t);
    s.stop(t + 0.4);
  }

  bounce(speed) {
    if (!this.ctx) return;
    this.kick(Math.min(0.3, speed * 0.02), 0, 40);
  }

  // "Uuuh!" da torcida (quase gol).
  oohSwell(amount = 1) {
    if (!this.ctx || !this.ooh) return;
    const c = this.ctx;
    const t = c.currentTime;
    const g = this.ooh.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(0.5 * amount * this.capacity, t + 0.35);
    g.linearRampToValueAtTime(0.0, t + 2.2);
    this.oohF[0].frequency.setValueAtTime(480, t);
    this.oohF[0].frequency.linearRampToValueAtTime(330, t + 2);
  }

  // Explosão do gol.
  goal(home = true) {
    if (!this.ctx || !this.crowd) return;
    const c = this.ctx;
    const t = c.currentTime;
    const g = this.crowd.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime((home ? 1.2 : 0.55) * this.capacity, t + 0.4);
    g.setTargetAtTime(0.35 * this.capacity, t + 4, 2.5);
    for (let i = 0; i < 10; i++) this.drum(t + 1 + i * 0.25, 0.25);
    this.oohSwell(0.6);
  }

  thunder(delay = 1) {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime + delay;
    const s = c.createBufferSource();
    s.buffer = this.noise;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 140;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.9 / (1 + delay * 0.4), t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.25, t + 0.8);
    g.gain.exponentialRampToValueAtTime(0.001, t + 4.5);
    s.connect(lp);
    lp.connect(g);
    g.connect(this.master);
    s.start(t);
    s.stop(t + 4.6);
  }

  click() {
    if (!this.ctx) return;
    const c = this.ctx;
    const t = c.currentTime;
    const o = c.createOscillator();
    o.frequency.value = 880;
    const g = c.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(g);
    g.connect(this.master);
    o.start(t);
    o.stop(t + 0.07);
  }
}

// Narração opcional pela voz do navegador.
export class Narrator {
  constructor() {
    this.enabled = false;
    this.voice = null;
    if (typeof speechSynthesis !== 'undefined') {
      const pick = () => {
        const vs = speechSynthesis.getVoices();
        this.voice = vs.find((v) => /pt-BR/i.test(v.lang)) || vs.find((v) => /^pt/i.test(v.lang)) || null;
      };
      pick();
      speechSynthesis.onvoiceschanged = pick;
    }
  }
  say(text, urgent = false) {
    if (!this.enabled || typeof speechSynthesis === 'undefined') return;
    if (urgent) speechSynthesis.cancel();
    else if (speechSynthesis.speaking) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'pt-BR';
    if (this.voice) u.voice = this.voice;
    u.rate = urgent ? 1.15 : 1.05;
    u.pitch = urgent ? 1.2 : 1;
    speechSynthesis.speak(u);
  }
}

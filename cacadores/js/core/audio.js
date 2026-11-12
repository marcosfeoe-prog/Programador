// Áudio procedural (Web Audio): vento, chuva, granizo no teto, trovões com atraso pela
// distância, o rugido do tornado ("trem de carga"), motor, sirenes, buzina e alertas.

export class Audio {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.volume = 0.8;
  }

  start() {
    if (this.ctx) {
      this.ctx.resume?.();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -18;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    const sr = ctx.sampleRate;
    // Ruídos base (branco e marrom) em loop.
    const mkNoise = (brown) => {
      const len = sr * 3;
      const buf = ctx.createBuffer(1, len, sr);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (brown) {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        } else d[i] = w;
      }
      return buf;
    };
    this.white = mkNoise(false);
    this.brown = mkNoise(true);
    const loop = (buf, filterType, freq, q = 0.7) => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const f = ctx.createBiquadFilter();
      f.type = filterType;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      return { src, f, g };
    };
    this.wind = loop(this.white, 'bandpass', 420, 0.6);
    this.rain = loop(this.white, 'highpass', 1600, 0.5);
    this.roar = loop(this.brown, 'lowpass', 220, 0.9);
    this.roar2 = loop(this.white, 'bandpass', 900, 0.4);
    this.road = loop(this.brown, 'lowpass', 300, 0.7);
    // Motor.
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 40;
    const of = ctx.createBiquadFilter();
    of.type = 'lowpass';
    of.frequency.value = 400;
    const og = ctx.createGain();
    og.gain.value = 0;
    osc.connect(of).connect(og).connect(this.master);
    osc.start();
    this.engine = { osc, f: of, g: og };
    // Sirene de alerta de tornado (EUA/Canadá).
    const so = ctx.createOscillator();
    so.type = 'sine';
    so.frequency.value = 500;
    const so2 = ctx.createOscillator();
    so2.type = 'triangle';
    so2.frequency.value = 750;
    const sg = ctx.createGain();
    sg.gain.value = 0;
    so.connect(sg);
    so2.connect(sg);
    sg.connect(this.master);
    so.start();
    so2.start();
    this.siren = { so, so2, g: sg };
    this.hailT = 0;
  }

  // Atualização contínua dos sons ambientes.
  update(dt, s) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const set = (param, v, tc = 0.15) => param.setTargetAtTime(v, t, tc);
    this.master.gain.setTargetAtTime(this.enabled ? this.volume : 0, t, 0.1);
    const inside = s.inside ? 0.45 : 1;
    // Vento com rajadas.
    const gust = 0.75 + 0.25 * Math.sin(t * 0.7) * Math.sin(t * 1.9);
    set(this.wind.g.gain, Math.min(0.5, (s.wind / 45) ** 1.5) * gust * inside + 0.015);
    set(this.wind.f.frequency, 250 + s.wind * 14);
    set(this.rain.g.gain, Math.min(0.32, s.rain * 0.3) * (s.inside ? 0.7 : 1));
    // Rugido do tornado: cresce com a intensidade e com a proximidade.
    const roar = s.tornado ? Math.min(1, (s.tornado.vmax / 70) * Math.min(1, 900 / Math.max(80, s.tornado.dist))) : 0;
    set(this.roar.g.gain, roar * 0.9, 0.3);
    set(this.roar.f.frequency, 120 + roar * 260 + Math.sin(t * 0.4) * 30, 0.3);
    set(this.roar2.g.gain, roar * roar * 0.25, 0.3);
    // Motor e rodagem.
    const rpm = 0.25 + Math.min(1, s.speed / 30) * 0.7 + s.throttle * 0.25;
    set(this.engine.osc.frequency, 38 + rpm * 120, 0.08);
    set(this.engine.g.gain, s.driving ? 0.05 + s.throttle * 0.05 : 0, 0.1);
    set(this.engine.f.frequency, 250 + rpm * 900, 0.1);
    set(this.road.g.gain, Math.min(0.25, s.speed / 120) * (s.offroad ? 1.8 : 1), 0.2);
    // Granizo batendo na lataria.
    if (s.hail > 0.02) {
      this.hailT -= dt;
      while (this.hailT < 0) {
        this.hailT += 0.02 + Math.random() * (0.12 / (0.2 + s.hail * 3));
        this.click(0.06 + Math.random() * s.hail * 0.4, 1800 + Math.random() * 2400, s.hailSize);
      }
    }
    // Sirene: sobe e desce lentamente.
    const sv = s.siren || 0;
    const ph = (t % 9) / 9;
    const f = 420 + 380 * Math.sin(ph * Math.PI);
    set(this.siren.so.frequency, f, 0.4);
    set(this.siren.so2.frequency, f * 1.5, 0.4);
    set(this.siren.g.gain, sv * 0.05, 0.5);
  }

  click(gain, freq, size = 2) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.white;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq / Math.max(1, size * 0.6);
    f.Q.value = 3;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + size * 0.01);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 2, 0.1);
  }

  // Trovão: chega depois do relâmpago (343 m/s).
  thunder(dist, power = 1) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const delay = dist / 343;
    const t0 = ctx.currentTime + delay;
    const near = dist < 1500;
    const vol = Math.min(1, 2200 / Math.max(300, dist)) * power * 0.7;
    const parts = near ? 4 : 2;
    for (let i = 0; i < parts; i++) {
      const src = ctx.createBufferSource();
      src.buffer = this.brown;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = near && i === 0 ? 1800 : 380 - Math.min(250, dist / 60);
      const g = ctx.createGain();
      const s = t0 + i * (0.25 + Math.random() * 0.5);
      const dur = 1.2 + Math.random() * (near ? 2 : 4);
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(vol * (i === 0 ? 1 : 0.6), s + (near && i === 0 ? 0.02 : 0.3));
      g.gain.exponentialRampToValueAtTime(0.0001, s + dur);
      src.connect(f).connect(g).connect(this.master);
      src.start(s, Math.random() * 2);
      src.stop(s + dur + 0.1);
    }
  }

  // Tom de alerta de emergência (dois tons alternados).
  alert() {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const o = ctx.createOscillator();
      o.frequency.value = i % 2 ? 960 : 853;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.22);
      g.gain.exponentialRampToValueAtTime(0.09, t + i * 0.22 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.22 + 0.2);
      o.connect(g).connect(this.master);
      o.start(t + i * 0.22);
      o.stop(t + i * 0.22 + 0.22);
    }
  }

  beep(freq = 880, dur = 0.08, vol = 0.06) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  horn(on) {
    if (!this.ctx) return;
    if (on && !this.hornNodes) {
      const ctx = this.ctx;
      const g = ctx.createGain();
      g.gain.value = 0.06;
      const o1 = ctx.createOscillator();
      o1.type = 'square';
      o1.frequency.value = 415;
      const o2 = ctx.createOscillator();
      o2.type = 'square';
      o2.frequency.value = 523;
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1800;
      o1.connect(f);
      o2.connect(f);
      f.connect(g).connect(this.master);
      o1.start();
      o2.start();
      this.hornNodes = { o1, o2, g };
    } else if (!on && this.hornNodes) {
      this.hornNodes.o1.stop();
      this.hornNodes.o2.stop();
      this.hornNodes = null;
    }
  }

  // Estalo de clarão elétrico (poste arrebentando).
  zap(dist) {
    if (!this.ctx) return;
    this.click(Math.min(0.3, 300 / Math.max(50, dist)), 600, 3);
  }

  shutter() {
    if (!this.ctx) return;
    this.click(0.15, 3000, 0.5);
    setTimeout(() => this.click(0.1, 2200, 0.5), 70);
  }
}

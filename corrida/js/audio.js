// Áudio procedural (Web Audio): motor, pneus cantando, vento, batidas e bipes.
export class AudioFX {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(ctx.destination);

    // motor: osciladores + distorção + passa-baixa
    this.engGain = ctx.createGain();
    this.engGain.gain.value = 0;
    this.engFilter = ctx.createBiquadFilter();
    this.engFilter.type = 'lowpass';
    this.engFilter.frequency.value = 800;
    this.engFilter.Q.value = 2;
    const shaper = ctx.createWaveShaper();
    const curve = new Float32Array(512);
    for (let i = 0; i < 512; i++) {
      const x = (i / 511) * 2 - 1;
      curve[i] = Math.tanh(x * 2.5);
    }
    shaper.curve = curve;
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    this.oscs = [
      [ctx.createOscillator(), 'sawtooth', 1, 0.5],
      [ctx.createOscillator(), 'square', 0.5, 0.35],
      [ctx.createOscillator(), 'sawtooth', 2.01, 0.15],
    ].map(([o, type, mul, g]) => {
      o.type = type;
      const gn = ctx.createGain();
      gn.gain.value = g;
      o.connect(gn).connect(mix);
      o.start();
      return { o, mul };
    });
    mix.connect(shaper).connect(this.engFilter).connect(this.engGain).connect(this.master);

    // ruído
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    const noise = (filterType, freq, q) => {
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
      return { g, f };
    };
    this.screech = noise('bandpass', 2300, 7);
    this.wind = noise('lowpass', 500, 0.7);
    this.rumble = noise('lowpass', 120, 1);
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  }

  update(car, active) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const on = active ? 1 : 0;
    const rpm = car ? car.rpm : 900;
    const f = (rpm / 60) * 2; // V8: 4 explosões por volta do virabrequim / 2
    for (const { o, mul } of this.oscs) o.frequency.setTargetAtTime(f * mul, t, 0.02);
    const thr = car ? car.throttle : 0;
    this.engFilter.frequency.setTargetAtTime(400 + thr * 1800 + rpm * 0.15, t, 0.05);
    this.engGain.gain.setTargetAtTime(on * (0.12 + thr * 0.16), t, 0.05);
    let slip = 0;
    let speed = 0;
    let grass = 0;
    if (car) {
      for (const w of car.wheels) if (w.contact && w.surface !== 2) slip = Math.max(slip, Math.max(w.slipLat - 2.5, w.slipLong - 1.5));
      speed = car.speed;
      grass = car.onGrass > 0 ? Math.min(1, speed / 15) : 0;
    }
    this.screech.g.gain.setTargetAtTime(on * Math.min(0.22, Math.max(0, slip) * 0.03), t, 0.04);
    this.screech.f.frequency.setTargetAtTime(1900 + Math.min(slip, 10) * 60, t, 0.1);
    this.wind.g.gain.setTargetAtTime(on * Math.min(0.25, speed * speed * 0.00006), t, 0.1);
    this.rumble.g.gain.setTargetAtTime(on * grass * 0.5, t, 0.1);
  }

  crash(intensity) {
    if (!this.ctx || intensity < 1) return;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 900;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    const v = Math.min(1, intensity / 12);
    g.gain.setValueAtTime(v * 0.9, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35 + v * 0.3);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random());
    src.stop(t + 0.8);
  }

  beep(freq = 660, dur = 0.18) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = freq;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.18, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}

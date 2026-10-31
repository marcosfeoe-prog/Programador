// Áudio procedural: vento (ruído filtrado), ronco do tornado, trovões,
// obturador da câmera e bipes da sonda.
export class Audio {
  constructor() {
    this.ctx = null;
  }

  start() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = 0.8;
    this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 4;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) {
      b = (b + 0.02 * (Math.random() * 2 - 1)) / 1.02; // ruído marrom
      d[i] = b * 3.5;
    }
    this.noise = buf;
    const loop = (freq, q, type = 'lowpass') => {
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.playbackRate.value = 0.7 + Math.random() * 0.6;
      const f = ctx.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = 0;
      src.connect(f).connect(g).connect(this.master);
      src.start();
      return { f, g, src };
    };
    this.wind = loop(500, 0.7, 'bandpass');
    this.gust = loop(1400, 1.2, 'bandpass');
    this.roar = loop(90, 0.9);
    this.rumble = loop(40, 0.5);
    this.rain = loop(3500, 0.4, 'highpass');
  }

  update(windSpeed, torDist, torVmax, rainAmt, time) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const w = Math.min(1, windSpeed / 60);
    this.wind.g.gain.setTargetAtTime(0.05 + w * 0.6, t, 0.2);
    this.wind.f.frequency.setTargetAtTime(300 + w * 900 + Math.sin(time * 0.7) * 120, t, 0.3);
    this.gust.g.gain.setTargetAtTime(w * w * 0.35 * (0.6 + 0.4 * Math.sin(time * 1.3)), t, 0.2);
    const near = torVmax > 0 ? Math.min(1, (torVmax / 80) * Math.min(1, 900 / Math.max(torDist, 60))) : 0;
    this.roar.g.gain.setTargetAtTime(near * 1.2, t, 0.4);
    this.rumble.g.gain.setTargetAtTime(near * 1.6, t, 0.4);
    this.rain.g.gain.setTargetAtTime(rainAmt * 0.25, t, 0.5);
  }

  thunder(dist) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const delay = dist / 343;
    const t0 = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.5;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = Math.max(80, 900 - dist * 0.08);
    const g = ctx.createGain();
    const vol = Math.min(1.4, 3000 / Math.max(dist, 500));
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + 0.08);
    g.gain.exponentialRampToValueAtTime(vol * 0.4, t0 + 0.9);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 4.5);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0, Math.random() * 2);
    src.stop(t0 + 5);
  }

  click() {
    this.beep(1800, 0.03, 0.4, 'square');
    setTimeout(() => this.beep(1200, 0.04, 0.3, 'square'), 70);
  }

  beep(freq, dur = 0.12, vol = 0.25, type = 'sine') {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    o.connect(g).connect(this.master);
    o.start();
    o.stop(ctx.currentTime + dur + 0.02);
  }
}

// Áudio 100% procedural (Web Audio): tiros por arma, passos, recarga, impacto,
// bipes da bomba, explosões e zumbido da granada de luz. Som posicional (3D).

const SR = 44100;

function noise(n) {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.random() * 2 - 1;
  return a;
}

// Filtro de um polo (passa-baixas / passa-altas) aplicado no lugar.
function lp(x, f) {
  const a = Math.exp((-2 * Math.PI * f) / SR);
  let y = 0;
  for (let i = 0; i < x.length; i++) x[i] = y = (1 - a) * x[i] + a * y;
  return x;
}
function hp(x, f) {
  const a = Math.exp((-2 * Math.PI * f) / SR);
  let y = 0;
  let px = 0;
  for (let i = 0; i < x.length; i++) {
    y = a * (y + x[i] - px);
    px = x[i];
    x[i] = y;
  }
  return x;
}
function env(x, attack, decay, start = 0) {
  for (let i = 0; i < x.length; i++) {
    const t = i / SR - start;
    if (t < 0) x[i] = 0;
    else x[i] *= t < attack ? t / attack : Math.exp(-(t - attack) / decay);
  }
  return x;
}
function mix(out, x, g = 1, off = 0) {
  const o = Math.floor(off * SR);
  for (let i = 0; i < x.length && i + o < out.length; i++) out[i + o] += x[i] * g;
  return out;
}
function tone(n, f0, f1, decay, type = 'sin') {
  const a = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const f = f1 + (f0 - f1) * Math.exp(-t * 30);
    ph += (2 * Math.PI * f) / SR;
    const s = type === 'sq' ? Math.sign(Math.sin(ph)) * 0.6 : Math.sin(ph);
    a[i] = s * Math.exp(-t / decay);
  }
  return a;
}
function normalize(x, peak = 0.9) {
  let m = 0;
  for (let i = 0; i < x.length; i++) m = Math.max(m, Math.abs(x[i]));
  if (m > 0) for (let i = 0; i < x.length; i++) x[i] *= peak / m;
  return x;
}

// Tiro: estalo + corpo + baque grave + cauda (eco do mapa).
function gunshot({ crack = 2000, crackDecay = 0.02, body = 900, bodyDecay = 0.09, thump = 90, thumpG = 0.8, tail = 0.5, tailG = 0.25, len = 1.0, peak = 0.95 }) {
  const n = Math.floor(len * SR);
  const out = new Float32Array(n);
  mix(out, env(hp(noise(n), crack), 0.0005, crackDecay), 1.0);
  mix(out, env(lp(noise(n), body), 0.001, bodyDecay), 1.4);
  mix(out, tone(n, thump * 2.2, thump, 0.08), thumpG);
  mix(out, env(lp(lp(noise(n), 700), 900), 0.02, tail), tailG, 0.03);
  return normalize(out, peak);
}

const GEN = {
  ak: () => gunshot({ crack: 1500, body: 800, bodyDecay: 0.11, thump: 75, thumpG: 1, tail: 0.6, tailG: 0.3 }),
  m4: () => gunshot({ crack: 2200, body: 1100, bodyDecay: 0.08, thump: 95, thumpG: 0.7, tail: 0.5 }),
  rifle: () => gunshot({ crack: 1900, body: 1000, bodyDecay: 0.09, thump: 85, tail: 0.5 }),
  smg: () => gunshot({ crack: 2600, body: 1300, bodyDecay: 0.06, thump: 110, thumpG: 0.5, tail: 0.35, tailG: 0.18 }),
  pistol: () => gunshot({ crack: 2400, body: 1300, bodyDecay: 0.06, thump: 120, thumpG: 0.5, tail: 0.35, tailG: 0.2 }),
  silenced: () => gunshot({ crack: 3500, crackDecay: 0.008, body: 600, bodyDecay: 0.04, thump: 160, thumpG: 0.3, tail: 0.12, tailG: 0.05, len: 0.4, peak: 0.45 }),
  deagle: () => gunshot({ crack: 1300, body: 700, bodyDecay: 0.14, thump: 70, thumpG: 1.2, tail: 0.8, tailG: 0.35, len: 1.3 }),
  shotgun: () => gunshot({ crack: 1100, body: 600, bodyDecay: 0.16, thump: 60, thumpG: 1.3, tail: 0.8, tailG: 0.4, len: 1.3 }),
  awp: () => gunshot({ crack: 900, crackDecay: 0.03, body: 500, bodyDecay: 0.2, thump: 55, thumpG: 1.5, tail: 1.3, tailG: 0.45, len: 1.8 }),
  scout: () => gunshot({ crack: 1800, body: 900, bodyDecay: 0.12, thump: 80, thumpG: 0.9, tail: 0.8, tailG: 0.3, len: 1.2 }),
  knife: () => {
    const n = Math.floor(0.25 * SR);
    const x = noise(n);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      x[i] *= Math.sin((t / 0.25) * Math.PI) * 0.6;
    }
    return normalize(hp(lp(x, 4000), 900), 0.5);
  },
  step: () => {
    const n = Math.floor(0.12 * SR);
    const out = env(lp(hp(noise(n), 200), 1800), 0.002, 0.025);
    mix(out, env(lp(noise(n), 300), 0.001, 0.03), 0.8);
    return normalize(out, 0.6);
  },
  land: () => normalize(env(lp(noise(Math.floor(0.25 * SR)), 500), 0.002, 0.05), 0.8),
  flesh: () => {
    const n = Math.floor(0.2 * SR);
    const out = env(lp(noise(n), 900), 0.001, 0.04);
    mix(out, tone(n, 200, 90, 0.04), 0.6);
    return normalize(out, 0.7);
  },
  headshot: () => {
    const n = Math.floor(0.5 * SR);
    const out = tone(n, 2400, 2000, 0.09);
    mix(out, tone(n, 3600, 3300, 0.05), 0.5);
    mix(out, env(hp(noise(n), 3000), 0.0005, 0.01), 0.6);
    return normalize(out, 0.6);
  },
  ric: () => {
    const n = Math.floor(0.25 * SR);
    const out = env(hp(noise(n), 2500), 0.0005, 0.02);
    mix(out, env(lp(noise(n), 1200), 0.001, 0.04), 0.5);
    return normalize(out, 0.4);
  },
  click: () => normalize(env(hp(noise(Math.floor(0.06 * SR)), 2000), 0.0003, 0.006), 0.5),
  magout: () => {
    const n = Math.floor(0.2 * SR);
    const out = env(hp(noise(n), 1500), 0.0005, 0.01);
    mix(out, tone(n, 900, 700, 0.03), 0.3);
    return normalize(out, 0.5);
  },
  magin: () => {
    const n = Math.floor(0.2 * SR);
    const out = env(hp(noise(n), 1000), 0.0005, 0.015);
    mix(out, env(hp(noise(n), 1500), 0.0005, 0.01), 0.8, 0.05);
    return normalize(out, 0.6);
  },
  bolt: () => {
    const n = Math.floor(0.3 * SR);
    const out = env(hp(noise(n), 1200), 0.0005, 0.02);
    mix(out, env(hp(noise(n), 1800), 0.0005, 0.02), 1, 0.12);
    return normalize(out, 0.6);
  },
  beep: () => {
    const n = Math.floor(0.13 * SR);
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = Math.sin((2 * Math.PI * 1980 * i) / SR) * Math.min(1, (n - i) / 400) * 0.5;
    return a;
  },
  plantbeep: () => {
    const n = Math.floor(0.08 * SR);
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = Math.sign(Math.sin((2 * Math.PI * 1200 * i) / SR)) * 0.15 * Math.min(1, (n - i) / 200);
    return a;
  },
  explode: () => {
    const n = Math.floor(2.5 * SR);
    const out = env(lp(noise(n), 400), 0.005, 0.6);
    mix(out, env(lp(noise(n), 1500), 0.002, 0.15), 0.8);
    mix(out, tone(n, 90, 35, 0.4), 1.2);
    return normalize(out, 1);
  },
  he: () => {
    const n = Math.floor(1.6 * SR);
    const out = env(lp(noise(n), 900), 0.002, 0.3);
    mix(out, env(hp(noise(n), 1500), 0.001, 0.05), 0.8);
    mix(out, tone(n, 120, 45, 0.25), 1);
    return normalize(out, 1);
  },
  flashpop: () => {
    const n = Math.floor(0.6 * SR);
    const out = env(hp(noise(n), 800), 0.0005, 0.05);
    mix(out, tone(n, 200, 80, 0.08), 0.6);
    return normalize(out, 0.9);
  },
  smokehiss: () => {
    const n = Math.floor(2.0 * SR);
    const out = hp(noise(n), 2500);
    for (let i = 0; i < n; i++) out[i] *= Math.min(1, i / 2000) * Math.exp(-i / SR / 1.0) * 0.4;
    return out;
  },
  bounce: () => {
    const n = Math.floor(0.1 * SR);
    const out = tone(n, 1400, 1100, 0.02);
    mix(out, env(hp(noise(n), 2000), 0.0003, 0.008), 0.5);
    return normalize(out, 0.4);
  },
  pin: () => {
    const n = Math.floor(0.2 * SR);
    const out = tone(n, 3000, 2600, 0.03);
    mix(out, env(hp(noise(n), 3000), 0.0003, 0.01), 0.5, 0.06);
    return normalize(out, 0.35);
  },
  buy: () => {
    const n = Math.floor(0.3 * SR);
    const out = tone(n, 1800, 1700, 0.05);
    mix(out, tone(n, 2600, 2500, 0.08), 0.6, 0.06);
    return normalize(out, 0.35);
  },
  ring: () => {
    const n = Math.floor(3.5 * SR);
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      a[i] = Math.sin(2 * Math.PI * 3800 * t) * 0.18 * Math.min(1, t * 20) * Math.exp(-t / 1.6);
    }
    return a;
  },
  win: () => {
    const n = Math.floor(1.6 * SR);
    const out = new Float32Array(n);
    [523, 659, 784].forEach((f, k) => mix(out, tone(n, f, f, 0.6), 0.3, k * 0.12));
    return out;
  },
  lose: () => {
    const n = Math.floor(1.6 * SR);
    const out = new Float32Array(n);
    [392, 311, 262].forEach((f, k) => mix(out, tone(n, f, f, 0.6), 0.3, k * 0.14));
    return out;
  },
  hitmark: () => normalize(tone(Math.floor(0.08 * SR), 1600, 1400, 0.015), 0.25),
  deny: () => normalize(tone(Math.floor(0.15 * SR), 220, 200, 0.06, 'sq'), 0.25),
};

export class AudioSys {
  constructor() {
    this.ctx = null;
    this.buffers = {};
    this.volume = 0.7;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    const comp = this.ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(this.ctx.destination);
    // filtro para a surdez da granada de luz
    this.deafen = this.ctx.createBiquadFilter();
    this.deafen.type = 'lowpass';
    this.deafen.frequency.value = 22000;
    this.deafen.connect(this.master);
    for (const k in GEN) {
      const data = GEN[k]();
      const b = this.ctx.createBuffer(1, data.length, SR);
      b.copyToChannel(data, 0);
      this.buffers[k] = b;
    }
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setListener(pos, fwd) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setValueAtTime(pos.x, t);
      l.positionY.setValueAtTime(pos.y, t);
      l.positionZ.setValueAtTime(pos.z, t);
      l.forwardX.setValueAtTime(fwd.x, t);
      l.forwardY.setValueAtTime(fwd.y, t);
      l.forwardZ.setValueAtTime(fwd.z, t);
      l.upX.setValueAtTime(0, t);
      l.upY.setValueAtTime(1, t);
      l.upZ.setValueAtTime(0, t);
    } else {
      l.setPosition(pos.x, pos.y, pos.z);
      l.setOrientation(fwd.x, fwd.y, fwd.z, 0, 1, 0);
    }
  }

  // Muffle temporário (granada de luz/explosão perto).
  muffle(amount, dur) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = this.deafen.frequency;
    f.cancelScheduledValues(t);
    f.setValueAtTime(Math.max(300, 22000 * (1 - amount)), t);
    f.exponentialRampToValueAtTime(22000, t + dur);
  }

  play(name, pos = null, vol = 1, rate = 1, ref = 4) {
    if (!this.ctx || !this.buffers[name]) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.buffers[name];
    src.playbackRate.value = rate;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(g);
    if (pos) {
      const p = this.ctx.createPanner();
      p.panningModel = 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = ref;
      p.rolloffFactor = 1.1;
      p.maxDistance = 300;
      if (p.positionX) {
        p.positionX.value = pos.x;
        p.positionY.value = pos.y;
        p.positionZ.value = pos.z;
      } else p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p).connect(this.deafen);
    } else g.connect(this.deafen);
    src.start();
    return src;
  }
}

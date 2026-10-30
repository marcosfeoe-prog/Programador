// Áudio procedural (Web Audio): motor sintetizado conforme o tipo, pneus, vento,
// sons ambientes (pássaros, grilos, ondas, chuva), buzina e efeitos de interface.
import { clamp, lerp } from './util.js';
import { Radio } from './music.js';

function noiseBuffer(ctx, sec = 2, brown = false) {
  const n = Math.floor(ctx.sampleRate * sec);
  const b = ctx.createBuffer(1, n, ctx.sampleRate);
  const d = b.getChannelData(0);
  let last = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    if (brown) {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    } else d[i] = w;
  }
  return b;
}

const ENGINE = {
  v8: { sub: 0.9, h1: 0.6, h2: 0.25, noise: 0.25, rumble: 0.5, cut: 1.0, drive: 2.2 },
  flat6: { sub: 0.4, h1: 0.7, h2: 0.45, noise: 0.45, rumble: 0.2, cut: 1.3, drive: 3.0 },
  w16: { sub: 0.6, h1: 0.6, h2: 0.4, noise: 0.15, rumble: 0.1, cut: 0.9, drive: 1.5 },
  v6hi: { sub: 0.3, h1: 0.7, h2: 0.6, noise: 0.3, rumble: 0.1, cut: 1.7, drive: 3.2 },
  i4turbo: { sub: 0.35, h1: 0.8, h2: 0.35, noise: 0.4, rumble: 0.15, cut: 1.2, drive: 2.6, turbo: true },
  i6: { sub: 0.4, h1: 0.7, h2: 0.3, noise: 0.25, rumble: 0.1, cut: 1.0, drive: 1.8 },
  flat4: { sub: 0.7, h1: 0.5, h2: 0.2, noise: 0.5, rumble: 0.7, cut: 0.8, drive: 2.4 },
};

export class AudioEngine {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ok = false;
    this.inside = false;
  }

  // precisa de um gesto do usuário
  start() {
    if (this.ctx) {
      if (this.ctx.state !== 'running') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    this.master = ctx.createGain();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(ctx.destination);
    this.engineBus = ctx.createGain();
    this.ambBus = ctx.createGain();
    this.sfxBus = ctx.createGain();
    this.musicBus = ctx.createGain();
    // filtro de cabine: o motor fica abafado do lado de dentro
    this.cabin = ctx.createBiquadFilter();
    this.cabin.type = 'lowpass';
    this.cabin.frequency.value = 9000;
    this.engineBus.connect(this.cabin).connect(this.master);
    this.ambBus.connect(this.master);
    this.sfxBus.connect(this.master);
    this.musicBus.connect(this.master);
    this.noise = noiseBuffer(ctx, 2);
    this.brown = noiseBuffer(ctx, 3, true);
    this.buildEngine();
    this.buildAmbient();
    this.radio = new Radio(ctx, this.musicBus);
    this.ok = true;
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ok) return;
    const s = this.settings;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(s.volMaster, t, 0.1);
    this.engineBus.gain.setTargetAtTime(s.volEngine * 0.9, t, 0.1);
    this.ambBus.gain.setTargetAtTime(s.volAmbient, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(0.8, t, 0.1);
    this.musicBus.gain.setTargetAtTime(s.volMusic * 0.8, t, 0.1);
  }

  src(buf, loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    s.loop = loop;
    s.start();
    return s;
  }

  buildEngine() {
    const ctx = this.ctx;
    const E = (this.E = {});
    E.out = ctx.createGain();
    E.out.gain.value = 0;
    E.lp = ctx.createBiquadFilter();
    E.lp.type = 'lowpass';
    E.lp.Q.value = 0.9;
    E.shaper = ctx.createWaveShaper();
    E.lp.connect(E.shaper);
    E.shaper.connect(E.out);
    E.out.connect(this.engineBus);
    const osc = (type) => {
      const o = ctx.createOscillator();
      o.type = type;
      const g = ctx.createGain();
      o.connect(g);
      g.connect(E.lp);
      o.start();
      return { o, g };
    };
    E.sub = osc('square');
    E.h1 = osc('sawtooth');
    E.h2 = osc('sawtooth');
    E.h3 = osc('triangle');
    // ronco: modulação de amplitude na frequência de explosão / 2
    E.am = ctx.createGain();
    E.lp.disconnect();
    E.lp.connect(E.am);
    E.am.connect(E.shaper);
    E.amOsc = ctx.createOscillator();
    E.amOsc.type = 'sine';
    E.amDepth = ctx.createGain();
    E.amOsc.connect(E.amDepth);
    E.amDepth.connect(E.am.gain);
    E.amOsc.start();
    // ruído de admissão / escape
    E.nz = this.src(this.noise);
    E.nbp = ctx.createBiquadFilter();
    E.nbp.type = 'bandpass';
    E.nbp.Q.value = 1.4;
    E.ng = ctx.createGain();
    E.nz.connect(E.nbp).connect(E.ng).connect(E.out);
    // turbo
    E.turbo = ctx.createOscillator();
    E.turbo.type = 'sine';
    E.tg = ctx.createGain();
    E.tg.gain.value = 0;
    E.turbo.connect(E.tg).connect(E.out);
    E.turbo.start();
    // pneus e rolagem
    E.roll = this.src(this.brown);
    E.rollF = ctx.createBiquadFilter();
    E.rollF.type = 'lowpass';
    E.rollF.frequency.value = 400;
    E.rollG = ctx.createGain();
    E.rollG.gain.value = 0;
    E.roll.connect(E.rollF).connect(E.rollG).connect(this.engineBus);
    E.sq = this.src(this.noise);
    E.sqF = ctx.createBiquadFilter();
    E.sqF.type = 'bandpass';
    E.sqF.frequency.value = 1100;
    E.sqF.Q.value = 5;
    E.sqG = ctx.createGain();
    E.sqG.gain.value = 0;
    E.sq.connect(E.sqF).connect(E.sqG).connect(this.engineBus);
    E.gravel = this.src(this.noise);
    E.gvF = ctx.createBiquadFilter();
    E.gvF.type = 'bandpass';
    E.gvF.frequency.value = 2400;
    E.gvF.Q.value = 0.6;
    E.gvG = ctx.createGain();
    E.gvG.gain.value = 0;
    E.gravel.connect(E.gvF).connect(E.gvG).connect(this.engineBus);
    // vento
    E.wind = this.src(this.noise);
    E.wF = ctx.createBiquadFilter();
    E.wF.type = 'lowpass';
    E.wF.frequency.value = 600;
    E.wG = ctx.createGain();
    E.wG.gain.value = 0;
    E.wind.connect(E.wF).connect(E.wG).connect(this.master);
    this.setEngineKind('v8');
  }

  setEngineKind(kind) {
    if (!this.ok) {
      this.pendingKind = kind;
      return;
    }
    this.kind = ENGINE[kind] || ENGINE.v8;
    const k = this.kind.drive;
    const n = 1024;
    const curve = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(x * k) / Math.tanh(k);
    }
    this.E.shaper.curve = curve;
  }

  // telemetria do carro a cada quadro
  updateCar(t) {
    if (!this.ok) return;
    if (this.pendingKind) {
      this.setEngineKind(this.pendingKind);
      this.pendingKind = null;
    }
    const E = this.E;
    const K = this.kind;
    const now = this.ctx.currentTime;
    const tc = 0.04;
    const rpm = t.rpm;
    const f = (rpm / 60) * (t.cyl / 2) * (t.pitch || 1);
    const load = clamp(t.throttle, 0, 1);
    const on = t.engineOn ? 1 : 0;
    E.sub.o.frequency.setTargetAtTime(f * 0.5, now, tc);
    E.h1.o.frequency.setTargetAtTime(f, now, tc);
    E.h2.o.frequency.setTargetAtTime(f * 2.01, now, tc);
    E.h3.o.frequency.setTargetAtTime(f * 3.0, now, tc);
    E.sub.g.gain.setTargetAtTime(K.sub * 0.35, now, tc);
    E.h1.g.gain.setTargetAtTime(K.h1 * 0.25, now, tc);
    E.h2.g.gain.setTargetAtTime(K.h2 * 0.18 * (0.5 + load), now, tc);
    E.h3.g.gain.setTargetAtTime(K.h2 * 0.12 * (0.3 + load), now, tc);
    E.amOsc.frequency.setTargetAtTime(f * 0.5, now, tc);
    E.amDepth.gain.setTargetAtTime(K.rumble * 0.45 * (1 - (rpm / t.redline) * 0.6), now, tc);
    E.am.gain.setTargetAtTime(0.7, now, tc);
    E.lp.frequency.setTargetAtTime((350 + f * 2.2 + load * 2400) * K.cut, now, tc);
    E.nbp.frequency.setTargetAtTime(f * 3.5 + 300, now, tc);
    E.ng.gain.setTargetAtTime(K.noise * (0.05 + load * 0.25) * (0.4 + rpm / t.redline), now, tc);
    const vol = on * (0.16 + load * 0.2 + (rpm / t.redline) * 0.1) * (t.shifting ? 0.55 : 1);
    E.out.gain.setTargetAtTime(vol, now, 0.03);
    if (K.turbo) {
      const boost = clamp((rpm / t.redline - 0.3) * 1.6, 0, 1) * load;
      E.turbo.frequency.setTargetAtTime(2200 + boost * 5200, now, 0.08);
      E.tg.gain.setTargetAtTime(boost * 0.018, now, 0.08);
      // alívio da válvula ao tirar o pé
      if (this.lastLoad > 0.7 && load < 0.1 && rpm > t.redline * 0.45) this.blowoff();
    } else E.tg.gain.setTargetAtTime(0, now, 0.1);
    this.lastLoad = load;
    const sp = Math.abs(t.speed);
    const surfRough = t.surface === 0 ? 0 : t.surface === 1 || t.surface === 3 || t.surface === 4 ? 1 : 0.6;
    E.rollG.gain.setTargetAtTime(Math.min(0.5, sp * 0.012) * (1 + surfRough), now, 0.1);
    E.rollF.frequency.setTargetAtTime(200 + sp * 6, now, 0.1);
    E.gvG.gain.setTargetAtTime(surfRough * Math.min(0.12, sp * 0.006), now, 0.1);
    E.sqG.gain.setTargetAtTime(t.surface === 0 ? clamp(t.slip, 0, 1) * 0.12 : 0, now, 0.05);
    E.sqF.frequency.setTargetAtTime(900 + sp * 6, now, 0.1);
    const wv = clamp((sp - 5) / 60, 0, 1);
    E.wG.gain.setTargetAtTime(wv * wv * (this.inside ? 0.05 : 0.14) * this.settings.volEngine, now, 0.2);
    E.wF.frequency.setTargetAtTime(400 + sp * 12, now, 0.2);
    this.cabin.frequency.setTargetAtTime(this.inside ? 2400 : 12000, now, 0.2);
  }

  blowoff() {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 3200;
    f.Q.value = 2;
    const g = ctx.createGain();
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.08, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    f.frequency.exponentialRampToValueAtTime(1200, t + 0.35);
    s.connect(f).connect(g).connect(this.engineBus);
    s.start(t);
    s.stop(t + 0.4);
  }

  // ------------------------------------------------------------ ambiente
  buildAmbient() {
    const ctx = this.ctx;
    const A = (this.A = {});
    A.waves = this.src(this.brown);
    A.wvF = ctx.createBiquadFilter();
    A.wvF.type = 'lowpass';
    A.wvF.frequency.value = 600;
    A.wvG = ctx.createGain();
    A.wvG.gain.value = 0;
    A.waves.connect(A.wvF).connect(A.wvG).connect(this.ambBus);
    A.rain = this.src(this.noise);
    A.rnF = ctx.createBiquadFilter();
    A.rnF.type = 'highpass';
    A.rnF.frequency.value = 900;
    A.rnG = ctx.createGain();
    A.rnG.gain.value = 0;
    A.rain.connect(A.rnF).connect(A.rnG).connect(this.ambBus);
    // grilos
    A.cr = ctx.createOscillator();
    A.cr.frequency.value = 4300;
    A.crAm = ctx.createGain();
    A.crAm.gain.value = 0;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 28;
    const lfoG = ctx.createGain();
    lfoG.gain.value = 0.5;
    lfo.connect(lfoG).connect(A.crAm.gain);
    const gate = ctx.createOscillator();
    gate.frequency.value = 1.6;
    gate.type = 'square';
    const gateG = ctx.createGain();
    gateG.gain.value = 0.5;
    A.crG = ctx.createGain();
    A.crG.gain.value = 0;
    gate.connect(gateG).connect(A.crG.gain);
    A.cr.connect(A.crAm).connect(A.crG);
    A.crMaster = ctx.createGain();
    A.crMaster.gain.value = 0;
    A.crG.connect(A.crMaster).connect(this.ambBus);
    A.cr.start();
    lfo.start();
    gate.start();
    A.nextBird = 0;
  }

  bird(vol) {
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const g = ctx.createGain();
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    const base = 2200 + Math.random() * 2600;
    const notes = 2 + Math.floor(Math.random() * 5);
    g.gain.setValueAtTime(0.0001, t);
    let tt = t;
    for (let i = 0; i < notes; i++) {
      const d = 0.05 + Math.random() * 0.09;
      const f0 = base * (0.85 + Math.random() * 0.35);
      o.frequency.setValueAtTime(f0, tt);
      o.frequency.exponentialRampToValueAtTime(f0 * (Math.random() < 0.5 ? 1.35 : 0.75), tt + d);
      g.gain.exponentialRampToValueAtTime(vol * 0.05, tt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, tt + d);
      tt += d + 0.03 + Math.random() * 0.06;
    }
    o.connect(g);
    if (pan) {
      pan.pan.value = Math.random() * 2 - 1;
      g.connect(pan).connect(this.ambBus);
    } else g.connect(this.ambBus);
    o.start(t);
    o.stop(tt + 0.05);
  }

  // env: { day, forest, coast, rain, speed, inside, city }
  updateAmbient(env, dt) {
    if (!this.ok) return;
    const A = this.A;
    const now = this.ctx.currentTime;
    const quiet = clamp(1 - env.speed / 30, 0.15, 1) * (env.inside ? 0.6 : 1);
    A.wvG.gain.setTargetAtTime(env.coast * 0.35 * quiet, now, 0.5);
    A.wvF.frequency.setTargetAtTime(300 + 250 * (0.5 + 0.5 * Math.sin(now * 0.35)), now, 0.3);
    A.rnG.gain.setTargetAtTime(env.rain * (env.inside ? 0.25 : 0.12), now, 0.5);
    A.rnF.frequency.setTargetAtTime(env.inside ? 400 : 1200, now, 0.3);
    A.crMaster.gain.setTargetAtTime((1 - env.day) * 0.006 * quiet * (1 - env.rain), now, 1);
    A.nextBird -= dt;
    if (A.nextBird <= 0) {
      A.nextBird = 0.8 + Math.random() * 3.5 / Math.max(0.2, env.forest + 0.2);
      if (env.day > 0.5 && env.rain < 0.3 && Math.random() < 0.3 + env.forest * 0.7) this.bird(quiet * env.day);
    }
  }

  horn(on, kind) {
    if (!this.ok) return;
    const ctx = this.ctx;
    if (on && !this.hornNodes) {
      const g = ctx.createGain();
      g.gain.value = 0;
      g.gain.setTargetAtTime(0.09, ctx.currentTime, 0.01);
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 2200;
      const fs = kind === 'flat4' ? [330, 392] : kind === 'w16' ? [440, 554] : [410, 515];
      const oscs = fs.map((fr) => {
        const o = ctx.createOscillator();
        o.type = 'square';
        o.frequency.value = fr;
        o.connect(f);
        o.start();
        return o;
      });
      f.connect(g).connect(this.sfxBus);
      this.hornNodes = { g, oscs };
    } else if (!on && this.hornNodes) {
      const { g, oscs } = this.hornNodes;
      g.gain.setTargetAtTime(0, ctx.currentTime, 0.02);
      for (const o of oscs) o.stop(ctx.currentTime + 0.1);
      this.hornNodes = null;
    }
  }

  // sinos de chegada
  chime() {
    if (!this.ok) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.05;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const o2 = ctx.createOscillator();
      o2.frequency.value = f * 2.76;
      const g = ctx.createGain();
      const g2 = ctx.createGain();
      g2.gain.value = 0.25;
      const t = t0 + i * 0.16;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      o.connect(g);
      o2.connect(g2).connect(g);
      g.connect(this.sfxBus);
      o.start(t);
      o2.start(t);
      o.stop(t + 2.3);
      o2.stop(t + 2.3);
    });
  }

  click() {
    if (!this.ok) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(900, t);
    o.frequency.exponentialRampToValueAtTime(400, t + 0.05);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    o.connect(g).connect(this.sfxBus);
    o.start(t);
    o.stop(t + 0.07);
  }

  thump(v) {
    if (!this.ok) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const s = ctx.createBufferSource();
    s.buffer = this.brown;
    const g = ctx.createGain();
    g.gain.setValueAtTime(clamp(v, 0, 1) * 0.6, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 300;
    s.connect(f).connect(g).connect(this.sfxBus);
    s.start(t);
    s.stop(t + 0.35);
  }

  setInside(v) {
    this.inside = v;
  }

  duck(v) {
    if (!this.ok) return;
    this.master.gain.setTargetAtTime(this.settings.volMaster * v, this.ctx.currentTime, 0.3);
  }
}
void lerp;

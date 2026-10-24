// Áudio 100% procedural (Web Audio): rugidos com formantes, passos que fazem
// o chão tremer, mordidas, mastigação, goles d'água e ambiente (vento,
// pássaros de dia, grilos à noite, batimento cardíaco com pouca vida).
import { clamp, lerp } from './util.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.listener = { x: 0, y: 0, z: 0 };
    this.active = 0;
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
    this.master.connect(comp).connect(ctx.destination);

    // reverberação gerada (resposta ao impulso sintética)
    this.reverb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.2;
    const ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2);
    }
    this.reverb.buffer = ir;
    this.revGain = ctx.createGain();
    this.revGain.gain.value = 0.35;
    this.reverb.connect(this.revGain).connect(this.master);

    // buffer de ruído reutilizável
    const nb = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    this.noiseBuf = nb;

    // distorção para rugidos
    this.shapers = {};

    this.setupAmbient();
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  noise(loop = false) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = loop;
    if (!loop) s.loopStart = 0;
    return s;
  }

  shaper(amount) {
    const k = Math.round(amount * 10);
    if (this.shapers[k]) return this.shapers[k];
    const n = 1024;
    const curve = new Float32Array(n);
    const a = 1 + amount * 30;
    for (let i = 0; i < n; i++) {
      const x = (i / (n - 1)) * 2 - 1;
      curve[i] = Math.tanh(a * x) / Math.tanh(a);
    }
    this.shapers[k] = curve;
    return curve;
  }

  // ganho + pan para uma posição no mundo; null se longe demais
  spatial(pos, ref = 10, maxD = 250) {
    if (!this.ctx) return null;
    const dx = pos.x - this.listener.x;
    const dz = pos.z - this.listener.z;
    const d = Math.hypot(dx, dz, (pos.y || 0) - this.listener.y);
    if (d > maxD) return null;
    const g = clamp(ref / Math.max(ref, d), 0, 1) * clamp(1 - d / maxD, 0, 1) ** 0.5;
    const out = this.ctx.createGain();
    out.gain.value = g;
    const pan = this.ctx.createStereoPanner ? this.ctx.createStereoPanner() : null;
    if (pan) {
      // lado relativo à câmera
      const s = (dx * Math.cos(this.listenerYaw || 0) - dz * Math.sin(this.listenerYaw || 0)) / Math.max(d, 1);
      pan.pan.value = clamp(-s, -0.85, 0.85);
      out.connect(pan).connect(this.master);
      const send = this.ctx.createGain();
      send.gain.value = clamp(d / 80, 0.1, 0.8);
      pan.connect(send).connect(this.reverb);
    } else out.connect(this.master);
    return { out, d, g };
  }

  setListener(pos, yaw) {
    this.listener.x = pos.x;
    this.listener.y = pos.y;
    this.listener.z = pos.z;
    this.listenerYaw = yaw;
  }

  // ------------------------------------------------------------ efeitos
  roar(c) {
    if (!this.ctx || this.active > 14) return;
    const v = c.spec.voice;
    const sc = c.scale;
    const sp = this.spatial(c.pos, 25 * sc * (v.pitch < 1 ? 2 : 1), 600);
    if (!sp) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime + 0.02;
    const dur = v.length * (0.85 + Math.random() * 0.3);
    const pitch = v.pitch / Math.sqrt(sc) * (0.9 + Math.random() * 0.2);
    const env = ctx.createGain();
    env.gain.setValueAtTime(0, t0);
    env.gain.linearRampToValueAtTime(0.9, t0 + Math.min(0.25, dur * 0.2));
    env.gain.setValueAtTime(0.9, t0 + dur * 0.55);
    env.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    env.connect(sp.out);
    this.active++;
    setTimeout(() => this.active--, dur * 1000 + 100);

    if (v.horn) {
      // chamado tubular do parassaurolofo
      for (const [mul, g] of [[1, 0.5], [2.01, 0.22], [3, 0.12]]) {
        const o = ctx.createOscillator();
        o.type = 'triangle';
        const f = 95 * pitch * mul;
        o.frequency.setValueAtTime(f * 0.92, t0);
        o.frequency.linearRampToValueAtTime(f, t0 + 0.3);
        o.frequency.linearRampToValueAtTime(f * 0.88, t0 + dur);
        const vib = ctx.createOscillator();
        vib.frequency.value = 5;
        const vg = ctx.createGain();
        vg.gain.value = f * 0.012;
        vib.connect(vg).connect(o.frequency);
        const og = ctx.createGain();
        og.gain.value = g;
        o.connect(og).connect(env);
        o.start(t0);
        vib.start(t0);
        o.stop(t0 + dur + 0.05);
        vib.stop(t0 + dur + 0.05);
      }
      return;
    }

    // fonte: dente-de-serra + ruído, distorcidos e filtrados por formantes
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    const f0 = 62 * pitch;
    o.frequency.setValueAtTime(f0 * 0.8, t0);
    o.frequency.linearRampToValueAtTime(f0 * 1.15, t0 + dur * 0.3);
    o.frequency.linearRampToValueAtTime(f0 * 0.7, t0 + dur);
    const o2 = ctx.createOscillator();
    o2.type = 'sawtooth';
    o2.frequency.value = f0 * 0.503;
    o2.detune.value = 12;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 18 + 20 * pitch;
    const lg = ctx.createGain();
    lg.gain.value = f0 * 0.08;
    lfo.connect(lg).connect(o.frequency);
    const mix = ctx.createGain();
    mix.gain.value = 0.5;
    o.connect(mix);
    o2.connect(mix);
    const n = this.noise(true);
    const ng = ctx.createGain();
    ng.gain.value = 0.6 + v.grit * 0.6;
    n.connect(ng).connect(mix);
    const ws = ctx.createWaveShaper();
    ws.curve = this.shaper(0.3 + v.grit * 0.7);
    mix.connect(ws);
    const formants = [
      [380 * pitch, 3, 1],
      [850 * pitch, 5, 0.6],
      [1900 * Math.sqrt(pitch), 7, 0.25],
    ];
    for (const [f, q, g] of formants) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(f * 0.8, t0);
      bp.frequency.linearRampToValueAtTime(f, t0 + dur * 0.4);
      bp.Q.value = q;
      const fg = ctx.createGain();
      fg.gain.value = g * 1.6;
      ws.connect(bp).connect(fg).connect(env);
    }
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 220 * pitch;
    const lpg = ctx.createGain();
    lpg.gain.value = 0.7;
    ws.connect(lp).connect(lpg).connect(env);
    for (const s of [o, o2, lfo, n]) {
      s.start(t0);
      s.stop(t0 + dur + 0.05);
    }
  }

  footstep(c) {
    if (!this.ctx || this.active > 18) return;
    const sc = c.scale * c.spec.sizeClass;
    if (sc < 0.8 && !c.isPlayer) return;
    const sp = this.spatial(c.pos, 3 + sc * 6, 40 + sc * 40);
    if (!sp) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const big = clamp(sc / 5, 0, 1);
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(lerp(140, 55, big), t0);
    o.frequency.exponentialRampToValueAtTime(lerp(60, 28, big), t0 + 0.25);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(lerp(0.15, 0.9, big), t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + lerp(0.15, 0.55, big));
    o.connect(g).connect(sp.out);
    const n = this.noise();
    const f = ctx.createBiquadFilter();
    f.type = c.inWater ? 'bandpass' : 'lowpass';
    f.frequency.value = c.inWater ? 900 : lerp(1800, 500, big);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(c.inWater ? 0.35 : 0.18, t0);
    ng.gain.exponentialRampToValueAtTime(0.001, t0 + (c.inWater ? 0.3 : 0.12));
    n.connect(f).connect(ng).connect(sp.out);
    o.start(t0);
    o.stop(t0 + 0.6);
    n.start(t0, Math.random());
    n.stop(t0 + 0.35);
  }

  attack(c, hit) {
    if (!this.ctx) return;
    const sp = this.spatial(c.pos, 6 + c.scale * c.spec.sizeClass * 3, 120);
    if (!sp) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const n = this.noise();
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = hit ? 700 : 2400 / Math.sqrt(c.spec.sizeClass);
    f.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(hit ? 0.9 : 0.35, t0);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + (hit ? 0.25 : 0.12));
    n.connect(f).connect(g).connect(sp.out);
    n.start(t0, Math.random());
    n.stop(t0 + 0.3);
    if (hit) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(120, t0);
      o.frequency.exponentialRampToValueAtTime(40, t0 + 0.2);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.6, t0);
      og.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
      o.connect(og).connect(sp.out);
      o.start(t0);
      o.stop(t0 + 0.3);
    }
  }

  hurt(c) {
    if (!this.ctx) return;
    const sp = this.spatial(c.pos, 10, 150);
    if (!sp) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const p = c.spec.voice.pitch / Math.sqrt(c.scale);
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(220 * p, t0);
    o.frequency.exponentialRampToValueAtTime(110 * p, t0 + 0.35);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900 * p;
    f.Q.value = 2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.5, t0 + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.4);
    o.connect(f).connect(g).connect(sp.out);
    o.start(t0);
    o.stop(t0 + 0.45);
  }

  eat(c, type) {
    if (!this.ctx) return;
    const sp = this.spatial(c.pos, 5, 60);
    if (!sp) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const t = t0 + i * 0.07 + Math.random() * 0.03;
      const n = this.noise();
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = type === 'carcass' ? 500 + Math.random() * 400 : 1800 + Math.random() * 1500;
      f.Q.value = 2;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.35, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.07);
      n.connect(f).connect(g).connect(sp.out);
      n.start(t, Math.random());
      n.stop(t + 0.1);
    }
  }

  drink(c) {
    if (!this.ctx) return;
    const sp = this.spatial(c.pos, 5, 60);
    if (!sp) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sine';
    const f0 = 300 + Math.random() * 200;
    o.frequency.setValueAtTime(f0, t0);
    o.frequency.exponentialRampToValueAtTime(f0 * 2.2, t0 + 0.07);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.09);
    o.connect(g).connect(sp.out);
    o.start(t0);
    o.stop(t0 + 0.1);
  }

  // ------------------------------------------------------------ ambiente
  setupAmbient() {
    const ctx = this.ctx;
    this.amb = ctx.createGain();
    this.amb.gain.value = 0.0;
    this.amb.connect(this.master);
    // vento
    const wn = this.noise(true);
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 500;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.12;
    wn.connect(wf).connect(this.windGain).connect(this.amb);
    wn.start();
    this.windFilter = wf;
    // água corrente
    const rn = this.noise(true);
    const rf = ctx.createBiquadFilter();
    rf.type = 'bandpass';
    rf.frequency.value = 1400;
    rf.Q.value = 0.6;
    this.waterGain = ctx.createGain();
    this.waterGain.gain.value = 0;
    rn.connect(rf).connect(this.waterGain).connect(this.amb);
    rn.start(0, 0.7);
    // grilos
    const co = ctx.createOscillator();
    co.type = 'square';
    co.frequency.value = 4300;
    const am = ctx.createOscillator();
    am.frequency.value = 26;
    const amg = ctx.createGain();
    amg.gain.value = 0.5;
    const cg = ctx.createGain();
    cg.gain.value = 0.5;
    am.connect(amg).connect(cg.gain);
    const chirp = ctx.createOscillator();
    chirp.type = 'square';
    chirp.frequency.value = 1.6;
    const chg = ctx.createGain();
    chg.gain.value = 0.5;
    const cricketOut = ctx.createGain();
    cricketOut.gain.value = 0.5;
    chirp.connect(chg).connect(cricketOut.gain);
    const cf = ctx.createBiquadFilter();
    cf.type = 'bandpass';
    cf.frequency.value = 4300;
    cf.Q.value = 8;
    this.cricketGain = ctx.createGain();
    this.cricketGain.gain.value = 0;
    co.connect(cg).connect(cf).connect(cricketOut).connect(this.cricketGain).connect(this.amb);
    co.start();
    am.start();
    chirp.start();
    this.birdT = 2;
    this.heartT = 0;
  }

  bird() {
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    const n = 2 + Math.floor(Math.random() * 4);
    const base = 1800 + Math.random() * 1800;
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : ctx.createGain();
    if (pan.pan) pan.pan.value = Math.random() * 1.6 - 0.8;
    pan.connect(this.amb);
    for (let i = 0; i < n; i++) {
      const t = t0 + i * (0.12 + Math.random() * 0.06);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.5), t + 0.06);
      o.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.1);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.05, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
      o.connect(g).connect(pan);
      o.start(t);
      o.stop(t + 0.12);
    }
  }

  heartbeat(rate) {
    const ctx = this.ctx;
    const t0 = ctx.currentTime;
    for (const [dt, a] of [[0, 0.5], [0.18, 0.35]]) {
      const o = ctx.createOscillator();
      o.frequency.setValueAtTime(70, t0 + dt);
      o.frequency.exponentialRampToValueAtTime(35, t0 + dt + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(a * rate, t0 + dt + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.18);
      o.connect(g).connect(this.master);
      o.start(t0 + dt);
      o.stop(t0 + dt + 0.2);
    }
  }

  updateAmbient(dt, { night, nearWater, windy, health, playing }) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.amb.gain.setTargetAtTime(playing ? 1 : 0.5, t, 0.5);
    this.windGain.gain.setTargetAtTime(0.06 + windy * 0.1, t, 1);
    this.windFilter.frequency.setTargetAtTime(350 + windy * 500, t, 1);
    this.cricketGain.gain.setTargetAtTime(night * 0.035, t, 2);
    this.waterGain.gain.setTargetAtTime(nearWater * 0.06, t, 0.5);
    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = 1.5 + Math.random() * 5;
      if (night < 0.5) this.bird();
    }
    if (playing && health < 0.3) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = lerp(0.55, 1.0, health / 0.3);
        this.heartbeat(1 - health / 0.3 + 0.3);
      }
    }
  }
}

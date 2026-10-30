// Áudio 100% procedural (Web Audio): rugidos sintetizados por espécie e
// tamanho, chamados de corneta (crista), passos pesados, mordidas, impactos,
// comer/beber e ambiente (vento, pássaros de dia, insetos à noite).
import * as THREE from 'three';
import { clamp } from './util.js';

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.listener = { pos: new THREE.Vector3(), right: new THREE.Vector3(1, 0, 0) };
    this.birdT = 1;
    this.bugT = 0;
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
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(comp);
    comp.connect(ctx.destination);
    // ruído branco reutilizável
    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    // distorção para a aspereza dos rugidos
    this.shaper = (amt) => {
      const ws = ctx.createWaveShaper();
      const n = 1024;
      const curve = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const x = (i / n) * 2 - 1;
        curve[i] = ((1 + amt) * x) / (1 + amt * Math.abs(x));
      }
      ws.curve = curve;
      return ws;
    };
    // vento contínuo
    const wind = ctx.createBufferSource();
    wind.buffer = this.noise;
    wind.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 380;
    wf.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.05;
    wind.connect(wf).connect(this.windGain).connect(this.master);
    wind.start();
    this.windFilter = wf;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  setListener(camera) {
    this.listener.pos.copy(camera.position);
    this.listener.right.set(1, 0, 0).applyQuaternion(camera.quaternion);
  }

  // saída posicionada: volume pela distância e pan estéreo
  out(pos, base = 1, range = 60) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    let vol = base;
    let pan = 0;
    let lp = 20000;
    if (pos) {
      const d = this.listener.pos.distanceTo(pos);
      vol *= 1 / (1 + Math.pow(d / range, 2) * 3);
      const dir = pos.clone().sub(this.listener.pos).normalize();
      pan = clamp(dir.dot(this.listener.right), -1, 1) * 0.8;
      lp = 18000 / (1 + d / 40);
    }
    if (vol < 0.003) return null;
    g.gain.value = vol;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = Math.max(400, lp);
    g.connect(f);
    if (ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      f.connect(p).connect(this.master);
    } else f.connect(this.master);
    return g;
  }

  noiseSrc(t, dur) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    s.loopStart = Math.random();
    s.start(t, Math.random() * 1.5);
    s.stop(t + dur + 0.1);
    return s;
  }

  env(param, t, a, peak, hold, rel) {
    param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(peak, t + a);
    param.setValueAtTime(peak, t + a + hold);
    param.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
  }

  // ------------------------------------------------------------------ vozes
  roar(c, quiet = 1) {
    if (!this.ctx) return;
    const v = c.spec.voice;
    const size = 0.5 + 0.5 * c.scale;
    const pitch = v.pitch / size;
    const loud = (0.5 + 0.7 * c.scale) * quiet;
    const range = 50 + 150 * c.scale;
    const o = this.out(c.pos, loud, range);
    if (!o) return;
    const ctx = this.ctx;
    const t = ctx.currentTime + 0.02;
    const roar = c.spec.diet === 'carnivoro';
    const dur = (roar ? 1.6 : 1.3) * (0.8 + c.scale * 0.4);
    const amp = ctx.createGain();
    this.env(amp.gain, t, 0.12, 1, dur * 0.55, dur * 0.4);
    amp.connect(o);
    if (v.horn) {
      // chamado tubular (crista do parassaurolofo / braquiossauro)
      const f0 = 95 * pitch;
      for (const [mul, g] of [
        [1, 0.5],
        [2, 0.25],
        [3, 0.12],
      ]) {
        const os = ctx.createOscillator();
        os.type = 'triangle';
        os.frequency.setValueAtTime(f0 * mul * 0.92, t);
        os.frequency.linearRampToValueAtTime(f0 * mul, t + 0.3);
        os.frequency.linearRampToValueAtTime(f0 * mul * 0.85, t + dur);
        const vib = ctx.createOscillator();
        vib.frequency.value = 5;
        const vg = ctx.createGain();
        vg.gain.value = f0 * mul * 0.012;
        vib.connect(vg).connect(os.frequency);
        const gg = ctx.createGain();
        gg.gain.value = g;
        os.connect(gg).connect(amp);
        os.start(t);
        os.stop(t + dur + 0.2);
        vib.start(t);
        vib.stop(t + dur + 0.2);
      }
      return;
    }
    // rugido: dente-de-serra grave + ruído formante + distorção + tremolo
    const f0 = 70 * pitch;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900 + 1500 * pitch;
    const sh = this.shaper(8 * v.rough + 1);
    const trem = ctx.createGain();
    trem.gain.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 9 + 10 * pitch;
    const lg = ctx.createGain();
    lg.gain.value = 0.3 * v.rough;
    lfo.connect(lg).connect(trem.gain);
    lfo.start(t);
    lfo.stop(t + dur + 0.2);
    sh.connect(lp).connect(trem).connect(amp);
    for (const det of [1, 1.013, 0.5]) {
      const os = ctx.createOscillator();
      os.type = 'sawtooth';
      os.frequency.setValueAtTime(f0 * det * 1.25, t);
      os.frequency.exponentialRampToValueAtTime(f0 * det * 1.5, t + dur * 0.25);
      os.frequency.exponentialRampToValueAtTime(f0 * det * 0.75, t + dur);
      const g = ctx.createGain();
      g.gain.value = det === 0.5 ? 0.5 : 0.3;
      os.connect(g).connect(sh);
      os.start(t);
      os.stop(t + dur + 0.2);
    }
    const n = this.noiseSrc(t, dur);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(380 * pitch + 120, t);
    bp.frequency.linearRampToValueAtTime(700 * pitch + 200, t + dur * 0.3);
    bp.frequency.linearRampToValueAtTime(250 * pitch + 80, t + dur);
    bp.Q.value = 1.6;
    const ng = ctx.createGain();
    ng.gain.value = 0.9 * v.rough + 0.2;
    n.connect(bp).connect(ng).connect(sh);
  }

  // grunhido curto (ferido) — versão menor do rugido
  hurt(c) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = this.out(c.pos, 0.5 + 0.4 * c.scale, 40 + 60 * c.scale);
    if (!o) return;
    const t = ctx.currentTime;
    const p = c.spec.voice.pitch / (0.5 + 0.5 * c.scale);
    const os = ctx.createOscillator();
    os.type = 'sawtooth';
    os.frequency.setValueAtTime(150 * p, t);
    os.frequency.exponentialRampToValueAtTime(80 * p, t + 0.35);
    const g = ctx.createGain();
    this.env(g.gain, t, 0.02, 0.6, 0.1, 0.3);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1200;
    os.connect(f).connect(g).connect(o);
    os.start(t);
    os.stop(t + 0.5);
  }

  death(c) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = this.out(c.pos, 0.7, 40 + 100 * c.scale);
    if (!o) return;
    const t = ctx.currentTime;
    const p = c.spec.voice.pitch / (0.5 + 0.5 * c.scale);
    const os = ctx.createOscillator();
    os.type = 'sawtooth';
    os.frequency.setValueAtTime(120 * p, t);
    os.frequency.exponentialRampToValueAtTime(35 * p, t + 1.8);
    const g = ctx.createGain();
    this.env(g.gain, t, 0.05, 0.6, 0.6, 1.2);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 700;
    os.connect(this.shaper(4)).connect(f).connect(g).connect(o);
    os.start(t);
    os.stop(t + 2);
    this.thump(c.pos, 0.9 * c.scale + 0.2, 0.5);
  }

  attack(c) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = this.out(c.pos, 0.35 + 0.3 * c.scale, 40);
    if (!o) return;
    const t = ctx.currentTime;
    // deslocamento de ar
    const n = this.noiseSrc(t, 0.4);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(1400, t + 0.25);
    const g = ctx.createGain();
    this.env(g.gain, t, 0.08, 0.5, 0.05, 0.2);
    n.connect(f).connect(g).connect(o);
    if (c.spec.attack === 'bite') {
      // estalo da mandíbula
      const tt = t + 0.33;
      const n2 = this.noiseSrc(tt, 0.08);
      const f2 = ctx.createBiquadFilter();
      f2.type = 'highpass';
      f2.frequency.value = 1500;
      const g2 = ctx.createGain();
      this.env(g2.gain, tt, 0.003, 0.9, 0.0, 0.07);
      n2.connect(f2).connect(g2).connect(o);
    }
  }

  hit(a, b) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = this.out(b.pos, 0.8, 50);
    if (!o) return;
    const t = ctx.currentTime;
    this.thump(b.pos, 0.6, 0.25);
    const n = this.noiseSrc(t, 0.25);
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 900;
    f.Q.value = 0.8;
    const g = ctx.createGain();
    this.env(g.gain, t, 0.005, 0.7, 0.03, 0.18);
    n.connect(f).connect(g).connect(o);
    this.hurt(b);
  }

  thump(pos, vol = 0.5, dur = 0.3) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = this.out(pos, vol, 70);
    if (!o) return;
    const t = ctx.currentTime;
    const os = ctx.createOscillator();
    os.type = 'sine';
    os.frequency.setValueAtTime(70, t);
    os.frequency.exponentialRampToValueAtTime(32, t + dur);
    const g = ctx.createGain();
    this.env(g.gain, t, 0.008, 1, 0.02, dur);
    os.connect(g).connect(o);
    os.start(t);
    os.stop(t + dur + 0.1);
  }

  step(c) {
    if (!this.ctx) return;
    const big = c.L.hipH * c.scale;
    if (big < 1.2) return;
    this.thump(c.pos, clamp((big - 1) * 0.12, 0.05, 0.6), 0.18 + big * 0.03);
  }

  eat(c) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = this.out(c.pos, 0.35, 25);
    if (!o) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const tt = t + i * 0.12 + Math.random() * 0.04;
      const n = this.noiseSrc(tt, 0.08);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = c.spec.diet === 'carnivoro' ? 600 : 2500;
      f.Q.value = 1.2;
      const g = ctx.createGain();
      this.env(g.gain, tt, 0.005, 0.5, 0.01, 0.06);
      n.connect(f).connect(g).connect(o);
    }
  }

  drink(c) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const o = this.out(c.pos, 0.25, 25);
    if (!o) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 2; i++) {
      const tt = t + i * 0.18;
      const os = ctx.createOscillator();
      os.type = 'sine';
      const f0 = 300 + Math.random() * 300;
      os.frequency.setValueAtTime(f0, tt);
      os.frequency.exponentialRampToValueAtTime(f0 * 2.2, tt + 0.08);
      const g = ctx.createGain();
      this.env(g.gain, tt, 0.005, 0.4, 0.02, 0.06);
      os.connect(g).connect(o);
      os.start(tt);
      os.stop(tt + 0.15);
    }
  }

  ui(kind = 'click') {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const os = ctx.createOscillator();
    os.type = 'triangle';
    os.frequency.value = kind === 'grow' ? 520 : 760;
    if (kind === 'grow') os.frequency.linearRampToValueAtTime(880, t + 0.4);
    const g = ctx.createGain();
    this.env(g.gain, t, 0.01, 0.15, 0.05, kind === 'grow' ? 0.5 : 0.08);
    os.connect(g).connect(this.master);
    os.start(t);
    os.stop(t + 0.7);
  }

  // ------------------------------------------------------------------ ambiente
  update(dt, world, wind = 0.5) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    const t = ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.03 + 0.05 * wind, t, 0.5);
    this.windFilter.frequency.setTargetAtTime(300 + 200 * Math.sin(t * 0.13), t, 1);
    if (!world.isNight) {
      this.birdT -= dt;
      if (this.birdT <= 0) {
        this.birdT = 1 + Math.random() * 4;
        this.bird();
      }
    } else {
      this.bugT -= dt;
      if (this.bugT <= 0) {
        this.bugT = 0.6 + Math.random() * 0.8;
        this.cricket();
      }
    }
  }

  bird() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const g = ctx.createGain();
    g.gain.value = 0.025 + Math.random() * 0.03;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    if (p) {
      p.pan.value = Math.random() * 2 - 1;
      g.connect(p).connect(this.master);
    } else g.connect(this.master);
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 2200 + Math.random() * 2200;
    for (let i = 0; i < notes; i++) {
      const tt = t + i * (0.09 + Math.random() * 0.06);
      const os = ctx.createOscillator();
      os.type = 'sine';
      os.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.3), tt);
      os.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.5), tt + 0.06);
      const e = ctx.createGain();
      this.env(e.gain, tt, 0.01, 1, 0.02, 0.05);
      os.connect(e).connect(g);
      os.start(tt);
      os.stop(tt + 0.1);
    }
  }

  cricket() {
    const ctx = this.ctx;
    const t = ctx.currentTime;
    const os = ctx.createOscillator();
    os.type = 'square';
    os.frequency.value = 4200 + Math.random() * 600;
    const am = ctx.createGain();
    am.gain.value = 0;
    for (let i = 0; i < 4; i++) {
      am.gain.setValueAtTime(0.012, t + i * 0.05);
      am.gain.setValueAtTime(0, t + i * 0.05 + 0.025);
    }
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 4500;
    const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    os.connect(f).connect(am);
    if (p) {
      p.pan.value = Math.random() * 2 - 1;
      am.connect(p).connect(this.master);
    } else am.connect(this.master);
    os.start(t);
    os.stop(t + 0.25);
  }
}

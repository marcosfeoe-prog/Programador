// Áudio procedural (Web Audio API): nenhum arquivo de som. Tiros com eco no vale,
// mecânica das armas, passos por superfície, rugidos e chamados dos dinossauros
// sintetizados (com posição 3D e atraso da velocidade do som), vento, pássaros de dia,
// grilos e sapos à noite, batimento cardíaco e tensão durante a perseguição.

const rnd = (a, b) => a + Math.random() * (b - a);

export class GameAudio {
  constructor(settings) {
    this.settings = settings;
    this.ctx = null;
    this.ok = false;
    this.buffers = {};
    this.birdT = 2;
    this.frogT = 3;
    this.tension = 0;
    this.heartT = 0;
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
    this.master.gain.value = this.settings.volume ?? 0.8;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(ctx.destination);
    this.sfx = ctx.createGain();
    this.sfx.connect(this.master);
    this.amb = ctx.createGain();
    this.amb.gain.value = 0.55;
    this.amb.connect(this.master);
    // reverberação "ao ar livre": impulso longo e esparso
    this.reverb = ctx.createConvolver();
    this.reverb.buffer = this.makeImpulse(3.2);
    this.revGain = ctx.createGain();
    this.revGain.gain.value = 0.55;
    this.reverb.connect(this.revGain).connect(this.master);
    this.buffers.white = this.makeNoise('white', 2);
    this.buffers.pink = this.makeNoise('pink', 3);
    this.buffers.brown = this.makeNoise('brown', 4);
    this.startAmbience();
    this.ok = true;
  }

  setVolume(v) {
    this.settings.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  makeNoise(kind, sec) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = b.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'white') d[i] = w;
      else if (kind === 'pink') {
        b0 = 0.99765 * b0 + w * 0.099046;
        b1 = 0.963 * b1 + w * 0.2965164;
        b2 = 0.57 * b2 + w * 1.0526913;
        d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return b;
  }

  makeImpulse(sec) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const t = i / n;
        // ecos discretos (paredões do vale) + cauda difusa
        const echo = [0.18, 0.31, 0.47, 0.62].some((e) => Math.abs(t - e - c * 0.01) < 0.004) ? 0.6 : 0;
        d[i] = (Math.random() * 2 - 1) * (Math.pow(1 - t, 3) * 0.5 + echo * (1 - t));
      }
    }
    return b;
  }

  // ---------------------------------------------------------- utilitários
  t0(delay = 0) {
    return this.ctx.currentTime + delay;
  }
  out(pos, ref = 10, rev = 0.3) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    if (pos) {
      const p = ctx.createPanner();
      p.panningModel = 'equalpower';
      p.distanceModel = 'inverse';
      p.refDistance = ref;
      p.maxDistance = 4000;
      p.rolloffFactor = 1;
      if (p.positionX) {
        p.positionX.value = pos.x;
        p.positionY.value = pos.y;
        p.positionZ.value = pos.z;
      } else p.setPosition(pos.x, pos.y, pos.z);
      g.connect(p);
      p.connect(this.sfx);
      if (rev > 0) {
        const r = ctx.createGain();
        r.gain.value = rev;
        p.connect(r).connect(this.reverb);
      }
    } else {
      g.connect(this.sfx);
      if (rev > 0) {
        const r = ctx.createGain();
        r.gain.value = rev;
        g.connect(r).connect(this.reverb);
      }
    }
    return g;
  }
  noise(dest, kind, start, dur, filterType, freq, q = 1, gain = 1, attack = 0.002, freqEnd = null) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.buffers[kind];
    s.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = filterType;
    f.frequency.setValueAtTime(freq, start);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, start + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(gain, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    s.connect(f).connect(g).connect(dest);
    s.start(start, Math.random() * 1.5);
    s.stop(start + dur + 0.05);
    return g;
  }
  tone(dest, type, start, dur, f0, f1, gain, attack = 0.005) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, start);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), start + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(gain, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(dest);
    o.start(start);
    o.stop(start + dur + 0.05);
    return o;
  }
  listener(cam) {
    if (!this.ctx) return;
    const L = this.ctx.listener;
    const p = cam.position;
    const f = { x: -Math.sin(cam.rotation.y) * Math.cos(cam.rotation.x), y: Math.sin(cam.rotation.x), z: -Math.cos(cam.rotation.y) * Math.cos(cam.rotation.x) };
    if (L.positionX) {
      L.positionX.value = p.x;
      L.positionY.value = p.y;
      L.positionZ.value = p.z;
      L.forwardX.value = f.x;
      L.forwardY.value = f.y;
      L.forwardZ.value = f.z;
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
    this.listenerPos = p;
  }
  delayFor(pos) {
    if (!pos || !this.listenerPos) return 0;
    const d = Math.hypot(pos.x - this.listenerPos.x, pos.y - this.listenerPos.y, pos.z - this.listenerPos.z);
    return Math.min(3, d / 343);
  }

  // ---------------------------------------------------------- armas
  shot(id) {
    if (!this.ok) return;
    const t = this.t0();
    const o = this.out(null, 1, id === 'crossbow' ? 0.05 : 0.9);
    if (id === 'crossbow') {
      // estalo da corda + zumbido
      this.tone(o, 'triangle', t, 0.25, 180, 90, 0.5);
      this.noise(o, 'white', t, 0.06, 'bandpass', 2500, 2, 0.6);
      this.noise(o, 'pink', t + 0.02, 0.3, 'bandpass', 900, 3, 0.15, 0.01, 400);
      return;
    }
    const P = {
      rifle: { crack: 1.0, body: 1.0, boom: 1.0, low: 70, len: 0.5 },
      shotgun: { crack: 0.8, body: 1.25, boom: 1.25, low: 55, len: 0.55 },
      ar: { crack: 0.85, body: 0.75, boom: 0.6, low: 85, len: 0.3 },
    }[id];
    this.noise(o, 'white', t, 0.045, 'highpass', 2500, 0.7, 1.2 * P.crack);
    this.noise(o, 'white', t, 0.16 * P.len * 2, 'lowpass', 2200, 0.8, 1.1 * P.body, 0.001, 300);
    this.tone(o, 'sine', t, P.len, P.low * 1.6, P.low * 0.6, 1.1 * P.boom, 0.002);
    this.noise(o, 'brown', t, P.len * 1.6, 'lowpass', 400, 0.7, 0.8 * P.boom, 0.005, 90);
  }

  mech(kind, id) {
    if (!this.ok) return;
    const o = this.out(null, 1, 0.05);
    const t = this.t0();
    const click = (dt, f = 3000, g = 0.35, d = 0.03) => this.noise(o, 'white', t + dt, d, 'bandpass', f, 4, g);
    switch (kind) {
      case 'bolt':
        click(0.08, 2200);
        click(0.25, 1600, 0.4, 0.06);
        click(0.55, 1900, 0.45, 0.05);
        click(0.78, 2600);
        break;
      case 'pump':
        this.noise(o, 'white', t + 0.05, 0.12, 'bandpass', 1400, 2, 0.45, 0.01, 900);
        this.noise(o, 'white', t + 0.3, 0.1, 'bandpass', 1700, 2, 0.5, 0.005, 2300);
        break;
      case 'reloadStart':
        this.noise(o, 'pink', t, 0.18, 'bandpass', 800, 1, 0.2, 0.05);
        if (id === 'ar') click(0.3, 1800, 0.5, 0.05);
        break;
      case 'shellIn':
        click(0, 2600, 0.4, 0.04);
        click(0.06, 1400, 0.3, 0.05);
        break;
      case 'magIn':
        click(0, 1200, 0.6, 0.06);
        click(0.05, 2400, 0.4, 0.03);
        break;
      case 'charge':
        this.noise(o, 'white', t, 0.09, 'bandpass', 2000, 3, 0.4, 0.005, 1200);
        click(0.14, 2600, 0.5);
        break;
      case 'cock':
        this.noise(o, 'pink', t - 0.4, 0.45, 'bandpass', 500, 4, 0.18, 0.2, 900);
        click(0.02, 1800, 0.6, 0.05);
        break;
      case 'empty':
        click(0, 4000, 0.3, 0.02);
        break;
      case 'equip':
        this.noise(o, 'pink', t, 0.25, 'bandpass', 700, 1, 0.12, 0.05);
        click(0.2, 2400, 0.25);
        break;
      default:
        break;
    }
  }

  shellDrop(shotgun) {
    if (!this.ok) return;
    const o = this.out(null, 1, 0);
    const t = this.t0(0.35);
    for (let k = 0; k < 2; k++) this.tone(o, 'sine', t + k * 0.09, 0.06, shotgun ? 900 : 3800 + Math.random() * 600, null, 0.05 / (k + 1));
  }

  impact(type, pos) {
    if (!this.ok) return;
    const o = this.out(pos, 6, 0.1);
    const t = this.t0(this.delayFor(pos));
    if (type === 'flesh') {
      this.noise(o, 'brown', t, 0.12, 'lowpass', 500, 1, 1.2);
      this.tone(o, 'sine', t, 0.1, 140, 60, 0.6);
    } else if (type === 'wood') {
      this.noise(o, 'white', t, 0.08, 'bandpass', 900, 3, 0.7);
      this.tone(o, 'triangle', t, 0.12, 320, 200, 0.3);
    } else if (type === 'rock') {
      this.noise(o, 'white', t, 0.06, 'highpass', 3000, 1, 0.6);
      this.tone(o, 'sine', t, 0.15, 1800, 900, 0.1);
    } else this.noise(o, 'pink', t, 0.1, 'lowpass', 900, 1, 0.5);
  }

  hitMarker(kill, head) {
    if (!this.ok) return;
    const o = this.out(null, 1, 0);
    const t = this.t0(0.03);
    this.tone(o, 'square', t, 0.04, head ? 2400 : 1700, null, 0.05);
    if (kill) this.tone(o, 'sine', t + 0.06, 0.3, 660, 990, 0.12, 0.01);
  }

  ui(kind) {
    if (!this.ok) return;
    const o = this.out(null, 1, 0.1);
    const t = this.t0();
    if (kind === 'objetivo') {
      [523, 659, 784, 1046].forEach((f, i) => this.tone(o, 'triangle', t + i * 0.12, 0.6, f, null, 0.15, 0.01));
    } else if (kind === 'pegar') {
      this.tone(o, 'triangle', t, 0.15, 700, 1000, 0.12);
      this.noise(o, 'pink', t, 0.2, 'bandpass', 1200, 1, 0.15);
    } else if (kind === 'trofeu') {
      [392, 494, 587, 784].forEach((f, i) => this.tone(o, 'sine', t + i * 0.09, 0.5, f, null, 0.15, 0.01));
    } else if (kind === 'clique') this.tone(o, 'sine', t, 0.05, 1200, 900, 0.08);
  }

  footstep(surface, k) {
    if (!this.ok) return;
    const o = this.out(null, 1, 0);
    const t = this.t0();
    const g = 0.18 * k + 0.05;
    if (surface === 'agua') {
      this.noise(o, 'white', t, 0.25, 'bandpass', 1100, 1.2, g * 1.5, 0.02, 500);
    } else if (surface === 'madeira') {
      this.tone(o, 'triangle', t, 0.08, 160, 110, g * 1.4);
      this.noise(o, 'pink', t, 0.06, 'bandpass', 700, 2, g);
    } else if (surface === 'pedra') {
      this.noise(o, 'white', t, 0.05, 'bandpass', 2400, 1.5, g);
      this.noise(o, 'brown', t, 0.08, 'lowpass', 300, 1, g);
    } else if (surface === 'folhas') {
      this.noise(o, 'white', t, 0.16, 'bandpass', 3200, 0.8, g * 0.9, 0.02);
      this.noise(o, 'brown', t, 0.07, 'lowpass', 250, 1, g);
    } else if (surface === 'terra') {
      this.noise(o, 'pink', t, 0.09, 'lowpass', 900, 1, g * 1.3);
    } else {
      this.noise(o, 'white', t, 0.12, 'bandpass', 2600, 0.7, g * 0.7, 0.015);
      this.noise(o, 'brown', t, 0.06, 'lowpass', 280, 1, g * 0.8);
    }
  }

  land(force) {
    if (!this.ok) return;
    const o = this.out(null, 1, 0);
    const t = this.t0();
    this.noise(o, 'brown', t, 0.15, 'lowpass', 300, 1, Math.min(0.8, force * 0.08));
  }

  hurt() {
    if (!this.ok) return;
    const o = this.out(null, 1, 0.1);
    const t = this.t0();
    // gemido curto (formantes)
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.25, t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = 700;
    f.Q.value = 3;
    const os = this.ctx.createOscillator();
    os.type = 'sawtooth';
    os.frequency.setValueAtTime(170, t);
    os.frequency.exponentialRampToValueAtTime(120, t + 0.35);
    os.connect(f).connect(g).connect(o);
    os.start(t);
    os.stop(t + 0.45);
    this.noise(o, 'brown', t, 0.2, 'lowpass', 400, 1, 0.5);
  }

  // ---------------------------------------------------------- dinossauros
  dinoStep(id, pos, rk) {
    if (!this.ok) return;
    const big = id !== 'raptor';
    const o = this.out(pos, big ? 25 : 4, big ? 0.25 : 0);
    const t = this.t0(this.delayFor(pos));
    if (big) {
      const k = id === 'sombrio' ? 1.2 : 1;
      this.tone(o, 'sine', t, 0.45, 48 * k, 28, 1.2);
      this.noise(o, 'brown', t, 0.35, 'lowpass', 180, 1, 0.9);
      this.noise(o, 'white', t, 0.12, 'bandpass', 900, 1, 0.12 + rk * 0.1);
    } else {
      this.noise(o, 'white', t, 0.06, 'bandpass', 1800, 1.2, 0.18 + rk * 0.2);
      this.noise(o, 'brown', t, 0.05, 'lowpass', 400, 1, 0.2);
    }
  }

  // rugido: osciladores graves com formantes que se movem + ruído
  roarVoice(o, t, dur, base, formants, gain, rough = 0) {
    const ctx = this.ctx;
    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, t);
    env.gain.linearRampToValueAtTime(gain, t + dur * 0.15);
    env.gain.setValueAtTime(gain * 0.9, t + dur * 0.7);
    env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let dest = env;
    if (rough > 0) {
      const ws = ctx.createWaveShaper();
      const c = new Float32Array(256);
      for (let i = 0; i < 256; i++) {
        const x = (i / 128 - 1) * (1 + rough * 4);
        c[i] = Math.tanh(x);
      }
      ws.curve = c;
      env.connect(ws);
      dest = ws;
    }
    dest.connect(o);
    // modulação de "ronco"
    const am = ctx.createGain();
    am.gain.value = 0.7;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = rnd(22, 34);
    const lg = ctx.createGain();
    lg.gain.value = 0.3;
    lfo.connect(lg).connect(am.gain);
    lfo.start(t);
    lfo.stop(t + dur + 0.1);
    am.connect(env);
    for (const f of formants) {
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.setValueAtTime(f[0], t);
      bp.frequency.linearRampToValueAtTime(f[1], t + dur * 0.4);
      bp.frequency.linearRampToValueAtTime(f[2] ?? f[0], t + dur);
      bp.Q.value = 3;
      bp.connect(am);
      for (const mult of [1, 1.006, 0.994]) {
        const os = ctx.createOscillator();
        os.type = 'sawtooth';
        os.frequency.setValueAtTime(base * mult * 0.85, t);
        os.frequency.linearRampToValueAtTime(base * mult * 1.1, t + dur * 0.3);
        os.frequency.linearRampToValueAtTime(base * mult * 0.7, t + dur);
        os.connect(bp);
        os.start(t);
        os.stop(t + dur + 0.1);
      }
    }
    const ns = ctx.createBufferSource();
    ns.buffer = this.buffers.pink;
    ns.loop = true;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = formants[0][1] * 1.5;
    nf.Q.value = 0.8;
    const ng = ctx.createGain();
    ng.gain.value = 0.6;
    ns.connect(nf).connect(ng).connect(am);
    ns.start(t);
    ns.stop(t + dur + 0.1);
  }

  dino(id, kind, pos) {
    if (!this.ok) return;
    const delay = this.delayFor(pos);
    const t = this.t0(delay);
    const big = id !== 'raptor';
    const o = this.out(pos, big ? 60 : 15, 0.4);
    if (id === 'raptor') {
      if (kind === 'call') {
        // latidos/chilreios de coordenação
        const n = 2 + Math.floor(Math.random() * 3);
        const f = rnd(700, 1000);
        for (let k = 0; k < n; k++) {
          this.tone(o, 'sawtooth', t + k * 0.13, 0.1, f * rnd(0.9, 1.2), f * 0.6, 0.12);
          this.noise(o, 'white', t + k * 0.13, 0.08, 'bandpass', 1800, 3, 0.1);
        }
      } else if (kind === 'screech' || kind === 'roar') {
        const dur = kind === 'roar' ? 1.3 : 0.7;
        this.roarVoice(o, t, dur, rnd(180, 230), [
          [1400, 2600, 1200],
          [3000, 3800, 2400],
        ], 0.35, 0.3);
      } else if (kind === 'hurt') {
        this.roarVoice(o, t, 0.4, 260, [[1800, 2600, 1000]], 0.35, 0.2);
      } else if (kind === 'death') {
        this.roarVoice(o, t, 1.1, 220, [[1600, 1200, 500]], 0.3, 0.2);
      } else if (kind === 'bite') {
        this.noise(o, 'white', t, 0.05, 'highpass', 2000, 1, 0.5);
        this.tone(o, 'sine', t, 0.08, 300, 120, 0.3);
      } else if (kind === 'growl') {
        this.noise(o, 'pink', t, 0.6, 'bandpass', 600, 4, 0.2, 0.1);
      }
      return;
    }
    const deep = id === 'sombrio';
    const base = deep ? 38 : 52;
    if (kind === 'roar') {
      const dur = deep ? 3.2 : 2.6;
      this.roarVoice(o, t, dur, base, [
        [220, 520, 260],
        [600, 1100, 500],
        [1500, 1900, 1200],
      ], 0.9, deep ? 0.6 : 0.25);
      this.tone(o, 'sine', t, dur, base * 0.75, base * 0.5, 0.8, 0.3);
    } else if (kind === 'growl') {
      this.roarVoice(o, t, 1.6, base * 0.8, [[180, 300, 160]], 0.45, deep ? 0.4 : 0.1);
    } else if (kind === 'hurt') {
      this.roarVoice(o, t, 0.9, base * 1.3, [
        [400, 900, 500],
        [1200, 1600, 1000],
      ], 0.7, 0.3);
    } else if (kind === 'death') {
      this.roarVoice(o, t, 3.5, base * 1.1, [
        [500, 400, 150],
        [1100, 800, 300],
      ], 0.7, 0.3);
    } else if (kind === 'bite') {
      this.tone(o, 'sine', t, 0.25, 120, 40, 1);
      this.noise(o, 'white', t, 0.08, 'bandpass', 1200, 1, 0.8);
    }
  }

  // ---------------------------------------------------------- ambiente
  startAmbience() {
    const ctx = this.ctx;
    // vento
    const w = ctx.createBufferSource();
    w.buffer = this.buffers.brown;
    w.loop = true;
    const wf = ctx.createBiquadFilter();
    wf.type = 'lowpass';
    wf.frequency.value = 500;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.25;
    w.connect(wf).connect(this.windGain).connect(this.amb);
    w.start();
    this.windFilter = wf;
    // grilos (noite)
    const c = ctx.createOscillator();
    c.frequency.value = 4300;
    const cg = ctx.createGain();
    cg.gain.value = 0;
    const am = ctx.createOscillator();
    am.type = 'square';
    am.frequency.value = 22;
    const amg = ctx.createGain();
    amg.gain.value = 0.5;
    const am2 = ctx.createOscillator();
    am2.frequency.value = 0.9;
    const am2g = ctx.createGain();
    am2g.gain.value = 0.5;
    const mix = ctx.createGain();
    mix.gain.value = 0;
    am.connect(amg).connect(mix.gain);
    am2.connect(am2g).connect(mix.gain);
    c.connect(mix).connect(cg).connect(this.amb);
    c.start();
    am.start();
    am2.start();
    this.cricketGain = cg;
    // drone de tensão
    const d1 = ctx.createOscillator();
    d1.type = 'sawtooth';
    d1.frequency.value = 55;
    const d2 = ctx.createOscillator();
    d2.type = 'sawtooth';
    d2.frequency.value = 58.3;
    const df = ctx.createBiquadFilter();
    df.type = 'lowpass';
    df.frequency.value = 260;
    this.droneGain = ctx.createGain();
    this.droneGain.gain.value = 0;
    d1.connect(df);
    d2.connect(df);
    df.connect(this.droneGain).connect(this.master);
    d1.start();
    d2.start();
  }

  bird(pos) {
    const o = this.out(pos, 12, 0.3);
    const t = this.t0();
    const kind = Math.random();
    const f = rnd(2200, 4200);
    const n = 2 + Math.floor(Math.random() * 5);
    for (let k = 0; k < n; k++) {
      const st = t + k * rnd(0.09, 0.18);
      if (kind < 0.5) this.tone(o, 'sine', st, 0.08, f, f * rnd(1.2, 1.5), 0.05, 0.01);
      else this.tone(o, 'sine', st, 0.12, f * 1.3, f * 0.8, 0.04, 0.01);
    }
  }

  frog(pos) {
    const o = this.out(pos, 8, 0.2);
    const t = this.t0();
    for (let k = 0; k < 3; k++) this.tone(o, 'square', t + k * 0.12, 0.07, 280, 200, 0.03);
  }

  owl(pos) {
    const o = this.out(pos, 20, 0.5);
    const t = this.t0();
    this.tone(o, 'sine', t, 0.35, 420, 380, 0.08, 0.05);
    this.tone(o, 'sine', t + 0.5, 0.6, 400, 360, 0.08, 0.05);
  }

  heartbeat() {
    const o = this.out(null, 1, 0);
    const t = this.t0();
    this.tone(o, 'sine', t, 0.15, 60, 40, 0.5, 0.01);
    this.tone(o, 'sine', t + 0.22, 0.15, 55, 38, 0.35, 0.01);
  }

  update(dt, ctx) {
    if (!this.ok) return;
    const { night, camPos, nearWater, health, danger, height } = ctx;
    const t = this.ctx.currentTime;
    this.windGain.gain.setTargetAtTime(0.18 + Math.min(0.35, Math.max(0, (height - 80) / 600)), t, 1);
    this.windFilter.frequency.setTargetAtTime(400 + Math.sin(t * 0.13) * 180 + Math.sin(t * 0.41) * 90, t, 0.5);
    this.cricketGain.gain.setTargetAtTime(night * 0.012, t, 2);
    this.tension = Math.max(this.tension - dt * 0.15, danger);
    this.droneGain.gain.setTargetAtTime(this.tension * 0.06, t, 0.6);
    // pássaros de dia, sapos e corujas à noite
    this.birdT -= dt;
    if (this.birdT <= 0) {
      this.birdT = rnd(0.8, 4);
      const a = Math.random() * Math.PI * 2;
      const r = rnd(15, 60);
      const p = { x: camPos.x + Math.cos(a) * r, y: camPos.y + rnd(3, 12), z: camPos.z + Math.sin(a) * r };
      if (night < 0.4) this.bird(p);
      else if (Math.random() < 0.15) this.owl(p);
    }
    this.frogT -= dt;
    if (this.frogT <= 0) {
      this.frogT = rnd(0.5, 2.5);
      if (night > 0.4 && nearWater) {
        const a = Math.random() * Math.PI * 2;
        this.frog({ x: camPos.x + Math.cos(a) * 20, y: camPos.y - 1, z: camPos.z + Math.sin(a) * 20 });
      }
    }
    // coração acelerado com pouca vida
    if (health < 35 && health > 0) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        this.heartT = 0.45 + (health / 35) * 0.5;
        this.heartbeat();
      }
    }
  }
}

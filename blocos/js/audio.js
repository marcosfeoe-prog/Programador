// Sons sintetizados com Web Audio (nenhum arquivo de áudio).
export class GameAudio {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.musicVolume = 0.5;
    this.listener = { x: 0, y: 0, z: 0, yaw: 0 };
    this.nextMusic = 20 + Math.random() * 40;
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
    this.master.connect(this.ctx.destination);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVolume * 0.5;
    this.musicGain.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 2;
    this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }
  setMusicVolume(v) {
    this.musicVolume = v;
    if (this.musicGain) this.musicGain.gain.value = v * 0.5;
  }

  // ganho e pan conforme a distância até o ouvinte
  spatial(pos) {
    const ctx = this.ctx;
    const g = ctx.createGain();
    let out = g;
    if (pos && pos.x !== undefined) {
      const L = this.listener;
      const dx = pos.x - L.x, dy = (pos.y || 0) - L.y, dz = pos.z - L.z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      g.gain.value = Math.max(0, 1 - d / 20);
      if (ctx.createStereoPanner) {
        const p = ctx.createStereoPanner();
        const right = Math.cos(L.yaw) * dx - Math.sin(L.yaw) * dz;
        p.pan.value = d > 0.5 ? Math.max(-0.8, Math.min(0.8, right / Math.max(d, 1))) : 0;
        g.connect(p);
        p.connect(this.master);
        return { input: g, gain: g.gain.value };
      }
    }
    out.connect(this.master);
    return { input: g, gain: g.gain.value };
  }

  noise(dest, t, dur, { type = 'bandpass', freq = 1000, q = 1, gain = 0.5, attack = 0.005, rate = 1 } = {}) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    src.playbackRate.value = rate;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
    return f;
  }
  tone(dest, t, dur, f0, f1, { type = 'sine', gain = 0.3, attack = 0.01, lp = 0 } = {}) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + attack);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    let node = o;
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      o.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
    return o;
  }

  // material: stone, wood, grass, gravel, sand, glass, cloth, snow
  material(kind, mat, pos) {
    if (!this.ctx) return;
    const { input, gain } = this.spatial(pos);
    if (gain <= 0.01) return;
    const t = this.ctx.currentTime;
    const v = kind === 'step' ? 0.22 : kind === 'hit' ? 0.25 : 0.55;
    const dur = kind === 'step' ? 0.09 : kind === 'hit' ? 0.07 : 0.18;
    const r = 0.85 + Math.random() * 0.3;
    switch (mat) {
      case 'wood':
        this.noise(input, t, dur, { freq: 500 * r, q: 3, gain: v });
        this.tone(input, t, dur * 0.8, 220 * r, 160 * r, { type: 'triangle', gain: v * 0.35 });
        break;
      case 'grass':
        this.noise(input, t, dur * 1.2, { type: 'highpass', freq: 2500 * r, q: 0.5, gain: v * 0.6 });
        this.noise(input, t + 0.02, dur, { freq: 4000 * r, q: 1, gain: v * 0.4 });
        break;
      case 'gravel':
        for (let i = 0; i < 4; i++) this.noise(input, t + i * 0.018, dur * 0.6, { freq: 1200 + Math.random() * 1500, q: 2, gain: v * 0.6 });
        break;
      case 'sand':
        this.noise(input, t, dur * 1.3, { type: 'highpass', freq: 1800 * r, q: 0.3, gain: v * 0.5, attack: 0.02 });
        break;
      case 'snow':
        this.noise(input, t, dur * 1.3, { type: 'lowpass', freq: 1500 * r, q: 0.7, gain: v * 0.7, attack: 0.02 });
        break;
      case 'cloth':
        this.noise(input, t, dur * 1.2, { type: 'lowpass', freq: 900 * r, q: 0.5, gain: v * 0.8, attack: 0.02 });
        break;
      case 'glass':
        if (kind === 'break') {
          for (let i = 0; i < 6; i++) this.tone(input, t + i * 0.025, 0.2, 2500 + Math.random() * 3000, 2000, { gain: 0.08 });
          this.noise(input, t, 0.3, { type: 'highpass', freq: 3500, gain: 0.4 });
        } else this.noise(input, t, dur, { freq: 2600 * r, q: 4, gain: v * 0.6 });
        break;
      default:
        this.noise(input, t, dur, { freq: 1700 * r, q: 1.5, gain: v });
        this.noise(input, t, dur * 0.7, { type: 'lowpass', freq: 400, gain: v * 0.5 });
    }
  }

  play(name, pos) {
    if (!this.ctx) return;
    const { input, gain } = this.spatial(pos);
    if (gain <= 0.01) return;
    const t = this.ctx.currentTime;
    const r = 0.9 + Math.random() * 0.2;
    switch (name) {
      case 'pop':
        this.tone(input, t, 0.08, 700 * r, 1500 * r, { gain: 0.18 });
        break;
      case 'click':
        this.tone(input, t, 0.05, 1200, 900, { type: 'square', gain: 0.06 });
        break;
      case 'hurt':
        this.noise(input, t, 0.18, { type: 'lowpass', freq: 600, gain: 0.5 });
        this.tone(input, t, 0.2, 240, 140, { type: 'sawtooth', gain: 0.15, lp: 900 });
        break;
      case 'pig':
        for (let i = 0; i < 2; i++) this.tone(input, t + i * 0.16, 0.14, 320 * r, 230 * r, { type: 'sawtooth', gain: 0.18, lp: 1100 });
        break;
      case 'cow':
        this.tone(input, t, 1.0, 165 * r, 120 * r, { type: 'sawtooth', gain: 0.22, attack: 0.15, lp: 700 });
        break;
      case 'sheep': {
        const o = this.tone(input, t, 0.6, 420 * r, 380 * r, { type: 'sawtooth', gain: 0.16, attack: 0.03, lp: 1600 });
        const lfo = this.ctx.createOscillator();
        const lg = this.ctx.createGain();
        lfo.frequency.value = 22;
        lg.gain.value = 25;
        lfo.connect(lg);
        lg.connect(o.frequency);
        lfo.start(t);
        lfo.stop(t + 0.65);
        break;
      }
      case 'zombie':
        this.tone(input, t, 1.1, 110 * r, 80 * r, { type: 'sawtooth', gain: 0.25, attack: 0.2, lp: 500 });
        this.noise(input, t, 1.0, { type: 'lowpass', freq: 400, gain: 0.15, attack: 0.2 });
        break;
      case 'zombiedeath':
        this.tone(input, t, 0.9, 140, 50, { type: 'sawtooth', gain: 0.25, lp: 600 });
        break;
      case 'mobhurt':
        this.tone(input, t, 0.18, 500 * r, 300 * r, { type: 'sawtooth', gain: 0.15, lp: 1400 });
        break;
      case 'explode':
        this.noise(input, t, 1.6, { type: 'lowpass', freq: 900, gain: 1.0, attack: 0.005 });
        this.tone(input, t, 0.8, 90, 30, { type: 'sine', gain: 0.7 });
        break;
      case 'fuse':
        this.noise(input, t, 1.4, { type: 'highpass', freq: 3000, gain: 0.25, attack: 0.05 });
        break;
      case 'fizz':
        this.noise(input, t, 0.5, { type: 'highpass', freq: 4000, gain: 0.25 });
        break;
      case 'splash':
        this.noise(input, t, 0.5, { type: 'lowpass', freq: 1800, gain: 0.5, attack: 0.01 });
        break;
      case 'swim':
        this.noise(input, t, 0.25, { type: 'bandpass', freq: 900, q: 1, gain: 0.15, attack: 0.04 });
        break;
      case 'eat':
        for (let i = 0; i < 3; i++) this.noise(input, t + i * 0.05, 0.05, { freq: 2000 + Math.random() * 1500, q: 3, gain: 0.3 });
        break;
      case 'burp':
        this.tone(input, t, 0.3, 160, 90, { type: 'sawtooth', gain: 0.2, lp: 500 });
        break;
      case 'attack':
        this.noise(input, t, 0.08, { type: 'bandpass', freq: 600, q: 1, gain: 0.35 });
        break;
      case 'levelup':
        [523, 659, 784].forEach((f, i) => this.tone(input, t + i * 0.08, 0.3, f, f, { type: 'triangle', gain: 0.12 }));
        break;
      case 'chest':
        this.tone(input, t, 0.25, 180, 120, { type: 'triangle', gain: 0.2 });
        this.noise(input, t, 0.2, { freq: 400, q: 2, gain: 0.2 });
        break;
    }
  }

  // Música ambiente: notas de piano suaves geradas ao acaso
  updateMusic(dt) {
    if (!this.ctx || this.musicVolume <= 0) return;
    this.nextMusic -= dt;
    if (this.nextMusic > 0) return;
    this.nextMusic = 120 + Math.random() * 180;
    const scales = [[0, 2, 4, 7, 9], [0, 3, 5, 7, 10], [0, 2, 4, 5, 7, 9, 11]];
    const scale = scales[Math.floor(Math.random() * scales.length)];
    const root = 48 + Math.floor(Math.random() * 7);
    let t = this.ctx.currentTime + 0.5;
    const notes = 18 + Math.floor(Math.random() * 14);
    let deg = Math.floor(Math.random() * scale.length);
    for (let i = 0; i < notes; i++) {
      deg += Math.floor(Math.random() * 5) - 2;
      deg = Math.max(0, Math.min(scale.length * 2 - 1, deg));
      const midi = root + 12 + scale[deg % scale.length] + 12 * Math.floor(deg / scale.length);
      this.piano(t, midi, 0.12);
      if (Math.random() < 0.3) this.piano(t, midi - 12, 0.07);
      if (i % 4 === 0) this.piano(t, root + scale[(deg + 2) % scale.length], 0.06);
      t += [0.6, 0.9, 1.2, 1.8][Math.floor(Math.random() * 4)];
    }
  }
  piano(t, midi, gain) {
    const f = 440 * Math.pow(2, (midi - 69) / 12);
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(gain * 0.3, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0005, t + 3.5);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 2400;
    g.connect(lp);
    lp.connect(this.musicGain);
    for (const [mul, amp] of [[1, 1], [2, 0.35], [3, 0.12], [4, 0.05]]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * mul;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og);
      og.connect(g);
      o.start(t);
      o.stop(t + 3.6);
    }
  }
}

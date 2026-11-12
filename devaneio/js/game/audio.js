// Áudio 100% procedural (Web Audio API): vento, pads com oscilação de fita, caixinha de
// música generativa, passos por superfície, sons posicionais em 3D e efeitos.

const MUSIC = {
  titulo: { root: 64, scale: [0, 2, 4, 7, 9, 11], chords: [[0, 4, 7, 11, 14], [-3, 4, 7, 11], [-7, 0, 4, 11], [-5, 2, 7, 11]], bell: 0.55, pad: 0.5, wind: 0.25, bright: 900 },
  caminho: { root: 60, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7, 14], [-3, 4, 7, 12], [-7, 0, 4, 9], [-5, 2, 7, 11]], bell: 0.5, pad: 0.45, wind: 0.5, bright: 850 },
  deserto: { root: 62, scale: [0, 2, 3, 7, 9], chords: [[0, 3, 7, 14], [-4, 3, 7, 10], [-7, 3, 5, 10], [-5, 2, 7, 10]], bell: 0.35, pad: 0.42, wind: 0.95, whistle: 0.5, bright: 700 },
  cogumelos: { root: 65, scale: [0, 2, 4, 6, 7, 9, 11], chords: [[0, 4, 7, 14], [2, 6, 9, 14], [-1, 4, 7, 11], [-3, 4, 7, 12]], bell: 0.65, pad: 0.5, wind: 0.3, bright: 1100 },
  bairro: { root: 57, scale: [0, 3, 5, 7, 10], chords: [[0, 3, 7, 14], [-4, 3, 7, 11], [3, 7, 10, 14], [-2, 5, 9, 12]], bell: 0.45, pad: 0.5, wind: 0.35, traffic: 0.5, bright: 750 },
  posto: { root: 62, scale: [0, 2, 4, 7, 9], chords: [[0, 4, 7, 11], [-3, 2, 7, 10], [-7, 2, 7, 11], [-5, 2, 4, 9]], bell: 0.5, pad: 0.5, wind: 0.45, traffic: 0.25, bright: 800 },
};

// canção de ninar do final (original): [semitom relativo, duração em batidas]
const LULLABY = [
  [7, 1], [12, 1], [11, 1], [7, 1], [9, 2], [4, 2],
  [5, 1], [9, 1], [7, 1], [4, 1], [2, 3], [-1, 1],
  [0, 1], [4, 1], [7, 1], [12, 1], [14, 2], [11, 2],
  [9, 1], [7, 1], [4, 1], [2, 1], [0, 4],
];

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.vol = { master: 0.85, music: 0.7, sfx: 0.85 };
    this.emitters = [];
    this.beacons = [];
    this.music = null;
    this.nextChord = 0;
    this.nextBell = 0;
    this.chordIdx = 0;
    this.phrase = [];
    this.windT = 0;
    this.listenerPos = [0, 0, 0];
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC({ latencyHint: 'interactive' });
      } catch (e) {
        return;
      }
      this._build();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }

  _build() {
    const c = this.ctx;
    this.comp = c.createDynamicsCompressor();
    this.comp.threshold.value = -16;
    this.comp.ratio.value = 3;
    this.comp.connect(c.destination);
    this.muffle = c.createBiquadFilter();
    this.muffle.type = 'lowpass';
    this.muffle.frequency.value = 20000;
    this.muffle.Q.value = 0.4;
    this.muffle.connect(this.comp);
    this.master = c.createGain();
    this.master.gain.value = this.vol.master;
    this.master.connect(this.muffle);
    this.musicBus = c.createGain();
    this.musicBus.gain.value = this.vol.music;
    this.musicBus.connect(this.master);
    this.sfxBus = c.createGain();
    this.sfxBus.gain.value = this.vol.sfx;
    this.sfxBus.connect(this.master);
    this.ambBus = c.createGain();
    this.ambBus.gain.value = this.vol.sfx * 0.9;
    this.ambBus.connect(this.master);
    // reverberação gerada
    this.reverb = c.createConvolver();
    this.reverb.buffer = this._impulse(4.2, 2.6);
    this.revGain = c.createGain();
    this.revGain.gain.value = 0.55;
    this.reverb.connect(this.revGain);
    this.revGain.connect(this.master);
    this.revSend = c.createGain();
    this.revSend.gain.value = 1;
    this.revSend.connect(this.reverb);
    // ruídos
    this.white = this._noise('white', 2);
    this.pink = this._noise('pink', 4);
    this.brown = this._noise('brown', 4);
    // oscilação de fita (wow) compartilhada
    this.wow = c.createOscillator();
    this.wow.frequency.value = 0.21;
    this.wowGain = c.createGain();
    this.wowGain.gain.value = 7;
    this.wow.connect(this.wowGain);
    this.wow.start();
    this.wow2 = c.createOscillator();
    this.wow2.frequency.value = 3.3;
    this.wow2Gain = c.createGain();
    this.wow2Gain.gain.value = 1.6;
    this.wow2.connect(this.wow2Gain);
    this.wow2.start();
    if (this.pendingTitle !== undefined) this.titleMode(this.pendingTitle);
    if (this.pendingLevel) this.setLevel(...this.pendingLevel);
  }

  _impulse(seconds, decay) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const b = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / len;
        lp += (Math.random() * 2 - 1 - lp) * (0.35 - t * 0.25);
        d[i] = lp * Math.pow(1 - t, decay) * (i < 400 ? i / 400 : 1);
      }
    }
    return b;
  }

  _noise(type, seconds) {
    const c = this.ctx;
    const len = Math.floor(c.sampleRate * seconds);
    const b = c.createBuffer(1, len, c.sampleRate);
    const d = b.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'white') d[i] = w;
      else if (type === 'pink') {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      } else {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    }
    return b;
  }

  _src(buffer, loop = true) {
    const s = this.ctx.createBufferSource();
    s.buffer = buffer;
    s.loop = loop;
    if (loop) s.loopStart = Math.random() * (buffer.duration - 0.5);
    return s;
  }

  setVolumes(master, music, sfx) {
    this.vol = { master, music, sfx };
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(master, t, 0.05);
    this.musicBus.gain.setTargetAtTime(music, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(sfx, t, 0.05);
    this.ambBus.gain.setTargetAtTime(sfx * 0.9, t, 0.05);
  }

  // ---------------------------------------------------------------- síntese básica
  bell(time, freq, vel = 0.3, dest = this.musicBus, decay = 2.4, rev = 0.6) {
    const c = this.ctx;
    const out = c.createGain();
    out.gain.value = 1;
    out.connect(dest);
    const send = c.createGain();
    send.gain.value = rev;
    out.connect(send);
    send.connect(this.revSend);
    const parts = [[1, 1, 1], [2.0, 0.32, 0.6], [3.01, 0.16, 0.4], [4.18, 0.07, 0.25], [5.43, 0.03, 0.15]];
    for (const [r, a, d] of parts) {
      const o = c.createOscillator();
      o.type = 'sine';
      o.frequency.value = freq * r;
      this.wow2Gain.connect(o.detune);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, time);
      g.gain.exponentialRampToValueAtTime(vel * a, time + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, time + decay * d);
      o.connect(g);
      g.connect(out);
      o.start(time);
      o.stop(time + decay * d + 0.05);
    }
    setTimeout(() => {
      try {
        out.disconnect();
        send.disconnect();
      } catch (e) {}
    }, (time - c.currentTime + decay + 0.5) * 1000);
  }

  noiseHit(time, { buf = this.white, type = 'bandpass', f = 1200, q = 1, dur = 0.08, vel = 0.3, dest = this.sfxBus, pan = 0, attack = 0.004, f2 = null, rev = 0 } = {}) {
    const c = this.ctx;
    const s = this._src(buf, false);
    s.playbackRate.value = 0.8 + Math.random() * 0.4;
    const flt = c.createBiquadFilter();
    flt.type = type;
    flt.frequency.setValueAtTime(f, time);
    if (f2) flt.frequency.exponentialRampToValueAtTime(f2, time + dur);
    flt.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(vel, time + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    const p = c.createStereoPanner();
    p.pan.value = pan;
    s.connect(flt);
    flt.connect(g);
    g.connect(p);
    p.connect(dest);
    if (rev) {
      const sg = c.createGain();
      sg.gain.value = rev;
      p.connect(sg);
      sg.connect(this.revSend);
    }
    s.start(time, Math.random() * 1.5);
    s.stop(time + dur + 0.05);
  }

  tone(time, freq, { type = 'sine', dur = 0.1, vel = 0.2, dest = this.sfxBus, f2 = null, attack = 0.005, rev = 0 } = {}) {
    const c = this.ctx;
    const o = c.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, time);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, time + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.exponentialRampToValueAtTime(vel, time + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, time + dur);
    o.connect(g);
    g.connect(dest);
    if (rev) {
      const sg = c.createGain();
      sg.gain.value = rev;
      g.connect(sg);
      sg.connect(this.revSend);
    }
    o.start(time);
    o.stop(time + dur + 0.05);
  }

  // ---------------------------------------------------------------- música
  _chord(time, notes, cfg, dur) {
    const c = this.ctx;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, time);
    g.gain.linearRampToValueAtTime(0.05 * cfg.pad, time + 3.5);
    g.gain.setValueAtTime(0.05 * cfg.pad, time + dur - 1);
    g.gain.linearRampToValueAtTime(0.0001, time + dur + 4);
    const flt = c.createBiquadFilter();
    flt.type = 'lowpass';
    flt.frequency.value = cfg.bright || 800;
    flt.Q.value = 0.3;
    flt.connect(g);
    g.connect(this.musicBus);
    const send = c.createGain();
    send.gain.value = 0.8;
    g.connect(send);
    send.connect(this.revSend);
    const oscs = [];
    for (const n of notes) {
      const f = mtof(cfg.root - 12 + n);
      for (const [type, det, amp] of [['triangle', -6, 1], ['sawtooth', 7, 0.28], ['sine', 0, 0.6]]) {
        const o = c.createOscillator();
        o.type = type;
        o.frequency.value = type === 'sine' ? f / 2 : f;
        o.detune.value = det + (Math.random() - 0.5) * 4;
        this.wowGain.connect(o.detune);
        const a = c.createGain();
        a.gain.value = amp / notes.length;
        o.connect(a);
        a.connect(flt);
        o.start(time);
        o.stop(time + dur + 4.2);
        oscs.push(o);
      }
    }
    setTimeout(() => {
      try {
        g.disconnect();
        send.disconnect();
      } catch (e) {}
    }, (time - c.currentTime + dur + 5) * 1000);
  }

  _scheduleMusic() {
    const m = this.music;
    if (!m || !this.ctx) return;
    const c = this.ctx;
    const now = c.currentTime;
    if (m.lullaby) {
      while (this.nextBell < now + 0.3 && m.li < LULLABY.length * 2) {
        const [n, d] = LULLABY[m.li % LULLABY.length];
        this.bell(this.nextBell, mtof(m.cfg.root + 12 + n), 0.22, this.musicBus, 3.2, 0.7);
        if (m.li % 6 === 0) this._chord(this.nextBell, m.cfg.chords[(m.li / 6) % 4 | 0], m.cfg, 6);
        this.nextBell += d * 0.62;
        m.li++;
      }
      return;
    }
    if (this.nextChord < now + 0.2) {
      const t = Math.max(now + 0.05, this.nextChord);
      const ch = m.cfg.chords[this.chordIdx % m.cfg.chords.length];
      this._chord(t, ch, m.cfg, 11);
      this.chordIdx++;
      this.nextChord = t + 11;
    }
    if (m.cfg.bell > 0 && this.nextBell < now + 0.2) {
      const t = Math.max(now + 0.05, this.nextBell);
      if (!this.phrase.length && Math.random() < 0.5) {
        // nova frase: passos curtos dentro da escala, às vezes um salto
        const sc = m.cfg.scale;
        let idx = Math.floor(Math.random() * sc.length);
        const len = 3 + Math.floor(Math.random() * 5);
        for (let i = 0; i < len; i++) {
          idx += Math.random() < 0.7 ? (Math.random() < 0.5 ? -1 : 1) : Math.random() < 0.5 ? -2 : 2;
          idx = Math.max(0, Math.min(sc.length * 2 - 1, idx));
          const oct = Math.floor(idx / sc.length);
          this.phrase.push(m.cfg.root + 12 + oct * 12 + sc[idx % sc.length]);
        }
      }
      if (this.phrase.length) {
        const n = this.phrase.shift();
        this.bell(t, mtof(n), 0.09 + Math.random() * 0.07, this.musicBus, 2.6, 0.75);
        this.nextBell = t + (Math.random() < 0.3 ? 0.9 : 0.45) * (0.9 + Math.random() * 0.3);
        if (!this.phrase.length) this.nextBell += 2.5 + Math.random() * 6;
      } else this.nextBell = t + 2 + Math.random() * 3;
    }
  }

  _startBed(cfg) {
    const c = this.ctx;
    const nodes = [];
    const t = c.currentTime;
    // vento
    const w = this._src(this.pink);
    const wf = c.createBiquadFilter();
    wf.type = 'bandpass';
    wf.frequency.value = 420;
    wf.Q.value = 0.6;
    const wg = c.createGain();
    wg.gain.setValueAtTime(0.0001, t);
    wg.gain.linearRampToValueAtTime(0.16 * cfg.wind, t + 3);
    w.connect(wf);
    wf.connect(wg);
    wg.connect(this.ambBus);
    w.start();
    nodes.push(w);
    this.windNodes = { f: wf, g: wg, base: 0.16 * cfg.wind };
    // assobio (deserto)
    if (cfg.whistle) {
      const s = this._src(this.white);
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      f.Q.value = 14;
      const g = c.createGain();
      g.gain.value = 0.05 * cfg.whistle;
      s.connect(f);
      f.connect(g);
      g.connect(this.ambBus);
      s.start();
      nodes.push(s);
      this.whistle = { f, g, base: 0.05 * cfg.whistle };
    } else this.whistle = null;
    // trânsito distante
    if (cfg.traffic) {
      const s = this._src(this.brown);
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 260;
      const g = c.createGain();
      g.gain.value = 0.12 * cfg.traffic;
      s.connect(f);
      f.connect(g);
      g.connect(this.ambBus);
      s.start();
      nodes.push(s);
    }
    this.bed = { nodes, gain: wg };
  }

  _stopBed() {
    if (!this.bed) return;
    const t = this.ctx.currentTime;
    this.bed.gain.gain.setTargetAtTime(0.0001, t, 0.4);
    const ns = this.bed.nodes;
    setTimeout(() => ns.forEach((n) => {
      try {
        n.stop();
      } catch (e) {}
    }), 2500);
    this.bed = null;
  }

  // ---------------------------------------------------------------- emissores 3D
  _panner(x, y, z, ref = 2, max = 60, roll = 1.3) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.maxDistance = max;
    p.rolloffFactor = roll;
    if (p.positionX) {
      p.positionX.value = x;
      p.positionY.value = y;
      p.positionZ.value = z;
    } else p.setPosition(x, y, z);
    p.connect(this.sfxBus);
    return p;
  }

  _emitter(def) {
    const c = this.ctx;
    const e = { def, nodes: [], next: c.currentTime + Math.random() * 2 };
    const pan = (e.pan = this._panner(def.x, def.y, def.z, def.ref || 2.5, 80));
    const out = (e.out = c.createGain());
    out.gain.value = def.gain ?? 0.5;
    out.connect(pan);
    if (def.type === 'hum' || def.type === 'neon') {
      for (const [f, a, type] of [[120, 0.05, 'sawtooth'], [240, 0.03, 'sine'], [360, 0.012, 'sine']]) {
        const o = c.createOscillator();
        o.type = type;
        o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.002);
        const lp = c.createBiquadFilter();
        lp.type = 'lowpass';
        lp.frequency.value = 700;
        const g = c.createGain();
        g.gain.value = a;
        o.connect(lp);
        lp.connect(g);
        g.connect(out);
        o.start();
        e.nodes.push(o);
      }
      if (def.type === 'neon') {
        const s = this._src(this.white);
        const f = c.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 2600;
        f.Q.value = 2;
        const g = c.createGain();
        g.gain.value = 0.02;
        s.connect(f);
        f.connect(g);
        g.connect(out);
        s.start();
        e.nodes.push(s);
        e.buzz = g;
      }
    } else if (def.type === 'static') {
      const s = this._src(this.white);
      const f = c.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 3200;
      f.Q.value = 0.5;
      const g = c.createGain();
      g.gain.value = 0.06;
      s.connect(f);
      f.connect(g);
      g.connect(out);
      s.start();
      e.nodes.push(s);
    }
    this.emitters.push(e);
    return e;
  }

  _tickEmitters(now) {
    for (const e of this.emitters) {
      const d = e.def;
      if (e.next > now + 0.2) continue;
      const t = Math.max(now, e.next);
      if (d.type === 'creak') {
        // rangido metálico (corrente do balanço / placa)
        const f0 = 600 + Math.random() * 300;
        this.tone(t, f0, { type: 'sawtooth', dur: 0.35, vel: 0.05, dest: e.out, f2: f0 * 1.35, attack: 0.08 });
        this.tone(t + 0.02, f0 * 1.5, { type: 'triangle', dur: 0.3, vel: 0.03, dest: e.out, f2: f0 * 1.2, attack: 0.06 });
        e.next = t + (d.period || 5.5) * (0.5 + (Math.random() < 0.5 ? 0 : 0.5));
      } else if (d.type === 'chimes') {
        const sc = [0, 2, 4, 7, 9, 12, 14];
        const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.bell(t + i * (0.12 + Math.random() * 0.2), mtof(84 + sc[Math.floor(Math.random() * sc.length)]), 0.05, e.out, 3, 0.5);
        e.next = t + 1.5 + Math.random() * 5;
      } else if (d.type === 'crickets') {
        const f = 4200 + Math.random() * 900;
        const n = 2 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.tone(t + i * 0.07, f, { dur: 0.045, vel: 0.05, dest: e.out, attack: 0.008 });
        e.next = t + 0.35 + Math.random() * 1.4;
      } else if (d.type === 'beacon') {
        const f = d.freq || 1046;
        this.bell(t, f, 0.06, e.out, 2.2, 0.6);
        this.bell(t + 0.32, f * 1.5, 0.045, e.out, 2.2, 0.6);
        e.next = t + 2.6;
      } else e.next = t + 10;
    }
  }

  _clearEmitters() {
    for (const e of this.emitters) {
      for (const n of e.nodes) {
        try {
          n.stop();
        } catch (er) {}
      }
      try {
        e.out.disconnect();
        e.pan.disconnect();
      } catch (er) {}
    }
    this.emitters = [];
    this.beacons = [];
  }

  // ---------------------------------------------------------------- interface com o jogo
  clearLevel() {
    if (!this.ctx) return;
    this._clearEmitters();
    this._stopBed();
  }

  setLevel(level, memories, door) {
    if (!this.ctx) {
      this.pendingLevel = [level, memories, door];
      return;
    }
    this.pendingLevel = null;
    this._clearEmitters();
    this._stopBed();
    const cfg = MUSIC[level.env.music] || MUSIC.caminho;
    if (!this.titleOn) this.music = { cfg };
    this._startBed(cfg);
    for (const s of level.sounds || []) this._emitter(s);
    const notes = [1046.5, 1174.7, 1318.5];
    memories.forEach((m, i) => {
      const e = this._emitter({ type: 'beacon', x: m.base.x, y: m.base.y, z: m.base.z, gain: 0.9, ref: 3, freq: notes[i % 3] });
      e.memory = m;
      this.beacons.push(e);
    });
    const t = this.ctx.currentTime;
    this.muffle.frequency.cancelScheduledValues(t);
    this.muffle.frequency.setValueAtTime(this.muffle.frequency.value, t);
    this.muffle.frequency.exponentialRampToValueAtTime(20000, t + 2.5);
  }

  titleMode(on) {
    this.titleOn = on;
    if (!this.ctx) {
      this.pendingTitle = on;
      return;
    }
    this.music = { cfg: on ? MUSIC.titulo : this.music ? this.music.cfg : MUSIC.caminho };
    this.nextChord = 0;
  }

  update(dt, camera) {
    if (!this.ctx) return;
    const c = this.ctx;
    const L = c.listener;
    const p = camera.position;
    const f = camera.getWorldDirection(this._fw || (this._fw = camera.position.clone()));
    if (L.positionX) {
      const t = c.currentTime;
      L.positionX.setTargetAtTime(p.x, t, 0.02);
      L.positionY.setTargetAtTime(p.y, t, 0.02);
      L.positionZ.setTargetAtTime(p.z, t, 0.02);
      L.forwardX.setTargetAtTime(f.x, t, 0.02);
      L.forwardY.setTargetAtTime(f.y, t, 0.02);
      L.forwardZ.setTargetAtTime(f.z, t, 0.02);
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else {
      L.setPosition(p.x, p.y, p.z);
      L.setOrientation(f.x, f.y, f.z, 0, 1, 0);
    }
    const now = c.currentTime;
    this._scheduleMusic();
    this._tickEmitters(now);
    // lembranças coletadas param de chamar
    for (const b of this.beacons) {
      if (b.memory && b.memory.collected && !b.silenced) {
        b.silenced = true;
        b.out.gain.setTargetAtTime(0, now, 0.2);
        b.def.type = 'none';
      }
    }
    // rajadas de vento
    this.windT += dt;
    if (this.windNodes && this.windT > 0.25) {
      this.windT = 0;
      const k = 0.55 + 0.45 * Math.sin(now * 0.13) * Math.sin(now * 0.071 + 1) + (Math.random() - 0.5) * 0.15;
      this.windNodes.g.gain.setTargetAtTime(this.windNodes.base * Math.max(0.2, k), now, 0.8);
      this.windNodes.f.frequency.setTargetAtTime(300 + k * 380, now, 0.8);
      if (this.whistle) this.whistle.f.frequency.setTargetAtTime(700 + k * 500, now, 1.2);
    }
  }

  step(surface, k = 1, running = false) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const v = (0.12 + 0.12 * k) * (running ? 1.3 : 1);
    this.side = -(this.side || 1);
    const pan = this.side * 0.12;
    switch (surface) {
      case 'grass':
        this.noiseHit(t, { type: 'highpass', f: 1800, q: 0.5, dur: 0.09, vel: v * 0.7, pan });
        this.noiseHit(t + 0.02, { type: 'bandpass', f: 3800, q: 0.8, dur: 0.06, vel: v * 0.35, pan });
        break;
      case 'sand':
        this.noiseHit(t, { type: 'lowpass', f: 1600, q: 0.4, dur: 0.16, vel: v * 0.7, pan, attack: 0.02 });
        break;
      case 'forest':
        this.noiseHit(t, { type: 'bandpass', f: 800, q: 0.7, dur: 0.11, vel: v * 0.6, pan });
        if (Math.random() < 0.4) this.noiseHit(t + 0.03, { type: 'highpass', f: 4000, q: 1, dur: 0.02, vel: v * 0.4, pan });
        break;
      default:
        // concreto, asfalto, pedra
        this.noiseHit(t, { type: 'bandpass', f: surface === 'asphalt' ? 900 : 1300, q: 1.1, dur: 0.06, vel: v * 0.8, pan, rev: 0.05 });
        this.tone(t, 95 + Math.random() * 15, { dur: 0.07, vel: v * 0.5, f2: 60 });
    }
  }

  land(vy) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(t, 80, { dur: 0.15, vel: Math.min(0.35, vy * 0.06), f2: 45 });
    this.noiseHit(t, { type: 'lowpass', f: 900, dur: 0.12, vel: Math.min(0.25, vy * 0.04) });
  }

  collect() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const cfg = (this.music && this.music.cfg) || MUSIC.caminho;
    const sc = cfg.scale;
    for (let i = 0; i < 6; i++) this.bell(t + i * 0.11, mtof(cfg.root + 12 + Math.floor(i / sc.length) * 12 + sc[i % sc.length]), 0.13, this.sfxBus, 3.2, 0.9);
    this.noiseHit(t, { type: 'highpass', f: 6000, dur: 2.5, vel: 0.05, attack: 0.3, rev: 1 });
    this.tone(t, 70, { dur: 1.6, vel: 0.12, attack: 0.25 });
  }

  doorAppear(door) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noiseHit(t, { buf: this.pink, type: 'bandpass', f: 300, f2: 3000, q: 0.8, dur: 3.2, vel: 0.12, attack: 2.6, rev: 1 });
    const cfg = (this.music && this.music.cfg) || MUSIC.caminho;
    for (const n of [0, 7, 12, 16]) this.tone(t + 0.5, mtof(cfg.root + n), { dur: 6, vel: 0.035, attack: 2, rev: 1, dest: this.musicBus });
    const p = door && door.worldPos;
    if (p) this._emitter({ type: 'beacon', x: p.x, y: (p.y || 0) + 1.2, z: p.z, gain: 0.9, ref: 4, freq: 784 });
  }

  transition() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noiseHit(t, { buf: this.pink, type: 'bandpass', f: 200, f2: 6000, q: 0.7, dur: 2.6, vel: 0.2, attack: 2.2, rev: 1 });
    this.muffle.frequency.cancelScheduledValues(t);
    this.muffle.frequency.setValueAtTime(this.muffle.frequency.value, t);
    this.muffle.frequency.exponentialRampToValueAtTime(350, t + 2.4);
  }

  blink() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.noiseHit(t, { buf: this.pink, type: 'bandpass', f: 500, f2: 4000, q: 1, dur: 0.9, vel: 0.12, attack: 0.6, rev: 0.8 });
    this.tone(t, 220, { dur: 1.2, vel: 0.05, f2: 440, attack: 0.4, rev: 0.8 });
  }

  click(pos) {
    if (!this.ctx) return;
    const pan = this._panner(pos.x, pos.y, pos.z, 3, 40);
    const t = this.ctx.currentTime;
    this.noiseHit(t, { type: 'bandpass', f: 2500, q: 3, dur: 0.03, vel: 0.2, dest: pan });
    setTimeout(() => pan.disconnect(), 500);
  }

  uiHover() {
    if (!this.ctx) return;
    this.tone(this.ctx.currentTime, 1760, { dur: 0.06, vel: 0.02, rev: 0.4 });
  }
  uiClick() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.bell(t, 1046.5, 0.07, this.sfxBus, 1.5, 0.7);
    this.bell(t + 0.08, 1568, 0.05, this.sfxBus, 1.5, 0.7);
  }

  pause(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.muffle.frequency.cancelScheduledValues(t);
    this.muffle.frequency.setTargetAtTime(on ? 700 : 20000, t, 0.25);
    this.musicBus.gain.setTargetAtTime(on ? this.vol.music * 0.5 : this.vol.music, t, 0.3);
  }

  ending() {
    if (!this.ctx) return;
    this._clearEmitters();
    this._stopBed();
    const t = this.ctx.currentTime;
    this.muffle.frequency.cancelScheduledValues(t);
    this.muffle.frequency.setTargetAtTime(20000, t, 0.5);
    this.music = { cfg: { ...MUSIC.posto, root: 60, bright: 900 }, lullaby: true, li: 0 };
    this.nextBell = t + 2;
  }
}

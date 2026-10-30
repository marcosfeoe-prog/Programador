// Rádio com música gerada na hora: Lo-fi da Estrada (piano elétrico, baixo e
// bateria com swing), Aurora (texturas ambientes e sinos) e Bossa (violão de nylon
// sintetizado por Karplus–Strong). Nada é gravado: cada viagem toca diferente.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

// acordes como intervalos a partir da tônica
const Q = {
  maj7: [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  dom7: [0, 4, 7, 10],
  m9: [0, 3, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  six: [0, 4, 7, 9],
  sus: [0, 5, 7, 10],
  m7b5: [0, 3, 6, 10],
};

const PROGS = [
  [[2, 'm7'], [7, 'dom7'], [0, 'maj7'], [9, 'dom7']],
  [[5, 'maj7'], [4, 'm7'], [2, 'm7'], [0, 'maj7']],
  [[9, 'm9'], [2, 'm9'], [7, 'sus'], [0, 'maj9']],
  [[0, 'maj7'], [9, 'm7'], [5, 'maj7'], [7, 'sus']],
  [[4, 'm7'], [9, 'm7'], [2, 'm7'], [7, 'dom7']],
];

const BOSSA = [
  [[0, 'maj7'], [0, 'six'], [2, 'm7'], [7, 'dom7']],
  [[4, 'm7'], [9, 'dom7'], [2, 'm7'], [7, 'dom7']],
  [[5, 'maj7'], [5, 'six'], [4, 'm7'], [9, 'dom7']],
  [[2, 'm7'], [7, 'dom7'], [0, 'maj7'], [0, 'six']],
];

const TITLES = {
  lofi: ['Café no Posto', 'Neblina em Fjordvik', 'Curvas de Bergdorf', 'Chuva no Para-brisa', 'Estrada Vazia', 'Pôr do Sol em Valdoro', 'Lanternas de Sakuragawa', 'Quilômetro 42', 'Sem Pressa'],
  aurora: ['Vale Silencioso', 'Aurora sobre o Fiorde', 'Montanha de Vidro', 'Maré Baixa', 'Horizonte Lilás', 'Respirar Devagar'],
  bossa: ['Praia Dourada', 'Brisa de Fim de Tarde', 'Samba do Retrovisor', 'Coqueiros ao Vento', 'Janela Aberta', 'Garota da Estrada'],
};

export const STATIONS = [
  { id: 'lofi', name: 'Rádio Lo-fi da Estrada', freq: '88,7' },
  { id: 'aurora', name: 'Rádio Aurora', freq: '94,3' },
  { id: 'bossa', name: 'Rádio Bossa', freq: '101,5' },
  { id: 'off', name: 'Rádio desligado', freq: '' },
];

export class Radio {
  constructor(ctx, out) {
    this.ctx = ctx;
    this.out = out;
    this.bus = ctx.createGain();
    this.bus.gain.value = 0;
    this.tone = ctx.createBiquadFilter();
    this.tone.type = 'lowpass';
    this.tone.frequency.value = 5200;
    this.bus.connect(this.tone);
    // reverberação sintética
    this.rev = ctx.createConvolver();
    this.rev.buffer = this.impulse(2.8);
    this.revG = ctx.createGain();
    this.revG.gain.value = 0.28;
    this.dry = ctx.createGain();
    this.tone.connect(this.dry).connect(out);
    this.tone.connect(this.revG).connect(this.rev).connect(out);
    this.station = 0;
    this.on = false;
    this.nextT = 0;
    this.step = 0;
    this.bar = 0;
    this.prog = PROGS[0];
    this.key = 0;
    this.pluckCache = new Map();
    this.noise = (() => {
      const n = ctx.sampleRate;
      const b = ctx.createBuffer(1, n, n);
      const d = b.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      return b;
    })();
    this.title = '';
    this.titleT = 0;
    this.timer = setInterval(() => this.schedule(), 60);
  }

  impulse(sec) {
    const ctx = this.ctx;
    const n = Math.floor(ctx.sampleRate * sec);
    const b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3);
    }
    return b;
  }

  get current() {
    return STATIONS[this.station];
  }

  setStation(i) {
    this.station = (i + STATIONS.length) % STATIONS.length;
    const id = this.current.id;
    const t = this.ctx.currentTime;
    this.bus.gain.cancelScheduledValues(t);
    this.bus.gain.setTargetAtTime(id === 'off' ? 0 : 1, t, 0.3);
    this.on = id !== 'off';
    this.nextT = t + 0.1;
    this.step = 0;
    this.bar = 0;
    this.newSong();
    this.tone.frequency.setTargetAtTime(id === 'lofi' ? 3800 : id === 'aurora' ? 7000 : 6000, t, 0.2);
    this.revG.gain.setTargetAtTime(id === 'aurora' ? 0.6 : id === 'bossa' ? 0.22 : 0.18, t, 0.2);
  }

  next() {
    this.setStation(this.station + 1);
    return this.current;
  }

  newSong() {
    const id = this.current.id;
    if (id === 'off') {
      this.title = '';
      return;
    }
    const list = TITLES[id];
    this.title = list[Math.floor(Math.random() * list.length)];
    this.key = [0, 2, 3, 5, 7, 8, 10][Math.floor(Math.random() * 7)] - 2;
    this.prog = (id === 'bossa' ? BOSSA : PROGS)[Math.floor(Math.random() * (id === 'bossa' ? BOSSA.length : PROGS.length))];
    this.tempo = id === 'lofi' ? 70 + Math.random() * 14 : id === 'bossa' ? 116 + Math.random() * 16 : 60;
    this.songBars = 24 + Math.floor(Math.random() * 16);
    this.bar = 0;
    this.titleT = performance.now();
  }

  schedule() {
    if (!this.on || this.ctx.state !== 'running') return;
    const ctx = this.ctx;
    const ahead = ctx.currentTime + 0.25;
    if (this.nextT < ctx.currentTime - 0.5) this.nextT = ctx.currentTime + 0.05;
    while (this.nextT < ahead) {
      const id = this.current.id;
      const spb = 60 / this.tempo;
      const sixteenth = spb / 4;
      let t = this.nextT;
      const s = this.step % 16;
      if (id === 'lofi') {
        if (s % 2 === 1) t += sixteenth * 0.28; // swing
        this.lofiStep(t, s, spb);
      } else if (id === 'bossa') this.bossaStep(t, s, spb);
      else this.auroraStep(t, s, spb);
      this.nextT += sixteenth;
      this.step++;
      if (this.step % 16 === 0) {
        this.bar++;
        if (this.bar >= this.songBars) this.newSong();
      }
    }
  }

  chord(barOffset = 0) {
    const c = this.prog[(this.bar + barOffset) % this.prog.length];
    return { root: 48 + this.key + c[0], ints: Q[c[1]] };
  }

  // ------------------------------------------------------------ instrumentos
  env(g, t, a, peak, d) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  epiano(t, midi, vel, dur = 1.8) {
    const ctx = this.ctx;
    const f = mtof(midi);
    const car = ctx.createOscillator();
    const mod = ctx.createOscillator();
    const mg = ctx.createGain();
    car.frequency.value = f;
    mod.frequency.value = f;
    mg.gain.setValueAtTime(f * 1.6 * vel, t);
    mg.gain.exponentialRampToValueAtTime(f * 0.15, t + 0.6);
    mod.connect(mg).connect(car.frequency);
    const g = ctx.createGain();
    this.env(g, t, 0.006, 0.05 * vel, dur);
    // leve "wow" de fita
    car.detune.setValueAtTime(Math.sin(t * 0.7) * 8, t);
    car.connect(g).connect(this.bus);
    car.start(t);
    mod.start(t);
    car.stop(t + dur + 0.1);
    mod.stop(t + dur + 0.1);
  }

  bass(t, midi, dur, vel = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = mtof(midi);
    const o2 = ctx.createOscillator();
    o2.type = 'sine';
    o2.frequency.value = mtof(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12 * vel, t + 0.015);
    g.gain.setTargetAtTime(0.0001, t + dur * 0.8, 0.08);
    o.connect(g);
    o2.connect(g);
    g.connect(this.bus);
    o.start(t);
    o2.start(t);
    o.stop(t + dur + 0.4);
    o2.stop(t + dur + 0.4);
  }

  kick(t, v = 1) {
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(130, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.18);
    const g = ctx.createGain();
    this.env(g, t, 0.003, 0.32 * v, 0.32);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.4);
  }

  noiseHit(t, type, freq, q, peak, dur) {
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = ctx.createGain();
    this.env(g, t, 0.002, peak, dur);
    s.connect(f).connect(g).connect(this.bus);
    s.start(t, Math.random() * 0.5);
    s.stop(t + dur + 0.05);
  }

  snare(t, v = 1) {
    this.noiseHit(t, 'bandpass', 1900, 0.8, 0.09 * v, 0.18);
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.frequency.value = 190;
    const g = ctx.createGain();
    this.env(g, t, 0.002, 0.05 * v, 0.08);
    o.connect(g).connect(this.bus);
    o.start(t);
    o.stop(t + 0.12);
  }

  hat(t, v = 1) {
    this.noiseHit(t, 'highpass', 7500, 0.5, 0.025 * v, 0.035);
  }

  bell(t, midi, v = 1) {
    const ctx = this.ctx;
    const f = mtof(midi);
    const g = ctx.createGain();
    this.env(g, t, 0.004, 0.045 * v, 3.2);
    for (const [r, a] of [
      [1, 1],
      [2.76, 0.3],
      [5.4, 0.12],
    ]) {
      const o = ctx.createOscillator();
      o.frequency.value = f * r;
      const og = ctx.createGain();
      og.gain.value = a;
      o.connect(og).connect(g);
      o.start(t);
      o.stop(t + 3.3);
    }
    g.connect(this.bus);
  }

  pad(t, notes, dur) {
    const ctx = this.ctx;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(500, t);
    f.frequency.linearRampToValueAtTime(1400, t + dur * 0.5);
    f.frequency.linearRampToValueAtTime(600, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.03, t + dur * 0.35);
    g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.1);
    for (const m of notes)
      for (const dt of [-7, 6]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = mtof(m);
        o.detune.value = dt;
        o.connect(f);
        o.start(t);
        o.stop(t + dur * 1.15);
      }
    f.connect(g).connect(this.bus);
  }

  // violão: Karplus–Strong pré-calculado por nota
  pluck(t, midi, v = 1) {
    let buf = this.pluckCache.get(midi);
    if (!buf) {
      const ctx = this.ctx;
      const sr = ctx.sampleRate;
      const n = Math.floor(sr * 2.2);
      buf = ctx.createBuffer(1, n, sr);
      const d = buf.getChannelData(0);
      const P = Math.round(sr / mtof(midi));
      const ring = new Float32Array(P);
      for (let i = 0; i < P; i++) ring[i] = (Math.random() * 2 - 1) * 0.5;
      // suaviza o ataque (som de nylon)
      for (let k = 0; k < 2; k++) for (let i = 1; i < P; i++) ring[i] = (ring[i] + ring[i - 1]) * 0.5;
      let idx = 0;
      for (let i = 0; i < n; i++) {
        const a = ring[idx];
        const b = ring[(idx + 1) % P];
        const y = (a + b) * 0.5 * 0.996;
        ring[idx] = y;
        d[i] = a;
        idx = (idx + 1) % P;
      }
      this.pluckCache.set(midi, buf);
    }
    const s = this.ctx.createBufferSource();
    s.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 0.35 * v;
    s.connect(g).connect(this.bus);
    s.start(t);
  }

  // ------------------------------------------------------------ estilos
  lofiStep(t, s, spb) {
    const { root, ints } = this.chord();
    if (s === 0 || (s === 10 && Math.random() < 0.6)) {
      const v = s === 0 ? 1 : 0.6;
      ints.forEach((iv, i) => this.epiano(t + i * 0.012, root + 12 + iv, v, spb * (s === 0 ? 3.5 : 1.5)));
    }
    if (s === 0) this.bass(t, root - 12, spb * 1.5);
    if (s === 7 && Math.random() < 0.5) this.bass(t, root - 12 + 7, spb * 0.5, 0.7);
    if (s === 10) this.bass(t, root - 12 + (Math.random() < 0.5 ? 0 : 12), spb, 0.8);
    if (s === 0 || (s === 10 && Math.random() < 0.7) || (s === 6 && Math.random() < 0.25)) this.kick(t, s === 0 ? 1 : 0.7);
    if (s === 4 || s === 12) this.snare(t, 0.9);
    if (s % 2 === 0) this.hat(t, 0.6 + Math.random() * 0.4);
    // melodia rara
    if (s % 4 === 2 && Math.random() < 0.12) {
      const scale = [0, 2, 4, 7, 9, 12, 14];
      this.epiano(t, root + 24 + scale[Math.floor(Math.random() * scale.length)], 0.5, spb * 1.2);
    }
    // estalos de vinil
    if (Math.random() < 0.08) this.noiseHit(t + Math.random() * 0.05, 'highpass', 3000, 1, 0.01, 0.01);
  }

  auroraStep(t, s, spb) {
    if (s === 0 && this.bar % 2 === 0) {
      const { root, ints } = this.chord(Math.floor(this.bar / 2));
      this.pad(t, ints.map((iv) => root + iv), spb * 8);
      this.bass(t, root - 12, spb * 6, 0.5);
    }
    if (s % 4 === 0 && Math.random() < 0.45) {
      const pent = [0, 2, 4, 7, 9];
      const { root } = this.chord(Math.floor(this.bar / 2));
      this.bell(t + Math.random() * 0.1, root + 24 + pent[Math.floor(Math.random() * 5)] + (Math.random() < 0.3 ? 12 : 0), 0.6 + Math.random() * 0.4);
    }
  }

  bossaStep(t, s, spb) {
    const { root, ints } = this.chord();
    // baixo do polegar: tônica no 1, quinta no 3 (com antecipação)
    if (s === 0) this.pluck(t, root - 12, 1.1);
    if (s === 6) this.pluck(t, root - 12 + 7, 0.9);
    if (s === 8) this.pluck(t, root - 12 + 7, 0.9);
    if (s === 14) this.pluck(t, root - 12, 0.8);
    // acordes no padrão sincopado da bossa
    const pat = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 0];
    if (pat[s]) ints.slice(1).forEach((iv, i) => this.pluck(t + i * 0.008, root + iv + (i > 1 ? 0 : 12), 0.55));
    // ganzá e aro
    this.noiseHit(t, 'highpass', 6000, 0.7, s % 4 === 2 ? 0.02 : 0.011, 0.05);
    if (s === 4 || s === 10) this.noiseHit(t, 'bandpass', 2600, 4, 0.04, 0.03);
    if (s === 12 && Math.random() < 0.4) this.noiseHit(t, 'bandpass', 2600, 4, 0.03, 0.03);
  }
}

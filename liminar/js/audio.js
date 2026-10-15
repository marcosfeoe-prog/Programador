// Áudio 100% procedural (Web Audio): zumbido fluorescente, passos por
// superfície, ambientes de cada nível, reverberação, fonte posicional da
// saída, batimentos cardíacos, sussurros e sustos.

const SR = 44100;

// ------------------------------------------------------------ síntese offline
function biquad(x, type, f, q = 0.707, gain = 0) {
  const w = (2 * Math.PI * f) / SR;
  const cs = Math.cos(w);
  const sn = Math.sin(w);
  const al = sn / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') {
    b0 = (1 - cs) / 2;
    b1 = 1 - cs;
    b2 = b0;
  } else if (type === 'hp') {
    b0 = (1 + cs) / 2;
    b1 = -(1 + cs);
    b2 = b0;
  } else {
    b0 = al;
    b1 = 0;
    b2 = -al;
  }
  a0 = 1 + al;
  a1 = -2 * cs;
  a2 = 1 - al;
  const y = new Float32Array(x.length);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = (b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  if (gain) for (let i = 0; i < y.length; i++) y[i] *= gain;
  return y;
}

function noise(n) {
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = Math.random() * 2 - 1;
  return a;
}

function env(a, attack, decay, shape = 1) {
  const n = a.length;
  const at = Math.max(1, Math.floor(attack * SR));
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const e = i < at ? i / at : Math.exp(-(t - attack) / decay);
    a[i] *= shape === 1 ? e : Math.pow(e, shape);
  }
  return a;
}

function mix(...arrs) {
  const n = Math.max(...arrs.map((a) => a.length));
  const o = new Float32Array(n);
  for (const a of arrs) for (let i = 0; i < a.length; i++) o[i] += a[i];
  return o;
}

function sine(n, f, f2 = f, amp = 1) {
  const a = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    ph += (2 * Math.PI * (f + (f2 - f) * t)) / SR;
    a[i] = Math.sin(ph) * amp;
  }
  return a;
}

function scale(a, k) {
  for (let i = 0; i < a.length; i++) a[i] *= k;
  return a;
}

function normalize(a, peak = 0.9) {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i]));
  if (m > 0) scale(a, peak / m);
  return a;
}

// Utilitários de síntese, exportados para os níveis criarem sons próprios
// (com audio.addBuffer). Todos trabalham em Float32Array mono a 44,1 kHz.
export const DSP = { SR, biquad, noise, env, mix, sine, scale, normalize };

// Jazz de vitrola gerado na hora: ii-V-I com baixo andante, piano, escovinhas,
// prato de condução, uma melodia abafada e o chiado/estalos de disco antigo.
function makeJazz() {
  const bpm = 116;
  const beat = 60 / bpm;
  const bars = 8;
  const n = Math.floor(bars * 4 * beat * SR);
  const out = new Float32Array(n);
  const swing = (b) => (b % 1 === 0.5 ? b + 0.17 : b); // colcheias suingadas
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // Dm7 G7 Cmaj7 A7 | Dm7 G7 Em7 A7
  const chords = [
    [50, [62, 65, 69, 72]],
    [43, [59, 62, 65, 69]],
    [48, [60, 64, 67, 71]],
    [45, [61, 64, 67, 70]],
    [50, [62, 65, 69, 72]],
    [43, [59, 62, 65, 69]],
    [52, [62, 64, 67, 71]],
    [45, [61, 64, 67, 70]],
  ];
  const tone = (t0, f, dur, amp, harm, decay, vib = 0) => {
    const i0 = Math.floor(t0 * SR);
    const len = Math.min(Math.floor(dur * SR), n - i0);
    let ph = 0;
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const fv = f * (1 + vib * Math.sin(t * 2 * Math.PI * 5.2) * Math.min(1, t * 3));
      ph += (2 * Math.PI * fv) / SR;
      let v = 0;
      for (let h = 0; h < harm.length; h++) v += Math.sin(ph * (h + 1)) * harm[h];
      const e = Math.min(1, t / 0.006) * Math.exp(-t / decay) * (t > dur - 0.03 ? (dur - t) / 0.03 : 1);
      out[(i0 + i) % n] += v * e * amp;
    }
  };
  const noiseHit = (t0, dur, amp, f, q, attack) => {
    const i0 = Math.floor(t0 * SR);
    const len = Math.floor(dur * SR);
    const a = biquad(noise(len), 'bp', f, q);
    for (let i = 0; i < len; i++) {
      const t = i / SR;
      const e = Math.min(1, t / attack) * Math.exp(-t / (dur * 0.35));
      out[(i0 + i) % n] += a[i] * e * amp;
    }
  };
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let b = 0; b < bars; b++) {
    const [root, voicing] = chords[b];
    const tb = b * 4 * beat;
    // baixo andante: fundamental, terça/quinta e nota de aproximação
    const next = chords[(b + 1) % bars][0];
    const walk = [root, root + (rnd() < 0.5 ? 3 : 4), root + 7, next + (rnd() < 0.5 ? 1 : -1)];
    walk.forEach((m, k) => tone(tb + k * beat, midi(m - 12), beat * 0.95, 0.5, [1, 0.35, 0.12], 0.35));
    // piano: no 2 e no "e" do 4
    for (const at of [1, 3.5]) {
      for (const m of voicing) tone(tb + swing(at) * beat, midi(m), beat * 1.2, 0.09, [1, 0.45, 0.2, 0.08], 0.5);
    }
    // escovinhas no 2 e 4, prato de condução suingado
    for (const at of [1, 3]) noiseHit(tb + at * beat, beat * 0.9, 0.12, 3500, 0.5, 0.06);
    for (const at of [0, 1, 1.5, 2, 3, 3.5]) noiseHit(tb + swing(at) * beat, 0.35, at % 1 ? 0.05 : 0.08, 7000, 1.5, 0.002);
    // melodia abafada em colcheias (notas do acorde, com pausas)
    for (let k = 0; k < 8; k++) {
      if (rnd() < 0.42) continue;
      const m = voicing[Math.floor(rnd() * voicing.length)] + 12;
      tone(tb + swing(k / 2) * beat, midi(m), beat * (rnd() < 0.3 ? 0.9 : 0.45), 0.07, [1, 0.6, 0.35, 0.2, 0.1], 0.6, 0.006);
    }
  }
  // som de disco antigo: faixa estreita, chiado e estalos
  let v = biquad(biquad(out, 'hp', 280), 'lp', 3200);
  const hiss = biquad(noise(n), 'bp', 4000, 0.4);
  for (let i = 0; i < n; i++) {
    v[i] = Math.tanh(v[i] * 1.6) + hiss[i] * 0.012;
    if (Math.random() < 0.00012) v[i] += (Math.random() - 0.5) * 0.9;
  }
  const f = Math.floor(0.05 * SR);
  for (let i = 0; i < f; i++) v[n - f + i] = v[n - f + i] * (1 - i / f) + v[i] * (i / f);
  return normalize(v, 0.8);
}

// Trilhas ambientes por nível: acordes (MIDI), brilho do filtro e volume.
const PADS = {
  level0: { chords: [[57, 64, 69, 72], [55, 62, 67, 71], [53, 60, 65, 69], [55, 62, 65, 71]], cut: 1400, gain: 0.05, detune: 0.004 },
  level0_1: { chords: [[60, 67, 71, 76], [57, 64, 69, 72], [65, 69, 72, 76], [62, 67, 71, 74]], cut: 2600, gain: 0.07, detune: 0.003, sparkle: true },
  level1: { chords: [[50, 57, 62, 65], [49, 56, 61, 64], [47, 54, 59, 62], [48, 55, 60, 63]], cut: 900, gain: 0.06, detune: 0.006 },
  level4: { chords: [[60, 64, 67, 71], [57, 60, 64, 67], [62, 65, 69, 72], [59, 62, 67, 71]], cut: 1800, gain: 0.04, detune: 0.003 },
  level5: { chords: [[56, 60, 63, 67], [55, 58, 62, 65]], cut: 1000, gain: 0.025, detune: 0.008 },
  level9: { chords: [[52, 59, 64, 67], [51, 58, 63, 66], [50, 57, 62, 65], [49, 56, 61, 64]], cut: 1100, gain: 0.05, detune: 0.007 },
  level10: { chords: [[62, 69, 74, 78], [60, 67, 72, 76], [59, 66, 71, 74], [57, 64, 69, 73]], cut: 1600, gain: 0.05, detune: 0.004 },
  level10_1: { chords: [[45, 52, 57, 60], [44, 51, 56, 59], [43, 50, 55, 58], [44, 51, 56, 60]], cut: 800, gain: 0.06, detune: 0.006 },
  level11: { chords: [[61, 65, 68, 72], [58, 61, 65, 68], [63, 66, 70, 73], [56, 60, 63, 67]], cut: 2000, gain: 0.05, detune: 0.004 },
  level15: { chords: [[64, 71, 76, 79], [62, 69, 74, 77], [60, 67, 72, 76], [62, 69, 74, 78]], cut: 2400, gain: 0.04, detune: 0.002, sparkle: true },
  level88: { chords: [[38, 45, 50, 53], [36, 43, 48, 51], [37, 44, 49, 52], [36, 43, 50, 53]], cut: 600, gain: 0.05, detune: 0.008 },
  level23: { chords: [[50, 57, 64, 69], [48, 55, 62, 67], [53, 60, 67, 72], [52, 59, 64, 71]], cut: 1500, gain: 0.06, detune: 0.005 },
};

// Sintetiza um laço de pad: dentes de serra desafinados, filtro passa-baixa
// com movimento lento e envelopes longos que se sobrepõem.
function makePad(spec) {
  const chordLen = 8;
  const n = Math.floor(spec.chords.length * chordLen * SR);
  const out = new Float32Array(n);
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  spec.chords.forEach((ch, ci) => {
    const t0 = ci * chordLen;
    for (const m of ch) {
      for (const dv of [-1, 1]) {
        const f = midi(m) * (1 + dv * spec.detune);
        let ph = Math.random();
        const len = Math.floor((chordLen + 3) * SR);
        const i0 = Math.floor(t0 * SR);
        for (let i = 0; i < len; i++) {
          const t = i / SR;
          ph += f / SR;
          const saw = (ph % 1) * 2 - 1;
          const e = Math.min(1, t / 2.5) * Math.min(1, Math.max(0, (chordLen + 3 - t) / 3));
          out[(i0 + i) % n] += saw * e * 0.06;
        }
      }
    }
  });
  // passa-baixa com corte oscilando devagar
  let y = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const fc = spec.cut * (0.7 + 0.3 * Math.sin(t * 0.21));
    const a = 1 - Math.exp((-2 * Math.PI * fc) / SR);
    y += (out[i] - y) * a;
    out[i] = y;
  }
  if (spec.sparkle) {
    // notas agudas esparsas tipo sino
    let seed = 3;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < spec.chords.length * 3; k++) {
      const ch = spec.chords[Math.floor(rnd() * spec.chords.length)];
      const f = midi(ch[Math.floor(rnd() * ch.length)] + 12);
      const i0 = Math.floor(rnd() * n);
      const len = Math.floor(2.5 * SR);
      for (let i = 0; i < len; i++) {
        const t = i / SR;
        out[(i0 + i) % n] += Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.8) * 0.05;
      }
    }
  }
  return normalize(out, 0.7);
}

// ------------------------------------------------------------ motor
export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.8;
    this.ready = false;
    this.loops = [];
    this.timers = [];
    this.heartT = 0;
    this.shotT = 3;
    this.emitter = null;
    this.positionals = [];
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    // Os sons são sintetizados a 44,1 kHz. Muitos celulares rodam a 48 kHz e o
    // ConvolverNode exige a mesma taxa do contexto: pede 44,1 kHz e, se não der,
    // a reverberação é gerada na taxa nativa (ver setReverb).
    let ctx;
    try {
      ctx = new AC({ sampleRate: SR });
    } catch (e) {
      ctx = new AC();
    }
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.volume;
    // Equalização: alto-falante de celular quase não reproduz graves, então
    // corta o subgrave (economiza potência) e realça médios/agudos.
    const mob = !!this.lowCost;
    const low = ctx.createBiquadFilter();
    low.type = 'lowshelf';
    low.frequency.value = 110;
    low.gain.value = mob ? -8 : -2;
    const pres = ctx.createBiquadFilter();
    pres.type = 'peaking';
    pres.frequency.value = 2200;
    pres.Q.value = 0.8;
    pres.gain.value = mob ? 6 : 3;
    const air = ctx.createBiquadFilter();
    air.type = 'highshelf';
    air.frequency.value = 6000;
    air.gain.value = mob ? 3 : 1.5;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -22;
    comp.knee.value = 10;
    comp.ratio.value = 5;
    comp.attack.value = 0.005;
    comp.release.value = 0.2;
    // ganho de compensação + limitador final (evita distorção)
    const makeup = ctx.createGain();
    makeup.gain.value = mob ? 2.6 : 2.0;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -1.5;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.002;
    lim.release.value = 0.1;
    // "silêncio" do Nível 88: abafa tudo perto do lago
    this.muff = ctx.createBiquadFilter();
    this.muff.type = 'lowpass';
    this.muff.frequency.value = 20000;
    this.muff.Q.value = 0.5;
    this.muffK = 0;
    this.master.connect(this.muff).connect(low).connect(pres).connect(air).connect(comp).connect(makeup).connect(lim).connect(ctx.destination);
    this.music = ctx.createGain();
    this.music.gain.value = 1;
    this.music.connect(this.master);
    this.dry = ctx.createGain();
    this.dry.connect(this.master);
    this.reverb = ctx.createConvolver();
    this.wet = ctx.createGain();
    this.wet.gain.value = 0.3;
    this.wet.connect(this.reverb).connect(this.master);
    this.buildBuffers();
    try {
      this.setReverb(2);
    } catch (e) {
      console.warn('Reverberação indisponível:', e);
    }
    this.ready = true;
  }

  setVolume(v) {
    this.volume = v;
    if (this.master) this.master.gain.setTargetAtTime(v * (1 - 0.6 * (this.muffK || 0)), this.ctx.currentTime, 0.05);
  }

  // Abafamento (0 = normal, 1 = quase mudo): passa-baixa + volume.
  setMuffle(k) {
    if (!this.ctx || !this.muff) return;
    k = Math.max(0, Math.min(1, k));
    if (Math.abs(k - this.muffK) < 0.01) return;
    this.muffK = k;
    const t = this.ctx.currentTime;
    this.muff.frequency.setTargetAtTime(20000 * Math.pow(500 / 20000, k), t, 0.15);
    this.master.gain.setTargetAtTime(this.volume * (1 - 0.6 * k), t, 0.15);
  }

  buf(data, channels = 1) {
    const b = this.ctx.createBuffer(channels, data.length / channels, SR);
    if (channels === 1) b.copyToChannel(data, 0);
    else {
      const n = data.length / 2;
      b.copyToChannel(data.subarray(0, n), 0);
      b.copyToChannel(data.subarray(n), 1);
    }
    return b;
  }

  buildBuffers() {
    const B = (this.B = {});
    const sec = (s) => Math.floor(s * SR);
    // zumbido fluorescente (1 s, laço perfeito): 120 Hz e harmônicos + chiado
    {
      const n = sec(1);
      const a = new Float32Array(n);
      const harm = [
        [120, 1],
        [240, 0.55],
        [360, 0.4],
        [480, 0.22],
        [600, 0.16],
        [840, 0.1],
        [1080, 0.06],
        [1920, 0.12],
        [2400, 0.09],
        [3120, 0.07],
        [4080, 0.04],
      ];
      for (const [f, amp] of harm) {
        const ph = Math.random() * 6.28;
        for (let i = 0; i < n; i++) a[i] += Math.sin(ph + (2 * Math.PI * f * i) / SR) * amp;
      }
      // zumbido "rasgado" (distorção leve)
      for (let i = 0; i < n; i++) a[i] = Math.tanh(a[i] * 1.6);
      const hiss = biquad(noise(n), 'bp', 6000, 0.6, 0.05);
      B.hum = this.buf(normalize(mix(a, hiss), 0.5));
    }
    // ruído marrom (tom de sala) 4 s
    {
      const n = sec(4);
      const a = new Float32Array(n);
      let v = 0;
      for (let i = 0; i < n; i++) {
        v = v * 0.996 + (Math.random() * 2 - 1) * 0.06;
        a[i] = v;
      }
      // emenda suave do laço
      const f = sec(0.2);
      for (let i = 0; i < f; i++) {
        const t = i / f;
        a[n - f + i] = a[n - f + i] * (1 - t) + a[i] * t;
      }
      B.brown = this.buf(normalize(a, 0.6));
    }
    // ruído branco 2 s
    B.white = this.buf(normalize(noise(sec(2)), 0.6));
    // passos
    const steps = (make) => [0, 1, 2, 3].map(() => this.buf(normalize(make(), 0.85)));
    B.step = {
      carpet: steps(() => {
        const n = sec(0.22);
        const th = env(sine(n, 80 + Math.random() * 20, 50), 0.004, 0.05);
        const sw = env(biquad(noise(n), 'lp', 700 + Math.random() * 300), 0.01, 0.06);
        const sq = env(biquad(noise(n), 'bp', 1400, 2, 0.25), 0.03, 0.07);
        return mix(scale(th, 0.8), sw, sq);
      }),
      concrete: steps(() => {
        const n = sec(0.25);
        const cl = env(biquad(noise(n), 'hp', 2500), 0.001, 0.012);
        const th = env(sine(n, 120, 70), 0.002, 0.035);
        const sc = env(biquad(noise(n), 'bp', 3000 + Math.random() * 1000, 1.2, 0.5), 0.02, 0.05);
        return mix(cl, scale(th, 0.6), sc);
      }),
      dirt: steps(() => {
        const n = sec(0.3);
        const a = biquad(noise(n), 'bp', 2200 + Math.random() * 1200, 0.8);
        for (let i = 0; i < n; i++) a[i] *= Math.random() < 0.3 ? 1 : 0.25;
        return mix(env(a, 0.01, 0.08), scale(env(sine(n, 70, 45), 0.003, 0.05), 0.5));
      }),
      grass: steps(() => {
        const n = sec(0.45);
        const a = biquad(noise(n), 'hp', 2500 + Math.random() * 1500);
        for (let i = 0; i < n; i++) a[i] *= 0.5 + 0.5 * Math.sin(i * 0.002 + Math.random() * 0.4);
        return mix(env(a, 0.06, 0.14), scale(env(sine(n, 70, 45), 0.003, 0.05), 0.35));
      }),
      asphalt: steps(() => {
        const n = sec(0.22);
        const cl = env(biquad(noise(n), 'bp', 1800, 0.9), 0.001, 0.02);
        const gr = env(biquad(noise(n), 'hp', 4000, 0.7, 0.4), 0.01, 0.04);
        const th = env(sine(n, 100, 60), 0.002, 0.04);
        return mix(cl, gr, scale(th, 0.6));
      }),
      wood: steps(() => {
        const n = sec(0.3);
        const knock = env(biquad(noise(n), 'bp', 420 + Math.random() * 120, 3), 0.002, 0.05);
        const body = env(sine(n, 140 + Math.random() * 30, 95), 0.002, 0.07);
        const cr = env(biquad(noise(n), 'bp', 2400, 4, 0.15), 0.04, 0.05);
        return mix(scale(knock, 1.3), scale(body, 0.7), cr);
      }),
      tile: steps(() => {
        const n = sec(0.3);
        const cl = env(biquad(noise(n), 'hp', 3500), 0.0005, 0.008);
        const ring = env(sine(n, 2100 + Math.random() * 400), 0.001, 0.03);
        const th = env(sine(n, 130, 80), 0.002, 0.03);
        return mix(cl, scale(ring, 0.15), scale(th, 0.5));
      }),
      metal: steps(() => {
        const n = sec(0.45);
        const cl = env(biquad(noise(n), 'bp', 2600, 2), 0.001, 0.02);
        const r1 = env(sine(n, 610 + Math.random() * 80), 0.001, 0.12);
        const r2 = env(sine(n, 1430 + Math.random() * 90), 0.001, 0.07);
        return mix(cl, scale(r1, 0.25), scale(r2, 0.12));
      }),
      mud: steps(() => {
        const n = sec(0.4);
        const a = noise(n);
        const o = new Float32Array(n);
        let lp = 0;
        for (let i = 0; i < n; i++) {
          const t = i / n;
          const k = 0.02 + 0.2 * Math.sin(Math.PI * t);
          lp += (a[i] - lp) * k;
          o[i] = lp;
        }
        return mix(env(o, 0.02, 0.12), scale(env(sine(n, 60, 40), 0.004, 0.06), 0.6));
      }),
    };
    // sino de objetivo concluído
    {
      const n = sec(1.6);
      const a = mix(env(sine(n, 659.3), 0.002, 0.5), scale(env(sine(n, 1318.5), 0.002, 0.25), 0.3));
      const b = mix(env(sine(n, 987.8), 0.002, 0.6), scale(env(sine(n, 1975.5), 0.002, 0.25), 0.3));
      const o = new Float32Array(n + sec(0.16));
      for (let i = 0; i < n; i++) {
        o[i] += a[i];
        o[i + sec(0.16)] += b[i];
      }
      B.objective = this.buf(normalize(o, 0.5));
    }
    // batidas numa porta de madeira
    {
      const n = sec(1.4);
      const o = new Float32Array(n);
      for (const at of [0, 0.32, 0.58]) {
        const m = sec(0.2);
        const k = env(biquad(noise(m), 'bp', 380, 2.5), 0.001, 0.04);
        const b = env(sine(m, 120, 90), 0.001, 0.05);
        for (let i = 0; i < m; i++) o[sec(at) + i] += k[i] * 1.5 + b[i];
      }
      B.knock = this.buf(normalize(o, 0.8));
    }
    // grilos (laço de 4 s)
    {
      const n = sec(4);
      const o = new Float32Array(n);
      for (let c = 0; c < 5; c++) {
        const f = 3900 + c * 260 + Math.random() * 100;
        const period = 0.55 + Math.random() * 0.5;
        const off = Math.random() * period;
        const g = 0.4 + Math.random() * 0.6;
        for (let i = 0; i < n; i++) {
          const t = i / SR;
          const ph = (t + off) % period;
          // 3 pulsos rápidos por chilro
          const pulse = ph < 0.12 ? Math.max(0, Math.sin((ph / 0.04) * Math.PI)) : 0;
          o[i] += Math.sin(2 * Math.PI * f * t) * pulse * g;
        }
      }
      B.crickets = this.buf(normalize(o, 0.5));
    }
    // latido distante
    {
      const n = sec(0.9);
      const o = new Float32Array(n);
      for (const at of [0, 0.35]) {
        const m = sec(0.22);
        let ph = 0;
        for (let i = 0; i < m; i++) {
          const t = i / m;
          ph += (2 * Math.PI * (520 - t * 260)) / SR;
          const v = Math.sign(Math.sin(ph)) * 0.6 + (Math.random() * 2 - 1) * 0.5;
          o[sec(at) + i] += v * Math.sin(Math.PI * t);
        }
      }
      B.bark = this.buf(normalize(biquad(o, 'bp', 900, 1.2), 0.7));
    }
    // motores e máquinas (laço de 4 s)
    {
      const n = sec(4);
      const o = new Float32Array(n);
      for (const [f, a] of [
        [50, 1],
        [100, 0.6],
        [150, 0.35],
        [225, 0.15],
        [400, 0.08],
      ]) {
        const ph = Math.random() * 6.28;
        for (let i = 0; i < n; i++) {
          const t = i / SR;
          o[i] += Math.sin(ph + 2 * Math.PI * f * t) * a * (0.85 + 0.15 * Math.sin(2 * Math.PI * 0.5 * t));
        }
      }
      const vent = biquad(noise(n), 'bp', 600, 0.5, 0.35);
      B.machine = this.buf(normalize(mix(o, vent), 0.6));
    }
    // bipe eletrônico
    B.beep = this.buf(normalize(env(sine(sec(0.25), 1760), 0.002, 0.06), 0.5));
    // alarme lento da comporta (laço de 2 s)
    {
      const n = sec(2);
      const o = new Float32Array(n);
      for (let i = 0; i < sec(0.5); i++) {
        const t = i / SR;
        o[i] = (Math.sin(2 * Math.PI * 880 * t) + Math.sin(2 * Math.PI * 660 * t) * 0.5) * Math.sin((Math.PI * i) / sec(0.5));
      }
      B.alarm = this.buf(normalize(o, 0.5));
    }
    // água batendo na margem (laço de 6 s)
    {
      const n = sec(6);
      const a = biquad(noise(n), 'lp', 700);
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const w = Math.pow(Math.max(0, Math.sin(t * 2.1) * Math.sin(t * 0.7 + 1)), 2);
        a[i] *= 0.15 + w;
      }
      const f = sec(0.3);
      for (let i = 0; i < f; i++) a[n - f + i] = a[n - f + i] * (1 - i / f) + a[i] * (i / f);
      B.water = this.buf(normalize(a, 0.6));
    }
    // fogueira / lareira (laço de 4 s)
    {
      const n = sec(4);
      const a = biquad(noise(n), 'lp', 500, 0.7, 0.4);
      for (let i = 0; i < n; i++) if (Math.random() < 0.0009) for (let k = 0; k < 160 && i + k < n; k++) a[i + k] += (Math.random() - 0.5) * Math.exp(-k / 30) * 2;
      B.fire = this.buf(normalize(biquad(a, 'hp', 80), 0.6));
    }
    // TV chiando atrás de uma porta (laço de 3 s)
    {
      const n = sec(3);
      const a = biquad(noise(n), 'bp', 1800, 0.4);
      const v = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        v[i] = a[i] * 0.6 + Math.sin(2 * Math.PI * 180 * t) * Math.max(0, Math.sin(t * 7)) * 0.2;
      }
      B.tvstatic = this.buf(normalize(biquad(v, 'lp', 2500), 0.5));
    }
    // gemido grave de madeira/pedra
    {
      const n = sec(3);
      const o = new Float32Array(n);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        ph += (2 * Math.PI * (70 + Math.sin(t * 9) * 12 - t * 25)) / SR;
        o[i] = (Math.sin(ph) + Math.sin(ph * 2.01) * 0.4) * Math.sin(Math.PI * t) * (0.7 + 0.3 * Math.random());
      }
      B.groan = this.buf(normalize(biquad(o, 'lp', 600), 0.6));
    }
    // estalo de lâmpada
    {
      const n = sec(0.35);
      const a = new Float32Array(n);
      for (let i = 0; i < n; i++) a[i] = (Math.sin((2 * Math.PI * 120 * i) / SR) > 0 ? 1 : -1) * 0.5 + (Math.random() * 2 - 1) * 0.6;
      for (let i = 0; i < n; i++) if (Math.floor(i / sec(0.03)) % 3 === 1) a[i] *= 0.05;
      B.crackle = this.buf(normalize(env(biquad(a, 'bp', 2500, 0.5), 0.002, 0.15), 0.7));
    }
    B.stepTick = [0, 1, 2].map(() => this.buf(normalize(env(biquad(noise(sec(0.06)), 'bp', 2000 + Math.random() * 1500, 1.4), 0.001, 0.018), 0.8)));
    B.click = this.buf(normalize(env(biquad(noise(sec(0.05)), 'bp', 3500, 3), 0.0005, 0.006), 0.6));
    // respiração ofegante
    {
      const n = sec(2.2);
      const a = biquad(noise(n), 'bp', 900, 0.7);
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const b = (t % 1.1) / 1.1;
        a[i] *= Math.sin(Math.PI * Math.min(1, b * 1.6)) * (b < 0.62 ? 1 : 0);
      }
      B.breath = this.buf(normalize(a, 0.5));
    }
    // queda e volta da energia
    B.powerDown = this.buf(
      normalize(mix(env(sine(sec(1.6), 120, 25), 0.005, 0.6), scale(env(sine(sec(0.4), 55, 30), 0.002, 0.12), 1.4)), 0.8),
    );
    B.powerUp = this.buf(normalize(mix(scale(env(sine(sec(0.3), 60, 40), 0.002, 0.08), 1.2), env(sine(sec(1.2), 40, 120), 0.4, 0.5)), 0.6));
    // sino do elevador
    {
      const n = sec(2.4);
      const a = mix(env(sine(n, 1318.5), 0.002, 0.8), scale(env(sine(n, 2637), 0.002, 0.3), 0.3));
      const b = mix(env(sine(n, 1046.5), 0.002, 0.9), scale(env(sine(n, 2093), 0.002, 0.3), 0.3));
      const o = new Float32Array(n + sec(0.45));
      for (let i = 0; i < n; i++) {
        o[i] += a[i];
        o[i + sec(0.45)] += b[i];
      }
      B.ding = this.buf(normalize(o, 0.6));
    }
    // goles
    {
      const n = sec(1.3);
      const o = new Float32Array(n);
      for (let g = 0; g < 3; g++) {
        const s = sec(0.1 + g * 0.38);
        const m = sec(0.18);
        const a = env(biquad(noise(m), 'bp', 380 - g * 40, 4), 0.01, 0.05);
        const t = env(sine(m, 260, 140), 0.005, 0.05);
        for (let i = 0; i < m; i++) o[s + i] += a[i] * 2 + t[i] * 0.5;
      }
      B.drink = this.buf(normalize(o, 0.6));
    }
    // papel
    {
      const n = sec(0.6);
      const a = biquad(noise(n), 'hp', 3000);
      for (let i = 0; i < n; i++) a[i] *= Math.random() < 0.15 ? 1 : 0.15;
      B.paper = this.buf(normalize(env(a, 0.02, 0.2), 0.5));
    }
    // susto
    {
      const n = sec(2.2);
      const o = new Float32Array(n);
      for (const f of [55, 58.3, 110.5, 233, 311]) {
        let ph = 0;
        for (let i = 0; i < n; i++) {
          ph += (2 * Math.PI * f) / SR;
          o[i] += ((ph / Math.PI) % 2) - 1;
        }
      }
      for (let i = 0; i < n; i++) o[i] = Math.tanh(o[i] * 0.8);
      const nb = env(biquad(noise(n), 'lp', 3000), 0.001, 0.25);
      B.scare = this.buf(normalize(mix(env(o, 0.003, 0.7), scale(nb, 2)), 0.95));
    }
    // sussurro
    {
      const n = sec(1.8);
      const a = noise(n);
      const f1 = biquad(a, 'bp', 700, 6);
      const f2 = biquad(a, 'bp', 1800, 5);
      const o = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const m = Math.max(0, Math.sin(t * 9 + Math.sin(t * 3) * 2));
        o[i] = (f1[i] * (0.5 + 0.5 * Math.sin(t * 5)) + f2[i]) * m * Math.sin((Math.PI * i) / n);
      }
      B.whisper = this.buf(normalize(o, 0.5));
    }
    // batimento
    {
      const n = sec(0.5);
      const a = env(sine(n, 55, 40), 0.004, 0.06);
      const b = env(sine(n, 50, 38), 0.004, 0.07);
      const o = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        o[i] += a[i];
        if (i + sec(0.18) < n) o[i + sec(0.18)] += b[i] * 0.7;
      }
      B.heart = this.buf(normalize(o, 0.9));
    }
    // porta de metal / rangido
    {
      const n = sec(1.4);
      const o = new Float32Array(n);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const f = 260 + Math.sin(t * 7) * 60 + Math.sin(t * 23) * 25 + t * 120;
        ph += (2 * Math.PI * f) / SR;
        o[i] = (((ph / Math.PI) % 2) - 1) * (Math.random() < 0.85 ? 1 : 0.2);
      }
      const cr = env(biquad(o, 'bp', 900, 3), 0.15, 0.6);
      const clunk = env(biquad(noise(n), 'lp', 400), 0.001, 0.08);
      B.door = this.buf(normalize(mix(scale(cr, 0.7), scale(clunk, 1.5)), 0.8));
      B.creak = this.buf(normalize(env(biquad(o, 'bp', 700, 4), 0.3, 0.5), 0.7));
    }
    // transição (estrondo + falha digital)
    {
      const n = sec(2.5);
      const boom = env(biquad(noise(n), 'lp', 140), 0.01, 0.9);
      const gl = biquad(noise(n), 'bp', 2000, 0.5);
      for (let i = 0; i < n; i++) gl[i] *= Math.floor(i / 900) % 3 === 0 ? 0.8 : 0;
      B.transition = this.buf(normalize(mix(scale(boom, 3), env(gl, 0.01, 0.4)), 0.95));
    }
    // fenda: zumbido falhando (laço de 2 s)
    {
      const n = sec(2);
      const a = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        a[i] = Math.sin(2 * Math.PI * 180 * t) * 0.5 + Math.sin(2 * Math.PI * 361 * t) * 0.4 + (Math.random() * 2 - 1) * 0.5;
        if (Math.floor(t * 23) % 4 === 0) a[i] *= 0.1;
      }
      B.rift = this.buf(normalize(biquad(a, 'bp', 900, 0.6), 0.7));
    }
    // rádio com estática (laço de 3 s)
    {
      const n = sec(3);
      const st = biquad(noise(n), 'bp', 2500, 0.4);
      const tone = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        tone[i] = Math.sin(2 * Math.PI * 440 * t) * (Math.floor(t * 4) % 3 === 0 ? 0.35 : 0) + Math.sin(2 * Math.PI * 220 * t) * 0.1;
        st[i] *= 0.5 + 0.5 * Math.sin(t * 2.094);
      }
      B.radio = this.buf(normalize(mix(st, tone), 0.6));
    }
    // telefone tocando (laço de 6 s): trinado de campainha
    {
      const n = sec(6);
      const a = new Float32Array(n);
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const on = t < 1.2 || (t > 1.6 && t < 2.8) ? 1 : 0;
        if (!on) continue;
        const tr = Math.sin(2 * Math.PI * 20 * t) > 0 ? 1 : 0.4;
        a[i] = (Math.sin(2 * Math.PI * 820 * t) + Math.sin(2 * Math.PI * 1040 * t) * 0.8 + Math.sin(2 * Math.PI * 2480 * t) * 0.2) * tr;
      }
      B.phone = this.buf(normalize(a, 0.7));
    }
    // vento (laço de 6 s)
    {
      const n = sec(6);
      const a = biquad(biquad(noise(n), 'lp', 900), 'hp', 120);
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        a[i] *= 0.55 + 0.45 * Math.sin((t / 6) * Math.PI * 2 * 2 + Math.sin(t * 1.3));
      }
      const f = sec(0.3);
      for (let i = 0; i < f; i++) {
        const t = i / f;
        a[n - f + i] = a[n - f + i] * (1 - t) + a[i] * t;
      }
      B.wind = this.buf(normalize(a, 0.6));
    }
    // corvo
    {
      const n = sec(0.45);
      const o = new Float32Array(n);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / n;
        ph += (2 * Math.PI * (520 - t * 160)) / SR;
        o[i] = ((ph / Math.PI) % 2) - 1 + (Math.random() * 2 - 1) * 0.6;
      }
      B.crow = this.buf(normalize(env(biquad(o, 'bp', 1300, 2.5), 0.02, 0.15), 0.6));
    }
    // gota
    {
      const n = sec(0.25);
      B.drip = this.buf(normalize(env(sine(n, 1800 + Math.random() * 800, 900), 0.001, 0.035), 0.6));
    }
    // sirene distante
    {
      const n = sec(8);
      const a = new Float32Array(n);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        const f = 700 + Math.sin(t * 0.8) * 180;
        ph += (2 * Math.PI * f) / SR;
        a[i] = Math.sin(ph) * Math.sin((Math.PI * i) / n);
      }
      B.siren = this.buf(normalize(biquad(a, 'lp', 1500), 0.5));
    }
    // rosnado do Sorridente (laço de 3 s)
    {
      const n = sec(3);
      const a = biquad(noise(n), 'lp', 300);
      for (let i = 0; i < n; i++) {
        const t = i / SR;
        a[i] = a[i] * (0.6 + 0.4 * Math.sin(2 * Math.PI * 7 * t)) + Math.sin(2 * Math.PI * 43 * t) * 0.3 * (0.5 + 0.5 * Math.sin(t * 2.1));
      }
      B.growl = this.buf(normalize(a, 0.7));
    }
  }

  // Resposta ao impulso sintética (decaimento exponencial estéreo).
  setReverb(seconds) {
    if (!this.ctx) return;
    const R = this.ctx.sampleRate;
    const n = Math.floor(Math.max(0.3, seconds) * R);
    const b = this.ctx.createBuffer(2, n, R);
    for (let ch = 0; ch < 2; ch++) {
      const d = b.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < n; i++) {
        const t = i / R;
        const k = 0.35 + 0.6 * (1 - t / seconds);
        lp = lp * (1 - k) + (Math.random() * 2 - 1) * k;
        d[i] = lp * Math.exp((-t * 6.9) / seconds) * (i < R * 0.004 ? i / (R * 0.004) : 1);
      }
    }
    try {
      this.reverb.buffer = b;
    } catch (e) {
      // ConvolverNode já com buffer: recria o nó
      const old = this.reverb;
      this.reverb = this.ctx.createConvolver();
      this.reverb.buffer = b;
      this.wet.disconnect();
      this.wet.connect(this.reverb).connect(this.master);
      old.disconnect();
    }
  }

  play(name, { gain = 1, rate = 1, wet = 0.3, pan = 0, when = 0 } = {}) {
    if (!this.ready) return null;
    let b = typeof name === 'string' ? this.B[name] : name;
    if (Array.isArray(b)) b = b[Math.floor(Math.random() * b.length)];
    if (!b) return null;
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = b;
    s.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = gain;
    let node = g;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      g.connect(p);
      node = p;
    }
    s.connect(g);
    node.connect(this.dry);
    if (wet > 0) {
      const w = ctx.createGain();
      w.gain.value = wet;
      node.connect(w).connect(this.wet);
    }
    s.start(ctx.currentTime + when);
    return s;
  }

  loop(name, gain, { rate = 1, lp = 0, wet = 0.2 } = {}) {
    const ctx = this.ctx;
    gain *= 1.7;
    const s = ctx.createBufferSource();
    s.buffer = this.B[name];
    s.loop = true;
    s.playbackRate.value = rate;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(gain, ctx.currentTime, 0.8);
    let n = s;
    if (lp) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = lp;
      s.connect(f);
      n = f;
    }
    n.connect(g);
    g.connect(this.dry);
    if (wet) {
      const w = ctx.createGain();
      w.gain.value = wet;
      g.connect(w).connect(this.wet);
    }
    s.start(ctx.currentTime + Math.random() * 0.1);
    const L = { src: s, gain: g, base: gain };
    this.loops.push(L);
    return L;
  }

  // Registra um som próprio (Float32Array mono gerado com DSP).
  addBuffer(name, data) {
    if (!this.ready) return;
    this.B[name] = this.buf(data);
  }

  // Trilha ambiente: acordes lentos em registro médio (audível no celular),
  // gerada por nível e tocada em laço bem baixo.
  startPad(kind) {
    if (!this.ready) return;
    const spec = PADS[kind];
    if (!spec) return;
    const name = 'pad_' + kind;
    if (!this.B[name]) this.B[name] = this.buf(makePad(spec));
    const ctx = this.ctx;
    const s = ctx.createBufferSource();
    s.buffer = this.B[name];
    s.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(spec.gain, ctx.currentTime + 1.5, 3);
    s.connect(g).connect(this.music);
    const w = ctx.createGain();
    w.gain.value = 0.5;
    g.connect(w).connect(this.wet);
    s.start();
    this.loops.push({ src: s, gain: g, base: spec.gain });
  }

  // Som de teste (botão nas configurações).
  test() {
    this.play('ding', { gain: 0.8, wet: 0.2 });
    this.play('objective', { gain: 0.6, when: 0.9 });
  }

  // Constrói o jazz de vitrola sob demanda (só o Nível 5 usa).
  ensureJazz() {
    if (this.ready && !this.B.jazz) this.B.jazz = this.buf(makeJazz());
  }

  // Fonte posicional em laço (ou única) num ponto do mundo. Devolve um controle
  // com setPos/setGain/stop; é parado automaticamente na troca de nível.
  positional(name, x, y, z, { gain = 1, ref = 3, rolloff = 1.2, loop = true, rate = 1, wet = 0.4, offset = 0 } = {}) {
    const dummy = { setPos() {}, setGain() {}, stop() {} };
    if (!this.ready || !this.B[name]) return dummy;
    const ctx = this.ctx;
    const p = ctx.createPanner();
    p.panningModel = this.lowCost ? 'equalpower' : 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = ref;
    p.rolloffFactor = rolloff;
    p.maxDistance = 10000;
    this.setPos(p, x, y, z);
    const g = ctx.createGain();
    g.gain.value = 0;
    g.gain.setTargetAtTime(gain, ctx.currentTime, 0.4);
    const s = ctx.createBufferSource();
    s.buffer = this.B[name];
    s.loop = loop;
    s.playbackRate.value = rate;
    s.connect(g).connect(p);
    p.connect(this.dry);
    if (wet) {
      const w = ctx.createGain();
      w.gain.value = wet;
      p.connect(w).connect(this.wet);
    }
    s.start(ctx.currentTime, loop ? offset % s.buffer.duration : 0);
    const h = {
      src: s,
      gain: g,
      setPos: (a, b, c) => this.setPos(p, a, b, c),
      setGain: (v, tc = 0.2) => g.gain.setTargetAtTime(v, ctx.currentTime, tc),
      stop: () => {
        try {
          g.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
          s.stop(ctx.currentTime + 1);
        } catch (e) {
          /* já parado */
        }
      },
    };
    if (loop) this.positionals.push(h);
    return h;
  }

  stopAll() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const h of this.positionals || []) h.stop();
    this.positionals = [];
    for (const L of this.loops) {
      L.gain.gain.setTargetAtTime(0, t, 0.3);
      L.src.stop(t + 1.5);
    }
    this.loops = [];
    if (this.emitter) {
      this.emitter.gain.gain.setTargetAtTime(0, t, 0.3);
      this.emitter.src.stop(t + 1.5);
      this.emitter = null;
    }
    if (this.growlL) {
      this.growlL.src.stop(t + 0.5);
      this.growlL = null;
    }
  }

  // Configura o ambiente sonoro de um nível.
  setLevel(look, emitter) {
    if (!this.ready) return;
    this.stopAll();
    this.kind = look.ambience;
    this.setMuffle(0);
    this.windK = 1;
    this.setReverb(look.reverb || 1.5);
    const k = this.kind;
    const wets = { level88: 0.12, level0_1: 0.4, level10: 0.08, level11: 0.2, level1: 0.55, level9: 0.12, level10_1: 0.18, level23: 0.3, level15: 0.45, level5: 0.4 };
    this.wet.gain.value = wets[k] !== undefined ? wets[k] : 0.35;
    this.hum = null;
    if (k === 'level0') {
      this.hum = this.loop('hum', 0.16, { wet: 0.1 });
      this.loop('brown', 0.05, { lp: 300 });
    } else if (k === 'level1') {
      this.hum = this.loop('hum', 0.07, { rate: 0.995, lp: 1500, wet: 0.4 });
      this.loop('brown', 0.16, { lp: 160 });
      this.loop('wind', 0.04, { rate: 0.6, lp: 600, wet: 0.5 });
    } else if (k === 'level4') {
      this.hum = this.loop('hum', 0.05, { rate: 1.002, lp: 2500 });
      this.loop('brown', 0.07, { lp: 700 });
    } else if (k === 'level10') {
      this.wind = this.loop('wind', 0.32, { wet: 0 });
      this.loop('white', 0.03, { lp: 9000, wet: 0 });
      this.loop('hum', 0.015, { rate: 0.5, lp: 400 });
    } else if (k === 'level11') {
      this.loop('brown', 0.13, { lp: 260 });
      this.wind = this.loop('wind', 0.12, { rate: 0.8 });
    } else if (k === 'level5') {
      this.loop('brown', 0.06, { lp: 380 });
      this.hum = this.loop('hum', 0.02, { rate: 0.5, lp: 600 });
    } else if (k === 'level9') {
      this.loop('crickets', 0.12, { wet: 0.05 });
      this.wind = this.loop('wind', 0.1, { rate: 0.7 });
    } else if (k === 'level15') {
      this.machineL = this.loop('machine', 0.12, { lp: 900, wet: 0.5 });
      this.loop('white', 0.015, { lp: 3000 });
    } else if (k === 'level23') {
      this.wind = this.loop('wind', 0.18, { rate: 0.55, lp: 2200 });
      this.loop('brown', 0.05, { lp: 200 });
    } else if (k === 'level88') {
      // floresta morta: vento alto nas copas, quase nenhum outro som
      this.wind = this.loop('wind', 0.12, { rate: 0.5, lp: 800, wet: 0.1 });
      this.loop('brown', 0.04, { lp: 160 });
    } else if (k === 'level0_1') {
      // usina: zumbido elétrico limpo, ventilação e o grave das turbinas
      this.hum = this.loop('hum', 0.06, { rate: 0.5, lp: 1800, wet: 0.3 });
      this.machineL = this.loop('machine', 0.06, { rate: 0.7, lp: 500, wet: 0.5 });
      this.loop('brown', 0.07, { lp: 240 });
      this.loop('white', 0.012, { lp: 2400, wet: 0.4 });
    } else if (k === 'level10_1') {
      this.loop('water', 0.22, { wet: 0.1 });
      this.wind = this.loop('wind', 0.09, { rate: 0.6, lp: 900 });
    }
    this.startPad(k);
    this.setEmitter(emitter);
  }

  // Fonte sonora posicional (a saída do nível).
  setEmitter(e) {
    if (!e || !this.ready) return;
    const ctx = this.ctx;
    const p = ctx.createPanner();
    p.panningModel = 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = e.sound === 'phone' ? 6 : 3;
    p.rolloffFactor = e.sound === 'phone' ? 0.9 : 1.1;
    p.maxDistance = 10000;
    this.setPos(p, e.x, e.y, e.z);
    const g = ctx.createGain();
    g.gain.value = 0;
    const gainBy = { rift: 0.9, radio: 0.7, elevator: 0.0, creak: 0.0, phone: 1.0, knock: 0.0, alarm: 0.0 };
    const loopBuf =
      { rift: 'rift', radio: 'radio', elevator: 'hum', creak: 'wind', phone: 'phone', knock: 'brown', alarm: 'machine' }[e.sound] ||
      (this.B[e.sound] ? e.sound : 'hum');
    if (e.sound === 'jazz') this.ensureJazz();
    const s = ctx.createBufferSource();
    s.buffer = this.B[loopBuf];
    s.loop = true;
    if (e.sound === 'elevator') s.playbackRate.value = 0.7;
    s.connect(g).connect(p);
    p.connect(this.dry);
    const w = ctx.createGain();
    w.gain.value = 0.6;
    p.connect(w).connect(this.wet);
    g.gain.setTargetAtTime(e.gain !== undefined ? e.gain : gainBy[e.sound] ?? 0.6, ctx.currentTime, 1);
    s.start();
    this.emitter = { src: s, gain: g, panner: p, kind: e.sound, t: 4 };
  }

  // Um som pontual tocado na posição do emissor.
  emitterShot(name, gain) {
    const e = this.emitter;
    if (!e) return;
    const s = this.ctx.createBufferSource();
    s.buffer = this.B[name];
    const g = this.ctx.createGain();
    g.gain.value = gain;
    s.connect(g).connect(e.panner);
    s.start();
  }

  setPos(node, x, y, z) {
    if (node.positionX) {
      node.positionX.value = x;
      node.positionY.value = y;
      node.positionZ.value = z;
    } else node.setPosition(x, y, z);
  }

  // Atualização por quadro: ouvinte, zumbido, eventos aleatórios e coração.
  update(dt, cam, st) {
    if (!this.ready) return;
    const ctx = this.ctx;
    const L = ctx.listener;
    const e = cam.matrixWorld.elements;
    const fx = -e[8];
    const fy = -e[9];
    const fz = -e[10];
    if (L.positionX) {
      L.positionX.value = cam.position.x;
      L.positionY.value = cam.position.y;
      L.positionZ.value = cam.position.z;
      L.forwardX.value = fx;
      L.forwardY.value = fy;
      L.forwardZ.value = fz;
      L.upX.value = e[4];
      L.upY.value = e[5];
      L.upZ.value = e[6];
    } else {
      L.setPosition(cam.position.x, cam.position.y, cam.position.z);
      L.setOrientation(fx, fy, fz, e[4], e[5], e[6]);
    }
    const t = ctx.currentTime;
    if (this.hum) this.hum.gain.gain.setTargetAtTime(this.hum.base * Math.min(1.6, 0.25 + st.light * 0.9) * st.power, t, 0.08);
    // eventos do emissor
    const em = this.emitter;
    if (em) {
      em.t -= dt;
      if (em.t <= 0) {
        if (em.kind === 'elevator') {
          this.emitterShot('ding', 1.4);
          em.t = 11 + Math.random() * 8;
        } else if (em.kind === 'creak') {
          this.emitterShot('creak', 1.6);
          em.t = 3 + Math.random() * 5;
        } else if (em.kind === 'knock') {
          this.emitterShot('knock', 1.5);
          em.t = 6 + Math.random() * 6;
        } else if (em.kind === 'alarm') {
          this.emitterShot('alarm', 1.2);
          em.t = 2.5;
        } else em.t = 999;
      }
    }
    // sons aleatórios do ambiente
    this.shotT -= dt;
    if (this.shotT <= 0) {
      this.shotT = 4 + Math.random() * 9;
      const pan = Math.random() * 2 - 1;
      const k = this.kind;
      if (k === 'level0') {
        if (Math.random() < 0.35) {
          for (let i = 0; i < 3 + Math.floor(Math.random() * 4); i++)
            this.play(this.B.step.carpet, { gain: 0.08, rate: 0.85, wet: 1.2, pan, when: i * 0.55 });
        } else this.play('crackle', { gain: 0.05, pan, wet: 1, rate: 0.7 });
      } else if (k === 'level1') {
        const r = Math.random();
        if (r < 0.6) this.play('drip', { gain: 0.25, rate: 0.8 + Math.random() * 0.6, pan, wet: 1.5 });
        else if (r < 0.85) this.play('door', { gain: 0.08, rate: 0.5, pan, wet: 1.6 });
        else this.play('powerDown', { gain: 0.06, rate: 2, pan, wet: 1.6 });
      } else if (k === 'level4') {
        if (Math.random() < 0.3) this.play('paper', { gain: 0.06, pan, wet: 1 });
      } else if (k === 'level10') {
        if (Math.random() < 0.55) this.play('crow', { gain: 0.18 + Math.random() * 0.15, rate: 0.9 + Math.random() * 0.2, pan, wet: 0.3 });
        if (this.wind) this.wind.gain.gain.setTargetAtTime(0.2 + Math.random() * 0.25, t, 2);
      } else if (k === 'level11') {
        if (Math.random() < 0.18) this.play('siren', { gain: 0.06, pan, wet: 1.2 });
        if (this.wind) this.wind.gain.gain.setTargetAtTime(0.08 + Math.random() * 0.1, t, 2);
      } else if (k === 'level5') {
        const r = Math.random();
        if (r < 0.35) this.play('knock', { gain: 0.1, rate: 0.9 + Math.random() * 0.2, pan, wet: 1.4 });
        else if (r < 0.7) this.play('whisper', { gain: 0.08, rate: 1.3 + Math.random() * 0.4, pan, wet: 1.6 });
        else if (r < 0.85) this.play(this.B.step.wood, { gain: 0.06, rate: 0.85, pan, wet: 1.4 });
      } else if (k === 'level9') {
        if (Math.random() < 0.45) this.play('bark', { gain: 0.07 + Math.random() * 0.08, rate: 0.85 + Math.random() * 0.3, pan, wet: 0.9 });
        if (this.wind) this.wind.gain.gain.setTargetAtTime(0.05 + Math.random() * 0.1, t, 2);
      } else if (k === 'level15') {
        const r = Math.random();
        if (r < 0.4) this.play('beep', { gain: 0.06, rate: 0.8 + Math.random() * 0.5, pan, wet: 1.2 });
        else if (r < 0.7) this.play('door', { gain: 0.06, rate: 0.4, pan, wet: 1.6 });
      } else if (k === 'level23') {
        const r = Math.random();
        if (r < 0.45) this.play('groan', { gain: 0.12 + Math.random() * 0.1, rate: 0.7 + Math.random() * 0.5, pan, wet: 1.2 });
        else if (r < 0.75) this.play('drip', { gain: 0.15, rate: 0.6 + Math.random() * 0.5, pan, wet: 1.4 });
        if (this.wind) this.wind.gain.gain.setTargetAtTime(0.1 + Math.random() * 0.15, t, 2.5);
      } else if (k === 'level88') {
        const r = Math.random();
        if (r < 0.3) this.play('crackle', { gain: 0.07, rate: 0.5 + Math.random() * 0.3, pan, wet: 0.6 });
        else if (r < 0.5) this.play('creak', { gain: 0.05, rate: 0.6 + Math.random() * 0.3, pan, wet: 0.8 });
        else if (r < 0.58) this.play('groan', { gain: 0.05, rate: 0.5 + Math.random() * 0.2, pan, wet: 1.6 });
        if (this.wind) this.wind.gain.gain.setTargetAtTime((this.windK ?? 1) * (0.06 + Math.random() * 0.1), t, 2.5);
      } else if (k === 'level0_1') {
        const r = Math.random();
        if (r < 0.4) this.play('beep', { gain: 0.05, rate: 0.9 + Math.random() * 0.8, pan, wet: 0.9 });
        else if (r < 0.6) this.play('crackle', { gain: 0.05, rate: 0.6, pan, wet: 1.2 });
        else if (r < 0.75) this.play('door', { gain: 0.05, rate: 0.7, pan, wet: 1.4 });
      } else if (k === 'level10_1') {
        if (Math.random() < 0.3) this.play('drip', { gain: 0.12, rate: 0.35, pan, wet: 0.6 });
        if (this.wind) this.wind.gain.gain.setTargetAtTime(0.04 + Math.random() * 0.08, t, 3);
      }
      // alucinações
      if (st.sanity < 35 && Math.random() < 0.6)
        this.play('whisper', {
          gain: 0.12 + (35 - st.sanity) * 0.006,
          pan: Math.random() * 2 - 1,
          wet: 0.8,
          rate: 0.8 + Math.random() * 0.4,
        });
    }
    // batimento cardíaco
    if (st.sanity < 30 || st.fear > 0.3) {
      this.heartT -= dt;
      if (this.heartT <= 0) {
        const k = Math.max((30 - st.sanity) / 30, st.fear);
        this.heartT = 60 / (70 + k * 70);
        this.play('heart', { gain: 0.25 + k * 0.4, wet: 0 });
      }
    }
    // rosnado do Sorridente mais próximo
    if (st.growl) {
      if (!this.growlL) {
        const s = ctx.createBufferSource();
        s.buffer = this.B.growl;
        s.loop = true;
        const g = ctx.createGain();
        g.gain.value = 0;
        const p = ctx.createPanner();
        p.panningModel = 'HRTF';
        p.refDistance = 2;
        p.rolloffFactor = 1.4;
        s.connect(g).connect(p).connect(this.dry);
        s.start();
        this.growlL = { src: s, gain: g, panner: p };
      }
      this.setPos(this.growlL.panner, st.growl.x, 1.5, st.growl.z);
      this.growlL.gain.gain.setTargetAtTime(st.growl.v, t, 0.2);
    } else if (this.growlL) this.growlL.gain.gain.setTargetAtTime(0, t, 0.3);
  }

  footstep(surface, k) {
    if (!this.ready) return;
    const b = this.B.step[surface] || this.B.step.carpet;
    const out = surface === 'grass' || surface === 'dirt' || surface === 'mud';
    this.play(b, { gain: 0.5 * k, rate: 0.9 + Math.random() * 0.2, wet: out ? 0.05 : 0.35 });
    const tick = { carpet: 0.08, grass: 0.06, mud: 0.06, dirt: 0.12 }[surface] ?? 0.16;
    this.play(this.B.stepTick, { gain: tick * k, rate: 0.85 + Math.random() * 0.3, wet: out ? 0 : 0.2 });
  }

  crackle(v) {
    this.play('crackle', { gain: 0.25 * v, rate: 0.9 + Math.random() * 0.3, wet: 0.4 });
  }
  click() {
    this.play('click', { gain: 0.5, wet: 0.05 });
  }
  breath() {
    this.play('breath', { gain: 0.5, wet: 0.1 });
  }
  powerDown() {
    this.play('powerDown', { gain: 0.6, wet: 0.8 });
  }
  powerUp() {
    this.play('powerUp', { gain: 0.4, wet: 0.8 });
  }
  ding() {
    this.play('ding', { gain: 0.6, wet: 0.3 });
  }
  drink() {
    this.play('drink', { gain: 0.7, wet: 0.1 });
  }
  paper() {
    this.play('paper', { gain: 0.6, wet: 0.1 });
  }
  scare() {
    this.play('scare', { gain: 0.9, wet: 0.4 });
  }
  sting() {
    this.play('whisper', { gain: 0.35, rate: 0.6, wet: 1 });
  }
  door() {
    this.play('door', { gain: 0.7, wet: 0.4 });
  }
  transition() {
    this.play('transition', { gain: 0.8, wet: 0.6 });
  }
  objective() {
    this.play('objective', { gain: 0.5, wet: 0.3 });
  }
  hiss() {
    this.play('crackle', { gain: 0.3, rate: 0.5, wet: 0.6 });
  }
}

// Trilha sonora do episódio, composta em código. Cada função gera eventos
// (tempo absoluto em segundos) para o AudioEngine. A abertura "Kōyō Crimson"
// é um rock de anime em mi menor com a "progressão real" (IV–V–iii–vi) no
// refrão; há também o tema da escola, o tema da Hana, o piano do beco, o
// tema de batalha e a balada do encerramento.

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export function midi(name) {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error('nota inválida ' + name);
  return 12 * (+m[3] + 1) + NOTE[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

// "E5:1 G5:.5 r:1" → [[midi|null, beats], ...]
function parse(str) {
  return str
    .trim()
    .split(/\s+/)
    .map((tok) => {
      const [n, d] = tok.split(':');
      return [n === 'r' ? null : midi(n), parseFloat(d)];
    });
}

class Seq {
  constructor(out, start, bpm) {
    this.out = out;
    this.start = start;
    this.beat = 60 / bpm;
    this.bar = this.beat * 4;
  }
  t(bar, beat = 0) {
    return this.start + bar * this.bar + beat * this.beat;
  }
  ev(i, bar, beat, o = {}) {
    const e = { i, t: this.t(bar, beat), ...o };
    if (o.beats !== undefined) {
      e.d = o.beats * this.beat;
      delete e.beats;
    }
    this.out.push(e);
    return e;
  }
  // Melodia a partir do compasso bar.
  melody(i, bar, str, o = {}) {
    let b = 0;
    for (const [n, d] of parse(str)) {
      if (n !== null) this.ev(i, bar, b, { n: n + (o.tr || 0), beats: d * (o.legato ?? 0.95), v: o.v, r: o.r, dl: o.dl, dist: o.dist, b: o.b, s: o.s, p: o.p });
      b += d;
    }
    return b;
  }
}

// Acordes de quinta (guitarra) e fundamentais (baixo).
const PC = {
  E: [40, 47, 52],
  C: [36, 43, 48],
  G: [43, 50, 55],
  D: [38, 45, 50],
  B: [35, 42, 47],
  A: [45, 52, 57],
  F: [41, 48, 53],
  Bb: [46, 53, 58],
};
const TRIAD = {
  Em: [64, 67, 71],
  C: [60, 64, 67],
  G: [55, 59, 62],
  D: [62, 66, 69],
  Bm: [59, 62, 66],
  B: [59, 63, 66],
  Am: [57, 60, 64],
  F: [53, 57, 60],
  Dm: [62, 65, 69],
  E: [56, 59, 64],
  Bb: [58, 62, 65],
};
const ROOT = (c) => PC[c.replace('m', '')][0];

// ------------------------------------------------------------ abertura
export const OP_START = 25;
export const OP_BPM = 4 * 60 / (90 / 64);

function opening(out) {
  const S = new Seq(out, OP_START, OP_BPM);
  const sections = [
    ['intro', 0, 'Em Em C D Em Em C D'],
    ['verse', 8, 'Em C G D Em C G D Em C G D Em C G D'],
    ['pre', 24, 'C D Bm Em C D B B'],
    ['chorus', 32, 'C D Bm Em C D G B C D Bm Em C D Em Em'],
    ['outro', 48, 'C D Bm Em C D G B Em Em C D'],
  ];
  for (const [kind, b0, chords] of sections) {
    chords.split(' ').forEach((c, k) => {
      const bar = b0 + k;
      const pc = PC[c.replace('m', '')];
      const root = pc[0];
      // bateria
      if (kind === 'intro' && bar < 2) {
        for (const bt of [0, 1.5, 3]) {
          S.ev('kick', bar, bt, { v: 1 });
          S.ev('gtr', bar, bt, { c: pc, beats: bt === 3 ? 1 : 1.4, v: 0.8 });
        }
        if (bar === 0) S.ev('crash', bar, 0, { v: 0.9 });
        S.ev('bass', bar, 0, { n: root, beats: 4, v: 0.8 });
        return;
      }
      const full = kind === 'chorus' || kind === 'outro' || kind === 'intro';
      for (let e8 = 0; e8 < 8; e8++) {
        const bt = e8 / 2;
        const kickOn = full ? [0, 3, 4, 7].includes(e8) || (kind === 'chorus' && e8 === 5) : [0, 4, 5].includes(e8) || (kind === 'pre' && e8 % 2 === 0);
        if (kickOn) S.ev('kick', bar, bt, { v: 0.95 });
        if (e8 === 2 || e8 === 6) S.ev('snare', bar, bt, { v: 0.9 });
        S.ev('hat', bar, bt, { v: e8 % 2 ? 0.5 : 0.8, n: full && e8 % 2 ? 1 : 0, p: 0.25 });
        // baixo em colcheias (oitava no refrão)
        S.ev('bass', bar, bt, { n: root + (full && e8 % 4 === 2 ? 12 : 0), beats: 0.45, v: 0.75, mute: !full });
      }
      if (kind === 'pre' && bar === 31) for (let s = 0; s < 16; s++) S.ev('snare', bar, s / 4, { v: 0.4 + s * 0.035 });
      if (kind === 'pre' && bar === 30) S.ev('riser', bar, 0, { d: S.bar * 2, v: 0.5 });
      if ((full && k % 2 === 0) || (kind !== 'verse' && k === 0)) S.ev('crash', bar, 0, { v: 0.7 });
      // guitarra
      if (kind === 'verse') {
        for (let e8 = 0; e8 < 8; e8++) S.ev('gtr', bar, e8 / 2, { c: pc.slice(0, 2), mute: 1, beats: 0.4, v: 0.75, p: -0.3 });
      } else {
        S.ev('gtr', bar, 0, { c: pc, beats: 1.9, v: 0.75, p: -0.3 });
        S.ev('gtr', bar, 2, { c: pc, beats: 1.4, v: 0.7, p: -0.3 });
        S.ev('gtr', bar, 3.5, { c: pc, beats: 0.45, v: 0.7, p: -0.3 });
      }
      if (kind === 'chorus' || kind === 'pre' || kind === 'outro') {
        const tri = TRIAD[c] || TRIAD[c + 'm'];
        S.ev('pad', bar, 0, { c: tri, beats: 4, v: 0.5, s: 1, p: 0.3 });
      }
    });
  }
  const riff1 = ['E5:.5 G5:.5 A5:.5 B5:1 A5:.25 G5:.25 E5:1', 'D5:.5 E5:.5 G5:.5 E5:.5 B4:1 r:1', 'E5:.5 G5:.5 C6:1 B5:.5 G5:.5 E5:1', 'F#5:.5 A5:.5 D6:1.5 C6:.25 B5:.25 A5:1'];
  const riff2 = [...riff1.slice(0, 3), 'F#5:.5 A5:.5 D6:.5 E6:.5 F#6:2'];
  [...riff1, ...riff2].forEach((m, i) => S.melody('lead', i, m, { dist: 1, v: 0.75 }));
  const verse = [
    'B4:1 E5:.5 E5:.5 G5:1 F#5:.5 E5:.5',
    'G5:1.5 E5:.5 C5:1 r:1',
    'D5:.5 D5:.5 G5:1 B5:1 A5:.5 G5:.5',
    'F#5:2 A5:1 r:1',
    'B4:1 E5:.5 G5:.5 B5:1 A5:.5 G5:.5',
    'E5:1 G5:1 C6:1 B5:.5 A5:.5',
    'B5:1.5 A5:.5 G5:1 D5:1',
    'F#5:3 r:1',
  ];
  verse.forEach((m, i) => S.melody('lead', 8 + i, m, { v: 0.6 }));
  verse.forEach((m, i) => S.melody('lead', 16 + i, i === 7 ? 'F#5:2 A5:1 B5:1' : m, { v: 0.62 }));
  const pre = [
    'E5:.5 G5:.5 C6:1 B5:.5 A5:.5 G5:1',
    'F#5:.5 A5:.5 D6:1.5 A5:.5 F#5:1',
    'D5:.5 F#5:.5 B5:1 A5:.5 F#5:.5 D5:1',
    'E5:1 G5:1 B5:2',
    'C6:1 B5:.5 A5:.5 G5:1 E5:1',
    'D6:1 C6:.5 B5:.5 A5:1 F#5:1',
    'B5:.5 A5:.5 F#5:.5 D#5:.5 F#5:1 B5:1',
    'B5:2 r:1 D6:.5 D#6:.5',
  ];
  pre.forEach((m, i) => S.melody('lead', 24 + i, m, { v: 0.65 }));
  const ch = [
    'E6:1.5 D6:.5 C6:1 B5:1',
    'D6:1.5 C6:.5 B5:1 A5:1',
    'B5:1 A5:.5 B5:.5 D6:1 F#5:1',
    'G5:1 A5:.5 B5:2.5',
    'E6:1.5 D6:.5 C6:1 E6:1',
    'F#6:1.5 E6:.5 D6:1 A5:1',
    'B5:1 D6:1 G6:1 F#6:.5 E6:.5',
    'D#6:2 F#6:1 B5:1',
  ];
  const ch2 = [...ch.slice(0, 4), 'E6:1.5 D6:.5 C6:1 E6:1', 'F#6:1.5 E6:.5 D6:1 F#6:1', 'G6:2 F#6:1 E6:1', 'E6:4'];
  ch.forEach((m, i) => S.melody('lead', 32 + i, m, { dist: 1, v: 0.85 }));
  ch2.forEach((m, i) => S.melody('lead', 40 + i, m, { dist: 1, v: 0.85 }));
  ch.forEach((m, i) => S.melody('lead', 48 + i, m, { dist: 1, v: 0.85 }));
  riff1.forEach((m, i) => S.melody('lead', 56 + i, m, { dist: 1, v: 0.8 }));
  // final: acorde, prato e logo
  S.ev('kick', 60, 0, { v: 1.1 });
  S.ev('crash', 60, 0, { v: 1 });
  S.ev('boom', 60, 0, { v: 0.8 });
  S.ev('gtr', 60, 0, { c: PC.E, beats: 14, v: 0.85 });
  S.ev('bass', 60, 0, { n: 40, beats: 12, v: 0.8 });
  S.ev('lead', 60, 0, { n: 88, beats: 12, dist: 1, v: 0.7 });
  S.ev('pad', 60, 0, { c: TRIAD.Em, beats: 14, v: 0.6, s: 1 });
}

// ------------------------------------------------------------ temas
// Tema da escola (leve): I–vi–IV–V com glockenspiel e piano.
function schoolBGM(out, start, bars, bpm = 120, tr = 0, o = {}) {
  const S = new Seq(out, start, bpm);
  const chords = ['C', 'Am', 'F', 'G'];
  const mel = ['E5:1 G5:1 C6:1 G5:1', 'A5:1.5 G5:.5 E5:2', 'F5:1 A5:1 C6:1.5 A5:.5', 'G5:3 r:1', 'E5:.5 F5:.5 G5:1 C6:1 B5:1', 'A5:1 C6:1 E6:1 D6:1', 'C6:1 A5:1 F5:1 A5:1', 'G5:2 B5:1 D6:1'];
  for (let b = 0; b < bars; b++) {
    const c = chords[b % 4];
    const tri = TRIAD[c];
    const root = { C: 48, Am: 45, F: 41, G: 43 }[c];
    for (let q = 0; q < 4; q++) S.ev(o.bassInst || 'pluck', b, q, { n: root - 12 + tr + (q === 2 ? 7 : 0), v: 0.55 });
    for (let q = 0; q < 4; q++) for (const n of tri) S.ev('piano', b, q + 0.5, { n: n + tr, beats: 0.3, v: 0.32 });
    if (!o.noDrums) {
      for (let e = 0; e < 8; e++) S.ev('hat', b, e / 2, { v: 0.25 + (e % 2 ? 0 : 0.1), p: 0.3 });
      S.ev('kick', b, 0, { v: 0.5 });
      S.ev('kick', b, 2, { v: 0.4 });
      S.ev('snare', b, 1, { v: 0.25 });
      S.ev('snare', b, 3, { v: 0.25 });
    }
    S.melody(o.leadInst || 'bell', b, mel[b % 8], { tr: tr + (o.melTr || 0), v: o.melV ?? 0.55 });
  }
}

// Tema da Hana: delicado, glockenspiel e cordas.
function hanaTheme(out, start, bars, bpm = 84, tr = 0, v = 1) {
  const S = new Seq(out, start, bpm);
  const chords = ['G', 'Em', 'C', 'D'];
  const mel = ['B5:1 D6:1 G6:2', 'G6:1 F#6:.5 E6:.5 B5:2', 'C6:1 E6:1 G6:1 E6:1', 'F#6:2 A5:1 D6:1'];
  for (let b = 0; b < bars; b++) {
    const c = chords[b % 4];
    const tri = TRIAD[c];
    for (const n of tri) S.ev('str', b, 0, { n: n + tr - 12, beats: 4, v: 0.45 * v, s: 1 });
    const arp = [tri[0], tri[1] + 12, tri[2], tri[1] + 12, tri[0] + 12, tri[2], tri[1] + 12, tri[2]];
    arp.forEach((n, i) => S.ev('piano', b, i / 2, { n: n + tr - 12, beats: 0.5, v: 0.3 * v }));
    S.melody('bell', b, mel[b % 4], { tr: tr - 12, v: 0.5 * v });
  }
}

// Piano melancólico do beco (lá menor) — o tema do Akashi.
const AKASHI_MEL = ['E5:1.5 D5:.5 C5:1 B4:1', 'C5:1.5 B4:.5 A4:2', 'G4:1 C5:1 E5:1 G5:1', 'D5:2 B4:2', 'E5:1.5 D5:.5 C5:1 E5:1', 'F5:1.5 E5:.5 C5:2', 'D5:1 C5:1 B4:1 G4:1', 'G#4:2 B4:2'];
const AKASHI_CH = ['Am', 'F', 'C', 'G', 'Am', 'F', 'Dm', 'E'];
function alleyPiano(out, start, bars, bpm = 70, inst = 'piano', strings = true) {
  const S = new Seq(out, start, bpm);
  for (let b = 0; b < bars; b++) {
    const c = AKASHI_CH[b % 8];
    const tri = TRIAD[c];
    const bassN = tri[0] - 24;
    const arp = [bassN, bassN + 7, tri[0] - 12, tri[1] - 12, tri[2] - 12, tri[1] - 12, tri[0] - 12, bassN + 7];
    arp.forEach((n, i) => S.ev('piano', b, i / 2, { n, beats: 0.9, v: 0.32 }));
    if (strings) for (const n of tri) S.ev('str', b, 0, { n: n - 12, beats: 4, v: 0.3, s: 1, a: 0.6 });
    S.melody(inst, b, AKASHI_MEL[b % 8], { v: inst === 'bell' ? 0.45 : 0.6, tr: inst === 'bell' ? 12 : 0 });
  }
}

// Tensão (atrás do ginásio): ostinato grave de cordas e taikos.
function tension(out, start, bars, bpm = 92, taiko = true) {
  const S = new Seq(out, start, bpm);
  const pat = [38, 38, 38, 41, 38, 38, 40, 36];
  for (let b = 0; b < bars; b++) {
    pat.forEach((n, i) => S.ev('bass', b, i / 2, { n, beats: 0.4, v: 0.5, mute: 1 }));
    pat.forEach((n, i) => S.ev('str', b, i / 2, { n: n + 12, beats: 0.35, v: 0.35, a: 0.02 }));
    if (taiko) S.ev('taiko', b, 0, { n: 33, v: 0.7 });
    if (taiko && b % 2 === 1) S.ev('taiko', b, 2.5, { n: 36, v: 0.5 });
    S.ev('pad', b, 0, { c: [50, 53, 57], beats: 4, v: 0.35, s: 1, cut: 700 });
  }
}

// Suspense: drone grave, harmônicos agudos e batidas de coração.
function suspense(out, start, dur, o = {}) {
  out.push({ i: 'pad', t: start, d: dur, c: [33, 40], v: 0.7, s: 1, cut: 400, wave: 'sawtooth', a: 2 });
  out.push({ i: 'str', t: start + 1, d: dur - 1, n: 93, v: 0.18, s: 1, a: 3 });
  out.push({ i: 'str', t: start + 3, d: dur - 3, n: 94, v: 0.12, s: 1, a: 3 });
  if (o.heart) {
    let t = start + 2;
    let per = 1.1;
    while (t < start + dur - 0.5) {
      out.push({ i: 'heart', t, v: 0.7 });
      t += per;
      per = Math.max(0.55, per * 0.95);
    }
  }
  if (o.piano)
    for (let t = start + 4; t < start + dur - 2; t += 4.5) out.push({ i: 'piano', t, n: 33 + ((t * 7) % 3 | 0), d: 2, v: 0.5 });
}

// Tema de batalha (mi menor, 176 bpm).
export const BATTLE_BPM = 176;
function battle(out, start, bars, o = {}) {
  const S = new Seq(out, start, BATTLE_BPM);
  const prog = o.prog || ['E', 'E', 'C', 'D', 'E', 'E', 'Bb', 'B'];
  for (let b = 0; b < bars; b++) {
    const c = prog[b % prog.length];
    const pc = PC[c];
    for (let s = 0; s < 16; s++) {
      const bt = s / 4;
      if (s % 2 === 0) S.ev('kick', b, bt, { v: s % 8 === 0 ? 1 : 0.8 });
      if (o.double && s % 2 === 1) S.ev('kick', b, bt, { v: 0.55 });
      if (s === 4 || s === 12) S.ev('snare', b, bt, { v: 1 });
      S.ev('hat', b, bt, { v: s % 4 === 0 ? 0.6 : 0.35, p: 0.3 });
      S.ev('gtr', b, bt, { c: pc.slice(0, 2), mute: s % 4 !== 0, beats: s % 4 === 0 ? 0.9 : 0.2, v: 0.75, p: -0.35 });
      if (s % 2 === 0) S.ev('bass', b, bt, { n: pc[0], beats: 0.45, v: 0.8 });
      const tri = TRIAD[c === 'E' ? 'Em' : c === 'B' ? 'B' : c];
      S.ev('pluck', b, bt, { n: tri[s % 3] + 12 + (s % 6 > 2 ? 12 : 0), v: 0.32, p: 0.4 });
    }
    if (b % 2 === 0) S.ev('crash', b, 0, { v: 0.6 });
    if (b % 8 === 7) for (let s = 0; s < 8; s++) S.ev('tom', b, 2 + s / 4, { n: 50 - s * 2, v: 0.8 });
    if (o.brass && b % 4 === 0) S.ev('brass', b, 0, { c: [pc[0] + 12, pc[1] + 12, pc[2] + 12], beats: 1.5, v: 0.7 });
  }
  if (o.mel) o.mel.forEach((m, i) => S.melody('lead', i, m, { dist: 1, v: 0.85 }));
  return S;
}

function ending(out, start, bars, bpm = 76) {
  const S = new Seq(out, start, bpm);
  const chords = [
    ['G', 43],
    ['D', 42],
    ['Em', 40],
    ['C', 36],
    ['G', 43],
    ['D', 38],
    ['C', 36],
    ['D', 38],
  ];
  const mel = ['B4:1 D5:1 G5:1.5 F#5:.5', 'F#5:1 E5:1 D5:2', 'E5:1 G5:1 B5:1.5 A5:.5', 'G5:2 E5:2', 'B4:1 D5:1 G5:1 B5:1', 'A5:1.5 G5:.5 F#5:2', 'E5:1 G5:1 C6:1 B5:1', 'A5:2 G5:2'];
  for (let b = 0; b < bars; b++) {
    const [c, bassN] = chords[b % 8];
    const tri = TRIAD[c];
    S.ev('bass', b, 0, { n: bassN, beats: 3.8, v: 0.5 });
    S.ev('pad', b, 0, { c: tri.map((n) => n - 12), beats: 4, v: 0.45, s: 1, cut: 1200 });
    for (let e = 0; e < 8; e++) S.ev('piano', b, e / 2, { n: [tri[0], tri[1], tri[2], tri[1] + 12][e % 4] - 12, beats: 0.5, v: 0.25 });
    if (b > 0) {
      S.ev('kick', b, 0, { v: 0.45 });
      S.ev('kick', b, 2.5, { v: 0.3 });
      S.ev('snare', b, 1, { v: 0.22 });
      S.ev('snare', b, 3, { v: 0.22 });
      for (let e = 0; e < 8; e++) S.ev('hat', b, e / 2, { v: 0.18, p: 0.3 });
    }
    S.melody('piano', b, mel[b % 8], { v: 0.6 });
    S.melody('str', b, mel[b % 8], { v: 0.25, tr: 12, legato: 1 });
  }
  // última nota
  S.ev('piano', bars, 0, { n: 55, beats: 4, v: 0.5 });
  S.ev('piano', bars, 0, { n: 67, beats: 4, v: 0.5 });
}

// ------------------------------------------------------------ trilha completa
export function buildMusic() {
  const out = [];
  const E = (i, t, o = {}) => out.push({ i, t, ...o });

  // 1. abertura fria (manhã) — 0 a 25 s
  E('pad', 0.2, { c: [60, 64, 67, 71], d: 12.6, v: 0.45, s: 1, a: 2.5, cut: 1300 });
  E('pad', 0.2, { c: [48], d: 12.6, v: 0.4, s: 1, a: 2.5, cut: 600 });
  [
    [1.5, 76],
    [3.0, 79],
    [4.5, 83],
    [6.5, 81],
    [8.0, 79],
    [9.5, 76],
    [11, 74],
  ].forEach(([t, n]) => E('piano', t, { n, d: 1.4, v: 0.35 }));
  E('boom', 13.2, { v: 0.9 });
  suspense(out, 13.3, 8, { heart: true });
  E('riser', 21.2, { d: 3.6, v: 0.7 });
  E('taiko', 24.6, { n: 33, v: 1 });

  // 2. abertura — 25 a 115 s
  opening(out);

  // 3. corredor — sino e tema da escola
  schoolBGM(out, 121.5, 14, 120, 0, { melV: 0.45 });

  // 4. sala de aula
  schoolBGM(out, 155.3, 3, 108, 5, { noDrums: true, melV: 0.35 });
  hanaTheme(out, 161.8, 5, 84, 0, 0.9);
  E('str', 176.6, { n: 50, d: 1.2, v: 0.5 });
  E('str', 176.6, { n: 51, d: 1.2, v: 0.4 });
  hanaTheme(out, 185, 2, 70, 0, 0.7);
  schoolBGM(out, 193, 4, 132, 0, { leadInst: 'pluck', bassInst: 'pluck', noDrums: true, melTr: -12, melV: 0.5 });
  schoolBGM(out, 207.5, 3, 120, 0, { noDrums: true, melV: 0.35 });

  // 5. terraço — rosbife
  schoolBGM(out, 217, 2, 96, 7, { leadInst: 'pluck', melTr: -12, melV: 0.4 });
  E('choir', 221.3, { c: [72, 76, 79, 84], d: 5, v: 0.8 });
  [84, 88, 91, 96, 100, 103].forEach((n, k) => E('bell', 221.4 + k * 0.08, { n, v: 0.5 }));
  schoolBGM(out, 227.5, 7, 96, 7, { leadInst: 'pluck', melTr: -12, melV: 0.45 });
  hanaTheme(out, 244, 2, 84, 0, 0.8);
  E('pad', 257.8, { c: [67, 71, 74, 79], d: 4.5, v: 0.6, s: 1, a: 0.3 });
  [91, 95, 98, 103].forEach((n, k) => E('bell', 257.9 + k * 0.1, { n, v: 0.45 }));
  schoolBGM(out, 262, 3, 120, 7, { leadInst: 'pluck', melTr: -12, melV: 0.4, noDrums: true });

  // intervalo (eyecatch) — 270 a 275 s
  E('gtr', 270.3, { c: PC.E, d: 0.6, v: 0.9 });
  E('crash', 270.3, { v: 0.8 });
  E('kick', 270.3, { v: 1 });
  ['B5', 'D6', 'E6'].forEach((n, k) => E('lead', 270.9 + k * 0.18, { n: midi(n), d: k === 2 ? 1.2 : 0.16, dist: 1, v: 0.8 }));
  E('gtr', 272.6, { c: PC.E, d: 2, v: 0.9 });
  E('crash', 272.6, { v: 0.8 });
  E('kick', 272.6, { v: 1 });

  // 6. atrás do ginásio — tensão e taikos
  tension(out, 275.3, 4, 92, false);
  suspense(out, 286.5, 12, { heart: true });
  tension(out, 298.5, 4, 92, true);
  E('brass', 309, { c: [38, 45, 50, 53], d: 2.5, v: 0.9 });
  E('boom', 309, { v: 0.9 });
  E('taiko', 309, { n: 31, v: 1.2 });
  E('pad', 310, { c: [26, 33], d: 6.8, v: 0.8, s: 1, cut: 300 });
  E('brass', 317.2, { c: [38, 44, 50], d: 3, v: 1 });
  E('boom', 317.2, { v: 1 });
  schoolBGM(out, 318.5, 2, 168, 2, { leadInst: 'pluck', melV: 0.5 });
  hanaTheme(out, 323.5, 2, 90, 0, 0.6);

  // 7. rua ao entardecer — suspense
  E('pad', 330, { c: [45, 52, 57], d: 6, v: 0.35, s: 1, a: 1.5, cut: 900 });
  suspense(out, 336, 20, { heart: true, piano: true });
  E('brass', 356.2, { c: [40, 46, 52], d: 0.6, v: 1 });
  E('scratch', 356.2, { v: 0.6 });
  [72, 76, 79].forEach((n, k) => E('piano', 358.4 + k * 0.35, { n, d: 1.2, v: 0.35 }));
  suspense(out, 360.5, 9.5, { piano: true });
  E('bass', 362, { n: 28, d: 7, v: 0.7, s: 1 });

  // 8. beco — piano do Akashi e flashback em caixinha de música
  alleyPiano(out, 370.5, 8, 70);
  alleyPiano(out, 398.5, 3, 80, 'bell', false);
  E('pad', 398.5, { c: [57, 64], d: 9, v: 0.35, s: 1, a: 1, cut: 900 });
  alleyPiano(out, 408, 2, 70);
  E('str', 416.3, { n: 94, d: 1.2, v: 0.6 });
  E('str', 416.3, { n: 95, d: 1.2, v: 0.6 });
  E('boom', 416.3, { v: 1 });
  E('riser', 419, { d: 6, v: 0.6 });
  battle(out, 421.6, 2, { prog: ['E', 'E'] });

  // 9. batalha
  E('pad', 425, { c: [28, 35], d: 8, v: 0.6, s: 1, cut: 350 });
  E('wind', 425, { d: 34, v: 0.35, s: 1 });
  E('taiko', 433.2, { n: 31, v: 1 });
  E('pad', 433.3, { c: [40, 47], d: 12, v: 0.5, s: 1, cut: 500, a: 3 });
  tension(out, 445, 3, 100, true);
  E('riser', 455.5, { d: 3.5, v: 0.6 });
  battle(out, 459, 19, { brass: true });
  E('ring', 485, { d: 6, v: 0.7 });
  suspense(out, 485.5, 13.5, { heart: true });
  E('riser', 498.2, { d: 2.6, v: 0.8 });
  const barB = (60 / BATTLE_BPM) * 4;
  const startB = 513 - 9 * barB;
  battle(out, startB, 9, {
    double: true,
    brass: true,
    prog: ['E', 'C', 'D', 'B', 'E', 'C', 'D', 'B'],
    mel: ['B5:1 E6:1 D6:.5 B5:.5 G5:1', 'C6:1 E6:1 G6:1 E6:1', 'F#6:1.5 E6:.5 D6:1 A5:1', 'D#6:2 F#6:2', 'G6:1.5 F#6:.5 E6:1 B5:1', 'C6:1 E6:1 G6:2', 'F#6:1 G6:1 A6:2', 'B5:1 D#6:1 F#6:1 B6:1'],
  });
  E('crash', 513, { v: 1 });
  E('kick', 513, { v: 1.2 });
  E('gtr', 513, { c: PC.E, d: 4, v: 0.9 });
  E('lead', 513, { n: 88, d: 4, dist: 1, v: 0.8 });
  E('pad', 513, { c: [52, 59, 64, 67], d: 9, v: 0.6, s: 1 });
  E('wind', 517, { d: 14, v: 0.3, s: 1 });

  // 10. desfecho — tema da Hana lento
  hanaTheme(out, 532.5, 7, 60, 0, 0.8);
  E('heart', 545.2, { v: 0.5 });
  E('heart', 546.4, { v: 0.45 });

  // 11. encerramento
  ending(out, 560.3, 7, 76);
  [79, 76, 72, 74, 79].forEach((n, k) => E('pluck', 585.2 + k * 0.28, { n, v: 0.5 }));
  E('boing', 587, { v: 0.5 });
  E('bell', 588.3, { n: 91, v: 0.5, long: true });
  return out;
}

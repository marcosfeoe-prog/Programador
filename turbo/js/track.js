// Gerador de pistas. A pista é uma sequência de peças (retas, curvas, loops,
// saltos, hélices, parafusos...). Cada peça é integrada como uma "tartaruga" 3D
// que carrega um referencial (T frente, N cima, B direita), então loops e
// parafusos voltam naturalmente à orientação certa. O resultado são amostras a
// cada 0,5 m com posição, referencial da superfície (já com a inclinação das
// curvas), largura e marcadores (vão, defensas, turbo, ímã...).
import * as THREE from 'three';
import { RNG, clamp, lerp, smoothstep } from './util.js';
import { TRACK_W } from './config.js';

export const DS = 0.5;
export const F_GAP = 1;
export const F_RAILL = 2;
export const F_RAILR = 4;
export const F_MAGNET = 8;
export const F_LOOP = 16; // sem "pressão aerodinâmica": precisa de velocidade
export const F_CREST = 32; // lombada que lança o carro
export const F_CHEVRON = 64;
export const F_START = 128;

const deg = Math.PI / 180;
const UP = new THREE.Vector3(0, 1, 0);
const MIN_SEP = 24; // distância mínima entre trechos diferentes da pista
const LOOP_SEP = 15;
const CELL = 26;

function profile(seg, u) {
  switch (seg.prof) {
    case 's2':
      return 2 * Math.sin(Math.PI * u) ** 2;
    case 'mix': {
      const a = seg.mix ?? 0.5;
      return a + (1 - a) * 2 * Math.sin(Math.PI * u) ** 2;
    }
    default:
      return 1;
  }
}

export class Track {
  constructor(info, world) {
    this.info = info;
    this.world = world;
    this.rng = new RNG(info.seed);
    this.base = world.altitude;
    this.ground = world.ground;
    this.generate();
  }

  // ---------------------------------------------------------------- geração
  generate() {
    const info = this.info;
    for (let attempt = 0; attempt < 6; attempt++) {
      this.rng = new RNG(info.seed + attempt * 31337);
      if (this.tryGenerate(info.length)) return;
    }
    // Último recurso: pista simples garantida.
    this.rng = new RNG(info.seed);
    this.tryGenerate(Math.min(info.length, 900), true);
  }

  tryGenerate(target, simple = false) {
    const rng = this.rng;
    const d = this.info.difficulty;
    this.raw = { p: [], t: [], n: [], b: [], bank: [], w: [], f: [], piece: [], sep: [] };
    this.hash = new Map();
    this.pieces = [];
    this.st = {
      P: new THREE.Vector3(0, this.base, 0),
      T: new THREE.Vector3(0, 0, -1),
      N: new THREE.Vector3(0, 1, 0),
      B: new THREE.Vector3(1, 0, 0),
      width: TRACK_W,
    };
    this.pushSample(0, F_RAILL | F_RAILR | F_START, 0, MIN_SEP);

    const stack = [];
    const place = (piece) => {
      const snap = this.snapshot();
      piece.s0 = (this.raw.f.length - 1) * DS;
      piece.id = this.pieces.length;
      if (!this.runPiece(piece)) {
        this.restore(snap);
        return false;
      }
      piece.s1 = (this.raw.f.length - 1) * DS;
      this.pieces.push(piece);
      stack.push(snap);
      return true;
    };

    if (!place({ type: 'start', segs: [{ len: 70, flags: F_RAILL | F_RAILR | F_START }] })) return false;
    if (!place(this.makePiece('straight', 0.2, { len: 40 }))) return false;

    let fails = 0;
    let guard = 0;
    const finishLen = 200;
    let lastType = 'straight';
    while ((this.raw.f.length - 1) * DS < target - finishLen) {
      if (++guard > 900) return false;
      const type = simple ? rng.pick(['straight', 'curve', 'hill']) : this.pickType(d, lastType);
      const piece = this.makePiece(type, d);
      if (place(piece)) {
        fails = 0;
        lastType = type;
        // Depois de algo radical, um respiro curto.
        if (['loop', 'jump', 'helix', 'twist', 'drop', 'crest', 'waves'].includes(type)) place(this.makePiece('straight', d, { len: rng.float(25, 45) }));
        continue;
      }
      if (++fails > 10) {
        // volta uma peça
        if (this.pieces.length <= 2) return false;
        this.restore(stack.pop());
        fails = 0;
      }
    }
    // reta final com a chegada
    let finishOk = place({ type: 'finish', segs: [{ len: finishLen, flags: F_RAILL | F_RAILR }] });
    let tries = 0;
    while (!finishOk && tries++ < 8) {
      if (this.pieces.length <= 3) return false;
      this.restore(stack.pop());
      const t = place(this.makePiece(rng.pick(['curve', 'straight']), d));
      if (t) finishOk = place({ type: 'finish', segs: [{ len: finishLen, flags: F_RAILL | F_RAILR }] });
    }
    if (!finishOk) return false;
    this.finalize();
    return true;
  }

  pickType(d, last) {
    const rng = this.rng;
    const idx = this.info.idx;
    const list = [
      ['straight', 1.6],
      ['curve', 4],
      ['scurve', 1.8],
      ['hill', 2],
      ['crest', idx >= 1 ? 1.4 : 0],
      ['drop', 1.2],
      ['waves', 1 + d],
      ['jump', idx >= 0 ? 1.6 + d : 0],
      ['loop', idx >= 1 ? 1.2 + d * 1.5 : 0],
      ['boost', 1.4],
      ['obstacles', idx >= 2 ? 1.4 + d * 3 : idx >= 1 ? 0.8 : 0],
      ['narrow', idx >= 3 ? 0.6 + d : 0],
      ['helix', idx >= 5 ? 0.5 + d : 0],
      ['twist', idx >= 7 ? 0.5 + d : 0],
    ].filter(([t, w]) => w > 0 && !(t === last && t !== 'curve'));
    return rng.weighted(list);
  }

  // Monta a descrição de uma peça (lista de segmentos + objetos).
  makePiece(type, d, opt = {}) {
    const rng = this.rng;
    const st = this.st;
    const p = { type, segs: [], obstacles: [], boosts: [], coins: [] };
    // Prefere virar de volta para o centro quando a pista se afasta muito.
    const homeDir = () => {
      const dist = Math.hypot(st.P.x, st.P.z);
      if (dist < 350) return rng.sign();
      const toC = new THREE.Vector3(-st.P.x, 0, -st.P.z).normalize();
      const side = toC.dot(st.B); // >0: centro à direita
      return rng.chance(0.8) ? (side > 0 ? -1 : 1) : rng.sign();
    };
    const altitudeBias = () => {
      const h = st.P.y - this.base;
      if (h > 45) return -1;
      if (h < -10) return 1;
      return rng.sign();
    };
    const coinRow = (s, n, lane, step = 4) => {
      for (let i = 0; i < n; i++) p.coins.push({ s: s + i * step, d: lane });
    };
    const lane = () => rng.pick([-3.6, 0, 3.6]);

    switch (type) {
      case 'straight': {
        const len = opt.len ?? rng.float(40, 90);
        p.segs.push({ len });
        if (len > 40 && rng.chance(0.5)) coinRow(10, Math.floor((len - 16) / 5), lane(), 5);
        break;
      }
      case 'curve': {
        const dir = opt.dir ?? homeDir(); // +1 esquerda, -1 direita
        const ang = rng.float(40, 80 + 70 * d) * deg;
        const R = rng.float(60, 95) - d * 12;
        const len = ang * R;
        const outer = dir > 0 ? F_RAILR : F_RAILL;
        p.segs.push({ len, yaw: ang * dir, prof: 'mix', mix: 0.45, bank: -dir * (10 + 8 * d) * deg, flags: outer | F_CHEVRON });
        if (rng.chance(0.35)) coinRow(len * 0.3, 6, dir * 3.2, 4);
        break;
      }
      case 'scurve': {
        const dir = rng.sign();
        const ang = rng.float(35, 60) * deg;
        const R = rng.float(55, 80);
        for (const k of [1, -1]) {
          const dd = dir * k;
          p.segs.push({ len: ang * R, yaw: ang * dd, prof: 'mix', mix: 0.45, bank: -dd * 12 * deg, flags: (dd > 0 ? F_RAILR : F_RAILL) | F_CHEVRON });
        }
        break;
      }
      case 'hill': {
        const dir = opt.dir ?? altitudeBias();
        const a = rng.float(8, 14 + 8 * d) * deg * dir;
        const tr = 42;
        p.segs.push({ len: tr, pitch: a, prof: 's2' });
        p.segs.push({ len: rng.float(20, 45) });
        p.segs.push({ len: tr, pitch: -a, prof: 's2' });
        if (rng.chance(0.5)) coinRow(tr, 6, lane(), 5);
        break;
      }
      case 'crest': {
        const a = rng.float(9, 13) * deg;
        p.segs.push({ len: 22, pitch: a, prof: 's2' });
        p.segs.push({ len: 18, pitch: -2 * a, prof: 's2', flags: F_CREST });
        p.segs.push({ len: 34, pitch: a, prof: 's2' });
        p.segs.push({ len: 20 });
        break;
      }
      case 'drop': {
        const h = st.P.y - this.base;
        const a = rng.float(16, 24 + 8 * d) * deg * (h < -5 ? 1 : -1);
        p.segs.push({ len: 48, pitch: a, prof: 'mix', mix: 0.5 });
        p.segs.push({ len: rng.float(20, 40) });
        p.segs.push({ len: 40, pitch: -a, prof: 'mix', mix: 0.5 });
        if (a < 0) p.boosts.push({ s: 100, d: 0 });
        break;
      }
      case 'waves': {
        const n = rng.int(3, 5);
        const a = rng.float(5, 7 + 3 * d) * deg;
        for (let i = 0; i < n; i++) {
          p.segs.push({ len: 14, pitch: a, prof: 's2' });
          p.segs.push({ len: 18, pitch: -2 * a, prof: 's2', flags: F_CREST });
          p.segs.push({ len: 14, pitch: a, prof: 's2' });
        }
        coinRow(8, n * 4, lane(), 9);
        break;
      }
      case 'jump': {
        const th = rng.float(12, 17) * deg;
        const ph = rng.float(8, 12) * deg;
        const gap = rng.float(14, 20 + 14 * d);
        p.segs.push({ len: 30, flags: 0 });
        p.segs.push({ len: 18, pitch: th, prof: 's2', tag: 'ramp' });
        p.segs.push({ len: gap, pitch: -(th + ph), flags: F_GAP });
        p.segs.push({ len: 36, pitch: ph, prof: 's2', tag: 'land' });
        p.boosts.push({ s: 8, d: 0 });
        p.gap = gap;
        break;
      }
      case 'loop': {
        const len = rng.float(128, 148);
        const dir = rng.sign();
        p.segs.push({ len: 24, flags: F_RAILL | F_RAILR });
        p.segs.push({ len, pitch: Math.PI * 2, prof: 'mix', mix: 0.35, shift: 17 * dir, flags: F_RAILL | F_RAILR | F_LOOP, sep: LOOP_SEP });
        p.segs.push({ len: 20, flags: F_RAILL | F_RAILR, sep: LOOP_SEP });
        p.boosts.push({ s: 4, d: -3.4 }, { s: 4, d: 3.4 });
        coinRow(24 + len * 0.3, 10, 0, len * 0.04);
        break;
      }
      case 'helix': {
        const dir = homeDir();
        const up = altitudeBias();
        const a = 9 * deg * up;
        const R = rng.float(38, 48);
        const len = Math.PI * 2 * R;
        const outer = dir > 0 ? F_RAILR : F_RAILL;
        p.segs.push({ len: 26, pitch: a, prof: 's2' });
        p.segs.push({ len, yaw: Math.PI * 2 * dir, prof: 'mix', mix: 0.6, bank: -dir * 16 * deg, flags: F_RAILL | F_RAILR | F_CHEVRON });
        p.segs.push({ len: 26, pitch: -a, prof: 's2', flags: outer });
        break;
      }
      case 'twist': {
        const dir = rng.sign();
        p.segs.push({ len: 20, flags: 0 });
        p.segs.push({ len: rng.float(110, 140), roll: Math.PI * 2 * dir, prof: 's2', flags: F_MAGNET });
        p.segs.push({ len: 16 });
        coinRow(30, 12, 0, 8);
        break;
      }
      case 'boost': {
        const len = rng.float(70, 100);
        p.segs.push({ len });
        p.boosts.push({ s: 12, d: lane() }, { s: 12 + len * 0.45, d: lane() });
        coinRow(20, 8, lane(), 6);
        break;
      }
      case 'narrow': {
        p.segs.push({ len: 24, width: 8, flags: F_RAILL | F_RAILR });
        p.segs.push({ len: rng.float(40, 70), flags: F_RAILL | F_RAILR });
        p.segs.push({ len: 24, width: TRACK_W, flags: F_RAILL | F_RAILR });
        coinRow(24, 10, 0, 6);
        break;
      }
      case 'obstacles': {
        const kinds = ['hammer', 'spinner', 'pistons', 'crates'];
        const idx = this.info.idx;
        const avail = kinds.filter((k) => (k === 'hammer' ? idx >= 2 : k === 'spinner' ? idx >= 3 : k === 'pistons' ? idx >= 4 : true));
        const kind = opt.kind ?? rng.pick(avail);
        let len = 120;
        let flags = 0;
        if (kind === 'hammer') {
          const n = rng.int(2, 3 + Math.round(d * 2));
          const gapS = 30;
          len = 30 + n * gapS;
          const per = rng.float(2.4, 3.2) - d * 0.5;
          for (let i = 0; i < n; i++) p.obstacles.push({ kind, s: 25 + i * gapS, period: per, phase: (i * 0.5) % 1 });
        } else if (kind === 'spinner') {
          const n = rng.int(1, 2 + Math.round(d * 2));
          const gapS = 36;
          len = 34 + n * gapS;
          for (let i = 0; i < n; i++) p.obstacles.push({ kind, s: 26 + i * gapS, speed: (1.2 + d * 1.2) * (i % 2 ? -1 : 1), phase: rng.float(0, 6) });
        } else if (kind === 'pistons') {
          flags = F_RAILL | F_RAILR;
          const n = rng.int(4, 6 + Math.round(d * 3));
          const gapS = 16;
          len = 30 + n * gapS;
          for (let i = 0; i < n; i++) p.obstacles.push({ kind, s: 22 + i * gapS, side: i % 2 ? 1 : -1, period: 2.2 - d * 0.5, phase: rng.float(0, 1) });
        } else {
          flags = F_RAILL | F_RAILR;
          const n = rng.int(3, 4 + Math.round(d * 3));
          const gapS = 24;
          len = 26 + n * gapS;
          for (let i = 0; i < n; i++) {
            const free = rng.int(0, 2);
            for (let k = 0; k < 3; k++) {
              if (k === free) continue;
              if (rng.chance(0.25)) continue;
              p.obstacles.push({ kind, s: 20 + i * gapS + rng.float(-2, 2), d: (k - 1) * 4, stack: rng.chance(0.4) ? 2 : 1 });
            }
            p.coins.push({ s: 20 + i * gapS, d: (free - 1) * 4 });
          }
        }
        p.kind = kind;
        p.segs.push({ len, flags });
        break;
      }
    }
    return p;
  }

  snapshot() {
    const s = this.st;
    return { n: this.raw.f.length, P: s.P.clone(), T: s.T.clone(), N: s.N.clone(), B: s.B.clone(), width: s.width, pieces: this.pieces.length };
  }

  restore(snap) {
    for (const k in this.raw) this.raw[k].length = k === 'p' || k === 't' || k === 'n' || k === 'b' ? snap.n * 3 : snap.n;
    const s = this.st;
    s.P.copy(snap.P);
    s.T.copy(snap.T);
    s.N.copy(snap.N);
    s.B.copy(snap.B);
    s.width = snap.width;
    this.pieces.length = snap.pieces;
    this.rebuildHash();
  }

  rebuildHash() {
    this.hash.clear();
    const n = this.raw.f.length;
    for (let i = 0; i < n; i += 4) this.hashInsert(i);
  }

  cellKey(x, y, z) {
    return ((Math.floor(x / CELL) + 2048) * 4096 + (Math.floor(y / CELL) + 2048)) * 4096 + (Math.floor(z / CELL) + 2048);
  }

  hashInsert(i) {
    const p = this.raw.p;
    const k = this.cellKey(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
    let c = this.hash.get(k);
    if (!c) this.hash.set(k, (c = []));
    c.push(i);
  }

  // Verifica se a amostra i fica perto demais de outro trecho da pista.
  collides(i) {
    const p = this.raw.p;
    const x = p[i * 3];
    const y = p[i * 3 + 1];
    const z = p[i * 3 + 2];
    // limites de altitude
    if (this.ground !== null) {
      if (y < this.ground + 16) return true;
      if (y > this.base + 95) return true;
    } else if (Math.abs(y - this.base) > 110) return true;
    if (Math.hypot(x, z) > 1100) return true;
    const sepI = this.raw.sep[i];
    const pieceI = this.raw.piece[i];
    const cx = Math.floor(x / CELL);
    const cy = Math.floor(y / CELL);
    const cz = Math.floor(z / CELL);
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++)
        for (let c = -1; c <= 1; c++) {
          const cell = this.hash.get(((cx + a + 2048) * 4096 + (cy + b + 2048)) * 4096 + (cz + c + 2048));
          if (!cell) continue;
          for (const j of cell) {
            if (Math.abs(i - j) * DS < 80) continue;
            const sep = Math.min(sepI, this.raw.sep[j]);
            if (sep < MIN_SEP && this.raw.piece[j] === pieceI) continue;
            const dx = p[j * 3] - x;
            const dy = p[j * 3 + 1] - y;
            const dz = p[j * 3 + 2] - z;
            if (dx * dx + dy * dy + dz * dz < sep * sep) return true;
          }
        }
    return false;
  }

  pushSample(bank, flags, piece, sep) {
    const r = this.raw;
    const s = this.st;
    r.p.push(s.P.x, s.P.y, s.P.z);
    r.t.push(s.T.x, s.T.y, s.T.z);
    r.n.push(s.N.x, s.N.y, s.N.z);
    r.b.push(s.B.x, s.B.y, s.B.z);
    r.bank.push(bank);
    r.w.push(s.width);
    r.f.push(flags);
    r.piece.push(piece);
    r.sep.push(sep);
  }

  runPiece(piece) {
    const s = this.st;
    for (const seg of piece.segs) {
      const n = Math.max(1, Math.round(seg.len / DS));
      const w0 = s.width;
      const w1 = seg.width ?? s.width;
      for (let i = 0; i < n; i++) {
        const u = (i + 0.5) / n;
        const k = profile(seg, u) / n;
        if (seg.yaw) {
          const a = seg.yaw * k;
          s.T.applyAxisAngle(UP, a);
          s.N.applyAxisAngle(UP, a);
          s.B.applyAxisAngle(UP, a);
        }
        if (seg.pitch) {
          const a = seg.pitch * k;
          s.T.applyAxisAngle(s.B, a);
          s.N.applyAxisAngle(s.B, a);
        }
        if (seg.roll) {
          const a = seg.roll * k;
          s.N.applyAxisAngle(s.T, a);
          s.B.applyAxisAngle(s.T, a);
        }
        // reortonormaliza
        s.T.normalize();
        s.B.crossVectors(s.T, s.N).normalize();
        s.N.crossVectors(s.B, s.T).normalize();
        s.P.addScaledVector(s.T, DS);
        if (seg.shift) s.P.addScaledVector(s.B, seg.shift * k);
        s.width = lerp(w0, w1, smoothstep(0, 1, (i + 1) / n));
        const bank = seg.bank ? seg.bank * Math.min(1, 1.5 * Math.sin(Math.PI * u)) : 0;
        this.pushSample(bank, seg.flags || 0, piece.id, seg.sep ?? MIN_SEP);
        const idx = this.raw.f.length - 1;
        if (idx % 2 === 0) {
          if (this.collides(idx)) return false;
        }
        if (idx % 4 === 0) this.hashInsert(idx);
      }
    }
    return true;
  }

  // ------------------------------------------------- dados finais compactos
  finalize() {
    const r = this.raw;
    const n = r.f.length;
    this.count = n;
    this.length = (n - 1) * DS;
    this.P = new Float32Array(r.p);
    this.T = new Float32Array(r.t);
    this.N = new Float32Array(n * 3); // normal da superfície (com inclinação)
    this.B = new Float32Array(n * 3);
    this.W = new Float32Array(r.w);
    this.F = new Uint8Array(r.f);
    this.kN = new Float32Array(n);
    this.kB = new Float32Array(n);
    this.pieceOf = new Int16Array(r.piece);
    for (let i = 0; i < n; i++) {
      const b = r.bank[i];
      const c = Math.cos(b);
      const s = Math.sin(b);
      for (let k = 0; k < 3; k++) {
        this.N[i * 3 + k] = r.n[i * 3 + k] * c + r.b[i * 3 + k] * s;
        this.B[i * 3 + k] = r.b[i * 3 + k] * c - r.n[i * 3 + k] * s;
      }
    }
    // curvatura ao longo da normal e da lateral (suavizada)
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 2);
      const b = Math.min(n - 1, i + 2);
      if (b === a) continue;
      const inv = 1 / ((b - a) * DS);
      let kn = 0;
      let kb = 0;
      for (let k = 0; k < 3; k++) {
        const dT = (this.T[b * 3 + k] - this.T[a * 3 + k]) * inv;
        kn += dT * this.N[i * 3 + k];
        kb += dT * this.B[i * 3 + k];
      }
      this.kN[i] = kn;
      this.kB[i] = kb;
    }
    // linhas de largada e chegada
    const start = this.pieces[0];
    this.startS = start.s0 + 52;
    const fin = this.pieces[this.pieces.length - 1];
    this.finishS = fin.s0 + 70;
    // pontos de reaparecimento: inícios de peças niveladas
    this.checkpoints = [];
    for (const pc of this.pieces) {
      const i = Math.round(pc.s0 / DS);
      if (this.N[i * 3 + 1] > 0.9 && !(this.F[i] & F_GAP)) this.checkpoints.push(pc.s0 + 2);
    }
    // objetos com s absoluto
    this.obstacles = [];
    this.boosts = [];
    this.coins = [];
    for (const pc of this.pieces) {
      for (const o of pc.obstacles || []) this.obstacles.push({ ...o, s: pc.s0 + o.s });
      for (const o of pc.boosts || []) this.boosts.push({ ...o, s: pc.s0 + o.s });
      for (const o of pc.coins || []) if (pc.s0 + o.s < pc.s1) this.coins.push({ ...o, s: pc.s0 + o.s });
    }
    this.coins = this.coins.filter((c) => !(this.flagsAt(c.s) & F_GAP) && c.s > this.startS + 20 && c.s < this.finishS - 10);
    // limites
    const bb = new THREE.Box3();
    const v = new THREE.Vector3();
    let minY = Infinity;
    for (let i = 0; i < n; i++) {
      v.fromArray(this.P, i * 3);
      bb.expandByPoint(v);
      minY = Math.min(minY, v.y);
    }
    this.bbox = bb;
    this.minY = minY;
    delete this.raw;
    delete this.hash;
  }

  // ------------------------------------------------------------- consultas
  flagsAt(s) {
    const i = clamp(Math.round(s / DS), 0, this.count - 1);
    return this.F[i];
  }

  widthAt(s) {
    const i = clamp(Math.round(s / DS), 0, this.count - 1);
    return this.W[i];
  }

  // Referencial interpolado em s. out: {P, T, N, B} (Vector3) + w, f, kN, kB.
  frame(s, out) {
    const x = clamp(s / DS, 0, this.count - 1.001);
    const i = Math.floor(x);
    const f = x - i;
    const j = i + 1;
    const P = this.P;
    const T = this.T;
    const N = this.N;
    out.P.set(lerp(P[i * 3], P[j * 3], f), lerp(P[i * 3 + 1], P[j * 3 + 1], f), lerp(P[i * 3 + 2], P[j * 3 + 2], f));
    out.T.set(lerp(T[i * 3], T[j * 3], f), lerp(T[i * 3 + 1], T[j * 3 + 1], f), lerp(T[i * 3 + 2], T[j * 3 + 2], f)).normalize();
    out.N.set(lerp(N[i * 3], N[j * 3], f), lerp(N[i * 3 + 1], N[j * 3 + 1], f), lerp(N[i * 3 + 2], N[j * 3 + 2], f));
    out.B.crossVectors(out.T, out.N).normalize();
    out.N.crossVectors(out.B, out.T).normalize();
    out.w = lerp(this.W[i], this.W[j], f);
    out.f = this.F[f < 0.5 ? i : j];
    out.kN = lerp(this.kN[i], this.kN[j], f);
    out.kB = lerp(this.kB[i], this.kB[j], f);
    return out;
  }

  // Amostra mais próxima de um ponto, procurando numa janela em torno de sGuess.
  nearest(p, sGuess, back = 40, fwd = 140) {
    const P = this.P;
    const i0 = clamp(Math.floor((sGuess - back) / DS), 0, this.count - 1);
    const i1 = clamp(Math.ceil((sGuess + fwd) / DS), 0, this.count - 1);
    let best = i0;
    let bd = Infinity;
    for (let i = i0; i <= i1; i += 4) {
      const dx = P[i * 3] - p.x;
      const dy = P[i * 3 + 1] - p.y;
      const dz = P[i * 3 + 2] - p.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    const a = Math.max(0, best - 4);
    const b = Math.min(this.count - 1, best + 4);
    for (let i = a; i <= b; i++) {
      const dx = P[i * 3] - p.x;
      const dy = P[i * 3 + 1] - p.y;
      const dz = P[i * 3 + 2] - p.z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < bd) {
        bd = d;
        best = i;
      }
    }
    // refina ao longo da tangente
    const t = new THREE.Vector3().fromArray(this.T, best * 3);
    const along = (p.x - P[best * 3]) * t.x + (p.y - P[best * 3 + 1]) * t.y + (p.z - P[best * 3 + 2]) * t.z;
    return clamp(best * DS + clamp(along, -DS, DS), 0, this.length);
  }

  checkpointBefore(s) {
    let best = this.checkpoints[0] ?? 0;
    for (const c of this.checkpoints) if (c <= s - 4) best = c;
    return best;
  }

  pieceAt(s) {
    const i = clamp(Math.round(s / DS), 0, this.count - 1);
    return this.pieces[this.pieceOf[i]];
  }
}

export function makeFrame() {
  return { P: new THREE.Vector3(), T: new THREE.Vector3(), N: new THREE.Vector3(), B: new THREE.Vector3(), w: TRACK_W, f: 0, kN: 0, kB: 0 };
}

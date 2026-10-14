// Nível 9 — planejamento dos quarteirões (lotes, casas, postes) e construção da
// geometria das casas. Tudo é determinístico a partir da semente e do bloco, para
// que objetivos e zonas seguras sejam conhecidos antes de o bloco ser gerado.
import * as THREE from 'three';
import { mulberry32, hash3, clamp } from '../util.js';

export const P = 64; // passo dos quarteirões (um bloco por quarteirão)
export const RW = 4; // meia largura do asfalto
export const CURB = 0.15; // altura do meio-fio
export const STRIP = 1.3; // faixa de grama entre o meio-fio e a calçada
export const LOT = 6.8; // fim da calçada (início dos lotes), a partir do eixo da rua
export const ROWL = P - 2 * LOT; // comprimento de uma fileira de lotes
export const ROWD = P / 2 - LOT; // profundidade de um lote
export const FLOOR = CURB + 0.45; // piso térreo das casas
export const STORY = 2.8;
export const LAMP_H = 7.3;

const pick = (rnd, a) => a[Math.floor(rnd() * a.length) % a.length];

const SIDING = [
  [0.78, 0.78, 0.74],
  [0.62, 0.55, 0.42],
  [0.72, 0.64, 0.38],
  [0.42, 0.52, 0.6],
  [0.42, 0.5, 0.4],
  [0.45, 0.47, 0.48],
  [0.28, 0.34, 0.42],
  [0.42, 0.19, 0.14],
  [0.5, 0.6, 0.52],
  [0.68, 0.52, 0.48],
  [0.2, 0.27, 0.22],
  [0.75, 0.7, 0.58],
  [0.55, 0.45, 0.33],
  [0.7, 0.7, 0.68],
];
const TRIM = [
  [0.85, 0.85, 0.82],
  [0.85, 0.85, 0.82],
  [0.85, 0.85, 0.82],
  [0.78, 0.74, 0.62],
  [0.22, 0.15, 0.1],
  [0.09, 0.09, 0.09],
];
const ROOF = [
  [0.22, 0.22, 0.23],
  [0.13, 0.13, 0.14],
  [0.3, 0.22, 0.17],
  [0.2, 0.25, 0.22],
  [0.35, 0.17, 0.13],
  [0.2, 0.23, 0.28],
  [0.26, 0.25, 0.22],
];
const DOOR = [
  [0.45, 0.06, 0.05],
  [0.06, 0.1, 0.22],
  [0.04, 0.04, 0.04],
  [0.06, 0.2, 0.1],
  [0.82, 0.82, 0.78],
  [0.35, 0.2, 0.1],
  [0.6, 0.45, 0.08],
];
const SHUTTER = [
  [0.05, 0.05, 0.05],
  [0.07, 0.17, 0.1],
  [0.07, 0.1, 0.2],
  [0.3, 0.08, 0.07],
  [0.3, 0.32, 0.33],
];
const CARS = [
  [0.45, 0.05, 0.04],
  [0.08, 0.1, 0.16],
  [0.65, 0.65, 0.63],
  [0.04, 0.04, 0.04],
  [0.2, 0.28, 0.4],
  [0.5, 0.5, 0.52],
  [0.28, 0.32, 0.24],
  [0.55, 0.48, 0.36],
];
const CONCRETE = [0.55, 0.54, 0.51];
const BARK = [0.16, 0.13, 0.1];
const FENCE = [0.3, 0.22, 0.15];
const MAILBOX = [
  [0.04, 0.04, 0.04],
  [0.75, 0.75, 0.72],
  [0.45, 0.46, 0.47],
  [0.1, 0.2, 0.12],
  [0.3, 0.2, 0.12],
];

// ------------------------------------------------------------------ frames
// Fileira de lotes: origem na linha frontal, U ao longo da rua, V apontando para a rua.
// rot gira as caixas do GeoBuilder para que o eixo x local siga U e o z local siga V.
export function rowFrames(i, j, orient) {
  const x0 = i * P;
  const z0 = j * P;
  if (orient === 'z')
    return [
      { ox: x0 + P - LOT, oz: z0 + LOT, U: [-1, 0], V: [0, -1], rot: Math.PI, road: 'h', roadIdx: j },
      { ox: x0 + LOT, oz: z0 + P - LOT, U: [1, 0], V: [0, 1], rot: 0, road: 'h', roadIdx: j + 1 },
    ];
  return [
    { ox: x0 + LOT, oz: z0 + LOT, U: [0, 1], V: [-1, 0], rot: -Math.PI / 2, road: 'v', roadIdx: i },
    { ox: x0 + P - LOT, oz: z0 + P - LOT, U: [0, -1], V: [1, 0], rot: Math.PI / 2, road: 'v', roadIdx: i + 1 },
  ];
}

// (a ao longo, b para dentro do lote) → [x, z]
export function rowWorld(fr, a, b) {
  return [fr.ox + a * fr.U[0] - b * fr.V[0], fr.oz + a * fr.U[1] - b * fr.V[1]];
}

// Coordenadas de mundo → (a, b) da fileira.
export function rowLocal(fr, x, z) {
  const dx = x - fr.ox;
  const dz = z - fr.oz;
  return [dx * fr.U[0] + dz * fr.U[1], -(dx * fr.V[0] + dz * fr.V[1])];
}

// ------------------------------------------------------------------ postes
// Quatro postes por bloco: dois na rua vertical x = x0 e dois na horizontal z = z0,
// alternando os lados. Estado: 0 aceso, 1–3 piscando, 4 queimado.
export function lampsOf(L, i, j) {
  const key = L.chunkKey(i, j);
  let ls = L.lampCache.get(key);
  if (ls) return ls;
  const x0 = i * P;
  const z0 = j * P;
  const d = RW + 0.6;
  const arm = 1.9;
  const spots = [
    [x0 + d, z0 + 16, -1, 0],
    [x0 - d, z0 + 48, 1, 0],
    [x0 + 16, z0 + d, 0, -1],
    [x0 + 48, z0 - d, 0, 1],
  ];
  ls = spots.map(([x, z, ax, az], k) => {
    const h = hash3(i * 7 + k, j * 13 - k, L.seed + 404);
    let state = h < 0.4 ? 0 : h < 0.6 ? 1 + Math.floor(((h - 0.4) / 0.2) * 3) : 4;
    const f = L.forceLamp.get(`${i},${j},${k}`);
    if (f !== undefined) state = f;
    const cool = hash3(i * 3 + k, j * 5 + k, L.seed + 405) < 0.3;
    return {
      x,
      z,
      hx: x + ax * arm,
      hz: z + az * arm,
      ax,
      az,
      state,
      col: cool ? [0.62, 0.8, 1.0] : [1.0, 0.58, 0.26],
      I: cool ? 42 : 60,
    };
  });
  L.lampCache.set(key, ls);
  if (L.lampCache.size > 600) L.lampCache.delete(L.lampCache.keys().next().value);
  return ls;
}

// Postes que ficam na faixa de grama desta fileira (posições a ocupadas).
function reservedA(L, i, j, fr) {
  const out = [];
  for (const [di, dj] of [
    [0, 0],
    [1, 0],
    [0, 1],
  ]) {
    for (const l of lampsOf(L, i + di, j + dj)) {
      const [a, b] = rowLocal(fr, l.x, l.z);
      if (b > -3.2 && b < 0.2 && a > -1 && a < ROWL + 1) out.push(a);
    }
  }
  return out;
}

// ------------------------------------------------------------------ plano
export function planBlock(L, i, j) {
  const key = L.chunkKey(i, j);
  let pl = L.plans.get(key);
  if (pl) return pl;
  const rnd = mulberry32(((i * 73856093) ^ (j * 19349663) ^ L.seed) >>> 0);
  const f = L.forced.get(key) || {};
  const orient = f.orient || (rnd() < 0.68 ? 'z' : 'x');
  const frames = rowFrames(i, j, orient);
  const rows = frames.map((fr, r) => planRow(L, i, j, r, fr, rnd, f));
  pl = { i, j, orient, rows, backFence: rnd() < 0.75, hydrant: rnd() < 0.5 ? 0.2 + rnd() * 0.6 : -1 };
  L.plans.set(key, pl);
  if (L.plans.size > 400) L.plans.delete(L.plans.keys().next().value);
  return pl;
}

function planRow(L, i, j, r, fr, rnd, f) {
  const nLots = f.lots && f.lots[r] ? f.lots[r] : rnd() < 0.7 ? 3 : 2;
  const lw = ROWL / nLots;
  const res = reservedA(L, i, j, fr);
  const lots = [];
  for (let k = 0; k < nLots; k++) {
    const a0 = k * lw;
    let h;
    // casas idênticas lado a lado (relatos da wiki)
    if (k > 0 && !lots[k - 1].house.twin && !lots[k - 1].special && rnd() < 0.08) {
      const ph = lots[k - 1].house;
      h = {
        ...ph,
        twin: true,
        porch: ph.porch && { ...ph.porch },
        garage: ph.garage && { ...ph.garage },
        drive: ph.drive && { ...ph.drive },
      };
      lots[k - 1].house.twin = true;
    } else h = genHouse(rnd, lw);
    const lot = { a0, a1: a0 + lw, w: lw, house: h, back: rnd() < 0.5, street: rnd() < 0.3 ? rnd() : -1 };
    const sp = f.special && f.special[0] === r && f.special[1] === k ? f.special[2] : null;
    if (sp) {
      lot.special = sp;
      h.twin = false;
      if (sp === 'mail') {
        lot.mailA = f.special[3];
        h.garage = null;
        h.drive = null;
        h.car = false;
      }
      if (sp === 'goal') {
        h.porch = h.porch || { w: Math.min(h.hw - 0.8, 3.4), d: 2.1, rail: true };
        h.porch.u = 0;
        h.doorU = 0;
        h.porchLight = true;
        h.garage = null;
        h.drive = null;
      }
    }
    placeMailbox(lot, res);
    lots.push(lot);
  }
  return { fr, lots, nLots };
}

// Casa: parâmetros relativos ao centro do lote.
function genHouse(rnd, lw) {
  const stories = rnd() < 0.55 ? 2 : 1;
  let garage = null;
  if (lw >= 16 && rnd() < 0.55) {
    garage = {
      side: rnd() < 0.5 ? -1 : 1,
      w: 5.6 + rnd() * 0.8,
      d: 6.4,
      off: -1.4 + rnd() * 2.2,
      roof: rnd() < 0.55 ? 'gable' : 'front',
      dw: rnd() < 0.6 ? 4.6 : 2.6,
    };
  }
  const maxW = lw - 2.6 - (garage ? garage.w : 0);
  const hw = clamp(7.2 + rnd() * 4.8, 6.4, maxW);
  const hd = 7.2 + rnd() * 3;
  const tw = hw + (garage ? garage.w : 0);
  const shift = (rnd() - 0.5) * Math.max(0, lw - tw - 2.6);
  const cu = shift + (garage ? -garage.side * (garage.w / 2) : 0);
  const rr = rnd();
  const roof = rr < 0.48 ? 'gable' : rr < 0.72 ? 'front' : 'hip';
  const porch = rnd() < 0.6 ? { w: Math.min(hw - 0.6, 2.8 + rnd() * (hw - 3.2)), d: 1.8 + rnd() * 0.5, rail: rnd() < 0.5 } : null;
  let doorU = (rnd() - 0.5) * Math.max(0, hw - 3.2);
  if (porch) porch.u = clamp(doorU, -hw / 2 + porch.w / 2 + 0.2, hw / 2 - porch.w / 2 - 0.2);
  if (porch) doorU = porch.u;
  const h = {
    seed: (rnd() * 1e9) >>> 0,
    stories,
    hw,
    hd,
    cu,
    setback: 5.6 + rnd() * 2.8,
    roof,
    pitch: stories === 1 ? 0.56 + rnd() * 0.2 : 0.48 + rnd() * 0.2,
    garage,
    porch,
    doorU,
    wall: pick(rnd, SIDING),
    trim: pick(rnd, TRIM),
    roofC: pick(rnd, ROOF),
    door: pick(rnd, DOOR),
    shutter: rnd() < 0.3 ? pick(rnd, SHUTTER) : null,
    chimney: rnd() < 0.35 ? (rnd() < 0.5 ? -1 : 1) : 0,
    porchLight: rnd() < 0.16,
    trees: Math.floor(rnd() * rnd() * 3),
    bushes: rnd() < 0.75,
    picket: rnd() < 0.12,
    hedge: rnd() < 0.15 ? (rnd() < 0.5 ? -1 : 1) : 0,
    car: rnd() < 0.4,
    shed: rnd() < 0.22,
    backTree: rnd() < 0.65,
    wvar: Math.floor(rnd() * 4),
  };
  // entrada de carros: na frente da garagem, ou ao lado da casa
  if (garage) h.drive = { u: cu + garage.side * (hw / 2 + garage.w / 2), w: garage.dw + 0.9, to: h.setback - garage.off };
  else {
    const side = rnd() < 0.5 ? -1 : 1;
    const u = cu + side * (hw / 2 + 1.7);
    h.drive = Math.abs(u) + 1.5 < lw / 2 && rnd() < 0.7 ? { u, w: 2.8, to: h.setback + hd - 1.5, side: true } : null;
  }
  return h;
}

// Caixa de correio na faixa de grama, ao lado da entrada (longe dos postes).
function placeMailbox(lot, res) {
  const h = lot.house;
  const c = (lot.a0 + lot.a1) / 2;
  let a = h.drive ? c + h.drive.u + (h.drive.u > h.cu ? -1 : 1) * (h.drive.w / 2 + 0.7) : c + h.cu + h.doorU + 1.3;
  if (lot.special === 'mail') a = lot.mailA;
  for (let t = 0; t < 3; t++) {
    const bad = res.find((r) => Math.abs(r - a) < 1.1);
    if (bad === undefined || lot.special === 'mail') break;
    a += a > bad ? 1.4 : -1.4;
  }
  lot.mailA = clamp(a, lot.a0 + 0.6, lot.a1 - 0.6);
  // árvore da calçada (faixa de grama), longe de postes, entrada e caixa de correio
  if (lot.street >= 0) {
    const ta = lot.a0 + 1.5 + lot.street * (lot.w - 3);
    const dOk = !h.drive || Math.abs(ta - (c + h.drive.u)) > h.drive.w / 2 + 1.5;
    if (dOk && Math.abs(ta - lot.mailA) > 2 && !res.some((r) => Math.abs(r - ta) < 3.5)) lot.streetA = ta;
  }
}

// ------------------------------------------------------------------ geometria
const _t1 = new THREE.Vector3();
const _t2 = new THREE.Vector3();
const _n = new THREE.Vector3();
const _e1 = new THREE.Vector3();
const _e2 = new THREE.Vector3();

// Quadrilátero (ou triângulo, repetindo o último vértice) com normal e UV automáticos.
// `out` indica para onde a face deve apontar. UV em metros / us, com v para cima.
export function face(gb, pts, color, o = {}) {
  const us = o.us || 1;
  let p = pts;
  _e1.set(p[1][0] - p[0][0], p[1][1] - p[0][1], p[1][2] - p[0][2]);
  _e2.set(p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]);
  _n.crossVectors(_e1, _e2);
  if (_n.lengthSq() < 1e-12) {
    _e2.set(p[3][0] - p[0][0], p[3][1] - p[0][1], p[3][2] - p[0][2]);
    _n.crossVectors(_e1, _e2);
  }
  _n.normalize();
  _t1.copy(_e1).normalize();
  if (o.out && _n.x * o.out[0] + _n.y * o.out[1] + _n.z * o.out[2] < 0) {
    p = [p[0], p[3], p[2], p[1]];
    _n.negate();
  }
  _t2.crossVectors(_n, _t1);
  if (_t2.y < -1e-4) _t2.negate();
  const u0 = o.u0 || 0;
  const v0 = o.v0 || 0;
  const uvs = [];
  for (const q of p) {
    const dx = q[0] - p[0][0];
    const dy = q[1] - p[0][1];
    const dz = q[2] - p[0][2];
    uvs.push((dx * _t1.x + dy * _t1.y + dz * _t1.z) / us + u0, (dx * _t2.x + dy * _t2.y + dz * _t2.z) / us + v0);
  }
  const c = o.cols || [color, color, color, color];
  gb.quad(p, [_n.x, _n.y, _n.z], uvs, null, c, o.group || 0);
}

// Placa grossa: face de cima `pts` (para fora = out), espessura para dentro e bordas.
export function slab(gb, pts, thick, color, o = {}) {
  face(gb, pts, color, o);
  const n = _n.clone();
  const bot = pts.map((q) => [q[0] - n.x * thick, q[1] - n.y * thick, q[2] - n.z * thick]);
  face(gb, bot, o.under || color, { ...o, out: [-n.x, -n.y, -n.z] });
  const cx = (pts[0][0] + pts[1][0] + pts[2][0] + pts[3][0]) / 4;
  const cy = (pts[0][1] + pts[1][1] + pts[2][1] + pts[3][1]) / 4;
  const cz = (pts[0][2] + pts[1][2] + pts[2][2] + pts[3][2]) / 4;
  for (let k = 0; k < 4; k++) {
    const a = pts[k];
    const b = pts[(k + 1) % 4];
    if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 1e-4) continue;
    const m = [(a[0] + b[0]) / 2 - cx, (a[1] + b[1]) / 2 - cy, (a[2] + b[2]) / 2 - cz];
    face(gb, [a, b, bot[(k + 1) % 4], bot[k]], o.edge || color, { us: o.us, out: m });
  }
}

// Contexto de uma casa: coordenadas locais (u ao longo da rua, y, v para a rua).
class HouseCtx {
  constructor(fr, ac, bc) {
    this.fr = fr;
    this.ac = ac;
    this.bc = bc;
  }
  w(u, v) {
    return rowWorld(this.fr, this.ac + u, this.bc - v);
  }
  p(u, y, v) {
    const [x, z] = this.w(u, v);
    return [x, y, z];
  }
  dir(du, dy, dv) {
    const { U, V } = this.fr;
    return [du * U[0] + dv * V[0], dy, du * U[1] + dv * V[1]];
  }
  box(gb, u, y, v, su, sy, sv, col, opt = {}) {
    const [x, z] = this.w(u, v);
    gb.box(x, y, z, su, sy, sv, col, null, { ao: 0, ...opt, rot: this.fr.rot });
  }
  face(gb, pl, col, o = {}) {
    face(
      gb,
      pl.map((q) => this.p(...q)),
      col,
      { ...o, out: o.out ? this.dir(...o.out) : null },
    );
  }
  slab(gb, pl, thick, col, o = {}) {
    slab(
      gb,
      pl.map((q) => this.p(...q)),
      thick,
      col,
      { ...o, out: o.out ? this.dir(...o.out) : null },
    );
  }
  cyl(gb, u, y, v, r, h, col, opt = {}) {
    const [x, z] = this.w(u, v);
    gb.cylinder(x, y, z, r, h, col, null, opt);
  }
  // Retângulo texturizado (atlas) de frente para a normal local (nu, nv).
  plate(gb, u, y, v, nu, nv, w, h, uv, col, group = 0) {
    const c = this.p(u, y, v);
    const n = this.dir(nu, 0, nv);
    const r = [n[2], 0, -n[0]]; // direita de quem olha para a face
    const pts = [
      [c[0] - (r[0] * w) / 2, c[1] - h / 2, c[2] - (r[2] * w) / 2],
      [c[0] + (r[0] * w) / 2, c[1] - h / 2, c[2] + (r[2] * w) / 2],
      [c[0] + (r[0] * w) / 2, c[1] + h / 2, c[2] + (r[2] * w) / 2],
      [c[0] - (r[0] * w) / 2, c[1] + h / 2, c[2] - (r[2] * w) / 2],
    ];
    const cols = [col, col, col, col];
    gb.quad(pts, n, [uv[0], uv[1], uv[2], uv[1], uv[2], uv[3], uv[0], uv[3]], null, cols, group);
  }
}

// Collider em coordenadas locais (retângulo u0..u1 × v0..v1).
function localBox(hc, u0, u1, v0, v1) {
  const a = hc.w(u0, v0);
  const b = hc.w(u1, v1);
  return [Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1])];
}

// Rua da fileira → número da casa (ímpares de um lado, pares do outro).
export function houseNumber(L, fr, along) {
  const g = L.goalInfo;
  if (g && fr.road === g.road && fr.roadIdx === g.roadIdx) {
    const same = fr.V[0] === g.V[0] && fr.V[1] === g.V[1];
    const n = (same ? g.number : g.number + 1) + 2 * Math.round((along - g.along) / 14);
    return ((((n - 1) % 400) + 400) % 400) + 1;
  }
  const base = 101 + (fr.V[0] + fr.V[1] > 0 ? 1 : 0) + ((fr.roadIdx * 37) % 50) * 2;
  const n = base + 2 * Math.round(along / 14);
  return ((((n - 1) % 400) + 400) % 400) + 1;
}

// Constrói um lote inteiro (casa, garagem, varanda, jardim, entrada, caixa de correio).
// B: { wall, roof, trim, win, fol, lamp, sign }; out: { colliders, walls, steps, items, dyn }.
export function buildLot(L, B, ch, row, lot, ri, li) {
  const fr = row.fr;
  const h = lot.house;
  const rnd = mulberry32(h.seed);
  const lc = (lot.a0 + lot.a1) / 2;
  const hc = new HouseCtx(fr, lc + h.cu, h.setback + h.hd / 2);
  const F = FLOOR;
  const hw = h.hw;
  const hd = h.hd;
  const wallTop = F + h.stories * STORY;
  const trim = h.trim;
  const isGoal = lot.special === 'goal';
  const atlas = L.atlas;
  // ---------- corpo principal
  hc.box(B.wall, 0, (F + wallTop) / 2, 0, hw, wallTop - F, hd, h.wall, { uvScale: 1.44, ao: 0.25, floorY: CURB });
  hc.box(B.trim, 0, (CURB - 0.02 + F) / 2, 0, hw + 0.08, F - CURB + 0.02, hd + 0.08, CONCRETE, { ao: 0.2, floorY: CURB });
  // cantoneiras e friso
  for (const su of [-1, 1])
    for (const sv of [-1, 1]) hc.box(B.trim, su * (hw / 2), (F + wallTop) / 2, sv * (hd / 2), 0.14, wallTop - F, 0.14, trim);
  if (h.stories === 2) {
    hc.box(B.trim, 0, F + STORY, hd / 2 + 0.02, hw, 0.14, 0.06, trim);
    hc.box(B.trim, 0, F + STORY, -hd / 2 - 0.02, hw, 0.14, 0.06, trim);
  }
  ch.colliders.push(localBox(hc, -hw / 2 - 0.05, hw / 2 + 0.05, -hd / 2 - 0.05, hd / 2 + 0.05));
  ch.walls.push(ch.colliders[ch.colliders.length - 1]);
  // ---------- telhado
  const roofInfo = roofOn(hc, B, 0, 0, hw, hd, wallTop, h.pitch, h.roof, h.roofC, h.wall, trim, F);
  // ---------- janelas
  const winRnd = mulberry32(h.seed ^ 0x5151);
  const litP = h.stories === 2 ? 0.07 : 0.05;
  const state = () => {
    const r = winRnd();
    return r < litP ? 1 : r < litP + 0.015 ? 2 : 0;
  };
  let silhouette = h.twin;
  let goalTV = isGoal;
  const wins = [];
  const addWin = (side, t, y, w, hh) => wins.push({ side, t, y, w, h: hh });
  // frente
  for (let s = 0; s < h.stories; s++) {
    const y = F + s * STORY + 1.55;
    const n = Math.max(1, Math.floor((hw - 1.2) / 2.5));
    for (let k = 0; k < n; k++) {
      const t = -hw / 2 + ((k + 0.5) * hw) / n;
      if (s === 0 && Math.abs(t - h.doorU) < 1.25) continue;
      const big = s === 0 && n <= 2 && hw > 8;
      addWin('front', t, y, big ? 1.7 : 0.95, big ? 1.45 : 1.35);
    }
    if (s === 0 && n === 1 && Math.abs(h.doorU) < 1.25) addWin('front', h.doorU < 0 ? hw / 4 + 0.5 : -hw / 4 - 0.5, y, 0.95, 1.35);
  }
  // laterais e fundos
  for (let s = 0; s < h.stories; s++) {
    const y = F + s * STORY + 1.55;
    const n = Math.max(1, Math.floor((hd - 1.5) / 3.2));
    for (const side of ['left', 'right']) {
      if (h.garage && (side === 'left' ? -1 : 1) === h.garage.side && s === 0) continue;
      for (let k = 0; k < n; k++) if (winRnd() < 0.8) addWin(side, -hd / 2 + ((k + 0.5) * hd) / n, y, 0.9, 1.3);
    }
    for (let k = 0; k < 2; k++) addWin('back', -hw / 4 + k * (hw / 2), y, 0.95, 1.3);
  }
  wins.forEach((wi, idx) => {
    let g = state();
    if (silhouette && wi.side === 'front' && (h.stories === 1 || wi.y > F + STORY)) {
      g = 3;
      silhouette = false;
    }
    if (goalTV && wi.side === 'front' && wi.y < F + STORY) {
      g = 4;
      goalTV = false;
    }
    window9(hc, B, wi, hw / 2, hd / 2, 0, 0, g, (h.wvar + idx * (h.seed % 3 === 0 ? 1 : 0)) % 4, trim, h.shutter);
  });
  // ---------- porta, varanda e luz
  const fv = hd / 2;
  hc.box(B.trim, h.doorU, F + 1.1, fv + 0.02, 1.2, 2.3, 0.06, trim);
  hc.box(B.trim, h.doorU, F + 1.05, fv + 0.05, 0.96, 2.1, 0.06, h.door, { uvScale: 0.5 });
  hc.box(B.trim, h.doorU + 0.36, F + 1.0, fv + 0.1, 0.06, 0.06, 0.05, [0.6, 0.48, 0.2]);
  const plSide = h.doorU > 0 ? -1 : 1;
  hc.box(B.trim, h.doorU + plSide * 0.85, F + 1.95, fv + 0.06, 0.16, 0.26, 0.12, [0.05, 0.05, 0.05]);
  hc.box(B.lamp, h.doorU + plSide * 0.85, F + 1.92, fv + 0.13, 0.1, 0.16, 0.03, [1.0, 0.6, 0.26], { group: h.porchLight ? 5 : 6 });
  if (h.porchLight) {
    const [x, z] = hc.w(h.doorU + plSide * 0.85, fv + 0.4);
    ch.porch.push({ x, y: F + 1.9, z, goal: isGoal });
  }
  // número da casa
  const along = fr.road === 'h' ? hc.w(h.doorU, fv)[0] : hc.w(h.doorU, fv)[1];
  const num = houseNumber(L, fr, along);
  lot.number = num;
  const digits = String(num).split('');
  const dw = isGoal ? 0.16 : 0.11;
  const nu0 = h.doorU - plSide * 0.95 - ((digits.length - 1) * dw) / 2;
  digits.forEach((dg, k) =>
    hc.plate(B.sign, nu0 + k * dw, F + 1.75, fv + 0.07, 0, 1, dw, dw * 1.45, atlas.digit(Number(dg)), [0.95, 0.85, 0.6]),
  );
  if (h.porch) porch(hc, B, ch, h, fv, F, trim);
  else {
    // degraus até a porta
    for (let k = 0; k < 3; k++) {
      const top = CURB + ((k + 1) * (F - CURB)) / 3;
      hc.box(B.trim, h.doorU, (CURB + top) / 2, fv + 0.95 - k * 0.3, 1.5, top - CURB, 0.3, CONCRETE, { ao: 0.2, floorY: CURB });
    }
    const [x0, z0] = hc.w(h.doorU - 0.75, fv);
    const [x1, z1] = hc.w(h.doorU + 0.75, fv + 1.1);
    ch.steps.push([Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1), F - 0.08]);
  }
  // caminho da porta até a calçada
  const pathV0 = fv + (h.porch ? h.porch.d + 0.6 : 1.1);
  const pathLen = h.setback - (pathV0 - fv) + 0.02;
  hc.box(B.trim, h.doorU, CURB + 0.015, pathV0 + pathLen / 2, 1.05, 0.03, pathLen, CONCRETE, { skip: 'ny' });
  // chaminé
  if (h.chimney) {
    const cu = h.chimney * (hw / 2 + 0.36);
    const top = roofInfo.ridgeY + 0.7;
    hc.box(B.trim, cu, (CURB + top) / 2, -hd * 0.15, 0.72, top - CURB, 1.1, [0.36, 0.15, 0.1], { uvScale: 0.6, ao: 0.2, floorY: CURB });
    hc.box(B.trim, cu, top + 0.05, -hd * 0.15, 0.82, 0.1, 1.2, [0.3, 0.3, 0.3]);
    ch.colliders.push(localBox(hc, cu - 0.4, cu + 0.4, -hd * 0.15 - 0.6, -hd * 0.15 + 0.6));
  }
  // ---------- garagem
  if (h.garage) garage(hc, B, ch, h, F, trim);
  // ---------- jardim
  yard(L, hc, B, ch, lot, h, rnd);
  if (lot.special !== 'mail') mailboxAt(B, ch, fr, lot.mailA, -(LOT - RW - 0.6), pick(rnd, MAILBOX), false);
  return { hc, num };
}

// Telhado sobre um retângulo (centro cu, cv; larguras w × d). Tipos: gable (cumeeira ao
// longo de u), front (cumeeira ao longo de v, empena para a rua), hip (quatro águas).
function roofOn(hc, B, cu, cv, w, d, wallTop, pitch, type, roofC, wallC, trim, F) {
  const o = 0.38;
  const tp = Math.tan(pitch);
  const th = 0.13;
  const under = [0.12, 0.12, 0.12];
  const alongU = type === 'gable' || (type === 'hip' && w >= d);
  // eixo da cumeeira: (a = ao longo, c = através)
  const A = alongU ? w : d;
  const C = alongU ? d : w;
  const run = C / 2;
  const yR = wallTop + run * tp;
  const yE = wallTop - o * tp;
  // converte (ao longo, y, através) → (u, y, v)
  const L3 = (al, y, ac) => (alongU ? [cu + al, y, cv + ac] : [cu + ac, y, cv + al]);
  const outDir = (s) => (alongU ? [0, 1, s] : [s, 1, 0]);
  const vs = 1.12;
  if (type === 'hip') {
    const r = Math.max(0, A / 2 - run);
    for (const s of [-1, 1]) {
      hc.slab(B.roof, [L3(-A / 2 - o, yE, s * (run + o)), L3(A / 2 + o, yE, s * (run + o)), L3(r, yR, 0), L3(-r, yR, 0)], th, roofC, {
        out: outDir(s),
        us: vs,
        under,
      });
      const endOut = alongU ? [s, 1, 0] : [0, 1, s];
      hc.slab(
        B.roof,
        [L3(s * (A / 2 + o), yE, -run - o), L3(s * (A / 2 + o), yE, run + o), L3(s * r, yR, 0), L3(s * r, yR, 0)],
        th,
        roofC,
        {
          out: endOut,
          us: vs,
          under,
        },
      );
    }
  } else {
    for (const s of [-1, 1]) {
      hc.slab(
        B.roof,
        [L3(-A / 2 - o, yE, s * (run + o)), L3(A / 2 + o, yE, s * (run + o)), L3(A / 2 + o, yR, 0), L3(-A / 2 - o, yR, 0)],
        th,
        roofC,
        {
          out: outDir(s),
          us: vs,
          under,
        },
      );
      // empena (triângulo de parede) e tábuas de beiral inclinadas
      const endOut = alongU ? [s, 0, 0] : [0, 0, s];
      hc.face(
        B.wall,
        [L3((s * A) / 2, wallTop, -run), L3((s * A) / 2, wallTop, run), L3((s * A) / 2, yR - 0.12, 0), L3((s * A) / 2, yR - 0.12, 0)],
        wallC,
        {
          out: endOut,
          us: 1.44,
          v0: (wallTop - F) / 1.44,
        },
      );
      for (const t of [-1, 1]) {
        hc.slab(
          B.trim,
          [
            L3(s * (A / 2 + o), yE - 0.2, t * (run + o)),
            L3(s * (A / 2 + o), yR - 0.2, 0),
            L3(s * (A / 2 + o), yR + 0.01, 0),
            L3(s * (A / 2 + o), yE + 0.01, t * (run + o)),
          ],
          0.05,
          trim,
          { out: endOut },
        );
      }
    }
  }
  // tábuas de beiral (horizontais) nos dois lados da cumeeira
  for (const s of [-1, 1]) {
    const [u, y, v] = L3(0, yE - 0.09, s * (run + o));
    hc.box(B.trim, u, y, v, alongU ? A + 2 * o : 0.05, 0.2, alongU ? 0.05 : A + 2 * o, trim);
  }
  // friso no topo das paredes
  return { ridgeY: yR, eaveY: yE, alongU };
}

// Janela: moldura (caixa), vidro (atlas de janelas), peitoril e venezianas.
function window9(hc, B, wi, hx, hz, cu, cv, g, variant, trim, shutter) {
  let u;
  let v;
  let nu = 0;
  let nv = 0;
  if (wi.side === 'front') [u, v, nv] = [cu + wi.t, cv + hz, 1];
  else if (wi.side === 'back') [u, v, nv] = [cu - wi.t, cv - hz, -1];
  else if (wi.side === 'right') [u, v, nu] = [cu + hx, cv + wi.t, 1];
  else [u, v, nu] = [cu - hx, cv - wi.t, -1];
  const fw = wi.w + 0.2;
  const fh = wi.h + 0.2;
  const d = 0.08;
  if (nv) hc.box(B.trim, u, wi.y, v + nv * (d / 2), fw, fh, d, trim);
  else hc.box(B.trim, u + nu * (d / 2), wi.y, v, d, fh, fw, trim);
  // peitoril
  if (nv) hc.box(B.trim, u, wi.y - fh / 2 - 0.03, v + nv * 0.08, fw + 0.16, 0.06, 0.16, trim);
  else hc.box(B.trim, u + nu * 0.08, wi.y - fh / 2 - 0.03, v, 0.16, 0.06, fw + 0.16, trim);
  const cx = variant % 2;
  const cy = variant >> 1;
  const uv = [cx * 0.5 + 0.004, 1 - (cy + 1) * 0.5 + 0.004, cx * 0.5 + 0.496, 1 - cy * 0.5 - 0.004];
  hc.plate(B.win, u + nu * (d + 0.005), wi.y, v + nv * (d + 0.005), nu, nv, wi.w + 0.06, wi.h + 0.06, uv, [1, 1, 1], g);
  if (shutter && wi.w < 1.2) {
    for (const s of [-1, 1]) {
      const off = s * (fw / 2 + wi.w * 0.26);
      if (nv) hc.box(B.trim, u + off * nv, wi.y, v + nv * 0.03, wi.w * 0.46, fh, 0.04, shutter);
      else hc.box(B.trim, u + nu * 0.03, wi.y, v + off * -nu, 0.04, fh, wi.w * 0.46, shutter);
    }
  }
}

function porch(hc, B, ch, h, fv, F, trim) {
  const p = h.porch;
  const pu = p.u;
  const vo = fv + p.d;
  const floorC = trim[0] > 0.5 ? [0.42, 0.4, 0.38] : [0.3, 0.22, 0.15];
  hc.box(B.trim, pu, (CURB + F) / 2, fv + p.d / 2, p.w, F - CURB, p.d, floorC, { ao: 0.25, floorY: CURB });
  // degraus
  for (let k = 0; k < 2; k++) {
    const top = CURB + ((k + 1) * (F - CURB)) / 3;
    hc.box(B.trim, pu, (CURB + top) / 2, vo + 0.45 - k * 0.3, 1.5, top - CURB, 0.3, floorC, { ao: 0.2, floorY: CURB });
  }
  const [ax, az] = hc.w(pu - p.w / 2, fv);
  const [bx, bz] = hc.w(pu + p.w / 2, vo);
  ch.steps.push([Math.min(ax, bx), Math.max(ax, bx), Math.min(az, bz), Math.max(az, bz), F]);
  const [sx, sz] = hc.w(pu - 0.75, vo);
  const [tx, tz] = hc.w(pu + 0.75, vo + 0.6);
  ch.steps.push([Math.min(sx, tx), Math.max(sx, tx), Math.min(sz, tz), Math.max(sz, tz), CURB + (2 * (F - CURB)) / 3 - 0.05]);
  // colunas, viga e telhado de uma água
  const yTop = F + 2.62;
  const yLow = F + 2.42;
  const cols = p.w > 4.5 ? [-p.w / 2 + 0.12, 0, p.w / 2 - 0.12] : [-p.w / 2 + 0.12, p.w / 2 - 0.12];
  for (const c of cols) {
    if (Math.abs(c) < 0.8) continue;
    hc.box(B.trim, pu + c, (F + yLow) / 2, vo - 0.12, 0.17, yLow - F, 0.17, trim);
    ch.colliders.push(localBox(hc, pu + c - 0.1, pu + c + 0.1, vo - 0.22, vo - 0.02));
  }
  hc.box(B.trim, pu, yLow - 0.1, vo - 0.12, p.w + 0.1, 0.2, 0.17, trim);
  hc.slab(
    B.roof,
    [
      [pu - p.w / 2 - 0.2, yTop, fv],
      [pu + p.w / 2 + 0.2, yTop, fv],
      [pu + p.w / 2 + 0.2, yLow, vo + 0.25],
      [pu - p.w / 2 - 0.2, yLow, vo + 0.25],
    ],
    0.1,
    h.roofC,
    {
      out: [0, 1, 0],
      us: 1.12,
      under: trim,
    },
  );
  if (p.rail) {
    for (const s of [-1, 1]) {
      const len = p.w / 2 - 0.85;
      const cu = pu + s * (0.85 + len / 2);
      for (const y of [F + 0.12, F + 0.88]) hc.box(B.trim, cu, y, vo - 0.12, len, 0.06, 0.07, trim);
      for (let t = 0.85 + 0.16; t < p.w / 2 - 0.1; t += 0.16) hc.box(B.trim, pu + s * t, F + 0.5, vo - 0.12, 0.035, 0.76, 0.035, trim);
      // laterais
      for (const y of [F + 0.12, F + 0.88]) hc.box(B.trim, pu + s * (p.w / 2 - 0.12), y, fv + p.d / 2, 0.07, 0.06, p.d - 0.2, trim);
      for (let t = fv + 0.2; t < vo - 0.2; t += 0.16) hc.box(B.trim, pu + s * (p.w / 2 - 0.12), F + 0.5, t, 0.035, 0.76, 0.035, trim);
      // a grade não se atravessa (só pela escada, no meio)
      ch.colliders.push(localBox(hc, cu - len / 2, cu + len / 2, vo - 0.16, vo - 0.08));
      const su = pu + s * (p.w / 2 - 0.12);
      ch.colliders.push(localBox(hc, su - 0.04, su + 0.04, fv + 0.05, vo - 0.08));
    }
  }
}

function garage(hc, B, ch, h, F, trim) {
  const g = h.garage;
  const gu = g.side * (h.hw / 2 + g.w / 2);
  const front = h.hd / 2 + g.off;
  const gv = front - g.d / 2;
  const top = CURB + 0.08 + 2.75;
  hc.box(B.wall, gu, (CURB + 0.08 + top) / 2, gv, g.w, top - CURB - 0.08, g.d, h.wall, { uvScale: 1.44, ao: 0.25, floorY: CURB });
  hc.box(B.trim, gu, CURB + 0.04, gv, g.w + 0.06, 0.1, g.d + 0.06, CONCRETE);
  for (const s of [-1, 1]) hc.box(B.trim, gu + s * (g.w / 2), (CURB + top) / 2, front, 0.14, top - CURB, 0.14, trim);
  // portão (painéis horizontais pela textura do revestimento)
  hc.box(B.trim, gu, CURB + 1.17, front + 0.02, g.dw + 0.24, 2.3, 0.05, trim);
  hc.box(B.wall, gu, CURB + 1.1, front + 0.05, g.dw, 2.15, 0.05, trim[0] > 0.5 ? [0.82, 0.8, 0.76] : [0.7, 0.66, 0.58], { uvScale: 4.3 });
  ch.colliders.push(localBox(hc, gu - g.w / 2 - 0.05, gu + g.w / 2 + 0.05, gv - g.d / 2, front + 0.08));
  ch.walls.push(ch.colliders[ch.colliders.length - 1]);
  roofOn(hc, B, gu, gv, g.w, g.d, top, 0.42, g.roof, h.roofC, h.wall, trim, CURB + 0.08);
  // luz sobre o portão
  hc.box(B.trim, gu + g.dw / 2 + 0.35, CURB + 2.35, front + 0.06, 0.14, 0.22, 0.1, [0.05, 0.05, 0.05]);
}

// Jardim: árvores, arbustos, cerca, entrada de carros, carro, galpão, cerca dos fundos.
function yard(L, hc, B, ch, lot, h, rnd) {
  const lc = (lot.a0 + lot.a1) / 2;
  // frente do lote em coordenadas da casa: v = bc - b
  const vOf = (b) => hc.bc - b;
  const uOf = (a) => a - hc.ac;
  // entrada de carros
  if (h.drive) {
    const du = uOf(lc + h.drive.u);
    const vFar = vOf(h.drive.to);
    const vNear = vOf(-(LOT - RW));
    const len = vNear - vFar;
    hc.box(B.trim, du, CURB + 0.011, (vNear + vFar) / 2, h.drive.w, 0.022, len, [0.5, 0.49, 0.46], { skip: 'ny', uvScale: 2 });
    if (h.car) {
      const cv = h.drive.side ? vFar + 3.2 : vFar + 3.0;
      car(hc, B, ch, du, cv, rnd);
    }
  }
  // arbustos junto à fachada
  if (h.bushes) {
    const v = h.hd / 2 + 0.7;
    for (let u = -h.hw / 2 + 0.6; u < h.hw / 2 - 0.4; u += 1.0 + rnd() * 0.5) {
      if (Math.abs(u - h.doorU) < (h.porch ? h.porch.w / 2 + 0.5 : 1.3)) continue;
      blob(hc, B.fol, u, CURB + 0.35, v + (rnd() - 0.5) * 0.2, 0.45 + rnd() * 0.3, 0.8, rnd, [0.55, 0.75, 0.5]);
    }
  }
  // árvores no jardim da frente
  const clearU = (u) => (!h.drive || Math.abs(u - uOf(lc + h.drive.u)) > h.drive.w / 2 + 1.6) && Math.abs(u - h.doorU) > 1.8;
  for (let k = 0; k < h.trees; k++) {
    const u = uOf(lc) + (rnd() - 0.5) * (lot.w - 3);
    const v = h.hd / 2 + 2.5 + rnd() * Math.max(0.5, h.setback - 4);
    if (!clearU(u)) continue;
    tree(hc, B, ch, u, v, rnd, rnd() < 0.25 ? 'pine' : 'leaf', 0.85);
  }
  // árvore da calçada (faixa de grama)
  if (lot.streetA !== undefined) tree(hc, B, ch, uOf(lot.streetA), vOf(-(LOT - RW - STRIP / 2) + 0.0), rnd, 'leaf', 1.0);
  // árvore grande nos fundos (silhueta acima dos telhados)
  if (h.backTree) {
    const u = uOf(lc) + (rnd() - 0.5) * (lot.w - 4);
    const v = vOf(ROWD - 2 - rnd() * 2);
    tree(hc, B, ch, u, v, rnd, rnd() < 0.3 ? 'pine' : 'leaf', 1.35);
  }
  // galpão nos fundos
  if (h.shed) {
    const u = uOf(lc) + (rnd() < 0.5 ? -1 : 1) * (lot.w / 2 - 2.4);
    const v = vOf(ROWD - 2.2);
    hc.box(B.wall, u, CURB + 1.1, v, 2.6, 2.2, 2.2, [0.38, 0.33, 0.26], { uvScale: 1.44, ao: 0.3, floorY: CURB });
    roofOn(hc, B, u, v, 2.6, 2.2, CURB + 2.2, 0.4, 'gable', h.roofC, [0.38, 0.33, 0.26], [0.3, 0.26, 0.2], CURB);
    ch.colliders.push(localBox(hc, u - 1.35, u + 1.35, v - 1.15, v + 1.15));
  }
  // cerca de estacas branca na frente
  if (h.picket) {
    const vf = vOf(0.3);
    const gaps = [[h.doorU - 0.7, h.doorU + 0.7]];
    if (h.drive) gaps.push([uOf(lc + h.drive.u) - h.drive.w / 2 - 0.2, uOf(lc + h.drive.u) + h.drive.w / 2 + 0.2]);
    const u0 = uOf(lot.a0) + 0.2;
    const u1 = uOf(lot.a1) - 0.2;
    const inGap = (u) => gaps.some((g) => u > g[0] && u < g[1]);
    let segStart = null;
    for (let u = u0; u <= u1 + 1e-3; u += 0.16) {
      const gap = inGap(u) || u > u1 - 0.01;
      if (!gap) {
        hc.box(B.trim, u, CURB + 0.48, vf, 0.07, 0.96, 0.03, [0.82, 0.82, 0.78]);
        if (segStart === null) segStart = u;
      }
      if ((gap || u + 0.16 > u1) && segStart !== null) {
        const end = gap ? u - 0.16 : u;
        if (end > segStart) {
          for (const y of [CURB + 0.3, CURB + 0.75])
            hc.box(B.trim, (segStart + end) / 2, y, vf - 0.03, end - segStart, 0.06, 0.03, [0.8, 0.8, 0.76]);
          ch.colliders.push(localBox(hc, segStart, end, vf - 0.08, vf + 0.05));
        }
        segStart = null;
      }
    }
  }
  // cerca viva na divisa
  if (h.hedge) {
    const u = h.hedge < 0 ? uOf(lot.a0) + 0.5 : uOf(lot.a1) - 0.5;
    const vA = vOf(0.8);
    const vB = h.hd / 2 + 0.5;
    for (let v = vB; v < vA; v += 0.75) blob(hc, B.fol, u, CURB + 0.55, v, 0.62, 1.15, rnd, [0.45, 0.65, 0.42]);
    ch.colliders.push(localBox(hc, u - 0.55, u + 0.55, vB - 0.3, vA + 0.3));
  }
  // cerca de madeira lateral nos fundos
  if (lot.back) {
    const u = uOf(lot.a1) - 0.05;
    const vA = vOf(hc.bc + 0.5);
    const vB = vOf(ROWD);
    fenceRun(hc, B, ch, u, vB, u, vA);
  }
}

// Cerca de madeira alta entre (u0,v0) e (u1,v1) (alinhada a um eixo).
export function fenceRun(hc, B, ch, u0, v0, u1, v1) {
  const len = Math.hypot(u1 - u0, v1 - v0);
  if (len < 0.5) return;
  const alongU = Math.abs(u1 - u0) > Math.abs(v1 - v0);
  const cu = (u0 + u1) / 2;
  const cv = (v0 + v1) / 2;
  hc.box(B.trim, cu, CURB + 0.95, cv, alongU ? len : 0.05, 1.7, alongU ? 0.05 : len, FENCE, { ao: 0.3, floorY: CURB, uvScale: 0.4 });
  for (let t = 0; t <= len; t += 2.4) {
    const u = alongU ? Math.min(u0, u1) + t : u0;
    const v = alongU ? v0 : Math.min(v0, v1) + t;
    hc.box(B.trim, u, CURB + 1.0, v, 0.1, 1.85, 0.1, [0.25, 0.18, 0.12]);
  }
  ch.colliders.push(localBox(hc, Math.min(u0, u1) - 0.06, Math.max(u0, u1) + 0.06, Math.min(v0, v1) - 0.06, Math.max(v0, v1) + 0.06));
  ch.walls.push(ch.colliders[ch.colliders.length - 1]);
}

let blobGeos = null;
function blobGeo(k) {
  if (!blobGeos) {
    blobGeos = [];
    for (let n = 0; n < 4; n++) {
      const g = new THREE.IcosahedronGeometry(1, 1);
      const p = g.attributes.position;
      const r = mulberry32(900 + n);
      // deforma os vértices (as faces não são indexadas: vértices iguais recebem o mesmo deslocamento)
      const seen = new Map();
      for (let i = 0; i < p.count; i++) {
        const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
        let s = seen.get(key);
        if (s === undefined) {
          s = 0.82 + r() * 0.36;
          seen.set(key, s);
        }
        p.setXYZ(i, p.getX(i) * s, p.getY(i) * s, p.getZ(i) * s);
      }
      // normais "esféricas" (suaves) a partir da direção original
      const nn = g.attributes.normal;
      const v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.set(p.getX(i), p.getY(i), p.getZ(i)).normalize();
        nn.setXYZ(i, v.x, v.y, v.z);
      }
      blobGeos.push(g);
    }
  }
  return blobGeos[k % 4];
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _pv = new THREE.Vector3();
const _eu = new THREE.Euler();

export function blobAt(gb, x, y, z, r, sy, rot, k, col) {
  _eu.set(0, rot, 0);
  _q.setFromEuler(_eu);
  _s.set(r, r * sy, r);
  _pv.set(x, y, z);
  _m.compose(_pv, _q, _s);
  gb.addGeometry(blobGeo(k), _m, col);
}

function blob(hc, gb, u, y, v, r, sy, rnd, base) {
  const [x, z] = hc.w(u, v);
  const t = 0.8 + rnd() * 0.35;
  blobAt(gb, x, y, z, r, sy, rnd() * 6.28, Math.floor(rnd() * 4), [base[0] * t, base[1] * t, base[2] * t]);
}

let coneGeo = null;
// Árvore: tronco (trim) e copa (folhagem). kind: 'leaf' ou 'pine'.
export function treeAt(B, ch, x, z, rnd, kind, scale) {
  const s = scale * (0.8 + rnd() * 0.45);
  if (kind === 'pine') {
    const H = 7 * s;
    B.trim.cylinder(x, CURB + H * 0.2, z, 0.18 * s, H * 0.4, BARK, null, { sides: 6 });
    if (!coneGeo) coneGeo = new THREE.ConeGeometry(1, 1, 8, 1);
    const g = [0.1 + rnd() * 0.04, 0.17 + rnd() * 0.05, 0.12];
    for (let k = 0; k < 4; k++) {
      const r = (2.1 - k * 0.42) * s;
      const hh = 2.6 * s;
      _eu.set(0, rnd() * 6.28, 0);
      _q.setFromEuler(_eu);
      _s.set(r, hh, r);
      _pv.set(x, CURB + H * 0.25 + k * 1.35 * s + hh / 2, z);
      _m.compose(_pv, _q, _s);
      B.fol.addGeometry(coneGeo, _m, g);
    }
  } else {
    const H = (2.6 + rnd() * 1.4) * s;
    B.trim.cylinder(x, CURB + H / 2, z, 0.17 * s, H, BARK, null, { sides: 7, r2: 0.12 * s });
    const n = 5 + Math.floor(rnd() * 4);
    const g = [0.11 + rnd() * 0.05, 0.16 + rnd() * 0.06, 0.08 + rnd() * 0.03];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * 6.28 + rnd();
      const rr = (k === 0 ? 0 : 1.2 + rnd() * 0.8) * s;
      const r = (1.3 + rnd() * 0.9) * s;
      blobAt(B.fol, x + Math.cos(a) * rr, CURB + H + (0.9 + rnd() * 1.6) * s, z + Math.sin(a) * rr, r, 0.85, rnd() * 6.28, k, g);
    }
  }
  ch.colliders.push([x - 0.25 * s, x + 0.25 * s, z - 0.25 * s, z + 0.25 * s]);
}

function tree(hc, B, ch, u, v, rnd, kind, scale) {
  const [x, z] = hc.w(u, v);
  treeAt(B, ch, x, z, rnd, kind, scale);
}

// Carro estacionado (ao longo de v) em coordenadas da casa.
function car(hc, B, ch, u, v, rnd) {
  const col = pick(rnd, CARS);
  const glass = [0.03, 0.035, 0.04];
  const y = CURB;
  hc.box(B.trim, u, y + 0.55, v, 1.78, 0.62, 4.4, col);
  hc.box(B.trim, u, y + 1.12, v - 0.25, 1.6, 0.52, 2.3, glass);
  hc.box(B.trim, u, y + 1.4, v - 0.25, 1.52, 0.05, 2.15, col);
  hc.box(B.trim, u, y + 0.62, v + 2.21, 1.5, 0.12, 0.02, [0.5, 0.48, 0.42]);
  for (const s of [-1, 1])
    for (const t of [-1.38, 1.38]) {
      const [x, z] = hc.w(u + s * 0.82, v + t);
      const ax = Math.abs(hc.fr.U[0]) > 0.5 ? 'x' : 'z';
      B.trim.cylinder(x, y + 0.33, z, 0.33, 0.24, [0.03, 0.03, 0.03], null, { axis: ax, sides: 10 });
    }
  ch.colliders.push(localBox(hc, u - 0.95, u + 0.95, v - 2.25, v + 2.25));
  ch.walls.push(ch.colliders[ch.colliders.length - 1]);
}

// Carro estacionado na rua, junto ao meio-fio (coordenadas de mundo).
export function curbCar(B, ch, x, z, alongX, rnd) {
  const col = pick(rnd, CARS);
  const glass = [0.03, 0.035, 0.04];
  const rot = alongX ? Math.PI / 2 : 0;
  const ux = alongX ? 1 : 0;
  const uz = alongX ? 0 : 1;
  B.trim.box(x, 0.55, z, 1.78, 0.62, 4.4, col, null, { rot, ao: 0 });
  B.trim.box(x - ux * 0.25, 1.12, z - uz * 0.25, 1.6, 0.52, 2.3, glass, null, { rot, ao: 0 });
  B.trim.box(x - ux * 0.25, 1.4, z - uz * 0.25, 1.52, 0.05, 2.15, col, null, { rot, ao: 0 });
  for (const s of [-0.82, 0.82])
    for (const t of [-1.38, 1.38])
      B.trim.cylinder(x + ux * t + uz * s, 0.33, z + uz * t + ux * s, 0.33, 0.24, [0.03, 0.03, 0.03], null, {
        axis: alongX ? 'z' : 'x',
        sides: 10,
      });
  const b = [x - (alongX ? 2.25 : 0.95), x + (alongX ? 2.25 : 0.95), z - (alongX ? 0.95 : 2.25), z + (alongX ? 0.95 : 2.25)];
  ch.colliders.push(b);
  ch.walls.push(b);
}

// Caixa de correio americana no poste (coordenadas da fileira).
export function mailboxAt(B, ch, fr, a, b, col, flagUp) {
  const [x, z] = rowWorld(fr, a, b);
  const rot = fr.rot;
  B.trim.box(x, CURB + 0.52, z, 0.09, 1.04, 0.09, [0.22, 0.17, 0.12], null, { rot, ao: 0 });
  B.trim.box(x, CURB + 1.1, z, 0.24, 0.16, 0.5, col, null, { rot, ao: 0 });
  const ax = Math.abs(fr.V[0]) > 0.5 ? 'x' : 'z';
  B.trim.cylinder(x, CURB + 1.18, z, 0.12, 0.5, col, null, { axis: ax, sides: 10 });
  if (!flagUp) {
    const [fx, fz] = rowWorld(fr, a + 0.14, b - 0.05);
    B.trim.box(fx, CURB + 1.12, fz, 0.02, 0.06, 0.26, [0.55, 0.06, 0.04], null, { rot, ao: 0 });
  }
  ch.colliders.push([x - 0.14, x + 0.14, z - 0.14, z + 0.14]);
}

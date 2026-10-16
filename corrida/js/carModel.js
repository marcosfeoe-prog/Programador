// Modelos 3D procedurais dos carros.
//
// A carroceria é um "loft" de seções transversais com forma de carro de verdade:
// assoalho plano, canto inferior arredondado, lateral quase vertical (com leve
// barriga), ombro arredondado e capô/tampa com abaulamento — e os para-lamas
// podem ficar acima do capô. As caixas de roda são recortadas na lateral, com
// lábio alargado. A cabine é outro loft (vidros, colunas A/B/C, teto, borracha
// dos vidros). Faróis, lanternas, grades, aberturas e o resto são posicionados
// e orientados pela própria superfície da carroceria.
import * as THREE from 'three';
import * as TX from './textures.js';
import ALVORADA from './cars/alvorada.js';
import CICLONE from './cars/ciclone.js';

// ---------------------------------------------------------------- modelos
// Chaves [u, valor] ao longo do comprimento (u = 0 frente, 1 traseira):
//  hw  meia-largura da lateral   yb  altura do assoalho
//  yt  altura do topo no centro  yf  altura do topo na borda (para-lama)
//  rs  raio do ombro             cab cabine (s/e = início/fim em u)
export const CAR_MODELS = [
  {
    id: 'gt',
    style: 'gt',
    name: 'Falcão GT',
    desc: 'Carro de corrida GT com asa traseira. Equilibrado e estável.',
    length: 4.62,
    frontU: 0.17,
    rearU: 0.8,
    wheelR: 0.345,
    tireW: 0.3,
    trackHalf: 0.86,
    hw: [[0, 0.8], [0.035, 0.9], [0.09, 0.97], [0.17, 1.02], [0.27, 1.0], [0.42, 0.95], [0.6, 0.97], [0.8, 1.04], [0.92, 1.0], [0.975, 0.93], [1, 0.85]],
    yb: [[0, 0.2], [0.05, 0.14], [0.5, 0.13], [0.92, 0.15], [1, 0.25]],
    yt: [[0, 0.5], [0.04, 0.58], [0.12, 0.62], [0.25, 0.69], [0.32, 0.74], [0.6, 0.8], [0.84, 0.84], [0.95, 0.86], [1, 0.8]],
    yf: [[0, 0.5], [0.05, 0.64], [0.17, 0.86], [0.27, 0.81], [0.42, 0.8], [0.6, 0.83], [0.8, 0.93], [0.93, 0.9], [1, 0.8]],
    rs: [[0, 0.08], [0.15, 0.14], [0.5, 0.12], [1, 0.13]],
    rb: 0.07,
    tuck: 0.05,
    tumble: 0.07,
    flare: 0.03,
    cab: { s: 0.31, e: 0.84, roof: 1.18, tW: 0.3, tR: 0.58, hwBase: [[0, 0.82], [0.4, 0.8], [1, 0.7]], hwRoof: [[0, 0.66], [0.4, 0.6], [1, 0.48]], rRoof: 0.1, crown: 0.03, winEnd: 0.68, bPillar: [0.5, 0.545] },
    wheelStyle: 'center10',
    doorLines: [0.37, 0.6],
    hoodLine: 0.29,
    hoodHalf: 0.62,
    trunkLine: 0.88,
    trunkHalf: 0.55,
    numberU: 0.49,
    stripes: false,
    sideStripe: true,
    mass: 1250,
    power: 1.0,
    grip: 1.0,
  },
  {
    id: 'raio',
    style: 'raio',
    name: 'Raio S',
    desc: 'Superesportivo de motor central. Rápido nas retas, arisco nas curvas.',
    length: 4.52,
    frontU: 0.165,
    rearU: 0.79,
    wheelR: 0.34,
    tireW: 0.3,
    trackHalf: 0.85,
    hw: [[0, 0.8], [0.035, 0.9], [0.1, 0.96], [0.165, 1.0], [0.3, 0.97], [0.45, 0.94], [0.6, 0.99], [0.79, 1.05], [0.92, 1.02], [0.975, 0.95], [1, 0.88]],
    yb: [[0, 0.17], [0.05, 0.12], [0.5, 0.12], [0.92, 0.14], [1, 0.24]],
    yt: [[0, 0.44], [0.05, 0.52], [0.165, 0.6], [0.25, 0.66], [0.7, 0.86], [0.9, 0.92], [1, 0.84]],
    yf: [[0, 0.45], [0.05, 0.6], [0.165, 0.83], [0.3, 0.77], [0.5, 0.82], [0.79, 0.97], [0.92, 0.95], [1, 0.85]],
    rs: [[0, 0.08], [0.15, 0.14], [0.5, 0.13], [1, 0.14]],
    rb: 0.07,
    tuck: 0.05,
    tumble: 0.08,
    flare: 0.02,
    cab: { s: 0.25, e: 0.74, roof: 1.12, tW: 0.42, tR: 0.64, hwBase: [[0, 0.84], [0.5, 0.8], [1, 0.62]], hwRoof: [[0, 0.64], [0.5, 0.56], [1, 0.4]], rRoof: 0.14, crown: 0.04, winEnd: 0.7, bPillar: null },
    wheelStyle: 'y5',
    doorLines: [0.33, 0.56],
    hoodLine: 0.24,
    hoodHalf: 0.58,
    trunkLine: 0.75,
    trunkHalf: 0.6,
    numberU: 0.45,
    stripes: true,
    sideStripe: false,
    mass: 1180,
    power: 1.1,
    grip: 0.96,
  },
  {
    id: 'bisao',
    style: 'muscle',
    name: 'Bisão V8',
    desc: 'Muscle car V8 de capô longo. Muito torque, mais pesado.',
    length: 4.85,
    frontU: 0.155,
    rearU: 0.79,
    wheelR: 0.35,
    tireW: 0.29,
    trackHalf: 0.84,
    hw: [[0, 0.88], [0.02, 0.92], [0.06, 0.94], [0.5, 0.94], [0.8, 0.96], [0.97, 0.94], [1, 0.9]],
    yb: [[0, 0.22], [0.06, 0.18], [0.9, 0.18], [1, 0.24]],
    yt: [[0, 0.7], [0.04, 0.77], [0.38, 0.83], [0.8, 0.86], [0.97, 0.87], [1, 0.82]],
    yf: [[0, 0.72], [0.04, 0.8], [0.38, 0.86], [0.8, 0.9], [0.97, 0.9], [1, 0.84]],
    rs: 0.06,
    rb: 0.07,
    tuck: 0.06,
    tumble: 0.02,
    flare: 0.0,
    cab: { s: 0.4, e: 0.76, roof: 1.3, tW: 0.26, tR: 0.72, hwBase: [[0, 0.86], [1, 0.86]], hwRoof: [[0, 0.74], [1, 0.72]], rRoof: 0.07, crown: 0.025, winEnd: 0.8, bPillar: null },
    wheelStyle: 'slot5',
    doorLines: [0.42, 0.63],
    hoodLine: 0.38,
    hoodHalf: 0.72,
    trunkLine: 0.79,
    trunkHalf: 0.72,
    numberU: 0.53,
    stripes: true,
    sideStripe: false,
    mass: 1420,
    power: 1.18,
    grip: 0.95,
  },
  {
    id: 'eagle',
    style: 'eagle',
    name: 'Eagle SS',
    desc: 'Fastback V8 preparado, inspirado no Mustang. O mais potente do grid.',
    length: 4.8,
    frontU: 0.16,
    rearU: 0.78,
    wheelR: 0.355,
    tireW: 0.31,
    trackHalf: 0.87,
    hw: [[0, 0.84], [0.03, 0.9], [0.08, 0.95], [0.16, 0.99], [0.3, 0.96], [0.55, 0.95], [0.78, 1.02], [0.93, 0.99], [1, 0.92]],
    yb: [[0, 0.2], [0.06, 0.15], [0.9, 0.16], [1, 0.25]],
    yt: [[0, 0.68], [0.04, 0.74], [0.16, 0.8], [0.36, 0.86], [0.85, 0.92], [0.95, 0.93], [1, 0.87]],
    yf: [[0, 0.66], [0.04, 0.74], [0.16, 0.87], [0.36, 0.88], [0.6, 0.88], [0.78, 0.96], [0.93, 0.95], [1, 0.87]],
    rs: [[0, 0.08], [0.15, 0.11], [1, 0.1]],
    rb: 0.07,
    tuck: 0.05,
    tumble: 0.06,
    flare: 0.025,
    cab: { s: 0.37, e: 0.89, roof: 1.29, tW: 0.28, tR: 0.47, hwBase: [[0, 0.84], [0.5, 0.8], [1, 0.6]], hwRoof: [[0, 0.68], [0.5, 0.62], [1, 0.44]], rRoof: 0.12, crown: 0.03, winEnd: 0.64, bPillar: null },
    wheelStyle: 'split5',
    hoodBulge: { u0: 0.03, u1: 0.35, w: 0.36, h: 0.045 },
    doorLines: [0.41, 0.62],
    hoodLine: 0.36,
    hoodHalf: 0.62,
    trunkLine: 0.9,
    trunkHalf: 0.6,
    numberU: 0.52,
    stripes: true,
    sideStripe: false,
    mass: 1380,
    power: 1.3,
    grip: 1.02,
    final: 3.35,
  },
];

// carros com módulo próprio (forma + detalhes personalizados em js/cars/)
CAR_MODELS.push(ALVORADA, CICLONE);

export const CAR_COLORS = [
  { name: 'Vermelho', color: '#c8141c', stripe: '#f4f4f4', sponsor: '#ffffff' },
  { name: 'Azul', color: '#1446b8', stripe: '#f2f2f2', sponsor: '#ffd400' },
  { name: 'Amarelo', color: '#f2b705', stripe: '#121212', sponsor: '#121212' },
  { name: 'Verde', color: '#0f7a3a', stripe: '#f0e6c8', sponsor: '#ffffff' },
  { name: 'Branco', color: '#ecedee', stripe: '#1446b8', sponsor: '#c8141c' },
  { name: 'Preto', color: '#17181b', stripe: '#e88a10', sponsor: '#e88a10' },
  { name: 'Laranja', color: '#e8620c', stripe: '#141414', sponsor: '#ffffff' },
  { name: 'Prata', color: '#9aa1a8', stripe: '#c8141c', sponsor: '#111111' },
];

const RIM_COLORS = ['#c9ccd0', '#1c1d20', '#b8923a', '#8d9399', '#2b2d31'];
const CALIPER_COLORS = ['#d01d1d', '#f2c200', '#1d5fd0', '#e8620c'];

// ------------------------------------------------------------- utilidades
// Interpolação Catmull-Rom (bordas presas) entre chaves [u, valor]; aceita número.
function kf(arr, u) {
  if (typeof arr === 'number') return arr;
  const n = arr.length;
  if (u <= arr[0][0]) return arr[0][1];
  if (u >= arr[n - 1][0]) return arr[n - 1][1];
  let i = 1;
  while (u > arr[i][0]) i++;
  const p0 = arr[Math.max(0, i - 2)][1];
  const p1 = arr[i - 1][1];
  const p2 = arr[i][1];
  const p3 = arr[Math.min(n - 1, i + 1)][1];
  const t = (u - arr[i - 1][0]) / (arr[i][0] - arr[i - 1][0]);
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

const quad = (a, b, c, t) => (1 - t) * (1 - t) * a + 2 * (1 - t) * t * b + t * t * c;
const cubic = (a, b, c, d, t) => {
  const s = 1 - t;
  return s * s * s * a + 3 * s * s * t * b + 3 * s * t * t * c + t * t * t * d;
};
const smooth = (a, b, x) => {
  const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// segmentos da seção da carroceria (meia seção, do centro de baixo ao centro de cima)
const SEG_FLAT = 0;
const SEG_CORNER = 1;
const SEG_SIDE = 2;
const SEG_SHOULDER = 3;
const SEG_TOP = 4;
const N_FLAT = 4;
const N_CORNER = 4;
const N_SIDE = 14;
const N_SHOULDER = 7;
const N_TOP = 10;
const K_BODY = 1 + N_FLAT + N_CORNER + N_SIDE + N_SHOULDER + N_TOP; // pontos por meia seção
const I_CORNER0 = N_FLAT; // índice do último ponto do assoalho
const I_SHOULDER1 = N_FLAT + N_CORNER + N_SIDE + N_SHOULDER; // último ponto do ombro
const TOP_K = TX.LIVERY_V.topK;

// cabine
const C_FLAT = 3;
const C_SIDE = 8;
const C_CORNER = 6;
const C_ROOF = 8;
const K_CAB = 1 + C_FLAT + C_SIDE + C_CORNER + C_ROOF;

class CarShape {
  constructor(spec) {
    this.s = spec;
    this.L = spec.length;
    this.R = spec.wheelR;
    this.zF = this.z(spec.frontU);
    this.zR = this.z(spec.rearU);
    this.rA = this.R + 0.055; // raio do recorte da caixa de roda
    this.yc = this.R; // centro da roda (altura de rodagem estática)
    this.cache = new Map();
    this.cabCache = new Map();
  }
  z(u) {
    return this.L / 2 - u * this.L;
  }
  u(z) {
    return (this.L / 2 - z) / this.L;
  }
  sec(u) {
    const s = this.s;
    // pontas arredondadas (para-choques): a seção encolhe um pouco nas extremidades
    const e0 = 0.03;
    const e1 = 0.025;
    let f = 1;
    if (u < e0) f = Math.sqrt(1 - (1 - u / e0) ** 2);
    else if (u > 1 - e1) f = Math.sqrt(1 - (1 - (1 - u) / e1) ** 2);
    const kv = 0.8 + 0.2 * f;
    const yb0 = kf(s.yb, u);
    let yt = kf(s.yt, u);
    let yf = kf(s.yf, u);
    const mid = yb0 + (Math.min(yt, yf) - yb0) * 0.45;
    const yb = mid + (yb0 - mid) * kv;
    yt = mid + (yt - mid) * kv;
    yf = mid + (yf - mid) * kv;
    const hw = kf(s.hw, u) * (0.8 + 0.2 * f);
    return { hw, yb, yt, yf, rs: kf(s.rs, u), rb: s.rb, tuck: s.tuck, tumble: s.tumble };
  }
  // meia seção como lista de pontos {x, y, v, seg} (com cache)
  halfPath(u) {
    const key = Math.round(u * 4000);
    const hit = this.cache.get(key);
    if (hit) return hit;
    const c = this.sec(key / 4000);
    const { hw, yb, yt, yf, rb, tuck, tumble } = c;
    const rs = Math.max(0.03, Math.min(c.rs, (yf - yb - rb) * 0.42, (hw - tumble) * 0.4));
    const xs = hw - tuck;
    const xb = Math.max(0.04, xs - rb);
    const xt = hw - tumble;
    const x0 = Math.max(0.04, xt - rs);
    const ys0 = yb + rb;
    const ys1 = yf - rs;
    const vTop0 = Math.max(0.31, 0.5 - TOP_K * x0);
    const pts = [];
    const push = (x, y, seg, v) => pts.push({ x, y, seg, v });
    push(0, yb, SEG_FLAT, 0);
    for (let i = 1; i <= N_FLAT; i++) push((xb * i) / N_FLAT, yb, SEG_FLAT, (0.04 * i) / N_FLAT);
    for (let i = 1; i <= N_CORNER; i++) {
      const t = i / N_CORNER;
      push(quad(xb, xs, xs, t), quad(yb, yb, ys0, t), SEG_CORNER, 0.04 + 0.04 * t);
    }
    // lateral: cúbica com leve barriga, corrigida para tocar a meia-largura
    const side = [];
    let maxX = 0;
    for (let i = 1; i <= N_SIDE; i++) {
      const t = i / N_SIDE;
      const x = cubic(xs, hw, hw, xt, t);
      const y = cubic(ys0, ys0 + (ys1 - ys0) * 0.33, ys0 + (ys1 - ys0) * 0.72, ys1, t);
      side.push([x, y, t]);
      maxX = Math.max(maxX, x);
    }
    const bulge = hw - maxX;
    // entradas laterais esculpidas: a lateral afunda (côncava) numa região de u × y
    const scoops = this.s.sideScoops || [];
    for (const [x, y, t] of side) {
      let xx = x + bulge * Math.sin(Math.PI * t);
      for (const sc of scoops) {
        const ku = smooth(sc.u0, sc.u0 + (sc.fu ?? 0.04), u) * (1 - smooth(sc.u1 - (sc.fu ?? 0.04), sc.u1, u));
        if (ku <= 0) continue;
        const ky = smooth(sc.y0, sc.y0 + (sc.fy ?? 0.05), y) * (1 - smooth(sc.y1 - (sc.fy ?? 0.05), sc.y1, y));
        xx -= sc.depth * ku * ky;
      }
      push(xx, y, SEG_SIDE, 0.08 + 0.22 * t);
    }
    // ombro: curva tangente à lateral e ao topo
    const slope = (2 * (yf - yt)) / x0;
    const cy = yf + slope * (xt - x0);
    for (let i = 1; i <= N_SHOULDER; i++) {
      const t = i / N_SHOULDER;
      push(quad(xt, xt, x0, t), quad(ys1, cy, yf, t), SEG_SHOULDER, 0.3 + (vTop0 - 0.3) * t);
    }
    // topo (capô / tampa) com abaulamento ou vale entre os para-lamas
    const hb = this.s.hoodBulge;
    const bulgeK = hb ? smooth(hb.u0, hb.u0 + 0.05, u) * (1 - smooth(hb.u1 - 0.05, hb.u1, u)) * hb.h : 0;
    for (let i = 1; i <= N_TOP; i++) {
      const x = x0 * (1 - i / N_TOP);
      let y = yt + (yf - yt) * (x / x0) ** 2;
      if (bulgeK) y += bulgeK * (1 - smooth(hb.w * 0.6, hb.w, x));
      push(x, y, SEG_TOP, i === N_TOP ? 0.5 : 0.5 - TOP_K * x);
    }
    // ajuste fino do módulo do carro: pode mexer em x/y de cada ponto da meia seção
    if (this.s.bodyMod) for (const p of pts) this.s.bodyMod(key / 4000, p, c);
    this.cache.set(key, pts);
    return pts;
  }
  // altura do topo da carroceria na posição x
  topY(u, x) {
    const h = this.halfPath(u);
    const ax = Math.abs(x);
    for (let i = h.length - 1; i > I_CORNER0 + N_CORNER + N_SIDE; i--) {
      const a = h[i];
      const b = h[i - 1];
      if (b.x >= ax) {
        const t = (ax - a.x) / Math.max(1e-6, b.x - a.x);
        return a.y + (b.y - a.y) * t;
      }
    }
    return h[I_CORNER0 + N_CORNER + N_SIDE].y;
  }
  // x da superfície externa na altura y (lado +x)
  sideX(u, y) {
    const h = this.halfPath(u);
    if (y <= h[I_CORNER0].y) return h[I_CORNER0].x;
    for (let i = I_CORNER0; i < I_SHOULDER1; i++) {
      const a = h[i];
      const b = h[i + 1];
      if (b.y >= y) {
        const t = (y - a.y) / Math.max(1e-6, b.y - a.y);
        return a.x + (b.x - a.x) * t;
      }
    }
    return h[I_SHOULDER1].x;
  }
  inside(u, x, y) {
    const h = this.halfPath(u);
    if (y < h[0].y) return false;
    const ax = Math.abs(x);
    return ax <= this.sideX(u, y) && y <= this.topY(u, ax);
  }
  frontZ(x, y) {
    for (let u = 0; u < 0.35; u += 0.002) if (this.inside(u, x, y)) return this.z(u);
    return this.z(0.35);
  }
  rearZ(x, y) {
    for (let u = 1; u > 0.65; u -= 0.002) if (this.inside(u, x, y)) return this.z(u);
    return this.z(0.65);
  }
  // normal aproximada da frente/traseira em (x, y)
  endNormal(x, y, rear) {
    const f = rear ? (a, b) => -this.rearZ(a, b) : (a, b) => this.frontZ(a, b);
    const e = 0.05;
    const dx = THREE.MathUtils.clamp((f(x + e, y) - f(x - e, y)) / (2 * e), -2.5, 2.5);
    const dy = THREE.MathUtils.clamp((f(x, y + e) - f(x, y - e)) / (2 * e), -2.5, 2.5);
    const n = new THREE.Vector3(-dx, -dy, 1).normalize();
    if (rear) n.z = -n.z;
    return n;
  }
  topNormal(u, x) {
    const e = 0.04;
    const du = e / this.L;
    const dydx = (this.topY(u, x + e) - this.topY(u, x - e)) / (2 * e);
    const dydz = -(this.topY(u + du, x) - this.topY(u - du, x)) / (2 * e);
    return new THREE.Vector3(-dydx, 1, -dydz).normalize();
  }
  sideNormal(u, y) {
    const e = 0.03;
    const du = 0.01;
    const dxdy = (this.sideX(u, y + e) - this.sideX(u, y - e)) / (2 * e);
    const dxdz = -(this.sideX(u + du, y) - this.sideX(u - du, y)) / (2 * du * this.L);
    return new THREE.Vector3(1, -dxdy, -dxdz).normalize();
  }
  // altura do recorte da caixa de roda na posição z (ou -Infinity)
  arch(z, u) {
    let y = -Infinity;
    for (const zw of [this.zF, this.zR]) {
      const dz = z - zw;
      if (Math.abs(dz) < this.rA) y = Math.max(y, this.yc + Math.sqrt(this.rA * this.rA - dz * dz));
    }
    if (y === -Infinity) return y;
    const c = this.sec(u);
    return Math.min(y, c.yf - kf(this.s.rs, u) * 0.6 - 0.015);
  }

  // ---- cabine
  cabU(t) {
    const c = this.s.cab;
    return c.s + t * (c.e - c.s);
  }
  cabSec(t) {
    const c = this.s.cab;
    const u = this.cabU(t);
    const wB = kf(c.hwBase, t);
    const belt = this.topY(u, wB);
    let k;
    if (t < c.tW) k = Math.sin(((t / c.tW) * Math.PI) / 2);
    else if (t < c.tR) k = 1;
    else k = Math.cos((((t - c.tR) / (1 - c.tR)) * Math.PI) / 2);
    k = Math.max(0, k);
    const yt = belt + (c.roof - belt) * Math.pow(k, 0.85) + 0.004;
    const h = yt - belt;
    const wR = Math.min(kf(c.hwRoof, t), wB - 0.02);
    const crown = c.crown * Math.min(1, h / 0.3);
    const r = Math.max(0.005, Math.min(c.rRoof, h * 0.4, wR * 0.3));
    return { u, wB, wR, belt, yb: belt - 0.07, yt, h, r, crown };
  }
  cabHalf(t) {
    const key = Math.round(t * 4000);
    const hit = this.cabCache.get(key);
    if (hit) return hit;
    const c = this.cabSec(key / 4000);
    const { wB, wR, yb, yt, r, crown } = c;
    const roofY = (x) => yt - crown * (x / wR) ** 2;
    const xr = wR - r;
    const yA = roofY(xr);
    const slope = (-2 * crown * xr) / (wR * wR);
    const cy = yA + slope * r;
    const ySide = cy - r;
    const pts = [];
    const push = (x, y, seg, v) => pts.push({ x, y, seg, v });
    push(0, yb, 0, 0);
    for (let i = 1; i <= C_FLAT; i++) push((wB * i) / C_FLAT, yb, 0, (0.04 * i) / C_FLAT);
    // lateral: 1 passo até a linha de cintura (escondido), 1 de borracha, o resto vidro/coluna
    const sideAt = (y) => wB + ((wR - wB) * (y - yb)) / Math.max(1e-4, ySide - yb);
    const yBelt = Math.min(c.belt, ySide - 0.004);
    const ySeal = Math.min(c.belt + 0.022, ySide - 0.002);
    push(sideAt(yBelt), yBelt, 1, 0.3);
    push(sideAt(ySeal), ySeal, 1, 0.302);
    for (let i = 1; i <= C_SIDE - 2; i++) {
      const t = i / (C_SIDE - 2);
      const y = ySeal + (ySide - ySeal) * t;
      push(sideAt(y), y, 1, 0.302 + 0.018 * t);
    }
    const vC = Math.max(0.33, 0.5 - TOP_K * xr);
    for (let i = 1; i <= C_CORNER; i++) {
      const t = i / C_CORNER;
      push(quad(wR, wR, xr, t), quad(ySide, cy, yA, t), 2, 0.32 + (vC - 0.32) * t);
    }
    for (let i = 1; i <= C_ROOF; i++) {
      const x = xr * (1 - i / C_ROOF);
      push(x, roofY(x), 3, 0.5 - TOP_K * x);
    }
    if (this.s.cab.cabMod) for (const p of pts) this.s.cab.cabMod(key / 4000, p, c);
    pts.belt = c.belt;
    this.cabCache.set(key, pts);
    return pts;
  }
  // x da lateral da cabine na altura y
  cabSideX(t, y) {
    const h = this.cabHalf(t);
    for (let i = C_FLAT; i < h.length - 1; i++) {
      const a = h[i];
      const b = h[i + 1];
      if (b.y >= y) {
        const k = (y - a.y) / Math.max(1e-6, b.y - a.y);
        return a.x + (b.x - a.x) * k;
      }
    }
    return 0;
  }
}

// Loft (anéis de seções) com grupos de material por quadrilátero.
function loftGeometry(nu, M, pointFn, quadMat, nMats) {
  const pos = new Float32Array((nu + 1) * (M + 1) * 3);
  const uv = new Float32Array((nu + 1) * (M + 1) * 2);
  const col = new Float32Array((nu + 1) * (M + 1) * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i <= nu; i++)
    for (let j = 0; j <= M; j++) {
      const k = i * (M + 1) + j;
      const info = pointFn(i, j, v);
      pos.set([v.x, v.y, v.z], k * 3);
      uv.set(info.uv, k * 2);
      col.set([info.shade, info.shade, info.shade], k * 3);
    }
  const buckets = Array.from({ length: nMats }, () => []);
  for (let i = 0; i < nu; i++)
    for (let j = 0; j < M; j++) {
      const a = i * (M + 1) + j;
      const b = a + 1;
      const c = a + M + 1;
      const d = c + 1;
      buckets[quadMat(i, j)].push(a, c, b, b, c, d);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const index = [];
  let start = 0;
  buckets.forEach((b, m) => {
    index.push(...b);
    g.addGroup(start, b.length, m);
    start += b.length;
  });
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// Tampa (leque) fechando um anel de pontos; orienta a face para `dir`.
function capGeometry(ring, dir) {
  const c = new THREE.Vector3();
  ring.forEach((p) => c.add(p));
  c.divideScalar(ring.length);
  const pos = [c.x, c.y, c.z];
  ring.forEach((p) => pos.push(p.x, p.y, p.z));
  const idx = [];
  for (let j = 0; j < ring.length - 1; j++) idx.push(0, j + 1, j + 2);
  const a = ring[0].clone().sub(c);
  const b = ring[Math.floor(ring.length / 4)].clone().sub(c);
  if (a.cross(b).dot(dir) < 0) for (let k = 0; k < idx.length; k += 3) [idx[k + 1], idx[k + 2]] = [idx[k + 2], idx[k + 1]];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // normais planas (a tampa é plana): evita sombreamento estranho no centro
  const n = g.attributes.normal;
  for (let k = 0; k < n.count; k++) n.setXYZ(k, dir.x, dir.y, dir.z);
  return g;
}

// Contorno 2D com cantos arredondados (para faróis, grades, aberturas).
function polyShape(pts, r) {
  const s = new THREE.Shape();
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n];
    const p1 = pts[i];
    const p2 = pts[(i + 1) % n];
    const l1 = Math.hypot(p0[0] - p1[0], p0[1] - p1[1]);
    const l2 = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
    const rr = Math.min(r, l1 / 2, l2 / 2);
    const a = [p1[0] + ((p0[0] - p1[0]) / l1) * rr, p1[1] + ((p0[1] - p1[1]) / l1) * rr];
    const b = [p1[0] + ((p2[0] - p1[0]) / l2) * rr, p1[1] + ((p2[1] - p1[1]) / l2) * rr];
    if (i === 0) s.moveTo(a[0], a[1]);
    else s.lineTo(a[0], a[1]);
    s.quadraticCurveTo(p1[0], p1[1], b[0], b[1]);
  }
  s.closePath();
  return s;
}

// Placa extrudada a partir de um contorno; a face da frente fica em z = 0.
function plateGeo(pts, r, depth, bevel = 0) {
  const g = new THREE.ExtrudeGeometry(polyShape(pts, r), {
    depth,
    bevelEnabled: bevel > 0,
    bevelSize: bevel,
    bevelThickness: bevel,
    bevelSegments: 2,
    curveSegments: 5,
  });
  g.translate(0, 0, -depth - bevel);
  return g;
}

const mirrorPts = (pts) => pts.map(([x, y]) => [-x, y]).reverse();

// ------------------------------------------------------- materiais comuns
let SHARED = null;
export function sharedMaterials() {
  return shared();
}
function shared() {
  if (SHARED) return SHARED;
  const carbon = TX.carbonTexture();
  const louver = TX.louverTexture();
  louver.repeat.set(6, 6);
  SHARED = {
    chrome: new THREE.MeshStandardMaterial({ color: 0xf2f2f2, metalness: 1, roughness: 0.07 }),
    satin: new THREE.MeshStandardMaterial({ color: 0xb9bcc1, metalness: 1, roughness: 0.3 }),
    blackPlastic: new THREE.MeshStandardMaterial({ color: 0x111113, metalness: 0.05, roughness: 0.6 }),
    gloss: new THREE.MeshPhysicalMaterial({ color: 0x060607, metalness: 0.2, roughness: 0.15, clearcoat: 1 }),
    carbon: new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: carbon, metalness: 0.3, roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.08 }),
    grille: new THREE.MeshStandardMaterial({ color: 0xffffff, map: TX.honeycombTexture(), metalness: 0.3, roughness: 0.55 }),
    louver: new THREE.MeshStandardMaterial({ color: 0xffffff, map: louver, metalness: 0.2, roughness: 0.6 }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x101820,
      metalness: 0,
      roughness: 0.03,
      transparent: true,
      opacity: 0.36,
      envMapIntensity: 1.8,
      clearcoat: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.02, transparent: true, opacity: 0.18, clearcoat: 1, depthWrite: false }),
    redLens: new THREE.MeshPhysicalMaterial({ color: 0xb01010, metalness: 0.1, roughness: 0.06, transparent: true, opacity: 0.5, clearcoat: 1, depthWrite: false }),
    amber: new THREE.MeshPhysicalMaterial({ color: 0xff8a10, emissive: 0x6a2a00, roughness: 0.1, clearcoat: 1 }),
    reflector: new THREE.MeshStandardMaterial({ color: 0xdfe4ea, metalness: 1, roughness: 0.12 }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x151517, roughness: 0.92 }),
    disc: new THREE.MeshStandardMaterial({ color: 0xffffff, map: TX.discTexture(), metalness: 0.85, roughness: 0.4 }),
    darkMetal: new THREE.MeshStandardMaterial({ color: 0x2b2d31, metalness: 0.8, roughness: 0.4 }),
    seat: new THREE.MeshStandardMaterial({ color: 0x1b1b1e, roughness: 0.85 }),
    seatAccent: new THREE.MeshStandardMaterial({ color: 0x8a1010, roughness: 0.8 }),
    suit: new THREE.MeshStandardMaterial({ color: 0x23262c, roughness: 0.8 }),
    visor: new THREE.MeshPhysicalMaterial({ color: 0x080808, metalness: 0.6, roughness: 0.05, clearcoat: 1 }),
    mirror: new THREE.MeshStandardMaterial({ color: 0xdfe6ec, metalness: 1, roughness: 0.0 }),
    exhaustIn: new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 }),
    liner: new THREE.MeshStandardMaterial({ color: 0x0b0b0c, roughness: 1, side: THREE.DoubleSide }),
    // lado de dentro da lataria (portas, painéis) e forro do teto
    innerShell: new THREE.MeshStandardMaterial({ color: 0x1d1e21, roughness: 0.9, side: THREE.BackSide }),
    headliner: new THREE.MeshStandardMaterial({ color: 0x5a5c62, roughness: 0.95, side: THREE.BackSide }),
    hidden: new THREE.MeshBasicMaterial({ visible: false }),
    darkGlass: new THREE.MeshPhysicalMaterial({
      color: 0x05070a,
      metalness: 0.2,
      roughness: 0.02,
      transparent: true,
      opacity: 0.78,
      envMapIntensity: 2.2,
      clearcoat: 1,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
    emissiveWhite: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 2.5 }),
    accentPink: new THREE.MeshStandardMaterial({ color: 0x400010, emissive: 0xff1a6e, emissiveIntensity: 2.2 }),
  };
  return SHARED;
}

function mesh(geo, mat, cast = true) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = false;
  return m;
}

// ------------------------------------------------------------------ rodas
function buildWheel(spec, rimColor, caliperColor, M) {
  const R = spec.wheelR;
  const w = spec.tireW;
  const rimR = R * 0.74;
  const style = spec.wheelStyle;
  // perfil do pneu (raio, eixo) da lateral interna até a externa
  const pts = [];
  const side = (y, r0, r1, n) => {
    for (let k = 0; k < n; k++) {
      const t = k / (n - 1);
      const r = r0 + (r1 - r0) * t;
      pts.push(new THREE.Vector2(r, y + Math.sign(y) * 0.014 * Math.sin(t * Math.PI)));
    }
  };
  const cr = 0.04;
  side(-w / 2, rimR, R - cr, 6);
  for (let k = 1; k <= 5; k++) {
    const a = (k / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(R - cr + Math.sin(a) * cr, -w / 2 + cr - Math.cos(a) * cr));
  }
  const treadStart = pts.length;
  for (let k = 0; k < 7; k++) pts.push(new THREE.Vector2(R, -w / 2 + cr + ((w - 2 * cr) * k) / 6));
  const treadEnd = pts.length - 1;
  for (let k = 1; k <= 5; k++) {
    const a = (k / 6) * (Math.PI / 2);
    pts.push(new THREE.Vector2(R - cr + Math.cos(a) * cr, w / 2 - cr + Math.sin(a) * cr));
  }
  const sideBStart = pts.length;
  side(w / 2, R - cr, rimR, 6);
  const nP = pts.length - 1;
  const tireGeo = new THREE.LatheGeometry(pts, 60);
  tireGeo.rotateZ(-Math.PI / 2);
  const tireTex = TX.tireTexture(treadStart / nP, treadEnd / nP, [(sideBStart + 2.5) / nP, 2.5 / nP]);
  const tireMat = new THREE.MeshStandardMaterial({ map: tireTex, roughness: 0.88, metalness: 0, side: THREE.DoubleSide });

  const pivot = new THREE.Group();
  const mirror = new THREE.Group();
  pivot.add(mirror);
  const spin = new THREE.Group();
  mirror.add(spin);
  spin.add(mesh(tireGeo, tireMat));

  const rimMat = new THREE.MeshPhysicalMaterial({ color: rimColor, metalness: 1, roughness: 0.2, clearcoat: 0.7 });
  const face = w * 0.42; // plano externo do aro
  // tambor do aro (perfil com degrau) e lábio polido
  const barrelPts = [
    new THREE.Vector2(rimR - 0.012, -w * 0.46),
    new THREE.Vector2(rimR, -w * 0.44),
    new THREE.Vector2(rimR - 0.02, -w * 0.1),
    new THREE.Vector2(rimR - 0.02, face - 0.04),
    new THREE.Vector2(rimR + 0.004, face - 0.01),
    new THREE.Vector2(rimR + 0.004, face + 0.005),
    new THREE.Vector2(rimR - 0.012, face + 0.005),
  ];
  const barrel = new THREE.LatheGeometry(barrelPts, 48);
  barrel.rotateZ(-Math.PI / 2);
  spin.add(mesh(barrel, new THREE.MeshStandardMaterial({ color: 0x6a6d72, metalness: 0.9, roughness: 0.3, side: THREE.DoubleSide }), false));
  const lip = new THREE.TorusGeometry(rimR - 0.004, 0.009, 8, 56);
  lip.rotateY(Math.PI / 2);
  const lipM = mesh(lip, style === 'slot5' ? M.chrome : rimMat, false);
  lipM.position.x = face;
  spin.add(lipM);

  // desenho do aro personalizado (módulo do carro) ou um dos desenhos prontos
  const custom = spec.wheelFace
    ? spec.wheelFace({ THREE, TX, spin, mirror, face, rimR, R, w, rimMat, M, mesh, plateGeo, polyShape, rimColor, caliperColor }) !== false
    : false;
  // raios: cada desenho é feito de "réguas" que vão do cubo ao aro, com concavidade
  const hubR = style === 'center10' ? 0.06 : 0.075;
  const spokeLen = rimR - hubR - 0.012;
  const spoke = (angle, width, thick, twist = 0, dish = 0.035) => {
    const g = new THREE.BoxGeometry(thick, spokeLen, width);
    g.translate(0, hubR + spokeLen / 2, 0);
    const m = mesh(g, rimMat, false);
    m.rotation.order = 'XZY';
    m.rotation.x = angle;
    m.rotation.z = -Math.atan2(dish, spokeLen); // raio inclinado: o centro fica mais "fundo"
    m.rotation.y = twist;
    m.position.x = face - 0.012;
    spin.add(m);
  };
  if (custom) {
    // nada: o módulo do carro já desenhou a face do aro
  } else if (style === 'center10') {
    for (let k = 0; k < 10; k++) spoke((k / 10) * Math.PI * 2, 0.026, 0.022);
  } else if (style === 'y5') {
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      spoke(a, 0.04, 0.026);
      spoke(a + 0.2, 0.02, 0.02, 0, 0.03);
      spoke(a - 0.2, 0.02, 0.02, 0, 0.03);
    }
  } else if (style === 'slot5') {
    // aro "slot" clássico: disco com cinco janelas
    const disk = new THREE.Shape();
    disk.absarc(0, 0, rimR - 0.006, 0, Math.PI * 2, false);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2 + Math.PI / 5;
      const hole = new THREE.Path();
      const cx = Math.cos(a) * rimR * 0.6;
      const cy = Math.sin(a) * rimR * 0.6;
      hole.absellipse(cx, cy, rimR * 0.28, rimR * 0.13, 0, Math.PI * 2, true, a);
      disk.holes.push(hole);
    }
    const dg = new THREE.ExtrudeGeometry(disk, { depth: 0.012, bevelEnabled: false, curveSegments: 20 });
    dg.rotateY(Math.PI / 2);
    const dm = mesh(dg, rimMat, false);
    dm.position.x = face - 0.03;
    spin.add(dm);
  } else {
    // split5: cinco pares de raios finos
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      spoke(a - 0.09, 0.024, 0.024);
      spoke(a + 0.09, 0.024, 0.024);
    }
  }
  // cubo, porcas / porca central e calota
  const hub = new THREE.CylinderGeometry(hubR, hubR + 0.008, 0.05, 28);
  hub.rotateZ(Math.PI / 2);
  const hubM = mesh(hub, rimMat, false);
  hubM.position.x = face - 0.03;
  spin.add(hubM);
  if (custom) {
    // o módulo cuida do centro da roda
  } else if (style === 'center10') {
    const nut = new THREE.CylinderGeometry(0.034, 0.038, 0.035, 6);
    nut.rotateZ(Math.PI / 2);
    const nm = mesh(nut, M.satin, false);
    nm.position.x = face;
    spin.add(nm);
    const pin = new THREE.TorusGeometry(0.024, 0.004, 6, 16);
    pin.rotateY(Math.PI / 2);
    const pm = mesh(pin, new THREE.MeshStandardMaterial({ color: 0xd01d1d, roughness: 0.4 }), false);
    pm.position.x = face + 0.019;
    spin.add(pm);
  } else {
    const nutGeo = new THREE.CylinderGeometry(0.01, 0.011, 0.025, 6);
    nutGeo.rotateZ(Math.PI / 2);
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * Math.PI * 2;
      const n = mesh(nutGeo, M.chrome, false);
      n.position.set(face - 0.002, Math.cos(a) * 0.048, Math.sin(a) * 0.048);
      spin.add(n);
    }
    const cap = new THREE.CylinderGeometry(0.026, 0.028, 0.02, 20);
    cap.rotateZ(Math.PI / 2);
    const capM = mesh(cap, style === 'slot5' ? M.chrome : new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.5, roughness: 0.3 }), false);
    capM.position.x = face + 0.002;
    spin.add(capM);
  }
  // disco de freio perfurado com "chapéu"
  const discR = rimR * 0.84;
  const disc = new THREE.CylinderGeometry(discR, discR, 0.032, 48);
  disc.rotateZ(Math.PI / 2);
  const discM = mesh(disc, M.disc, false);
  discM.position.x = w * 0.06;
  spin.add(discM);
  const hat = new THREE.CylinderGeometry(rimR * 0.4, rimR * 0.4, 0.07, 24);
  hat.rotateZ(Math.PI / 2);
  const hatM = mesh(hat, M.darkMetal, false);
  hatM.position.x = w * 0.15;
  spin.add(hatM);
  // pinça de 6 pistões (não gira): arco que abraça o disco
  const calMat = new THREE.MeshStandardMaterial({ color: caliperColor, metalness: 0.3, roughness: 0.32 });
  const calGeo = new THREE.TorusGeometry(discR - 0.03, 0.036, 8, 12, 0.9);
  calGeo.rotateY(Math.PI / 2);
  const cal = mesh(calGeo, calMat, false);
  cal.scale.set(1.5, 1, 1);
  cal.position.x = w * 0.08;
  cal.rotation.x = 1.75;
  mirror.add(cal);
  return { pivot, mirror, spin };
}

// Mescla malhas sem animação que compartilham material em uma só geometria.
function mergeStatic(root, keep) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const buckets = new Map();
  const remove = [];
  root.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material) || o === root) return;
    for (let p = o; p && p !== root; p = p.parent) if (keep.has(p)) return;
    const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld);
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
    g.applyMatrix4(m);
    if (m.determinant() < 0) {
      for (const name of Object.keys(g.attributes)) {
        const a = g.attributes[name];
        for (let t = 0; t < a.count; t += 3)
          for (let c = 0; c < a.itemSize; c++) {
            const v = a.array[(t + 1) * a.itemSize + c];
            a.array[(t + 1) * a.itemSize + c] = a.array[(t + 2) * a.itemSize + c];
            a.array[(t + 2) * a.itemSize + c] = v;
          }
      }
    }
    const key = o.material.uuid + (o.castShadow ? 's' : 'n');
    if (!buckets.has(key)) buckets.set(key, { mat: o.material, cast: o.castShadow, list: [] });
    buckets.get(key).list.push(g);
    remove.push(o);
  });
  for (const o of remove) {
    o.removeFromParent();
    o.geometry.dispose();
  }
  for (const { mat, cast, list } of buckets.values()) {
    let n = 0;
    for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3);
    const nor = new Float32Array(n * 3);
    const uv = new Float32Array(n * 2);
    const col = mat.vertexColors ? new Float32Array(n * 3).fill(1) : null;
    let off = 0;
    for (const g of list) {
      const c = g.attributes.position.count;
      pos.set(g.attributes.position.array, off * 3);
      if (g.attributes.normal) nor.set(g.attributes.normal.array, off * 3);
      if (g.attributes.uv) uv.set(g.attributes.uv.array, off * 2);
      if (col && g.attributes.color) col.set(g.attributes.color.array, off * 3);
      off += c;
      g.dispose();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = cast;
    root.add(mesh);
  }
}

// ------------------------------------------------------------------- carro
export function buildCar(model, colorDef, number = 7, variant = 0) {
  const M = shared();
  const S = new CarShape(model);
  const st = model.style;
  const skip = model.skip || {};
  const root = new THREE.Group();
  const L = model.length;
  const livery = TX.liveryTexture({
    color: colorDef.color,
    stripeColor: colorDef.stripe,
    sponsorColor: colorDef.sponsor,
    stripes: model.stripes,
    sideStripe: model.sideStripe,
    doorLines: model.doorLines,
    hoodLine: model.hoodLine,
    hoodHalf: model.hoodHalf,
    trunkLine: model.trunkLine,
    trunkHalf: model.trunkHalf,
    numberU: model.numberU,
    rearU: model.rearU,
    number,
    ...(model.livery || {}),
  });
  const paint = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: livery,
    vertexColors: true,
    metalness: 0.5,
    roughness: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.25,
  });
  const paintPlain = new THREE.MeshPhysicalMaterial({
    color: colorDef.color,
    metalness: 0.5,
    roughness: 0.28,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.25,
  });

  // ---- carroceria
  const NU = 220;
  const MR = 2 * (K_BODY - 1);
  const xin = model.trackHalf - model.tireW / 2 - 0.06; // parede interna da caixa de roda
  const flare = model.flare || 0;
  const archCut = new Uint8Array((NU + 1) * (MR + 1));
  const body = loftGeometry(
    NU,
    MR,
    (i, j, v) => {
      const u = i / NU;
      const h = S.halfPath(u);
      const mirrored = j > K_BODY - 1;
      const p = h[mirrored ? MR - j : j];
      let x = p.x;
      let y = p.y;
      const z = S.z(u);
      const shade = p.seg === SEG_FLAT ? 0.18 : 1;
      let vOut = p.v;
      // caixas de roda: os vértices abaixo do arco "deitam" sobre a curva do arco.
      // Os quadriláteros totalmente dentro dela viram buraco (fechado pela caixa preta),
      // e a borda da carroceria acompanha exatamente a curva.
      archCut[i * (MR + 1) + j] = 0;
      if (p.seg <= SEG_SHOULDER && x > xin) {
        const ay = S.arch(z, u);
        if (y < ay) {
          y = ay;
          archCut[i * (MR + 1) + j] = 1;
          // usa o V do primeiro ponto acima do arco: a pintura não estica sobre a borda
          for (let k = (mirrored ? MR - j : j) + 1; k < h.length; k++)
            if (h[k].y >= ay) {
              vOut = h[k].v;
              break;
            }
        }
      }
      // lábio alargado em volta das caixas de roda
      if (flare && (p.seg === SEG_SIDE || p.seg === SEG_SHOULDER) && !archCut[i * (MR + 1) + j]) {
        for (const zw of [S.zF, S.zR]) {
          const d = Math.hypot(z - zw, y - S.yc);
          const k = (d - S.rA + 0.02) / 0.16;
          if (k > 0 && k < 1 && y > S.yc - 0.05) x += flare * Math.sin(Math.PI * k) ** 2 * (p.seg === SEG_SIDE ? 1 : 0.6);
        }
      }
      v.set(mirrored ? -x : x, y, z);
      return { uv: [u, mirrored ? 1 - vOut : vOut], shade };
    },
    (i, j) => {
      const k = i * (MR + 1) + j;
      return archCut[k] && archCut[k + 1] && archCut[k + MR + 1] && archCut[k + MR + 2] ? 1 : 0;
    },
    2,
  );
  const bodyMesh = mesh(body, [paint, M.hidden]);
  // a mesma geometria vista por dentro (portas, caixas de roda) — compartilha os amassados
  root.add(mesh(body, [M.innerShell, M.hidden], false));
  root.add(bodyMesh);
  const ringAt = (u) => {
    const h = S.halfPath(u);
    const r = [];
    for (let j = 0; j <= MR; j++) {
      const mirrored = j > K_BODY - 1;
      const p = h[mirrored ? MR - j : j];
      r.push(new THREE.Vector3(mirrored ? -p.x : p.x, p.y, S.z(u)));
    }
    return r;
  };
  root.add(mesh(capGeometry(ringAt(0), new THREE.Vector3(0, 0, 1)), paintPlain));
  root.add(mesh(capGeometry(ringAt(1), new THREE.Vector3(0, 0, -1)), paintPlain));

  // peças que podem se soltar em batidas
  const parts = [];
  const part = (name, threshold) => {
    const g = new THREE.Group();
    g.name = name;
    root.add(g);
    parts.push({ group: g, name, threshold, dmg: 0, attached: true, center: new THREE.Vector3() });
    return g;
  };

  // posiciona um grupo na frente/traseira/topo/lateral com +z local saindo da superfície
  const Z = new THREE.Vector3(0, 0, 1);
  const onFront = (x, y, out = 0.004) => {
    const g = new THREE.Group();
    const n = S.endNormal(x, y, false);
    g.position.set(x, y, S.frontZ(x, y)).addScaledVector(n, out);
    g.quaternion.setFromUnitVectors(Z, n);
    return g;
  };
  const onRear = (x, y, out = 0.004) => {
    const g = new THREE.Group();
    const n = S.endNormal(x, y, true);
    g.position.set(x, y, S.rearZ(x, y)).addScaledVector(n, out);
    // constrói olhando para +z e gira 180° (mantendo o "para cima")
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, -1), n);
    g.quaternion.copy(q).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
    return g;
  };
  const onTop = (u, x, out = 0.003) => {
    const g = new THREE.Group();
    const n = S.topNormal(u, x);
    g.position.set(x, S.topY(u, x), S.z(u)).addScaledVector(n, out);
    // +z local = normal; +y local aponta para a frente do carro
    const m = new THREE.Matrix4();
    const fwd = new THREE.Vector3(0, 0, 1).addScaledVector(n, -n.z).normalize();
    const side = new THREE.Vector3().crossVectors(fwd, n);
    m.makeBasis(side, fwd, n);
    g.quaternion.setFromRotationMatrix(m);
    return g;
  };
  const onSide = (u, y, sgn, out = 0.003) => {
    const g = new THREE.Group();
    const n = S.sideNormal(u, y);
    n.x *= sgn;
    g.position.set(sgn * S.sideX(u, y), y, S.z(u)).addScaledVector(n, out);
    // +z local = normal; +x local aponta para trás (texto legível dos dois lados)
    const back = new THREE.Vector3(0, 0, -1).addScaledVector(n, n.z).normalize();
    if (sgn < 0) back.negate();
    const up = new THREE.Vector3().crossVectors(n, back);
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(back, up, n));
    return g;
  };

  // ---- cabine (vidros + colunas + teto)
  const cab = model.cab;
  const NT = 70;
  const MC = 2 * (K_CAB - 1);
  const cabPt = (t, j) => {
    const h = S.cabHalf(t);
    const mirrored = j > K_CAB - 1;
    return { p: h[mirrored ? MC - j : j], mirrored };
  };
  const winEnd = cab.winEnd;
  const glassMat = cab.darkGlass ? M.darkGlass : M.glass;
  const roofIdx = cab.roofMat === 'carbon' ? 3 : cab.roofMat === 'gloss' ? 2 : 0;
  const cabGeo = loftGeometry(
    NT,
    MC,
    (i, j, v) => {
      const t = i / NT;
      const { p, mirrored } = cabPt(t, j);
      v.set(mirrored ? -p.x : p.x, p.y, S.z(S.cabU(t)));
      return { uv: [S.cabU(t), mirrored ? 1 - p.v : p.v], shade: 1 };
    },
    (i, j) => {
      const t = (i + 0.5) / NT;
      const ja = j > K_CAB - 1 ? MC - j : j;
      const jb = j + 1 > K_CAB - 1 ? MC - j - 1 : j + 1;
      const h = S.cabHalf(t);
      const seg = h[Math.max(ja, jb)].seg;
      const def = cabDefault(t, seg, ja, jb, h);
      // 0 pintura, 1 vidro, 2 preto brilhante, 3 carbono; o módulo do carro pode trocar
      if (cab.matFn) return cab.matFn({ t, seg, j: Math.max(ja, jb), inner: Math.max(ja, jb) > K_CAB - 1 - C_ROOF - C_CORNER / 2, def, K: K_CAB, C_ROOF, C_CORNER });
      return def === 0 && (seg === 3 || seg === 2) && roofIdx ? roofIdx : def;
    },
    4,
  );
  function cabDefault(t, seg, ja, jb, h) {
      if (seg === 0) return 2;
      if (seg === 1) {
        if (Math.max(ja, jb) <= C_FLAT + 2) return 2; // abaixo da cintura e borracha do vidro
        const bp = cab.bPillar && t > cab.bPillar[0] && t < cab.bPillar[1];
        if (t > 0.05 && t < winEnd && !bp) return 1;
        return 0;
      }
      if (seg === 2) {
        // metade interna do canto: o vidro "abraça" a borda; a externa é a coluna
        const inner = Math.max(ja, jb) > K_CAB - 1 - C_ROOF - C_CORNER / 2;
        if (inner && t > 0.035 && t < cab.tW - 0.03) return 1;
        if (inner && t > cab.tR + 0.045 && t < 0.955) return 1;
        return 0;
      }
      // teto: para-brisa e vidro traseiro, com borda preta (serigrafia)
      if (t > 0.026 && t < cab.tW - 0.022) return 1;
      if ((t > 0.012 && t <= 0.026) || (t >= cab.tW - 0.022 && t < cab.tW - 0.008)) return 2;
      if (t > cab.tR + 0.035 && t < 0.965) return 1;
      if ((t > cab.tR + 0.018 && t <= cab.tR + 0.035) || (t >= 0.965 && t < 0.98)) return 2;
      return 0;
  }
  const cabMesh = mesh(cabGeo, [paint, glassMat, M.gloss, M.carbon]);
  root.add(cabMesh);
  root.add(mesh(cabGeo, [M.headliner, M.hidden, M.headliner, M.headliner], false));

  // ---- rodas e caixas de roda
  const rimColor = model.rimColor || RIM_COLORS[variant % RIM_COLORS.length];
  const calColor = model.caliperColor || CALIPER_COLORS[(variant + 1) % CALIPER_COLORS.length];
  const wheels = [];
  for (const front of [true, false])
    for (const sgn of [1, -1]) {
      const w = buildWheel(model, rimColor, calColor, M);
      w.mirror.scale.x = sgn;
      w.pivot.position.set(sgn * model.trackHalf, model.wheelR, front ? S.zF : S.zR);
      root.add(w.pivot);
      wheels.push({ ...w, front, side: sgn, baseY: model.wheelR });
    }
  for (const zw of [S.zF, S.zR]) {
    const u = S.u(zw);
    for (const sgn of [1, -1]) {
      const xo = S.sideX(u, S.yc) - 0.03;
      const len = Math.max(0.1, xo - xin);
      const lg = new THREE.CylinderGeometry(S.rA - 0.004, S.rA - 0.004, len, 32, 1, true, 0, Math.PI);
      lg.rotateZ(Math.PI / 2);
      const l = mesh(lg, M.liner, false);
      l.position.set(sgn * (xin + len / 2), S.yc, zw);
      root.add(l);
      const dg = new THREE.CircleGeometry(S.rA - 0.004, 24, 0, Math.PI);
      dg.rotateY(Math.PI / 2);
      const d = mesh(dg, M.liner, false);
      d.position.set(sgn * xin, S.yc, zw);
      root.add(d);
    }
  }

  // ---- luzes (materiais por carro: acendem/apagam)
  const headMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e6, emissiveIntensity: 1.6 });
  const drlMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe6f2ff, emissiveIntensity: 3 });
  const brakeMat = new THREE.MeshStandardMaterial({ color: 0x5a0000, emissive: 0xff0a0a, emissiveIntensity: 1.1 });
  const revMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffffff, emissiveIntensity: 0 });

  const f0 = S.sec(0.004);
  const front = {
    yb: f0.yb,
    yt: Math.min(f0.yt, f0.yf),
    hw: f0.hw,
  };
  const r0 = S.sec(0.996);
  const rear = { yb: r0.yb, yt: Math.min(r0.yt, r0.yf), hw: r0.hw };

  // farol: carcaça preta, refletor, projetores, DRL e lente — contorno por modelo
  const headlight = (sgn, outline, opts = {}) => {
    const pts = sgn > 0 ? outline : mirrorPts(outline);
    const g = new THREE.Group();
    g.add(mesh(plateGeo(pts, 0.02, 0.05), M.gloss, false));
    const inner = mesh(plateGeo(pts, 0.02, 0.004), M.reflector, false);
    inner.scale.set(0.92, 0.85, 1);
    inner.position.z = 0.003;
    g.add(inner);
    const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
    const cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
    const nProj = opts.projectors ?? 2;
    const spread = opts.spread ?? 0.08;
    for (let k = 0; k < nProj; k++) {
      const px = cx + (k - (nProj - 1) / 2) * spread * sgn;
      const bowl = mesh(new THREE.SphereGeometry(opts.bowl ?? 0.034, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), M.chrome, false);
      bowl.rotation.x = Math.PI / 2;
      bowl.position.set(px, cy + (opts.projY ?? 0), 0.006);
      bowl.scale.y = 0.5;
      g.add(bowl);
      const bulb = mesh(new THREE.SphereGeometry((opts.bowl ?? 0.034) * 0.55, 14, 10), headMat, false);
      bulb.position.set(px, cy + (opts.projY ?? 0), 0.012);
      bulb.scale.z = 0.5;
      g.add(bulb);
    }
    if (opts.drl) {
      for (const seg of opts.drl) {
        const d = sgn > 0 ? seg : mirrorPts(seg);
        const dm = mesh(plateGeo(d, 0.004, 0.01), drlMat, false);
        dm.position.z = 0.01;
        g.add(dm);
      }
    }
    const lens = mesh(plateGeo(pts, 0.02, 0.012), M.lens, false);
    lens.position.z = 0.016;
    g.add(lens);
    return g;
  };

  // lanterna: carcaça, lente vermelha e LEDs que acendem ao frear
  const taillight = (sgn, outline, leds, opts = {}) => {
    const pts = sgn > 0 ? outline : mirrorPts(outline);
    const g = new THREE.Group();
    g.add(mesh(plateGeo(pts, opts.r ?? 0.015, 0.045), M.gloss, false));
    for (const seg of leds) {
      const d = sgn > 0 ? seg : mirrorPts(seg);
      const lm = mesh(plateGeo(d, 0.006, 0.01), brakeMat, false);
      lm.position.z = 0.006;
      g.add(lm);
    }
    const lens = mesh(plateGeo(pts, opts.r ?? 0.015, 0.01), M.redLens, false);
    lens.position.z = 0.014;
    g.add(lens);
    return g;
  };

  // ---- frente
  const bumperG = part('para-choque dianteiro', 22);
  const fy = (k) => front.yb + (front.yt - front.yb) * k; // altura relativa na frente
  const fw = front.hw;
  if (st === 'gt' || st === 'raio' || st === 'eagle') {
    // faróis no canto superior da frente
    const shapes = {
      gt: [[-0.17, -0.04], [0.06, -0.05], [0.17, 0.0], [0.13, 0.05], [-0.15, 0.04]],
      raio: [[-0.19, -0.02], [0.12, -0.035], [0.2, 0.0], [0.17, 0.03], [-0.17, 0.025]],
      eagle: [[-0.16, -0.035], [0.15, -0.045], [0.17, 0.03], [-0.15, 0.04]],
    };
    const drls = {
      gt: [[[-0.14, -0.038], [0.05, -0.046], [0.05, -0.036], [-0.14, -0.028]]],
      raio: [[[-0.17, -0.016], [0.13, -0.03], [0.13, -0.022], [-0.17, -0.008]]],
      eagle: [[[-0.14, 0.024], [0.13, 0.016], [0.13, 0.026], [-0.14, 0.034]]],
    };
    for (const sgn of [1, -1]) {
      const hp = part(sgn > 0 ? 'farol esquerdo' : 'farol direito', 14);
      const x = sgn * fw * (st === 'raio' ? 0.66 : 0.6);
      const y = fy(st === 'eagle' ? 0.8 : 0.78);
      const g = onFront(x, y, 0.006);
      g.add(headlight(sgn, shapes[st], { drl: drls[st], projectors: st === 'raio' ? 3 : 2, spread: st === 'raio' ? 0.07 : 0.085, bowl: st === 'raio' ? 0.024 : 0.032 }));
      hp.add(g);
      if (st === 'eagle') {
        // três "presas" verticais de LED abaixo do farol
        for (let k = 0; k < 3; k++) {
          const fx = sgn * fw * (0.74 - k * 0.07);
          const fg = onFront(fx, fy(0.47) + k * 0.012, 0.004);
          fg.add(mesh(plateGeo([[-0.008, -0.045], [0.008, -0.045], [0.008, 0.045], [-0.008, 0.045]], 0.004, 0.01), drlMat, false));
          fg.rotation.z += sgn * 0.12;
          hp.add(fg);
        }
      }
    }
  }
  if (st === 'gt') {
    // entrada de ar inferior larga, tomadas laterais, splitter e canards
    const g = onFront(0, fy(0.34), 0.002);
    g.add(mesh(plateGeo([[-0.5, -0.09], [0.5, -0.09], [0.44, 0.08], [-0.44, 0.08]], 0.04, 0.05), M.grille, false));
    bumperG.add(g);
    for (const sgn of [1, -1]) {
      const sg = onFront(sgn * fw * 0.7, fy(0.32), 0.002);
      sg.add(mesh(plateGeo(sgn > 0 ? [[-0.07, -0.08], [0.1, -0.06], [0.08, 0.06], [-0.06, 0.05]] : mirrorPts([[-0.07, -0.08], [0.1, -0.06], [0.08, 0.06], [-0.06, 0.05]]), 0.02, 0.05), M.grille, false));
      bumperG.add(sg);
      for (let k = 0; k < 2; k++) {
        const c = mesh(new THREE.BoxGeometry(0.16, 0.008, 0.12), M.carbon);
        const cy = fy(0.45 + k * 0.22);
        c.position.set(sgn * (S.sideX(0.03, cy) - 0.01), cy, S.z(0.03) - 0.02);
        c.rotation.set(0.05, sgn * 0.35, sgn * 0.18);
        bumperG.add(c);
      }
    }
  } else if (st === 'raio') {
    const g = onFront(0, fy(0.3), 0.002);
    g.add(mesh(plateGeo([[-0.28, -0.07], [0.28, -0.07], [0.22, 0.06], [-0.22, 0.06]], 0.03, 0.05), M.grille, false));
    bumperG.add(g);
    for (const sgn of [1, -1]) {
      const pts = [[-0.12, -0.1], [0.14, -0.08], [0.12, 0.08], [-0.1, 0.06]];
      const sg = onFront(sgn * fw * 0.62, fy(0.38), 0.002);
      sg.add(mesh(plateGeo(sgn > 0 ? pts : mirrorPts(pts), 0.03, 0.05), M.gloss, false));
      for (let k = 0; k < 3; k++) {
        const fin = mesh(new THREE.BoxGeometry(0.012, 0.15, 0.04), paintPlain, false);
        fin.position.set(sgn * (-0.06 + k * 0.07), -0.01, -0.01);
        sg.add(fin);
      }
      bumperG.add(sg);
    }
  } else if (st === 'eagle') {
    // grade trapezoidal "nariz de tubarão" com emblema e entrada inferior
    const g = onFront(0, fy(0.62), 0.002);
    g.add(mesh(plateGeo([[-0.36, -0.12], [0.36, -0.12], [0.3, 0.11], [-0.3, 0.11]], 0.04, 0.05), M.grille, false));
    const em = new THREE.Shape();
    em.moveTo(-0.1, 0.02);
    em.lineTo(-0.02, 0.012);
    em.lineTo(0, 0.04);
    em.lineTo(0.02, 0.012);
    em.lineTo(0.1, 0.02);
    em.lineTo(0.035, -0.006);
    em.lineTo(0, -0.04);
    em.lineTo(-0.035, -0.006);
    em.closePath();
    const emM = mesh(new THREE.ExtrudeGeometry(em, { depth: 0.01, bevelEnabled: false }), M.chrome, false);
    emM.position.z = 0.003;
    g.add(emM);
    bumperG.add(g);
    const lo = onFront(0, fy(0.2), 0.002);
    lo.add(mesh(plateGeo([[-0.5, -0.05], [0.5, -0.05], [0.46, 0.05], [-0.46, 0.05]], 0.03, 0.05), M.grille, false));
    bumperG.add(lo);
  } else if (st === 'muscle') {
    // grade de largura total com quatro faróis redondos e para-choque cromado
    const g = onFront(0, fy(0.62), 0.002);
    g.add(mesh(plateGeo([[-fw * 0.9, -0.1], [fw * 0.9, -0.1], [fw * 0.9, 0.1], [-fw * 0.9, 0.1]], 0.03, 0.05), M.grille, false));
    const frame = mesh(plateGeo([[-fw * 0.92, -0.115], [fw * 0.92, -0.115], [fw * 0.92, 0.115], [-fw * 0.92, 0.115]], 0.035, 0.02), M.chrome, false);
    frame.position.z = -0.012;
    g.add(frame);
    bumperG.add(g);
    for (const sgn of [1, -1]) {
      const hp = part(sgn > 0 ? 'farol esquerdo' : 'farol direito', 14);
      for (const k of [0, 1]) {
        const x = sgn * fw * (0.7 - k * 0.22);
        const lg = onFront(x, fy(0.62), 0.004);
        const ring = mesh(new THREE.TorusGeometry(0.068, 0.012, 10, 28), M.chrome, false);
        lg.add(ring);
        const refl = mesh(new THREE.CircleGeometry(0.066, 24), M.reflector, false);
        refl.position.z = -0.01;
        lg.add(refl);
        const bulb = mesh(new THREE.SphereGeometry(0.03, 14, 10), headMat, false);
        bulb.position.z = -0.005;
        bulb.scale.z = 0.4;
        lg.add(bulb);
        const lens = mesh(new THREE.SphereGeometry(0.068, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), M.lens, false);
        lens.rotation.x = Math.PI / 2;
        lens.scale.y = 0.3;
        lg.add(lens);
        hp.add(lg);
      }
    }
    // para-choque cromado envolvendo os cantos
    const by = fy(0.3);
    const bump = new THREE.Group();
    const bar = mesh(new THREE.CapsuleGeometry(0.04, fw * 1.75, 6, 12), M.chrome);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, by, S.frontZ(0, by) + 0.025);
    bump.add(bar);
    for (const sgn of [1, -1]) {
      const end = mesh(new THREE.CapsuleGeometry(0.04, 0.2, 6, 10), M.chrome);
      end.rotation.x = Math.PI / 2;
      end.position.set(sgn * (S.sideX(0.02, by) + 0.01), by, S.z(0.02) - 0.07);
      bump.add(end);
    }
    bumperG.add(bump);
    const val = onFront(0, fy(0.12), 0.002);
    val.add(mesh(plateGeo([[-0.3, -0.03], [0.3, -0.03], [0.28, 0.03], [-0.28, 0.03]], 0.02, 0.04), M.grille, false));
    bumperG.add(val);
  }
  // splitter fino sob o para-choque (todos menos o muscle)
  if (st !== 'muscle' && !skip.splitter) {
    const spY = front.yb + 0.004;
    const spw = S.sec(0.05).hw * 1.82;
    const z0 = S.frontZ(0, spY + 0.04);
    const sp = mesh(new THREE.BoxGeometry(spw, 0.014, 0.34), st === 'gt' ? M.carbon : M.gloss);
    sp.position.set(0, spY, z0 - 0.13);
    bumperG.add(sp);
  }

  // ---- capô: aberturas, ressalto, tomada de ar
  if (st === 'gt') {
    for (const sgn of [1, -1]) {
      const g = onTop(model.frontU + 0.03, sgn * 0.36, 0.002);
      g.add(mesh(plateGeo([[-0.13, -0.11], [0.13, -0.09], [0.11, 0.11], [-0.11, 0.1]], 0.03, 0.02), M.louver, false));
      root.add(g);
    }
  } else if (st === 'raio') {
    for (const sgn of [1, -1]) {
      const g = onTop(0.09, sgn * 0.3, 0.002);
      g.add(mesh(plateGeo([[-0.12, -0.05], [0.12, -0.04], [0.1, 0.05], [-0.1, 0.05]], 0.02, 0.02), M.gloss, false));
      root.add(g);
    }
    // tampa do motor com venezianas embutidas atrás da cabine
    const eu = (cab.e + 0.93) / 2;
    for (const sgn of [1, -1]) {
      const g = onTop(eu, sgn * 0.17, 0.004);
      g.add(mesh(plateGeo([[-0.13, -0.2], [0.13, -0.2], [0.12, 0.2], [-0.12, 0.2]], 0.03, 0.03), M.louver, false));
      root.add(g);
    }
  } else if (st === 'eagle') {
    for (const sgn of [1, -1]) {
      const g = onTop(model.frontU + 0.04, sgn * 0.44, 0.002);
      g.add(mesh(plateGeo([[-0.09, -0.12], [0.09, -0.1], [0.08, 0.1], [-0.08, 0.08]], 0.03, 0.02), M.louver, false));
      root.add(g);
    }
  } else if (st === 'muscle') {
    const su = 0.22;
    const sy = S.topY(su, 0);
    const slope = Math.atan2(S.topY(su + 0.05, 0) - S.topY(su - 0.05, 0), 0.1 * L);
    const scoopG = new THREE.Group();
    const sh = new THREE.Shape();
    sh.moveTo(-0.3, 0);
    sh.lineTo(0.3, 0);
    sh.lineTo(0.26, 0.11);
    sh.lineTo(-0.26, 0.11);
    sh.closePath();
    const sGeo = new THREE.ExtrudeGeometry(sh, { depth: 0.62, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 3 });
    sGeo.translate(0, 0, -0.31);
    scoopG.add(mesh(sGeo, paintPlain));
    const mouth = mesh(plateGeo([[-0.24, 0.015], [0.24, 0.015], [0.21, 0.095], [-0.21, 0.095]], 0.015, 0.03), M.grille, false);
    mouth.position.z = 0.335;
    scoopG.add(mouth);
    scoopG.position.set(0, sy - 0.01, S.z(su));
    scoopG.rotation.x = slope;
    part('tomada de ar do capô', 26).add(scoopG);
    for (const sgn of [1, -1]) {
      const pin = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.008, 16), M.chrome, false);
      const pu = 0.04;
      pin.position.set(sgn * 0.55, S.topY(pu, 0.55) + 0.003, S.z(pu));
      root.add(pin);
    }
  }

  // ---- laterais: saias, aberturas, maçanetas, retrovisores, tampa do tanque
  const uMid = (model.frontU + model.rearU) / 2;
  const skirtLen = S.zF - S.zR - 2 * (S.rA + 0.06);
  for (const sgn of [1, -1]) {
    const sy = S.sec(uMid).yb + 0.05;
    if (!skip.skirts) {
    const skirt = mesh(new THREE.BoxGeometry(0.05, 0.07, skirtLen), st === 'muscle' ? M.chrome : st === 'gt' ? M.carbon : M.gloss);
    if (st === 'muscle') skirt.scale.set(0.3, 0.3, 1);
    skirt.position.set(sgn * (S.sideX(uMid, sy) - (st === 'muscle' ? -0.004 : 0.012)), sy, (S.zF + S.zR) / 2);
    part(sgn > 0 ? 'saia esquerda' : 'saia direita', 22).add(skirt);
    }
    // abertura atrás da roda dianteira (GT, Eagle) / entrada grande antes da traseira (Raio, Eagle)
    if (st === 'gt' || st === 'eagle') {
      const vu = model.frontU + (S.rA + 0.16) / L;
      const g = onSide(vu, S.yc + 0.13, sgn, 0.002);
      g.add(mesh(plateGeo([[-0.09, -0.06], [0.11, -0.05], [0.09, 0.06], [-0.1, 0.05]], 0.02, 0.02), M.louver, false));
      root.add(g);
    }
    if (st === 'raio' || st === 'eagle') {
      const su = model.rearU - (S.rA + (st === 'raio' ? 0.38 : 0.26)) / L;
      const g = onSide(su, S.yc + (st === 'raio' ? 0.16 : 0.12), sgn, 0.002);
      const pts = st === 'raio' ? [[-0.26, -0.16], [0.24, -0.12], [0.2, 0.14], [-0.04, 0.12]] : [[-0.14, -0.05], [0.14, -0.03], [0.12, 0.06], [-0.12, 0.05]];
      g.add(mesh(plateGeo(pts, 0.04, 0.05), M.gloss, false));
      if (st === 'raio')
        for (let k = 0; k < 3; k++) {
          const fin = mesh(new THREE.BoxGeometry(0.4, 0.012, 0.03), paintPlain, false);
          fin.position.set(0.02, -0.08 + k * 0.08, -0.01);
          fin.rotation.z = -0.08;
          g.add(fin);
        }
      root.add(g);
    }
    // maçaneta embutida
    if (skip.handles) continue;
    const hu = model.doorLines[1] - 0.045;
    const hy = S.cabHalf((hu - cab.s) / (cab.e - cab.s)).belt - 0.08;
    const hg = onSide(hu, hy, sgn, 0.001);
    hg.add(mesh(plateGeo([[-0.075, -0.012], [0.075, -0.012], [0.075, 0.012], [-0.075, 0.012]], 0.01, 0.012), st === 'muscle' ? M.chrome : M.gloss, false));
    root.add(hg);
    // luz de posição lateral (âmbar na frente)
    if (skip.markers) continue;
    const mg = onSide(0.06, front.yb + (front.yt - front.yb) * 0.55, sgn, 0.001);
    mg.add(mesh(plateGeo([[-0.04, -0.012], [0.04, -0.012], [0.04, 0.012], [-0.04, 0.012]], 0.008, 0.01), M.amber, false));
    root.add(mg);
  }
  if (!skip.fuel) {
    const fu = model.rearU - (S.rA + 0.2) / L;
    const fyy = S.cabHalf(Math.min(0.98, (fu - cab.s) / (cab.e - cab.s))).belt - 0.1;
    const g = onSide(fu, fyy, 1, 0.001);
    const fuel = mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.012, 24), st === 'muscle' ? M.chrome : M.satin, false);
    fuel.rotation.x = Math.PI / 2;
    g.add(fuel);
    root.add(g);
  }
  // retrovisores presos à porta, na base da coluna A
  if (!skip.mirrors) {
    const t = 0.1;
    const mu = S.cabU(t);
    const ch = S.cabHalf(t);
    const my = ch.belt + 0.08;
    for (const sgn of [1, -1]) {
      const mg = part(sgn > 0 ? 'retrovisor esquerdo' : 'retrovisor direito', 12);
      const x0 = S.cabSideX(t, ch.belt + 0.02) + 0.01;
      const arm = mesh(new THREE.BoxGeometry(0.13, 0.022, 0.05), st === 'muscle' ? M.chrome : M.gloss, false);
      arm.position.set(sgn * (x0 + 0.06), my - 0.03, S.z(mu) - 0.02);
      mg.add(arm);
      const hsh = new THREE.Shape();
      hsh.absellipse(0, 0, 0.1, 0.055, 0, Math.PI * 2);
      const hgeo = new THREE.ExtrudeGeometry(hsh, { depth: 0.07, bevelEnabled: true, bevelSize: 0.015, bevelThickness: 0.025, bevelSegments: 3, curveSegments: 16 });
      hgeo.translate(0, 0, -0.07);
      const house = mesh(hgeo, st === 'muscle' ? M.chrome : paintPlain);
      house.position.set(sgn * (x0 + 0.16), my, S.z(mu) + 0.03);
      house.rotation.y = sgn * 0.12;
      mg.add(house);
      const glass = mesh(new THREE.CircleGeometry(1, 20), M.mirror, false);
      glass.scale.set(0.088, 0.044, 1);
      glass.rotation.y = Math.PI + sgn * 0.12;
      glass.position.set(sgn * (x0 + 0.16), my, S.z(mu) - 0.067);
      mg.add(glass);
    }
  }
  // limpadores de para-brisa (sobre o vidro)
  if (!skip.wipers) {
    const t0 = 0.035;
    const ha = S.cabHalf(t0);
    const hb = S.cabHalf(cab.tW);
    const y0 = ha[ha.length - 1].y;
    const y1 = hb[hb.length - 1].y;
    const z0 = S.z(S.cabU(t0));
    const z1 = S.z(S.cabU(cab.tW));
    const slope = Math.atan2(y1 - y0, z0 - z1);
    for (const x of [0.3, -0.18]) {
      const wiper = mesh(new THREE.BoxGeometry(0.52, 0.01, 0.018), M.blackPlastic, false);
      wiper.position.set(x, y0 + 0.022, z0 - 0.04);
      wiper.rotation.order = 'YXZ';
      wiper.rotation.x = -slope;
      wiper.rotation.y = 0.1;
      root.add(wiper);
    }
  }

  // ---- teto
  if (st === 'eagle') {
    // antena "barbatana de tubarão"
    const tu = S.cabU(cab.tR + 0.06);
    const ty = S.cabHalf(cab.tR + 0.06);
    const fin = new THREE.Shape();
    fin.moveTo(0, 0);
    fin.lineTo(0.16, 0);
    fin.quadraticCurveTo(0.03, 0.02, 0.02, 0.06);
    fin.closePath();
    const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.04, bevelEnabled: true, bevelSize: 0.008, bevelThickness: 0.008, bevelSegments: 2 });
    fg.translate(0, 0, -0.02);
    fg.rotateY(Math.PI / 2);
    const fm = mesh(fg, M.gloss);
    fm.position.set(0, ty[ty.length - 1].y - 0.005, S.z(tu) + 0.06);
    part('antena', 9).add(fm);
  } else if (st === 'muscle') {
    const ant = mesh(new THREE.CylinderGeometry(0.003, 0.005, 0.7, 6), M.chrome, false);
    const au = 0.27;
    ant.position.set(-0.7, S.topY(au, 0.7) + 0.35, S.z(au));
    ant.rotation.x = -0.12;
    part('antena', 9).add(ant);
  }
  // terceira luz de freio no topo do vidro traseiro
  if (st !== 'gt' && !skip.thirdBrake) {
    const t = Math.min(0.97, cab.tR + 0.03);
    const h = S.cabHalf(t);
    const tb = mesh(new THREE.BoxGeometry(0.34, 0.018, 0.025), brakeMat, false);
    tb.position.set(0, h[h.length - 1].y - 0.012, S.z(S.cabU(t)) - 0.01);
    root.add(tb);
  }

  // ---- traseira: lanternas por modelo
  const ry = (k) => rear.yb + (rear.yt - rear.yb) * k;
  const rw = rear.hw;
  if (st === 'gt') {
    const out = [[-0.17, -0.035], [0.15, -0.045], [0.18, 0.02], [0.12, 0.05], [-0.16, 0.035]];
    const leds = [
      [[-0.15, -0.025], [0.13, -0.035], [0.13, -0.022], [-0.15, -0.012]],
      [[-0.15, 0.015], [0.1, 0.03], [0.1, 0.04], [-0.15, 0.026]],
    ];
    for (const sgn of [1, -1]) {
      const g = onRear(sgn * rw * 0.62, ry(0.8), 0.004);
      g.add(taillight(-sgn, out, leds));
      part(sgn > 0 ? 'lanterna esquerda' : 'lanterna direita', 14).add(g);
    }
  } else if (st === 'raio') {
    // barra de LED de largura total + "C" nas pontas
    const bar = onRear(0, ry(0.83), 0.003);
    bar.add(mesh(plateGeo([[-rw * 0.62, -0.012], [rw * 0.62, -0.012], [rw * 0.62, 0.012], [-rw * 0.62, 0.012]], 0.006, 0.012), brakeMat, false));
    root.add(bar);
    for (const sgn of [1, -1]) {
      const out = [[-0.1, -0.05], [0.12, -0.05], [0.12, 0.05], [-0.1, 0.05]];
      const leds = [
        [[0.08, -0.04], [0.105, -0.04], [0.105, 0.04], [0.08, 0.04]],
        [[-0.08, 0.03], [0.08, 0.03], [0.08, 0.04], [-0.08, 0.04]],
        [[-0.08, -0.04], [0.08, -0.04], [0.08, -0.03], [-0.08, -0.03]],
      ];
      const g = onRear(sgn * rw * 0.72, ry(0.78), 0.004);
      g.add(taillight(-sgn, out, leds));
      part(sgn > 0 ? 'lanterna esquerda' : 'lanterna direita', 14).add(g);
    }
  } else if (st === 'muscle') {
    // painel de lanternas de largura total com moldura cromada
    for (const sgn of [1, -1]) {
      const out = [[-0.02, -0.07], [rw * 0.86, -0.07], [rw * 0.86, 0.07], [-0.02, 0.07]];
      const leds = [];
      for (let k = 0; k < 3; k++) {
        const x0 = 0.02 + k * rw * 0.28;
        leds.push([[x0, -0.05], [x0 + rw * 0.25, -0.05], [x0 + rw * 0.25, 0.05], [x0, 0.05]]);
      }
      const g = onRear(sgn * 0.02, ry(0.68), 0.004);
      const frame = mesh(plateGeo(sgn < 0 ? [[-0.03, -0.085], [rw * 0.88, -0.085], [rw * 0.88, 0.085], [-0.03, 0.085]] : mirrorPts([[-0.03, -0.085], [rw * 0.88, -0.085], [rw * 0.88, 0.085], [-0.03, 0.085]]), 0.02, 0.02), M.chrome, false);
      frame.position.z = -0.006;
      g.add(frame);
      g.add(taillight(-sgn, out, leds, { r: 0.01 }));
      part(sgn > 0 ? 'lanterna esquerda' : 'lanterna direita', 14).add(g);
    }
    const by = ry(0.32);
    const bar = mesh(new THREE.CapsuleGeometry(0.038, rw * 1.75, 6, 12), M.chrome);
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, by, S.rearZ(0, by) - 0.025);
    part('para-choque traseiro', 22).add(bar);
  } else if (st === 'eagle') {
    // três barras verticais por lado num painel preto que liga as lanternas
    const panel = onRear(0, ry(0.74), 0.002);
    panel.add(mesh(plateGeo([[-rw * 0.5, -0.06], [rw * 0.5, -0.06], [rw * 0.5, 0.06], [-rw * 0.5, 0.06]], 0.02, 0.03), M.gloss, false));
    root.add(panel);
    for (const sgn of [1, -1]) {
      const out = [[-0.17, -0.085], [0.17, -0.085], [0.17, 0.085], [-0.17, 0.085]];
      const leds = [];
      for (let k = 0; k < 3; k++) {
        const x0 = -0.135 + k * 0.1;
        leds.push([[x0, -0.07], [x0 + 0.065, -0.07], [x0 + 0.065, 0.07], [x0, 0.07]]);
      }
      const g = onRear(sgn * rw * 0.68, ry(0.74), 0.004);
      g.add(taillight(-sgn, out, leds, { r: 0.02 }));
      part(sgn > 0 ? 'lanterna esquerda' : 'lanterna direita', 14).add(g);
    }
  }
  // luzes de ré e refletores
  if (!skip.reverse) for (const sgn of [1, -1]) {
    const g = onRear(sgn * rw * (st === 'muscle' ? 0.25 : 0.42), ry(st === 'muscle' ? 0.48 : 0.38), 0.002);
    g.add(mesh(plateGeo([[-0.04, -0.016], [0.04, -0.016], [0.04, 0.016], [-0.04, 0.016]], 0.008, 0.01), revMat, false));
    root.add(g);
  }

  // ---- placa, difusor e escapamentos (embutidos no para-choque)
  if (!skip.plate) {
    const py = st === 'muscle' ? ry(0.5) : ry(0.52);
    const plateMat = new THREE.MeshStandardMaterial({ map: TX.plateTexture('CRD' + number + 'A' + (10 + number)), roughness: 0.5 });
    const g = onRear(0, py, 0.003);
    const recess = mesh(plateGeo([[-0.25, -0.085], [0.25, -0.085], [0.25, 0.085], [-0.25, 0.085]], 0.015, 0.02), M.gloss, false);
    recess.position.z = -0.012;
    g.add(recess);
    const pl = mesh(new THREE.PlaneGeometry(0.42, 0.13), plateMat, false);
    pl.position.z = 0.002;
    g.add(pl);
    part('placa', 12).add(g);
  }
  if (!skip.diffuser) {
    const zr = S.z(1);
    const dif = new THREE.Group();
    const dw = rw * (st === 'muscle' ? 1.3 : 1.55);
    const depth = 0.42;
    const plate = mesh(new THREE.BoxGeometry(dw, 0.02, depth), st === 'gt' ? M.carbon : M.gloss);
    plate.position.set(0, 0, -depth / 2);
    plate.rotation.x = 0.16;
    dif.add(plate);
    if (st !== 'muscle')
      for (let k = -2; k <= 2; k++) {
        if (k === 0 && st !== 'gt') continue;
        const fin = mesh(new THREE.BoxGeometry(0.012, 0.1, depth * 0.9), st === 'gt' ? M.carbon : M.gloss);
        fin.position.set(k * dw * 0.2, 0.04, -depth / 2);
        fin.rotation.x = 0.16;
        dif.add(fin);
      }
    dif.position.set(0, rear.yb + 0.012, zr + depth + 0.005);
    part('difusor', 20).add(dif);
  }
  if (!skip.exhaust) {
    const exY = rear.yb + 0.085;
    let exX;
    if (st === 'gt') exX = [-0.09, 0.09];
    else if (st === 'raio') exX = [-0.17, -0.06, 0.06, 0.17];
    else exX = [-rw * 0.62, -rw * 0.48, rw * 0.48, rw * 0.62];
    for (const x of exX) {
      const zz = S.rearZ(x, exY);
      const tip = new THREE.CylinderGeometry(0.042, 0.046, 0.16, 24, 1, true);
      tip.rotateX(Math.PI / 2);
      const e = mesh(tip, new THREE.MeshStandardMaterial({ color: st === 'raio' ? 0x3a3a3e : 0xd8d8d8, metalness: 1, roughness: 0.2, side: THREE.DoubleSide }), false);
      e.position.set(x, exY, zz + 0.05);
      root.add(e);
      const inn = mesh(new THREE.CircleGeometry(0.04, 18), M.exhaustIn, false);
      inn.rotation.y = Math.PI;
      inn.position.set(x, exY, zz + 0.0);
      root.add(inn);
    }
  }

  // ---- asa / aerofólios
  if (st === 'gt' || st === 'eagle') {
    const u = st === 'gt' ? 0.925 : 0.94;
    const low = st === 'eagle';
    const yDeck = S.topY(u, 0.42);
    const wingH = low ? 0.16 : 0.3;
    const span = low ? 1.5 : 1.74;
    const wingG = new THREE.Group();
    const af = new THREE.Shape();
    af.moveTo(0.17, 0);
    af.bezierCurveTo(0.12, 0.045, -0.05, 0.055, -0.19, 0.022);
    af.lineTo(-0.2, 0.0);
    af.bezierCurveTo(-0.05, 0.015, 0.1, -0.004, 0.17, 0);
    const wGeo = new THREE.ExtrudeGeometry(af, { depth: span, bevelEnabled: false, curveSegments: 10 });
    wGeo.translate(0, 0, -span / 2);
    wGeo.rotateY(Math.PI / 2);
    const wm = mesh(wGeo, st === 'gt' ? M.carbon : paintPlain);
    wm.rotation.x = 0.12;
    wingG.add(wm);
    const gurney = mesh(new THREE.BoxGeometry(span, 0.025, 0.006), M.carbon);
    gurney.position.set(0, 0.03, -0.19);
    wingG.add(gurney);
    for (const sgn of [1, -1]) {
      const ep = mesh(plateGeo([[-0.22, -0.06], [0.2, -0.04], [0.2, 0.09], [-0.24, 0.1]], 0.03, 0.01), M.carbon);
      ep.rotation.y = sgn * Math.PI / 2;
      ep.position.set(sgn * (span / 2 + 0.005), 0.02, 0);
      wingG.add(ep);
      const strut = mesh(plateGeo([[-0.05, -wingH], [0.04, -wingH], [0.03, 0.01], [-0.03, 0.01]], 0.01, 0.018), M.gloss);
      strut.rotation.y = Math.PI / 2;
      strut.position.set(sgn * 0.42, 0, 0.01);
      wingG.add(strut);
    }
    if (st === 'gt') {
      const third = mesh(new THREE.BoxGeometry(0.36, 0.016, 0.02), brakeMat, false);
      third.position.set(0, -0.006, -0.2);
      wingG.add(third);
    }
    wingG.position.set(0, yDeck + wingH, S.z(u) - 0.04);
    part('asa traseira', 18).add(wingG);
  } else if (st === 'raio') {
    const u = 0.975;
    const d = mesh(new THREE.BoxGeometry(S.sec(u).hw * 1.6, 0.02, 0.12), M.carbon);
    d.position.set(0, S.topY(u, 0) + 0.006, S.z(u) - 0.02);
    d.rotation.x = 0.22;
    part('aerofólio', 20).add(d);
  } else if (st === 'muscle') {
    const u = 0.975;
    const lip = new THREE.Shape();
    lip.moveTo(0, 0);
    lip.lineTo(0.14, 0);
    lip.lineTo(0.14, 0.012);
    lip.lineTo(0.02, 0.05);
    lip.closePath();
    const lg = new THREE.ExtrudeGeometry(lip, { depth: S.sec(u).hw * 1.7, bevelEnabled: false });
    lg.translate(0, 0, -S.sec(u).hw * 0.85);
    lg.rotateY(-Math.PI / 2);
    const d = mesh(lg, M.gloss);
    d.position.set(0, S.topY(u, 0) - 0.006, S.z(u) + 0.08);
    part('aerofólio', 20).add(d);
  }

  // ---- detalhes do módulo do carro (faróis, grades, asas... próprios do modelo)
  if (model.decorate) {
    model.decorate({
      THREE,
      TX,
      S,
      model,
      root,
      M,
      paint,
      paintPlain,
      colorDef,
      number,
      variant,
      headMat,
      drlMat,
      brakeMat,
      revMat,
      part,
      onFront,
      onRear,
      onTop,
      onSide,
      plateGeo,
      polyShape,
      mirrorPts,
      mesh,
      headlight,
      taillight,
      front,
      rear,
      fy,
      ry,
      bumperG,
      cab,
      kf,
      smooth,
      xin,
    });
  }

  // ---- interior e piloto (tudo checado contra a altura do teto e a largura da cabine)
  const interior = new THREE.Group();
  const tHead = Math.min(cab.tW + 0.17, (cab.tW + cab.tR) / 2 + 0.05);
  const headH = S.cabHalf(tHead);
  const roofAtHead = headH[headH.length - 1].y;
  const helmetY = Math.min(roofAtHead - 0.17, headH.belt + 0.42);
  const zSeat = S.z(S.cabU(tHead));
  const dX = cab.singleSeat ? 0 : Math.min(0.37, S.cabSideX(tHead, helmetY) - 0.16);
  const seatShape = (x) => {
    const sg = new THREE.Group();
    const back = mesh(plateGeo([[-0.22, 0], [0.22, 0], [0.2, 0.52], [0.12, 0.6], [-0.12, 0.6], [-0.2, 0.52]], 0.06, 0.09), M.seat, false);
    back.rotation.x = -0.2;
    back.position.set(0, -0.05, -0.12);
    sg.add(back);
    for (const k of [-1, 1]) {
      const bol = mesh(new THREE.BoxGeometry(0.06, 0.42, 0.12), M.seatAccent, false);
      bol.position.set(k * 0.2, 0.17, -0.09);
      bol.rotation.x = -0.2;
      sg.add(bol);
    }
    const base = mesh(new THREE.BoxGeometry(0.44, 0.1, 0.48), M.seat, false);
    base.position.set(0, -0.1, 0.12);
    sg.add(base);
    sg.position.set(x, helmetY - 0.58, zSeat - 0.05);
    return sg;
  };
  interior.add(seatShape(dX));
  if (!cab.singleSeat) interior.add(seatShape(-dX));
  const torso = mesh(new THREE.CapsuleGeometry(0.16, 0.26, 4, 12), M.suit, false);
  torso.position.set(dX, helmetY - 0.33, zSeat - 0.03);
  torso.rotation.x = -0.2;
  interior.add(torso);
  const helmetMat = new THREE.MeshPhysicalMaterial({ color: colorDef.stripe, metalness: 0.3, roughness: 0.25, clearcoat: 1 });
  const helmet = mesh(new THREE.SphereGeometry(0.125, 24, 16), helmetMat, false);
  helmet.position.set(dX, helmetY, zSeat + 0.03);
  helmet.scale.set(1, 1.05, 1.1);
  interior.add(helmet);
  const visor = mesh(new THREE.SphereGeometry(0.128, 24, 12, -Math.PI * 0.35, Math.PI * 0.7, Math.PI * 0.32, Math.PI * 0.25), M.visor, false);
  visor.position.copy(helmet.position);
  visor.scale.copy(helmet.scale);
  interior.add(visor);
  // painel sob o para-brisa e volante
  // painel baixo, logo abaixo da base do para-brisa, com um visor de instrumentos
  const tDash = cab.tW * 0.5;
  const dh = S.cabHalf(tDash);
  const dashTop = dh.belt + 0.01;
  const zDash = S.z(S.cabU(tDash));
  const dashW = S.cabSideX(tDash, dh.belt) * 2 - 0.12;
  const dash = mesh(new THREE.BoxGeometry(dashW, 0.16, 0.3), M.seat, false);
  dash.position.set(0, dashTop - 0.08, zDash - 0.04);
  interior.add(dash);
  const binnacle = mesh(new THREE.BoxGeometry(0.26, 0.06, 0.12), M.seat, false);
  binnacle.position.set(dX, dashTop + 0.02, zDash - 0.16);
  interior.add(binnacle);
  const cluster = mesh(new THREE.PlaneGeometry(0.22, 0.045), new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0x2a7fd0, emissiveIntensity: 0.45 }), false);
  cluster.position.set(dX, dashTop + 0.022, zDash - 0.221);
  cluster.rotation.set(-0.15, Math.PI, 0);
  interior.add(cluster);
  const wheelG = new THREE.Group();
  const sw = mesh(new THREE.TorusGeometry(0.15, 0.021, 10, 32), M.seat, false);
  wheelG.add(sw);
  const swBar = mesh(new THREE.BoxGeometry(0.27, 0.035, 0.02), M.darkMetal, false);
  swBar.position.y = -0.01;
  wheelG.add(swBar);
  const swTop = mesh(new THREE.BoxGeometry(0.03, 0.02, 0.025), new THREE.MeshStandardMaterial({ color: 0xff8800 }), false);
  swTop.position.y = 0.15;
  wheelG.add(swTop);
  const zWheel = (zDash + zSeat) / 2 - 0.02;
  wheelG.position.set(dX, helmetY - 0.3, zWheel);
  wheelG.rotation.x = -0.42;
  interior.add(wheelG);
  for (const k of [-1, 1]) {
    const arm = mesh(new THREE.CapsuleGeometry(0.042, 0.3, 4, 8), M.suit, false);
    const sh = new THREE.Vector3(dX + k * 0.16, helmetY - 0.22, zSeat - 0.01);
    const hd = new THREE.Vector3(dX + k * 0.13, helmetY - 0.3, zWheel - 0.03);
    arm.position.copy(sh).add(hd).multiplyScalar(0.5);
    arm.lookAt(hd);
    arm.rotateX(Math.PI / 2);
    interior.add(arm);
  }
  if (st === 'gt') {
    // gaiola de proteção: arco principal atrás dos bancos
    const zb = zSeat - 0.4;
    const tb = S.u(zb);
    const hb = S.cabHalf((tb - cab.s) / (cab.e - cab.s));
    const top = hb[hb.length - 1].y - 0.06;
    const span = S.cabSideX((tb - cab.s) / (cab.e - cab.s), top) - 0.05;
    const hoop = mesh(new THREE.TorusGeometry(1, 0.022 / span, 8, 24, Math.PI), M.darkMetal, false);
    hoop.scale.set(span, top - hb.belt + 0.05, span);
    hoop.position.set(0, hb.belt - 0.05, zb);
    interior.add(hoop);
  }
  root.add(interior);
  // assoalho
  const floor = mesh(new THREE.BoxGeometry(1.5, 0.03, L * 0.78), M.blackPlastic, false);
  floor.position.set(0, S.sec(0.5).yb + 0.035, 0);
  root.add(floor);

  // junta as peças estáticas por material (menos chamadas de desenho)
  const keep = new Set([wheelG, helmet, visor, bodyMesh, ...wheels.map((w) => w.pivot), ...parts.map((p) => p.group)]);
  mergeStatic(root, keep);
  for (const w of wheels) mergeStatic(w.spin, new Set());
  const box = new THREE.Box3();
  for (const p of parts) {
    mergeStatic(p.group, new Set());
    box.setFromObject(p.group);
    root.worldToLocal(box.getCenter(p.center));
    p.radius = Math.max(0.05, box.getSize(new THREE.Vector3()).length() / 2);
  }
  root.traverse((o) => {
    if (o.isMesh && o.material && (Array.isArray(o.material) ? o.material.some((m) => m.transparent) : o.material.transparent)) o.renderOrder = 2;
  });

  const hc = S.cabHalf(0.02);
  return {
    root,
    wheels,
    steeringWheel: wheelG,
    driverHead: [helmet, visor],
    views: {
      cockpit: new THREE.Vector3(dX, helmetY + 0.03, zSeat + 0.08),
      hood: new THREE.Vector3(0, hc.belt + 0.3, S.z(S.cabU(0)) - 0.1),
    },
    brakeMat,
    revMat,
    headMat,
    paint,
    paints: [paint, paintPlain],
    body: bodyMesh,
    bodyRest: body.attributes.position.array.slice(),
    parts,
    shape: S,
    dims: { length: L, halfWidth: Math.max(...model.hw.map((k) => k[1])), height: cab.roof },
  };
}

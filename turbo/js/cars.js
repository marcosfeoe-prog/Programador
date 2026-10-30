// Modelos procedurais dos carros, esculpidos por "loft": a carroceria é uma
// sequência de seções transversais ao longo do comprimento (fundo, laterais
// com leve inclinação, ombro arredondado, capô e cabine), com recortes dos
// para-lamas sobre as rodas e frente/traseira arredondadas. Janelas, colunas,
// saias e teto saem da própria superfície; faróis, lanternas, grades, entradas
// de ar e listras são "adesivos" que acompanham a carroceria.
// Espaço do modelo: frente = -Z, direita = +X, cima = +Y, chão em y = 0.
import * as THREE from 'three';
import { mergeGeometries, smoothstep, clamp, lerp } from './util.js';
import { rimTexture, tireTexture, brakeTexture, glowTexture } from './textures.js';
import { PAINTS, RIMS, NEONS } from './config.js';

// ------------------------------------------------------------ geometria base
function creaseNormals(geo, crease = 0.62) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const faceN = new Float32Array(n);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let f = 0; f < n / 3; f++) {
    a.fromBufferAttribute(pos, f * 3);
    b.fromBufferAttribute(pos, f * 3 + 1);
    c.fromBufferAttribute(pos, f * 3 + 2);
    b.sub(a);
    c.sub(a);
    b.cross(c).normalize();
    faceN[f * 3] = b.x;
    faceN[f * 3 + 1] = b.y;
    faceN[f * 3 + 2] = b.z;
  }
  const map = new Map();
  const key = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const keys = new Array(n);
  for (let i = 0; i < n; i++) {
    const k = (keys[i] = key(i));
    let l = map.get(k);
    if (!l) map.set(k, (l = []));
    l.push(i);
  }
  const out = new Float32Array(n * 3);
  const cosA = Math.cos(crease);
  for (let i = 0; i < n; i++) {
    const fi = Math.floor(i / 3) * 3;
    let x = 0;
    let y = 0;
    let z = 0;
    for (const j of map.get(keys[i])) {
      const fj = Math.floor(j / 3) * 3;
      const d = faceN[fi] * faceN[fj] + faceN[fi + 1] * faceN[fj + 1] + faceN[fi + 2] * faceN[fj + 2];
      if (d >= cosA) {
        x += faceN[fj];
        y += faceN[fj + 1];
        z += faceN[fj + 2];
      }
    }
    const l = Math.hypot(x, y, z) || 1;
    out[i * 3] = x / l;
    out[i * 3 + 1] = y / l;
    out[i * 3 + 2] = z / l;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return geo;
}

// Extrusão do perfil na largura, com afinamento e normais suavizadas.
function extrudeSide(pts, width, taper = {}, bevel = 0.06, zOff = 0) {
  const shape = new THREE.Shape(pts);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, width - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 2,
    curveSegments: 4,
  });
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  const pos = geo.attributes.position;
  const { top = 0, topFrom = 0.6, topTo = 1.3, nose = 0, noseFrom = 1.2, noseTo = 2.3, tail = 0, tailFrom = -1.4, tailTo = -2.3 } = taper;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i);
    const v = pos.getY(i);
    let k = 1;
    k -= top * smoothstep(topFrom, topTo, v);
    k -= nose * smoothstep(noseFrom, noseTo, u);
    k -= tail * smoothstep(tailFrom, tailTo, u);
    pos.setZ(i, pos.getZ(i) * Math.max(0.2, k) + zOff);
  }
  const g = geo.index ? geo.toNonIndexed() : geo;
  creaseNormals(g);
  // u → -Z (frente), largura → X
  g.rotateY(Math.PI / 2);
  return g;
}

function box(w, h, l, x, y, z, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, l);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return g.toNonIndexed();
}

// Tubo (para gaiolas e suportes) entre dois pontos no espaço do modelo.
function tube(a, b, r = 0.035, seg = 6) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyQuaternion(q);
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g.toNonIndexed();
}


// ------------------------------------------------------------- curvas suaves
// Interpolação cúbica monótona (Fritsch–Carlson): passa pelos pontos-chave
// sem "ondular" entre eles. keys = [[x, y], ...] com x crescente.
function curve(keys) {
  const n = keys.length;
  const xs = keys.map((k) => k[0]);
  const ys = keys.map((k) => k[1]);
  if (n === 1) return () => ys[0];
  const d = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i]));
  const m = new Array(n);
  m[0] = d[0];
  m[n - 1] = d[n - 2];
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
}

// ------------------------------------------------------- seção transversal
// Meia seção (lado direito) com 24 pontos, do centro do fundo ao centro do
// teto, em 8 trechos. O anel completo tem 46 pontos (o lado esquerdo espelha).
const SEGS = ['bottom', 'corner', 'side', 'shoulder', 'deck', 'cabinSide', 'roofCorner', 'roof'];
const LAST = [2, 5, 8, 12, 14, 17, 20, 23];
const HALF = 24;
const RING = 46;
const SEG_OF = [];
for (let s = 0, i = 0; i < HALF; i++) {
  while (i > LAST[s]) s++;
  SEG_OF.push(s);
}

// Índice (fracionário) no anel a partir de "trecho + fração", ex.: K('side', 0.5).
export function K(seg, t) {
  const s = SEGS.indexOf(seg);
  const a = s === 0 ? 0 : LAST[s - 1];
  return a + t * (LAST[s] - a);
}
const mirrorK = (k) => RING - k;
const deg = Math.PI / 180;

class Body {
  constructor(def, offset = { x: 0, u: 0 }, detail = 'high') {
    this.def = def;
    this.lite = detail === 'low';
    this.L = def.L;
    this.off = offset;
    this.f = {
      belt: curve(def.belt),
      bottom: curve(def.bottom),
      width: curve(def.width),
      cabin: curve(def.cabin || [[0, 0], [1, 0]]),
    };
    const wh = def.wheels;
    this.wheels = wh
      ? wh.x.map((x, i) => ({
          u: (x - 0.5) * def.L,
          r: i === 0 ? wh.rr || wh.r : wh.r,
          open: !!wh.open,
          cover: i === 0 ? wh.cover : 0,
        }))
      : [];
    this.lastC = 0;
  }

  // Parâmetros da seção em x (0 = traseira, 1 = frente).
  params(x) {
    const d = this.def;
    const f = this.f;
    const u = (x - 0.5) * d.L;
    let b = f.bottom(x);
    let h = f.belt(x);
    const c = Math.max(0, f.cabin(x));
    let W = d.W * f.width(x);
    for (const wh of this.wheels) {
      const du = u - wh.u;
      const ra = wh.r + 0.075;
      const g = Math.exp(-(du * du) / (ra * ra * 1.3));
      W += (d.flare || 0) * g;
      h += (d.beltBump || 0) * g;
      if (!wh.open && Math.abs(du) < ra) {
        let ay = wh.r + Math.sqrt(ra * ra - du * du);
        if (wh.cover) ay = Math.min(ay, wh.cover);
        b = Math.max(b, ay);
      }
    }
    b = Math.min(b, h - 0.07);
    // pontas arredondadas (vista de cima e de lado)
    let sx = 1;
    const nF = d.nose / d.L;
    const nR = d.tail / d.L;
    if (x > 1 - nF) {
      const t = (x - (1 - nF)) / nF;
      sx = Math.sqrt(Math.max(0, 1 - t * t));
    }
    if (x < nR) {
      const t = (nR - x) / nR;
      sx = Math.min(sx, Math.sqrt(Math.max(0, 1 - t * t)));
    }
    return { u, b, h, c, W, sx };
  }

  // Anel de 46 pontos [x, y] (sem deslocamento) na posição x.
  ring(x) {
    const d = this.def;
    const { b, h, c, W, sx } = this.params(x);
    let rb = d.rb;
    let rs = d.rs;
    const sideH = h - b;
    if (rb + rs > sideH * 0.92) {
      const k = (sideH * 0.92) / (rb + rs);
      rb *= k;
      rs *= k;
    }
    const Ws = W - (d.tumble || 0);
    const cwb = Math.max(0.05, Math.min(W * (d.cabinBase ?? 0.8), Ws - rs - 0.02));
    const cwr = Math.max(0.04, Math.min(W * (d.cabinTop ?? 0.6), cwb));
    const rr = Math.min(d.rr ?? 0.1, c * 0.5, cwr * 0.8);
    const crown = d.crown || 0;
    const deckY = (xx) => h + crown * (1 - (xx / W) ** 2);
    const P = [];
    P.push([0, b], [(W - rb) * 0.5, b], [W - rb, b]);
    for (const a of [-60, -30, 0]) P.push([W - rb + rb * Math.cos(a * deg), b + rb + rb * Math.sin(a * deg)]);
    for (const t of [1 / 3, 2 / 3, 1]) P.push([lerp(W, Ws, t) + (d.belly || 0) * Math.sin(Math.PI * t), lerp(b + rb, h - rs, t)]);
    for (const a of [22.5, 45, 67.5, 90]) P.push([Ws - rs + rs * Math.cos(a * deg), h - rs + rs * Math.sin(a * deg)]);
    const x0 = Ws - rs;
    const xm = lerp(x0, cwb, 0.5);
    P.push([xm, deckY(xm)], [cwb, deckY(cwb)]);
    const hc = deckY(cwb);
    for (const t of [1 / 3, 2 / 3, 1]) P.push([lerp(cwb, cwr, t), hc + (c - rr) * t]);
    const top = hc + c;
    for (const a of [30, 60, 90]) P.push([cwr - rr + rr * Math.cos(a * deg), top - rr + rr * Math.sin(a * deg)]);
    const kc = smoothstep(0, 0.12, c);
    for (const t of [1 / 3, 2 / 3, 1]) {
      const xx = lerp(cwr - rr, 0, t);
      const flat = deckY(xx) - hc;
      const dome = (d.roofCrown || 0) * (1 - (xx / Math.max(cwr, 0.01)) ** 2);
      P.push([xx, top + flat * (1 - kc) + dome * kc]);
    }
    // pontas: encolhe em direção ao centro
    if (sx < 1) {
      const cy = (b + h) * 0.5;
      const sy = 0.5 + 0.5 * sx;
      for (const p of P) {
        p[0] *= sx;
        p[1] = cy + (p[1] - cy) * sy;
      }
    }
    const R = P.slice();
    for (let i = HALF - 2; i >= 1; i--) R.push([-P[i][0], P[i][1]]);
    this.lastC = c;
    return R;
  }

  // Ponto da superfície (espaço do modelo) em x e índice fracionário k.
  point(x, k, out = new THREE.Vector3()) {
    const R = this.ring(x);
    const kk = ((k % RING) + RING) % RING;
    const i = Math.floor(kk);
    const t = kk - i;
    const a = R[i];
    const b = R[(i + 1) % RING];
    const u = (x - 0.5) * this.L + this.off.u;
    return out.set(lerp(a[0], b[0], t) + this.off.x, lerp(a[1], b[1], t), -u);
  }

  normal(x, k, out = new THREE.Vector3()) {
    const dx = 0.004;
    const a = this.point(Math.min(1, x + dx), k);
    const b = this.point(Math.max(0, x - dx), k);
    const c = this.point(x, k + 0.25);
    const e = this.point(x, k - 0.25);
    const du = a.sub(b);
    const dk = c.sub(e);
    out.crossVectors(du, dk);
    if (out.lengthSq() < 1e-12) {
      // ponto degenerado (ponta): aponta para fora do centro do carro
      out.copy(this.point(x, k)).sub(new THREE.Vector3(this.off.x, 0.55, -this.off.u));
    }
    return out.normalize();
  }

  // Posições ao longo do comprimento: grade regular + amostras nos arcos das
  // rodas e nas pontas (mais densas onde a forma muda rápido).
  stations() {
    const d = this.def;
    const L = d.L;
    const us = [];
    const step = this.lite ? 0.13 : 0.07;
    const nArc = this.lite ? 10 : 18;
    const nEnd = this.lite ? 6 : 10;
    for (let u = -L / 2; u <= L / 2 + 1e-6; u += step) us.push(u);
    for (const wh of this.wheels) {
      if (wh.open) continue;
      const ra = wh.r + 0.075;
      for (let i = 0; i <= nArc; i++) us.push(wh.u + Math.cos((Math.PI * i) / nArc) * (ra - 0.003));
      us.push(wh.u - ra - 0.004, wh.u + ra + 0.004);
    }
    for (let i = 0; i <= nEnd; i++) {
      const s = Math.sin(((i / nEnd) * Math.PI) / 2);
      us.push(L / 2 - d.nose + d.nose * s, -L / 2 + d.tail - d.tail * s);
    }
    us.sort((a, b) => a - b);
    const out = [];
    for (const u of us) {
      const c = clamp(u, -L / 2, L / 2);
      if (!out.length || c - out[out.length - 1] > 0.006) out.push(c);
    }
    return out.map((u) => u / L + 0.5);
  }

  // Malha da carroceria com grupos por material (normais suaves no conjunto).
  geometry() {
    const d = this.def;
    const xs = this.stations();
    const n = xs.length;
    const pos = new Float32Array(n * RING * 3);
    const cab = new Float32Array(n);
    xs.forEach((x, i) => {
      const R = this.ring(x);
      cab[i] = this.lastC;
      const u = (x - 0.5) * this.L + this.off.u;
      for (let j = 0; j < RING; j++) {
        const o = (i * RING + j) * 3;
        pos[o] = R[j][0] + this.off.x;
        pos[o + 1] = R[j][1];
        pos[o + 2] = -u;
      }
    });
    const buckets = { paint: [], glass: [], dark: [] };
    const v = new THREE.Vector3();
    const w = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    const P = (idx, out) => out.set(pos[idx * 3], pos[idx * 3 + 1], pos[idx * 3 + 2]);
    const mi = (j) => (j <= HALF - 1 ? j : RING - j);
    const skirt = d.skirt || 0;
    const inPillar = (x) => (d.pillars || []).some(([a, b]) => x >= a && x <= b);
    for (let i = 0; i < n - 1; i++) {
      const cabin = cab[i] > 0.03 && cab[i + 1] > 0.03;
      const xm = (xs[i] + xs[i + 1]) / 2;
      for (let j = 0; j < RING; j++) {
        const a = i * RING + j;
        const b = i * RING + ((j + 1) % RING);
        const c = (i + 1) * RING + j;
        const e = (i + 1) * RING + ((j + 1) % RING);
        const seg = SEG_OF[Math.max(mi(j), mi((j + 1) % RING))];
        const y = (pos[a * 3 + 1] + pos[b * 3 + 1] + pos[c * 3 + 1] + pos[e * 3 + 1]) / 4;
        let mat = 'paint';
        if (seg === 0) mat = 'dark';
        else if (seg <= 2 && y < skirt) mat = 'dark';
        else if (seg === 5 && cabin) mat = d.cabinMat || (inPillar(xm) ? 'paint' : 'glass');
        else if (seg === 6 && cabin) mat = d.canopy ? 'glass' : d.cabinMat || 'paint';
        else if (seg === 7 && cabin) {
          if (d.canopy) mat = 'glass';
          else if (d.cabinMat) mat = d.cabinMat;
          else {
            // teto plano pintado; para-brisa e vidro traseiro inclinados
            P(a, v);
            P(c, w).sub(v);
            P(b, nrm).sub(v);
            nrm.crossVectors(w, nrm).normalize();
            mat = Math.abs(nrm.y) > 0.9 ? d.roof || 'paint' : 'glass';
          }
        }
        buckets[mat].push(a, c, b, b, c, e);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const idx = [];
    const groups = [];
    for (const k of ['paint', 'glass', 'dark']) {
      groups.push([k, idx.length, buckets[k].length]);
      for (const q of buckets[k]) idx.push(q);
    }
    g.setIndex(idx);
    for (const [k, start, count] of groups) if (count) g.addGroup(start, count, ['paint', 'glass', 'dark'].indexOf(k));
    g.computeVertexNormals();
    return g;
  }

  // "Adesivo" sobre a superfície: x0..x1 ao longo, k0..k1 em volta.
  patch(x0, x1, k0, k1, lift = 0.006, nx = 10, nk = 8, flipU = false) {
    const pos = [];
    const nor = [];
    const uv = [];
    const p = new THREE.Vector3();
    const q = new THREE.Vector3();
    for (let i = 0; i <= nx; i++) {
      const x = lerp(x0, x1, i / nx);
      for (let j = 0; j <= nk; j++) {
        const k = lerp(k0, k1, j / nk);
        this.point(x, k, p);
        this.normal(x, k, q);
        p.addScaledVector(q, lift);
        pos.push(p.x, p.y, p.z);
        nor.push(q.x, q.y, q.z);
        uv.push(flipU ? 1 - i / nx : i / nx, flipU ? 1 - j / nk : j / nk);
      }
    }
    const idx = [];
    for (let i = 0; i < nx; i++)
      for (let j = 0; j < nk; j++) {
        const a = i * (nk + 1) + j;
        const b = a + 1;
        const c = a + nk + 1;
        const e = c + 1;
        idx.push(a, c, b, b, c, e);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g.toNonIndexed();
  }

  // Alturas úteis para posicionar peças.
  deckAt(x) {
    return this.params(x).h + (this.def.crown || 0);
  }
  topAt(x) {
    const p = this.params(x);
    return p.h + p.c + (this.def.crown || 0);
  }
  widthAt(x) {
    return this.params(x).W;
  }
}

// --------------------------------------------------------------- definições
// L comprimento, W meia-largura. Curvas em x (0 = traseira, 1 = frente):
// belt = altura do ombro/capô, bottom = fundo, width = fator da largura,
// cabin = altura da cabine acima do capô (0 = sem cabine).
// rb/rs/rr = raios do canto inferior, do ombro e do teto; nose/tail = quanto
// as pontas arredondam; flare = para-lamas alargados; beltBump = para-lamas
// altos; skirt = altura da saia escura; pillars = trechos com coluna pintada.
// decals: { m: material, x: [x0, x1], k: [k0, k1], mirror } sobre a superfície.
const HEAD = (x0, x1, k0, k1) => ({ m: 'head', x: [x0, x1], k: [k0, k1], mirror: true });
const TAIL = (x0, x1, k0, k1) => ({ m: 'tail', x: [x0, x1], k: [k0, k1], mirror: true });
const DARK = (x0, x1, k0, k1, mirror = true) => ({ m: 'dark', x: [x0, x1], k: [k0, k1], mirror });
const ACC = (x0, x1, k0, k1, mirror = false) => ({ m: 'accent', x: [x0, x1], k: [k0, k1], mirror });
const CROSS = (a) => [a, RING - a]; // faixa que cruza o centro (passa por cima)
// Farol/lanterna com moldura escura e lente um pouco menor por cima.
const LAMP = (m, x0, x1, k0, k1, mirror = true, inset = 0.14) => [
  { m: 'dark', x: [x0, x1], k: [k0, k1], mirror, lift: 0.005 },
  { m, x: [x0 + (x1 - x0) * inset, x1 - (x1 - x0) * inset], k: [k0 + (k1 - k0) * inset * 1.4, k1 - (k1 - k0) * inset * 1.4], mirror, lift: 0.009 },
];

const DEFS = {
  faisca: {
    L: 3.95,
    W: 0.88,
    wheels: { x: [0.18, 0.81], r: 0.36, w: 0.26, inset: 0.03 },
    bottom: [[0, 0.38], [0.07, 0.26], [0.93, 0.24], [1, 0.34]],
    belt: [[0, 0.8], [0.08, 0.85], [0.5, 0.84], [0.7, 0.81], [0.88, 0.73], [1, 0.58]],
    width: [[0, 0.92], [0.1, 0.99], [0.5, 0.97], [0.9, 0.98], [1, 0.9]],
    cabin: [[0, 0.04], [0.1, 0.28], [0.26, 0.4], [0.45, 0.4], [0.65, 0]],
    cabinBase: 0.84,
    cabinTop: 0.66,
    rb: 0.07,
    rs: 0.16,
    rr: 0.12,
    tumble: 0.03,
    crown: 0.03,
    roofCrown: 0.025,
    nose: 0.26,
    tail: 0.14,
    flare: 0.06,
    skirt: 0.36,
    pillars: [[0.0, 0.14], [0.34, 0.38]],
    decals: [
      ...LAMP('head', 0.93, 0.982, K('side', 0.62), K('shoulder', 0.7)),
      DARK(0.978, 1, K('corner', 0.7), K('side', 0.38)),
      ...LAMP('tail', 0.004, 0.04, K('side', 0.45), K('shoulder', 0.85)),
      DARK(0.004, 0.03, K('corner', 0.2), K('side', 0.2)),
    ],
    exhaust: [{ x: 0.0, y: 0.3, z: 0.45 }],
    extras: ['roofSpoiler', 'mirrors'],
  },
  raio: {
    L: 4.35,
    W: 0.95,
    wheels: { x: [0.2, 0.81], r: 0.355, w: 0.27, inset: 0.05 },
    bottom: [[0, 0.36], [0.07, 0.26], [0.93, 0.23], [1, 0.3]],
    belt: [[0, 0.8], [0.1, 0.85], [0.42, 0.83], [0.66, 0.78], [0.86, 0.68], [1, 0.5]],
    width: [[0, 0.88], [0.18, 1.0], [0.45, 0.96], [0.8, 0.99], [1, 0.86]],
    cabin: [[0.03, 0], [0.12, 0.14], [0.3, 0.36], [0.45, 0.42], [0.53, 0.4], [0.7, 0]],
    cabinBase: 0.8,
    cabinTop: 0.6,
    rb: 0.06,
    rs: 0.2,
    rr: 0.14,
    tumble: 0.05,
    crown: 0.04,
    roofCrown: 0.03,
    nose: 0.32,
    tail: 0.16,
    flare: 0.05,
    skirt: 0.33,
    decals: [
      ...LAMP('head', 0.945, 0.988, K('shoulder', 0.05), K('shoulder', 0.8)),
      DARK(0.98, 1, K('corner', 0.3), K('side', 0.55)),
      ...LAMP('tail', 0.003, 0.04, K('side', 0.85), K('roof', 1), false, 0.1),
      DARK(0.003, 0.03, K('corner', 0.1), K('side', 0.3)),
      DARK(0.69, 0.71, K('side', 0.45), K('side', 0.9)),
      DARK(0.715, 0.735, K('side', 0.45), K('side', 0.9)),
    ],
    exhaust: [{ x: 0.0, y: 0.32, z: 0.42 }, { x: 0.0, y: 0.32, z: -0.42 }],
    extras: ['lipSpoiler', 'mirrors'],
  },
  trovao: {
    L: 4.7,
    W: 0.98,
    wheels: { x: [0.2, 0.79], r: 0.37, rr: 0.39, w: 0.3, rw: 0.36, inset: 0.04 },
    bottom: [[0, 0.38], [0.05, 0.31], [0.95, 0.31], [1, 0.38]],
    belt: [[0, 0.93], [0.06, 0.97], [0.6, 0.97], [0.94, 0.95], [1, 0.88]],
    width: [[0, 0.97], [0.08, 1], [0.92, 1], [1, 0.97]],
    cabin: [[0.18, 0], [0.25, 0.37], [0.31, 0.43], [0.52, 0.44], [0.67, 0]],
    cabinBase: 0.86,
    cabinTop: 0.7,
    rb: 0.05,
    rs: 0.07,
    rr: 0.09,
    tumble: 0.015,
    crown: 0.025,
    roofCrown: 0.02,
    nose: 0.09,
    tail: 0.08,
    flare: 0.05,
    skirt: 0.36,
    pillars: [[0.26, 0.33]],
    decals: [
      DARK(0.982, 1, K('side', 0.3), K('shoulder', 0.5)),
      { m: 'chrome', x: [0.975, 1], k: [K('corner', 0.2), K('side', 0.22)], mirror: true },
      { m: 'chrome', x: [0, 0.025], k: [K('corner', 0.2), K('side', 0.22)], mirror: true },
      TAIL(0.0, 0.025, K('side', 0.55), K('shoulder', 0.35)),
      ACC(0, 1, 21.4, 22.4, true),
      DARK(0.62, 0.86, 22.6, RING - 22.6),
    ],
    exhaust: [{ x: 0.0, y: 0.33, z: 0.6 }, { x: 0.0, y: 0.33, z: -0.6 }],
    extras: ['roundLights', 'scoop', 'ducktail', 'mirrors'],
  },
  lobo: {
    L: 3.6,
    W: 0.68,
    wheels: { x: [0.17, 0.83], r: 0.48, w: 0.38, open: true, outside: 0.12 },
    bottom: [[0, 0.58], [0.12, 0.5], [0.88, 0.5], [1, 0.62]],
    belt: [[0, 0.86], [0.15, 0.96], [0.6, 0.93], [0.85, 0.86], [1, 0.72]],
    width: [[0, 0.86], [0.2, 1], [0.8, 0.95], [1, 0.72]],
    rb: 0.08,
    rs: 0.1,
    tumble: 0.04,
    crown: 0.02,
    nose: 0.28,
    tail: 0.16,
    skirt: 0.62,
    decals: [HEAD(0.95, 0.995, K('side', 0.6), K('shoulder', 0.6)), TAIL(0.003, 0.04, K('side', 0.5), K('shoulder', 0.6)), ACC(0.25, 0.9, 21.6, 23, true)],
    exhaust: [{ x: 0.02, y: 0.66, z: 0.3 }],
    extras: ['cage', 'driver', 'spare', 'bullbar', 'lightbar', 'mudguards'],
  },
  cometa: {
    L: 4.45,
    W: 0.99,
    wheels: { x: [0.2, 0.8], r: 0.355, rr: 0.37, w: 0.28, rw: 0.33, inset: 0.03 },
    bottom: [[0, 0.32], [0.06, 0.24], [0.94, 0.22], [1, 0.27]],
    belt: [[0, 0.82], [0.12, 0.86], [0.32, 0.84], [0.6, 0.72], [0.85, 0.56], [1, 0.42]],
    width: [[0, 0.96], [0.2, 1], [0.8, 1], [1, 0.9]],
    cabin: [[0.24, 0], [0.3, 0.2], [0.38, 0.3], [0.5, 0.3], [0.66, 0.04], [0.68, 0]],
    cabinBase: 0.78,
    cabinTop: 0.56,
    rb: 0.05,
    rs: 0.07,
    rr: 0.08,
    tumble: 0.05,
    crown: 0.02,
    roofCrown: 0.01,
    nose: 0.12,
    tail: 0.08,
    flare: 0.02,
    skirt: 0.34,
    decals: [
      ...LAMP('head', 0.955, 0.988, K('shoulder', 0.75), K('deck', 0.9)),
      DARK(0.985, 1, K('corner', 0.5), K('side', 0.7)),
      DARK(0.31, 0.36, K('side', 0.55), K('shoulder', 0.1)),
      ...LAMP('tail', 0.0, 0.02, K('side', 0.65), K('roof', 1), false, 0.1),
      ...[0.07, 0.1, 0.13, 0.16, 0.19].map((x) => DARK(x, x + 0.016, K('deck', 0.3), K('roof', 1))),
    ],
    exhaust: [{ x: 0.0, y: 0.4, z: 0.18 }, { x: 0.0, y: 0.4, z: -0.18 }],
    extras: ['lowWing', 'mirrors'],
  },
  tufao: {
    L: 4.8,
    W: 0.36,
    wheels: { x: [0.15, 0.83], r: 0.38, rr: 0.42, w: 0.34, rw: 0.44, open: true, outside: 0.42 },
    bottom: [[0, 0.2], [0.5, 0.15], [1, 0.16]],
    belt: [[0, 0.5], [0.1, 0.6], [0.35, 0.66], [0.5, 0.62], [0.62, 0.55], [0.85, 0.42], [1, 0.3]],
    width: [[0, 0.55], [0.12, 0.85], [0.38, 1], [0.55, 0.95], [0.75, 0.6], [1, 0.32]],
    cabin: [[0.06, 0], [0.18, 0.1], [0.36, 0.36], [0.43, 0.4], [0.47, 0.16], [0.5, 0]],
    cabinBase: 0.7,
    cabinTop: 0.36,
    cabinMat: 'paint',
    rb: 0.04,
    rs: 0.12,
    rr: 0.1,
    crown: 0.03,
    roofCrown: 0.04,
    nose: 0.3,
    tail: 0.2,
    skirt: 0.2,
    decals: [DARK(0.5, 0.6, CROSS(21.3)[0], CROSS(21.3)[1], false), ACC(0.62, 1, 21.8, RING - 21.8), TAIL(0.0, 0.03, K('side', 0.2), K('shoulder', 0.4))],
    parts: [
      {
        u: -0.25,
        x: 0.5,
        def: { L: 1.9, W: 0.24, bottom: [[0, 0.17], [1, 0.17]], belt: [[0, 0.36], [0.4, 0.55], [1, 0.58]], width: [[0, 0.45], [0.5, 1], [1, 1]], rb: 0.04, rs: 0.1, crown: 0.02, nose: 0.12, tail: 0.6, skirt: 0.2 },
        decals: [DARK(0.94, 1, K('side', 0.1), K('roof', 1), false)],
      },
    ],
    exhaust: [{ x: 0.0, y: 0.48, z: 0 }],
    extras: ['f1wings', 'driver', 'halo'],
  },
  vespa: {
    L: 4.65,
    W: 1.0,
    wheels: { x: [0.19, 0.81], r: 0.36, rr: 0.38, w: 0.28, rw: 0.34, inset: 0.03 },
    bottom: [[0, 0.3], [0.05, 0.22], [0.95, 0.2], [1, 0.25]],
    belt: [[0, 0.8], [0.12, 0.86], [0.35, 0.8], [0.62, 0.68], [0.86, 0.52], [1, 0.36]],
    width: [[0, 0.92], [0.18, 1.0], [0.45, 0.88], [0.8, 0.98], [1, 0.84]],
    cabin: [[0.24, 0], [0.32, 0.16], [0.44, 0.3], [0.52, 0.3], [0.7, 0.02], [0.72, 0]],
    cabinBase: 0.62,
    cabinTop: 0.42,
    rb: 0.05,
    rs: 0.12,
    rr: 0.12,
    tumble: 0.06,
    crown: 0.03,
    roofCrown: 0.02,
    nose: 0.22,
    tail: 0.1,
    flare: 0.09,
    beltBump: 0.05,
    skirt: 0.32,
    decals: [
      ...LAMP('head', 0.938, 0.976, K('shoulder', 0.25), K('deck', 0.6), true, 0.08),
      DARK(0.97, 1, K('corner', 0.2), K('side', 0.85)),
      DARK(0.29, 0.39, K('side', 0.1), K('shoulder', 0.5)),
      ...LAMP('tail', 0.003, 0.03, K('shoulder', 0.1), K('roof', 1), false, 0.1),
      DARK(0.0, 0.03, K('corner', 0), K('side', 0.6)),
    ],
    exhaust: [{ x: 0.0, y: 0.55, z: 0.0 }],
    extras: ['bigWing', 'fin', 'splitter', 'mirrors'],
  },
  bolido: {
    L: 4.3,
    W: 0.9,
    wheels: { x: [0.18, 0.82], r: 0.35, w: 0.26, inset: 0.05 },
    bottom: [[0, 0.38], [0.06, 0.28], [0.94, 0.26], [1, 0.34]],
    belt: [[0, 0.72], [0.1, 0.78], [0.3, 0.76], [0.5, 0.74], [0.7, 0.76], [0.9, 0.7], [1, 0.56]],
    width: [[0, 0.88], [0.5, 0.94], [1, 0.86]],
    cabin: [[0.3, 0], [0.36, 0.26], [0.44, 0.32], [0.52, 0.3], [0.58, 0.12], [0.62, 0]],
    cabinBase: 0.62,
    cabinTop: 0.46,
    rb: 0.08,
    rs: 0.22,
    rr: 0.16,
    tumble: 0.04,
    crown: 0.05,
    roofCrown: 0.04,
    nose: 0.34,
    tail: 0.3,
    flare: 0.08,
    beltBump: 0.14,
    skirt: 0,
    decals: [
      { m: 'roundel', x: [0.4, 0.5], k: [K('side', 0.05), K('shoulder', 0.5)], mirror: true },
      ACC(0, 1, 22.2, RING - 22.2),
      TAIL(0.01, 0.045, K('side', 0.6), K('shoulder', 0.5)),
      DARK(0.985, 1, K('corner', 0.6), K('side', 0.6)),
      { m: 'chrome', x: [0.97, 0.99], k: [K('corner', 0.2), K('corner', 0.9)], mirror: true },
    ],
    exhaust: [{ x: 0.0, y: 0.3, z: 0.62 }, { x: 0.0, y: 0.3, z: -0.62 }],
    extras: ['roundLights', 'mirrors', 'sidePipes'],
  },
  ciclone: {
    L: 4.85,
    W: 1.0,
    wheels: { x: [0.17, 0.82], r: 0.355, w: 0.3, inset: 0.04 },
    bottom: [[0, 0.28], [0.05, 0.2], [0.95, 0.18], [1, 0.22]],
    belt: [[0, 0.82], [0.15, 0.8], [0.35, 0.64], [0.62, 0.6], [0.82, 0.58], [0.92, 0.48], [1, 0.34]],
    width: [[0, 0.98], [0.5, 0.96], [1, 0.9]],
    cabin: [[0.3, 0], [0.4, 0.3], [0.52, 0.42], [0.62, 0.36], [0.72, 0.1], [0.76, 0]],
    cabinBase: 0.5,
    cabinTop: 0.34,
    rb: 0.05,
    rs: 0.14,
    rr: 0.12,
    tumble: 0.04,
    crown: 0.02,
    roofCrown: 0.03,
    nose: 0.2,
    tail: 0.06,
    flare: 0.04,
    beltBump: 0.2,
    skirt: 0.3,
    pillars: [[0.36, 0.42]],
    decals: [
      ...LAMP('head', 0.905, 0.945, K('shoulder', 0.55), K('deck', 0.5)),
      DARK(0.97, 1, K('corner', 0.3), K('side', 0.8)),
      TAIL(0.0, 0.015, K('side', 0.85), K('roof', 1)),
      DARK(0.62, 0.7, K('side', 0.2), K('side', 0.8)),
      { m: 'roundel', x: [0.44, 0.55], k: [K('side', 0.2), K('shoulder', 0.6)], mirror: true },
    ],
    exhaust: [{ x: 0.0, y: 0.5, z: 0.35 }, { x: 0.0, y: 0.5, z: -0.35 }],
    extras: ['lmWing', 'fin', 'splitter', 'mirrors'],
  },
  fantasma: {
    L: 4.7,
    W: 1.0,
    wheels: { x: [0.2, 0.8], r: 0.36, w: 0.28, inset: 0.05, cover: 0.52 },
    bottom: [[0, 0.36], [0.08, 0.27], [0.92, 0.25], [1, 0.3]],
    belt: [[0, 0.64], [0.18, 0.76], [0.4, 0.68], [0.6, 0.68], [0.85, 0.56], [1, 0.4]],
    width: [[0, 0.84], [0.25, 1], [0.5, 0.94], [0.75, 1], [1, 0.86]],
    cabin: [[0.27, 0], [0.35, 0.22], [0.47, 0.34], [0.57, 0.31], [0.7, 0.06], [0.73, 0]],
    cabinBase: 0.62,
    cabinTop: 0.42,
    canopy: true,
    rb: 0.1,
    rs: 0.26,
    rr: 0.2,
    tumble: 0.05,
    crown: 0.05,
    roofCrown: 0.05,
    nose: 0.36,
    tail: 0.32,
    flare: 0.06,
    beltBump: 0.12,
    skirt: 0,
    decals: [
      { m: 'dark', x: [0.95, 0.975], k: CROSS(K('side', 0.85)), lift: 0.005 },
      { m: 'head', x: [0.956, 0.969], k: CROSS(K('side', 0.95)), lift: 0.009 },
      { m: 'dark', x: [0.02, 0.045], k: CROSS(K('side', 0.85)), lift: 0.005 },
      { m: 'tail', x: [0.026, 0.039], k: CROSS(K('side', 0.95)), lift: 0.009 },
      { m: 'neon', x: [0.12, 0.88], k: [K('side', 0.18), K('side', 0.26)], mirror: true },
    ],
    exhaust: [],
    extras: ['mirrors'],
  },
};

// ---------------------------------------------------------------- materiais
let HQ = true; // verniz (clearcoat) na pintura fora da qualidade baixa
export function setCarQuality(q) {
  HQ = q !== 'low';
}

const shared = {};
function sharedMats() {
  if (shared.glass) return shared;
  shared.glass = new THREE.MeshStandardMaterial({ color: 0x0b1018, metalness: 0.85, roughness: 0.07 });
  shared.dark = new THREE.MeshStandardMaterial({ color: 0x16181d, metalness: 0.25, roughness: 0.55 });
  shared.chrome = new THREE.MeshStandardMaterial({ color: 0xe4e8ee, metalness: 1.0, roughness: 0.12 });
  shared.head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf4ff, emissiveIntensity: 1.6, roughness: 0.2, side: THREE.DoubleSide });
  shared.tail = new THREE.MeshStandardMaterial({ color: 0xff2a2a, emissive: 0xff1010, emissiveIntensity: 1.4, roughness: 0.3, side: THREE.DoubleSide });
  shared.decalDark = new THREE.MeshStandardMaterial({ color: 0x101114, metalness: 0.3, roughness: 0.5, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
  shared.decalChrome = new THREE.MeshStandardMaterial({ color: 0xe4e8ee, metalness: 1.0, roughness: 0.14, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
  shared.neon = new THREE.MeshBasicMaterial({ color: 0x46f0ff, side: THREE.DoubleSide });
  shared.tire = new THREE.MeshStandardMaterial({ map: tireTexture(), roughness: 0.88, metalness: 0, side: THREE.DoubleSide });
  shared.barrel = new THREE.MeshStandardMaterial({ color: 0x2a2d33, metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide });
  shared.disc = new THREE.MeshStandardMaterial({ map: brakeTexture(), metalness: 0.8, roughness: 0.35, side: THREE.DoubleSide });
  shared.caliper = new THREE.MeshStandardMaterial({ color: 0xd8202a, metalness: 0.3, roughness: 0.35 });
  shared.helmet = new THREE.MeshPhysicalMaterial({ color: 0xf5f5f5, metalness: 0.1, roughness: 0.2, clearcoat: 1 });
  shared.visor = new THREE.MeshStandardMaterial({ color: 0x14161c, metalness: 0.9, roughness: 0.05 });
  shared.flameOuter = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
  shared.flameInner = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  shared.blob = new THREE.MeshBasicMaterial({ map: glowTexture('rgba(0,0,0,0.6)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false });
  return shared;
}

function roundelTexture(num) {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(64, 64, 58, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.font = 'italic 900 62px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(num, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function paintMaterial(p) {
  const o = { color: p.color, metalness: p.metal, roughness: p.rough };
  return HQ ? new THREE.MeshPhysicalMaterial({ ...o, clearcoat: 1, clearcoatRoughness: 0.09 }) : new THREE.MeshStandardMaterial(o);
}

// Perfil de asa (aerofólio) extrudado na envergadura, centrado em (y, z).
function wing(span, chord, thick, y, z, aoa = 0.12) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    const a = t * Math.PI;
    // bordo de ataque arredondado na frente (+u), de fuga fino atrás
    const u = (Math.cos(a) * 0.5) * chord;
    const th = thick * Math.sin(a) * (0.35 + 0.65 * (1 - t) ** 0.6);
    pts.push(new THREE.Vector2(u, th));
  }
  for (let i = 11; i >= 1; i--) {
    const t = i / 12;
    const a = t * Math.PI;
    const u = (Math.cos(a) * 0.5) * chord;
    const th = thick * 0.35 * Math.sin(a) * (1 - t) ** 0.6;
    pts.push(new THREE.Vector2(u, -th));
  }
  const ca = Math.cos(aoa);
  const sa = Math.sin(aoa);
  for (const p of pts) {
    const u = p.x;
    const v = p.y;
    p.set(u * ca - v * sa, u * sa + v * ca);
  }
  const g = extrudeSide(pts, span, {}, 0.01);
  g.translate(0, y, z);
  return g;
}

// Pneu com ombros arredondados (torno em volta do eixo X).
function tireGeometry(r, w, seg = 30) {
  const ri = r * 0.72;
  const rs = Math.min(0.06, w * 0.22);
  const pts = [new THREE.Vector2(ri, -w / 2 + 0.012)];
  pts.push(new THREE.Vector2(r - rs - 0.02, -w / 2));
  for (let a = 0; a <= 90; a += 22.5) pts.push(new THREE.Vector2(r - rs + rs * Math.sin(a * deg), -w / 2 + rs - rs * Math.cos(a * deg)));
  for (let a = 90; a >= 0; a -= 22.5) pts.push(new THREE.Vector2(r - rs + rs * Math.sin(a * deg), w / 2 - rs + rs * Math.cos(a * deg)));
  pts.push(new THREE.Vector2(r - rs - 0.02, w / 2));
  pts.push(new THREE.Vector2(ri, w / 2 - 0.012));
  const g = new THREE.LatheGeometry(pts, seg);
  g.rotateZ(-Math.PI / 2);
  return g;
}

// ------------------------------------------------------------------ montagem
export const CAR_IDS = Object.keys(DEFS);

export function carDims(id) {
  const d = DEFS[id] || DEFS.faisca;
  const wh = d.wheels;
  const w = wh.open ? d.W + wh.outside + (wh.rw || wh.w) : d.W + (d.flare || 0);
  return { length: d.L, width: w * 2 };
}

// detail: 'high' (garagem, jogador) ou 'low' (rivais e qualidade baixa:
// menos seções na carroceria e rodas sem disco/pinça).
export function buildCar(id, look = {}, detail = 'high') {
  const lite = detail === 'low';
  const def = DEFS[id] || DEFS.faisca;
  const M = sharedMats();
  const group = new THREE.Group();
  group.name = 'car-' + id;
  const paintDef = PAINTS.find((p) => p.id === look.paint) || PAINTS[0];
  const paint = paintMaterial(paintDef);
  const accentColor = () => (new THREE.Color(paintDef.color).getHSL({}).l > 0.6 ? 0x16181c : 0xf4f4f4);
  const accent = new THREE.MeshStandardMaterial({ color: accentColor(), metalness: 0.2, roughness: 0.3, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
  const roundel = def.decals.some((dc) => dc.m === 'roundel') ? new THREE.MeshStandardMaterial({ map: roundelTexture(id === 'ciclone' ? '9' : '70'), transparent: true, alphaTest: 0.5, roughness: 0.4, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3 }) : null;
  const L = def.L;
  const zOf = (x) => -(x - 0.5) * L;

  // carroceria (corpo principal + peças como os sidepods do fórmula)
  const bodies = [{ body: new Body(def, undefined, detail), decals: def.decals }];
  for (const p of def.parts || []) for (const sg of [-1, 1]) bodies.push({ body: new Body(p.def, { x: sg * p.x, u: p.u }, detail), decals: p.decals || [] });
  const main = bodies[0].body;
  const decals = { head: [], tail: [], dark: [], chrome: [], accent: [], roundel: [], neon: [] };
  for (const { body, decals: list } of bodies) {
    const mesh = new THREE.Mesh(body.geometry(), [paint, M.glass, M.dark]);
    mesh.castShadow = true;
    group.add(mesh);
    for (const dc of list) {
      const [x0, x1] = dc.x;
      const [k0, k1] = dc.k;
      const nk = Math.max(3, Math.ceil(Math.abs(k1 - k0) * 1.5));
      const nx = Math.max(3, Math.ceil((x1 - x0) * L * 18));
      const lift = dc.lift ?? 0.006;
      decals[dc.m].push(body.patch(x0, x1, k0, k1, lift, nx, nk));
      if (dc.mirror) decals[dc.m].push(body.patch(x0, x1, mirrorK(k1), mirrorK(k0), lift, nx, nk, true));
    }
  }
  const decalMats = { head: M.head, tail: M.tail, dark: M.decalDark, chrome: M.decalChrome, accent, roundel, neon: M.neon };
  for (const k in decals) {
    if (!decals[k].length) continue;
    const m = new THREE.Mesh(mergeGeometries(decals[k]), decalMats[k]);
    m.renderOrder = 1;
    group.add(m);
  }

  // peças extras
  const lists = { paint: [], accent: [], dark: [], chrome: [], head: [], helmet: [], visor: [] };
  const ex = new Set(def.extras || []);
  const W = def.W;
  // fim da cabine na frente (base do para-brisa)
  let xWind = 0.7;
  for (let x = 0.95; x > 0.2; x -= 0.005) {
    if (main.f.cabin(x) > 0.02) {
      xWind = x;
      break;
    }
  }
  let xRoofRear = 0.05;
  for (let x = 0.0; x < 0.8; x += 0.005) {
    if (main.f.cabin(x) > 0.02) {
      xRoofRear = x;
      break;
    }
  }
  if (ex.has('mirrors')) {
    const x = xWind - 0.03;
    const y = main.deckAt(x) + 0.1;
    const lat = Math.min(main.widthAt(x) * (def.cabinBase ?? 0.8) + 0.13, main.widthAt(x) + 0.06);
    for (const s of [-1, 1]) {
      const h = new THREE.SphereGeometry(1, 12, 8);
      h.scale(0.08, 0.06, 0.12);
      h.translate(s * lat, y, zOf(x));
      lists.paint.push(h.toNonIndexed());
      lists.dark.push(box(0.12, 0.025, 0.05, s * (lat - 0.07), y - 0.03, zOf(x) + 0.02));
    }
  }
  if (ex.has('roofSpoiler')) {
    const x = xRoofRear + 0.02;
    lists.paint.push(wing(W * 1.2, 0.34, 0.05, main.topAt(x + 0.04) + 0.02, zOf(x), -0.15));
  }
  if (ex.has('lipSpoiler')) lists.paint.push(wing(W * 1.55, 0.2, 0.04, main.deckAt(0.02) + 0.03, zOf(0.02), -0.25));
  if (ex.has('ducktail')) lists.paint.push(wing(W * 1.7, 0.26, 0.06, main.deckAt(0.015) + 0.04, zOf(0.015), -0.3));
  if (ex.has('scoop')) {
    const y = main.deckAt(0.8);
    const pts = [
      [-0.35, 0],
      [0.32, 0],
      [0.32, 0.15],
      [0.1, 0.17],
      [-0.35, 0.03],
    ].map(([u, v]) => new THREE.Vector2(u, v));
    const g = extrudeSide(pts, 0.6, {}, 0.03);
    g.translate(0, y - 0.01, zOf(0.8));
    lists.paint.push(g);
    lists.dark.push(box(0.5, 0.1, 0.03, 0, y + 0.08, zOf(0.8) - 0.33));
  }
  const wingStruts = (span, y, x, sx = 0.42) => {
    for (const s of [-1, 1]) {
      const pts = [
        [-0.12, 0],
        [0.12, 0],
        [0.06, 1],
        [-0.1, 1],
      ].map(([u, v]) => new THREE.Vector2(u, v));
      const base = main.deckAt(x);
      const g = extrudeSide(pts, 0.035, {}, 0);
      g.scale(1, y - base + 0.02, 1);
      g.translate(s * sx, base - 0.02, zOf(x));
      lists.dark.push(g);
    }
  };
  if (ex.has('lowWing')) {
    const x = 0.05;
    const y = main.deckAt(x) + 0.2;
    lists.dark.push(wing(W * 1.75, 0.4, 0.06, y, zOf(x)));
    for (const s of [-1, 1]) lists.dark.push(box(0.03, 0.22, 0.46, s * W * 0.88, y + 0.02, zOf(x)));
    wingStruts(W, y, x + 0.02);
  }
  if (ex.has('bigWing')) {
    const x = 0.06;
    const y = main.deckAt(x) + 0.46;
    lists.dark.push(wing(W * 1.85, 0.5, 0.08, y, zOf(x), 0.2));
    lists.dark.push(wing(W * 1.85, 0.26, 0.05, y + 0.12, zOf(x) + 0.26, 0.5));
    for (const s of [-1, 1]) lists.dark.push(box(0.03, 0.42, 0.72, s * W * 0.93, y + 0.04, zOf(x) + 0.08));
    wingStruts(W, y, x + 0.02, 0.36);
  }
  if (ex.has('lmWing')) {
    const x = 0.04;
    const y = main.deckAt(x) + 0.32;
    lists.dark.push(wing(W * 2.0, 0.44, 0.07, y, zOf(x), 0.15));
    for (const s of [-1, 1]) {
      const pts = [
        [-0.3, -0.28],
        [0.36, -0.42],
        [0.36, 0.08],
        [-0.28, 0.12],
      ].map(([u, v]) => new THREE.Vector2(u, v));
      const g = extrudeSide(pts, 0.035, {}, 0.01);
      g.translate(s * W * 1.0, y, zOf(x) - 0.02);
      lists.paint.push(g);
    }
  }
  if (ex.has('fin')) {
    const x0 = xRoofRear + 0.04;
    const x1 = 0.03;
    const yTop = ex.has('lmWing') ? main.deckAt(0.04) + 0.36 : main.deckAt(x1) + 0.18;
    const pts = [
      [(x0 - 0.5) * L, main.topAt(x0) - 0.02],
      [(x1 - 0.5) * L, yTop],
      [(x1 - 0.5) * L - 0.05, main.deckAt(x1) - 0.04],
      [(x0 - 0.5) * L + 0.3, main.deckAt(x0 - 0.05) - 0.04],
    ].map(([u, v]) => new THREE.Vector2(u, v));
    lists.paint.push(extrudeSide(pts, 0.035, {}, 0));
  }
  if (ex.has('splitter')) {
    const pts = [
      [-0.25, 0],
      [0.12, 0],
      [0.14, 0.03],
      [-0.25, 0.05],
    ].map(([u, v]) => new THREE.Vector2(u, v));
    const g = extrudeSide(pts, W * 1.9, {}, 0.01);
    g.translate(0, main.params(0.99).b - 0.06, zOf(0.985));
    lists.dark.push(g);
  }
  if (ex.has('roundLights')) {
    const bol = id === 'bolido';
    const pos = bol ? [{ x: 0.935, k: K('shoulder', 0.25), r: 0.12 }] : [{ x: 0.999, k: K('side', 0.85), r: 0.1 }, { x: 0.999, k: K('side', 0.85), r: 0.09, inner: true }];
    for (const l of pos) {
      for (const s of [-1, 1]) {
        let p;
        let n;
        if (bol) {
          p = main.point(l.x, s > 0 ? l.k : mirrorK(l.k));
          n = main.normal(l.x, s > 0 ? l.k : mirrorK(l.k));
          n.y *= 0.3;
          n.z = Math.min(n.z, -0.6);
          n.normalize();
        } else {
          const W0 = main.widthAt(0.99);
          p = new THREE.Vector3(s * (l.inner ? W0 * 0.45 : W0 * 0.72), main.deckAt(0.99) - 0.2, zOf(1) + 0.02);
          n = new THREE.Vector3(0, 0, -1);
        }
        const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), n);
        const lamp = new THREE.CylinderGeometry(l.r * 0.82, l.r * 0.82, 0.06, 20);
        lamp.applyQuaternion(q);
        lamp.translate(p.x + n.x * 0.04, p.y + n.y * 0.04, p.z + n.z * 0.04);
        lists.head.push(lamp.toNonIndexed());
        const ring = new THREE.TorusGeometry(l.r * 0.9, l.r * 0.12, 8, 24);
        ring.rotateX(Math.PI / 2);
        ring.applyQuaternion(q);
        ring.translate(p.x + n.x * 0.06, p.y + n.y * 0.06, p.z + n.z * 0.06);
        lists.chrome.push(ring.toNonIndexed());
      }
    }
  }
  if (ex.has('sidePipes')) {
    for (const s of [-1, 1]) {
      const lat = main.widthAt(0.5) + 0.04;
      lists.chrome.push(tube([s * lat, 0.3, zOf(0.66)], [s * lat, 0.3, zOf(0.3)], 0.05, 10));
      lists.dark.push(tube([s * lat, 0.3, zOf(0.3)], [s * lat, 0.3, zOf(0.29)], 0.04, 10));
    }
  }
  if (ex.has('driver')) {
    const f1 = id === 'tufao';
    const x = f1 ? 0.535 : 0.5;
    const y = f1 ? main.deckAt(x) + 0.12 : 1.18;
    const g = new THREE.SphereGeometry(0.17, 18, 14);
    g.translate(0, y, zOf(x));
    lists.helmet.push(g.toNonIndexed());
    const v = new THREE.SphereGeometry(0.172, 16, 8, -0.9, 1.8, 1.2, 0.55);
    v.rotateY(Math.PI);
    v.translate(0, y, zOf(x));
    lists.visor.push(v.toNonIndexed());
  }
  if (ex.has('halo')) {
    const x0 = 0.6;
    const yb = main.deckAt(x0);
    lists.dark.push(tube([-0.24, yb, zOf(0.53)], [-0.22, yb + 0.26, zOf(0.565)], 0.028), tube([0.24, yb, zOf(0.53)], [0.22, yb + 0.26, zOf(0.565)], 0.028), tube([-0.22, yb + 0.26, zOf(0.565)], [0.22, yb + 0.26, zOf(0.565)], 0.028), tube([0, yb + 0.26, zOf(0.565)], [0, yb + 0.02, zOf(0.64)], 0.03));
  }
  if (ex.has('f1wings')) {
    // asa dianteira em dois planos com placas
    lists.paint.push(wing(1.95, 0.42, 0.05, 0.14, zOf(0.985), 0.05));
    lists.accent.push(wing(1.7, 0.22, 0.04, 0.24, zOf(0.97) + 0.06, 0.35));
    for (const s of [-1, 1]) lists.dark.push(box(0.03, 0.22, 0.56, s * 0.98, 0.2, zOf(0.98)));
    lists.dark.push(box(0.12, 0.12, 0.3, 0, 0.24, zOf(0.97)));
    // asa traseira
    const y = 0.98;
    lists.paint.push(wing(1.3, 0.42, 0.07, y, zOf(0.0) + 0.05, 0.2));
    lists.accent.push(wing(1.3, 0.2, 0.04, y + 0.14, zOf(0.0) + 0.24, 0.6));
    for (const s of [-1, 1]) lists.dark.push(box(0.035, 0.56, 0.62, s * 0.66, y - 0.08, zOf(0.0) + 0.1));
    lists.dark.push(box(0.06, 0.42, 0.12, 0, y - 0.22, zOf(0.01) + 0.05));
  }
  if (ex.has('cage')) {
    const r = 0.04;
    const z = 0.5;
    const P = (x, v, s) => [s * z, v, zOf(x)];
    for (const s of [-1, 1]) {
      lists.dark.push(tube(P(0.31, 0.9, s), P(0.34, 1.62, s), r));
      lists.dark.push(tube(P(0.66, 0.9, s), P(0.56, 1.55, s), r));
      lists.dark.push(tube(P(0.34, 1.62, s), P(0.56, 1.55, s), r));
      lists.dark.push(tube(P(0.34, 1.62, s), P(0.1, 0.95, s), r));
    }
    lists.dark.push(tube(P(0.34, 1.62, -1), P(0.34, 1.62, 1), r));
    lists.dark.push(tube(P(0.56, 1.55, -1), P(0.56, 1.55, 1), r));
    lists.dark.push(tube(P(0.31, 0.9, -1), P(0.34, 1.62, 1), r));
  }
  if (ex.has('lightbar')) {
    lists.dark.push(box(0.9, 0.08, 0.1, 0, 1.64, zOf(0.56)));
    for (let i = 0; i < 4; i++) lists.head.push(box(0.14, 0.07, 0.03, -0.33 + i * 0.22, 1.64, zOf(0.56) - 0.06));
  }
  if (ex.has('bullbar')) lists.chrome.push(tube([-0.5, 0.62, zOf(1) - 0.08], [0.5, 0.62, zOf(1) - 0.08], 0.045), tube([-0.4, 0.62, zOf(1) - 0.08], [-0.3, 0.82, zOf(0.98)], 0.035), tube([0.4, 0.62, zOf(1) - 0.08], [0.3, 0.82, zOf(0.98)], 0.035));
  if (ex.has('spare')) {
    const g = new THREE.CylinderGeometry(0.34, 0.34, 0.2, 18);
    g.translate(0, 1.0, zOf(0.1));
    const m = new THREE.Mesh(g, M.tire);
    m.castShadow = true;
    group.add(m);
  }

  // escapamentos
  const exhausts = [];
  for (const e of def.exhaust) {
    const z = zOf(e.x) + 0.06;
    const g = new THREE.CylinderGeometry(0.065, 0.075, 0.24, 14, 1, true);
    g.rotateX(Math.PI / 2);
    g.translate(e.z, e.y, z - 0.05);
    lists.chrome.push(g.toNonIndexed());
    const inner = new THREE.CircleGeometry(0.06, 14);
    inner.translate(e.z, e.y, z - 0.02);
    lists.dark.push(inner.toNonIndexed());
    exhausts.push(new THREE.Vector3(e.z, e.y, z + 0.08));
  }

  const mats = { paint, accent, dark: M.dark, chrome: M.chrome, head: M.head, helmet: M.helmet, visor: M.visor };
  for (const k in lists) {
    if (!lists[k].length) continue;
    const m = new THREE.Mesh(mergeGeometries(lists[k]), mats[k]);
    m.castShadow = k !== 'head';
    group.add(m);
  }

  // para-lamas do buggy (meio arco sobre cada roda)
  const wh = def.wheels;
  const wheelX = (i) => {
    const x = wh.x[i];
    const w = i === 0 ? wh.rw || wh.w : wh.w;
    const Wb = main.widthAt(x);
    return wh.open ? Wb + wh.outside + w / 2 : Wb - w / 2 - (wh.inset ?? 0.04);
  };
  if (ex.has('mudguards')) {
    for (let i = 0; i < 2; i++) {
      const r = (i === 0 ? wh.rr || wh.r : wh.r) + 0.08;
      const w = (i === 0 ? wh.rw || wh.w : wh.w) + 0.08;
      for (const s of [-1, 1]) {
        const g = new THREE.CylinderGeometry(r, r, w, 18, 1, true, Math.PI * 0.18, Math.PI * 0.64);
        g.rotateZ(Math.PI / 2);
        g.translate(s * wheelX(i), r - 0.08, zOf(wh.x[i]));
        const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x1c1e22, roughness: 0.6, side: THREE.DoubleSide }));
        m.castShadow = true;
        group.add(m);
      }
    }
  }

  // rodas: pneu, aro vazado, disco e pinça de freio
  const wheels = [];
  const rimDef = RIMS.find((r) => r.id === look.rim) || RIMS[0];
  const rimMat = new THREE.MeshStandardMaterial({ map: rimTexture(rimDef.style, rimDef.color), metalness: 0.75, roughness: 0.25, alphaTest: 0.45, side: THREE.DoubleSide });
  for (let i = 0; i < 2; i++) {
    const rear = i === 0;
    const r = rear ? wh.rr || wh.r : wh.r;
    const w = rear ? wh.rw || wh.w : wh.w;
    for (const s of [-1, 1]) {
      const pivot = new THREE.Group();
      pivot.position.set(s * wheelX(i), r, zOf(wh.x[i]));
      const spin = new THREE.Group();
      pivot.add(spin);
      const tire = new THREE.Mesh(tireGeometry(r, w, lite ? 18 : 30), M.tire);
      tire.castShadow = true;
      spin.add(tire);
      const ri = r * 0.72;
      const face = new THREE.Mesh(new THREE.CircleGeometry(ri * 0.99, lite ? 16 : 28).rotateY((s * Math.PI) / 2), rimMat);
      face.position.x = s * (w / 2 - 0.035);
      spin.add(face);
      if (lite) {
        // fundo escuro atrás dos raios no lugar de disco e pinça
        const back = new THREE.Mesh(new THREE.CircleGeometry(ri * 0.95, 14).rotateY((s * Math.PI) / 2), M.barrel);
        back.position.x = s * (w / 2 - 0.09);
        spin.add(back);
      } else {
        const barrel = new THREE.CylinderGeometry(ri * 0.98, ri * 0.98, w * 0.86, 22, 1, true);
        barrel.rotateZ(Math.PI / 2);
        spin.add(new THREE.Mesh(barrel, M.barrel));
        const disc = new THREE.Mesh(new THREE.CircleGeometry(ri * 0.8, 24).rotateY((s * Math.PI) / 2), M.disc);
        disc.position.x = s * (w / 2 - 0.11);
        spin.add(disc);
        const cal = new THREE.Mesh(new THREE.BoxGeometry(0.07, ri * 0.55, ri * 0.4), M.caliper);
        cal.position.set(s * (w / 2 - 0.08), ri * 0.42, ri * 0.32);
        cal.rotation.x = -0.6;
        pivot.add(cal);
      }
      group.add(pivot);
      wheels.push({ pivot, spin, r, front: !rear });
    }
  }

  // chamas do turbo
  const flames = [];
  for (const e of exhausts) {
    const og = new THREE.ConeGeometry(0.13, 1, 10, 1, true);
    og.rotateX(Math.PI / 2);
    og.translate(0, 0, 0.5);
    const ig = new THREE.ConeGeometry(0.07, 0.6, 8, 1, true);
    ig.rotateX(Math.PI / 2);
    ig.translate(0, 0, 0.3);
    const f = new THREE.Group();
    f.add(new THREE.Mesh(og, M.flameOuter));
    f.add(new THREE.Mesh(ig, M.flameInner));
    f.position.copy(e);
    f.visible = false;
    group.add(f);
    flames.push(f);
  }

  // sombra simples e neon
  const dims = carDims(id);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(dims.width * 1.3, dims.length * 1.12), M.blob);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  blob.renderOrder = 1;
  group.add(blob);
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.95 });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(dims.width * 2.1, dims.length * 1.5), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.05;
  glow.renderOrder = 2;
  group.add(glow);

  const car = {
    id,
    group,
    wheels,
    flames,
    paint,
    accent,
    rimMat,
    glow,
    glowMat,
    neon: null,
    dims,
    t: 0,
    setPaint(pid) {
      const p = PAINTS.find((x) => x.id === pid) || PAINTS[0];
      paint.color.setHex(p.color);
      paint.metalness = p.metal;
      paint.roughness = p.rough;
      accent.color.setHex(new THREE.Color(p.color).getHSL({}).l > 0.6 ? 0x16181c : 0xf4f4f4);
    },
    setRim(rid) {
      const r = RIMS.find((x) => x.id === rid) || RIMS[0];
      rimMat.map = rimTexture(r.style, r.color);
      rimMat.needsUpdate = true;
    },
    setNeon(nid) {
      const n = NEONS.find((x) => x.id === nid) || NEONS[0];
      this.neon = n.color;
      glow.visible = !!n.color;
      if (n.color && n.color !== 'rainbow') glowMat.color.setHex(n.color);
    },
    // speed: rotação das rodas; steer: -1..1; boost: 0..1
    animate(dt, speed, steer, boost) {
      this.t += dt;
      for (const w of wheels) {
        w.spin.rotation.x -= (speed * dt) / w.r;
        if (w.front) w.pivot.rotation.y = -steer * 0.38;
      }
      const on = boost > 0.05;
      for (const f of flames) {
        f.visible = on;
        if (on) {
          const k = 0.7 + Math.random() * 0.5;
          f.scale.set(k, k, (0.6 + boost * 0.9) * (0.8 + Math.random() * 0.4));
        }
      }
      if (this.neon === 'rainbow') glowMat.color.setHSL((this.t * 0.25) % 1, 1, 0.55);
    },
    dispose() {
      group.traverse((o) => {
        if (o.isMesh && o.geometry) o.geometry.dispose();
      });
      paint.dispose();
      accent.dispose();
      rimMat.dispose();
      glowMat.dispose();
      if (roundel) {
        roundel.map.dispose();
        roundel.dispose();
      }
    },
  };
  car.setNeon(look.neon || 'nenhum');
  return car;
}

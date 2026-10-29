// Nível 55 — construção das duas seções a partir do mapa (Map55):
//   seção 1: painéis amarelos esmaltados com juntas (algumas em diagonal), teto
//            amarelo perfurado com luminárias lineares, piso de granilite e
//            escadas com faixas antiderrapantes e corrimão de inox;
//   seção 2: hotel — parede creme texturizada em cima, barrado azul embaixo,
//            moldura e rodapé azul-marinho, teto de placas brancas com spots
//            redondos, carpete azul com passadeiras de borda grega.
// A luz das luminárias é calculada nos vértices, com sombra das paredes.
import * as THREE from 'three';
import { TEX } from '../textures.js';
import { clamp, mulberry32, TAU } from '../util.js';
import { RISE, TREAD } from './level55_map.js';

const R = 0.25;
const FC = 0.5;

// ------------------------------------------------------------ texturas
export function yellowPanelTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, S, S);
  g.addColorStop(0, '#e8bc06');
  g.addColorStop(0.5, '#e2b400');
  g.addColorStop(1, '#dcae00');
  x.fillStyle = g;
  x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(60,40,0,0.75)';
  x.lineWidth = Math.max(1.5, S / 300);
  // juntas: verticais a cada meia textura, uma horizontal e uma diagonal (como na foto)
  for (const u of [0, 0.5]) {
    x.beginPath();
    x.moveTo(u * S, 0);
    x.lineTo(u * S, S);
    x.stroke();
  }
  x.beginPath();
  x.moveTo(0, S * 0.62);
  x.lineTo(S * 0.5, S * 0.48);
  x.stroke();
  x.beginPath();
  x.moveTo(S * 0.5, S * 0.3);
  x.lineTo(S, S * 0.42);
  x.stroke();
  const r = mulberry32(551);
  for (let i = 0; i < 600; i++) {
    x.fillStyle = `rgba(255,255,220,${r() * 0.03})`;
    x.fillRect(r() * S, r() * S, 2 + r() * 6, 1);
  }
  return TEX.toTex(c);
}

export function perforatedTex(S, base = '#f0c400', hole = 'rgba(70,45,0,0.75)') {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = base;
  x.fillRect(0, 0, S, S);
  const n = 24;
  const t = S / n;
  x.fillStyle = hole;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      x.beginPath();
      x.arc((i + 0.5 + (j % 2) * 0.5) * t, (j + 0.5) * t, t * 0.13, 0, TAU);
      x.fill();
    }
  x.strokeStyle = 'rgba(40,25,0,0.8)';
  x.lineWidth = Math.max(2, S / 200);
  x.strokeRect(0, 0, S, S);
  return TEX.toTex(c);
}

export function terrazzoTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#c9cacb';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(552);
  const n = Math.floor((S * S) / 30);
  for (let i = 0; i < n; i++) {
    const v = r();
    x.fillStyle = v < 0.45 ? `rgba(90,92,96,${0.4 + r() * 0.5})` : v < 0.8 ? `rgba(250,250,250,${0.5 + r() * 0.5})` : `rgba(150,140,130,${0.5})`;
    const s = (0.6 + r() * 1.6) * (S / 512);
    x.fillRect(r() * S, r() * S, s, s);
  }
  return TEX.toTex(c);
}

export function stuccoTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#e8dcc4';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(553);
  for (let i = 0; i < (S * S) / 18; i++) {
    x.fillStyle = r() < 0.5 ? `rgba(255,250,236,${r() * 0.25})` : `rgba(150,130,100,${r() * 0.18})`;
    const s = 1 + r() * 2.5;
    x.fillRect(r() * S, r() * S, s, s);
  }
  return TEX.toTex(c);
}

export function bluePaintTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#4a6a8e';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(554);
  for (let i = 0; i < 2400; i++) {
    x.fillStyle = r() < 0.5 ? `rgba(120,150,190,${r() * 0.06})` : `rgba(20,30,50,${r() * 0.06})`;
    x.fillRect(r() * S, r() * S, 2 + r() * 8, 1 + r() * 2);
  }
  return TEX.toTex(c);
}

export function blueCarpetTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#3c5c84';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(555);
  for (let i = 0; i < (S * S) / 6; i++) {
    x.fillStyle = r() < 0.5 ? `rgba(100,130,170,${r() * 0.25})` : `rgba(20,30,50,${r() * 0.25})`;
    x.fillRect(r() * S, r() * S, 1, 1);
  }
  return TEX.toTex(c);
}

// Passadeira: miolo azul com losangos e borda creme em "grega".
export function runnerTex() {
  const W = 256;
  const Hh = 512;
  const c = TEX.makeCanvas(W, Hh);
  const x = c.getContext('2d');
  x.fillStyle = '#e8dcb8';
  x.fillRect(0, 0, W, Hh);
  x.fillStyle = '#2f4a70';
  x.fillRect(26, 26, W - 52, Hh - 52);
  // grega
  x.strokeStyle = '#2f4a70';
  x.lineWidth = 3;
  const key = (x0, y0, w, h, horiz) => {
    const n = Math.floor((horiz ? w : h) / 16);
    for (let i = 0; i < n; i++) {
      const ox = horiz ? x0 + i * 16 : x0;
      const oy = horiz ? y0 : y0 + i * 16;
      x.beginPath();
      if (horiz) {
        x.moveTo(ox, oy + 14);
        x.lineTo(ox, oy + 4);
        x.lineTo(ox + 10, oy + 4);
        x.lineTo(ox + 10, oy + 10);
        x.lineTo(ox + 5, oy + 10);
      } else {
        x.moveTo(ox + 14, oy);
        x.lineTo(ox + 4, oy);
        x.lineTo(ox + 4, oy + 10);
        x.lineTo(ox + 10, oy + 10);
        x.lineTo(ox + 10, oy + 5);
      }
      x.stroke();
    }
  };
  key(4, 4, W - 8, 18, true);
  key(4, Hh - 22, W - 8, 18, true);
  key(4, 4, 18, Hh - 8, false);
  key(W - 22, 4, 18, Hh - 8, false);
  // miolo: losangos claros
  x.strokeStyle = 'rgba(150,180,220,0.6)';
  x.lineWidth = 1.5;
  for (let i = -20; i < 40; i++) {
    x.beginPath();
    x.moveTo(26 + i * 16, 26);
    x.lineTo(26 + i * 16 + (Hh - 52), Hh - 26);
    x.stroke();
    x.beginPath();
    x.moveTo(W - 26 - i * 16, 26);
    x.lineTo(W - 26 - i * 16 - (Hh - 52), Hh - 26);
    x.stroke();
  }
  x.fillStyle = '#e8dcb8';
  x.fillRect(0, 0, 26, Hh);
  x.fillRect(W - 26, 0, 26, Hh);
  x.fillRect(0, 0, W, 26);
  x.fillRect(0, Hh - 26, W, 26);
  key(4, 4, W - 8, 18, true);
  key(4, Hh - 22, W - 8, 18, true);
  key(4, 4, 18, Hh - 8, false);
  key(W - 22, 4, 18, Hh - 8, false);
  return TEX.toTex(c, { repeat: false });
}

export function plankTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#ece8e0';
  x.fillRect(0, 0, S, S);
  x.strokeStyle = 'rgba(90,85,75,0.55)';
  x.lineWidth = Math.max(2, S / 160);
  for (const v of [0, 0.5]) {
    x.beginPath();
    x.moveTo(0, v * S);
    x.lineTo(S, v * S);
    x.stroke();
  }
  const r = mulberry32(556);
  for (let i = 0; i < 2000; i++) {
    x.fillStyle = `rgba(120,110,90,${r() * 0.05})`;
    x.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
  }
  return TEX.toTex(c);
}

export function navyDoorTex() {
  const c = TEX.makeCanvas(128, 256);
  const x = c.getContext('2d');
  x.fillStyle = '#1a2438';
  x.fillRect(0, 0, 128, 256);
  const r = mulberry32(557);
  for (let i = 0; i < 400; i++) {
    x.fillStyle = `rgba(80,100,140,${r() * 0.08})`;
    x.fillRect(r() * 128, r() * 256, 1, 4 + r() * 10);
  }
  return TEX.toTex(c, { repeat: false });
}

// ------------------------------------------------------------ luz calculada
export function bakeFn(M, lamps, o = {}) {
  const B = 6;
  const grid = new Map();
  const reach = o.reach || 12;
  for (const l of lamps) {
    for (let i = Math.floor((l.x - reach) / B); i <= Math.floor((l.x + reach) / B); i++)
      for (let j = Math.floor((l.z - reach) / B); j <= Math.floor((l.z + reach) / B); j++) {
        const k = i * 10000 + j;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(l);
      }
  }
  const amb = o.amb ?? 0.12;
  const fallK = o.fall ?? 0.22;
  const gain = o.gain ?? 1.3;
  return (x, y, z, nx, ny, nz) => {
    const list = grid.get(Math.floor(x / B) * 10000 + Math.floor(z / B)) || [];
    let L = amb;
    const sx = x + nx * 0.06;
    const sz = z + nz * 0.06;
    for (const l of list) {
      const dx = l.x - x;
      const dy = l.y - y;
      const dz = l.z - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > reach * reach) continue;
      if (!M.clear(sx, sz, l.x, l.z, 0.01)) continue;
      const d = Math.sqrt(d2);
      const lam = Math.max(0, (dx * nx + dy * ny + dz * nz) / d);
      L += (l.k * (0.3 + 1.2 * lam) * gain) / (1 + d2 * fallK);
    }
    return clamp(L, 0, o.max || 1.7);
  };
}

// ------------------------------------------------------------ malhas
class Mesher {
  constructor() {
    this.p = [];
    this.n = [];
    this.u = [];
    this.c = [];
    this.i = [];
  }

  quad(P, N, U, C) {
    const b = this.p.length / 3;
    for (let k = 0; k < 4; k++) {
      this.p.push(...P[k]);
      this.n.push(...N);
      this.u.push(...U[k]);
      this.c.push(...C[k]);
    }
    this.i.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }

  // quadrilátero com a frente para `want` (corrige a ordem se preciso)
  face(P, want, col, uvf, light) {
    const e1 = [P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]];
    const e2 = [P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) {
      P = [P[3], P[2], P[1], P[0]];
      n = [-n[0], -n[1], -n[2]];
    }
    const l = Math.hypot(...n) || 1;
    n = [n[0] / l, n[1] / l, n[2] / l];
    const C = P.map((p) => {
      const L = light ? light(p[0], p[1], p[2], n[0], n[1], n[2]) : 1;
      return [col[0] * L, col[1] * L, col[2] * L];
    });
    this.quad(P, n, P.map(uvf), C);
  }

  // caixa (alinhada aos eixos) com luz por vértice
  box(x0, x1, y0, y1, z0, z1, col, light, uvs = 1, skip = '') {
    const uvXZ = (p) => [p[0] / uvs, p[2] / uvs];
    const uvXY = (p) => [p[0] / uvs, p[1] / uvs];
    const uvZY = (p) => [p[2] / uvs, p[1] / uvs];
    if (!skip.includes('py'))
      this.face(
        [
          [x0, y1, z0],
          [x1, y1, z0],
          [x1, y1, z1],
          [x0, y1, z1],
        ],
        [0, 1, 0],
        col,
        uvXZ,
        light,
      );
    if (!skip.includes('pz'))
      this.face(
        [
          [x0, y0, z1],
          [x1, y0, z1],
          [x1, y1, z1],
          [x0, y1, z1],
        ],
        [0, 0, 1],
        col,
        uvXY,
        light,
      );
    if (!skip.includes('nz'))
      this.face(
        [
          [x0, y0, z0],
          [x1, y0, z0],
          [x1, y1, z0],
          [x0, y1, z0],
        ],
        [0, 0, -1],
        col,
        uvXY,
        light,
      );
    if (!skip.includes('px'))
      this.face(
        [
          [x1, y0, z0],
          [x1, y0, z1],
          [x1, y1, z1],
          [x1, y1, z0],
        ],
        [1, 0, 0],
        col,
        uvZY,
        light,
      );
    if (!skip.includes('nx'))
      this.face(
        [
          [x0, y0, z0],
          [x0, y0, z1],
          [x0, y1, z1],
          [x0, y1, z0],
        ],
        [-1, 0, 0],
        col,
        uvZY,
        light,
      );
  }

  // tubo de 6 lados entre dois pontos (corrimão)
  tube(a, b, r, col, light) {
    const d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const L = Math.hypot(...d);
    const u = [d[0] / L, d[1] / L, d[2] / L];
    let v = Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let w = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const wl = Math.hypot(...w);
    w = w.map((q) => q / wl);
    v = [w[1] * u[2] - w[2] * u[1], w[2] * u[0] - w[0] * u[2], w[0] * u[1] - w[1] * u[0]];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU;
      const a1 = ((i + 1) / n) * TAU;
      const o0 = [0, 1, 2].map((k) => (Math.cos(a0) * v[k] + Math.sin(a0) * w[k]) * r);
      const o1 = [0, 1, 2].map((k) => (Math.cos(a1) * v[k] + Math.sin(a1) * w[k]) * r);
      const am = (a0 + a1) / 2;
      const nn = [0, 1, 2].map((k) => Math.cos(am) * v[k] + Math.sin(am) * w[k]);
      this.face(
        [
          [a[0] + o0[0], a[1] + o0[1], a[2] + o0[2]],
          [b[0] + o0[0], b[1] + o0[1], b[2] + o0[2]],
          [b[0] + o1[0], b[1] + o1[1], b[2] + o1[2]],
          [a[0] + o1[0], a[1] + o1[1], a[2] + o1[2]],
        ],
        nn,
        col,
        () => [0, 0],
        light,
      );
    }
  }

  get empty() {
    return this.p.length === 0;
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.c, 3));
    g.setIndex(this.p.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
    g.computeBoundingSphere();
    return g;
  }
}
export { Mesher };

// Curva zero do campo (quadrados em marcha).
function contour(M) {
  const B = M.bounds;
  const x0 = Math.floor(B.x0 / R) * R;
  const z0 = Math.floor(B.z0 / R) * R;
  const nx = Math.ceil((B.x1 - x0) / R) + 1;
  const nz = Math.ceil((B.z1 - z0) / R) + 1;
  const v = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = M.sdf(x0 + i * R, z0 + j * R);
  const segs = [];
  const lp = (ax, az, va, bx, bz, vb) => {
    const t = va / (va - vb);
    return [ax + (bx - ax) * t, az + (bz - az) * t];
  };
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = v[j * nx + i];
      const b = v[j * nx + i + 1];
      const c = v[(j + 1) * nx + i + 1];
      const d = v[(j + 1) * nx + i];
      const idx = (a < 0 ? 1 : 0) | (b < 0 ? 2 : 0) | (c < 0 ? 4 : 0) | (d < 0 ? 8 : 0);
      if (idx === 0 || idx === 15) continue;
      const X = x0 + i * R;
      const Z = z0 + j * R;
      const e = [];
      if (a < 0 !== b < 0) e[0] = lp(X, Z, a, X + R, Z, b);
      if (b < 0 !== c < 0) e[1] = lp(X + R, Z, b, X + R, Z + R, c);
      if (c < 0 !== d < 0) e[2] = lp(X + R, Z + R, c, X, Z + R, d);
      if (d < 0 !== a < 0) e[3] = lp(X, Z + R, d, X, Z, a);
      const ks = [0, 1, 2, 3].filter((k) => e[k]);
      if (ks.length === 2) segs.push([e[ks[0]], e[ks[1]]]);
      else if (ks.length === 4) {
        const mid = M.sdf(X + R / 2, Z + R / 2) < 0;
        if ((a < 0) === mid) {
          segs.push([e[0], e[1]], [e[2], e[3]]);
        } else {
          segs.push([e[0], e[3]], [e[1], e[2]]);
        }
      }
    }
  // junta segmentos colineares em sequência (menos vértices)
  return segs;
}

// Paredes: faixas verticais (y relativo ao piso local). bands: [{ y0, y1, off, mat, col, uv }]
export function buildWalls(M, light, bands) {
  const segs = contour(M);
  const out = {};
  const H = M.H;
  for (const [a, b] of segs) {
    const g = M.grad((a[0] + b[0]) / 2, (a[1] + b[1]) / 2);
    const n = [-g[0], -g[1]];
    // altura do piso logo à frente de cada ponta (o piso da escada é uma rampa;
    // a parede começa um degrau abaixo para não deixar fresta)
    const fa = M.floorY(a[0] + n[0] * 0.15, a[1] + n[1] * 0.15);
    const fb = M.floorY(b[0] + n[0] * 0.15, b[1] + n[1] * 0.15);
    const st = M.stairAt((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0.4);
    for (const B of bands) {
      const m = out[B.mat] || (out[B.mat] = new Mesher());
      const lo = (f) => f + (B.y0 === 0 && st ? -RISE * 1.2 : B.y0);
      const hi = (f) => f + (B.y1 === 'H' ? H : B.y1);
      const ax = a[0] + n[0] * B.off;
      const az = a[1] + n[1] * B.off;
      const bx = b[0] + n[0] * B.off;
      const bz = b[1] + n[1] * B.off;
      const tu = (p) => (p[0] * -n[1] + p[2] * n[0]) / B.uv;
      m.face(
        [
          [ax, lo(fa), az],
          [bx, lo(fb), bz],
          [bx, hi(fb), bz],
          [ax, hi(fa), az],
        ],
        [n[0], 0, n[1]],
        B.col,
        (p) => [tu(p), (p[1] - (B.uvAbs ? 0 : Math.min(fa, fb))) / B.uv],
        light,
      );
      if (B.off > 0 && B.top) {
        const y = hi(fa);
        const yb = hi(fb);
        m.face(
          [
            [a[0], y, a[1]],
            [b[0], yb, b[1]],
            [bx, yb, bz],
            [ax, y, az],
          ],
          [0, 1, 0],
          B.col,
          (p) => [p[0], p[2]],
          light,
        );
      }
    }
  }
  return out;
}

// Piso e teto em grade; as escadas são caixas à parte.
export function buildFloorCeil(M, light, o) {
  const B = M.bounds;
  const x0 = Math.floor(B.x0 / FC) * FC;
  const z0 = Math.floor(B.z0 / FC) * FC;
  const nx = Math.ceil((B.x1 - x0) / FC) + 1;
  const nz = Math.ceil((B.z1 - z0) / FC) + 1;
  const make = (ceil) => {
    const pos = [];
    const nor = [];
    const uv = [];
    const cc = [];
    const idx = [];
    const map = new Map();
    const uvS = ceil ? o.ceilUV : o.floorUV;
    const col = ceil ? o.ceilCol : o.floorCol;
    const ny = ceil ? -1 : 1;
    const vert = (i, j, ref) => {
      const k = j * nx + i;
      // o vértice usa a altura da forma da célula que o pediu (evita rasgos nas bordas)
      const x = x0 + i * FC;
      const z = z0 + j * FC;
      const key = k * 4 + Math.round((ref + 10) * 2);
      if (map.has(key)) return map.get(key);
      let f = M.floorY(x, z);
      if (Math.abs(f - ref) > 0.05 && !M.stairAt(x, z, 0.3)) f = ref;
      const y = ceil ? f + M.H : f;
      pos.push(x, y, z);
      nor.push(0, ny, 0);
      uv.push(x / uvS, z / uvS);
      let lx = x;
      let lz = z;
      const d = M.sdf(x, z);
      if (d > -0.05) {
        const g = M.grad(x, z);
        lx -= g[0] * (d + 0.08);
        lz -= g[1] * (d + 0.08);
      }
      const L = light(lx, y, lz, 0, ny, 0);
      cc.push(col[0] * L, col[1] * L, col[2] * L);
      map.set(key, pos.length / 3 - 1);
      return map.get(key);
    };
    for (let j = 0; j < nz - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const cx = x0 + (i + 0.5) * FC;
        const cz = z0 + (j + 0.5) * FC;
        if (M.sdf(cx, cz) > FC * 0.75) continue;
        if (!ceil && M.stairAt(cx, cz, 0.15)) continue;
        const ref = M.floorY(cx, cz);
        const a = vert(i, j, ref);
        const b = vert(i + 1, j, ref);
        const c = vert(i + 1, j + 1, ref);
        const d = vert(i, j + 1, ref);
        if (!ceil) idx.push(a, d, c, a, c, b);
        else idx.push(a, b, c, a, c, d);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(cc, 3));
    g.setIndex(pos.length / 3 > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
    g.computeBoundingSphere();
    return g;
  };
  return { floor: make(false), ceil: make(true) };
}

// Escadas: degraus de granilite com faixa escura no bocel, patamares e corrimãos.
export function buildStairs(M, light, steelCol) {
  const step = new Mesher();
  const strip = new Mesher();
  const rail = new Mesher();
  const C = [1, 1, 1];
  for (const e of M.stairs) {
    const hw = e.w / 2 + 0.2;
    const dir = Math.sign(e.s1 - e.s0);
    const ya = e.a.y;
    const yb = e.b.y;
    const up = yb > ya;
    // degraus do mais baixo para o mais alto
    for (let k = 0; k < e.steps; k++) {
      // posição ao longo: o degrau k ocupa [u0, u1]
      const u0 = e.s0 + dir * k * TREAD;
      const u1 = u0 + dir * TREAD;
      const yTop = up ? ya + RISE * (k + 1) : ya - RISE * k;
      const yBot = Math.min(ya, yb) - 0.4;
      const [a0, a1] = u0 < u1 ? [u0, u1] : [u1, u0];
      // degrau do outro lado: em descida, o topo é o patamar anterior
      if (e.horiz) step.box(a0, a1 + 0.002, yBot, yTop, e.a.z - hw, e.a.z + hw, C, light, 2);
      else step.box(e.a.x - hw, e.a.x + hw, yBot, yTop, a0, a1 + 0.002, C, light, 2);
      // faixa antiderrapante perto do bocel
      const nose = up ? u1 - dir * 0.08 : u0 + dir * 0.08;
      const [b0, b1] = [Math.min(nose, nose - dir * 0.06), Math.max(nose, nose - dir * 0.06)];
      if (e.horiz) strip.box(b0, b1, yTop, yTop + 0.004, e.a.z - hw + 0.3, e.a.z + hw - 0.3, [0.2, 0.2, 0.22], light, 1, 'nxpxnzpz');
      else strip.box(e.a.x - hw + 0.3, e.a.x + hw - 0.3, yTop, yTop + 0.004, b0, b1, [0.2, 0.2, 0.22], light, 1, 'nxpxnzpz');
    }
    // patamares (cobrem as células de piso que ficaram de fora)
    for (const [u, y] of [
      [e.s0 - dir * 0.6, ya],
      [e.s1 + dir * 0.6, yb],
    ]) {
      const a0 = Math.min(u, u + dir * 0.6);
      const a1 = Math.max(u, u + dir * 0.6);
      if (e.horiz) step.box(a0, a1, y - 0.4, y, e.a.z - hw, e.a.z + hw, C, light, 2, 'nxpx');
      else step.box(e.a.x - hw, e.a.x + hw, y - 0.4, y, a0, a1, C, light, 2, 'nznz');
    }
    // corrimãos de inox nas duas paredes
    for (const s of [-1, 1]) {
      const off = e.w / 2 - 0.09;
      const P = (u, y) => (e.horiz ? [u, y, e.a.z + s * off] : [e.a.x + s * off, y, u]);
      const ue = e.s0 - dir * 0.5;
      const uf = e.s1 + dir * 0.5;
      const pts = [P(ue, ya + 0.92), P(e.s0, ya + 0.92), P(e.s1, yb + 0.92), P(uf, yb + 0.92)];
      for (let i = 0; i < pts.length - 1; i++) rail.tube(pts[i], pts[i + 1], 0.024, steelCol, light);
      // suportes
      for (const t of [0.1, 0.5, 0.9]) {
        const u = e.s0 + (e.s1 - e.s0) * t;
        const y = e.yAt(u) + 0.92;
        const p = P(u, y);
        const q = e.horiz ? [p[0], p[1] - 0.08, e.a.z + s * (e.w / 2)] : [e.a.x + s * (e.w / 2), p[1] - 0.08, p[2]];
        rail.tube(p, q, 0.012, steelCol, light);
      }
    }
  }
  return { step, strip, rail };
}

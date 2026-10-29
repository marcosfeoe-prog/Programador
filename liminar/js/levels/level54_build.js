// Nível 54 — construção: paredes tiradas da curva zero do campo de distância
// (quadrados em marcha, com interpolação, para aceitar qualquer ângulo),
// rodapé vinho e moldura de cadeira como na foto, carpete preto de listras
// brancas em diagonal, teto claro com plafons redondos. A luz das plafons é
// calculada nos vértices, com sombra das paredes (raio pelo campo).
import * as THREE from 'three';
import { TEX } from '../textures.js';
import { clamp, mulberry32, TAU } from '../util.js';
import { H, sdf, grad, clear, BOUNDS } from './level54_map.js';

const R = 0.25; // resolução das paredes
const FC = 0.5; // resolução do piso/teto

// ------------------------------------------------------------ texturas
export function wallTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#d8ad3a';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(541);
  // marcas de rolo de tinta (bem sutis)
  for (let i = 0; i < 2600; i++) {
    x.fillStyle = r() < 0.5 ? `rgba(255,236,170,${r() * 0.05})` : `rgba(120,80,10,${r() * 0.04})`;
    x.fillRect(r() * S, r() * S, 2 + r() * 10, 1 + r() * 3);
  }
  for (let i = 0; i < 40; i++) {
    x.fillStyle = `rgba(110,80,20,${0.02 + r() * 0.03})`;
    x.fillRect(r() * S, 0, 3 + r() * 20, S);
  }
  return TEX.toTex(c);
}

// Carpete: triângulos e trapézios, cada um com listras brancas num ângulo.
export function carpetTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#16141c';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(5454);
  const n = 4;
  const t = S / n;
  const angs = [0, Math.PI / 2, 0.42, -0.42, 1.15, -1.15, 0.78, -0.78];
  const tri = (pts) => {
    x.save();
    x.beginPath();
    x.moveTo(pts[0][0], pts[0][1]);
    for (const p of pts.slice(1)) x.lineTo(p[0], p[1]);
    x.closePath();
    x.clip();
    const a = angs[Math.floor(r() * angs.length)];
    const sp = S / 40;
    x.strokeStyle = '#d6d2dc';
    x.lineWidth = sp * 0.28;
    x.translate(S / 2, S / 2);
    x.rotate(a);
    for (let k = -S; k <= S; k += sp) {
      x.beginPath();
      x.moveTo(k, -S);
      x.lineTo(k, S);
      x.stroke();
    }
    x.restore();
  };
  for (let i = 0; i < n; i++)
    for (let j = 0; j < 2; j++) {
      const x0 = i * t;
      const y0 = j * (S / 2);
      const x1 = x0 + t;
      const y1 = y0 + S / 2;
      // cada retângulo vira dois triângulos (diagonal sorteada), às vezes três faixas
      if (r() < 0.5) {
        tri([
          [x0, y0],
          [x1, y0],
          [x1, y1],
        ]);
        tri([
          [x0, y0],
          [x1, y1],
          [x0, y1],
        ]);
      } else {
        const m = y0 + (S / 2) * (0.3 + r() * 0.4);
        tri([
          [x0, y0],
          [x1, y0],
          [x1, m],
          [x0, m - t * 0.3],
        ]);
        tri([
          [x0, m - t * 0.3],
          [x1, m],
          [x1, y1],
          [x0, y1],
        ]);
      }
    }
  // juntas escuras entre os desenhos
  x.strokeStyle = '#0c0b10';
  x.lineWidth = S / 160;
  for (let i = 0; i <= n; i++) {
    x.beginPath();
    x.moveTo(i * t, 0);
    x.lineTo(i * t, S);
    x.stroke();
  }
  // fibras
  for (let i = 0; i < 9000; i++) {
    x.fillStyle = `rgba(${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${r() < 0.5 ? 0 : 255},${r() * 0.05})`;
    x.fillRect(r() * S, r() * S, 1, 1);
  }
  return TEX.toTex(c);
}

export function ceilTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#ebe5d4';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(542);
  for (let i = 0; i < 5000; i++) {
    x.fillStyle = `rgba(${r() < 0.5 ? 255 : 120},${r() < 0.5 ? 250 : 110},${r() < 0.5 ? 240 : 90},${r() * 0.06})`;
    x.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2);
  }
  return TEX.toTex(c);
}

export function doorTex() {
  const S = 256;
  const c = TEX.makeCanvas(S, S * 2);
  const x = c.getContext('2d');
  x.fillStyle = '#5a3424';
  x.fillRect(0, 0, S, S * 2);
  const r = mulberry32(543);
  for (let i = 0; i < 160; i++) {
    x.strokeStyle = `rgba(${30 + r() * 30},${12 + r() * 14},${6},${0.15 + r() * 0.2})`;
    x.lineWidth = 1 + r() * 2;
    x.beginPath();
    const xx = r() * S;
    x.moveTo(xx, 0);
    x.bezierCurveTo(xx + (r() - 0.5) * 20, S * 0.6, xx + (r() - 0.5) * 20, S * 1.3, xx + (r() - 0.5) * 10, S * 2);
    x.stroke();
  }
  x.strokeStyle = 'rgba(20,8,4,0.6)';
  x.lineWidth = 5;
  x.strokeRect(30, 40, S - 60, S * 0.8);
  x.strokeRect(30, S + 20, S - 60, S * 0.8);
  return TEX.toTex(c, { repeat: false });
}

export function webTex() {
  const S = 512;
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  const r = mulberry32(544);
  x.translate(S / 2, S / 2);
  const spokes = 17;
  const ang = [];
  for (let i = 0; i < spokes; i++) ang.push((i / spokes) * TAU + (r() - 0.5) * 0.2);
  x.strokeStyle = 'rgba(245,245,240,0.85)';
  x.lineWidth = 1.6;
  for (const a of ang) {
    x.beginPath();
    x.moveTo(0, 0);
    x.lineTo(Math.cos(a) * S * 0.5, Math.sin(a) * S * 0.5);
    x.stroke();
  }
  x.lineWidth = 1.1;
  x.strokeStyle = 'rgba(240,240,236,0.7)';
  for (let k = 0; k < 26; k++) {
    const rr = 10 + k * 9 + r() * 3;
    x.beginPath();
    for (let i = 0; i <= spokes; i++) {
      const a = ang[i % spokes];
      const q = rr * (0.92 + r() * 0.1);
      const px = Math.cos(a) * q;
      const py = Math.sin(a) * q + (i % 2 ? 2 : 0);
      if (i === 0) x.moveTo(px, py);
      else x.quadraticCurveTo(Math.cos(a - 0.15) * q * 0.94, Math.sin(a - 0.15) * q * 0.94, px, py);
    }
    x.stroke();
  }
  // fios soltos e rasgos
  for (let i = 0; i < 30; i++) {
    x.strokeStyle = `rgba(240,240,236,${0.2 + r() * 0.4})`;
    x.beginPath();
    const a = r() * TAU;
    const b = a + (r() - 0.5) * 1.2;
    x.moveTo(Math.cos(a) * S * 0.1 * r(), Math.sin(a) * S * 0.1 * r());
    x.lineTo(Math.cos(b) * S * 0.5, Math.sin(b) * S * 0.5);
    x.stroke();
  }
  return TEX.toTex(c, { repeat: false });
}

export function exitTex() {
  const c = TEX.makeCanvas(256, 96);
  const x = c.getContext('2d');
  x.fillStyle = '#0a5a26';
  x.fillRect(0, 0, 256, 96);
  x.fillStyle = '#c8ffd8';
  x.font = 'bold 58px Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('SAÍDA', 128, 52);
  return TEX.toTex(c, { repeat: false });
}

export function plateTex(num) {
  const c = TEX.makeCanvas(128, 64);
  const x = c.getContext('2d');
  x.fillStyle = '#c9a54a';
  x.fillRect(0, 0, 128, 64);
  x.fillStyle = '#2a1a08';
  x.font = 'bold 36px Georgia, serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(String(num), 64, 34);
  return TEX.toTex(c, { repeat: false });
}

// ------------------------------------------------------------ luz calculada
// Luz que chega num ponto (com normal), vinda das plafons, com sombra das paredes.
export function bakeFn(lamps) {
  const B = 6;
  const grid = new Map();
  for (const l of lamps) {
    if (l.k <= 0) continue;
    for (let i = Math.floor((l.x - 12) / B); i <= Math.floor((l.x + 12) / B); i++)
      for (let j = Math.floor((l.z - 12) / B); j <= Math.floor((l.z + 12) / B); j++) {
        const k = i * 10000 + j;
        if (!grid.has(k)) grid.set(k, []);
        grid.get(k).push(l);
      }
  }
  return (x, y, z, nx, ny, nz) => {
    const list = grid.get(Math.floor(x / B) * 10000 + Math.floor(z / B)) || [];
    let L = 0.07;
    // ponto de partida um pouco para dentro do espaço andável
    const sx = x + nx * 0.06;
    const sz = z + nz * 0.06;
    for (const l of list) {
      const dx = l.x - x;
      const dy = H - 0.05 - y;
      const dz = l.z - z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > 144) continue;
      const d = Math.sqrt(d2);
      if (!clear(sx, sz, l.x, l.z, 0.01)) continue;
      const lam = Math.max(0, (dx * nx + dy * ny + dz * nz) / d);
      const fall = 1 / (1 + d2 * 0.28);
      L += l.k * fall * (0.25 + 1.25 * lam) * 1.4;
    }
    return clamp(L, 0, 1.6);
  };
}

// ------------------------------------------------------------ paredes
// Quadrados em marcha sobre o campo: devolve segmentos da curva zero.
function contour() {
  const x0 = Math.floor(BOUNDS.x0 / R) * R;
  const z0 = Math.floor(BOUNDS.z0 / R) * R;
  const nx = Math.ceil((BOUNDS.x1 - x0) / R) + 1;
  const nz = Math.ceil((BOUNDS.z1 - z0) / R) + 1;
  const v = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) v[j * nx + i] = sdf(x0 + i * R, z0 + j * R);
  const segs = [];
  const lerpP = (ax, az, va, bx, bz, vb) => {
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
      // arestas: 0 = a-b (topo), 1 = b-c, 2 = c-d, 3 = d-a
      if ((a < 0) !== (b < 0)) e[0] = lerpP(X, Z, a, X + R, Z, b);
      if ((b < 0) !== (c < 0)) e[1] = lerpP(X + R, Z, b, X + R, Z + R, c);
      if ((c < 0) !== (d < 0)) e[2] = lerpP(X + R, Z + R, c, X, Z + R, d);
      if ((d < 0) !== (a < 0)) e[3] = lerpP(X, Z + R, d, X, Z, a);
      const ks = [0, 1, 2, 3].filter((k) => e[k]);
      if (ks.length === 2) segs.push([e[ks[0]], e[ks[1]]]);
      else if (ks.length === 4) {
        // sela: decide pelo centro
        const mid = sdf(X + R / 2, Z + R / 2) < 0;
        const aIn = a < 0;
        if (aIn === mid) {
          segs.push([e[0], e[1]]);
          segs.push([e[2], e[3]]);
        } else {
          segs.push([e[0], e[3]]);
          segs.push([e[1], e[2]]);
        }
      }
    }
  return segs;
}

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

// Faixa vertical ao longo de um segmento de parede, recuada `off` para dentro.
function band(M, a, b, n, y0, y1, off, col, light, uvs) {
  const ax = a[0] + n[0] * off;
  const az = a[1] + n[1] * off;
  const bx = b[0] + n[0] * off;
  const bz = b[1] + n[1] * off;
  // ordem anti-horária vista de dentro (normal n)
  const P = [
    [ax, y0, az],
    [bx, y0, bz],
    [bx, y1, bz],
    [ax, y1, az],
  ];
  const cr = -(bx - ax) * n[1] + (bz - az) * n[0];
  if (cr > 0) P.reverse();
  const tu = (p) => (p[0] * -n[1] + p[2] * n[0]) / uvs;
  const U = P.map((p) => [tu(p), p[1] / uvs]);
  const C = P.map((p) => {
    const L = light(p[0], p[1], p[2], n[0], 0, n[1]);
    return [col[0] * L, col[1] * L, col[2] * L];
  });
  M.quad(P, [n[0], 0, n[1]], U, C);
}

function topBand(M, a, b, n, y, o0, o1, col, light) {
  const P = [
    [a[0] + n[0] * o0, y, a[1] + n[1] * o0],
    [b[0] + n[0] * o0, y, b[1] + n[1] * o0],
    [b[0] + n[0] * o1, y, b[1] + n[1] * o1],
    [a[0] + n[0] * o1, y, a[1] + n[1] * o1],
  ];
  // normal para cima: confere a ordem
  const e1 = [P[1][0] - P[0][0], P[1][2] - P[0][2]];
  const e2 = [P[2][0] - P[0][0], P[2][2] - P[0][2]];
  if (e1[1] * e2[0] - e1[0] * e2[1] < 0) P.reverse();
  const C = P.map((p) => {
    const L = light(p[0], p[1], p[2], 0, 1, 0);
    return [col[0] * L, col[1] * L, col[2] * L];
  });
  M.quad(
    P,
    [0, 1, 0],
    P.map((p) => [p[0], p[2]]),
    C,
  );
}

export function buildWalls(light) {
  const segs = contour();
  const wall = new Mesher();
  const trim = new Mesher();
  const W = [1, 1, 1];
  const RAIL = [0.98, 0.84, 0.4];
  const BASE = [0.36, 0.09, 0.12];
  for (const [a, b] of segs) {
    const mx = (a[0] + b[0]) / 2;
    const mz = (a[1] + b[1]) / 2;
    const g = grad(mx, mz);
    const n = [-g[0], -g[1]]; // para dentro do espaço andável
    band(wall, a, b, n, 0.12, 0.86, 0, W, light, 2);
    band(wall, a, b, n, 0.95, 1.9, 0, W, light, 2);
    band(wall, a, b, n, 1.9, H, 0, W, light, 2);
    // rodapé vinho e moldura de cadeira
    band(trim, a, b, n, 0, 0.12, 0.018, BASE, light, 1);
    topBand(trim, a, b, n, 0.12, 0, 0.018, BASE, light);
    band(trim, a, b, n, 0.86, 0.95, 0.035, RAIL, light, 1);
    topBand(trim, a, b, n, 0.95, 0, 0.035, RAIL, light);
    band(wall, a, b, n, 0.86, 0.95, 0, W, light, 2);
  }
  return { wall: wall.build(), trim: trim.build(), segs: segs.length };
}

// Piso e teto: uma grade de 0,5 m só onde há espaço andável (sobra fica atrás das paredes).
export function buildFloorCeil(light) {
  const x0 = Math.floor(BOUNDS.x0 / FC) * FC;
  const z0 = Math.floor(BOUNDS.z0 / FC) * FC;
  const nx = Math.ceil((BOUNDS.x1 - x0) / FC) + 1;
  const nz = Math.ceil((BOUNDS.z1 - z0) / FC) + 1;
  const make = (y, ny, uvS, col) => {
    const pos = [];
    const nor = [];
    const uv = [];
    const cc = [];
    const idx = [];
    const map = new Map();
    const vert = (i, j) => {
      const k = j * nx + i;
      if (map.has(k)) return map.get(k);
      const x = x0 + i * FC;
      const z = z0 + j * FC;
      pos.push(x, y, z);
      nor.push(0, ny, 0);
      uv.push(x / uvS, z / uvS);
      // luz medida um pouco para dentro, se o vértice cair atrás da parede
      let lx = x;
      let lz = z;
      const d = sdf(x, z);
      if (d > -0.05) {
        const g = grad(x, z);
        lx -= g[0] * (d + 0.08);
        lz -= g[1] * (d + 0.08);
      }
      const L = light(lx, y, lz, 0, ny, 0);
      cc.push(col[0] * L, col[1] * L, col[2] * L);
      map.set(k, pos.length / 3 - 1);
      return map.get(k);
    };
    for (let j = 0; j < nz - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const cx = x0 + (i + 0.5) * FC;
        const cz = z0 + (j + 0.5) * FC;
        if (sdf(cx, cz) > FC * 0.75) continue;
        const a = vert(i, j);
        const b = vert(i + 1, j);
        const c = vert(i + 1, j + 1);
        const d = vert(i, j + 1);
        // piso olha para cima, teto para baixo
        if (ny > 0) idx.push(a, d, c, a, c, b);
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
  return { floor: make(0, 1, 3.2, [1, 1, 1]), ceil: make(H, -1, 2.5, [1, 1, 1]) };
}

// Nível 69 — construção do vilarejo: casas de azulejo branco com telhado de
// duas águas e alpendre em arco (como na foto), paredões amarelos com
// passagem, praças de piso esmaltado, piscinas elevadas, pontes com guarda-
// corpo, postes, bancos, árvores-pirulito, um balanço, uma escada para o nada
// e uma porta sozinha no meio da grama.
import * as THREE from 'three';
import { GeoBuilder } from '../materials.js';
import { ISLANDS, BRIDGES, BRIDGE_HW, bridgeY } from './level69_world.js';

const WHITE = [1, 1, 1];
const ROOF = [0.62, 0.58, 0.72];
const DOOR = [0.42, 0.16, 0.18];
const GLASS = [0.32, 0.3, 0.46];
const RAIL = [0.98, 0.9, 0.94];

export class Builder {
  constructor() {
    this.G = {};
    this.colliders = [];
    this.circles = [];
    this.paved = []; // [x0, x1, z0, z1] ou { seg }
    this.strips = [];
    this.signs = [];
    this.lamps = [];
    this.pools = [];
    this.swings = [];
    this.doors = [];
  }

  gb(k) {
    return this.G[k] || (this.G[k] = new GeoBuilder());
  }

  // Caixa em coordenadas locais de um prédio (origem ox,oz, giro rot).
  lbox(f, k, lx, ly, lz, sx, sy, sz, col, opt = {}) {
    const cs = Math.cos(f.rot);
    const sn = Math.sin(f.rot);
    const x = f.x + lx * cs + lz * sn;
    const z = f.z - lx * sn + lz * cs;
    this.gb(k).box(x, f.y + ly, z, sx, sy, sz, col, null, { rot: f.rot, uvScale: opt.uv || 4, ao: opt.ao ?? 0.35, floorY: f.y, skip: opt.skip });
    if (opt.solid) this.solid(x, z, sx, sz, f.rot);
  }

  // Colisor de caixa orientada (com a caixa alinhada aos eixos que a contém).
  solid(x, z, sx, sz, rot = 0) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const hx = sx / 2;
    const hz = sz / 2;
    const ex = hx * Math.abs(c) + hz * Math.abs(s);
    const ez = hx * Math.abs(s) + hz * Math.abs(c);
    this.colliders.push({ x, z, hx, hz, c, s, x0: x - ex, x1: x + ex, z0: z - ez, z1: z + ez });
  }

  // ponto local → mundo
  P(f, lx, ly, lz) {
    const cs = Math.cos(f.rot);
    const sn = Math.sin(f.rot);
    return [f.x + lx * cs + lz * sn, f.y + ly, f.z - lx * sn + lz * cs];
  }

  N(f, nx, ny, nz) {
    const cs = Math.cos(f.rot);
    const sn = Math.sin(f.rot);
    return [nx * cs + nz * sn, ny, -nx * sn + nz * cs];
  }

  // Quadrilátero local com UV em metros. n = normal aproximada (local): a ordem
  // dos vértices é corrigida para a face sempre olhar para esse lado.
  lquad(f, k, pts, n, col, uvs = 4) {
    this.wquad(k, pts.map((p) => this.P(f, ...p)), this.N(f, ...n), col, uvs);
  }

  wquad(k, W, want, col, uvs = 4) {
    const [a, b, c] = W[2][0] === W[3][0] && W[2][1] === W[3][1] && W[2][2] === W[3][2] ? W : [W[0], W[1], W[2]];
    const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (n[0] * want[0] + n[1] * want[1] + n[2] * want[2] < 0) {
      W = [W[3], W[2], W[1], W[0]];
      n = [-n[0], -n[1], -n[2]];
    }
    const l = Math.hypot(...n) || 1;
    n = [n[0] / l, n[1] / l, n[2] / l];
    const ay = Math.abs(n[1]) > 0.6;
    const ax = Math.abs(n[0]) > Math.abs(n[2]);
    const uv = [];
    for (const p of W) uv.push((ay || !ax ? p[0] : p[2]) / uvs, (ay ? p[2] : p[1]) / uvs);
    this.gb(k).quad(W, n, uv, null, [col, col, col, col]);
  }

  // ---------------------------------------------------------- casa
  // Casa de azulejo branco: telhado de duas águas com a cumeeira para a frente,
  // porta escura e, se pedido, alpendre com arco na frente.
  house(x, z, rot, I, o = {}) {
    const f = { x, z, rot, y: I.y };
    const w = o.w || 8;
    const d = o.d || 7;
    const h = o.h || 3.4;
    const rise = o.rise || 2.2;
    this.lbox(f, 'tileW', 0, h / 2, 0, w, h, d, WHITE, { solid: true });
    // empena (frente e fundos)
    for (const s of [1, -1]) {
      const zz = (s * d) / 2;
      const pts = s > 0 ? [[-w / 2, h, zz], [w / 2, h, zz], [0, h + rise, zz], [0, h + rise, zz]] : [[w / 2, h, zz], [-w / 2, h, zz], [0, h + rise, zz], [0, h + rise, zz]];
      this.lquad(f, 'tileW', pts, [0, 0, s], WHITE);
    }
    // telhado (beirais de 0,45 m) com espessura
    const ov = 0.45;
    const hw = w / 2 + ov;
    const dz = d / 2 + ov;
    const drop = (ov * rise) / (w / 2);
    const len = Math.hypot(hw, rise + drop);
    const ny = hw / len;
    const nx = (rise + drop) / len;
    for (const s of [1, -1]) {
      const a = [s * hw, h - drop, dz];
      const b = [s * hw, h - drop, -dz];
      const c = [0, h + rise + 0.02, -dz];
      const e = [0, h + rise + 0.02, dz];
      const pts = s > 0 ? [a, b, c, e] : [b, a, e, c];
      this.lquad(f, 'roof', pts, [s * nx, ny, 0], ROOF, 1.2);
      // beiral: face de baixo
      const a2 = [s * hw, h - drop - 0.12, dz];
      const b2 = [s * hw, h - drop - 0.12, -dz];
      const e2 = [s * (w / 2), h - 0.12, dz];
      const c2 = [s * (w / 2), h - 0.12, -dz];
      this.lquad(f, 'paint', s > 0 ? [e2, c2, b2, a2] : [c2, e2, a2, b2], [0, -1, 0], [0.8, 0.74, 0.82]);
      // testeira
      this.lquad(f, 'paint', s > 0 ? [[s * hw, h - drop - 0.12, -dz], [s * hw, h - drop - 0.12, dz], [s * hw, h - drop, dz], [s * hw, h - drop, -dz]] : [[s * hw, h - drop - 0.12, dz], [s * hw, h - drop - 0.12, -dz], [s * hw, h - drop, -dz], [s * hw, h - drop, dz]], [s, 0, 0], [0.86, 0.8, 0.9]);
    }
    // borda do telhado nas empenas (frente e fundos)
    for (const s of [1, -1]) {
      for (const side of [1, -1]) {
        const p0 = [side * hw, h - drop, s * dz];
        const p1 = [0, h + rise + 0.02, s * dz];
        const lo = 0.12;
        const pts = s * side > 0 ? [[p0[0], p0[1] - lo, p0[2]], [p1[0], p1[1] - lo, p1[2]], p1, p0] : [[p1[0], p1[1] - lo, p1[2]], [p0[0], p0[1] - lo, p0[2]], p0, p1];
        this.lquad(f, 'paint', pts, [0, 0, s], [0.88, 0.82, 0.92]);
      }
    }
    // porta e janelas
    const dw = o.porch ? 1.3 : 1.1;
    this.lbox(f, 'door', 0, 1.15, d / 2 + 0.04, dw, 2.3, 0.08, DOOR, { ao: 0 });
    this.lbox(f, 'paint', 0, 2.36, d / 2 + 0.06, dw + 0.24, 0.12, 0.12, WHITE, { ao: 0 });
    this.doors.push({ x: this.P(f, 0, 0, d / 2 + 0.6)[0], z: this.P(f, 0, 0, d / 2 + 0.6)[2], kind: 'house' });
    const winX = w / 2 - 1.6;
    for (const sx of [-1, 1]) {
      if (!o.porch) this.window(f, sx * winX, 1.7, d / 2 + 0.03, 0);
      this.window(f, w / 2 + 0.03, 1.7, sx * (d / 4), Math.PI / 2);
      this.window(f, -w / 2 - 0.03, 1.7, sx * (d / 4), -Math.PI / 2);
    }
    // barrado e soleira
    this.lbox(f, 'paint', 0, 0.06, d / 2 + 0.5, dw + 1.2, 0.12, 1.0, [0.86, 0.82, 0.86], { ao: 0.2 });
    if (o.porch) this.porch(f, d / 2, o.porchW || 4.2, o.porchD || 2.6, h - 0.3);
  }

  window(f, lx, ly, lz, ry) {
    const g = { x: this.P(f, lx, 0, lz)[0], z: this.P(f, lx, 0, lz)[2], rot: f.rot + ry, y: f.y };
    this.lbox(g, 'glass', 0, ly, 0, 1.1, 1.2, 0.04, GLASS, { ao: 0 });
    this.lbox(g, 'paint', 0, ly - 0.66, 0.05, 1.35, 0.1, 0.14, WHITE, { ao: 0 });
    this.lbox(g, 'paint', 0, ly + 0.64, 0.03, 1.3, 0.08, 0.08, WHITE, { ao: 0 });
    this.lbox(g, 'paint', 0, ly, 0.03, 0.05, 1.2, 0.06, WHITE, { ao: 0 });
  }

  // Alpendre com arco na frente e arcos menores nos lados, telhadinho de duas águas.
  porch(f, z0, w, d, h) {
    const t = 0.35;
    const zF = z0 + d;
    const front = { x: this.P(f, 0, 0, zF - t / 2)[0], z: this.P(f, 0, 0, zF - t / 2)[2], rot: f.rot, y: f.y };
    this.archWall(front, w, t, h, 1.25, h - 1.25 - 0.3);
    for (const s of [1, -1]) {
      const c = this.P(f, s * (w / 2 - t / 2), 0, z0 + d / 2);
      this.archWall({ x: c[0], z: c[2], rot: f.rot + Math.PI / 2, y: f.y }, d, t, h, 0.7, h - 0.7 - 0.35);
    }
    // forro
    this.lbox(f, 'tileW', 0, h - 0.06, z0 + d / 2, w, 0.12, d, WHITE, { ao: 0 });
    // telhadinho
    const rise = 1.2;
    const ov = 0.3;
    const hw = w / 2 + ov;
    const zz0 = z0 - 0.2;
    const zz1 = zF + ov;
    const len = Math.hypot(hw, rise);
    for (const s of [1, -1]) {
      const a = [s * hw, h, zz1];
      const b = [s * hw, h, zz0];
      const c = [0, h + rise, zz0];
      const e = [0, h + rise, zz1];
      this.lquad(f, 'roof', s > 0 ? [a, b, c, e] : [b, a, e, c], [(s * rise) / len, hw / len, 0], ROOF, 1.2);
    }
    this.lquad(f, 'tileW', [[-w / 2, h, zF], [w / 2, h, zF], [0, h + rise - 0.1, zF], [0, h + rise - 0.1, zF]], [0, 0, 1], WHITE);
    // os pilares batem; o meio é livre
    const pw = w / 2 - 1.25;
    for (const s of [1, -1]) {
      const c = this.P(f, s * (w / 2 - pw / 2), 0, zF - t / 2);
      this.solid(c[0], c[2], pw + 0.1, t + 0.1, f.rot);
      const c2 = this.P(f, s * (w / 2 - t / 2), 0, zF - 0.4);
      this.solid(c2[0], c2[2], t + 0.1, 0.8, f.rot);
      const c3 = this.P(f, s * (w / 2 - t / 2), 0, z0 + 0.35);
      this.solid(c3[0], c3[2], t + 0.1, 0.7, f.rot);
    }
  }

  // Parede com abertura em arco (semicírculo): pilares + preenchimento fatiado.
  archWall(f, w, t, h, r, spring) {
    const pw = w / 2 - r;
    for (const s of [1, -1]) this.lbox(f, 'tileW', s * (r + pw / 2), h / 2, 0, pw, h, t, WHITE, { ao: 0.3, skip: '' });
    const n = 14;
    for (let i = 0; i < n; i++) {
      const x0 = -r + (2 * r * i) / n;
      const x1 = -r + (2 * r * (i + 1)) / n;
      const y0 = spring + Math.sqrt(Math.max(0, r * r - x0 * x0));
      const y1 = spring + Math.sqrt(Math.max(0, r * r - x1 * x1));
      if (Math.min(y0, y1) >= h) continue;
      for (const s of [1, -1]) {
        const z = (s * t) / 2;
        const pts = s > 0 ? [[x0, y0, z], [x1, y1, z], [x1, h, z], [x0, h, z]] : [[x1, y1, z], [x0, y0, z], [x0, h, z], [x1, h, z]];
        this.lquad(f, 'tileW', pts, [0, 0, s], WHITE);
      }
      // intradorso
      const xm = (x0 + x1) / 2;
      const ym = spring + Math.sqrt(Math.max(0, r * r - xm * xm));
      const nx = -xm / r;
      const ny = -(ym - spring) / r;
      this.lquad(f, 'tileW', [[x0, y0, t / 2], [x0, y0, -t / 2], [x1, y1, -t / 2], [x1, y1, t / 2]], [nx, ny, 0], [0.94, 0.92, 0.96], 2);
    }
    // vão reto abaixo da nascente do arco: laterais dos pilares já fecham
  }

  // ---------------------------------------------------------- paredão amarelo
  // Paredão de azulejo amarelo com uma passagem retangular funda (como na foto).
  // Devolve o vão (para a saída, se for o caso).
  yellowWall(x, z, rot, I, o = {}) {
    const f = { x, z, rot, y: I.y };
    const L = o.len || 12;
    const H = o.h || 7;
    const T = o.t || 1.6;
    const dw = o.dw || 2.6;
    const dh = o.dh || 4.0;
    const dx = o.dx || 0;
    const left = dx - dw / 2 + L / 2; // largura à esquerda do vão
    const right = L / 2 - dx - dw / 2;
    const k = 'tileY';
    const col = WHITE;
    this.lbox(f, k, -L / 2 + left / 2, H / 2, 0, left, H, T, col, { solid: true, uv: 3.2 });
    this.lbox(f, k, L / 2 - right / 2, H / 2, 0, right, H, T, col, { solid: true, uv: 3.2 });
    this.lbox(f, k, dx, dh + (H - dh) / 2, 0, dw, H - dh, T, col, { uv: 3.2, ao: 0 });
    // volta do paredão (forma de L)
    if (o.ret) {
      const rl = o.ret;
      this.lbox(f, k, -L / 2 + T / 2, H / 2, -T / 2 - rl / 2, T, H, rl, col, { solid: true, uv: 3.2 });
    }
    // piso dentro do vão
    this.lbox(f, 'floor', dx, 0.03, 0, dw, 0.06, T, WHITE, { ao: 0, uv: 2 });
    return { f, dx, dw, dh, T };
  }

  // ---------------------------------------------------------- pisos
  plaza(x, z, w, d, I, rot = 0) {
    const f = { x, z, rot, y: I.y };
    this.lbox(f, 'floor', 0, 0.02, 0, w, 0.08, d, WHITE, { ao: 0, uv: 2.4 });
    this.paved.push({ f, w, d });
  }

  // Caminho de azulejo por uma lista de pontos.
  path(pts, I, w = 2.4) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [bx, bz] = pts[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      const rot = Math.atan2(bx - ax, bz - az);
      const f = { x: (ax + bx) / 2, z: (az + bz) / 2, rot, y: I.y };
      this.lbox(f, 'floor', 0, 0.015, 0, w, 0.06, len + w * 0.5, WHITE, { ao: 0, uv: 2.4 });
      this.paved.push({ f, w, d: len + w * 0.5 });
    }
  }

  isPaved(x, z) {
    for (const p of this.paved) {
      const dx = x - p.f.x;
      const dz = z - p.f.z;
      const cs = Math.cos(p.f.rot);
      const sn = Math.sin(p.f.rot);
      const lx = dx * cs - dz * sn;
      const lz = dx * sn + dz * cs;
      if (Math.abs(lx) < p.w / 2 + 0.2 && Math.abs(lz) < p.d / 2 + 0.2) return true;
    }
    return false;
  }

  // Piscina elevada de azulejo com água parada (a água é uma malha à parte).
  pool(x, z, w, d, I, rot = 0) {
    const f = { x, z, rot, y: I.y };
    const t = 0.35;
    const h = 0.45;
    this.lbox(f, 'floor', 0, h / 2, d / 2 - t / 2, w, h, t, WHITE, { uv: 2.4 });
    this.lbox(f, 'floor', 0, h / 2, -d / 2 + t / 2, w, h, t, WHITE, { uv: 2.4 });
    this.lbox(f, 'floor', w / 2 - t / 2, h / 2, 0, t, h, d - 2 * t, WHITE, { uv: 2.4 });
    this.lbox(f, 'floor', -w / 2 + t / 2, h / 2, 0, t, h, d - 2 * t, WHITE, { uv: 2.4 });
    this.lbox(f, 'poolTile', 0, 0.06, 0, w - 2 * t, 0.06, d - 2 * t, WHITE, { ao: 0, uv: 1.6 });
    this.solid(x, z, w, d, rot);
    this.pools.push({ x, z, w: w - 2 * t, d: d - 2 * t, y: I.y + h - 0.08, rot });
  }

  // ---------------------------------------------------------- pequenos
  lamp(x, z, I) {
    this.gb('paint').cylinder(x, I.y + 1.6, z, 0.06, 3.2, [0.96, 0.94, 0.98], null, { sides: 10, r2: 0.05 });
    this.gb('paint').cylinder(x, I.y + 0.12, z, 0.16, 0.24, [0.9, 0.86, 0.92], null, { sides: 10, r2: 0.12 });
    this.gb('glow').addGeometry(sphere(0.2), translate(x, I.y + 3.35, z), [1.5, 1.25, 1.05]);
    this.circles.push([x, z, 0.16]);
    this.lamps.push({ x, y: I.y + 3.35, z });
  }

  bench(x, z, rot, I) {
    const f = { x, z, rot, y: I.y };
    this.lbox(f, 'paint', 0, 0.45, 0, 1.8, 0.08, 0.5, [0.98, 0.94, 0.96], { ao: 0 });
    this.lbox(f, 'paint', 0, 0.75, -0.24, 1.8, 0.4, 0.06, [0.98, 0.94, 0.96], { ao: 0 });
    for (const s of [-0.75, 0.75]) this.lbox(f, 'paint', s, 0.22, 0, 0.08, 0.44, 0.44, [0.8, 0.76, 0.84]);
    this.solid(x, z, 1.8, 0.55, rot);
  }

  tree(x, z, I, k = 0) {
    const h = 2.2 + (k % 3) * 0.5;
    this.gb('paint').cylinder(x, I.y + h / 2, z, 0.12, h, [0.72, 0.6, 0.62], null, { sides: 8, r2: 0.09 });
    const cols = [
      [0.6, 0.82, 0.55],
      [1.0, 0.72, 0.84],
      [0.72, 0.86, 0.6],
      [0.98, 0.84, 0.66],
    ];
    const c = cols[k % cols.length];
    const r = 1.1 + (k % 2) * 0.35;
    this.gb('leaf').addGeometry(sphere(r, 2), translate(x, I.y + h + r * 0.7, z), c);
    this.circles.push([x, z, 0.25]);
  }

  sign(x, z, rot, I, text) {
    this.gb('paint').box(x, I.y + 0.9, z, 0.08, 1.8, 0.08, [0.95, 0.92, 0.96], null, { ao: 0.2 });
    this.signs.push({ x, y: I.y + 1.75, z, rot, text });
    this.circles.push([x, z, 0.12]);
  }

  swing(x, z, rot, I) {
    const f = { x, z, rot, y: I.y };
    const pink = [1.0, 0.78, 0.86];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) this.lbox(f, 'paint', sx * 1.3, 1.3, sz * 0.4, 0.09, 2.6, 0.09, pink, { ao: 0.2 });
      const p = this.P(f, sx * 1.3, 0, 0);
      this.solid(p[0], p[2], 0.3, 1.0, rot);
    }
    this.lbox(f, 'paint', 0, 2.6, 0, 2.8, 0.1, 0.1, pink, { ao: 0 });
    this.swings.push({ x, y: I.y + 2.55, z, rot });
  }

  stairs(x, z, rot, I, n = 12) {
    const f = { x, z, rot, y: I.y };
    for (let i = 0; i < n; i++) this.lbox(f, 'tileW', 0, ((i + 1) * 0.22) / 2, -i * 0.3, 1.6, (i + 1) * 0.22, 0.3, WHITE, { uv: 2, ao: 0.2 });
    const c = this.P(f, 0, 0, -((n - 1) * 0.3) / 2);
    this.solid(c[0], c[2], 1.6, n * 0.3, rot);
  }

  loneDoor(x, z, rot, I) {
    const f = { x, z, rot, y: I.y };
    this.lbox(f, 'tileY', -0.75, 1.3, 0, 0.2, 2.6, 0.3, WHITE, { uv: 3 });
    this.lbox(f, 'tileY', 0.75, 1.3, 0, 0.2, 2.6, 0.3, WHITE, { uv: 3 });
    this.lbox(f, 'tileY', 0, 2.7, 0, 1.7, 0.2, 0.3, WHITE, { uv: 3 });
    this.lbox(f, 'door', 0, 1.2, 0, 1.3, 2.4, 0.08, DOOR, { ao: 0 });
    this.solid(x, z, 1.7, 0.35, rot);
    this.doors.push({ x, z, rot, kind: 'lone' });
  }

  // ---------------------------------------------------------- pontes
  bridges() {
    for (const b of BRIDGES) {
      const n = Math.ceil(b.len / 1.5);
      const rx = b.uz;
      const rz = -b.ux;
      const at = (t, side, dy = 0) => [b.x0 + b.ux * b.len * t + rx * side, bridgeY(b, t) + dy, b.z0 + b.uz * b.len * t + rz * side];
      const H = BRIDGE_HW;
      for (let i = 0; i < n; i++) {
        const t0 = i / n;
        const t1 = (i + 1) / n;
        // tabuleiro de azulejo, contínuo
        this.wquad('floor', [at(t0, -H), at(t0, H), at(t1, H), at(t1, -H)], [0, 1, 0], WHITE, 2.4);
        this.wquad('paint', [at(t0, -H + 0.2, -0.7), at(t0, H - 0.2, -0.7), at(t1, H - 0.2, -0.7), at(t1, -H + 0.2, -0.7)], [0, -1, 0], [0.7, 0.62, 0.76]);
        for (const s of [1, -1]) {
          this.wquad('paint', [at(t0, s * H), at(t1, s * H), at(t1, s * H, -0.3), at(t0, s * H, -0.3)], [rx * s, 0, rz * s], [0.9, 0.84, 0.92]);
          this.wquad('paint', [at(t0, s * H, -0.3), at(t1, s * H, -0.3), at(t1, s * (H - 0.2), -0.7), at(t0, s * (H - 0.2), -0.7)], [rx * s, -0.5, rz * s], [0.8, 0.72, 0.84]);
          // corrimão (barra superior e do meio)
          for (const [y0, th] of [
            [1.0, 0.08],
            [0.5, 0.05],
          ]) {
            this.wquad('rail', [at(t0, s * (H - 0.08), y0), at(t1, s * (H - 0.08), y0), at(t1, s * (H - 0.08 - th), y0), at(t0, s * (H - 0.08 - th), y0)], [0, 1, 0], RAIL, 1);
            this.wquad('rail', [at(t0, s * (H - 0.08), y0), at(t1, s * (H - 0.08), y0), at(t1, s * (H - 0.08), y0 - th), at(t0, s * (H - 0.08), y0 - th)], [rx * s, 0, rz * s], RAIL, 1);
            this.wquad('rail', [at(t0, s * (H - 0.08 - th), y0), at(t1, s * (H - 0.08 - th), y0), at(t1, s * (H - 0.08 - th), y0 - th), at(t0, s * (H - 0.08 - th), y0 - th)], [-rx * s, 0, -rz * s], RAIL, 1);
          }
          if (i % 2 === 0) {
            const p = at(t0, s * (H - 0.12));
            this.gb('rail').box(p[0], p[1] + 0.5, p[2], 0.1, 1.0, 0.1, RAIL, null, { rot: Math.atan2(b.ux, b.uz), ao: 0 });
          }
        }
      }
    }
  }
}

// ------------------------------------------------------------ util de geometria
const _geoCache = new Map();
function sphere(r, detail = 1) {
  const k = r + ':' + detail;
  if (!_geoCache.has(k)) _geoCache.set(k, new THREE.IcosahedronGeometry(r, detail));
  return _geoCache.get(k);
}
function translate(x, y, z) {
  return new THREE.Matrix4().makeTranslation(x, y, z);
}
export function disposeBuildCache() {
  for (const g of _geoCache.values()) g.dispose();
  _geoCache.clear();
}

// ------------------------------------------------------------ o vilarejo
export function buildVillage() {
  const B = new Builder();
  const [A, Bi, C, D] = ISLANDS;
  // ---- ilha A: o vilarejo
  B.plaza(0, -6, 24, 22, A);
  B.path(
    [
      [0, 36],
      [0, 22],
      [2, 6],
    ],
    A,
  );
  // até a ponte
  const b0 = BRIDGES[0];
  B.path(
    [
      [-4, -16],
      [-12, -28],
      [b0.x0, b0.z0],
    ],
    A,
  );
  B.pool(-5.5, -4, 8, 5, A);
  B.pool(6, -11, 4, 4, A);
  B.house(-17, -10, Math.PI / 2, A, { w: 8, d: 7, porch: true, porchW: 4.2 });
  B.house(-18, 7, Math.PI / 2, A, { w: 7, d: 6.5, h: 3.2 });
  B.house(17, -14, -Math.PI / 2, A, { w: 8, d: 7.5, h: 3.6 });
  B.house(18, 4, -Math.PI / 2, A, { w: 7, d: 7, porch: true, porchW: 3.8 });
  B.house(3, -26, 0, A, { w: 9, d: 7, h: 3.8, rise: 2.6, porch: true, porchW: 4.6 });
  B.house(-30, -24, Math.PI / 4, A, { w: 7, d: 6, h: 3.2 });
  B.house(28, -26, -Math.PI / 4, A, { w: 7.5, d: 6.5, h: 3.4 });
  B.house(-26, 22, Math.PI * 0.75, A, { w: 6.5, d: 6, h: 3.0 });
  // o paredão amarelo com passagem (a foto)
  B.yellowWall(12, 20, -0.35, A, { len: 12, h: 7, t: 1.8, dw: 2.6, dh: 4.2, dx: 1.5, ret: 5 });
  for (const [x, z] of [
    [-8, 6],
    [8, 6],
    [-12, -16],
    [10, -17],
    [3, 24],
    [-3, 14],
  ])
    B.lamp(x, z, A);
  B.bench(-6, 2.5, Math.PI, A);
  B.bench(6, 2.5, Math.PI, A);
  B.bench(10, -4, -Math.PI / 2, A);
  let k = 0;
  for (const [x, z] of [
    [-10, 18],
    [9, 30],
    [-14, 30],
    [24, 16],
    [30, -6],
    [-33, -6],
    [-22, -34],
    [14, -36],
    [-4, -36],
    [26, 26],
  ])
    B.tree(x, z, A, k++);
  B.sign(2.6, 30, 0, A, 'você já esteve aqui');
  B.sign(-14, -22, Math.PI * 0.8, A, 'não olhe para baixo');
  // ---- ilha B: jardim dos arcos e o balanço
  const b1 = BRIDGES[1];
  B.path(
    [
      [BRIDGES[0].x1, BRIDGES[0].z1],
      [Bi.x + 3.6, Bi.z + 2],
      [b1.x0, b1.z0],
    ],
    Bi,
  );
  B.plaza(Bi.x - 2, Bi.z + 2, 10, 10, Bi, 0.3);
  B.pool(Bi.x - 2, Bi.z + 2, 5, 5, Bi, 0.3);
  // colunata de arcos
  for (let i = 0; i < 4; i++) {
    const a = 0.3;
    const x = Bi.x - 12 + Math.cos(a) * 0 + i * 0.0;
    const z = Bi.z - 4 + i * 4.2;
    B.archWall({ x, z, rot: Math.PI / 2, y: Bi.y }, 4.2, 0.45, 4, 1.4, 2.4);
    B.solid(x, z, 0.5, 4.2, 0);
  }
  B.swing(Bi.x - 6, Bi.z - 12, 0.4, Bi);
  B.house(Bi.x + 12, Bi.z + 11, -Math.PI * 0.6, Bi, { w: 6, d: 5.5, h: 3 });
  B.tree(Bi.x - 8, Bi.z + 13, Bi, 1);
  B.tree(Bi.x + 14, Bi.z + 2, Bi, 2);
  B.tree(Bi.x - 15, Bi.z + 8, Bi, 3);
  B.lamp(Bi.x + 3, Bi.z - 4, Bi);
  B.lamp(Bi.x - 7, Bi.z + 7, Bi);
  B.sign(Bi.x + 4, Bi.z + 8, -0.5, Bi, 'está tudo bem agora');
  // ---- ilha C: a escada para o nada, a porta sozinha
  const b2 = BRIDGES[2];
  B.path(
    [
      [b1.x1, b1.z1],
      [C.x, C.z],
      [b2.x0, b2.z0],
    ],
    C,
  );
  B.stairs(C.x + 8, C.z + 5, -0.6, C, 14);
  B.loneDoor(C.x - 8, C.z - 2, 0.9, C);
  B.yellowWall(C.x + 7, C.z - 8, 0.5, C, { len: 7, h: 5, t: 1.4, dw: 2.2, dh: 3.4, dx: 0 });
  B.pool(C.x + 3, C.z + 12, 6, 4, C, -0.2);
  B.tree(C.x - 12, C.z + 6, C, 0);
  B.tree(C.x + 13, C.z - 2, C, 1);
  B.lamp(C.x + 2, C.z + 3, C);
  B.sign(C.x - 5, C.z - 10, 0.3, C, 'ninguém mora aqui');
  // ---- ilha D: o grande paredão amarelo e a porta de luz (saída)
  B.path(
    [
      [b2.x1, b2.z1],
      [D.x, D.z + 2],
    ],
    D,
  );
  B.plaza(D.x, D.z + 1, 12, 8, D);
  const exit = B.yellowWall(D.x, D.z - 4, 0, D, { len: 18, h: 10, t: 2.0, dw: 2.4, dh: 4.4, dx: 0 });
  B.lamp(D.x - 5, D.z + 4, D);
  B.lamp(D.x + 5, D.z + 4, D);
  B.sign(D.x + 3, D.z + 6, 0, D, 'é por aqui que se volta?');
  B.bridges();
  return { B, exit };
}


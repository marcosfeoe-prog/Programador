// Construtor de geometria das edificações (paredes em "vãos" de 3 m mapeados no atlas de
// fachadas e telhados com textura repetida) e os modelos de cada país: casas, sobrados,
// trailers, comércios, igrejas, escolas, celeiros, galpões, aviários, silos e outros.

import * as THREE from 'three';
import { FACADE, ATLAS_N } from '../render/textures.js';
import { RNG } from '../core/rng.js';

const EPS = 0.004;

export class GeoBuilder {
  constructor() {
    this.p = [];
    this.n = [];
    this.uv = [];
    this.i = [];
  }
  get count() {
    return this.p.length / 3;
  }
  // Quadrilátero a-b-c-d (anti-horário visto de fora). Se "center" for dado, corrige a orientação.
  quad(a, b, c, d, ua, ub, uc, ud, center = null) {
    let n = normal3(a, b, c);
    if (center) {
      const mx = (a[0] + c[0]) / 2 - center[0];
      const my = (a[1] + c[1]) / 2 - center[1];
      const mz = (a[2] + c[2]) / 2 - center[2];
      if (n[0] * mx + n[1] * my + n[2] * mz < 0) {
        [b, d] = [d, b];
        [ub, ud] = [ud, ub];
        n = [-n[0], -n[1], -n[2]];
      }
    }
    const o = this.count;
    for (const [v, t] of [
      [a, ua],
      [b, ub],
      [c, uc],
      [d, ud],
    ]) {
      this.p.push(v[0], v[1], v[2]);
      this.n.push(n[0], n[1], n[2]);
      this.uv.push(t[0], t[1]);
    }
    this.i.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  tri(a, b, c, ua, ub, uc, center = null) {
    let n = normal3(a, b, c);
    if (center) {
      const mx = (a[0] + b[0] + c[0]) / 3 - center[0];
      const my = (a[1] + b[1] + c[1]) / 3 - center[1];
      const mz = (a[2] + b[2] + c[2]) / 3 - center[2];
      if (n[0] * mx + n[1] * my + n[2] * mz < 0) {
        [b, c] = [c, b];
        [ub, uc] = [uc, ub];
        n = [-n[0], -n[1], -n[2]];
      }
    }
    const o = this.count;
    for (const [v, t] of [
      [a, ua],
      [b, ub],
      [c, uc],
    ]) {
      this.p.push(v[0], v[1], v[2]);
      this.n.push(n[0], n[1], n[2]);
      this.uv.push(t[0], t[1]);
    }
    this.i.push(o, o + 1, o + 2);
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.i);
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

function normal3(a, b, c) {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const uz = b[2] - a[2];
  const vx = c[0] - a[0];
  const vy = c[1] - a[1];
  const vz = c[2] - a[2];
  let nx = uy * vz - uz * vy;
  let ny = uz * vx - ux * vz;
  let nz = ux * vy - uy * vx;
  const l = Math.hypot(nx, ny, nz) || 1;
  return [nx / l, ny / l, nz / l];
}

// Coordenada de textura dentro de um ladrilho do atlas (s, t em 0..1; t = 0 no chão).
export function atlasUV(tile, s, t) {
  const [col, row] = FACADE[tile] || FACADE.trimLight;
  const ss = EPS + s * (1 - 2 * EPS);
  const tt = EPS + t * (1 - 2 * EPS);
  return [(col + ss) / ATLAS_N, 1 - (row + 1) / ATLAS_N + tt / ATLAS_N];
}

// Parede de (x0,z0) a (x1,z1), de yb a yt, dividida em vãos e andares.
// tiles: { win, door, plain } — door só no térreo, no vão doorBay.
function wall(gb, center, x0, z0, x1, z1, yb, yt, tiles, doorBay = -1, opts = {}) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const nb = Math.max(1, Math.round(len / (opts.bay || 3)));
  const ns = Math.max(1, Math.round((yt - yb) / (opts.story || 3)));
  for (let s = 0; s < ns; s++)
    for (let b = 0; b < nb; b++) {
      const t0 = b / nb;
      const t1 = (b + 1) / nb;
      const ya = yb + ((yt - yb) * s) / ns;
      const yc = yb + ((yt - yb) * (s + 1)) / ns;
      let tile = tiles.plain;
      if (s === 0 && b === doorBay) tile = tiles.door;
      else if (tiles.win && (tiles.pattern ? tiles.pattern(b, s, nb, ns) : (b + s) % 2 === 0 || nb <= 2)) tile = tiles.win;
      if (s === 0 && tiles.ground && b !== doorBay) tile = tiles.ground;
      const a = [x0 + (x1 - x0) * t0, ya, z0 + (z1 - z0) * t0];
      const bb = [x0 + (x1 - x0) * t1, ya, z0 + (z1 - z0) * t1];
      const c = [x0 + (x1 - x0) * t1, yc, z0 + (z1 - z0) * t1];
      const d = [x0 + (x1 - x0) * t0, yc, z0 + (z1 - z0) * t0];
      gb.quad(a, bb, c, d, atlasUV(tile, 0, 0), atlasUV(tile, 1, 0), atlasUV(tile, 1, 1), atlasUV(tile, 0, 1), center);
    }
}

// Empena triangular (oitão) de largura w sobre a parede de (x0,z0)-(x1,z1).
function gable(gb, center, x0, z0, x1, z1, y0, h, tile) {
  const nb = Math.max(1, Math.round(Math.hypot(x1 - x0, z1 - z0) / 3));
  for (let b = 0; b < nb; b++) {
    const t0 = b / nb;
    const t1 = (b + 1) / nb;
    const hh = (t) => h * (1 - Math.abs(t * 2 - 1));
    const a = [x0 + (x1 - x0) * t0, y0, z0 + (z1 - z0) * t0];
    const bb = [x0 + (x1 - x0) * t1, y0, z0 + (z1 - z0) * t1];
    const c = [bb[0], y0 + hh(t1), bb[2]];
    const d = [a[0], y0 + hh(t0), a[2]];
    const v0 = Math.min(1, hh(t0) / 3);
    const v1 = Math.min(1, hh(t1) / 3);
    if (hh(t0) < 0.01 && hh(t1) < 0.01) continue;
    gb.quad(a, bb, c, d, atlasUV(tile, 0, 0), atlasUV(tile, 1, 0), atlasUV(tile, 1, v1), atlasUV(tile, 0, v0), center);
  }
}

// Caixa simples com um ladrilho (para chaminés, platibandas, bases…).
export function boxAtlas(gb, cx, cy, cz, sx, sy, sz, tile, top = true) {
  const x0 = cx - sx / 2;
  const x1 = cx + sx / 2;
  const z0 = cz - sz / 2;
  const z1 = cz + sz / 2;
  const y0 = cy;
  const y1 = cy + sy;
  const c = [cx, cy + sy / 2, cz];
  const sides = [
    [x0, z1, x1, z1],
    [x1, z1, x1, z0],
    [x1, z0, x0, z0],
    [x0, z0, x0, z1],
  ];
  for (const [ax, az, bx, bz] of sides) {
    const L = Math.hypot(bx - ax, bz - az);
    const su = Math.min(1, L / 3);
    const sv = Math.min(1, sy / 3);
    gb.quad([ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az], atlasUV(tile, 0, 0), atlasUV(tile, su, 0), atlasUV(tile, su, sv), atlasUV(tile, 0, sv), c);
  }
  if (top) gb.quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], atlasUV(tile, 0, 0), atlasUV(tile, 1, 0), atlasUV(tile, 1, 1), atlasUV(tile, 0, 1), c);
}

// ------------------------------------------------------------------ Telhados (UV em metros/3)
function roofGable(rb, w, d, y0, pitchH, over, center) {
  // Cumeeira ao longo de x (largura w), caimento para ±z.
  const x0 = -w / 2 - over;
  const x1 = w / 2 + over;
  const zr = 0;
  const ze = d / 2 + over;
  const ye = y0 - over * (pitchH / (d / 2));
  const yr = y0 + pitchH;
  const sl = Math.hypot(ze, yr - ye);
  for (const s of [-1, 1]) {
    rb.quad([x0, ye, ze * s], [x1, ye, ze * s], [x1, yr, zr], [x0, yr, zr], [0, 0], [(x1 - x0) / 3, 0], [(x1 - x0) / 3, sl / 3], [0, sl / 3], [0, y0 - 10, 0]);
  }
  // Beirais por baixo (espessura).
  return yr;
}

function roofHip(rb, w, d, y0, pitchH, over) {
  const x0 = -w / 2 - over;
  const x1 = w / 2 + over;
  const z0 = -d / 2 - over;
  const z1 = d / 2 + over;
  const ye = y0 - over * 0.5;
  const yr = y0 + pitchH;
  const inset = Math.min((w + 2 * over) / 2 - 0.01, (d + 2 * over) / 2);
  const rx0 = x0 + inset;
  const rx1 = x1 - inset;
  const c = [0, y0 - 10, 0];
  const L = (z1 - z0) / 2;
  const sl = Math.hypot(L, yr - ye) / 3;
  rb.quad([x0, ye, z1], [x1, ye, z1], [rx1, yr, 0], [rx0, yr, 0], [0, 0], [(x1 - x0) / 3, 0], [(rx1 - x0) / 3, sl], [(rx0 - x0) / 3, sl], c);
  rb.quad([x1, ye, z0], [x0, ye, z0], [rx0, yr, 0], [rx1, yr, 0], [0, 0], [(x1 - x0) / 3, 0], [(x1 - rx0) / 3, sl], [(x1 - rx1) / 3, sl], c);
  const sl2 = Math.hypot(inset, yr - ye) / 3;
  rb.tri([x0, ye, z0], [x0, ye, z1], [rx0, yr, 0], [0, 0], [(z1 - z0) / 3, 0], [(z1 - z0) / 6, sl2], c);
  rb.tri([x1, ye, z1], [x1, ye, z0], [rx1, yr, 0], [0, 0], [(z1 - z0) / 3, 0], [(z1 - z0) / 6, sl2], c);
  return yr;
}

function roofFlat(rb, w, d, y0) {
  rb.quad([-w / 2, y0, -d / 2], [w / 2, y0, -d / 2], [w / 2, y0, d / 2], [-w / 2, y0, d / 2], [0, 0], [w / 3, 0], [w / 3, d / 3], [0, d / 3], [0, y0 - 10, 0]);
  return y0;
}

function roofGambrel(rb, w, d, y0, h, over) {
  const x0 = -w / 2 - over;
  const x1 = w / 2 + over;
  const pts = [
    [d / 2 + over, y0 - 0.3],
    [d * 0.32, y0 + h * 0.62],
    [0, y0 + h],
  ];
  const c = [0, y0 - 10, 0];
  for (const s of [-1, 1])
    for (let k = 0; k < 2; k++) {
      const a = pts[k];
      const b = pts[k + 1];
      const sl = Math.hypot(a[0] - b[0], a[1] - b[1]) / 3;
      rb.quad([x0, a[1], a[0] * s], [x1, a[1], a[0] * s], [x1, b[1], b[0] * s], [x0, b[1], b[0] * s], [0, 0], [(x1 - x0) / 3, 0], [(x1 - x0) / 3, sl], [0, sl], c);
    }
  return y0 + h;
}

function roofCurved(rb, w, d, y0, h, segs = 8) {
  // Abóbada ao longo de x (galpão/quonset/aviário).
  const c = [0, y0 - 10, 0];
  for (let k = 0; k < segs; k++) {
    const a0 = (k / segs) * Math.PI;
    const a1 = ((k + 1) / segs) * Math.PI;
    const z0 = Math.cos(a0) * d * 0.5;
    const z1 = Math.cos(a1) * d * 0.5;
    const yA = y0 + Math.sin(a0) * h;
    const yB = y0 + Math.sin(a1) * h;
    const sl = (Math.hypot(z1 - z0, yB - yA) * k) / 3;
    const sl1 = sl + Math.hypot(z1 - z0, yB - yA) / 3;
    rb.quad([-w / 2, yA, z0], [w / 2, yA, z0], [w / 2, yB, z1], [-w / 2, yB, z1], [0, sl], [w / 3, sl], [w / 3, sl1], [0, sl1], c);
  }
}

// ------------------------------------------------------------------ Modelo genérico de casa
// Retorna { walls, roof, roofType, w, d, h } com origem no centro do térreo.
export function makeHouse(p) {
  const gb = new GeoBuilder();
  const rb = new GeoBuilder();
  const { w, d, stories = 1, storyH = 3, roof = 'gable', pitch = 0.45, over = 0.5, tiles, roofType = 'shingles' } = p;
  const H = stories * storyH;
  const base = p.base ?? 0.5;
  const center = [0, H / 2, 0];
  // Fundação aparente.
  boxAtlas(gb, 0, -1.5, 0, w + 0.3, base + 1.5, d + 0.3, 'foundation', false);
  const y0 = base;
  const y1 = base + H;
  const doorFront = p.doorBay ?? Math.floor(Math.max(1, Math.round(w / 3)) / 2);
  wall(gb, center, -w / 2, d / 2, w / 2, d / 2, y0, y1, tiles, doorFront); // frente (+z)
  wall(gb, center, w / 2, -d / 2, -w / 2, -d / 2, y0, y1, tiles, p.backDoor ? 1 : -1); // fundos
  wall(gb, center, w / 2, d / 2, w / 2, -d / 2, y0, y1, tiles, -1);
  wall(gb, center, -w / 2, -d / 2, -w / 2, d / 2, y0, y1, tiles, -1);
  let top = y1;
  if (roof === 'gable') {
    const ph = (d / 2) * pitch;
    gable(gb, center, w / 2, d / 2, w / 2, -d / 2, y1, ph, tiles.plain);
    gable(gb, center, -w / 2, -d / 2, -w / 2, d / 2, y1, ph, tiles.plain);
    top = roofGable(rb, w, d, y1, ph, over, center);
  } else if (roof === 'gableX') {
    // Cumeeira na direção z (fachada com oitão para a frente).
    const ph = (w / 2) * pitch;
    gable(gb, center, -w / 2, d / 2, w / 2, d / 2, y1, ph, tiles.plain);
    gable(gb, center, w / 2, -d / 2, -w / 2, -d / 2, y1, ph, tiles.plain);
    const tmp = new GeoBuilder();
    top = roofGable(tmp, d, w, y1, ph, over, center);
    rotateInto(rb, tmp, Math.PI / 2);
  } else if (roof === 'hip') {
    top = roofHip(rb, w, d, y1, Math.min(w, d) * 0.5 * pitch, over);
  } else if (roof === 'flat') {
    top = roofFlat(rb, w, d, y1 + 0.02);
    // Platibanda.
    const pt = p.parapet ?? 0.9;
    if (pt > 0) {
      const t = 0.25;
      const ptile = p.parapetTile || tiles.plain;
      boxAtlas(gb, 0, y1, d / 2 - t / 2, w, pt, t, ptile);
      boxAtlas(gb, 0, y1, -d / 2 + t / 2, w, pt, t, ptile);
      boxAtlas(gb, w / 2 - t / 2, y1, 0, t, pt, d, ptile);
      boxAtlas(gb, -w / 2 + t / 2, y1, 0, t, pt, d, ptile);
    }
  } else if (roof === 'gambrel') {
    const h = d * 0.42;
    // Empena do gambrel (polígono) nas pontas.
    for (const s of [-1, 1]) {
      const x = (s * w) / 2;
      const prof = [
        [d / 2, y1],
        [d * 0.32, y1 + h * 0.62],
        [0, y1 + h],
        [-d * 0.32, y1 + h * 0.62],
        [-d / 2, y1],
      ];
      for (let k = 0; k < 4; k++) {
        const a = prof[k];
        const b = prof[k + 1];
        gb.quad([x, y1, a[0]], [x, y1, b[0]], [x, b[1], b[0]], [x, a[1], a[0]], atlasUV(tiles.plain, 0, 0), atlasUV(tiles.plain, 0.5, 0), atlasUV(tiles.plain, 0.5, 0.9), atlasUV(tiles.plain, 0, 0.9), center);
      }
    }
    top = roofGambrel(rb, w, d, y1, h, over);
  } else if (roof === 'curved') {
    const h = p.curveH ?? d * 0.45;
    // Empenas semicirculares.
    for (const s of [-1, 1]) {
      const x = (s * w) / 2;
      const segs = 8;
      for (let k = 0; k < segs; k++) {
        const a0 = (k / segs) * Math.PI;
        const a1 = ((k + 1) / segs) * Math.PI;
        gb.quad([x, y1, Math.cos(a0) * d * 0.5], [x, y1, Math.cos(a1) * d * 0.5], [x, y1 + Math.sin(a1) * h, Math.cos(a1) * d * 0.5], [x, y1 + Math.sin(a0) * h, Math.cos(a0) * d * 0.5], atlasUV(tiles.plain, 0, 0), atlasUV(tiles.plain, 0.3, 0), atlasUV(tiles.plain, 0.3, 0.8), atlasUV(tiles.plain, 0, 0.8), center);
      }
    }
    roofCurved(rb, w + 0.4, d + 0.3, y1, h);
    top = y1 + h;
  } else if (roof === 'shed') {
    const ph = d * pitch * 0.5;
    const x0 = -w / 2 - over;
    const x1 = w / 2 + over;
    rb.quad([x0, y1, d / 2 + over], [x1, y1, d / 2 + over], [x1, y1 + ph, -d / 2 - over], [x0, y1 + ph, -d / 2 - over], [0, 0], [(x1 - x0) / 3, 0], [(x1 - x0) / 3, d / 3], [0, d / 3], [0, -10, 0]);
    for (const s of [-1, 1]) {
      const x = (s * w) / 2;
      gb.tri([x, y1, d / 2], [x, y1, -d / 2], [x, y1 + ph, -d / 2], atlasUV(tiles.plain, 0, 0), atlasUV(tiles.plain, 1, 0), atlasUV(tiles.plain, 1, 0.5), center);
    }
    top = y1 + ph;
  }
  // Chaminé.
  if (p.chimney) boxAtlas(gb, w * 0.3, y1, -d * 0.1, 0.8, top - y1 + 1.2, 0.8, 'brick');
  // Caixa d'água no telhado (Argentina/Uruguai/Brasil).
  if (p.tank) boxAtlas(gb, -w * 0.25, top, -d * 0.2, 1.6, 1.4, 1.6, 'concrete');
  // Varanda: piso + pilares + cobertura.
  if (p.porch) {
    const pd = 2.2;
    boxAtlas(gb, 0, 0, d / 2 + pd / 2, w * 0.8, base, pd, 'foundation');
    for (const s of [-1, 1, -0.33, 0.33]) boxAtlas(gb, s * w * 0.38, base, d / 2 + pd - 0.2, 0.18, storyH - 0.1, 0.18, 'trimLight', false);
    rb.quad([-w * 0.42, y0 + storyH, d / 2], [w * 0.42, y0 + storyH, d / 2], [w * 0.42, y0 + storyH - 0.5, d / 2 + pd + 0.3], [-w * 0.42, y0 + storyH - 0.5, d / 2 + pd + 0.3], [0, 0], [w / 3, 0], [w / 3, 1], [0, 1], [0, -10, 0]);
  }
  // Garagem anexa (EUA/Canadá).
  if (p.garage) {
    const gw = 6.5;
    const gd = d * 0.9;
    const gx = w / 2 + gw / 2;
    const gc = [gx, 1.5, 0];
    const gt = { plain: tiles.plain, win: null, door: 'sidingGarage' };
    wall(gb, gc, gx - gw / 2, gd / 2, gx + gw / 2, gd / 2, y0 - 0.3, y0 + 2.8, gt, 0, { bay: gw });
    wall(gb, gc, gx + gw / 2, gd / 2, gx + gw / 2, -gd / 2, y0 - 0.3, y0 + 2.8, gt, -1);
    wall(gb, gc, gx + gw / 2, -gd / 2, gx - gw / 2, -gd / 2, y0 - 0.3, y0 + 2.8, gt, -1);
    const tmp = new GeoBuilder();
    roofGable(tmp, gw, gd, y0 + 2.8, gd * 0.2, 0.4, gc);
    offsetInto(rb, tmp, gx, 0, 0);
  }
  return { walls: gb.build(), roof: rb.build(), roofType, w: w + (p.garage ? 6.5 : 0), d, h: top, H };
}

function rotateInto(dst, src, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  const o = dst.count;
  for (let k = 0; k < src.p.length; k += 3) {
    const x = src.p[k];
    const z = src.p[k + 2];
    dst.p.push(x * c - z * s, src.p[k + 1], x * s + z * c);
    const nx = src.n[k];
    const nz = src.n[k + 2];
    dst.n.push(nx * c - nz * s, src.n[k + 1], nx * s + nz * c);
  }
  dst.uv.push(...src.uv);
  for (const i of src.i) dst.i.push(i + o);
}

function offsetInto(dst, src, ox, oy, oz) {
  const o = dst.count;
  for (let k = 0; k < src.p.length; k += 3) dst.p.push(src.p[k] + ox, src.p[k + 1] + oy, src.p[k + 2] + oz);
  dst.n.push(...src.n);
  dst.uv.push(...src.uv);
  for (const i of src.i) dst.i.push(i + o);
}

// ------------------------------------------------------------------ Estruturas especiais
// Cilindro (silo, caixa d'água, tanque) com textura do atlas.
export function cylinderInto(gb, cx, cy, cz, r, h, tile, segs = 16, capTile = null, dome = 0) {
  const c = [cx, cy + h / 2, cz];
  for (let k = 0; k < segs; k++) {
    const a0 = (k / segs) * Math.PI * 2;
    const a1 = ((k + 1) / segs) * Math.PI * 2;
    const p0 = [cx + Math.cos(a0) * r, cz + Math.sin(a0) * r];
    const p1 = [cx + Math.cos(a1) * r, cz + Math.sin(a1) * r];
    const ns = Math.max(1, Math.round(h / 3));
    for (let s = 0; s < ns; s++) {
      const y0 = cy + (h * s) / ns;
      const y1 = cy + (h * (s + 1)) / ns;
      gb.quad([p0[0], y0, p0[1]], [p1[0], y0, p1[1]], [p1[0], y1, p1[1]], [p0[0], y1, p0[1]], atlasUV(tile, 0, 0), atlasUV(tile, 1, 0), atlasUV(tile, 1, 1), atlasUV(tile, 0, 1), c);
    }
  }
  const ct = capTile || tile;
  // Teto cônico/abobadado.
  const top = cy + h;
  const apex = [cx, top + (dome || r * 0.35), cz];
  for (let k = 0; k < segs; k++) {
    const a0 = (k / segs) * Math.PI * 2;
    const a1 = ((k + 1) / segs) * Math.PI * 2;
    gb.tri([cx + Math.cos(a0) * r * 1.03, top, cz + Math.sin(a0) * r * 1.03], [cx + Math.cos(a1) * r * 1.03, top, cz + Math.sin(a1) * r * 1.03], apex, atlasUV(ct, 0, 0), atlasUV(ct, 1, 0), atlasUV(ct, 0.5, 1), [cx, top - 5, cz]);
  }
  return top + (dome || r * 0.35);
}

export function makeChurch(style, rng) {
  const gb = new GeoBuilder();
  const rb = new GeoBuilder();
  const latin = style !== 'us' && style !== 'ca';
  const w = latin ? 13 : 11;
  const d = latin ? 30 : 22;
  const H = latin ? 10 : 6.5;
  const plain = latin ? 'plaster' : 'siding';
  const tiles = { plain, win: 'churchWin', door: 'churchDoor', pattern: (b) => b % 2 === 1 };
  const center = [0, H / 2, 0];
  boxAtlas(gb, 0, -1.5, 0, w + 0.4, 2, d + 0.4, 'foundation', false);
  wall(gb, center, w / 2, d / 2, w / 2, -d / 2, 0.5, H, tiles, -1, { story: H });
  wall(gb, center, -w / 2, -d / 2, -w / 2, d / 2, 0.5, H, tiles, -1, { story: H });
  wall(gb, center, w / 2, -d / 2, -w / 2, -d / 2, 0.5, H, { plain }, -1, { story: H });
  wall(gb, center, -w / 2, d / 2, w / 2, d / 2, 0.5, H, { plain, door: 'churchDoor', win: 'churchWin', pattern: () => false }, Math.floor(Math.round(w / 3) / 2), { story: H });
  const ph = w * 0.42;
  gable(gb, center, -w / 2, d / 2, w / 2, d / 2, H, ph, plain);
  gable(gb, center, w / 2, -d / 2, -w / 2, -d / 2, H, ph, plain);
  const tmp = new GeoBuilder();
  roofGable(tmp, d, w, H, ph, 0.6, center);
  rotateInto(rb, tmp, Math.PI / 2);
  // Torre(s) com campanário e cruz.
  const towers = latin && rng.chance(0.5) ? [-w / 2 + 1.8, w / 2 - 1.8] : [0];
  let top = 0;
  for (const tx of towers) {
    const tw = towers.length > 1 ? 3.6 : 4.2;
    const th = latin ? 22 + rng.range(-2, 6) : 16;
    boxAtlas(gb, tx, 0.3, d / 2 + (latin ? 1.5 : 1), tw, th, tw, plain);
    boxAtlas(gb, tx, th + 0.3, d / 2 + (latin ? 1.5 : 1), tw * 0.8, 3, tw * 0.8, 'trimLight');
    // Agulha.
    const ax = tx;
    const az = d / 2 + (latin ? 1.5 : 1);
    const ay = th + 3.3;
    const sh = latin ? 4 : 9;
    const r = tw * 0.45;
    const sc = [ax, ay, az];
    const pts = [
      [ax - r, az - r],
      [ax + r, az - r],
      [ax + r, az + r],
      [ax - r, az + r],
    ];
    for (let k = 0; k < 4; k++) {
      const a = pts[k];
      const b = pts[(k + 1) % 4];
      rb.tri([a[0], ay, a[1]], [b[0], ay, b[1]], [ax, ay + sh, az], [0, 0], [1, 0], [0.5, 2], sc);
    }
    boxAtlas(gb, ax, ay + sh, az, 0.2, 2.2, 0.2, 'trimDark');
    boxAtlas(gb, ax, ay + sh + 1.3, az, 1.1, 0.2, 0.2, 'trimDark');
    top = Math.max(top, ay + sh + 2.2);
  }
  return { walls: gb.build(), roof: rb.build(), roofType: latin ? 'clay' : 'shingles', w, d: d + 6, h: top, H };
}

export function makeWaterTower(name, style) {
  // Caixa d'água elevada com o nome da cidade (EUA/Canadá).
  const g = new THREE.Group();
  const legMat = new THREE.MeshStandardMaterial({ color: '#c8ccd0', roughness: 0.5, metalness: 0.6 });
  const tankMat = new THREE.MeshStandardMaterial({ color: '#dfe3e6', roughness: 0.45, metalness: 0.5 });
  const H = 32;
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.45, H, 8), legMat);
    leg.position.set(Math.cos(a) * 5, H / 2, Math.sin(a) * 5);
    leg.rotation.z = Math.cos(a) * 0.08;
    leg.rotation.x = -Math.sin(a) * 0.08;
    leg.castShadow = true;
    g.add(leg);
  }
  const riser = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, H, 10), legMat);
  riser.position.y = H / 2;
  g.add(riser);
  const tank = new THREE.Mesh(new THREE.SphereGeometry(8, 24, 14), tankMat);
  tank.scale.set(1, 0.72, 1);
  tank.position.y = H + 5;
  tank.castShadow = true;
  g.add(tank);
  // Nome pintado.
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 128;
  const c = cv.getContext('2d');
  c.clearRect(0, 0, 512, 128);
  c.fillStyle = style === 'ca' ? '#b01818' : '#1d3f7a';
  c.font = 'bold 84px sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(name.toUpperCase(), 256, 68, 480);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Mesh(new THREE.CylinderGeometry(8.05, 8.05, 4, 32, 1, true, -Math.PI * 0.3, Math.PI * 0.6), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.5 }));
  label.position.y = H + 5.2;
  label.rotation.y = Math.PI;
  g.add(label);
  const label2 = label.clone();
  label2.rotation.y = 0;
  g.add(label2);
  return g;
}

// Conjunto de modelos de casas para um estilo (variações sorteadas).
export function houseVariants(style, rng, count) {
  const out = [];
  for (let k = 0; k < count; k++) out.push(makeHouse(houseParams(style, rng)));
  return out;
}

export function houseParams(style, rng) {
  switch (style) {
    case 'us':
    case 'ca': {
      const two = rng.chance(0.3);
      const siding = rng.chance(0.75);
      return {
        w: rng.range(10, 15),
        d: rng.range(8, 10),
        stories: two ? 2 : 1,
        roof: rng.chance(0.75) ? 'gable' : 'hip',
        pitch: rng.range(0.35, 0.6),
        over: 0.5,
        tiles: siding ? { plain: 'siding', win: rng.chance(0.5) ? 'sidingWin' : 'sidingWin2', door: 'sidingDoor' } : { plain: 'brick', win: 'brickWin', door: 'brickDoor' },
        roofType: 'shingles',
        garage: !two && rng.chance(0.55),
        porch: rng.chance(0.4),
        chimney: rng.chance(0.4),
      };
    }
    case 'br': {
      const wood = rng.chance(0.3);
      const sobrado = !wood && rng.chance(0.18);
      return {
        w: rng.range(8, 12),
        d: rng.range(7, 10),
        stories: sobrado ? 2 : 1,
        storyH: 2.9,
        roof: wood ? 'gable' : rng.chance(0.7) ? 'hip' : 'gable',
        pitch: rng.range(0.4, 0.6),
        over: 0.6,
        tiles: wood ? { plain: 'log', win: 'logWin', door: 'plasterDoor' } : { plain: 'plaster', win: rng.chance(0.4) ? 'plasterWinShut' : 'plasterWin', door: 'plasterDoor' },
        roofType: wood ? 'corrugated' : 'clay',
        tank: rng.chance(0.25),
        porch: rng.chance(0.25),
      };
    }
    case 'ar':
    case 'uy': {
      const flat = rng.chance(0.55);
      return {
        w: rng.range(9, 13),
        d: rng.range(8, 12),
        stories: rng.chance(0.15) ? 2 : 1,
        roof: flat ? 'flat' : rng.chance(0.6) ? 'gable' : 'hip',
        pitch: rng.range(0.35, 0.55),
        over: flat ? 0 : 0.4,
        parapet: rng.range(0.6, 1.1),
        tiles: rng.chance(0.4) ? { plain: 'brick', win: 'brickWin', door: 'brickDoor' } : { plain: 'plaster', win: 'plasterWin', door: 'plasterDoor' },
        roofType: flat ? 'flat' : 'clay',
        tank: flat && rng.chance(0.7),
      };
    }
    case 'cl':
    default: {
      const wood = rng.chance(0.55);
      return {
        w: rng.range(8, 12),
        d: rng.range(7, 10),
        stories: rng.chance(0.25) ? 2 : 1,
        storyH: 2.8,
        roof: rng.chance(0.75) ? 'gable' : 'hip',
        pitch: rng.range(0.45, 0.7),
        over: 0.5,
        tiles: wood ? { plain: 'woodShingleWin', win: 'woodShingleWin', door: 'plasterDoor', pattern: () => false } : { plain: 'plaster', win: 'plasterWin', door: 'plasterDoor' },
        roofType: wood ? 'corrugated' : 'clay',
        chimney: rng.chance(0.5),
      };
    }
  }
}

// Comércio de centro (2–3 andares, telhado plano, letreiro).
export function shopParams(style, rng) {
  const us = style === 'us' || style === 'ca';
  return {
    w: rng.range(9, 16),
    d: rng.range(14, 22),
    stories: rng.int(1, us ? 3 : 2),
    storyH: 3.4,
    roof: 'flat',
    parapet: rng.range(0.8, 1.6),
    tiles: us
      ? { plain: 'brick', win: 'brickWin', door: 'brickShop', ground: 'brickShop', pattern: (b, s) => s > 0 }
      : { plain: 'plaster', win: 'plasterWin', door: 'shopSign', ground: rng.chance(0.5) ? 'shopSign' : 'shopGlass', pattern: (b, s) => s > 0 },
    roofType: 'flat',
    tank: !us && rng.chance(0.4),
  };
}

export function farmBuildings(style, rng) {
  // Celeiro, galpão, aviário, quonset…
  const list = [];
  if (style === 'us' || style === 'ca') {
    list.push({ kind: 'barn', model: makeHouse({ w: rng.range(18, 26), d: rng.range(12, 15), stories: 1, storyH: 5, roof: 'gambrel', over: 0.4, tiles: { plain: 'barnBoard', win: null, door: 'barnDoor' }, roofType: 'corrugated' }) });
    list.push({ kind: 'shed', model: makeHouse({ w: rng.range(20, 34), d: rng.range(14, 20), stories: 1, storyH: 5, roof: 'gable', pitch: 0.25, over: 0.4, tiles: { plain: 'metal', win: null, door: 'metalDoor' }, roofType: 'corrugated' }) });
    if (style === 'ca') list.push({ kind: 'quonset', model: makeHouse({ w: rng.range(20, 30), d: 12, stories: 1, storyH: 0.4, roof: 'curved', curveH: 6, tiles: { plain: 'metal', win: null, door: 'metalDoor' }, roofType: 'corrugated', base: 0.2 }) });
  } else if (style === 'br') {
    list.push({ kind: 'aviary', model: makeHouse({ w: rng.range(90, 130), d: 13, stories: 1, storyH: 3, roof: 'gable', pitch: 0.25, over: 0.6, tiles: { plain: 'aviary', win: null, door: 'aviary' }, roofType: 'corrugated', base: 0.4 }) });
    list.push({ kind: 'shed', model: makeHouse({ w: rng.range(12, 20), d: rng.range(8, 12), stories: 1, storyH: 4, roof: 'gable', pitch: 0.3, over: 0.5, tiles: { plain: 'barnBoard', win: null, door: 'barnDoor' }, roofType: 'corrugated' }) });
    list.push({ kind: 'pigsty', model: makeHouse({ w: rng.range(40, 60), d: 10, stories: 1, storyH: 2.4, roof: 'gable', pitch: 0.25, over: 0.6, tiles: { plain: 'concrete', win: null, door: 'concrete' }, roofType: 'corrugated' }) });
  } else {
    list.push({ kind: 'shed', model: makeHouse({ w: rng.range(18, 30), d: rng.range(12, 16), stories: 1, storyH: 5, roof: 'curved', curveH: 4, tiles: { plain: 'metal', win: null, door: 'metalDoor' }, roofType: 'corrugated' }) });
    list.push({ kind: 'shed', model: makeHouse({ w: rng.range(10, 16), d: rng.range(8, 10), stories: 1, storyH: 3.5, roof: 'gable', pitch: 0.3, over: 0.4, tiles: { plain: 'metalVert', win: null, door: 'metalDoor' }, roofType: 'corrugated' }) });
  }
  return list;
}

export function mobileHome(rng) {
  return makeHouse({ w: rng.range(18, 22), d: 4.6, stories: 1, storyH: 2.5, roof: 'gable', pitch: 0.12, over: 0.15, tiles: { plain: 'mobile', win: 'mobileWin', door: 'mobileWin' }, roofType: 'corrugated', base: 0.7 });
}

export function schoolModel(style) {
  const us = style === 'us' || style === 'ca';
  return makeHouse({
    w: 46,
    d: 16,
    stories: us ? 1 : 2,
    storyH: 3.6,
    roof: us ? 'flat' : 'hip',
    pitch: 0.3,
    tiles: us ? { plain: 'brick', win: 'schoolWin', door: 'brickDoor', pattern: () => true } : { plain: 'plaster', win: 'plasterWin', door: 'plasterDoor', pattern: () => true },
    roofType: us ? 'flat' : 'clay',
    parapet: 0.6,
  });
}

export function gasStation(style, rng) {
  const gb = new GeoBuilder();
  const rb = new GeoBuilder();
  // Lojinha.
  const shop = makeHouse({ w: 12, d: 9, stories: 1, storyH: 3.4, roof: 'flat', tiles: { plain: 'plaster', win: 'shopGlass', door: 'shopGlass', pattern: () => true }, roofType: 'flat', parapet: 0.6 });
  // Cobertura das bombas.
  const cy = 5.2;
  for (const [x, z] of [
    [-7, 9],
    [7, 9],
    [-7, 17],
    [7, 17],
  ])
    boxAtlas(gb, x, 0, z, 0.5, cy, 0.5, 'trimLight');
  boxAtlas(gb, 0, cy, 13, 20, 1.1, 12, 'gasCanopy');
  for (const x of [-3.5, 3.5]) for (const z of [11, 15]) boxAtlas(gb, x, 0, z, 0.9, 1.7, 0.6, 'trimDark');
  const merge = mergeGeos([shop.walls, gb.build()]);
  return { walls: merge, roof: shop.roof, roofType: 'flat', w: 20, d: 26, h: 7, H: 5 };
}

export function mergeGeos(geos) {
  const gb = new GeoBuilder();
  for (const g of geos) {
    const o = gb.count;
    const p = g.attributes.position.array;
    const n = g.attributes.normal.array;
    const uv = g.attributes.uv ? g.attributes.uv.array : new Float32Array((p.length / 3) * 2);
    for (let k = 0; k < p.length; k++) gb.p.push(p[k]);
    for (let k = 0; k < n.length; k++) gb.n.push(n[k]);
    for (let k = 0; k < uv.length; k++) gb.uv.push(uv[k]);
    if (g.index) {
      const idx = g.index.array;
      for (let k = 0; k < idx.length; k++) gb.i.push(idx[k] + o);
    } else {
      for (let k = 0; k < p.length / 3; k++) gb.i.push(k + o);
    }
  }
  return gb.build();
}

// Entulho de uma casa destruída (monte irregular com tábuas).
export function rubbleGeometry(seed = 3) {
  const rng = new RNG(seed);
  const gb = new GeoBuilder();
  const N = 10;
  const pts = [];
  for (let j = 0; j <= N; j++)
    for (let i = 0; i <= N; i++) {
      const x = i / N - 0.5;
      const z = j / N - 0.5;
      const r = Math.max(Math.abs(x), Math.abs(z)) * 2;
      const y = Math.max(0, (1 - r * r) * (0.5 + rng.next() * 0.6));
      pts.push([x, y, z]);
    }
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const a = pts[j * (N + 1) + i];
      const b = pts[j * (N + 1) + i + 1];
      const c = pts[(j + 1) * (N + 1) + i + 1];
      const d = pts[(j + 1) * (N + 1) + i];
      gb.quad(a, d, c, b, atlasUV('rubble', i / N, j / N), atlasUV('rubble', i / N, (j + 1) / N), atlasUV('rubble', (i + 1) / N, (j + 1) / N), atlasUV('rubble', (i + 1) / N, j / N), [0, -5, 0]);
    }
  // Tábuas e vigas espetadas.
  for (let k = 0; k < 9; k++) {
    const x = rng.range(-0.35, 0.35);
    const z = rng.range(-0.35, 0.35);
    const L = rng.range(0.25, 0.6);
    const a = rng.range(0, Math.PI);
    const tilt = rng.range(0.1, 0.6);
    const dx = Math.cos(a) * L * 0.5;
    const dz = Math.sin(a) * L * 0.5;
    const y = rng.range(0.15, 0.5);
    const t = 0.02;
    gb.quad([x - dx, y - tilt * 0.3, z - dz], [x + dx, y + tilt * 0.3, z + dz], [x + dx, y + tilt * 0.3 + t * 2, z + dz + t], [x - dx, y - tilt * 0.3 + t * 2, z - dz + t], atlasUV('barnBoard', 0, 0), atlasUV('barnBoard', 1, 0), atlasUV('barnBoard', 1, 0.2), atlasUV('barnBoard', 0, 0.2));
  }
  return gb.build();
}

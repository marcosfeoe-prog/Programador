// Vegetação e rochas: modelos procedurais (pinheiro, árvore de copa, samambaia
// gigante, moita de samambaia, arbusto e rocha), espalhados pelo mapa conforme a
// floresta, a altitude e a inclinação. Três níveis de detalhe atualizados em torno da
// câmera com InstancedMesh, vento no shader e colisão dos troncos/rochas.
import * as THREE from 'three';
import { HALF, WATER, CAMP, TOWERS } from './heightfield.js';
import { mulberry32, Simplex } from '../util/noise.js';

const CELL = 128;
const NC = (HALF * 2) / CELL; // 32

// ------------------------------------------------------------------ geometria
class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.idx = [];
  }
  get count() {
    return this.pos.length / 3;
  }
  vert(p, n, c) {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.col.push(c.r, c.g, c.b);
    return this.count - 1;
  }
  tri(a, b, c) {
    this.idx.push(a, b, c);
  }
  // acrescenta uma geometria do three (com transformação, cor e normal "esférica" opcional)
  add(geo, matrix, color, opts = {}) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const base = this.count;
    const v = new THREE.Vector3();
    const nn = new THREE.Vector3();
    const c = new THREE.Color();
    const rnd = opts.rnd || Math.random;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      nn.fromBufferAttribute(n, i);
      if (opts.center) {
        // normal "inflada" a partir do centro (copas parecem volumosas e macias)
        const s = new THREE.Vector3().subVectors(v, opts.center).normalize();
        nn.lerp(s, opts.soft ?? 0.7).normalize();
      }
      c.copy(color);
      if (opts.vary) c.offsetHSL((rnd() - 0.5) * opts.vary * 0.15, 0, (rnd() - 0.5) * opts.vary);
      if (opts.shadeY !== undefined) c.multiplyScalar(0.6 + 0.4 * Math.min(1, Math.max(0, (v.y - opts.shadeY[0]) / (opts.shadeY[1] - opts.shadeY[0]))));
      this.pos.push(v.x, v.y, v.z);
      this.nor.push(nn.x, nn.y, nn.z);
      this.col.push(c.r, c.g, c.b);
    }
    for (let i = 0; i < p.count; i++) this.idx.push(base + i);
    g.dispose();
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const M = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const E = new THREE.Euler();
const V = new THREE.Vector3();
const S = new THREE.Vector3();
function mat(x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  return M.compose(V.set(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), S.set(sx, sy, sz)).clone();
}

function jitter(geo, amt, rnd, keepBottom = false) {
  const p = geo.attributes.position;
  const minY = keepBottom ? Math.min(...Array.from({ length: p.count }, (_, i) => p.getY(i))) : -1e9;
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    let o = map.get(key);
    if (!o) {
      o = [(rnd() - 0.5) * amt, (rnd() - 0.5) * amt, (rnd() - 0.5) * amt];
      map.set(key, o);
    }
    if (keepBottom && Math.abs(p.getY(i) - minY) < 1e-3) continue;
    p.setXYZ(i, p.getX(i) + o[0], p.getY(i) + o[1], p.getZ(i) + o[2]);
  }
  geo.computeVertexNormals();
  return geo;
}

const BARK = new THREE.Color(0x4a3524);
const BARK_PINE = new THREE.Color(0x5a3a26);

function pineGeo(lod, rnd) {
  const b = new GeoBuilder();
  const H = 13;
  if (lod === 2) {
    b.add(new THREE.ConeGeometry(2.6, H * 0.92, 5, 1), mat(0, H * 0.54, 0), new THREE.Color(0x284c2a));
    return b.build();
  }
  const seg = lod === 0 ? 7 : 4;
  b.add(new THREE.CylinderGeometry(0.12, 0.38, H * 0.85, seg, 1, true), mat(0, H * 0.425, 0), BARK_PINE, { vary: 0.1, rnd });
  const layers = lod === 0 ? 6 : 3;
  for (let k = 0; k < layers; k++) {
    const f = k / (layers - 1);
    const r = 2.9 * (1 - f * 0.78);
    const h = (lod === 0 ? 3.2 : 4.8) * (1 - f * 0.3);
    const y = 2.6 + f * (H - 4.2);
    const g = new THREE.ConeGeometry(r, h, lod === 0 ? 10 : 6, lod === 0 ? 2 : 1, true);
    if (lod === 0) jitter(g, 0.45, rnd);
    const col = new THREE.Color(0x2d5a30).offsetHSL((rnd() - 0.5) * 0.03, 0, (rnd() - 0.5) * 0.06 + f * 0.05);
    b.add(g, mat(0, y + h * 0.5, 0, 0, rnd() * 6, 0), col, { center: new THREE.Vector3(0, y, 0), soft: 0.55, vary: 0.12, rnd, shadeY: [y, y + h] });
  }
  return b.build();
}

function broadGeo(lod, rnd) {
  const b = new GeoBuilder();
  if (lod === 2) {
    b.add(new THREE.OctahedronGeometry(3.6, 0), mat(0, 6.8, 0, 0, 0, 0, 1.1, 0.8, 1.1), new THREE.Color(0x3d6e2e));
    return b.build();
  }
  const seg = lod === 0 ? 7 : 4;
  b.add(new THREE.CylinderGeometry(0.28, 0.5, 5.5, seg, 1, true), mat(0, 2.75, 0), BARK, { vary: 0.1, rnd });
  if (lod === 0) {
    for (let k = 0; k < 4; k++) {
      const a = (k / 4) * Math.PI * 2 + rnd();
      b.add(new THREE.CylinderGeometry(0.09, 0.18, 3, 5, 1, true), mat(Math.cos(a) * 0.9, 5.3, Math.sin(a) * 0.9, Math.sin(a) * 0.8, 0, -Math.cos(a) * 0.8), BARK);
    }
  }
  const blobs = lod === 0 ? 7 : 3;
  const center = new THREE.Vector3(0, 7, 0);
  for (let k = 0; k < blobs; k++) {
    const a = rnd() * Math.PI * 2;
    const rr = k === 0 ? 0 : 1.6 + rnd() * 1.4;
    const y = 6.4 + (rnd() - 0.3) * 2.2;
    const s = (k === 0 ? 2.9 : 1.9 + rnd() * 0.9) * (lod === 0 ? 1 : 1.25);
    const g = new THREE.IcosahedronGeometry(1, lod === 0 ? 1 : 0);
    if (lod === 0) jitter(g, 0.35, rnd);
    const col = new THREE.Color(0x467a30).offsetHSL((rnd() - 0.5) * 0.05, 0, (rnd() - 0.5) * 0.08);
    b.add(g, mat(Math.cos(a) * rr, y, Math.sin(a) * rr, rnd(), rnd(), rnd(), s, s * 0.8, s), col, { center, soft: 0.8, vary: 0.15, rnd, shadeY: [4.5, 9.5] });
  }
  return b.build();
}

// fronde de samambaia: tira curva que cai para fora
function frond(b, len, width, droop, angle, tilt, y0, color, segs, rnd) {
  const pts = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const r = t * len;
    const y = y0 + Math.sin(tilt) * r - droop * t * t * len;
    pts.push(new THREE.Vector3(Math.cos(angle) * r * Math.cos(tilt), y, Math.sin(angle) * r * Math.cos(tilt)));
  }
  const side = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle));
  const up = new THREE.Vector3(0, 1, 0);
  const c = color.clone().offsetHSL((rnd() - 0.5) * 0.04, 0, (rnd() - 0.5) * 0.08);
  let prevL = -1;
  let prevR = -1;
  let prevC = -1;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const w = width * Math.sin(Math.PI * Math.min(1, t * 1.1 + 0.05)) * (1 - t * 0.3);
    const p = pts[i];
    const cc = c.clone().multiplyScalar(0.75 + 0.35 * t);
    const iL = b.vert(p.clone().addScaledVector(side, w), up, cc);
    const iR = b.vert(p.clone().addScaledVector(side, -w), up, cc);
    const iC = b.vert(p.clone().add(new THREE.Vector3(0, w * 0.25, 0)), up, cc);
    if (prevL >= 0) {
      b.tri(prevL, iL, prevC);
      b.tri(prevC, iL, iC);
      b.tri(prevC, iC, iR);
      b.tri(prevC, iR, prevR);
    }
    prevL = iL;
    prevR = iR;
    prevC = iC;
  }
}

function fernTreeGeo(lod, rnd) {
  const b = new GeoBuilder();
  const H = 3.6;
  if (lod === 2) {
    b.add(new THREE.ConeGeometry(2.4, 1.6, 5, 1), mat(0, H + 0.3, 0, Math.PI, 0, 0), new THREE.Color(0x3d6a2a));
    b.add(new THREE.CylinderGeometry(0.25, 0.35, H, 4, 1, true), mat(0, H / 2, 0), BARK);
    return b.build();
  }
  const tg = new THREE.CylinderGeometry(0.22, 0.42, H, lod === 0 ? 8 : 4, lod === 0 ? 4 : 1, true);
  if (lod === 0) jitter(tg, 0.08, rnd, true);
  b.add(tg, mat(0, H / 2, 0), new THREE.Color(0x3b2a1c), { vary: 0.15, rnd });
  const n = lod === 0 ? 13 : 7;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rnd() * 0.4;
    frond(b, 2.6 + rnd() * 1.1, 0.42, 0.55 + rnd() * 0.3, a, 0.5 + rnd() * 0.5, H, new THREE.Color(0x3f7a2c), lod === 0 ? 7 : 3, rnd);
  }
  return b.build();
}

function bushGeo(lod, rnd) {
  const b = new GeoBuilder();
  const n = lod === 0 ? 9 : 5;
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2 + rnd() * 0.5;
    frond(b, 0.9 + rnd() * 0.6, 0.22, 0.4, a, 0.7 + rnd() * 0.5, 0.05, new THREE.Color(0x4a8a30), lod === 0 ? 5 : 2, rnd);
  }
  return b.build();
}

function shrubGeo(lod, rnd) {
  const b = new GeoBuilder();
  const blobs = lod === 0 ? 4 : 2;
  const center = new THREE.Vector3(0, 0.6, 0);
  for (let k = 0; k < blobs; k++) {
    const a = rnd() * Math.PI * 2;
    const r = k === 0 ? 0 : 0.5;
    const s = 0.7 + rnd() * 0.4;
    const g = new THREE.IcosahedronGeometry(1, lod === 0 ? 1 : 0);
    if (lod === 0) jitter(g, 0.25, rnd);
    b.add(g, mat(Math.cos(a) * r, 0.55, Math.sin(a) * r, 0, rnd() * 3, 0, s, s * 0.7, s), new THREE.Color(0x3b6526), { center, soft: 0.8, vary: 0.15, rnd });
  }
  return b.build();
}

function rockGeo(lod, rnd) {
  const b = new GeoBuilder();
  const g = new THREE.IcosahedronGeometry(1, lod === 0 ? 2 : lod === 1 ? 1 : 0);
  jitter(g, lod === 0 ? 0.38 : 0.3, rnd);
  b.add(g, mat(0, 0.25, 0, 0, 0, 0, 1.2, 0.75, 1), new THREE.Color(0x7d7a74), { vary: 0.12, rnd, center: new THREE.Vector3(0, 0, 0), soft: 0.25 });
  return b.build();
}

const TYPES = [
  { id: 'pine', build: pineGeo, dist: [140, 520, 1150], r: 0.4, shadow: true, wind: 0.35, sway: 13 },
  { id: 'broad', build: broadGeo, dist: [130, 480, 1050], r: 0.5, shadow: true, wind: 0.5, sway: 9 },
  { id: 'fern', build: fernTreeGeo, dist: [110, 330, 650], r: 0.4, shadow: true, wind: 0.6, sway: 4.5, double: true },
  { id: 'bush', build: bushGeo, dist: [60, 170, 0], r: 0, shadow: false, wind: 0.8, sway: 1.2, double: true },
  { id: 'shrub', build: shrubGeo, dist: [70, 220, 0], r: 0, shadow: false, wind: 0.4, sway: 1.4 },
  { id: 'rock', build: rockGeo, dist: [120, 450, 900], r: 1, shadow: true, wind: 0, sway: 1 },
];

function makeVegMaterial(type, timeU) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: type.double ? THREE.DoubleSide : THREE.FrontSide });
  if (type.wind > 0) {
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = timeU;
      // folhas finas dos dois lados: a normal não inverte no verso (senão o verso fica preto)
      if (type.double) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uTime;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
{
  vec3 ip = vec3(instanceMatrix[3][0], 0.0, instanceMatrix[3][2]);
  float ph = ip.x * 0.11 + ip.z * 0.07;
  float k = pow(max(position.y, 0.0) / ${type.sway.toFixed(1)}, 2.0) * ${type.wind.toFixed(2)};
  float w = sin(uTime * 1.3 + ph) * 0.6 + sin(uTime * 2.9 + ph * 1.7) * 0.25;
  transformed.x += w * k * 0.35;
  transformed.z += cos(uTime * 1.1 + ph) * k * 0.2;
}`,
        );
    };
    m.customProgramCacheKey = () => 'veg-' + type.id;
  }
  return m;
}

const _m4 = new THREE.Matrix4();
const _q4 = new THREE.Quaternion();
const _p4 = new THREE.Vector3();
const _s4 = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);

export class Vegetation {
  constructor(hf, scene, quality) {
    this.hf = hf;
    this.scene = scene;
    this.quality = quality;
    this.time = { value: 0 };
    const dens = { low: 0.45, medium: 0.7, high: 1, ultra: 1.15 }[quality] ?? 1;
    const distK = { low: 0.6, medium: 0.8, high: 1, ultra: 1.3 }[quality] ?? 1;
    this.density = dens;
    this.cells = []; // por célula: { [type]: Float32Array [x,y,z,s,rot]*, colliders: [] }
    this.types = TYPES.map((t) => ({ ...t, dist: t.dist.map((d) => d * distK) }));
    this.meshes = [];
    const rnd = mulberry32(5150);
    for (const t of this.types) {
      const matl = makeVegMaterial(t, this.time);
      t.material = matl;
      t.lods = [0, 1, 2].map((l) => (t.dist[l] > 0 ? t.build(l, mulberry32(77 + l)) : null));
      t.inst = t.lods.map((g, l) => {
        if (!g) return null;
        const cap = l === 0 ? 2600 : l === 1 ? 14000 : 30000;
        const im = new THREE.InstancedMesh(g, matl, cap);
        im.count = 0;
        im.frustumCulled = false;
        im.castShadow = t.shadow && l === 0;
        im.receiveShadow = l === 0;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        scene.add(im);
        return im;
      });
    }
    void rnd;
    this.lastPos = new THREE.Vector3(1e9, 0, 1e9);
    this.lastFarPos = new THREE.Vector3(1e9, 0, 1e9);
    this.populate();
  }

  populate() {
    const hf = this.hf;
    const n = new Simplex(808);
    const rnd = mulberry32(2024);
    const dens = this.density;
    for (let cj = 0; cj < NC; cj++)
      for (let ci = 0; ci < NC; ci++) {
        const cell = { lists: this.types.map(() => []), col: [] };
        const x0 = -HALF + ci * CELL;
        const z0 = -HALF + cj * CELL;
        // árvores: grade com jitter de 6 m
        const sp = 6;
        for (let gz = 0; gz < CELL; gz += sp)
          for (let gx = 0; gx < CELL; gx += sp) {
            const x = x0 + gx + rnd() * sp;
            const z = z0 + gz + rnd() * sp;
            if (!hf.inBounds(x, z, 30)) continue;
            const h = hf.height(x, z);
            if (h < WATER + 0.8) continue;
            const f = hf.forestAt(x, z);
            const sl = hf.slope(x, z);
            if (sl > 0.75) continue;
            if (Math.hypot(x - CAMP.x, z - CAMP.z) < CAMP.r * 1.3) continue;
            if (TOWERS.some((t) => Math.hypot(x - t.x, z - t.z) < 14)) continue;
            const r = rnd();
            // floresta + árvores isoladas nos campos
            const p = (f * f * 0.95 + 0.006) * dens;
            if (r < p) {
              const alt = h;
              const pineK = Math.min(1, Math.max(0, (alt - 90) / 140)) + (z < -650 ? 0.5 : 0) + (x < -400 ? 0.25 : 0) + n.noise(x / 300, z / 300) * 0.25;
              const fernK = (alt < 70 ? 0.3 : 0) + (alt < WATER + 12 ? 0.35 : 0) + Math.max(0, n.noise(x / 200 + 9, z / 200)) * 0.5;
              const q = rnd();
              let type = 1;
              if (q < pineK * 0.7) type = 0;
              else if (q < pineK * 0.7 + fernK * 0.4) type = 2;
              if (alt > 300) type = 0;
              const s = type === 2 ? 0.75 + rnd() * 0.6 : 0.7 + rnd() * 0.65;
              this.push(cell, type, x, h, z, s, rnd() * Math.PI * 2);
              cell.col.push(x, z, this.types[type].r * s, type);
            }
          }
        // vegetação baixa e rochas
        const sp2 = 4;
        for (let gz = 0; gz < CELL; gz += sp2)
          for (let gx = 0; gx < CELL; gx += sp2) {
            const x = x0 + gx + rnd() * sp2;
            const z = z0 + gz + rnd() * sp2;
            if (!hf.inBounds(x, z, 20)) continue;
            const h = hf.height(x, z);
            if (h < WATER + 0.4) continue;
            const f = hf.forestAt(x, z);
            const sl = hf.slope(x, z);
            const pth = hf.pathAt(x, z);
            if (pth > 0.3) continue;
            const r = rnd();
            const campD = Math.hypot(x - CAMP.x, z - CAMP.z);
            if (campD < CAMP.r) continue;
            if (sl < 0.6 && h < 320) {
              if (r < (f * 0.32 + 0.015) * dens) {
                this.push(cell, 3, x, h, z, 0.7 + rnd() * 0.8, rnd() * 6.28);
                continue;
              }
              if (r < (f * 0.32 + 0.015 + (1 - f) * 0.03) * dens) {
                this.push(cell, 4, x, h, z, 0.6 + rnd() * 0.8, rnd() * 6.28);
                continue;
              }
            }
            const rockP = (0.0045 + Math.max(0, sl - 0.25) * 0.05 + (h > 200 ? 0.01 : 0)) * dens;
            if (r > 1 - rockP) {
              const big = rnd() < 0.18;
              const s = big ? 1.8 + rnd() * 2.6 : 0.35 + rnd() * 0.9;
              const yy = h - s * 0.25;
              this.push(cell, 5, x, yy, z, s, rnd() * 6.28);
              if (s > 0.6) cell.col.push(x, z, s * 1.05, 5);
            }
          }
        cell.data = cell.lists.map((l) => new Float32Array(l));
        cell.lists = null;
        this.cells.push(cell);
      }
  }

  push(cell, type, x, y, z, s, rot) {
    cell.lists[type].push(x, y, z, s, rot);
  }

  cellAt(x, z) {
    const ci = Math.floor((x + HALF) / CELL);
    const cj = Math.floor((z + HALF) / CELL);
    if (ci < 0 || cj < 0 || ci >= NC || cj >= NC) return null;
    return this.cells[cj * NC + ci];
  }

  // percorre os colisores perto de (x,z): fn(x, z, r, type)
  forColliders(x, z, radius, fn) {
    const c0 = Math.floor((x - radius + HALF) / CELL);
    const c1 = Math.floor((x + radius + HALF) / CELL);
    const r0 = Math.floor((z - radius + HALF) / CELL);
    const r1 = Math.floor((z + radius + HALF) / CELL);
    for (let cj = Math.max(0, r0); cj <= Math.min(NC - 1, r1); cj++)
      for (let ci = Math.max(0, c0); ci <= Math.min(NC - 1, c1); ci++) {
        const col = this.cells[cj * NC + ci].col;
        for (let k = 0; k < col.length; k += 4) {
          const dx = col[k] - x;
          const dz = col[k + 1] - z;
          const rr = radius + col[k + 2];
          if (dx * dx + dz * dz < rr * rr) {
            if (fn(col[k], col[k + 1], col[k + 2], col[k + 3]) === false) return;
          }
        }
      }
  }

  // empurra um círculo (x,z,r) para fora dos troncos/rochas; devolve {x,z}
  collide(pos, r) {
    this.forColliders(pos.x, pos.z, r + 3, (cx, cz, cr) => {
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d = Math.hypot(dx, dz);
      const min = r + cr;
      if (d < min && d > 1e-4) {
        pos.x = cx + (dx / d) * min;
        pos.z = cz + (dz / d) * min;
      }
    });
  }

  // densidade de árvores ao redor (para a IA evitar mata fechada)
  treeDensity(x, z, r) {
    let n = 0;
    this.forColliders(x, z, r, (cx, cz, cr, type) => {
      if (type !== 5) n++;
    });
    return n;
  }

  // Monta as listas de instâncias em volta da câmera. As árvores próximas (LOD 0 e 1)
  // são refeitas a cada 3 m andados; as distantes (LOD 2), só a cada 30 m.
  update(dt, camPos, force = false) {
    this.time.value += dt;
    const doFar = force || this.lastFarPos.distanceToSquared(camPos) > 900;
    if (!doFar && this.lastPos.distanceToSquared(camPos) < 9) return;
    this.lastPos.copy(camPos);
    if (doFar) this.lastFarPos.copy(camPos);
    const counts = this.types.map(() => [0, 0, 0]);
    const maxD = doFar ? Math.max(...this.types.map((t) => Math.max(...t.dist))) : Math.max(...this.types.map((t) => t.dist[1]));
    const c0 = Math.floor((camPos.x - maxD + HALF) / CELL);
    const c1 = Math.floor((camPos.x + maxD + HALF) / CELL);
    const r0 = Math.floor((camPos.z - maxD + HALF) / CELL);
    const r1 = Math.floor((camPos.z + maxD + HALF) / CELL);
    for (let cj = Math.max(0, r0); cj <= Math.min(NC - 1, r1); cj++)
      for (let ci = Math.max(0, c0); ci <= Math.min(NC - 1, c1); ci++) {
        const cell = this.cells[cj * NC + ci];
        const ccx = -HALF + (ci + 0.5) * CELL;
        const ccz = -HALF + (cj + 0.5) * CELL;
        const cd = Math.hypot(ccx - camPos.x, ccz - camPos.z) - CELL * 0.72;
        for (let t = 0; t < this.types.length; t++) {
          const T = this.types[t];
          const data = cell.data[t];
          if (!data.length) continue;
          const far = doFar ? T.dist[2] || T.dist[1] : T.dist[1];
          if (cd > far) continue;
          for (let k = 0; k < data.length; k += 5) {
            const dx = data[k] - camPos.x;
            const dz = data[k + 2] - camPos.z;
            const d = Math.sqrt(dx * dx + dz * dz) / Math.max(0.7, data[k + 3] * 0.6 + 0.4);
            if (d < T.dist[1]) this.put(T, t, d < T.dist[0] ? 0 : 1, counts, data, k);
            // faixa de sobreposição: evita buracos entre as passadas próxima e distante
            if (doFar && d >= T.dist[1] - 35 && d < T.dist[2]) this.put(T, t, 2, counts, data, k);
          }
        }
      }
    for (let t = 0; t < this.types.length; t++)
      for (let l = 0; l < 3; l++) {
        const im = this.types[t].inst[l];
        if (!im || (l === 2 && !doFar)) continue;
        im.count = counts[t][l];
        im.instanceMatrix.needsUpdate = true;
        im.instanceMatrix.clearUpdateRanges();
        im.instanceMatrix.addUpdateRange(0, Math.max(1, counts[t][l]) * 16);
      }
  }

  put(T, t, l, counts, data, k) {
    const im = T.inst[l];
    if (!im) return;
    const i = counts[t][l];
    if (i >= im.instanceMatrix.count) return;
    const s = data[k + 3];
    _q4.setFromAxisAngle(_up, data[k + 4]);
    _p4.set(data[k], data[k + 1], data[k + 2]);
    _s4.set(s, s, s);
    if (t === 5) _s4.set(s * (0.8 + ((k * 7) % 5) * 0.1), s * 0.8, s);
    _m4.compose(_p4, _q4, _s4);
    _m4.toArray(im.instanceMatrix.array, i * 16);
    counts[t][l] = i + 1;
  }
}

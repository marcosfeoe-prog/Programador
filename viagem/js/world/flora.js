// Vegetação: 18 espécies procedurais (tronco + copa com cartões de folhas) em três
// níveis de detalhe instanciados, e tufos de grama em volta da câmera.
import * as THREE from 'three';
import { RNG, hash2, clamp } from '../util.js';
import { SPECIES, SP } from './gen.js';
import { COUNTRIES } from './data.js';
import { leafAtlas, barkTex } from './textures.js';
import { merge, paint, xf } from '../geom.js';

const CELL = 128;
const C = (h) => new THREE.Color(h);

// cartões de folhas em volta de um elipsoide; normais apontam para fora da copa
function cards(rng, { cx = 0, cy, cz = 0, rx, ry, rz = rx, count, size, cell, shell = 0.75, tilt = 1, normalUp = 0.35 }) {
  const P = [];
  const N = [];
  const U = [];
  const I = [];
  const u0 = (cell % 4) / 4;
  const v0 = 1 - (Math.floor(cell / 4) + 1) / 2;
  const du = 1 / 4;
  const dv = 1 / 2;
  const v = new THREE.Vector3();
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    // ponto na casca do elipsoide
    const th = rng.float(0, Math.PI * 2);
    const ph = Math.acos(rng.float(-0.85, 1));
    const rr = rng.float(shell, 1);
    const dx = Math.sin(ph) * Math.cos(th);
    const dy = Math.cos(ph);
    const dz = Math.sin(ph) * Math.sin(th);
    const px = cx + dx * rx * rr;
    const py = cy + dy * ry * rr;
    const pz = cz + dz * rz * rr;
    // orientação aleatória do cartão
    v.set(rng.float(-1, 1), rng.float(-1, 1) * tilt, rng.float(-1, 1)).normalize();
    a.set(0, 1, 0).cross(v);
    if (a.lengthSq() < 0.01) a.set(1, 0, 0);
    a.normalize();
    b.copy(v).cross(a).normalize();
    const s = size * rng.float(0.75, 1.25);
    const nx = dx;
    const ny = dy + normalUp;
    const nz = dz;
    const nl = Math.hypot(nx, ny, nz);
    const base = P.length / 3;
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ];
    for (const [cu, cv] of corners) {
      P.push(px + (a.x * cu + b.x * cv) * s * 0.5, py + (a.y * cu + b.y * cv) * s * 0.5, pz + (a.z * cu + b.z * cv) * s * 0.5);
      N.push(nx / nl, ny / nl, nz / nl);
      U.push(u0 + ((cu + 1) / 2) * du, v0 + ((cv + 1) / 2) * dv);
    }
    I.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  return g;
}

// fronde/folha comprida curvada (palmeira, bananeira)
function frond(rng, { len, width, cell, droop, segs = 6, yaw, pitch, x = 0, y, z = 0 }) {
  const P = [];
  const N = [];
  const U = [];
  const I = [];
  const u0 = (cell % 4) / 4;
  const v0 = 1 - (Math.floor(cell / 4) + 1) / 2;
  const cy = Math.cos(yaw);
  const sy = Math.sin(yaw);
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const ang = pitch - droop * t * t;
    const d = len * t;
    const hx = Math.cos(ang) * d;
    const hy = Math.sin(ang) * d - droop * 0.35 * len * t * t;
    const w = width * Math.sin(Math.min(1, t * 1.2 + 0.08) * Math.PI) * 0.5 + width * 0.08;
    for (const s of [-1, 1]) {
      const lx = hx;
      const lz = s * w;
      P.push(x + lx * cy - lz * sy, y + hy + Math.abs(s) * w * 0.15, z + lx * sy + lz * cy);
      N.push(0, 1, 0);
      U.push(u0 + (s > 0 ? 0.25 : 0), v0 + t * 0.5);
    }
    if (i > 0) {
      const a = (i - 1) * 2;
      I.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
  g.setIndex(I);
  g.computeVertexNormals();
  return g;
}

function trunk(h, r0, r1, color, seg = 7, bend = 0, curveSegs = 1) {
  const g = new THREE.CylinderGeometry(r1, r0, h, seg, curveSegs, true);
  g.translate(0, h / 2, 0);
  if (bend) {
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / h;
      p.setX(i, p.getX(i) + bend * y * y * h);
    }
    g.computeVertexNormals();
  }
  // uv do tronco em metros
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * h * 0.5);
  return paint(g, color);
}

function blob(rng, rx, ry, rz, y, color, detail = 1, x = 0, z = 0, jitter = 0.18) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const k = 1 + rng.float(-jitter, jitter);
    p.setXYZ(i, p.getX(i) * rx * k + x, p.getY(i) * ry * k + y, p.getZ(i) * rz * k + z);
  }
  g.computeVertexNormals();
  return paint(g, color);
}

// Cada espécie: { solid: [L0, L1, L2], leaf: [L0, L1] }
function buildSpecies(name) {
  const rng = new RNG(SPECIES.indexOf(name) * 7 + 3);
  const S = { solid: [], leaf: [] };
  const lod = (fn) => {
    for (let l = 0; l < 3; l++) {
      const r = fn(l);
      S.solid[l] = r.solid ? merge(r.solid) : null;
      if (l < 2) S.leaf[l] = r.leaf && r.leaf.length ? merge(r.leaf.map((g) => paint(g, 0xffffff))) : null;
    }
  };
  const bark = C('#6b5444');
  const darkBark = C('#3e3029');
  switch (name) {
    case 'spruce':
    case 'cedar':
    case 'pine': {
      const tall = name === 'pine' ? 17 : name === 'cedar' ? 18 : 15;
      const green = name === 'cedar' ? C('#24402a') : name === 'pine' ? C('#2c4626') : C('#1f3a24');
      lod((l) => {
        const solid = [trunk(tall, name === 'pine' ? 0.32 : 0.28, 0.05, name === 'pine' ? C('#7a5a42') : darkBark, l === 2 ? 4 : 7)];
        const leaf = [];
        if (name === 'pine') {
          solid.push(blob(rng, 3.2, 2.6, 3.2, tall - 3, green, l === 2 ? 0 : 1));
          if (l < 2) leaf.push(cards(rng, { cy: tall - 3, rx: 3.6, ry: 3, count: l ? 10 : 34, size: 2.6, cell: 1 }));
        } else {
          const tiers = l === 2 ? 1 : l === 1 ? 4 : 9;
          if (l === 2) {
            const cg = new THREE.ConeGeometry(name === 'cedar' ? 2.4 : 3.1, tall - 2, 6);
            cg.translate(0, (tall - 2) / 2 + 2, 0);
            solid.push(paint(cg, green));
          } else {
            const cg = new THREE.ConeGeometry(name === 'cedar' ? 1.9 : 2.5, tall - 3, 8, 1, true);
            cg.translate(0, (tall - 3) / 2 + 2.2, 0);
            solid.push(paint(cg, green.clone().multiplyScalar(0.75)));
            for (let t = 0; t < tiers; t++) {
              const y = 2.6 + (t / tiers) * (tall - 3.5);
              const rad = (name === 'cedar' ? 2.2 : 3.0) * (1 - t / tiers) + 0.35;
              leaf.push(cards(rng, { cy: y + 0.5, rx: rad, ry: 1.0, count: l ? 6 : Math.round(8 + rad * 3), size: 1.6 + rad * 0.5, cell: 1, shell: 0.5, tilt: 0.35, normalUp: 0.5 }));
            }
          }
        }
        return { solid, leaf };
      });
      break;
    }
    case 'birch':
    case 'beech':
    case 'maple':
    case 'tropical':
    case 'olive':
    case 'bush':
    case 'cherry': {
      const P = {
        birch: { h: 7, r: 0.16, cr: 2.4, cy: 9, crh: 3.4, bark: C('#e6e2da'), g: C('#5c8a34'), cell: 0, n: 40 },
        beech: { h: 5.5, r: 0.3, cr: 4.0, cy: 8.5, crh: 3.6, bark: C('#8a8478'), g: C('#3f6a2a'), cell: 0, n: 55 },
        maple: { h: 4.5, r: 0.25, cr: 3.4, cy: 7, crh: 3.0, bark: darkBark, g: C('#4d7a2c'), cell: 0, n: 48 },
        tropical: { h: 8, r: 0.38, cr: 5.0, cy: 12, crh: 3.8, bark: C('#7d6a58'), g: C('#2e5a22'), cell: 0, n: 64 },
        olive: { h: 2.2, r: 0.28, cr: 2.4, cy: 3.6, crh: 1.6, bark: C('#6a6258'), g: C('#76805a'), cell: 5, n: 30 },
        bush: { h: 0.2, r: 0.1, cr: 1.2, cy: 0.9, crh: 0.85, bark: darkBark, g: C('#3e6328'), cell: 0, n: 14 },
        cherry: { h: 3.2, r: 0.26, cr: 3.8, cy: 5.4, crh: 2.3, bark: C('#4a3530'), g: C('#e8b4c4'), cell: 3, n: 56 },
      }[name];
      lod((l) => {
        const solid = [];
        if (P.h > 0.5) solid.push(trunk(P.cy - P.crh * 0.3, P.r, P.r * 0.45, P.bark, l === 2 ? 4 : 7, name === 'olive' ? 0.15 : 0, 3));
        // galhos principais
        if (l === 0 && P.h > 2) {
          for (let b = 0; b < 4; b++) {
            const br = trunk(P.cr * 0.8, P.r * 0.5, P.r * 0.15, P.bark, 5);
            xf(br, 0, P.h, 0, rng.float(0.5, 0.9), (b / 4) * Math.PI * 2 + rng.float(-0.3, 0.3), 0);
            solid.push(br);
          }
        }
        solid.push(blob(rng, P.cr * 0.82, P.crh * 0.82, P.cr * 0.82, P.cy, P.g.clone().multiplyScalar(name === 'cherry' ? 0.85 : 0.7), l === 2 ? 0 : 1));
        if (l === 0 && P.cr > 2) {
          for (let k = 0; k < 3; k++) {
            const a = rng.float(0, Math.PI * 2);
            solid.push(blob(rng, P.cr * 0.5, P.crh * 0.5, P.cr * 0.5, P.cy + rng.float(-0.3, 0.6), P.g.clone().multiplyScalar(0.72), 1, Math.cos(a) * P.cr * 0.45, Math.sin(a) * P.cr * 0.45));
          }
        }
        const leaf = l < 2 ? [cards(rng, { cy: P.cy, rx: P.cr, ry: P.crh, count: l ? Math.round(P.n / 3) : P.n, size: P.cr * 0.75 + 0.6, cell: P.cell })] : [];
        return { solid, leaf };
      });
      break;
    }
    case 'cypress':
      lod((l) => {
        const solid = [trunk(2, 0.22, 0.15, darkBark, 5), blob(rng, 1.25, 7, 1.25, 8, C('#1e3620'), l === 2 ? 0 : 1, 0, 0, 0.1)];
        const leaf = l < 2 ? [cards(rng, { cy: 8, rx: 1.5, ry: 7.2, count: l ? 12 : 40, size: 1.8, cell: 4, shell: 0.8, tilt: 0.3 })] : [];
        return { solid, leaf };
      });
      break;
    case 'stonepine':
      lod((l) => {
        const solid = [trunk(10, 0.35, 0.18, C('#7a5c48'), l === 2 ? 4 : 7, 0.06, 4), blob(rng, 5, 1.5, 5, 11, C('#2d4a26'), l === 2 ? 0 : 1)];
        const leaf = l < 2 ? [cards(rng, { cy: 11.2, rx: 5.5, ry: 1.6, count: l ? 14 : 46, size: 2.6, cell: 1, tilt: 0.25, normalUp: 0.8 })] : [];
        return { solid, leaf };
      });
      break;
    case 'palm':
    case 'banana': {
      const palm = name === 'palm';
      lod((l) => {
        const H = palm ? 9 : 2.6;
        const bend = palm ? 0.12 : 0;
        const solid = [trunk(H, palm ? 0.24 : 0.16, palm ? 0.16 : 0.12, palm ? C('#8a7a62') : C('#6f8a40'), l === 2 ? 4 : 7, bend, palm ? 6 : 1)];
        const leaf = [];
        const topX = bend * H;
        if (l === 2) {
          solid.push(blob(rng, palm ? 3.5 : 1.6, 1.0, palm ? 3.5 : 1.6, H, C(palm ? '#3d6a2a' : '#4f8a30'), 0, topX));
        } else {
          const nf = palm ? (l ? 6 : 11) : l ? 4 : 7;
          for (let f = 0; f < nf; f++) {
            leaf.push(
              frond(rng, {
                len: palm ? rng.float(4.2, 5.2) : rng.float(2, 2.6),
                width: palm ? 1.6 : 0.9,
                cell: palm ? 2 : 6,
                droop: palm ? rng.float(1.1, 1.6) : 0.9,
                yaw: (f / nf) * Math.PI * 2 + rng.float(-0.2, 0.2),
                pitch: palm ? rng.float(0.25, 0.65) : rng.float(0.6, 1.0),
                x: topX,
                y: H,
                segs: l ? 3 : 6,
              }),
            );
          }
          if (palm) solid.push(blob(rng, 0.5, 0.5, 0.5, H - 0.2, C('#6a5a3a'), 0, topX));
        }
        return { solid, leaf };
      });
      break;
    }
    case 'saguaro':
      lod((l) => {
        const g = C('#4c6b3a');
        const rib = (h, r) => {
          const pts = [];
          for (let i = 0; i <= 8; i++) {
            const t = i / 8;
            pts.push(new THREE.Vector2(r * Math.sqrt(1 - Math.pow(Math.max(0, t - 0.85) / 0.15, 2)) || 0.01, t * h));
          }
          const lg = new THREE.LatheGeometry(pts, l === 2 ? 6 : 14);
          const p = lg.attributes.position;
          for (let i = 0; i < p.count; i++) {
            const a = Math.atan2(p.getZ(i), p.getX(i));
            const k = 1 + 0.08 * Math.cos(a * 7);
            p.setX(i, p.getX(i) * k);
            p.setZ(i, p.getZ(i) * k);
          }
          lg.computeVertexNormals();
          return paint(lg, g);
        };
        const solid = [rib(7, 0.38)];
        for (const s of [-1, 1]) {
          const arm = rib(2.4, 0.26);
          xf(arm, s * 0.95, 3 + s * 0.5, 0);
          solid.push(arm);
          const elbow = new THREE.CylinderGeometry(0.26, 0.26, 0.9, l === 2 ? 5 : 10);
          xf(elbow, s * 0.55, 2.8 + s * 0.5, 0, 0, 0, Math.PI / 2);
          solid.push(paint(elbow, g));
        }
        return { solid, leaf: [] };
      });
      break;
    case 'agave':
      lod((l) => {
        const solid = [];
        const n = l === 2 ? 6 : 14;
        for (let i = 0; i < n; i++) {
          const cg = new THREE.ConeGeometry(0.12, 1.3, 4);
          cg.translate(0, 0.65, 0);
          xf(cg, 0, 0, 0, rng.float(0.5, 1.1), (i / n) * Math.PI * 2, 0);
          solid.push(paint(cg, C('#6a8a7a')));
        }
        return { solid, leaf: [] };
      });
      break;
    case 'shrub':
      lod((l) => {
        const solid = [blob(rng, 0.8, 0.5, 0.8, 0.45, C('#6a6440'), 0)];
        const leaf = l < 2 ? [cards(rng, { cy: 0.6, rx: 1, ry: 0.6, count: l ? 4 : 10, size: 1.4, cell: 7, tilt: 0.3 })] : [];
        return { solid, leaf };
      });
      break;
    case 'rock':
      lod((l) => {
        const g = new THREE.IcosahedronGeometry(1, l === 0 ? 2 : l === 1 ? 1 : 0);
        const p = g.attributes.position;
        const r2 = new RNG(77);
        const bumps = Array.from({ length: 8 }, () => [r2.float(-1, 1), r2.float(-1, 1), r2.float(-1, 1), r2.float(0.1, 0.35)]);
        for (let i = 0; i < p.count; i++) {
          const x = p.getX(i);
          const y = p.getY(i);
          const z = p.getZ(i);
          let k = 1;
          for (const b of bumps) k -= b[3] * Math.max(0, x * b[0] + y * b[1] + z * b[2]) * 0.6;
          p.setXYZ(i, x * k * 1.3, y * k * 0.75 + 0.3, z * k);
        }
        g.computeVertexNormals();
        return { solid: [paint(g, C('#8a857c'))], leaf: [] };
      });
      break;
  }
  return S;
}

// vento nas folhas e galhos
function addWind(mat, uniforms, strength) {
  mat.onBeforeCompile = (s) => {
    s.uniforms.uTime = uniforms.uTime;
    s.uniforms.uWind = uniforms.uWind;
    s.vertexShader = s.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform float uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
#else
vec3 ip = vec3(0.0);
#endif
float wph = ip.x * 0.13 + ip.z * 0.17;
float wk = max(position.y - 1.0, 0.0) * ${strength.toFixed(3)} * uWind;
transformed.x += sin(uTime * 1.3 + wph) * wk + sin(uTime * 3.7 + wph * 2.0 + position.y) * wk * 0.25;
transformed.z += cos(uTime * 1.1 + wph) * wk * 0.6;`,
      );
  };
  mat.customProgramCacheKey = () => 'wind' + strength;
}

export class Flora {
  constructor(scene, pool, gen, Q) {
    this.scene = scene;
    this.pool = pool;
    this.gen = gen;
    this.Q = Q;
    this.cells = new Map();
    this.uniforms = { uTime: { value: 0 }, uWind: { value: 1 } };
    const atlas = leafAtlas();
    this.matLeaf = new THREE.MeshStandardMaterial({ map: atlas, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
    addWind(this.matLeaf, this.uniforms, 0.012);
    this.matSolid = new THREE.MeshStandardMaterial({ vertexColors: true, map: barkTex(), roughness: 0.92 });
    addWind(this.matSolid, this.uniforms, 0.006);
    this.matFar = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    this.species = SPECIES.map((n) => buildSpecies(n));
    // instâncias por espécie e por nível
    this.cap = [Q.treeCap0, Q.treeCap1, Q.treeCap2];
    this.inst = this.species.map((sp, si) => {
      const tiers = [];
      for (let l = 0; l < 3; l++) {
        const t = {};
        const cap = si === SP.rock || si === SP.bush || si === SP.shrub ? Math.round(this.cap[l] * 0.5) : this.cap[l];
        if (sp.solid[l]) {
          t.solid = new THREE.InstancedMesh(sp.solid[l], l === 2 ? this.matFar : this.matSolid, cap);
          t.solid.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          t.solid.count = 0;
          t.solid.visible = false;
          t.solid.castShadow = l === 0 && Q.shadows > 0;
          t.solid.receiveShadow = l === 0;
          t.solid.frustumCulled = false;
          scene.add(t.solid);
        }
        if (l < 2 && sp.leaf[l]) {
          t.leaf = new THREE.InstancedMesh(sp.leaf[l], this.matLeaf, cap);
          t.leaf.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          t.leaf.count = 0;
          t.leaf.visible = false;
          t.leaf.castShadow = l === 0 && Q.shadows > 0;
          t.leaf.receiveShadow = l === 0;
          t.leaf.frustumCulled = false;
          scene.add(t.leaf);
        }
        t.cap = cap;
        tiers.push(t);
      }
      return tiers;
    });
    this.lastPos = new THREE.Vector3(1e9, 0, 1e9);
    this.lastFarPos = new THREE.Vector3(1e9, 0, 1e9);
    this.dirty = true;
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.v = new THREE.Vector3();
    this.s = new THREE.Vector3();
    this.col = new THREE.Color();
    this.up = new THREE.Vector3(0, 1, 0);
    this.grass = new Grass(scene, gen, Q, this.uniforms);
  }

  // cor de cada instância (variação natural; bordos ficam avermelhados)
  tint(sid, t, out) {
    const k = 0.82 + t * 0.32;
    if (sid === SP.maple) {
      if (t > 0.55) return out.setRGB(1.35, 0.55 + (t - 0.55) * 0.8, 0.35);
      return out.setRGB(k, k, k);
    }
    if (sid === SP.birch && t > 0.8) return out.setRGB(1.25, 1.1, 0.5);
    return out.setRGB(k * (0.95 + t * 0.1), k, k * (0.95 - t * 0.05));
  }

  update(pos, dt) {
    this.uniforms.uTime.value += dt;
    const R = this.Q.treeFar;
    const ci = Math.floor(pos.x / CELL);
    const cj = Math.floor(pos.z / CELL);
    const rc = Math.ceil(R / CELL);
    // pede células que faltam (as mais próximas primeiro)
    let req = 0;
    const need = [];
    for (let dj = -rc; dj <= rc; dj++)
      for (let di = -rc; di <= rc; di++) {
        const d = Math.hypot(di, dj) * CELL;
        if (d > R + CELL) continue;
        const k = (ci + di) * 10000 + (cj + dj);
        if (!this.cells.has(k)) need.push([d, ci + di, cj + dj, k]);
      }
    need.sort((a, b) => a[0] - b[0]);
    for (const [, i, j, k] of need) {
      if (this.pool.load > 4 || req > 6) break;
      this.cells.set(k, null);
      req++;
      this.pool.run({ type: 'trees', cx: i, cz: j, size: CELL }).then((r) => {
        this.cells.set(k, { i, j, t: r.trees });
        this.dirty = true;
      });
    }
    // descarta células distantes
    if (this.cells.size > (rc * 2 + 3) ** 2) {
      for (const [k, c] of this.cells) {
        if (!c) continue;
        if (Math.abs(c.i - ci) > rc + 2 || Math.abs(c.j - cj) > rc + 2) this.cells.delete(k);
      }
    }
    const moved = Math.hypot(pos.x - this.lastPos.x, pos.z - this.lastPos.z);
    const movedFar = Math.hypot(pos.x - this.lastFarPos.x, pos.z - this.lastFarPos.z);
    if (moved > 24 || (this.dirty && moved > 4) || movedFar > 220) {
      this.rebuild(pos, movedFar > 220 || this.dirty);
      this.lastPos.copy(pos);
      this.dirty = false;
    }
    this.grass.update(pos);
  }

  rebuild(pos, full) {
    const Q = this.Q;
    const r0 = Q.treeNear * Q.treeNear;
    const r1 = Q.treeMid * Q.treeMid;
    const r2 = Q.treeFar * Q.treeFar;
    const tiers = full ? [0, 1, 2] : [0, 1];
    if (full) this.lastFarPos.copy(pos);
    const counts = this.inst.map(() => [0, 0, 0]);
    const { m, q, v, s, col, up } = this;
    for (const c of this.cells.values()) {
      if (!c) continue;
      const cx = (c.i + 0.5) * CELL - pos.x;
      const cz = (c.j + 0.5) * CELL - pos.z;
      const cd = cx * cx + cz * cz;
      if (cd > (Q.treeFar + 100) ** 2) continue;
      const t = c.t;
      for (let o = 0; o < t.length; o += 8) {
        const dx = t[o] - pos.x;
        const dz = t[o + 2] - pos.z;
        const d2 = dx * dx + dz * dz;
        let l;
        if (d2 < r0) l = 0;
        else if (d2 < r1) {
          if (t[o + 7] > Q.midKeep) continue;
          l = 1;
        } else if (d2 < r2) {
          if (t[o + 7] > Q.farKeep) continue;
          l = 2;
        } else continue;
        if (!tiers.includes(l)) continue;
        const sid = t[o + 5];
        const T = this.inst[sid][l];
        const n = counts[sid][l];
        if (n >= T.cap) continue;
        counts[sid][l]++;
        let sc = t[o + 3];
        if (l === 2) sc *= 1.15;
        q.setFromAxisAngle(up, t[o + 4]);
        m.compose(v.set(t[o], t[o + 1] - 0.15, t[o + 2]), q, s.set(sc, sc * (0.9 + t[o + 6] * 0.25), sc));
        this.tint(sid, t[o + 6], col);
        if (T.solid) {
          T.solid.setMatrixAt(n, m);
          T.solid.setColorAt(n, col);
        }
        if (T.leaf) {
          T.leaf.setMatrixAt(n, m);
          T.leaf.setColorAt(n, col);
        }
      }
    }
    for (let si = 0; si < this.inst.length; si++)
      for (const l of tiers) {
        const T = this.inst[si][l];
        const n = counts[si][l];
        for (const mesh of [T.solid, T.leaf]) {
          if (!mesh) continue;
          mesh.count = n;
          mesh.visible = n > 0;
          mesh.instanceMatrix.needsUpdate = true;
          if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        }
      }
  }
}

// ------------------------------------------------------------ grama
// Grade toroidal de tufos em volta da câmera; só recalcula as células novas.
class Grass {
  constructor(scene, gen, Q, uniforms) {
    this.gen = gen;
    this.Q = Q;
    this.N = Q.grassGrid;
    this.cs = 1.7;
    if (!this.N) return;
    const n = this.N * this.N;
    // tufo: 3 planos cruzados com lâminas desenhadas
    const c = document.createElement('canvas');
    c.width = 128;
    c.height = 128;
    const ctx = c.getContext('2d');
    const rng = new RNG(3);
    for (let i = 0; i < 46; i++) {
      const x = rng.float(8, 120);
      const h = rng.float(50, 124);
      ctx.strokeStyle = `hsl(${rng.float(70, 100)},${rng.float(30, 55)}%,${rng.float(25, 50)}%)`;
      ctx.lineWidth = rng.float(1.5, 3.5);
      ctx.beginPath();
      ctx.moveTo(x, 128);
      ctx.quadraticCurveTo(x + rng.float(-10, 10), 128 - h * 0.6, x + rng.float(-22, 22), 128 - h);
      ctx.stroke();
    }
    for (let i = 0; i < 5; i++) {
      ctx.fillStyle = rng.pick(['#f3e9a0', '#fff', '#e7a8d8', '#f6d24a']);
      ctx.beginPath();
      ctx.arc(rng.float(10, 118), rng.float(30, 80), 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const planes = [];
    for (let k = 0; k < 3; k++) {
      const p = new THREE.PlaneGeometry(1.1, 0.55);
      p.translate(0, 0.27, 0);
      p.rotateY((k / 3) * Math.PI);
      const nr = p.attributes.normal;
      for (let i = 0; i < nr.count; i++) nr.setXYZ(i, 0, 1, 0);
      planes.push(p);
    }
    const geo = merge(planes);
    this.mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
    addWind(this.mat, uniforms, 0.35);
    this.mesh = new THREE.InstancedMesh(geo, this.mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.receiveShadow = true;
    this.mesh.count = n;
    scene.add(this.mesh);
    this.keys = new Int32Array(n * 2).fill(-999999);
    this.m = new THREE.Matrix4();
    this.q = new THREE.Quaternion();
    this.col = new THREE.Color();
    this.hidden = new THREE.Matrix4().makeScale(0, 0, 0);
  }

  update(pos) {
    if (!this.N) return;
    const N = this.N;
    const cs = this.cs;
    const I0 = Math.floor(pos.x / cs) - (N >> 1);
    const J0 = Math.floor(pos.z / cs) - (N >> 1);
    let changed = 0;
    outer: for (let J = J0; J < J0 + N; J++)
      for (let I = I0; I < I0 + N; I++) {
        const si = ((I % N) + N) % N;
        const sj = ((J % N) + N) % N;
        const slot = sj * N + si;
        if (this.keys[slot * 2] === I && this.keys[slot * 2 + 1] === J) continue;
        this.keys[slot * 2] = I;
        this.keys[slot * 2 + 1] = J;
        changed++;
        this.place(slot, I, J);
        if (changed > 900) break outer;
      }
    if (changed) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    }
  }

  place(slot, I, J) {
    const g = this.gen;
    const r1 = hash2(I, J, 31);
    const r2 = hash2(I, J, 32);
    const x = (I + r1) * this.cs;
    const z = (J + r2) * this.cs;
    const ci = g.weights(x, z);
    const dens = ci === 3 ? 0.12 : ci === 4 ? 0.55 : 0.85;
    let ok = hash2(I, J, 33) < dens;
    let h = 0;
    if (ok) {
      const q = g.roadQuery(x, z, 10);
      if (q && q.dist < q.hw + 1.8) ok = false;
    }
    if (ok && g.cityAt(x, z, -20)) ok = false;
    if (ok) {
      h = g.height(x, z);
      if (h < g.waterLevel(x, z) + 2.2 || h > COUNTRIES[ci].snowLine - 50) ok = false;
      else {
        const e = 1.5;
        const sl = Math.abs(g.height(x + e, z) - h) / e;
        if (sl > 0.6) ok = false;
      }
    }
    if (!ok) {
      this.mesh.setMatrixAt(slot, this.hidden);
      return;
    }
    const C = COUNTRIES[ci];
    const s = 0.7 + hash2(I, J, 34) * 0.8;
    this.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), r1 * 6.28);
    this.m.compose(new THREE.Vector3(x, h - 0.05, z), this.q, new THREE.Vector3(s, s * (0.8 + r2 * 0.5), s));
    this.mesh.setMatrixAt(slot, this.m);
    const k = 1.9;
    this.col.setRGB(clamp(C.grass[0] * k, 0, 2), clamp(C.grass[1] * k, 0, 2), clamp(C.grass[2] * k, 0, 2));
    this.mesh.setColorAt(slot, this.col);
  }
}

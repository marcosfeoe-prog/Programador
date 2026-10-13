// Floresta instanciada em blocos (com LOD), balanço ao vento e estados de dano
// das árvores (galhos quebrados, inclinadas, arrancadas, partidas, descascadas).
import * as THREE from 'three';
import { RNG, smoothstep, clamp } from '../util/math.js';
import { mergeColored } from './parts.js';
import { distToRoad } from './terrain.js';



function jitterGeo(g, amt, rng) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    if (y < 0.05) continue;
    p.setXYZ(i, p.getX(i) + rng.float(-amt, amt), y + rng.float(-amt, amt) * 0.6, p.getZ(i) + rng.float(-amt, amt));
  }
  g.computeVertexNormals();
  return g;
}

const BARK_UV = [0, 0, 0.5, 1];
const LEAF_UV = [0.5, 0, 0.5, 1];

function coniferGeo(rng, lod) {
  const items = [];
  const trunkC = new THREE.Color(0.42, 0.33, 0.25);
  const t = new THREE.CylinderGeometry(0.011, 0.024, 0.42, lod ? 4 : 6, 1, true);
  t.translate(0, 0.21, 0);
  items.push({ geo: t, color: trunkC, uvr: BARK_UV });
  const layers = lod ? 1 : 4;
  for (let k = 0; k < layers; k++) {
    const rad = lod ? 0.2 : 0.21 - k * 0.04;
    const h = lod ? 0.88 : 0.36 - k * 0.025;
    const c = new THREE.ConeGeometry(rad, h, lod ? 6 : 9, lod ? 1 : 2, false);
    const y0 = lod ? 0.12 + h / 2 : 0.16 + k * 0.19 + h / 2;
    c.translate(0, y0, 0);
    if (!lod) jitterGeo(c, 0.018, rng);
    const shade = 0.75 + k * 0.08;
    items.push({ geo: c, color: new THREE.Color(0.16 * shade, 0.27 * shade, 0.13 * shade), uvr: LEAF_UV });
  }
  return mergeColored(items);
}

function deciduousGeo(rng, lod) {
  const items = [];
  const trunkC = new THREE.Color(0.38, 0.31, 0.24);
  const t = new THREE.CylinderGeometry(0.022, 0.04, 0.5, lod ? 4 : 7, 1, true);
  t.translate(0, 0.25, 0);
  items.push({ geo: t, color: trunkC, uvr: BARK_UV });
  if (!lod) {
    for (let b = 0; b < 3; b++) {
      const br = new THREE.CylinderGeometry(0.008, 0.016, 0.26, 5, 1, true);
      br.translate(0, 0.13, 0);
      br.rotateZ(0.7);
      br.rotateY((b / 3) * Math.PI * 2 + rng.float(-0.4, 0.4));
      br.translate(0, 0.38, 0);
      items.push({ geo: br, color: trunkC, uvr: BARK_UV });
    }
  }
  const blobs = lod
    ? [[0, 0.66, 0, 0.3]]
    : [
        [0, 0.72, 0, 0.24],
        [0.14, 0.6, 0.05, 0.19],
        [-0.13, 0.62, -0.06, 0.2],
        [0.04, 0.58, -0.15, 0.18],
        [-0.05, 0.6, 0.15, 0.18],
        [0.02, 0.86, 0.02, 0.16],
      ];
  for (const [x, y, z, r] of blobs) {
    const s = new THREE.IcosahedronGeometry(r, lod ? 0 : 1);
    if (!lod) jitterGeo(s, r * 0.18, rng);
    s.scale(1, 0.82, 1);
    s.translate(x, y, z);
    const shade = 0.8 + y * 0.3;
    items.push({ geo: s, color: new THREE.Color(0.2 * shade, 0.32 * shade, 0.12 * shade), uvr: LEAF_UV });
  }
  return mergeColored(items);
}

function bareGeo(type) {
  const c = new THREE.Color(0.55, 0.5, 0.44);
  const items = [];
  const t = new THREE.CylinderGeometry(0.014, type === 0 ? 0.024 : 0.04, type === 0 ? 0.8 : 0.6, 6, 1, true);
  t.translate(0, type === 0 ? 0.4 : 0.3, 0);
  items.push({ geo: t, color: c, uvr: BARK_UV });
  for (let b = 0; b < 3; b++) {
    const br = new THREE.CylinderGeometry(0.004, 0.012, 0.09, 4, 1, true);
    br.translate(0, 0.045, 0);
    br.rotateZ(0.9);
    br.rotateY((b / 3) * Math.PI * 2);
    br.translate(0, 0.35 + b * 0.08, 0);
    items.push({ geo: br, color: c, uvr: BARK_UV });
  }
  return mergeColored(items);
}

function stumpGeo() {
  const t = new THREE.CylinderGeometry(0.028, 0.04, 0.2, 7, 1, false);
  t.translate(0, 0.1, 0);
  return mergeColored([{ geo: t, color: new THREE.Color(0.4, 0.33, 0.26), uvr: BARK_UV }]);
}

function makeTreeMaterial(T, windU) {
  const mat = new THREE.MeshStandardMaterial({ map: T.treeAtlas, vertexColors: true, roughness: 0.88 });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windU.uTime;
    shader.uniforms.uWind = windU.uWind;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;\nuniform vec3 uWind;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
#ifdef USE_INSTANCING
  vec3 ip = instanceMatrix[3].xyz;
  mat3 swIm = mat3(instanceMatrix);
  vec3 lw = transpose(swIm) * vec3(uWind.x, 0.0, uWind.y);
  vec2 ld = normalize(lw.xz + 1e-5);
#else
  vec3 ip = vec3(0.0);
  vec2 ld = uWind.xy;
#endif
  float hgt = max(transformed.y, 0.0);
  float gust = 0.65 + 0.35 * sin(uTime * 1.3 + ip.x * 0.021 + ip.z * 0.017);
  float sw = uWind.z * hgt * hgt * gust;
  transformed.xz += ld * sw * 0.07 + vec2(sin(uTime * 2.7 + ip.z * 0.3), cos(uTime * 2.3 + ip.x * 0.3)) * sw * 0.012 * (0.5 + uWind.z);
`,
      );
  };
  mat.customProgramCacheKey = () => 'tree-sway';
  return mat;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
const _e = new THREE.Euler();
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const _up = new THREE.Vector3(0, 1, 0);

export class Forest {
  constructor(scene, terrain, T, quality, extraTrees) {
    this.scene = scene;
    this.terrain = terrain;
    this.quality = quality;
    this.windU = { uTime: { value: 0 }, uWind: { value: new THREE.Vector3(1, 0, 0.1) } };
    const rng = new RNG(555);
    this.material = makeTreeMaterial(T, this.windU);
    this.geos = {
      near: [coniferGeo(rng, false), deciduousGeo(rng, false)],
      far: [coniferGeo(rng, true), deciduousGeo(rng, true)],
      bare: [bareGeo(0), bareGeo(1)],
      stump: stumpGeo(),
    };
    this.generate(extraTrees, rng);
    this.buildChunks();
    this.buildDynamicPools();
  }

  generate(extra, rng) {
    const t = this.terrain;
    const target = this.quality.trees;
    const spacing = 11;
    const R = 3500;
    const cand = [];
    let W = 0;
    for (let x = -R; x < R; x += spacing) {
      for (let z = -R; z < R; z += spacing) {
        const px = x + rng.float(0, spacing);
        const pz = z + rng.float(0, spacing);
        const r = Math.hypot(px, pz);
        if (r > R) continue;
        let d = t.forestDensity(px, pz);
        // árvores esparsas nas planícies (fora de ruas, plantações e cidade)
        if (d < 0.05 && r > 430 && r < 1100 && distToRoad(px, pz) > 14 && !t.fieldAt(px, pz)) {
          if (!(Math.abs(px) < 420 && Math.abs(pz) < 290)) d = 0.05;
        }
        if (d <= 0.01) continue;
        const w = d * (1.5 - smoothstep(1050, 3000, r) * 1.2);
        cand.push(px, pz, w);
        W += w;
      }
    }
    const k = Math.min(1, target / Math.max(W, 1));
    const xs = [];
    for (let i = 0; i < cand.length; i += 3) {
      if (rng.next() < cand[i + 2] * k) xs.push(cand[i], cand[i + 1], 0);
    }
    for (const e of extra) xs.push(e.x, e.z, 1);
    const N = xs.length / 3;
    this.count = N;
    this.x = new Float32Array(N);
    this.z = new Float32Array(N);
    this.y = new Float32Array(N);
    this.h = new Float32Array(N);
    this.yaw = new Float32Array(N);
    this.type = new Uint8Array(N);
    this.state = new Uint8Array(N);
    this.thr = new Float32Array(N);
    this.chunk = new Int32Array(N);
    this.slot = new Int32Array(N);
    this.dyn = new Array(N).fill(null);
    this.lean = new Float32Array(N);
    this.leanDir = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      const x = xs[i * 3];
      const z = xs[i * 3 + 1];
      const town = xs[i * 3 + 2] === 1;
      const y = t.heightAt(x, z);
      this.x[i] = x;
      this.z[i] = z;
      this.y[i] = y - 0.3;
      const conif = town ? rng.chance(0.15) : rng.next() < clamp(0.25 + smoothstep(80, 420, y) * 0.65, 0, 0.92);
      this.type[i] = conif ? 0 : 1;
      this.h[i] = town ? rng.float(8, 14) : conif ? rng.float(14, 27) : rng.float(10, 19);
      this.yaw[i] = rng.float(0, Math.PI * 2);
      this.thr[i] = rng.float(0.88, 1.14);
    }
    // grade espacial
    this.cell = 40;
    this.grid = new Map();
    for (let i = 0; i < N; i++) {
      const key = Math.floor(this.x[i] / this.cell) * 100000 + Math.floor(this.z[i] / this.cell);
      let a = this.grid.get(key);
      if (!a) this.grid.set(key, (a = []));
      a.push(i);
    }
  }

  treeMatrix(i, out, lean = 0, leanDir = 0) {
    _p.set(this.x[i], this.y[i], this.z[i]);
    if (lean > 0) {
      const ax = new THREE.Vector3(Math.cos(leanDir), 0, Math.sin(leanDir)).cross(_up).normalize().negate();
      _q.setFromAxisAngle(ax, lean);
      const q2 = new THREE.Quaternion().setFromAxisAngle(_up, this.yaw[i]);
      _q.multiply(q2);
    } else _q.setFromAxisAngle(_up, this.yaw[i]);
    const s = this.h[i];
    _s.set(s, s, s);
    return out.compose(_p, _q, _s);
  }

  buildChunks() {
    const CHUNK = (this.CHUNK = this.quality.trees <= 10000 ? 800 : this.quality.trees <= 22000 ? 640 : 560);
    const half = this.terrain.half;
    const nC = Math.ceil(this.terrain.size / CHUNK);
    this.nC = nC;
    const lists = new Map();
    for (let i = 0; i < this.count; i++) {
      const cx = Math.floor((this.x[i] + half) / CHUNK);
      const cz = Math.floor((this.z[i] + half) / CHUNK);
      const key = cz * nC + cx;
      let l = lists.get(key);
      if (!l) lists.set(key, (l = [[], []]));
      l[this.type[i]].push(i);
    }
    this.chunks = [];
    const tint = new THREE.Color();
    const rng = new RNG(99);
    for (const [key, l] of lists) {
      const cx = key % nC;
      const cz = Math.floor(key / nC);
      const center = new THREE.Vector3(-half + (cx + 0.5) * CHUNK, 0, -half + (cz + 0.5) * CHUNK);
      center.y = this.terrain.heightAt(center.x, center.z);
      const ch = { center, near: [], far: [] };
      for (let type = 0; type < 2; type++) {
        const ids = l[type];
        if (!ids.length) continue;
        const near = new THREE.InstancedMesh(this.geos.near[type], this.material, ids.length);
        const far = new THREE.InstancedMesh(this.geos.far[type], this.material, ids.length);
        ids.forEach((i, s) => {
          this.treeMatrix(i, _m);
          near.setMatrixAt(s, _m);
          far.setMatrixAt(s, _m);
          const v = rng.float(0.8, 1.15);
          tint.setRGB(v * rng.float(0.9, 1.12), v, v * rng.float(0.85, 1.05));
          near.setColorAt(s, tint);
          far.setColorAt(s, tint);
          this.chunk[i] = this.chunks.length;
          this.slot[i] = s;
        });
        near.castShadow = this.quality.shadows;
        near.receiveShadow = true;
        far.receiveShadow = false;
        near.computeBoundingSphere();
        far.computeBoundingSphere();
        this.scene.add(near);
        this.scene.add(far);
        ch.near[type] = near;
        ch.far[type] = far;
      }
      // um chunk = índice; árvores dos dois tipos compartilham o índice do chunk
      this.chunks.push(ch);
    }
  }

  buildDynamicPools() {
    const cap = Math.min(2500, Math.max(600, Math.floor(this.quality.trees * 0.12)));
    const mk = (geo, n) => {
      const m = new THREE.InstancedMesh(geo, this.material, n);
      m.count = 0;
      m.castShadow = this.quality.shadows;
      m.receiveShadow = true;
      m.frustumCulled = false;
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.setColorAt(0, new THREE.Color(1, 1, 1));
      this.scene.add(m);
      return { mesh: m, used: 0, cap: n, free: [], dirty: false };
    };
    this.dpool = {
      fallen0: mk(this.geos.near[0], cap),
      fallen1: mk(this.geos.near[1], cap),
      bare0: mk(this.geos.bare[0], cap),
      bare1: mk(this.geos.bare[1], cap),
      stump: mk(this.geos.stump, cap * 2),
    };
  }

  dynAdd(name, matrix, color) {
    const p = this.dpool[name];
    let idx;
    if (p.free.length) idx = p.free.pop();
    else {
      if (p.used >= p.cap) return null;
      idx = p.used++;
      p.mesh.count = p.used;
    }
    p.mesh.setMatrixAt(idx, matrix);
    p.mesh.setColorAt(idx, color || new THREE.Color(1, 1, 1));
    p.mesh.instanceColor.needsUpdate = true;
    p.dirty = true;
    return { name, idx };
  }

  dynSet(h, matrix) {
    const p = this.dpool[h.name];
    p.mesh.setMatrixAt(h.idx, matrix);
    p.dirty = true;
  }

  dynRemove(h) {
    const p = this.dpool[h.name];
    p.mesh.setMatrixAt(h.idx, ZERO);
    p.free.push(h.idx);
    p.dirty = true;
  }

  hideStatic(i) {
    const ch = this.chunks[this.chunk[i]];
    const t = this.type[i];
    ch.near[t].setMatrixAt(this.slot[i], ZERO);
    ch.far[t].setMatrixAt(this.slot[i], ZERO);
    ch.near[t].instanceMatrix.needsUpdate = true;
    ch.far[t].instanceMatrix.needsUpdate = true;
  }

  setStaticLean(i, lean, dir) {
    const ch = this.chunks[this.chunk[i]];
    const t = this.type[i];
    this.treeMatrix(i, _m, lean, dir);
    ch.near[t].setMatrixAt(this.slot[i], _m);
    ch.far[t].setMatrixAt(this.slot[i], _m);
    ch.near[t].instanceMatrix.needsUpdate = true;
    ch.far[t].instanceMatrix.needsUpdate = true;
  }

  // Árvores perto de um ponto (para o sistema de danos).
  query(x, z, radius, cb) {
    const c = this.cell;
    const x0 = Math.floor((x - radius) / c);
    const x1 = Math.floor((x + radius) / c);
    const z0 = Math.floor((z - radius) / c);
    const z1 = Math.floor((z + radius) / c);
    const r2 = radius * radius;
    for (let gx = x0; gx <= x1; gx++) {
      for (let gz = z0; gz <= z1; gz++) {
        const a = this.grid.get(gx * 100000 + gz);
        if (!a) continue;
        for (const i of a) {
          const dx = this.x[i] - x;
          const dz = this.z[i] - z;
          if (dx * dx + dz * dz <= r2) cb(i);
        }
      }
    }
  }

  // Inicia a queda de uma árvore (arrancada ou partida).
  fell(i, dirAngle, snapped) {
    if (this.dyn[i]) return;
    this.hideStatic(i);
    const t = this.type[i];
    const info = { i, angle: 0, vel: 0, dir: dirAngle, snapped, h: this.h[i], handle: null, stump: null, bare: false, done: false };
    const scale = snapped ? 0.78 : 1.0;
    info.scale = scale;
    info.baseY = this.y[i] + (snapped ? this.h[i] * 0.2 : 0);
    if (snapped) {
      this.treeMatrix(i, _m);
      info.stump = this.dynAdd('stump', _m);
    }
    this.composeFallen(info, _m);
    info.handle = this.dynAdd(t === 0 ? 'fallen0' : 'fallen1', _m);
    if (!info.handle) return;
    this.dyn[i] = info;
    this.falling = this.falling || [];
    this.falling.push(info);
  }

  composeFallen(info, out) {
    const i = info.i;
    const ax = new THREE.Vector3(Math.cos(info.dir), 0, Math.sin(info.dir)).cross(_up).normalize().negate();
    _q.setFromAxisAngle(ax, info.angle);
    const q2 = new THREE.Quaternion().setFromAxisAngle(_up, this.yaw[i]);
    _q.multiply(q2);
    _p.set(this.x[i], info.baseY, this.z[i]);
    const s = this.h[i] * info.scale;
    _s.set(s, s, s);
    return out.compose(_p, _q, _s);
  }

  debark(i) {
    const t = this.type[i];
    const info = this.dyn[i];
    const c = new THREE.Color(0.95, 0.92, 0.88);
    if (info) {
      if (info.bare) return;
      this.dynRemove(info.handle);
      this.composeFallen(info, _m);
      info.handle = this.dynAdd(t === 0 ? 'bare0' : 'bare1', _m, c);
      info.bare = true;
    } else {
      this.hideStatic(i);
      this.treeMatrix(i, _m, this.lean[i], this.leanDir[i]);
      const h = this.dynAdd(t === 0 ? 'bare0' : 'bare1', _m, c);
      this.dyn[i] = { i, standingBare: true, handle: h, bare: true, done: true };
    }
  }

  // Remove a árvore (foi levada pelo vento como destroço).
  removeTree(i) {
    const info = this.dyn[i];
    if (info) {
      if (info.handle) this.dynRemove(info.handle);
      info.handle = null;
      info.done = true;
      info.gone = true;
    } else {
      this.hideStatic(i);
      this.dyn[i] = { i, gone: true, done: true };
    }
  }

  update(dt, camPos, time, wind) {
    this.windU.uTime.value = time;
    this.windU.uWind.value.copy(wind);
    // LOD por chunk
    for (const ch of this.chunks) {
      const d = Math.hypot(ch.center.x - camPos.x, ch.center.z - camPos.z);
      const near = d < this.CHUNK * 0.75 + 380;
      for (let t = 0; t < 2; t++) {
        if (!ch.near[t]) continue;
        ch.near[t].visible = near;
        ch.far[t].visible = !near;
      }
    }
    // Animação de queda (gravidade angular simples)
    if (this.falling && this.falling.length) {
      for (let k = this.falling.length - 1; k >= 0; k--) {
        const f = this.falling[k];
        if (f.gone) {
          this.falling.splice(k, 1);
          continue;
        }
        const g = 9.81 / Math.max(f.h * 0.5, 1);
        f.vel += g * Math.sin(Math.max(f.angle, 0.05)) * dt * 1.5;
        f.angle += f.vel * dt;
        const maxA = Math.PI / 2 - 0.06;
        if (f.angle >= maxA) {
          f.angle = maxA;
          f.done = true;
          this.falling.splice(k, 1);
        }
        if (f.handle) {
          this.composeFallen(f, _m);
          this.dynSet(f.handle, _m);
        }
      }
    }
    for (const k in this.dpool) {
      const p = this.dpool[k];
      if (p.dirty) {
        p.mesh.instanceMatrix.needsUpdate = true;
        p.dirty = false;
      }
    }
  }
}

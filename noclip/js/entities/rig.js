// Esqueleto procedural, IK de dois ossos e utilidades de pose.
import * as THREE from 'three';
import { hash1 } from '../util.js';

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _c = new THREE.Vector3(), _d = new THREE.Vector3();
const _q = new THREE.Quaternion(), _wq = new THREE.Quaternion(), _pq = new THREE.Quaternion();
const _u = new THREE.Vector3(), _n = new THREE.Vector3(), _t = new THREE.Vector3();

// defs: [{ name, parent (nome ou null), pos: [x,y,z] em espaço do modelo }]
export function makeRig(defs) {
  const bones = [], by = {};
  defs.forEach((d, i) => {
    const b = new THREE.Bone();
    b.name = d.name;
    b.userData.model = new THREE.Vector3(...d.pos);
    bones.push(b);
    by[d.name] = b;
    b.userData.index = i;
  });
  defs.forEach((d) => {
    const b = by[d.name];
    if (d.parent) {
      const p = by[d.parent];
      p.add(b);
      b.position.copy(b.userData.model).sub(p.userData.model);
    } else b.position.copy(b.userData.model);
  });
  const rest = bones.map((b) => ({ p: b.position.clone(), q: b.quaternion.clone() }));
  const skeleton = new THREE.Skeleton(bones);
  return { bones, by, rest, skeleton, root: bones[0], index: (n) => by[n].userData.index };
}

export function resetPose(rig) {
  rig.bones.forEach((b, i) => {
    b.position.copy(rig.rest[i].p);
    b.quaternion.copy(rig.rest[i].q);
  });
}

// gira o osso para que o ponto "child" (mundo) aponte para "target" (mundo)
export function aim(bone, from, child, target) {
  _u.subVectors(child, from).normalize();
  _t.subVectors(target, from).normalize();
  if (_u.lengthSq() < 1e-8 || _t.lengthSq() < 1e-8) return;
  _q.setFromUnitVectors(_u, _t);
  bone.getWorldQuaternion(_wq);
  _wq.premultiply(_q);
  bone.parent.getWorldQuaternion(_pq).invert();
  bone.quaternion.copy(_pq.multiply(_wq));
  bone.updateMatrixWorld(true);
}

// IK analítico de dois ossos: a (raiz), b (meio), c (ponta) até target, dobrando para o pole
export function ik2(a, b, c, target, pole) {
  const pa = a.getWorldPosition(_a), pb = b.getWorldPosition(_b), pc = c.getWorldPosition(_c);
  const l1 = pa.distanceTo(pb), l2 = pb.distanceTo(pc);
  const to = _d.subVectors(target, pa);
  let d = to.length();
  if (d < 1e-5) return;
  const u = to.divideScalar(d);
  d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-3), l1 + l2 - 1e-3);
  _n.subVectors(pole, pa);
  _n.addScaledVector(u, -_n.dot(u));
  if (_n.lengthSq() < 1e-8) _n.set(0, 1, 0);
  _n.normalize();
  const cosA = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d);
  const sinA = Math.sqrt(Math.max(0, 1 - cosA * cosA));
  const bd = new THREE.Vector3().copy(pa).addScaledVector(u, l1 * cosA).addScaledVector(_n, l1 * sinA);
  const cd = new THREE.Vector3().copy(pa).addScaledVector(u, d);
  aim(a, pa, pb, bd);
  const pb2 = b.getWorldPosition(new THREE.Vector3());
  const pc2 = c.getWorldPosition(new THREE.Vector3());
  aim(b, pb2, pc2, cd);
}

// Ruído de valor 3D (cores de pele, manchas).
export function noise3(x, y, z, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const h = (a, b, c) => hash1(a * 73856093 + b * 19349663 + c * 83492791 + seed * 2654435761);
  const s = (t) => t * t * (3 - 2 * t);
  const u = s(fx), v = s(fy), w = s(fz);
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(h(ix, iy, iz), h(ix + 1, iy, iz), u), l(h(ix, iy + 1, iz), h(ix + 1, iy + 1, iz), u), v),
    l(l(h(ix, iy, iz + 1), h(ix + 1, iy, iz + 1), u), l(h(ix, iy + 1, iz + 1), h(ix + 1, iy + 1, iz + 1), u), v),
    w
  );
}
export const fbm3 = (x, y, z, seed = 0) => noise3(x, y, z, seed) * 0.55 + noise3(x * 2.1, y * 2.1, z * 2.1, seed + 1) * 0.3 + noise3(x * 4.3, y * 4.3, z * 4.3, seed + 2) * 0.15;

// Cabelo: fios com verlet presos a um osso, desenhados como fitas viradas para a câmera.
export class Hair {
  constructor(bone, roots, { segs = 7, len = 0.38, width = 0.011, color = 0x0b0907, material, headR = 0.11, headC = [0, 0, 0] }) {
    this.bone = bone;
    this.segs = segs;
    this.roots = roots; // [{p:[x,y,z] local do osso, len}]
    this.n = roots.length;
    this.width = width;
    this.headR = headR;
    this.headC = new THREE.Vector3(...headC);
    const N = this.n * (segs + 1);
    this.p = new Float32Array(N * 3);
    this.o = new Float32Array(N * 3);
    this.len = roots.map((r) => (r.len || len) / segs);
    const pos = new Float32Array(N * 2 * 3);
    const nrm = new Float32Array(N * 2 * 3);
    const uv = new Float32Array(N * 2 * 2);
    const idx = [];
    for (let s = 0; s < this.n; s++)
      for (let k = 0; k <= segs; k++) {
        const v = (s * (segs + 1) + k) * 2;
        uv[v * 2] = 0;
        uv[v * 2 + 1] = k / segs;
        uv[v * 2 + 2] = 1;
        uv[v * 2 + 3] = k / segs;
        if (k < segs) idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.geo = g;
    this.mesh = new THREE.Mesh(g, material || new THREE.MeshStandardMaterial({ color, roughness: 0.5, side: THREE.DoubleSide }));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.inited = false;
  }

  reset() {
    this.inited = false;
  }

  update(dt, camPos) {
    const m = this.bone.matrixWorld;
    const segs = this.segs;
    const p = this.p, o = this.o;
    const root = new THREE.Vector3();
    const hc = this.headC.clone().applyMatrix4(m);
    if (!this.inited) {
      for (let s = 0; s < this.n; s++) {
        root.set(...this.roots[s].p).applyMatrix4(m);
        for (let k = 0; k <= segs; k++) {
          const i = (s * (segs + 1) + k) * 3;
          p[i] = o[i] = root.x;
          p[i + 1] = o[i + 1] = root.y - k * this.len[s];
          p[i + 2] = o[i + 2] = root.z;
        }
      }
      this.inited = true;
    }
    const g = -9.8 * dt * dt;
    const R = this.headR;
    for (let s = 0; s < this.n; s++) {
      root.set(...this.roots[s].p).applyMatrix4(m);
      const b = s * (segs + 1) * 3;
      p[b] = o[b] = root.x;
      p[b + 1] = o[b + 1] = root.y;
      p[b + 2] = o[b + 2] = root.z;
      for (let k = 1; k <= segs; k++) {
        const i = b + k * 3;
        const vx = (p[i] - o[i]) * 0.94, vy = (p[i + 1] - o[i + 1]) * 0.94, vz = (p[i + 2] - o[i + 2]) * 0.94;
        o[i] = p[i];
        o[i + 1] = p[i + 1];
        o[i + 2] = p[i + 2];
        p[i] += vx;
        p[i + 1] += vy + g;
        p[i + 2] += vz;
      }
      for (let it = 0; it < 2; it++)
        for (let k = 1; k <= segs; k++) {
          const i = b + k * 3, j = i - 3;
          let dx = p[i] - p[j], dy = p[i + 1] - p[j + 1], dz = p[i + 2] - p[j + 2];
          const d = Math.hypot(dx, dy, dz) || 1e-6;
          const L = this.len[s];
          const f = (d - L) / d;
          if (k === 1) {
            p[i] -= dx * f;
            p[i + 1] -= dy * f;
            p[i + 2] -= dz * f;
          } else {
            p[i] -= dx * f * 0.5;
            p[i + 1] -= dy * f * 0.5;
            p[i + 2] -= dz * f * 0.5;
            p[j] += dx * f * 0.5;
            p[j + 1] += dy * f * 0.5;
            p[j + 2] += dz * f * 0.5;
          }
          // colisão com a cabeça
          dx = p[i] - hc.x;
          dy = p[i + 1] - hc.y;
          dz = p[i + 2] - hc.z;
          const dh = Math.hypot(dx, dy, dz);
          if (dh < R) {
            const k2 = R / (dh || 1e-6);
            p[i] = hc.x + dx * k2;
            p[i + 1] = hc.y + dy * k2;
            p[i + 2] = hc.z + dz * k2;
          }
        }
    }
    // fitas viradas para a câmera
    const pos = this.geo.attributes.position.array, nrm = this.geo.attributes.normal.array;
    for (let s = 0; s < this.n; s++)
      for (let k = 0; k <= segs; k++) {
        const i = (s * (segs + 1) + k) * 3;
        const j = (s * (segs + 1) + Math.min(k + 1, segs)) * 3, jm = (s * (segs + 1) + Math.max(k - 1, 0)) * 3;
        const tx = p[j] - p[jm], ty = p[j + 1] - p[jm + 1], tz = p[j + 2] - p[jm + 2];
        const cx = camPos.x - p[i], cy = camPos.y - p[i + 1], cz = camPos.z - p[i + 2];
        let sx = ty * cz - tz * cy, sy = tz * cx - tx * cz, sz = tx * cy - ty * cx;
        const sl = Math.hypot(sx, sy, sz) || 1;
        const w = (this.width * (1 - (k / segs) * 0.6)) / 2 / sl;
        sx *= w;
        sy *= w;
        sz *= w;
        const v = (s * (segs + 1) + k) * 6;
        pos[v] = p[i] - sx;
        pos[v + 1] = p[i + 1] - sy;
        pos[v + 2] = p[i + 2] - sz;
        pos[v + 3] = p[i] + sx;
        pos[v + 4] = p[i + 1] + sy;
        pos[v + 5] = p[i + 2] + sz;
        const cl = Math.hypot(cx, cy, cz) || 1;
        nrm[v] = nrm[v + 3] = cx / cl;
        nrm[v + 1] = nrm[v + 4] = cy / cl;
        nrm[v + 2] = nrm[v + 5] = cz / cl;
      }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
  }
}

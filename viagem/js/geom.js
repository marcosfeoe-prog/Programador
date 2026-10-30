// Utilidades de geometria: junção de malhas, cores por vértice e formas básicas.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

// aplica posição / rotação (euler, em radianos) / escala
export function xf(geo, px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _q.setFromEuler(_e.set(rx, ry, rz));
  _m.compose(_p.set(px, py, pz), _q, _s.set(sx, sy, sz));
  geo.applyMatrix4(_m);
  return geo;
}

export function paint(geo, color) {
  const c = color instanceof THREE.Color ? color : new THREE.Color(color);
  const n = geo.attributes.position.count;
  const a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    a[i * 3] = c.r;
    a[i * 3 + 1] = c.g;
    a[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

// junta geometrias (com ou sem índice) numa só, com position/normal/uv/color
export function merge(list) {
  list = list.filter(Boolean);
  let nv = 0;
  let ni = 0;
  for (const g of list) {
    nv += g.attributes.position.count;
    ni += g.index ? g.index.count : g.attributes.position.count;
  }
  const pos = new Float32Array(nv * 3);
  const nrm = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2);
  const col = new Float32Array(nv * 3).fill(1);
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0;
  let io = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    if (!g.attributes.normal) g.computeVertexNormals();
    pos.set(g.attributes.position.array.subarray(0, n * 3), vo * 3);
    nrm.set(g.attributes.normal.array.subarray(0, n * 3), vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array.subarray(0, n * 2), vo * 2);
    if (g.attributes.color) col.set(g.attributes.color.array.subarray(0, n * 3), vo * 3);
    if (g.index) {
      const a = g.index.array;
      for (let i = 0; i < a.length; i++) idx[io++] = a[i] + vo;
    } else {
      for (let i = 0; i < n; i++) idx[io++] = i + vo;
    }
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

export const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
export const cyl = (rt, rb, h, seg = 12, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);

// caixa com cantos arredondados (normais suaves)
export function roundBox(w, h, d, r = 0.05, seg = 3) {
  const g = new THREE.BoxGeometry(w, h, d, seg * 2 + 1, seg * 2 + 1, seg * 2 + 1);
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const hw = w / 2 - r;
  const hh = h / 2 - r;
  const hd = d / 2 - r;
  const v = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(Math.max(-hw, Math.min(hw, v.x)), Math.max(-hh, Math.min(hh, v.y)), Math.max(-hd, Math.min(hd, v.z)));
    const dlt = v.clone().sub(c);
    if (dlt.lengthSq() < 1e-12) continue;
    dlt.normalize();
    p.setXYZ(i, c.x + dlt.x * r, c.y + dlt.y * r, c.z + dlt.z * r);
    n.setXYZ(i, dlt.x, dlt.y, dlt.z);
  }
  return g;
}

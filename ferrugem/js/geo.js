// Geometrias com UV em escala de mundo, telhados e o "batcher" que junta peças estáticas
// do cenário em poucas malhas (menos chamadas de desenho = mais FPS).
import * as THREE from 'three';

// Caixa com UV proporcional ao tamanho de cada face (tile = metros por repetição).
export function boxGeo(w, h, d, tile = 2) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [
    [d, h],
    [d, h],
    [w, d],
    [w, d],
    [w, h],
    [w, h],
  ];
  for (let f = 0; f < 6; f++) {
    for (let k = 0; k < 4; k++) {
      const i = f * 4 + k;
      uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile);
    }
  }
  return g;
}

export function cylGeo(rt, rb, h, seg = 10, tile = 2, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  const uv = g.attributes.uv;
  const n = 2 * (seg + 1);
  const circ = Math.PI * (rt + rb);
  for (let i = 0; i < n; i++) uv.setXY(i, (uv.getX(i) * circ) / tile, (uv.getY(i) * h) / tile);
  return g;
}

// Multiplica as coordenadas UV (para discos e geometrias prontas do three.js).
export function scaleUV(g, su, sv = su) {
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv);
  return g;
}

export function planeGeo(w, h, tile = 2) {
  const g = new THREE.PlaneGeometry(w, h);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * w) / tile, (uv.getY(i) * h) / tile);
  return g;
}

// Geometria a partir de triângulos [x,y,z,...] e uv [u,v,...] (normais planas).
export function triGeo(pos, uv) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function quad(P, U, a, b, c, d, ua, ub, uc, ud) {
  P.push(...a, ...b, ...c, ...a, ...c, ...d);
  U.push(...ua, ...ub, ...uc, ...ua, ...uc, ...ud);
}

// Telhado de duas águas: cumeeira ao longo de X, frente em +Z. Base em y = 0.
export function gableRoofGeo(w, d, rh, overhang = 0.45, tile = 2) {
  const hw = w / 2 + overhang,
    hd = d / 2 + overhang;
  const ey = (-overhang * rh) / (d / 2);
  const slope = Math.hypot(hd, rh - ey);
  const P = [],
    U = [];
  const su = (2 * hw) / tile,
    sv = slope / tile;
  quad(P, U, [-hw, ey, hd], [hw, ey, hd], [hw, rh, 0], [-hw, rh, 0], [0, 0], [su, 0], [su, sv], [0, sv]);
  quad(P, U, [hw, ey, -hd], [-hw, ey, -hd], [-hw, rh, 0], [hw, rh, 0], [0, 0], [su, 0], [su, sv], [0, sv]);
  return triGeo(P, U);
}

// Oitões (triângulos das paredes laterais sob o telhado).
export function gableEndsGeo(w, d, rh, tile = 2) {
  const hw = w / 2,
    hd = d / 2;
  const P = [],
    U = [];
  const ud = d / tile,
    uh = rh / tile;
  P.push(hw, 0, hd, hw, 0, -hd, hw, rh, 0);
  U.push(0, 0, ud, 0, ud / 2, uh);
  P.push(-hw, 0, -hd, -hw, 0, hd, -hw, rh, 0);
  U.push(0, 0, ud, 0, ud / 2, uh);
  return triGeo(P, U);
}

export function mergeGeos(list) {
  let n = 0;
  const parts = [];
  for (let g of list) {
    if (g.index) g = g.toNonIndexed();
    parts.push(g);
    n += g.attributes.position.count;
  }
  const pos = new Float32Array(n * 3),
    nor = new Float32Array(n * 3),
    uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of parts) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    if (g.attributes.normal) nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  return out;
}

// Junta as malhas filhas diretas de um grupo que usam o mesmo material (menos chamadas de desenho).
export function mergeByMaterial(group) {
  const byMat = new Map();
  for (const c of group.children) {
    if (!c.isMesh || c.userData.keep || c.isInstancedMesh) continue;
    let arr = byMat.get(c.material);
    if (!arr) byMat.set(c.material, (arr = []));
    arr.push(c);
  }
  for (const [mat, list] of byMat) {
    if (list.length < 2) continue;
    const geos = list.map((m) => {
      m.updateMatrix();
      const g = m.geometry.clone();
      g.applyMatrix4(m.matrix);
      return g;
    });
    const mesh = new THREE.Mesh(mergeGeos(geos), mat);
    for (const g of geos) g.dispose();
    mesh.castShadow = list.some((m) => m.castShadow);
    mesh.receiveShadow = list.some((m) => m.receiveShadow);
    mesh.userData.merged = true;
    for (const m of list) group.remove(m);
    group.add(mesh);
  }
  return group;
}

const _e = new THREE.Euler();
const _q = new THREE.Quaternion();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();
export function mat4(x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  return new THREE.Matrix4().compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
}

export class Batcher {
  constructor() {
    this.groups = new Map();
  }

  add(geo, material, matrix, { cast = true, receive = true, chunk = 0 } = {}) {
    const key = material.uuid + '|' + (cast ? 1 : 0) + (receive ? 1 : 0) + '|' + chunk;
    let gr = this.groups.get(key);
    if (!gr) {
      gr = { material, cast, receive, geos: [] };
      this.groups.set(key, gr);
    }
    const g = geo.clone();
    if (matrix) g.applyMatrix4(matrix);
    gr.geos.push(g);
  }

  // Adiciona uma malha já posicionada (inclui os filhos).
  addObject(obj, opts) {
    obj.updateMatrixWorld(true);
    obj.traverse((o) => {
      if (o.isMesh) this.add(o.geometry, o.material, o.matrixWorld, opts);
    });
  }

  build(parent) {
    const meshes = [];
    for (const gr of this.groups.values()) {
      const m = new THREE.Mesh(mergeGeos(gr.geos), gr.material);
      m.castShadow = gr.cast;
      m.receiveShadow = gr.receive;
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      parent.add(m);
      meshes.push(m);
      for (const g of gr.geos) g.dispose();
    }
    this.groups.clear();
    return meshes;
  }
}

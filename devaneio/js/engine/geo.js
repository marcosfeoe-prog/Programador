// Utilitários de geometria: caixas com UV em escala de mundo, caixas arredondadas,
// junção de geometrias (menos draw calls) e cores por vértice.
import * as THREE from 'three';

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _s = new THREE.Vector3();

// Aplica transformação: posição [x,y,z], rotação [rx,ry,rz] (rad), escala [sx,sy,sz]|n
export function tf(geo, p = [0, 0, 0], r = [0, 0, 0], s = 1) {
  _e.set(r[0], r[1], r[2], 'YXZ');
  _q.setFromEuler(_e);
  if (typeof s === 'number') _s.set(s, s, s);
  else _s.set(s[0], s[1], s[2]);
  _m.compose(_v.set(p[0], p[1], p[2]), _q, _s);
  geo.applyMatrix4(_m);
  return geo;
}

// Projeta UVs em coordenadas de mundo (caixa), divididas por "scale" metros.
export function boxUV(geo, scale = 1) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i)), nz = Math.abs(nor.getZ(i));
    let u, v;
    if (nx >= ny && nx >= nz) {
      u = z;
      v = y;
    } else if (ny >= nx && ny >= nz) {
      u = x;
      v = z;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = u / scale;
    uv[i * 2 + 1] = v / scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}

export function box(w, h, d, uvScale = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (uvScale) boxUV(g, uvScale);
  return g;
}

// Caixa com cantos arredondados (adaptado da ideia do RoundedBoxGeometry do three.js).
export function roundBox(w, h, d, radius = 0.05, segments = 2, uvScale = 1) {
  const seg = segments * 2 + 1;
  radius = Math.min(w / 2, h / 2, d / 2, radius);
  const base = new THREE.BoxGeometry(1, 1, 1, seg, seg, seg).toNonIndexed();
  const pos = base.attributes.position.array;
  const nor = base.attributes.normal.array;
  const half = 0.5 / seg;
  const bx = w / 2 - radius, by = h / 2 - radius, bz = d / 2 - radius;
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.length; i += 3) {
    const px = pos[i], py = pos[i + 1], pz = pos[i + 2];
    n.set(px - Math.sign(px) * half, py - Math.sign(py) * half, pz - Math.sign(pz) * half).normalize();
    pos[i] = bx * Math.sign(px) + n.x * radius;
    pos[i + 1] = by * Math.sign(py) + n.y * radius;
    pos[i + 2] = bz * Math.sign(pz) + n.z * radius;
    nor[i] = n.x;
    nor[i + 1] = n.y;
    nor[i + 2] = n.z;
  }
  base.attributes.position.needsUpdate = true;
  boxUV(base, uvScale);
  return base;
}

// Junta várias geometrias (convertidas para não indexadas) numa só.
export function merge(geos) {
  const list = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let count = 0;
  let hasColor = false;
  for (const g of list) {
    count += g.attributes.position.count;
    if (g.attributes.color) hasColor = true;
  }
  const pos = new Float32Array(count * 3);
  const nor = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const col = hasColor ? new Float32Array(count * 3) : null;
  let o = 0;
  for (const g of list) {
    const c = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3);
    if (!g.attributes.normal) g.computeVertexNormals();
    nor.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    if (col) {
      if (g.attributes.color && g.attributes.color.itemSize === 3) col.set(g.attributes.color.array, o * 3);
      else col.fill(1, o * 3, (o + c) * 3);
    }
    o += c;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  out.computeBoundingSphere();
  out.computeBoundingBox();
  for (const g of list) g.dispose();
  return out;
}

// Pinta a geometria inteira com uma cor (atributo de cor por vértice, em espaço linear).
export function paint(geo, color, jitter = 0, rand = Math.random) {
  const c = new THREE.Color(color);
  if (jitter) c.offsetHSL(0, 0, (rand() - 0.5) * jitter);
  const n = geo.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

// Cilindro afinando com UV escaladas.
export function cylinder(rt, rb, h, seg = 12, uvScale = 1, open = false) {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
  const uv = g.attributes.uv;
  const circ = Math.PI * (rt + rb);
  for (let i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) * circ) / uvScale, (uv.getY(i) * h) / uvScale);
  return g;
}

// Tubo ao longo de pontos (braços de poste, fios, mangueiras)
export function tube(points, radius = 0.05, seg = 24, radial = 8) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(p[0], p[1], p[2])));
  return new THREE.TubeGeometry(curve, seg, radius, radial, false);
}

// Fio pendurado (catenária aproximada por parábola) entre dois pontos
export function wire(a, b, sag = 0.6, radius = 0.012, seg = 24) {
  const pts = [];
  for (let i = 0; i <= seg; i++) {
    const t = i / seg;
    pts.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t - sag * 4 * t * (1 - t), a[2] + (b[2] - a[2]) * t]);
  }
  return tube(pts, radius, seg, 4);
}

// Superfície de revolução a partir de um perfil [[raio, altura], ...]
export function lathe(profile, seg = 24) {
  return new THREE.LatheGeometry(
    profile.map((p) => new THREE.Vector2(p[0], p[1])),
    seg
  );
}

// Plano horizontal com UV em metros
export function ground(w, d, uvScale = 1, segX = 1, segZ = 1) {
  const g = new THREE.PlaneGeometry(w, d, segX, segZ);
  g.rotateX(-Math.PI / 2);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, pos.getX(i) / uvScale, -pos.getZ(i) / uvScale);
  return g;
}

// Personagens 3D no estilo anime, montados com primitivas: esqueleto de
// grupos (quadril → coluna → peito → pescoço → cabeça, ombros/cotovelos/mãos,
// quadris/joelhos/tornozelos), roupas (gakuran, chōran do delinquente,
// uniforme de marinheiro, terno), cabelos com mechas e rosto desenhado.
import * as THREE from 'three';
import { toon, flat, mesh, mergeGeos, alignMatrix } from './toon.js';
import { FaceRig, FACE_W, FACE_CY } from './face.js';
import { DEG, hash, clamp } from './util.js';

const HEAD_R = 0.12;
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();

// ------------------------------------------------------------ geometrias
function headShape(v) {
  const ny = v.y / HEAD_R;
  if (ny < 0) {
    const k = Math.pow(-ny, 1.5);
    v.x *= 1 - 0.36 * k;
    v.z *= 1 - 0.08 * k;
    v.y *= 1 + 0.2 * k;
    v.z += 0.012 * k;
  }
  v.x *= 0.93;
  if (v.z < 0) v.z *= 1.05;
}

function deform(geo, fn) {
  const p = geo.attributes.position;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    fn(v);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  geo.computeVertexNormals();
  return geo;
}

let HEAD_GEO;
let FACE_GEO;
function headGeo() {
  if (!HEAD_GEO) HEAD_GEO = deform(new THREE.SphereGeometry(HEAD_R, 32, 24), headShape);
  return HEAD_GEO;
}
// Recorte frontal da cabeça, um pouco para fora, com UV planar (de frente).
function faceGeo() {
  if (FACE_GEO) return FACE_GEO;
  const g = new THREE.SphereGeometry(HEAD_R, 40, 30, Math.PI / 2 - 1.3, 2.6, 0.22 * Math.PI, 0.72 * Math.PI);
  deform(g, headShape);
  const p = g.attributes.position;
  const n = g.attributes.normal;
  const uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i) + n.getX(i) * 0.0009;
    const y = p.getY(i) + n.getY(i) * 0.0009;
    const z = p.getZ(i) + n.getZ(i) * 0.0009;
    p.setXYZ(i, x, y, z);
    uv.setXY(i, 0.5 + x / (2 * FACE_W), 0.5 + (y - FACE_CY) / (2 * FACE_W));
  }
  FACE_GEO = g;
  return g;
}

const GEO = new Map();
function cyl(rt, rb, h, seg = 12, open = false, ts = 0, tl = Math.PI * 2) {
  const key = `c${rt}|${rb}|${h}|${seg}|${open}|${ts}|${tl}`;
  if (!GEO.has(key)) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg, 1, open, ts, tl);
    GEO.set(key, g);
  }
  return GEO.get(key);
}
function sph(r, ws = 14, hs = 10) {
  const key = `s${r}|${ws}|${hs}`;
  if (!GEO.has(key)) GEO.set(key, new THREE.SphereGeometry(r, ws, hs));
  return GEO.get(key);
}
function boxG(w, h, d) {
  const key = `b${w}|${h}|${d}`;
  if (!GEO.has(key)) GEO.set(key, new THREE.BoxGeometry(w, h, d));
  return GEO.get(key);
}
let SHOE_GEO;
function shoeGeo() {
  if (!SHOE_GEO) {
    SHOE_GEO = new THREE.CapsuleGeometry(0.042, 0.13, 4, 10);
    SHOE_GEO.rotateX(Math.PI / 2);
    SHOE_GEO.scale(1, 0.72, 1);
  }
  return SHOE_GEO;
}

// Saia pregueada: cilindro aberto com raio alternado.
const SKIRT = new Map();
function skirtGeo(rt, rb, h) {
  const key = `${rt}|${rb}|${h}`;
  if (SKIRT.has(key)) return SKIRT.get(key);
  const seg = 24;
  const g = new THREE.CylinderGeometry(rt, rb, h, seg, 2, true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const y = p.getY(i);
    const a = Math.atan2(x, z);
    const idx = Math.round(((a + Math.PI) / (Math.PI * 2)) * seg);
    const k = 1 + (idx % 2 ? 0.06 : -0.02) * ((h / 2 - y) / h);
    p.setXYZ(i, x * k, y, z * k);
  }
  g.computeVertexNormals();
  SKIRT.set(key, g);
  return g;
}

// Direção a partir de elevação (0 = horizontal, 90 = para cima) e azimute
// (0 = frente +Z, 90 = esquerda do personagem +X, 180 = trás).
function dir(el, az) {
  el *= DEG;
  az *= DEG;
  return new THREE.Vector3(Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az));
}

// ------------------------------------------------------------ cabelos
const CAP_C = new THREE.Vector3(0, 0.022, -0.014);
const CAP_R = HEAD_R * 1.065;

function capGeo(theta = 0.62, r = CAP_R, c = CAP_C) {
  const g = new THREE.SphereGeometry(r, 26, 16, 0, Math.PI * 2, 0, theta * Math.PI);
  g.translate(c.x, c.y, c.z);
  g.scale(0.94, 1, 1);
  return g;
}

// Mecha cônica com a base num ponto da calota apontando para d.
function lock(list, el, az, d, len, rad, seg = 5, flat = 1) {
  const base = dir(el, az).multiplyScalar(CAP_R * 0.92).add(CAP_C);
  base.x *= 0.94;
  const g = new THREE.ConeGeometry(rad, len, seg);
  g.translate(0, len / 2, 0);
  if (flat !== 1) g.scale(1, 1, flat);
  list.push({ geo: g, matrix: alignMatrix(base, d) });
  return list;
}

function rndDir(el, az, dEl, dAz, out = 1) {
  return dir(el + dEl, az + dAz).multiplyScalar(out);
}

const HAIR = {
  spiky(h) {
    const L = [{ geo: capGeo(0.6) }];
    let i = 0;
    for (let az = 110; az <= 250; az += 28)
      for (const el of [8, 32, 56]) {
        const j = hash(i++ * 3.7);
        lock(L, el, az, rndDir(el + 18, az, j * 10, (j - 0.5) * 20), 0.12 + j * 0.07 + (el === 32 ? 0.03 : 0), 0.047);
      }
    for (const az of [-60, -20, 20, 60, 160, 200]) lock(L, 76, az, dir(62, az + 180 * 0.15), 0.13, 0.05);
    for (const s of [1, -1]) {
      lock(L, 22, s * 85, dir(-25, s * 105), 0.11, 0.04);
      lock(L, 10, s * 70, dir(-55, s * 80), 0.1, 0.034);
      lock(L, 45, s * 75, dir(25, s * 110), 0.12, 0.045);
    }
    // franja
    const bang = [
      [-38, 0.07],
      [-14, 0.085],
      [6, 0.1],
      [26, 0.08],
      [46, 0.065],
    ];
    for (const [az, len] of bang) lock(L, 30, az, new THREE.Vector3(Math.sin(az * DEG) * 0.35, -1, 0.42), len, 0.032);
    lock(L, 52, 0, dir(30, 0), 0.07, 0.05);
    return { geo: mergeGeos(L), color: h.color };
  },
  neat(h) {
    const L = [{ geo: capGeo(0.64) }];
    for (const az of [-48, -24, 0, 24, 48]) lock(L, 30, az, new THREE.Vector3(Math.sin(az * DEG) * 0.2, -1, 0.3), 0.06, 0.04, 6);
    for (const s of [1, -1]) lock(L, 10, s * 78, dir(-80, s * 85), 0.07, 0.035, 6);
    for (let az = 140; az <= 220; az += 40) lock(L, 0, az, dir(-70, az), 0.07, 0.05, 6);
    return { geo: mergeGeos(L), color: h.color };
  },
  messy(h) {
    const L = [{ geo: capGeo(0.62) }];
    let i = 0;
    for (let az = 0; az < 360; az += 36)
      for (const el of [20, 55]) {
        const j = hash(i++ * 9.1 + 2);
        lock(L, el, az, rndDir(el + 15, az, j * 20, (j - 0.5) * 50), 0.06 + j * 0.04, 0.035);
      }
    for (const az of [-30, 0, 30]) lock(L, 32, az, new THREE.Vector3(Math.sin(az * DEG) * 0.3, -1, 0.4), 0.07, 0.033);
    return { geo: mergeGeos(L), color: h.color };
  },
  short(h) {
    const L = [{ geo: capGeo(0.62) }];
    for (const az of [-40, -15, 10, 35]) lock(L, 32, az, new THREE.Vector3(Math.sin(az * DEG) * 0.3, -1, 0.35), 0.055, 0.035);
    for (let az = 120; az <= 240; az += 40) lock(L, 20, az, dir(-30, az), 0.06, 0.045);
    return { geo: mergeGeos(L), color: h.color };
  },
  buzz(h) {
    return { geo: capGeo(0.56, HEAD_R * 1.025, new THREE.Vector3(0, 0.006, -0.006)), color: h.color };
  },
  pompadour(h) {
    const L = [{ geo: capGeo(0.6) }];
    const pomp = new THREE.SphereGeometry(1, 18, 12);
    pomp.scale(0.085, 0.07, 0.13);
    pomp.rotateX(-0.35);
    pomp.translate(0, 0.115, 0.055);
    L.push({ geo: pomp });
    for (let az = 140; az <= 220; az += 20) lock(L, 25, az, dir(-15, az), 0.09, 0.04);
    return { geo: mergeGeos(L), color: h.color };
  },
  slick(h) {
    const L = [{ geo: capGeo(0.6) }];
    for (let az = 130; az <= 230; az += 25) lock(L, 30, az, dir(-5, az), 0.11, 0.042);
    lock(L, 40, -25, new THREE.Vector3(-0.25, -1, 0.5), 0.13, 0.03, 5, 0.6);
    lock(L, 45, 20, dir(40, 40), 0.06, 0.04);
    return { geo: mergeGeos(L), color: h.color };
  },
  long(h) {
    const L = [{ geo: capGeo(0.62) }];
    const bang = [-52, -32, -12, 8, 28, 48];
    bang.forEach((az, i) =>
      lock(L, 30, az, new THREE.Vector3(Math.sin(az * DEG) * 0.3, -1, 0.32), 0.075 + (i % 2) * 0.012, 0.03, 5, 0.7),
    );
    for (const s of [1, -1]) {
      lock(L, 14, s * 72, new THREE.Vector3(s * 0.12, -1, 0.12), 0.27, 0.03, 6, 0.7);
      lock(L, 18, s * 95, new THREE.Vector3(s * 0.15, -1, -0.05), 0.24, 0.035, 6, 0.7);
    }
    return { geo: mergeGeos(L), color: h.color, back: 'long' };
  },
  bob(h) {
    const L = [{ geo: capGeo(0.62) }];
    for (const az of [-45, -22, 0, 22, 45]) lock(L, 30, az, new THREE.Vector3(Math.sin(az * DEG) * 0.3, -1, 0.3), 0.07, 0.032, 5, 0.7);
    const sh = new THREE.CylinderGeometry(0.118, 0.135, 0.17, 20, 1, true, 0.75, Math.PI * 2 - 1.5);
    sh.translate(0, -0.04, -0.008);
    sh.scale(0.94, 1, 1);
    L.push({ geo: sh });
    return { geo: mergeGeos(L), color: h.color, double: true };
  },
  ponytail(h) {
    const L = [{ geo: capGeo(0.64) }];
    for (const az of [-40, -15, 10, 35]) lock(L, 30, az, new THREE.Vector3(Math.sin(az * DEG) * 0.3, -1, 0.3), 0.07, 0.032, 5, 0.7);
    for (const s of [1, -1]) lock(L, 12, s * 75, new THREE.Vector3(s * 0.1, -1, 0.1), 0.16, 0.025, 5, 0.7);
    return { geo: mergeGeos(L), color: h.color, back: 'tail' };
  },
  twintail(h) {
    const L = [{ geo: capGeo(0.64) }];
    for (const az of [-40, -15, 10, 35]) lock(L, 30, az, new THREE.Vector3(Math.sin(az * DEG) * 0.3, -1, 0.3), 0.07, 0.032, 5, 0.7);
    return { geo: mergeGeos(L), color: h.color, back: 'twin' };
  },
  bald(h) {
    const L = [];
    for (const s of [1, -1]) {
      const g = new THREE.SphereGeometry(1, 12, 8);
      g.scale(0.03, 0.045, 0.07);
      g.translate(s * 0.105, 0.0, -0.035);
      L.push({ geo: g });
    }
    const b = new THREE.SphereGeometry(1, 12, 8);
    b.scale(0.09, 0.05, 0.04);
    b.translate(0, -0.005, -0.1);
    L.push({ geo: b });
    return { geo: mergeGeos(L), color: h.color };
  },
};

// Partes de trás do cabelo que balançam (pivô no alto da cabeça).
function backHair(kind, color) {
  const grp = new THREE.Group();
  grp.position.set(0, 0.04, -0.03);
  const mat = toon(color, { side: THREE.DoubleSide });
  if (kind === 'long') {
    const L = [];
    const sh = new THREE.CylinderGeometry(0.112, 0.15, 0.44, 20, 2, true, Math.PI / 2 - 0.35, Math.PI + 0.7);
    sh.translate(0, -0.2, 0.0);
    sh.scale(0.94, 1, 1);
    L.push({ geo: sh });
    for (let i = 0; i < 9; i++) {
      const a = Math.PI / 2 - 0.3 + (i / 8) * (Math.PI + 0.6);
      const x = Math.sin(a) * 0.14;
      const z = Math.cos(a) * 0.14;
      const g = new THREE.ConeGeometry(0.035, 0.09 + (i % 3) * 0.02, 5);
      g.rotateX(Math.PI);
      g.translate(x * 0.94, -0.44, z);
      L.push({ geo: g });
    }
    grp.add(mesh(mergeGeos(L), mat, 1));
  } else if (kind === 'tail') {
    const knot = mesh(sph(0.025), toon(0xd84a6a), 1);
    knot.position.set(0, 0.0, -0.1);
    grp.add(knot);
    const g = new THREE.ConeGeometry(0.055, 0.32, 7);
    g.rotateX(Math.PI);
    g.translate(0, -0.16, 0);
    const t = mesh(g, mat, 1);
    t.position.set(0, 0.0, -0.11);
    t.rotation.x = 0.3;
    grp.add(t);
  } else if (kind === 'twin') {
    for (const s of [1, -1]) {
      const g = new THREE.ConeGeometry(0.05, 0.36, 7);
      g.rotateX(Math.PI);
      g.translate(0, -0.18, 0);
      const t = mesh(g, mat, 1);
      t.position.set(s * 0.1, 0.02, -0.05);
      t.rotation.z = s * 0.25;
      grp.add(t);
    }
  }
  return grp;
}

// ------------------------------------------------------------ roupas
const OUTFITS = {
  chouran: { jacket: 0x17171d, shirt: 0xb3141f, pants: 0x1a1a22, shoes: 0x141414, open: true, coat: 0xa0121c, collar: true },
  gakuran: { jacket: 0x1e2536, shirt: 0x1e2536, pants: 0x1e2536, shoes: 0x3a2a20, buttons: 0xd8b24a, collar: true },
  open: { jacket: 0x1b1d26, shirt: 0xf2f2f2, pants: 0x1b1d26, shoes: 0xf0f0f0, open: true, collar: true },
  grey: { jacket: 0x5d616a, shirt: 0x5d616a, pants: 0x4b4f57, shoes: 0x202020, buttons: 0xc0c0c0, collar: true },
  greyopen: { jacket: 0x5d616a, shirt: 0x2a2a2a, pants: 0x4b4f57, shoes: 0x202020, open: true, collar: true },
  sailor: { top: 0xf5f5fa, collar: 0x1f2b4d, ribbon: 0xd62839, skirt: 0x1f2b4d, socks: 0x1f2b4d, shoes: 0x5a3320 },
  suit: { jacket: 0x6e6658, shirt: 0xf3f3ee, pants: 0x5f584c, shoes: 0x2a1d14, tie: 0x8c1f2a },
  kid: { jacket: 0xe8e2d0, shirt: 0xe8e2d0, pants: 0x34425e, shoes: 0xd0d0d0, shorts: true },
  kidred: { jacket: 0xc23a30, shirt: 0xc23a30, pants: 0x2d3346, shoes: 0x2a2a2a, shorts: true },
};

// ------------------------------------------------------------ personagem
export class Character {
  constructor(def) {
    this.def = def;
    this.name = def.name;
    this.root = new THREE.Group();
    this.root.name = def.name;
    this.body = new THREE.Group(); // escala geral
    this.root.add(this.body);
    const sc = def.scale ?? 1;
    this.body.scale.setScalar(sc);
    this.sc = sc;
    this.outline = def.outline ?? 1;
    this.props = [];
    this.st = { expr: 'neutral', talk: false, lx: 0, ly: 0, blink: false };
    this.build();
    this.face = new FaceRig(def.face || {});
    this.faceMesh.material.map = this.face.texture;
    this.blinkSeed = hash(def.name.length * 7.7 + (def.seed || 0));
    this.reset();
  }

  part(parent, geo, color, x = 0, y = 0, z = 0, opts = {}) {
    const mat = typeof color === 'number' ? toon(color, opts.matOpts) : color;
    const m = mesh(geo, mat, opts.outline ?? this.outline, { smooth: opts.smooth, cast: opts.cast ?? true });
    m.position.set(x, y, z);
    if (opts.sx || opts.sy || opts.sz) m.scale.set(opts.sx || 1, opts.sy || 1, opts.sz || 1);
    if (opts.rx) m.rotation.x = opts.rx;
    if (opts.rz) m.rotation.z = opts.rz;
    if (opts.ry) m.rotation.y = opts.ry;
    parent.add(m);
    return m;
  }

  build() {
    const d = this.def;
    const bw = d.build ?? 1;
    const fem = !!d.female;
    const O = { ...OUTFITS[d.outfit || 'gakuran'], ...(d.colors || {}) };
    const skin = d.skin ?? 0xf6d5c0;
    const limb = fem ? 0.84 : 1;
    const J = (name, parent, x, y, z) => {
      const g = new THREE.Group();
      g.name = name;
      g.position.set(x, y, z);
      parent.add(g);
      return g;
    };
    this.skin = skin;
    const ankleY = 0.075;
    const shin = fem ? 0.4 : 0.42;
    const thigh = fem ? 0.4 : 0.42;
    this.hipsY = ankleY + shin + thigh + 0.04;
    const B = this.body;
    const hips = (this.hips = J('hips', B, 0, this.hipsY, 0));
    const spine = (this.spine = J('spine', hips, 0, 0.07, 0));
    const chest = (this.chest = J('chest', spine, 0, 0.17, 0));
    const neck = (this.neck = J('neck', chest, 0, fem ? 0.255 : 0.27, 0));
    const head = (this.head = J('head', neck, 0, 0.19, 0));
    head.scale.setScalar(d.headScale ?? (fem ? 1.04 : 1));
    const shW = (fem ? 0.165 : 0.19) * bw;
    const shY = fem ? 0.21 : 0.225;
    this.lSh = J('lSh', chest, shW, shY, 0);
    this.rSh = J('rSh', chest, -shW, shY, 0);
    this.lEl = J('lEl', this.lSh, 0, -0.28 * (fem ? 0.93 : 1), 0);
    this.rEl = J('rEl', this.rSh, 0, -0.28 * (fem ? 0.93 : 1), 0);
    this.lHand = J('lHand', this.lEl, 0, -0.25 * (fem ? 0.93 : 1), 0);
    this.rHand = J('rHand', this.rEl, 0, -0.25 * (fem ? 0.93 : 1), 0);
    const hipW = 0.088 * bw;
    this.lHip = J('lHip', hips, hipW, -0.04, 0);
    this.rHip = J('rHip', hips, -hipW, -0.04, 0);
    this.lKnee = J('lKnee', this.lHip, 0, -thigh, 0);
    this.rKnee = J('rKnee', this.rHip, 0, -thigh, 0);
    this.lAnk = J('lAnk', this.lKnee, 0, -shin, 0);
    this.rAnk = J('rAnk', this.rKnee, 0, -shin, 0);

    // ---- tronco
    if (d.outfit === 'sailor') {
      this.part(hips, cyl(0.135, 0.15, 0.17), O.skirt, 0, 0, 0, { sz: 0.72 });
      this.part(spine, cyl(0.118, 0.14, 0.2), O.top, 0, 0.08, 0, { sz: 0.7 });
      this.part(chest, cyl(0.15, 0.12, 0.27), O.top, 0, 0.125, 0, { sz: 0.7 });
      this.part(chest, sph(1, 18, 10), O.top, 0, 0.255, -0.004, { sx: 0.148, sy: 0.045, sz: 0.1 });
      // gola de marinheiro: placa atrás e faixas na frente
      const col = this.part(chest, boxG(0.26, 0.16, 0.012), O.collar, 0, 0.19, -0.1, { rx: 0.25, smooth: true });
      const stripe = new THREE.Mesh(boxG(0.22, 0.012, 0.014), toon(0xffffff));
      stripe.position.set(0, -0.06, 0);
      col.add(stripe);
      for (const s of [1, -1]) {
        this.part(chest, boxG(0.03, 0.17, 0.012), O.collar, s * 0.055, 0.19, 0.088, { rz: s * 0.5, rx: -0.25 });
      }
      // laço
      const rb = new THREE.Group();
      rb.position.set(0, 0.155, 0.112);
      chest.add(rb);
      for (const s of [1, -1]) {
        const c = this.part(rb, new THREE.ConeGeometry(0.028, 0.055, 4), O.ribbon, s * 0.027, 0, 0, { rz: s * Math.PI / 2 });
        c.scale.z = 0.5;
        this.part(rb, boxG(0.018, 0.06, 0.008), O.ribbon, s * 0.01, -0.035, 0, { rz: s * 0.25 });
      }
      this.part(rb, sph(0.012), O.ribbon, 0, 0, 0.004);
      // saia (acompanha as pernas)
      this.skirt = new THREE.Group();
      this.skirt.position.set(0, 0.03, 0);
      hips.add(this.skirt);
      this.part(this.skirt, skirtGeo(0.14, 0.25, 0.3), toon(O.skirt, { side: THREE.DoubleSide }), 0, -0.15, 0);
    } else {
      this.part(hips, cyl(0.148 * bw, 0.155 * bw, 0.17), O.pants, 0, 0, 0, { sz: 0.72 });
      if (O.open) {
        // camisa por baixo e jaqueta aberta na frente
        this.part(spine, cyl(0.13 * bw, 0.145 * bw, 0.2), O.shirt, 0, 0.08, 0, { sz: 0.7 });
        this.part(chest, cyl(0.168 * bw, 0.13 * bw, 0.28), O.shirt, 0, 0.13, 0, { sz: 0.68 });
        const jm = toon(O.jacket, { side: THREE.DoubleSide });
        this.part(spine, cyl(0.138 * bw, 0.153 * bw, 0.2, 14, true, 0.42, Math.PI * 2 - 0.84), jm, 0, 0.08, 0, { sz: 0.72 });
        this.part(chest, cyl(0.178 * bw, 0.14 * bw, 0.28, 14, true, 0.32, Math.PI * 2 - 0.64), jm, 0, 0.13, 0, {
          sz: 0.7,
        });
      } else {
        this.part(spine, cyl(0.136 * bw, 0.15 * bw, 0.2), O.jacket, 0, 0.08, 0, { sz: 0.7 });
        this.part(chest, cyl(0.176 * bw, 0.138 * bw, 0.28), O.jacket, 0, 0.13, 0, { sz: 0.68 });
        if (O.buttons) {
          for (let i = 0; i < 5; i++) {
            const by = -0.05 + i * 0.075;
            const parent = by < 0.08 ? spine : chest;
            const y = by < 0.08 ? by + 0.08 : by - 0.09;
            const r = (by < 0.08 ? 0.15 - (by + 0.02) * 0.07 : 0.14 + (y / 0.28) * 0.035) * bw * 0.7;
            const b = new THREE.Mesh(sph(0.009, 8, 6), toon(O.buttons));
            b.position.set(0, y, r + 0.004);
            parent.add(b);
          }
        }
        if (O.tie) {
          this.part(chest, boxG(0.07, 0.24, 0.01), O.shirt, 0, 0.14, 0.098, { rx: -0.12 });
          this.part(chest, boxG(0.03, 0.2, 0.012), O.tie, 0, 0.13, 0.106, { rx: -0.12 });
          for (const s of [1, -1])
            this.part(chest, boxG(0.06, 0.24, 0.012), O.jacket, s * 0.055, 0.13, 0.1, { rz: s * -0.18, rx: -0.12 });
        }
      }
      this.part(chest, sph(1, 18, 10), O.jacket, 0, 0.262, -0.004, { sx: 0.17 * bw, sy: 0.05, sz: 0.112 });
      if (d.belly) this.part(spine, sph(0.14), O.jacket, 0, 0.07, 0.03, { sx: 1, sy: 0.9, sz: 0.85 });
      if (O.collar) this.part(neck, cyl(0.056, 0.064, 0.06), O.jacket, 0, 0.01, 0);
      if (d.outfit === 'chouran') {
        // casaco longo do delinquente (chōran): duas abas que seguem as pernas
        this.coat = [];
        for (const s of [1, -1]) {
          const pivot = new THREE.Group();
          pivot.position.set(0, 0.05, 0);
          hips.add(pivot);
          const ts = s > 0 ? 0.36 : Math.PI;
          const tl = Math.PI - 0.36;
          const g = cyl(0.165 * bw, 0.25, 0.62, 12, true, ts, tl);
          const outer = this.part(pivot, g, O.jacket, 0, -0.31, 0, { sz: 0.85 });
          const inner = new THREE.Mesh(g, toon(O.coat, { side: THREE.BackSide }));
          inner.scale.set(0.985, 1, 0.985);
          outer.add(inner);
          this.coat.push(pivot);
        }
      }
    }
    if (d.outfit === 'sailor') this.part(neck, cyl(0.04, 0.045, 0.08), skin, 0, 0.03, 0);
    else this.part(neck, cyl(0.043, 0.05, 0.11), skin, 0, 0.045, 0);
    for (const s of [1, -1]) {
      const sh = s > 0 ? this.lSh : this.rSh;
      this.part(sh, sph(0.066 * limb * (fem ? 1 : bw)), d.outfit === 'sailor' ? O.top : O.jacket, 0, -0.01, 0);
    }

    // ---- braços
    const sleeve = d.outfit === 'sailor' ? O.top : O.jacket;
    for (const s of [1, -1]) {
      const sh = s > 0 ? this.lSh : this.rSh;
      const el = s > 0 ? this.lEl : this.rEl;
      const hd = s > 0 ? this.lHand : this.rHand;
      const ua = 0.28 * (fem ? 0.93 : 1);
      const fa = 0.25 * (fem ? 0.93 : 1);
      this.part(sh, cyl(0.058 * limb * bw, 0.05 * limb * bw, ua, 10), sleeve, 0, -ua / 2, 0);
      this.part(el, sph(0.05 * limb * bw, 10, 8), sleeve, 0, 0, 0);
      if (d.shortSleeve) {
        this.part(el, cyl(0.045 * limb, 0.038 * limb, fa, 10), skin, 0, -fa / 2, 0);
      } else {
        this.part(el, cyl(0.05 * limb * bw, 0.044 * limb * bw, fa * 0.92, 10), sleeve, 0, -fa * 0.46, 0);
        this.part(el, cyl(0.036 * limb, 0.034 * limb, 0.03, 8), d.outfit === 'sailor' ? O.collar : skin, 0, -fa * 0.94, 0, {
          outline: 0,
        });
      }
      const hm = this.part(hd, sph(1, 10, 8), skin, 0, -0.045, 0, { sx: 0.04, sy: 0.055, sz: 0.026 });
      if (s > 0) this.lHandMesh = hm;
      else this.rHandMesh = hm;
      const anchor = new THREE.Group();
      anchor.position.set(0, -0.06, 0.0);
      hd.add(anchor);
      if (s > 0) this.lGrip = anchor;
      else this.rGrip = anchor;
    }

    // ---- pernas
    for (const s of [1, -1]) {
      const hp = s > 0 ? this.lHip : this.rHip;
      const kn = s > 0 ? this.lKnee : this.rKnee;
      const an = s > 0 ? this.lAnk : this.rAnk;
      const thighL = Math.abs(kn.position.y);
      const shinL = Math.abs(an.position.y);
      if (fem) {
        this.part(hp, cyl(0.07, 0.052, thighL, 10), skin, 0, -thighL / 2, 0);
        this.part(kn, sph(0.051, 10, 8), skin, 0, 0, 0);
        this.part(kn, cyl(0.051, 0.04, shinL * 0.3, 10), skin, 0, -shinL * 0.15, 0);
        this.part(kn, cyl(0.053, 0.042, shinL * 0.72, 10), O.socks, 0, -shinL * 0.64, 0);
      } else if (O.shorts) {
        this.part(hp, cyl(0.085 * bw, 0.075, thighL * 0.5, 10), O.pants, 0, -thighL * 0.25, 0);
        this.part(hp, cyl(0.06, 0.05, thighL * 0.55, 10), skin, 0, -thighL * 0.72, 0);
        this.part(kn, sph(0.05, 10, 8), skin, 0, 0, 0);
        this.part(kn, cyl(0.05, 0.04, shinL, 10), skin, 0, -shinL / 2, 0);
      } else {
        this.part(hp, cyl(0.082 * bw, 0.064 * bw, thighL, 10), O.pants, 0, -thighL / 2, 0);
        this.part(kn, sph(0.064 * bw, 10, 8), O.pants, 0, 0, 0);
        this.part(kn, cyl(0.062 * bw, 0.052 * bw, shinL, 10), O.pants, 0, -shinL / 2, 0);
      }
      this.part(an, shoeGeo(), O.shoes, 0, -0.035, 0.045);
    }

    // ---- cabeça
    // (grupo da cabeça já criado acima)
    this.headMesh = this.part(this.head, headGeo(), toon(skin, { wrap: 0.35, soft: 0.75 }), 0, 0, 0);
    this.headMesh.receiveShadow = false;
    this.faceMesh = new THREE.Mesh(
      faceGeo(),
      new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }),
    );
    this.faceMesh.renderOrder = 2;
    this.head.add(this.faceMesh);
    for (const s of [1, -1]) this.part(head, sph(1, 10, 8), skin, s * 0.108, -0.02, -0.004, { sx: 0.016, sy: 0.03, sz: 0.022 });
    const hs = d.hair || { style: 'short', color: 0x222222 };
    const hd = HAIR[hs.style](hs);
    const hmat = toon(hs.color, hd.double ? { side: THREE.DoubleSide } : {});
    this.hairMesh = mesh(hd.geo, hmat, this.outline);
    head.add(this.hairMesh);
    if (hd.back) {
      this.backHair = backHair(hd.back, hs.color);
      head.add(this.backHair);
    }
    if (hs.clip) this.part(head, boxG(0.03, 0.012, 0.012), hs.clip, 0.07, 0.07, 0.085, { rz: 0.6, ry: 0.5 });
    if (d.glasses) {
      const gm = toon(d.glasses);
      const fr = new THREE.Group();
      fr.position.set(0, -0.012, 0.118);
      head.add(fr);
      for (const s of [1, -1]) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.0028, 6, 20), gm);
        ring.position.set(s * 0.043, 0, s * 0 - 0.002);
        ring.scale.set(1.1, 0.85, 1);
        fr.add(ring);
        const lens = new THREE.Mesh(
          new THREE.CircleGeometry(0.024, 16),
          flat(0xdfefff, { transparent: true, opacity: 0.16, dw: false }),
        );
        lens.renderOrder = 3;
        lens.position.copy(ring.position);
        lens.scale.copy(ring.scale);
        fr.add(lens);
        const arm = new THREE.Mesh(boxG(0.004, 0.004, 0.1), gm);
        arm.position.set(s * 0.07, 0.002, -0.05);
        fr.add(arm);
      }
      const br = new THREE.Mesh(boxG(0.02, 0.003, 0.003), gm);
      br.position.set(0, 0.004, 0);
      fr.add(br);
      this.glasses = fr;
    }
    if (d.mask) {
      const m = this.part(head, new THREE.SphereGeometry(HEAD_R * 1.02, 16, 10, Math.PI / 2 - 1, 2, 1.75, 0.75), 0xf4f4f4, 0, -0.012, 0.004, {
        sx: 0.93,
      });
      m.material = toon(0xf4f4f4, { side: THREE.DoubleSide });
    }
    if (d.headband) {
      this.part(head, cyl(HEAD_R * 1.08, HEAD_R * 1.08, 0.025, 20, true), toon(d.headband, { side: THREE.DoubleSide }), 0, 0.05, -0.01, {
        sx: 0.94,
      });
    }

    // sombra de contato (mancha escura sob os pés)
    const blob = new THREE.Mesh(
      new THREE.CircleGeometry(0.34, 20),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28, depthWrite: false }),
    );
    blob.rotation.x = -Math.PI / 2;
    blob.position.y = 0.012;
    blob.renderOrder = 1;
    this.blob = blob;
    this.root.add(blob);
    this.root.traverse((o) => {
      if (o.isMesh) o.frustumCulled = true;
    });
  }

  // ------------------------------------------------------------ API por quadro
  reset() {
    this.root.visible = false;
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.st.expr = 'neutral';
    this.st.talk = false;
    this.st.lx = 0;
    this.st.ly = 0;
    this.wind = 0;
    this.noBlink = false;
    this.blob.visible = true;
    this.blob.material.opacity = 0.28;
    for (const p of this.props) p.visible = false;
    this.lFist = 0;
    this.rFist = 0;
    this.applyPose({});
  }

  place(x, z, rotY = 0, y = 0) {
    this.root.visible = true;
    this.root.position.set(x, y, z);
    this.root.rotation.y = rotY;
    return this;
  }

  // Vira para olhar o ponto (x, z).
  faceTo(x, z) {
    this.root.rotation.y = Math.atan2(x - this.root.position.x, z - this.root.position.z);
    return this;
  }

  expr(name, lx = 0, ly = 0) {
    this.st.expr = name;
    this.st.lx = lx;
    this.st.ly = ly;
    return this;
  }

  // Liga um objeto (prop) a uma das âncoras: 'l', 'r' (mãos), 'head', 'chest'.
  attach(obj, where = 'r', pos = [0, 0, 0], rot = [0, 0, 0], hang = false) {
    obj.userData.hang = hang;
    const parent = where === 'l' ? this.lGrip : where === 'r' ? this.rGrip : where === 'head' ? this.head : this.chest;
    parent.add(obj);
    obj.position.set(...pos);
    obj.rotation.set(...rot);
    obj.visible = false;
    this.props.push(obj);
    return obj;
  }

  applyPose(p) {
    const r = (k) => (p[k] || 0) * DEG;
    this.p = p;
    this.hips.position.y = this.hipsY + (p.hipY || 0);
    this.hips.position.x = p.hipXo || 0;
    this.hips.position.z = p.hipZo || 0;
    this.hips.rotation.set(r('hipX'), r('hipRY'), r('hipZ'));
    this.spine.rotation.set(r('spX'), r('spY'), r('spZ'));
    this.chest.rotation.set(r('chX'), r('chY'), r('chZ'));
    this.neck.rotation.set(r('nkX'), r('nkY'), 0);
    this.head.rotation.set(r('hdX'), r('hdY'), r('hdZ'));
    this.lSh.rotation.set(-r('lsX'), r('lsY'), r('lsZ') + 7 * DEG);
    this.rSh.rotation.set(-r('rsX'), -r('rsY'), -r('rsZ') - 7 * DEG);
    this.lEl.rotation.set(-r('leX'), r('leY'), 0);
    this.rEl.rotation.set(-r('reX'), -r('reY'), 0);
    this.lHand.rotation.set(-r('lwX'), 0, r('lwZ'));
    this.rHand.rotation.set(-r('rwX'), 0, -r('rwZ'));
    this.lHip.rotation.set(-r('lhX'), r('lhY'), r('lhZ'));
    this.rHip.rotation.set(-r('rhX'), -r('rhY'), -r('rhZ'));
    this.lKnee.rotation.x = r('lkX');
    this.rKnee.rotation.x = r('rkX');
    this.lAnk.rotation.x = -r('laX');
    this.rAnk.rotation.x = -r('raX');
    this.lFist = p.lFist ?? this.lFist ?? 0;
    this.rFist = p.rFist ?? this.rFist ?? 0;
    for (const [m, f] of [
      [this.lHandMesh, this.lFist],
      [this.rHandMesh, this.rFist],
    ]) {
      m.scale.set(0.04 + f * 0.006, 0.055 - f * 0.012, 0.026 + f * 0.016);
      m.position.y = -0.045 + f * 0.008;
    }
    return this;
  }

  pose(p) {
    this.applyPose(p);
    return this;
  }

  headWorld(out = new THREE.Vector3(), up = 0) {
    this.root.updateMatrixWorld(true);
    return this.head.localToWorld(out.set(0, up, 0));
  }

  worldOf(node, out = new THREE.Vector3(), x = 0, y = 0, z = 0) {
    this.root.updateMatrixWorld(true);
    return node.localToWorld(out.set(x, y, z));
  }

  // Atualiza rosto, piscadas, boca falando, cabelo e casaco ao vento.
  update(t) {
    if (!this.root.visible) return;
    const p = this.p || {};
    let blink = false;
    if (!this.noBlink) {
      const per = 3.6 + this.blinkSeed * 1.5;
      const k = Math.floor((t + this.blinkSeed * 10) / per);
      const start = k * per + hash(k + this.blinkSeed * 50) * (per - 0.4) - this.blinkSeed * 10;
      blink = t >= start && t < start + 0.12;
    }
    let talk = false;
    if (this.st.talk) {
      const ph = t * 9.5 + this.blinkSeed * 3;
      talk = Math.sin(ph) + Math.sin(ph * 0.53) * 0.6 > -0.2;
    }
    this.face.update({ expr: this.st.expr, talk, blink, lx: this.st.lx, ly: this.st.ly });

    // objetos pendurados (mochila) ficam na vertical, virados como o corpo
    for (const pr of this.props) {
      if (!pr.visible || !pr.userData.hang) continue;
      pr.parent.updateWorldMatrix(true, false);
      pr.parent.getWorldQuaternion(_q1).invert();
      this.root.getWorldQuaternion(_q2);
      pr.quaternion.copy(_q1.multiply(_q2));
      if (pr.userData.swing) pr.rotateZ(pr.userData.swing);
    }
    const w = this.wind || 0;
    if (this.coat) {
      const lh = p.lhX || 0;
      const rh = p.rhX || 0;
      const back = (p.coatBack || 0) + w * (12 + Math.sin(t * 7.3) * 6 + Math.sin(t * 13.1) * 3);
      // aba esquerda (s=+1) segue a coxa esquerda
      this.coat[0].rotation.x = (-lh * 0.55 + back + Math.max(0, -lh) * 0.2) * DEG;
      this.coat[1].rotation.x = (-rh * 0.55 + back + Math.max(0, -rh) * 0.2) * DEG;
      this.coat[0].rotation.z = (Math.max(0, p.lhZ || 0) * 0.6 + w * 4) * DEG;
      this.coat[1].rotation.z = -(Math.max(0, p.rhZ || 0) * 0.6 + w * 4) * DEG;
    }
    if (this.skirt) {
      const lh = p.lhX || 0;
      const rh = p.rhX || 0;
      this.skirt.rotation.x = (-(lh + rh) * 0.25 + w * (3 + Math.sin(t * 6) * 2)) * DEG;
      const spread = clamp(Math.abs(lh - rh) / 60, 0, 1);
      this.skirt.scale.set(1 + spread * 0.12, 1, 1 + spread * 0.25);
    }
    if (this.backHair) {
      this.backHair.rotation.x = (w * (10 + Math.sin(t * 5.1) * 5) - (p.hdX || 0) * 0.4 + (p.hairBack || 0)) * DEG;
      this.backHair.rotation.z = w * Math.sin(t * 3.7) * 4 * DEG;
    }
  }
}

// ------------------------------------------------------------ elenco
export const SKIN = { light: 0xf8dcc8, mid: 0xf1cdb2, tan: 0xe2b38f };

export function makeCast() {
  const C = {};
  C.akashi = new Character({
    name: 'Akashi',
    outfit: 'chouran',
    scale: 0.985,
    hair: { style: 'spiky', color: 0xb5172c },
    face: {
      size: 512,
      shape: 'sharp',
      eyeColor: '#c3202c',
      eyeDark: '#3a050a',
      eyeLight: '#ff7a6a',
      eyeW: 0.038,
      eyeH: 0.026,
      brow: '#6a0f18',
      browT: 0.007,
      line: '#1f1012',
      lid0: 0.18,
      brow0: 0.32,
      bandage: true,
      fangs: true,
      iris: 0.92,
      highlight: 0.75,
    },
  });
  C.hana = new Character({
    name: 'Hana',
    outfit: 'sailor',
    female: true,
    scale: 0.92,
    hair: { style: 'long', color: 0x7a4428, clip: 0xff7aa0 },
    face: {
      size: 512,
      shape: 'round',
      eyeColor: '#b06a2c',
      eyeDark: '#3a1a08',
      eyeLight: '#f2c070',
      eyeW: 0.04,
      eyeH: 0.039,
      eyeX: 0.045,
      eyeY: -0.016,
      lashes: true,
      brow: '#6a3a22',
      browT: 0.0038,
      mouthY: -0.084,
      mouthW: 0.018,
      iris: 1.05,
    },
  });
  C.kenta = new Character({
    name: 'Kenta',
    outfit: 'gakuran',
    scale: 0.95,
    hair: { style: 'neat', color: 0x1f2233 },
    glasses: 0x2a2a35,
    face: { size: 512, eyeColor: '#3b4d7a', eyeDark: '#141a2c', eyeLight: '#8aa0d8', eyeW: 0.034, eyeH: 0.03 },
  });
  C.tanaka = new Character({
    name: 'Tanaka',
    outfit: 'suit',
    scale: 0.95,
    belly: true,
    hair: { style: 'bald', color: 0x8a8a8a },
    glasses: 0x5a4a30,
    skin: SKIN.mid,
    face: { size: 256, shape: 'small', eyeColor: '#3a3a3a', eyeW: 0.03, eyeH: 0.022, mustache: '#5a5a5a', brow: '#666' },
  });
  C.ryuji = new Character({
    name: 'Ryuji',
    outfit: 'open',
    scale: 1.0,
    hair: { style: 'pompadour', color: 0xe8c24a },
    skin: SKIN.mid,
    face: {
      size: 512,
      shape: 'sharp',
      eyeColor: '#7a5a1a',
      eyeDark: '#2a1a05',
      eyeLight: '#d8b060',
      eyeW: 0.034,
      eyeH: 0.022,
      lid0: 0.25,
      brow0: 0.3,
      brow: '#a8862a',
      fangs: true,
      iris: 0.8,
    },
  });
  C.goro = new Character({
    name: 'Goro',
    outfit: 'gakuran',
    colors: { buttons: 0xb0b0b0 },
    scale: 1.07,
    build: 1.32,
    hair: { style: 'buzz', color: 0x2a2620 },
    skin: SKIN.tan,
    face: { size: 256, shape: 'small', eyeW: 0.026, eyeH: 0.018, iris: 0.8, browT: 0.009, lid0: 0.15, brow0: 0.2 },
  });
  C.shin = new Character({
    name: 'Shin',
    outfit: 'open',
    colors: { shirt: 0x4a2a5a },
    scale: 0.99,
    build: 0.88,
    hair: { style: 'slick', color: 0x3b2c26 },
    face: { size: 256, shape: 'sharp', eyeColor: '#4a6a3a', eyeW: 0.034, eyeH: 0.022, lid0: 0.1 },
  });
  C.yuuto = new Character({
    name: 'Yuuto',
    outfit: 'gakuran',
    scale: 0.86,
    hair: { style: 'messy', color: 0xa0703f },
    headScale: 1.06,
    face: { size: 512, shape: 'round', eyeColor: '#5a7a3a', eyeLight: '#b8d880', eyeW: 0.038, eyeH: 0.036 },
  });
  C.thug1 = new Character({
    name: 'Bandido1',
    outfit: 'grey',
    scale: 1.0,
    mask: true,
    hair: { style: 'messy', color: 0x2a2a2a },
    face: { size: 256, shape: 'sharp', eyeW: 0.032, eyeH: 0.02, lid0: 0.3, brow0: 0.4 },
  });
  C.thug2 = new Character({
    name: 'Bandido2',
    outfit: 'greyopen',
    scale: 1.02,
    build: 1.08,
    headband: 0xd0d0d0,
    hair: { style: 'short', color: 0x5a3a2a },
    skin: SKIN.tan,
    face: { size: 256, shape: 'sharp', eyeW: 0.032, eyeH: 0.02, lid0: 0.3, brow0: 0.4 },
  });
  // Akashi criança e os personagens do flashback.
  C.kidAkashi = new Character({
    name: 'AkashiCrianca',
    outfit: 'kidred',
    scale: 0.62,
    headScale: 1.2,
    shortSleeve: true,
    hair: { style: 'spiky', color: 0xb5172c },
    face: { size: 256, shape: 'normal', eyeColor: '#c3202c', eyeW: 0.04, eyeH: 0.034, brow0: 0.2, bandage: true },
  });
  C.kidVictim = new Character({
    name: 'Crianca',
    outfit: 'kid',
    scale: 0.55,
    headScale: 1.22,
    shortSleeve: true,
    hair: { style: 'short', color: 0x3a2a1a },
    face: { size: 256, shape: 'round', eyeW: 0.04, eyeH: 0.038 },
  });
  C.kidBully1 = new Character({
    name: 'Valentao1',
    outfit: 'kid',
    colors: { jacket: 0x4a5a3a, shirt: 0x4a5a3a },
    scale: 0.74,
    build: 1.15,
    headScale: 1.12,
    shortSleeve: true,
    hair: { style: 'buzz', color: 0x2a2a2a },
    face: { size: 256, shape: 'sharp', eyeW: 0.032, eyeH: 0.022, lid0: 0.3, brow0: 0.4 },
  });
  C.kidBully2 = new Character({
    name: 'Valentao2',
    outfit: 'kid',
    colors: { jacket: 0x3a4a6a, shirt: 0x3a4a6a },
    scale: 0.72,
    headScale: 1.12,
    shortSleeve: true,
    hair: { style: 'messy', color: 0x4a3020 },
    face: { size: 256, shape: 'sharp', eyeW: 0.032, eyeH: 0.022, lid0: 0.3, brow0: 0.4 },
  });
  return C;
}

// Alunos genéricos (multidão), gerados de forma determinística.
export function makeStudents(n, outline = 1) {
  const boyHair = ['short', 'messy', 'neat', 'short', 'buzz'];
  const girlHair = ['bob', 'ponytail', 'long', 'twintail', 'bob'];
  const hairCols = [0x1c1c22, 0x2e2018, 0x4a2e1c, 0x1c1c22, 0x6a4024, 0x2a2430, 0x1c1c22, 0x8a5a30];
  const eyeCols = ['#4a3020', '#2a3a5a', '#3a2a1a', '#5a4a2a'];
  const list = [];
  for (let i = 0; i < n; i++) {
    const r = (k) => hash(i * 13.37 + k * 7.1);
    const fem = i % 2 === 1;
    const style = fem ? girlHair[Math.floor(r(1) * girlHair.length)] : boyHair[Math.floor(r(1) * boyHair.length)];
    const c = new Character({
      name: `Aluno${i}`,
      seed: i,
      outfit: fem ? 'sailor' : 'gakuran',
      female: fem,
      scale: (fem ? 0.9 : 0.96) + r(2) * 0.07,
      build: fem ? 1 : 0.95 + r(6) * 0.15,
      outline,
      hair: { style, color: hairCols[Math.floor(r(3) * hairCols.length)] },
      skin: [SKIN.light, SKIN.mid, SKIN.light][Math.floor(r(4) * 3)],
      glasses: r(5) > 0.82 ? 0x303040 : null,
      face: {
        size: 256,
        shape: fem ? 'round' : 'normal',
        eyeColor: eyeCols[Math.floor(r(7) * eyeCols.length)],
        lashes: fem,
        eyeW: fem ? 0.038 : 0.034,
        eyeH: fem ? 0.036 : 0.028,
      },
    });
    list.push(c);
  }
  return list;
}

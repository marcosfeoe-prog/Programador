// Modelos procedurais dos carros. Cada carro é desenhado como perfil lateral
// (com recortes dos para-lamas) extrudado na largura e afinado em cima e no
// bico, mais cabine de vidro, rodas, luzes e peças extras (aerofólio, gaiola…).
// Espaço do modelo: frente = -Z, direita = +X, cima = +Y, chão em y = 0.
import * as THREE from 'three';
import { mergeGeometries, smoothstep, clamp } from './util.js';
import { rimTexture, tireTexture, glowTexture } from './textures.js';
import { PAINTS, RIMS, NEONS } from './config.js';

// ------------------------------------------------------------ geometria base
function creaseNormals(geo, crease = 0.62) {
  const pos = geo.attributes.position;
  const n = pos.count;
  const faceN = new Float32Array(n);
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  for (let f = 0; f < n / 3; f++) {
    a.fromBufferAttribute(pos, f * 3);
    b.fromBufferAttribute(pos, f * 3 + 1);
    c.fromBufferAttribute(pos, f * 3 + 2);
    b.sub(a);
    c.sub(a);
    b.cross(c).normalize();
    faceN[f * 3] = b.x;
    faceN[f * 3 + 1] = b.y;
    faceN[f * 3 + 2] = b.z;
  }
  const map = new Map();
  const key = (i) => `${Math.round(pos.getX(i) * 1e4)},${Math.round(pos.getY(i) * 1e4)},${Math.round(pos.getZ(i) * 1e4)}`;
  const keys = new Array(n);
  for (let i = 0; i < n; i++) {
    const k = (keys[i] = key(i));
    let l = map.get(k);
    if (!l) map.set(k, (l = []));
    l.push(i);
  }
  const out = new Float32Array(n * 3);
  const cosA = Math.cos(crease);
  for (let i = 0; i < n; i++) {
    const fi = Math.floor(i / 3) * 3;
    let x = 0;
    let y = 0;
    let z = 0;
    for (const j of map.get(keys[i])) {
      const fj = Math.floor(j / 3) * 3;
      const d = faceN[fi] * faceN[fj] + faceN[fi + 1] * faceN[fj + 1] + faceN[fi + 2] * faceN[fj + 2];
      if (d >= cosA) {
        x += faceN[fj];
        y += faceN[fj + 1];
        z += faceN[fj + 2];
      }
    }
    const l = Math.hypot(x, y, z) || 1;
    out[i * 3] = x / l;
    out[i * 3 + 1] = y / l;
    out[i * 3 + 2] = z / l;
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(out, 3));
  return geo;
}

// Perfil lateral fechado: contorno de cima (traseira→frente) + base com os
// recortes semicirculares das rodas.
function sideProfile(top, base, arches) {
  const pts = top.map(([u, v]) => new THREE.Vector2(u, v));
  const front = top[top.length - 1][0];
  const rear = top[0][0];
  const list = [...arches].sort((p, q) => q.u - p.u); // da frente para trás
  for (const a of list) {
    if (a.u + a.r > front - 0.02 || a.u - a.r < rear + 0.02) continue;
    pts.push(new THREE.Vector2(a.u + a.r, base));
    const n = 10;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI;
      pts.push(new THREE.Vector2(a.u + a.r * Math.cos(t), Math.max(base, a.c) + a.r * Math.sin(t) * (a.c > base ? 1 : 1)));
    }
    pts.push(new THREE.Vector2(a.u - a.r, base));
  }
  pts.push(new THREE.Vector2(rear, base));
  return pts;
}

// Corta um polígono no semiplano v <= lim (Sutherland–Hodgman).
function clipBelow(pts, lim) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const q = pts[(i + 1) % pts.length];
    const pin = p.y <= lim;
    const qin = q.y <= lim;
    if (pin) out.push(p.clone());
    if (pin !== qin) {
      const t = (lim - p.y) / (q.y - p.y);
      out.push(new THREE.Vector2(p.x + (q.x - p.x) * t, lim));
    }
  }
  return out;
}

// Extrusão do perfil na largura, com afinamento e normais suavizadas.
function extrudeSide(pts, width, taper = {}, bevel = 0.06, zOff = 0) {
  const shape = new THREE.Shape(pts);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.01, width - bevel * 2),
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 2,
    curveSegments: 4,
  });
  geo.translate(0, 0, -(width - bevel * 2) / 2);
  const pos = geo.attributes.position;
  const { top = 0, topFrom = 0.6, topTo = 1.3, nose = 0, noseFrom = 1.2, noseTo = 2.3, tail = 0, tailFrom = -1.4, tailTo = -2.3 } = taper;
  for (let i = 0; i < pos.count; i++) {
    const u = pos.getX(i);
    const v = pos.getY(i);
    let k = 1;
    k -= top * smoothstep(topFrom, topTo, v);
    k -= nose * smoothstep(noseFrom, noseTo, u);
    k -= tail * smoothstep(tailFrom, tailTo, u);
    pos.setZ(i, pos.getZ(i) * Math.max(0.2, k) + zOff);
  }
  const g = geo.index ? geo.toNonIndexed() : geo;
  creaseNormals(g);
  // u → -Z (frente), largura → X
  g.rotateY(Math.PI / 2);
  return g;
}

function box(w, h, l, x, y, z, rx = 0) {
  const g = new THREE.BoxGeometry(w, h, l);
  if (rx) g.rotateX(rx);
  g.translate(x, y, z);
  return g.toNonIndexed();
}

// Tubo (para gaiolas e suportes) entre dois pontos no espaço do modelo.
function tube(a, b, r = 0.035, seg = 6) {
  const A = new THREE.Vector3(...a);
  const B = new THREE.Vector3(...b);
  const len = A.distanceTo(B);
  const g = new THREE.CylinderGeometry(r, r, len, seg, 1);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize());
  g.applyQuaternion(q);
  g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
  return g.toNonIndexed();
}

// Faixa fina que acompanha um trecho do contorno (listras de corrida).
function bandAlong(points, w, z, lift = 0.07, th = 0.03) {
  const top = points.map(([u, v]) => new THREE.Vector2(u, v + lift));
  const bot = points
    .slice()
    .reverse()
    .map(([u, v]) => new THREE.Vector2(u, v + lift - th));
  const geo = extrudeSide([...top, ...bot], w, {}, 0, 0);
  geo.translate(z, 0, 0);
  return geo;
}

// --------------------------------------------------------------- definições
// u: comprimento (+ frente), v: altura. Distâncias em metros.
const DEFS = {
  faisca: {
    width: 1.78,
    wheel: { r: 0.36, w: 0.26, u: [-1.25, 1.27], inset: 0.03 },
    base: 0.28,
    top: [[-1.95, 0.32], [-2.0, 0.62], [-1.95, 0.86], [-1.76, 0.95], [0.85, 0.92], [1.6, 0.8], [1.92, 0.66], [2.0, 0.42], [1.96, 0.28]],
    taper: { top: 0.14, topFrom: 0.55, topTo: 0.95, nose: 0.1, noseFrom: 1.1, noseTo: 2.0, tail: 0.06, tailFrom: -1.5, tailTo: -2.0 },
    cabin: [[0.98, 0.9], [0.22, 1.36], [-1.22, 1.4], [-1.74, 1.14], [-1.84, 0.92]],
    cabinW: 0.84,
    trim: 0.42,
    head: [{ u: 1.97, v: 0.66, z: 0.6, w: 0.34, h: 0.12 }],
    tail: [{ u: -1.99, v: 0.8, z: 0.66, w: 0.3, h: 0.14 }],
    exhaust: [{ u: -1.98, v: 0.3, z: 0.5 }],
    extras: ['roofSpoiler'],
  },
  raio: {
    width: 1.9,
    wheel: { r: 0.37, w: 0.28, u: [-1.38, 1.42], inset: 0.03 },
    base: 0.27,
    top: [[-2.15, 0.36], [-2.2, 0.64], [-2.12, 0.86], [-1.9, 0.92], [-0.6, 0.95], [1.0, 0.86], [1.85, 0.72], [2.16, 0.54], [2.2, 0.36], [2.14, 0.27]],
    taper: { top: 0.16, topFrom: 0.55, topTo: 0.95, nose: 0.14, noseFrom: 1.1, noseTo: 2.2, tail: 0.06 },
    cabin: [[0.98, 0.86], [0.08, 1.26], [-0.62, 1.27], [-1.88, 0.92], [-1.2, 0.9]],
    cabinW: 0.82,
    trim: 0.4,
    head: [{ u: 2.08, v: 0.6, z: 0.62, w: 0.42, h: 0.09 }],
    tail: [{ u: -2.19, v: 0.78, z: 0.6, w: 0.46, h: 0.1 }],
    exhaust: [{ u: -2.18, v: 0.32, z: 0.42 }, { u: -2.18, v: 0.32, z: -0.42 }],
    extras: ['lipSpoiler'],
  },
  trovao: {
    width: 1.96,
    wheel: { r: 0.4, w: 0.32, u: [-1.5, 1.5], inset: 0.02, rearW: 0.38 },
    base: 0.3,
    top: [[-2.3, 0.38], [-2.33, 0.86], [-2.2, 0.97], [-1.4, 0.99], [-0.6, 1.0], [1.0, 1.0], [2.0, 0.95], [2.3, 0.88], [2.33, 0.44], [2.26, 0.3]],
    taper: { top: 0.08, topFrom: 0.75, topTo: 1.0, nose: 0.04, tail: 0.03 },
    cabin: [[0.62, 0.97], [-0.12, 1.4], [-1.02, 1.42], [-1.58, 0.98]],
    cabinW: 0.84,
    trim: 0.44,
    head: [
      { u: 2.32, v: 0.7, z: 0.72, w: 0.22, h: 0.18 },
      { u: 2.32, v: 0.7, z: 0.46, w: 0.18, h: 0.16 },
    ],
    tail: [{ u: -2.33, v: 0.78, z: 0.55, w: 0.6, h: 0.12 }],
    grille: { u: 2.33, v: 0.66, w: 0.7, h: 0.22 },
    exhaust: [{ u: -2.3, v: 0.32, z: 0.6 }, { u: -2.3, v: 0.32, z: -0.6 }],
    extras: ['scoop', 'ducktail', 'stripes'],
  },
  lobo: {
    width: 1.42,
    wheel: { r: 0.48, w: 0.38, u: [-1.22, 1.3], outside: 0.2 },
    base: 0.5,
    top: [[-1.62, 0.56], [-1.68, 0.86], [-1.3, 0.96], [0.3, 0.92], [1.2, 0.86], [1.7, 0.72], [1.78, 0.54]],
    taper: { top: 0.06, topFrom: 0.7, topTo: 0.96, nose: 0.12, noseFrom: 1.0, noseTo: 1.8 },
    cabin: null,
    trim: 0.62,
    head: [{ u: 1.76, v: 0.68, z: 0.42, w: 0.22, h: 0.12 }],
    tail: [{ u: -1.67, v: 0.8, z: 0.5, w: 0.18, h: 0.12 }],
    exhaust: [{ u: -1.66, v: 0.62, z: 0.3 }],
    extras: ['cage', 'driver', 'spare', 'bullbar', 'lightbar'],
  },
  cometa: {
    width: 1.98,
    wheel: { r: 0.37, w: 0.3, u: [-1.45, 1.45], inset: 0.02, rearW: 0.34 },
    base: 0.25,
    top: [[-2.2, 0.35], [-2.24, 0.8], [-2.1, 0.9], [-1.2, 0.92], [0.0, 0.86], [1.2, 0.72], [2.1, 0.5], [2.26, 0.36], [2.2, 0.25]],
    taper: { top: 0.18, topFrom: 0.5, topTo: 0.92, nose: 0.18, noseFrom: 0.9, noseTo: 2.25, tail: 0.04 },
    cabin: [[0.92, 0.76], [0.12, 1.12], [-0.6, 1.14], [-1.34, 0.9]],
    cabinW: 0.74,
    trim: 0.36,
    head: [{ u: 2.12, v: 0.52, z: 0.66, w: 0.4, h: 0.06 }],
    tail: [{ u: -2.23, v: 0.74, z: 0.0, w: 1.6, h: 0.07 }],
    exhaust: [{ u: -2.22, v: 0.42, z: 0.18 }, { u: -2.22, v: 0.42, z: -0.18 }],
    extras: ['lowWing', 'intakes'],
  },
  tufao: {
    width: 0.86,
    wheel: { r: 0.4, w: 0.36, u: [-1.55, 1.55], outside: 0.32, rearW: 0.46, rearR: 0.44 },
    base: 0.18,
    noArches: true,
    top: [[-2.2, 0.25], [-2.25, 0.62], [-1.6, 0.9], [-0.7, 0.98], [-0.25, 0.82], [0.6, 0.62], [1.6, 0.5], [2.45, 0.36], [2.55, 0.24]],
    taper: { top: 0.4, topFrom: 0.4, topTo: 0.98, nose: 0.5, noseFrom: 0.4, noseTo: 2.5, tail: 0.3, tailFrom: -1.2, tailTo: -2.2 },
    cabin: null,
    trim: 0.3,
    head: [],
    tail: [{ u: -2.24, v: 0.45, z: 0.0, w: 0.16, h: 0.12 }],
    exhaust: [{ u: -2.22, v: 0.55, z: 0 }],
    extras: ['f1wings', 'sidepods', 'driver', 'halo'],
  },
  vespa: {
    width: 2.0,
    wheel: { r: 0.38, w: 0.3, u: [-1.5, 1.55], inset: 0.02, rearW: 0.36 },
    base: 0.24,
    top: [[-2.3, 0.4], [-2.33, 0.82], [-2.16, 0.92], [-1.0, 0.96], [0.3, 0.82], [1.4, 0.66], [2.2, 0.45], [2.32, 0.3], [2.28, 0.24]],
    taper: { top: 0.2, topFrom: 0.5, topTo: 0.95, nose: 0.2, noseFrom: 0.8, noseTo: 2.3, tail: 0.05 },
    cabin: [[0.88, 0.74], [0.1, 1.13], [-0.72, 1.15], [-1.62, 0.95]],
    cabinW: 0.68,
    trim: 0.36,
    head: [{ u: 2.18, v: 0.48, z: 0.7, w: 0.36, h: 0.06 }],
    tail: [{ u: -2.32, v: 0.76, z: 0.62, w: 0.5, h: 0.08 }],
    exhaust: [{ u: -2.3, v: 0.62, z: 0.0 }],
    extras: ['bigWing', 'fin', 'splitter', 'intakes'],
  },
  bolido: {
    width: 1.86,
    wheel: { r: 0.37, w: 0.3, u: [-1.35, 1.45], inset: 0.02 },
    base: 0.27,
    top: [[-2.15, 0.4], [-2.2, 0.72], [-2.0, 0.9], [-1.25, 0.97], [-0.4, 0.9], [0.6, 0.88], [1.3, 0.92], [1.95, 0.74], [2.18, 0.52], [2.16, 0.32]],
    taper: { top: 0.2, topFrom: 0.5, topTo: 0.97, nose: 0.14, noseFrom: 1.2, noseTo: 2.2, tail: 0.1, tailFrom: -1.4, tailTo: -2.2 },
    cabin: [[0.48, 0.87], [0.12, 1.18], [-0.7, 1.2], [-1.12, 0.92]],
    cabinW: 0.62,
    trim: 0.4,
    head: [],
    roundLights: [{ u: 2.0, v: 0.7, z: 0.6, r: 0.13 }],
    tail: [{ u: -2.19, v: 0.74, z: 0.6, w: 0.22, h: 0.12 }],
    exhaust: [{ u: -2.1, v: 0.3, z: 0.7 }, { u: -2.1, v: 0.3, z: -0.7 }],
    extras: ['roundel', 'stripesCenter', 'rollhoop'],
  },
  ciclone: {
    width: 2.0,
    wheel: { r: 0.37, w: 0.32, u: [-1.62, 1.6], inset: 0.02 },
    base: 0.22,
    top: [[-2.4, 0.42], [-2.43, 0.9], [-2.2, 0.96], [-1.62, 0.9], [-1.0, 0.98], [0.6, 0.9], [1.6, 0.74], [2.32, 0.5], [2.44, 0.3], [2.4, 0.22]],
    taper: { top: 0.16, topFrom: 0.55, topTo: 0.98, nose: 0.16, noseFrom: 1.0, noseTo: 2.4, tail: 0.04 },
    cabin: [[0.95, 0.86], [0.3, 1.2], [-0.62, 1.22], [-1.25, 0.98]],
    cabinW: 0.56,
    trim: 0.36,
    head: [{ u: 2.25, v: 0.56, z: 0.72, w: 0.3, h: 0.1 }],
    tail: [{ u: -2.42, v: 0.9, z: 0.0, w: 1.8, h: 0.05 }],
    exhaust: [{ u: -2.4, v: 0.5, z: 0.35 }, { u: -2.4, v: 0.5, z: -0.35 }],
    extras: ['lmWing', 'fin', 'splitter'],
  },
  fantasma: {
    width: 2.0,
    wheel: { r: 0.38, w: 0.3, u: [-1.5, 1.5], inset: 0.04, rearCovered: true },
    base: 0.26,
    top: [[-2.3, 0.45], [-2.32, 0.72], [-1.9, 0.92], [-0.6, 1.0], [0.6, 0.94], [1.6, 0.72], [2.25, 0.48], [2.32, 0.3]],
    taper: { top: 0.22, topFrom: 0.45, topTo: 1.0, nose: 0.2, noseFrom: 0.8, noseTo: 2.3, tail: 0.18, tailFrom: -1.2, tailTo: -2.3 },
    cabin: [[1.02, 0.9], [0.2, 1.26], [-0.9, 1.26], [-1.92, 0.92]],
    cabinW: 0.72,
    trim: 0.38,
    head: [{ u: 2.26, v: 0.5, z: 0.0, w: 1.4, h: 0.04 }],
    tail: [{ u: -2.31, v: 0.66, z: 0.0, w: 1.6, h: 0.05 }],
    exhaust: [{ u: -2.3, v: 0.48, z: 0.0 }],
    extras: ['lightStrips', 'spats'],
  },
};

// ---------------------------------------------------------------- materiais
const shared = {};
function sharedMats() {
  if (shared.glass) return shared;
  shared.glass = new THREE.MeshStandardMaterial({ color: 0x10141c, metalness: 0.2, roughness: 0.06 });
  shared.dark = new THREE.MeshStandardMaterial({ color: 0x1b1d22, metalness: 0.1, roughness: 0.65 });
  shared.chrome = new THREE.MeshStandardMaterial({ color: 0xd8dde4, metalness: 1.0, roughness: 0.15 });
  shared.head = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6dc, emissiveIntensity: 1.4 });
  shared.tail = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff1010, emissiveIntensity: 1.2 });
  shared.tire = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tireTexture(), roughness: 0.85, metalness: 0 });
  shared.helmet = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, metalness: 0.2, roughness: 0.25 });
  shared.flameOuter = new THREE.MeshBasicMaterial({ color: 0xff7a1a, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false });
  shared.flameInner = new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  shared.blob = new THREE.MeshBasicMaterial({ map: glowTexture('rgba(0,0,0,0.55)', 'rgba(0,0,0,0)'), transparent: true, depthWrite: false });
  return shared;
}

function roundelTexture(num) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.font = 'italic 900 64px "Arial Black", Impact, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(num, 64, 68);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------------ montagem
export const CAR_IDS = Object.keys(DEFS);

export function carDims(id) {
  const d = DEFS[id];
  const top = d.top;
  return { length: top[top.length - 1][0] - top[0][0], width: d.width + (d.wheel.outside || 0) * 2 };
}

export function buildCar(id, look = {}) {
  const def = DEFS[id] || DEFS.faisca;
  const M = sharedMats();
  const group = new THREE.Group();
  group.name = 'car-' + id;
  const paintDef = PAINTS.find((p) => p.id === look.paint) || PAINTS[0];
  const paint = new THREE.MeshStandardMaterial({ color: paintDef.color, metalness: paintDef.metal, roughness: paintDef.rough });
  const accentColor = new THREE.Color(paintDef.color).getHSL({}).l > 0.6 ? 0x16181c : 0xf4f4f4;
  const accent = new THREE.MeshStandardMaterial({ color: accentColor, metalness: 0.2, roughness: 0.35 });
  const W = def.width;
  const wh = def.wheel;
  const lists = { paint: [], accent: [], glass: [], dark: [], chrome: [], head: [], tail: [], helmet: [] };

  // carroceria
  const arches = def.noArches
    ? []
    : wh.u.map((u, i) => {
        const r = (i === 0 ? wh.rearR || wh.r : wh.r) + 0.07;
        return { u, r, c: (i === 0 ? wh.rearR || wh.r : wh.r) };
      });
  const prof = sideProfile(def.top, def.base, arches);
  lists.paint.push(extrudeSide(prof, W, def.taper, 0.07));
  // saia/para-choques escuros
  if (def.trim) {
    const low = clipBelow(prof, def.trim);
    if (low.length > 2) lists.dark.push(extrudeSide(low, W + 0.03, { ...def.taper, top: 0 }, 0.05));
  }
  // cabine
  if (def.cabin) {
    const cw = W * def.cabinW;
    const cab = def.cabin.map(([u, v]) => new THREE.Vector2(u, v));
    const vMin = Math.min(...def.cabin.map((p) => p[1]));
    const vMax = Math.max(...def.cabin.map((p) => p[1]));
    lists.glass.push(extrudeSide(cab, cw, { top: 0.32, topFrom: vMin, topTo: vMax }, 0.06));
    // teto pintado sobre o vidro
    const roofPts = def.cabin.filter((p) => p[1] > vMax - 0.06);
    if (roofPts.length >= 2) {
      roofPts.sort((a, b) => a[0] - b[0]);
      const u0 = roofPts[0][0] + 0.12;
      const u1 = roofPts[roofPts.length - 1][0] - 0.1;
      const roof = [
        [u0, vMax - 0.02],
        [u1, vMax - 0.02],
      ];
      const g = bandAlong(roof, cw * 0.62, 0, 0.055, 0.04);
      lists.paint.push(g);
    }
  }
  // grade
  if (def.grille) lists.dark.push(box(def.grille.w, def.grille.h, 0.06, 0, def.grille.v, -def.grille.u));

  // luzes
  for (const l of def.head) {
    if (l.z === 0) lists.head.push(box(l.w, l.h, 0.06, 0, l.v, -l.u));
    else for (const s of [-1, 1]) lists.head.push(box(l.w, l.h, 0.06, s * l.z, l.v, -l.u));
  }
  for (const l of def.roundLights || []) {
    for (const s of [-1, 1]) {
      const g = new THREE.CylinderGeometry(l.r, l.r, 0.08, 16);
      g.rotateX(Math.PI / 2);
      g.translate(s * l.z, l.v, -l.u);
      lists.head.push(g.toNonIndexed());
    }
  }
  for (const l of def.tail) {
    if (l.z === 0) lists.tail.push(box(l.w, l.h, 0.06, 0, l.v, -l.u));
    else for (const s of [-1, 1]) lists.tail.push(box(l.w, l.h, 0.06, s * l.z, l.v, -l.u));
  }
  // escapamentos
  const exhausts = [];
  for (const e of def.exhaust) {
    const g = new THREE.CylinderGeometry(0.07, 0.08, 0.3, 10, 1, true);
    g.rotateX(Math.PI / 2);
    g.translate(e.z, e.v, -e.u + 0.05);
    lists.chrome.push(g.toNonIndexed());
    exhausts.push(new THREE.Vector3(e.z, e.v, -e.u + 0.2));
  }

  // extras
  const ex = new Set(def.extras);
  const topY = (u) => {
    // altura do contorno superior em u
    const t = def.top;
    for (let i = 0; i < t.length - 1; i++) {
      const [u0, v0] = t[i];
      const [u1, v1] = t[i + 1];
      if ((u - u0) * (u - u1) <= 0 && u1 !== u0) return v0 + ((u - u0) / (u1 - u0)) * (v1 - v0);
    }
    return 0.9;
  };
  const rearU = def.top[0][0];
  const frontU = def.top[def.top.length - 1][0];
  if (ex.has('roofSpoiler')) lists.dark.push(box(W * 0.7, 0.05, 0.3, 0, 1.44, 1.3, 0.22));
  if (ex.has('lipSpoiler')) lists.paint.push(box(W * 0.8, 0.06, 0.22, 0, topY(-2.0) + 0.06, 2.02, -0.25));
  if (ex.has('ducktail')) lists.paint.push(box(W * 0.84, 0.08, 0.3, 0, 1.02, 2.18, -0.3));
  if (ex.has('scoop')) {
    lists.dark.push(box(0.56, 0.16, 0.8, 0, 1.06, -1.25));
    lists.chrome.push(box(0.44, 0.1, 0.04, 0, 1.06, -1.66));
  }
  if (ex.has('stripes'))
    for (const s of [-1, 1]) {
      lists.accent.push(bandAlong(def.top.filter((p) => p[1] > 0.9), 0.2, s * 0.2));
      lists.accent.push(bandAlong(def.cabin.filter((p) => p[1] > 1.3), 0.2, s * 0.2));
    }
  if (ex.has('stripesCenter')) {
    lists.accent.push(bandAlong(def.top.filter((p) => p[1] > 0.85), 0.34, 0));
  }
  if (ex.has('lowWing') || ex.has('bigWing') || ex.has('lmWing')) {
    const big = ex.has('bigWing');
    const lm = ex.has('lmWing');
    const h = big ? 1.36 : lm ? 1.12 : 1.06;
    const u = rearU + (big ? 0.28 : lm ? 0.12 : 0.22);
    const span = lm ? W * 1.0 : W * 0.88;
    lists.dark.push(box(span, 0.05, 0.42, 0, h, -u, -0.08));
    if (lm) {
      for (const s of [-1, 1]) lists.paint.push(box(0.05, 0.42, 0.8, s * (span / 2), h - 0.14, -u - 0.1));
    } else {
      for (const s of [-1, 1]) {
        lists.dark.push(box(0.04, 0.24, 0.48, s * (span / 2), h + 0.04, -u));
        lists.dark.push(tube([s * 0.42, topY(u + 0.15) - 0.02, -(u + 0.1)], [s * 0.42, h, -u], 0.03));
      }
    }
  }
  if (ex.has('fin')) {
    const pts = [
      [-0.6, 1.0],
      [rearU + 0.15, 1.18],
      [rearU + 0.1, 0.9],
      [-0.6, 0.9],
    ].map(([u, v]) => new THREE.Vector2(u, v));
    lists.paint.push(extrudeSide(pts, 0.04, {}, 0));
  }
  if (ex.has('splitter')) lists.dark.push(box(W * 0.9, 0.04, 0.3, 0, 0.22, -(frontU - 0.1)));
  if (ex.has('intakes')) for (const s of [-1, 1]) lists.dark.push(box(0.04, 0.22, 0.6, s * (W / 2 - 0.04), 0.58, 0.55));
  if (ex.has('lightStrips')) {
    for (const s of [-1, 1]) lists.head.push(box(0.03, 0.03, 2.6, s * (W / 2 - 0.03), 0.5, 0.0));
  }
  if (ex.has('spats')) {
    // cobre parte da roda traseira
    const u = wh.u[0];
    const pts = [
      [u - 0.5, 0.3],
      [u + 0.5, 0.3],
      [u + 0.46, 0.62],
      [u - 0.46, 0.66],
    ].map(([a, b]) => new THREE.Vector2(a, b));
    for (const s of [-1, 1]) {
      const g = extrudeSide(pts, 0.06, {}, 0.02);
      g.translate(s * (W / 2 + 0.02), 0, 0);
      lists.paint.push(g);
    }
  }
  if (ex.has('roundel')) {
    const mat = new THREE.MeshStandardMaterial({ map: roundelTexture('70'), roughness: 0.4, transparent: true, alphaTest: 0.5 });
    for (const s of [-1, 1]) {
      const g = new THREE.CircleGeometry(0.3, 24);
      g.rotateY((s * Math.PI) / 2);
      const m = new THREE.Mesh(g, mat);
      m.position.set(s * (W / 2 + 0.005), 0.62, 0.15);
      group.add(m);
    }
  }
  if (ex.has('rollhoop')) lists.dark.push(tube([-0.35, 0.9, 1.1], [0.35, 0.9, 1.1], 0.04), tube([-0.35, 0.9, 1.1], [-0.3, 1.25, 1.1], 0.04), tube([0.35, 0.9, 1.1], [0.3, 1.25, 1.1], 0.04), tube([-0.3, 1.25, 1.1], [0.3, 1.25, 1.1], 0.04));
  if (ex.has('cage')) {
    const r = 0.04;
    const z = 0.56;
    const P = (u, v, s) => [s * z, v, -u];
    for (const s of [-1, 1]) {
      lists.dark.push(tube(P(-0.7, 0.9, s), P(-0.6, 1.62, s), r));
      lists.dark.push(tube(P(0.55, 0.9, s), P(0.2, 1.55, s), r));
      lists.dark.push(tube(P(-0.6, 1.62, s), P(0.2, 1.55, s), r));
      lists.dark.push(tube(P(-0.6, 1.62, s), P(-1.4, 0.95, s), r));
    }
    lists.dark.push(tube(P(-0.6, 1.62, -1), P(-0.6, 1.62, 1), r));
    lists.dark.push(tube(P(0.2, 1.55, -1), P(0.2, 1.55, 1), r));
    lists.dark.push(tube(P(-0.7, 0.9, -1), P(-0.6, 1.62, 1), r));
  }
  if (ex.has('lightbar')) {
    lists.dark.push(box(0.9, 0.08, 0.1, 0, 1.64, -0.2));
    for (let i = 0; i < 4; i++) lists.head.push(box(0.14, 0.07, 0.03, -0.33 + i * 0.22, 1.64, -0.26));
  }
  if (ex.has('bullbar')) {
    lists.chrome.push(tube([-0.5, 0.55, -1.86], [0.5, 0.55, -1.86], 0.045), tube([-0.4, 0.55, -1.86], [-0.3, 0.8, -1.72], 0.035), tube([0.4, 0.55, -1.86], [0.3, 0.8, -1.72], 0.035));
  }
  if (ex.has('spare')) {
    const g = new THREE.CylinderGeometry(0.34, 0.34, 0.22, 16);
    g.translate(0, 1.04, 1.25);
    const m = new THREE.Mesh(g, M.tire);
    m.castShadow = true;
    group.add(m);
  }
  if (ex.has('driver')) {
    const f1 = id === 'tufao';
    const g = new THREE.SphereGeometry(0.2, 16, 12);
    g.translate(0, f1 ? 0.92 : 1.15, f1 ? 0.35 : 0.15);
    lists.helmet.push(g.toNonIndexed());
    lists.glass.push(box(0.3, 0.07, 0.06, 0, f1 ? 0.94 : 1.17, f1 ? 0.18 : -0.02));
  }
  if (ex.has('halo')) {
    lists.dark.push(tube([-0.28, 0.82, 0.55], [-0.24, 1.08, 0.2], 0.03), tube([0.28, 0.82, 0.55], [0.24, 1.08, 0.2], 0.03), tube([-0.24, 1.08, 0.2], [0.24, 1.08, 0.2], 0.03), tube([0, 1.08, 0.2], [0, 0.72, -0.25], 0.03));
  }
  if (ex.has('sidepods')) {
    const pts = [
      [-0.95, 0.2],
      [0.75, 0.2],
      [0.75, 0.5],
      [0.45, 0.6],
      [-0.6, 0.6],
      [-1.0, 0.4],
    ].map(([u, v]) => new THREE.Vector2(u, v));
    for (const s of [-1, 1]) {
      const g = extrudeSide(pts, 0.46, { top: 0.25, topFrom: 0.4, topTo: 0.62 }, 0.05);
      g.translate(s * 0.62, 0, 0);
      lists.paint.push(g);
    }
  }
  if (ex.has('f1wings')) {
    // asa dianteira com placas laterais
    lists.paint.push(box(1.9, 0.04, 0.45, 0, 0.16, -2.35));
    lists.accent.push(box(1.7, 0.04, 0.22, 0, 0.24, -2.22, -0.2));
    for (const s of [-1, 1]) lists.dark.push(box(0.03, 0.18, 0.5, s * 0.95, 0.2, -2.35));
    // asa traseira
    lists.paint.push(box(1.3, 0.05, 0.4, 0, 1.0, 2.3, -0.1));
    lists.accent.push(box(1.3, 0.04, 0.26, 0, 1.12, 2.37, -0.3));
    for (const s of [-1, 1]) lists.dark.push(box(0.04, 0.5, 0.56, s * 0.66, 0.9, 2.32));
    lists.dark.push(box(0.08, 0.4, 0.1, 0, 0.72, 2.2));
  }

  // malhas por material
  const mats = { paint, accent, glass: M.glass, dark: M.dark, chrome: M.chrome, head: M.head, tail: M.tail, helmet: M.helmet };
  for (const k in lists) {
    if (!lists[k].length) continue;
    const g = mergeGeometries(lists[k]);
    const m = new THREE.Mesh(g, mats[k]);
    m.castShadow = k !== 'head' && k !== 'tail';
    group.add(m);
  }

  // rodas
  const wheels = [];
  const rimDef = RIMS.find((r) => r.id === look.rim) || RIMS[0];
  const rimMat = new THREE.MeshStandardMaterial({ map: rimTexture(rimDef.style, rimDef.color), metalness: 0.6, roughness: 0.3 });
  for (let i = 0; i < 2; i++) {
    const rear = i === 0;
    const r = rear ? wh.rearR || wh.r : wh.r;
    const w = rear ? wh.rearW || wh.w : wh.w;
    const u = wh.u[i];
    for (const s of [-1, 1]) {
      const x = s * (W / 2 - w / 2 - (wh.inset ?? 0) + (wh.outside || 0) + (wh.outside ? w / 2 : 0));
      const pivot = new THREE.Group();
      pivot.position.set(x, r, -u);
      const spin = new THREE.Group();
      pivot.add(spin);
      const tg = new THREE.CylinderGeometry(r, r, w, 22, 1);
      tg.rotateZ(Math.PI / 2);
      const tire = new THREE.Mesh(tg, M.tire);
      tire.castShadow = true;
      spin.add(tire);
      const rg = new THREE.CircleGeometry(r * 0.7, 24);
      rg.rotateY((s * Math.PI) / 2);
      const rim = new THREE.Mesh(rg, rimMat);
      rim.position.x = s * (w / 2 + 0.004);
      spin.add(rim);
      group.add(pivot);
      wheels.push({ pivot, spin, r, front: !rear });
    }
  }
  if (wh.rearCovered) {
    // a capa (spats) já cobre metade de cima; nada a fazer
  }

  // chamas do turbo
  const flames = [];
  for (const e of exhausts) {
    const og = new THREE.ConeGeometry(0.13, 1, 10, 1, true);
    og.rotateX(Math.PI / 2);
    og.translate(0, 0, 0.5);
    const ig = new THREE.ConeGeometry(0.07, 0.6, 8, 1, true);
    ig.rotateX(Math.PI / 2);
    ig.translate(0, 0, 0.3);
    const f = new THREE.Group();
    f.add(new THREE.Mesh(og, M.flameOuter));
    f.add(new THREE.Mesh(ig, M.flameInner));
    f.position.copy(e);
    f.visible = false;
    group.add(f);
    flames.push(f);
  }

  // sombra simples e neon
  const dims = carDims(id);
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(dims.width * 1.35, dims.length * 1.15), M.blob);
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = 0.03;
  blob.renderOrder = 1;
  group.add(blob);
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0.95 });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(dims.width * 2.1, dims.length * 1.5), glowMat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.05;
  glow.renderOrder = 2;
  group.add(glow);

  const car = {
    id,
    group,
    wheels,
    flames,
    paint,
    accent,
    rimMat,
    glow,
    glowMat,
    neon: null,
    dims,
    t: 0,
    setPaint(pid) {
      const p = PAINTS.find((x) => x.id === pid) || PAINTS[0];
      paint.color.setHex(p.color);
      paint.metalness = p.metal;
      paint.roughness = p.rough;
      accent.color.setHex(new THREE.Color(p.color).getHSL({}).l > 0.6 ? 0x16181c : 0xf4f4f4);
    },
    setRim(rid) {
      const r = RIMS.find((x) => x.id === rid) || RIMS[0];
      rimMat.map = rimTexture(r.style, r.color);
      rimMat.needsUpdate = true;
    },
    setNeon(nid) {
      const n = NEONS.find((x) => x.id === nid) || NEONS[0];
      this.neon = n.color;
      glow.visible = !!n.color;
      if (n.color && n.color !== 'rainbow') glowMat.color.setHex(n.color);
    },
    // spin: rotação das rodas; steer: -1..1; boost: 0..1
    animate(dt, speed, steer, boost) {
      this.t += dt;
      for (const w of wheels) {
        w.spin.rotation.x -= (speed * dt) / w.r;
        if (w.front) w.pivot.rotation.y = -steer * 0.38;
      }
      const on = boost > 0.05;
      for (const f of flames) {
        f.visible = on;
        if (on) {
          const k = 0.7 + Math.random() * 0.5;
          f.scale.set(k, k, (0.6 + boost * 0.9) * (0.8 + Math.random() * 0.4));
        }
      }
      if (this.neon === 'rainbow') glowMat.color.setHSL((this.t * 0.25) % 1, 1, 0.55);
    },
    dispose() {
      group.traverse((o) => {
        if (o.isMesh && o.geometry) o.geometry.dispose();
      });
      paint.dispose();
      accent.dispose();
      rimMat.dispose();
      glowMat.dispose();
    },
  };
  car.setNeon(look.neon || 'nenhum');
  return car;
}

export function clampSteer(x) {
  return clamp(x, -1, 1);
}

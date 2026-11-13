// Capítulo 3 — A Serra da Aurora: mundo aberto (360 x 360 m). Estradas ligam o Campo
// Esperança (registro dos evacuados), a Pedreira (o Colosso e o crachá), a Represa da Aurora
// (geradores e defesa de 60 s), fazendas, a vila operária, a torre de rádio e, ao norte, a
// Siderúrgica Aurora, onde o Dr. Vidal guarda Helena e Bia. Três missões e o chefe final.
import * as THREE from 'three';
import { planeGeo, cylGeo, mergeGeos } from '../geo.js';
import { clamp, lerp, smoothstep, rand, easeInOut } from '../util.js';
import { mats } from '../models.js';
import { CHAPTER_TEXT, MISSIONS } from '../story.js';
import { tex } from '../textures.js';
import { LOOKS } from '../npc.js';
import {
  cityMats,
  building,
  room,
  wallSeg,
  car,
  truck,
  lampPost,
  jersey,
  sandbags,
  tent,
  bigTent,
  container,
  chainFence,
  rubble,
  burningCar,
  barrelFire,
  signMesh,
  groundBox,
  updateZones,
  resetZones,
  updateRoamers,
  resetRoamers,
  clearAround,
} from './common.js';

const B = { minX: -180, maxX: 180, minZ: -180, maxZ: 180 };
const CAMP = { x0: 88, x1: 134, z0: -64, z1: -16 };
const QUARRY = { x0: -152, x1: -98, z0: 6, z1: 58 };
const Q_ARENA = { x: -124, z: 32, r: 19 };
const POWER = { x: 140, z: 64 };
const SWITCHES = [
  { id: 's1', x: 146.6, z: 59.5 },
  { id: 's2', x: 146.6, z: 64 },
  { id: 's3', x: 146.6, z: 68.5 },
];
const SID = { gateZ: 110, x0: -60, x1: 60, z1: 182 };
const ARENA = { x: 0, z: 146, r: 20 };
const HEART = { x: 0, z: 162 };
const BUNKER = { x: 34, z: 152 };
const REGISTRY = { x: 122, z: -40 };

const ROADS = {
  main: { w: 8, pts: [[0, -182], [0, -130], [6, -95], [12, -55], [18, -15], [26, 25], [24, 60], [12, 88], [0, 112]] },
  east: { w: 6, pts: [[12, -55], [45, -50], [80, -42], [90, -40]] },
  dam: { w: 6, pts: [[110, -16], [118, 10], [128, 38], [131, 58]] },
  west: { w: 6, pts: [[18, -15], [-20, -12], [-55, 0], [-80, 18], [-100, 28]] },
  farm: { w: 5, pts: [[3, -125], [-30, -120], [-60, -112], [-88, -106]] },
  antenna: { w: 4, pts: [[24, 60], [-10, 78], [-42, 92]] },
};

// distância de um ponto a uma polilinha
function distRoad(x, z, pts) {
  let best = 1e9;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1],
      [bx, bz] = pts[i];
    const dx = bx - ax,
      dz = bz - az;
    const L2 = dx * dx + dz * dz;
    const t = clamp(((x - ax) * dx + (z - az) * dz) / L2, 0, 1);
    const d = Math.hypot(x - (ax + dx * t), z - (az + dz * t));
    if (d < best) best = d;
  }
  return best;
}
function nearRoad(x, z, extra = 0) {
  for (const k in ROADS) if (distRoad(x, z, ROADS[k].pts) < ROADS[k].w / 2 + extra) return true;
  return false;
}

// Locais (para não pôr árvores, grama e itinerantes em cima).
const PLACES = [
  { x: 111, z: -40, r: 34 }, // campo
  { x: -125, z: 32, r: 38 }, // pedreira
  { x: -96, z: -112, r: 30 }, // fazendas
  { x: 48, z: 42, r: 30 }, // vila
  { x: 0, z: 146, r: 70 }, // siderúrgica
  { x: 140, z: 60, r: 26 }, // represa
  { x: 6, z: -95, r: 16 }, // barreira
  { x: -45, z: 96, r: 14 }, // antena
  { x: 18, z: -18, r: 14 }, // posto
  { x: 0, z: -170, r: 12 }, // início
];
const inPlace = (x, z, extra = 0) => PLACES.some((p) => Math.hypot(x - p.x, z - p.z) < p.r + extra);

// ======================================================================= construção
function buildTerrain(w) {
  const M = w.M,
    C = cityMats();
  const g = planeGeo(B.maxX - B.minX + 40, B.maxZ - B.minZ + 40, 5);
  w.geo(g, M.ground, 0, 0, 0, 0, -Math.PI / 2, 0, { cast: false });
  // estradas: asfalto na principal, terra nas outras
  for (const k in ROADS) {
    const r = ROADS[k];
    const mat = k === 'main' ? C.asphalt : M.road;
    for (let i = 1; i < r.pts.length; i++) {
      const [ax, az] = r.pts[i - 1],
        [bx, bz] = r.pts[i];
      const L = Math.hypot(bx - ax, bz - az);
      const ry = Math.atan2(bx - ax, bz - az);
      w.box((ax + bx) / 2, 0.008 + (k === 'main' ? 0.004 : 0), (az + bz) / 2, r.w, 0.012, L + r.w * 0.6, mat, { ry, cast: false, tile: k === 'main' ? 6 : 4 });
      if (k === 'main') for (let t = 4; t < L - 2; t += 7) w.box(ax + ((bx - ax) * t) / L, 0.02, az + ((bz - az) * t) / L, 0.16, 0.012, 3, C.line, { ry, cast: false });
    }
  }
  // limites invisíveis
  w.wallInv(B.minX + 2, B.minZ, B.minX + 2, B.maxZ);
  w.wallInv(B.maxX - 2, B.minZ, B.maxX - 2, B.maxZ);
  w.wallInv(B.minX, B.minZ + 2, B.maxX, B.minZ + 2);
  w.wallInv(B.minX, B.maxZ - 2, B.maxX, B.maxZ - 2);
}

// Floresta com malhas instanciadas por pedaço do mapa (milhares de pinheiros sem custo).
function buildForest(w) {
  const M = w.M,
    r = w.rng;
  const trunk = cylGeo(0.12, 0.22, 2.4, 6, 2);
  trunk.translate(0, 1.2, 0);
  const cones = [];
  for (let i = 0; i < 4; i++) {
    const c = new THREE.ConeGeometry(2.1 - i * 0.42, 2.6, 7);
    c.rotateY(i * 0.9);
    c.translate(0, 2.2 + i * 1.5, 0);
    cones.push(c);
  }
  const crown = mergeGeos(cones);
  const byChunk = new Map();
  const m = new THREE.Matrix4(),
    q = new THREE.Quaternion(),
    e = new THREE.Euler(),
    p = new THREE.Vector3(),
    s = new THREE.Vector3();
  let n = 0,
    tries = 0;
  while (n < 1700 && tries < 20000) {
    tries++;
    const x = r.range(B.minX + 3, B.maxX - 3),
      z = r.range(B.minZ + 3, B.maxZ - 3);
    if (nearRoad(x, z, 4.5) || inPlace(x, z, 4)) continue;
    // clareiras: menos árvores em áreas abertas (campos)
    const field = Math.sin(x * 0.021) * Math.cos(z * 0.018) > 0.45;
    if (field && r.chance(0.85)) continue;
    const sc = r.range(0.85, 1.5);
    const k = w.chunk(x, z);
    if (!byChunk.has(k)) byChunk.set(k, []);
    e.set(0, r.range(0, Math.PI * 2), 0);
    q.setFromEuler(e);
    byChunk.get(k).push(m.compose(p.set(x, 0, z), q, s.set(sc, sc * r.range(0.9, 1.25), sc)).clone());
    w.col.addCircle(x, z, 0.3 * sc, { y0: 0, y1: 8, mat: 'wood' });
    n++;
  }
  for (const list of byChunk.values()) {
    for (const [geo, mat] of [
      [trunk, M.bark],
      [crown, M.pine],
    ]) {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((mm, i) => im.setMatrixAt(i, mm));
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
      im.castShadow = true;
      im.receiveShadow = true;
      w.root.add(im);
    }
  }
  // árvores secas e pedras (mais perto das estradas)
  let d = 0;
  tries = 0;
  while (d < 140 && tries < 4000) {
    tries++;
    const x = r.range(B.minX + 5, B.maxX - 5),
      z = r.range(B.minZ + 5, B.maxZ - 5);
    if (nearRoad(x, z, 3) || inPlace(x, z, 2)) continue;
    w.deadTree(x, z, r.range(0.8, 1.3), true);
    d++;
  }
  for (let i = 0; i < 160; i++) {
    const x = r.range(B.minX + 5, B.maxX - 5),
      z = r.range(B.minZ + 5, B.maxZ - 5);
    if (nearRoad(x, z, 2) || inPlace(x, z, 0)) continue;
    w.rock(x, z, r.range(0.6, 2.2));
  }
}

function buildStart(w) {
  const C = cityMats();
  // placa da serra e um carro do exército capotado
  signMesh(w, 'SERRA DA AURORA — SIDERÚRGICA 18 KM', 6, 2.2, -160, -Math.PI / 2, 4.4, 0.8, { bg: '#2a3a2a', fg: '#e0e0c8' });
  w.box(6.1, 1.1, -160, 0.12, 2.2, 0.12, C.pole, { col: true });
  car(w, -5.5, -150, 1.2, C.army, { burnt: true });
  barrelFire(w, -4, -144);
}

function buildRoadblock(w) {
  const C = cityMats();
  for (const x of [-1, 4, 9]) jersey(w, x + 6, -92, Math.PI / 2, 3.4);
  sandbags(w, 13, -99, 0, 5, 3);
  sandbags(w, -1, -99, 0, 5, 3);
  truck(w, 14, -88, 0.3);
  tent(w, -4, -104, 0.2);
  w.table(10, -97, 0, 1.6, 0.8);
  lampPost(w, 0.5, -90, Math.PI / 2, true, 0xc8d8ff);
  signMesh(w, 'OPERAÇÃO CERCA — PARE', 6, 2.3, -91.5, Math.PI, 3.6, 0.7, { bg: '#c8a018', fg: '#1a1a1a' });
}

function buildGasRuins(w) {
  const C = cityMats();
  for (const [a, b] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    w.box(24 + a * 4, 2.3, -22 + b * 3, 0.35, 4.6, 0.35, C.concrete, { col: true });
  w.box(24, 4.8, -22, 10, 0.5, 8, C.carRed, { rz: 0.06 });
  w.box(24, 0.7, -22, 0.7, 1.4, 0.5, C.carWhite, { col: true });
  building(w, 31, -26, 6, 5, 1, C.facade);
  burningCar(w, 14, -24, 2.3);
}

function buildCamp(w) {
  const C = cityMats(),
    M = w.M;
  const { x0, x1, z0, z1 } = CAMP;
  groundBox(w, (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, M.road, 4, 0.03);
  chainFence(w, x0, z0, x0, -44);
  chainFence(w, x0, -36, x0, z1);
  chainFence(w, x0, z0, x1, z0);
  chainFence(w, x1, z0, x1, z1);
  chainFence(w, x0, z1, 106, z1);
  chainFence(w, 114, z1, x1, z1);
  signMesh(w, 'CAMPO ESPERANÇA', x0 - 0.2, 3.4, -40, -Math.PI / 2, 5.5, 0.9, { bg: '#2e3a26', fg: '#e8e4c8' });
  for (const sz of [-1, 1]) w.box(x0 - 0.2, 1.7, -40 + sz * 4.2, 0.3, 3.4, 0.3, C.pole, { col: true });
  // barracas em fileiras
  for (const x of [96, 104])
    for (const z of [-58, -50, -30, -22]) tent(w, x, z, Math.PI / 2);
  bigTent(w, 128, -56, 0);
  bigTent(w, 128, -24, 0);
  // posto de comando: lona aberta com mesas (o registro fica aqui)
  for (const [a, b] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    w.box(REGISTRY.x + a * 3.2, 1.4, REGISTRY.z + b * 2.6, 0.12, 2.8, 0.12, C.pole, { col: true });
  w.box(REGISTRY.x, 2.85, REGISTRY.z, 7, 0.08, 5.8, C.tarp, { rz: 0.04 });
  w.table(REGISTRY.x, REGISTRY.z, 0, 1.8, 0.9);
  w.table(REGISTRY.x + 2, REGISTRY.z + 1.6, Math.PI / 2, 1.6, 0.8);
  w.chair(REGISTRY.x, REGISTRY.z - 0.9, 0, true);
  w.box(REGISTRY.x - 2.4, 0.5, REGISTRY.z - 1.8, 0.8, 1.0, 0.6, C.carGreen, { col: true, cm: 'metal' });
  w.anchors.registry = { x: REGISTRY.x, y: 0.86, z: REGISTRY.z };
  w.anchors.noteSoldado = { x: REGISTRY.x + 2, y: 0.86, z: REGISTRY.z + 1.6 };
  // caminhões, contêineres, sacos de areia, torres
  truck(w, 116, -60, 0);
  truck(w, 92, -24, Math.PI);
  container(w, 118, -20, Math.PI / 2, 0x3a4a2a);
  container(w, 131, -40, 0, 0x4a3a2a);
  for (const [x, z, ry] of [
    [112, -46, 0],
    [112, -34, 0],
    [94, -44, Math.PI / 2],
  ])
    sandbags(w, x, z, ry, 4, 3);
  for (const [x, z] of [
    [x0 + 2, z0 + 2],
    [x1 - 2, z1 - 2],
  ]) {
    for (const [a, b] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      w.box(x + a * 1.1, 2.6, z + b * 1.1, 0.16, 5.2, 0.16, M.woodDark, { col: true });
    w.box(x, 5.2, z, 2.8, 0.15, 2.8, M.woodDark, {});
    w.box(x, 5.8, z, 2.8, 1.0, 0.08, M.woodDark, {});
  }
  barrelFire(w, 108, -40);
  lampPost(w, 118, -32, 0, true, 0xc8d8ff);
}

function buildFarms(w) {
  const M = w.M;
  w.house({ x: -100, z: -100, w: 8, d: 6.5, rot: Math.PI, enter: true, wall: 'wood', windows: [{ f: 'front', u: -2.4, lit: 2 }, { f: 'left', u: 0 }] });
  w.house({ x: -82, z: -124, w: 7, d: 6, rot: Math.PI / 2, wall: 'stone', windows: [{ f: 'front', u: 2 }] });
  w.house({ x: -114, z: -126, w: 8, d: 6, rot: -Math.PI / 2, enter: true, wall: 'wood', windows: [{ f: 'front', u: 2.2, lit: 1 }] });
  // celeiro
  w.box(-74, 3, -96, 12, 6, 9, M.woodDark, { col: true, cm: 'wood', tile: 2.5 });
  w.box(-74, 6.6, -96, 12.6, 1.2, 9.6, M.roofWood, { tile: 2 });
  w.box(-74, 1.6, -91.4, 4, 3.2, 0.1, M.wood, { tile: 1 });
  // moinho
  w.cyl(-122, 5, -92, 0.9, 1.4, 10, M.stone, { col: true, seg: 10, tile: 2.5 });
  for (let i = 0; i < 4; i++) w.box(-122, 9.6, -90.6, 0.3, 7, 0.08, M.wood, { rz: (i * Math.PI) / 2 + 0.4 });
  // cercas, feno, carroças, poço
  w.fence(-110, -88, -86, -88);
  w.fence(-130, -134, -100, -134);
  w.fence(-130, -134, -130, -108);
  for (const [x, z, r] of [
    [-90, -92, 0.3],
    [-88, -95, 1.2],
    [-104, -116, 0.6],
  ])
    w.hay(x, z, r);
  w.cart(-92, -116, 0.9);
  w.cyl(-96, 0.5, -114, 0.9, 0.9, 1.0, M.stone, { col: true, seg: 12 });
  w.fires.push({ x: -100, y: 0.4, z: -94.6, size: 0.6, rate: 10, acc: 0, embers: true });
  w.light(-100, 1.2, -94.6, 0xff9a40, 12, 10, 0.3, 4);
}

function buildVillage(w) {
  const M = w.M,
    C = cityMats();
  for (const x of [36, 46, 56, 66]) {
    w.house({ x, z: 30, w: 7, d: 5.5, rot: 0, wall: x % 20 === 6 ? 'stone' : 'plaster', windows: [{ f: 'front', u: 1.8 }] });
    if (x !== 46) w.house({ x, z: 52, w: 7, d: 5.5, rot: Math.PI, wall: 'plaster', windows: [{ f: 'front', u: -1.8 }] });
  }
  // posto de saúde (com o diário do Dr. Vidal)
  room(w, { x: 46, z: 54, w: 9, d: 7, h: 3.4, door: { side: 's', at: 0, width: 2.2 }, wall: C.concrete });
  signMesh(w, 'POSTO DE SAÚDE', 46, 3.0, 50.4, Math.PI, 3.2, 0.6, { bg: '#e0e0d8', fg: '#2a5a3a', w: 512, h: 128 });
  w.table(48, 56, 0, 1.4, 0.8);
  w.box(43.2, 0.4, 55.5, 0.9, 0.5, 2.0, C.tarp, { col: true, cm: 'wood' });
  w.anchors.noteVidal1 = { x: 48, y: 0.86, z: 56 };
  groundBox(w, 51, 41, 40, 6, w.M.road, 4, 0.02);
  barrelFire(w, 60, 41.5);
  car(w, 40, 43, 1.5);
  burningCar(w, 52, 39, 1.7);
  lampPost(w, 44, 44, Math.PI, false);
  lampPost(w, 62, 38, 0, true);
}

function buildAntenna(w) {
  const C = cityMats(),
    M = w.M;
  for (const [a, b] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    w.box(-45 + a * 1.2, 15, 98 + b * 1.2, 0.18, 30, 0.18, C.pole, { col: true, rx: -b * 0.035, rz: a * 0.035 });
  for (let y = 3; y < 30; y += 3) w.box(-45, y, 98, 2.6 - y * 0.06, 0.1, 2.6 - y * 0.06, C.pole, {});
  w.box(-45, 30.5, 98, 0.4, 1, 0.4, C.lampOn, { cast: false });
  w.light(-45, 30, 98, 0xff2a20, 6, 18, 0.5);
  w.house({ x: -38, z: 92, w: 5, d: 4, rot: Math.PI / 2, enter: true, wall: 'wood', chimney: false, windows: [] });
  w.table(-37.6, 92, 0, 1.2, 0.7);
}

function buildQuarry(w) {
  const M = w.M,
    C = cityMats(),
    r = w.rng;
  const { x0, x1, z0, z1 } = QUARRY;
  groundBox(w, (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, M.stone, 5, 0.03);
  // paredões de pedra (com a entrada a leste)
  const cliff = (ax, az, bx, bz) => {
    const L = Math.hypot(bx - ax, bz - az);
    const ry = Math.atan2(bx - ax, bz - az);
    w.box((ax + bx) / 2, 7, (az + bz) / 2, 5, 14, L + 4, M.rock, { ry, col: true, tile: 4 });
    const n = Math.ceil(L / 6);
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      w.geo(new THREE.DodecahedronGeometry(1, 0), M.rock, ax + (bx - ax) * t + r.range(-1, 1), r.range(10, 15), az + (bz - az) * t + r.range(-1, 1), r.range(0, 3), r.range(0, 1), 0, { sx: r.range(3, 5), sy: r.range(2, 4), sz: r.range(3, 5) });
    }
  };
  cliff(x0, z0, x1, z0);
  cliff(x0, z1, x1, z1);
  cliff(x0, z0, x0, z1);
  cliff(x1, z0, x1, 24);
  cliff(x1, 32, x1, z1);
  // escavadeira destruída, esteira, pilhas de cascalho
  w.box(-138, 1.6, 46, 4, 2.4, 6, C.yellow, { col: true, cm: 'metal', ry: 0.4 });
  w.box(-138, 3.4, 46, 3, 1.6, 3, C.yellow, { ry: 0.4 });
  w.box(-134.5, 3.2, 49, 0.6, 0.6, 7, C.yellow, { ry: 0.4, rx: 0.5 });
  for (const [x, z, s] of [
    [-112, 14, 3],
    [-146, 26, 4],
    [-118, 52, 3.5],
    [-130, 14, 2.5],
  ]) {
    w.geo(new THREE.ConeGeometry(s, s * 0.9, 9), M.rock, x, s * 0.45, z, r.range(0, 3), 0, 0, {});
    w.col.addCircle(x, z, s * 0.8, { y0: 0, y1: s * 0.9, mat: 'stone' });
  }
  for (let i = 0; i < 6; i++) w.box(-104 - i * 4, 2 + i * 0.6, 50, 1.4, 0.3, 4.2, C.pole, { ry: 0, rx: 0 });
  // pilares de pedra para se proteger do Colosso
  for (const [x, z] of [
    [-116, 24],
    [-132, 40],
    [-128, 22],
    [-114, 40],
  ])
    w.box(x, 2.2, z, 2.2, 4.4, 2.2, M.rock, { col: true, ry: r.range(0, 1), tile: 2 });
  // cabine na entrada (fora do buraco)
  container(w, -90, 40, 0, 0x6a5a2a);
  w.anchors.noteEngenheiro = { x: -88.2, y: 0.02, z: 36 };
  // corpo do engenheiro (o crachá aparece depois do chefe)
  w.box(-142, 0.12, 18, 0.5, 0.24, 1.7, C.tarpBlue, {});
  w.anchors.badge = { x: -141.2, y: 0.02, z: 18.6 };
  lampPost(w, -94, 22, -Math.PI / 2, true);
  signMesh(w, 'PEDREIRA AURORA', -96.6, 3, 33.8, -Math.PI / 2, 3.6, 0.7, { bg: '#5a4a2a', fg: '#e8e0c8' });
}

function buildDam(w) {
  const C = cityMats();
  // paredão da represa
  w.box(162, 13, 65, 8, 26, 160, C.concrete, { col: true, tile: 6 });
  for (let z = -10; z <= 140; z += 10) w.box(158, 13, z, 0.6, 26, 0.8, C.concreteDark, { tile: 3 });
  w.box(162, 26.5, 65, 9, 1, 161, C.roofTop, { tile: 3 });
  // casa de força
  room(w, { x: POWER.x, z: POWER.z, w: 16, d: 12, h: 5, door: { side: 'w', at: 0, width: 3 }, wall: C.concrete });
  signMesh(w, 'USINA DA REPRESA AURORA', 131.7, 4.2, POWER.z, -Math.PI / 2, 7, 0.9, { bg: '#1e2a3a', fg: '#d8e0e8' });
  for (const s of SWITCHES) {
    w.box(s.x + 0.6, 1.2, s.z, 0.4, 2.0, 1.4, C.carGreen, { col: true, cm: 'metal' });
    w.box(s.x + 0.38, 1.6, s.z, 0.05, 0.5, 0.8, C.darkGlass, {});
  }
  // turbinas
  for (const z of [60.6, 67.4]) w.cyl(138.5, 1.1, z, 1.1, 1.1, 2.2, C.carYellow, { col: true, seg: 14 });
  // atrás do paredão: fechado (o reservatório fica do outro lado)
  w.wallInv(157, -15, 179, -15);
  w.wallInv(157, 145, 179, 145);
  // torres de transmissão até a siderúrgica
  for (const [x, z] of [
    [120, 80],
    [90, 98],
    [60, 108],
  ]) {
    w.box(x, 9, z, 0.5, 18, 0.5, C.pole, { col: true });
    w.box(x, 17.5, z, 6, 0.3, 0.3, C.pole, { ry: 0.8 });
  }
}

function buildSiderurgica(w) {
  const C = cityMats(),
    M = w.M;
  const z0 = SID.gateZ;
  // cerca com o portão central
  chainFence(w, SID.x0, z0, -7, z0, 3.2);
  chainFence(w, 7, z0, SID.x1, z0, 3.2);
  chainFence(w, SID.x0, z0, SID.x0, SID.z1, 3.2);
  chainFence(w, SID.x1, z0, SID.x1, SID.z1, 3.2);
  chainFence(w, SID.x0, SID.z1, SID.x1, SID.z1, 3.2);
  for (const sx of [-1, 1]) w.box(sx * 7.6, 3, z0, 1.2, 6, 1.2, C.concrete, { col: true });
  w.box(0, 6.4, z0, 16.4, 0.8, 1.2, C.concrete, {});
  signMesh(w, 'SIDERÚRGICA AURORA', 0, 7.5, z0 - 0.62, Math.PI, 10, 1.3, { bg: '#3a1e14', fg: '#f0d0a0' });
  // guarita (diário do Dr. Vidal)
  room(w, { x: 14, z: 104, w: 5, d: 4, h: 3, door: { side: 'w', at: 0, width: 1.6 }, wall: C.brick });
  w.table(15, 104.4, 0, 1.2, 0.7);
  w.anchors.noteVidal2 = { x: 15, y: 0.86, z: 104.4 };
  w.box(12, 1.6, 102.05, 0.05, 0.9, 0.05, C.lampOn, { cast: false });
  // galpões
  for (const [x, z] of [
    [-40, 130],
    [40, 128],
    [-42, 166],
  ]) {
    w.box(x, 6, z, 26, 12, 18, w.M.iron, { col: true, tile: 4 });
    w.box(x, 12.4, z, 27, 0.8, 19, C.roofTop, { tile: 3 });
  }
  // alto-forno (o "coração")
  w.cyl(0, 6, 176, 7, 8, 12, w.M.rust, { col: true, seg: 18, tile: 3 });
  w.cyl(0, 22, 176, 4.5, 6.5, 20, w.M.rust, { seg: 16, tile: 3 });
  w.cyl(0, 38, 176, 2.8, 4.2, 12, w.M.iron, { seg: 14, tile: 3 });
  w.box(0, 3, 168.4, 4, 3, 0.4, M.molten, { cast: false });
  w.fires.push({ x: 0, y: 2.6, z: 167.6, size: 1.6, rate: 30, acc: 0, embers: true });
  w.light(0, 4, 166, 0xff6a20, 90, 30, 0.25, 15);
  w.light(0, 44, 176, 0xff5a1a, 60, 40, 0.2, 10);
  // chaminés com fumaça
  for (const x of [-24, 24]) {
    w.cyl(x, 25, 178, 1.8, 2.4, 50, C.concreteDark, { col: true, seg: 12, tile: 4 });
    w.fires.push({ x, y: 50, z: 178, size: 2.6, rate: 6, acc: 0, embers: false });
  }
  // esteiras suspensas
  w.box(-20, 10, 150, 32, 0.6, 2, C.pole, { ry: 0.5 });
  w.box(20, 10, 148, 34, 0.6, 2, C.pole, { ry: -0.6 });
  // bunker do Abrigo Têmpera
  w.box(BUNKER.x + 5, 2.2, BUNKER.z, 10, 4.4, 9, C.concrete, { col: true, tile: 3 });
  signMesh(w, 'ABRIGO TÊMPERA — NÍVEL 3', BUNKER.x - 0.05, 3.7, BUNKER.z, -Math.PI / 2, 4, 0.6, { bg: '#2a2a2e', fg: '#e8c040' });
  // pilhas de lingotes e caçambas (cobertura na arena)
  for (const [x, z] of [
    [-12, 138],
    [12, 136],
    [-14, 156],
    [14, 158],
  ])
    w.box(x, 1.1, z, 3.2, 2.2, 2, w.M.rust, { col: true, cm: 'metal', tile: 1.5 });
  w.anchors.noteHelena3 = { x: 27.4, y: 0.02, z: 150.6 };
  lampPost(w, -8, 116, 0, true, 0xffa040);
  lampPost(w, 8, 116, Math.PI, true, 0xffa040);
}

// ======================================================================= dados
const PICKUPS = [
  { id: 's1', type: 'tonic', n: 1, x: 2.5, z: -150 },
  { id: 's2', type: 'ammo_pistol', n: 12, x: -3, z: -140 },
  { id: 'b1', type: 'ammo_rifle', n: 4, x: 10.2, z: -97, y: 0.86 },
  { id: 'b2', type: 'ammo_smg', n: 25, x: 9.6, z: -96.8, y: 0.86 },
  { id: 'b3', type: 'medkit', n: 1, x: -4, z: -101 },
  { id: 'b4', type: 'grenade', n: 1, x: 13, z: -96 },
  { id: 'g1', type: 'molotov', n: 1, x: 22, z: -20 },
  { id: 'g2', type: 'molotov', n: 1, x: 22.6, z: -20.4 },
  { id: 'g3', type: 'ammo_shotgun', n: 6, x: 29, z: -23 },
  { id: 'c1', type: 'ammo_rifle', n: 4, x: 99.5, z: -37 },
  { id: 'c2', type: 'ammo_magnum', n: 4, x: 127.6, z: -52 },
  { id: 'c3', type: 'ammo_smg', n: 30, x: 115, z: -57 },
  { id: 'c4', type: 'grenade', n: 2, x: 104, z: -26 },
  { id: 'c5', type: 'medkit', n: 1, x: 120.2, z: -42.4 },
  { id: 'c6', type: 'tonic', n: 1, x: 96, z: -54 },
  { id: 'reg', type: 'mission_registry', n: 1, anchor: 'registry' },
  { id: 'f1', type: 'ammo_shotgun', n: 6, x: -100, z: -102 },
  { id: 'f2', type: 'tonic', n: 1, x: -114.4, z: -126.4 },
  { id: 'f3', type: 'molotov', n: 2, x: -76, z: -92 },
  { id: 'f4', type: 'ammo_pistol', n: 15, x: -96, z: -118 },
  { id: 'v1', type: 'ammo_smg', n: 25, x: 47.4, z: 55.5 },
  { id: 'v2', type: 'tonic', n: 1, x: 44.6, z: 56.4 },
  { id: 'v3', type: 'ammo_magnum', n: 3, x: 60, z: 44 },
  { id: 'v4', type: 'molotov', n: 1, x: 36, z: 41 },
  { id: 'a1', type: 'ammo_rifle', n: 5, x: -37.6, z: 91.6, y: 0.76 },
  { id: 'a2', type: 'ammo_magnum', n: 4, x: -44, z: 94 },
  { id: 'q1', type: 'ammo_rifle', n: 5, x: -88.4, z: 38.6 },
  { id: 'q2', type: 'medkit', n: 1, x: -88.4, z: 42 },
  { id: 'q3', type: 'grenade', n: 2, x: -92, z: 36 },
  { id: 'q4', type: 'ammo_shotgun', n: 8, x: -92.6, z: 43.2 },
  { id: 'p1', type: 'ammo_smg', n: 30, x: 134.5, z: 60 },
  { id: 'p2', type: 'ammo_rifle', n: 4, x: 134.5, z: 68 },
  { id: 'p3', type: 'tonic', n: 1, x: 141, z: 69.4 },
  { id: 'p4', type: 'molotov', n: 2, x: 136, z: 56.6 },
  { id: 'k1', type: 'medkit', n: 1, x: -4, z: 104 },
  { id: 'k2', type: 'ammo_magnum', n: 6, x: 4, z: 104 },
  { id: 'k3', type: 'ammo_rifle', n: 6, x: 13.6, z: 103.4, y: 0.86 },
  { id: 'k4', type: 'grenade', n: 2, x: -2, z: 120 },
  { id: 'k5', type: 'tonic', n: 2, x: 2, z: 120 },
  { id: 'k6', type: 'ammo_smg', n: 40, x: -6, z: 124 },
];

const CRATES = [
  { id: 'x1', x: 0.8, z: -102 },
  { id: 'x2', x: 126, z: -18, loot: 'ammo_rifle' },
  { id: 'x3', x: 92, z: -60 },
  { id: 'x4', x: -108, z: -96 },
  { id: 'x5', x: -70, z: -101, loot: 'molotov' },
  { id: 'x6', x: 70, z: 34 },
  { id: 'x7', x: -95, z: 46, loot: 'tonic' },
  { id: 'x8', x: 133, z: 76 },
  { id: 'x9', x: -50, z: 103 },
  { id: 'x10', x: 18, z: 116, loot: 'ammo_magnum' },
];

const DRUMS = [
  { id: 'd1', x: 20.5, z: -17 },
  { id: 'd2', x: 109, z: -52 },
  { id: 'd3', x: 54, z: 37 },
  { id: 'd4', x: -106, z: 16 },
  { id: 'd5', x: -140, z: 34 },
  { id: 'd6', x: 128, z: 50 },
  { id: 'd7', x: 126, z: 74 },
  { id: 'd8', x: -10, z: 142 },
  { id: 'd9', x: 10, z: 152 },
];

const NOTE_DEFS = [
  { id: 'soldado', anchor: 'noteSoldado' },
  { id: 'engenheiro', anchor: 'noteEngenheiro' },
  { id: 'vidal1', anchor: 'noteVidal1' },
  { id: 'vidal2', anchor: 'noteVidal2' },
  { id: 'helena3', anchor: 'noteHelena3' },
];

const CHECKPOINTS = {
  cp1: { x: 0, z: -168, yaw: 0 },
  camp: { x: 84, z: -40, yaw: Math.PI / 2 },
  quarry: { x: -88, z: 27, yaw: -Math.PI / 2 },
  dam: { x: 128, z: 64, yaw: Math.PI / 2 },
  gate: { x: 0, z: 100, yaw: 0 },
  furnace: { x: 0, z: 121, yaw: 0 },
};

const SOLDIER = { scale: 1.0, build: 'normal', skin: 0xa88e7c, infected: true, eyes: 0xff7a1e, shirt: 0x3e4a2c, pants: 0x3a4230, shoes: 0x141210, hat: 'cap', hatColor: 0x2e3a24, hairStyle: 'short', hair: 0x1a1512, longSleeves: true, shards: 2 };
const sol = (x, z, idle = 'idle', yaw = 0) => ({ k: 'v', x, z, idle, yaw, look: { ...SOLDIER, scale: 0.95 + ((x * 7 + z) % 10) / 100 } });

const ZONES = [
  { id: 'road', x: 4, z: -100, r: 34, list: [sol(6, -94, 'idle', 3), sol(-2, -100, 'wander'), { k: 'shield', x: 10, z: -104, idle: 'idle' }, { k: 'dog', x: 14, z: -110, idle: 'idle' }] },
  { id: 'gas', x: 22, z: -20, r: 30, list: [{ k: 'burner', x: 26, z: -20, idle: 'idle' }, { k: 'v', x: 16, z: -28, idle: 'wander' }, { k: 'dragger', x: 30, z: -16, idle: 'dormant' }] },
  { id: 'campOut', x: 80, z: -42, r: 34, list: [sol(78, -48, 'wander'), sol(74, -36, 'idle', 1.6), { k: 'dog', x: 70, z: -44, idle: 'idle' }, { k: 'dog', x: 71, z: -45.5, idle: 'idle' }] },
  { id: 'camp', x: 111, z: -40, r: 36, list: [sol(100, -46, 'idle', 1), sol(104, -36, 'wander'), sol(118, -50, 'talk', -1.6), sol(116, -50.4, 'talk', 1.6), { k: 'shield', x: 112, z: -40, idle: 'idle', yaw: -1.6 }, { k: 'shield', x: 120, z: -30, idle: 'idle' }, { k: 'screamer', x: 126, z: -46, idle: 'idle', yaw: -1.6 }, { k: 'dragger', x: 121, z: -38, idle: 'dormant' }, { k: 'runner', x: 130, z: -20, idle: 'idle' }] },
  { id: 'farms', x: -96, z: -110, r: 36, list: [{ k: 'v', x: -94, z: -100, idle: 'chop', weapon: 'axe', yaw: 1 }, { k: 'v', x: -86, z: -112, idle: 'wander', weapon: 'pitchfork' }, { k: 'v', x: -108, z: -118, idle: 'idle', female: true }, { k: 'dog', x: -80, z: -104, idle: 'idle' }, { k: 'dog', x: -81, z: -106, idle: 'idle' }, { k: 'dog', x: -79, z: -106.5, idle: 'idle' }, { k: 'dragger', x: -104, z: -108, idle: 'dormant' }, { k: 'bloater', x: -74, z: -88, idle: 'idle' }] },
  { id: 'village', x: 50, z: 42, r: 34, list: [{ k: 'bloater', x: 44, z: 40, idle: 'wander' }, { k: 'bloater', x: 62, z: 46, idle: 'idle' }, { k: 'spitter', x: 56, z: 34, idle: 'idle' }, { k: 'spitter', x: 38, z: 47, idle: 'idle' }, { k: 'v', x: 50, z: 43, idle: 'wander' }, { k: 'v', x: 66, z: 40, idle: 'idle', female: true }, { k: 'stalker', x: 46, z: 56, idle: 'idle' }, { k: 'dragger', x: 30, z: 41, idle: 'dormant' }] },
  { id: 'quarryOut', x: -88, z: 30, r: 30, list: [{ k: 'runner', x: -82, z: 20, idle: 'idle' }, { k: 'runner', x: -84, z: 36, idle: 'wander' }, { k: 'brute', x: -78, z: 28, idle: 'idle', yaw: 1.6 }, { k: 'v', x: -92, z: 46, idle: 'idle' }] },
  { id: 'dam', x: 132, z: 56, r: 34, list: [{ k: 'burner', x: 128, z: 48, idle: 'wander' }, { k: 'burner', x: 140, z: 76, idle: 'idle' }, { k: 'v', x: 124, z: 62, idle: 'idle' }, { k: 'v', x: 136, z: 44, idle: 'wander' }, { k: 'shield', x: 129, z: 70, idle: 'idle' }] },
  { id: 'antenna', x: -42, z: 94, r: 28, list: [{ k: 'v', x: -40, z: 98, idle: 'idle' }, { k: 'stalker', x: -48, z: 90, idle: 'idle' }, { k: 'dog', x: -36, z: 100, idle: 'idle' }] },
  { id: 'forestW', x: -60, z: -50, r: 30, list: [{ k: 'stalker', x: -58, z: -48, idle: 'idle' }, { k: 'stalker', x: -66, z: -56, idle: 'wander' }, { k: 'v', x: -52, z: -44, idle: 'wander' }] },
  { id: 'gate', x: 0, z: 100, r: 32, list: [{ k: 'burner', x: -6, z: 98, idle: 'idle' }, { k: 'burner', x: 8, z: 96, idle: 'wander' }, { k: 'runner', x: 18, z: 94, idle: 'idle' }, { k: 'runner', x: -18, z: 96, idle: 'idle' }, { k: 'brute', x: 0, z: 90, idle: 'idle' }] },
  { id: 'yard', x: 0, z: 130, r: 26, when: (L) => L.flags.gateOpen, list: [{ k: 'burner', x: -8, z: 132, idle: 'idle' }, { k: 'runner', x: 10, z: 134, idle: 'idle' }, { k: 'spitter', x: -16, z: 124, idle: 'idle' }, { k: 'shield', x: 6, z: 124, idle: 'idle', yaw: Math.PI }] },
];

const ROAM = {
  max: 6,
  cap: 24,
  allow: (L) => !L.flags.vidalArena && !L.c.defense,
  avoid: (x, z) => inPlace(x, z, 6),
  pick: (x, z) => {
    const r = Math.random();
    if (z > 70) return r < 0.4 ? 'burner' : r < 0.7 ? 'runner' : 'v';
    if (x < -40 && z < -40) return r < 0.5 ? 'dog' : r < 0.8 ? 'v' : 'dragger';
    if (nearRoad(x, z, 6)) return r < 0.4 ? 'runner' : r < 0.85 ? 'v' : 'spitter';
    return r < 0.35 ? 'stalker' : r < 0.6 ? 'dog' : r < 0.9 ? 'v' : 'bloater';
  },
};

// ======================================================================= missões e roteiro
function missionState(L) {
  const f = L.flags;
  return [
    { ...MISSIONS[3][0], done: !!f.m1, target: REGISTRY },
    { ...MISSIONS[3][1], done: !!f.m2, target: f.colossusDead ? { x: -141.2, z: 18.6 } : { x: -100, z: 28 } },
    { ...MISSIONS[3][2], done: !!f.m3, target: L.c.defense ? POWER : { x: 146, z: 64 } },
  ];
}

function missionDone(L, n, say) {
  const G = L.G,
    f = L.flags;
  if (f['m' + n]) return;
  f['m' + n] = true;
  G.audio.keyItem();
  G.ui.msg(`Missão cumprida: ${MISSIONS[3][n - 1].title}`, true);
  if (say) G.game.after(0.6, () => G.ui.say(say[0], say[1], 4.5));
  if (f.m1 && f.m2 && f.m3) G.game.after(5, () => G.ui.msg('O portão da Siderúrgica Aurora pode ser aberto. Vá para o norte.', true));
}

function spawnColossus(L) {
  const G = L.G;
  if (L.flags.colossusDead || L.c.colossus) return;
  L.c.colossus = G.enemies.spawn('colossus', -130, 42, { yaw: 2.4, arena: Q_ARENA });
}

function lockQuarry(L) {
  const G = L.G,
    c = L.c;
  L.flags.qArena = true;
  spawnColossus(L);
  const b = c.colossus;
  if (b) {
    G.enemies.boss = b;
    b.wake();
  }
  c.rockfall.visible = true;
  c.rockCol.enabled = true;
  c.anim.push({ k: 'rocks', t: 0, dur: 0.8 });
  G.audio.rumble({ x: QUARRY.x1, z: 28 }, 2);
  G.fx.shake(0.7);
  G.ui.bossIntro('O Colosso', 'Gervásio, operador da escavadeira');
  G.nav.rebuild(G.col, 0.38, { minX: QUARRY.x1 - 4, minZ: 20, maxX: QUARRY.x1 + 4, maxZ: 36 });
}

function spawnVidal(L) {
  const G = L.G;
  if (L.flags.vidalDead || L.c.vidal) return;
  L.c.vidal = G.enemies.spawn('vidal', 0, 158, { yaw: 0, arena: ARENA, heart: HEART });
}

function setGate(L, open) {
  const c = L.c;
  c.gateCol.enabled = !open;
  if (!open) {
    c.gateL.position.x = -3.6;
    c.gateR.position.x = 3.6;
  }
}

function powerOn(L, instant) {
  const G = L.G,
    c = L.c;
  for (const m of c.damLamps) m.material = c.lampOn;
  c.gateLamp.material = c.greenOn;
  if (!c.damLights.length) {
    for (const z of [10, 60, 110]) c.damLights.push(G.fx.lights.add({ x: 157, y: 24, z, color: 0xd8e8ff, intensity: 30, range: 30, flicker: 0.02, priority: 4 }));
    c.damLights.push(G.fx.lights.add({ x: POWER.x, y: 4.2, z: POWER.z, color: 0xcfe0ff, intensity: 14, range: 14, flicker: 0.05, priority: 6 }));
  }
  void instant;
}

function intro(L) {
  const G = L.G;
  G.heli.flyover(
    [
      [-160, 60, -60],
      [0, 50, 40],
      [170, 60, 120],
    ],
    24,
    {},
  );
  G.cutscene.play(
    [
      { cam: { pos: [3, 2.0, -172], look: [0, 1.6, -160], dur: 0.01 } },
      { cam: { pos: [-6, 9, -176], look: [4, 14, 150], dur: 6, async: true } },
      { say: ['Ryan', 'A Serra da Aurora.'], dur: 2.4 },
      { say: ['Ryan', 'O Campo Esperança fica a oeste, perto da represa. É lá que o rádio mandou todo mundo.'], dur: 4.0 },
      { cam: { pos: [10, 12, -150], look: [0, 30, 170], dur: 4 } },
      { say: ['Ryan', 'E lá no fundo, a Siderúrgica. O alto-forno ainda está aceso...'], dur: 3.4 },
      { say: ['Ryan', 'Alguém mantém aquele fogo queimando.'], dur: 2.6 },
      { cam: { pos: [1.2, 2.0, -173], look: [0, 1.4, -160], dur: 2.2 } },
      { say: ['Ryan', 'Helena. Bia. Estou chegando.'], dur: 2.6 },
    ],
    () => {
      G.heli.setAuto(HELI_ROUTES, [80, 140]);
      G.ui.msg('Mundo aberto: aperte M para ver o mapa e as missões.', true);
      G.game.leaveCutscene();
    },
  );
}

const HELI_ROUTES = [
  [
    [-190, 60, -40],
    [0, 48, 30],
    [190, 60, 100],
  ],
  [
    [190, 55, -150],
    [60, 45, -20],
    [-190, 60, 120],
  ],
  [
    [-60, 60, 200],
    [0, 46, 60],
    [80, 60, -200],
  ],
];

function powerScene(L) {
  const G = L.G;
  G.cutscene.play(
    [
      { cam: { pos: [126, 4, 40], look: [160, 22, 70], dur: 0.01 } },
      { do: () => powerOn(L) },
      { do: () => G.audio.rumble({ x: 150, z: 60 }, 2.5) },
      { wait: 1.2 },
      { cam: { pos: [70, 30, 70], look: [0, 6, 112], dur: 3.2 } },
      { say: ['Rádio', '...energia restabelecida na represa... portões da Siderúrgica destravados...'], dur: 3.4 },
      { say: ['Ryan', 'A luz do portão ficou verde. Agora falta o crachá.'], dur: 2.8 },
    ],
    () => {
      missionDone(L, 3, null);
      if (!G.player.dead) L.checkpoint('dam');
      G.game.leaveCutscene();
    },
  );
  void clearAround;
}

function gateScene(L) {
  const G = L.G,
    c = L.c;
  L.flags.gateOpen = true;
  setGate(L, true);
  c.anim.push({ k: 'gate', t: 0, dur: 3 });
  G.audio.rumble({ x: 0, z: SID.gateZ }, 3);
  G.audio.chain({ x: 0, z: SID.gateZ }, 10);
  G.nav.rebuild(G.col, 0.38, { minX: -9, minZ: SID.gateZ - 3, maxX: 9, maxZ: SID.gateZ + 3 });
  spawnVidal(L);
  G.cutscene.play(
    [
      { cam: { pos: [3, 2.2, 104], look: [0, 3, 115], dur: 0.01 } },
      { wait: 1.4 },
      { cam: { pos: [0, 12, 116], look: [0, 10, 170], dur: 4 } },
      { say: ['Alto-falante', 'Senhor Moraes. Eu estava esperando o senhor.'], dur: 3 },
      { say: ['Alto-falante', 'O Bento, o exército, o seu Gervásio... todos falharam com a Ferrugem. Eu não.'], dur: 4 },
      { say: ['Alto-falante', 'A sua filha é a chave de tudo. Venha buscá-la. Se conseguir.'], dur: 3.6 },
      { cam: { pos: [1.4, 1.9, 104.5], look: [0, 1.6, 112], dur: 1.6 } },
      { say: ['Ryan', 'Estou indo, doutor.'], dur: 2.2 },
    ],
    () => {
      if (!G.player.dead) L.checkpoint('furnace');
      G.game.leaveCutscene();
    },
  );
}

function lockFurnace(L) {
  const G = L.G;
  L.flags.vidalArena = true;
  spawnVidal(L);
  const v = L.c.vidal;
  if (v) {
    G.enemies.boss = v;
    v.wake();
  }
  G.ui.bossIntro('Dr. Augusto Vidal', 'Diretor do Projeto Têmpera');
  G.audio.sting();
}

function ending(L) {
  const G = L.G,
    N = G.npcs,
    c = L.c;
  L.flags.ending = true;
  clearAround(G, 0, 146, 80);
  G.proj.clear();
  const P = G.player;
  N.clear();
  const helena = N.spawn({ id: 'helena', name: 'Helena', look: LOOKS.helena, x: BUNKER.x + 2.5, z: BUNKER.z + 0.6, yaw: -Math.PI / 2 });
  const bia = N.spawn({ id: 'bia', name: 'Bia', look: LOOKS.bia, x: BUNKER.x + 2.5, z: BUNKER.z - 0.8, yaw: -Math.PI / 2 });
  helena.rig.root.visible = bia.rig.root.visible = false;
  P.pos.set(20, 0, 151);
  P.yaw = Math.PI / 2;
  G.cutscene.play(
    [
      { player: { walk: [[26.8, 151.6]], speed: 1.8 }, async: true },
      { cam: { pos: [21, 2.4, 147.5], look: [BUNKER.x, 1.8, BUNKER.z], dur: 0.01 } },
      { wait: 1.6 },
      { say: ['Ryan', 'Helena! Bia!'], dur: 2.0 },
      {
        do: () => {
          c.anim.push({ k: 'bunker', t: 0, dur: 2.4 });
          G.audio.rumble({ x: BUNKER.x, z: BUNKER.z }, 2.4);
          helena.rig.root.visible = bia.rig.root.visible = true;
        },
      },
      { wait: 2.4 },
      { npc: 'bia', walk: [[BUNKER.x - 2, BUNKER.z - 0.6], [28.2, 151.5]], speed: 3.2 },
      { player: { pose: 'hug', face: [28.2, 151.5] } },
      { npc: 'bia', mode: 'hug', face: [26.8, 151.6] },
      { cam: { pos: [27.6, 1.3, 153.4], look: [27.4, 0.9, 151.5], dur: 1.6 } },
      { say: ['Bia', 'Pai! Eu sabia que era você! Eu falei pra mamãe!'], dur: 3.2 },
      { npc: 'helena', walk: [[BUNKER.x - 2, BUNKER.z + 0.6], [28.6, 152.6]], speed: 1.6 },
      { npc: 'helena', face: [26.8, 151.6] },
      { cam: { pos: [25.2, 1.7, 154.2], look: [28.2, 1.4, 152.2], dur: 1.6 } },
      { say: ['Helena', 'Ryan... Você veio. Você atravessou tudo isso por nós.'], dur: 3.2 },
      { player: { pose: null } },
      { say: ['Ryan', 'Eu prometi, não prometi?'], dur: 2.4 },
      { say: ['Helena', 'O doutor... ele dizia que a Bia era a cura. Que o sangue dela recusa a Ferrugem.'], dur: 4.0 },
      { say: ['Ryan', 'Então ela é a cura de verdade. E agora ela vai crescer longe daqui.'], dur: 3.4 },
      // o helicóptero desce
      { do: () => G.heli.hoverAt(4, 24, 140, Math.PI) },
      { cam: { pos: [26, 1.6, 156], look: [8, 18, 140], dur: 2.4 } },
      { say: ['Alto-falante', 'Civis em solo, aqui é o Águia 3! Vimos a luz do alto-forno apagar. Fiquem onde estão!'], dur: 4.2 },
      { npc: 'bia', mode: 'wave' },
      { npc: 'helena', mode: 'wave' },
      { player: { pose: 'lookUp' } },
      { wait: 1.6 },
      { do: () => G.heli.hoverAt(4, 9, 140, Math.PI) },
      { cam: { pos: [34, 3, 160], look: [10, 6, 142], dur: 4 } },
      { say: ['Bia', 'Pai... a gente vai pra casa?'], dur: 2.6 },
      { player: { pose: null } },
      { say: ['Ryan', 'Vamos. Mas antes a gente desce num beco escuro em Ferrópolis.'], dur: 3.2 },
      { say: ['Ryan', 'Tem uns amigos esperando a gente lá. Com café requentado.'], dur: 3.2 },
      { npc: 'bia', walk: [[16, 145], [8, 141]], speed: 1.6, async: true },
      { npc: 'helena', walk: [[16, 146], [8, 142.4]], speed: 1.6, async: true },
      { player: { walk: [[17, 147], [9.6, 143.6]], speed: 1.6 }, async: true },
      { cam: { pos: [-16, 26, 120], look: [8, 6, 146], dur: 6 } },
      { wait: 4.5 },
      { fade: 1, dur: 1.6 },
    ],
    () => {
      G.game.victory();
    },
  );
}

// ======================================================================= capítulo
const FOG_A = new THREE.Color(0x131921);
const FOG_RED = new THREE.Color(0x2a1812);
const _redSky = new THREE.Color(0x6a3a2a);

const chapter3 = {
  id: 3,
  key: 'c3',
  seed: 9393,
  name: 'Capítulo 3',
  title: 'A Serra da Aurora',
  text: CHAPTER_TEXT[3],
  bounds: { minX: B.minX, minZ: B.minZ, maxX: B.maxX, maxZ: B.maxZ },
  far: 165,
  start: { x: 0, z: -168, yaw: 0 },
  firstCheckpoint: 'cp1',
  checkpoints: CHECKPOINTS,
  pickups: PICKUPS,
  crates: CRATES,
  drums: DRUMS,
  notes: NOTE_DEFS,
  sky: { top: 0x070a10, mountains: 0x0a0d12, mountainScale: 1.4, moonLight: 2.0, hemi: 1.85, hemiSky: 0x56688e, hemiGround: 0x2a2418 },
  grass: { minX: B.minX + 4, maxX: B.maxX - 4, minZ: B.minZ + 4, maxZ: B.maxZ - 4, count: 12000, skip: (x, z) => nearRoad(x, z, 0.5) || (z > SID.gateZ - 2 && Math.abs(x) < 62) || inPlace(x, z, -6) },

  build(w) {
    buildTerrain(w);
    buildStart(w);
    buildRoadblock(w);
    buildGasRuins(w);
    buildCamp(w);
    buildFarms(w);
    buildVillage(w);
    buildAntenna(w);
    buildQuarry(w);
    buildDam(w);
    buildSiderurgica(w);
    buildForest(w);
  },

  fog(px, pz, out) {
    const k = smoothstep(60, 120, pz) * (Math.abs(px) < 90 ? 1 : 0.4);
    out.color.copy(FOG_A).lerp(FOG_RED, k);
    out.density = 0.019 + k * 0.007;
  },

  hemi(px, pz, hemi) {
    const k = smoothstep(80, 140, pz) * (Math.abs(px) < 70 ? 1 : 0.3);
    if (k > 0) hemi.color.lerp(_redSky, k * 0.5);
  },

  surface(x, z, G) {
    if (G.world.isIndoor(x, z)) return 'wood';
    if (nearRoad(x, z, 0) || (z > SID.gateZ && Math.abs(x) < 60)) return 'stone';
    if (x > QUARRY.x0 && x < QUARRY.x1 && z > QUARRY.z0 && z < QUARRY.z1) return 'stone';
    return 'dirt';
  },

  map: {
    bounds: B,
    ground: '#1a1e18',
    shapes: [
      { t: 'rect', x: -125, z: 32, w: 54, d: 52, c: '#3a3832' },
      { t: 'rect', x: 111, z: -40, w: 46, d: 48, c: '#3a3e2e' },
      { t: 'rect', x: 0, z: 146, w: 120, d: 72, c: '#3e2a24' },
      { t: 'rect', x: 162, z: 65, w: 8, d: 160, c: '#5a5a5e' },
      { t: 'rect', x: 172, z: 65, w: 12, d: 200, c: '#1e3442' },
      { t: 'rect', x: 140, z: 64, w: 16, d: 12, c: '#2e3a52' },
      { t: 'circle', x: -96, z: -112, r: 22, c: '#2e3424' },
      { t: 'rect', x: 51, z: 41, w: 40, d: 30, c: '#33302c' },
      { t: 'line', w: 8, c: '#4a4c4e', pts: ROADS.main.pts },
      { t: 'line', w: 5, c: '#4a4232', pts: ROADS.east.pts },
      { t: 'line', w: 5, c: '#4a4232', pts: ROADS.dam.pts },
      { t: 'line', w: 5, c: '#4a4232', pts: ROADS.west.pts },
      { t: 'line', w: 4, c: '#4a4232', pts: ROADS.farm.pts },
      { t: 'line', w: 3, c: '#4a4232', pts: ROADS.antenna.pts },
    ],
    labels: [
      { text: 'Siderúrgica Aurora', x: 0, z: 140, c: '#e09060' },
      { text: 'Campo Esperança', x: 111, z: -40 },
      { text: 'Pedreira', x: -125, z: 32 },
      { text: 'Represa', x: 150, z: 90 },
      { text: 'Usina', x: 140, z: 52 },
      { text: 'Fazendas', x: -96, z: -112 },
      { text: 'Vila Operária', x: 51, z: 41 },
      { text: 'Torre de rádio', x: -45, z: 104 },
      { text: 'Barreira', x: 18, z: -95 },
    ],
  },

  mapMarkers(L) {
    const out = [];
    for (const m of missionState(L)) out.push({ x: m.target.x, z: m.target.z, kind: m.done ? 'done' : 'mission', label: m.title });
    if (L.flags.m1 && L.flags.m2 && L.flags.m3) out.push({ x: 0, z: SID.gateZ - 2, kind: 'target', label: 'Portão' });
    return out;
  },

  titleCam(t, cam) {
    const a = t * 0.03 + 0.4;
    cam.position.set(Math.sin(a) * 40, 14, 120 + Math.cos(a) * 30);
    cam.lookAt(0, 14, 172);
    return { x: 0, z: 140, yaw: a };
  },

  setup(L) {
    const G = L.G,
      col = G.col,
      c = L.c,
      root = L.root;
    const C = cityMats();
    // portão da siderúrgica (duas folhas que correm)
    const leaf = () => {
      const g = new THREE.Group();
      const frame = new THREE.Mesh(new THREE.BoxGeometry(7.2, 5, 0.15), C.chain);
      frame.position.y = 2.6;
      g.add(frame);
      for (const y of [0.2, 2.6, 5.0]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.15, 0.2), C.pole);
        b.position.y = y;
        b.castShadow = true;
        g.add(b);
      }
      for (const x of [-3.5, 0, 3.5]) {
        const b = new THREE.Mesh(new THREE.BoxGeometry(0.15, 5, 0.2), C.pole);
        b.position.set(x, 2.6, 0);
        b.castShadow = true;
        g.add(b);
      }
      return g;
    };
    c.gateL = leaf();
    c.gateR = leaf();
    c.gateL.position.set(-3.6, 0, SID.gateZ);
    c.gateR.position.set(3.6, 0, SID.gateZ);
    root.add(c.gateL, c.gateR);
    c.gateCol = col.addBox(0, SID.gateZ, 14.4, 0.6, 0, { y0: 0, y1: 5, mat: 'metal', shootThrough: true });
    // luz do leitor de crachá
    c.redOn = new THREE.MeshBasicMaterial({ color: 0xff3020, toneMapped: false });
    c.greenOn = new THREE.MeshBasicMaterial({ color: 0x30ff60, toneMapped: false });
    c.gateLamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.1), c.redOn);
    c.gateLamp.position.set(8.3, 2.2, SID.gateZ - 0.65);
    root.add(c.gateLamp);
    const reader = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.2), C.pole);
    reader.position.set(8.3, 1.4, SID.gateZ - 0.7);
    root.add(reader);
    // lâmpadas da represa
    c.lampOn = new THREE.MeshBasicMaterial({ color: 0xe0ecff, toneMapped: false });
    c.lampOff = new THREE.MeshStandardMaterial({ color: 0x2a2a2a });
    c.damLamps = [];
    c.damLights = [];
    for (let z = -6; z <= 136; z += 8) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.3, 0.6), c.lampOff);
      m.position.set(157.6, 26.2, z);
      root.add(m);
      c.damLamps.push(m);
    }
    // alavancas dos geradores
    c.levers = {};
    for (const s of SWITCHES) {
      const lv = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.5, 0.08), C.stripe);
      lv.position.set(s.x + 0.32, 1.2, s.z + 0.3);
      lv.rotation.x = 0.7;
      root.add(lv);
      c.levers[s.id] = { ...s, mesh: lv, progress: 0, done: false };
    }
    // desmoronamento na entrada da pedreira
    c.rockfall = new THREE.Group();
    const rm = w0Rock();
    for (let i = 0; i < 7; i++) {
      const m = new THREE.Mesh(new THREE.DodecahedronGeometry(rand(1.4, 2.2), 0), rm);
      m.position.set(QUARRY.x1 + rand(-1, 1), rand(1, 3.5), 24 + i * 1.3);
      m.castShadow = true;
      c.rockfall.add(m);
    }
    c.rockfall.visible = false;
    root.add(c.rockfall);
    c.rockCol = col.addBox(QUARRY.x1, 28, 4, 10, 0, { y0: 0, y1: 5, mat: 'stone' });
    // porta do bunker
    c.bunkerDoor = new THREE.Mesh(new THREE.BoxGeometry(0.25, 3, 2.4), mats().iron);
    c.bunkerDoor.position.set(BUNKER.x - 0.1, 1.5, BUNKER.z);
    c.bunkerDoor.castShadow = true;
    root.add(c.bunkerDoor);
  },

  apply(L) {
    const G = L.G,
      c = L.c,
      f = L.flags;
    c.anim = [];
    c.defense = null;
    c.colossus = null;
    c.vidal = null;
    resetZones(L);
    resetRoamers(L);
    G.npcs.clear();
    // portão
    setGate(L, !!f.gateOpen);
    if (f.gateOpen) {
      c.gateL.position.x = -10.8;
      c.gateR.position.x = 10.8;
    }
    c.gateLamp.material = f.m3 ? c.greenOn : c.redOn;
    for (const m of c.damLamps) m.material = c.lampOff;
    for (const l of c.damLights) G.fx.lights.remove(l);
    c.damLights = [];
    if (f.m3) powerOn(L, true);
    const sw = L.state.data.switches || (L.state.data.switches = {});
    for (const id in c.levers) {
      const lv = c.levers[id];
      lv.done = !!sw[id] || !!f.m3;
      lv.progress = lv.done ? 1 : 0;
      lv.mesh.rotation.x = lv.done ? -0.7 : 0.7;
    }
    // pedreira
    f.qArena = false;
    c.rockfall.visible = false;
    c.rockCol.enabled = false;
    if (f.colossusDead && !L.state.taken.badge) L.addPickup('badge', 'mission_badge', 1, -141.2, 0.02, 18.6, true);
    if (!f.colossusDead) spawnColossus(L);
    // siderúrgica
    f.vidalArena = false;
    if (f.gateOpen && !f.vidalDead) spawnVidal(L);
    c.bunkerDoor.position.y = 1.5;
    G.heli.setAuto(HELI_ROUTES, [80, 140]);
    // o chefe ativo para a barra de vida é escolhido ao entrar em cada arena
    G.enemies.boss = null;
  },

  onStart(L) {
    intro(L);
    return true;
  },

  update(L, dt) {
    const G = L.G,
      c = L.c,
      f = L.flags;
    for (const a of c.anim) {
      a.t += dt;
      const k = clamp(a.t / a.dur, 0, 1);
      if (a.k === 'gate') {
        const e = easeInOut(k);
        c.gateL.position.x = -3.6 - e * 7.2;
        c.gateR.position.x = 3.6 + e * 7.2;
      } else if (a.k === 'rocks') {
        c.rockfall.position.y = (1 - k * k) * 8;
      } else if (a.k === 'bunker') {
        c.bunkerDoor.position.y = 1.5 + easeInOut(k) * 3.2;
      }
    }
    c.anim = c.anim.filter((a) => a.t < a.dur);
    if (G.state === 'play') {
      updateZones(L, ZONES, dt);
      updateRoamers(L, ROAM, dt);
    }
    // defesa da usina
    const D = c.defense;
    if (D && G.state === 'play') {
      D.t -= dt;
      D.next -= dt;
      if (D.next <= 0 && D.t > 6) {
        D.wave++;
        D.next = 9;
        const pts = [
          [118, 40],
          [116, 84],
          [134, 92],
          [110, 62],
          [132, 34],
        ];
        const kinds = D.wave < 2 ? ['runner', 'v', 'v'] : D.wave < 4 ? ['runner', 'runner', 'burner', 'spitter'] : ['runner', 'runner', 'brute', 'screamer', 'v'];
        if (G.enemies.aliveCount() < 18)
          G.enemies.spawnGroup(
            kinds.map((k, i) => {
              const p = pts[(D.wave + i) % pts.length];
              return { k, x: p[0] + rand(-3, 3), z: p[1] + rand(-3, 3), idle: 'hunt' };
            }),
            10,
          );
      }
      if (D.t <= 0) {
        c.defense = null;
        powerScene(L);
      }
    }
  },

  triggers(L) {
    const G = L.G,
      P = G.player,
      f = L.flags;
    const x = P.pos.x,
      z = P.pos.z;
    // checkpoints de chegada
    if (!f.cpCamp && Math.hypot(x - 84, z + 40) < 8) {
      f.cpCamp = true;
      L.checkpoint('camp');
    }
    if (!f.cpQuarry && Math.hypot(x + 88, z - 27) < 9) {
      f.cpQuarry = true;
      L.checkpoint('quarry');
    }
    if (!f.cpDam && Math.hypot(x - 128, z - 64) < 8) {
      f.cpDam = true;
      L.checkpoint('dam');
    }
    if (!f.cpGate && Math.hypot(x, z - 100) < 10) {
      f.cpGate = true;
      L.checkpoint('gate');
    }
    // arena da pedreira
    if (!f.colossusDead && !f.qArena && x < QUARRY.x1 - 4 && x > QUARRY.x0 && z > QUARRY.z0 && z < QUARRY.z1) lockQuarry(L);
    // arena do alto-forno
    if (f.gateOpen && !f.vidalDead && !f.vidalArena && z > 127 && Math.abs(x) < 26) lockFurnace(L);
  },

  onCheckpointLoad(L, cp) {
    void L;
    void cp;
  },

  onPickup(L, p) {
    const G = L.G,
      P = G.player;
    if (p.type === 'mission_registry') {
      delete P.keys.mission_registry;
      P.notes.includes('registro') || P.notes.push('registro');
      missionDone(L, 1, ['Ryan', 'Abrigo Têmpera, na siderúrgica... Ele levou as duas. Aguenta, Bia.']);
      G.game.openNote('registro');
      if (!P.dead) G.game.after(0.5, () => L.checkpoint('camp'));
    }
    if (p.type === 'mission_badge') missionDone(L, 2, ['Ryan', 'Crachá nível 3. Agora o portão da siderúrgica me conhece.']);
  },

  onNoteRead(L, id) {
    const G = L.G;
    if (id === 'engenheiro') G.game.after(0.3, () => G.ui.say('Ryan', 'Joelhos e costas. Entendido.', 2.5));
  },

  interactables(L, consider) {
    const G = L.G,
      P = G.player,
      f = L.flags,
      c = L.c;
    if (!f.m3 && !c.defense) for (const id in c.levers) if (!c.levers[id].done) consider(c.levers[id], c.levers[id].x - 0.6, c.levers[id].z, 1.8, 'lever');
    if (!f.gateOpen && Math.hypot(P.pos.x - 8, P.pos.z - (SID.gateZ - 2)) < 6) consider({ id: 'gate' }, 8.3, SID.gateZ - 1.4, 2.4, 'gate');
  },

  prompt(L, best) {
    const f = L.flags;
    if (best.kind === 'lever') return { key: 'E', text: 'Religar o gerador (segure)', hold: best.obj.progress };
    if (best.kind === 'gate') return { key: 'E', text: f.m2 && f.m3 ? 'Passar o crachá e abrir o portão' : 'Examinar o leitor de crachá' };
    return null;
  },

  interact(L, best, inp) {
    const G = L.G,
      f = L.flags,
      c = L.c;
    if (best.kind === 'lever') {
      const lv = best.obj;
      if (!inp.held) return false;
      lv.progress = Math.min(1, lv.progress + inp.dt / 1.6);
      lv.mesh.rotation.x = 0.7 - lv.progress * 1.4;
      if (Math.random() < inp.dt * 6) G.audio.ratchet(lv);
      if (lv.progress >= 1 && !lv.done) {
        lv.done = true;
        L.state.data.switches[lv.id] = true;
        G.audio.chain(lv, 4);
        const n = Object.values(c.levers).filter((v) => v.done).length;
        if (n < 3) G.ui.msg(`Gerador religado (${n}/3).`);
        else {
          G.ui.msg('Os três geradores estão girando! Aguente até a energia voltar!', true);
          G.audio.sting();
          c.defense = { t: 60, next: 2, wave: 0 };
        }
      }
      return false;
    }
    if (best.kind === 'gate' && inp.pressed) {
      if (f.m2 && f.m3) gateScene(L);
      else if (!f.m3 && !f.m2) G.ui.msg('O leitor está apagado. Sem energia e sem crachá, o portão não abre.');
      else if (!f.m3) G.ui.msg('O leitor está apagado: falta energia. Religue os geradores da represa.');
      else G.ui.msg('O leitor pede um crachá de acesso nível 3.');
      return true;
    }
    return false;
  },

  objective(L) {
    const G = L.G,
      P = G.player,
      f = L.flags,
      c = L.c;
    if (f.vidalDead) return { text: 'Encontre Helena e Bia no Abrigo Têmpera', target: BUNKER };
    if (f.vidalArena) {
      const b = G.enemies.boss;
      return { text: 'Derrote o Dr. Vidal', target: b && b.alive ? { x: b.pos.x, z: b.pos.z } : null };
    }
    if (f.qArena && !f.colossusDead) {
      const b = G.enemies.boss;
      return { text: 'Derrote o Colosso', target: b && b.alive ? { x: b.pos.x, z: b.pos.z } : null };
    }
    if (c.defense) return { text: `Defenda a usina até a energia voltar: ${Math.ceil(c.defense.t)} s`, target: POWER, quiet: true };
    if (f.gateOpen) return { text: 'Entre na Siderúrgica Aurora e encontre sua família', target: { x: 0, z: 140 } };
    if (f.m1 && f.m2 && f.m3) return { text: 'Abra o portão da Siderúrgica Aurora', target: { x: 8.3, z: SID.gateZ - 1.4 } };
    if (f.colossusDead && !f.m2) return { text: 'Pegue o crachá no corpo do engenheiro', target: { x: -141.2, z: 18.6 } };
    let best = null,
      bd = 1e9;
    for (const m of missionState(L)) {
      if (m.done) continue;
      const d = Math.hypot(m.target.x - P.pos.x, m.target.z - P.pos.z);
      if (!f.m1 && m.id === 'm1') {
        best = m;
        break;
      }
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    const n = [f.m1, f.m2, f.m3].filter(Boolean).length;
    return { text: `Missão: ${best.title} (${n}/3)`, target: best.target };
  },

  missions(L) {
    const f = L.flags;
    const list = missionState(L).map((m) => ({ title: m.title, desc: m.desc, done: m.done, active: !m.done }));
    list.push({ title: 'Derrote o Dr. Vidal', desc: 'Abra o portão da siderúrgica com o crachá e a energia, e acabe com o Projeto Têmpera.', done: !!f.vidalDead, active: !!(f.m1 && f.m2 && f.m3) && !f.vidalDead });
    return list;
  },

  onBossDeath(L, boss) {
    const G = L.G,
      f = L.flags,
      c = L.c;
    if (boss.kind === 'colossus') {
      f.colossusDead = true;
      c.colossus = null;
      G.game.slowMo(0.4, 1.8);
      G.ui.msg('O Colosso caiu.', true);
      G.game.after(3, () => {
        f.qArena = false;
        c.rockfall.visible = false;
        c.rockCol.enabled = false;
        G.nav.rebuild(G.col, 0.38, { minX: QUARRY.x1 - 4, minZ: 20, maxX: QUARRY.x1 + 4, maxZ: 36 });
        if (!L.state.taken.badge) L.addPickup('badge', 'mission_badge', 1, -141.2, 0.02, 18.6, true);
        G.ui.say('Ryan', 'O corpo do engenheiro... o crachá deve estar com ele.', 3.5);
        G.enemies.boss = null;
        if (!G.player.dead) L.checkpoint('quarry');
      });
    } else if (boss.kind === 'vidal') {
      f.vidalDead = true;
      c.vidal = null;
      G.game.slowMo(0.3, 2.6);
      G.ui.msg('O coração de ferro parou de bater.', true);
      G.game.after(6, () => {
        if (!G.player.dead) ending(L);
      });
    }
  },
};

function w0Rock() {
  return new THREE.MeshStandardMaterial({ color: 0x5e5c56, map: tex('stone'), roughness: 0.95, flatShading: true });
}

export default chapter3;

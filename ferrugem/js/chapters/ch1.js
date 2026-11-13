// Capítulo 1 — O Vale dos Corvos: vila (zona 1), cemitério e rio (zona 2) e a forja (zona 3).
// Construção do mapa, dados da fase (itens, inimigos, checkpoints) e o roteiro (portão,
// manivelas, ponte levadiça, grade da arena e o Ferreiro).
import * as THREE from 'three';
import { planeGeo, cylGeo, gableRoofGeo, gableEndsGeo, scaleUV } from '../geo.js';
import { lerp, smoothstep, clamp, easeInOut } from '../util.js';
import { makeGateLeaf, makeWinch, makePortcullis, mats } from '../models.js';
import { tex } from '../textures.js';
import { OBJ, CHAPTER_TEXT } from '../story.js';

export const RIVER = { z0: 130, z1: 140, y: -0.9 };
export const ARENA = { x: 0, z: 168, r: 18 };
const ZONE_Z = [72, 140];

const FOG = [
  { z: -999, color: new THREE.Color(0x161c26), density: 0.038 },
  { z: 74, color: new THREE.Color(0x161b23), density: 0.047 },
  { z: 142, color: new THREE.Color(0x1d1612), density: 0.03 },
];
const _warmSky = new THREE.Color(0x5a4a52);
const _warmGround = new THREE.Color(0x5a2c16);
const _v = new THREE.Vector3();

// ======================================================================= construção do mapa
function buildGround(w) {
  const M = w.M;
  // chão ao sul do rio e ao norte (o rio fica entre z=130 e z=140)
  const south = planeGeo(140, 180, 4);
  w.geo(south, M.ground, 0, 0, (RIVER.z0 - 180 / 2), 0, -Math.PI / 2, 0, { cast: false });
  const north = planeGeo(140, 80, 4);
  w.geo(north, M.ground, 0, 0, RIVER.z1 + 40, 0, -Math.PI / 2, 0, { cast: false });
  // água e margens
  const water = new THREE.Mesh(planeGeo(140, RIVER.z1 - RIVER.z0 + 1, 6), M.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, RIVER.y, (RIVER.z0 + RIVER.z1) / 2);
  water.receiveShadow = true;
  w.root.add(water);
  w.waters.push(water);
  w.box(0, -0.7, RIVER.z0 - 0.2, 140, 1.4, 0.4, M.stoneDark, { cast: false, tile: 1.5 });
  w.box(0, -0.7, RIVER.z1 + 0.2, 140, 1.4, 0.4, M.stoneDark, { cast: false, tile: 1.5 });
  w.box(0, -1.45, (RIVER.z0 + RIVER.z1) / 2, 140, 0.1, 10.5, M.dark, { cast: false });
  // estrada e caminhos
  w.box(0, 0.006, -3, 5, 0.012, 52, M.road, { cast: false, tile: 4 });
  w.geo(scaleUV(new THREE.CircleGeometry(12, 40), 8), M.cobble, 0, 0.012, 32, 0, -Math.PI / 2, 0, { cast: false });
  w.box(0, 0.01, 57.5, 5, 0.012, 29, M.cobble, { cast: false, tile: 3 });
  w.box(-9, 0.008, 12, 6, 0.012, 2.6, M.road, { cast: false, tile: 4 });
  w.box(8, 0.008, 14.8, 7, 0.012, 2.6, M.road, { cast: false, tile: 4 });
  w.box(-11, 0.008, 54, 10, 0.012, 2.6, M.road, { cast: false, tile: 4 });
  w.box(0, 0.01, 100.5, 3.6, 0.012, 57, M.road, { cast: false, tile: 3 });
  w.box(-9.5, 0.008, 104, 19, 0.012, 2.4, M.road, { cast: false, tile: 3 });
  w.box(9, 0.008, 95, 18, 0.012, 2.4, M.road, { cast: false, tile: 3 });
  w.box(0, 0.01, 145, 7.6, 0.012, 10, M.cobble, { cast: false, tile: 3 });
  w.geo(scaleUV(new THREE.CircleGeometry(ARENA.r + 0.5, 48), (2 * ARENA.r + 1) / 3), M.cobble, ARENA.x, 0.012, ARENA.z, 0, -Math.PI / 2, 0, { cast: false });
}

function buildBoundaries(w) {
  // corredor da floresta (início)
  w.wallInv(-8.5, -30, -8.5, 4.5);
  w.wallInv(8.5, -30, 8.5, 4.5);
  w.wallInv(-9, -28, 9, -28);
  // vila
  w.wallInv(-40, 4, -40, 72);
  w.wallInv(40, 4, 40, 72);
  w.wallInv(-40, 4.2, -8.5, 4.2);
  w.wallInv(8.5, 4.2, 40, 4.2);
  // cemitério
  w.wallInv(-37, 72, -37, 130);
  w.wallInv(37, 72, 37, 130);
  // margens do rio (fora da ponte)
  w.wallInv(-48, RIVER.z0 - 0.3, -2.7, RIVER.z0 - 0.3);
  w.wallInv(2.7, RIVER.z0 - 0.3, 48, RIVER.z0 - 0.3);
  w.wallInv(-48, RIVER.z1 + 0.3, -2.7, RIVER.z1 + 0.3);
  w.wallInv(2.7, RIVER.z1 + 0.3, 48, RIVER.z1 + 0.3);
}

function buildZone1(w) {
  const M = w.M;
  // placa de entrada e quadro de avisos
  w.box(3.4, 1.0, -8, 0.14, 2.0, 0.14, M.beam);
  w.box(6.4, 1.0, -8, 0.14, 2.0, 0.14, M.beam);
  w.geo(new THREE.PlaneGeometry(3.4, 0.85), M.sign, 4.9, 1.6, -8.09, Math.PI);
  w.box(4.9, 1.6, -8.02, 3.4, 0.85, 0.06, M.beam);
  w.col.addBox(4.9, -8, 3.4, 0.3, 0, { y0: 0, y1: 2, mat: 'wood' });
  w.box(-4.2, 1.1, -6, 0.12, 2.2, 0.12, M.beam, { col: true, cm: 'wood' });
  w.box(-4.2, 1.5, -6.05, 1.1, 0.8, 0.06, M.woodDark, { tile: 1 });
  w.anchors.noteEntrance = { x: -4.2, y: 1.5, z: -6.1, wall: true, ry: Math.PI };

  // casas
  w.house({ x: -13, z: 12, w: 7, d: 6, rot: Math.PI / 2, windows: [{ f: 'front', u: -2, lit: 1 }, { f: 'left', u: 0 }] });
  const P2 = w.house({
    x: 14,
    z: 16,
    w: 8,
    d: 7,
    rot: -Math.PI / 2,
    enter: true,
    doorX: -1.2,
    windows: [{ f: 'front', u: 2.2 }, { f: 'back', u: -1.5 }, { f: 'left', u: 0.5 }],
  });
  // interior da casa da escopeta
  {
    const r = -Math.PI / 2;
    let [a, b] = P2(1.6, -2.3);
    w.table(a, b, r);
    w.anchors.shotgun = { x: a, y: 0.84, z: b };
    [a, b] = P2(0.5, -2.3);
    w.anchors.shells1 = { x: a, y: 0.84, z: b };
    [a, b] = P2(1.6, -1.2);
    w.chair(a, b, r + Math.PI);
    [a, b] = P2(-2.6, -1.8);
    w.box(a, 0.25, b, 1.0, 0.5, 2.0, M.woodDark, { ry: r, col: true, cm: 'wood', tile: 1 });
    w.box(a, 0.55, b, 0.9, 0.12, 1.9, M.cloth, { ry: r, cast: false, tile: 1 });
    [a, b] = P2(-2.6, 2.6);
    w.shelf(a, b, r + Math.PI, false);
    [a, b] = P2(3.3, 1.8);
    w.chair(a, b, r, true);
    [a, b] = P2(2.2, -2.3);
    w.candle(a, 0.83, b);
    [a, b] = P2(1.0, -2.0);
    w.anchors.noteDiary = { x: a, y: 0.84, z: b };
  }
  w.house({ x: -24, z: 30, w: 8, d: 7, rot: Math.PI / 2, wall: 'wood', roofMat: M.roofWood, windows: [{ f: 'front', u: 2 }, { f: 'front', u: -2, lit: 2 }] });
  w.house({ x: 25, z: 37, w: 10, d: 9, h: 4.2, rot: -Math.PI / 2, wall: 'wood', roofMat: M.roofWood, roofH: 3.2, chimney: false, windows: [{ f: 'left', u: 0, y: 2.6 }] });
  const P5 = w.house({
    x: -20,
    z: 54,
    w: 11,
    d: 8,
    h: 3.6,
    rot: Math.PI / 2,
    enter: true,
    doorX: 0,
    wall: 'dark',
    windows: [
      { f: 'front', u: -3.2 },
      { f: 'front', u: 3.2 },
      { f: 'back', u: 0 },
    ],
  });
  // interior da casa do prefeito
  {
    const r = Math.PI / 2;
    let [a, b] = P5(-3.2, -2.4);
    w.table(a, b, r, 1.8, 0.9);
    w.anchors.key = { x: a, y: 0.86, z: b };
    [a, b] = P5(-2.4, -2.4);
    w.anchors.noteMayor = { x: a, y: 0.84, z: b };
    [a, b] = P5(-3.85, -2.2);
    w.anchors.noteHelena = { x: a, y: 0.84, z: b };
    [a, b] = P5(-3.2, -3.2);
    w.chair(a, b, r);
    [a, b] = P5(-4.2, -2.6);
    w.candle(a, 0.83, b);
    for (const k of [-1.4, 0.2, 1.8]) {
      [a, b] = P5(k, -3.55);
      w.shelf(a, b, r);
    }
    [a, b] = P5(4.9, -1.5);
    w.box(a, 1.0, b, 0.8, 2.0, 1.8, M.stone, { ry: r, col: true, tile: 1.2 });
    [a, b] = P5(4.55, -1.5);
    w.box(a, 0.55, b, 0.1, 0.8, 1.0, M.dark, { ry: r, cast: false });
    w.fires.push({ x: a - 0.05, y: 0.25, z: b, size: 0.6, rate: 10, acc: 0 });
    w.light(a, 0.8, b, 0xff7a30, 6, 9, 0.3);
    [a, b] = P5(0.5, 0.5);
    w.box(a, 0.012, b, 3.6, 0.01, 2.4, M.rug, { ry: r, cast: false, tile: 1 });
    [a, b] = P5(2.5, 2.2);
    w.chair(a, b, r + 2, true);
    [a, b] = P5(1.5, -1);
    w.anchors.tonicMayor = { x: a, y: 0.02, z: b };
  }
  w.house({ x: 16, z: 57, w: 8, d: 7, rot: -Math.PI / 2, windows: [{ f: 'front', u: 2, lit: 1 }, { f: 'right', u: 0 }] });
  w.house({ x: -31, z: 14, w: 4.4, d: 4, h: 2.6, rot: Math.PI / 2 - 0.3, wall: 'wood', roofMat: M.roofWood, chimney: false });
  w.house({ x: 29, z: 63, w: 7, d: 6, rot: -2.39, windows: [{ f: 'front', u: 1.8, lit: 2 }] });
  w.house({ x: 31, z: 20, w: 6, d: 5, rot: -1.2, wall: 'wood', roofMat: M.roofWood, windows: [{ f: 'front', u: -1.5 }] });
  w.house({ x: -30, z: 66, w: 7, d: 6, rot: 2.24, wall: 'dark', windows: [{ f: 'front', u: 0, lit: 1 }] });
  // ruína
  w.box(-33, 1.4, 40, 0.5, 2.8, 6, M.stone, { col: true });
  w.box(-30.5, 0.9, 37.2, 5, 1.8, 0.5, M.stone, { col: true });
  w.box(-28.4, 2.0, 40.5, 0.5, 4.0, 2.5, M.stone, { col: true });
  w.rock(-31, 42, 0.5);
  w.rock(-29.5, 38.5, 0.4);

  // praça: poço, braseiros, carroças
  w.cyl(0, 0.45, 32, 1.1, 1.15, 0.9, M.stone, { seg: 16, open: true, tile: 1.5, col: true, cr: 1.25, y0: 0, y1: 0.9 });
  w.cyl(0, 0.45, 32, 0.92, 0.92, 0.9, M.stoneDark, { seg: 16, open: true, tile: 1.5 });
  w.geo(new THREE.RingGeometry(0.92, 1.1, 16), M.stone, 0, 0.9, 32, 0, -Math.PI / 2);
  w.geo(new THREE.CircleGeometry(0.92, 16), M.dark, 0, 0.3, 32, 0, -Math.PI / 2, 0, { cast: false });
  for (const sx of [-1, 1]) w.box(sx * 1.0, 1.55, 32, 0.15, 2.2, 0.15, M.beam);
  w.geo(gableRoofGeo(2.4, 1.4, 0.6, 0.2, 1.2), M.roofWood, 0, 2.6, 32, Math.PI / 2);
  w.cyl(0, 2.15, 32, 0.07, 0.07, 2.0, M.beam, { rz: Math.PI / 2, seg: 8 });
  w.cyl(0.3, 1.5, 32, 0.15, 0.12, 0.25, M.woodDark, { seg: 8 });
  w.brazier(6, 38);
  w.brazier(-6, 26);
  w.cart(-7.5, 41, 0.4);
  w.anchors.grenadeCart = { x: -7.6, y: 0.86, z: 41.2 };
  w.cart(17.5, 27, -1.1);
  for (const [x, z, r] of [
    [21, 30.5, 0.2],
    [22.6, 32.2, 1.2],
    [20, 44, 0.5],
    [-15, 21.5, 1.4],
    [-14.2, 23.2, 1.0],
  ])
    w.hay(x, z, r);
  // lenha e toco
  w.cyl(-18.4, 0.35, 23.6, 0.35, 0.4, 0.7, M.woodDark, { seg: 9, col: true, cm: 'wood', tile: 1 });
  for (let i = 0; i < 9; i++) {
    const row = i < 4 ? 0 : i < 7 ? 1 : 2;
    const k = i < 4 ? i : i < 7 ? i - 4 : i - 7;
    w.cyl(-21.5 + k * 0.42 + row * 0.21, 0.2 + row * 0.36, 22.6, 0.19, 0.19, 1.6, M.woodDark, { seg: 7, rx: Math.PI / 2, tile: 1 });
  }
  w.col.addBox(-21, 22.6, 2, 1.7, 0, { y0: 0, y1: 1, mat: 'wood' });
  for (const [x, z] of [
    [-9.8, 14.4],
    [-9.6, 15.2],
    [10.6, 13.2],
    [26.5, 46],
    [-15.2, 50.1],
    [13, 52.4],
    [-4.5, 45],
  ])
    w.barrelDecor(x, z);
  // cercas
  w.fence(-30, 6, -30, 26);
  w.fence(-30, 26, -27, 26);
  w.fence(6, 7, 20, 7);
  w.fence(34, 26, 34, 50);
  w.fence(8, 62, 22, 66);
  w.fence(-14, 64, -6, 68);
  w.fence(-36, 30, -36, 50);
  // varal
  w.box(-8.5, 1.3, 20, 0.1, 2.6, 0.1, M.beam);
  w.box(-8.5, 1.3, 26, 0.1, 2.6, 0.1, M.beam);
  w.box(-8.5, 2.45, 23, 0.02, 0.02, 6, M.beam, { cast: false });
  for (const [z, m] of [
    [21.3, M.cloth],
    [22.6, M.cloth2],
    [24.2, M.cloth],
  ])
    w.geo(new THREE.PlaneGeometry(0.9, 1.1), m, -8.5, 1.85, z, Math.PI / 2, 0, 0.04);
  // postes
  w.lamp(3.4, -14, -1);
  w.lamp(-3.4, -1, 1);
  w.lamp(3.4, 11, -1);
  w.lamp(-9.5, 21, 1);
  w.lamp(10, 23, -1);
  w.lamp(10.5, 44, -1);
  w.lamp(-3.4, 58, 1);
  w.lamp(3.6, 69, -1);
  // algumas árvores mortas dentro da vila
  for (const [x, z, s] of [
    [-6, 8, 0.8],
    [7.5, 4.8, 0.9],
    [-25, 10, 1],
    [34, 12, 1.1],
    [12, 34, 0.75],
    [-12, 44, 0.85],
    [36, 56, 1],
    [-36, 24, 0.9],
    [26, 68, 0.9],
  ])
    w.deadTree(x, z, s, true);

  // muro norte com o portão do cemitério
  w.stoneWall(-40, 72, -3.6, 72, 3.2);
  w.stoneWall(3.6, 72, 40, 72, 3.2);
  for (const sx of [-1, 1]) {
    w.box(sx * 3.4, 2.1, 72, 1.0, 4.2, 1.0, M.stone, { col: true, tile: 1.5 });
    w.box(sx * 3.4, 4.3, 72, 1.2, 0.2, 1.2, M.stoneDark);
    w.cyl(sx * 3.4, 4.6, 72, 0.25, 0.3, 0.4, M.stoneDark, { seg: 8 });
  }
  w.anchors.gate = { x: 0, z: 72 };
}

function buildZone2(w) {
  const M = w.M,
    r = w.rng;
  // muro do cemitério
  w.ironFence(-36, 73, -36, 128);
  w.ironFence(36, 73, 36, 128);
  // lápides
  const tomb = (x, z) => {
    const kind = r.int(0, 5);
    const ry = r.range(-0.12, 0.12) + (x < 0 ? Math.PI / 2 : -Math.PI / 2) * 0;
    const tilt = r.chance(0.3) ? r.range(-0.25, 0.25) : 0;
    if (kind === 0 || kind === 1) {
      const h = r.range(0.8, 1.15);
      w.box(x, h / 2, z, 0.62, h, 0.18, M.tomb, { ry, rx: tilt, tile: 1, col: true, cw: 0.7, cd: 0.3 });
      if (kind === 1) w.cyl(x, h, z, 0.31, 0.31, 0.18, M.tomb, { rx: Math.PI / 2, ry, seg: 10, tile: 1 });
    } else if (kind === 2) {
      w.box(x, 0.75, z, 0.14, 1.5, 0.14, M.tomb, { ry, tile: 1, col: true, cw: 0.3, cd: 0.3 });
      w.box(x, 1.1, z, 0.65, 0.14, 0.14, M.tomb, { ry, tile: 1 });
    } else if (kind === 3) {
      w.box(x, 0.3, z, 0.6, 0.6, 0.16, M.tomb, { ry, rz: r.range(-0.3, 0.3), tile: 1, col: true, cw: 0.7, cd: 0.3 });
    } else if (kind === 4) {
      w.box(x, 0.2, z, 0.9, 0.4, 0.9, M.stoneDark, { ry, tile: 1, col: true });
      w.box(x, 1.2, z, 0.3, 1.8, 0.3, M.tomb, { ry, tile: 1 });
      w.geo(new THREE.ConeGeometry(0.24, 0.4, 4), M.tomb, x, 2.3, z, ry + Math.PI / 4);
    } else {
      w.box(x, 0.12, z + 0.9, 0.9, 0.24, 1.9, M.stoneDark, { ry, tile: 1 });
      w.box(x, 0.5, z, 0.6, 1.0, 0.16, M.tomb, { ry, tile: 1, col: true, cw: 0.7, cd: 0.3 });
    }
  };
  for (let z = 79; z <= 124; z += 3.8) {
    for (let x = -31; x <= -5; x += 3.4) {
      if (x < -15 && z > 92 && z < 117) continue;
      if (x > -16 && z > 101 && z < 107) continue;
      if (r.chance(0.15)) continue;
      tomb(x + r.range(-0.4, 0.4), z + r.range(-0.4, 0.4));
    }
    for (let x = 6; x <= 31; x += 3.4) {
      if (x > 15 && z > 86 && z < 104) continue;
      if (x < 17 && z > 92 && z < 98) continue;
      if (r.chance(0.15)) continue;
      tomb(x + r.range(-0.4, 0.4), z + r.range(-0.4, 0.4));
    }
  }
  // capela em ruínas (oeste)
  const cx = -24,
    cz = 104;
  const jag = (x0, z0, x1, z1, hs) => {
    const n = hs.length;
    for (let i = 0; i < n; i++) {
      const t0 = i / n,
        t1 = (i + 1) / n;
      const ax = lerp(x0, x1, t0),
        az = lerp(z0, z1, t0),
        bx = lerp(x0, x1, t1),
        bz = lerp(z0, z1, t1);
      const L = Math.hypot(bx - ax, bz - az),
        rot = Math.atan2(bx - ax, bz - az);
      w.box((ax + bx) / 2, hs[i] / 2, (az + bz) / 2, 0.5, hs[i], L, M.stone, { ry: rot, col: true, tile: 2.5 });
    }
  };
  jag(cx - 5, cz - 7, cx - 5, cz + 7, [4.5, 5.2, 4.8, 3.6]);
  jag(cx - 5, cz - 7, cx + 5, cz - 7, [4.2, 3.0, 2.2]);
  jag(cx - 5, cz + 7, cx + 5, cz + 7, [4.4, 3.4, 4.6]);
  jag(cx + 5, cz - 7, cx + 5, cz - 1.5, [3.8, 2.6]);
  jag(cx + 5, cz + 1.5, cx + 5, cz + 7, [2.8, 4.0]);
  w.box(cx + 5, 4.6, cz, 0.6, 0.6, 3.6, M.stone, { tile: 2 });
  w.box(cx - 3.6, 0.5, cz, 1.0, 1.0, 2.4, M.stoneDark, { col: true, tile: 1 });
  w.anchors.noteSmith = { x: cx - 3.6, y: 1.01, z: cz + 0.6 };
  for (const dz of [-0.9, 0.9]) w.candle(cx - 3.6, 1.0, cz + dz, dz < 0);
  for (let k = 0; k < 4; k++) {
    for (const s of [-1, 1]) {
      if (r.chance(0.25)) continue;
      w.box(cx + 0.5 + k * 1.3 - 1.6, 0.25, cz + s * 2.4, 0.4, 0.5, 2.6, M.woodDark, { col: true, cm: 'wood', rz: r.chance(0.3) ? 0.3 : 0, tile: 1 });
    }
  }
  for (let i = 0; i < 5; i++) w.rock(cx + r.range(-4, 4), cz + r.range(-6, 6), r.range(0.2, 0.4));
  w.anchors.winch1 = { x: cx - 2.8, z: cz - 4.6, ry: Math.PI / 2 };

  // mausoléu (leste)
  const mx = 24,
    mz = 95;
  w.box(mx + 0.5, 2.3, mz, 7, 4.6, 7, M.stone, { col: true, tile: 2.5 });
  w.box(mx + 0.5, 0.25, mz, 7.6, 0.5, 7.6, M.stoneDark, { tile: 2 });
  w.geo(gableRoofGeo(7.4, 7.4, 1.6, 0.3, 2), M.stoneDark, mx + 0.5, 4.6, mz, -Math.PI / 2);
  w.geo(gableEndsGeo(7.4, 7.4, 1.6, 2.5), M.stone, mx + 0.5, 4.6, mz, -Math.PI / 2);
  for (const dz of [-2.2, 2.2]) w.cyl(mx - 3.6, 2.3, mz + dz, 0.32, 0.36, 4.6, M.tomb, { seg: 10, col: true, tile: 1.5 });
  w.box(mx - 3.6, 4.75, mz, 1.2, 0.3, 5.6, M.stoneDark, { tile: 2 });
  w.box(mx - 3.04, 1.3, mz, 0.1, 2.6, 1.8, M.iron, { tile: 1 });
  w.anchors.winch2 = { x: mx - 6.2, z: mz - 3.2, ry: -Math.PI / 2 };
  for (const dz of [-1.5, 1.5]) {
    w.box(mx - 3.05, 2.4, mz + dz, 0.1, 0.25, 0.1, M.iron);
    w.flame(mx - 3.15, 2.62, mz + dz, 0.22);
  }
  w.light(mx - 3.5, 2.6, mz, 0xff9040, 9, 12, 0.2);

  // lanternas no caminho
  w.lamp(2.2, 81, -1);
  w.lamp(-2.2, 93, 1);
  w.lamp(2.2, 106, -1);
  w.lamp(-2.2, 117, 1);
  // árvores mortas e corvos de pedra
  for (const [x, z, s] of [
    [-12, 78, 1],
    [14, 79, 0.9],
    [-30, 92, 1.1],
    [31, 108, 1],
    [-8, 110, 0.8],
    [10, 116, 1.1],
    [-32, 124, 1],
    [28, 124, 0.9],
    [-17, 96, 0.7],
    [19, 103, 0.8],
  ])
    w.deadTree(x, z, s, true);
  // velas em túmulos
  for (const [x, z] of [
    [-8.4, 87.6],
    [9.4, 91],
    [-14.8, 120],
    [13, 110.2],
  ])
    w.candle(x, 0.02, z, false);

  // ponte: postes com correntes nas duas margens
  for (const sx of [-1, 1]) {
    w.box(sx * 3.1, 1.6, RIVER.z0 - 1.0, 0.5, 3.2, 0.5, M.stone, { col: true, tile: 1.5 });
    w.box(sx * 3.1, 1.6, RIVER.z1 + 0.8, 0.5, 3.2, 0.5, M.stone, { col: true, tile: 1.5 });
  }
  w.lamp(4.2, RIVER.z0 - 2.5, -1);
  w.anchors.noteReport = { x: 5.4, y: 0.84, z: RIVER.z0 - 4.6 };
  w.box(5.4, 0.42, RIVER.z0 - 4.6, 0.8, 0.84, 0.6, M.woodDark, { col: true, cm: 'wood', tile: 1 });
}

function buildZone3(w) {
  const M = w.M,
    r = w.rng;
  // corredor de entrada
  for (const sx of [-1, 1]) w.box(sx * 4.3, 2.2, 145, 1.0, 4.4, 10, M.stone, { col: true, tile: 2.5 });
  w.box(0, 5.0, 149.5, 9.8, 1.2, 1.4, M.stone, { tile: 2 });
  for (const sx of [-1, 1]) w.box(sx * 4.4, 2.5, 149.5, 1.4, 5.0, 1.4, M.stone, { col: true, tile: 2 });
  w.light(0, 3.5, 146, 0xff9a50, 8, 12, 0.2);
  w.flame(-3.6, 3.0, 146, 0.22);
  w.flame(3.6, 3.0, 146, 0.22);

  // muralha circular da arena (com abertura ao sul)
  const segs = 26;
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2,
      a1 = ((i + 1) / segs) * Math.PI * 2;
    const am = (a0 + a1) / 2;
    // abertura em -Z (ângulo 270°)
    const deg = (am * 180) / Math.PI;
    if (deg > 255 && deg < 285) continue;
    const R = ARENA.r + 0.8;
    const x0 = ARENA.x + Math.cos(a0) * R,
      z0 = ARENA.z + Math.sin(a0) * R;
    const x1 = ARENA.x + Math.cos(a1) * R,
      z1 = ARENA.z + Math.sin(a1) * R;
    const L = Math.hypot(x1 - x0, z1 - z0) + 0.3,
      rot = Math.atan2(x1 - x0, z1 - z0);
    const h = 5 + (i % 3) * 0.4;
    w.box((x0 + x1) / 2, h / 2, (z0 + z1) / 2, 1.2, h, L, M.stone, { ry: rot, col: true, tile: 2.5 });
  }
  // fecha o vão entre a muralha e a guarita
  for (const sx of [-1, 1]) w.box(sx * 5.95, 2.5, 150.4, 1.9, 5.0, 1.3, M.stone, { col: true, tile: 2 });
  // portas laterais escuras (de onde vêm os reforços)
  for (const sx of [-1, 1]) {
    const x = ARENA.x + sx * (ARENA.r + 0.25);
    w.box(x, 1.4, ARENA.z, 0.2, 2.8, 2.2, M.dark, { cast: false });
    w.box(x, 2.95, ARENA.z, 0.4, 0.3, 2.8, M.beam);
  }
  // fornalhas ao norte
  for (const deg of [62, 90, 118]) {
    const a = (deg * Math.PI) / 180;
    const R = ARENA.r - 1.4;
    const x = ARENA.x + Math.cos(a) * R,
      z = ARENA.z + Math.sin(a) * R;
    const rot = Math.atan2(-Math.cos(a), -Math.sin(a));
    const big = deg === 90;
    const fw = big ? 4.6 : 3.4,
      h = big ? 4.2 : 3.4;
    w.box(x, h / 2, z, fw, h, 2.6, M.stone, { ry: rot, col: true, tile: 2 });
    const fx = x - Math.cos(a) * 1.32,
      fz = z - Math.sin(a) * 1.32;
    w.box(fx, 1.2, fz, fw * 0.5, 1.4, 0.06, M.molten, { ry: rot, cast: false });
    w.box(x, h + 2.5, z, 1.4, 5, 1.4, M.stoneDark, { ry: rot, tile: 2 });
    w.fires.push({ x: fx, y: 0.7, z: fz, size: big ? 1.4 : 1.0, rate: big ? 26 : 16, acc: 0, embers: true });
    w.light(fx - Math.cos(a) * 0.6, 1.6, fz - Math.sin(a) * 0.6, 0xff6a20, big ? 70 : 42, 20, 0.22, 12);
  }
  w.cyl(ARENA.x, 9, ARENA.z + ARENA.r + 3.5, 2.2, 2.8, 18, M.stoneDark, { seg: 12, tile: 3 });
  // pilares de cobertura
  for (const deg of [30, 150, 210, 330]) {
    const a = (deg * Math.PI) / 180;
    const x = ARENA.x + Math.cos(a) * 9.5,
      z = ARENA.z + Math.sin(a) * 9.5;
    w.cyl(x, 3, z, 0.85, 0.95, 6, M.stone, { seg: 12, col: true, tile: 2 });
    w.box(x, 6.1, z, 2.1, 0.3, 2.1, M.stoneDark);
    for (let k = 0; k < 6; k++) w.geo(new THREE.TorusGeometry(0.08, 0.02, 4, 8), M.iron, x + 0.9, 5.7 - k * 0.14, z, k % 2 ? 0 : Math.PI / 2);
  }
  // bigornas e carvão
  const anvil = (x, z, rot) => {
    w.box(x, 0.35, z, 0.5, 0.7, 0.6, M.iron, { ry: rot });
    w.box(x, 0.8, z, 1.2, 0.22, 0.5, M.iron, { ry: rot });
    w.col.addBox(x, z, 1.2, 0.6, rot, { y0: 0, y1: 0.95, mat: 'metal' });
  };
  anvil(-5.5, 166, 0.3);
  anvil(6, 164, -0.4);
  anvil(0, ARENA.z + 11.2, 0);
  w.anchors.bossAnvil = { x: 0, z: ARENA.z + 11.2 };
  for (let i = 0; i < 14; i++) {
    const a = r.range(0.3, Math.PI - 0.3),
      R = r.range(14, 16.5);
    w.geo(new THREE.DodecahedronGeometry(r.range(0.3, 0.7), 0), M.coal, ARENA.x + Math.cos(a) * R, 0.15, ARENA.z + Math.sin(a) * R, r.range(0, 3), 0, 0, { sy: 0.5 });
  }
  // canal de metal derretido (decorativo)
  w.box(0, 0.03, ARENA.z + 14.5, 11, 0.04, 0.5, M.molten, { cast: false });
  // tochas de parede
  for (const deg of [0, 35, 145, 180, 215, 325]) {
    const a = (deg * Math.PI) / 180;
    const R = ARENA.r - 0.1;
    const x = ARENA.x + Math.cos(a) * R,
      z = ARENA.z + Math.sin(a) * R;
    w.box(x, 2.6, z, 0.12, 0.6, 0.12, M.iron);
    w.flame(x, 3.0, z, 0.3);
    w.light(x - Math.cos(a) * 0.4, 3.0, z - Math.sin(a) * 0.4, 0xff8a40, 12, 13, 0.25);
  }
  w.anchors.arenaEntry = { x: 0, z: 149.5 };
}

function buildForest(w) {
  const r = w.rng;
  const inPlay = (x, z) => {
    if (z > -30 && z < 4.5 && Math.abs(x) < 9.5) return true;
    if (z >= 4 && z < 72 && Math.abs(x) < 41) return true;
    if (z >= 72 && z < 129 && Math.abs(x) < 38) return true;
    if (z >= 128 && z < 142) return true;
    if (z >= 140 && Math.hypot(x - ARENA.x, z - ARENA.z) < ARENA.r + 3) return true;
    if (z >= 139 && z < 151 && Math.abs(x) < 6) return true;
    return false;
  };
  let placed = 0,
    tries = 0;
  while (placed < 300 && tries < 6000) {
    tries++;
    const x = r.range(-62, 62),
      z = r.range(-44, 205);
    if (inPlay(x, z)) continue;
    // fora do alcance da neblina não vale a pena
    const nearEdge = Math.abs(x) < 58 && z < 200;
    if (!nearEdge) continue;
    const s = r.range(0.8, 1.35);
    if (r.chance(0.45)) w.pine(x, z, s);
    else w.deadTree(x, z, s, false);
    placed++;
  }
  // árvores grudadas no corredor inicial (com colisão)
  for (let z = -28; z < 4; z += 2.6) {
    for (const sx of [-1, 1]) {
      const x = sx * r.range(9.4, 11.5);
      if (r.chance(0.5)) w.pine(x, z + r.range(-0.6, 0.6), r.range(0.8, 1.2));
      else w.deadTree(x, z + r.range(-0.6, 0.6), r.range(0.8, 1.2));
    }
  }
  for (let i = 0; i < 40; i++) {
    const x = r.range(-55, 55),
      z = r.range(-35, 190);
    if (inPlay(x, z)) continue;
    w.rock(x, z, r.range(0.6, 1.8));
  }
  // arbustos baixos nas bordas da vila
  for (let i = 0; i < 60; i++) {
    const side = r.chance(0.5) ? -1 : 1;
    const x = side * r.range(40.5, 46),
      z = r.range(4, 128);
    w.geo(new THREE.IcosahedronGeometry(r.range(0.6, 1.2), 0), w.M.bush, x, 0.4, z, r.range(0, 3), 0, 0, { sy: 0.7 });
  }
}

// ======================================================================= dados da fase
const PICKUPS = [
  { id: 'p1', type: 'ammo_pistol', n: 10, x: -9.4, z: 13.4 },
  { id: 'p2', type: 'tonic', n: 1, x: 1.9, z: 30.0 },
  { id: 'p3', type: 'weapon_shotgun', n: 1, anchor: 'shotgun' },
  { id: 'p4', type: 'ammo_shotgun', n: 6, anchor: 'shells1' },
  { id: 'p5', type: 'grenade', n: 1, anchor: 'grenadeCart' },
  { id: 'p6', type: 'ammo_pistol', n: 12, x: 19.4, z: 35.2 },
  { id: 'key', type: 'key', n: 1, anchor: 'key' },
  { id: 'p7', type: 'tonic', n: 1, anchor: 'tonicMayor' },
  { id: 'p8', type: 'ammo_pistol', n: 8, x: -27.6, z: 17.4 },
  { id: 'q1', type: 'ammo_pistol', n: 10, x: -3.4, z: 85.2 },
  { id: 'q2', type: 'ammo_shotgun', n: 5, x: 3.5, z: 98.6 },
  { id: 'q3', type: 'ammo_pistol', n: 10, x: -22.6, z: 108.8 },
  { id: 'q4', type: 'tonic', n: 1, x: -26.8, z: 108.9 },
  { id: 'q5', type: 'tonic', n: 1, x: 19.4, z: 99.4 },
  { id: 'q6', type: 'grenade', n: 1, x: -3.4, z: 112.2 },
  { id: 'q7', type: 'ammo_shotgun', n: 4, x: 3.5, z: 121.4 },
  { id: 'q8', type: 'medkit', n: 1, x: 4.4, z: 126.6 },
  { id: 'q9', type: 'ammo_pistol', n: 12, x: 13.0, z: 93.7 },
  { id: 'r1', type: 'ammo_pistol', n: 20, x: -2.6, z: 142.6 },
  { id: 'r2', type: 'ammo_shotgun', n: 8, x: 2.6, z: 142.6 },
  { id: 'r3', type: 'tonic', n: 1, x: -2.6, z: 146.3 },
  { id: 'r4', type: 'medkit', n: 1, x: 2.6, z: 146.3 },
  { id: 'r5', type: 'grenade', n: 2, x: 0, z: 144.6 },
];

const CRATES = [
  { id: 'c1', x: 6, z: 12.6 },
  { id: 'c2', x: -6.8, z: 17.2 },
  { id: 'c3', x: 20, z: 47.6 },
  { id: 'c4', x: -12.5, z: 60.6 },
  { id: 'c5', x: 27.4, z: 25.4, loot: 'ammo_pistol' },
  { id: 'c6', x: -24.6, z: 21.8 },
  { id: 'c7', x: -3.8, z: 79.6 },
  { id: 'c8', x: 3.8, z: 88.2 },
  { id: 'c9', x: -3.8, z: 118.6 },
  { id: 'c10', x: 3.8, z: 108.6, loot: 'tonic' },
  { id: 'c11', x: -34, z: 100.4 },
  { id: 'c12', x: 34, z: 84.2, loot: 'ammo_shotgun' },
];

const DRUMS = [
  { id: 'd1', x: -3.7, z: 36.9 },
  { id: 'd2', x: 19.2, z: 37.8 },
  { id: 'd3', x: 9, z: 52.6 },
  { id: 'd4', x: -3.6, z: 97.2 },
  { id: 'd5', x: 3.8, z: 116.6 },
];

const NOTE_DEFS = [
  { id: 'aviso', anchor: 'noteEntrance' },
  { id: 'diario', anchor: 'noteDiary' },
  { id: 'prefeito', anchor: 'noteMayor' },
  { id: 'helena1', anchor: 'noteHelena' },
  { id: 'ferreiro', anchor: 'noteSmith' },
  { id: 'relatorio', anchor: 'noteReport' },
];

const GROUPS = {
  z1: [
    { k: 'v', x: 2.2, z: 34.3, idle: 'talk', yaw: -2.3 },
    { k: 'v', x: -1.9, z: 34.7, idle: 'talk', yaw: 2.6 },
    { k: 'v', x: 1.3, z: 29.3, idle: 'talk', yaw: 0.2 },
    { k: 'v', x: -18.4, z: 24.7, idle: 'chop', weapon: 'axe', yaw: Math.PI },
    { k: 'v', x: 19.3, z: 33.4, idle: 'idle', weapon: 'pitchfork', yaw: -1.6 },
    { k: 'v', x: 19.8, z: 41.6, idle: 'idle', yaw: -1.4 },
    { k: 'v', x: 1.5, z: 47, idle: 'wander' },
    { k: 'v', x: -2.5, z: 52, idle: 'wander' },
    { k: 'v', x: 10.4, z: 55.6, idle: 'idle', yaw: -1.2 },
    { k: 'v', x: 12.0, z: 49.4, idle: 'idle', yaw: 2.4 },
  ],
  z1behind: [
    { k: 'v', x: 0, z: -12, idle: 'hunt' },
    { k: 'v', x: -3, z: -16, idle: 'hunt' },
    { k: 'v', x: 2.5, z: -19, idle: 'hunt' },
  ],
  z1ambush: [
    { k: 'v', x: -36, z: 62, idle: 'hunt' },
    { k: 'v', x: -35, z: 46.5, idle: 'hunt' },
    { k: 'v', x: -23.5, z: 69, idle: 'hunt' },
    { k: 'v', x: -8, z: 66.5, idle: 'hunt' },
    { k: 'v', x: -27, z: 38.6, idle: 'hunt' },
  ],
  z2: [
    { k: 'v', x: 4, z: 86, idle: 'wander' },
    { k: 'v', x: -9, z: 92.6, idle: 'pray', yaw: -0.6 },
    { k: 'v', x: 3.6, z: 104.4, idle: 'idle', yaw: Math.PI },
    { k: 'v', x: -3, z: 115, idle: 'wander' },
    { k: 'v', x: 13.6, z: 118.6, idle: 'idle', yaw: -2.2 },
    { k: 'c', x: -23, z: 108.6, idle: 'dormant', yaw: 1.5 },
    { k: 'c', x: 29.8, z: 92, idle: 'dormant', yaw: -1.5 },
  ],
  w1: [
    { k: 'v', x: -33, z: 84, idle: 'hunt' },
    { k: 'v', x: -33, z: 121, idle: 'hunt' },
    { k: 'v', x: -12, z: 127, idle: 'hunt' },
    { k: 'c', x: -30, z: 77, idle: 'hunt' },
  ],
  w2: [
    { k: 'v', x: 33, z: 80, idle: 'hunt' },
    { k: 'v', x: 33, z: 120, idle: 'hunt' },
    { k: 'v', x: 12, z: 127.6, idle: 'hunt' },
    { k: 'c', x: 31, z: 111, idle: 'hunt' },
  ],
  z2after: [
    { k: 'v', x: 0, z: 75, idle: 'hunt' },
    { k: 'v', x: 2.5, z: 77, idle: 'hunt' },
    { k: 'v', x: -2.5, z: 78, idle: 'hunt' },
  ],
};

const CHECKPOINTS = {
  cp1: { x: 0, z: -18, yaw: 0, group: 'z1' },
  cp2: { x: 0, z: 78, yaw: 0, group: 'z2' },
  cp2b: { x: 0, z: 124, yaw: 0, group: 'z2after' },
  cp3: { x: 0, z: 143.4, yaw: 0, group: 'boss' },
};

const onPath = (x, z) =>
  (Math.abs(x) < 3 && z < 72) ||
  Math.hypot(x, z - 32) < 12.5 ||
  (Math.abs(x) < 2.2 && z > 72 && z < 130) ||
  (z > 140 && Math.hypot(x - ARENA.x, z - ARENA.z) < ARENA.r + 1) ||
  (z > 139 && z < 151);

function spawnBoss(L) {
  const G = L.G;
  if (G.enemies.boss) return;
  const a = G.world.anchors.bossAnvil;
  G.enemies.spawn('ferreiro', 0, ARENA.z + 9, { yaw: Math.PI, arena: ARENA, anvil: a });
}

// ======================================================================= roteiro
function setGate(L, open, instant) {
  const c = L.c;
  if (instant) {
    c.gateOpenK = open ? 1 : 0;
    applyGate(L);
  }
  c.gateCol.enabled = !open;
  c.chain.visible = !open;
}

function applyGate(L) {
  const c = L.c;
  const k = easeInOut(c.gateOpenK || 0);
  c.gateL.rotation.y = -1.75 * k;
  c.gateR.rotation.y = Math.PI + 1.75 * k;
}

function setBridge(L, down, instant) {
  const c = L.c;
  if (instant) {
    c.bridgeK = down ? 1 : 0;
    applyBridge(L);
  }
  c.bridgeBlock.enabled = !down;
  for (const r of c.bridgeRails) r.enabled = down;
  c.bridgeDeck.enabled = down;
}

function applyBridge(L) {
  const c = L.c;
  const k = c.bridgeK || 0;
  c.bridge.rotation.x = -1.35 * (1 - easeInOut(k));
  for (const ch of c.bridgeChains) {
    _v.set(ch.sx * 2.45, 0.2, 10.2).applyEuler(c.bridge.rotation).add(c.bridge.position);
    const ax = ch.sx * 3.1,
      ay = 3.1,
      az = RIVER.z0 - 1.0;
    const dx = _v.x - ax,
      dy = _v.y - ay,
      dz = _v.z - az;
    const L2 = Math.hypot(dx, dy, dz);
    ch.mesh.position.set((ax + _v.x) / 2, (ay + _v.y) / 2, (az + _v.z) / 2);
    ch.mesh.scale.set(1, L2, 1);
    ch.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L2, dy / L2, dz / L2));
    ch.mesh.visible = k < 0.999;
  }
}

function setPortcullis(L, closed, instant) {
  const c = L.c;
  if (instant) {
    c.portK = closed ? 1 : 0;
    c.portcullis.position.y = 4.6 * (1 - c.portK);
  }
  c.portCol.enabled = closed;
}

function openGate(L) {
  const G = L.G;
  L.flags.gateOpen = true;
  setGate(L, true, false);
  L.c.anim.push({ k: 'gate', t: 0, dur: 1.8 });
  G.audio.creak({ x: 0, z: 72 }, 1.8);
  G.audio.chain({ x: 0, z: 72 }, 5);
  G.nav.rebuild(G.col, 0.38, { minX: -6, minZ: 69, maxX: 6, maxZ: 75 });
  G.enemies.spawnGroup(GROUPS.z2, 0);
  G.ui.msg('O portão se abriu.');
}

function lowerBridge(L) {
  const G = L.G;
  L.flags.bridgeDown = true;
  L.c.anim.push({ k: 'bridge', t: 0, dur: 4.2 });
  G.audio.rumble({ x: 0, z: RIVER.z0 }, 4.2);
  G.fx.shake(0.25);
  G.ui.msg('A ponte levadiça está descendo...');
}

function lockArena(L) {
  const G = L.G;
  L.flags.arena = true;
  setPortcullis(L, true, false);
  L.c.anim.push({ k: 'port', t: 0, dur: 0.45 });
  G.nav.rebuild(G.col, 0.38, { minX: -6, minZ: ARENA.z - ARENA.r - 3, maxX: 6, maxZ: ARENA.z - ARENA.r + 3 });
  if (!G.enemies.boss) spawnBoss(L);
  if (G.enemies.boss) G.enemies.boss.wake();
  G.ui.bossIntro('O Ferreiro', 'Bento, o primeiro a enferrujar');
}

const chapter1 = {
  id: 1,
  key: 'c1',
  seed: 4242,
  name: 'Capítulo 1',
  title: 'O Vale dos Corvos',
  text: CHAPTER_TEXT[1],
  bounds: { minX: -46, minZ: -30, maxX: 46, maxZ: 192 },
  start: { x: 0, z: -18, yaw: 0 },
  firstCheckpoint: 'cp1',
  checkpoints: CHECKPOINTS,
  pickups: PICKUPS,
  crates: CRATES,
  drums: DRUMS,
  notes: NOTE_DEFS,
  groups: GROUPS,
  sky: { top: 0x05070c, mountains: 0x07090d },
  grass: { minX: -44, maxX: 44, minZ: -28, maxZ: 190, count: 3200, skip: (x, z) => onPath(x, z) || (z > RIVER.z0 - 0.5 && z < RIVER.z1 + 0.5) },

  build(w) {
    buildGround(w);
    buildBoundaries(w);
    buildZone1(w);
    buildZone2(w);
    buildZone3(w);
    buildForest(w);
  },

  fog(px, pz, out) {
    let a = FOG[0],
      b = FOG[0],
      k = 0;
    if (pz < FOG[1].z - 6) a = b = FOG[0];
    else if (pz < FOG[1].z + 6) {
      a = FOG[0];
      b = FOG[1];
      k = smoothstep(FOG[1].z - 6, FOG[1].z + 6, pz);
    } else if (pz < FOG[2].z - 8) a = b = FOG[1];
    else if (pz < FOG[2].z + 6) {
      a = FOG[1];
      b = FOG[2];
      k = smoothstep(FOG[2].z - 8, FOG[2].z + 6, pz);
    } else a = b = FOG[2];
    out.color.copy(a.color).lerp(b.color, k);
    out.density = lerp(a.density, b.density, k);
  },

  hemi(px, pz, hemi) {
    const warm = smoothstep(ZONE_Z[1] - 4, ZONE_Z[1] + 12, pz);
    if (warm <= 0) return;
    hemi.color.lerp(_warmSky, warm * 0.6);
    hemi.groundColor.lerp(_warmGround, warm);
  },

  groundY(x, z, G) {
    if (z > RIVER.z0 && z < RIVER.z1) {
      if (G.level && G.level.flags.bridgeDown && Math.abs(x) < 2.6) return 0;
      return RIVER.y;
    }
    return 0;
  },

  surface(x, z, G) {
    if (G.world.isIndoor(x, z)) return 'wood';
    if (z > 129.5 && z < 140.5) return 'wood';
    if (Math.hypot(x, z - 32) < 12 || (Math.abs(x) < 2.6 && z > 43 && z < 72) || (z > 140 && (Math.abs(x) < 4 || Math.hypot(x - ARENA.x, z - ARENA.z) < ARENA.r))) return 'stone';
    return 'dirt';
  },

  zoneOf(z) {
    return z < ZONE_Z[0] ? 1 : z < ZONE_Z[1] ? 2 : 3;
  },

  // Tela título: câmera girando pela praça com aldeões conversando.
  titleGroup: [
    { k: 'v', x: 2.4, z: 34.2, idle: 'talk', yaw: -2.3 },
    { k: 'v', x: -1.9, z: 34.8, idle: 'talk', yaw: 2.6 },
    { k: 'v', x: 1.3, z: 29.2, idle: 'talk', yaw: 0.2 },
    { k: 'v', x: -18.4, z: 24.7, idle: 'chop', weapon: 'axe', yaw: Math.PI },
  ],
  titleCam(t, cam) {
    const a = t * 0.045 + 2.3;
    cam.position.set(Math.sin(a) * 12.5, 2.7 + Math.sin(t * 0.3) * 0.15, 32 + Math.cos(a) * 12.5);
    cam.lookAt(0, 1.5, 32);
    return { x: 0, z: 32, yaw: a + Math.PI };
  },

  // ----------------------------------------------------------------- objetos com estado
  setup(L) {
    const G = L.G,
      col = G.col,
      c = L.c,
      root = L.root;
    c.gateL = makeGateLeaf(2.95, 3.2);
    c.gateL.position.set(-2.95, 0, 72);
    c.gateR = makeGateLeaf(2.95, 3.2);
    c.gateR.position.set(2.95, 0, 72);
    root.add(c.gateL, c.gateR);
    const m = mats();
    c.chain = new THREE.Group();
    for (let i = 0; i < 9; i++) {
      const l = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.014, 4, 8), m.iron);
      l.position.set(-0.36 + i * 0.09, 1.55 + Math.sin(i * 0.7) * 0.05, 72.06);
      l.rotation.y = i % 2 ? Math.PI / 2 : 0;
      c.chain.add(l);
    }
    const lock = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.2, 0.08), m.brass);
    lock.position.set(0.05, 1.42, 72.1);
    c.chain.add(lock);
    root.add(c.chain);
    c.gateCol = col.addBox(0, 72, 6, 0.3, 0, { y0: 0, y1: 3.2, mat: 'metal', shootThrough: true });
    c.winches = {};
    for (const id of ['w1', 'w2']) {
      const a = G.world.anchors[id === 'w1' ? 'winch1' : 'winch2'];
      const wm = makeWinch();
      wm.position.set(a.x, 0, a.z);
      wm.rotation.y = a.ry;
      root.add(wm);
      col.addBox(a.x, a.z, 1.5, 0.7, a.ry, { y0: 0, y1: 1.3, mat: 'wood' });
      c.winches[id] = { id, x: a.x, z: a.z, mesh: wm, wheel: wm.userData.wheel, progress: 0, done: false, sound: 0, spin: 0 };
    }
    c.bridge = new THREE.Group();
    c.bridge.position.set(0, 0, RIVER.z0);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(5, 0.25, 10.3), new THREE.MeshStandardMaterial({ map: tex('planks'), color: 0x8a7058, roughness: 0.9 }));
    deck.position.set(0, -0.12, 5.15);
    deck.castShadow = deck.receiveShadow = true;
    c.bridge.add(deck);
    for (const sx of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.9, 10.3), m.darkWood);
      rail.position.set(sx * 2.45, 0.45, 5.15);
      rail.castShadow = true;
      c.bridge.add(rail);
      for (let k = 0; k <= 5; k++) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.18, 1.1, 0.18), m.darkWood);
        post.position.set(sx * 2.45, 0.45, k * 2.05);
        post.castShadow = true;
        c.bridge.add(post);
      }
    }
    root.add(c.bridge);
    c.bridgeChains = [];
    for (const sx of [-1, 1]) {
      const ch = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1, 5), m.iron);
      ch.castShadow = true;
      root.add(ch);
      c.bridgeChains.push({ mesh: ch, sx });
    }
    c.bridgeBlock = col.addBox(0, RIVER.z0 - 0.3, 5.6, 0.6, 0, { y0: 0, y1: 4, invisible: true });
    c.bridgeRails = [
      col.addBox(-2.62, (RIVER.z0 + RIVER.z1) / 2, 0.25, RIVER.z1 - RIVER.z0 + 1.2, 0, { y0: 0, y1: 1.1, mat: 'wood', shootThrough: true }),
      col.addBox(2.62, (RIVER.z0 + RIVER.z1) / 2, 0.25, RIVER.z1 - RIVER.z0 + 1.2, 0, { y0: 0, y1: 1.1, mat: 'wood', shootThrough: true }),
    ];
    c.bridgeDeck = col.addBox(0, (RIVER.z0 + RIVER.z1) / 2, 5, RIVER.z1 - RIVER.z0, 0, { y0: -0.3, y1: 0, mat: 'wood' });
    c.portcullis = makePortcullis(7.6, 4.8);
    c.portcullis.position.set(0, 4.6, ARENA.z - ARENA.r - 0.3);
    root.add(c.portcullis);
    c.portCol = col.addBox(0, ARENA.z - ARENA.r - 0.3, 7.6, 0.4, 0, { y0: 0, y1: 4.8, mat: 'metal', shootThrough: true });
  },

  apply(L) {
    const c = L.c;
    const data = L.state.data;
    data.winch = data.winch || { w1: 0, w2: 0 };
    c.anim = [];
    setGate(L, !!L.flags.gateOpen, true);
    for (const id of ['w1', 'w2']) {
      const w = c.winches[id];
      w.progress = data.winch[id] || 0;
      w.done = w.progress >= 1;
    }
    setBridge(L, !!L.flags.bridgeDown, true);
    setPortcullis(L, !!L.flags.arena, true);
  },

  update(L, dt) {
    const G = L.G,
      P = G.player,
      c = L.c;
    for (const a of c.anim) {
      a.t += dt;
      const k = clamp(a.t / a.dur, 0, 1);
      if (a.k === 'gate') {
        c.gateOpenK = k;
        applyGate(L);
      } else if (a.k === 'bridge') {
        c.bridgeK = k;
        applyBridge(L);
        if (k >= 1 && !a.done) {
          a.done = true;
          setBridge(L, true, false);
          G.nav.rebuild(G.col, 0.38, { minX: -6, minZ: RIVER.z0 - 3, maxX: 6, maxZ: RIVER.z1 + 3 });
          G.fx.shake(0.4);
          G.audio.slam({ x: 0, z: RIVER.z1 }, 1);
          G.ui.msg('A ponte desceu. O caminho para a forja está livre.');
          if (!P.dead) L.checkpoint('cp2b');
          G.enemies.spawnGroup(GROUPS.z2after, 12);
        }
      } else if (a.k === 'port') {
        c.portK = k;
        c.portcullis.position.y = 4.6 * (1 - k * k);
        if (k >= 1 && !a.done) {
          a.done = true;
          G.audio.slam({ x: 0, z: ARENA.z - ARENA.r }, 1.2);
          G.fx.shake(0.45);
          G.fx.dust({ x: 0, y: 0.2, z: ARENA.z - ARENA.r - 0.3 }, { x: 0, y: 1, z: 0 }, 14);
        }
      }
    }
    c.anim = c.anim.filter((a) => a.t < a.dur);
    for (const id in c.winches) {
      const w = c.winches[id];
      if (w.spin > 0) {
        w.spin -= dt;
        w.wheel.rotation.x -= dt * 4;
      }
    }
  },

  triggers(L) {
    const G = L.G,
      P = G.player,
      f = L.flags;
    const z = P.pos.z;
    if (!f.square && z > 17 && z < 70) {
      f.square = true;
      G.enemies.spawnGroup(GROUPS.z1behind, 14);
    }
    if (!f.sawVillage && z > 6) f.sawVillage = true;
    if (f.gateOpen && !f.cp2 && z > 77) {
      f.cp2 = true;
      L.checkpoint('cp2');
    }
    if (f.bridgeDown && !f.cp3 && z > 142.2) {
      f.cp3 = true;
      L.checkpoint('cp3');
      spawnBoss(L);
    }
    if (f.bridgeDown && !f.arena && z > ARENA.z - ARENA.r + 3.2) lockArena(L);
  },

  onCheckpointLoad(L, cpId) {
    const cp = CHECKPOINTS[cpId];
    if (!cp) return;
    if (cp.group === 'boss') spawnBoss(L);
    else if (GROUPS[cp.group]) L.G.enemies.spawnGroup(GROUPS[cp.group], 0);
  },

  onPickup(L, p) {
    const G = L.G;
    if (p.type === 'key' && !L.flags.ambush) {
      L.flags.ambush = true;
      G.enemies.spawnGroup(GROUPS.z1ambush, 10);
      G.audio.sting();
      G.ui.msg('Eles ouviram você...');
    }
  },

  onNoteRead(L, id) {
    if (id === 'aviso' || id === 'prefeito') L.flags.knowKey = true;
  },

  interactables(L, consider) {
    const c = L.c;
    if (!L.flags.gateOpen) consider(null, 0, 71.2, 2.8, 'gate');
    for (const id in c.winches) {
      const w = c.winches[id];
      if (!w.done && L.flags.gateOpen) consider(w, w.x, w.z, 2.1, 'winch');
    }
  },

  prompt(L, best) {
    const P = L.G.player;
    if (best.kind === 'gate') return { key: 'E', text: P.keys.cemetery ? 'Destrancar o portão' : 'Examinar o portão' };
    if (best.kind === 'winch') return { key: 'E', text: 'Girar a manivela (segure)', hold: best.obj.progress };
    return null;
  },

  interact(L, best, inp) {
    const G = L.G,
      P = G.player,
      c = L.c;
    if (best.kind === 'winch') {
      const o = best.obj;
      if (!inp.held) return false;
      if (!L.flags[o.id + 'wave']) {
        L.flags[o.id + 'wave'] = true;
        G.enemies.spawnGroup(GROUPS[o.id], 10);
        G.audio.sting();
      }
      o.progress = Math.min(1, o.progress + inp.dt / 3.2);
      L.state.data.winch[o.id] = o.progress;
      o.spin = 0.1;
      o.sound -= inp.dt;
      if (o.sound <= 0) {
        o.sound = 0.16;
        G.audio.ratchet(o);
      }
      if (o.progress >= 1 && !o.done) {
        o.done = true;
        G.audio.chain(o, 8);
        const n = (c.winches.w1.done ? 1 : 0) + (c.winches.w2.done ? 1 : 0);
        G.ui.msg(n < 2 ? 'Uma trava da ponte se soltou. Falta a outra manivela.' : 'As duas travas se soltaram!');
        if (n === 2) lowerBridge(L);
      }
      return false;
    }
    if (best.kind === 'gate' && inp.pressed) {
      if (P.keys.cemetery) openGate(L);
      else {
        L.flags.knowKey = true;
        G.ui.msg('O portão está trancado com uma corrente. A chave deve estar com o prefeito.');
      }
      return true;
    }
    return false;
  },

  objective(L) {
    const G = L.G,
      P = G.player,
      f = L.flags,
      c = L.c;
    if (f.bossDead) return { text: OBJ.c1.end, target: null };
    if (f.arena) {
      const b = G.enemies.boss;
      return { text: OBJ.c1.boss, target: b && b.alive ? { x: b.pos.x, z: b.pos.z } : null };
    }
    if (f.bridgeDown) return { text: OBJ.c1.cross, target: { x: 0, z: ARENA.z - ARENA.r + 4 } };
    if (f.gateOpen) {
      const ws = Object.values(c.winches).filter((w) => !w.done);
      const n = 2 - ws.length;
      let tg = null,
        bd = 1e9;
      for (const w of ws) {
        const d = Math.hypot(w.x - P.pos.x, w.z - P.pos.z);
        if (d < bd) {
          bd = d;
          tg = { x: w.x, z: w.z };
        }
      }
      return { text: OBJ.c1.winches(n), target: tg };
    }
    if (P.keys.cemetery) return { text: OBJ.c1.openGate, target: { x: 0, z: 71 } };
    if (f.knowKey || f.square) return { text: OBJ.c1.findKey, target: { x: -15.2, z: 54 } };
    return { text: OBJ.c1.start, target: { x: 0, z: 26 } };
  },

  onBossDeath(L, boss) {
    const G = L.G;
    L.flags.bossDead = true;
    G.game.slowMo(0.35, 2.4);
    G.ui.msg('O Ferreiro caiu.', true);
    G.game.after(7, () => G.game.completeChapter());
    void boss;
  },
};

export default chapter1;

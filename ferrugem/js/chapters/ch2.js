// Capítulo 2 — Ferrópolis: a cidade abandonada. O grupo de sobreviventes do beco (confronto,
// apresentação, vigia), a companheira Clara, cinco missões (farmácia, posto, delegacia,
// mercado com o Açougueiro e a ponte norte), sobrevoos do helicóptero e a despedida.
import * as THREE from 'three';
import { planeGeo } from '../geo.js';
import { clamp, smoothstep, lerp } from '../util.js';
import { mats } from '../models.js';
import { tex } from '../textures.js';
import { CHAPTER_TEXT, MISSIONS } from '../story.js';
import { LOOKS } from '../npc.js';
import { explode } from '../combat.js';
import {
  cityMats,
  building,
  storefront,
  room,
  wallSeg,
  car,
  bus,
  truck,
  lampPost,
  jersey,
  sandbags,
  tent,
  bigTent,
  container,
  chainFence,
  trashBags,
  dumpster,
  rubble,
  burningCar,
  barrelFire,
  signMesh,
  groundBox,
  updateZones,
  resetZones,
  clearAround,
} from './common.js';

const RIVER = { z0: 188, z1: 200, y: -0.9 };
const ALLEY = { x0: -38, x1: -11, z0: 65, z1: 75 };
const MARKET = { x: -31, z: 130, r: 12.5 };
const HALL = { x0: -48, x1: -14, z0: 116, z1: 144 };
const RADIO = { x: 38.6, z: 112.6 };
const BARRICADE = { x: 0, z: 189.5 };
const GEN = { x: -35.6, z: 70 };
const JORGE = { x: -33, z: 67.4 };
const _v = new THREE.Vector3();

const inAlley = (x, z) => x > ALLEY.x0 && x < ALLEY.x1 + 1 && z > ALLEY.z0 && z < ALLEY.z1;

// ======================================================================= construção do mapa
function buildGround(w) {
  const C = cityMats(),
    M = w.M;
  // asfalto geral (sob tudo) e calçadas
  groundBox(w, 0, 90, 130, 232, C.asphalt, 6, 0.002);
  // avenida: faixas e calçadas
  for (const sx of [-1, 1]) groundBox(w, sx * 8.5, 82, 3, 212, C.sidewalk, 2, 0.06);
  for (let z = -20; z < 186; z += 6) groundBox(w, 0, z, 0.18, 3, C.line, 1, 0.012);
  // ruas transversais com faixas
  for (const zc of [40, 100, 160]) {
    for (let x = -58; x < 58; x += 6) if (Math.abs(x) > 9) groundBox(w, x, zc, 3, 0.18, C.lineWhite, 1, 0.012);
    for (const sz of [-1, 1]) groundBox(w, 0, zc + sz * 5, 124, 2, C.sidewalk, 2, 0.05);
    // faixa de pedestres
    for (let k = -5; k <= 5; k++) groundBox(w, k * 1.2, zc - 7.5, 0.6, 2.4, C.lineWhite, 1, 0.07);
  }
  // praça da estação (piso de pedra)
  groundBox(w, -29, 11, 34, 38, M.cobble, 3, 0.03);
  // rio e margens
  const water = new THREE.Mesh(planeGeo(140, RIVER.z1 - RIVER.z0 + 1, 6), M.water);
  water.rotation.x = -Math.PI / 2;
  water.position.set(0, RIVER.y, (RIVER.z0 + RIVER.z1) / 2);
  water.receiveShadow = true;
  w.root.add(water);
  w.waters.push(water);
  w.box(0, -1.45, (RIVER.z0 + RIVER.z1) / 2, 140, 0.1, 12.5, M.dark, { cast: false });
  for (const zz of [RIVER.z0 - 0.2, RIVER.z1 + 0.2]) {
    w.box(-36, -0.6, zz, 60, 1.4, 0.4, C.concreteDark, { cast: false, tile: 2 });
    w.box(36, -0.6, zz, 60, 1.4, 0.4, C.concreteDark, { cast: false, tile: 2 });
  }
  // margem norte (além do rio): terra
  w.box(0, -0.02, 203.5, 140, 0.04, 7, M.ground, { cast: false, tile: 4 });
  // ponte norte
  w.box(0, -0.15, (RIVER.z0 + RIVER.z1) / 2, 12.4, 0.3, RIVER.z1 - RIVER.z0 + 2, C.concrete, { cast: false, tile: 3 });
  for (const sx of [-1, 1]) {
    w.box(sx * 6.1, 0.55, (RIVER.z0 + RIVER.z1) / 2, 0.3, 1.1, RIVER.z1 - RIVER.z0 + 2, C.concrete, { col: true, tile: 2 });
    for (let z = RIVER.z0; z <= RIVER.z1; z += 3) w.cyl(sx * 6.1, -1.5, z, 0.5, 0.6, 2.8, C.concreteDark, { seg: 8 });
  }
}

function buildBounds(w) {
  // limites (invisíveis) e margens do rio
  w.wallInv(-61.5, -24, -61.5, 206);
  w.wallInv(61.5, -24, 61.5, 206);
  w.wallInv(-62, -23.5, 62, -23.5);
  w.wallInv(-62, 205.5, 62, 205.5);
  w.wallInv(-62, RIVER.z0 - 0.3, -6.3, RIVER.z0 - 0.3);
  w.wallInv(6.3, RIVER.z0 - 0.3, 62, RIVER.z0 - 0.3);
  w.wallInv(-62, RIVER.z1 + 0.3, -6.3, RIVER.z1 + 0.3);
  w.wallInv(6.3, RIVER.z1 + 0.3, 62, RIVER.z1 + 0.3);
  // fim das ruas transversais: escombros e barricadas do exército
  for (const zc of [40, 100, 160]) {
    rubble(w, -58.5, zc, 3.5);
    rubble(w, 58.5, zc, 3.5);
  }
  // entrada sul: estrada sai da cidade (bloqueada atrás do jogador)
  for (const sx of [-1, 1]) building(w, sx * 36, -19.5, 50, 9, 2, cityMats().facadeBrick);
  jersey(w, -3, -22.5, Math.PI / 2, 3);
  jersey(w, 3, -22.5, Math.PI / 2, 3);
  jersey(w, 0, -22.6, Math.PI / 2, 3);
}

// Quarteirões com prédios de alturas diferentes (fachadas de 6 x 6 m).
function buildBlocks(w) {
  const C = cityMats();
  const F = [C.facade, C.facadeBrick, C.facadeBlue];
  const r = w.rng;
  const B = (x0, x1, z0, z1, floors, k, o) => building(w, (x0 + x1) / 2, (z0 + z1) / 2, x1 - x0, z1 - z0, floors, F[k % 3], o);
  // ---- oeste
  // W1: prédio da estação (lado oeste da praça) e fundos
  B(-60, -47, -6, 28, 3, 0, { tank: true });
  B(-60, -12, -14, -8, 2, 1);
  B(-60, -36, 30, 34, 2, 2);
  // W2: beco dos sobreviventes entre z=65 e z=75
  B(-60, -36, 46, 65, 4, 1, { antenna: true });
  B(-34, -12, 46, 65, 3, 2);
  B(-60, -38.5, 65, 75, 5, 0);
  B(-60, -38, 75, 94, 3, 2);
  B(-36, -12, 75, 94, 4, 0, { tank: true });
  // W3: mercado (galpão) e vizinhos
  B(-60, -12, 106, 114.5, 3, 1);
  B(-60, -12, 145.5, 154, 2, 0);
  B(-60, -49, 115, 145, 2, 2);
  // W4
  B(-60, -36, 166, 186, 3, 1);
  B(-34, -12, 166, 186, 5, 2, { antenna: true });
  // ---- leste
  // E1: posto de gasolina (terreno aberto) cercado de prédios
  B(12, 60, -14, -3, 2, 0);
  B(47, 60, -3, 34, 3, 1);
  // E2: farmácia na esquina
  B(31, 60, 46, 63, 3, 2);
  B(12, 36, 64.5, 94, 4, 0);
  B(37.5, 60, 64.5, 94, 3, 1, { tank: true });
  // E3: delegacia e vizinhos
  B(41.5, 60, 106, 132, 2, 2);
  B(12, 60, 132.5, 154, 3, 0);
  B(12, 40, 106, 109, 2, 1);
  // E4: obra (terreno) e fundos
  B(49.5, 60, 166, 186, 2, 0);
  void r;
  // vitrines e placas ao longo da avenida
  const fronts = [
    [-12, 55, 'e', 'PADARIA SÃO JORGE'],
    [-12, 85, 'e', 'BAR DO ZÉ'],
    [-12, 110, 'e', 'FERRAGENS AÇO FORTE'],
    [-12, 150, 'e', 'CINE AURORA'],
    [-12, 176, 'e', 'HOTEL CENTRAL'],
    [12, 80, 'w', 'LOJA DE CALÇADOS'],
    [12, 142, 'w', 'BANCO DA SERRA'],
  ];
  for (const [x, z, f, t] of fronts) storefront(w, x, z, f, 0, 6, { sign: t || null, closed: !t, awningMat: C.tarpBlue });
}

function buildStation(w) {
  const C = cityMats(),
    M = w.M;
  // fachada da estação virada para a praça
  signMesh(w, 'ESTAÇÃO FERRÓPOLIS', -46.85, 7.2, 11, Math.PI / 2, 9, 1.2, { bg: '#1e2a30', fg: '#d8d2c0' });
  for (const z of [2, 11, 20]) storefront(w, -47, z, 'e', 0, 4, { closed: true, awning: false });
  w.box(-45.5, 8.5, 11, 3, 0.2, 32, C.roofTop, { tile: 3 });
  // relógio
  w.cyl(-46.7, 6.0, 11, 0.9, 0.9, 0.12, C.concrete, { rz: Math.PI / 2, seg: 16 });
  // posto de evacuação abandonado
  bigTent(w, -34, 16, 0);
  bigTent(w, -22, 4, Math.PI / 2);
  tent(w, -38, 4, 0.3);
  tent(w, -18, 24, -0.2);
  tent(w, -40, 26, 0.1, C.tarpBlue);
  truck(w, -26, -3, Math.PI / 2);
  truck(w, -15, 14, 0.15);
  for (const [x, z, ry, l] of [
    [-13, -2, 0, 6],
    [-13, 30, 0, 6],
    [-30, 31.5, Math.PI / 2, 8],
  ])
    sandbags(w, x, z, ry, l, 3);
  chainFence(w, -46, 32.5, -36, 32.5);
  chainFence(w, -12.6, 4, -12.6, 10);
  // mesas de triagem
  w.table(-24.2, 12, 0, 1.8, 0.9);
  w.table(-28, 12, 0, 1.8, 0.9);
  w.chair(-24.2, 13.1, Math.PI);
  w.chair(-28, 10.8, 0, true);
  w.anchors.noteJornal = { x: -24.2, y: 0.86, z: 12 };
  w.anchors.noteOrdem = { x: -34, y: 0.9, z: 16.2 };
  w.table(-34, 16.2, 0, 1.6, 0.8);
  // macas e caixas
  for (const [x, z] of [
    [-36, 12],
    [-32, 20],
  ])
    w.box(x, 0.45, z, 0.7, 0.1, 1.9, C.tarp, {});
  barrelFire(w, -20, 18);
  lampPost(w, -14, 0, -Math.PI / 2, true, 0xbcd0ff);
  // torre de vigia do exército
  for (const [a, b] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    w.box(-44 + a * 1.1, 2.2, 29 + b * 1.1, 0.16, 4.4, 0.16, M.woodDark, { col: true });
  w.box(-44, 4.4, 29, 2.8, 0.15, 2.8, M.woodDark, {});
  w.box(-44, 5.0, 29, 2.8, 1.0, 0.08, M.woodDark, {});
}

function buildAlley(w) {
  const C = cityMats(),
    M = w.M;
  groundBox(w, -24.5, 70, 27, 10, C.concreteDark, 3, 0.03);
  // barricada na entrada: carro, caixotes e tábuas, com uma passagem no meio
  car(w, -12.6, 66.6, 0.12, C.carBlue);
  w.box(-12.2, 0.55, 73.4, 1.2, 1.1, 2.6, M.woodDark, { col: true, cm: 'wood', tile: 1 });
  w.box(-12.2, 1.4, 73.4, 1.0, 0.6, 1.0, M.wood, { col: true, cm: 'wood', tile: 1 });
  w.box(-11.6, 1.3, 68.4, 0.08, 2.6, 0.5, M.woodDark, {});
  // torre do vigia (andaime) com o Zeca
  for (const [a, b] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    w.box(-15.4 + a * 1.15, 1.55, 66.6 + b * 1.15, 0.12, 3.1, 0.12, C.pole, { col: true });
  w.box(-15.4, 3.05, 66.6, 2.6, 0.12, 2.6, M.woodDark, { tile: 1 });
  for (const sz of [-1, 1]) w.box(-15.4, 3.6, 66.6 + sz * 1.25, 2.6, 0.06, 0.06, C.pole, {});
  w.box(-14.15, 3.6, 66.6, 0.06, 0.06, 2.6, C.pole, {});
  for (let y = 0.4; y < 3.0; y += 0.45) w.box(-16.7, y, 67.5, 0.06, 0.06, 0.6, C.pole, {});
  // lona por cima do acampamento
  w.box(-29, 3.4, 70, 14, 0.05, 10.4, C.tarpBlue, { rz: 0.08, tile: 3 });
  for (const [x, z] of [
    [-22.2, 65.3],
    [-22.2, 74.7],
  ])
    w.cyl(x, 1.6, z, 0.06, 0.06, 3.3, C.pole, { seg: 6 });
  // fogueira no tambor, colchões, mesa, prateleiras, gerador
  barrelFire(w, -25, 70.5);
  for (const [x, z, ry] of [
    [-33, 67.4, 0],
    [-33.4, 72.9, 0.1],
    [-29, 74, Math.PI / 2],
  ])
    w.box(x, 0.12, z, 1.0, 0.24, 2.0, C.sand, { ry, tile: 1 });
  w.table(-19.8, 73.6, 0, 1.6, 0.8);
  w.chair(-19.8, 72.6, 0);
  w.box(-27.5, 0.25, 66.6, 0.6, 0.5, 0.6, M.wood, { col: true, cm: 'wood', tile: 1 });
  w.shelf(-37.4, 73.5, Math.PI / 2, false);
  w.box(-31, 0.5, 74.3, 1.2, 1.0, 0.6, M.woodDark, { col: true, cm: 'wood', tile: 1 });
  w.box(GEN.x, 0.45, GEN.z, 1.2, 0.9, 0.8, C.carGreen, { col: true, cm: 'metal' });
  w.box(GEN.x, 0.95, GEN.z + 0.25, 0.1, 0.4, 0.1, C.pole, {});
  // grafite "NÃO BEBA A ÁGUA / SOBREVIVENTES → BECO" no muro da avenida
  const gm = new THREE.MeshStandardMaterial({ map: tex('graffiti'), transparent: true, roughness: 0.9, depthWrite: false });
  const gr = new THREE.Mesh(new THREE.PlaneGeometry(5, 2.5), gm);
  gr.position.set(-11.93, 2.4, 59);
  gr.rotation.y = Math.PI / 2;
  w.root.add(gr);
  w.anchors.alleyFire = { x: -25, z: 70.5 };
  // lampiões: na torre do vigia, perto dos colchões e na mesa
  for (const [x, y, z, it] of [
    [-15.4, 3.5, 67.7, 7],
    [-32, 1.2, 70.2, 6],
    [-19.6, 1.05, 74, 4],
  ]) {
    w.box(x, y - 0.12, z, 0.16, 0.24, 0.16, w.M.iron, { cast: false });
    w.flame(x, y, z, 0.12);
    w.light(x, y + 0.2, z, 0xffb060, it, 9, 0.15, 7);
  }
}

function buildPharmacy(w) {
  const C = cityMats(),
    M = w.M;
  room(w, { x: 21, z: 55, w: 18, d: 14, h: 4, door: { side: 'w', at: 0, width: 2.6 }, wall: C.concrete });
  storefront(w, 12, 55, 'w', -4, 4, { closed: false, awning: false });
  storefront(w, 12, 55, 'w', 4, 4, { closed: false, awning: false });
  signMesh(w, 'FARMÁCIA CENTRAL', 11.7, 4.6, 55, -Math.PI / 2, 8, 1.1, { bg: '#1e3a26', fg: '#e8f0e0', glow: false });
  // cruz verde
  w.box(11.6, 6.2, 55, 0.1, 1.2, 0.4, C.carGreen, {});
  w.box(11.6, 6.2, 55, 0.1, 0.4, 1.2, C.carGreen, {});
  // balcão, prateleiras e o depósito dos fundos
  w.box(17, 0.55, 58.5, 1.0, 1.1, 5, M.woodDark, { col: true, cm: 'wood', tile: 1 });
  for (const z of [50, 52.5]) w.shelf(18, z, Math.PI / 2);
  w.shelf(21, 61.6, 0);
  w.shelf(16, 61.6, 0);
  wallSeg(w, 25, 48, 25, 53.2, 4);
  wallSeg(w, 25, 55.6, 25, 62, 4);
  w.box(25, 3.2, 54.4, 0.2, 1.6, 2.4, C.concrete, {});
  for (const z of [49.5, 51.6]) w.shelf(29.3, z, -Math.PI / 2);
  w.table(28, 59.5, 0, 1.6, 0.8);
  w.anchors.meds = { x: 28, y: 0.86, z: 59.5 };
  w.anchors.noteFarmacia = { x: 17, y: 1.12, z: 57.5 };
  w.light(21, 3.4, 55, 0x9ad0ff, 4, 9, 0.6);
}

function buildGasStation(w) {
  const C = cityMats(),
    M = w.M;
  groundBox(w, 30, 15, 32, 30, C.concreteDark, 3, 0.03);
  // cobertura
  for (const [a, b] of [
    [-1, -1],
    [1, -1],
    [-1, 1],
    [1, 1],
  ])
    w.box(26 + a * 6, 2.6, 15 + b * 4, 0.4, 5.2, 0.4, C.concrete, { col: true });
  w.box(26, 5.4, 15, 15, 0.6, 11, C.carRed, { tile: 2 });
  w.box(26, 5.05, 15, 14.6, 0.1, 10.6, C.lampOff, { cast: false });
  signMesh(w, 'POSTO AURORA', 18.6, 5.4, 15, -Math.PI / 2, 6, 0.55, { bg: '#7a1e14', fg: '#f0e0c0' });
  // bombas
  for (const [x, z] of [
    [23, 13],
    [23, 17],
    [29, 13],
    [29, 17],
  ]) {
    w.box(x, 0.8, z, 0.7, 1.6, 0.5, C.carWhite, { col: true, cm: 'metal' });
    w.box(x, 1.35, z + 0.26, 0.5, 0.3, 0.02, C.darkGlass, {});
  }
  // loja de conveniência
  building(w, 41, 15, 8, 12, 1, C.facade);
  storefront(w, 41, 15, 'w', 0, 6, { sign: 'CONVENIÊNCIA', closed: true });
  // poste do preço
  w.box(16, 3, 4, 0.3, 6, 0.3, C.pole, { col: true });
  signMesh(w, 'GASOLINA 2,19', 16, 6.3, 4, -Math.PI / 2, 2.6, 1.2, { bg: '#e8e0c8', fg: '#7a1e14', w: 256, h: 128 });
  burningCar(w, 34, 24, 0.7);
  car(w, 20, 26, 1.9);
  trashBags(w, 44, 27, 3);
  w.anchors.fuel1 = { x: 35.8, y: 0.02, z: 10.5 };
  w.anchors.fuel2 = { x: 24.4, y: 0.02, z: 21.8 };
}

function buildPolice(w) {
  const C = cityMats(),
    M = w.M;
  room(w, { x: 27.5, z: 120, w: 27, d: 20, h: 4.2, door: { side: 'w', at: 0, width: 2.6 }, wall: C.brick });
  w.box(27.5, 4.6, 120, 27.6, 0.8, 20.6, C.roofTop, {});
  signMesh(w, 'DELEGACIA DE POLÍCIA', 13.8, 4.9, 120, -Math.PI / 2, 9, 1.0, { bg: '#1a2436', fg: '#e0e4ec' });
  w.box(13.5, 0.15, 120, 1.6, 0.3, 6, C.concrete, { cast: false });
  // luz giratória do carro de polícia
  car(w, 6.5, 114, 0.1, C.carWhite, { lightsOn: true });
  car(w, 7.5, 127, -0.25, C.carBlue);
  // interior: balcão, mural, divisórias da sala do rádio e do arsenal
  w.box(19, 0.55, 116, 1, 1.1, 5, M.woodDark, { col: true, cm: 'wood', tile: 1 });
  w.box(14.35, 2, 125.5, 0.05, 1.4, 2.6, M.wood, {});
  w.anchors.noteHelena2 = { x: 14.42, y: 2.0, z: 125.5, wall: true, ry: Math.PI / 2 };
  wallSeg(w, 32.5, 110, 32.5, 113.5, 4.2, C.brick);
  wallSeg(w, 32.5, 116, 32.5, 124, 4.2, C.brick);
  wallSeg(w, 32.5, 126.5, 32.5, 130, 4.2, C.brick);
  wallSeg(w, 32.5, 120, 41, 120, 4.2, C.brick);
  w.box(32.5, 3.35, 114.75, 0.2, 1.7, 2.5, C.brick, {});
  w.box(32.5, 3.35, 125.25, 0.2, 1.7, 2.5, C.brick, {});
  // rádio
  w.table(RADIO.x, RADIO.z, 0, 1.6, 0.8);
  w.box(RADIO.x, 1.05, RADIO.z, 0.8, 0.4, 0.45, C.carGreen, {});
  w.box(RADIO.x + 0.25, 1.1, RADIO.z + 0.23, 0.12, 0.12, 0.02, C.lampOn, { cast: false });
  w.box(RADIO.x - 0.3, 1.6, RADIO.z, 0.03, 0.7, 0.03, C.pole, {});
  w.light(RADIO.x, 2.4, RADIO.z, 0x8ad08a, 3, 6, 0.3);
  // arsenal
  w.shelf(39.8, 126, -Math.PI / 2, false);
  w.table(37, 128.5, 0, 1.6, 0.8);
  w.anchors.smg = { x: 37.2, y: 0.86, z: 128.5 };
  w.anchors.smgAmmo = { x: 36.3, y: 0.86, z: 128.4 };
  // celas
  for (let z = 111; z < 118; z += 0.35) w.box(29, 1.6, z, 0.05, 3.2, 0.05, C.pole, {});
  w.col.addBox(29, 114.5, 0.2, 7, 0, { y0: 0, y1: 3.2, mat: 'metal', shootThrough: true });
  for (const [x, z] of [
    [22, 112],
    [24, 127],
  ])
    w.table(x, z, 0.3, 1.4, 0.8);
}

function buildMarket(w) {
  const C = cityMats(),
    M = w.M;
  const cx = (HALL.x0 + HALL.x1) / 2,
    cz = (HALL.z0 + HALL.z1) / 2;
  room(w, { x: cx, z: cz, w: HALL.x1 - HALL.x0, d: HALL.z1 - HALL.z0, h: 7, door: { side: 'e', at: 0, width: 4.2 }, wall: C.brick, roof: false });
  // telhado em arco (lâminas) e claraboias quebradas
  for (let i = 0; i < 9; i++) {
    const z = HALL.z0 + 1.5 + i * 3.3;
    w.box(cx, 7.4, z, HALL.x1 - HALL.x0 + 0.6, 0.5, 2.4, C.roofTop, { tile: 3 });
    w.box(cx, 7.1, z + 1.65, HALL.x1 - HALL.x0, 0.25, 0.25, C.pole, {});
  }
  signMesh(w, 'MERCADO MUNICIPAL', HALL.x1 + 0.2, 6.2, 130, Math.PI / 2, 10, 1.3, { bg: '#3a1e14', fg: '#f0d8b0' });
  // pilares e bancas (cobertura)
  for (const x of [-40, -31, -22])
    for (const z of [122, 138]) w.cyl(x, 3.5, z, 0.35, 0.4, 7, C.concrete, { col: true, seg: 10 });
  for (const [x, z] of [
    [-41, 126.5],
    [-41, 133.5],
    [-24, 126],
    [-24, 134],
  ]) {
    w.box(x, 0.55, z, 4, 1.1, 1.4, M.woodDark, { col: true, cm: 'wood', tile: 1 });
    w.box(x, 2.6, z, 4.2, 0.08, 1.8, C.tarp, {});
  }
  // carne pendurada em ganchos
  const meat = new THREE.MeshStandardMaterial({ color: 0x6a2018, roughness: 0.6 });
  for (let i = 0; i < 12; i++) {
    const x = -44 + (i % 6) * 5,
      z = i < 6 ? 119.5 : 140.5;
    w.box(x, 2.6, z, 0.5, 1.0, 0.3, meat, {});
    w.box(x, 3.6, z, 0.03, 1.0, 0.03, C.pole, {});
  }
  // balcão do açougueiro e depósito
  w.box(-44.5, 0.55, 130, 1.2, 1.1, 6, M.woodDark, { col: true, cm: 'wood', tile: 1 });
  w.box(-44.5, 1.15, 130, 1.25, 0.08, 6.1, C.pole, {});
  w.anchors.food = { x: -45.6, y: 0.02, z: 141 };
  w.anchors.magnum = { x: -44.5, y: 1.2, z: 128.4 };
  w.anchors.noteAcougue = { x: -16.2, y: 0.02, z: 135.4 };
  for (const [x, z] of [
    [-46.5, 141.5],
    [-46.5, 138.8],
  ])
    w.box(x, 0.4, z, 0.8, 0.8, 0.8, M.wood, { col: true, cm: 'wood', tile: 1 });
  w.light(-31, 6, 130, 0xffb070, 10, 22, 0.2);
  w.light(-44, 3, 130, 0xff8a40, 8, 10, 0.3);
}

function buildConstruction(w) {
  const C = cityMats(),
    M = w.M;
  groundBox(w, 31, 176.5, 34, 19, M.ground, 4, 0.04);
  chainFence(w, 14, 167, 14, 174.5);
  chainFence(w, 14, 178.5, 14, 186);
  chainFence(w, 14, 167, 49, 167);
  chainFence(w, 14, 186, 49, 186);
  signMesh(w, 'OBRA — ENTRADA PROIBIDA', 13.85, 2.0, 170.8, -Math.PI / 2, 3.4, 0.7, { bg: '#c8a018', fg: '#1a1a1a', w: 512, h: 128 });
  // esqueleto de prédio em construção
  for (const x of [32, 38, 44])
    for (const z of [169, 175]) w.box(x, 4.5, z, 0.5, 9, 0.5, C.concrete, { col: true });
  for (const y of [3, 6, 9]) w.box(38, y, 172, 13, 0.3, 7, C.concrete, { tile: 3 });
  // andaime
  for (let x = 30; x <= 46; x += 2) {
    w.box(x, 4.5, 176.2, 0.06, 9, 0.06, C.yellow, {});
    w.box(x, 4.5, 177.2, 0.06, 9, 0.06, C.yellow, {});
  }
  for (const y of [1.5, 3, 4.5, 6, 7.5]) w.box(38, y, 176.7, 16, 0.08, 1.1, M.woodDark, {});
  w.col.addBox(38, 176.7, 16.2, 1.2, 0, { y0: 0, y1: 9, mat: 'metal', shootThrough: true });
  // betoneira, pilhas de vergalhão, contêiner-escritório
  w.cyl(22, 1.0, 182, 0.9, 0.7, 1.6, C.carYellow, { col: true, rx: 0.4, seg: 10 });
  for (let i = 0; i < 6; i++) w.box(26, 0.1 + i * 0.08, 170 + i * 0.05, 0.08, 0.08, 6, w.M.rust, {});
  container(w, 40.5, 182.6, Math.PI / 2, 0x2a4a6a);
  w.anchors.dynamite = { x: 36.8, y: 0.02, z: 182.4 };
  // guindaste
  w.box(46, 12, 182, 1, 24, 1, C.yellow, { col: true });
  w.box(38, 23.5, 182, 18, 0.8, 0.8, C.yellow, {});
  lampPost(w, 15.5, 176, Math.PI / 2, true);
}

function buildStreetProps(w) {
  const C = cityMats();
  // carros abandonados e ônibus
  const cars = [
    [3.5, 8, 0.2],
    [-4.5, 24, -0.4],
    [4.2, 47, 0.1],
    [-3.6, 88, 2.9],
    [3.8, 112, 0.5],
    [-2.5, 138, -0.3],
    [3, 166, 1.2],
    [-25, 40, 1.6],
    [28, 41.5, 1.4],
    [-40, 99, 1.5],
    [22, 98.5, 1.7],
    [-22, 160, 1.5],
    [30, 161, 1.8],
  ];
  for (const [x, z, r] of cars) car(w, x, z, r);
  bus(w, 4.6, 78, 0.06);
  burningCar(w, -4.5, 120, 2.6);
  burningCar(w, 40, 160, 1.4);
  truck(w, -3.5, 176, 0.05);
  // barricadas do exército na ponte
  for (const x of [-5, 0, 5]) jersey(w, x, 184, Math.PI / 2, 3.2);
  // postes (alguns acesos)
  for (let z = -10; z < 186; z += 18) {
    const litL = z % 36 === 8,
      litR = z % 54 === -10 || z === 98;
    lampPost(w, -9.4, z, Math.PI / 2, litL);
    lampPost(w, 9.4, z + 9, -Math.PI / 2, litR);
  }
  // lixo e caçambas
  for (const [x, z] of [
    [-10.5, 30],
    [10.6, 44],
    [-10.5, 92],
    [10.5, 104],
    [-10.6, 160],
  ])
    trashBags(w, x, z, 3);
  dumpster(w, 10.8, 70, 0);
  dumpster(w, -10.9, 102, 0);
  // semáforos
  for (const [x, z] of [
    [-9, 33.6],
    [9, 46.4],
    [-9, 93.6],
    [9, 106.4],
    [-9, 153.6],
  ]) {
    w.cyl(x, 2.2, z, 0.06, 0.06, 4.4, C.pole, { seg: 6 });
    w.box(x, 4.2, z, 0.3, 0.9, 0.3, C.trash, {});
  }
}

// ======================================================================= dados da fase
const PICKUPS = [
  { id: 'a1', type: 'ammo_pistol', n: 10, x: 2.2, z: -6 },
  { id: 'a2', type: 'tonic', n: 1, x: -8.6, z: 9 },
  { id: 'a3', type: 'ammo_shotgun', n: 5, x: -28.4, z: 12.3, y: 0.86 },
  { id: 'a4', type: 'ammo_pistol', n: 12, x: -36.5, z: 22 },
  { id: 'a5', type: 'grenade', n: 1, x: -20.2, z: 26.4 },
  { id: 'a6', type: 'medkit', n: 1, x: -34.6, z: 16.4, y: 0.88 },
  { id: 'b1', type: 'tonic', n: 1, x: 17.2, z: 59.8, y: 1.12 },
  { id: 'b2', type: 'ammo_shotgun', n: 4, x: 20.5, z: 50.8 },
  { id: 'meds', type: 'mission_meds', n: 1, anchor: 'meds' },
  { id: 'c1', type: 'molotov', n: 1, x: 32.6, z: 18.4 },
  { id: 'c2', type: 'molotov', n: 1, x: 33.2, z: 17.6 },
  { id: 'c3', type: 'ammo_pistol', n: 10, x: 40, z: 6 },
  { id: 'fuel1', type: 'mission_fuel', n: 1, anchor: 'fuel1' },
  { id: 'fuel2', type: 'mission_fuel', n: 1, anchor: 'fuel2' },
  { id: 'd1', type: 'weapon_smg', n: 1, anchor: 'smg' },
  { id: 'd2', type: 'ammo_smg', n: 30, anchor: 'smgAmmo' },
  { id: 'd3', type: 'ammo_pistol', n: 12, x: 22, z: 112.3, y: 0.86 },
  { id: 'd4', type: 'tonic', n: 1, x: 24, z: 127.2, y: 0.86 },
  { id: 'd5', type: 'ammo_shotgun', n: 6, x: 38.4, z: 124 },
  { id: 'e1', type: 'ammo_smg', n: 20, x: -8.5, z: 124 },
  { id: 'e2', type: 'tonic', n: 1, x: -10.2, z: 140 },
  { id: 'e3', type: 'grenade', n: 1, x: -16, z: 120 },
  { id: 'e4', type: 'ammo_shotgun', n: 6, x: -15.5, z: 141 },
  { id: 'f1', type: 'medkit', n: 1, x: 18, z: 184 },
  { id: 'f2', type: 'ammo_smg', n: 25, x: 34, z: 168.5 },
  { id: 'f3', type: 'molotov', n: 1, x: 24.5, z: 183.5 },
  { id: 'dyn', type: 'mission_dynamite', n: 1, anchor: 'dynamite' },
  { id: 'g1', type: 'tonic', n: 1, x: -19.6, z: 73.6, y: 0.86 },
  { id: 'g2', type: 'ammo_pistol', n: 15, x: -20.2, z: 73.4, y: 0.86 },
  { id: 'h1', type: 'ammo_pistol', n: 10, x: -40, z: 41 },
  { id: 'h2', type: 'ammo_shotgun', n: 4, x: 44, z: 102 },
  { id: 'h3', type: 'tonic', n: 1, x: -44, z: 162 },
];

const CRATES = [
  { id: 'k1', x: -16.5, z: 8 },
  { id: 'k2', x: -40, z: 30, loot: 'ammo_pistol' },
  { id: 'k3', x: 26.5, z: 51.5 },
  { id: 'k4', x: 44.5, z: 8, loot: 'ammo_shotgun' },
  { id: 'k5', x: 30, z: 111.5 },
  { id: 'k6', x: -12.8, z: 116 },
  { id: 'k7', x: 20, z: 171, loot: 'tonic' },
  { id: 'k8', x: 46, z: 172 },
  { id: 'k9', x: -46, z: 40.5 },
  { id: 'k10', x: 46, z: 98 },
];

const DRUMS = [
  { id: 'r1', x: 27, z: 9.5 },
  { id: 'r2', x: 21.5, z: 9 },
  { id: 'r3', x: 37.5, z: 21 },
  { id: 'r4', x: -18, z: 108 },
  { id: 'r5', x: 10.5, z: 136 },
  { id: 'r6', x: 26, z: 180 },
  { id: 'r7', x: -6.5, z: 182 },
  { id: 'r8', x: 6.5, z: 182.5 },
];

const NOTE_DEFS = [
  { id: 'jornal', anchor: 'noteJornal' },
  { id: 'ordem', anchor: 'noteOrdem' },
  { id: 'farmacia', anchor: 'noteFarmacia' },
  { id: 'helena2', anchor: 'noteHelena2' },
  { id: 'acougue', anchor: 'noteAcougue' },
];

const CHECKPOINTS = {
  cp1: { x: 0, z: -18, yaw: 0 },
  alley: { x: -17.5, z: 70, yaw: Math.PI / 2 },
  market: { x: -6, z: 130, yaw: -Math.PI / 2 },
  bridge: { x: 0, z: 172, yaw: 0 },
};

const met = (L) => !!L.flags.metGroup;
const ZONES = [
  { id: 'start', x: 0, z: 14, r: 36, list: [{ k: 'v', x: 3, z: 20, idle: 'wander' }, { k: 'v', x: -4, z: 27, idle: 'idle', yaw: 2.6 }, { k: 'dragger', x: 8.6, z: 23, idle: 'dormant', yaw: -1.2 }, { k: 'v', x: 6, z: 32, idle: 'wander', female: true }] },
  { id: 'praca', x: -30, z: 14, r: 30, list: [{ k: 'v', x: -27, z: 8, idle: 'idle', yaw: 1 }, { k: 'v', x: -31, z: 20, idle: 'wander' }, { k: 'v', x: -38, z: 14, idle: 'talk', yaw: 1.5 }, { k: 'v', x: -36, z: 15.5, idle: 'talk', yaw: -1.6 }, { k: 'bloater', x: -40, z: 8, idle: 'idle' }, { k: 'dog', x: -22, z: 29, idle: 'idle' }, { k: 'dog', x: -23.5, z: 28, idle: 'idle' }] },
  { id: 'aveA', x: 0, z: 40, r: 30, when: (L) => !met(L), list: [{ k: 'v', x: -24, z: 41, idle: 'wander' }, { k: 'runner', x: 26, z: 38, idle: 'idle', yaw: -1.5 }] },
  { id: 'pharm', x: 21, z: 56, r: 30, when: met, list: [{ k: 'v', x: 19, z: 53, idle: 'idle' }, { k: 'v', x: 22, z: 59.5, idle: 'idle', yaw: 3 }, { k: 'v', x: 14, z: 68, idle: 'wander' }, { k: 'stalker', x: 27.5, z: 51.5, idle: 'idle' }, { k: 'spitter', x: 7, z: 84, idle: 'idle', yaw: 3.1 }] },
  { id: 'gas', x: 30, z: 15, r: 32, when: met, list: [{ k: 'burner', x: 24, z: 11.5, idle: 'idle' }, { k: 'burner', x: 36.5, z: 22.5, idle: 'wander' }, { k: 'v', x: 28.5, z: 4, idle: 'idle' }, { k: 'v', x: 40, z: 27, idle: 'wander' }, { k: 'dog', x: 18, z: 27, idle: 'idle' }, { k: 'dog', x: 19.4, z: 28, idle: 'idle' }] },
  { id: 'police', x: 26, z: 120, r: 34, when: met, list: [{ k: 'shield', x: 10.6, z: 117, idle: 'idle', yaw: -1.6 }, { k: 'shield', x: 10.4, z: 123.5, idle: 'idle', yaw: -1.6 }, { k: 'shield', x: 26.5, z: 119, idle: 'idle', yaw: -1.5 }, { k: 'v', x: 22, z: 113, idle: 'idle' }, { k: 'v', x: 35.5, z: 127.5, idle: 'idle' }, { k: 'dog', x: 8, z: 140, idle: 'idle' }, { k: 'dog', x: 9.5, z: 141.2, idle: 'idle' }, { k: 'screamer', x: 20, z: 103, idle: 'idle', yaw: 3 }] },
  { id: 'marketOut', x: -12, z: 126, r: 32, when: met, list: [{ k: 'v', x: -5, z: 118, idle: 'wander' }, { k: 'v', x: -8, z: 141, idle: 'idle' }, { k: 'v', x: -22, z: 103, idle: 'wander' }, { k: 'bloater', x: -11, z: 150, idle: 'idle' }, { k: 'spitter', x: -26, z: 101, idle: 'idle' }, { k: 'runner', x: 6, z: 132, idle: 'idle' }] },
  { id: 'obra', x: 30, z: 177, r: 32, when: met, list: [{ k: 'brute', x: 36, z: 179, idle: 'idle', yaw: -1.6 }, { k: 'runner', x: 20, z: 172, idle: 'idle' }, { k: 'runner', x: 24, z: 184, idle: 'wander' }, { k: 'v', x: 44, z: 170, idle: 'idle' }, { k: 'v', x: 9, z: 168, idle: 'wander' }] },
  { id: 'bridge', x: 0, z: 180, r: 24, when: (L) => L.flags.m5open, list: [{ k: 'bloater', x: -4, z: 185.5, idle: 'idle' }, { k: 'bloater', x: 4.5, z: 185, idle: 'idle' }, { k: 'shield', x: -1.5, z: 186.5, idle: 'idle', yaw: Math.PI }, { k: 'shield', x: 2, z: 186.6, idle: 'idle', yaw: Math.PI }] },
  { id: 'sideW', x: -38, z: 40, r: 30, when: met, list: [{ k: 'v', x: -44, z: 38, idle: 'wander' }, { k: 'v', x: -32, z: 43, idle: 'idle' }, { k: 'dragger', x: -50, z: 41, idle: 'dormant' }] },
  { id: 'sideE', x: 38, z: 100, r: 30, when: met, list: [{ k: 'v', x: 34, z: 97, idle: 'wander' }, { k: 'v', x: 46, z: 102, idle: 'idle' }, { k: 'runner', x: 52, z: 99, idle: 'idle' }] },
  { id: 'side3', x: -38, z: 160, r: 30, when: met, list: [{ k: 'v', x: -30, z: 158, idle: 'wander' }, { k: 'v', x: -46, z: 162, idle: 'idle' }, { k: 'dog', x: -52, z: 160, idle: 'idle' }, { k: 'dog', x: -53, z: 161.4, idle: 'idle' }] },
  { id: 'side4', x: 36, z: 160, r: 28, when: met, list: [{ k: 'v', x: 30, z: 157, idle: 'wander' }, { k: 'spitter', x: 50, z: 161, idle: 'idle' }, { k: 'dragger', x: 22, z: 163.5, idle: 'dormant' }] },
  { id: 'aveB', x: 0, z: 100, r: 30, when: met, list: [{ k: 'v', x: 2, z: 92, idle: 'wander' }, { k: 'dragger', x: -8.5, z: 96, idle: 'dormant' }, { k: 'runner', x: -3, z: 108, idle: 'idle' }] },
];

// Missões (estado a partir das flags).
function missionState(L) {
  const f = L.flags,
    P = L.G.player;
  return [
    { ...MISSIONS[2][0], done: !!f.m1, target: P.keys.mission_meds ? JORGE : { x: 27, z: 57 }, deliver: !!P.keys.mission_meds },
    { ...MISSIONS[2][1], done: !!f.m2, target: (P.keys.mission_fuel || 0) >= 2 ? GEN : { x: 30, z: 15 }, deliver: (P.keys.mission_fuel || 0) >= 2 },
    { ...MISSIONS[2][2], done: !!f.m3, target: RADIO },
    { ...MISSIONS[2][3], done: !!f.m4, target: f.butcherDead ? { x: -45.6, z: 141 } : { x: -14, z: 130 } },
    { ...MISSIONS[2][4], done: !!f.m5, locked: !f.m5open, target: P.keys.mission_dynamite ? BARRICADE : { x: 37, z: 182 } },
  ];
}

// ======================================================================= NPCs
function spawnGroup(L, where) {
  const G = L.G,
    N = G.npcs,
    f = L.flags;
  N.clear();
  if (where === 'none') return;
  const zeca = N.spawn({ id: 'zeca', name: 'Zeca', look: LOOKS.zeca, x: -15.4, y: 3.12, z: 66.6, yaw: Math.PI / 2, weapon: 'rifle', mode: 'lookout', guard: 34, solid: false });
  void zeca;
  if (where === 'ambush') return;
  N.spawn({ id: 'tiao', name: 'Tião', look: LOOKS.tiao, x: -15.6, z: 71.6, yaw: Math.PI / 2, weapon: 'shotgun', guard: 16 });
  N.spawn({ id: 'cida', name: 'Dona Cida', look: LOOKS.cida, x: -23.6, z: 72.1, yaw: Math.PI * 0.85, mode: 'cook' });
  N.spawn({ id: 'rafa', name: 'Rafa', look: LOOKS.rafa, x: -27.5, z: 66.6, yaw: 0.3, weapon: 'bat', mode: 'sit' });
  N.spawn({ id: 'jorge', name: 'Jorge', look: LOOKS.jorge, x: f.m1 ? -31.6 : JORGE.x, z: f.m1 ? 74.2 : JORGE.z, yaw: f.m1 ? Math.PI : 0, mode: f.m1 ? 'sitGround' : 'wounded', solid: false });
  if (where === 'farewell' || f.farewell) {
    N.spawn({ id: 'clara', name: 'Clara', look: LOOKS.clara, x: -21, z: 70, yaw: Math.PI / 2, weapon: 'pistol' });
    return;
  }
  const cp = CHECKPOINTS[L.state.cp] || CHECKPOINTS.alley;
  const c = N.spawn({ id: 'clara', name: 'Clara', look: LOOKS.clara, x: cp.x - Math.sin(cp.yaw) * 2, z: cp.z - Math.cos(cp.yaw) * 2 + 0.8, yaw: cp.yaw, companion: true });
  c.mode = 'follow';
}

function lightsOn(L, on) {
  const c = L.c;
  for (const m of c.bulbs) m.material = on ? c.bulbOn : c.bulbOff;
  if (on && !c.bulbLights.length) {
    for (const p of [
      [-17, 3.0, 70],
      [-30, 3.0, 70],
    ])
      c.bulbLights.push(L.G.fx.lights.add({ x: p[0], y: p[1], z: p[2], color: 0xffd7a0, intensity: 9, range: 12, flicker: 0.05, priority: 6 }));
  }
}

function setShutter(L, closed) {
  const c = L.c;
  c.shutterClosed = closed;
  c.shutterCol.enabled = closed;
}

function setBarricade(L, present) {
  const c = L.c;
  c.barricade.visible = present;
  for (const col of c.barricadeCols) col.enabled = present;
}

function spawnButcher(L) {
  const G = L.G;
  if (G.enemies.boss || L.flags.butcherDead) return;
  G.enemies.spawn('butcher', -42.6, 130, { yaw: -Math.PI / 2, arena: MARKET });
}

function lockMarket(L) {
  const G = L.G;
  L.flags.arena = true;
  setShutter(L, true);
  L.c.anim.push({ k: 'shutter', t: 0, dur: 0.6, to: 1 });
  G.audio.slam({ x: HALL.x1, z: 130 }, 1.0);
  spawnButcher(L);
  if (G.enemies.boss) G.enemies.boss.wake();
  G.ui.bossIntro('O Açougueiro', 'Sebastião, dono do Mercado Municipal');
  const comp = G.npcs.companion;
  if (comp && Math.hypot(comp.pos.x - G.player.pos.x, comp.pos.z - G.player.pos.z) > 4) comp.respawnNear();
}

function missionDone(L, n, text) {
  const G = L.G,
    f = L.flags;
  if (f['m' + n]) return;
  f['m' + n] = true;
  G.audio.keyItem();
  G.ui.msg(`Missão cumprida: ${MISSIONS[2][n - 1].title}`, true);
  if (text) G.ui.say(text[0], text[1], 4);
  if (f.m1 && f.m2 && f.m3 && f.m4 && !f.m5open) {
    f.m5open = true;
    G.game.after(4.5, () => {
      G.ui.say('Clara', 'O Tião falou da ponte norte: o exército bloqueou. Tem dinamite na obra da Rua da Ponte.', 6);
      G.ui.msg('Nova missão: A saída norte', true);
    });
  }
}

// ======================================================================= cenas
function heliIntro(L) {
  const G = L.G;
  G.heli.flyover(
    [
      [30, 46, -90],
      [2, 34, -22],
      [-8, 30, 50],
      [-30, 40, 170],
    ],
    20,
    { searchTarget: null },
  );
  G.cutscene.play(
    [
      { player: { pose: 'lookUp', face: [0, 10] } },
      { cam: { pos: [1.6, 1.0, -21.5], look: [-0.5, 6, -10], dur: 0.01 } },
      { wait: 1.2 },
      { cam: { pos: [1.2, 1.1, -21], look: [2, 26, -18], dur: 2.6 } },
      { say: ['Ryan', 'Um helicóptero!'], dur: 2.0 },
      { cam: { pos: [-2.5, 1.4, -16], look: [-6, 22, 20], dur: 3.0 } },
      { say: ['Ryan', 'Ei! Aqui embaixo! AQUI!'], dur: 2.4 },
      { wait: 1.2 },
      { player: { pose: null } },
      { cam: { pos: [0.6, 1.9, -21], look: [0, 1.4, 0], dur: 2.0 } },
      { say: ['Ryan', 'Não vão descer... Nem olharam para baixo.'], dur: 2.8 },
      { say: ['Ryan', 'O posto de evacuação da Praça da Estação. Helena e Bia passaram por lá.'], dur: 3.4 },
    ],
    () => {
      G.heli.setAuto(HELI_ROUTES, [70, 120]);
      G.game.leaveCutscene();
    },
  );
}

const HELI_ROUTES = [
  [
    [80, 40, -40],
    [0, 32, 60],
    [-90, 40, 160],
  ],
  [
    [-90, 38, 20],
    [10, 30, 110],
    [90, 42, 220],
  ],
  [
    [60, 36, 240],
    [-5, 30, 120],
    [-70, 40, -30],
  ],
];

function confrontation(L) {
  const G = L.G,
    N = G.npcs,
    P = G.player;
  clearAround(G, 0, 62, 48);
  for (const e of G.enemies.list) if (e.alive && !e.isBoss && e.alert) e.remove();
  G.proj.clear();
  spawnGroup(L, 'ambush');
  const tiao = N.spawn({ id: 'tiao', name: 'Tião', look: LOOKS.tiao, x: -11, z: 69.5, yaw: Math.PI / 2, weapon: 'shotgun' });
  const rafa = N.spawn({ id: 'rafa', name: 'Rafa', look: LOOKS.rafa, x: -11.4, z: 71.6, yaw: Math.PI / 2, weapon: 'bat' });
  const clara = N.spawn({ id: 'clara', name: 'Clara', look: LOOKS.clara, x: 9.6, z: 48, yaw: -0.5, companion: true });
  clara.mode = 'idle';
  void tiao;
  void rafa;
  const px = clamp(P.pos.x, -3, 3);
  G.cutscene.play(
    [
      { player: { walk: [[px, 58]], speed: 1.4 }, async: true },
      { cam: { pos: [px + 1.2, 2.0, 52.5], look: [0, 1.4, 63], dur: 0.01 } },
      { wait: 0.6 },
      { say: ['Tião', 'PARADO AÍ!'], dur: 1.4 },
      { npc: 'tiao', walk: [[-6, 66], [-2.4, 62.4]], speed: 4.2, async: true },
      { npc: 'rafa', walk: [[-6, 68], [2.6, 62.2]], speed: 4.6, async: true },
      { npc: 'clara', walk: [[6, 51], [1.6, 54.4]], speed: 4.2, async: true },
      { cam: { pos: [6.5, 3.4, 55], look: [-0.5, 1.2, 60.5], dur: 2.2 } },
      { wait: 3.9 },
      { npc: 'tiao', mode: 'aim', face: [px, 58] },
      { npc: 'rafa', mode: 'threat', face: [px, 58] },
      { npc: 'clara', mode: 'aim', face: [px, 58] },
      { player: { face: [-2.4, 62.4] } },
      { cam: { pos: [-1.0, 1.75, 59.6], look: [-2.4, 1.55, 62.4], dur: 1.0 } },
      { say: ['Tião', 'Larga essa arma! Devagar!'], dur: 2.2 },
      { player: { pose: 'handsUp' } },
      { cam: { pos: [px + 0.7, 1.7, 60.3], look: [px, 1.55, 58], dur: 1.2 } },
      { say: ['Rafa', 'Olha os olhos dele, Tião! Vê se tão vermelhos!'], dur: 2.6 },
      { npc: 'clara', walk: [[px + 0.9, 56.6]], speed: 1.2 },
      { npc: 'clara', face: [px, 58] },
      { cam: { pos: [px + 2.6, 1.6, 57.8], look: [px + 0.5, 1.5, 57.2], dur: 1.0 } },
      { say: ['Clara', 'Os olhos tão normais. Ele não tá infectado.'], dur: 2.6 },
      { cam: { pos: [px - 0.9, 1.7, 60.2], look: [px, 1.55, 58], dur: 1.0 } },
      { say: ['Ryan', 'Calma! Eu não sou um deles. Também sou um sobrevivente.'], dur: 3.0 },
      { say: ['Ryan', 'Meu nome é Ryan. Vim a pé do Vale dos Corvos.'], dur: 2.8 },
      { cam: { pos: [-0.2, 1.8, 59.8], look: [-2.4, 1.6, 62.4], dur: 1.0 } },
      { say: ['Tião', 'Ryan... Do Vale? Ninguém sai vivo do Vale.'], dur: 2.6 },
      { say: ['Ryan', 'Eu saí. Estou procurando minha mulher e minha filha. Helena e Bia.'], dur: 3.0 },
      { npc: 'tiao', mode: 'idle' },
      { npc: 'rafa', mode: 'idle' },
      { npc: 'clara', mode: 'idle' },
      { player: { pose: null } },
      { cam: { pos: [5.5, 2.4, 56.5], look: [0, 1.3, 60], dur: 1.6 } },
      { say: ['Tião', 'Abaixa isso, Rafa. Desculpa o susto, Ryan. Aqui fora, quem não atira primeiro não dura.'], dur: 3.6 },
      { say: ['Clara', 'Eu sou a Clara. Esse é o Tião, e esse esquentado é o Rafa.'], dur: 3.0 },
      { say: ['Tião', 'Não dá pra conversar no meio da avenida. Vem com a gente.'], dur: 2.8 },
      { npc: 'tiao', walk: [[-6, 66], [-12, 70], [-18, 70.5]], speed: 1.8, async: true },
      { npc: 'rafa', walk: [[-5, 67], [-12, 70], [-20, 69]], speed: 1.8, async: true },
      { npc: 'clara', walk: [[-4, 64], [-12, 70], [-16.5, 68.6]], speed: 1.8, async: true },
      { player: { walk: [[-3, 63], [-11, 70], [-15, 70.2]], speed: 1.8 }, async: true },
      { cam: { pos: [-2, 4, 58], look: [-10, 1.5, 68], dur: 3.5 } },
      { wait: 2.5 },
      { fade: 1, dur: 0.9 },
      { do: () => tourPositions(L) },
      { fade: 0, dur: 0.6 },
      ...tourSteps(L),
    ],
    () => {
      endTour(L);
      G.game.leaveCutscene();
    },
  );
}

function tourPositions(L) {
  const G = L.G,
    N = G.npcs;
  const set = (id, x, z, yaw, mode) => {
    const n = N.get(id);
    if (!n) return;
    n.teleport(x, z, yaw);
    n.path = null;
    if (mode) n.mode = mode;
  };
  set('tiao', -18, 70.6, -Math.PI / 2, 'idle');
  set('rafa', -20, 68.6, -Math.PI / 2, 'idle');
  set('clara', -16.6, 68.4, -Math.PI / 2, 'idle');
  G.player.pos.set(-14.6, 0, 70.4);
  G.player.yaw = -Math.PI / 2;
  if (!N.get('cida')) N.spawn({ id: 'cida', name: 'Dona Cida', look: LOOKS.cida, x: -23.6, z: 72.1, yaw: Math.PI * 0.85, mode: 'cook' });
  if (!N.get('jorge')) N.spawn({ id: 'jorge', name: 'Jorge', look: LOOKS.jorge, x: JORGE.x, z: JORGE.z, yaw: 0, mode: 'wounded', solid: false });
}

function tourSteps(L) {
  const G = L.G;
  return [
    { cam: { pos: [-12.5, 2.4, 70.2], look: [-28, 1.3, 70.5], dur: 0.01 } },
    { say: ['Tião', 'É aqui que a gente mora. Não é muito, mas os infectados não entram no beco.'], dur: 3.6 },
    { cam: { pos: [-19.5, 1.7, 72.8], look: [-15.4, 4.6, 66.6], dur: 2.2 } },
    { say: ['Tião', 'Aquele lá em cima é o Zeca. Sempre tem alguém vigiando, dia e noite.'], dur: 3.2 },
    { say: ['Tião', 'Se eles vierem, a gente sabe antes. Foi assim que a gente sobreviveu até agora.'], dur: 3.4 },
    { say: ['Zeca', 'Avenida limpa, Tião! Nada se mexendo!'], dur: 2.4 },
    { cam: { pos: [-20.5, 1.7, 73.4], look: [-25, 1.0, 70.6], dur: 2.0 } },
    { npc: 'cida', face: [-14.6, 70.4] },
    { say: ['Dona Cida', 'Mais um? Senta, meu filho. Tem sopa de lata e café requentado.'], dur: 3.2 },
    { cam: { pos: [-29.5, 1.5, 69.4], look: [-33, 0.4, 67.4], dur: 2.0 } },
    { say: ['Clara', 'Aquele é o Jorge. Foi mordido no braço faz dois dias. A febre não baixa.'], dur: 3.4 },
    { say: ['Jorge', 'Eu tô bem... Só preciso dormir um pouco.'], dur: 2.4 },
    // o helicóptero passa por cima do beco
    {
      do: () =>
        G.heli.flyover(
          [
            [70, 40, 25],
            [-22, 30, 72],
            [-120, 40, 128],
          ],
          21,
          { searchTarget: { x: -24, z: 70 } },
        ),
    },
    { wait: 1.2 },
    { say: ['Zeca', 'HELICÓPTERO! Helicóptero vindo pela avenida!'], dur: 2.2 },
    { npc: 'rafa', walk: [[-23, 69.5]], speed: 4 },
    { npc: 'rafa', mode: 'wave' },
    { player: { pose: 'lookUp' } },
    { npc: 'clara', mode: 'lookUp' },
    { npc: 'tiao', mode: 'lookUp' },
    { cam: { pos: [-26.5, 1.2, 71.5], look: [-18, 24, 70], dur: 2.0 } },
    { say: ['Rafa', 'AQUI! AQUI EMBAIXO! A GENTE TÁ VIVO!'], dur: 2.6 },
    { wait: 2.2 },
    { npc: 'rafa', mode: 'idle' },
    { npc: 'clara', mode: 'idle' },
    { npc: 'tiao', mode: 'idle' },
    { player: { pose: null } },
    { cam: { pos: [-21.5, 1.8, 72.6], look: [-17, 1.4, 69.8], dur: 1.6 } },
    { say: ['Tião', 'Não adianta, Rafa. Eles nunca pousam. Passam toda noite, olham e vão embora.'], dur: 3.4 },
    { say: ['Ryan', 'Minha família passou pelo posto da Praça da Estação. Vocês sabem para onde levaram o pessoal?'], dur: 3.6 },
    { say: ['Tião', 'O exército levou todo mundo faz uma semana. O rádio da delegacia pegava a frequência deles.'], dur: 3.6 },
    { say: ['Tião', 'Faz o seguinte: ajuda a gente, que a gente te ajuda. Remédio pro Jorge, combustível pro gerador, comida...'], dur: 4.2 },
    { say: ['Clara', 'Eu vou com ele. Conheço essas ruas melhor que ninguém.'], dur: 2.8 },
    { say: ['Tião', 'Então vai. E volta inteira, Clara.'], dur: 2.4 },
  ];
}

function endTour(L) {
  const G = L.G,
    N = G.npcs,
    f = L.flags;
  f.metGroup = true;
  // posições de vida normal no beco
  const t = N.get('tiao');
  if (t) {
    t.teleport(-15.6, 71.6, Math.PI / 2);
    t.mode = 'idle';
    t.guard = 16;
    t.baseMode = 'idle';
  }
  const r = N.get('rafa');
  if (r) {
    r.teleport(-27.5, 66.6, 0.3);
    r.mode = 'sit';
  }
  const c = N.get('clara');
  if (c) {
    c.mode = 'follow';
    c.teleport(-16.5, 68.4, Math.PI / 2);
  }
  G.heli.setAuto(HELI_ROUTES, [70, 120]);
  L.checkpoint('alley');
  f.alleySig = progressSig(L);
  G.ui.msg('Missões disponíveis: aperte M para ver o mapa.', true);
}

function radioScene(L) {
  const G = L.G;
  G.audio.radio(9);
  G.cutscene.play(
    [
      { cam: { pos: [RADIO.x - 1.4, 1.7, RADIO.z + 1.3], look: [RADIO.x, 1.0, RADIO.z], dur: 0.01 } },
      { say: ['Rádio', '...aqui é a Operação Cerca... repito... Ferrópolis evacuada... estática...'], dur: 3.4 },
      { say: ['Rádio', '...sobreviventes sem sintomas devem seguir para o Campo Esperança, na Represa da Aurora...'], dur: 3.8 },
      { say: ['Rádio', '...civis de interesse encaminhados ao Abrigo Têmpera, por ordem do doutor Vidal... câmbio.'], dur: 3.8 },
      { cam: { pos: [RADIO.x - 2.2, 1.75, RADIO.z + 0.2], look: [RADIO.x - 0.6, 1.5, RADIO.z + 0.6], dur: 1.2 } },
      { say: ['Ryan', 'Campo Esperança... A Helena e a Bia estão lá. Têm que estar.'], dur: 3.0 },
      { say: ['Ryan', '"Civis de interesse"... O que esse doutor quer com as pessoas?'], dur: 3.0 },
    ],
    () => {
      missionDone(L, 3, ['Clara', 'A represa fica depois da ponte norte. Mas a ponte tá bloqueada pelo exército.']);
      G.game.leaveCutscene();
    },
  );
}

function farewell(L) {
  const G = L.G,
    N = G.npcs;
  L.flags.farewell = true;
  clearAround(G, -20, 70, 40);
  N.clear();
  spawnGroup(L, 'farewell');
  const set = (id, x, z, yaw, mode) => {
    const n = N.get(id);
    if (!n) return;
    n.teleport(x, z, yaw);
    if (mode) n.mode = mode;
    n.guard = 0;
  };
  set('tiao', -19.5, 72.4, -2.2, 'idle');
  set('cida', -23.4, 72.4, -2.0, 'idle');
  set('rafa', -22, 68.2, -1.0, 'idle');
  set('jorge', -24.6, 68.6, -1.2, 'idle');
  set('clara', -18.4, 68.7, -0.9, 'idle');
  G.player.pos.set(-16.4, 0, 70.4);
  G.player.yaw = -Math.PI / 2;
  G.cutscene.play(
    [
      { cam: { pos: [-15, 2.2, 74.2], look: [-21, 1.3, 70.2], dur: 0.01 } },
      { say: ['Tião', 'A ponte norte tá aberta. A estrada pra represa tá livre.'], dur: 3.0 },
      { say: ['Ryan', 'O rádio falou do Campo Esperança. Se a Helena e a Bia estão vivas, estão lá.'], dur: 3.4 },
      { cam: { pos: [-20, 1.7, 74.6], look: [-23.4, 1.5, 72.4], dur: 1.4 } },
      { say: ['Dona Cida', 'Fica com a gente, menino. Aqui tem comida, tem fogo... tem gente.'], dur: 3.4 },
      { cam: { pos: [-18.6, 1.75, 71.6], look: [-16.4, 1.55, 70.4], dur: 1.2 } },
      { say: ['Ryan', 'Eu queria, Dona Cida. De verdade.'], dur: 2.4 },
      { say: ['Ryan', 'Mas eu prometi pra Bia que ia buscar ela. De qualquer jeito.'], dur: 3.2 },
      { cam: { pos: [-21.5, 1.6, 70.4], look: [-24.6, 1.5, 68.6], dur: 1.2 } },
      { say: ['Jorge', 'Graças a você eu tô de pé de novo. Vai buscar a tua família, Ryan.'], dur: 3.2 },
      { npc: 'clara', walk: [[-17.4, 69.8]], speed: 1.2 },
      { npc: 'clara', face: [-16.4, 70.4] },
      { cam: { pos: [-16.8, 1.7, 72.2], look: [-17.4, 1.55, 69.8], dur: 1.2 } },
      { say: ['Clara', 'Eu ia contigo. Mas eles precisam de mim aqui.'], dur: 2.8 },
      { say: ['Clara', 'Leva o rifle do meu pai. Lá na serra você vai precisar enxergar longe.'], dur: 3.2 },
      {
        do: () => {
          const P = G.player;
          if (!P.weapons.rifle.owned) P.addItem('weapon_rifle', 1);
          P.ammo.rifle += 8;
          G.audio.keyItem();
        },
      },
      { say: ['Ryan', 'Obrigado, Clara. Por tudo.'], dur: 2.2 },
      { cam: { pos: [-18.2, 2.2, 68.6], look: [-15.4, 4.2, 66.6], dur: 1.4 } },
      { say: ['Zeca', 'Se um dia voltar, assobia três vezes. Eu abro a barricada.'], dur: 3.0 },
      { cam: { pos: [-22.5, 2.0, 71.5], look: [-17, 1.4, 70.2], dur: 1.4 } },
      { say: ['Tião', 'Boa sorte, Ryan. Que Deus te leve até elas.'], dur: 2.8 },
      { player: { walk: [[-12, 70.2], [-4, 70.5], [1, 80]], speed: 1.6 }, async: true },
      { npc: 'rafa', mode: 'wave' },
      { npc: 'clara', mode: 'wave' },
      { cam: { pos: [-24, 1.8, 70.4], look: [-12, 1.4, 70.3], dur: 3.0 } },
      { wait: 2.2 },
      {
        do: () =>
          G.heli.flyover(
            [
              [-60, 38, 20],
              [-8, 30, 78],
              [70, 42, 190],
            ],
            19,
            { searchTarget: null },
          ),
      },
      { cam: { pos: [-6, 6, 50], look: [-2, 22, 90], dur: 4.5 } },
      { wait: 2.0 },
      { say: ['Ryan', 'Aguenta firme, Bia. O pai está chegando.'], dur: 3.0 },
      { cam: { pos: [-20, 48, 20], look: [0, 0, 110], dur: 4.0 } },
      { wait: 1.5 },
      { fade: 1, dur: 1.4 },
    ],
    () => G.game.completeChapter(),
  );
}

function progressSig(L) {
  const f = L.flags,
    P = L.G.player;
  return [f.m1, f.m2, f.m3, f.m4, f.m5, f.butcherDead, P.keys.mission_meds, P.keys.mission_fuel, P.keys.mission_dynamite, P.weapons.smg.owned, P.weapons.magnum.owned].map((v) => (v ? (v === true ? 1 : v) : 0)).join('');
}

// ======================================================================= capítulo
const FOG_COLOR = new THREE.Color(0x141922);
const FOG_WARM = new THREE.Color(0x1c1612);

const chapter2 = {
  id: 2,
  key: 'c2',
  seed: 7070,
  name: 'Capítulo 2',
  title: 'Ferrópolis',
  text: CHAPTER_TEXT[2],
  bounds: { minX: -62, minZ: -24, maxX: 62, maxZ: 206 },
  start: { x: 0, z: -18, yaw: 0 },
  firstCheckpoint: 'cp1',
  checkpoints: CHECKPOINTS,
  pickups: PICKUPS,
  crates: CRATES,
  drums: DRUMS,
  notes: NOTE_DEFS,
  sky: { top: 0x080a12, mountains: 0x0b0d12, mountainScale: 0.75, moonLight: 1.9, hemi: 1.95, hemiSky: 0x56668e, hemiGround: 0x2a231e },
  grass: null,

  build(w) {
    buildGround(w);
    buildBounds(w);
    buildBlocks(w);
    buildStation(w);
    buildAlley(w);
    buildPharmacy(w);
    buildGasStation(w);
    buildPolice(w);
    buildMarket(w);
    buildConstruction(w);
    buildStreetProps(w);
  },

  fog(px, pz, out) {
    const warm = inAlley(px, pz) ? 0.7 : 0;
    out.color.copy(FOG_COLOR).lerp(FOG_WARM, warm);
    out.density = 0.026 + smoothstep(150, 185, pz) * 0.008;
  },

  groundY(x, z) {
    if (z > RIVER.z0 && z < RIVER.z1 && Math.abs(x) > 6) return RIVER.y;
    return 0;
  },

  surface() {
    return 'stone';
  },

  map: {
    bounds: { minX: -62, maxX: 62, minZ: -24, maxZ: 206 },
    ground: '#202224',
    shapes: [
      { t: 'rect', x: 0, z: 90, w: 20, d: 230, c: '#3a3c3e' },
      { t: 'rect', x: 0, z: 40, w: 124, d: 12, c: '#3a3c3e' },
      { t: 'rect', x: 0, z: 100, w: 124, d: 12, c: '#3a3c3e' },
      { t: 'rect', x: 0, z: 160, w: 124, d: 12, c: '#3a3c3e' },
      { t: 'rect', x: -29, z: 11, w: 34, d: 38, c: '#34322e' },
      { t: 'rect', x: 30, z: 15, w: 32, d: 30, c: '#34322e' },
      { t: 'rect', x: -24.5, z: 70, w: 27, d: 10, c: '#5a4630' },
      { t: 'rect', x: 21, z: 55, w: 18, d: 14, c: '#2e4a34' },
      { t: 'rect', x: 27.5, z: 120, w: 27, d: 20, c: '#2e3a52' },
      { t: 'rect', x: -31, z: 130, w: 34, d: 28, c: '#52302a' },
      { t: 'rect', x: 31, z: 176.5, w: 34, d: 19, c: '#4a4430' },
      { t: 'rect', x: 0, z: 194, w: 124, d: 12, c: '#1e3442' },
      { t: 'rect', x: 0, z: 194, w: 12, d: 14, c: '#4a4c4e' },
    ],
    labels: [
      { text: 'Praça da Estação', x: -29, z: 11 },
      { text: 'Beco', x: -26, z: 70, c: '#e0b070' },
      { text: 'Farmácia', x: 21, z: 55 },
      { text: 'Posto', x: 30, z: 15 },
      { text: 'Delegacia', x: 27.5, z: 120 },
      { text: 'Mercado', x: -31, z: 130 },
      { text: 'Obra', x: 31, z: 176 },
      { text: 'Ponte Norte', x: 0, z: 199 },
      { text: 'Av. do Aço', x: 0, z: 22, c: '#6a6c6e' },
    ],
  },

  mapMarkers(L) {
    if (!L.flags.metGroup) return [];
    const out = [];
    for (const m of missionState(L)) {
      if (m.locked) continue;
      out.push({ x: m.target.x, z: m.target.z, kind: m.done ? 'done' : 'mission', label: m.title });
    }
    out.push({ x: -25, z: 70.5, kind: 'done', label: 'Beco' });
    return out;
  },

  titleCam(t, cam) {
    const a = t * 0.05 + 1.0;
    cam.position.set(-25 + Math.sin(a) * 7, 2.2 + Math.sin(t * 0.3) * 0.15, 70.5 + Math.cos(a) * 3.8);
    cam.lookAt(-25, 1.3, 70.5);
    return { x: -25, z: 70.5, yaw: a + Math.PI };
  },

  titleScene(L) {
    spawnGroup(L, 'farewell');
    const c = L.G.npcs.get('clara');
    if (c) c.teleport(-21.5, 69.5, -1.2);
  },

  // ----------------------------------------------------------------- objetos com estado
  setup(L) {
    const G = L.G,
      col = G.col,
      c = L.c,
      root = L.root;
    const C = cityMats(),
      m = mats();
    // luzes de varal do beco (ligam com o gerador)
    c.bulbOn = new THREE.MeshBasicMaterial({ color: 0xffd28a, toneMapped: false });
    c.bulbOff = new THREE.MeshStandardMaterial({ color: 0x3a3632, roughness: 0.4 });
    c.bulbs = [];
    c.bulbLights = [];
    for (let i = 0; i < 16; i++) {
      const x = -13.5 - i * 1.5,
        z = 70 + Math.sin(i * 1.3) * 3.6;
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), c.bulbOff);
      b.position.set(x, 2.9 + Math.sin(i * 0.9) * 0.15, z);
      root.add(b);
      c.bulbs.push(b);
    }
    // porta de enrolar do mercado
    c.shutter = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.6, 4.4), C.shutter);
    c.shutter.position.set(HALL.x1 + 0.1, 5.2, 130);
    c.shutter.castShadow = true;
    root.add(c.shutter);
    c.shutterCol = col.addBox(HALL.x1, 130, 0.5, 4.4, 0, { y0: 0, y1: 4.6, mat: 'metal' });
    // barricada do exército na ponte norte
    c.barricade = new THREE.Group();
    const conc = C.jersey;
    for (const x of [-4.8, -1.6, 1.6, 4.8]) {
      const j = new THREE.Mesh(new THREE.BoxGeometry(3.1, 1.1, 0.7), conc);
      j.position.set(x, 0.55, BARRICADE.z);
      j.castShadow = true;
      c.barricade.add(j);
    }
    const wire = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.02, 4, 10), m.iron);
    for (let i = 0; i < 14; i++) {
      const wr = wire.clone();
      wr.position.set(-5.6 + i * 0.86, 1.45, BARRICADE.z);
      wr.rotation.y = Math.PI / 2;
      c.barricade.add(wr);
    }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1), new THREE.MeshStandardMaterial({ color: 0xc8b878 }));
    sign.position.set(0, 1.9, BARRICADE.z - 0.4);
    sign.rotation.y = Math.PI;
    c.barricade.add(sign);
    root.add(c.barricade);
    c.barricadeCols = [col.addBox(0, BARRICADE.z, 12.2, 0.9, 0, { y0: 0, y1: 2, mat: 'stone' })];
    c.dyn = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.26, 8), m.tnt);
      s.rotation.z = Math.PI / 2;
      s.position.set(0, 0.6 + i * 0.07, BARRICADE.z - 0.42);
      c.dyn.add(s);
    }
    c.dyn.visible = false;
    root.add(c.dyn);
  },

  apply(L) {
    const G = L.G,
      c = L.c,
      f = L.flags;
    c.anim = [];
    c.plant = 0;
    c.radio = 0;
    c.fuse = -1;
    resetZones(L);
    lightsOn(L, !!f.m2);
    setShutter(L, false);
    c.shutter.position.y = 5.2;
    setBarricade(L, !f.m5);
    c.dyn.visible = false;
    f.arena = false;
    if (f.metGroup) spawnGroup(L, f.farewell ? 'farewell' : 'full');
    else spawnGroup(L, 'ambush');
    if (!f.butcherDead) spawnButcher(L);
    else {
      if (!L.state.taken.magnum) L.addPickup('magnum', 'weapon_magnum', 1, -44.5, 1.2, 128.4, true);
      if (!L.state.taken.food) L.addPickup('food', 'mission_food', 1, -45.6, 0.02, 141, true);
    }
    G.heli.setAuto(HELI_ROUTES, [70, 120]);
  },

  onStart(L) {
    heliIntro(L);
    return true;
  },

  onCheckpointLoad(L) {
    const G = L.G;
    const comp = G.npcs.companion;
    if (comp) comp.respawnNear();
  },

  update(L, dt) {
    const G = L.G,
      c = L.c,
      f = L.flags;
    for (const a of c.anim) {
      a.t += dt;
      const k = clamp(a.t / a.dur, 0, 1);
      if (a.k === 'shutter') c.shutter.position.y = lerp(a.to ? 5.2 : 2.3, a.to ? 2.3 : 5.2, k);
    }
    c.anim = c.anim.filter((a) => a.t < a.dur);
    if (G.state === 'play' || G.state === 'cutscene') updateZones(L, ZONES, dt);
    // pavio da dinamite
    if (c.fuse >= 0) {
      c.fuse -= dt;
      c.dyn.visible = true;
      if (Math.random() < 0.8) G.fx.sparks({ x: 0, y: 0.75, z: BARRICADE.z - 0.5 }, { x: 0, y: 1, z: -0.5 }, 1);
      if (c.fuse <= 0) {
        c.fuse = -1;
        c.dyn.visible = false;
        explode(G, BARRICADE.x, 1, BARRICADE.z, 7, 320, 70);
        G.fx.explosion({ x: -3, y: 1, z: BARRICADE.z }, 5);
        G.fx.explosion({ x: 3, y: 1, z: BARRICADE.z }, 5);
        G.fx.shake(1);
        setBarricade(L, false);
        G.nav.rebuild(G.col, 0.38, { minX: -8, minZ: BARRICADE.z - 3, maxX: 8, maxZ: BARRICADE.z + 3 });
        missionDone(L, 5, ['Clara', 'Conseguimos! A ponte tá livre! Vamos voltar pro beco.']);
        delete G.player.keys.mission_dynamite;
        G.game.after(3, () => {
          if (!G.player.dead) L.checkpoint('bridge');
        });
      }
    }
  },

  triggers(L) {
    const G = L.G,
      P = G.player,
      f = L.flags,
      c = L.c;
    const x = P.pos.x,
      z = P.pos.z;
    if (!f.metGroup && z > 55 && z < 70 && Math.abs(x) < 10.5) {
      confrontation(L);
      return;
    }
    if (f.metGroup && inAlley(x, z)) {
      // volta ao beco: salva o progresso
      const sig = progressSig(L);
      if (sig !== f.alleySig && !f.farewell) {
        f.alleySig = sig;
        L.checkpoint('alley');
      }
      if (f.m5 && !f.farewell) {
        farewell(L);
        return;
      }
    }
    // mercado: entra no galpão e a porta fecha
    if (f.metGroup && !f.butcherDead && !f.arena && x < HALL.x1 - 5 && x > HALL.x0 && z > HALL.z0 && z < HALL.z1) lockMarket(L);
    if (f.metGroup && !f.butcherDead && !f.cpMarket && x < -2 && x > -12 && z > 120 && z < 140) {
      f.cpMarket = true;
      L.checkpoint('market');
    }
    if (f.m5open && P.keys.mission_dynamite && !f.cpBridge && z > 166) {
      f.cpBridge = true;
      L.checkpoint('bridge');
    }
    void c;
  },

  onPickup(L, p) {
    const G = L.G,
      f = L.flags,
      P = G.player;
    if (p.type === 'mission_meds') G.ui.say('Clara', 'É isso! Antibiótico. Vamos levar pro Jorge, no beco.', 3.5);
    if (p.type === 'mission_fuel') {
      const n = P.keys.mission_fuel || 0;
      G.ui.say('Clara', n >= 2 ? 'Dois galões. Dá pra ligar o gerador do beco.' : 'Um galão. Falta o outro.', 3);
    }
    if (p.type === 'mission_food') {
      delete P.keys.mission_food;
      missionDone(L, 4, ['Clara', 'Comida pra semana inteira. A Dona Cida vai chorar.']);
    }
    if (p.type === 'mission_dynamite') G.ui.say('Clara', f.m5open ? 'Cuidado com isso. Agora é a barricada da ponte.' : 'Dinamite? Guarda. O Tião vai saber o que fazer com isso.', 3.5);
    if (p.type === 'weapon_smg') G.ui.say('Clara', 'Submetralhadora da polícia. Segura o gatilho, mas economiza bala.', 3.5);
    void f;
  },

  onNoteRead(L, id) {
    const G = L.G;
    if (id === 'helena2') G.game.after(0.2, () => G.ui.say('Ryan', 'Helena... Represa da Aurora. Estou indo.', 3));
  },

  interactables(L, consider) {
    const G = L.G,
      P = G.player,
      f = L.flags,
      c = L.c;
    if (!f.metGroup) return;
    if (P.keys.mission_meds && !f.m1) consider({ id: 'jorge' }, JORGE.x + 0.8, JORGE.z, 2.2, 'jorge');
    if ((P.keys.mission_fuel || 0) >= 2 && !f.m2) consider({ id: 'gen' }, GEN.x, GEN.z, 2.2, 'gen');
    if (!f.m3) consider({ id: 'radio' }, RADIO.x - 0.6, RADIO.z, 2.0, 'radio');
    if (P.keys.mission_dynamite && f.m5open && !f.m5 && c.fuse < 0) consider({ id: 'barricade' }, BARRICADE.x, BARRICADE.z - 1.2, 3.2, 'barricade');
    if (!f.farewell && inAlley(P.pos.x, P.pos.z)) {
      const t = G.npcs.get('tiao');
      if (t) consider(t, t.pos.x, t.pos.z, 2.0, 'talk', 0.5);
    }
  },

  prompt(L, best) {
    const c = L.c;
    if (best.kind === 'jorge') return { key: 'E', text: 'Dar o remédio para o Jorge' };
    if (best.kind === 'gen') return { key: 'E', text: 'Abastecer o gerador (2 galões)' };
    if (best.kind === 'radio') return { key: 'E', text: 'Ligar o rádio (segure)', hold: c.radio };
    if (best.kind === 'barricade') return { key: 'E', text: 'Armar a dinamite (segure)', hold: c.plant };
    if (best.kind === 'talk') return { key: 'E', text: 'Falar com o Tião' };
    return null;
  },

  interact(L, best, inp) {
    const G = L.G,
      P = G.player,
      f = L.flags,
      c = L.c,
      N = G.npcs;
    if (best.kind === 'jorge' && inp.pressed) {
      delete P.keys.mission_meds;
      const j = N.get('jorge');
      if (j) {
        j.mode = 'sitGround';
        j.teleport(-31.6, 74.2, Math.PI);
      }
      missionDone(L, 1, ['Dona Cida', 'Graças a Deus! Com isso a febre baixa até amanhã.']);
      return true;
    }
    if (best.kind === 'gen' && inp.pressed) {
      delete P.keys.mission_fuel;
      lightsOn(L, true);
      G.audio.rumble({ x: GEN.x, z: GEN.z }, 1.2);
      missionDone(L, 2, ['Zeca', 'Luz! Faz duas semanas que eu não via uma lâmpada acesa!']);
      return true;
    }
    if (best.kind === 'radio') {
      if (!inp.held) return false;
      c.radio = Math.min(1, c.radio + inp.dt / 2.2);
      if (Math.random() < inp.dt * 6) G.audio.ratchet({ x: RADIO.x, z: RADIO.z });
      if (c.radio >= 1 && !f.m3) {
        c.radio = 0;
        radioScene(L);
      }
      return false;
    }
    if (best.kind === 'barricade') {
      if (!inp.held) return false;
      c.plant = Math.min(1, c.plant + inp.dt / 2.0);
      if (c.plant >= 1 && c.fuse < 0) {
        c.plant = 0;
        c.fuse = 8;
        G.audio.fuse({ x: 0, z: BARRICADE.z });
        G.ui.msg('Dinamite armada! Afaste-se da barricada!', true);
        G.ui.say('Clara', 'Corre, Ryan! Eles ouviram a gente!', 3);
        G.enemies.spawnGroup(
          [
            { k: 'runner', x: -22, z: 160, idle: 'hunt' },
            { k: 'runner', x: 22, z: 161, idle: 'hunt' },
            { k: 'runner', x: 0, z: 150, idle: 'hunt' },
            { k: 'v', x: -10, z: 166, idle: 'hunt' },
          ],
          8,
        );
      }
      return false;
    }
    if (best.kind === 'talk' && inp.pressed) {
      const hint = !f.m5open
        ? 'Remédio na Farmácia Central, gasolina no Posto Aurora, o rádio da delegacia e comida no Mercado. O Mercado... cuidado com o Sebastião.'
        : !f.m5
          ? 'A dinamite tá no contêiner da obra, na Rua da Ponte. Arma na barricada e corre.'
          : 'A ponte tá livre. Fala com a gente antes de ir.';
      G.ui.say('Tião', hint, 6);
      return true;
    }
    return false;
  },

  objective(L) {
    const G = L.G,
      P = G.player,
      f = L.flags;
    if (!f.started || !f.metGroup) {
      if (P.pos.z < 34) return { text: 'Procure sobreviventes na avenida (passe pela Praça da Estação)', target: { x: 0, z: 58 } };
      return { text: 'Siga pela avenida em busca de sobreviventes', target: { x: 0, z: 58 } };
    }
    if (f.m5) return { text: 'Volte ao beco e despeça-se do grupo', target: { x: -18, z: 70 } };
    const ms = missionState(L);
    const del = ms.find((m) => !m.done && m.deliver);
    if (del) return { text: del.id === 'm1' ? 'Leve o remédio para o Jorge, no beco' : 'Abasteça o gerador do beco', target: del.target };
    if (f.butcherDead && !f.m4) return { text: 'Pegue os mantimentos no depósito do mercado', target: ms[3].target };
    if (f.arena && !f.butcherDead) {
      const b = G.enemies.boss;
      return { text: 'Derrote o Açougueiro', target: b && b.alive ? { x: b.pos.x, z: b.pos.z } : null };
    }
    if (f.m5open && !f.m5) return { text: P.keys.mission_dynamite ? 'Arme a dinamite na barricada da ponte norte' : 'Pegue os explosivos na obra', target: ms[4].target };
    // missão aberta mais próxima
    let best = null,
      bd = 1e9;
    for (const m of ms) {
      if (m.done || m.locked) continue;
      const d = Math.hypot(m.target.x - P.pos.x, m.target.z - P.pos.z);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    if (!best) return { text: 'Volte ao beco', target: { x: -18, z: 70 } };
    const n = ms.filter((m) => m.done).length;
    return { text: `Missão: ${best.title} (${n}/5)`, target: best.target };
  },

  missions(L) {
    if (!L.flags.metGroup) return null;
    return missionState(L).map((m) => ({ title: m.locked ? m.title + ' (bloqueada)' : m.title, desc: m.locked ? 'Cumpra as outras quatro missões primeiro.' : m.desc, done: m.done, active: !m.done && !m.locked }));
  },

  onBossDeath(L, boss) {
    const G = L.G;
    L.flags.butcherDead = true;
    G.game.slowMo(0.4, 1.8);
    G.ui.msg('O Açougueiro caiu.', true);
    G.game.after(2.5, () => {
      setShutter(L, false);
      L.c.anim.push({ k: 'shutter', t: 0, dur: 1.6, to: 0 });
      G.audio.rumble({ x: HALL.x1, z: 130 }, 1.6);
      L.flags.arena = false;
      if (!L.state.taken.magnum) L.addPickup('magnum', 'weapon_magnum', 1, -44.5, 1.2, 128.4, true);
      if (!L.state.taken.food) L.addPickup('food', 'mission_food', 1, -45.6, 0.02, 141, true);
      G.ui.say('Clara', 'Ele tinha um revólver no balcão. E a comida tá no depósito, no fundo.', 4);
      if (!G.player.dead) L.checkpoint('market');
    });
    void boss;
  },
};

export default chapter2;

// Nível 43 — "Mundo Aquático": um parque-aquário enorme, fechado e vazio.
// Seções: o Saguão de entrada (bilheterias, catracas, lixo), o Túnel dos
// Peixes (janelas dos dois lados), o salão do Grande Tanque (uma parede
// inteira de vidro com cardumes, arraias e um tubarão-baleia), o corredor de
// serviço, a Sala de Máquinas, o Laboratório e, atrás de uma jaula, os
// Tanques de Quarentena. Um alto-falante repete avisos do parque.
// Sem entidades. Saída: balde de água → gerador → chave branca → porta de
// manutenção → computador ("Abrir Jaula") → rastro azul → porta aberta.
// Segredo: uma fresta escura no Grande Tanque leva a uma porta molhada — do
// outro lado, um mar infinito no meio do nada.
import * as THREE from 'three';
import { CellArea, bakedMaterial } from './area.js';
import { getTex, textCanvasTex } from '../textures.js';
import { pushCircle } from './grid.js';
import { mulberry32 } from '../util.js';
import { GeoBuilder } from '../materials.js';
import { Aquarium } from './level43_tank.js';
import { SeaArea } from './level43_sea.js';
import './level37_tex.js';

const C = 3;
const H = 4.2;
const SECTIONS = [
  ['lobby', 0, 7, 0, 5],
  ['gallery', 3, 4, -14, -1],
  ['closet', 5, 5, -8, -8],
  ['hall', -2, 9, -22, -15],
  ['crack', -5, -3, -17, -17],
  ['corr', 10, 17, -18, -18],
  ['gen', 12, 15, -22, -19],
  ['lab', 18, 23, -21, -15],
  ['gate', 24, 24, -18, -18],
  ['pools', 25, 34, -24, -10],
];
const TINT = {
  lobby: { wall: [0.95, 0.88, 0.76], floor: [0.85, 0.82, 0.76] },
  gallery: { wall: [0.3, 0.42, 0.58], floor: [0.45, 0.5, 0.58] },
  closet: { wall: [0.6, 0.6, 0.56], floor: [0.55, 0.55, 0.52] },
  hall: { wall: [0.26, 0.34, 0.44], floor: [0.4, 0.45, 0.52] },
  crack: { wall: [0.3, 0.32, 0.3], floor: [0.3, 0.32, 0.3] },
  corr: { wall: [0.62, 0.62, 0.58], floor: [0.55, 0.55, 0.52] },
  gen: { wall: [0.55, 0.55, 0.5], floor: [0.5, 0.5, 0.47] },
  lab: { wall: [0.92, 0.95, 1.0], floor: [0.85, 0.88, 0.92] },
  gate: { wall: [0.6, 0.6, 0.58], floor: [0.55, 0.55, 0.52] },
  pools: { wall: [0.45, 0.68, 0.7], floor: [0.55, 0.7, 0.72] },
};
const PA = [
  'O parque está fechado. Por favor, volte outro dia.',
  'O parque estará em manutenção por algumas semanas. Entre em contato com um funcionário caso encontre algum item ou objeto faltante.',
  'Lembramos aos visitantes: é proibido bater no vidro dos tanques.',
  'Atenção: a alimentação do Grande Tanque foi cancelada. Obrigado pela compreensão.',
  'Visitante, dirija-se à saída mais próxima. O parque está fechado.',
];
const TRAIL = [
  [73.5, -52.5],
  [80, -53],
  [88.6, -53.5],
  [89.6, -46],
  [89.4, -36],
  [90, -30],
  [97, -29.8],
  [103, -31],
  [104.2, -34.5],
];
const POOLS = [
  [78, 87, -68, -58],
  [92, 101, -67, -56],
  [78, 87, -50, -39],
  [93, 101, -46, -34],
];

export class Level43 {
  constructor(game) {
    this.game = game;
    this.Q = game.Q;
    this.scene = game.scene;
    this.indoor = true;
    this.num = 43;
    this.taken = new Set();
    this.dynamic = new THREE.Group();
    this.scene.add(this.dynamic);
    this.surface = 'tile';
    this.look = {
      exposure: 1.1,
      tint: [0.92, 1.0, 1.04],
      sat: 0.92,
      contrast: 1.08,
      lift: [0.004, 0.01, 0.014],
      bloom: 0.3,
      fog: [0.01, 0.035, 0.045],
      fogNear: 0.25,
      lightColor: [0.8, 0.92, 1.0],
      flashlight: false,
      ambience: 'level43',
      reverb: 2.6,
      sanityDrain: 0.07,
    };
    this.objectives = [
      { id: 'balde', text: 'Encontre um balde de água' },
      { id: 'gerador', text: 'Jogue a água no gerador da Sala de Máquinas' },
      { id: 'chave', text: 'Pegue a chave branca' },
      { id: 'porta', text: 'Abra a porta de manutenção' },
      { id: 'jaula', text: 'Use o computador do laboratório e abra a jaula' },
      { id: 'rastro', text: 'Siga o rastro azul até a porta aberta' },
    ];
    this.spawn = { x: 12, z: 15, yaw: 0 };
    this.exit = { x: 104.2, z: -34.5 };
    this.colliders = [];
    this.time = 0;
    this.paT = 25;
    this.doused = false;
    this.doorOpen = 0;
    this.gateOpen = 0;
    this.told = {};
  }

  section(i, j) {
    for (const [name, i0, i1, j0, j1] of SECTIONS) if (i >= i0 && i <= i1 && j >= j0 && j <= j1) return name;
    return null;
  }

  async preload(px, pz, progress) {
    const Q = this.Q;
    const tick = async (f) => {
      if (progress) progress(f);
      await new Promise((r) => setTimeout(r, 0));
    };
    const open = [];
    for (const [, i0, i1, j0, j1] of SECTIONS) for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) open.push([i, j]);
    const skip = new Set();
    for (let j = -13; j <= -2; j++) {
      skip.add(`3,${j},-1,0`);
      if (j !== -8) skip.add(`4,${j},1,0`);
    }
    for (let i = -1; i <= 8; i++) skip.add(`${i},-22,0,-1`);
    skip.add('34,-12,1,0');
    const lights = [];
    const L = (x, y, z, I, fix = true) => lights.push({ x, y, z, I, fix });
    for (const [x, z] of [
      [6, 4],
      [18, 4],
      [6, 14],
      [18, 14],
      [12, 9],
    ])
      L(x, 3.8, z, 9);
    for (let z = -40; z <= -4; z += 6) {
      L(10.2, 1.6, z, 2.2, false);
      L(13.8, 1.6, z + 3, 2.2, false);
    }
    for (let x = -3; x <= 27; x += 5) L(x, 2.0, -64.6, 4.5, false);
    L(12, 3.8, -50, 3);
    L(0, 3.8, -48, 2);
    L(24, 3.8, -48, 2);
    L(34, 3.6, -52.5, 4);
    L(48, 3.6, -52.5, 3);
    L(42, 3.6, -60, 5.5);
    for (const [x, z] of [
      [60, -60],
      [66, -48],
      [60, -48],
      [67, -60],
    ])
      L(x, 3.8, z, 7);
    for (const [x, z] of [
      [80, -64],
      [96, -63],
      [80, -45],
      [97, -40],
      [88, -31],
      [101, -30],
      [83, -54],
    ])
      L(x, 3.8, z, 5.5);
    L(-12, 1.6, -49.5, 0.5, false);
    L(16.5, 3.6, -22.5, 3.5);
    const S = Q.tex;
    const con = getTex('concrete', S);
    const tile = getTex('l37Tile', S);
    const slab = getTex('slab', S);
    const gr = getTex('grime', S);
    const lt = [0.85, 0.95, 1.0];
    this.mats = [];
    const mk = (o) => {
      const m = bakedMaterial(Q, { light: lt, ...o });
      this.mats.push(m);
      return m;
    };
    const A = new CellArea(this.game, {
      ox: 0,
      oz: 0,
      cell: C,
      H,
      open,
      lights,
      ambient: 0.03,
      radius: 14,
      wall: { mat: mk({ map: con.map, normalMap: con.normalMap, roughness: 0.9 }), uvW: 3, uvH: 3, tint: [1, 1, 1] },
      floor: { mat: mk({ map: tile.map, normalMap: tile.normalMap, roughness: 0.3 }), uv: 1.5 },
      ceil: { mat: mk({ map: slab.map, roughness: 1 }), uv: 3, tint: [0.7, 0.72, 0.74] },
    });
    A.skip = skip;
    A.tintAt = (i, j, part) => {
      const s = this.section(i, j);
      return s ? TINT[s][part] : null;
    };
    this.area = A;
    await tick(0.1);
    A.build();
    await tick(0.55);
    this.propMat = mk({ map: gr.map, normalMap: gr.normalMap, roughness: 0.6 });
    this.plainMat = mk({ roughness: 0.7 });
    this.buildProps();
    await tick(0.7);
    // tanques
    const aq = new Aquarium(this.scene);
    this.aq = aq;
    aq.addTank({ x0: 1.5, x1: 9, z0: -39, z1: -3, y0: -0.4, y1: H + 1.2, glass: { axis: 'x', at: 9, a0: -39, a1: -3 }, glassH: H }, [
      ['amarelo', 18],
      ['azul', 10],
      ['palhaco', 8],
      ['prata', 28],
    ], 431);
    aq.addTank({ x0: 15, x1: 23, z0: -39, z1: -24, y0: -0.4, y1: H + 1.2, glass: { axis: 'x', at: 15, a0: -39, a1: -24 }, glassH: H }, [
      ['roxo', 9],
      ['amarelo', 6],
      ['arraia', 1],
    ], 432);
    aq.addTank({ x0: 15, x1: 23, z0: -21, z1: -3, y0: -0.4, y1: H + 1.2, glass: { axis: 'x', at: 15, a0: -21, a1: -3 }, glassH: H }, [
      ['prata', 28],
      ['palhaco', 6],
    ], 433, { deep: [0.0, 0.08, 0.1], shallow: [0.08, 0.5, 0.5] });
    aq.addTank({ x0: -3, x1: 27, z0: -100, z1: -66, y0: -3, y1: 13, glass: { axis: 'z', at: -66, a0: -3, a1: 27 }, glassH: H }, [
      ['prata', 56],
      ['azul', 15],
      ['amarelo', 12],
      ['arraia', 3],
      ['tubarao', 2],
      ['baleia', 1],
    ], 434, { deep: [0.0, 0.04, 0.1], shallow: [0.04, 0.32, 0.5] });
    await tick(0.85);
    this.sea = new SeaArea(this);
    this.spawnItems();
    await tick(1);
  }

  // ------------------------------------------------------------ objetos
  buildProps() {
    const A = this.area;
    const cols = this.colliders;
    const solid = (x0, x1, z0, z1) => cols.push([x0, x1, z0, z1]);
    this.textures = [];
    const gbProp = [];
    const draw = (fn, mat = this.propMat) => gbProp.push([fn, mat]);
    // bilheterias, catracas, bancos e lixo no Saguão
    draw((gb, lm) => {
      for (const x of [4.5, 19.5]) {
        gb.box(x, 1.2, 2.0, 4.0, 2.4, 2.2, [0.55, 0.42, 0.3], lm, {});
        gb.box(x, 1.6, 3.12, 3.4, 0.9, 0.04, [0.1, 0.15, 0.18], lm, { ao: 0 });
        gb.box(x, 2.6, 2.0, 4.3, 0.3, 2.5, [0.15, 0.4, 0.55], lm, {});
      }
      for (let k = 0; k < 5; k++) {
        const x = 8.5 + k * 1.75;
        gb.box(x, 0.5, 7.5, 0.25, 1.0, 0.9, [0.6, 0.62, 0.64], lm, {});
        gb.box(x + 0.6, 0.9, 7.5, 1.1, 0.04, 0.05, [0.7, 0.72, 0.74], lm, { rot: k === 2 ? 0.6 : 0 });
      }
      for (const [x, z] of [
        [3, 12],
        [21, 12],
        [3, 9],
        [21, 9],
      ]) {
        gb.box(x, 0.45, z, 2.2, 0.08, 0.6, [0.35, 0.26, 0.16], lm, {});
        gb.box(x, 0.22, z, 2.0, 0.44, 0.4, [0.25, 0.25, 0.26], lm, {});
      }
      const rnd = mulberry32(4343);
      for (let k = 0; k < 40; k++) {
        const x = 1 + rnd() * 22;
        const z = 1 + rnd() * 16;
        const s = 0.1 + rnd() * 0.2;
        gb.box(x, s / 4, z, s, s / 2, s * 0.7, [0.5 + rnd() * 0.4, 0.45 + rnd() * 0.3, 0.3 + rnd() * 0.3], lm, { rot: rnd() * 6 });
      }
      // lixeiras derrubadas
      gb.cylinder(7, 0.45, 12.5, 0.3, 0.9, [0.2, 0.35, 0.25], lm, { sides: 10 });
      gb.cylinder(17.5, 0.3, 11.8, 0.3, 0.6, [0.2, 0.35, 0.25], lm, { sides: 10, axis: 'x' });
    });
    for (const x of [4.5, 19.5]) solid(x - 2, x + 2, 0.9, 3.1);
    for (let k = 0; k < 5; k++) solid(8.5 + k * 1.75 - 0.15, 8.5 + k * 1.75 + 0.15, 7.05, 7.95);
    for (const [x, z] of [
      [3, 12],
      [21, 12],
      [3, 9],
      [21, 9],
    ])
      solid(x - 1.1, x + 1.1, z - 0.3, z + 0.3);
    // molduras das janelas dos tanques
    draw((gb, lm) => {
      for (let z = -39; z <= -3; z += 3) {
        gb.box(9.06, H / 2, z, 0.12, H, 0.16, [0.12, 0.14, 0.16], lm, {});
        if (z <= -24 || z >= -21) gb.box(14.94, H / 2, z, 0.12, H, 0.16, [0.12, 0.14, 0.16], lm, {});
      }
      gb.box(9.1, 0.25, -21, 0.2, 0.5, 36, [0.1, 0.12, 0.14], lm, {});
      gb.box(14.9, 0.25, -31.5, 0.2, 0.5, 15, [0.1, 0.12, 0.14], lm, {});
      gb.box(14.9, 0.25, -12, 0.2, 0.5, 18, [0.1, 0.12, 0.14], lm, {});
      for (let x = -3; x <= 27; x += 3) gb.box(x, H / 2, -65.94, 0.2, H, 0.12, [0.1, 0.12, 0.14], lm, {});
      gb.box(12, 0.3, -65.9, 30, 0.6, 0.2, [0.08, 0.1, 0.12], lm, {});
      // bancos virados para o Grande Tanque
      for (const x of [3, 9, 15, 21]) {
        gb.box(x, 0.45, -58, 3.2, 0.1, 0.7, [0.3, 0.22, 0.14], lm, {});
        gb.box(x, 0.22, -58, 3.0, 0.44, 0.5, [0.2, 0.2, 0.22], lm, {});
      }
      // porta do armário de limpeza (aberta)
      gb.box(15.2, 1.05, -22.5, 0.06, 2.1, 1.0, [0.5, 0.52, 0.5], lm, { rot: 0.9 });
      // entulho na fresta escura
      gb.box(-10, 0.2, -50.5, 0.8, 0.4, 0.6, [0.35, 0.35, 0.33], lm, { rot: 0.4 });
      gb.box(-12.5, 0.15, -48.6, 0.6, 0.3, 0.5, [0.35, 0.35, 0.33], lm, { rot: 1.1 });
      // porta molhada (para o mar)
      gb.box(-14.95, 1.05, -49.5, 0.06, 2.1, 1.0, [0.55, 0.6, 0.62], lm, {});
      gb.box(-14.88, 1.0, -49.15, 0.05, 0.05, 0.05, [0.8, 0.7, 0.4], lm, {});
    });
    for (const x of [3, 9, 15, 21]) solid(x - 1.6, x + 1.6, -58.35, -57.65);
    // corredor de serviço, Sala de Máquinas e o gerador
    draw((gb, lm) => {
      gb.cylinder(42, H - 0.4, -51.6, 0.14, 24, [0.35, 0.37, 0.36], lm, { axis: 'x', sides: 8, caps: false });
      gb.cylinder(42, H - 0.7, -53.4, 0.08, 24, [0.55, 0.28, 0.12], lm, { axis: 'x', sides: 6, caps: false });
      // gerador
      gb.box(45, 0.9, -63, 2.4, 1.8, 1.4, [0.32, 0.4, 0.3], lm, {});
      gb.box(45, 1.95, -63, 1.6, 0.3, 0.9, [0.25, 0.25, 0.25], lm, {});
      gb.cylinder(46, 2.4, -63.3, 0.12, 0.8, [0.2, 0.2, 0.2], lm, { sides: 8 });
      for (let k = 0; k < 5; k++) gb.box(43.9 + k * 0.4, 0.4, -62.29, 0.2, 0.4, 0.02, [0.06, 0.06, 0.06], lm, { ao: 0 });
      // cabo até a cerca
      gb.box(42, 0.04, -63, 4.5, 0.06, 0.08, [0.08, 0.08, 0.08], lm, { ao: 0 });
      // cerca elétrica em volta da chave (aberta ao sul)
      for (let k = 0; k <= 8; k++) {
        gb.box(38 + k * 0.25, 0.9, -64.2, 0.04, 1.8, 0.04, [0.6, 0.6, 0.55], lm, { ao: 0 });
        gb.box(38, 0.9, -64.2 + k * 0.15, 0.04, 1.8, 0.04, [0.6, 0.6, 0.55], lm, { ao: 0 });
        gb.box(40, 0.9, -64.2 + k * 0.15, 0.04, 1.8, 0.04, [0.6, 0.6, 0.55], lm, { ao: 0 });
      }
      for (const y of [0.4, 1.0, 1.6]) {
        gb.box(39, y, -64.2, 2.0, 0.03, 0.03, [0.7, 0.7, 0.6], lm, { ao: 0 });
        gb.box(38, y, -63.6, 0.03, 0.03, 1.2, [0.7, 0.7, 0.6], lm, { ao: 0 });
        gb.box(40, y, -63.6, 0.03, 0.03, 1.2, [0.7, 0.7, 0.6], lm, { ao: 0 });
      }
      gb.box(39, 0.4, -63.5, 0.7, 0.8, 0.6, [0.45, 0.35, 0.22], lm, {});
      // porta de manutenção: batentes preenchendo o vão do corredor
      gb.box(54, H / 2, -53.55, 0.25, H, 0.9, [0.4, 0.42, 0.42], lm, {});
      gb.box(54, H / 2, -51.45, 0.25, H, 0.9, [0.4, 0.42, 0.42], lm, {});
      gb.box(54, (H + 2.2) / 2, -52.5, 0.25, H - 2.2, 1.2, [0.4, 0.42, 0.42], lm, {});
    });
    solid(43.8, 46.2, -63.7, -62.3);
    solid(37.95, 40.05, -64.3, -64.1);
    solid(37.9, 38.1, -64.3, -63.0);
    solid(39.9, 40.1, -64.3, -63.0);
    solid(53.85, 54.15, -54, -53.1);
    solid(53.85, 54.15, -51.9, -51);
    // laboratório: bancadas, tubos de amostras e o computador
    draw((gb, lm) => {
      for (const z of [-46, -50]) {
        gb.box(60, 0.9, z, 6, 0.06, 1.2, [0.85, 0.87, 0.9], lm, {});
        gb.box(60, 0.45, z, 5.8, 0.9, 1.0, [0.6, 0.62, 0.66], lm, {});
      }
      gb.box(69, 0.75, -57, 2.4, 0.06, 0.9, [0.7, 0.72, 0.75], lm, {});
      gb.box(69, 0.37, -57, 2.3, 0.74, 0.8, [0.4, 0.42, 0.45], lm, {});
      gb.box(69, 1.15, -57.25, 0.9, 0.55, 0.06, [0.06, 0.06, 0.07], lm, {});
      // jaula: moldura do portão
      gb.box(72, H - 0.15, -52.5, 0.3, 0.3, 3, [0.25, 0.25, 0.25], lm, {});
    });
    solid(57, 63, -46.6, -45.4);
    solid(57, 63, -50.6, -49.4);
    solid(67.8, 70.2, -57.45, -56.55);
    // tanques de quarentena: bordas e corrimão
    draw((gb, lm) => {
      for (const [x0, x1, z0, z1] of POOLS) {
        gb.box((x0 + x1) / 2, 0.25, z0, x1 - x0 + 0.4, 0.5, 0.2, [0.7, 0.72, 0.72], lm, {});
        gb.box((x0 + x1) / 2, 0.25, z1, x1 - x0 + 0.4, 0.5, 0.2, [0.7, 0.72, 0.72], lm, {});
        gb.box(x0, 0.25, (z0 + z1) / 2, 0.2, 0.5, z1 - z0, [0.7, 0.72, 0.72], lm, {});
        gb.box(x1, 0.25, (z0 + z1) / 2, 0.2, 0.5, z1 - z0, [0.7, 0.72, 0.72], lm, {});
        gb.box((x0 + x1) / 2, 1.0, z0, x1 - x0, 0.05, 0.05, [0.85, 0.75, 0.2], lm, { ao: 0 });
        gb.box((x0 + x1) / 2, 1.0, z1, x1 - x0, 0.05, 0.05, [0.85, 0.75, 0.2], lm, { ao: 0 });
      }
      // a porta aberta (saída), batente
      gb.box(105, H / 2, -36.3, 0.3, H, 2.4, [0.5, 0.5, 0.48], lm, {});
      gb.box(105, H / 2, -32.7, 0.3, H, 2.4, [0.5, 0.5, 0.48], lm, {});
      gb.box(105, (H + 2.2) / 2, -34.5, 0.3, H - 2.2, 1.2, [0.5, 0.5, 0.48], lm, {});
      gb.box(104.4, 1.05, -35.5, 1.0, 2.1, 0.06, [0.55, 0.55, 0.52], lm, { rot: 1.1 });
    });
    for (const [x0, x1, z0, z1] of POOLS) solid(x0 - 0.2, x1 + 0.2, z0 - 0.15, z1 + 0.15);
    // monta as malhas de objetos com luz assada
    for (const [fn, mat] of gbProp) {
      const gb = new GeoBuilder();
      fn(gb, A.lmAt(1.2));
      A.addMesh(gb, mat);
    }
    this.buildDynamic();
  }

  // Placas, água das piscinas, rastro azul, porta, portão e luzes acesas.
  buildDynamic() {
    const D = this.dynamic;
    const sign = (txt, w, h, x, y, z, ry, bg = '#0c2a3a', fg = '#bfeaff') => {
      const t = textCanvasTex(512, Math.round((512 * h) / w), (c, W, Hh) => {
        c.fillStyle = bg;
        c.fillRect(0, 0, W, Hh);
        c.fillStyle = fg;
        c.font = `bold ${Math.round(Hh * 0.42)}px Arial, Helvetica, sans-serif`;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(txt, W / 2, Hh / 2 + 2);
      });
      this.textures.push(t);
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(0.8, 0.8, 0.8) }));
      m.position.set(x, y, z);
      m.rotation.y = ry;
      D.add(m);
      return m;
    };
    sign('MUNDO AQUÁTICO', 6, 1.0, 12, 3.4, 0.6, 0, '#0a3a52', '#9fe8ff');
    sign('→ TÚNEL DOS PEIXES', 3.4, 0.5, 12, 3.6, -1.0, Math.PI);
    sign('GRANDE TANQUE', 4, 0.6, 12, 3.5, -43.5, 0);
    sign('SOMENTE FUNCIONÁRIOS', 3, 0.45, 29.6, 3.2, -52.5, -Math.PI / 2, '#3a2a08', '#ffd860');
    sign('SALA DE MÁQUINAS', 3, 0.45, 42, 3.6, -54.2, 0, '#2a2a2a', '#ffd860');
    sign('PERIGO — ALTA TENSÃO', 1.8, 0.35, 39, 2.1, -64.12, 0, '#d8b418', '#111');
    sign('LABORATÓRIO', 2.4, 0.45, 53.8, 2.9, -52.5, -Math.PI / 2, '#ffffff', '#1a3a5a');
    sign('QUARENTENA', 2.4, 0.45, 71.8, 3.7, -52.5, -Math.PI / 2, '#3a1010', '#ff9a8a');
    // luminárias acesas (só as do teto)
    const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.4, 2.6) });
    const lampGeo = new THREE.BoxGeometry(1.0, 0.05, 0.4);
    this.extraGeos = [lampGeo];
    this.extraMats = [lampMat];
    for (const L of this.area.lights) {
      if (!L.fix) continue;
      const m = new THREE.Mesh(lampGeo, lampMat);
      m.position.set(L.x, H - 0.03, L.z);
      D.add(m);
    }
    // água dos tanques de quarentena
    this.poolMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.03, 0.22, 0.25), transparent: true, opacity: 0.92 });
    this.extraMats.push(this.poolMat);
    for (const [x0, x1, z0, z1] of POOLS) {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
      const m = new THREE.Mesh(g, this.poolMat);
      m.rotation.x = -Math.PI / 2;
      m.position.set((x0 + x1) / 2, 0.42, (z0 + z1) / 2);
      D.add(m);
      this.extraGeos.push(g);
    }
    // rastro azul: gotas e manchas que levam à porta aberta
    const cv = document.createElement('canvas');
    cv.width = cv.height = 64;
    const c = cv.getContext('2d');
    const gr = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(0.6, 'rgba(255,255,255,0.7)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, 64, 64);
    this.dropTex = new THREE.CanvasTexture(cv);
    this.textures.push(this.dropTex);
    this.trailMat = new THREE.MeshBasicMaterial({ map: this.dropTex, color: new THREE.Color(0.2, 0.7, 2.2), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4 });
    this.extraMats.push(this.trailMat);
    const rnd = mulberry32(4344);
    const pos = [];
    for (let k = 0; k < TRAIL.length - 1; k++) {
      const [ax, az] = TRAIL[k];
      const [bx, bz] = TRAIL[k + 1];
      const len = Math.hypot(bx - ax, bz - az);
      for (let s = 0; s < len; s += 0.45) {
        const t = s / len;
        pos.push([ax + (bx - ax) * t + (rnd() - 0.5) * 0.25, az + (bz - az) * t + (rnd() - 0.5) * 0.25, 0.12 + rnd() * 0.22]);
      }
    }
    const tg = new THREE.BufferGeometry();
    const P = [];
    const U = [];
    const I = [];
    pos.forEach(([x, z, r], i) => {
      P.push(x - r, 0.012, z - r, x + r, 0.012, z - r, x + r, 0.012, z + r, x - r, 0.012, z + r);
      U.push(0, 0, 1, 0, 1, 1, 0, 1);
      const b = i * 4;
      I.push(b, b + 2, b + 1, b, b + 3, b + 2);
    });
    tg.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    tg.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    tg.setIndex(I);
    const trail = new THREE.Mesh(tg, this.trailMat);
    trail.renderOrder = 2;
    D.add(trail);
    this.extraGeos.push(tg);
    // luz forte atrás da porta aberta
    const glowM = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.6, 2.6, 2.4) });
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.2), glowM);
    glow.position.set(105.2, 1.1, -34.5);
    glow.rotation.y = -Math.PI / 2;
    D.add(glow);
    this.extraGeos.push(glow.geometry);
    this.extraMats.push(glowM);
    // porta de manutenção (folha) e portão da jaula (grade)
    const steel = new THREE.MeshStandardMaterial({ color: 0x8a9096, roughness: 0.5, metalness: 0.6, emissive: 0x1a1e22 });
    this.extraMats.push(steel);
    const door = new THREE.Group();
    const leaf = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.2, 1.2), steel);
    leaf.position.set(0, 1.1, 0.6);
    door.add(leaf);
    door.position.set(54, 0, -53.1);
    D.add(door);
    this.doorLeaf = door;
    this.extraGeos.push(leaf.geometry);
    const gate = new THREE.Group();
    const barG = new THREE.CylinderGeometry(0.03, 0.03, H - 0.3, 6);
    this.extraGeos.push(barG);
    for (let k = 0; k < 15; k++) {
      const b = new THREE.Mesh(barG, steel);
      b.position.set(0, (H - 0.3) / 2, -54 + 0.1 + k * 0.2);
      gate.add(b);
    }
    for (const y of [0.3, 2.0, 3.6]) {
      const r = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 3), steel);
      r.position.set(0, y, -52.5);
      gate.add(r);
      this.extraGeos.push(r.geometry);
    }
    gate.position.set(72, 0, 0);
    D.add(gate);
    this.gate = gate;
    // tela do computador
    this.screenTex = textCanvasTex(256, 160, (c2, w, h) => {
      c2.fillStyle = '#04140c';
      c2.fillRect(0, 0, w, h);
      c2.fillStyle = '#5aff9a';
      c2.font = 'bold 18px monospace';
      c2.fillText('> CONTROLE DA JAULA', 12, 40);
      c2.fillText('> ESTADO: FECHADA', 12, 70);
      c2.fillText('> [ ABRIR JAULA ]', 12, 110);
    });
    this.textures.push(this.screenTex);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.48), new THREE.MeshBasicMaterial({ map: this.screenTex, color: new THREE.Color(1.3, 1.3, 1.3) }));
    scr.position.set(69, 1.15, -57.21);
    D.add(scr);
    this.extraGeos.push(scr.geometry);
    this.extraMats.push(scr.material);
    // faíscas do gerador
    this.sparkMat = new THREE.SpriteMaterial({ map: this.dropTex, color: new THREE.Color(2.5, 2.2, 1.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    this.extraMats.push(this.sparkMat);
    this.sparks = [];
    for (let k = 0; k < 10; k++) {
      const s = new THREE.Sprite(this.sparkMat);
      s.scale.setScalar(0.12);
      s.visible = false;
      D.add(s);
      this.sparks.push({ s, v: new THREE.Vector3(), t: 0 });
    }
    this.cageGlow = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.3, 0.6, 1.6), transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.cageGlow.position.set(39, 0.9, -64.15);
    D.add(this.cageGlow);
    this.extraGeos.push(this.cageGlow.geometry);
    this.extraMats.push(this.cageGlow.material);
  }

  spawnItems() {
    const g = this.game;
    const bucketMesh = (it) => {
      const grp = new THREE.Group();
      const m1 = new THREE.MeshStandardMaterial({ color: 0x9aa2a8, roughness: 0.4, metalness: 0.6, emissive: 0x2a2e30 });
      const m2 = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.15, 0.5, 0.8) });
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.13, 0.32, 14, 1, true), m1);
      b.material.side = THREE.DoubleSide;
      b.position.y = 0.16;
      const w = new THREE.Mesh(new THREE.CircleGeometry(0.16, 14), m2);
      w.rotation.x = -Math.PI / 2;
      w.position.y = 0.27;
      const hd = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.008, 4, 16, Math.PI), m1);
      hd.position.y = 0.32;
      grp.add(b, w, hd);
      grp.position.set(it.x, 0, it.z);
      this.extraMats.push(m1, m2);
      this.extraGeos.push(b.geometry, w.geometry, hd.geometry);
      return grp;
    };
    g.items.spawn(
      {
        type: 'x',
        key: '43:balde',
        x: 16.6,
        z: -22.5,
        label: 'Pegar o balde de água',
        makeMesh: bucketMesh,
        onUse: (game) => {
          game.inventory.add('balde');
          game.audio.play('water', { gain: 0.3, rate: 1.4 });
          game.completeObjective('balde', 'Um balde cheio de água salgada. Pesado. Na Sala de Máquinas, um gerador zumbe alto demais.');
        },
      },
      this.dynamic,
    );
    const keyMesh = (it) => {
      const grp = new THREE.Group();
      const m = new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.3, metalness: 0.6, emissive: 0x404040 });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.035, 0.01, 8, 16), m);
      ring.rotation.x = Math.PI / 2;
      const sh = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.014), m);
      sh.position.x = 0.08;
      grp.add(ring, sh);
      grp.position.set(it.x, it.y, it.z);
      grp.scale.setScalar(1.8);
      this.extraMats.push(m);
      this.extraGeos.push(ring.geometry, sh.geometry);
      return grp;
    };
    this.keyItem = {
      type: 'x',
      key: '43:chave',
      x: 39,
      z: -63.5,
      y: 0.82,
      label: 'Pegar a chave branca',
      makeMesh: keyMesh,
      onUse: (game, it) => {
        if (!this.doused) {
          it.keep = true;
          this.shock();
          return;
        }
        it.keep = false;
        game.inventory.add('chaveLab');
        game.audio.play('ding', { gain: 0.4, rate: 1.2 });
        game.completeObjective('chave', 'A chave branca. Etiqueta: “MANUTENÇÃO — LABORATÓRIO”.');
      },
    };
    g.items.spawn(this.keyItem, this.dynamic);
    for (const [k, x, z] of [
      ['43:n1', 10.5, 11.5],
      ['43:n2', 6.5, -50.5],
      ['43:n3', 61, -45.6],
    ])
      g.items.spawn({ type: 'note', key: k, x, z, rot: 0.5, light: 0.7 }, this.dynamic);
  }

  shock() {
    const g = this.game;
    g.audio.play('crackle', { gain: 0.7, rate: 1.4 });
    g.audio.play('steam', { gain: 0.3, rate: 2 });
    g.damage = 1;
    g.glitch = 0.6;
    g.addSanity(-10);
    g.vibrate([60, 30, 120]);
    const p = g.player.pos;
    p.z += 1.2;
    g.hud.message('CHOQUE! A cerca está eletrificada pelo gerador. Desligue-o primeiro — com água.', 4);
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    const g = this.game;
    const p = player.pos;
    this.time += dt;
    this.aq.update(dt, this.time);
    if (this.inSea) {
      this.sea.update(dt, player, this.time);
      return;
    }
    // avisos do parque no alto-falante
    this.paT -= dt;
    if (this.paT <= 0) {
      this.paT = 55 + Math.random() * 45;
      g.audio.play('radio', { gain: 0.25, rate: 0.95, wet: 1.4 });
      g.audio.play('ding', { gain: 0.15, rate: 0.7, wet: 1.4 });
      g.hud.message(`Alto-falante: “${PA[Math.floor(Math.random() * PA.length)]}”`, 5);
    }
    // barco ao longe (ninguém sabe de onde)
    this.boatT = (this.boatT || 40) - dt;
    if (this.boatT <= 0) {
      this.boatT = 70 + Math.random() * 60;
      g.audio.play('machine', { gain: 0.12, rate: 0.35, wet: 2 });
    }
    // faíscas e zumbido do gerador enquanto ligado
    if (!this.doused && Math.hypot(p.x - 45, p.z + 63) < 18) {
      this.cageGlow.material.opacity = 0.08 + Math.random() * 0.1;
      if (Math.random() < dt * 3) this.spark(39 + (Math.random() - 0.5) * 1.6, 0.5 + Math.random() * 1.2, -64.2);
      this.humT = (this.humT || 0) - dt;
      if (this.humT <= 0) {
        this.humT = 2.5;
        g.audio.play('crackle', { gain: 0.08, rate: 0.6, wet: 0.4 });
      }
    } else if (this.doused) this.cageGlow.material.opacity = 0;
    for (const s of this.sparks) {
      if (s.t <= 0) continue;
      s.t -= dt;
      s.v.y -= 9 * dt;
      s.s.position.addScaledVector(s.v, dt);
      if (s.t <= 0) s.s.visible = false;
    }
    // porta e portão abrindo
    if (this.doorOpening && this.doorOpen < 1) {
      this.doorOpen = Math.min(1, this.doorOpen + dt * 0.8);
      this.doorLeaf.rotation.y = -this.doorOpen * 1.5;
    }
    if (this.gateOpening && this.gateOpen < 1) {
      this.gateOpen = Math.min(1, this.gateOpen + dt * 0.35);
      this.gate.position.y = this.gateOpen * (H - 0.6);
      if (Math.random() < dt * 6) g.audio.play('creak', { gain: 0.08, rate: 1.6 });
    }
    // mensagens das seções
    const sec = this.section(Math.floor(p.x / C), Math.floor(p.z / C));
    if (sec && sec !== this.lastSec) {
      this.lastSec = sec;
      const msg = {
        gallery: 'O Túnel dos Peixes. Dos dois lados, vidro — e cardumes nadando como se ninguém tivesse ido embora.',
        hall: 'O Grande Tanque. Uma parede inteira de água. Arraias, tubarões… e algo enorme passando devagar.',
        crack: 'Uma fresta escura atrás das pedras do salão. Cheiro de sal, vento frio. Há uma porta molhada no fundo.',
        gen: 'A Sala de Máquinas. O gerador zumbe e faísca; a cerca da chave está eletrificada.',
        lab: 'O Laboratório. Bancadas limpas, tubos vazios, um computador ligado.',
        pools: 'Os Tanques de Quarentena. No chão, um rastro azul brilhante, ainda úmido.',
      }[sec];
      if (msg && !this.told[sec]) {
        this.told[sec] = true;
        g.hud.message(msg, 5);
      }
    }
    this.sanityExtra = sec === 'gallery' || sec === 'hall' ? -0.25 : 0;
  }

  spark(x, y, z) {
    const s = this.sparks.find((q) => q.t <= 0);
    if (!s) return;
    s.t = 0.4 + Math.random() * 0.3;
    s.s.position.set(x, y, z);
    s.v.set((Math.random() - 0.5) * 3, Math.random() * 2, (Math.random() - 0.5) * 3 + 1);
    s.s.visible = true;
  }

  douse() {
    const g = this.game;
    g.inventory.remove('balde');
    this.doused = true;
    g.audio.play('water', { gain: 0.6, rate: 1.2 });
    g.audio.play('crackle', { gain: 0.8, rate: 0.8 });
    g.audio.powerDown();
    g.glitch = 0.8;
    g.vibrate([100, 50, 200]);
    for (let k = 0; k < 10; k++) this.spark(45 + (Math.random() - 0.5) * 2, 1.2 + Math.random(), -63 + (Math.random() - 0.5));
    g.completeObjective('gerador', 'A água cai no gerador: estouro, fumaça, silêncio. A cerca da chave apagou.');
  }

  interactable(player) {
    const g = this.game;
    const p = player.pos;
    if (this.moving) return null;
    if (this.inSea) {
      const b = this.sea.back;
      if (Math.hypot(p.x - b.x, p.z - b.z) < 1.4) return { label: 'Voltar pela porta molhada', action: () => this.leaveSea() };
      return null;
    }
    if (Math.hypot(p.x + 14.3, p.z + 49.5) < 1.5) return { label: 'Abrir a porta molhada', action: () => this.enterSea() };
    if (Math.hypot(p.x - 45, p.z + 63) < 2.3) {
      if (this.doused) return { label: 'Gerador (desligado)', action: () => g.hud.message('Molhado, frio, morto. A cerca da chave está desligada.', 3) };
      if (g.inventory.has('balde')) return { label: 'Jogar a água no gerador', action: () => this.douse() };
      return { label: 'Gerador (ligado)', action: () => g.hud.message('Ele alimenta a cerca elétrica em volta da chave. Água derrubaria isso.', 4) };
    }
    if (!this.doorOpening && Math.hypot(p.x - 53, p.z + 52.5) < 1.6) {
      if (!g.inventory.has('chaveLab'))
        return {
          label: 'Porta de manutenção (trancada)',
          action: () => {
            g.audio.play('knock', { gain: 0.3, rate: 0.8 });
            g.hud.message('Trancada. A fechadura é branca, de plástico duro. A chave deve estar na Sala de Máquinas.', 4);
          },
        };
      return {
        label: 'Abrir a porta de manutenção',
        action: () => {
          g.inventory.remove('chaveLab');
          this.doorOpening = true;
          g.audio.door();
          g.completeObjective('porta', 'A porta de manutenção abre para um laboratório branco e silencioso.');
        },
      };
    }
    if (Math.hypot(p.x - 69, p.z + 56.2) < 1.5) return { label: 'Usar o computador', action: () => this.computer() };
    if (Math.hypot(p.x - 104.2, p.z + 34.5) < 1.7) {
      return {
        label: 'Atravessar a porta aberta',
        action: () => {
          g.completeObjective('rastro', 'Do outro lado da porta, corredores. Muitos corredores.');
          g.reachExit('door', 0.8);
        },
      };
    }
    return null;
  }

  computer() {
    const g = this.game;
    const hud = g.hud;
    g.audio.play('beep', { gain: 0.3, rate: 1.2 });
    if (this.gateOpening) {
      hud.dialog('Controle da jaula', '> JAULA: ABERTA.\n> QUARENTENA LIBERADA.', [{ text: 'Sair', fn: () => hud.closeDialog() }], '');
      return;
    }
    hud.dialog('Controle da jaula', '> LABORATÓRIO — TANQUES DE QUARENTENA\n> JAULA: FECHADA\n> Pressione o botão para abrir.', [
      {
        text: '[ ABRIR JAULA ]',
        fn: () => {
          hud.closeDialog();
          this.gateOpening = true;
          g.audio.play('alarm', { gain: 0.25, rate: 0.8 });
          g.audio.play('machine', { gain: 0.3, rate: 0.6 });
          g.completeObjective('jaula', 'Um alarme curto, motores: o portão de grade da jaula sobe. Atrás dele, os Tanques de Quarentena.');
        },
      },
      { text: 'Sair', fn: () => hud.closeDialog() },
    ]);
  }

  async enterSea() {
    const g = this.game;
    this.moving = true;
    g.player.frozen = true;
    g.fadeTarget = 1;
    g.audio.door();
    await new Promise((r) => setTimeout(r, 900));
    if (g.level !== this) return;
    this.inSea = true;
    this.sea.enter();
    const E = this.sea.entry;
    g.player.pos.set(E.x, 0, E.z);
    g.player.yaw = E.yaw;
    g.player.vel.set(0, 0, 0);
    g.fadeTarget = 0;
    g.player.frozen = false;
    this.moving = false;
    if (!this.told.sea) {
      this.told.sea = true;
      g.hud.message('Área secreta: O MAR. Água até o horizonte, em todas as direções. Nenhuma terra, nenhum barco. Só vento — e a porta, de pé, atrás de você.', 7);
    }
  }

  async leaveSea() {
    const g = this.game;
    this.moving = true;
    g.player.frozen = true;
    g.fadeTarget = 1;
    await new Promise((r) => setTimeout(r, 900));
    if (g.level !== this) return;
    this.inSea = false;
    this.sea.leave();
    this.sanityExtra = 0;
    g.player.pos.set(-13.2, 0, -49.5);
    g.player.yaw = -Math.PI / 2;
    g.player.vel.set(0, 0, 0);
    g.fadeTarget = 0;
    g.player.frozen = false;
    this.moving = false;
  }

  navTarget() {
    const g = this.game;
    if (this.inSea) return this.sea.back;
    const cur = g.currentObjective();
    const id = cur ? cur.id : 'rastro';
    if (id === 'balde') return { x: 16.6, z: -22.5 };
    if (id === 'gerador') return { x: 45, z: -61.5 };
    if (id === 'chave') return { x: 39, z: -62.8 };
    if (id === 'porta') return { x: 53, z: -52.5 };
    if (id === 'jaula') return { x: 69, z: -56.2 };
    return this.exit;
  }

  collide(p, r) {
    if (this.inSea) return this.sea.collide(p, r);
    this.area.collide(p, r);
    for (let it = 0; it < 2; it++) {
      for (const b of this.colliders) {
        if (p.x < b[0] - 1 || p.x > b[1] + 1 || p.z < b[2] - 1 || p.z > b[3] + 1) continue;
        pushCircle(p, r, b[0], b[1], b[2], b[3]);
      }
      if (this.doorOpen < 0.6) pushCircle(p, r, 53.9, 54.1, -53.1, -51.9);
      if (this.gateOpen < 0.6) pushCircle(p, r, 71.9, 72.1, -54, -51);
    }
    return p;
  }

  lightLevel(x, z) {
    if (this.inSea) return 1;
    return this.area.lightLevel(x, z);
  }

  los(x0, z0, x1, z1) {
    return this.area.los(x0, z0, x1, z1);
  }

  surfaceAt() {
    return this.inSea ? 'wood' : 'tile';
  }

  groundY() {
    return 0;
  }

  exitEmitter() {
    return { x: 105, y: 1.5, z: -34.5, sound: 'hum', gain: 0.3 };
  }

  dispose() {
    if (this.sea) this.sea.dispose();
    if (this.aq) this.aq.dispose();
    if (this.area) this.area.dispose();
    for (const m of this.mats || []) m.dispose();
    for (const m of this.extraMats || []) m.dispose();
    for (const g of this.extraGeos || []) g.dispose();
    for (const t of this.textures || []) t.dispose();
    this.dynamic.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.isMeshBasicMaterial) o.material.dispose();
    });
    this.scene.remove(this.dynamic);
  }
}


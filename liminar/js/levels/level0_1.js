// Subnível 0.1 — "Estação Zênite": uma usina elétrica flutuando no espaço,
// escondida atrás de uma porta de madeira no Nível 0. É o maior nível do jogo e
// o único habitado: há gente com quem conversar, janelas gigantes para planetas
// exóticos e uma tarefa — recolocar a usina em fase para liberar o elevador.
//
// Planta (norte = −z, o jogador chega olhando para o norte):
//
//            [  Sala dos Geradores (16 m de pé-direito, janela norte) ]
//   [Hangar]─┤        três bobinas de Tesla, turbinas, passarela       ├─[Controle]
//            [___________________________┬────────────────────────────]
//                                   passarela de vidro
//   [ Mirante ]──────────[      Átrio (claraboia)      ]──────────[ Refeitório ]
//   janela oeste                         │                         janela leste
//                                corredor de chegada
//                                  (porta de madeira)
//
// Sem entidades hostis. A sanidade se recupera aqui.
import * as THREE from 'three';
import { pushCircle } from './grid.js';
import { getTex } from '../textures.js';
import { damp } from '../util.js';
import './level0_1_tex.js';
import { ZBuilder, bakeMaterial, glowMaterial, buildShell, bakeLight } from './level0_1_build.js';
import { Space, SUN_DIR } from './level0_1_space.js';
import { buildProps, buildHull, buildExterior, Coils } from './level0_1_props.js';
import { NPC, Robot } from './level0_1_npc.js';
import { talkTo, NPC_DEFS } from './level0_1_story.js';

const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

// ------------------------------------------------------------ salas
// Luz: { x, y, z, c, I, range, dir?, pow?, ch? }  (ch 1 = não depende da energia)
function down(x, y, z, I, range, c = [1, 0.97, 0.92]) {
  return { x, y, z, I, range, c, dir: [0, -1, 0], pow: 0.8, soft: 1.5 };
}

function makeRooms() {
  const R = [];
  // A — corredor de chegada
  const A = {
    id: 'A',
    name: 'Corredor de chegada',
    x0: -3,
    x1: 3,
    z0: 0.4,
    z1: 24,
    h: 3.2,
    surface: 'tile',
    amb: [0.035, 0.04, 0.048],
    holes: {
      n: [{ a0: -2, a1: 2, y0: 0, y1: 2.8, kind: 'portal' }],
      e: [
        { a0: 7, a1: 10, y0: 1.0, y1: 2.3, kind: 'window', mull: 1.5 },
        { a0: 14, a1: 17, y0: 1.0, y1: 2.3, kind: 'window', mull: 1.5 },
      ],
    },
    lights: [3, 7, 11, 15, 19].map((z) => down(0, 3.15, z, 12, 10)),
  };
  A.lights.push({ x: 0, y: 0.3, z: 23.6, I: 1.6, range: 4, c: [1, 0.7, 0.35], ch: 1 });
  A.lights.push({ x: 4.5, y: 1.7, z: 12, I: 6, range: 9, c: [0.55, 0.75, 1.0], ch: 1, dir: [-1, 0, 0] });
  R.push(A);
  // B — Átrio
  const B = {
    id: 'B',
    name: 'Átrio',
    x0: -15,
    x1: 15,
    z0: -30,
    z1: 0,
    h: 9,
    surface: 'tile',
    amb: [0.05, 0.055, 0.062],
    amb2: [0.008, 0.01, 0.016],
    holes: {
      s: [{ a0: -2, a1: 2, y0: 0, y1: 2.8, kind: 'portal' }],
      w: [{ a0: -19, a1: -11, y0: 0, y1: 4, kind: 'portal' }],
      e: [{ a0: -19, a1: -11, y0: 0, y1: 3.2, kind: 'portal' }],
      n: [{ a0: -2.4, a1: 2.4, y0: 0, y1: 3, kind: 'portal' }],
    },
    ceilHoles: [{ x0: -5, x1: 5, z0: -20, z1: -10, depth: 0.8 }],
    sunWindows: [{ axis: 'y', at: 9.8, a0: -5, a1: 5, b0: -20, b1: -10, mull: { on: 'a', step: 2.5 } }],
    lights: [],
  };
  for (const x of [-10, 0, 10])
    for (const z of [-25, -15, -5]) if (!(x === 0 && z === -15)) B.lights.push(down(x, 8.8, z, 46, 24, [1, 0.95, 0.88]));
  // balcão anelar: luzes embutidas embaixo da laje
  for (const [x, z] of [
    [-13, -5],
    [-13, -25],
    [13, -5],
    [13, -25],
    [0, -28],
    [-6, -2],
    [6, -2],
  ])
    B.lights.push(down(x, 4.3, z, 7, 8, [1, 0.9, 0.78]));
  B.lights.push({ x: 0, y: 2.4, z: -15, I: 7, range: 11, c: [0.45, 0.85, 1.0] });
  B.lights.push({ x: 0, y: 9.5, z: -15, I: 18, range: 20, c: [0.5, 0.6, 1.0], ch: 1, dir: [0, -1, 0] });
  R.push(B);
  // C — Mirante
  const C = {
    id: 'C',
    name: 'Mirante',
    x0: -45,
    x1: -15.4,
    z0: -30,
    z1: 0,
    h: 8,
    surface: 'carpet',
    amb: [0.02, 0.022, 0.03],
    amb2: [0.03, 0.02, 0.014],
    holes: {
      e: [{ a0: -19, a1: -11, y0: 0, y1: 4, kind: 'portal' }],
      w: [{ a0: -28, a1: -2, y0: 0.5, y1: 7.4, kind: 'window', mull: 3.25, transom: 4 }],
    },
    sunWindows: [{ axis: 'x', at: -45.2, a0: 0.5, a1: 7.4, b0: -28, b1: -2, mull: { on: 'b', step: 3.25 } }],
    lights: [
      { x: -42.5, y: 4, z: -15, I: 170, range: 36, c: [1.0, 0.68, 0.42], ch: 1, dir: [1, 0, 0], pow: 1 },
      { x: -42.5, y: 6, z: -4, I: 20, range: 20, c: [0.5, 0.55, 0.9], ch: 1, dir: [1, 0, 0] },
    ],
  };
  for (const x of [-35, -24]) for (const z of [-24, -15, -6]) C.lights.push(down(x, 7.8, z, 26, 16, [1, 0.88, 0.7]));
  R.push(C);
  // D — Refeitório e alojamentos
  const D = {
    id: 'D',
    name: 'Refeitório',
    x0: 15.4,
    x1: 40,
    z0: -30,
    z1: 0,
    h: 4.2,
    surface: 'tile',
    amb: [0.045, 0.045, 0.05],
    holes: {
      w: [{ a0: -19, a1: -11, y0: 0, y1: 3.2, kind: 'portal' }],
      e: [{ a0: -27, a1: -3, y0: 1.0, y1: 3.4, kind: 'window', mull: 3 }],
    },
    lights: [{ x: 38.5, y: 2.2, z: -15, I: 26, range: 20, c: [0.6, 0.78, 1.0], ch: 1, dir: [-1, 0, 0] }],
  };
  for (const x of [20, 27, 34]) for (const z of [-25, -17, -9, -3]) D.lights.push(down(x, 4.15, z, 8, 10, [1, 0.93, 0.82]));
  R.push(D);
  // E — passarela de vidro
  const E = {
    id: 'E',
    name: 'Passarela',
    x0: -3,
    x1: 3,
    z0: -55,
    z1: -30.4,
    h: 3.6,
    surface: 'metal',
    amb: [0.025, 0.03, 0.04],
    amb2: [0.01, 0.014, 0.024],
    holes: {
      s: [{ a0: -2.4, a1: 2.4, y0: 0, y1: 3, kind: 'portal' }],
      n: [{ a0: -2.4, a1: 2.4, y0: 0, y1: 3, kind: 'portal' }],
      w: [{ a0: -54.4, a1: -31, y0: 0.45, y1: 3.25, kind: 'window', mull: 2.34 }],
      e: [{ a0: -54.4, a1: -31, y0: 0.45, y1: 3.25, kind: 'window', mull: 2.34 }],
    },
    sunWindows: [{ axis: 'x', at: -3.2, a0: 0.45, a1: 3.25, b0: -54.4, b1: -31, mull: { on: 'b', step: 2.34 } }],
    lights: [
      { x: -4, y: 2, z: -42, I: 18, range: 16, c: [1.0, 0.7, 0.45], ch: 1, dir: [1, 0, 0] },
      { x: 4, y: 2, z: -42, I: 10, range: 14, c: [0.55, 0.75, 1.0], ch: 1, dir: [-1, 0, 0] },
    ],
  };
  for (let z = -52; z <= -33; z += 4.5) E.lights.push(down(0, 3.55, z, 5, 7, [0.9, 0.95, 1.0]));
  R.push(E);
  // F — Sala dos Geradores
  const F = {
    id: 'F',
    name: 'Sala dos Geradores',
    x0: -30,
    x1: 30,
    z0: -110,
    z1: -55.4,
    h: 16,
    surface: 'metal',
    amb: [0.03, 0.032, 0.038],
    amb2: [0.012, 0.005, 0.004],
    holes: {
      s: [{ a0: -2.4, a1: 2.4, y0: 0, y1: 3, kind: 'portal' }],
      e: [{ a0: -72, a1: -68, y0: 0, y1: 3, kind: 'portal' }],
      w: [{ a0: -73, a1: -67, y0: 0, y1: 4.5, kind: 'portal' }],
      n: [{ a0: -22, a1: 22, y0: 3, y1: 14, kind: 'window', mull: 4.4, transom: 8.5 }],
    },
    lights: [
      { x: 0, y: 8, z: -107, I: 200, range: 60, c: [1.0, 0.5, 0.36], ch: 1, dir: [0, 0, 1], pow: 1 },
      // luzes vermelhas de emergência
      { x: -28, y: 4, z: -70, I: 3, range: 9, c: [1, 0.15, 0.1], ch: 1 },
      { x: 28, y: 4, z: -70, I: 3, range: 9, c: [1, 0.15, 0.1], ch: 1 },
      { x: 0, y: 4, z: -57, I: 3, range: 9, c: [1, 0.15, 0.1], ch: 1 },
    ],
  };
  for (const x of [-17, 0, 17]) for (const z of [-64, -82, -100]) F.lights.push(down(x, 15.6, z, 120, 36, [1, 0.96, 0.9]));
  R.push(F);
  // G — Sala de Controle
  const G = {
    id: 'G',
    name: 'Sala de Controle',
    x0: 30.4,
    x1: 48,
    z0: -80,
    z1: -60,
    h: 4,
    surface: 'tile',
    amb: [0.03, 0.035, 0.045],
    amb2: [0.004, 0.012, 0.02],
    holes: {
      w: [{ a0: -72, a1: -68, y0: 0, y1: 3, kind: 'portal' }],
      e: [{ a0: -78, a1: -62, y0: 1.1, y1: 3.5, kind: 'window', mull: 4 }],
    },
    lights: [
      { x: 39, y: 2.2, z: -79, I: 10, range: 10, c: [0.4, 0.85, 1.0], ch: 1, dir: [0, 0, 1] },
      { x: 46.5, y: 2.3, z: -70, I: 14, range: 14, c: [0.6, 0.8, 1.0], ch: 1, dir: [-1, 0, 0] },
    ],
  };
  for (const x of [34, 42]) for (const z of [-75, -65]) G.lights.push(down(x, 3.95, z, 7, 9, [0.95, 0.97, 1.0]));
  R.push(G);
  // H — Hangar
  const H = {
    id: 'H',
    name: 'Hangar',
    x0: -48,
    x1: -30.4,
    z0: -80,
    z1: -60,
    h: 8,
    surface: 'metal',
    amb: [0.03, 0.032, 0.036],
    amb2: [0.004, 0.01, 0.02],
    holes: {
      e: [{ a0: -73, a1: -67, y0: 0, y1: 4.5, kind: 'portal' }],
      s: [{ a0: -46, a1: -33, y0: 0, y1: 6, kind: 'field' }],
    },
    sunWindows: [{ axis: 'z', at: -59.8, a0: -46, a1: -33, b0: 0, b1: 6 }],
    lights: [
      { x: -39.5, y: 3, z: -61, I: 30, range: 18, c: [0.35, 0.7, 1.0], ch: 1, dir: [0, 0, -1] },
      { x: -47.5, y: 2.6, z: -70, I: 4, range: 6, c: [1, 0.3, 0.2], ch: 1 },
    ],
  };
  for (const x of [-43, -35]) for (const z of [-75, -65]) H.lights.push(down(x, 7.8, z, 34, 18, [1, 0.96, 0.9]));
  R.push(H);
  for (const r of R) r.box = true;
  return R;
}

// ------------------------------------------------------------ nível
export class Level0_1 {
  constructor(game) {
    this.game = game;
    this.Q = game.Q;
    this.scene = game.scene;
    this.indoor = false;
    this.num = 0.1;
    this.camFar = 2600;
    this.walkSpeed = 2.5;
    this.flashIntensity = 6;
    this.taken = new Set();
    this.colliders = [];
    this.spots = [];
    this.animate = [];
    this.disposers = [];
    this.dynamic = new THREE.Group();
    this.scene.add(this.dynamic);
    this.realSun = !!this.Q.shadows;
    this.U = { uPower: { value: 0.55 } };
    this.powerBase = 0.55;
    this.time = 0;
    this.sanityExtra = -0.7;
    this.look = {
      exposure: 1.0,
      tint: [1.0, 1.0, 1.02],
      sat: 1.05,
      contrast: 1.06,
      lift: [0.004, 0.005, 0.008],
      bloom: 0.26,
      bloomThreshold: 1.1,
      fog: [0, 0, 0],
      lightColor: [1, 1, 1],
      flashlight: false,
      ambience: 'level0_1',
      reverb: 2.6,
      sanityDrain: 0,
    };
    this.objectives = [
      { id: 'talk', text: 'Fale com a supervisora Ada no Átrio' },
      { id: 'fuses', text: 'Ache os fusíveis de plasma (0/3)' },
      { id: 'deliver', text: 'Entregue-os à engenheira Vega' },
      { id: 'coils', text: 'Recalibre as bobinas (0/3)' },
      { id: 'control', text: 'Fale com o operador Lúcio' },
      { id: 'elevator', text: 'Pegue o elevador no hangar' },
    ];
    this.st = { fuses: 0, fusesHeld: 0, coils: [false, false, false], water: 0, met: new Set() };
    this.spawn = { x: 0, z: 21.6, yaw: 0 };
    this.exit = { x: -47.2, z: -70 };
    this.rooms = makeRooms();
    this.outside = { id: 'out', lights: [], amb: [0.004, 0.005, 0.008], sunAll: true };
    this.sun = { dir: SUN_DIR, I: 2.6, c: [1.0, 0.94, 0.84] };
    this._bk = new Float32Array(6);
    this.scene.background = new THREE.Color(0, 0, 0);
    this.scene.fog = null;
    // luzes reais: céu fraco + a estrela (com sombras a partir da qualidade média)
    this.hemi = new THREE.HemisphereLight(0x8fa4c8, 0x2a2622, 0.32);
    this.scene.add(this.hemi);
    if (this.realSun) {
      const s = new THREE.DirectionalLight(0xfff0dc, 2.6);
      s.castShadow = true;
      s.shadow.mapSize.set(this.Q.shadowSize, this.Q.shadowSize);
      const c = s.shadow.camera;
      c.left = -95;
      c.right = 95;
      c.top = 95;
      c.bottom = -95;
      c.near = 1;
      c.far = 420;
      s.shadow.bias = -0.0004;
      s.shadow.normalBias = 0.05;
      s.shadow.radius = 2;
      s.position.set(SUN_DIR.x * 200, SUN_DIR.y * 200, -43 + SUN_DIR.z * 200);
      s.target.position.set(0, 0, -43);
      this.scene.add(s, s.target);
      s.target.updateMatrixWorld();
      this.sunLight = s;
    }
    this.space = new Space(this);
  }

  // ------------------------------------------------------------ luz assada
  roomAt(x, z) {
    for (const r of this.rooms) if (x >= r.x0 - 0.2 && x <= r.x1 + 0.2 && z >= r.z0 - 0.2 && z <= r.z1 + 0.2) return r;
    return null;
  }

  bakeAt(room, x, y, z, nx, ny, nz) {
    const r = room || this.outside;
    const out = bakeLight(r, [x, y, z], [nx, ny, nz], this._bk, this.realSun ? null : this.sun);
    if (r.sunAll && !this.realSun) {
      const d = nx * SUN_DIR.x + ny * SUN_DIR.y + nz * SUN_DIR.z;
      if (d > 0) {
        out[3] += d * this.sun.c[0] * 2.2;
        out[4] += d * this.sun.c[1] * 2.2;
        out[5] += d * this.sun.c[2] * 2.2;
      }
    }
    return out;
  }

  // Irradiância média num ponto (para pessoas e objetos móveis).
  ambientAt(x, y, z) {
    const r = this.roomAt(x, z);
    const v = (this._amb = this._amb || new THREE.Vector3());
    if (!r) return v.set(0.05, 0.05, 0.06);
    if (!r._cache) r._cache = new Map();
    const key = Math.round(x * 2) * 10000 + Math.round(z * 2);
    let c = r._cache.get(key);
    if (!c) {
      c = [0, 0, 0, 0, 0, 0];
      const N = [
        [0, 1, 0],
        [1, 0, 0],
        [-1, 0, 0],
        [0, 0, 1],
        [0, 0, -1],
      ];
      for (const n of N) {
        const b = bakeLight(r, [x, y, z], n, this._bk, null);
        for (let i = 0; i < 6; i++) c[i] += b[i] / N.length;
      }
      r._cache.set(key, c);
    }
    const p = this.U.uPower.value;
    return v.set(c[0] * p + c[3], c[1] * p + c[4], c[2] * p + c[5]).multiplyScalar(0.9);
  }

  // ------------------------------------------------------------ construção
  makeMaterials() {
    const Q = this.Q;
    const S = Q.tex;
    const U = this.U;
    const env = this.game.makeEnv(this.envTex());
    const T = (n) => getTex(n, S);
    const mk = (o, uvS) => {
      const m = bakeMaterial(Q, { envMap: env, envIntensity: 0.35, ...o }, U);
      m.userData.uvS = uvS;
      return m;
    };
    const fl = T('zFloor');
    const wl = T('zWall');
    const dk = T('zDark');
    const cl = T('zCeil');
    const gr = T('zGrate');
    const cp = T('zCarpet');
    const hz = T('zHazard');
    const cu = T('zCopper');
    const pl = T('planks');
    const M = {
      floor: mk({ map: fl.map, normalMap: fl.normalMap, roughnessMap: fl.roughnessMap, roughness: 1, metalness: 0.15, envIntensity: 0.5 }, 2.4),
      floorDark: mk({ map: fl.map, normalMap: fl.normalMap, roughnessMap: fl.roughnessMap, color: 0x8d939b, roughness: 1, metalness: 0.3 }, 2.4),
      wall: mk({ map: wl.map, normalMap: wl.normalMap, normalScale: 0.6, roughness: 0.55 }, 2.4),
      ceil: mk({ map: cl.map, normalMap: cl.normalMap, roughness: 0.85 }, 2.4),
      dark: mk({ map: dk.map, normalMap: dk.normalMap, roughnessMap: dk.roughnessMap, roughness: 1, metalness: 0.55, envIntensity: 0.6 }, 2),
      grate: mk({ map: gr.map, normalMap: gr.normalMap, roughness: 0.6, metalness: 0.6 }, 1.2),
      carpet: mk({ map: cp.map, normalMap: cp.normalMap, roughness: 0.95, envIntensity: 0.1 }, 2),
      hazard: mk({ map: hz.map, roughness: 0.6 }, 1.2),
      copper: mk({ map: cu.map, normalMap: cu.normalMap, roughness: 0.35, metalness: 0.85, envIntensity: 0.8 }, 1),
      wood: mk({ map: pl.map, normalMap: pl.normalMap, roughness: 0.7, color: 0xd9c2a4 }, 1.6),
      frame: mk({ color: 0xc2c9d1, roughness: 0.35, metalness: 0.7, envIntensity: 0.8 }, 2),
      base: mk({ color: 0x2b3036, roughness: 0.5, metalness: 0.3 }, 2),
      white: mk({ color: 0xe9edf0, roughness: 0.35, metalness: 0.05, envIntensity: 0.5 }, 2),
      chrome: mk({ color: 0xc9cfd6, roughness: 0.18, metalness: 0.95, envIntensity: 1.2 }, 2),
      fabric: mk({ color: 0x55789e, roughness: 0.95, envIntensity: 0.05 }, 1),
      fabricRed: mk({ color: 0x7a2e2a, roughness: 0.95, envIntensity: 0.05 }, 1),
      linen: mk({ color: 0xe2ddd2, roughness: 0.95, envIntensity: 0.05 }, 1),
      leaf: mk({ color: 0x3c7a3a, roughness: 0.7, side: THREE.DoubleSide, envIntensity: 0.1 }, 1),
      soil: mk({ color: 0x33261a, roughness: 1, envIntensity: 0 }, 1),
      hull: mk({ map: wl.map, normalMap: wl.normalMap, color: 0xb9bec5, roughness: 0.6, metalness: 0.2 }, 4),
      hullDark: mk({ map: dk.map, normalMap: dk.normalMap, roughness: 0.8, metalness: 0.5 }, 3),
      solar: mk({ color: 0x1b2a55, roughness: 0.22, metalness: 0.6, envIntensity: 1.2 }, 2),
      paperW: mk({ map: getTex('wallpaper', S).map, roughness: 0.85 }, 1.2),
      paperC: mk({ map: getTex('carpet', S).map, roughness: 0.95 }, 2),
      // emissivos
      lamp: glowMaterial(U, { color: 0xfff4e6, k: 1 }),
      lampWarm: glowMaterial(U, { color: 0xffd9a8, k: 1 }),
      blue: glowMaterial(U, { color: 0x3fb6ff, k: 0.7 }),
      cyan: glowMaterial(U, { color: 0x7fe8ff, k: 0.3 }),
      red: glowMaterial(U, { color: 0xff3a2a, k: 0 }),
      green: glowMaterial(U, { color: 0x45ff8a, k: 0 }),
      amber: glowMaterial(U, { color: 0xffa640, k: 0 }),
      navR: glowMaterial(U, { color: 0xff2020, k: 0 }),
      navG: glowMaterial(U, { color: 0x20ff60, k: 0 }),
      engine: glowMaterial(U, { color: 0x88c8ff, k: 0 }),
    };
    for (const k of ['lamp', 'lampWarm', 'blue', 'cyan', 'red', 'green', 'amber', 'navR', 'navG', 'engine']) M[k].userData.noShadow = true;
    M.lamp.color.multiplyScalar(2.2);
    M.lampWarm.color.multiplyScalar(1.8);
    M.blue.color.multiplyScalar(1.6);
    M.engine.color.multiplyScalar(2.5);
    M.navR.color.multiplyScalar(3);
    M.navG.color.multiplyScalar(3);
    for (const r of this.rooms) {
      r.mats = { floor: M.floor, wall: M.wall, ceil: M.ceil, trim: M.frame, base: M.base, frame: M.frame, reveal: M.dark };
    }
    const byId = Object.fromEntries(this.rooms.map((r) => [r.id, r]));
    byId.C.mats.floor = M.carpet;
    byId.E.mats.floor = M.grate;
    byId.F.mats = { floor: M.floorDark, wall: M.dark, ceil: M.dark, trim: M.frame, base: M.hazard, frame: M.frame, reveal: M.dark };
    byId.H.mats = { floor: M.floorDark, wall: M.dark, ceil: M.dark, trim: M.frame, base: M.hazard, frame: M.frame, reveal: M.dark };
    this.byId = byId;
    this.M = M;
    // vidro das janelas: quase invisível, com reflexo nas bordas (Fresnel)
    this.glassMat = new THREE.ShaderMaterial({
      uniforms: { uTint: { value: new THREE.Color(0.55, 0.7, 0.9) } },
      vertexShader: /* glsl */ `
        varying vec3 vN;
        varying vec3 vW;
        void main() {
          vN = normalize( mat3( modelMatrix ) * normal );
          vec4 w = modelMatrix * vec4( position, 1.0 );
          vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uTint;
        varying vec3 vN;
        varying vec3 vW;
        float h( vec2 p ) { return fract( sin( dot( p, vec2( 12.9898, 78.233 ) ) ) * 43758.5453 ); }
        void main() {
          vec3 v = normalize( cameraPosition - vW );
          float f = pow( 1.0 - abs( dot( normalize( vN ), v ) ), 4.0 );
          float smudge = h( floor( vW.xy * 9.0 ) + floor( vW.zy * 9.0 ) ) * 0.015;
          gl_FragColor = vec4( uTint, 0.025 + f * 0.35 + smudge );
        }`,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      fog: false,
    });
    // campo de força da baía do hangar
    this.fieldMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 ); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          vec2 p = vUv * vec2( 13.0, 6.0 );
          float hex = abs( sin( p.x * 3.0 + sin( p.y * 3.0 ) ) * sin( p.y * 3.4 - uTime * 0.6 ) );
          float lines = smoothstep( 0.92, 1.0, hex );
          float scan = smoothstep( 0.0, 0.08, abs( fract( vUv.y * 2.0 - uTime * 0.25 ) - 0.5 ) );
          float edge = smoothstep( 0.06, 0.0, min( min( vUv.x, 1.0 - vUv.x ), min( vUv.y, 1.0 - vUv.y ) ) );
          float a = 0.05 + lines * 0.22 + ( 1.0 - scan ) * 0.08 + edge * 0.5;
          gl_FragColor = vec4( vec3( 0.35, 0.75, 1.0 ) * ( 1.0 + edge ), a );
        }`,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      fog: false,
    });
  }

  envTex() {
    // ambiente: interior claro com faixas de luz e um horizonte escuro (espaço)
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 128;
    const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#d8dde4');
    g.addColorStop(0.45, '#8c96a3');
    g.addColorStop(0.55, '#20242a');
    g.addColorStop(1, '#5a5f66');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 128);
    c.fillStyle = '#ffffff';
    for (let i = 0; i < 12; i++) c.fillRect(i * 21 + 4, 10, 12, 4);
    c.fillStyle = '#0a0c12';
    c.fillRect(0, 54, 64, 26);
    c.fillStyle = '#c87a3a';
    c.beginPath();
    c.arc(40, 66, 9, 0, Math.PI * 2);
    c.fill();
    const t = new THREE.CanvasTexture(cv);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  async preload(px, pz, progress) {
    this.makeMaterials();
    const B = new ZBuilder(this);
    this.B = B;
    const steps = this.rooms.length + 5;
    let n = 0;
    const tick = async () => {
      n++;
      if (progress) progress(Math.min(1, n / steps));
      await yieldFrame();
    };
    this.glassB = { pos: [], nor: [] };
    for (const r of this.rooms) {
      buildShell(B, r, this.colliders);
      await tick();
    }
    this.coils = new Coils(this);
    await buildProps(this, B);
    await tick();
    buildHull(this, B);
    await tick();
    buildExterior(this, B);
    await tick();
    this.meshes = B.build(this.dynamic);
    this.buildGlass();
    await tick();
    // moradores
    this.npcs = NPC_DEFS.map((d) => (d.robot ? new Robot(this, d) : new NPC(this, d)));
    for (const npc of this.npcs) {
      this.spots.push({
        x: npc.x,
        z: npc.z,
        npc,
        r: 2.3,
        label: () => `Falar com ${npc.name}`,
        action: () => this.talk(npc),
      });
    }
    await tick();
  }

  // Vidros (uma única malha transparente).
  buildGlass() {
    const g = this.glassB;
    if (!g.pos.length) return;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(g.pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(g.nor, 3));
    this.glass = new THREE.Mesh(geo, this.glassMat);
    this.glass.renderOrder = 4;
    this.dynamic.add(this.glass);
  }

  addGlass(p0, U, V, n) {
    const g = this.glassB;
    const P = (s, t) => [p0[0] + U[0] * s + V[0] * t, p0[1] + U[1] * s + V[1] * t, p0[2] + U[2] * s + V[2] * t];
    for (const [s, t] of [
      [0, 0],
      [1, 0],
      [1, 1],
      [0, 0],
      [1, 1],
      [0, 1],
    ]) {
      g.pos.push(...P(s, t));
      g.nor.push(...n);
    }
  }

  col(x0, x1, z0, z1) {
    this.colliders.push([Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1)]);
  }

  // ------------------------------------------------------------ conversa
  talk(npc) {
    this.talking = npc;
    this.st.met.add(npc.id);
    talkTo(this, npc);
  }

  // Abre/atualiza a caixa de diálogo. choices: [{ text, fn }]; uma escolha sem
  // nova fala fecha a conversa.
  say(npc, text, choices = []) {
    const hud = this.game.hud;
    this._said = true;
    const wrapped = (choices.length ? choices : [{ text: 'Até mais.' }]).map((c) => ({
      text: c.text,
      fn: () => {
        this._said = false;
        if (c.fn) c.fn();
        if (!this._said) {
          hud.closeDialog();
          this.talking = null;
        }
      },
    }));
    const who = npc.role ? `${npc.name} · ${npc.role}` : npc.name;
    hud.dialog(who, text, wrapped, npc.portrait || '');
    if (npc.voice !== false) this.game.audio.play('beep', { gain: 0.04, rate: npc.def && npc.def.robot ? 0.6 : 1.6, wet: 0.2 });
  }

  // ------------------------------------------------------------ progresso
  pickFuse(it) {
    const g = this.game;
    this.st.fuses++;
    this.st.fusesHeld++;
    g.audio.play('powerUp', { gain: 0.25, rate: 1.6 });
    g.vibrate(30);
    const n = this.st.fuses;
    g.setObjectiveText('fuses', `Ache os fusíveis de plasma (${n}/3)`);
    if (n >= 3) {
      if (g.objectiveDone('talk')) g.completeObjective('fuses', 'Os três fusíveis de plasma estão com você.');
      else g.hud.message('Três fusíveis. Alguém aqui deve saber o que fazer com eles.', 4);
    } else g.hud.message(`Fusível de plasma (${n}/3). Ele zumbe e esquenta na mão.`, 3.5);
    if (it && it.label) this.fuseSpots = (this.fuseSpots || []).filter((f) => f.key !== it.key);
  }

  calibrate(i) {
    const g = this.game;
    this.st.coils[i] = true;
    const n = this.st.coils.filter(Boolean).length;
    this.coils.setCalm(i);
    g.audio.play('powerUp', { gain: 0.5 });
    g.vibrate(80);
    this.powerBase = [0.55, 0.68, 0.82, 1.0][n];
    g.setObjectiveText('coils', `Recalibre as bobinas (${n}/3)`);
    if (n >= 3) {
      g.completeObjective('coils', 'As três bobinas estão em fase. A estação inteira se acende.');
      this.fullPower = true;
      g.audio.play('ding', { gain: 0.5, when: 0.6 });
    } else g.hud.message(`Bobina ${i + 1} em fase (${n}/3). As luzes ficam mais firmes.`, 3.5);
  }

  onObjective(id) {
    if (id === 'talk' && this.st.fuses >= 3) setTimeout(() => this.game.completeObjective('fuses', 'Os três fusíveis já estão com você.'), 400);
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    this.time += dt;
    const t = this.time;
    const g = this.game;
    // energia: oscila e às vezes cai até as bobinas estarem em fase
    if (!this.fullPower) {
      this.brownT = (this.brownT === undefined ? 12 : this.brownT) - dt;
      if (this.brownT <= 0) {
        this.brownT = 16 + Math.random() * 18;
        this.dip = 0.5;
        g.audio.play('powerDown', { gain: 0.15, rate: 1.4 });
      }
    }
    this.dip = Math.max(0, (this.dip || 0) - dt);
    const flick = this.fullPower ? 0 : Math.sin(t * 23) * Math.sin(t * 3.7) * 0.03;
    const target = this.powerBase * (this.dip > 0 ? 0.25 + Math.random() * 0.2 : 1) + flick;
    this.U.uPower.value = damp(this.U.uPower.value, target, this.dip > 0 ? 30 : 3, dt);
    this.power = this.U.uPower.value;
    this.space.update(dt, g.camera);
    this.coils.update(dt, t, player);
    if (this.fieldMat) this.fieldMat.uniforms.uTime.value = t;
    if (this.animate) for (const f of this.animate) f(dt, t, player);
    // conversa terminou?
    if (this.talking && !g.hud.dialogOpen) this.talking = null;
    for (const npc of this.npcs) npc.update(dt, player, t, this.talking === npc);
    // o robô se move: atualiza o ponto de conversa
    for (const s of this.spots) if (s.npc) (s.x = s.npc.x), (s.z = s.npc.z);
  }

  // Durante a conversa o jogo pausa, mas a estação e as pessoas continuam vivas.
  dialogTick(dt, player) {
    this.update(dt, player);
  }

  collide(p, r) {
    for (let it = 0; it < 2; it++) {
      for (const b of this.colliders) {
        if (p.x < b[0] - 1 || p.x > b[1] + 1 || p.z < b[2] - 1 || p.z > b[3] + 1) continue;
        pushCircle(p, r, b[0], b[1], b[2], b[3]);
      }
      // pessoas
      for (const n of this.npcs || []) {
        const dx = p.x - n.x;
        const dz = p.z - n.z;
        const d = Math.hypot(dx, dz);
        const rr = r + 0.3;
        if (d < rr && d > 1e-4) {
          p.x = n.x + (dx / d) * rr;
          p.z = n.z + (dz / d) * rr;
        }
      }
    }
    return p;
  }

  los() {
    return true;
  }

  lightLevel() {
    return 1;
  }

  surfaceAt(x, z) {
    const r = this.roomAt(x, z);
    return r ? r.surface : 'metal';
  }

  interactable(player) {
    if (this.talking && this.game.hud.dialogOpen) return null;
    const p = player.pos;
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    let best = null;
    let bd = 1e9;
    for (const s of this.spots) {
      if (s.when && !s.when()) continue;
      const dx = s.x - p.x;
      const dz = s.z - p.z;
      const d = Math.hypot(dx, dz);
      if (d > s.r) continue;
      const dot = (dx * fx + dz * fz) / Math.max(d, 0.01);
      if (d > 0.8 && dot < 0.35) continue;
      const score = d - dot * 0.6;
      if (score < bd) {
        bd = score;
        best = s;
      }
    }
    if (!best) return null;
    return { label: typeof best.label === 'function' ? best.label() : best.label, action: best.action };
  }

  navTarget() {
    const g = this.game;
    const cur = g.currentObjective();
    if (!cur) return this.exit;
    const npc = (id) => {
      const n = this.npcs.find((q) => q.id === id);
      return n ? { x: n.x, z: n.z } : this.exit;
    };
    if (cur.id === 'talk') return npc('ada');
    if (cur.id === 'fuses') {
      const p = g.player.pos;
      let best = null;
      let bd = 1e9;
      for (const f of this.fuseSpots || []) {
        if (this.taken.has(f.key)) continue;
        const d = Math.hypot(f.x - p.x, f.z - p.z);
        if (d < bd) {
          bd = d;
          best = f;
        }
      }
      return best || npc('ada');
    }
    if (cur.id === 'deliver') return npc('vega');
    if (cur.id === 'coils') {
      const i = this.st.coils.findIndex((c) => !c);
      const c = this.coils.list[i];
      return { x: c.px, z: c.pz };
    }
    if (cur.id === 'control') return npc('lucio');
    return this.exit;
  }

  exitEmitter() {
    return { x: 0, y: 4, z: -86, sound: 'machine', gain: 0.5 };
  }

  dispose() {
    this.space.dispose();
    this.coils.dispose();
    for (const n of this.npcs || []) n.dispose();
    this.dynamic.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const k in this.M || {}) this.M[k].dispose();
    this.glassMat.dispose();
    this.fieldMat.dispose();
    if (this.sunLight) {
      this.sunLight.shadow.map && this.sunLight.shadow.map.dispose();
      this.scene.remove(this.sunLight, this.sunLight.target);
    }
    this.scene.remove(this.hemi, this.dynamic);
    if (this.disposers) for (const f of this.disposers) f();
    this.scene.background = null;
  }
}

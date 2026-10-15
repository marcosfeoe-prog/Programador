// Nível 37 — "Sublimidade": um labirinto de piscinas de azulejos brancos,
// impecáveis e todos iguais, cheio de água morna verde-azulada com uma ondulação
// mínima e constante. Salas muito iluminadas (luz do "céu" por claraboias em
// ângulos estranhos) e salas quase no escuro, colunas demais, poços fundos com
// escadas que descem para dentro d'água. Pacífico: a sanidade se recupera.
//
// Três saídas: escada para o subterrâneo (Nível 88), porta de manutenção
// (Nível 15) e porta futurista (Subnível 0.1). Área secreta: a loja dos
// mercenários, atrás de azulejos soltos numa sala escura.
// Eventos: o Verão (a cada 5 min, 3 min de luz de pôr do sol) e o Roxo
// Iminente (raro, curto, brilho roxo hipnótico).
import * as THREE from 'three';
import { pushCircle } from './grid.js';
import { litMaterial } from '../materials.js';
import { getTex, textCanvasTex } from '../textures.js';
import { clamp, damp, lerp, mulberry32, smoothstep } from '../util.js';
import { ZBuilder, buildShell, bakeLight } from './level0_1_build.js';
import './level37_tex.js';
import { Shop } from './level37_shop.js';

const N = 7; // salas por lado
const C = 10; // tamanho da célula (m)
const OFF = -(N * C) / 2;
const WATER_Y = 0.5;
const LEDGE_Y = 0.6;
const SUN = new THREE.Vector3(0.35, 1, 0.22).normalize();
const PERIOD = 300; // evento do verão: a cada 5 min…
const SUMMER = 180; // …durando 3 min

const cellX0 = (i) => OFF + i * C + 0.2;
const cellZ0 = (j) => OFF + j * C + 0.2;
const cx = (i) => OFF + (i + 0.5) * C;

function down(x, y, z, I, range, c = [1, 0.98, 0.94]) {
  return { x, y, z, I, range, c, dir: [0, -1, 0], pow: 0.9, soft: 1.5 };
}

// ------------------------------------------------------------ material
// Luz assada em dois canais (lâmpadas e "céu"), tingidos pelos eventos, mais
// cáusticas animadas da água nos pisos e na faixa de parede perto da linha d'água.
function poolMaterial(Q, o, U) {
  const m = litMaterial(Q, o);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uLamp = U.uLamp;
    sh.uniforms.uSky = U.uSky;
    sh.uniforms.uTime = U.uTime;
    sh.uniforms.uCaust = U.uCaust;
    sh.vertexShader = sh.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nattribute vec3 aBake;\nattribute vec3 aBake2;\nuniform vec3 uLamp;\nuniform vec3 uSky;\nvarying vec3 vBake;\nvarying vec3 vSkyB;\nvarying vec3 vWP;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvBake = aBake * uLamp + aBake2 * uSky;\nvSkyB = aBake2 * uSky + aBake * uLamp * 0.4;\nvWP = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;',
      );
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vBake;
        varying vec3 vSkyB;
        varying vec3 vWP;
        uniform float uTime;
        uniform float uCaust;
        float caust( vec2 p, float t ) {
          vec2 q = p * 1.1;
          float c = 0.0;
          for ( int i = 0; i < 3; i++ ) {
            q += vec2( sin( q.y * 1.7 + t * 0.9 ), cos( q.x * 1.3 - t * 0.7 ) ) * 0.45;
            c += 1.0 / ( 1.0 + abs( sin( q.x ) + sin( q.y ) ) * 5.0 );
          }
          return c / 3.0;
        }`,
      )
      .replace(
        '#include <lights_fragment_maps>',
        `#include <lights_fragment_maps>
        #if defined( RE_IndirectDiffuse )
        irradiance += vBake * PI;
        // cáusticas: no fundo (sob a água) e refletidas na parede logo acima dela
        float under = smoothstep( ${(WATER_Y + 0.05).toFixed(2)}, ${(WATER_Y - 0.1).toFixed(2)}, vWP.y );
        float above = smoothstep( ${(WATER_Y + 1.6).toFixed(2)}, ${(WATER_Y + 0.05).toFixed(2)}, vWP.y ) * ( 1.0 - under );
        if ( uCaust > 0.0 && under + above > 0.0 ) {
          vec2 cp = vWP.y < ${WATER_Y.toFixed(2)} ? vWP.xz : vec2( vWP.x + vWP.z, vWP.y * 3.0 );
          float c = caust( cp, uTime );
          irradiance += vSkyB * PI * pow( c, 3.0 ) * ( under * 2.4 + above * 1.1 ) * uCaust;
        }
        #endif`,
      );
  };
  m.customProgramCacheKey = () => 'l37pool';
  return m;
}

// ------------------------------------------------------------ nível
export class Level37 {
  constructor(game) {
    this.game = game;
    this.Q = game.Q;
    this.scene = game.scene;
    this.indoor = false;
    this.num = 37;
    this.camFar = 260;
    this.walkSpeed = 2.0;
    this.flashIntensity = 14;
    this.taken = new Set();
    this.colliders = [];
    this.ledges = [];
    this.pits = [];
    this.spots = [];
    this.animate = [];
    this.disposers = [];
    this.dynamic = new THREE.Group();
    this.scene.add(this.dynamic);
    this.realSun = false;
    this.time = 0;
    this.U = {
      uLamp: { value: new THREE.Vector3(1, 1, 1) },
      uSky: { value: new THREE.Vector3(1, 1, 1) },
      uTime: { value: 0 },
      uCaust: { value: game.Q.id === 'low' ? 0.6 : 1 },
    };
    this.sun = { dir: SUN, I: 2.2, c: [1, 0.98, 0.92] };
    this._bk = new Float32Array(6);
    this.look = {
      exposure: 1.05,
      tint: [0.98, 1.02, 1.0],
      sat: 0.95,
      contrast: 1.04,
      lift: [0.01, 0.014, 0.013],
      bloom: 0.22,
      bloomThreshold: 1.2,
      fog: [0.02, 0.03, 0.03],
      lightColor: [1, 1, 1],
      flashlight: false,
      ambience: 'level37',
      reverb: 3.8,
      sanityDrain: 0,
    };
    this.sanityExtra = -0.5;
    this.objectives = [
      { id: 'rest', text: 'Descanse na água morna' },
      { id: 'exits', text: 'Encontre as saídas (0/3)' },
      { id: 'secret', text: 'Há algo escondido num canto escuro' },
    ];
    this.found = new Set();
    this.scene.background = new THREE.Color(0, 0, 0);
    this.scene.fog = new THREE.FogExp2(new THREE.Color(0.02, 0.03, 0.03), 0.02);
    this.makeLayout();
  }

  // ------------------------------------------------------------ planta
  makeLayout() {
    const rnd = mulberry32(3737);
    this.rnd = rnd;
    // labirinto: busca em profundidade + algumas ligações extras (laços)
    const links = new Set();
    const seen = new Set([0]);
    const stack = [[3, 3]];
    seen.add(3 * N + 3);
    const key = (i, j, k, l) => (i * N + j < k * N + l ? `${i},${j},${k},${l}` : `${k},${l},${i},${j}`);
    while (stack.length) {
      const [i, j] = stack[stack.length - 1];
      const nb = [
        [i + 1, j],
        [i - 1, j],
        [i, j + 1],
        [i, j - 1],
      ].filter(([a, b]) => a >= 0 && b >= 0 && a < N && b < N && !seen.has(a * N + b));
      if (!nb.length) {
        stack.pop();
        continue;
      }
      const [a, b] = nb[Math.floor(rnd() * nb.length)];
      seen.add(a * N + b);
      links.add(key(i, j, a, b));
      stack.push([a, b]);
    }
    for (let k = 0; k < 14; k++) {
      const i = Math.floor(rnd() * (N - 1));
      const j = Math.floor(rnd() * N);
      if (rnd() < 0.5) links.add(key(i, j, i + 1, j));
      else if (j < N - 1) links.add(key(i, j, i, j + 1));
    }
    // salas
    const fixed = {
      '3,3': 'spawn',
      '0,0': 'stairs',
      '6,1': 'maint',
      '5,6': 'future',
      '0,3': 'secretwall',
    };
    this.grid = [];
    for (let j = 0; j < N; j++)
      for (let i = 0; i < N; i++) {
        let type = fixed[`${i},${j}`];
        if (!type) {
          const r = rnd();
          type = r < 0.22 ? 'pillars' : r < 0.38 ? 'deep' : r < 0.62 ? 'dark' : r < 0.85 ? 'bright' : 'normal';
        }
        const hBase = type === 'pillars' ? 6.5 : type === 'bright' || type === 'spawn' ? 7 + rnd() * 3 : 4.5 + rnd() * 3.5;
        const room = {
          id: `${i},${j}`,
          i,
          j,
          type,
          x0: cellX0(i),
          x1: cellX0(i) + C - 0.4,
          z0: cellZ0(j),
          z1: cellZ0(j) + C - 0.4,
          h: hBase,
          box: true,
          lights: [],
          holes: { n: [], s: [], w: [], e: [] },
          floorHoles: [],
          ceilHoles: [],
        };
        this.grid.push(room);
      }
    this.rooms = [...this.grid];
    const at = (i, j) => this.grid[j * N + i];
    // vãos entre salas vizinhas
    for (const k of links) {
      const [i, j, a, b] = k.split(',').map(Number);
      const A = at(i, j);
      const B = at(a, b);
      const wide = rnd() < 0.3;
      const w = wide ? 5.5 : 2.6 + rnd() * 0.8;
      const hh = Math.min(A.h, B.h) - (wide ? 0.6 : 0) - (rnd() < 0.5 ? 0 : 1.2);
      const y1 = Math.max(2.6, Math.min(hh, 4.2 + (wide ? 2 : 0)));
      if (a === i + 1) {
        const c = cx(j) + (rnd() - 0.5) * (C - w - 3);
        A.holes.e.push({ a0: c - w / 2, a1: c + w / 2, y0: 0, y1, kind: 'portal' });
        B.holes.w.push({ a0: c - w / 2, a1: c + w / 2, y0: 0, y1, kind: 'portal' });
      } else {
        const c = cx(i) + (rnd() - 0.5) * (C - w - 3);
        A.holes.s.push({ a0: c - w / 2, a1: c + w / 2, y0: 0, y1, kind: 'portal' });
        B.holes.n.push({ a0: c - w / 2, a1: c + w / 2, y0: 0, y1, kind: 'portal' });
      }
    }
    // conteúdo e luz de cada sala
    for (const r of this.grid) this.planRoom(r, rnd);
    // poço da escada (precisa existir antes de construir o piso)
    {
      const r = at(0, 0);
      const w = 2.2;
      const L = 4.2;
      const x = (r.x0 + r.x1) / 2 + 1;
      const z = (r.z0 + r.z1) / 2;
      this.stairHole = { x0: x - w / 2, x1: x - w / 2 + w, z0: z - L / 2, z1: z + L / 2, x, z, w, L };
      r.floorHoles.push(this.stairHole);
    }
    // loja secreta a oeste da sala (0,3)
    const sw = at(0, 3);
    const zc = cx(3);
    sw.holes.w.push({ a0: zc - 1.0, a1: zc + 1.0, y0: 0, y1: 2.4, kind: 'portal' });
    this.secret = { x: sw.x0 + 0.06, z: zc, open: 0, target: 0 };
    const shop = {
      id: 'shop',
      type: 'shop',
      x0: OFF - 11,
      x1: OFF - 0.2,
      z0: zc - 4.6,
      z1: zc + 4.6,
      h: 3.4,
      box: true,
      dry: true,
      amb: [0.05, 0.05, 0.055],
      lights: [down(OFF - 7.5, 3.35, zc - 2, 14, 9, [1, 0.85, 0.6]), down(OFF - 7.5, 3.35, zc + 2, 14, 9, [1, 0.85, 0.6]), { x: OFF - 10.5, y: 2.6, z: zc, I: 5, range: 6, c: [0.3, 0.6, 1.0] }],
      holes: { n: [], s: [], w: [], e: [{ a0: zc - 1.0, a1: zc + 1.0, y0: 0, y1: 2.4, kind: 'portal' }] },
      floorHoles: [],
      ceilHoles: [],
    };
    this.shopRoom = shop;
    this.rooms.push(shop);
    // ponto de chegada: sobre a borda da sala central
    const s = at(3, 3);
    this.spawnLedge = s.ledgeMain;
    this.spawn = { x: s.ledgeMain.cx, z: s.ledgeMain.cz, yaw: s.ledgeMain.yaw };
    this.exit = this.exits ? this.exits[0] : { x: 0, z: 0 };
  }

  // Tipo, bordas secas, poços, colunas e luzes de uma sala.
  planRoom(r, rnd) {
    const W = r.x1 - r.x0;
    const D = r.z1 - r.z0;
    const mx = (r.x0 + r.x1) / 2;
    const mz = (r.z0 + r.z1) / 2;
    r.items = [];
    // borda seca (passarela) ao longo de uma parede sem vãos, se possível
    const sides = ['n', 's', 'w', 'e'].sort(() => rnd() - 0.5);
    const nLedge = r.type === 'spawn' || r.type === 'maint' || r.type === 'future' ? 1 : rnd() < 0.55 ? 1 : 0;
    const want = r.type === 'maint' ? 'e' : r.type === 'future' ? 's' : null;
    const pick = want ? [want] : sides.slice(0, nLedge);
    for (const side of pick) {
      const w = 1.5;
      let L;
      if (side === 'n') L = { x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z0 + w, yaw: Math.PI };
      else if (side === 's') L = { x0: r.x0, x1: r.x1, z0: r.z1 - w, z1: r.z1, yaw: 0 };
      else if (side === 'w') L = { x0: r.x0, x1: r.x0 + w, z0: r.z0, z1: r.z1, yaw: -Math.PI / 2 };
      else L = { x0: r.x1 - w, x1: r.x1, z0: r.z0, z1: r.z1, yaw: Math.PI / 2 };
      L.side = side;
      L.cx = (L.x0 + L.x1) / 2;
      L.cz = (L.z0 + L.z1) / 2;
      // olhando para o meio da sala
      L.yaw = Math.atan2(-(mx - L.cx), -(mz - L.cz));
      this.ledges.push(L);
      r.ledgeMain = r.ledgeMain || L;
    }
    // poço fundo com escada descendo para dentro d'água
    if (r.type === 'deep') {
      const pw = 4 + rnd() * 1.5;
      const pd = 4 + rnd() * 1.5;
      const P = { x0: mx - pw / 2, x1: mx + pw / 2, z0: mz - pd / 2, z1: mz + pd / 2, depth: 3.2 + rnd() * 2, room: r };
      r.floorHoles.push(P);
      this.pits.push(P);
      this.colliders.push([P.x0 - 0.15, P.x1 + 0.15, P.z0 - 0.15, P.z1 + 0.15]);
    }
    if (r.type === 'pillars') {
      r.pillars = [];
      for (let x = r.x0 + 2; x < r.x1 - 1; x += 2.4)
        for (let z = r.z0 + 2; z < r.z1 - 1; z += 2.4) {
          if (rnd() < 0.12) continue;
          r.pillars.push([x, z]);
          this.colliders.push([x - 0.35, x + 0.35, z - 0.35, z + 0.35]);
        }
    }
    // iluminação
    const pool = (x, z, I = 6, c = [0.35, 1.0, 0.8]) => {
      r.lights.push({ x, y: 0.25, z, I, range: 7, c });
      r.poolLights = r.poolLights || [];
      r.poolLights.push([x, z]);
    };
    const wallPool = (k) => {
      // luz subaquática encostada numa parede
      const side = ['n', 's', 'w', 'e'][k % 4];
      const t = 0.3 + rnd() * 0.4;
      if (side === 'n') pool(r.x0 + W * t, r.z0 + 0.05);
      else if (side === 's') pool(r.x0 + W * t, r.z1 - 0.05);
      else if (side === 'w') pool(r.x0 + 0.05, r.z0 + D * t);
      else pool(r.x1 - 0.05, r.z0 + D * t);
    };
    if (r.type === 'dark' || r.type === 'secretwall' || r.type === 'stairs') {
      r.amb = [0.003, 0.004, 0.004];
      if (rnd() < 0.5 || r.type === 'stairs') wallPool(Math.floor(rnd() * 4));
      if (r.type === 'stairs') r.lights.push({ x: mx, y: r.h - 0.3, z: mz, I: 5, range: 8, c: [1, 0.9, 0.75], dir: [0, -1, 0] });
    } else if (r.type === 'bright' || r.type === 'spawn') {
      // claraboia (luz do céu em ângulo)
      const hw = 2 + rnd() * 1.5;
      const ox = (rnd() - 0.5) * 3;
      const oz = (rnd() - 0.5) * 3;
      const hole = { x0: mx + ox - hw, x1: mx + ox + hw, z0: mz + oz - hw, z1: mz + oz + hw, depth: 1.2 };
      r.ceilHoles.push(hole);
      r.sunWindows = [{ axis: 'y', at: r.h + 1.2, a0: hole.x0, a1: hole.x1, b0: hole.z0, b1: hole.z1 }];
      r.amb = [0.03, 0.035, 0.035];
      r.amb2 = [0.05, 0.055, 0.055];
      r.lights.push({ x: mx + ox, y: r.h + 0.6, z: mz + oz, I: 38, range: 22, c: [1, 0.98, 0.92], ch: 1, dir: [0, -1, 0], pow: 0.6, soft: 3 });
      wallPool(Math.floor(rnd() * 4));
    } else {
      r.amb = [0.015, 0.02, 0.02];
      const n = r.type === 'pillars' ? 4 : 1 + Math.floor(rnd() * 2);
      for (let k = 0; k < n; k++) {
        const x = r.type === 'pillars' ? mx + (k % 2 ? 2.4 : -2.4) - 1.2 : r.x0 + W * (0.3 + rnd() * 0.4);
        const z = r.type === 'pillars' ? mz + (k < 2 ? 2.4 : -2.4) - 1.2 : r.z0 + D * (0.3 + rnd() * 0.4);
        r.lights.push(down(x, r.h - 0.02, z, 6 + r.h * 1.4, 13 + r.h));
        r.lamps = r.lamps || [];
        r.lamps.push([x, z]);
      }
      // luz de "céu" em ângulo, entrando por uma fresta alta
      if (r.type === 'pillars') {
        const hole = { x0: r.x1 - 2.2, x1: r.x1 - 0.6, z0: r.z0 + 1, z1: r.z1 - 1, depth: 0.8 };
        r.ceilHoles.push(hole);
        r.amb2 = [0.03, 0.035, 0.035];
        r.sunWindows = [{ axis: 'y', at: r.h + 0.8, a0: hole.x0, a1: hole.x1, b0: hole.z0, b1: hole.z1 }];
        r.lights.push({ x: (hole.x0 + hole.x1) / 2, y: r.h + 0.4, z: mz, I: 40, range: 18, c: [1, 0.98, 0.92], ch: 1, dir: [-0.5, -0.85, 0], pow: 1.2, soft: 3 });
      }
      wallPool(Math.floor(rnd() * 4));
      if (rnd() < 0.5) wallPool(Math.floor(rnd() * 4) + 1);
      if (r.type === 'maint') r.lights.push({ x: r.x1 - 0.6, y: 2.6, z: mz, I: 6, range: 7, c: [1, 0.55, 0.2] });
      if (r.type === 'future') r.lights.push({ x: mx, y: 1.6, z: r.z1 - 0.6, I: 10, range: 8, c: [0.4, 0.8, 1.0] });
    }
  }

  // ------------------------------------------------------------ luz assada
  roomAt(x, z) {
    for (const r of this.rooms) if (x >= r.x0 - 0.2 && x <= r.x1 + 0.2 && z >= r.z0 - 0.2 && z <= r.z1 + 0.2) return r;
    return null;
  }

  bakeAt(room, x, y, z, nx, ny, nz) {
    const r = room || { lights: [], amb: [0.01, 0.01, 0.01] };
    return bakeLight(r, [x, y, z], [nx, ny, nz], this._bk, this.sun);
  }

  ambientAt(x, y, z) {
    const r = this.roomAt(x, z) || this.shopRoom;
    const v = (this._amb = this._amb || new THREE.Vector3());
    const b = bakeLight(r, [x, y, z], [0, 1, 0], this._bk, null);
    return v.set(b[0] + b[3], b[1] + b[4], b[2] + b[5]).multiplyScalar(0.9);
  }

  // ------------------------------------------------------------ construção
  async preload(px, pz, progress) {
    const Q = this.Q;
    const S = Q.tex;
    const U = this.U;
    const tick = async (f) => {
      if (progress) progress(f);
      await new Promise((r) => setTimeout(r, 0));
    };
    const T = (n) => getTex(n, S);
    const env = this.game.makeEnv(this.envTex());
    const tile = T('l37Tile');
    const blue = T('l37Blue');
    const grey = T('l37Grey');
    const mk = (o, uvS) => {
      const m = poolMaterial(Q, { envMap: env, envIntensity: 0.1, ...o }, U);
      m.userData.uvS = uvS;
      return m;
    };
    const M = {
      tile: mk({ map: tile.map, normalMap: tile.normalMap, roughnessMap: tile.roughnessMap, roughness: 1, normalScale: 0.6 }, 1.2),
      tileLoose: mk({ map: tile.map, normalMap: tile.normalMap, roughnessMap: tile.roughnessMap, roughness: 1, color: 0xe2ddd0 }, 1.2),
      blue: mk({ map: blue.map, normalMap: blue.normalMap, roughnessMap: blue.roughnessMap, roughness: 1 }, 1.2),
      grey: mk({ map: grey.map, normalMap: grey.normalMap, roughness: 0.9, envIntensity: 0.1 }, 2),
      metal: mk({ color: 0x6b7178, roughness: 0.45, metalness: 0.7 }, 1),
      hazard: mk({ map: T('zHazard').map, roughness: 0.6 }, 1),
      wood: mk({ map: T('planks').map, roughness: 0.8, color: 0xb89a78 }, 1.5),
      dark: mk({ color: 0x1a1d20, roughness: 0.6, metalness: 0.3 }, 1),
      white: mk({ color: 0xf2f4f6, roughness: 0.25, metalness: 0.1 }, 1),
      black: new THREE.MeshBasicMaterial({ color: 0x000000 }),
      lamp: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      poolLamp: new THREE.MeshBasicMaterial({ color: 0x9fffe0 }),
      sky: new THREE.MeshBasicMaterial({ color: 0xffffff }),
      cyan: new THREE.MeshBasicMaterial({ color: 0x6fe8ff }),
      amber: new THREE.MeshBasicMaterial({ color: 0xffa040 }),
    };
    for (const k of ['black', 'lamp', 'poolLamp', 'sky', 'cyan', 'amber']) M[k].userData.noShadow = true;
    this.M = M;
    const mats = { floor: M.tile, wall: M.tile, ceil: M.tile, trim: M.tile, reveal: M.tile };
    for (const r of this.grid) r.mats = mats;
    this.shopRoom.mats = { floor: M.blue, wall: M.grey, ceil: M.grey, trim: M.grey, reveal: M.grey, base: M.blue };
    const B = new ZBuilder(this);
    this.B = B;
    let n = 0;
    for (const r of this.rooms) {
      buildShell(B, r, this.colliders);
      this.buildRoom(B, r);
      if (++n % 6 === 0) await tick(0.05 + (n / this.rooms.length) * 0.6);
    }
    this.buildExits(B);
    this.shop = new Shop(this, B);
    this.meshes = B.build(this.dynamic);
    await tick(0.75);
    this.makeWater();
    this.makeSecretPanel();
    await tick(0.9);
    this.shop.makeNPC();
    await tick(1);
  }

  envTex() {
    const cv = document.createElement('canvas');
    cv.width = 256;
    cv.height = 128;
    const c = cv.getContext('2d');
    const g = c.createLinearGradient(0, 0, 0, 128);
    g.addColorStop(0, '#6a706c');
    g.addColorStop(0.5, '#3a4441');
    g.addColorStop(1, '#0c1e1a');
    c.fillStyle = g;
    c.fillRect(0, 0, 256, 128);
    c.strokeStyle = 'rgba(0,0,0,0.12)';
    for (let x = 0; x < 256; x += 8) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, 128);
      c.stroke();
    }
    const t = new THREE.CanvasTexture(cv);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  buildRoom(B, r) {
    const M = this.M;
    B.setRoom(r);
    // bordas secas
    for (const L of this.ledges) {
      if (L.cx < r.x0 || L.cx > r.x1 || L.cz < r.z0 || L.cz > r.z1) continue;
      B.box(M.tile, L.cx, LEDGE_Y / 2, L.cz, L.x1 - L.x0, LEDGE_Y, L.z1 - L.z0, { skip: { ny: true }, fine: true });
      // degraus para a água (no meio da borda)
      const along = L.side === 'n' || L.side === 's';
      const dir = L.side === 'n' ? 1 : L.side === 's' ? -1 : L.side === 'w' ? 1 : -1;
      for (let k = 0; k < 2; k++) {
        const y = LEDGE_Y * (0.66 - k * 0.33);
        const off = 0.95 + k * 0.35;
        if (along) B.box(M.tile, L.cx, y / 2, (dir > 0 ? L.z0 : L.z1) + dir * off, 2.2, y, 0.35, { skip: { ny: true } });
        else B.box(M.tile, (dir > 0 ? L.x0 : L.x1) + dir * off, y / 2, L.cz, 0.35, y, 2.2, { skip: { ny: true } });
      }
      // corrimão cromado
      if (rnd2(L.cx, L.cz) < 0.5) {
        const ex = along ? L.cx + 1.8 : L.cx + dir * 0.4;
        const ez = along ? L.cz + dir * 0.4 : L.cz + 1.8;
        B.cyl(M.metal, ex, LEDGE_Y + 0.45, ez, 0.03, 0.9, { sides: 8 });
      }
    }
    // colunas
    if (r.pillars) for (const [x, z] of r.pillars) B.box(M.tile, x, r.h / 2, z, 0.7, r.h, 0.7, { skip: { ny: true, py: true }, fine: true });
    // poço fundo: paredes internas, fundo e escada descendo
    for (const P of this.pits) {
      if (P.room !== r) continue;
      const d = P.depth;
      const w = P.x1 - P.x0;
      const dd = P.z1 - P.z0;
      B.rect(M.tile, [P.x0, -d, P.z0], [w, 0, 0], [0, 0, dd], [0, 1, 0]);
      B.rect(M.tile, [P.x0, -d, P.z0], [w, 0, 0], [0, d, 0], [0, 0, 1]);
      B.rect(M.tile, [P.x0, -d, P.z1], [w, 0, 0], [0, d, 0], [0, 0, -1]);
      B.rect(M.tile, [P.x0, -d, P.z0], [0, 0, dd], [0, d, 0], [1, 0, 0]);
      B.rect(M.tile, [P.x1, -d, P.z0], [0, 0, dd], [0, d, 0], [-1, 0, 0]);
      const steps = Math.ceil(d / 0.3);
      for (let k = 0; k < steps; k++) {
        const y = -(k + 1) * (d / steps);
        B.box(M.tile, P.x0 + 0.6 + k * 0.32, y / 2, (P.z0 + P.z1) / 2, 0.32, -y, 1.6, { skip: { ny: true } });
      }
    }
    // luminárias de teto, luzes subaquáticas e claraboias
    for (const [x, z] of r.lamps || []) {
      B.rect(M.lamp, [x - 0.5, r.h - 0.01, z - 0.5], [1, 0, 0], [0, 0, 1], [0, -1, 0], [0, 0, 1, 1], false);
    }
    for (const [x, z] of r.poolLights || []) {
      const s = 0.18;
      if (Math.abs(x - r.x0) < 0.1) B.rect(M.poolLamp, [r.x0 + 0.01, 0.25 - s, z - s], [0, 0, 2 * s], [0, 2 * s, 0], [1, 0, 0], [0, 0, 1, 1], false);
      else if (Math.abs(x - r.x1) < 0.1) B.rect(M.poolLamp, [r.x1 - 0.01, 0.25 - s, z - s], [0, 0, 2 * s], [0, 2 * s, 0], [-1, 0, 0], [0, 0, 1, 1], false);
      else if (Math.abs(z - r.z0) < 0.1) B.rect(M.poolLamp, [x - s, 0.25 - s, r.z0 + 0.01], [2 * s, 0, 0], [0, 2 * s, 0], [0, 0, 1], [0, 0, 1, 1], false);
      else B.rect(M.poolLamp, [x - s, 0.25 - s, r.z1 - 0.01], [2 * s, 0, 0], [0, 2 * s, 0], [0, 0, -1], [0, 0, 1, 1], false);
    }
    for (const h of r.ceilHoles) {
      const y = r.h + (h.depth || 0.6) - 0.01;
      B.rect(M.sky, [h.x0, y, h.z0], [h.x1 - h.x0, 0, 0], [0, 0, h.z1 - h.z0], [0, -1, 0], [0, 0, 1, 1], false);
    }
  }

  // ------------------------------------------------------------ saídas
  buildExits(B) {
    const M = this.M;
    const at = (i, j) => this.grid[j * N + i];
    this.exits = [];
    // 1) escada para o subterrâneo (Nível 88)
    {
      const r = at(0, 0);
      B.setRoom(r);
      const { x, z, w, L } = this.stairHole;
      const x0 = this.stairHole.x0;
      const z0 = this.stairHole.z0;
      // mureta acima da água
      const cy = 0.4;
      B.box(M.tile, x, cy, z0 - 0.1, w + 0.4, 0.8, 0.2);
      B.box(M.tile, x0 - 0.1, cy, z, 0.2, 0.8, L);
      B.box(M.tile, x0 + w + 0.1, cy, z, 0.2, 0.8, L);
      // degraus descendo para o escuro (entra-se pelo lado +z)
      const depth = 5;
      for (let k = 0; k < 14; k++) {
        const y = 0.6 - (k + 1) * (depth / 14);
        const zz = z0 + L - (k + 0.5) * (L / 14);
        B.box(M.tile, x, y, zz, w, 0.12, L / 14 + 0.02);
      }
      B.rect(M.tile, [x0, -depth, z0], [0, 0, L], [0, depth + 0.8, 0], [1, 0, 0]);
      B.rect(M.tile, [x0 + w, -depth, z0], [0, 0, L], [0, depth + 0.8, 0], [-1, 0, 0]);
      B.rect(M.tile, [x0, -depth, z0], [w, 0, 0], [0, depth + 0.8, 0], [0, 0, 1]);
      B.rect(M.black, [x0, -depth + 0.02, z0], [w, 0, 0], [0, 0, L], [0, 1, 0], [0, 0, 1, 1], false);
      // portinhola de entrada (lado +z) sem mureta
      this.colliders.push([x0 - 0.2, x0 + w + 0.2, z0 - 0.2, z0 + L]);
      this.exits.push({ id: 'stairs', key: '88', x, z: z0 + L + 0.6, label: 'Descer a escada para o subterrâneo', msg: 'Uma escada desce da piscina para o escuro. Lá embaixo, cheiro de terra molhada e água parada.' });
      this.plate('SUBSOLO ↓', '#203040', '#d8f0ff', x, 1.1, z0 + L + 0.02, 0);
    }
    // 2) porta de manutenção (Nível 15)
    {
      const r = at(6, 1);
      B.setRoom(r);
      const z = (r.z0 + r.z1) / 2;
      const x = r.x1;
      B.box(M.metal, x - 0.04, LEDGE_Y + 1.1, z, 0.08, 2.2, 1.1);
      B.box(M.dark, x - 0.06, LEDGE_Y + 1.1, z, 0.06, 2.4, 1.3);
      B.box(M.hazard, x - 0.09, LEDGE_Y + 0.15, z, 0.02, 0.3, 1.1);
      B.box(M.dark, x - 0.12, LEDGE_Y + 1.05, z + 0.38, 0.06, 0.05, 0.18);
      B.rect(M.amber, [x - 0.05, LEDGE_Y + 2.45, z - 0.12], [0, 0, 0.24], [0, 0.14, 0], [-1, 0, 0], [0, 0, 1, 1], false);
      this.exits.push({ id: 'maint', key: '15', x: x - 1.0, z, label: 'Abrir a porta de manutenção', msg: 'Uma porta de metal pesada. A placa diz: MANUTENÇÃO.' });
      this.plate('MANUTENÇÃO', '#3a3a30', '#ffd040', x - 0.1, LEDGE_Y + 2.9, z, -Math.PI / 2);
    }
    // 3) porta futurista (Subnível 0.1)
    {
      const r = at(5, 6);
      B.setRoom(r);
      const x = (r.x0 + r.x1) / 2;
      const z = r.z1;
      B.box(M.white, x, LEDGE_Y + 1.25, z - 0.05, 1.6, 2.5, 0.1);
      B.box(M.dark, x, LEDGE_Y + 1.25, z - 0.03, 1.9, 2.8, 0.06);
      for (const dx of [-0.82, 0.82]) B.rect(M.cyan, [x + dx - 0.02, LEDGE_Y, z - 0.11], [0.04, 0, 0], [0, 2.5, 0], [0, 0, -1], [0, 0, 1, 1], false);
      B.rect(M.cyan, [x - 0.82, LEDGE_Y + 2.5, z - 0.11], [1.64, 0, 0], [0, 0.04, 0], [0, 0, -1], [0, 0, 1, 1], false);
      B.rect(M.cyan, [x - 0.01, LEDGE_Y + 0.1, z - 0.11], [0.02, 0, 0], [0, 2.3, 0], [0, 0, -1], [0, 0, 1, 1], false);
      this.futureDoor = { x, z };
      this.exits.push({ id: 'future', key: '0.1', x, z: z - 1.0, label: 'Abrir a porta futurista', msg: 'Uma porta branca com frestas de luz azul. Do outro lado, um zumbido elétrico limpo.' });
      this.plate('ZÊNITE · 0.1', '#0c1a24', '#7fe8ff', x, LEDGE_Y + 2.95, z - 0.12, Math.PI);
    }
    this.exit = this.exits[0];
  }

  plate(text, bg, fg, x, y, z, yaw) {
    const tex = textCanvasTex(512, 128, (c, w, h) => {
      c.fillStyle = bg;
      c.fillRect(0, 0, w, h);
      c.fillStyle = fg;
      c.font = 'bold 60px Arial, Helvetica, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(text, w / 2, h / 2 + 3);
    });
    const m = new THREE.MeshBasicMaterial({ map: tex });
    m.color.setScalar(0.85);
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.35), m);
    mesh.position.set(x, y, z);
    mesh.rotation.y = yaw;
    this.dynamic.add(mesh);
    this.disposers.push(() => {
      tex.dispose();
      m.dispose();
    });
  }

  // Azulejos soltos que escondem a passagem para a loja.
  makeSecretPanel() {
    const s = this.secret;
    const g = new THREE.Group();
    const geo = new THREE.BoxGeometry(0.1, 2.4, 2.0);
    const uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (2.0 / 1.2), uv.getY(i) * (2.4 / 1.2));
    const m = new THREE.Mesh(geo, this.panelMat());
    m.position.y = 1.2;
    g.add(m);
    // rachaduras
    const crack = new THREE.MeshBasicMaterial({ color: 0x2a2a28 });
    for (let k = 0; k < 6; k++) {
      const c = new THREE.Mesh(new THREE.PlaneGeometry(0.012, 0.3 + Math.random() * 0.5), crack);
      c.position.set(0.052, 0.6 + Math.random() * 1.4, (Math.random() - 0.5) * 1.6);
      c.rotation.set(0, Math.PI / 2, (Math.random() - 0.5) * 1.2);
      g.add(c);
    }
    g.position.set(s.x, 0, s.z);
    this.dynamic.add(g);
    s.mesh = g;
    this.disposers.push(() => crack.dispose());
  }

  panelMat() {
    const m = litMaterial(this.Q, { map: getTex('l37Tile', this.Q.tex).map, color: 0x8a8a80, emissive: 0x050505 });
    this.disposers.push(() => m.dispose());
    return m;
  }

  // ------------------------------------------------------------ água
  makeWater() {
    const Q = this.Q;
    const x0 = OFF;
    const z0 = OFF;
    const L = N * C;
    const seg = Q.id === 'low' ? 70 : 105;
    const g = new THREE.PlaneGeometry(L, L, seg, seg).rotateX(-Math.PI / 2).translate(x0 + L / 2, WATER_Y, z0 + L / 2);
    const p = g.attributes.position;
    const dep = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) dep[i] = this.depthAt(p.getX(i), p.getZ(i));
    g.setAttribute('aDepth', new THREE.BufferAttribute(dep, 1));
    const hole = this.stairHole;
    this.waterMat = new THREE.ShaderMaterial({
      defines: Q.lambert ? {} : { HQ: 1 },
      uniforms: {
        uTime: this.U.uTime,
        uMirror: { value: 0 },
        tMirror: { value: null },
        uTexMat: { value: new THREE.Matrix4() },
        uShallow: { value: new THREE.Color(0.1, 0.36, 0.3) },
        uDeep: { value: new THREE.Color(0.01, 0.07, 0.07) },
        uLamp: this.U.uLamp,
        uSky: this.U.uSky,
        uHole: { value: new THREE.Vector4(hole.x0, hole.z0, hole.x1, hole.z1) },
      },
      vertexShader: /* glsl */ `
        attribute float aDepth;
        varying float vDepth;
        varying vec3 vW;
        varying vec4 vM;
        uniform mat4 uTexMat;
        void main() {
          vDepth = aDepth;
          vec4 w = modelMatrix * vec4( position, 1.0 );
          vW = w.xyz;
          vM = uTexMat * w;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uTime, uMirror;
        uniform sampler2D tMirror;
        uniform vec3 uShallow, uDeep, uLamp, uSky;
        uniform vec4 uHole;
        varying float vDepth;
        varying vec3 vW;
        varying vec4 vM;
        void main() {
          if ( vW.x > uHole.x && vW.x < uHole.z && vW.z > uHole.y && vW.z < uHole.w ) discard;
          vec3 v = cameraPosition - vW;
          float dist = length( v );
          v /= dist;
          // ondulação mínima e constante (tudo ao mesmo tempo, sem vento)
          vec2 p = vW.xz;
          float t = uTime;
          vec2 g = vec2( cos( p.x * 1.7 + t * 0.8 + sin( p.y * 0.9 ) ), cos( p.y * 1.5 - t * 0.7 + sin( p.x * 1.1 ) ) ) * 0.025;
          #ifdef HQ
          g += vec2( cos( p.x * 4.3 - t * 1.3 + p.y * 2.1 ), cos( p.y * 3.9 + t * 1.1 - p.x * 1.7 ) ) * 0.012;
          #endif
          vec3 n = normalize( vec3( -g.x, 1.0, -g.y ) );
          float cosT = max( dot( n, v ), 0.0 );
          float F = 0.02 + 0.98 * pow( 1.0 - cosT, 5.0 );
          vec3 light = ( uLamp + uSky ) * 0.5;
          vec3 refl = mix( vec3( 0.75, 0.82, 0.8 ), vec3( 0.25, 0.32, 0.3 ), clamp( -dot( reflect( -v, n ), vec3( 0.0, 1.0, 0.0 ) ), 0.0, 1.0 ) ) * light;
          if ( uMirror > 0.5 ) refl = texture2D( tMirror, vM.xy / vM.w + n.xz * 0.05 ).rgb;
          vec3 body = mix( uShallow, uDeep, smoothstep( 0.4, 3.5, vDepth ) ) * light;
          vec3 col = mix( body, refl, clamp( F + 0.08, 0.0, 1.0 ) );
          float a = clamp( 0.45 + smoothstep( 0.5, 3.0, vDepth ) * 0.5 + F, 0.0, 1.0 );
          // fundo dos poços: escuridão
          col *= 1.0 - smoothstep( 1.5, 5.0, vDepth ) * 0.6;
          gl_FragColor = vec4( col, a );
        }`,
      transparent: true,
      depthWrite: false,
    });
    this.water = new THREE.Mesh(g, this.waterMat);
    this.water.renderOrder = 2;
    this.scene.add(this.water);
    if (Q.id !== 'low') {
      this.mirrorCam = new THREE.PerspectiveCamera();
      this.mirrorRT = new THREE.WebGLRenderTarget(4, 4, { type: this.game.post.type });
      this.waterMat.uniforms.tMirror.value = this.mirrorRT.texture;
      this.waterMat.uniforms.uMirror.value = 1;
      this.clipPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 1e6);
      this.game.renderer.clippingPlanes = [this.clipPlane];
    }
  }

  depthAt(x, z) {
    for (const P of this.pits) if (x > P.x0 && x < P.x1 && z > P.z0 && z < P.z1) return P.depth + WATER_Y;
    for (const L of this.ledges) if (x > L.x0 && x < L.x1 && z > L.z0 && z < L.z1) return 0;
    return WATER_Y;
  }

  renderMirror() {
    const r = this.game.renderer;
    const cam = this.game.camera;
    const sz = (this._sz = this._sz || new THREE.Vector2());
    r.getDrawingBufferSize(sz);
    const k = this.Q.id === 'medium' ? 0.4 : 0.55;
    const w = Math.max(4, Math.floor(sz.x * k));
    const h = Math.max(4, Math.floor(sz.y * k));
    if (this.mirrorRT.width !== w || this.mirrorRT.height !== h) this.mirrorRT.setSize(w, h);
    const mc = this.mirrorCam;
    const f = (this._f = this._f || new THREE.Vector3());
    const u = (this._u = this._u || new THREE.Vector3());
    mc.position.set(cam.position.x, 2 * WATER_Y - cam.position.y, cam.position.z);
    f.set(0, 0, -1).applyQuaternion(cam.quaternion);
    f.y = -f.y;
    u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    u.y = -u.y;
    mc.up.copy(u);
    mc.lookAt(mc.position.clone().add(f));
    mc.updateMatrixWorld();
    mc.projectionMatrix.copy(cam.projectionMatrix);
    this.waterMat.uniforms.uTexMat.value
      .set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1)
      .multiply(mc.projectionMatrix)
      .multiply(mc.matrixWorldInverse);
    const old = r.getRenderTarget();
    this.water.visible = false;
    this.clipPlane.constant = -WATER_Y + 0.02;
    r.setRenderTarget(this.mirrorRT);
    r.clear();
    r.render(this.scene, mc);
    r.setRenderTarget(old);
    this.clipPlane.constant = 1e6;
    this.water.visible = true;
  }

  // ------------------------------------------------------------ cena: acordando
  startCine() {
    const g = this.game;
    this.cine = 0;
    g.player.frozen = true;
    g.hud.show(false);
    const bars = document.createElement('div');
    bars.id = 'cine';
    bars.innerHTML = '<div class="cb top"></div><div class="cb bot"><div id="cine-sub"></div><div id="cine-skip">tocar / E para pular</div></div>';
    document.body.appendChild(bars);
    this.bars = bars;
    const skip = (e) => {
      e.preventDefault();
      this.cine = Math.max(this.cine, 10.4);
    };
    bars.addEventListener('touchend', skip, { passive: false });
    bars.addEventListener('click', skip);
    this.subs = [
      [1.2, 'Água morna. O som da água batendo nos azulejos.'],
      [4.2, 'Você não lembra de ter deitado aqui.'],
      [7.2, 'Pela primeira vez em muito tempo, nada dói.'],
      [10.2, ''],
    ];
    this.subI = 0;
    // pálpebras: abertura ao longo do tempo
    this.blinks = [
      [0, 1],
      [0.9, 0.55],
      [1.3, 1],
      [2.1, 0.3],
      [2.5, 0.85],
      [3.3, 0],
    ];
    const s = this.spawn;
    const y0 = LEDGE_Y + 0.2;
    // quadros-chave: [t, altura, pitch, yaw]
    this.keys = [
      [0, y0, 1.35, s.yaw + 0.6],
      [3.5, y0, 1.15, s.yaw + 0.75],
      [5.6, y0 + 0.05, -0.55, s.yaw + 1.3],
      [7.6, LEDGE_Y + 1.0, -0.15, s.yaw + 0.5],
      [10.6, LEDGE_Y + 1.62, 0, s.yaw],
    ];
    g.audio.play('water', { gain: 0.25, rate: 0.8 });
  }

  updateCine(dt) {
    const g = this.game;
    this.cine += dt;
    const t = this.cine;
    if (g.input.pressed('interact')) this.cine = Math.max(this.cine, 10.4);
    while (this.subI < this.subs.length && t >= this.subs[this.subI][0]) {
      const el = document.getElementById('cine-sub');
      if (el) el.textContent = this.subs[this.subI][1];
      this.subI++;
    }
    const interp = (arr, col) => {
      for (let k = 0; k < arr.length - 1; k++) {
        const a = arr[k];
        const b = arr[k + 1];
        if (t <= b[0]) {
          const u = smoothstep(a[0], b[0], t);
          return lerp(a[col], b[col], u);
        }
      }
      return arr[arr.length - 1][col];
    };
    const blink = interp(this.blinks, 1);
    g.fade = blink;
    g.fadeTarget = blink;
    const y = interp(this.keys, 1);
    const pitch = interp(this.keys, 2);
    const yaw = interp(this.keys, 3);
    const cam = g.camera;
    const s = this.spawn;
    cam.position.set(s.x, y, s.z);
    cam.rotation.set(pitch, yaw, Math.sin(t * 0.7) * 0.05 * (1 - smoothstep(6, 10, t)), 'YXZ');
    if (t >= 11) this.endCine();
  }

  endCine() {
    const g = this.game;
    this.cine = null;
    if (this.bars) this.bars.remove();
    this.bars = null;
    g.fade = 0;
    g.fadeTarget = 0;
    g.hud.show(true);
    g.player.frozen = false;
    g.player.pos.set(this.spawn.x, LEDGE_Y, this.spawn.z);
    g.player.yaw = this.spawn.yaw;
    g.player.pitch = 0;
    g.hud.objective('Nível 37: Sublimidade. Aqui é seguro. Descanse, explore as piscinas.', 7);
  }

  // ------------------------------------------------------------ eventos
  updateEvents(dt) {
    const g = this.game;
    const t = this.time;
    const ph = t % PERIOD;
    const summer = ph >= PERIOD - SUMMER;
    this.summerK = damp(this.summerK || 0, summer ? 1 : 0, 0.35, dt);
    if (summer !== this.wasSummer) {
      if (summer) {
        g.hud.message('O Evento do Verão: a luz fica dourada, como um pôr do sol que não termina.', 6);
        g.audio.play('ding', { gain: 0.15, rate: 0.6, wet: 2 });
      } else if (this.wasSummer !== undefined) g.hud.message('O pôr do sol se apaga devagar. A luz volta a ser branca.', 4);
      this.wasSummer = summer;
    }
    // Roxo Iminente: raro, a qualquer momento
    if (!this.purple && this.cine === null && Math.random() < dt / 260) {
      this.purple = { t: 0, len: 20 + Math.random() * 15 };
      g.hud.message('O Roxo Iminente. Um brilho roxo pulsa na água e nos azulejos. É difícil desviar o olhar.', 6);
      g.audio.play('rift', { gain: 0.2, rate: 0.5, wet: 2 });
    }
    let pk = 0;
    if (this.purple) {
      this.purple.t += dt;
      const p = this.purple;
      pk = smoothstep(0, 3, p.t) * (1 - smoothstep(p.len - 4, p.len, p.t));
      if (p.t > p.len) this.purple = null;
      this.purpleHum = (this.purpleHum || 0) - dt;
      if (this.purpleHum <= 0) {
        this.purpleHum = 2.5;
        g.audio.play('whisper', { gain: 0.06 * pk, rate: 0.5, wet: 2 });
      }
    }
    this.purpleK = pk;
    const sk = this.summerK;
    const pulse = 0.75 + 0.25 * Math.sin(t * 2.4);
    const lamp = this.U.uLamp.value;
    const sky = this.U.uSky.value;
    lamp.set(lerp(1, 1.0, sk), lerp(1, 0.62, sk), lerp(1, 0.36, sk));
    sky.set(lerp(1, 1.7, sk), lerp(1, 0.85, sk), lerp(1, 0.32, sk));
    if (pk > 0) {
      lamp.lerp(new THREE.Vector3(0.55 * pulse, 0.2 * pulse, 0.95 * pulse), pk);
      sky.lerp(new THREE.Vector3(0.75 * pulse, 0.22 * pulse, 1.2 * pulse), pk);
    }
    const M = this.M;
    M.lamp.color.setRGB(lamp.x * 2.2, lamp.y * 2.2, lamp.z * 2.2);
    M.sky.color.setRGB(sky.x * 2.6, sky.y * 2.6, sky.z * 2.6);
    M.poolLamp.color.setRGB(0.6 * lamp.x * 2, 1.0 * lamp.y * 2, 0.88 * lamp.z * 2);
    // gradação de cor da tela
    const u = g.post.u;
    const T = this.look.tint;
    u.uTint.value.setRGB(lerp(lerp(T[0], 1.3, sk), 1.08, pk), lerp(lerp(T[1], 0.88, sk), 0.82, pk), lerp(lerp(T[2], 0.58, sk), 1.25, pk));
    u.uSat.value = this.look.sat + sk * 0.25 + pk * 0.15;
    u.uBloom.value = this.look.bloom + pk * 0.4 + sk * 0.1;
    // hipnótico: a câmera balança de leve
    if (pk > 0) {
      const cam = g.camera;
      cam.rotation.z += Math.sin(t * 0.9) * 0.04 * pk;
      g.sanity = Math.min(100, g.sanity + dt * 1.5 * pk);
    }
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    const g = this.game;
    this.time += dt;
    this.U.uTime.value = this.time;
    if (this.cine === undefined) this.startCine();
    if (this.cine !== null) {
      this.updateCine(dt);
      this.shop.update(dt, player);
      if (this.mirrorRT) this.renderMirror();
      return;
    }
    const p = player.pos;
    this.updateEvents(dt);
    // passos na água
    const inWater = this.groundY(p.x, p.z) < 0.1 && !this.inShop(p.x, p.z);
    const step = Math.floor(player.stepPhase);
    if (step !== this.lastStep) {
      this.lastStep = step;
      if (inWater) g.audio.play('water', { gain: 0.06, rate: 1.4 + Math.random() * 0.5, wet: 0.6 });
    }
    // descanso
    if (inWater) {
      this.restT = (this.restT || 0) + dt;
      if (this.restT > 12) g.completeObjective('rest', 'A água morna solta os músculos. A cabeça fica leve.');
    }
    this.sanityExtra = inWater ? -1.2 : -0.5;
    // saídas descobertas
    for (const e of this.exits) {
      if (this.found.has(e.id)) continue;
      if (Math.hypot(p.x - e.x, p.z - e.z) < 6) {
        this.found.add(e.id);
        g.hud.message(e.msg, 5);
        g.setObjectiveText('exits', `Encontre as saídas (${this.found.size}/3)`);
        if (this.found.size >= 3) g.completeObjective('exits', 'Três saídas: para baixo, para a manutenção e para as estrelas.');
        else g.audio.play('ding', { gain: 0.2, rate: 1.2 });
      }
    }
    // azulejos soltos
    const s = this.secret;
    s.open = clamp(s.open + (s.target - s.open) * dt * 1.2, 0, 1);
    s.mesh.position.y = -s.open * 2.6;
    if (this.inShop(p.x, p.z) && !g.objectiveDone('secret')) g.completeObjective('secret', 'Uma sala cinza com azulejos azuis. Alguém mora aqui.');
    for (const f of this.animate) f(dt, this.time, player);
    this.shop.update(dt, player);
    if (this.mirrorRT) this.renderMirror();
  }

  inShop(x, z) {
    const r = this.shopRoom;
    return x > r.x0 && x < r.x1 + 0.1 && z > r.z0 && z < r.z1;
  }

  dialogTick(dt, player) {
    this.time += dt;
    this.U.uTime.value = this.time;
    this.shop.update(dt, player);
    if (this.mirrorRT) this.renderMirror();
  }

  collide(p, r) {
    for (let it = 0; it < 2; it++) {
      for (const b of this.colliders) {
        if (p.x < b[0] - 1 || p.x > b[1] + 1 || p.z < b[2] - 1 || p.z > b[3] + 1) continue;
        pushCircle(p, r, b[0], b[1], b[2], b[3]);
      }
      const s = this.secret;
      if (s.open < 0.6) pushCircle(p, r, s.x - 0.1, s.x + 0.06, s.z - 1.0, s.z + 1.0);
      if (this.shop) this.shop.collide(p, r);
    }
    return p;
  }

  groundY(x, z) {
    for (const L of this.ledges) if (x > L.x0 - 0.05 && x < L.x1 + 0.05 && z > L.z0 - 0.05 && z < L.z1 + 0.05) return LEDGE_Y;
    return 0;
  }

  surfaceAt(x, z) {
    if (this.inShop(x, z) || this.groundY(x, z) > 0.1) return 'tile';
    return 'mud';
  }

  los() {
    return true;
  }

  lightLevel() {
    return 1;
  }

  interactable(player) {
    if (this.cine !== null && this.cine !== undefined) return null;
    const p = player.pos;
    const g = this.game;
    for (const e of this.exits) {
      if (Math.hypot(p.x - e.x, p.z - e.z) < 1.8)
        return {
          label: e.label,
          action: () => {
            if (e.id === 'future') g.audio.play('powerUp', { gain: 0.3 });
            g.enterLevel(e.key, e.id === 'stairs' ? 'stairs' : 'door', 0.5);
          },
        };
    }
    const s = this.secret;
    if (s.target < 0.5 && Math.hypot(p.x - (s.x + 0.6), p.z - s.z) < 1.6) {
      return {
        label: 'Empurrar os azulejos soltos',
        action: () => {
          s.target = 1;
          g.audio.play('door', { gain: 0.5, rate: 0.5 });
          g.audio.play('water', { gain: 0.3, rate: 0.6 });
          g.hud.message('Os azulejos rachados cedem e afundam. Atrás deles, luz amarela e cheiro de café.', 5);
        },
      };
    }
    return this.shop ? this.shop.interactable(player) : null;
  }

  navTarget() {
    const p = this.game.player.pos;
    let best = null;
    let bd = 1e9;
    for (const e of this.exits) {
      if (this.found.size < 3 && this.found.has(e.id)) continue;
      const d = Math.hypot(p.x - e.x, p.z - e.z);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return best;
  }

  exitEmitter() {
    return null;
  }

  dispose() {
    const g = this.game;
    g.renderer.clippingPlanes = [];
    if (this.bars) this.bars.remove();
    if (this.mirrorRT) this.mirrorRT.dispose();
    this.shop.dispose();
    this.dynamic.traverse((o) => o.geometry && o.geometry.dispose());
    this.water.geometry.dispose();
    this.waterMat.dispose();
    for (const k in this.M) this.M[k].dispose();
    for (const f of this.disposers) f();
    this.scene.remove(this.dynamic, this.water);
    this.scene.background = null;
  }
}

function rnd2(x, z) {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return s - Math.floor(s);
}

// Nível 57 — "Shopping Abandonado". Um shopping enorme, vazio, mas que continua
// funcionando: luzes acesas, uma música de elevador tocando baixinho, lojas com
// portas de enrolar abaixadas, vitrines vazias, alambrados, tapumes. Corredores
// largos de piso de cerâmica com faixas de carpete, forro de placas e vigas.
// Uma escada leva ao 2º andar; no fim dele há uma porta de madeira e, num
// cômodo vazio, um computador no chão — que liga e conta os segredos do nível
// (inclusive o apagão de 2 minutos). Passos estranhos seguem o andarilho.
// No escuro mora O Gigante: só os olhos vermelhos aparecem; ele não ataca e
// foge de quem chega perto. Saídas: o duto de ventilação (→ Nível 0.1) e o
// corredor de serviço escuro de 150 m até a porta de metal (→ Nível 88).
import * as THREE from 'three';
import { OutdoorLevel } from './outdoor.js';
import { indoorEnvTex, TEX } from '../textures.js';
import { clamp, mulberry32, TAU } from '../util.js';
import { standardWake } from './wake.js';
import * as BLD from './level55_build.js';
import { buildMap, H, UP } from './level57_map.js';
import { Computer } from './level57_pc.js';
import { Giant } from './level57_giant.js';

// luz calculada → indireta (equivale à luz ambiente branca de 1,35 de antes)
const BAKE = 1.35 / Math.PI;

const NAMES = ['FOTO RÁPIDA', 'CALÇADOS LIMA', 'ÓTICA SOL', 'MODA JOVEM', 'DISCOS & FITAS', 'BRINQUEDOS', 'RELÓGIOS', 'PERFUMARIA', 'JOALHERIA', 'ELETRÔNICOS', 'LIVRARIA', 'CAMISARIA', 'SORVETES', 'ALUGA-SE', 'PAPELARIA', 'TECIDOS', 'BOLSAS & CIA', 'LOTERIA', 'CHAVEIRO', 'VIDEOLOCADORA'];

// ------------------------------------------------------------ texturas
function tileTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  const n = 8;
  const t = S / n;
  const r = mulberry32(571);
  x.fillStyle = '#7d7a62';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      const v = (r() - 0.5) * 14;
      x.fillStyle = `rgb(${200 + v},${196 + v},${168 + v})`;
      x.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
      for (let k = 0; k < 20; k++) {
        x.fillStyle = `rgba(90,80,50,${r() * 0.08})`;
        x.fillRect(i * t + r() * t, j * t + r() * t, 2 + r() * 6, 1 + r() * 3);
      }
    }
  return TEX.toTex(c);
}

function carpetTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#5c6052';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(572);
  for (let i = 0; i < (S * S) / 5; i++) {
    x.fillStyle = r() < 0.5 ? `rgba(80,86,70,${r() * 0.35})` : `rgba(10,12,8,${r() * 0.35})`;
    x.fillRect(r() * S, r() * S, 1, 1);
  }
  // manchas de uso
  for (let i = 0; i < 12; i++) {
    x.fillStyle = `rgba(20,20,15,${0.08 + r() * 0.1})`;
    x.beginPath();
    x.ellipse(r() * S, r() * S, 20 + r() * 60, 10 + r() * 30, r() * 3, 0, TAU);
    x.fill();
  }
  return TEX.toTex(c);
}

function ceilTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#d6d2c4';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(573);
  const n = 2;
  const t = S / n;
  for (let i = 0; i < n; i++)
    for (let j = 0; j < n; j++) {
      // placa de forro mineral, furinhos e uma mancha de infiltração de vez em quando
      for (let k = 0; k < 900; k++) {
        x.fillStyle = `rgba(110,105,90,${r() * 0.25})`;
        x.fillRect(i * t + r() * t, j * t + r() * t, 1.5, 1.5);
      }
      if (r() < 0.3) {
        const g = x.createRadialGradient(i * t + t / 2, j * t + t / 2, 2, i * t + t / 2, j * t + t / 2, t * 0.45);
        g.addColorStop(0, 'rgba(140,110,60,0.35)');
        g.addColorStop(1, 'rgba(140,110,60,0)');
        x.fillStyle = g;
        x.fillRect(i * t, j * t, t, t);
      }
    }
  x.strokeStyle = '#8a867a';
  x.lineWidth = Math.max(3, S / 90);
  for (let i = 0; i <= n; i++) {
    x.beginPath();
    x.moveTo(i * t, 0);
    x.lineTo(i * t, S);
    x.stroke();
    x.beginPath();
    x.moveTo(0, i * t);
    x.lineTo(S, i * t);
    x.stroke();
  }
  return TEX.toTex(c);
}

function paintTex(S) {
  const c = TEX.makeCanvas(S, S);
  const x = c.getContext('2d');
  x.fillStyle = '#e6e4dc';
  x.fillRect(0, 0, S, S);
  const r = mulberry32(574);
  for (let i = 0; i < 3000; i++) {
    x.fillStyle = r() < 0.5 ? `rgba(255,255,255,${r() * 0.08})` : `rgba(90,90,80,${r() * 0.05})`;
    x.fillRect(r() * S, r() * S, 2 + r() * 8, 1 + r() * 3);
  }
  for (let i = 0; i < 18; i++) {
    x.fillStyle = `rgba(80,70,50,${0.03 + r() * 0.05})`;
    x.fillRect(r() * S, S * (0.6 + r() * 0.4), 2 + r() * 4, S * 0.4);
  }
  return TEX.toTex(c);
}

// grade de porta de enrolar (fendas), cerca de alambrado e grade de duto: com transparência
function grilleTex() {
  const c = TEX.makeCanvas(256, 256);
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(150,152,150,1)';
  x.fillRect(0, 0, 256, 256);
  x.clearRect(0, 0, 0, 0);
  for (let j = 0; j < 16; j++)
    for (let i = 0; i < 6; i++) {
      x.clearRect(8 + i * 41 + (j % 2) * 20, 5 + j * 16, 26, 6);
    }
  x.fillStyle = 'rgba(90,92,90,1)';
  for (let j = 0; j < 16; j++) x.fillRect(0, j * 16 + 13, 256, 2);
  return TEX.toTex(c, { srgb: true });
}

function fenceTex() {
  const c = TEX.makeCanvas(128, 128);
  const x = c.getContext('2d');
  x.strokeStyle = 'rgba(170,172,168,1)';
  x.lineWidth = 3;
  for (let k = -128; k < 256; k += 18) {
    x.beginPath();
    x.moveTo(k, 0);
    x.lineTo(k + 128, 128);
    x.stroke();
    x.beginPath();
    x.moveTo(k + 128, 0);
    x.lineTo(k, 128);
    x.stroke();
  }
  return TEX.toTex(c);
}

function boardTex() {
  const c = TEX.makeCanvas(256, 256);
  const x = c.getContext('2d');
  const r = mulberry32(575);
  for (let i = 0; i < 4; i++) {
    x.fillStyle = `rgb(${170 + r() * 20},${140 + r() * 20},${95 + r() * 15})`;
    x.fillRect(i * 64, 0, 64, 256);
    for (let k = 0; k < 120; k++) {
      x.fillStyle = `rgba(90,60,30,${r() * 0.15})`;
      x.fillRect(i * 64 + r() * 64, r() * 256, 1 + r() * 2, 4 + r() * 30);
    }
    x.fillStyle = 'rgba(60,40,20,0.6)';
    x.fillRect(i * 64, 0, 2, 256);
  }
  x.fillStyle = 'rgba(30,30,30,0.85)';
  x.font = 'bold 26px Arial';
  x.fillText('EM REFORMA', 40, 140);
  return TEX.toTex(c);
}

function signTex(name, lit) {
  const c = TEX.makeCanvas(512, 96);
  const x = c.getContext('2d');
  x.fillStyle = '#16181e';
  x.fillRect(0, 0, 512, 96);
  x.strokeStyle = '#3a3e48';
  x.lineWidth = 4;
  x.strokeRect(4, 4, 504, 88);
  x.fillStyle = lit ? '#f4f0e4' : '#5a5a58';
  x.font = 'bold 46px Arial, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText(name, 256, 50);
  return TEX.toTex(c, { repeat: false });
}

function textTex(lines, { w = 256, h = 96, bg = '#7a1a14', fg = '#fff', font = 'bold 26px Arial' } = {}) {
  const c = TEX.makeCanvas(w, h);
  const x = c.getContext('2d');
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
  x.fillStyle = fg;
  x.font = font;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  lines.forEach((l, i) => x.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * 30));
  return TEX.toTex(c, { repeat: false });
}

function woodTex() {
  const c = TEX.makeCanvas(128, 256);
  const x = c.getContext('2d');
  x.fillStyle = '#7a4e2c';
  x.fillRect(0, 0, 128, 256);
  const r = mulberry32(576);
  for (let i = 0; i < 70; i++) {
    x.strokeStyle = `rgba(${50 + r() * 30},${28 + r() * 15},10,${0.2 + r() * 0.3})`;
    x.lineWidth = 1 + r() * 2;
    x.beginPath();
    const xx = r() * 128;
    x.moveTo(xx, 0);
    x.bezierCurveTo(xx + (r() - 0.5) * 16, 90, xx + (r() - 0.5) * 16, 170, xx, 256);
    x.stroke();
  }
  x.strokeStyle = 'rgba(30,15,5,0.6)';
  x.lineWidth = 4;
  x.strokeRect(16, 20, 96, 96);
  x.strokeRect(16, 140, 96, 96);
  return TEX.toTex(c, { repeat: false });
}

// "música de elevador": acordes suaves de piano elétrico, em laço de 16 s
function muzak(sr) {
  const n = Math.floor(sr * 16);
  const o = new Float32Array(n);
  const prog = [
    [261.6, 329.6, 392.0, 493.9],
    [220.0, 261.6, 329.6, 392.0],
    [174.6, 220.0, 261.6, 329.6],
    [196.0, 246.9, 293.7, 329.6],
  ];
  const beat = sr * 1;
  for (let b = 0; b < 16; b++) {
    const ch = prog[Math.floor(b / 4) % 4];
    const at = b * beat;
    const notes = b % 2 === 0 ? ch : [ch[1], ch[3]];
    for (const f of notes) {
      const len = Math.floor(beat * 1.9);
      for (let i = 0; i < len && at + i < n; i++) {
        const t = i / sr;
        const e = Math.exp(-t * 2.2) * Math.min(1, t * 60);
        o[at + i] += (Math.sin(TAU * f * t) + 0.3 * Math.sin(TAU * f * 2 * t) * Math.exp(-t * 6)) * e * 0.12;
      }
    }
    // baixo
    const bf = ch[0] / 2;
    for (let i = 0; i < beat && at + i < n; i++) {
      const t = i / sr;
      o[at + i] += Math.sin(TAU * bf * t) * Math.exp(-t * 1.6) * 0.16;
    }
  }
  return o;
}

// A luz calculada nos vértices entra como luz indireta (em vez de multiplicar a
// cor): assim a lanterna ilumina de verdade nos cantos escuros e no apagão.
function bakedMaterial(o, U) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBake = U;
    sh.fragmentShader = 'uniform float uBake;\n' + sh.fragmentShader;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <color_fragment>', '')
      // os trechos ainda são #include aqui: a luz ambiente é trocada dentro do trecho
      .replace('#include <lights_fragment_begin>', THREE.ShaderChunk.lights_fragment_begin.replace('getAmbientLightIrradiance( ambientLightColor )', 'vec3( 0.0 )'))
      .replace('#include <lights_fragment_end>', '#include <lights_fragment_end>\n\treflectedLight.indirectDiffuse += diffuseColor.rgb * vColor * uBake * ( 1.0 - metalnessFactor );');
  };
  m.customProgramCacheKey = () => 'baked57';
  return m;
}

// ------------------------------------------------------------ o nível
export class Level57 extends OutdoorLevel {
  constructor(game) {
    super(game, { walkSpeed: 2.3, camFar: 200 });
    this.num = 57;
    this.indoor = true;
    this.time = 0;
    this.mats = [];
    this.geos = [];
    this.texs = [];
    this.meshes = [];
    this.colliders = [];
    const W = buildMap();
    this.W = W;
    this.M = W.M;
    this.look = {
      exposure: 0.95,
      tint: [1.0, 1.02, 0.96],
      sat: 0.85,
      contrast: 1.1,
      lift: [0.008, 0.012, 0.01],
      bloom: 0.38,
      bloomThreshold: 0.85,
      fog: [0.04, 0.045, 0.04],
      fogNear: 0.2,
      lightColor: [1, 1, 0.94],
      flashlight: true,
      ambience: 'level57',
      reverb: 2.6,
      sanityDrain: 0.05,
    };
    this.objectives = [
      { id: 'andar', text: 'Suba ao 2º andar e encontre a porta de madeira' },
      { id: 'pc', text: 'Ligue o computador e descubra os segredos do shopping' },
      { id: 'saida', text: 'Saia: pelo duto de ventilação ou pelo corredor de serviço' },
    ];
    this.scene.fog = new THREE.FogExp2(new THREE.Color(...this.look.fog), 0.014);
    this.scene.background = new THREE.Color(0, 0, 0);
    this.amb = new THREE.AmbientLight(0xffffff, 1.35);
    this.scene.add(this.amb);
    this.spawn = { x: 0, z: 6, yaw: 0 };
    this.exit = W.metal;
    this.blackout = 0;
    this.stepsT = 50 + Math.random() * 40;
  }

  mat(m) {
    this.mats.push(m);
    return m;
  }

  addMesh(geo, mat, parent = this.scene) {
    const m = new THREE.Mesh(geo, mat);
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    this.geos.push(geo);
    parent.add(m);
    this.meshes.push(m);
    return m;
  }

  box(x0, x1, z0, z1) {
    this.colliders.push([Math.min(x0, x1), Math.max(x0, x1), Math.min(z0, z1), Math.max(z0, z1)]);
    return this.colliders[this.colliders.length - 1];
  }

  // ------------------------------------------------------------ construção
  async preload(px, pz, progress) {
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const M = this.M;
    this.lamps = this.lampList();
    const bake = BLD.bakeFn(M, this.lamps, { amb: 0.05, fall: 0.13, gain: 0.5, reach: 14, max: 1.2 });
    this.bake = bake;
    const memo = new Map();
    const light = (x, y, z, nx, ny, nz) => {
      const k = `${Math.round(x * 40)},${Math.round(y * 20)},${Math.round(z * 40)},${Math.round(nx * 4)},${Math.round(ny * 4)},${Math.round(nz * 4)}`;
      let v = memo.get(k);
      if (v === undefined) {
        v = bake(x, y, z, nx, ny, nz);
        memo.set(k, v);
      }
      return v;
    };
    this.light = light;
    this.makeMaterials();
    progress(0.1);
    await tick();
    const Wl = BLD.buildWalls(M, light, [
      { y0: 0, y1: 'H', off: 0, mat: 'wall', col: [1, 1, 1], uv: 2.5 },
      { y0: 0, y1: 0.12, off: 0.015, mat: 'trim', col: [0.3, 0.3, 0.3], uv: 1, top: true },
    ]);
    for (const k in Wl) this.addMesh(Wl[k].build(), this.MT[k]);
    progress(0.4);
    await tick();
    const F = BLD.buildFloorCeil(M, light, { floorUV: 2.4, ceilUV: 1.2, floorCol: [1, 1, 1], ceilCol: [1, 1, 1] });
    this.addMesh(F.floor, this.MT.floor);
    this.addMesh(F.ceil, this.MT.ceil);
    const S = BLD.buildStairs(M, light, [0.7, 0.72, 0.74]);
    this.addMesh(S.step.build(), this.MT.floor);
    this.addMesh(S.strip.build(), this.MT.trim);
    this.addMesh(S.rail.build(), this.MT.steel);
    progress(0.6);
    await tick();
    this.makeCarpet(light);
    this.makeCeilingDetail(light);
    this.makeShops(light);
    progress(0.75);
    await tick();
    this.makeProps(light);
    this.makeDoors(light);
    this.makeComputer(light);
    this.makeExits(light);
    this.giant = new Giant(this, this.giantSpots());
    this.spawnItems();
    this.startMusic();
    progress(1);
  }

  lampList() {
    const r = mulberry32(5701);
    const out = [];
    const add = (x, z, y, k, kind = 'panel') => {
      if (this.M.sdf(x, z) > -0.4) return;
      out.push({ x, z, y: y + H - 0.05, k, kind });
    };
    const off = () => (r() < 0.16 ? 0 : r() < 0.15 ? 0.55 : 1);
    for (let x = -6; x <= 6; x += 6) for (let z = 7; z >= 1; z -= 5) add(x, z, 0, 1);
    for (let z = -3; z >= -131; z -= 6) {
      const k = off();
      add(-3.4, z, 0, k, k === 0.55 ? 'round' : 'panel');
      add(3.4, z, 0, off());
    }
    for (let x = -58; x <= 58; x += 6) if (Math.abs(x) > 8) add(x, -60, 0, off());
    for (let x = -20; x <= 20; x += 6) for (let z = -134; z >= -160; z -= 6) add(x, z, 0, off());
    for (const [x, z] of [
      [64, -56],
      [64, -64],
      [70, -56],
      [70, -64],
    ])
      add(x, z, 0, 1);
    for (let x = 75; x <= 84; x += 3) add(x, -60, this.M.floorY(x, -60), 0.8);
    const ux = (this.W.up.x0 + this.W.up.x1) / 2;
    for (let z = -55; z >= -118; z -= 6) add(ux, z, UP, r() < 0.25 ? 0 : 1);
    add(this.W.stair.s1 + 6, -59, UP, 1);
    // lojas: só algumas têm uma luz fraca lá dentro
    for (const s of this.W.shops) if ((s.kind === 'open' || s.kind === 'glass') && r() < 0.35) add(s.ix, s.iz, s.y || 0, 0.35, 'round');
    add(18.5, -165, 0, 0.3, 'round');
    return out;
  }

  makeMaterials() {
    const S = Math.min(1024, this.Q.tex);
    const env = this.game.makeEnv(indoorEnvTex(['#d8d8cc', '#5a5a50', '#1a1a16'], '#ffffff', 6));
    const tl = tileTex(Math.min(512, S));
    const ct = carpetTex(Math.min(512, S));
    const ce = ceilTex(Math.min(512, S));
    const pt = paintTex(Math.min(512, S));
    this.texs.push(tl, ct, ce, pt);
    this.uBake = { value: BAKE };
    const vc = (o) => this.mat(bakedMaterial(o, this.uBake));
    this.MT = {
      wall: vc({ map: pt, roughness: 0.75 }),
      trim: vc({ roughness: 0.5 }),
      floor: vc({ map: tl, roughness: 0.25, envMap: env, envMapIntensity: 0.55 }),
      carpet: vc({ map: ct, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }),
      ceil: vc({ map: ce, roughness: 0.9 }),
      beam: vc({ roughness: 0.7 }),
      steel: vc({ roughness: 0.3, metalness: 0.85, envMap: env, envMapIntensity: 0.9 }),
      glow: this.mat(new THREE.MeshBasicMaterial({ vertexColors: true })),
      dark: vc({ roughness: 0.8 }),
      wood: vc({ map: woodTex(), roughness: 0.6 }),
    };
    this.texs.push(this.MT.wood.map);
    // o que o apagão escurece além da luz calculada e da ambiente (placas e luminárias)
    this.dimmable = [this.MT.glow];
    this.baseCol = [this.MT.glow.color.clone()];
  }

  // faixas de carpete escuro nas laterais dos corredores (o meio é de cerâmica)
  makeCarpet(light) {
    const m = new BLD.Mesher();
    const C = [1, 1, 1];
    const strip = (x0, x1, z0, z1) => m.box(x0, x1, 0, 0.004, z0, z1, C, light, 2.5, 'nxpxnzpz');
    strip(-7, -3, -130, 0);
    strip(3, 7, -130, 0);
    strip(-62, 62, -67, -64);
    strip(-62, 62, -56, -53);
    this.addMesh(m.build(), this.MT.carpet);
  }

  // vigas do forro e as luminárias
  makeCeilingDetail(light) {
    const beam = new BLD.Mesher();
    const glow = new BLD.Mesher();
    const fix = new BLD.Mesher();
    const B = [0.88, 0.87, 0.84];
    for (let z = -4; z >= -130; z -= 8) beam.box(-7, 7, H - 0.45, H, z - 0.3, z + 0.3, B, light, 1);
    beam.box(-7.0, -6.4, H - 0.45, H, -130, 0, B, light, 1);
    beam.box(6.4, 7.0, H - 0.45, H, -130, 0, B, light, 1);
    for (let x = -58; x <= 58; x += 8) if (Math.abs(x) > 8) beam.box(x - 0.3, x + 0.3, H - 0.45, H, -67, -53, B, light, 1);
    for (const l of this.lamps) {
      const y = l.y + 0.04;
      if (l.kind === 'round') {
        const c = l.k > 0 ? [2.2, 1.5, 0.7] : [0.2, 0.2, 0.2];
        glow.box(l.x - 0.16, l.x + 0.16, y - 0.06, y, l.z - 0.16, l.z + 0.16, c, null, 1, 'py');
      } else {
        const c = l.k >= 1 ? [2.3, 2.3, 2.2] : l.k > 0 ? [1.3, 1.2, 1.0] : [0.18, 0.18, 0.18];
        glow.box(l.x - 0.6, l.x + 0.6, y - 0.05, y, l.z - 0.15, l.z + 0.15, c, null, 1, 'py');
        fix.box(l.x - 0.66, l.x + 0.66, y - 0.04, y - 0.005, l.z - 0.2, l.z + 0.2, [0.7, 0.7, 0.68], null, 1, 'py');
      }
    }
    this.addMesh(beam.build(), this.MT.beam);
    this.addMesh(fix.build(), this.MT.beam);
    this.glowMesh = this.addMesh(glow.build(), this.MT.glow);
  }

  // fachadas: letreiro em cima, e a frente fechada de vários jeitos
  makeShops(light) {
    const r = mulberry32(5702);
    const grille = grilleTex();
    const fence = fenceTex();
    const board = boardTex();
    this.texs.push(grille, fence, board);
    const gm = this.mat(new THREE.MeshStandardMaterial({ map: grille, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 }));
    const fm = this.mat(new THREE.MeshStandardMaterial({ map: fence, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 }));
    const bm = this.mat(new THREE.MeshStandardMaterial({ map: board, roughness: 0.85 }));
    const glass = this.mat(new THREE.MeshStandardMaterial({ color: 0x9ab0b0, transparent: true, opacity: 0.18, roughness: 0.05, metalness: 0.5, envMap: this.MT.floor.envMap, envMapIntensity: 1.2, depthWrite: false }));
    const fascia = new BLD.Mesher();
    const frame = new BLD.Mesher();
    const plane = (w, h, mat, x, y, z, rot, Lk) => {
      const g = new THREE.PlaneGeometry(w, h);
      const m = new THREE.Mesh(g, Lk === undefined ? mat : mat.clone());
      if (Lk !== undefined) {
        this.mats.push(m.material);
        m.material.color.multiplyScalar(Lk);
      }
      m.position.set(x, y, z);
      m.rotation.y = rot;
      this.geos.push(g);
      this.dynamic.add(m);
      return m;
    };
    this.signMats = [];
    let ni = 0;
    for (const s of this.W.shops) {
      const y0 = s.y || 0;
      const rot = Math.atan2(s.nx, s.nz);
      const ax = Math.abs(s.nz);
      const az = Math.abs(s.nx);
      const hw = s.w / 2;
      const top = 3.3;
      const L = light(s.x + s.nx * 0.5, y0 + 2, s.z + s.nz * 0.5, s.nx, 0, s.nz);
      // fascia (faixa de parede acima da vitrine)
      const fx0 = s.x - ax * hw - az * 0.15;
      const fx1 = s.x + ax * hw + az * 0.15;
      const fz0 = s.z - az * hw - ax * 0.15;
      const fz1 = s.z + az * hw + ax * 0.15;
      fascia.box(Math.min(fx0, fx1), Math.max(fx0, fx1), y0 + top, y0 + H, Math.min(fz0, fz1), Math.max(fz0, fz1), [1, 1, 1], light, 2.5);
      // letreiro
      const name = s.kind === 'board' ? 'ALUGA-SE' : NAMES[ni++ % NAMES.length];
      const lit = s.kind !== 'board' && r() < 0.55;
      const t = signTex(name, lit);
      this.texs.push(t);
      const sm = this.mat(new THREE.MeshBasicMaterial({ map: t, color: new THREE.Color(lit ? 1.25 : 0.6 * L, lit ? 1.25 : 0.6 * L, lit ? 1.2 : 0.6 * L) }));
      this.signMats.push({ m: sm, base: sm.color.clone() });
      const sg = new THREE.PlaneGeometry(Math.min(4.6, s.w * 0.6), 0.86);
      this.geos.push(sg);
      const sign = new THREE.Mesh(sg, sm);
      sign.position.set(s.x + s.nx * 0.17, y0 + top + 0.62, s.z + s.nz * 0.17);
      sign.rotation.y = rot;
      this.dynamic.add(sign);
      // a frente
      const cx = s.x + s.nx * 0.02;
      const cz = s.z + s.nz * 0.02;
      const blocks = () => this.box(s.x - ax * hw - az * 0.15, s.x + ax * hw + az * 0.15, s.z - az * hw - ax * 0.15, s.z + az * hw + ax * 0.15);
      if (s.kind === 'shutter') {
        plane(s.w, top, gm, cx, y0 + top / 2, cz, rot, L);
        // caixa da porta de enrolar
        frame.box(Math.min(fx0, fx1), Math.max(fx0, fx1), y0 + top - 0.25, y0 + top, Math.min(fz0, fz1) - ax * 0.0, Math.max(fz0, fz1), [0.55, 0.56, 0.56], light, 1);
        blocks();
      } else if (s.kind === 'fence') {
        plane(s.w, top - 0.2, fm, cx + s.nx * 0.1, y0 + (top - 0.2) / 2, cz + s.nz * 0.1, rot, L);
        for (let k = -1; k <= 1; k += 0.5) frame.box(cx + ax * k * hw - 0.04 + s.nx * 0.1, cx + ax * k * hw + 0.04 + s.nx * 0.1, y0, y0 + top - 0.2, cz + az * k * hw - 0.04 + s.nz * 0.1, cz + az * k * hw + 0.04 + s.nz * 0.1, [0.6, 0.6, 0.6], light, 1);
        blocks();
      } else if (s.kind === 'board') {
        plane(s.w, top, bm, cx, y0 + top / 2, cz, rot, L);
        blocks();
      } else if (s.kind === 'glass') {
        plane(s.w, top, glass, cx, y0 + top / 2, cz, rot);
        for (let k = -1; k <= 1; k += 0.5) frame.box(cx + ax * k * hw - 0.04, cx + ax * k * hw + 0.04, y0, y0 + top, cz + az * k * hw - 0.04, cz + az * k * hw + 0.04, [0.15, 0.15, 0.16], light, 1);
        blocks();
      } else {
        // aberta: só um balcão empoeirado lá dentro
        const bx = s.ix + s.nx * 2.5;
        const bz = s.iz + s.nz * 2.5;
        const [w2, d2] = ax ? [2.6, 0.6] : [0.6, 2.6];
        frame.box(bx - w2, bx + w2, y0, y0 + 1.05, bz - d2, bz + d2, [0.42, 0.36, 0.3], light, 1);
        this.box(bx - w2, bx + w2, bz - d2, bz + d2);
      }
    }
    this.addMesh(fascia.build(), this.MT.wall);
    this.addMesh(frame.build(), this.MT.dark);
  }

  // lixeiras de madeira, balizadores de metal, bancos, floreiras e a praça de alimentação
  makeProps(light) {
    const r = mulberry32(5703);
    const p = new BLD.Mesher();
    const st = new BLD.Mesher();
    const WOOD = [0.72, 0.56, 0.38];
    const solid = (x0, x1, z0, z1) => this.box(x0, x1, z0, z1);
    for (let z = -12; z >= -124; z -= 18) {
      if (z < -50 && z > -70) continue;
      // lixeira de madeira no meio do corredor
      const x = (r() - 0.5) * 3;
      p.box(x - 0.4, x + 0.4, 0, 0.9, z - 0.4, z + 0.4, WOOD, light, 1);
      solid(x - 0.4, x + 0.4, z - 0.4, z + 0.4);
      // balizadores do lado
      for (const k of [0, 1, 2]) {
        const bx = 4.5 + k * 0.9;
        const bz = z - 6;
        st.box(bx - 0.07, bx + 0.07, 0, 1.0, bz - 0.07, bz + 0.07, [0.7, 0.72, 0.74], light, 1);
        solid(bx - 0.12, bx + 0.12, bz - 0.12, bz + 0.12);
      }
      // banco
      const bz = z - 9;
      p.box(-5.5, -3.7, 0.42, 0.5, bz - 0.25, bz + 0.25, [0.5, 0.36, 0.24], light, 1);
      p.box(-5.4, -5.2, 0, 0.42, bz - 0.2, bz + 0.2, [0.3, 0.3, 0.3], light, 1);
      p.box(-4.0, -3.8, 0, 0.42, bz - 0.2, bz + 0.2, [0.3, 0.3, 0.3], light, 1);
      solid(-5.5, -3.7, bz - 0.25, bz + 0.25);
    }
    // floreiras no cruzamento, com plantas secas
    for (const [x, z] of [
      [-12, -60],
      [12, -60],
      [-30, -60],
      [30, -60],
    ]) {
      p.box(x - 1.2, x + 1.2, 0, 0.6, z - 1.2, z + 1.2, [0.55, 0.52, 0.48], light, 1);
      p.box(x - 1.05, x + 1.05, 0.6, 0.62, z - 1.05, z + 1.05, [0.22, 0.16, 0.1], light, 1);
      for (let k = 0; k < 5; k++) {
        const a = r() * TAU;
        const sx = x + Math.cos(a) * 0.5;
        const sz = z + Math.sin(a) * 0.5;
        p.box(sx - 0.03, sx + 0.03, 0.6, 1.3 + r() * 0.6, sz - 0.03, sz + 0.03, [0.4, 0.34, 0.2], light, 1);
      }
      solid(x - 1.2, x + 1.2, z - 1.2, z + 1.2);
    }
    // praça de alimentação: mesas e cadeiras, e o balcão das lanchonetes
    for (let x = -16; x <= 16; x += 6)
      for (let z = -138; z >= -156; z -= 6) {
        if (r() < 0.15) continue;
        p.box(x - 0.6, x + 0.6, 0.72, 0.76, z - 0.6, z + 0.6, [0.85, 0.82, 0.76], light, 1);
        st.box(x - 0.05, x + 0.05, 0, 0.72, z - 0.05, z + 0.05, [0.5, 0.5, 0.5], light, 1);
        solid(x - 0.65, x + 0.65, z - 0.65, z + 0.65);
        for (const [cx, cz] of [
          [x - 1.0, z],
          [x + 1.0, z],
        ]) {
          if (r() < 0.25) continue;
          p.box(cx - 0.22, cx + 0.22, 0.44, 0.48, cz - 0.22, cz + 0.22, [0.62, 0.2, 0.16], light, 1);
          p.box(cx - 0.2, cx + 0.2, 0, 0.44, cz - 0.2, cz + 0.2, [0.35, 0.35, 0.35], light, 1);
        }
      }
    p.box(-22, 14, 0, 1.1, -163.6, -162.2, [0.6, 0.58, 0.52], light, 1);
    solid(-22, 14, -163.8, -162.0);
    this.addMesh(p.build(), this.MT.dark);
    this.addMesh(st.build(), this.MT.steel);
  }

  // as portas: madeira (2º andar), "SOMENTE FUNCIONÁRIOS" e a de metal
  makeDoors(light) {
    this.doors = [];
    const mk = (x, z, y, rot, w, tex, color, label, opts = {}) => {
      const piv = new THREE.Group();
      piv.position.set(x, y, z);
      piv.rotation.y = rot;
      const hinge = new THREE.Group();
      hinge.position.x = -w / 2;
      piv.add(hinge);
      const mat = this.mat(new THREE.MeshStandardMaterial({ map: tex, color, roughness: opts.metal ? 0.35 : 0.6, metalness: opts.metal ? 0.7 : 0 }));
      const g = new THREE.BoxGeometry(w, 2.15, 0.06);
      this.geos.push(g);
      const slab = new THREE.Mesh(g, mat);
      slab.position.set(w / 2, 1.075, 0);
      hinge.add(slab);
      const kg = new THREE.SphereGeometry(0.04, 10, 8);
      this.geos.push(kg);
      const knob = new THREE.Mesh(kg, this.MT.steel);
      knob.position.set(w - 0.12, 1.02, 0.06);
      hinge.add(knob);
      if (opts.sign) {
        const st = opts.sign;
        this.texs.push(st);
        const sm = this.mat(new THREE.MeshBasicMaterial({ map: st, color: new THREE.Color(0.8, 0.8, 0.8) }));
        const sgeo = new THREE.PlaneGeometry(0.62, 0.24);
        this.geos.push(sgeo);
        const s = new THREE.Mesh(sgeo, sm);
        s.position.set(w / 2, 1.6, 0.035);
        hinge.add(s);
      }
      this.dynamic.add(piv);
      // colisor enquanto fechada
      const cs = Math.abs(Math.cos(rot));
      const hx = cs > 0.5 ? w / 2 : 0.1;
      const hz = cs > 0.5 ? 0.1 : w / 2;
      const col = this.box(x - hx, x + hx, z - hz, z + hz);
      const d = { x, z, y, rot, hinge, col, open: 0, opening: false, label, ...opts };
      this.doors.push(d);
      return d;
    };
    const W = this.W;
    // porta de madeira do cômodo do computador (no fim do corredor do 2º andar)
    this.pcDoor = mk(W.pcDoor.x, W.pcDoor.z - 0.9, UP, 0, 1.05, this.MT.wood.map, 0xffffff, 'Abrir a porta de madeira', { kind: 'pc' });
    // SOMENTE FUNCIONÁRIOS
    this.staffDoor = mk(W.staff.x, W.staff.z, 0, Math.PI / 2, 1.22, null, 0x5a6068, 'Abrir a porta "SOMENTE FUNCIONÁRIOS"', {
      kind: 'staff',
      sign: textTex(['SOMENTE', 'FUNCIONÁRIOS'], { w: 256, h: 96, bg: '#8a1a14', font: 'bold 24px Arial' }),
    });
    // a de metal, no fim do corredor escuro
    this.metalDoor = mk(W.metal.x + 0.08, W.metal.z, 0, Math.PI / 2, 1.1, null, 0x8a8e92, 'Abrir a porta de metal', { kind: 'metal', metal: true });
  }

  // o computador no chão: monitor de tubo, gabinete e teclado
  makeComputer(light) {
    const R = this.W.room;
    const g = new THREE.Group();
    g.position.set(R.x, R.y, R.z - 1.2);
    const L = light(R.x, R.y + 0.5, R.z, 0, 1, 0);
    const beige = this.mat(new THREE.MeshStandardMaterial({ color: new THREE.Color(0.78 * (0.4 + L), 0.74 * (0.4 + L), 0.64 * (0.4 + L)), roughness: 0.7 }));
    const add = (geo, mat, x, y, z) => {
      this.geos.push(geo);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(x, y, z);
      g.add(m);
      return m;
    };
    add(new THREE.BoxGeometry(0.46, 0.4, 0.44), beige, 0, 0.2, 0);
    add(new THREE.BoxGeometry(0.3, 0.26, 0.2), beige, 0, 0.26, -0.26);
    this.screenMat = this.mat(new THREE.MeshBasicMaterial({ color: 0x0a0c0e }));
    const scr = add(new THREE.PlaneGeometry(0.36, 0.28), this.screenMat, 0, 0.22, 0.222);
    scr.rotation.x = -0.02;
    add(new THREE.BoxGeometry(0.2, 0.42, 0.44), beige, 0.42, 0.21, -0.05);
    add(new THREE.BoxGeometry(0.46, 0.03, 0.16), beige, 0, 0.015, 0.38);
    // cabo pelo chão
    add(new THREE.BoxGeometry(0.02, 0.01, 1.4), this.MT.dark, 0.5, 0.005, -0.8);
    this.dynamic.add(g);
    this.pcPos = { x: R.x, z: R.z - 1.2, y: R.y };
    this.box(R.x - 0.3, R.x + 0.55, R.z - 1.55, R.z - 0.95);
    this.pcLight = new THREE.PointLight(0x7aa0ff, 0, 3, 2);
    this.pcLight.position.set(R.x, R.y + 0.4, R.z - 0.8);
    this.dynamic.add(this.pcLight);
  }

  // a grade do duto (praça de alimentação, no fundo do nicho)
  makeExits() {
    const V = this.W.vent;
    const t = grilleTex();
    this.texs.push(t);
    const m = this.mat(new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.4, color: 0x9a9a94, roughness: 0.5, metalness: 0.6 }));
    const g = new THREE.PlaneGeometry(0.9, 0.65);
    this.geos.push(g);
    const grate = new THREE.Mesh(g, m);
    grate.position.set(V.x, 0.4, V.z + 0.02);
    this.dynamic.add(grate);
    // escuro atrás da grade
    const bg = new THREE.PlaneGeometry(0.9, 0.65);
    this.geos.push(bg);
    const back = new THREE.Mesh(bg, this.mat(new THREE.MeshBasicMaterial({ color: 0x000000 })));
    back.position.set(V.x, 0.4, V.z + 0.005);
    this.dynamic.add(back);
  }

  // onde O Gigante pode aparecer: dentro das lojas, nos cantos, no corredor escuro
  giantSpots() {
    const out = [];
    for (const s of this.W.shops) if (s.kind === 'open' || s.kind === 'glass' || s.kind === 'fence') out.push({ x: s.ix + s.nx * 3, z: s.iz + s.nz * 3, y: s.y || 0 });
    // nos corredores (acesos, só valem no apagão ou perto de lâmpadas queimadas)
    for (let z = -10; z >= -128; z -= 12) out.push({ x: z % 24 ? 5 : -5, z, y: 0 });
    for (let x = -56; x <= 56; x += 14) out.push({ x, z: x % 28 ? -55.5 : -64.5, y: 0 });
    for (let x = -40; x >= -170; x -= 14) out.push({ x, z: -151, y: 0 });
    for (const [x, z] of [
      [-21, -161],
      [21, -133],
      [-21, -133],
      [59, -54],
      [-60, -66],
    ])
      out.push({ x, z, y: 0 });
    for (let z = -70; z >= -118; z -= 8) out.push({ x: this.W.up.x1 + 5, z, y: UP });
    return out.filter((s) => this.M.sdf(s.x, s.z) < -1.2);
  }

  dark(x, z) {
    if (this.blackout > 0) return true;
    const y = this.M.floorY(x, z);
    return this.bake(x, y + 1.6, z, 0, 1, 0) < 0.24;
  }

  lightAt(x, y, z) {
    return this.bake ? this.bake(x, y, z, 0, 1, 0) : 1;
  }

  spawnItems() {
    const g = this.game;
    const list = [
      { type: 'note', key: '57:n1', x: 2, z: -44, rot: 0.3 },
      { type: 'note', key: '57:n2', x: -10, z: -150, rot: 1.4 },
      { type: 'battery', key: '57:b1', x: 14, z: -156, rot: 0 },
      { type: 'battery', key: '57:b2', x: -24.8, z: -151, rot: 0 },
      { type: 'water', key: '57:w1', x: -4, z: -136, rot: 0 },
    ];
    for (const it of list) {
      if (this.taken.has(it.key) || this.M.sdf(it.x, it.z) > -0.3) continue;
      g.items.spawn({ ...it, y: this.M.floorY(it.x, it.z) + 0.01, light: Math.max(0.3, this.lightAt(it.x, 1, it.z)) }, this.dynamic);
    }
  }

  startMusic() {
    const a = this.game.audio;
    if (!a.ready) return;
    if (!a.B.muzak57) a.addBuffer('muzak57', muzak(a.ctx.sampleRate));
    this.music = a.loop('muzak57', 0.045, { lp: 2400, wet: 1.2 });
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    const p = player.pos;
    this.time += dt;
    if (this.wake === undefined) this.startWake();
    if (this.wake.active) {
      this.wake.update(dt);
      return;
    }
    if (this.pc && this.pc.el) return;
    for (const d of this.doors) {
      if (d.opening && d.open < 1) {
        d.open = Math.min(1, d.open + dt * 0.9);
        d.hinge.rotation.y = -d.open * 1.5;
      }
    }
    this.updateBlackout(dt);
    this.giant.update(dt, player, this.blackout > 0);
    this.updateSteps(dt, player);
    // tela do computador ligada (depois da primeira vez) pisca azul
    if (this.pcOn) {
      const k = 0.85 + Math.sin(this.time * 9) * 0.05 + (Math.random() < 0.03 ? -0.3 : 0);
      this.screenMat.color.setRGB(0.1 * k, 0.45 * k, 0.48 * k);
      this.pcLight.intensity = 0.6 * k;
    }
    this.talk(p);
  }

  talk(p) {
    const g = this.game;
    if (g.hud.dlg) return;
    if (p.y > UP - 0.5) {
      if (g.completeObjective('andar', 'O 2º andar. Lojas fechadas, e uma porta de madeira lá no fim.')) this.say('up', ['O segundo andar… tão vazio quanto o primeiro.', 'Lá no fim tem uma porta de madeira. Diferente de todas as outras.']);
    }
    if (Math.abs(p.z + 60) < 6 && Math.abs(p.x) < 6) this.say('cross', ['Um cruzamento. Lojas para todos os lados, todas fechadas.', 'E essa música… quem ainda está tocando música aqui?']);
    if (p.z < -132 && p.x > -22) this.say('food', ['A praça de alimentação. Cadeiras arrumadas, como se esperassem alguém.']);
    if (p.x < -40) this.say('dark', ['Escuro total. Só a minha lanterna.', 'Cento e cinquenta metros, dizia o arquivo. Não para no meio.']);
  }

  say(id, lines, cb) {
    this._said = this._said || new Set();
    if (this._said.has(id) || this.game.hud.dlg) return false;
    this._said.add(id);
    this.game.hud.say(lines, cb);
    return true;
  }

  onGiantWatch(d) {
    if (d < 30) this.say('giant', ['Tem… dois pontos vermelhos ali no escuro.', 'Olhos. São olhos. Altos demais para ser uma pessoa.', 'Ele não se mexe. Só me olha.']);
  }

  onGiantFlee() {
    this.say('flee', ['Ele… está se afastando?', 'Ele tem medo de mim? Ou do que está atrás de mim?']);
  }

  // passos atrás de você, no mesmo ritmo, um pouco atrasados
  updateSteps(dt, player) {
    const g = this.game;
    if (!this.follow) {
      this.stepsT -= dt;
      if (this.stepsT <= 0 && player.speed > 1 && this.blackout <= 0) {
        this.follow = { t: 0, len: 8 + Math.random() * 8, phase: Math.floor(player.stepPhase), yaw: player.yaw };
        if (!this.toldSteps) {
          this.toldSteps = true;
          setTimeout(() => this.game.level === this && this.say('steps', ['…Passos. Atrás de mim.', 'No mesmo ritmo que os meus.']), 2500);
        }
      }
      return;
    }
    const F = this.follow;
    F.t += dt;
    // virou para trás? silêncio na hora
    let dy = player.yaw - F.yaw;
    while (dy > Math.PI) dy -= TAU;
    while (dy < -Math.PI) dy += TAU;
    if (Math.abs(dy) > 2.2 || F.t > F.len) {
      if (Math.abs(dy) > 2.2 && !this.toldTurn) {
        this.toldTurn = true;
        this.game.hud.message('…ninguém.', 2);
      }
      this.follow = null;
      this.stepsT = 45 + Math.random() * 60;
      return;
    }
    F.yaw += dy * Math.min(1, dt * 0.8);
    const ph = Math.floor(player.stepPhase);
    if (ph !== F.phase) {
      F.phase = ph;
      const b = g.audio.B && g.audio.B.step ? g.audio.B.step.tile : null;
      if (b) g.audio.play(b, { gain: 0.22, rate: 0.82 + Math.random() * 0.06, wet: 0.9, when: 0.22 + Math.random() * 0.05 });
    }
  }

  // apagão de 2 minutos
  startBlackout() {
    if (this.blackout > 0) return;
    const g = this.game;
    this.blackout = 120;
    this.flick = 0;
    g.audio.powerDown && g.audio.powerDown();
    if (this.music) this.music.gain.gain.setTargetAtTime(0, g.audio.ctx.currentTime, 0.4);
    g.hud.message('As luzes se apagaram. Todas.', 4);
    setTimeout(() => this.game.level === this && this.say('black', ['O apagão… dois minutos. Só dois minutos.', 'Liga a lanterna. Não olha para os olhos.']), 1500);
    this.setLights(0.02);
  }

  setLights(k) {
    this.dimmable.forEach((m, i) => m.color.copy(this.baseCol[i]).multiplyScalar(k));
    for (const s of this.signMats) s.m.color.copy(s.base).multiplyScalar(k);
    this.uBake.value = BAKE * k;
    // os reflexos do piso e do metal também somem no escuro
    for (const m of Object.values(this.MT)) {
      if (m.envMap) {
        if (m.userData.env === undefined) m.userData.env = m.envMapIntensity;
        m.envMapIntensity = m.userData.env * k;
      }
    }
    this.amb.intensity = 1.35 * Math.max(k, 0.03);
  }

  updateBlackout(dt) {
    const g = this.game;
    if (this.armT !== undefined) {
      this.armT -= dt;
      if (this.armT <= 0) {
        this.armT = undefined;
        this.startBlackout();
      }
    }
    // um apagão "natural" depois de muito tempo, para quem não leu nada
    if (!this.natural && this.time > 420 && this.blackout <= 0 && !this.hadBlackout) {
      this.natural = true;
      this.startBlackout();
    }
    if (this.blackout <= 0) return;
    this.blackout -= dt;
    if (this.blackout < 2.2) {
      // volta piscando
      const on = Math.sin(this.blackout * 40) > 0.2;
      this.setLights(on ? 1 : 0.05);
    }
    if (this.blackout <= 0) {
      this.blackout = 0;
      this.hadBlackout = true;
      this.setLights(1);
      g.audio.powerUp && g.audio.powerUp();
      if (this.music) this.music.gain.gain.setTargetAtTime(this.music.base, g.audio.ctx.currentTime, 1.5);
      g.hud.message('A energia voltou.', 3);
    }
  }

  startWake() {
    const g = this.game;
    const s = this.spawn;
    this.wake = standardWake(
      this,
      s.x,
      s.z,
      s.yaw,
      [
        [1.0, 'Cerâmica fria. Um forro de placas, luzes fluorescentes.'],
        [4.4, 'Uma música de elevador tocando baixinho, em algum lugar.'],
        [7.4, 'Um shopping. Aberto. E completamente vazio.'],
        [10.2, ''],
      ],
      {
        sound: 'breath',
        done: () =>
          g.hud.say(['Um shopping… as luzes acesas, a música tocando.', 'Mas não tem ninguém. Nenhuma loja aberta.', 'Parece que fecharam tudo e esqueceram de desligar.'], () => g.hud.objective('Explore o shopping. Há uma escada para o 2º andar no fim do corredor transversal, à direita.', 7)),
      },
    );
  }

  // ------------------------------------------------------------ interação
  interactable(P) {
    const g = this.game;
    const px = P.pos.x;
    const pz = P.pos.z;
    const near = (x, z, r, y = 0) => Math.hypot(px - x, pz - z) < r && Math.abs(P.pos.y - y) < 1.5;
    for (const d of this.doors) {
      if (d.opening || !near(d.x, d.z, 1.6, d.y)) continue;
      return {
        label: d.label,
        action: () => {
          if (d.kind === 'metal') {
            g.completeObjective('saida', 'A porta de metal abre para o frio, e para o cheiro de água parada.');
            g.enterLevel('88', 'door', 0.4);
            return;
          }
          d.opening = true;
          this.colliders.splice(this.colliders.indexOf(d.col), 1);
          g.audio.door();
          if (d.kind === 'pc') this.say('room', ['Um cômodo vazio. Só um computador velho, no chão.', 'Ainda está ligado na tomada.']);
          if (d.kind === 'staff') this.say('staff', ['Um corredor sem luz nenhuma. Ele vai longe.']);
        },
      };
    }
    const pc = this.pcPos;
    if (pc && near(pc.x, pc.z + 0.4, 1.3, pc.y)) return { label: this.pcOn ? 'Usar o computador' : 'Ligar o computador', action: () => this.useComputer() };
    const V = this.W.vent;
    if (near(V.x, V.z + 0.3, 1.3))
      return {
        label: 'Soltar a grade e entrar no duto de ventilação',
        action: () => {
          g.completeObjective('saida', 'A grade solta. O duto é apertado e desce.');
          g.audio.play(g.audio.B.step ? g.audio.B.step.metal : 'click', { gain: 0.6, rate: 0.8 });
          g.enterLevel('0.1', 'vent', 0.5);
        },
      };
    return null;
  }

  useComputer() {
    const g = this.game;
    this.pcOn = true;
    g.player.frozen = true;
    g.input.enabled = false;
    g.input.unlock();
    g.hud.show(false);
    this.pc =
      this.pc ||
      new Computer({
        onRead: (id, read) => {
          if (read.size >= 4) g.completeObjective('pc', 'Você leu os arquivos. Agora sabe do apagão, do Gigante e das duas saídas.');
        },
        onBat: () => {
          this.batArmed = true;
        },
        onClose: () => {
          g.player.frozen = false;
          g.input.enabled = true;
          g.hud.show(true);
          if (!g.settings.mobile) g.input.lock();
          if (this.batArmed && this.blackout <= 0) {
            this.batArmed = false;
            this.armT = 6;
            g.hud.message('Um estalo distante, vindo do quadro de força…', 3);
          }
        },
      });
    this.pc.open();
  }

  // ------------------------------------------------------------ física
  collide(p, r) {
    for (let it = 0; it < 3; it++) {
      for (const b of this.colliders) {
        if (p.x < b[0] - 1 || p.x > b[1] + 1 || p.z < b[2] - 1 || p.z > b[3] + 1) continue;
        // só no mesmo andar
        if (Math.abs(this.M.floorY((b[0] + b[1]) / 2, (b[2] + b[3]) / 2) - this.M.floorY(p.x, p.z)) > 1.5) continue;
        pushBox(p, r, b);
      }
      const d = this.M.sdf(p.x, p.z);
      if (d > -r) {
        const gr = this.M.grad(p.x, p.z);
        p.x -= gr[0] * (d + r + 0.002);
        p.z -= gr[1] * (d + r + 0.002);
      }
    }
    return p;
  }

  groundY(x, z) {
    return this.M.floorY(x, z);
  }

  surfaceAt(x, z) {
    if (Math.abs(x) > 3 && Math.abs(x) < 7 && z < 0 && z > -130) return 'carpet';
    return 'tile';
  }

  los(ax, az, bx, bz) {
    return this.M.clear(ax, az, bx, bz, 0.05);
  }

  lightLevel(x, z) {
    if (this.blackout > 0) return 0.03;
    return clamp(this.lightAt(x, this.M.floorY(x, z) + 1, z), 0.04, 1);
  }

  navTarget() {
    if (!this.game.objectiveDone('pc')) return { x: (this.W.up.x0 + this.W.up.x1) / 2, z: this.W.pcDoor.z - 2 };
    return this.exit;
  }

  radarEntities() {
    return this.giant ? this.giant.radar() : [];
  }

  dispose() {
    if (this.pc) this.pc.close();
    if (this.wake) this.wake.dispose();
    if (this.giant) this.giant.dispose();
    for (const m of this.meshes) m.removeFromParent();
    super.dispose();
    for (const x of this.geos) x.dispose();
    for (const m of this.mats) m.dispose();
    for (const t of this.texs) t.dispose();
    this.scene.remove(this.amb);
  }
}

function pushBox(p, r, b) {
  const qx = Math.max(b[0], Math.min(p.x, b[1]));
  const qz = Math.max(b[2], Math.min(p.z, b[3]));
  const dx = p.x - qx;
  const dz = p.z - qz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    p.x = qx + (dx / d) * r;
    p.z = qz + (dz / d) * r;
  } else {
    const l = p.x - b[0];
    const rr = b[1] - p.x;
    const t = p.z - b[2];
    const bb = b[3] - p.z;
    const m = Math.min(l, rr, t, bb);
    if (m === l) p.x = b[0] - r;
    else if (m === rr) p.x = b[1] + r;
    else if (m === t) p.z = b[2] - r;
    else p.z = b[3] + r;
  }
}

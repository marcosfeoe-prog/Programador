// Subnível 9.5 — "Rochester Blues": um subúrbio sem fim coberto de neve, numa
// noite que nunca acaba. Casas espaçadas, quintais e ruas brancas, flocos
// caindo, postes amarelos fracos. Lá fora o frio corrói a sanidade (hipotermia);
// as casas iluminadas são quentes por dentro, sem lareira nem aquecedor.
// Você acorda numa delas. Numa casa coberta de neve com a luz da varanda acesa
// há uma carta longa; depois de lê-la inteira, dormir na cama leva ao Nível 10.
// Numa outra casa, três andarilhos sentados em círculo conversam baixinho.
import * as THREE from 'three';
import { OutdoorLevel } from './outdoor.js';
import { pushCircle } from './grid.js';
import { GeoBuilder, litMaterial } from '../materials.js';
import { getTex, registerTexture, TEX, textCanvasTex } from '../textures.js';
import { clamp, hash3, mulberry32 } from '../util.js';
import './level9_mats.js';
import { standardWake } from './wake.js';
import { NPC } from './level0_1_npc.js';

const P = 40; // bloco: rua em z = j·P, duas fileiras de casas, dois lotes por fileira
const HW = 8; // largura da casa (x)
const HD = 9; // profundidade (z)
const WH = 2.9; // pé-direito
const FL = 0.3; // piso
const SNOW = [0.92, 0.94, 0.98];

// ------------------------------------------------------------ texturas
registerTexture('l95Snow', (S) => {
  const low = TEX.noiseField(S, S, 4, 4, 5, 9501);
  const mid = TEX.noiseField(S, S, 16, 16, 3, 9502);
  const fine = TEX.whiteNoise(S * S, 9503);
  const hf = new Float32Array(S * S);
  const cv = TEX.paintRGB(S, S, (x, y, i, o) => {
    const k = 0.86 + low[i] * 0.1 + mid[i] * 0.05 + fine[i] * 0.025;
    const sp = fine[i] > 0.985 ? 0.12 : 0;
    o[0] = k * 0.93 + sp;
    o[1] = k * 0.95 + sp;
    o[2] = k + sp;
    hf[i] = low[i] * 0.6 + mid[i] * 0.4;
  });
  return { map: TEX.toTex(cv), normalMap: TEX.normalMap(hf, S, S, 1.6) };
});

// A carta longa, em páginas.
const LETTER = [
  'Para quem chegar aqui depois de mim,\n\nse você está lendo isto, achou a casa da luz acesa. Que bom. Tire as botas, se ainda tiver botas. Aqui dentro é quente sem lareira, sem aquecedor, sem explicação. Eu parei de procurar explicações na terceira noite — e todas as noites aqui são a mesma noite.',
  'Cheguei pelo Nível 9, fugindo dos cães. Vi uma casa coberta de neve no meio do bairro escuro, com todas as janelas acesas, e só nela nevava. Entrei sem pensar. Acordei no chão de uma sala que não era aquela, e lá fora havia neve até onde a vista alcançava. Não sei quanto tempo fiquei. Os relógios daqui não andam.',
  'Aprendi três coisas. A primeira: não fique muito tempo lá fora. O frio entra pelos pés, depois pelas mãos, depois pelos pensamentos. Você começa a esquecer por que estava andando. Ande de casa acesa em casa acesa, como quem pula pedras num rio.',
  'A segunda: há outras pessoas. Três delas ficam sentadas no chão de uma casa, em círculo, conversando baixinho. Não pergunte os nomes. Elas não contam, e é melhor assim. Foram elas que me falaram desta casa e desta cama.',
  'A terceira: esta cama não é uma cama comum. Quem dorme nela não acorda aqui. Acorda num campo de trigo, sob um céu nublado, com o cheiro de terra molhada. Eu não tive coragem. Fiquei para escrever esta carta e deixar a porta acesa para o próximo.\n\nAgora é a sua vez. Deite-se. Feche os olhos. E se lembrar de mim do outro lado, lembre que alguém aqueceu esta casa para você.\n\n— R.',
];

// ------------------------------------------------------------ nível
export class Level9_5 extends OutdoorLevel {
  constructor(game) {
    const view = clamp(game.Q.outdoorView * 0.45, 60, 110);
    super(game, { P, Q: { ...game.Q, outdoorView: view }, walkSpeed: 2.2, camFar: view + 200, flashIntensity: 10 });
    this.num = 9.5;
    this.seed = (game.seed ^ 0x95) >>> 0;
    const Q = this.Q;
    this.look = {
      exposure: 1.05,
      tint: [0.92, 0.98, 1.08],
      sat: 0.6,
      contrast: 1.08,
      lift: [0.012, 0.016, 0.024],
      bloom: 0.35,
      bloomThreshold: 0.95,
      fog: [0.09, 0.105, 0.13],
      lightColor: [1, 1, 1],
      flashlight: false,
      ambience: 'level9_5',
      reverb: 0.8,
      sanityDrain: 0.05,
    };
    const fogC = new THREE.Color(...this.look.fog);
    this.scene.fog = new THREE.FogExp2(fogC, 2.3 / view);
    this.scene.background = fogC;
    this.hemi = new THREE.HemisphereLight(0x6a7a98, 0x9aa4b8, 1.1);
    this.moon = new THREE.DirectionalLight(0xa8b8e0, 0.5);
    this.moon.position.set(30, 60, 20);
    this.scene.add(this.hemi, this.moon);
    const S = Q.tex;
    const sid = getTex('l9Siding', S);
    const snow = getTex('l95Snow', S);
    const pl = getTex('planks', Math.min(S, 512));
    this.M = {
      wall: litMaterial(Q, { map: sid.map, normalMap: sid.normalMap, vertexColors: true, roughness: 0.85 }),
      snow: litMaterial(Q, { map: snow.map, normalMap: snow.normalMap, vertexColors: true, roughness: 0.6 }),
      trim: litMaterial(Q, { vertexColors: true, roughness: 0.6 }),
      wood: litMaterial(Q, { map: pl.map, normalMap: pl.normalMap, vertexColors: true, roughness: 0.75 }),
      glow: new THREE.MeshBasicMaterial({ vertexColors: true, fog: true }),
      ground: litMaterial(Q, { map: snow.map, normalMap: snow.normalMap, roughness: 0.65 }),
    };
    // casas especiais (lote = [i, j, fileira, k])
    const rnd = mulberry32(this.seed * 3 + 1);
    this.special = new Map();
    const lotKey = (i, j, r, k) => `${i},${j},${r},${k}`;
    this.special.set(lotKey(0, 0, 0, 0), 'start');
    const ti = 2 + Math.floor(rnd() * 2);
    this.special.set(lotKey(ti, 1, 0, 1), 'trio');
    const li = (rnd() < 0.5 ? -1 : 1) * (4 + Math.floor(rnd() * 2));
    const lj = 4 + Math.floor(rnd() * 2);
    this.special.set(lotKey(li, lj, 1, 0), 'letter');
    this.lotKey = lotKey;
    this.interiors = [];
    this.npcs = [];
    this.spots = [];
    this.lights3 = [];
    const st = this.lotInfo(0, 0, 0, 0);
    this.spawn = { x: st.cx + 1.5, z: st.cz - 1.0, yaw: Math.PI };
    this.letterHouse = this.lotInfo(li, lj, 1, 0);
    this.trioHouse = this.lotInfo(ti, 1, 0, 1);
    this.exit = { x: this.letterHouse.doorX, z: this.letterHouse.doorZ };
    this.objectives = [
      { id: 'house', text: 'Encontre a casa coberta de neve com a luz da varanda acesa' },
      { id: 'letter', text: 'Leia a carta inteira' },
      { id: 'sleep', text: 'Durma na cama aconchegante' },
    ];
    this.cold = 0;
    this.makeGround();
    this.makeSnowfall();
    // luzes das casas especiais (fixas: os shaders compilam uma vez)
    for (const h of [st, this.trioHouse, this.letterHouse]) {
      const l = new THREE.PointLight(0xffc890, 6, 13, 1.4);
      l.position.set(h.cx, FL + 1.8, h.cz);
      this.scene.add(l);
      this.lights3.push(l);
    }
    this.porchL = new THREE.PointLight(0xffb060, 5, 10, 1.6);
    this.porchL.position.set(this.letterHouse.doorX + this.letterHouse.fz * 0.6 + 1.0, FL + 2.2, this.letterHouse.doorZ + this.letterHouse.fz * 0.6);
    this.scene.add(this.porchL);
  }

  // Centro, frente e porta de um lote. fileira 0: frente para a rua de baixo (−z); 1: para a de cima (+z).
  lotInfo(i, j, r, k) {
    const x = i * P + 10 + k * 20 + (hash3(i * 4 + k, j * 2 + r, this.seed) - 0.5) * 3;
    const fz = r === 0 ? -1 : 1;
    const z = r === 0 ? j * P + 4.2 + 2 + HD / 2 : (j + 1) * P - 6.2 - HD / 2;
    return { i, j, r, k, cx: x, cz: z, fz, doorX: x, doorZ: z + fz * (HD / 2 + 0.6), x0: x - HW / 2, x1: x + HW / 2, z0: z - HD / 2, z1: z + HD / 2 };
  }

  ambientAt(x, y, z) {
    const v = (this._amb = this._amb || new THREE.Vector3());
    return this.insideHouse(x, z) ? v.set(0.75, 0.6, 0.45) : v.set(0.25, 0.28, 0.36);
  }

  insideHouse(x, z) {
    for (const h of this.interiors) if (x > h.x0 + 0.15 && x < h.x1 - 0.15 && z > h.z0 + 0.15 && z < h.z1 - 0.15) return h;
    return null;
  }

  makeGround() {
    const size = this.Q.outdoorView * 2 + 80;
    const g = new THREE.PlaneGeometry(size, size, 1, 1).rotateX(-Math.PI / 2);
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (size / 4), uv.getY(i) * (size / 4));
    this.ground = new THREE.Mesh(g, this.M.ground);
    this.ground.receiveShadow = false;
    this.scene.add(this.ground);
  }

  makeSnowfall() {
    const n = this.Q.id === 'low' ? 1500 : 3500;
    const pos = new Float32Array(n * 3);
    const r = mulberry32(9511);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (r() - 0.5) * 50;
      pos[i * 3 + 1] = r() * 18;
      pos[i * 3 + 2] = (r() - 0.5) * 50;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const cv = document.createElement('canvas');
    cv.width = cv.height = 32;
    const c = cv.getContext('2d');
    const gr = c.createRadialGradient(16, 16, 0, 16, 16, 16);
    gr.addColorStop(0, 'rgba(255,255,255,1)');
    gr.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = gr;
    c.fillRect(0, 0, 32, 32);
    this.flakeTex = new THREE.CanvasTexture(cv);
    this.flakes = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.08, map: this.flakeTex, transparent: true, depthWrite: false, color: 0xe8f0ff, fog: true }));
    this.flakes.frustumCulled = false;
    this.scene.add(this.flakes);
  }

  // ------------------------------------------------------------ blocos
  *genChunk(ch) {
    const { i, j, x0, z0 } = ch;
    const B = { wall: new GeoBuilder(), snow: new GeoBuilder(), trim: new GeoBuilder(), wood: new GeoBuilder(), glow: new GeoBuilder() };
    const rnd = mulberry32(((i * 92837111) ^ (j * 689287499) ^ this.seed) >>> 0);
    // montes de neve ao longo da rua e postes
    for (let k = 0; k < 2; k++) {
      const x = x0 + 8 + k * 20 + rnd() * 4;
      for (const s of [-1, 1]) {
        const z = z0 + s * 4.6;
        if (rnd() < 0.5) continue;
        B.trim.cylinder(x, 3.2, z, 0.08, 6.4, [0.18, 0.18, 0.2], null, { sides: 7 });
        B.trim.box(x, 6.3, z - s * 0.6, 0.12, 0.1, 1.3, [0.18, 0.18, 0.2], null, {});
        B.snow.box(x, 6.42, z - s * 0.6, 0.18, 0.08, 1.35, SNOW, null, {});
        const lit = rnd() < 0.55;
        B.glow.box(x, 6.18, z - s * 1.1, 0.32, 0.12, 0.32, lit ? [1.6, 1.15, 0.55] : [0.05, 0.05, 0.06], null, {});
        ch.colliders.push([x - 0.15, x + 0.15, z - 0.15, z + 0.15]);
      }
    }
    for (let k = 0; k < 10; k++) {
      const x = x0 + rnd() * P;
      const z = z0 + (rnd() < 0.5 ? -1 : 1) * (4.5 + rnd() * 1.2);
      const r = 0.6 + rnd() * 1.2;
      B.snow.cylinder(x, 0.15, z, r, 0.3 + rnd() * 0.3, SNOW, null, { sides: 10, r2: r * 0.5 });
    }
    // carro soterrado de vez em quando
    if (rnd() < 0.3) {
      const x = x0 + 5 + rnd() * 30;
      const z = z0 + (rnd() < 0.5 ? -2 : 2);
      B.trim.box(x, 0.55, z, 4.2, 0.8, 1.8, [0.3, 0.12, 0.1], null, {});
      B.snow.box(x, 1.05, z, 4.3, 0.25, 1.9, SNOW, null, {});
      B.snow.box(x - 0.3, 1.45, z, 2.2, 0.5, 1.7, SNOW, null, {});
      ch.colliders.push([x - 2.2, x + 2.2, z - 1, z + 1]);
    }
    yield;
    for (let r = 0; r < 2; r++)
      for (let k = 0; k < 2; k++) {
        const kind = this.special.get(this.lotKey(i, j, r, k));
        if (!kind && hash3(i * 2 + k, j * 2 + r, this.seed + 5) < 0.18) continue; // terreno vazio
        const h = this.lotInfo(i, j, r, k);
        this.buildHouse(B, ch, h, kind, mulberry32(((i * 31 + k) * 7919 + (j * 2 + r) * 104729 + this.seed) >>> 0));
        // árvore nua no quintal
        if (rnd() < 0.6) {
          const tx = h.cx + (rnd() < 0.5 ? -1 : 1) * (HW / 2 + 2.5);
          const tz = h.cz - h.fz * (rnd() * 3);
          B.wood.cylinder(tx, 2.5, tz, 0.16, 5, [0.25, 0.2, 0.17], null, { sides: 7, r2: 0.06 });
          for (let b = 0; b < 4; b++) {
            const a = rnd() * 6.28;
            const m = new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.cos(a) * 0.8, 0, Math.sin(a) * 0.8)).setPosition(tx, 3 + b * 0.5, tz);
            B.wood.addGeometry(new THREE.CylinderGeometry(0.02, 0.05, 2, 5).translate(0, 1, 0), m, [0.25, 0.2, 0.17]);
          }
          ch.colliders.push([tx - 0.2, tx + 0.2, tz - 0.2, tz + 0.2]);
        }
        yield;
      }
    const add = (gb, mat) => (gb.empty ? null : this.addMesh(ch, gb.build(), mat, { cast: false, receive: false }));
    add(B.wall, this.M.wall);
    add(B.snow, this.M.snow);
    add(B.trim, this.M.trim);
    add(B.wood, this.M.wood);
    add(B.glow, this.M.glow);
  }

  buildHouse(B, ch, h, kind, rnd) {
    const { cx, cz, fz } = h;
    const enter = !!kind;
    const hue = [
      [0.72, 0.68, 0.6],
      [0.55, 0.62, 0.7],
      [0.7, 0.55, 0.48],
      [0.62, 0.64, 0.58],
      [0.82, 0.8, 0.74],
    ][Math.floor(rnd() * 5)];
    const top = FL + WH;
    // base de concreto e piso
    B.trim.box(cx, FL / 2, cz, HW + 0.2, FL, HD + 0.2, [0.4, 0.4, 0.42], null, {});
    if (!enter) {
      B.wall.box(cx, (FL + top) / 2, cz, HW, WH, HD, hue, null, { uvScale: 1.4 });
      ch.colliders.push([cx - HW / 2 - 0.1, cx + HW / 2 + 0.1, cz - HD / 2 - 0.1, cz + HD / 2 + 0.1]);
    } else {
      // paredes com espessura e o vão da porta na frente
      const t = 0.18;
      const fzW = cz + fz * (HD / 2 - t / 2);
      const bzW = cz - fz * (HD / 2 - t / 2);
      const dw = 1.0;
      for (const [a0, a1] of [
        [cx - HW / 2, cx - dw / 2],
        [cx + dw / 2, cx + HW / 2],
      ]) {
        B.wall.box((a0 + a1) / 2, (FL + top) / 2, fzW, a1 - a0, WH, t, hue, null, { uvScale: 1.4 });
        ch.colliders.push([a0, a1, fzW - t / 2 - 0.05, fzW + t / 2 + 0.05]);
      }
      B.wall.box(cx, top - 0.35, fzW, dw, 0.7, t, hue, null, { uvScale: 1.4 });
      B.wall.box(cx, (FL + top) / 2, bzW, HW, WH, t, hue, null, { uvScale: 1.4 });
      ch.colliders.push([cx - HW / 2, cx + HW / 2, bzW - t / 2 - 0.05, bzW + t / 2 + 0.05]);
      for (const s of [-1, 1]) {
        const x = cx + s * (HW / 2 - t / 2);
        B.wall.box(x, (FL + top) / 2, cz, t, WH, HD, hue, null, { uvScale: 1.4 });
        ch.colliders.push([x - t / 2 - 0.05, x + t / 2 + 0.05, cz - HD / 2, cz + HD / 2]);
      }
      // piso de madeira, teto, rodapé
      B.wood.box(cx, FL + 0.01, cz, HW - 0.3, 0.02, HD - 0.3, [0.85, 0.7, 0.55], null, { uvScale: 0.6 });
      B.trim.box(cx, top - 0.02, cz, HW - 0.2, 0.04, HD - 0.2, [0.9, 0.86, 0.78], null, {});
      this.furnish(B, ch, h, kind, rnd);
      if (!this.interiors.some((q) => q.x0 === h.x0 && q.z0 === h.z0)) this.interiors.push({ x0: h.x0, x1: h.x1, z0: h.z0, z1: h.z1, kind, h });
    }
    // janelas (acesas nas casas especiais; algumas nas outras)
    const lit = enter ? 1 : rnd() < 0.22 ? 1 : 0;
    const wc = lit ? (kind === 'letter' ? [2.0, 1.4, 0.7] : [1.5, 1.05, 0.55]) : [0.03, 0.04, 0.06];
    for (const s of [-1, 1]) {
      const x = cx + s * 2.4;
      B.glow.box(x, FL + 1.55, cz + fz * (HD / 2 + 0.02), 1.1, 1.2, 0.04, wc, null, {});
      B.trim.box(x, FL + 0.9, cz + fz * (HD / 2 + 0.08), 1.3, 0.08, 0.16, [0.85, 0.85, 0.82], null, {});
      B.snow.box(x, FL + 0.97, cz + fz * (HD / 2 + 0.08), 1.3, 0.05, 0.16, SNOW, null, {});
      B.glow.box(cx + s * (HW / 2 + 0.02), FL + 1.55, cz, 0.04, 1.2, 1.4, lit && rnd() < 0.7 ? wc : [0.03, 0.04, 0.06], null, {});
    }
    // porta (fechada nas casas comuns)
    if (!enter) B.trim.box(cx, FL + 1.05, cz + fz * (HD / 2 + 0.03), 1.0, 2.1, 0.06, [0.3, 0.16, 0.1], null, {});
    // varanda: degraus e luz
    B.trim.box(cx, FL / 2, cz + fz * (HD / 2 + 0.7), 2.2, FL, 1.2, [0.4, 0.4, 0.42], null, {});
    B.snow.box(cx, FL + 0.03, cz + fz * (HD / 2 + 0.9), 2.2, 0.06, 0.8, SNOW, null, {});
    const porch = kind === 'letter' || (!kind && rnd() < 0.15) || kind === 'start' || kind === 'trio';
    B.glow.box(cx + 0.9, FL + 2.15, cz + fz * (HD / 2 + 0.06), 0.14, 0.2, 0.08, porch ? [2.4, 1.5, 0.6] : [0.05, 0.05, 0.05], null, {});
    // telhado de duas águas coberto de neve (cumeeira ao longo de x)
    const ov = 0.5;
    const rise = 2.0;
    for (const s of [-1, 1]) {
      const zE = cz + s * (HD / 2 + ov);
      const pts = [
        [cx - HW / 2 - ov, top - 0.1, zE],
        [cx + HW / 2 + ov, top - 0.1, zE],
        [cx + HW / 2 + ov, top + rise, cz],
        [cx - HW / 2 - ov, top + rise, cz],
      ];
      const n = new THREE.Vector3(0, HD / 2 + ov, s * rise).normalize();
      const q = s > 0 ? pts : [pts[1], pts[0], pts[3], pts[2]];
      B.snow.quad(q, [n.x, n.y, n.z], [0, 0, 3, 0, 3, 2, 0, 2], null, [SNOW, SNOW, SNOW, SNOW]);
      // beiral com neve pendurada
      B.snow.box(cx, top - 0.18, zE, HW + ov * 2, 0.18, 0.2, SNOW, null, {});
    }
    // empenas
    for (const s of [-1, 1]) {
      const x = cx + s * (HW / 2);
      const pts = s > 0 ? [[x, top, cz - HD / 2], [x, top, cz + HD / 2], [x, top + rise, cz], [x, top + rise, cz]] : [[x, top, cz + HD / 2], [x, top, cz - HD / 2], [x, top + rise, cz], [x, top + rise, cz]];
      B.wall.quad(pts, [s, 0, 0], [0, 0, 3, 0, 1.5, 1.5, 1.5, 1.5], null, [hue, hue, hue, hue]);
    }
    // chaminé com neve
    if (rnd() < 0.5 || kind === 'letter') {
      const x = cx + HW / 4;
      B.trim.box(x, top + rise * 0.6 + 0.3, cz - fz * 1.2, 0.7, rise * 1.2 + 0.4, 0.7, [0.35, 0.18, 0.12], null, {});
      B.snow.box(x, top + rise * 1.2 + 0.55, cz - fz * 1.2, 0.8, 0.12, 0.8, SNOW, null, {});
    }
    // neve acumulada junto às paredes
    for (const s of [-1, 1]) B.snow.box(cx + s * (HW / 2 + 0.3), 0.2, cz, 0.6, 0.4, HD, SNOW, null, {});
  }

  // Mobília das casas que dá para entrar.
  furnish(B, ch, h, kind, rnd) {
    const { cx, cz, fz } = h;
    const back = cz - fz * (HD / 2 - 0.8);
    const W = [0.8, 0.62, 0.45];
    // tapete
    B.trim.box(cx, FL + 0.03, cz, 3.2, 0.015, 2.4, kind === 'letter' ? [0.55, 0.18, 0.14] : [0.3, 0.32, 0.45], null, {});
    // abajur (o brilho quente)
    const lx = cx - HW / 2 + 0.7;
    const lz = back;
    B.wood.cylinder(lx, FL + 0.7, lz, 0.04, 1.4, [0.3, 0.25, 0.2], null, { sides: 6 });
    B.glow.cylinder(lx, FL + 1.5, lz, 0.25, 0.35, [1.8, 1.3, 0.75], null, { sides: 10, r2: 0.15 });
    // estante
    B.wood.box(cx + HW / 2 - 0.4, FL + 1.0, cz, 0.4, 2.0, 1.6, W, null, {});
    for (let k = 0; k < 3; k++) for (let b = 0; b < 6; b++) B.trim.box(cx + HW / 2 - 0.42, FL + 0.4 + k * 0.6, cz - 0.6 + b * 0.24, 0.3, 0.3 + rnd() * 0.1, 0.12, [0.3 + rnd() * 0.5, 0.2 + rnd() * 0.3, 0.2 + rnd() * 0.3], null, {});
    ch.colliders.push([cx + HW / 2 - 0.65, cx + HW / 2, cz - 0.85, cz + 0.85]);
    if (kind === 'letter') {
      // cama aconchegante com colcha e travesseiros, criado-mudo com a carta
      const bx = cx - HW / 2 + 1.4;
      const bz = cz;
      B.wood.box(bx, FL + 0.25, bz, 1.6, 0.5, 2.2, W, null, {});
      B.wood.box(bx, FL + 0.7, bz - fz * 1.05, 1.6, 1.0, 0.1, W, null, {});
      B.trim.box(bx, FL + 0.55, bz + fz * 0.15, 1.55, 0.18, 1.9, [0.7, 0.25, 0.2], null, {});
      B.trim.box(bx, FL + 0.66, bz - fz * 0.75, 1.2, 0.14, 0.4, [0.95, 0.94, 0.9], null, {});
      ch.colliders.push([bx - 0.85, bx + 0.85, bz - 1.15, bz + 1.15]);
      const nx = bx + 1.2;
      const nz = bz - fz * 0.9;
      B.wood.box(nx, FL + 0.3, nz, 0.5, 0.6, 0.5, W, null, {});
      ch.colliders.push([nx - 0.3, nx + 0.3, nz - 0.3, nz + 0.3]);
      this.bed = { x: bx + 0.9, z: bz };
      this.letterP = { x: nx, z: nz, y: FL + 0.61 };
      this.letterMesh();
    } else if (kind === 'trio') {
      // velas no chão e três pessoas sentadas em círculo
      for (let k = 0; k < 5; k++) {
        const a = (k / 5) * Math.PI * 2;
        B.trim.cylinder(cx + Math.cos(a) * 0.35, FL + 0.08, cz + Math.sin(a) * 0.35, 0.03, 0.16, [0.9, 0.88, 0.8], null, { sides: 6 });
        B.glow.box(cx + Math.cos(a) * 0.35, FL + 0.19, cz + Math.sin(a) * 0.35, 0.02, 0.05, 0.02, [2.5, 1.6, 0.6], null, {});
      }
      if (!this.npcs.length) this.makeTrio(h);
    } else {
      // sofá e mesinha
      B.trim.box(cx, FL + 0.25, back + fz * 0.4, 2.4, 0.5, 0.9, [0.4, 0.3, 0.35], null, {});
      B.trim.box(cx, FL + 0.6, back, 2.4, 0.7, 0.25, [0.4, 0.3, 0.35], null, {});
      B.wood.box(cx, FL + 0.22, cz, 1.0, 0.44, 0.6, W, null, {});
      ch.colliders.push([cx - 1.25, cx + 1.25, back - 0.2, back + fz * 0.9]);
    }
  }

  letterMesh() {
    if (this.letter) return;
    const p = this.letterP;
    const tex = textCanvasTex(128, 160, (c, w, hh) => {
      c.fillStyle = '#efe6cf';
      c.fillRect(0, 0, w, hh);
      c.strokeStyle = 'rgba(40,40,80,0.6)';
      for (let i = 0; i < 12; i++) {
        c.beginPath();
        c.moveTo(12, 20 + i * 11);
        c.lineTo(w - 12 - (i % 3) * 14, 20 + i * 11);
        c.stroke();
      }
    });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.28), new THREE.MeshLambertMaterial({ map: tex, emissive: 0x605848 }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = 0.3;
    m.position.set(p.x, p.y + 0.005, p.z);
    this.dynamic.add(m);
    this.letter = { mesh: m, tex };
  }

  makeTrio(h) {
    const looks = [
      { skin: '#d8b090', hair: '#3a2a1a', hairStyle: 'long', suit: '#5a3a3a', accent: '#d8c8a0', female: true, arms: 'down' },
      { skin: '#8a5a3a', hair: '#1a1410', hairStyle: 'short', suit: '#3a4a5a', accent: '#a0b0c0', arms: 'down', beard: 'rgba(20,15,10,0.6)' },
      { skin: '#e0c0a0', hair: '#c8a060', hairStyle: 'curly', suit: '#4a5a3a', accent: '#c0c890', female: true, arms: 'down' },
    ];
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.3;
      const x = h.cx + Math.cos(a) * 1.15;
      const z = h.cz + Math.sin(a) * 1.15;
      const yaw = Math.atan2(h.cx - x, h.cz - z);
      const npc = new NPC(this, { id: 'trio' + k, name: 'Andarilho', role: 'sem nome', x, z, yaw, pose: 'sit', h: 1.7, look: looks[k] });
      npc.root.position.y = FL - 0.08;
      this.npcs.push(npc);
    }
    this.spots.push({ x: h.cx, z: h.cz, r: 2.6, label: 'Falar com os três andarilhos', action: () => this.talkTrio() });
  }

  talkTrio() {
    const g = this.game;
    const hud = g.hud;
    const npc = this.npcs[0];
    const say = (t, c) => hud.dialog('Os três andarilhos', t, c, npc.portrait);
    this.talking = true;
    const back = { text: 'Outra pergunta…', fn: () => menu() };
    const menu = () =>
      say('Os três olham para você ao mesmo tempo. Uma delas sorri. “Sente-se, se quiser. Só não pergunte nossos nomes.”', [
        { text: 'Que lugar é este?', fn: () => say('“Nove e meio, alguns chamam. Rochester, outros. A noite não acaba e a neve também não. Mas as casas acesas são quentes. Ninguém sabe por quê, e a gente parou de perguntar.”', [back]) },
        { text: 'Tem mais gente aqui?', fn: () => say('“Algumas. Passam, descansam, vão embora. Nenhuma criatura, pelo menos não que a gente tenha visto. O perigo aqui é o frio. Ele vai tirando a vontade de andar.”', [back]) },
        {
          text: 'Como eu saio?',
          fn: () =>
            say(
              '“Tem uma casa com a luz da varanda acesa e a chaminé torta, mais para dentro do bairro. Alguém deixou uma carta lá. Leia tudo, até o fim. Depois deite na cama. Quem dorme lá acorda no trigo.” A bússola na sua mão parece concordar.',
              [back],
            ),
        },
        { text: 'Posso ficar um pouco?', fn: () => say('Eles abrem espaço no círculo. As velas estalam. Por um tempo, ninguém fala nada — e isso é bom. (A sanidade se recupera dentro das casas acesas.)', [back]) },
        { text: 'Até mais.', fn: () => hud.closeDialog() },
      ]);
    menu();
  }

  // ------------------------------------------------------------ carta e cama
  readLetter(page = 0) {
    const g = this.game;
    const hud = g.hud;
    g.audio.paper();
    const last = page === LETTER.length - 1;
    hud.dialog(`Carta (${page + 1}/${LETTER.length})`, LETTER[page], [
      last
        ? {
            text: 'Dobrar a carta',
            fn: () => {
              hud.closeDialog();
              g.completeObjective('letter', 'Você leu tudo. A cama parece mais quente agora.');
            },
          }
        : { text: 'Continuar lendo…', fn: () => this.readLetter(page + 1) },
      { text: 'Parar de ler', fn: () => hud.closeDialog() },
    ]);
  }

  sleep() {
    const g = this.game;
    if (this.sleeping) return;
    this.sleeping = true;
    g.completeObjective('sleep', 'Você se deita. O cobertor é pesado e quente. A neve bate na janela, devagar.');
    g.player.frozen = true;
    g.audio.play('breath', { gain: 0.3, rate: 0.7 });
    g.reachExit('noclip', 2.2);
  }

  // ------------------------------------------------------------ quadro
  update(dt, player) {
    const g = this.game;
    const p = player.pos;
    this.updateChunks(p.x, p.z);
    const cam = g.camera.position;
    this.ground.position.set(Math.round(cam.x / 4) * 4, 0, Math.round(cam.z / 4) * 4);
    // neve caindo em volta da câmera
    const a = this.flakes.geometry.attributes.position;
    const t = g.time;
    for (let i = 0; i < a.count; i++) {
      let y = a.getY(i) - dt * (0.7 + (i % 5) * 0.1);
      if (y < 0) y += 18;
      a.setY(i, y);
      a.setX(i, a.getX(i) + Math.sin(t * 0.5 + i) * dt * 0.2);
    }
    a.needsUpdate = true;
    this.flakes.position.set(Math.round(cam.x / 50) * 50, 0, Math.round(cam.z / 50) * 50);
    this.flakes.visible = !this.insideHouse(p.x, p.z);
    for (const npc of this.npcs) npc.update(dt, player, t, this.talking && g.hud.dialogOpen);
    if (!g.hud.dialogOpen) this.talking = false;
    if (this.wake === undefined)
      this.wake = standardWake(
        this,
        this.spawn.x,
        this.spawn.z,
        this.spawn.yaw,
        [
          [1.0, 'Quente. Um tapete sob as costas. Silêncio de neve lá fora.'],
          [4.2, 'Pela janela, flocos caindo devagar sobre casas que você não conhece.'],
          [7.3, 'Você não lembra de ter entrado nesta casa.'],
          [10.2, ''],
        ],
        { sound: 'wind', done: () => g.hud.objective('Nível 9.5: o frio lá fora é perigoso. Ande de casa acesa em casa acesa.', 7) },
      );
    if (this.wake.active) {
      this.wake.update(dt);
      return;
    }
    // frio: fora das casas a sanidade cai cada vez mais rápido
    const inside = this.insideHouse(p.x, p.z);
    if (inside) this.cold = Math.max(0, this.cold - dt * 0.08);
    else this.cold = Math.min(1, this.cold + dt * 0.012);
    this.sanityExtra = inside ? -1.2 : 0.15 + this.cold * 0.55;
    g.st.fear = Math.max(g.st.fear, this.cold * 0.35);
    if (!inside && this.cold > 0.35 && !this.toldCold) {
      this.toldCold = true;
      g.hud.message('Os pés já não doem: estão dormentes. O frio vai tirando a vontade de andar. Ache uma casa acesa.', 5);
    }
    if (inside && this.toldCold && this.cold < 0.1) this.toldCold = false;
    // achou a casa
    const L = this.letterHouse;
    if (!g.objectiveDone('house') && Math.hypot(p.x - L.cx, p.z - L.cz) < 9) g.completeObjective('house', 'A casa da luz acesa. Lá dentro, uma cama arrumada e uma carta no criado-mudo.');
    for (const l of this.lights3) l.intensity = 6 + Math.sin(t * 3 + l.position.x) * 0.2;
  }

  collide(p, r) {
    super.collide(p, r);
    for (const n of this.npcs) pushCircle(p, r, n.x - 0.25, n.x + 0.25, n.z - 0.25, n.z + 0.25);
    return p;
  }

  groundY(x, z) {
    return this.insideHouse(x, z) ? FL : 0;
  }

  surfaceAt(x, z) {
    return this.insideHouse(x, z) ? 'wood' : 'dirt';
  }

  lightLevel(x, z) {
    return this.insideHouse(x, z) ? 1 : 0.6;
  }

  interactable(player) {
    if (this.wake && this.wake.active) return null;
    const p = player.pos;
    const g = this.game;
    if (this.letterP && Math.hypot(p.x - this.letterP.x, p.z - this.letterP.z) < 1.5) {
      return { label: g.objectiveDone('letter') ? 'Ler a carta de novo' : 'Ler a carta', action: () => this.readLetter(0) };
    }
    if (this.bed && Math.hypot(p.x - this.bed.x, p.z - this.bed.z) < 1.5) {
      if (!g.objectiveDone('letter'))
        return { label: 'Cama aconchegante', action: () => g.hud.message('A cama parece esperar alguém. Talvez a carta no criado-mudo explique.', 3.5) };
      return { label: 'Dormir na cama aconchegante', action: () => this.sleep() };
    }
    for (const s of this.spots) if (Math.hypot(p.x - s.x, p.z - s.z) < s.r) return { label: s.label, action: s.action };
    return null;
  }

  navTarget() {
    const g = this.game;
    if (g.objectiveDone('letter') && this.bed) return this.bed;
    if (g.objectiveDone('house') && this.letterP) return this.letterP;
    return { x: this.letterHouse.doorX, z: this.letterHouse.doorZ };
  }

  exitEmitter() {
    return null;
  }

  dispose() {
    if (this.wake) this.wake.dispose();
    super.dispose();
    for (const n of this.npcs) n.dispose();
    for (const l of [...this.lights3, this.porchL]) this.scene.remove(l);
    this.scene.remove(this.ground, this.flakes, this.hemi, this.moon);
    this.ground.geometry.dispose();
    this.flakes.geometry.dispose();
    this.flakes.material.dispose();
    this.flakeTex.dispose();
    if (this.letter) {
      this.letter.tex.dispose();
      this.letter.mesh.material.dispose();
      this.letter.mesh.geometry.dispose();
    }
    for (const k in this.M) this.M[k].dispose();
  }
}


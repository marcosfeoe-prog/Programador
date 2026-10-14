// Nível 23 — a Base Seedling: um abrigo construído dentro de um tronco oco
// colossal, com porta em túnel, janelas acesas, varanda de tábuas e um
// interior aconchegante. A luz do interior (lamparina, fogareiro e o dia
// entrando pela porta) é "assada" nas cores dos vértices: materiais sem
// iluminação dinâmica, leves em qualquer celular.
import * as THREE from 'three';
import { GeoBuilder } from '../materials.js';
import { getTex, signTex } from '../textures.js';
import { mulberry32, clamp } from '../util.js';
import { RO, TAU, sweep, quadN, stoneCol, fungi } from './level23_world.js';
import { glowTex } from './level23_tex.js';

export const RI = 3.8; // raio interno do abrigo
const FY = 0.14; // piso (acima do chão aplainado)
const DOOR_H = 2.25;
const CEIL = 3.05;
const DOOR_HW = 0.64; // meia largura útil do túnel da porta
const NA = 32; // segmentos da casca externa (o segmento 0 é a porta)
const NI = 18; // segmentos da parede interna

const ro = (a, y) =>
  RO *
  (1 + 0.07 * Math.sin(3 * a + 1.3) + 0.05 * Math.sin(5 * a + 0.4) + 0.03 * Math.sin(11 * a + 2)) *
  (1 + 0.3 * Math.exp(-(y + 1.5) / 2.2)) *
  (1 - (0.3 * clamp(y, 0, 70)) / 70);
const ri = (a) => RI * (1 + 0.03 * Math.sin(4 * a + 0.7));

// Cores das luzes "assadas".
const WARM = [1.0, 0.6, 0.28];
const GLASS = [3.4, 2.0, 0.85];
const FLAME = [7, 4.2, 1.6];
const DAY = [0.42, 0.47, 0.4];

export class SeedlingBase {
  constructor(level) {
    this.level = level;
    const W = level.world;
    const Q = level.Q;
    this.W = W;
    this.G = W.hb;
    // referencial local: u aponta para fora pela porta, v para o lado
    const dl = Math.hypot(W.ex - W.bx, W.ez - W.bz);
    this.ux = (W.ex - W.bx) / dl;
    this.uz = (W.ez - W.bz) / dl;
    this.vx = -this.uz;
    this.vz = this.ux;
    this.ad = Math.atan2(this.uz, this.ux);
    this.rot = -this.ad;
    this.cx = W.bx;
    this.cz = W.bz;
    this.circles = [];
    const rnd = mulberry32(W.seed + 2323);

    const ext = new GeoBuilder(); // casca externa (pedra-madeira iluminada)
    const wood = new GeoBuilder(); // madeira de fora (iluminada)
    const inW = new GeoBuilder(); // madeira de dentro (luz assada)
    const inB = new GeoBuilder(); // parede interna (luz assada)
    const inM = new GeoBuilder(); // tecidos, metal, vidro de dentro (luz assada)
    const glow = new GeoBuilder(); // vidros e chamas acesos
    this.shell(ext, inB, rnd);
    this.porch(wood, glow);
    this.interior(inW, inM, glow);
    this.windows(wood, inW, glow);
    // luzes assadas: lamparina, rebatimento quente no teto, fogareiro e o dia pela porta
    const lights = [
      { p: this.P(-0.65, 2.2, FY + 0.9), c: WARM, I: 3.2, k: 0.7, wrap: 0.35 },
      { p: this.P(-0.2, 1.0, FY + 2.7), c: [0.5, 0.32, 0.17], I: 0.7, k: 0.25, wrap: 1 },
      { p: this.P(-1.95, 2.15, FY + 0.32), c: [1, 0.42, 0.12], I: 0.8, k: 1.6, wrap: 0.2 },
      { p: this.P(RI + 1.2, 0, FY + 1.3), c: DAY, I: 2.4, k: 0.32, wrap: 0.1 },
      { p: this.P(RI - 0.35, 0.75, FY + DOOR_H - 0.4), c: WARM, I: 2.2, k: 0.5, wrap: 0.4 },
    ];
    const amb = [0.055, 0.058, 0.052];
    for (const gb of [inW, inB, inM]) bake(gb, lights, amb);

    const S = Q.tex;
    const mk = (map) => new THREE.MeshBasicMaterial({ map, vertexColors: true });
    this.inWoodMat = mk(getTex('planks', S).map);
    this.inBarkMat = mk(getTex('l23Heart', S).map);
    this.inMiscMat = mk(getTex('grime', S).map);
    this.glowMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.signMat = new THREE.MeshLambertMaterial({ map: signTex('BASE SEEDLING', '#2a291f', '#d8c79c', 512, 96) });
    this.meshes = [];
    const add = (gb, mat, shadows) => {
      const m = new THREE.Mesh(gb.build(), mat);
      m.castShadow = shadows && Q.shadows;
      m.receiveShadow = shadows && Q.shadows;
      m.matrixAutoUpdate = false;
      level.scene.add(m);
      this.meshes.push(m);
      return m;
    };
    add(ext, level.barkMat, true);
    add(wood, level.woodMat, true);
    add(inW, this.inWoodMat, false);
    add(inB, this.inBarkMat, false);
    add(inM, this.inMiscMat, false);
    add(glow, this.glowMat, false);
    this.sign();
    this.extras();
  }

  // Ponto (u, v, y) do referencial local → [x, y, z] no mundo.
  P(u, v, y) {
    return [this.cx + this.ux * u + this.vx * v, this.G + y, this.cz + this.uz * u + this.vz * v];
  }

  // Caixa alinhada ao referencial local (sx ao longo de u, sz ao longo de v).
  box(gb, u, v, y, su, sy, sv, col, opt = {}) {
    const p = this.P(u, v, y);
    gb.box(p[0], p[1], p[2], su, sy, sv, col, null, { rot: this.rot + (opt.rot || 0), ao: opt.ao ?? 0, uvScale: opt.uvScale });
  }

  cyl(gb, u, v, y, r, h, col, opt = {}) {
    const p = this.P(u, v, y);
    gb.cylinder(p[0], p[1], p[2], r, h, col, null, opt);
  }

  // Centro da casca na altura y (o tronco se inclina acima de 6 m).
  axis(y) {
    const k = Math.max(0, y - 6);
    return [this.cx + (-this.ux * 0.07 + this.vx * 0.03) * k, this.cz + (-this.uz * 0.07 + this.vz * 0.03) * k];
  }

  // ------------------------------------------------------------ casca e túnel
  shell(ext, inB, rnd) {
    const G = this.G;
    const ys = [-1.6, 0, FY + DOOR_H, 3.6, 5.2, 7.5, 10.5, 14.5, 19.5, 25.5, 32.5, 40.5, 49.5, 60, 72];
    const segA = TAU / NA;
    const base = stoneCol(rnd);
    const uRep = Math.round((TAU * RO) / 3);
    const b0 = ext.n;
    for (let b = 0; b < ys.length; b++) {
      const y = ys[b];
      const [ax, az] = this.axis(y);
      const k = 0.72 + 0.28 * clamp(y / 6, 0, 1);
      const c = [base[0] * k, base[1] * k, base[2] * k];
      for (let j = 0; j <= NA; j++) {
        const a = this.ad + (j - 0.5) * segA;
        const r = ro(a, y);
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        ext.vert(ax + ca * r, G + y, az + sa * r, ca, 0.12, sa, (j / NA) * uRep, y / 3, 0, 0, c, 0);
      }
    }
    for (let b = 0; b < ys.length - 1; b++) {
      for (let j = 0; j < NA; j++) {
        if (j === 0 && b === 1) continue; // vão da porta
        const v00 = b0 + b * (NA + 1) + j;
        const v10 = v00 + NA + 1;
        ext.idx.push(v00 + 1, v00, v10, v00 + 1, v10, v10 + 1);
      }
    }
    // topo fechado (escondido pelos galhos da copa)
    const yT = ys[ys.length - 1];
    const [tx, tz] = this.axis(yT);
    const cT = ext.vert(tx, G + yT + 2, tz, 0, 1, 0, 0.5, 0.5, 0, 0, base, 0);
    const lastRow = b0 + (ys.length - 1) * (NA + 1);
    for (let j = 0; j < NA; j++) ext.idx.push(cT, lastRow + j + 1, lastRow + j);
    // galhos da copa e um fio que se enrola no tronco
    for (let k = 0; k < 3; k++) {
      const a = this.ad + 0.5 + k * 2.1 + rnd() * 0.4;
      const [x0, z0] = this.axis(56);
      const pts = [];
      const rad = [];
      for (let q = 0; q <= 8; q++) {
        const d = 2 + q * q * 0.5;
        pts.push([x0 + Math.cos(a) * d, G + 56 + q * 5, z0 + Math.sin(a) * d]);
        rad.push(3.4 * (1 - q * 0.1));
      }
      sweep(ext, pts, rad, { sides: 12, bump: 0.12, seed: k, uScale: 3, vScale: 3, col: base });
    }
    {
      const pts = [];
      const rad = [];
      for (let y = 4.5; y <= 66; y += 2.5) {
        const a = this.ad + 1.7 + y * 0.075;
        const [x, z] = this.axis(y);
        const r = ro(a, y) + 0.45;
        pts.push([x + Math.cos(a) * r, G + y, z + Math.sin(a) * r]);
        rad.push(1.5 - y * 0.012);
      }
      sweep(ext, pts, rad, { sides: 10, bump: 0.1, seed: 9, uScale: 2.5, vScale: 2.5, col: base });
    }
    // raízes de sapopema ao redor (nenhuma na frente da porta)
    for (let k = 0; k < 7; k++) {
      const a = this.ad + 0.85 + (k * (TAU - 1.7)) / 6 + (rnd() - 0.5) * 0.2;
      this.buttress(ext, a, rnd, base);
    }
    // túnel da porta: laterais, teto e a parede interna
    const yTop = FY + DOOR_H;
    const segI = TAU / NI;
    const edge = (a, r, y) => {
      const [x, z] = this.axis(0);
      return [x + Math.cos(a) * r, G + y, z + Math.sin(a) * r];
    };
    const tc = [0.62, 0.6, 0.56];
    for (const s of [-1, 1]) {
      const ao = this.ad + (s * segA) / 2;
      const ai = this.ad + (s * segI) / 2;
      const n = [-s * this.vx, 0, -s * this.vz];
      quadN(
        inB,
        [edge(ai, ri(ai), 0), edge(ao, ro(ao, 0), 0), edge(ao, ro(ao, yTop), yTop), edge(ai, ri(ai), yTop)],
        n,
        [0, 0, 1.4, 0, 1.4, 0.8, 0, 0.8],
        tc,
      );
    }
    {
      const aoL = this.ad - segA / 2;
      const aoR = this.ad + segA / 2;
      const aiL = this.ad - segI / 2;
      const aiR = this.ad + segI / 2;
      quadN(
        inB,
        [edge(aiL, ri(aiL), yTop), edge(aiR, ri(aiR), yTop), edge(aoR, ro(aoR, yTop), yTop), edge(aoL, ro(aoL, yTop), yTop)],
        [0, -1, 0],
        [0, 0, 0.5, 0, 0.5, 1.4, 0, 1.4],
        tc,
      );
    }
    // parede interna (normais para dentro)
    const yi = [-0.2, yTop, FY + CEIL + 0.05];
    const i0 = inB.n;
    const iRep = Math.round((TAU * RI) / 2.5);
    for (let b = 0; b < yi.length; b++) {
      for (let j = 0; j <= NI; j++) {
        const a = this.ad + (j - 0.5) * segI;
        const r = ri(a);
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        const k = 0.85 + 0.15 * Math.sin(a * 5 + b);
        inB.vert(
          this.cx + ca * r,
          G + yi[b],
          this.cz + sa * r,
          -ca,
          0,
          -sa,
          (j / NI) * iRep,
          yi[b] / 2.5,
          0,
          0,
          [0.95 * k, 0.88 * k, 0.78 * k],
          0,
        );
      }
    }
    for (let b = 0; b < yi.length - 1; b++) {
      for (let j = 0; j < NI; j++) {
        if (j === 0 && b === 0) continue;
        const v00 = i0 + b * (NI + 1) + j;
        const v10 = v00 + NI + 1;
        inB.idx.push(v00, v00 + 1, v10, v00 + 1, v10 + 1, v10);
      }
    }
    this.segA = segA;
    this.segI = segI;
  }

  buttress(ext, a, rnd, col) {
    const W = this.W;
    const G = this.G;
    const L = 7 + rnd() * 5;
    const r0 = 1.5 + rnd() * 0.5;
    const pts = [];
    const rad = [];
    const n = 9;
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const d = ro(a, 1) * 0.82 + L * t;
      const aa = a + Math.sin(t * 3 + a) * 0.06;
      const x = this.cx + Math.cos(aa) * d;
      const z = this.cz + Math.sin(aa) * d;
      const y = 2.6 - 4.6 * Math.pow(t, 1.1);
      const r = r0 * (1 - 0.7 * t);
      pts.push([x, W.h(x, z) + y, z]);
      rad.push(r);
      const dy = clamp(y, 0.2, 1.7) - y;
      const hw = Math.sqrt(Math.max(0, r * r - dy * dy));
      if (hw > 0.15 && d > ro(a, 1)) this.circles.push([x, z, hw * 0.95]);
    }
    sweep(ext, pts, rad, { sides: 9, bump: 0.15, seed: a * 3, uScale: 2.5, vScale: 2.5, col });
    if (rnd() < 0.7) {
      const t = 0.5 + rnd() * 0.3;
      const i = Math.round(t * n);
      fungi({ bark: ext }, pts[i][0], G + Math.max(0, pts[i][1] - G - rad[i] * 0.3), pts[i][2], rnd, 4 + Math.floor(rnd() * 5));
    }
  }

  // ------------------------------------------------------------ fora
  porch(wood, glow) {
    const rOut = ro(this.ad, 0);
    const u0 = rOut - 0.6;
    const u1 = rOut + 2.3;
    const plank = [0.62, 0.55, 0.46];
    // deque de tábuas e degrau
    for (let k = 0; k < 6; k++) {
      const v = -1.25 + k * 0.5;
      this.box(wood, (u0 + u1) / 2, v, FY - 0.05, u1 - u0, 0.1, 0.46, plank, { uvScale: 1.2 });
    }
    for (const v of [-1.3, 1.3]) this.box(wood, (u0 + u1) / 2, v, FY - 0.17, u1 - u0, 0.14, 0.12, [0.4, 0.36, 0.3]);
    this.box(wood, u1 + 0.25, 0, 0.02, 0.5, 0.08, 2.2, plank);
    this.porchU = [u0, u1 + 0.5];
    const df = this.xz(u1 + 1.2, 0);
    this.doorFront = { x: df[0], z: df[1] };
    // batentes, verga e a porta aberta para fora
    const segA = TAU / NA;
    const frame = [0.5, 0.43, 0.34];
    const jamb = [-1, 1].map((s) => {
      const a = this.ad + (s * segA) / 2;
      const r = (ro(a, 0) + ro(a, DOOR_H)) / 2;
      return this.local(this.cx + Math.cos(a) * r, this.cz + Math.sin(a) * r);
    });
    for (const j of jamb) this.box(wood, j.u - 0.05, j.v - Math.sign(j.v) * 0.05, FY + DOOR_H / 2, 0.2, DOOR_H + 0.1, 0.16, frame);
    const uo = Math.min(jamb[0].u, jamb[1].u);
    const hw = (jamb[1].v - jamb[0].v) / 2;
    this.box(wood, uo - 0.08, (jamb[0].v + jamb[1].v) / 2, FY + DOOR_H + 0.08, 0.24, 0.18, hw * 2 + 0.12, frame);
    const th = 1.25;
    const hu = jamb[0].u + 0.05;
    const hv = jamb[0].v + 0.05;
    const leafW = hw * 2 - 0.15;
    const cu = hu + Math.cos(th) * leafW * 0.5;
    const cv = hv - Math.sin(th) * leafW * 0.5;
    this.box(wood, cu, cv, FY + DOOR_H / 2 - 0.02, leafW, DOOR_H - 0.08, 0.06, [0.55, 0.47, 0.36], { rot: th, uvScale: 0.8 });
    for (const y of [0.4, DOOR_H - 0.45]) this.box(wood, cu, cv, FY + y, leafW * 0.9, 0.12, 0.09, [0.45, 0.38, 0.29], { rot: th });
    // lampião no poste ao lado da porta
    const lu = u1 - 0.2;
    const lv = 1.75;
    this.box(wood, lu, lv, 1.2, 0.12, 2.4, 0.12, [0.42, 0.36, 0.28]);
    this.box(wood, lu, lv - 0.3, 2.3, 0.08, 0.08, 0.6, [0.42, 0.36, 0.28]);
    this.cyl(wood, lu, lv - 0.55, 2.13, 0.09, 0.05, [0.12, 0.11, 0.1], { sides: 8 });
    this.cyl(wood, lu, lv - 0.55, 1.83, 0.1, 0.04, [0.12, 0.11, 0.1], { sides: 8 });
    this.cyl(glow, lu, lv - 0.55, 1.98, 0.075, 0.26, GLASS, { sides: 8 });
    this.lampOut = this.P(lu, lv - 0.55, 1.98);
    // lenha empilhada, barril e caixote encostados no tronco
    const fw = [0.68, 0.55, 0.42];
    for (let row = 0; row < 3; row++) {
      for (let k = 0; k < 5 - row; k++) {
        const v = -2.4 - k * 0.3 - row * 0.15;
        const y = 0.15 + row * 0.26;
        const uw = this.atWall(v, 0.05);
        const a = this.P(uw, v, y);
        const b = this.P(uw + 0.95, v, y);
        sweep(wood, [a, b], [0.13, 0.13], {
          sides: 6,
          col: fw,
          capA: true,
          capB: true,
          capCol: [0.85, 0.7, 0.5],
          uScale: 0.5,
          vScale: 0.6,
        });
      }
    }
    const bp = this.P(this.atWall(2.45, 0.45), 2.45, 0);
    sweep(wood, [bp, [bp[0], bp[1] + 0.95, bp[2]]], [0.34, 0.34], {
      sides: 12,
      col: [0.5, 0.42, 0.32],
      capB: true,
      uScale: 0.6,
      vScale: 0.6,
    });
    for (const y of [0.2, 0.75])
      sweep(
        wood,
        [
          [bp[0], bp[1] + y, bp[2]],
          [bp[0], bp[1] + y + 0.06, bp[2]],
        ],
        [0.35, 0.35],
        { sides: 12, col: [0.18, 0.17, 0.16] },
      );
    this.circles.push([bp[0], bp[2], 0.4]);
    this.box(wood, this.atWall(3.3, 0.35), 3.3, 0.3, 0.6, 0.6, 0.6, [0.6, 0.5, 0.38], { rot: 0.2 });
    // estacas com fitas: o fim da trilha
    for (const s of [-1, 1]) {
      const p = this.P(u1 + 2.6, s * 1.7, 0);
      wood.box(p[0], p[1] + 0.6, p[2], 0.07, 1.2, 0.07, [0.45, 0.38, 0.3], null, { ao: 0 });
      wood.box(p[0], p[1] + 1.1, p[2], 0.02, 0.32, 0.06, [0.85, 0.42, 0.15], null, { ao: 0, rot: 0.3 });
    }
  }

  // ------------------------------------------------------------ dentro
  interior(inW, inM, glow) {
    const plank = [0.78, 0.68, 0.55];
    // piso e forro em anéis (a luz assada precisa de vértices)
    const rings = [0, 1.3, 2.6, RI * 1.04];
    const disk = (gb, y, up, col) => {
      for (let r = 0; r < rings.length - 1; r++) {
        for (let j = 0; j < NI; j++) {
          const a0 = this.ad + (j - 0.5) * this.segI;
          const a1 = a0 + this.segI;
          const p = [
            [rings[r], a0],
            [rings[r], a1],
            [rings[r + 1], a1],
            [rings[r + 1], a0],
          ].map(([rr, a]) => [this.cx + Math.cos(a) * rr, this.G + y, this.cz + Math.sin(a) * rr]);
          const uv = [];
          for (const q of p) {
            const lu = (q[0] - this.cx) * this.ux + (q[2] - this.cz) * this.uz;
            const lv = (q[0] - this.cx) * this.vx + (q[2] - this.cz) * this.vz;
            uv.push(lu / 1.6, lv / 1.6);
          }
          quadN(gb, p, [0, up, 0], uv, col);
        }
      }
    };
    disk(inW, FY, 1, plank);
    disk(inW, FY + CEIL, -1, [0.62, 0.54, 0.44]);
    // piso do túnel
    const uo = ro(this.ad, 0);
    this.box(inW, (RI + uo) / 2 - 0.1, 0, FY - 0.04, uo - RI + 0.2, 0.08, DOOR_HW * 2 + 0.1, plank, { uvScale: 1.6 });
    // vigas do forro
    for (const u of [-1.7, 0, 1.7]) {
      const len = 2 * Math.sqrt(RI * RI - u * u);
      this.box(inW, u, 0, FY + CEIL - 0.11, 0.16, 0.2, len, [0.5, 0.42, 0.32]);
    }
    // catre: estrutura, colchão de lona, cobertor e travesseiro
    const cu = -0.05;
    const cv = -2.72;
    const frame = [0.55, 0.45, 0.34];
    for (const du of [-0.9, 0.9]) for (const dv of [-0.33, 0.33]) this.box(inW, cu + du, cv + dv, FY + 0.18, 0.06, 0.36, 0.06, frame);
    for (const dv of [-0.36, 0.36]) this.box(inW, cu, cv + dv, FY + 0.34, 1.9, 0.07, 0.05, frame);
    this.box(inM, cu, cv, FY + 0.43, 1.86, 0.12, 0.7, [0.42, 0.44, 0.3]);
    this.box(inM, cu + 0.25, cv + 0.02, FY + 0.5, 1.3, 0.06, 0.76, [0.36, 0.38, 0.46]);
    this.box(inM, cu - 0.72, cv, FY + 0.54, 0.36, 0.1, 0.55, [0.85, 0.82, 0.74]);
    this.circles.push([...this.xz(cu - 0.5, cv), 0.5], [...this.xz(cu + 0.5, cv), 0.5]);
    this.cot = this.xz(cu, cv);
    // estante de tábuas no fundo com potes, latas e livros
    const su = -3.2;
    const shelfC = [0.6, 0.5, 0.38];
    for (const dv of [-1.05, 1.05]) this.box(inW, su, dv, FY + 1.05, 0.36, 2.1, 0.05, shelfC);
    const rnd = mulberry32(this.W.seed + 77);
    for (const y of [0.3, 0.8, 1.3, 1.8]) {
      this.box(inW, su, 0, FY + y, 0.36, 0.035, 2.1, shelfC);
      let v = -0.95;
      while (v < 0.9) {
        const r = rnd();
        if (r < 0.35) {
          const rr = 0.05 + rnd() * 0.03;
          const h = 0.12 + rnd() * 0.12;
          const jar = [
            [0.55, 0.62, 0.42],
            [0.7, 0.5, 0.3],
            [0.5, 0.55, 0.6],
          ][Math.floor(rnd() * 3)];
          this.cyl(inM, su + 0.02, v + rr, FY + y + 0.02 + h / 2, rr, h, jar, { sides: 8 });
          this.cyl(inM, su + 0.02, v + rr, FY + y + 0.03 + h, rr * 0.8, 0.03, [0.3, 0.28, 0.25], { sides: 8 });
          v += rr * 2 + 0.04;
        } else if (r < 0.75) {
          const n = 3 + Math.floor(rnd() * 5);
          for (let k = 0; k < n && v < 0.95; k++) {
            const w = 0.03 + rnd() * 0.03;
            const h = 0.16 + rnd() * 0.1;
            const bc = [
              [0.45, 0.2, 0.15],
              [0.2, 0.28, 0.22],
              [0.55, 0.48, 0.32],
              [0.22, 0.24, 0.35],
            ][Math.floor(rnd() * 4)];
            this.box(inM, su + 0.02, v + w / 2, FY + y + 0.02 + h / 2, 0.22, h, w, bc);
            v += w + 0.005;
          }
          v += 0.05;
        } else if (r < 0.9) {
          const rr = 0.045;
          for (let k = 0; k < 3; k++) this.cyl(inM, su + 0.03, v + rr + k * 0.1, FY + y + 0.07, rr, 0.11, [0.62, 0.6, 0.55], { sides: 8 });
          v += 0.34;
        } else v += 0.15 + rnd() * 0.2;
      }
    }
    this.circles.push([...this.xz(su, -0.55), 0.5], [...this.xz(su, 0.55), 0.5]);
    // mesa, banco, lamparina e rádio
    const tu = -0.9;
    const tv = 2.35;
    this.box(inW, tu, tv, FY + 0.74, 1.15, 0.04, 0.68, [0.58, 0.47, 0.35]);
    for (const du of [-0.5, 0.5])
      for (const dv of [-0.28, 0.28]) this.box(inW, tu + du, tv + dv, FY + 0.36, 0.05, 0.72, 0.05, [0.5, 0.4, 0.3]);
    this.circles.push([...this.xz(tu, tv), 0.62]);
    this.cyl(inW, -0.15, 1.85, FY + 0.45, 0.18, 0.04, [0.58, 0.47, 0.35], { sides: 10 });
    for (let k = 0; k < 3; k++) {
      const a = k * 2.1;
      this.box(inW, -0.15 + Math.cos(a) * 0.12, 1.85 + Math.sin(a) * 0.12, FY + 0.22, 0.04, 0.44, 0.04, [0.5, 0.4, 0.3]);
    }
    const lu = -0.65;
    const lv = 2.2;
    const iron = [0.16, 0.15, 0.14];
    this.cyl(inM, lu, lv, FY + 0.78, 0.075, 0.04, iron, { sides: 10 });
    this.cyl(glow, lu, lv, FY + 0.88, 0.06, 0.16, GLASS, { sides: 10 });
    this.cyl(glow, lu, lv, FY + 0.88, 0.014, 0.05, FLAME, { sides: 5 });
    this.cyl(inM, lu, lv, FY + 0.98, 0.07, 0.04, iron, { sides: 10, r2: 0.03 });
    this.box(inM, lu, lv, FY + 1.06, 0.006, 0.08, 0.1, iron);
    this.lantern = this.P(lu, lv, FY + 0.88);
    const ru = -1.25;
    const rv = 2.42;
    this.box(inM, ru, rv, FY + 0.87, 0.34, 0.22, 0.15, [0.36, 0.27, 0.18]);
    this.box(inM, ru - 0.07, rv - 0.076, FY + 0.87, 0.14, 0.15, 0.01, [0.12, 0.11, 0.1]);
    this.box(glow, ru + 0.08, rv - 0.077, FY + 0.9, 0.11, 0.05, 0.01, [2.0, 1.25, 0.5]);
    this.cyl(inM, ru + 0.12, rv + 0.04, FY + 1.18, 0.006, 0.42, [0.5, 0.5, 0.5], { sides: 4 });
    this.radio = this.xz(ru, rv);
    this.radioP = this.P(ru, rv, FY + 0.9);
    // fogareiro a lenha com cano até o forro
    const fu = -2.3;
    const fv = 2.3;
    this.box(inM, fu, fv, FY + 0.38, 0.5, 0.5, 0.46, iron);
    for (const du of [-0.2, 0.2]) for (const dv of [-0.18, 0.18]) this.box(inM, fu + du, fv + dv, FY + 0.07, 0.05, 0.14, 0.05, iron);
    this.box(glow, fu + 0.15, fv - 0.235, FY + 0.33, 0.18, 0.025, 0.01, [3.6, 1.3, 0.3]);
    this.box(glow, fu + 0.15, fv - 0.235, FY + 0.27, 0.18, 0.025, 0.01, [3.0, 1.0, 0.25]);
    this.cyl(inM, fu, fv + 0.05, FY + 0.63 + (CEIL - 0.63) / 2, 0.065, CEIL - 0.63, [0.2, 0.19, 0.18], { sides: 8, caps: false });
    this.circles.push([...this.xz(fu, fv), 0.42]);
    for (let k = 0; k < 4; k++) {
      const a = this.P(-1.6 + k * 0.05, 3.05, FY + 0.08 + k * 0.17);
      const b = this.P(-1.15 + k * 0.05, 3.0, FY + 0.08 + k * 0.17);
      sweep(inW, [a, b], [0.08, 0.08], { sides: 6, col: [0.55, 0.42, 0.3], capA: true, capB: true, capCol: [0.85, 0.7, 0.5] });
    }
    // tapete, caixotes, ervas penduradas, mapa e casaco
    this.cyl(inM, 0.3, 0, FY + 0.006, 1.15, 0.012, [0.42, 0.16, 0.1], { sides: 18 });
    this.box(inW, 2.25, -2.05, FY + 0.3, 0.6, 0.6, 0.6, [0.62, 0.52, 0.38], { rot: 0.3 });
    this.box(inW, 2.2, -2.0, FY + 0.82, 0.42, 0.42, 0.42, [0.58, 0.48, 0.35], { rot: 0.1 });
    this.circles.push([...this.xz(2.25, -2.05), 0.48]);
    for (let k = 0; k < 4; k++) {
      const v = -1.1 + k * 0.7;
      this.box(inM, 0, v, FY + CEIL - 0.36, 0.008, 0.3, 0.008, [0.5, 0.48, 0.4]);
      for (let q = 0; q < 5; q++) {
        const a = q * 1.26;
        this.box(inM, Math.cos(a) * 0.03, v + Math.sin(a) * 0.03, FY + CEIL - 0.62, 0.025, 0.26, 0.025, [0.36, 0.42, 0.24], { rot: a });
      }
    }
    // lampião pendurado na boca interna do túnel: a porta brilha vista de fora
    this.box(inM, RI - 0.35, 0.75, FY + DOOR_H - 0.12, 0.02, 0.24, 0.02, [0.2, 0.19, 0.18]);
    this.cyl(inM, RI - 0.35, 0.75, FY + DOOR_H - 0.27, 0.07, 0.04, [0.16, 0.15, 0.14], { sides: 8 });
    this.cyl(glow, RI - 0.35, 0.75, FY + DOOR_H - 0.4, 0.06, 0.22, GLASS, { sides: 8 });
    this.cyl(inM, RI - 0.35, 0.75, FY + DOOR_H - 0.53, 0.07, 0.04, [0.16, 0.15, 0.14], { sides: 8 });
    const ma = this.ad + 2.15;
    const mr = ri(ma) - 0.03;
    const mx = Math.cos(ma);
    const mz = Math.sin(ma);
    const tx = -mz * 0.32;
    const tz = mx * 0.32;
    const mc = [this.cx + mx * mr, this.cz + mz * mr];
    quadN(
      inM,
      [
        [mc[0] - tx, this.G + FY + 1.35, mc[1] - tz],
        [mc[0] + tx, this.G + FY + 1.35, mc[1] + tz],
        [mc[0] + tx, this.G + FY + 1.82, mc[1] + tz],
        [mc[0] - tx, this.G + FY + 1.82, mc[1] - tz],
      ],
      [-mx, 0, -mz],
      [0, 0, 0.3, 0, 0.3, 0.25, 0, 0.25],
      [0.92, 0.86, 0.68],
    );
    this.box(inM, 2.45, 2.55, FY + 1.35, 0.1, 0.75, 0.42, [0.42, 0.24, 0.12], { rot: -0.5 });
  }

  // Janelas: vidro aceso por fora (vista de longe) e luz do dia por dentro.
  windows(wood, inW, glow) {
    const frame = [0.48, 0.41, 0.32];
    for (const s of [-1, 1]) {
      const a = this.ad + s * 0.95;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const rot = -(a + Math.PI / 2);
      const t = [-sa, ca];
      const put = (gb, r, y, sx, sy, sz, col) =>
        gb.box(this.cx + ca * r, this.G + y, this.cz + sa * r, sx, sy, sz, col, null, { rot, ao: 0 });
      const r = ro(a, 1.7) - 0.02;
      const y = FY + 1.65;
      for (const d of [-0.42, 0.42]) {
        const p = [this.cx + ca * r + t[0] * d, this.G + y, this.cz + sa * r + t[1] * d];
        wood.box(p[0], p[1], p[2], 0.1, 0.84, 0.3, frame, null, { rot, ao: 0 });
      }
      for (const dy of [-0.4, 0.4]) put(wood, r, y + dy, 0.94, 0.09, 0.3, frame);
      put(wood, r + 0.06, y, 0.05, 0.72, 0.16, frame);
      put(wood, r + 0.06, y, 0.78, 0.05, 0.16, frame);
      put(
        glow,
        r + 0.02,
        y,
        0.78,
        0.72,
        0.02,
        GLASS.map((c) => c * 0.75),
      );
      // por dentro: janelinha com a luz cinza-esverdeada do dia
      const rr = ri(a) - 0.02;
      for (const dy of [-0.33, 0.33]) put(inW, rr, y + dy, 0.74, 0.07, 0.08, frame);
      for (const d of [-0.33, 0.33]) {
        const p = [this.cx + ca * rr + t[0] * d, this.G + y, this.cz + sa * rr + t[1] * d];
        inW.box(p[0], p[1], p[2], 0.07, 0.6, 0.08, frame, null, { rot, ao: 0 });
      }
      put(glow, rr + 0.03, y, 0.62, 0.6, 0.02, [0.5, 0.56, 0.48]);
    }
  }

  // Placa pintada acima da porta.
  sign() {
    const r = ro(this.ad, FY + DOOR_H + 0.5) + 0.12;
    const y = FY + DOOR_H + 0.5;
    const p = this.P(r, 0, y);
    const w = 1.5;
    const h = 0.28;
    const g = new THREE.PlaneGeometry(w, h);
    const m = new THREE.Mesh(g, this.signMat);
    m.position.set(p[0], p[1], p[2]);
    m.rotation.order = 'YXZ';
    m.rotation.y = Math.atan2(this.ux, this.uz);
    m.rotation.x = -0.12;
    m.matrixAutoUpdate = false;
    m.updateMatrix();
    this.level.scene.add(m);
    this.meshes.push(m);
  }

  // Poça de luz quente na varanda e halo visível de longe na neblina.
  extras() {
    const tex = glowTex();
    this.glowTexture = tex;
    this.poolMat = new THREE.MeshBasicMaterial({
      map: tex,
      color: new THREE.Color(0.3, 0.17, 0.07),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const pool = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 5.5), this.poolMat);
    const p = this.P(ro(this.ad, 0) + 1.6, 0.2, FY + 0.02);
    pool.position.set(p[0], p[1], p[2]);
    pool.rotation.set(-Math.PI / 2, 0, -this.ad + Math.PI / 2);
    this.level.scene.add(pool);
    this.meshes.push(pool);
    this.haloMat = new THREE.SpriteMaterial({
      map: tex,
      color: new THREE.Color(1.0, 0.62, 0.3),
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    this.halo = new THREE.Sprite(this.haloMat);
    const h = this.P(ro(this.ad, 1) + 0.8, 0, FY + 1.4);
    this.halo.position.set(h[0], h[1], h[2]);
    this.level.scene.add(this.halo);
  }

  // u em que o ponto (u, v) fica a `off` metros da casca externa.
  atWall(v, off) {
    let u = RO;
    for (let k = 0; k < 3; k++) {
      const p = this.xz(u, v);
      const r = ro(Math.atan2(p[1] - this.cz, p[0] - this.cx), 0.3) + off;
      u = Math.sqrt(Math.max(0.01, r * r - v * v));
    }
    return u;
  }

  xz(u, v) {
    return [this.cx + this.ux * u + this.vx * v, this.cz + this.uz * u + this.vz * v];
  }

  local(x, z) {
    const dx = x - this.cx;
    const dz = z - this.cz;
    return { u: dx * this.ux + dz * this.uz, v: dx * this.vx + dz * this.vz, d: Math.hypot(dx, dz) };
  }

  inside(x, z) {
    return this.local(x, z).d < RI - 0.1;
  }

  // Altura do piso (dentro, no túnel e na varanda) ou null.
  floorY(x, z) {
    const l = this.local(x, z);
    if (l.d < RI + 0.1) return this.G + FY;
    if (l.u > 0 && Math.abs(l.v) < 1.5 && l.u < this.porchU[1]) return this.G + FY;
    return null;
  }

  // Parede em anel com o túnel da porta; móveis como círculos.
  collide(p, r) {
    const l = this.local(p.x, p.z);
    if (l.d > RO * 1.6) return;
    const a = Math.atan2(p.z - this.cz, p.x - this.cx);
    const rIn = ri(a);
    const rOut = ro(a, 0.6);
    const chan = l.u > 0 && Math.abs(l.v) < DOOR_HW - r;
    if (!chan && l.d > rIn - r && l.d < rOut + r) {
      if (l.u > 0 && Math.abs(l.v) < DOOR_HW + r && l.d > rIn + 0.15 && l.d < rOut - 0.15) {
        // dentro da espessura da parede, encostado no batente: volta para o túnel
        const dv = Math.sign(l.v) * (DOOR_HW - r) - l.v;
        p.x += this.vx * dv;
        p.z += this.vz * dv;
      } else {
        const tgt = l.d < (rIn + rOut) / 2 ? rIn - r : rOut + r;
        const k = tgt / Math.max(l.d, 1e-4);
        p.x = this.cx + (p.x - this.cx) * k;
        p.z = this.cz + (p.z - this.cz) * k;
      }
    }
    for (const c of this.circles) {
      const dx = p.x - c[0];
      const dz = p.z - c[1];
      const d = Math.hypot(dx, dz);
      const m = c[2] + r;
      if (d < m && d > 1e-5) {
        p.x = c[0] + (dx / d) * m;
        p.z = c[1] + (dz / d) * m;
      }
    }
  }

  // Halo: mais forte de longe (a luz espalhada pela neblina), some de perto.
  update(cam, t, viewDist) {
    const d = Math.hypot(cam.x - this.halo.position.x, cam.z - this.halo.position.z);
    const k = clamp((d - 6) / 26, 0, 1) * Math.exp(-d / 240);
    const fl = 1 + Math.sin(t * 7.3) * 0.03 + Math.sin(t * 13.1) * 0.02;
    this.haloMat.opacity = 0.9 * k * fl;
    this.halo.scale.setScalar(3.5 + d * 0.06);
    this.halo.visible = k > 0.002;
    const near = d < viewDist + 60;
    for (const m of this.meshes) m.visible = near;
    // a chama da lamparina tremula (a luz assada acompanha)
    const f = 1 + Math.sin(t * 9.1) * 0.025 + Math.sin(t * 23.7) * 0.02;
    this.inWoodMat.color.setScalar(f);
    this.inBarkMat.color.setScalar(f);
    this.inMiscMat.color.setScalar(f);
  }

  dispose() {
    for (const m of this.meshes) {
      this.level.scene.remove(m);
      m.geometry.dispose();
    }
    this.level.scene.remove(this.halo);
    for (const m of [this.inWoodMat, this.inBarkMat, this.inMiscMat, this.glowMat, this.signMat, this.poolMat, this.haloMat]) m.dispose();
    this.signMat.map.dispose();
    this.glowTexture.dispose();
  }
}

// Ilumina as cores dos vértices com luzes pontuais (sem sombras).
function bake(gb, lights, amb) {
  for (let i = 0; i < gb.n; i++) {
    const px = gb.pos[i * 3];
    const py = gb.pos[i * 3 + 1];
    const pz = gb.pos[i * 3 + 2];
    const nx = gb.nor[i * 3];
    const ny = gb.nor[i * 3 + 1];
    const nz = gb.nor[i * 3 + 2];
    let r = amb[0];
    let g = amb[1];
    let b = amb[2];
    for (const L of lights) {
      const dx = L.p[0] - px;
      const dy = L.p[1] - py;
      const dz = L.p[2] - pz;
      const d2 = dx * dx + dy * dy + dz * dz;
      const d = Math.sqrt(d2) || 1;
      const ndl = (nx * dx + ny * dy + nz * dz) / d;
      const w = Math.max(0, (ndl + L.wrap) / (1 + L.wrap));
      const f = (L.I * w) / (1 + d2 * L.k);
      r += L.c[0] * f;
      g += L.c[1] * f;
      b += L.c[2] * f;
    }
    gb.col[i * 3] *= r;
    gb.col[i * 3 + 1] *= g;
    gb.col[i * 3 + 2] *= b;
  }
}

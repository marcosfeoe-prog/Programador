// Nível 35 — "Um Estacionamento Vazio": uma garagem enorme de concreto, com
// luz fraca de tons quentes e algumas luzes verdes e azuis brilhando baixinho.
// Seis andares (P1 a P5 cobertos e o terraço, P6), ligados por rampas.
// Não é infinito: muros no perímetro, e além deles só um abismo escuro.
// Quase sempre sem carros. Uma única entidade: uma criatura enorme, rara,
// que surge nos cantos mais escuros e só persegue quem CORRE.
// Saída: a escada do terraço. Chegar perto dela faz o terraço se encher de
// carros sem motorista, que aceleram quando alguém passa na frente.
import * as THREE from 'three';
import { GridLevel, W, EH, EV, pushCircle } from './grid.js';
import { getTex, indoorEnvTex, textCanvasTex } from '../textures.js';
import { panelMaterial } from '../materials.js';
import { clamp, fbm, hash3, mulberry32, TAU } from '../util.js';
import { Creature } from './level35_creature.js';
import { CarRush, drawCar, carRect, CAR_COLORS } from './level35_cars.js';

const C = 4;
const H = 2.7;
const NX = 28; // células em x (112 m)
const NZ = 16; // células em z (64 m)
const XM = NX * C;
const ZM = NZ * C;
const TOP = 6; // terraço
const RISE = 1.8;
// rampas (faixa leste, x 108..112)
const RX0 = 108;
const RX1 = 112;
const UP = { z0: 0, z1: 16, zs: 4 }; // sobe de z = 16 (y 0) até z = 4 (y RISE)
const DN = { z0: 48, z1: 64, ze: 60 }; // desce de z = 48 (y 0) até z = 60 (y −RISE)
// escada (célula 0, linhas 7 e 8 — no muro oeste)
const STAIR = { ix: 0, iz0: 7, iz1: 9 };
const BANDS = [
  [0.55, 0.1, 0.08],
  [0.7, 0.32, 0.06],
  [0.72, 0.6, 0.1],
  [0.12, 0.45, 0.2],
  [0.1, 0.28, 0.6],
  [0.42, 0.16, 0.55],
];
const LINES = [0, 16, 32, 48, 64]; // linhas de pilares / fileiras de vagas (m)
const AISLES = [8, 24, 40, 56];

export class Level35 extends GridLevel {
  constructor(game) {
    super(game, {
      cell: C,
      H,
      T: 0.35,
      doorW: 1.2,
      doorH: 2.2,
      chunkCells: 8,
      seed: (game.seed ^ 0x3535) >>> 0,
      lightRadius: 11,
      lightEmitPow: 1,
      bounce: 0.5,
      ambient: 0.006,
      wallUV: [3, 3],
      floorUV: 4,
      ceilUV: 3,
    });
    this.num = 35;
    this.surface = 'concrete';
    this.panelI = 6;
    this.flickerGap = 8;
    this.flashIntensity = 20;
    this.baseSeed = this.seed;
    this.floor = 1;
    const S = this.Q.tex;
    const cw = getTex('concrete', S);
    const cf = getTex('concreteFloor', S);
    const sl = getTex('slab', S);
    const pn = getTex('panel', S);
    const gr = getTex('grime', S);
    const env = game.makeEnv(indoorEnvTex(['#2e3430', '#1a201c', '#0c100e'], '#ffd8a0', 4));
    this.env = env;
    this.mats = {
      floor: { map: cf.map, normalMap: cf.normalMap, roughnessMap: cf.roughnessMap, roughness: 1, dirtColor: new THREE.Color(0.4, 0.4, 0.38), dirtAmt: 0.6, wet: 0.3, envMap: env, envIntensity: 0.6 },
      wall: { map: cw.map, normalMap: cw.normalMap, roughness: 0.95, vertexColors: true, envMap: env, envIntensity: 0.15 },
      ceil: { map: sl.map, roughness: 1, lmIntensity: 0.45, vertexColors: true, color: 0xa8a49c },
      prop: { map: gr.map, normalMap: gr.normalMap, vertexColors: true, roughness: 0.5, metalness: 0.4, envMap: env, envIntensity: 0.7 },
      extra: { vertexColors: true, roughness: 0.85, metalness: 0 },
    };
    this.panelMat = panelMaterial(pn.map, 0xffcc88);
    // camadas compartilhadas: luzes coloridas, brilho no chão e placas
    this.glowTex = radialTex();
    this.signMat = new THREE.MeshBasicMaterial({ color: 0xb0b0b0 });
    this.upMat = new THREE.MeshBasicMaterial({ color: 0xc8c8c8 });
    this.dnMat = new THREE.MeshBasicMaterial({ color: 0xc8c8c8 });
    this.sharedLayers = {
      lgreen: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 2.2, 1.1) }),
      lblue: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 0.9, 2.4) }),
      glow: new THREE.MeshBasicMaterial({ map: this.glowTex, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
      sign: this.signMat,
      signUp: this.upMat,
      signDn: this.dnMat,
    };
    this.look = {
      exposure: 1.05,
      tint: [1.04, 0.98, 0.9],
      sat: 0.9,
      contrast: 1.1,
      lift: [0.004, 0.008, 0.008],
      bloom: 0.3,
      fog: [0.008, 0.012, 0.012],
      fogNear: 0.1,
      lightColor: [1.0, 0.8, 0.55],
      flashlight: false,
      ambience: 'level35',
      reverb: 3.2,
      sanityDrain: 0.11,
    };
    this.objectives = [
      { id: 'up', text: 'Suba até o terraço (P6) pelas rampas — você está no P1' },
      { id: 'exit', text: 'Saia pela escada do terraço' },
    ];
    this.told = {};
    this.paint = this.makePaint();
    this.makeSky();
    this.setFloor(1);
    this.spawn = { x: 10, z: (STAIR.iz0 + 1.5) * C, yaw: -Math.PI / 2 };
    this.exit = { x: STAIR.ix * C + C + 0.6, z: (STAIR.iz0 + 1.5) * C };
  }

  // ------------------------------------------------------------ andares
  setFloor(f) {
    for (const ch of [...this.chunks.values()]) this.disposeChunk(ch);
    this.building = null;
    this.edgeMemo.clear();
    this.lightMemo.clear();
    this.overrides.clear();
    this.floor = f;
    this.seed = (this.baseSeed + f * 7919) >>> 0;
    // placas com o número do andar
    for (const t of [this.signTex, this.upTex, this.dnTex]) if (t) t.dispose();
    const band = BANDS[f - 1];
    const css = (k) => `rgb(${Math.round(band[0] * 255 * k)},${Math.round(band[1] * 255 * k)},${Math.round(band[2] * 255 * k)})`;
    this.signTex = textCanvasTex(128, 128, (c, w, h) => {
      c.fillStyle = '#d8d4c8';
      c.fillRect(0, 0, w, h);
      c.fillStyle = css(1);
      c.beginPath();
      c.arc(w / 2, h / 2, 54, 0, TAU);
      c.fill();
      c.fillStyle = '#f4f0e4';
      c.font = 'bold 54px Arial, Helvetica, sans-serif';
      c.textAlign = 'center';
      c.textBaseline = 'middle';
      c.fillText(f === TOP ? 'P6' : `P${f}`, w / 2, h / 2 + 3);
    });
    const arrowSign = (txt) =>
      textCanvasTex(256, 96, (c, w, h) => {
        c.fillStyle = '#0e1a16';
        c.fillRect(0, 0, w, h);
        c.strokeStyle = css(1.2);
        c.lineWidth = 6;
        c.strokeRect(4, 4, w - 8, h - 8);
        c.fillStyle = '#e8f4e8';
        c.font = 'bold 38px Arial, Helvetica, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(txt, w / 2, h / 2 + 2);
      });
    this.upTex = arrowSign(f === TOP ? 'SAÍDA · ESCADA' : `SUBIDA ↑ P${f + 1}`);
    this.dnTex = arrowSign(`DESCIDA ↓ P${f - 1}`);
    this.signMat.map = this.signTex;
    this.upMat.map = this.upTex;
    this.dnMat.map = this.dnTex;
    for (const m of [this.signMat, this.upMat, this.dnMat]) m.needsUpdate = true;
    // carros estacionados (raros) — só nos andares cobertos
    const rnd = mulberry32(this.seed * 3 + 1);
    this.parked = [];
    const spots = this.stallSpots();
    const n = f === TOP ? 0 : rnd() < 0.5 ? 1 : 2;
    for (let k = 0; k < n; k++) {
      const s = spots[Math.floor(rnd() * spots.length)];
      if (Math.abs(s.x - 10) < 8 && Math.abs(s.z - 32) < 8) continue;
      this.parked.push({ ...s, color: CAR_COLORS[Math.floor(rnd() * CAR_COLORS.length)], used: false, effect: Math.floor(rnd() * 5) });
    }
    if (this.sky) this.sky.visible = f === TOP;
    if (this.rush) {
      this.rush.dispose();
      this.rush = null;
    }
    if (f === TOP) this.rush = new CarRush(this, this.roofLanes(), this.roofParked());
    if (this.creature) this.creature.reset(35);
  }

  // Vagas (centro do carro, yaw) de todas as fileiras.
  stallSpots() {
    const out = [];
    for (const Lz of LINES)
      for (const s of [-1, 1]) {
        if ((Lz === 0 && s < 0) || (Lz === ZM && s > 0)) continue;
        for (let x = 8 + 1.3; x < 104 - 1.3; x += 2.6) out.push({ x, z: Lz + s * 3.0, yaw: s > 0 ? Math.PI / 2 : -Math.PI / 2 });
      }
    return out;
  }

  roofParked() {
    const rnd = mulberry32(this.seed + 99);
    const spots = this.stallSpots().filter((s) => !(s.x < 16 && Math.abs(s.z - 34) < 10));
    const out = [];
    for (let k = 0; k < 22; k++) out.push(spots.splice(Math.floor(rnd() * spots.length), 1)[0]);
    return out;
  }

  // Faixas dos carros no terraço: corredores ao longo de x e as transversais.
  roofLanes() {
    const lanes = [];
    for (const [i, z] of AISLES.entries()) {
      const dir = i % 2 ? -1 : 1;
      lanes.push({ x0: dir > 0 ? 2 : 104, z0: z + dir * 1.4, dx: dir, dz: 0, len: 102 });
    }
    lanes.push({ x0: 6.6, z0: 2, dx: 0, dz: 1, len: 60 });
    lanes.push({ x0: 106, z0: 62, dx: 0, dz: -1, len: 60 });
    lanes.push({ x0: 104, z0: AISLES[2] - 1.4, dx: -1, dz: 0, len: 102 });
    return lanes;
  }

  inside(x, z, m = 0) {
    return x > m && x < XM - m && z > m && z < ZM - m && !(x > RX0 - m && ((z < UP.z1 + m && this.floor < TOP) || (z > DN.z0 - m && this.floor > 1)));
  }

  inCell(ix, iz) {
    return ix >= 0 && ix < NX && iz >= 0 && iz < NZ;
  }

  hasUp() {
    return this.floor < TOP;
  }

  hasDown() {
    return this.floor > 1;
  }

  // Células das rampas (faixa leste).
  upCell(ix, iz) {
    return this.hasUp() && ix === NX - 1 && iz >= 0 && iz < 4;
  }

  dnCell(ix, iz) {
    return this.hasDown() && ix === NX - 1 && iz >= 12 && iz < 16;
  }

  stairCell(ix, iz) {
    return ix === STAIR.ix && iz >= STAIR.iz0 && iz < STAIR.iz1;
  }

  // ------------------------------------------------------------ planta
  makePieces() {
    super.makePieces();
    const c = this.cell;
    // muro do perímetro com vão: parapeito baixo e viga em cima
    this.pieces[W.WINDOW] = [
      { a0: 0, a1: c, y0: 0, y1: 1.1 },
      { a0: 0, a1: c, y0: 2.25, y1: this.H },
    ];
  }

  genEdge(kind, ix, iz) {
    const bx = kind === EH ? ix : ix - 1;
    const bz = kind === EH ? iz - 1 : iz;
    const ia = this.inCell(ix, iz);
    const ib = this.inCell(bx, bz);
    if (!ia && !ib) return W.NONE;
    if (ia !== ib) {
      // perímetro
      if (this.upCell(ix, iz) || this.upCell(bx, bz) || this.dnCell(ix, iz) || this.dnCell(bx, bz)) return W.FULL;
      if (this.stairCell(ix, iz) || this.stairCell(bx, bz)) return W.FULL;
      return hash3(ix * 3 + kind, iz, this.baseSeed + 4) < 0.3 ? W.FULL : W.WINDOW;
    }
    // escada
    const sa = this.stairCell(ix, iz);
    const sb = this.stairCell(bx, bz);
    if (sa !== sb) return kind === EV && iz === STAIR.iz0 + 1 ? W.EXIT : W.FULL;
    // rampas: paredes laterais
    const ra = this.upCell(ix, iz) || this.dnCell(ix, iz);
    const rb = this.upCell(bx, bz) || this.dnCell(bx, bz);
    if (ra !== rb && kind === EV) return W.FULL;
    return W.NONE;
  }

  pillar(gx, gz) {
    if (this.floor === TOP) return 0;
    if (gx < 2 || gx > NX - 2 || gx % 2) return 0;
    if (gz !== 4 && gz !== 8 && gz !== 12) return 0;
    return 0.7;
  }

  dark(cx, cz) {
    if (Math.abs(cx * C - 12) < 14 && Math.abs(cz * C - 32) < 12) return false;
    if (cx >= NX - 2 && (cz < 5 || cz > 11)) return false;
    return fbm(cx * 0.16 + 30, cz * 0.16, 3, this.seed + 8) < -0.06;
  }

  genLight(cx, cz) {
    if (!this.inCell(cx, cz) || this.stairCell(cx, cz)) return null;
    const h = this.hashCell(cx, cz, 3);
    if (this.floor === TOP) {
      // luminária sobre a porta da escada
      if (cx === 1 && cz === STAIR.iz0 + 1) return { x: C + 0.45, z: (STAIR.iz0 + 1.5) * C, y: 2.45, ax: 1, len: 0.5, wid: 0.12, I: 9, group: 0, door: true };
      // postes no terraço
      if (cx % 4 !== 2 || (cz !== 4 && cz !== 12) || cx >= NX - 1) return null;
      const group = this.dark(cx, cz) ? (h < 0.6 ? 3 : 1) : h < 0.12 ? 1 : 0;
      return { x: cx * C, z: cz * C, y: 5.2, ax: 0, len: 0.6, wid: 0.3, I: 34, group, post: true };
    }
    // lampiões dentro das rampas (presos na parede leste)
    if (this.upCell(cx, cz) || this.dnCell(cx, cz)) {
      if (cz % 2) return null;
      const z = cz * C + 2;
      return { x: 111.4, z, y: 2.3, ax: 1, len: 0.5, wid: 0.12, I: 5, group: 0, ramp: true };
    }
    // luz na boca das rampas
    if (cx === NX - 1 && ((cz === 4 && this.hasUp()) || (cz === 11 && this.hasDown()))) return { x: 110, z: cz === 4 ? 17.6 : 46.4, y: H - 0.02, ax: 0, len: 1.3, wid: 0.18, I: 8, group: 0, color: 'w' };
    let x;
    let z;
    if ([2, 6, 10, 14].includes(cz) && cx % 2 === 0) {
      x = cx * C + 2;
      z = cz * C;
    } else if ([4, 8, 12].includes(cz) && cx % 2 === 1 && cx > 1 && cx < NX - 2) {
      x = cx * C;
      z = cz * C;
    } else if ((cz === 0 || cz === NZ - 1) && cx % 2 === 1 && cx > 1 && cx < NX - 2) {
      x = cx * C;
      z = cz === 0 ? 2.6 : ZM - 2.6;
    } else return null;
    const tint = this.hashCell(cx, cz, 7);
    const color = tint < 0.13 ? 'g' : tint < 0.25 ? 'b' : 'w';
    if (color !== 'w') return { x, z, y: H - 0.02, ax: 0, len: 1.3, wid: 0.18, I: 0, group: 3, color };
    let group;
    if (this.dark(cx, cz)) group = h < 0.85 ? 3 : 1;
    else group = h < 0.06 ? 3 : h < 0.13 ? 1 : h < 0.19 ? 2 : 0;
    return { x, z, y: H - 0.02, ax: 0, len: 1.3, wid: 0.18, I: 7, group, color };
  }

  buildLight(G, L) {
    if (L.post) {
      G.prop.cylinder(L.x, L.y / 2, L.z, 0.08, L.y, [0.25, 0.26, 0.26], G.lm, { sides: 8 });
      G.prop.box(L.x, L.y + 0.08, L.z, 0.9, 0.12, 0.4, [0.22, 0.22, 0.22], G.lm, {});
      const y = L.y + 0.015;
      G.panel.quad([[L.x - 0.35, y, L.z - 0.15], [L.x + 0.35, y, L.z - 0.15], [L.x + 0.35, y, L.z + 0.15], [L.x - 0.35, y, L.z + 0.15]], [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1], null, null, L.group);
      return;
    }
    if (L.door) {
      G.prop.box(C + 0.24, L.y, L.z, 0.14, 0.16, 0.6, [0.25, 0.25, 0.24], G.lm, { ao: 0 });
      G.panel.box(C + 0.32, L.y - 0.07, L.z, 0.08, 0.04, 0.5, [1, 1, 1], null, { group: L.group });
      return;
    }
    if (L.ramp) {
      const y = this.groundY(L.x, L.z) + 2.1;
      G.prop.box(RX1 - 0.25, y, L.z, 0.12, 0.2, 0.7, [0.25, 0.25, 0.24], G.lm, { ao: 0 });
      G.panel.box(RX1 - 0.33, y - 0.02, L.z, 0.05, 0.1, 0.55, [1, 1, 1], null, { group: L.group });
      return;
    }
    // calha da luminária
    G.prop.box(L.x, H - 0.06, L.z, L.len + 0.12, 0.1, L.wid + 0.1, [0.32, 0.32, 0.3], G.lm, { ao: 0 });
    const y = H - 0.115;
    const pts = [
      [L.x - L.len / 2, y, L.z - L.wid / 2],
      [L.x + L.len / 2, y, L.z - L.wid / 2],
      [L.x + L.len / 2, y, L.z + L.wid / 2],
      [L.x - L.len / 2, y, L.z + L.wid / 2],
    ];
    if (L.color === 'w') {
      G.panel.quad(pts, [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1], null, null, L.group);
      return;
    }
    const layer = L.color === 'g' ? G.lgreen : G.lblue;
    layer.quad(pts, [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1], null, null);
    // brilho fraco colorido no chão e no teto
    const col = L.color === 'g' ? [0.04, 0.3, 0.17] : [0.04, 0.13, 0.36];
    const r = 4.2;
    G.glow.quad([[L.x - r, 0.015, L.z + r], [L.x + r, 0.015, L.z + r], [L.x + r, 0.015, L.z - r], [L.x - r, 0.015, L.z - r]], [0, 1, 0], [0, 1, 1, 1, 1, 0, 0, 0], null, [col, col, col, col]);
    const c2 = [col[0] * 1.6, col[1] * 1.6, col[2] * 1.6];
    const r2 = 1.6;
    G.glow.quad([[L.x - r2, H - 0.01, L.z - r2], [L.x + r2, H - 0.01, L.z - r2], [L.x + r2, H - 0.01, L.z + r2], [L.x - r2, H - 0.01, L.z + r2]], [0, -1, 0], [0, 0, 1, 0, 1, 1, 0, 1], null, [c2, c2, c2, c2]);
  }

  dirt(x, z) {
    const n = fbm(x * 0.09, z * 0.09, 3, this.baseSeed + 11);
    return clamp((n + 0.05) / 0.35, 0, 1);
  }

  // Faixas pintadas: concreto, barra da cor do andar embaixo e um friso branco.
  wallRows(y0, y1) {
    const rows = [y0];
    for (const y of [0.04, 0.3, 1.0, 1.1, 2.0, this.H - 0.15]) if (y > y0 + 0.01 && y < y1 - 0.01) rows.push(y);
    rows.push(y1);
    return rows;
  }

  vface(gb, ax, az, bx, bz, y0, y1, n, uA, uB, lmFn) {
    const rows = this.wallRows(y0, y1);
    const vr = this.wallUV[1];
    const off = 0.25;
    const la = lmFn(ax + n[0] * off, az + n[2] * off);
    const lb = lmFn(bx + n[0] * off, bz + n[2] * off);
    const band = BANDS[this.floor - 1];
    for (let r = 0; r < rows.length - 1; r++) {
      const ya = rows[r];
      const yb = rows[r + 1];
      const mid = (ya + yb) / 2;
      const base = mid < 1.0 ? band : mid < 1.1 ? [0.86, 0.84, 0.78] : [0.66, 0.66, 0.63];
      const ka = this.wallShade(ya);
      const kb = this.wallShade(yb);
      const ca = [base[0] * ka, base[1] * ka, base[2] * ka];
      const cb = [base[0] * kb, base[1] * kb, base[2] * kb];
      gb.quad(
        [
          [ax, ya, az],
          [bx, ya, bz],
          [bx, yb, bz],
          [ax, yb, az],
        ],
        n,
        [uA, ya / vr, uB, ya / vr, uB, yb / vr, uA, yb / vr],
        [la[0], la[1], lb[0], lb[1], lb[0], lb[1], la[0], la[1]],
        [ca, ca, cb, cb],
      );
    }
  }

  // Pilar com o número do andar pintado nas quatro faces.
  buildPillar(G, x, z, size) {
    super.buildPillar(G, x, z, size);
    const h = size / 2 + 0.006;
    const s = 0.28;
    const y0 = 1.45;
    const y1 = 2.01;
    const uv = [0, 0, 1, 0, 1, 1, 0, 1];
    G.sign.quad([[x - s, y0, z + h], [x + s, y0, z + h], [x + s, y1, z + h], [x - s, y1, z + h]], [0, 0, 1], uv, null, null);
    G.sign.quad([[x + s, y0, z - h], [x - s, y0, z - h], [x - s, y1, z - h], [x + s, y1, z - h]], [0, 0, -1], uv, null, null);
    G.sign.quad([[x + h, y0, z + s], [x + h, y0, z - s], [x + h, y1, z - s], [x + h, y1, z + s]], [1, 0, 0], uv, null, null);
    G.sign.quad([[x - h, y0, z - s], [x - h, y0, z + s], [x - h, y1, z + s], [x - h, y1, z - s]], [-1, 0, 0], uv, null, null);
  }

  // Pintura do piso: divisórias das vagas, faixa amarela tracejada, batentes.
  makePaint() {
    const lines = [];
    const stops = [];
    const W2 = [0.66, 0.66, 0.6];
    const Y = [0.62, 0.5, 0.12];
    for (const Lz of LINES)
      for (const s of [-1, 1]) {
        if ((Lz === 0 && s < 0) || (Lz === ZM && s > 0)) continue;
        for (let x = 8; x <= 104.01; x += 2.6) {
          const za = Lz + s * 0.5;
          const zb = Lz + s * 5;
          lines.push({ x0: x - 0.06, x1: x + 0.06, z0: Math.min(za, zb), z1: Math.max(za, zb), col: W2 });
        }
        lines.push({ x0: 8, x1: 104, z0: Lz + s * 5 - 0.06, z1: Lz + s * 5 + 0.06, col: W2 });
        for (let x = 8 + 1.3; x < 104; x += 2.6) stops.push({ x, z: Lz + s * 0.62 });
      }
    for (const z of AISLES) for (let x = 10; x < 102; x += 3) lines.push({ x0: x, x1: x + 1.5, z0: z - 0.07, z1: z + 0.07, col: Y });
    // faixa amarela de "não estacione" na frente da escada e das rampas
    for (let k = 0; k < 6; k++) lines.push({ x0: 4.4, x1: 7.4, z0: 29 + k * 1.1, z1: 29.4 + k * 1.1, col: Y });
    return { lines, stops };
  }

  genProps(ch, cx0, cz0) {
    const x0 = ch.x0;
    const z0 = ch.z0;
    const x1 = x0 + this.S;
    const z1 = z0 + this.S;
    const inC = (x, z) => x >= x0 && x < x1 && z >= z0 && z < z1;
    const myLines = this.paint.lines.filter((l) => inC((l.x0 + l.x1) / 2, (l.z0 + l.z1) / 2));
    const myStops = this.floor === TOP ? [] : this.paint.stops.filter((s) => inC(s.x, s.z));
    ch.props.push({
      draw: (G) => {
        for (const l of myLines) {
          const pts = [
            [l.x0, 0.008, l.z1],
            [l.x1, 0.008, l.z1],
            [l.x1, 0.008, l.z0],
            [l.x0, 0.008, l.z0],
          ];
          const lm = [];
          for (const p of pts) lm.push(...G.lm(p[0], p[2]));
          G.extra.quad(pts, [0, 1, 0], [0, 1, 1, 1, 1, 0, 0, 0], lm, [l.col, l.col, l.col, l.col]);
        }
        for (const s of myStops) G.prop.box(s.x, 0.07, s.z, 1.5, 0.14, 0.18, [0.5, 0.5, 0.47], G.lm, {});
      },
    });
    // carros estacionados (raros)
    for (const p of this.parked) {
      if (!inC(p.x, p.z)) continue;
      ch.props.push({ ao: [...carRect(p.x, p.z, p.yaw), 0.15], draw: (G) => drawCar(G.prop, p.x, p.z, p.yaw, p.color, G.lm) });
      ch.colliders.push(carRect(p.x, p.z, p.yaw, 0.05));
    }
    // cones, itens e bilhetes
    const N = this.chunkCells;
    for (let z = cz0; z < cz0 + N; z++)
      for (let x = cx0; x < cx0 + N; x++) {
        if (!this.inCell(x, z) || this.stairCell(x, z) || this.upCell(x, z) || this.dnCell(x, z)) continue;
        const h = this.hashCell(x, z, 51);
        const px = x * C + 1 + this.hashCell(x, z, 52) * 2;
        const pz = z * C + 1 + this.hashCell(x, z, 53) * 2;
        if (h > 0.992) ch.items.push({ type: 'water', key: `35:${this.floor}:${x}:${z}:w`, x: px, z: pz });
        else if (h > 0.98) ch.items.push({ type: 'note', key: `35:${this.floor}:${x}:${z}:n`, x: px, z: pz, rot: h * 40 });
        else if (h < 0.035) {
          ch.props.push({
            draw: (G) => {
              G.prop.box(px, 0.02, pz, 0.42, 0.04, 0.42, [0.12, 0.12, 0.12], G.lm, {});
              G.prop.cylinder(px, 0.38, pz, 0.17, 0.7, [0.85, 0.32, 0.06], G.lm, { sides: 10, r2: 0.03 });
              G.prop.cylinder(px, 0.42, pz, 0.112, 0.12, [0.85, 0.85, 0.8], G.lm, { sides: 10, r2: 0.09, caps: false });
            },
          });
        }
      }
  }

  // Piso e teto com os buracos das rampas; no terraço, só a casinha da escada tem teto.
  buildFloorCeil(G, ch) {
    const cut = (rects, h) => {
      const out = [];
      for (const q of rects) {
        if (h.x1 <= q.x0 || h.x0 >= q.x1 || h.z1 <= q.z0 || h.z0 >= q.z1) {
          out.push(q);
          continue;
        }
        if (h.z0 > q.z0) out.push({ x0: q.x0, x1: q.x1, z0: q.z0, z1: h.z0 });
        if (h.z1 < q.z1) out.push({ x0: q.x0, x1: q.x1, z0: h.z1, z1: q.z1 });
        const za = Math.max(q.z0, h.z0);
        const zb = Math.min(q.z1, h.z1);
        if (h.x0 > q.x0) out.push({ x0: q.x0, x1: h.x0, z0: za, z1: zb });
        if (h.x1 < q.x1) out.push({ x0: h.x1, x1: q.x1, z0: za, z1: zb });
      }
      return out;
    };
    const area = {
      x0: Math.max(0, ch.x0),
      x1: Math.min(XM, ch.x0 + this.S),
      z0: Math.max(0, ch.z0),
      z1: Math.min(ZM, ch.z0 + this.S),
    };
    if (area.x1 <= area.x0 || area.z1 <= area.z0) return;
    let fl = [area];
    if (this.hasDown()) fl = cut(fl, { x0: RX0, x1: RX1, z0: DN.z0, z1: DN.z1 });
    for (const r of fl) this.hface(G.floor, r.x0, r.x1, r.z0, r.z1, 0, true, G.lm, this.floorUV);
    if (this.floor < TOP) {
      let ce = [area];
      if (this.hasUp()) ce = cut(ce, { x0: RX0, x1: RX1, z0: UP.z0, z1: UP.z1 });
      for (const r of ce) this.hface(G.ceil, r.x0, r.x1, r.z0, r.z1, H, false, G.lm, this.ceilUV);
    } else {
      const s = { x0: STAIR.ix * C, x1: (STAIR.ix + 1) * C, z0: STAIR.iz0 * C, z1: STAIR.iz1 * C };
      if (s.x0 >= area.x0 && s.x0 < area.x1 && s.z0 >= area.z0 && s.z0 < area.z1) {
        this.hface(G.ceil, s.x0, s.x1, s.z0, s.z1, H, false, G.lm, this.ceilUV);
        G.prop.box((s.x0 + s.x1) / 2, H + 0.1, (s.z0 + s.z1) / 2, s.x1 - s.x0 + 0.5, 0.2, s.z1 - s.z0 + 0.5, [0.5, 0.5, 0.48], G.lm, {});
      }
    }
  }

  // Quadrilátero com a frente voltada para n (acerta a ordem dos vértices).
  fq(gb, pts, n, col, lmFn) {
    const a = pts[0];
    const b = pts[1];
    const c = pts[2];
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    const cx = uy * vz - uz * vy;
    const cy = uz * vx - ux * vz;
    const cz = ux * vy - uy * vx;
    const q = cx * n[0] + cy * n[1] + cz * n[2] < 0 ? [pts[1], pts[0], pts[3], pts[2]] : pts;
    const lm = [];
    for (const p of q) lm.push(...lmFn(p[0] + n[0] * 0.3, p[2] + n[2] * 0.3));
    const uv = [];
    for (const p of q) uv.push((n[0] !== 0 ? p[2] : p[0]) / 3, p[1] / 3);
    gb.quad(q, n, uv, lm, [col, col, col, col]);
  }

  // Rampas: piso inclinado, teto inclinado e paredes acima/abaixo da grade.
  buildExtra(G, ch) {
    const inChunk = (x, z) => x >= ch.x0 && x < ch.x0 + this.S && z >= ch.z0 && z < ch.z0 + this.S;
    const hT = this.T / 2;
    const wc = [0.6, 0.6, 0.57];
    const xa = RX0 + hT;
    const xb = RX1 - hT;
    if (this.hasUp() && inChunk(110, 8)) {
      const zs = UP.zs;
      const z1 = UP.z1;
      this.fq(G.floor, [[RX0, 0, z1], [RX1, 0, z1], [RX1, RISE, zs], [RX0, RISE, zs]], norm(0, 12, RISE), [1, 1, 1], G.lm);
      this.fq(G.floor, [[RX0, RISE, zs], [RX1, RISE, zs], [RX1, RISE, 0], [RX0, RISE, 0]], [0, 1, 0], [1, 1, 1], G.lm);
      this.fq(G.ceil, [[RX0, H, z1], [RX1, H, z1], [RX1, H + RISE, zs], [RX0, H + RISE, zs]], norm(0, -12, -RISE), [0.8, 0.8, 0.8], G.lm);
      this.fq(G.ceil, [[RX0, H + RISE, zs], [RX1, H + RISE, zs], [RX1, H + RISE, 0], [RX0, H + RISE, 0]], [0, -1, 0], [0.8, 0.8, 0.8], G.lm);
      this.fq(G.wall, [[xa, H, z1], [xa, H, 0], [xa, H + RISE, 0], [xa, H + RISE, zs]], [1, 0, 0], wc, G.lm);
      this.fq(G.wall, [[xb, H, z1], [xb, H, 0], [xb, H + RISE, 0], [xb, H + RISE, zs]], [-1, 0, 0], wc, G.lm);
      this.fq(G.wall, [[RX0, H, hT], [RX1, H, hT], [RX1, H + RISE, hT], [RX0, H + RISE, hT]], [0, 0, 1], wc, G.lm);
      // borda lateral da rampa (meio-fio)
      for (const x of [RX0 + 0.25, RX1 - 0.25]) G.prop.box(x, 0.08, (zs + z1) / 2, 0.15, 0.16, z1 - zs, [0.7, 0.62, 0.15], G.lm, {});
      G.signUp.quad([[109, 2.05, z1 + 0.02], [111, 2.05, z1 + 0.02], [111, 2.55, z1 + 0.02], [109, 2.55, z1 + 0.02]], [0, 0, 1], [0, 0, 1, 0, 1, 1, 0, 1], null, null);
    }
    if (this.hasDown() && inChunk(110, 56)) {
      const z0 = DN.z0;
      const ze = DN.ze;
      this.fq(G.floor, [[RX0, 0, z0], [RX1, 0, z0], [RX1, -RISE, ze], [RX0, -RISE, ze]], norm(0, 12, RISE), [1, 1, 1], G.lm);
      this.fq(G.floor, [[RX0, -RISE, ze], [RX1, -RISE, ze], [RX1, -RISE, ZM], [RX0, -RISE, ZM]], [0, 1, 0], [1, 1, 1], G.lm);
      this.fq(G.wall, [[xa, 0, z0], [xa, -RISE, ze], [xa, -RISE, ZM], [xa, 0, ZM]], [1, 0, 0], wc, G.lm);
      this.fq(G.wall, [[xb, 0, z0], [xb, -RISE, ze], [xb, -RISE, ZM], [xb, 0, ZM]], [-1, 0, 0], wc, G.lm);
      this.fq(G.wall, [[RX0, -RISE, ZM - hT], [RX1, -RISE, ZM - hT], [RX1, 0, ZM - hT], [RX0, 0, ZM - hT]], [0, 0, -1], wc, G.lm);
      for (const x of [RX0 + 0.25, RX1 - 0.25]) G.prop.box(x, 0.08, z0 - 0.3, 0.15, 0.16, 0.6, [0.7, 0.62, 0.15], G.lm, {});
      G.signDn.quad([[111, 2.05, z0 - 0.02], [109, 2.05, z0 - 0.02], [109, 2.55, z0 - 0.02], [111, 2.55, z0 - 0.02]], [0, 0, -1], [0, 0, 1, 0, 1, 1, 0, 1], null, null);
    }
    // porta da escada (na parede leste da casinha)
    const dx = (STAIR.ix + 1) * C + hT + 0.02;
    const dz = (STAIR.iz0 + 1.5) * C;
    if (inChunk(dx, dz)) {
      G.prop.box(dx + 0.03, 1.05, dz, 0.06, 2.1, 1.1, this.floor === TOP ? [0.2, 0.42, 0.24] : [0.42, 0.42, 0.4], G.lm, {});
      G.prop.box(dx + 0.08, 1.0, dz - 0.38, 0.06, 0.05, 0.16, [0.15, 0.15, 0.15], G.lm, { ao: 0 });
      if (this.floor === TOP) G.signUp.quad([[dx + 0.07, 2.2, dz + 0.55], [dx + 0.07, 2.2, dz - 0.55], [dx + 0.07, 2.62, dz - 0.55], [dx + 0.07, 2.62, dz + 0.55]], [1, 0, 0], [0, 0, 1, 0, 1, 1, 0, 1], null, null);
      else G.sign.quad([[dx + 0.07, 2.25, dz + 0.3], [dx + 0.07, 2.25, dz - 0.3], [dx + 0.07, 2.65, dz - 0.3], [dx + 0.07, 2.65, dz + 0.3]], [1, 0, 0], [0, 0, 1, 0, 1, 1, 0, 1], null, null);
    }
  }

  // ------------------------------------------------------------ céu do terraço
  makeSky() {
    const fog = new THREE.Color(...this.look.fog);
    this.skyMat = new THREE.ShaderMaterial({
      uniforms: { uFog: { value: fog } },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = normalize(position);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uFog;
        varying vec3 vDir;
        float h(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        void main() {
          vec3 d = normalize(vDir);
          float y = d.y;
          vec3 c = mix(vec3(0.02, 0.05, 0.06), vec3(0.004, 0.01, 0.016), smoothstep(0.0, 0.7, y));
          vec2 g = floor(d.xz / max(y, 0.05) * 90.0);
          float s = step(0.9965, h(g)) * smoothstep(0.15, 0.5, y);
          c += vec3(0.5, 0.55, 0.6) * s;
          gl_FragColor = vec4(mix(uFog, c, smoothstep(0.0, 0.18, y)), 1.0);
        }`,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      fog: false,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), this.skyMat);
    this.sky.renderOrder = -100;
    this.sky.frustumCulled = false;
    this.sky.visible = false;
    this.scene.add(this.sky);
  }

  // ------------------------------------------------------------ chão
  groundY(x, z) {
    if (x < RX0 || x > RX1) return 0;
    if (this.hasUp() && z < UP.z1) return z <= UP.zs ? RISE : ((UP.z1 - z) / (UP.z1 - UP.zs)) * RISE;
    if (this.hasDown() && z > DN.z0) return z >= DN.ze ? -RISE : (-(z - DN.z0) / (DN.ze - DN.z0)) * RISE;
    return 0;
  }

  floorOf() {
    return this.floor;
  }

  carFace() {
    if (this.carURL) return this.carURL;
    const cv = document.createElement('canvas');
    cv.width = cv.height = 256;
    const c = cv.getContext('2d');
    c.fillStyle = '#000';
    c.fillRect(0, 0, 256, 256);
    for (const x of [70, 186]) {
      const g = c.createRadialGradient(x, 128, 0, x, 128, 70);
      g.addColorStop(0, 'rgba(255,255,240,1)');
      g.addColorStop(0.3, 'rgba(255,240,200,0.7)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(0, 0, 256, 256);
    }
    this.carURL = cv.toDataURL();
    return this.carURL;
  }

  // ------------------------------------------------------------ quadro
  tick(dt, player) {
    const g = this.game;
    const p = player.pos;
    this.time = (this.time || 0) + dt;
    if (this.sky.visible) this.sky.position.copy(g.camera.position);
    if (!this.creature) this.creature = new Creature(this);
    if (this.climbing) return;
    const fear = this.creature.update(dt, player, this.floor < TOP && !g.transitioning);
    let carFear = 0;
    if (this.rush) {
      if (!this.rush.active && Math.hypot(p.x - this.exit.x, p.z - this.exit.z) < 72) {
        this.rush.start();
        g.hud.message('Faróis acendem por todo o terraço. Motores roncam sem ninguém dentro. Corra até a escada — e não passe na frente deles!', 6);
      }
      carFear = this.rush.update(dt, player);
    }
    g.st.fear = Math.max(g.st.fear || 0, fear, carFear);
    this.sanityExtra = fear * 0.6 + carFear * 0.3;
    // rampas
    const y = this.groundY(p.x, p.z);
    if (y > RISE * 0.72 && this.hasUp()) this.changeFloor(this.floor + 1);
    else if (y < -RISE * 0.72 && this.hasDown()) this.changeFloor(this.floor - 1);
    if (!this.told.start && this.time > 4) {
      this.told.start = true;
      g.hud.message('Concreto, óleo velho e silêncio. Uma regra que todo mundo repete: aqui, nunca corra.', 5);
    }
  }

  async changeFloor(to) {
    const g = this.game;
    if (this.climbing || g.transitioning) return;
    this.climbing = true;
    g.player.frozen = true;
    g.fadeTarget = 1;
    g.audio.play(g.audio.B.step.concrete, { gain: 0.3, rate: 0.8 });
    await new Promise((r) => setTimeout(r, 850));
    if (g.level !== this) return;
    const up = to > this.floor;
    this.setFloor(to);
    const S = up ? { x: 110, z: DN.z0 - 2, yaw: 0 } : { x: 110, z: UP.z1 + 2, yaw: Math.PI };
    await this.preload(S.x, S.z);
    if (g.level !== this) return;
    this.spawn = S;
    g.player.pos.set(S.x, 0, S.z);
    g.player.yaw = S.yaw;
    g.player.vel.set(0, 0, 0);
    g.fadeTarget = 0;
    g.player.frozen = false;
    this.climbing = false;
    if (to === TOP) {
      g.completeObjective('up', 'O terraço. Céu preto, sem lua. A escada de saída fica do outro lado, no muro oeste.');
    } else {
      g.setObjectiveText('up', `Suba até o terraço (P6) pelas rampas — você está no P${to}`);
      g.hud.message(`Andar P${to}.`, 2.5);
    }
  }

  collide(p, r) {
    super.collide(p, r);
    // meio-fio das rampas e carros que surgiram no terraço
    if (this.rush) for (const b of this.rush.colliders()) if (p.x > b[0] - 2 && p.x < b[1] + 2 && p.z > b[2] - 2 && p.z < b[3] + 2) pushCircle(p, r, b[0], b[1], b[2], b[3]);
    // não sai pelos lados abertos da garagem (fora da grade)
    p.x = clamp(p.x, r, XM - r);
    p.z = clamp(p.z, r, ZM - r);
    return p;
  }

  interactable(player) {
    const p = player.pos;
    const g = this.game;
    if (this.climbing) return null;
    const door = { x: (STAIR.ix + 1) * C + 0.7, z: (STAIR.iz0 + 1.5) * C };
    if (Math.hypot(p.x - door.x, p.z - door.z) < 1.4) {
      if (this.floor === TOP)
        return {
          label: 'Sair pela escada',
          action: () => {
            g.completeObjective('exit', 'A porta da escada cede. Degraus de concreto descem para uma luz branca e fria.');
            g.reachExit('door', 0.8);
          },
        };
      return {
        label: 'Abrir a porta da escada',
        action: () => {
          g.audio.play('door', { gain: 0.4, rate: 0.7 });
          g.hud.message('A porta abre para… uma parede de concreto liso. Não há escada aqui. Só a do terraço deve ser de verdade.', 4.5);
        },
      };
    }
    for (const c of this.parked) {
      if (Math.hypot(p.x - c.x, p.z - c.z) > 3.2) continue;
      if (c.used) return { label: 'Carro vazio', action: () => g.hud.message('Você já mexeu neste carro. Melhor não abusar da sorte.', 3) };
      return { label: 'Entrar no carro', action: () => this.useCar(c) };
    }
    return null;
  }

  // Entrar num carro tem efeitos variados.
  useCar(c) {
    const g = this.game;
    c.used = true;
    g.audio.play('door', { gain: 0.45, rate: 1.1 });
    const e = c.effect;
    if (e === 0) {
      g.audio.play('radio', { gain: 0.35, rate: 0.9 });
      g.addSanity(20);
      g.hud.message('O rádio liga sozinho: uma música antiga e abafada. Por um minuto você se sente em casa. (+Sanidade)', 5);
    } else if (e === 1) {
      if (g.inventory.add('agua')) g.hud.message('No porta-luvas: uma garrafa de Água de Amêndoa, ainda gelada. Guardada na mochila.', 4.5);
      else {
        g.addSanity(30);
        g.hud.message('No porta-luvas: Água de Amêndoa. A mochila está cheia; você bebe ali mesmo. (+Sanidade)', 4.5);
      }
      g.audio.click();
    } else if (e === 2) {
      g.audio.play('alarm', { gain: 0.5, rate: 0.6 });
      g.hud.message('A buzina dispara sozinha e não para! Lá no escuro, algo enorme se mexeu.', 4.5);
      if (this.creature && this.floor < TOP) this.creature.spawn(g.player, true);
    } else if (e === 3) {
      g.audio.play('breath', { gain: 0.4, rate: 0.6 });
      g.addSanity(-12);
      g.damage = Math.max(g.damage, 0.5);
      g.hud.message('O banco de trás está molhado e frio. Do porta-malas vem o som de alguém respirando. (−Sanidade)', 5);
    } else {
      g.hud.message('A chave está na ignição. O painel pisca um número de andar… você pisca junto.', 3.5);
      const options = [1, 2, 3, 4, 5].filter((f) => f !== this.floor);
      const to = options[Math.floor(Math.random() * options.length)];
      setTimeout(() => g.level === this && this.changeFloor(to), 1200);
    }
  }

  navTarget() {
    return this.floor < TOP ? { x: 110, z: UP.z1 + 1 } : this.exit;
  }

  exitEmitter() {
    return { x: 110, y: 1.5, z: 10, sound: 'wind', gain: 0.25 };
  }

  dispose() {
    if (this.creature) this.creature.dispose();
    if (this.rush) this.rush.dispose();
    this.scene.remove(this.sky);
    this.sky.geometry.dispose();
    this.skyMat.dispose();
    for (const t of [this.signTex, this.upTex, this.dnTex, this.glowTex]) if (t) t.dispose();
    for (const m of Object.values(this.sharedLayers)) m.dispose();
    this.panelMat.dispose();
    super.dispose();
  }
}

function norm(x, y, z) {
  const l = Math.hypot(x, y, z);
  return [x / l, y / l, z / l];
}

function radialTex() {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const c = cv.getContext('2d');
  const g = c.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.fillStyle = g;
  c.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Nível 15 — "Os Salões Futuristas": corredores brancos de teto curvo,
// tubulação no alto, piso polido que reflete as faixas de luz, trechos
// completamente apagados e salas de máquinas atrás de vidro grosso e portas
// de metal reforçado. Classe 0, sem entidades.
// Objetivos: cartão de acesso → três terminais → comporta.
//
// Planta: quarteirões de 5×5 células (2,4 m). A primeira linha e a primeira
// coluna de cada quarteirão são corredor; o miolo de 4×4 é maciço, uma sala
// de máquinas, uma sala branca com um número pintado ou a baia da comporta.
import * as THREE from 'three';
import { GridLevel, W, EH, EV, pushCircle } from './grid.js';
import { getTex, indoorEnvTex } from '../textures.js';
import { GeoBuilder, litMaterial } from '../materials.js';
import { fbm, hash3, mulberry32, TAU } from '../util.js';
import { ledMaterial, lensMaterial, glossMaterial, numMaterial, envFollowsLightmap, SIGN } from './level15_tex.js';
import { fillMachine, fillWhite, fillHatch, paintDigit, sidePoint, vquad } from './level15_rooms.js';
import { cove, pipes, slit, kick, glassFrame, doorFrame, threshold, buildLamp, fp } from './level15_hall.js';
import { doorLeaf, slidingDoor, readerLed, terminalFx, hatchFx } from './level15_dyn.js';

const B = 5; // células por quarteirão
const MDOOR = 8; // aresta própria: porta de metal reforçada (bloqueia a luz)
// zonas das células
const Z_SOLID = 0;
const Z_CORR = 1;
const Z_MACH = 2;
const Z_WHITE = 3;
const Z_HATCH = 4;
// tipos de quarteirão
const SOLID = 0;
const MACH = 1;
const WHITE = 2;
const HATCH = 3;

const signUV = (r) => [0, 1 - (r + 1) / 4, 1, 1 - (r + 1) / 4, 1, 1 - r / 4, 0, 1 - r / 4];

export class Level15 extends GridLevel {
  constructor(game) {
    super(game, {
      cell: 2.4,
      H: 3.4,
      T: 0.14,
      doorW: 1.3,
      doorH: 2.2,
      chunkCells: 10,
      seed: (game.seed ^ 0x1515) >>> 0,
      lightRadius: 8,
      lightEmitPow: 1,
      bounce: 0.55,
      ambient: 0.006,
      wallUV: [1.2, 3.4],
      floorUV: 1.6,
      ceilUV: 1.2,
      lmDensity: 0.85,
    });
    this.B = B;
    this.num = 15;
    // os corredores têm muitas luminárias: no máximo 2 amostras por luz no lightmap
    this.Q = { ...game.Q, lmSamples: Math.min(2, game.Q.lmSamples) };
    this.panelI = 5.5;
    this.flickerGap = 9;
    this.blockMemo = new Map();
    this.doors = new Map();
    this.specials = new Map();
    this.makeMaterials();
    this.look = {
      exposure: 0.92,
      tint: [0.97, 1.0, 1.04],
      sat: 0.82,
      contrast: 1.06,
      lift: [0.01, 0.012, 0.016],
      bloom: 0.2,
      fog: [0.13, 0.14, 0.15],
      fogNear: 0.3,
      lightColor: [0.92, 0.97, 1.0],
      flashlight: false,
      ambience: 'level15',
      reverb: 2.3,
      sanityDrain: 0.03,
    };
    this.objectives = [
      { id: 'card', text: 'Encontre o cartão de acesso' },
      { id: 'terminals', text: 'Religue os terminais (0/3)' },
      { id: 'hatch', text: 'Abra a comporta' },
    ];
    this.plan();
    this.hatchUnlocked = false;
    this.hatchOpening = false;
    this.hatchOpen = 0;
    this.soundT = 0;
  }

  makeMaterials() {
    const S = this.Q.tex;
    const wall = getTex('l15Wall', S);
    const floor = getTex('l15Floor', S);
    const ceil = getTex('l15Ceil', S);
    const metal = getTex('l15Metal', S);
    const env = this.game.makeEnv(indoorEnvTex(['#dfe5ea', '#98a0a8', '#4a5056'], '#ffffff', 7));
    this.env = env;
    this.mats = {
      floor: {
        map: floor.map,
        normalMap: floor.normalMap,
        normalScale: 0.35,
        roughnessMap: floor.roughnessMap,
        roughness: 1,
        envMap: env,
        envIntensity: 0.6,
      },
      wall: {
        map: wall.map,
        normalMap: wall.normalMap,
        normalScale: 0.5,
        roughness: 0.45,
        vertexColors: true,
        envMap: env,
        envIntensity: 0.12,
      },
      ceil: { map: ceil.map, normalMap: ceil.normalMap, normalScale: 0.4, roughness: 0.6, vertexColors: true, lmIntensity: 0.62 },
      prop: { map: metal.map, vertexColors: true, roughness: 0.45, metalness: 0.3, envMap: env, envIntensity: 0.4 },
    };
    this.panelMat = lensMaterial(getTex('l15Lens', S).map, 0xf3f8ff);
    this.glassMat = this.Q.lambert
      ? new THREE.MeshBasicMaterial({
          color: 0x2a3634,
          transparent: true,
          opacity: 0.16,
          depthWrite: false,
          side: THREE.DoubleSide,
          fog: true,
        })
      : new THREE.MeshStandardMaterial({
          color: 0x9fc4be,
          roughness: 0.04,
          metalness: 0,
          transparent: true,
          opacity: 0.14,
          envMap: env,
          envMapIntensity: 0.7,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
    this.ledMat = ledMaterial();
    this.numMat = numMaterial(getTex('l15Digits', S).map);
    this.glossMat = glossMaterial(this.panelMat.uniforms.uGroupI);
    this.signMat = new THREE.MeshBasicMaterial({ map: getTex('l15Signs', S).map, color: new THREE.Color(1.05, 1.05, 1.05), fog: true });
    this.sharedLayers = { led: this.ledMat, num: this.numMat, gloss: this.glossMat, sign: this.signMat };
  }

  // Vidro de 2,24 m × 1,5 m por célula; a porta de metal usa os batentes da porta comum.
  makePieces() {
    super.makePieces();
    const c = this.cell;
    const H = this.H;
    const po = 0.08;
    const g0 = 0.75;
    const g1 = 2.25;
    this.pieces[W.GLASS] = [
      { a0: 0, a1: po, y0: 0, y1: H },
      { a0: c - po, a1: c, y0: 0, y1: H },
      { a0: po, a1: c - po, y0: 0, y1: g0 },
      { a0: po, a1: c - po, y0: g1, y1: H },
    ];
    this.glassSpan = { a0: po, a1: c - po, y0: g0, y1: g1 };
    this.pieces[MDOOR] = this.pieces[W.DOOR];
  }

  // ------------------------------------------------------------ planta
  bkey(bx, bz) {
    return (bx + 32768) * 65536 + (bz + 32768);
  }

  // Quarteirões especiais: cartão (sala branca), três terminais e a comporta.
  plan() {
    const rnd = mulberry32(this.seed * 7 + 15);
    const c = this.cell;
    const sx = c / 2;
    const sz = c / 2;
    const cands = [];
    for (let bz = -8; bz <= 8; bz++) {
      for (let bx = -8; bx <= 8; bx++) {
        if (Math.max(Math.abs(bx), Math.abs(bz)) <= 1) continue;
        const x = (bx * B + 3) * c;
        const z = (bz * B + 3) * c;
        cands.push({ bx, bz, d: Math.hypot(x - sx, z - sz) });
      }
    }
    const used = [];
    const apart = (q) => used.every((u) => Math.max(Math.abs(u.bx - q.bx), Math.abs(u.bz - q.bz)) >= 2);
    // sorteia um quarteirão que satisfaça `ok`, afrouxando as distâncias aos poucos
    const pick = (ok) => {
      for (let r = 0; r < 10; r++) {
        const list = cands.filter((q) => apart(q) && ok(q, r * 4));
        if (list.length) {
          const q = list[Math.floor(rnd() * list.length)];
          used.push(q);
          return q;
        }
      }
      return null;
    };
    const from = (a, q) => Math.hypot((a.bx - q.bx) * B * c, (a.bz - q.bz) * B * c);
    const card = pick((q, r) => q.d >= 26 - r && q.d <= 36 + r);
    const kinds = [0, 1, 2].sort(() => rnd() - 0.5);
    // os três terminais ficam num "distrito" além do cartão; a comporta, mais adiante
    const terms = [0, 1, 2].map(() => pick((q, r) => q.d >= 30 - r && q.d <= 64 + r && from(card, q) >= 12 - r && from(card, q) <= 30 + r));
    const hatch = pick((q, r) => q.d >= 50 - r && q.d <= 72 + r && from(card, q) >= 20 - r && from(card, q) <= 44 + r);
    this.specials.set(this.bkey(card.bx, card.bz), { type: WHITE, card: true });
    terms.forEach((q, i) => this.specials.set(this.bkey(q.bx, q.bz), { type: MACH, kind: kinds[i], term: i }));
    this.specials.set(this.bkey(hatch.bx, hatch.bz), { type: HATCH });
    // posições conhecidas desde o início (bússola e objetivos)
    const cb = this.block(card.bx, card.bz);
    const ccx = (card.bx * B + 3) * c;
    const ccz = (card.bz * B + 3) * c;
    this.cardPos = cb.side < 2 ? { x: ccx, z: ccz - 0.38, y: 0.965 } : { x: ccx - 0.38, z: ccz, y: 0.965 };
    this.terms = terms.map((q) => this.block(q.bx, q.bz).term);
    this.termDoors = this.terms.map((t) => t.blk.door);
    const hT = this.T / 2;
    this.hatch = { bx: hatch.bx, bz: hatch.bz, x: (hatch.bx * B + 4) * c - hT, y: 1.45, z: (hatch.bz * B + 3) * c, r: 1.15 };
    this.exit = { x: this.hatch.x - 1.1, z: this.hatch.z };
    // começa no cruzamento da origem, olhando pelo corredor que leva ao cartão
    const dx = ccx - sx;
    const dz = ccz - sz;
    const yaw = Math.abs(dx) > Math.abs(dz) ? (dx > 0 ? -Math.PI / 2 : Math.PI / 2) : dz > 0 ? Math.PI : 0;
    this.spawn = { x: sx, z: sz, yaw };
  }

  isProtected(bx, bz) {
    return (Math.abs(bx) <= 1 && Math.abs(bz) <= 1) || this.specials.has(this.bkey(bx, bz));
  }

  // Trecho de corredor emparedado (vira T ou L nos cruzamentos).
  // axis 0: trecho ao longo de x na linha bz*B; axis 1: ao longo de z na coluna bx*B.
  segClosed(bx, bz, axis) {
    if (this.isProtected(bx, bz) || this.isProtected(axis === 1 ? bx - 1 : bx, axis === 0 ? bz - 1 : bz)) return false;
    return hash3(bx * 2 + axis, bz, this.seed + 21) < 0.13;
  }

  // Corredores do quarteirão (cruzamento e os dois trechos que saem dele) apagados.
  darkBlock(bx, bz) {
    if (Math.abs(bx) <= 1 && Math.abs(bz) <= 1) return false;
    return fbm(bx * 0.42 + 7.3, bz * 0.42 - 2.1, 2, this.seed + 5) > 0.25;
  }

  block(bx, bz) {
    const key = this.bkey(bx, bz);
    let b = this.blockMemo.get(key);
    if (b) return b;
    const sp = this.specials.get(key);
    const sd = this.seed;
    const h = hash3(bx, bz, sd + 11);
    let type = sp ? sp.type : h < 0.34 ? SOLID : h < 0.68 ? MACH : WHITE;
    // lados com corredor aberto: 0 = −x, 1 = +x, 2 = −z, 3 = +z
    const open = [!this.segClosed(bx, bz, 1), !this.segClosed(bx + 1, bz, 1), !this.segClosed(bx, bz, 0), !this.segClosed(bx, bz + 1, 0)];
    const sides = [0, 1, 2, 3].filter((s) => open[s]);
    if (!sides.length) type = SOLID;
    const side = type === HATCH ? 0 : sides.length ? sides[Math.floor(hash3(bx, bz, sd + 12) * sides.length)] : 0;
    b = {
      bx,
      bz,
      key,
      type,
      side,
      open,
      glass: [false, false, false, false],
      kind: 0,
      num: Math.floor(hash3(bx, bz, sd + 14) * 10),
      card: !!(sp && sp.card),
      term: null,
      door: null,
      walls: [0, 1, 2, 3].map(() => [W.FULL, W.FULL, W.FULL, W.FULL, W.FULL]),
    };
    if (type === MACH) {
      b.kind = sp ? sp.kind : Math.floor(hash3(bx, bz, sd + 15) * 3);
      b.walls[side][2] = MDOOR;
      const cand = [0, 1, 2, 3].filter((s) => s !== side && open[s]);
      for (const s of cand) if (hash3(bx * 4 + s, bz, sd + 13) < 0.55) b.glass[s] = true;
      if (cand.length && !b.glass.some(Boolean)) b.glass[cand[0]] = true;
      for (let s = 0; s < 4; s++) {
        if (!b.glass[s]) continue;
        const wide = hash3(bx, bz * 4 + s, sd + 16) < 0.4;
        for (let k = wide ? 1 : 2; k <= (wide ? 4 : 3); k++) b.walls[s][k] = W.GLASS;
      }
      this.addDoor(b, !sp);
      if (sp) {
        const p = sidePoint(this, b, side, 4, 0.55);
        b.term = { x: p.x, z: p.z, fx: p.nx, fz: p.nz, done: false, blk: b, fx3: null };
      }
    } else if (type === WHITE) {
      b.walls[side][2] = W.DOOR;
      const s2 = side < 2 ? 3 : 1;
      if (open[s2] && !b.card && hash3(bx, bz, sd + 17) < 0.35) b.walls[s2][2] = W.DOOR;
    } else if (type === HATCH) {
      b.walls[0][2] = W.NONE;
      b.walls[0][3] = W.NONE;
    }
    this.blockMemo.set(key, b);
    return b;
  }

  // Porta reforçada no meio do lado `side` (célula 2).
  addDoor(b, sealed) {
    const c = this.cell;
    const s = b.side;
    let kind = EV;
    let ix = b.bx * B + 1;
    let iz = b.bz * B + 2;
    let nx = 0;
    let nz = 0;
    if (s === 0) nx = -1;
    else if (s === 1) {
      ix = b.bx * B + B;
      nx = 1;
    } else {
      kind = EH;
      ix = b.bx * B + 2;
      iz = s === 2 ? b.bz * B + 1 : b.bz * B + B;
      nz = s === 2 ? -1 : 1;
    }
    const d = {
      kind,
      ix,
      iz,
      nx,
      nz,
      x: kind === EV ? ix * c : (ix + 0.5) * c,
      z: kind === EV ? (iz + 0.5) * c : iz * c,
      sealed,
      open: 0,
      target: 0,
      blk: b,
      fx: null,
    };
    b.door = d;
    this.doors.set(this.key(ix, iz) * 2 + kind, d);
  }

  zone(ix, iz) {
    const bx = Math.floor(ix / B);
    const bz = Math.floor(iz / B);
    const lx = ix - bx * B;
    const lz = iz - bz * B;
    if (lx === 0 && lz === 0) return Z_CORR;
    if (lx === 0) return this.segClosed(bx, bz, 1) ? Z_SOLID : Z_CORR;
    if (lz === 0) return this.segClosed(bx, bz, 0) ? Z_SOLID : Z_CORR;
    const b = this.block(bx, bz);
    if (b.type === MACH) return Z_MACH;
    if (b.type === WHITE) return Z_WHITE;
    if (b.type === HATCH) return lx <= 3 && (lz === 2 || lz === 3) ? Z_HATCH : Z_SOLID;
    return Z_SOLID;
  }

  genEdge(kind, ix, iz) {
    const ax = kind === EH ? ix : ix - 1;
    const az = kind === EH ? iz - 1 : iz;
    const za = this.zone(ax, az);
    const zb = this.zone(ix, iz);
    if (za === zb) return W.NONE;
    if (za === Z_SOLID || zb === Z_SOLID) return W.FULL;
    // corredor ↔ sala: quem decide é a parede do quarteirão
    const rx = za === Z_CORR ? ix : ax;
    const rz = za === Z_CORR ? iz : az;
    const bx = Math.floor(rx / B);
    const bz = Math.floor(rz / B);
    const lx = rx - bx * B;
    const lz = rz - bz * B;
    const side = kind === EV ? (lx === 1 ? 0 : 1) : lz === 1 ? 2 : 3;
    return this.block(bx, bz).walls[side][kind === EV ? lz : lx];
  }

  genLight(cx, cz) {
    const zn = this.zone(cx, cz);
    if (zn === Z_SOLID) return null;
    const c = this.cell;
    const bx = Math.floor(cx / B);
    const bz = Math.floor(cz / B);
    const lx = cx - bx * B;
    const lz = cz - bz * B;
    const x = (cx + 0.5) * c;
    const z = (cz + 0.5) * c;
    const H = this.H;
    if (zn === Z_CORR) {
      let group = this.darkBlock(bx, bz) ? 3 : 0;
      const h = this.hashCell(cx, cz, 5);
      if (!group && h < 0.05) group = h < 0.025 ? 1 : 2;
      if (lx === 0 && lz === 0) return { x, z, y: H - 0.02, ax: 0, len: 0.9, wid: 0.9, I: 2.6, group, style: 'square' };
      return { x, z, y: H - 0.02, ax: lz === 0 ? 0 : 1, len: c - 0.06, wid: 0.12, I: 3.2, group, style: 'strip' };
    }
    if (zn === Z_MACH) {
      const edge = lx === 1 || lx === 4 || lz === 1 || lz === 4;
      if (!edge || (lx + lz) % 2 !== 1) return null;
      return { x, z, y: H - 0.32, ax: lx === 1 || lx === 4 ? 1 : 0, len: 1.5, wid: 0.16, I: 3.4, group: 0, style: 'fixture' };
    }
    if (zn === Z_WHITE) {
      if ((lx + lz) % 2 !== 0) return null;
      return { x, z, y: H - 0.02, ax: 0, len: 0.8, wid: 0.8, I: 3.0, group: 0, style: 'square' };
    }
    if (lx === 2) return null;
    return { x, z, y: H - 0.3, ax: 1, len: 1.4, wid: 0.16, I: 2.6, group: 0, style: 'fixture' };
  }

  // A porta de metal fecha a passagem de luz (o lightmap é feito uma vez só).
  blocks(kind, ix, iz, along, y) {
    const t = this.edge(kind, ix, iz);
    if (t === W.NONE) return false;
    if (t === MDOOR) return true;
    const ps = this.pieces[t];
    for (let i = 0; i < ps.length; i++) {
      const p = ps[i];
      if (along >= p.a0 - 0.02 && along <= p.a1 + 0.02 && y >= p.y0 && y <= p.y1) return true;
    }
    return false;
  }

  // ------------------------------------------------------------ conteúdo dos blocos
  chunkBlocks(ch) {
    const n = this.chunkCells / B;
    const out = [];
    for (let bz = ch.cz * n; bz < ch.cz * n + n; bz++) for (let bx = ch.cx * n; bx < ch.cx * n + n; bx++) out.push(this.block(bx, bz));
    return out;
  }

  chunkLM(ch) {
    const span = this.S + this.pad * 2;
    const ox = ch.x0 - this.pad;
    const oz = ch.z0 - this.pad;
    return (x, z) => [(x - ox) / span, (z - oz) / span];
  }

  genProps(ch) {
    ch.dyn = [];
    ch.circles = [];
    ch.machines = [];
    const c = this.cell;
    for (const b of this.chunkBlocks(ch)) {
      if (b.type === MACH) fillMachine(this, ch, b);
      else if (b.type === WHITE) {
        fillWhite(this, ch, b);
        this.whiteItems(ch, b);
      } else if (b.type === HATCH) {
        const h = this.hatch;
        fillHatch(this, ch, h);
        ch.colliders.push([h.x - 0.34, h.x, h.z - 1.5, h.z + 1.5]);
        ch.props.push({ draw: (G) => vquad(G.sign, h.x, h.z, -1, 0, 1.5, 3.0, 3.19, 0.012, null, null, 0, signUV(SIGN.HATCH)) });
      } else this.solidDigits(ch, b);
    }
    if (ch.cx === 0 && ch.cz === 0) ch.items.push({ type: 'note', key: '15:n0', x: 2.5 * c, z: 0.42, rot: 0.4 });
  }

  // Bilhetes e Água de Amêndoa em algumas salas brancas; o cartão na recepção.
  whiteItems(ch, b) {
    if (b.card) {
      ch.items.push(this.cardItem());
      return;
    }
    const c = this.cell;
    const h = hash3(b.bx, b.bz, this.seed + 41);
    const p = sidePoint(this, b, b.side ^ 1, 1, 0.45);
    if (h < 0.3) ch.items.push({ type: 'note', key: `15:${b.bx}:${b.bz}:n`, x: p.x, z: p.z, rot: h * 20 });
    else if (h < 0.5) ch.items.push({ type: 'water', key: `15:${b.bx}:${b.bz}:w`, x: p.x, z: p.z });
    else if (h < 0.58)
      ch.items.push({ type: 'water', key: `15:${b.bx}:${b.bz}:w`, x: (b.bx * B + 3) * c + 0.9, z: (b.bz * B + 3) * c + 0.9 });
  }

  // Números enormes pintados em pontos nas fachadas cegas dos quarteirões.
  solidDigits(ch, b) {
    const c = this.cell;
    const hT = this.T / 2;
    const sec = 1 + Math.floor(hash3(b.bx, b.bz, this.seed + 51) * 39);
    for (let s = 0; s < 4; s++) {
      if (!b.open[s] || hash3(b.bx * 4 + s, b.bz, this.seed + 52) > 0.38) continue;
      const nx = s === 0 ? -1 : s === 1 ? 1 : 0;
      const nz = s === 2 ? -1 : s === 3 ? 1 : 0;
      const x = s === 0 ? (b.bx * B + 1) * c - hT : s === 1 ? (b.bx * B + B) * c + hT : (b.bx * B + 3) * c;
      const z = s === 2 ? (b.bz * B + 1) * c - hT : s === 3 ? (b.bz * B + B) * c + hT : (b.bz * B + 3) * c;
      const digits = String(sec).split('').map(Number);
      const h = 1.85;
      const w = h * 0.8 * 0.82;
      const rx = nz;
      const rz = -nx;
      ch.props.push({
        draw: (G) => {
          digits.forEach((d, i) => {
            const o = (i - (digits.length - 1) / 2) * w;
            paintDigit(G, x + rx * o, z + rz * o, nx, nz, d, h, 0.32);
          });
        },
      });
    }
  }

  cardItem() {
    const p = this.cardPos;
    return {
      type: 'x',
      key: '15:cartao',
      x: p.x,
      z: p.z,
      y: p.y,
      label: 'Pegar o cartão de acesso',
      makeMesh: (it, items) => {
        const tex = getTex('l15Misc', 0).card;
        const g = new THREE.Group();
        const body = new THREE.Mesh(
          new THREE.BoxGeometry(0.086, 0.003, 0.054),
          items.litMat({ color: 0xe8ecef, roughness: 0.5 }, it.light),
        );
        const face = new THREE.Mesh(new THREE.PlaneGeometry(0.086, 0.054), items.litMat({ map: tex, roughness: 0.4 }, it.light));
        face.rotation.x = -Math.PI / 2;
        face.position.y = 0.0016;
        // cordão vermelho enrolado ao lado (chama a atenção no balcão)
        const strap = new THREE.Mesh(
          new THREE.TorusGeometry(0.05, 0.005, 4, 20),
          items.litMat({ color: 0xb01818, roughness: 0.7 }, it.light),
        );
        strap.rotation.x = -Math.PI / 2;
        strap.scale.set(1, 1.5, 1);
        strap.position.set(-0.075, 0.002, 0.012);
        g.add(body, face, strap);
        g.position.set(it.x, it.y, it.z);
        g.rotation.y = 0.35;
        g.scale.setScalar(1.6);
        return g;
      },
      onUse: (game) => {
        game.audio.click();
        game.audio.play('beep', { gain: 0.3, rate: 1.25 });
        game.inventory.add('cartao');
        game.completeObjective('card', 'Cartão de acesso: "NÍVEL 15 — MANUTENÇÃO". Ele deve abrir as salas de máquinas com terminal.');
      },
    };
  }

  // ------------------------------------------------------------ geometria
  buildFloorCeil(G, ch) {
    // metal e plástico num material só (menos draw calls)
    G.extra = G.prop;
    const c = this.cell;
    const N = this.chunkCells;
    const H = this.H;
    for (let iz = ch.cz * N; iz < ch.cz * N + N; iz++) {
      for (let ix = ch.cx * N; ix < ch.cx * N + N; ix++) {
        const zn = this.zone(ix, iz);
        if (zn === Z_SOLID) continue;
        const x0 = ix * c;
        const z0 = iz * c;
        // as salas de máquinas têm chapas de metal próprias
        if (zn !== Z_MACH) this.hface(G.floor, x0, x0 + c, z0, z0 + c, 0, true, G.lm, this.floorUV);
        this.hface(G.ceil, x0, x0 + c, z0, z0 + c, H, false, G.lm, this.ceilUV, zn === Z_MACH ? 0.75 : 1);
      }
    }
  }

  buildLight(G, L) {
    buildLamp(G, L, this.H, this.cell);
  }

  // Vidro grosso: duas faces afastadas.
  buildGlass(G, kind, ix, iz) {
    const c = this.cell;
    const s = this.glassSpan;
    for (const o of [-0.03, 0.03]) {
      const pts =
        kind === EH
          ? [
              [ix * c + s.a0, s.y0, iz * c + o],
              [ix * c + s.a1, s.y0, iz * c + o],
              [ix * c + s.a1, s.y1, iz * c + o],
              [ix * c + s.a0, s.y1, iz * c + o],
            ]
          : [
              [ix * c + o, s.y0, iz * c + s.a1],
              [ix * c + o, s.y0, iz * c + s.a0],
              [ix * c + o, s.y1, iz * c + s.a0],
              [ix * c + o, s.y1, iz * c + s.a1],
            ];
      G.glass.quad(pts, kind === EH ? [0, 0, 1] : [-1, 0, 0], [0, 0, 1, 0, 1, 1, 0, 1], null, null);
    }
  }

  // A célula do lado `s` da aresta é corredor e a aresta tem parede com verga?
  coveOn(kind, ix, iz, s) {
    if (this.edge(kind, ix, iz) === W.NONE) return false;
    const cx = kind === EV && !s ? ix - 1 : ix;
    const cz = kind === EH && !s ? iz - 1 : iz;
    return this.zone(cx, cz) === Z_CORR;
  }

  decorateEdge(G, kind, ix, iz, t) {
    const c = this.cell;
    const hT = this.T / 2;
    const H = this.H;
    const e0 = this.cornerInfo(kind, ix, iz, 0).ext;
    const e1 = this.cornerInfo(kind, ix, iz, 1).ext;
    const door = t === MDOOR ? this.doors.get(this.key(ix, iz) * 2 + kind) : null;
    if (door) {
      threshold(G, kind, door.x, door.z, this.doorW, this.T, G.lm);
      if (door.sealed) doorLeaf(G.prop, door, this.doorW, this.doorH, G.lm);
    }
    for (let s = 0; s < 2; s++) {
      const cx = kind === EV && !s ? ix - 1 : ix;
      const cz = kind === EH && !s ? iz - 1 : iz;
      const zn = this.zone(cx, cz);
      if (zn === Z_SOLID) continue;
      const n = s ? 1 : -1;
      const F =
        kind === EH
          ? { x: ix * c, z: iz * c + n * hT, ax: 1, az: 0, nx: 0, nz: n }
          : { x: ix * c + n * hT, z: iz * c, ax: 0, az: 1, nx: n, nz: 0 };
      if (t === W.GLASS) glassFrame(G, F, this.glassSpan, G.lm);
      if (door) doorFrame(G, F, c, this.doorW, this.doorH, G.lm);
      if (zn !== Z_CORR) {
        if (zn === Z_WHITE && t === W.FULL) kick(G, F, -e0, c + e1, G.lm);
        continue;
      }
      // --- face voltada para o corredor
      const p0 = kind === EH ? [ix - 1, iz] : [ix, iz - 1];
      const p1 = kind === EH ? [ix + 1, iz] : [ix, iz + 1];
      const has0 = this.coveOn(kind, p0[0], p0[1], s);
      const has1 = this.coveOn(kind, p1[0], p1[1], s);
      cove(G.ceil, F, -e0, c + e1, !has0, !has1, H, G.lm, this.ceilUV);
      const bx = Math.floor(cx / B);
      const bz = Math.floor(cz / B);
      const lx = cx - bx * B;
      const lz = cz - bz * B;
      const k = kind === EH ? lx : lz;
      const L = this.light(cx, cz);
      const group = L ? L.group : 3;
      if (t === W.FULL || t === W.GLASS) kick(G, F, -e0, c + e1, G.lm);
      if (t === W.FULL && (k === 1 || k === 4)) slit(G, F, c / 2, group, G.lm);
      // tubulação: só nos trechos (não nos cruzamentos), de um lado por trecho
      const inSeg = kind === EH ? lz === 0 && lx !== 0 : lx === 0 && lz !== 0;
      if (inSeg && (hash3(bx, bz * 2 + kind, this.seed + 31) < 0.5 ? 1 : 0) === s) {
        const end0 = k === 1 || !has0;
        const end1 = k === 4 || !has1;
        pipes(G.prop, F, -e0, c + e1, end0, end1, H, G.lm, !end0);
      }
      if (door && n === (kind === EH ? door.nz : door.nx)) {
        // placa e leitor de cartão do lado do corredor
        const row = door.sealed ? SIGN.RESTRICTED : SIGN.MACHINES;
        const ps = fp(F, c / 2, 0, 0);
        vquad(G.sign, ps[0], ps[2], F.nx, F.nz, 1.2, 2.215, 2.365, 0.064, null, null, 0, signUV(row));
        const pr = fp(F, c / 2 + this.doorW / 2 + 0.34, 0, 0);
        G.prop.box(pr[0] + F.nx * 0.02, 1.27, pr[2] + F.nz * 0.02, F.ax ? 0.1 : 0.04, 0.16, F.ax ? 0.04 : 0.1, [0.1, 0.11, 0.12], G.lm, {
          ao: 0,
        });
        if (door.sealed) vquad(G.led, pr[0], pr[2], F.nx, F.nz, 0.03, 1.295, 1.325, 0.042, null, [1, 0.12, 0.08], 2.4);
      }
    }
  }

  // ------------------------------------------------------------ peças dinâmicas
  onChunkBuilt(ch) {
    // o reflexo do ambiente apaga junto com o lightmap
    for (const m of ch.meshes) if (m.material && m.material.lightMap) envFollowsLightmap(m.material);
    const lm = this.chunkLM(ch);
    const own = [];
    const mats = [];
    let dmat = null;
    const dynMat = () => {
      if (!dmat) {
        dmat = litMaterial(this.Q, { ...this.mats.prop, lightMap: ch.lmTex });
        envFollowsLightmap(dmat);
        mats.push(dmat);
      }
      return dmat;
    };
    const add = (o) => {
      this.dynamic.add(o);
      own.push(o);
      return o;
    };
    for (const d of ch.dyn) {
      const gb = new GeoBuilder();
      d.build(gb, lm);
      const geo = gb.build();
      geo.translate(-d.pivot[0], -d.pivot[1], -d.pivot[2]);
      d.mesh = add(new THREE.Mesh(geo, dynMat()));
      d.mesh.position.set(d.pivot[0], d.pivot[1], d.pivot[2]);
      d.y0 = d.pivot[1];
    }
    const blocks = this.chunkBlocks(ch);
    for (const b of blocks) {
      const d = b.door;
      if (d && !d.sealed) {
        const leaf = add(slidingDoor(d, this.doorW, this.doorH, dynMat(), lm));
        const ax = d.kind === EH ? 1 : 0;
        const pr = [
          d.x + d.nx * (this.T / 2) + ax * (this.doorW / 2 + 0.34),
          0,
          d.z + d.nz * (this.T / 2) + (1 - ax) * (this.doorW / 2 + 0.34),
        ];
        const led = add(readerLed(pr, d.nx, d.nz));
        mats.push(led.material);
        d.fx = { leaf, led };
        this.placeDoor(d);
      }
      if (b.term) {
        const t = b.term;
        const fx = terminalFx(t);
        add(fx.screen);
        add(fx.lamp);
        mats.push(fx.screen.material, fx.lamp.material);
        t.fx3 = fx;
      }
      if (b.type === HATCH) {
        const fx = hatchFx(this.hatch, dynMat(), lm);
        add(fx.door);
        add(fx.hole);
        for (const q of fx.beacons) add(q);
        add(fx.status);
        mats.push(...fx.mats);
        this.hatchFx = fx;
      }
    }
    ch.onDispose = () => {
      for (const o of own) {
        this.dynamic.remove(o);
        o.geometry.dispose();
      }
      for (const m of mats) m.dispose();
      for (const b of blocks) {
        if (b.door) b.door.fx = null;
        if (b.term) b.term.fx3 = null;
        if (b.type === HATCH) this.hatchFx = null;
      }
      for (const m of ch.machines) {
        if (m.snd) m.snd.stop();
        m.snd = null;
      }
    };
  }

  // Posição da folha de correr e cor do leitor.
  placeDoor(d) {
    if (!d.fx) return;
    const k = d.open * (this.doorW + 0.12);
    d.fx.leaf.position.set(d.x - (d.kind === EH ? k : 0), 0, d.z - (d.kind === EV ? k : 0));
    if (d.target > 0) d.fx.led.material.color.setRGB(0.2, 2.6, 0.5);
    else if (this.game.objectiveDone('card')) d.fx.led.material.color.setRGB(2.6, 1.3, 0.1);
    else d.fx.led.material.color.setRGB(2.4, 0.15, 0.08);
  }

  // ------------------------------------------------------------ jogo
  tick(dt, player) {
    const g = this.game;
    const t = g.time;
    this.ledMat.uniforms.uTime.value = t;
    // rotores, pistões e exaustores
    for (const ch of this.chunks.values()) {
      if (!ch.dyn) continue;
      for (const d of ch.dyn) {
        const m = d.mesh;
        if (!m) continue;
        if (d.anim.t === 'rot') m.rotation[d.anim.axis] += d.anim.speed * dt;
        else m.position.y = d.y0 + Math.sin(t * d.anim.freq * TAU) * d.anim.amp;
      }
    }
    // portas que deslizam
    for (const d of this.termDoors) {
      if (d.open < d.target) d.open = Math.min(d.target, d.open + dt * 0.75);
      this.placeDoor(d);
    }
    // lâmpadas dos terminais: vermelho piscando até religar, depois verde
    for (const q of this.terms) {
      if (!q.fx3) continue;
      const c = q.fx3.lamp.material.color;
      if (q.done) c.setRGB(0.25, 2.8, 0.6);
      else {
        const k = Math.sin(t * 5) > 0 ? 2.8 : 0.35;
        c.setRGB(k, k * 0.06, k * 0.04);
      }
    }
    this.tickHatch(dt, t);
    this.soundT -= dt;
    if (this.soundT <= 0) {
      this.soundT = 0.5;
      this.updateSounds(player);
    }
  }

  tickHatch(dt, t) {
    const fx = this.hatchFx;
    if (this.hatchOpening) this.hatchOpen = Math.min(1, this.hatchOpen + dt * 0.5);
    if (!fx) return;
    if (this.hatchUnlocked) {
      // giroflex: pulso âmbar rápido
      const k = Math.pow(Math.max(0, Math.sin(t * 6.5)), 3);
      fx.beaconMat.color.setRGB(0.4 + 3.6 * k, 0.15 + 1.6 * k, 0.02);
      fx.status.material.color.setRGB(0.2, 2.6, 0.5);
    }
    const e = this.hatchOpen;
    fx.door.rotation.y = e * e * (3 - 2 * e) * 1.75;
  }

  // Motores das salas de máquinas: só as 4 mais próximas tocam.
  updateSounds(player) {
    const a = this.game.audio;
    if (!a.ready) return;
    const p = player.pos;
    const all = [];
    for (const ch of this.chunks.values()) for (const m of ch.machines || []) all.push(m);
    for (const m of all) m.dd = Math.hypot(m.x - p.x, m.z - p.z);
    all.sort((u, v) => u.dd - v.dd);
    all.forEach((m, i) => {
      const want = i < 4 && m.dd < 34;
      const d = m.blk.door;
      const k = d && d.open > 0.5 ? 1 : m.blk.glass.some(Boolean) ? 0.6 : 0.4;
      if (want && !m.snd) {
        m.snd = a.positional('machine', m.x, 1.5, m.z, {
          gain: m.gain * k,
          ref: 3,
          rolloff: 1.3,
          rate: m.rate,
          wet: 0.55,
          offset: Math.random() * 4,
        });
      } else if (!want && m.snd) {
        m.snd.stop();
        m.snd = null;
      } else if (m.snd) m.snd.setGain(m.gain * k, 0.6);
    });
  }

  interactable(player) {
    const p = player.pos;
    const g = this.game;
    const c = this.cell;
    // comporta
    const h = this.hatch;
    if (Math.abs(p.z - h.z) < 1.9 && p.x < h.x && h.x - p.x < 2.3) {
      if (this.hatchOpening) return null;
      if (!this.hatchUnlocked) {
        const n = this.terms.filter((q) => q.done).length;
        return {
          label: `Comporta travada (${n}/3 terminais)`,
          action: () => {
            g.audio.play('beep', { gain: 0.35, rate: 0.5 });
            g.hud.message(`A comporta não se move. O painel ao lado pede os três terminais religados (${n}/3).`, 3.5);
          },
        };
      }
      return { label: 'Abrir a comporta', action: () => this.openHatch() };
    }
    // terminais
    for (const q of this.terms) {
      if (q.done) continue;
      if (Math.hypot(p.x - (q.x + q.fx * 0.75), p.z - (q.z + q.fz * 0.75)) < 0.95)
        return { label: 'Religar o terminal', action: () => this.activateTerminal(q) };
    }
    // portas das salas de máquinas: a que estiver à frente do jogador
    const bx = Math.floor(p.x / (B * c));
    const bz = Math.floor(p.z / (B * c));
    const fx = -Math.sin(player.yaw);
    const fz = -Math.cos(player.yaw);
    let best = null;
    let bd = 1e9;
    for (let dz = -1; dz <= 1; dz++) {
      for (let dx = -1; dx <= 1; dx++) {
        const d = this.block(bx + dx, bz + dz).door;
        if (!d || d.target > 0) continue;
        const rx = p.x - d.x;
        const rz = p.z - d.z;
        const front = rx * d.nx + rz * d.nz;
        const side = Math.abs(d.kind === EH ? rx : rz);
        if (front < 0 || front > 1.6 || side > 1.25 || fx * d.nx + fz * d.nz > -0.2) continue;
        if (front + side < bd) {
          bd = front + side;
          best = d;
        }
      }
    }
    return best ? this.doorAction(best) : null;
  }

  doorAction(d) {
    const g = this.game;
    const deny = (msg) => () => {
      g.audio.play('beep', { gain: 0.3, rate: 0.45 });
      g.hud.message(msg, 3);
    };
    if (d.sealed) {
      return {
        label: 'Leitor de cartão: acesso restrito',
        action: deny('ACESSO NEGADO. O leitor pisca em vermelho: esta sala não é da manutenção.'),
      };
    }
    if (!g.objectiveDone('card')) {
      return { label: 'Porta trancada', action: deny('A porta de metal não cede. Ao lado, um leitor espera um cartão de acesso.') };
    }
    return { label: 'Passar o cartão de acesso', action: () => this.openDoor(d) };
  }

  openDoor(d) {
    const a = this.game.audio;
    d.target = 1;
    a.play('beep', { gain: 0.4, rate: 1.3 });
    a.hiss();
    a.play('door', { gain: 0.45, rate: 0.5, wet: 0.7 });
    this.placeDoor(d);
    this.soundT = 0;
  }

  activateTerminal(q) {
    const g = this.game;
    q.done = true;
    if (q.fx3) q.fx3.screen.material.map = q.fx3.misc.screenOn;
    g.audio.play('beep', { gain: 0.45 });
    setTimeout(() => g.audio.play('beep', { gain: 0.45, rate: 1.5 }), 170);
    g.audio.powerUp();
    const n = this.terms.filter((t) => t.done).length;
    g.setObjectiveText('terminals', `Religue os terminais (${n}/3)`);
    if (n < 3) g.hud.message(`Terminal religado (${n}/3). A tela fica verde e o motor da sala muda de tom.`, 3.5);
    else {
      g.completeObjective('terminals', 'Os três terminais estão verdes. Longe daqui, um alarme dispara: a comporta foi destravada.');
      this.unlockHatch();
    }
  }

  unlockHatch() {
    this.hatchUnlocked = true;
    const a = this.game.audio;
    if (a.ready && !a.emitter) a.setEmitter(this.exitEmitter());
  }

  openHatch() {
    const g = this.game;
    this.hatchOpening = true;
    g.audio.hiss();
    g.audio.play('creak', { gain: 0.7, rate: 0.5, wet: 0.8 });
    g.completeObjective('hatch', 'A comporta gira pesada nas dobradiças. Do outro lado, só escuridão.');
    g.reachExit('door', 2.4);
  }

  navTarget() {
    const cur = this.game.currentObjective();
    if (!cur || cur.id === 'hatch') return this.exit;
    if (cur.id === 'card') return this.cardPos;
    const p = this.game.player.pos;
    let best = null;
    let bd = 1e9;
    for (const q of this.terms) {
      if (q.done) continue;
      const dd = Math.hypot(q.x - p.x, q.z - p.z);
      if (dd < bd) {
        bd = dd;
        best = q;
      }
    }
    if (!best) return this.exit;
    // de fora da sala, a bússola aponta para a porta
    const b = best.blk;
    const inside =
      Math.floor(p.x / (B * this.cell)) === b.bx &&
      Math.floor(p.z / (B * this.cell)) === b.bz &&
      this.zone(Math.floor(p.x / this.cell), Math.floor(p.z / this.cell)) === Z_MACH;
    if (inside) return { x: best.x, z: best.z };
    const d = b.door;
    return { x: d.x + d.nx * 1.2, z: d.z + d.nz * 1.2 };
  }

  exitEmitter() {
    const h = this.hatch;
    return this.hatchUnlocked ? { x: h.x - 0.4, y: 2.6, z: h.z, sound: 'alarm', gain: 0.3 } : null;
  }

  surfaceAt(x, z) {
    const zn = this.zone(Math.floor(x / this.cell), Math.floor(z / this.cell));
    return zn === Z_MACH || zn === Z_HATCH ? 'metal' : 'tile';
  }

  // ------------------------------------------------------------ colisão
  collideEdge(p, r, kind, ix, iz, hT) {
    super.collideEdge(p, r, kind, ix, iz, hT);
    if (this.edge(kind, ix, iz) !== MDOOR) return;
    const d = this.doors.get(this.key(ix, iz) * 2 + kind);
    if (d && d.open > 0.7) return;
    const c = this.cell;
    const a0 = c / 2 - this.doorW / 2;
    const a1 = c / 2 + this.doorW / 2;
    if (kind === EH) pushCircle(p, r, ix * c + a0, ix * c + a1, iz * c - hT, iz * c + hT);
    else pushCircle(p, r, ix * c - hT, ix * c + hT, iz * c + a0, iz * c + a1);
  }

  collide(p, r) {
    super.collide(p, r);
    for (const ch of this.nearChunks(p.x, p.z)) {
      for (const q of ch.circles || []) {
        const dx = p.x - q[0];
        const dz = p.z - q[1];
        const d = Math.hypot(dx, dz);
        const m = q[2] + r;
        if (d < m && d > 1e-6) {
          p.x = q[0] + (dx / d) * m;
          p.z = q[1] + (dz / d) * m;
        }
      }
    }
    return p;
  }

  dispose() {
    super.dispose();
    for (const m of [this.panelMat, this.glassMat, this.ledMat, this.numMat, this.glossMat, this.signMat]) m.dispose();
  }
}

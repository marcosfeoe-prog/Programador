// Monta a malha de cada chunk: só faces visíveis, com oclusão de ambiente e iluminação suave.
import * as THREE from 'three';
import { BLOCKS, B } from './blocks.js';
import { CS, CH, GRASS_TINT, FOLIAGE_TINT } from './consts.js';
import { OPAQUE, LIQUID } from './world.js';
import { tileUV, blockFaces } from './textures.js';
import { hash2 } from './noise.js';

const P = CS + 2;
const PH = CH + 2;
const pb = new Uint8Array(P * P * PH);
const pm = new Uint8Array(P * P * PH);
const pl = new Uint8Array(P * P * PH);
const PI = (x, y, z) => ((y + 1) * P + (z + 1)) * P + (x + 1);
const SY = P * P, SZ = P;

// faces: normal, origem, eixo u, eixo v, tipo de textura, sombreamento
const FACES = [
  { n: [1, 0, 0], o: [1, 0, 1], u: [0, 0, -1], v: [0, 1, 0], t: 'side', s: 0.6 },
  { n: [-1, 0, 0], o: [0, 0, 0], u: [0, 0, 1], v: [0, 1, 0], t: 'side', s: 0.6 },
  { n: [0, 1, 0], o: [0, 1, 1], u: [1, 0, 0], v: [0, 0, -1], t: 'top', s: 1.0 },
  { n: [0, -1, 0], o: [0, 0, 0], u: [1, 0, 0], v: [0, 0, 1], t: 'bottom', s: 0.5 },
  { n: [0, 0, 1], o: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0], t: 'side', s: 0.8 },
  { n: [0, 0, -1], o: [1, 0, 0], u: [-1, 0, 0], v: [0, 1, 0], t: 'side', s: 0.8 },
];
const CU = [0, 1, 1, 0], CV = [0, 0, 1, 1];
for (const f of FACES) {
  f.off = f.n[1] * SY + f.n[2] * SZ + f.n[0];
  f.uoff = f.u[1] * SY + f.u[2] * SZ + f.u[0];
  f.voff = f.v[1] * SY + f.v[2] * SZ + f.v[0];
}
export { FACES };
// meta da orientação → índice da face frontal
export const FRONT_FACE = [4, 1, 5, 0];
const AO_CURVE = [0.42, 0.6, 0.8, 1.0];

let faceUV = null; // [id][face][meta&3] -> uv
function buildFaceUV() {
  faceUV = [];
  for (const b of BLOCKS) {
    if (!b || b.render === 'none') continue;
    const f = blockFaces(b.id);
    faceUV[b.id] = FACES.map((face, fi) =>
      [0, 1, 2, 3].map((m) => {
        if (b.oriented && fi === FRONT_FACE[m]) return tileUV(f.front);
        return tileUV(face.t === 'top' ? f.top : face.t === 'bottom' ? f.bottom : f.side);
      }),
    );
  }
}
export function getFaceUV(id, face, meta = 0) {
  if (!faceUV) buildFaceUV();
  return faceUV[id][face][meta & 3];
}

// Opções de malha que dependem da qualidade gráfica
export const meshOptions = { fastLeaves: false };
export function setMeshOptions(o) {
  Object.assign(meshOptions, o);
}
// bits de animação por vértice: 1 folhas, 2 planta (topo), 4 água (superfície), 8 lava
export const FLAG = { LEAVES: 1, PLANT: 2, WATER: 4, LAVA: 8 };

class Buf {
  constructor() {
    this.pos = [];
    this.uv = [];
    this.light = [];
    this.tint = [];
    this.nrm = [];
    this.tan = [];
    this.flags = [];
    this.index = [];
    this.n = 0;
    this.N = [0, 1, 0];
    this.T = [1, 0, 0];
    this.flag = 0;
  }
  // normal e tangente (eixo u da textura) das próximas faces
  face(n, t, flag = 0) {
    this.N = n;
    this.T = t;
    this.flag = flag;
  }
  vert(x, y, z, u, v, sky, blk, sh, t, ao = 1, flag = this.flag) {
    this.pos.push(x, y, z);
    this.uv.push(u, v);
    this.light.push(sky, blk, sh, ao);
    this.tint.push(t[0], t[1], t[2]);
    this.nrm.push(this.N[0], this.N[1], this.N[2]);
    this.tan.push(this.T[0], this.T[1], this.T[2]);
    this.flags.push(flag);
    return this.n++;
  }
  quad(flip) {
    const n = this.n - 4;
    if (flip) this.index.push(n + 1, n + 2, n + 3, n + 1, n + 3, n);
    else this.index.push(n, n + 1, n + 2, n, n + 2, n + 3);
  }
  quadBack() {
    const n = this.n - 4;
    this.index.push(n, n + 2, n + 1, n, n + 3, n + 2);
  }
  geometry() {
    if (!this.index.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('aLight', new THREE.Float32BufferAttribute(this.light, 4));
    g.setAttribute('aTint', new THREE.Float32BufferAttribute(this.tint, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('aTangent', new THREE.Float32BufferAttribute(this.tan, 3));
    g.setAttribute('aFlags', new THREE.Float32BufferAttribute(this.flags, 1));
    g.setIndex(this.n > 65535 ? new THREE.Uint32BufferAttribute(this.index, 1) : new THREE.Uint16BufferAttribute(this.index, 1));
    g.computeBoundingSphere();
    return g;
  }
}

const WHITE = [1, 1, 1];

function copyPadded(world, c) {
  pb.fill(0);
  pm.fill(0);
  pl.fill(0);
  // camada abaixo do mundo: sólida; acima: céu aberto
  for (let z = -1; z <= CS; z++) for (let x = -1; x <= CS; x++) {
    pb[PI(x, -1, z)] = B.BEDROCK;
    pl[PI(x, CH, z)] = 0xf0;
  }
  for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
    const n = dx || dz ? world.getChunk(c.cx + dx, c.cz + dz) : c;
    if (!n) continue;
    const xa = dx < 0 ? CS - 1 : 0, xb = dx > 0 ? 0 : CS - 1;
    const za = dz < 0 ? CS - 1 : 0, zb = dz > 0 ? 0 : CS - 1;
    const ox = dx * CS, oz = dz * CS;
    for (let y = 0; y < CH; y++) for (let z = za; z <= zb; z++) {
      const src = (y << 8) | (z << 4);
      let dst = PI(xa + ox, y, z + oz);
      for (let x = xa; x <= xb; x++, dst++) {
        pb[dst] = n.blocks[src | x];
        pm[dst] = n.meta[src | x];
        pl[dst] = n.light[src | x];
      }
    }
  }
}

function liquidLevelHeight(i, id) {
  if (pb[i + SY] === id) return 1;
  const m = pm[i];
  if (m === 0 || m >= 8) return 0.89;
  return Math.max(0.1, 1 - (m + 1) / 9);
}
// altura do líquido num canto (média das 4 células que o compartilham)
function cornerHeight(x, y, z, id) {
  let sum = 0, w = 0;
  for (let dz = -1; dz <= 0; dz++) for (let dx = -1; dx <= 0; dx++) {
    const i = PI(x + dx, y, z + dz);
    const b = pb[i];
    if (b === id) {
      if (pb[i + SY] === id) return 1;
      const h = liquidLevelHeight(i, id);
      sum += h * (pm[i] === 0 ? 3 : 1);
      w += pm[i] === 0 ? 3 : 1;
    } else if (!BLOCKS[b].solid) {
      sum += 0;
      w += 0.5;
    }
  }
  return w ? sum / w : 0.89;
}

const LEAF_IDS = new Set([B.LEAVES, B.BIRCH_LEAVES, B.SPRUCE_LEAVES]);
const WAVING_PLANTS = new Set([B.TALL_GRASS, B.DANDELION, B.POPPY, B.SAPLING, B.SUGAR_CANE, B.DEAD_BUSH, B.WHEAT]);
let leafOpaqueUV = null;

export function buildChunkGeometry(world, c) {
  if (!faceUV) buildFaceUV();
  if (!leafOpaqueUV) {
    leafOpaqueUV = {
      [B.LEAVES]: tileUV('leaves_opaque'),
      [B.BIRCH_LEAVES]: tileUV('birch_leaves_opaque'),
      [B.SPRUCE_LEAVES]: tileUV('spruce_leaves_opaque'),
    };
  }
  copyPadded(world, c);
  const solid = new Buf(); // opacos + recortados
  const trans = new Buf(); // translúcidos
  const torches = [];
  let maxY = 0;
  for (let i = c.blocks.length - 1; i >= 0; i--) if (c.blocks[i]) { maxY = i >> 8; break; }
  const fast = meshOptions.fastLeaves;

  for (let y = 0; y <= maxY; y++) for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
    const i = PI(x, y, z);
    const id = pb[i];
    if (!id) continue;
    const b = BLOCKS[id];
    const biome = c.biomes[z * CS + x];
    const r = b.render;
    if (r === 'cube') {
      const out = b.translucent ? trans : solid;
      let tint = WHITE;
      if (b.tint === 'foliage') tint = FOLIAGE_TINT[biome];
      const leaf = LEAF_IDS.has(id);
      for (let f = 0; f < 6; f++) {
        const F = FACES[f];
        const ni = i + F.off;
        const nb = pb[ni];
        if (OPAQUE[nb]) continue;
        if (nb === id && (b.cullSame || (leaf && fast))) continue;
        if (b.translucent && nb !== B.AIR && !LIQUID[nb] && BLOCKS[nb].translucent) continue;
        const uv = leaf && fast ? leafOpaqueUV[id] : faceUV[id][f][pm[i] & 3];
        const ft = b.tint === 'grass' ? (f === 2 ? GRASS_TINT[biome] : WHITE) : tint;
        out.face(F.n, F.u, leaf ? FLAG.LEAVES : 0);
        emitFace(out, x, y, z, F, ni, uv, ft, b.cutout && !b.opaque && !(leaf && fast));
      }
    } else if (r === 'liquid') {
      emitLiquid(id === B.WATER ? trans : solid, x, y, z, i, id);
    } else if (r === 'cross') {
      const L = pl[i];
      const sky = (L >> 4) / 15, blk = (L & 15) / 15;
      const uv = faceUV[id][0][0];
      const tint = b.tint === 'grass' ? GRASS_TINT[biome] : WHITE;
      let ox = 0, oz = 0;
      if (id === B.TALL_GRASS || id === B.DANDELION || id === B.POPPY) {
        const wx = c.cx * CS + x, wz = c.cz * CS + z;
        ox = (hash2(7, wx, wz) - 0.5) * 0.35;
        oz = (hash2(8, wx, wz) - 0.5) * 0.35;
      }
      const top = WAVING_PLANTS.has(id) ? FLAG.PLANT : 0;
      const a = 0.146, e = 0.854;
      solid.face([0, 1, 0], [0.707, 0, 0.707], 0);
      for (const [x0, z0, x1, z1] of [[a, a, e, e], [a, e, e, a]]) {
        solid.vert(x + x0 + ox, y, z + z0 + oz, uv[0], uv[1], sky, blk, 0.95, tint, 1, 0);
        solid.vert(x + x1 + ox, y, z + z1 + oz, uv[2], uv[1], sky, blk, 0.95, tint, 1, 0);
        solid.vert(x + x1 + ox, y + 1, z + z1 + oz, uv[2], uv[3], sky, blk, 0.95, tint, 1, top);
        solid.vert(x + x0 + ox, y + 1, z + z0 + oz, uv[0], uv[3], sky, blk, 0.95, tint, 1, top);
        solid.quad(false);
        solid.quadBack();
      }
    } else if (r === 'crop') {
      emitCrop(solid, x, y, z, pm[i], pl[i]);
    } else if (r === 'torch') {
      emitTorch(solid, x, y, z, pm[i], pl[i]);
      torches.push([c.cx * CS + x, y, c.cz * CS + z, pm[i]]);
    } else if (r === 'ladder') {
      emitLadder(solid, x, y, z, pm[i], pl[i]);
    } else if (r === 'slab') {
      const base = b.base;
      const uvs = FACES.map((F, f) => faceUV[base][f][0]);
      emitBox(solid, x, y, z, i, pm[i] & 1 ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1], uvs);
    } else if (r === 'layer') {
      const uvs = FACES.map((F, f) => faceUV[id][f][0]);
      emitBox(solid, x, y, z, i, [0, 0, 0, 1, ((pm[i] & 7) + 1) / 8, 1], uvs);
    } else if (r === 'door') {
      const m = pm[i];
      const t = tileUV(m & 8 ? 'door_top' : 'door_bottom');
      const side = m & 4 ? ((m & 3) + 1) % 4 : m & 3;
      emitBox(solid, x, y, z, i, DOOR_BOXES[side], FACES.map(() => t));
    } else if (r === 'bed') {
      emitBed(solid, x, y, z, i, pm[i]);
    } else if (r === 'fence') {
      const conn = fenceConn(i);
      const uvs = FACES.map(() => faceUV[B.PLANKS][0][0]);
      const q = 1 / 16;
      emitBox(solid, x, y, z, i, [6 * q, 0, 6 * q, 10 * q, 1, 10 * q], uvs);
      const arms = [
        [10 * q, 7 * q, 1, 9 * q],
        [0, 7 * q, 6 * q, 9 * q],
      ];
      for (const [yy0, yy1] of [[6 * q, 9 * q], [12 * q, 15 * q]]) {
        if (conn[0]) emitBox(solid, x, y, z, i, [arms[0][0], yy0, arms[0][1], arms[0][2], yy1, arms[0][3]], uvs);
        if (conn[1]) emitBox(solid, x, y, z, i, [arms[1][0], yy0, arms[1][1], arms[1][2], yy1, arms[1][3]], uvs);
        if (conn[2]) emitBox(solid, x, y, z, i, [7 * q, yy0, 10 * q, 9 * q, yy1, 1], uvs);
        if (conn[3]) emitBox(solid, x, y, z, i, [7 * q, yy0, 0, 9 * q, yy1, 6 * q], uvs);
      }
    }
  }
  c.torches = torches;
  return { solid: solid.geometry(), trans: trans.geometry() };
}

// cerca conecta com cercas e blocos sólidos ao lado: [+x, -x, +z, -z]
export function fenceConnFrom(get) {
  const ok = (id) => id === B.FENCE || (OPAQUE[id] && BLOCKS[id].solid);
  return [ok(get(1, 0)), ok(get(-1, 0)), ok(get(0, 1)), ok(get(0, -1))];
}
function fenceConn(i) {
  return fenceConnFrom((dx, dz) => pb[i + dx + dz * SZ]);
}

const DOOR_BOXES = [
  [0, 0, 13 / 16, 1, 1, 1],
  [0, 0, 0, 3 / 16, 1, 1],
  [0, 0, 0, 1, 1, 3 / 16],
  [13 / 16, 0, 0, 1, 1, 1],
];

// Caixa qualquer dentro do bloco, com a textura recortada como no jogo original.
function emitBox(out, x, y, z, i, box, uvs, opts = {}) {
  const own = pl[i];
  for (let f = 0; f < 6; f++) {
    const F = FACES[f];
    // face encostada na borda do bloco e vizinho opaco: escondida
    const axis = F.n[0] ? 0 : F.n[1] ? 1 : 2;
    const onEdge = F.n[axis] > 0 ? box[axis + 3] >= 1 : box[axis] <= 0;
    let L = own;
    if (onEdge) {
      const nb = pb[i + F.off];
      if (OPAQUE[nb]) continue;
      const Ln = pl[i + F.off];
      L = Math.max(Ln >> 4, own >> 4) << 4 | Math.max(Ln & 15, own & 15);
    }
    const uv = uvs[f];
    out.face(F.n, F.u, opts.flag || 0);
    for (let k = 0; k < 4; k++) {
      const c = [F.o[0] + F.u[0] * CU[k] + F.v[0] * CV[k], F.o[1] + F.u[1] * CU[k] + F.v[1] * CV[k], F.o[2] + F.u[2] * CU[k] + F.v[2] * CV[k]];
      const p = [c[0] ? box[3] : box[0], c[1] ? box[4] : box[1], c[2] ? box[5] : box[2]];
      // coordenadas de textura recortadas pela posição da caixa
      const ax = (vec) => (vec[0] ? 0 : vec[1] ? 1 : 2);
      const ua = ax(F.u), va = ax(F.v);
      const tu = F.u[ua] > 0 ? p[ua] : 1 - p[ua];
      const tv = F.v[va] > 0 ? p[va] : 1 - p[va];
      out.vert(x + p[0], y + p[1], z + p[2], uv[0] + (uv[2] - uv[0]) * tu, uv[1] + (uv[3] - uv[1]) * tv, (L >> 4) / 15, (L & 15) / 15, F.s, WHITE, 1);
    }
    out.quad(false);
  }
}

function emitCrop(out, x, y, z, meta, L) {
  const uv = tileUV('wheat_' + Math.min(7, meta & 7));
  const sky = (L >> 4) / 15, blk = (L & 15) / 15;
  out.face([0, 1, 0], [1, 0, 0], 0);
  const quads = [
    [0.25, 0, 0.25, 1], [0.75, 0, 0.75, 1], [0, 0.25, 1, 0.25], [0, 0.75, 1, 0.75],
  ];
  for (const [x0, z0, x1, z1] of quads) {
    out.vert(x + x0, y - 1 / 16, z + z0, uv[0], uv[1], sky, blk, 0.9, WHITE, 1, 0);
    out.vert(x + x1, y - 1 / 16, z + z1, uv[2], uv[1], sky, blk, 0.9, WHITE, 1, 0);
    out.vert(x + x1, y + 15 / 16, z + z1, uv[2], uv[3], sky, blk, 0.9, WHITE, 1, FLAG.PLANT);
    out.vert(x + x0, y + 15 / 16, z + z0, uv[0], uv[3], sky, blk, 0.9, WHITE, 1, FLAG.PLANT);
    out.quad(false);
    out.quadBack();
  }
}

function emitLadder(out, x, y, z, meta, L) {
  const uv = tileUV('ladder');
  const sky = (L >> 4) / 15, blk = (L & 15) / 15;
  const d = 1 / 16;
  // meta 1..4: a escada encosta na parede em -x, +x, -z, +z
  const pts = {
    1: [[d, 0, 1], [d, 0, 0], [d, 1, 0], [d, 1, 1]],
    2: [[1 - d, 0, 0], [1 - d, 0, 1], [1 - d, 1, 1], [1 - d, 1, 0]],
    3: [[0, 0, d], [1, 0, d], [1, 1, d], [0, 1, d]],
    4: [[1, 0, 1 - d], [0, 0, 1 - d], [0, 1, 1 - d], [1, 1, 1 - d]],
  }[meta] || [[d, 0, 1], [d, 0, 0], [d, 1, 0], [d, 1, 1]];
  const n = [null, [1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1]][meta] || [1, 0, 0];
  out.face(n, [0, 1, 0], 0);
  const uvs = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
  for (let k = 0; k < 4; k++) out.vert(x + pts[k][0], y + pts[k][1], z + pts[k][2], uvs[k][0], uvs[k][1], sky, blk, 0.85, WHITE);
  out.quad(false);
  out.quadBack();
}

// Cama: caixa de 9 px de altura; a textura de cima gira conforme a direção (pé → cabeceira)
const BED_DIRS = [[0, 1], [-1, 0], [0, -1], [1, 0]];
function emitBed(out, x, y, z, i, meta) {
  const head = !!(meta & 4);
  const [dx, dz] = BED_DIRS[meta & 3];
  const top = tileUV(head ? 'bed_top_head' : 'bed_top_foot');
  const side = tileUV('bed_side');
  const h = 9 / 16;
  const L = pl[i];
  const sky = (L >> 4) / 15, blk = (L & 15) / 15;
  // topo
  out.face([0, 1, 0], [-dz, 0, dx], 0);
  const corners = [[0, 1], [1, 1], [1, 0], [0, 0]];
  for (const [cx, cz] of corners) {
    const px = cx - 0.5, pz = cz - 0.5;
    const tv = px * dx + pz * dz + 0.5;
    const tu = px * -dz + pz * dx + 0.5;
    out.vert(x + cx, y + h, z + cz, top[0] + (top[2] - top[0]) * tu, top[1] + (top[3] - top[1]) * tv, sky, blk, 1, WHITE);
  }
  out.quad(false);
  // laterais: a faixa de 13 px de baixo da textura é encolhida para a altura da cama
  const vTop = side[3] - (side[3] - side[1]) * (3 / 16);
  for (const f of [0, 1, 4, 5]) {
    const F = FACES[f];
    const nb = pb[i + F.off];
    if (nb === B.BED) continue;
    if (OPAQUE[nb]) continue;
    out.face(F.n, F.u, 0);
    for (let k = 0; k < 4; k++) {
      const px = F.o[0] + F.u[0] * CU[k] + F.v[0] * CV[k];
      const py = (F.o[1] + F.u[1] * CU[k] + F.v[1] * CV[k]) * h;
      const pz = F.o[2] + F.u[2] * CU[k] + F.v[2] * CV[k];
      out.vert(x + px, y + py, z + pz, CU[k] ? side[2] : side[0], CV[k] ? vTop : side[1], sky, blk, F.s, WHITE);
    }
    out.quad(false);
    out.quadBack();
  }
}

function emitFace(out, x, y, z, F, ni, uv, tint, cutoutFace) {
  const aos = [0, 0, 0, 0];
  const sk = [0, 0, 0, 0], bl = [0, 0, 0, 0];
  const L0 = pl[ni];
  for (let k = 0; k < 4; k++) {
    const s1 = ni + (CU[k] ? F.uoff : -F.uoff);
    const s2 = ni + (CV[k] ? F.voff : -F.voff);
    const cc = s1 + (CV[k] ? F.voff : -F.voff);
    const o1 = OPAQUE[pb[s1]], o2 = OPAQUE[pb[s2]], oc = OPAQUE[pb[cc]];
    aos[k] = o1 && o2 ? 0 : 3 - (o1 + o2 + oc);
    let s = L0 >> 4, b = L0 & 15, n = 1;
    if (!o1) { s += pl[s1] >> 4; b += pl[s1] & 15; n++; }
    if (!o2) { s += pl[s2] >> 4; b += pl[s2] & 15; n++; }
    if (!oc && (!o1 || !o2)) { s += pl[cc] >> 4; b += pl[cc] & 15; n++; }
    sk[k] = s / n / 15;
    bl[k] = b / n / 15;
  }
  if (cutoutFace) {
    // folhas e vidro: sem oclusão escura para não manchar
    for (let k = 0; k < 4; k++) aos[k] = Math.max(aos[k], 2);
  }
  for (let k = 0; k < 4; k++) {
    const px = x + F.o[0] + F.u[0] * CU[k] + F.v[0] * CV[k];
    const py = y + F.o[1] + F.u[1] * CU[k] + F.v[1] * CV[k];
    const pz = z + F.o[2] + F.u[2] * CU[k] + F.v[2] * CV[k];
    out.vert(px, py, pz, CU[k] ? uv[2] : uv[0], CV[k] ? uv[3] : uv[1], sk[k], bl[k], F.s, tint, AO_CURVE[aos[k]]);
  }
  out.quad(aos[0] + aos[2] < aos[1] + aos[3]);
}

function emitLiquid(out, x, y, z, i, id) {
  const h00 = cornerHeight(x, y, z, id), h10 = cornerHeight(x + 1, y, z, id);
  const h01 = cornerHeight(x, y, z + 1, id), h11 = cornerHeight(x + 1, y, z + 1, id);
  const uv = faceUV[id][2][0];
  const own = pl[i];
  const tint = WHITE;
  const lightOf = (j) => {
    const L = Math.max(pl[j] >> 4, own >> 4);
    const Lb = Math.max(pl[j] & 15, own & 15);
    return [L / 15, Lb / 15];
  };
  const lavaFlag = id === B.LAVA ? FLAG.LAVA : 0;
  // topo
  if (pb[i + SY] !== id) {
    const [s, b] = lightOf(i + SY);
    out.face([0, 1, 0], [1, 0, 0], id === B.WATER ? FLAG.WATER : lavaFlag);
    out.vert(x, y + h01, z + 1, uv[0], uv[1], s, b, 1, tint);
    out.vert(x + 1, y + h11, z + 1, uv[2], uv[1], s, b, 1, tint);
    out.vert(x + 1, y + h10, z, uv[2], uv[3], s, b, 1, tint);
    out.vert(x, y + h00, z, uv[0], uv[3], s, b, 1, tint);
    out.quad(false);
    if (id === B.WATER) out.quadBack(); // visível de baixo d'água
  }
  // fundo
  const below = pb[i - SY];
  if (below !== id && !OPAQUE[below]) {
    const [s, b] = lightOf(i - SY);
    out.face([0, -1, 0], [1, 0, 0], lavaFlag);
    out.vert(x, y, z, uv[0], uv[1], s, b, 0.5, tint);
    out.vert(x + 1, y, z, uv[2], uv[1], s, b, 0.5, tint);
    out.vert(x + 1, y, z + 1, uv[2], uv[3], s, b, 0.5, tint);
    out.vert(x, y, z + 1, uv[0], uv[3], s, b, 0.5, tint);
    out.quad(false);
  }
  // laterais
  const sides = [
    [0, [x + 1, z + 1, h11], [x + 1, z, h10]],
    [1, [x, z, h00], [x, z + 1, h01]],
    [4, [x, z + 1, h01], [x + 1, z + 1, h11]],
    [5, [x + 1, z, h10], [x, z, h00]],
  ];
  for (const [f, a, c] of sides) {
    const F = FACES[f];
    const ni = i + F.off;
    const nb = pb[ni];
    if (nb === id || OPAQUE[nb]) continue;
    const [s, b] = lightOf(ni);
    out.face(F.n, F.u, lavaFlag);
    const vTop = (h) => uv[1] + (uv[3] - uv[1]) * h;
    out.vert(a[0], y, a[1], uv[0], uv[1], s, b, F.s, tint);
    out.vert(c[0], y, c[1], uv[2], uv[1], s, b, F.s, tint);
    out.vert(c[0], y + c[2], c[1], uv[2], vTop(c[2]), s, b, F.s, tint);
    out.vert(a[0], y + a[2], a[1], uv[0], vTop(a[2]), s, b, F.s, tint);
    out.quad(false);
    if (id === B.WATER) out.quadBack();
  }
}

// Tocha: caixa fina de 2×10×2 pixels; inclinada quando presa na parede.
export function torchQuads(meta) {
  const p0 = 7 / 16, p1 = 9 / 16, top = 10 / 16;
  const uvT = tileUV('torch');
  const U = (px) => uvT[0] + (uvT[2] - uvT[0]) * (px / 16);
  const V = (py) => uvT[3] - (uvT[3] - uvT[1]) * (py / 16); // py medido do topo da textura
  const quads = [];
  const side = (pts, sh) => quads.push({ pts, uv: [U(7), V(16), U(9), V(6)], sh });
  side([[p1, 0, p1], [p1, 0, p0], [p1, top, p0], [p1, top, p1]], 0.8);
  side([[p0, 0, p0], [p0, 0, p1], [p0, top, p1], [p0, top, p0]], 0.8);
  side([[p0, 0, p1], [p1, 0, p1], [p1, top, p1], [p0, top, p1]], 0.9);
  side([[p1, 0, p0], [p0, 0, p0], [p0, top, p0], [p1, top, p0]], 0.9);
  quads.push({ pts: [[p0, top, p1], [p1, top, p1], [p1, top, p0], [p0, top, p0]], uv: [U(7), V(8), U(9), V(6)], sh: 1 });
  quads.push({ pts: [[p0, 0, p0], [p1, 0, p0], [p1, 0, p1], [p0, 0, p1]], uv: [U(7), V(16), U(9), V(14)], sh: 0.6 });
  if (meta) {
    const dir = [null, [1, 0], [-1, 0], [0, 1], [0, -1]][meta];
    for (const q of quads) {
      q.pts = q.pts.map(([px, py, pz]) => [px - dir[0] * 0.4 + dir[0] * py * 0.4, py + 0.2, pz - dir[1] * 0.4 + dir[1] * py * 0.4]);
    }
  }
  return quads;
}
const torchCache = [];
function emitTorch(out, x, y, z, meta, L) {
  const quads = torchCache[meta] || (torchCache[meta] = torchQuads(meta));
  const sky = (L >> 4) / 15;
  for (const q of quads) {
    const [a, b2, c2] = q.pts;
    const e1 = [b2[0] - a[0], b2[1] - a[1], b2[2] - a[2]], e2 = [c2[0] - a[0], c2[1] - a[1], c2[2] - a[2]];
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const nl = Math.hypot(n[0], n[1], n[2]) || 1;
    out.face([n[0] / nl, n[1] / nl, n[2] / nl], [e1[0], e1[1], e1[2]], 0);
    const [u0, v0, u1, v1] = q.uv;
    const uvs = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    for (let k = 0; k < 4; k++) {
      const p = q.pts[k];
      out.vert(x + p[0], y + p[1], z + p[2], uvs[k][0], uvs[k][1], sky, 1, q.sh, WHITE);
    }
    out.quad(false);
  }
}

// Geometria de um bloco solto (itens no chão, bloco na mão, blocos caindo), centrada na origem.
const blockGeoCache = new Map();
export function blockItemGeometry(id) {
  if (blockGeoCache.has(id)) return blockGeoCache.get(id);
  if (!faceUV) buildFaceUV();
  const b = BLOCKS[id];
  const buf = new Buf();
  for (let f = 0; f < 6; f++) {
    const F = FACES[f];
    const uv = faceUV[id][f][0];
    const tint = b.tint === 'grass' && f === 2 ? GRASS_TINT[2] : b.tint === 'foliage' ? FOLIAGE_TINT[2] : WHITE;
    buf.face(F.n, F.u, 0);
    for (let k = 0; k < 4; k++) {
      const px = F.o[0] + F.u[0] * CU[k] + F.v[0] * CV[k] - 0.5;
      const py = F.o[1] + F.u[1] * CU[k] + F.v[1] * CV[k] - 0.5;
      const pz = F.o[2] + F.u[2] * CU[k] + F.v[2] * CV[k] - 0.5;
      buf.vert(px, py, pz, CU[k] ? uv[2] : uv[0], CV[k] ? uv[3] : uv[1], 1, 0, F.s, tint);
    }
    buf.quad(false);
  }
  const g = buf.geometry();
  blockGeoCache.set(id, g);
  return g;
}

// Mundo: chunks, propagação de luz (céu e blocos), atualizações de blocos e líquidos.
import { CS, CH, idx, chunkKey, SEA } from './consts.js';
import { BLOCKS, B } from './blocks.js';
import { Terrain } from './terrain.js';
import { mulberry32 } from './noise.js';

// Tabelas rápidas por id de bloco
export const OPAQUE = new Uint8Array(256);
export const OPACITY = new Uint8Array(256);
export const EMIT = new Uint8Array(256);
export const SOLID = new Uint8Array(256);
export const LIQUID = new Uint8Array(256);
for (const b of BLOCKS) {
  if (!b) continue;
  OPAQUE[b.id] = b.opaque ? 1 : 0;
  OPACITY[b.id] = b.opaque ? 15 : b.opacity;
  EMIT[b.id] = b.light;
  SOLID[b.id] = b.solid ? 1 : 0;
  LIQUID[b.id] = b.render === 'liquid' ? 1 : 0;
}

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.key = chunkKey(cx, cz);
    this.blocks = new Uint8Array(CS * CS * CH);
    this.meta = new Uint8Array(CS * CS * CH);
    this.light = new Uint8Array(CS * CS * CH); // céu << 4 | bloco
    this.heights = new Uint8Array(CS * CS);
    this.biomes = new Uint8Array(CS * CS);
    this.skyTop = new Uint8Array(CS * CS);
    this.nb = [null, null, null, null]; // +x, -x, +z, -z
    this.lit = false;
    this.dirty = true;
    this.meshes = null;
    this.torches = [];
  }
  computeSkyTop() {
    const { blocks } = this;
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      let y = CH - 1;
      while (y > 0 && OPACITY[blocks[idx(x, y, z)]] === 0) y--;
      this.skyTop[z * CS + x] = y;
    }
  }
}

// Direções: +x, -x, +y, -y, +z, -z
const DX = [1, -1, 0, 0, 0, 0];
const DY = [0, 0, 1, -1, 0, 0];
const DZ = [0, 0, 0, 0, 1, -1];
const DOWN = 3;

function markDirty(c, x, z) {
  c.dirty = true;
  if (x === 0 && c.nb[1]) c.nb[1].dirty = true;
  else if (x === CS - 1 && c.nb[0]) c.nb[0].dirty = true;
  if (z === 0 && c.nb[3]) c.nb[3].dirty = true;
  else if (z === CS - 1 && c.nb[2]) c.nb[2].dirty = true;
  // cantos (oclusão de ambiente usa os vizinhos diagonais)
  if ((x === 0 || x === CS - 1) && (z === 0 || z === CS - 1)) {
    const a = c.nb[x === 0 ? 1 : 0];
    const d = a && a.nb[z === 0 ? 3 : 2];
    if (d) d.dirty = true;
  }
}

// Fila reutilizável da propagação de luz
class LightQueue {
  constructor() {
    this.c = [];
    this.i = [];
    this.l = [];
    this.head = 0;
    this.len = 0;
  }
  push(c, i, l = 0) {
    this.c[this.len] = c;
    this.i[this.len] = i;
    this.l[this.len] = l;
    this.len++;
  }
  reset() {
    this.head = 0;
    this.len = 0;
    this.c.length = 0;
  }
}
const addQ = new LightQueue();
const remQ = new LightQueue();

// Vizinho de (c, x, y, z) na direção d → retorna chunk e grava as coords locais em OUT
const OUT = [0, 0, 0];
function neighbor(c, x, y, z, d) {
  let nx = x + DX[d], ny = y + DY[d], nz = z + DZ[d];
  if (ny < 0 || ny >= CH) return null;
  let nc = c;
  if (nx < 0) { nc = c.nb[1]; nx += CS; } else if (nx >= CS) { nc = c.nb[0]; nx -= CS; } else if (nz < 0) { nc = c.nb[3]; nz += CS; } else if (nz >= CS) { nc = c.nb[2]; nz -= CS; }
  OUT[0] = nx; OUT[1] = ny; OUT[2] = nz;
  return nc;
}

const getL = (c, i, sky) => (sky ? c.light[i] >> 4 : c.light[i] & 15);
const setL = (c, i, sky, v) => {
  c.light[i] = sky ? (c.light[i] & 15) | (v << 4) : (c.light[i] & 0xf0) | v;
};

function propagate(q, sky) {
  while (q.head < q.len) {
    const c = q.c[q.head], i = q.i[q.head];
    q.head++;
    const level = getL(c, i, sky);
    if (level <= 1) continue;
    const x = i & 15, z = (i >> 4) & 15, y = i >> 8;
    for (let d = 0; d < 6; d++) {
      const nc = neighbor(c, x, y, z, d);
      if (!nc) continue;
      const ni = (OUT[1] << 8) | (OUT[2] << 4) | OUT[0];
      const op = OPACITY[nc.blocks[ni]];
      if (op >= 15) continue;
      let nl = level - 1 - op;
      if (sky && d === DOWN && level === 15 && op === 0) nl = 15;
      if (nl > getL(nc, ni, sky)) {
        setL(nc, ni, sky, nl);
        markDirty(nc, OUT[0], OUT[2]);
        q.push(nc, ni);
      }
    }
  }
  q.reset();
}

function unpropagate(rq, aq, sky) {
  while (rq.head < rq.len) {
    const c = rq.c[rq.head], i = rq.i[rq.head], level = rq.l[rq.head];
    rq.head++;
    const x = i & 15, z = (i >> 4) & 15, y = i >> 8;
    for (let d = 0; d < 6; d++) {
      const nc = neighbor(c, x, y, z, d);
      if (!nc) continue;
      const ni = (OUT[1] << 8) | (OUT[2] << 4) | OUT[0];
      const nl = getL(nc, ni, sky);
      if (nl === 0) continue;
      if (nl < level || (sky && d === DOWN && level === 15 && nl === 15)) {
        setL(nc, ni, sky, 0);
        markDirty(nc, OUT[0], OUT[2]);
        const id = nc.blocks[ni];
        if (!sky && EMIT[id]) {
          setL(nc, ni, false, EMIT[id]);
          aq.push(nc, ni);
        } else if (sky && OUT[1] === CH - 1 && OPACITY[id] === 0) {
          setL(nc, ni, true, 15);
          aq.push(nc, ni);
        }
        rq.push(nc, ni, nl);
      } else {
        aq.push(nc, ni);
      }
    }
  }
  rq.reset();
}

export class World {
  constructor(seed, saved = null) {
    this.seed = seed;
    this.terrain = new Terrain(seed);
    this.chunks = new Map();
    this.edits = new Map(); // chunkKey -> Map(index -> id | meta << 8)
    this.tileEntities = new Map(); // "x,y,z" -> dados (fornalha, baú)
    this.scheduled = new Map(); // "x,y,z" -> tick
    this.time = 1000; // ticks do dia (0 = nascer do sol)
    this.tickCount = 0;
    this.hooks = {}; // callbacks do jogo: onBreakDrop, onFalling, onUnload, onBlockChanged
    this.rnd = mulberry32(seed ^ 0x9e3779b9);
    if (saved) this.loadEdits(saved);
  }

  // ---------- acesso ----------
  getChunk(cx, cz) {
    return this.chunks.get(chunkKey(cx, cz));
  }
  getBlock(x, y, z) {
    if (y < 0) return B.BEDROCK;
    if (y >= CH) return B.AIR;
    const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!c) return B.AIR;
    return c.blocks[(y << 8) | ((z & 15) << 4) | (x & 15)];
  }
  getMeta(x, y, z) {
    if (y < 0 || y >= CH) return 0;
    const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!c) return 0;
    return c.meta[(y << 8) | ((z & 15) << 4) | (x & 15)];
  }
  // luz: [céu, bloco]
  getLight(x, y, z) {
    if (y >= CH) return 0xf0;
    if (y < 0) return 0;
    const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!c || !c.lit) return 0xf0;
    return c.light[(y << 8) | ((z & 15) << 4) | (x & 15)];
  }
  isReady(x, z) {
    const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
    return !!(c && c.lit);
  }
  isSolid(x, y, z) {
    return SOLID[this.getBlock(x, y, z)] === 1;
  }

  // ---------- edição ----------
  setBlock(x, y, z, id, meta = 0, opts = {}) {
    if (y < 0 || y >= CH) return false;
    const c = this.chunks.get(chunkKey(x >> 4, z >> 4));
    if (!c || !c.lit) return false;
    const lx = x & 15, lz = z & 15;
    const i = (y << 8) | (lz << 4) | lx;
    const old = c.blocks[i];
    if (old === id && c.meta[i] === meta) return false;
    c.blocks[i] = id;
    c.meta[i] = meta;
    let em = this.edits.get(c.key);
    if (!em) this.edits.set(c.key, (em = new Map()));
    em.set(i, id | (meta << 8));
    if (old !== id) {
      if (OPACITY[old] !== OPACITY[id] || EMIT[old] !== EMIT[id]) this.relight(c, lx, y, lz);
      const key = `${x},${y},${z}`;
      if (this.tileEntities.has(key) && id !== B.FURNACE && id !== B.FURNACE_LIT && id !== B.CHEST) {
        this.hooks.onTileRemoved?.(x, y, z, this.tileEntities.get(key));
        this.tileEntities.delete(key);
      }
    }
    markDirty(c, lx, lz);
    if (opts.priority !== false) c.priority = true;
    if (!opts.noUpdate) {
      this.schedule(x, y, z, LIQUID[id] ? this.liquidDelay(id) : 1);
      for (let d = 0; d < 6; d++) {
        const nx = x + DX[d], ny = y + DY[d], nz = z + DZ[d];
        const nid = this.getBlock(nx, ny, nz);
        this.schedule(nx, ny, nz, LIQUID[nid] ? this.liquidDelay(nid) : 1);
      }
    }
    this.hooks.onBlockChanged?.(x, y, z, old, id);
    return true;
  }

  relight(c, x, y, z) {
    const i = (y << 8) | (z << 4) | x;
    const id = c.blocks[i];
    for (const sky of [true, false]) {
      const old = getL(c, i, sky);
      setL(c, i, sky, 0);
      remQ.push(c, i, old);
      unpropagate(remQ, addQ, sky);
      if (!sky && EMIT[id]) {
        setL(c, i, false, EMIT[id]);
        addQ.push(c, i);
      }
      if (sky && y === CH - 1 && OPACITY[id] === 0) {
        setL(c, i, true, 15);
        addQ.push(c, i);
      }
      for (let d = 0; d < 6; d++) {
        const nc = neighbor(c, x, y, z, d);
        if (!nc) continue;
        const ni = (OUT[1] << 8) | (OUT[2] << 4) | OUT[0];
        if (getL(nc, ni, sky) > 0) addQ.push(nc, ni);
      }
      propagate(addQ, sky);
    }
    markDirty(c, x, z);
  }

  // ---------- carregamento ----------
  ensureChunk(cx, cz) {
    const key = chunkKey(cx, cz);
    let c = this.chunks.get(key);
    if (c) return c;
    c = new Chunk(cx, cz);
    this.terrain.generate(c);
    const em = this.edits.get(key);
    if (em) for (const [i, v] of em) { c.blocks[i] = v & 255; c.meta[i] = v >> 8; }
    c.computeSkyTop();
    this.chunks.set(key, c);
    const link = (ox, oz, a, b) => {
      const n = this.chunks.get(chunkKey(cx + ox, cz + oz));
      if (n) { c.nb[a] = n; n.nb[b] = c; }
    };
    link(1, 0, 0, 1);
    link(-1, 0, 1, 0);
    link(0, 1, 2, 3);
    link(0, -1, 3, 2);
    return c;
  }

  allNeighbors(c, pred) {
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const n = this.chunks.get(chunkKey(c.cx + dx, c.cz + dz));
      if (!n || !pred(n)) return false;
    }
    return true;
  }

  lightChunk(c) {
    const { blocks, light } = c;
    // 1. colunas de luz do céu
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      let level = 15;
      for (let y = CH - 1; y >= 0; y--) {
        const i = (y << 8) | (z << 4) | x;
        const op = OPACITY[blocks[i]];
        if (op >= 15) break;
        if (op > 0) level -= op;
        if (level <= 0) break;
        if (level > light[i] >> 4) light[i] = (light[i] & 15) | (level << 4);
      }
    }
    // 2. sementes: células iluminadas que podem espalhar luz para os lados
    const topOf = (n, x, z) => (n ? n.skyTop[z * CS + x] : 0);
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const own = c.skyTop[z * CS + x];
      const nbMax = Math.max(
        x < CS - 1 ? c.skyTop[z * CS + x + 1] : topOf(c.nb[0], 0, z),
        x > 0 ? c.skyTop[z * CS + x - 1] : topOf(c.nb[1], CS - 1, z),
        z < CS - 1 ? c.skyTop[(z + 1) * CS + x] : topOf(c.nb[2], x, 0),
        z > 0 ? c.skyTop[(z - 1) * CS + x] : topOf(c.nb[3], x, CS - 1),
      );
      const lim = Math.min(CH - 1, Math.max(own, nbMax) + 1);
      for (let y = 0; y <= lim; y++) {
        const i = (y << 8) | (z << 4) | x;
        if (light[i] >> 4 > 1) addQ.push(c, i);
      }
    }
    // 3. bordas de vizinhos já iluminados
    const borders = [
      [c.nb[0], (y, k) => (y << 8) | (k << 4) | 0],
      [c.nb[1], (y, k) => (y << 8) | (k << 4) | (CS - 1)],
      [c.nb[2], (y, k) => (y << 8) | (0 << 4) | k],
      [c.nb[3], (y, k) => (y << 8) | ((CS - 1) << 4) | k],
    ];
    for (const [n, f] of borders) {
      if (!n || !n.lit) continue;
      for (let y = 0; y < CH; y++) for (let k = 0; k < CS; k++) {
        const i = f(y, k);
        if (n.light[i] >> 4 > 1) addQ.push(n, i);
      }
    }
    c.lit = true;
    propagate(addQ, true);
    // luz de blocos
    for (let i = 0; i < blocks.length; i++) {
      const e = EMIT[blocks[i]];
      if (e) {
        if (e > (light[i] & 15)) light[i] = (light[i] & 0xf0) | e;
        addQ.push(c, i);
      }
    }
    for (const [n, f] of borders) {
      if (!n || !n.lit) continue;
      for (let y = 0; y < CH; y++) for (let k = 0; k < CS; k++) {
        const i = f(y, k);
        if ((n.light[i] & 15) > 1) addQ.push(n, i);
      }
    }
    propagate(addQ, false);
    c.dirty = true;
  }

  // Gera, ilumina e descarrega chunks em volta do jogador, dentro de um orçamento de tempo.
  update(px, pz, radius, budgetMs = 8) {
    const t0 = performance.now();
    const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS);
    const R = radius + 2;
    if (!this._order || this._orderR !== R) {
      this._orderR = R;
      this._order = [];
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) this._order.push([dx, dz, dx * dx + dz * dz]);
      this._order.sort((a, b) => a[2] - b[2]);
    }
    let pending = 0;
    for (const [dx, dz] of this._order) {
      const cx = pcx + dx, cz = pcz + dz;
      const cheb = Math.max(Math.abs(dx), Math.abs(dz));
      let c = this.chunks.get(chunkKey(cx, cz));
      if (!c) {
        if (performance.now() - t0 > budgetMs) { pending++; continue; }
        c = this.ensureChunk(cx, cz);
      }
      if (!c.lit && cheb <= R - 1) {
        if (performance.now() - t0 > budgetMs || !this.allNeighbors(c, () => true)) { pending++; continue; }
        this.lightChunk(c);
      }
    }
    // descarrega os distantes
    for (const c of this.chunks.values()) {
      if (Math.abs(c.cx - pcx) > R + 2 || Math.abs(c.cz - pcz) > R + 2) this.unload(c);
    }
    return pending;
  }

  unload(c) {
    this.hooks.onUnload?.(c);
    const [px, nx, pz, nz] = c.nb;
    if (px) px.nb[1] = null;
    if (nx) nx.nb[0] = null;
    if (pz) pz.nb[3] = null;
    if (nz) nz.nb[2] = null;
    this.chunks.delete(c.key);
  }

  // Pode montar a malha: iluminado e com os 8 vizinhos iluminados.
  canMesh(c) {
    return c.lit && this.allNeighbors(c, (n) => n.lit);
  }

  // ---------- atualizações agendadas ----------
  schedule(x, y, z, delay) {
    if (y < 0 || y >= CH) return;
    const key = `${x},${y},${z}`;
    const t = this.tickCount + delay;
    const cur = this.scheduled.get(key);
    if (cur === undefined || cur > t) this.scheduled.set(key, t);
  }
  liquidDelay(id) {
    return id === B.LAVA ? 30 : 5;
  }

  tick(px, pz) {
    this.tickCount++;
    this.time = (this.time + 1) % 24000;
    if (this.scheduled.size) {
      const due = [];
      for (const [k, t] of this.scheduled) if (t <= this.tickCount) due.push(k);
      for (const k of due.slice(0, 600)) {
        this.scheduled.delete(k);
        const [x, y, z] = k.split(',').map(Number);
        if (this.isReady(x, z)) this.blockUpdate(x, y, z);
        else this.scheduled.delete(k);
      }
    }
    this.randomTicks(px, pz);
  }

  blockUpdate(x, y, z) {
    const id = this.getBlock(x, y, z);
    if (!id) return;
    const b = BLOCKS[id];
    if (LIQUID[id]) return this.flowLiquid(x, y, z, id);
    if (b.gravity) {
      const below = this.getBlock(x, y - 1, z);
      if (below === B.AIR || LIQUID[below] || BLOCKS[below].replaceable) {
        this.setBlock(x, y, z, B.AIR);
        this.hooks.onFalling?.(x, y, z, id);
      }
      return;
    }
    if (id === B.GRASS && OPAQUE[this.getBlock(x, y + 1, z)]) {
      this.setBlock(x, y, z, B.DIRT, 0, { noUpdate: true, priority: false });
      return;
    }
    if (b.needsSupport && !this.supported(x, y, z, id)) {
      this.breakBlock(x, y, z, true);
    }
  }

  supported(x, y, z, id) {
    const below = this.getBlock(x, y - 1, z);
    if (id === B.TORCH) {
      const m = this.getMeta(x, y, z);
      if (m === 0) return SOLID[below] && OPAQUE[below] || below === B.GLASS;
      // meta 1..4: preso na parede (+x, -x, +z, -z indicam para onde a tocha aponta)
      const off = [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]][m];
      return OPAQUE[this.getBlock(x + off[0], y, z + off[1])] === 1;
    }
    if (id === B.CACTUS) {
      if (below !== B.SAND && below !== B.CACTUS) return false;
      for (let d of [0, 1, 4, 5]) if (SOLID[this.getBlock(x + DX[d], y, z + DZ[d])]) return false;
      return true;
    }
    if (id === B.SUGAR_CANE) {
      if (below === B.SUGAR_CANE) return true;
      if (below !== B.GRASS && below !== B.DIRT && below !== B.SAND) return false;
      for (let d of [0, 1, 4, 5]) if (this.getBlock(x + DX[d], y - 1, z + DZ[d]) === B.WATER) return true;
      return false;
    }
    if (id === B.DEAD_BUSH) return below === B.SAND || below === B.DIRT || below === B.GRASS;
    return below === B.GRASS || below === B.DIRT || below === B.SNOW_GRASS;
  }

  breakBlock(x, y, z, drop) {
    const id = this.getBlock(x, y, z);
    if (!id) return;
    this.setBlock(x, y, z, B.AIR);
    if (drop) this.hooks.onBreakDrop?.(x, y, z, id);
  }

  flowLiquid(x, y, z, id) {
    const m = this.getMeta(x, y, z);
    const step = id === B.LAVA ? 2 : 1;
    const other = id === B.WATER ? B.LAVA : B.WATER;
    // lava encostada na água vira pedra
    if (id === B.LAVA) {
      for (const d of [0, 1, 2, 4, 5]) {
        if (this.getBlock(x + DX[d], y + DY[d], z + DZ[d]) === B.WATER) {
          this.setBlock(x, y, z, m === 0 ? B.OBSIDIAN : B.COBBLE);
          this.hooks.onFizz?.(x, y, z);
          return;
        }
      }
    }
    if (m !== 0) {
      let nm;
      if (this.getBlock(x, y + 1, z) === id) nm = 8;
      else {
        let min = 99, sources = 0;
        for (const d of [0, 1, 4, 5]) {
          const nx = x + DX[d], nz = z + DZ[d];
          if (this.getBlock(nx, y, nz) !== id) continue;
          const mm = this.getMeta(nx, y, nz);
          if (mm === 0) sources++;
          min = Math.min(min, mm >= 8 ? 0 : mm);
        }
        nm = min + step;
        const below = this.getBlock(x, y - 1, z);
        if (id === B.WATER && sources >= 2 && (SOLID[below] || (below === B.WATER && this.getMeta(x, y - 1, z) === 0))) nm = 0;
      }
      if (nm > 7) {
        this.setBlock(x, y, z, B.AIR, 0, { priority: false });
        return;
      }
      if (nm !== m) {
        this.setBlock(x, y, z, id, nm, { priority: false });
        return;
      }
    }
    const below = this.getBlock(x, y - 1, z);
    if (this.canFlowInto(x, y - 1, z, id, 8)) {
      this.setBlock(x, y - 1, z, id, 8, { priority: false });
    } else if (below !== id && below !== other) {
      const level = (m >= 8 ? 0 : m) + step;
      if (level > 7) return;
      for (const d of [0, 1, 4, 5]) {
        const nx = x + DX[d], nz = z + DZ[d];
        if (this.canFlowInto(nx, y, nz, id, level)) this.setBlock(nx, y, nz, id, level, { priority: false });
      }
    }
  }

  canFlowInto(x, y, z, id, level) {
    if (y < 0) return false;
    const t = this.getBlock(x, y, z);
    if (t === B.AIR) return true;
    if (t === id) {
      const tm = this.getMeta(x, y, z);
      return tm !== 0 && tm < 8 && tm > level;
    }
    if (LIQUID[t]) {
      // encontro de água e lava
      const tm = this.getMeta(x, y, z);
      if (t === B.LAVA) this.setBlock(x, y, z, tm === 0 ? B.OBSIDIAN : B.COBBLE);
      else this.setBlock(x, y, z, B.STONE);
      this.hooks.onFizz?.(x, y, z);
      return false;
    }
    const b = BLOCKS[t];
    if (b.replaceable || (!b.solid && b.render !== 'liquid')) {
      this.breakBlock(x, y, z, true);
      return true;
    }
    return false;
  }

  randomTicks(px, pz) {
    const pcx = Math.floor(px / CS), pcz = Math.floor(pz / CS);
    const rnd = this.rnd;
    for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) {
      const c = this.chunks.get(chunkKey(pcx + dx, pcz + dz));
      if (!c || !c.lit) continue;
      for (let k = 0; k < 12; k++) {
        const x = (rnd() * 16) | 0, z = (rnd() * 16) | 0, y = 1 + ((rnd() * (CH - 2)) | 0);
        const i = (y << 8) | (z << 4) | x;
        const id = c.blocks[i];
        if (id === B.AIR) continue;
        const wx = c.cx * CS + x, wz = c.cz * CS + z;
        if (id === B.DIRT) {
          const above = this.getBlock(wx, y + 1, wz);
          if (OPACITY[above] > 1 || (this.getLight(wx, y + 1, wz) >> 4) < 9) continue;
          for (let t = 0; t < 4; t++) {
            const ox = ((rnd() * 3) | 0) - 1, oy = ((rnd() * 5) | 0) - 3, oz = ((rnd() * 3) | 0) - 1;
            if (this.getBlock(wx + ox, y + oy, wz + oz) === B.GRASS) {
              this.setBlock(wx, y, wz, B.GRASS, 0, { noUpdate: true, priority: false });
              break;
            }
          }
        } else if (id === B.GRASS) {
          if (OPACITY[this.getBlock(wx, y + 1, wz)] > 1) this.setBlock(wx, y, wz, B.DIRT, 0, { noUpdate: true, priority: false });
        } else if (id === B.SAPLING) {
          if (rnd() < 0.12 && (this.getLight(wx, y + 1, wz) >> 4) >= 9) this.growTree(wx, y, wz);
        } else if (id === B.SUGAR_CANE || id === B.CACTUS) {
          if (rnd() < 0.15 && this.getBlock(wx, y + 1, wz) === B.AIR) {
            let h = 1;
            while (this.getBlock(wx, y - h, wz) === id) h++;
            if (h < 3) this.setBlock(wx, y + 1, wz, id, 0, { priority: false });
          }
        }
      }
    }
  }

  growTree(x, y, z) {
    const H = 4 + ((this.rnd() * 3) | 0);
    for (let k = 1; k <= H + 1; k++) if (OPAQUE[this.getBlock(x, y + k, z)]) return false;
    this.setBlock(x, y, z, B.LOG, 0, { noUpdate: true, priority: false });
    const top = y + H - 1;
    for (let yy = top - 2; yy <= top + 1; yy++) {
      const rad = yy >= top ? 1 : 2;
      for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
        if (Math.abs(dx) === rad && Math.abs(dz) === rad && (yy === top + 1 || this.rnd() < 0.5)) continue;
        if (this.getBlock(x + dx, yy, z + dz) === B.AIR) this.setBlock(x + dx, yy, z + dz, B.LEAVES, 0, { noUpdate: true, priority: false });
      }
    }
    for (let yy = y; yy <= top; yy++) this.setBlock(x, yy, z, B.LOG, 0, { noUpdate: true, priority: false });
    this.setBlock(x, y - 1, z, B.DIRT, 0, { noUpdate: true, priority: false });
    return true;
  }

  // Explosão de TNT: retorna os blocos destruídos
  explode(x, y, z, power) {
    const removed = [];
    const r = Math.ceil(power);
    for (let dy = -r; dy <= r; dy++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > power * (0.75 + this.rnd() * 0.35)) continue;
      const bx = Math.floor(x) + dx, by = Math.floor(y) + dy, bz = Math.floor(z) + dz;
      const id = this.getBlock(bx, by, bz);
      if (!id || id === B.BEDROCK || id === B.OBSIDIAN || LIQUID[id]) continue;
      removed.push([bx, by, bz, id]);
    }
    for (const [bx, by, bz, id] of removed) {
      if (id === B.TNT) { this.setBlock(bx, by, bz, B.AIR); this.hooks.onTntChain?.(bx, by, bz); continue; }
      this.setBlock(bx, by, bz, B.AIR, 0, { priority: true });
      if (this.rnd() < 0.3) this.hooks.onBreakDrop?.(bx, by, bz, id);
    }
    return removed;
  }

  // ---------- raio (seleção de blocos) ----------
  raycast(ox, oy, oz, dx, dy, dz, maxDist, hitLiquid = false) {
    let x = Math.floor(ox), y = Math.floor(oy), z = Math.floor(oz);
    const sx = Math.sign(dx), sy = Math.sign(dy), sz = Math.sign(dz);
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tdz = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tmx = dx !== 0 ? (sx > 0 ? x + 1 - ox : ox - x) * tdx : Infinity;
    let tmy = dy !== 0 ? (sy > 0 ? y + 1 - oy : oy - y) * tdy : Infinity;
    let tmz = dz !== 0 ? (sz > 0 ? z + 1 - oz : oz - z) * tdz : Infinity;
    let face = [0, 0, 0], t = 0;
    for (let n = 0; n < 200; n++) {
      const id = this.getBlock(x, y, z);
      if (id !== B.AIR && (hitLiquid || !LIQUID[id])) {
        const b = BLOCKS[id];
        let hit = true;
        if (b.render === 'cross' || b.render === 'torch') {
          // caixas menores para plantas e tochas
          const box = b.render === 'torch' ? [0.38, 0, 0.38, 0.62, 0.65, 0.62] : [0.15, 0, 0.15, 0.85, 0.8, 0.85];
          hit = rayBox(ox - x, oy - y, oz - z, dx, dy, dz, box, maxDist);
        }
        if (hit) return { x, y, z, id, face, dist: t };
      }
      if (tmx < tmy && tmx < tmz) {
        if (tmx > maxDist) break;
        x += sx; t = tmx; tmx += tdx; face = [-sx, 0, 0];
      } else if (tmy < tmz) {
        if (tmy > maxDist) break;
        y += sy; t = tmy; tmy += tdy; face = [0, -sy, 0];
      } else {
        if (tmz > maxDist) break;
        z += sz; t = tmz; tmz += tdz; face = [0, 0, -sz];
      }
    }
    return null;
  }

  // ---------- salvar ----------
  serializeEdits() {
    const out = [];
    for (const [key, m] of this.edits) {
      if (!m.size) continue;
      const arr = [];
      for (const [i, v] of m) arr.push(i, v);
      out.push([key, arr]);
    }
    return out;
  }
  loadEdits(saved) {
    for (const [key, arr] of saved) {
      const m = new Map();
      for (let k = 0; k < arr.length; k += 2) m.set(arr[k], arr[k + 1]);
      this.edits.set(key, m);
    }
  }

  // nível do céu de 0 a 1 (luz do dia)
  daylight() {
    const a = (this.time / 24000) * Math.PI * 2;
    const s = Math.sin(a);
    return Math.max(0.2, Math.min(1, s * 2.5 + 0.55));
  }
  isNight() {
    return this.daylight() < 0.45;
  }
}

function rayBox(ox, oy, oz, dx, dy, dz, b, maxDist) {
  let tmin = 0, tmax = maxDist;
  const o = [ox, oy, oz], d = [dx, dy, dz];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < b[a] || o[a] > b[a + 3]) return false;
    } else {
      let t1 = (b[a] - o[a]) / d[a], t2 = (b[a + 3] - o[a]) / d[a];
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return false;
    }
  }
  return true;
}

export { DX, DY, DZ, SEA };

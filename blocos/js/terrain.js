// Geração procedural do terreno: relevo, biomas, cavernas, minérios, árvores e plantas.
import { Perlin, hash2, hash3 } from './noise.js';
import { B } from './blocks.js';
import { CS, CH, SEA, BIOME, idx } from './consts.js';

const smooth = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const CAVE_STEP = 4;

export class Terrain {
  constructor(seed) {
    this.seed = seed;
    this.nCont = new Perlin(seed ^ 0x51ed27);
    this.nErosion = new Perlin(seed + 101);
    this.nDetail = new Perlin(seed + 202);
    this.nRidge = new Perlin(seed + 303);
    this.nTemp = new Perlin(seed + 404);
    this.nHum = new Perlin(seed + 505);
    this.nCave1 = new Perlin(seed + 606);
    this.nCave2 = new Perlin(seed + 707);
    this.nCheese = new Perlin(seed + 808);
    this.nSurf = new Perlin(seed + 909);
  }

  // Altura da superfície e bioma de uma coluna (determinístico).
  column(x, z) {
    const c = this.nCont.fbm2(x / 900, z / 900, 4) * 1.6 + 0.08;
    const e = this.nErosion.fbm2(x / 450, z / 450, 3) * 1.6;
    const d = this.nDetail.fbm2(x / 110, z / 110, 4);
    const r = 1 - Math.abs(this.nRidge.fbm2(x / 260, z / 260, 4) * 1.5);
    let base;
    if (c < -0.3) base = 36 + (Math.max(c, -0.8) + 0.8) * 30;
    else if (c < -0.1) base = 51 + ((c + 0.3) / 0.2) * 12;
    else if (c < 0.2) base = 63 + ((c + 0.1) / 0.3) * 6;
    else base = 69 + (c - 0.2) * 30;
    const mount = smooth(0.0, 0.45, c) * smooth(0.25, -0.35, e);
    let h = base + d * (8 + 10 * (1 - Math.abs(e))) + mount * r * r * 48;
    h = Math.max(6, Math.min(118, Math.floor(h)));

    let temp = this.nTemp.fbm2(x / 700, z / 700, 2) * 1.6;
    const hum = this.nHum.fbm2(x / 600, z / 600, 2) * 1.6;
    if (h > 85) temp -= (h - 85) / 60;
    let biome;
    if (h < SEA - 1) biome = temp < -0.3 ? BIOME.FROZEN_OCEAN : BIOME.OCEAN;
    else if (h > 98) biome = BIOME.MOUNTAINS;
    else if (h <= SEA + 1 && c < 0.0 && temp > -0.25) biome = BIOME.BEACH;
    else if (temp > 0.25 && hum < 0.05) biome = BIOME.DESERT;
    else if (temp < -0.25) biome = BIOME.SNOWY;
    else if (hum > 0.12) biome = temp > 0.12 ? BIOME.BIRCH_FOREST : BIOME.FOREST;
    else biome = BIOME.PLAINS;
    return { h, biome };
  }

  // Valor de caverna nos pontos da grade (quanto maior, mais oco).
  caveRaw(x, y, z) {
    const a = this.nCave1.noise3(x / 42, y / 26, z / 42);
    const b = this.nCave2.noise3(x / 42, y / 26, z / 42);
    const spag = 1 - (a * a + b * b) / 0.009;
    const ch = (this.nCheese.noise3(x / 80, y / 40, z / 80) - 0.45) / 0.12;
    let v = Math.max(spag, ch);
    // menos cavernas muito perto do fundo
    if (y < 8) v -= (8 - y) * 0.3;
    return v;
  }

  // Valor interpolado em qualquer ponto (igual ao usado na geração do chunk).
  caveAt(x, y, z) {
    const gx = Math.floor(x / CAVE_STEP), gy = Math.floor(y / CAVE_STEP), gz = Math.floor(z / CAVE_STEP);
    const tx = (x - gx * CAVE_STEP) / CAVE_STEP, ty = (y - gy * CAVE_STEP) / CAVE_STEP, tz = (z - gz * CAVE_STEP) / CAVE_STEP;
    const v = (i, j, k) => this.caveRaw((gx + i) * CAVE_STEP, (gy + j) * CAVE_STEP, (gz + k) * CAVE_STEP);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(v(0, 0, 0), v(1, 0, 0), tx), l(v(0, 1, 0), v(1, 1, 0), tx), ty),
      l(l(v(0, 0, 1), v(1, 0, 1), tx), l(v(0, 1, 1), v(1, 1, 1), tx), ty),
      tz,
    );
  }

  generate(chunk) {
    const { blocks } = chunk;
    const x0 = chunk.cx * CS, z0 = chunk.cz * CS;
    const seed = this.seed;
    const heights = chunk.heights, biomes = chunk.biomes;
    let maxH = SEA;
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const c = this.column(x0 + x, z0 + z);
      heights[z * CS + x] = c.h;
      biomes[z * CS + x] = c.biome;
      if (c.h > maxH) maxH = c.h;
    }

    // grade de cavernas (5 × níveis × 5)
    const GN = CS / CAVE_STEP + 1;
    const GY = Math.ceil((maxH + 2) / CAVE_STEP) + 1;
    const grid = new Float32Array(GN * GN * GY);
    for (let gy = 0; gy < GY; gy++) for (let gz = 0; gz < GN; gz++) for (let gx = 0; gx < GN; gx++) {
      grid[(gy * GN + gz) * GN + gx] = this.caveRaw(x0 + gx * CAVE_STEP, gy * CAVE_STEP, z0 + gz * CAVE_STEP);
    }
    const cave = (x, y, z) => {
      const gx = x >> 2, gy = y >> 2, gz = z >> 2;
      const tx = (x & 3) / 4, ty = (y & 3) / 4, tz = (z & 3) / 4;
      const g = (i, j, k) => grid[((gy + j) * GN + gz + k) * GN + gx + i];
      const a = g(0, 0, 0) + (g(1, 0, 0) - g(0, 0, 0)) * tx;
      const b = g(0, 1, 0) + (g(1, 1, 0) - g(0, 1, 0)) * tx;
      const c = g(0, 0, 1) + (g(1, 0, 1) - g(0, 0, 1)) * tx;
      const d = g(0, 1, 1) + (g(1, 1, 1) - g(0, 1, 1)) * tx;
      const e = a + (b - a) * ty, f = c + (d - c) * ty;
      return e + (f - e) * tz;
    };

    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const wx = x0 + x, wz = z0 + z;
      const h = heights[z * CS + x];
      const biome = biomes[z * CS + x];
      const underwater = h < SEA;
      const surfN = this.nSurf.noise2(wx / 12, wz / 12);
      const dirtDepth = 3 + Math.floor(hash2(seed + 11, wx, wz) * 2);
      const bedrockTop = 1 + Math.floor(hash2(seed + 12, wx, wz) * 4);
      const top = Math.max(h, SEA);
      for (let y = 0; y <= top; y++) {
        let id = B.STONE;
        if (y === 0 || y < bedrockTop) id = B.BEDROCK;
        else if (y > h) {
          id = B.WATER;
          if (y === SEA && (biome === BIOME.FROZEN_OCEAN || biome === BIOME.SNOWY)) id = B.ICE;
        } else {
          const depth = h - y;
          if (biome === BIOME.DESERT) {
            if (depth <= dirtDepth) id = B.SAND;
            else if (depth <= dirtDepth + 3) id = B.SANDSTONE;
          } else if (biome === BIOME.BEACH) {
            if (depth <= dirtDepth) id = B.SAND;
            else if (depth <= dirtDepth + 2) id = B.SANDSTONE;
          } else if (underwater) {
            if (depth <= 2) id = surfN > 0.35 ? B.GRAVEL : surfN < -0.4 ? B.CLAY : h < SEA - 6 ? B.GRAVEL : B.SAND;
            if (depth <= 2 && h >= SEA - 4 && surfN < 0.2 && surfN > -0.4) id = B.SAND;
          } else if (biome === BIOME.MOUNTAINS && h > 102) {
            if (depth === 0 && h > 108) id = B.SNOW;
          } else if (depth === 0) id = biome === BIOME.SNOWY || (biome === BIOME.MOUNTAINS && h > 96) ? B.SNOW_GRASS : B.GRASS;
          else if (depth <= dirtDepth) id = B.DIRT;

          if (id === B.STONE) id = this.ore(wx, y, wz);
          if (y > 4 && cave(x, y, z) > 0 && !(underwater && y > h - 5) && !(y > h - 2 && h < SEA + 2)) {
            id = y <= 10 ? B.LAVA : B.AIR;
          }
        }
        if (id) blocks[idx(x, y, z)] = id;
      }
      // grama sem nada acima depois de cavernas: se o topo foi escavado, nada a fazer
    }
    this.decorate(chunk);
  }

  ore(x, y, z) {
    const s = this.seed;
    const cell = hash3(s + 21, x >> 1, y >> 1, z >> 1);
    const fine = hash3(s + 22, x, y, z);
    if (fine > 0.65) return B.STONE;
    if (y < 16 && cell < 0.0025) return B.DIAMOND_ORE;
    if (y < 32 && cell > 0.003 && cell < 0.0065) return B.GOLD_ORE;
    if (y < 64 && cell > 0.01 && cell < 0.027) return B.IRON_ORE;
    if (y < 120 && cell > 0.03 && cell < 0.062) return B.COAL_ORE;
    if (cell > 0.07 && cell < 0.08) return hash3(s + 23, x >> 2, y >> 2, z >> 2) < 0.5 ? B.GRAVEL : B.DIRT;
    return B.STONE;
  }

  treeAt(wx, wz) {
    const r = hash2(this.seed + 31, wx, wz);
    if (r > 0.06) return null;
    const { h, biome } = this.column(wx, wz);
    if (h < SEA) return null;
    let density = 0, type = 'oak';
    switch (biome) {
      case BIOME.FOREST: density = 0.05; type = hash2(this.seed + 32, wx, wz) < 0.25 ? 'birch' : 'oak'; break;
      case BIOME.BIRCH_FOREST: density = 0.045; type = hash2(this.seed + 32, wx, wz) < 0.8 ? 'birch' : 'oak'; break;
      case BIOME.PLAINS: density = 0.004; break;
      case BIOME.SNOWY: density = 0.022; type = 'spruce'; break;
      case BIOME.MOUNTAINS: density = h < 104 ? 0.01 : 0; type = 'spruce'; break;
      default: return null;
    }
    if (r >= density) return null;
    if (this.caveAt(wx, h, wz) > 0 || this.caveAt(wx, h + 1, wz) > 0) return null;
    const hr = hash2(this.seed + 33, wx, wz);
    return { h, type, height: type === 'spruce' ? 6 + Math.floor(hr * 4) : type === 'birch' ? 5 + Math.floor(hr * 3) : 4 + Math.floor(hr * 3) };
  }

  decorate(chunk) {
    const x0 = chunk.cx * CS, z0 = chunk.cz * CS;
    const { blocks } = chunk;
    const seed = this.seed;
    const setLocal = (wx, y, wz, id, onlyAir) => {
      const x = wx - x0, z = wz - z0;
      if (x < 0 || z < 0 || x >= CS || z >= CS || y < 0 || y >= CH) return;
      const i = idx(x, y, z);
      if (onlyAir) {
        const cur = blocks[i];
        if (cur !== B.AIR && cur !== B.TALL_GRASS && cur !== B.DANDELION && cur !== B.POPPY) return;
      }
      blocks[i] = id;
    };

    // árvores (inclusive as dos chunks vizinhos que invadem este)
    for (let wz = z0 - 3; wz < z0 + CS + 3; wz++) for (let wx = x0 - 3; wx < x0 + CS + 3; wx++) {
      const t = this.treeAt(wx, wz);
      if (!t) continue;
      const base = t.h + 1;
      const H = t.height;
      if (t.type === 'spruce') {
        const top = base + H;
        for (let y = base + 2; y <= top; y++) {
          const fromTop = top - y;
          let rad = fromTop === 0 ? 0 : fromTop % 2 === 1 ? 1 : Math.min(3, 1 + (fromTop >> 1));
          if (y === base + 2 && rad > 1) rad = 2;
          for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
            if (rad > 0 && Math.abs(dx) === rad && Math.abs(dz) === rad) continue;
            setLocal(wx + dx, y, wz + dz, B.SPRUCE_LEAVES, true);
          }
        }
        setLocal(wx, top + 1, wz, B.SPRUCE_LEAVES, true);
        for (let y = base; y < top; y++) setLocal(wx, y, wz, B.SPRUCE_LOG, false);
      } else {
        const log = t.type === 'birch' ? B.BIRCH_LOG : B.LOG;
        const leaf = t.type === 'birch' ? B.BIRCH_LEAVES : B.LEAVES;
        const top = base + H - 1;
        for (let y = top - 2; y <= top + 1; y++) {
          const rad = y >= top ? 1 : 2;
          for (let dz = -rad; dz <= rad; dz++) for (let dx = -rad; dx <= rad; dx++) {
            const corner = Math.abs(dx) === rad && Math.abs(dz) === rad;
            if (corner && (y === top + 1 || hash3(seed + 34, wx + dx, y, wz + dz) < 0.5)) continue;
            setLocal(wx + dx, y, wz + dz, leaf, true);
          }
        }
        for (let y = base; y <= top; y++) setLocal(wx, y, wz, log, false);
      }
      setLocal(wx, t.h, wz, B.DIRT, false);
    }

    // plantas na superfície
    for (let z = 0; z < CS; z++) for (let x = 0; x < CS; x++) {
      const wx = x0 + x, wz = z0 + z;
      const h = chunk.heights[z * CS + x];
      if (h + 1 >= CH) continue;
      const ground = blocks[idx(x, h, z)];
      if (blocks[idx(x, h + 1, z)] !== B.AIR) continue;
      const biome = chunk.biomes[z * CS + x];
      const r = hash2(seed + 41, wx, wz);
      if (ground === B.GRASS) {
        const nearWater = h === SEA && this.besideWater(blocks, x, h, z);
        if (nearWater && r < 0.12) {
          const n = 1 + Math.floor(hash2(seed + 42, wx, wz) * 3);
          for (let k = 1; k <= n; k++) setLocal(wx, h + k, wz, B.SUGAR_CANE, true);
        } else if (biome === BIOME.PLAINS ? r < 0.2 : r < 0.07) setLocal(wx, h + 1, wz, B.TALL_GRASS, true);
        else if (r < (biome === BIOME.PLAINS ? 0.215 : 0.08)) setLocal(wx, h + 1, wz, hash2(seed + 43, wx, wz) < 0.6 ? B.DANDELION : B.POPPY, true);
        else if (biome === BIOME.PLAINS && r > 0.9993) setLocal(wx, h + 1, wz, B.PUMPKIN, true);
      } else if (ground === B.SAND && biome === BIOME.DESERT) {
        if (r < 0.004 && h + 3 < CH) {
          let free = true;
          for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const nx = x + dx, nz = z + dz;
            if (nx >= 0 && nz >= 0 && nx < CS && nz < CS && blocks[idx(nx, h + 1, nz)] !== B.AIR) free = false;
          }
          if (free) {
            const n = 1 + Math.floor(hash2(seed + 44, wx, wz) * 3);
            for (let k = 1; k <= n; k++) setLocal(wx, h + k, wz, B.CACTUS, true);
          }
        } else if (r > 0.994) setLocal(wx, h + 1, wz, B.DEAD_BUSH, true);
      } else if (ground === B.SAND && h === SEA && r < 0.06 && this.besideWater(blocks, x, h, z)) {
        const n = 1 + Math.floor(hash2(seed + 42, wx, wz) * 3);
        for (let k = 1; k <= n; k++) setLocal(wx, h + k, wz, B.SUGAR_CANE, true);
      }
    }
  }

  besideWater(blocks, x, y, z) {
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz;
      if (nx < 0 || nz < 0 || nx >= CS || nz >= CS) continue;
      if (blocks[idx(nx, y, nz)] === B.WATER) return true;
    }
    return false;
  }

  // Ponto de nascimento: procura terra firme perto da origem.
  findSpawn() {
    for (let r = 0; r < 400; r += 8) {
      for (let a = 0; a < 16; a++) {
        const x = Math.round(Math.cos((a / 16) * Math.PI * 2) * r);
        const z = Math.round(Math.sin((a / 16) * Math.PI * 2) * r);
        const c = this.column(x, z);
        if (c.h >= SEA + 1 && c.h < 95 && c.biome !== BIOME.BEACH && this.caveAt(x, c.h, z) <= 0) return { x: x + 0.5, y: c.h + 1, z: z + 0.5 };
      }
    }
    return { x: 0.5, y: 100, z: 0.5 };
  }
}

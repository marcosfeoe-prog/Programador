// Texturas em pixel art 16×16 geradas proceduralmente (nada é carregado de arquivos).
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { BLOCKS, ITEMS, TOOL_MATERIALS } from './blocks.js';

const T = 16; // pixels por textura
const COLS = 16; // texturas por linha do atlas
const SIZE = T * COLS;

export const atlasCanvas = document.createElement('canvas');
atlasCanvas.width = atlasCanvas.height = SIZE;
const actx = atlasCanvas.getContext('2d', { willReadFrequently: true });
const tileIndex = new Map();
const tileCanvases = new Map();
const tileImages = new Map(); // pixels de cada textura (para não ler o canvas de volta)
let nextTile = 0;

// ---------- utilidades de cor ----------
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
export function shade(c, f) {
  return [clamp(c[0] * f), clamp(c[1] * f), clamp(c[2] * f), c[3] ?? 255];
}
function mix(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, (a[3] ?? 255) + ((b[3] ?? 255) - (a[3] ?? 255)) * t];
}
function hex(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

// Pintor de uma textura 16×16.
class Painter {
  constructor(seed) {
    this.img = new ImageData(T, T);
    this.rnd = mulberry32(seed * 7919 + 13);
  }
  set(x, y, c, a) {
    if (x < 0 || y < 0 || x >= T || y >= T) return;
    const i = (y * T + x) * 4;
    const d = this.img.data;
    d[i] = clamp(c[0]);
    d[i + 1] = clamp(c[1]);
    d[i + 2] = clamp(c[2]);
    d[i + 3] = a ?? c[3] ?? 255;
  }
  get(x, y) {
    x = ((x % T) + T) % T;
    y = ((y % T) + T) % T;
    const i = (y * T + x) * 4;
    const d = this.img.data;
    return [d[i], d[i + 1], d[i + 2], d[i + 3]];
  }
  alpha(x, y) {
    if (x < 0 || y < 0 || x >= T || y >= T) return 0;
    return this.img.data[(y * T + x) * 4 + 3];
  }
  fill(fn) {
    for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
      const c = fn(x, y);
      if (c) this.set(x, y, c);
    }
  }
  noisy(base, amount) {
    this.fill(() => shade(base, 1 + (this.rnd() - 0.5) * amount));
  }
  pick(list) {
    return list[Math.floor(this.rnd() * list.length)];
  }
  // ruído de valor periódico (repete a cada 16 px)
  vnoise(freq) {
    const g = [];
    for (let i = 0; i < freq * freq; i++) g.push(this.rnd());
    const at = (x, y) => g[(((y % freq) + freq) % freq) * freq + (((x % freq) + freq) % freq)];
    return (x, y) => {
      const fx = (x / T) * freq, fy = (y / T) * freq;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
      return a + (b - a) * sy;
    };
  }
  canvas() {
    const c = document.createElement('canvas');
    c.width = c.height = T;
    c.getContext('2d').putImageData(this.img, 0, 0);
    return c;
  }
}

function registerTile(name, painter) {
  let idx = tileIndex.get(name);
  if (idx === undefined) {
    idx = nextTile++;
    tileIndex.set(name, idx);
  }
  const x = (idx % COLS) * T, y = Math.floor(idx / COLS) * T;
  actx.putImageData(painter.img, x, y);
  tileCanvases.set(name, painter.canvas());
  tileImages.set(name, painter.img);
}

function tile(name, fn, seed) {
  const p = new Painter(seed ?? hashName(name));
  fn(p);
  registerTile(name, p);
}
function hashName(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Coordenadas UV de uma textura no atlas: [u0, v0, u1, v1] (v cresce para cima).
const uvCache = new Map();
export function tileUV(name) {
  let uv = uvCache.get(name);
  if (uv) return uv;
  const idx = tileIndex.get(name);
  if (idx === undefined) throw new Error('Textura desconhecida: ' + name);
  const cx = idx % COLS, cy = Math.floor(idx / COLS);
  const e = 0.0001;
  uv = [cx / COLS + e, 1 - (cy + 1) / COLS + e, (cx + 1) / COLS - e, 1 - cy / COLS - e];
  uvCache.set(name, uv);
  return uv;
}
export function tileImageData(name) {
  return tileImages.get(name).data;
}
export function tileCanvas(name) {
  return tileCanvases.get(name);
}

// ---------- pintores reutilizáveis ----------
const DIRT = [[121, 85, 58], [134, 96, 67], [134, 96, 67], [150, 108, 74], [104, 74, 50]];
const GRASS = [[95, 159, 53], [106, 170, 64], [106, 170, 64], [118, 182, 72], [86, 146, 47]];

function paintStone(p, base = [125, 125, 125]) {
  const n = p.vnoise(4), n2 = p.vnoise(8);
  p.fill((x, y) => {
    const v = 0.86 + n(x, y) * 0.16 + n2(x * 2, y) * 0.1 + (p.rnd() - 0.5) * 0.12;
    return shade(base, v);
  });
}
function paintDirt(p) {
  p.fill(() => p.pick(DIRT));
  for (let i = 0; i < 6; i++) p.set((p.rnd() * T) | 0, (p.rnd() * T) | 0, [170, 128, 92]);
}
function paintCobble(p, mossy = false) {
  const pts = [];
  for (let i = 0; i < 10; i++) pts.push([p.rnd() * T, p.rnd() * T, 0.75 + p.rnd() * 0.35]);
  const moss = p.vnoise(4);
  p.fill((x, y) => {
    let d1 = 1e9, d2 = 1e9, best = null;
    for (const q of pts) {
      for (let ox = -T; ox <= T; ox += T) for (let oy = -T; oy <= T; oy += T) {
        const dx = x + 0.5 - (q[0] + ox), dy = y + 0.5 - (q[1] + oy);
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < d1) { d2 = d1; d1 = d; best = [q, dx, dy]; } else if (d < d2) d2 = d;
      }
    }
    if (d2 - d1 < 1.1) return [72, 72, 72];
    const [q, dx, dy] = best;
    let v = q[2] * (1 - (dx + dy) * 0.035) + (p.rnd() - 0.5) * 0.1;
    let c = shade([128, 128, 128], v);
    if (mossy && moss(x, y) > 0.55) c = shade([82, 120, 60], v);
    return c;
  });
}
function paintPlanks(p, base) {
  const offs = [];
  for (let r = 0; r < 4; r++) offs.push(((p.rnd() * 12) | 0) + 2);
  p.fill((x, y) => {
    const row = y >> 2;
    let c = shade(base, 0.93 + ((row * 7) % 3) * 0.04 + (p.rnd() - 0.5) * 0.07);
    if ((y & 3) === 3) c = shade(base, 0.62);
    else if (x === offs[row] && y % 4 !== 3) c = shade(base, 0.7);
    else if (p.rnd() < 0.08) c = shade(base, 0.82);
    return c;
  });
}
function paintLogSide(p, base, dark) {
  const cols = [];
  for (let x = 0; x < T; x++) cols.push(0.85 + p.rnd() * 0.25);
  p.fill((x, y) => {
    let v = cols[x] + (p.rnd() - 0.5) * 0.08;
    if (p.rnd() < 0.12) return dark;
    return shade(base, v);
  });
}
function paintLogTop(p, inner, bark) {
  p.fill((x, y) => {
    const dx = x - 7.5, dy = y - 7.5;
    const d = Math.max(Math.abs(dx), Math.abs(dy));
    if (d > 6.6) return shade(bark, 0.9 + p.rnd() * 0.2);
    const ring = Math.floor(Math.sqrt(dx * dx + dy * dy) * 0.9) % 2;
    return shade(inner, ring ? 0.86 : 1.0 + (p.rnd() - 0.5) * 0.05);
  });
}
function paintLeaves(p, base, holes = 0.2) {
  p.fill((x, y) => {
    if (p.rnd() < holes) return [0, 0, 0, 0];
    return shade(base, 0.7 + p.rnd() * 0.45);
  });
}
function paintOre(p, colors) {
  paintStone(p);
  const n = 4 + ((p.rnd() * 3) | 0);
  for (let i = 0; i < n; i++) {
    const cx = 2 + ((p.rnd() * 12) | 0), cy = 2 + ((p.rnd() * 12) | 0);
    const cells = [[0, 0], [1, 0], [0, 1], [1, 1], [-1, 0], [0, -1]].slice(0, 3 + ((p.rnd() * 3) | 0));
    for (const [dx, dy] of cells) p.set(cx + dx, cy + dy, p.rnd() < 0.5 ? colors[0] : colors[1]);
    p.set(cx + 1, cy + 1, colors[2]);
  }
}
function paintWool(p, base) {
  p.fill((x, y) => {
    let v = 0.92 + (p.rnd() - 0.5) * 0.1;
    if ((x + y * 3) % 7 === 0) v -= 0.1;
    if ((x * 2 + y) % 9 === 0) v += 0.06;
    return shade(base, v);
  });
}
function paintMetalBlock(p, base) {
  p.fill((x, y) => {
    if (x === 0 || y === 0) return shade(base, 1.18);
    if (x === 15 || y === 15) return shade(base, 0.72);
    let v = 1 - (x + y) * 0.006 + (p.rnd() - 0.5) * 0.05;
    if ((x === 2 || x === 13) && (y === 2 || y === 13)) v = 0.8;
    return shade(base, v);
  });
}
function paintSand(p, base) {
  p.fill(() => shade(base, 0.93 + p.rnd() * 0.12));
  for (let i = 0; i < 8; i++) p.set((p.rnd() * T) | 0, (p.rnd() * T) | 0, shade(base, 0.82));
}

// ---------- texturas animadas ----------
export function paintWater(p, t) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const w = Math.sin((x + t * 2) * 0.8 + Math.sin((y + t) * 0.6) * 1.4) + Math.sin((y - t * 1.3) * 0.9 + x * 0.3);
    const v = 0.85 + w * 0.08;
    p.set(x, y, shade([48, 86, 214], v), 175);
  }
}
export function paintLava(p, t) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const w = Math.sin((x + t * 0.6) * 0.7 + Math.sin((y - t * 0.4) * 0.5) * 2) * Math.sin((y + t * 0.3) * 0.8 + x * 0.4);
    p.set(x, y, mix([200, 70, 10], [255, 200, 60], Math.max(0, Math.min(1, 0.5 + w * 0.6))));
  }
}
const waterPainter = new Painter(5);
const lavaPainter = new Painter(6);
export function animateAtlas(time) {
  paintWater(waterPainter, time * 1.6);
  let idx = tileIndex.get('water');
  actx.putImageData(waterPainter.img, (idx % COLS) * T, Math.floor(idx / COLS) * T);
  paintLava(lavaPainter, time * 0.8);
  idx = tileIndex.get('lava');
  actx.putImageData(lavaPainter.img, (idx % COLS) * T, Math.floor(idx / COLS) * T);
}

// ---------- todas as texturas de blocos ----------
function buildTiles() {
  tile('stone', (p) => paintStone(p));
  tile('dirt', paintDirt);
  tile('grass_top', (p) => {
    p.fill(() => p.pick(GRASS));
    for (let i = 0; i < 10; i++) p.set((p.rnd() * T) | 0, (p.rnd() * T) | 0, [132, 196, 84]);
  });
  tile('grass_side', (p) => {
    paintDirt(p);
    for (let x = 0; x < T; x++) {
      let d = 3 + (p.rnd() < 0.5 ? 1 : 0);
      if (p.rnd() < 0.2) d += 2;
      for (let y = 0; y < d; y++) p.set(x, y, p.pick(GRASS));
    }
  });
  tile('snow', (p) => p.fill(() => shade([238, 248, 252], 0.94 + p.rnd() * 0.07)));
  tile('snow_grass_side', (p) => {
    paintDirt(p);
    for (let x = 0; x < T; x++) {
      let d = 3 + (p.rnd() < 0.5 ? 1 : 0);
      if (p.rnd() < 0.2) d += 2;
      for (let y = 0; y < d; y++) p.set(x, y, shade([238, 248, 252], 0.93 + p.rnd() * 0.07));
    }
  });
  tile('cobblestone', (p) => paintCobble(p));
  tile('mossy_cobblestone', (p) => paintCobble(p, true));
  tile('planks', (p) => paintPlanks(p, [162, 130, 78]));
  tile('birch_planks', (p) => paintPlanks(p, [196, 179, 123]));
  tile('spruce_planks', (p) => paintPlanks(p, [115, 85, 49]));
  tile('bedrock', (p) => {
    const n = p.vnoise(8);
    p.fill((x, y) => shade([90, 90, 90], 0.3 + n(x, y) * 0.9 + (p.rnd() - 0.5) * 0.3));
  });
  tile('sand', (p) => paintSand(p, [219, 207, 163]));
  tile('gravel', (p) => {
    const cols = [[140, 130, 125], [112, 104, 100], [166, 158, 152], [128, 112, 100], [96, 92, 90]];
    p.fill(() => p.pick(cols));
  });
  tile('log_side', (p) => paintLogSide(p, [106, 82, 48], [70, 52, 30]));
  tile('log_top', (p) => paintLogTop(p, [180, 146, 92], [100, 78, 46]));
  tile('birch_log_side', (p) => {
    p.fill(() => shade([216, 215, 208], 0.95 + p.rnd() * 0.08));
    for (let i = 0; i < 9; i++) {
      const y = (p.rnd() * T) | 0, x = (p.rnd() * T) | 0, len = 1 + ((p.rnd() * 4) | 0);
      for (let k = 0; k < len; k++) p.set((x + k) % T, y, [44, 44, 40]);
    }
  });
  tile('birch_log_top', (p) => paintLogTop(p, [204, 186, 130], [216, 215, 208]));
  tile('spruce_log_side', (p) => paintLogSide(p, [72, 50, 28], [46, 32, 18]));
  tile('spruce_log_top', (p) => paintLogTop(p, [140, 104, 62], [72, 50, 28]));
  tile('leaves', (p) => paintLeaves(p, [60, 128, 36]));
  tile('birch_leaves', (p) => paintLeaves(p, [100, 150, 60]));
  tile('spruce_leaves', (p) => paintLeaves(p, [52, 92, 58], 0.15));
  tile('glass', (p) => {
    p.fill((x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return [200, 228, 236, 255];
      if ((x - y === 4 || x - y === 5) && x > 3 && x < 10) return [235, 250, 255, 255];
      if (x - y === -6 && x > 2 && x < 6) return [235, 250, 255, 255];
      return [0, 0, 0, 0];
    });
  });
  tile('water', (p) => paintWater(p, 0));
  tile('lava', (p) => paintLava(p, 0));
  tile('coal_ore', (p) => paintOre(p, [[36, 36, 36], [52, 52, 52], [20, 20, 20]]));
  tile('iron_ore', (p) => paintOre(p, [[216, 175, 147], [196, 152, 120], [235, 200, 175]]));
  tile('gold_ore', (p) => paintOre(p, [[252, 238, 75], [222, 190, 40], [255, 255, 180]]));
  tile('diamond_ore', (p) => paintOre(p, [[93, 236, 245], [40, 190, 200], [220, 255, 255]]));
  tile('bricks', (p) => {
    p.fill((x, y) => {
      const row = y >> 2;
      const off = row % 2 ? 4 : 0;
      if ((y & 3) === 3 || (x + off) % 8 === 7) return shade([168, 160, 152], 0.95 + p.rnd() * 0.1);
      return shade([150, 74, 58], 0.85 + p.rnd() * 0.25);
    });
  });
  tile('sandstone_top', (p) => paintSand(p, [222, 210, 162]));
  tile('sandstone_side', (p) => {
    p.fill((x, y) => {
      if (y < 3) return shade([226, 214, 168], 0.95 + p.rnd() * 0.08);
      if (y === 3 || y === 10) return shade([196, 182, 130], 1);
      return shade([216, 202, 152], 0.94 + p.rnd() * 0.08 - (y > 10 ? 0.05 : 0));
    });
  });
  tile('sandstone_bottom', (p) => {
    paintSand(p, [214, 200, 150]);
    for (let i = 0; i < 4; i++) {
      let x = (p.rnd() * T) | 0, y = (p.rnd() * T) | 0;
      for (let k = 0; k < 4; k++) { p.set(x, y, [180, 166, 118]); x += p.rnd() < 0.5 ? 1 : 0; y += 1; }
    }
  });
  tile('cactus_side', (p) => {
    p.fill((x, y) => {
      if (x === 0 || x === 15) return [0, 0, 0, 0];
      if (x === 1 || x === 14) return [40, 90, 26];
      let c = shade([72, 132, 42], 0.9 + p.rnd() * 0.15);
      if (x % 4 === 2) c = shade(c, 1.15);
      if ((x % 4 === 0) && y % 4 === 1) c = [200, 200, 160];
      return c;
    });
  });
  tile('cactus_top', (p) => {
    p.fill((x, y) => {
      if (x === 0 || x === 15 || y === 0 || y === 15) return [0, 0, 0, 0];
      const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
      return shade([82, 142, 50], d > 5.5 ? 0.7 : d > 3 ? 0.95 : 1.1);
    });
  });
  tile('tall_grass', (p) => {
    p.fill(() => [0, 0, 0, 0]);
    for (let b = 0; b < 8; b++) {
      let x = 1 + p.rnd() * 13;
      const h = 6 + ((p.rnd() * 9) | 0);
      const lean = (p.rnd() - 0.5) * 0.5;
      for (let k = 0; k < h; k++) {
        p.set(x | 0, 15 - k, shade(p.pick(GRASS), 0.8 + (k / h) * 0.4));
        x += lean;
      }
    }
  });
  tile('dandelion', (p) => {
    p.fill(() => [0, 0, 0, 0]);
    for (let y = 9; y < 16; y++) p.set(7, y, [70, 130, 40]);
    p.set(6, 12, [70, 130, 40]); p.set(5, 11, [70, 130, 40]); p.set(8, 13, [70, 130, 40]); p.set(9, 12, [70, 130, 40]);
    for (let y = 5; y < 9; y++) for (let x = 6; x < 9; x++) p.set(x, y, [250, 220, 30]);
    p.set(7, 4, [250, 220, 30]); p.set(5, 6, [250, 220, 30]); p.set(9, 7, [250, 220, 30]); p.set(7, 6, [255, 250, 120]);
  });
  tile('poppy', (p) => {
    p.fill(() => [0, 0, 0, 0]);
    for (let y = 8; y < 16; y++) p.set(7, y, [60, 120, 36]);
    p.set(8, 12, [60, 120, 36]); p.set(9, 11, [60, 120, 36]); p.set(6, 13, [60, 120, 36]);
    for (let y = 3; y < 8; y++) for (let x = 5; x < 10; x++) if (!((x === 5 || x === 9) && (y === 3 || y === 7))) p.set(x, y, shade([210, 30, 30], 0.85 + p.rnd() * 0.25));
    p.set(7, 5, [40, 20, 20]);
  });
  tile('dead_bush', (p) => {
    p.fill(() => [0, 0, 0, 0]);
    const branch = (x, y, dx, n) => {
      for (let k = 0; k < n; k++) { p.set(Math.round(x), y, [120, 84, 40]); x += dx; y--; }
    };
    branch(7, 15, 0, 5); branch(7, 11, -0.6, 6); branch(7, 11, 0.7, 6); branch(7, 13, -1, 3); branch(8, 12, 1, 3);
  });
  tile('sugar_cane', (p) => {
    p.fill(() => [0, 0, 0, 0]);
    for (const sx of [3, 8, 12]) for (let y = 0; y < 16; y++) {
      const seg = (y + sx) % 5 === 0;
      p.set(sx, y, seg ? [150, 200, 110] : [110, 170, 80]);
      p.set(sx + 1, y, seg ? [120, 170, 90] : [90, 145, 60]);
    }
  });
  tile('sapling', (p) => {
    p.fill(() => [0, 0, 0, 0]);
    for (let y = 9; y < 16; y++) p.set(7, y, [100, 76, 40]);
    for (let y = 2; y < 11; y++) for (let x = 3; x < 13; x++) {
      const d = Math.hypot(x - 7.5, (y - 6) * 1.2);
      if (d < 4.6 && p.rnd() < 0.85) p.set(x, y, shade([60, 130, 36], 0.75 + p.rnd() * 0.45));
    }
  });
  tile('torch', (p) => {
    p.fill(() => [0, 0, 0, 0]);
    for (let y = 8; y < 16; y++) { p.set(7, y, [138, 104, 58]); p.set(8, y, [104, 76, 40]); }
    p.set(7, 6, [255, 250, 200]); p.set(8, 6, [255, 230, 120]);
    p.set(7, 7, [255, 200, 60]); p.set(8, 7, [240, 150, 30]);
  });
  tile('crafting_top', (p) => {
    paintPlanks(p, [162, 130, 78]);
    p.fill((x, y) => {
      if (x === 0 || y === 0 || x === 15 || y === 15) return [96, 70, 40];
      if (x === 5 || x === 10 || y === 5 || y === 10) return [110, 82, 46];
      return null;
    });
  });
  const craftSide = (p, front) => {
    paintPlanks(p, [150, 118, 70]);
    for (let x = 0; x < T; x++) { p.set(x, 0, [110, 82, 46]); p.set(x, 1, [96, 70, 40]); }
    if (front) {
      for (let y = 4; y < 12; y++) p.set(4, y, [90, 70, 50]);
      for (let x = 2; x < 7; x++) p.set(x, 4, [150, 150, 150]);
      for (let y = 5; y < 13; y++) p.set(11, y, [120, 120, 120]);
      for (let x = 9; x < 14; x++) p.set(x, 5, [80, 60, 40]);
    } else {
      for (let y = 4; y < 13; y++) p.set(3, y, [110, 110, 110]);
      for (let x = 3; x < 7; x++) p.set(x, 4, [160, 160, 160]);
      for (let y = 6; y < 13; y++) p.set(12, y, [90, 70, 50]);
      for (let x = 10; x < 15; x++) { p.set(x, 5, [140, 140, 140]); p.set(x, 6, [120, 120, 120]); }
    }
  };
  tile('crafting_side', (p) => craftSide(p, false));
  tile('crafting_front', (p) => craftSide(p, true));
  const furnaceBase = (p) => {
    paintStone(p, [118, 118, 118]);
    p.fill((x, y) => (x === 0 || y === 0 || x === 15 || y === 15 ? [86, 86, 86] : null));
  };
  tile('furnace_side', furnaceBase);
  tile('furnace_top', (p) => {
    furnaceBase(p);
    p.fill((x, y) => (x === 1 || y === 1 ? [150, 150, 150] : null));
  });
  tile('furnace_front', (p) => {
    furnaceBase(p);
    for (let y = 8; y < 14; y++) for (let x = 3; x < 13; x++) p.set(x, y, y === 8 ? [60, 60, 60] : [24, 24, 24]);
    for (let x = 2; x < 14; x++) p.set(x, 3, [80, 80, 80]);
  });
  tile('furnace_front_on', (p) => {
    furnaceBase(p);
    for (let y = 8; y < 14; y++) for (let x = 3; x < 13; x++) {
      const f = (y - 8) / 6 + (p.rnd() - 0.5) * 0.4;
      p.set(x, y, y === 8 ? [60, 60, 60] : mix([255, 230, 90], [210, 70, 10], Math.max(0, Math.min(1, 1 - f))));
    }
    for (let x = 2; x < 14; x++) p.set(x, 3, [80, 80, 80]);
  });
  tile('bookshelf', (p) => {
    paintPlanks(p, [162, 130, 78]);
    const colors = [[140, 30, 30], [40, 60, 140], [40, 110, 50], [150, 120, 40], [90, 50, 110], [180, 170, 150]];
    for (const [y0, y1] of [[2, 7], [9, 14]]) {
      for (let x = 1; x < 15; x++) {
        const c = colors[(x * 7 + y0) % colors.length];
        const top = y0 + (x % 3 === 0 ? 1 : 0);
        for (let y = top; y < y1; y++) p.set(x, y, shade(c, y === top ? 1.2 : 0.9 + p.rnd() * 0.15));
      }
      for (let x = 0; x < T; x++) p.set(x, y1, [90, 66, 38]);
    }
  });
  tile('tnt_side', (p) => {
    p.fill((x, y) => {
      if (y >= 4 && y <= 11) return [230, 230, 230];
      return shade([200, 40, 30], 0.85 + p.rnd() * 0.2 - (x % 4 === 0 ? 0.1 : 0));
    });
    const L = { T: ['111', '010', '010', '010', '010'], N: ['101', '111', '111', '101', '101'] };
    let x0 = 2;
    for (const ch of 'TNT') {
      L[ch].forEach((row, r) => [...row].forEach((v, c) => v === '1' && p.set(x0 + c, 5 + r, [30, 30, 30])));
      x0 += 4;
    }
  });
  tile('tnt_top', (p) => {
    p.fill((x, y) => shade([200, 40, 30], 0.85 + p.rnd() * 0.2));
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) p.set(x, y, [70, 70, 70]);
    p.set(7, 7, [30, 30, 30]);
  });
  tile('tnt_bottom', (p) => p.fill(() => shade([180, 36, 28], 0.85 + p.rnd() * 0.2)));
  tile('wool_white', (p) => paintWool(p, [234, 236, 236]));
  tile('wool_red', (p) => paintWool(p, [161, 39, 34]));
  tile('wool_blue', (p) => paintWool(p, [53, 57, 157]));
  tile('wool_green', (p) => paintWool(p, [84, 109, 27]));
  tile('wool_yellow', (p) => paintWool(p, [249, 198, 39]));
  tile('wool_black', (p) => paintWool(p, [30, 30, 34]));
  tile('stone_bricks', (p) => {
    paintStone(p, [122, 122, 122]);
    p.fill((x, y) => {
      if (y === 7 || y === 15) return [72, 72, 72];
      if ((y < 7 && x === 15) || (y > 7 && x === 7)) return [72, 72, 72];
      if (y === 0 || y === 8) return [150, 150, 150];
      return null;
    });
  });
  tile('obsidian', (p) => {
    const n = p.vnoise(4);
    p.fill((x, y) => (p.rnd() < 0.08 ? [90, 60, 130] : shade([22, 18, 34], 0.7 + n(x, y) * 0.8)));
  });
  tile('ice', (p) => {
    p.fill((x, y) => {
      if ((x + y) % 11 === 0 && x > 2) return [235, 245, 255, 220];
      return [...shade([140, 175, 250], 0.95 + p.rnd() * 0.08).slice(0, 3), 190];
    });
  });
  tile('clay', (p) => p.fill(() => shade([160, 166, 179], 0.94 + p.rnd() * 0.1)));
  tile('pumpkin_side', (p) => {
    p.fill((x, y) => {
      let v = 0.9 + p.rnd() * 0.1;
      if (x % 4 === 0) v = 0.72;
      if (y === 0 || y === 15) v *= 0.85;
      return shade([227, 144, 29], v);
    });
  });
  tile('pumpkin_top', (p) => {
    p.fill((x, y) => {
      const d = Math.hypot(x - 7.5, y - 7.5);
      return shade([227, 144, 29], d < 2 ? 0.6 : 0.85 + (Math.floor(d) % 2) * 0.1);
    });
    for (let y = 6; y < 10; y++) for (let x = 6; x < 10; x++) p.set(x, y, [96, 80, 30]);
  });
  tile('pumpkin_face', (p) => {
    p.fill((x, y) => shade([227, 144, 29], x % 4 === 0 ? 0.72 : 0.9 + p.rnd() * 0.1));
    const dark = [40, 24, 6];
    for (const [ex] of [[3], [10]]) { p.set(ex + 1, 4, dark); for (let x = ex; x < ex + 3; x++) p.set(x, 5, dark); for (let x = ex; x < ex + 3; x++) p.set(x, 6, dark); }
    for (let x = 3; x < 13; x++) p.set(x, 10, dark);
    for (let x = 4; x < 12; x++) if (x !== 6 && x !== 9) p.set(x, 11, dark);
    p.set(3, 9, dark); p.set(12, 9, dark); p.set(7, 12, dark); p.set(8, 12, dark);
  });
  tile('glowstone', (p) => {
    p.fill((x, y) => {
      const cx = (x >> 2) + (y >> 2) * 4;
      const v = ((cx * 37) % 10) / 10;
      if (p.rnd() < 0.12) return [120, 80, 40];
      return mix([210, 150, 70], [255, 240, 170], v * 0.7 + p.rnd() * 0.3);
    });
  });
  tile('iron_block', (p) => paintMetalBlock(p, [220, 220, 220]));
  tile('gold_block', (p) => paintMetalBlock(p, [248, 214, 64]));
  tile('diamond_block', (p) => paintMetalBlock(p, [104, 222, 214]));
  const chest = (p, kind) => {
    paintPlanks(p, [160, 110, 50]);
    p.fill((x, y) => (x === 0 || y === 0 || x === 15 || y === 15 ? [70, 44, 18] : null));
    if (kind !== 'top') for (let x = 0; x < T; x++) p.set(x, 5, [70, 44, 18]);
    if (kind === 'front') {
      for (let y = 3; y < 8; y++) for (let x = 7; x < 9; x++) p.set(x, y, y === 3 ? [220, 220, 220] : [170, 170, 170]);
      p.set(7, 7, [60, 60, 60]); p.set(8, 7, [60, 60, 60]);
    }
  };
  tile('chest_top', (p) => chest(p, 'top'));
  tile('chest_side', (p) => chest(p, 'side'));
  tile('chest_front', (p) => chest(p, 'front'));


  // ---------- blocos novos ----------
  const farm = (p, wet) => {
    p.fill((x, y) => {
      const ridge = y % 4 === 0 || y % 4 === 3;
      const base = wet ? [74, 48, 30] : [118, 82, 54];
      return shade(base, (ridge ? 0.82 : 1.0) + (p.rnd() - 0.5) * 0.16);
    });
  };
  tile('farmland', (p) => farm(p, false));
  tile('farmland_wet', (p) => farm(p, true));
  for (let st = 0; st < 8; st++) {
    tile('wheat_' + st, (p) => {
      p.fill(() => [0, 0, 0, 0]);
      const h = 3 + Math.round((st / 7) * 12);
      const green = mix([70, 140, 40], [190, 165, 70], st / 7);
      for (const sx of [2, 5, 8, 11, 13]) {
        let x = sx + 0.5;
        for (let k = 0; k < h; k++) {
          const yy = 15 - k;
          p.set(Math.round(x), yy, shade(green, 0.8 + (k / h) * 0.3));
          x += (p.rnd() - 0.5) * 0.4;
        }
        if (st >= 5) for (let k = 0; k < 3; k++) p.set(Math.round(x) + (k % 2), 15 - h + k, st === 7 ? [210, 180, 80] : [170, 160, 70]);
      }
    });
  }
  tile('ladder', (p) => {
    p.fill((x, y) => {
      if (x === 2 || x === 3 || x === 12 || x === 13) return shade([140, 106, 60], x % 2 ? 0.85 : 1.05);
      if ((y === 2 || y === 6 || y === 10 || y === 14) && x > 3 && x < 12) return shade([160, 124, 72], 1 - (y === 14 ? 0.1 : 0));
      if ((y === 3 || y === 7 || y === 11 || y === 15) && x > 3 && x < 12) return [96, 70, 40];
      return [0, 0, 0, 0];
    });
  });
  const door = (p, top) => {
    paintPlanks(p, [150, 116, 66]);
    p.fill((x, y) => {
      if (x === 0 || x === 15 || (top ? y === 0 : y === 15)) return [92, 66, 36];
      if (top && y > 2 && y < 12 && x > 2 && x < 13) {
        if (x === 7 || x === 8 || y === 7) return [110, 82, 46];
        return [0, 0, 0, 0];
      }
      if (!top && (x === 3 || x === 12) && y > 1 && y < 14) return [116, 86, 48];
      if (!top && x === 13 && (y === 1)) return [60, 60, 60];
      return null;
    });
    if (top) { p.set(12, 14, [70, 70, 70]); p.set(12, 15, [70, 70, 70]); }
  };
  tile('door_bottom', (p) => door(p, false));
  tile('door_top', (p) => door(p, true));
  tile('bed_top_foot', (p) => p.fill((x, y) => (x === 0 || x === 15 ? [130, 22, 22] : shade([178, 30, 30], 0.92 + p.rnd() * 0.12 - (y % 5 === 0 ? 0.08 : 0)))));
  tile('bed_top_head', (p) => p.fill((x, y) => {
    if (y < 7 && x > 1 && x < 14) return shade([236, 236, 236], 0.95 + p.rnd() * 0.06 - (y === 6 ? 0.1 : 0));
    return x === 0 || x === 15 ? [130, 22, 22] : shade([178, 30, 30], 0.92 + p.rnd() * 0.12);
  }));
  tile('bed_side', (p) => p.fill((x, y) => {
    if (y < 3) return [0, 0, 0, 0];
    if (y < 9) return shade([168, 28, 28], 0.9 + p.rnd() * 0.12);
    if (y < 12) return shade([150, 116, 66], 0.9 + p.rnd() * 0.1);
    return x < 3 || x > 12 ? [110, 82, 46] : [0, 0, 0, 0];
  }));
  tile('red_mushroom', (p) => {
    p.fill(() => [0, 0, 0, 0]);
    for (let y = 9; y < 15; y++) { p.set(7, y, [226, 214, 196]); p.set(8, y, [200, 190, 170]); }
    for (let y = 4; y < 9; y++) for (let x = 3; x < 13; x++) {
      const d = ((x - 7.5) / 5) ** 2 + ((y - 8.5) / 4.5) ** 2;
      if (d < 1) p.set(x, y, (x * 3 + y * 5) % 7 === 0 ? [240, 240, 240] : shade([210, 30, 30], 1 - (y - 4) * 0.05));
    }
  });
  tile('brown_mushroom', (p) => {
    p.fill(() => [0, 0, 0, 0]);
    for (let y = 10; y < 15; y++) { p.set(7, y, [216, 204, 186]); p.set(8, y, [190, 180, 160]); }
    for (let y = 7; y < 11; y++) for (let x = 4; x < 12; x++) {
      const d = ((x - 7.5) / 4) ** 2 + ((y - 10) / 3) ** 2;
      if (d < 1) p.set(x, y, shade([150, 110, 80], 1.05 - (y - 7) * 0.06));
    }
  });
  const stoneBricks = (p) => {
    paintStone(p, [122, 122, 122]);
    p.fill((x, y) => {
      if (y === 7 || y === 15) return [72, 72, 72];
      if ((y < 7 && x === 15) || (y > 7 && x === 7)) return [72, 72, 72];
      if (y === 0 || y === 8) return [150, 150, 150];
      return null;
    });
  };
  tile('mossy_stone_bricks', (p) => {
    stoneBricks(p);
    const n = p.vnoise(4);
    p.fill((x, y) => (n(x, y) > 0.55 ? shade([84, 118, 62], 0.85 + p.rnd() * 0.3) : null));
  });
  tile('cracked_stone_bricks', (p) => {
    stoneBricks(p);
    let x = 3, y = 0;
    while (y < 16) { p.set(x, y, [50, 50, 50]); y++; x += p.rnd() < 0.4 ? 1 : p.rnd() < 0.3 ? -1 : 0; }
    x = 11; y = 8;
    while (y < 16) { p.set(x, y, [50, 50, 50]); y++; x += p.rnd() < 0.5 ? -1 : 0; }
  });
  tile('hay_top', (p) => p.fill((x, y) => {
    const d = Math.hypot(x - 7.5, y - 7.5);
    return shade([196, 160, 40], 0.85 + (Math.floor(d * 1.5) % 2) * 0.12 + (p.rnd() - 0.5) * 0.1);
  }));
  tile('hay_side', (p) => p.fill((x, y) => {
    if (y === 3 || y === 12) return [120, 70, 30];
    return shade([200, 165, 45], 0.82 + ((x * 7 + y) % 5) * 0.05 + (p.rnd() - 0.5) * 0.1);
  }));
  // folhas opacas (gráficos baixos)
  for (const n of ['leaves', 'birch_leaves', 'spruce_leaves']) {
    const src = tileImages.get(n).data;
    tile(n + '_opaque', (p) => p.fill((x, y) => {
      const i = (y * 16 + x) * 4;
      return src[i + 3] ? [src[i], src[i + 1], src[i + 2]] : shade([src[i] || 40, src[i + 1] || 80, src[i + 2] || 30], 0.35);
    }));
  }
  tile('particle_rain', (p) => p.fill((x, y) => (x >= 7 && x <= 8 ? [170, 190, 255, 220] : [0, 0, 0, 0])));
  tile('particle_leaf', (p) => p.fill((x, y) => (Math.hypot(x - 7.5, (y - 7.5) * 1.6) < 6 ? [255, 255, 255, 255] : [0, 0, 0, 0])));

  // partículas
  tile('particle_smoke', (p) => {
    p.fill((x, y) => {
      const d = Math.hypot(x - 7.5, y - 7.5);
      return d < 6 ? [255, 255, 255, 255] : [0, 0, 0, 0];
    });
  });
  tile('particle_flame', (p) => {
    p.fill((x, y) => {
      const d = Math.hypot(x - 7.5, (y - 8) * 0.8);
      return d < 6 ? mix([255, 240, 160], [240, 110, 20], d / 6) : [0, 0, 0, 0];
    });
  });

  // rachaduras de quebra (10 estágios cumulativos)
  const crackRnd = mulberry32(99);
  const crackPx = new Uint8Array(T * T);
  const walks = [];
  for (let i = 0; i < 26; i++) walks.push([crackRnd() * 16, crackRnd() * 16, crackRnd() * Math.PI * 2]);
  for (let s = 0; s < 10; s++) {
    const n = Math.ceil(((s + 1) / 10) * walks.length);
    for (let i = 0; i < n; i++) {
      const w = walks[i];
      for (let k = 0; k < 2 + s * 0.4; k++) {
        crackPx[(Math.floor(w[1]) & 15) * T + (Math.floor(w[0]) & 15)] = 1;
        w[2] += (crackRnd() - 0.5) * 1.6;
        w[0] += Math.cos(w[2]);
        w[1] += Math.sin(w[2]);
      }
    }
    tile('crack_' + s, (p) => p.fill((x, y) => (crackPx[y * T + x] ? [20, 20, 20, 200] : [0, 0, 0, 0])));
  }
}

// ---------- ícones de itens ----------
const itemIcons = new Map();
function icon(name, fn) {
  const p = new Painter(hashName(name));
  p.fill(() => [0, 0, 0, 0]);
  fn(p);
  outline(p);
  itemIcons.set(name, p);
}
// contorno escuro nas bordas do desenho, como nos itens do jogo original
function outline(p) {
  const src = new Uint8ClampedArray(p.img.data);
  const a = (x, y) => (x < 0 || y < 0 || x >= T || y >= T ? 0 : src[(y * T + x) * 4 + 3]);
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    if (a(x, y)) continue;
    if (a(x + 1, y) || a(x - 1, y) || a(x, y + 1) || a(x, y - 1)) {
      const nb = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => a(x + dx, y + dy));
      const i = ((y + nb[1]) * T + x + nb[0]) * 4;
      p.set(x, y, shade([src[i], src[i + 1], src[i + 2]], 0.35));
    }
  }
}
function blob(p, cx, cy, rx, ry, base, light) {
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const d = ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2;
    if (d <= 1) {
      const hl = (x + 0.5 - cx) / rx + (y + 0.5 - cy) / ry < -0.6;
      p.set(x, y, hl && light ? light : shade(base, 1 - d * 0.25));
    }
  }
}
function toolShape(type) {
  // forma descrita no eixo do cabo (a = ao longo do cabo, b = perpendicular), depois girada 45°
  return (a, b) => {
    if (type === 'sword') {
      if (a >= 5.2 && a <= 19.5 && Math.abs(b) <= 1.25 - Math.max(0, a - 17.5) * 0.6) return b < 0 ? 'L' : 'M';
      if (a >= 3.8 && a < 5.2 && Math.abs(b) <= 3.6) return 'D';
      if (a >= 0 && a < 3.8 && Math.abs(b) <= 0.8) return 'h';
      return null;
    }
    const handleLen = type === 'shovel' ? 12 : 16;
    if (type === 'pickaxe') {
      const ac = 13.6 - 0.07 * b * b;
      if (Math.abs(b) <= 8.2 && Math.abs(a - ac) <= 1.3) return a > ac ? 'L' : 'M';
    }
    if (type === 'axe') {
      if (a >= 10 && a <= 16.5 && b <= -0.5 && b >= -5.6 + Math.abs(a - 13.2) * 0.35) return b < -4.5 ? 'L' : 'M';
    }
    if (type === 'hoe') {
      if (a >= 13.6 && a <= 16 && b <= 0.8 && b >= -5) return b < -3.8 ? 'L' : 'M';
    }
    if (type === 'shovel') {
      const e = ((a - 15) / 4) ** 2 + (b / 2.6) ** 2;
      if (e <= 1) return b < -1 ? 'L' : 'M';
    }
    if (a >= 0 && a <= handleLen && Math.abs(b) <= 0.75) return b < 0 ? 'H' : 'h';
    return null;
  };
}
function paintTool(p, type, colors) {
  const shape = toolShape(type);
  const s = Math.SQRT1_2;
  const handleCol = { H: [137, 103, 56], h: [100, 72, 36] };
  const mat = { D: hex(colors[0]), M: hex(colors[1]), L: hex(colors[2]) };
  for (let y = 0; y < T; y++) for (let x = 0; x < T; x++) {
    const qx = x + 0.5 - 1.5, qy = y + 0.5 - 14.5;
    const a = (qx - qy) * s;
    const b = (qx + qy) * s;
    const k = shape(a, b);
    if (!k) continue;
    p.set(x, y, handleCol[k] || mat[k]);
  }
}
function buildIcons() {
  icon('stick', (p) => {
    for (let i = 0; i < 10; i++) { p.set(3 + i, 12 - i, [137, 103, 56]); p.set(4 + i, 12 - i, [100, 72, 36]); }
  });
  icon('coal', (p) => {
    blob(p, 8, 8.5, 5.5, 4.5, [40, 40, 44], [90, 90, 96]);
    for (let i = 0; i < 6; i++) p.set(4 + ((p.rnd() * 8) | 0), 6 + ((p.rnd() * 5) | 0), [20, 20, 22]);
  });
  // barra em perspectiva: topo claro, frente e lateral mais escuras
  const ingot = (p, base, light) => {
    for (let y = 5; y <= 11; y++) for (let x = 1; x <= 14; x++) {
      const top = y <= 7 && x >= 4 - (y - 5) && x <= 13 - (y - 5);
      const front = y >= 8 && x >= 1 && x <= 10;
      const side = x >= 11 && x <= 14 && y >= 5 + (14 - x) && y <= 11 - (x - 11);
      if (top) p.set(x, y, y === 5 ? light : shade(base, 1.08));
      else if (front) p.set(x, y, shade(base, y === 8 ? 0.95 : 0.8));
      else if (side) p.set(x, y, shade(base, 0.65));
    }
  };
  icon('iron_ingot', (p) => ingot(p, [210, 210, 210], [250, 250, 250]));
  icon('gold_ingot', (p) => ingot(p, [240, 200, 50], [255, 250, 170]));
  icon('diamond', (p) => {
    for (let y = 3; y < 14; y++) for (let x = 2; x < 14; x++) {
      const w = y < 6 ? 6 - (6 - y) * 0.9 : 6 - (y - 6) * 0.8;
      if (Math.abs(x + 0.5 - 8) <= w) p.set(x, y, y < 6 ? [200, 255, 250] : shade([60, 220, 205], 1 - (y - 6) * 0.05 + (x < 8 ? 0.15 : 0)));
    }
  });
  icon('apple', (p) => {
    blob(p, 8, 9.5, 5, 4.8, [210, 30, 40], [255, 140, 140]);
    p.set(8, 4, [90, 60, 30]); p.set(8, 3, [90, 60, 30]); p.set(9, 3, [60, 140, 40]); p.set(10, 2, [60, 140, 40]);
  });
  const meat = (p, base, fat) => {
    blob(p, 8, 8, 6, 4.5, base, null);
    for (let x = 3; x < 13; x++) p.set(x, 5 + ((x * 3) % 2), fat);
    blob(p, 3.5, 11, 1.5, 1.5, [230, 225, 210], null);
  };
  icon('porkchop', (p) => meat(p, [230, 130, 130], [250, 200, 200]));
  icon('cooked_porkchop', (p) => meat(p, [160, 100, 50], [210, 170, 110]));
  icon('beef', (p) => meat(p, [200, 40, 40], [240, 220, 220]));
  icon('steak', (p) => meat(p, [120, 70, 35], [170, 120, 70]));
  icon('mutton', (p) => meat(p, [210, 70, 70], [240, 190, 190]));
  icon('cooked_mutton', (p) => meat(p, [140, 85, 45], [190, 140, 90]));
  icon('rotten_flesh', (p) => {
    blob(p, 8, 8.5, 6, 4.5, [140, 110, 60], null);
    for (let i = 0; i < 10; i++) p.set(3 + ((p.rnd() * 10) | 0), 5 + ((p.rnd() * 7) | 0), [90, 120, 50]);
  });
  icon('bread', (p) => {
    for (let y = 6; y < 12; y++) for (let x = 1; x < 15; x++) {
      const d = ((x + 0.5 - 8) / 7) ** 2 + ((y + 0.5 - 9) / 3.2) ** 2;
      if (d <= 1) p.set(x, y, y < 8 ? [200, 140, 60] : [170, 110, 40]);
    }
    for (const x of [4, 7, 10]) p.set(x, 7, [240, 200, 120]);
  });

  icon('seeds', (p) => {
    for (const [x, y] of [[5, 6], [9, 5], [7, 9], [11, 9], [4, 10], [8, 12], [10, 7]]) { p.set(x, y, [90, 150, 50]); p.set(x + 1, y, [60, 110, 30]); }
  });
  icon('wheat', (p) => {
    for (let i = 0; i < 9; i++) { p.set(4 + i, 13 - i, [150, 120, 50]); }
    for (let k = 0; k < 5; k++) for (const [dx, dy] of [[0, 0], [1, 0], [0, 1]]) p.set(9 + dx + (k % 2), 2 + k * 2 + dy - (k > 2 ? 1 : 0), [220, 190, 80]);
    for (let k = 0; k < 4; k++) p.set(11 + (k % 2), 3 + k * 2, [240, 220, 120]);
  });
  icon('bone', (p) => {
    for (let i = 0; i < 9; i++) { p.set(4 + i, 11 - i, [235, 232, 220]); p.set(5 + i, 11 - i, [210, 206, 190]); }
    for (const [x, y] of [[2, 11], [3, 13], [3, 12], [13, 2], [12, 3], [14, 3], [13, 4], [4, 13]]) p.set(x, y, [235, 232, 220]);
  });
  icon('bone_meal', (p) => blob(p, 8, 9, 5, 4, [235, 235, 230], [255, 255, 255]));
  icon('arrow', (p) => {
    for (let i = 0; i < 10; i++) p.set(3 + i, 12 - i, [120, 90, 50]);
    for (const [x, y] of [[12, 3], [13, 2], [13, 3], [12, 2], [11, 2], [13, 4]]) p.set(x, y, [200, 200, 200]);
    for (const [x, y] of [[2, 12], [3, 13], [2, 13], [4, 13], [2, 11], [1, 13]]) p.set(x, y, [240, 240, 240]);
  });
  const bow = (p, pull) => {
    for (let t = 0; t <= 20; t++) {
      const a = (t / 20) * Math.PI;
      const x = Math.round(8 + Math.cos(a - Math.PI / 4) * 0 + (t - 10) * 0.55 + 0), y = Math.round(8 - (t - 10) * 0.55);
      const bend = Math.sin(a) * (3.2 - pull);
      p.set(Math.round(x - bend * 0.7), Math.round(y - bend * 0.7), t % 4 === 0 ? [80, 56, 30] : [130, 96, 54]);
    }
    for (let t = 0; t <= 14; t++) p.set(Math.round(2.5 + t * 0.78 + pull * 0.6), Math.round(13.5 - t * 0.78 + pull * 0.6), [220, 220, 220]);
  };
  icon('bow', (p) => bow(p, 0));
  const bucket = (p, fill) => {
    for (let y = 5; y < 14; y++) {
      const w = 5 - (y - 5) * 0.25;
      for (let x = Math.round(8 - w); x <= Math.round(7 + w); x++) p.set(x, y, shade([190, 190, 196], 1.1 - (x - 3) * 0.04));
    }
    for (let x = 3; x <= 12; x++) p.set(x, 5, fill || [70, 70, 76]);
    for (let x = 4; x <= 11; x++) p.set(x, 6, fill ? shade(fill, 0.85) : [90, 90, 96]);
    for (let x = 4; x <= 11; x++) if (x < 5 || x > 10) p.set(x, 2 + Math.round(Math.abs(x - 7.5) * 0.3), [150, 150, 156]);
    for (let x = 5; x <= 10; x++) p.set(x, 2, [150, 150, 156]);
  };
  icon('bucket', (p) => bucket(p, null));
  icon('water_bucket', (p) => bucket(p, [60, 100, 230]));
  icon('lava_bucket', (p) => bucket(p, [240, 120, 20]));
  icon('chicken', (p) => { blob(p, 8, 8.5, 5.5, 4.5, [235, 190, 170], [250, 220, 210]); blob(p, 3.5, 12, 1.5, 1.6, [240, 235, 220], null); });
  icon('cooked_chicken', (p) => { blob(p, 8, 8.5, 5.5, 4.5, [190, 120, 60], [220, 160, 90]); blob(p, 3.5, 12, 1.5, 1.6, [240, 235, 220], null); });
  icon('feather', (p) => {
    for (let i = 0; i < 11; i++) {
      const x = 3 + i, y = 13 - i;
      p.set(x, y, [200, 200, 200]);
      if (i > 2) { p.set(x - 1, y - 1, [245, 245, 245]); p.set(x + 1, y + 1, [230, 230, 230]); p.set(x - 2, y - 1, [250, 250, 250]); }
    }
  });
  icon('string', (p) => {
    let x = 3, y = 12;
    for (let i = 0; i < 14; i++) { p.set(x, y, [230, 230, 230]); x += 0.75; y -= Math.sin(i * 0.9) * 0.9 + 0.3; x = Math.min(13, x); y = Math.max(2, y); }
  });
  icon('flint', (p) => blob(p, 8, 8, 4.5, 5.5, [60, 60, 66], [120, 120, 130]));
  icon('gunpowder', (p) => {
    blob(p, 8, 10, 6, 3.5, [80, 80, 80], null);
    for (let i = 0; i < 18; i++) p.set(3 + ((p.rnd() * 10) | 0), 7 + ((p.rnd() * 6) | 0), [p.rnd() < 0.5 ? 50 : 120, 50, 50]);
  });
  icon('egg', (p) => blob(p, 8, 9, 4, 5, [230, 214, 180], [250, 245, 230]));
  icon('door', (p) => {
    for (let y = 1; y < 15; y++) for (let x = 4; x < 12; x++) {
      const edge = x === 4 || x === 11 || y === 1 || y === 14 || y === 7;
      const win = y > 1 && y < 7 && x > 4 && x < 11 && x !== 7 && y !== 4;
      if (!win) p.set(x, y, edge ? [100, 72, 40] : [150, 116, 66]);
    }
    p.set(10, 9, [60, 60, 60]);
  });
  icon('bed', (p) => {
    for (let y = 6; y < 11; y++) for (let x = 1; x < 15; x++) p.set(x, y, x < 5 && y < 9 ? [240, 240, 240] : y < 9 ? [190, 30, 30] : [150, 116, 66]);
    for (const x of [1, 2, 13, 14]) for (let y = 11; y < 13; y++) p.set(x, y, [110, 82, 46]);
  });
  for (const [mat, m] of Object.entries(TOOL_MATERIALS)) {
    for (const type of ['pickaxe', 'axe', 'shovel', 'sword', 'hoe']) icon(`${mat}_${type}`, (p) => paintTool(p, type, m.colors));
  }
}

export function itemIconPainter(name) {
  return itemIcons.get(name);
}

// ---------- ícones isométricos (GUI) ----------
const iconURL = new Map();
export function blockFaces(id) {
  const b = BLOCKS[id];
  const t = typeof b.tex === 'string' ? { top: b.tex, bottom: b.tex, side: b.tex } : b.tex;
  return { top: t.top, bottom: t.bottom, side: t.side, front: t.front || t.side };
}
export function renderIconCanvas(id, size = 48) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  const s = size / 48;
  if (id >= 256) {
    const it = ITEMS[id];
    ctx.drawImage(itemIcons.get(it.icon).canvas(), 0, 0, size, size);
    return c;
  }
  const b = BLOCKS[id];
  if (['cross', 'torch', 'crop', 'ladder', 'door'].includes(b.render)) {
    ctx.drawImage(tileCanvas(b.tex), 0, 0, size, size);
    return c;
  }
  if (b.render === 'bed') {
    ctx.drawImage(itemIcons.get('bed').canvas(), 0, 0, size, size);
    return c;
  }
  if (b.render === 'fence') {
    const t = tileCanvas('planks');
    for (const [x, y, w, h] of [[10, 4, 7, 40], [31, 4, 7, 40], [4, 12, 40, 5], [4, 26, 40, 5]]) ctx.drawImage(t, 0, 0, 16, 16, (x * size) / 48, (y * size) / 48, (w * size) / 48, (h * size) / 48);
    return c;
  }
  const f = blockFaces(id);
  const face = (name, m, dark) => {
    ctx.save();
    ctx.setTransform(m[0] * s, m[1] * s, m[2] * s, m[3] * s, m[4] * s, m[5] * s);
    ctx.drawImage(tileCanvas(name), 0, 0);
    if (dark) {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = `rgba(0,0,0,${dark})`;
      ctx.fillRect(0, 0, 16, 16);
    }
    ctx.restore();
  };
  const k = 22 / 16, h = 11 / 16;
  // lajes e camadas: cubo achatado
  const frac = b.render === 'slab' ? 0.5 : b.render === 'layer' ? 0.125 : 1;
  const v = (23 / 16) * frac, drop = 22 * (1 - frac);
  face(f.side, [k, h, 0, v, 2, 13 + drop], 0.22);
  face(b.oriented ? f.front : f.side, [k, -h, 0, v, 24, 24 + drop], 0.42);
  face(f.top, [k, -h, k, h, 2, 13 + drop], 0);
  return c;
}
export function iconDataURL(id) {
  let u = iconURL.get(id);
  if (!u) {
    u = renderIconCanvas(id).toDataURL();
    iconURL.set(id, u);
  }
  return u;
}

// ---------- texturas do three.js ----------
let atlasTexture = null;
export function initTextures() {
  buildTiles();
  buildIcons();
  atlasTexture = new THREE.CanvasTexture(atlasCanvas);
  atlasTexture.magFilter = THREE.NearestFilter;
  atlasTexture.minFilter = THREE.NearestMipmapLinearFilter;
  atlasTexture.generateMipmaps = true;
  atlasTexture.colorSpace = THREE.NoColorSpace;
  return atlasTexture;
}
export function getAtlasTexture() {
  return atlasTexture;
}

export function canvasTexture(canvas) {
  const t = new THREE.CanvasTexture(canvas);
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  t.generateMipmaps = false;
  t.colorSpace = THREE.NoColorSpace;
  return t;
}

export { Painter, hex, mix };

// lista de texturas registradas: [nome, índice]
export function tileEntries() {
  return [...tileIndex.entries()];
}
export const ATLAS_COLS = COLS;

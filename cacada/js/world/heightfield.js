// Geração do mapa: relevo (planícies, colinas, cordilheiras e o anel de montanhas que
// cerca a ilha de caça), lagos, rio, trilhas, florestas e campos. Tudo determinístico a
// partir da semente, calculado numa grade de 4 m.
import { Simplex, mulberry32 } from '../util/noise.js';

export const HALF = 2048; // o mapa vai de -2048 a 2048 m (4 km x 4 km)
export const SIZE = HALF * 2;
export const RES = 1025; // vértices por lado
export const CELL = SIZE / (RES - 1); // 4 m
export const WATER = 0; // nível da água

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Pontos de interesse do mapa
export const LAKES = [
  { nome: 'Lago Esmeralda', x: 380, z: 260, r: 230, depth: 9 },
  { nome: 'Lago do Oeste', x: -1050, z: 520, r: 170, depth: 7 },
  { nome: 'Lagoa da Serra', x: -350, z: -560, r: 115, depth: 5 },
  { nome: 'Pântano do Sul', x: 1220, z: 1130, r: 190, depth: 3 },
];
export const RIVER = [
  [-350, -560],
  [-260, -420],
  [-170, -300],
  [-60, -170],
  [60, -40],
  [190, 90],
  [380, 260],
  [560, 470],
  [700, 640],
  [830, 760],
  [990, 900],
  [1220, 1130],
];
export const CAMP = { nome: 'Acampamento', x: 40, z: 660, r: 42 };
export const TOWERS = [
  { nome: 'Torre da Mata', x: -880, z: -60 },
  { nome: 'Torre da Planície', x: 1080, z: 140 },
  { nome: 'Torre da Serra', x: -260, z: -1080 },
  { nome: 'Torre do Pântano', x: 760, z: 1260 },
  { nome: 'Torre do Oeste', x: -1180, z: 1120 },
];
export const LAIR = { nome: 'Vale das Sombras', x: 520, z: -1360, r: 210, h: 235 };

function distSeg(px, pz, ax, az, bx, bz) {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  let t = ((px - ax) * dx + (pz - az) * dz) / l2;
  t = clamp(t, 0, 1);
  const x = ax + dx * t - px;
  const z = az + dz * t - pz;
  return Math.sqrt(x * x + z * z);
}
function distPoly(px, pz, pts) {
  let d = 1e9;
  for (let i = 1; i < pts.length; i++) d = Math.min(d, distSeg(px, pz, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
  return d;
}

// Trilhas de terra ligando o acampamento às torres (com curvas)
function makeTrails(rnd) {
  const trails = [];
  for (const t of TOWERS) {
    const pts = [[CAMP.x, CAMP.z]];
    const n = 7;
    for (let i = 1; i < n; i++) {
      const f = i / n;
      const x = CAMP.x + (t.x - CAMP.x) * f;
      const z = CAMP.z + (t.z - CAMP.z) * f;
      const len = Math.hypot(t.x - CAMP.x, t.z - CAMP.z);
      const nx = -(t.z - CAMP.z) / len;
      const nz = (t.x - CAMP.x) / len;
      const off = (rnd() - 0.5) * len * 0.12 * Math.sin(f * Math.PI);
      pts.push([x + nx * off, z + nz * off]);
    }
    pts.push([t.x, t.z]);
    trails.push(pts);
  }
  return trails;
}

export class Heightfield {
  constructor(seed = 1977) {
    this.seed = seed;
    this.h = new Float32Array(RES * RES);
    this.forest = new Uint8Array(RES * RES);
    this.path = new Uint8Array(RES * RES);
    this.grass = new Uint8Array(RES * RES);
    this.trails = makeTrails(mulberry32(seed + 7));
    this.minH = 0;
    this.maxH = 0;
  }

  // Altura "crua" (sem lagos/rio) em um ponto
  rawHeight(n, x, z) {
    const s = 1 / 1000;
    // base: planície ondulada
    let h = 16 + n.fbm(x * s * 0.6, z * s * 0.6, 3) * 20 + n.fbm(x * s * 2.4 + 10, z * s * 2.4, 4) * 9 + n.fbm(x * s * 9, z * s * 9, 3) * 2.2;
    // planícies do leste mais planas
    const east = smooth(150, 700, x) * smooth(-900, -450, z) * (1 - smooth(1300, 1600, z));
    h = h * (1 - east * 0.55) + east * 6;
    // floresta do oeste: colinas mais marcadas
    const west = smooth(-200, -700, x);
    h += west * (n.fbm(x * s * 1.6 + 40, z * s * 1.6, 4) * 0.5 + 0.5) * 38;
    // máscaras de montanha
    const edgeD = HALF - Math.max(Math.abs(x), Math.abs(z)) + n.fbm(x * s * 1.3 + 3, z * s * 1.3, 3) * 120;
    const ring = smooth(520, 80, edgeD);
    const north = smooth(-650, -1150, z + n.fbm(x * s * 0.9, 5, 2) * 220);
    const ne = smooth(650, 200, Math.hypot(x - 1350, z + 650));
    const sw = smooth(380, 120, Math.hypot(x + 1450, z - 1500));
    let m = Math.max(ring, north * 0.92, ne * 0.85, sw * 0.6);
    // colinas isoladas no meio
    const hill = smooth(260, 60, Math.hypot(x - 1350, z - 520)) * 0.45 + smooth(220, 50, Math.hypot(x + 520, z - 1180)) * 0.4;
    m = Math.max(m, hill);
    if (m > 0.001) {
      const r = n.ridged(x * s * 1.15 + 20, z * s * 1.15 - 7, 6);
      const big = 0.65 + 0.35 * n.fbm(x * s * 0.7 - 30, z * s * 0.7, 2);
      h += Math.pow(m, 1.4) * (40 + 520 * r * big);
    }
    // vale do Rex Sombrio: um planalto fechado entre os picos do norte
    const ld = Math.hypot(x - LAIR.x, z - LAIR.z) / LAIR.r;
    if (ld < 1.6) {
      const f = smooth(1.35, 0.6, ld + n.fbm(x * s * 6, z * s * 6, 2) * 0.15);
      h = h * (1 - f) + (LAIR.h + n.fbm(x * s * 8, z * s * 8, 3) * 6) * f;
    }
    return h;
  }

  async generate(onProgress) {
    const n = new Simplex(this.seed);
    const nf = new Simplex(this.seed + 101);
    const h = this.h;
    const tick = () => new Promise((r) => setTimeout(r, 0));
    for (let j = 0; j < RES; j++) {
      const z = -HALF + j * CELL;
      for (let i = 0; i < RES; i++) {
        const x = -HALF + i * CELL;
        let v = this.rawHeight(n, x, z);
        // lagos
        for (const L of LAKES) {
          const dx = x - L.x;
          const dz = z - L.z;
          const d2 = dx * dx + dz * dz;
          const R = L.r * 1.7;
          if (d2 > R * R) continue;
          const d = (Math.sqrt(d2) / L.r) * (1 + n.fbm(x * 0.006, z * 0.006, 3) * 0.22);
          const bed = WATER - L.depth * (1 - Math.min(1, d * d));
          const f = smooth(1.45, 0.82, d);
          v = v * (1 - f) + Math.min(v, bed) * f;
        }
        // rio
        // o rio serpenteia: a distância é medida num espaço deformado pelo ruído
        const wx = x + n.noise(x * 0.0035 + 9, z * 0.0035) * 75 + n.noise(x * 0.012, z * 0.012 + 4) * 18;
        const wz = z + n.noise(x * 0.0035, z * 0.0035 + 21) * 75 + n.noise(x * 0.012 + 8, z * 0.012) * 18;
        const dr = distPoly(wx, wz, RIVER) + n.fbm(x * 0.01, z * 0.01, 2) * 5;
        if (dr < 90) {
          const w = 16;
          const bed = WATER - 3.2 * (1 - Math.min(1, (dr / w) ** 2));
          const f = smooth(80, w * 1.1, dr);
          const banks = Math.min(v, WATER + 1.5 + (dr - w) * 0.12);
          v = v * (1 - f) + (dr < w ? bed : banks) * f;
        }
        // terreno plano no acampamento e nas torres
        const dc = Math.hypot(x - CAMP.x, z - CAMP.z);
        if (dc < CAMP.r * 2.2) {
          const f = smooth(CAMP.r * 2.2, CAMP.r, dc);
          v = v * (1 - f) + this._campH(n) * f;
        }
        for (const t of TOWERS) {
          const d = Math.hypot(x - t.x, z - t.z);
          if (d < 22) {
            if (t.h === undefined) t.h = this.rawHeight(n, t.x, t.z);
            const f = smooth(22, 8, d);
            v = v * (1 - f) + t.h * f;
          }
        }
        h[j * RES + i] = v;
      }
      if ((j & 63) === 0) {
        onProgress && onProgress(0.75 * (j / RES));
        await tick();
      }
    }
    // trilhas
    const path = this.path;
    for (const pts of this.trails) {
      for (let k = 1; k < pts.length; k++) {
        const [ax, az] = pts[k - 1];
        const [bx, bz] = pts[k];
        const minX = Math.floor((Math.min(ax, bx) - 8 + HALF) / CELL);
        const maxX = Math.ceil((Math.max(ax, bx) + 8 + HALF) / CELL);
        const minZ = Math.floor((Math.min(az, bz) - 8 + HALF) / CELL);
        const maxZ = Math.ceil((Math.max(az, bz) + 8 + HALF) / CELL);
        for (let j = Math.max(0, minZ); j <= Math.min(RES - 1, maxZ); j++)
          for (let i = Math.max(0, minX); i <= Math.min(RES - 1, maxX); i++) {
            const x = -HALF + i * CELL;
            const z = -HALF + j * CELL;
            const d = distSeg(x, z, ax, az, bx, bz) + n.noise(x * 0.05, z * 0.05) * 0.8;
            const v = Math.round(255 * smooth(4.2, 1.6, d));
            if (v > path[j * RES + i]) path[j * RES + i] = v;
          }
      }
    }
    onProgress && onProgress(0.8);
    await tick();
    // florestas e campos
    let minH = 1e9;
    let maxH = -1e9;
    for (let j = 0; j < RES; j++) {
      const z = -HALF + j * CELL;
      for (let i = 0; i < RES; i++) {
        const x = -HALF + i * CELL;
        const id = j * RES + i;
        const v = h[id];
        if (v < minH) minH = v;
        if (v > maxH) maxH = v;
        const sl = this.slopeAtIndex(i, j);
        let f = nf.fbm(x / 650, z / 650, 4) * 0.62 + 0.42 + nf.fbm(x / 140, z / 140, 2) * 0.18;
        f += smooth(-250, -800, x) * 0.42; // oeste: mata fechada
        f -= smooth(200, 650, x) * smooth(-850, -500, z) * (1 - smooth(1250, 1500, z)) * 0.55; // leste: planícies abertas
        f += smooth(-700, -1000, z) * 0.12; // pinheiros na serra
        f -= smooth(0.55, 0.9, sl) * 1.2;
        f -= smooth(320, 400, v) * 1.2;
        f -= smooth(WATER + 3, WATER + 0.5, v) * 1.5;
        const dc = Math.hypot(x - CAMP.x, z - CAMP.z);
        f -= smooth(CAMP.r * 2, CAMP.r * 0.8, dc) * 1.5;
        f -= (path[id] / 255) * 1.5;
        f = clamp(f, 0, 1);
        this.forest[id] = Math.round(f * 255);
        // grama: campos abertos, sem rocha/neve/água
        let g = 1 - f * 0.65;
        g *= 1 - smooth(0.42, 0.62, sl);
        g *= 1 - smooth(300, 360, v);
        g *= smooth(WATER + 0.3, WATER + 1.6, v);
        g *= 1 - (path[id] / 255) * 0.9;
        this.grass[id] = Math.round(clamp(g, 0, 1) * 255);
      }
      if ((j & 127) === 0) {
        onProgress && onProgress(0.8 + 0.2 * (j / RES));
        await tick();
      }
    }
    this.minH = minH;
    this.maxH = maxH;
    onProgress && onProgress(1);
  }

  _campH(n) {
    if (this._ch === undefined) this._ch = Math.max(this.rawHeight(n, CAMP.x, CAMP.z), WATER + 4);
    return this._ch;
  }

  slopeAtIndex(i, j) {
    const h = this.h;
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(RES - 1, i + 1);
    const j0 = Math.max(0, j - 1);
    const j1 = Math.min(RES - 1, j + 1);
    const dx = (h[j * RES + i1] - h[j * RES + i0]) / ((i1 - i0) * CELL);
    const dz = (h[j1 * RES + i] - h[j0 * RES + i]) / ((j1 - j0) * CELL);
    return Math.sqrt(dx * dx + dz * dz);
  }

  // normal suave na grade (para iluminação do terreno)
  normalAtIndex(i, j, out) {
    const h = this.h;
    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(RES - 1, i + 1);
    const j0 = Math.max(0, j - 1);
    const j1 = Math.min(RES - 1, j + 1);
    const dx = (h[j * RES + i1] - h[j * RES + i0]) / ((i1 - i0) * CELL);
    const dz = (h[j1 * RES + i] - h[j0 * RES + i]) / ((j1 - j0) * CELL);
    const l = Math.sqrt(dx * dx + 1 + dz * dz);
    out[0] = -dx / l;
    out[1] = 1 / l;
    out[2] = -dz / l;
    return out;
  }

  // altura exatamente igual à da malha (mesma diagonal dos triângulos)
  height(x, z) {
    let gx = (x + HALF) / CELL;
    let gz = (z + HALF) / CELL;
    if (gx < 0) gx = 0;
    else if (gx > RES - 1.001) gx = RES - 1.001;
    if (gz < 0) gz = 0;
    else if (gz > RES - 1.001) gz = RES - 1.001;
    const i = gx | 0;
    const j = gz | 0;
    const fx = gx - i;
    const fz = gz - j;
    const h = this.h;
    const k = j * RES + i;
    const h00 = h[k];
    const h10 = h[k + 1];
    const h01 = h[k + RES];
    const h11 = h[k + RES + 1];
    if (fx + fz < 1) return h00 + (h10 - h00) * fx + (h01 - h00) * fz;
    return h11 + (h01 - h11) * (1 - fx) + (h10 - h11) * (1 - fz);
  }

  normal(x, z, out) {
    const e = 1.5;
    const dx = (this.height(x + e, z) - this.height(x - e, z)) / (2 * e);
    const dz = (this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
    const l = Math.sqrt(dx * dx + 1 + dz * dz);
    out.x = -dx / l;
    out.y = 1 / l;
    out.z = -dz / l;
    return out;
  }

  slope(x, z) {
    const e = 1.5;
    const dx = (this.height(x + e, z) - this.height(x - e, z)) / (2 * e);
    const dz = (this.height(x, z + e) - this.height(x, z - e)) / (2 * e);
    return Math.sqrt(dx * dx + dz * dz);
  }

  sample(arr, x, z) {
    const i = clamp(Math.round((x + HALF) / CELL), 0, RES - 1);
    const j = clamp(Math.round((z + HALF) / CELL), 0, RES - 1);
    return arr[j * RES + i] / 255;
  }
  forestAt(x, z) {
    return this.sample(this.forest, x, z);
  }
  pathAt(x, z) {
    return this.sample(this.path, x, z);
  }
  grassAt(x, z) {
    return this.sample(this.grass, x, z);
  }
  inBounds(x, z, margin = 0) {
    return Math.abs(x) < HALF - margin && Math.abs(z) < HALF - margin;
  }
  // nome da região (para o HUD)
  regionName(x, z) {
    for (const L of LAKES) if (Math.hypot(x - L.x, z - L.z) < L.r * 1.25) return L.nome;
    if (Math.hypot(x - CAMP.x, z - CAMP.z) < CAMP.r * 2) return CAMP.nome;
    if (Math.hypot(x - LAIR.x, z - LAIR.z) < LAIR.r * 1.2) return LAIR.nome;
    const h = this.height(x, z);
    if (h > 260) return 'Montanhas';
    if (z < -700) return 'Serra do Norte';
    if (this.forestAt(x, z) > 0.45) return x < -250 ? 'Floresta do Oeste' : 'Mata';
    if (x > 200 && z > -700 && z < 1300) return 'Planícies do Leste';
    return 'Campos';
  }
}

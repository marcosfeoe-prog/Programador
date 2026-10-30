// Gerador do mundo (sem three.js): relevo, regiões, estradas, superfície e
// dispersão de árvores. Roda no worker e também na thread principal (física).
import { Simplex, clamp, lerp, smoothstep, hash2 } from '../util.js';
import { WORLD, COUNTRIES, CITIES, FJORDS, LAKES, VOLCANO, DOMES, CANYONS } from './data.js';

export const SPECIES = [
  'spruce',
  'pine',
  'birch',
  'beech',
  'cherry',
  'cedar',
  'maple',
  'saguaro',
  'shrub',
  'agave',
  'cypress',
  'stonepine',
  'olive',
  'tropical',
  'palm',
  'banana',
  'rock',
  'bush',
];
export const SP = Object.fromEntries(SPECIES.map((s, i) => [s, i]));

// Superfícies (atrito para a física e som dos pneus)
export const SURF = { asphalt: 0, gravel: 1, grass: 2, dirt: 3, sand: 4, rock: 5, snow: 6, water: 7 };
export const SURF_MU = [1.0, 0.78, 0.68, 0.74, 0.58, 0.8, 0.45, 0.3];

const HC = 64; // célula do índice espacial das estradas
const HMARGIN = 64;
const hkey = (cx, cz) => (cx + 2048) * 4096 + (cz + 2048);

// polilinhas pré-processadas (fiordes e cânions): segmentos e caixa envolvente
function prepPoly(pts, pad) {
  const seg = [];
  let total = 0;
  let x0 = 1e9;
  let x1 = -1e9;
  let z0 = 1e9;
  let z1 = -1e9;
  for (let i = 0; i < pts.length - 1; i++) {
    const l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
    seg.push([pts[i][0], pts[i][1], pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1], total, l]);
    total += l;
  }
  for (const p of pts) {
    x0 = Math.min(x0, p[0] - pad);
    x1 = Math.max(x1, p[0] + pad);
    z0 = Math.min(z0, p[1] - pad);
    z1 = Math.max(z1, p[1] + pad);
  }
  return { seg, total, x0, x1, z0, z1 };
}
const _pd = [0, 0];
function polyDist(px, pz, P) {
  // distância a uma polilinha e posição ao longo dela (0..1); null fora da caixa
  if (px < P.x0 || px > P.x1 || pz < P.z0 || pz > P.z1) return null;
  let best = 1e18;
  let bestU = 0;
  for (const s of P.seg) {
    const l2 = s[2] * s[2] + s[3] * s[3];
    let t = ((px - s[0]) * s[2] + (pz - s[1]) * s[3]) / l2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const qx = s[0] + s[2] * t - px;
    const qz = s[1] + s[3] * t - pz;
    const d = qx * qx + qz * qz;
    if (d < best) {
      best = d;
      bestU = (s[4] + s[5] * t) / P.total;
    }
  }
  _pd[0] = Math.sqrt(best);
  _pd[1] = bestU;
  return _pd;
}
const FJ = FJORDS.map((f) => ({ ...f, P: prepPoly(f.pts, f.w0) }));
const CN = CANYONS.map((c) => ({ ...c, P: prepPoly(c.pts, c.w) }));

export class WorldGen {
  constructor(seed = 20261030) {
    this.seed = seed;
    this.n = new Simplex(seed);
    this.n2 = new Simplex(seed + 101);
    this.n3 = new Simplex(seed + 977);
    this.w = new Float32Array(6);
    this.roads = [];
    this.hash = new Map();
    this.q = { dist: 0, side: 0, h: 0, road: null, seg: 0, t: 0, s: 0, hw: 0, bridge: 0, dx: 0, dz: 0 };
    // altura dos lagos automáticos e das cidades
    for (const l of LAKES) {
      if (l.auto) l.level = Math.max(4, this.naturalNoLakes(l.x, l.z) - 4);
    }
    for (const c of CITIES) {
      let s = this.natural(c.x, c.z) * 2;
      let n = 2;
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        s += this.natural(c.x + Math.cos(a) * c.r * 0.6, c.z + Math.sin(a) * c.r * 0.6);
        n++;
      }
      c.h = Math.max(c.coastal ? 3.5 : 6, s / n);
      c.fall = c.coastal ? 260 : 190;
    }
  }

  // ------------------------------------------------------------ regiões
  // pesos das 6 regiões (soma = 1) em this.w; devolve o índice dominante
  weights(x, z) {
    const n = this.n;
    const wx = x + 520 * n.noise(x / 2900, z / 2900) + 140 * n.noise(x / 700 + 9, z / 700);
    const wz = z + 520 * n.noise(x / 2900 + 31, z / 2900 + 17) + 140 * n.noise(x / 700, z / 700 + 9);
    const B = 420;
    const c0 = 1 - smoothstep(WORLD.colSplit[0] - B, WORLD.colSplit[0] + B, wx);
    const c2 = smoothstep(WORLD.colSplit[1] - B, WORLD.colSplit[1] + B, wx);
    const c1 = 1 - c0 - c2;
    const r0 = 1 - smoothstep(-B, B, wz);
    const r1 = 1 - r0;
    const w = this.w;
    w[0] = c0 * r0;
    w[1] = c1 * r0;
    w[2] = c2 * r0;
    w[3] = c0 * r1;
    w[4] = c1 * r1;
    w[5] = c2 * r1;
    let bi = 0;
    for (let i = 1; i < 6; i++) if (w[i] > w[bi]) bi = i;
    return bi;
  }

  // país "oficial" (sem mistura), pela fronteira deformada
  countryAt(x, z) {
    return this.weights(x, z);
  }

  coastDist(x, z) {
    const q = Math.pow(Math.abs(x) / WORLD.coastHX, 6) + Math.pow(Math.abs(z) / WORLD.coastHZ, 6);
    const base = (1 - Math.pow(q, 1 / 6)) * WORLD.coastHZ;
    return base + 520 * this.n2.fbm(x / 3200, z / 3200, 3) + 110 * this.n2.noise(x / 650, z / 650);
  }

  biomeH(i, x, z) {
    const n = this.n;
    switch (i) {
      case 0: {
        const r = n.ridged(x / 3300 + 3.1, z / 3300 + 1.7, 5);
        return 55 + 760 * Math.pow(r, 1.35) + 45 * n.fbm(x / 600, z / 600, 3);
      }
      case 1: {
        const r = n.ridged(x / 3900 + 5.3, z / 3900 + 5.9, 6);
        return 240 + 1400 * Math.pow(r, 1.55) + 70 * n.fbm(x / 700 + 2, z / 700, 3);
      }
      case 2:
        return 45 + 170 * (n.fbm(x / 2100 + 8, z / 2100 + 4, 4) * 0.5 + 0.5) + 35 * n.fbm(x / 480, z / 480, 3);
      case 3: {
        const m = n.fbm(x / 1900 + 11, z / 1900 + 7, 3) * 0.5 + 0.5;
        const mesa = smoothstep(0.56, 0.6, m) * 150 + smoothstep(0.69, 0.72, m) * 90;
        return 170 + 85 * n.fbm(x / 2600, z / 2600, 3) + mesa + 12 * n.fbm(x / 300, z / 300, 2);
      }
      case 4:
        return 70 + 160 * (n.fbm(x / 2300 + 3, z / 2300 + 9, 4) * 0.5 + 0.5) + 18 * n.fbm(x / 420, z / 420, 2);
      default: {
        const f = n.fbm(x / 1700 + 7, z / 1700 + 1, 5) * 0.5 + 0.5;
        return 55 + 250 * Math.pow(f, 1.4) + 28 * n.fbm(x / 360, z / 360, 3);
      }
    }
  }

  // relevo natural sem lagos (usado para calibrar o nível dos lagos)
  naturalNoLakes(x, z) {
    this.weights(x, z);
    const w = this.w;
    let h = 0;
    for (let i = 0; i < 6; i++) if (w[i] > 0.0005) h += w[i] * this.biomeH(i, x, z);
    // vulcão
    const vd = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
    if (vd < VOLCANO.r) {
      const k = 1 - vd / VOLCANO.r;
      let cone = VOLCANO.h * Math.pow(k, 1.7);
      cone += 35 * k * this.n3.ridged(x / 500, z / 500, 3);
      if (vd < VOLCANO.crater) cone -= Math.pow(1 - vd / VOLCANO.crater, 2) * 140;
      h += cone;
    }
    // morros de granito
    for (const d of DOMES) {
      const r = Math.hypot(x - d[0], z - d[1]) / d[2];
      if (r < 1) h += d[3] * Math.pow(1 - r * r, 0.55);
    }
    // cânions
    for (const c of CN) {
      const r = polyDist(x, z, c.P);
      if (!r) continue;
      const d = r[0];
      if (d < c.w) {
        const k = smoothstep(c.w, c.w * 0.45, d + 30 * this.n3.noise(x / 200, z / 200));
        h -= c.depth * k;
      }
    }
    // litoral
    const cd = this.coastDist(x, z);
    const ramp = smoothstep(0, 900 + 900 * (w[5] + w[4] + w[2]), cd);
    const land = 1.2 + Math.min(cd, 200) * 0.012 + (h - 3) * ramp;
    const sea = Math.min(cd, 0) * 0.035 - 1.5;
    h = lerp(sea, land, smoothstep(-70, 50, cd));
    // fiordes
    if (w[0] > 0.01) {
      for (const f of FJ) {
        const r = polyDist(x, z, f.P);
        if (!r) continue;
        const d = r[0];
        const fw = lerp(f.w0, f.w1, r[1]);
        if (d < fw) h = lerp(h, -45, smoothstep(fw, fw * 0.45, d));
      }
    }
    return h;
  }

  natural(x, z) {
    let h = this.naturalNoLakes(x, z);
    for (const l of LAKES) {
      const dx = x - l.x;
      const dz = z - l.z;
      const dd = dx * dx + dz * dz;
      const R = l.r * 2.2;
      if (dd > R * R) continue;
      const d = Math.sqrt(dd) / l.r + 0.08 * this.n3.noise(x / 260, z / 260);
      if (d < 1) {
        h = l.level - 1.5 - 22 * Math.pow(1 - d, 0.6);
      } else {
        const rim = l.level + 0.8 + (d - 1) * l.r * 0.06;
        const k = smoothstep(1, 2.1, d);
        h = lerp(Math.max(rim, Math.min(h, rim + 40)), h, k);
      }
    }
    return h;
  }

  // nível da água em (x, z): lago próximo ou o mar
  waterLevel(x, z) {
    for (const l of LAKES) {
      const dx = x - l.x;
      const dz = z - l.z;
      if (dx * dx + dz * dz < l.r * l.r * 1.33) return l.level;
    }
    return WORLD.seaLevel;
  }

  // ------------------------------------------------------------ estradas
  setRoads(roads) {
    this.roads = roads;
    this.hash.clear();
    for (let r = 0; r < roads.length; r++) {
      const p = roads[r].pts;
      const n = p.length / 2;
      for (let i = 0; i < n - 1; i++) {
        const x0 = Math.min(p[i * 2], p[i * 2 + 2]) - HMARGIN;
        const x1 = Math.max(p[i * 2], p[i * 2 + 2]) + HMARGIN;
        const z0 = Math.min(p[i * 2 + 1], p[i * 2 + 3]) - HMARGIN;
        const z1 = Math.max(p[i * 2 + 1], p[i * 2 + 3]) + HMARGIN;
        for (let cx = Math.floor(x0 / HC); cx <= Math.floor(x1 / HC); cx++)
          for (let cz = Math.floor(z0 / HC); cz <= Math.floor(z1 / HC); cz++) {
            const k = hkey(cx, cz);
            let l = this.hash.get(k);
            if (!l) this.hash.set(k, (l = []));
            l.push(r, i);
          }
      }
    }
  }

  // estrada mais próxima até maxD metros; devolve this.q ou null
  roadQuery(x, z, maxD = 60) {
    const l = this.hash.get(hkey(Math.floor(x / HC), Math.floor(z / HC)));
    if (!l) return null;
    let best = maxD * maxD;
    let br = -1;
    let bi = 0;
    let bt = 0;
    const roads = this.roads;
    for (let k = 0; k < l.length; k += 2) {
      const p = roads[l[k]].pts;
      const i = l[k + 1] * 2;
      const ax = p[i];
      const az = p[i + 1];
      const dx = p[i + 2] - ax;
      const dz = p[i + 3] - az;
      const l2 = dx * dx + dz * dz;
      let t = l2 > 0 ? ((x - ax) * dx + (z - az) * dz) / l2 : 0;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const qx = ax + dx * t - x;
      const qz = az + dz * t - z;
      const d = qx * qx + qz * qz;
      if (d < best) {
        best = d;
        br = l[k];
        bi = l[k + 1];
        bt = t;
      }
    }
    if (br < 0) return null;
    const r = roads[br];
    const p = r.pts;
    const i = bi * 2;
    const dx = p[i + 2] - p[i];
    const dz = p[i + 3] - p[i + 1];
    const q = this.q;
    q.dist = Math.sqrt(best);
    q.side = Math.sign(dx * (z - p[i + 1]) - dz * (x - p[i])) || 1;
    q.h = lerp(r.hs[bi], r.hs[bi + 1], bt);
    q.road = r;
    q.seg = bi;
    q.t = bt;
    q.s = lerp(r.cum[bi], r.cum[bi + 1], bt);
    q.hw = r.hw;
    q.bridge = r.br[bi] && r.br[bi + 1] ? 1 : 0;
    const l2 = Math.hypot(dx, dz) || 1;
    q.dx = dx / l2;
    q.dz = dz / l2;
    return q;
  }

  cityAt(x, z, pad = 0) {
    for (const c of CITIES) {
      const dx = x - c.x;
      const dz = z - c.z;
      if (dx * dx + dz * dz < (c.r + pad) * (c.r + pad)) return c;
    }
    return null;
  }

  // altura final do terreno (com cidades e estradas)
  height(x, z) {
    let h = this.natural(x, z);
    for (const c of CITIES) {
      const dx = x - c.x;
      const dz = z - c.z;
      const R = c.r + c.fall;
      const dd = dx * dx + dz * dz;
      if (dd < R * R) {
        const k = 1 - smoothstep(c.r, R, Math.sqrt(dd));
        h = lerp(h, c.h, k);
      }
    }
    const q = this.roadQuery(x, z, 62);
    if (q && !q.bridge) {
      const hr = q.h - 0.14;
      const edge = q.hw + 1.7;
      const fall = 4 + Math.min(Math.abs(h - hr) * 1.5, 52);
      const k = 1 - smoothstep(edge, edge + fall, q.dist);
      if (k > 0) h = lerp(h, hr, k);
    }
    return h;
  }

  // só a altura de rodagem (pista ou terreno), sem classificar o piso
  groundH(x, z) {
    const q = this.roadQuery(x, z, 62);
    if (q && q.dist < q.hw + 1.5) return q.h - (q.dist > q.hw ? 0.04 : 0);
    return this.height(x, z);
  }

  // superfície de rodagem para a física: altura e tipo de piso
  ground(x, z, out) {
    const q = this.roadQuery(x, z, 62);
    if (q && q.dist < q.hw + 1.5) {
      out.h = q.h - (q.dist > q.hw ? 0.04 : 0);
      out.surf = q.dist < q.hw ? SURF.asphalt : SURF.gravel;
      out.road = true;
      return out;
    }
    out.road = false;
    const h = this.height(x, z);
    out.h = h;
    if (h < WORLD.seaLevel - 0.6) {
      out.surf = SURF.water;
      return out;
    }
    const c = this.cityAt(x, z, 10);
    if (c) {
      out.surf = SURF.asphalt;
      return out;
    }
    const e = 2.5;
    const sx = this.height(x + e, z) - h;
    const sz = this.height(x, z + e) - h;
    const slope = Math.hypot(sx, sz) / e;
    const ci = this.weights(x, z);
    if (slope > 0.75) out.surf = SURF.rock;
    else if (h < 3.2 && this.coastDist(x, z) < 700) out.surf = SURF.sand;
    else if (h > COUNTRIES[ci].snowLine) out.surf = SURF.snow;
    else if (ci === 3) out.surf = SURF.dirt;
    else out.surf = SURF.grass;
    return out;
  }

  // ------------------------------------------------------------ atributos do terreno
  // cor (grama tingida) e pesos (rocha, areia, neve, terra) de um vértice
  vertexAttr(x, z, h, ny, col, ci, wgt, wi) {
    this.weights(x, z);
    const w = this.w;
    let r = 0;
    let g = 0;
    let b = 0;
    let snowLine = 0;
    let desert = w[3];
    for (let i = 0; i < 6; i++) {
      if (w[i] < 0.0005) continue;
      const C = COUNTRIES[i];
      const dryK = clamp(this.n2.noise(x / 900 + i, z / 900) * 0.6 + (i === 4 ? 0.35 : i === 3 ? 0.6 : 0.05), 0, 1);
      r += w[i] * lerp(C.grass[0], C.dry[0], dryK);
      g += w[i] * lerp(C.grass[1], C.dry[1], dryK);
      b += w[i] * lerp(C.grass[2], C.dry[2], dryK);
      snowLine += w[i] * Math.min(C.snowLine, 4000);
    }
    const v = 0.88 + 0.22 * this.n3.fbm(x / 140, z / 140, 2);
    const forest = this.forestDensity(x, z);
    const fk = 1 - forest * 0.28;
    col[ci] = r * v * fk;
    col[ci + 1] = g * v * fk;
    col[ci + 2] = b * v * fk;

    const slope = 1 - ny;
    let rock = smoothstep(0.2, 0.42, slope + 0.05 * this.n3.noise(x / 40, z / 40));
    rock = Math.max(rock, smoothstep(snowLine - 250, snowLine + 50, h) * 0.6);
    let snow = smoothstep(snowLine, snowLine + 140, h + 90 * this.n3.noise(x / 300, z / 300)) * (1 - smoothstep(0.5, 0.72, slope));
    let sand = 0;
    let dirt = 0;
    if (h < 4.2) {
      const cd = this.coastDist(x, z);
      if (cd < 900 || h < 0.8) sand = smoothstep(4.2, 2.0, h);
    }
    if (desert > 0.01) {
      const dn = this.n3.fbm(x / 220, z / 220, 2) * 0.5 + 0.5;
      sand = Math.max(sand, desert * (0.35 + 0.4 * dn));
      dirt = Math.max(dirt, desert * (0.45 - 0.3 * dn));
    }
    if (w[4] > 0.01) dirt = Math.max(dirt, w[4] * smoothstep(0.55, 0.8, this.n2.noise(x / 300, z / 300) * 0.5 + 0.5) * 0.7);
    const q = this.roadQuery(x, z, 12);
    if (q && !q.bridge) dirt = Math.max(dirt, 0.85 * (1 - smoothstep(q.hw + 1.2, q.hw + 4.5, q.dist)));
    const c = this.cityAt(x, z, 40);
    if (c) dirt = Math.max(dirt, 0.25);
    wgt[wi] = rock;
    wgt[wi + 1] = sand * (1 - rock * 0.6);
    wgt[wi + 2] = snow;
    wgt[wi + 3] = dirt * (1 - rock);
  }

  forestDensity(x, z) {
    const f = this.n2.fbm(x / 1300 + 40, z / 1300 + 12, 4) * 0.5 + 0.5;
    const ci = this.weights(x, z);
    const base = COUNTRIES[ci].forest;
    return smoothstep(0.62 - base * 0.5, 0.8 - base * 0.4, f + this.n3.noise(x / 160, z / 160) * 0.06);
  }

  // ------------------------------------------------------------ malhas do terreno
  // Grade regular de (nx+1) x (nz+1) vértices a partir de (x0, z0), passo res.
  // Vértices em coordenadas locais (relativas a x0, z0). Com saia opcional.
  buildGrid(x0, z0, nx, nz, res, skirt) {
    const W = nx + 3;
    const Hh = new Float32Array(W * (nz + 3));
    let hmin = 1e9;
    let hmax = -1e9;
    for (let j = 0; j < nz + 3; j++)
      for (let i = 0; i < W; i++) {
        const h = this.height(x0 + (i - 1) * res, z0 + (j - 1) * res);
        Hh[j * W + i] = h;
      }
    const vcount = (nx + 1) * (nz + 1);
    const scount = skirt ? 2 * (nx + 1) + 2 * (nz + 1) : 0;
    const total = vcount + scount;
    const pos = new Float32Array(total * 3);
    const nrm = new Float32Array(total * 3);
    const col = new Float32Array(total * 3);
    const wgt = new Float32Array(total * 4);
    for (let j = 0; j <= nz; j++)
      for (let i = 0; i <= nx; i++) {
        const k = j * (nx + 1) + i;
        const hi = (j + 1) * W + (i + 1);
        const h = Hh[hi];
        if (h < hmin) hmin = h;
        if (h > hmax) hmax = h;
        pos[k * 3] = i * res;
        pos[k * 3 + 1] = h;
        pos[k * 3 + 2] = j * res;
        let ax = Hh[hi - 1] - Hh[hi + 1];
        let ay = 2 * res;
        let az = Hh[hi - W] - Hh[hi + W];
        const l = Math.hypot(ax, ay, az);
        ax /= l;
        ay /= l;
        az /= l;
        nrm[k * 3] = ax;
        nrm[k * 3 + 1] = ay;
        nrm[k * 3 + 2] = az;
        this.vertexAttr(x0 + i * res, z0 + j * res, h, ay, col, k * 3, wgt, k * 4);
      }
    let idxCount = nx * nz * 6 + (skirt ? (2 * nx + 2 * nz) * 6 : 0);
    const idx = total > 65535 ? new Uint32Array(idxCount) : new Uint16Array(idxCount);
    let o = 0;
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const a = j * (nx + 1) + i;
        const b = a + 1;
        const c = a + (nx + 1);
        const d = c + 1;
        // diagonal alternada para relevo mais natural
        if ((i + j) & 1) {
          idx[o++] = a;
          idx[o++] = c;
          idx[o++] = b;
          idx[o++] = b;
          idx[o++] = c;
          idx[o++] = d;
        } else {
          idx[o++] = a;
          idx[o++] = c;
          idx[o++] = d;
          idx[o++] = a;
          idx[o++] = d;
          idx[o++] = b;
        }
      }
    if (skirt) {
      // borda: lista de vértices em volta (sentido consistente)
      const ring = [];
      for (let i = 0; i <= nx; i++) ring.push([i, 0]);
      for (let j = 0; j <= nz; j++) ring.push([nx, j]);
      for (let i = nx; i >= 0; i--) ring.push([i, nz]);
      for (let j = nz; j >= 0; j--) ring.push([0, j]);
      let sv = vcount;
      const drop = skirt;
      const sides = [nx + 1, nz + 1, nx + 1, nz + 1];
      let ri = 0;
      for (let s = 0; s < 4; s++) {
        const start = sv;
        for (let q = 0; q < sides[s]; q++, ri++, sv++) {
          const [i, j] = ring[ri];
          const k = j * (nx + 1) + i;
          pos[sv * 3] = pos[k * 3];
          pos[sv * 3 + 1] = pos[k * 3 + 1] - drop;
          pos[sv * 3 + 2] = pos[k * 3 + 2];
          nrm[sv * 3] = nrm[k * 3];
          nrm[sv * 3 + 1] = nrm[k * 3 + 1];
          nrm[sv * 3 + 2] = nrm[k * 3 + 2];
          col[sv * 3] = col[k * 3];
          col[sv * 3 + 1] = col[k * 3 + 1];
          col[sv * 3 + 2] = col[k * 3 + 2];
          for (let c = 0; c < 4; c++) wgt[sv * 4 + c] = wgt[k * 4 + c];
        }
        ri -= sides[s];
        for (let q = 0; q < sides[s] - 1; q++, ri++) {
          const [i0, j0] = ring[ri];
          const [i1, j1] = ring[ri + 1];
          const a = j0 * (nx + 1) + i0;
          const b = j1 * (nx + 1) + i1;
          const c = start + q;
          const d = start + q + 1;
          idx[o++] = a;
          idx[o++] = b;
          idx[o++] = c;
          idx[o++] = b;
          idx[o++] = d;
          idx[o++] = c;
        }
        ri++;
      }
    }
    return { pos, nrm, col, wgt, idx: o < idx.length ? idx.slice(0, o) : idx, hmin, hmax };
  }

  // ------------------------------------------------------------ árvores
  // Árvores e pedras numa célula quadrada. Registro de 8 floats:
  // x, y, z, escala, rotação, espécie, tom, raridade (0..1, para o LOD distante)
  scatterCell(cx, cz, size) {
    const out = [];
    const x0 = cx * size;
    const z0 = cz * size;
    const sp = 8.5;
    const n = Math.floor(size / sp);
    const push = (x, y, z, s, sid, rnd) => out.push(x, y, z, s, rnd * 6.2832, sid, hash2(x | 0, z | 0, 7), rnd);
    for (let j = 0; j < n; j++)
      for (let i = 0; i < n; i++) {
        const gx = cx * n + i;
        const gz = cz * n + j;
        const r1 = hash2(gx, gz, 1);
        const r2 = hash2(gx, gz, 2);
        const r3 = hash2(gx, gz, 3);
        const x = x0 + (i + 0.15 + r1 * 0.7) * sp;
        const z = z0 + (j + 0.15 + r2 * 0.7) * sp;
        const ci = this.weights(x, z);
        const C = COUNTRIES[ci];
        const fd = this.forestDensity(x, z);
        let p = 0.025 + fd * 0.85;
        if (ci === 3) p = 0.04 + fd * 0.12;
        const city = this.cityAt(x, z, 60);
        if (city) {
          const d = Math.hypot(x - city.x, z - city.z);
          if (d < city.r + 15) continue;
          p *= 0.3;
        }
        const r4 = hash2(gx, gz, 4);
        const q = this.roadQuery(x, z, 30);
        const roadClear = q ? q.dist - q.hw : 99;
        if (roadClear < 4.5) continue;
        if (r3 > p) {
          // pedras e arbustos esparsos fora da mata
          if (r3 > 0.985 && roadClear > 6) {
            const h = this.height(x, z);
            if (h > 1.5) push(x, h - 0.3, z, 0.5 + r4 * 1.8, SP.rock, r4);
          } else if (r3 < p + 0.05 && roadClear > 5) {
            const h = this.height(x, z);
            if (h > 1.2 && h < C.treeLine) push(x, h, z, 0.6 + r4 * 0.6, ci === 3 ? SP.shrub : SP.bush, r4);
          }
          continue;
        }
        const h = this.height(x, z);
        if (h < 1.6) continue;
        const e = 3;
        const slope = Math.hypot(this.height(x + e, z) - h, this.height(x, z + e) - h) / e;
        if (slope > 0.85) {
          if (r4 < 0.2) push(x, h - 0.5, z, 0.8 + r4 * 6, SP.rock, r4);
          continue;
        }
        const tl = C.treeLine + 60 * this.n3.noise(x / 200, z / 200);
        if (h > tl) {
          if (r4 < 0.12) push(x, h - 0.4, z, 0.6 + r4 * 8, SP.rock, r4);
          continue;
        }
        // espécie pelos pesos do país; praias tropicais ganham coqueiros
        let sid = -1;
        const sps = C.species;
        let acc = 0;
        const pick = hash2(gx, gz, 5);
        for (const k in sps) {
          acc += sps[k];
          if (pick <= acc) {
            sid = SP[k];
            break;
          }
        }
        if (sid < 0) sid = SP[Object.keys(sps)[0]];
        if ((ci === 5 || ci === 3) && h < 12 && this.coastDist(x, z) < 900) sid = SP.palm;
        if (ci === 0 && h > tl - 180 && sid === SP.birch) sid = SP.spruce;
        let s = 0.75 + r4 * 0.55;
        if (sid === SP.agave || sid === SP.shrub) s = 0.6 + r4 * 0.8;
        push(x, h, z, s, sid, r4);
      }
    // fileiras ao longo das estradas (ciprestes na Itália, cerejeiras no Japão)
    const seen = new Set();
    for (let hx = Math.floor(x0 / HC); hx < Math.ceil((x0 + size) / HC); hx++)
      for (let hz = Math.floor(z0 / HC); hz < Math.ceil((z0 + size) / HC); hz++) {
        const l = this.hash.get(hkey(hx, hz));
        if (!l) continue;
        for (let k = 0; k < l.length; k += 2) {
          const key = l[k] * 100000 + l[k + 1];
          if (seen.has(key)) continue;
          seen.add(key);
          const r = this.roads[l[k]];
          const i = l[k + 1];
          const ax = r.pts[i * 2];
          const az = r.pts[i * 2 + 1];
          if (ax < x0 || ax >= x0 + size || az < z0 || az >= z0 + size) continue;
          if (i % 2 !== 0 || r.br[i]) continue;
          const ci = this.weights(ax, az);
          if (ci !== 4 && ci !== 2) continue;
          const s = r.cum[i];
          const band = this.n3.noise(s / 400 + l[k] * 7, l[k] * 3.3);
          if (band < 0.15) continue;
          const dx = r.pts[i * 2 + 2] - ax;
          const dz = r.pts[i * 2 + 3] - az;
          const len = Math.hypot(dx, dz) || 1;
          for (const side of [-1, 1]) {
            const off = r.hw + (ci === 4 ? 7.5 : 6.5);
            const x = ax - (dz / len) * off * side;
            const z = az + (dx / len) * off * side;
            if (this.cityAt(x, z, 20)) continue;
            const qq = this.roadQuery(x, z, 20);
            if (qq && qq.dist < qq.hw + 4.5) continue;
            const h = this.height(x, z);
            if (h < 1.5) continue;
            const rr = hash2(i, l[k], side + 5);
            push(x, h, z, 0.85 + rr * 0.3, ci === 4 ? SP.cypress : SP.cherry, rr);
          }
        }
      }
    return new Float32Array(out);
  }
}

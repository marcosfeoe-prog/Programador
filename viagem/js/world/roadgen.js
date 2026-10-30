// Traçado das estradas: A* sobre uma grade de relevo (evita rampas fortes e água),
// simplificação, suavização das curvas e perfil de altura com rampa máxima.
import { WORLD, CITIES, ROADS } from './data.js';
import { lerp, clamp } from '../util.js';

const RES = 40;
const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
  [2, 1],
  [2, -1],
  [-2, 1],
  [-2, -1],
  [1, 2],
  [1, -2],
  [-1, 2],
  [-1, -2],
];

class Heap {
  constructor(cap) {
    this.idx = new Int32Array(cap);
    this.f = new Float32Array(cap);
    this.n = 0;
  }
  push(i, f) {
    let k = this.n++;
    if (k >= this.idx.length) {
      const ni = new Int32Array(this.idx.length * 2);
      ni.set(this.idx);
      const nf = new Float32Array(this.f.length * 2);
      nf.set(this.f);
      this.idx = ni;
      this.f = nf;
    }
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (this.f[p] <= f) break;
      this.idx[k] = this.idx[p];
      this.f[k] = this.f[p];
      k = p;
    }
    this.idx[k] = i;
    this.f[k] = f;
  }
  pop() {
    const top = this.idx[0];
    const li = this.idx[--this.n];
    const lf = this.f[this.n];
    let k = 0;
    for (;;) {
      let c = 2 * k + 1;
      if (c >= this.n) break;
      if (c + 1 < this.n && this.f[c + 1] < this.f[c]) c++;
      if (this.f[c] >= lf) break;
      this.idx[k] = this.idx[c];
      this.f[k] = this.f[c];
      k = c;
    }
    this.idx[k] = li;
    this.f[k] = lf;
    return top;
  }
}

export function generateRoads(gen, progress) {
  const nx = Math.round((WORLD.maxX - WORLD.minX) / RES);
  const nz = Math.round((WORLD.maxZ - WORLD.minZ) / RES);
  const N = nx * nz;
  const H = new Float32Array(N);
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) H[j * nx + i] = gen.natural(WORLD.minX + (i + 0.5) * RES, WORLD.minZ + (j + 0.5) * RES);
    if (progress && j % 40 === 0) progress(0.4 * (j / nz));
  }
  const cityCell = new Uint8Array(N);
  for (const c of CITIES) {
    const ci = Math.floor((c.x - WORLD.minX) / RES);
    const cj = Math.floor((c.z - WORLD.minZ) / RES);
    const rr = Math.ceil(c.r / RES);
    for (let j = cj - rr; j <= cj + rr; j++)
      for (let i = ci - rr; i <= ci + rr; i++) if (i >= 0 && j >= 0 && i < nx && j < nz) cityCell[j * nx + i] = 1;
  }
  const used = new Uint8Array(N); // células já ocupadas por outra estrada
  const g = new Float32Array(N);
  const came = new Int32Array(N);
  const closed = new Uint8Array(N);
  const heap = new Heap(1 << 16);
  const sampleH = (x, z) => {
    const fx = (x - WORLD.minX) / RES - 0.5;
    const fz = (z - WORLD.minZ) / RES - 0.5;
    const i = clamp(Math.floor(fx), 0, nx - 2);
    const j = clamp(Math.floor(fz), 0, nz - 2);
    const u = clamp(fx - i, 0, 1);
    const v = clamp(fz - j, 0, 1);
    const a = H[j * nx + i];
    const b = H[j * nx + i + 1];
    const c = H[(j + 1) * nx + i];
    const d = H[(j + 1) * nx + i + 1];
    return lerp(lerp(a, b, u), lerp(c, d, u), v);
  };

  const astar = (sx, sz, tx, tz) => {
    g.fill(1e30);
    closed.fill(0);
    heap.n = 0;
    const s = sz * nx + sx;
    const t = tz * nx + tx;
    g[s] = 0;
    came[s] = -1;
    heap.push(s, 0);
    while (heap.n > 0) {
      const u = heap.pop();
      if (u === t) break;
      if (closed[u]) continue;
      closed[u] = 1;
      const ux = u % nx;
      const uz = (u / nx) | 0;
      const hu = H[u];
      for (let d = 0; d < 16; d++) {
        const vx = ux + DIRS[d][0];
        const vz = uz + DIRS[d][1];
        if (vx < 1 || vz < 1 || vx >= nx - 1 || vz >= nz - 1) continue;
        const v = vz * nx + vx;
        if (closed[v]) continue;
        const L = RES * Math.hypot(DIRS[d][0], DIRS[d][1]);
        const hv = H[v];
        // para movimentos longos, confere também o ponto do meio
        let hm = hv;
        if (d >= 8) hm = H[(uz + Math.round(DIRS[d][1] / 2)) * nx + ux + Math.round(DIRS[d][0] / 2)];
        const grade = Math.abs(hv - hu) / L;
        let c = L * (1 + 30 * grade * grade + (grade > 0.1 ? (grade - 0.1) * 140 : 0));
        if (hv < 1.6 || hm < 1.6) c += L * (Math.min(hv, hm) < -12 ? 30 : 9);
        if (used[v] && !cityCell[v]) c *= 2.2;
        if (cityCell[v]) c *= 0.7;
        const ng = g[u] + c;
        if (ng < g[v]) {
          g[v] = ng;
          came[v] = u;
          const hx = (vx - tx) * RES;
          const hz = (vz - tz) * RES;
          heap.push(v, ng + Math.sqrt(hx * hx + hz * hz) * 0.98);
        }
      }
    }
    const path = [];
    let k = t;
    while (k >= 0 && k !== s) {
      path.push(k);
      k = came[k];
      if (path.length > N) break;
    }
    path.push(s);
    path.reverse();
    return path;
  };

  const roads = [];
  const cityIdx = Object.fromEntries(CITIES.map((c, i) => [c.id, i]));
  for (let r = 0; r < ROADS.length; r++) {
    const R = ROADS[r];
    const A = CITIES[cityIdx[R.a]];
    const B = CITIES[cityIdx[R.b]];
    const cell = (c) => [Math.floor((c.x - WORLD.minX) / RES), Math.floor((c.z - WORLD.minZ) / RES)];
    const [ax, az] = cell(A);
    const [bx, bz] = cell(B);
    const path = astar(ax, az, bx, bz);
    let P = path.map((k) => [WORLD.minX + ((k % nx) + 0.5) * RES, WORLD.minZ + (((k / nx) | 0) + 0.5) * RES, H[k]]);
    P[0] = [A.x, A.z, 0];
    P[P.length - 1] = [B.x, B.z, 0];

    // 1) simplificação: corta caminho em linha reta quando o relevo permite
    const isWater = P.map((p) => sampleH(p[0], p[1]) < 1.6);
    const simp = [P[0]];
    let i = 0;
    while (i < P.length - 1) {
      let best = i + 1;
      for (let j = Math.min(P.length - 1, i + 45); j > i + 1; j--) {
        const dx = P[j][0] - P[i][0];
        const dz = P[j][1] - P[i][1];
        const dist = Math.hypot(dx, dz);
        const hi = sampleH(P[i][0], P[i][1]);
        const hj = sampleH(P[j][0], P[j][1]);
        if (Math.abs(hj - hi) / dist > 0.085) continue;
        let water = false;
        for (let k = i; k <= j; k++) water = water || isWater[k];
        let ok = true;
        const steps = Math.ceil(dist / 20);
        for (let k = 1; k < steps; k++) {
          const u = k / steps;
          const hs = sampleH(P[i][0] + dx * u, P[i][1] + dz * u);
          if (Math.abs(hs - lerp(hi, hj, u)) > 9 || (!water && hs < 1.6)) {
            ok = false;
            break;
          }
        }
        if (ok) {
          best = j;
          break;
        }
      }
      simp.push(P[best]);
      i = best;
    }
    // 2) Chaikin (curvas suaves)
    let pts = simp.map((p) => [p[0], p[1]]);
    for (let it = 0; it < 4; it++) {
      const np = [pts[0]];
      for (let k = 0; k < pts.length - 1; k++) {
        const a = pts[k];
        const b = pts[k + 1];
        np.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25]);
        np.push([a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
      }
      np.push(pts[pts.length - 1]);
      pts = np;
    }
    // 3) reamostragem a cada 5 m
    const STEP = 5;
    const res = [pts[0].slice()];
    let carry = 0;
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k];
      const b = pts[k + 1];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      let d = STEP - carry;
      while (d <= L) {
        res.push([lerp(a[0], b[0], d / L), lerp(a[1], b[1], d / L)]);
        d += STEP;
      }
      carry = L - (d - STEP);
    }
    const last = pts[pts.length - 1];
    if (Math.hypot(res[res.length - 1][0] - last[0], res[res.length - 1][1] - last[1]) > 1) res.push(last.slice());
    else res[res.length - 1] = last.slice();
    // 4) suavização laplaciana leve
    for (let it = 0; it < 12; it++) {
      for (let k = 1; k < res.length - 1; k++) {
        res[k][0] = res[k][0] * 0.5 + (res[k - 1][0] + res[k + 1][0]) * 0.25;
        res[k][1] = res[k][1] * 0.5 + (res[k - 1][1] + res[k + 1][1]) * 0.25;
      }
    }
    const n = res.length;
    const ptsA = new Float32Array(n * 2);
    const cum = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      ptsA[k * 2] = res[k][0];
      ptsA[k * 2 + 1] = res[k][1];
      if (k > 0) cum[k] = cum[k - 1] + Math.hypot(res[k][0] - res[k - 1][0], res[k][1] - res[k - 1][1]);
    }
    // 5) perfil de altura: segue o relevo suavizado, com as pontas presas à
    // altura das cidades e rampa máxima de 8,5%
    const hn = new Float32Array(n);
    const wl = new Float32Array(n);
    for (let k = 0; k < n; k++) {
      hn[k] = gen.natural(res[k][0], res[k][1]);
      wl[k] = gen.waterLevel(res[k][0], res[k][1]);
    }
    const hs = new Float32Array(n);
    for (let k = 0; k < n; k++) hs[k] = Math.max(hn[k], wl[k] + (hn[k] < wl[k] + 1.5 ? 4.5 : 3.2));
    const total = cum[n - 1];
    const pinned = new Uint8Array(n);
    for (let k = 0; k < n; k++) {
      if (cum[k] < A.r + 30) {
        hs[k] = A.h;
        pinned[k] = 1;
      } else if (total - cum[k] < B.r + 30) {
        hs[k] = B.h;
        pinned[k] = 1;
      }
    }
    // água (mar ou lago): piso mínimo da pista, propagado com a rampa máxima
    const fp = new Float32Array(n).fill(-1e9);
    for (let k = 0; k < n; k++) {
      const wet = hn[k] < wl[k] + 1.5;
      if (wet || wl[k] > 0) fp[k] = wl[k] + (wet ? 4.2 : 2.5);
    }
    const GF = 0.095 * STEP;
    for (let k = 1; k < n; k++) fp[k] = Math.max(fp[k], fp[k - 1] - GF);
    for (let k = n - 2; k >= 0; k--) fp[k] = Math.max(fp[k], fp[k + 1] - GF);
    const box = (rad, passes) => {
      const tmp = new Float32Array(n);
      for (let p = 0; p < passes; p++) {
        for (let k = 0; k < n; k++) {
          if (pinned[k]) {
            tmp[k] = hs[k];
            continue;
          }
          let s = 0;
          let c = 0;
          for (let o = -rad; o <= rad; o++) {
            const q = clamp(k + o, 0, n - 1);
            s += hs[q];
            c++;
          }
          tmp[k] = s / c;
        }
        hs.set(tmp);
      }
    };
    const limit = (G) => {
      for (let it = 0; it < 4; it++) {
        for (let k = 1; k < n; k++) if (!pinned[k]) hs[k] = clamp(hs[k], hs[k - 1] - G, hs[k - 1] + G);
        for (let k = n - 2; k >= 0; k--) if (!pinned[k]) hs[k] = clamp(hs[k], hs[k + 1] - G, hs[k + 1] + G);
      }
    };
    box(6, 2);
    limit(0.1 * STEP);
    box(3, 2);
    limit(0.105 * STEP);
    for (let k = 0; k < n; k++) if (!pinned[k]) hs[k] = Math.max(hs[k], fp[k]);

    // 6) pontes: aterro muito alto ou sobre a água
    const br = new Uint8Array(n);
    for (let k = 0; k < n; k++) br[k] = hs[k] - hn[k] > 16 || hn[k] < wl[k] + 0.4 ? 1 : 0;
    // fecha buracos curtos, remove trechos curtos, dilata
    for (let k = 1; k < n - 1; k++) {
      if (!br[k] && br[k - 1]) {
        let j = k;
        while (j < n && !br[j] && j - k < 8) j++;
        if (j < n && br[j] && j - k < 8) for (let q = k; q < j; q++) br[q] = 1;
      }
    }
    for (let k = 0; k < n; k++) {
      if (br[k] && (k === 0 || !br[k - 1])) {
        let j = k;
        while (j < n && br[j]) j++;
        if (j - k < 4) for (let q = k; q < j; q++) br[q] = 0;
        k = j;
      }
    }
    const br2 = br.slice();
    for (let k = 0; k < n; k++) if (br[k]) for (let o = -3; o <= 3; o++) if (k + o >= 0 && k + o < n) br2[k + o] = 1;
    for (let k = 0; k < n; k++) if (pinned[k]) br2[k] = 0;
    // marca as células usadas
    for (let k = 0; k < n; k += 4) {
      const ci = Math.floor((res[k][0] - WORLD.minX) / RES);
      const cj = Math.floor((res[k][1] - WORLD.minZ) / RES);
      for (let dj = -2; dj <= 2; dj++)
        for (let di = -2; di <= 2; di++) {
          const ii = ci + di;
          const jj = cj + dj;
          if (ii >= 0 && jj >= 0 && ii < nx && jj < nz) used[jj * nx + ii] = 1;
        }
    }
    roads.push({
      id: r,
      a: cityIdx[R.a],
      b: cityIdx[R.b],
      kind: R.kind,
      name: R.name,
      hw: R.kind === 'rod' ? 4.4 : 3.7,
      pts: ptsA,
      hs,
      hn,
      br: br2,
      cum,
      len: total,
    });
    if (progress) progress(0.4 + 0.6 * ((r + 1) / ROADS.length));
  }
  return roads;
}

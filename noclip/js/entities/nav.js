// Navegação das criaturas: campos de fluxo (Dijkstra com custo maior perto das
// paredes), visão e audição.
import { clamp } from '../util.js';

export class Nav {
  constructor(grid) {
    this.g = grid;
    const { w, h } = grid;
    // folga: distância (em células) até o obstáculo mais próximo
    const clr = new Uint8Array(w * h).fill(255);
    const q = [];
    for (let i = 0; i < w * h; i++)
      if (grid.nav[i] !== 0) {
        clr[i] = 0;
        q.push(i);
      }
    let qh = 0;
    while (qh < q.length) {
      const i = q[qh++];
      const cx = i % w, cz = (i / w) | 0;
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const x = cx + dx, z = cz + dz;
        if (x < 0 || z < 0 || x >= w || z >= h) continue;
        const j = z * w + x;
        if (clr[j] > clr[i] + 1) {
          clr[j] = clr[i] + 1;
          q.push(j);
        }
      }
    }
    this.clr = clr;
    this.cache = new Map();
  }

  walk(cx, cz) {
    return this.g.walkable(cx, cz);
  }

  // campo de distâncias até (x, z); reaproveita se o alvo não mudou de célula
  field(x, z, key = 'p', maxAge = 0.35, now = 0) {
    const g = this.g;
    const cx = clamp(g.cell(x), 0, g.w - 1), cz = clamp(g.cell(z), 0, g.h - 1);
    const c = this.cache.get(key);
    if (c && ((c.cx === cx && c.cz === cz) || now - c.t < maxAge)) return c.d;
    const d = this.dijkstra(cx, cz);
    this.cache.set(key, { cx, cz, d, t: now });
    return d;
  }

  dijkstra(sx, sz) {
    const { w, h } = this.g;
    const N = w * h;
    const dist = new Float32Array(N).fill(1e9);
    // fila de prioridade binária simples
    const heap = [];
    const push = (i, d) => {
      heap.push([d, i]);
      let k = heap.length - 1;
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heap[p][0] <= heap[k][0]) break;
        [heap[p], heap[k]] = [heap[k], heap[p]];
        k = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop();
      if (heap.length) {
        heap[0] = last;
        let k = 0;
        for (;;) {
          const l = k * 2 + 1, r = l + 1;
          let m = k;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === k) break;
          [heap[m], heap[k]] = [heap[k], heap[m]];
          k = m;
        }
      }
      return top;
    };
    // se o alvo está numa célula bloqueada, começa da vizinha livre mais próxima
    let s = sz * w + sx;
    if (!this.walk(sx, sz)) {
      for (let r = 1; r < 4 && !this.walk(sx, sz); r++)
        for (let dz = -r; dz <= r; dz++)
          for (let dx = -r; dx <= r; dx++)
            if (this.walk(sx + dx, sz + dz)) {
              s = (sz + dz) * w + sx + dx;
              r = 9;
              dz = dx = 99;
            }
    }
    dist[s] = 0;
    push(s, 0);
    const D = [
      [1, 0, 1],
      [-1, 0, 1],
      [0, 1, 1],
      [0, -1, 1],
      [1, 1, 1.414],
      [-1, 1, 1.414],
      [1, -1, 1.414],
      [-1, -1, 1.414],
    ];
    while (heap.length) {
      const [d, i] = pop();
      if (d > dist[i]) continue;
      const cx = i % w, cz = (i / w) | 0;
      for (const [dx, dz, c] of D) {
        const x = cx + dx, z = cz + dz;
        if (!this.walk(x, z)) continue;
        if (dx && dz && (!this.walk(cx + dx, cz) || !this.walk(cx, cz + dz))) continue;
        const j = z * w + x;
        const nd = d + c * (this.clr[j] <= 1 ? 2.5 : this.clr[j] === 2 ? 1.3 : 1);
        if (nd < dist[j]) {
          dist[j] = nd;
          push(j, nd);
        }
      }
    }
    return dist;
  }

  // direção de descida no campo a partir de (x, z): {x, z} unitário ou null
  descend(field, x, z) {
    const g = this.g;
    const cx = g.cell(x), cz = g.cell(z);
    const w = g.w;
    let best = null, bd = g.inside(cx, cz) ? field[cz * w + cx] : 1e9;
    for (let dz = -1; dz <= 1; dz++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = cx + dx, nz = cz + dz;
        if (!g.inside(nx, nz)) continue;
        if (dx && dz && (!this.walk(cx + dx, cz) || !this.walk(cx, cz + dz))) continue;
        const v = field[nz * w + nx];
        if (v < bd) {
          bd = v;
          best = [nx, nz];
        }
      }
    if (!best) return null;
    const tx = g.center(best[0]), tz = g.center(best[1]);
    // olha duas células adiante para suavizar
    let dx = tx - x, dz = tz - z;
    const l = Math.hypot(dx, dz) || 1;
    return { x: dx / l, z: dz / l, d: bd };
  }

  distAt(field, x, z) {
    const g = this.g;
    const cx = g.cell(x), cz = g.cell(z);
    return g.inside(cx, cz) ? field[cz * g.w + cx] : 1e9;
  }

  // ponto caminhável aleatório a uma distância (em células de caminho) do ponto
  randomReachable(r, x, z, minD = 10, maxD = 60) {
    const f = this.dijkstra(this.g.cell(x), this.g.cell(z));
    for (let k = 0; k < 300; k++) {
      const p = this.g.randomOpen(r);
      if (!p) break;
      const d = f[p.cz * this.g.w + p.cx];
      if (d >= minD && d <= maxD) return p;
    }
    return this.g.randomOpen(r);
  }
}

// a criatura vê o jogador?
export function canSee(level, from, eyeY, to, toY, fwdX, fwdZ, fov = 2.2, range = 22) {
  const dx = to.x - from.x, dz = to.z - from.z;
  const d = Math.hypot(dx, dz);
  if (d > range) return false;
  if (d > 1.5 && (dx * fwdX + dz * fwdZ) / d < Math.cos(fov / 2)) return false;
  return level.grid.visible(from.x, eyeY, from.z, to.x, toY, to.z);
}

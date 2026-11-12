// Grade de navegação (1 m) + campo de fluxo (Dijkstra a partir do jogador).
// Todos os inimigos seguem o mesmo campo, então o custo não cresce com o número deles.

const SQ2 = Math.SQRT2;

export class NavGrid {
  constructor(minX, minZ, maxX, maxZ, cell = 1) {
    this.minX = minX;
    this.minZ = minZ;
    this.cell = cell;
    this.w = Math.ceil((maxX - minX) / cell);
    this.h = Math.ceil((maxZ - minZ) / cell);
    const n = this.w * this.h;
    this.blocked = new Uint8Array(n);
    this.dist = new Float32Array(n).fill(Infinity);
    this.heapIdx = new Int32Array(n * 4 + 16);
    this.heapPri = new Float32Array(n * 4 + 16);
    this.tx = 0;
    this.tz = 0;
    this.valid = false;
  }

  // region opcional {minX, minZ, maxX, maxZ}: refaz só aquele trecho (portões, ponte).
  rebuild(col, inflate = 0.38, region = null) {
    const { w, h, cell } = this;
    this.inflate = inflate;
    let ix0 = 0,
      ix1 = w - 1,
      iz0 = 0,
      iz1 = h - 1;
    if (region) {
      ix0 = Math.max(0, Math.floor((region.minX - this.minX) / cell));
      ix1 = Math.min(w - 1, Math.floor((region.maxX - this.minX) / cell));
      iz0 = Math.max(0, Math.floor((region.minZ - this.minZ) / cell));
      iz1 = Math.min(h - 1, Math.floor((region.maxZ - this.minZ) / cell));
    }
    for (let iz = iz0; iz <= iz1; iz++) {
      for (let ix = ix0; ix <= ix1; ix++) {
        const x = this.minX + (ix + 0.5) * cell,
          z = this.minZ + (iz + 0.5) * cell;
        this.blocked[iz * w + ix] = col.pointBlocked(x, z, inflate) ? 1 : 0;
      }
    }
    this.valid = false;
  }

  idx(x, z) {
    const ix = Math.floor((x - this.minX) / this.cell),
      iz = Math.floor((z - this.minZ) / this.cell);
    if (ix < 0 || iz < 0 || ix >= this.w || iz >= this.h) return -1;
    return iz * this.w + ix;
  }

  isBlocked(x, z) {
    const i = this.idx(x, z);
    return i < 0 || this.blocked[i] === 1;
  }

  // Dijkstra a partir do alvo, limitado a maxCost metros.
  computeFlow(tx, tz, maxCost = 70) {
    const { w, h, blocked, dist, heapIdx, heapPri } = this;
    dist.fill(Infinity);
    this.tx = tx;
    this.tz = tz;
    let start = this.idx(tx, tz);
    if (start < 0) {
      this.valid = false;
      return;
    }
    // se o jogador está numa célula "bloqueada" (encostado na parede), usa a vizinha livre mais próxima
    if (blocked[start]) {
      let found = -1;
      const sx = start % w,
        sz = (start / w) | 0;
      for (let r = 1; r <= 2 && found < 0; r++) {
        for (let dz = -r; dz <= r && found < 0; dz++) {
          for (let dx = -r; dx <= r; dx++) {
            const x = sx + dx,
              z = sz + dz;
            if (x < 0 || z < 0 || x >= w || z >= h) continue;
            const i = z * w + x;
            if (!blocked[i]) {
              found = i;
              break;
            }
          }
        }
      }
      if (found < 0) {
        this.valid = false;
        return;
      }
      start = found;
    }
    let size = 0;
    const push = (i, p) => {
      let k = size++;
      while (k > 0) {
        const parent = (k - 1) >> 1;
        if (heapPri[parent] <= p) break;
        heapIdx[k] = heapIdx[parent];
        heapPri[k] = heapPri[parent];
        k = parent;
      }
      heapIdx[k] = i;
      heapPri[k] = p;
    };
    const pop = () => {
      const top = heapIdx[0];
      const lastI = heapIdx[--size],
        lastP = heapPri[size];
      let k = 0;
      while (true) {
        let c = 2 * k + 1;
        if (c >= size) break;
        if (c + 1 < size && heapPri[c + 1] < heapPri[c]) c++;
        if (heapPri[c] >= lastP) break;
        heapIdx[k] = heapIdx[c];
        heapPri[k] = heapPri[c];
        k = c;
      }
      heapIdx[k] = lastI;
      heapPri[k] = lastP;
      return top;
    };
    dist[start] = 0;
    push(start, 0);
    const cap = heapIdx.length - 9;
    while (size > 0) {
      const p0 = heapPri[0];
      const i = pop();
      const d = dist[i];
      if (p0 > d) continue;
      if (d > maxCost) break;
      const x = i % w,
        z = (i / w) | 0;
      const l = x > 0 && !blocked[i - 1],
        r = x < w - 1 && !blocked[i + 1];
      const dn = z > 0 && !blocked[i - w],
        up = z < h - 1 && !blocked[i + w];
      if (size > cap) break;
      if (l && d + 1 < dist[i - 1]) {
        dist[i - 1] = d + 1;
        push(i - 1, d + 1);
      }
      if (r && d + 1 < dist[i + 1]) {
        dist[i + 1] = d + 1;
        push(i + 1, d + 1);
      }
      if (dn && d + 1 < dist[i - w]) {
        dist[i - w] = d + 1;
        push(i - w, d + 1);
      }
      if (up && d + 1 < dist[i + w]) {
        dist[i + w] = d + 1;
        push(i + w, d + 1);
      }
      const dd = d + SQ2;
      if (l && dn && !blocked[i - w - 1] && dd < dist[i - w - 1]) {
        dist[i - w - 1] = dd;
        push(i - w - 1, dd);
      }
      if (r && dn && !blocked[i - w + 1] && dd < dist[i - w + 1]) {
        dist[i - w + 1] = dd;
        push(i - w + 1, dd);
      }
      if (l && up && !blocked[i + w - 1] && dd < dist[i + w - 1]) {
        dist[i + w - 1] = dd;
        push(i + w - 1, dd);
      }
      if (r && up && !blocked[i + w + 1] && dd < dist[i + w + 1]) {
        dist[i + w + 1] = dd;
        push(i + w + 1, dd);
      }
    }
    this.valid = true;
  }

  pathDist(x, z) {
    const i = this.idx(x, z);
    if (i < 0 || !this.valid) return Infinity;
    return this.dist[i];
  }

  // Direção para seguir o fluxo a partir de (x,z). Retorna false se não há caminho.
  direction(x, z, out) {
    if (!this.valid) return false;
    const { w, h, dist, blocked, cell } = this;
    const i = this.idx(x, z);
    if (i < 0) return false;
    // Segue alguns passos do fluxo e mira no ponto mais distante ainda visível em linha reta.
    let best = -1;
    const steps = [];
    let cur = i;
    for (let s = 0; s < 6; s++) {
      const x0 = cur % w,
        z0 = (cur / w) | 0;
      let nb = -1,
        nd = dist[cur];
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dz) continue;
          const xx = x0 + dx,
            zz = z0 + dz;
          if (xx < 0 || zz < 0 || xx >= w || zz >= h) continue;
          const j = zz * w + xx;
          if (blocked[j]) continue;
          if (dx && dz && (blocked[z0 * w + xx] || blocked[zz * w + x0])) continue;
          if (dist[j] < nd) {
            nd = dist[j];
            nb = j;
          }
        }
      }
      if (nb < 0) break;
      steps.push(nb);
      cur = nb;
      if (nd === 0) break;
    }
    if (!steps.length) return false;
    best = steps[0];
    for (let k = steps.length - 1; k > 0; k--) {
      const j = steps[k];
      const px = this.minX + ((j % w) + 0.5) * cell,
        pz = this.minZ + (((j / w) | 0) + 0.5) * cell;
      if (this.lineClear(x, z, px, pz)) {
        best = j;
        break;
      }
    }
    const tx = this.minX + ((best % w) + 0.5) * cell,
      tz = this.minZ + (((best / w) | 0) + 0.5) * cell;
    let dx = tx - x,
      dz = tz - z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-4) {
      // já no centro da célula: vai para a próxima
      const j = steps[Math.min(1, steps.length - 1)];
      dx = this.minX + ((j % w) + 0.5) * cell - x;
      dz = this.minZ + (((j / w) | 0) + 0.5) * cell - z;
      const l2 = Math.hypot(dx, dz) || 1;
      out.x = dx / l2;
      out.z = dz / l2;
      return true;
    }
    out.x = dx / len;
    out.z = dz / len;
    return true;
  }

  // Linha reta livre na grade (amostras a cada meia célula).
  lineClear(ax, az, bx, bz) {
    const dx = bx - ax,
      dz = bz - az;
    const len = Math.hypot(dx, dz);
    const n = Math.max(1, Math.ceil(len / (this.cell * 0.5)));
    for (let k = 1; k <= n; k++) {
      const t = k / n;
      const i = this.idx(ax + dx * t, az + dz * t);
      if (i < 0 || this.blocked[i]) return false;
    }
    return true;
  }
}

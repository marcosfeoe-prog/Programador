// Mundo em grade (células de 0,5 m). Paredes cheias, vergas de portas/arcos e
// "vãos ocupados" por objetos (para sombras do lightmap, colisão e navegação).

export const EMPTY = 0;
export const WALL = 1;
export const LINTEL = 2; // aberto embaixo, sólido de doorH até o teto

export class Grid {
  constructor(w, h, { cs = 0.5, H = 3, doorH = 2.2 } = {}) {
    this.w = w;
    this.h = h;
    this.cs = cs;
    this.H = H;
    this.doorH = doorH;
    this.cells = new Uint8Array(w * h);
    this.lo = new Float32Array(w * h);
    this.hi = new Float32Array(w * h);
    this.propLo = new Float32Array(w * h).fill(1e9);
    this.propHi = new Float32Array(w * h).fill(-1e9);
    this.nav = new Uint8Array(w * h);
    this.colliders = [];
    this.buckets = new Map();
  }

  get W() {
    return this.w * this.cs;
  }
  get D() {
    return this.h * this.cs;
  }
  cell(x) {
    return Math.floor(x / this.cs);
  }
  center(c) {
    return (c + 0.5) * this.cs;
  }
  inside(cx, cz) {
    return cx >= 0 && cz >= 0 && cx < this.w && cz < this.h;
  }
  get(cx, cz) {
    return this.inside(cx, cz) ? this.cells[cz * this.w + cx] : WALL;
  }
  set(cx, cz, v) {
    if (this.inside(cx, cz)) this.cells[cz * this.w + cx] = v;
  }
  rect(cx0, cz0, cx1, cz1, v) {
    for (let z = Math.min(cz0, cz1); z <= Math.max(cz0, cz1); z++)
      for (let x = Math.min(cx0, cx1); x <= Math.max(cx0, cx1); x++) this.set(x, z, v);
  }
  // Retângulo em metros.
  rectM(x0, z0, x1, z1, v) {
    this.rect(this.cell(x0 + 1e-4), this.cell(z0 + 1e-4), this.cell(x1 - 1e-4), this.cell(z1 - 1e-4), v);
  }
  isWall(cx, cz) {
    return this.get(cx, cz) === WALL;
  }
  open(cx, cz) {
    return this.get(cx, cz) !== WALL;
  }

  // Objeto sólido (caixa alinhada) para colisão, sombra no lightmap e navegação.
  addSolid(x0, z0, x1, z1, y0, y1, { collide = true, occlude = true, nav = true, tag = null } = {}) {
    const c = { x0, z0, x1, z1, y0, y1, on: true, tag };
    if (collide) {
      this.colliders.push(c);
      const b0x = Math.floor(x0 / 2), b1x = Math.floor(x1 / 2), b0z = Math.floor(z0 / 2), b1z = Math.floor(z1 / 2);
      for (let bz = b0z; bz <= b1z; bz++)
        for (let bx = b0x; bx <= b1x; bx++) {
          const k = bx * 4096 + bz;
          if (!this.buckets.has(k)) this.buckets.set(k, []);
          this.buckets.get(k).push(c);
        }
    }
    if (occlude || nav) {
      const cs = this.cs;
      for (let cz = this.cell(z0); cz <= this.cell(z1 - 1e-4); cz++)
        for (let cx = this.cell(x0); cx <= this.cell(x1 - 1e-4); cx++) {
          if (!this.inside(cx, cz)) continue;
          // só marca a célula se o objeto cobre boa parte dela
          const ox = Math.min(x1, (cx + 1) * cs) - Math.max(x0, cx * cs);
          const oz = Math.min(z1, (cz + 1) * cs) - Math.max(z0, cz * cs);
          if (ox * oz < cs * cs * 0.3) continue;
          const i = cz * this.w + cx;
          if (occlude) {
            this.propLo[i] = Math.min(this.propLo[i], y0);
            this.propHi[i] = Math.max(this.propHi[i], y1);
          }
          if (nav && y0 < 1.4 && y1 > 0.1) this.nav[i] = 2;
        }
    }
    return c;
  }

  collidersNear(x, z) {
    return this.buckets.get(Math.floor(x / 2) * 4096 + Math.floor(z / 2)) || NONE;
  }

  finalize() {
    const { w, h, H, doorH } = this;
    for (let i = 0; i < w * h; i++) {
      const t = this.cells[i];
      let lo = 0, hi = 0;
      if (t === WALL) {
        lo = 0;
        hi = H;
      } else if (t === LINTEL) {
        lo = doorH;
        hi = H;
      }
      if (this.propHi[i] > this.propLo[i]) {
        if (hi > lo) {
          lo = Math.min(lo, this.propLo[i]);
          hi = Math.max(hi, this.propHi[i]);
        } else {
          lo = this.propLo[i];
          hi = this.propHi[i];
        }
      }
      this.lo[i] = lo;
      this.hi[i] = hi;
      if (t === WALL) this.nav[i] = 1;
      else if (this.nav[i] !== 2) this.nav[i] = 0;
    }
  }

  // Célula bloqueia o intervalo vertical [y0, y1]?
  blocks(cx, cz, y0, y1) {
    if (!this.inside(cx, cz)) return true;
    const i = cz * this.w + cx;
    const lo = this.lo[i], hi = this.hi[i];
    return hi > lo && y1 > lo && y0 < hi;
  }

  walkable(cx, cz) {
    return this.inside(cx, cz) && this.nav[cz * this.w + cx] === 0;
  }

  // Segmento 3D livre (DDA no plano xz, checando a altura do segmento em cada célula).
  visible(ax, ay, az, bx, by, bz) {
    return this.trace(ax, ay, az, bx, by, bz) >= 1;
  }

  // Fração [0,1] do segmento até a primeira obstrução (1 = livre).
  trace(ax, ay, az, bx, by, bz) {
    const cs = this.cs, w = this.w;
    const dx = bx - ax, dz = bz - az, dy = by - ay;
    let cx = Math.floor(ax / cs), cz = Math.floor(az / cs);
    const sx = dx > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(cs / dx) : Infinity;
    const tdz = dz !== 0 ? Math.abs(cs / dz) : Infinity;
    let tmx = dx !== 0 ? (dx > 0 ? (cx + 1) * cs - ax : ax - cx * cs) / Math.abs(dx) : Infinity;
    let tmz = dz !== 0 ? (dz > 0 ? (cz + 1) * cs - az : az - cz * cs) / Math.abs(dz) : Infinity;
    let t0 = 0;
    for (let n = 0; n < 2048; n++) {
      const t1 = Math.min(tmx, tmz, 1);
      if (cx < 0 || cz < 0 || cx >= w || cz >= this.h) return t0;
      const i = cz * w + cx;
      const lo = this.lo[i], hi = this.hi[i];
      if (hi > lo) {
        const y0 = ay + dy * t0, y1 = ay + dy * t1;
        if (Math.max(y0, y1) > lo && Math.min(y0, y1) < hi) return t0;
      }
      if (t1 >= 1) return 1;
      if (tmx < tmz) {
        cx += sx;
        t0 = tmx;
        tmx += tdx;
      } else {
        cz += sz;
        t0 = tmz;
        tmz += tdz;
      }
    }
    return 1;
  }

  // Resolve um círculo (jogador/entidade) contra paredes e objetos. Retorna se colidiu.
  collide(p, r, y0, y1) {
    let hit = false;
    const cs = this.cs;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      const cx0 = Math.floor((p.x - r) / cs), cx1 = Math.floor((p.x + r) / cs);
      const cz0 = Math.floor((p.z - r) / cs), cz1 = Math.floor((p.z + r) / cs);
      for (let cz = cz0; cz <= cz1; cz++)
        for (let cx = cx0; cx <= cx1; cx++) {
          if (!this.blocksBody(cx, cz, y0, y1)) continue;
          if (pushOut(p, r, cx * cs, cz * cs, (cx + 1) * cs, (cz + 1) * cs)) moved = hit = true;
        }
      const list = this.collidersNear(p.x, p.z);
      for (const c of list) {
        if (!c.on || c.y1 <= y0 || c.y0 >= y1) continue;
        if (pushOut(p, r, c.x0, c.z0, c.x1, c.z1)) moved = hit = true;
      }
      if (!moved) break;
    }
    return hit;
  }

  // Para o corpo, só paredes e vergas contam (objetos usam as caixas exatas).
  blocksBody(cx, cz, y0, y1) {
    if (!this.inside(cx, cz)) return true;
    const t = this.cells[cz * this.w + cx];
    if (t === WALL) return true;
    if (t === LINTEL) return y1 > this.doorH;
    return false;
  }

  // Ponto aleatório caminhável.
  randomOpen(r, minDistFrom = null, minDist = 0) {
    for (let k = 0; k < 4000; k++) {
      const cx = Math.floor(r() * this.w), cz = Math.floor(r() * this.h);
      if (!this.walkable(cx, cz)) continue;
      if (!this.walkable(cx + 1, cz) || !this.walkable(cx - 1, cz) || !this.walkable(cx, cz + 1) || !this.walkable(cx, cz - 1)) continue;
      const x = this.center(cx), z = this.center(cz);
      if (minDistFrom && Math.hypot(x - minDistFrom.x, z - minDistFrom.z) < minDist) continue;
      return { x, z, cx, cz };
    }
    return null;
  }
}

const NONE = [];

function pushOut(p, r, x0, z0, x1, z1) {
  const qx = Math.max(x0, Math.min(p.x, x1));
  const qz = Math.max(z0, Math.min(p.z, z1));
  let dx = p.x - qx, dz = p.z - qz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return false;
  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    p.x = qx + (dx / d) * r;
    p.z = qz + (dz / d) * r;
  } else {
    // centro dentro da caixa: empurra pelo lado mais próximo
    const l = p.x - x0, rr = x1 - p.x, t = p.z - z0, b = z1 - p.z;
    const m = Math.min(l, rr, t, b);
    if (m === l) p.x = x0 - r;
    else if (m === rr) p.x = x1 + r;
    else if (m === t) p.z = z0 - r;
    else p.z = z1 + r;
  }
  return true;
}

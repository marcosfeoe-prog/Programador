// Colisão estática no plano XZ (caixas orientadas e cilindros com altura), grade espacial,
// resolução de círculos (personagens) e raios (tiros, linha de visão, câmera).
import { clamp } from './util.js';

const CELL = 4;
const key = (ix, iz) => (ix + 1024) * 4096 + (iz + 1024);

// Nível da água do rio (o chão afunda entre estas coordenadas Z).
export const RIVER = { z0: 130, z1: 140, y: -0.9 };

export class Collision {
  constructor() {
    this.list = [];
    this.grid = new Map();
    this.stamp = 1;
    this._cand = [];
    this.bridgeDown = false;
  }

  _bounds(c) {
    if (c.type === 0) {
      const ex = Math.abs(c.cos) * c.hx + Math.abs(c.sin) * c.hz;
      const ez = Math.abs(c.sin) * c.hx + Math.abs(c.cos) * c.hz;
      c.minX = c.x - ex;
      c.maxX = c.x + ex;
      c.minZ = c.z - ez;
      c.maxZ = c.z + ez;
    } else {
      c.minX = c.x - c.r;
      c.maxX = c.x + c.r;
      c.minZ = c.z - c.r;
      c.maxZ = c.z + c.r;
    }
  }

  _insert(c) {
    c.cells = [];
    const x0 = Math.floor(c.minX / CELL),
      x1 = Math.floor(c.maxX / CELL);
    const z0 = Math.floor(c.minZ / CELL),
      z1 = Math.floor(c.maxZ / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const k = key(ix, iz);
        let arr = this.grid.get(k);
        if (!arr) {
          arr = [];
          this.grid.set(k, arr);
        }
        arr.push(c);
        c.cells.push(k);
      }
    }
  }

  _make(c, o) {
    c.y0 = o.y0 ?? 0;
    c.y1 = o.y1 ?? 3;
    c.mat = o.mat || 'stone';
    c.enabled = o.enabled ?? true;
    c.shootThrough = !!o.shootThrough;
    c.invisible = !!o.invisible;
    c.noCamera = !!o.noCamera;
    c.owner = o.owner || null;
    c._stamp = 0;
    this._bounds(c);
    this._insert(c);
    this.list.push(c);
    return c;
  }

  // Caixa: centro (x,z), largura w (X local), profundidade d (Z local), rotação em Y.
  addBox(x, z, w, d, rot = 0, o = {}) {
    return this._make({ type: 0, x, z, hx: w / 2, hz: d / 2, rot, cos: Math.cos(rot), sin: Math.sin(rot) }, o);
  }

  addCircle(x, z, r, o = {}) {
    return this._make({ type: 1, x, z, r }, o);
  }

  remove(c) {
    if (!c || !c.cells) return;
    for (const k of c.cells) {
      const arr = this.grid.get(k);
      if (!arr) continue;
      const i = arr.indexOf(c);
      if (i >= 0) arr.splice(i, 1);
    }
    c.cells = null;
    c.enabled = false;
    const i = this.list.indexOf(c);
    if (i >= 0) this.list.splice(i, 1);
  }

  query(minX, minZ, maxX, maxZ, out) {
    out.length = 0;
    const st = ++this.stamp;
    const x0 = Math.floor(minX / CELL),
      x1 = Math.floor(maxX / CELL);
    const z0 = Math.floor(minZ / CELL),
      z1 = Math.floor(maxZ / CELL);
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const arr = this.grid.get(key(ix, iz));
        if (!arr) continue;
        for (const c of arr) {
          if (c._stamp === st || !c.enabled) continue;
          c._stamp = st;
          out.push(c);
        }
      }
    }
    return out;
  }

  // Empurra o círculo (p.x, p.z, raio r) para fora dos obstáculos. Retorna true se encostou.
  resolve(p, r, y0 = 0.05, y1 = 1.8, ignoreOwner = null) {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      const cand = this.query(p.x - r, p.z - r, p.x + r, p.z + r, this._cand);
      let moved = false;
      for (const c of cand) {
        if (c.y1 <= y0 || c.y0 >= y1) continue;
        if (ignoreOwner && c.owner === ignoreOwner) continue;
        if (c.type === 1) {
          const dx = p.x - c.x,
            dz = p.z - c.z;
          const rr = r + c.r;
          const d2 = dx * dx + dz * dz;
          if (d2 < rr * rr) {
            let d = Math.sqrt(d2);
            let nx = dx,
              nz = dz;
            if (d < 1e-5) {
              nx = 1;
              nz = 0;
              d = 1;
            }
            const push = rr - Math.sqrt(d2);
            p.x += (nx / d) * push;
            p.z += (nz / d) * push;
            moved = hit = true;
          }
        } else {
          const dx = p.x - c.x,
            dz = p.z - c.z;
          const lx = dx * c.cos - dz * c.sin,
            lz = dx * c.sin + dz * c.cos;
          const cx = clamp(lx, -c.hx, c.hx),
            cz = clamp(lz, -c.hz, c.hz);
          const ox = lx - cx,
            oz = lz - cz;
          const d2 = ox * ox + oz * oz;
          if (d2 < r * r) {
            let px, pz;
            if (d2 > 1e-10) {
              const d = Math.sqrt(d2);
              const push = r - d;
              px = (ox / d) * push;
              pz = (oz / d) * push;
            } else {
              const penX = c.hx - Math.abs(lx),
                penZ = c.hz - Math.abs(lz);
              if (penX < penZ) {
                px = (lx >= 0 ? 1 : -1) * (penX + r);
                pz = 0;
              } else {
                px = 0;
                pz = (lz >= 0 ? 1 : -1) * (penZ + r);
              }
            }
            p.x += px * c.cos + pz * c.sin;
            p.z += -px * c.sin + pz * c.cos;
            moved = hit = true;
          }
        }
      }
      if (!moved) break;
    }
    return hit;
  }

  // Ponto bloqueado (para a grade de navegação). inflate = raio do agente.
  pointBlocked(x, z, inflate, y0 = 0.1, y1 = 1.6) {
    const cand = this.query(x - inflate, z - inflate, x + inflate, z + inflate, this._cand);
    for (const c of cand) {
      if (c.y1 <= y0 || c.y0 >= y1) continue;
      if (c.type === 1) {
        const dx = x - c.x,
          dz = z - c.z,
          rr = c.r + inflate;
        if (dx * dx + dz * dz < rr * rr) return true;
      } else {
        const dx = x - c.x,
          dz = z - c.z;
        const lx = dx * c.cos - dz * c.sin,
          lz = dx * c.sin + dz * c.cos;
        if (Math.abs(lx) < c.hx + inflate && Math.abs(lz) < c.hz + inflate) return true;
      }
    }
    return false;
  }

  groundY(x, z) {
    if (z > RIVER.z0 && z < RIVER.z1) {
      if (this.bridgeDown && Math.abs(x) < 2.6) return 0;
      return RIVER.y;
    }
    return 0;
  }

  /*
   Raio (o = origem, d = direção normalizada). mode: 'bullet' ignora cercas vazadas e paredes
   invisíveis; 'camera' ignora paredes invisíveis e objetos marcados noCamera; 'sight' = bullet.
   Retorna o objeto `out` preenchido ou null.
  */
  raycast(o, d, maxDist, mode = 'bullet', out = {}) {
    let best = maxDist;
    let bc = null,
      nx = 0,
      ny = 1,
      nz = 0,
      found = false;
    // chão (e água do rio)
    if (d.y < -1e-6) {
      let t = -o.y / d.y;
      if (t >= 0 && t < best) {
        const hx = o.x + d.x * t,
          hz = o.z + d.z * t;
        const gy = this.groundY(hx, hz);
        if (gy !== 0) t = (gy - o.y) / d.y;
        if (t >= 0 && t < best) {
          best = t;
          found = true;
          nx = 0;
          ny = 1;
          nz = 0;
          bc = null;
          out.mat = gy !== 0 ? 'water' : 'dirt';
        }
      }
    }
    for (const c of this.list) {
      if (!c.enabled) continue;
      if (c.invisible && mode !== 'move') continue;
      if (mode !== 'camera' && c.shootThrough) continue;
      if (mode === 'camera' && c.noCamera) continue;
      if (c.type === 0) {
        const dx = o.x - c.x,
          dz = o.z - c.z;
        const lox = dx * c.cos - dz * c.sin,
          loz = dx * c.sin + dz * c.cos,
          loy = o.y;
        const ldx = d.x * c.cos - d.z * c.sin,
          ldz = d.x * c.sin + d.z * c.cos,
          ldy = d.y;
        let tmin = -Infinity,
          tmax = Infinity,
          axis = -1,
          sgn = 0;
        // eixo X
        if (Math.abs(ldx) < 1e-9) {
          if (lox < -c.hx || lox > c.hx) continue;
        } else {
          let t1 = (-c.hx - lox) / ldx,
            t2 = (c.hx - lox) / ldx;
          let s = -1;
          if (t1 > t2) {
            const tt = t1;
            t1 = t2;
            t2 = tt;
            s = 1;
          }
          if (t1 > tmin) {
            tmin = t1;
            axis = 0;
            sgn = s;
          }
          if (t2 < tmax) tmax = t2;
        }
        // eixo Y
        if (Math.abs(ldy) < 1e-9) {
          if (loy < c.y0 || loy > c.y1) continue;
        } else {
          let t1 = (c.y0 - loy) / ldy,
            t2 = (c.y1 - loy) / ldy;
          let s = -1;
          if (t1 > t2) {
            const tt = t1;
            t1 = t2;
            t2 = tt;
            s = 1;
          }
          if (t1 > tmin) {
            tmin = t1;
            axis = 1;
            sgn = s;
          }
          if (t2 < tmax) tmax = t2;
        }
        // eixo Z
        if (Math.abs(ldz) < 1e-9) {
          if (loz < -c.hz || loz > c.hz) continue;
        } else {
          let t1 = (-c.hz - loz) / ldz,
            t2 = (c.hz - loz) / ldz;
          let s = -1;
          if (t1 > t2) {
            const tt = t1;
            t1 = t2;
            t2 = tt;
            s = 1;
          }
          if (t1 > tmin) {
            tmin = t1;
            axis = 2;
            sgn = s;
          }
          if (t2 < tmax) tmax = t2;
        }
        if (tmin > tmax || tmax < 0) continue;
        const t = Math.max(0, tmin);
        if (t >= best) continue;
        best = t;
        found = true;
        bc = c;
        if (tmin < 0) {
          nx = -d.x;
          ny = -d.y;
          nz = -d.z;
        } else {
          // sgn = -1 quando entrou pelo lado negativo do eixo: normal aponta para -eixo
          let lnx = 0,
            lny = 0,
            lnz = 0;
          if (axis === 0) lnx = sgn;
          else if (axis === 1) lny = sgn;
          else lnz = sgn;
          nx = lnx * c.cos + lnz * c.sin;
          ny = lny;
          nz = -lnx * c.sin + lnz * c.cos;
        }
      } else {
        const ox = o.x - c.x,
          oz = o.z - c.z;
        const a = d.x * d.x + d.z * d.z;
        const b = ox * d.x + oz * d.z;
        const cc = ox * ox + oz * oz - c.r * c.r;
        if (a > 1e-9) {
          const disc = b * b - a * cc;
          if (disc >= 0) {
            const sq = Math.sqrt(disc);
            let t = (-b - sq) / a;
            if (t < 0 && cc < 0) t = 0;
            if (t >= 0 && t < best) {
              const y = o.y + d.y * t;
              if (y >= c.y0 && y <= c.y1) {
                best = t;
                found = true;
                bc = c;
                if (cc < 0 && t === 0) {
                  nx = -d.x;
                  ny = -d.y;
                  nz = -d.z;
                } else {
                  nx = (ox + d.x * t) / c.r;
                  ny = 0;
                  nz = (oz + d.z * t) / c.r;
                }
              }
            }
          }
        }
        // tampa de cima
        if (d.y < -1e-6 && o.y > c.y1) {
          const t = (c.y1 - o.y) / d.y;
          if (t >= 0 && t < best) {
            const px = ox + d.x * t,
              pz = oz + d.z * t;
            if (px * px + pz * pz <= c.r * c.r) {
              best = t;
              found = true;
              bc = c;
              nx = 0;
              ny = 1;
              nz = 0;
            }
          }
        }
      }
    }
    if (!found) return null;
    out.t = best;
    out.x = o.x + d.x * best;
    out.y = o.y + d.y * best;
    out.z = o.z + d.z * best;
    out.nx = nx;
    out.ny = ny;
    out.nz = nz;
    out.collider = bc;
    if (bc) out.mat = bc.mat;
    return out;
  }

  // Linha livre entre dois pontos (para visão dos inimigos).
  clear(ax, ay, az, bx, by, bz, mode = 'bullet') {
    const dx = bx - ax,
      dy = by - ay,
      dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 1e-4) return true;
    const o = { x: ax, y: ay, z: az },
      d = { x: dx / len, y: dy / len, z: dz / len };
    return !this.raycast(o, d, len - 0.05, mode, this._rayTmp || (this._rayTmp = {}));
  }
}

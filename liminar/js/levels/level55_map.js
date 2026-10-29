// Nível 55 — o mapa. Uma malha de nós (salões) ligados por corredores longos
// e retos; alguns nós ficam mais baixos e os corredores entre eles ganham uma
// escada no meio. Como no Nível 54, o espaço andável é descrito por um campo
// de distância com sinal (união de retângulos), e as paredes saem da curva
// zero. Além disso cada forma sabe a altura do piso (rampa nas escadas).
import { clamp, mulberry32 } from '../util.js';

export const RISE = 0.18;
export const TREAD = 0.3;
export const LVL = 1.8; // desnível entre "andares" (10 degraus)

export class Map55 {
  // o: { nx, nz, sp, seed, hall, wide, narrow, stairs, extra, H }
  constructor(o) {
    this.o = o;
    this.H = o.H;
    this.shapes = [];
    this.stairs = [];
    const r = mulberry32(o.seed);
    this.r = r;
    const nodes = [];
    for (let j = 0; j < o.nz; j++)
      for (let i = 0; i < o.nx; i++) {
        const lvl = o.stairs ? Math.round(clamp(Math.sin(i * 1.3 + o.seed) * 0.9 + Math.cos(j * 0.9 + o.seed * 0.5) * 0.9 + (r() - 0.5) * 0.8, -1.4, 1.4)) : 0;
        nodes.push({ i, j, x: i * o.sp, z: -j * o.sp, y: lvl * LVL, links: [] });
      }
    this.nodes = nodes;
    const N = (i, j) => nodes[j * o.nx + i];
    // labirinto: árvore por busca em profundidade + algumas ligações extras
    const seen = new Set();
    const edges = [];
    const stack = [N(0, 0)];
    seen.add(stack[0]);
    while (stack.length) {
      const n = stack[stack.length - 1];
      const nb = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]
        .map(([di, dj]) => (n.i + di >= 0 && n.i + di < o.nx && n.j + dj >= 0 && n.j + dj < o.nz ? N(n.i + di, n.j + dj) : null))
        .filter((m) => m && !seen.has(m));
      if (!nb.length) {
        stack.pop();
        continue;
      }
      // prefere seguir reto (corredores longos)
      let m = nb[Math.floor(r() * nb.length)];
      if (n.prev && r() < 0.55) {
        const st = nb.find((q) => q.i - n.i === n.i - n.prev.i && q.j - n.j === n.j - n.prev.j);
        if (st) m = st;
      }
      m.prev = n;
      seen.add(m);
      edges.push([n, m]);
      stack.push(m);
    }
    for (let j = 0; j < o.nz; j++)
      for (let i = 0; i < o.nx; i++) {
        for (const [di, dj] of [
          [1, 0],
          [0, 1],
        ]) {
          if (i + di >= o.nx || j + dj >= o.nz) continue;
          const a = N(i, j);
          const b = N(i + di, j + dj);
          if (edges.some(([p, q]) => (p === a && q === b) || (p === b && q === a))) continue;
          if (r() < o.extra) edges.push([a, b]);
        }
      }
    this.edges = edges;
    for (const [a, b] of edges) {
      a.links.push(b);
      b.links.push(a);
    }
    // salões nos nós (maiores em alguns)
    for (const n of nodes) {
      const big = r() < 0.22;
      const hw = (big ? o.hall * 1.5 : o.hall) / 2;
      const hd = (big ? o.hall * 1.25 : o.hall) / 2;
      n.hw = hw;
      n.hd = hd;
      this.rect(n.x - hw, n.x + hw, n.z - hd, n.z + hd, () => n.y, { node: n });
    }
    // corredores
    this.corr = [];
    for (const [a, b] of edges) {
      const w = r() < 0.3 ? o.narrow : o.wide;
      const horiz = a.j === b.j;
      const dy = b.y - a.y;
      const e = { a, b, w, horiz };
      this.corr.push(e);
      // trecho do corredor fora dos salões
      const sa = horiz ? Math.sign(b.x - a.x) * a.hw : -Math.sign(a.z - b.z) * a.hd;
      const sb = horiz ? -Math.sign(b.x - a.x) * b.hw : Math.sign(a.z - b.z) * b.hd;
      if (horiz) {
        e.p0 = a.x + sa;
        e.p1 = b.x + sb;
      } else {
        e.p0 = a.z + sa;
        e.p1 = b.z + sb;
      }
      // escada no meio
      if (dy !== 0) {
        const steps = Math.round(Math.abs(dy) / RISE);
        const run = steps * TREAD;
        const mid = (e.p0 + e.p1) / 2;
        const dir = Math.sign(e.p1 - e.p0);
        e.s0 = mid - (dir * run) / 2;
        e.s1 = mid + (dir * run) / 2;
        e.steps = steps;
        this.stairs.push(e);
      }
      const yAt = (u) => {
        if (dy === 0) return a.y;
        const t = clamp((u - e.s0) / (e.s1 - e.s0), 0, 1);
        return a.y + dy * t;
      };
      e.yAt = yAt;
      const hw = w / 2;
      // entra 2 m em cada salão: com sobreposição rasa, a junção vira uma "parede" fantasma no campo
      if (horiz) this.rect(Math.min(e.p0, e.p1) - 2, Math.max(e.p0, e.p1) + 2, a.z - hw, a.z + hw, (x) => yAt(x), { edge: e });
      else this.rect(a.x - hw, a.x + hw, Math.min(e.p0, e.p1) - 2, Math.max(e.p0, e.p1) + 2, (x, z) => yAt(z), { edge: e });
    }
    this.index();
  }

  // retângulo alinhado aos eixos com função de altura do piso
  rect(x0, x1, z0, z1, yf, tag = {}) {
    const s = { x0, x1, z0, z1, cx: (x0 + x1) / 2, cz: (z0 + z1) / 2, hx: (x1 - x0) / 2, hz: (z1 - z0) / 2, yf, ...tag };
    this.shapes.push(s);
    return s;
  }

  index() {
    const B = 10;
    this.B = B;
    this.buckets = new Map();
    let x0 = 1e9;
    let x1 = -1e9;
    let z0 = 1e9;
    let z1 = -1e9;
    for (const s of this.shapes) {
      x0 = Math.min(x0, s.x0);
      x1 = Math.max(x1, s.x1);
      z0 = Math.min(z0, s.z0);
      z1 = Math.max(z1, s.z1);
      for (let i = Math.floor((s.x0 - 2) / B); i <= Math.floor((s.x1 + 2) / B); i++)
        for (let j = Math.floor((s.z0 - 2) / B); j <= Math.floor((s.z1 + 2) / B); j++) {
          const k = i * 10000 + j;
          if (!this.buckets.has(k)) this.buckets.set(k, []);
          this.buckets.get(k).push(s);
        }
    }
    this.bounds = { x0: x0 - 1, x1: x1 + 1, z0: z0 - 1, z1: z1 + 1 };
  }

  sdShape(s, x, z) {
    const qx = Math.abs(x - s.cx) - s.hx;
    const qz = Math.abs(z - s.cz) - s.hz;
    return Math.hypot(Math.max(qx, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qz), 0);
  }

  sdf(x, z) {
    const list = this.buckets.get(Math.floor(x / this.B) * 10000 + Math.floor(z / this.B));
    if (!list) return 3;
    let d = 3;
    for (const s of list) {
      const v = this.sdShape(s, x, z);
      if (v < d) d = v;
    }
    return d;
  }

  // forma que "manda" num ponto: a primeira em que ele está dentro, ou a mais próxima
  shapeAt(x, z) {
    const list = this.buckets.get(Math.floor(x / this.B) * 10000 + Math.floor(z / this.B));
    if (!list) return null;
    let best = null;
    let bd = 1e9;
    for (const s of list) {
      const v = this.sdShape(s, x, z);
      // salões têm prioridade (piso plano nos cruzamentos)
      const k = v - (s.node && v < 0 ? 0.5 : 0);
      if (k < bd) {
        bd = k;
        best = s;
      }
    }
    return best;
  }

  floorY(x, z) {
    const s = this.shapeAt(x, z);
    return s ? s.yf(x, z) : 0;
  }

  grad(x, z) {
    const e = 0.02;
    const gx = this.sdf(x + e, z) - this.sdf(x - e, z);
    const gz = this.sdf(x, z + e) - this.sdf(x, z - e);
    const l = Math.hypot(gx, gz) || 1;
    return [gx / l, gz / l];
  }

  clear(ax, az, bx, bz, pad = 0.02) {
    const dx = bx - ax;
    const dz = bz - az;
    const L = Math.hypot(dx, dz);
    if (L < 1e-4) return this.sdf(ax, az) < pad;
    let t = 0;
    for (let i = 0; i < 300 && t < L; i++) {
      const d = this.sdf(ax + (dx * t) / L, az + (dz * t) / L);
      if (d > -pad) return false;
      t += Math.max(0.05, -d - pad * 0.5);
    }
    return true;
  }

  // dentro do trecho de escada (com margem)? devolve a aresta
  stairAt(x, z, m = 0) {
    for (const e of this.stairs) {
      const hw = e.w / 2;
      const lo = Math.min(e.s0, e.s1) - m;
      const hi = Math.max(e.s0, e.s1) + m;
      if (e.horiz) {
        if (x > lo && x < hi && Math.abs(z - e.a.z) < hw + 0.3) return e;
      } else if (z > lo && z < hi && Math.abs(x - e.a.x) < hw + 0.3) return e;
    }
    return null;
  }

  // nó mais distante (em passos do grafo) a partir de n
  farthest(n) {
    const d = new Map([[n, 0]]);
    const q = [n];
    while (q.length) {
      const a = q.shift();
      for (const b of a.links)
        if (!d.has(b)) {
          d.set(b, d.get(a) + 1);
          q.push(b);
        }
    }
    let best = n;
    for (const [k, v] of d) if (v > d.get(best)) best = k;
    this.graphD = d;
    return best;
  }
}

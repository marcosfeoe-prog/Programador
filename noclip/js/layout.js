// Ferramentas de geração de mapas: conectividade, distâncias, pontos em faces
// e espalhamento de manchas.
import { WALL, EMPTY } from './grid.js';
import { K_FLOOR, K_CEIL, K_WALL } from './build.js';

// Distâncias (em células) por busca em largura a partir de (sx, sz).
export function bfs(grid, sx, sz, pass = (cx, cz) => grid.get(cx, cz) !== WALL) {
  const { w, h } = grid;
  const dist = new Int32Array(w * h).fill(-1);
  const q = new Int32Array(w * h);
  let qh = 0, qt = 0;
  if (!pass(sx, sz)) return dist;
  dist[sz * w + sx] = 0;
  q[qt++] = sz * w + sx;
  while (qh < qt) {
    const i = q[qh++];
    const cx = i % w, cz = (i / w) | 0;
    const d = dist[i] + 1;
    if (cx > 0 && dist[i - 1] < 0 && pass(cx - 1, cz)) (dist[i - 1] = d), (q[qt++] = i - 1);
    if (cx < w - 1 && dist[i + 1] < 0 && pass(cx + 1, cz)) (dist[i + 1] = d), (q[qt++] = i + 1);
    if (cz > 0 && dist[i - w] < 0 && pass(cx, cz - 1)) (dist[i - w] = d), (q[qt++] = i - w);
    if (cz < h - 1 && dist[i + w] < 0 && pass(cx, cz + 1)) (dist[i + w] = d), (q[qt++] = i + w);
  }
  return dist;
}

// Abre passagens até que toda área aberta seja alcançável a partir de (sx, sz).
export function connect(grid, r, sx, sz, gap = 3) {
  const { w, h } = grid;
  for (let it = 0; it < 400; it++) {
    const dist = bfs(grid, sx, sz);
    let lost = 0;
    for (let i = 0; i < w * h; i++) if (dist[i] < 0 && grid.cells[i] !== WALL) lost++;
    if (!lost) return;
    const cand = [];
    for (let cz = 2; cz < h - 2; cz++)
      for (let cx = 2; cx < w - 2; cx++) {
        if (grid.get(cx, cz) !== WALL) continue;
        for (const [ax, az] of [
          [1, 0],
          [0, 1],
        ]) {
          for (const th of [1, 2]) {
            const a = [cx - ax, cz - az], b = [cx + ax * th, cz + az * th];
            if (th === 2 && grid.get(cx + ax, cz + az) !== WALL) continue;
            if (grid.get(...a) === WALL || grid.get(...b) === WALL) continue;
            const ra = dist[a[1] * w + a[0]] >= 0, rb = dist[b[1] * w + b[0]] >= 0;
            if (ra !== rb) cand.push([cx, cz, ax, az, th]);
          }
        }
      }
    if (!cand.length) {
      // sobrou região isolada sem parede fina: fecha-a
      for (let i = 0; i < w * h; i++) if (dist[i] < 0) grid.cells[i] = WALL;
      return;
    }
    const [cx, cz, ax, az, th] = cand[Math.floor(r() * cand.length)];
    // abre uma passagem de "gap" células, perpendicular ao eixo de travessia
    const px = az, pz = ax;
    const o = -Math.floor(gap / 2);
    for (let k = o; k < o + gap; k++)
      for (let t = 0; t < th; t++) {
        const x = cx + px * k + ax * t, z = cz + pz * k + az * t;
        if (x > 0 && z > 0 && x < w - 1 && z < h - 1) grid.set(x, z, EMPTY);
      }
  }
}

// Ponto local (s, t) da face de piso/teto que contém (x, z).
export function flatSpot(quads, x, z, kind = K_FLOOR) {
  for (const q of quads) {
    if (q.kind !== kind) continue;
    if (kind === K_FLOOR) {
      const s = x - q.o[0], t = q.o[2] - z;
      if (s >= 0 && t >= 0 && s <= q.lu && t <= q.lv) return { q, s, t };
    } else {
      const s = x - q.o[0], t = z - q.o[2];
      if (s >= 0 && t >= 0 && s <= q.lu && t <= q.lv) return { q, s, t };
    }
  }
  return null;
}

// Retângulo do atlas de manchas (4x4) para o índice i.
export function atlasRect(i, cols = 4, rows = 4) {
  const c = i % cols, rr = Math.floor(i / cols);
  return [c / cols, 1 - (rr + 1) / rows, (c + 1) / cols, 1 - rr / rows];
}

// Espalha manchas de umidade/sujeira em paredes, piso e teto.
export function scatterStains(level, quads, { walls = 120, floor = 60, ceil = 40, H = 3, key = 'stains', mat = {} } = {}) {
  const r = level.r;
  const grid = level.grid;
  const list = level.decal(key, { map: 'stains.png', roughness: 0.95, ...mat });
  const wq = quads.filter((q) => q.kind === K_WALL && q.base && q.lv > 1.5);
  for (let i = 0; i < walls && wq.length; i++) {
    const q = wq[Math.floor(r() * wq.length)];
    const kind = r.pick([0, 1, 1, 2, 2, 3]);
    let w, hh, t;
    if (kind === 2) {
      // escorrido descendo do teto
      w = r.range(0.4, 1.0);
      hh = r.range(0.8, Math.min(2.2, q.lv * 0.8));
      t = q.lv - hh / 2 - r.range(0, 0.1);
    } else if (kind === 3) {
      w = r.range(0.3, 0.9);
      hh = w * r.range(0.6, 1);
      t = r.range(0.15, 0.5);
    } else {
      w = r.range(0.35, 1.3);
      hh = w * r.range(0.7, 1.2);
      t = r.range(hh / 2 + 0.1, q.lv - hh / 2 - 0.05);
    }
    if (q.lu < w + 0.1) continue;
    const s = w / 2 + r() * (q.lu - w);
    list.push({ q, s, t, w, h: hh, rect: atlasRect(kind * 4 + r.int(0, 3)) });
  }
  for (let i = 0; i < floor; i++) {
    const p = grid.randomOpen(r);
    if (!p) break;
    const f = flatSpot(quads, p.x, p.z, K_FLOOR);
    if (!f) continue;
    const w = r.range(0.6, 2.2);
    list.push({ q: f.q, s: f.s, t: f.t, w, h: w * r.range(0.6, 1.1), rot: r.range(0, 6.28), rect: atlasRect(4 + r.int(0, 3)) });
  }
  for (let i = 0; i < ceil; i++) {
    const p = grid.randomOpen(r);
    if (!p) break;
    const f = flatSpot(quads, p.x, p.z, K_CEIL);
    if (!f) continue;
    const w = r.range(0.4, 1.4);
    list.push({ q: f.q, s: f.s, t: f.t, w, h: w * r.range(0.7, 1.1), rot: r.range(0, 6.28), rect: atlasRect(r.int(0, 3)) });
  }
}

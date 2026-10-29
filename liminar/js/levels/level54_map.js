// Nível 54 — o mapa. O espaço andável é a união de formas (retângulos ao longo
// de segmentos, que viram corredores tortos, e polígonos convexos, que viram
// cômodos), descrita por um campo de distância com sinal (negativo = dentro).
// As paredes saem da curva de nível zero desse campo; a colisão e a visão das
// aranhas também usam o campo. Assim os corredores podem ter qualquer ângulo.
import { mulberry32, TAU } from '../util.js';

export const H = 2.9; // pé-direito

const shapes = [];
const seg = (ax, az, bx, bz, w, tag) => {
  const dx = bx - ax;
  const dz = bz - az;
  const len = Math.hypot(dx, dz);
  shapes.push({ k: 'seg', ax, az, bx, bz, ux: dx / len, uz: dz / len, len, hw: w / 2, tag });
};
const poly = (pts, tag) => {
  let cx = 0;
  let cz = 0;
  for (const [x, z] of pts) {
    cx += x / pts.length;
    cz += z / pts.length;
  }
  const edges = [];
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % pts.length];
    let nx = z1 - z0;
    let nz = -(x1 - x0);
    const l = Math.hypot(nx, nz);
    nx /= l;
    nz /= l;
    // normal para fora (oposta ao centro)
    if ((cx - x0) * nx + (cz - z0) * nz > 0) {
      nx = -nx;
      nz = -nz;
    }
    edges.push({ x: x0, z: z0, nx, nz });
  }
  const s = { k: 'poly', pts, edges, cx, cz, tag };
  shapes.push(s);
  return s;
};
const ngon = (cx, cz, rs, rot) => {
  const pts = [];
  for (let i = 0; i < rs.length; i++) {
    const a = rot + (i / rs.length) * TAU;
    pts.push([cx + Math.cos(a) * rs[i], cz + Math.sin(a) * rs[i]]);
  }
  return pts;
};

// ------------------------------------------------------------ o traçado
// Cômodos das aranhas: polígono + pontos por onde os corredores chegam.
export const ROOMS = [];
const room = (pts, links, kind) => {
  const s = poly(pts, 'room');
  ROOMS.push({ s, links, kind });
};

poly(
  [
    [-3, 4],
    [3, 4],
    [3.6, -2],
    [-3.4, -2.4],
  ],
  'start',
);
seg(0, -1, 0, -14, 2.0, 'main');
seg(0, -8, -8, -11, 1.4);
seg(0, -14, 5, -24, 1.6, 'main');
room(
  ngon(9, -31, [6.5, 5.6, 7, 6.2, 5.8, 6.8], 0.3),
  [
    [5, -24],
    [13, -35],
  ],
  'corner',
);
seg(13, -35, 26, -38, 1.8, 'main');
seg(26, -38, 27, -29, 1.3);
seg(26, -38, 30, -52, 1.3, 'main');
seg(30, -52, 43, -50, 1.8);
room(
  [
    [43, -44],
    [58, -45],
    [60, -56],
    [45, -57],
  ],
  [
    [43, -50],
    [55, -56],
  ],
  'ceiling',
);
seg(55, -56, 40, -76, 1.5);
seg(30, -52, 29, -66, 1.7, 'main');
seg(29, -66, 33, -74, 1.7, 'main');
room(
  [
    [30, -74],
    [42, -75],
    [45, -84],
    [38, -91],
    [29, -88],
  ],
  [
    [33, -74],
    [40, -76],
    [31, -87],
  ],
  'corner',
);
seg(31, -87, 14, -91, 1.5, 'main');
seg(14, -91, 8, -101, 1.4, 'main');
seg(8, -101, 14, -111, 1.4, 'main');
seg(14, -111, 8, -121, 1.4, 'main');
seg(14, -111, 22, -113, 1.2);
room(
  [
    [1, -122],
    [11, -123],
    [13, -131],
    [7, -138],
    [-1, -133],
  ],
  [
    [8, -121],
    [11, -133],
  ],
  'ceiling',
);
seg(11, -133, 31, -138, 2.2, 'main');
seg(24, -136, 24, -128, 1.4);
room(
  ngon(38, -142, [6, 6.6, 5.6, 6.4, 6, 5.4], 0.9),
  [
    [31, -138],
    [38, -147],
  ],
  'corner',
);
seg(38, -147, 36, -165, 1.2, 'main');
seg(36, -165, 46, -176, 1.6, 'main');
room(
  [
    [46, -176],
    [57, -177],
    [60, -186],
    [55, -193],
    [45, -191],
  ],
  [
    [46, -176],
    [47, -189],
    [55, -192],
  ],
  'ceiling',
);
seg(47, -189, 30, -196, 1.5);
seg(30, -196, 19, -193, 1.5);
room(
  [
    [21, -188],
    [22, -199],
    [11, -200],
    [10, -189],
  ],
  [[19, -193]],
  'corner',
);
seg(55, -192, 50, -208, 1.8, 'main');
seg(50, -208, 40, -212, 1.3);
seg(50, -208, 60, -216, 1.3, 'main');
room(
  ngon(66, -224, [6.2, 5.6, 6.6, 6, 5.8, 6.4], 0.2),
  [
    [60, -216],
    [64, -230],
  ],
  'ceiling',
);
seg(64, -230, 56, -245, 1.6, 'main');
room(
  [
    [50, -244],
    [62, -246],
    [58, -262],
    [46, -260],
  ],
  [
    [56, -245],
    [52, -260],
  ],
  'corner',
);
seg(52, -260, 52, -270, 1.5, 'main');

// Cada corredor que chega num cômodo ganha um prolongamento até lá dentro
// (senão a ponta pode parar a um palmo da parede do cômodo).
for (const R of ROOMS)
  for (const [lx, lz] of R.links) {
    const c = shapes.find((q) => q.k === 'seg' && (Math.hypot(q.ax - lx, q.az - lz) < 0.01 || Math.hypot(q.bx - lx, q.bz - lz) < 0.01));
    const w = c ? c.hw * 2 : 1.4;
    seg(lx, lz, lx + (R.s.cx - lx) * 0.6, lz + (R.s.cz - lz) * 0.6, w, 'link');
  }

export const SHAPES = shapes;
export const SPAWN = { x: 0, z: 2.4, yaw: 0 };
export const EXIT = { x: 52, z: -270.75 + 0.02 };

// ------------------------------------------------------------ campo de distância
function sdShape(s, x, z) {
  if (s.k === 'seg') {
    const px = x - s.ax;
    const pz = z - s.az;
    const along = px * s.ux + pz * s.uz;
    const lat = -px * s.uz + pz * s.ux;
    const qx = Math.abs(along - s.len / 2) - (s.len / 2 + s.hw);
    const qz = Math.abs(lat) - s.hw;
    const mx = Math.max(qx, 0);
    const mz = Math.max(qz, 0);
    return Math.hypot(mx, mz) + Math.min(Math.max(qx, qz), 0);
  }
  let d = -1e9;
  for (const e of s.edges) d = Math.max(d, (x - e.x) * e.nx + (z - e.z) * e.nz);
  return d;
}

// caixas de cada forma e baldes de 8 m para achar as formas perto de um ponto
const B = 8;
const buckets = new Map();
let minX = 1e9;
let maxX = -1e9;
let minZ = 1e9;
let maxZ = -1e9;
for (const s of shapes) {
  let x0;
  let x1;
  let z0;
  let z1;
  if (s.k === 'seg') {
    const e = s.hw * 1.5 + 0.5;
    x0 = Math.min(s.ax, s.bx) - e;
    x1 = Math.max(s.ax, s.bx) + e;
    z0 = Math.min(s.az, s.bz) - e;
    z1 = Math.max(s.az, s.bz) + e;
  } else {
    x0 = Math.min(...s.pts.map((p) => p[0])) - 0.5;
    x1 = Math.max(...s.pts.map((p) => p[0])) + 0.5;
    z0 = Math.min(...s.pts.map((p) => p[1])) - 0.5;
    z1 = Math.max(...s.pts.map((p) => p[1])) + 0.5;
  }
  s.box = [x0, x1, z0, z1];
  minX = Math.min(minX, x0);
  maxX = Math.max(maxX, x1);
  minZ = Math.min(minZ, z0);
  maxZ = Math.max(maxZ, z1);
  for (let i = Math.floor((x0 - 2) / B); i <= Math.floor((x1 + 2) / B); i++)
    for (let j = Math.floor((z0 - 2) / B); j <= Math.floor((z1 + 2) / B); j++) {
      const k = i * 10000 + j;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(s);
    }
}
export const BOUNDS = { x0: minX - 1, x1: maxX + 1, z0: minZ - 1, z1: maxZ + 1 };

// Distância com sinal até a parede mais próxima (negativo = andável).
export function sdf(x, z) {
  const list = buckets.get(Math.floor(x / B) * 10000 + Math.floor(z / B));
  if (!list) return 3;
  let d = 3;
  for (const s of list) {
    const v = sdShape(s, x, z);
    if (v < d) d = v;
  }
  return d;
}

export function grad(x, z) {
  const e = 0.02;
  const gx = sdf(x + e, z) - sdf(x - e, z);
  const gz = sdf(x, z + e) - sdf(x, z - e);
  const l = Math.hypot(gx, gz) || 1;
  return [gx / l, gz / l];
}

// Linha livre entre dois pontos (sem atravessar parede)?
export function clear(ax, az, bx, bz, pad = 0.02) {
  const dx = bx - ax;
  const dz = bz - az;
  const L = Math.hypot(dx, dz);
  if (L < 1e-4) return sdf(ax, az) < pad;
  let t = 0;
  for (let i = 0; i < 200 && t < L; i++) {
    const d = sdf(ax + (dx * t) / L, az + (dz * t) / L);
    if (d > -pad) return false;
    t += Math.max(0.05, -d - pad * 0.5);
  }
  return true;
}

// ------------------------------------------------------------ teias e aranhas
// Em cada cômodo, a teia fica no canto mais longe de onde os corredores chegam.
export const WEBS = ROOMS.map((R, i) => {
  const { pts, cx, cz } = R.s;
  let best = null;
  let bd = -1;
  for (const [x, z] of pts) {
    const d = Math.min(...R.links.map(([lx, lz]) => Math.hypot(lx - x, lz - z)));
    if (d > bd) {
      bd = d;
      best = [x, z];
    }
  }
  const dx = cx - best[0];
  const dz = cz - best[1];
  const l = Math.hypot(dx, dz);
  const ux = dx / l;
  const uz = dz / l;
  const inset = R.kind === 'corner' ? 1.05 : 1.9;
  return { i, kind: R.kind, cx: best[0], cz: best[1], ux, uz, x: best[0] + ux * inset, z: best[1] + uz * inset, room: R };
});

// ------------------------------------------------------------ luminárias e portas
export function lamps() {
  const out = [];
  const add = (x, z) => {
    if (sdf(x, z) > -0.45) return;
    if (out.some((l) => Math.hypot(l.x - x, l.z - z) < 3.2)) return;
    out.push({ x, z, k: 1 });
  };
  for (const s of shapes) {
    if (s.k === 'seg') {
      const n = Math.max(1, Math.round(s.len / 5.5));
      for (let i = 0; i <= n; i++) add(s.ax + s.ux * ((s.len * i) / n), s.az + s.uz * ((s.len * i) / n));
    } else {
      add(s.cx, s.cz);
      for (let i = 0; i < s.pts.length; i += 2) add(s.cx + (s.pts[i][0] - s.cx) * 0.5, s.cz + (s.pts[i][1] - s.cz) * 0.5);
    }
  }
  // perto das teias as lâmpadas estão fracas ou queimadas
  for (const l of out) {
    const w = WEBS.reduce((m, q) => Math.min(m, Math.hypot(q.x - l.x, q.z - l.z)), 1e9);
    if (w < 3.5) l.k = 0;
    else if (w < 6) l.k = 0.45;
    l.flicker = l.k > 0 && l.k < 1;
  }
  return out;
}

// Portas de quarto (trancadas) ao longo dos corredores retos e largos o bastante.
export function doors() {
  const r = mulberry32(5454);
  const out = [];
  for (const s of shapes) {
    if (s.k !== 'seg' || s.hw < 0.75 || s.len < 8) continue;
    let side = r() < 0.5 ? 1 : -1;
    for (let t = 2.5; t < s.len - 2.5; t += 5 + r() * 3) {
      side = -side;
      const lx = -s.uz * side;
      const lz = s.ux * side;
      const x = s.ax + s.ux * t + lx * s.hw;
      const z = s.az + s.uz * t + lz * s.hw;
      // a parede precisa ser reta ali (nada de cruzamento)
      let ok = true;
      for (const o of [-0.8, 0, 0.8]) {
        const px = x + s.ux * o - lx * 0.04;
        const pz = z + s.uz * o - lz * 0.04;
        const d = sdf(px, pz);
        if (d < -0.08 || d > 0.02) ok = false;
        if (sdf(px + lx * 0.3, pz + lz * 0.3) < 0) ok = false;
      }
      if (!ok || WEBS.some((q) => Math.hypot(q.x - x, q.z - z) < 5)) continue;
      out.push({ x, z, nx: -lx, nz: -lz, num: 5400 + out.length * 3 + Math.floor(r() * 3) });
    }
  }
  return out;
}

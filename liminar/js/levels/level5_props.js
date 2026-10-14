// Nível 5 — geometria dos objetos do hotel (mesclada por bloco nos GeoBuilders):
// móveis do Salão Principal, luminárias, portas dos quartos, recepção,
// vitrola, caldeiras e válvulas. Tudo em coordenadas locais (Frame) para
// poder girar cada objeto.
import * as THREE from 'three';
import { ATL } from './level5_tex.js';
import { mulberry32, TAU } from '../util.js';

const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _nm = new THREE.Matrix3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const WHITE = [1, 1, 1];
const HP = Math.PI / 2;

export const COL = {
  walnut: [0.24, 0.12, 0.065],
  mahog: [0.3, 0.12, 0.065],
  dark: [0.13, 0.075, 0.045],
  oak: [0.52, 0.34, 0.19],
  cream: [0.86, 0.8, 0.68],
  velGreen: [0.075, 0.2, 0.13],
  velRed: [0.4, 0.065, 0.075],
  velGold: [0.55, 0.38, 0.15],
  leather: [0.26, 0.11, 0.055],
  marble: [0.44, 0.09, 0.08],
  marbleDark: [0.14, 0.12, 0.11],
  insul: [0.7, 0.67, 0.6],
  steel: [0.2, 0.21, 0.21],
  brick: [0.42, 0.2, 0.14],
  silver: [0.72, 0.76, 0.8],
  coal: [0.045, 0.045, 0.05],
};

// ------------------------------------------------------------ geometrias-base
const GEO = {};
function base(name, make) {
  return GEO[name] || (GEO[name] = make());
}
export const B = {
  cyl: (n = 10) => base('cyl' + n, () => new THREE.CylinderGeometry(1, 1, 1, n, 1)),
  cylOpen: (n = 12) => base('cylo' + n, () => new THREE.CylinderGeometry(1, 1, 1, n, 1, true)),
  cone: (rt, n = 12) => base('cone' + rt + ':' + n, () => new THREE.CylinderGeometry(rt, 1, 1, n, 1)),
  sph: (w = 8, h = 6) => base('sph' + w + ':' + h, () => new THREE.SphereGeometry(1, w, h)),
  dome: () => base('dome', () => new THREE.SphereGeometry(1, 12, 5, 0, TAU, 0, HP)),
  oct: () => base('oct', () => new THREE.OctahedronGeometry(1)),
  ico: () => base('ico', () => new THREE.IcosahedronGeometry(1, 0)),
  torus: (t = 0.12) => base('tor' + t, () => new THREE.TorusGeometry(1, t, 5, 18)),
  lathe: (name, pts, n = 14) =>
    base(
      'lathe:' + name,
      () =>
        new THREE.LatheGeometry(
          pts.map((p) => new THREE.Vector2(p[0], p[1])),
          n,
        ),
    ),
  palm: () => base('palm', palmGeo),
  flowers: () => base('flowers', flowerGeo),
  horn: () => base('horn', hornGeo),
};

// Acrescenta uma BufferGeometry ao GeoBuilder com uv do lightmap por vértice.
// opt: { uv:[u,v] (fixo), group, shade(v, n) }
export function lmGeo(gb, geo, m, col, lm, opt = {}) {
  const p = geo.attributes.position;
  const nn = geo.attributes.normal;
  const uv = geo.attributes.uv;
  _nm.getNormalMatrix(m);
  const b = gb.n;
  const g = opt.group || 0;
  for (let i = 0; i < p.count; i++) {
    _v.fromBufferAttribute(p, i).applyMatrix4(m);
    _n.fromBufferAttribute(nn, i).applyMatrix3(_nm).normalize();
    gb.pos.push(_v.x, _v.y, _v.z);
    gb.nor.push(_n.x, _n.y, _n.z);
    if (opt.uv) gb.uv.push(opt.uv[0], opt.uv[1]);
    else gb.uv.push(uv ? uv.getX(i) * (opt.us || 1) : 0, uv ? uv.getY(i) * (opt.vs || 1) : 0);
    const l = lm ? lm(_v.x + _n.x * 0.25, _v.z + _n.z * 0.25) : null;
    gb.uv1.push(l ? l[0] : 0, l ? l[1] : 0);
    // faces viradas para baixo ficam mais escuras (oclusão aproximada)
    const k = _n.y < -0.6 ? 0.6 : 1;
    gb.col.push(col[0] * k, col[1] * k, col[2] * k);
    gb.grp.push(g);
    gb.n++;
  }
  if (geo.index) for (let i = 0; i < geo.index.count; i++) gb.idx.push(b + geo.index.getX(i));
  else for (let i = 0; i < p.count; i++) gb.idx.push(b + i);
}

// Uv fixo para os vértices acrescentados a partir de n0 (cores lisas do atlas).
export function fillUV(gb, n0, uv) {
  for (let i = n0; i < gb.n; i++) {
    gb.uv[i * 2] = uv[0];
    gb.uv[i * 2 + 1] = uv[1];
  }
}

// Sistema local: (lx, lz) girado por rot em torno de (x, z). Local +z = frente.
export class Frame {
  constructor(x, z, rot = 0) {
    this.x = x;
    this.z = z;
    this.rot = rot;
    this.c = Math.cos(rot);
    this.s = Math.sin(rot);
  }
  p(lx, lz) {
    return [this.x + lx * this.c + lz * this.s, this.z - lx * this.s + lz * this.c];
  }
  d(lx, lz) {
    return [lx * this.c + lz * this.s, -lx * this.s + lz * this.c];
  }
  // retângulo local (meias-medidas) → caixa alinhada ao mundo
  aabb(hx, hz, ox = 0, oz = 0) {
    const ax = Math.abs(this.c) * hx + Math.abs(this.s) * hz;
    const az = Math.abs(this.s) * hx + Math.abs(this.c) * hz;
    const [x, z] = this.p(ox, oz);
    return [x - ax, x + ax, z - az, z + az];
  }
}

// Ferramentas de desenho de um bloco: G (camadas do GridLevel) + L (camadas do nível).
export class Kit {
  constructor(G, L) {
    this.G = G;
    this.L = L;
    this.lm = G.lm;
  }
  box(gb, f, lx, ly, lz, sx, sy, sz, col, opt = {}) {
    const [x, z] = f.p(lx, lz);
    gb.box(x, ly, z, sx, sy, sz, col, this.lm, { ...opt, rot: f.rot + (opt.rot || 0) });
  }
  abox(f, lx, ly, lz, sx, sy, sz, col, cell, opt = {}) {
    const gb = this.L.atlas;
    const n0 = gb.n;
    this.box(gb, f, lx, ly, lz, sx, sy, sz, col, opt);
    fillUV(gb, n0, ATL.center(cell[0], cell[1]));
  }
  // geometria qualquer: rotação local (rx, ry, rz em ordem YXZ) e escala
  mesh(gb, geo, f, lx, ly, lz, o = {}) {
    const [x, z] = f.p(lx, lz);
    _e.set(o.rx || 0, f.rot + (o.ry || 0), o.rz || 0, 'YXZ');
    _q.setFromEuler(_e);
    _s.set(o.sx !== undefined ? o.sx : 1, o.sy !== undefined ? o.sy : 1, o.sz !== undefined ? o.sz : 1);
    _p.set(x, ly, z);
    _m.compose(_p, _q, _s);
    lmGeo(gb, geo, _m, o.col || WHITE, gb === this.G.panel || gb === this.G.glow ? null : this.lm, o);
  }
  amesh(geo, f, lx, ly, lz, cell, o = {}) {
    this.mesh(this.L.atlas, geo, f, lx, ly, lz, { ...o, uv: ATL.center(cell[0], cell[1]) });
  }
  // brilho (lente/cúpula): u da rampa escolhe a intensidade
  lit(geo, f, lx, ly, lz, u, group, o = {}) {
    this.mesh(this.G.panel, geo, f, lx, ly, lz, { ...o, uv: [u, 0.5], group });
  }
  // quad vertical centrado em (cx,cy,cz), virado para (nx,nz), com retângulo de uv
  wquad(gb, cx, cy, cz, w, h, nx, nz, rect, col = WHITE, group = 0) {
    const rx = nz;
    const rz = -nx;
    const hw = w / 2;
    const hh = h / 2;
    const p = [
      [cx - rx * hw, cy - hh, cz - rz * hw],
      [cx + rx * hw, cy - hh, cz + rz * hw],
      [cx + rx * hw, cy + hh, cz + rz * hw],
      [cx - rx * hw, cy + hh, cz - rz * hw],
    ];
    let lm = null;
    if (gb !== this.G.glow && gb !== this.G.panel) {
      lm = [];
      for (const q of p) lm.push(...this.lm(q[0] + nx * 0.25, q[2] + nz * 0.25));
    }
    gb.quad(p, [nx, 0, nz], [rect[0], rect[1], rect[2], rect[1], rect[2], rect[3], rect[0], rect[3]], lm, [col, col, col, col], group);
  }
  // quad horizontal (piso: up = true; teto: up = false)
  hquad(gb, x0, x1, z0, z1, y, up, rect, col = WHITE, group = 0, swap = false) {
    const p = up
      ? [
          [x0, y, z1],
          [x1, y, z1],
          [x1, y, z0],
          [x0, y, z0],
        ]
      : [
          [x0, y, z0],
          [x1, y, z0],
          [x1, y, z1],
          [x0, y, z1],
        ];
    const [u0, v0, u1, v1] = rect;
    const uvOf = (q) => {
      const a = (q[0] - x0) / (x1 - x0);
      const b = (q[2] - z0) / (z1 - z0);
      return swap ? [u0 + (u1 - u0) * b, v0 + (v1 - v0) * a] : [u0 + (u1 - u0) * a, v0 + (v1 - v0) * (1 - b)];
    };
    const uv = [];
    let lm = null;
    if (gb !== this.G.glow && gb !== this.G.panel) lm = [];
    for (const q of p) {
      uv.push(...uvOf(q));
      if (lm) lm.push(...this.lm(q[0], q[2]));
    }
    gb.quad(p, [0, up ? 1 : -1, 0], uv, lm, [col, col, col, col], group);
  }
  // quad do atlas na frente de uma parede local (frame f, normal = +z local)
  fquad(f, lx, ly, lz, w, h, rect, col = WHITE) {
    const [x, z] = f.p(lx, lz);
    const [nx, nz] = f.d(0, 1);
    this.wquad(this.L.atlas, x, ly, z, w, h, nx, nz, rect, col);
  }
}

const tint = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const inset = (r, k = 0.04) => {
  const du = (r[2] - r[0]) * k;
  const dv = (r[3] - r[1]) * k;
  return [r[0] + du, r[1] + dv, r[2] - du, r[3] - dv];
};

// ------------------------------------------------------------ geometrias procedurais
function quadsGeo(build) {
  const pos = [];
  const nor = [];
  const idx = [];
  const tri = (a, b, c, d, two = true) => {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = d[0] - a[0];
    const vy = d[1] - a[1];
    const vz = d[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l;
    ny /= l;
    nz /= l;
    let i = pos.length / 3;
    pos.push(...a, ...b, ...c, ...d);
    for (let k = 0; k < 4; k++) nor.push(nx, ny, nz);
    idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    if (two) {
      i = pos.length / 3;
      pos.push(...a, ...d, ...c, ...b);
      for (let k = 0; k < 4; k++) nor.push(-nx, -ny, -nz);
      idx.push(i, i + 1, i + 2, i, i + 2, i + 3);
    }
  };
  build(tri);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

// Palmeira de vaso (folhas a partir de y = 0).
function palmGeo() {
  const rnd = mulberry32(31);
  return quadsGeo((tri) => {
    for (let k = 0; k < 11; k++) {
      const a = (k / 11) * TAU + rnd() * 0.4;
      const tilt = 0.3 + rnd() * 0.75;
      const L = 0.85 + rnd() * 0.45;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const sx = -dz;
      const sz = dx;
      const P = (t) => {
        const hd = L * t * Math.sin(tilt) + L * t * t * 0.35;
        const y = L * t * Math.cos(tilt) - L * t * t * (0.55 + tilt * 0.3);
        return [dx * hd, y, dz * hd];
      };
      const n = 6;
      for (let s = 0; s < n; s++) {
        const t0 = s / n;
        const t1 = (s + 1) / n;
        const a0 = P(t0);
        const a1 = P(t1);
        const w0 = 0.2 * Math.sin(Math.PI * Math.min(1, t0 + 0.08));
        const w1 = 0.2 * Math.sin(Math.PI * Math.min(1, t1 + 0.08));
        for (const sd of [-1, 1]) {
          const b0 = [a0[0] + sx * w0 * sd, a0[1] - w0 * 0.35, a0[2] + sz * w0 * sd];
          const b1 = [a1[0] + sx * w1 * sd, a1[1] - w1 * 0.35, a1[2] + sz * w1 * sd];
          if (sd > 0) tri(a0, a1, b1, b0);
          else tri(a1, a0, b0, b1);
        }
      }
    }
  });
}

// Arranjo de flores (cúpula de botões e folhas), centrado em y = 0.
function flowerGeo() {
  const rnd = mulberry32(77);
  const g = quadsGeo((tri) => {
    for (let k = 0; k < 14; k++) {
      const a = rnd() * TAU;
      const r = 0.15 + rnd() * 0.2;
      const y = rnd() * 0.15;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const ex = Math.cos(a) * 0.22;
      const ez = Math.sin(a) * 0.22;
      const px = -Math.sin(a) * 0.06;
      const pz = Math.cos(a) * 0.06;
      tri(
        [x - px, y, z - pz],
        [x + px, y, z + pz],
        [x + ex + px * 0.3, y - 0.12, z + ez + pz * 0.3],
        [x + ex - px * 0.3, y - 0.12, z + ez - pz * 0.3],
      );
    }
  });
  return g;
}

// Corneta da vitrola: perfil torneado que se abre (eixo +y).
function hornGeo() {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    pts.push(new THREE.Vector2(0.025 + Math.pow(t, 2.6) * 0.27, t * 0.5));
  }
  const g = new THREE.LatheGeometry(pts, 16);
  // duas faces: copia invertida para a parte de dentro
  const inner = g.clone();
  const idx = inner.index.array;
  for (let i = 0; i < idx.length; i += 3) {
    const t = idx[i + 1];
    idx[i + 1] = idx[i + 2];
    idx[i + 2] = t;
  }
  const nr = inner.attributes.normal.array;
  for (let i = 0; i < nr.length; i++) nr[i] = -nr[i];
  return mergeTwo(g, inner);
}

function mergeTwo(a, b) {
  const pos = [...a.attributes.position.array, ...b.attributes.position.array];
  const nor = [...a.attributes.normal.array, ...b.attributes.normal.array];
  const n = a.attributes.position.count;
  const idx = [...a.index.array, ...Array.from(b.index.array, (i) => i + n)];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  return g;
}

const VASE = [
  [0, 0],
  [0.09, 0],
  [0.1, 0.03],
  [0.07, 0.08],
  [0.13, 0.22],
  [0.15, 0.34],
  [0.11, 0.44],
  [0.09, 0.47],
  [0.12, 0.5],
  [0, 0.5],
];
const URN = [
  [0, 0],
  [0.16, 0],
  [0.16, 0.05],
  [0.09, 0.1],
  [0.08, 0.2],
  [0.2, 0.36],
  [0.26, 0.5],
  [0.24, 0.58],
  [0.28, 0.62],
  [0, 0.62],
];
const POT = [
  [0, 0],
  [0.2, 0],
  [0.22, 0.04],
  [0.26, 0.42],
  [0.3, 0.46],
  [0.3, 0.5],
  [0, 0.5],
];
const BELL = [
  [0, 0],
  [0.05, 0],
  [0.05, 0.01],
  [0.045, 0.03],
  [0.03, 0.055],
  [0.006, 0.065],
  [0.008, 0.08],
  [0, 0.085],
];

// ------------------------------------------------------------ móveis
// Sofá Chesterfield. Retorna o colisor.
export function sofa(K, x, z, rot, len, col) {
  const f = new Frame(x, z, rot);
  const g = K.G.extra;
  const d = 0.9;
  K.box(g, f, 0, 0.26, 0, len, 0.28, d, col);
  K.box(g, f, 0, 0.45, 0.06, len - 0.36, 0.12, d - 0.22, tint(col, 1.1), { ao: 0 });
  K.box(g, f, 0, 0.66, -d / 2 + 0.12, len, 0.52, 0.24, col, { ao: 0.2 });
  K.mesh(g, B.cyl(10), f, 0, 0.93, -d / 2 + 0.13, { rz: HP, sx: 0.13, sy: len, sz: 0.13, col });
  for (const s of [-1, 1]) {
    K.box(g, f, s * (len / 2 - 0.1), 0.47, 0, 0.2, 0.42, d, col, { ao: 0.2 });
    K.mesh(g, B.cyl(10), f, s * (len / 2 - 0.1), 0.7, 0.02, { rx: HP, sx: 0.12, sy: d - 0.02, sz: 0.12, col });
  }
  // botões do capitonê
  const bt = tint(col, 0.55);
  for (let i = 0; i < 7; i++)
    for (let j = 0; j < 2; j++) K.box(g, f, (i / 6 - 0.5) * (len - 0.5), 0.62 + j * 0.15, -d / 2 + 0.245, 0.03, 0.03, 0.01, bt, { ao: 0 });
  for (const sx of [-1, 1])
    for (const sz of [-1, 1]) K.box(K.G.prop, f, sx * (len / 2 - 0.1), 0.06, sz * (d / 2 - 0.1), 0.07, 0.12, 0.07, COL.dark);
  return f.aabb(len / 2, d / 2);
}

// Poltrona de clube.
export function armchair(K, x, z, rot, col) {
  const f = new Frame(x, z, rot);
  const g = K.G.extra;
  K.box(g, f, 0, 0.26, 0, 0.86, 0.28, 0.84, col);
  K.box(g, f, 0, 0.45, 0.06, 0.52, 0.12, 0.62, tint(col, 1.1), { ao: 0 });
  K.box(g, f, 0, 0.7, -0.31, 0.86, 0.6, 0.22, col, { ao: 0.2 });
  K.mesh(g, B.cyl(10), f, 0, 1.0, -0.3, { rz: HP, sx: 0.12, sy: 0.86, sz: 0.12, col });
  for (const s of [-1, 1]) {
    K.box(g, f, s * 0.34, 0.48, 0, 0.18, 0.44, 0.84, col, { ao: 0.2 });
    K.mesh(g, B.cyl(10), f, s * 0.34, 0.72, 0.02, { rx: HP, sx: 0.11, sy: 0.82, sz: 0.11, col });
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(K.G.prop, f, sx * 0.33, 0.06, sz * 0.33, 0.06, 0.12, 0.06, COL.dark);
  return f.aabb(0.45, 0.44);
}

// Mesa de centro baixa com bandeja de chá.
export function coffeeTable(K, x, z, rot) {
  const f = new Frame(x, z, rot);
  const w = K.G.prop;
  K.box(w, f, 0, 0.44, 0, 1.15, 0.045, 0.62, COL.walnut, { ao: 0 });
  K.box(w, f, 0, 0.38, 0, 1.05, 0.08, 0.52, COL.dark, { ao: 0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(w, f, sx * 0.49, 0.18, sz * 0.24, 0.05, 0.36, 0.05, COL.dark);
  K.abox(f, 0.15, 0.475, 0, 0.42, 0.02, 0.3, COL.silver, ATL.BRASS, { ao: 0 });
  K.amesh(B.lathe('bell', BELL), f, 0.05, 0.485, 0.02, ATL.BRASS, { sx: 1.4, sy: 1.6, sz: 1.4, col: COL.silver });
  K.amesh(B.cyl(10), f, 0.25, 0.5, -0.05, ATL.ENAMEL, { sx: 0.035, sy: 0.05, sz: 0.035 });
  K.amesh(B.cyl(10), f, -0.3, 0.47, 0.1, ATL.ENAMEL, { sx: 0.08, sy: 0.008, sz: 0.08 });
  return f.aabb(0.58, 0.32);
}

// Mesinha redonda com abajur (a cúpula brilha).
export function sideTable(K, x, z, group = 0, lamp = true) {
  const f = new Frame(x, z, 0);
  const w = K.G.prop;
  K.mesh(w, B.cyl(14), f, 0, 0.62, 0, { sx: 0.27, sy: 0.035, sz: 0.27, col: COL.walnut });
  K.mesh(w, B.cyl(8), f, 0, 0.32, 0, { sx: 0.04, sy: 0.6, sz: 0.04, col: COL.dark });
  K.mesh(w, B.cyl(10), f, 0, 0.03, 0, { sx: 0.18, sy: 0.05, sz: 0.18, col: COL.dark });
  if (lamp) {
    K.amesh(B.lathe('vase', VASE), f, 0, 0.64, 0, ATL.BRASS, { sx: 0.7, sy: 0.75, sz: 0.7 });
    K.amesh(B.cyl(6), f, 0, 1.06, 0, ATL.BRASS, { sx: 0.01, sy: 0.12, sz: 0.01 });
    K.lit(B.cone(0.62, 14), f, 0, 1.16, 0, 0.42, group, { sx: 0.19, sy: 0.22, sz: 0.19 });
    K.mesh(K.G.glow, B.cyl(8), f, 0, 1.0, 0, { sx: 0.001, sy: 0.001, sz: 0.001 });
  }
  return f.aabb(0.28, 0.28);
}

// Abajur de pé (posição da luz em y ≈ 1.55).
export function floorLamp(K, x, z, group) {
  const f = new Frame(x, z, 0);
  K.amesh(B.cyl(14), f, 0, 0.02, 0, ATL.BRASS, { sx: 0.17, sy: 0.04, sz: 0.17 });
  K.amesh(B.cyl(6), f, 0, 0.78, 0, ATL.BRASS, { sx: 0.015, sy: 1.5, sz: 0.015 });
  K.lit(B.cone(0.68, 16), f, 0, 1.6, 0, 0.45, group, { sx: 0.24, sy: 0.32, sz: 0.24 });
  K.amesh(B.sph(6, 4), f, 0, 1.79, 0, ATL.BRASS, { sx: 0.02, sy: 0.02, sz: 0.02 });
}

// Palmeira em vaso.
export function palm(K, x, z, s = 1, rot = 0) {
  const f = new Frame(x, z, rot);
  K.amesh(B.lathe('pot', POT), f, 0, 0, 0, ATL.BRASS, { sx: s, sy: s, sz: s, col: [0.55, 0.42, 0.3] });
  K.mesh(K.G.extra, B.cyl(6), f, 0, 0.5 * s + 0.35, 0, { sx: 0.035, sy: 0.75, sz: 0.035, col: [0.25, 0.18, 0.1] });
  K.mesh(K.G.extra, B.palm(), f, 0, 0.5 * s + 0.7, 0, { sx: s * 1.05, sy: s, sz: s * 1.05, col: [0.1, 0.22, 0.08] });
  K.mesh(K.G.extra, B.palm(), f, 0, 0.5 * s + 0.55, 0, { ry: 1.7, sx: s * 0.75, sy: s * 0.8, sz: s * 0.75, col: [0.13, 0.26, 0.1] });
  return [x - 0.3 * s, x + 0.3 * s, z - 0.3 * s, z + 0.3 * s];
}

// Vaso com flores (em cima de uma mesa à altura y).
export function flowers(K, x, y, z, s = 1) {
  const f = new Frame(x, z, 0);
  K.amesh(B.lathe('urn', URN), f, 0, y, 0, ATL.BRASS, { sx: s * 0.6, sy: s * 0.6, sz: s * 0.6, col: [0.9, 0.86, 0.8] });
  const top = y + 0.37 * s;
  K.mesh(K.G.extra, B.flowers(), f, 0, top + 0.05 * s, 0, { sx: s, sy: s, sz: s, col: [0.1, 0.24, 0.1] });
  const rnd = mulberry32(Math.floor(x * 13 + z * 7) >>> 0);
  const cols = [
    [0.55, 0.06, 0.08],
    [0.78, 0.72, 0.62],
    [0.62, 0.3, 0.12],
    [0.5, 0.1, 0.25],
  ];
  for (let i = 0; i < 16; i++) {
    const a = rnd() * TAU;
    const r = rnd() * 0.2 * s;
    K.mesh(K.G.extra, B.ico(), f, Math.cos(a) * r, top + 0.1 * s + rnd() * 0.18 * s, Math.sin(a) * r, {
      sx: 0.05 * s,
      sy: 0.045 * s,
      sz: 0.05 * s,
      col: cols[i % 4],
      ry: rnd() * 3,
    });
  }
}

// Mesa redonda de pedestal (centro do salão).
export function pedestalTable(K, x, z) {
  const f = new Frame(x, z, 0);
  const w = K.G.prop;
  K.mesh(w, B.cyl(20), f, 0, 0.77, 0, { sx: 0.82, sy: 0.05, sz: 0.82, col: COL.walnut });
  K.mesh(w, B.cyl(20), f, 0, 0.735, 0, { sx: 0.76, sy: 0.04, sz: 0.76, col: COL.dark });
  K.mesh(w, B.cone(0.55, 12), f, 0, 0.4, 0, { sx: 0.13, sy: 0.66, sz: 0.13, col: COL.dark });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU;
    K.box(w, f, Math.cos(a) * 0.26, 0.06, Math.sin(a) * 0.26, 0.5, 0.1, 0.09, COL.dark, { rot: -a });
  }
  flowers(K, x, 0.795, z, 1.45);
  return [x - 0.82, x + 0.82, z - 0.82, z + 0.82];
}

// Quadro com moldura dourada numa parede (frame f com +z para fora da parede).
export function picture(K, f, lx, y, w, h, k, lz = 0) {
  const r = inset(ATL.rect(ATL.PAINT[k][0], ATL.PAINT[k][1], 2, 2), 0.01);
  K.fquad(f, lx, y, lz + 0.032, w, h, r);
  const t = 0.07;
  const gold = [0.95, 0.85, 0.6];
  K.abox(f, lx, y + h / 2 + t / 2, lz + 0.03, w + t * 2, t, 0.06, gold, ATL.GOLD, { ao: 0 });
  K.abox(f, lx, y - h / 2 - t / 2, lz + 0.03, w + t * 2, t, 0.06, gold, ATL.GOLD, { ao: 0 });
  K.abox(f, lx - w / 2 - t / 2, y, lz + 0.03, t, h, 0.06, gold, ATL.GOLD, { ao: 0 });
  K.abox(f, lx + w / 2 + t / 2, y, lz + 0.03, t, h, 0.06, gold, ATL.GOLD, { ao: 0 });
}

// Espelho com moldura dourada.
export function mirror(K, f, lx, y, w, h) {
  K.fquad(f, lx, y, 0.03, w, h, inset(ATL.rect(...ATL.MIRROR)));
  const t = 0.08;
  K.abox(f, lx, y + h / 2 + t / 2, 0.03, w + t * 2, t, 0.06, WHITE, ATL.GOLD, { ao: 0 });
  K.abox(f, lx, y - h / 2 - t / 2, 0.03, w + t * 2, t, 0.06, WHITE, ATL.GOLD, { ao: 0 });
  K.abox(f, lx - w / 2 - t / 2, y, 0.03, t, h, 0.06, WHITE, ATL.GOLD, { ao: 0 });
  K.abox(f, lx + w / 2 + t / 2, y, 0.03, t, h, 0.06, WHITE, ATL.GOLD, { ao: 0 });
  K.abox(f, lx, y + h / 2 + 0.16, 0.035, 0.22, 0.14, 0.05, WHITE, ATL.GOLD, { ao: 0 });
}

// Aparador encostado na parede (frame com +z para fora da parede).
export function console_(K, f, lx, deco) {
  const w = K.G.prop;
  K.box(w, f, lx, 0.8, 0.21, 1.1, 0.045, 0.4, COL.walnut, { ao: 0 });
  K.box(w, f, lx, 0.73, 0.2, 1.02, 0.1, 0.36, COL.dark, { ao: 0 });
  for (const s of [-1, 1]) for (const d of [0.05, 0.36]) K.box(w, f, lx + s * 0.48, 0.36, d, 0.045, 0.72, 0.045, COL.dark);
  K.box(w, f, lx, 0.12, 0.2, 0.95, 0.03, 0.3, COL.dark, { ao: 0 });
  if (deco === 0) {
    const [x, z] = f.p(lx, 0.2);
    flowers(K, x, 0.825, z, 0.8);
  } else {
    // abajur pequeno
    const [x, z] = f.p(lx - 0.3, 0.2);
    const f2 = new Frame(x, z, 0);
    K.amesh(B.lathe('vase', VASE), f2, 0, 0.825, 0, ATL.BRASS, { sx: 0.55, sy: 0.6, sz: 0.55 });
    K.lit(B.cone(0.62, 12), f2, 0, 1.25, 0, 0.36, 0, { sx: 0.15, sy: 0.18, sz: 0.15 });
    K.amesh(B.lathe('bell', BELL), f, lx + 0.25, 0.825, 0.22, ATL.BRASS, { sx: 1.2, sy: 1.2, sz: 1.2 });
  }
  return f.aabb(0.56, 0.22, lx, 0.21);
}

// Bandeja de serviço de quarto esquecida no chão.
export function tray(K, f, lx) {
  K.abox(f, lx, 0.015, 0.4, 0.46, 0.03, 0.34, COL.silver, ATL.BRASS, { ao: 0 });
  K.amesh(B.dome(), f, lx + 0.05, 0.03, 0.4, ATL.BRASS, { sx: 0.13, sy: 0.1, sz: 0.13, col: COL.silver });
  K.amesh(B.sph(6, 4), f, lx + 0.05, 0.14, 0.4, ATL.BRASS, { sx: 0.015, sy: 0.015, sz: 0.015, col: COL.silver });
  K.amesh(B.cyl(8), f, lx - 0.15, 0.05, 0.45, ATL.ENAMEL, { sx: 0.03, sy: 0.06, sz: 0.03 });
}

// Par de sapatos engraxados ao lado da porta.
export function shoes(K, f, lx) {
  for (const s of [-1, 1]) {
    K.box(K.G.extra, f, lx + s * 0.06, 0.045, 0.25, 0.09, 0.09, 0.27, [0.06, 0.035, 0.025], { rot: s * 0.06, ao: 0 });
  }
}

// Carrinho de bagagem de latão com malas.
export function luggageCart(K, x, z, rot) {
  const f = new Frame(x, z, rot);
  K.box(K.G.extra, f, 0, 0.22, 0, 1.15, 0.06, 0.62, COL.velRed);
  K.abox(f, 0, 0.18, 0, 1.2, 0.04, 0.66, WHITE, ATL.BRASS, { ao: 0 });
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      K.amesh(B.cyl(8), f, sx * 0.56, 0.95, sz * 0.29, ATL.BRASS, { sx: 0.018, sy: 1.5, sz: 0.018 });
      K.mesh(K.G.extra, B.cyl(10), f, sx * 0.5, 0.08, sz * 0.27, { rx: HP, sx: 0.08, sy: 0.04, sz: 0.08, col: [0.05, 0.05, 0.05] });
    }
    K.amesh(B.cyl(8), f, sx * 0.56, 1.7, 0, ATL.BRASS, { rx: HP, sx: 0.022, sy: 0.6, sz: 0.022 });
  }
  K.amesh(B.cyl(8), f, 0, 1.72, 0, ATL.BRASS, { rz: HP, sx: 0.025, sy: 1.14, sz: 0.025 });
  const cases = [
    [0, 0.42, 0, 0.9, 0.36, 0.5, [0.32, 0.16, 0.08]],
    [-0.1, 0.72, 0.02, 0.7, 0.24, 0.42, [0.12, 0.2, 0.18]],
    [0.12, 0.92, -0.02, 0.5, 0.18, 0.34, [0.42, 0.3, 0.16]],
  ];
  for (const c of cases) {
    K.box(K.G.extra, f, c[0], c[1], c[2], c[3], c[4], c[5], c[6], { rot: c[0] * 0.5 });
    K.abox(f, c[0] - c[3] * 0.25, c[1], c[2], 0.04, c[4] + 0.01, c[5] + 0.01, [0.5, 0.45, 0.35], ATL.BRASS, { rot: c[0] * 0.5, ao: 0 });
    K.abox(f, c[0] + c[3] * 0.25, c[1], c[2], 0.04, c[4] + 0.01, c[5] + 0.01, [0.5, 0.45, 0.35], ATL.BRASS, { rot: c[0] * 0.5, ao: 0 });
  }
  return f.aabb(0.62, 0.36);
}

// Escrivaninha com cadeira (parede atrás, +z para fora).
export function writingDesk(K, x, z, rot) {
  const f = new Frame(x, z, rot);
  const w = K.G.prop;
  K.box(w, f, 0, 0.76, 0, 1.3, 0.045, 0.62, COL.mahog, { ao: 0 });
  for (const s of [-1, 1]) K.box(w, f, s * 0.48, 0.37, 0, 0.34, 0.74, 0.58, COL.mahog);
  K.box(K.G.extra, f, 0, 0.785, 0.02, 0.8, 0.005, 0.42, [0.12, 0.25, 0.14], { ao: 0 });
  K.amesh(B.cyl(8), f, 0.4, 0.83, -0.12, ATL.BRASS, { sx: 0.04, sy: 0.08, sz: 0.04 });
  K.box(K.G.extra, f, -0.2, 0.79, 0.05, 0.22, 0.01, 0.3, [0.85, 0.82, 0.74], { rot: 0.2, ao: 0 });
  // cadeira
  const cz = 0.62;
  K.box(K.G.extra, f, 0, 0.47, cz, 0.46, 0.08, 0.46, COL.velRed, { ao: 0 });
  K.box(w, f, 0, 0.82, cz + 0.22, 0.44, 0.62, 0.05, COL.mahog, { ao: 0 });
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(w, f, sx * 0.19, 0.22, cz + sz * 0.19, 0.04, 0.44, 0.04, COL.dark);
  return [f.aabb(0.66, 0.32), f.aabb(0.25, 0.25, 0, cz)];
}

// Banco estofado.
export function bench(K, x, z, rot, len = 1.5) {
  const f = new Frame(x, z, rot);
  K.box(K.G.extra, f, 0, 0.42, 0, len, 0.12, 0.46, COL.velGreen, { ao: 0 });
  K.box(K.G.prop, f, 0, 0.33, 0, len - 0.04, 0.08, 0.42, COL.walnut);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) K.box(K.G.prop, f, sx * (len / 2 - 0.08), 0.15, sz * 0.17, 0.05, 0.3, 0.05, COL.dark);
  return f.aabb(len / 2, 0.24);
}

// Vitrola sobre móvel (frente = +z local). Retorna o colisor.
export function gramophone(K, x, z, rot) {
  const f = new Frame(x, z, rot);
  const w = K.G.prop;
  K.box(w, f, 0, 0.42, 0, 0.62, 0.84, 0.5, COL.mahog);
  K.box(w, f, 0, 0.86, 0, 0.66, 0.04, 0.54, COL.walnut, { ao: 0 });
  for (const s of [-1, 1]) K.box(w, f, s * 0.15, 0.42, 0.252, 0.26, 0.6, 0.01, tint(COL.mahog, 1.25), { ao: 0 });
  K.box(w, f, 0, 0.98, 0, 0.42, 0.2, 0.4, COL.mahog);
  K.mesh(K.G.extra, B.cyl(20), f, -0.04, 1.09, 0.02, { sx: 0.16, sy: 0.015, sz: 0.16, col: [0.04, 0.04, 0.04] });
  K.amesh(B.cyl(10), f, -0.04, 1.1, 0.02, ATL.RED, { sx: 0.05, sy: 0.016, sz: 0.05 });
  K.amesh(B.cyl(6), f, 0.14, 1.12, -0.12, ATL.BRASS, { sx: 0.012, sy: 0.08, sz: 0.012 });
  K.amesh(B.cyl(6), f, 0.06, 1.15, -0.05, ATL.BRASS, { rx: HP, ry: -0.8, sx: 0.008, sy: 0.24, sz: 0.008 });
  K.amesh(B.horn(), f, 0.12, 1.12, -0.16, ATL.BRASS, { rx: 0.9, sx: 1, sy: 1.1, sz: 1 });
  K.amesh(B.cyl(6), f, 0.25, 0.96, 0.2, ATL.BRASS, { rz: HP, sx: 0.01, sy: 0.1, sz: 0.01 });
  return f.aabb(0.34, 0.28);
}

// Coluna do salão: base de mármore, fuste vermelho e capitel dourado.
export function column(K, x, z, H) {
  const f = new Frame(x, z, 0);
  K.box(K.G.extra, f, 0, 0.17, 0, 0.68, 0.34, 0.68, COL.marbleDark);
  K.box(K.G.extra, f, 0, 0.37, 0, 0.6, 0.06, 0.6, COL.marbleDark, { ao: 0 });
  K.amesh(B.cyl(16), f, 0, 0.45, 0, ATL.GOLD, { sx: 0.31, sy: 0.08, sz: 0.31 });
  const top = H - 0.62;
  K.mesh(K.G.extra, B.cyl(16), f, 0, (0.49 + top) / 2, 0, { sx: 0.27, sy: top - 0.49, sz: 0.27, col: COL.marble });
  K.amesh(B.cyl(16), f, 0, top + 0.02, 0, ATL.GOLD, { sx: 0.29, sy: 0.05, sz: 0.29 });
  K.amesh(B.cone(1.3, 16), f, 0, top + 0.18, 0, ATL.GOLD, { sx: 0.28, sy: 0.26, sz: 0.28 });
  K.abox(f, 0, top + 0.37, 0, 0.78, 0.1, 0.78, WHITE, ATL.GOLD, { ao: 0 });
  K.box(K.G.extra, f, 0, (top + 0.42 + H) / 2, 0, 0.66, H - top - 0.42, 0.66, COL.cream, { ao: 0 });
}

// ------------------------------------------------------------ luminárias
// Lustre de cristal pendurado (y = altura da coroa inferior).
export function chandelier(K, x, z, H, group, s = 1) {
  const f = new Frame(x, z, 0);
  const y = H - 1.0 * s;
  K.mesh(K.G.extra, B.cyl(18), f, 0, H - 0.02, 0, { sx: 0.5 * s, sy: 0.05, sz: 0.5 * s, col: COL.cream });
  K.amesh(B.cyl(12), f, 0, H - 0.05, 0, ATL.GOLD, { sx: 0.1, sy: 0.04, sz: 0.1 });
  K.amesh(B.cyl(6), f, 0, (H + y + 0.4 * s) / 2, 0, ATL.BRASS, { sx: 0.018, sy: H - y - 0.4 * s, sz: 0.018 });
  K.amesh(B.lathe('urn', URN), f, 0, y - 0.25 * s, 0, ATL.GOLD, { sx: 0.4 * s, sy: 1.05 * s, sz: 0.4 * s });
  const tiers = [
    [0.62 * s, 8, y, 0.95],
    [0.36 * s, 6, y + 0.3 * s, 0.9],
  ];
  for (const [R, n, ty, u] of tiers) {
    K.amesh(B.torus(0.12), f, 0, ty, 0, ATL.GOLD, { rx: HP, sx: R, sy: R, sz: R * 0.6 });
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + (R < 0.5 ? 0.3 : 0);
      const cx = Math.cos(a) * R;
      const cz = Math.sin(a) * R;
      K.amesh(B.cyl(5), f, cx / 2, ty - 0.02, cz / 2, ATL.GOLD, { ry: -a, rz: HP, sx: 0.012, sy: R, sz: 0.012 });
      K.amesh(B.cyl(8), f, cx, ty + 0.02, cz, ATL.GOLD, { sx: 0.035, sy: 0.03, sz: 0.035 });
      K.amesh(B.cyl(6), f, cx, ty + 0.1, cz, ATL.ENAMEL, { sx: 0.016, sy: 0.13, sz: 0.016 });
      K.lit(B.sph(6, 4), f, cx, ty + 0.2, cz, u, group, { sx: 0.022, sy: 0.04, sz: 0.022 });
      K.lit(B.oct(), f, cx, ty - 0.1, cz, 0.42, group, { sx: 0.02, sy: 0.05, sz: 0.02 });
      // guirlanda de cristais até o próximo braço
      const a2 = ((i + 0.5) / n) * TAU + (R < 0.5 ? 0.3 : 0);
      for (let k = 1; k < 4; k++) {
        const t = k / 4;
        const ang = a + (a2 - a) * 2 * t * 0.5;
        const rr = R * (1 - 0.12 * Math.sin(t * Math.PI));
        K.lit(B.oct(), f, Math.cos(ang) * rr, ty - 0.05 - Math.sin(t * Math.PI) * 0.1 * s, Math.sin(ang) * rr, 0.36, group, {
          sx: 0.013,
          sy: 0.02,
          sz: 0.013,
        });
      }
    }
  }
  // gota de cristal no fundo
  K.lit(B.oct(), f, 0, y - 0.38 * s, 0, 0.5, group, { sx: 0.05 * s, sy: 0.12 * s, sz: 0.05 * s });
  K.lit(B.sph(8, 6), f, 0, y - 0.18 * s, 0, 0.32, group, { sx: 0.12 * s, sy: 0.1 * s, sz: 0.12 * s });
  // poça de luz no teto
  K.hquad(K.G.glow, x - 2.4 * s, x + 2.4 * s, z - 2.4 * s, z + 2.4 * s, H - 0.012, false, [0, 0, 1, 1], [0.55, 0.42, 0.28], group);
  K.mesh(K.G.glow, B.sph(10, 8), f, 0, y + 0.05, 0, {
    sx: 0.75 * s,
    sy: 0.5 * s,
    sz: 0.75 * s,
    col: [0.08, 0.06, 0.04],
    uv: [0.5, 0.5],
    group,
  });
}

// Arandela de parede com cúpula de tecido (frame: +z para fora da parede).
export function sconce(K, wx, wz, nx, nz, y, group) {
  const f = new Frame(wx, wz, Math.atan2(nx, nz));
  K.abox(f, 0, y - 0.04, 0.012, 0.11, 0.24, 0.025, WHITE, ATL.BRASS, { ao: 0 });
  K.amesh(B.cyl(6), f, 0, y - 0.06, 0.09, ATL.BRASS, { rx: HP, sx: 0.012, sy: 0.15, sz: 0.012 });
  K.amesh(B.cyl(8), f, 0, y, 0.17, ATL.BRASS, { sx: 0.022, sy: 0.12, sz: 0.022 });
  K.lit(B.cone(0.68, 14), f, 0, y + 0.1, 0.17, 0.5, group, { sx: 0.11, sy: 0.16, sz: 0.11 });
  // luz rebatida na parede (para cima e para baixo da cúpula)
  const [gx, gz] = f.p(0, 0.012);
  K.wquad(K.G.glow, gx, y + 0.35, gz, 1.0, 1.5, nx, nz, [0, 0, 1, 1], [0.75, 0.55, 0.32], group);
  K.wquad(K.G.glow, gx, y - 0.25, gz, 0.6, 0.6, nx, nz, [0, 0, 1, 1], [0.45, 0.32, 0.2], group);
}

// Plafon de alabastro no teto.
export function bowl(K, x, z, H, group) {
  const f = new Frame(x, z, 0);
  K.amesh(B.cyl(10), f, 0, H - 0.03, 0, ATL.BRASS, { sx: 0.07, sy: 0.06, sz: 0.07 });
  K.amesh(B.cyl(16), f, 0, H - 0.075, 0, ATL.BRASS, { sx: 0.3, sy: 0.02, sz: 0.3 });
  K.lit(B.cone(1.6, 16), f, 0, H - 0.15, 0, 0.55, group, { sx: 0.18, sy: 0.14, sz: 0.18 });
  K.hquad(K.G.glow, x - 1.3, x + 1.3, z - 1.3, z + 1.3, H - 0.01, false, [0, 0, 1, 1], [0.5, 0.38, 0.24], group);
}

// Lâmpada nua com grade (Sala das Caldeiras).
export function cageBulb(K, x, z, H, y, group) {
  const f = new Frame(x, z, 0);
  K.amesh(B.cyl(4), f, 0, (H + y + 0.12) / 2, 0, ATL.IRON, { sx: 0.008, sy: H - y - 0.12, sz: 0.008 });
  K.amesh(B.cyl(8), f, 0, y + 0.1, 0, ATL.IRON, { sx: 0.035, sy: 0.08, sz: 0.035 });
  K.amesh(B.cone(2.8, 12), f, 0, y + 0.075, 0, ATL.ENAMEL, { sx: 0.06, sy: 0.04, sz: 0.06, col: [0.4, 0.5, 0.42] });
  K.lit(B.sph(8, 6), f, 0, y, 0, 1.0, group, { sx: 0.045, sy: 0.06, sz: 0.045 });
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * TAU + 0.4;
    K.amesh(B.cyl(3), f, Math.cos(a) * 0.065, y - 0.01, Math.sin(a) * 0.065, ATL.IRON, { sx: 0.004, sy: 0.16, sz: 0.004 });
  }
  K.amesh(B.torus(0.06), f, 0, y - 0.08, 0, ATL.IRON, { rx: HP, sx: 0.065, sy: 0.065, sz: 0.04 });
  K.mesh(K.G.glow, B.sph(8, 6), f, 0, y, 0, { sx: 0.35, sy: 0.35, sz: 0.35, col: [0.2, 0.15, 0.08], uv: [0.5, 0.5], group });
}

// Luminária de banqueiro (cúpula de vidro verde).
export function deskLamp(K, x, y, z, rot, group) {
  const f = new Frame(x, z, rot);
  K.amesh(B.cyl(12), f, 0, y + 0.015, 0, ATL.BRASS, { sx: 0.09, sy: 0.03, sz: 0.09 });
  K.amesh(B.cyl(6), f, 0, y + 0.18, -0.03, ATL.BRASS, { sx: 0.012, sy: 0.33, sz: 0.012 });
  K.amesh(B.cylOpen(12), f, 0, y + 0.36, 0.02, ATL.GREEN, { rz: HP, sx: 0.085, sy: 0.32, sz: 0.06 });
  K.lit(B.cyl(8), f, 0, y + 0.325, 0.02, 0.85, group, { rz: HP, sx: 0.02, sy: 0.26, sz: 0.02 });
}

// ------------------------------------------------------------ portas e paredes
// Porta de quarto numa parede (sl: fx, fz, nx, nz). num: string de 3 dígitos.
export function roomDoor(K, sl, num, opt = {}) {
  const f = new Frame(sl.fx, sl.fz, Math.atan2(sl.nx, sl.nz));
  const w = K.G.prop;
  const leaf = opt.color || COL.walnut;
  const cas = COL.dark;
  if (!opt.noLeaf) doorLeaf(K, f, leaf, num);
  // batentes, verga e cornija
  for (const s of [-1, 1]) K.box(w, f, s * 0.55, 1.13, 0.035, 0.1, 2.26, 0.07, cas);
  K.box(w, f, 0, 2.31, 0.04, 1.22, 0.12, 0.08, cas, { ao: 0 });
  K.box(w, f, 0, 2.4, 0.055, 1.32, 0.06, 0.11, tint(cas, 1.3), { ao: 0 });
  K.abox(f, 0, 0.007, 0.07, 1.0, 0.014, 0.14, WHITE, ATL.BRASS, { ao: 0 });
  if (opt.dnd) {
    const [x, z] = f.p(0.36, 0.085);
    K.wquad(K.L.atlas, x, 0.87, z, 0.09, 0.2, sl.nx, sl.nz, inset(ATL.rect(...ATL.DND)));
  }
  if (opt.staff) K.fquad(f, 0, 1.62, 0.046, 0.16, 0.16, inset(ATL.rect(...ATL.STAFF)));
}

// Folha da porta (também usada na porta animada do objetivo).
export function doorLeaf(K, f, leaf, num, lz = 0) {
  const w = K.G.prop;
  K.box(w, f, 0, 1.08, lz + 0.02, 0.96, 2.16, 0.04, leaf);
  const pan = tint(leaf, 1.22);
  for (const s of [-1, 1]) {
    K.box(w, f, s * 0.21, 0.5, lz + 0.044, 0.32, 0.58, 0.012, pan, { ao: 0 });
    K.box(w, f, s * 0.21, 1.66, lz + 0.044, 0.32, 0.7, 0.012, pan, { ao: 0 });
    K.box(w, f, s * 0.21, 1.08, lz + 0.044, 0.32, 0.26, 0.012, pan, { ao: 0 });
  }
  K.abox(f, 0, 0.1, lz + 0.043, 0.92, 0.18, 0.006, WHITE, ATL.BRASS, { ao: 0 });
  K.abox(f, 0.38, 1.0, lz + 0.045, 0.06, 0.17, 0.012, WHITE, ATL.BRASS, { ao: 0 });
  K.amesh(B.sph(8, 6), f, 0.38, 1.02, lz + 0.075, ATL.BRASS, { sx: 0.03, sy: 0.03, sz: 0.03 });
  K.box(K.G.extra, f, 0.38, 0.95, lz + 0.052, 0.012, 0.025, 0.004, [0.02, 0.02, 0.02], { ao: 0 });
  K.amesh(B.cyl(8), f, 0, 1.5, lz + 0.045, ATL.BRASS, { rx: HP, sx: 0.013, sy: 0.012, sz: 0.013 });
  if (num) {
    K.abox(f, 0, 1.64, lz + 0.046, 0.21, 0.09, 0.008, WHITE, ATL.BRASS, { ao: 0 });
    for (let i = 0; i < num.length; i++) {
      const d = ATL.digit(Number(num[i]));
      K.fquad(f, (i - (num.length - 1) / 2) * 0.052, 1.64, lz + 0.0505, 0.046, 0.07, inset(ATL.rect(d[0], d[1]), 0.06));
    }
  }
}

// Elevador art déco com portas de latão e mostrador.
export function elevator(K, sl) {
  const f = new Frame(sl.fx, sl.fz, Math.atan2(sl.nx, sl.nz));
  const m = COL.marbleDark;
  for (const s of [-1, 1]) K.box(K.G.extra, f, s * 0.78, 1.3, 0.05, 0.28, 2.6, 0.1, m);
  K.box(K.G.extra, f, 0, 2.48, 0.05, 1.84, 0.36, 0.1, m, { ao: 0 });
  for (const s of [-1, 1]) {
    K.abox(f, s * 0.32, 1.13, 0.025, 0.63, 2.26, 0.03, [0.8, 0.72, 0.58], ATL.BRASS);
    for (let i = 0; i < 3; i++) K.box(K.G.extra, f, s * (0.12 + i * 0.18), 1.13, 0.042, 0.012, 2.1, 0.004, [0.05, 0.04, 0.03], { ao: 0 });
  }
  K.box(K.G.extra, f, 0, 1.13, 0.043, 0.01, 2.26, 0.004, [0.02, 0.02, 0.02], { ao: 0 });
  K.fquad(f, 0, 2.48, 0.102, 0.4, 0.3, inset(ATL.rect(...ATL.DIAL), 0.02));
  K.abox(f, 0.82, 1.2, 0.105, 0.09, 0.2, 0.01, WHITE, ATL.BRASS, { ao: 0 });
  K.amesh(B.cyl(8), f, 0.82, 1.24, 0.112, ATL.RED, { rx: HP, sx: 0.016, sy: 0.012, sz: 0.016 });
}

// Grade de alto-falante alta na parede.
export function speaker(K, f, lx, y) {
  K.box(K.G.prop, f, lx, y, 0.03, 0.42, 0.42, 0.06, COL.dark, { ao: 0 });
  K.fquad(f, lx, y, 0.062, 0.36, 0.36, inset(ATL.rect(...ATL.GRILLE), 0.02));
}

// ------------------------------------------------------------ recepção
// Balcão da recepção (frente = +z). Retorna colisores.
export function receptionDesk(K, x, z, len) {
  const f = new Frame(x, z, 0);
  const w = K.G.prop;
  const d = 0.72;
  const h = 1.08;
  K.box(w, f, 0, h / 2, 0, len, h, d, COL.mahog);
  K.box(w, f, 0, 0.06, 0.03, len + 0.04, 0.12, d + 0.04, COL.dark);
  K.box(w, f, 0, h + 0.03, 0.03, len + 0.12, 0.06, d + 0.16, COL.walnut, { ao: 0 });
  K.box(K.G.extra, f, 0, h + 0.063, 0.02, len - 0.3, 0.006, d - 0.12, [0.08, 0.2, 0.12], { ao: 0 });
  // painéis almofadados e filetes dourados na frente
  const n = Math.round(len / 0.8);
  for (let i = 0; i < n; i++) {
    const lx = ((i + 0.5) / n - 0.5) * len;
    K.box(w, f, lx, 0.58, d / 2 + 0.012, len / n - 0.16, 0.7, 0.02, tint(COL.mahog, 1.25), { ao: 0 });
    K.abox(f, lx, 0.58, d / 2 + 0.024, 0.03, 0.4, 0.006, WHITE, ATL.GOLD, { ao: 0 });
  }
  K.abox(f, 0, 0.98, d / 2 + 0.01, len, 0.04, 0.03, WHITE, ATL.GOLD, { ao: 0 });
  // campainha, livro de hóspedes e porta-canetas
  K.amesh(B.lathe('bell', BELL), f, -0.9, h + 0.066, 0.12, ATL.BRASS, { sx: 1.3, sy: 1.3, sz: 1.3 });
  K.box(K.G.extra, f, -0.25, h + 0.075, 0.08, 0.5, 0.02, 0.34, [0.8, 0.77, 0.68], { rot: -0.08, ao: 0 });
  K.box(K.G.extra, f, -0.25, h + 0.07, 0.08, 0.52, 0.012, 0.36, [0.2, 0.06, 0.05], { rot: -0.08, ao: 0 });
  K.box(K.G.extra, f, -0.25, h + 0.087, 0.08, 0.004, 0.008, 0.32, [0.3, 0.25, 0.2], { rot: -0.08, ao: 0 });
  K.amesh(B.cyl(8), f, 0.55, h + 0.11, -0.1, ATL.BRASS, { sx: 0.035, sy: 0.09, sz: 0.035 });
  return [f.aabb(len / 2 + 0.06, d / 2 + 0.08)];
}

// Quadro de chaves (escaninhos) na parede (frame: +z para fora). Todas as
// chaves têm o mesmo número.
export function keyRack(K, f, num) {
  const w = K.G.prop;
  const W = 2.4;
  const Hh = 1.2;
  const y0 = 1.3;
  K.box(w, f, 0, y0 + Hh / 2, 0.11, W, Hh, 0.22, COL.walnut);
  K.box(w, f, 0, y0 + Hh + 0.05, 0.13, W + 0.14, 0.1, 0.27, COL.dark, { ao: 0 });
  K.box(w, f, 0, y0 - 0.04, 0.13, W + 0.08, 0.08, 0.26, COL.dark, { ao: 0 });
  const cols = 12;
  const rows = 5;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const lx = ((c + 0.5) / cols - 0.5) * (W - 0.1);
      const ly = y0 + 0.08 + ((r + 0.5) / rows) * (Hh - 0.16);
      K.box(K.G.extra, f, lx, ly, 0.222, W / cols - 0.035, Hh / rows - 0.05, 0.004, [0.03, 0.02, 0.015], { ao: 0 });
      if ((c * 7 + r * 3) % 5 !== 0) {
        K.abox(f, lx, ly + 0.02, 0.235, 0.012, 0.06, 0.012, WHITE, ATL.BRASS, { ao: 0 });
        K.fquad(f, lx, ly - 0.04, 0.236, 0.06, 0.04, inset(ATL.rect(...ATL.FOB), 0.05));
      }
    }
  }
  // placa RECEPÇÃO e relógios
  K.fquad(f, 0, y0 + Hh + 0.42, 0.03, 1.6, 0.4, inset(ATL.rect(ATL.SIGN_DESK[0], ATL.SIGN_DESK[1], 4, 1), 0.01));
  for (const s of [-1, 1]) {
    K.box(w, f, s * 1.62, 2.15, 0.03, 0.4, 0.4, 0.06, COL.dark, { ao: 0 });
    K.fquad(f, s * 1.62, 2.15, 0.062, 0.34, 0.34, inset(ATL.rect(...ATL.CLOCK), 0.02));
  }
  void num;
}

// ------------------------------------------------------------ caldeiras
// Caldeira horizontal (eixo ao longo do z local; frente em +z).
export function boiler(K, f, len, R) {
  const g = K.G.extra;
  const cy = R + 0.48;
  K.box(g, f, 0, 0.24, 0, R * 2 + 0.3, 0.48, len + 0.1, COL.brick);
  K.mesh(g, B.cyl(18), f, 0, cy, 0, { rx: HP, sx: R, sy: len, sz: R, col: COL.insul });
  for (let i = 0; i <= 5; i++) {
    const lz = (i / 5 - 0.5) * (len - 0.2);
    K.amesh(B.cyl(18), f, 0, cy, lz, ATL.IRON, { rx: HP, sx: R + 0.025, sy: 0.07, sz: R + 0.025, col: [1.6, 1.6, 1.6] });
  }
  // tampo frontal de ferro com escotilha, manômetros e porta da fornalha
  K.amesh(B.cyl(18), f, 0, cy, len / 2 + 0.04, ATL.IRON, { rx: HP, sx: R * 1.03, sy: 0.1, sz: R * 1.03, col: [1.9, 1.85, 1.75] });
  K.amesh(B.cyl(12), f, 0, cy + 0.35, len / 2 + 0.12, ATL.IRON, { rx: HP, sx: 0.28, sy: 0.08, sz: 0.28, col: [0.8, 0.8, 0.8] });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    K.amesh(B.sph(4, 3), f, Math.cos(a) * 0.24, cy + 0.35 + Math.sin(a) * 0.24, len / 2 + 0.165, ATL.BRASS, {
      sx: 0.02,
      sy: 0.02,
      sz: 0.02,
    });
  }
  K.abox(f, 0, 0.72, len / 2 + 0.12, 0.7, 0.5, 0.08, [0.7, 0.7, 0.7], ATL.IRON);
  K.abox(f, 0.25, 0.72, len / 2 + 0.17, 0.08, 0.05, 0.05, WHITE, ATL.BRASS, { ao: 0 });
  for (const s of [-1, 1]) {
    K.amesh(B.cyl(12), f, s * 0.55, cy + 0.55, len / 2 + 0.11, ATL.BRASS, { rx: HP, sx: 0.12, sy: 0.04, sz: 0.12 });
    K.fquad(f, s * 0.55, cy + 0.55, len / 2 + 0.132, 0.2, 0.2, inset(ATL.rect(...ATL.GAUGE), 0.03));
  }
  // domo de vapor e saída para o teto
  K.mesh(g, B.cyl(14), f, 0, cy + R + 0.12, len * 0.25, { sx: 0.32, sy: 0.4, sz: 0.32, col: COL.insul });
  K.amesh(B.dome(), f, 0, cy + R + 0.32, len * 0.25, ATL.IRON, { sx: 0.32, sy: 0.18, sz: 0.32 });
}

// Riser da válvula (cano vertical até o teto, corpo de ferro) — o volante é dinâmico.
export function valveRiser(K, x, z, H, y, nx, nz) {
  const f = new Frame(x, z, Math.atan2(nx, nz));
  K.mesh(K.G.extra, B.cyl(10), f, 0, H / 2, -0.12, { sx: 0.09, sy: H, sz: 0.09, col: COL.insul });
  for (const yy of [0.5, y - 0.2, y + 0.2, H - 0.3]) K.amesh(B.cyl(10), f, 0, yy, -0.12, ATL.IRON, { sx: 0.12, sy: 0.04, sz: 0.12 });
  K.abox(f, 0, y, -0.02, 0.2, 0.22, 0.18, [0.8, 0.8, 0.8], ATL.IRON);
  K.amesh(B.cyl(8), f, 0, y, 0.08, ATL.IRON, { rx: HP, sx: 0.025, sy: 0.12, sz: 0.025 });
  K.amesh(B.cyl(10), f, 0, y + 0.55, 0.0, ATL.IRON, { rx: HP, sx: 0.05, sy: 0.08, sz: 0.05 });
}

// Monte de carvão com tábuas e pá.
export function coalHeap(K, x, z, rot) {
  const f = new Frame(x, z, rot);
  K.mesh(K.G.extra, B.cone(0.15, 9), f, 0, 0.45, 0, { sx: 1.25, sy: 0.9, sz: 1.0, col: COL.coal });
  const rnd = mulberry32(Math.floor(x * 31 + z * 17) >>> 0);
  for (let i = 0; i < 26; i++) {
    const a = rnd() * TAU;
    const r = 0.9 + rnd() * 0.7;
    K.mesh(K.G.extra, B.ico(), f, Math.cos(a) * r, 0.05, Math.sin(a) * r * 0.8, {
      sx: 0.06 + rnd() * 0.05,
      sy: 0.05,
      sz: 0.06 + rnd() * 0.05,
      ry: rnd() * 3,
      col: COL.coal,
    });
  }
  K.box(K.G.prop, f, 0, 0.45, -1.05, 2.8, 0.9, 0.08, [0.3, 0.2, 0.12]);
  for (const s of [-1, 1]) K.box(K.G.prop, f, s * 1.4, 0.45, -0.4, 0.08, 0.9, 1.3, [0.3, 0.2, 0.12]);
  K.box(K.G.prop, f, 1.0, 0.6, 0.6, 0.04, 1.1, 0.04, [0.45, 0.32, 0.18], { rot: 0.2 });
  K.abox(f, 1.0, 0.07, 0.75, 0.24, 0.02, 0.28, [0.6, 0.6, 0.6], ATL.IRON, { rot: 0.2 });
  return [f.aabb(1.45, 1.1)];
}

// Bancada de ferramentas encostada na parede.
export function workbench(K, f, lx) {
  const w = K.G.prop;
  K.box(w, f, lx, 0.88, 0.35, 2.0, 0.06, 0.7, [0.4, 0.27, 0.15], { ao: 0 });
  for (const s of [-1, 1]) for (const d of [0.05, 0.64]) K.box(w, f, lx + s * 0.95, 0.43, d, 0.07, 0.86, 0.07, [0.3, 0.2, 0.11]);
  K.box(w, f, lx, 0.2, 0.35, 1.9, 0.03, 0.6, [0.3, 0.2, 0.11], { ao: 0 });
  K.abox(f, lx - 0.7, 0.98, 0.5, 0.18, 0.14, 0.12, [0.5, 0.6, 0.55], ATL.IRON);
  K.abox(f, lx + 0.3, 0.93, 0.35, 0.36, 0.04, 0.05, WHITE, ATL.RED, { rot: 0.4 });
  K.abox(f, lx + 0.6, 0.93, 0.45, 0.3, 0.03, 0.04, [0.7, 0.7, 0.7], ATL.IRON, { rot: -0.3 });
  // painel de ferramentas
  K.box(w, f, lx, 1.65, 0.02, 1.9, 0.9, 0.03, [0.38, 0.32, 0.22]);
  for (let i = 0; i < 6; i++)
    K.abox(f, lx - 0.75 + i * 0.3, 1.6 + (i % 2) * 0.1, 0.05, 0.05, 0.4 - (i % 3) * 0.08, 0.02, [0.7, 0.7, 0.7], ATL.IRON);
  return f.aabb(1.0, 0.36, lx, 0.35);
}

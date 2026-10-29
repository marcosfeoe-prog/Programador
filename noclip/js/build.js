// Geometria estática: faces da grade (paredes por "corridas" gulosas, piso,
// teto, vergas), atlas do lightmap, rodapés, decalques e um montador de props.
import * as THREE from 'three';
import { WALL, LINTEL } from './grid.js';

export const K_FLOOR = 0, K_WALL = 1, K_CEIL = 2, K_SOFFIT = 3;

const UP = [0, 1, 0];

function quad(o, u, v, lu, lv, n, kind, extra = {}) {
  return { o, u, v, lu, lv, n, kind, ...extra };
}

// ------------------------------------------------------------- extração --
export function extractQuads(grid) {
  const { w, h, cs, H, doorH } = grid;
  const quads = [];
  const key = (a, b) => {
    // a = lado sólido, b = lado aberto → [y0, y1] ou null
    if (b === WALL) return null;
    if (a === WALL) return b === LINTEL ? [0, doorH] : [0, H];
    if (a === LINTEL && b !== LINTEL) return [doorH, H];
    return null;
  };
  // faces ±x: percorre linhas entre colunas cx e cx+1
  for (let cx = -1; cx < w; cx++) {
    for (const dir of [1, -1]) {
      let run = null;
      const flush = () => {
        if (!run) return;
        const x = (cx + 1) * cs;
        const [y0, y1] = run.k;
        const z0 = run.a * cs, z1 = (run.b + 1) * cs;
        if (dir === 1) quads.push(quad([x, y0, z1], [0, 0, -1], UP, z1 - z0, y1 - y0, [1, 0, 0], K_WALL, { base: y0 === 0 }));
        else quads.push(quad([x, y0, z0], [0, 0, 1], UP, z1 - z0, y1 - y0, [-1, 0, 0], K_WALL, { base: y0 === 0 }));
        run = null;
      };
      for (let cz = 0; cz < h; cz++) {
        const sol = dir === 1 ? grid.get(cx, cz) : grid.get(cx + 1, cz);
        const opn = dir === 1 ? grid.get(cx + 1, cz) : grid.get(cx, cz);
        const inb = dir === 1 ? grid.inside(cx + 1, cz) : grid.inside(cx, cz);
        const k = inb ? key(sol, opn) : null;
        if (k && run && run.k[0] === k[0] && run.k[1] === k[1]) run.b = cz;
        else {
          flush();
          if (k) run = { k, a: cz, b: cz };
        }
      }
      flush();
    }
  }
  // faces ±z
  for (let cz = -1; cz < h; cz++) {
    for (const dir of [1, -1]) {
      let run = null;
      const flush = () => {
        if (!run) return;
        const z = (cz + 1) * cs;
        const [y0, y1] = run.k;
        const x0 = run.a * cs, x1 = (run.b + 1) * cs;
        if (dir === 1) quads.push(quad([x0, y0, z], [1, 0, 0], UP, x1 - x0, y1 - y0, [0, 0, 1], K_WALL, { base: y0 === 0 }));
        else quads.push(quad([x1, y0, z], [-1, 0, 0], UP, x1 - x0, y1 - y0, [0, 0, -1], K_WALL, { base: y0 === 0 }));
        run = null;
      };
      for (let cx = 0; cx < w; cx++) {
        const sol = dir === 1 ? grid.get(cx, cz) : grid.get(cx, cz + 1);
        const opn = dir === 1 ? grid.get(cx, cz + 1) : grid.get(cx, cz);
        const inb = dir === 1 ? grid.inside(cx, cz + 1) : grid.inside(cx, cz);
        const k = inb ? key(sol, opn) : null;
        if (k && run && run.k[0] === k[0] && run.k[1] === k[1]) run.b = cx;
        else {
          flush();
          if (k) run = { k, a: cx, b: cx };
        }
      }
      flush();
    }
  }
  // vergas: face de baixo
  for (let cz = 0; cz < h; cz++) {
    let a = -1;
    for (let cx = 0; cx <= w; cx++) {
      const is = cx < w && grid.get(cx, cz) === LINTEL;
      if (is && a < 0) a = cx;
      if (!is && a >= 0) {
        quads.push(quad([a * cs, doorH, cz * cs], [1, 0, 0], [0, 0, 1], (cx - a) * cs, cs, [0, -1, 0], K_SOFFIT));
        a = -1;
      }
    }
  }
  // piso e teto em blocos de 16 m (atlas mais fácil de empacotar)
  const T = 16;
  for (let z0 = 0; z0 < h * cs; z0 += T)
    for (let x0 = 0; x0 < w * cs; x0 += T) {
      const lx = Math.min(T, w * cs - x0), lz = Math.min(T, h * cs - z0);
      if (!blockHasOpen(grid, x0, z0, lx, lz)) continue;
      quads.push(quad([x0, 0, z0 + lz], [1, 0, 0], [0, 0, -1], lx, lz, [0, 1, 0], K_FLOOR));
      quads.push(quad([x0, H, z0], [1, 0, 0], [0, 0, 1], lx, lz, [0, -1, 0], K_CEIL));
    }
  return quads;
}

function blockHasOpen(grid, x0, z0, lx, lz) {
  const c0 = grid.cell(x0), c1 = grid.cell(x0 + lx - 1e-3), r0 = grid.cell(z0), r1 = grid.cell(z0 + lz - 1e-3);
  for (let z = r0; z <= r1; z++) for (let x = c0; x <= c1; x++) if (grid.get(x, z) !== WALL) return true;
  return false;
}

// ---------------------------------------------------------------- atlas --
export function packCharts(quads, tpm) {
  let area = 0, maxw = 0;
  for (const q of quads) {
    const d = q.kind === K_CEIL ? 0.6 : 1; // teto recebe só luz indireta: menos texels
    q.nu = Math.max(2, Math.ceil(q.lu * tpm * d));
    q.nv = Math.max(2, Math.ceil(q.lv * tpm * d));
    q.cw = q.nu + 2;
    q.ch = q.nv + 2;
    area += q.cw * q.ch;
    maxw = Math.max(maxw, q.cw);
  }
  let W = 256;
  while (W * W < area * 1.25 || W < maxw) W *= 2;
  W = Math.min(W, 8192);
  const order = quads.map((q, i) => i).sort((a, b) => quads[b].ch - quads[a].ch || quads[b].cw - quads[a].cw);
  let x = 0, y = 0, sh = 0;
  for (const i of order) {
    const q = quads[i];
    if (x + q.cw > W) {
      x = 0;
      y += sh;
      sh = 0;
    }
    q.ax = x;
    q.ay = y;
    x += q.cw;
    sh = Math.max(sh, q.ch);
  }
  return { W, H: y + sh };
}

// uv do lightmap de um ponto local (s, t em metros) da face
export function chartUV(q, atlas, s, t) {
  return [(q.ax + 1 + (s / q.lu) * q.nu) / atlas.W, (q.ay + 1 + (t / q.lv) * q.nv) / atlas.H];
}

// ------------------------------------------------------------ geometria --
export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nrm = [];
    this.uv = [];
    this.uv1 = [];
    this.col = null;
    this.idx = [];
  }
  get count() {
    return this.pos.length / 3;
  }
  vert(p, n, uv, uv1) {
    this.pos.push(p[0], p[1], p[2]);
    this.nrm.push(n[0], n[1], n[2]);
    this.uv.push(uv[0], uv[1]);
    if (uv1) this.uv1.push(uv1[0], uv1[1]);
    return this.count - 1;
  }
  // quad com vértices p0..p3 (ordem qualquer em volta); vira para a normal n
  quad(p, n, uvs, uv1s) {
    const b = this.count;
    for (let i = 0; i < 4; i++) this.vert(p[i], n, uvs[i], uv1s && uv1s[i]);
    const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2];
    const bx = p[2][0] - p[0][0], by = p[2][1] - p[0][1], bz = p[2][2] - p[0][2];
    const cx = ay * bz - az * by, cy = az * bx - ax * bz, cz = ax * by - ay * bx;
    if (cx * n[0] + cy * n[1] + cz * n[2] >= 0) this.idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    else this.idx.push(b, b + 2, b + 1, b, b + 3, b + 2);
  }
  // caixa alinhada (opcionalmente girada em Y) com uv em metros/escala
  box(cx, cy, cz, sx, sy, sz, { rot = 0, uvs = 1, skip = '' } = {}) {
    const c = Math.cos(rot), s = Math.sin(rot);
    const T = (x, y, z) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const R = (n) => [n[0] * c + n[2] * s, n[1], -n[0] * s + n[2] * c];
    const hx = sx / 2, hy = sy / 2, hz = sz / 2;
    const F = [
      ['px', [1, 0, 0], [[hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]], sz, sy],
      ['nx', [-1, 0, 0], [[-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]], sz, sy],
      ['py', [0, 1, 0], [[-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]], sx, sz],
      ['ny', [0, -1, 0], [[-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]], sx, sz],
      ['pz', [0, 0, 1], [[-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]], sx, sy],
      ['nz', [0, 0, -1], [[hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]], sx, sy],
    ];
    for (const [name, n, pts, a, b] of F) {
      if (skip.includes(name)) continue;
      const ua = a / uvs, vb = b / uvs;
      this.quad(pts.map((p) => T(p[0], p[1], p[2])), R(n), [[0, 0], [ua, 0], [ua, vb], [0, vb]]);
    }
  }
  // mescla uma BufferGeometry do three com uma matriz
  add(geo, m) {
    const g = geo.index ? geo : geo;
    const p = g.attributes.position, n = g.attributes.normal, t = g.attributes.uv;
    const b = this.count;
    const v = new THREE.Vector3(), nn = new THREE.Vector3();
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(m);
      if (n) nn.fromBufferAttribute(n, i).applyMatrix3(nm).normalize();
      else nn.set(0, 1, 0);
      this.pos.push(v.x, v.y, v.z);
      this.nrm.push(nn.x, nn.y, nn.z);
      this.uv.push(t ? t.getX(i) : 0, t ? t.getY(i) : 0);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.idx.push(b + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.idx.push(b + i);
    if (m.determinant() < 0) {
      for (let i = this.idx.length - (g.index ? g.index.count : p.count); i < this.idx.length; i += 3) {
        const tmp = this.idx[i + 1];
        this.idx[i + 1] = this.idx[i + 2];
        this.idx[i + 2] = tmp;
      }
    }
  }
  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    if (this.uv1.length) g.setAttribute('uv1', new THREE.Float32BufferAttribute(this.uv1, 2));
    if (this.col) g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const at = (q, s, t) => [q.o[0] + q.u[0] * s + q.v[0] * t, q.o[1] + q.u[1] * s + q.v[1] * t, q.o[2] + q.u[2] * s + q.v[2] * t];

// Geometria das faces de um tipo, com uv0 em metros/escala e uv1 do atlas.
export function quadsGeometry(quads, atlas, kinds, scale) {
  const gb = new GeoBuilder();
  for (const q of quads) {
    if (!kinds.includes(q.kind)) continue;
    const P = [at(q, 0, 0), at(q, q.lu, 0), at(q, q.lu, q.lv), at(q, 0, q.lv)];
    const su = Array.isArray(scale) ? scale[0] : scale, sv = Array.isArray(scale) ? scale[1] : scale;
    const uv = P.map((p) => [dot(p, q.u) / su, dot(p, q.v) / sv]);
    const L = [chartUV(q, atlas, 0, 0), chartUV(q, atlas, q.lu, 0), chartUV(q, atlas, q.lu, q.lv), chartUV(q, atlas, 0, q.lv)];
    gb.quad(P, q.n, uv, L);
  }
  return gb.build();
}

// Rodapé ao longo das paredes que tocam o chão.
export function baseboardGeometry(quads, atlas, bh = 0.1, t = 0.014) {
  const gb = new GeoBuilder();
  for (const q of quads) {
    if (q.kind !== K_WALL || !q.base) continue;
    const off = (p) => [p[0] + q.n[0] * t, p[1] + q.n[1] * t, p[2] + q.n[2] * t];
    const a0 = at(q, 0, 0), a1 = at(q, q.lu, 0), a2 = at(q, q.lu, bh), a3 = at(q, 0, bh);
    const uvF = [a0, a1, a2, a3].map((p) => [dot(p, q.u) / 0.8, p[1] / 0.8]);
    const L = [chartUV(q, atlas, 0, 0.02), chartUV(q, atlas, q.lu, 0.02), chartUV(q, atlas, q.lu, bh), chartUV(q, atlas, 0, bh)];
    gb.quad([off(a0), off(a1), off(a2), off(a3)], q.n, uvF, L);
    gb.quad([a3, a2, off(a2), off(a3)], [0, 1, 0], uvF, [L[3], L[2], L[2], L[3]]);
  }
  return gb.build();
}

// Decalques planos sobre faces (manchas, desenhos, números): iluminados pelo
// mesmo lightmap da face (uv1 calculado a partir do chart).
export function decalGeometry(decals, atlas) {
  const gb = new GeoBuilder();
  for (const d of decals) {
    const q = d.q;
    const c = Math.cos(d.rot || 0), s = Math.sin(d.rot || 0);
    const corners = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([a, b]) => {
      const ls = (a * d.w) / 2, lt = (b * d.h) / 2;
      return [d.s + ls * c - lt * s, d.t + ls * s + lt * c];
    });
    const o = d.off ?? 0.004;
    const P = corners.map(([ss, tt]) => {
      const p = at(q, ss, tt);
      return [p[0] + q.n[0] * o, p[1] + q.n[1] * o, p[2] + q.n[2] * o];
    });
    const [u0, v0, u1, v1] = d.rect;
    const uv = [
      [u0, v0],
      [u1, v0],
      [u1, v1],
      [u0, v1],
    ];
    const L = corners.map(([ss, tt]) => chartUV(q, atlas, Math.max(0, Math.min(q.lu, ss)), Math.max(0, Math.min(q.lv, tt))));
    gb.quad(P, q.n, uv, L);
  }
  return gb.build();
}

// Acha uma face de parede onde caiba um retângulo w x h a altura t (para decalques).
export function wallSpot(quads, r, w, near = null, maxDist = Infinity) {
  for (let k = 0; k < 400; k++) {
    const q = quads[Math.floor(r() * quads.length)];
    if (q.kind !== K_WALL || q.lu < w + 0.2 || !q.base) continue;
    const s = w / 2 + 0.1 + r() * (q.lu - w - 0.2);
    if (near) {
      const p = at(q, s, 1);
      if (Math.hypot(p[0] - near.x, p[2] - near.z) > maxDist) continue;
    }
    return { q, s };
  }
  return null;
}

export const quadPoint = at;

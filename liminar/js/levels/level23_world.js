// Nível 23 — forma do mundo (relevo e trilha, idênticos em JS e GLSL) e os
// geradores de geometria orgânica: troncos colossais trançados, raízes em arco,
// pontes de galhos, árvores petrificadas, troncos caídos, pedras (algumas
// flutuando), fungos, musgo pendente e feixes de luz.
import * as THREE from 'three';
import { hash3, mulberry32, clamp, vnoise } from '../util.js';

export const TAU = Math.PI * 2;
export const CELL = 48; // célula de um tronco colossal
export const BASE_DIST = 158; // distância da chegada até o centro do tronco da base
export const RO = 7; // raio externo do tronco da base

const UP = new THREE.Vector3(0, 1, 0);
const XA = new THREE.Vector3(1, 0, 0);
const sstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

function rawH(x, z) {
  return (
    2.2 * Math.sin(x * 0.021 + 0.7) * Math.sin(z * 0.017 + 1.9) +
    1.1 * Math.sin(x * 0.047 - z * 0.033) +
    0.5 * Math.sin(z * 0.071 + x * 0.029 + 2.3)
  );
}

// Mesmas funções no shader (uniformes em World.uniforms).
export const WORLD_GLSL = /* glsl */ `
uniform vec3 uBase;
uniform vec4 uTrail;
uniform vec2 uTrailK;
float rawH( vec2 p ) {
  return 2.2 * sin( p.x * 0.021 + 0.7 ) * sin( p.y * 0.017 + 1.9 )
       + 1.1 * sin( p.x * 0.047 - p.y * 0.033 )
       + 0.5 * sin( p.y * 0.071 + p.x * 0.029 + 2.3 );
}
float terrainH( vec2 p ) {
  return mix( uBase.z, rawH( p ), smoothstep( 10.0, 26.0, distance( p, uBase.xy ) ) );
}
float trailD( vec2 p ) {
  vec2 d = uTrail.zw - uTrail.xy;
  float L = length( d );
  vec2 dir = d / L;
  vec2 q = p - uTrail.xy;
  float t = dot( q, dir ) / L;
  float tc = clamp( t, 0.0, 1.0 );
  float lat = dot( q, vec2( -dir.y, dir.x ) );
  float off = sin( tc * 6.2831853 + uTrailK.x ) * uTrailK.y * sin( tc * 3.14159265 );
  return length( vec2( lat - off, ( t - tc ) * L ) );
}
float vHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
float vNoise( vec2 p ) {
  vec2 i = floor( p ); vec2 f = fract( p );
  f = f * f * ( 3.0 - 2.0 * f );
  return mix( mix( vHash( i ), vHash( i + vec2( 1.0, 0.0 ) ), f.x ), mix( vHash( i + vec2( 0.0, 1.0 ) ), vHash( i + vec2( 1.0, 1.0 ) ), f.x ), f.y );
}
`;

// Relevo, trilha da chegada até a base e posição de tudo que é fixo.
export class World {
  constructor(seed) {
    const rnd = mulberry32(seed * 3 + 23);
    this.seed = seed;
    const a = rnd() * TAU;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    this.sx = 0;
    this.sz = 0;
    this.bx = dx * BASE_DIST;
    this.bz = dz * BASE_DIST;
    this.hb = rawH(this.bx, this.bz);
    // a trilha termina diante da porta (a porta olha para a chegada)
    this.ex = this.bx - dx * (RO + 3.2);
    this.ez = this.bz - dz * (RO + 3.2);
    this.ph = rnd() * TAU;
    this.amp = 7;
    this.L = Math.hypot(this.ex - this.sx, this.ez - this.sz);
    this.ux = (this.ex - this.sx) / this.L;
    this.uz = (this.ez - this.sz) / this.L;
    this.nx = -this.uz;
    this.nz = this.ux;
    this.specs = new Map();
    this.uniforms = {
      uBase: { value: new THREE.Vector3(this.bx, this.bz, this.hb) },
      uTrail: { value: new THREE.Vector4(this.sx, this.sz, this.ex, this.ez) },
      uTrailK: { value: new THREE.Vector2(this.ph, this.amp) },
    };
  }

  h(x, z) {
    return this.hb + (rawH(x, z) - this.hb) * sstep(10, 26, Math.hypot(x - this.bx, z - this.bz));
  }

  trailOff(t) {
    return Math.sin(t * TAU + this.ph) * this.amp * Math.sin(t * Math.PI);
  }

  trailPoint(t) {
    const o = this.trailOff(t);
    return { x: this.sx + this.ux * this.L * t + this.nx * o, z: this.sz + this.uz * this.L * t + this.nz * o };
  }

  trailDist(x, z) {
    const qx = x - this.sx;
    const qz = z - this.sz;
    const t = (qx * this.ux + qz * this.uz) / this.L;
    const tc = clamp(t, 0, 1);
    const lat = qx * this.nx + qz * this.nz;
    return Math.hypot(lat - this.trailOff(tc), (t - tc) * this.L);
  }

  baseDist(x, z) {
    return Math.hypot(x - this.bx, z - this.bz);
  }

  // Tronco colossal da célula (ci, cj), ou null. Determinístico.
  colossus(ci, cj) {
    const key = ci * 100000 + cj;
    if (this.specs.has(key)) return this.specs.get(key);
    if (this.specs.size > 4000) this.specs.clear();
    const h = (k) => hash3(ci * 7 + k, cj * 13 - k * 3, this.seed + 77);
    let s = null;
    if (h(0) < 0.74) {
      const x = (ci + 0.2 + h(1) * 0.6) * CELL;
      const z = (cj + 0.2 + h(2) * 0.6) * CELL;
      const R0 = 1.9 + h(3) * 1.7;
      const ns = 2 + Math.floor(h(4) * 2.99);
      const spread = R0 * (ns === 2 ? 0.85 : 1.05);
      const foot = spread + R0 * 1.9;
      const ok =
        this.trailDist(x, z) > foot + 5 && this.baseDist(x, z) > RO + foot + 16 && Math.hypot(x - this.sx, z - this.sz) > foot + 12;
      if (ok) {
        s = {
          ci,
          cj,
          x,
          z,
          R0,
          ns,
          spread,
          foot,
          y0: this.h(x, z),
          H: 58 + h(5) * 34,
          tw: (h(6) < 0.5 ? -1 : 1) * (0.03 + h(7) * 0.04),
          lean: [(h(8) - 0.5) * 0.22, (h(9) - 0.5) * 0.22],
          ph: h(10) * TAU,
          seed: Math.floor(h(11) * 1e9),
        };
      }
    }
    this.specs.set(key, s);
    return s;
  }

  // Eixo do tronco colossal na altura y (relativa ao pé).
  axisAt(s, y) {
    return [
      s.x + s.lean[0] * y + (Math.sin(y * 0.045 + s.ph) - Math.sin(s.ph)) * 2.5,
      s.z + s.lean[1] * y + (Math.cos(y * 0.038 + s.ph) - Math.cos(s.ph)) * 2.5,
    ];
  }

  // Ponto do fio k do tronco colossal na altura y.
  strandAt(s, k, y) {
    const a = s.ph + (k * TAU) / s.ns + s.tw * y;
    const sr = s.spread * (1 + 0.22 * Math.sin(y * 0.06 + k * 2.1));
    const [ax, az] = this.axisAt(s, y);
    return [ax + Math.cos(a) * sr, s.y0 + y, az + Math.sin(a) * sr, a];
  }
}

// ------------------------------------------------------------ geometria
const _T = new THREE.Vector3();
const _N = new THREE.Vector3();
const _B = new THREE.Vector3();
const _D = new THREE.Vector3();
const _a = new THREE.Vector3();
const _b = new THREE.Vector3();

// Tubo orgânico ao longo de uma polilinha, com referenciais transportados
// (sem torção), raio ondulado (caneluras) e tampas opcionais.
// o: { sides, col: [r,g,b] | (t) => [r,g,b], g, bump, seed, uScale, vScale, capA, capB, capCol }
export function sweep(gb, pts, rad, o) {
  const n = pts.length;
  if (n < 2) return;
  const sides = o.sides;
  const g = o.g || 0;
  const bump = o.bump || 0;
  const sd = o.seed || 0;
  _T.set(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1], pts[1][2] - pts[0][2]).normalize();
  _N.crossVectors(_T, Math.abs(_T.y) < 0.95 ? UP : XA).normalize();
  let r0 = 0;
  for (const r of rad) r0 = Math.max(r0, r);
  const uRep = Math.max(1, Math.round((TAU * r0) / (o.uScale || 2.5)));
  const vS = o.vScale || 2.5;
  const base = gb.n;
  let len = 0;
  for (let i = 0; i < n; i++) {
    const p = pts[i];
    if (i > 0) len += Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1], p[2] - pts[i - 1][2]);
    const pa = pts[Math.max(0, i - 1)];
    const pb = pts[Math.min(n - 1, i + 1)];
    _T.set(pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]).normalize();
    _N.addScaledVector(_T, -_N.dot(_T)).normalize();
    _B.crossVectors(_T, _N);
    const r = rad[i];
    const c = typeof o.col === 'function' ? o.col(i / (n - 1)) : o.col;
    for (let s = 0; s <= sides; s++) {
      const ang = (s / sides) * TAU;
      const cs = Math.cos(ang);
      const sn = Math.sin(ang);
      const k = bump ? 1 + bump * (Math.sin(ang * 3 + sd + i * 0.37) * 0.6 + Math.sin(ang * 7 - sd * 1.7 + i * 0.9) * 0.4) : 1;
      _D.set(_N.x * cs + _B.x * sn, _N.y * cs + _B.y * sn, _N.z * cs + _B.z * sn);
      gb.vert(p[0] + _D.x * r * k, p[1] + _D.y * r * k, p[2] + _D.z * r * k, _D.x, _D.y, _D.z, (s / sides) * uRep, len / vS, 0, 0, c, g);
    }
    if ((i === 0 && o.capA) || (i === n - 1 && o.capB)) cap(gb, p, r, i === 0 ? -1 : 1, sides, o.capCol || c, g);
  }
  for (let i = 0; i < n - 1; i++) {
    const row = base + i * (sides + 1) + (i > 0 && o.capA ? sides + 2 : 0);
    const next = row + sides + 1 + (i === 0 && o.capA ? sides + 2 : 0);
    for (let s = 0; s < sides; s++) gb.idx.push(row + s, row + s + 1, next + s, row + s + 1, next + s + 1, next + s);
  }
}

// Tampa (seção transversal) na ponta do tubo, usando o referencial atual.
function cap(gb, p, r, sign, sides, col, g) {
  const nx = _T.x * sign;
  const ny = _T.y * sign;
  const nz = _T.z * sign;
  const c0 = gb.vert(p[0], p[1], p[2], nx, ny, nz, 0.5, 0.5, 0, 0, col, g);
  for (let s = 0; s <= sides; s++) {
    const ang = (s / sides) * TAU;
    const cs = Math.cos(ang);
    const sn = Math.sin(ang);
    _D.set(_N.x * cs + _B.x * sn, _N.y * cs + _B.y * sn, _N.z * cs + _B.z * sn);
    gb.vert(p[0] + _D.x * r, p[1] + _D.y * r, p[2] + _D.z * r, nx, ny, nz, 0.5 + cs * 0.4, 0.5 + sn * 0.4, 0, 0, col, g);
  }
  for (let s = 0; s < sides; s++) {
    if (sign > 0) gb.idx.push(c0, c0 + 1 + s, c0 + 2 + s);
    else gb.idx.push(c0, c0 + 2 + s, c0 + 1 + s);
  }
}

// Quadrilátero com a ordem dos vértices escolhida pela normal desejada.
export function quadN(gb, p, n, uvs, col, g = 0) {
  // normal pelas diagonais (funciona também com quads degenerados em triângulo)
  _a.set(p[2][0] - p[0][0], p[2][1] - p[0][1], p[2][2] - p[0][2]);
  _b.set(p[3][0] - p[1][0], p[3][1] - p[1][1], p[3][2] - p[1][2]);
  _a.cross(_b);
  const cols = [col, col, col, col];
  if (_a.x * n[0] + _a.y * n[1] + _a.z * n[2] >= 0) gb.quad(p, n, uvs, null, cols, g);
  else gb.quad([p[0], p[3], p[2], p[1]], n, [uvs[0], uvs[1], uvs[6], uvs[7], uvs[4], uvs[5], uvs[2], uvs[3]], null, cols, g);
}

// Pedras: icosaedros deformados por ruído, com faces planas.
export function makeRocks() {
  const list = [];
  for (let k = 0; k < 3; k++) {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    const v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      const d = 1 + 0.28 * vnoise(v.x * 2.1 + k * 7, v.y * 2.1 + v.z * 1.7, 41 + k) + 0.12 * vnoise(v.x * 5 + v.z * 3, v.y * 5, 43 + k);
      p.setXYZ(i, v.x * d, v.y * d * 0.72, v.z * d);
    }
    g.computeVertexNormals();
    list.push(g);
  }
  return list;
}

// ------------------------------------------------------------ cor da pedra-madeira
export function stoneCol(rnd) {
  const t = 0.88 + rnd() * 0.2;
  const gtint = rnd() * 0.06;
  return [0.95 * t, (0.98 + gtint) * t, 0.9 * t];
}
const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

// ------------------------------------------------------------ geradores
// ctx: { W, bark, drape, beams, circles, clears, sides:{big,mid,small}, props, rocks, rnd }
export function* buildColossus(ctx, s) {
  const { W, bark } = ctx;
  const rnd = mulberry32(s.seed);
  const base = stoneCol(rnd);
  const dark = mixc(base, [0.55, 0.58, 0.5], 0.5);
  const sides = ctx.sides.big;
  const top = [];
  for (let k = 0; k < s.ns; k++) {
    const pts = [];
    const rad = [];
    for (let y = -3; y <= s.H; y += 3) {
      const p = W.strandAt(s, k, y);
      pts.push([p[0], p[1], p[2]]);
      rad.push(s.R0 * (1 - (0.42 * Math.max(y, 0)) / s.H) * (1 + 0.85 * Math.exp(-(y + 2) / 3)));
    }
    // copa: o fio se abre para fora e para cima, afinando
    const last = pts[pts.length - 1];
    const aT = W.strandAt(s, k, s.H)[3] + (rnd() - 0.5) * 0.6;
    const rT = rad[rad.length - 1];
    for (let q = 1; q <= 6; q++) {
      pts.push([last[0] + Math.cos(aT) * q * q * 0.9, last[1] + q * 4, last[2] + Math.sin(aT) * q * q * 0.9]);
      rad.push(rT * (1 - q * 0.14));
    }
    top.push(pts[pts.length - 3]);
    const nRing = pts.length;
    sweep(bark, pts, rad, {
      sides,
      bump: 0.13,
      seed: k * 3.7 + s.ph,
      uScale: 3,
      vScale: 3,
      col: (t) => mixc(dark, base, Math.min(1, t * nRing * 0.25)),
    });
    // colisão no pé do fio
    const f = W.strandAt(s, k, 0.6);
    const rf = s.R0 * (1 + 0.85 * Math.exp(-2.6 / 3));
    ctx.circles.push([f[0], f[2], rf * 0.95]);
    // raízes
    const nr = 2 + (rnd() < 0.55 ? 1 : 0);
    for (let r = 0; r < nr; r++) {
      const ang = f[3] + (r - (nr - 1) / 2) * 0.7 + (rnd() - 0.5) * 0.5;
      root(ctx, f[0] + Math.cos(ang) * rf * 0.55, f[2] + Math.sin(ang) * rf * 0.55, ang, s.R0 * (0.4 + rnd() * 0.14), rnd, base);
    }
    yield;
  }
  ctx.clears.push([s.x, s.z, s.spread + s.R0 * 1.7]);
  // fungos e pedras flutuando ao redor do pé (a gravidade aqui é estranha)
  const nf = 2 + Math.floor(rnd() * 3 * ctx.props);
  for (let k = 0; k < nf; k++) {
    const a = rnd() * TAU;
    const d = s.spread + s.R0 * (1.5 + rnd() * 0.8);
    const x = s.x + Math.cos(a) * d;
    const z = s.z + Math.sin(a) * d;
    fungi(ctx, x, W.h(x, z), z, rnd, 4 + Math.floor(rnd() * 6));
  }
  if (rnd() < 0.45) {
    const n = 3 + Math.floor(rnd() * 6);
    const a0 = rnd() * TAU;
    for (let k = 0; k < n; k++) {
      const a = a0 + (rnd() - 0.5) * 1.6;
      const d = s.spread + s.R0 * 2 + rnd() * 6;
      const x = s.x + Math.cos(a) * d;
      const z = s.z + Math.sin(a) * d;
      if (W.trailDist(x, z) < 2) continue;
      rock(ctx, x, W.h(x, z) + 0.7 + rnd() * 2.6, z, 0.12 + rnd() * 0.35, rnd, 10 + rnd() * 6);
    }
  }
  yield;
  // pontes: galhos trançados até os vizinhos +x e +z
  for (const [di, dj] of [
    [1, 0],
    [0, 1],
  ]) {
    const o = W.colossus(s.ci + di, s.cj + dj);
    if (!o || rnd() < 0.3) continue;
    const d = Math.hypot(o.x - s.x, o.z - s.z);
    if (d > 80) continue;
    bridge(ctx, s, o, rnd, base);
  }
  // musgo pendente dos galhos altos da copa
  for (const p of top) if (rnd() < 0.7) drape(ctx, p[0], p[1] - 2, p[2], 6 + rnd() * 8, 2.5, rnd() * TAU, 0.9);
}

// Raiz que sai do tronco, às vezes em arco alto (dá para passar por baixo).
function root(ctx, x0, z0, ang, r0, rnd, col) {
  const { W } = ctx;
  const L = 9 + rnd() * 13;
  const arch = rnd() < 0.35 ? 2.6 + rnd() * 3 : rnd() * 1.1;
  const sd = rnd() * 10;
  const n = 12;
  const pts = [];
  const rad = [];
  const info = [];
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const dist = L * t;
    const wig = Math.sin(t * 4 + sd) * 1.4 * t;
    const x = x0 + ca * dist - sa * wig;
    const z = z0 + sa * dist + ca * wig;
    const yRel = 1.8 + (-2.6 - 1.8) * Math.pow(t, 1.25) + arch * Math.sin(Math.PI * Math.min(1, t * 1.1));
    const r = r0 * (1 - 0.72 * t);
    pts.push([x, W.h(x, z) + yRel, z]);
    rad.push(r);
    info.push([x, z, yRel, r]);
  }
  // não atravessa a trilha baixa nem entra na clareira da base
  for (const [x, z, y, r] of info) {
    if (W.trailDist(x, z) < r + 1.4 && y - r < 2.6) return;
    if (W.baseDist(x, z) < RO + 4) return;
  }
  sweep(ctx.bark, pts, rad, { sides: ctx.sides.mid, bump: 0.15, seed: sd, uScale: 2.5, vScale: 2.5, col });
  // colisão onde a raiz fica na altura do corpo (amostrada a cada ~0,8 m)
  for (let i = 0; i < n; i++) {
    const a = info[i];
    const b = info[i + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.8));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const y = a[2] + (b[2] - a[2]) * t;
      const r = a[3] + (b[3] - a[3]) * t;
      // meia largura da raiz na faixa de altura do corpo (0,2 a 1,7 m)
      const dy = clamp(y, 0.2, 1.7) - y;
      const hw = Math.sqrt(Math.max(0, r * r - dy * dy));
      if (hw > 0.15) ctx.circles.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, hw * 0.95]);
    }
  }
  if (rnd() < 0.5 * ctx.props) {
    const i = 5 + Math.floor(rnd() * 5);
    const [x, z, y, r] = info[i];
    fungi(ctx, x, W.h(x, z) + Math.max(0, y - r * 0.2), z, rnd, 3 + Math.floor(rnd() * 5));
  }
}

// Ponte: dois galhos que se enrolam um no outro entre dois troncos colossais.
function bridge(ctx, a, b, rnd, col) {
  const { W } = ctx;
  const ha = 14 + rnd() * 26;
  const hb = Math.max(10, ha + (rnd() - 0.5) * 16);
  const pa = W.axisAt(a, ha);
  const pb = W.axisAt(b, hb);
  const A = new THREE.Vector3(pa[0], a.y0 + ha, pa[1]);
  const B = new THREE.Vector3(pb[0], b.y0 + hb, pb[1]);
  const M = A.clone().lerp(B, 0.5);
  M.y += (rnd() < 0.5 ? -1 : 1) * (3 + rnd() * 7);
  const r = 0.8 + rnd() * 0.9;
  const n = 18;
  const tw = 1 + rnd() * 1.5;
  const T = new THREE.Vector3();
  const P1 = new THREE.Vector3();
  const P2 = new THREE.Vector3();
  const curve = (t, out) => {
    const u = 1 - t;
    return out.set(
      u * u * A.x + 2 * u * t * M.x + t * t * B.x,
      u * u * A.y + 2 * u * t * M.y + t * t * B.y,
      u * u * A.z + 2 * u * t * M.z + t * t * B.z,
    );
  };
  const p = new THREE.Vector3();
  const q = new THREE.Vector3();
  for (let j = 0; j < 2; j++) {
    const pts = [];
    const rad = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      curve(t, p);
      curve(Math.min(1, t + 0.01), q);
      T.subVectors(q, p).normalize();
      P1.crossVectors(T, UP).normalize();
      P2.crossVectors(T, P1);
      const th = j * Math.PI + t * tw * TAU;
      const off = r * 0.85;
      pts.push([
        p.x + (P1.x * Math.cos(th) + P2.x * Math.sin(th)) * off,
        p.y + (P1.y * Math.cos(th) + P2.y * Math.sin(th)) * off,
        p.z + (P1.z * Math.cos(th) + P2.z * Math.sin(th)) * off,
      ]);
      rad.push(r * (1.25 - 0.45 * Math.sin(Math.PI * t)));
    }
    sweep(ctx.bark, pts, rad, { sides: ctx.sides.mid, bump: 0.1, seed: j * 5 + ha, uScale: 2.5, vScale: 2.5, col });
  }
  // musgo pendente ao longo da ponte
  const nd = Math.floor((2 + rnd() * 4) * ctx.props);
  for (let k = 0; k < nd; k++) {
    curve(0.15 + rnd() * 0.7, p);
    drape(ctx, p.x, p.y - r * 0.8, p.z, 3 + rnd() * 9, 1.4 + rnd() * 1.2, rnd() * TAU, 0.85 + rnd() * 0.25);
  }
}

// Árvore petrificada de porte "normal" (como as das Salas da Frente).
export function buildTree(ctx, x, z, rnd) {
  const { W } = ctx;
  const y = W.h(x, z);
  const H = 13 + rnd() * 14;
  const r0 = 0.32 + rnd() * 0.42;
  const col = stoneCol(rnd);
  const dir = new THREE.Vector3((rnd() - 0.5) * 0.3, 1, (rnd() - 0.5) * 0.3).normalize();
  const tmp = new THREE.Vector3();
  const perp = new THREE.Vector3();
  const grow = (p, dv, len, r, d) => {
    const n = d === 0 ? 5 : 3;
    const pts = [[p.x, p.y, p.z]];
    const rad = [d === 0 ? r * 1.5 : r];
    const cur = p.clone();
    const v = dv.clone();
    for (let k = 1; k <= n; k++) {
      v.x += (rnd() - 0.5) * 0.35;
      v.z += (rnd() - 0.5) * 0.35;
      v.y += (rnd() - 0.45) * 0.2;
      v.normalize();
      cur.addScaledVector(v, len / n);
      pts.push([cur.x, cur.y, cur.z]);
      rad.push(r * (1 - (0.42 * k) / n));
    }
    const sides = d === 0 ? ctx.sides.mid : d === 1 ? ctx.sides.small + 1 : ctx.sides.small;
    sweep(ctx.bark, pts, rad, { sides, bump: d === 0 ? 0.12 : 0, seed: d * 3 + x, uScale: 1.2, vScale: 1.6, col, capB: d >= 2 });
    if (d >= 3 || r < 0.05) {
      if (rnd() < 0.35 * ctx.props) drape(ctx, cur.x, cur.y, cur.z, 1.5 + rnd() * 3.5, 0.7 + rnd() * 0.5, rnd() * TAU, 0.95);
      return;
    }
    const kids = d === 0 ? 3 + (rnd() < 0.5 ? 1 : 0) : 2 + (rnd() < 0.3 ? 1 : 0);
    for (let c = 0; c < kids; c++) {
      tmp.set(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5);
      perp.crossVectors(v, tmp).normalize();
      const ang = 0.5 + rnd() * 0.5;
      const cd = v.clone().multiplyScalar(Math.cos(ang)).addScaledVector(perp, Math.sin(ang));
      cd.y += 0.15;
      cd.normalize();
      grow(cur, cd, len * (0.55 + rnd() * 0.2), r * 0.62, d + 1);
    }
  };
  grow(new THREE.Vector3(x, y - 0.4, z), dir, H * 0.42, r0, 0);
  ctx.circles.push([x, z, r0 * 1.35]);
  ctx.clears.push([x, z, r0 + 0.5]);
  if (rnd() < 0.5) fungi(ctx, x + r0 * 1.6, y, z + r0 * 0.4, rnd, 3 + Math.floor(rnd() * 4));
}

// Tronco caído e petrificado, partido em gomos meio enterrados.
export function buildLog(ctx, x, z, rnd) {
  const { W } = ctx;
  const L = 7 + rnd() * 13;
  const ang = rnd() * TAU;
  const r = 0.6 + rnd() * 0.75;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  for (let t = -0.5; t <= 0.5; t += 0.1) {
    const px = x + ca * L * t;
    const pz = z + sa * L * t;
    if (W.trailDist(px, pz) < r + 1.6 || W.baseDist(px, pz) < RO + 6) return false;
  }
  const col = stoneCol(rnd);
  const cut = [0.88, 0.84, 0.7];
  const nSeg = 2 + Math.floor(rnd() * 2);
  let t0 = -0.5;
  for (let k = 0; k < nSeg; k++) {
    const t1 = k === nSeg - 1 ? 0.5 : t0 + (1 / nSeg) * (0.8 + rnd() * 0.4);
    const pts = [];
    const rad = [];
    const off = (rnd() - 0.5) * 0.4;
    for (let i = 0; i <= 4; i++) {
      const t = t0 + ((t1 - t0 - 0.03) * i) / 4;
      const px = x + ca * L * t - sa * off;
      const pz = z + sa * L * t + ca * off;
      pts.push([px, W.h(px, pz) + r * 0.35, pz]);
      rad.push(r * (1 - (t + 0.5) * 0.25));
    }
    sweep(ctx.bark, pts, rad, {
      sides: ctx.sides.mid,
      bump: 0.08,
      seed: k + x,
      uScale: 2,
      vScale: 2,
      col,
      capA: true,
      capB: true,
      capCol: cut,
    });
    for (const p of pts) ctx.circles.push([p[0], p[2], r * 0.92]);
    t0 = t1 + 0.04 + rnd() * 0.05;
    if (t0 > 0.45) break;
  }
  if (rnd() < 0.6 * ctx.props) fungi(ctx, x + sa * r, W.h(x, z) + r * 0.9, z - ca * r, rnd, 4 + Math.floor(rnd() * 5));
  return true;
}

// Pedra (grupo ≥ 10: flutua devagar no shader).
export function rock(ctx, x, y, z, s, rnd, g = 0) {
  const geo = ctx.rocks[Math.floor(rnd() * ctx.rocks.length)];
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd() * 0.6, rnd() * TAU, rnd() * 0.6)),
    new THREE.Vector3(s * (0.8 + rnd() * 0.5), s * (0.7 + rnd() * 0.5), s * (0.8 + rnd() * 0.5)),
  );
  ctx.bark.addGeometry(geo, m, stoneCol(rnd), g);
}

// Aglomerado de cogumelos levemente bioluminescentes (grupo -1 = brilho).
export function fungi(ctx, x, y, z, rnd, n) {
  const hue = rnd();
  const capC = hue < 0.7 ? [0.42, 0.95, 0.72] : [0.75, 0.95, 0.5];
  for (let k = 0; k < n; k++) {
    const a = rnd() * TAU;
    const d = rnd() * 0.35;
    const px = x + Math.cos(a) * d;
    const pz = z + Math.sin(a) * d;
    const h = 0.05 + rnd() * 0.16;
    const r = 0.035 + rnd() * 0.09;
    const k2 = 0.5 + rnd() * 0.6;
    ctx.bark.cylinder(px, y + h / 2 - 0.02, pz, r * 0.22, h, [0.28 * k2, 0.42 * k2, 0.36 * k2], null, { sides: 5, caps: false, group: -1 });
    ctx.bark.cylinder(px, y + h + 0.012, pz, r, 0.03, [capC[0] * k2, capC[1] * k2, capC[2] * k2], null, {
      sides: 7,
      r2: r * 0.45,
      group: -1,
    });
  }
}

// Cortina de musgo pendente: dois planos cruzados.
export function drape(ctx, x, y, z, len, w, rot, shade = 1) {
  const c = [0.78 * shade, 0.84 * shade, 0.68 * shade];
  for (let k = 0; k < 2; k++) {
    const a = rot + (k * Math.PI) / 2;
    const dx = (Math.cos(a) * w) / 2;
    const dz = (Math.sin(a) * w) / 2;
    ctx.drape.quad(
      [
        [x - dx, y - len, z - dz],
        [x + dx, y - len, z + dz],
        [x + dx, y, z + dz],
        [x - dx, y, z - dz],
      ],
      [0, 1, 0],
      [0, 0, 1, 0, 1, 1, 0, 1],
      null,
      [c, c, c, c],
    );
  }
}

// Feixe de luz vindo do alto (dois planos cruzados ao longo da direção do sol)
// e a poça de luz onde ele toca o chão (cor.g = 1 marca a poça).
export function beam(ctx, x, z, sunDir, w0, w1, I) {
  const { W, beams } = ctx;
  const y = W.h(x, z);
  const len = 62 / sunDir.y;
  const top = [x + sunDir.x * len, y + sunDir.y * len, z + sunDir.z * len];
  const ax = sunDir.clone().normalize();
  const s1 = new THREE.Vector3().crossVectors(ax, UP).normalize();
  const s2 = new THREE.Vector3().crossVectors(ax, s1).normalize();
  for (const s of [s1, s2]) {
    const nrm = new THREE.Vector3().crossVectors(s, ax).normalize();
    const c = [I, 0, 0];
    beams.quad(
      [
        [x - s.x * w0, y - s.y * w0 - 0.5, z - s.z * w0],
        [x + s.x * w0, y + s.y * w0 - 0.5, z + s.z * w0],
        [top[0] + s.x * w1, top[1] + s.y * w1, top[2] + s.z * w1],
        [top[0] - s.x * w1, top[1] - s.y * w1, top[2] - s.z * w1],
      ],
      [nrm.x, nrm.y, nrm.z],
      [0, 0, 1, 0, 1, 1, 0, 1],
      null,
      [c, c, c, c],
    );
  }
  // poça: grade 4×4 acompanhando o relevo
  const R = w0 * 1.7;
  const N = 4;
  const c = [I * 1.4, 1, 0];
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const p = [];
      const uv = [];
      for (const [di, dj] of [
        [0, 1],
        [1, 1],
        [1, 0],
        [0, 0],
      ]) {
        const u = (i + di) / N;
        const v = (j + dj) / N;
        const px = x - R + u * 2 * R;
        const pz = z - R + v * 2 * R;
        p.push([px, W.h(px, pz) + 0.06, pz]);
        uv.push(u, v);
      }
      beams.quad(p, [0, 1, 0], uv, null, [c, c, c, c]);
    }
  }
}

// Subnível 0.1 — construtor da Estação Zênite.
//
// Toda a estação é finita e estática, então cada material vira UMA malha
// (poucas chamadas de desenho no celular). A iluminação interna é "assada" por
// vértice em dois canais (superfícies subdivididas a cada ~1 m):
//   aBake  = luzes da estação (multiplicado por uPower: a energia oscila até as
//            bobinas serem recalibradas)
//   aBake2 = luz fixa: janelas (brilho dos planetas), sol pelas janelas (quando
//            não há sombras em tempo real) e luzes de emergência
// Os dois entram como irradiância indireta num patch do shader do three.js,
// junto com a luz hemisférica e, nas qualidades média+, o sol com sombras reais.
import * as THREE from 'three';
import { litMaterial } from '../materials.js';
import { clamp } from '../util.js';

// ------------------------------------------------------------ materiais
export function bakeMaterial(Q, o, U) {
  const m = litMaterial(Q, o);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPower = U.uPower;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 aBake;\nattribute vec3 aBake2;\nuniform float uPower;\nvarying vec3 vBake;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvBake = aBake * uPower + aBake2;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBake;')
      .replace(
        '#include <lights_fragment_maps>',
        '#include <lights_fragment_maps>\n#if defined( RE_IndirectDiffuse )\nirradiance += vBake * PI;\n#endif',
      );
  };
  m.customProgramCacheKey = () => 'zbake';
  m.shadowSide = THREE.DoubleSide;
  return m;
}

// Material de objetos móveis (pessoas, itens): a mesma irradiância, mas vinda de
// um uniforme amostrado na posição do objeto a cada quadro.
export function dynMaterial(Q, o, amb) {
  const m = litMaterial(Q, o);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uAmb = amb;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uAmb;')
      .replace(
        '#include <lights_fragment_maps>',
        '#include <lights_fragment_maps>\n#if defined( RE_IndirectDiffuse )\nirradiance += uAmb * PI * ( 0.8 + 0.2 * normal.y );\n#endif',
      );
  };
  m.customProgramCacheKey = () => 'zdyn';
  return m;
}

// Emissivo (luminárias, telas): brilho acompanha a energia se `k` > 0.
export function glowMaterial(U, o = {}) {
  const m = new THREE.MeshBasicMaterial({
    color: o.color !== undefined ? o.color : 0xffffff,
    map: o.map || null,
    transparent: !!o.transparent,
    opacity: o.opacity !== undefined ? o.opacity : 1,
    blending: o.additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    depthWrite: !o.additive && !o.transparent,
    side: o.side || THREE.FrontSide,
    fog: false,
    toneMapped: true,
  });
  const k = o.k !== undefined ? o.k : 1;
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPower = U.uPower;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uPower;')
      .replace('#include <map_fragment>', `#include <map_fragment>\ndiffuseColor.rgb *= mix( 1.0, uPower, ${k.toFixed(2)} );`);
  };
  m.customProgramCacheKey = () => 'zglow' + k.toFixed(2);
  return m;
}

// ------------------------------------------------------------ construtor
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _m3 = new THREE.Matrix3();

export class ZBuilder {
  constructor(lvl) {
    this.lvl = lvl;
    this.buckets = new Map();
    this.room = null;
    this.step = lvl.Q.id === 'low' ? 1.4 : 1.0;
    this.xf = null;
    this.nxf = null;
  }

  setRoom(r) {
    this.room = r;
  }

  bucket(mat) {
    let b = this.buckets.get(mat);
    if (!b) {
      b = { pos: [], nor: [], uv: [], b1: [], b2: [] };
      this.buckets.set(mat, b);
    }
    return b;
  }

  // Aplica uma matriz a tudo o que for emitido dentro de fn.
  with(matrix, fn) {
    const px = this.xf;
    const pn = this.nxf;
    this.xf = px ? px.clone().multiply(matrix) : matrix.clone();
    this.nxf = new THREE.Matrix3().getNormalMatrix(this.xf);
    fn();
    this.xf = px;
    this.nxf = pn;
  }

  vert(b, x, y, z, nx, ny, nz, u, v) {
    if (this.xf) {
      _v.set(x, y, z).applyMatrix4(this.xf);
      _n.set(nx, ny, nz).applyMatrix3(this.nxf).normalize();
      x = _v.x;
      y = _v.y;
      z = _v.z;
      nx = _n.x;
      ny = _n.y;
      nz = _n.z;
    }
    b.pos.push(x, y, z);
    b.nor.push(nx, ny, nz);
    b.uv.push(u, v);
    const k = this.lvl.bakeAt(this.room, x, y, z, nx, ny, nz);
    b.b1.push(k[0], k[1], k[2]);
    b.b2.push(k[3], k[4], k[5]);
  }

  // Retângulo p0 + s·U + t·V (s,t ∈ [0,1]), subdividido; normal n.
  // uv: 'world' (projeção planar em metros / mat.userData.uvS) ou [u0,v0,u1,v1].
  rect(mat, p0, U, V, n, uv = 'world', fine = true) {
    const b = this.bucket(mat);
    const lu = Math.hypot(U[0], U[1], U[2]);
    const lv = Math.hypot(V[0], V[1], V[2]);
    const nu = fine ? Math.max(1, Math.ceil(lu / this.step)) : 1;
    const nv = fine ? Math.max(1, Math.ceil(lv / this.step)) : 1;
    // orientação: (U × V) deve apontar para n
    const cx = U[1] * V[2] - U[2] * V[1];
    const cy = U[2] * V[0] - U[0] * V[2];
    const cz = U[0] * V[1] - U[1] * V[0];
    const flip = cx * n[0] + cy * n[1] + cz * n[2] < 0;
    const uvS = (mat.userData && mat.userData.uvS) || 2;
    const P = (s, t) => [p0[0] + U[0] * s + V[0] * t, p0[1] + U[1] * s + V[1] * t, p0[2] + U[2] * s + V[2] * t];
    const UV = (p, s, t) => {
      if (uv !== 'world') return [uv[0] + (uv[2] - uv[0]) * s, uv[1] + (uv[3] - uv[1]) * t];
      if (Math.abs(n[1]) > 0.5) return [p[0] / uvS, p[2] / uvS];
      if (Math.abs(n[0]) > 0.5) return [(n[0] > 0 ? -p[2] : p[2]) / uvS, p[1] / uvS];
      return [(n[2] > 0 ? p[0] : -p[0]) / uvS, p[1] / uvS];
    };
    for (let j = 0; j < nv; j++) {
      for (let i = 0; i < nu; i++) {
        const s0 = i / nu;
        const s1 = (i + 1) / nu;
        const t0 = j / nv;
        const t1 = (j + 1) / nv;
        const q = [
          [s0, t0],
          [s1, t0],
          [s1, t1],
          [s0, t1],
        ];
        const order = flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
        for (const o of order) {
          const p = P(q[o][0], q[o][1]);
          const t = UV(p, q[o][0], q[o][1]);
          this.vert(b, p[0], p[1], p[2], n[0], n[1], n[2], t[0], t[1]);
        }
      }
    }
  }

  // Caixa alinhada (antes da matriz atual). skip: { px, nx, py, ny, pz, nz }.
  box(mat, cx, cy, cz, sx, sy, sz, { skip = {}, fine = false, uv = 'world' } = {}) {
    const x0 = cx - sx / 2;
    const y0 = cy - sy / 2;
    const z0 = cz - sz / 2;
    if (!skip.py) this.rect(mat, [x0, y0 + sy, z0], [sx, 0, 0], [0, 0, sz], [0, 1, 0], uv, fine);
    if (!skip.ny) this.rect(mat, [x0, y0, z0], [sx, 0, 0], [0, 0, sz], [0, -1, 0], uv, fine);
    if (!skip.pz) this.rect(mat, [x0, y0, z0 + sz], [sx, 0, 0], [0, sy, 0], [0, 0, 1], uv, fine);
    if (!skip.nz) this.rect(mat, [x0, y0, z0], [sx, 0, 0], [0, sy, 0], [0, 0, -1], uv, fine);
    if (!skip.px) this.rect(mat, [x0 + sx, y0, z0], [0, 0, sz], [0, sy, 0], [1, 0, 0], uv, fine);
    if (!skip.nx) this.rect(mat, [x0, y0, z0], [0, 0, sz], [0, sy, 0], [-1, 0, 0], uv, fine);
  }

  // Geometria qualquer do three.js (é convertida para não indexada).
  geo(mat, g, matrix, uvScale = 1) {
    const src = g.index ? g.toNonIndexed() : g;
    const b = this.bucket(mat);
    const p = src.attributes.position;
    const n = src.attributes.normal;
    const t = src.attributes.uv;
    const M = this.xf ? this.xf.clone().multiply(matrix) : matrix;
    const NM = _m3.getNormalMatrix(M);
    const save = this.xf;
    this.xf = null;
    for (let i = 0; i < p.count; i++) {
      _v.fromBufferAttribute(p, i).applyMatrix4(M);
      _n.fromBufferAttribute(n, i).applyMatrix3(NM).normalize();
      const x = _v.x;
      const y = _v.y;
      const z = _v.z;
      this.vert(b, x, y, z, _n.x, _n.y, _n.z, t ? t.getX(i) * uvScale : 0, t ? t.getY(i) * uvScale : 0);
    }
    this.xf = save;
    if (src !== g) src.dispose();
    g.dispose();
  }

  cyl(mat, x, y, z, r, h, { sides = 16, r2, caps = true, axis = 'y', uvScale = 1 } = {}) {
    const g = new THREE.CylinderGeometry(r2 !== undefined ? r2 : r, r, h, sides, 1, !caps);
    const m = new THREE.Matrix4();
    if (axis === 'x') m.makeRotationZ(Math.PI / 2);
    else if (axis === 'z') m.makeRotationX(Math.PI / 2);
    m.setPosition(x, y, z);
    this.geo(mat, g, m, uvScale);
  }

  build(group, castMats) {
    const meshes = [];
    for (const [mat, b] of this.buckets) {
      if (!b.pos.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('aBake', new THREE.Float32BufferAttribute(b.b1, 3));
      g.setAttribute('aBake2', new THREE.Float32BufferAttribute(b.b2, 3));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, mat);
      mesh.matrixAutoUpdate = false;
      const sh = this.lvl.realSun && !(mat.userData && mat.userData.noShadow);
      mesh.castShadow = sh && (!castMats || castMats.has(mat));
      mesh.receiveShadow = sh;
      group.add(mesh);
      meshes.push(mesh);
    }
    this.buckets.clear();
    return meshes;
  }
}

// ------------------------------------------------------------ cascas das salas
// room: { id, x0, x1, z0, z1, h, mats: { floor, wall, ceil, trim }, holes: { n:[], s:[], w:[], e:[] },
//         ceilHoles: [{x0,x1,z0,z1}] }
// furo: { a0, a1, y0, y1, kind: 'portal' | 'window' | 'field' }
// Paredes: n em z0 (olha +z), s em z1 (olha −z), w em x0 (olha +x), e em x1 (olha −x).
export function wallFrame(room, side) {
  const { x0, x1, z0, z1 } = room;
  if (side === 'n') return { a0: x0, a1: x1, p: (a, y) => [a, y, z0], U: [1, 0, 0], n: [0, 0, 1], out: [0, 0, -1] };
  if (side === 's') return { a0: x0, a1: x1, p: (a, y) => [a, y, z1], U: [1, 0, 0], n: [0, 0, -1], out: [0, 0, 1] };
  if (side === 'w') return { a0: z0, a1: z1, p: (a, y) => [x0, y, a], U: [0, 0, 1], n: [1, 0, 0], out: [-1, 0, 0] };
  return { a0: z0, a1: z1, p: (a, y) => [x1, y, a], U: [0, 0, 1], n: [-1, 0, 0], out: [1, 0, 0] };
}

const WALL_T = 0.4;

export function buildShell(B, room, colliders) {
  const M = room.mats;
  const h = room.h;
  B.setRoom(room);
  // piso e teto (com recortes)
  const floorRects = [{ x0: room.x0, x1: room.x1, z0: room.z0, z1: room.z1 }];
  for (const r of floorRects) B.rect(M.floor, [r.x0, 0, r.z0], [r.x1 - r.x0, 0, 0], [0, 0, r.z1 - r.z0], [0, 1, 0]);
  const ceil = subtractRects({ x0: room.x0, x1: room.x1, z0: room.z0, z1: room.z1 }, room.ceilHoles || []);
  for (const r of ceil) B.rect(M.ceil, [r.x0, h, r.z0], [r.x1 - r.x0, 0, 0], [0, 0, r.z1 - r.z0], [0, -1, 0]);
  // bordas dos recortes do teto (espessura da laje)
  for (const c of room.ceilHoles || []) {
    const t = c.depth || 0.6;
    B.rect(M.trim, [c.x0, h, c.z0], [c.x1 - c.x0, 0, 0], [0, t, 0], [0, 0, 1]);
    B.rect(M.trim, [c.x0, h, c.z1], [c.x1 - c.x0, 0, 0], [0, t, 0], [0, 0, -1]);
    B.rect(M.trim, [c.x0, h, c.z0], [0, 0, c.z1 - c.z0], [0, t, 0], [1, 0, 0]);
    B.rect(M.trim, [c.x1, h, c.z0], [0, 0, c.z1 - c.z0], [0, t, 0], [-1, 0, 0]);
  }
  for (const side of ['n', 's', 'w', 'e']) {
    const F = wallFrame(room, side);
    const holes = (room.holes && room.holes[side]) || [];
    // cortes verticais
    const cuts = new Set([F.a0, F.a1]);
    for (const o of holes) {
      cuts.add(o.a0);
      cuts.add(o.a1);
    }
    const xs = [...cuts].sort((a, b) => a - b);
    for (let i = 0; i < xs.length - 1; i++) {
      const a = xs[i];
      const b = xs[i + 1];
      if (b - a < 1e-4) continue;
      const mid = (a + b) / 2;
      let solid = [[0, h]];
      let passable = false;
      for (const o of holes) {
        if (mid > o.a0 && mid < o.a1) {
          solid = subtractSpan(solid, o.y0, o.y1);
          if (o.kind === 'portal' && o.y0 < 0.3) passable = true;
        }
      }
      for (const [y0, y1] of solid) {
        if (y1 - y0 < 1e-4) continue;
        B.rect(M.wall, F.p(a, y0), [F.U[0] * (b - a), F.U[1] * (b - a), F.U[2] * (b - a)], [0, y1 - y0, 0], F.n);
      }
      if (!passable) {
        const p0 = F.p(a, 0);
        const p1 = F.p(b, 0);
        const ht = WALL_T / 2 + 0.05;
        colliders.push([
          Math.min(p0[0], p1[0]) - (F.U[0] ? 0 : ht) + F.out[0] * 0.05,
          Math.max(p0[0], p1[0]) + (F.U[0] ? 0 : ht) + F.out[0] * 0.05,
          Math.min(p0[2], p1[2]) - (F.U[2] ? 0 : ht) + F.out[2] * 0.05,
          Math.max(p0[2], p1[2]) + (F.U[2] ? 0 : ht) + F.out[2] * 0.05,
        ]);
      }
    }
    // rodapé escuro e vãos
    if (M.base) {
      let segs = [[F.a0, F.a1]];
      for (const o of holes) if (o.y0 < 0.15) segs = subtractSpan(segs, o.a0, o.a1);
      for (const [a, b] of segs) {
        const p = F.p(a, 0);
        const d = 0.025;
        B.rect(M.base, [p[0] + F.n[0] * d, 0, p[2] + F.n[2] * d], [F.U[0] * (b - a), 0, F.U[2] * (b - a)], [0, 0.12, 0], F.n, 'world', false);
        B.rect(
          M.base,
          [p[0], 0.12, p[2]],
          [F.U[0] * (b - a), 0, F.U[2] * (b - a)],
          [F.n[0] * d, 0, F.n[2] * d],
          [0, 1, 0],
          'world',
          false,
        );
      }
    }
    for (const o of holes) holeReveal(B, room, F, o);
  }
}

// Faces de espessura dos vãos (meia parede de cada lado: as duas salas completam o vão).
function holeReveal(B, room, F, o) {
  const M = room.mats;
  const d = o.kind === 'portal' ? WALL_T / 2 : WALL_T;
  const out = [F.out[0] * d, 0, F.out[2] * d];
  const mat = o.kind === 'portal' ? M.trim : M.reveal || M.trim;
  const pa = F.p(o.a0, o.y0);
  const pb = F.p(o.a1, o.y0);
  const L = o.a1 - o.a0;
  const UL = [F.U[0] * L, 0, F.U[2] * L];
  const H = o.y1 - o.y0;
  // laterais
  B.rect(mat, pa, out, [0, H, 0], [F.U[0], 0, F.U[2]], 'world', false);
  B.rect(mat, pb, out, [0, H, 0], [-F.U[0], 0, -F.U[2]], 'world', false);
  // verga
  if (o.y1 < room.h - 1e-3) B.rect(mat, F.p(o.a0, o.y1), UL, out, [0, -1, 0], 'world', false);
  // peitoril
  if (o.y0 > 1e-3) B.rect(mat, F.p(o.a0, o.y0), UL, out, [0, 1, 0], 'world', false);
  else if (o.kind === 'portal') B.rect(M.floor, pa, UL, out, [0, 1, 0], 'world', false);
  // moldura saliente em volta do vão
  if (M.frame) {
    const fw = o.kind === 'portal' ? 0.14 : 0.1;
    const fd = 0.06;
    const n = F.n;
    const base = (a, y) => {
      const p = F.p(a, y);
      return [p[0] + n[0] * 0.001, p[1], p[2] + n[2] * 0.001];
    };
    const segs = [
      [o.a0 - fw, o.a0, o.y0, o.y1 + (o.y1 < room.h - fw ? fw : 0)],
      [o.a1, o.a1 + fw, o.y0, o.y1 + (o.y1 < room.h - fw ? fw : 0)],
    ];
    if (o.y1 < room.h - fw) segs.push([o.a0, o.a1, o.y1, o.y1 + fw]);
    if (o.y0 > fw) segs.push([o.a0 - fw, o.a1 + fw, o.y0 - fw, o.y0]);
    for (const [a0, a1, y0, y1] of segs) {
      const L2 = a1 - a0;
      const U2 = [F.U[0] * L2, 0, F.U[2] * L2];
      const p = base(a0, y0);
      const pf = [p[0] + n[0] * fd, p[1], p[2] + n[2] * fd];
      B.rect(M.frame, pf, U2, [0, y1 - y0, 0], n, 'world', false);
      B.rect(M.frame, [pf[0], y1, pf[2]], U2, [-n[0] * fd, 0, -n[2] * fd], [0, 1, 0], 'world', false);
      B.rect(M.frame, [p[0], y0, p[2]], U2, [n[0] * fd, 0, n[2] * fd], [0, -1, 0], 'world', false);
      const s0 = base(a0, y0);
      const s1 = base(a1, y0);
      B.rect(M.frame, s0, [n[0] * fd, 0, n[2] * fd], [0, y1 - y0, 0], [-F.U[0], 0, -F.U[2]], 'world', false);
      B.rect(M.frame, s1, [n[0] * fd, 0, n[2] * fd], [0, y1 - y0, 0], [F.U[0], 0, F.U[2]], 'world', false);
    }
  }
}

export function subtractSpan(spans, a, b) {
  const out = [];
  for (const [s0, s1] of spans) {
    if (b <= s0 || a >= s1) out.push([s0, s1]);
    else {
      if (a > s0) out.push([s0, a]);
      if (b < s1) out.push([b, s1]);
    }
  }
  return out;
}

function subtractRects(r, holes) {
  let list = [r];
  for (const h of holes) {
    const next = [];
    for (const q of list) {
      if (h.x1 <= q.x0 || h.x0 >= q.x1 || h.z1 <= q.z0 || h.z0 >= q.z1) {
        next.push(q);
        continue;
      }
      if (h.z0 > q.z0) next.push({ x0: q.x0, x1: q.x1, z0: q.z0, z1: h.z0 });
      if (h.z1 < q.z1) next.push({ x0: q.x0, x1: q.x1, z0: h.z1, z1: q.z1 });
      const zz0 = Math.max(q.z0, h.z0);
      const zz1 = Math.min(q.z1, h.z1);
      if (h.x0 > q.x0) next.push({ x0: q.x0, x1: h.x0, z0: zz0, z1: zz1 });
      if (h.x1 < q.x1) next.push({ x0: h.x1, x1: q.x1, z0: zz0, z1: zz1 });
    }
    list = next;
  }
  return list;
}

// ------------------------------------------------------------ iluminação assada
// Luz: { x, y, z, c:[r,g,b], I, range, dir?: [x,y,z] (emissor direcional, ex. teto
// para baixo), pow?, ch: 0 (estação) | 1 (fixa) }
export function bakeLight(room, p, n, out, sun) {
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  let r2 = 0;
  let g2 = 0;
  let b2 = 0;
  // oclusão ambiente pelos planos da sala
  let ao = 1;
  if (room.box) {
    const ds = [p[1], room.h - p[1], p[0] - room.x0, room.x1 - p[0], p[2] - room.z0, room.z1 - p[2]];
    for (const d of ds) if (d > 0.04) ao *= 1 - 0.32 * Math.exp(-d / 0.55);
    ao = clamp(ao, 0.35, 1);
  }
  // preenchimento ambiente (hemisférico simples)
  const up = n[1] * 0.5 + 0.5;
  const A = room.amb || [0.05, 0.05, 0.06];
  const hk = (0.55 + 0.45 * up) * ao;
  r1 += A[0] * hk;
  g1 += A[1] * hk;
  b1 += A[2] * hk;
  const A2 = room.amb2;
  if (A2) {
    r2 += A2[0] * hk;
    g2 += A2[1] * hk;
    b2 += A2[2] * hk;
  }
  for (const L of room.lights) {
    const dx = L.x - p[0];
    const dy = L.y - p[1];
    const dz = L.z - p[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > L.range * L.range) continue;
    const d = Math.sqrt(d2) + 1e-5;
    const lx = dx / d;
    const ly = dy / d;
    const lz = dz / d;
    let ndl = n[0] * lx + n[1] * ly + n[2] * lz;
    ndl = ndl * 0.82 + 0.18;
    if (ndl <= 0) continue;
    let e = 1;
    if (L.dir) {
      e = -(L.dir[0] * lx + L.dir[1] * ly + L.dir[2] * lz);
      if (e <= 0) continue;
      e = Math.pow(e, L.pow || 1);
    }
    const w = 1 - Math.pow(d / L.range, 4);
    const f = (L.I * ndl * e * w * w) / (d2 + (L.soft || 1));
    const k = f * (0.6 + 0.4 * ao);
    if (L.ch) {
      r2 += L.c[0] * k;
      g2 += L.c[1] * k;
      b2 += L.c[2] * k;
    } else {
      r1 += L.c[0] * k;
      g1 += L.c[1] * k;
      b1 += L.c[2] * k;
    }
  }
  // sol pelas janelas (somente sem sombras em tempo real)
  if (sun && room.sunWindows) {
    const ndl = n[0] * sun.dir.x + n[1] * sun.dir.y + n[2] * sun.dir.z;
    if (ndl > 0) {
      for (const W of room.sunWindows) {
        const hit = rayRect(p, sun.dir, W);
        if (hit) {
          const k = ndl * sun.I * hit;
          r2 += sun.c[0] * k;
          g2 += sun.c[1] * k;
          b2 += sun.c[2] * k;
          break;
        }
      }
    }
  }
  out[0] = r1;
  out[1] = g1;
  out[2] = b1;
  out[3] = r2;
  out[4] = g2;
  out[5] = b2;
  return out;
}

// Raio p + t·d atinge o retângulo da janela? Devolve um fator suave nas bordas.
// W: { axis: 'x'|'y'|'z', at, a0, a1, b0, b1 } (a/b nas outras duas coordenadas, em ordem x,y,z)
function rayRect(p, d, W) {
  const ai = W.axis === 'x' ? 0 : W.axis === 'y' ? 1 : 2;
  const dv = ai === 0 ? d.x : ai === 1 ? d.y : d.z;
  if (Math.abs(dv) < 1e-4) return 0;
  const t = (W.at - p[ai]) / dv;
  if (t <= 0) return 0;
  const q = [p[0] + d.x * t, p[1] + d.y * t, p[2] + d.z * t];
  const o = [0, 1, 2].filter((k) => k !== ai);
  const u = q[o[0]];
  const v = q[o[1]];
  const s = 0.5;
  const fu = clamp(Math.min(u - W.a0, W.a1 - u) / s + 0.5, 0, 1);
  const fv = clamp(Math.min(v - W.b0, W.b1 - v) / s + 0.5, 0, 1);
  let f = fu * fv;
  // caixilhos (montantes) projetam faixas de sombra
  if (f > 0 && W.mull) {
    const m = W.mull.step;
    const c = W.mull.on === 'a' ? u - W.a0 : v - W.b0;
    const mu = Math.abs((((c % m) + m) % m) - m / 2);
    if (mu > m / 2 - 0.1) f *= 0.15;
  }
  return f;
}

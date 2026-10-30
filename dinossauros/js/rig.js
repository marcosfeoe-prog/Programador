// Constrói dinossauros do zero: esqueleto (THREE.Bone) e uma malha com
// skinning gerada por "loft" (anéis elípticos ao longo das cadeias de ossos),
// mais chifres, placas, crista, dentes, garras e olhos. Nada é importado.
import * as THREE from 'three';
import { skinTextures, hornTexture, eyeTexture } from './textures.js';
import { smoothstep, clamp } from './util.js';

const V3 = THREE.Vector3;
// grupos de material
const G_SKIN = 0;
const G_MOUTH = 1;
const G_HORN = 2;
const G_EYE = 3;
const G_ACCENT = 4;

// ------------------------------------------------------------------ layout
// Ângulo de um segmento no plano sagital (y,z): vetor = L·(−cos θ, −sin θ).
// Rotação positiva em X soma a θ (mesma convenção do three.js).
export const segAngle = (dy, dz) => Math.atan2(-dz, -dy);

function sampleNodes(nodes, z) {
  // nós [z,y,rx,ry] ordenados por z
  if (z <= nodes[0][0]) return nodes[0];
  for (let i = 0; i < nodes.length - 1; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    if (z <= b[0]) {
      const t = (z - a[0]) / (b[0] - a[0] || 1);
      return [z, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, a[3] + (b[3] - a[3]) * t];
    }
  }
  return nodes[nodes.length - 1];
}

export function rigLayout(spec) {
  const R = spec.rig;
  const defs = [];
  const add = (name, parent, pos) => {
    defs.push({ name, parent, pos: pos.clone() });
    return defs.length - 1;
  };
  const P = (n) => new V3(0, n[1], n[0]);
  const root = add('root', -1, new V3());
  const pelvis = add('pelvis', root, P(R.torso[0]));
  const torsoBoneOf = [pelvis];
  const torsoBones = [pelvis];
  const roles = { spine: [], neck: [], chest: -1, head: -1 };
  let prev = pelvis;
  for (let i = 1; i < R.torso.length; i++) {
    const n = R.torso[i];
    const role = n[4] || 'spine';
    if (role !== 'nb') {
      prev = add(role + i, prev, P(n));
      torsoBones.push(prev);
      if (role === 'spine') roles.spine.push(prev);
      else if (role === 'neck') roles.neck.push(prev);
      else if (role === 'chest') roles.chest = prev;
      else if (role === 'head') roles.head = prev;
    }
    torsoBoneOf.push(prev);
  }
  const tailBoneOf = [];
  const tailBones = [];
  prev = pelvis;
  for (let i = 0; i < R.tail.length; i++) {
    const n = R.tail[i];
    if (n[4] !== 'nb') {
      prev = add('tail' + i, prev, P(n));
      tailBones.push(prev);
    }
    tailBoneOf.push(prev);
  }
  const jaw = add('jaw', roles.head, P(R.jaw[0]));

  const legs = [];
  const addLimb = (pts, kind, parent) => {
    for (const side of [1, -1]) {
      const wp = pts.map((p) => new V3(p[0] * side, p[1], p[2]));
      const nb = kind === 'arm' ? 3 : 4;
      const bones = [];
      let par = parent;
      for (let i = 0; i < nb; i++) {
        par = add(kind + (side > 0 ? 'L' : 'R') + i, par, wp[i]);
        bones.push(par);
      }
      const len = [];
      const ang = [];
      for (let i = 0; i < pts.length - 1; i++) {
        const dy = wp[i + 1].y - wp[i].y;
        const dz = wp[i + 1].z - wp[i].z;
        len.push(Math.hypot(dy, dz));
        ang.push(segAngle(dy, dz));
      }
      legs.push({ kind, side, bones, pts: wp, radii: pts.map((p) => p[3]), len, ang, parent });
    }
  };
  addLimb(R.hind, 'hind', pelvis);
  if (R.front) addLimb(R.front, 'front', roles.chest);
  if (R.arms) addLimb(R.arms, 'arm', roles.chest);

  // corpo inteiro na ordem do loft: ponta da cauda → focinho
  const bodyNodes = [...R.tail].reverse().concat(R.torso);
  const bodyBones = [...tailBoneOf].reverse().concat(torsoBoneOf);
  const pelvisIdx = R.tail.length;
  const segOwner = [];
  for (let k = 0; k < bodyNodes.length - 1; k++) segOwner.push(k + 1 <= pelvisIdx ? bodyBones[k + 1] : bodyBones[k]);

  const hind = legs.filter((l) => l.kind === 'hind');
  const hipH = R.hind[0][1];
  const legLen = hind[0].len[0] + hind[0].len[1] + hind[0].len[2];
  const snout = R.torso[R.torso.length - 1];
  const length = snout[0] - R.tail[R.tail.length - 1][0];
  const maxR = Math.max(...R.torso.map((n) => n[2]));
  const layout = {
    defs,
    root,
    pelvis,
    torsoBones,
    tailBones,
    roles,
    jaw,
    legs,
    bodyNodes,
    segOwner,
    hipH,
    legLen,
    length,
    width: maxR,
    pelvisRY: R.torso[0][3],
    pelvisRX: R.torso[0][2],
    snout: new V3(0, snout[1], snout[0]),
    tailZ: R.tail[R.tail.length - 1][0],
    headZ: snout[0],
  };
  layout.eatPose = computeEatPose(spec, layout);
  return layout;
}

// FK 2D (y,z) do tronco: devolve a posição do focinho dados ângulos por osso.
function snoutFK(layout, pitch) {
  const tb = layout.torsoBones;
  const d = layout.defs;
  let ang = 0;
  let y = d[tb[0]].pos.y;
  let z = d[tb[0]].pos.z;
  for (let i = 0; i < tb.length; i++) {
    ang += pitch[i] || 0;
    const next = i + 1 < tb.length ? d[tb[i + 1]].pos : layout.snout;
    const cur = d[tb[i]].pos;
    const oy = next.y - cur.y;
    const oz = next.z - cur.z;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    y += oy * c - oz * s;
    z += oy * s + oz * c;
  }
  return { y, z };
}

// Postura para comer/beber no chão: curva o pescoço e, se preciso, inclina o corpo.
function computeEatPose(spec, layout) {
  if (spec.ai && spec.ai.browser) return { P: 0, N: -0.12, H: 0.15 };
  const tb = layout.torsoBones;
  const nNeck = layout.roles.neck.length || 1;
  const target = Math.max(0.15, layout.hipH * 0.08);
  const pose = (P, N, H) =>
    tb.map((b, i) => {
      if (i === 0) return P;
      if (layout.roles.neck.includes(b)) return N / nNeck;
      if (b === layout.roles.head) return H;
      return 0;
    });
  for (let N = 0; N <= 1.5; N += 0.05) {
    if (snoutFK(layout, pose(0, N, 0.35)).y <= target) return { P: 0, N, H: 0.35 };
  }
  for (let P = 0; P <= 0.9; P += 0.02) {
    if (snoutFK(layout, pose(P, 1.5, 0.35)).y <= target) return { P, N: 1.5, H: 0.35 };
  }
  return { P: 0.9, N: 1.5, H: 0.35 };
}

// ------------------------------------------------------------------ geometria
class Builder {
  constructor() {
    this.g = [0, 1, 2, 3, 4].map(() => ({ pos: [], nor: [], uv: [], si: [], sw: [], idx: [] }));
  }
  vert(gi, p, n, u, v, bones, weights) {
    const g = this.g[gi];
    g.pos.push(p.x, p.y, p.z);
    g.nor.push(n.x, n.y, n.z);
    g.uv.push(u, v);
    g.si.push(bones[0] || 0, bones[1] || 0, bones[2] || 0, bones[3] || 0);
    g.sw.push(weights[0] || 0, weights[1] || 0, weights[2] || 0, weights[3] || 0);
    return g.pos.length / 3 - 1;
  }
  tri(gi, a, b, c) {
    this.g[gi].idx.push(a, b, c);
  }
  // Insere uma geometria do three.js (já transformada) presa a um osso
  addGeo(gi, geo, bone) {
    const g = geo.index ? geo : geo;
    const p = g.attributes.position;
    const n = g.attributes.normal;
    const uv = g.attributes.uv;
    const base = this.g[gi].pos.length / 3;
    const tp = new V3();
    const tn = new V3();
    for (let i = 0; i < p.count; i++) {
      tp.fromBufferAttribute(p, i);
      tn.fromBufferAttribute(n, i);
      this.vert(gi, tp, tn, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0, [bone], [1]);
    }
    if (g.index) for (let i = 0; i < g.index.count; i++) this.g[gi].idx.push(base + g.index.getX(i));
    else for (let i = 0; i < p.count; i++) this.g[gi].idx.push(base + i);
  }
  build() {
    const pos = [];
    const nor = [];
    const uv = [];
    const si = [];
    const sw = [];
    const idx = [];
    const geo = new THREE.BufferGeometry();
    let start = 0;
    for (let gi = 0; gi < this.g.length; gi++) {
      const g = this.g[gi];
      const off = pos.length / 3;
      pos.push(...g.pos);
      nor.push(...g.nor);
      uv.push(...g.uv);
      si.push(...g.si);
      sw.push(...g.sw);
      for (const i of g.idx) idx.push(i + off);
      if (g.idx.length) geo.addGroup(start, g.idx.length, gi);
      start += g.idx.length;
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
    geo.setIndex(idx);
    geo.computeBoundingSphere();
    return geo;
  }
}

const crScalar = (a, k, f) => {
  const p0 = a[Math.max(0, k - 1)];
  const p1 = a[k];
  const p2 = a[Math.min(a.length - 1, k + 1)];
  const p3 = a[Math.min(a.length - 1, k + 2)];
  const f2 = f * f;
  const f3 = f2 * f;
  return 0.5 * (2 * p1 + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 + (-p0 + 3 * p1 - 3 * p2 + p3) * f3);
};

// Tubo suave por uma lista de pontos com raios elípticos.
// owners[k] = osso do segmento k; startBone = osso para mesclar no início.
function loft(B, gi, pts, rx, ry, owners, { around = 14, sub = 4, startBone = -1, capStart = true, capEnd = true, vScale = 1 } = {}) {
  const n = pts.length;
  const curve = new THREE.CatmullRomCurve3(pts, false, 'centripetal');
  const rings = [];
  let v = 0;
  let last = null;
  for (let k = 0; k < n - 1; k++) {
    const steps = k === n - 2 ? sub + 1 : sub;
    for (let s = 0; s < steps; s++) {
      const f = s / sub;
      const t = (k + f) / (n - 1);
      const c = curve.getPoint(t);
      const T = curve.getTangent(t).normalize();
      const a = Math.max(0.005, crScalar(rx, k, f));
      const b = Math.max(0.005, crScalar(ry, k, f));
      if (last) v += c.distanceTo(last) / (Math.PI * (a + b)) * vScale;
      last = c;
      // pesos: mescla com o osso anterior/seguinte perto das juntas
      const o = owners[k];
      const prev = k > 0 ? owners[k - 1] : startBone;
      const next = k < n - 2 ? owners[k + 1] : -1;
      const bones = [o];
      const w = [1];
      if (prev >= 0 && prev !== o) {
        const wp = 0.5 * (1 - smoothstep(0, 0.4, f));
        if (wp > 0) {
          bones.push(prev);
          w.push(wp);
          w[0] -= wp;
        }
      }
      if (next >= 0 && next !== o) {
        const wn = 0.5 * smoothstep(0.6, 1, f);
        if (wn > 0) {
          bones.push(next);
          w.push(wn);
          w[0] -= wn;
        }
      }
      let Rv = new V3(1, 0, 0).addScaledVector(T, -T.x);
      if (Rv.lengthSq() < 1e-4) Rv.set(0, 1, 0);
      Rv.normalize();
      const U = new V3().crossVectors(T, Rv).normalize();
      rings.push({ c, T, U, R: Rv, a, b, v, bones, w });
    }
  }
  const nr = rings.length;
  const base = B.g[gi].pos.length / 3;
  const P = [];
  for (const r of rings) {
    for (let i = 0; i <= around; i++) {
      const th = (i / around) * Math.PI * 2;
      const p = r.c.clone().addScaledVector(r.U, Math.cos(th) * r.b).addScaledVector(r.R, Math.sin(th) * r.a);
      P.push(p);
    }
  }
  const W = around + 1;
  const tmp = new V3();
  for (let j = 0; j < nr; j++) {
    const r = rings[j];
    for (let i = 0; i <= around; i++) {
      const p = P[j * W + i];
      const ip = (i + 1) % around;
      const im = (i - 1 + around) % around;
      const du = new V3().subVectors(P[j * W + ip], P[j * W + im]);
      const dv = new V3().subVectors(P[Math.min(nr - 1, j + 1) * W + i], P[Math.max(0, j - 1) * W + i]);
      const nn = new V3().crossVectors(du, dv).normalize();
      tmp.subVectors(p, r.c);
      if (nn.dot(tmp) < 0) nn.negate();
      if (!isFinite(nn.x)) nn.copy(tmp).normalize();
      B.vert(gi, p, nn, i / around, r.v, r.bones, r.w);
    }
  }
  // orientação dos triângulos: verifica com o primeiro quad
  const a0 = P[0];
  const a1 = P[W];
  const b0 = P[1];
  const fn = new V3().crossVectors(new V3().subVectors(a1, a0), new V3().subVectors(b0, a0));
  const flip = fn.dot(new V3().subVectors(a0, rings[0].c)) < 0;
  for (let j = 0; j < nr - 1; j++)
    for (let i = 0; i < around; i++) {
      const A = base + j * W + i;
      const Bq = A + 1;
      const C = A + W;
      const D = C + 1;
      if (!flip) {
        B.tri(gi, A, C, Bq);
        B.tri(gi, Bq, C, D);
      } else {
        B.tri(gi, A, Bq, C);
        B.tri(gi, Bq, D, C);
      }
    }
  const cap = (j, dirSign) => {
    const r = rings[j];
    const cp = r.c.clone().addScaledVector(r.T, dirSign * Math.min(r.a, r.b) * 0.7);
    const nn = r.T.clone().multiplyScalar(dirSign);
    const ci = B.vert(gi, cp, nn, 0.5, r.v, r.bones, r.w);
    for (let i = 0; i < around; i++) {
      const A = base + j * W + i;
      const Bq = A + 1;
      const tri = [ci, A, Bq];
      const e = new V3().crossVectors(new V3().subVectors(P[j * W + i], cp), new V3().subVectors(P[j * W + i + 1], cp));
      if (e.dot(nn) < 0) B.tri(gi, ci, Bq, A);
      else B.tri(gi, ...tri);
    }
  };
  if (capStart) cap(0, -1);
  if (capEnd) cap(nr - 1, 1);
  return rings;
}

// cone (chifre, dente, garra) da base até a ponta, com curvatura opcional
function hornGeo(base, dir, len, r, curl = 0, curlDir = new V3(0, -1, 0), seg = 7) {
  const g = new THREE.ConeGeometry(r, len, seg, 4, true);
  g.translate(0, len / 2, 0);
  const d = dir.clone().normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d);
  const p = g.attributes.position;
  const v = new V3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const t = v.y / len;
    v.applyQuaternion(q).add(base).addScaledVector(curlDir, curl * len * t * t);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function ellipsoidGeo(c, rx, ry, rz, ws = 10, hs = 8) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  g.translate(c.x, c.y, c.z);
  return g;
}

function buildGeometry(spec, L, quality) {
  const R = spec.rig;
  const B = new Builder();
  const around = quality.ring;
  // corpo
  const bn = L.bodyNodes;
  loft(
    B,
    G_SKIN,
    bn.map((n) => new V3(0, n[1], n[0])),
    bn.map((n) => n[2]),
    bn.map((n) => n[3]),
    L.segOwner,
    { around: around + 2, sub: 4 },
  );
  // mandíbula
  loft(
    B,
    G_SKIN,
    R.jaw.map((n) => new V3(0, n[1], n[0])),
    R.jaw.map((n) => n[2]),
    R.jaw.map((n) => n[3]),
    R.jaw.map(() => L.jaw),
    { around, sub: 3 },
  );
  // boca (interior) e língua
  const head = R.torso.filter((n) => n[0] >= R.jaw[0][0] - 0.01);
  const jz0 = R.jaw[0][0];
  const jz1 = R.jaw[R.jaw.length - 1][0];
  const hs = sampleNodes(R.torso, (jz0 + jz1) / 2);
  const js = sampleNodes(R.jaw, (jz0 + jz1) / 2);
  const mouthY = (hs[1] - hs[3] * 0.7 + js[1] + js[3] * 0.5) / 2;
  B.addGeo(G_MOUTH, ellipsoidGeo(new V3(0, mouthY, (jz0 + jz1) / 2), js[2] * 0.8, Math.max(hs[3], js[3]) * 0.45, (jz1 - jz0) * 0.5), L.roles.head);
  B.addGeo(G_MOUTH, ellipsoidGeo(new V3(0, js[1] + js[3] * 0.3, (jz0 + jz1) / 2), js[2] * 0.55, js[3] * 0.3, (jz1 - jz0) * 0.42), L.jaw);
  void head;

  // dentes
  if (R.teeth) {
    const T = R.teeth;
    for (let i = 0; i < T.n; i++) {
      const z = T.from + ((T.to - T.from) * (i + 0.5)) / T.n;
      const h = sampleNodes(R.torso, z);
      const j = sampleNodes(R.jaw, z);
      const len = T.len * (0.7 + 0.3 * Math.sin((i / T.n) * Math.PI));
      for (const s of [1, -1]) {
        const up = new V3(s * h[2] * 0.72, h[1] - h[3] * 0.62, z);
        B.addGeo(G_HORN, hornGeo(up, new V3(0, -1, 0.15), len, len * 0.28, 0.1, new V3(0, 0, -1), 5), L.roles.head);
        const lo = new V3(s * j[2] * 0.7, j[1] + j[3] * 0.55, z + 0.02);
        B.addGeo(G_HORN, hornGeo(lo, new V3(0, 1, 0.15), len * 0.8, len * 0.25, 0.1, new V3(0, 0, -1), 5), L.jaw);
      }
    }
  }

  // olhos
  {
    const e = R.eye;
    const h = sampleNodes(R.torso, e.z);
    for (const s of [1, -1]) {
      const c = new V3(s * h[2] * Math.cos(e.a) * 0.93, h[1] + h[3] * Math.sin(e.a) * 0.93, e.z);
      const g = new THREE.SphereGeometry(e.r, 12, 10);
      g.translate(c.x, c.y, c.z);
      // projeção planar para a íris ficar virada para fora
      const p = g.attributes.position;
      const uv = g.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        uv.setXY(i, 0.5 + ((p.getZ(i) - c.z) / e.r) * 0.5 * s, 0.5 + ((p.getY(i) - c.y) / e.r) * 0.5);
      }
      B.addGeo(G_EYE, g, L.roles.head);
      // arcada acima do olho
      B.addGeo(G_SKIN, ellipsoidGeo(new V3(c.x * 0.95, c.y + e.r * 0.75, c.z), e.r * 0.9, e.r * 0.45, e.r * 1.6, 8, 6), L.roles.head);
    }
  }

  // membros
  for (const leg of L.legs) {
    const pts = leg.pts.slice();
    const rr = leg.radii;
    const isArm = leg.kind === 'arm';
    const rx = rr.map((r, i) => (!isArm && i >= 3 ? r * 1.55 : r));
    const ry = rr.map((r, i) => (!isArm && i >= 3 ? r * 0.55 : r));
    const owners = [];
    for (let i = 0; i < pts.length - 1; i++) owners.push(leg.bones[Math.min(i, leg.bones.length - 1)]);
    loft(B, G_SKIN, pts, rx, ry, owners, { around, sub: 3, startBone: leg.parent });
    // garras / cascos na ponta
    const tip = pts[pts.length - 1];
    const lastBone = leg.bones[leg.bones.length - 1];
    const carn = spec.diet === 'carnivoro';
    const toes = isArm ? 2 : 3;
    const tr = rr[rr.length - 1];
    for (let t = 0; t < toes; t++) {
      const sx = (t - (toes - 1) / 2) * tr * 1.3;
      const base = tip.clone().add(new V3(sx, isArm ? 0 : tr * 0.2, -tr * 0.3));
      const dir = isArm ? new V3(0, -1, 0.4) : new V3(sx * 0.6, -0.25, 1);
      const len = carn ? tr * 3.2 : tr * 1.6;
      B.addGeo(G_HORN, hornGeo(base, dir, len, tr * (carn ? 0.55 : 0.85), carn ? 0.25 : 0.05), lastBone);
    }
    if (leg.kind === 'hind' && (R.extras || []).some((x) => x.type === 'sickle')) {
      const ball = pts[3];
      B.addGeo(G_HORN, hornGeo(ball.clone().add(new V3(0, rr[3] * 0.8, 0)), new V3(0, 0.8, 1), rr[3] * 3.4, rr[3] * 0.45, 0.6), leg.bones[3]);
    }
  }

  // extras
  const ownerAt = (z) => {
    for (let k = 0; k < bn.length - 1; k++) if (z >= bn[k][0] && z <= bn[k + 1][0]) return L.segOwner[k];
    return L.pelvis;
  };
  for (const x of R.extras || []) {
    if (x.type === 'horn') {
      for (const s of x.x ? [1, -1] : [1]) {
        const base = new V3(x.x * s, x.y, x.z);
        const dir = new V3(x.dir[0] * s, x.dir[1], x.dir[2]);
        B.addGeo(G_HORN, hornGeo(base, dir, x.len, x.r, x.curl, new V3(0, -0.3, 1).normalize(), 9), L.roles.head);
      }
    } else if (x.type === 'frill') {
      const sh = new THREE.Shape();
      const N = 40;
      const span = 1.8;
      for (let i = 0; i <= N; i++) {
        const ph = -span + (2 * span * i) / N;
        const rr = x.r * (1 + 0.06 * Math.max(0, Math.sin(ph * 13)));
        const px = Math.sin(ph) * rr;
        const py = Math.cos(ph) * rr * 0.85;
        if (i === 0) sh.moveTo(px, py);
        else sh.lineTo(px, py);
      }
      for (let i = N; i >= 0; i--) {
        const ph = -span + (2 * span * i) / N;
        sh.lineTo(Math.sin(ph) * x.r * 0.35, Math.cos(ph) * x.r * 0.2 - x.r * 0.12);
      }
      const g = new THREE.ExtrudeGeometry(sh, { depth: 0.07, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.03, bevelSegments: 1, curveSegments: 4 });
      // abaulado (côncavo para frente)
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const px = p.getX(i);
        p.setZ(i, p.getZ(i) - (px * px) * 0.18);
      }
      g.scale(1, 1, 1);
      const m = new THREE.Matrix4().makeRotationX(-x.tilt);
      g.applyMatrix4(m);
      g.translate(0, x.y, x.z);
      g.computeVertexNormals();
      B.addGeo(G_ACCENT, g, L.roles.head);
    } else if (x.type === 'crest') {
      const pts = x.pts.map((p) => new V3(0, p[1], p[0]));
      // a crista vai do topo da cabeça para trás
      const pp = x.pts.map((p) => new V3(0, p[0], 0));
      void pp;
      const cpts = x.pts.map((p) => new V3(0, p[0], p[1]));
      void pts;
      const r = x.pts.map((p) => p[2]);
      loft(
        B,
        G_ACCENT,
        cpts,
        r.map((v) => v * 0.8),
        r,
        cpts.map(() => L.roles.head),
        { around, sub: 3 },
      );
    } else if (x.type === 'plates') {
      for (let i = 0; i < x.n; i++) {
        const t = (i + 0.5) / x.n;
        const z = x.from + (x.to - x.from) * t;
        const s = sampleNodes(bn, z);
        const h = x.h * (0.3 + 0.7 * Math.exp(-Math.pow((z + 0.6) / 2.6, 2)));
        const w = h * 0.9;
        const sh = new THREE.Shape();
        sh.moveTo(-w / 2, -h * 0.15);
        sh.quadraticCurveTo(-w * 0.55, h * 0.55, 0, h);
        sh.quadraticCurveTo(w * 0.55, h * 0.5, w / 2, -h * 0.15);
        sh.lineTo(-w / 2, -h * 0.15);
        const g = new THREE.ExtrudeGeometry(sh, { depth: 0.05, bevelEnabled: true, bevelThickness: 0.02, bevelSize: 0.02, bevelSegments: 1, curveSegments: 6 });
        g.translate(0, 0, -0.025);
        const side = i % 2 ? 1 : -1;
        // forma no plano (z,y) com espessura em x, levemente inclinada para fora
        const m = new THREE.Matrix4().makeRotationY(Math.PI / 2);
        g.applyMatrix4(m);
        g.applyMatrix4(new THREE.Matrix4().makeRotationZ(-side * 0.14));
        g.translate(side * 0.1, s[1] + s[3] * 0.82, z);
        g.computeVertexNormals();
        B.addGeo(G_ACCENT, g, ownerAt(z));
      }
    } else if (x.type === 'spikes') {
      const s = sampleNodes(bn, x.z);
      for (const zz of [x.z + 0.25, x.z - 0.25]) {
        for (const sd of [1, -1]) {
          const base = new V3(sd * s[2] * 0.5, s[1] + s[3] * 0.4, zz);
          const dir = new V3(sd * 1, 0.55, zz > x.z ? -0.2 : -0.7);
          B.addGeo(G_HORN, hornGeo(base, dir, 0.8, 0.075, 0.12, new V3(0, 1, 0), 7), ownerAt(zz));
        }
      }
    }
  }
  return B.build();
}

// ------------------------------------------------------------------ cache por espécie
const assets = new Map();
function getAsset(spec, quality) {
  const key = spec.id + quality.ring;
  if (assets.has(key)) return assets.get(key);
  const layout = rigLayout(spec);
  const geometry = buildGeometry(spec, layout, quality);
  const sk = skinTextures(spec.skin, spec.id.length * 13 + 5);
  const ac = spec.accent ? skinTextures(spec.accent, spec.id.length * 7 + 3) : sk;
  const rep = spec.id === 'brachio' ? 1 : 1;
  const skin = new THREE.MeshStandardMaterial({ map: sk.map, normalMap: sk.normalMap, roughness: 0.82, metalness: 0 });
  skin.normalScale.set(rep, rep);
  const mouth = new THREE.MeshStandardMaterial({ color: 0x5a1a18, roughness: 0.6 });
  const horn = new THREE.MeshStandardMaterial({ map: hornTexture(), roughness: 0.55 });
  const eye = new THREE.MeshStandardMaterial({ map: eyeTexture(spec.eye, spec.diet === 'carnivoro'), roughness: 0.15 });
  const accent = new THREE.MeshStandardMaterial({ map: ac.map, normalMap: ac.normalMap, roughness: 0.75, side: THREE.DoubleSide });
  const sphere = geometry.boundingSphere.clone();
  sphere.radius *= 1.35;
  const a = { layout, geometry, materials: [skin, mouth, horn, eye, accent], sphere };
  assets.set(key, a);
  return a;
}

export function clearAssets() {
  for (const a of assets.values()) {
    a.geometry.dispose();
  }
  assets.clear();
}

// Cria uma instância: malha com skinning + ossos próprios
export function createDino(spec, quality) {
  const A = getAsset(spec, quality);
  const L = A.layout;
  const bones = L.defs.map((d) => {
    const b = new THREE.Bone();
    b.name = d.name;
    return b;
  });
  L.defs.forEach((d, i) => {
    if (d.parent >= 0) {
      bones[i].position.copy(d.pos).sub(L.defs[d.parent].pos);
      bones[d.parent].add(bones[i]);
    } else bones[i].position.copy(d.pos);
  });
  const mesh = new THREE.SkinnedMesh(A.geometry, A.materials);
  mesh.add(bones[0]);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.boundingSphere = A.sphere.clone();
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return { mesh, bones, layout: L, restPos: bones.map((b) => b.position.clone()) };
}

export { clamp };

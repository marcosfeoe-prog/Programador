// Modelos de dinossauro gerados do zero: o corpo é "esculpido" por anéis ao
// longo da coluna (loft), pernas e braços são tubos ao longo dos ossos, e tudo
// vira uma única SkinnedMesh com esqueleto próprio (pesos calculados aqui).
import * as THREE from 'three';
import { SPECIES } from './species.js';
import { makeSkin, makeEye, makeIvory, makePlate, makeDetailNormal, makeSkinsParallel, skinFromData } from './textures.js';
import { clamp, lerp, smooth, smoothstep, TAU } from './util.js';

const V3 = THREE.Vector3;
const AXIS_X = new V3(1, 0, 0);
const G_SKIN = 0;
const G_IVORY = 1;
const G_EYE = 2;
const G_ACCENT = 3;
const G_LIMB = 4; // pernas, braços e dedos: pele própria, repetindo em volta
const G_MOUTH = 5; // língua (material úmido)
const LID_OPEN = 1.7; // pálpebra guardada (rad) — gira até 0 para fechar

// ---------------------------------------------------------------------------
// Construtor de geometria com pesos de esqueleto e grupos de material
// ---------------------------------------------------------------------------
class SkinGeo {
  constructor() {
    this.pos = [];
    this.uv = [];
    this.col = [];
    this.si = [];
    this.sw = [];
    this.groups = [[], [], [], [], [], []];
    this.seams = [];
    this.n = 0;
  }

  add(p, u, v, weights, color) {
    this.pos.push(p.x, p.y, p.z);
    this.uv.push(u, v);
    this.col.push(color ? color[0] : 1, color ? color[1] : 1, color ? color[2] : 1);
    const m = new Map();
    for (const [b, w] of weights) if (w > 1e-4) m.set(b, (m.get(b) || 0) + w);
    const arr = [...m].sort((a, b) => b[1] - a[1]).slice(0, 4);
    let s = 0;
    for (const a of arr) s += a[1];
    for (let i = 0; i < 4; i++) {
      this.si.push(arr[i] ? arr[i][0] : 0);
      this.sw.push(arr[i] ? arr[i][1] / s : 0);
    }
    return this.n++;
  }

  tri(g, a, b, c) {
    this.groups[g].push(a, b, c);
  }

  // Anexa uma geometria pronta do three.js (já em espaço do modelo).
  addGeometry(g, geom, matrix, weights, color) {
    const src = geom;
    const p = src.attributes.position;
    const uv = src.attributes.uv;
    const base = this.n;
    const v = new V3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(matrix);
      this.add(v, uv ? uv.getX(i) : 0, uv ? uv.getY(i) : 0, weights, color);
    }
    if (src.index) {
      const idx = src.index.array;
      for (let i = 0; i < idx.length; i += 3) this.tri(g, base + idx[i], base + idx[i + 1], base + idx[i + 2]);
    } else {
      for (let i = 0; i < p.count; i += 3) this.tri(g, base + i, base + i + 1, base + i + 2);
    }
  }

  // média das normais dos vértices duplicados na costura
  fixSeams(nrm) {
    const a = new V3();
    const b = new V3();
    for (const [i, j] of this.seams) {
      a.fromBufferAttribute(nrm, i);
      b.fromBufferAttribute(nrm, j);
      a.add(b).normalize();
      nrm.setXYZ(i, a.x, a.y, a.z);
      nrm.setXYZ(j, a.x, a.y, a.z);
    }
  }

  // sculpt: músculos/saliências {c, r, a, group?} empurrando a pele pela normal
  build(sculpt = []) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    const index = [];
    let start = 0;
    this.groups.forEach((g, i) => {
      for (const k of g) index.push(k);
      if (g.length) geo.addGroup(start, g.length, i);
      start += g.length;
    });
    geo.setIndex(index);
    geo.computeVertexNormals();
    this.fixSeams(geo.attributes.normal);
    if (sculpt.length) {
      const groupOf = new Int8Array(this.n).fill(-1);
      this.groups.forEach((g, gi) => {
        for (const k of g) groupOf[k] = gi;
      });
      const pos = geo.attributes.position;
      const nrm = geo.attributes.normal;
      for (let k = 0; k < this.n; k++) {
        const x = pos.getX(k);
        const y = pos.getY(k);
        const z = pos.getZ(k);
        let d = 0;
        for (const b of sculpt) {
          if (b.group !== undefined && b.group !== groupOf[k]) continue;
          const dx = (x - b.c[0]) / b.r[0];
          const dy = (y - b.c[1]) / b.r[1];
          const dz = (z - b.c[2]) / b.r[2];
          const d2 = dx * dx + dy * dy + dz * dz;
          if (d2 < 6) d += b.a * Math.exp(-d2 * 1.5);
        }
        if (d) pos.setXYZ(k, x + nrm.getX(k) * d, y + nrm.getY(k) * d, z + nrm.getZ(k) * d);
      }
      geo.computeVertexNormals();
      this.fixSeams(geo.attributes.normal);
    }
    geo.computeBoundingSphere();
    return geo;
  }
}

const hash01 = (n) => {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

// Perímetro aproximado de uma elipse (Ramanujan).
function ellipseCirc(a, b) {
  return Math.PI * (3 * (a + b) - Math.sqrt((3 * a + b) * (a + 3 * b)));
}
const ringCirc = (R) => ellipseCirc(R.w * (1 + (R.wt ?? 1)) * 0.5, (R.ht + R.hb) / 2);

// Completa uma entrada de perfil: [z, y, w, ht, hb, wt = 1, pw = 2]
const pad7 = (a) => [a[0], a[1], a[2], a[3], a[4], a[5] ?? 1, a[6] ?? 2];

// x da superfície de um anel do perfil a uma altura relativa (-1 embaixo, 1 em cima)
function surfX(pr, yFrac) {
  const pw = pr[6] ?? 2;
  const csAbs = Math.pow(Math.min(1, Math.abs(yFrac)), pw / 2);
  const sx = Math.pow(Math.sqrt(Math.max(0, 1 - csAbs * csAbs)), 2 / pw);
  const ww = yFrac > 0 ? lerp(1, pr[5] ?? 1, Math.min(1, csAbs * 1.3)) : 1;
  return pr[2] * ww * sx;
}

// Gera os anéis de um tubo e conecta. Cada anel: {c, t, w, ht, hb, wt?, pw?, weights, shade?}
// (wt = largura relativa da metade de cima; pw = expoente da superelipse, 2 = elipse).
// A coordenada v avança em "voltas": uma repetição da textura por perímetro
// local, então as escamas ficam proporcionais (e menores na cauda e nos dedos).
function loft(geo, g, rings, seg, opts = {}) {
  const { colorFn = null, uMap = null, vK = 1, cMin = 0, capStart = true, capEnd = true } = opts;
  const base = geo.n;
  const row = seg + 1;
  let v = 0;
  const up = new V3();
  const side = new V3();
  const p = new V3();
  const colorOf = (R, sn, cs) => {
    const c = colorFn ? colorFn(R, sn, cs) : null;
    const k = R.shade ?? 1;
    if (k === 1) return c;
    const cc = c || [1, 1, 1];
    return [cc[0] * k, cc[1] * k, cc[2] * k];
  };
  for (let r = 0; r < rings.length; r++) {
    const R = rings[r];
    if (r > 0) {
      const C = Math.max(cMin, (ringCirc(R) + ringCirc(rings[r - 1])) / 2);
      v += (R.c.distanceTo(rings[r - 1].c) / C) * vK;
    }
    up.crossVectors(R.t, AXIS_X);
    if (up.lengthSq() < 1e-6) up.set(0, 1, 0);
    up.normalize();
    side.crossVectors(up, R.t).normalize();
    const e = 2 / (R.pw ?? 2);
    const wt = R.wt ?? 1;
    for (let s = 0; s <= seg; s++) {
      const th = (s / seg) * TAU;
      const sn = Math.sin(th);
      const cs = Math.cos(th);
      const hh = cs > 0 ? R.hb : R.ht;
      const sx = e === 1 ? sn : Math.sign(sn) * Math.pow(Math.abs(sn), e);
      const sy = e === 1 ? cs : Math.sign(cs) * Math.pow(Math.abs(cs), e);
      const ww = cs < 0 && wt !== 1 ? R.w * lerp(1, wt, Math.min(1, -cs * 1.3)) : R.w;
      p.copy(R.c).addScaledVector(side, ww * sx).addScaledVector(up, -sy * hh);
      geo.add(p, uMap ? uMap(s / seg) : s / seg, v, R.weights, colorOf(R, sn, cs));
    }
    geo.seams.push([base + r * row, base + r * row + seg]);
    if (r > 0) {
      const a0 = base + (r - 1) * row;
      const b0 = base + r * row;
      for (let s = 0; s < seg; s++) {
        geo.tri(g, a0 + s, a0 + s + 1, b0 + s);
        geo.tri(g, a0 + s + 1, b0 + s + 1, b0 + s);
      }
    }
  }
  if (capStart) {
    const R = rings[0];
    const c = geo.add(R.c.clone().addScaledVector(R.t, -Math.min(R.w, R.ht) * 0.4), 0.5, 0, R.weights, colorOf(R, 0, 0));
    for (let s = 0; s < seg; s++) geo.tri(g, c, base + s + 1, base + s);
  }
  if (capEnd) {
    const R = rings[rings.length - 1];
    const e = base + (rings.length - 1) * row;
    const c = geo.add(R.c.clone().addScaledVector(R.t, Math.min(R.w, R.ht) * 0.4), 0.5, v, R.weights, colorOf(R, 0, 0));
    for (let s = 0; s < seg; s++) geo.tri(g, c, e + s, e + s + 1);
  }
}

// Pesos ao longo de uma cadeia: owners[k] é o osso dono do intervalo k.
// Nas juntas o peso é 50/50 e a mistura se estende por "raio" ao redor dela.
function chainWeightFn(lengths, owners, jointScale = []) {
  return (k, s) => {
    const L = lengths[k];
    const o = owners[k];
    const w = [[o, 1]];
    const d0 = s * L;
    const d1 = (1 - s) * L;
    if (k > 0) {
      const R = 0.5 * Math.min(L, lengths[k - 1]) * (jointScale[k] ?? 1);
      if (d0 < R) {
        const pw = 0.5 * (1 - d0 / R);
        w[0][1] -= pw;
        w.push([owners[k - 1], pw]);
      }
    }
    if (k < lengths.length - 1) {
      const R = 0.5 * Math.min(L, lengths[k + 1]) * (jointScale[k + 1] ?? 1);
      if (d1 < R) {
        const nw = 0.5 * (1 - d1 / R);
        w[0][1] -= nw;
        w.push([owners[k + 1], nw]);
      }
    }
    return w;
  };
}

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// Amostra um perfil [z, y, w, ht, hb, wt?, pw?] com Catmull-Rom.
function sampleProfile(prof0, spacing) {
  const prof = prof0.map(pad7);
  const out = [];
  for (let i = 0; i < prof.length - 1; i++) {
    const a = prof[i];
    const b = prof[i + 1];
    const p0 = prof[Math.max(0, i - 1)];
    const p3 = prof[Math.min(prof.length - 1, i + 2)];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const n = Math.max(2, Math.ceil(len / spacing));
    for (let k = 0; k < n; k++) {
      const t = k / n;
      out.push(a.map((_, j) => catmull(p0[j], a[j], b[j], p3[j], t)));
    }
  }
  out.push(prof[prof.length - 1].slice());
  for (const r of out) for (let j = 2; j < 5; j++) r[j] = Math.max(r[j], 0.004);
  return out;
}

// Interpolação linear do perfil numa posição z.
export function profileAt(prof0, z) {
  const prof = prof0.map(pad7);
  if (z <= prof[0][0]) return prof[0];
  for (let i = 0; i < prof.length - 1; i++) {
    const a = prof[i];
    const b = prof[i + 1];
    if (z <= b[0]) {
      const t = (z - a[0]) / (b[0] - a[0]);
      return a.map((v, j) => lerp(v, b[j], t));
    }
  }
  return prof[prof.length - 1];
}

function ringsFromProfile(samples, weightFn) {
  const rings = [];
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const prev = samples[Math.max(0, i - 1)];
    const next = samples[Math.min(samples.length - 1, i + 1)];
    const t = new V3(0, next[1] - prev[1], next[0] - prev[0]).normalize();
    rings.push({ c: new V3(0, s[1], s[0]), t, w: s[2], ht: s[3], hb: s[4], wt: s[5], pw: s[6], z: s[0], weights: weightFn(s[0]) });
  }
  return rings;
}

// Tubo ao longo de uma cadeia de nós {p, r}. r é um número (achatado em x por
// "flat") ou [lado, frente, trás] para modelar músculos (coxa, panturrilha).
// "ao" escurece o começo do tubo (dobra onde a perna encontra o corpo).
function chainTube(geo, g, nodes, owners, seg, spacing, flat = 0.82, opts = {}) {
  const { cMin = 0, ao = 0 } = opts;
  const lengths = [];
  for (let k = 0; k < nodes.length - 1; k++) lengths.push(nodes[k].p.distanceTo(nodes[k + 1].p));
  const wf = chainWeightFn(lengths, owners);
  const rings = [];
  const dir = (k) => nodes[k + 1].p.clone().sub(nodes[k].p).normalize();
  const aoLen = (lengths[0] + (lengths[1] ?? 0)) * 1.1;
  let dist = 0;
  const shadeAt = (d) => (ao ? lerp(1 - ao, 1, smoothstep(0, aoLen, d)) : 1);
  const radOf = (nd) => (Array.isArray(nd.r) ? { w: nd.r[0], ht: nd.r[1], hb: nd.r[2] } : { w: nd.r * flat, ht: nd.r, hb: nd.r });
  for (let k = 0; k < nodes.length - 1; k++) {
    const n = Math.max(2, Math.ceil(lengths[k] / spacing));
    const dk = dir(k);
    for (let i = 0; i < n; i++) {
      const s = i / n;
      const t = dk.clone();
      if (i === 0 && k > 0) t.add(dir(k - 1)).normalize();
      const ra = radOf(nodes[k]);
      const rb = radOf(nodes[k + 1]);
      const ss = smooth(s);
      const d = dist + lengths[k] * s;
      rings.push({
        c: nodes[k].p.clone().lerp(nodes[k + 1].p, s),
        t,
        w: lerp(ra.w, rb.w, ss),
        ht: lerp(ra.ht, rb.ht, ss),
        hb: lerp(ra.hb, rb.hb, ss),
        weights: wf(k, s),
        shade: shadeAt(d),
      });
    }
    dist += lengths[k];
  }
  const last = nodes.length - 1;
  const rl = radOf(nodes[last]);
  rings.push({
    c: nodes[last].p.clone(),
    t: dir(last - 1),
    w: rl.w,
    ht: rl.ht,
    hb: rl.hb,
    weights: wf(last - 1, 1),
    shade: shadeAt(dist),
  });
  loft(geo, g, rings, seg, { cMin });
}

// Cone orientado (dente, garra, chifre, espinho) de "base" até "base + dir*len".
function addCone(geo, g, base, dir, len, radius, weights, segs = 6, curve = 0) {
  const geom = new THREE.ConeGeometry(radius, len, segs, 3);
  if (curve) {
    // curva a ponta (garras)
    const p = geom.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / len + 0.5;
      p.setZ(i, p.getZ(i) + curve * len * y * y);
    }
  }
  geom.translate(0, len / 2, 0);
  const d = dir.clone().normalize();
  const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d);
  const m = new THREE.Matrix4().compose(base, q, new V3(1, 1, 1));
  geo.addGeometry(g, geom, m, weights);
  geom.dispose();
}

// ---------------------------------------------------------------------------
// Montagem do esqueleto e da malha de uma espécie
// ---------------------------------------------------------------------------
function buildSpecies(spec, quality) {
  const prof = spec.body;
  const len = prof[prof.length - 1][0] - prof[0][0];
  const cy = (z) => profileAt(prof, z)[1];
  // espécies com "detail" > 1 (o tiranossauro) ganham malha mais densa
  const det = spec.detail ?? 1;
  const seg = 2 * Math.round(((quality === 'low' ? 12 : quality === 'ultra' ? 26 : 18) * det) / 2);
  const legSeg = 2 * Math.round(((quality === 'low' ? 8 : quality === 'ultra' ? 16 : 12) * det) / 2);
  const spacing = len / ((quality === 'low' ? 50 : quality === 'ultra' ? 120 : 80) * det);
  const rv = (x) => (Array.isArray(x) ? x[0] : x);
  const maxC = Math.max(...prof.map((p) => ellipseCirc(p[2], (p[3] + p[4]) / 2)));
  const cMinBody = maxC * 0.2;
  const cMinLimb = maxC * 0.1;

  // olhos (posição na superfície da cabeça)
  const eyeInfo = [];
  {
    const e = spec.eye;
    const pr = profileAt(prof, e.z);
    const y = pr[1] + pr[3] * e.yFrac;
    const x = surfX(pr, e.yFrac) - e.r * 0.35;
    for (const sd of [1, -1]) {
      // fwd > 0.3: olhos voltados para a frente (visão binocular do tiranossauro)
      const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 0, 1), new V3(sd, 0.12, e.fwd ?? 0.3).normalize());
      eyeInfo.push({ sd, sfx: sd > 0 ? 'L' : 'R', center: new V3(x * sd, y, e.z), q });
    }
  }

  // ---- ossos ----
  const bones = [];
  const B = {};
  const addBone = (name, parent, p) => {
    B[name] = bones.length;
    bones.push({ name, parent: parent == null ? -1 : B[parent], p: new V3(...p) });
  };
  addBone('root', null, [0, 0, 0]);
  addBone('pelvis', 'root', [0, cy(0), 0]);
  let prev = 'pelvis';
  spec.tail.forEach((z, i) => {
    addBone('tail' + i, prev, [0, cy(z), z]);
    prev = 'tail' + i;
  });
  prev = 'pelvis';
  spec.spine.forEach((z, i) => {
    addBone('spine' + i, prev, [0, cy(z), z]);
    prev = 'spine' + i;
  });
  const chest = prev;
  spec.neck.forEach((z, i) => {
    addBone('neck' + i, prev, [0, cy(z), z]);
    prev = 'neck' + i;
  });
  addBone('head', prev, [0, cy(spec.head), spec.head]);
  addBone('jaw', 'head', [0, spec.jawHinge[0], spec.jawHinge[1]]);
  for (const e of eyeInfo) {
    addBone('eye' + e.sfx, 'head', e.center.toArray());
    addBone('lid' + e.sfx, 'head', e.center.toArray());
  }

  const legs = [];
  const sides = [1, -1];
  const legDefs = [{ key: 'hind', d: spec.hind, parent: 'pelvis', names: ['thigh', 'shin', 'meta', 'toe'], front: false }];
  if (spec.fore) legDefs.push({ key: 'fore', d: spec.fore, parent: chest, names: ['uarm', 'farm', 'hand', 'fing'], front: true });
  for (const L of legDefs) {
    for (const sd of sides) {
      const sfx = sd > 0 ? 'L' : 'R';
      const d = L.d;
      const j0 = d.hip ?? d.shoulder;
      const j1 = d.knee ?? d.elbow;
      const j2 = d.ankle ?? d.wrist;
      const j3 = d.ball;
      const P = [j0, j1, j2, j3].map((a) => new V3(a[0] * sd, a[1], a[2]));
      L.names.forEach((nm, i) => addBone(nm + sfx, i === 0 ? L.parent : L.names[i - 1] + sfx, P[i].toArray()));
      legs.push({ L, sd, sfx, P, d });
    }
  }
  const arms = [];
  if (spec.arms) {
    for (const sd of sides) {
      const sfx = sd > 0 ? 'L' : 'R';
      const a = spec.arms;
      const P = [a.shoulder, a.elbow, a.wrist, a.tip].map((v) => new V3(v[0] * sd, v[1], v[2]));
      addBone('uarm' + sfx, chest, P[0].toArray());
      addBone('farm' + sfx, 'uarm' + sfx, P[1].toArray());
      addBone('hand' + sfx, 'farm' + sfx, P[2].toArray());
      arms.push({ sd, sfx, P });
    }
  }

  const geo = new SkinGeo();

  // ---- corpo (cauda → focinho) ----
  const jointZ = [prof[0][0]];
  const jointBone = [null];
  for (let i = spec.tail.length - 1; i >= 0; i--) {
    jointZ.push(spec.tail[i]);
    jointBone.push(B['tail' + i]);
  }
  const pelvisJ = jointZ.length;
  jointZ.push(0);
  jointBone.push(B.pelvis);
  spec.spine.forEach((z, i) => {
    jointZ.push(z);
    jointBone.push(B['spine' + i]);
  });
  spec.neck.forEach((z, i) => {
    jointZ.push(z);
    jointBone.push(B['neck' + i]);
  });
  const headJ = jointZ.length;
  jointZ.push(spec.head);
  jointBone.push(B.head);
  jointZ.push(prof[prof.length - 1][0] + 0.001);
  jointBone.push(null);
  const owners = [];
  const lengths = [];
  for (let k = 0; k < jointZ.length - 1; k++) {
    owners.push(k + 1 <= pelvisJ ? jointBone[k + 1] : jointBone[k]);
    lengths.push(jointZ[k + 1] - jointZ[k]);
  }
  const jointScale = [];
  jointScale[headJ] = 0.45;
  const bodyWF = chainWeightFn(lengths, owners, jointScale);
  const bodyWeights = (z) => {
    for (let k = 0; k < lengths.length; k++) {
      if (z <= jointZ[k + 1] || k === lengths.length - 1) {
        return bodyWF(k, clamp((z - jointZ[k]) / lengths[k], 0, 1));
      }
    }
    return [[B.pelvis, 1]];
  };

  const headStart = spec.head;
  const snoutZ = prof[prof.length - 1][0];
  const headLen = snoutZ - headStart;
  const mouthCol = [0.55, 0.2, 0.2];
  const lipCol = [0.5, 0.44, 0.4];
  const beakCol = [0.32, 0.28, 0.24];
  const maskCol = [0.72, 0.68, 0.64];
  const bodyColor = (R, sn, cs) => {
    if (R.z > headStart + headLen * 0.25 && cs > 0.86) return mouthCol;
    if (spec.beak && R.z > snoutZ - headLen * 0.22) return beakCol;
    if (R.z > headStart + headLen * 0.2 && cs > 0.5) return lipCol;
    // máscara escura no alto do focinho e da cabeça
    if (spec.faceMask && R.z > headStart - headLen * 0.1 && cs < -0.25) return maskCol;
    return null;
  };
  loft(geo, G_SKIN, ringsFromProfile(sampleProfile(prof, spacing), bodyWeights), seg, { colorFn: bodyColor, cMin: cMinBody });

  // ---- mandíbula ----
  const jaw = spec.jaw;
  const jawEnd = jaw[jaw.length - 1][0];
  const jawColor = (R, sn, cs) => {
    if (cs < -0.9) return mouthCol;
    if (spec.beak && R.z > jawEnd - headLen * 0.22) return beakCol;
    if (cs < -0.4) return lipCol;
    return null;
  };
  loft(geo, G_SKIN, ringsFromProfile(sampleProfile(jaw, spacing * 0.7), () => [[B.jaw, 1]]), seg, { colorFn: jawColor, cMin: cMinBody });

  // ---- pernas ----
  for (const leg of legs) {
    const { L, sd, sfx, P, d } = leg;
    const r = d.r;
    const top = P[0].clone().add(new V3(-sd * rv(r[0]) * 0.3, rv(r[0]) * 0.55, -0.02));
    const nodes = [
      { p: top, r: r[0] },
      { p: P[0], r: r[1] },
      { p: P[0].clone().lerp(P[1], 0.5), r: r[2] },
      { p: P[1], r: r[3] },
      { p: P[1].clone().lerp(P[2], 0.5), r: r[4] },
      { p: P[2], r: r[5] },
      { p: P[3], r: r[6] },
    ];
    const n = L.names.map((nm) => B[nm + sfx]);
    const parentBone = B[L.parent];
    chainTube(geo, G_LIMB, nodes, [parentBone, n[0], n[0], n[1], n[1], n[2]], legSeg, spacing * 0.8, L.front ? 0.9 : 0.78, { cMin: cMinLimb, ao: spec.legAo ?? 0.3 });
    // dedos
    const toeAngles = d.toeLen < 0.3 && spec.quadruped ? [-0.5, -0.17, 0.17, 0.5] : [-0.38, 0, 0.38];
    const rt = rv(r[7]);
    const stubby = d.toeLen < 0.3 && spec.quadruped;
    for (const a of toeAngles) {
      const outer = Math.abs(a) > 0.3 ? 0.78 : 1;
      const tl = d.toeLen * outer;
      const dir = new V3(Math.sin(a) * sd, -0.1, Math.cos(a)).normalize();
      const start = P[3].clone().addScaledVector(dir, -rt * 0.6);
      const tip = P[3].clone().addScaledVector(dir, tl);
      tip.y = Math.max(rt * 0.3, tip.y);
      // dedos longos: almofadas entre as juntas (falanges) e um leve arco
      const prof2 = stubby
        ? [[0, 1.15], [0.5, 0.85], [1, 0.4]]
        : [[0, 1.15], [0.3, 1.0], [0.42, 0.84], [0.62, 0.9], [0.74, 0.72], [1, 0.38]];
      const toeNodes = prof2.map(([t, k]) => ({
        p: start.clone().lerp(tip, t).add(new V3(0, stubby ? 0 : Math.sin(Math.PI * t) * rt * 0.3, 0)),
        r: rt * k,
      }));
      chainTube(geo, G_LIMB, toeNodes, toeNodes.slice(1).map(() => n[3]), Math.max(6, legSeg - 4), spacing * 0.7, 1.1, { cMin: cMinLimb });
      if (d.claws) {
        addCone(geo, G_IVORY, tip.clone().addScaledVector(dir, -rt * 0.2), dir.clone().add(new V3(0, -0.35, 0)), rt * 2.4, rt * 0.45, [[n[3], 1]], 6, 0.25);
      } else {
        addCone(geo, G_IVORY, tip.clone().addScaledVector(dir, -rt * 0.3), dir.clone().add(new V3(0, -0.5, 0)), rt * 0.9, rt * 0.55, [[n[3], 1]], 6);
      }
    }
    if (d.sickle) {
      const base = P[3].clone().add(new V3(-sd * rt * 0.9, rt * 1.2, rt * 0.4));
      addCone(geo, G_IVORY, base, new V3(-sd * 0.1, 0.75, 0.6), rt * 4.2, rt * 0.6, [[n[3], 1]], 6, -0.45);
    }
    if (d.dewclaw) {
      // esporão (1º dedo) atrás do metatarso, sem tocar o chão
      const ra = rv(r[5]);
      const base = P[2].clone().lerp(P[3], 0.62).add(new V3(-sd * ra * 0.7, 0, -ra * 0.55));
      const dirD = new V3(-sd * 0.35, -0.5, -0.8).normalize();
      const tipD = base.clone().addScaledVector(dirD, d.toeLen * 0.3);
      chainTube(geo, G_LIMB, [{ p: base, r: rt * 0.8 }, { p: base.clone().lerp(tipD, 0.5), r: rt * 0.62 }, { p: tipD, r: rt * 0.35 }], [n[2], n[2]], Math.max(6, legSeg - 6), spacing * 0.6, 1, { cMin: cMinLimb });
      addCone(geo, G_IVORY, tipD.clone().addScaledVector(dirD, -rt * 0.15), dirD.clone().add(new V3(0, -0.3, 0)), rt * 1.6, rt * 0.32, [[n[2], 1]], 5, 0.25);
    }
  }

  // ---- braços (bípedes) ----
  for (const arm of arms) {
    const { sd, sfx, P } = arm;
    const r = spec.arms.r;
    const ua = B['uarm' + sfx];
    const fa = B['farm' + sfx];
    const ha = B['hand' + sfx];
    const top = P[0].clone().add(new V3(-sd * r[0] * 0.8, r[0] * 0.6, 0));
    chainTube(
      geo,
      G_LIMB,
      [
        { p: top, r: r[0] * 1.15 },
        { p: P[0], r: r[0] },
        { p: P[1], r: r[1] },
        { p: P[2], r: r[2] },
        { p: P[3], r: r[3] },
      ],
      [B[chest], ua, fa, ha],
      legSeg - 2,
      spacing * 0.6,
      0.85,
      { cMin: cMinLimb, ao: 0.22 },
    );
    const handDir = P[3].clone().sub(P[2]).normalize();
    const nFingers = spec.arms.fingers ?? 3;
    for (let f = 0; f < nFingers; f++) {
      const off = (f - (nFingers - 1) / 2) * 0.35;
      const dir = handDir.clone().add(new V3(off * sd * 0.5, -0.2 + Math.abs(off) * 0.2, 0)).normalize();
      const tip = P[3].clone().addScaledVector(dir, r[3] * 2.2);
      addCone(geo, G_IVORY, tip, dir.clone().add(new V3(0, -0.5, 0)), r[3] * 2.2, r[3] * 0.45, [[ha, 1]], 5, 0.3);
    }
    if (spec.arms.feathers) {
      // penas no antebraço
      for (let f = 0; f < 5; f++) {
        const t = f / 4;
        const base = P[1].clone().lerp(P[3], t);
        const dir = new V3(sd * 0.25, -1, -0.45).normalize();
        const geom = new THREE.PlaneGeometry(r[1] * 1.4, r[1] * 5.5 * (1 - t * 0.3));
        geom.translate(0, -r[1] * 2.6, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, -1, 0), dir);
        q.multiply(new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), Math.PI / 2));
        geo.addGeometry(G_ACCENT, geom, new THREE.Matrix4().compose(base, q, new V3(1, 1, 1)), [[t < 0.5 ? fa : ha, 1]]);
        geom.dispose();
      }
    }
  }

  // ---- olhos, pálpebras e narinas ----
  for (const { sd, sfx, center, q } of eyeInfo) {
    const e = spec.eye;
    const geom = new THREE.SphereGeometry(e.r, 16, 12);
    const p = geom.attributes.position;
    const uv = geom.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, (p.getX(i) / e.r) * 0.5 + 0.5, (p.getY(i) / e.r) * 0.5 + 0.5);
    const m = new THREE.Matrix4().compose(center, q, new V3(1, 1, 1));
    geo.addGeometry(G_EYE, geom, m, [[B['eye' + sfx], 1]]);
    geom.dispose();
    // pálpebra: casca da frente do olho, guardada girada para cima/trás
    const lid = new THREE.SphereGeometry(e.r * 1.14, 16, 10, 0, Math.PI, 0, Math.PI);
    lid.rotateX(-LID_OPEN);
    geo.addGeometry(G_SKIN, lid, m, [[B['lid' + sfx], 1]], [0.8, 0.75, 0.7]);
    lid.dispose();
    // arcada sobre o olho
    const brow = new THREE.SphereGeometry(e.r * 1.3, 12, 6, 0, TAU, 0, Math.PI / 2);
    const qb = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.25, 0, -sd * 0.35));
    geo.addGeometry(G_SKIN, brow, new THREE.Matrix4().compose(center.clone().setX(center.x * 0.94).setY(center.y + e.r * 0.2), qb, new V3(1, 0.6, 1.4)), [[B.head, 1]], [0.85, 0.8, 0.75]);
    brow.dispose();
  }
  {
    const nz = snoutZ - headLen * 0.1;
    const pn = profileAt(prof, nz);
    const nr = Math.max(pn[2], 0.02) * 0.22;
    for (const sd of sides) {
      const g2 = new THREE.SphereGeometry(1, 8, 6);
      const m = new THREE.Matrix4().compose(
        new V3(sd * pn[2] * 0.72, pn[1] + pn[3] * 0.5, nz),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sd * 0.45, 0)),
        new V3(nr * 0.6, nr * 0.45, nr * 1.3),
      );
      geo.addGeometry(G_SKIN, g2, m, [[B.head, 1]], [0.1, 0.08, 0.07]);
      g2.dispose();
    }
  }

  // ---- dentes ----
  if (spec.teeth) {
    const t = spec.teeth;
    for (let i = 0; i < t.n; i++) {
      const z = lerp(t.from, t.to, i / (t.n - 1));
      const pr = profileAt(prof, z);
      const jr = profileAt(jaw, z);
      const thick = t.thick ?? 0.28;
      for (const sd of sides) {
        // cada dente com tamanho e inclinação um pouco diferentes
        const h1 = hash01(i * 7 + (sd > 0 ? 1 : 2));
        const h2 = hash01(i * 13 + (sd > 0 ? 5 : 9));
        const l = t.len * (0.7 + 0.5 * Math.sin((i / (t.n - 1)) * Math.PI)) * (0.8 + 0.4 * h1);
        const ub = new V3(surfX(pr, -0.72) * 0.9 * sd, pr[1] - pr[4] * 0.66, z);
        addCone(geo, G_IVORY, ub, new V3(sd * (h2 - 0.5) * 0.15, -1, 0.15 + h2 * 0.1), l, l * thick, [[B.head, 1]], 6, -0.15);
        const lb = new V3(surfX(jr, 0.6) * 0.9 * sd, jr[1] + jr[3] * 0.55, z + 0.02);
        addCone(geo, G_IVORY, lb, new V3(sd * (h1 - 0.5) * 0.12, 1, 0.1), l * (0.65 + 0.25 * h2), l * thick * 0.9, [[B.jaw, 1]], 6);
      }
    }
  }

  // ---- língua (aparece com a boca aberta) ----
  {
    const j0 = jaw[0][0];
    const jl = jawEnd - j0;
    const zc = j0 + jl * 0.45;
    const jr = profileAt(jaw, zc);
    const g2 = new THREE.SphereGeometry(1, 14, 8);
    const m = new THREE.Matrix4().compose(new V3(0, jr[1] + jr[3] * 0.45, zc), new THREE.Quaternion(), new V3(jr[2] * 0.5, jr[3] * 0.42, jl * 0.36));
    geo.addGeometry(G_MOUTH, g2, m, [[B.jaw, 1]]);
    g2.dispose();
  }

  // ---- extras ----
  const extras = spec.extras ?? [];
  if (extras.includes('frill')) {
    const z = spec.head - 0.1;
    const pr = profileAt(prof, z + 0.2);
    const center = new V3(0, pr[1] + pr[3] * 0.75, z - 0.25);
    const geom = new THREE.SphereGeometry(1, 28, 14);
    {
      // UV radial: v = 0 no centro, 1 na borda (degradê e vasos da textura)
      const p = geom.attributes.position;
      const uv = geom.attributes.uv;
      for (let i = 0; i < p.count; i++) {
        uv.setXY(i, Math.atan2(p.getY(i), p.getX(i)) / TAU + 0.5, Math.min(1, Math.hypot(p.getX(i), p.getY(i))));
      }
    }
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.95, 0, 0));
    const m = new THREE.Matrix4().compose(center, q, new V3(1.25, 1.12, 0.2));
    geo.addGeometry(G_ACCENT, geom, m, [[B.head, 1]]);
    geom.dispose();
    // espinhos na borda do escudo
    for (let i = 0; i < 13; i++) {
      const a = -1.35 + (i / 12) * 2.7;
      const local = new V3(Math.sin(a) * 1.2, Math.cos(a) * 1.07, 0).applyQuaternion(q);
      const base = center.clone().add(local);
      addCone(geo, G_IVORY, base, local.clone().normalize(), 0.16, 0.07, [[B.head, 1]], 5);
    }
  }
  if (extras.includes('horns')) {
    for (const sd of sides) {
      const pr = profileAt(prof, 3.45);
      addCone(geo, G_IVORY, new V3(0.24 * sd, pr[1] + pr[3] * 0.72, 3.4), new V3(0.18 * sd, 0.55, 1), 1.05, 0.11, [[B.head, 1]], 8, 0.12);
    }
    const pn = profileAt(prof, 4.3);
    addCone(geo, G_IVORY, new V3(0, pn[1] + pn[3] * 0.8, 4.28), new V3(0, 1, 0.45), 0.36, 0.1, [[B.head, 1]], 8);
  }
  if (extras.includes('crest')) {
    const pr = profileAt(prof, 3.6);
    const curve = new THREE.CatmullRomCurve3([
      new V3(0, pr[1] + pr[3] * 0.4, 3.75),
      new V3(0, pr[1] + pr[3] * 0.95, 3.45),
      new V3(0, 3.95, 2.95),
      new V3(0, 4.12, 2.42),
      new V3(0, 4.06, 2.2),
    ]);
    const geom = new THREE.TubeGeometry(curve, 24, 0.085, 8, false);
    {
      // v ao longo da crista (base → ponta)
      const uv = geom.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i), uv.getX(i));
    }
    geo.addGeometry(G_ACCENT, geom, new THREE.Matrix4(), [[B.head, 1]]);
    geom.dispose();
    const capG = new THREE.SphereGeometry(0.085, 8, 6);
    geo.addGeometry(G_ACCENT, capG, new THREE.Matrix4().makeTranslation(0, 4.06, 2.2), [[B.head, 1]]);
    capG.dispose();
  }
  if (extras.includes('plates')) {
    const zs = [];
    for (let z = 2.25; z > -3.0; z -= 0.42) zs.push(z);
    zs.forEach((z, i) => {
      const pr = profileAt(prof, z);
      const t = (z - 2.25) / -5.25;
      const h = 0.28 + 0.72 * Math.sin(Math.PI * clamp(t * 1.15, 0, 1)) * (1 - t * 0.25);
      const w = h * 0.9;
      const shape = new THREE.Shape();
      shape.moveTo(-w * 0.35, 0);
      shape.quadraticCurveTo(-w * 0.62, h * 0.55, 0, h);
      shape.quadraticCurveTo(w * 0.62, h * 0.55, w * 0.35, 0);
      shape.lineTo(-w * 0.35, 0);
      const geom = new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.025, bevelSize: 0.025, bevelSegments: 1, curveSegments: 6 });
      // UV planar para a textura de destaque
      const p = geom.attributes.position;
      const uv = geom.attributes.uv;
      for (let k = 0; k < p.count; k++) uv.setXY(k, p.getX(k) / w + 0.5, p.getY(k) / h);
      const sd = i % 2 ? 1 : -1;
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 2, sd * 0.12, 'YXZ'));
      const m = new THREE.Matrix4().compose(new V3(sd * 0.07, pr[1] + pr[3] - 0.08, z), q, new V3(1, 1, 1));
      geo.addGeometry(G_ACCENT, geom, m, bodyWeights(z));
      geom.dispose();
    });
  }
  if (extras.includes('spikes')) {
    for (const z of [-3.35, -3.65]) {
      const pr = profileAt(prof, z);
      for (const sd of sides) {
        addCone(geo, G_IVORY, new V3(0.04 * sd, pr[1] + pr[3] * 0.5, z), new V3(0.85 * sd, 0.55, -0.35), 0.8, 0.07, bodyWeights(z), 7);
      }
    }
  }

  // barro e terra nos pés (cor por vértice)
  {
    const hipY0 = cy(0);
    const skinV = new Set([...geo.groups[G_SKIN], ...geo.groups[G_LIMB]]);
    for (const k of skinV) {
      const m = smoothstep(hipY0 * 0.24, hipY0 * 0.02, geo.pos[k * 3 + 1]) * 0.85;
      if (m <= 0) continue;
      geo.col[k * 3] *= lerp(1, 0.6, m);
      geo.col[k * 3 + 1] *= lerp(1, 0.5, m);
      geo.col[k * 3 + 2] *= lerp(1, 0.4, m);
    }
  }
  // músculos e saliências (espelhados nos dois lados)
  const sculpt = [];
  for (const b of spec.sculpt ?? []) {
    const group = b.part === 'limb' ? G_LIMB : b.part === 'all' ? undefined : G_SKIN;
    sculpt.push({ c: b.c, r: b.r, a: b.a, group });
    if (b.c[0] !== 0 && b.mirror !== false) sculpt.push({ c: [-b.c[0], b.c[1], b.c[2]], r: b.r, a: b.a, group });
  }
  if (spec.rugosity) {
    // calombos ásperos no alto do focinho
    const ru = spec.rugosity;
    for (let i = 0; i < ru.n; i++) {
      const z = lerp(ru.from, ru.to, i / Math.max(1, ru.n - 1));
      const pr = profileAt(prof, z);
      for (const sd of sides) sculpt.push({ c: [ru.x * sd, pr[1] + pr[3] * 0.97, z], r: [ru.r, ru.r * 0.8, ru.r], a: ru.a * (0.7 + 0.6 * hash01(i * 3 + sd)), group: G_SKIN });
    }
  }
  const geometry = geo.build(sculpt);

  // medidas úteis para animação e jogabilidade
  const hipY = cy(0);
  const legInfo = legs.map(({ L, sd, sfx, P, d }) => {
    const names = L.names.map((nm) => nm + sfx);
    const rel = [P[1].clone().sub(P[0]), P[2].clone().sub(P[1]), P[3].clone().sub(P[2])];
    const toeTip = new V3(0, -0.05 * d.toeLen, d.toeLen);
    const phi = (v) => Math.atan2(v.z, v.y);
    return {
      names,
      side: sd,
      front: L.front,
      kneeSign: L.front ? -1 : 1,
      hip: P[0].clone(),
      ball: P[3].clone(),
      L: rel.map((v) => Math.hypot(v.y, v.z)),
      rest: [phi(rel[0]), phi(rel[1]), phi(rel[2]), phi(toeTip)],
      footR: rv(d.r[6]),
      parent: L.parent,
    };
  });
  const jawTip = new V3(0, jaw[jaw.length - 1][1], jaw[jaw.length - 1][0]);
  const maxW = Math.max(...prof.map((p) => p[2]));
  return {
    geometry,
    bones,
    legInfo,
    chest,
    hipY,
    length: len,
    tailZ: prof[0][0],
    snoutZ,
    mouth: new V3(0, (jawTip.y + cy(snoutZ)) / 2, snoutZ - headLen * 0.15),
    headY: cy(spec.head),
    width: maxW,
    // parte mais baixa do tronco (do quadril ao peito): é ela que toca o chão ao deitar
    bellyY: Math.min(...[0, 0.5, ...spec.spine].map((z) => cy(z) - profileAt(prof, z)[4])),
    radius: geometry.boundingSphere.radius,
    center: geometry.boundingSphere.center.clone(),
    nTail: spec.tail.length,
    nSpine: spec.spine.length,
    nNeck: spec.neck.length,
    lids: eyeInfo.map((e) => ({ name: 'lid' + e.sfx, axis: new V3(1, 0, 0).applyQuaternion(e.q), open: LID_OPEN })),
    eyes: eyeInfo.map((e) => ({ name: 'eye' + e.sfx, side: e.sd })),
  };
}

// ---------------------------------------------------------------------------
// Materiais e cache por espécie
// ---------------------------------------------------------------------------
const cache = new Map();
let ivoryTex = null;

// Microdetalhe: soma um segundo mapa normal repetido (poros/escamas miúdas).
function addDetailNormal(mat, tex, rep, strength) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.detailNormal = { value: tex };
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D detailNormal;').replace(
      '#include <normal_fragment_maps>',
      THREE.ShaderChunk.normal_fragment_maps.replace(
        'mapN.xy *= normalScale;',
        `mapN.xy *= normalScale;
        vec3 dN = texture2D( detailNormal, vNormalMapUv * ${rep.toFixed(1)} ).xyz * 2.0 - 1.0;
        mapN = normalize( vec3( mapN.xy + dN.xy * ${strength.toFixed(2)}, mapN.z ) );`,
      ),
    );
  };
  mat.customProgramCacheKey = () => 'dino-detail';
}

let detailTex = null;

const skinSeed = (id) => id.length * 97 + id.charCodeAt(0);

// Gera todas as peles em paralelo (Web Workers) e monta as espécies.
export async function prepareAllSpecies(ids, quality, onProgress) {
  const jobs = [];
  for (const id of ids) {
    jobs.push({ skin: SPECIES[id].skin, seed: skinSeed(id), limb: false });
    jobs.push({ skin: SPECIES[id].skin, seed: skinSeed(id) + 5, limb: true });
  }
  const res = await makeSkinsParallel(jobs, onProgress);
  ids.forEach((id, i) => prepareSpecies(id, quality, { skin: skinFromData(res[i * 2]), limb: skinFromData(res[i * 2 + 1]) }));
}

export function prepareSpecies(id, quality, pre = null) {
  const key = id + ':' + quality;
  if (cache.has(key)) return cache.get(key);
  const spec = SPECIES[id];
  const data = buildSpecies(spec, quality);
  const skin = pre ? pre.skin : makeSkin(spec.skin, skinSeed(id));
  const accentHex = spec.frillColor ?? spec.crestColor ?? spec.plateColor ?? spec.skin.dark;
  const edge = new THREE.Color(accentHex).lerp(new THREE.Color(0xffd29a), 0.35).getHex();
  const accent = makePlate(accentHex, edge, spec.skin.dark, id.charCodeAt(1) * 13);
  if (!ivoryTex) ivoryTex = makeIvory();
  const physical = quality === 'high' || quality === 'ultra';
  const skinParams = {
    map: skin.map,
    normalMap: skin.normalMap,
    normalScale: new THREE.Vector2(1, 1),
    roughnessMap: skin.roughnessMap,
    roughness: 1,
    metalness: 0,
    vertexColors: true,
  };
  // pele: "sheen" dá o brilho aveludado de pele grossa nas bordas
  const skinMat = physical
    ? new THREE.MeshPhysicalMaterial({
        ...skinParams,
        sheen: 0.35,
        sheenRoughness: 0.6,
        sheenColor: new THREE.Color(spec.skin.belly).multiplyScalar(0.45),
      })
    : new THREE.MeshStandardMaterial(skinParams);
  if (quality !== 'low') {
    if (!detailTex) detailTex = makeDetailNormal();
    addDetailNormal(skinMat, detailTex, quality === 'ultra' ? 7 : 5, 0.35);
  }
  const ivoryMat = new THREE.MeshStandardMaterial({ map: ivoryTex, roughness: 0.4, metalness: 0 });
  const eyeTex = makeEye(spec.eye.iris);
  const eyeMat = physical
    ? new THREE.MeshPhysicalMaterial({ map: eyeTex, roughness: 0.4, clearcoat: 1, clearcoatRoughness: 0.03 })
    : new THREE.MeshStandardMaterial({ map: eyeTex, roughness: 0.1, metalness: 0 });
  const accentMat = new THREE.MeshStandardMaterial({
    map: accent.map,
    normalMap: accent.normalMap,
    roughness: 0.62,
    side: THREE.DoubleSide,
  });
  // membros: mesma pele, textura própria
  const limb = pre ? pre.limb : makeSkin(spec.skin, skinSeed(id) + 5, true);
  const limbMat = skinMat.clone();
  limbMat.map = limb.map;
  limbMat.normalMap = limb.normalMap;
  limbMat.roughnessMap = limb.roughnessMap;
  if (quality !== 'low') addDetailNormal(limbMat, detailTex, quality === 'ultra' ? 7 : 5, 0.35);
  const mouthMat = new THREE.MeshStandardMaterial({ color: 0x8a3a36, roughness: 0.32, metalness: 0 });
  const out = { spec, data, materials: [skinMat, ivoryMat, eyeMat, accentMat, limbMat, mouthMat] };
  cache.set(key, out);
  return out;
}

// Cria uma instância (esqueleto próprio, geometria e materiais compartilhados).
export function createDinoModel(id, quality = 'high') {
  const { spec, data, materials } = prepareSpecies(id, quality);
  const boneObjs = data.bones.map((b) => {
    const bone = new THREE.Bone();
    bone.name = b.name;
    return bone;
  });
  data.bones.forEach((b, i) => {
    const bone = boneObjs[i];
    if (b.parent >= 0) {
      bone.position.copy(b.p).sub(data.bones[b.parent].p);
      boneObjs[b.parent].add(bone);
    } else bone.position.copy(b.p);
  });
  const mesh = new THREE.SkinnedMesh(data.geometry, materials);
  mesh.add(boneObjs[0]);
  mesh.bind(new THREE.Skeleton(boneObjs));
  mesh.boundingSphere = new THREE.Sphere(data.center.clone(), data.radius * 1.35);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const bones = {};
  boneObjs.forEach((b) => (bones[b.name] = b));
  const root = new THREE.Group();
  root.add(mesh);
  return { root, mesh, bones, data, spec };
}

// Rig automático: transforma a malha estática do STL num modelo com esqueleto.
// As juntas de cada espécie ficam em species.js (em coordenadas do STL); aqui são
// calculados os pesos de skinning de cada vértice, a mandíbula, os olhos e as
// esferas de acerto de cada osso.
import * as THREE from 'three';
import { parseSTL, weldAndConvert, computeNormals, buildAdjacency } from './stl.js';

// Topologia comum a todos os terópodes do jogo.
// [nome, junta de origem, junta final, pai, lado (+1 esq., -1 dir.), grupo]
const TOPOLOGY = [
  ['pelvis', 'pelvis', 'spine1', null, 0, 'body'],
  ['spine1', 'spine1', 'chest', 'pelvis', 0, 'body'],
  ['chest', 'chest', 'neck1', 'spine1', 0, 'body'],
  ['neck1', 'neck1', 'neck2', 'chest', 0, 'neck'],
  ['neck2', 'neck2', 'head', 'neck1', 0, 'neck'],
  ['head', 'head', 'snout', 'neck2', 0, 'head'],
  ['jaw', 'jaw', 'jawTip', 'head', 0, 'head'],
  ['tail1', 'tail1', 'tail2', 'pelvis', 0, 'tail'],
  ['tail2', 'tail2', 'tail3', 'tail1', 0, 'tail'],
  ['tail3', 'tail3', 'tail4', 'tail2', 0, 'tail'],
  ['tail4', 'tail4', 'tail5', 'tail3', 0, 'tail'],
  ['tail5', 'tail5', 'tail6', 'tail4', 0, 'tail'],
  ['tail6', 'tail6', 'tail7', 'tail5', 0, 'tail'],
  ['tail7', 'tail7', 'tailTip', 'tail6', 0, 'tail'],
];
for (const [s, side] of [
  ['L', 1],
  ['R', -1],
]) {
  TOPOLOGY.push(
    ['thigh' + s, 'hip' + s, 'knee' + s, 'pelvis', side, 'leg'],
    ['shin' + s, 'knee' + s, 'ankle' + s, 'thigh' + s, side, 'leg'],
    ['foot' + s, 'ankle' + s, 'ball' + s, 'shin' + s, side, 'leg'],
    ['toe' + s, 'ball' + s, 'toe' + s, 'foot' + s, side, 'leg'],
    ['arm' + s, 'shoulder' + s, 'elbow' + s, 'chest', side, 'arm'],
    ['forearm' + s, 'elbow' + s, 'wrist' + s, 'arm' + s, side, 'arm'],
    ['hand' + s, 'wrist' + s, 'handTip' + s, 'forearm' + s, side, 'arm'],
  );
}

const _v = new THREE.Vector3();

function segDist(px, py, pz, a, b, out) {
  const abx = b[0] - a[0];
  const aby = b[1] - a[1];
  const abz = b[2] - a[2];
  const l2 = abx * abx + aby * aby + abz * abz || 1e-9;
  let t = ((px - a[0]) * abx + (py - a[1]) * aby + (pz - a[2]) * abz) / l2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const dx = px - (a[0] + abx * t);
  const dy = py - (a[1] + aby * t);
  const dz = pz - (a[2] + abz * t);
  out.t = t;
  return Math.sqrt(dx * dx + dy * dy + dz * dz);
}

function lerpLine(line, y) {
  // line: [[Y, Z], ...] em ordem crescente de Y
  if (y <= line[0][0]) return line[0][1];
  for (let i = 1; i < line.length; i++) {
    if (y <= line[i][0]) {
      const f = (y - line[i - 1][0]) / (line[i][0] - line[i - 1][0]);
      return line[i - 1][1] + (line[i][1] - line[i - 1][1]) * f;
    }
  }
  return line[line.length - 1][1];
}

export async function loadDinoAsset(sp, onProgress) {
  const res = await fetch(new URL('../../' + sp.file, import.meta.url));
  if (!res.ok) throw new Error('Não foi possível carregar ' + sp.file);
  let buf;
  if (sp.file.endsWith('.txt')) {
    // STL em base64 (para hospedagens que só servem arquivos de texto)
    const bin = atob((await res.text()).trim());
    const u8 = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    buf = u8.buffer;
  } else buf = await res.arrayBuffer();
  onProgress && onProgress(0.3);
  return buildDinoAsset(sp, buf);
}

export function buildDinoAsset(sp, buffer) {
  const s = sp.scale;
  const J = sp.joints;
  const originY = J.pelvis[1];
  const toGame = (X, Y, Z, out) => {
    out[0] = X * s;
    out[1] = Z * s;
    out[2] = -(Y - originY) * s;
    return out;
  };
  const soup = parseSTL(buffer);
  const mesh = weldAndConvert(soup, toGame);
  const { position, source, count } = mesh;
  let index = mesh.index;
  // remove "pontes" de malha entre as pernas (artefatos do gerador do modelo):
  // abaixo dos joelhos não existe nada no plano central do corpo
  if (sp.gap) {
    const [gx, gz] = sp.gap;
    const bad = (i) => Math.abs(source[i * 3]) < gx && source[i * 3 + 2] < gz;
    const keep = [];
    for (let t = 0; t < index.length; t += 3) {
      if (bad(index[t]) || bad(index[t + 1]) || bad(index[t + 2])) continue;
      keep.push(index[t], index[t + 1], index[t + 2]);
    }
    index = count < 65536 ? new Uint16Array(keep) : new Uint32Array(keep);
  }
  const normal = computeNormals(position, index);

  // juntas em coordenadas do jogo
  const joint = {};
  for (const k in J) joint[k] = toGame(J[k][0], J[k][1], J[k][2], [0, 0, 0]);

  const bones = TOPOLOGY.map(([name, at, end, parent, side, group]) => ({
    name,
    at,
    end,
    parentName: parent,
    side,
    group,
    head: joint[at],
    tail: joint[end],
  }));
  const boneIndex = {};
  bones.forEach((b, i) => (boneIndex[b.name] = i));
  for (const b of bones) b.parent = b.parentName ? boneIndex[b.parentName] : -1;
  const nB = bones.length;
  for (const b of bones) {
    b.children = [];
    const root = b.group === 'leg' ? joint['hip' + (b.side > 0 ? 'L' : 'R')] : b.group === 'arm' ? joint['shoulder' + (b.side > 0 ? 'L' : 'R')] : null;
    b.limbX = root ? Math.max(Math.abs(root[0]), 0.5 * s) : 1;
    const hipZ = (J.hipL[2] + J.hipR[2]) / 2;
    const lr = sp.limbRadius || {};
    b.claim = (b.group === 'leg' ? lr.leg || 0.22 * hipZ : lr.arm || 0.09 * hipZ) * s;
  }
  for (let i = 0; i < nB; i++) if (bones[i].parent >= 0) bones[bones[i].parent].children.push(i);

  // ---------------------------------------------------------------- pesos
  // 1) cada vértice vai para o osso mais próximo (respeitando o lado das pernas/braços)
  // 2) perto de cada junta o peso é dividido com o osso vizinho (dobras suaves)
  // 3) suavização pela superfície da malha
  const W = new Float32Array(count * nB);
  const sideMargin = sp.sideMargin * s;
  const jawId = boneIndex.jaw;
  const info = { t: 0 };
  const nearest = new Int16Array(count);
  const radiusSum = new Float64Array(nB);
  const radiusCnt = new Float64Array(nB);
  const weightScale = sp.boneWeightScale || {};
  for (let i = 0; i < count; i++) {
    const px = position[i * 3];
    const py = position[i * 3 + 1];
    const pz = position[i * 3 + 2];
    let best = -1;
    let bestD = 1e9;
    let bestT = 0;
    for (let b = 0; b < nB; b++) {
      if (b === jawId) continue;
      const bone = bones[b];
      if (bone.side !== 0 && px * bone.side < -sideMargin) continue;
      let d = segDist(px, py, pz, bone.head, bone.tail, info);
      const sc = weightScale[bone.name];
      if (sc) d /= sc;
      if (bone.side !== 0) {
        // perto do plano central (barriga, peito) as pernas e braços perdem a vez
        const lim = bone.limbX;
        const k = 1 - (px * bone.side) / lim;
        if (k > 0) d *= 1 + 1.6 * Math.min(1, k) * Math.min(1, k);
        // e só "pegam" vértices até uma certa distância do osso (o resto é do tronco)
        const rc = bone.claim;
        if (d > rc) d *= 1 + ((d - rc) / rc) * 2;
        if (bone.group === 'arm') d *= 1.15;
      }
      if (d < bestD) {
        bestD = d;
        best = b;
        bestT = info.t;
      }
    }
    nearest[i] = best;
    radiusSum[best] += bestD;
    radiusCnt[best] += 1;
    const bone = bones[best];
    const len = Math.hypot(bone.tail[0] - bone.head[0], bone.tail[1] - bone.head[1], bone.tail[2] - bone.head[2]);
    let wSelf = 1;
    // divisão com o pai perto da junta de origem
    if (bone.parent >= 0 && bone.group !== 'body') {
      const blend = Math.min(0.35, (sp.jointBlend * s) / Math.max(len, 1e-6));
      if (bestT < blend) {
        const f = 0.5 * (1 - bestT / blend);
        W[i * nB + bone.parent] += f;
        wSelf -= f;
      }
    } else if (bone.parent >= 0) {
      const blend = 0.4;
      if (bestT < blend) {
        const f = 0.5 * (1 - bestT / blend);
        W[i * nB + bone.parent] += f;
        wSelf -= f;
      }
    }
    // divisão com o filho principal perto da junta final
    const child = bones.findIndex((c, ci) => c.parent === best && c.at === bone.end && ci !== jawId);
    if (child >= 0) {
      const blend = bone.group === 'body' || bone.group === 'tail' ? 0.4 : Math.min(0.35, (sp.jointBlend * s) / Math.max(len, 1e-6));
      if (bestT > 1 - blend) {
        const f = 0.5 * (1 - (1 - bestT) / blend);
        W[i * nB + child] += f;
        wSelf -= f;
      }
    }
    W[i * nB + best] += wSelf;
  }

  const adj = buildAdjacency(index, count);
  const tmp = new Float32Array(count * nB);
  const iters = sp.smoothIters ?? 6;
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < count; i++) {
      const a = adj.start[i];
      const e = adj.start[i + 1];
      const base = i * nB;
      const k = e - a;
      if (k === 0) {
        for (let b = 0; b < nB; b++) tmp[base + b] = W[base + b];
        continue;
      }
      const px = position[i * 3];
      for (let b = 0; b < nB; b++) {
        let acc = 0;
        for (let j = a; j < e; j++) acc += W[adj.nb[j] * nB + b];
        let v = 0.5 * W[base + b] + (0.5 * acc) / k;
        // não deixa o peso de uma perna "vazar" para o lado oposto
        const side = bones[b].side;
        if (side !== 0 && px * side < -sideMargin) v = 0;
        tmp[base + b] = v;
      }
    }
    W.set(tmp);
  }

  // mandíbula: os vértices da cabeça abaixo da linha da boca passam para o osso da mandíbula
  const headId = boneIndex.head;
  const neck2Id = boneIndex.neck2;
  const aJaw = new Float32Array(count);
  const hingeY = J.jaw[1];
  const fade = sp.jawFade;
  for (let i = 0; i < count; i++) {
    const X = source[i * 3];
    const Y = source[i * 3 + 1];
    const Z = source[i * 3 + 2];
    if (Y > hingeY + fade) continue;
    if (Math.abs(X) > sp.jawHalfWidth) continue;
    const lineZ = lerpLine(sp.jawLine, Y);
    if (Z >= lineZ) continue;
    if (Z < sp.jawMinZ) continue;
    let f = 1;
    if (Y > hingeY - fade) f = 1 - (Y - (hingeY - fade)) / (2 * fade);
    const base = i * nB;
    const hw = W[base + headId] + (Y < hingeY ? W[base + neck2Id] * 0.7 : 0);
    if (hw <= 0.001) continue;
    const moved = hw * f;
    W[base + jawId] += moved;
    let rest = moved;
    const take = Math.min(W[base + headId], rest);
    W[base + headId] -= take;
    rest -= take;
    if (rest > 0) W[base + neck2Id] -= rest;
    if (f > 0.5 && Y < hingeY) aJaw[i] = 1;
  }

  // os 4 maiores pesos por vértice
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  const top = [0, 0, 0, 0];
  const topW = [0, 0, 0, 0];
  for (let i = 0; i < count; i++) {
    for (let k = 0; k < 4; k++) {
      top[k] = 0;
      topW[k] = 0;
    }
    const base = i * nB;
    for (let b = 0; b < nB; b++) {
      const w = W[base + b];
      if (w <= topW[3]) continue;
      let k = 3;
      while (k > 0 && w > topW[k - 1]) {
        topW[k] = topW[k - 1];
        top[k] = top[k - 1];
        k--;
      }
      topW[k] = w;
      top[k] = b;
    }
    const sum = topW[0] + topW[1] + topW[2] + topW[3] || 1;
    for (let k = 0; k < 4; k++) {
      skinIndex[i * 4 + k] = top[k];
      skinWeight[i * 4 + k] = topW[k] / sum;
    }
  }

  // raio médio de cada osso (para as esferas de acerto)
  for (let b = 0; b < nB; b++) {
    const bone = bones[b];
    bone.length = Math.hypot(bone.tail[0] - bone.head[0], bone.tail[1] - bone.head[1], bone.tail[2] - bone.head[2]);
    bone.radius = radiusCnt[b] > 0 ? (radiusSum[b] / radiusCnt[b]) * 1.15 : bone.length * 0.3;
  }
  bones[jawId].length = Math.hypot(...bones[jawId].tail.map((v, k) => v - bones[jawId].head[k]));
  bones[jawId].radius = bones[headId].radius * 0.6;

  // olhos: ponto mais externo da superfície perto da posição indicada
  const eyes = [];
  if (sp.eye) {
    for (const side of [1, -1]) {
      let best = -1;
      let bx = -1e9;
      for (let i = 0; i < count; i++) {
        const X = source[i * 3] * side;
        if (X <= 0) continue;
        if (Math.abs(source[i * 3 + 1] - sp.eye[0]) > 0.9 || Math.abs(source[i * 3 + 2] - sp.eye[1]) > 0.9) continue;
        if (X > bx) {
          bx = X;
          best = i;
        }
      }
      if (best >= 0) {
        const p = toGame(source[best * 3] - side * sp.eyeInset, source[best * 3 + 1], source[best * 3 + 2], [0, 0, 0]);
        eyes.push(new THREE.Vector3(p[0], p[1], p[2]));
      }
    }
  }

  // geometria
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(position, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geo.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  geo.setAttribute('aJaw', new THREE.BufferAttribute(aJaw, 1));
  geo.setIndex(new THREE.BufferAttribute(index, 1));
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  geo.boundingSphere = new THREE.Sphere(bb.getCenter(new THREE.Vector3()), bb.getSize(_v).length() * 0.75);

  const restPos = bones.map((b) => new THREE.Vector3(b.head[0], b.head[1], b.head[2]));
  const restEnd = bones.map((b) => new THREE.Vector3(b.tail[0], b.tail[1], b.tail[2]));
  return {
    species: sp,
    geometry: geo,
    bones,
    boneIndex,
    restPos,
    restEnd,
    joint: Object.fromEntries(Object.entries(joint).map(([k, v]) => [k, new THREE.Vector3(v[0], v[1], v[2])])),
    eyes,
    bbox: bb.clone(),
    nearest,
    triangles: index.length / 3,
    vertices: count,
  };
}

// Instância do esqueleto: ossos "planos" (todos filhos da malha), com as
// transformações calculadas em espaço do modelo por anim.js.
export class DinoSkeleton {
  constructor(asset) {
    this.asset = asset;
    const n = asset.bones.length;
    this.n = n;
    this.bones = [];
    for (let i = 0; i < n; i++) {
      const b = new THREE.Bone();
      b.name = asset.bones[i].name;
      b.position.copy(asset.restPos[i]);
      b.matrixAutoUpdate = false;
      b.updateMatrix();
      this.bones.push(b);
    }
    // posições e rotações de cada osso em espaço do modelo
    this.pos = asset.restPos.map((p) => p.clone());
    this.rot = asset.restPos.map(() => new THREE.Quaternion());
    this.local = asset.restPos.map(() => new THREE.Quaternion());
    this.offset = asset.restPos.map((p, i) => {
      const par = asset.bones[i].parent;
      return par >= 0 ? p.clone().sub(asset.restPos[par]) : p.clone();
    });
  }

  makeSkeleton() {
    for (const b of this.bones) b.updateMatrixWorld(true);
    const inv = this.asset.restPos.map((p) => new THREE.Matrix4().makeTranslation(-p.x, -p.y, -p.z));
    return new THREE.Skeleton(this.bones, inv);
  }

  // FK: calcula pos/rot de um osso a partir do pai e da rotação local.
  fk(i, rootPos, rootRot) {
    const par = this.asset.bones[i].parent;
    if (par < 0) {
      this.pos[i].copy(rootPos);
      this.rot[i].copy(rootRot).multiply(this.local[i]);
    } else {
      this.pos[i].copy(this.offset[i]).applyQuaternion(this.rot[par]).add(this.pos[par]);
      this.rot[i].copy(this.rot[par]).multiply(this.local[i]);
    }
  }

  // posição da ponta de um osso no pose atual
  endOf(i, out) {
    return out
      .copy(this.asset.restEnd[i])
      .sub(this.asset.restPos[i])
      .applyQuaternion(this.rot[i])
      .add(this.pos[i]);
  }

  // ponto do pose de repouso (espaço do modelo) levado ao pose atual pelo osso i
  pointOf(i, rest, out) {
    return out.copy(rest).sub(this.asset.restPos[i]).applyQuaternion(this.rot[i]).add(this.pos[i]);
  }

  commit() {
    for (let i = 0; i < this.n; i++) {
      const b = this.bones[i];
      b.matrix.compose(this.pos[i], this.rot[i], _one);
    }
  }
}
const _one = new THREE.Vector3(1, 1, 1);

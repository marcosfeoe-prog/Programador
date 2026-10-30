// Malha da pista: asfalto, laterais da "laje", fundo, defensas, pórticos de
// largada/chegada, placas de turbo, moedas e pilares de sustentação.
import * as THREE from 'three';
import { DS, F_GAP, F_RAILL, F_RAILR, F_CHEVRON, F_LOOP, F_MAGNET, makeFrame } from './track.js';
import { roadTexture, sideTexture, underTexture, railTexture, chevronTexture, checkerTexture, bannerTexture, boostTexture, hazardTexture } from './textures.js';

export const SLAB = 1.3; // espessura da pista
export const RAIL_H = 0.85;
export const RAIL_T = 0.28;

class Strip {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.uv = [];
    this.idx = [];
  }
  vert(p, n, u, v) {
    this.pos.push(p.x, p.y, p.z);
    this.nor.push(n.x, n.y, n.z);
    this.uv.push(u, v);
    return this.pos.length / 3 - 1;
  }
  quad(a, b, c, d) {
    // a-b na fileira anterior, c-d na seguinte (mesma ordem lateral)
    this.idx.push(a, b, c, b, d, c);
  }
  geometry() {
    if (!this.idx.length) return null;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setIndex(this.idx);
    g.computeBoundingSphere();
    return g;
  }
}

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
const neg = new THREE.Vector3();

export function buildTrackMesh(track, world, quality) {
  const group = new THREE.Group();
  group.name = 'pista';
  const road = new THREE.MeshLambertMaterial({ map: roadTexture(world) });
  const side = new THREE.MeshLambertMaterial({ map: sideTexture(world) });
  const under = new THREE.MeshLambertMaterial({ map: underTexture(world) });
  const rail = new THREE.MeshLambertMaterial({ map: railTexture(world) });
  const chev = new THREE.MeshLambertMaterial({ map: chevronTexture(world.id === 'metropole' ? '#ff3ea5' : '#ffd21a') });
  const glow = world.glow ? new THREE.MeshBasicMaterial({ color: world.glow }) : null;
  const mats = { road, side, under, rail, chev, glow };

  const fr = makeFrame();
  const CH = 240; // amostras por pedaço (120 m)
  const STEP = 2;
  for (let c0 = 0; c0 < track.count - 1; c0 += CH) {
    const c1 = Math.min(track.count - 1, c0 + CH);
    const S = { road: new Strip(), side: new Strip(), under: new Strip(), rail: new Strip(), chev: new Strip(), glow: new Strip() };
    let prev = null;
    for (let i = c0; i <= c1; i += STEP) {
      const ii = Math.min(i, c1);
      const s = ii * DS;
      track.frame(s, fr);
      const gap = track.F[ii] & F_GAP;
      const hw = fr.w / 2;
      const L = fr.P.clone().addScaledVector(fr.B, -hw);
      const R = fr.P.clone().addScaledVector(fr.B, hw);
      const Lb = L.clone().addScaledVector(fr.N, -SLAB);
      const Rb = R.clone().addScaledVector(fr.N, -SLAB);
      neg.copy(fr.N).negate();
      const cur = {
        gap,
        f: track.F[ii],
        road: [S.road.vert(L, fr.N, 0, s / 8), S.road.vert(R, fr.N, 1, s / 8)],
        sideL: [S.side.vert(L, tmp.copy(fr.B).negate(), s / 6, 0), S.side.vert(Lb, tmp.copy(fr.B).negate(), s / 6, 1)],
        sideR: [S.side.vert(R, fr.B, s / 6, 0), S.side.vert(Rb, fr.B, s / 6, 1)],
        under: [S.under.vert(Lb, neg, 0, s / 6), S.under.vert(Rb, neg, 1, s / 6)],
      };
      if (glow) {
        const off = 0.03;
        const a = L.clone().addScaledVector(fr.B, -off).addScaledVector(fr.N, -0.12);
        const b = L.clone().addScaledVector(fr.B, -off).addScaledVector(fr.N, -0.34);
        const c = R.clone().addScaledVector(fr.B, off).addScaledVector(fr.N, -0.12);
        const d = R.clone().addScaledVector(fr.B, off).addScaledVector(fr.N, -0.34);
        cur.glowL = [S.glow.vert(a, tmp.copy(fr.B).negate(), 0, 0), S.glow.vert(b, tmp.copy(fr.B).negate(), 0, 1)];
        cur.glowR = [S.glow.vert(c, fr.B, 0, 0), S.glow.vert(d, fr.B, 0, 1)];
      }
      // defensas
      for (const [flag, sgn, key] of [
        [F_RAILL, -1, 'railL'],
        [F_RAILR, 1, 'railR'],
      ]) {
        if (!(cur.f & flag) || gap) continue;
        const inner = fr.P.clone().addScaledVector(fr.B, sgn * (hw - RAIL_T));
        const outer = fr.P.clone().addScaledVector(fr.B, sgn * hw);
        const innerT = inner.clone().addScaledVector(fr.N, RAIL_H);
        const outerT = outer.clone().addScaledVector(fr.N, RAIL_H);
        const nIn = tmp2.copy(fr.B).multiplyScalar(-sgn);
        const isChev = cur.f & F_CHEVRON;
        const face = isChev ? S.chev : S.rail;
        cur[key] = {
          chev: !!isChev,
          inner: [face.vert(inner, nIn, s / 4, 1), face.vert(innerT, nIn, s / 4, 0)],
          top: [S.rail.vert(innerT, fr.N, s / 4, 0.05), S.rail.vert(outerT, fr.N, s / 4, 0.12)],
          outer: [S.rail.vert(outerT, tmp.copy(fr.B).multiplyScalar(sgn), s / 4, 0), S.rail.vert(outer, tmp.copy(fr.B).multiplyScalar(sgn), s / 4, 1)],
        };
      }
      if (prev && !gap && !prev.gap) {
        S.road.quad(prev.road[0], prev.road[1], cur.road[0], cur.road[1]);
        S.side.quad(prev.sideL[1], prev.sideL[0], cur.sideL[1], cur.sideL[0]);
        S.side.quad(prev.sideR[0], prev.sideR[1], cur.sideR[0], cur.sideR[1]);
        S.under.quad(prev.under[1], prev.under[0], cur.under[1], cur.under[0]);
        if (glow) {
          S.glow.quad(prev.glowL[1], prev.glowL[0], cur.glowL[1], cur.glowL[0]);
          S.glow.quad(prev.glowR[0], prev.glowR[1], cur.glowR[0], cur.glowR[1]);
        }
        for (const [key, sgn] of [
          ['railL', -1],
          ['railR', 1],
        ]) {
          const a = prev[key];
          const b = cur[key];
          if (!a || !b || a.chev !== b.chev) continue;
          const face = a.chev ? S.chev : S.rail;
          if (sgn > 0) {
            face.quad(a.inner[0], a.inner[1], b.inner[0], b.inner[1]);
            S.rail.quad(a.top[0], a.top[1], b.top[0], b.top[1]);
            S.rail.quad(a.outer[0], a.outer[1], b.outer[0], b.outer[1]);
          } else {
            face.quad(a.inner[1], a.inner[0], b.inner[1], b.inner[0]);
            S.rail.quad(a.top[1], a.top[0], b.top[1], b.top[0]);
            S.rail.quad(a.outer[1], a.outer[0], b.outer[1], b.outer[0]);
          }
        }
      }
      prev = cur;
      if (ii === c1) break;
    }
    for (const k in S) {
      if (!mats[k]) continue;
      const g = S[k].geometry();
      if (!g) continue;
      const m = new THREE.Mesh(g, mats[k]);
      m.receiveShadow = k === 'road' || k === 'rail' || k === 'chev';
      group.add(m);
    }
  }

  addLines(group, track, fr);
  addArches(group, track, world, fr);
  addHazardStrips(group, track, fr);
  const boost = addBoostPads(group, track, fr);
  const coins = new Coins(group, track, fr);
  if (world.ground !== null) addPillars(group, track, world, fr, quality);
  return { group, boost, coins, materials: mats };
}

// Faixa fina que acompanha a superfície entre s0 e s1, na lateral d0..d1.
function surfaceStrip(track, fr, s0, s1, d0, d1, lift = 0.03, rows = 8) {
  const st = new Strip();
  let prev = null;
  for (let r = 0; r <= rows; r++) {
    const s = s0 + ((s1 - s0) * r) / rows;
    track.frame(s, fr);
    const a = fr.P.clone().addScaledVector(fr.B, d0).addScaledVector(fr.N, lift);
    const b = fr.P.clone().addScaledVector(fr.B, d1).addScaledVector(fr.N, lift);
    const cur = [st.vert(a, fr.N, 0, r / rows), st.vert(b, fr.N, 1, r / rows)];
    if (prev) st.quad(prev[0], prev[1], cur[0], cur[1]);
    prev = cur;
  }
  return st.geometry();
}

function addLines(group, track, fr) {
  const mat = new THREE.MeshLambertMaterial({ map: checkerTexture(8), polygonOffset: true, polygonOffsetFactor: -2 });
  for (const s of [track.startS, track.finishS]) {
    const w = track.widthAt(s) / 2;
    const g = surfaceStrip(track, fr, s - 1.6, s + 1.6, -w + 0.9, w - 0.9, 0.02, 2);
    // repete o xadrez ao longo da largura
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 7, uv.getY(i));
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    group.add(m);
  }
  // marcações do grid de largada
  const gmat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, polygonOffset: true, polygonOffsetFactor: -2 });
  for (let k = 0; k < 6; k++) {
    const row = Math.floor(k / 2);
    const col = k % 2;
    const s = track.startS - 6 - row * 9 - col * 3;
    const d = col ? 2.6 : -2.6;
    group.add(new THREE.Mesh(surfaceStrip(track, fr, s - 2.6, s - 2.3, d - 1.3, d + 1.3, 0.02, 1), gmat));
  }
}

function arch(track, fr, s, text, color) {
  const g = new THREE.Group();
  track.frame(s, fr);
  const hw = fr.w / 2;
  const m = new THREE.Matrix4().makeBasis(fr.B, fr.N, fr.T.clone().negate());
  m.setPosition(fr.P);
  g.matrixAutoUpdate = false;
  g.matrix.copy(m);
  const postMat = new THREE.MeshLambertMaterial({ color });
  const H = 7.5;
  for (const sg of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, H, 0.9), postMat);
    p.position.set(sg * (hw + 0.6), H / 2, 0);
    p.castShadow = true;
    g.add(p);
  }
  const bannerMat = new THREE.MeshLambertMaterial({ map: bannerTexture(text) });
  const plain = new THREE.MeshLambertMaterial({ color: 0x16161c });
  const beam = new THREE.Mesh(new THREE.BoxGeometry(fr.w + 2.1, 1.8, 0.6), [plain, plain, plain, plain, bannerMat, bannerMat]);
  beam.position.set(0, H - 0.4, 0);
  beam.castShadow = true;
  g.add(beam);
  // luzes da largada
  const lamp = new THREE.MeshBasicMaterial({ color: 0xff3030 });
  for (let i = 0; i < 5; i++) {
    const l = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 8), lamp);
    l.position.set(-2 + i, H - 1.55, -0.35);
    g.add(l);
  }
  g.userData.lamp = lamp;
  return g;
}

function addArches(group, track, world, fr) {
  const start = arch(track, fr, track.startS, 'LARGADA', world.side);
  const fin = arch(track, fr, track.finishS, 'CHEGADA', world.side);
  group.add(start, fin);
  group.userData.startLamp = start.userData.lamp;
}

function addHazardStrips(group, track, fr) {
  const mat = new THREE.MeshLambertMaterial({ map: hazardTexture(), polygonOffset: true, polygonOffsetFactor: -2 });
  for (let i = 1; i < track.count; i++) {
    const a = track.F[i - 1] & F_GAP;
    const b = track.F[i] & F_GAP;
    if (a === b) continue;
    const s = i * DS;
    const w = track.W[i] / 2;
    const g = b ? surfaceStrip(track, fr, s - 2.2, s - 0.3, -w, w, 0.03, 2) : surfaceStrip(track, fr, s + 0.3, s + 2.2, -w, w, 0.03, 2);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * 6, uv.getY(k) * 0.5);
    group.add(new THREE.Mesh(g, mat));
  }
}

function addBoostPads(group, track, fr) {
  const tex = boostTexture();
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.95, polygonOffset: true, polygonOffsetFactor: -3, depthWrite: false });
  for (const b of track.boosts) {
    const g = surfaceStrip(track, fr, b.s - 3.5, b.s + 3.5, b.d - 2.1, b.d + 2.1, 0.04, 6);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k), uv.getY(k) * 1.4);
    const m = new THREE.Mesh(g, mat);
    m.renderOrder = 2;
    group.add(m);
  }
  return { tex, update: (dt) => (tex.offset.y -= dt * 1.6) };
}

function coinTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(54, 50, 6, 64, 64, 64);
  g.addColorStop(0, '#fff3b0');
  g.addColorStop(0.6, '#ffc21a');
  g.addColorStop(1, '#c27a00');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  ctx.strokeStyle = '#b06c00';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.arc(64, 64, 50, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#e09400';
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? 15 : 34;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    ctx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r);
  }
  ctx.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export class Coins {
  constructor(group, track, fr) {
    this.track = track;
    const n = track.coins.length;
    this.n = n;
    this.taken = new Uint8Array(n);
    this.base = [];
    const g = new THREE.CylinderGeometry(0.7, 0.7, 0.16, 22);
    g.rotateX(Math.PI / 2); // face voltada para a frente
    const face = new THREE.MeshStandardMaterial({ map: coinTexture(), metalness: 0.7, roughness: 0.3, emissive: 0x6a4200, emissiveIntensity: 0.6 });
    const rim = new THREE.MeshStandardMaterial({ color: 0xffc21a, metalness: 0.8, roughness: 0.3, emissive: 0x6a4200, emissiveIntensity: 0.6 });
    this.mesh = new THREE.InstancedMesh(g, [rim, face, face], Math.max(1, n));
    this.mesh.count = n;
    this.mesh.frustumCulled = false;
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const c = track.coins[i];
      track.frame(c.s, fr);
      const p = fr.P.clone().addScaledVector(fr.B, c.d).addScaledVector(fr.N, 1.25);
      m.makeBasis(fr.B, fr.N, fr.T.clone().negate()).setPosition(p);
      this.base.push({ m: m.clone(), ny: fr.N.y });
      this.mesh.setMatrixAt(i, m);
    }
    group.add(this.mesh);
    this.m = m;
    this.rot = new THREE.Matrix4();
  }
  update(t) {
    const m = this.m;
    for (let i = 0; i < this.n; i++) {
      if (this.taken[i]) {
        this.mesh.setMatrixAt(i, ZERO);
        continue;
      }
      const b = this.base[i];
      this.rot.makeRotationY(t * 3 + i * 0.4);
      this.rot.elements[13] = Math.sin(t * 3 + i) * 0.12;
      m.multiplyMatrices(b.m, this.rot);
      this.mesh.setMatrixAt(i, m);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
  // Recolhe as moedas perto do carro (s, d). Retorna quantas pegou.
  collect(s, d) {
    let got = 0;
    const list = this.track.coins;
    for (let i = 0; i < this.n; i++) {
      if (this.taken[i]) continue;
      const c = list[i];
      if (Math.abs(c.s - s) < 2.6 && Math.abs(c.d - d) < 1.9) {
        this.taken[i] = 1;
        got++;
      }
    }
    return got;
  }
}

function addPillars(group, track, world, fr, quality) {
  const spots = [];
  for (let s = track.startS - 40; s < track.length - 10; s += 38) {
    const i = Math.round(s / DS);
    if (i < 0) continue;
    const f = track.F[i];
    if (f & (F_GAP | F_LOOP | F_MAGNET)) continue;
    track.frame(s, fr);
    if (fr.N.y < 0.93) continue;
    const top = fr.P.clone().addScaledVector(fr.N, -SLAB + 0.1);
    const h = top.y - world.ground;
    if (h < 3) continue;
    spots.push({ x: top.x, z: top.z, y: top.y, h });
  }
  if (!spots.length) return;
  const colors = { arquipelago: 0xf2f6fa, canion: 0xc77a44, metropole: 0x8a8fa0, glacial: 0xd6efff, vulcao: 0x3a302c };
  const mat = new THREE.MeshLambertMaterial({ color: colors[world.id] ?? 0xcccccc });
  const geo = new THREE.CylinderGeometry(0.9, 1.25, 1, 10, 1);
  geo.translate(0, -0.5, 0);
  const capGeo = new THREE.BoxGeometry(3.2, 0.7, 3.2);
  capGeo.translate(0, -0.35, 0);
  const mesh = new THREE.InstancedMesh(geo, mat, spots.length);
  const caps = new THREE.InstancedMesh(capGeo, mat, spots.length);
  const m = new THREE.Matrix4();
  spots.forEach((p, i) => {
    m.makeScale(1, p.h, 1).setPosition(p.x, p.y, p.z);
    mesh.setMatrixAt(i, m);
    m.makeTranslation(p.x, p.y, p.z);
    caps.setMatrixAt(i, m);
  });
  mesh.receiveShadow = true;
  group.add(mesh, caps);
}

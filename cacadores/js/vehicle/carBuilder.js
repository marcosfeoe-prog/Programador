// Carrocerias modeladas do zero por "loft": a lateral do carro é descrita por curvas
// (assoalho, linha de cintura, capô/porta-malas, teto) e a largura ao longo do
// comprimento; seções transversais arredondadas são ligadas numa malha contínua, com
// caixas de roda recortadas no perfil. A cabine (vidros e colunas) é outro loft com
// "tumblehome". Peças: rodas, para-choques, retrovisores, faróis, barra de luzes,
// antenas, estação meteorológica, radar móvel e a blindagem do interceptador.

import * as THREE from 'three';
import { bodyTexture, cabinTexture, endsTexture, tireTexture, rimTexture, meshTexture, plateText } from './carTextures.js';
import { RNG } from '../core/rng.js';

// Interpola uma curva de controle [[t, valor], ...] (t de 0 a 1).
function curve(pts, t) {
  if (t <= pts[0][0]) return pts[0][1];
  for (let i = 0; i < pts.length - 1; i++) {
    const [t0, v0] = pts[i];
    const [t1, v1] = pts[i + 1];
    if (t <= t1) {
      const k = (t - t0) / (t1 - t0 || 1);
      const s = k * k * (3 - 2 * k);
      return v0 + (v1 - v0) * s;
    }
  }
  return pts[pts.length - 1][1];
}

// Malha de loft: sections = [{ z, pts: [[x, y], ...], vs: [v, ...] }].
function loftGeometry(sections, zmin, zmax, flat = false) {
  const pos = [];
  const uv = [];
  const idx = [];
  const n = sections[0].pts.length;
  for (const s of sections) {
    const u = (s.z - zmin) / (zmax - zmin);
    for (let j = 0; j < n; j++) {
      pos.push(s.pts[j][0], s.pts[j][1], s.z);
      uv.push(u, s.vs[j]);
    }
  }
  for (let i = 0; i < sections.length - 1; i++)
    for (let j = 0; j < n - 1; j++) {
      const a = i * n + j;
      const b = a + 1;
      const c = a + n;
      const d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
  let g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  if (flat) g = g.toNonIndexed();
  g.computeVertexNormals();
  return g;
}

// Tampa de uma ponta (leque a partir do centro da seção).
function capGeometry(sec, front, uv0, uv1) {
  const pos = [];
  const uv = [];
  const idx = [];
  let cx = 0;
  let cy = 0;
  for (const p of sec.pts) {
    cx += p[0];
    cy += p[1];
  }
  cx /= sec.pts.length;
  cy /= sec.pts.length;
  let minx = 1e9;
  let maxx = -1e9;
  let miny = 1e9;
  let maxy = -1e9;
  for (const p of sec.pts) {
    minx = Math.min(minx, p[0]);
    maxx = Math.max(maxx, p[0]);
    miny = Math.min(miny, p[1]);
    maxy = Math.max(maxy, p[1]);
  }
  const map = (x, y) => [uv0[0] + ((x - minx) / (maxx - minx || 1)) * (uv1[0] - uv0[0]), uv0[1] + ((y - miny) / (maxy - miny || 1)) * (uv1[1] - uv0[1])];
  pos.push(cx, cy, sec.z);
  uv.push(...map(cx, cy));
  for (const p of sec.pts) {
    pos.push(p[0], p[1], sec.z);
    uv.push(...map(front ? -p[0] : p[0], p[1]));
  }
  for (let j = 1; j < sec.pts.length; j++) {
    if (front) idx.push(0, j, j + 1);
    else idx.push(0, j + 1, j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ modelos
export const BODY_SPECS = {
  sedan: {
    L: 4.75,
    W: 1.84,
    wheelR: 0.33,
    tireW: 0.23,
    wheelbase: 2.78,
    rearAxle: 0.24,
    bottom: [[0, 0.36], [0.07, 0.22], [0.93, 0.21], [1, 0.38]],
    belt: [[0, 0.88], [0.25, 0.92], [0.75, 0.9], [1, 0.76]],
    deck: [[0, 0.86], [0.04, 0.97], [0.24, 1.0], [0.3, 1.0], [0.72, 0.96], [0.9, 0.86], [1, 0.72]],
    halfW: [[0, 0.86], [0.05, 0.97], [0.5, 1], [0.93, 0.97], [1, 0.83]],
    cabin: { z0: 0.24, z1: 0.73, r0: 0.38, r1: 0.6, roof: 1.45, tumble: 0.76 },
    windows: { rear: 0.2, front: 0.78, pillars: [0.48], sideTop: 0.3 },
    doors: [0.35, 0.53, 0.72],
  },
  pickup: {
    L: 5.6,
    W: 2.0,
    wheelR: 0.4,
    tireW: 0.28,
    wheelbase: 3.55,
    rearAxle: 0.2,
    bottom: [[0, 0.5], [0.06, 0.4], [0.94, 0.4], [1, 0.52]],
    belt: [[0, 1.2], [0.5, 1.22], [1, 1.1]],
    deck: [[0, 0.92], [0.43, 0.92], [0.445, 1.22], [0.72, 1.22], [0.85, 1.18], [1, 1.04]],
    halfW: [[0, 0.95], [0.04, 0.99], [0.5, 1], [0.96, 0.98], [1, 0.9]],
    cabin: { z0: 0.42, z1: 0.75, r0: 0.45, r1: 0.64, roof: 1.92, tumble: 0.86 },
    windows: { rear: 0.1, front: 0.82, pillars: [0.5], sideTop: 0.32 },
    doors: [0.45, 0.6, 0.73],
    bed: { z0: 0.0, z1: 0.43 },
  },
  suv: {
    L: 5.0,
    W: 1.98,
    wheelR: 0.39,
    tireW: 0.27,
    wheelbase: 2.95,
    rearAxle: 0.2,
    bottom: [[0, 0.46], [0.06, 0.36], [0.94, 0.36], [1, 0.48]],
    belt: [[0, 1.16], [0.5, 1.18], [1, 1.06]],
    deck: [[0, 1.16], [0.04, 1.18], [0.76, 1.16], [0.88, 1.1], [1, 0.98]],
    halfW: [[0, 0.93], [0.04, 0.99], [0.5, 1], [0.95, 0.98], [1, 0.88]],
    cabin: { z0: 0.02, z1: 0.77, r0: 0.05, r1: 0.62, roof: 1.92, tumble: 0.84 },
    windows: { rear: 0.06, front: 0.82, pillars: [0.33, 0.55], sideTop: 0.32 },
    doors: [0.3, 0.52, 0.72],
  },
  van: {
    L: 5.9,
    W: 2.05,
    wheelR: 0.38,
    tireW: 0.26,
    wheelbase: 3.66,
    rearAxle: 0.18,
    bottom: [[0, 0.46], [0.05, 0.38], [0.95, 0.38], [1, 0.48]],
    belt: [[0, 1.2], [0.5, 1.2], [1, 1.08]],
    deck: [[0, 1.2], [0.8, 1.2], [0.9, 1.12], [1, 0.98]],
    halfW: [[0, 0.97], [0.03, 1], [0.5, 1], [0.95, 0.98], [1, 0.9]],
    cabin: { z0: 0.005, z1: 0.82, r0: 0.02, r1: 0.7, roof: 2.62, tumble: 0.94 },
    windows: { rear: 0.03, front: 0.86, pillars: [0.68], sideTop: 0.22 },
    doors: [0.55, 0.7, 0.8],
  },
  armor: {
    L: 5.9,
    W: 2.3,
    wheelR: 0.46,
    tireW: 0.34,
    wheelbase: 3.45,
    rearAxle: 0.22,
    bottom: [[0, 0.55], [0.06, 0.42], [0.94, 0.42], [1, 0.58]],
    belt: [[0, 1.25], [0.5, 1.3], [1, 1.12]],
    deck: [[0, 1.25], [0.7, 1.3], [0.86, 1.2], [1, 1.0]],
    halfW: [[0, 0.9], [0.05, 1], [0.5, 1], [0.94, 0.98], [1, 0.82]],
    cabin: { z0: 0.08, z1: 0.8, r0: 0.25, r1: 0.62, roof: 2.15, tumble: 0.7 },
    windows: { rear: 0.4, front: 0.83, pillars: [0.55, 0.62], sideTop: 0.1 },
    doors: [0.55, 0.7],
    flat: true,
  },
};

function lowerSections(spec, N) {
  const { L, W } = spec;
  const secs = [];
  const z0 = -L / 2;
  const front = spec.rearAxle * L + spec.wheelbase;
  const axles = [z0 + spec.rearAxle * L, z0 + front];
  const Ra = spec.wheelR + 0.06;
  const wy = spec.wheelR;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const z = z0 + t * L;
    const hw = (W / 2) * curve(spec.halfW, t);
    let yb = curve(spec.bottom, t);
    for (const az of axles) {
      const dz = z - az;
      if (Math.abs(dz) < Ra) yb = Math.max(yb, wy + Math.sqrt(Ra * Ra - dz * dz) * 0.92);
    }
    const yBelt = curve(spec.belt, t);
    let yDeck = curve(spec.deck, t);
    const inCabin = t > spec.cabin.z0 + 0.005 && t < spec.cabin.z1 - 0.005;
    if (inCabin) yDeck = Math.max(yDeck, yBelt);
    yDeck = Math.max(yDeck, yb + 0.12);
    const top = Math.max(yBelt, yb + 0.2);
    const corner = Math.min(0.08, (top - yb) * 0.3);
    // Lado direito de baixo para cima e depois o topo até o centro.
    const right = [
      [0, yb],
      [hw * 0.82, yb],
      [hw * 0.96, yb + corner * 0.6],
      [hw, yb + corner * 1.6],
      [hw, top - 0.1],
      [hw * 0.985, top - 0.02],
      [hw * 0.93, Math.min(yDeck, top) + (yDeck - top) * 0.6],
      [hw * 0.55, yDeck - 0.005],
      [0, yDeck],
    ];
    const vR = [0, 0.03, 0.06, 0.09, 0.3, 0.33, 0.38, 0.45, 0.5];
    const pts = [];
    const vs = [];
    for (let j = 0; j < right.length; j++) {
      pts.push(right[j]);
      vs.push(vR[j]);
    }
    for (let j = right.length - 2; j >= 0; j--) {
      pts.push([-right[j][0], right[j][1]]);
      vs.push(1 - vR[j]);
    }
    secs.push({ z, pts, vs, t });
  }
  return secs;
}

function cabinSections(spec, N) {
  const { L, W } = spec;
  const c = spec.cabin;
  const z0 = -L / 2;
  const secs = [];
  for (let i = 0; i <= N; i++) {
    const t = c.z0 + (c.z1 - c.z0) * (i / N);
    const z = z0 + t * L;
    const hw = (W / 2) * curve(spec.halfW, t) * 0.97;
    const yBelt = curve(spec.belt, t);
    // Teto: sobe na traseira (vidro traseiro), plano, desce no para-brisa.
    let k;
    if (t < c.r0) k = (t - c.z0) / (c.r0 - c.z0 || 1);
    else if (t > c.r1) k = (c.z1 - t) / (c.z1 - c.r1 || 1);
    else k = 1;
    k = Math.max(0, Math.min(1, k));
    const ks = Math.sin((k * Math.PI) / 2);
    const yRoof = yBelt + (c.roof - yBelt) * ks;
    const rw = hw * (c.tumble + (1 - c.tumble) * (1 - ks));
    const pts = [];
    const vs = [];
    const prof = [
      [1, 0],
      [0.97, 0.45],
      [0.9, 0.82],
      [0.75, 0.97],
      [0.4, 1],
      [0, 1],
    ];
    // Da cintura esquerda, sobe, passa pelo teto e desce até a direita.
    for (let j = 0; j < prof.length; j++) {
      const [fx, fy] = prof[j];
      const x = -(hw + (rw - hw) * fy) * fx;
      pts.push([x, yBelt + (yRoof - yBelt) * fy]);
      vs.push(0.5 * (j / (prof.length - 1)));
    }
    for (let j = prof.length - 2; j >= 0; j--) {
      const [fx, fy] = prof[j];
      const x = (hw + (rw - hw) * fy) * fx;
      pts.push([x, yBelt + (yRoof - yBelt) * fy]);
      vs.push(1 - 0.5 * (j / (prof.length - 1)));
    }
    secs.push({ z, pts, vs });
  }
  return secs;
}

function wheel(spec, tireMat, rimMat) {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(spec.wheelR, spec.wheelR, spec.tireW, 24, 1, true), tireMat);
  tire.rotation.z = Math.PI / 2;
  const capGeo = new THREE.CircleGeometry(spec.wheelR, 24);
  const outer = new THREE.Mesh(capGeo, rimMat);
  outer.position.x = spec.tireW / 2 + 0.001;
  outer.rotation.y = Math.PI / 2;
  const inner = new THREE.Mesh(capGeo, rimMat);
  inner.position.x = -spec.tireW / 2 - 0.001;
  inner.rotation.y = -Math.PI / 2;
  g.add(tire, outer, inner);
  g.traverse((o) => (o.castShadow = true));
  return g;
}

let SHARED = null;
function shared() {
  if (SHARED) return SHARED;
  SHARED = {
    tire: tireTexture(),
    rim0: rimTexture(0),
    rim1: rimTexture(1),
    mesh: meshTexture(),
  };
  SHARED.tire.repeat.set(3, 1);
  return SHARED;
}

// Monta o veículo completo. Retorna { group, wheels, lights, parts }.
export function buildVehicle(model, country, opts = {}) {
  const spec = BODY_SPECS[model.body];
  const sh = shared();
  const rng = new RNG(opts.seed || 7);
  const look = {
    paint: opts.paint || model.paint,
    stripe: model.stripe,
    stripe2: model.stripe2,
    decal: model.decal,
    decalColor: model.decalColor,
    decalSize: model.decalSize,
    number: model.number,
    doors: spec.doors,
    windows: spec.windows,
    roof: model.roof,
    roofRack: model.roofRack,
    plateText: plateText(rng, country),
  };
  const physical = opts.lowQuality ? THREE.MeshStandardMaterial : THREE.MeshPhysicalMaterial;
  const paintParams = { map: bodyTexture(look), roughness: 0.38, metalness: 0.05, envMapIntensity: 1.2 };
  if (!opts.lowQuality) Object.assign(paintParams, { clearcoat: 0.8, clearcoatRoughness: 0.12 });
  const bodyMat = new physical(paintParams);
  const cabinMat = new physical({ map: cabinTexture(look), roughness: 0.12, metalness: 0.1, envMapIntensity: 1.4, ...(opts.lowQuality ? {} : { clearcoat: 1, clearcoatRoughness: 0.05 }) });
  const endsMat = new THREE.MeshStandardMaterial({ map: endsTexture(look, country), roughness: 0.4, metalness: 0.3 });
  const darkMat = new THREE.MeshStandardMaterial({ color: '#1a1b1d', roughness: 0.7 });
  const chromeMat = new THREE.MeshStandardMaterial({ color: '#c8ccd0', roughness: 0.2, metalness: 0.9 });
  const tireMat = new THREE.MeshStandardMaterial({ map: sh.tire, roughness: 0.92 });
  const rimMat = new THREE.MeshStandardMaterial({ map: model.body === 'armor' ? sh.rim1 : sh.rim0, roughness: 0.4, metalness: 0.6 });
  const g = new THREE.Group();
  g.name = 'vehicle';
  const N = 44;
  const low = lowerSections(spec, N);
  const zmin = -spec.L / 2;
  const zmax = spec.L / 2;
  const body = new THREE.Mesh(loftGeometry(low, zmin, zmax, !!spec.flat), bodyMat);
  const front = new THREE.Mesh(capGeometry(low[low.length - 1], true, [0, 0], [0.5, 1]), endsMat);
  const rear = new THREE.Mesh(capGeometry(low[0], false, [0.5, 0], [1, 1]), endsMat);
  const cab = new THREE.Mesh(loftGeometry(cabinSections(spec, 26), zmin + spec.cabin.z0 * spec.L, zmin + spec.cabin.z1 * spec.L, !!spec.flat), cabinMat);
  g.add(body, front, rear, cab);
  // Rodas.
  const wheels = [];
  const axles = [zmin + spec.rearAxle * spec.L, zmin + spec.rearAxle * spec.L + spec.wheelbase];
  const tx = spec.W / 2 - spec.tireW / 2 - 0.04;
  for (const [ai, az] of axles.entries())
    for (const sx of [-1, 1]) {
      const w = wheel(spec, tireMat, rimMat);
      w.position.set(sx * tx, spec.wheelR, az);
      if (sx < 0) w.rotation.y = Math.PI;
      w.userData = { front: ai === 1, side: sx };
      g.add(w);
      wheels.push(w);
    }
  // Para-choques, retrovisores, maçanetas.
  const bump = (z, y, d) => {
    const b = new THREE.Mesh(new THREE.BoxGeometry(spec.W * 0.96, 0.2, d), model.body === 'armor' ? darkMat : darkMat);
    b.position.set(0, y, z);
    g.add(b);
  };
  bump(zmax + 0.02, curve(spec.bottom, 1) + 0.12, 0.22);
  bump(zmin - 0.02, curve(spec.bottom, 0) + 0.12, 0.22);
  const mirrorZ = zmin + spec.cabin.z1 * spec.L - 0.15;
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.14, 0.1), bodyMat);
    m.position.set(sx * (spec.W / 2 + 0.08), curve(spec.belt, spec.cabin.z1) + 0.12, mirrorZ);
    g.add(m);
  }
  // Faróis e lanternas (emissivos).
  const headMat = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#fff4dc', emissiveIntensity: 0 });
  const tailMat = new THREE.MeshStandardMaterial({ color: '#600808', emissive: '#ff1a10', emissiveIntensity: 0.4 });
  const hy = curve(spec.deck, 1) - 0.18;
  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.14, 0.05), headMat);
    h.position.set(sx * spec.W * 0.33, hy, zmax + 0.005);
    const tl = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.2, 0.05), tailMat);
    tl.position.set(sx * spec.W * 0.36, curve(spec.deck, 0) - 0.22, zmin - 0.005);
    g.add(h, tl);
  }
  const parts = {};
  const roofY = spec.cabin.roof;
  const roofZ = zmin + ((spec.cabin.r0 + spec.cabin.r1) / 2) * spec.L;
  // Caçamba da picape.
  if (spec.bed) {
    const bz0 = zmin + spec.bed.z0 * spec.L + 0.05;
    const bz1 = zmin + spec.bed.z1 * spec.L;
    const yb = curve(spec.deck, 0.2);
    const yt = curve(spec.belt, 0.2);
    for (const sx of [-1, 1]) {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(0.06, yt - yb, bz1 - bz0), bodyMat);
      wall.position.set(sx * (spec.W / 2 - 0.05), (yt + yb) / 2, (bz0 + bz1) / 2);
      g.add(wall);
    }
    const gate = new THREE.Mesh(new THREE.BoxGeometry(spec.W - 0.1, yt - yb, 0.06), bodyMat);
    gate.position.set(0, (yt + yb) / 2, bz0);
    const fw = new THREE.Mesh(new THREE.BoxGeometry(spec.W - 0.1, yt - yb, 0.06), bodyMat);
    fw.position.set(0, (yt + yb) / 2, bz1);
    const floor = new THREE.Mesh(new THREE.BoxGeometry(spec.W - 0.12, 0.04, bz1 - bz0), darkMat);
    floor.position.set(0, yb + 0.02, (bz0 + bz1) / 2);
    g.add(gate, fw, floor);
    // Sondas (as "tartarugas") e caixas de equipamento na caçamba.
    for (let i = 0; i < 3; i++) {
      const probe = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.22, 10), new THREE.MeshStandardMaterial({ color: '#d8a020', roughness: 0.5, metalness: 0.4 }));
      probe.position.set(-0.55 + i * 0.55, yb + 0.15, bz0 + 0.6);
      g.add(probe);
      if (!parts.probes) parts.probes = [];
      parts.probes.push(probe);
    }
  }
  // Barra de luzes âmbar no teto (todo carro de caçador tem).
  if (model.lightbar) {
    const bar = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(spec.W * 0.75, 0.08, 0.28), darkMat);
    bar.add(base);
    const amber = new THREE.MeshStandardMaterial({ color: '#ffb020', emissive: '#ff9a00', emissiveIntensity: 0 });
    parts.amber = amber;
    for (let i = 0; i < 6; i++) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 0.2), amber);
      l.position.set(-spec.W * 0.3 + (i * spec.W * 0.6) / 5, 0.07, 0);
      bar.add(l);
    }
    bar.position.set(0, roofY + 0.05, zmin + spec.cabin.r1 * spec.L - 0.2);
    g.add(bar);
  }
  // Mastro com anemômetro (estação meteorológica).
  if (model.mast) {
    const mast = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.4, 6), chromeMat);
    pole.position.y = 0.7;
    mast.add(pole);
    const cups = new THREE.Group();
    cups.position.y = 1.42;
    for (let i = 0; i < 3; i++) {
      const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 4), chromeMat);
      arm.rotation.z = Math.PI / 2;
      arm.position.x = 0.18;
      const cup = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6, 0, Math.PI), darkMat);
      cup.position.x = 0.36;
      cup.rotation.y = Math.PI / 2;
      const h = new THREE.Group();
      h.rotation.y = (i / 3) * Math.PI * 2;
      h.add(arm, cup);
      cups.add(h);
    }
    mast.add(cups);
    const vane = new THREE.Group();
    vane.position.y = 1.25;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.12, 0.28), chromeMat);
    tail.position.z = -0.16;
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.12, 6), chromeMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.z = 0.1;
    vane.add(tail, nose);
    mast.add(vane);
    mast.position.set(spec.W * 0.28, roofY, roofZ - 0.4);
    g.add(mast);
    parts.cups = cups;
    parts.vane = vane;
  }
  // Antenas.
  for (const [x, z, h] of model.antennas || []) {
    const a = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.01, h, 4), darkMat);
    a.position.set(x * spec.W * 0.5, roofY + h / 2, roofZ + z);
    g.add(a);
  }
  // Radar Doppler móvel (prato giratório) na van.
  if (model.radar) {
    const ped = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.5, 12), chromeMat);
    ped.position.set(0, roofY + 0.25, roofZ - 0.6);
    const head = new THREE.Group();
    head.position.set(0, roofY + 0.62, roofZ - 0.6);
    const pts = [];
    for (let i = 0; i <= 10; i++) {
      const r = (i / 10) * 1.05;
      pts.push(new THREE.Vector2(r, r * r * 0.32));
    }
    const dish = new THREE.Mesh(new THREE.LatheGeometry(pts, 24), new THREE.MeshStandardMaterial({ color: '#e8eaec', roughness: 0.45, metalness: 0.2, side: THREE.DoubleSide }));
    dish.rotation.x = -Math.PI / 2 + 0.25;
    dish.position.z = 0.1;
    const feed = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 6), darkMat);
    feed.rotation.x = Math.PI / 2 - 0.25;
    feed.position.set(0, 0.06, 0.32);
    head.add(dish, feed);
    g.add(ped, head);
    parts.radarHead = head;
  }
  // Blindagem do interceptador: placas, grade nas janelas e âncoras hidráulicas.
  if (model.body === 'armor') {
    const plateMat = new THREE.MeshStandardMaterial({ color: model.paint, roughness: 0.55, metalness: 0.5 });
    for (const sx of [-1, 1]) {
      const skirt = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, spec.L * 0.62), plateMat);
      skirt.position.set(sx * (spec.W / 2 + 0.02), 0.62, -0.1);
      skirt.rotation.z = sx * 0.08;
      g.add(skirt);
    }
    const anchors = [];
    for (const [sx, sz] of [
      [-1, 1],
      [1, 1],
      [-1, -1],
      [1, -1],
    ]) {
      const a = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.04, 1.2, 8), chromeMat);
      a.position.set(sx * spec.W * 0.36, 0.8, sz * spec.L * 0.28);
      g.add(a);
      anchors.push(a);
    }
    parts.anchors = anchors;
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.55, 0.45, 8), plateMat);
    turret.position.set(0, roofY + 0.22, roofZ);
    const cam = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.2, 0.4), darkMat);
    cam.position.set(0, roofY + 0.55, roofZ + 0.1);
    g.add(turret, cam);
  }
  // Grade antigranizo nas janelas (melhoria).
  if (opts.hailGuard) {
    const gm = new THREE.MeshStandardMaterial({ map: sh.mesh, transparent: true, alphaTest: 0.4, roughness: 0.6, metalness: 0.5, side: THREE.DoubleSide });
    const wz = zmin + spec.cabin.z1 * spec.L - 0.35;
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(spec.W * 0.8, 0.8), gm);
    ws.position.set(0, (curve(spec.belt, spec.cabin.z1) + roofY) / 2, wz);
    ws.rotation.x = -0.6;
    g.add(ws);
  }
  // Interior (visível só na câmera do motorista): painel, volante, colunas e teto.
  const interior = new THREE.Group();
  const dashMat = new THREE.MeshStandardMaterial({ color: '#16181b', roughness: 0.85 });
  const trimMat = new THREE.MeshStandardMaterial({ color: '#2a2d31', roughness: 0.8 });
  const zW = zmin + spec.cabin.r1 * spec.L;
  const yB = curve(spec.belt, spec.cabin.r1);
  const dash = new THREE.Mesh(new THREE.BoxGeometry(spec.W * 0.92, 0.28, 0.55), dashMat);
  dash.position.set(0, yB - 0.02, zW + 0.18);
  const hoodIn = new THREE.Mesh(new THREE.BoxGeometry(spec.W * 0.9, 0.04, 1.6), bodyMat);
  hoodIn.position.set(0, curve(spec.deck, 0.85) - 0.02, zW + 1.1);
  const wheelR = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.025, 8, 24), trimMat);
  wheelR.position.set(spec.W * 0.2, yB + 0.12, zW - 0.18);
  wheelR.rotation.x = -0.35;
  const gauges = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.12), new THREE.MeshStandardMaterial({ color: '#0a0c10', emissive: '#3fa9ff', emissiveIntensity: 0.35 }));
  gauges.position.set(spec.W * 0.2, yB + 0.14, zW + 0.0);
  gauges.rotation.x = -0.35;
  gauges.rotation.y = Math.PI;
  const tablet = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.17), new THREE.MeshStandardMaterial({ color: '#05080b', emissive: '#64e0a0', emissiveIntensity: 0.25 }));
  tablet.position.set(-spec.W * 0.05, yB + 0.24, zW - 0.02);
  tablet.rotation.y = Math.PI;
  tablet.rotation.x = 0.25;
  interior.add(dash, hoodIn, wheelR, gauges, tablet);
  for (const sx of [-1, 1]) {
    // Coluna A (inclinada como o para-brisa) e borda do teto.
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.95, 0.09), trimMat);
    pillar.position.set(sx * spec.W * 0.4, (yB + roofY) / 2, zW - 0.25);
    pillar.rotation.x = 0.55;
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.06, spec.L * 0.32), trimMat);
    rail.position.set(sx * spec.W * 0.38, roofY - 0.06, zW - 0.6 - spec.L * 0.16);
    interior.add(pillar, rail);
  }
  const roofIn = new THREE.Mesh(new THREE.BoxGeometry(spec.W * 0.78, 0.04, spec.L * 0.3), trimMat);
  roofIn.position.set(0, roofY - 0.05, zW - 0.65 - spec.L * 0.15);
  interior.add(roofIn);
  interior.visible = false;
  g.add(interior);
  g.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { group: g, wheels, headMat, tailMat, parts, spec, bodyMat, cabinMat, interior, cabin: cab };
}

// Carros estacionados (versão simples e instanciada).
export function simpleCarGeometry(kind = 'sedan') {
  const spec = BODY_SPECS[kind];
  const low = lowerSections(spec, 14);
  const zmin = -spec.L / 2;
  const zmax = spec.L / 2;
  const geos = [loftGeometry(low, zmin, zmax), capGeometry(low[low.length - 1], true, [0, 0], [1, 1]), capGeometry(low[0], false, [0, 0], [1, 1]), loftGeometry(cabinSections(spec, 8), zmin + spec.cabin.z0 * spec.L, zmin + spec.cabin.z1 * spec.L)];
  // Cor por vértice: carroceria clara (tingida pela instância), cabine escura.
  const merged = new THREE.BufferGeometry();
  const pos = [];
  const nor = [];
  const col = [];
  const idx = [];
  let o = 0;
  geos.forEach((gg, k) => {
    const g2 = gg.index ? gg : gg;
    const p = g2.attributes.position.array;
    const n = g2.attributes.normal.array;
    for (let i = 0; i < p.length; i++) pos.push(p[i]);
    for (let i = 0; i < n.length; i++) nor.push(n[i]);
    const dark = k === 3;
    for (let i = 0; i < p.length / 3; i++) {
      if (dark) col.push(0.06, 0.07, 0.08);
      else col.push(1, 1, 1);
    }
    const id = g2.index.array;
    for (let i = 0; i < id.length; i++) idx.push(id[i] + o);
    o += p.length / 3;
  });
  // Rodas simples (cilindros escuros).
  const wheelGeo = new THREE.CylinderGeometry(spec.wheelR, spec.wheelR, spec.tireW, 10);
  wheelGeo.rotateZ(Math.PI / 2);
  const axles = [zmin + spec.rearAxle * spec.L, zmin + spec.rearAxle * spec.L + spec.wheelbase];
  for (const az of axles)
    for (const sx of [-1, 1]) {
      const wg = wheelGeo.clone();
      wg.translate(sx * (spec.W / 2 - spec.tireW / 2 - 0.04), spec.wheelR, az);
      const p = wg.attributes.position.array;
      const n = wg.attributes.normal.array;
      for (let i = 0; i < p.length; i++) pos.push(p[i]);
      for (let i = 0; i < n.length; i++) nor.push(n[i]);
      for (let i = 0; i < p.length / 3; i++) col.push(0.03, 0.03, 0.03);
      const id = wg.index.array;
      for (let i = 0; i < id.length; i++) idx.push(id[i] + o);
      o += p.length / 3;
    }
  merged.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  merged.setIndex(idx);
  merged.computeBoundingSphere();
  return merged;
}

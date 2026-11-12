// Nível IV — o bairro ao entardecer: avenida larga, uma rua de casas iguais demais,
// postes acendendo, semáforo verde para ninguém e uma garagem que se abre sozinha.
import * as THREE from 'three';
import { Level } from '../game/level.js';
import { Grass, makeMask } from '../engine/grass.js';
import { groundMaterial, std, glow, blobMaterial, additive } from '../engine/materials.js';
import { ground, box, roundBox, merge, paint, tf, cylinder, tube, boxUV } from '../engine/geo.js';
import * as TX from '../engine/textures.js';
import { rng } from '../engine/noise.js';
import { car, coniferGeo, roundTreeGeo } from './props.js';
import { instanced } from './util.js';

export const META = {
  id: 'bairro',
  numeral: 'IV',
  name: 'o bairro ao entardecer',
  line: 'alguém deixou a luz da garagem acesa.',
};

const WALLS = ['#e8a2bc', '#eab8a6', '#e6d2bc', '#c4b2e2', '#a8d2bc', '#f0c4d4', '#d8c0e8'];
const ROOFS = ['#2f4a34', '#3a4a3a', '#2c3e33', '#4a4446', '#34443c'];

// Casa térrea com garagem. Local: fachada voltada para +Z, centro do terreno na origem.
function house(rand, cat, { mirror = false, lit = 0.35, special = false } = {}) {
  const W = 11 + rand() * 4, D = 8 + rand() * 2, H = 2.75;
  const gW = 6.2, gD = 6.5;
  const sx = mirror ? -1 : 1;
  const wall = WALLS[Math.floor(rand() * WALLS.length)];
  const roofC = ROOFS[Math.floor(rand() * ROOFS.length)];
  const trimC = rand() < 0.5 ? '#fbf6f2' : '#efe6e0';
  const push = (k, g) => cat[k].push(g);
  // fundação e corpo
  push('trim', tf(paint(box(W + 0.2, 0.35, D + 0.2, 1), '#b8aeb0'), [0, 0.175, 0]));
  push('wall', tf(paint(box(W, H, D, 2.2), wall), [0, 0.35 + H / 2, 0]));
  // garagem anexa
  const gx = sx * (W / 2 + gW / 2 - 0.01);
  push('trim', tf(paint(box(gW + 0.2, 0.2, gD + 0.2, 1), '#b8aeb0'), [gx, 0.1, D / 2 - gD / 2 + 0.6]));
  push('wall', tf(paint(box(gW, H - 0.1, gD, 2.2), wall), [gx, 0.2 + (H - 0.1) / 2, D / 2 - gD / 2 + 0.6]));
  // telhado de duas águas (cumeeira paralela à rua)
  const pitch = 0.42;
  const rise = (D / 2 + 0.5) * Math.tan(pitch);
  const slopeLen = (D / 2 + 0.6) / Math.cos(pitch);
  const roofY = 0.35 + H;
  for (const s of [-1, 1]) {
    const slab = box(W + 0.9, 0.16, slopeLen, 1.6);
    tf(slab, [0, roofY + rise / 2, s * (D / 4 + 0.25)], [s * pitch, 0, 0]);
    push('roof', paint(slab, roofC, 0.04, rand));
  }
  // empenas (triângulos nas laterais)
  for (const s of [-1, 1]) {
    const tri = new THREE.BufferGeometry();
    const x = s * (W / 2);
    const v = [x, roofY, -D / 2, x, roofY, D / 2, x, roofY + rise, 0];
    tri.setAttribute('position', new THREE.Float32BufferAttribute(s > 0 ? v : [v[0], v[1], v[2], v[6], v[7], v[8], v[3], v[4], v[5]], 3));
    tri.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, D / 2.2, 0, D / 4.4, rise / 2.2], 2));
    tri.computeVertexNormals();
    push('wall', paint(tri, wall));
  }
  // telhado da garagem (água única baixa)
  const gr = box(gW + 0.6, 0.14, gD + 0.7, 1.6);
  tf(gr, [gx, 0.2 + H - 0.1 + 0.35, D / 2 - gD / 2 + 0.6], [-0.12, 0, 0]);
  push('roof', paint(gr, roofC, 0.04, rand));
  // beiral/acabamento
  push('trim', tf(paint(box(W + 0.95, 0.2, 0.12, 1), trimC), [0, roofY + 0.02, D / 2 + 0.58]));
  push('trim', tf(paint(box(gW + 0.65, 0.18, 0.1, 1), trimC), [gx, 0.2 + H - 0.1 + 0.3, D / 2 + 0.95]));
  // portão da garagem
  const gdW = 4.9, gdH = 2.2;
  const gz = D / 2 + 0.6 + 0.02;
  let garageDoor = null;
  const gd = paint(box(gdW, gdH, 0.06, 0.55), '#f6f0f0');
  if (special) garageDoor = { geo: tf(gd, [0, 0, 0]), pos: [gx, 0.2 + gdH / 2, gz], w: gdW, h: gdH };
  else push('garage', tf(gd, [gx, 0.2 + gdH / 2, gz]));
  push('trim', tf(paint(box(gdW + 0.3, 0.14, 0.08, 1), trimC), [gx, 0.2 + gdH + 0.07, gz + 0.01]));
  for (const s of [-1, 1]) push('trim', tf(paint(box(0.14, gdH + 0.1, 0.08, 1), trimC), [gx + s * (gdW / 2 + 0.08), 0.2 + gdH / 2, gz + 0.01]));
  // porta da frente e luz da varanda
  const fdx = -sx * (W / 2 - 2.2);
  push('trim', tf(paint(box(1.0, 2.15, 0.08, 1), '#7a5a6a'), [fdx, 0.35 + 1.07, D / 2 + 0.03]));
  push('trim', tf(paint(box(1.25, 2.3, 0.06, 1), trimC), [fdx, 0.35 + 1.15, D / 2 + 0.01]));
  push('trim', tf(paint(box(1.6, 0.18, 1.2, 1), '#c8bcbc'), [fdx, 0.26, D / 2 + 0.6]));
  // janelas
  const nWin = W > 13 ? 3 : 2;
  for (let i = 0; i < nWin; i++) {
    const wx = sx * (W / 2 - 1.6 - i * 2.6) - sx * 0.2 + (mirror ? 0 : 0);
    if (Math.abs(wx - fdx) < 1.4) continue;
    const isLit = rand() < lit;
    push(isLit ? 'lit' : 'glass', tf(box(1.5, 1.15, 0.05), [wx, 0.35 + 1.55, D / 2 + 0.02]));
    push('trim', tf(paint(box(1.7, 0.12, 0.1, 1), trimC), [wx, 0.35 + 0.92, D / 2 + 0.04]));
    push('trim', tf(paint(box(1.7, 0.1, 0.08, 1), trimC), [wx, 0.35 + 2.18, D / 2 + 0.04]));
    for (const s of [-1, 1]) push('trim', tf(paint(box(0.09, 1.3, 0.08, 1), trimC), [wx + s * 0.8, 0.35 + 1.55, D / 2 + 0.04]));
    push('trim', tf(paint(box(0.05, 1.15, 0.07, 1), trimC), [wx, 0.35 + 1.55, D / 2 + 0.04]));
  }
  // janelas laterais e de trás (para quem anda em volta)
  for (const s of [-1, 1]) {
    const isLit = rand() < lit * 0.6;
    push(isLit ? 'lit' : 'glass', tf(box(1.4, 1.1, 0.05), [0, 0.35 + 1.55, s * (-D / 2 - 0.02)].map((v, k) => (k === 2 && s > 0 ? -D / 2 - 0.02 : v))));
  }
  if (rand() < 0.5) {
    const cx = -sx * (W / 2 - 1.5);
    push('wall', tf(paint(box(0.8, 1.6, 0.8, 1.2), '#9a7a72'), [cx, roofY + rise * 0.5 + 0.6, -0.8]));
  }
  return { W, D, gx, gW, gz, fdx, garageDoor, wall };
}

export class Level4 extends Level {
  heightAt(x, z) {
    return this.onSidewalk(x, z) ? 0.12 : 0;
  }

  onSidewalk(x, z) {
    if (Math.abs(z - 8.5) < 1.0 && Math.abs(x) < 700) return true;
    if (Math.abs(z + 8.5) < 1.0 && Math.abs(x) > 5) return true;
    if (z < -7 && Math.abs(Math.abs(x) - 6) < 1.0) return true;
    return false;
  }

  surfaceAt(x, z) {
    if (Math.abs(z) < 7 || (z < -7 && Math.abs(x) < 4.5)) return 'asphalt';
    if (this.onSidewalk(x, z)) return 'concrete';
    for (const d of this.drives || []) if (Math.abs(x - d[0]) < d[2] / 2 && Math.abs(z - d[1]) < d[3] / 2) return 'concrete';
    return 'grass';
  }

  build() {
    const q = this.ctx.quality;
    const rand = rng(404);
    this.spawn = { x: -1.5, z: 14, yaw: -0.18 };
    this.bounds = { x: 0, z: -90, r: 200 };
    this.titleCam = { from: [-2, 1.65, 14.5], to: [-1, 1.65, 12.5], yaw: -0.16, pitch: 0.06, dur: 70 };
    this.env = {
      sky: {
        zenith: '#2a46d2',
        horizon: '#7a92e6',
        ground: '#3a3050',
        horizonSun: '#f6a6c8',
        horizonSunAmt: 0.85,
        skyExp: 0.45,
        sunElev: -3,
        sunAzim: -92,
        sunColor: '#ff9ec4',
        sunGlow: 0.6,
        sunGlowPow: 5,
        cloudCover: 0.26,
        cloudSoft: 0.06,
        cloudScale: 3.6,
        cloudThick: 0.3,
        cloudShape: 0.35,
        cloudSteps: 6,
        cloudOpacity: 1,
        cloudLightK: 8,
        cloudBright: 0.85,
        cloudCurve: 0.1,
        cloudWind: [0.003, 0.001],
        cloudLit: '#ff8cc6',
        cloudLit2: '#ffa8d0',
        cloudShade: '#7a5cc0',
        skyFog: 3000,
        skyHaze: 0.25,
      },
      atmo: {
        fogColor: '#7f90e2',
        fogSunColor: '#f2a2c8',
        fogSunAmount: 0.5,
        fogBase: 0.0014,
        airFalloff: 1 / 200,
        fogGround: 0.0008,
        fogFalloff: 0.3,
        wind: [0.6, 0.6, 0.3],
      },
      sun: { color: '#ff7cb0', intensity: 2.6, elev: 6, azim: -92 },
      hemi: { sky: '#6f84ea', ground: '#3d4a36', intensity: 0.55 },
      envIntensity: 1.0,
      exposure: 1.18,
      shadowExtent: 42,
      memoryColor: '#ffd8ec',
      post: {
        bloom: 0.09,
        bloomTint: '#ffe0f0',
        haze: 0.05,
        edgeBlur: 0.22,
        ca: 0.0035,
        grain: 0.05,
        vignette: 0.36,
        vigColor: '#1a0f2a',
        sat: 1.16,
        contrast: 1.05,
        split: 0.1,
        tintShadow: '#1f2ea0',
        tintHigh: '#ffc6e2',
        lift: '#100c26',
        gain: '#fff4ff',
        leak: 0.08,
        leakColor: '#ff9ed0',
      },
      music: 'bairro',
    };

    // chão (gramado) e asfalto
    const gtex = TX.grassGround({ a: '#2f5a2c', b: '#3e6a34', c: '#6a7a44', d: '#4a4a34', seed: 44 });
    const lawn = groundMaterial({ map: gtex.map, normalMap: gtex.normalMap, roughness: 1, far: '#2f5530', farStart: 25, farEnd: 90, farMix: 0.6, macro: 0.15 });
    this.mesh(ground(4000, 4000, 4, 100, 100), lawn, { cast: false });
    const at = TX.asphalt(5);
    const asphaltMat = groundMaterial({ map: at.map, normalMap: at.normalMap, roughness: 0.92, color: '#d4ccdc', macro: 0.12, second: 0.5, secondMix: 0.35 });
    const av = box(1400, 0.06, 14, 0);
    const avG = new THREE.BoxGeometry(1400, 0.06, 14, 140, 1, 2);
    boxUV(avG, 5);
    this.mesh(avG, asphaltMat, { cast: false }).position.set(0, 0.0, 0);
    av.dispose();
    const stG = new THREE.BoxGeometry(9, 0.06, 700, 1, 1, 70);
    boxUV(stG, 5);
    this.mesh(stG, asphaltMat, { cast: false }).position.set(0, 0.0, -357);
    // faixas pintadas
    const paintMat = std('#e8e2d0', { roughness: 0.7 });
    const yellow = std('#e8c060', { roughness: 0.7 });
    const lines = [];
    for (let x = -700; x < 700; x += 9) lines.push(tf(box(4.5, 0.01, 0.14), [x + 2.25, 0.035, 3.5]), tf(box(4.5, 0.01, 0.14), [x + 2.25, 0.035, -3.5]));
    const yl = [];
    for (let x = -700; x < 700; x += 50) yl.push(tf(box(50, 0.01, 0.12), [x + 25, 0.036, 0.12]), tf(box(50, 0.01, 0.12), [x + 25, 0.036, -0.12]));
    this.mesh(merge(lines), paintMat, { cast: false });
    this.mesh(merge(yl), yellow, { cast: false });
    // calçadas e meio-fio
    const ct = TX.concrete(3);
    const conc = groundMaterial({ map: ct.map, normalMap: ct.normalMap, roughness: 0.9, color: '#d9cdd8', macro: 0.1, second: 0.5 });
    const walks = [];
    const addWalk = (cx, cz, w, d) => {
      const g = new THREE.BoxGeometry(w, 0.14, d, Math.max(1, Math.round(w / 20)), 1, Math.max(1, Math.round(d / 20)));
      boxUV(g, 2.5);
      walks.push(tf(g, [cx, 0.05, cz]));
    };
    addWalk(0, 8.5, 1400, 2);
    addWalk(-355, -8.5, 690, 2);
    addWalk(355, -8.5, 690, 2);
    addWalk(-6, -357, 2, 696);
    addWalk(6, -357, 2, 696);
    this.mesh(merge(walks), conc, { cast: false });

    // casas
    const cat = { wall: [], roof: [], trim: [], garage: [], glass: [], lit: [] };
    const lots = [];
    const drives = (this.drives = []);
    let special = null;
    const placeHouse = (x, z, rot, opts = {}) => {
      const local = [];
      const c2 = { wall: [], roof: [], trim: [], garage: [], glass: [], lit: [] };
      const h = house(rand, c2, opts);
      const m = new THREE.Matrix4().makeRotationY(rot).setPosition(x, 0, z);
      for (const k in c2) for (const g of c2[k]) cat[k].push(g.applyMatrix4(m));
      // colisores (corpo + garagem)
      const c = Math.cos(rot), s = Math.sin(rot);
      const toW = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
      const [bx, bz] = toW(0, 0);
      this.rect(bx, bz, h.W, h.D, rot);
      const [gx2, gz2] = toW(h.gx, h.D / 2 - 6.5 / 2 + 0.6);
      if (!opts.special) this.rect(gx2, gz2, h.gW, 6.5, rot);
      // entrada da garagem até a rua
      const dl = opts.driveLen || 9;
      const [dx, dz] = toW(h.gx, h.D / 2 + 0.6 + dl / 2);
      const isX = Math.abs(s) > 0.5;
      drives.push(isX ? [dx, dz, dl, 5.2] : [dx, dz, 5.2, dl]);
      lots.push({ x, z, rot, h, toW });
      if (opts.special) special = { ...h, x, z, rot, toW, m };
      return h;
    };
    // rua A (casas dos dois lados, de frente para a rua)
    let k = 0;
    for (let z = -20; z > -300; z -= 19.5) {
      for (const side of [-1, 1]) {
        k++;
        const isSpecial = side < 0 && Math.abs(z + 176) < 9;
        placeHouse(side * 20.5, z + (rand() - 0.5) * 1.5, side > 0 ? -Math.PI / 2 : Math.PI / 2, { mirror: (k % 3 === 0) !== side > 0, lit: 0.3, special: isSpecial, driveLen: 8.4 });
      }
    }
    // avenida (lado norte, de frente para o sul) e lado sul (entre as ruas)
    for (let x = -210; x <= 210; x += 21) {
      if (Math.abs(x) < 8) continue;
      placeHouse(x + (rand() - 0.5) * 2, 23, Math.PI, { mirror: rand() < 0.5, lit: 0.3, driveLen: 9.5 });
    }
    for (let x = -210; x <= 210; x += 21) {
      if (Math.abs(x) < 34) continue;
      placeHouse(x + (rand() - 0.5) * 2, -23, 0, { mirror: rand() < 0.5, lit: 0.3, driveLen: 9.5 });
    }
    const sid = TX.siding();
    const shg = TX.shingles();
    const wallMat = std('#ffffff', { vertexColors: true, map: sid.map, normalMap: sid.normalMap, roughness: 0.85 });
    const roofMat = std('#ffffff', { vertexColors: true, map: shg.map, normalMap: shg.normalMap, roughness: 0.95 });
    const trimMat = std('#ffffff', { vertexColors: true, roughness: 0.6 });
    const garageMat = std('#ffffff', { vertexColors: true, normalMap: sid.normalMap, roughness: 0.5 });
    const glassMat = new THREE.MeshStandardMaterial({ color: '#1c2036', roughness: 0.08, metalness: 0.6 });
    const litMat = glow('#ffcf9e', 2.6);
    const mergeIn = (list, mat, cast = true) => list.length && this.mesh(merge(list), mat, { cast, receive: true });
    mergeIn(cat.wall, wallMat);
    mergeIn(cat.roof, roofMat);
    mergeIn(cat.trim, trimMat);
    mergeIn(cat.garage, garageMat);
    mergeIn(cat.glass, glassMat, false);
    mergeIn(cat.lit, litMat, false);
    // entradas de carro
    const dg = drives.map(([x, z, w, d]) => {
      const g = new THREE.BoxGeometry(w, 0.1, d);
      boxUV(g, 2.5);
      return tf(g, [x, 0.02, z]);
    });
    this.mesh(merge(dg), conc, { cast: false });

    // garagem especial (saída)
    if (special) {
      const sgd = special.garageDoor;
      const gdMesh = new THREE.Mesh(sgd.geo, garageMat);
      const holder = new THREE.Group();
      holder.applyMatrix4(special.m);
      gdMesh.position.set(sgd.pos[0], sgd.pos[1], sgd.pos[2]);
      gdMesh.castShadow = true;
      holder.add(gdMesh);
      // interior iluminado
      const inner = new THREE.Mesh(new THREE.PlaneGeometry(sgd.w, sgd.h), glow('#fff6fb', 0));
      inner.position.set(sgd.pos[0], sgd.pos[1], sgd.pos[2] - 6);
      holder.add(inner);
      const sideMat = std('#e8e0e6', { roughness: 0.9 });
      for (const s of [-1, 1]) {
        const wl = new THREE.Mesh(box(0.1, sgd.h, 6), sideMat);
        wl.position.set(sgd.pos[0] + s * sgd.w / 2, sgd.pos[1], sgd.pos[2] - 3);
        holder.add(wl);
      }
      const ceil = new THREE.Mesh(box(sgd.w, 0.1, 6), sideMat);
      ceil.position.set(sgd.pos[0], sgd.pos[1] + sgd.h / 2, sgd.pos[2] - 3);
      holder.add(ceil);
      this.add(holder);
      this.garage = { door: gdMesh, inner, base: sgd.pos[1], h: sgd.h, open: 0, opening: false };
      // colisores das paredes laterais do interior
      const [lx0, lz0] = special.toW(sgd.pos[0] - sgd.w / 2, sgd.pos[2] - 3);
      const [lx1, lz1] = special.toW(sgd.pos[0] + sgd.w / 2, sgd.pos[2] - 3);
      this.rect(lx0, lz0, 0.2, 6, special.rot);
      this.rect(lx1, lz1, 0.2, 6, special.rot);
      this.garageCollider = this.colliders.length;
      const [gcx, gcz] = special.toW(sgd.pos[0], sgd.pos[2] - 0.1);
      this.rect(gcx, gcz, sgd.w, 0.3, special.rot);
      const [ix, iz] = special.toW(sgd.pos[0], sgd.pos[2] - 5.2);
      this.rect(ix, iz, sgd.w, 0.3, special.rot);
      const [dx, dz] = special.toW(sgd.pos[0], sgd.pos[2] - 4.4);
      this.door = { x: dx, z: dz, yaw: special.rot, frame: '#ffffff', leaf: '#f4e6ee', knob: '#e8d0a0', beam: false };
      this.onUpdate((dt) => {
        const g = this.garage;
        if (!g.opening) return;
        g.open = Math.min(1, g.open + dt * 0.25);
        const e = g.open * g.open * (3 - 2 * g.open);
        g.door.position.y = g.base + e * (g.h - 0.15);
        g.door.position.z = sgd.pos[2] - e * 0.4;
        g.door.rotation.x = -e * 1.2;
        g.inner.material.emissiveIntensity = e * 5;
        if (g.open > 0.85 && this.colliders[this.garageCollider]) this.colliders[this.garageCollider].hw = 0;
      });
    }

    // árvores
    const conGeo = coniferGeo(9, 2.3, 1, rand);
    const rtGeo = roundTreeGeo(6.5, 2.7, rand, '#2f5a32');
    const treeMat = std('#ffffff', { vertexColors: true, roughness: 0.9 });
    const cons = [], rounds = [];
    for (const L of lots) {
      const n = 1 + Math.floor(rand() * 2);
      for (let i = 0; i < n; i++) {
        const lx = (rand() < 0.5 ? -1 : 1) * (L.h.W / 2 + 2 + rand() * 2) * (rand() < 0.3 ? 0 : 1);
        const lz = rand() < 0.6 ? -L.h.D / 2 - 3 - rand() * 4 : L.h.D / 2 + 4 + rand() * 2;
        const [x, z] = L.toW(lx, lz);
        if (Math.abs(x) < 8 && z < 0) continue;
        if (Math.abs(z) < 10) continue;
        const s = 0.75 + rand() * 0.5;
        (rand() < 0.45 ? cons : rounds).push({ x, z, s, ry: rand() * 6 });
        this.circle(x, z, 0.3 * s);
      }
    }
    // pinheiros escuros perto do início (como na foto)
    for (const [x, z, s] of [[-14, -14, 1.3], [-18, -12, 1.1], [-11, -20, 1.0]]) {
      cons.push({ x, z, s, ry: rand() * 6 });
      this.circle(x, z, 0.4);
    }
    this.add(instanced(conGeo, treeMat, cons));
    this.add(instanced(rtGeo, treeMat, rounds));

    // postes (instanciados) + luzes reais nos mais próximos
    const metal = std('#3a3640', { roughness: 0.4, metalness: 0.6 });
    const lampParts = [];
    lampParts.push(tf(cylinder(0.07, 0.11, 8, 10), [0, 4, 0]));
    lampParts.push(tube([[0, 7.6, 0], [0, 8.1, 0], [0.4, 8.5, 0], [1.4, 8.65, 0], [2.4, 8.55, 0]], 0.05, 20, 6));
    lampParts.push(tf(roundBox(0.75, 0.18, 0.36, 0.07, 2), [2.6, 8.5, 0], [0, 0, -0.06]));
    const lampGeo = merge(lampParts);
    const lensGeo = tf(roundBox(0.55, 0.05, 0.26, 0.02, 2), [2.6, 8.4, 0]);
    const lensMat = glow('#ffdcc4', 7);
    const lamps = [];
    const lampItems = [];
    const addLamp = (x, z, ry) => {
      lampItems.push({ x, y: 0.12, z, ry });
      const hx = x + Math.cos(ry) * 2.6, hz = z - Math.sin(ry) * 2.6;
      lamps.push(new THREE.Vector3(hx, 8.3, hz));
      this.circle(x, z, 0.2);
    };
    for (let z = -16; z > -300; z -= 34) {
      addLamp(-6.9, z, 0);
      addLamp(6.9, z - 17, Math.PI);
    }
    for (let x = -200; x < 200; x += 38) {
      if (Math.abs(x) < 6) continue;
      addLamp(x, 9.3, -Math.PI / 2);
      addLamp(x + 19, -9.3, Math.PI / 2);
    }
    this.add(instanced(lampGeo, metal, lampItems));
    this.add(instanced(lensGeo, lensMat, lampItems, { cast: false }));
    const pool = [];
    for (let i = 0; i < 4; i++) {
      const L = new THREE.PointLight('#ffcfb8', 0, 22, 1.4);
      this.add(L);
      pool.push(L);
    }
    this.onUpdate((dt, t, game) => {
      const p = game.camera.position;
      const sorted = lamps.map((v) => [v, v.distanceToSquared(p)]).sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < pool.length; i++) {
        const [v, d2] = sorted[i];
        pool[i].position.copy(v);
        pool[i].position.y -= 0.4;
        pool[i].intensity = 40 * (1 - Math.min(1, Math.sqrt(d2) / 70));
      }
    });

    // semáforo (braço sobre a avenida) com luz verde
    const tl = new THREE.Group();
    const darkMetal = std('#3e3a3c', { roughness: 0.5, metalness: 0.5 });
    const pole = new THREE.Mesh(cylinder(0.12, 0.15, 6.4, 12), darkMetal);
    pole.position.y = 3.2;
    pole.castShadow = true;
    tl.add(pole);
    const arm = new THREE.Mesh(cylinder(0.07, 0.09, 9, 8), darkMetal);
    arm.rotation.z = Math.PI / 2;
    arm.position.set(-4.4, 6.0, 0);
    tl.add(arm);
    const headMat = std('#3a6a50', { roughness: 0.5, emissive: '#2a8a5a', emissiveIntensity: 0.35 });
    const sig = { red: glow('#ff3050', 0.15), yellow: glow('#ffb030', 0.15), green: glow('#5dffa0', 9) };
    for (const hx of [-3.2, -7.4]) {
      const head = new THREE.Mesh(roundBox(0.42, 1.25, 0.38, 0.06, 2), headMat);
      head.position.set(hx, 5.25, 0);
      head.castShadow = true;
      tl.add(head);
      ['red', 'yellow', 'green'].forEach((c, i) => {
        for (const face of [-1, 1]) {
          const l = new THREE.Mesh(new THREE.CircleGeometry(0.15, 16), sig[c]);
          l.position.set(hx, 5.65 - i * 0.4, face * 0.2);
          if (face < 0) l.rotation.y = Math.PI;
          tl.add(l);
        }
      });
    }
    tl.position.set(6.4, 0.12, 9.5);
    this.add(tl);
    this.circle(6.4, 9.5, 0.2);
    const greenLight = new THREE.PointLight('#5dffa0', 3, 12, 1.5);
    greenLight.position.set(6.4 - 3.2, 5, 9.5);
    this.add(greenLight);
    let tlT = 0;
    this.onUpdate((dt, t, game) => {
      tlT += dt;
      const cyc = tlT % 34;
      const st = cyc < 24 ? 'green' : cyc < 27 ? 'yellow' : 'red';
      if (st !== this.tlState) {
        this.tlState = st;
        sig.green.emissiveIntensity = st === 'green' ? 9 : 0.15;
        sig.yellow.emissiveIntensity = st === 'yellow' ? 8 : 0.15;
        sig.red.emissiveIntensity = st === 'red' ? 8 : 0.15;
        greenLight.color.set(st === 'green' ? '#5dffa0' : st === 'yellow' ? '#ffb030' : '#ff3050');
        if (game.audio) game.audio.click(new THREE.Vector3(5, 5, 9.6));
      }
    });

    // prédio alto no fim da rua
    const wtex = TX.windowGrid(7, 10, 26, 0.22);
    const towerMat = std('#ffffff', { map: wtex, roughness: 0.6, emissive: '#ffd8c0', emissiveMap: wtex, emissiveIntensity: 0.6 });
    const tw = box(26, 62, 18);
    const uv = tw.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i), uv.getY(i));
    const tower = this.mesh(tw, towerMat, { cast: false });
    tower.position.set(30, 31, -345);
    const tw2 = this.mesh(box(18, 40, 16), towerMat, { cast: false });
    tw2.position.set(-60, 20, -420);

    // carros estacionados e um que nunca chega
    const carCols = ['#c8d0e6', '#e0b8c8', '#9aa6c8', '#f0e6e0'];
    const parked = [[3.2, -60, Math.PI], [-3.2, -112, 0], [3.2, -150, Math.PI, true], [-3.2, -230, 0]];
    parked.forEach(([x, z, ry, lights], i) => {
      const c = car({ color: carCols[i % carCols.length], headlights: !!lights, tail: !!lights });
      c.group.position.set(x, 0, z);
      c.group.rotation.y = ry;
      this.add(c.group);
      this.rect(x, z, 1.9, 4.5, ry);
    });
    const ghost = car({ color: '#d8d0e8', headlights: true });
    ghost.group.position.set(-2.2, 0, -360);
    this.add(ghost.group);
    const ghostLight = new THREE.SpotLight('#fff0e0', 30, 60, 0.5, 0.6, 1.2);
    ghostLight.position.set(-2.2, 0.8, -357.5);
    ghostLight.target.position.set(-2.2, 0, -330);
    this.add(ghostLight, ghostLight.target);
    this.onUpdate((dt, t, game) => {
      // o carro distante mantém sempre a mesma distância
      const pz = game.player.pos.z;
      const target = Math.min(-200, pz - 230);
      ghost.group.position.z += (target - ghost.group.position.z) * Math.min(1, dt * 0.2);
      ghostLight.position.z = ghost.group.position.z + 2.5;
      ghostLight.target.position.z = ghost.group.position.z + 30;
    });

    // caixas de correio, bicicleta, tabela de basquete
    const mbParts = [tf(box(0.08, 1.0, 0.08), [0, 0.5, 0]), tf(roundBox(0.24, 0.24, 0.5, 0.1, 2), [0, 1.08, 0])];
    const mbGeo = merge(mbParts);
    const mailboxes = lots.map((L) => {
      const [x, z] = L.toW(L.h.gx + 3.2 * Math.sign(L.h.gx || 1), L.h.D / 2 + 8.2);
      return { x, z, ry: L.rot, color: rand() < 0.5 ? '#3a3a44' : '#e8e0e0' };
    });
    this.add(instanced(mbGeo, std('#ffffff', { roughness: 0.5, metalness: 0.3 }), mailboxes));
    // bicicleta caída no gramado
    const bikeG = new THREE.Group();
    const bikeMat = std('#3a6ad0', { roughness: 0.35, metalness: 0.6 });
    for (const bx of [-0.5, 0.5]) {
      const w = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.025, 8, 24), std('#202024', { roughness: 0.8 }));
      w.position.set(bx, 0.33, 0);
      bikeG.add(w);
    }
    const fr = new THREE.Mesh(tube([[-0.5, 0.33, 0], [-0.05, 0.62, 0], [0.4, 0.62, 0], [0.5, 0.33, 0], [0.05, 0.33, 0], [-0.05, 0.62, 0]], 0.022, 30, 6), bikeMat);
    bikeG.add(fr);
    const hb = new THREE.Mesh(tube([[0.4, 0.62, 0], [0.42, 0.85, 0], [0.42, 0.85, 0.2], [0.42, 0.85, -0.2]], 0.018, 10, 6), bikeMat);
    bikeG.add(hb);
    bikeG.rotation.set(0, 0.6, Math.PI / 2 - 0.12);
    bikeG.position.set(13.5, 0.05, -52);
    this.add(bikeG);
    // tabela de basquete
    const hoop = new THREE.Group();
    const hp = new THREE.Mesh(cylinder(0.06, 0.07, 3.2, 8), std('#e8e4e0', { metalness: 0.4, roughness: 0.4 }));
    hp.position.y = 1.6;
    hoop.add(hp);
    const bb = new THREE.Mesh(box(1.2, 0.8, 0.05), std('#f4f0f0', { roughness: 0.4 }));
    bb.position.set(0, 3.3, 0.25);
    hoop.add(bb);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.015, 6, 20), std('#ff6a3a', { roughness: 0.5 }));
    rim.rotation.x = Math.PI / 2;
    rim.position.set(0, 3.05, 0.5);
    hoop.add(rim);
    hoop.position.set(-11.2, 0, -96.5);
    hoop.rotation.y = Math.PI / 2;
    this.add(hoop);
    this.circle(-11.2, -96.5, 0.15);

    // grama dos gramados (fora de ruas, calçadas, entradas e casas)
    const mask = makeMask([-240, -440, 480, 480], (ctx) => {
      ctx.fillStyle = '#000';
      ctx.fillRect(-700, -7.2, 1400, 14.4);
      ctx.fillRect(-4.7, -440, 9.4, 440);
      ctx.fillRect(-700, 7.3, 1400, 2.4);
      ctx.fillRect(-700, -9.7, 1400, 2.4);
      ctx.fillRect(-7.2, -440, 2.4, 440);
      ctx.fillRect(4.8, -440, 2.4, 440);
      for (const [x, z, w, d] of drives) ctx.fillRect(x - w / 2, z - d / 2, w, d);
      for (const L of lots) {
        ctx.save();
        ctx.translate(L.x, L.z);
        ctx.rotate(-L.rot);
        ctx.fillRect(-L.h.W / 2 - (L.h.gx < 0 ? 6.4 : 0.2), -L.h.D / 2 - 0.2, L.h.W + 6.6, L.h.D + 1.2);
        ctx.restore();
      }
    }, 2048);
    const grass = new Grass({
      tile: 10,
      slots: q.grassSlots,
      density: 44 * q.grassDensity,
      height: [0.06, 0.13],
      width: [0.03, 0.055],
      base: '#123214',
      tip: '#3f7c38',
      dry: '#6a8a40',
      dryAmount: 0.25,
      ao: 0.5,
      patch: 0.2,
      lean: 0.3,
      seed: 8,
    });
    grass.setMask(mask);
    this.grass.push(grass);
    this.add(grass.group);

    this.memoryDefs = [
      { x: 13.2, y: 1.2, z: -53, theme: 'bike', caption: 'a bicicleta azul', line: 'a primeira vez sem rodinhas. alguém soltou sua mão.' },
      { x: -11.6, y: 1.6, z: -94.5, theme: 'grandma', caption: 'casa da vó', line: 'o café passava às quatro da tarde. sempre.' },
      { x: 4.6, y: 1.3, z: -150, theme: 'night', caption: 'voltando para casa', line: 'as luzes da rua passavam pelo teto do carro.' },
    ];
    if (!this.door) this.door = { x: 0, z: -190, yaw: 0 };
    this.doorLine = 'uma garagem se abriu lá embaixo, à esquerda.';
    this.sounds = [
      { type: 'crickets', x: 15, y: 0.5, z: -40, gain: 0.5 },
      { type: 'crickets', x: -16, y: 0.5, z: -110, gain: 0.5 },
      { type: 'crickets', x: 30, y: 0.5, z: 20, gain: 0.4 },
      { type: 'hum', x: -4.3, y: 8.3, z: -16, gain: 0.3 },
      { type: 'hum', x: 4.3, y: 8.3, z: -33, gain: 0.3 },
    ];
    this.trigger(-2, -30, 6, (g) => g.whisper('todas as casas são iguais. qual era a sua?'));
    this.trigger(0, -125, 6, (g) => g.whisper('o carro lá no fim nunca chega.'));
  }

  onAllCollected(game) {
    if (this.garage) this.garage.opening = true;
    game.door.show();
    if (game.audio) game.audio.doorAppear(game.door);
    game.whisper(this.doorLine);
  }
}

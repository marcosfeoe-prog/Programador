// O Vale dos Corvos: vila (zona 1), cemitério e rio (zona 2) e a forja (zona 3).
// Geometria estática juntada pelo Batcher, colisores, fontes de luz, fogo, céu e neblina.
import * as THREE from 'three';
import { tex } from './textures.js';
import { Batcher, boxGeo, cylGeo, planeGeo, gableRoofGeo, gableEndsGeo, mat4, scaleUV } from './geo.js';
import { Rng, clamp, lerp, smoothstep } from './util.js';
import { RIVER } from './collision.js';

const Std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.92, ...o });

export const BOUNDS = { minX: -46, maxX: 46, minZ: -30, maxZ: 192 };
export const ZONE_Z = [72, 140];
export const ARENA = { x: 0, z: 168, r: 18 };

export function zoneOf(z) {
  return z < ZONE_Z[0] ? 1 : z < ZONE_Z[1] ? 2 : 3;
}

const FOG = [
  { z: -999, color: new THREE.Color(0x161c26), density: 0.038 },
  { z: 74, color: new THREE.Color(0x161b23), density: 0.047 },
  { z: 142, color: new THREE.Color(0x1d1612), density: 0.03 },
];

export class World {
  constructor(G) {
    this.G = G;
    this.scene = G.scene;
    this.col = G.col;
    this.anchors = {};
    this.flames = [];
    this.fires = [];
    this.indoors = [];
    this.grassMeshes = [];
    this.fogColor = new THREE.Color(0x161c26);
    this.fogDensity = 0.038;
    this.time = 0;
  }

  // ------------------------------------------------------------------ materiais
  mats() {
    const D = THREE.DoubleSide;
    this.M = {
      ground: Std({ map: tex('dirt'), color: 0x8c8272 }),
      road: Std({ map: tex('dirt'), color: 0xb4a890 }),
      cobble: Std({ map: tex('cobble'), color: 0xa49e94, roughness: 0.88 }),
      plaster: Std({ map: tex('plaster'), color: 0xc2b6a2 }),
      plasterDark: Std({ map: tex('plaster'), color: 0x948470 }),
      wood: Std({ map: tex('planks'), color: 0xa48a70 }),
      woodDark: Std({ map: tex('planks'), color: 0x74604e }),
      beam: Std({ map: tex('planks'), color: 0x4e3c2c }),
      floor: Std({ map: tex('planks'), color: 0x7a6450, roughness: 0.8 }),
      stone: Std({ map: tex('stone'), color: 0xa49e94, roughness: 0.95 }),
      stoneDark: Std({ map: tex('stone'), color: 0x6e6a62, roughness: 0.95 }),
      roof: Std({ map: tex('roof'), color: 0xb08a78, roughness: 0.85, side: D }),
      roofWood: Std({ map: tex('planks'), color: 0x5e4e40, side: D }),
      bark: Std({ map: tex('bark'), color: 0x8e867c }),
      iron: Std({ map: tex('metal'), color: 0x80808a, metalness: 0.6, roughness: 0.55 }),
      rust: Std({ map: tex('rust'), color: 0xb08068, metalness: 0.4, roughness: 0.7 }),
      hay: Std({ map: tex('fabric'), color: 0x9a8448 }),
      glass: Std({ color: 0x0b0e12, roughness: 0.25, metalness: 0.3 }),
      lit: new THREE.MeshBasicMaterial({ color: 0xffa64a }),
      litDim: new THREE.MeshBasicMaterial({ color: 0x8a4a1c }),
      ember: new THREE.MeshBasicMaterial({ color: 0xff6a1a, toneMapped: false }),
      molten: new THREE.MeshBasicMaterial({ color: 0xff8a2a, toneMapped: false }),
      water: Std({ map: tex('water'), color: 0x8aa0b0, roughness: 0.1, metalness: 0.3 }),
      rock: Std({ map: tex('stone'), color: 0x5e5c56, flatShading: true }),
      pine: Std({ color: 0x1c2619, flatShading: true }),
      bush: Std({ color: 0x252b1d, flatShading: true }),
      grass: Std({ map: tex('grass'), alphaTest: 0.5, side: D, color: 0xa8a48c }),
      cloth: Std({ map: tex('fabric'), color: 0x8a8070, side: D }),
      cloth2: Std({ map: tex('fabric'), color: 0x5a3a34, side: D }),
      tomb: Std({ map: tex('stone'), color: 0x9a9890, roughness: 0.95 }),
      dark: Std({ color: 0x0c0a09, roughness: 1 }),
      rug: Std({ map: tex('fabric'), color: 0x5a2420 }),
      book: Std({ color: 0x4a2a1c }),
      coal: Std({ color: 0x141210, roughness: 1, flatShading: true }),
      sign: Std({ map: tex('sign'), roughness: 0.9 }),
      paper: Std({ map: tex('paper'), roughness: 0.9, side: D }),
    };
    this.flameMat = new THREE.SpriteMaterial({ map: tex('flame'), color: 0xffffff, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.glowMat = new THREE.SpriteMaterial({ map: tex('glow'), color: 0xff8a3a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 });
  }

  // ------------------------------------------------------------------ helpers
  chunk(z) {
    return Math.floor((z + 40) / 40);
  }

  box(x, y, z, w, h, d, mat, o = {}) {
    const ry = o.ry || 0;
    this.B.add(boxGeo(w, h, d, o.tile || 2), mat, mat4(x, y, z, ry, o.rx || 0, o.rz || 0), {
      cast: o.cast ?? true,
      receive: o.receive ?? true,
      chunk: this.chunk(z),
    });
    if (o.col) this.col.addBox(x, z, o.cw ?? w, o.cd ?? d, ry, { y0: o.y0 ?? y - h / 2, y1: o.y1 ?? y + h / 2, mat: o.cm || 'stone', shootThrough: o.st, noCamera: o.nc });
  }

  cyl(x, y, z, rt, rb, h, mat, o = {}) {
    this.B.add(cylGeo(rt, rb, h, o.seg || 10, o.tile || 2, o.open), mat, mat4(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0), {
      cast: o.cast ?? true,
      receive: o.receive ?? true,
      chunk: this.chunk(z),
    });
    if (o.col) this.col.addCircle(x, z, o.cr ?? Math.max(rt, rb), { y0: o.y0 ?? y - h / 2, y1: o.y1 ?? y + h / 2, mat: o.cm || 'stone', shootThrough: o.st });
  }

  geo(g, mat, x, y, z, ry = 0, rx = 0, rz = 0, o = {}) {
    this.B.add(g, mat, mat4(x, y, z, ry, rx, rz, o.sx || 1, o.sy || 1, o.sz || 1), { cast: o.cast ?? true, receive: o.receive ?? true, chunk: this.chunk(z) });
  }

  wallInv(x0, z0, x1, z1, th = 0.4) {
    const dx = x1 - x0,
      dz = z1 - z0,
      L = Math.hypot(dx, dz);
    const rot = Math.atan2(dx, dz);
    this.col.addBox((x0 + x1) / 2, (z0 + z1) / 2, th, L, rot, { y0: 0, y1: 6, invisible: true });
  }

  flame(x, y, z, s = 0.35, glow = true) {
    const f = new THREE.Sprite(this.flameMat);
    f.position.set(x, y, z);
    f.scale.set(s * 0.6, s, 1);
    f.userData.base = s;
    f.userData.phase = Math.random() * 10;
    f.renderOrder = 5;
    this.scene.add(f);
    this.flames.push(f);
    if (glow) {
      const g = new THREE.Sprite(this.glowMat);
      g.position.set(x, y, z);
      g.scale.setScalar(s * 3.2);
      g.renderOrder = 5;
      this.scene.add(g);
    }
    return f;
  }

  light(x, y, z, color, intensity, range, flicker = 0.1, priority = 0) {
    return this.G.fx.lights.add({ x, y, z, color, intensity, range, flicker, priority });
  }

  // ------------------------------------------------------------------ construção
  build() {
    this.mats();
    this.B = new Batcher();
    this.rng = new Rng(4242);
    this.buildGround();
    this.buildBoundaries();
    this.buildZone1();
    this.buildZone2();
    this.buildZone3();
    this.buildForest();
    this.B.build(this.scene);
    this.buildGrass();
    this.buildSky();
    this.buildLights();
  }

  buildGround() {
    const M = this.M;
    // chão ao sul do rio e ao norte (o rio fica entre z=130 e z=140)
    const south = planeGeo(140, 180, 4);
    this.geo(south, M.ground, 0, 0, (RIVER.z0 - 180 / 2), 0, -Math.PI / 2, 0, { cast: false });
    const north = planeGeo(140, 80, 4);
    this.geo(north, M.ground, 0, 0, RIVER.z1 + 40, 0, -Math.PI / 2, 0, { cast: false });
    // água e margens
    const water = new THREE.Mesh(planeGeo(140, RIVER.z1 - RIVER.z0 + 1, 6), M.water);
    water.rotation.x = -Math.PI / 2;
    water.position.set(0, RIVER.y, (RIVER.z0 + RIVER.z1) / 2);
    water.receiveShadow = true;
    this.scene.add(water);
    this.water = water;
    this.box(0, -0.7, RIVER.z0 - 0.2, 140, 1.4, 0.4, M.stoneDark, { cast: false, tile: 1.5 });
    this.box(0, -0.7, RIVER.z1 + 0.2, 140, 1.4, 0.4, M.stoneDark, { cast: false, tile: 1.5 });
    this.box(0, -1.45, (RIVER.z0 + RIVER.z1) / 2, 140, 0.1, 10.5, M.dark, { cast: false });
    // estrada e caminhos
    this.box(0, 0.006, -3, 5, 0.012, 52, M.road, { cast: false, tile: 4 });
    this.geo(scaleUV(new THREE.CircleGeometry(12, 40), 8), M.cobble, 0, 0.012, 32, 0, -Math.PI / 2, 0, { cast: false });
    this.box(0, 0.01, 57.5, 5, 0.012, 29, M.cobble, { cast: false, tile: 3 });
    this.box(-9, 0.008, 12, 6, 0.012, 2.6, M.road, { cast: false, tile: 4 });
    this.box(8, 0.008, 14.8, 7, 0.012, 2.6, M.road, { cast: false, tile: 4 });
    this.box(-11, 0.008, 54, 10, 0.012, 2.6, M.road, { cast: false, tile: 4 });
    this.box(0, 0.01, 100.5, 3.6, 0.012, 57, M.road, { cast: false, tile: 3 });
    this.box(-9.5, 0.008, 104, 19, 0.012, 2.4, M.road, { cast: false, tile: 3 });
    this.box(9, 0.008, 95, 18, 0.012, 2.4, M.road, { cast: false, tile: 3 });
    this.box(0, 0.01, 145, 7.6, 0.012, 10, M.cobble, { cast: false, tile: 3 });
    this.geo(scaleUV(new THREE.CircleGeometry(ARENA.r + 0.5, 48), (2 * ARENA.r + 1) / 3), M.cobble, ARENA.x, 0.012, ARENA.z, 0, -Math.PI / 2, 0, { cast: false });
  }

  buildBoundaries() {
    // corredor da floresta (início)
    this.wallInv(-8.5, -30, -8.5, 4.5);
    this.wallInv(8.5, -30, 8.5, 4.5);
    this.wallInv(-9, -28, 9, -28);
    // vila
    this.wallInv(-40, 4, -40, 72);
    this.wallInv(40, 4, 40, 72);
    this.wallInv(-40, 4.2, -8.5, 4.2);
    this.wallInv(8.5, 4.2, 40, 4.2);
    // cemitério
    this.wallInv(-37, 72, -37, 130);
    this.wallInv(37, 72, 37, 130);
    // margens do rio (fora da ponte)
    this.wallInv(-48, RIVER.z0 - 0.3, -2.7, RIVER.z0 - 0.3);
    this.wallInv(2.7, RIVER.z0 - 0.3, 48, RIVER.z0 - 0.3);
    this.wallInv(-48, RIVER.z1 + 0.3, -2.7, RIVER.z1 + 0.3);
    this.wallInv(2.7, RIVER.z1 + 0.3, 48, RIVER.z1 + 0.3);
  }

  // ------------------------------------------------------------------ peças
  house(o) {
    const M = this.M;
    const { x, z, w, d } = o;
    const h = o.h ?? 3.2,
      rot = o.rot ?? 0;
    const c = Math.cos(rot),
      s = Math.sin(rot);
    const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    const wallMat = o.wall === 'wood' ? M.wood : o.wall === 'stone' ? M.stone : o.wall === 'dark' ? M.plasterDark : M.plaster;
    const cm = o.wall === 'wood' ? 'wood' : 'stone';
    const rh = o.roofH ?? Math.min(2.4, d * 0.42);
    const t = 0.22;
    const doorW = o.doorW ?? 2.0,
      doorH = 2.3,
      doorX = o.doorX ?? 0;
    if (!o.enter) {
      this.box(x, h / 2, z, w, h, d, wallMat, { ry: rot, col: true, cm, tile: 2.6 });
      this.box(x, 0.3, z, w + 0.14, 0.6, d + 0.14, M.stoneDark, { ry: rot, tile: 1.6 });
      // porta fechada
      const [px, pz] = P(doorX, d / 2 + 0.05);
      this.box(px, 1.05, pz, 1.1, 2.1, 0.1, M.woodDark, { ry: rot, tile: 1 });
      const [fx, fz] = P(doorX, d / 2 + 0.07);
      this.box(fx, 2.18, fz, 1.4, 0.16, 0.12, M.beam, { ry: rot });
    } else {
      const seg = (lx, lz, sw, sd, sh = h, sy = sh / 2) => {
        const [px, pz] = P(lx, lz);
        this.box(px, sy, pz, sw, sh, sd, wallMat, { ry: rot, col: true, cm, tile: 2.6 });
      };
      seg(0, -d / 2 + t / 2, w, t);
      seg(-w / 2 + t / 2, 0, t, d - 2 * t);
      seg(w / 2 - t / 2, 0, t, d - 2 * t);
      const lw = w / 2 + doorX - doorW / 2;
      const rw = w / 2 - doorX - doorW / 2;
      if (lw > 0.05) seg(-w / 2 + lw / 2, d / 2 - t / 2, lw, t);
      if (rw > 0.05) seg(w / 2 - rw / 2, d / 2 - t / 2, rw, t);
      const [lx, lz] = P(doorX, d / 2 - t / 2);
      this.box(lx, doorH + (h - doorH) / 2, lz, doorW, h - doorH, t, wallMat, { ry: rot, tile: 2.6 });
      // batentes
      for (const sx of [-1, 1]) {
        const [bx, bz] = P(doorX + sx * (doorW / 2 + 0.06), d / 2 + 0.02);
        this.box(bx, doorH / 2, bz, 0.14, doorH, t + 0.1, M.beam, { ry: rot });
      }
      const [tx, tz] = P(doorX, d / 2 + 0.02);
      this.box(tx, doorH + 0.07, tz, doorW + 0.26, 0.14, t + 0.1, M.beam, { ry: rot });
      // folha da porta aberta para dentro
      const [ox, oz] = P(doorX - doorW / 2 + 0.06, d / 2 - t - 0.5);
      this.box(ox, 1.1, oz, 0.08, 2.15, 1.0, M.woodDark, { ry: rot, tile: 1, col: true, cm: 'wood' });
      // assoalho e forro
      const [cx, cz] = P(0, 0);
      this.box(cx, 0.02, cz, w - 2 * t, 0.04, d - 2 * t, M.floor, { ry: rot, cast: false, tile: 2 });
      this.box(cx, h - 0.06, cz, w - 2 * t, 0.12, d - 2 * t, M.beam, { ry: rot, tile: 2 });
      for (let k = -w / 2 + 1; k < w / 2 - 0.5; k += 1.6) {
        const [bx, bz] = P(k, 0);
        this.box(bx, h - 0.2, bz, 0.16, 0.18, d - 2 * t, M.beam, { ry: rot, cast: false });
      }
      this.indoors.push({ x, z, hw: w / 2, hd: d / 2, c, s });
    }
    // telhado, oitões, vigas
    this.geo(gableRoofGeo(w, d, rh, 0.45, 2.2), o.roofMat || M.roof, x, h, z, rot);
    this.geo(gableEndsGeo(w, d, rh, 2.6), wallMat, x, h, z, rot);
    for (const [sx, sz] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const [bx, bz] = P(sx * (w / 2 + 0.01), sz * (d / 2 + 0.01));
      this.box(bx, h / 2, bz, 0.2, h, 0.2, M.beam, { ry: rot });
    }
    for (const sz of [-1, 1]) {
      const [bx, bz] = P(0, sz * (d / 2 + 0.03));
      this.box(bx, h - 0.09, bz, w + 0.1, 0.18, 0.12, M.beam, { ry: rot });
    }
    // janelas
    for (const win of o.windows || []) {
      let lx = 0,
        lz = 0,
        wr = 0;
      const depth = o.enter ? t + 0.1 : 0.1;
      const off = o.enter ? 0 : 0.03;
      if (win.f === 'front') {
        lx = win.u;
        lz = d / 2 + off - (o.enter ? t / 2 : 0);
      } else if (win.f === 'back') {
        lx = win.u;
        lz = -d / 2 - off + (o.enter ? t / 2 : 0);
      } else if (win.f === 'left') {
        lz = win.u;
        lx = -w / 2 - off + (o.enter ? t / 2 : 0);
        wr = Math.PI / 2;
      } else {
        lz = win.u;
        lx = w / 2 + off - (o.enter ? t / 2 : 0);
        wr = Math.PI / 2;
      }
      const [wx, wz] = P(lx, lz);
      const y = win.y ?? 1.6;
      this.box(wx, y, wz, 1.0, 1.1, depth + 0.04, M.beam, { ry: rot + wr });
      this.box(wx, y, wz, 0.8, 0.9, depth + 0.06, win.lit ? (win.lit === 2 ? M.litDim : M.lit) : M.glass, { ry: rot + wr, cast: false });
      this.box(wx, y, wz, 0.06, 0.92, depth + 0.08, M.beam, { ry: rot + wr });
      this.box(wx, y, wz, 0.82, 0.06, depth + 0.08, M.beam, { ry: rot + wr });
      if (win.lit && !o.enter) {
        const [gx, gz] = P(lx * 1.08, lz * 1.08);
        const g = new THREE.Sprite(this.glowMat);
        g.position.set(gx, y, gz);
        g.scale.setScalar(2.2);
        this.scene.add(g);
      }
    }
    if (o.chimney !== false) {
      const [cx, cz] = P(w / 2 - 1.1, -d * 0.18);
      this.box(cx, h + rh * 0.5 + 0.4, cz, 0.7, rh + 1.4, 0.7, M.stoneDark, { ry: rot, tile: 1.5 });
    }
    return P;
  }

  table(x, z, rot = 0, w = 1.4, d = 0.8) {
    const M = this.M;
    this.box(x, 0.79, z, w, 0.07, d, M.wood, { ry: rot, tile: 1, col: true, cm: 'wood', y0: 0, y1: 0.83 });
    const c = Math.cos(rot),
      s = Math.sin(rot);
    for (const [a, b] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const lx = a * (w / 2 - 0.08),
        lz = b * (d / 2 - 0.08);
      this.box(x + lx * c + lz * s, 0.38, z - lx * s + lz * c, 0.08, 0.76, 0.08, M.beam, { ry: rot });
    }
  }

  chair(x, z, rot = 0, fallen = false) {
    const M = this.M;
    if (fallen) {
      this.box(x, 0.24, z, 0.45, 0.06, 0.45, M.woodDark, { ry: rot, rx: Math.PI / 2 - 0.2, tile: 1 });
      return;
    }
    this.box(x, 0.45, z, 0.45, 0.06, 0.45, M.woodDark, { ry: rot, tile: 1 });
    const c = Math.cos(rot),
      s = Math.sin(rot);
    const bx = x + -0.2 * s,
      bz = z - 0.2 * c;
    this.box(bx, 0.72, bz, 0.45, 0.5, 0.05, M.woodDark, { ry: rot, tile: 1 });
    for (const [a, b] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const lx = a * 0.18,
        lz = b * 0.18;
      this.box(x + lx * c + lz * s, 0.22, z - lx * s + lz * c, 0.05, 0.44, 0.05, M.beam, { ry: rot });
    }
  }

  shelf(x, z, rot = 0, books = true) {
    const M = this.M;
    this.box(x, 0.95, z, 1.3, 1.9, 0.38, M.woodDark, { ry: rot, tile: 1, col: true, cm: 'wood' });
    if (books) {
      const c = Math.cos(rot),
        s = Math.sin(rot);
      for (let r = 0; r < 3; r++) {
        for (let k = 0; k < 5; k++) {
          if (this.rng.chance(0.3)) continue;
          const lx = -0.5 + k * 0.24,
            lz = 0.12;
          this.box(x + lx * c + lz * s, 0.5 + r * 0.55, z - lx * s + lz * c, 0.18, 0.3, 0.16, M.book, { ry: rot + this.rng.range(-0.1, 0.1), cast: false });
        }
      }
    }
  }

  candle(x, y, z, withLight = true) {
    this.cyl(x, y + 0.08, z, 0.025, 0.028, 0.16, this.M.paper, { seg: 6, cast: false });
    this.flame(x, y + 0.2, z, 0.12, true);
    if (withLight) this.light(x, y + 0.3, z, 0xffb060, 3.5, 7, 0.18);
  }

  lamp(x, z, side = 1) {
    const M = this.M;
    this.box(x, 1.6, z, 0.16, 3.2, 0.16, M.beam, { col: true, cw: 0.25, cd: 0.25, cm: 'wood' });
    this.box(x + side * 0.35, 3.1, z, 0.8, 0.08, 0.08, M.beam);
    const lx = x + side * 0.68;
    this.box(lx, 2.92, z, 0.24, 0.05, 0.24, M.iron, { cast: false });
    this.box(lx, 2.62, z, 0.2, 0.05, 0.2, M.iron, { cast: false });
    for (const [a, b] of [
      [-1, -1],
      [1, -1],
      [-1, 1],
      [1, 1],
    ])
      this.box(lx + a * 0.1, 2.77, z + b * 0.1, 0.02, 0.3, 0.02, M.iron, { cast: false });
    this.flame(lx, 2.76, z, 0.18);
    this.light(lx, 2.6, z, 0xffb060, 9, 13, 0.12);
  }

  brazier(x, z) {
    const M = this.M;
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      this.box(x + Math.cos(a) * 0.3, 0.45, z + Math.sin(a) * 0.3, 0.06, 0.95, 0.06, M.iron, { rz: Math.cos(a) * 0.2, rx: -Math.sin(a) * 0.2 });
    }
    this.cyl(x, 0.98, z, 0.5, 0.32, 0.32, M.iron, { seg: 12, col: true, cr: 0.5, y0: 0, y1: 1.15, cm: 'metal' });
    this.geo(new THREE.CircleGeometry(0.44, 12), M.ember, x, 1.13, z, 0, -Math.PI / 2, 0, { cast: false });
    this.fires.push({ x, y: 1.15, z, size: 1.1, rate: 22, acc: 0 });
    this.light(x, 1.9, z, 0xff7a30, 22, 15, 0.3, 2);
  }

  barrelDecor(x, z, r = 0.32) {
    this.cyl(x, 0.45, z, r, r, 0.9, this.M.woodDark, { seg: 10, col: true, cm: 'wood', tile: 1 });
    for (const y of [0.15, 0.75]) this.cyl(x, y, z, r + 0.01, r + 0.01, 0.05, this.M.iron, { seg: 10, cast: false });
  }

  hay(x, z, rot = 0) {
    this.cyl(x, 0.6, z, 0.6, 0.6, 1.2, this.M.hay, { seg: 12, rz: Math.PI / 2, ry: rot, tile: 1 });
    this.col.addBox(x, z, 1.2, 1.2, rot, { y0: 0, y1: 1.2, mat: 'wood' });
  }

  cart(x, z, rot = 0) {
    const M = this.M;
    const c = Math.cos(rot),
      s = Math.sin(rot);
    const P = (lx, lz) => [x + lx * c + lz * s, z - lx * s + lz * c];
    this.box(x, 0.78, z, 1.6, 0.1, 2.6, M.wood, { ry: rot, tile: 1 });
    for (const sx of [-1, 1]) {
      const [a, b] = P(sx * 0.78, 0);
      this.box(a, 1.0, b, 0.06, 0.4, 2.6, M.wood, { ry: rot, tile: 1 });
      const [wx, wz] = P(sx * 0.9, 0.3);
      this.cyl(wx, 0.55, wz, 0.55, 0.55, 0.1, M.woodDark, { seg: 12, rz: Math.PI / 2, ry: rot, tile: 1 });
      const [hx, hz] = P(sx * 0.45, 2.1);
      this.box(hx, 0.45, hz, 0.08, 0.08, 1.9, M.beam, { ry: rot, rx: 0.32 });
    }
    const [bx, bz] = P(0, -1.32);
    this.box(bx, 1.0, bz, 1.6, 0.4, 0.06, M.wood, { ry: rot, tile: 1 });
    this.col.addBox(x, z, 1.9, 2.7, rot, { y0: 0, y1: 1.2, mat: 'wood' });
  }

  fence(x0, z0, x1, z1, mat = this.M.woodDark) {
    const dx = x1 - x0,
      dz = z1 - z0,
      L = Math.hypot(dx, dz);
    const rot = Math.atan2(dx, dz);
    const n = Math.max(1, Math.round(L / 2));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      this.box(x0 + dx * t, 0.6, z0 + dz * t, 0.12, 1.2, 0.12, this.M.beam);
    }
    for (const y of [0.45, 0.95]) this.box((x0 + x1) / 2, y, (z0 + z1) / 2, 0.06, 0.12, L, mat, { ry: rot, tile: 2 });
    this.col.addBox((x0 + x1) / 2, (z0 + z1) / 2, 0.15, L, rot, { y0: 0, y1: 1.2, mat: 'wood', shootThrough: true });
  }

  ironFence(x0, z0, x1, z1) {
    const M = this.M;
    const dx = x1 - x0,
      dz = z1 - z0,
      L = Math.hypot(dx, dz);
    const rot = Math.atan2(dx, dz);
    const posts = Math.max(1, Math.round(L / 2.6));
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      this.box(x0 + dx * t, 0.75, z0 + dz * t, 0.38, 1.5, 0.38, M.stoneDark, { tile: 1 });
    }
    const bars = Math.round(L / 0.2);
    for (let i = 0; i < bars; i++) {
      const t = (i + 0.5) / bars;
      this.cyl(x0 + dx * t, 0.7, z0 + dz * t, 0.016, 0.016, 1.4, M.iron, { seg: 4, cast: true, open: true });
    }
    for (const y of [0.2, 1.25]) this.box((x0 + x1) / 2, y, (z0 + z1) / 2, 0.05, 0.05, L, M.iron, { ry: rot });
    this.col.addBox((x0 + x1) / 2, (z0 + z1) / 2, 0.3, L, rot, { y0: 0, y1: 1.5, mat: 'metal', shootThrough: true });
  }

  stoneWall(x0, z0, x1, z1, h = 3, th = 0.8) {
    const dx = x1 - x0,
      dz = z1 - z0,
      L = Math.hypot(dx, dz);
    const rot = Math.atan2(dx, dz);
    this.box((x0 + x1) / 2, h / 2, (z0 + z1) / 2, th, h, L, this.M.stone, { ry: rot, col: true, tile: 2.5 });
    this.box((x0 + x1) / 2, h + 0.08, (z0 + z1) / 2, th + 0.15, 0.16, L, this.M.stoneDark, { ry: rot });
  }

  deadTree(x, z, s = 1, collide = false) {
    const M = this.M,
      r = this.rng;
    const h = 6.5 * s;
    const lean = r.range(-0.08, 0.08),
      ry = r.range(0, Math.PI * 2);
    this.cyl(x, h / 2, z, 0.1 * s, 0.3 * s, h, M.bark, { seg: 7, rz: lean, ry, tile: 2 });
    const nb = r.int(4, 7);
    for (let i = 0; i < nb; i++) {
      const by = h * r.range(0.35, 0.92);
      const a = r.range(0, Math.PI * 2);
      const tilt = r.range(0.5, 1.15);
      const len = r.range(1.4, 3.2) * s * (1.1 - by / h * 0.5);
      const bx = x + Math.cos(a) * Math.sin(tilt) * len * 0.5;
      const bz = z + Math.sin(a) * Math.sin(tilt) * len * 0.5;
      const yy = by + Math.cos(tilt) * len * 0.5;
      const g = cylGeo(0.02 * s, 0.07 * s, len, 5, 2, true);
      // orienta o galho na direção (a, tilt): inclina em Z e depois gira em Y
      const m = new THREE.Matrix4().makeRotationY(-a).multiply(new THREE.Matrix4().makeRotationZ(-tilt));
      m.setPosition(bx, yy, bz);
      this.B.add(g, M.bark, m, { cast: true, receive: false, chunk: this.chunk(z) });
      if (r.chance(0.7)) {
        const l2 = len * 0.5,
          a2 = a + r.range(-0.8, 0.8),
          t2 = tilt * 0.6;
        const ex = bx + Math.cos(a) * Math.sin(tilt) * len * 0.45,
          ez = bz + Math.sin(a) * Math.sin(tilt) * len * 0.45,
          ey = yy + Math.cos(tilt) * len * 0.45;
        const m2 = new THREE.Matrix4().makeRotationY(-a2).multiply(new THREE.Matrix4().makeRotationZ(-t2));
        m2.setPosition(ex + Math.cos(a2) * Math.sin(t2) * l2 * 0.5, ey + Math.cos(t2) * l2 * 0.5, ez + Math.sin(a2) * Math.sin(t2) * l2 * 0.5);
        this.B.add(cylGeo(0.01 * s, 0.03 * s, l2, 4, 2, true), M.bark, m2, { cast: true, receive: false, chunk: this.chunk(z) });
      }
    }
    if (collide) this.col.addCircle(x, z, 0.32 * s, { y0: 0, y1: h, mat: 'wood' });
  }

  pine(x, z, s = 1, collide = false) {
    const M = this.M;
    this.cyl(x, 1.2 * s, z, 0.12 * s, 0.22 * s, 2.4 * s, M.bark, { seg: 6 });
    for (let i = 0; i < 4; i++) {
      const rr = (2.1 - i * 0.42) * s,
        hh = 2.6 * s;
      this.geo(new THREE.ConeGeometry(rr, hh, 7), M.pine, x, (2.2 + i * 1.5) * s, z, this.rng.range(0, 3));
    }
    if (collide) this.col.addCircle(x, z, 0.3 * s, { y0: 0, y1: 8, mat: 'wood' });
  }

  rock(x, z, s = 1) {
    const g = new THREE.DodecahedronGeometry(1, 0);
    this.geo(g, this.M.rock, x, 0.3 * s, z, this.rng.range(0, 3), this.rng.range(0, 1), 0, { sx: s * this.rng.range(0.9, 1.5), sy: s * 0.7, sz: s });
  }

  // ------------------------------------------------------------------ ZONA 1: a vila
  buildZone1() {
    const M = this.M;
    // placa de entrada e quadro de avisos
    this.box(3.4, 1.0, -8, 0.14, 2.0, 0.14, M.beam);
    this.box(6.4, 1.0, -8, 0.14, 2.0, 0.14, M.beam);
    this.geo(new THREE.PlaneGeometry(3.4, 0.85), M.sign, 4.9, 1.6, -8.09, Math.PI);
    this.box(4.9, 1.6, -8.02, 3.4, 0.85, 0.06, M.beam);
    this.col.addBox(4.9, -8, 3.4, 0.3, 0, { y0: 0, y1: 2, mat: 'wood' });
    this.box(-4.2, 1.1, -6, 0.12, 2.2, 0.12, M.beam, { col: true, cm: 'wood' });
    this.box(-4.2, 1.5, -6.05, 1.1, 0.8, 0.06, M.woodDark, { tile: 1 });
    this.anchors.noteEntrance = { x: -4.2, y: 1.5, z: -6.1, wall: true, ry: Math.PI };

    // casas
    this.house({ x: -13, z: 12, w: 7, d: 6, rot: Math.PI / 2, windows: [{ f: 'front', u: -2, lit: 1 }, { f: 'left', u: 0 }] });
    const P2 = this.house({
      x: 14,
      z: 16,
      w: 8,
      d: 7,
      rot: -Math.PI / 2,
      enter: true,
      doorX: -1.2,
      windows: [{ f: 'front', u: 2.2 }, { f: 'back', u: -1.5 }, { f: 'left', u: 0.5 }],
    });
    // interior da casa da escopeta
    {
      const r = -Math.PI / 2;
      let [a, b] = P2(1.6, -2.3);
      this.table(a, b, r);
      this.anchors.shotgun = { x: a, y: 0.84, z: b };
      [a, b] = P2(0.5, -2.3);
      this.anchors.shells1 = { x: a, y: 0.84, z: b };
      [a, b] = P2(1.6, -1.2);
      this.chair(a, b, r + Math.PI);
      [a, b] = P2(-2.6, -1.8);
      this.box(a, 0.25, b, 1.0, 0.5, 2.0, M.woodDark, { ry: r, col: true, cm: 'wood', tile: 1 });
      this.box(a, 0.55, b, 0.9, 0.12, 1.9, M.cloth, { ry: r, cast: false, tile: 1 });
      [a, b] = P2(-2.6, 2.6);
      this.shelf(a, b, r + Math.PI, false);
      [a, b] = P2(3.3, 1.8);
      this.chair(a, b, r, true);
      [a, b] = P2(2.2, -2.3);
      this.candle(a, 0.83, b);
      [a, b] = P2(1.0, -2.0);
      this.anchors.noteDiary = { x: a, y: 0.84, z: b };
    }
    this.house({ x: -24, z: 30, w: 8, d: 7, rot: Math.PI / 2, wall: 'wood', roofMat: M.roofWood, windows: [{ f: 'front', u: 2 }, { f: 'front', u: -2, lit: 2 }] });
    this.house({ x: 25, z: 37, w: 10, d: 9, h: 4.2, rot: -Math.PI / 2, wall: 'wood', roofMat: M.roofWood, roofH: 3.2, chimney: false, windows: [{ f: 'left', u: 0, y: 2.6 }] });
    const P5 = this.house({
      x: -20,
      z: 54,
      w: 11,
      d: 8,
      h: 3.6,
      rot: Math.PI / 2,
      enter: true,
      doorX: 0,
      wall: 'dark',
      windows: [
        { f: 'front', u: -3.2 },
        { f: 'front', u: 3.2 },
        { f: 'back', u: 0 },
      ],
    });
    // interior da casa do prefeito
    {
      const r = Math.PI / 2;
      let [a, b] = P5(-3.2, -2.4);
      this.table(a, b, r, 1.8, 0.9);
      this.anchors.key = { x: a, y: 0.86, z: b };
      [a, b] = P5(-2.4, -2.4);
      this.anchors.noteMayor = { x: a, y: 0.84, z: b };
      [a, b] = P5(-3.2, -3.2);
      this.chair(a, b, r);
      [a, b] = P5(-4.2, -2.6);
      this.candle(a, 0.83, b);
      for (const k of [-1.4, 0.2, 1.8]) {
        [a, b] = P5(k, -3.55);
        this.shelf(a, b, r);
      }
      [a, b] = P5(4.9, -1.5);
      this.box(a, 1.0, b, 0.8, 2.0, 1.8, M.stone, { ry: r, col: true, tile: 1.2 });
      [a, b] = P5(4.55, -1.5);
      this.box(a, 0.55, b, 0.1, 0.8, 1.0, M.dark, { ry: r, cast: false });
      this.fires.push({ x: a - 0.05, y: 0.25, z: b, size: 0.6, rate: 10, acc: 0 });
      this.light(a, 0.8, b, 0xff7a30, 6, 9, 0.3);
      [a, b] = P5(0.5, 0.5);
      this.box(a, 0.012, b, 3.6, 0.01, 2.4, M.rug, { ry: r, cast: false, tile: 1 });
      [a, b] = P5(2.5, 2.2);
      this.chair(a, b, r + 2, true);
      [a, b] = P5(1.5, -1);
      this.anchors.tonicMayor = { x: a, y: 0.02, z: b };
    }
    this.house({ x: 16, z: 57, w: 8, d: 7, rot: -Math.PI / 2, windows: [{ f: 'front', u: 2, lit: 1 }, { f: 'right', u: 0 }] });
    this.house({ x: -31, z: 14, w: 4.4, d: 4, h: 2.6, rot: Math.PI / 2 - 0.3, wall: 'wood', roofMat: M.roofWood, chimney: false });
    this.house({ x: 29, z: 63, w: 7, d: 6, rot: -2.39, windows: [{ f: 'front', u: 1.8, lit: 2 }] });
    this.house({ x: 31, z: 20, w: 6, d: 5, rot: -1.2, wall: 'wood', roofMat: M.roofWood, windows: [{ f: 'front', u: -1.5 }] });
    this.house({ x: -30, z: 66, w: 7, d: 6, rot: 2.24, wall: 'dark', windows: [{ f: 'front', u: 0, lit: 1 }] });
    // ruína
    this.box(-33, 1.4, 40, 0.5, 2.8, 6, M.stone, { col: true });
    this.box(-30.5, 0.9, 37.2, 5, 1.8, 0.5, M.stone, { col: true });
    this.box(-28.4, 2.0, 40.5, 0.5, 4.0, 2.5, M.stone, { col: true });
    this.rock(-31, 42, 0.5);
    this.rock(-29.5, 38.5, 0.4);

    // praça: poço, braseiros, carroças
    this.cyl(0, 0.45, 32, 1.1, 1.15, 0.9, M.stone, { seg: 16, open: true, tile: 1.5, col: true, cr: 1.25, y0: 0, y1: 0.9 });
    this.cyl(0, 0.45, 32, 0.92, 0.92, 0.9, M.stoneDark, { seg: 16, open: true, tile: 1.5 });
    this.geo(new THREE.RingGeometry(0.92, 1.1, 16), M.stone, 0, 0.9, 32, 0, -Math.PI / 2);
    this.geo(new THREE.CircleGeometry(0.92, 16), M.dark, 0, 0.3, 32, 0, -Math.PI / 2, 0, { cast: false });
    for (const sx of [-1, 1]) this.box(sx * 1.0, 1.55, 32, 0.15, 2.2, 0.15, M.beam);
    this.geo(gableRoofGeo(2.4, 1.4, 0.6, 0.2, 1.2), M.roofWood, 0, 2.6, 32, Math.PI / 2);
    this.cyl(0, 2.15, 32, 0.07, 0.07, 2.0, M.beam, { rz: Math.PI / 2, seg: 8 });
    this.cyl(0.3, 1.5, 32, 0.15, 0.12, 0.25, M.woodDark, { seg: 8 });
    this.brazier(6, 38);
    this.brazier(-6, 26);
    this.cart(-7.5, 41, 0.4);
    this.anchors.grenadeCart = { x: -7.6, y: 0.86, z: 41.2 };
    this.cart(17.5, 27, -1.1);
    for (const [x, z, r] of [
      [21, 30.5, 0.2],
      [22.6, 32.2, 1.2],
      [20, 44, 0.5],
      [-15, 21.5, 1.4],
      [-14.2, 23.2, 1.0],
    ])
      this.hay(x, z, r);
    // lenha e toco
    this.cyl(-18.4, 0.35, 23.6, 0.35, 0.4, 0.7, M.woodDark, { seg: 9, col: true, cm: 'wood', tile: 1 });
    for (let i = 0; i < 9; i++) {
      const row = i < 4 ? 0 : i < 7 ? 1 : 2;
      const k = i < 4 ? i : i < 7 ? i - 4 : i - 7;
      this.cyl(-21.5 + k * 0.42 + row * 0.21, 0.2 + row * 0.36, 22.6, 0.19, 0.19, 1.6, M.woodDark, { seg: 7, rx: Math.PI / 2, tile: 1 });
    }
    this.col.addBox(-21, 22.6, 2, 1.7, 0, { y0: 0, y1: 1, mat: 'wood' });
    for (const [x, z] of [
      [-9.8, 14.4],
      [-9.6, 15.2],
      [10.6, 13.2],
      [26.5, 46],
      [-15.2, 50.1],
      [13, 52.4],
      [-4.5, 45],
    ])
      this.barrelDecor(x, z);
    // cercas
    this.fence(-30, 6, -30, 26);
    this.fence(-30, 26, -27, 26);
    this.fence(6, 7, 20, 7);
    this.fence(34, 26, 34, 50);
    this.fence(8, 62, 22, 66);
    this.fence(-14, 64, -6, 68);
    this.fence(-36, 30, -36, 50);
    // varal
    this.box(-8.5, 1.3, 20, 0.1, 2.6, 0.1, M.beam);
    this.box(-8.5, 1.3, 26, 0.1, 2.6, 0.1, M.beam);
    this.box(-8.5, 2.45, 23, 0.02, 0.02, 6, M.beam, { cast: false });
    for (const [z, m] of [
      [21.3, M.cloth],
      [22.6, M.cloth2],
      [24.2, M.cloth],
    ])
      this.geo(new THREE.PlaneGeometry(0.9, 1.1), m, -8.5, 1.85, z, Math.PI / 2, 0, 0.04);
    // postes
    this.lamp(3.4, -14, -1);
    this.lamp(-3.4, -1, 1);
    this.lamp(3.4, 11, -1);
    this.lamp(-9.5, 21, 1);
    this.lamp(10, 23, -1);
    this.lamp(10.5, 44, -1);
    this.lamp(-3.4, 58, 1);
    this.lamp(3.6, 69, -1);
    // algumas árvores mortas dentro da vila
    for (const [x, z, s] of [
      [-6, 8, 0.8],
      [7.5, 4.8, 0.9],
      [-25, 10, 1],
      [34, 12, 1.1],
      [12, 34, 0.75],
      [-12, 44, 0.85],
      [36, 56, 1],
      [-36, 24, 0.9],
      [26, 68, 0.9],
    ])
      this.deadTree(x, z, s, true);

    // muro norte com o portão do cemitério
    this.stoneWall(-40, 72, -3.6, 72, 3.2);
    this.stoneWall(3.6, 72, 40, 72, 3.2);
    for (const sx of [-1, 1]) {
      this.box(sx * 3.4, 2.1, 72, 1.0, 4.2, 1.0, M.stone, { col: true, tile: 1.5 });
      this.box(sx * 3.4, 4.3, 72, 1.2, 0.2, 1.2, M.stoneDark);
      this.cyl(sx * 3.4, 4.6, 72, 0.25, 0.3, 0.4, M.stoneDark, { seg: 8 });
    }
    this.anchors.gate = { x: 0, z: 72 };
  }

  // ------------------------------------------------------------------ ZONA 2: cemitério e rio
  buildZone2() {
    const M = this.M,
      r = this.rng;
    // muro do cemitério
    this.ironFence(-36, 73, -36, 128);
    this.ironFence(36, 73, 36, 128);
    // lápides
    const tomb = (x, z) => {
      const kind = r.int(0, 5);
      const ry = r.range(-0.12, 0.12) + (x < 0 ? Math.PI / 2 : -Math.PI / 2) * 0;
      const tilt = r.chance(0.3) ? r.range(-0.25, 0.25) : 0;
      if (kind === 0 || kind === 1) {
        const h = r.range(0.8, 1.15);
        this.box(x, h / 2, z, 0.62, h, 0.18, M.tomb, { ry, rx: tilt, tile: 1, col: true, cw: 0.7, cd: 0.3 });
        if (kind === 1) this.cyl(x, h, z, 0.31, 0.31, 0.18, M.tomb, { rx: Math.PI / 2, ry, seg: 10, tile: 1 });
      } else if (kind === 2) {
        this.box(x, 0.75, z, 0.14, 1.5, 0.14, M.tomb, { ry, tile: 1, col: true, cw: 0.3, cd: 0.3 });
        this.box(x, 1.1, z, 0.65, 0.14, 0.14, M.tomb, { ry, tile: 1 });
      } else if (kind === 3) {
        this.box(x, 0.3, z, 0.6, 0.6, 0.16, M.tomb, { ry, rz: r.range(-0.3, 0.3), tile: 1, col: true, cw: 0.7, cd: 0.3 });
      } else if (kind === 4) {
        this.box(x, 0.2, z, 0.9, 0.4, 0.9, M.stoneDark, { ry, tile: 1, col: true });
        this.box(x, 1.2, z, 0.3, 1.8, 0.3, M.tomb, { ry, tile: 1 });
        this.geo(new THREE.ConeGeometry(0.24, 0.4, 4), M.tomb, x, 2.3, z, ry + Math.PI / 4);
      } else {
        this.box(x, 0.12, z + 0.9, 0.9, 0.24, 1.9, M.stoneDark, { ry, tile: 1 });
        this.box(x, 0.5, z, 0.6, 1.0, 0.16, M.tomb, { ry, tile: 1, col: true, cw: 0.7, cd: 0.3 });
      }
    };
    for (let z = 79; z <= 124; z += 3.8) {
      for (let x = -31; x <= -5; x += 3.4) {
        if (x < -15 && z > 92 && z < 117) continue;
        if (x > -16 && z > 101 && z < 107) continue;
        if (r.chance(0.15)) continue;
        tomb(x + r.range(-0.4, 0.4), z + r.range(-0.4, 0.4));
      }
      for (let x = 6; x <= 31; x += 3.4) {
        if (x > 15 && z > 86 && z < 104) continue;
        if (x < 17 && z > 92 && z < 98) continue;
        if (r.chance(0.15)) continue;
        tomb(x + r.range(-0.4, 0.4), z + r.range(-0.4, 0.4));
      }
    }
    // capela em ruínas (oeste)
    const cx = -24,
      cz = 104;
    const jag = (x0, z0, x1, z1, hs) => {
      const n = hs.length;
      for (let i = 0; i < n; i++) {
        const t0 = i / n,
          t1 = (i + 1) / n;
        const ax = lerp(x0, x1, t0),
          az = lerp(z0, z1, t0),
          bx = lerp(x0, x1, t1),
          bz = lerp(z0, z1, t1);
        const L = Math.hypot(bx - ax, bz - az),
          rot = Math.atan2(bx - ax, bz - az);
        this.box((ax + bx) / 2, hs[i] / 2, (az + bz) / 2, 0.5, hs[i], L, M.stone, { ry: rot, col: true, tile: 2.5 });
      }
    };
    jag(cx - 5, cz - 7, cx - 5, cz + 7, [4.5, 5.2, 4.8, 3.6]);
    jag(cx - 5, cz - 7, cx + 5, cz - 7, [4.2, 3.0, 2.2]);
    jag(cx - 5, cz + 7, cx + 5, cz + 7, [4.4, 3.4, 4.6]);
    jag(cx + 5, cz - 7, cx + 5, cz - 1.5, [3.8, 2.6]);
    jag(cx + 5, cz + 1.5, cx + 5, cz + 7, [2.8, 4.0]);
    this.box(cx + 5, 4.6, cz, 0.6, 0.6, 3.6, M.stone, { tile: 2 });
    this.box(cx - 3.6, 0.5, cz, 1.0, 1.0, 2.4, M.stoneDark, { col: true, tile: 1 });
    this.anchors.noteSmith = { x: cx - 3.6, y: 1.01, z: cz + 0.6 };
    for (const dz of [-0.9, 0.9]) this.candle(cx - 3.6, 1.0, cz + dz, dz < 0);
    for (let k = 0; k < 4; k++) {
      for (const s of [-1, 1]) {
        if (r.chance(0.25)) continue;
        this.box(cx + 0.5 + k * 1.3 - 1.6, 0.25, cz + s * 2.4, 0.4, 0.5, 2.6, M.woodDark, { col: true, cm: 'wood', rz: r.chance(0.3) ? 0.3 : 0, tile: 1 });
      }
    }
    for (let i = 0; i < 5; i++) this.rock(cx + r.range(-4, 4), cz + r.range(-6, 6), r.range(0.2, 0.4));
    this.anchors.winch1 = { x: cx - 2.8, z: cz - 4.6, ry: Math.PI / 2 };

    // mausoléu (leste)
    const mx = 24,
      mz = 95;
    this.box(mx + 0.5, 2.3, mz, 7, 4.6, 7, M.stone, { col: true, tile: 2.5 });
    this.box(mx + 0.5, 0.25, mz, 7.6, 0.5, 7.6, M.stoneDark, { tile: 2 });
    this.geo(gableRoofGeo(7.4, 7.4, 1.6, 0.3, 2), M.stoneDark, mx + 0.5, 4.6, mz, -Math.PI / 2);
    this.geo(gableEndsGeo(7.4, 7.4, 1.6, 2.5), M.stone, mx + 0.5, 4.6, mz, -Math.PI / 2);
    for (const dz of [-2.2, 2.2]) this.cyl(mx - 3.6, 2.3, mz + dz, 0.32, 0.36, 4.6, M.tomb, { seg: 10, col: true, tile: 1.5 });
    this.box(mx - 3.6, 4.75, mz, 1.2, 0.3, 5.6, M.stoneDark, { tile: 2 });
    this.box(mx - 3.04, 1.3, mz, 0.1, 2.6, 1.8, M.iron, { tile: 1 });
    this.anchors.winch2 = { x: mx - 6.2, z: mz - 3.2, ry: -Math.PI / 2 };
    for (const dz of [-1.5, 1.5]) {
      this.box(mx - 3.05, 2.4, mz + dz, 0.1, 0.25, 0.1, M.iron);
      this.flame(mx - 3.15, 2.62, mz + dz, 0.22);
    }
    this.light(mx - 3.5, 2.6, mz, 0xff9040, 9, 12, 0.2);

    // lanternas no caminho
    this.lamp(2.2, 81, -1);
    this.lamp(-2.2, 93, 1);
    this.lamp(2.2, 106, -1);
    this.lamp(-2.2, 117, 1);
    // árvores mortas e corvos de pedra
    for (const [x, z, s] of [
      [-12, 78, 1],
      [14, 79, 0.9],
      [-30, 92, 1.1],
      [31, 108, 1],
      [-8, 110, 0.8],
      [10, 116, 1.1],
      [-32, 124, 1],
      [28, 124, 0.9],
      [-17, 96, 0.7],
      [19, 103, 0.8],
    ])
      this.deadTree(x, z, s, true);
    // velas em túmulos
    for (const [x, z] of [
      [-8.4, 87.6],
      [9.4, 91],
      [-14.8, 120],
      [13, 110.2],
    ])
      this.candle(x, 0.02, z, false);

    // ponte: postes com correntes nas duas margens
    for (const sx of [-1, 1]) {
      this.box(sx * 3.1, 1.6, RIVER.z0 - 1.0, 0.5, 3.2, 0.5, M.stone, { col: true, tile: 1.5 });
      this.box(sx * 3.1, 1.6, RIVER.z1 + 0.8, 0.5, 3.2, 0.5, M.stone, { col: true, tile: 1.5 });
    }
    this.lamp(4.2, RIVER.z0 - 2.5, -1);
    this.anchors.noteReport = { x: 5.4, y: 0.84, z: RIVER.z0 - 4.6 };
    this.box(5.4, 0.42, RIVER.z0 - 4.6, 0.8, 0.84, 0.6, M.woodDark, { col: true, cm: 'wood', tile: 1 });
  }

  // ------------------------------------------------------------------ ZONA 3: a forja
  buildZone3() {
    const M = this.M,
      r = this.rng;
    // corredor de entrada
    for (const sx of [-1, 1]) this.box(sx * 4.3, 2.2, 145, 1.0, 4.4, 10, M.stone, { col: true, tile: 2.5 });
    this.box(0, 5.0, 149.5, 9.8, 1.2, 1.4, M.stone, { tile: 2 });
    for (const sx of [-1, 1]) this.box(sx * 4.4, 2.5, 149.5, 1.4, 5.0, 1.4, M.stone, { col: true, tile: 2 });
    this.light(0, 3.5, 146, 0xff9a50, 8, 12, 0.2);
    this.flame(-3.6, 3.0, 146, 0.22);
    this.flame(3.6, 3.0, 146, 0.22);

    // muralha circular da arena (com abertura ao sul)
    const segs = 26;
    for (let i = 0; i < segs; i++) {
      const a0 = (i / segs) * Math.PI * 2,
        a1 = ((i + 1) / segs) * Math.PI * 2;
      const am = (a0 + a1) / 2;
      // abertura em -Z (ângulo 270°)
      const deg = (am * 180) / Math.PI;
      if (deg > 255 && deg < 285) continue;
      const R = ARENA.r + 0.8;
      const x0 = ARENA.x + Math.cos(a0) * R,
        z0 = ARENA.z + Math.sin(a0) * R;
      const x1 = ARENA.x + Math.cos(a1) * R,
        z1 = ARENA.z + Math.sin(a1) * R;
      const L = Math.hypot(x1 - x0, z1 - z0) + 0.3,
        rot = Math.atan2(x1 - x0, z1 - z0);
      const h = 5 + (i % 3) * 0.4;
      this.box((x0 + x1) / 2, h / 2, (z0 + z1) / 2, 1.2, h, L, M.stone, { ry: rot, col: true, tile: 2.5 });
    }
    // fecha o vão entre a muralha e a guarita
    for (const sx of [-1, 1]) this.box(sx * 5.95, 2.5, 150.4, 1.9, 5.0, 1.3, M.stone, { col: true, tile: 2 });
    // portas laterais escuras (de onde vêm os reforços)
    for (const sx of [-1, 1]) {
      const x = ARENA.x + sx * (ARENA.r + 0.25);
      this.box(x, 1.4, ARENA.z, 0.2, 2.8, 2.2, M.dark, { cast: false });
      this.box(x, 2.95, ARENA.z, 0.4, 0.3, 2.8, M.beam);
    }
    // fornalhas ao norte
    for (const deg of [62, 90, 118]) {
      const a = (deg * Math.PI) / 180;
      const R = ARENA.r - 1.4;
      const x = ARENA.x + Math.cos(a) * R,
        z = ARENA.z + Math.sin(a) * R;
      const rot = Math.atan2(-Math.cos(a), -Math.sin(a));
      const big = deg === 90;
      const w = big ? 4.6 : 3.4,
        h = big ? 4.2 : 3.4;
      this.box(x, h / 2, z, w, h, 2.6, M.stone, { ry: rot, col: true, tile: 2 });
      const fx = x - Math.cos(a) * 1.32,
        fz = z - Math.sin(a) * 1.32;
      this.box(fx, 1.2, fz, w * 0.5, 1.4, 0.06, M.molten, { ry: rot, cast: false });
      this.box(x, h + 2.5, z, 1.4, 5, 1.4, M.stoneDark, { ry: rot, tile: 2 });
      this.fires.push({ x: fx, y: 0.7, z: fz, size: big ? 1.4 : 1.0, rate: big ? 26 : 16, acc: 0, embers: true });
      this.light(fx - Math.cos(a) * 0.6, 1.6, fz - Math.sin(a) * 0.6, 0xff6a20, big ? 70 : 42, 20, 0.22, 12);
    }
    this.cyl(ARENA.x, 9, ARENA.z + ARENA.r + 3.5, 2.2, 2.8, 18, M.stoneDark, { seg: 12, tile: 3 });
    // pilares de cobertura
    for (const deg of [30, 150, 210, 330]) {
      const a = (deg * Math.PI) / 180;
      const x = ARENA.x + Math.cos(a) * 9.5,
        z = ARENA.z + Math.sin(a) * 9.5;
      this.cyl(x, 3, z, 0.85, 0.95, 6, M.stone, { seg: 12, col: true, tile: 2 });
      this.box(x, 6.1, z, 2.1, 0.3, 2.1, M.stoneDark);
      for (let k = 0; k < 6; k++) this.geo(new THREE.TorusGeometry(0.08, 0.02, 4, 8), M.iron, x + 0.9, 5.7 - k * 0.14, z, k % 2 ? 0 : Math.PI / 2);
    }
    // bigornas e carvão
    const anvil = (x, z, rot) => {
      this.box(x, 0.35, z, 0.5, 0.7, 0.6, M.iron, { ry: rot });
      this.box(x, 0.8, z, 1.2, 0.22, 0.5, M.iron, { ry: rot });
      this.col.addBox(x, z, 1.2, 0.6, rot, { y0: 0, y1: 0.95, mat: 'metal' });
    };
    anvil(-5.5, 166, 0.3);
    anvil(6, 164, -0.4);
    anvil(0, ARENA.z + 11.2, 0);
    this.anchors.bossAnvil = { x: 0, z: ARENA.z + 11.2 };
    for (let i = 0; i < 14; i++) {
      const a = r.range(0.3, Math.PI - 0.3),
        R = r.range(14, 16.5);
      this.geo(new THREE.DodecahedronGeometry(r.range(0.3, 0.7), 0), M.coal, ARENA.x + Math.cos(a) * R, 0.15, ARENA.z + Math.sin(a) * R, r.range(0, 3), 0, 0, { sy: 0.5 });
    }
    // canal de metal derretido (decorativo)
    this.box(0, 0.03, ARENA.z + 14.5, 11, 0.04, 0.5, M.molten, { cast: false });
    // tochas de parede
    for (const deg of [0, 35, 145, 180, 215, 325]) {
      const a = (deg * Math.PI) / 180;
      const R = ARENA.r - 0.1;
      const x = ARENA.x + Math.cos(a) * R,
        z = ARENA.z + Math.sin(a) * R;
      this.box(x, 2.6, z, 0.12, 0.6, 0.12, M.iron);
      this.flame(x, 3.0, z, 0.3);
      this.light(x - Math.cos(a) * 0.4, 3.0, z - Math.sin(a) * 0.4, 0xff8a40, 12, 13, 0.25);
    }
    this.anchors.arenaEntry = { x: 0, z: 149.5 };
  }

  // ------------------------------------------------------------------ floresta ao redor
  buildForest() {
    const r = this.rng;
    const inPlay = (x, z) => {
      if (z > -30 && z < 4.5 && Math.abs(x) < 9.5) return true;
      if (z >= 4 && z < 72 && Math.abs(x) < 41) return true;
      if (z >= 72 && z < 129 && Math.abs(x) < 38) return true;
      if (z >= 128 && z < 142) return true;
      if (z >= 140 && Math.hypot(x - ARENA.x, z - ARENA.z) < ARENA.r + 3) return true;
      if (z >= 139 && z < 151 && Math.abs(x) < 6) return true;
      return false;
    };
    let placed = 0,
      tries = 0;
    while (placed < 300 && tries < 6000) {
      tries++;
      const x = r.range(-62, 62),
        z = r.range(-44, 205);
      if (inPlay(x, z)) continue;
      // fora do alcance da neblina não vale a pena
      const nearEdge = Math.abs(x) < 58 && z < 200;
      if (!nearEdge) continue;
      const s = r.range(0.8, 1.35);
      if (r.chance(0.45)) this.pine(x, z, s);
      else this.deadTree(x, z, s, false);
      placed++;
    }
    // árvores grudadas no corredor inicial (com colisão)
    for (let z = -28; z < 4; z += 2.6) {
      for (const sx of [-1, 1]) {
        const x = sx * r.range(9.4, 11.5);
        if (r.chance(0.5)) this.pine(x, z + r.range(-0.6, 0.6), r.range(0.8, 1.2));
        else this.deadTree(x, z + r.range(-0.6, 0.6), r.range(0.8, 1.2));
      }
    }
    for (let i = 0; i < 40; i++) {
      const x = r.range(-55, 55),
        z = r.range(-35, 190);
      if (inPlay(x, z)) continue;
      this.rock(x, z, r.range(0.6, 1.8));
    }
    // arbustos baixos nas bordas da vila
    for (let i = 0; i < 60; i++) {
      const side = r.chance(0.5) ? -1 : 1;
      const x = side * r.range(40.5, 46),
        z = r.range(4, 128);
      this.geo(new THREE.IcosahedronGeometry(r.range(0.6, 1.2), 0), this.M.bush, x, 0.4, z, r.range(0, 3), 0, 0, { sy: 0.7 });
    }
  }

  buildGrass() {
    const q = this.G.quality;
    const total = Math.floor(3200 * q.grass);
    if (total <= 0) return;
    const g1 = new THREE.PlaneGeometry(0.7, 0.5);
    g1.translate(0, 0.25, 0);
    const g2 = g1.clone().rotateY(Math.PI / 2);
    const merged = new THREE.BufferGeometry();
    const a = g1.toNonIndexed(),
      b = g2.toNonIndexed();
    const pos = new Float32Array([...a.attributes.position.array, ...b.attributes.position.array]);
    const nor = new Float32Array(pos.length);
    for (let i = 0; i < nor.length; i += 3) nor[i + 1] = 1; // normal para cima: iluminação uniforme
    const uv = new Float32Array([...a.attributes.uv.array, ...b.attributes.uv.array]);
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    const r = new Rng(77);
    const byChunk = new Map();
    const m = new THREE.Matrix4(),
      q4 = new THREE.Quaternion(),
      e = new THREE.Euler(),
      p = new THREE.Vector3(),
      s = new THREE.Vector3();
    let tries = 0,
      n = 0;
    const onPath = (x, z) =>
      (Math.abs(x) < 3 && z < 72) ||
      Math.hypot(x, z - 32) < 12.5 ||
      (Math.abs(x) < 2.2 && z > 72 && z < 130) ||
      (z > 140 && Math.hypot(x - ARENA.x, z - ARENA.z) < ARENA.r + 1) ||
      (z > 139 && z < 151);
    while (n < total && tries < total * 6) {
      tries++;
      const x = r.range(-44, 44),
        z = r.range(-28, 190);
      if (z > RIVER.z0 - 0.5 && z < RIVER.z1 + 0.5) continue;
      if (onPath(x, z)) continue;
      if (this.col.pointBlocked(x, z, 0.3, -1, 3)) continue;
      if (this.isIndoor(x, z)) continue;
      const k = this.chunk(z);
      if (!byChunk.has(k)) byChunk.set(k, []);
      e.set(0, r.range(0, Math.PI), 0);
      q4.setFromEuler(e);
      const sc = r.range(0.7, 1.5);
      m.compose(p.set(x, 0, z), q4, s.set(sc, sc * r.range(0.8, 1.3), sc));
      byChunk.get(k).push(m.clone());
      n++;
    }
    for (const list of byChunk.values()) {
      const mesh = new THREE.InstancedMesh(merged, this.M.grass, list.length);
      list.forEach((mm, i) => mesh.setMatrixAt(i, mm));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      this.scene.add(mesh);
      this.grassMeshes.push(mesh);
    }
  }

  buildSky() {
    const sky = new THREE.Group();
    const uni = { top: { value: new THREE.Color(0x05070c) }, bottom: { value: this.fogColor.clone() } };
    this.skyUniforms = uni;
    const mat = new THREE.ShaderMaterial({
      uniforms: uni,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader:
        'uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main(){ float h = normalize(vP).y; float t = smoothstep(-0.02, 0.45, h); gl_FragColor = vec4(mix(bottom, top, t), 1.0); }',
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
    });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(260, 24, 12), mat);
    dome.renderOrder = -10;
    sky.add(dome);
    // montanhas em silhueta
    const segs = 96,
      R = 230;
    const pos = [],
      idx = [];
    const rr = new Rng(9);
    let hPrev = 30;
    const heights = [];
    for (let i = 0; i <= segs; i++) {
      hPrev = clamp(hPrev + rr.range(-9, 9), 14, 62);
      heights.push(i === segs ? heights[0] : hPrev);
    }
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pos.push(Math.cos(a) * R, -20, Math.sin(a) * R, Math.cos(a) * R, heights[i], Math.sin(a) * R);
      if (i < segs) {
        const k = i * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    }
    const mg = new THREE.BufferGeometry();
    mg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    mg.setIndex(idx);
    const mMat = new THREE.MeshBasicMaterial({ color: 0x07090d, fog: false, side: THREE.DoubleSide, depthWrite: false });
    const mountains = new THREE.Mesh(mg, mMat);
    mountains.renderOrder = -9;
    sky.add(mountains);
    // lua
    const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex('moon'), color: 0xc4cad8, fog: false, depthWrite: false, transparent: true, opacity: 0.9 }));
    const dir = new THREE.Vector3(0.45, 0.4, 0.8).normalize();
    moon.position.copy(dir).multiplyScalar(220);
    moon.scale.setScalar(26);
    moon.renderOrder = -8;
    sky.add(moon);
    // estrelas
    const sp = [];
    for (let i = 0; i < 500; i++) {
      const a = rr.range(0, Math.PI * 2),
        y = rr.range(0.18, 1);
      const rad = Math.sqrt(1 - y * y);
      sp.push(Math.cos(a) * rad * 240, y * 240, Math.sin(a) * rad * 240);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0x9aa4bb, size: 1.3, sizeAttenuation: false, fog: false, depthWrite: false, transparent: true, opacity: 0.6 }));
    stars.renderOrder = -9;
    sky.add(stars);
    sky.traverse((o) => (o.frustumCulled = false));
    this.scene.add(sky);
    this.sky = sky;
    this.moonDir = dir;
  }

  buildLights() {
    const scene = this.scene;
    this.hemi = new THREE.HemisphereLight(0x52628a, 0x2a2018, 1.55);
    scene.add(this.hemi);
    const moon = new THREE.DirectionalLight(0x9aaad6, 1.75);
    moon.castShadow = true;
    const sc = moon.shadow.camera;
    sc.left = -34;
    sc.right = 34;
    sc.top = 34;
    sc.bottom = -34;
    sc.near = 1;
    sc.far = 200;
    moon.shadow.mapSize.set(this.G.quality.shadowSize, this.G.quality.shadowSize);
    moon.shadow.bias = -0.0006;
    moon.shadow.normalBias = 0.03;
    scene.add(moon);
    scene.add(moon.target);
    this.moonLight = moon;
    scene.fog = new THREE.FogExp2(this.fogColor.getHex(), this.fogDensity);
    scene.background = this.fogColor;
  }

  setShadowQuality(q) {
    const m = this.moonLight;
    if (m.shadow.mapSize.x !== q.shadowSize) {
      m.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      if (m.shadow.map) {
        m.shadow.map.dispose();
        m.shadow.map = null;
      }
    }
    if (this.grassMeshes.length) {
      for (const g of this.grassMeshes) g.visible = q.grass > 0.01;
    }
  }

  isIndoor(x, z) {
    for (const h of this.indoors) {
      const dx = x - h.x,
        dz = z - h.z;
      const lx = dx * h.c - dz * h.s,
        lz = dx * h.s + dz * h.c;
      if (Math.abs(lx) < h.hw && Math.abs(lz) < h.hd) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------ atualização
  update(dt, cam, px, pz) {
    this.time += dt;
    const t = this.time;
    for (const f of this.flames) {
      const k = 1 + Math.sin(t * 13 + f.userData.phase) * 0.12 + Math.sin(t * 23 + f.userData.phase * 2) * 0.08;
      const b = f.userData.base;
      f.scale.set(b * 0.6 * (2 - k), b * k, 1);
    }
    const fx = this.G.fx;
    for (const fire of this.fires) {
      const dx = fire.x - px,
        dz = fire.z - pz;
      if (dx * dx + dz * dz > 40 * 40) continue;
      fire.acc += dt * fire.rate;
      const n = Math.floor(fire.acc);
      if (n > 0) {
        fire.acc -= n;
        fx.fire(fire, n, fire.size);
        if (fire.embers && Math.random() < 0.3) fx.embers(fire, 1, 0.8, 2.5);
      }
    }
    if (this.water) {
      const map = this.water.material.map;
      map.offset.x = (t * 0.03) % 1;
      map.offset.y = (t * 0.008) % 1;
    }
    // neblina por zona (transição suave)
    let a = FOG[0],
      b = FOG[0],
      k = 0;
    if (pz < FOG[1].z - 6) {
      a = b = FOG[0];
    } else if (pz < FOG[1].z + 6) {
      a = FOG[0];
      b = FOG[1];
      k = smoothstep(FOG[1].z - 6, FOG[1].z + 6, pz);
    } else if (pz < FOG[2].z - 8) {
      a = b = FOG[1];
    } else if (pz < FOG[2].z + 6) {
      a = FOG[1];
      b = FOG[2];
      k = smoothstep(FOG[2].z - 8, FOG[2].z + 6, pz);
    } else a = b = FOG[2];
    this.fogColor.copy(a.color).lerp(b.color, k);
    let dens = lerp(a.density, b.density, k);
    if (this.isIndoor(px, pz)) dens *= 0.55;
    this.fogDensity = damp1(this.fogDensity, dens, dt);
    const fog = this.scene.fog;
    fog.color.copy(this.fogColor);
    fog.density = this.fogDensity;
    this.skyUniforms.bottom.value.copy(this.fogColor);
    const warm = smoothstep(ZONE_Z[1] - 4, ZONE_Z[1] + 12, pz);
    if (this.hemi) {
      this.hemi.color.setHex(0x52628a).lerp(_warmSky, warm * 0.6);
      this.hemi.groundColor.setHex(0x2a2018).lerp(_warmGround, warm);
    }
    fx.setFog(this.fogColor, this.fogDensity);
    if (this.sky) this.sky.position.copy(cam.position);
    // sombra da lua acompanha o jogador (alinhada a texels para não tremer)
    const m = this.moonLight;
    const snap = 68 / this.G.quality.shadowSize;
    const sx = Math.round(px / snap) * snap,
      sz = Math.round(pz / snap) * snap;
    m.target.position.set(sx, 0, sz);
    m.position.set(sx + this.moonDir.x * 80, this.moonDir.y * 80 + 10, sz + this.moonDir.z * 80);
  }
}

const _warmSky = new THREE.Color(0x5a4a52);
const _warmGround = new THREE.Color(0x5a2c16);

function damp1(a, b, dt) {
  return a + (b - a) * (1 - Math.exp(-2 * dt));
}

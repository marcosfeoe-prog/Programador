// Mundo genérico: kit de construção (casas, postes, cercas, árvores...), batcher que junta a
// geometria estática, grama, céu, luar, neblina e fogo. Cada capítulo constrói o seu mapa com
// este kit (js/chapters/*.js); trocar de capítulo descarta tudo e monta o novo.
import * as THREE from 'three';
import { tex } from './textures.js';
import { Batcher, boxGeo, cylGeo, gableRoofGeo, gableEndsGeo, mat4 } from './geo.js';
import { Rng, clamp } from './util.js';

const Std = (o) => new THREE.MeshStandardMaterial({ roughness: 0.92, ...o });
const CHUNK = 48;

export class World {
  constructor(G) {
    this.G = G;
    this.scene = G.scene;
    this.root = null;
    this.chapter = null;
    this.anchors = {};
    this.flames = [];
    this.fires = [];
    this.indoors = [];
    this.waters = [];
    this.grassMeshes = [];
    this.fogColor = new THREE.Color(0x161c26);
    this.fogDensity = 0.038;
    this._fog = { color: new THREE.Color(), density: 0.04 };
    this.time = 0;
    this.mats();
    this.buildSky();
    this.buildLights();
  }

  get col() {
    return this.G.col;
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
  // Pedaços de 48 m (em X e Z) para o recorte de visão funcionar em mapas grandes.
  chunk(x, z) {
    return Math.floor(x / CHUNK) * 1000 + Math.floor(z / CHUNK);
  }

  box(x, y, z, w, h, d, mat, o = {}) {
    const ry = o.ry || 0;
    this.B.add(boxGeo(w, h, d, o.tile || 2), mat, mat4(x, y, z, ry, o.rx || 0, o.rz || 0), {
      cast: o.cast ?? true,
      receive: o.receive ?? true,
      chunk: this.chunk(x, z),
    });
    if (o.col) this.col.addBox(x, z, o.cw ?? w, o.cd ?? d, ry, { y0: o.y0 ?? y - h / 2, y1: o.y1 ?? y + h / 2, mat: o.cm || 'stone', shootThrough: o.st, noCamera: o.nc });
  }

  cyl(x, y, z, rt, rb, h, mat, o = {}) {
    this.B.add(cylGeo(rt, rb, h, o.seg || 10, o.tile || 2, o.open), mat, mat4(x, y, z, o.ry || 0, o.rx || 0, o.rz || 0), {
      cast: o.cast ?? true,
      receive: o.receive ?? true,
      chunk: this.chunk(x, z),
    });
    if (o.col) this.col.addCircle(x, z, o.cr ?? Math.max(rt, rb), { y0: o.y0 ?? y - h / 2, y1: o.y1 ?? y + h / 2, mat: o.cm || 'stone', shootThrough: o.st });
  }

  geo(g, mat, x, y, z, ry = 0, rx = 0, rz = 0, o = {}) {
    this.B.add(g, mat, mat4(x, y, z, ry, rx, rz, o.sx || 1, o.sy || 1, o.sz || 1), { cast: o.cast ?? true, receive: o.receive ?? true, chunk: this.chunk(x, z) });
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
    this.root.add(f);
    this.flames.push(f);
    if (glow) {
      const g = new THREE.Sprite(this.glowMat);
      g.position.set(x, y, z);
      g.scale.setScalar(s * 3.2);
      g.renderOrder = 5;
      this.root.add(g);
    }
    return f;
  }

  light(x, y, z, color, intensity, range, flicker = 0.1, priority = 0) {
    return this.G.fx.lights.add({ x, y, z, color, intensity, range, flicker, priority });
  }

  // ------------------------------------------------------------------ troca de capítulo
  unload() {
    if (this.root) {
      this.scene.remove(this.root);
      this.root.traverse((o) => {
        if (o.isMesh && (o.userData.batched || o.isInstancedMesh)) o.geometry.dispose();
      });
    }
    this.root = null;
    this.anchors = {};
    this.flames = [];
    this.fires = [];
    this.indoors = [];
    this.waters = [];
    this.grassMeshes = [];
    this.G.fx.lights.clearAll();
  }

  load(chapter) {
    this.unload();
    this.chapter = chapter;
    this.root = new THREE.Group();
    this.root.name = 'capitulo-' + chapter.id;
    this.scene.add(this.root);
    this.B = new Batcher();
    this.rng = new Rng(chapter.seed || 4242);
    chapter.build(this);
    for (const m of this.B.build(this.root)) m.userData.batched = true;
    if (chapter.grass) this.buildGrass(chapter.grass);
    const sky = chapter.sky || {};
    this.skyUniforms.top.value.setHex(sky.top ?? 0x05070c);
    this.mountains.material.color.setHex(sky.mountains ?? 0x07090d);
    this.mountains.scale.y = sky.mountainScale ?? 1;
    this.moon.visible = sky.moon !== false;
    this.stars.visible = sky.stars !== false;
    this.moonLight.intensity = sky.moonLight ?? 1.75;
    this.hemiBase = { sky: sky.hemiSky ?? 0x52628a, ground: sky.hemiGround ?? 0x2a2018, intensity: sky.hemi ?? 1.55 };
    this.hemi.intensity = this.hemiBase.intensity;
    // distância de desenho (mapas grandes desenham menos: a neblina esconde o resto)
    const far = chapter.far || 420;
    this.G.camera.far = far;
    this.G.camera.updateProjectionMatrix();
    this.sky.scale.setScalar(Math.min(1, (far * 0.9) / 260));
    chapter.fog(chapter.start.x, chapter.start.z, this._fog, this);
    this.fogColor.copy(this._fog.color);
    this.fogDensity = this._fog.density;
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
        this.root.add(g);
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
      this.B.add(g, M.bark, m, { cast: true, receive: false, chunk: this.chunk(x, z) });
      if (r.chance(0.7)) {
        const l2 = len * 0.5,
          a2 = a + r.range(-0.8, 0.8),
          t2 = tilt * 0.6;
        const ex = bx + Math.cos(a) * Math.sin(tilt) * len * 0.45,
          ez = bz + Math.sin(a) * Math.sin(tilt) * len * 0.45,
          ey = yy + Math.cos(tilt) * len * 0.45;
        const m2 = new THREE.Matrix4().makeRotationY(-a2).multiply(new THREE.Matrix4().makeRotationZ(-t2));
        m2.setPosition(ex + Math.cos(a2) * Math.sin(t2) * l2 * 0.5, ey + Math.cos(t2) * l2 * 0.5, ez + Math.sin(a2) * Math.sin(t2) * l2 * 0.5);
        this.B.add(cylGeo(0.01 * s, 0.03 * s, l2, 4, 2, true), M.bark, m2, { cast: true, receive: false, chunk: this.chunk(x, z) });
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
  // ------------------------------------------------------------------ ZONA 2: cemitério e rio
  // ------------------------------------------------------------------ ZONA 3: a forja
  // ------------------------------------------------------------------ floresta ao redor
  // spec: { minX, maxX, minZ, maxZ, count, skip(x, z) }
  buildGrass(spec) {
    const q = this.G.quality;
    const total = Math.floor(spec.count * q.grass);
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
    while (n < total && tries < total * 6) {
      tries++;
      const x = r.range(spec.minX, spec.maxX),
        z = r.range(spec.minZ, spec.maxZ);
      if (spec.skip && spec.skip(x, z)) continue;
      if (this.col.pointBlocked(x, z, 0.3, -1, 3)) continue;
      if (this.isIndoor(x, z)) continue;
      const k = this.chunk(x, z);
      if (!byChunk.has(k)) byChunk.set(k, []);
      e.set(0, r.range(0, Math.PI), 0);
      q4.setFromEuler(e);
      const sc = r.range(0.7, 1.5);
      m.compose(p.set(x, 0, z), q4, s.set(sc, sc * r.range(0.8, 1.3), sc));
      byChunk.get(k).push(m.clone());
      n++;
    }
    for (const list of byChunk.values()) {
      const mesh = new THREE.InstancedMesh(merged, spec.material || this.M.grass, list.length);
      list.forEach((mm, i) => mesh.setMatrixAt(i, mm));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      mesh.castShadow = false;
      this.root.add(mesh);
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
    this.moon = moon;
    this.mountains = mountains;
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
    this.stars = stars;
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
    for (const wtr of this.waters) {
      const map = wtr.material.map;
      map.offset.x = (t * 0.03) % 1;
      map.offset.y = (t * 0.008) % 1;
    }
    // neblina e luz ambiente definidas pelo capítulo (com transições suaves)
    const ch = this.chapter;
    ch.fog(px, pz, this._fog, this);
    this.fogColor.lerp(this._fog.color, 1 - Math.exp(-2 * dt));
    let dens = this._fog.density;
    if (this.isIndoor(px, pz)) dens *= 0.55;
    this.fogDensity = damp1(this.fogDensity, dens, dt);
    const fog = this.scene.fog;
    fog.color.copy(this.fogColor);
    fog.density = this.fogDensity;
    this.skyUniforms.bottom.value.copy(this.fogColor);
    const hb = this.hemiBase;
    this.hemi.color.setHex(hb.sky);
    this.hemi.groundColor.setHex(hb.ground);
    if (ch.hemi) ch.hemi(px, pz, this.hemi, this);
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

function damp1(a, b, dt) {
  return a + (b - a) * (1 - Math.exp(-2 * dt));
}

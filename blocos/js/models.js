// Modelos de personagens e animais feitos de caixas, com texturas pintadas por código e animações.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { BLOCKS, ITEMS } from './blocks.js';
import { blockItemGeometry } from './mesher.js';
import { itemIconPainter, tileCanvas, canvasTexture, getAtlasTexture } from './textures.js';

// ---------- pintura de skins (layout de caixa: direita, frente, esquerda, trás, topo, base) ----------
class Skin {
  constructor(w, h, seed = 1) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w;
    this.canvas.height = h;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(w, h);
    this.w = w;
    this.h = h;
    this.rnd = mulberry32(seed);
  }
  px(x, y, c) {
    if (!c) return;
    const i = (y * this.w + x) * 4;
    this.img.data[i] = c[0];
    this.img.data[i + 1] = c[1];
    this.img.data[i + 2] = c[2];
    this.img.data[i + 3] = c[3] ?? 255;
  }
  // fn(face, x, y, larguraFace, alturaFace) → cor
  box(u, v, w, h, d, fn) {
    const rects = {
      top: [u + d, v, w, d],
      bottom: [u + d + w, v, w, d],
      right: [u, v + d, d, h],
      front: [u + d, v + d, w, h],
      left: [u + d + w, v + d, d, h],
      back: [u + d + w + d, v + d, w, h],
    };
    for (const [face, [x0, y0, fw, fh]] of Object.entries(rects)) {
      for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) this.px(x0 + x, y0 + y, fn(face, x, y, fw, fh));
    }
  }
  vary(c, amt = 0.08) {
    const f = 1 + (this.rnd() - 0.5) * amt * 2;
    return [Math.min(255, c[0] * f) | 0, Math.min(255, c[1] * f) | 0, Math.min(255, c[2] * f) | 0];
  }
  texture() {
    this.ctx.putImageData(this.img, 0, 0);
    return canvasTexture(this.canvas);
  }
}

const SKIN = [199, 140, 106];
function paintHumanoid(kind) {
  const s = new Skin(64, 64, kind === 'zombie' ? 7 : 3);
  const zombie = kind === 'zombie';
  const skin = zombie ? [92, 148, 82] : SKIN;
  const hair = [66, 42, 22];
  const shirt = zombie ? [40, 140, 140] : [36, 160, 170];
  const pants = zombie ? [70, 60, 150] : [58, 58, 150];
  const shoe = [96, 96, 100];
  // cabeça
  s.box(0, 0, 8, 8, 8, (f, x, y) => {
    if (zombie) {
      if (f === 'front') {
        if (y === 3 && (x === 1 || x === 2 || x === 5 || x === 6)) return [20, 30, 20];
        if (y === 5 && x >= 3 && x <= 4) return [60, 100, 55];
        if (y === 6 && x >= 2 && x <= 5) return [50, 80, 45];
      }
      if (f === 'top') return s.vary([70, 110, 62]);
      return s.vary(skin, 0.06);
    }
    if (f === 'top') return s.vary(hair, 0.1);
    if (f === 'front') {
      if (y < 2) return s.vary(hair, 0.1);
      if (y === 2 && (x === 0 || x === 7)) return hair;
      if (y === 4 && (x === 1 || x === 6)) return [255, 255, 255];
      if (y === 4 && (x === 2 || x === 5)) return [74, 60, 150];
      if (y === 5 && (x === 3 || x === 4)) return [150, 95, 68];
      if (y === 6 && x >= 2 && x <= 5) return [110, 60, 45];
      if (y === 7 && x >= 2 && x <= 5) return [90, 58, 32];
      return s.vary(skin, 0.04);
    }
    if (f === 'back') return y < 7 ? s.vary(hair, 0.1) : s.vary(skin, 0.04);
    if (f === 'left' || f === 'right') return y < 3 || (y < 5 && (f === 'left' ? x > 4 : x < 3)) ? s.vary(hair, 0.1) : s.vary(skin, 0.04);
    return s.vary(skin, 0.04);
  });
  // corpo
  s.box(16, 16, 8, 12, 4, (f, x, y) => {
    if (f === 'front' && y < 2 && x >= 2 && x <= 5 && !(y === 1 && (x === 2 || x === 5))) return s.vary(skin, 0.04);
    if (y >= 11 && f !== 'top') return s.vary(pants, 0.05);
    if (zombie && f === 'front' && s.rnd() < 0.05) return [30, 100, 100];
    return s.vary(shirt, 0.06);
  });
  // braços
  const arm = (u, v) =>
    s.box(u, v, 4, 12, 4, (f, x, y) => {
      if (f === 'top') return s.vary(shirt, 0.06);
      if (y < 4 && f !== 'bottom') return s.vary(shirt, 0.06);
      return s.vary(skin, 0.05);
    });
  arm(40, 16);
  arm(32, 48);
  // pernas
  const leg = (u, v) =>
    s.box(u, v, 4, 12, 4, (f, x, y) => {
      if (f === 'bottom' || y >= 10) return s.vary(shoe, 0.06);
      return s.vary(pants, 0.06);
    });
  leg(0, 16);
  leg(16, 48);
  return s.texture();
}

function paintCreeper() {
  const s = new Skin(64, 32, 11);
  const g = () => s.vary([s.rnd() < 0.3 ? 120 : 80, s.rnd() < 0.3 ? 200 : 170, s.rnd() < 0.5 ? 80 : 60], 0.08);
  s.box(0, 0, 8, 8, 8, (f, x, y) => {
    if (f === 'front') {
      const eye = (y === 2 || y === 3) && (x === 1 || x === 2 || x === 5 || x === 6);
      const mouth = (y === 4 && (x === 3 || x === 4)) || (y === 5 && x >= 2 && x <= 5) || (y === 6 && (x === 2 || x === 5 || x === 3 || x === 4)) || (y === 7 && (x === 2 || x === 5));
      if (eye || mouth) return [10, 20, 10];
    }
    return g();
  });
  s.box(16, 16, 8, 12, 4, () => g());
  s.box(0, 16, 4, 6, 4, () => g());
  return s.texture();
}

function paintQuad(kind) {
  const s = new Skin(64, 64, kind.length * 13);
  if (kind === 'pig') {
    const pink = [240, 165, 165];
    s.box(0, 0, 8, 8, 8, (f, x, y) => {
      if (f === 'front' && y === 3 && (x === 1 || x === 6)) return [255, 255, 255];
      if (f === 'front' && y === 3 && (x === 2 || x === 5)) return [30, 20, 20];
      return s.vary(pink, 0.04);
    });
    s.box(16, 16, 4, 3, 1, (f, x, y) => (f === 'front' && y === 1 && (x === 0 || x === 3) ? [150, 80, 80] : s.vary([235, 140, 140], 0.04)));
    s.box(0, 32, 10, 8, 16, () => s.vary(pink, 0.05));
    s.box(0, 16, 4, 6, 4, (f, x, y) => (y >= 5 || f === 'bottom' ? [150, 100, 90] : s.vary(pink, 0.05)));
  } else if (kind === 'sheep') {
    const wool = [235, 235, 235];
    const face = [220, 190, 170];
    s.box(0, 0, 6, 6, 8, (f, x, y) => {
      if (f === 'front') {
        if (y === 2 && (x === 1 || x === 4)) return [30, 30, 30];
        if (y < 1) return s.vary(wool, 0.04);
        return s.vary(face, 0.04);
      }
      return s.vary(wool, 0.05);
    });
    s.box(0, 32, 8, 8, 16, () => s.vary(wool, 0.06));
    s.box(0, 16, 4, 12, 4, (f, x, y) => (y < 6 ? s.vary(wool, 0.05) : s.vary(face, 0.06)));
  } else if (kind === 'cow') {
    const brown = [80, 56, 40];
    const white = [230, 230, 230];
    s.box(0, 0, 8, 8, 6, (f, x, y) => {
      if (f === 'front') {
        if (y === 3 && (x === 1 || x === 6)) return [20, 20, 20];
        if (y >= 5 && x >= 2 && x <= 5) return y === 6 && (x === 2 || x === 5) ? [60, 40, 40] : [200, 170, 160];
        if (y < 2 && x > 2 && x < 6) return s.vary(white, 0.03);
      }
      return s.vary(brown, 0.06);
    });
    s.box(32, 0, 1, 3, 1, () => [220, 210, 190]);
    s.box(0, 32, 12, 10, 18, (f, x, y) => {
      const spot = ((Math.floor(x / 4) * 7 + Math.floor(y / 4) * 3 + (f.length * 5)) % 5) === 0;
      return s.vary(spot ? white : brown, 0.05);
    });
    s.box(0, 16, 4, 12, 4, (f, x, y) => (y >= 10 ? [40, 30, 25] : s.vary(y < 5 ? brown : white, 0.05)));
  }
  return s.texture();
}

// ---------- geometria de caixa com UV de skin ----------
function skinBox(w, h, d, u, v, tw, th, inflate = 0) {
  const g = new THREE.BoxGeometry(w + inflate * 2, h + inflate * 2, d + inflate * 2);
  const uv = g.attributes.uv;
  const rects = [
    [u + d + w, v + d, d, h], // +x (esquerda do personagem)
    [u, v + d, d, h], // -x (direita do personagem)
    [u + d, v, w, d], // topo
    [u + d + w, v, w, d], // base
    [u + d, v + d, w, h], // frente (+z)
    [u + d + w + d, v + d, w, h], // trás
  ];
  for (let f = 0; f < 6; f++) {
    const [x0, y0, fw, fh] = rects[f];
    const a = x0 / tw, b = (x0 + fw) / tw;
    const t = 1 - y0 / th, bt = 1 - (y0 + fh) / th;
    uv.setXY(f * 4 + 0, a, t);
    uv.setXY(f * 4 + 1, b, t);
    uv.setXY(f * 4 + 2, a, bt);
    uv.setXY(f * 4 + 3, b, bt);
  }
  return g;
}

function limb(parent, geo, mat, pivot, offset) {
  const grp = new THREE.Group();
  grp.position.set(...pivot);
  const m = new THREE.Mesh(geo, mat);
  m.position.set(...offset);
  grp.add(m);
  parent.add(grp);
  return grp;
}

const textures = {};
function skinTexture(kind) {
  if (!textures[kind]) {
    if (kind === 'steve' || kind === 'zombie') textures[kind] = paintHumanoid(kind);
    else if (kind === 'creeper') textures[kind] = paintCreeper();
    else textures[kind] = paintQuad(kind);
  }
  return textures[kind];
}
export function playerSkin() {
  return skinTexture('steve');
}

// ---------- modelo base ----------
class Model {
  constructor(tex) {
    this.root = new THREE.Group();
    this.inner = new THREE.Group();
    this.root.add(this.inner);
    this.mat = new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5 });
    this.mats = [this.mat];
  }
  setLight(b, hurt, flash = 0) {
    for (const m of this.mats) {
      if (flash > 0) m.color.setRGB(b + flash, b + flash, b + flash);
      else if (hurt) m.color.setRGB(b, b * 0.4, b * 0.4);
      else m.color.setRGB(b, b, b);
    }
  }
  dispose() {
    this.root.traverse((o) => {
      if (o.isMesh && o.geometry && !o.userData.shared) o.geometry.dispose();
    });
    for (const m of this.mats) m.dispose();
  }
}

// Humanoide: jogador, zumbi
export class HumanoidModel extends Model {
  constructor(kind = 'steve') {
    super(skinTexture(kind));
    this.kind = kind;
    const S = 0.9375 / 16;
    this.inner.scale.setScalar(S);
    const m = this.mat;
    this.legsRoot = new THREE.Group();
    this.inner.add(this.legsRoot);
    this.upper = new THREE.Group();
    this.upper.position.set(0, 12, 0);
    this.inner.add(this.upper);
    this.body = limb(this.upper, skinBox(8, 12, 4, 16, 16, 64, 64), m, [0, 0, 0], [0, 6, 0]);
    this.head = limb(this.upper, skinBox(8, 8, 8, 0, 0, 64, 64), m, [0, 12, 0], [0, 4, 0]);
    this.rightArm = limb(this.upper, skinBox(4, 12, 4, 40, 16, 64, 64), m, [-6, 10, 0], [0, -4, 0]);
    this.leftArm = limb(this.upper, skinBox(4, 12, 4, 32, 48, 64, 64), m, [6, 10, 0], [0, -4, 0]);
    this.rightLeg = limb(this.legsRoot, skinBox(4, 12, 4, 0, 16, 64, 64), m, [-2, 12, 0], [0, -6, 0]);
    this.leftLeg = limb(this.legsRoot, skinBox(4, 12, 4, 16, 48, 64, 64), m, [2, 12, 0], [0, -6, 0]);
    this.hand = new THREE.Group();
    this.hand.position.set(0, -9, 1);
    this.rightArm.add(this.hand);
    this.heldId = 0;
    this.heldMesh = null;
  }

  setHeld(id) {
    if (id === this.heldId) return;
    this.heldId = id;
    if (this.heldMesh) this.hand.remove(this.heldMesh);
    this.heldMesh = null;
    if (!id) return;
    const mesh = heldItemMesh(id);
    if (mesh.userData.isBlock) {
      mesh.scale.setScalar(6);
      mesh.position.set(0, -1, -2);
      mesh.rotation.set(-0.3, Math.PI / 4, 0);
    } else {
      mesh.scale.setScalar(11);
      mesh.position.set(0, 2, -4);
      mesh.rotation.set(0, Math.PI / 2, Math.PI * 0.75);
      if (mesh.userData.flat) mesh.rotation.set(-Math.PI / 2 + 0.6, Math.PI / 2, 0);
    }
    for (const mm of mesh.userData.mats) if (!this.mats.includes(mm)) this.mats.push(mm);
    this.hand.add(mesh);
    this.heldMesh = mesh;
  }

  // st: limbSwing, limbAmount, headYaw, headPitch, swing, sneak, age, zombieArms, death
  animate(st) {
    const ls = st.limbSwing * 0.6662;
    const amt = Math.min(1, st.limbAmount);
    this.head.rotation.set(-st.headPitch, st.headYaw, 0);
    this.rightArm.rotation.set(Math.cos(ls + Math.PI) * 2 * amt * 0.5, 0, 0);
    this.leftArm.rotation.set(Math.cos(ls) * 2 * amt * 0.5, 0, 0);
    this.rightLeg.rotation.set(Math.cos(ls) * 1.4 * amt, 0, 0);
    this.leftLeg.rotation.set(Math.cos(ls + Math.PI) * 1.4 * amt, 0, 0);
    // respiração dos braços
    const t = st.age;
    this.rightArm.rotation.z = -(Math.cos(t * 0.09) * 0.05 + 0.05);
    this.leftArm.rotation.z = Math.cos(t * 0.09) * 0.05 + 0.05;
    this.rightArm.rotation.x += Math.sin(t * 0.067) * 0.05;
    this.leftArm.rotation.x -= Math.sin(t * 0.067) * 0.05;
    if (this.heldId) this.rightArm.rotation.x = this.rightArm.rotation.x * 0.5 - 0.31;
    if (st.zombieArms) {
      this.rightArm.rotation.x = -Math.PI / 2 + Math.sin(t * 0.067) * 0.05;
      this.leftArm.rotation.x = -Math.PI / 2 - Math.sin(t * 0.067) * 0.05;
    }
    if (st.eating > 0) {
      this.rightArm.rotation.x = -1.2 + Math.abs(Math.sin(st.eating * 0.9)) * 0.25;
      this.rightArm.rotation.y = -0.4;
    } else this.rightArm.rotation.y = 0;
    // golpe do braço direito
    this.body.rotation.y = 0;
    if (st.swing > 0) {
      const f = st.swing;
      const sb = Math.sin(Math.sqrt(f) * Math.PI * 2) * 0.2;
      this.body.rotation.y = sb;
      const g = 1 - f;
      const g4 = 1 - g * g * g * g;
      const a = Math.sin(g4 * Math.PI) * 1.2 + Math.sin(f * Math.PI) * (st.headPitch * 0.75 + 0.5);
      this.rightArm.rotation.x -= a;
      this.rightArm.rotation.y += sb * 2;
      this.rightArm.rotation.z += Math.sin(f * Math.PI) * 0.4;
    }
    // agachar
    if (st.sneak) {
      this.upper.rotation.x = 0.45;
      this.head.rotation.x -= 0.45;
      this.rightArm.rotation.x -= 0.3;
      this.leftArm.rotation.x -= 0.3;
      this.inner.position.y = -0.12;
      this.legsRoot.position.z = -2.5;
      this.upper.position.z = 0;
    } else {
      this.upper.rotation.x = 0;
      this.inner.position.y = 0;
      this.legsRoot.position.z = 0;
    }
    this.root.rotation.z = st.death ? Math.min(1, st.death / 20) ** 0.6 * (Math.PI / 2) : 0;
  }
}

export class CreeperModel extends Model {
  constructor() {
    super(skinTexture('creeper'));
    this.inner.scale.setScalar(1 / 16);
    const m = this.mat;
    this.body = limb(this.inner, skinBox(8, 12, 4, 16, 16, 64, 32), m, [0, 6, 0], [0, 6, 0]);
    this.head = limb(this.inner, skinBox(8, 8, 8, 0, 0, 64, 32), m, [0, 18, 0], [0, 4, 0]);
    this.legs = [];
    for (const [x, z] of [[-2, 4], [2, 4], [-2, -4], [2, -4]]) this.legs.push(limb(this.inner, skinBox(4, 6, 4, 0, 16, 64, 32), m, [x, 6, z], [0, -3, 0]));
  }
  animate(st) {
    const ls = st.limbSwing * 0.6662, amt = Math.min(1, st.limbAmount);
    this.head.rotation.set(-st.headPitch, st.headYaw, 0);
    this.legs[0].rotation.x = Math.cos(ls) * 1.4 * amt;
    this.legs[1].rotation.x = Math.cos(ls + Math.PI) * 1.4 * amt;
    this.legs[2].rotation.x = Math.cos(ls + Math.PI) * 1.4 * amt;
    this.legs[3].rotation.x = Math.cos(ls) * 1.4 * amt;
    const sw = st.fuse || 0;
    const k = 1 + sw * 0.25 + Math.sin(sw * 60) * sw * 0.02;
    this.inner.scale.set(k / 16, (1 + sw * 0.1) / 16, k / 16);
    this.root.rotation.z = st.death ? Math.min(1, st.death / 20) ** 0.6 * (Math.PI / 2) : 0;
  }
}

export class QuadrupedModel extends Model {
  constructor(kind) {
    super(skinTexture(kind));
    this.kind = kind;
    this.inner.scale.setScalar(1 / 16);
    const m = this.mat;
    this.legs = [];
    let legH, legPos, bodyGeo, bodyY, headGeo, headPos, headOff;
    if (kind === 'pig') {
      legH = 6;
      legPos = [[-3, 7], [3, 7], [-3, -5], [3, -5]];
      bodyGeo = skinBox(10, 8, 16, 0, 32, 64, 64);
      bodyY = 10;
      headGeo = skinBox(8, 8, 8, 0, 0, 64, 64);
      headPos = [0, 12, 8];
      headOff = [0, 0, 3];
    } else if (kind === 'sheep') {
      legH = 12;
      legPos = [[-3, 7], [3, 7], [-3, -5], [3, -5]];
      bodyGeo = skinBox(8, 8, 16, 0, 32, 64, 64, 1.5);
      bodyY = 16;
      headGeo = skinBox(6, 6, 8, 0, 0, 64, 64);
      headPos = [0, 18, 8];
      headOff = [0, 1, 4];
    } else {
      legH = 12;
      legPos = [[-4, 7], [4, 7], [-4, -6], [4, -6]];
      bodyGeo = skinBox(12, 10, 18, 0, 32, 64, 64);
      bodyY = 17;
      headGeo = skinBox(8, 8, 6, 0, 0, 64, 64);
      headPos = [0, 20, 9];
      headOff = [0, 0, 3];
    }
    const legGeo = skinBox(4, legH, 4, 0, 16, 64, 64);
    for (const [x, z] of legPos) this.legs.push(limb(this.inner, legGeo, m, [x, legH, z], [0, -legH / 2, 0]));
    this.body = limb(this.inner, bodyGeo, m, [0, bodyY, 0], [0, 0, 0]);
    this.head = limb(this.inner, headGeo, m, headPos, headOff);
    if (kind === 'pig') {
      const sn = new THREE.Mesh(skinBox(4, 3, 1, 16, 16, 64, 64), m);
      sn.position.set(0, -1, 7.5);
      this.head.add(sn);
    }
    if (kind === 'cow') {
      for (const x of [-4.5, 4.5]) {
        const h = new THREE.Mesh(skinBox(1, 3, 1, 32, 0, 64, 64), m);
        h.position.set(x, 4.5, 4);
        this.head.add(h);
      }
    }
  }
  animate(st) {
    const ls = st.limbSwing * 0.6662, amt = Math.min(1, st.limbAmount);
    this.head.rotation.set(-st.headPitch + (st.eatGrass || 0), st.headYaw, 0);
    this.legs[0].rotation.x = Math.cos(ls) * 1.4 * amt;
    this.legs[1].rotation.x = Math.cos(ls + Math.PI) * 1.4 * amt;
    this.legs[2].rotation.x = Math.cos(ls + Math.PI) * 1.4 * amt;
    this.legs[3].rotation.x = Math.cos(ls) * 1.4 * amt;
    this.root.rotation.z = st.death ? Math.min(1, st.death / 20) ** 0.6 * (Math.PI / 2) : 0;
  }
}

// ---------- itens 3D ----------
// Sprite 16×16 extrudado: cada pixel opaco vira um cubinho (como os itens do jogo original).
const extrudeCache = new Map();
function extrudedGeometry(key, painter) {
  if (extrudeCache.has(key)) return extrudeCache.get(key);
  const d = painter.img.data;
  const A = (x, y) => x >= 0 && y >= 0 && x < 16 && y < 16 && d[(y * 16 + x) * 4 + 3] > 127;
  const pos = [], col = [];
  const q = 1 / 16, hz = 0.5 / 16;
  const quad = (pts, c, s) => {
    const [a, b, cc, dd] = pts;
    pos.push(...a, ...b, ...cc, ...a, ...cc, ...dd);
    for (let i = 0; i < 6; i++) col.push((c[0] / 255) * s, (c[1] / 255) * s, (c[2] / 255) * s);
  };
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if (!A(x, y)) continue;
    const i = (y * 16 + x) * 4;
    const c = [d[i], d[i + 1], d[i + 2]];
    const x0 = x * q - 0.5, x1 = x0 + q, y1 = 0.5 - y * q, y0 = y1 - q;
    quad([[x0, y0, hz], [x1, y0, hz], [x1, y1, hz], [x0, y1, hz]], c, 1);
    quad([[x1, y0, -hz], [x0, y0, -hz], [x0, y1, -hz], [x1, y1, -hz]], c, 0.85);
    if (!A(x + 1, y)) quad([[x1, y0, hz], [x1, y0, -hz], [x1, y1, -hz], [x1, y1, hz]], c, 0.7);
    if (!A(x - 1, y)) quad([[x0, y0, -hz], [x0, y0, hz], [x0, y1, hz], [x0, y1, -hz]], c, 0.7);
    if (!A(x, y - 1)) quad([[x0, y1, hz], [x1, y1, hz], [x1, y1, -hz], [x0, y1, -hz]], c, 0.9);
    if (!A(x, y + 1)) quad([[x0, y0, -hz], [x1, y0, -hz], [x1, y0, hz], [x0, y0, hz]], c, 0.6);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeBoundingSphere();
  extrudeCache.set(key, g);
  return g;
}

function tilePainter(name) {
  const c = tileCanvas(name);
  const img = c.getContext('2d').getImageData(0, 0, 16, 16);
  return { img };
}

// Malha 3D de um item (bloco = cubo; resto = sprite extrudado). Material próprio para receber a luz.
export function heldItemMesh(id) {
  let mesh;
  if (id < 256) {
    const b = BLOCKS[id];
    if (b.render === 'cube' || b.render === 'liquid') {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uAtlas: { value: getAtlasTexture() }, uBright: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) } },
        vertexShader: `attribute vec3 aLight; attribute vec3 aTint; varying vec2 vUv; varying float vS; varying vec3 vT;
          void main(){ vUv = uv; vS = aLight.z; vT = aTint; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
        fragmentShader: `uniform sampler2D uAtlas; uniform float uBright; uniform vec3 uTint; varying vec2 vUv; varying float vS; varying vec3 vT;
          void main(){ vec4 t = texture2D(uAtlas, vUv); if (t.a < 0.3) discard; gl_FragColor = vec4(t.rgb * vT * vS * uBright * uTint, 1.0); }`,
      });
      // compatível com setLight(): usa .color como cor final
      mat.color = mat.uniforms.uTint.value;
      mesh = new THREE.Mesh(blockItemGeometry(id), mat);
      mesh.userData.isBlock = true;
      mesh.userData.mats = [mat];
      mesh.userData.shared = true;
      return mesh;
    }
    const g = extrudedGeometry('t' + id, tilePainter(b.tex));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    mesh = new THREE.Mesh(g, mat);
    mesh.userData.flat = true;
  } else {
    const it = ITEMS[id];
    const g = extrudedGeometry('i' + id, itemIconPainter(it.icon));
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true });
    mesh = new THREE.Mesh(g, mat);
    mesh.userData.tool = !!it.tool;
  }
  mesh.userData.mats = [mesh.material];
  mesh.userData.shared = true;
  return mesh;
}

// ---------- mão em primeira pessoa ----------
// posição (x, y, z) e rotação (x, y, z) do braço vazio
export class ViewModel {
  static ARM = [0.976, -0.816, -0.49, 2.241, 0.528, 0];
  constructor() {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
    this.holder = new THREE.Group();
    this.scene.add(this.holder);
    this.armMat = new THREE.MeshBasicMaterial({ map: playerSkin() });
    this.arm = new THREE.Group();
    const armMesh = new THREE.Mesh(skinBox(4, 12, 4, 40, 16, 64, 64), this.armMat);
    armMesh.scale.setScalar(1 / 16);
    armMesh.position.set(0, -0.3, 0);
    this.arm.add(armMesh);
    this.holder.add(this.arm);
    this.itemGroup = new THREE.Group();
    this.holder.add(this.itemGroup);
    this.heldId = -1;
    this.item = null;
  }
  resize(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }
  setHeld(id) {
    if (id === this.heldId) return;
    this.heldId = id;
    if (this.item) this.itemGroup.remove(this.item);
    this.item = null;
    this.arm.visible = !id;
    if (!id) return;
    this.item = heldItemMesh(id);
    this.itemGroup.add(this.item);
  }
  // st: swing, equip (0..1), bobX, bobY, light, eating, swayX, swayY
  update(st) {
    const s = st.swing;
    const sq = Math.sin(s * s * Math.PI), sr = Math.sin(Math.sqrt(s) * Math.PI);
    const eq = (1 - st.equip) * -0.6;
    const b = st.light;
    this.armMat.color.setRGB(b, b, b);
    this.holder.position.set(st.bobX + st.swayX, st.bobY + st.swayY, 0);
    if (!this.heldId) {
      const a = this.arm;
      const P = ViewModel.ARM;
      a.position.set(P[0] - sr * 0.3, P[1] + eq + Math.sin(Math.sqrt(s) * Math.PI * 2) * 0.18, P[2] - Math.sin(s * Math.PI) * 0.25);
      a.rotation.order = 'YXZ';
      a.rotation.set(P[3] - sr * 0.6, P[4] + sq * 0.4, P[5]);
      return;
    }
    const it = this.item;
    for (const m of it.userData.mats) m.color.setRGB(b, b, b);
    const g = this.itemGroup;
    const ey = st.eating > 0 ? -0.2 + Math.abs(Math.sin(st.eating * 0.9)) * 0.06 : 0;
    g.position.set(0.5 - sr * 0.4 - (st.eating > 0 ? 0.3 : 0), -0.36 + eq + Math.sin(Math.sqrt(s) * Math.PI * 2) * 0.2 + ey, -0.75 - Math.sin(s * Math.PI) * 0.2);
    g.rotation.order = 'YXZ';
    if (it.userData.isBlock) {
      g.rotation.set(-sr * 1.2, -sq * 0.35, -sr * 0.35);
      it.scale.setScalar(0.24);
      it.position.set(0.02, 0.0, -0.1);
      it.rotation.order = 'XYZ';
      it.rotation.set(0.3, Math.PI / 4 - 0.35, 0);
    } else {
      g.rotation.set(-sr * 1.2, Math.PI / 4 - sq * 0.35, -sr * 0.35);
      it.scale.setScalar(it.userData.flat ? 0.45 : 0.55);
      it.position.set(0, 0.05, 0);
      it.rotation.order = 'YXZ';
      it.rotation.set(0, 1.86, 0.15);
    }
  }
}

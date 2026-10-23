// Modelos de personagens e animais feitos de caixas, com texturas pintadas por código e animações.
import * as THREE from 'three';
import { mulberry32, hash2 } from './noise.js';
import { BLOCKS, ITEMS } from './blocks.js';
import { blockItemGeometry } from './mesher.js';
import { itemIconPainter, tileImageData, canvasTexture, getAtlasTexture } from './textures.js';
import { U, SHADOW_GLSL } from './render.js';
import { CLOUD_GLSL } from './maxsky.js';

// ---------- pintura de skins (layout de caixa: direita, frente, esquerda, trás, topo, base) ----------
// k: resolução extra (MAX pinta cada pixel da skin em k×k, com pelo, volume e brilho nos olhos)
// fur: 0 pele/pano, 1 pelo curto, 2 lã, 3 penas
class Skin {
  constructor(w, h, seed = 1, k = 1, fur = 0) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = w * k;
    this.canvas.height = h * k;
    this.ctx = this.canvas.getContext('2d');
    this.img = this.ctx.createImageData(w * k, h * k);
    this.w = w;
    this.h = h;
    this.k = k;
    this.fur = fur;
    this.seed = seed;
    this.rnd = mulberry32(seed);
  }
  px(x, y, c) {
    if (!c) return;
    const i = (y * this.w * this.k + x) * 4;
    this.img.data[i] = c[0];
    this.img.data[i + 1] = c[1];
    this.img.data[i + 2] = c[2];
    this.img.data[i + 3] = c[3] ?? 255;
  }
  // fn(face, x, y, larguraFace, alturaFace, fx, fy) → cor; fx/fy são contínuos (servem para manchas suaves no MAX)
  box(u, v, w, h, d, fn) {
    const rects = {
      top: [u + d, v, w, d],
      bottom: [u + d + w, v, w, d],
      right: [u, v + d, d, h],
      front: [u + d, v + d, w, h],
      left: [u + d + w, v + d, d, h],
      back: [u + d + w + d, v + d, w, h],
    };
    const k = this.k;
    for (const [face, [x0, y0, fw, fh]] of Object.entries(rects)) {
      if (k === 1) {
        for (let y = 0; y < fh; y++) for (let x = 0; x < fw; x++) this.px(x0 + x, y0 + y, fn(face, x, y, fw, fh, x + 0.5, y + 0.5));
        continue;
      }
      for (let Y = 0; Y < fh * k; Y++) for (let X = 0; X < fw * k; X++) {
        const fx = (X + 0.5) / k, fy = (Y + 0.5) / k;
        const c = fn(face, Math.floor(fx), Math.floor(fy), fw, fh, fx, fy);
        if (c) this.px(x0 * k + X, y0 * k + Y, this.shade(c, face, X, Y, fx, fy, fw, fh));
      }
    }
  }
  // detalhe em alta resolução: volume da caixa, pelo e olhos com brilho
  shade(c, face, X, Y, fx, fy, fw, fh) {
    const k = this.k;
    if (c.eye && X % k === 1 && Y % k === 1) return [235, 238, 240];
    let s = face === 'top' ? 1.06 : face === 'bottom' ? 0.8 : 1.03 - (fy / fh) * 0.16;
    const e = Math.min(fx, fw - fx, fy, fh - fy);
    s *= 0.84 + 0.16 * Math.min(1, e / 0.9);
    const sd = this.seed * 31 + face.length;
    const fur = c.fur ?? this.fur;
    if (fur === 1) {
      // fios curtos em listras verticais
      const off = Math.floor(hash2(sd, X, 7) * 3);
      s *= 0.88 + 0.22 * hash2(sd, X, Math.floor((Y + off) / 3));
    } else if (fur === 2) {
      // lã em cachos: o centro de cachinho mais próximo (células de Voronoi) dá o volume
      const cx = Math.floor(X / 3.5), cy = Math.floor(Y / 3.5);
      let d1 = 9, id = 0;
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const gx = cx + i, gy = cy + j;
        const dd = Math.hypot(X + 0.5 - (gx + hash2(sd, gx, gy)) * 3.5, Y + 0.5 - (gy + hash2(sd + 1, gx, gy)) * 3.5);
        if (dd < d1) { d1 = dd; id = hash2(sd + 2, gx, gy); }
      }
      const r = Math.min(1, d1 / 2.6);
      s *= (0.78 + 0.28 * (1 - r * r)) * (0.93 + 0.12 * id);
    } else if (fur === 3) {
      // penas em escamas
      const row = Math.floor(Y / 3), col = Math.floor((X + (row % 2) * 1.5) / 3);
      const ly = Y - row * 3;
      s *= (ly >= 2 ? 0.86 : 1.02) * (0.95 + 0.08 * hash2(sd, col, row));
    } else s *= 0.95 + 0.08 * hash2(sd, X, Y);
    return [Math.min(255, c[0] * s) | 0, Math.min(255, c[1] * s) | 0, Math.min(255, c[2] * s) | 0, c[3] ?? 255];
  }
  vary(c, amt = 0.08) {
    const f = 1 + (this.rnd() - 0.5) * amt * 2;
    return [Math.min(255, c[0] * f) | 0, Math.min(255, c[1] * f) | 0, Math.min(255, c[2] * f) | 0];
  }
  texture() {
    this.ctx.putImageData(this.img, 0, 0);
    const t = canvasTexture(this.canvas);
    if (this.k > 1) {
      // em alta resolução: filtragem suave com mipmaps (sem serrilhado de longe)
      t.minFilter = THREE.LinearMipmapLinearFilter;
      t.magFilter = THREE.LinearFilter;
      t.generateMipmaps = true;
      t.anisotropy = 4;
      t.needsUpdate = true;
    }
    return t;
  }
}
// pixel de olho: ganha um ponto de brilho no MAX
const eye = (c) => Object.assign(c.slice(), { eye: true });
// ruído suave para manchas orgânicas
function smoothNoise(seed, x, y) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = hash2(seed, ix, iy), b = hash2(seed, ix + 1, iy), c = hash2(seed, ix, iy + 1), d = hash2(seed, ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const SKIN = [199, 140, 106];
function paintHumanoid(kind, k = 1) {
  const s = new Skin(64, 64, kind === 'zombie' ? 7 : 3, k);
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
        if (y === 3 && (x === 1 || x === 2 || x === 5 || x === 6)) return eye([20, 30, 20]);
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
      if (y === 4 && (x === 2 || x === 5)) return eye([74, 60, 150]);
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

function paintSkeleton(k = 1) {
  const s = new Skin(64, 32, 21, k);
  const bone = [200, 200, 196];
  const dark = [70, 70, 70];
  s.box(0, 0, 8, 8, 8, (f, x, y) => {
    if (f === 'front') {
      if ((y === 3 || y === 4) && (x === 1 || x === 2 || x === 5 || x === 6)) return [30, 30, 30];
      if (y === 5 && (x === 3 || x === 4)) return [60, 60, 60];
      if (y === 6 && x >= 1 && x <= 6) return x % 2 ? [40, 40, 40] : bone;
    }
    return s.vary(bone, 0.06);
  });
  s.box(16, 16, 8, 12, 4, (f, x, y) => {
    if (f === 'front' || f === 'back') {
      if (x === 3 || x === 4) return s.vary(bone, 0.05);
      if (y < 8 && y % 2 === 0) return s.vary(bone, 0.06);
      if (y >= 9) return y === 9 ? s.vary(bone, 0.05) : dark;
      return dark;
    }
    return y % 2 === 0 && y < 8 ? s.vary(bone, 0.05) : dark;
  });
  s.box(40, 16, 2, 12, 2, (f, x, y) => (y === 5 || y === 6 ? [150, 150, 146] : s.vary(bone, 0.06)));
  s.box(0, 16, 2, 12, 2, (f, x, y) => (y === 5 || y === 6 ? [150, 150, 146] : s.vary(bone, 0.06)));
  return s.texture();
}

function paintChicken(k = 1) {
  const s = new Skin(64, 32, 31, k, 3);
  const white = [240, 240, 236];
  s.box(0, 0, 4, 6, 3, (f, x, y) => (f === 'front' && y === 1 && (x === 0 || x === 3) ? eye([20, 20, 20]) : s.vary(white, 0.03)));
  s.box(14, 0, 4, 2, 2, () => s.vary([236, 150, 40], 0.05));
  s.box(14, 4, 2, 2, 2, () => s.vary([210, 30, 30], 0.05));
  s.box(0, 9, 6, 6, 8, () => s.vary(white, 0.04));
  s.box(26, 0, 3, 5, 3, () => s.vary([230, 160, 40], 0.05));
  s.box(24, 13, 1, 4, 6, () => s.vary([226, 226, 222], 0.04));
  // cauda (MAX)
  s.box(40, 0, 4, 4, 1, (f, x, y) => s.vary(y < 1 ? [250, 250, 248] : white, 0.04));
  return s.texture();
}

function paintSpider(k = 1) {
  const s = new Skin(64, 64, 41, k, 1);
  const hair = () => s.vary([s.rnd() < 0.3 ? 70 : 46, s.rnd() < 0.3 ? 58 : 38, 34], 0.15);
  s.box(32, 4, 8, 8, 8, (f, x, y) => {
    if (f === 'front') {
      if ((y === 3 && (x === 1 || x === 2 || x === 5 || x === 6)) || (y === 4 && (x === 2 || x === 5)) || (y === 2 && (x === 3 || x === 4))) return eye([200, 20, 20]);
      if (y === 4 && (x === 1 || x === 6)) return [120, 10, 10];
    }
    return hair();
  });
  s.box(0, 0, 6, 6, 6, () => hair());
  s.box(0, 32, 10, 8, 12, (f, x, y) => ((f === 'top' && (x + y * 3) % 7 === 0) ? [110, 30, 20] : hair()));
  s.box(0, 20, 16, 2, 2, () => hair());
  return s.texture();
}

function paintCreeper(k = 1) {
  const s = new Skin(64, 32, 11, k);
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

// fur por pixel (a ovelha tem rosto de pelo curto e corpo de lã)
const withFur = (c, f) => Object.assign(c, { fur: f });

function paintQuad(kind, k = 1) {
  const s = new Skin(64, 64, kind.length * 13, k, kind === 'sheep' ? 2 : kind === 'cow' ? 1 : 0);
  if (kind === 'pig') {
    const pink = [240, 165, 165];
    s.box(0, 0, 8, 8, 8, (f, x, y) => {
      if (f === 'front' && y === 3 && (x === 1 || x === 6)) return [255, 255, 255];
      if (f === 'front' && y === 3 && (x === 2 || x === 5)) return eye([30, 20, 20]);
      return s.vary(pink, 0.04);
    });
    s.box(16, 16, 4, 3, 1, (f, x, y) => (f === 'front' && y === 1 && (x === 0 || x === 3) ? [150, 80, 80] : s.vary([235, 140, 140], 0.04)));
    // manchas de terra no corpo (só aparecem bem no MAX)
    s.box(0, 32, 10, 8, 16, (f, x, y, fw, fh, fx, fy) => {
      const dirt = k > 1 && f !== 'top' && smoothNoise(f.length * 5, fx * 0.5, fy * 0.5) > 0.7 && fy > fh * 0.55;
      return s.vary(dirt ? [196, 140, 120] : pink, 0.05);
    });
    s.box(0, 16, 4, 6, 4, (f, x, y) => (y >= 5 || f === 'bottom' ? [150, 100, 90] : s.vary(pink, 0.05)));
    s.box(40, 0, 3, 2, 1, () => s.vary([232, 150, 150], 0.04));
    s.box(40, 20, 1, 3, 1, () => s.vary(pink, 0.04));
  } else if (kind === 'sheep') {
    const wool = [235, 235, 235];
    const face = [220, 190, 170];
    s.box(0, 0, 6, 6, 8, (f, x, y) => {
      if (f === 'front') {
        if (y === 2 && (x === 1 || x === 4)) return withFur(eye([30, 30, 30]), 0);
        if (y < 1) return s.vary(wool, 0.04);
        if (y === 4 && (x === 2 || x === 3)) return withFur([150, 110, 100], 0);
        return withFur(s.vary(face, 0.04), 1);
      }
      return s.vary(wool, 0.05);
    });
    s.box(0, 32, 8, 8, 16, () => s.vary(wool, 0.06));
    s.box(0, 16, 4, 12, 4, (f, x, y) => (y < 6 ? s.vary(wool, 0.05) : withFur(s.vary(y >= 11 ? [90, 80, 74] : face, 0.06), 1)));
    s.box(40, 0, 3, 2, 1, () => withFur(s.vary(face, 0.05), 1));
    s.box(48, 16, 2, 4, 2, () => s.vary(wool, 0.05));
  } else if (kind === 'cow') {
    const brown = [80, 56, 40];
    const white = [230, 230, 230];
    s.box(0, 0, 8, 8, 6, (f, x, y) => {
      if (f === 'front') {
        if (y === 3 && (x === 1 || x === 6)) return eye([20, 20, 20]);
        if (y >= 5 && x >= 2 && x <= 5) return y === 6 && (x === 2 || x === 5) ? withFur([60, 40, 40], 0) : withFur([200, 170, 160], 0);
        if (y < 2 && x > 2 && x < 6) return s.vary(white, 0.03);
      }
      return s.vary(brown, 0.06);
    });
    s.box(32, 0, 1, 3, 1, () => withFur([220, 210, 190], 0));
    // manchas: blocos no modo normal, formas orgânicas no MAX
    s.box(0, 32, 12, 10, 18, (f, x, y, fw, fh, fx, fy) => {
      const spot = k > 1
        ? smoothNoise(f.length * 7, fx * 0.24 + f.length, fy * 0.24) > 0.6
        : ((Math.floor(x / 4) * 7 + Math.floor(y / 4) * 3 + (f.length * 5)) % 5) === 0;
      return s.vary(spot ? white : brown, 0.05);
    });
    s.box(0, 16, 4, 12, 4, (f, x, y) => (y >= 10 ? withFur([40, 30, 25], 0) : s.vary(y < 5 ? brown : white, 0.05)));
    s.box(40, 0, 3, 2, 1, (f) => s.vary(f === 'front' ? [150, 110, 100] : brown, 0.05));
    s.box(40, 8, 1, 8, 1, () => s.vary(brown, 0.05));
    s.box(48, 8, 2, 2, 2, () => s.vary([40, 30, 24], 0.08));
  }
  return s.texture();
}

// ---------- geometria de caixa com UV de skin ----------
// rows = [y0, y1]: usa só uma faixa das laterais (para membros com articulação)
function skinBox(w, h, d, u, v, tw, th, inflate = 0, rows = null) {
  const y0 = rows ? rows[0] : 0, hh = rows ? rows[1] - rows[0] : h;
  const g = new THREE.BoxGeometry(w + inflate * 2, hh + inflate * 2, d + inflate * 2);
  const uv = g.attributes.uv;
  const rects = [
    [u + d + w, v + d + y0, d, hh], // +x (esquerda do personagem)
    [u, v + d + y0, d, hh], // -x (direita do personagem)
    [u + d, v, w, d], // topo
    [u + d + w, v, w, d], // base
    [u + d, v + d + y0, w, hh], // frente (+z)
    [u + d + w + d, v + d + y0, w, hh], // trás
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
function skinTexture(kind, k = 1) {
  const key = kind + '@' + k;
  if (!textures[key]) {
    if (kind === 'steve' || kind === 'zombie') textures[key] = paintHumanoid(kind, k);
    else if (kind === 'creeper') textures[key] = paintCreeper(k);
    else if (kind === 'skeleton') textures[key] = paintSkeleton(k);
    else if (kind === 'chicken') textures[key] = paintChicken(k);
    else if (kind === 'spider') textures[key] = paintSpider(k);
    else textures[key] = paintQuad(kind, k);
  }
  return textures[key];
}
export function playerSkin() {
  return skinTexture('steve');
}

// opções dos modelos conforme a qualidade gráfica
export function modelOptions(q) {
  const o = { articulated: !!(q && q.articulated), lit: !!(q && q.litModels), skin: (q && q.skinScale) || 1, max: !!(q && q.max) };
  o.key = `${o.articulated}|${o.lit}|${o.skin}|${o.max}`;
  return o;
}
const normOpts = (o) => (typeof o === 'object' && o ? o : modelOptions({ articulated: !!o }));

// ---------- material iluminado (MAX) ----------
// Os modelos recebem a mesma luz dos blocos: sol com sombras suaves, sombra das nuvens, luz azulada do céu,
// tochas, contorno de luz no pelo e a mesma névoa atmosférica.
const litVert = /* glsl */ `
  uniform vec3 uCamPos;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vDist;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorld = wp.xyz;
    vNormal = normalize(mat3(modelMatrix) * normal);
    vDist = length(wp.xyz - uCamPos);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }`;
const litFrag = /* glsl */ `
  uniform sampler2D uMap;
  uniform vec3 uTint;
  uniform float uFlash;
  uniform float uSkyL;
  uniform float uBlockL;
  uniform float uSkyDarken;
  uniform float uGamma;
  uniform float uSunAmount;
  uniform float uTime;
  uniform float uClipY;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uWet;
  uniform float uCloudCover;
  uniform vec3 uSunDir;
  uniform vec3 uSunColor;
  uniform vec3 uAmbColor;
  uniform vec3 uCamPos;
  uniform sampler2D uSkyTex;
  uniform vec2 uResolution;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vWorld;
  varying float vDist;
  ${SHADOW_GLSL}
  ${CLOUD_GLSL}
  float lb(float L) {
    float f = 1.0 - L / 15.0;
    float b = (1.0 - f) / (f * 3.0 + 1.0);
    return mix(b, sqrt(b), uGamma);
  }
  void main() {
    if (vWorld.y < uClipY) discard;
    vec4 tex = texture2D(uMap, vUv);
    if (tex.a < 0.5) discard;
    vec3 N = normalize(vNormal);
    float bs = lb(max(0.0, uSkyL - uSkyDarken));
    float bb = lb(uBlockL);
    float exposure = smoothstep(9.0, 14.25, uSkyL);
    float shadow = shadowAt(vWorld + N * 0.03, N);
    if (uSunDir.y > 0.05) {
      vec2 p = vWorld.xz + uSunDir.xz / uSunDir.y * (330.0 - vWorld.y);
      float c = cloudMap(p, uTime) - (1.0 - uCloudCover) * 0.95 + 0.28 - 0.45;
      shadow *= 1.0 - smoothstep(-0.06, 0.16, c) * 0.72;
    }
    float nl = dot(N, uSunDir);
    float wrap = nl * 0.5 + 0.5;
    float sunVis = shadow * exposure * uSunAmount;
    vec3 albedo = tex.rgb * uTint;
    vec3 ambient = uAmbColor * bs * (0.36 + 0.16 * N.y + 0.06 * wrap + 0.38 * (1.0 - uSunAmount));
    vec3 torch = bb * vec3(1.15, 0.78, 0.48) * 1.2;
    // o pelo espalha um pouco a luz para além do terminador
    vec3 direct = uSunColor * sunVis * max(nl * 0.88 + 0.12, 0.0);
    vec3 col = albedo * max(ambient + direct + torch, vec3(0.02));
    // contorno de luz nas bordas (pelo contra o sol)
    vec3 V = normalize(uCamPos - vWorld);
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    col += albedo * uSunColor * rim * sunVis * (0.2 + 0.8 * max(dot(-V, uSunDir), 0.0)) * 0.9;
    col += albedo * uAmbColor * rim * bs * 0.12;
    col += vec3(uFlash);
    // mesma névoa dos blocos: some na cor do céu atrás
    vec3 skyBehind = texture2D(uSkyTex, gl_FragCoord.xy / uResolution).rgb;
    float haze = 1.0 - exp(-vDist * (0.0035 + exp(-max(vWorld.y - 60.0, 0.0) * 0.05) * 0.004) * (1.0 + uWet * 3.0));
    float fog = max(smoothstep(uFogNear, uFogFar, vDist), haze * 0.85);
    if (uClipY > -1e8) fog = smoothstep(uFogNear, uFogFar, vDist);
    gl_FragColor = vec4(mix(col, skyBehind, fog), 1.0);
  }`;
function litMaterial(tex) {
  const m = new THREE.ShaderMaterial({
    uniforms: {
      ...U,
      uMap: { value: tex },
      uTint: { value: new THREE.Color(1, 1, 1) },
      uFlash: { value: 0 },
      uSkyL: { value: 15 },
      uBlockL: { value: 0 },
    },
    defines: { SHADOWS: '', PCF: 3 },
    vertexShader: litVert,
    fragmentShader: litFrag,
  });
  m.isLit = true;
  return m;
}

// ---------- modelo base ----------
class Model {
  constructor(tex, opts) {
    this.opts = opts || modelOptions(null);
    this.optKey = this.opts.key;
    this.root = new THREE.Group();
    this.inner = new THREE.Group();
    this.root.add(this.inner);
    this.mat = this.opts.lit ? litMaterial(tex) : new THREE.MeshBasicMaterial({ map: tex, alphaTest: 0.5 });
    this.mats = [this.mat];
  }
  // b: brilho (modelos simples); L: luz do bloco empacotada (céu << 4 | tocha) para os modelos iluminados
  setLight(b, hurt, flash = 0, L = -1) {
    for (const m of this.mats) {
      if (m.isLit) {
        if (L >= 0) {
          m.uniforms.uSkyL.value = L >> 4;
          m.uniforms.uBlockL.value = L & 15;
        }
        m.uniforms.uFlash.value = flash * 0.6;
        m.uniforms.uTint.value.setRGB(1, hurt ? 0.4 : 1, hurt ? 0.4 : 1);
        continue;
      }
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
  // articulated: braços e pernas com cotovelo e joelho (gráficos ULTRA)
  constructor(kind = 'steve', opts = false) {
    const o = normOpts(opts);
    super(skinTexture(kind, o.skin), o);
    this.kind = kind;
    const articulated = o.articulated;
    this.articulated = articulated;
    const S = 0.9375 / 16;
    this.inner.scale.setScalar(S);
    const m = this.mat;
    this.legsRoot = new THREE.Group();
    this.inner.add(this.legsRoot);
    this.upper = new THREE.Group();
    this.upper.position.set(0, 12, 0);
    this.inner.add(this.upper);
    const sk = kind === 'skeleton';
    const TH = sk ? 32 : 64; // altura da textura
    const lw = sk ? 2 : 4; // largura dos membros
    const UV = sk ? { ra: [40, 16], la: [40, 16], rl: [0, 16], ll: [0, 16] } : { ra: [40, 16], la: [32, 48], rl: [0, 16], ll: [16, 48] };
    const ax = 4 + lw / 2;
    this.body = limb(this.upper, skinBox(8, 12, 4, 16, 16, 64, TH), m, [0, 0, 0], [0, 6, 0]);
    this.head = limb(this.upper, skinBox(8, 8, 8, 0, 0, 64, TH), m, [0, 12, 0], [0, 4, 0]);
    this.hand = new THREE.Group();
    if (!articulated) {
      this.rightArm = limb(this.upper, skinBox(lw, 12, lw, ...UV.ra, 64, TH), m, [-ax, 10, 0], [0, -4, 0]);
      this.leftArm = limb(this.upper, skinBox(lw, 12, lw, ...UV.la, 64, TH), m, [ax, 10, 0], [0, -4, 0]);
      this.rightLeg = limb(this.legsRoot, skinBox(lw, 12, lw, ...UV.rl, 64, TH), m, [-2, 12, 0], [0, -6, 0]);
      this.leftLeg = limb(this.legsRoot, skinBox(lw, 12, lw, ...UV.ll, 64, TH), m, [2, 12, 0], [0, -6, 0]);
      this.hand.position.set(0, -9, 1);
      this.rightArm.add(this.hand);
    } else {
      // braço: ombro (6 px de cima) + antebraço; perna: coxa + canela
      const arm = (u, v, x) => {
        const up = limb(this.upper, skinBox(lw, 12, lw, u, v, 64, TH, 0, [0, 6]), m, [x, 10, 0], [0, -1, 0]);
        const low = limb(up, skinBox(lw, 12, lw, u, v, 64, TH, 0, [6, 12]), m, [0, -4, 0], [0, -3, 0]);
        return [up, low];
      };
      const leg = (u, v, x) => {
        const up = limb(this.legsRoot, skinBox(lw, 12, lw, u, v, 64, TH, 0, [0, 6]), m, [x, 12, 0], [0, -3, 0]);
        const low = limb(up, skinBox(lw, 12, lw, u, v, 64, TH, 0, [6, 12]), m, [0, -6, 0], [0, -3, 0]);
        return [up, low];
      };
      [this.rightArm, this.rightElbow] = arm(...UV.ra, -ax);
      [this.leftArm, this.leftElbow] = arm(...UV.la, ax);
      [this.rightLeg, this.rightKnee] = leg(...UV.rl, -2);
      [this.leftLeg, this.leftKnee] = leg(...UV.ll, 2);
      this.hand.position.set(0, -5, 1);
      this.rightElbow.add(this.hand);
    }
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
    if (st.aim) {
      // mirando com o arco: os dois braços para frente, seguindo o olhar
      this.rightArm.rotation.set(-Math.PI / 2 - st.headPitch, -0.1 + st.headYaw, 0);
      this.leftArm.rotation.set(-Math.PI / 2 - st.headPitch, 0.5 + st.headYaw, 0);
    }
    if (st.eating > 0) {
      this.rightArm.rotation.x = -1.2 + Math.abs(Math.sin(st.eating * 0.9)) * 0.25;
      this.rightArm.rotation.y = -0.4;
    } else if (!st.aim) this.rightArm.rotation.y = 0;
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
    if (this.articulated) this.animateRealistic(st, ls, amt, t);
  }

  // Caminhada mais natural: joelhos e cotovelos dobram, o tronco gira e o corpo sobe e desce a cada passo.
  animateRealistic(st, ph, amt, t) {
    const run = Math.min(1, amt * 1.15);
    const swingL = Math.cos(ph) * 0.85 * run, swingR = Math.cos(ph + Math.PI) * 0.85 * run;
    // pernas: a canela dobra enquanto a perna avança (fase de balanço)
    this.rightLeg.rotation.x = Math.cos(ph) * 0.8 * run;
    this.leftLeg.rotation.x = Math.cos(ph + Math.PI) * 0.8 * run;
    this.rightKnee.rotation.x = Math.max(0, Math.sin(ph)) * 1.25 * run + 0.04;
    this.leftKnee.rotation.x = Math.max(0, Math.sin(ph + Math.PI)) * 1.25 * run + 0.04;
    // braços balançam ao contrário das pernas, com o cotovelo levemente dobrado
    if (st.aim) {
      this.rightElbow.rotation.x = 0;
      this.leftElbow.rotation.x = -0.2;
    } else if (!st.zombieArms && !(st.eating > 0)) {
      const keepR = this.rightArm.rotation.x - Math.cos(ph + Math.PI) * amt;
      this.rightArm.rotation.x = keepR + swingL * 0.75;
      this.leftArm.rotation.x = this.leftArm.rotation.x - Math.cos(ph) * amt + swingR * 0.75;
      this.rightElbow.rotation.x = -(0.12 + 0.45 * run * (0.5 + 0.5 * Math.sin(ph + Math.PI)));
      this.leftElbow.rotation.x = -(0.12 + 0.45 * run * (0.5 + 0.5 * Math.sin(ph)));
      if (this.heldId) this.rightElbow.rotation.x = -0.35;
    } else {
      this.rightElbow.rotation.x = st.eating > 0 ? -1.1 : 0;
      this.leftElbow.rotation.x = 0;
    }
    if (st.swing > 0) this.rightElbow.rotation.x *= 1 - Math.sin(st.swing * Math.PI);
    // tronco: sobe e desce, gira os ombros e inclina para frente ao correr
    this.inner.position.y += Math.abs(Math.cos(ph)) * 0.055 * run - 0.02 * run;
    this.upper.rotation.y = Math.cos(ph) * 0.14 * run;
    this.head.rotation.y -= this.upper.rotation.y * 0.8;
    this.head.rotation.x += Math.sin(ph * 2) * 0.03 * run;
    if (!st.sneak) this.upper.rotation.x = 0.07 * run;
    // respiração
    const breath = Math.sin(t * 0.08);
    this.body.scale.set(1 + breath * 0.012, 1, 1 + breath * 0.03);
    this.head.position.y = 12 + breath * 0.15;
    // agachado: dobra os joelhos em vez de só recuar as pernas
    if (st.sneak) {
      this.legsRoot.position.z = 0;
      this.rightLeg.rotation.x -= 0.55;
      this.leftLeg.rotation.x -= 0.55;
      this.rightKnee.rotation.x += 0.9;
      this.leftKnee.rotation.x += 0.9;
      this.inner.position.y = -0.2;
      this.upper.position.z = 1.5;
    } else this.upper.position.z = 0;
    // morte: os joelhos cedem
    if (st.death) {
      const k = Math.min(1, st.death / 20);
      this.rightKnee.rotation.x += k * 0.8;
      this.leftKnee.rotation.x += k * 0.6;
    }
  }
}

export class CreeperModel extends Model {
  constructor(opts = false) {
    const o = normOpts(opts);
    super(skinTexture('creeper', o.skin), o);
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
  // MAX: patas com joelho/jarrete, orelhas, cauda, respiração, pastar e espantar moscas com o rabo
  constructor(kind, opts = false) {
    const o = normOpts(opts);
    super(skinTexture(kind, o.skin), o);
    this.kind = kind;
    this.realistic = o.articulated;
    this.full = o.max;
    this.inner.scale.setScalar(1 / 16);
    const m = this.mat;
    this.legs = [];
    this.knees = [];
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
    if (this.full) {
      // perna em dois pedaços: dobra no joelho (frente) e no jarrete (trás)
      const h2 = legH / 2;
      const up = skinBox(4, legH, 4, 0, 16, 64, 64, 0, [0, h2]);
      const low = skinBox(4, legH, 4, 0, 16, 64, 64, -0.05, [h2, legH]);
      for (const [x, z] of legPos) {
        const hip = limb(this.inner, up, m, [x, legH, z], [0, -h2 / 2, 0]);
        this.legs.push(hip);
        this.knees.push(limb(hip, low, m, [0, -h2, 0], [0, -h2 / 2 + 0.15, 0]));
      }
    } else {
      const legGeo = skinBox(4, legH, 4, 0, 16, 64, 64);
      for (const [x, z] of legPos) this.legs.push(limb(this.inner, legGeo, m, [x, legH, z], [0, -legH / 2, 0]));
    }
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
    this.ears = [];
    this.tail = null;
    if (this.full) {
      const earGeo = skinBox(3, 2, 1, 40, 0, 64, 64);
      // orelhas: de lado (vaca, ovelha) ou caídas para frente (porco)
      for (const side of [-1, 1]) {
        let ear;
        if (kind === 'pig') {
          ear = limb(this.head, earGeo, m, [side * 2.5, 4, 4.5], [0, 1, 0]);
          ear.userData.base = [0.9, 0, side * -0.2];
        } else {
          const at = kind === 'cow' ? [side * 4, 2, 2.5] : [side * 3, 2.5, 3.5];
          ear = limb(this.head, earGeo, m, at, [side * 1.5, 0, 0]);
          ear.userData.base = [0, 0, side * -0.35];
        }
        ear.userData.side = side;
        this.ears.push(ear);
      }
      // cauda presa no alto da traseira
      const back = kind === 'cow' ? -9 : kind === 'pig' ? -8 : -9.5;
      const top = bodyY + (kind === 'cow' ? 4.5 : kind === 'pig' ? 3 : 4);
      if (kind === 'cow') {
        this.tail = limb(this.inner, skinBox(1, 8, 1, 40, 8, 64, 64), m, [0, top, back - 0.2], [0, -4, 0]);
        const tuft = new THREE.Mesh(skinBox(2, 2, 2, 48, 8, 64, 64), m);
        tuft.position.set(0, -8.6, 0);
        this.tail.add(tuft);
        this.tail.userData.base = 0.12;
      } else if (kind === 'pig') {
        this.tail = limb(this.inner, skinBox(1, 3, 1, 40, 20, 64, 64), m, [0, top, back - 0.2], [0, 1.5, 0]);
        this.tail.userData.base = -0.9;
      } else {
        this.tail = limb(this.inner, skinBox(2, 4, 2, 48, 16, 64, 64), m, [0, top, back], [0, -2, 0]);
        this.tail.userData.base = 0.35;
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
    if (this.realistic || this.full) {
      // passo com peso: o corpo sobe e desce e a cabeça acompanha
      for (const l of this.legs) l.rotation.x *= 0.7;
      this.inner.position.y = Math.abs(Math.sin(ls)) * 0.035 * amt;
      this.body.rotation.z = Math.sin(ls) * 0.04 * amt;
      this.head.rotation.x += Math.sin(ls * 2) * 0.06 * amt + Math.sin(st.age * 0.05) * 0.02;
    }
    if (this.full) this.animateFull(st, ls, amt);
  }
  animateFull(st, ls, amt) {
    const t = st.age;
    const ph = [ls, ls + Math.PI, ls + Math.PI, ls];
    for (let i = 0; i < 4; i++) {
      // a pata dobra enquanto avança no ar; a da frente dobra para trás, a de trás para frente
      const lift = Math.max(0, Math.sin(ph[i])) * amt;
      this.knees[i].rotation.x = (i < 2 ? 1.0 : -0.85) * lift;
      this.legs[i].rotation.x -= (i < 2 ? 0.25 : -0.2) * lift;
    }
    // respiração
    const br = Math.sin(t * 0.07);
    this.body.scale.set(1 + br * 0.018, 1 + br * 0.012, 1);
    // pastando, a cabeça mastiga devagar
    if (st.eatGrass > 0) this.head.rotation.x += Math.sin(t * 0.9) * 0.08 * st.eatGrass;
    // orelhas: sacudidas curtas de vez em quando
    const twitch = Math.max(0, Math.sin(t * 0.031 + this.kind.length) - 0.93) * 14;
    for (const e of this.ears) {
      const [bx, by, bz] = e.userData.base;
      e.rotation.set(bx + Math.sin(t * 0.8) * twitch * 0.15, by + Math.sin(t * 1.1) * twitch * 0.35 * e.userData.side, bz + Math.sin(ls * 2) * 0.08 * amt);
    }
    // cauda: balança espantando moscas, com chicotadas rápidas de vez em quando
    if (this.tail) {
      const flick = Math.max(0, Math.sin(t * 0.023 + 1.3) - 0.85) * 6;
      const sway = Math.sin(t * 0.06) * 0.18 + Math.sin(t * 0.37) * flick * 0.5;
      this.tail.rotation.set(this.tail.userData.base + amt * 0.25, 0, sway + Math.sin(ls) * 0.15 * amt);
      if (this.kind === 'pig') this.tail.rotation.y = Math.sin(t * 0.2) * 0.4;
    }
  }
}

export class ChickenModel extends Model {
  constructor(opts = false) {
    const o = normOpts(opts);
    super(skinTexture('chicken', o.skin), o);
    this.realistic = o.articulated;
    this.full = o.max;
    this.inner.scale.setScalar(1 / 16);
    const m = this.mat;
    this.legs = [-1.5, 1.5].map((x) => limb(this.inner, skinBox(3, 5, 3, 26, 0, 64, 32), m, [x, 5, 0.5], [0, -2.5, 0]));
    this.body = limb(this.inner, skinBox(6, 6, 8, 0, 9, 64, 32), m, [0, 8, 0], [0, 0, 0]);
    this.head = limb(this.inner, skinBox(4, 6, 3, 0, 0, 64, 32), m, [0, 10, 4], [0, 3, 0.5]);
    const beak = new THREE.Mesh(skinBox(4, 2, 2, 14, 0, 64, 32), m);
    beak.position.set(0, 3.5, 3);
    this.head.add(beak);
    const wattle = new THREE.Mesh(skinBox(2, 2, 2, 14, 4, 64, 32), m);
    wattle.position.set(0, 1.5, 2.5);
    this.head.add(wattle);
    this.wings = [-3.5, 3.5].map((x) => limb(this.inner, skinBox(1, 4, 6, 24, 13, 64, 32), m, [x, 10, 0], [0, -2, 0]));
    if (this.full) this.tail = limb(this.inner, skinBox(4, 4, 1, 40, 0, 64, 32), m, [0, 10, -4], [0, 1.5, -0.5]);
  }
  animate(st) {
    const ls = st.limbSwing * 0.6662, amt = Math.min(1, st.limbAmount);
    this.head.rotation.set(-st.headPitch + (this.realistic ? Math.sin(ls * 2) * 0.15 * amt : 0), st.headYaw, 0);
    this.legs[0].rotation.x = Math.cos(ls) * 1.4 * amt;
    this.legs[1].rotation.x = Math.cos(ls + Math.PI) * 1.4 * amt;
    const flap = st.flap ? Math.sin(st.age * 1.6) * 0.9 + 0.9 : 0;
    this.wings[0].rotation.z = flap;
    this.wings[1].rotation.z = -flap;
    this.root.rotation.z = st.death ? Math.min(1, st.death / 20) ** 0.6 * (Math.PI / 2) : 0;
    if (this.full) {
      const t = st.age;
      // a galinha "trava" a cabeça e depois a joga para frente a cada passo
      const u = ((ls / Math.PI) % 1 + 1) % 1;
      this.head.position.z = 4 + (u < 0.75 ? 0.5 - u / 0.75 : (u - 0.75) / 0.25 - 0.5) * 0.9 * amt;
      this.head.rotation.x = -st.headPitch;
      // bicando o chão
      if (st.eatGrass > 0) this.head.rotation.x += st.eatGrass * (1.0 + Math.abs(Math.sin(t * 0.8)) * 0.6);
      // asas quietas respiram, a cauda balança
      if (!st.flap) {
        this.wings[0].rotation.z = 0.04 + Math.sin(t * 0.1) * 0.03;
        this.wings[1].rotation.z = -this.wings[0].rotation.z;
      }
      this.tail.rotation.set(-0.5 + Math.sin(ls * 2) * 0.1 * amt, Math.sin(t * 0.13) * 0.12, 0);
      this.body.rotation.x = -0.05 + Math.sin(ls * 2) * 0.04 * amt;
    }
  }
}

export class SpiderModel extends Model {
  constructor(opts = false) {
    const o = normOpts(opts);
    super(skinTexture('spider', o.skin), o);
    this.realistic = o.articulated;
    this.inner.scale.setScalar(1 / 16);
    const m = this.mat;
    this.thorax = limb(this.inner, skinBox(6, 6, 6, 0, 0, 64, 64), m, [0, 9, 0], [0, 0, 0]);
    this.head = limb(this.inner, skinBox(8, 8, 8, 32, 4, 64, 64), m, [0, 9, 3], [0, 0, 4]);
    this.abdomen = limb(this.inner, skinBox(10, 8, 12, 0, 32, 64, 64), m, [0, 9, -3], [0, 1, -6]);
    this.legs = [];
    for (let i = 0; i < 8; i++) {
      const side = i % 2 ? 1 : -1;
      const row = Math.floor(i / 2);
      const g = limb(this.inner, skinBox(16, 2, 2, 0, 20, 64, 64), m, [side * 3, 9, 2 - row * 1.5], [side * 8, 0, 0]);
      g.userData = { side, row };
      this.legs.push(g);
    }
  }
  animate(st) {
    const ls = st.limbSwing * 0.6662, amt = Math.min(1, st.limbAmount);
    this.head.rotation.set(-st.headPitch, st.headYaw, 0);
    for (const g of this.legs) {
      const { side, row } = g.userData;
      const spread = [0.75, 0.3, -0.3, -0.75][row];
      const ph = row % 2 === (side > 0 ? 0 : 1) ? 0 : Math.PI;
      g.rotation.set(0, side * spread + Math.cos(ls * 2 + ph) * 0.4 * amt, side * (0.6 - Math.abs(Math.sin(ls + ph)) * 0.4 * amt), 'YZX');
    }
    if (this.realistic) this.abdomen.rotation.x = Math.sin(st.age * 0.15) * 0.04 + Math.sin(ls * 2) * 0.05 * amt;
    this.root.rotation.z = st.death ? Math.min(1, st.death / 20) ** 0.6 * Math.PI : 0;
  }
}

// flecha: haste + penas (modelo pequeno, alinhado com a velocidade)
export function arrowMesh() {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.55), new THREE.MeshBasicMaterial({ color: 0x8a6a40 }));
  const tip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.07, 0.09), new THREE.MeshBasicMaterial({ color: 0x9a9a9a }));
  tip.position.z = 0.3;
  const f1 = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 0.14), new THREE.MeshBasicMaterial({ color: 0xeeeeee }));
  f1.position.z = -0.22;
  const f2 = f1.clone();
  f2.rotation.z = Math.PI / 2;
  g.add(shaft, tip, f1, f2);
  g.userData.mats = [shaft.material, tip.material, f1.material];
  g.userData.base = [new THREE.Color(0x8a6a40), new THREE.Color(0x9a9a9a), new THREE.Color(0xeeeeee)];
  return g;
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
  return { img: { data: tileImageData(name) } };
}

// Malha 3D de um item (bloco = cubo; resto = sprite extrudado). Material próprio para receber a luz.
export function heldItemMesh(id) {
  let mesh;
  if (id < 256) {
    const b = BLOCKS[id];
    if (['cube', 'liquid', 'slab', 'fence', 'layer', 'bed'].includes(b.render)) {
      const mat = new THREE.ShaderMaterial({
        uniforms: { uAtlas: { value: getAtlasTexture() }, uBright: { value: 1 }, uTint: { value: new THREE.Color(1, 1, 1) } },
        vertexShader: `attribute vec4 aLight; attribute vec3 aTint; varying vec2 vUv; varying float vS; varying vec3 vT;
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
      it.scale.setScalar(it.userData.flat ? 0.45 : this.heldId === 275 ? 0.42 : 0.55);
      it.position.set(0, 0.05, 0);
      it.rotation.order = 'YXZ';
      it.rotation.set(0, 1.86, 0.15);
    }
    // arco sendo puxado: vai para o centro, fica de pé e treme quando está no máximo
    if (st.bowPull > 0 && this.heldId === 275) {
      const k = st.bowPull;
      const shake = k >= 1 ? Math.sin(performance.now() * 0.06) * 0.006 : 0;
      g.position.set(0.3 - k * 0.08, -0.28 + shake, -0.68 + k * 0.12);
      g.rotation.set(0, 0, 0);
      it.rotation.order = 'XYZ';
      it.rotation.set(0, -0.45, Math.PI / 4 + 0.08);
      it.scale.setScalar(0.5);
    }
  }
}

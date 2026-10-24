// Texturas geradas do zero em <canvas>: pele de dinossauro (escamas + padrões),
// mapas normais, terreno, casca, folhagem, água e olhos. Nenhuma imagem externa.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, makeTileNoise, makeTileWorley, tileFbm, hash2, TAU } from './util.js';

let SIZE = 512;
export function setTextureSize(s) {
  SIZE = s;
}

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c, { srgb = true, repeat = true, aniso = 4 } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// Mapa normal a partir de um campo de altura periódico (diferenças centrais).
function normalFromHeight(hgt, w, h, strength) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    const yu = ((y - 1 + h) % h) * w;
    const yd = ((y + 1) % h) * w;
    for (let x = 0; x < w; x++) {
      const xl = (x - 1 + w) % w;
      const xr = (x + 1) % w;
      const dx = (hgt[y * w + xr] - hgt[y * w + xl]) * strength;
      const dy = (hgt[yd + x] - hgt[yu + x]) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * w + x) * 4;
      d[i] = (-dx / len * 0.5 + 0.5) * 255;
      d[i + 1] = (dy / len * 0.5 + 0.5) * 255;
      d[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, { srgb: false });
}

function writePixels(w, h, fn) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const col = fn(x, y);
      const i = (y * w + x) * 4;
      d[i] = clamp(col[0], 0, 1) * 255;
      d[i + 1] = clamp(col[1], 0, 1) * 255;
      d[i + 2] = clamp(col[2], 0, 1) * 255;
      d[i + 3] = col.length > 3 ? clamp(col[3], 0, 1) * 255 : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------------------
// Pele de dinossauro. u = volta em torno do corpo (0 = barriga, 0.5 = dorso),
// v = comprimento. A textura já traz a contra-sombra (barriga clara) e o padrão.
// ---------------------------------------------------------------------------
export function makeSkin(skin, seed = 1) {
  const w = SIZE;
  const h = SIZE;
  const noise = makeTileNoise(seed);
  const scalesA = makeTileWorley(seed + 11, 64, 64); // escamas pequenas
  const scalesB = makeTileWorley(seed + 23, 22, 22); // escamas grandes do dorso
  const spots = makeTileWorley(seed + 37, 7, 9, 0.9);
  const base = hex(skin.base);
  const dark = hex(skin.dark);
  const belly = hex(skin.belly);
  const accent = hex(skin.accent ?? skin.dark);
  const hgt = new Float32Array(w * h);
  const stripes = skin.stripes ?? 8;

  const c = writePixels(w, h, (x, y) => {
    const u = x / w;
    const v = y / h;
    const dorsal = 0.5 - 0.5 * Math.cos(TAU * u); // 0 barriga → 1 dorso
    const n1 = tileFbm(noise, u, v, 4, 4);
    const n2 = tileFbm(noise, u + 0.37, v + 0.71, 16, 3);

    // contra-sombra: barriga clara, dorso com a cor base
    let col = mix3(belly, base, smoothstep(0.18, 0.62, dorsal + n1 * 0.12));

    // padrão da espécie (só no dorso e laterais)
    const patMask = smoothstep(0.3, 0.65, dorsal + n1 * 0.15);
    let pat = 0;
    if (skin.pattern === 'stripes' || skin.pattern === 'tiger') {
      const warp = n1 * 0.9 + n2 * 0.15;
      const s = Math.sin(TAU * (v * stripes + warp) + Math.cos(TAU * u) * 0.6);
      pat = smoothstep(skin.pattern === 'tiger' ? 0.35 : 0.55, 0.85, s);
    } else if (skin.pattern === 'spots') {
      const wv = spots(u, v);
      pat = 1 - smoothstep(0.18, 0.3, wv.f1 + n2 * 0.08);
    } else if (skin.pattern === 'mottled') {
      pat = smoothstep(0.05, 0.25, tileFbm(noise, u + 0.5, v, 8, 4));
    } else if (skin.pattern === 'bands') {
      const s = Math.sin(TAU * (v * stripes + n1 * 0.4));
      pat = smoothstep(0.2, 0.6, s) * smoothstep(0.55, 0.8, dorsal);
    }
    col = mix3(col, dark, pat * patMask * (skin.patternStrength ?? 0.85));

    // faixa de cor de destaque ao longo da espinha
    if (skin.accent) {
      const ridge = smoothstep(0.86, 0.98, dorsal + n2 * 0.04);
      col = mix3(col, accent, ridge * 0.8);
    }

    // escamas: pequenas na barriga, grandes no dorso
    const a = scalesA(u, v);
    const edgeA = smoothstep(0.0, 0.12, a.f2 - a.f1);
    const b = scalesB(u, v);
    const edgeB = smoothstep(0.0, 0.1, b.f2 - b.f1);
    const big = smoothstep(0.55, 0.85, dorsal);
    const bumpA = edgeA * (1 - a.f1 * 0.8);
    const bumpB = edgeB * (1 - b.f1 * 0.7);
    const bump = lerp(bumpA, Math.max(bumpA * 0.5, bumpB), big);
    hgt[y * w + x] = bump + n2 * 0.25;
    const cellVar = (hash2(a.id, 3, seed) - 0.5) * 0.16 + (hash2(b.id, 7, seed) - 0.5) * 0.12 * big;
    const shade = 0.72 + 0.28 * lerp(edgeA, edgeB, big) + cellVar + n2 * 0.06;
    return [col[0] * shade, col[1] * shade, col[2] * shade];
  });

  return { map: toTexture(c), normalMap: normalFromHeight(hgt, w, h, 2.2) };
}

// Olho: íris colorida com pupila em fenda. Mapeado pela face frontal da esfera.
export function makeEye(irisHex, seed = 3) {
  const s = 128;
  const iris = hex(irisHex);
  const c = writePixels(s, s, (x, y) => {
    const dx = (x + 0.5) / s - 0.5;
    const dy = (y + 0.5) / s - 0.5;
    const r = Math.sqrt(dx * dx + dy * dy) * 2;
    const ang = Math.atan2(dy, dx);
    const streak = 0.85 + 0.15 * Math.sin(ang * 23 + hash2(Math.floor(ang * 10), 1, seed) * 6);
    let col = mix3(iris, [iris[0] * 0.35, iris[1] * 0.3, iris[2] * 0.2], smoothstep(0.2, 0.62, r));
    col = col.map((cc) => cc * streak);
    const slit = Math.abs(dx) / 0.07 + Math.abs(dy) / 0.42;
    col = mix3([0.02, 0.02, 0.02], col, smoothstep(0.85, 1.05, slit));
    col = mix3(col, [0.05, 0.04, 0.03], smoothstep(0.62, 0.72, r));
    const hl = Math.hypot(dx + 0.12, dy + 0.14);
    col = mix3(col, [1, 1, 1], (1 - smoothstep(0.02, 0.06, hl)) * 0.9);
    return col;
  });
  return toTexture(c, { repeat: false });
}

// Marfim para dentes, garras e chifres (com veios).
export function makeIvory(seed = 5) {
  const s = 128;
  const noise = makeTileNoise(seed);
  const c = writePixels(s, s, (x, y) => {
    const u = x / s;
    const v = y / s;
    const n = tileFbm(noise, u, v * 0.25, 4, 3);
    const g = 0.78 + n * 0.12 + Math.sin(v * 40 + n * 6) * 0.03;
    const tip = v;
    return mix3([0.85 * g, 0.8 * g, 0.66 * g], [0.32, 0.27, 0.22], smoothstep(0.55, 1, tip) * 0.6);
  });
  return toTexture(c);
}

// ---------------------------------------------------------------------------
// Terreno
// ---------------------------------------------------------------------------
export function makeTerrainSet(seed = 100) {
  const w = SIZE;
  const noise = makeTileNoise(seed);
  const cells = makeTileWorley(seed + 5, 18, 18);
  const pebbles = makeTileWorley(seed + 9, 40, 40);

  const grassH = new Float32Array(w * w);
  const grass = writePixels(w, w, (x, y) => {
    const u = x / w;
    const v = y / w;
    const n = tileFbm(noise, u, v, 4, 5);
    const blades = tileFbm(noise, u * 1.0 + 0.3, v * 1.0, 64, 2);
    const fine = noise(u * 128, v * 32, 128, 32);
    grassH[y * w + x] = blades * 0.6 + fine * 0.4;
    const g = mix3([0.24, 0.38, 0.12], [0.42, 0.52, 0.2], smoothstep(-0.4, 0.5, n));
    const dry = smoothstep(0.25, 0.6, tileFbm(noise, u + 0.4, v + 0.2, 3, 3));
    const col = mix3(g, [0.46, 0.43, 0.22], dry * 0.55);
    const s = 0.8 + blades * 0.25 + fine * 0.12;
    return [col[0] * s, col[1] * s, col[2] * s];
  });

  const dirtH = new Float32Array(w * w);
  const dirt = writePixels(w, w, (x, y) => {
    const u = x / w;
    const v = y / w;
    const n = tileFbm(noise, u + 0.2, v + 0.5, 6, 5);
    const p = pebbles(u, v);
    const peb = (1 - smoothstep(0.1, 0.35, p.f1)) * (hash2(p.id, 1, seed) > 0.55 ? 1 : 0);
    dirtH[y * w + x] = n * 0.5 + peb * 0.8;
    const col = mix3([0.27, 0.2, 0.13], [0.42, 0.33, 0.22], smoothstep(-0.5, 0.5, n));
    const pc = mix3(col, [0.5, 0.47, 0.42], peb * 0.7);
    const s = 0.85 + n * 0.2;
    return [pc[0] * s, pc[1] * s, pc[2] * s];
  });

  const sandH = new Float32Array(w * w);
  const sand = writePixels(w, w, (x, y) => {
    const u = x / w;
    const v = y / w;
    const n = tileFbm(noise, u + 0.7, v + 0.1, 8, 4);
    const ripple = Math.sin(TAU * (v * 14 + n * 1.5));
    const grain = hash2(x, y, seed) - 0.5;
    sandH[y * w + x] = ripple * 0.3 + n * 0.3;
    const col = mix3([0.55, 0.49, 0.36], [0.68, 0.61, 0.46], smoothstep(-0.5, 0.6, n + ripple * 0.15));
    const s = 0.92 + grain * 0.12;
    return [col[0] * s, col[1] * s, col[2] * s];
  });

  const rockH = new Float32Array(w * w);
  const rock = writePixels(w, w, (x, y) => {
    const u = x / w;
    const v = y / w;
    const n = tileFbm(noise, u + 0.11, v + 0.83, 4, 6);
    const c = cells(u, v);
    const crack = (1 - smoothstep(0.0, 0.025, c.f2 - c.f1)) * smoothstep(-0.2, 0.3, n);
    const strata = Math.sin(TAU * (v * 6 + n * 0.8)) * 0.5 + 0.5;
    rockH[y * w + x] = n * 0.8 - crack * 0.6 + strata * 0.2;
    const tone = (hash2(c.id, 2, seed) - 0.5) * 0.1;
    const col = mix3([0.33, 0.31, 0.29], [0.55, 0.52, 0.47], smoothstep(-0.6, 0.6, n) + tone);
    const s = (1 - crack * 0.35) * (0.85 + strata * 0.15);
    return [col[0] * s, col[1] * s + 0.01, col[2] * s];
  });

  return {
    grass: toTexture(grass, { aniso: 8 }),
    grassN: normalFromHeight(grassH, w, w, 1.2),
    dirt: toTexture(dirt, { aniso: 8 }),
    dirtN: normalFromHeight(dirtH, w, w, 1.6),
    sand: toTexture(sand, { aniso: 8 }),
    sandN: normalFromHeight(sandH, w, w, 1.0),
    rock: toTexture(rock, { aniso: 8 }),
    rockN: normalFromHeight(rockH, w, w, 2.5),
  };
}

// ---------------------------------------------------------------------------
// Vegetação
// ---------------------------------------------------------------------------
export function makeBark(seed = 200, tint = [0.36, 0.27, 0.19]) {
  const w = 256;
  const noise = makeTileNoise(seed);
  const hgt = new Float32Array(w * w);
  const c = writePixels(w, w, (x, y) => {
    const u = x / w;
    const v = y / w;
    const n = tileFbm(noise, u, v, 4, 4);
    const ridges = Math.abs(noise(u * 12 + n * 1.5, v * 3, 12, 3));
    const fiss = smoothstep(0.0, 0.25, ridges);
    hgt[y * w + x] = fiss + n * 0.3;
    const s = 0.45 + fiss * 0.6 + n * 0.15;
    return [tint[0] * s, tint[1] * s, tint[2] * s];
  });
  return { map: toTexture(c), normalMap: normalFromHeight(hgt, w, w, 2.5) };
}

// Agulhas de conífera / folhagem densa (sem transparência, para cones de copa).
export function makeFoliage(seed = 300, dark = [0.07, 0.17, 0.08], light = [0.2, 0.35, 0.12]) {
  const w = 256;
  const noise = makeTileNoise(seed);
  const leaves = makeTileWorley(seed + 1, 26, 26);
  const hgt = new Float32Array(w * w);
  const c = writePixels(w, w, (x, y) => {
    const u = x / w;
    const v = y / w;
    const l = leaves(u, v);
    const n = tileFbm(noise, u, v, 4, 4);
    const leaf = 1 - smoothstep(0.15, 0.55, l.f1);
    hgt[y * w + x] = leaf;
    const t = clamp(leaf * 0.8 + n * 0.3 + (hash2(l.id, 4, seed) - 0.5) * 0.3, 0, 1);
    const col = mix3(dark, light, t);
    const s = 0.55 + leaf * 0.55;
    return [col[0] * s, col[1] * s, col[2] * s];
  });
  return { map: toTexture(c), normalMap: normalFromHeight(hgt, w, w, 2.0) };
}

// Folha de samambaia/palmeira com transparência (alphaTest).
export function makeFrond(seed = 400, col1 = [0.12, 0.3, 0.08], col2 = [0.3, 0.48, 0.15]) {
  const w = 256;
  const h = 512;
  const noise = makeTileNoise(seed);
  const c = writePixels(w, h, (x, y) => {
    const u = x / w - 0.5;
    const v = 1 - y / h; // 0 base → 1 ponta (a textura é invertida no upload)
    const halfW = 0.5 * Math.sin(Math.PI * clamp(v * 1.05, 0, 1)) * (1 - v * 0.35);
    const rach = Math.abs(u) < 0.012 + (1 - v) * 0.01;
    // folíolos em diagonal
    const k = (v * 34 + Math.abs(u) * 18) % 1;
    const leafletEdge = Math.abs(u) / Math.max(halfW, 1e-3);
    const inLeaflet = k > 0.12 && leafletEdge < 1 - Math.pow(Math.abs(k - 0.56) * 2, 2) * 0.35;
    const a = rach || (inLeaflet && leafletEdge < 1) ? 1 : 0;
    const n = noise(u * 8, v * 8, 8, 8);
    const col = mix3(col1, col2, clamp(0.5 + n * 0.5 + (1 - leafletEdge) * 0.3, 0, 1));
    if (rach) return [0.22, 0.26, 0.1, 1];
    return [col[0], col[1], col[2], a];
  });
  const t = toTexture(c, { repeat: false });
  return t;
}

// Arbusto com frutinhas (comida dos herbívoros).
export function makeBerryBush(seed = 500) {
  const w = 256;
  const noise = makeTileNoise(seed);
  const leaves = makeTileWorley(seed + 2, 20, 20);
  const berries = makeTileWorley(seed + 3, 12, 12);
  const hgt = new Float32Array(w * w);
  const c = writePixels(w, w, (x, y) => {
    const u = x / w;
    const v = y / w;
    const l = leaves(u, v);
    const b = berries(u, v);
    const n = tileFbm(noise, u, v, 4, 3);
    const leaf = 1 - smoothstep(0.2, 0.6, l.f1);
    const isBerry = b.f1 < 0.16 && hash2(b.id, 9, seed) > 0.35;
    hgt[y * w + x] = isBerry ? 1.2 - b.f1 * 3 : leaf;
    if (isBerry) {
      const s = 1 - b.f1 * 3;
      return [0.65 * s + 0.15, 0.08 * s, 0.12 * s + 0.05];
    }
    const col = mix3([0.08, 0.2, 0.06], [0.24, 0.42, 0.12], clamp(leaf * 0.7 + n * 0.4, 0, 1));
    const s = 0.55 + leaf * 0.5;
    return [col[0] * s, col[1] * s, col[2] * s];
  });
  return { map: toTexture(c), normalMap: normalFromHeight(hgt, w, w, 2.0) };
}

// Mapa normal ondulado para a água.
export function makeWaterNormal(seed = 600) {
  const w = 256;
  const noise = makeTileNoise(seed);
  const hgt = new Float32Array(w * w);
  for (let y = 0; y < w; y++) {
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const v = y / w;
      hgt[y * w + x] = tileFbm(noise, u, v, 6, 4) + 0.3 * Math.sin(TAU * (u * 3 + v * 2));
    }
  }
  return normalFromHeight(hgt, w, w, 3.0);
}

// Sangue / respingos e mancha da carcaça.
export function makeMeat(seed = 700) {
  const w = 128;
  const noise = makeTileNoise(seed);
  const c = writePixels(w, w, (x, y) => {
    const u = x / w;
    const v = y / w;
    const n = tileFbm(noise, u, v, 4, 4);
    const fat = smoothstep(0.2, 0.45, tileFbm(noise, u + 0.3, v, 8, 3));
    const col = mix3([0.35, 0.04, 0.04], [0.6, 0.12, 0.1], 0.5 + n);
    return mix3(col, [0.85, 0.75, 0.62], fat * 0.6);
  });
  return toTexture(c);
}

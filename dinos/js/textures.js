// Texturas geradas do zero em <canvas>: pele de dinossauro (escamas + padrões),
// mapas normais, terreno, casca, folhagem, água e olhos. Nenhuma imagem externa.
import * as THREE from 'three';
import { clamp, lerp, smoothstep, makeTileNoise, makeTileWorley, tileFbm, hash2, TAU } from './util.js';
import { genSkin, dome } from './skingen.js';

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
// Pele de dinossauro: gerada em js/skingen.js (em paralelo nos Web Workers).
// ---------------------------------------------------------------------------
function dataTexture(arr, w, srgb) {
  const t = new THREE.DataTexture(arr, w, w, THREE.RGBAFormat);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

export function skinFromData(r) {
  return {
    map: dataTexture(r.color, r.w, true),
    normalMap: dataTexture(r.normal, r.w, false),
    roughnessMap: dataTexture(r.rough, r.w, false),
  };
}

export function makeSkin(skin, seed = 1, limb = false) {
  return skinFromData(genSkin({ skin, seed, limb, size: SIZE }));
}

// Gera várias peles em paralelo; cai para a thread principal se não houver workers.
export async function makeSkinsParallel(jobs, onProgress = () => {}) {
  const sized = jobs.map((j) => ({ ...j, size: SIZE }));
  const results = new Array(sized.length);
  let done = 0;
  const finish = (i, r) => {
    results[i] = r;
    onProgress(++done / sized.length);
  };
  let workers = [];
  try {
    const n = Math.max(1, Math.min(4, (navigator.hardwareConcurrency || 2) - 1, sized.length));
    for (let k = 0; k < n; k++) workers.push(new Worker(new URL('./texworker.js', import.meta.url), { type: 'module' }));
  } catch (e) {
    workers = [];
  }
  if (workers.length) {
    let next = 0;
    try {
      await Promise.all(
        workers.map(
          (wk) =>
            new Promise((resolve, reject) => {
              wk.onerror = (e) => reject(e);
              const send = () => {
                if (next >= sized.length) return resolve();
                const i = next++;
                wk.onmessage = (e) => {
                  finish(i, e.data);
                  send();
                };
                wk.postMessage(sized[i]);
              };
              send();
            }),
        ),
      );
    } catch (e) {
      // algum worker falhou: o que faltar é feito aqui mesmo
    }
    workers.forEach((wk) => wk.terminate());
  }
  for (let i = 0; i < sized.length; i++) {
    if (results[i]) continue;
    finish(i, genSkin(sized[i]));
    await new Promise((r) => setTimeout(r, 0));
  }
  return results;
}

// Microdetalhe (poros e escamas minúsculas) repetido por cima do mapa normal.
export function makeDetailNormal(seed = 9) {
  const s = 256;
  const noise = makeTileNoise(seed);
  const cells = makeTileWorley(seed + 1, 22, 22);
  const hgt = new Float32Array(s * s);
  for (let y = 0; y < s; y++) {
    for (let x = 0; x < s; x++) {
      const u = x / s;
      const v = y / s;
      hgt[y * s + x] = dome(cells(u, v), 0.5) + tileFbm(noise, u, v, 16, 3) * 0.3;
    }
  }
  return normalFromHeight(hgt, s, s, 2.2);
}

// Placas, escudo e crista: sulcos de vasos sanguíneos e degradê da base à borda.
export function makePlate(baseHex, edgeHex, darkHex, seed = 21) {
  const w = Math.min(SIZE, 512);
  const noise = makeTileNoise(seed);
  const base = hex(baseHex);
  const edge = hex(edgeHex);
  const dark = hex(darkHex);
  const hgt = new Float32Array(w * w);
  const c = writePixels(w, w, (x, y) => {
    const u = x / w;
    const v = 1 - y / w; // 0 base → 1 borda
    const n = tileFbm(noise, u, v, 4, 4);
    // vasos correm da base para a borda (ruído esticado ao longo de v)
    const r1 = Math.abs(noise(u * 18 + n * 1.2, v * 2.5, 18, 4));
    const r2 = Math.abs(noise((u + 0.31) * 40 + n * 2, (v + 0.17) * 5, 40, 8));
    const veins = (Math.max(1 - smoothstep(0.0, 0.07, r1), (1 - smoothstep(0.0, 0.08, r2)) * 0.5)) * smoothstep(0.05, 0.3, v);
    hgt[y * w + x] = -veins * 0.8 + n * 0.35;
    let col = mix3(base, edge, smoothstep(0.3, 1.0, v + n * 0.18));
    col = mix3(col, dark, veins * 0.32 + (1 - smoothstep(0.0, 0.25, v)) * 0.3);
    const s = 0.88 + n * 0.18;
    return [col[0] * s, col[1] * s, col[2] * s];
  });
  return { map: toTexture(c), normalMap: normalFromHeight(hgt, w, w, 2.0) };
}

// Olho: íris com fibras radiais, anel escuro e pupila em fenda.
export function makeEye(irisHex, seed = 3) {
  const s = 256;
  const iris = hex(irisHex);
  const noise = makeTileNoise(seed);
  const c = writePixels(s, s, (x, y) => {
    const dx = (x + 0.5) / s - 0.5;
    const dy = (y + 0.5) / s - 0.5;
    const r = Math.sqrt(dx * dx + dy * dy) * 2;
    const ang = Math.atan2(dy, dx) / TAU + 0.5;
    const fib = noise(ang * 48, r * 3, 48, 64) * 0.5 + noise(ang * 120, r * 8, 120, 64) * 0.3;
    let col = mix3([iris[0] * 1.3, iris[1] * 1.25, iris[2] * 1.1], [iris[0] * 0.45, iris[1] * 0.38, iris[2] * 0.3], smoothstep(0.12, 0.8, r));
    col = col.map((cc) => cc * (0.82 + fib * 0.45));
    // colarete claro em volta da pupila
    col = mix3(col, [iris[0] * 1.5, iris[1] * 1.4, iris[2] * 1.1], (1 - smoothstep(0.0, 0.08, Math.abs(r - 0.3))) * 0.35);
    const slit = Math.abs(dx) / 0.055 + Math.abs(dy) / 0.4;
    col = mix3([0.01, 0.01, 0.01], col, smoothstep(0.82, 1.08, slit));
    col = mix3(col, [0.04, 0.03, 0.02], smoothstep(0.66, 0.8, r));
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
    const g = 0.7 + n * 0.12 + Math.sin(v * 40 + n * 6) * 0.03;
    // marfim amarelado, mais escuro e manchado na base
    return mix3([0.82 * g, 0.74 * g, 0.58 * g], [0.36, 0.28, 0.2], smoothstep(0.5, 1, v) * 0.7);
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

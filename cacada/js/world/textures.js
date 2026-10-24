// Texturas procedurais (canvas) que se repetem sem emenda: grama, terra, rocha, neve,
// areia, chão de floresta, madeira, casca de árvore e folhas.
import * as THREE from 'three';
import { mulberry32 } from '../util/noise.js';

// ruído de valor periódico (tileável) em uma grade de período p
function tileNoise(size, period, octaves, seed) {
  const rnd = mulberry32(seed);
  const out = new Float32Array(size * size);
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    const p = period << o;
    const g = new Float32Array(p * p);
    for (let i = 0; i < g.length; i++) g[i] = rnd();
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * p;
      const y0 = Math.floor(fy);
      const ty = fy - y0;
      const sy = ty * ty * (3 - 2 * ty);
      const ya = (y0 % p) * p;
      const yb = ((y0 + 1) % p) * p;
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * p;
        const x0 = Math.floor(fx);
        const tx = fx - x0;
        const sx = tx * tx * (3 - 2 * tx);
        const xa = x0 % p;
        const xb = (x0 + 1) % p;
        const a = g[ya + xa] + (g[ya + xb] - g[ya + xa]) * sx;
        const b = g[yb + xa] + (g[yb + xb] - g[yb + xa]) * sx;
        out[y * size + x] += (a + (b - a) * sy) * amp;
      }
    }
    norm += amp;
    amp *= 0.5;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function makeCanvas(size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return c;
}

function toTexture(canvas, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(canvas);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

// pinta pixels a partir de uma função (r,g,b) com ruídos
function paint(size, fn) {
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const [r, g, b] = fn(i, x, y);
      d[i * 4] = r;
      d[i * 4 + 1] = g;
      d[i * 4 + 2] = b;
      d[i * 4 + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return c;
}

// traços com repetição nas bordas (para ficar tileável)
function wrapStroke(ctx, size, draw) {
  for (const ox of [-size, 0, size]) for (const oy of [-size, 0, size]) draw(ox, oy);
}

export function makeTerrainTextures(size = 512) {
  const rnd = mulberry32(42);
  const n1 = tileNoise(size, 8, 5, 1);
  const n2 = tileNoise(size, 32, 3, 2);
  const n3 = tileNoise(size, 4, 4, 3);
  const cl = (v) => Math.max(0, Math.min(255, v));

  // grama: base + folhas finas desenhadas por cima
  const grass = paint(size, (i) => {
    const v = n1[i] * 0.6 + n2[i] * 0.4;
    return [cl(58 + v * 40), cl(92 + v * 50), cl(36 + v * 18)];
  });
  {
    const ctx = grass.getContext('2d');
    for (let k = 0; k < 5200; k++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const l = 4 + rnd() * 9;
      const a = -Math.PI / 2 + (rnd() - 0.5) * 1.2;
      const g = 70 + rnd() * 90;
      ctx.strokeStyle = `rgba(${(g * 0.55) | 0},${g | 0},${(g * 0.3) | 0},${0.35 + rnd() * 0.4})`;
      ctx.lineWidth = 1 + rnd();
      wrapStroke(ctx, size, (ox, oy) => {
        ctx.beginPath();
        ctx.moveTo(x + ox, y + oy);
        ctx.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
        ctx.stroke();
      });
    }
  }
  // terra / trilha
  const dirt = paint(size, (i) => {
    const v = n1[i] * 0.5 + n2[i] * 0.5;
    const p = n2[i] > 0.72 ? 18 : 0;
    return [cl(112 + v * 45 + p), cl(88 + v * 35 + p), cl(60 + v * 25 + p)];
  });
  {
    const ctx = dirt.getContext('2d');
    for (let k = 0; k < 900; k++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 0.8 + rnd() * 2.6;
      const g = 90 + rnd() * 80;
      ctx.fillStyle = `rgba(${g | 0},${(g * 0.9) | 0},${(g * 0.8) | 0},0.8)`;
      wrapStroke(ctx, size, (ox, oy) => {
        ctx.beginPath();
        ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
  // rocha: cinza com fendas e líquen
  const rock = paint(size, (i) => {
    const v = n1[i];
    const crack = Math.abs(n3[i] - 0.5) < 0.018 ? -38 : 0;
    const lichen = n2[i] > 0.66 ? 1 : 0;
    const base = 108 + v * 70 + crack;
    return [cl(base + lichen * 8), cl(base + lichen * 20), cl(base - 4 - lichen * 10)];
  });
  const snow = paint(size, (i) => {
    const v = n1[i] * 0.7 + n2[i] * 0.3;
    return [cl(222 + v * 30), cl(228 + v * 26), cl(238 + v * 17)];
  });
  const sand = paint(size, (i) => {
    const v = n1[i] * 0.4 + n3[i] * 0.6;
    const g = (rnd() - 0.5) * 22;
    return [cl(176 + v * 40 + g), cl(160 + v * 34 + g), cl(118 + v * 24 + g)];
  });
  // chão de floresta: folhas secas e musgo
  const floor = paint(size, (i) => {
    const v = n1[i] * 0.6 + n2[i] * 0.4;
    const moss = n2[i] > 0.55 ? 1 : 0;
    return [cl(62 + v * 40 - moss * 18), cl(52 + v * 34 + moss * 16), cl(30 + v * 20 - moss * 8)];
  });
  {
    const ctx = floor.getContext('2d');
    for (let k = 0; k < 2600; k++) {
      const x = rnd() * size;
      const y = rnd() * size;
      const r = 1.5 + rnd() * 3.5;
      const t = rnd();
      const col = t < 0.5 ? [120, 78, 34] : t < 0.8 ? [86, 60, 30] : [70, 86, 34];
      const s = 0.6 + rnd() * 0.6;
      ctx.fillStyle = `rgba(${(col[0] * s) | 0},${(col[1] * s) | 0},${(col[2] * s) | 0},0.85)`;
      const a = rnd() * Math.PI;
      wrapStroke(ctx, size, (ox, oy) => {
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, r, r * 0.45, a, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
  // ruído de macro-variação (cor da grama, manchas)
  const macro = paint(256, (i, x, y) => {
    const a = tileNoiseCache.a || (tileNoiseCache.a = tileNoise(256, 4, 4, 9));
    const b = tileNoiseCache.b || (tileNoiseCache.b = tileNoise(256, 16, 3, 10));
    return [cl(a[i] * 255), cl(b[i] * 255), 128];
  });
  return {
    grass: toTexture(grass),
    dirt: toTexture(dirt),
    rock: toTexture(rock),
    snow: toTexture(snow),
    sand: toTexture(sand),
    floor: toTexture(floor),
    macro: toTexture(macro, false),
  };
}
const tileNoiseCache = {};

export function makeBarkTexture(size = 256, tint = [92, 70, 50]) {
  const n1 = tileNoise(size, 4, 4, 21);
  const n2 = tileNoise(size, 16, 3, 22);
  const c = paint(size, (i, x) => {
    const stripe = Math.sin((x / size) * Math.PI * 2 * 9 + n1[i] * 9) * 0.5 + 0.5;
    const v = stripe * 0.55 + n2[i] * 0.45;
    return [tint[0] * (0.55 + v * 0.7), tint[1] * (0.55 + v * 0.7), tint[2] * (0.55 + v * 0.7)];
  });
  return toTexture(c);
}

export function makeWoodTexture(size = 256, tint = [128, 82, 46]) {
  const n1 = tileNoise(size, 2, 4, 31);
  const n2 = tileNoise(size, 32, 2, 32);
  const c = paint(size, (i, x, y) => {
    const ring = Math.sin(((y / size) * 18 + n1[i] * 6) * Math.PI) * 0.5 + 0.5;
    const v = ring * 0.6 + n2[i] * 0.4;
    return [tint[0] * (0.6 + v * 0.55), tint[1] * (0.6 + v * 0.55), tint[2] * (0.6 + v * 0.5)];
  });
  return toTexture(c);
}

// normal map de ondas para a água
export function makeWaterNormal(size = 256) {
  const n = tileNoise(size, 8, 4, 77);
  const c = makeCanvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const hx = n[y * size + ((x + 1) % size)] - n[y * size + ((x - 1 + size) % size)];
      const hy = n[((y + 1) % size) * size + x] - n[((y - 1 + size) % size) * size + x];
      const k = 6;
      const nx = -hx * k;
      const ny = -hy * k;
      const l = Math.hypot(nx, ny, 1);
      d[i * 4] = ((nx / l) * 0.5 + 0.5) * 255;
      d[i * 4 + 1] = ((ny / l) * 0.5 + 0.5) * 255;
      d[i * 4 + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      d[i * 4 + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, false);
}

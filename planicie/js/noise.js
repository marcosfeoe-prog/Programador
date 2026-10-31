// Texturas de ruído procedurais: 2D (chão, grama, vento) gerada na CPU
// e 3D (Perlin-Worley) reaproveitada do simulador principal, gerada na GPU.
import * as THREE from 'three';
export { generateNoise3D } from '../../js/render/noise3d.js';

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Ruído de valor periódico (tileável) com fBm.
function tileableFbm(size, basePeriod, octaves, seed) {
  const out = new Float32Array(size * size);
  const rng = makeRng(seed);
  const lattices = [];
  for (let o = 0; o < octaves; o++) {
    const p = basePeriod << o;
    const g = new Float32Array(p * p);
    for (let i = 0; i < g.length; i++) g[i] = rng();
    lattices.push({ p, g });
  }
  let norm = 0;
  for (let o = 0; o < octaves; o++) norm += Math.pow(0.5, o);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let v = 0;
      let a = 1;
      for (let o = 0; o < octaves; o++) {
        const { p, g } = lattices[o];
        const fx = (x / size) * p;
        const fy = (y / size) * p;
        const ix = Math.floor(fx);
        const iy = Math.floor(fy);
        let tx = fx - ix;
        let ty = fy - iy;
        tx = tx * tx * (3 - 2 * tx);
        ty = ty * ty * (3 - 2 * ty);
        const x0 = ix % p, x1 = (ix + 1) % p, y0 = iy % p, y1 = (iy + 1) % p;
        const a0 = g[y0 * p + x0] + (g[y0 * p + x1] - g[y0 * p + x0]) * tx;
        const a1 = g[y1 * p + x0] + (g[y1 * p + x1] - g[y1 * p + x0]) * tx;
        v += (a0 + (a1 - a0) * ty) * a;
        a *= 0.5;
      }
      out[y * size + x] = v / norm;
    }
  }
  // normaliza o contraste para 0..1
  let lo = Infinity, hi = -Infinity;
  for (const v of out) { lo = Math.min(lo, v); hi = Math.max(hi, v); }
  for (let i = 0; i < out.length; i++) out[i] = (out[i] - lo) / (hi - lo);
  return out;
}

export function generateNoise2D(size = 512) {
  const chans = [
    tileableFbm(size, 4, 6, 11),
    tileableFbm(size, 8, 5, 23),
    tileableFbm(size, 16, 4, 37),
    tileableFbm(size, 32, 3, 51),
  ];
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    for (let c = 0; c < 4; c++) data[i * 4 + c] = Math.round(chans[c][i] * 255);
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

// Pequenas texturas de material (palha, madeira, metal) desenhadas em canvas.
export function canvasTexture(w, h, draw, repeat = 1) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h, makeRng(w * 31 + h));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 4;
  return t;
}

export { makeRng };

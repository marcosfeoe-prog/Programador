// Utilidades matemáticas, ruído e números pseudoaleatórios determinísticos.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

// Mundo em toro: as coordenadas dão a volta, o labirinto parece infinito.
export const wrap = (v, n) => ((v % n) + n) % n;
export function wdelta(d, n) {
  d = wrap(d, n);
  return d > n / 2 ? d - n : d;
}

export function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y, s = 0) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(s | 0, 982451653)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Ruído de valor periódico (período p na grade), para texturas que repetem sem emenda.
export function tnoise(x, y, p, s = 0) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const h = (a, b) => hash2(wrap(a, p), wrap(b, p), s);
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
}

export function tfbm(x, y, p, s = 0, oct = 3) {
  let sum = 0, amp = 0.5, n = 0, f = 1;
  for (let i = 0; i < oct; i++) {
    sum += tnoise(x * f, y * f, p * f, s + i * 31) * amp;
    n += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / n;
}

// Cor empacotada para Uint32Array em little-endian (ABGR).
export const rgba = (r, g, b, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;

export const angleDiff = (a, b) => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};

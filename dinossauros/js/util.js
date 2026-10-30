// Utilitários: RNG com semente, ruído de Perlin (com opção periódica para
// texturas sem emenda) e funções matemáticas pequenas.

export function rng(seed = 1) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, v) => {
  const t = clamp((v - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// amortecimento exponencial independente do quadro
export const damp = (a, b, lambda, dt) => a + (b - a) * (1 - Math.exp(-lambda * dt));
export const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
export const dampAngle = (a, b, lambda, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
export const ease = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// Perlin 2D. Com px/py > 0 o ruído se repete a cada px × py (para texturas).
export function makeNoise(seed = 1) {
  const r = rng(seed);
  const p = new Uint8Array(512);
  const perm = [...Array(256).keys()];
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(r() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  const gx = new Float32Array(256);
  const gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const a = r() * Math.PI * 2;
    gx[i] = Math.cos(a);
    gy[i] = Math.sin(a);
  }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function noise(x, y, px = 0, py = 0) {
    let xi = Math.floor(x);
    let yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    let xi1 = xi + 1;
    let yi1 = yi + 1;
    if (px > 0) {
      xi = ((xi % px) + px) % px;
      xi1 = ((xi1 % px) + px) % px;
    }
    if (py > 0) {
      yi = ((yi % py) + py) % py;
      yi1 = ((yi1 % py) + py) % py;
    }
    const h = (ix, iy, dx, dy) => {
      const g = p[(p[ix & 255] + iy) & 511];
      return gx[g] * dx + gy[g] * dy;
    };
    const u = fade(xf);
    const v = fade(yf);
    const n00 = h(xi, yi, xf, yf);
    const n10 = h(xi1, yi, xf - 1, yf);
    const n01 = h(xi, yi1, xf, yf - 1);
    const n11 = h(xi1, yi1, xf - 1, yf - 1);
    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 1.41;
  }
  // soma fractal; periódica quando px/py são passados (em células da 1ª oitava)
  function fbm(x, y, oct = 4, px = 0, py = 0, gain = 0.5) {
    let s = 0;
    let a = 1;
    let f = 1;
    let norm = 0;
    for (let i = 0; i < oct; i++) {
      s += a * noise(x * f, y * f, px * f, py * f);
      norm += a;
      a *= gain;
      f *= 2;
    }
    return s / norm;
  }
  return { noise, fbm };
}

// Grade espacial simples para buscas de vizinhança (comida, árvores, criaturas).
export class SpatialGrid {
  constructor(cell = 16) {
    this.cell = cell;
    this.map = new Map();
  }
  key(x, z) {
    return ((Math.floor(x / this.cell) + 1000) << 11) | (Math.floor(z / this.cell) + 1000);
  }
  add(item, x, z) {
    const k = this.key(x, z);
    let l = this.map.get(k);
    if (!l) this.map.set(k, (l = []));
    l.push(item);
  }
  // chama fn(item) para cada item nas células que cobrem o raio
  query(x, z, r, fn) {
    const c = this.cell;
    const x0 = Math.floor((x - r) / c);
    const x1 = Math.floor((x + r) / c);
    const z0 = Math.floor((z - r) / c);
    const z1 = Math.floor((z + r) / c);
    for (let i = x0; i <= x1; i++) {
      for (let j = z0; j <= z1; j++) {
        const l = this.map.get(((i + 1000) << 11) | (j + 1000));
        if (l) for (let k = 0; k < l.length; k++) fn(l[k]);
      }
    }
  }
}

export const yieldFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

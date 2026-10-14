// Utilitários: matemática, hash determinístico, gerador aleatório e ruído.

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const saturate = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const TAU = Math.PI * 2;

export function smoothstep(e0, e1, x) {
  const t = saturate((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

// Aproxima a de b de forma independente da taxa de quadros.
export function damp(a, b, rate, dt) {
  return b + (a - b) * Math.exp(-rate * dt);
}

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= TAU;
  while (d < -Math.PI) d += TAU;
  return d;
}

// Hash inteiro de até três coordenadas → [0, 1).
export function hash3(a, b, c = 0) {
  let h = Math.imul(a | 0, 0x27d4eb2d) ^ Math.imul(b | 0, 0x165667b1) ^ Math.imul(c | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function mulberry32(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class RNG {
  constructor(seed = 1) {
    this.next = mulberry32(seed);
  }
  float(a = 0, b = 1) {
    return a + (b - a) * this.next();
  }
  int(a, b) {
    return Math.floor(this.float(a, b + 1));
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }
  chance(p) {
    return this.next() < p;
  }
}

// Ruído de valor 2D contínuo (determinístico, sem tabela).
const fade = (t) => t * t * (3 - 2 * t);
export function vnoise(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = fade(x - xi);
  const yf = fade(y - yi);
  const a = hash3(xi, yi, seed);
  const b = hash3(xi + 1, yi, seed);
  const c = hash3(xi, yi + 1, seed);
  const d = hash3(xi + 1, yi + 1, seed);
  return lerp(lerp(a, b, xf), lerp(c, d, xf), yf) * 2 - 1;
}

export function fbm(x, y, oct = 4, seed = 0) {
  let s = 0;
  let a = 0.5;
  let n = 0;
  for (let i = 0; i < oct; i++) {
    s += vnoise(x, y, seed + i * 17) * a;
    n += a;
    x *= 2.03;
    y *= 2.03;
    a *= 0.5;
  }
  return s / n;
}

// Ruído periódico (para texturas que repetem sem emenda): grade aleatória
// com período inteiro px × py e interpolação suave.
export class TileNoise {
  constructor(seed = 1) {
    this.seed = seed;
  }
  sample(x, y, px, py, oct = 1) {
    let s = 0;
    let a = 0.5;
    let n = 0;
    for (let i = 0; i < oct; i++) {
      const PX = px << i;
      const PY = py << i;
      const fx = x * PX;
      const fy = y * PY;
      const xi = Math.floor(fx);
      const yi = Math.floor(fy);
      const tx = fade(fx - xi);
      const ty = fade(fy - yi);
      const x0 = ((xi % PX) + PX) % PX;
      const y0 = ((yi % PY) + PY) % PY;
      const x1 = (x0 + 1) % PX;
      const y1 = (y0 + 1) % PY;
      const k = this.seed + i * 101;
      const v = lerp(lerp(hash3(x0, y0, k), hash3(x1, y0, k), tx), lerp(hash3(x0, y1, k), hash3(x1, y1, k), tx), ty);
      s += (v * 2 - 1) * a;
      n += a;
      a *= 0.5;
    }
    return s / n;
  }
}

export const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

export function isMobileDevice() {
  const ua = navigator.userAgent || '';
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 1;
  return /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua) || (touch && /Macintosh/.test(ua));
}

// Utilidades matemáticas, aleatoriedade com semente e ruído 1D.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smoothstep = (a, b, x) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};
// Aproximação exponencial independente do frame (lambda ~ "velocidade").
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const dampAngle = (a, b, lambda, dt) => a + wrapAngle(b - a) * (1 - Math.exp(-lambda * dt));
export const wrapAngle = (a) => {
  a = (a + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
};
export const dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);

// Gerador pseudoaleatório determinístico (mulberry32).
export function rng(seed) {
  let s = seed >>> 0;
  const r = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (a, b) => a + (b - a) * r();
  r.int = (a, b) => Math.floor(a + (b - a + 1) * r());
  r.pick = (arr) => arr[Math.floor(r() * arr.length)];
  r.chance = (p) => r() < p;
  r.shuffle = (arr) => {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  };
  return r;
}

// Hash inteiro → [0,1).
export function hash1(n) {
  n = Math.imul(n ^ 0x27d4eb2d, 0x165667b1);
  n ^= n >>> 15;
  n = Math.imul(n, 0x85ebca6b);
  n ^= n >>> 13;
  return (n >>> 0) / 4294967296;
}

// Ruído de valor 1D suave (para tremulação de lâmpadas, respiração, tremores).
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const a = hash1(i * 73856093 + seed * 19349663);
  const b = hash1((i + 1) * 73856093 + seed * 19349663);
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// toque como entrada principal (notebooks com tela de toque e mouse continuam no modo PC)
export const isTouch = () => matchMedia('(pointer: coarse)').matches || (navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches);

// Ruído de valor 2D suave.
export function noise2(x, y, seed = 0) {
  const ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  const h = (a, b) => hash1(a * 73856093 + b * 19349663 + seed * 83492791);
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  const a = h(ix, iy), b = h(ix + 1, iy), c = h(ix, iy + 1), d = h(ix + 1, iy + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

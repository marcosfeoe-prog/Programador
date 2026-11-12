// Utilidades matemáticas, números aleatórios com semente e ruído para texturas.

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
// Suavização exponencial independente da taxa de quadros.
export const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
export const smoothstep = (e0, e1, x) => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
export const easeOutCubic = (t) => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
export const easeInOut = (t) => {
  t = clamp(t, 0, 1);
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
};

export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}
export const angleDiff = (from, to) => wrapAngle(to - from);
export const dampAngle = (a, b, rate, dt) => a + angleDiff(a, b) * (1 - Math.exp(-rate * dt));
// Gira no máximo `maxStep` radianos em direção ao alvo.
export function turnToward(a, b, maxStep) {
  const d = angleDiff(a, b);
  if (Math.abs(d) <= maxStep) return b;
  return a + Math.sign(d) * maxStep;
}

export const rand = (a, b) => a + Math.random() * (b - a);
export const randInt = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
export const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p) => Math.random() < p;
export const dist2 = (ax, az, bx, bz) => {
  const dx = ax - bx,
    dz = az - bz;
  return dx * dx + dz * dz;
};
export const dist = (ax, az, bx, bz) => Math.sqrt(dist2(ax, az, bx, bz));

// Escolha ponderada: [[valor, peso], ...]
export function weighted(list, rnd = Math.random) {
  let total = 0;
  for (const it of list) total += it[1];
  let r = rnd() * total;
  for (const it of list) {
    r -= it[1];
    if (r <= 0) return it[0];
  }
  return list[list.length - 1][0];
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  constructor(seed) {
    this.next = mulberry32(seed);
  }
  range(a, b) {
    return a + this.next() * (b - a);
  }
  int(a, b) {
    return Math.floor(a + this.next() * (b - a + 1));
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p) {
    return this.next() < p;
  }
}

// Ruído de valor que se repete (para texturas sem emenda).
function tileNoise(period, rnd) {
  const v = new Float32Array(period * period);
  for (let i = 0; i < v.length; i++) v[i] = rnd();
  return (x, y) => {
    const xi = Math.floor(x),
      yi = Math.floor(y);
    const xf = x - xi,
      yf = y - yi;
    const x0 = ((xi % period) + period) % period,
      y0 = ((yi % period) + period) % period;
    const x1 = (x0 + 1) % period,
      y1 = (y0 + 1) % period;
    const u = xf * xf * (3 - 2 * xf),
      w = yf * yf * (3 - 2 * yf);
    const a = v[y0 * period + x0],
      b = v[y0 * period + x1],
      c = v[y1 * period + x0],
      d = v[y1 * period + x1];
    return a + (b - a) * u + (c - a) * w + (a - b - c + d) * u * w;
  };
}

// fbm periódico: u, v em [0, 1) → valor aproximadamente em [0, 1].
export function makeFbm(basePeriod, octaves, rng) {
  const rnd = rng ? () => rng.next() : Math.random;
  const layers = [];
  let amp = 1,
    total = 0;
  for (let i = 0; i < octaves; i++) {
    const p = basePeriod * (1 << i);
    layers.push({ fn: tileNoise(p, rnd), p, amp });
    total += amp;
    amp *= 0.5;
  }
  return (u, v) => {
    let s = 0;
    for (const l of layers) s += l.fn(u * l.p, v * l.p) * l.amp;
    return s / total;
  };
}

// Ruído 1D suave para balanço da mira e tremores.
export function noise1(t, seed = 0) {
  return (
    Math.sin(t * 1.13 + seed) * 0.5 +
    Math.sin(t * 2.71 + seed * 1.7) * 0.3 +
    Math.sin(t * 5.37 + seed * 2.3) * 0.2
  );
}

export const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));

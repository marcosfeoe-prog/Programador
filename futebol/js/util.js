// Utilitários: matemática, gerador aleatório determinístico e ajudas gerais.

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const saturate = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const TAU = Math.PI * 2;
export const sign = (x) => (x < 0 ? -1 : 1);

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

export function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
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
    this.next = mulberry32(typeof seed === 'string' ? hashString(seed) : seed);
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
  // Distribuição normal (Box–Muller).
  gauss(mu = 0, sd = 1) {
    const u = Math.max(1e-9, this.next());
    const v = this.next();
    return mu + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  // Escolha ponderada: weights[i] >= 0.
  weighted(items, weights) {
    let tot = 0;
    for (const w of weights) tot += w;
    let r = this.next() * tot;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }
}

// Amostra de Poisson (Knuth) — usada na simulação rápida de partidas.
export function poisson(lambda, rnd) {
  const L = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rnd();
  } while (p > L);
  return k - 1;
}

// Ruído de valor 1D suave (para rajadas de vento, oscilações).
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const h = (n) => {
    let v = Math.imul((n + seed * 7919) | 0, 0x27d4eb2d);
    v = Math.imul(v ^ (v >>> 15), 0x85ebca6b);
    v ^= v >>> 13;
    return ((v >>> 0) / 4294967296) * 2 - 1;
  };
  const t = f * f * (3 - 2 * f);
  return lerp(h(i), h(i + 1), t);
}

export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  const touch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 1);
  return /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua) || (touch && /Macintosh/.test(ua));
}

export function fmtClock(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// Distância de cor (RGB hex) — usada para evitar uniformes parecidos.
export function hexToRgb(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function colorDist(a, b) {
  const x = hexToRgb(a);
  const y = hexToRgb(b);
  const rm = (x[0] + y[0]) / 2;
  const dr = x[0] - y[0];
  const dg = x[1] - y[1];
  const db = x[2] - y[2];
  return Math.sqrt((2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db);
}
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

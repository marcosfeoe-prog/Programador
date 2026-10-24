// Utilitários: matemática, curvas de animação, hash determinístico e ruído.
// Toda a animação do episódio é uma função pura do tempo, então nada aqui
// guarda estado entre quadros.

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const DEG = Math.PI / 180;
export const TAU = Math.PI * 2;

// Fração de x dentro de [a, b], limitada a [0, 1].
export const range = (x, a, b) => clamp((x - a) / (b - a));

export const smooth = (t) => {
  t = clamp(t);
  return t * t * (3 - 2 * t);
};
export const easeIn = (t) => Math.pow(clamp(t), 3);
export const easeOut = (t) => 1 - Math.pow(1 - clamp(t), 3);
export const easeInOut = (t) => {
  t = clamp(t);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const backOut = (t) => {
  t = clamp(t);
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};
export const elasticOut = (t) => {
  t = clamp(t);
  if (t === 0 || t === 1) return t;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
};
const EASE = { lin: (t) => clamp(t), in: easeIn, out: easeOut, io: easeInOut, s: smooth, back: backOut, el: elasticOut };

// Sobe de 0 a 1 em [a, b] e volta a 0 em [c, d] (com suavização).
export const pulse = (t, a, b, c, d) => smooth(range(t, a, b)) * (1 - smooth(range(t, c, d)));

function mixVal(a, b, u) {
  if (typeof a === 'number') return a + (b - a) * u;
  const out = new Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i] + (b[i] - a[i]) * u;
  return out;
}

// Interpolação por quadros-chave: keys = [[tempo, valor, easing?], ...].
// O easing de cada chave vale para o trecho que CHEGA nela ('io' por padrão).
// Valores podem ser números ou arrays de números.
export function kf(t, keys) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (t < b[0]) {
      const a = keys[i - 1];
      const e = typeof b[2] === 'function' ? b[2] : EASE[b[2] || 'io'];
      return mixVal(a[1], b[1], e((t - a[0]) / (b[0] - a[0])));
    }
  }
  return keys[keys.length - 1][1];
}

// Valor escolhido por degraus (sem interpolação): steps = [[tempo, valor], ...].
export function step(t, steps) {
  let v = steps[0][1];
  for (const s of steps) if (t >= s[0]) v = s[1];
  return v;
}

// Hash numérico → [0, 1).
export function hash(n) {
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return x - Math.floor(x);
}
export const hash2 = (a, b) => hash(a * 57.31 + b * 113.97);

// Ruído de valor 1D contínuo em [-1, 1].
export function noise1(x, seed = 0) {
  const i = Math.floor(x);
  const f = x - i;
  const u = f * f * (3 - 2 * f);
  return lerp(hash(i + seed * 101.3), hash(i + 1 + seed * 101.3), u) * 2 - 1;
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

// Ruído 2D para texturas.
const fade = (t) => t * t * (3 - 2 * t);
export function vnoise2(x, y, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = fade(x - xi);
  const yf = fade(y - yi);
  const h = (a, b) => hash(a * 12.9898 + b * 78.233 + seed * 37.719);
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), xf), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), xf), yf) * 2 - 1;
}

export function fbm2(x, y, oct = 4, seed = 0) {
  let s = 0;
  let a = 0.5;
  let n = 0;
  for (let i = 0; i < oct; i++) {
    s += vnoise2(x, y, seed + i * 17) * a;
    n += a;
    x *= 2.03;
    y *= 2.03;
    a *= 0.5;
  }
  return s / n;
}

export function isMobileDevice() {
  const ua = navigator.userAgent || '';
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 1;
  return /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(ua) || (touch && /Macintosh/.test(ua));
}

export function fmtTime(s) {
  s = Math.max(0, Math.floor(s));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Funções matemáticas utilitárias usadas em todo o jogo.

export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const saturate = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export function smoothstep(e0, e1, x) {
  const t = saturate((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

export function remap(x, a0, a1, b0, b1) {
  return b0 + ((x - a0) / (a1 - a0)) * (b1 - b0);
}

// Gerador pseudoaleatório determinístico (Mulberry32).
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
    return arr[Math.floor(this.next() * arr.length)];
  }
  chance(p) {
    return this.next() < p;
  }
  // Distribuição aproximadamente normal (Box–Muller).
  gauss(mean = 0, sd = 1) {
    const u = Math.max(1e-9, this.next());
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
}

// Hash inteiro rápido → [0,1).
export function hash2(x, y) {
  let h = (x * 374761393 + y * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

// Direção cardeal (N = -z, L = +x) a partir de um vetor no plano XZ.
export function cardinal(dx, dz) {
  const ang = Math.atan2(dx, -dz); // 0 = norte, horário
  const dirs = ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'];
  let i = Math.round(ang / (Math.PI / 4));
  i = ((i % 8) + 8) % 8;
  return dirs[i];
}

export function formatTime(hours) {
  const h = Math.floor(hours) % 24;
  const m = Math.floor((hours - Math.floor(hours)) * 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function msToKmh(v) {
  return v * 3.6;
}

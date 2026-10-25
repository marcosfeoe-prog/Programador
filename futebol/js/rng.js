// Gerador pseudoaleatório com estado salvável (mulberry32) e utilitários.
export class RNG {
  constructor(seed = Date.now() >>> 0) {
    this.s = seed >>> 0;
  }
  next() {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  float(a = 0, b = 1) {
    return a + (b - a) * this.next();
  }
  int(a, b) {
    return Math.floor(this.float(a, b + 1));
  }
  chance(p) {
    return this.next() < p;
  }
  pick(arr) {
    return arr[Math.floor(this.next() * arr.length)];
  }
  // Escolha ponderada: items = [[valor, peso], ...] ou (arr, fnPeso)
  weighted(arr, wfn = (x) => x[1]) {
    let total = 0;
    for (const x of arr) total += Math.max(0, wfn(x));
    let r = this.next() * total;
    for (const x of arr) {
      r -= Math.max(0, wfn(x));
      if (r <= 0) return x;
    }
    return arr[arr.length - 1];
  }
  gauss(mean = 0, sd = 1) {
    const u = 1 - this.next();
    const v = this.next();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  // Distribuição de Poisson (gols)
  poisson(lambda) {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do {
      k++;
      p *= this.next();
    } while (p > L);
    return k - 1;
  }
}

export const rng = new RNG();

export function clamp(v, a, b) {
  return v < a ? a : v > b ? b : v;
}

export function uid(prefix = '') {
  return prefix + Math.floor(rng.next() * 36 ** 6).toString(36).padStart(6, '0') + (Date.now() % 1296).toString(36);
}

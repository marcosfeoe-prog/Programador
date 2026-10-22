// Ruído procedural com semente: PRNG, hashes e ruído de Perlin 2D/3D.

export function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Converte texto (ou número) em uma semente inteira de 32 bits.
export function seedFrom(value) {
  const s = String(value ?? '').trim();
  if (s !== '' && /^-?\d+$/.test(s)) return Number(BigInt.asIntN(32, BigInt(s)));
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

export function hash2(seed, x, z) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export function hash3(seed, x, y, z) {
  let h =
    Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 1103515245) ^ Math.imul(z | 0, 668265263) ^ Math.imul(seed, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const GRAD3 = new Int8Array([1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1]);

export class Perlin {
  constructor(seed) {
    const rnd = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    this.perm = new Uint8Array(512);
    this.perm12 = new Uint8Array(512);
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.perm12[i] = this.perm[i] % 12;
    }
    this.ox = rnd() * 256;
    this.oy = rnd() * 256;
    this.oz = rnd() * 256;
  }

  noise2(x, y) {
    x += this.ox;
    y += this.oy;
    const X = Math.floor(x), Y = Math.floor(y);
    const xf = x - X, yf = y - Y;
    const xi = X & 255, yi = Y & 255;
    const perm = this.perm, g = this.perm12;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const aa = g[xi + perm[yi]] * 3, ab = g[xi + perm[yi + 1]] * 3;
    const ba = g[xi + 1 + perm[yi]] * 3, bb = g[xi + 1 + perm[yi + 1]] * 3;
    const n00 = GRAD3[aa] * xf + GRAD3[aa + 1] * yf;
    const n10 = GRAD3[ba] * (xf - 1) + GRAD3[ba + 1] * yf;
    const n01 = GRAD3[ab] * xf + GRAD3[ab + 1] * (yf - 1);
    const n11 = GRAD3[bb] * (xf - 1) + GRAD3[bb + 1] * (yf - 1);
    const x1 = n00 + u * (n10 - n00);
    const x2 = n01 + u * (n11 - n01);
    return (x1 + v * (x2 - x1)) * 0.95;
  }

  noise3(x, y, z) {
    x += this.ox;
    y += this.oy;
    z += this.oz;
    const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    const xf = x - X, yf = y - Y, zf = z - Z;
    const xi = X & 255, yi = Y & 255, zi = Z & 255;
    const perm = this.perm, g = this.perm12;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const w = zf * zf * zf * (zf * (zf * 6 - 15) + 10);
    const A = perm[xi] + yi, AA = perm[A] + zi, AB = perm[A + 1] + zi;
    const B = perm[xi + 1] + yi, BA = perm[B] + zi, BB = perm[B + 1] + zi;
    const d = (h, x, y, z) => {
      h *= 3;
      return GRAD3[h] * x + GRAD3[h + 1] * y + GRAD3[h + 2] * z;
    };
    const l = (a, b, t) => a + t * (b - a);
    return l(
      l(l(d(g[AA], xf, yf, zf), d(g[BA], xf - 1, yf, zf), u), l(d(g[AB], xf, yf - 1, zf), d(g[BB], xf - 1, yf - 1, zf), u), v),
      l(
        l(d(g[AA + 1], xf, yf, zf - 1), d(g[BA + 1], xf - 1, yf, zf - 1), u),
        l(d(g[AB + 1], xf, yf - 1, zf - 1), d(g[BB + 1], xf - 1, yf - 1, zf - 1), u),
        v,
      ),
      w,
    );
  }

  fbm2(x, y, octaves = 4, lac = 2, gain = 0.5) {
    let sum = 0, amp = 1, norm = 0;
    for (let i = 0; i < octaves; i++) {
      sum += this.noise2(x, y) * amp;
      norm += amp;
      amp *= gain;
      x *= lac;
      y *= lac;
    }
    return sum / norm;
  }
}

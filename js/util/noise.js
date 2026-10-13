// Ruído procedural (Perlin melhorado, fBm, ridged e Worley periódico).
import { mulberry32 } from './math.js';

const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
const lerp = (a, b, t) => a + (b - a) * t;

function grad3(h, x, y, z) {
  const hh = h & 15;
  const u = hh < 8 ? x : y;
  const v = hh < 4 ? y : hh === 12 || hh === 14 ? x : z;
  return ((hh & 1) === 0 ? u : -u) + ((hh & 2) === 0 ? v : -v);
}

const G2 = [
  [1, 0], [-1, 0], [0, 1], [0, -1],
  [0.7071, 0.7071], [-0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, -0.7071],
];

export class Perlin {
  constructor(seed = 1) {
    const rnd = mulberry32(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    this.p = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.p[i] = p[i & 255];
  }

  noise2(x, y) {
    const p = this.p;
    let X = Math.floor(x);
    let Y = Math.floor(y);
    const xf = x - X;
    const yf = y - Y;
    X &= 255;
    Y &= 255;
    const g00 = G2[p[p[X] + Y] & 7];
    const g10 = G2[p[p[X + 1] + Y] & 7];
    const g01 = G2[p[p[X] + Y + 1] & 7];
    const g11 = G2[p[p[X + 1] + Y + 1] & 7];
    const n00 = g00[0] * xf + g00[1] * yf;
    const n10 = g10[0] * (xf - 1) + g10[1] * yf;
    const n01 = g01[0] * xf + g01[1] * (yf - 1);
    const n11 = g11[0] * (xf - 1) + g11[1] * (yf - 1);
    const u = fade(xf);
    const v = fade(yf);
    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 1.414;
  }

  // Versão periódica (período inteiro) para texturas que repetem sem emenda.
  noise2p(x, y, period) {
    const p = this.p;
    const X0 = Math.floor(x);
    const Y0 = Math.floor(y);
    const xf = x - X0;
    const yf = y - Y0;
    const xa = ((X0 % period) + period) % period;
    const ya = ((Y0 % period) + period) % period;
    const xb = (xa + 1) % period;
    const yb = (ya + 1) % period;
    const g00 = G2[p[p[xa & 255] + (ya & 255)] & 7];
    const g10 = G2[p[p[xb & 255] + (ya & 255)] & 7];
    const g01 = G2[p[p[xa & 255] + (yb & 255)] & 7];
    const g11 = G2[p[p[xb & 255] + (yb & 255)] & 7];
    const n00 = g00[0] * xf + g00[1] * yf;
    const n10 = g10[0] * (xf - 1) + g10[1] * yf;
    const n01 = g01[0] * xf + g01[1] * (yf - 1);
    const n11 = g11[0] * (xf - 1) + g11[1] * (yf - 1);
    const u = fade(xf);
    const v = fade(yf);
    return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 1.414;
  }

  noise3(x, y, z) {
    const p = this.p;
    let X = Math.floor(x);
    let Y = Math.floor(y);
    let Z = Math.floor(z);
    x -= X;
    y -= Y;
    z -= Z;
    X &= 255;
    Y &= 255;
    Z &= 255;
    const u = fade(x);
    const v = fade(y);
    const w = fade(z);
    const A = p[X] + Y;
    const AA = p[A] + Z;
    const AB = p[A + 1] + Z;
    const B = p[X + 1] + Y;
    const BA = p[B] + Z;
    const BB = p[B + 1] + Z;
    return lerp(
      lerp(
        lerp(grad3(p[AA], x, y, z), grad3(p[BA], x - 1, y, z), u),
        lerp(grad3(p[AB], x, y - 1, z), grad3(p[BB], x - 1, y - 1, z), u),
        v,
      ),
      lerp(
        lerp(grad3(p[AA + 1], x, y, z - 1), grad3(p[BA + 1], x - 1, y, z - 1), u),
        lerp(grad3(p[AB + 1], x, y - 1, z - 1), grad3(p[BB + 1], x - 1, y - 1, z - 1), u),
        v,
      ),
      w,
    );
  }

  // Perlin 3D periódico.
  noise3p(x, y, z, period) {
    const p = this.p;
    const X0 = Math.floor(x);
    const Y0 = Math.floor(y);
    const Z0 = Math.floor(z);
    x -= X0;
    y -= Y0;
    z -= Z0;
    const m = (a) => ((a % period) + period) % period;
    const xa = m(X0), xb = m(X0 + 1);
    const ya = m(Y0), yb = m(Y0 + 1);
    const za = m(Z0), zb = m(Z0 + 1);
    const h = (i, j, k) => p[p[p[i & 255] + (j & 255)] + (k & 255)];
    const u = fade(x);
    const v = fade(y);
    const w = fade(z);
    return lerp(
      lerp(
        lerp(grad3(h(xa, ya, za), x, y, z), grad3(h(xb, ya, za), x - 1, y, z), u),
        lerp(grad3(h(xa, yb, za), x, y - 1, z), grad3(h(xb, yb, za), x - 1, y - 1, z), u),
        v,
      ),
      lerp(
        lerp(grad3(h(xa, ya, zb), x, y, z - 1), grad3(h(xb, ya, zb), x - 1, y, z - 1), u),
        lerp(grad3(h(xa, yb, zb), x, y - 1, z - 1), grad3(h(xb, yb, zb), x - 1, y - 1, z - 1), u),
        v,
      ),
      w,
    );
  }

  fbm2(x, y, oct = 4, lac = 2.0, gain = 0.5) {
    let a = 1;
    let f = 1;
    let s = 0;
    let n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * this.noise2(x * f + i * 17.3, y * f - i * 9.1);
      n += a;
      a *= gain;
      f *= lac;
    }
    return s / n;
  }

  fbm2p(x, y, period, oct = 4, gain = 0.5) {
    let a = 1;
    let f = 1;
    let s = 0;
    let n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * this.noise2p(x * f, y * f, period * f);
      n += a;
      a *= gain;
      f *= 2;
    }
    return s / n;
  }

  // Ruído "ridged" (cristas de montanha), retorna ~[0,1].
  ridged2(x, y, oct = 5) {
    let a = 0.5;
    let f = 1;
    let s = 0;
    let w = 1;
    for (let i = 0; i < oct; i++) {
      let n = 1 - Math.abs(this.noise2(x * f + i * 31.7, y * f + i * 11.3));
      n *= n;
      n *= w;
      w = Math.min(1, Math.max(0, n * 2));
      s += n * a;
      f *= 2.03;
      a *= 0.5;
    }
    return s;
  }
}

// Worley (células) 3D periódico — retorna distância ao ponto mais próximo [0,~1].
export function worley3p(x, y, z, period, seed = 0) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  let best = 10;
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = xi + dx;
        const cy = yi + dy;
        const cz = zi + dz;
        const wx = ((cx % period) + period) % period;
        const wy = ((cy % period) + period) % period;
        const wz = ((cz % period) + period) % period;
        let h = (wx * 73856093) ^ (wy * 19349663) ^ (wz * 83492791) ^ (seed * 2654435761);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        const r1 = ((h >>> 0) & 0xffff) / 65535;
        h = Math.imul(h ^ (h >>> 15), 2246822519);
        const r2 = ((h >>> 0) & 0xffff) / 65535;
        h = Math.imul(h ^ (h >>> 16), 3266489917);
        const r3 = ((h >>> 0) & 0xffff) / 65535;
        const px = cx + r1 - x;
        const py = cy + r2 - y;
        const pz = cz + r3 - z;
        const d = px * px + py * py + pz * pz;
        if (d < best) best = d;
      }
    }
  }
  return Math.sqrt(best);
}

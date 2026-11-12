// Ruído de gradiente (Perlin) 2D/3D com semente, fbm e Worley — usado para terreno,
// texturas procedurais e para a textura 3D das nuvens.

import { RNG } from './rng.js';

export class Noise {
  constructor(seed = 1) {
    const rng = new RNG(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng.next() * (i + 1));
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  // Perlin 2D em [-1, 1] aproximadamente.
  n2(x, y) {
    const P = this.perm;
    let xi = Math.floor(x);
    let yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    xi &= 255;
    yi &= 255;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const aa = P[P[xi] + yi];
    const ab = P[P[xi] + yi + 1];
    const ba = P[P[xi + 1] + yi];
    const bb = P[P[xi + 1] + yi + 1];
    const x1 = lerp(grad2(aa, xf, yf), grad2(ba, xf - 1, yf), u);
    const x2 = lerp(grad2(ab, xf, yf - 1), grad2(bb, xf - 1, yf - 1), u);
    return lerp(x1, x2, v);
  }

  // Perlin 3D com período opcional (para texturas que repetem sem emenda).
  n3(x, y, z, period = 256) {
    const P = this.perm;
    const X = Math.floor(x);
    const Y = Math.floor(y);
    const Z = Math.floor(z);
    const xf = x - X;
    const yf = y - Y;
    const zf = z - Z;
    const m = (a) => ((a % period) + period) % period & 255;
    const x0 = m(X);
    const x1 = m(X + 1);
    const y0 = m(Y);
    const y1 = m(Y + 1);
    const z0 = m(Z);
    const z1 = m(Z + 1);
    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);
    const h = (a, b, c) => P[P[P[a] + b] + c];
    const g000 = grad3(h(x0, y0, z0), xf, yf, zf);
    const g100 = grad3(h(x1, y0, z0), xf - 1, yf, zf);
    const g010 = grad3(h(x0, y1, z0), xf, yf - 1, zf);
    const g110 = grad3(h(x1, y1, z0), xf - 1, yf - 1, zf);
    const g001 = grad3(h(x0, y0, z1), xf, yf, zf - 1);
    const g101 = grad3(h(x1, y0, z1), xf - 1, yf, zf - 1);
    const g011 = grad3(h(x0, y1, z1), xf, yf - 1, zf - 1);
    const g111 = grad3(h(x1, y1, z1), xf - 1, yf - 1, zf - 1);
    return lerp(lerp(lerp(g000, g100, u), lerp(g010, g110, u), v), lerp(lerp(g001, g101, u), lerp(g011, g111, u), v), w);
  }

  fbm2(x, y, oct = 4, lac = 2, gain = 0.5) {
    let s = 0;
    let a = 1;
    let f = 1;
    let n = 0;
    for (let i = 0; i < oct; i++) {
      s += a * this.n2(x * f, y * f);
      n += a;
      a *= gain;
      f *= lac;
    }
    return s / n;
  }

  ridge2(x, y, oct = 4) {
    let s = 0;
    let a = 1;
    let f = 1;
    let n = 0;
    for (let i = 0; i < oct; i++) {
      const r = 1 - Math.abs(this.n2(x * f, y * f));
      s += a * r * r;
      n += a;
      a *= 0.5;
      f *= 2;
    }
    return s / n;
  }
}

function fade(t) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function grad2(h, x, y) {
  switch (h & 7) {
    case 0:
      return x + y;
    case 1:
      return -x + y;
    case 2:
      return x - y;
    case 3:
      return -x - y;
    case 4:
      return x;
    case 5:
      return -x;
    case 6:
      return y;
    default:
      return -y;
  }
}
function grad3(h, x, y, z) {
  const hh = h & 15;
  const u = hh < 8 ? x : y;
  const v = hh < 4 ? y : hh === 12 || hh === 14 ? x : z;
  return ((hh & 1) === 0 ? u : -u) + ((hh & 2) === 0 ? v : -v);
}

// Worley (distância à célula mais próxima) 3D periódico, em [0, 1].
export function worley3(x, y, z, cells, pts) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const zi = Math.floor(z);
  let best = 9;
  for (let dz = -1; dz <= 1; dz++)
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const cx = xi + dx;
        const cy = yi + dy;
        const cz = zi + dz;
        const wx = ((cx % cells) + cells) % cells;
        const wy = ((cy % cells) + cells) % cells;
        const wz = ((cz % cells) + cells) % cells;
        const k = (wx + wy * cells + wz * cells * cells) * 3;
        const px = cx + pts[k] - x;
        const py = cy + pts[k + 1] - y;
        const pz = cz + pts[k + 2] - z;
        const d = px * px + py * py + pz * pz;
        if (d < best) best = d;
      }
  return Math.min(1, Math.sqrt(best));
}

export function worleyPoints(cells, rng) {
  const pts = new Float32Array(cells * cells * cells * 3);
  for (let i = 0; i < pts.length; i++) pts[i] = rng.next();
  return pts;
}

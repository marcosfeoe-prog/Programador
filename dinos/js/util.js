// Utilidades: matemática, aleatoriedade com semente e ruídos procedurais.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (t) => t * t * (3 - 2 * t);
export const smoothstep = (a, b, x) => smooth(clamp((x - a) / (b - a), 0, 1));
export const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));
export const TAU = Math.PI * 2;

export function wrapAngle(a) {
  a = (a + Math.PI) % TAU;
  if (a < 0) a += TAU;
  return a - Math.PI;
}

export function dampAngle(a, b, k, dt) {
  return a + wrapAngle(b - a) * (1 - Math.exp(-k * dt));
}

// Gira "a" em direção a "b" com velocidade máxima "rate" (rad/s).
export function turnToward(a, b, rate, dt) {
  const d = wrapAngle(b - a);
  const m = rate * dt;
  return a + (Math.abs(d) <= m ? d : Math.sign(d) * m);
}

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hash2(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Ruído simplex 2D com semente (terreno e distribuição de vegetação).
export function makeSimplex2D(seed) {
  const rnd = mulberry32(seed);
  const p = new Uint8Array(256);
  for (let i = 0; i < 256; i++) p[i] = i;
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const perm = new Uint8Array(512);
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const G = [
    [1, 1], [-1, 1], [1, -1], [-1, -1], [1, 0], [-1, 0], [0, 1], [0, -1],
  ];
  const F2 = 0.5 * (Math.sqrt(3) - 1);
  const G2 = (3 - Math.sqrt(3)) / 6;
  return function (xin, yin) {
    const s = (xin + yin) * F2;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const t = (i + j) * G2;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const i1 = x0 > y0 ? 1 : 0;
    const j1 = 1 - i1;
    const x1 = x0 - i1 + G2;
    const y1 = y0 - j1 + G2;
    const x2 = x0 - 1 + 2 * G2;
    const y2 = y0 - 1 + 2 * G2;
    const ii = i & 255;
    const jj = j & 255;
    let n = 0;
    let t0 = 0.5 - x0 * x0 - y0 * y0;
    if (t0 > 0) {
      const g = G[perm[ii + perm[jj]] & 7];
      t0 *= t0;
      n += t0 * t0 * (g[0] * x0 + g[1] * y0);
    }
    let t1 = 0.5 - x1 * x1 - y1 * y1;
    if (t1 > 0) {
      const g = G[perm[ii + i1 + perm[jj + j1]] & 7];
      t1 *= t1;
      n += t1 * t1 * (g[0] * x1 + g[1] * y1);
    }
    let t2 = 0.5 - x2 * x2 - y2 * y2;
    if (t2 > 0) {
      const g = G[perm[ii + 1 + perm[jj + 1]] & 7];
      t2 *= t2;
      n += t2 * t2 * (g[0] * x2 + g[1] * y2);
    }
    return 70 * n;
  };
}

// Ruído de gradiente periódico (para texturas que repetem sem emenda).
export function makeTileNoise(seed) {
  const rnd = mulberry32(seed);
  const perm = new Uint8Array(512);
  const p = [];
  for (let i = 0; i < 256; i++) p.push(i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const gx = new Float32Array(256);
  const gy = new Float32Array(256);
  for (let i = 0; i < 256; i++) {
    const a = rnd() * TAU;
    gx[i] = Math.cos(a);
    gy[i] = Math.sin(a);
  }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  function g(ix, iy, px, py, dx, dy) {
    ix = ((ix % px) + px) % px;
    iy = ((iy % py) + py) % py;
    const h = perm[perm[ix & 255] + (iy & 255)];
    return gx[h] * dx + gy[h] * dy;
  }
  return function (x, y, px, py) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const u = fade(fx);
    const v = fade(fy);
    const a = g(x0, y0, px, py, fx, fy);
    const b = g(x0 + 1, y0, px, py, fx - 1, fy);
    const c = g(x0, y0 + 1, px, py, fx, fy - 1);
    const d = g(x0 + 1, y0 + 1, px, py, fx - 1, fy - 1);
    return 1.41 * lerp(lerp(a, b, u), lerp(c, d, u), v);
  };
}

// fBm periódico: x,y em [0,1), "base" = número de células da 1ª oitava.
export function tileFbm(noise, x, y, base, oct = 4, gain = 0.5) {
  let sum = 0;
  let amp = 1;
  let norm = 0;
  let f = base;
  for (let o = 0; o < oct; o++) {
    sum += amp * noise(x * f, y * f, f, f);
    norm += amp;
    amp *= gain;
    f *= 2;
  }
  return sum / norm;
}

// Células de Voronoi periódicas (escamas). Retorna F1, F2 e id da célula.
export function makeTileWorley(seed, cx, cy, jitter = 0.85) {
  const pts = new Float32Array(cx * cy * 2);
  const rnd = mulberry32(seed);
  for (let i = 0; i < cx * cy; i++) {
    pts[i * 2] = 0.5 + (rnd() - 0.5) * jitter;
    pts[i * 2 + 1] = 0.5 + (rnd() - 0.5) * jitter;
  }
  const out = { f1: 0, f2: 0, id: 0, dx: 0, dy: 0 };
  return function (u, v) {
    const x = u * cx;
    const y = v * cy;
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    let f1 = 1e9;
    let f2 = 1e9;
    let id = 0;
    let bdx = 0;
    let bdy = 0;
    for (let j = -1; j <= 1; j++) {
      for (let i = -1; i <= 1; i++) {
        const cxi = ix + i;
        const cyj = iy + j;
        const wx = ((cxi % cx) + cx) % cx;
        const wy = ((cyj % cy) + cy) % cy;
        const k = wy * cx + wx;
        const px = cxi + pts[k * 2];
        const py = cyj + pts[k * 2 + 1];
        const dx = px - x;
        const dy = py - y;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d < f1) {
          f2 = f1;
          f1 = d;
          id = k;
          bdx = dx;
          bdy = dy;
        } else if (d < f2) f2 = d;
      }
    }
    out.f1 = f1;
    out.f2 = f2;
    out.id = id;
    out.dx = bdx;
    out.dy = bdy;
    return out;
  };
}

export function yieldFrame() {
  return new Promise((r) => requestAnimationFrame(() => r()));
}

export function isMobile() {
  return (
    /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
    (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent))
  );
}

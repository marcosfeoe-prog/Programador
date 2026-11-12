// Texturas procedurais (canvas) com mapas normais gerados a partir da altura.
// Tudo é sem emenda (tileable) e fica em cache entre os níveis.
import * as THREE from 'three';
import { rng } from './noise.js';

const cache = new Map();
let aniso = 8;
export function setMaxAnisotropy(a) {
  aniso = a;
}

// Ruído de tabela, periódico em potências de 2 (rápido o bastante para gerar 512² em JS).
class TN {
  constructor(seed) {
    const r = rng(seed);
    this.t = new Float32Array(65536);
    for (let i = 0; i < 65536; i++) this.t[i] = r();
  }
  n(x, y, p, o = 0) {
    const xi = Math.floor(x), yi = Math.floor(y);
    let fx = x - xi, fy = y - yi;
    const m = p - 1;
    const x0 = ((xi & m) + o) & 255, x1 = (((xi + 1) & m) + o) & 255;
    const y0 = (((yi & m) + o * 3) & 255) << 8, y1 = ((((yi + 1) & m) + o * 3) & 255) << 8;
    const t = this.t;
    const a = t[y0 | x0], b = t[y0 | x1], c = t[y1 | x0], d = t[y1 | x1];
    fx = fx * fx * (3 - 2 * fx);
    fy = fy * fy * (3 - 2 * fy);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  fbm(u, v, p, oct = 5, gain = 0.5) {
    let s = 0, amp = 0.5, norm = 0;
    for (let i = 0; i < oct && p <= 256; i++) {
      s += amp * this.n(u * p, v * p, p, i * 37);
      norm += amp;
      amp *= gain;
      p *= 2;
    }
    return s / norm;
  }
}

const sm = (a, b, v) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const hex = (h) => {
  const c = new THREE.Color(h);
  return [c.r * 255, c.g * 255, c.b * 255];
};
// cores em sRGB 0..255 sem conversão (THREE.Color converteria para linear)
const srgb = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTexture(c, color = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

// Gera mapa normal a partir de um campo de altura (0..1).
function normalFromHeight(h, size, strength) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    const yu = ((y - 1 + size) % size) * size, yd = ((y + 1) % size) * size, yc = y * size;
    for (let x = 0; x < size; x++) {
      const xl = (x - 1 + size) % size, xr = (x + 1) % size;
      let nx = (h[yc + xl] - h[yc + xr]) * strength;
      let ny = (h[yd + x] - h[yu + x]) * strength;
      const inv = 1 / Math.sqrt(nx * nx + ny * ny + 1);
      const i = (yc + x) * 4;
      d[i] = (nx * inv * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * inv * 0.5 + 0.5) * 255;
      d[i + 2] = (inv * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTexture(c, false);
}

// Cria textura a partir de uma função por pixel; post() desenha detalhes extras no canvas.
function build(size, pixel, { post = null, normal = 2.5, lumHeight = 0 } = {}) {
  const c = canvas(size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const h = new Float32Array(size * size);
  const out = [0, 0, 0, 0];
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      pixel(u, v, out);
      const i = y * size + x;
      d[i * 4] = out[0];
      d[i * 4 + 1] = out[1];
      d[i * 4 + 2] = out[2];
      d[i * 4 + 3] = 255;
      h[i] = out[3];
    }
  }
  ctx.putImageData(img, 0, 0);
  if (post) {
    post(ctx, size);
    if (lumHeight > 0) {
      const dd = ctx.getImageData(0, 0, size, size).data;
      for (let i = 0; i < size * size; i++) {
        const l = (dd[i * 4] * 0.3 + dd[i * 4 + 1] * 0.59 + dd[i * 4 + 2] * 0.11) / 255;
        h[i] = h[i] * (1 - lumHeight) + l * lumHeight;
      }
    }
  }
  return { map: toTexture(c), normalMap: normal > 0 ? normalFromHeight(h, size, normal) : null, canvas: c };
}

// desenha com repetição nas bordas (para manter a textura sem emenda)
function wrapDraw(size, x, y, r, fn) {
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      const px = x + ox * size, py = y + oy * size;
      if (px + r < 0 || px - r > size || py + r < 0 || py - r > size) continue;
      fn(px, py);
    }
  }
}

function cracks(ctx, size, r, count, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    let x = r() * size, y = r() * size;
    let a = r() * Math.PI * 2;
    const len = 20 + r() * 90;
    const pts = [[x, y]];
    for (let s = 0; s < len; s += 4) {
      a += (r() - 0.5) * 0.9;
      x += Math.cos(a) * 4;
      y += Math.sin(a) * 4;
      pts.push([x, y]);
    }
    ctx.lineWidth = width * (0.6 + r() * 0.8);
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        ctx.beginPath();
        pts.forEach((p, k) => (k ? ctx.lineTo(p[0] + ox * size, p[1] + oy * size) : ctx.moveTo(p[0] + ox * size, p[1] + oy * size)));
        ctx.stroke();
      }
    }
  }
}

function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

// ---------------------------------------------------------------------------------
// Chão de grama vista de cima (paleta configurável por nível)
export function grassGround(pal = {}) {
  const P = {
    a: '#5d6b3c', // verde
    b: '#6e6a40', // oliva
    c: '#a1955f', // palha seca
    d: '#6b5a42', // terra
    seed: 11,
    ...pal,
  };
  const key = 'grass:' + JSON.stringify(P);
  return cached(key, () => {
    const tn = new TN(P.seed);
    const A = srgb(P.a), B = srgb(P.b), C = srgb(P.c), D = srgb(P.d);
    const r = rng(P.seed + 5);
    return build(
      512,
      (u, v, o) => {
        const m = tn.fbm(u, v, 4, 4);
        const md = tn.fbm(u, v, 16, 4);
        const f = tn.n(u * 256, v * 256, 256, 5);
        const f2 = tn.n(u * 128, v * 128, 128, 9);
        let col = mix3(A, B, sm(0.3, 0.7, m));
        col = mix3(col, C, sm(0.5, 0.75, md * 0.7 + m * 0.45 + f2 * 0.12 - 0.08) * 0.75);
        col = mix3(col, D, sm(0.72, 0.9, f * 0.35 + md * 0.75 - 0.05) * 0.6);
        const br = 0.7 + f * 0.38 + f2 * 0.22;
        o[0] = col[0] * br;
        o[1] = col[1] * br;
        o[2] = col[2] * br;
        o[3] = f * 0.55 + f2 * 0.45;
      },
      {
        normal: 3,
        lumHeight: 0.6,
        post: (ctx, size) => {
          const cols = [A, B, C, mix3(A, [255, 255, 220], 0.25), mix3(B, [0, 0, 0], 0.4)];
          ctx.lineCap = 'round';
          for (let i = 0; i < 14000; i++) {
            const c = cols[Math.floor(r() * cols.length)];
            const k = 0.65 + r() * 0.6;
            ctx.strokeStyle = `rgba(${c[0] * k | 0},${c[1] * k | 0},${c[2] * k | 0},${0.35 + r() * 0.4})`;
            ctx.lineWidth = 0.8 + r() * 1.1;
            const x = r() * size, y = r() * size;
            const a = r() * Math.PI * 2, l = 2 + r() * 6;
            wrapDraw(size, x, y, 8, (px, py) => {
              ctx.beginPath();
              ctx.moveTo(px, py);
              ctx.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
              ctx.stroke();
            });
          }
        },
      }
    );
  });
}

// Concreto claro (tingido pela cor do material)
export function concrete(seed = 3) {
  return cached('concrete' + seed, () => {
    const tn = new TN(seed);
    const r = rng(seed + 1);
    return build(
      512,
      (u, v, o) => {
        const m = tn.fbm(u, v, 4, 4);
        const d = tn.fbm(u, v, 32, 3);
        const f = tn.n(u * 256, v * 256, 256, 3);
        const f2 = tn.n(u * 128, v * 128, 128, 7);
        let val = 206 + (f - 0.5) * 34 + (d - 0.5) * 30 + (m - 0.5) * 34;
        const speck = sm(0.78, 0.95, f2 * 0.6 + f * 0.4);
        val -= speck * 34;
        val += sm(0.15, 0.0, f) * 16;
        o[0] = val * 1.0;
        o[1] = val * 0.985;
        o[2] = val * 0.97;
        o[3] = f * 0.5 + d * 0.3 - speck * 0.3;
      },
      {
        normal: 2.2,
        lumHeight: 0.35,
        post: (ctx, size) => {
          cracks(ctx, size, r, 5, 'rgba(70,60,62,0.45)', 1.1);
          for (let i = 0; i < 14; i++) {
            const x = r() * size, y = r() * size, rad = 20 + r() * 60;
            wrapDraw(size, x, y, rad, (px, py) => {
              const g = ctx.createRadialGradient(px, py, 0, px, py, rad);
              g.addColorStop(0, `rgba(90,80,80,${0.05 + r() * 0.08})`);
              g.addColorStop(1, 'rgba(90,80,80,0)');
              ctx.fillStyle = g;
              ctx.fillRect(px - rad, py - rad, rad * 2, rad * 2);
            });
          }
        },
      }
    );
  });
}

export function asphalt(seed = 5) {
  return cached('asphalt' + seed, () => {
    const tn = new TN(seed);
    const r = rng(seed + 2);
    return build(
      512,
      (u, v, o) => {
        const m = tn.fbm(u, v, 4, 4);
        const d = tn.fbm(u, v, 32, 3);
        const f = tn.n(u * 256, v * 256, 256, 3);
        const f2 = tn.n(u * 256, v * 256, 256, 11);
        let val = 92 + (f - 0.5) * 46 + (d - 0.5) * 22 + (m - 0.5) * 26;
        const agg = sm(0.72, 0.92, f2);
        val += agg * 60;
        val -= sm(0.35, 0.2, m) * 14;
        o[0] = val;
        o[1] = val;
        o[2] = val * 1.02;
        o[3] = f * 0.4 + agg * 0.6;
      },
      {
        normal: 3.2,
        lumHeight: 0.25,
        post: (ctx, size) => {
          for (let i = 0; i < 5; i++) {
            const w = 40 + r() * 120, h = 30 + r() * 100, x = r() * size, y = r() * size;
            ctx.fillStyle = `rgba(30,30,34,${0.12 + r() * 0.15})`;
            wrapDraw(size, x, y, Math.max(w, h), (px, py) => ctx.fillRect(px, py, w, h));
          }
          cracks(ctx, size, r, 9, 'rgba(18,18,20,0.75)', 1.6);
        },
      }
    );
  });
}

// Areia com ondulações (paleta configurável)
export function sand(pal = {}) {
  const P = { a: '#c9d2ee', b: '#e4e8f8', c: '#aeb6dc', seed: 21, ...pal };
  return cached('sand:' + JSON.stringify(P), () => {
    const tn = new TN(P.seed);
    const A = srgb(P.a), B = srgb(P.b), C = srgb(P.c);
    const r = rng(P.seed + 1);
    return build(
      512,
      (u, v, o) => {
        const m = tn.fbm(u, v, 4, 4);
        const w = tn.fbm(u, v, 8, 3);
        const f = tn.n(u * 256, v * 256, 256, 2);
        const f2 = tn.n(u * 128, v * 128, 128, 6);
        let rip = Math.sin((v * 10 + u * 2 + w * 2.4) * Math.PI * 2);
        rip = Math.pow(rip * 0.5 + 0.5, 1.6);
        let col = mix3(A, B, sm(0.35, 0.7, m * 0.7 + rip * 0.25 + f2 * 0.2));
        col = mix3(col, C, sm(0.62, 0.8, f2 * 0.5 + w * 0.5) * 0.6);
        const br = 0.9 + (f - 0.5) * 0.22 + rip * 0.06;
        o[0] = col[0] * br;
        o[1] = col[1] * br;
        o[2] = col[2] * br;
        o[3] = rip * 0.55 + f * 0.25 + m * 0.2;
      },
      {
        normal: 2.6,
        post: (ctx, size) => {
          for (let i = 0; i < 2600; i++) {
            const x = r() * size, y = r() * size, s = 0.6 + r() * 1.6;
            const k = r();
            ctx.fillStyle = k < 0.5 ? `rgba(255,255,255,${0.25 + r() * 0.4})` : `rgba(90,96,130,${0.15 + r() * 0.3})`;
            ctx.fillRect(x, y, s, s);
          }
        },
      }
    );
  });
}

// Chão de floresta: musgo, terra e folhinhas
export function forestFloor(pal = {}) {
  const P = { a: '#6c7d5e', b: '#857262', c: '#9aa77c', seed: 31, ...pal };
  return cached('forest:' + JSON.stringify(P), () => {
    const tn = new TN(P.seed);
    const A = srgb(P.a), B = srgb(P.b), C = srgb(P.c);
    const r = rng(P.seed + 3);
    return build(
      512,
      (u, v, o) => {
        const m = tn.fbm(u, v, 4, 5);
        const d = tn.fbm(u, v, 16, 4);
        const f = tn.n(u * 256, v * 256, 256, 4);
        let col = mix3(A, B, sm(0.4, 0.62, m));
        col = mix3(col, C, sm(0.55, 0.75, d) * 0.5);
        const br = 0.72 + f * 0.45;
        o[0] = col[0] * br;
        o[1] = col[1] * br;
        o[2] = col[2] * br;
        o[3] = f * 0.4 + d * 0.6;
      },
      {
        normal: 2.5,
        lumHeight: 0.5,
        post: (ctx, size) => {
          const cols = ['#c98aa0', '#e7a6bd', '#8a6a58', '#6f8a5a', '#b39b85', '#f2c4d4'];
          for (let i = 0; i < 2600; i++) {
            const x = r() * size, y = r() * size;
            ctx.fillStyle = cols[Math.floor(r() * cols.length)];
            ctx.globalAlpha = 0.35 + r() * 0.45;
            const rx = 1 + r() * 3.5, ry = 0.6 + r() * 1.6, a = r() * Math.PI;
            wrapDraw(size, x, y, 5, (px, py) => {
              ctx.beginPath();
              ctx.ellipse(px, py, rx, ry, a, 0, Math.PI * 2);
              ctx.fill();
            });
          }
          ctx.globalAlpha = 1;
        },
      }
    );
  });
}

// Cascalho / terra batida
export function gravel(pal = {}) {
  const P = { a: '#8c8478', b: '#a39d93', seed: 41, ...pal };
  return cached('gravel:' + JSON.stringify(P), () => {
    const tn = new TN(P.seed);
    const A = srgb(P.a), B = srgb(P.b);
    const r = rng(P.seed + 1);
    return build(
      512,
      (u, v, o) => {
        const m = tn.fbm(u, v, 8, 4);
        const f = tn.n(u * 256, v * 256, 256, 1);
        const col = mix3(A, B, m);
        const br = 0.75 + f * 0.4;
        o[0] = col[0] * br;
        o[1] = col[1] * br;
        o[2] = col[2] * br;
        o[3] = f;
      },
      {
        normal: 3.5,
        lumHeight: 0.85,
        post: (ctx, size) => {
          for (let i = 0; i < 5200; i++) {
            const x = r() * size, y = r() * size, rr = 1.2 + r() * 3.2, a = r() * Math.PI;
            const g = 120 + r() * 100, w = r() * 20;
            wrapDraw(size, x, y, rr + 2, (px, py) => {
              ctx.fillStyle = 'rgba(30,26,24,0.35)';
              ctx.beginPath();
              ctx.ellipse(px + 0.8, py + 0.9, rr, rr * 0.75, a, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = `rgb(${g + w | 0},${g | 0},${g - w * 0.5 | 0})`;
              ctx.beginPath();
              ctx.ellipse(px, py, rr, rr * 0.75, a, 0, Math.PI * 2);
              ctx.fill();
            });
          }
        },
      }
    );
  });
}

// Revestimento de madeira em réguas horizontais (casas)
export function siding() {
  return cached('siding', () => {
    const tn = new TN(51);
    const boards = 8;
    return build(
      256,
      (u, v, o) => {
        const bv = (v * boards) % 1;
        const g = tn.fbm(u * 0.25, v, 64, 3);
        let val = 232 - g * 18;
        const lip = sm(0.9, 1.0, bv);
        val -= lip * 70;
        val -= (1 - bv) * 10;
        o[0] = o[1] = o[2] = val;
        o[3] = bv * 0.8 + g * 0.05 - lip * 0.6;
      },
      { normal: 5 }
    );
  });
}

export function shingles() {
  return cached('shingles', () => {
    const tn = new TN(61);
    const rows = 8;
    return build(
      256,
      (u, v, o) => {
        const row = Math.floor(v * rows);
        const rv = (v * rows) % 1;
        const off = row % 2 ? 0.5 : 0;
        const cu = (u * 6 + off) % 1;
        const id = Math.floor(u * 6 + off) + row * 13;
        const tone = ((id * 9301 + 49297) % 233280) / 233280;
        const grain = tn.n(u * 256, v * 256, 256, 2);
        let val = 120 + (tone - 0.5) * 40 + (grain - 0.5) * 50;
        const gap = sm(0.04, 0.0, cu) + sm(0.96, 1.0, cu);
        val -= gap * 60;
        val -= sm(0.15, 0.0, rv) * 50;
        o[0] = o[1] = o[2] = val;
        o[3] = rv * 0.7 - gap * 0.4 + grain * 0.1;
      },
      { normal: 4 }
    );
  });
}

export function wood() {
  return cached('wood', () => {
    const tn = new TN(71);
    return build(
      256,
      (u, v, o) => {
        const w = tn.fbm(u, v, 4, 3);
        const g = Math.sin((u * 24 + w * 5) * Math.PI * 2) * 0.5 + 0.5;
        const f = tn.n(u * 256, v * 32, 256, 4);
        const val = 150 + g * 30 + (f - 0.5) * 40 - w * 20;
        o[0] = val;
        o[1] = val * 0.94;
        o[2] = val * 0.86;
        o[3] = g * 0.5 + f * 0.5;
      },
      { normal: 3 }
    );
  });
}

export function stucco() {
  return cached('stucco', () => {
    const tn = new TN(81);
    return build(
      256,
      (u, v, o) => {
        const f = tn.fbm(u, v, 32, 4);
        const g = tn.n(u * 256, v * 256, 256, 5);
        const val = 226 + (f - 0.5) * 24 + (g - 0.5) * 14;
        o[0] = o[1] = o[2] = val;
        o[3] = f * 0.6 + g * 0.4;
      },
      { normal: 1.6 }
    );
  });
}

export function bark() {
  return cached('bark', () => {
    const tn = new TN(91);
    return build(
      256,
      (u, v, o) => {
        const w = tn.fbm(u, v * 0.25, 8, 3);
        const ridge = Math.abs(Math.sin((u * 10 + w * 3) * Math.PI));
        const f = tn.n(u * 256, v * 64, 256, 3);
        const val = 70 + ridge * 60 + (f - 0.5) * 30;
        o[0] = val;
        o[1] = val * 0.9;
        o[2] = val * 0.82;
        o[3] = ridge * 0.8 + f * 0.2;
      },
      { normal: 4 }
    );
  });
}

// Galhinhos/folhagem com transparência (cartões de arbustos)
export function foliageCard(pal = {}) {
  const P = { cols: ['#b0245e', '#8e1c4a', '#d8457f', '#6e143a'], twig: '#5a1830', seed: 101, dense: 1, ...pal };
  return cached('foliage:' + JSON.stringify(P), () => {
    const r = rng(P.seed);
    const size = 256;
    const c = canvas(size);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, size, size);
    ctx.lineCap = 'round';
    // galhos a partir da base
    const branch = (x, y, a, len, w, depth) => {
      const x2 = x + Math.cos(a) * len, y2 = y + Math.sin(a) * len;
      ctx.strokeStyle = P.twig;
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      if (depth > 0) {
        const n = 2 + (r() < 0.4 ? 1 : 0);
        for (let i = 0; i < n; i++) branch(x2, y2, a + (r() - 0.5) * 1.3, len * (0.62 + r() * 0.2), w * 0.7, depth - 1);
      } else {
        for (let i = 0; i < 9 * P.dense; i++) {
          ctx.fillStyle = P.cols[Math.floor(r() * P.cols.length)];
          const lx = x2 + (r() - 0.5) * 22, ly = y2 + (r() - 0.5) * 22;
          ctx.beginPath();
          ctx.ellipse(lx, ly, 2.5 + r() * 4, 1.5 + r() * 2.5, r() * Math.PI, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    };
    for (let i = 0; i < 7; i++) branch(size / 2 + (r() - 0.5) * 30, size, -Math.PI / 2 + (r() - 0.5) * 1.6, 60 + r() * 30, 4, 4);
    const t = toTexture(c, true, false);
    t.premultiplyAlpha = false;
    return t;
  });
}

// Fronde de samambaia (alfa)
export function fernFrond() {
  return cached('fern', () => {
    const r = rng(7);
    const w = 128, h = 512;
    const c = canvas(w, h);
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#3e5a2c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(w / 2, h);
    ctx.lineTo(w / 2, 4);
    ctx.stroke();
    for (let y = h - 20; y > 10; y -= 9) {
      const t = 1 - y / h;
      const len = (w / 2 - 6) * Math.sin(Math.min(1, (1 - t) * 1.25) * Math.PI * 0.5) * (0.85 + r() * 0.15);
      for (const s of [-1, 1]) {
        const g = 70 + r() * 40;
        ctx.fillStyle = `rgb(${46 + r() * 20 | 0},${g + 30 | 0},${40 + r() * 15 | 0})`;
        ctx.beginPath();
        ctx.moveTo(w / 2, y);
        ctx.quadraticCurveTo(w / 2 + s * len * 0.5, y - 9, w / 2 + s * len, y - 6);
        ctx.quadraticCurveTo(w / 2 + s * len * 0.5, y + 2, w / 2, y + 3);
        ctx.fill();
      }
    }
    const t = toTexture(c, true, false);
    return t;
  });
}

// Mancha radial suave (brilhos, sombras de contato, partículas)
export function radial(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)', size = 128, mid = 0.0) {
  return cached('radial:' + inner + outer + size + mid, () => {
    const c = canvas(size);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, inner);
    if (mid > 0) g.addColorStop(mid, inner);
    g.addColorStop(1, outer);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    return toTexture(c, true, false);
  });
}

// Grade de janelas para prédios distantes
export function windowGrid(seed = 1, cols = 8, rows = 16, litChance = 0.25) {
  return cached(`windows:${seed}:${cols}:${rows}:${litChance}`, () => {
    const r = rng(seed);
    const w = 256, h = 512;
    const c = canvas(w, h);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#d9c8d8';
    ctx.fillRect(0, 0, w, h);
    const cw = w / cols, rh = h / rows;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const lit = r() < litChance;
        ctx.fillStyle = lit ? (r() < 0.5 ? '#ffd9a8' : '#ffe9c9') : `rgb(${40 + r() * 30 | 0},${44 + r() * 30 | 0},${70 + r() * 30 | 0})`;
        ctx.fillRect(x * cw + cw * 0.18, y * rh + rh * 0.22, cw * 0.64, rh * 0.56);
      }
    }
    return toTexture(c);
  });
}

export function makeCanvas(w, h) {
  return canvas(w, h);
}
export { toTexture, srgb, hex };

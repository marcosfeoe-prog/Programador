// Texturas realistas de alta resolução (gráficos ULTRA e MAX), com mapa de relevo, altura e brilho.
// Tudo gerado por código a partir de ruído. Os pintores trabalham num espaço virtual de 64×64;
// a resolução real (64 no ULTRA, 128 no MAX) só muda quantos pixels cada traço ocupa.
import * as THREE from 'three';
import { mulberry32 } from './noise.js';
import { tileEntries, tileImageData, ATLAS_COLS } from './textures.js';

const V = 64; // tamanho virtual
let S = 64; // pixels reais por textura
let K = 1; // S / V

// ---------- ferramentas de pintura ----------
class HD {
  constructor(seed) {
    this.rnd = mulberry32(seed);
    this.r = new Float32Array(S * S);
    this.g = new Float32Array(S * S);
    this.b = new Float32Array(S * S);
    this.a = new Float32Array(S * S).fill(1);
    this.h = new Float32Array(S * S).fill(0.5); // altura (relevo)
    this.gloss = new Float32Array(S * S).fill(0.05);
    this.noises = new Map();
  }
  // x, y no espaço virtual (0..64, podem ser fracionários)
  set(x, y, c, h, gl) {
    let px = Math.floor(x * K), py = Math.floor(y * K);
    px = ((px % S) + S) % S;
    py = ((py % S) + S) % S;
    const i = py * S + px;
    this.r[i] = c[0];
    this.g[i] = c[1];
    this.b[i] = c[2];
    if (c[3] !== undefined) this.a[i] = c[3];
    if (h !== undefined) this.h[i] = h;
    if (gl !== undefined) this.gloss[i] = gl;
  }
  // pinta cada pixel real; fn recebe a posição virtual
  fill(fn) {
    for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
      const v = fn((px + 0.5) / K - 0.5, (py + 0.5) / K - 0.5);
      if (!v) continue;
      const i = py * S + px, c = v[0];
      this.r[i] = c[0];
      this.g[i] = c[1];
      this.b[i] = c[2];
      if (c[3] !== undefined) this.a[i] = c[3];
      if (v[1] !== undefined) this.h[i] = v[1];
      if (v[2] !== undefined) this.gloss[i] = v[2];
    }
  }
  // ruído de valor periódico (repete a cada 64 unidades virtuais)
  vn(freq, key = 0) {
    const k = freq + ':' + key;
    let grid = this.noises.get(k);
    if (!grid) {
      grid = new Float32Array(freq * freq);
      for (let i = 0; i < grid.length; i++) grid[i] = this.rnd();
      this.noises.set(k, grid);
    }
    return (x, y) => {
      const fx = (x / V) * freq, fy = (y / V) * freq;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const at = (i, j) => grid[(((j % freq) + freq) % freq) * freq + (((i % freq) + freq) % freq)];
      const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
      const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
      return a + (b - a) * sy;
    };
  }
  fbm(base = 4, oct = 4, key = 0) {
    const ns = [];
    // no MAX acrescenta uma oitava de detalhe fino
    const o2 = oct + (K > 1 ? 1 : 0);
    for (let o = 0; o < o2; o++) ns.push(this.vn(Math.min(base << o, 256), key * 10 + o));
    return (x, y) => {
      let s = 0, amp = 1, n = 0;
      for (const f of ns) {
        s += f(x, y) * amp;
        n += amp;
        amp *= 0.5;
      }
      return s / n;
    };
  }
  // Voronoi periódico: devolve [d1, d2, índice da célula, dx, dy, aleatório da célula]
  voronoi(n) {
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([this.rnd() * V, this.rnd() * V, this.rnd()]);
    return (x, y) => {
      let d1 = 1e9, d2 = 1e9, best = 0, bx = 0, by = 0;
      for (let i = 0; i < n; i++) {
        const p = pts[i];
        for (let ox = -V; ox <= V; ox += V) for (let oy = -V; oy <= V; oy += V) {
          const dx = x + 0.5 - (p[0] + ox), dy = y + 0.5 - (p[1] + oy);
          const d = dx * dx + dy * dy;
          if (d < d1) { d2 = d1; d1 = d; best = i; bx = dx; by = dy; } else if (d < d2) d2 = d;
        }
      }
      return [Math.sqrt(d1), Math.sqrt(d2), best, bx, by, pts[best][2]];
    };
  }
}

const lerp = (a, b, t) => a + (b - a) * t;
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const mul = (c, f) => [c[0] * f, c[1] * f, c[2] * f];
const clamp01 = (v) => Math.max(0, Math.min(1, v));
const C = (r, g, b) => [r / 255, g / 255, b / 255];

// ---------- materiais ----------
function rock(p, base, dark, opts = {}) {
  const f = p.fbm(4, 5, 1), d = p.fbm(8, 3, 2), crack = p.fbm(6, 3, 3), strata = p.fbm(2, 2, 4);
  const lichen = p.fbm(8, 3, 5);
  p.fill((x, y) => {
    const v = f(x, y), w = d(x, y);
    const c = Math.abs(crack(x, y) - 0.5);
    let col = mixc(dark, base, clamp01(v * 1.3 - 0.1));
    // camadas de sedimento levemente inclinadas
    col = mul(col, 0.9 + w * 0.2 + Math.sin((y + strata(x, y) * 10) * 0.35) * 0.03);
    let h = v * 0.7 + w * 0.3;
    if (c < 0.018 && !opts.noCracks) {
      col = mul(col, 0.6);
      h -= 0.3;
    }
    if (K > 1 && lichen(x, y) > 0.72 && !opts.noCracks) col = mixc(col, C(118, 126, 92), 0.35);
    if (p.rnd() < 0.03) col = mul(col, 1.15);
    return [col, h, opts.gloss ?? 0.06];
  });
}
function dirt(p) {
  const f = p.fbm(4, 5, 4), v = p.voronoi(28), roots = p.fbm(8, 2, 6);
  p.fill((x, y) => {
    const n = f(x, y);
    let col = mixc(C(84, 58, 38), C(140, 100, 68), n);
    let h = n * 0.6;
    const [d1, , , , , r] = v(x, y);
    if (d1 < 2.2 && r < 0.45) {
      // pedrinhas arredondadas
      col = mixc(C(120, 110, 100), C(166, 156, 140), r * 2);
      h = 0.7 + (2.2 - d1) * 0.15;
    } else if (Math.abs(roots(x, y) - 0.5) < 0.01) {
      col = C(62, 44, 28);
      h -= 0.1;
    }
    col = mul(col, 0.9 + p.rnd() * 0.2);
    return [col, h, 0.04];
  });
}
// traços finos (folhas de grama, palha): densidade proporcional à área real
function strokes(p, y0, y1, colors, density, lenMin, lenMax, angFn) {
  const n = Math.round(density * K * K);
  const step = 0.8 / K;
  for (let i = 0; i < n; i++) {
    let x = p.rnd() * V, y = y0 + p.rnd() * (y1 - y0);
    const len = lenMin + p.rnd() * (lenMax - lenMin), ang = angFn ? angFn(p) : p.rnd() * Math.PI * 2;
    const c = colors[Math.floor(p.rnd() * colors.length)];
    const shadeK = 0.8 + p.rnd() * 0.4;
    for (let k = 0; k < len; k += step) {
      const t = k / len;
      p.set(x, y, mul(c, shadeK * (0.72 + t * 0.4)), 0.4 + t * 0.6, 0.12);
      x += Math.cos(ang) * step;
      y += Math.sin(ang) * step;
    }
  }
}
const GRASS = [C(72, 124, 38), C(86, 142, 44), C(98, 156, 52), C(64, 110, 34), C(110, 168, 60), C(80, 130, 30)];
function grassTop(p) {
  const f = p.fbm(4, 4, 5), clover = p.voronoi(10);
  p.fill((x, y) => {
    const [d1, , , , , r] = clover(x, y);
    // trevos e terra aparecendo entre as folhas
    if (K > 1 && r < 0.25 && d1 < 2.2) return [mul(C(70, 128, 46), 0.8 + (2.2 - d1) * 0.12), 0.55];
    return [mixc(C(44, 76, 24), C(70, 112, 36), f(x, y)), 0.2];
  });
  strokes(p, 0, V, GRASS, 1100, 2, 7);
}
function grassSide(p, snow) {
  dirt(p);
  const edge = p.fbm(8, 3, 6);
  for (let x = 0; x < V; x += 1 / K) {
    const depth = 10 + edge(x, 0) * 14;
    for (let y = 0; y < depth; y += 1 / K) {
      const t = y / depth;
      const col = snow ? mul(C(236, 242, 248), 0.92 + p.rnd() * 0.08) : mul(GRASS[Math.floor(p.rnd() * GRASS.length)], 1.05 - t * 0.35);
      p.set(x, y, col, 0.7 - t * 0.2, snow ? 0.15 : 0.1);
    }
    // fiapos pendurados
    if (!snow && p.rnd() < 0.5) for (let y = depth; y < depth + 2 + p.rnd() * 4; y += 1 / K) p.set(x, y, mul(GRASS[0], 0.75), 0.6);
  }
}
function sand(p, base) {
  const f = p.fbm(4, 4, 7), r = p.fbm(2, 2, 8), v = p.voronoi(14);
  p.fill((x, y) => {
    const rip = Math.sin((y + r(x, y) * 30) * 0.45) * 0.5 + 0.5;
    let col = mul(base, 0.86 + f(x, y) * 0.14 + rip * 0.05 + (p.rnd() - 0.5) * 0.12);
    let h = rip * 0.3 + p.rnd() * 0.2;
    if (K > 1) {
      const [d1, , , , , rr] = v(x, y);
      if (rr < 0.3 && d1 < 1.1) {
        col = mixc(C(150, 140, 126), C(196, 186, 170), rr * 3);
        h = 0.7;
      }
    }
    return [col, h, 0.05];
  });
}
function pebbles(p, n, palette, mortar, moss = 0) {
  const v = p.voronoi(n), tex = p.fbm(8, 3, 9), mo = p.fbm(4, 3, 19);
  p.fill((x, y) => {
    const [d1, d2, idx, , , r] = v(x, y);
    const edge = d2 - d1;
    const pc = palette[idx % palette.length];
    if (edge < 1.6) {
      // musgo nas frestas
      if (moss && mo(x, y) > 0.45) return [mul(C(70, 104, 40), 0.7 + p.rnd() * 0.4), 0.15, 0.05];
      return [mul(mortar, 0.8 + p.rnd() * 0.2), 0.05, 0.02];
    }
    const dome = clamp01(edge / 8);
    const col = mul(pc, 0.7 + dome * 0.35 + (tex(x, y) - 0.5) * 0.25 + r * 0.1);
    return [col, 0.3 + Math.sqrt(dome) * 0.7, 0.08];
  });
}
function bricks(p, bw, bh, color, mortar, opts = {}) {
  const f = p.fbm(8, 3, 10), m2 = p.fbm(4, 3, 11);
  const tints = [];
  for (let i = 0; i < 64; i++) tints.push(0.82 + p.rnd() * 0.3);
  p.fill((x, y) => {
    const row = Math.floor(y / bh);
    const off = row % 2 ? bw / 2 : 0;
    const col = Math.floor((x + off) / bw);
    const lx = (x + off) % bw, ly = y % bh;
    const m = 2;
    if (lx < m || ly < m) return [mul(mortar, 0.85 + f(x, y) * 0.25), 0.05, 0.02];
    const bevel = Math.min(lx - m, ly - m, bw - 1 - lx, bh - 1 - ly);
    const h = 0.45 + Math.min(bevel, 3) * 0.17 + (f(x, y) - 0.5) * 0.15;
    const t = tints[(row * 7 + col * 3) % 64];
    let c = mul(color, t * (0.85 + f(x, y) * 0.3));
    if (bevel < 1) c = mul(c, 1.1);
    if (opts.moss && m2(x, y) > 0.6) c = mixc(c, C(70, 104, 44), 0.7);
    return [c, h, 0.07];
  });
}
function wood(p, base, dark, boards = 4) {
  const warp = p.fbm(2, 3, 11), fine = p.fbm(16, 2, 12), knots = p.voronoi(5);
  const bh = V / boards;
  const seams = [];
  for (let i = 0; i < boards; i++) seams.push(Math.floor(p.rnd() * V));
  p.fill((x, y) => {
    const b = Math.floor(y / bh), ly = y % bh;
    if (ly >= bh - 1) return [mul(dark, 0.55), 0.05];
    if (Math.abs(x - seams[b]) < 0.6) return [mul(dark, 0.6), 0.1];
    // nós da madeira deformam os veios
    const [kd, , , kx, ky, kr] = knots(x, y);
    const knot = kr < 0.5 && kd < 4 ? (4 - kd) / 4 : 0;
    const g = Math.sin((x * 0.06 + warp(x, y + b * 17) * 6 + ly * 0.35 + knot * Math.atan2(ky, kx)) * 5) * 0.5 + 0.5;
    let col = mixc(dark, base, 0.55 + g * 0.35 + (fine(x, y) - 0.5) * 0.2);
    if (knot > 0.6) col = mul(dark, 0.8);
    const edge = ly < 1 ? 1.1 : 1;
    return [mul(col, edge * (0.95 + b * 0.02)), 0.4 + g * 0.2 - knot * 0.2, 0.1];
  });
  for (let b = 0; b < boards; b++) for (const nx of [4, V - 6]) p.set(nx, b * bh + 3, C(60, 60, 60), 0.6, 0.4);
}
function bark(p, base, dark, mossy = false) {
  const f = p.fbm(4, 4, 13), m = p.fbm(4, 3, 15);
  const ridges = p.vn(16, 14);
  p.fill((x, y) => {
    const r = ridges(x, y * 0.18);
    const furrow = Math.abs(Math.sin((x + f(x, y) * 14) * 0.45));
    const t = clamp01(furrow * 0.7 + r * 0.4);
    let col = mul(mixc(dark, base, t), 0.85 + p.rnd() * 0.2);
    if (mossy && K > 1 && m(x, y) > 0.62 && t < 0.6) col = mixc(col, C(80, 110, 50), 0.6);
    return [col, t, 0.04];
  });
}
function birchBark(p) {
  const f = p.fbm(4, 4, 15);
  p.fill((x, y) => [mul(C(222, 220, 210), 0.9 + f(x, y) * 0.12), 0.6, 0.08]);
  for (let i = 0; i < 26; i++) {
    const y = Math.floor(p.rnd() * V), x0 = Math.floor(p.rnd() * V), len = 3 + Math.floor(p.rnd() * 12);
    for (let k = 0; k < len; k += 1 / K) for (let t = 0; t < 2; t += 1 / K) p.set(x0 + k, y + t, mul(C(40, 38, 34), 0.8 + p.rnd() * 0.4), 0.2);
  }
}
function rings(p, inner, barkCol) {
  const f = p.fbm(4, 3, 16);
  p.fill((x, y) => {
    const dx = x - 31.5, dy = y - 31.5;
    const edge = Math.max(Math.abs(dx), Math.abs(dy));
    if (edge > 28) return [mul(barkCol, 0.8 + p.rnd() * 0.3), 0.3];
    const d = Math.sqrt(dx * dx + dy * dy) + f(x, y) * 4;
    const ring = Math.sin(d * 1.3) * 0.5 + 0.5;
    // rachaduras radiais da madeira seca
    const crack = K > 1 && Math.abs(Math.sin(Math.atan2(dy, dx) * 3 + f(x, y) * 4)) < 0.02 && d > 8;
    return [mul(inner, (0.8 + ring * 0.22) * (crack ? 0.6 : 1)), 0.5 + ring * 0.1 - (crack ? 0.3 : 0), 0.08];
  });
}
function leaves(p, base) {
  p.fill(() => [[0, 0, 0, 0], 0]);
  const n = Math.round(230 * (K > 1 ? 1.6 : 1));
  for (let i = 0; i < n; i++) {
    const cx = p.rnd() * V, cy = p.rnd() * V, ang = p.rnd() * Math.PI, L = 3 + p.rnd() * 3.5, W = 1.4 + p.rnd() * 1.2;
    const col = mul(base, 0.6 + p.rnd() * 0.6);
    const ca = Math.cos(ang), sa = Math.sin(ang);
    for (let y = -6; y <= 6; y += 1 / K) for (let x = -6; x <= 6; x += 1 / K) {
      const u = x * ca + y * sa, v = -x * sa + y * ca;
      const e = (u / L) ** 2 + (v / W) ** 2;
      if (e > 1) continue;
      // nervura central e borda mais escura
      const vein = K > 1 && Math.abs(v) < 0.18 ? 1.15 : 1;
      p.set(cx + x, cy + y, [...mul(col, (1.1 - e * 0.35 + (v > 0 ? -0.08 : 0.05)) * vein), 1], 1 - e, 0.25);
    }
  }
}
function ore(p, a, b, metallic) {
  rock(p, C(132, 132, 134), C(92, 92, 96), { noCracks: true });
  const v = p.voronoi(9);
  p.fill((x, y) => {
    const [d1, , , , , r] = v(x, y);
    const R = 4 + r * 4;
    if (r < 0.55 && d1 < R) {
      // cristais facetados
      const t = 1 - d1 / R;
      const facet = K > 1 ? Math.floor(t * 4) / 4 : t;
      return [mixc(a, b, facet), 0.6 + t * 0.4, metallic];
    }
    return null;
  });
}
function wool(p, base) {
  const f = p.fbm(8, 3, 17);
  p.fill((x, y) => {
    const weave = (Math.sin((x + y) * 0.9) + Math.sin((x - y) * 0.9)) * 0.06;
    const fiber = K > 1 ? Math.sin(x * 3.1 + Math.sin(y * 1.7) * 2) * 0.03 : 0;
    return [mul(base, 0.86 + f(x, y) * 0.2 + weave + fiber + (p.rnd() - 0.5) * 0.08), 0.5 + weave * 3, 0.03];
  });
}
function metal(p, base) {
  const f = p.fbm(2, 3, 18);
  p.fill((x, y) => {
    const brush = Math.sin(y * 2.3 + f(x, y) * 3) * 0.04 + (p.rnd() - 0.5) * 0.05;
    const border = Math.min(x, y, V - 1 - x, V - 1 - y);
    let k = 1 + brush;
    if (border < 2) k *= x < 2 || y < 2 ? 1.2 : 0.7;
    // rebites nos cantos
    const rv = [8, V - 9].some((cx) => [8, V - 9].some((cy) => Math.hypot(x - cx, y - cy) < 2.2));
    return [mul(base, k * (rv ? 1.15 : 1)), border < 2 ? 0.2 : rv ? 0.95 : 0.7, 0.85];
  });
}
// plantas finas: folhas compridas e curvas
function blades(p, colors, n, minH, maxH) {
  p.fill(() => [[0, 0, 0, 0], 0]);
  const count = Math.round(n * (K > 1 ? 1.5 : 1));
  for (let i = 0; i < count; i++) {
    let x = 6 + p.rnd() * (V - 12);
    const h = minH + p.rnd() * (maxH - minH);
    const lean = (p.rnd() - 0.5) * 0.9;
    const w0 = (1.6 + p.rnd() * 1.4) * (K > 1 ? 0.8 : 1);
    const c = colors[Math.floor(p.rnd() * colors.length)];
    for (let k = 0; k < h; k += 1 / K) {
      const t = k / h;
      const w = w0 * (1 - t * 0.85);
      const y = V - 1 - k;
      for (let dx = -w; dx <= w; dx += 0.5 / K) p.set(x + dx, y, [...mul(c, 0.7 + t * 0.45 + dx * 0.05), 1], t, 0.15);
      x += lean * (0.3 + t * 1.2) / K;
    }
  }
}

const PAINTERS = {
  tall_grass: (p) => blades(p, GRASS, 16, 20, 58),
  sugar_cane: (p) => {
    p.fill(() => [[0, 0, 0, 0], 0]);
    for (const sx of [12, 32, 50]) for (let y = 0; y < V; y += 1 / K) for (let dx = -2; dx <= 2; dx += 1 / K) {
      const seg = (y + sx) % 20 < 2;
      p.set(sx + dx, y, [...mul(seg ? C(150, 200, 110) : C(104, 166, 74), 0.85 + dx * 0.06), 1], seg ? 0.3 : 0.7, 0.2);
    }
  },
  stone: (p) => rock(p, C(140, 140, 142), C(98, 98, 102)),
  dirt,
  grass_top: grassTop,
  grass_side: (p) => grassSide(p, false),
  snow_grass_side: (p) => grassSide(p, true),
  snow: (p) => {
    const f = p.fbm(4, 4, 19);
    p.fill((x, y) => [mul(C(240, 246, 252), 0.93 + f(x, y) * 0.08 + (K > 1 && p.rnd() < 0.01 ? 0.08 : 0)), f(x, y), 0.3 + (p.rnd() < 0.02 ? 0.6 : 0)]);
  },
  sand: (p) => sand(p, C(222, 206, 160)),
  sandstone_top: (p) => sand(p, C(220, 204, 156)),
  sandstone_bottom: (p) => sand(p, C(206, 190, 142)),
  sandstone_side: (p) => {
    sand(p, C(214, 198, 148));
    const f = p.fbm(4, 3, 20);
    p.fill((x, y) => {
      const band = Math.sin((y + f(x, y) * 6) * 0.5);
      return band > 0.85 ? [mul(C(186, 168, 118), 0.95), 0.2] : null;
    });
  },
  gravel: (p) => pebbles(p, 70, [C(130, 124, 120), C(100, 96, 92), C(160, 154, 148), C(124, 108, 96), C(84, 82, 80)], C(60, 56, 52)),
  cobblestone: (p) => pebbles(p, 22, [C(126, 126, 128), C(110, 110, 112), C(146, 146, 148), C(98, 98, 100)], C(52, 52, 54)),
  mossy_cobblestone: (p) => {
    pebbles(p, 22, [C(126, 126, 128), C(110, 110, 112), C(146, 146, 148)], C(52, 52, 54), 1);
    const m = p.fbm(4, 4, 21);
    p.fill((x, y) => (m(x, y) > 0.55 ? [mul(C(74, 110, 46), 0.75 + p.rnd() * 0.4), 0.7, 0.1] : null));
  },
  bedrock: (p) => pebbles(p, 30, [C(60, 60, 60), C(40, 40, 42), C(90, 90, 90), C(28, 28, 30)], C(14, 14, 14)),
  bricks: (p) => bricks(p, 32, 16, C(150, 72, 56), C(180, 172, 164)),
  stone_bricks: (p) => bricks(p, 32, 32, C(132, 132, 134), C(70, 70, 72)),
  mossy_stone_bricks: (p) => bricks(p, 32, 32, C(132, 132, 134), C(70, 70, 72), { moss: true }),
  cracked_stone_bricks: (p) => {
    bricks(p, 32, 32, C(126, 126, 128), C(70, 70, 72));
    for (const sx of [12, 44]) {
      let x = sx;
      for (let y = 0; y < V; y += 1 / K) {
        p.set(x, y, C(40, 40, 40), 0, 0);
        x += (p.rnd() < 0.3 ? 1 : p.rnd() < 0.3 ? -1 : 0) / K;
      }
    }
  },
  planks: (p) => wood(p, C(176, 140, 86), C(112, 82, 46)),
  birch_planks: (p) => wood(p, C(214, 196, 140), C(160, 140, 92)),
  spruce_planks: (p) => wood(p, C(128, 92, 54), C(74, 52, 30)),
  log_side: (p) => bark(p, C(112, 86, 52), C(52, 38, 22), true),
  spruce_log_side: (p) => bark(p, C(80, 56, 32), C(36, 24, 14)),
  birch_log_side: birchBark,
  log_top: (p) => rings(p, C(186, 150, 96), C(80, 60, 36)),
  birch_log_top: (p) => rings(p, C(210, 192, 136), C(220, 218, 208)),
  spruce_log_top: (p) => rings(p, C(150, 112, 68), C(60, 42, 24)),
  leaves: (p) => leaves(p, C(62, 120, 34)),
  birch_leaves: (p) => leaves(p, C(100, 148, 58)),
  spruce_leaves: (p) => leaves(p, C(44, 86, 52)),
  coal_ore: (p) => ore(p, C(20, 20, 22), C(54, 54, 58), 0.3),
  iron_ore: (p) => ore(p, C(170, 130, 100), C(226, 190, 160), 0.6),
  gold_ore: (p) => ore(p, C(210, 160, 30), C(255, 236, 110), 0.9),
  diamond_ore: (p) => ore(p, C(30, 170, 180), C(190, 255, 255), 1.0),
  obsidian: (p) => {
    const f = p.fbm(4, 5, 22);
    p.fill((x, y) => {
      const v = f(x, y);
      return [mixc(C(14, 10, 24), C(70, 46, 110), v * v * 1.4), v, 0.9];
    });
  },
  clay: (p) => {
    const f = p.fbm(4, 4, 23);
    p.fill((x, y) => [mul(C(162, 168, 182), 0.9 + f(x, y) * 0.15), f(x, y) * 0.4, 0.15]);
  },
  ice: (p) => {
    const f = p.fbm(4, 4, 24), c = p.fbm(8, 3, 25);
    p.fill((x, y) => {
      const cr = Math.abs(c(x, y) - 0.5) < 0.02;
      return [[...mul(cr ? C(230, 240, 255) : C(150, 186, 250), 0.9 + f(x, y) * 0.15), 0.78], cr ? 0.3 : 0.6, 1.0];
    });
  },
  glass: (p) => {
    p.fill((x, y) => {
      const e = Math.min(x, y, V - 1 - x, V - 1 - y);
      if (e < 2) return [[0.8, 0.9, 0.94, 1], 0.6, 0.9];
      const streak = (x - y > 14 && x - y < 20 && x < 40) || (x - y > -30 && x - y < -27 && x < 20);
      return [[0.9, 0.97, 1, streak ? 0.85 : 0], 0.5, 1];
    });
  },
  iron_block: (p) => metal(p, C(226, 226, 228)),
  gold_block: (p) => metal(p, C(250, 212, 64)),
  diamond_block: (p) => metal(p, C(110, 226, 220)),
  wool_white: (p) => wool(p, C(236, 238, 238)),
  wool_red: (p) => wool(p, C(160, 38, 34)),
  wool_blue: (p) => wool(p, C(52, 58, 160)),
  wool_green: (p) => wool(p, C(84, 110, 28)),
  wool_yellow: (p) => wool(p, C(248, 198, 40)),
  wool_black: (p) => wool(p, C(30, 30, 34)),
  farmland: (p) => {
    const f = p.fbm(4, 4, 26);
    p.fill((x, y) => {
      const r = Math.sin(y * 0.4) * 0.5 + 0.5;
      return [mul(C(120, 84, 54), 0.75 + r * 0.25 + f(x, y) * 0.15), r, 0.04];
    });
  },
  farmland_wet: (p) => {
    const f = p.fbm(4, 4, 26);
    p.fill((x, y) => {
      const r = Math.sin(y * 0.4) * 0.5 + 0.5;
      return [mul(C(70, 46, 30), 0.75 + r * 0.25 + f(x, y) * 0.15), r, 0.35];
    });
  },
  hay_side: (p) => {
    strokes(p, 0, V, [C(206, 170, 50), C(186, 150, 40), C(226, 196, 80)], 1600, 2, 7, (q) => Math.PI / 2 + (q.rnd() - 0.5) * 0.4);
    p.fill((x, y) => ((y >= 12 && y <= 14) || (y >= 49 && y <= 51) ? [C(120, 70, 30), 0.8] : null));
  },
};

// textura sem pintor próprio: amplia a de 16 px e acrescenta detalhe fino
function upscale(p, name) {
  const src = tileImageData(name);
  const f = p.fbm(16, 2, 27);
  p.fill((x, y) => {
    const sx = Math.min(15, Math.max(0, Math.floor((x + 0.5) / 4))), sy = Math.min(15, Math.max(0, Math.floor((y + 0.5) / 4)));
    const i = (sy * 16 + sx) * 4;
    if (src[i + 3] === 0) return [[0, 0, 0, 0], 0, 0];
    const k = 0.92 + f(x, y) * 0.16;
    const col = [(src[i] / 255) * k, (src[i + 1] / 255) * k, (src[i + 2] / 255) * k, src[i + 3] / 255];
    const lum = (col[0] + col[1] + col[2]) / 3;
    return [col, lum, 0.05];
  });
}

const KEEP_PIXELS = new Set(['torch', 'tnt_side', 'tnt_top', 'crafting_front', 'crafting_side', 'crafting_top', 'furnace_front', 'furnace_front_on', 'chest_front', 'pumpkin_face']);
const cache = new Map();

// Gera o atlas: albedo (cor + transparência) e material (relevo x/y, altura, brilho).
export function buildHDAtlas(size = 64) {
  if (cache.has(size)) return cache.get(size);
  S = size;
  K = S / V;
  const N = ATLAS_COLS * S;
  const albedo = new Uint8Array(N * N * 4);
  const material = new Uint8Array(N * N * 4);
  for (const [name, idx] of tileEntries()) {
    const ox = (idx % ATLAS_COLS) * S, oy = Math.floor(idx / ATLAS_COLS) * S;
    // linha da textura (y de cima para baixo) → linha nos dados (de baixo para cima)
    const put = (px, py, rgba, mat) => {
      const o = ((N - 1 - (oy + py)) * N + ox + px) * 4;
      albedo.set(rgba, o);
      material.set(mat, o);
    };
    if (name.startsWith('crack_')) {
      const src = tileImageData(name);
      for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
        const i = ((Math.floor((py * 16) / S)) * 16 + Math.floor((px * 16) / S)) * 4;
        put(px, py, [src[i], src[i + 1], src[i + 2], src[i + 3]], [128, 128, 255, 0]);
      }
      continue;
    }
    let seed = 7;
    for (let i = 0; i < name.length; i++) seed = (seed * 31 + name.charCodeAt(i)) | 0;
    const p = new HD(seed);
    const painter = PAINTERS[name.replace(/_opaque$/, '')];
    if (painter) painter(p);
    else upscale(p, name);
    if (name.endsWith('_opaque')) for (let i = 0; i < S * S; i++) if (p.a[i] < 0.5) { p.r[i] *= 0.3; p.g[i] *= 0.3; p.b[i] *= 0.3; p.a[i] = 1; }
    // microdetalhe do MAX: grão fino na cor e na altura
    if (K > 1 && painter) for (let i = 0; i < S * S; i++) {
      const n = (p.rnd() - 0.5) * 0.05;
      p.r[i] *= 1 + n;
      p.g[i] *= 1 + n;
      p.b[i] *= 1 + n;
      p.h[i] += n * 0.6;
    }
    const strength = (painter ? 3.2 : KEEP_PIXELS.has(name) ? 1.2 : 2.0) * K;
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const hx = p.h[y * S + ((x + 1) % S)] - p.h[y * S + ((x + S - 1) % S)];
      const hy = p.h[((y + 1) % S) * S + x] - p.h[((y + S - 1) % S) * S + x];
      const nx = -hx * strength, ny = hy * strength;
      const l = Math.hypot(nx, ny, 1);
      put(
        x,
        y,
        [Math.min(255, p.r[i] * 255), Math.min(255, p.g[i] * 255), Math.min(255, p.b[i] * 255), Math.min(255, p.a[i] * 255)],
        [((nx / l) * 0.5 + 0.5) * 255, ((ny / l) * 0.5 + 0.5) * 255, clamp01(p.h[i]) * 255, clamp01(p.gloss[i]) * 255],
      );
    }
  }
  const mk = (data) => {
    const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.anisotropy = 8;
    t.generateMipmaps = true;
    t.colorSpace = THREE.NoColorSpace;
    t.needsUpdate = true;
    return t;
  };
  const out = { albedo: mk(albedo), normal: mk(material), size };
  cache.set(size, out);
  return out;
}

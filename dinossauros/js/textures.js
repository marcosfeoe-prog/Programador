// Texturas geradas do zero em <canvas>: pele de dinossauro (escamas Voronoi +
// padrões + mapa de normais), terreno, vegetação, água e olhos.
// Nenhuma imagem externa é usada.
import * as THREE from 'three';
import { makeNoise, rng, clamp, smoothstep, lerp } from './util.js';

let SIZE = 512;
let ANISO = 4;
export function setTextureQuality(q, maxAniso = 4) {
  SIZE = q === 'baixa' ? 256 : 512;
  ANISO = q === 'baixa' ? 1 : Math.min(8, maxAniso);
}

function makeCanvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTex(c, { srgb = true, repeat = true } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = ANISO;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

const hexRGB = (h) => {
  const n = parseInt(h.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

// Altura de escamas por Voronoi num toro (sem emendas). Retorna Float32Array S×S.
function voronoiScales(S, cells, seed, roundness = 1) {
  const r = rng(seed);
  const cs = S / cells;
  const px = new Float32Array(cells * cells);
  const py = new Float32Array(cells * cells);
  for (let j = 0; j < cells; j++)
    for (let i = 0; i < cells; i++) {
      // grade levemente deslocada em fileiras → escamas em "tijolo", como em répteis
      const off = (j & 1) * 0.5;
      px[j * cells + i] = (i + off + 0.2 + r() * 0.6) * cs;
      py[j * cells + i] = (j + 0.2 + r() * 0.6) * cs;
    }
  const H = new Float32Array(S * S);
  for (let y = 0; y < S; y++) {
    const cj = Math.floor(y / cs);
    for (let x = 0; x < S; x++) {
      const ci = Math.floor(x / cs);
      let f1 = 1e9;
      let f2 = 1e9;
      for (let dj = -1; dj <= 1; dj++) {
        const jj = cj + dj;
        const wj = ((jj % cells) + cells) % cells;
        const sy = Math.floor(jj / cells) * S;
        for (let di = -2; di <= 2; di++) {
          const ii = ci + di;
          const wi = ((ii % cells) + cells) % cells;
          const sx = Math.floor(ii / cells) * S;
          const k = wj * cells + wi;
          const dx = px[k] + sx - x;
          const dy = py[k] + sy - y;
          const d = dx * dx + dy * dy;
          if (d < f1) {
            f2 = f1;
            f1 = d;
          } else if (d < f2) f2 = d;
        }
      }
      f1 = Math.sqrt(f1);
      f2 = Math.sqrt(f2);
      const edge = smoothstep(0, cs * 0.14, f2 - f1);
      const dome = 1 - Math.pow(clamp(f1 / (cs * 0.75), 0, 1), 2) * 0.6 * roundness;
      H[y * S + x] = edge * dome;
    }
  }
  return H;
}

function normalFromHeight(H, S, strength) {
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const d = img.data;
  for (let y = 0; y < S; y++) {
    const ym = ((y - 1 + S) % S) * S;
    const yp = ((y + 1) % S) * S;
    for (let x = 0; x < S; x++) {
      const xm = (x - 1 + S) % S;
      const xp = (x + 1) % S;
      const nx = (H[y * S + xm] - H[y * S + xp]) * strength;
      const ny = (H[ym + x] - H[yp + x]) * strength;
      const l = Math.hypot(nx, ny, 1);
      const o = (y * S + x) * 4;
      d[o] = (nx / l) * 127 + 128;
      d[o + 1] = (ny / l) * 127 + 128;
      d[o + 2] = (1 / l) * 127 + 128;
      d[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return toTex(c, { srgb: false });
}

// ------------------------------------------------------------------ pele
// skin = { base, belly, pattern, type: 'stripes'|'spots'|'mottled'|'bands', count, scale }
// Coordenada u = ao redor do corpo (0 = dorso, 0.5 = barriga); v = ao longo do corpo.
const skinCache = new Map();
export function skinTextures(skin, seed = 7) {
  const key = JSON.stringify(skin) + seed + SIZE;
  if (skinCache.has(key)) return skinCache.get(key);
  const S = SIZE;
  const N = makeNoise(seed);
  const cells = Math.round((skin.scale || 30) * (S / 512));
  const H = voronoiScales(S, cells, seed + 1, 1);
  // escamas grandes (osteodermos) ao longo do dorso
  const HB = voronoiScales(S, Math.max(4, Math.round(cells / 3)), seed + 2, 0.7);
  const base = hexRGB(skin.base);
  const belly = hexRGB(skin.belly);
  const pat = hexRGB(skin.pattern);
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  const px = img.data;
  const count = skin.count || 3;
  for (let y = 0; y < S; y++) {
    const v = y / S;
    for (let x = 0; x < S; x++) {
      const u = x / S;
      const i = y * S + x;
      const dors = Math.cos(u * Math.PI * 2); // 1 dorso, -1 barriga
      const back = smoothstep(-0.55, 0.2, dors);
      const big = smoothstep(0.55, 0.92, dors);
      const h = lerp(H[i], Math.max(H[i] * 0.6, HB[i]), big * 0.85);
      H[i] = h;
      let col = mix3(belly, base, back);
      const m = N.fbm(u * 6, v * 6, 4, 6, 6);
      const warp = N.fbm(u * 3 + 7, v * 3, 3, 3, 3);
      let mask = 0;
      if (skin.type === 'stripes' || skin.type === 'bands') {
        const sharp = skin.type === 'bands' ? 0.25 : 0.15;
        const s = Math.sin((v * count + warp * 0.45 + Math.abs(u - 0.5) * 0.3) * Math.PI * 2);
        mask = smoothstep(0.35 - sharp, 0.35 + sharp, s) * smoothstep(-0.25, 0.35, dors);
      } else if (skin.type === 'spots') {
        const n = N.fbm(u * 10, v * 10, 3, 10, 10);
        mask = smoothstep(0.18, 0.3, n) * smoothstep(-0.3, 0.3, dors);
      } else {
        const n = N.fbm(u * 5 + 3, v * 5, 4, 5, 5);
        mask = smoothstep(0.05, 0.25, n) * 0.8 * back;
      }
      col = mix3(col, pat, mask * (skin.strength ?? 0.75));
      // faixa escura no dorso
      col = mix3(col, pat, smoothstep(0.9, 1, dors) * 0.35);
      const k = (1 + m * 0.22) * (0.6 + 0.48 * h);
      const o = i * 4;
      px[o] = clamp(col[0] * k, 0, 255);
      px[o + 1] = clamp(col[1] * k, 0, 255);
      px[o + 2] = clamp(col[2] * k, 0, 255);
      px[o + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const out = { map: toTex(c), normalMap: normalFromHeight(H, S, 5 * (S / 512) + 1.5) };
  skinCache.set(key, out);
  return out;
}

// Chifre / dente / garra: marfim com estrias
let hornTex = null;
export function hornTexture() {
  if (hornTex) return hornTex;
  const S = 128;
  const N = makeNoise(31);
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const v = y / S;
      const n = N.fbm((x / S) * 4, v * 32, 3, 4, 32);
      const t = 0.75 + n * 0.25;
      const o = (y * S + x) * 4;
      // base mais escura, ponta clara
      const tip = smoothstep(0, 1, v);
      img.data[o] = (150 + 80 * tip) * t;
      img.data[o + 1] = (130 + 80 * tip) * t;
      img.data[o + 2] = (95 + 70 * tip) * t;
      img.data[o + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  hornTex = toTex(c);
  return hornTex;
}

const eyeCache = new Map();
export function eyeTexture(iris = '#d8a020', slit = true) {
  const key = iris + slit;
  if (eyeCache.has(key)) return eyeCache.get(key);
  const S = 128;
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#1a120a';
  ctx.fillRect(0, 0, S, S);
  // a esfera do olho é mapeada com u ao redor; a íris fica no centro da textura
  const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S * 0.3);
  const [r, gg, b] = hexRGB(iris);
  g.addColorStop(0, `rgb(${r * 1.2},${gg * 1.2},${b})`);
  g.addColorStop(0.7, `rgb(${r},${gg},${b})`);
  g.addColorStop(1, `rgb(${r * 0.4},${gg * 0.35},${b * 0.3})`);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(S / 2, S / 2, S * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#050302';
  ctx.beginPath();
  if (slit) ctx.ellipse(S / 2, S / 2, S * 0.05, S * 0.24, 0, 0, Math.PI * 2);
  else ctx.arc(S / 2, S / 2, S * 0.12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.arc(S * 0.42, S * 0.4, S * 0.045, 0, Math.PI * 2);
  ctx.fill();
  const t = toTex(c, { repeat: false });
  eyeCache.set(key, t);
  return t;
}

// ------------------------------------------------------------------ terreno
function pixelTexture(S, fn, seed) {
  const N = makeNoise(seed);
  const c = makeCanvas(S);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(S, S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) {
      const col = fn(x / S, y / S, N);
      const o = (y * S + x) * 4;
      img.data[o] = clamp(col[0], 0, 255);
      img.data[o + 1] = clamp(col[1], 0, 255);
      img.data[o + 2] = clamp(col[2], 0, 255);
      img.data[o + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return { c, ctx, N };
}

// desenha com repetição nas bordas (textura sem emendas)
function wrapDraw(ctx, S, x, y, r, draw) {
  for (let ox = -1; ox <= 1; ox++)
    for (let oy = -1; oy <= 1; oy++) {
      const xx = x + ox * S;
      const yy = y + oy * S;
      if (xx + r < 0 || xx - r > S || yy + r < 0 || yy - r > S) continue;
      draw(xx, yy);
    }
}

export function terrainTextures() {
  const S = SIZE;
  const R = rng(99);
  // grama
  const grass = pixelTexture(
    S,
    (u, v, N) => {
      const n = N.fbm(u * 8, v * 8, 5, 8, 8);
      const m = N.fbm(u * 3 + 5, v * 3, 3, 3, 3);
      const base = mix3([62, 92, 34], [104, 118, 46], smoothstep(-0.3, 0.4, m));
      const k = 0.85 + n * 0.35;
      return [base[0] * k, base[1] * k, base[2] * k];
    },
    11,
  );
  {
    const ctx = grass.ctx;
    ctx.lineCap = 'round';
    for (let i = 0; i < S * 9; i++) {
      const x = R() * S;
      const y = R() * S;
      const len = 3 + R() * 7 * (S / 512);
      const a = -Math.PI / 2 + (R() - 0.5) * 0.9;
      const l = 60 + R() * 70;
      ctx.strokeStyle = `rgba(${l * 0.7 | 0},${(l + 40) | 0},${l * 0.35 | 0},${0.35 + R() * 0.4})`;
      ctx.lineWidth = 0.6 + R() * 0.9;
      wrapDraw(ctx, S, x, y, len, (xx, yy) => {
        ctx.beginPath();
        ctx.moveTo(xx, yy);
        ctx.lineTo(xx + Math.cos(a) * len, yy + Math.sin(a) * len);
        ctx.stroke();
      });
    }
  }
  // terra
  const dirt = pixelTexture(
    S,
    (u, v, N) => {
      const n = N.fbm(u * 10, v * 10, 5, 10, 10);
      const m = N.fbm(u * 4, v * 4, 3, 4, 4);
      const k = 0.8 + n * 0.3;
      const b = mix3([96, 70, 46], [128, 98, 64], smoothstep(-0.4, 0.4, m));
      return [b[0] * k, b[1] * k, b[2] * k];
    },
    12,
  );
  {
    const ctx = dirt.ctx;
    for (let i = 0; i < S * 1.4; i++) {
      const x = R() * S;
      const y = R() * S;
      const r = (0.8 + R() * 2.6) * (S / 512);
      const l = 80 + R() * 80;
      ctx.fillStyle = `rgba(${l | 0},${(l * 0.85) | 0},${(l * 0.7) | 0},0.8)`;
      wrapDraw(ctx, S, x, y, r, (xx, yy) => {
        ctx.beginPath();
        ctx.ellipse(xx, yy, r, r * 0.75, R() * 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }
  // rocha
  const rock = pixelTexture(
    S,
    (u, v, N) => {
      const n = N.fbm(u * 6, v * 6, 6, 6, 6);
      const strata = Math.sin((v * 14 + N.fbm(u * 2, v * 2, 3, 2, 2) * 1.8) * Math.PI * 2);
      const crack = smoothstep(0.03, 0.0, Math.abs(N.fbm(u * 5 + 9, v * 5, 4, 5, 5)));
      let k = 0.75 + n * 0.35 + strata * 0.05 - crack * 0.35;
      return [118 * k, 112 * k, 104 * k];
    },
    13,
  );
  // areia
  const sand = pixelTexture(
    S,
    (u, v, N) => {
      const n = N.fbm(u * 24, v * 24, 3, 24, 24);
      const rip = Math.sin((v * 22 + N.fbm(u * 3, v * 3, 2, 3, 3) * 2) * Math.PI * 2) * 0.04;
      const k = 0.92 + n * 0.12 + rip;
      return [196 * k, 178 * k, 136 * k];
    },
    14,
  );
  return { grass: toTex(grass.c), dirt: toTex(dirt.c), rock: toTex(rock.c), sand: toTex(sand.c) };
}

export function waterNormalTexture() {
  const S = 256;
  const N = makeNoise(21);
  const H = new Float32Array(S * S);
  for (let y = 0; y < S; y++)
    for (let x = 0; x < S; x++) H[y * S + x] = N.fbm((x / S) * 6, (y / S) * 6, 4, 6, 6);
  return normalFromHeight(H, S, 6);
}

// ------------------------------------------------------------------ vegetação
export function barkTexture() {
  const S = 256;
  const { c } = pixelTexture(
    S,
    (u, v, N) => {
      const n = N.fbm(u * 12, v * 3, 4, 12, 3);
      const ridge = Math.abs(Math.sin((u * 18 + n * 0.8) * Math.PI));
      const k = 0.55 + ridge * 0.45 + n * 0.2;
      return [92 * k, 70 * k, 52 * k];
    },
    15,
  );
  return toTex(c);
}

// Folha de samambaia / cicadácea com alfa (pinas dos dois lados da raque)
export function frondTexture(col = [58, 108, 40], wide = false, seed = 16) {
  const W = 128;
  const Hh = 256;
  const R = rng(seed);
  const c = makeCanvas(W, Hh);
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, W, Hh);
  const n = wide ? 18 : 26;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const y = Hh - 8 - t * (Hh - 16);
    const len = (W / 2 - 4) * Math.sin(Math.PI * (0.12 + t * 0.88)) * (wide ? 1 : 0.9);
    const w = wide ? 5 : 3.5;
    for (const s of [-1, 1]) {
      const l = 0.75 + R() * 0.4;
      ctx.fillStyle = `rgb(${(col[0] * l) | 0},${(col[1] * l) | 0},${(col[2] * l) | 0})`;
      ctx.save();
      ctx.translate(W / 2, y);
      ctx.rotate(s * (Math.PI / 2 - 0.45));
      ctx.beginPath();
      ctx.ellipse(0, -len / 2, w, len / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
  ctx.strokeStyle = `rgb(${col[0] * 0.6},${col[1] * 0.55},${col[2] * 0.4})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W / 2, Hh);
  ctx.lineTo(W / 2, 6);
  ctx.stroke();
  const t = toTex(c, { repeat: false });
  return t;
}

export function needleTexture() {
  const S = 256;
  const R = rng(17);
  const { c, ctx } = pixelTexture(
    S,
    (u, v, N) => {
      const n = N.fbm(u * 8, v * 8, 4, 8, 8);
      const k = 0.7 + n * 0.4;
      return [30 * k, 62 * k, 34 * k];
    },
    17,
  );
  for (let i = 0; i < S * 12; i++) {
    const x = R() * S;
    const y = R() * S;
    const a = R() * Math.PI;
    const l = 3 + R() * 5;
    const g = 50 + R() * 70;
    ctx.strokeStyle = `rgba(${g * 0.5 | 0},${g | 0},${g * 0.45 | 0},0.6)`;
    ctx.lineWidth = 1;
    wrapDraw(ctx, S, x, y, l, (xx, yy) => {
      ctx.beginPath();
      ctx.moveTo(xx, yy);
      ctx.lineTo(xx + Math.cos(a) * l, yy + Math.sin(a) * l);
      ctx.stroke();
    });
  }
  return toTex(c);
}

export function grassTuftTexture() {
  const W = 128;
  const R = rng(18);
  const c = makeCanvas(W);
  const ctx = c.getContext('2d');
  ctx.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const x = 10 + R() * (W - 20);
    const h = W * (0.45 + R() * 0.5);
    const bend = (R() - 0.5) * 30;
    const g = 70 + R() * 70;
    ctx.strokeStyle = `rgb(${(g * 0.7) | 0},${(g + 30) | 0},${(g * 0.3) | 0})`;
    ctx.lineWidth = 1.5 + R() * 2;
    ctx.beginPath();
    ctx.moveTo(x, W);
    ctx.quadraticCurveTo(x + bend * 0.3, W - h * 0.6, x + bend, W - h);
    ctx.stroke();
  }
  return toTex(c, { repeat: false });
}

export function rockTexture() {
  const S = 256;
  const { c } = pixelTexture(
    S,
    (u, v, N) => {
      const n = N.fbm(u * 6, v * 6, 5, 6, 6);
      const lic = smoothstep(0.25, 0.45, N.fbm(u * 4 + 3, v * 4, 3, 4, 4));
      let col = mix3([120, 116, 108], [96, 110, 70], lic * 0.7);
      const k = 0.7 + n * 0.45;
      return [col[0] * k, col[1] * k, col[2] * k];
    },
    19,
  );
  return toTex(c);
}

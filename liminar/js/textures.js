// Texturas procedurais geradas em canvas (sem arquivos externos).
// Cada gerador devolve { map, normalMap?, roughnessMap?, emissiveMap? }.
import * as THREE from 'three';
import { mulberry32, clamp } from './util.js';

let maxAniso = 1;
const cache = new Map();

export function initTextures(r) {
  maxAniso = Math.min(8, r.capabilities.getMaxAnisotropy());
}

export function clearTextureCache() {
  for (const t of cache.values()) {
    for (const k in t) if (t[k] && t[k].isTexture) t[k].dispose();
  }
  cache.clear();
}

// Busca (ou gera) a textura `name` no tamanho `size`.
export function getTex(name, size) {
  const key = name + '@' + size;
  if (!cache.has(key)) {
    const gen = GENERATORS[name];
    if (!gen) throw new Error('Textura desconhecida: ' + name);
    cache.set(key, gen(size));
  }
  return cache.get(key);
}

// ------------------------------------------------------------------ helpers
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function toTex(cv, { srgb = true, repeat = true, mips = true } = {}) {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  else t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.anisotropy = maxAniso;
  t.generateMipmaps = mips;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// Campo de ruído de valor periódico (repete na largura e na altura).
function noiseField(w, h, px, py, oct, seed, gain = 0.5) {
  const out = new Float32Array(w * h);
  let amp = 1;
  let norm = 0;
  for (let o = 0; o < oct; o++) {
    const PX = px << o;
    const PY = py << o;
    const lat = new Float32Array(PX * PY);
    const rnd = mulberry32(seed * 131 + o * 7919);
    for (let i = 0; i < lat.length; i++) lat[i] = rnd() * 2 - 1;
    const sx = PX / w;
    const sy = PY / h;
    for (let y = 0; y < h; y++) {
      const fy = y * sy;
      const yi = fy | 0;
      let ty = fy - yi;
      ty = ty * ty * (3 - 2 * ty);
      const y0 = (yi % PY) * PX;
      const y1 = ((yi + 1) % PY) * PX;
      const row = y * w;
      for (let x = 0; x < w; x++) {
        const fx = x * sx;
        const xi = fx | 0;
        let tx = fx - xi;
        tx = tx * tx * (3 - 2 * tx);
        const x0 = xi % PX;
        const x1 = (xi + 1) % PX;
        const a = lat[y0 + x0];
        const b = lat[y0 + x1];
        const c = lat[y1 + x0];
        const d = lat[y1 + x1];
        const ab = a + (b - a) * tx;
        const cd = c + (d - c) * tx;
        out[row + x] += amp * (ab + (cd - ab) * ty);
      }
    }
    norm += amp;
    amp *= gain;
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}

function whiteNoise(n, seed) {
  const r = mulberry32(seed);
  const a = new Float32Array(n);
  for (let i = 0; i < n; i++) a[i] = r() * 2 - 1;
  return a;
}

// Escreve RGB (0..1) de um callback em um canvas novo.
function paintRGB(w, h, fn, alpha = false) {
  const cv = makeCanvas(w, h);
  const ctx = cv.getContext('2d');
  const img = ctx.createImageData(w, h);
  const d = img.data;
  const o = [0, 0, 0, 1];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      o[3] = 1;
      fn(x, y, i, o);
      const j = i * 4;
      d[j] = clamp(o[0], 0, 1) * 255;
      d[j + 1] = clamp(o[1], 0, 1) * 255;
      d[j + 2] = clamp(o[2], 0, 1) * 255;
      d[j + 3] = alpha ? clamp(o[3], 0, 1) * 255 : 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// Mapa normal (espaço tangente) a partir de um campo de altura periódico.
function normalMap(hf, w, h, strength) {
  const cv = paintRGB(w, h, (x, y, i, o) => {
    const xl = (x - 1 + w) % w;
    const xr = (x + 1) % w;
    const yu = (y - 1 + h) % h;
    const yd = (y + 1) % h;
    const dx = (hf[y * w + xr] - hf[y * w + xl]) * strength;
    const dy = (hf[yd * w + x] - hf[yu * w + x]) * strength;
    const l = Math.hypot(dx, dy, 1);
    o[0] = (-dx / l) * 0.5 + 0.5;
    o[1] = (dy / l) * 0.5 + 0.5;
    o[2] = (1 / l) * 0.5 + 0.5;
  });
  return toTex(cv, { srgb: false });
}

// Lê os pixels de um canvas como altura (luminância 0..1).
function canvasHeight(cv) {
  const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
  const out = new Float32Array(cv.width * cv.height);
  for (let i = 0; i < out.length; i++) out[i] = d[i * 4] / 255;
  return out;
}

// Rachadura em passeio aleatório desenhada no contexto.
function crack(ctx, rnd, x, y, len, w, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  let a = rnd() * Math.PI * 2;
  for (let i = 0; i < len; i++) {
    a += (rnd() - 0.5) * 0.9;
    x += Math.cos(a) * 4;
    y += Math.sin(a) * 4;
    ctx.lineTo(x, y);
    if (rnd() < 0.05) {
      ctx.stroke();
      crack(ctx, rnd, x, y, len * 0.4, w * 0.7, color);
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  }
  ctx.stroke();
}

// Desenha algo nas 9 posições de ladrilho para que repita sem emenda.
function wrapDraw(w, h, x, y, fn) {
  for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) fn(x + ox * w, y + oy * h);
}

// ------------------------------------------------------------------ geradores
const GENERATORS = {
  // Papel de parede amarelo do Nível 0: 1,2 m de largura × altura total da parede.
  wallpaper(S) {
    const W = S;
    const H = S * 2;
    const low = noiseField(W, H, 3, 6, 4, 11);
    const mid = noiseField(W, H, 12, 24, 3, 12);
    const stain = noiseField(W, H, 4, 8, 5, 13);
    const fib = whiteNoise(W * H, 14);
    const hf = new Float32Array(W * H);
    const base = paintRGB(W, H, (x, y, i, o) => {
      const u = x / W;
      const v = y / H; // 0 = topo
      // listras verticais sutis (8 por ladrilho) e motivo em losango
      const su = (u * 8) % 1;
      const stripe = su < 0.5 ? 1 : 0.975;
      const mv = (v * 34) % 1;
      const dd = Math.abs(su - 0.5) * 2;
      const diamond = Math.abs(dd - Math.abs(mv - 0.5) * 2) < 0.07 ? 0.972 : 1;
      const dot = Math.hypot(su - 0.5, mv - 0.5) < 0.06 ? 0.96 : 1;
      // emendas das tiras de papel
      const seam = Math.abs(((u * 2 + 0.25) % 1) - 0.5) > 0.497 ? 0.93 : 1;
      let k = stripe * diamond * dot * seam;
      k *= 1 + low[i] * 0.07 + mid[i] * 0.025 + fib[i] * 0.025;
      // manchas de umidade perto do chão e do teto
      const edge = Math.max(Math.pow(v, 7) * 0.9, Math.pow(1 - v, 16) * 0.45);
      const st = clamp((stain[i] + edge * 1.3 - 0.6) * 2.2, 0, 1);
      // sujeira no rodapé
      const dirt = Math.pow(clamp((v - 0.94) / 0.06, 0, 1), 1.5);
      let r = 0.79 * k;
      let g = 0.71 * k;
      let b = 0.39 * k;
      r = r * (1 - st * 0.13) + st * 0.02;
      g = g * (1 - st * 0.17) + st * 0.01;
      b = b * (1 - st * 0.22);
      // borda da mancha mais escura (anel de água)
      const ring = clamp(1 - Math.abs(stain[i] + edge * 1.3 - 0.6) * 18, 0, 1) * st * 0.05;
      r -= ring;
      g -= ring * 1.1;
      b -= ring * 1.2;
      o[0] = r * (1 - dirt * 0.35);
      o[1] = g * (1 - dirt * 0.4);
      o[2] = b * (1 - dirt * 0.45);
      hf[i] = fib[i] * 0.15 + mid[i] * 0.3 + (seam < 1 ? -0.8 : 0) + (diamond < 1 ? -0.1 : 0);
    });
    // escorridos de água do teto
    const ctx = base.getContext('2d');
    const rnd = mulberry32(15);
    for (let i = 0; i < 7; i++) {
      const x = rnd() * W;
      const len = H * (0.05 + rnd() * 0.25);
      const g = ctx.createLinearGradient(0, 0, 0, len);
      g.addColorStop(0, 'rgba(110,85,30,0.22)');
      g.addColorStop(1, 'rgba(110,85,30,0)');
      ctx.fillStyle = g;
      wrapDraw(W, 0, x, 0, (xx) => ctx.fillRect(xx, 0, 1 + rnd() * S * 0.006, len));
    }
    return { map: toTex(base), normalMap: normalMap(hf, W, H, 1.2) };
  },

  // Carpete úmido do Nível 0 (ladrilho de 2 m).
  carpet(S) {
    const low = noiseField(S, S, 3, 3, 4, 21);
    const mid = noiseField(S, S, 24, 24, 2, 22);
    const stain = noiseField(S, S, 2, 2, 5, 23);
    const fib = whiteNoise(S * S, 24);
    const fib2 = noiseField(S, S, S / 4, S / 4, 1, 25);
    const hf = new Float32Array(S * S);
    const cv = paintRGB(S, S, (x, y, i, o) => {
      const f = fib[i] * 0.6 + fib2[i] * 0.4;
      let k = 1 + low[i] * 0.09 + mid[i] * 0.05 + f * 0.09;
      const s = clamp((stain[i] - 0.18) * 5, 0, 1);
      const ring = clamp(1 - Math.abs(stain[i] - 0.18) * 30, 0, 1);
      k *= 1 - s * 0.28 - ring * 0.08;
      o[0] = 0.56 * k;
      o[1] = 0.48 * k;
      o[2] = 0.27 * k * (1 - s * 0.15);
      hf[i] = f * 0.6 + mid[i] * 0.2;
    });
    return { map: toTex(cv), normalMap: normalMap(hf, S, S, 2.2) };
  },

  // Forro de placas minerais 0,6 m (ladrilho de 1,2 m = 2×2 placas).
  ceiling(S) {
    const low = noiseField(S, S, 4, 4, 4, 31);
    const pits = whiteNoise(S * S, 32);
    const stain = noiseField(S, S, 2, 2, 4, 33);
    const hf = new Float32Array(S * S);
    const bar = Math.max(1.5, S * 0.012);
    const cv = paintRGB(S, S, (x, y, i, o) => {
      const tx = x % (S / 2);
      const ty = y % (S / 2);
      const dEdge = Math.min(tx, ty, S / 2 - tx, S / 2 - ty);
      const isBar = dEdge < bar;
      const bevel = clamp((dEdge - bar) / (bar * 1.5), 0, 1);
      const pit = pits[i] > 0.93 ? 0.8 : pits[i] > 0.86 ? 0.9 : 1;
      let k = isBar ? 0.97 : (0.9 + low[i] * 0.04) * pit * (0.82 + 0.18 * bevel);
      const s = isBar ? 0 : clamp((stain[i] - 0.3) * 4, 0, 1);
      o[0] = k * (1 - s * 0.12);
      o[1] = k * (1 - s * 0.18);
      o[2] = k * (1 - s * 0.3);
      hf[i] = isBar ? 0.4 : (pit < 1 ? -0.4 : 0) + bevel * 0.3 - 0.3;
    });
    return { map: toTex(cv), normalMap: normalMap(hf, S, S, 2) };
  },

  // Lente prismática de luminária 2×4 pés (0,6 × 1,2 m).
  panel(S) {
    const W = S / 2;
    const H = S;
    const cv = paintRGB(W, H, (x, y, i, o) => {
      const u = x / W;
      const v = y / H;
      const fr = (Math.min(u, 1 - u) * 0.6) / 1.2;
      const fr2 = Math.min(v, 1 - v);
      const frame = Math.min(fr * 2, fr2) < 0.025;
      const px = (x * 0.9) % 6;
      const py = (y * 0.9) % 6;
      const prism = 0.9 + 0.1 * (Math.abs(px - 3) + Math.abs(py - 3) < 3 ? 1 : 0);
      const glow = 0.75 + 0.25 * Math.sin(u * Math.PI) * Math.sin(v * Math.PI);
      const k = frame ? 0.18 : prism * glow;
      o[0] = o[1] = o[2] = k;
    });
    return { map: toTex(cv, { repeat: false }) };
  },

  // Parede de concreto moldado (ladrilho de 2,4 m).
  concrete(S) {
    const low = noiseField(S, S, 3, 3, 5, 41);
    const mid = noiseField(S, S, 16, 16, 3, 42);
    const fine = whiteNoise(S * S, 43);
    const streak = noiseField(S, S, 14, 1, 3, 44);
    const hf = new Float32Array(S * S);
    const cv = paintRGB(S, S, (x, y, i, o) => {
      const u = x / S;
      const v = y / S;
      const pu = (u * 2) % 1;
      const pv = (v * 4) % 1;
      const joint = Math.min(pu, 1 - pu) < 0.004 || Math.min(pv, 1 - pv) < 0.006;
      // furos dos tirantes da forma
      const hu = (u * 4) % 1;
      const hv = (v * 4 + 0.5) % 1;
      const hole = Math.hypot(hu - 0.5, (hv - 0.5) * 0.5) < 0.018;
      const st = clamp(streak[i] * 1.6 - 0.25 + (v - 0.5) * 0.3, 0, 1);
      let k = 0.42 + low[i] * 0.07 + mid[i] * 0.03 + fine[i] * 0.03;
      k *= 1 - st * 0.22;
      if (joint) k *= 0.82;
      if (hole) k *= 0.45;
      const bug = fine[i] > 0.985 ? 0.6 : 1;
      o[0] = k * bug;
      o[1] = k * bug * 0.995;
      o[2] = k * bug * 0.97;
      hf[i] = (joint ? -0.5 : 0) + (hole ? -1 : 0) + (bug < 1 ? -0.6 : 0) + mid[i] * 0.25 + fine[i] * 0.05;
    });
    return { map: toTex(cv), normalMap: normalMap(hf, S, S, 2.5) };
  },

  // Piso de concreto polido com juntas (ladrilho de 3 m) e mapa de rugosidade.
  concreteFloor(S) {
    const low = noiseField(S, S, 3, 3, 5, 51);
    const mid = noiseField(S, S, 10, 10, 3, 52);
    const fine = whiteNoise(S * S, 53);
    const pol = noiseField(S, S, 4, 4, 4, 54);
    const hf = new Float32Array(S * S);
    const cv = paintRGB(S, S, (x, y, i, o) => {
      const u = x / S;
      const v = y / S;
      const joint = Math.min(u, 1 - u, v, 1 - v) < 0.003;
      let k = 0.36 + low[i] * 0.08 + mid[i] * 0.04 + fine[i] * 0.025;
      if (joint) k *= 0.6;
      o[0] = k;
      o[1] = k * 0.99;
      o[2] = k * 0.955;
      hf[i] = (joint ? -1 : 0) + mid[i] * 0.15 + fine[i] * 0.04;
    });
    const ctx = cv.getContext('2d');
    const rnd = mulberry32(55);
    for (let i = 0; i < 5; i++) crack(ctx, rnd, rnd() * S, rnd() * S, 18 + rnd() * 30, Math.max(1, S / 400), 'rgba(30,30,28,0.3)');
    const rough = paintRGB(S, S, (x, y, i, o) => {
      const r = clamp(0.62 + pol[i] * 0.45, 0.25, 0.95);
      o[0] = o[1] = o[2] = r;
    });
    const h2 = canvasHeight(cv);
    for (let i = 0; i < hf.length; i++) hf[i] += h2[i] * 0.8;
    return { map: toTex(cv), normalMap: normalMap(hf, S, S, 2), roughnessMap: toTex(rough, { srgb: false }) };
  },

  // Laje do teto (concreto escuro).
  slab(S) {
    const low = noiseField(S, S, 3, 3, 4, 61);
    const fine = whiteNoise(S * S, 62);
    const cv = paintRGB(S, S, (x, y, i, o) => {
      const k = 0.36 + low[i] * 0.06 + fine[i] * 0.02;
      o[0] = k;
      o[1] = k;
      o[2] = k * 0.97;
    });
    return { map: toTex(cv) };
  },

  // Carpete de escritório em placas de 0,5 m (ladrilho de 1 m).
  officeCarpet(S) {
    const low = noiseField(S, S, 2, 2, 4, 71);
    const loop = whiteNoise(S * S, 72);
    const loop2 = noiseField(S, S, S / 4, S / 4, 1, 73);
    const hf = new Float32Array(S * S);
    const cv = paintRGB(S, S, (x, y, i, o) => {
      const u = x / S;
      const v = y / S;
      const qx = u < 0.5 ? 0 : 1;
      const qy = v < 0.5 ? 0 : 1;
      const dir = (qx + qy) % 2;
      const tu = (u * 2) % 1;
      const tv = (v * 2) % 1;
      const seam = Math.min(tu, 1 - tu, tv, 1 - tv) < 0.006;
      const rib = 0.5 + 0.5 * Math.sin((dir ? x : y) * 1.9);
      let k = 1 + low[i] * 0.07 + (loop[i] * 0.5 + loop2[i] * 0.5) * 0.12 + rib * 0.025 + (dir ? 0.012 : -0.012);
      if (seam) k *= 0.8;
      const fleck = loop[i] > 0.96 ? 1.25 : loop[i] < -0.97 ? 0.7 : 1;
      o[0] = 0.33 * k * fleck;
      o[1] = 0.37 * k * fleck;
      o[2] = 0.43 * k * fleck;
      hf[i] = loop2[i] * 0.5 + rib * 0.3 + (seam ? -0.6 : 0);
    });
    return { map: toTex(cv), normalMap: normalMap(hf, S, S, 2) };
  },

  // Parede de gesso com rodapé de borracha (1,2 m × altura da parede).
  drywall(S) {
    const W = S;
    const H = S * 2;
    const low = noiseField(W, H, 3, 6, 4, 81);
    const fine = whiteNoise(W * H, 82);
    const scuff = noiseField(W, H, 12, 24, 3, 83);
    const hf = new Float32Array(W * H);
    const cv = paintRGB(W, H, (x, y, i, o) => {
      const v = y / H;
      const base = v > 0.963;
      const lip = v > 0.958 && v <= 0.963;
      if (base || lip) {
        const k = lip ? 0.32 : 0.2 + fine[i] * 0.01;
        o[0] = k;
        o[1] = k;
        o[2] = k * 1.03;
        hf[i] = lip ? 1 : 0.6;
        return;
      }
      const sc = clamp((scuff[i] - 0.45) * 3, 0, 1) * clamp((v - 0.75) * 4, 0, 1);
      const k = (0.78 + low[i] * 0.025 + fine[i] * 0.012) * (1 - sc * 0.15);
      o[0] = k;
      o[1] = k * 0.985;
      o[2] = k * 0.95;
      hf[i] = fine[i] * 0.1 + low[i] * 0.1;
    });
    return { map: toTex(cv), normalMap: normalMap(hf, W, H, 1.5) };
  },

  // Solo arado (ladrilho de 4 m).
  soil(S) {
    const low = noiseField(S, S, 4, 4, 5, 91);
    const clod = noiseField(S, S, 40, 40, 2, 92);
    const fine = whiteNoise(S * S, 93);
    const hf = new Float32Array(S * S);
    const cv = paintRGB(S, S, (x, y, i, o) => {
      const k = 0.85 + low[i] * 0.15 + clod[i] * 0.15 + fine[i] * 0.05;
      o[0] = 0.4 * k;
      o[1] = 0.31 * k;
      o[2] = 0.2 * k;
      hf[i] = clod[i] * 0.7 + fine[i] * 0.1;
    });
    const ctx = cv.getContext('2d');
    const rnd = mulberry32(94);
    ctx.lineWidth = Math.max(1, S / 512);
    for (let i = 0; i < S * 0.8; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const a = rnd() * Math.PI;
      const l = S * (0.006 + rnd() * 0.014);
      ctx.strokeStyle = `rgba(${200 + rnd() * 40},${170 + rnd() * 30},${90 + rnd() * 30},${0.35 + rnd() * 0.4})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
    return { map: toTex(cv), normalMap: normalMap(hf, S, S, 3) };
  },

  // Terra batida das estradas (ladrilho de 4 m).
  pathDirt(S) {
    const low = noiseField(S, S, 4, 4, 5, 101);
    const pebble = noiseField(S, S, 64, 64, 1, 102);
    const fine = whiteNoise(S * S, 103);
    const hf = new Float32Array(S * S);
    const cv = paintRGB(S, S, (x, y, i, o) => {
      const p = pebble[i] > 0.55 ? 1.15 : pebble[i] < -0.6 ? 0.85 : 1;
      const k = (0.9 + low[i] * 0.12 + fine[i] * 0.05) * p;
      o[0] = 0.55 * k;
      o[1] = 0.46 * k;
      o[2] = 0.34 * k;
      hf[i] = (p - 1) * 2 + low[i] * 0.2 + fine[i] * 0.05;
    });
    return { map: toTex(cv), normalMap: normalMap(hf, S, S, 2.5) };
  },

  // Talos de trigo com transparência (para quads cruzados).
  wheat(S) {
    const W = S;
    const H = S;
    const cv = makeCanvas(W, H);
    const ctx = cv.getContext('2d');
    const rnd = mulberry32(111);
    const n = 34;
    const sc = W / 512;
    for (let i = 0; i < n; i++) {
      const x0 = W * (0.04 + 0.92 * rnd());
      const top = H * (0.02 + rnd() * 0.16);
      const lean = (rnd() - 0.5) * W * 0.08;
      const shade = 0.82 + rnd() * 0.22;
      const stemW = (1.6 + rnd() * 1.4) * sc;
      // caule
      const g = ctx.createLinearGradient(0, H, 0, top);
      g.addColorStop(0, `rgb(${140 * shade},${122 * shade},${70 * shade})`);
      g.addColorStop(0.45, `rgb(${198 * shade},${170 * shade},${100 * shade})`);
      g.addColorStop(1, `rgb(${226 * shade},${196 * shade},${122 * shade})`);
      ctx.strokeStyle = g;
      ctx.lineWidth = stemW;
      ctx.beginPath();
      ctx.moveTo(x0, H);
      ctx.quadraticCurveTo(x0 + lean * 0.3, H * 0.5, x0 + lean, top + H * 0.12);
      ctx.stroke();
      // folhas
      for (let k = 0; k < 2; k++) {
        const ly = H * (0.55 + rnd() * 0.35);
        const dir = rnd() < 0.5 ? -1 : 1;
        ctx.strokeStyle = `rgba(${182 * shade},${158 * shade},${92 * shade},0.95)`;
        ctx.lineWidth = stemW * 1.3;
        ctx.beginPath();
        ctx.moveTo(x0 + lean * 0.2, ly);
        ctx.quadraticCurveTo(x0 + dir * W * 0.05, ly - H * 0.08, x0 + dir * W * (0.07 + rnd() * 0.04), ly + H * 0.02);
        ctx.stroke();
      }
      // espiga: grãos alternados + aristas
      const ex = x0 + lean;
      const ey = top;
      const len = H * (0.1 + rnd() * 0.04);
      const ang = Math.atan2(len, lean * 0.15);
      for (let k = 0; k < 9; k++) {
        const t = k / 8;
        const gx = ex + Math.cos(ang) * 0 + lean * 0.02 * t;
        const gy = ey + t * len;
        for (const side of [-1, 1]) {
          ctx.fillStyle = `rgb(${(205 + rnd() * 25) * shade},${(168 + rnd() * 20) * shade},${(92 + rnd() * 15) * shade})`;
          ctx.beginPath();
          ctx.ellipse(gx + side * 2.2 * sc, gy, 2.2 * sc, 4.2 * sc, side * 0.45, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = `rgba(${225 * shade},${200 * shade},${140 * shade},0.55)`;
          ctx.lineWidth = 0.7 * sc;
          ctx.beginPath();
          ctx.moveTo(gx + side * 3 * sc, gy - 2 * sc);
          ctx.lineTo(gx + side * (6 + rnd() * 6) * sc, gy - (14 + rnd() * 10) * sc);
          ctx.stroke();
        }
      }
    }
    return { map: toTex(cv, { repeat: false }) };
  },

  // Asfalto com agregado, rachaduras e manchas (ladrilho de 4 m).
  asphalt(S) {
    const low = noiseField(S, S, 4, 4, 5, 121);
    const agg = whiteNoise(S * S, 122);
    const agg2 = noiseField(S, S, S / 3, S / 3, 1, 123);
    const hf = new Float32Array(S * S);
    const cv = paintRGB(S, S, (x, y, i, o) => {
      const a = agg[i] * 0.5 + agg2[i] * 0.5;
      const stone = a > 0.55 ? 1.35 : a < -0.6 ? 0.75 : 1;
      const k = (0.2 + low[i] * 0.035 + a * 0.025) * stone;
      o[0] = k;
      o[1] = k;
      o[2] = k * 1.03;
      hf[i] = a * 0.6 + (stone > 1 ? 0.4 : 0);
    });
    const ctx = cv.getContext('2d');
    const rnd = mulberry32(124);
    for (let i = 0; i < 4; i++) crack(ctx, rnd, rnd() * S, rnd() * S, 20 + rnd() * 30, Math.max(1, S / 350), 'rgba(12,12,12,0.7)');
    for (let i = 0; i < 3; i++) {
      const x = rnd() * S;
      const y = rnd() * S;
      const r = S * (0.03 + rnd() * 0.06);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(8,8,10,0.5)');
      g.addColorStop(1, 'rgba(8,8,10,0)');
      ctx.fillStyle = g;
      wrapDraw(S, S, x, y, (xx, yy) => ctx.fillRect(xx - r, yy - r, r * 2, r * 2));
    }
    return { map: toTex(cv), normalMap: normalMap(hf, S, S, 1.6) };
  },

  // Calçada em placas de concreto de 1,5 m (ladrilho de 3 m).
  sidewalk(S) {
    const low = noiseField(S, S, 3, 3, 4, 131);
    const fine = whiteNoise(S * S, 132);
    const blot = noiseField(S, S, 8, 8, 3, 133);
    const hf = new Float32Array(S * S);
    const cv = paintRGB(S, S, (x, y, i, o) => {
      const u = (x / S) * 2;
      const v = (y / S) * 2;
      const fu = u % 1;
      const fv = v % 1;
      const joint = Math.min(fu, 1 - fu, fv, 1 - fv) < 0.008;
      const slab = ((u | 0) + (v | 0) * 2) % 4;
      let k = 0.56 + low[i] * 0.05 + fine[i] * 0.03 + (slab - 1.5) * 0.012;
      k *= 1 - clamp((blot[i] - 0.4) * 3, 0, 1) * 0.12;
      if (joint) k *= 0.55;
      const gum = fine[i] > 0.997 ? 0.6 : 1;
      o[0] = k * gum;
      o[1] = k * gum * 0.99;
      o[2] = k * gum * 0.96;
      hf[i] = (joint ? -1 : 0) + fine[i] * 0.06;
    });
    return { map: toTex(cv), normalMap: normalMap(hf, S, S, 2) };
  },

  // Cobertura de cascalho dos prédios.
  roof(S) {
    const low = noiseField(S, S, 4, 4, 4, 141);
    const fine = whiteNoise(S * S, 142);
    const cv = paintRGB(S, S, (x, y, i, o) => {
      const k = 0.33 + low[i] * 0.05 + fine[i] * 0.06;
      o[0] = k;
      o[1] = k * 0.98;
      o[2] = k * 0.95;
    });
    return { map: toTex(cv) };
  },

  // Fachadas: 4 vãos × 4 andares (12 m × 14 m) com janelas acesas.
  facadeGlass(S) {
    return facade(S, 'glass', 151);
  },
  facadeConcrete(S) {
    return facade(S, 'concrete', 161);
  },
  facadeBrick(S) {
    return facade(S, 'brick', 171);
  },

  // Textura neutra para objetos (multiplicada pela cor do vértice).
  grime(S) {
    const low = noiseField(S, S, 4, 4, 5, 181);
    const fine = whiteNoise(S * S, 182);
    const hf = new Float32Array(S * S);
    const cv = paintRGB(S, S, (x, y, i, o) => {
      const k = 0.86 + low[i] * 0.1 + fine[i] * 0.04;
      o[0] = o[1] = o[2] = k;
      hf[i] = low[i] * 0.3 + fine[i] * 0.1;
    });
    return { map: toTex(cv), normalMap: normalMap(hf, S, S, 1.2) };
  },

  // Tábuas de madeira (celeiro, porta, cerca).
  planks(S) {
    const grain = noiseField(S, S, 2, 32, 3, 191);
    const low = noiseField(S, S, 3, 3, 4, 192);
    const fine = whiteNoise(S * S, 193);
    const hf = new Float32Array(S * S);
    const cv = paintRGB(S, S, (x, y, i, o) => {
      const u = (x / S) * 6;
      const board = u | 0;
      const fu = u % 1;
      const gap = Math.min(fu, 1 - fu) < 0.03;
      const bk = 0.92 + ((board * 37) % 7) * 0.025;
      const k = (0.8 + grain[i] * 0.12 + low[i] * 0.1 + fine[i] * 0.04) * bk * (gap ? 0.4 : 1);
      o[0] = o[1] = o[2] = k;
      hf[i] = (gap ? -1 : 0) + grain[i] * 0.3;
    });
    return { map: toTex(cv), normalMap: normalMap(hf, S, S, 2) };
  },
};

// Gera uma fachada repetível; janelas acesas vão para o mapa emissivo.
function facade(S, style, seed) {
  const rnd = mulberry32(seed);
  const col = makeCanvas(S, S);
  const emi = makeCanvas(S, S);
  const rgh = makeCanvas(S, S);
  const c = col.getContext('2d');
  const e = emi.getContext('2d');
  const r = rgh.getContext('2d');
  e.fillStyle = '#000';
  e.fillRect(0, 0, S, S);
  const bays = 8;
  const floors = 8;
  const bw = S / bays;
  const fh = S / floors;
  const litColor = () => {
    const t = rnd();
    if (t < 0.5) return [255, 214, 150];
    if (t < 0.8) return [235, 240, 255];
    return [255, 190, 120];
  };
  if (style === 'glass') {
    c.fillStyle = '#2d343b';
    c.fillRect(0, 0, S, S);
    r.fillStyle = 'rgb(140,140,140)';
    r.fillRect(0, 0, S, S);
    for (let f = 0; f < floors; f++) {
      // faixa opaca entre andares (spandrel)
      c.fillStyle = '#20262c';
      c.fillRect(0, f * fh, S, fh * 0.22);
      for (let b = 0; b < bays; b++) {
        const x = b * bw + bw * 0.04;
        const y = f * fh + fh * 0.24;
        const w = bw * 0.92;
        const h = fh * 0.74;
        const g = c.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, '#4d6475');
        g.addColorStop(1, '#22313c');
        c.fillStyle = g;
        c.fillRect(x, y, w, h);
        r.fillStyle = 'rgb(20,20,20)';
        r.fillRect(x, y, w, h);
        if (rnd() < 0.16) {
          const [R, G, B] = litColor();
          e.fillStyle = `rgb(${R * 0.8},${G * 0.8},${B * 0.8})`;
          e.fillRect(x, y, w, h);
          // forro iluminado no alto da janela
          e.fillStyle = `rgb(${R},${G},${B})`;
          e.fillRect(x, y, w, h * 0.12);
        }
        // montante vertical no meio
        c.fillStyle = '#15191d';
        c.fillRect(x + w / 2 - S * 0.003, y, S * 0.006, h);
      }
    }
  } else if (style === 'concrete') {
    c.fillStyle = '#8f8a80';
    c.fillRect(0, 0, S, S);
    r.fillStyle = 'rgb(235,235,235)';
    r.fillRect(0, 0, S, S);
    for (let f = 0; f < floors; f++) {
      const y = f * fh + fh * 0.3;
      const h = fh * 0.5;
      c.fillStyle = '#1c2228';
      c.fillRect(0, y, S, h);
      r.fillStyle = 'rgb(25,25,25)';
      r.fillRect(0, y, S, h);
      // sombra sob a laje
      c.fillStyle = 'rgba(0,0,0,0.25)';
      c.fillRect(0, y - fh * 0.03, S, fh * 0.03);
      for (let b = 0; b < bays * 2; b++) {
        const x = (b * S) / (bays * 2);
        c.fillStyle = '#5a5751';
        c.fillRect(x, y, S * 0.006, h);
        if (rnd() < 0.14) {
          const [R, G, B] = litColor();
          e.fillStyle = `rgb(${R * 0.75},${G * 0.75},${B * 0.75})`;
          e.fillRect(x + S * 0.006, y, S / (bays * 2) - S * 0.006, h);
        }
      }
    }
    const low = noiseField(S, S, 3, 3, 4, seed + 1);
    const img = c.getImageData(0, 0, S, S);
    for (let i = 0; i < S * S; i++) {
      const k = 1 + low[i] * 0.08;
      img.data[i * 4] *= k;
      img.data[i * 4 + 1] *= k;
      img.data[i * 4 + 2] *= k;
    }
    c.putImageData(img, 0, 0);
  } else {
    // tijolo aparente com janelas recortadas
    const low = noiseField(S, S, 3, 3, 4, seed + 1);
    const fine = whiteNoise(S * S, seed + 2);
    const rows = 128;
    const bh = S / rows;
    const img = c.createImageData(S, S);
    for (let y = 0; y < S; y++) {
      const row = (y / bh) | 0;
      const off = row % 2 ? 0.5 : 0;
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        const bu = x / (bh * 3) + off;
        const fu = bu % 1;
        const fv = (y / bh) % 1;
        const mortar = fu < 0.06 || fv < 0.14;
        const bid = ((bu | 0) * 13 + row * 7) % 9;
        let R, G, B;
        if (mortar) {
          R = G = B = 0.55 + fine[i] * 0.03;
        } else {
          const k = 0.85 + bid * 0.03 + low[i] * 0.08 + fine[i] * 0.04;
          R = 0.5 * k;
          G = 0.24 * k;
          B = 0.17 * k;
        }
        img.data[i * 4] = R * 255;
        img.data[i * 4 + 1] = G * 255;
        img.data[i * 4 + 2] = B * 255;
        img.data[i * 4 + 3] = 255;
      }
    }
    c.putImageData(img, 0, 0);
    r.fillStyle = 'rgb(245,245,245)';
    r.fillRect(0, 0, S, S);
    for (let f = 0; f < floors; f++) {
      for (let b = 0; b < bays; b++) {
        const w = bw * 0.46;
        const h = fh * 0.55;
        const x = b * bw + (bw - w) / 2;
        const y = f * fh + fh * 0.22;
        c.fillStyle = '#d8d4cc';
        c.fillRect(x - S * 0.008, y - S * 0.008, w + S * 0.016, h + S * 0.016);
        c.fillStyle = '#b9b3a8';
        c.fillRect(x - S * 0.014, y + h + S * 0.008, w + S * 0.028, S * 0.012);
        const g = c.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, '#3b4a57');
        g.addColorStop(1, '#1b232b');
        c.fillStyle = g;
        c.fillRect(x, y, w, h);
        c.fillStyle = '#d8d4cc';
        c.fillRect(x + w / 2 - S * 0.003, y, S * 0.006, h);
        r.fillStyle = 'rgb(18,18,18)';
        r.fillRect(x, y, w, h);
        if (rnd() < 0.2) {
          const [R, G, B] = litColor();
          e.fillStyle = `rgb(${R * 0.7},${G * 0.55},${B * 0.4})`;
          e.fillRect(x, y, w, h);
          // cortina
          c.fillStyle = 'rgba(200,170,120,0.5)';
          c.fillRect(x, y, w * 0.25, h);
          e.fillStyle = `rgb(${R * 0.35},${G * 0.25},${B * 0.15})`;
          e.fillRect(x, y, w * 0.25, h);
        }
      }
    }
  }
  return {
    map: toTex(col),
    emissiveMap: toTex(emi),
    roughnessMap: toTex(rgh, { srgb: false }),
  };
}

// ------------------------------------------------------------- texturas únicas
export function textCanvasTex(w, h, draw, opts) {
  const cv = makeCanvas(w, h);
  draw(cv.getContext('2d'), w, h);
  return toTex(cv, { repeat: false, ...opts });
}

// Placa de SAÍDA verde.
export function exitSignTex() {
  return textCanvasTex(256, 96, (c, w, h) => {
    c.fillStyle = '#0b3d1a';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#f2fff4';
    c.font = 'bold 60px Arial, Helvetica, sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText('SAÍDA', w / 2 - 14, h / 2 + 3);
    c.beginPath();
    c.moveTo(w - 44, h / 2 - 16);
    c.lineTo(w - 22, h / 2);
    c.lineTo(w - 44, h / 2 + 16);
    c.fill();
  });
}

// Rosto do Sorridente: olhos e sorriso brilhantes sobre fundo transparente.
export function smilerTex() {
  return textCanvasTex(256, 256, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    const glow = (x, y, rx, ry) => {
      const g = c.createRadialGradient(x, y, 0, x, y, rx * 2.2);
      g.addColorStop(0, 'rgba(255,255,255,0.35)');
      g.addColorStop(1, 'rgba(255,255,255,0)');
      c.fillStyle = g;
      c.fillRect(x - rx * 2.5, y - ry * 2.5, rx * 5, ry * 5);
      c.fillStyle = '#fff';
      c.beginPath();
      c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      c.fill();
    };
    glow(88, 92, 15, 10);
    glow(168, 92, 15, 10);
    // sorriso com dentes
    c.save();
    c.beginPath();
    c.moveTo(48, 140);
    c.quadraticCurveTo(128, 230, 208, 140);
    c.quadraticCurveTo(128, 182, 48, 140);
    c.closePath();
    c.fillStyle = '#fff';
    c.shadowColor = 'rgba(255,255,255,0.8)';
    c.shadowBlur = 14;
    c.fill();
    c.restore();
    c.strokeStyle = 'rgba(0,0,0,0.85)';
    c.lineWidth = 3;
    for (let i = 1; i < 12; i++) {
      const x = 48 + (160 * i) / 12;
      c.beginPath();
      c.moveTo(x, 140);
      c.lineTo(x + (i < 6 ? 3 : -3), 196);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(56, 150);
    c.quadraticCurveTo(128, 178, 200, 150);
    c.stroke();
  });
}

// Folha de anotação rabiscada.
export function noteTex() {
  return textCanvasTex(128, 160, (c, w, h) => {
    c.fillStyle = '#e9e2cc';
    c.fillRect(0, 0, w, h);
    c.strokeStyle = 'rgba(80,110,170,0.35)';
    for (let y = 22; y < h; y += 11) {
      c.beginPath();
      c.moveTo(6, y);
      c.lineTo(w - 6, y);
      c.stroke();
    }
    const rnd = mulberry32(7);
    c.strokeStyle = 'rgba(30,30,50,0.85)';
    c.lineWidth = 1.2;
    for (let y = 20; y < h - 20; y += 11) {
      let x = 10;
      c.beginPath();
      c.moveTo(x, y);
      while (x < w - 14 - rnd() * 30) {
        x += 2 + rnd() * 3;
        c.lineTo(x, y - rnd() * 4);
      }
      c.stroke();
    }
  });
}

// Rótulo da garrafa de Água de Amêndoa.
export function bottleLabelTex() {
  return textCanvasTex(128, 64, (c, w, h) => {
    c.fillStyle = '#f4efe2';
    c.fillRect(0, 0, w, h);
    c.fillStyle = '#7a4b22';
    c.fillRect(0, 0, w, 10);
    c.fillRect(0, h - 10, w, 10);
    c.fillStyle = '#5a3416';
    c.font = 'bold 15px Georgia, serif';
    c.textAlign = 'center';
    c.fillText('ÁGUA DE', w / 2, 28);
    c.fillText('AMÊNDOA', w / 2, 46);
  });
}

// Placa genérica com texto.
export function signTex(text, bg, fg, w = 256, h = 64) {
  return textCanvasTex(w, h, (c) => {
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = fg;
    c.font = `bold ${Math.floor(h * 0.55)}px Arial, Helvetica, sans-serif`;
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(text, w / 2, h / 2 + 2);
  });
}

// Mapa de ambiente equiretangular de interiores: teto com faixas de luz.
export function indoorEnvTex(base, light, rows = 6) {
  const W = 256;
  const H = 128;
  const cv = makeCanvas(W, H);
  const c = cv.getContext('2d');
  const g = c.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, base[0]);
  g.addColorStop(0.5, base[1]);
  g.addColorStop(1, base[2]);
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
  c.fillStyle = light;
  for (let r = 0; r < rows; r++) {
    const y = 4 + r * ((H * 0.42) / rows) * (1 + r * 0.2);
    const n = 8 + r * 2;
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * (W / n);
      c.fillRect(x - 3, y, 6, Math.max(1.5, 5 - r * 0.6));
    }
  }
  const t = new THREE.CanvasTexture(cv);
  t.mapping = THREE.EquirectangularReflectionMapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------ extensão pelos níveis
// Os níveis podem registrar geradores próprios (usados via getTex, com cache por
// tamanho) e reutilizar os mesmos utilitários de pintura procedural.
// Textura de imagem (foto) com repetição; resolve null se não carregar a tempo.
export function loadPhotoTex(url, { srgb = true, timeout = 8000 } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const img = new Image();
    img.onload = () => {
      const t = new THREE.Texture(img);
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = maxAniso;
      t.needsUpdate = true;
      finish(t);
    };
    img.onerror = () => finish(null);
    setTimeout(() => finish(null), timeout);
    img.src = url;
  });
}

export function registerTexture(name, gen) {
  if (!GENERATORS[name]) GENERATORS[name] = gen;
}

export const TEX = { makeCanvas, toTex, noiseField, whiteNoise, paintRGB, normalMap, canvasHeight, crack, wrapDraw };

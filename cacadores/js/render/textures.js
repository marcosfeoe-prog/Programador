// Texturas procedurais desenhadas em canvas: terreno, estradas, fachadas, telhados,
// vegetação e partículas. Nada é carregado de arquivo.

import * as THREE from 'three';
import { Noise } from '../core/noise.js';
import { RNG } from '../core/rng.js';

let ANISO = 4;

export function canvas(w, h = w) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

export function toTex(cv, { srgb = true, repeat = true, aniso = true, mips = true } = {}) {
  const t = new THREE.CanvasTexture(cv);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso ? ANISO : 1;
  t.generateMipmaps = mips;
  t.minFilter = mips ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

// Ruído fbm periódico em escala de cinza (0..255) para texturas que repetem sem emenda.
export function noiseField(size, period, oct, seed, z = 0) {
  const n = new Noise(seed);
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let s = 0;
      let a = 1;
      let f = 1;
      let norm = 0;
      for (let o = 0; o < oct; o++) {
        const p = period * f;
        s += a * n.n3((x / size) * p, (y / size) * p, z + o * 17.3, p);
        norm += a;
        a *= 0.5;
        f *= 2;
      }
      out[y * size + x] = s / norm;
    }
  return out;
}

function rgb(hex) {
  const c = new THREE.Color(hex);
  return [c.r * 255, c.g * 255, c.b * 255];
}

function shade(hex, f) {
  const c = new THREE.Color(hex);
  c.multiplyScalar(f);
  return `rgb(${Math.min(255, c.r * 255) | 0},${Math.min(255, c.g * 255) | 0},${Math.min(255, c.b * 255) | 0})`;
}

// Adiciona granulação a um canvas usando ImageData.
function grain(ctx, w, h, amount, seed, field = null) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  const rng = new RNG(seed);
  for (let i = 0; i < w * h; i++) {
    const g = (rng.next() - 0.5) * amount + (field ? field[i % field.length] * amount * 1.5 : 0);
    d[i * 4] += g;
    d[i * 4 + 1] += g;
    d[i * 4 + 2] += g;
  }
  ctx.putImageData(img, 0, 0);
}

// ------------------------------------------------------------------ Terreno
// R = detalhe de grama, G = torrões de solo, B = ruído fino, A = variação grande.
function terrainDetail(size, seed) {
  const cv = canvas(size);
  const ctx = cv.getContext('2d');
  // Canal da grama: traços curtos (folhas vistas de cima).
  const gcv = canvas(size);
  const g = gcv.getContext('2d');
  g.fillStyle = '#808080';
  g.fillRect(0, 0, size, size);
  const rng = new RNG(seed);
  const blades = size * size * 0.09;
  for (let i = 0; i < blades; i++) {
    const x = rng.next() * size;
    const y = rng.next() * size;
    const l = (1.5 + rng.next() * 4) * (size / 512);
    const a = rng.next() * Math.PI * 2;
    const v = 70 + rng.next() * 120;
    g.strokeStyle = `rgb(${v},${v},${v})`;
    g.lineWidth = 0.6 + rng.next() * 0.9;
    g.beginPath();
    for (const ox of [-size, 0, size])
      for (const oy of [-size, 0, size]) {
        if (x + ox < -10 || x + ox > size + 10 || y + oy < -10 || y + oy > size + 10) continue;
        g.moveTo(x + ox, y + oy);
        g.lineTo(x + ox + Math.cos(a) * l, y + oy + Math.sin(a) * l);
      }
    g.stroke();
  }
  const gd = g.getImageData(0, 0, size, size).data;
  // Canal do solo: torrões (Worley aproximado com ruído) e pedriscos.
  const clods = noiseField(size, 24, 3, seed + 1);
  const fine = noiseField(size, 64, 2, seed + 2);
  const big = noiseField(size, 3, 4, seed + 3);
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const prng = new RNG(seed + 9);
  for (let i = 0; i < size * size; i++) {
    const soil = 128 + clods[i] * 230 + (prng.next() < 0.004 ? 70 : 0);
    d[i * 4] = gd[i * 4];
    d[i * 4 + 1] = Math.max(0, Math.min(255, soil));
    d[i * 4 + 2] = Math.max(0, Math.min(255, 128 + fine[i] * 260));
    d[i * 4 + 3] = Math.max(0, Math.min(255, 128 + big[i] * 300));
  }
  ctx.putImageData(img, 0, 0);
  return toTex(cv, { srgb: false });
}

// ------------------------------------------------------------------ Estradas
function asphalt(size, seed) {
  const cv = canvas(size);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#4a4a4c';
  ctx.fillRect(0, 0, size, size);
  const field = noiseField(size, 6, 4, seed);
  grain(ctx, size, size, 26, seed, field);
  const rng = new RNG(seed);
  // Agregado claro.
  for (let i = 0; i < size * size * 0.02; i++) {
    const v = 90 + rng.next() * 90;
    ctx.fillStyle = `rgba(${v},${v},${v * 0.98},${0.25 + rng.next() * 0.4})`;
    ctx.fillRect(rng.next() * size, rng.next() * size, 1, 1);
  }
  // Desgaste dos pneus (faixas mais escuras e lisas) em cada pista.
  for (const c of [0.17, 0.33, 0.67, 0.83]) {
    const gr = ctx.createLinearGradient((c - 0.06) * size, 0, (c + 0.06) * size, 0);
    gr.addColorStop(0, 'rgba(20,20,22,0)');
    gr.addColorStop(0.5, 'rgba(20,20,22,0.22)');
    gr.addColorStop(1, 'rgba(20,20,22,0)');
    ctx.fillStyle = gr;
    ctx.fillRect((c - 0.06) * size, 0, 0.12 * size, size);
  }
  // Rachaduras seladas com piche.
  ctx.strokeStyle = 'rgba(15,15,16,0.7)';
  for (let k = 0; k < 7; k++) {
    let x = rng.next() * size;
    let y = rng.next() * size;
    ctx.lineWidth = 1 + rng.next() * 2;
    ctx.beginPath();
    ctx.moveTo(x, y);
    const dirx = rng.range(-1, 1);
    for (let s = 0; s < 30; s++) {
      x += dirx * 6 + rng.range(-4, 4);
      y += rng.range(-1, 6);
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // Remendos.
  for (let k = 0; k < 3; k++) {
    ctx.fillStyle = `rgba(30,30,32,${0.25 + rng.next() * 0.3})`;
    ctx.fillRect(rng.next() * size * 0.8, rng.next() * size, size * rng.range(0.1, 0.3), size * rng.range(0.05, 0.2));
  }
  return toTex(cv);
}

function unpavedRoad(size, seed, kind) {
  const cv = canvas(size);
  const ctx = cv.getContext('2d');
  const base = kind === 'gravel' ? '#b9b0a2' : '#d8cfc4';
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  const field = noiseField(size, 8, 4, seed);
  grain(ctx, size, size, 40, seed, field);
  const rng = new RNG(seed + 1);
  // Duas trilhas de pneu, mais compactadas e escuras.
  for (const c of [0.3, 0.7]) {
    const gr = ctx.createLinearGradient((c - 0.09) * size, 0, (c + 0.09) * size, 0);
    gr.addColorStop(0, 'rgba(60,50,40,0)');
    gr.addColorStop(0.5, kind === 'gravel' ? 'rgba(70,64,58,0.28)' : 'rgba(80,60,45,0.25)');
    gr.addColorStop(1, 'rgba(60,50,40,0)');
    ctx.fillStyle = gr;
    ctx.fillRect((c - 0.09) * size, 0, 0.18 * size, size);
  }
  // Cascalho solto nas bordas e no meio.
  const n = kind === 'gravel' ? size * size * 0.05 : size * size * 0.012;
  for (let i = 0; i < n; i++) {
    const x = rng.next();
    const inTrack = Math.abs(x - 0.3) < 0.07 || Math.abs(x - 0.7) < 0.07;
    if (inTrack && rng.next() < 0.7) continue;
    const v = kind === 'gravel' ? 120 + rng.next() * 110 : 150 + rng.next() * 80;
    const s = (kind === 'gravel' ? 1 + rng.next() * 2.4 : 1 + rng.next() * 1.6) * (size / 512);
    ctx.fillStyle = `rgba(${v},${v * 0.96},${v * 0.9},0.85)`;
    ctx.beginPath();
    ctx.arc(x * size, rng.next() * size, s, 0, Math.PI * 2);
    ctx.fill();
  }
  // Sulcos de erosão na terra.
  if (kind === 'dirt') {
    ctx.strokeStyle = 'rgba(90,70,55,0.25)';
    for (let k = 0; k < 10; k++) {
      ctx.lineWidth = 1 + rng.next() * 3;
      let x = rng.next() * size;
      let y = 0;
      ctx.beginPath();
      ctx.moveTo(x, y);
      while (y < size) {
        y += 10;
        x += rng.range(-3, 3);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }
  return toTex(cv);
}

// ------------------------------------------------------------------ Fachadas (atlas 8×8)
// Cada ladrilho = um "vão" de 3 m × 3 m. O alfa marca a área pintável (a cor da instância
// tinge só a parede, não as janelas).
export const FACADE = {
  sidingWin: [0, 0],
  sidingDoor: [1, 0],
  siding: [2, 0],
  sidingGarage: [3, 0],
  sidingWin2: [4, 0],
  brickWin: [0, 1],
  brickDoor: [1, 1],
  brick: [2, 1],
  brickShop: [3, 1],
  brickWinArch: [4, 1],
  plasterWin: [0, 2],
  plasterDoor: [1, 2],
  plaster: [2, 2],
  plasterGate: [3, 2],
  plasterWinShut: [4, 2],
  barnBoard: [0, 3],
  barnDoor: [1, 3],
  metal: [2, 3],
  metalDoor: [3, 3],
  metalVert: [4, 3],
  blockWin: [0, 4],
  shopGlass: [1, 4],
  shopSign: [2, 4],
  schoolWin: [3, 4],
  officeWin: [4, 4],
  aviary: [0, 5],
  concrete: [1, 5],
  churchWin: [2, 5],
  churchDoor: [3, 5],
  logWin: [4, 5],
  log: [0, 6],
  woodShingleWin: [1, 6],
  mobileWin: [2, 6],
  mobile: [3, 6],
  gasCanopy: [4, 6],
  trimDark: [0, 7],
  trimLight: [1, 7],
  foundation: [2, 7],
  glassDark: [3, 7],
  rubble: [4, 7],
};
export const ATLAS_N = 8;

function facadeAtlas(tile, seed) {
  const N = ATLAS_N;
  const S = tile;
  const cv = canvas(S * N);
  const ctx = cv.getContext('2d');
  const rng = new RNG(seed);
  const u = S / 128; // unidade de desenho
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, S * N, S * N);

  const alphaMask = []; // [col,row,paintable]

  const at = (col, row, fn, paintable = true) => {
    ctx.save();
    ctx.translate(col * S, row * S);
    ctx.beginPath();
    ctx.rect(0, 0, S, S);
    ctx.clip();
    fn(ctx);
    ctx.restore();
    alphaMask.push([col, row, paintable]);
  };

  const siding = (c) => {
    c.fillStyle = '#ecebe6';
    c.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 8 * u) {
      c.fillStyle = 'rgba(0,0,0,0.13)';
      c.fillRect(0, y + 6.5 * u, S, 1.5 * u);
      c.fillStyle = 'rgba(255,255,255,0.18)';
      c.fillRect(0, y, S, 1 * u);
    }
  };
  const brick = (c, base = '#9a4a32') => {
    c.fillStyle = '#b8b0a4';
    c.fillRect(0, 0, S, S);
    const bh = 5 * u;
    const bw = 14 * u;
    for (let y = 0, r = 0; y < S; y += bh, r++)
      for (let x = (r % 2) * -bw * 0.5; x < S; x += bw) {
        const f = 0.8 + rng.next() * 0.35;
        c.fillStyle = shade(base, f);
        c.fillRect(x + 0.6 * u, y + 0.6 * u, bw - 1.2 * u, bh - 1.2 * u);
      }
  };
  const plaster = (c) => {
    c.fillStyle = '#efece6';
    c.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      c.fillStyle = `rgba(${rng.next() < 0.5 ? '0,0,0' : '255,255,255'},${rng.next() * 0.06})`;
      c.beginPath();
      c.arc(rng.next() * S, rng.next() * S, rng.next() * 6 * u, 0, Math.PI * 2);
      c.fill();
    }
    // Sujeira escorrida perto do chão.
    const g = c.createLinearGradient(0, S * 0.75, 0, S);
    g.addColorStop(0, 'rgba(60,50,40,0)');
    g.addColorStop(1, 'rgba(60,50,40,0.22)');
    c.fillStyle = g;
    c.fillRect(0, 0, S, S);
  };
  const glass = (c, x, y, w, h, night = false) => {
    const g = c.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, '#5d6f80');
    g.addColorStop(0.45, '#2c3a47');
    g.addColorStop(1, '#1a232c');
    c.fillStyle = g;
    c.fillRect(x, y, w, h);
    c.fillStyle = 'rgba(255,255,255,0.18)';
    c.beginPath();
    c.moveTo(x, y + h * 0.65);
    c.lineTo(x + w * 0.55, y);
    c.lineTo(x + w * 0.75, y);
    c.lineTo(x, y + h * 0.95);
    c.fill();
    if (night) {
      c.fillStyle = 'rgba(255,200,120,0.25)';
      c.fillRect(x, y, w, h);
    }
  };
  const window = (c, x, y, w, h, frame = '#f4f4f0', mullion = true) => {
    c.fillStyle = frame;
    c.fillRect(x - 2.5 * u, y - 2.5 * u, w + 5 * u, h + 5 * u);
    glass(c, x, y, w, h);
    if (mullion) {
      c.fillStyle = frame;
      c.fillRect(x + w / 2 - 1 * u, y, 2 * u, h);
      c.fillRect(x, y + h / 2 - 1 * u, w, 2 * u);
    }
    // Cortina interna.
    c.fillStyle = 'rgba(230,220,200,0.25)';
    c.fillRect(x, y, w * 0.25, h);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    c.fillRect(x - 3 * u, y + h + 2.5 * u, w + 6 * u, 2 * u);
  };
  const door = (c, x, y, w, h, col = '#6b4a32') => {
    c.fillStyle = '#e8e6e0';
    c.fillRect(x - 3 * u, y - 3 * u, w + 6 * u, h + 3 * u);
    c.fillStyle = col;
    c.fillRect(x, y, w, h);
    c.strokeStyle = 'rgba(0,0,0,0.3)';
    c.lineWidth = 1.2 * u;
    c.strokeRect(x + 4 * u, y + 5 * u, w - 8 * u, h * 0.35);
    c.strokeRect(x + 4 * u, y + h * 0.5, w - 8 * u, h * 0.42);
    c.fillStyle = '#d4b060';
    c.beginPath();
    c.arc(x + w - 5 * u, y + h * 0.52, 1.6 * u, 0, Math.PI * 2);
    c.fill();
  };

  // Linha 0: revestimento de madeira/vinil (EUA, Canadá).
  at(0, 0, (c) => {
    siding(c);
    window(c, 38 * u, 30 * u, 52 * u, 58 * u);
    c.fillStyle = '#2e3a2e';
    c.fillRect(26 * u, 28 * u, 9 * u, 64 * u);
    c.fillRect(93 * u, 28 * u, 9 * u, 64 * u);
  });
  at(1, 0, (c) => {
    siding(c);
    door(c, 44 * u, 34 * u, 40 * u, 94 * u, '#7a2a20');
    c.fillStyle = 'rgba(0,0,0,0.2)';
    c.fillRect(36 * u, 30 * u, 56 * u, 3 * u);
  });
  at(2, 0, siding);
  at(3, 0, (c) => {
    siding(c);
    c.fillStyle = '#f2f2ee';
    c.fillRect(8 * u, 40 * u, 112 * u, 88 * u);
    for (let i = 0; i < 4; i++) {
      c.fillStyle = 'rgba(0,0,0,0.12)';
      c.fillRect(8 * u, (40 + i * 22) * u, 112 * u, 2 * u);
    }
  });
  at(4, 0, (c) => {
    siding(c);
    window(c, 20 * u, 34 * u, 36 * u, 50 * u);
    window(c, 72 * u, 34 * u, 36 * u, 50 * u);
  });
  // Linha 1: tijolos.
  at(0, 1, (c) => {
    brick(c);
    window(c, 38 * u, 30 * u, 52 * u, 58 * u, '#e8e2d6');
  }, false);
  at(1, 1, (c) => {
    brick(c);
    door(c, 44 * u, 34 * u, 40 * u, 94 * u, '#3e2a1e');
  }, false);
  at(2, 1, (c) => brick(c), false);
  at(3, 1, (c) => {
    brick(c, '#8a4430');
    c.fillStyle = '#2a2a2a';
    c.fillRect(6 * u, 34 * u, 116 * u, 94 * u);
    glass(c, 10 * u, 38 * u, 108 * u, 86 * u, true);
    c.fillStyle = '#7a2020';
    c.fillRect(0, 8 * u, S, 20 * u);
    c.fillStyle = 'rgba(255,255,255,0.85)';
    c.font = `bold ${13 * u}px sans-serif`;
    c.textAlign = 'center';
    c.fillText(rng.pick(['DINER', 'HARDWARE', 'DRUG', 'FEED', 'CAFE', 'BANK']), 64 * u, 23 * u);
  }, false);
  at(4, 1, (c) => {
    brick(c, '#a85c3c');
    c.fillStyle = '#e6dcc8';
    c.beginPath();
    c.moveTo(36 * u, 96 * u);
    c.lineTo(36 * u, 46 * u);
    c.arc(64 * u, 46 * u, 28 * u, Math.PI, 0);
    c.lineTo(92 * u, 96 * u);
    c.fill();
    glass(c, 40 * u, 46 * u, 48 * u, 48 * u);
  }, false);
  // Linha 2: reboco pintado (Brasil, Argentina, Uruguai, Chile).
  at(0, 2, (c) => {
    plaster(c);
    window(c, 38 * u, 32 * u, 52 * u, 54 * u, '#ffffff');
    // grade de ferro
    c.strokeStyle = 'rgba(30,30,30,0.85)';
    c.lineWidth = 1.5 * u;
    for (let x = 42; x < 90; x += 8) {
      c.beginPath();
      c.moveTo(x * u, 32 * u);
      c.lineTo(x * u, 86 * u);
      c.stroke();
    }
  });
  at(1, 2, (c) => {
    plaster(c);
    door(c, 44 * u, 36 * u, 40 * u, 92 * u, '#8a5a32');
  });
  at(2, 2, plaster);
  at(3, 2, (c) => {
    plaster(c);
    c.fillStyle = '#3a3a3a';
    c.fillRect(10 * u, 40 * u, 108 * u, 88 * u);
    c.fillStyle = '#9a9a9a';
    for (let x = 14; x < 118; x += 7) c.fillRect(x * u, 42 * u, 3 * u, 84 * u);
  });
  at(4, 2, (c) => {
    plaster(c);
    c.fillStyle = '#5a8a5a';
    c.fillRect(30 * u, 26 * u, 32 * u, 66 * u);
    c.fillRect(66 * u, 26 * u, 32 * u, 66 * u);
    c.fillStyle = 'rgba(0,0,0,0.25)';
    for (let y = 30; y < 90; y += 6) {
      c.fillRect(32 * u, y * u, 28 * u, 2 * u);
      c.fillRect(68 * u, y * u, 28 * u, 2 * u);
    }
  });
  // Linha 3: celeiro, metal.
  at(0, 3, (c) => {
    c.fillStyle = '#f0e8e0';
    c.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x += 10 * u) {
      c.fillStyle = `rgba(0,0,0,${0.05 + rng.next() * 0.08})`;
      c.fillRect(x, 0, 10 * u, S);
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.fillRect(x, 0, 1 * u, S);
    }
  });
  at(1, 3, (c) => {
    c.fillStyle = '#f0e8e0';
    c.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x += 10 * u) {
      c.fillStyle = 'rgba(0,0,0,0.3)';
      c.fillRect(x, 0, 1 * u, S);
    }
    c.strokeStyle = '#ffffff';
    c.lineWidth = 5 * u;
    c.strokeRect(14 * u, 20 * u, 100 * u, 108 * u);
    c.beginPath();
    c.moveTo(14 * u, 20 * u);
    c.lineTo(114 * u, 128 * u);
    c.moveTo(114 * u, 20 * u);
    c.lineTo(14 * u, 128 * u);
    c.stroke();
  });
  const corrug = (c, vertical) => {
    c.fillStyle = '#d8d8d6';
    c.fillRect(0, 0, S, S);
    const step = 6 * u;
    for (let x = 0; x < S; x += step) {
      const g = vertical ? c.createLinearGradient(x, 0, x + step, 0) : c.createLinearGradient(0, x, 0, x + step);
      g.addColorStop(0, 'rgba(255,255,255,0.25)');
      g.addColorStop(0.5, 'rgba(0,0,0,0.2)');
      g.addColorStop(1, 'rgba(255,255,255,0.25)');
      c.fillStyle = g;
      if (vertical) c.fillRect(x, 0, step, S);
      else c.fillRect(0, x, S, step);
    }
    for (let i = 0; i < 6; i++) {
      c.fillStyle = `rgba(140,70,30,${rng.next() * 0.15})`;
      c.fillRect(rng.next() * S, rng.next() * S, rng.next() * 20 * u, rng.next() * 40 * u);
    }
  };
  at(2, 3, (c) => corrug(c, true));
  at(3, 3, (c) => {
    corrug(c, true);
    c.fillStyle = '#b8b8b4';
    c.fillRect(14 * u, 24 * u, 100 * u, 104 * u);
    for (let y = 24; y < 128; y += 5) {
      c.fillStyle = 'rgba(0,0,0,0.15)';
      c.fillRect(14 * u, y * u, 100 * u, 1.5 * u);
    }
  });
  at(4, 3, (c) => corrug(c, false));
  // Linha 4: comercial.
  at(0, 4, (c) => {
    c.fillStyle = '#d6d2c8';
    c.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 8 * u)
      for (let x = ((y / (8 * u)) % 2) * 8 * u; x < S; x += 16 * u) {
        c.strokeStyle = 'rgba(0,0,0,0.12)';
        c.strokeRect(x, y, 16 * u, 8 * u);
      }
    window(c, 30 * u, 36 * u, 68 * u, 40 * u, '#9aa0a6', false);
  }, false);
  at(1, 4, (c) => {
    c.fillStyle = '#3a3e44';
    c.fillRect(0, 0, S, S);
    glass(c, 4 * u, 20 * u, 120 * u, 104 * u, true);
    c.fillStyle = '#3a3e44';
    c.fillRect(62 * u, 20 * u, 4 * u, 104 * u);
  }, false);
  at(2, 4, (c) => {
    c.fillStyle = '#e8e4da';
    c.fillRect(0, 0, S, S);
    c.fillStyle = '#1d5fa8';
    c.fillRect(0, 6 * u, S, 26 * u);
    c.fillStyle = '#fff';
    c.font = `bold ${14 * u}px sans-serif`;
    c.textAlign = 'center';
    c.fillText(rng.pick(['MERCADO', 'FARMÁCIA', 'PADARIA', 'ALMACÉN', 'FERRETERÍA', 'MARKET']), 64 * u, 25 * u);
    glass(c, 10 * u, 44 * u, 108 * u, 70 * u, true);
  }, false);
  at(3, 4, (c) => {
    brick(c, '#9b5a3a');
    c.fillStyle = '#d8d0c0';
    c.fillRect(0, 34 * u, S, 52 * u);
    for (let x = 4; x < 124; x += 30) glass(c, x * u, 38 * u, 26 * u, 44 * u);
  }, false);
  at(4, 4, (c) => {
    c.fillStyle = '#b8bcc0';
    c.fillRect(0, 0, S, S);
    for (let y = 8; y < 128; y += 40) for (let x = 6; x < 128; x += 40) glass(c, x * u, y * u, 34 * u, 30 * u);
  }, false);
  // Linha 5: aviário, concreto, igreja, madeira.
  at(0, 5, (c) => {
    c.fillStyle = '#f2f2ee';
    c.fillRect(0, 0, S, S);
    c.fillStyle = '#e8eef4';
    c.fillRect(0, 28 * u, S, 70 * u);
    c.strokeStyle = 'rgba(80,90,100,0.35)';
    c.lineWidth = 1 * u;
    for (let x = 0; x < S; x += 4 * u) {
      c.beginPath();
      c.moveTo(x, 28 * u);
      c.lineTo(x, 98 * u);
      c.stroke();
    }
    c.fillStyle = 'rgba(0,0,0,0.12)';
    c.fillRect(0, 98 * u, S, 30 * u);
  });
  at(1, 5, (c) => {
    c.fillStyle = '#c8c4bc';
    c.fillRect(0, 0, S, S);
    for (let i = 0; i < 400; i++) {
      c.fillStyle = `rgba(0,0,0,${rng.next() * 0.08})`;
      c.fillRect(rng.next() * S, rng.next() * S, 3 * u, 3 * u);
    }
    for (let y = 0; y < S; y += 32 * u) {
      c.fillStyle = 'rgba(0,0,0,0.12)';
      c.fillRect(0, y, S, 1.5 * u);
    }
  }, false);
  at(2, 5, (c) => {
    plaster(c);
    c.fillStyle = '#d8d0c0';
    c.beginPath();
    c.moveTo(40 * u, 110 * u);
    c.lineTo(40 * u, 40 * u);
    c.arc(64 * u, 40 * u, 24 * u, Math.PI, 0);
    c.lineTo(88 * u, 110 * u);
    c.fill();
    const g = c.createLinearGradient(44 * u, 20 * u, 84 * u, 108 * u);
    g.addColorStop(0, '#4060a0');
    g.addColorStop(0.3, '#a04040');
    g.addColorStop(0.6, '#d0a040');
    g.addColorStop(1, '#306050');
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(44 * u, 106 * u);
    c.lineTo(44 * u, 40 * u);
    c.arc(64 * u, 40 * u, 20 * u, Math.PI, 0);
    c.lineTo(84 * u, 106 * u);
    c.fill();
    c.strokeStyle = 'rgba(30,30,30,0.7)';
    c.lineWidth = 1.5 * u;
    c.beginPath();
    c.moveTo(64 * u, 20 * u);
    c.lineTo(64 * u, 106 * u);
    c.moveTo(44 * u, 70 * u);
    c.lineTo(84 * u, 70 * u);
    c.stroke();
  });
  at(3, 5, (c) => {
    plaster(c);
    c.fillStyle = '#5a3a22';
    c.beginPath();
    c.moveTo(36 * u, 128 * u);
    c.lineTo(36 * u, 56 * u);
    c.arc(64 * u, 56 * u, 28 * u, Math.PI, 0);
    c.lineTo(92 * u, 128 * u);
    c.fill();
    c.strokeStyle = 'rgba(0,0,0,0.4)';
    c.beginPath();
    c.moveTo(64 * u, 30 * u);
    c.lineTo(64 * u, 128 * u);
    c.stroke();
  });
  const logs = (c) => {
    c.fillStyle = '#9a7048';
    c.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 10 * u) {
      const g = c.createLinearGradient(0, y, 0, y + 10 * u);
      g.addColorStop(0, 'rgba(255,230,190,0.25)');
      g.addColorStop(0.5, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(0,0,0,0.35)');
      c.fillStyle = g;
      c.fillRect(0, y, S, 10 * u);
    }
    for (let i = 0; i < 80; i++) {
      c.fillStyle = `rgba(60,40,20,${rng.next() * 0.25})`;
      c.fillRect(rng.next() * S, rng.next() * S, rng.next() * 30 * u, 1 * u);
    }
  };
  at(4, 5, (c) => {
    logs(c);
    window(c, 38 * u, 32 * u, 52 * u, 54 * u, '#f0ead8');
  });
  at(0, 6, logs);
  at(1, 6, (c) => {
    c.fillStyle = '#c8b090';
    c.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 9 * u)
      for (let x = ((y / (9 * u)) % 2) * 6 * u; x < S; x += 12 * u) {
        c.fillStyle = `rgba(0,0,0,${0.05 + rng.next() * 0.12})`;
        c.fillRect(x, y, 11 * u, 8 * u);
      }
    window(c, 38 * u, 32 * u, 52 * u, 54 * u, '#ffffff');
  });
  const mobile = (c) => {
    c.fillStyle = '#f2f0ea';
    c.fillRect(0, 0, S, S);
    for (let x = 0; x < S; x += 5 * u) {
      c.fillStyle = 'rgba(0,0,0,0.08)';
      c.fillRect(x, 0, 1.5 * u, S);
    }
    c.fillStyle = '#7a8a9a';
    c.fillRect(0, 90 * u, S, 6 * u);
    c.fillStyle = 'rgba(0,0,0,0.3)';
    c.fillRect(0, 112 * u, S, 16 * u);
  };
  at(2, 6, (c) => {
    mobile(c);
    window(c, 40 * u, 36 * u, 48 * u, 38 * u, '#d8d8d8');
  });
  at(3, 6, mobile);
  at(4, 6, (c) => {
    c.fillStyle = '#ffffff';
    c.fillRect(0, 0, S, S);
    c.fillStyle = '#c02020';
    c.fillRect(0, 20 * u, S, 40 * u);
    c.fillStyle = '#ffffff';
    c.fillRect(0, 34 * u, S, 6 * u);
  }, false);
  // Linha 7: acabamentos e entulho.
  at(0, 7, (c) => {
    c.fillStyle = '#3c3a38';
    c.fillRect(0, 0, S, S);
    for (let i = 0; i < 200; i++) {
      c.fillStyle = `rgba(255,255,255,${rng.next() * 0.05})`;
      c.fillRect(rng.next() * S, rng.next() * S, 2 * u, 2 * u);
    }
  }, false);
  at(1, 7, (c) => {
    c.fillStyle = '#ecebe6';
    c.fillRect(0, 0, S, S);
  });
  at(2, 7, (c) => {
    c.fillStyle = '#9c9890';
    c.fillRect(0, 0, S, S);
    for (let i = 0; i < 300; i++) {
      c.fillStyle = `rgba(0,0,0,${rng.next() * 0.1})`;
      c.fillRect(rng.next() * S, rng.next() * S, 4 * u, 4 * u);
    }
  }, false);
  at(3, 7, (c) => {
    glass(c, 0, 0, S, S);
  }, false);
  at(4, 7, (c) => {
    c.fillStyle = '#7a6a58';
    c.fillRect(0, 0, S, S);
    for (let i = 0; i < 220; i++) {
      const v = 60 + rng.next() * 140;
      c.fillStyle = rng.next() < 0.3 ? `rgb(${v},${v * 0.55},${v * 0.4})` : `rgb(${v},${v * 0.95},${v * 0.85})`;
      c.save();
      c.translate(rng.next() * S, rng.next() * S);
      c.rotate(rng.next() * Math.PI);
      c.fillRect(0, 0, (4 + rng.next() * 20) * u, (1.5 + rng.next() * 4) * u);
      c.restore();
    }
  }, false);

  // Canal alfa: 255 nas áreas pintáveis (parede), 0 em vidros/portas. Montado como
  // DataTexture para o canvas não destruir a cor dos pixels transparentes.
  const W = S * N;
  const img = ctx.getImageData(0, 0, W, W);
  const d = new Uint8Array(img.data.buffer.slice(0));
  const paintable = new Set(alphaMask.filter((m) => m[2]).map((m) => m[0] + ',' + m[1]));
  for (let y = 0; y < W; y++)
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      if (!paintable.has(Math.floor(x / S) + ',' + Math.floor(y / S))) {
        d[i + 3] = 0;
        continue;
      }
      // Pixels claros e pouco saturados (parede) são pintáveis; escuros e coloridos não.
      const mx = Math.max(d[i], d[i + 1], d[i + 2]);
      const mn = Math.min(d[i], d[i + 1], d[i + 2]);
      d[i + 3] = mx > 150 && mx - mn < 40 ? 255 : 0;
    }
  const t = new THREE.DataTexture(d, W, W, THREE.RGBAFormat, THREE.UnsignedByteType);
  t.flipY = true;
  t.colorSpace = THREE.SRGBColorSpace;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = ANISO;
  t.needsUpdate = true;
  return t;
}

// ------------------------------------------------------------------ Telhados
function shingles(size, seed) {
  const cv = canvas(size);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#d8d8d8';
  ctx.fillRect(0, 0, size, size);
  const rng = new RNG(seed);
  const rows = 16;
  const rh = size / rows;
  for (let r = 0; r < rows; r++) {
    const off = (r % 2) * rh * 0.6;
    for (let x = -rh; x < size + rh; x += rh * 1.2) {
      const v = 150 + rng.next() * 80;
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(x + off, r * rh, rh * 1.15, rh);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, r * rh + rh - 2, size, 2);
  }
  grain(ctx, size, size, 40, seed + 1);
  return toTex(cv);
}

function clayTiles(size, seed) {
  const cv = canvas(size);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#b4583a';
  ctx.fillRect(0, 0, size, size);
  const rng = new RNG(seed);
  const cols = 10;
  const rows = 8;
  const cw = size / cols;
  const rh = size / rows;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = c * cw;
      const y = r * rh;
      const f = 0.75 + rng.next() * 0.4;
      const g = ctx.createLinearGradient(x, 0, x + cw, 0);
      g.addColorStop(0, shade('#8a3a22', f));
      g.addColorStop(0.5, shade('#d07a50', f));
      g.addColorStop(1, shade('#7a3420', f));
      ctx.fillStyle = g;
      ctx.fillRect(x, y, cw, rh);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.fillRect(x, y + rh - 3, cw, 3);
      if (rng.next() < 0.12) {
        ctx.fillStyle = 'rgba(40,50,30,0.25)';
        ctx.fillRect(x, y, cw, rh);
      }
    }
  grain(ctx, size, size, 18, seed);
  return toTex(cv);
}

function corrugatedRoof(size, seed) {
  const cv = canvas(size);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#c8cacc';
  ctx.fillRect(0, 0, size, size);
  const step = size / 24;
  for (let x = 0; x < size; x += step) {
    const g = ctx.createLinearGradient(x, 0, x + step, 0);
    g.addColorStop(0, 'rgba(255,255,255,0.3)');
    g.addColorStop(0.5, 'rgba(0,0,0,0.25)');
    g.addColorStop(1, 'rgba(255,255,255,0.3)');
    ctx.fillStyle = g;
    ctx.fillRect(x, 0, step, size);
  }
  const rng = new RNG(seed);
  for (let i = 0; i < 18; i++) {
    ctx.fillStyle = `rgba(150,75,30,${rng.next() * 0.22})`;
    ctx.beginPath();
    ctx.ellipse(rng.next() * size, rng.next() * size, rng.next() * size * 0.1, rng.next() * size * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, size / 2, size, 2);
  return toTex(cv);
}

function flatRoof(size, seed) {
  const cv = canvas(size);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#8c8a86';
  ctx.fillRect(0, 0, size, size);
  grain(ctx, size, size, 50, seed, noiseField(size, 5, 3, seed));
  return toTex(cv);
}

// ------------------------------------------------------------------ Vegetação
function bark(size, seed, light = false) {
  const cv = canvas(size);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = light ? '#cfc6b6' : '#5a4636';
  ctx.fillRect(0, 0, size, size);
  const rng = new RNG(seed);
  for (let i = 0; i < 90; i++) {
    const x = rng.next() * size;
    ctx.strokeStyle = light ? `rgba(120,100,80,${0.2 + rng.next() * 0.4})` : `rgba(20,14,10,${0.3 + rng.next() * 0.5})`;
    ctx.lineWidth = 1 + rng.next() * 3;
    ctx.beginPath();
    let y = rng.next() * size;
    ctx.moveTo(x, y);
    let xx = x;
    for (let s = 0; s < 10; s++) {
      xx += rng.range(-2, 2);
      y += size / 14;
      ctx.lineTo(xx, y);
    }
    ctx.stroke();
  }
  if (light) {
    for (let i = 0; i < 20; i++) {
      ctx.fillStyle = `rgba(${rng.pick(['150,120,90', '200,190,170', '110,120,100'])},0.5)`;
      ctx.fillRect(rng.next() * size, rng.next() * size, rng.next() * size * 0.3, rng.next() * size * 0.15);
    }
  }
  grain(ctx, size, size, 20, seed);
  return toTex(cv);
}

function foliage(size, seed) {
  const cv = canvas(size);
  const ctx = cv.getContext('2d');
  ctx.fillStyle = '#6e6e6e';
  ctx.fillRect(0, 0, size, size);
  const rng = new RNG(seed);
  for (let i = 0; i < size * 2.4; i++) {
    const x = rng.next() * size;
    const y = rng.next() * size;
    const r = (2 + rng.next() * 5) * (size / 256);
    const v = 70 + rng.next() * 150;
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    for (const ox of [-size, 0, size])
      for (const oy of [-size, 0, size]) {
        ctx.beginPath();
        ctx.ellipse(x + ox, y + oy, r, r * 0.6, rng.next() * 3, 0, Math.PI * 2);
        ctx.fill();
      }
  }
  // Buracos escuros entre os tufos.
  for (let i = 0; i < size * 0.25; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(rng.next() * size, rng.next() * size, (1 + rng.next() * 3) * (size / 256), 0, Math.PI * 2);
    ctx.fill();
  }
  return toTex(cv);
}

// ------------------------------------------------------------------ Partículas
function softDot(size) {
  const cv = canvas(size);
  const ctx = cv.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.5)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return toTex(cv, { srgb: false, repeat: false });
}

// Placa de cidade com texto (cada país tem seu estilo).
export function signTexture(text, style) {
  const cv = canvas(256, 128);
  const c = cv.getContext('2d');
  const st = {
    us: { bg: '#1e6a3a', fg: '#ffffff', border: '#ffffff' },
    ca: { bg: '#1e6a3a', fg: '#ffffff', border: '#ffffff' },
    br: { bg: '#1d4f9a', fg: '#ffffff', border: '#ffffff' },
    ar: { bg: '#1d4f9a', fg: '#ffffff', border: '#ffffff' },
    cl: { bg: '#1e6a3a', fg: '#ffffff', border: '#ffffff' },
    uy: { bg: '#1d4f9a', fg: '#ffffff', border: '#ffffff' },
  }[style] || { bg: '#1e6a3a', fg: '#fff', border: '#fff' };
  c.fillStyle = st.bg;
  c.fillRect(0, 0, 256, 128);
  c.strokeStyle = st.border;
  c.lineWidth = 6;
  c.strokeRect(8, 8, 240, 112);
  c.fillStyle = st.fg;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  const lines = text.split('\n');
  let fs = lines.length > 1 ? 30 : 38;
  c.font = `bold ${fs}px sans-serif`;
  while (Math.max(...lines.map((l) => c.measureText(l).width)) > 220 && fs > 14) {
    fs -= 2;
    c.font = `bold ${fs}px sans-serif`;
  }
  lines.forEach((l, i) => c.fillText(l, 128, 64 + (i - (lines.length - 1) / 2) * (fs + 6)));
  return toTex(cv, { repeat: false });
}

export function buildTextures(renderer, q) {
  ANISO = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const s = q.texSize;
  const tile = Math.max(64, Math.min(256, s / 2));
  return {
    detail: terrainDetail(Math.min(512, s), 11),
    asphalt: asphalt(s, 21),
    gravel: unpavedRoad(s, 31, 'gravel'),
    dirt: unpavedRoad(s, 41, 'dirt'),
    facade: facadeAtlas(tile, 51),
    shingles: shingles(s, 61),
    clay: clayTiles(s, 71),
    corrugated: corrugatedRoof(s, 81),
    flat: flatRoof(Math.min(256, s), 91),
    bark: bark(Math.min(256, s), 101),
    barkLight: bark(Math.min(256, s), 102, true),
    foliage: foliage(Math.min(512, s), 111),
    dot: softDot(64),
  };
}

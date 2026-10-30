// Texturas procedurais (canvas): solo, asfalto, calçamento, folhagem e fachadas.
import * as THREE from 'three';
import { RNG, clamp } from '../util.js';

let maxAniso = 4;
export function setAnisotropy(a) {
  maxAniso = a;
}

// ruído de valor periódico (repete a cada `per` células)
function tileNoise(seed, per) {
  const rng = new RNG(seed);
  const g = new Float32Array(per * per);
  for (let i = 0; i < g.length; i++) g[i] = rng.next();
  return (u, v) => {
    // u, v em células
    const x = Math.floor(u);
    const y = Math.floor(v);
    const fx = u - x;
    const fy = v - y;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const i0 = ((x % per) + per) % per;
    const j0 = ((y % per) + per) % per;
    const i1 = (i0 + 1) % per;
    const j1 = (j0 + 1) % per;
    const a = g[j0 * per + i0];
    const b = g[j0 * per + i1];
    const c = g[j1 * per + i0];
    const d = g[j1 * per + i1];
    return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
  };
}

function fbmT(n, u, v, oct) {
  let s = 0;
  let a = 0.5;
  let f = 1;
  for (let o = 0; o < oct; o++) {
    s += a * n(u * f, v * f);
    a *= 0.5;
    f *= 2;
  }
  return s;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function pixelTex(size, fn, { srgb = true, repeat = true } = {}) {
  const c = canvas(size, size);
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const out = [0, 0, 0];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      fn(x / size, y / size, out);
      const o = (y * size + x) * 4;
      d[o] = clamp(out[0], 0, 1) * 255;
      d[o + 1] = clamp(out[1], 0, 1) * 255;
      d[o + 2] = clamp(out[2], 0, 1) * 255;
      d[o + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  return finish(new THREE.CanvasTexture(c), srgb, repeat);
}

function finish(t, srgb = true, repeat = true) {
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = maxAniso;
  t.needsUpdate = true;
  return t;
}

const cache = {};
const once = (k, f) => cache[k] || (cache[k] = f());

// ------------------------------------------------------------ solo
// Grama: detalhe em tons de cinza (média ~0,5), tingida no shader pela cor do bioma
export const grassTex = () =>
  once('grass', () => {
    const n = tileNoise(11, 64);
    const n2 = tileNoise(12, 16);
    const S = 512;
    const t = pixelTex(S, (u, v, o) => {
      const blades = n(u * 64, v * 64) * 0.5 + n(u * 64 + 17, v * 64 * 0.5) * 0.5;
      const patch = fbmT(n2, u * 16, v * 16, 3);
      const l = 0.32 + blades * 0.38 + patch * 0.3;
      o[0] = l * 0.98;
      o[1] = l * 1.02;
      o[2] = l * 0.9;
    }, { srgb: false });
    return t;
  });

export const rockTex = () =>
  once('rock', () => {
    const n = tileNoise(21, 32);
    const n2 = tileNoise(22, 8);
    return pixelTex(512, (u, v, o) => {
      const f = fbmT(n, u * 32, v * 32, 5);
      const strata = Math.sin((v * 8 + fbmT(n2, u * 8, v * 8, 2) * 3) * Math.PI * 2) * 0.5 + 0.5;
      const crack = Math.abs(n(u * 32 + 5, v * 32 + 9) - 0.5) < 0.03 ? 0.55 : 1;
      const l = (0.32 + f * 0.42 + strata * 0.1) * crack;
      o[0] = l * 1.02;
      o[1] = l * 0.98;
      o[2] = l * 0.93;
    });
  });

export const sandTex = () =>
  once('sand', () => {
    const n = tileNoise(31, 128);
    const n2 = tileNoise(32, 8);
    return pixelTex(512, (u, v, o) => {
      const grain = n(u * 128, v * 128);
      const rip = Math.sin((u * 6 + v * 2 + fbmT(n2, u * 8, v * 8, 2) * 1.5) * Math.PI * 2) * 0.5 + 0.5;
      const l = 0.74 + grain * 0.12 + rip * 0.06;
      o[0] = l * 0.98;
      o[1] = l * 0.88;
      o[2] = l * 0.68;
    });
  });

export const dirtTex = () =>
  once('dirt', () => {
    const n = tileNoise(41, 64);
    const n2 = tileNoise(42, 16);
    return pixelTex(512, (u, v, o) => {
      const f = fbmT(n2, u * 16, v * 16, 3);
      const peb = n(u * 64, v * 64);
      const p = peb > 0.78 ? 0.25 : 0;
      const l = 0.42 + f * 0.25 + p;
      o[0] = l * 0.92;
      o[1] = l * 0.76;
      o[2] = l * 0.58;
    });
  });

export const snowTex = () =>
  once('snow', () => {
    const n = tileNoise(51, 32);
    return pixelTex(256, (u, v, o) => {
      const f = fbmT(n, u * 32, v * 32, 4);
      const l = 0.86 + f * 0.14;
      o[0] = l * 0.96;
      o[1] = l * 0.98;
      o[2] = l;
    });
  });

// variação de cor em grande escala (cinza, média 0,5)
export const macroTex = () =>
  once('macro', () => {
    const n = tileNoise(61, 16);
    return pixelTex(256, (u, v, o) => {
      const f = fbmT(n, u * 16, v * 16, 4);
      o[0] = o[1] = o[2] = f;
    }, { srgb: false });
  });

// ------------------------------------------------------------ estradas
// u = largura da pista (0..1), v = comprimento (1 repetição = 12 m)
export function asphaltTex(lineColor = 'white', wide = false) {
  return once('asph' + lineColor + wide, () => {
    const W = 256;
    const H = 1024;
    const c = canvas(W, H);
    const ctx = c.getContext('2d');
    const img = ctx.createImageData(W, H);
    const d = img.data;
    const n = tileNoise(71, 32);
    const n2 = tileNoise(72, 128);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const u = x / W;
        const v = y / H;
        const agg = n2(u * 128, v * 512);
        const big = fbmT(n, u * 8, v * 32, 3);
        // trilhas dos pneus mais escuras e polidas
        const tr = Math.min(Math.abs(((u * 4) % 1) - 0.5), 0.5);
        const track = 1 - 0.06 * Math.exp(-tr * tr * 60);
        let l = (0.19 + agg * 0.09 + big * 0.06) * track;
        if (agg > 0.86) l += 0.08;
        const o = (y * W + x) * 4;
        d[o] = d[o + 1] = d[o + 2] = l * 255;
        d[o + 2] = l * 262;
        d[o + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    // faixas
    const paint = (x0, x1, y0, y1, col) => {
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.92;
      ctx.fillRect(x0 * W, y0 * H, (x1 - x0) * W, (y1 - y0) * H);
      // desgaste
      ctx.globalAlpha = 1;
      const rng = new RNG(Math.floor(x0 * 1000 + y0 * 77));
      for (let i = 0; i < 160; i++) {
        ctx.fillStyle = `rgba(60,60,62,${rng.float(0.2, 0.6)})`;
        ctx.fillRect(rng.float(x0, x1) * W, rng.float(y0, y1) * H, 2, 2);
      }
    };
    const white = '#e9e9e2';
    const yel = '#e8b52a';
    paint(0.028, 0.048, 0, 1, white);
    paint(0.952, 0.972, 0, 1, white);
    const cc = lineColor === 'yellow' ? yel : white;
    if (wide) {
      paint(0.485, 0.497, 0, 1, cc);
      paint(0.503, 0.515, 0, 1, cc);
    } else {
      paint(0.49, 0.51, 0, 0.5, cc);
    }
    return finish(new THREE.CanvasTexture(c));
  });
}

export const gravelTex = () =>
  once('gravel', () => {
    const n = tileNoise(81, 128);
    return pixelTex(256, (u, v, o) => {
      const g = n(u * 128, v * 128);
      const l = 0.33 + g * 0.3;
      o[0] = l * 0.95;
      o[1] = l * 0.88;
      o[2] = l * 0.78;
    });
  });

// calçamento de pedra (praças)
export const pavingTex = (tint = [0.7, 0.66, 0.6]) =>
  once('paving' + tint.join(), () => {
    const n = tileNoise(91, 64);
    return pixelTex(512, (u, v, o) => {
      const s = 8;
      const row = Math.floor(v * s);
      const uu = u * s + (row % 2) * 0.5;
      const fu = uu - Math.floor(uu);
      const fv = v * s - row;
      const id = Math.floor(uu) * 31 + row * 17;
      const joint = fu < 0.04 || fv < 0.05 ? 0.55 : 1;
      const k = 0.82 + ((id * 9301 + 49297) % 233280) / 233280 * 0.22 + n(u * 64, v * 64) * 0.12;
      o[0] = tint[0] * k * joint;
      o[1] = tint[1] * k * joint;
      o[2] = tint[2] * k * joint;
    });
  });

// ------------------------------------------------------------ folhagem
// Atlas 4x2: folhas largas, agulhas, palmeira, flor de cerejeira, cipreste,
// oliveira, bananeira, arbusto seco. Fundo transparente.
export const leafAtlas = () =>
  once('leaf', () => {
    const S = 1024;
    const c = canvas(S, S / 2);
    const ctx = c.getContext('2d');
    const T = S / 4;
    const rng = new RNG(5);
    const cell = (i, draw) => {
      const x0 = (i % 4) * T;
      const y0 = Math.floor(i / 4) * T;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x0, y0, T, T);
      ctx.clip();
      ctx.translate(x0, y0);
      draw();
      ctx.restore();
    };
    const hsl = (h, s, l) => `hsl(${h},${s}%,${l}%)`;
    const leaf = (x, y, r, a, col) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(a);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    const blob = (count, rad, hue, sat, lmin, lmax, size) => {
      for (let k = 0; k < count; k++) {
        const a = rng.float(0, Math.PI * 2);
        const r = Math.sqrt(rng.next()) * rad;
        const x = T / 2 + Math.cos(a) * r;
        const y = T / 2 + Math.sin(a) * r;
        // folhas de cima mais claras
        const l = lmin + (lmax - lmin) * (1 - (y / T) * 0.7) * rng.float(0.6, 1);
        leaf(x, y, size * rng.float(0.7, 1.3), rng.float(0, Math.PI), hsl(hue + rng.float(-8, 8), sat, l));
      }
    };
    // 0 folhas largas
    cell(0, () => blob(900, T * 0.46, 100, 45, 14, 40, 9));
    // 1 agulhas (galho de conífera)
    cell(1, () => {
      ctx.strokeStyle = hsl(30, 30, 18);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(T * 0.5, T);
      ctx.lineTo(T * 0.5, T * 0.04);
      ctx.stroke();
      for (let k = 0; k < 70; k++) {
        const y = T * (0.06 + 0.92 * (k / 70));
        const w = (T * 0.48 * (y / T)) * rng.float(0.8, 1.05);
        for (const s of [-1, 1]) {
          ctx.strokeStyle = hsl(130 + rng.float(-10, 10), 35, rng.float(12, 26));
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(T * 0.5, y);
          ctx.quadraticCurveTo(T * 0.5 + s * w * 0.6, y - 4, T * 0.5 + s * w, y + 6);
          ctx.stroke();
          for (let q = 0; q < 9; q++) {
            const t = q / 9;
            const px = T * 0.5 + s * w * t;
            const py = y + 6 * t * t;
            ctx.beginPath();
            ctx.moveTo(px, py);
            ctx.lineTo(px + s * 6, py + 7);
            ctx.stroke();
          }
        }
      }
    });
    // 2 folha de palmeira (fronde; eixo ao longo de v)
    cell(2, () => {
      ctx.strokeStyle = hsl(70, 35, 30);
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(T * 0.5, T);
      ctx.lineTo(T * 0.5, 0);
      ctx.stroke();
      for (let k = 0; k < 64; k++) {
        const y = T * (k / 64);
        const w = T * 0.48 * Math.sin((y / T) * Math.PI) ** 0.6;
        for (const s of [-1, 1]) {
          ctx.strokeStyle = hsl(95 + rng.float(-10, 10), 45, rng.float(22, 36));
          ctx.lineWidth = 3.2;
          ctx.beginPath();
          ctx.moveTo(T * 0.5, y);
          ctx.quadraticCurveTo(T * 0.5 + s * w * 0.5, y + 8, T * 0.5 + s * w, y + 22);
          ctx.stroke();
        }
      }
    });
    // 3 flor de cerejeira
    cell(3, () => {
      blob(260, T * 0.44, 100, 30, 25, 35, 7);
      for (let k = 0; k < 1100; k++) {
        const a = rng.float(0, Math.PI * 2);
        const r = Math.sqrt(rng.next()) * T * 0.47;
        ctx.fillStyle = hsl(335 + rng.float(-10, 10), rng.float(55, 80), rng.float(76, 92));
        ctx.beginPath();
        ctx.arc(T / 2 + Math.cos(a) * r, T / 2 + Math.sin(a) * r, rng.float(2.5, 5), 0, Math.PI * 2);
        ctx.fill();
      }
    });
    // 4 cipreste (folhagem densa e escura)
    cell(4, () => blob(1300, T * 0.47, 120, 30, 9, 24, 6));
    // 5 oliveira (prateada)
    cell(5, () => blob(800, T * 0.45, 85, 18, 30, 52, 7));
    // 6 bananeira (folha grande)
    cell(6, () => {
      ctx.fillStyle = hsl(95, 50, 34);
      ctx.beginPath();
      ctx.ellipse(T / 2, T / 2, T * 0.2, T * 0.48, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = hsl(80, 40, 50);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(T / 2, T * 0.02);
      ctx.lineTo(T / 2, T * 0.98);
      ctx.stroke();
      ctx.strokeStyle = hsl(90, 40, 26);
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 40; k++) {
        const y = T * (0.06 + 0.88 * (k / 40));
        ctx.beginPath();
        ctx.moveTo(T / 2, y);
        ctx.lineTo(T / 2 - T * 0.2, y + 10);
        ctx.moveTo(T / 2, y);
        ctx.lineTo(T / 2 + T * 0.2, y + 10);
        ctx.stroke();
      }
    });
    // 7 arbusto seco
    cell(7, () => {
      for (let k = 0; k < 220; k++) {
        ctx.strokeStyle = hsl(40 + rng.float(-10, 20), 25, rng.float(25, 45));
        ctx.lineWidth = 1.6;
        const a = rng.float(-Math.PI, 0);
        const r = rng.float(T * 0.15, T * 0.48);
        ctx.beginPath();
        ctx.moveTo(T / 2, T * 0.95);
        ctx.lineTo(T / 2 + Math.cos(a) * r, T * 0.95 + Math.sin(a) * r * 1.6);
        ctx.stroke();
      }
      blob(250, T * 0.4, 75, 25, 25, 40, 5);
    });
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = maxAniso;
    t.generateMipmaps = true;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    return t;
  });

export const barkTex = () =>
  once('bark', () => {
    const n = tileNoise(101, 16);
    return pixelTex(256, (u, v, o) => {
      const f = fbmT(n, u * 16, v * 4, 4);
      const ridge = Math.abs(Math.sin((u * 10 + f * 2) * Math.PI));
      const l = 0.55 + ridge * 0.3 + f * 0.15;
      o[0] = l * 1.05;
      o[1] = l * 0.92;
      o[2] = l * 0.8;
    });
  });

// textura de brilho (sprites de luz)
export const glowTex = () =>
  once('glow', () => {
    const c = canvas(128, 128);
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.15, 'rgba(255,240,210,0.8)');
    g.addColorStop(0.45, 'rgba(255,200,140,0.18)');
    g.addColorStop(1, 'rgba(255,180,120,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  });

// ------------------------------------------------------------ texto em placas
export function textTex(lines, { w = 512, h = 256, bg = '#1f6b3a', fg = '#fff', border = '#fff', font = 'bold 64px sans-serif', sub = 'bold 40px sans-serif', flag = null } = {}) {
  const c = canvas(w, h);
  const ctx = c.getContext('2d');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, w, h);
  if (border) {
    ctx.strokeStyle = border;
    ctx.lineWidth = Math.max(6, w / 64);
    ctx.strokeRect(10, 10, w - 20, h - 20);
  }
  ctx.fillStyle = fg;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let y0 = h / (lines.length + 1);
  if (flag) {
    flag(ctx, w / 2 - w * 0.14, h * 0.1, w * 0.28, h * 0.28);
    y0 = h * 0.5;
  }
  const step = flag ? (h * 0.5) / lines.length : h / (lines.length + 1);
  lines.forEach((l, i) => {
    ctx.font = i === 0 ? font : sub;
    ctx.fillText(l, w / 2, flag ? y0 + step * (i + 0.4) : y0 + step * i, w - 40);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = maxAniso;
  return t;
}

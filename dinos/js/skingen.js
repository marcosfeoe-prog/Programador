// Geração das peles dos dinossauros em arrays puros (sem DOM), para rodar
// em Web Workers em paralelo ou, se não houver, na thread principal.
import { clamp, lerp, smoothstep, makeTileNoise, makeTileWorley, tileFbm, hash2, TAU } from './util.js';

const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
const mix3 = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

function pixelLoop(w, h, fn) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const col = fn(x, y);
      const i = (y * w + x) * 4;
      d[i] = col[0] * 255;
      d[i + 1] = col[1] * 255;
      d[i + 2] = col[2] * 255;
      d[i + 3] = 255;
    }
  }
  return d;
}

// Mapa normal (RGBA) a partir de um campo de altura periódico. A linha 0 é
// v = 0 (DataTexture não inverte a imagem), por isso o verde vai com -dy.
export function heightToNormal(hgt, w, h, strength) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    const yu = ((y - 1 + h) % h) * w;
    const yd = ((y + 1) % h) * w;
    for (let x = 0; x < w; x++) {
      const xl = (x - 1 + w) % w;
      const xr = (x + 1) % w;
      const dx = (hgt[y * w + xr] - hgt[y * w + xl]) * strength;
      const dy = (hgt[yd + x] - hgt[yu + x]) * strength;
      const len = Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * w + x) * 4;
      d[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      d[i + 1] = ((-dy / len) * 0.5 + 0.5) * 255;
      d[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  return d;
}

// ---------------------------------------------------------------------------
// Pele de dinossauro. u = volta em torno do corpo (0 = barriga, 0.5 = dorso),
// v = comprimento (uma repetição da textura = uma volta do corpo, então as
// escamas mantêm a proporção em qualquer parte). Camadas: contra-sombra,
// padrão da espécie, escamas por região (miúdas nos flancos, graúdas no dorso,
// placas transversais na barriga), osteodermos na linha da espinha, dobras de
// pele, sujeira nas frestas e um mapa de rugosidade.
// ---------------------------------------------------------------------------

// Campo periódico calculado em baixa resolução e lido com interpolação bilinear.
function lowField(res, fn) {
  const f = new Float32Array(res * res);
  for (let j = 0; j < res; j++) for (let i = 0; i < res; i++) f[j * res + i] = fn(i / res, j / res);
  return (u, v) => {
    const x = (u - Math.floor(u)) * res;
    const y = (v - Math.floor(v)) * res;
    const i0 = Math.floor(x);
    const j0 = Math.floor(y);
    const fx = x - i0;
    const fy = y - j0;
    const i1 = (i0 + 1) % res;
    const j1 = (j0 + 1) % res;
    return lerp(lerp(f[j0 * res + i0], f[j0 * res + i1], fx), lerp(f[j1 * res + i0], f[j1 * res + i1], fx), fy);
  };
}

export const dome = (cell, width) => Math.sqrt(clamp((cell.f2 - cell.f1) / width, 0, 1)) * (1 - cell.f1 * 0.35);

export function genSkin({ skin, seed = 1, limb = false, size = 512 }) {
  const w = limb ? size / 2 : size;
  const h = w;
  const noise = makeTileNoise(seed);
  const macro = lowField(128, (u, v) => tileFbm(noise, u, v, 3, 4));
  const mid = lowField(256, (u, v) => tileFbm(noise, u + 0.37, v + 0.71, 12, 3));
  const warpF = lowField(128, (u, v) => tileFbm(noise, u + 0.13, v + 0.57, 4, 3));
  const wrinkM = lowField(128, (u, v) => tileFbm(noise, u + 0.61, v + 0.29, 6, 3));
  const mottle = skin.pattern === 'mottled' || skin.pattern === 'saddles' ? lowField(256, (u, v) => tileFbm(noise, u + 0.5, v, 6, 4)) : null;
  const fine = makeTileWorley(seed + 11, 64, 64);
  const big = makeTileWorley(seed + 23, 24, 24);
  const plates = makeTileWorley(seed + 31, 30, 60, 0.75);
  const spots = makeTileWorley(seed + 37, 6, 6, 0.9);
  const base = hex(skin.base);
  const dark = hex(skin.dark);
  const belly = hex(skin.belly);
  const accent = hex(skin.accent ?? skin.dark);
  const tone = [base[0] * 0.78, base[1] * 0.74, base[2] * 0.66];
  const mud = [0.3, 0.24, 0.17];
  const stripes = skin.stripes ?? 3;
  const hgt = new Float32Array(w * h);
  const rough = new Uint8ClampedArray(w * h);

  const color = pixelLoop(w, h, (x, y) => {
    const u = x / w;
    const v = y / h;
    // membros: só a faixa do flanco, repetindo em volta (frente um pouco mais escura)
    const dorsal = limb ? 0.46 + 0.1 * Math.sin(TAU * u) : 0.5 - 0.5 * Math.cos(TAU * u); // 0 barriga → 1 dorso
    const m1 = macro(u, v);
    const m2 = mid(u, v);
    const wp = warpF(u, v);
    const d2 = dorsal + m1 * 0.08;
    const wBelly = 1 - smoothstep(0.1, 0.24, d2);
    const wDorsal = smoothstep(0.68, 0.9, d2);

    // ---- relevo: escamas por região ----
    const A = fine(u, v);
    const hA = dome(A, 0.45);
    const idA = A.id;
    // (só consulta as células graúdas/placas onde elas aparecem)
    const bigW = smoothstep(0.38, 0.78, d2);
    let hB = 0;
    let idB = 0;
    if (bigW > 0) {
      const Bc = big(u, v);
      hB = dome(Bc, 0.4);
      idB = Bc.id;
    }
    const flank = lerp(hA, Math.max(hA * 0.55, hB), bigW);
    let hs = flank;
    if (wBelly > 0) hs = lerp(flank, dome(plates(u, v), 0.4) * 0.75 + hA * 0.25, wBelly);
    // osteodermos: duas fileiras ao longo da espinha
    let ost = 0;
    for (let r = 0; r < (limb ? 0 : 2); r++) {
      const du = (u - (r ? 0.532 : 0.468)) / 0.02;
      const vv = v * 7 + r * 0.5 + wp * 0.2;
      const dv = (vv - Math.floor(vv) - 0.5) / 0.2;
      ost += Math.exp(-(du * du + dv * dv) * 1.4);
    }
    // dobras de pele em volta do corpo
    const fold = Math.abs(Math.sin(Math.PI * (v * 16 + wp * 1.4)));
    const crease = (1 - smoothstep(0.0, limb ? 0.2 : 0.14, fold)) * smoothstep(limb ? -0.2 : 0.0, 0.45, wrinkM(u, v)) * (1 - wDorsal * 0.7);
    hgt[y * w + x] = hs * 0.75 + ost * 0.9 - crease * 0.55 + m2 * 0.12;

    // ---- cor ----
    let col = mix3(belly, base, smoothstep(0.16, 0.6, d2 + m2 * 0.05));
    col = mix3(col, tone, smoothstep(-0.15, 0.5, m1) * 0.45 * smoothstep(0.2, 0.5, d2));
    const patMask = smoothstep(0.3, 0.62, d2 + m1 * 0.1);
    let pat = 0;
    if (skin.pattern === 'stripes' || skin.pattern === 'tiger') {
      const s = Math.sin(TAU * (v * stripes + wp * 0.55 + m2 * 0.08) + Math.cos(TAU * u) * 0.7);
      pat = smoothstep(skin.pattern === 'tiger' ? 0.3 : 0.5, 0.85, s);
      // listras se quebram em pedaços nas bordas
      pat *= smoothstep(-0.35, 0.1, m2 + wp * 0.4);
    } else if (skin.pattern === 'spots') {
      const sp = spots(u, v);
      pat = 1 - smoothstep(0.16, 0.3, sp.f1 + m2 * 0.1);
      pat = Math.max(pat, (1 - smoothstep(0.05, 0.12, Math.abs(sp.f1 - 0.36 - m2 * 0.05))) * 0.5);
    } else if (skin.pattern === 'mottled') {
      pat = smoothstep(0.02, 0.3, mottle(u, v) + m2 * 0.15);
    } else if (skin.pattern === 'saddles') {
      // selas escuras no dorso, quebradas, sobre um manchado miúdo
      const sd = Math.sin(TAU * (v * stripes + wp * 0.6 + m2 * 0.12));
      const saddle = smoothstep(0.15, 0.7, sd) * smoothstep(0.5, 0.85, d2 + m1 * 0.15) * smoothstep(-0.3, 0.2, m2 + wp * 0.3);
      pat = Math.max(saddle, smoothstep(0.08, 0.38, mottle(u, v) + m2 * 0.15) * 0.55);
    } else if (skin.pattern === 'bands') {
      const s = Math.sin(TAU * (v * stripes + wp * 0.35));
      pat = smoothstep(0.2, 0.65, s) * smoothstep(0.5, 0.8, d2);
    }
    col = mix3(col, dark, pat * patMask * (skin.patternStrength ?? 0.85));
    if (skin.accent) col = mix3(col, accent, smoothstep(0.86, 0.97, d2 + m2 * 0.04) * 0.75);
    // barriga e lados de baixo com terra
    col = mix3(col, mud, (1 - smoothstep(0.0, 0.2, dorsal)) * smoothstep(0.05, 0.45, m2 + m1 * 0.3) * 0.3);

    // cada escama com tom próprio, frestas escuras e sujas, topos claros
    const hn = clamp(hs, 0, 1);
    const varA = (hash2(idA, 3, seed) - 0.5) * 0.1;
    const varB = (hash2(idB, 7, seed) - 0.5) * 0.12 * wDorsal;
    const ao = lerp(lerp(0.52, 0.72, wBelly), 1.0, smoothstep(0.0, 0.55, hn)) * (1 - crease * 0.3) * (1 + ost * 0.08);
    col = mix3(col, mud, (1 - ao) * 0.35);
    const shade = ao * (1 + varA + varB + smoothstep(0.7, 1, hn) * 0.06);
    rough[y * w + x] = clamp(0.5 + 0.38 * (1 - hn) + crease * 0.08 - ost * 0.08 + m2 * 0.05, 0, 1) * 255;
    return [col[0] * shade, col[1] * shade, col[2] * shade];
  });

  // rugosidade (lida do canal verde)
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let k = 0; k < w * h; k++) {
    rgba[k * 4] = rgba[k * 4 + 1] = rgba[k * 4 + 2] = rough[k];
    rgba[k * 4 + 3] = 255;
  }
  return { w, color, normal: heightToNormal(hgt, w, h, 2.6 * (size / 512)), rough: rgba };
}


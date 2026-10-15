// Nível 34 — texturas: parede de esgoto com tijolos na metade de cima e
// blocos de pedra na metade de baixo (com a marca escura da água), e piso de
// lajes de pedra molhadas e sujas.
import { registerTexture, TEX } from '../textures.js';
import { clamp, mulberry32 } from '../util.js';

const { toTex, noiseField, whiteNoise, paintRGB, normalMap } = TEX;

// A textura cobre a altura inteira da parede (v = 0 no chão, 1 no teto).
registerTexture('l34Wall', (S) => {
  const low = noiseField(S, S, 4, 4, 4, 3401);
  const mid = noiseField(S, S, 16, 16, 3, 3402);
  const fine = whiteNoise(S * S, 3403);
  const r = mulberry32(3404);
  const split = 0.46; // fração da altura ocupada pela pedra
  // tijolos (metade de cima)
  const bRows = 9;
  const bCols = 4;
  const yTop = S * (1 - split);
  const bh = yTop / bRows;
  const bw = S / bCols;
  const bt = Array.from({ length: bRows * bCols }, () => {
    const t = r();
    if (t < 0.6) return [0.46 + r() * 0.1, 0.27 + r() * 0.06, 0.16 + r() * 0.04];
    if (t < 0.85) return [0.36 + r() * 0.06, 0.2 + r() * 0.04, 0.12 + r() * 0.03];
    return [0.52 + r() * 0.06, 0.4 + r() * 0.05, 0.28 + r() * 0.04];
  });
  // pedra (metade de baixo): fileiras irregulares de blocos largos
  const sRows = 3;
  const sh = (S - yTop) / sRows;
  const sCuts = Array.from({ length: sRows }, () => {
    const cuts = [0];
    let x = 0;
    while (x < S) {
      x += S * (0.22 + r() * 0.2);
      cuts.push(Math.min(S, x));
    }
    cuts[cuts.length - 1] = S;
    return cuts;
  });
  const st = Array.from({ length: 40 }, () => {
    const k = 0.42 + r() * 0.16;
    return [k * 1.0, k * 0.97, k * 0.88];
  });
  const hf = new Float32Array(S * S);
  const rg = new Float32Array(S * S);
  const g = Math.max(1, S / 170);
  const cv = paintRGB(S, S, (x, y, i, o) => {
    let c;
    let h;
    let k = 0.84 + low[i] * 0.22 + mid[i] * 0.08 + fine[i] * 0.05;
    if (y < yTop) {
      const row = Math.floor(y / bh);
      const off = row % 2 ? bw / 2 : 0;
      const xx = (x + off) % S;
      const col = Math.floor(xx / bw);
      const lx = xx - col * bw;
      const ly = y - row * bh;
      const d = Math.min(lx, bw - 1 - lx, ly, bh - 1 - ly);
      c = bt[row * bCols + col];
      h = 0.62 + fine[i] * 0.04 + mid[i] * 0.05;
      if (d < g * 1.2) {
        c = [0.26, 0.24, 0.2];
        h = 0;
      } else if (d < g * 2.2) h = 0.42;
      // salitre esbranquiçado escorrendo das juntas
      const salt = clamp((mid[i] - 0.35) * 2, 0, 0.5) * clamp(1 - ly / bh, 0, 1);
      c = [c[0] + salt * 0.25, c[1] + salt * 0.25, c[2] + salt * 0.22];
    } else {
      const sy = y - yTop;
      const row = Math.min(sRows - 1, Math.floor(sy / sh));
      const cuts = sCuts[row];
      const xx = (x + row * S * 0.37) % S;
      let col = 0;
      while (col < cuts.length - 2 && xx >= cuts[col + 1]) col++;
      const lx = Math.min(xx - cuts[col], cuts[col + 1] - 1 - xx);
      const ly = Math.min(sy - row * sh, (row + 1) * sh - 1 - sy);
      const d = Math.min(lx, ly);
      c = st[(row * 7 + col) % st.length];
      h = 0.55 + low[i] * 0.12 + fine[i] * 0.08;
      if (d < g * 2) {
        c = [0.2, 0.2, 0.18];
        h = 0;
      } else if (d < g * 4) h = 0.4;
      k *= 0.9 + fine[i] * 0.06;
    }
    // faixa escura e esverdeada da água, embaixo
    const v = 1 - y / S;
    const wl = clamp((0.16 + low[i] * 0.03 - v) / 0.05, 0, 1);
    const moss = clamp((mid[i] + 0.1) * 1.5, 0, 1) * wl;
    k *= 1 - wl * 0.45;
    // fuligem perto do teto
    k *= 1 - clamp((v - 0.86) / 0.14, 0, 1) * 0.35;
    o[0] = (c[0] * (1 - moss * 0.5) + 0.12 * moss) * k;
    o[1] = (c[1] * (1 - moss * 0.3) + 0.16 * moss) * k;
    o[2] = (c[2] * (1 - moss * 0.6) + 0.05 * moss) * k;
    hf[i] = h;
    rg[i] = h === 0 ? 0.95 : clamp(0.62 + low[i] * 0.25 - wl * 0.45, 0.15, 0.95);
  });
  const rgh = paintRGB(S, S, (x, y, i, o) => {
    o[0] = o[1] = o[2] = rg[i];
  });
  return { map: toTex(cv), normalMap: normalMap(hf, S, S, 3.4), roughnessMap: toTex(rgh, { srgb: false }) };
});

// Lajes de pedra grandes e irregulares, molhadas, com lodo nas juntas.
registerTexture('l34Floor', (S) => {
  const low = noiseField(S, S, 4, 4, 4, 3411);
  const mid = noiseField(S, S, 12, 12, 3, 3412);
  const fine = whiteNoise(S * S, 3413);
  const r = mulberry32(3414);
  const rows = 4;
  const rh = S / rows;
  const cuts = Array.from({ length: rows }, () => {
    const c = [0];
    let x = 0;
    while (x < S) {
      x += S * (0.2 + r() * 0.22);
      c.push(Math.min(S, x));
    }
    c[c.length - 1] = S;
    return c;
  });
  const tones = Array.from({ length: 32 }, () => 0.36 + r() * 0.14);
  const hf = new Float32Array(S * S);
  const rg = new Float32Array(S * S);
  const g = Math.max(1, S / 150);
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const row = Math.floor(y / rh);
    const cc = cuts[row];
    const xx = (x + row * S * 0.29) % S;
    let col = 0;
    while (col < cc.length - 2 && xx >= cc[col + 1]) col++;
    const d = Math.min(xx - cc[col], cc[col + 1] - 1 - xx, y - row * rh, (row + 1) * rh - 1 - y);
    const t = tones[(row * 5 + col) % tones.length];
    let k = t * (0.85 + low[i] * 0.2 + mid[i] * 0.1 + fine[i] * 0.05);
    let cr = k;
    let cg = k * 0.96;
    let cb = k * 0.86;
    let h = 0.6 + mid[i] * 0.08 + fine[i] * 0.05;
    if (d < g * 2.2) {
      // junta com lodo
      cr = 0.13;
      cg = 0.14;
      cb = 0.07;
      h = 0;
    } else if (d < g * 3.6) h = 0.45;
    // poças: manchas escuras e lisas
    const wet = clamp((low[i] - 0.1) * 3, 0, 1);
    cr *= 1 - wet * 0.35;
    cg *= 1 - wet * 0.3;
    cb *= 1 - wet * 0.4;
    o[0] = cr;
    o[1] = cg;
    o[2] = cb;
    hf[i] = h * (1 - wet * 0.5);
    rg[i] = clamp(0.7 - wet * 0.55 + fine[i] * 0.05, 0.08, 0.95);
  });
  const rgh = paintRGB(S, S, (x, y, i, o) => {
    o[0] = o[1] = o[2] = rg[i];
  });
  return { map: toTex(cv), normalMap: normalMap(hf, S, S, 2.6), roughnessMap: toTex(rgh, { srgb: false }) };
});

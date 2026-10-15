// Nível 3 — texturas: tijolos de cores inconsistentes (do creme ao marrom
// queimado) com rejunte sujo, e painéis técnicos claros do salão dos robôs.
import { registerTexture, TEX } from '../textures.js';
import { clamp, mulberry32 } from '../util.js';

const { toTex, noiseField, whiteNoise, paintRGB, normalMap } = TEX;

registerTexture('l3Brick', (S) => {
  const low = noiseField(S, S, 4, 4, 4, 3301);
  const fine = whiteNoise(S * S, 3302);
  const rows = 12;
  const cols = 4;
  const bh = S / rows;
  const bw = S / cols;
  const r = mulberry32(3303);
  const tones = Array.from({ length: rows * cols * 2 }, () => {
    const t = r();
    // tijolos de três famílias: marrom, creme sujo e quase preto
    if (t < 0.55) return [0.42 + r() * 0.1, 0.24 + r() * 0.06, 0.14 + r() * 0.04];
    if (t < 0.85) return [0.58 + r() * 0.08, 0.48 + r() * 0.06, 0.34 + r() * 0.05];
    return [0.16 + r() * 0.05, 0.12 + r() * 0.03, 0.09 + r() * 0.03];
  });
  const hf = new Float32Array(S * S);
  const rg = new Float32Array(S * S);
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const row = Math.floor(y / bh);
    const off = row % 2 ? bw / 2 : 0;
    const xx = (x + off) % S;
    const col = Math.floor(xx / bw);
    const lx = xx - col * bw;
    const ly = y - row * bh;
    const d = Math.min(lx, bw - 1 - lx, ly, bh - 1 - ly);
    const t = tones[row * cols + col];
    const g = Math.max(1, S / 160);
    let k = 0.82 + low[i] * 0.3 + fine[i] * 0.05;
    let c = t;
    let h = 0.6 + fine[i] * 0.04;
    if (d < g) {
      c = [0.3, 0.28, 0.25];
      h = 0;
      k = 0.8 + low[i] * 0.2;
    } else if (d < g * 2) h = 0.4;
    // fuligem descendo das juntas
    k *= 1 - clamp((low[i] - 0.25) * 1.2, 0, 0.35);
    o[0] = c[0] * k;
    o[1] = c[1] * k;
    o[2] = c[2] * k;
    hf[i] = h;
    rg[i] = d < g ? 0.95 : clamp(0.55 + low[i] * 0.3, 0.3, 0.9);
  });
  const rgh = paintRGB(S, S, (x, y, i, o) => {
    o[0] = o[1] = o[2] = rg[i];
  });
  return { map: toTex(cv), normalMap: normalMap(hf, S, S, 3.2), roughnessMap: toTex(rgh, { srgb: false }) };
});

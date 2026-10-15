// Nível 37 — texturas: azulejos brancos de piscina (impecáveis, todos iguais),
// azulejos azuis e reboco cinza da área dos mercenários.
import { registerTexture, TEX } from '../textures.js';
import { clamp } from '../util.js';

const { toTex, noiseField, whiteNoise, paintRGB, normalMap } = TEX;

// n azulejos por repetição, rejunte fino, brilho leve no centro de cada peça.
function tiles(S, n, base, grout, seed) {
  const low = noiseField(S, S, 2, 2, 3, seed);
  const fine = whiteNoise(S * S, seed + 1);
  const q = S / n;
  const hf = new Float32Array(S * S);
  const rg = new Float32Array(S * S);
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const lx = x % q;
    const ly = y % q;
    const d = Math.min(lx, q - 1 - lx, ly, q - 1 - ly);
    const gw = Math.max(1, q * 0.07);
    let k = 1 + low[i] * 0.02 + fine[i] * 0.006;
    let c = base;
    let h = 0.6;
    if (d < gw) {
      c = grout;
      h = 0;
      k = 1;
    } else if (d < gw * 2.2) {
      h = 0.6 * ((d - gw) / (gw * 1.2));
      k *= 0.97;
    }
    o[0] = c[0] * k;
    o[1] = c[1] * k;
    o[2] = c[2] * k;
    hf[i] = h;
    rg[i] = d < gw ? 0.85 : clamp(0.12 + low[i] * 0.06, 0.06, 0.25);
  });
  const rgh = paintRGB(S, S, (x, y, i, o) => {
    o[0] = o[1] = o[2] = rg[i];
  });
  return { map: toTex(cv), normalMap: normalMap(hf, S, S, 2.2), roughnessMap: toTex(rgh, { srgb: false }) };
}

registerTexture('l37Tile', (S) => tiles(S, 8, [0.93, 0.94, 0.92], [0.7, 0.72, 0.7], 3701));
registerTexture('l37Blue', (S) => tiles(S, 8, [0.18, 0.42, 0.66], [0.75, 0.78, 0.8], 3711));

// Reboco cinza, liso e manchado.
registerTexture('l37Grey', (S) => {
  const low = noiseField(S, S, 4, 4, 5, 3721);
  const fine = whiteNoise(S * S, 3722);
  const hf = new Float32Array(S * S);
  const cv = paintRGB(S, S, (x, y, i, o) => {
    const k = 0.5 + low[i] * 0.12 + fine[i] * 0.02;
    o[0] = k * 0.97;
    o[1] = k * 0.98;
    o[2] = k;
    hf[i] = low[i] + fine[i] * 0.1;
  });
  return { map: toTex(cv), normalMap: normalMap(hf, S, S, 1.5) };
});

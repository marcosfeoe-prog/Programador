// Desenha o mapa (relevo sombreado, água, florestas, neve, trilhas) num canvas,
// usado pelo minimapa e pela tela de mapa.
import { RES, WATER, HALF } from '../world/heightfield.js';

export function makeMapCanvas(hf, size = 512) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  const step = (RES - 1) / size;
  const n = [0, 0, 0];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const i = Math.min(RES - 1, Math.round(x * step));
      const j = Math.min(RES - 1, Math.round(y * step));
      const id = j * RES + i;
      const h = hf.h[id];
      hf.normalAtIndex(i, j, n);
      const shade = Math.max(0.35, Math.min(1.25, 0.75 + (-n[0] * 0.55 - n[2] * 0.55) + n[1] * 0.2));
      let r;
      let g;
      let b;
      if (h < WATER) {
        const k = Math.min(1, -h / 8);
        r = 70 - k * 30;
        g = 120 - k * 40;
        b = 150 - k * 30;
      } else {
        const f = hf.forest[id] / 255;
        const p = hf.path[id] / 255;
        r = 150 - f * 80;
        g = 165 - f * 60;
        b = 100 - f * 45;
        const rock = Math.min(1, Math.max(0, (h - 230) / 100));
        r = r * (1 - rock) + 140 * rock;
        g = g * (1 - rock) + 132 * rock;
        b = b * (1 - rock) + 120 * rock;
        if (h > 370) {
          r = 232;
          g = 236;
          b = 240;
        }
        if (h < WATER + 1.2) {
          r = 196;
          g = 182;
          b = 140;
        }
        r = r * (1 - p) + 170 * p;
        g = g * (1 - p) + 130 * p;
        b = b * (1 - p) + 80 * p;
        r *= shade;
        g *= shade;
        b *= shade;
      }
      const k = (y * size + x) * 4;
      d[k] = r;
      d[k + 1] = g;
      d[k + 2] = b;
      d[k + 3] = 255;
    }
  ctx.putImageData(img, 0, 0);
  // curvas de nível sutis
  ctx.globalAlpha = 0.12;
  ctx.fillStyle = '#000';
  for (let y = 1; y < size; y++)
    for (let x = 1; x < size; x++) {
      const i = Math.min(RES - 1, Math.round(x * step));
      const j = Math.min(RES - 1, Math.round(y * step));
      const h = hf.h[j * RES + i];
      const hl = hf.h[j * RES + Math.max(0, i - Math.round(step))];
      const hu = hf.h[Math.max(0, j - Math.round(step)) * RES + i];
      if (h > WATER && (Math.floor(h / 40) !== Math.floor(hl / 40) || Math.floor(h / 40) !== Math.floor(hu / 40))) ctx.fillRect(x, y, 1, 1);
    }
  ctx.globalAlpha = 1;
  return c;
}

// mundo -> pixel do mapa
export function worldToMap(x, z, size) {
  return [((x + HALF) / (HALF * 2)) * size, ((z + HALF) / (HALF * 2)) * size];
}

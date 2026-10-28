// Nível 257 — o traçado: um único corredor de 1000 m que segue para -z.
// Tudo é função da distância percorrida s (= -z): centro, meia largura, altura,
// janelas, trechos apertados, a estação de metrô e a sala final.
import { clamp, lerp, smoothstep } from '../util.js';

export const LEN = 1000;
export const SUB0 = 756; // poço dos trilhos
export const SUB1 = 894;
export const EDGE = -1.6; // borda da plataforma (deslocamento a partir do centro)
export const PIT = -1.3; // fundo do poço
export const ROOM0 = 952; // sala final
export const FLASH_AT = 950;

const TIGHT = [
  [118, 160],
  [300, 334],
  [428, 462],
  [600, 630],
  [700, 722],
];

const band = (s, a, b, e = 3) => smoothstep(a - e, a + e, s) * (1 - smoothstep(b - e, b + e, s));

export function tight(s) {
  let t = 0;
  for (const [a, b] of TIGHT) t = Math.max(t, band(s, a, b));
  return t;
}

export function curvy(s) {
  return smoothstep(900, 912, s) * (1 - smoothstep(940, 950, s));
}

export function cx(s) {
  return 7 * Math.sin(s * 0.0085) + 3 * Math.sin(s * 0.021 + 1) + 3.2 * curvy(s) * Math.sin((s - 900) * 0.26);
}

export function hw(s) {
  let h = 4.6;
  h = lerp(h, 7.5, band(s, 750, 900, 4));
  h = lerp(h, 0.95, band(s, 900, 950, 4));
  return lerp(h, 1.15, tight(s));
}

export function height(s) {
  let H = 4.2 + 11.8 * smoothstep(500, 740, s);
  H = lerp(H, lerp(H, 3.0, tight(s)), s < 500 ? 1 : 0);
  H = lerp(H, 6.0, band(s, 750, 900, 4));
  H = lerp(H, 3.0, band(s, 900, 950, 4));
  H = lerp(H, 7.5, smoothstep(948, 954, s));
  return H;
}

export function inPit(s, off) {
  return s > SUB0 && s < SUB1 && off < EDGE;
}

// Limites de caminhada (deslocamento a partir do centro).
export function walkLimits(s) {
  const h = hw(s);
  const lo = s > SUB0 - 0.3 && s < SUB1 + 0.3 ? EDGE + 0.3 : -h + 0.35;
  return [lo, h - 0.35];
}

// Janela no lado esquerdo do segmento [s, s+1]? Devolve {sill, top} ou null.
export function windowAt(s) {
  const k = Math.floor(s);
  if (k >= ROOM0 + 3 && k < LEN - 3) return { sill: 0.35, top: 6.6 };
  if (k > SUB0 + 4 && k < SUB1 - 4) return k % 12 < 8 ? { sill: 3.6, top: 5.3 } : null;
  if (k > 900 && k < 950) return k % 9 === 4 ? { sill: 1.2, top: 2.1 } : null;
  if (k < 6 || k > 744) return null;
  if (tight(k) > 0.01 || tight(k + 1) > 0.01) return null;
  const m = k % 10;
  if (m < 1 || m > 7) return null;
  const H = Math.min(height(k), height(k + 1));
  return { sill: 0.7, top: clamp(3.4 + (H - 4.2) * 0.6, 3.4, H - 0.9) };
}

// Cores das paredes e do teto ao longo do caminho.
const WALL = [
  [0, [1.0, 0.9, 0.78]],
  [150, [1.0, 0.84, 0.74]],
  [300, [0.98, 0.8, 0.82]],
  [450, [0.84, 0.9, 0.82]],
  [600, [0.76, 0.86, 0.9]],
  [750, [0.95, 0.92, 0.84]],
  [900, [0.86, 0.8, 0.95]],
  [1000, [1.0, 0.86, 0.72]],
];
const CEIL = [
  [0, [0.98, 0.92, 0.84]],
  [200, [0.98, 0.86, 0.86]],
  [400, [0.88, 0.94, 0.9]],
  [600, [0.82, 0.86, 0.96]],
  [750, [0.9, 0.9, 0.86]],
  [900, [0.9, 0.82, 0.96]],
  [1000, [1.0, 0.9, 0.8]],
];
function pal(P, s) {
  for (let i = 0; i < P.length - 1; i++) {
    const [a, ca] = P[i];
    const [b, cb] = P[i + 1];
    if (s <= b) {
      const k = smoothstep(a, b, s);
      return [lerp(ca[0], cb[0], k), lerp(ca[1], cb[1], k), lerp(ca[2], cb[2], k)];
    }
  }
  return P[P.length - 1][1];
}
export const wallColor = (s) => pal(WALL, s);
export const ceilColor = (s) => pal(CEIL, s);

// Qual acabamento de parede (muda por trecho).
export function wallKind(s) {
  if (s > SUB0 - 6 && s < SUB1 + 6) return 'tile';
  if (s < 250) return 'concrete';
  if (s < 500) return 'panel';
  if (s < 750) return 'concrete';
  return 'panel';
}

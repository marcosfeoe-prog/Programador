// Configurações globais: mundo, relógio, qualidade gráfica e escala Fujita Melhorada (EF).

export const WORLD = {
  half: 12000, // o mapa de cada país vai de -12 km a +12 km (24 × 24 km)
  size: 24000,
  skirt: 70000, // terreno de fundo até o horizonte
};

// O relógio do dia corre 10× mais rápido que o tempo real (1 s real = 10 s de jogo).
// Física, deslocamento das tempestades e duração dos tornados correm em tempo real.
export const CLOCK_SCALE = 10;

export const QUALITY = {
  low: {
    label: 'Baixa',
    pixelRatio: 0.65,
    cloudScale: 0.22,
    volScale: 0.38,
    cloudSteps: 26,
    volSteps: 52,
    lightSteps: 2,
    shadows: false,
    shadowSize: 1024,
    terrainSegs: 192,
    landuse: 1024,
    trees: 0.35,
    grass: 0,
    debris: 350,
    rain: 1400,
    msaa: 0,
    fxaa: true,
    texSize: 256,
  },
  medium: {
    label: 'Média',
    pixelRatio: 0.85,
    cloudScale: 0.3,
    volScale: 0.5,
    cloudSteps: 36,
    volSteps: 76,
    lightSteps: 3,
    shadows: true,
    shadowSize: 1024,
    terrainSegs: 256,
    landuse: 2048,
    trees: 0.6,
    grass: 0.5,
    debris: 700,
    rain: 2600,
    msaa: 0,
    fxaa: true,
    texSize: 512,
  },
  high: {
    label: 'Alta',
    pixelRatio: 1,
    cloudScale: 0.42,
    volScale: 0.7,
    cloudSteps: 48,
    volSteps: 104,
    lightSteps: 3,
    shadows: true,
    shadowSize: 2048,
    terrainSegs: 384,
    landuse: 2048,
    trees: 1,
    grass: 1,
    debris: 1200,
    rain: 4200,
    msaa: 4,
    fxaa: false,
    texSize: 512,
  },
  ultra: {
    label: 'Ultra',
    pixelRatio: 1.5,
    cloudScale: 0.55,
    volScale: 1,
    cloudSteps: 64,
    volSteps: 140,
    lightSteps: 4,
    shadows: true,
    shadowSize: 4096,
    terrainSegs: 512,
    landuse: 4096,
    trees: 1.3,
    grass: 1.5,
    debris: 2000,
    rain: 6000,
    msaa: 4,
    fxaa: false,
    texSize: 1024,
  },
};

export function detectMobile() {
  const ua = navigator.userAgent || '';
  return /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Mac/.test(ua));
}

export function defaultQuality() {
  const q = new URLSearchParams(location.search).get('quality');
  if (q && QUALITY[q]) return q;
  return detectMobile() ? 'low' : 'medium';
}

// Escala EF (rajada de 3 s). Limites em m/s.
export const EF = [
  { ef: 0, min: 29, max: 38, kmh: '105–137' },
  { ef: 1, min: 38, max: 50, kmh: '138–177' },
  { ef: 2, min: 50, max: 61, kmh: '178–217' },
  { ef: 3, min: 61, max: 74, kmh: '218–266' },
  { ef: 4, min: 74, max: 90, kmh: '267–322' },
  { ef: 5, min: 90, max: 135, kmh: '> 322' },
];

export function efFromWind(v) {
  if (v < 29) return -1;
  for (let i = EF.length - 1; i >= 0; i--) if (v >= EF[i].min) return i;
  return 0;
}

export const EF_COLORS = ['#4fc3f7', '#81c784', '#ffd54f', '#ffa040', '#ff5252', '#d05ce3'];

export const MS_TO_KMH = 3.6;

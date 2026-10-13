// Configurações globais, presets de qualidade e escala Fujita.

export const WORLD = {
  size: 8000, // extensão do terreno principal (m)
  half: 4000,
  playHalf: 3700, // limite jogável
  cloudBase: 650, // base das nuvens (m)
  seed: 20240521,
};

// Ciclo de dia e noite: 10 minutos de dia + 10 minutos de noite.
export const DAY_SECONDS = 600;
export const NIGHT_SECONDS = 600;

export const QUALITY_PRESETS = {
  low: {
    label: 'Baixa',
    pixelRatio: 0.75,
    shadows: false,
    shadowMapSize: 1024,
    volScale: 0.25,
    volSteps: 34,
    lightSteps: 2,
    trees: 9000,
    grass: 0,
    terrainSegs: 256,
    debrisMax: 160,
    specks: 1200,
    rain: 2500,
    fxaa: false,
    texSize: 256,
  },
  medium: {
    label: 'Média',
    pixelRatio: 1,
    shadows: true,
    shadowMapSize: 1024,
    volScale: 0.34,
    volSteps: 52,
    lightSteps: 3,
    trees: 20000,
    grass: 24000,
    terrainSegs: 384,
    debrisMax: 300,
    specks: 2500,
    rain: 5000,
    fxaa: true,
    texSize: 512,
  },
  high: {
    label: 'Alta',
    pixelRatio: 1,
    shadows: true,
    shadowMapSize: 2048,
    volScale: 0.5,
    volSteps: 72,
    lightSteps: 4,
    trees: 34000,
    grass: 55000,
    terrainSegs: 512,
    debrisMax: 500,
    specks: 4500,
    rain: 9000,
    fxaa: true,
    texSize: 512,
  },
  ultra: {
    label: 'Ultra',
    pixelRatio: 1.5,
    shadows: true,
    shadowMapSize: 4096,
    volScale: 0.6,
    volSteps: 96,
    lightSteps: 5,
    trees: 52000,
    grass: 90000,
    terrainSegs: 640,
    debrisMax: 800,
    specks: 7000,
    rain: 14000,
    fxaa: true,
    texSize: 1024,
  },
};

export function isMobileDevice() {
  const touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const small = Math.min(window.innerWidth, window.innerHeight) < 820;
  const ua = /Android|iPhone|iPad|iPod|Mobile|Silk|Kindle/i.test(navigator.userAgent);
  return (touch && small) || ua;
}

export function loadSettings() {
  let s = {};
  try {
    s = JSON.parse(localStorage.getItem('supercelula.settings') || '{}');
  } catch (e) {
    s = {};
  }
  const mobile = isMobileDevice();
  const params = new URLSearchParams(location.search);
  const q = params.get('quality') || s.quality || (mobile ? 'low' : 'high');
  return {
    quality: QUALITY_PRESETS[q] ? q : 'medium',
    sensitivity: s.sensitivity ?? 1,
    invertY: s.invertY ?? false,
    volume: s.volume ?? 0.8,
    risk: s.risk ?? 'alto',
    showFps: s.showFps ?? false,
    mobile,
  };
}

export function saveSettings(s) {
  try {
    const { mobile, ...rest } = s;
    localStorage.setItem('supercelula.settings', JSON.stringify(rest));
  } catch (e) {
    /* armazenamento indisponível */
  }
}

// Escala Fujita original (velocidades em m/s).
export const FUJITA = [
  { f: 0, min: 18, max: 32, name: 'F0', desc: 'Danos leves' },
  { f: 1, min: 33, max: 49, name: 'F1', desc: 'Danos moderados' },
  { f: 2, min: 50, max: 69, name: 'F2', desc: 'Danos consideráveis' },
  { f: 3, min: 70, max: 92, name: 'F3', desc: 'Danos severos' },
  { f: 4, min: 93, max: 116, name: 'F4', desc: 'Danos devastadores' },
  { f: 5, min: 117, max: 142, name: 'F5', desc: 'Danos incríveis' },
];

export function fujitaFromWind(v) {
  if (v < 33) return 0;
  if (v < 50) return 1;
  if (v < 70) return 2;
  if (v < 93) return 3;
  if (v < 117) return 4;
  return 5;
}

export const FUJITA_COLORS = ['#7fd4ff', '#7dff8a', '#ffe14d', '#ff9b38', '#ff3b3b', '#d94dff'];

// Níveis de risco do ambiente atmosférico.
export const RISK_LEVELS = {
  baixo: { label: 'Baixo', stp: [0.3, 1.2], interval: [150, 260] },
  moderado: { label: 'Moderado', stp: [0.8, 2.5], interval: [90, 180] },
  alto: { label: 'Alto', stp: [1.8, 5.0], interval: [45, 110] },
  extremo: { label: 'Extremo', stp: [4.0, 9.0], interval: [25, 60] },
};

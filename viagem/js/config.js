// Qualidade gráfica e configurações salvas.

export const QUALITY = {
  low: {
    label: 'Baixa',
    pixelRatio: 0.75,
    shadows: 0,
    shadowRange: 40,
    farRes: 64,
    chunkRing: 2,
    lod0Ring: 0,
    lod0Res: 4,
    lod1Res: 8,
    treeNear: 90,
    treeMid: 320,
    treeFar: 1300,
    midKeep: 0.4,
    farKeep: 0.12,
    treeCap0: 500,
    treeCap1: 1800,
    treeCap2: 2500,
    grassGrid: 0,
    roadDist: 1100,
    cityDist: 2200,
    fogBase: 0.00022,
    far: 16000,
    workers: 1,
    mirror: false,
    antialias: false,
  },
  medium: {
    label: 'Média',
    pixelRatio: 1,
    shadows: 1024,
    shadowRange: 55,
    farRes: 48,
    chunkRing: 3,
    lod0Ring: 1,
    lod0Res: 4,
    lod1Res: 8,
    treeNear: 140,
    treeMid: 480,
    treeFar: 1900,
    midKeep: 0.5,
    farKeep: 0.18,
    treeCap0: 900,
    treeCap1: 3500,
    treeCap2: 5000,
    grassGrid: 40,
    roadDist: 1500,
    cityDist: 3000,
    fogBase: 0.00016,
    far: 22000,
    workers: 2,
    mirror: true,
    antialias: true,
  },
  high: {
    label: 'Alta',
    pixelRatio: 1.25,
    shadows: 2048,
    shadowRange: 70,
    farRes: 40,
    chunkRing: 3,
    lod0Ring: 1,
    lod0Res: 2,
    lod1Res: 4,
    treeNear: 180,
    treeMid: 620,
    treeFar: 2500,
    midKeep: 0.6,
    farKeep: 0.22,
    treeCap0: 1400,
    treeCap1: 5000,
    treeCap2: 8000,
    grassGrid: 56,
    roadDist: 1900,
    cityDist: 3800,
    fogBase: 0.00012,
    far: 28000,
    workers: 2,
    mirror: true,
    antialias: true,
  },
  ultra: {
    label: 'Ultra',
    pixelRatio: 1.6,
    shadows: 4096,
    shadowRange: 90,
    farRes: 32,
    chunkRing: 4,
    lod0Ring: 1,
    lod0Res: 2,
    lod1Res: 4,
    treeNear: 240,
    treeMid: 800,
    treeFar: 3200,
    midKeep: 0.75,
    farKeep: 0.3,
    treeCap0: 2200,
    treeCap1: 7500,
    treeCap2: 12000,
    grassGrid: 72,
    roadDist: 2400,
    cityDist: 4500,
    fogBase: 0.0001,
    far: 32000,
    workers: 3,
    mirror: true,
    antialias: true,
  },
};

const KEY = 'rotaSerena.settings.v1';
export const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.innerWidth < 1100);

export const DEFAULTS = {
  quality: isMobile ? 'low' : 'high',
  units: 'kmh',
  dayMinutes: 24,
  weather: 'auto',
  assist: true,
  manual: false,
  volMaster: 0.8,
  volEngine: 0.8,
  volMusic: 0.55,
  volAmbient: 0.7,
  sensitivity: 1,
  invertY: false,
  showFps: false,
  camera: 0,
  mobile: isMobile,
  tilt: false,
};

export function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    const out = { ...DEFAULTS, ...s, mobile: isMobile };
    if (!QUALITY[out.quality]) out.quality = DEFAULTS.quality;
    return out;
  } catch (e) {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s) {
  try {
    const { mobile, ...rest } = s;
    void mobile;
    localStorage.setItem(KEY, JSON.stringify(rest));
  } catch (e) {
    /* ignorado */
  }
}

// progresso da viagem
const PKEY = 'rotaSerena.save.v1';
export function loadProgress() {
  try {
    return JSON.parse(localStorage.getItem(PKEY) || 'null');
  } catch (e) {
    return null;
  }
}
export function saveProgress(p) {
  try {
    localStorage.setItem(PKEY, JSON.stringify(p));
    return true;
  } catch (e) {
    // fotos ocupam espaço: tenta sem elas
    try {
      const q = { ...p, photos: {} };
      localStorage.setItem(PKEY, JSON.stringify(q));
    } catch (e2) {
      /* ignorado */
    }
    return false;
  }
}

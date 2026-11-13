// Configurações: dificuldade, qualidade gráfica, preferências e salvamento.
export const SAVE_VERSION = 1;

export const DIFFICULTY = {
  facil: { label: 'Fácil', desc: 'Inimigos mais fracos e mais munição pelo caminho.', dmg: 0.6, hp: 0.8, drop: 1.35, speed: 0.94 },
  normal: { label: 'Normal', desc: 'A experiência pensada para o jogo.', dmg: 1, hp: 1, drop: 1, speed: 1 },
  dificil: { label: 'Difícil', desc: 'Inimigos resistentes e rápidos. Munição escassa.', dmg: 1.45, hp: 1.3, drop: 0.7, speed: 1.12 },
};

export const QUALITY = {
  baixa: { label: 'Baixa', desc: 'Celulares simples. Sem sombras.', pixelRatio: 0.8, shadows: false, shadowSize: 1024, lights: 3, grass: 0.3, particles: 0.5 },
  media: { label: 'Média', desc: 'Celulares bons e notebooks.', pixelRatio: 1, shadows: true, shadowSize: 1024, lights: 4, grass: 0.65, particles: 0.8 },
  alta: { label: 'Alta', desc: 'PC com placa de vídeo.', pixelRatio: 1.5, shadows: true, shadowSize: 2048, lights: 6, grass: 1, particles: 1 },
};

function detectTouch() {
  try {
    if (matchMedia('(pointer: coarse)').matches) return true;
    return navigator.maxTouchPoints > 0 && !matchMedia('(pointer: fine)').matches;
  } catch (e) {
    return false;
  }
}
export const IS_TOUCH = detectTouch();

const DEFAULTS = {
  quality: IS_TOUCH ? 'baixa' : 'media',
  sens: 1,
  touchSens: 1,
  invertY: false,
  volume: 0.8,
  music: 0.7,
  dynRes: true,
  showFps: false,
  compass: true,
  aimAssist: true,
  difficulty: 'normal',
};

const SETTINGS_KEY = 'ferrugem.settings.v1';
const SAVE_KEY = 'ferrugem.save.v1';

export function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') || {};
  } catch (e) {
    saved = {};
  }
  const out = { ...DEFAULTS };
  for (const k in DEFAULTS) if (typeof saved[k] === typeof DEFAULTS[k]) out[k] = saved[k];
  if (!QUALITY[out.quality]) out.quality = DEFAULTS.quality;
  if (!DIFFICULTY[out.difficulty]) out.difficulty = 'normal';
  return out;
}

export function saveSettings(s) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
  } catch (e) {
    /* armazenamento indisponível: segue sem salvar */
  }
}

export function loadSave() {
  try {
    const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
    if (d && d.version === SAVE_VERSION && d.cp && d.cp.player) return d;
  } catch (e) {
    /* ignora salvamento corrompido */
  }
  return null;
}

export function writeSave(data) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, version: SAVE_VERSION }));
  } catch (e) {
    /* sem armazenamento */
  }
}

const PROGRESS_KEY = 'ferrugem.progress.v1';

// Capítulos liberados (para começar direto de um capítulo pelo título).
export function loadProgress() {
  try {
    const d = JSON.parse(localStorage.getItem(PROGRESS_KEY) || 'null');
    if (d && typeof d.unlocked === 'number') return { unlocked: Math.max(1, Math.min(3, d.unlocked)) };
  } catch (e) {
    /* sem armazenamento */
  }
  return { unlocked: 1 };
}

export function unlockChapter(n) {
  const p = loadProgress();
  if (n <= p.unlocked) return;
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify({ unlocked: n }));
  } catch (e) {
    /* sem armazenamento */
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {
    /* sem armazenamento */
  }
}

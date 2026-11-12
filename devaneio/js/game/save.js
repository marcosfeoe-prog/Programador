// Configurações e progresso salvos no navegador (localStorage, com proteção para quando
// o armazenamento não estiver disponível).

export const QUALITY = {
  baixa: { label: 'baixa', pixel: 0.8, maxPixel: 1, msaa: 0, shadows: false, shadowSize: 1024, grassSlots: 5, grassDensity: 0.5, bloomLevels: 5, skySteps: 4 },
  media: { label: 'média', pixel: 1, maxPixel: 1.3, msaa: 0, shadows: true, shadowSize: 1024, grassSlots: 7, grassDensity: 0.72, bloomLevels: 6, skySteps: 6 },
  alta: { label: 'alta', pixel: 1, maxPixel: 1.75, msaa: 4, shadows: true, shadowSize: 2048, grassSlots: 9, grassDensity: 1, bloomLevels: 6, skySteps: 8 },
};

const KEY_SET = 'devaneio.config.v1';
const KEY_SAVE = 'devaneio.progresso.v1';

function read(key) {
  try {
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : null;
  } catch (e) {
    return null;
  }
}
function write(key, v) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch (e) {}
}

export function defaultQuality() {
  const touch = matchMedia('(pointer: coarse)').matches;
  const small = Math.min(screen.width, screen.height) < 700;
  if (touch || small) return 'baixa';
  const mem = navigator.deviceMemory || 8;
  const cores = navigator.hardwareConcurrency || 8;
  return mem <= 4 || cores <= 4 ? 'media' : 'alta';
}

export function loadSettings() {
  const d = {
    quality: defaultQuality(),
    sens: 1,
    invertY: false,
    fov: 70,
    master: 0.85,
    music: 0.7,
    sfx: 0.85,
    grain: true,
    ca: true,
    vhs: false,
    bob: true,
    fps: false,
  };
  const s = read(KEY_SET);
  return { ...d, ...(s || {}) };
}

export function saveSettings(s) {
  write(KEY_SET, s);
}

export function loadProgress() {
  const d = { level: 0, unlocked: 0, finished: false, memories: {} };
  return { ...d, ...(read(KEY_SAVE) || {}) };
}

export function saveProgress(p) {
  write(KEY_SAVE, p);
}

export function clearProgress() {
  try {
    localStorage.removeItem(KEY_SAVE);
  } catch (e) {}
}

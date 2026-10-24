// Configurações do jogador (salvas no navegador) e detecção de celular.

const KEY = 'cacada.config.v1';

export function isMobile() {
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && window.matchMedia('(pointer: coarse)').matches);
}

export function loadSettings() {
  const mobile = isMobile();
  const def = {
    quality: mobile ? 'low' : 'high',
    sensitivity: 1,
    fov: 75,
    volume: 0.8,
    invertY: false,
    showFps: false,
  };
  let s = def;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) s = { ...def, ...JSON.parse(raw) };
  } catch (e) {
    /* armazenamento indisponível */
  }
  const q = new URLSearchParams(location.search).get('quality');
  if (q && ['low', 'medium', 'high', 'ultra'].includes(q)) s.quality = q;
  s.mobile = mobile;
  return s;
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

const REC = 'cacada.recordes.v1';
export function loadRecords() {
  try {
    return { melhor: 0, abates: 0, ...JSON.parse(localStorage.getItem(REC) || '{}') };
  } catch (e) {
    return { melhor: 0, abates: 0 };
  }
}
export function saveRecords(r) {
  try {
    localStorage.setItem(REC, JSON.stringify(r));
  } catch (e) {
    /* ignorado */
  }
}

export const QUALITY_NAMES = { low: 'Baixa', medium: 'Média', high: 'Alta', ultra: 'Ultra' };

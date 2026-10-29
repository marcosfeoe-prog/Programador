// Qualidade gráfica, configurações e progresso (salvos no localStorage).
import { isTouch } from './util.js';

export const QUALITY = {
  low: { pr: 1.0, scale: 0.8, msaa: 0, shadow: 0, bloom: 4, tpm: 3, samples: 2, aniso: 2, far: 38, hair: 36, pbr: false },
  medium: { pr: 1.5, scale: 1.0, msaa: 4, shadow: 512, bloom: 5, tpm: 4, samples: 4, aniso: 4, far: 48, hair: 56, pbr: true },
  high: { pr: 2.0, scale: 1.0, msaa: 4, shadow: 1024, bloom: 6, tpm: 5, samples: 6, aniso: 8, far: 60, hair: 72, pbr: true },
  ultra: { pr: 2.5, scale: 1.0, msaa: 8, shadow: 2048, bloom: 6, tpm: 6, samples: 9, aniso: 16, far: 72, hair: 96, pbr: true },
};
export const QUALITY_KEYS = ['low', 'medium', 'high', 'ultra'];

const KEY = 'noclip.v1';

const defaults = () => ({
  quality: isTouch() ? 'low' : 'high',
  lang: (navigator.language || 'en').toLowerCase().startsWith('pt') ? 'pt' : 'en',
  sens: 1.0,
  invertY: false,
  fov: 75,
  volume: 0.8,
  bob: true,
  fps: false,
  dynres: isTouch(),
});

export const settings = defaults();
export const progress = { unlocked: 0, deaths: 0, best: {} };

export function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    Object.assign(settings, raw.settings || {});
    Object.assign(progress, raw.progress || {});
  } catch (e) {
    /* armazenamento indisponível: segue com os padrões */
  }
  const q = new URLSearchParams(location.search).get('q');
  if (q && QUALITY[q]) settings.quality = q;
  if (!QUALITY[settings.quality]) settings.quality = 'medium';
}

export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify({ settings, progress }));
  } catch (e) {
    /* ignora */
  }
}

export const Q = () => QUALITY[settings.quality];

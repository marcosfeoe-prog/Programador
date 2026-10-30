// Progresso salvo no navegador (moedas, garagem, níveis e configurações).
import { CARS, PAINTS, RIMS, NEONS, TOTAL_LEVELS } from './config.js';
import { isMobileDevice } from './util.js';

const KEY = 'turbo-looping-save-v1';

function defaults() {
  const cars = {};
  for (const c of CARS) cars[c.id] = { owned: c.price === 0, upgrade: 0, paint: c.paint, rim: 'cinco', neon: 'nenhum' };
  return {
    coins: 300,
    car: 'faisca',
    cars,
    paints: PAINTS.filter((p) => p.price === 0).map((p) => p.id),
    rims: ['cinco'],
    neons: ['nenhum'],
    unlocked: 1, // quantos níveis estão liberados
    best: {}, // idx -> melhor colocação
    next: 0, // próximo nível sugerido
    settings: {
      quality: isMobileDevice() ? 'low' : 'high',
      sound: 0.8,
      music: 0.5,
      sensitivity: 1,
      vibrate: true,
    },
  };
}

export class Save {
  constructor() {
    this.data = defaults();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) this.merge(JSON.parse(raw));
    } catch (e) {
      // armazenamento indisponível ou corrompido: começa do zero
    }
  }

  merge(src) {
    const d = this.data;
    if (!src || typeof src !== 'object') return;
    if (Number.isFinite(src.coins)) d.coins = Math.max(0, Math.floor(src.coins));
    if (src.cars && typeof src.cars === 'object') {
      for (const c of CARS) {
        const s = src.cars[c.id];
        if (!s) continue;
        const t = d.cars[c.id];
        t.owned = t.owned || !!s.owned;
        if (Number.isFinite(s.upgrade)) t.upgrade = Math.max(0, Math.min(5, s.upgrade | 0));
        if (PAINTS.some((p) => p.id === s.paint)) t.paint = s.paint;
        if (RIMS.some((p) => p.id === s.rim)) t.rim = s.rim;
        if (NEONS.some((p) => p.id === s.neon)) t.neon = s.neon;
      }
    }
    if (CARS.some((c) => c.id === src.car) && d.cars[src.car].owned) d.car = src.car;
    for (const k of ['paints', 'rims', 'neons']) {
      if (Array.isArray(src[k])) for (const id of src[k]) if (typeof id === 'string' && !d[k].includes(id)) d[k].push(id);
    }
    if (Number.isFinite(src.unlocked)) d.unlocked = Math.max(1, Math.min(TOTAL_LEVELS, src.unlocked | 0));
    if (Number.isFinite(src.next)) d.next = Math.max(0, Math.min(d.unlocked - 1, src.next | 0));
    if (src.best && typeof src.best === 'object') {
      for (const k in src.best) if (Number.isFinite(src.best[k])) d.best[k] = src.best[k] | 0;
    }
    if (src.settings && typeof src.settings === 'object') {
      const s = src.settings;
      if (['low', 'medium', 'high'].includes(s.quality)) d.settings.quality = s.quality;
      for (const k of ['sound', 'music', 'sensitivity']) if (Number.isFinite(s[k])) d.settings[k] = s[k];
      if (typeof s.vibrate === 'boolean') d.settings.vibrate = s.vibrate;
    }
  }

  write() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch (e) {
      // sem armazenamento: o progresso vale só nesta sessão
    }
  }

  get car() {
    return this.data.cars[this.data.car];
  }

  spend(n) {
    if (this.data.coins < n) return false;
    this.data.coins -= n;
    this.write();
    return true;
  }

  earn(n) {
    this.data.coins += Math.max(0, Math.round(n));
    this.write();
  }
}

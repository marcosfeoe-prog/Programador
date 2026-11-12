// Salvamento local (localStorage), com proteção contra dados inválidos.

import { newCalendar } from '../weather/climate.js';
import { defaultQuality } from '../config.js';

const KEY = 'cacadores-tornados-v1';

export function defaultSave() {
  return {
    v: 1,
    money: 3500,
    day: 1,
    country: null,
    vehicle: 'sedan',
    owned: ['sedan'],
    upgrades: { hailGuard: false, tires: false, camera: false },
    probes: 0,
    repairKits: 0,
    calendar: newCalendar(Math.floor(Math.random() * 1e9)),
    stats: { tornadoes: 0, intercepts: 0, photos: 0, earned: 0, byCountry: {}, maxEF: -1, wrecks: 0, km: 0 },
    journal: [],
    settings: { quality: defaultQuality(), dynamic: true, volume: 0.8, sens: 1, fps: false, touch: 'auto' },
  };
}

export function loadSave() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.v !== 1 || typeof s.money !== 'number' || !s.calendar || !s.calendar.next) return null;
    const d = defaultSave();
    s.settings = { ...d.settings, ...(s.settings || {}) };
    s.stats = { ...d.stats, ...(s.stats || {}) };
    s.upgrades = { ...d.upgrades, ...(s.upgrades || {}) };
    if (!Array.isArray(s.owned) || !s.owned.length) s.owned = ['sedan'];
    if (!s.owned.includes(s.vehicle)) s.vehicle = s.owned[0];
    if (!Array.isArray(s.journal)) s.journal = [];
    return s;
  } catch (e) {
    return null;
  }
}

export function writeSave(s) {
  try {
    // Fotos ocupam espaço: guarda só as 24 mais recentes com miniatura.
    const copy = { ...s, journal: s.journal.slice(-60).map((j, i, a) => (i < a.length - 24 ? { ...j, img: null } : j)) };
    localStorage.setItem(KEY, JSON.stringify(copy));
    return true;
  } catch (e) {
    try {
      const copy = { ...s, journal: s.journal.slice(-40).map((j) => ({ ...j, img: null })) };
      localStorage.setItem(KEY, JSON.stringify(copy));
      return true;
    } catch (e2) {
      return false;
    }
  }
}

export function loadSettingsOnly() {
  const s = loadSave();
  return s ? s.settings : defaultSave().settings;
}

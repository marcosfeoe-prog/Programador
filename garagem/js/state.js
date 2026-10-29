// Estado do jogador, economia e persistência (localStorage).
import { CARS, CAR_BY_ID, POOL, RARITIES, RARITY_KEYS, BOXES } from './data.js';

const KEY = 'garagem-lendaria-v1';

export const S = load();

function fresh() {
  return {
    v: 1,
    name: 'Piloto',
    coins: 6000,
    gems: 60,
    xp: 0,
    level: 1,
    cars: { 'fiato-ponto-1998': 1 },
    boxes: { basica: 2 },
    featured: 'fiato-ponto-1998',
    upg: { tap: 0, passive: 0, boost: 0, offline: 0 },
    stats: { taps: 0, opened: 0, sold: 0, games: 0, wins: 0, auctions: 0, earned: 0, best: null },
    day: { key: '', taps: 0, opened: 0, games: 0, sold: 0, bids: 0, claimed: {}, drops: {} },
    reward: { last: '', streak: 0 },
    market: { block: -1, bought: {} },
    limited: {},
    sets: {},
    ach: {},
    boostUntil: 0,
    boostReadyAt: 0,
    lastSeen: Date.now(),
    lot: 1,
    sound: true,
    vibrate: true,
  };
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const base = fresh();
      const s = JSON.parse(raw);
      return { ...base, ...s, upg: { ...base.upg, ...s.upg }, stats: { ...base.stats, ...s.stats }, day: { ...base.day, ...s.day } };
    }
  } catch (e) {
    /* armazenamento indisponível: começa do zero */
  }
  return fresh();
}

let saveTimer = 0;
let blocked = false; // ligado ao apagar o progresso, para nada regravar o estado antigo
export function save(now = false) {
  if (blocked) return;
  S.lastSeen = Date.now();
  clearTimeout(saveTimer);
  const write = () => {
    if (blocked) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(S));
    } catch (e) {
      /* ignora */
    }
  };
  if (now) write();
  else saveTimer = setTimeout(write, 400);
}

export function resetGame() {
  blocked = true;
  clearTimeout(saveTimer);
  try {
    localStorage.removeItem(KEY);
  } catch (e) {
    /* ignora */
  }
  location.reload();
}

// ---------------- formatação ----------------
export function short(n) {
  const a = Math.abs(n);
  const f = (v, s) => (v >= 100 ? Math.round(v) : v >= 10 ? Math.round(v * 10) / 10 : Math.round(v * 100) / 100) + s;
  if (a >= 1e12) return f(n / 1e12, 'T');
  if (a >= 1e9) return f(n / 1e9, 'B');
  if (a >= 1e6) return f(n / 1e6, 'M');
  if (a >= 1e3) return f(n / 1e3, 'K');
  return Math.round(n).toLocaleString('pt-BR');
}
export const full = (n) => Math.round(n).toLocaleString('pt-BR');

// ---------------- aleatoriedade determinística ----------------
export function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export function rng(seed) {
  let a = typeof seed === 'string' ? hash(seed) : seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)];
export function todayKey(t = Date.now()) {
  const d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function msToMidnight() {
  const d = new Date();
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return m - d;
}
export function clock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return (h ? String(h).padStart(2, '0') + ':' : '') + String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
}

// ---------------- coleção ----------------
export const ownedCount = (id) => S.cars[id] || 0;
export function totalCars() {
  return Object.values(S.cars).reduce((a, b) => a + b, 0);
}
export function uniqueCars() {
  return Object.keys(S.cars).filter((k) => S.cars[k] > 0).length;
}
export function garageValue() {
  let v = 0;
  for (const [id, n] of Object.entries(S.cars)) if (CAR_BY_ID[id]) v += CAR_BY_ID[id].value * n;
  return v;
}
export function addCar(id) {
  S.cars[id] = (S.cars[id] || 0) + 1;
  const c = CAR_BY_ID[id];
  const best = S.stats.best && CAR_BY_ID[S.stats.best];
  if (!best || c.value > best.value) S.stats.best = id;
  if (!S.featured || CAR_BY_ID[S.featured].value < c.value) S.featured = id;
  save();
}
export function sellPrice(id) {
  const c = CAR_BY_ID[id];
  return Math.round(c.value * RARITIES[c.rarity].sell);
}
export function removeCar(id) {
  if (!S.cars[id]) return false;
  S.cars[id]--;
  if (!S.cars[id]) {
    delete S.cars[id];
    if (S.featured === id) S.featured = bestOwned();
  }
  save();
  return true;
}
export function bestOwned() {
  let best = null;
  for (const id of Object.keys(S.cars)) if (!best || CAR_BY_ID[id].value > CAR_BY_ID[best].value) best = id;
  return best;
}

// ---------------- moedas, gemas, XP ----------------
const listeners = new Set();
export const onChange = (fn) => listeners.add(fn);
export function changed() {
  for (const fn of listeners) fn();
  save();
}

export function canPay(coins = 0, gems = 0) {
  return S.coins >= coins && S.gems >= gems;
}
export function pay(coins = 0, gems = 0) {
  if (!canPay(coins, gems)) return false;
  S.coins -= coins;
  S.gems -= gems;
  changed();
  return true;
}
export function earn(coins = 0, gems = 0) {
  S.coins += Math.round(coins);
  S.gems += Math.round(gems);
  if (coins > 0) S.stats.earned += Math.round(coins);
  changed();
}

export const xpForLevel = (lv) => Math.round(400 * Math.pow(lv, 1.75) / 100) * 100;
export const levelReward = (lv) => ({ coins: 1500 * lv, gems: 5 + lv });

// Retorna a lista de níveis ganhos (para comemorar na interface).
export function addXp(n) {
  S.xp += Math.round(n);
  S.stats.xpTotal = (S.stats.xpTotal || 0) + Math.round(n);
  const ups = [];
  while (S.xp >= xpForLevel(S.level)) {
    S.xp -= xpForLevel(S.level);
    S.level++;
    const r = levelReward(S.level);
    S.coins += r.coins;
    S.gems += r.gems;
    ups.push(S.level);
  }
  changed();
  return ups;
}

// ---------------- toque e renda ----------------
export function setsDone() {
  return Object.keys(S.sets).length;
}
export function boostActive() {
  return Date.now() < S.boostUntil;
}
export function tapValue() {
  const base = (8 + S.upg.tap * 7) * (1 + (S.level - 1) * 0.15) * (1 + setsDone() * 0.05);
  return Math.round(base * (boostActive() ? 3 : 1));
}
export const boostSeconds = () => 30 + S.upg.boost * 10;
export const BOOST_COOLDOWN = 5 * 60 * 1000;
export function passivePerHour() {
  return Math.round(garageValue() * 0.02 * (1 + S.upg.passive * 0.25));
}
export const offlineHours = () => 2 + S.upg.offline;

export const UPGRADES = [
  { id: 'tap', name: 'Toque turbo', desc: '+7 moedas base por toque', max: 40, cost: (l) => Math.round(1500 * Math.pow(1.65, l)) },
  { id: 'passive', name: 'Garagem rentável', desc: '+25% de renda passiva da garagem', max: 20, cost: (l) => Math.round(6000 * Math.pow(1.9, l)) },
  { id: 'boost', name: 'Nitro prolongado', desc: '+10 s de duração do Boost x3', max: 15, cost: (l) => Math.round(4000 * Math.pow(1.8, l)) },
  { id: 'offline', name: 'Segurança 24h', desc: '+1 h de renda enquanto você está fora', max: 10, cost: (l) => Math.round(12000 * Math.pow(2.1, l)) },
];

// Renda acumulada enquanto o jogo estava fechado.
export function collectOffline() {
  const away = Math.min(Date.now() - S.lastSeen, offlineHours() * 3600e3);
  if (away < 60e3) return 0;
  const v = Math.round((passivePerHour() * away) / 3600e3);
  if (v > 0) earn(v);
  return v;
}

// ---------------- tarefas diárias ----------------
export function ensureDay() {
  const k = todayKey();
  if (S.day.key !== k) S.day = { key: k, taps: 0, opened: 0, games: 0, sold: 0, bids: 0, claimed: {}, drops: {} };
}
export const TASKS = [
  { id: 'taps', name: 'Toque 300 vezes no carro', goal: 300, reward: { coins: 3000 } },
  { id: 'opened', name: 'Abra 3 caixas', goal: 3, reward: { gems: 12 } },
  { id: 'games', name: 'Jogue 3 minijogos', goal: 3, reward: { coins: 6000 } },
  { id: 'sold', name: 'Venda 1 carro', goal: 1, reward: { gems: 6 } },
  { id: 'bids', name: 'Dê 5 lances em leilões', goal: 5, reward: { box: 'entusiasta' } },
];
export function track(key, n = 1) {
  ensureDay();
  S.day[key] = (S.day[key] || 0) + n;
  if (key === 'taps') S.stats.taps += n;
  if (key === 'opened') S.stats.opened += n;
  if (key === 'sold') S.stats.sold += n;
  if (key === 'games') S.stats.games += n;
  save();
}
export function tasksClaimable() {
  ensureDay();
  let n = TASKS.filter((t) => S.day[t.id] >= t.goal && !S.day.claimed[t.id]).length;
  if (allTasksDone() && !S.day.claimed.all) n++;
  return n;
}
export const allTasksDone = () => TASKS.every((t) => S.day.claimed[t.id]);

// ---------------- conjuntos (marcas) ----------------
export const SETS = (() => {
  const by = {};
  for (const c of POOL) (by[c.brand] ||= []).push(c.id);
  return Object.entries(by)
    .filter(([, ids]) => ids.length >= 3)
    .map(([brand, ids]) => {
      const score = ids.reduce((a, id) => a + [1, 2, 5, 15, 40, 80][RARITIES[CAR_BY_ID[id].rarity].order], 0);
      return { brand, ids, gems: Math.min(400, 10 + score), coins: score * 2500 };
    })
    .sort((a, b) => a.gems - b.gems);
})();

// ---------------- conquistas ----------------
export const ACHIEVEMENTS = [
  { id: 'u5', name: 'Primeiros passos', desc: 'Tenha 5 carros diferentes', test: () => uniqueCars() >= 5, gems: 10 },
  { id: 'u15', name: 'Colecionador', desc: 'Tenha 15 carros diferentes', test: () => uniqueCars() >= 15, gems: 30 },
  { id: 'u30', name: 'Museu sobre rodas', desc: 'Tenha 30 carros diferentes', test: () => uniqueCars() >= 30, gems: 80 },
  { id: 'u50', name: 'Lenda das garagens', desc: 'Tenha 50 carros diferentes', test: () => uniqueCars() >= 50, gems: 250 },
  { id: 'v1m', name: 'Milionário', desc: 'Garagem valendo 1 milhão', test: () => garageValue() >= 1e6, gems: 25 },
  { id: 'v50m', name: 'Magnata', desc: 'Garagem valendo 50 milhões', test: () => garageValue() >= 5e7, gems: 120 },
  { id: 'v500m', name: 'Bilionário em potencial', desc: 'Garagem valendo 500 milhões', test: () => garageValue() >= 5e8, gems: 400 },
  { id: 'epic', name: 'Que sorte!', desc: 'Consiga um carro Épico', test: () => hasRarity('epico'), gems: 15 },
  { id: 'leg', name: 'Tirada lendária', desc: 'Consiga um carro Lendário', test: () => hasRarity('lendario'), gems: 50 },
  { id: 'myth', name: 'Ultra Prestígio', desc: 'Consiga um carro Ultra Prestígio', test: () => hasRarity('mitico'), gems: 150 },
  { id: 'open50', name: 'Abridor serial', desc: 'Abra 50 caixas', test: () => S.stats.opened >= 50, gems: 40 },
  { id: 'tap5k', name: 'Dedo de aço', desc: 'Toque 5.000 vezes', test: () => S.stats.taps >= 5000, gems: 20 },
  { id: 'auc', name: 'Arrematado!', desc: 'Vença um leilão', test: () => S.stats.auctions >= 1, gems: 15 },
  { id: 'lvl10', name: 'Piloto experiente', desc: 'Chegue ao nível 10', test: () => S.level >= 10, gems: 30 },
  { id: 'set1', name: 'Fã da marca', desc: 'Complete um conjunto de marca', test: () => setsDone() >= 1, gems: 30 },
];
export function hasRarity(r) {
  return Object.keys(S.cars).some((id) => CAR_BY_ID[id].rarity === r);
}
export function achClaimable() {
  return ACHIEVEMENTS.filter((a) => !S.ach[a.id] && a.test()).length + SETS.filter((s) => !S.sets[s.brand] && s.ids.every((id) => S.cars[id])).length;
}

// ---------------- caixas ----------------
export function rollBox(boxId, r = Math.random) {
  const box = BOXES.find((b) => b.id === boxId);
  const entries = Object.entries(box.odds);
  const total = entries.reduce((a, [, p]) => a + p, 0);
  let x = r() * total;
  let rar = entries[0][0];
  for (const [k, p] of entries) {
    if ((x -= p) <= 0) {
      rar = k;
      break;
    }
  }
  const cars = POOL.filter((c) => c.rarity === rar);
  const car = pick(cars, r);
  const chance = box.odds[rar] / total / cars.length;
  return { car, chance };
}
export const XP_BY_RARITY = { comum: 20, incomum: 60, raro: 180, epico: 600, lendario: 1500, mitico: 2500 };

export { CARS, CAR_BY_ID, POOL, RARITIES, RARITY_KEYS, BOXES };

// Definições das armas e equipamentos (valores próximos aos do jogo competitivo).
// Distâncias em metros (1 m ≈ 40 unidades do motor Source). Imprecisão em
// milirradianos, como nos arquivos de script do jogo original.
import { seeded } from './util.js';

// Padrão de recuo determinístico: sobe nos primeiros tiros e depois oscila.
// Retorna lista de [yaw, pitch] acumulados em graus.
function pattern(seed, n, climb, climbShots, sway) {
  const r = seeded(seed);
  const out = [[0, 0]];
  let yaw = 0;
  let pitch = 0;
  let dir = r() < 0.5 ? -1 : 1;
  for (let i = 1; i < n; i++) {
    if (i < climbShots) {
      pitch += climb * (1.15 - (i / climbShots) * 0.55);
      yaw += (r() - 0.5) * climb * 0.25;
    } else {
      pitch += climb * 0.06 * (r() - 0.3);
      if (r() < 0.12) dir = -dir;
      yaw += dir * sway * (0.6 + r() * 0.6);
    }
    out.push([yaw, pitch]);
  }
  return out;
}

const W = {};
const def = (id, o) => {
  W[id] = { id, ...o };
};

// slot: 0 primária, 1 secundária, 2 faca, 3 granadas, 4 bomba
def('knife', {
  name: 'Faca', slot: 2, price: 0, team: 'any', type: 'knife',
  damage: 40, rate: 0.45, range: 2.0, speed: 6.25, kill: 1500,
});
def('glock', {
  name: 'Glock-18', slot: 1, price: 200, team: 'T', type: 'pistol',
  damage: 30, armorPen: 0.47, rangeMod: 0.85, rate: 0.15, mag: 20, reserve: 120, reload: 2.2,
  speed: 6.0, auto: false, spread: 2, stand: 5.6, crouch: 4.2, move: 9.2, jump: 140, fire: 56, recovery: 0.35,
  climb: 0.9, sway: 0.3, kill: 300, sound: 'pistol', heads: 4,
});
def('usp', {
  name: 'USP-S', slot: 1, price: 200, team: 'CT', type: 'pistol',
  damage: 35, armorPen: 0.505, rangeMod: 0.91, rate: 0.17, mag: 12, reserve: 24, reload: 2.2,
  speed: 6.0, auto: false, spread: 1.5, stand: 4.5, crouch: 3.2, move: 9.0, jump: 140, fire: 52, recovery: 0.33,
  climb: 0.95, sway: 0.3, kill: 300, sound: 'silenced', heads: 4,
});
def('p250', {
  name: 'P250', slot: 1, price: 300, team: 'any', type: 'pistol',
  damage: 38, armorPen: 0.64, rangeMod: 0.85, rate: 0.15, mag: 13, reserve: 26, reload: 2.2,
  speed: 6.0, auto: false, spread: 2, stand: 6.1, crouch: 4.5, move: 10.5, jump: 140, fire: 58, recovery: 0.36,
  climb: 1.1, sway: 0.35, kill: 300, sound: 'pistol', heads: 4,
});
def('deagle', {
  name: 'Desert Eagle', slot: 1, price: 700, team: 'any', type: 'pistol',
  damage: 63, armorPen: 0.932, rangeMod: 0.81, rate: 0.27, mag: 7, reserve: 35, reload: 2.2,
  speed: 5.75, auto: false, spread: 2, stand: 6.5, crouch: 4.6, move: 21, jump: 160, fire: 95, recovery: 0.75,
  climb: 2.4, sway: 0.6, kill: 300, sound: 'deagle', heads: 4,
});
def('mac10', {
  name: 'MAC-10', slot: 0, price: 1050, team: 'T', type: 'smg',
  damage: 29, armorPen: 0.575, rangeMod: 0.8, rate: 0.075, mag: 30, reserve: 100, reload: 2.6,
  speed: 6.0, auto: true, spread: 3, stand: 13, crouch: 10, move: 22, jump: 150, fire: 9, recovery: 0.3,
  climb: 0.42, sway: 0.25, kill: 600, sound: 'smg', heads: 4,
});
def('mp9', {
  name: 'MP9', slot: 0, price: 1250, team: 'CT', type: 'smg',
  damage: 26, armorPen: 0.6, rangeMod: 0.87, rate: 0.07, mag: 30, reserve: 120, reload: 2.1,
  speed: 6.0, auto: true, spread: 3, stand: 11, crouch: 8, move: 20, jump: 150, fire: 8.5, recovery: 0.28,
  climb: 0.4, sway: 0.24, kill: 600, sound: 'smg', heads: 4,
});
def('nova', {
  name: 'Nova', slot: 0, price: 1050, team: 'any', type: 'shotgun',
  damage: 26, armorPen: 0.5, rangeMod: 0.7, rate: 0.88, mag: 8, reserve: 32, reload: 0.5, shellReload: true,
  speed: 5.5, auto: false, spread: 40, stand: 25, crouch: 22, move: 40, jump: 120, fire: 50, recovery: 0.5,
  climb: 3, sway: 0.5, pellets: 9, kill: 900, sound: 'shotgun', heads: 4,
});
def('galil', {
  name: 'Galil AR', slot: 0, price: 1800, team: 'T', type: 'rifle',
  damage: 30, armorPen: 0.775, rangeMod: 0.98, rate: 0.09, mag: 35, reserve: 90, reload: 3.0,
  speed: 5.38, auto: true, spread: 0.6, stand: 5.6, crouch: 4.3, move: 132, jump: 140, fire: 7.2, recovery: 0.39,
  climb: 0.62, sway: 0.32, kill: 300, sound: 'rifle', heads: 4,
});
def('famas', {
  name: 'FAMAS', slot: 0, price: 2050, team: 'CT', type: 'rifle',
  damage: 30, armorPen: 0.7, rangeMod: 0.96, rate: 0.09, mag: 25, reserve: 90, reload: 3.3,
  speed: 5.5, auto: true, spread: 0.6, stand: 4.9, crouch: 3.8, move: 120, jump: 140, fire: 7, recovery: 0.36,
  climb: 0.6, sway: 0.3, kill: 300, sound: 'rifle', heads: 4,
});
def('ak47', {
  name: 'AK-47', slot: 0, price: 2700, team: 'T', type: 'rifle',
  damage: 36, armorPen: 0.775, rangeMod: 0.98, rate: 0.1, mag: 30, reserve: 90, reload: 2.5,
  speed: 5.38, auto: true, spread: 0.6, stand: 4.81, crouch: 3.68, move: 140, jump: 140, fire: 7.8, recovery: 0.368,
  climb: 0.78, sway: 0.42, kill: 300, sound: 'ak', heads: 4,
});
def('m4a4', {
  name: 'M4A4', slot: 0, price: 3100, team: 'CT', type: 'rifle',
  damage: 33, armorPen: 0.7, rangeMod: 0.97, rate: 0.09, mag: 30, reserve: 90, reload: 3.1,
  speed: 5.63, auto: true, spread: 0.6, stand: 3.68, crouch: 2.7, move: 108, jump: 140, fire: 7, recovery: 0.34,
  climb: 0.66, sway: 0.34, kill: 300, sound: 'm4', heads: 4,
});
def('ssg08', {
  name: 'SSG 08', slot: 0, price: 1700, team: 'any', type: 'sniper',
  damage: 88, armorPen: 0.85, rangeMod: 0.98, rate: 1.25, mag: 10, reserve: 90, reload: 3.7,
  speed: 5.75, scopeSpeed: 5.75, auto: false, spread: 0.3, stand: 2.5, crouch: 2.0, move: 60, jump: 25, fire: 30, recovery: 0.3,
  unscoped: 55, zoom: [40, 15], climb: 2.5, sway: 0.4, kill: 300, sound: 'scout', heads: 2.5,
});
def('awp', {
  name: 'AWP', slot: 0, price: 4750, team: 'any', type: 'sniper',
  damage: 115, armorPen: 0.975, rangeMod: 0.99, rate: 1.46, mag: 5, reserve: 30, reload: 3.6,
  speed: 5.0, scopeSpeed: 2.5, auto: false, spread: 0.2, stand: 1.5, crouch: 1.2, move: 170, jump: 400, fire: 100, recovery: 0.25,
  unscoped: 90, zoom: [40, 10], climb: 3.5, sway: 0.5, kill: 100, sound: 'awp', heads: 4,
});

// Granadas
def('he', { name: 'Granada HE', slot: 3, price: 300, team: 'any', type: 'grenade', speed: 6.1, kill: 300, fuse: 1.6 });
def('flash', { name: 'Granada de luz', slot: 3, price: 200, team: 'any', type: 'grenade', speed: 6.1, fuse: 1.6, max: 2 });
def('smoke', { name: 'Granada de fumaça', slot: 3, price: 300, team: 'any', type: 'grenade', speed: 6.1, fuse: 1.6 });
def('c4', { name: 'Explosivo C4', slot: 4, price: 0, team: 'T', type: 'bomb', speed: 6.25 });

for (const w of Object.values(W)) {
  if (w.climb) w.pattern = pattern(w.id.length * 97 + w.damage, (w.mag || 10) + 1, w.climb, w.type === 'smg' ? 8 : 10, w.sway);
  w.icon = w.icon || w.name;
}

export const WEAPONS = W;

// Equipamento adicional
export const EQUIP = {
  vest: { name: 'Colete', price: 650 },
  vesthelm: { name: 'Colete + capacete', price: 1000 },
  kit: { name: 'Kit de desarme', price: 400, team: 'CT' },
};

// Menu de compra por categoria
export const BUY_MENU = [
  { name: 'Pistolas', items: ['glock', 'usp', 'p250', 'deagle'] },
  { name: 'Pesadas', items: ['nova'] },
  { name: 'SMGs', items: ['mac10', 'mp9'] },
  { name: 'Rifles', items: ['galil', 'famas', 'ak47', 'm4a4', 'ssg08', 'awp'] },
  { name: 'Equipamento', items: ['vest', 'vesthelm', 'kit'] },
  { name: 'Granadas', items: ['flash', 'smoke', 'he'] },
];

export const DAMAGE_GROUPS = { head: 4, chest: 1, stomach: 1.25, legs: 0.75 };

// Instância de uma arma carregada por alguém.
export function makeWeapon(id) {
  const d = W[id];
  return { def: d, id, mag: d.mag || 0, reserve: d.reserve || 0 };
}

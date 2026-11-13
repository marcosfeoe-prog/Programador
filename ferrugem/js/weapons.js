// Arsenal: armas de fogo, munições e itens arremessáveis.
export const WEAPONS = {
  pistol: { id: 'pistol', name: 'Pistola P-9', short: 'Pistola', mag: 12, dmg: 34, rate: 0.24, reload: 1.35, pellets: 1, spread: 0, range: 90, recoil: 0.024, noise: 32, ammo: 'pistol', shake: 0.05, pose: 'pistol', sound: 'pistol' },
  shotgun: { id: 'shotgun', name: 'Escopeta calibre 12', short: 'Escopeta', mag: 6, dmg: 16, rate: 0.95, reload: 0.55, perShell: true, pellets: 9, spread: 0.075, range: 34, recoil: 0.08, noise: 42, ammo: 'shotgun', shake: 0.22, pose: 'long', sound: 'shotgun', lateEject: 0.42 },
  smg: { id: 'smg', name: 'Submetralhadora SM-10', short: 'Submetralhadora', mag: 30, dmg: 16, rate: 0.085, auto: true, reload: 1.9, pellets: 1, spread: 0.02, range: 70, recoil: 0.011, noise: 30, ammo: 'smg', shake: 0.03, pose: 'pistol', sound: 'smg' },
  rifle: { id: 'rifle', name: 'Rifle de precisão', short: 'Rifle', mag: 5, dmg: 150, rate: 1.2, reload: 2.5, pellets: 1, spread: 0, range: 170, recoil: 0.09, noise: 55, ammo: 'rifle', shake: 0.25, scope: true, pierce: 3, pose: 'long', sound: 'rifle', lateEject: 0.5 },
  magnum: { id: 'magnum', name: 'Revólver .44', short: 'Revólver', mag: 6, dmg: 95, rate: 0.62, reload: 2.3, pellets: 1, spread: 0, range: 110, recoil: 0.11, noise: 45, ammo: 'magnum', shake: 0.2, pierce: 2, pose: 'pistol', sound: 'magnum', noEject: true },
};

export const WEAPON_ORDER = ['pistol', 'shotgun', 'smg', 'rifle', 'magnum'];

// Munições: nome e quanto vem numa caixa (mínimo, máximo).
export const AMMO = {
  pistol: { name: 'Munição 9 mm', box: [6, 10] },
  shotgun: { name: 'Cartuchos calibre 12', box: [3, 5] },
  smg: { name: 'Munição .45', box: [15, 25] },
  rifle: { name: 'Balas de rifle', box: [2, 4] },
  magnum: { name: 'Balas .44 Magnum', box: [2, 4] },
};

export const THROWABLES = ['grenade', 'molotov'];

export function newLoadout() {
  const weapons = {};
  for (const id of WEAPON_ORDER) weapons[id] = { owned: id === 'pistol', mag: id === 'pistol' ? WEAPONS.pistol.mag : 0 };
  const ammo = {};
  for (const k in AMMO) ammo[k] = 0;
  ammo.pistol = 24;
  return { weapons, ammo, items: { tonic: 1, medkit: 0, grenade: 0, molotov: 0 } };
}

// Completa um carregamento antigo (saves da versão anterior) com os campos novos.
export function normalizeLoadout(d) {
  const base = newLoadout();
  const weapons = {};
  for (const id of WEAPON_ORDER) weapons[id] = { ...base.weapons[id], ...(d.weapons && d.weapons[id]) };
  const ammo = { ...base.ammo, ...(d.ammo || {}) };
  for (const k in AMMO) ammo[k] = ammo[k] || 0;
  if (!d.ammo) ammo.pistol = base.ammo.pistol;
  const items = { ...base.items, ...(d.items || {}) };
  return { weapons, ammo, items };
}

// Tipos de munição das armas que o jogador já tem (para sorteio de itens).
export function ownedAmmoTypes(P) {
  const out = [];
  for (const id of WEAPON_ORDER) if (P.weapons[id] && P.weapons[id].owned) out.push(WEAPONS[id].ammo);
  return out;
}

export function totalAmmo(P) {
  let n = 0;
  for (const id of WEAPON_ORDER) {
    const st = P.weapons[id];
    if (!st || !st.owned) continue;
    n += st.mag + (P.ammo[WEAPONS[id].ammo] || 0) * (id === 'rifle' || id === 'magnum' ? 3 : 1);
  }
  return n;
}

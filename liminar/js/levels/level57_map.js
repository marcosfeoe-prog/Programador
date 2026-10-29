// Nível 57 — o mapa do shopping. Usa o mesmo motor do Nível 55 (Map55: união
// de retângulos com altura de piso, campo de distância, escadas), montado à mão:
//   térreo  — entrada, o corredor principal (14 m de largura, 130 m), o corredor
//             transversal, as lojas dos dois lados, a praça de alimentação, o
//             nicho do duto de ventilação e a porta "SOMENTE FUNCIONÁRIOS";
//   escada  — um lance de 30 degraus que sobe 5,4 m;
//   2º andar — um corredor de lojas fechadas e, no fim, a porta de madeira do
//             cômodo vazio com o computador no chão;
//   e o corredor escuro de serviço, 150 m até a porta de metal.
import { Map55, RISE, TREAD } from './level55_map.js';
import { mulberry32 } from '../util.js';

export const H = 4.6;
export const UP = 5.4; // altura do 2º andar

export function buildMap() {
  const M = Object.create(Map55.prototype);
  M.H = H;
  M.shapes = [];
  M.stairs = [];
  M.o = {};
  const flat = (y) => () => y;
  const R = (x0, x1, z0, z1, y = 0, tag = {}) => M.rect(x0, x1, z0, z1, flat(y), tag);
  const shops = [];
  const r = mulberry32(5757);
  // ---- térreo
  R(-10, 10, -2, 9, 0, { zone: 'entrada' });
  R(-7, 7, -134, 0, 0, { zone: 'principal' });
  R(-62, 62, -67, -53, 0, { zone: 'cruz' });
  R(-24, 24, -164, -130, 0, { zone: 'praca' });
  const kinds = ['shutter', 'shutter', 'glass', 'open', 'fence', 'shutter', 'board', 'open', 'glass'];
  // lojas do corredor principal (fundas, 8,4 m de frente)
  for (let zc = -10; zc >= -124; zc -= 10) {
    if (zc < -48 && zc > -72) continue;
    for (const s of [-1, 1]) {
      const kind = kinds[Math.floor(r() * kinds.length)];
      const x0 = s < 0 ? -19 : 5;
      const x1 = s < 0 ? -5 : 19;
      M.rect(x0, x1, zc - 4.2, zc + 4.2, flat(0), { shop: true });
      shops.push({ x: s * 7, z: zc, nx: -s, nz: 0, w: 8.4, depth: 12, kind, ix: s * 12.5, iz: zc });
    }
  }
  // lojas do corredor transversal
  for (const xc of [-55, -45, -35, -25, 25, 35, 45, 55]) {
    for (const s of [-1, 1]) {
      if (Math.abs(xc) < 12) continue;
      const kind = kinds[Math.floor(r() * kinds.length)];
      const z0 = s < 0 ? -55 : -78;
      const z1 = s < 0 ? -42 : -65;
      // s<0: lado norte (z maior)
      M.rect(xc - 4.2, xc + 4.2, z0, z1, flat(0), { shop: true });
      shops.push({ x: xc, z: s < 0 ? -53 : -67, nx: 0, nz: s < 0 ? -1 : 1, w: 8.4, depth: 12, kind, ix: xc, iz: (z0 + z1) / 2 });
    }
  }
  // salão da escada (ponta leste do corredor transversal)
  R(60, 74, -67, -53, 0, { zone: 'escada' });
  // a escada: sobe para o leste
  const steps = Math.round(UP / RISE);
  const run = steps * TREAD;
  const s0 = 75;
  const s1 = s0 + run;
  const st = { a: { x: 0, z: -60, y: 0 }, b: { y: UP }, w: 5, horiz: true, s0, s1, steps };
  st.yAt = (u) => Math.min(UP, Math.max(0, ((u - s0) / (s1 - s0)) * UP));
  M.stairs.push(st);
  M.rect(72, s1 + 2, -62.5, -57.5, (x) => st.yAt(x), { zone: 'lance', edge: st });
  // 2º andar: patamar e corredor de lojas fechadas, indo para o norte
  R(s1, s1 + 12, -66, -52, UP, { zone: 'patamar' });
  const ux0 = s1 + 2;
  const ux1 = s1 + 10;
  R(ux0, ux1, -122, -50, UP, { zone: 'andar2' });
  const shops2 = [];
  for (let zc = -60; zc >= -114; zc -= 9) {
    M.rect(ux1 - 2, ux1 + 9, zc - 3.8, zc + 3.8, flat(UP), { shop: true, up: true });
    shops2.push({ x: ux1, z: zc, nx: -1, nz: 0, w: 7.6, depth: 9, kind: r() < 0.5 ? 'shutter' : 'board', ix: ux1 + 4, iz: zc, y: UP });
  }
  // a porta de madeira no fim do corredor e o cômodo do computador
  const dx = (ux0 + ux1) / 2;
  const doorZ = -122;
  M.rect(dx - 0.55, dx + 0.55, doorZ - 2.6, doorZ + 1.0, flat(UP), { zone: 'porta' });
  R(dx - 3.2, dx + 3.2, doorZ - 7.6, doorZ - 1.3, UP, { zone: 'quarto' });
  // nicho do duto de ventilação (fundo da praça)
  R(16, 21, -167.5, -162, 0, { zone: 'duto' });
  // porta SOMENTE FUNCIONÁRIOS e o corredor escuro de 150 m (para o oeste)
  R(-27, -22, -151.6, -150.4, 0, { zone: 'servico' });
  R(-176, -25, -152.2, -149.8, 0, { zone: 'escuro' });
  M.index();
  return {
    M,
    shops: shops.concat(shops2),
    stair: st,
    pcDoor: { x: dx, z: doorZ, y: UP },
    room: { x: dx, z: doorZ - 4.4, y: UP },
    vent: { x: 18.5, z: -167.5 },
    staff: { x: -24, z: -151 },
    metal: { x: -176, z: -151 },
    up: { x0: ux0, x1: ux1 },
  };
}

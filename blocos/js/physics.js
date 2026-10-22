// Colisão de caixas (AABB) contra blocos sólidos, compartilhada por jogador, mobs e itens.
import { SOLID, LIQUID } from './world.js';
import { B } from './blocks.js';

const EPS = 1e-7;

function solidAt(world, x, y, z) {
  if (!world.isReady(x, z)) return true; // chunk ainda não carregado: barreira
  return SOLID[world.getBlock(x, y, z)] === 1;
}

// e: { x, y, z (pés, centro), w (meia largura), h (altura) } → move e devolve colisões
export function moveBox(world, e, dx, dy, dz) {
  const w = e.w;
  const minX = Math.floor(Math.min(e.x - w, e.x - w + dx));
  const maxX = Math.floor(Math.max(e.x + w, e.x + w + dx));
  const minY = Math.floor(Math.min(e.y, e.y + dy));
  const maxY = Math.floor(Math.max(e.y + e.h, e.y + e.h + dy));
  const minZ = Math.floor(Math.min(e.z - w, e.z - w + dz));
  const maxZ = Math.floor(Math.max(e.z + w, e.z + w + dz));
  const boxes = [];
  for (let y = minY; y <= maxY; y++) for (let z = minZ; z <= maxZ; z++) for (let x = minX; x <= maxX; x++) {
    if (solidAt(world, x, y, z)) boxes.push(x, y, z);
  }
  const ody = dy, odx = dx, odz = dz;
  // eixo Y
  for (let i = 0; i < boxes.length; i += 3) {
    const bx = boxes[i], by = boxes[i + 1], bz = boxes[i + 2];
    if (e.x + w <= bx + EPS || e.x - w >= bx + 1 - EPS || e.z + w <= bz + EPS || e.z - w >= bz + 1 - EPS) continue;
    if (dy < 0 && e.y >= by + 1 - EPS) dy = Math.max(dy, by + 1 - e.y);
    else if (dy > 0 && e.y + e.h <= by + EPS) dy = Math.min(dy, by - (e.y + e.h));
  }
  e.y += dy;
  // eixo X
  for (let i = 0; i < boxes.length; i += 3) {
    const bx = boxes[i], by = boxes[i + 1], bz = boxes[i + 2];
    if (e.y + e.h <= by + EPS || e.y >= by + 1 - EPS || e.z + w <= bz + EPS || e.z - w >= bz + 1 - EPS) continue;
    if (dx < 0 && e.x - w >= bx + 1 - EPS) dx = Math.max(dx, bx + 1 - (e.x - w));
    else if (dx > 0 && e.x + w <= bx + EPS) dx = Math.min(dx, bx - (e.x + w));
  }
  e.x += dx;
  // eixo Z
  for (let i = 0; i < boxes.length; i += 3) {
    const bx = boxes[i], by = boxes[i + 1], bz = boxes[i + 2];
    if (e.y + e.h <= by + EPS || e.y >= by + 1 - EPS || e.x + w <= bx + EPS || e.x - w >= bx + 1 - EPS) continue;
    if (dz < 0 && e.z - w >= bz + 1 - EPS) dz = Math.max(dz, bz + 1 - (e.z - w));
    else if (dz > 0 && e.z + w <= bz + EPS) dz = Math.min(dz, bz - (e.z + w));
  }
  e.z += dz;
  return {
    hitX: dx !== odx,
    hitY: dy !== ody,
    hitZ: dz !== odz,
    onGround: ody < 0 && dy !== ody,
  };
}

// Há chão sob a caixa se ela fosse deslocada (dx, dz)? (para não cair da beirada agachado)
export function hasGround(world, e, dx, dz) {
  const w = e.w - 0.001;
  const y = Math.floor(e.y - 0.05);
  for (let x = Math.floor(e.x + dx - w); x <= Math.floor(e.x + dx + w); x++)
    for (let z = Math.floor(e.z + dz - w); z <= Math.floor(e.z + dz + w); z++) if (solidAt(world, x, y, z)) return true;
  return false;
}

// Que líquido toca a caixa (0 se nenhum)
export function liquidIn(world, e, y0 = 0.1, y1 = null) {
  const w = e.w - 0.001;
  const top = e.y + (y1 ?? e.h - 0.3);
  for (let y = Math.floor(e.y + y0); y <= Math.floor(top); y++)
    for (let x = Math.floor(e.x - w); x <= Math.floor(e.x + w); x++)
      for (let z = Math.floor(e.z - w); z <= Math.floor(e.z + w); z++) {
        const id = world.getBlock(x, y, z);
        if (LIQUID[id]) return id;
      }
  return 0;
}

export function touchesBlock(world, e, id, grow = 0.02) {
  const w = e.w + grow;
  for (let y = Math.floor(e.y - grow); y <= Math.floor(e.y + e.h); y++)
    for (let x = Math.floor(e.x - w); x <= Math.floor(e.x + w); x++)
      for (let z = Math.floor(e.z - w); z <= Math.floor(e.z + w); z++) if (world.getBlock(x, y, z) === id) return true;
  return false;
}

export function boxIntersectsBlock(e, bx, by, bz) {
  return e.x + e.w > bx && e.x - e.w < bx + 1 && e.y + e.h > by && e.y < by + 1 && e.z + e.w > bz && e.z - e.w < bz + 1;
}

export { B };

// Colisão de caixas (AABB) contra blocos, compartilhada por jogador, mobs e itens.
// Blocos que não ocupam o cubo inteiro (lajes, portas, camas, cercas) têm caixas próprias.
import { SOLID, LIQUID } from './world.js';
import { B, BLOCKS } from './blocks.js';
import { fenceConnFrom } from './mesher.js';

const EPS = 1e-7;
const FULL = [[0, 0, 0, 1, 1, 1]];

// Caixas de colisão de um bloco (coordenadas locais 0..1)
export function collisionBoxes(world, x, y, z, id) {
  const b = BLOCKS[id];
  if (!b || !b.solid) return null;
  if (!b.boxes) return FULL;
  const meta = world.getMeta(x, y, z);
  if (id === B.FENCE) return b.boxes(meta, fenceConnFrom((dx, dz) => world.getBlock(x + dx, y, z + dz)));
  return b.boxes(meta);
}

// Forma usada para mirar e para o contorno de seleção (inclui blocos não sólidos)
export function shapeBoxes(world, x, y, z, id) {
  const b = BLOCKS[id];
  if (!b) return FULL;
  const meta = world.getMeta(x, y, z);
  switch (b.render) {
    case 'cross':
      return [[0.15, 0, 0.15, 0.85, 0.8, 0.85]];
    case 'crop':
      return [[0, 0, 0, 1, 0.25 + (meta & 7) * 0.09, 1]];
    case 'torch':
      return meta ? [[0.3, 0.2, 0.3, 0.7, 0.8, 0.7]] : [[0.38, 0, 0.38, 0.62, 0.62, 0.62]];
    case 'ladder': {
      const t = 2 / 16;
      return [null, [[0, 0, 0, t, 1, 1]], [[1 - t, 0, 0, 1, 1, 1]], [[0, 0, 0, 1, 1, t]], [[0, 0, 1 - t, 1, 1, 1]]][meta] || FULL;
    }
    case 'layer':
      return [[0, 0, 0, 1, ((meta & 7) + 1) / 8, 1]];
    case 'fence':
      return [[6 / 16, 0, 6 / 16, 10 / 16, 1, 10 / 16]];
  }
  if (b.boxes) return collisionBoxes(world, x, y, z, id) || FULL;
  return FULL;
}

// Lista de caixas absolutas (x0,y0,z0,x1,y1,z1 em sequência) na região
function gather(world, minX, minY, minZ, maxX, maxY, maxZ) {
  const out = [];
  for (let y = minY - 1; y <= maxY; y++) for (let z = minZ; z <= maxZ; z++) for (let x = minX; x <= maxX; x++) {
    if (!world.isReady(x, z)) {
      if (y >= minY) out.push(x, y, z, x + 1, y + 1, z + 1); // chunk ainda não carregado: barreira
      continue;
    }
    const id = world.getBlock(x, y, z);
    if (!SOLID[id]) continue;
    const boxes = collisionBoxes(world, x, y, z, id);
    for (const bx of boxes) {
      // a camada de baixo só importa para caixas mais altas que 1 (cercas)
      if (y < minY && bx[4] <= 1) continue;
      out.push(x + bx[0], y + bx[1], z + bx[2], x + bx[3], y + bx[4], z + bx[5]);
    }
  }
  return out;
}

// e: { x, y, z (pés, centro), w (meia largura), h (altura) } → move e devolve colisões
export function moveBox(world, e, dx, dy, dz) {
  const w = e.w;
  const boxes = gather(
    world,
    Math.floor(Math.min(e.x - w, e.x - w + dx)),
    Math.floor(Math.min(e.y, e.y + dy)),
    Math.floor(Math.min(e.z - w, e.z - w + dz)),
    Math.floor(Math.max(e.x + w, e.x + w + dx)),
    Math.floor(Math.max(e.y + e.h, e.y + e.h + dy)),
    Math.floor(Math.max(e.z + w, e.z + w + dz)),
  );
  const ody = dy, odx = dx, odz = dz;
  // eixo Y
  for (let i = 0; i < boxes.length; i += 6) {
    const x0 = boxes[i], y0 = boxes[i + 1], z0 = boxes[i + 2], x1 = boxes[i + 3], y1 = boxes[i + 4], z1 = boxes[i + 5];
    if (e.x + w <= x0 + EPS || e.x - w >= x1 - EPS || e.z + w <= z0 + EPS || e.z - w >= z1 - EPS) continue;
    if (dy < 0 && e.y >= y1 - EPS) dy = Math.max(dy, y1 - e.y);
    else if (dy > 0 && e.y + e.h <= y0 + EPS) dy = Math.min(dy, y0 - (e.y + e.h));
  }
  e.y += dy;
  // eixo X
  for (let i = 0; i < boxes.length; i += 6) {
    const x0 = boxes[i], y0 = boxes[i + 1], z0 = boxes[i + 2], x1 = boxes[i + 3], y1 = boxes[i + 4], z1 = boxes[i + 5];
    if (e.y + e.h <= y0 + EPS || e.y >= y1 - EPS || e.z + w <= z0 + EPS || e.z - w >= z1 - EPS) continue;
    if (dx < 0 && e.x - w >= x1 - EPS) dx = Math.max(dx, x1 - (e.x - w));
    else if (dx > 0 && e.x + w <= x0 + EPS) dx = Math.min(dx, x0 - (e.x + w));
  }
  e.x += dx;
  // eixo Z
  for (let i = 0; i < boxes.length; i += 6) {
    const x0 = boxes[i], y0 = boxes[i + 1], z0 = boxes[i + 2], x1 = boxes[i + 3], y1 = boxes[i + 4], z1 = boxes[i + 5];
    if (e.y + e.h <= y0 + EPS || e.y >= y1 - EPS || e.x + w <= x0 + EPS || e.x - w >= x1 - EPS) continue;
    if (dz < 0 && e.z - w >= z1 - EPS) dz = Math.max(dz, z1 - (e.z - w));
    else if (dz > 0 && e.z + w <= z0 + EPS) dz = Math.min(dz, z0 - (e.z + w));
  }
  e.z += dz;
  return {
    hitX: dx !== odx,
    hitY: dy !== ody,
    hitZ: dz !== odz,
    onGround: ody < 0 && dy !== ody,
  };
}

// Degrau automático de meio bloco (lajes): tenta subir até 0.5 quando bate de lado
export function tryStepUp(world, e, dx, dz) {
  const save = { x: e.x, y: e.y, z: e.z };
  const up = moveBox(world, e, 0, 0.5, 0);
  if (up.hitY) {
    Object.assign(e, save);
    return false;
  }
  const r = moveBox(world, e, dx, 0, dz);
  if (r.hitX || r.hitZ) {
    Object.assign(e, save);
    return false;
  }
  moveBox(world, e, 0, -0.5, 0);
  if (e.y - save.y < 0.05) {
    Object.assign(e, save);
    return false;
  }
  return true;
}

// Há chão sob a caixa se ela fosse deslocada (dx, dz)? (para não cair da beirada agachado)
export function hasGround(world, e, dx, dz) {
  const w = e.w - 0.001;
  const boxes = gather(world, Math.floor(e.x + dx - w), Math.floor(e.y - 0.6), Math.floor(e.z + dz - w), Math.floor(e.x + dx + w), Math.floor(e.y), Math.floor(e.z + dz + w));
  const x0 = e.x + dx - w, x1 = e.x + dx + w, z0 = e.z + dz - w, z1 = e.z + dz + w, y0 = e.y - 0.6, y1 = e.y + 0.01;
  for (let i = 0; i < boxes.length; i += 6) {
    if (boxes[i + 3] > x0 && boxes[i] < x1 && boxes[i + 5] > z0 && boxes[i + 2] < z1 && boxes[i + 4] > y0 && boxes[i + 1] < y1) return true;
  }
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

// algum bloco escalável (escada de mão) na altura do corpo
export function onClimbable(world, e) {
  const w = e.w;
  for (let y = Math.floor(e.y); y <= Math.floor(e.y + 0.9); y++)
    for (let x = Math.floor(e.x - w); x <= Math.floor(e.x + w); x++)
      for (let z = Math.floor(e.z - w); z <= Math.floor(e.z + w); z++) {
        const b = BLOCKS[world.getBlock(x, y, z)];
        if (b && b.climbable) return true;
      }
  return false;
}

export function boxIntersectsBlock(e, bx, by, bz, box = [0, 0, 0, 1, 1, 1]) {
  return e.x + e.w > bx + box[0] && e.x - e.w < bx + box[3] && e.y + e.h > by + box[1] && e.y < by + box[4] && e.z + e.w > bz + box[2] && e.z - e.w < bz + box[5];
}

export { B };

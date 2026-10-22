// Constantes compartilhadas do mundo.
export const CS = 16; // largura do chunk (x e z)
export const CH = 128; // altura do mundo
export const SEA = 62; // nível do mar
export const TPS = 20; // ticks por segundo
export const DAY_TICKS = 24000; // um dia completo (20 minutos)

export const BIOME = {
  OCEAN: 0,
  BEACH: 1,
  PLAINS: 2,
  FOREST: 3,
  BIRCH_FOREST: 4,
  DESERT: 5,
  SNOWY: 6,
  MOUNTAINS: 7,
  FROZEN_OCEAN: 8,
};
export const BIOME_NAMES = ['Oceano', 'Praia', 'Planície', 'Floresta', 'Floresta de bétulas', 'Deserto', 'Tundra nevada', 'Montanhas', 'Oceano congelado'];
// multiplicadores de cor da grama e das folhas por bioma
export const GRASS_TINT = [
  [1, 1, 1], [1.1, 1.02, 0.72], [1, 1, 1], [0.86, 0.95, 0.8], [0.95, 1.02, 0.85], [1.15, 1.0, 0.65], [0.82, 0.95, 1.02], [0.88, 0.96, 0.92], [0.82, 0.95, 1.02],
];
export const FOLIAGE_TINT = [
  [1, 1, 1], [1.08, 1.02, 0.8], [1.02, 1.03, 0.95], [0.85, 0.95, 0.85], [1, 1, 1], [1.15, 1.0, 0.7], [0.85, 0.95, 1.0], [0.9, 0.97, 0.94], [0.85, 0.95, 1.0],
];

export const idx = (x, y, z) => (y << 8) | (z << 4) | x;
export const chunkKey = (cx, cz) => (cx + 32768) * 65536 + (cz + 32768);

// Registro de blocos e itens (ids 0–255 são blocos, 256+ são itens).

export const BLOCKS = [];
export const B = {};

// render: 'cube' | 'cross' | 'torch' | 'liquid' | 'none'
// tex: nome da textura ou { top, bottom, side, front }
const DEFAULTS = {
  render: 'cube',
  solid: true,
  opaque: true,
  translucent: false, // vai para a malha transparente (água, gelo)
  cutout: false, // tem pixels transparentes (folhas, vidro)
  cullSame: false, // esconde faces entre blocos iguais (vidro, água)
  hardness: 1,
  tool: null, // 'pickaxe' | 'axe' | 'shovel'
  tier: 0, // nível mínimo da picareta para dropar algo
  light: 0,
  opacity: 15, // quanto bloqueia a luz
  gravity: false,
  sound: 'stone',
  tint: null, // 'grass' | 'foliage' | 'water'
  replaceable: false,
  needsSupport: false,
  oriented: false,
  stack: 64,
};

function def(id, key, props) {
  const b = { ...DEFAULTS, ...props, id, key };
  if (b.drop === undefined) b.drop = id;
  if (!b.opaque && props.opacity === undefined) b.opacity = 0;
  BLOCKS[id] = b;
  B[key] = id;
  return b;
}

def(0, 'AIR', { name: 'Ar', render: 'none', solid: false, opaque: false, hardness: 0, drop: 0 });
def(1, 'STONE', { name: 'Pedra', tex: 'stone', hardness: 1.5, tool: 'pickaxe', tier: 1, drop: 4 });
def(2, 'GRASS', { name: 'Bloco de grama', tex: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' }, hardness: 0.6, tool: 'shovel', sound: 'grass', drop: 3, tint: 'grass' });
def(3, 'DIRT', { name: 'Terra', tex: 'dirt', hardness: 0.5, tool: 'shovel', sound: 'gravel' });
def(4, 'COBBLE', { name: 'Pedregulho', tex: 'cobblestone', hardness: 2, tool: 'pickaxe', tier: 1 });
def(5, 'PLANKS', { name: 'Tábuas de carvalho', tex: 'planks', hardness: 2, tool: 'axe', sound: 'wood' });
def(6, 'BEDROCK', { name: 'Rocha-mãe', tex: 'bedrock', hardness: -1 });
def(7, 'SAND', { name: 'Areia', tex: 'sand', hardness: 0.5, tool: 'shovel', gravity: true, sound: 'sand' });
def(8, 'GRAVEL', { name: 'Cascalho', tex: 'gravel', hardness: 0.6, tool: 'shovel', gravity: true, sound: 'gravel' });
def(9, 'LOG', { name: 'Tronco de carvalho', tex: { top: 'log_top', bottom: 'log_top', side: 'log_side' }, hardness: 2, tool: 'axe', sound: 'wood' });
def(10, 'LEAVES', { name: 'Folhas de carvalho', tex: 'leaves', opaque: false, cutout: true, opacity: 1, hardness: 0.2, sound: 'grass', drop: 0, tint: 'foliage' });
def(11, 'GLASS', { name: 'Vidro', tex: 'glass', opaque: false, cutout: true, cullSame: true, hardness: 0.3, sound: 'glass', drop: 0 });
def(12, 'WATER', { name: 'Água', tex: 'water', render: 'liquid', solid: false, opaque: false, translucent: true, cullSame: true, opacity: 2, hardness: -1, replaceable: true, drop: 0, tint: 'water' });
def(13, 'LAVA', { name: 'Lava', tex: 'lava', render: 'liquid', solid: false, opaque: false, cullSame: true, opacity: 0, light: 15, hardness: -1, replaceable: true, drop: 0 });
def(14, 'COAL_ORE', { name: 'Minério de carvão', tex: 'coal_ore', hardness: 3, tool: 'pickaxe', tier: 1, drop: 257 });
def(15, 'IRON_ORE', { name: 'Minério de ferro', tex: 'iron_ore', hardness: 3, tool: 'pickaxe', tier: 2 });
def(16, 'GOLD_ORE', { name: 'Minério de ouro', tex: 'gold_ore', hardness: 3, tool: 'pickaxe', tier: 3 });
def(17, 'DIAMOND_ORE', { name: 'Minério de diamante', tex: 'diamond_ore', hardness: 3, tool: 'pickaxe', tier: 3, drop: 260 });
def(18, 'BRICKS', { name: 'Tijolos', tex: 'bricks', hardness: 2, tool: 'pickaxe', tier: 1 });
def(19, 'SNOW_GRASS', { name: 'Grama com neve', tex: { top: 'snow', bottom: 'dirt', side: 'snow_grass_side' }, hardness: 0.6, tool: 'shovel', sound: 'snow', drop: 3 });
def(20, 'SNOW', { name: 'Bloco de neve', tex: 'snow', hardness: 0.2, tool: 'shovel', sound: 'snow' });
def(21, 'CACTUS', { name: 'Cacto', tex: { top: 'cactus_top', bottom: 'cactus_top', side: 'cactus_side' }, opaque: false, cutout: true, opacity: 0, hardness: 0.4, sound: 'cloth', needsSupport: true });
def(22, 'BIRCH_LOG', { name: 'Tronco de bétula', tex: { top: 'birch_log_top', bottom: 'birch_log_top', side: 'birch_log_side' }, hardness: 2, tool: 'axe', sound: 'wood' });
def(23, 'BIRCH_LEAVES', { name: 'Folhas de bétula', tex: 'birch_leaves', opaque: false, cutout: true, opacity: 1, hardness: 0.2, sound: 'grass', drop: 0, tint: 'birch' });
def(24, 'SPRUCE_LOG', { name: 'Tronco de pinheiro', tex: { top: 'spruce_log_top', bottom: 'spruce_log_top', side: 'spruce_log_side' }, hardness: 2, tool: 'axe', sound: 'wood' });
def(25, 'SPRUCE_LEAVES', { name: 'Folhas de pinheiro', tex: 'spruce_leaves', opaque: false, cutout: true, opacity: 1, hardness: 0.2, sound: 'grass', drop: 0, tint: 'spruce' });
def(26, 'SANDSTONE', { name: 'Arenito', tex: { top: 'sandstone_top', bottom: 'sandstone_bottom', side: 'sandstone_side' }, hardness: 0.8, tool: 'pickaxe', tier: 1 });
def(27, 'TALL_GRASS', { name: 'Grama alta', tex: 'tall_grass', render: 'cross', solid: false, opaque: false, cutout: true, hardness: 0, sound: 'grass', replaceable: true, needsSupport: true, drop: 0, tint: 'grass' });
def(28, 'DANDELION', { name: 'Dente-de-leão', tex: 'dandelion', render: 'cross', solid: false, opaque: false, cutout: true, hardness: 0, sound: 'grass', needsSupport: true });
def(29, 'POPPY', { name: 'Papoula', tex: 'poppy', render: 'cross', solid: false, opaque: false, cutout: true, hardness: 0, sound: 'grass', needsSupport: true });
def(30, 'TORCH', { name: 'Tocha', tex: 'torch', render: 'torch', solid: false, opaque: false, cutout: true, hardness: 0, light: 14, sound: 'wood', needsSupport: true });
def(31, 'CRAFTING_TABLE', { name: 'Bancada de trabalho', tex: { top: 'crafting_top', bottom: 'planks', side: 'crafting_side', front: 'crafting_front' }, hardness: 2.5, tool: 'axe', sound: 'wood', oriented: true });
def(32, 'FURNACE', { name: 'Fornalha', tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front' }, hardness: 3.5, tool: 'pickaxe', tier: 1, oriented: true });
def(33, 'BOOKSHELF', { name: 'Estante', tex: { top: 'planks', bottom: 'planks', side: 'bookshelf' }, hardness: 1.5, tool: 'axe', sound: 'wood' });
def(34, 'TNT', { name: 'TNT', tex: { top: 'tnt_top', bottom: 'tnt_bottom', side: 'tnt_side' }, hardness: 0, sound: 'grass' });
def(35, 'WOOL_WHITE', { name: 'Lã branca', tex: 'wool_white', hardness: 0.8, sound: 'cloth' });
def(36, 'WOOL_RED', { name: 'Lã vermelha', tex: 'wool_red', hardness: 0.8, sound: 'cloth' });
def(37, 'WOOL_BLUE', { name: 'Lã azul', tex: 'wool_blue', hardness: 0.8, sound: 'cloth' });
def(38, 'WOOL_GREEN', { name: 'Lã verde', tex: 'wool_green', hardness: 0.8, sound: 'cloth' });
def(39, 'WOOL_YELLOW', { name: 'Lã amarela', tex: 'wool_yellow', hardness: 0.8, sound: 'cloth' });
def(40, 'WOOL_BLACK', { name: 'Lã preta', tex: 'wool_black', hardness: 0.8, sound: 'cloth' });
def(41, 'STONE_BRICKS', { name: 'Tijolos de pedra', tex: 'stone_bricks', hardness: 1.5, tool: 'pickaxe', tier: 1 });
def(42, 'MOSSY_COBBLE', { name: 'Pedregulho musgoso', tex: 'mossy_cobblestone', hardness: 2, tool: 'pickaxe', tier: 1 });
def(43, 'OBSIDIAN', { name: 'Obsidiana', tex: 'obsidian', hardness: 50, tool: 'pickaxe', tier: 4 });
def(44, 'ICE', { name: 'Gelo', tex: 'ice', opaque: false, translucent: true, cullSame: true, opacity: 2, hardness: 0.5, tool: 'pickaxe', sound: 'glass', drop: 0 });
def(45, 'CLAY', { name: 'Argila', tex: 'clay', hardness: 0.6, tool: 'shovel', sound: 'gravel' });
def(46, 'PUMPKIN', { name: 'Abóbora', tex: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin_side', front: 'pumpkin_face' }, hardness: 1, tool: 'axe', sound: 'wood', oriented: true });
def(47, 'GLOWSTONE', { name: 'Pedra luminosa', tex: 'glowstone', hardness: 0.3, light: 15, sound: 'glass' });
def(48, 'IRON_BLOCK', { name: 'Bloco de ferro', tex: 'iron_block', hardness: 5, tool: 'pickaxe', tier: 2 });
def(49, 'GOLD_BLOCK', { name: 'Bloco de ouro', tex: 'gold_block', hardness: 3, tool: 'pickaxe', tier: 3 });
def(50, 'DIAMOND_BLOCK', { name: 'Bloco de diamante', tex: 'diamond_block', hardness: 5, tool: 'pickaxe', tier: 3 });
def(51, 'BIRCH_PLANKS', { name: 'Tábuas de bétula', tex: 'birch_planks', hardness: 2, tool: 'axe', sound: 'wood' });
def(52, 'SPRUCE_PLANKS', { name: 'Tábuas de pinheiro', tex: 'spruce_planks', hardness: 2, tool: 'axe', sound: 'wood' });
def(53, 'DEAD_BUSH', { name: 'Arbusto morto', tex: 'dead_bush', render: 'cross', solid: false, opaque: false, cutout: true, hardness: 0, sound: 'grass', replaceable: true, needsSupport: true, drop: 256 });
def(54, 'SUGAR_CANE', { name: 'Cana-de-açúcar', tex: 'sugar_cane', render: 'cross', solid: false, opaque: false, cutout: true, hardness: 0, sound: 'grass', needsSupport: true });
def(55, 'FURNACE_LIT', { name: 'Fornalha acesa', tex: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front_on' }, hardness: 3.5, tool: 'pickaxe', tier: 1, oriented: true, light: 13, drop: 32 });
def(56, 'CHEST', { name: 'Baú', tex: { top: 'chest_top', bottom: 'chest_top', side: 'chest_side', front: 'chest_front' }, hardness: 2.5, tool: 'axe', sound: 'wood', oriented: true });
def(57, 'SAPLING', { name: 'Muda de carvalho', tex: 'sapling', render: 'cross', solid: false, opaque: false, cutout: true, hardness: 0, sound: 'grass', needsSupport: true });

// caixas de colisão para blocos que não ocupam o cubo inteiro (dependem do meta)
const H = (n) => n / 16;
const doorSide = (m) => (m & 4 ? ((m & 3) + 1) % 4 : m & 3);
const SIDE_BOX = [
  [0, 0, H(13), 1, 1, 1], // +z
  [0, 0, 0, H(3), 1, 1], // -x
  [0, 0, 0, 1, 1, H(3)], // -z
  [H(13), 0, 0, 1, 1, 1], // +x
];
def(58, 'FARMLAND', { name: 'Terra arada', tex: { top: 'farmland', bottom: 'dirt', side: 'dirt' }, hardness: 0.6, tool: 'shovel', sound: 'gravel', drop: 3 });
def(59, 'WHEAT', { name: 'Trigo (plantação)', tex: 'wheat_7', render: 'crop', solid: false, opaque: false, cutout: true, hardness: 0, sound: 'grass', needsSupport: true, drop: 270 });
def(60, 'LADDER', { name: 'Escada de mão', tex: 'ladder', render: 'ladder', solid: false, opaque: false, cutout: true, hardness: 0.4, tool: 'axe', sound: 'wood', needsSupport: true, climbable: true });
def(61, 'DOOR', {
  name: 'Porta de carvalho', tex: 'door_bottom', render: 'door', opaque: false, cutout: true, hardness: 3, tool: 'axe', sound: 'wood', needsSupport: true,
  boxes: (m) => [SIDE_BOX[doorSide(m)]],
});
def(62, 'BED', { name: 'Cama', tex: { top: 'bed_top_foot', bottom: 'planks', side: 'bed_side' }, render: 'bed', opaque: false, hardness: 0.2, sound: 'cloth', boxes: () => [[0, 0, 0, 1, H(9), 1]] });
def(63, 'FENCE', {
  name: 'Cerca de carvalho', tex: 'planks', render: 'fence', opaque: false, hardness: 2, tool: 'axe', sound: 'wood',
  boxes: (m, conn) => {
    const b = [[H(6), 0, H(6), H(10), 1.5, H(10)]];
    if (conn) {
      if (conn[0]) b.push([H(10), 0, H(6), 1, 1.5, H(10)]);
      if (conn[1]) b.push([0, 0, H(6), H(6), 1.5, H(10)]);
      if (conn[2]) b.push([H(6), 0, H(10), H(10), 1.5, 1]);
      if (conn[3]) b.push([H(6), 0, 0, H(10), 1.5, H(6)]);
    }
    return b;
  },
});
const slab = (id, key, name, base, tex, extra) =>
  def(id, key, { name, tex, render: 'slab', opaque: false, base, hardness: 2, tool: 'pickaxe', tier: 1, ...extra, boxes: (m) => [m ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1]] });
slab(64, 'STONE_SLAB', 'Laje de pedra', 1, 'stone');
slab(65, 'PLANK_SLAB', 'Laje de carvalho', 5, 'planks', { tool: 'axe', tier: 0, sound: 'wood' });
slab(66, 'COBBLE_SLAB', 'Laje de pedregulho', 4, 'cobblestone');
def(67, 'SNOW_LAYER', { name: 'Camada de neve', tex: 'snow', render: 'layer', solid: false, opaque: false, hardness: 0.1, tool: 'shovel', sound: 'snow', replaceable: true, needsSupport: true, drop: 0 });
def(68, 'RED_MUSHROOM', { name: 'Cogumelo vermelho', tex: 'red_mushroom', render: 'cross', solid: false, opaque: false, cutout: true, hardness: 0, sound: 'grass', needsSupport: true });
def(69, 'BROWN_MUSHROOM', { name: 'Cogumelo marrom', tex: 'brown_mushroom', render: 'cross', solid: false, opaque: false, cutout: true, hardness: 0, sound: 'grass', needsSupport: true, light: 1 });
def(70, 'MOSSY_STONE_BRICKS', { name: 'Tijolos de pedra musgosos', tex: 'mossy_stone_bricks', hardness: 1.5, tool: 'pickaxe', tier: 1 });
def(71, 'CRACKED_STONE_BRICKS', { name: 'Tijolos de pedra rachados', tex: 'cracked_stone_bricks', hardness: 1.5, tool: 'pickaxe', tier: 1 });
def(72, 'HAY', { name: 'Fardo de feno', tex: { top: 'hay_top', bottom: 'hay_top', side: 'hay_side' }, hardness: 0.5, sound: 'grass' });

export const BLOCK_COUNT = BLOCKS.length;

// ---------- Itens ----------
export const ITEMS = [];
export const I = {};

function item(id, key, props) {
  const it = { stack: 64, ...props, id, key, isItem: true };
  ITEMS[id] = it;
  I[key] = id;
  return it;
}

item(256, 'STICK', { name: 'Graveto', icon: 'stick', fuel: 100 });
item(257, 'COAL', { name: 'Carvão', icon: 'coal', fuel: 1600 });
item(258, 'IRON_INGOT', { name: 'Barra de ferro', icon: 'iron_ingot' });
item(259, 'GOLD_INGOT', { name: 'Barra de ouro', icon: 'gold_ingot' });
item(260, 'DIAMOND', { name: 'Diamante', icon: 'diamond' });
item(261, 'APPLE', { name: 'Maçã', icon: 'apple', food: 4, sat: 2.4 });
item(262, 'PORKCHOP', { name: 'Costeleta de porco crua', icon: 'porkchop', food: 3, sat: 1.8 });
item(263, 'COOKED_PORKCHOP', { name: 'Costeleta de porco assada', icon: 'cooked_porkchop', food: 8, sat: 12.8 });
item(264, 'BEEF', { name: 'Carne crua', icon: 'beef', food: 3, sat: 1.8 });
item(265, 'STEAK', { name: 'Bife', icon: 'steak', food: 8, sat: 12.8 });
item(266, 'ROTTEN_FLESH', { name: 'Carne podre', icon: 'rotten_flesh', food: 4, sat: 0.8 });
item(267, 'MUTTON', { name: 'Carne de carneiro crua', icon: 'mutton', food: 2, sat: 1.2 });
item(268, 'COOKED_MUTTON', { name: 'Carne de carneiro assada', icon: 'cooked_mutton', food: 6, sat: 9.6 });
item(269, 'BREAD', { name: 'Pão', icon: 'bread', food: 5, sat: 6 });
item(270, 'SEEDS', { name: 'Sementes de trigo', icon: 'seeds' });
item(271, 'WHEAT_ITEM', { name: 'Trigo', icon: 'wheat' });
item(272, 'BONE', { name: 'Osso', icon: 'bone' });
item(273, 'BONE_MEAL', { name: 'Farinha de osso', icon: 'bone_meal' });
item(274, 'ARROW', { name: 'Flecha', icon: 'arrow' });
item(275, 'BOW', { name: 'Arco', icon: 'bow', stack: 1, durability: 385, damage: 1, fuel: 300 });
item(276, 'BUCKET', { name: 'Balde', icon: 'bucket', stack: 16 });
item(277, 'WATER_BUCKET', { name: 'Balde de água', icon: 'water_bucket', stack: 1 });
item(278, 'LAVA_BUCKET', { name: 'Balde de lava', icon: 'lava_bucket', stack: 1, fuel: 20000 });
item(279, 'CHICKEN', { name: 'Frango cru', icon: 'chicken', food: 2, sat: 1.2 });
item(280, 'COOKED_CHICKEN', { name: 'Frango assado', icon: 'cooked_chicken', food: 6, sat: 7.2 });
item(281, 'FEATHER', { name: 'Pena', icon: 'feather' });
item(282, 'STRING', { name: 'Linha', icon: 'string' });
item(283, 'FLINT', { name: 'Pederneira', icon: 'flint' });
item(284, 'GUNPOWDER', { name: 'Pólvora', icon: 'gunpowder' });
item(285, 'EGG', { name: 'Ovo', icon: 'egg', stack: 16 });
item(286, 'DOOR_ITEM', { name: 'Porta de carvalho', icon: 'door', places: 61 });
item(287, 'BED_ITEM', { name: 'Cama', icon: 'bed', stack: 1, places: 62 });

export const TOOL_MATERIALS = {
  wood: { name: 'madeira', tier: 1, speed: 2, durability: 60, damage: 0, colors: ['#5d4320', '#8b6a38', '#b08d55'] },
  stone: { name: 'pedra', tier: 2, speed: 4, durability: 132, damage: 1, colors: ['#4a4a4a', '#7d7d7d', '#a3a3a3'] },
  iron: { name: 'ferro', tier: 3, speed: 6, durability: 251, damage: 2, colors: ['#6e6e6e', '#d8d8d8', '#ffffff'] },
  gold: { name: 'ouro', tier: 1, speed: 12, durability: 33, damage: 0, colors: ['#9a6a12', '#f5d13a', '#fffba0'] },
  diamond: { name: 'diamante', tier: 4, speed: 8, durability: 1562, damage: 3, colors: ['#137a6e', '#33ebcb', '#d2fff6'] },
};
const TOOL_TYPES = {
  pickaxe: { name: 'Picareta', damage: 2 },
  axe: { name: 'Machado', damage: 3 },
  shovel: { name: 'Pá', damage: 1 },
  sword: { name: 'Espada', damage: 4 },
};
let nextTool = 300;
for (const mat of Object.keys(TOOL_MATERIALS)) {
  for (const type of Object.keys(TOOL_TYPES)) {
    const m = TOOL_MATERIALS[mat];
    item(nextTool++, `${mat.toUpperCase()}_${type.toUpperCase()}`, {
      name: `${TOOL_TYPES[type].name} de ${m.name}`,
      icon: `${mat}_${type}`,
      stack: 1,
      tool: { type, material: mat, tier: m.tier, speed: m.speed },
      durability: m.durability,
      damage: TOOL_TYPES[type].damage + m.damage + 1,
      fuel: mat === 'wood' ? 200 : 0,
    });
  }
}

let nextHoe = 320;
for (const mat of Object.keys(TOOL_MATERIALS)) {
  const m = TOOL_MATERIALS[mat];
  item(nextHoe++, `${mat.toUpperCase()}_HOE`, {
    name: `Enxada de ${m.name}`,
    icon: `${mat}_hoe`,
    stack: 1,
    tool: { type: 'hoe', material: mat, tier: m.tier, speed: 1 },
    durability: m.durability,
    damage: 1,
    fuel: mat === 'wood' ? 200 : 0,
  });
}

export function info(id) {
  return id < 256 ? BLOCKS[id] : ITEMS[id];
}
export function isBlock(id) {
  return id > 0 && id < 256 && !!BLOCKS[id];
}
export function maxStack(id) {
  const i = info(id);
  return i ? i.stack : 64;
}
export function itemName(id) {
  const i = info(id);
  return i ? i.name : '?';
}

// Itens que aparecem no inventário do criativo, em ordem.
export const CREATIVE_LIST = [
  1, 4, 42, 41, 70, 71, 64, 66, 2, 3, 58, 19, 7, 26, 8, 45, 20, 67, 44, 6, 43,
  9, 22, 24, 5, 51, 52, 65, 63, 60, 10, 23, 25, 57,
  14, 15, 16, 17, 48, 49, 50, 18, 33, 11, 47, 34, 46, 72, 31, 32, 56, 30,
  35, 36, 37, 38, 39, 40, 21, 54, 27, 28, 29, 53, 68, 69, 12, 13,
  286, 287, 275, 274, 276, 277, 278, 270, 271, 272, 273, 281, 282, 283, 284, 285,
  256, 257, 258, 259, 260, 261, 269, 262, 263, 264, 265, 267, 268, 279, 280, 266,
  ...Object.keys(ITEMS).map(Number).filter((id) => ITEMS[id].tool),
];

// Tempo (em ticks) para quebrar o bloco com o item segurado.
export function breakTicks(blockId, heldId, inWater = false, onGround = true) {
  const b = BLOCKS[blockId];
  if (!b || b.hardness < 0) return Infinity;
  if (b.hardness === 0) return 0;
  const held = heldId >= 256 ? ITEMS[heldId] : null;
  const tool = held && held.tool;
  let speed = 1;
  if (tool && b.tool === tool.type) speed = tool.speed;
  if (tool && tool.type === 'sword' && (blockId === B.LEAVES || blockId === B.BIRCH_LEAVES || blockId === B.SPRUCE_LEAVES)) speed = 1.5;
  const harvest = canHarvest(blockId, heldId);
  let dmg = speed / b.hardness / (harvest ? 30 : 100);
  if (inWater) dmg /= 5;
  if (!onGround) dmg /= 5;
  return Math.ceil(1 / dmg);
}

export function canHarvest(blockId, heldId) {
  const b = BLOCKS[blockId];
  if (!b || b.tier === 0) return true;
  const held = heldId >= 256 ? ITEMS[heldId] : null;
  const tool = held && held.tool;
  return !!(tool && tool.type === 'pickaxe' && tool.tier >= b.tier);
}

// Receitas de fornalha e combustíveis.
export const SMELTING = {
  [B.SAND]: B.GLASS,
  [B.COBBLE]: B.STONE,
  [B.IRON_ORE]: 258,
  [B.GOLD_ORE]: 259,
  [B.LOG]: 257,
  [B.BIRCH_LOG]: 257,
  [B.SPRUCE_LOG]: 257,
  [B.CLAY]: B.BRICKS,
  [B.CACTUS]: B.WOOL_GREEN,
  262: 263,
  264: 265,
  267: 268,
  279: 280,
};
export function fuelTicks(id) {
  if (id < 256) {
    const b = BLOCKS[id];
    if (!b) return 0;
    if (b.sound === 'wood') return 300;
    if (id === B.SAPLING) return 100;
    return 0;
  }
  return ITEMS[id]?.fuel || 0;
}

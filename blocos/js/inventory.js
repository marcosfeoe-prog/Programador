// Inventário, receitas de criação (crafting) e fornalha.
import { B, I, ITEMS, info, maxStack, SMELTING, fuelTicks } from './blocks.js';

export const stack = (id, count = 1, damage = 0) => ({ id, count, damage });
export const cloneStack = (s) => (s ? { id: s.id, count: s.count, damage: s.damage || 0 } : null);

export class Inventory {
  constructor() {
    this.slots = new Array(36).fill(null); // 0–8 barra rápida, 9–35 mochila
    this.selected = 0;
    this.version = 0;
  }
  get held() {
    return this.slots[this.selected];
  }
  heldId() {
    const s = this.slots[this.selected];
    return s ? s.id : 0;
  }
  changed() {
    this.version++;
  }
  // devolve quantos não couberam
  add(id, count, damage = 0) {
    const ms = maxStack(id);
    const order = [...Array(36).keys()];
    for (const i of order) {
      const s = this.slots[i];
      if (s && s.id === id && s.count < ms && !(info(id).durability)) {
        const n = Math.min(ms - s.count, count);
        s.count += n;
        count -= n;
        if (!count) break;
      }
    }
    for (const i of order) {
      if (!count) break;
      if (!this.slots[i]) {
        const n = Math.min(ms, count);
        this.slots[i] = stack(id, n, damage);
        count -= n;
      }
    }
    this.changed();
    return count;
  }
  consumeSelected(n = 1) {
    const s = this.slots[this.selected];
    if (!s) return;
    s.count -= n;
    if (s.count <= 0) this.slots[this.selected] = null;
    this.changed();
  }
  // gasta durabilidade da ferramenta na mão; devolve true se quebrou
  damageHeld(n = 1) {
    const s = this.slots[this.selected];
    if (!s) return false;
    const it = info(s.id);
    if (!it.durability) return false;
    s.damage = (s.damage || 0) + n;
    this.changed();
    if (s.damage >= it.durability) {
      this.slots[this.selected] = null;
      return true;
    }
    return false;
  }
  count(id) {
    return this.slots.reduce((a, s) => a + (s && s.id === id ? s.count : 0), 0);
  }
  serialize() {
    return this.slots.map((s) => (s ? [s.id, s.count, s.damage || 0] : 0));
  }
  load(arr) {
    if (!arr) return;
    this.slots = arr.map((s) => (s && (info(s[0])) ? stack(s[0], s[1], s[2]) : null));
    while (this.slots.length < 36) this.slots.push(null);
    this.changed();
  }
}

// ---------- receitas ----------
const PLANKS = [B.PLANKS, B.BIRCH_PLANKS, B.SPRUCE_PLANKS];
const RECIPES = [];
const r = (p, k, out, count = 1) => RECIPES.push({ p, k, out, count });

r(['L'], { L: B.LOG }, B.PLANKS, 4);
r(['L'], { L: B.BIRCH_LOG }, B.BIRCH_PLANKS, 4);
r(['L'], { L: B.SPRUCE_LOG }, B.SPRUCE_PLANKS, 4);
r(['P', 'P'], { P: PLANKS }, I.STICK, 4);
r(['PP', 'PP'], { P: PLANKS }, B.CRAFTING_TABLE);
r(['C', 'S'], { C: I.COAL, S: I.STICK }, B.TORCH, 4);
r(['CCC', 'C C', 'CCC'], { C: B.COBBLE }, B.FURNACE);
r(['PPP', 'P P', 'PPP'], { P: PLANKS }, B.CHEST);
r(['SS', 'SS'], { S: B.SAND }, B.SANDSTONE);
r(['SS', 'SS'], { S: B.STONE }, B.STONE_BRICKS, 4);
r(['SS', 'SS'], { S: B.SNOW }, B.SNOW);
r(['PPP', 'BBB', 'PPP'], { P: PLANKS, B: I.STICK }, B.BOOKSHELF);
r(['SSS'], { S: B.WOOL_WHITE }, B.WOOL_WHITE, 3);
r(['P'], { P: B.PUMPKIN }, B.PUMPKIN);
r(['W', 'D'], { W: B.WOOL_WHITE, D: B.POPPY }, B.WOOL_RED);
r(['W', 'D'], { W: B.WOOL_WHITE, D: B.DANDELION }, B.WOOL_YELLOW);
r(['W', 'D'], { W: B.WOOL_WHITE, D: I.COAL }, B.WOOL_BLACK);
r(['W', 'D'], { W: B.WOOL_WHITE, D: B.CACTUS }, B.WOOL_GREEN);
r(['CM'], { C: B.COBBLE, M: B.LEAVES }, B.MOSSY_COBBLE);
for (const [blk, it] of [[B.IRON_BLOCK, I.IRON_INGOT], [B.GOLD_BLOCK, I.GOLD_INGOT], [B.DIAMOND_BLOCK, I.DIAMOND]]) {
  r(['XXX', 'XXX', 'XXX'], { X: it }, blk);
  r(['X'], { X: blk }, it, 9);
}
const WOOL = [B.WOOL_WHITE, B.WOOL_RED, B.WOOL_BLUE, B.WOOL_GREEN, B.WOOL_YELLOW, B.WOOL_BLACK];
r(['PP', 'PP', 'PP'], { P: PLANKS }, I.DOOR_ITEM, 3);
r(['WWW', 'PPP'], { W: WOOL, P: PLANKS }, I.BED_ITEM);
r(['S S', 'SSS', 'S S'], { S: I.STICK }, B.LADDER, 3);
r(['PSP', 'PSP'], { P: PLANKS, S: I.STICK }, B.FENCE, 3);
r(['SSS'], { S: B.STONE }, B.STONE_SLAB, 6);
r(['SSS'], { S: B.COBBLE }, B.COBBLE_SLAB, 6);
r(['SSS'], { S: PLANKS }, B.PLANK_SLAB, 6);
r(['I I', ' I '], { I: I.IRON_INGOT }, I.BUCKET);
r([' TS', 'T S', ' TS'], { T: I.STICK, S: I.STRING }, I.BOW);
r(['F', 'S', 'E'], { F: I.FLINT, S: I.STICK, E: I.FEATHER }, I.ARROW, 4);
r(['B'], { B: I.BONE }, I.BONE_MEAL, 3);
r(['GSG', 'SGS', 'GSG'], { G: I.GUNPOWDER, S: B.SAND }, B.TNT);
r(['WWW'], { W: I.WHEAT_ITEM }, I.BREAD);
r(['WWW', 'WWW', 'WWW'], { W: I.WHEAT_ITEM }, B.HAY);
r(['H'], { H: B.HAY }, I.WHEAT_ITEM, 9);
r(['SS', 'SS'], { S: I.STRING }, B.WOOL_WHITE);
const toolMats = { wood: PLANKS, stone: [B.COBBLE], iron: [I.IRON_INGOT], gold: [I.GOLD_INGOT], diamond: [I.DIAMOND] };
for (const [mat, ing] of Object.entries(toolMats)) {
  const k = { M: ing, S: I.STICK };
  const id = (t) => I[`${mat.toUpperCase()}_${t}`];
  r(['MMM', ' S ', ' S '], k, id('PICKAXE'));
  r(['MM', 'MS', ' S'], k, id('AXE'));
  r(['M', 'S', 'S'], k, id('SHOVEL'));
  r(['M', 'M', 'S'], k, id('SWORD'));
  r(['MM', ' S', ' S'], k, id('HOE'));
}

function trim(grid, size) {
  let x0 = size, y0 = size, x1 = -1, y1 = -1;
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if (grid[y * size + x]) {
      x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
    }
  }
  if (x1 < 0) return null;
  const w = x1 - x0 + 1, h = y1 - y0 + 1;
  const cells = [];
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) cells.push(grid[y * size + x]);
  return { w, h, cells };
}
function matches(rec, t, mirror) {
  const h = rec.p.length, w = Math.max(...rec.p.map((s) => s.length));
  if (w !== t.w || h !== t.h) return false;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const ch = rec.p[y][mirror ? w - 1 - x : x] || ' ';
    const cell = t.cells[y * w + x];
    if (ch === ' ') {
      if (cell) return false;
      continue;
    }
    if (!cell) return false;
    const want = rec.k[ch];
    if (Array.isArray(want) ? !want.includes(cell.id) : want !== cell.id) return false;
  }
  return true;
}
// grid: array de stacks (tamanho size×size) → { id, count } ou null
export function craftResult(grid, size) {
  const t = trim(grid, size);
  if (!t) return null;
  for (const rec of RECIPES) {
    if (matches(rec, t, false) || matches(rec, t, true)) return { id: rec.out, count: rec.count };
  }
  return null;
}

// ---------- fornalha ----------
export function newFurnace() {
  return { input: null, fuel: null, output: null, burn: 0, burnMax: 0, cook: 0 };
}
export function newChest() {
  return { slots: new Array(27).fill(null) };
}
export function tickFurnace(f) {
  const result = f.input ? SMELTING[f.input.id] : undefined;
  const canSmelt = result !== undefined && (!f.output || (f.output.id === result && f.output.count < maxStack(result)));
  const wasBurning = f.burn > 0;
  if (f.burn > 0) f.burn--;
  if (f.burn <= 0 && canSmelt && f.fuel && fuelTicks(f.fuel.id) > 0) {
    f.burnMax = f.burn = fuelTicks(f.fuel.id);
    f.fuel.count--;
    if (f.fuel.count <= 0) f.fuel = null;
  }
  if (f.burn > 0 && canSmelt) {
    if (++f.cook >= 200) {
      f.cook = 0;
      f.input.count--;
      if (f.input.count <= 0) f.input = null;
      if (f.output) f.output.count++;
      else f.output = stack(result, 1);
    }
  } else f.cook = Math.max(0, f.cook - 2);
  return wasBurning !== f.burn > 0;
}
export function serializeTile(t) {
  const s = (x) => (x ? [x.id, x.count, x.damage || 0] : 0);
  if (t.slots) return { slots: t.slots.map(s) };
  return { input: s(t.input), fuel: s(t.fuel), output: s(t.output), burn: t.burn, burnMax: t.burnMax, cook: t.cook };
}
export function loadTile(d) {
  const l = (x) => (x ? stack(x[0], x[1], x[2]) : null);
  if (d.slots) return { slots: d.slots.map(l) };
  return { input: l(d.input), fuel: l(d.fuel), output: l(d.output), burn: d.burn || 0, burnMax: d.burnMax || 0, cook: d.cook || 0 };
}

export { ITEMS };

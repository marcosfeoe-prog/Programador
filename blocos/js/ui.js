// Interface: HUD, inventários (sobrevivência, criativo, bancada, fornalha, baú) e menus.
import * as THREE from 'three';
import { iconDataURL, tileCanvas } from './textures.js';
import { info, itemName, CREATIVE_LIST, BLOCKS, maxStack, SMELTING, fuelTicks } from './blocks.js';
import { craftResult, cloneStack, stack } from './inventory.js';
import { HumanoidModel } from './models.js';

const $ = (id) => document.getElementById(id);
const el = (tag, cls, parent) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.appendChild(e);
  return e;
};

// ---------- ícones 9×9 do HUD ----------
function pix(rows, pal) {
  const c = document.createElement('canvas');
  c.width = c.height = 9;
  const g = c.getContext('2d');
  rows.forEach((r, y) => [...r].forEach((ch, x) => {
    if (pal[ch]) {
      g.fillStyle = pal[ch];
      g.fillRect(x, y, 1, 1);
    }
  }));
  return c.toDataURL();
}
const HEART = ['.OO...OO.', 'OrrO.OrrO', 'OrwrOrrrO', 'OrrrrrrrO', 'OrrrrrrrO', '.OrrrrrO.', '..OrrrO..', '...OrO...', '....O....'];
const HEART_HALF = HEART.map((r) => [...r].map((ch, x) => (x > 4 && (ch === 'r' || ch === 'w') ? 'd' : ch)).join(''));
const FOOD = ['......OO.', '.....OwwO', '....OwwO.', '..OOOwO..', '.OmMmO...', 'OmMmmmO..', 'OmmmmmO..', '.OmmmO...', '..OOO....'];
const FOOD_HALF = FOOD.map((r) => [...r].map((ch, x) => (x < 4 && (ch === 'm' || ch === 'M') ? 'd' : ch)).join(''));
const BUBBLE = ['..OOOOO..', '.OaaaaaO.', 'OawwaaaaO', 'OawaaaaaO', 'OaaaaaaaO', 'OaaaaaaaO', 'OaaaaaaaO', '.OaaaaaO.', '..OOOOO..'];
const BUBBLE_POP = ['.........', '..O...O..', '...O.O...', '.........', '..O...O..', '.........', '...O.O...', '..O...O..', '.........'];
let ICONS = null;
function hudIcons() {
  if (ICONS) return ICONS;
  const pr = { O: '#000', r: '#d81818', w: '#ff9c9c', d: '#3a0e0e' };
  const pf = { O: '#2a1405', m: '#b8662a', M: '#e09048', w: '#e8e2d0', d: '#3a2410' };
  const pb = { O: '#1d3dbd', a: '#3b8cff', w: '#ffffff' };
  ICONS = {
    heart: pix(HEART, pr),
    heartHalf: pix(HEART_HALF, pr),
    heartEmpty: pix(HEART, { O: '#000', r: '#3a0e0e', w: '#3a0e0e' }),
    heartFlash: pix(HEART, { O: '#fff', r: '#3a0e0e', w: '#3a0e0e' }),
    food: pix(FOOD, pf),
    foodHalf: pix(FOOD_HALF, pf),
    foodEmpty: pix(FOOD, { O: '#000', m: '#3a2410', M: '#3a2410', w: '#3a2410' }),
    bubble: pix(BUBBLE, pb),
    bubblePop: pix(BUBBLE_POP, { O: '#7fb7ff' }),
  };
  return ICONS;
}

// ---------- logotipo em blocos ----------
const FONT = {
  B: ['1111.', '1...1', '1111.', '1...1', '1111.'],
  L: ['1....', '1....', '1....', '1....', '11111'],
  O: ['.111.', '1...1', '1...1', '1...1', '.111.'],
  C: ['.1111', '1....', '1....', '1....', '.1111'],
  S: ['.1111', '1....', '.111.', '....1', '1111.'],
};
export function paintLogo(canvas) {
  const g = canvas.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.clearRect(0, 0, canvas.width, canvas.height);
  const word = 'BLOCOS';
  const px = 14, gap = px;
  const totalW = word.length * 5 * px + (word.length - 1) * gap;
  let x0 = (canvas.width - totalW) / 2;
  const y0 = 18;
  const stone = tileCanvas('cobblestone');
  const depth = 6;
  for (const ch of word) {
    const rows = FONT[ch];
    // sombra/extrusão
    for (let pass = 0; pass < 2; pass++) {
      rows.forEach((r, y) => [...r].forEach((v, x) => {
        if (v !== '1') return;
        const X = x0 + x * px, Y = y0 + y * px;
        if (pass === 0) {
          g.fillStyle = '#1e1e1e';
          for (let d = 1; d <= depth; d++) g.fillRect(X + d, Y + d, px, px);
        } else {
          g.drawImage(stone, 0, 0, 16, 16, X, Y, px, px);
          g.fillStyle = 'rgba(255,255,255,0.18)';
          g.fillRect(X, Y, px, 2);
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fillRect(X, Y + px - 2, px, 2);
        }
      }));
    }
    x0 += 5 * px + gap;
  }
}

export class UI {
  constructor(game) {
    this.game = game;
    this.screen = null;
    this.carried = null;
    this.hover = null;
    this.mouse = { x: 0, y: 0 };
    this.slotEls = [];
    this.itemNameTimer = 0;
    this.chatLines = [];
    this.lastInvVersion = -1;
    this.buildHotbar();
    this.buildStats();
    $('container-screen').addEventListener('mousedown', (e) => {
      if (e.target === $('container-screen')) this.dropCarried(e.button === 2);
    });
    window.addEventListener('mousemove', (e) => {
      this.mouse.x = e.clientX;
      this.mouse.y = e.clientY;
      if (this.screen && this.isContainer()) this.positionCarried();
    });
    this.setGuiScale();
    window.addEventListener('resize', () => this.setGuiScale());
    // fundo de terra dos menus
    const dirt = tileCanvas('dirt');
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    c.getContext('2d').drawImage(dirt, 0, 0);
    document.documentElement.style.setProperty('--dirt', `url(${c.toDataURL()})`);
    paintLogo($('logo'));
  }

  setGuiScale() {
    const w = window.innerWidth, h = window.innerHeight;
    const pref = this.game.settings.guiScale || 0;
    let s = Math.max(1, Math.min(4, Math.floor(Math.min(w / 320, h / 240))));
    if (pref) s = Math.min(s, pref);
    // em telas de toque usa escala fracionária para os botões e slots não ficarem minúsculos
    if (this.game.input && this.game.input.isTouch) s = Math.max(1.5, Math.floor(Math.min(w / 320, h / 220) * 2) / 2);
    this.scale = s;
    document.documentElement.style.setProperty('--s', s + 'px');
  }

  isContainer() {
    return ['inventory', 'creative', 'crafting', 'furnace', 'chest'].includes(this.screen);
  }

  // ---------- HUD ----------
  buildHotbar() {
    const hb = $('hotbar');
    this.hotbarEls = [];
    for (let i = 0; i < 9; i++) {
      const s = this.makeSlotEl(hb);
      s.addEventListener('click', () => {
        this.game.player.inventory.selected = i;
        this.game.player.inventory.changed();
      });
      this.hotbarEls.push(s);
    }
  }
  buildStats() {
    const mk = (id) => {
      const parent = $(id);
      const arr = [];
      for (let i = 0; i < 10; i++) {
        const d = el('div', 'icon9', parent);
        arr.push(d);
      }
      return arr;
    };
    this.heartEls = mk('hearts');
    this.foodEls = mk('hunger');
    this.airEls = mk('air');
  }
  makeSlotEl(parent) {
    const s = el('div', 'slot', parent);
    s._img = el('img', '', s);
    s._img.style.display = 'none';
    s._count = el('span', 'count', s);
    s._dur = el('div', 'dur', s);
    s._dur.appendChild(document.createElement('i'));
    s._dur.style.display = 'none';
    s._key = '';
    return s;
  }
  paintSlot(s, st) {
    const key = st ? `${st.id}:${st.count}:${st.damage || 0}` : '';
    if (key === s._key) return;
    s._key = key;
    if (!st) {
      s._img.style.display = 'none';
      s._count.textContent = '';
      s._dur.style.display = 'none';
      return;
    }
    s._img.style.display = '';
    s._img.src = iconDataURL(st.id);
    s._img.className = st.id >= 256 || (BLOCKS[st.id] && BLOCKS[st.id].render !== 'cube') ? 'item' : '';
    s._count.textContent = st.count > 1 ? st.count : '';
    const it = info(st.id);
    if (it.durability && st.damage) {
      const f = 1 - st.damage / it.durability;
      s._dur.style.display = '';
      const bar = s._dur.firstChild;
      bar.style.width = f * 100 + '%';
      bar.style.background = `hsl(${f * 120}, 100%, 50%)`;
    } else s._dur.style.display = 'none';
  }

  updateHUD(p, flashHearts) {
    const inv = p.inventory;
    for (let i = 0; i < 9; i++) {
      this.paintSlot(this.hotbarEls[i], inv.slots[i]);
      this.hotbarEls[i].classList.toggle('sel', i === inv.selected);
    }
    if (inv.version !== this.lastInvVersion) {
      const held = inv.held;
      const key = held ? held.id + ':' + inv.selected : 'none:' + inv.selected;
      if (key !== this._lastHeldKey) {
        this._lastHeldKey = key;
        if (held) this.showItemName(itemName(held.id));
        else $('item-name').style.opacity = 0;
      }
      this.lastInvVersion = inv.version;
    }
    const survival = p.mode === 'survival';
    $('stats').style.visibility = survival ? 'visible' : 'hidden';
    if (survival) {
      const ic = hudIcons();
      const low = p.health <= 4;
      for (let i = 0; i < 10; i++) {
        const hv = p.health - i * 2;
        const e = this.heartEls[i];
        const img = hv >= 2 ? ic.heart : hv === 1 ? ic.heartHalf : null;
        const bg = flashHearts ? ic.heartFlash : ic.heartEmpty;
        e.style.backgroundImage = img ? `url(${img}), url(${bg})` : `url(${bg})`;
        e.classList.toggle('shake', low && (i + Math.floor(performance.now() / 120)) % 3 === 0);
        const fv = p.food - i * 2;
        const f = this.foodEls[i];
        const fimg = fv >= 2 ? ic.food : fv === 1 ? ic.foodHalf : null;
        f.style.backgroundImage = fimg ? `url(${fimg}), url(${ic.foodEmpty})` : `url(${ic.foodEmpty})`;
        f.classList.toggle('shake', p.saturation <= 0 && p.food <= 6 && (i + Math.floor(performance.now() / 150)) % 4 === 0);
      }
      const showAir = p.eyesInWater || p.air < 300;
      $('air').style.display = showAir ? 'flex' : 'none';
      if (showAir) {
        const full = Math.ceil((Math.max(0, p.air) * 10) / 300);
        for (let i = 0; i < 10; i++) {
          this.airEls[i].style.backgroundImage = i < full ? `url(${ic.bubble})` : i === full ? `url(${ic.bubblePop})` : 'none';
        }
      }
    }
    if (this.itemNameTimer > 0) {
      this.itemNameTimer -= 1 / 60;
      if (this.itemNameTimer <= 0) $('item-name').style.opacity = 0;
    }
    const now = performance.now();
    for (const l of this.chatLines) {
      if (this.screen === 'chat') l.el.style.opacity = 1;
      else l.el.style.opacity = now - l.t > 9000 ? 0 : 1;
    }
  }
  showItemName(name) {
    const n = $('item-name');
    n.textContent = name;
    n.style.opacity = 1;
    this.itemNameTimer = 2.5;
  }
  addChat(text, color) {
    const log = $('chat-log');
    const d = el('div', '', log);
    d.textContent = text;
    if (color) d.style.color = color;
    this.chatLines.push({ el: d, t: performance.now() });
    while (this.chatLines.length > 10) this.chatLines.shift().el.remove();
  }

  // ---------- telas de menu ----------
  showMenu(id) {
    for (const s of ['title', 'worlds', 'create', 'options', 'controls', 'loading', 'pause', 'death']) $(s).classList.toggle('hidden', s !== id);
  }

  // ---------- inventários ----------
  openContainer(kind, data) {
    const game = this.game;
    game.input.unlock();
    this.screen = kind;
    this.containerData = data;
    this.slotEls = [];
    const root = $('container');
    root.innerHTML = '';
    const inv = game.player.inventory;
    const invRef = (i) => ({ inv: true, index: i, get: () => inv.slots[i], set: (s) => { inv.slots[i] = s; inv.changed(); }, accept: () => true });
    const playerInventory = () => {
      const main = el('div', 'grid', root);
      main.style.gridTemplateColumns = 'repeat(9, auto)';
      for (let i = 9; i < 36; i++) this.addSlot(main, invRef(i));
      const hb = el('div', 'grid', root);
      hb.style.gridTemplateColumns = 'repeat(9, auto)';
      hb.style.marginTop = 'calc(var(--s) * 4)';
      for (let i = 0; i < 9; i++) this.addSlot(hb, invRef(i));
    };
    const craftingArea = (size, parent) => {
      this.craftSize = size;
      this.craftGrid = new Array(size * size).fill(null);
      this.craftOut = null;
      const row = el('div', 'row', parent);
      const grid = el('div', 'grid', row);
      grid.style.gridTemplateColumns = `repeat(${size}, auto)`;
      for (let k = 0; k < size * size; k++) {
        this.addSlot(grid, { craft: true, get: () => this.craftGrid[k], set: (s) => { this.craftGrid[k] = s; this.updateCraft(); }, accept: () => true });
      }
      el('div', 'arrow', row);
      const outSlot = this.addSlot(row, {
        output: true,
        get: () => this.craftOut,
        take: () => {
          for (let k = 0; k < this.craftGrid.length; k++) {
            const s = this.craftGrid[k];
            if (s) {
              s.count--;
              if (s.count <= 0) this.craftGrid[k] = null;
            }
          }
          this.updateCraft();
        },
      });
      outSlot.style.width = outSlot.style.height = 'calc(var(--s) * 26)';
    };

    if (kind === 'inventory') {
      el('div', 'gui-title', root).textContent = 'Criação';
      const top = el('div', 'row', root);
      const pv = el('div', 'player-view', top);
      this.attachPreview(pv);
      const right = el('div', '', top);
      right.style.marginLeft = 'calc(var(--s) * 20)';
      craftingArea(2, right);
      el('div', 'gui-title', root).textContent = 'Inventário';
      playerInventory();
    } else if (kind === 'crafting') {
      el('div', 'gui-title', root).textContent = 'Criação';
      const wrap = el('div', '', root);
      wrap.style.padding = '0 calc(var(--s) * 20)';
      craftingArea(3, wrap);
      el('div', 'gui-title', root).textContent = 'Inventário';
      playerInventory();
    } else if (kind === 'furnace') {
      const f = data.tile;
      el('div', 'gui-title', root).textContent = 'Fornalha';
      const row = el('div', 'row', root);
      row.style.padding = '0 calc(var(--s) * 30)';
      const col = el('div', '', row);
      col.style.display = 'flex';
      col.style.flexDirection = 'column';
      col.style.alignItems = 'center';
      col.style.gap = 'calc(var(--s) * 2)';
      this.addSlot(col, { get: () => f.input, set: (s) => (f.input = s), accept: () => true, furnace: 'input' });
      const flame = el('div', 'flame', col);
      this.flameFill = el('i', '', flame);
      this.addSlot(col, { get: () => f.fuel, set: (s) => (f.fuel = s), accept: (s) => fuelTicks(s.id) > 0, furnace: 'fuel' });
      const arrow = el('div', 'arrow', row);
      this.arrowFill = el('div', 'fill', arrow);
      const out = this.addSlot(row, { get: () => f.output, set: (s) => (f.output = s), accept: () => false, furnace: 'output' });
      out.style.width = out.style.height = 'calc(var(--s) * 26)';
      el('div', 'gui-title', root).textContent = 'Inventário';
      playerInventory();
    } else if (kind === 'chest') {
      const c = data.tile;
      el('div', 'gui-title', root).textContent = 'Baú';
      const g = el('div', 'grid', root);
      g.style.gridTemplateColumns = 'repeat(9, auto)';
      for (let i = 0; i < 27; i++) this.addSlot(g, { chest: true, get: () => c.slots[i], set: (s) => (c.slots[i] = s), accept: () => true });
      el('div', 'gui-title', root).textContent = 'Inventário';
      playerInventory();
    } else if (kind === 'creative') {
      this.buildCreative(root, invRef);
    }
    $('container-screen').classList.remove('hidden');
    this.refreshContainer();
    this.positionCarried();
    game.input.enabled = false;
  }

  buildCreative(root, invRef) {
    const tabs = el('div', 'tabs', root);
    const tabNames = [['blocks', 'Blocos'], ['items', 'Itens e ferramentas'], ['search', 'Pesquisar'], ['inv', 'Inventário']];
    this.creativeTab = this.creativeTab || 'blocks';
    for (const [k, label] of tabNames) {
      const t = el('button', 'tab' + (k === this.creativeTab ? ' on' : ''), tabs);
      t.textContent = label;
      t.addEventListener('click', () => {
        this.creativeTab = k;
        this.openContainer('creative');
      });
    }
    const body = el('div', '', root);
    if (this.creativeTab === 'inv') {
      const top = el('div', 'row', body);
      const pv = el('div', 'player-view', top);
      this.attachPreview(pv);
      const g = el('div', 'grid', root);
      g.style.gridTemplateColumns = 'repeat(9, auto)';
      for (let i = 9; i < 36; i++) this.addSlot(g, invRef(i));
    } else {
      let list = CREATIVE_LIST;
      if (this.creativeTab === 'blocks') list = list.filter((id) => id < 256);
      else if (this.creativeTab === 'items') list = list.filter((id) => id >= 256);
      if (this.creativeTab === 'search') {
        const inp = el('input', 'search', body);
        inp.placeholder = 'Pesquisar...';
        inp.value = this.searchText || '';
        const q = (this.searchText || '').toLowerCase();
        list = list.filter((id) => itemName(id).toLowerCase().includes(q));
        inp.addEventListener('input', () => {
          this.searchText = inp.value;
          this.openContainer('creative');
          const ni = document.querySelector('#container .search');
          if (ni) {
            ni.focus();
            ni.setSelectionRange(ni.value.length, ni.value.length);
          }
        });
        inp.addEventListener('keydown', (e) => e.stopPropagation());
      }
      const g = el('div', 'grid creative-grid', body);
      g.style.gridTemplateColumns = 'repeat(9, auto)';
      for (const id of list) this.addSlot(g, { palette: true, id, get: () => stack(id, 1) });
    }
    const row = el('div', 'row', root);
    row.style.marginTop = 'calc(var(--s) * 4)';
    const hb = el('div', 'grid', row);
    hb.style.gridTemplateColumns = 'repeat(9, auto)';
    for (let i = 0; i < 9; i++) this.addSlot(hb, invRef(i));
    const trash = this.addSlot(row, { trash: true, get: () => null });
    trash.classList.add('trash');
    trash.title = 'Destruir item';
    trash.appendChild(document.createTextNode('✕'));
  }

  addSlot(parent, ref) {
    const s = this.makeSlotEl(parent);
    s.ref = ref;
    s.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.clickSlot(ref, e.button, e.shiftKey);
      this.game.audio.play('click');
    });
    s.addEventListener('mouseenter', () => {
      this.hover = s;
      this.showTooltip(s);
    });
    s.addEventListener('mouseleave', () => {
      if (this.hover === s) this.hover = null;
      $('tooltip').classList.add('hidden');
    });
    this.slotEls.push(s);
    return s;
  }
  showTooltip(s) {
    const st = s.ref.get();
    const tt = $('tooltip');
    if (!st || this.carried) return tt.classList.add('hidden');
    const it = info(st.id);
    tt.textContent = itemName(st.id) + (it.durability ? `  (${it.durability - (st.damage || 0)}/${it.durability})` : '');
    tt.classList.remove('hidden');
    const r = s.getBoundingClientRect();
    tt.style.left = r.right + 4 + 'px';
    tt.style.top = r.top - 4 + 'px';
  }

  updateCraft() {
    const r = craftResult(this.craftGrid, this.craftSize);
    this.craftOut = r ? stack(r.id, r.count) : null;
  }

  clickSlot(ref, button, shift) {
    const inv = this.game.player.inventory;
    const stackable = (s) => !info(s.id).durability;
    if (ref.palette) {
      const id = ref.id;
      if (this.carried) this.carried = null;
      else if (shift) inv.add(id, maxStack(id));
      else this.carried = stack(id, button === 2 ? 1 : maxStack(id));
      return this.refreshContainer();
    }
    if (ref.trash) {
      if (shift && !this.carried) {
        for (let i = 0; i < 36; i++) inv.slots[i] = null;
        inv.changed();
      }
      this.carried = null;
      return this.refreshContainer();
    }
    if (ref.output) {
      const out = ref.get();
      if (!out) return;
      if (shift) {
        for (let n = 0; n < 64 && ref.get(); n++) {
          const o = ref.get();
          if (inv.add(o.id, o.count)) break;
          ref.take();
        }
      } else if (!this.carried) {
        this.carried = cloneStack(out);
        ref.take();
      } else if (this.carried.id === out.id && stackable(out) && this.carried.count + out.count <= maxStack(out.id)) {
        this.carried.count += out.count;
        ref.take();
      }
      return this.refreshContainer();
    }
    const s = ref.get();
    if (shift) {
      if (s) this.quickMove(ref);
      return this.refreshContainer();
    }
    const c = this.carried;
    if (button === 0) {
      if (!c) {
        if (s) {
          this.carried = s;
          ref.set(null);
        }
      } else if (!s) {
        if (ref.accept(c)) {
          ref.set(c);
          this.carried = null;
        }
      } else if (s.id === c.id && stackable(s) && ref.accept(c)) {
        const n = Math.min(maxStack(s.id) - s.count, c.count);
        s.count += n;
        c.count -= n;
        ref.set(s);
        if (c.count <= 0) this.carried = null;
      } else if (ref.accept(c)) {
        ref.set(c);
        this.carried = s;
      }
    } else {
      if (!c) {
        if (s) {
          const half = Math.ceil(s.count / 2);
          this.carried = { ...s, count: half };
          s.count -= half;
          ref.set(s.count > 0 ? s : null);
        }
      } else if (!s) {
        if (ref.accept(c)) {
          ref.set({ ...c, count: 1 });
          c.count--;
          if (c.count <= 0) this.carried = null;
        }
      } else if (s.id === c.id && stackable(s) && s.count < maxStack(s.id) && ref.accept(c)) {
        s.count++;
        c.count--;
        ref.set(s);
        if (c.count <= 0) this.carried = null;
      } else if (ref.accept(c)) {
        ref.set(c);
        this.carried = s;
      }
    }
    this.refreshContainer();
  }

  // Shift+clique: move a pilha entre as áreas
  quickMove(ref) {
    const inv = this.game.player.inventory;
    const s = ref.get();
    if (!s) return;
    const targets = (pred) => this.slotEls.map((e) => e.ref).filter(pred);
    let dest;
    if (ref.inv) {
      if (this.screen === 'chest') dest = targets((r) => r.chest);
      else if (this.screen === 'furnace') {
        if (SMELTING[s.id] !== undefined) dest = targets((r) => r.furnace === 'input');
        else if (fuelTicks(s.id) > 0) dest = targets((r) => r.furnace === 'fuel');
        else dest = targets((r) => r.inv && (ref.index < 9 ? r.index >= 9 : r.index < 9));
      } else dest = targets((r) => r.inv && (ref.index < 9 ? r.index >= 9 : r.index < 9));
    } else {
      dest = targets((r) => r.inv);
      // a barra rápida recebe por último quando vem de um contêiner, como no original
      dest.sort((a, b) => (b.index >= 9) - (a.index >= 9));
    }
    let left = s.count;
    const ms = maxStack(s.id);
    const durable = !!info(s.id).durability;
    if (!durable) for (const r of dest) {
      const t = r.get();
      if (t && t.id === s.id && t.count < ms) {
        const n = Math.min(ms - t.count, left);
        t.count += n;
        left -= n;
        r.set(t);
        if (!left) break;
      }
    }
    for (const r of dest) {
      if (!left) break;
      if (!r.get() && r.accept(s)) {
        r.set({ ...s, count: Math.min(ms, left) });
        left -= Math.min(ms, left);
      }
    }
    if (left) {
      s.count = left;
      ref.set(s);
    } else ref.set(null);
    inv.changed();
  }

  // tecla numérica sobre um slot: troca com a barra rápida
  hotkeySwap(n) {
    if (!this.hover || !this.hover.ref) return;
    const ref = this.hover.ref;
    const inv = this.game.player.inventory;
    if (ref.palette) {
      inv.slots[n] = stack(ref.id, maxStack(ref.id));
    } else if (ref.output) {
      const o = ref.get();
      if (o && !inv.slots[n]) {
        inv.slots[n] = cloneStack(o);
        ref.take();
      }
    } else if (!ref.trash) {
      const a = ref.get();
      const b = inv.slots[n];
      if (b && !ref.accept(b)) return;
      inv.slots[n] = a;
      ref.set(b);
    }
    inv.changed();
    this.refreshContainer();
  }

  refreshContainer() {
    for (const s of this.slotEls) {
      if (s.ref.trash) continue;
      this.paintSlot(s, s.ref.get());
    }
    const c = $('carried');
    if (this.carried) {
      c.classList.remove('hidden');
      c.innerHTML = '';
      const img = el('img', '', c);
      img.src = iconDataURL(this.carried.id);
      if (this.carried.count > 1) el('span', 'count', c).textContent = this.carried.count;
      $('tooltip').classList.add('hidden');
    } else c.classList.add('hidden');
    if (this.screen === 'furnace' && this.containerData) {
      const f = this.containerData.tile;
      this.arrowFill.style.width = (f.cook / 200) * 100 + '%';
      this.flameFill.style.height = (f.burnMax ? (f.burn / f.burnMax) * 100 : 0) + '%';
    }
  }
  positionCarried() {
    const c = $('carried');
    c.style.left = this.mouse.x + 'px';
    c.style.top = this.mouse.y + 'px';
  }

  dropCarried(one) {
    if (!this.carried) return;
    const p = this.game.player;
    const n = one ? 1 : this.carried.count;
    const d = p.lookDir();
    const e = this.game.entities.spawnItem(p.x, p.y + 1.3, p.z, this.carried.id, n, 40);
    if (e) {
      e.vx = d[0] * 0.3;
      e.vz = d[2] * 0.3;
      e.damage = this.carried.damage;
    }
    this.carried.count -= n;
    if (this.carried.count <= 0) this.carried = null;
    this.refreshContainer();
  }

  closeContainer() {
    const p = this.game.player;
    const give = (s) => {
      if (!s) return;
      const left = p.inventory.add(s.id, s.count, s.damage || 0);
      if (left) this.game.entities.spawnItem(p.x, p.y + 1.3, p.z, s.id, left, 40);
    };
    if (this.carried) give(this.carried);
    this.carried = null;
    if (this.craftGrid) for (const s of this.craftGrid) give(s);
    this.craftGrid = null;
    this.craftOut = null;
    this.containerData = null;
    $('container-screen').classList.add('hidden');
    $('tooltip').classList.add('hidden');
    this.detachPreview();
    this.screen = null;
  }

  openInventory() {
    this.openContainer(this.game.player.mode === 'creative' ? 'creative' : 'inventory');
  }
  openCrafting() {
    this.openContainer('crafting');
  }
  openFurnace(x, y, z) {
    const w = this.game.world;
    const key = `${x},${y},${z}`;
    if (!w.tileEntities.has(key)) w.tileEntities.set(key, this.game.newFurnace());
    this.openContainer('furnace', { tile: w.tileEntities.get(key), pos: [x, y, z] });
  }
  openChest(x, y, z) {
    const w = this.game.world;
    const key = `${x},${y},${z}`;
    if (!w.tileEntities.has(key)) w.tileEntities.set(key, this.game.newChest());
    this.game.audio.play('chest', { x, y, z });
    this.openContainer('chest', { tile: w.tileEntities.get(key), pos: [x, y, z] });
  }

  // ---------- prévia 3D do jogador no inventário ----------
  attachPreview(parent) {
    if (!this.preview) {
      const canvas = document.createElement('canvas');
      const r = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false });
      r.outputColorSpace = THREE.LinearSRGBColorSpace;
      const scene = new THREE.Scene();
      const cam = new THREE.PerspectiveCamera(30, 52 / 72, 0.1, 20);
      cam.position.set(0, 1.1, 5);
      cam.lookAt(0, 0.95, 0);
      const model = new HumanoidModel('steve');
      scene.add(model.root);
      this.preview = { canvas, r, scene, cam, model };
    }
    parent.appendChild(this.preview.canvas);
    this.previewOn = true;
  }
  detachPreview() {
    this.previewOn = false;
    if (this.preview && this.preview.canvas.parentNode) this.preview.canvas.parentNode.removeChild(this.preview.canvas);
  }
  renderPreview(time) {
    if (!this.previewOn || !this.preview) return;
    const { canvas, r, scene, cam, model } = this.preview;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    if (canvas.width !== w || canvas.height !== h) {
      r.setSize(w, h, false);
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
    }
    const rect = canvas.getBoundingClientRect();
    const mx = (this.mouse.x - (rect.left + rect.width / 2)) / 120;
    const my = (this.mouse.y - (rect.top + rect.height * 0.25)) / 120;
    const p = this.game.player;
    model.setHeld(p.inventory.heldId());
    model.root.rotation.y = Math.atan(mx) * 0.6;
    model.animate({ limbSwing: 0, limbAmount: 0, headYaw: Math.atan(mx) * 0.6, headPitch: -Math.atan(my) * 0.8, swing: 0, sneak: false, age: time * 20 });
    model.setLight(1, false);
    r.render(scene, cam);
  }
}

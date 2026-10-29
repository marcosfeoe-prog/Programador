'use strict';
// Estado do jogo, simulação e regras.

const G = {};
let nextId = 1;

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const dist2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;
function angleLerp(a, b, t) {
  let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI;
  return a + d * t;
}

// ---------- Mundo ----------
const RES_BUCKET = 256;
function genResources(seed) {
  const rnd = mulberry32(seed);
  const list = [];
  const grid = new Map();
  const key = (x, y) => Math.floor(x / RES_BUCKET) + Math.floor(y / RES_BUCKET) * 1000;
  function fits(x, y, r) {
    if (x < r + 60 || y < r + 60 || x > WORLD - r - 60 || y > WORLD - r - 60) return false;
    const bx = Math.floor(x / RES_BUCKET), by = Math.floor(y / RES_BUCKET);
    for (let j = by - 1; j <= by + 1; j++) for (let i = bx - 1; i <= bx + 1; i++) {
      for (const o of grid.get(i + j * 1000) || []) {
        if (dist2(x, y, o.x, o.y) < (r + o.r + 40) ** 2) return false;
      }
    }
    return true;
  }
  function add(type, x, y, r) {
    if (!fits(x, y, r)) return;
    const o = { id: nextId++, type, x, y, r, wob: 0, wobA: 0 };
    o.shape = type === 'tree' ? makeTreeShape(r, rnd) : makeStoneShape(r, rnd);
    list.push(o);
    const k = key(x, y);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(o);
  }
  // aglomerados
  for (let c = 0; c < 110; c++) {
    const cx = rnd() * WORLD, cy = rnd() * WORLD;
    const type = rnd() < 0.6 ? 'tree' : 'stone';
    const n = 3 + Math.floor(rnd() * 5);
    for (let i = 0; i < n; i++) {
      const r = type === 'tree' ? 70 + rnd() * 45 : 50 + rnd() * 35;
      add(type, cx + (rnd() - 0.5) * 520, cy + (rnd() - 0.5) * 520, r);
    }
  }
  for (let i = 0; i < 380; i++) add('tree', rnd() * WORLD, rnd() * WORLD, 70 + rnd() * 45);
  for (let i = 0; i < 260; i++) add('stone', rnd() * WORLD, rnd() * WORLD, 50 + rnd() * 35);
  G.resGrid = grid;
  return list;
}
function resourcesNear(x, y, r) {
  const out = [];
  const b0x = Math.floor((x - r - 150) / RES_BUCKET), b1x = Math.floor((x + r + 150) / RES_BUCKET);
  const b0y = Math.floor((y - r - 150) / RES_BUCKET), b1y = Math.floor((y + r + 150) / RES_BUCKET);
  for (let j = b0y; j <= b1y; j++) for (let i = b0x; i <= b1x; i++) {
    const arr = G.resGrid.get(i + j * 1000);
    if (arr) for (const o of arr) if (dist2(x, y, o.x, o.y) < (r + o.r) ** 2) out.push(o);
  }
  return out;
}

function newGame(name, state = 'play') {
  nextId = 1;
  Object.assign(G, {
    state, name: name || 'Sobrevivente', time: 0,
    buildings: new Map(), bmap: new Int32Array(WORLD_CELLS * WORLD_CELLS), counts: {},
    zombies: [], projectiles: [], particles: [], texts: [],
    res: { wood: 0, stone: 0, gold: 0 },
    stash: null, wave: 0, day: 1, clock: 0, night: false, nightAlpha: 0,
    score: 0, kills: 0, build: null, selected: null, spawnQueue: [], toastQueue: [],
  });
  G.resources = genResources(state === 'menu' ? 7 : (Math.random() * 1e9) | 0);
  // ponto de partida próximo ao centro, livre de recursos
  let px = WORLD / 2, py = WORLD / 2;
  for (let i = 0; i < 200; i++) {
    px = WORLD / 2 + (Math.random() - 0.5) * 2000; py = WORLD / 2 + (Math.random() - 0.5) * 2000;
    if (!resourcesNear(px, py, 400).length) break;
  }
  G.player = {
    x: px, y: py, r: 30, angle: 0, hp: PLAYER_HP, maxHp: PLAYER_HP, alive: true, respawn: 0,
    shield: 0, shieldTier: 0, lastHurt: -99, hurt: 0,
    weapon: 'pickaxe', owned: { pickaxe: 1 }, swing: 0, cd: 0,
  };
  G.cam = { x: px, y: py };
}

// ---------- Construções ----------
function cellIndex(cx, cy) { return cy * WORLD_CELLS + cx; }
function buildingAtCell(cx, cy) {
  if (cx < 0 || cy < 0 || cx >= WORLD_CELLS || cy >= WORLD_CELLS) return null;
  const id = G.bmap[cellIndex(cx, cy)];
  return id ? G.buildings.get(id) : null;
}
function buildingAtPoint(x, y) { return buildingAtCell(Math.floor(x / CELL), Math.floor(y / CELL)); }

function rectOf(b) { return { x0: b.cx * CELL, y0: b.cy * CELL, x1: (b.cx + b.size) * CELL, y1: (b.cy + b.size) * CELL }; }
function circleRect(x, y, r, rc) {
  const nx = clamp(x, rc.x0, rc.x1), ny = clamp(y, rc.y0, rc.y1);
  return dist2(x, y, nx, ny) < r * r;
}
// Primeira construção que intercepta o círculo e satisfaz o filtro.
function hitBuilding(x, y, r, filter) {
  const c0x = Math.floor((x - r) / CELL), c1x = Math.floor((x + r) / CELL);
  const c0y = Math.floor((y - r) / CELL), c1y = Math.floor((y + r) / CELL);
  for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
    const b = buildingAtCell(cx, cy);
    if (b && (!filter || filter(b)) && circleRect(x, y, r, rectOf(b))) return b;
  }
  return null;
}
const blocksPlayer = (b) => b.type !== 'door' && b.type !== 'slowtrap';
const blocksZombie = (b) => b.type !== 'slowtrap';

function limitFor(type) {
  const def = BUILDINGS[type];
  const st = G.stash ? G.stash.tier : 1;
  if (def.tower) return def.limit + (st - 1);
  return def.limit;
}
function canAfford(cost) {
  return (cost.wood || 0) <= G.res.wood && (cost.stone || 0) <= G.res.stone && (cost.gold || 0) <= G.res.gold;
}
function pay(cost) {
  G.res.wood -= cost.wood || 0; G.res.stone -= cost.stone || 0; G.res.gold -= cost.gold || 0;
}

// Retorna null se pode construir; senão, uma mensagem.
function placementError(type, cx, cy, quiet) {
  const def = BUILDINGS[type];
  const s = def.size;
  if (cx < 0 || cy < 0 || cx + s > WORLD_CELLS || cy + s > WORLD_CELLS) return 'Fora do mapa';
  for (let j = 0; j < s; j++) for (let i = 0; i < s; i++) if (G.bmap[cellIndex(cx + i, cy + j)]) return 'Espaço ocupado';
  const rc = { x0: cx * CELL, y0: cy * CELL, x1: (cx + s) * CELL, y1: (cy + s) * CELL };
  const mx = (rc.x0 + rc.x1) / 2, my = (rc.y0 + rc.y1) / 2;
  for (const o of resourcesNear(mx, my, s * CELL)) if (circleRect(o.x, o.y, o.r * 0.82, rc)) return 'Há um recurso no caminho';
  if (type !== 'stash') {
    if (!G.stash) return 'Coloque o Cofre de Ouro primeiro';
    if (dist2(mx, my, G.stash.x, G.stash.y) > BUILD_RANGE ** 2) return 'Longe demais do Cofre de Ouro';
  }
  const p = G.player;
  if (p.alive && type !== 'door' && type !== 'slowtrap' && circleRect(p.x, p.y, p.r - 4, rc)) return 'Você está no caminho';
  if (type !== 'slowtrap') for (const z of G.zombies) if (circleRect(z.x, z.y, z.r, rc)) return 'Há zumbis no caminho';
  if ((G.counts[type] || 0) >= limitFor(type)) return `Limite de ${def.name} atingido (${limitFor(type)})`;
  if (!canAfford(def.cost)) return 'Recursos insuficientes';
  return null;
}

function placeBuilding(type, cx, cy) {
  const err = placementError(type, cx, cy);
  if (err) return err;
  const def = BUILDINGS[type];
  pay(def.cost);
  const b = {
    id: nextId++, type, tier: 1, cx, cy, size: def.size,
    x: (cx + def.size / 2) * CELL, y: (cy + def.size / 2) * CELL,
    hp: def.hp, maxHp: def.hp, angle: -Math.PI / 2, cd: 0, anim: 0, pull: 1, spin: 0,
    lastHit: -99, target: null, acc: 0, born: G.time,
  };
  G.buildings.set(b.id, b);
  for (let j = 0; j < def.size; j++) for (let i = 0; i < def.size; i++) G.bmap[cellIndex(cx + i, cy + j)] = b.id;
  G.counts[type] = (G.counts[type] || 0) + 1;
  if (type === 'harvester') updateHarvesterNodes(b);
  if (type === 'stash') {
    G.stash = b; G.clock = 0;
    toast('Cofre de Ouro colocado! Construa defesas antes do anoitecer.');
  }
  puff(b.x, b.y, 8, '#d9cbb0', def.size * 18);
  Sfx.play('build');
  return null;
}

function removeBuilding(b) {
  G.buildings.delete(b.id);
  for (let j = 0; j < b.size; j++) for (let i = 0; i < b.size; i++) G.bmap[cellIndex(b.cx + i, b.cy + j)] = 0;
  G.counts[b.type]--;
  if (G.selected === b) G.selected = null;
}

function upgradeCost(b) {
  const def = BUILDINGS[b.type];
  const nt = b.tier + 1;
  const m = RES_MULT[nt - 1];
  const wood = def.cost.wood ? Math.round(def.cost.wood * m) : (b.type === 'stash' ? 50 * m : 0);
  const stone = def.cost.stone ? Math.round(def.cost.stone * m) : (b.type === 'stash' ? 50 * m : 0);
  return { wood, stone, gold: Math.round(GOLD_TABLE[nt - 1] * def.goldF) };
}
function upgradeError(b) {
  if (b.tier >= MAX_TIER) return 'Nível máximo';
  if (b.type !== 'stash' && b.tier + 1 > G.stash.tier) return 'Melhore o Cofre de Ouro primeiro';
  if (!canAfford(upgradeCost(b))) return 'Recursos insuficientes';
  return null;
}
function upgradeBuilding(b, quiet) {
  const err = upgradeError(b);
  if (err) { if (!quiet) { toast(err, true); Sfx.play('error'); } return false; }
  pay(upgradeCost(b));
  const frac = b.hp / b.maxHp;
  b.tier++;
  b.maxHp = Math.round(BUILDINGS[b.type].hp * HP_MULT[b.tier - 1]);
  b.hp = Math.max(b.hp, b.maxHp * frac);
  puff(b.x, b.y, 10, '#ffe08a', b.size * 18);
  Sfx.play('upgrade');
  return true;
}
// Melhora todas as construções do tipo que estão no nível indicado.
function upgradeAll(type, tier) {
  let n = 0;
  for (const b of G.buildings.values()) {
    if (b.type === type && b.tier === tier && upgradeBuilding(b, true)) n++;
  }
  return n;
}
function sellRefund(b) {
  const def = BUILDINGS[b.type];
  let wood = def.cost.wood || 0, stone = def.cost.stone || 0, gold = 0;
  for (let t = 2; t <= b.tier; t++) {
    gold += GOLD_TABLE[t - 1] * def.goldF;
  }
  const f = 0.5 * (b.hp / b.maxHp);
  return { wood: Math.floor(wood * f), stone: Math.floor(stone * f), gold: Math.floor(gold * f) };
}
function sellBuilding(b) {
  if (b.type === 'stash') return;
  const r = sellRefund(b);
  G.res.wood += r.wood; G.res.stone += r.stone; G.res.gold += r.gold;
  removeBuilding(b);
  puff(b.x, b.y, 8, '#bbb', b.size * 18);
  Sfx.play('sell');
}

function damageBuilding(b, dmg) {
  b.hp -= dmg; b.lastHit = G.time;
  if (b.hp <= 0) {
    removeBuilding(b);
    puff(b.x, b.y, 14, TIERS[b.tier - 1].base, b.size * 22);
    Sfx.play('destroy');
    if (b.type === 'stash') { G.stash = null; gameOver(); }
  }
}

function updateHarvesterNodes(b) {
  const near = resourcesNear(b.x, b.y, BUILDINGS.harvester.radius);
  b.trees = near.filter((o) => o.type === 'tree').length;
  b.stones = near.length - b.trees;
}

// ---------- Efeitos ----------
function puff(x, y, n, color, spread = 30) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = 40 + Math.random() * 120;
    G.particles.push({
      x: x + Math.cos(a) * Math.random() * spread, y: y + Math.sin(a) * Math.random() * spread,
      vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.3, max: 0.8,
      r: 5 + Math.random() * 7, color,
    });
  }
}
function floatText(x, y, text, color = '#fff') {
  G.texts.push({ x, y, text, color, life: 1 });
}
function toast(msg, warn) {
  if (typeof UI !== 'undefined') UI.toast(msg, warn);
}
function explosion(x, y, radius) {
  G.particles.push({ x, y, vx: 0, vy: 0, life: 0.35, max: 0.35, r: radius, color: '#ffcf5a', ring: true });
  puff(x, y, 10, '#ffb347', radius * 0.4);
  puff(x, y, 6, '#666', radius * 0.5);
}

// ---------- Zumbis ----------
const ZH = 128;
let zhash = new Map();
function buildZombieHash() {
  zhash = new Map();
  for (const z of G.zombies) {
    const k = Math.floor(z.x / ZH) + Math.floor(z.y / ZH) * 1000;
    let a = zhash.get(k);
    if (!a) zhash.set(k, (a = []));
    a.push(z);
  }
}
function zombiesNear(x, y, r, out = []) {
  out.length = 0;
  const b0x = Math.floor((x - r - 60) / ZH), b1x = Math.floor((x + r + 60) / ZH);
  const b0y = Math.floor((y - r - 60) / ZH), b1y = Math.floor((y + r + 60) / ZH);
  for (let j = b0y; j <= b1y; j++) for (let i = b0x; i <= b1x; i++) {
    const a = zhash.get(i + j * 1000);
    if (a) for (const z of a) if (z.hp > 0 && dist2(x, y, z.x, z.y) < (r + z.r) ** 2) out.push(z);
  }
  return out;
}
function nearestZombie(x, y, r) {
  let best = null, bd = Infinity;
  for (const z of zombiesNear(x, y, r)) {
    const d = dist2(x, y, z.x, z.y);
    if (d < bd) { bd = d; best = z; }
  }
  return best;
}

function spawnZombie(tier, boss) {
  const s = G.stash;
  if (!s) return;
  const zt = ZOMBIE_TIERS[tier - 1];
  const a = Math.random() * TAU, d = BUILD_RANGE + 500 + Math.random() * 450;
  const x = clamp(s.x + Math.cos(a) * d, 40, WORLD - 40), y = clamp(s.y + Math.sin(a) * d, 40, WORLD - 40);
  const hpScale = 1 + Math.max(0, G.wave - tier * 3) * 0.04;
  const hp = zt.hp * hpScale * (boss ? 30 : 1);
  G.zombies.push({
    id: nextId++, tier, boss, x, y, r: boss ? 64 : 26, hp, maxHp: hp,
    dmg: zt.dmg * (boss ? 4 : 1), speed: zt.speed * (boss ? 0.7 : 1) * (0.92 + Math.random() * 0.16),
    angle: a + Math.PI, cd: 0, atk: 0, walk: Math.random() * 10, hitFlash: 0,
  });
}

function planWave(w) {
  const q = [];
  const count = Math.min(320, 8 + Math.floor(w * 4.5));
  const base = Math.min(8, 1 + Math.floor((w - 1) / 4));
  for (let i = 0; i < count; i++) {
    let tier = base;
    if (base < 8 && Math.random() < 0.08 + (w % 4) * 0.08) tier++;
    q.push({ t: (i / count) * NIGHT_LEN * 0.65 + Math.random() * 2, tier, boss: false });
  }
  if (w % BOSS_EVERY === 0) q.push({ t: NIGHT_LEN * 0.3, tier: Math.min(8, base + 1), boss: true });
  q.sort((a, b) => a.t - b.t);
  return q;
}

function damageZombie(z, dmg) {
  if (z.hp <= 0) return;
  z.hp -= dmg; z.hitFlash = 0.08;
  if (z.hp <= 0) {
    const zt = ZOMBIE_TIERS[z.tier - 1];
    G.kills++;
    const pts = Math.round(zt.hp / 4 * (z.boss ? 20 : 1));
    G.score += pts;
    puff(z.x, z.y, z.boss ? 24 : 9, zt.color, z.r);
    if (z.boss) {
      const g = 500 * z.tier;
      G.res.gold += g; floatText(z.x, z.y - 40, `+${g} ouro`, '#ffd34d');
      toast('Chefão derrotado!');
    }
  }
}

function damagePlayer(dmg) {
  const p = G.player;
  if (!p.alive) return;
  p.lastHurt = G.time; p.hurt = 0.15;
  if (p.shield > 0) {
    const a = Math.min(p.shield, dmg);
    p.shield -= a; dmg -= a;
  }
  p.hp -= dmg;
  Sfx.play('hurt');
  if (p.hp <= 0) {
    p.hp = 0; p.alive = false; p.respawn = 5;
    // morrer custa 25% da madeira e da pedra
    G.res.wood = Math.floor(G.res.wood * 0.75); G.res.stone = Math.floor(G.res.stone * 0.75);
    puff(p.x, p.y, 16, SKIN, 30);
    Sfx.play('die');
    toast(G.stash ? 'Você morreu! Renascendo no Cofre de Ouro…' : 'Você morreu!', true);
  }
}

function updateZombies(dt) {
  const p = G.player;
  const s = G.stash;
  const tmp = [];
  for (const z of G.zombies) {
    if (z.hp <= 0) continue;
    z.cd -= dt; z.atk = Math.max(0, z.atk - dt * 3); z.hitFlash -= dt;
    if (!G.night) { // o sol queima os zumbis
      z.hp -= z.maxHp * 0.12 * dt;
      if (Math.random() < dt * 3) puff(z.x, z.y, 1, '#777', z.r * 0.5);
      if (z.hp <= 0) { puff(z.x, z.y, 6, '#777', z.r); continue; }
    }
    let tx, ty, chasing = false;
    const dp = p.alive ? dist2(z.x, z.y, p.x, p.y) : Infinity;
    if (dp < 420 * 420 || !s) {
      if (!p.alive) { tx = z.x; ty = z.y; } else { tx = p.x; ty = p.y; chasing = true; }
    } else { tx = s.x; ty = s.y; }
    let dx = tx - z.x, dy = ty - z.y;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d; dy /= d;
    z.angle = angleLerp(z.angle, Math.atan2(dy, dx), Math.min(1, dt * 8));
    if (chasing && d < z.r + p.r + 8) {
      if (z.cd <= 0) { damagePlayer(z.dmg); z.cd = 1; z.atk = 1; }
      continue;
    }
    if (!p.alive && !s) continue;
    const trap = buildingAtPoint(z.x, z.y);
    const slow = trap && trap.type === 'slowtrap' ? BUILDINGS.slowtrap.slow[trap.tier - 1] : 1;
    const step = z.speed * slow * dt;
    const nx = z.x + dx * step, ny = z.y + dy * step;
    const b = hitBuilding(nx, ny, z.r - 3, blocksZombie);
    if (b) {
      z.angle = angleLerp(z.angle, Math.atan2(b.y - z.y, b.x - z.x), Math.min(1, dt * 8));
      if (z.cd <= 0) { damageBuilding(b, z.dmg); z.cd = 1; z.atk = 1; Sfx.play('hit'); }
    } else {
      z.x = nx; z.y = ny; z.walk += dt * 8;
    }
    // separação entre zumbis
    for (const o of zombiesNear(z.x, z.y, z.r, tmp)) {
      if (o === z) continue;
      let ox = z.x - o.x, oy = z.y - o.y;
      const dd = Math.hypot(ox, oy) || 0.01, min = z.r + o.r - 6;
      if (dd < min) {
        const push = (min - dd) * 0.5;
        const sx = z.x + (ox / dd) * push, sy = z.y + (oy / dd) * push;
        if (!hitBuilding(sx, sy, z.r - 3, blocksZombie)) { z.x = sx; z.y = sy; }
      }
    }
  }
  G.zombies = G.zombies.filter((z) => z.hp > 0);
}

// ---------- Torres e produção ----------
function towerStat(b, key) {
  const def = BUILDINGS[b.type];
  if (key === 'dmg') return def.dmg * DMG_MULT[b.tier - 1];
  if (key === 'range') return def.range * (1 + 0.04 * (b.tier - 1));
  if (key === 'rate') return def.rate * (1 - 0.03 * (b.tier - 1));
  return def[key];
}

function fireTower(b, z) {
  const def = BUILDINGS[b.type];
  const dmg = towerStat(b, 'dmg');
  const a = b.angle;
  const mx = b.x + Math.cos(a) * 40, my = b.y + Math.sin(a) * 40;
  switch (b.type) {
    case 'arrow':
      G.projectiles.push({ kind: 'arrow', x: mx, y: my, vx: Math.cos(a) * def.speed, vy: Math.sin(a) * def.speed, dmg, life: towerStat(b, 'range') / def.speed + 0.1, a });
      b.pull = 0; Sfx.play('shoot');
      break;
    case 'cannon':
      G.projectiles.push({ kind: 'ball', x: mx, y: my, vx: Math.cos(a) * def.speed, vy: Math.sin(a) * def.speed, dmg, splash: def.splash, life: towerStat(b, 'range') / def.speed + 0.15, a });
      b.anim = 1; puff(mx, my, 3, '#ccc', 8); Sfx.play('cannon');
      break;
    case 'mage':
      for (let i = -1; i <= 1; i++) {
        const aa = a + i * 0.22;
        G.projectiles.push({ kind: 'orb', x: b.x, y: b.y, vx: Math.cos(aa) * def.speed, vy: Math.sin(aa) * def.speed, dmg, life: towerStat(b, 'range') / def.speed + 0.1, a: aa });
      }
      b.anim = 1; Sfx.play('magic');
      break;
    case 'bomb': {
      const lead = Math.hypot(z.x - b.x, z.y - b.y) / 520;
      const tx = z.x + Math.cos(z.angle) * z.speed * lead * 0.6, ty = z.y + Math.sin(z.angle) * z.speed * lead * 0.6;
      lob(b.x, b.y, tx, ty, dmg, def.splash, 520);
      b.anim = 1; Sfx.play('cannon');
      break;
    }
    case 'melee':
      damageZombie(z, dmg);
      for (const o of zombiesNear(z.x, z.y, 30)) if (o !== z) damageZombie(o, dmg * 0.4);
      b.anim = 0.001; Sfx.play('punch');
      puff(z.x, z.y, 3, '#fff', 10);
      break;
  }
}
function lob(sx, sy, tx, ty, dmg, splash, speed) {
  const d = Math.hypot(tx - sx, ty - sy);
  G.projectiles.push({ kind: 'lob', sx, sy, tx, ty, x: sx, y: sy, t: 0, T: Math.max(0.35, d / speed), dmg, splash, h: 0 });
}

function updateBuildings(dt) {
  const day = !G.night;
  for (const b of G.buildings.values()) {
    const def = BUILDINGS[b.type];
    if (def.tower) {
      b.cd -= dt;
      if (b.type === 'melee') { if (b.anim > 0) b.anim += dt * 4; if (b.anim >= 1) b.anim = 0; }
      else b.anim = Math.max(0, b.anim - dt * 3);
      b.pull = Math.min(1, b.pull + dt * 3);
      const range = towerStat(b, 'range');
      if (!b.target || b.target.hp <= 0 || dist2(b.x, b.y, b.target.x, b.target.y) > (range + b.target.r) ** 2) {
        b.target = nearestZombie(b.x, b.y, range);
      }
      const z = b.target;
      if (z) {
        const want = Math.atan2(z.y - b.y, z.x - b.x);
        b.angle = angleLerp(b.angle, want, Math.min(1, dt * 12));
        if (b.cd <= 0 && Math.abs(angleLerp(0, want - b.angle, 1)) < 0.4) {
          fireTower(b, z);
          b.cd = towerStat(b, 'rate');
        }
      }
    } else if (b.type === 'goldmine') {
      G.res.gold += def.income[b.tier - 1] * dt;
      b.spin += dt * 0.8;
    } else if (b.type === 'harvester') {
      const nodes = b.trees + b.stones;
      if (nodes > 0 && G.res.gold >= 1) {
        b.spin += dt * 4;
        b.acc += dt;
        if (b.acc >= 1) {
          b.acc -= 1;
          const rate = def.rate[b.tier - 1];
          const fw = b.trees / nodes, fs = b.stones / nodes;
          const k = Math.min(nodes, 4) / 2;
          G.res.wood += rate * fw * k * 2; G.res.stone += rate * fs * k * 2;
          G.res.gold -= Math.min(G.res.gold, 0.5 * b.tier);
        }
      }
    }
    if (day && G.time - b.lastHit > 4 && b.hp < b.maxHp) b.hp = Math.min(b.maxHp, b.hp + b.maxHp * 0.05 * dt);
  }
}

function updateProjectiles(dt) {
  const tmp = [];
  for (const pr of G.projectiles) {
    if (pr.kind === 'lob') {
      pr.t += dt;
      const k = Math.min(1, pr.t / pr.T);
      pr.x = pr.sx + (pr.tx - pr.sx) * k; pr.y = pr.sy + (pr.ty - pr.sy) * k;
      pr.h = Math.sin(k * Math.PI);
      if (k >= 1) {
        pr.dead = true;
        explosion(pr.x, pr.y, pr.splash);
        Sfx.play('boom');
        for (const z of zombiesNear(pr.x, pr.y, pr.splash, tmp)) damageZombie(z, pr.dmg);
      }
      continue;
    }
    pr.x += pr.vx * dt; pr.y += pr.vy * dt; pr.life -= dt;
    if (pr.life <= 0) { pr.dead = true; if (pr.splash) explosion(pr.x, pr.y, pr.splash * 0.7); continue; }
    const hit = zombiesNear(pr.x, pr.y, 6, tmp)[0];
    if (hit) {
      pr.dead = true;
      if (pr.splash) {
        explosion(pr.x, pr.y, pr.splash);
        for (const z of zombiesNear(pr.x, pr.y, pr.splash, tmp)) damageZombie(z, z === hit ? pr.dmg : pr.dmg * 0.6);
      } else {
        damageZombie(hit, pr.dmg);
        puff(pr.x, pr.y, 2, pr.kind === 'orb' ? '#7cc8ff' : '#eee', 6);
      }
    }
  }
  G.projectiles = G.projectiles.filter((p) => !p.dead);
}

function updateParticles(dt) {
  for (const p of G.particles) {
    p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.9; p.vy *= 0.9; p.life -= dt;
  }
  G.particles = G.particles.filter((p) => p.life > 0);
  for (const t of G.texts) { t.y -= 40 * dt; t.life -= dt * 0.9; }
  G.texts = G.texts.filter((t) => t.life > 0);
  if (G.particles.length > 600) G.particles.splice(0, G.particles.length - 600);
}

// ---------- Jogador ----------
function collidePlayer(p) {
  for (let it = 0; it < 3; it++) {
    const c0x = Math.floor((p.x - p.r) / CELL), c1x = Math.floor((p.x + p.r) / CELL);
    const c0y = Math.floor((p.y - p.r) / CELL), c1y = Math.floor((p.y + p.r) / CELL);
    for (let cy = c0y; cy <= c1y; cy++) for (let cx = c0x; cx <= c1x; cx++) {
      const b = buildingAtCell(cx, cy);
      if (!b || !blocksPlayer(b)) continue;
      const rc = rectOf(b);
      const nx = clamp(p.x, rc.x0, rc.x1), ny = clamp(p.y, rc.y0, rc.y1);
      let dx = p.x - nx, dy = p.y - ny;
      const d = Math.hypot(dx, dy);
      if (d < p.r) {
        if (d < 0.001) { dx = p.x - (rc.x0 + rc.x1) / 2; dy = p.y - (rc.y0 + rc.y1) / 2; const dd = Math.hypot(dx, dy) || 1; p.x += dx / dd * p.r; p.y += dy / dd * p.r; }
        else { p.x += dx / d * (p.r - d); p.y += dy / d * (p.r - d); }
      }
    }
    for (const o of resourcesNear(p.x, p.y, p.r)) {
      const dx = p.x - o.x, dy = p.y - o.y, d = Math.hypot(dx, dy) || 1, min = p.r + o.r * 0.82;
      if (d < min) { p.x += dx / d * (min - d); p.y += dy / d * (min - d); }
    }
  }
  p.x = clamp(p.x, p.r, WORLD - p.r); p.y = clamp(p.y, p.r, WORLD - p.r);
}

function playerAttack(p) {
  const w = WEAPONS[p.weapon];
  const tier = p.owned[p.weapon];
  const dmg = w.dmg[tier - 1];
  const ca = Math.cos(p.angle), sa = Math.sin(p.angle);
  if (p.weapon === 'bow') {
    G.projectiles.push({ kind: 'arrow', x: p.x + ca * 40, y: p.y + sa * 40, vx: ca * 1000, vy: sa * 1000, dmg, life: w.range / 1000, a: p.angle });
    Sfx.play('shoot');
    return;
  }
  if (p.weapon === 'bomb') {
    const md = Math.min(w.range, Math.hypot(Input.wx - p.x, Input.wy - p.y));
    lob(p.x + ca * 30, p.y + sa * 30, p.x + ca * md, p.y + sa * md, dmg, w.splash, 600);
    return;
  }
  Sfx.play('swing');
  const reach = p.r + w.range * 0.55;
  const hx = p.x + ca * reach, hy = p.y + sa * reach, hr = w.range * 0.6;
  for (const z of zombiesNear(hx, hy, hr)) damageZombie(z, dmg);
  if (p.weapon === 'pickaxe') {
    const res = resourcesNear(hx, hy, hr);
    if (res.length) {
      const o = res[0];
      const g = w.gather[tier - 1];
      if (o.type === 'tree') { G.res.wood += g; Sfx.play('wood'); } else { G.res.stone += g; Sfx.play('stone'); }
      o.wob = 1; o.wobA = p.angle;
      floatText(hx, hy - 20, `+${g}`, o.type === 'tree' ? '#f0d29a' : '#e4e8ea');
      puff(hx, hy, 3, o.type === 'tree' ? '#5b8a4f' : '#a8adb0', 10);
    }
  }
}

function updatePlayer(dt) {
  const p = G.player;
  p.hurt -= dt;
  if (!p.alive) {
    p.respawn -= dt;
    if (p.respawn <= 0) {
      if (G.stash) {
        p.alive = true; p.hp = p.maxHp; p.shield = SHIELD.hp[p.shieldTier - 1] || 0;
        p.x = G.stash.x; p.y = G.stash.y + CELL * 1.7;
        collidePlayer(p);
      } else p.respawn = 1;
    }
    return;
  }
  let mx = 0, my = 0;
  if (Input.down('KeyW') || Input.down('ArrowUp')) my--;
  if (Input.down('KeyS') || Input.down('ArrowDown')) my++;
  if (Input.down('KeyA') || Input.down('ArrowLeft')) mx--;
  if (Input.down('KeyD') || Input.down('ArrowRight')) mx++;
  if (Input.joy.active) { mx = Input.joy.x; my = Input.joy.y; }
  const ml = Math.hypot(mx, my);
  if (ml > 1) { mx /= ml; my /= ml; }
  p.x += mx * PLAYER_SPEED * dt; p.y += my * PLAYER_SPEED * dt;
  collidePlayer(p);
  if (!Input.touchAim) p.angle = Math.atan2(Input.wy - p.y, Input.wx - p.x);

  p.cd -= dt;
  if (p.swing > 0) p.swing = Math.max(0, p.swing - dt / (WEAPONS[p.weapon].rate * 0.9));
  if (Input.attacking() && p.cd <= 0) {
    p.cd = WEAPONS[p.weapon].rate; p.swing = 1;
    playerAttack(p);
  }
  if (p.shieldTier) {
    const max = SHIELD.hp[p.shieldTier - 1];
    if (G.time - p.lastHurt > 6) p.shield = Math.min(max, p.shield + max * 0.25 * dt);
  }
  if (G.time - p.lastHurt > 8) p.hp = Math.min(p.maxHp, p.hp + 2 * dt);
}

// ---------- Loja ----------
function buyWeapon(kind) {
  const p = G.player, w = WEAPONS[kind];
  const cur = p.owned[kind] || 0;
  if (cur >= w.costs.length) return 'Nível máximo';
  const cost = w.costs[cur];
  if (G.res.gold < cost) return 'Ouro insuficiente';
  G.res.gold -= cost; p.owned[kind] = cur + 1; p.weapon = kind;
  Sfx.play('buy');
  return null;
}
function buyShield() {
  const p = G.player;
  if (p.shieldTier >= SHIELD.costs.length) return 'Nível máximo';
  const cost = SHIELD.costs[p.shieldTier];
  if (G.res.gold < cost) return 'Ouro insuficiente';
  G.res.gold -= cost; p.shieldTier++; p.shield = SHIELD.hp[p.shieldTier - 1];
  Sfx.play('buy');
  return null;
}
function usePotion() {
  const p = G.player;
  if (!p.alive) return 'Você está morto';
  if (p.hp >= p.maxHp) return 'Vida já está cheia';
  if (G.res.gold < POTION_COST) return 'Ouro insuficiente';
  G.res.gold -= POTION_COST; p.hp = p.maxHp;
  puff(p.x, p.y, 10, '#ff7b84', 30);
  Sfx.play('buy');
  return null;
}
function cycleWeapon() {
  const p = G.player;
  const owned = WEAPON_ORDER.filter((k) => p.owned[k]);
  p.weapon = owned[(owned.indexOf(p.weapon) + 1) % owned.length];
  p.cd = Math.max(p.cd, 0.15);
}

// ---------- Ciclo dia/noite ----------
function updateClock(dt) {
  G.nightAlpha += ((G.night ? 1 : 0) - G.nightAlpha) * Math.min(1, dt * 0.8);
  if (!G.stash) return;
  G.clock += dt;
  if (G.night) {
    while (G.spawnQueue.length && G.spawnQueue[0].t <= G.clock) {
      const s = G.spawnQueue.shift();
      if (G.zombies.length < 400) spawnZombie(s.tier, s.boss);
    }
  }
  const len = G.night ? NIGHT_LEN : DAY_LEN;
  if (G.clock >= len) {
    G.clock -= len;
    if (G.night) {
      G.night = false; G.day++;
      G.score += G.wave * 100;
      toast(`Onda ${G.wave} sobrevivida! Começa o dia ${G.day}.`);
      Sfx.play('day');
    } else {
      G.night = true; G.wave++;
      G.spawnQueue = planWave(G.wave);
      toast(G.wave % BOSS_EVERY === 0 ? `Onda ${G.wave} — um CHEFÃO se aproxima!` : `A noite chegou — onda ${G.wave}!`, true);
      Sfx.play('night');
    }
  }
}

function gameOver() {
  G.state = 'over';
  if (typeof UI !== 'undefined') UI.showGameOver();
}

function update(dt) {
  G.time += dt;
  if (G.state === 'play') {
    updateClock(dt);
    updatePlayer(dt);
  }
  buildZombieHash();
  if (G.state === 'play') updateZombies(dt);
  updateBuildings(dt);
  updateProjectiles(dt);
  updateParticles(dt);
  for (const o of G.resources) if (o.wob > 0) o.wob = Math.max(0, o.wob - dt * 5);
  const p = G.player;
  if (G.state === 'menu') {
    G.cam.x += 30 * dt; G.cam.y += 12 * dt;
  } else {
    G.cam.x += (p.x - G.cam.x) * Math.min(1, dt * 10);
    G.cam.y += (p.y - G.cam.y) * Math.min(1, dt * 10);
  }
}

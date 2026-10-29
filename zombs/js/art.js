'use strict';
// Arte procedural (vetorial, traço grosso escuro e cores chapadas).
// Todas as funções desenham centradas na origem do contexto atual.

const OUTLINE = '#2f3032';
const TAU = Math.PI * 2;

// Paleta por nível: madeira, pedra, ouro, gelo, ametista, rubi, obsidiana, lendário.
const TIERS = [
  { base: '#a87b4f', light: '#c39668', dark: '#7f5a36', metal: '#b9bec2' },
  { base: '#8e969b', light: '#aab1b6', dark: '#6b7278', metal: '#c9ced2' },
  { base: '#d6a63c', light: '#efc65e', dark: '#a87c22', metal: '#f3dc92' },
  { base: '#69b2e6', light: '#92cbf2', dark: '#4687bd', metal: '#cfeaff' },
  { base: '#9a6bd2', light: '#b68fe2', dark: '#7047a6', metal: '#dcc6f6' },
  { base: '#d34c4c', light: '#e87070', dark: '#a03131', metal: '#f4b3b3' },
  { base: '#555a61', light: '#6d737b', dark: '#393c41', metal: '#9aa1aa' },
  { base: '#2c3038', light: '#3e4450', dark: '#1a1d22', metal: '#7fe8ff', glow: '#4fe3ff' },
];

function rrPath(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function circ(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); }
function paint(ctx, fill, lw = 4, stroke = OUTLINE) {
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (lw) { ctx.lineWidth = lw; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.stroke(); }
}

// ---------- Bases ----------
function drawPlate(ctx, tier) {
  const t = TIERS[tier - 1];
  if (t.glow) { ctx.shadowColor = t.glow; ctx.shadowBlur = 14; }
  rrPath(ctx, -45, -45, 90, 90, 12); paint(ctx, t.base, 5);
  ctx.shadowBlur = 0;
  rrPath(ctx, -36, -36, 72, 72, 8); paint(ctx, t.dark, 0);
  rrPath(ctx, -36, -36, 72, 8, 4); ctx.fillStyle = 'rgba(0,0,0,0.12)'; ctx.fill();
  for (const [x, y] of [[-39, -39], [39, -39], [-39, 39], [39, 39]]) {
    circ(ctx, x, y, 4); paint(ctx, t.light, 2);
  }
}
function drawTurntable(ctx, tier) {
  const t = TIERS[tier - 1];
  circ(ctx, 0, 0, 30); paint(ctx, '#9aa1a6', 4);
  circ(ctx, 0, 0, 22); paint(ctx, t.metal, 3);
}

// ---------- Construções ----------
function drawWall(ctx, tier) {
  const t = TIERS[tier - 1];
  if (t.glow) { ctx.shadowColor = t.glow; ctx.shadowBlur = 10; }
  rrPath(ctx, -21, -21, 42, 42, 9); paint(ctx, t.base, 4);
  ctx.shadowBlur = 0;
  rrPath(ctx, -14, -15, 28, 9, 4); ctx.fillStyle = t.light; ctx.fill();
  rrPath(ctx, -14, 8, 28, 6, 3); ctx.fillStyle = t.dark; ctx.fill();
}

function drawDoor(ctx, tier) {
  const t = TIERS[tier - 1];
  rrPath(ctx, -22, -22, 44, 44, 6); paint(ctx, t.dark, 4);
  rrPath(ctx, -16, -16, 32, 32, 4); paint(ctx, t.base, 3);
  ctx.strokeStyle = t.dark; ctx.lineWidth = 2;
  for (const x of [-6, 4]) { ctx.beginPath(); ctx.moveTo(x, -15); ctx.lineTo(x, 15); ctx.stroke(); }
  circ(ctx, 10, 0, 3.5); paint(ctx, t.metal, 2);
}

function drawSlowTrap(ctx, tier, time) {
  const t = TIERS[tier - 1];
  rrPath(ctx, -21, -21, 42, 42, 8); paint(ctx, 'rgba(60,40,90,0.55)', 3, t.dark);
  const p = 1 + Math.sin(time * 3) * 0.06;
  ctx.save(); ctx.scale(p, p);
  ctx.fillStyle = 'rgba(150,90,220,0.75)';
  ctx.beginPath();
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * TAU, r = i % 2 ? 11 : 16;
    i ? ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r) : ctx.moveTo(r, 0);
  }
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(235,225,255,0.55)'; ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 4;
    ctx.beginPath(); ctx.moveTo(Math.cos(a) * -17, Math.sin(a) * -17); ctx.lineTo(Math.cos(a) * 17, Math.sin(a) * 17); ctx.stroke();
  }
  circ(ctx, 0, 0, 9); ctx.stroke();
  circ(ctx, 0, 0, 4); ctx.fillStyle = t.light; ctx.fill();
}

function drawArrowTower(ctx, tier, angle, pull) {
  const t = TIERS[tier - 1];
  drawPlate(ctx, tier);
  drawTurntable(ctx, tier);
  ctx.save(); ctx.rotate(angle);
  rrPath(ctx, -26, -7, 50, 14, 4); paint(ctx, t.base, 4);       // coronha
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(6, -34); ctx.quadraticCurveTo(30, 0, 6, 34);
  ctx.lineWidth = 13; ctx.strokeStyle = OUTLINE; ctx.stroke();
  ctx.lineWidth = 7; ctx.strokeStyle = t.light; ctx.stroke();  // arco
  const sx = -8 - pull * 10;
  ctx.beginPath(); ctx.moveTo(6, -32); ctx.lineTo(sx, 0); ctx.lineTo(6, 32);
  ctx.lineWidth = 2; ctx.strokeStyle = '#eee'; ctx.stroke();      // corda
  if (pull > 0.15) {
    ctx.beginPath(); ctx.moveTo(sx, 0); ctx.lineTo(sx + 44, 0);
    ctx.lineWidth = 4; ctx.strokeStyle = OUTLINE; ctx.stroke();
    ctx.beginPath(); ctx.moveTo(sx + 50, 0); ctx.lineTo(sx + 40, -6); ctx.lineTo(sx + 40, 6); ctx.closePath();
    paint(ctx, t.metal, 2);
  }
  ctx.lineCap = 'butt';
  ctx.restore();
}

function drawCannonTower(ctx, tier, angle, recoil) {
  const t = TIERS[tier - 1];
  drawPlate(ctx, tier);
  ctx.save(); ctx.rotate(angle);
  const r = -recoil * 9;
  rrPath(ctx, r - 2, -12, 46, 24, 6); paint(ctx, '#5c6166', 4);
  rrPath(ctx, r + 36, -15, 12, 30, 4); paint(ctx, t.base, 4);
  circ(ctx, 0, 0, 23); paint(ctx, t.base, 4);
  circ(ctx, 0, 0, 12); paint(ctx, t.light, 3);
  ctx.restore();
}

function drawMeleeTower(ctx, tier, angle, punch) {
  const t = TIERS[tier - 1];
  drawPlate(ctx, tier);
  drawTurntable(ctx, tier);
  ctx.save(); ctx.rotate(angle);
  const e = Math.sin(Math.min(1, punch) * Math.PI) * 22;
  rrPath(ctx, -4, -8, 34 + e, 16, 6); paint(ctx, '#7b8288', 4);
  rrPath(ctx, 24 + e, -18, 24, 36, 10); paint(ctx, t.base, 4);  // punho
  ctx.strokeStyle = t.dark; ctx.lineWidth = 3;
  for (const y of [-8, 0, 8]) { ctx.beginPath(); ctx.moveTo(38 + e, y); ctx.lineTo(46 + e, y); ctx.stroke(); }
  circ(ctx, 0, 0, 10); paint(ctx, t.light, 3);
  ctx.restore();
}

function drawBombTower(ctx, tier, angle, recoil) {
  const t = TIERS[tier - 1];
  drawPlate(ctx, tier);
  ctx.save(); ctx.rotate(angle);
  for (let i = 0; i < 8; i++) {
    ctx.save(); ctx.rotate(i * TAU / 8);
    rrPath(ctx, 26, -6, 9, 12, 3); paint(ctx, t.light, 3);
    ctx.restore();
  }
  const s = 1 - recoil * 0.12;
  ctx.scale(s, s);
  circ(ctx, 0, 0, 30); paint(ctx, '#53585e', 4);
  circ(ctx, 0, 0, 20); paint(ctx, '#3a3e43', 3);
  circ(ctx, 0, 0, 12); paint(ctx, '#1f2124', 2);
  if (recoil < 0.3) { circ(ctx, 2, -2, 8); paint(ctx, '#2e3135', 2); circ(ctx, 0, -4, 2.5); ctx.fillStyle = '#888'; ctx.fill(); }
  ctx.restore();
}

function drawMageTower(ctx, tier, time, charge) {
  const t = TIERS[tier - 1];
  drawPlate(ctx, tier);
  ctx.lineCap = 'round';
  for (let i = 0; i < 4; i++) {
    ctx.save(); ctx.rotate(i * Math.PI / 2 + Math.PI / 4);
    ctx.beginPath(); ctx.moveTo(30, -10); ctx.lineTo(40, 0); ctx.lineTo(30, 10);
    ctx.lineWidth = 9; ctx.strokeStyle = OUTLINE; ctx.stroke();
    ctx.lineWidth = 4; ctx.strokeStyle = t.metal; ctx.stroke();
    ctx.restore();
  }
  ctx.lineCap = 'butt';
  circ(ctx, 0, 0, 25); paint(ctx, '#3d4752', 4);
  ctx.save(); ctx.rotate(time * 1.5);
  ctx.setLineDash([6, 6]); circ(ctx, 0, 0, 19); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(140,210,255,0.6)'; ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
  const pr = 12 + Math.sin(time * 4) * 1.2 + charge * 3;
  ctx.shadowColor = '#46b4ff'; ctx.shadowBlur = 16;
  circ(ctx, 0, 0, pr); paint(ctx, '#2f9cf2', 3, '#1d4f80');
  ctx.shadowBlur = 0;
  circ(ctx, -4, -4, pr * 0.32); ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.fill();
}

function drawGoldMine(ctx, tier, spin) {
  const t = TIERS[tier - 1];
  drawPlate(ctx, tier);
  ctx.save(); ctx.rotate(spin);
  circ(ctx, 0, 0, 33); ctx.fillStyle = '#c56f14'; ctx.fill();
  for (let i = 0; i < 12; i++) {
    const a = i * TAU / 12;
    circ(ctx, Math.cos(a) * 33, Math.sin(a) * 33, 6.5); paint(ctx, '#f2a531', 3);
  }
  ctx.restore();
  circ(ctx, 0, 0, 28); paint(ctx, '#959ca1', 4);
  circ(ctx, 0, 0, 17); paint(ctx, t.metal, 3);
  ctx.save(); ctx.rotate(-spin * 2);
  ctx.strokeStyle = '#6d7479'; ctx.lineWidth = 3;
  for (let i = 0; i < 3; i++) { ctx.rotate(TAU / 3); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(13, 0); ctx.stroke(); }
  ctx.restore();
  circ(ctx, 0, 0, 5); paint(ctx, '#f2c14e', 2);
}

function drawHarvester(ctx, tier, spin) {
  const t = TIERS[tier - 1];
  drawPlate(ctx, tier);
  circ(ctx, 0, 0, 31); paint(ctx, '#6f767c', 4);
  ctx.save(); ctx.rotate(spin);
  for (let i = 0; i < 3; i++) {
    ctx.rotate(TAU / 3);
    ctx.beginPath(); ctx.moveTo(6, -6); ctx.lineTo(30, -12); ctx.lineTo(30, 4); ctx.lineTo(6, 6); ctx.closePath();
    paint(ctx, t.metal, 3);
  }
  ctx.restore();
  circ(ctx, 0, 0, 10); paint(ctx, t.base, 3);
  circ(ctx, 0, 0, 3.5); ctx.fillStyle = OUTLINE; ctx.fill();
}

const COIN_SPOTS = [
  [0, 0], [-16, -12], [16, -12], [-16, 13], [16, 13], [0, -22], [0, 23], [-25, 0], [25, 0],
  [-24, -24], [24, -24], [-24, 24], [24, 24], [-8, -8], [9, 8],
];
function drawStash(ctx, tier) {
  drawPlate(ctx, tier);
  const n = Math.min(COIN_SPOTS.length, 7 + tier);
  for (let i = n - 1; i >= 0; i--) {
    const [x, y] = COIN_SPOTS[i];
    circ(ctx, x, y, 12.5); paint(ctx, '#ecc77c', 3, '#8b6420');
    circ(ctx, x - 3, y - 3, 4); ctx.fillStyle = 'rgba(255,248,215,0.8)'; ctx.fill();
  }
}

// Desenha uma construção (estado no objeto b, ou padrão para ícones).
function drawBuilding(ctx, type, tier, b, time) {
  const ang = b ? b.angle : -Math.PI / 4;
  const anim = b ? b.anim : 0;
  switch (type) {
    case 'wall': return drawWall(ctx, tier);
    case 'door': return drawDoor(ctx, tier);
    case 'slowtrap': return drawSlowTrap(ctx, tier, time);
    case 'arrow': return drawArrowTower(ctx, tier, ang, b ? b.pull : 1);
    case 'cannon': return drawCannonTower(ctx, tier, ang, anim);
    case 'melee': return drawMeleeTower(ctx, tier, ang, anim);
    case 'bomb': return drawBombTower(ctx, tier, ang, anim);
    case 'mage': return drawMageTower(ctx, tier, time, anim);
    case 'goldmine': return drawGoldMine(ctx, tier, b ? b.spin : 0.3);
    case 'harvester': return drawHarvester(ctx, tier, b ? b.spin : 0.3);
    case 'stash': return drawStash(ctx, tier);
  }
}

// ---------- Natureza ----------
function makeTreeShape(r, rnd) {
  const lumps = [];
  const n = 5 + Math.floor(rnd() * 4);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rnd() * 0.4;
    lumps.push([Math.cos(a) * r * 0.5, Math.sin(a) * r * 0.5, r * (0.5 + rnd() * 0.12)]);
  }
  return { lumps, inner: [-r * 0.15 + rnd() * r * 0.1, -r * 0.18 + rnd() * r * 0.1, r * 0.45] };
}
function drawTree(ctx, tr) {
  const { lumps, inner } = tr.shape;
  ctx.fillStyle = '#28432a';
  for (const [x, y, r] of lumps) { circ(ctx, x, y, r + 5); ctx.fill(); }
  circ(ctx, 0, 0, tr.r * 0.7 + 5); ctx.fill();
  ctx.fillStyle = '#3f6b3d';
  for (const [x, y, r] of lumps) { circ(ctx, x, y, r); ctx.fill(); }
  circ(ctx, 0, 0, tr.r * 0.7); ctx.fill();
  circ(ctx, inner[0], inner[1], inner[2]); ctx.fillStyle = '#4c7d47'; ctx.fill();
  circ(ctx, inner[0] - inner[2] * 0.3, inner[1] - inner[2] * 0.3, inner[2] * 0.4); ctx.fillStyle = '#5a8d52'; ctx.fill();
}

function makeStoneShape(r, rnd) {
  const pts = [];
  const n = 7 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + rnd() * 0.3;
    const rr = r * (0.82 + rnd() * 0.2);
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
  }
  return pts;
}
function polyPath(ctx, pts, s = 1, ox = 0, oy = 0) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x * s + ox, y * s + oy) : ctx.moveTo(x * s + ox, y * s + oy)));
  ctx.closePath();
}
function drawStone(ctx, st) {
  polyPath(ctx, st.shape); paint(ctx, '#949a9e', 6, '#464b4f');
  polyPath(ctx, st.shape, 0.62, -st.r * 0.12, -st.r * 0.14); ctx.fillStyle = '#adb3b7'; ctx.fill();
  polyPath(ctx, st.shape, 0.25, -st.r * 0.25, -st.r * 0.28); ctx.fillStyle = '#c5cacd'; ctx.fill();
}

// ---------- Personagens ----------
const SKIN = '#e0b27c';

function drawWeapon(ctx, kind, tier) {
  const t = TIERS[Math.min(tier, 8) - 1];
  switch (kind) {
    case 'pickaxe':
      rrPath(ctx, -4, -4, 56, 8, 3); paint(ctx, '#8a6239', 3);
      ctx.beginPath();
      ctx.moveTo(44, -26); ctx.quadraticCurveTo(60, 0, 44, 26); ctx.lineTo(50, 24);
      ctx.quadraticCurveTo(62, 0, 50, -24); ctx.closePath();
      ctx.beginPath(); ctx.arc(30, 0, 27, -0.95, 0.95); ctx.arc(30, 0, 19, 0.85, -0.85, true); ctx.closePath();
      paint(ctx, t.metal, 3);
      break;
    case 'spear':
      rrPath(ctx, -20, -3.5, 92, 7, 3); paint(ctx, '#8a6239', 3);
      ctx.beginPath(); ctx.moveTo(70, -9); ctx.lineTo(96, 0); ctx.lineTo(70, 9); ctx.closePath();
      paint(ctx, t.metal, 3);
      break;
    case 'bow':
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, -30); ctx.quadraticCurveTo(22, 0, 0, 30);
      ctx.lineWidth = 9; ctx.strokeStyle = OUTLINE; ctx.stroke();
      ctx.lineWidth = 5; ctx.strokeStyle = t.base; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, -29); ctx.lineTo(0, 29); ctx.lineWidth = 1.5; ctx.strokeStyle = '#f2f2f2'; ctx.stroke();
      ctx.lineCap = 'butt';
      break;
    case 'bomb':
      circ(ctx, 6, 0, 13); paint(ctx, '#33363a', 3);
      ctx.beginPath(); ctx.moveTo(12, -11); ctx.quadraticCurveTo(18, -20, 24, -18);
      ctx.lineWidth = 2.5; ctx.strokeStyle = '#a07a44'; ctx.stroke();
      circ(ctx, 1, -4, 3.5); ctx.fillStyle = '#7d8187'; ctx.fill();
      break;
  }
}

// p: {r, angle, weapon, tier, swing (0..1), hurt}
function drawPlayer(ctx, p) {
  ctx.save();
  ctx.rotate(p.angle);
  const sw = p.swing > 0 ? Math.sin(p.swing * Math.PI) : 0;
  const kind = p.weapon;
  if (kind === 'pickaxe' || kind === 'spear') {
    // mãos seguram a arma do lado direito; o golpe gira o conjunto
    ctx.save();
    if (kind === 'pickaxe') ctx.rotate(-sw * 1.5 + 0.2);
    else ctx.translate(sw * 30, 0);
    ctx.save(); ctx.translate(14, 22); ctx.rotate(kind === 'pickaxe' ? -0.25 : 0);
    drawWeapon(ctx, kind, p.tier);
    ctx.restore();
    circ(ctx, 18, 22, 9.5); paint(ctx, SKIN, 3.5);
    ctx.restore();
    circ(ctx, 24, -20, 9.5); paint(ctx, SKIN, 3.5);
  } else if (kind === 'bow') {
    ctx.save(); ctx.translate(30, 0); drawWeapon(ctx, 'bow', p.tier); ctx.restore();
    circ(ctx, 30, 0, 9.5); paint(ctx, SKIN, 3.5);
    circ(ctx, 12 - sw * 10, 16, 9.5); paint(ctx, SKIN, 3.5);
  } else {
    ctx.save(); ctx.translate(20 + sw * 8, 24); drawWeapon(ctx, 'bomb', p.tier); ctx.restore();
    circ(ctx, 20 + sw * 8, 24, 9.5); paint(ctx, SKIN, 3.5);
    circ(ctx, 24, -20, 9.5); paint(ctx, SKIN, 3.5);
  }
  circ(ctx, 0, 0, p.r); paint(ctx, p.hurt > 0 ? '#f08a74' : SKIN, 4.5);
  ctx.restore();
}

function drawZombie(ctx, z) {
  const zt = ZOMBIE_TIERS[z.tier - 1];
  const s = z.r / 26;
  ctx.save();
  ctx.rotate(z.angle);
  ctx.scale(s, s);
  const reach = Math.sin(Math.min(1, z.atk) * Math.PI) * 10;
  const wob = Math.sin(z.walk) * 4;
  circ(ctx, 22 + reach + wob, -16, 8.5); paint(ctx, zt.dark, 3.5);
  circ(ctx, 22 + reach - wob, 16, 8.5); paint(ctx, zt.dark, 3.5);
  circ(ctx, 0, 0, 26); paint(ctx, z.hitFlash > 0 ? '#ffffff' : zt.color, 4.5);
  circ(ctx, 6, -8, 4); ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();
  circ(ctx, 6, 8, 4); ctx.fill();
  if (z.boss) {
    ctx.beginPath(); ctx.moveTo(-8, -12); ctx.lineTo(-2, -24); ctx.lineTo(4, -12);
    ctx.moveTo(-8, 12); ctx.lineTo(-2, 24); ctx.lineTo(4, 12);
    ctx.fillStyle = '#f0e6c8'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = OUTLINE; ctx.stroke();
  }
  ctx.restore();
}

// ---------- Ícones ----------
function drawResIcon(ctx, kind, s) {
  ctx.save(); ctx.scale(s / 40, s / 40);
  if (kind === 'wood') {
    ctx.rotate(-0.5);
    rrPath(ctx, -16, -8, 32, 16, 7); paint(ctx, '#9b6b3c', 3);
    circ(ctx, 12, 0, 7.5); paint(ctx, '#d7ad74', 3);
    circ(ctx, 12, 0, 3); paint(ctx, null, 1.5, '#9b6b3c');
  } else if (kind === 'stone') {
    polyPath(ctx, [[-15, 4], [-10, -10], [4, -15], [15, -5], [13, 10], [-2, 15]]); paint(ctx, '#9aa0a5', 3);
    polyPath(ctx, [[-8, -4], [-4, -9], [5, -9], [6, -2]]); ctx.fillStyle = '#c3c8cc'; ctx.fill();
  } else if (kind === 'gold') {
    circ(ctx, 0, 0, 15); paint(ctx, '#f0c04a', 3, '#8b6420');
    circ(ctx, 0, 0, 9); paint(ctx, '#e0a92c', 2, '#a9791e');
  } else if (kind === 'shield') {
    ctx.beginPath(); ctx.moveTo(0, -16); ctx.lineTo(14, -10); ctx.quadraticCurveTo(13, 8, 0, 17);
    ctx.quadraticCurveTo(-13, 8, -14, -10); ctx.closePath(); paint(ctx, '#5bb0e8', 3);
  } else if (kind === 'potion') {
    rrPath(ctx, -4, -17, 8, 8, 2); paint(ctx, '#a07a44', 2.5);
    circ(ctx, 0, 3, 13); paint(ctx, '#e8505a', 3);
    circ(ctx, -4, -1, 3.5); ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fill();
  }
  ctx.restore();
}

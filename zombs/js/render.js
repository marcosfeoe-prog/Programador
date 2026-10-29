'use strict';
// Desenho do mundo no canvas principal e no minimapa.

const R = {
  canvas: null, ctx: null, w: 0, h: 0, dpr: 1, scale: 1,
  view: { x0: 0, y0: 0, x1: 0, y1: 0 },
};

function resize() {
  R.dpr = Math.min(2, window.devicePixelRatio || 1);
  R.w = window.innerWidth; R.h = window.innerHeight;
  R.canvas.width = Math.round(R.w * R.dpr); R.canvas.height = Math.round(R.h * R.dpr);
  R.canvas.style.width = R.w + 'px'; R.canvas.style.height = R.h + 'px';
  // ~1800 px de mundo visíveis na horizontal em telas grandes; mais zoom em telas pequenas
  R.scale = Math.max(R.w / 1900, R.h / 1060, 0.45);
}

function screenToWorld(sx, sy) {
  return { x: (sx - R.w / 2) / R.scale + G.cam.x, y: (sy - R.h / 2) / R.scale + G.cam.y };
}
function worldToScreen(wx, wy) {
  return { x: (wx - G.cam.x) * R.scale + R.w / 2, y: (wy - G.cam.y) * R.scale + R.h / 2 };
}
const visible = (x, y, r) => x + r > R.view.x0 && x - r < R.view.x1 && y + r > R.view.y0 && y - r < R.view.y1;

function drawGround(ctx) {
  const v = R.view;
  ctx.fillStyle = '#4f6c3b';
  ctx.fillRect(v.x0, v.y0, v.x1 - v.x0, v.y1 - v.y0);
  const x0 = Math.max(0, v.x0), y0 = Math.max(0, v.y0), x1 = Math.min(WORLD, v.x1), y1 = Math.min(WORLD, v.y1);
  ctx.fillStyle = '#6b8a4f';
  ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
  ctx.strokeStyle = '#61804a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let x = Math.ceil(x0 / CELL) * CELL; x <= x1; x += CELL) { ctx.moveTo(x, y0); ctx.lineTo(x, y1); }
  for (let y = Math.ceil(y0 / CELL) * CELL; y <= y1; y += CELL) { ctx.moveTo(x0, y); ctx.lineTo(x1, y); }
  ctx.stroke();
}

function drawBar(ctx, x, y, w, frac, color, h = 8) {
  rrPath(ctx, x - w / 2 - 2, y - 2, w + 4, h + 4, 4); ctx.fillStyle = 'rgba(30,30,30,0.75)'; ctx.fill();
  if (frac > 0) { rrPath(ctx, x - w / 2, y, w * clamp(frac, 0, 1), h, 3); ctx.fillStyle = color; ctx.fill(); }
}

function drawBuildingAt(ctx, b, alpha = 1) {
  ctx.save();
  ctx.translate(b.x, b.y);
  if (b.size === 2) {
    const age = G.time - b.born;
    const pop = age < 0.25 ? 0.7 + age * 1.2 : 1;
    ctx.scale(pop, pop);
  } else {
    const age = G.time - b.born;
    if (age < 0.2) { const pop = 0.6 + age * 2; ctx.scale(pop, pop); }
  }
  ctx.globalAlpha = alpha;
  drawBuilding(ctx, b.type, b.tier, b, G.time);
  ctx.restore();
}

function render() {
  const ctx = R.ctx;
  ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
  ctx.clearRect(0, 0, R.w, R.h);
  const s = R.scale;
  R.view = {
    x0: G.cam.x - R.w / 2 / s, y0: G.cam.y - R.h / 2 / s,
    x1: G.cam.x + R.w / 2 / s, y1: G.cam.y + R.h / 2 / s,
  };
  ctx.setTransform(R.dpr * s, 0, 0, R.dpr * s, R.dpr * (R.w / 2 - G.cam.x * s), R.dpr * (R.h / 2 - G.cam.y * s));
  drawGround(ctx);

  // zona de construção
  if (G.build && G.stash) {
    circ(ctx, G.stash.x, G.stash.y, BUILD_RANGE);
    ctx.fillStyle = 'rgba(255,255,255,0.06)'; ctx.fill();
    ctx.setLineDash([18, 14]); ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke(); ctx.setLineDash([]);
  }

  const vis = [];
  for (const b of G.buildings.values()) if (visible(b.x, b.y, 60)) vis.push(b);
  for (const b of vis) if (b.type === 'slowtrap') drawBuildingAt(ctx, b);
  for (const b of vis) if (b.type !== 'slowtrap') drawBuildingAt(ctx, b);

  // alcance da construção selecionada
  const sel = G.selected;
  if (sel && BUILDINGS[sel.type].tower) {
    circ(ctx, sel.x, sel.y, towerStat(sel, 'range'));
    ctx.fillStyle = 'rgba(255,255,255,0.07)'; ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.stroke();
  }
  if (sel && sel.type === 'harvester') {
    circ(ctx, sel.x, sel.y, BUILDINGS.harvester.radius);
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
  }
  if (sel) {
    const h = sel.size * CELL / 2;
    rrPath(ctx, sel.x - h - 4, sel.y - h - 4, h * 2 + 8, h * 2 + 8, 12);
    ctx.lineWidth = 3; ctx.strokeStyle = '#ffffff'; ctx.stroke();
  }

  // pedras
  for (const o of G.resources) {
    if (o.type !== 'stone' || !visible(o.x, o.y, o.r + 10)) continue;
    ctx.save();
    ctx.translate(o.x + Math.cos(o.wobA) * o.wob * 6, o.y + Math.sin(o.wobA) * o.wob * 6);
    drawStone(ctx, o);
    ctx.restore();
  }

  // zumbis
  for (const z of G.zombies) {
    if (!visible(z.x, z.y, z.r + 20)) continue;
    ctx.save(); ctx.translate(z.x, z.y); drawZombie(ctx, z); ctx.restore();
  }

  // jogador
  const p = G.player;
  if (G.state !== 'menu' && p.alive) {
    ctx.save(); ctx.translate(p.x, p.y);
    drawPlayer(ctx, { r: p.r, angle: p.angle, weapon: p.weapon, tier: p.owned[p.weapon], swing: p.swing, hurt: p.hurt });
    ctx.restore();
  }

  // projéteis
  for (const pr of G.projectiles) {
    if (!visible(pr.x, pr.y, 40)) continue;
    ctx.save(); ctx.translate(pr.x, pr.y);
    if (pr.kind === 'arrow') {
      ctx.rotate(pr.a);
      ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(12, 0); ctx.lineWidth = 4; ctx.strokeStyle = OUTLINE; ctx.stroke();
      ctx.beginPath(); ctx.moveTo(18, 0); ctx.lineTo(8, -6); ctx.lineTo(8, 6); ctx.closePath(); paint(ctx, '#d6dadd', 2);
      ctx.beginPath(); ctx.moveTo(-22, 0); ctx.lineTo(-28, -5); ctx.moveTo(-22, 0); ctx.lineTo(-28, 5); ctx.lineWidth = 3; ctx.strokeStyle = '#e9e9e9'; ctx.stroke();
    } else if (pr.kind === 'ball') {
      circ(ctx, 0, 0, 10); paint(ctx, '#3a3d41', 3);
      circ(ctx, -3, -3, 3); ctx.fillStyle = '#7b8086'; ctx.fill();
    } else if (pr.kind === 'orb') {
      ctx.shadowColor = '#4ab6ff'; ctx.shadowBlur = 12;
      circ(ctx, 0, 0, 8); paint(ctx, '#56b8ff', 2.5, '#1d4f80');
      ctx.shadowBlur = 0;
    } else if (pr.kind === 'lob') {
      ctx.save(); ctx.globalAlpha = 0.25; circ(ctx, 0, 0, 12); ctx.fillStyle = '#000'; ctx.fill(); ctx.restore();
      const sc = 1 + pr.h * 0.8;
      ctx.translate(0, -pr.h * 70); ctx.scale(sc, sc);
      circ(ctx, 0, 0, 11); paint(ctx, '#2f3235', 3);
      ctx.beginPath(); ctx.moveTo(5, -9); ctx.lineTo(9, -15); ctx.lineWidth = 2.5; ctx.strokeStyle = '#a07a44'; ctx.stroke();
      circ(ctx, 9, -16, 3); ctx.fillStyle = Math.random() < 0.5 ? '#ffd34d' : '#ff7a2e'; ctx.fill();
    }
    ctx.restore();
  }

  // árvores (por cima de tudo, como copas)
  for (const o of G.resources) {
    if (o.type !== 'tree' || !visible(o.x, o.y, o.r + 20)) continue;
    ctx.save();
    ctx.translate(o.x + Math.cos(o.wobA) * o.wob * 6, o.y + Math.sin(o.wobA) * o.wob * 6);
    drawTree(ctx, o);
    ctx.restore();
  }

  // partículas
  for (const pt of G.particles) {
    const k = pt.life / pt.max;
    if (pt.ring) {
      circ(ctx, pt.x, pt.y, pt.r * (1.1 - k * 0.6));
      ctx.globalAlpha = k; ctx.lineWidth = 10 * k; ctx.strokeStyle = pt.color; ctx.stroke();
      ctx.fillStyle = 'rgba(255,200,90,0.25)'; ctx.fill(); ctx.globalAlpha = 1;
      continue;
    }
    ctx.globalAlpha = Math.min(1, k * 1.5);
    circ(ctx, pt.x, pt.y, pt.r * (0.5 + k * 0.5)); ctx.fillStyle = pt.color; ctx.fill();
  }
  ctx.globalAlpha = 1;

  // barras de vida
  for (const b of vis) {
    if (b.hp < b.maxHp) {
      const h = b.size * CELL / 2;
      drawBar(ctx, b.x, b.y + h + 6, b.size * CELL * 0.8, b.hp / b.maxHp, '#5fd16b', 7);
    }
  }
  for (const z of G.zombies) {
    if (z.hp < z.maxHp && visible(z.x, z.y, z.r + 20)) drawBar(ctx, z.x, z.y + z.r + 10, z.r * 2.2, z.hp / z.maxHp, '#e04848', 6);
  }

  // fantasma da construção
  if (G.build && G.state === 'play') {
    const def = BUILDINGS[G.build];
    const { cx, cy } = ghostCell(G.build);
    const err = placementError(G.build, cx, cy);
    const gx = (cx + def.size / 2) * CELL, gy = (cy + def.size / 2) * CELL;
    ctx.save(); ctx.translate(gx, gy); ctx.globalAlpha = 0.55;
    drawBuilding(ctx, G.build, 1, null, G.time);
    ctx.globalAlpha = 1;
    const h = def.size * CELL / 2;
    rrPath(ctx, -h, -h, h * 2, h * 2, 8);
    ctx.fillStyle = err ? 'rgba(230,60,60,0.35)' : 'rgba(255,255,255,0.15)'; ctx.fill();
    ctx.restore();
    if (def.tower) {
      circ(ctx, gx, gy, def.range); ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.stroke();
    }
  }

  // noite: escurece tudo exceto a área ao redor do jogador
  if (G.nightAlpha > 0.01) {
    ctx.setTransform(R.dpr, 0, 0, R.dpr, 0, 0);
    const c = worldToScreen(p.x, p.y);
    const g = ctx.createRadialGradient(c.x, c.y, 120 * s, c.x, c.y, 900 * s);
    const a = 0.5 * G.nightAlpha;
    g.addColorStop(0, `rgba(8,14,38,${a * 0.45})`);
    g.addColorStop(1, `rgba(8,14,38,${a})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, R.w, R.h);
    ctx.setTransform(R.dpr * s, 0, 0, R.dpr * s, R.dpr * (R.w / 2 - G.cam.x * s), R.dpr * (R.h / 2 - G.cam.y * s));
  }

  // textos flutuantes, nome e vida do jogador
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = 'bold 24px "Hammersmith One", sans-serif';
  for (const t of G.texts) {
    ctx.globalAlpha = Math.min(1, t.life * 2);
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = t.color; ctx.fillText(t.text, t.x, t.y);
  }
  ctx.globalAlpha = 1;
  if (G.state !== 'menu' && p.alive) {
    ctx.font = '22px "Hammersmith One", sans-serif';
    ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.strokeText(G.name, p.x, p.y - p.r - 26);
    ctx.fillStyle = '#fff'; ctx.fillText(G.name, p.x, p.y - p.r - 26);
    drawBar(ctx, p.x, p.y + p.r + 14, 70, p.hp / p.maxHp, '#5fd16b', 8);
    if (p.shieldTier) drawBar(ctx, p.x, p.y + p.r + 28, 70, p.shield / SHIELD.hp[p.shieldTier - 1], '#5bb0e8', 6);
  }
}

// ---------- Minimapa ----------
const Mini = { canvas: null, ctx: null, base: null, size: 170, t: 0 };
function buildMiniBase() {
  const S = Mini.size;
  const c = document.createElement('canvas');
  c.width = c.height = S * 2;
  const x = c.getContext('2d');
  x.scale(2, 2);
  x.fillStyle = '#6b8a4f'; x.fillRect(0, 0, S, S);
  const k = S / WORLD;
  for (const o of G.resources) {
    x.fillStyle = o.type === 'tree' ? '#3b6339' : '#8d9397';
    x.beginPath(); x.arc(o.x * k, o.y * k, Math.max(1.2, o.r * k), 0, TAU); x.fill();
  }
  Mini.base = c;
}
function renderMini(dt) {
  Mini.t -= dt;
  if (Mini.t > 0) return;
  Mini.t = 0.15;
  const ctx = Mini.ctx, S = Mini.size, k = S / WORLD;
  ctx.setTransform(2, 0, 0, 2, 0, 0);
  ctx.drawImage(Mini.base, 0, 0, S, S);
  if (G.nightAlpha > 0.01) { ctx.fillStyle = `rgba(8,14,38,${0.35 * G.nightAlpha})`; ctx.fillRect(0, 0, S, S); }
  if (G.stash) {
    ctx.beginPath(); ctx.arc(G.stash.x * k, G.stash.y * k, BUILD_RANGE * k, 0, TAU);
    ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.stroke();
  }
  for (const b of G.buildings.values()) {
    ctx.fillStyle = b.type === 'stash' ? '#ffd34d' : TIERS[b.tier - 1].light;
    const sz = Math.max(1.5, b.size * CELL * k);
    ctx.fillRect(b.cx * CELL * k, b.cy * CELL * k, sz, sz);
  }
  ctx.fillStyle = '#ff4a4a';
  for (const z of G.zombies) ctx.fillRect(z.x * k - 1, z.y * k - 1, z.boss ? 4 : 2, z.boss ? 4 : 2);
  const p = G.player;
  if (G.state !== 'menu') {
    ctx.beginPath(); ctx.arc(p.x * k, p.y * k, 3, 0, TAU); ctx.fillStyle = '#fff'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 1;
    ctx.strokeRect(R.view.x0 * k, R.view.y0 * k, (R.view.x1 - R.view.x0) * k, (R.view.y1 - R.view.y0) * k);
  }
}

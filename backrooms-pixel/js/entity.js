// O Vagante: entidade que perambula pelo Nível 0, ouve passos de corrida,
// enxerga a lanterna e persegue quem cruza o seu caminho.
import { wrap, wdelta } from './util.js';
import { findPath, torusDist } from './levels.js';

export function lineOfSight(L, x, y, dx, dy) {
  const S = L.S, g = L.grid;
  const d = Math.hypot(dx, dy);
  const n = Math.ceil(d / 0.2);
  for (let k = 1; k < n; k++) {
    const cx = Math.floor(x + (dx * k) / n), cy = Math.floor(y + (dy * k) / n);
    if (g[wrap(cy, S) * S + wrap(cx, S)] !== 0) return false;
  }
  return true;
}

export class Vagante {
  constructor(L, avoidCell) {
    this.L = L;
    this.state = 'wander';
    this.path = [];
    this.wait = 2;
    this.anim = 0;
    this.speed = 0;
    this.cool = 6;
    this.repath = 0;
    this.lostT = 0;
    this.stepT = 0;
    this.dist = 99;
    this.los = false;
    this.lastSeen = null;
    this.teleportFar(avoidCell, 30);
  }

  cellOf(x, y) { const S = this.L.S; return wrap(Math.floor(y), S) * S + wrap(Math.floor(x), S); }

  teleportFar(cell, min) {
    const L = this.L, S = L.S;
    for (let t = 0; t < 4000; t++) {
      const c = Math.floor(Math.random() * S * S);
      if (L.grid[c] === 0 && L.dist0[c] >= 0 && torusDist(S, c, cell) > min) {
        this.x = (c % S) + 0.5; this.y = Math.floor(c / S) + 0.5; this.path = [];
        return;
      }
    }
  }

  goTo(cell) {
    const L = this.L;
    this.path = findPath(L.grid, L.S, this.cellOf(this.x, this.y), cell, 400);
  }

  pickWander(playerCell) {
    const L = this.L, S = L.S;
    // às vezes vaga em direção à região do jogador (sem saber exatamente onde ele está)
    const near = Math.random() < 0.45;
    const base = near ? playerCell : this.cellOf(this.x, this.y);
    const r = near ? 9 : 16;
    for (let t = 0; t < 200; t++) {
      const x = (base % S) + Math.floor((Math.random() * 2 - 1) * r);
      const y = Math.floor(base / S) + Math.floor((Math.random() * 2 - 1) * r);
      const c = wrap(y, S) * S + wrap(x, S);
      if (L.grid[c] === 0 && torusDist(S, c, this.cellOf(this.x, this.y)) > 5) { this.goTo(c); return; }
    }
  }

  // g: { player, flashOn, running, onSpotted(), onCatch() }
  update(dt, g) {
    const L = this.L, S = L.S, p = g.player;
    const dx = wdelta(p.x - this.x, S), dy = wdelta(p.y - this.y, S);
    const dist = Math.hypot(dx, dy);
    this.dist = dist;
    this.los = dist < 18 && lineOfSight(L, this.x, this.y, dx, dy);
    this.cool -= dt;
    const pCell = this.cellOf(p.x, p.y);

    if (this.cool <= 0) {
      const sees = this.los && (dist < 7 || (g.flashOn && dist < 15) || (dist < 11 && p.speed > 0.5));
      if (sees) {
        if (this.state !== 'chase') { this.state = 'chase'; g.onSpotted(); }
        this.lastSeen = pCell;
        this.lostT = 0;
      } else if (this.state === 'chase') {
        this.lostT += dt;
        if (this.lostT > 4.5) { this.state = 'search'; this.goTo(this.lastSeen); }
      } else if (g.running && dist < 12 && this.state === 'wander') {
        this.state = 'search';
        this.goTo(pCell);
      }
    }

    let speed = 0;
    if (this.state === 'wander') {
      if (!this.path.length) {
        this.wait -= dt;
        if (this.wait <= 0) { this.pickWander(pCell); this.wait = 1.5 + Math.random() * 3; }
      } else speed = 0.95;
    } else if (this.state === 'search') {
      speed = 1.7;
      if (!this.path.length) { this.state = 'wander'; this.wait = 3; }
    } else if (this.state === 'chase') {
      speed = 2.75;
      this.repath -= dt;
      if (this.repath <= 0) { this.goTo(pCell); this.repath = 0.4; }
    }

    // anda: direto ao jogador se o vê de perto, senão pelo caminho
    let tx = null, ty = null;
    if (this.state === 'chase' && this.los && dist < 2.5) { tx = this.x + dx; ty = this.y + dy; }
    else if (this.path.length) {
      const c = this.path[0];
      tx = this.x + wdelta((c % S) + 0.5 - this.x, S);
      ty = this.y + wdelta(Math.floor(c / S) + 0.5 - this.y, S);
    }
    this.speed = 0;
    if (tx !== null && speed > 0) {
      const mx = tx - this.x, my = ty - this.y, md = Math.hypot(mx, my);
      if (md < 0.08 && this.path.length) this.path.shift();
      else if (md > 0) {
        const s = Math.min(md, speed * dt);
        this.x = wrap(this.x + (mx / md) * s, S);
        this.y = wrap(this.y + (my / md) * s, S);
        this.speed = speed;
        this.face = Math.atan2(my, mx);
      }
    }
    this.anim += dt * this.speed * 2.6;
    this.stepT -= dt * this.speed;
    let step = false;
    if (this.speed > 0 && this.stepT <= 0) { this.stepT = 0.85; step = true; }

    if (this.state === 'chase' && dist < 0.6 && this.cool <= 0) {
      g.onCatch();
      this.state = 'wander';
      this.cool = 12;
      this.teleportFar(pCell, 28);
    }
    return step;
  }

  frame() { return Math.floor(this.anim) & 3; }
}

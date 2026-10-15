// Radar de entidades (item achado no Nível 5, porta 666): um mostrador verde
// no canto da tela com as entidades por perto, girando com o olhar. Junta as
// posições do que cada nível tiver: Sorridentes, Observador, Cães, Ratos da
// Morte, o Hóspede, as criaturas dos Níveis 35 e 88 — e o que o nível
// declarar em `radarEntities()`.
import { clamp, TAU } from './util.js';

const RANGE = 45;

export class Radar {
  constructor(game) {
    this.game = game;
    const cv = document.createElement('canvas');
    cv.id = 'radar';
    cv.width = cv.height = 220;
    Object.assign(cv.style, {
      position: 'absolute',
      right: 'calc(12px + var(--safe-r, 0px))',
      top: 'calc(118px + var(--safe-t, 0px))',
      width: '104px',
      height: '104px',
      opacity: '0.88',
      display: 'none',
      pointerEvents: 'none',
    });
    document.getElementById('hud').appendChild(cv);
    this.cv = cv;
    this.ctx = cv.getContext('2d');
    this.sweep = 0;
    this.beepT = 0;
  }

  // Lista de { x, z } das entidades ativas no nível atual.
  collect() {
    const g = this.game;
    const L = g.level;
    const out = [];
    if (!L) return out;
    if (g.smilers) for (const s of g.smilers.pool) if (s.active) out.push({ x: s.x, z: s.z });
    if (g.watcher && g.watcher.state === 1) out.push({ x: g.watcher.mesh.position.x, z: g.watcher.mesh.position.z });
    if (L.hounds && L.hounds.pool) for (const h of L.hounds.pool) if (h.active) out.push({ x: h.x, z: h.z });
    if (L.rats && L.rats.packs) for (const p of L.rats.packs) if (p.active) out.push({ x: p.x, z: p.z, small: true });
    for (const c of [L.creature, L.guest]) {
      if (!c) continue;
      const on = c.active !== undefined ? c.active : c.state && c.state !== 'off' && c.state !== 0;
      if (!on) continue;
      const pos = c.x !== undefined ? c : c.root ? c.root.position : c.mesh ? c.mesh.position : null;
      if (pos) out.push({ x: pos.x, z: pos.z });
    }
    if (L.radarEntities) out.push(...L.radarEntities());
    return out;
  }

  update(dt) {
    const g = this.game;
    const on = g.running && !g.paused && g.inventory && g.inventory.has('radar') && !g.radarOff;
    this.cv.style.display = on ? 'block' : 'none';
    if (!on) return;
    const c = this.ctx;
    const S = this.cv.width;
    const R = S / 2 - 6;
    const P = g.player;
    this.sweep = (this.sweep + dt * 2.2) % TAU;
    c.clearRect(0, 0, S, S);
    c.save();
    c.translate(S / 2, S / 2);
    c.fillStyle = 'rgba(2,22,10,0.78)';
    c.beginPath();
    c.arc(0, 0, R, 0, TAU);
    c.fill();
    c.strokeStyle = 'rgba(60,255,140,0.45)';
    c.lineWidth = 2;
    for (const k of [0.33, 0.66, 1]) {
      c.beginPath();
      c.arc(0, 0, R * k, 0, TAU);
      c.stroke();
    }
    c.beginPath();
    c.moveTo(-R, 0);
    c.lineTo(R, 0);
    c.moveTo(0, -R);
    c.lineTo(0, R);
    c.stroke();
    // feixe girando
    const grad = c.createConicGradient ? c.createConicGradient(this.sweep - 0.6, 0, 0) : null;
    if (grad) {
      grad.addColorStop(0, 'rgba(60,255,140,0)');
      grad.addColorStop(0.09, 'rgba(60,255,140,0.35)');
      grad.addColorStop(0.1, 'rgba(60,255,140,0)');
      c.fillStyle = grad;
      c.beginPath();
      c.arc(0, 0, R, 0, TAU);
      c.fill();
    }
    // entidades (frente = para cima)
    const cy = Math.cos(P.yaw);
    const sy = Math.sin(P.yaw);
    let nearest = 1e9;
    for (const e of this.collect()) {
      const dx = e.x - P.pos.x;
      const dz = e.z - P.pos.z;
      const d = Math.hypot(dx, dz);
      nearest = Math.min(nearest, d);
      // direita = (cos, −sin); frente = (−sin, −cos)
      const rx = dx * cy - dz * sy;
      const fz = -dx * sy - dz * cy;
      const k = Math.min(d, RANGE) / RANGE / Math.max(d, 1e-3);
      const px = rx * k * R;
      const py = -fz * k * R;
      const edge = d > RANGE;
      const pulse = 0.65 + 0.35 * Math.sin(g.time * 8 + e.x);
      c.fillStyle = edge ? 'rgba(255,90,60,0.45)' : `rgba(255,${Math.round(70 * pulse)},50,${0.75 + 0.25 * pulse})`;
      c.beginPath();
      c.arc(px, py, e.small ? 6 : 9, 0, TAU);
      c.fill();
    }
    // o jogador
    c.fillStyle = '#c8ffd8';
    c.beginPath();
    c.moveTo(0, -10);
    c.lineTo(7, 8);
    c.lineTo(-7, 8);
    c.closePath();
    c.fill();
    c.restore();
    // bipe mais rápido quando algo está perto
    this.beepT -= dt;
    if (nearest < 25 && this.beepT <= 0) {
      this.beepT = clamp(nearest / 12, 0.25, 2);
      g.audio.play('beep', { gain: 0.08, rate: 1.6 + (1 - nearest / 25) * 0.6, wet: 0 });
    }
  }
}

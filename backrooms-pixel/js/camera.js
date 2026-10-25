// Câmera tremida: balanço com mola quando a visão se move, passos,
// respiração/mão trêmula, medo e impactos.
import { clamp } from './util.js';

export class CamFX {
  constructor() { this.reset(); }

  reset() {
    this.sx = 0; this.svx = 0;   // balanço horizontal (mola)
    this.sy = 0; this.svy = 0;   // balanço vertical
    this.bob = 0;                // fase da caminhada
    this.bobAmt = 0;
    this.trauma = 0;
    this.t = 0;
    this.out = { yaw: 0, dy: 0, dz: 0, roll: 0, shiftX: 0, shiftY: 0, handX: 0, handY: 0, flX: 0, flY: 0 };
  }

  look(dx, dy) {
    this.svx += clamp(dx, -120, 120) * 2.4;
    this.svy += clamp(dy, -120, 120) * 1.6;
  }

  hit(a) { this.trauma = Math.min(1, this.trauma + a); }

  // Retorna true quando um passo acontece (para o som).
  update(dt, moveSpeed, running, fear, mul) {
    this.t += dt;
    // mola subamortecida: passa do ponto e volta, como uma câmera na mão
    const K = 70, D = 8.5;
    this.svx += (-K * this.sx - D * this.svx) * dt;
    this.svy += (-K * this.sy - D * this.svy) * dt;
    this.sx = clamp(this.sx + this.svx * dt, -22, 22);
    this.sy = clamp(this.sy + this.svy * dt, -14, 14);

    this.bobAmt += ((moveSpeed > 0.1 ? 1 : 0) - this.bobAmt) * Math.min(1, dt * 6);
    const prev = this.bob;
    this.bob += dt * moveSpeed * (running ? 3.1 : 3.4);
    const step = Math.floor(prev / Math.PI) !== Math.floor(this.bob / Math.PI) && this.bobAmt > 0.5;

    const t = this.t;
    const shake = mul;
    const hx = (Math.sin(t * 1.3) * 0.6 + Math.sin(t * 2.9 + 1.7) * 0.3 + Math.sin(t * 7.1) * 0.1) * (0.6 + fear * 3);
    const hy = (Math.sin(t * 1.7 + 0.5) * 0.6 + Math.sin(t * 3.3 + 2.1) * 0.3 + Math.sin(t * 8.3) * 0.1) * (0.5 + fear * 2.5);
    const ba = this.bobAmt * (running ? 1.6 : 1);
    const tr = this.trauma * this.trauma;
    const rx = (Math.random() - 0.5) * tr, ry = (Math.random() - 0.5) * tr;

    const o = this.out;
    o.shiftX = (this.sx * 0.35 + Math.sin(this.bob) * 1.6 * ba + hx + rx * 14) * shake;
    o.shiftY = (this.sy * 0.25 + Math.abs(Math.cos(this.bob)) * 1.4 * ba + hy + ry * 10) * shake;
    o.roll = (this.sx * -0.0042 + Math.sin(this.bob) * 0.008 * ba + hx * 0.003 + rx * 0.08) * shake;
    o.yaw = (hx * 0.0016 + rx * 0.02) * shake;
    o.dy = (this.sy * 0.4 + hy * 0.6) * shake;
    o.dz = Math.sin(this.bob * 2) * 0.014 * ba * Math.min(1, shake + 0.3);
    // mão e facho da lanterna atrasam em relação à câmera
    o.handX = -this.sx * 1.1 + Math.sin(this.bob) * 4 * ba + hx * 1.5;
    o.handY = -this.sy * 0.9 + Math.abs(Math.sin(this.bob)) * 4 * ba + hy * 1.2;
    o.flX = -this.sx * 1.6 + Math.sin(this.bob) * 3 * ba + hx * 2;
    o.flY = -this.sy * 1.4 + Math.abs(Math.sin(this.bob)) * 3 * ba + hy * 2;

    this.trauma = Math.max(0, this.trauma - dt * 0.9);
    return step;
  }
}

// Física do carro de caça: tração e aderência por superfície (asfalto, cascalho, terra,
// lama, campo), direção com limite de aderência, freio de mão, relevo, combustível,
// vento do tornado empurrando e levantando o carro, granizo, detritos e colisões.

import * as THREE from 'three';
import { buildVehicle } from './carBuilder.js';
import { clamp, lerp, damp, wrapAngle } from '../core/math.js';

const _w = { x: 0, y: 0, z: 0 };
const _near = [];

export class Vehicle {
  constructor(model, country, opts = {}) {
    this.model = model;
    this.country = country;
    this.opts = opts;
    const v = buildVehicle(model, country, opts);
    this.v = v;
    this.group = v.group;
    this.spec = v.spec;
    this.x = 0;
    this.z = 0;
    this.y = 0;
    this.yaw = 0;
    this.vx = 0;
    this.vz = 0;
    this.vy = 0;
    this.steer = 0;
    this.pitch = 0;
    this.roll = 0;
    this.susp = 0;
    this.suspV = 0;
    this.health = model.health;
    this.maxHealth = model.health;
    this.fuel = model.fuel;
    this.anchored = false;
    this.anchorK = 0;
    this.tossed = false;
    this.wrecked = false;
    this.lights = false;
    this.odometer = 0;
    this.surface = null;
    this.wind = 0;
    this.windVec = { x: 0, y: 0, z: 0 };
    this.hailHit = 0;
    this.debrisHit = 0;
    this.scanning = false;
    this.scanAngle = 0;
    this.spin = new THREE.Vector3();
    this.rot = new THREE.Euler();
    this.hornT = 0;
    this.events = [];
  }

  get speed() {
    return Math.hypot(this.vx, this.vz);
  }
  get forwardSpeed() {
    return this.vx * Math.sin(this.yaw) + this.vz * Math.cos(this.yaw);
  }

  place(x, z, yaw, world) {
    this.x = x;
    this.z = z;
    this.yaw = yaw;
    this.vx = this.vz = this.vy = 0;
    this.y = world.groundAt(x, z);
    this.tossed = false;
    this.wrecked = false;
    this.updateVisual(0, world);
  }

  update(dt, ctrl, world, weather, debris, wet) {
    if (this.wrecked) return;
    if (this.tossed) return this.updateTossed(dt, world);
    const m = this.model;
    const fx = Math.sin(this.yaw);
    const fz = Math.cos(this.yaw);
    const rx = -Math.cos(this.yaw);
    const rz = Math.sin(this.yaw);
    let vF = this.vx * fx + this.vz * fz;
    let vR = this.vx * rx + this.vz * rz;
    // Superfície.
    const s = world.surfaceAt(this.x, this.z);
    this.surface = s;
    let grip = m.grip;
    let maxS = m.maxSpeed;
    let roll = 0.015;
    const mud = this.opts.tires ? 0.45 : 1;
    if (s.kind === 'road') {
      if (s.surface === 'gravel') {
        grip *= 0.78;
        maxS *= 0.78;
        roll = 0.03;
      } else if (s.surface === 'dirt') {
        grip *= 0.72 - wet * 0.32 * mud;
        maxS *= 0.68 - wet * 0.3 * mud;
        roll = 0.04 + wet * 0.08 * mud;
      }
    } else if (s.kind === 'water') {
      grip *= 0.25;
      maxS = 4;
      roll = 0.4;
    } else if (s.kind === 'urban') {
      grip *= 0.82;
      maxS *= 0.5;
      roll = 0.05;
    } else {
      const crop = s.info?.height ?? 0.5;
      grip *= 0.62 - wet * 0.25 * mud;
      maxS *= (0.32 + m.offroad * 0.25) * (crop > 1.5 ? 0.7 : 1) - wet * 0.1 * mud;
      roll = 0.07 + crop * 0.03 + wet * 0.1 * mud;
    }
    if (this.fuel <= 0) maxS = Math.min(maxS, 3);
    if (this.anchored) maxS = 0;
    maxS = Math.max(2, maxS);
    // Motor e freios.
    const thr = ctrl.throttle;
    const brk = ctrl.brake;
    const boost = ctrl.boost ? 1.12 : 1;
    if (thr > 0) {
      const k = 1 - Math.pow(clamp(Math.abs(vF) / (maxS * boost), 0, 1.2), 2);
      vF += thr * m.accel * boost * Math.max(-0.3, k) * dt * (vF < -0.5 ? 2 : 1);
    }
    if (brk > 0) {
      if (vF > 0.5) vF -= brk * 9 * Math.min(1, grip + 0.2) * dt;
      else vF -= brk * m.accel * 0.55 * dt * (vF > -8 ? 1 : 0);
    }
    if (ctrl.handbrake) vF *= Math.exp(-1.5 * dt);
    // Resistência ao rolamento e do ar.
    vF -= Math.sign(vF) * Math.min(Math.abs(vF), (roll * 9.81 + 0.0006 * vF * vF) * dt);
    if (Math.abs(vF) > maxS * 1.05) vF = lerp(vF, Math.sign(vF) * maxS, Math.min(1, dt * 1.5));
    // Relevo: componente da gravidade ao longo do carro.
    const e = 2.5;
    const hF = world.groundAt(this.x + fx * e, this.z + fz * e);
    const hB = world.groundAt(this.x - fx * e, this.z - fz * e);
    vF -= ((hF - hB) / (2 * e)) * 9.81 * dt;
    // Direção.
    const sp = Math.abs(vF);
    const maxSteer = 0.6 / (1 + sp / 13);
    this.steer = damp(this.steer, ctrl.steer * maxSteer, 9, dt);
    const wb = this.spec.wheelbase;
    let yawRate = (vF * Math.tan(this.steer)) / wb;
    const latMax = grip * 9.81 * (ctrl.handbrake ? 0.6 : 1);
    if (sp > 1) yawRate = clamp(yawRate, -latMax / sp, latMax / sp);
    // Derrapagem com freio de mão.
    if (ctrl.handbrake && sp > 6) yawRate *= 1.35;
    this.yaw = wrapAngle(this.yaw - yawRate * dt);
    // Atrito lateral (pneus seguram o carro de lado).
    const latF = Math.min(Math.abs(vR), grip * 9.81 * (ctrl.handbrake ? 0.35 : 1.4) * dt + Math.abs(vR) * (1 - Math.exp(-6 * grip * dt)));
    vR -= Math.sign(vR) * latF;
    // Recompõe a velocidade no mundo com a nova orientação.
    const nfx = Math.sin(this.yaw);
    const nfz = Math.cos(this.yaw);
    const nrx = -Math.cos(this.yaw);
    const nrz = Math.sin(this.yaw);
    this.vx = nfx * vF + nrx * vR;
    this.vz = nfz * vF + nrz * vR;
    // Vento: empurra (e pode levantar) o carro.
    weather.windAt(this.x, 1.6, this.z, _w);
    this.windVec.x = _w.x;
    this.windVec.y = _w.y;
    this.windVec.z = _w.z;
    const wrx = _w.x - this.vx;
    const wrz = _w.z - this.vz;
    const wr = Math.hypot(wrx, wrz);
    this.wind = Math.hypot(_w.x, _w.z);
    this.anchorK = damp(this.anchorK, this.anchored ? 1 : 0, 2.5, dt);
    const slide = m.slideWind * (1 + this.anchorK * 0.6);
    const lift = this.anchored && m.anchorWind ? m.anchorWind : m.liftWind;
    if (wr > slide * 0.55) {
      const k = (0.5 * 1.2 * 1.0 * 7 * (wr * wr - (slide * 0.55) ** 2)) / m.mass;
      this.vx += (wrx / wr) * k * dt;
      this.vz += (wrz / wr) * k * dt;
    }
    if (this.wind > lift && Math.abs(_w.y) + this.wind > lift * 1.08) this.toss(_w);
    // Integra a posição.
    const ox = this.x;
    const oz = this.z;
    this.x += this.vx * dt;
    this.z += this.vz * dt;
    this.collide(world, dt);
    const dist = Math.hypot(this.x - ox, this.z - oz);
    this.odometer += dist;
    this.fuel = Math.max(0, this.fuel - dist * 0.001 * m.consumption * (1 + thr * 0.3));
    // Altura e inclinação pelo relevo (quatro rodas).
    const g = world.groundAt(this.x, this.z);
    const L2 = this.spec.wheelbase / 2;
    const W2 = this.spec.W / 2 - 0.1;
    const hf = world.groundAt(this.x + nfx * L2, this.z + nfz * L2);
    const hb = world.groundAt(this.x - nfx * L2, this.z - nfz * L2);
    const hr = world.groundAt(this.x + nrx * W2, this.z + nrz * W2);
    const hl = world.groundAt(this.x - nrx * W2, this.z - nrz * W2);
    const pitchT = Math.atan2(hf - hb, L2 * 2);
    const rollT = Math.atan2(hr - hl, W2 * 2);
    // Suspensão: chacoalha mais fora do asfalto e em velocidade.
    const bumpy = s.kind === 'road' && s.surface === 'asphalt' ? 0.002 : s.kind === 'road' ? 0.012 : 0.03;
    this.suspV += (-this.susp * 60 - this.suspV * 8 + (Math.random() - 0.5) * bumpy * sp * 40) * dt;
    this.susp += this.suspV * dt;
    this.pitch = damp(this.pitch, pitchT - vF * 0.0012 * (thr - brk), 10, dt);
    this.roll = damp(this.roll, rollT + yawRate * sp * 0.004, 8, dt);
    this.y = g + this.susp * 0.6;
    // Granizo.
    const hail = weather.hailAt(this.x, this.z);
    this.hailHit = hail.amount * hail.size;
    if (hail.amount > 0.05) {
      const armor = m.hailArmor + (this.opts.hailGuard ? 0.5 : 0);
      this.damage(hail.amount * Math.max(0, hail.size - 1.2) * 0.55 * (1 - Math.min(0.95, armor)) * dt, 'granizo');
    }
    // Detritos atingindo o carro.
    this.debrisHit = 0;
    for (const p of debris.near(this.x, this.y + 1, this.z, 3.2, _near)) {
      const rv = Math.hypot(p.vx - this.vx, p.vy, p.vz - this.vz);
      if (rv > 12) {
        this.damage(rv * 0.12 * p.mass * (1 - Math.min(0.9, m.hailArmor)), 'detritos');
        this.debrisHit += rv;
        p.vx *= -0.3;
        p.vz *= -0.3;
        p.vy = Math.abs(p.vy) * 0.3 + 2;
      }
    }
    // Água: motor afoga.
    if (s.kind === 'water') this.damage(4 * dt, 'água');
    this.updateVisual(dt, world);
  }

  collide(world, dt) {
    const list = world.registry.near(this.x, this.z, 25, _near);
    const R = this.spec.W * 0.6;
    for (const s of list) {
      if (s.state >= 4) continue;
      let r;
      if (s.di === 'tree') {
        if (s.dod >= 2) continue;
        r = 0.6;
      } else if (s.di === 'pole') {
        if (s.dod >= 2) continue;
        r = 0.3;
      } else if (s.minor) continue;
      else r = (s.r || 4) * 0.75;
      const dx = this.x - s.x;
      const dz = this.z - s.z;
      const d = Math.hypot(dx, dz);
      const min = r + R;
      if (d < min && d > 0.001) {
        const nx = dx / d;
        const nz = dz / d;
        this.x = s.x + nx * min;
        this.z = s.z + nz * min;
        const vn = this.vx * nx + this.vz * nz;
        if (vn < 0) {
          if (-vn > 6) this.damage(-vn * 0.9, 'batida');
          this.vx -= vn * nx * 1.3;
          this.vz -= vn * nz * 1.3;
          this.vx *= 0.6;
          this.vz *= 0.6;
        }
      }
    }
    const lim = 11950;
    this.x = clamp(this.x, -lim, lim);
    this.z = clamp(this.z, -lim, lim);
  }

  damage(v, cause) {
    if (v <= 0 || this.wrecked) return;
    this.health = Math.max(0, this.health - v);
    this.lastCause = cause;
    if (this.health <= 0) {
      this.wrecked = true;
      this.events.push({ type: 'wrecked', cause });
    }
  }

  toss(w) {
    this.tossed = true;
    this.vy = 8 + Math.abs(w.y) * 0.5;
    this.vx = w.x * 0.7;
    this.vz = w.z * 0.7;
    this.spin.set((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 4, (Math.random() - 0.5) * 6);
    this.rot.set(this.pitch, this.yaw, this.roll);
    this.events.push({ type: 'tossed' });
  }

  updateTossed(dt, world) {
    this.vy -= 9.81 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.z += this.vz * dt;
    this.rot.x += this.spin.x * dt;
    this.rot.y += this.spin.y * dt;
    this.rot.z += this.spin.z * dt;
    const g = world.groundAt(this.x, this.z);
    if (this.y < g + 0.5 && this.vy < 0) {
      this.y = g + 0.5;
      this.vy = Math.abs(this.vy) * 0.3;
      this.vx *= 0.5;
      this.vz *= 0.5;
      this.spin.multiplyScalar(0.5);
      if (Math.hypot(this.vx, this.vz) < 2) {
        this.health = 0;
        this.wrecked = true;
        this.events.push({ type: 'wrecked', cause: 'tornado' });
      }
    }
    this.group.position.set(this.x, this.y, this.z);
    this.group.rotation.copy(this.rot);
  }

  updateVisual(dt, world) {
    const g = this.group;
    g.position.set(this.x, this.y, this.z);
    g.rotation.order = 'YXZ';
    g.rotation.set(-this.pitch, this.yaw, this.roll);
    const vF = this.forwardSpeed;
    for (const w of this.v.wheels) {
      w.userData.spin = (w.userData.spin || 0) + (vF * dt) / this.spec.wheelR;
      const base = w.userData.side < 0 ? Math.PI : 0;
      w.rotation.order = 'YXZ';
      w.rotation.y = base + (w.userData.front ? -this.steer : 0);
      w.rotation.x = w.userData.side < 0 ? -w.userData.spin : w.userData.spin;
    }
    // Lanternas de freio, faróis e barra de luzes.
    this.v.tailMat.emissiveIntensity = this.braking ? 2.2 : this.lights ? 0.8 : 0.25;
    this.v.headMat.emissiveIntensity = this.lights ? 3 : 0;
    const p = this.v.parts;
    if (p.amber) p.amber.emissiveIntensity = this.lights ? (Math.sin(performance.now() * 0.012) > 0 ? 2.5 : 0.2) : 0;
    if (p.cups) p.cups.rotation.y += dt * (2 + this.wind * 0.9);
    if (p.vane && this.windVec) p.vane.rotation.y = Math.atan2(this.windVec.x, this.windVec.z) - this.yaw;
    if (p.radarHead) {
      if (this.scanning) this.scanAngle += dt * 2.4;
      p.radarHead.rotation.y = this.scanning ? this.scanAngle : damp(p.radarHead.rotation.y, 0, 2, dt);
    }
    if (p.anchors) for (const a of p.anchors) a.position.y = 0.8 - this.anchorK * 0.85;
  }

  // Ponto da câmera do motorista (local do carro).
  driverEye() {
    const s = this.spec;
    return new THREE.Vector3(-s.W * 0.2, s.belt[1][1] + (s.cabin.roof - s.belt[1][1]) * 0.55, -s.L / 2 + s.L * s.cabin.r1 - 0.62);
  }
}

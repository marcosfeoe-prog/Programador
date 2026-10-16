// Pilotos controlados pelo computador: perseguição pura do traçado ideal,
// planejamento de frenagem pelas curvas à frente, desvio de carros e
// recuperação quando ficam presos.
import * as THREE from 'three';
import { ROAD_HALF, WALL_OFF } from './track.js';

export class AIDriver {
  constructor(car, track, skill, rand) {
    this.car = car;
    this.track = track;
    this.skill = skill; // ~0.85..1.0
    this.bias = (rand() - 0.5) * 1.6;
    this.avoid = 0;
    this.stuck = 0;
    this.reverseT = 0;
    this.ctl = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  }

  update(dt, cars) {
    const car = this.car;
    const tr = this.track;
    const ctl = this.ctl;
    const N = tr.N;
    let i = car.idx >= 0 ? car.idx : tr.nearest(car.pos.x, car.pos.z);
    const v = car.forwardSpeed;

    // marcha à ré para sair de enrascadas
    if (this.reverseT > 0) {
      this.reverseT -= dt;
      ctl.throttle = 0;
      ctl.brake = 1;
      ctl.handbrake = false;
      ctl.steer = -this.lastSteer;
      return ctl;
    }

    // desvio de carros à frente
    let want = 0;
    const right = new THREE.Vector3().copy(car.left).negate();
    for (const o of cars) {
      if (o === car) continue;
      const rel = o.pos.clone().sub(car.pos);
      const ahead = rel.dot(car.fwd);
      if (ahead < 1 || ahead > 22) continue;
      const side = rel.dot(right);
      if (Math.abs(side) > 2.8) continue;
      if (o.forwardSpeed > v + 1.5) continue;
      want = side > 0 ? -3.2 : 3.2;
    }
    this.avoid += (want - this.avoid) * Math.min(1, dt * 2.5);

    // ponto-alvo (perseguição pura)
    const look = 7 + Math.max(0, v) * 0.5;
    const k = Math.round(look / tr.ds);
    const j = (i + k) % N;
    const lat = THREE.MathUtils.clamp(tr.line[j] * this.skill + this.avoid + this.bias, -ROAD_HALF + 1.3, ROAD_HALF - 1.3);
    const tp = tr.pose(j, lat);
    const dx = tp.x - car.pos.x;
    const dz = tp.z - car.pos.z;
    const fx = car.fwd.x;
    const fz = car.fwd.z;
    const along = dx * fx + dz * fz;
    const across = -(dx * car.left.x + dz * car.left.z);
    const ang = Math.atan2(across, along);
    const wb = car.model.length * 0.6;
    const delta = Math.atan((2 * wb * Math.sin(ang)) / Math.max(look, 4));
    const maxSteer = 0.6 / (1 + Math.abs(v) / 24);
    // amortece a guinada para evitar oscilação
    const yawRate = car.angVel.dot(car.up);
    ctl.steer = THREE.MathUtils.clamp(delta / maxSteer + yawRate * 0.06, -1, 1);
    this.lastSteer = ctl.steer;

    // velocidade-alvo considerando as curvas à frente
    const decel = 8.5 * this.skill;
    const carF = Math.sqrt(car.model.grip) * Math.pow(0.97, (car.model.mass - 1250) / 170);
    let vt = 200;
    for (let s = 0; s < 90; s += 2) {
      const jj = (i + s) % N;
      const vm = tr.vmax[jj] * (0.82 + 0.2 * this.skill) * carF;
      const dist = Math.max(0, s * tr.ds - 4);
      vt = Math.min(vt, Math.sqrt(vm * vm + 2 * decel * dist));
    }
    if (car.onGrass > 1) vt = Math.min(vt, 22);
    const diff = vt - v;
    ctl.throttle = THREE.MathUtils.clamp(diff / 3 + 0.2, 0, 1);
    ctl.brake = diff < -1.2 ? THREE.MathUtils.clamp(-diff / 5, 0, 1) : 0;
    if (ctl.brake > 0) ctl.throttle = 0;
    ctl.handbrake = false;

    // preso?
    if (Math.abs(v) < 1.2 && ctl.throttle > 0.3) this.stuck += dt;
    else this.stuck = Math.max(0, this.stuck - dt);
    if (this.stuck > 1.8) {
      this.stuck = 0;
      this.reverseT = 1.4;
    }
    return ctl;
  }

  // recoloca o carro se capotou ou saiu do circuito
  needsReset() {
    const car = this.car;
    const lat = this.track.lateral(car.idx, car.pos.x, car.pos.z);
    return car.flipTimer > 1.5 || Math.abs(lat) > WALL_OFF + 4 || car.pos.y < -30;
  }
}

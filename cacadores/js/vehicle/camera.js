// Câmeras: perseguição (3ª pessoa), teto, motorista, órbita livre, tripé e sobrevoo
// (o jogador desce do carro e a visão voa livre por todo o mapa).

import * as THREE from 'three';
import { clamp, damp, dampAngle, wrapAngle } from '../core/math.js';

export const CAM_MODES = ['chase', 'cockpit', 'hood', 'orbit', 'tripod', 'fly'];
export const CAM_NAMES = { chase: 'Perseguição', cockpit: 'Motorista', hood: 'Teto', orbit: 'Órbita livre', tripod: 'Tripé (câmera fixa)', fly: 'Sobrevoo' };

const MAP_LIMIT = 11950;

export class CameraRig {
  constructor(camera) {
    this.cam = camera;
    this.mode = 'chase';
    this.yawOff = 0;
    this.pitchOff = 0.08;
    this.dist = 9;
    this.idle = 0;
    this.pos = new THREE.Vector3();
    this.target = new THREE.Vector3();
    this.tripod = new THREE.Vector3();
    this.tripodYaw = 0;
    this.tripodPitch = 0.15;
    this.first = true;
    this.shake = 0;
    // Sobrevoo.
    this.flyPos = new THREE.Vector3();
    this.flyVel = new THREE.Vector3();
    this.flyYaw = 0;
    this.flyPitch = 0;
    this.flyRoll = 0;
    this.flyHold = 0;
    this.takeoff = 0;
  }

  // Próximo modo do ciclo (C).
  nextMode() {
    const i = CAM_MODES.indexOf(this.mode);
    return CAM_MODES[(i + 1) % CAM_MODES.length];
  }

  next() {
    this.setMode(this.nextMode());
  }

  // O jogador sai pela porta do motorista e a câmera decola dali.
  enterFly(vehicle, world) {
    const yaw = vehicle.yaw + this.yawOff;
    const side = vehicle.spec.W / 2 + 0.9;
    // Lado do motorista (esquerdo, no +x local do carro).
    const x = vehicle.x + Math.cos(vehicle.yaw) * side;
    const z = vehicle.z - Math.sin(vehicle.yaw) * side;
    this.mode = 'fly';
    this.flyPos.set(x, world.groundAt(x, z) + 1.7, z);
    this.flyVel.set(0, 6, 0);
    this.flyYaw = yaw;
    this.flyPitch = 0.02;
    this.flyRoll = 0;
    this.flyHold = 0;
    this.takeoff = 2.2;
    this.cam.fov = 66;
    this.first = true;
  }

  // Velocidade de cruzeiro: cresce com a altitude (para cruzar o mapa todo).
  flySpeed(agl) {
    return clamp(16 + agl * 0.32, 16, 240);
  }

  setMode(m) {
    this.mode = m;
    this.yawOff = 0;
    this.pitchOff = m === 'chase' ? 0.08 : 0;
    if (m === 'tripod') {
      this.tripod.copy(this.cam.position);
      const d = new THREE.Vector3();
      this.cam.getWorldDirection(d);
      this.tripodYaw = Math.atan2(d.x, d.z);
      this.tripodPitch = Math.asin(clamp(d.y, -1, 1));
    }
    this.first = true;
  }

  // Aponta a câmera para um alvo (ex.: o tornado mais próximo).
  lookAtWorld(x, y, z, vehicle) {
    if (this.mode === 'fly') {
      const dx = x - this.flyPos.x;
      const dz = z - this.flyPos.z;
      this.flyYaw = Math.atan2(dx, dz);
      this.flyPitch = clamp(Math.atan2(y - this.flyPos.y, Math.hypot(dx, dz)), -1.4, 1.2);
      return;
    }
    if (this.mode === 'tripod') {
      const dx = x - this.tripod.x;
      const dz = z - this.tripod.z;
      this.tripodYaw = Math.atan2(dx, dz);
      this.tripodPitch = Math.atan2(y - this.tripod.y, Math.hypot(dx, dz));
      return;
    }
    const ang = Math.atan2(x - vehicle.x, z - vehicle.z);
    this.yawOff = wrapAngle(ang - vehicle.yaw);
    const dist = Math.hypot(x - vehicle.x, z - vehicle.z);
    this.pitchOff = clamp(Math.atan2(y - vehicle.y, dist), -0.2, 0.6) + (this.mode === 'chase' ? 0.08 : 0);
    this.idle = -6;
  }

  update(dt, vehicle, look, world, fly = null) {
    const cam = this.cam;
    const sens = 0.0042;
    if (look.x || look.y) this.idle = 0;
    else this.idle += dt;
    if (this.mode === 'fly') return this.updateFly(dt, look, world, fly);
    if (this.mode === 'tripod') {
      this.tripodYaw -= look.x * sens;
      this.tripodPitch = clamp(this.tripodPitch - look.y * sens, -0.6, 1.2);
      cam.position.copy(this.tripod);
      const d = new THREE.Vector3(Math.sin(this.tripodYaw) * Math.cos(this.tripodPitch), Math.sin(this.tripodPitch), Math.cos(this.tripodYaw) * Math.cos(this.tripodPitch));
      cam.lookAt(this.tripod.x + d.x, this.tripod.y + d.y, this.tripod.z + d.z);
      if (look.zoom) cam.fov = clamp(cam.fov + look.zoom * 3, 12, 75);
      cam.updateProjectionMatrix();
      return;
    }
    this.yawOff = wrapAngle(this.yawOff - look.x * sens);
    this.pitchOff = clamp(this.pitchOff - look.y * sens, -0.5, 1.2);
    if (look.zoom) {
      if (this.mode === 'chase' || this.mode === 'orbit') this.dist = clamp(this.dist + look.zoom * 1.2, 5, this.mode === 'orbit' ? 60 : 22);
      else cam.fov = clamp(cam.fov + look.zoom * 3, 15, 80);
    }
    // Volta a olhar para a frente quando dirigindo sem mexer a câmera.
    if (this.mode === 'chase' && this.idle > 4 && vehicle.speed > 6) {
      this.yawOff = dampAngle(this.yawOff, 0, 1.2, dt);
      this.pitchOff = damp(this.pitchOff, 0.08, 1.2, dt);
    }
    const yaw = vehicle.yaw + this.yawOff;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    const v = vehicle;
    if (this.mode === 'chase' || this.mode === 'orbit') {
      const d = this.mode === 'orbit' ? this.dist * 1.6 : this.dist;
      const p = this.pitchOff + 0.12;
      const tx = v.x;
      const ty = v.y + 1.6;
      const tz = v.z;
      const px = tx - fx * Math.cos(p) * d;
      const pz = tz - fz * Math.cos(p) * d;
      let py = ty + Math.sin(p) * d + 0.6;
      const g = world.groundAt(px, pz) + 0.6;
      if (py < g) py = g;
      const k = this.first ? 1 : 1 - Math.exp(-12 * dt);
      this.pos.lerp(new THREE.Vector3(px, py, pz), k);
      this.target.set(tx + fx * 3, ty + Math.sin(this.pitchOff) * 6, tz + fz * 3);
      cam.position.copy(this.pos);
      cam.lookAt(this.target);
      if (cam.fov !== 60 && this.mode !== 'orbit') {
        cam.fov = damp(cam.fov, 60, 4, dt);
      }
    } else {
      const local = this.mode === 'cockpit' ? v.driverEye() : new THREE.Vector3(0, v.spec.cabin.roof + 0.25, v.spec.L * 0.1);
      local.applyEuler(v.group.rotation);
      cam.position.set(v.x + local.x, v.y + local.y, v.z + local.z);
      const p = this.pitchOff - v.pitch * 0.8;
      cam.lookAt(cam.position.x + fx * Math.cos(p) * 10, cam.position.y + Math.sin(p) * 10, cam.position.z + fz * Math.cos(p) * 10);
    }
    // Tremor (vento forte, granizo, batidas).
    if (this.shake > 0.001) {
      cam.position.x += (Math.random() - 0.5) * this.shake;
      cam.position.y += (Math.random() - 0.5) * this.shake;
      cam.position.z += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-5 * dt);
    }
    this.first = false;
    cam.updateProjectionMatrix();
  }

  // Voo livre: frente/lado no plano, subir/descer, velocidade pela altitude e um
  // "embalo" progressivo quando se segue em frente por alguns segundos.
  updateFly(dt, look, world, fly) {
    const cam = this.cam;
    const sens = 0.0042;
    const ax = fly?.axes || { fwd: 0, strafe: 0, up: 0 };
    this.flyYaw = wrapAngle(this.flyYaw - look.x * sens);
    this.flyPitch = clamp(this.flyPitch - look.y * sens, -1.45, 1.25);
    const p = this.flyPos;
    const g = world.groundAt(clamp(p.x, -MAP_LIMIT, MAP_LIMIT), clamp(p.z, -MAP_LIMIT, MAP_LIMIT));
    const agl = p.y - g;
    // Decolagem automática ao sair do carro.
    let up = ax.up;
    if (this.takeoff > 0) {
      this.takeoff -= dt;
      if (!ax.up && agl < 28) up = 1;
    }
    if (Math.abs(ax.fwd) > 0.3) this.flyHold = Math.min(4, this.flyHold + dt);
    else this.flyHold = Math.max(0, this.flyHold - dt * 3);
    const boost = 1 + this.flyHold * 0.6;
    const sp = this.flySpeed(agl) * boost;
    const vsp = clamp(7 + agl * 0.25, 7, 90);
    const fx = Math.sin(this.flyYaw);
    const fz = Math.cos(this.flyYaw);
    const rx = -Math.cos(this.flyYaw);
    const rz = Math.sin(this.flyYaw);
    const tx = (fx * ax.fwd + rx * ax.strafe) * sp;
    const tz = (fz * ax.fwd + rz * ax.strafe) * sp;
    let ty = up * vsp;
    // Roda do mouse: muda a altitude em degraus.
    if (look.zoom) ty -= look.zoom * vsp * 6;
    const k = 1 - Math.exp(-3.2 * dt);
    this.flyVel.x += (tx - this.flyVel.x) * k;
    this.flyVel.z += (tz - this.flyVel.z) * k;
    this.flyVel.y += (ty - this.flyVel.y) * (1 - Math.exp(-4 * dt));
    p.addScaledVector(this.flyVel, dt);
    // Limites: acima do chão, abaixo da base das nuvens e dentro do mapa.
    p.x = clamp(p.x, -MAP_LIMIT, MAP_LIMIT);
    p.z = clamp(p.z, -MAP_LIMIT, MAP_LIMIT);
    const g2 = world.groundAt(p.x, p.z);
    if (p.y < g2 + 2) {
      p.y = g2 + 2;
      if (this.flyVel.y < 0) this.flyVel.y = 0;
    }
    const ceil = Math.max(g2 + 30, fly?.ceiling ?? g2 + 1200);
    if (p.y > ceil) {
      p.y = ceil;
      if (this.flyVel.y > 0) this.flyVel.y = 0;
    }
    // Inclina nas curvas laterais.
    this.flyRoll += (-ax.strafe * 0.14 - this.flyRoll) * (1 - Math.exp(-4 * dt));
    cam.position.copy(p);
    const cp = Math.cos(this.flyPitch);
    cam.up.set(0, 1, 0);
    cam.lookAt(p.x + Math.sin(this.flyYaw) * cp, p.y + Math.sin(this.flyPitch), p.z + Math.cos(this.flyYaw) * cp);
    cam.rotateZ(this.flyRoll);
    if (this.shake > 0.001) {
      cam.position.x += (Math.random() - 0.5) * this.shake;
      cam.position.y += (Math.random() - 0.5) * this.shake;
      this.shake *= Math.exp(-5 * dt);
    }
    cam.fov += (66 - cam.fov) * (1 - Math.exp(-3 * dt));
    this.first = false;
    cam.updateProjectionMatrix();
  }

  // Altitude da câmera de sobrevoo acima do chão.
  flyAGL(world) {
    return this.flyPos.y - world.groundAt(clamp(this.flyPos.x, -MAP_LIMIT, MAP_LIMIT), clamp(this.flyPos.z, -MAP_LIMIT, MAP_LIMIT));
  }
}

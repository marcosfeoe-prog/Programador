// Câmeras: perseguição (3ª pessoa), capô, motorista, órbita livre e câmera fixa de tripé.

import * as THREE from 'three';
import { clamp, damp, dampAngle, wrapAngle } from '../core/math.js';

export const CAM_MODES = ['chase', 'cockpit', 'hood', 'orbit', 'tripod'];
export const CAM_NAMES = { chase: 'Perseguição', cockpit: 'Motorista', hood: 'Teto', orbit: 'Órbita livre', tripod: 'Tripé (câmera fixa)' };

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
  }

  next() {
    const i = CAM_MODES.indexOf(this.mode);
    this.setMode(CAM_MODES[(i + 1) % CAM_MODES.length]);
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

  update(dt, vehicle, look, world) {
    const cam = this.cam;
    const sens = 0.0042;
    if (look.x || look.y) this.idle = 0;
    else this.idle += dt;
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
}

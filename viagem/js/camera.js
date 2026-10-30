// Câmeras: perseguição (perto e longe), capô, para-choque, cockpit com o interior,
// cinematográfica (como numa transmissão de TV) e órbita (menus e modo foto).
import * as THREE from 'three';
import { clamp, damp, lerp, wrapAngle } from './util.js';

export const CAM_MODES = ['chase', 'far', 'cockpit', 'hood', 'bumper', 'cinema'];
export const CAM_NAMES = { chase: 'Perseguição', far: 'Perseguição longe', cockpit: 'Cockpit', hood: 'Capô', bumper: 'Para-choque', cinema: 'Cinematográfica' };

export class CameraRig {
  constructor(camera, gen) {
    this.cam = camera;
    this.gen = gen;
    this.mode = 'chase';
    this.pos = new THREE.Vector3(0, 10, -10);
    this.look = new THREE.Vector3();
    this.yawOff = 0;
    this.pitchOff = 0;
    this.lookIdle = 0;
    this.headSway = new THREE.Vector3();
    this.prevVel = new THREE.Vector3();
    this.cine = null;
    this.orbit = { yaw: 0.8, pitch: 0.18, dist: 7, target: new THREE.Vector3(), auto: true };
    this.gq = { h: 0, surf: 0 };
    this.lookBack = false;
    this.fovBase = 62;
  }

  setMode(m) {
    this.mode = m;
    this.cine = null;
    this.snap = true;
  }

  next(dir = 1) {
    const i = CAM_MODES.indexOf(this.mode);
    this.setMode(CAM_MODES[(i + dir + CAM_MODES.length) % CAM_MODES.length]);
    return this.mode;
  }

  get inside() {
    return this.mode === 'cockpit';
  }

  update(dt, phys, model, look, lookActive) {
    const cam = this.cam;
    const q = phys.quat;
    const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
    const carPos = phys.pos;
    const v = phys.vel;
    const speed = v.length();
    // olhar em volta
    if (look) {
      this.yawOff = wrapAngle(this.yawOff - look.x);
      this.pitchOff = clamp(this.pitchOff + look.y * 0.7, -0.6, 0.9);
    }
    if (lookActive) this.lookIdle = 0;
    else {
      this.lookIdle += dt;
      if (this.lookIdle > 1.6) {
        this.yawOff = damp(this.yawOff, 0, 3, dt);
        this.pitchOff = damp(this.pitchOff, 0, 3, dt);
      }
    }
    const back = this.lookBack ? Math.PI : 0;
    let fov = this.fovBase;
    cam.near = 0.12;
    switch (this.mode) {
      case 'chase':
      case 'far': {
        const far = this.mode === 'far';
        const L = phys.spec.dims.L;
        const dist = (far ? 9.5 : 5.6) + L * 0.25;
        const hgt = far ? 2.9 : 1.75;
        // direção: mistura a frente do carro com a direção do movimento
        const flat = new THREE.Vector3(fwd.x, 0, fwd.z).normalize();
        if (speed > 3 && phys.speed > 0) {
          const vd = new THREE.Vector3(v.x, 0, v.z).normalize();
          flat.lerp(vd, 0.35).normalize();
        }
        if (phys.speed < -1) flat.set(fwd.x, 0, fwd.z).normalize();
        const ang = Math.atan2(flat.x, flat.z) + this.yawOff + back;
        const pitch = 0.16 + this.pitchOff;
        const target = carPos.clone().add(new THREE.Vector3(0, 0.9, 0));
        const want = new THREE.Vector3(target.x - Math.sin(ang) * Math.cos(pitch) * dist, target.y + hgt + Math.sin(pitch) * dist * 0.5, target.z - Math.cos(ang) * Math.cos(pitch) * dist);
        // não entra no chão
        this.gen.ground(want.x, want.z, this.gq);
        want.y = Math.max(want.y, this.gq.h + 0.6);
        if (this.snap) this.pos.copy(want);
        else {
          const k = 1 - Math.exp(-dt * 7);
          this.pos.lerp(want, k);
          // mantém a distância (sem atrasar demais em alta velocidade)
          const d = this.pos.distanceTo(target);
          if (d > dist * 1.5) this.pos.sub(target).setLength(dist * 1.5).add(target);
        }
        const lookAt = target.clone().addScaledVector(flat, back ? -3 : 3);
        this.look.copy(lookAt);
        cam.position.copy(this.pos);
        cam.up.set(0, 1, 0);
        cam.lookAt(this.look);
        fov += Math.min(14, speed * 0.16);
        break;
      }
      case 'cockpit':
      case 'hood':
      case 'bumper': {
        let local;
        const I = model.interior;
        if (this.mode === 'cockpit' && I) local = I.eye.clone();
        else if (this.mode === 'hood') {
          const b = model.body;
          const t = Math.min(0.95, b.g.gf + 0.06);
          local = new THREE.Vector3(0, b.topY(t, 0) + 0.32, b.zOf(t));
        } else local = new THREE.Vector3(0, 0.45, phys.spec.dims.L / 2 + 0.05);
        // balanço da cabeça com a aceleração
        const acc = v.clone().sub(this.prevVel).divideScalar(Math.max(dt, 1e-3));
        const accL = acc.applyQuaternion(q.clone().invert());
        const sway = this.mode === 'cockpit' ? 1 : 0.3;
        this.headSway.x = damp(this.headSway.x, clamp(-accL.x * 0.004, -0.05, 0.05) * sway, 6, dt);
        this.headSway.z = damp(this.headSway.z, clamp(-accL.z * 0.003, -0.04, 0.04) * sway, 6, dt);
        this.headSway.y = damp(this.headSway.y, clamp(-accL.y * 0.002, -0.03, 0.03) * sway, 8, dt);
        local.add(this.headSway);
        const wp = local.clone().sub(model.com).applyQuaternion(q).add(carPos);
        cam.position.copy(wp);
        const yaw = this.yawOff + back;
        const pitch = -this.pitchOff * 0.8 - (this.mode === 'cockpit' ? 0.07 : 0.02);
        const dir = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).applyQuaternion(q);
        cam.up.copy(up);
        cam.lookAt(wp.clone().add(dir));
        cam.near = this.mode === 'cockpit' ? 0.03 : 0.08;
        fov = this.mode === 'cockpit' ? 66 : 64 + Math.min(10, speed * 0.1);
        this.pos.copy(wp);
        break;
      }
      case 'cinema': {
        const c = this.cine;
        const need = !c || c.t > 11 || carPos.distanceTo(c.p) > 110;
        if (need) {
          // escolhe um ponto à frente, ao lado da estrada
          const ahead = Math.max(25, Math.min(90, speed * 4.5));
          const side = Math.random() < 0.5 ? -1 : 1;
          const rt = new THREE.Vector3(-fwd.z, 0, fwd.x).normalize();
          const p = carPos.clone().addScaledVector(new THREE.Vector3(fwd.x, 0, fwd.z).normalize(), ahead).addScaledVector(rt, side * (8 + Math.random() * 14));
          this.gen.ground(p.x, p.z, this.gq);
          p.y = this.gq.h + 1.2 + Math.random() * (Math.random() < 0.3 ? 14 : 3);
          this.cine = { p, t: 0 };
        }
        this.cine.t += dt;
        cam.position.copy(this.cine.p);
        cam.up.set(0, 1, 0);
        const tgt = carPos.clone().add(new THREE.Vector3(0, 0.6, 0));
        this.look.lerp(tgt, need ? 1 : 1 - Math.exp(-dt * 10));
        cam.lookAt(this.look);
        const d = cam.position.distanceTo(tgt);
        fov = clamp((2 * Math.atan(7 / d) * 180) / Math.PI, 12, 60);
        this.pos.copy(cam.position);
        break;
      }
    }
    this.prevVel.copy(v);
    this.snap = false;
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = this.mode === 'cinema' ? fov : lerp(cam.fov, fov, 1 - Math.exp(-dt * 3));
      cam.updateProjectionMatrix();
    }
    cam.updateProjectionMatrix();
  }

  // órbita em volta de um ponto (menus, garagem, modo foto)
  updateOrbit(dt, target, look, zoom, autoSpin = 0) {
    const o = this.orbit;
    if (this.snap || o.target.distanceToSquared(target) > 2500) o.target.copy(target);
    else o.target.lerp(target, 1 - Math.exp(-dt * 6));
    this.snap = false;
    if (look) {
      o.yaw -= look.x;
      o.pitch = clamp(o.pitch + look.y * 0.6, -0.05, 1.3);
    }
    if (zoom) o.dist = clamp(o.dist * (1 + zoom * 0.08), 3, 40);
    o.yaw += autoSpin * dt;
    const cam = this.cam;
    const p = new THREE.Vector3(o.target.x + Math.sin(o.yaw) * Math.cos(o.pitch) * o.dist, o.target.y + Math.sin(o.pitch) * o.dist, o.target.z + Math.cos(o.yaw) * Math.cos(o.pitch) * o.dist);
    this.gen.ground(p.x, p.z, this.gq);
    p.y = Math.max(p.y, this.gq.h + 0.4);
    cam.position.copy(p);
    cam.up.set(0, 1, 0);
    cam.lookAt(o.target);
    cam.near = 0.1;
    if (Math.abs(cam.fov - 45) > 0.1) {
      cam.fov = lerp(cam.fov, 45, 1 - Math.exp(-dt * 4));
    }
    cam.updateProjectionMatrix();
    this.pos.copy(p);
  }
}

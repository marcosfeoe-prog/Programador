// Câmera de perseguição: acompanha a normal da pista (gira junto nos loops),
// abre o campo de visão com a velocidade e treme nas pancadas.
import * as THREE from 'three';
import { damp } from './util.js';
import { makeFrame } from './track.js';

const WORLD_UP = new THREE.Vector3(0, 1, 0);

export class ChaseCam {
  constructor(camera) {
    this.cam = camera;
    this.pos = new THREE.Vector3();
    this.up = new THREE.Vector3(0, 1, 0);
    this.look = new THREE.Vector3();
    this.fwd = new THREE.Vector3(0, 0, -1);
    this.shake = 0;
    this.fov = 62;
    this.far = false;
    this.tmp = new THREE.Vector3();
    this.tmp2 = new THREE.Vector3();
    this.cf = makeFrame();
  }

  portrait() {
    return this.cam.aspect < 1;
  }

  // Coloca a câmera direto atrás do carro (sem suavização).
  snap(car) {
    this.desired(car, this.pos, this.look);
    this.up.copy(car.air ? WORLD_UP : car.fr.N);
    this.fwd.copy(car.fr.T);
    this.apply();
  }

  desired(car, outPos, outLook) {
    const fr = car.fr;
    const portrait = this.portrait();
    const dist = (portrait ? 8.6 : 7.2) * (this.far ? 1.45 : 1);
    const h = (portrait ? 3.6 : 2.7) * (this.far ? 1.4 : 1);
    const f = this.tmp;
    const u = this.tmp2;
    if (car.air) {
      f.set(car.vel.x, 0, car.vel.z);
      if (f.lengthSq() < 1) f.copy(this.fwd);
      f.normalize();
      u.copy(this.up).lerp(WORLD_UP, 0.05).normalize();
      this.fwd.lerp(f, 0.2).normalize();
      outPos.copy(car.pos).addScaledVector(this.fwd, -dist).addScaledVector(u, h);
      outLook.copy(car.pos).addScaledVector(this.fwd, 7).addScaledVector(u, 1.1);
      return u;
    }
    // no chão a câmera "anda" sobre a própria pista, um pouco atrás do carro:
    // assim fica sempre do lado de cima da superfície (loops e parafusos)
    const cf = car.track.frame(Math.max(0, car.s - dist), this.cf);
    f.copy(fr.T);
    u.copy(cf.N).add(fr.N).normalize();
    this.fwd.lerp(f, 0.2).normalize();
    outPos.copy(cf.P).addScaledVector(cf.B, car.d * 0.6).addScaledVector(cf.N, h);
    outLook.copy(car.pos).addScaledVector(fr.T, 7).addScaledVector(fr.N, 1.1);
    return u;
  }

  update(dt, car, speedRatio, boost) {
    const want = new THREE.Vector3();
    const look = new THREE.Vector3();
    const u = this.desired(car, want, look);
    const k = car.air ? 4 : 9;
    this.pos.set(damp(this.pos.x, want.x, k, dt), damp(this.pos.y, want.y, k, dt), damp(this.pos.z, want.z, k, dt));
    this.look.set(damp(this.look.x, look.x, 14, dt), damp(this.look.y, look.y, 14, dt), damp(this.look.z, look.z, 14, dt));
    this.up.lerp(u, 1 - Math.exp(-5 * dt)).normalize();
    this.shake = Math.max(0, this.shake - dt * 2.2);
    const base = this.portrait() ? 74 : 60;
    this.fov = damp(this.fov, base + Math.min(1.2, speedRatio) * 12 + boost * 9, 4, dt);
    this.apply();
  }

  apply() {
    const c = this.cam;
    c.position.copy(this.pos);
    if (this.shake > 0) {
      const s = this.shake * this.shake * 0.5;
      c.position.x += (Math.random() - 0.5) * s;
      c.position.y += (Math.random() - 0.5) * s;
      c.position.z += (Math.random() - 0.5) * s;
    }
    c.up.copy(this.up);
    c.lookAt(this.look);
    if (Math.abs(c.fov - this.fov) > 0.01) {
      c.fov = this.fov;
      c.updateProjectionMatrix();
    }
  }

  // Volta panorâmica antes da largada: t de 0 a 1.
  intro(t, car, center) {
    const fr = car.fr;
    const a = (1 - t) * 2.6 + 0.0;
    const r = 26 - t * 18;
    const h = 12 - t * 9;
    const side = this.tmp.copy(fr.B).multiplyScalar(Math.sin(a) * r);
    const back = this.tmp2.copy(fr.T).multiplyScalar(-Math.cos(a) * r);
    const want = new THREE.Vector3().copy(center).add(side).add(back).addScaledVector(fr.N, h);
    const look = new THREE.Vector3().copy(center).addScaledVector(fr.T, 6 * t);
    if (t >= 1) {
      this.snap(car);
      return;
    }
    this.pos.copy(want);
    this.look.copy(look);
    this.up.copy(fr.N);
    this.fov = this.portrait() ? 74 : 60;
    this.apply();
  }
}

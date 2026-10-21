// Jogador em primeira pessoa: movimento, fôlego, agachar, lanterna e o
// balanço da câmera ao andar.
import * as THREE from 'three';
import { clamp, damp } from './util.js';
import { LOW } from './grid.js';
import { audio } from './audio.js';

export const STAND = 1.65;
export const CROUCH = 0.95;

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.radius = 0.3;
    this.reset();
  }

  reset() {
    this.eye = STAND;
    this.crouch = false;
    this.stamina = 1;
    this.exhausted = false;
    this.battery = 1;
    this.light = true;
    this.boost = 0;
    this.bob = 0;
    this.bobAmp = 0;
    this.stepPhase = 0;
    this.speed = 0;
    this.running = false;
    this.shake = 0;
    this.alive = true;
    this.regenDelay = 0;
    this.slow = 0;
    this.lookSway = new THREE.Vector2();
  }

  place(x, z, yaw = 0) {
    this.pos.set(x, 0, z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
  }

  get forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  update(dt, input, grid, surface) {
    const [lx, ly] = input.takeLook();
    this.yaw -= lx * 0.0022;
    this.pitch = clamp(this.pitch - ly * 0.0022, -1.45, 1.45);
    this.lookSway.x = damp(this.lookSway.x, clamp(lx * 0.02, -1, 1), 10, dt);
    this.lookSway.y = damp(this.lookSway.y, clamp(ly * 0.02, -1, 1), 10, dt);

    if (input.consume('crouchToggle')) this.crouch = !this.crouch;
    const [cx, cz] = grid.cellOf(this.pos);
    // Embaixo de uma viga não dá para levantar.
    const underLow = grid.get(cx, cz) === LOW;
    const wantCrouch = this.crouch || input.crouchHeld;
    const crouching = wantCrouch || underLow;

    const mv = input.move;
    const moving = Math.hypot(mv.x, mv.y) > 0.1;
    const canRun = !this.exhausted && !crouching && mv.y > 0.2;
    this.running = moving && input.run && canRun;
    let speed = crouching ? 1.7 : this.running ? 5.6 : 3.2;
    if (this.slow > 0) {
      speed *= 0.55;
      this.slow -= dt;
    }

    // Fôlego.
    if (this.boost > 0) {
      this.boost -= dt;
      this.stamina = Math.min(1, this.stamina + dt);
      this.exhausted = false;
    } else if (this.running) {
      this.stamina -= dt * 0.17;
      this.regenDelay = 1.0;
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.exhausted = true;
      }
    } else {
      this.regenDelay -= dt;
      if (this.regenDelay <= 0) this.stamina = Math.min(1, this.stamina + dt * (moving ? 0.1 : 0.16));
      if (this.exhausted && this.stamina > 0.35) this.exhausted = false;
    }

    // Lanterna.
    if (input.consume('light')) {
      if (this.battery > 0) {
        this.light = !this.light;
        audio.click();
      }
    }
    if (this.light) {
      this.battery -= dt / 300;
      if (this.battery <= 0) {
        this.battery = 0;
        this.light = false;
      }
    }

    const f = this.forward;
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const want = new THREE.Vector3().addScaledVector(f, mv.y).addScaledVector(r, mv.x).multiplyScalar(speed);
    const acc = moving ? 12 : 10;
    this.vel.x = damp(this.vel.x, want.x, acc, dt);
    this.vel.z = damp(this.vel.z, want.z, acc, dt);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    grid.collide(this.pos, this.radius, crouching);
    this.speed = Math.hypot(this.vel.x, this.vel.z);

    // Altura dos olhos e balanço.
    this.eye = damp(this.eye, crouching ? CROUCH : STAND, 10, dt);
    this.crouching = crouching;
    const stepLen = this.running ? 2.4 : crouching ? 1.4 : 1.9;
    const prev = this.stepPhase;
    this.stepPhase += (this.speed * dt) / stepLen;
    this.bobAmp = damp(this.bobAmp, this.speed > 0.3 ? (this.running ? 1 : 0.55) : 0, 8, dt);
    if (Math.floor(prev * 2) !== Math.floor(this.stepPhase * 2) && this.speed > 0.6) {
      audio.footstep(surface, this.running);
    }
    this.shake = Math.max(0, this.shake - dt * 1.5);
  }

  applyCamera(time) {
    const c = this.camera;
    const ph = this.stepPhase * Math.PI * 2;
    const by = Math.abs(Math.sin(ph)) * 0.055 * this.bobAmp;
    const bx = Math.cos(ph) * 0.035 * this.bobAmp;
    const sh = this.shake;
    c.position.set(
      this.pos.x + Math.cos(this.yaw) * bx + (Math.random() - 0.5) * sh * 0.08,
      this.eye + by + (Math.random() - 0.5) * sh * 0.08,
      this.pos.z - Math.sin(this.yaw) * bx,
    );
    // Respiração parada e cansaço.
    const breathe = Math.sin(time * (this.exhausted ? 5 : 1.6)) * (this.exhausted ? 0.012 : 0.004);
    c.rotation.set(this.pitch + breathe + by * 0.2, this.yaw, Math.cos(ph) * 0.006 * this.bobAmp, 'YXZ');
  }
}

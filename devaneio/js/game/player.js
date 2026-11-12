// Jogador em primeira pessoa: anda devagar (é um sonho), corre um pouco, pula leve,
// balança a cabeça a cada passo e respeita colisões e o relevo do nível.
import * as THREE from 'three';

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.eye = 1.62;
    this.radius = 0.32;
    this.vy = 0;
    this.air = 0;
    this.grounded = true;
    this.dist = 0;
    this.stepAcc = 0;
    this.bobAmt = 0;
    this.walk = 2.4;
    this.runSpeed = 4.4;
    this.sens = 1;
    this.invertY = false;
    this.bobEnabled = true;
    this.frozen = false;
    this.onStep = null;
    this.onLand = null;
    this.time = 0;
    this.roll = 0;
  }

  spawn(s, level) {
    this.pos.set(s.x, level.heightAt(s.x, s.z), s.z);
    this.yaw = s.yaw || 0;
    this.pitch = s.pitch || 0;
    this.vel.set(0, 0, 0);
    this.vy = 0;
    this.grounded = true;
    this.dist = 0;
    this.stepAcc = 0;
    this.apply(0);
  }

  update(dt, input, level) {
    this.time += dt;
    if (!this.frozen) {
      const L = input.consumeLook();
      const s = 0.0022 * this.sens;
      this.yaw -= L.x * s;
      this.pitch -= L.y * s * (this.invertY ? -1 : 1);
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    } else input.consumeLook();

    const mv = this.frozen ? { x: 0, y: 0 } : input.move;
    const running = input.running && !this.frozen;
    const speed = (running ? this.runSpeed : this.walk) * (level.speed || 1);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const fx = -sy, fz = -cy;
    const rx = cy, rz = -sy;
    const dx = (fx * mv.y + rx * mv.x) * speed;
    const dz = (fz * mv.y + rz * mv.x) * speed;
    const acc = this.grounded ? 9 : 2.5;
    const k = 1 - Math.exp(-dt * acc);
    this.vel.x += (dx - this.vel.x) * k;
    this.vel.z += (dz - this.vel.z) * k;

    const px = this.pos.x, pz = this.pos.z;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    level.collide(this.pos, this.radius);
    if (level.dynamic) for (const d of level.dynamic) d.collide(this.pos, this.radius);

    // pulo e gravidade (levinho, de sonho)
    const gh = level.heightAt(this.pos.x, this.pos.z);
    if (input.jump && this.grounded && !this.frozen) {
      this.vy = 3.7;
      this.grounded = false;
    }
    if (!this.grounded) {
      this.vy -= 8.6 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= gh) {
        this.pos.y = gh;
        if (this.vy < -2 && this.onLand) this.onLand(-this.vy);
        this.vy = 0;
        this.grounded = true;
      }
    } else {
      // segue o relevo suavemente
      this.pos.y += (gh - this.pos.y) * Math.min(1, dt * 14);
      if (this.pos.y - gh > 0.35) this.grounded = false;
    }

    const moved = Math.hypot(this.pos.x - px, this.pos.z - pz);
    const hs = moved / Math.max(dt, 1e-4);
    if (this.grounded && hs > 0.2) {
      this.dist += moved;
      this.stepAcc += moved;
      const stride = running ? 0.95 : 0.72;
      if (this.stepAcc >= stride) {
        this.stepAcc -= stride;
        if (this.onStep) this.onStep(level.surfaceAt(this.pos.x, this.pos.z), Math.min(1, hs / this.runSpeed), running);
      }
    }
    const target = this.grounded ? Math.min(1, hs / this.walk) : 0;
    this.bobAmt += (target - this.bobAmt) * Math.min(1, dt * 6);
    this.speedNow = hs;
    this.apply(dt, running);
  }

  apply(dt, running = false) {
    const cam = this.camera;
    const phase = (this.dist / (running ? 0.95 : 0.72)) * Math.PI;
    const b = this.bobEnabled ? this.bobAmt : 0;
    const vy = -(1 - Math.cos(2 * phase)) * 0.5 * 0.04 * b;
    const side = Math.sin(phase) * 0.025 * b;
    const breathe = Math.sin(this.time * 1.5) * 0.006;
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    cam.position.set(this.pos.x + cy * side, this.pos.y + this.eye + vy + breathe, this.pos.z - sy * side);
    const targetRoll = (this.bobEnabled ? Math.sin(phase) * 0.006 * b : 0) + Math.sin(this.time * 0.37) * 0.003;
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 8 || 1);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch + (this.bobEnabled ? Math.cos(2 * phase) * 0.004 * b : 0), this.yaw, this.roll);
  }

  forward(out = new THREE.Vector3()) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
}

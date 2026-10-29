// Jogador em primeira pessoa: movimento com aceleração, colisão com a grade,
// fôlego, agachar, pular, balanço da cabeça, passos, saúde e lanterna.
import * as THREE from 'three';
import { settings } from './config.js';
import { clamp, damp, noise1 } from './util.js';

const WALK = 2.5, RUN = 4.6, CROUCH = 1.25;
const RADIUS = 0.3;

export class Player {
  constructor(game) {
    this.game = game;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.yawVel = 0;
    this.pitchVel = 0;
    this.reset({ x: 0, z: 0, yaw: 0 });
  }

  reset(spawn) {
    this.pos.set(spawn.x, 0, spawn.z);
    this.vel.set(0, 0, 0);
    this.yaw = spawn.yaw || 0;
    this.pitch = 0;
    this.vy = 0;
    this.onGround = true;
    this.hp = 100;
    this.stamina = 1;
    this.exhausted = false;
    this.crouching = false;
    this.crouchK = 0;
    this.bobPhase = 0;
    this.speedK = 0;
    this.sprinting = false;
    this.trauma = 0;
    this.lastHurt = -99;
    this.alive = true;
    this.busy = false;
    this.land = 0;
    this.time = 0;
    this.lastStep = 0;
    if (this.battery === undefined) this.battery = 1;
    if (this.flashOn === undefined) this.flashOn = true;
    this.frozen = false;
  }

  update(dt, input, level) {
    this.time += dt;
    const g = level.grid;
    // olhar
    const look = input.takeLook();
    const sens = 0.0022 * settings.sens;
    let dyaw = 0, dpitch = 0;
    if (!this.frozen) {
      dyaw = -look.dx * sens;
      dpitch = -look.dy * sens * (settings.invertY ? -1 : 1);
      this.yaw += dyaw;
      this.pitch = clamp(this.pitch + dpitch, -1.45, 1.45);
    }
    this.yawVel = damp(this.yawVel, dyaw / Math.max(dt, 1e-3), 20, dt);
    this.pitchVel = damp(this.pitchVel, dpitch / Math.max(dt, 1e-3), 20, dt);
    // movimento
    const mv = this.frozen || !this.alive ? { x: 0, y: 0 } : input.move();
    if (!this.frozen && input.take('crouch')) this.crouching = !this.crouching;
    if (!this.crouching) {
      // não levanta embaixo de algo baixo
    }
    const moving = Math.hypot(mv.x, mv.y) > 0.1;
    const wantRun = input.sprint() && mv.y > 0.3 && !this.crouching && !this.exhausted && moving;
    this.sprinting = wantRun && this.stamina > 0;
    let speed = this.crouching ? CROUCH : this.sprinting ? RUN : WALK;
    if (mv.y < -0.1) speed *= 0.8;
    if (level.speedMul) speed *= level.speedMul(this.pos);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    const wx = (mv.x * cy - mv.y * sy) * speed;
    const wz = (-mv.x * sy - mv.y * cy) * speed;
    const acc = this.onGround ? 11 : 2;
    this.vel.x = damp(this.vel.x, wx, acc, dt);
    this.vel.z = damp(this.vel.z, wz, acc, dt);
    // fôlego
    if (this.sprinting) {
      this.stamina = Math.max(0, this.stamina - dt * 0.19);
      this.staminaDelay = 0.9;
      if (this.stamina <= 0) this.exhausted = true;
    } else {
      this.staminaDelay = Math.max(0, (this.staminaDelay || 0) - dt);
      if (this.staminaDelay <= 0) this.stamina = Math.min(1, this.stamina + dt * (moving ? 0.12 : 0.2));
      if (this.exhausted && this.stamina > 0.35) this.exhausted = false;
    }
    // pulo e gravidade
    if (!this.frozen && input.take('jump') && this.onGround && !this.crouching && this.alive) {
      this.vy = 3.3;
      this.onGround = false;
      this.game.audio && this.game.audio.jump();
    }
    if (!this.onGround) {
      this.vy -= 9.8 * dt;
      this.pos.y += this.vy * dt;
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        this.land = Math.min(1, -this.vy / 5);
        this.vy = 0;
        this.onGround = true;
        this.game.onStep(this, 1.4);
      }
    }
    // integra com sub-passos e colide
    const steps = Math.ceil((Math.hypot(this.vel.x, this.vel.z) * dt) / 0.12) || 1;
    const top = this.pos.y + (this.crouchK > 0.5 ? 1.15 : 1.75);
    for (let i = 0; i < steps; i++) {
      this.pos.x += (this.vel.x * dt) / steps;
      this.pos.z += (this.vel.z * dt) / steps;
      g.collide(this.pos, RADIUS, this.pos.y + 0.1, top);
    }
    // agachar
    this.crouchK = damp(this.crouchK, this.crouching ? 1 : 0, 10, dt);
    // balanço e passos
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.speedK = damp(this.speedK, this.onGround ? clamp(hs / RUN, 0, 1) : 0, 8, dt);
    if (this.onGround && hs > 0.3) {
      const stride = this.sprinting ? 0.95 : this.crouching ? 0.55 : 0.72;
      const prev = Math.floor(this.bobPhase / Math.PI);
      this.bobPhase += ((hs * dt) / stride) * Math.PI;
      if (Math.floor(this.bobPhase / Math.PI) !== prev) this.game.onStep(this, this.sprinting ? 1.0 : this.crouching ? 0.25 : 0.55);
    } else {
      // volta suavemente à fase neutra
      const target = Math.round(this.bobPhase / Math.PI) * Math.PI;
      this.bobPhase = damp(this.bobPhase, target, 4, dt);
    }
    // lanterna
    if (!this.frozen && input.take('flash') && this.alive) {
      this.flashOn = !this.flashOn;
      this.game.audio && this.game.audio.click();
      this.game.vm && this.game.vm.doClick();
    }
    if (!this.frozen && input.take('shake') && this.alive) {
      this.game.vm && this.game.vm.doShake();
      this.game.audio && this.game.audio.rattle();
    }
    if (this.flashOn) this.battery = Math.max(0, this.battery - dt / 260);
    // saúde
    if (this.alive && this.time - this.lastHurt > 7 && this.hp < 100) this.hp = Math.min(100, this.hp + dt * 3);
    this.trauma = Math.max(0, this.trauma - dt * 1.4);
    this.land = Math.max(0, this.land - dt * 3);
  }

  hurt(n, from) {
    if (!this.alive) return;
    this.hp -= n;
    this.lastHurt = this.time;
    this.trauma = Math.min(1, this.trauma + 0.6);
    if (from) {
      // empurrão para longe do atacante
      const dx = this.pos.x - from.x, dz = this.pos.z - from.z;
      const l = Math.hypot(dx, dz) || 1;
      this.vel.x += (dx / l) * 4;
      this.vel.z += (dz / l) * 4;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }

  heal(n) {
    this.hp = Math.min(100, this.hp + n);
  }

  applyCamera(cam, dt) {
    const bob = settings.bob ? 1 : 0.25;
    const k = this.speedK * bob;
    const ph = this.bobPhase;
    const bobY = (Math.abs(Math.sin(ph)) - 0.5) * 0.05 * k - this.land * 0.08;
    const bobX = Math.cos(ph) * 0.03 * k;
    const eye = 1.62 - this.crouchK * 0.55;
    const t = this.time;
    const tr = this.trauma * this.trauma;
    const shx = (noise1(t * 22, 1) - 0.5) * 0.12 * tr;
    const shy = (noise1(t * 22, 2) - 0.5) * 0.12 * tr;
    const shr = (noise1(t * 22, 3) - 0.5) * 0.1 * tr;
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    cam.position.set(this.pos.x + cy * bobX, this.pos.y + eye + bobY, this.pos.z - sy * bobX);
    // inclinação lateral ao andar de lado
    const side = this.vel.x * cy - this.vel.z * sy;
    this.roll = damp(this.roll || 0, -side * 0.006 + Math.cos(ph) * 0.006 * k, 6, dt);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.pitch + shy + Math.sin(ph * 2) * 0.004 * k, this.yaw + shx, this.roll + shr + (this.deathRoll || 0));
    if (this.deathDrop) cam.position.y -= this.deathDrop;
  }
}

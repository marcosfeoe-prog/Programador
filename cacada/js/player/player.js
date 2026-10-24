// Caçador em primeira pessoa: andar, correr (fôlego), agachar, pular, nadar,
// colisão com árvores/rochas/construções, torres de observação, dano e câmera.
import * as THREE from 'three';
import { WATER, HALF } from '../world/heightfield.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));

export class Player {
  constructor(camera) {
    this.camera = camera;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.eye = 1.68;
    this.crouch = false;
    this.health = 100;
    this.maxHealth = 100;
    this.stamina = 100;
    this.staminaLock = 0;
    this.alive = true;
    this.onGround = true;
    this.swim = false;
    this.wade = 0;
    this.tower = null; // plataforma da torre
    this.noise = 0;
    this.bob = 0;
    this.bobAmt = 0;
    this.stepDist = 0;
    this.trauma = 0;
    this.landDip = 0;
    this.sinceHit = 99;
    this.sprinting = false;
    this.moving = 0;
    this.aiming = false;
    this.recoil = { pitch: 0, yaw: 0 };
    this.hurtDir = null;
    this.onStep = null; // callback(superfície, força)
    this.onLand = null;
    this.lookOffset = new THREE.Vector2();
    this.flashlight = false;
    this.fov = 75;
    this.zoom = 1;
    this._n = new THREE.Vector3();
  }

  spawn(x, z, world, yaw = 0) {
    this.pos.set(x, world.height(x, z), z);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.health = this.maxHealth;
    this.stamina = 100;
    this.alive = true;
    this.tower = null;
    this.trauma = 0;
  }

  damage(amount, fromPos) {
    if (!this.alive) return;
    this.health -= amount;
    this.sinceHit = 0;
    this.trauma = Math.min(1, this.trauma + amount / 40);
    if (fromPos) this.hurtDir = Math.atan2(fromPos.x - this.pos.x, fromPos.z - this.pos.z);
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
    }
  }

  get forward() {
    return new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }

  groundAt(world, x, z) {
    let g = world.height(x, z);
    const t = this.tower;
    if (t) {
      const p = t.platform;
      const dx = x - p.x;
      const dz = z - p.z;
      const c = Math.cos(p.rot);
      const s = Math.sin(p.rot);
      const lx = dx * c - dz * s;
      const lz = dx * s + dz * c;
      if (Math.abs(lx) < p.half && Math.abs(lz) < p.half && this.pos.y > p.y - 1) g = Math.max(g, p.y);
    }
    return g;
  }

  update(dt, input, world, opts = {}) {
    const look = input.consumeLook(opts.lookK ?? 1);
    if (this.alive) {
      this.yaw -= look.x;
      this.pitch = clamp(this.pitch - look.y, -1.5, 1.5);
    }
    // recuo da arma volta devagar
    this.pitch += this.recoil.pitch;
    this.yaw += this.recoil.yaw;
    this.recoil.pitch = 0;
    this.recoil.yaw = 0;
    this.pitch = clamp(this.pitch, -1.5, 1.5);
    this.sinceHit += dt;
    if (this.alive && this.sinceHit > 7 && this.health < this.maxHealth) this.health = Math.min(this.maxHealth, this.health + 3 * dt);

    const hf = world.hf;
    const ground = this.groundAt(world, this.pos.x, this.pos.z);
    const depth = WATER - world.height(this.pos.x, this.pos.z);
    this.swim = depth > 1.35 && !this.tower;
    this.wade = clamp((depth - 0.15) / 1.2, 0, 1);

    // ---- intenção de movimento
    let mx = this.alive ? input.moveX : 0;
    let my = this.alive ? input.moveY : 0;
    const ml = Math.hypot(mx, my);
    if (ml > 1) {
      mx /= ml;
      my /= ml;
    }
    if (input.pressed('crouch')) this.crouch = !this.crouch;
    if (this.swim) this.crouch = false;
    const wantSprint = input.sprint && my > 0.3 && !this.crouch && !this.swim && this.stamina > (this.sprinting ? 0 : 12) && this.staminaLock <= 0;
    this.sprinting = wantSprint && ml > 0.2 && !opts.aiming;
    if (this.sprinting) this.crouch = false;
    let speed = this.crouch ? 2.1 : this.sprinting ? 7.6 : 4.3;
    if (opts.aiming) speed *= 0.55;
    if (this.swim) speed = 2.2;
    else speed *= 1 - this.wade * 0.45;
    speed *= opts.speedK ?? 1;
    const fwd = _f.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = _r.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    const want = _w.set(0, 0, 0).addScaledVector(fwd, my * speed).addScaledVector(right, mx * speed);

    // fôlego
    if (this.sprinting) this.stamina -= 16 * dt;
    else this.stamina += (this.moving > 0.5 ? 9 : 15) * dt;
    if (this.stamina <= 0) {
      this.stamina = 0;
      this.staminaLock = 1.5;
    }
    this.staminaLock -= dt;
    this.stamina = clamp(this.stamina, 0, 100);

    // ---- encostas íngremes: não dá para subir
    const n = hf.normal(this.pos.x, this.pos.z, this._n);
    const steep = this.onGround && !this.tower && n.y < 0.72;
    if (steep) {
      const dx = n.x;
      const dz = n.z;
      const l = Math.hypot(dx, dz) || 1;
      // componente "morro acima" é removida e o jogador escorrega
      const up = -(want.x * dx + want.z * dz) / l;
      if (up > 0) {
        want.x += (dx / l) * up;
        want.z += (dz / l) * up;
      }
      want.x += (dx / l) * 4;
      want.z += (dz / l) * 4;
    }

    const accel = this.onGround || this.swim ? 11 : 2.2;
    this.vel.x = damp(this.vel.x, want.x, accel, dt);
    this.vel.z = damp(this.vel.z, want.z, accel, dt);

    // pulo / gravidade / água
    if (this.swim) {
      const surf = WATER - this.eye + 0.32;
      this.vel.y = damp(this.vel.y, (surf - this.pos.y) * 3, 4, dt);
      this.onGround = false;
    } else {
      if (this.onGround && this.alive && input.pressed('jump') && this.stamina > 8) {
        this.vel.y = 5.4;
        this.onGround = false;
        this.stamina -= 8;
        this.crouch = false;
      }
      this.vel.y -= 18 * dt;
    }
    input.pressed('jump');

    const prevY = this.pos.y;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    this.pos.y += this.vel.y * dt;

    // colisões horizontais
    if (!this.tower || this.pos.y < this.tower.platform.y - 1) {
      world.veg.collide(this.pos, 0.35);
      world.structures.collide(this.pos, 0.35);
    }
    if (opts.collideDinos) opts.collideDinos(this.pos, 0.4);
    const lim = HALF - 60;
    this.pos.x = clamp(this.pos.x, -lim, lim);
    this.pos.z = clamp(this.pos.z, -lim, lim);

    const g = this.groundAt(world, this.pos.x, this.pos.z);
    if (!this.swim && this.pos.y <= g) {
      const fall = -this.vel.y;
      if (!this.onGround && fall > 3) {
        this.landDip = Math.min(0.25, fall * 0.025);
        this.onLand && this.onLand(fall);
        if (fall > 12) this.damage((fall - 12) * 7, null);
      }
      this.pos.y = g;
      this.vel.y = 0;
      this.onGround = true;
    } else if (!this.swim && this.onGround && this.pos.y - g < 0.45 && this.vel.y <= 0) {
      // desce rampas sem "pular"
      this.pos.y = g;
      this.vel.y = 0;
    } else if (!this.swim) {
      this.onGround = false;
    }
    if (this.tower && Math.hypot(this.pos.x - this.tower.platform.x, this.pos.z - this.tower.platform.z) > 6) this.tower = null;
    void prevY;
    void ground;

    // ---- passos e barulho
    const hs = Math.hypot(this.vel.x, this.vel.z);
    this.moving = hs;
    if (this.onGround || this.swim) {
      this.stepDist += hs * dt;
      const stride = this.sprinting ? 2.1 : this.crouch ? 1.1 : 1.6;
      if (this.stepDist > stride) {
        this.stepDist = 0;
        const surf = this.swim || this.wade > 0.1 ? 'agua' : this.tower ? 'madeira' : hf.forestAt(this.pos.x, this.pos.z) > 0.5 ? 'folhas' : hf.pathAt(this.pos.x, this.pos.z) > 0.4 ? 'terra' : n.y < 0.8 ? 'pedra' : 'grama';
        this.onStep && this.onStep(surf, this.sprinting ? 1 : this.crouch ? 0.35 : 0.65);
      }
    }
    const targetNoise = hs < 0.3 ? 0 : this.sprinting ? 1 : this.crouch ? 0.12 : 0.45;
    this.noise = damp(this.noise, targetNoise, 4, dt);

    // ---- câmera
    const eyeT = this.swim ? 1.68 : this.crouch ? 1.05 : 1.68;
    this.eye = damp(this.eye, eyeT, 9, dt);
    this.bobAmt = damp(this.bobAmt, this.onGround ? clamp(hs / 7.6, 0, 1) : 0, 8, dt);
    this.bob += hs * dt * (this.sprinting ? 1.25 : 1.6);
    this.landDip = damp(this.landDip, 0, 6, dt);
    this.trauma = Math.max(0, this.trauma - dt * 0.9);
    const shake = this.trauma * this.trauma;
    const t = performance.now() * 0.001;
    const sx = (Math.sin(t * 37) + Math.sin(t * 23.3)) * 0.5 * shake * 0.05;
    const sy = (Math.sin(t * 31.7) + Math.sin(t * 19.1)) * 0.5 * shake * 0.05;
    const cam = this.camera;
    const bobY = Math.abs(Math.sin(this.bob * 1.0)) * 0.055 * this.bobAmt * (this.aiming ? 0.3 : 1);
    const bobX = Math.sin(this.bob * 0.5) * 0.035 * this.bobAmt * (this.aiming ? 0.3 : 1);
    cam.position.set(this.pos.x, this.pos.y + this.eye + bobY - this.landDip, this.pos.z);
    cam.position.x += Math.cos(this.yaw) * bobX;
    cam.position.z -= Math.sin(this.yaw) * bobX;
    if (!this.alive) cam.position.y = this.pos.y + 0.4;
    cam.rotation.set(this.pitch + sy, this.yaw + sx, this.alive ? Math.sin(this.bob * 0.5) * 0.004 * this.bobAmt : 0.5, 'YXZ');
  }
}
const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _w = new THREE.Vector3();

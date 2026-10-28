// Jogador em primeira pessoa: movimento, colisão, balanço da câmera,
// passos, fôlego e lanterna com atraso de movimento.
import * as THREE from 'three';
import { clamp, damp } from './util.js';

const _f = new THREE.Vector3();
const _r = new THREE.Vector3();
const _u = new THREE.Vector3();
const _p = new THREE.Vector3();

export class Player {
  constructor(game) {
    this.game = game;
    this.camera = game.camera;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.roll = 0;
    this.eye = 1.62;
    this.radius = 0.3;
    this.stamina = 1;
    this.exhausted = false;
    this.stepPhase = 0;
    this.bobAmp = 0;
    this.flashOn = false;
    this.flashLevel = 0;
    this.speed = 0;
    this.frozen = false;
    this.flash = new THREE.SpotLight(0xfff0d8, 0, 30, 0.44, 0.6, 2);
    const Q = game.Q;
    if (Q.flashShadow) {
      this.flash.castShadow = true;
      this.flash.shadow.mapSize.set(Q.id === 'ultra' ? 1024 : 512, Q.id === 'ultra' ? 1024 : 512);
      this.flash.shadow.camera.near = 0.15;
      this.flash.shadow.camera.far = 30;
      this.flash.shadow.bias = -0.0006;
      this.flash.shadow.normalBias = 0.02;
    }
    this.flashDir = new THREE.Vector3(0, 0, -1);
    game.scene.add(this.flash, this.flash.target);
  }

  reset(spawn, groundY = 0) {
    this.pos.set(spawn.x, groundY, spawn.z);
    this.vel.set(0, 0, 0);
    this.yaw = spawn.yaw || 0;
    this.pitch = 0;
    this.stamina = 1;
    this.stepPhase = 0;
    this.forward(this.flashDir);
  }

  forward(out) {
    const cp = Math.cos(this.pitch);
    return out.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
  }

  toggleFlash(on = !this.flashOn) {
    this.flashOn = on;
    this.game.audio.click();
  }

  update(dt, input, level, settings) {
    const look = input.consumeLook();
    if (!this.frozen) {
      this.yaw -= look.x;
      this.pitch = clamp(this.pitch - look.y, -1.45, 1.45);
    }
    // direção desejada no plano
    let mx = this.frozen ? 0 : input.moveX;
    let my = this.frozen ? 0 : input.moveY;
    const ml = Math.hypot(mx, my);
    if (ml > 1) {
      mx /= ml;
      my /= ml;
    }
    const moving = ml > 0.08;
    let sprint = input.sprint && moving && my > 0.2 && !this.exhausted;
    const walk = level.walkSpeed || 2.25;
    const sanity = this.game.sanity;
    const slow = sanity < 15 ? 0.8 : 1;
    const target = (sprint ? walk * 2.05 : walk) * slow;
    const sy = Math.sin(this.yaw);
    const cy = Math.cos(this.yaw);
    // frente = (-sin, -cos); direita = (cos, -sin)
    const tx = (-sy * my + cy * mx) * target;
    const tz = (-cy * my - sy * mx) * target;
    const acc = moving ? 9 : 11;
    this.vel.x = damp(this.vel.x, tx, acc, dt);
    this.vel.z = damp(this.vel.z, tz, acc, dt);
    // fôlego
    if (sprint) {
      this.stamina -= dt * 0.13 * (this.game.staminaMul || 1);
      if (this.stamina <= 0) {
        this.stamina = 0;
        this.exhausted = true;
        this.game.audio.breath();
      }
    } else {
      this.stamina = Math.min(1, this.stamina + dt * (moving ? 0.09 : 0.16));
      if (this.exhausted && this.stamina > 0.35) this.exhausted = false;
    }
    _p.copy(this.pos);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    level.collide(this.pos, this.radius);
    const gy = level.groundY ? level.groundY(this.pos.x, this.pos.z) : 0;
    this.pos.y = damp(this.pos.y, gy, 14, dt);
    const moved = Math.hypot(this.pos.x - _p.x, this.pos.z - _p.z);
    this.speed = moved / Math.max(dt, 1e-4);
    this.sprinting = sprint && this.speed > 2.8;

    // balanço da cabeça e passos
    const stride = sprint ? 1.0 : 0.78;
    const prev = this.stepPhase;
    this.stepPhase += moved / stride;
    if (Math.floor(this.stepPhase) !== Math.floor(prev)) {
      const surf = level.surfaceAt ? level.surfaceAt(this.pos.x, this.pos.z) : level.surface;
      this.game.audio.footstep(surf, sprint ? 1 : 0.7);
    }
    // ---- câmera: balanço de passada realista e olhar suavizado
    const bobOn = settings.headBob ? 1 : 0;
    const spd = clamp((this.smSpeed ?? this.speed) / 4.6, 0, 1.2);
    this.bobAmp = damp(this.bobAmp, spd * bobOn, 6, dt);
    const ph = this.stepPhase * Math.PI;
    const A = this.bobAmp;
    // vertical: cai no apoio do pé (pico agudo para baixo, subida suave)
    const s1 = Math.abs(Math.sin(ph));
    const bobY = (Math.pow(s1, 0.7) * 0.048 - 0.03) * A * (sprint ? 1.35 : 1);
    // lateral: o corpo passa de um pé ao outro (meia frequência)
    const bobX = Math.sin(ph) * 0.022 * A;
    // micro-giro da cabeça acompanhando a passada
    const bobRoll = Math.sin(ph) * 0.006 * A;
    const bobPitch = (Math.cos(ph * 2) * 0.004 + 0.002) * A;
    // respiração parado (bem sutil) e fôlego depois de correr
    const t = this.game.time;
    const still = 1 - clamp(this.speed / 1.2, 0, 1);
    const breathK = (0.6 + (1 - this.stamina) * 2.2) * bobOn;
    const breathY = Math.sin(t * (1.6 + (1 - this.stamina) * 2)) * 0.0035 * breathK * still;
    const swayX = Math.sin(t * 0.6) * 0.0018 * still * bobOn;
    // ao parar ou arrancar, a cabeça "assenta" com uma mola
    const prevS = this.smSpeed ?? this.speed;
    this.smSpeed = damp(prevS, Math.min(this.speed, 6), 10, dt);
    const accel = (this.smSpeed - prevS) / Math.max(dt, 1e-4);
    this.nodV = (this.nodV || 0) + (clamp(-accel * 0.0025, -0.06, 0.06) - (this.nod || 0) * 60 - (this.nodV || 0) * 11) * dt;
    this.nod = (this.nod || 0) + this.nodV * dt;
    // inclinação ao virar e andar de lado; tontura com pouca sanidade
    const insane = clamp((40 - sanity) / 40, 0, 1);
    const targetRoll = -mx * 0.014 - look.x * 0.5 + Math.sin(t * 0.7) * 0.03 * insane * insane;
    this.roll = damp(this.roll, clamp(targetRoll, -0.06, 0.06), 5, dt);
    // o olhar segue a mira com um atraso mínimo (sem engasgos, sem enjoar)
    if (this.camYaw === undefined || Math.abs(this.yaw - this.camYaw) > 1.5 || this.frozen) {
      this.camYaw = this.yaw;
      this.camPitch = this.pitch;
    }
    const sm = 1 - Math.exp(-dt * 26);
    this.camYaw += (this.yaw - this.camYaw) * sm;
    this.camPitch += (this.pitch - this.camPitch) * sm;

    const cam = this.camera;
    cam.rotation.order = 'YXZ';
    cam.rotation.set(this.camPitch + bobPitch + (this.nod || 0) * bobOn + Math.sin(t * 0.53) * 0.012 * insane, this.camYaw, this.roll + bobRoll);
    _r.set(cy, 0, -sy);
    cam.position.set(this.pos.x + _r.x * (bobX + swayX), this.pos.y + this.eye + bobY + breathY, this.pos.z + _r.z * (bobX + swayX));
    cam.updateMatrixWorld();

    // lanterna: segue o olhar com um pequeno atraso
    this.forward(_f);
    const lag = 1 - Math.exp(-dt * 14);
    this.flashDir.lerp(_f, lag).normalize();
    _u.set(0, 1, 0);
    _p.copy(cam.position).addScaledVector(_r, 0.2).addScaledVector(_u, -0.22).addScaledVector(_f, 0.15);
    this.flash.position.copy(_p);
    this.flash.target.position.copy(_p).addScaledVector(this.flashDir, 6);
    this.flash.target.updateMatrixWorld();
    // oscila quando a sanidade está baixa
    let fl = this.flashOn ? 1 : 0;
    if (this.flashOn && sanity < 25 && Math.random() < dt * (25 - sanity) * 0.12) fl = 0.15;
    this.flashLevel = damp(this.flashLevel, fl, 25, dt);
    this.flash.intensity = this.flashLevel * (level.flashIntensity || 16);
  }
}

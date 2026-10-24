// Controle do dinossauro do jogador e câmera em terceira pessoa.
import * as THREE from 'three';
import { clamp, lerp, wrapAngle } from './util.js';

const tmp = new THREE.Vector3();

export class PlayerController {
  constructor(game) {
    this.game = game;
    this.c = null;
    this.camYaw = 0;
    this.camPitch = 0.28;
    this.zoom = 1;
    this.camPos = new THREE.Vector3();
    this.camTarget = new THREE.Vector3();
    this.shake = 0;
    this.promptT = 0;
    this.prompt = '';
    this.food = null;
  }

  attach(c) {
    this.c = c;
    this.camYaw = c.yaw;
    this.camPos.set(0, 0, 0);
    this.snap = true;
  }

  update(dt, input, settings) {
    const c = this.c;
    if (!c) return;
    const sens = 0.0024 * settings.sensitivity;
    this.camYaw -= input.lookDX * sens;
    this.camPitch = clamp(this.camPitch + input.lookDY * sens * (settings.invertY ? -1 : 1), -0.35, 1.25);
    this.zoom = clamp(this.zoom + input.zoom * 0.08, 0.45, 2.4);
    if (c.dead) {
      c.ctrl.speed = 0;
      return;
    }
    const msg = (t) => this.game.ui.message(t);

    if (input.pressed('attack')) c.attack();
    if (input.pressed('roar')) c.roar();
    if (input.pressed('rest')) {
      if (c.action === 'rest' || c.action === 'sleep') c.action = null;
      else {
        c.setAction('rest');
        msg('Descansando — a vida e a energia voltam mais rápido.');
      }
    }
    if (input.pressed('sleep')) {
      if (c.action === 'sleep') c.action = null;
      else {
        c.setAction('sleep');
        msg('Dormindo — cuidado com predadores!');
      }
    }
    if (input.pressed('interact')) {
      if (c.action === 'eat' || c.action === 'drink') c.action = null;
      else {
        const food = c.findFood();
        const water = c.canDrink();
        if (water && (!food || c.thirst <= c.hunger)) c.setAction('drink');
        else if (food) c.setAction('eat', food);
        else if (c.spec.diet === 'carnivore') msg('Nada para comer aqui. Carnívoros comem carcaças: cace!');
        else msg('Nada para comer aqui. Procure arbustos com frutas vermelhas.');
      }
    }

    // movimento relativo à câmera
    const mv = input.move();
    const mag = Math.hypot(mv.x, mv.y);
    const sp = c.speeds;
    if (mag > 0.12) {
      if (c.action) c.action = null;
      c.ctrl.yaw = wrapAngle(this.camYaw - Math.atan2(mv.x, mv.y));
      let speed;
      if (input.sprinting()) speed = sp.run;
      else if (input.down('sneak')) speed = sp.walk;
      else if (settings.mobile) speed = mag < 0.55 ? sp.walk : sp.trot;
      else speed = sp.trot;
      c.ctrl.speed = speed * clamp(mag * 1.4, 0, 1);
    } else {
      c.ctrl.speed = 0;
      c.ctrl.yaw = c.yaw;
    }

    // dica de interação
    this.promptT -= dt;
    if (this.promptT <= 0) {
      this.promptT = 0.25;
      this.prompt = '';
      if (!c.action) {
        const food = c.findFood();
        const key = settings.mobile ? 'Ação' : 'E';
        if (c.canDrink() && c.thirst < 0.98) this.prompt = `${key} — Beber`;
        else if (food && c.hunger < 0.98) this.prompt = food.type === 'carcass' ? `${key} — Comer carcaça` : `${key} — Comer frutas`;
      } else if (c.action === 'eat') this.prompt = 'Comendo…';
      else if (c.action === 'drink') this.prompt = 'Bebendo…';
      else if (c.action === 'sleep') this.prompt = 'Dormindo (Z para acordar)';
      else if (c.action === 'rest') this.prompt = 'Descansando (C para levantar)';
    }
  }

  updateCamera(dt, camera) {
    const c = this.c;
    if (!c) return;
    const w = this.game.world;
    const sc = c.scale;
    const dead = c.dead ? 1 : 0;
    tmp.set(c.pos.x, c.pos.y + c.data.hipY * sc * lerp(1.15, 0.6, dead), c.pos.z);
    if (this.snap) this.camTarget.copy(tmp);
    else this.camTarget.lerp(tmp, 1 - Math.exp(-10 * dt));
    const dist = c.spec.camDist * Math.max(0.42, sc) * this.zoom * (1 + dead * 0.4);
    const cp = Math.cos(this.camPitch);
    const want = new THREE.Vector3(
      this.camTarget.x - Math.sin(this.camYaw) * cp * dist,
      this.camTarget.y + Math.sin(this.camPitch) * dist,
      this.camTarget.z - Math.cos(this.camYaw) * cp * dist,
    );
    const minY = w.height(want.x, want.z) + 0.6;
    if (want.y < minY) want.y = minY;
    if (this.snap) {
      this.camPos.copy(want);
      this.snap = false;
    } else this.camPos.lerp(want, 1 - Math.exp(-12 * dt));
    camera.position.copy(this.camPos);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    if (this.shake > 0.001) {
      const s = this.shake * this.shake * 0.35;
      camera.position.x += (Math.random() - 0.5) * s;
      camera.position.y += (Math.random() - 0.5) * s;
      camera.position.z += (Math.random() - 0.5) * s;
    }
    camera.lookAt(this.camTarget.x, this.camTarget.y + dist * 0.06, this.camTarget.z);
  }

  addShake(v) {
    this.shake = Math.min(1.5, this.shake + v);
  }
}

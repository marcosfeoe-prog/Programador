// Controle do jogador: movimento relativo à câmera, ações de sobrevivência
// (comer, beber, descansar, rugir, atacar) e câmera em terceira pessoa com
// colisão no terreno e tremor nos passos de gigantes.
import * as THREE from 'three';
import { clamp, damp, wrapAngle } from './util.js';
import { WATER } from './world.js';

export class PlayerController {
  constructor(game, camera, input) {
    this.game = game;
    this.camera = camera;
    this.input = input;
    this.camYaw = Math.PI;
    this.camPitch = 0.28;
    this.zoom = 1;
    this.camPos = new THREE.Vector3();
    this.focus = new THREE.Vector3();
    this.shake = 0;
    this.c = null;
  }

  attach(c) {
    this.c = c;
    this.camYaw = c.yaw;
    this.camPitch = 0.25;
    this.snap = true;
  }

  // dica contextual para o HUD (o que a tecla E faria agora)
  interactHint() {
    const c = this.c;
    if (!c || c.dead) return null;
    if (c.eating) return { text: 'Comendo…', key: 'E', active: true };
    if (c.drinking) return { text: 'Bebendo…', key: 'E', active: true };
    const f = c.findFood();
    if (f) {
      if (f.kind === 'carcass') return { text: `Comer carcaça de ${f.target.spec.short}`, key: 'E' };
      if (f.kind === 'tree') return { text: 'Comer folhas da árvore', key: 'E' };
      return { text: 'Comer samambaia', key: 'E' };
    }
    if (c.canDrinkHere()) return { text: 'Beber água', key: 'E' };
    return null;
  }

  update(dt) {
    const c = this.c;
    const inp = this.input;
    const look = inp.consumeLook();
    this.camYaw -= look.x;
    this.camPitch = clamp(this.camPitch + look.y, -0.25, 1.25);
    const z = inp.consumeZoom();
    if (z) this.zoom = clamp(this.zoom * (z > 0 ? 1.12 : 0.89), 0.45, 2.6);
    if (!c) return;

    if (!c.dead) {
      // movimento relativo à câmera
      const mx = inp.moveX;
      const my = inp.moveY;
      const mag = Math.min(1, Math.hypot(mx, my));
      if (mag > 0.08) {
        c.wantYaw = this.camYaw + Math.atan2(-mx, my);
        c.wantSpeed = (inp.sprint ? c.runSpeed : c.walkSpeed) * Math.max(0.35, mag);
        c.wantRun = inp.sprint;
        if (c.resting && c.anim.w.rest > 0.4) {
          // levantar primeiro
        }
        c.resting = false;
        c.stopFeeding();
      } else {
        c.wantSpeed = 0;
        c.wantRun = false;
      }
      // cabeça olha para onde a câmera aponta (quando parado)
      const rel = wrapAngle(this.camYaw - c.yaw);
      c.lookYaw = c.speed < 0.5 && Math.abs(rel) < 1.6 ? clamp(rel, -1, 1) * 0.8 : 0;
      c.lookPitch = c.speed < 0.5 ? clamp(-(this.camPitch - 0.25) * 0.6, -0.4, 0.4) : 0;

      if (inp.pressed('attack')) c.startAttack();
      if (inp.pressed('roar')) c.startRoar();
      if (inp.pressed('rest')) {
        if (c.resting) c.resting = false;
        else if (!c.swim && !c.action) {
          c.stopFeeding();
          c.resting = true;
        }
      }
      if (inp.pressed('interact')) {
        if (c.eating || c.drinking) c.stopFeeding();
        else {
          const f = c.findFood();
          if (f) {
            if (c.hunger >= 99) this.game.hud.toast('Você está saciado.');
            else c.startEat(f);
          } else if (c.canDrinkHere()) {
            if (c.thirst >= 99) this.game.hud.toast('Você não está com sede.');
            else c.startDrink();
          } else this.game.hud.toast(c.spec.diet === 'carnivoro' ? 'Nada para comer aqui — procure uma carcaça.' : 'Nada para comer aqui — procure samambaias.');
        }
      }
    }
    this.updateCamera(dt);
  }

  updateCamera(dt) {
    const c = this.c;
    const w = this.game.world;
    const s = c.scale;
    const L = c.L;
    const size = (L.length * 0.55 + L.hipH * 0.8) * s;
    const dist = (3 + size * 1.25) * this.zoom;
    const fh = (L.hipH * 1.25 + 0.3) * s + (c.anim.w.rest > 0.5 ? -L.hipH * 0.4 * s : 0);
    const target = new THREE.Vector3(c.pos.x, c.pos.y + fh, c.pos.z);
    if (c.dead) target.y = c.pos.y + L.width * s;
    if (this.snap) this.focus.copy(target);
    else this.focus.lerp(target, 1 - Math.exp(-10 * dt));
    const cp = Math.cos(this.camPitch);
    const want = new THREE.Vector3(
      this.focus.x - Math.sin(this.camYaw) * cp * dist,
      this.focus.y + Math.sin(this.camPitch) * dist,
      this.focus.z - Math.cos(this.camYaw) * cp * dist,
    );
    // não atravessa o terreno nem fica embaixo d'água
    const gy = Math.max(w.height(want.x, want.z), WATER) + 0.6;
    if (want.y < gy) want.y = gy;
    if (this.snap) {
      this.camPos.copy(want);
      this.snap = false;
    } else this.camPos.lerp(want, 1 - Math.exp(-12 * dt));
    this.camera.position.copy(this.camPos);
    this.shake = damp(this.shake, 0, 6, dt);
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
    }
    this.camera.lookAt(this.focus);
    // FOV levemente maior correndo
    const fov = 60 + (c.running ? 6 : 0);
    if (Math.abs(this.camera.fov - fov) > 0.05) {
      this.camera.fov = damp(this.camera.fov, fov, 4, dt);
      this.camera.updateProjectionMatrix();
    }
  }
}

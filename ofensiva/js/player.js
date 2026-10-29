// Controle do jogador: mira, movimento, armas, compra, usar (plantar/desarmar),
// modo espectador depois da morte e câmera em primeira pessoa.
import * as THREE from 'three';
import { BUY_MENU, WEAPONS, EQUIP } from './weapons.js';
import { eyeHeight } from './physics.js';
import { clamp, DEG, dirFromAngles, damp } from './util.js';

const _f = new THREE.Vector3();

// FOV horizontal (4:3, como no jogo original) → FOV vertical.
const hToV = (h) => (2 * Math.atan(Math.tan((h * DEG) / 2) * 0.75)) / DEG;

export class PlayerCtl {
  constructor(game, input, hud) {
    this.g = game;
    this.in = input;
    this.hud = hud;
    this.buyCat = -1;
    this.specIdx = 0;
    this.lastMouse = [0, 0];
    this.shakeT = 0;
  }

  get p() {
    return this.g.player;
  }

  closeBuy() {
    if (!this.hud.buyOpen) return;
    this.hud.openBuy(this.g, this.p, false);
    this.buyCat = -1;
    if (!this.in.touch) {
      this.g.uiUnlock = false;
      this.in.lock();
    }
  }

  openBuy() {
    const g = this.g;
    if (!g.canBuy(this.p)) {
      this.hud.hint(g.mode === 'defuse' ? 'Fora da área ou do tempo de compra' : '');
      setTimeout(() => this.hud.hint(''), 1500);
      return;
    }
    this.hud.openBuy(g, this.p, true);
    this.buyCat = -1;
    if (!this.in.touch) {
      g.uiUnlock = true;
      this.in.unlock();
    }
  }

  update(dt) {
    const g = this.g;
    const p = this.p;
    const inp = this.in;
    const time = g.time;
    const s = g.settings;

    this.hud.showScore(g, inp.isDown('Tab') || g.phase === 'over');
    const [mdx, mdy] = inp.takeMouse();
    this.lastMouse = [mdx, mdy];

    // menu de compra
    if (inp.wasPressed('KeyB')) {
      if (this.hud.buyOpen) this.closeBuy();
      else if (p.alive) this.openBuy();
    }
    if (this.hud.buyOpen) {
      if (!g.canBuy(p)) this.closeBuy();
      else this.buyKeys();
    }

    p.wishX = p.wishZ = 0;
    p.wantFire = p.wantAlt = p.wantJump = p.wantUse = p.wantReload = false;

    if (!p.alive) {
      this.spectate(inp, time);
      return;
    }
    this.hud.spectate('');

    const w = p.weapon;
    const scoped = p.scope > 0 && w?.def.type === 'sniper';
    // mira
    let k = s.sens * 0.022 * DEG;
    if (scoped) k *= Math.tan((this.scopeFov(w, p.scope) * DEG) / 2) / Math.tan((s.fov * DEG) / 2);
    if (!this.hud.buyOpen || inp.touch) {
      p.yaw -= mdx * k;
      p.pitch -= mdy * k * (s.invert ? -1 : 1);
      p.pitch = clamp(p.pitch, -89 * DEG, 89 * DEG);
    }

    // movimento
    const kb = !this.hud.buyOpen || inp.touch;
    let fwd = 0;
    let side = 0;
    if (kb) {
      if (inp.isDown('KeyW') || inp.isDown('ArrowUp')) fwd += 1;
      if (inp.isDown('KeyS') || inp.isDown('ArrowDown')) fwd -= 1;
      if (inp.isDown('KeyD') || inp.isDown('ArrowRight')) side += 1;
      if (inp.isDown('KeyA') || inp.isDown('ArrowLeft')) side -= 1;
    }
    let mag = 1;
    if (inp.touch && (inp.moveX || inp.moveY)) {
      fwd = inp.moveY;
      side = inp.moveX;
      mag = Math.min(1, Math.hypot(fwd, side));
      p.walking = mag < 0.55;
    } else p.walking = kb && (inp.isDown('ShiftLeft') || inp.isDown('ShiftRight'));
    const fx = -Math.sin(p.yaw);
    const fz = -Math.cos(p.yaw);
    let wx = fx * fwd + -fz * side;
    let wz = fz * fwd + fx * side;
    const l = Math.hypot(wx, wz);
    if (l > 0) {
      wx /= l;
      wz /= l;
    }
    p.wishX = wx;
    p.wishZ = wz;
    p.wishSpeed = p.maxSpeed(time) * (inp.touch && (inp.moveX || inp.moveY) ? Math.max(mag, 0.3) : 1);
    if (inp.touch && p.walking) p.wishSpeed = p.maxSpeed(time);
    p.crouch = kb && (inp.isDown('ControlLeft') || inp.isDown('ControlRight') || inp.isDown('KeyC'));
    p.wantJump = kb && inp.isDown('Space');

    if (!kb) return;
    // troca de armas
    const sw = (slot) => {
      if (p.planting || p.defusing) return;
      if (p.switchTo(slot, time)) g.equipView(p);
    };
    if (inp.wasPressed('Digit1')) sw(0);
    if (inp.wasPressed('Digit2')) sw(1);
    if (inp.wasPressed('Digit3')) sw(2);
    if (inp.wasPressed('Digit4')) sw(3);
    if (inp.wasPressed('Digit5')) sw(4);
    if (inp.wasPressed('KeyQ')) sw(p.hasSlot(p.lastSlot) ? p.lastSlot : p.bestSlot());
    if (inp.wheel) {
      const order = [0, 1, 2, 3, 4].filter((x) => p.hasSlot(x));
      const i = order.indexOf(p.slot);
      sw(order[(i + (inp.wheel > 0 ? 1 : -1) + order.length) % order.length]);
    }
    if (inp.wasPressed('KeyR')) p.wantReload = true;
    if (inp.wasPressed('KeyF')) g.vm.inspect();
    if (inp.wasPressed('KeyG') && p.slot !== 2 && p.slot !== 3) g.dropWeapon(p, p.slot);
    p.wantFire = inp.isDown('Mouse0');
    p.wantUse = inp.isDown('KeyE');
    if (inp.wasPressed('KeyE')) {
      const it = g.lookedItem(p);
      if (it) {
        const slot = it.w.def.slot;
        if (p.inv[slot]) g.dropWeapon(p, slot, true);
        g.pickup(p, it);
        p.switchTo(slot, time);
        g.equipView(p);
      }
    }
    // botão direito: luneta / faca forte / granada por baixo
    const t = w?.def.type;
    if (t === 'sniper') {
      if (inp.wasPressed('Mouse2') && time >= p.drawEnd && !p.reloadEnd) {
        p.scope = (p.scope + 1) % 3;
        p.rescopeAt = 0;
        g.audio.play('click', null, 0.3, 1.5);
      }
    } else p.wantAlt = inp.isDown('Mouse2');
    if (p.reloadEnd) p.scope = 0;

    // dicas contextuais
    let hint = '';
    if (p.hasBomb && g.map.siteAt(p.pos) && g.bomb.state === 'carried' && !p.planting) hint = 'Segure E para plantar a bomba';
    else if (p.team === 'CT' && g.bomb.state === 'planted' && p.pos.distanceTo(g.bomb.pos) < 1.6 && !p.defusing) hint = `Segure E para desarmar${p.kit ? '' : ' (sem kit: 10 s)'}`;
    else {
      const it = g.lookedItem(p);
      if (it) hint = `E para pegar ${it.w.def.name}`;
    }
    this.hud.hint(hint);
  }

  // Teclas numéricas no menu de compra: categoria e depois o item.
  buyKeys() {
    const inp = this.in;
    const p = this.p;
    for (let n = 1; n <= 9; n++) {
      if (!inp.wasPressed('Digit' + n)) continue;
      if (this.buyCat < 0) {
        if (n <= BUY_MENU.length) this.buyCat = n - 1;
      } else {
        const items = BUY_MENU[this.buyCat].items.filter((id) => {
          const it = WEAPONS[id] || EQUIP[id];
          return !it.team || it.team === 'any' || it.team === p.team;
        });
        if (items[n - 1]) this.g.playerBuy(items[n - 1]);
        this.buyCat = -1;
      }
      inp.pressed.delete('Digit' + n);
    }
    if (inp.wasPressed('Escape')) {
      inp.pressed.delete('Escape');
      this.closeBuy();
    }
  }

  scopeFov(w, level) {
    const z = w.def.zoom || [40, 15];
    return hToV(z[level - 1] || z[0]);
  }

  // Espectador: segue um colega vivo (clique troca).
  spectate(inp, time) {
    const g = this.g;
    const p = this.p;
    if (time - p.deadTime < 1.5) {
      this.hud.spectate('');
      this.target = null;
      return;
    }
    const mates = g.actors.filter((a) => a.alive && a.team === p.team && a !== p);
    if (!mates.length) {
      this.target = null;
      this.hud.spectate(g.mode === 'defuse' ? 'Aguardando a próxima rodada…' : 'Renascendo…');
      return;
    }
    if (inp.wasPressed('Mouse0') || inp.wasPressed('Space')) this.specIdx++;
    if (inp.wasPressed('Mouse2')) this.specIdx--;
    this.specIdx = (this.specIdx + mates.length * 10) % mates.length;
    this.target = mates[this.specIdx];
    this.hud.spectate(`Assistindo: <b class="c-${this.target.team}">${this.target.name}</b> · ${Math.ceil(this.target.health)} HP · clique para trocar`);
  }

  viewActor() {
    const p = this.p;
    if (p.alive) return p;
    if (this.target && this.target.alive) return this.target;
    return p;
  }

  // Câmera e arma em primeira pessoa.
  camera(dt) {
    const g = this.g;
    const cam = g.camera;
    const s = g.settings;
    const v = this.viewActor();
    const p = this.p;
    const dead = !p.alive && v === p;
    cam.position.set(v.pos.x, v.pos.y + (dead ? 0.35 : eyeHeight(v)), v.pos.z);
    g.shake = damp(g.shake || 0, 0, 6, dt);
    g.flinch = damp(g.flinch || 0, 0, 9, dt);
    this.shakeT += dt * 40;
    const sh = (g.shake || 0) * 0.012;
    const fl = (g.flinch || 0) * 0.02;
    cam.rotation.y = v.yaw + v.punch.x * DEG + Math.sin(this.shakeT * 1.3) * sh;
    cam.rotation.x = v.pitch + v.punch.y * DEG + Math.sin(this.shakeT) * sh + fl;
    cam.rotation.z = dead ? 0.3 : 0;
    const w = v.weapon;
    const scoped = v.scope > 0 && w?.def.type === 'sniper';
    const fov = scoped ? this.scopeFov(w, v.scope) : s.fov;
    v.fovNow = fov;
    if (Math.abs(cam.fov - fov) > 0.01 || cam.aspect !== innerWidth / innerHeight) {
      cam.fov = fov;
      cam.aspect = innerWidth / innerHeight;
      cam.updateProjectionMatrix();
    }
    // modelos: esconde quem está "dentro" da câmera
    for (const a of g.actors) {
      if (!a.model) continue;
      if (a === v && a.alive) a.model.visible = false;
      else if (a.isPlayer) a.model.visible = !a.alive;
      else a.model.visible = true;
    }
    // arma em primeira pessoa (também do colega espectado)
    const vm = g.vm;
    if (v !== this.lastView || (w && vm.id !== w.id && !v.planting)) {
      if (v !== p) vm.setTeam(v.team);
      else vm.setTeam(p.team);
      if (w) vm.equip(w.id, w.def.type, v === this.lastView ? 0.4 : 0.01);
      this.lastView = v;
    }
    vm.visible = v.alive && !v.defusing;
    const [mdx, mdy] = v === p ? this.lastMouse : [0, 0];
    vm.update(dt, {
      speed: Math.hypot(v.vel.x, v.vel.z),
      onGround: v.onGround,
      mouseDX: mdx,
      mouseDY: mdy,
      scoped,
      crouch: v.crouchT,
    });
    if (v !== p && v.lastShotSeen !== v.lastShot) {
      v.lastShotSeen = v.lastShot;
      if (g.time - v.lastShot < 0.05) vm.kick(1);
    }
    dirFromAngles(cam.rotation.y, cam.rotation.x, _f);
    g.audio.setListener(cam.position, _f);
  }
}

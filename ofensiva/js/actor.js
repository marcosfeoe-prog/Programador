// Ator: estado comum ao jogador e aos bots (vida, colete, dinheiro, inventário,
// recuo, imprecisão, agachar). A lógica de disparo fica no Game.
import * as THREE from 'three';
import { WEAPONS, makeWeapon } from './weapons.js';
import { clamp, damp } from './util.js';
import { buildCharacter } from './models.js';

let NEXT_ID = 1;

export class Actor {
  constructor({ name, team, squad, isPlayer = false }) {
    this.id = NEXT_ID++;
    this.name = name;
    this.team = team; // 'T' ou 'CT'
    this.squad = squad; // 0 = time do jogador, 1 = adversário (o placar segue o time)
    this.isPlayer = isPlayer;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.crouch = false;
    this.crouchT = 0;
    this.walking = false;
    this.onGround = true;
    this.jumpReady = true;
    this.events = [];
    this.health = 100;
    this.armor = 0;
    this.helmet = false;
    this.kit = false;
    this.money = 800;
    this.alive = true;
    this.kills = 0;
    this.deaths = 0;
    this.assists = 0;
    this.score = 0;
    this.mvps = 0;
    this.roundKills = 0;
    this.damageBy = new Map(); // atacante → dano (para assistências)
    this.inv = [null, null, makeWeapon('knife'), null, null];
    this.grenades = [];
    this.slot = 1;
    this.lastSlot = 2;
    this.nadeIdx = 0;
    this.nextFire = 0;
    this.reloadEnd = 0;
    this.drawEnd = 0;
    this.shellReload = false;
    this.recoilIdx = 0;
    this.lastShot = -10;
    this.fireInacc = 0;
    this.punch = { x: 0, y: 0 };
    this.scope = 0;
    this.flashUntil = 0;
    this.flashDur = 0;
    this.slowUntil = 0;
    this.stepT = 0;
    this.planting = 0;
    this.defusing = 0;
    this.deadTime = 0;
    this.model = null;
    this.triggerHeld = false;
  }

  makeModel(scene) {
    if (this.model) scene.remove(this.model);
    this.model = buildCharacter(this.team, this.id);
    scene.add(this.model);
  }

  get weapon() {
    return this.slot === 3 ? (this.grenades.length ? { def: WEAPONS[this.grenades[this.nadeIdx % this.grenades.length]], id: this.grenades[this.nadeIdx % this.grenades.length] } : null) : this.inv[this.slot];
  }

  get hasBomb() {
    return !!this.inv[4];
  }

  hasSlot(s) {
    return s === 3 ? this.grenades.length > 0 : !!this.inv[s];
  }

  defaultPistol() {
    return this.team === 'T' ? 'glock' : 'usp';
  }

  // Início de rodada: quem sobreviveu mantém as armas.
  spawn(pos, yaw, keepGear) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.yaw = yaw;
    this.pitch = 0;
    this.health = 100;
    this.alive = true;
    this.crouchT = 0;
    this.crouch = false;
    this.onGround = true;
    this.flashUntil = 0;
    this.slowUntil = 0;
    this.planting = 0;
    this.defusing = 0;
    this.scope = 0;
    this.recoilIdx = 0;
    this.fireInacc = 0;
    this.punch.x = this.punch.y = 0;
    this.roundKills = 0;
    this.damageBy.clear();
    this.reloadEnd = 0;
    this.inv[4] = null;
    if (!keepGear) {
      this.inv[0] = null;
      this.inv[1] = makeWeapon(this.defaultPistol());
      this.grenades = [];
      this.armor = 0;
      this.helmet = false;
      this.kit = false;
    } else {
      // recarrega a munição como no início de rodada
      for (const w of this.inv) if (w && w.def.mag) {
        w.mag = w.def.mag;
        w.reserve = w.def.reserve;
      }
    }
    if (this.team === 'T') this.kit = false;
    this.slot = this.inv[0] ? 0 : 1;
    this.lastSlot = 2;
    this.drawEnd = 0;
    if (this.model) {
      this.model.visible = true;
      this.model.rotation.set(0, 0, 0);
    }
  }

  maxSpeed(time) {
    const w = this.weapon;
    let s = w ? w.def.speed : 6.25;
    if (this.scope && w?.def.scopeSpeed) s = w.def.scopeSpeed;
    if (this.crouchT > 0.5) s *= 0.34;
    else if (this.walking) s *= 0.52;
    if (time < this.slowUntil) s *= 0.55;
    if (this.planting || this.defusing) s = 0;
    return s;
  }

  // Imprecisão atual (radianos) para a arma em mãos.
  inaccuracy() {
    const w = this.weapon;
    if (!w || !w.def.stand) return 0;
    const d = w.def;
    let v = this.crouchT > 0.5 ? d.crouch : d.stand;
    const sp = Math.hypot(this.vel.x, this.vel.z);
    const frac = sp / d.speed;
    v += d.move * clamp((frac - 0.34) / 0.66, 0, 1) ** 1.3;
    if (!this.onGround) v += d.jump;
    v += this.fireInacc;
    if (d.unscoped && !this.scope) v += d.unscoped;
    return (v + d.spread) / 1000;
  }

  switchTo(slot, time) {
    if (slot === this.slot && slot === 3 && this.grenades.length > 1) {
      this.nadeIdx = (this.nadeIdx + 1) % this.grenades.length;
      this.drawEnd = time + 0.4;
      return true;
    }
    if (slot === this.slot || !this.hasSlot(slot)) return false;
    this.lastSlot = this.slot;
    this.slot = slot;
    this.reloadEnd = 0;
    this.scope = 0;
    this.recoilIdx = 0;
    const d = this.weapon?.def;
    this.drawEnd = time + (d?.type === 'sniper' ? 1.0 : d?.type === 'rifle' ? 0.8 : d?.type === 'knife' ? 0.35 : 0.55);
    this.nextFire = Math.max(this.nextFire, this.drawEnd);
    return true;
  }

  bestSlot() {
    if (this.inv[0]) return 0;
    if (this.inv[1]) return 1;
    return 2;
  }

  startReload(time) {
    const w = this.weapon;
    if (!w || !w.def.mag || w.mag >= w.def.mag || w.reserve <= 0 || time < this.reloadEnd || time < this.drawEnd) return false;
    this.reloadEnd = time + w.def.reload;
    this.shellReload = !!w.def.shellReload;
    this.scope = 0;
    return true;
  }

  update(dt, time) {
    // agachar suave (~0,2 s)
    this.crouchT = damp(this.crouchT, this.crouch ? 1 : 0, 14, dt);
    if (Math.abs(this.crouchT - (this.crouch ? 1 : 0)) < 0.01) this.crouchT = this.crouch ? 1 : 0;
    const w = this.weapon;
    // fim da recarga
    if (this.reloadEnd && time >= this.reloadEnd && w && w.def.mag) {
      if (this.shellReload) {
        w.mag++;
        w.reserve--;
        this.events.push('shell');
        if (w.mag < w.def.mag && w.reserve > 0) this.reloadEnd = time + w.def.reload;
        else this.reloadEnd = 0;
      } else {
        const need = w.def.mag - w.mag;
        const take = Math.min(need, w.reserve);
        w.mag += take;
        w.reserve -= take;
        this.reloadEnd = 0;
        this.events.push('reloaded');
      }
    }
    // recuperação da imprecisão e do recuo
    if (w && w.def.recovery) {
      this.fireInacc *= Math.exp(-dt / (w.def.recovery * 0.45));
      if (time - this.lastShot > w.def.rate * 1.2) this.recoilIdx = Math.max(0, this.recoilIdx - dt * (1 / Math.max(0.05, w.def.rate)) * 0.9);
      const pat = w.def.pattern;
      if (pat) {
        const i0 = Math.floor(this.recoilIdx);
        const f = this.recoilIdx - i0;
        const a = pat[Math.min(i0, pat.length - 1)];
        const b = pat[Math.min(i0 + 1, pat.length - 1)];
        const tx = a[0] + (b[0] - a[0]) * f;
        const ty = a[1] + (b[1] - a[1]) * f;
        this.punch.x = damp(this.punch.x, tx, 22, dt);
        this.punch.y = damp(this.punch.y, ty, 22, dt);
      }
    } else {
      this.punch.x = damp(this.punch.x, 0, 10, dt);
      this.punch.y = damp(this.punch.y, 0, 10, dt);
      this.recoilIdx = 0;
    }
  }

  // Registra um disparo no sistema de recuo.
  onShot(time) {
    const d = this.weapon.def;
    this.lastShot = time;
    this.fireInacc = Math.min(this.fireInacc + d.fire, d.fire * 12 + 60);
    this.recoilIdx = Math.min(this.recoilIdx + 1, (d.pattern?.length || 2) - 1);
  }

  isFlashed(time) {
    return time < this.flashUntil;
  }

  flashAmount(time) {
    if (time >= this.flashUntil) return 0;
    const left = this.flashUntil - time;
    return clamp(left / Math.min(1.8, this.flashDur * 0.5), 0, 1);
  }
}

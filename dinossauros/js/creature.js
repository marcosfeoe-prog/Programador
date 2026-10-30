// Criatura (jogador ou IA): movimento sobre o terreno, natação, colisão,
// sistema de sobrevivência (vida, fome, sede, energia, sangramento e
// crescimento), ataques com dano por espécie e carcaça após a morte.
import * as THREE from 'three';
import { createDino } from './rig.js';
import { Animator } from './anim.js';
import { clamp, damp, dampAngle, lerp, wrapAngle } from './util.js';
import { WATER } from './world.js';
import { stageName } from './config.js';

let NEXT_ID = 1;
const ATTACKS = {
  bite: { dur: 0.75, hit: 0.46, stamina: 9 },
  horns: { dur: 0.95, hit: 0.48, stamina: 12 },
  tail: { dur: 0.95, hit: 0.5, stamina: 12 },
  stomp: { dur: 1.5, hit: 0.72, stamina: 16 },
};

export class Creature {
  constructor(game, spec, { growth = 1, isPlayer = false, x = 0, z = 0, yaw = 0 } = {}) {
    this.id = NEXT_ID++;
    this.game = game;
    this.world = game.world;
    this.spec = spec;
    this.isPlayer = isPlayer;
    this.growth = growth;
    const d = createDino(spec, game.quality);
    this.dino = d;
    this.L = d.layout;
    this.anim = new Animator(spec, d);
    this.group = new THREE.Group();
    this.body = new THREE.Group();
    this.body.add(d.mesh);
    this.group.add(this.body);
    this.group.rotation.order = 'YXZ';
    this.pos = new THREE.Vector3(x, 0, z);
    this.pos.y = this.groundY();
    this.yaw = yaw;
    this.pitch = 0;
    this.speed = 0;
    this.turn = 0;
    this.wantYaw = yaw;
    this.wantSpeed = 0;
    this.wantRun = false;
    this.running = false;
    this.swim = false;
    this.wading = 0;
    // sobrevivência
    this.hp = this.maxHp;
    this.hunger = 75 + Math.random() * 25;
    this.thirst = 70 + Math.random() * 30;
    this.stamina = 100;
    this.bleed = 0;
    this.dead = false;
    this.resting = false;
    this.eating = null;
    this.drinking = false;
    this.action = null;
    this.cooldown = 0;
    this.lastAttacker = null;
    this.lastHurtT = -99;
    this.meat = 0;
    this.rot = 0;
    this.age = 0;
    this.kills = 0;
    this.lookYaw = 0;
    this.lookPitch = 0;
    this.animAcc = 0;
    this.applyScale();
    this.syncTransform();
  }

  // ------------------------------------------------------------------ tamanho
  get scale() {
    return lerp(this.spec.hatchScale, 1, this.growth);
  }
  get maxHp() {
    return this.spec.stats.health * (0.15 + 0.85 * this.scale);
  }
  get damage() {
    return this.spec.stats.damage * (0.12 + 0.88 * this.scale);
  }
  // "poder" usado pela IA para decidir caçar, fugir ou lutar
  get power() {
    return this.maxHp * (0.4 + (this.spec.stats.damage / 200) * 0.6) * (this.hp / this.maxHp * 0.5 + 0.5);
  }
  get radius() {
    return this.L.width * this.scale;
  }
  get speedFactor() {
    return 0.55 + 0.45 * this.scale;
  }
  get walkSpeed() {
    return this.spec.stats.walk * this.speedFactor;
  }
  get runSpeed() {
    return this.spec.stats.run * this.speedFactor;
  }
  get appetite() {
    return this.spec.survival.appetite * (0.12 + 0.88 * this.scale * this.scale);
  }
  get stage() {
    return stageName(this.growth);
  }
  get forward() {
    return new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }

  applyScale() {
    this.body.scale.setScalar(this.scale);
  }

  setGrowth(g) {
    const ratio = this.hp / this.maxHp;
    const before = this.stage;
    this.growth = clamp(g, 0, 1);
    this.hp = ratio * this.maxHp;
    this.applyScale();
    return before !== this.stage;
  }

  // pontos da boca / cauda no mundo (aproximados pela pose de repouso)
  localToWorld(z, y = 0) {
    const s = this.scale;
    const f = this.forward;
    return new THREE.Vector3(this.pos.x + f.x * z * s, this.pos.y + y * s, this.pos.z + f.z * z * s);
  }
  get mouth() {
    return this.localToWorld(this.L.headZ, this.L.snout.y);
  }
  // círculos que cobrem o corpo (para golpes e colisão)
  circles() {
    const L = this.L;
    const s = this.scale;
    const r = L.width * s;
    return [
      { p: this.localToWorld(L.tailZ * 0.45), r: r * 0.65 },
      { p: this.localToWorld(0), r: r * 1.05 },
      { p: this.localToWorld(L.headZ * 0.5), r: r * 0.9 },
      { p: this.localToWorld(L.headZ * 0.9, L.snout.y), r: r * 0.55 },
    ];
  }
  distToBody(p) {
    let best = 1e9;
    for (const c of this.circles()) {
      const d = Math.hypot(c.p.x - p.x, c.p.z - p.z) - c.r;
      if (d < best) best = d;
    }
    return best;
  }

  groundY() {
    return this.world.height(this.pos.x, this.pos.z);
  }

  // ------------------------------------------------------------------ ações
  canAct() {
    return !this.dead && !this.action && this.cooldown <= 0;
  }

  startAttack() {
    if (!this.canAct()) return false;
    const a = ATTACKS[this.spec.attack];
    if (this.stamina < a.stamina * 0.5) return false;
    this.stopFeeding();
    this.resting = false;
    this.stamina = Math.max(0, this.stamina - a.stamina);
    this.action = { name: 'attack', t: 0, dur: a.dur, hit: a.hit, didHit: false };
    this.game.audio.attack(this);
    return true;
  }

  startRoar() {
    if (!this.canAct()) return false;
    this.stopFeeding();
    const roar = this.spec.diet === 'carnivoro';
    this.action = { name: roar ? 'roar' : 'call', t: 0, dur: roar ? 1.9 : 1.6 };
    this.cooldown = 0;
    this.game.audio.roar(this);
    this.game.onRoar(this);
    return true;
  }

  stopFeeding() {
    this.eating = null;
    this.drinking = false;
  }

  // procura algo para comer/beber perto da boca
  findFood() {
    const m = this.mouth;
    const reach = 1.2 + this.radius * 0.6;
    if (this.spec.diet === 'carnivoro') {
      let best = null;
      let bd = 1e9;
      for (const c of this.game.creatures) {
        if (!c.dead || c.meat <= 0 || c === this) continue;
        const d = c.distToBody(m);
        if (d < reach + 0.8 && d < bd) {
          bd = d;
          best = c;
        }
      }
      if (best) return { kind: 'carcass', target: best };
    } else {
      const type = this.spec.ai.browser ? 'tree' : 'plant';
      const p = this.world.nearestFood(m.x, m.z, reach + 1.2 * this.scale + (type === 'tree' ? 4 : 0), type);
      if (p) return { kind: type, target: p };
    }
    return null;
  }

  canDrinkHere() {
    const m = this.mouth;
    return this.world.height(m.x, m.z) < WATER - 0.05 || this.wading > 0.15 || this.swim;
  }

  startEat(food) {
    if (this.dead || this.action) return false;
    this.eating = food;
    this.drinking = false;
    this.resting = false;
    return true;
  }

  startDrink() {
    if (this.dead || this.action) return false;
    this.drinking = true;
    this.eating = null;
    this.resting = false;
    return true;
  }

  takeDamage(amount, bleed, from) {
    if (this.dead) return;
    const armor = this.spec.stats.armor || 0;
    const dmg = amount * (1 - armor * 0.4);
    this.hp -= dmg;
    this.bleed = Math.min(30, this.bleed + bleed);
    this.lastAttacker = from;
    this.lastHurtT = this.age;
    this.resting = false;
    this.stopFeeding();
    if (!this.action) this.action = { name: 'hurt', t: 0, dur: 0.4 };
    this.game.onDamage(this, dmg, from);
    if (this.hp <= 0) this.die(from);
  }

  die(from) {
    if (this.dead) return;
    this.dead = true;
    this.hp = 0;
    this.action = null;
    this.speed = 0;
    this.stopFeeding();
    this.resting = false;
    this.meat = this.spec.stats.health * 0.8 * (0.15 + 0.85 * this.scale * this.scale);
    this.maxMeat = this.meat;
    if (from) from.kills++;
    this.game.audio.death(this);
    this.game.onDeath(this, from);
  }

  // golpe: acha alvos no alcance e aplica dano
  doHit() {
    const s = this.scale;
    const reach = this.spec.stats.reach * s + 0.4;
    let p;
    const type = this.spec.attack;
    if (type === 'tail') p = this.localToWorld(this.L.tailZ * 0.75, 0);
    else if (type === 'stomp') p = this.localToWorld(this.L.headZ * 0.42, 0);
    else p = this.localToWorld(this.L.headZ + this.spec.stats.reach * 0.4, 0);
    const hits = [];
    for (const c of this.game.creatures) {
      if (c === this || c.dead) continue;
      // a IA não fere a própria manada (só o alvo dela)
      if (!this.isPlayer && c.spec === this.spec && !(this.brain && this.brain.target === c)) continue;
      const d = c.distToBody(p);
      if (d < reach) hits.push({ c, d });
    }
    hits.sort((a, b) => a.d - b.d);
    const n = type === 'tail' || type === 'stomp' ? 3 : 1;
    for (const h of hits.slice(0, n)) {
      // atacar algo muito maior rende menos; algo menor, mais
      const rel = clamp(this.scale * this.spec.stats.health / (h.c.scale * h.c.spec.stats.health + 1), 0.4, 2.5);
      const dmg = this.damage * (0.8 + 0.2 * Math.sqrt(rel)) * (0.9 + Math.random() * 0.2);
      h.c.takeDamage(dmg, this.spec.stats.bleed * (0.3 + 0.7 * this.scale), this);
      this.game.audio.hit(this, h.c);
    }
    return hits.length > 0;
  }

  // ------------------------------------------------------------------ atualização
  update(dt, animLOD = 1) {
    this.age += dt;
    if (this.dead) {
      this.updateDead(dt, animLOD);
      return;
    }
    if (this.cooldown > 0) this.cooldown -= dt;

    // ação em andamento
    if (this.action) {
      const a = this.action;
      a.t += dt / a.dur;
      if (a.name === 'attack' && !a.didHit && a.t >= a.hit) {
        a.didHit = true;
        this.doHit();
      }
      if (a.t >= 1) {
        this.action = null;
        if (a.name === 'attack') this.cooldown = 0.15;
      }
    }

    this.updateSurvival(dt);
    if (this.dead) return;
    this.updateMovement(dt);
    this.updateFeeding(dt);
    this.syncTransform();
    this.animate(dt, animLOD);
  }

  updateSurvival(dt) {
    const sv = this.spec.survival;
    const k = this.isPlayer ? 1 : 0.7;
    const act = this.running ? 2.0 : this.resting ? 0.55 : 1;
    this.hunger = Math.max(0, this.hunger - (sv.hunger / 60) * act * dt * k);
    this.thirst = Math.max(0, this.thirst - (sv.thirst / 60) * act * dt * k * (this.swim ? 0.3 : 1));
    // energia
    if (this.running) this.stamina -= 9 * dt;
    else if (this.swim) this.stamina -= 1.5 * dt;
    else {
      let r = 12;
      if (this.hunger < 20 || this.thirst < 20) r *= 0.5;
      if (this.resting) r *= 1.7;
      this.stamina += r * dt;
    }
    this.stamina = clamp(this.stamina, 0, 100);
    // sangramento
    if (this.bleed > 0) {
      this.hp -= this.bleed * dt * 0.6 * (this.maxHp / 1000 + 0.4);
      this.bleed = Math.max(0, this.bleed - dt * (0.25 + (this.resting ? 0.6 : 0)));
    }
    // fome / sede zeradas ferem
    const starve = this.isPlayer ? 1 : 0.4;
    if (this.hunger <= 0) this.hp -= this.maxHp * 0.01 * dt * starve;
    if (this.thirst <= 0) this.hp -= this.maxHp * 0.013 * dt * starve;
    // regeneração
    if (this.hunger > 25 && this.thirst > 25 && this.bleed < 0.3 && this.age - this.lastHurtT > 6) {
      this.hp += this.maxHp * 0.004 * dt * (this.resting ? 3 : 1);
    }
    this.hp = Math.min(this.hp, this.maxHp);
    // crescimento
    if (this.growth < 1 && this.hunger > 40 && this.thirst > 40) {
      const rate = 1 / (sv.growMin * 60);
      const grew = this.setGrowth(this.growth + rate * dt * (this.resting ? 1.3 : 1));
      if (grew) this.game.onStage(this);
    }
    if (this.hp <= 0) this.die(this.lastAttacker && this.age - this.lastHurtT < 30 ? this.lastAttacker : null);
  }

  updateMovement(dt) {
    const s = this.scale;
    const w = this.world;
    // profundidade da água sob o corpo
    const gy = w.height(this.pos.x, this.pos.z);
    const hip = this.L.hipH * s;
    const depth = WATER - gy;
    const swimLine = hip * 0.95;
    this.swim = depth > swimLine;
    this.wading = clamp(depth / hip, 0, 1);

    const busy = this.resting || this.eating || this.drinking || (this.action && this.action.name !== 'attack' && this.action.name !== 'hurt');
    let target = busy ? 0 : this.wantSpeed;
    let canRun = this.wantRun && this.stamina > 1 && !this.swim;
    if (this.stamina <= 1) this.exhausted = true;
    if (this.exhausted && this.stamina > 25) this.exhausted = false;
    if (this.exhausted) canRun = false;
    const max = this.swim ? this.walkSpeed * 0.6 : canRun ? this.runSpeed : this.walkSpeed * (1 - this.wading * 0.4);
    target = Math.min(target, max);
    this.running = canRun && this.speed > this.walkSpeed * 1.05 && target > this.walkSpeed;
    const acc = target > this.speed ? 3 + 4 * (1 - s) : 6;
    this.speed = damp(this.speed, target, acc, dt);
    if (this.speed < 0.02 && target === 0) this.speed = 0;

    // giro limitado (animais grandes viram devagar)
    const turnRate = this.spec.stats.turn * (1.8 - 0.8 * s) * (this.speed < 0.5 ? 1.2 : 1);
    const diff = wrapAngle(this.wantYaw - this.yaw);
    const step = clamp(diff, -turnRate * dt, turnRate * dt);
    if (!busy || this.action?.name === 'attack') this.yaw = wrapAngle(this.yaw + step);
    this.turn = damp(this.turn, step / Math.max(dt, 1e-4), 8, dt);

    const f = this.forward;
    this.pos.x += f.x * this.speed * dt;
    this.pos.z += f.z * this.speed * dt;
    w.collide(this.pos, this.radius * 0.9);

    // altura: chão ou flutuando
    const g = w.height(this.pos.x, this.pos.z);
    const ty = Math.max(g, WATER - swimLine);
    this.pos.y = damp(this.pos.y, ty, 14, dt);
    if (Math.abs(this.pos.y - ty) > 3) this.pos.y = ty;
    // inclinação conforme o terreno
    const len = Math.max(1, (this.L.headZ - this.L.tailZ) * s * 0.35);
    const hf = w.height(this.pos.x + f.x * len, this.pos.z + f.z * len);
    const hb = w.height(this.pos.x - f.x * len, this.pos.z - f.z * len);
    const tp = this.swim ? 0 : clamp(Math.atan2(hb - hf, 2 * len), -0.35, 0.35);
    this.pitch = damp(this.pitch, tp, 5, dt);
  }

  updateFeeding(dt) {
    if (this.eating) {
      const e = this.eating;
      const t = e.target;
      const rate = this.appetite / 7; // enche de 0 a 100% em ~7 s
      if (this.hunger >= 100) {
        this.eating = null;
        return;
      }
      if (e.kind === 'carcass') {
        if (!t.dead || t.meat <= 0 || t.distToBody(this.mouth) > 2.5 + this.radius) {
          this.eating = null;
          return;
        }
        const got = Math.min(t.meat, rate * dt);
        t.meat -= got;
        this.hunger = Math.min(100, this.hunger + (got / this.appetite) * 100);
      } else {
        if (t.food <= 0.5) {
          this.eating = null;
          return;
        }
        const got = this.world.consumePlant(t, rate * dt);
        this.hunger = Math.min(100, this.hunger + (got / this.appetite) * 100 * 1.3);
      }
      this._chew = (this._chew || 0) + dt;
      if (this._chew > 0.9) {
        this._chew = 0;
        this.game.audio.eat(this);
      }
    } else if (this.drinking) {
      if (!this.canDrinkHere() || this.thirst >= 100) {
        this.drinking = false;
        return;
      }
      this.thirst = Math.min(100, this.thirst + 14 * dt);
      this._chew = (this._chew || 0) + dt;
      if (this._chew > 0.7) {
        this._chew = 0;
        this.game.audio.drink(this);
      }
    }
  }

  updateDead(dt, lod) {
    this.rot += dt;
    this.speed = 0;
    const g = this.world.height(this.pos.x, this.pos.z);
    this.pos.y = damp(this.pos.y, Math.max(g, WATER - this.L.hipH * this.scale * 0.6), 4, dt);
    // carcaça apodrece; quando acaba a carne, afunda no chão
    const gone = this.meat <= 0 || this.rot > 420;
    if (gone) {
      this.sink = (this.sink || 0) + dt * 0.25;
      this.pos.y -= this.sink * this.L.width * this.scale * 0.5;
      if (this.sink > 3) this.remove = true;
    }
    this.syncTransform();
    this.animate(dt, lod);
  }

  syncTransform() {
    this.group.position.copy(this.pos);
    this.group.rotation.set(this.pitch, this.yaw, 0);
  }

  animate(dt, lod) {
    this.animAcc += dt;
    if (lod > 1 && this.animAcc < dt * lod) return;
    const adt = this.animAcc;
    this.animAcc = 0;
    const eat = !!this.eating;
    this.anim.update(adt, {
      speed: this.speed / this.scale,
      run: this.running,
      turn: this.turn,
      action: this.action ? this.action.name : null,
      actionT: this.action ? this.action.t : 0,
      eat,
      drink: this.drinking,
      rest: this.resting,
      dead: this.dead,
      swim: this.swim,
      lookYaw: this.lookYaw,
      lookPitch: this.lookPitch,
    });
  }

  dispose() {
    this.group.removeFromParent();
  }
}

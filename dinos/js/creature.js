// Criatura: modelo + animador + sobrevivência (vida, fome, sede, energia,
// sangramento, crescimento), movimento sobre o relevo e combate.
import * as THREE from 'three';
import { SPECIES } from './species.js';
import { createDinoModel } from './dinoModel.js';
import { DinoAnimator } from './animator.js';
import { clamp, lerp, damp, turnToward, wrapAngle } from './util.js';
import { PLAY_RADIUS, WATER_Y } from './world.js';

const tmp = new THREE.Vector3();
const tmp2 = new THREE.Vector3();
let NEXT_ID = 1;

export const RATES = {
  hunger: 1 / 600, // barra cheia → vazia em 10 min parado
  thirst: 1 / 450,
  grow: 1 / 1080, // filhote → adulto em ~18 min bem alimentado
};

export class Creature {
  constructor(game, id, opts = {}) {
    this.uid = NEXT_ID++;
    this.game = game;
    this.world = game.world;
    this.id = id;
    this.spec = SPECIES[id];
    this.isPlayer = !!opts.player;
    this.model = createDinoModel(id, game.quality.name);
    this.anim = new DinoAnimator(this.model);
    this.root = this.model.root;
    this.data = this.model.data;
    this.growth = opts.growth ?? 1;
    this.pos = new THREE.Vector3(opts.x ?? 0, 0, opts.z ?? 0);
    this.pos.y = this.world.height(this.pos.x, this.pos.z);
    this.yaw = opts.yaw ?? Math.random() * Math.PI * 2;
    this.pitch = 0;
    this.speed = 0;
    this.turn = 0;
    this.health = this.maxHealth;
    this.hunger = opts.hunger ?? 0.85;
    this.thirst = opts.thirst ?? 0.85;
    this.stamina = 1;
    this.exhausted = false;
    this.bleed = 0;
    this.dead = false;
    this.deadTime = 0;
    this.meat = 0;
    this.action = null; // 'eat' | 'drink' | 'rest' | 'sleep'
    this.actionTarget = null;
    this.attackCd = 0;
    this.attackHitT = -1;
    this.lungeT = -1;
    this.roarCd = 0;
    this.lastAttacker = null;
    this.lastHitTime = -99;
    this.kills = 0;
    this.cause = '';
    // comando de movimento: velocidade desejada (m/s) e direção (rad)
    this.ctrl = { speed: 0, yaw: this.yaw, run: false };
    this.lookAt = null; // ponto que a cabeça e os olhos acompanham
    this.groundFn = (x, z) => this.world.height(x, z);
    this.detail = 2;
    this.root.position.copy(this.pos);
    this.root.rotation.order = 'YXZ';
    this.root.scale.setScalar(this.scale);
    game.scene.add(this.root);
    this.anim.footstep = (leg) => game.onFootstep(this, leg);
  }

  // ------------------------------------------------------------ atributos
  get scale() {
    return 0.35 + 0.65 * this.growth;
  }
  get maxHealth() {
    return this.spec.stats.health * (0.2 + 0.8 * this.growth);
  }
  get damage() {
    return this.spec.stats.attack * (0.25 + 0.75 * this.growth);
  }
  get power() {
    // tamanho efetivo para decidir quem tem medo de quem
    return this.spec.sizeClass * this.scale * (0.5 + 0.5 * this.health / this.maxHealth);
  }
  get radius() {
    return this.data.width * this.scale * 1.15;
  }
  get speeds() {
    const s = this.spec.stats;
    const k = 0.78 + 0.22 * this.growth;
    return { walk: s.walk * k, trot: s.trot * k, run: s.run * k * (this.growth < 0.5 ? 1.05 : 1) };
  }
  get appetite() {
    return this.spec.appetite * (0.2 + 0.8 * this.growth);
  }
  get busy() {
    return this.dead || this.action === 'rest' || this.action === 'sleep';
  }
  forward(out = tmp) {
    return out.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
  }
  // ponto no mundo de uma posição do modelo (metros de adulto)
  modelToWorld(v, out = new THREE.Vector3()) {
    return out.copy(v).applyAxisAngle(THREE.Object3D.DEFAULT_UP, this.yaw).multiplyScalar(this.scale).add(this.pos);
  }
  mouthWorld(out = new THREE.Vector3()) {
    return this.modelToWorld(this.data.mouth, out);
  }
  // segmento do corpo (cauda → peito) para colisões e mordidas
  bodySegment(a, b) {
    this.modelToWorld(tmp2.set(0, this.data.hipY, this.data.tailZ * 0.45), a);
    this.modelToWorld(tmp2.set(0, this.data.hipY, this.data.snoutZ * 0.55), b);
  }
  distToBody(p, flat = false) {
    const a = Creature._a || (Creature._a = new THREE.Vector3());
    const b = Creature._b || (Creature._b = new THREE.Vector3());
    this.bodySegment(a, b);
    if (flat) {
      // só no plano do chão (comer carcaças, alcance da boca)
      a.y = b.y = p.y;
    }
    const ab = b.sub(a);
    const t = clamp(tmp2.copy(p).sub(a).dot(ab) / Math.max(ab.lengthSq(), 1e-6), 0, 1);
    return tmp2.copy(a).addScaledVector(ab, t).distanceTo(p) - this.radius;
  }

  // ------------------------------------------------------------ ações
  setAction(a, target = null) {
    if (this.dead) return;
    this.action = a;
    this.actionTarget = target;
  }

  attack() {
    if (this.dead || this.attackCd > 0 || this.busy) return false;
    if (this.stamina < 0.06) return false;
    this.action = null;
    const st = this.spec.stats;
    this.anim.attack();
    this.attackCd = st.cooldown;
    this.attackHitT = st.attackTime * 0.48;
    // mordida com bote: o corpo avança junto com a cabeça
    this.lungeT = st.tailAttack ? -1 : 0;
    this.stamina = Math.max(0, this.stamina - 0.07);
    this.game.audio.attack(this, false);
    return true;
  }

  roar() {
    if (this.dead || this.roarCd > 0) return false;
    if (this.action === 'sleep') this.action = null;
    this.anim.roar();
    this.roarCd = this.spec.voice.length + 1.2;
    this.game.audio.roar(this);
    this.game.onRoar(this);
    return true;
  }

  hitTargets() {
    const st = this.spec.stats;
    const reach = st.reach * this.scale;
    const center = new THREE.Vector3();
    if (st.tailAttack) {
      // golpe de cauda: atinge atrás e dos lados
      this.modelToWorld(tmp2.set(0, this.data.hipY * 0.8, this.data.tailZ * 0.8), center);
    } else {
      this.modelToWorld(tmp2.set(0, this.data.mouth.y, this.data.mouth.z + st.reach * 0.35), center);
    }
    let hits = 0;
    for (const o of this.game.creatures) {
      if (o === this || o.dead) continue;
      if (o.pos.distanceToSquared(this.pos) > (reach + 30) ** 2) continue;
      // alcança para baixo à vontade; para cima só até a barriga do alvo
      const belly = o.pos.y + o.data.bellyY * o.scale;
      if (belly > center.y + reach * 1.5) continue;
      if (o.distToBody(center, true) < reach * 0.75) {
        const dmg = this.damage * (0.85 + Math.random() * 0.3);
        o.takeDamage(dmg, this);
        hits++;
      }
    }
    if (hits) {
      this.game.audio.attack(this, true);
      if (this.spec.diet === 'carnivore') this.anim.thrash();
    }
    return hits;
  }

  takeDamage(amount, from, cause) {
    if (this.dead) return;
    this.health -= amount;
    this.lastHitTime = this.game.time;
    if (from) {
      this.lastAttacker = from;
      if (from.spec.diet === 'carnivore' || from.spec.stats.tailAttack) this.bleed += amount * 0.012;
      // empurrão
      const push = clamp((from.power / Math.max(this.power, 0.2)) * 0.12, 0, 0.7);
      tmp.copy(this.pos).sub(from.pos).setY(0).normalize();
      this.pos.addScaledVector(tmp, push);
    }
    if (this.action) this.action = null;
    // recua para o lado oposto ao do golpe
    let side = Math.random() < 0.5 ? 1 : -1;
    if (from) side = (from.pos.x - this.pos.x) * Math.cos(this.yaw) - (from.pos.z - this.pos.z) * Math.sin(this.yaw) > 0 ? -1 : 1;
    this.anim.hurt(side);
    this.game.onHurt(this, amount, from);
    if (this.health <= 0) this.die(cause || (from ? `Morto por um ${from.spec.name}` : 'Ferimentos'));
  }

  die(cause) {
    if (this.dead) return;
    this.dead = true;
    this.cause = cause;
    this.health = 0;
    this.speed = 0;
    this.action = null;
    this.deadTime = 0;
    this.meat = this.spec.meat * (0.15 + 0.85 * this.growth * this.growth);
    this.meatMax = this.meat;
    if (this.lastAttacker && !this.lastAttacker.dead) this.lastAttacker.kills++;
    this.game.onDeath(this);
  }

  // ------------------------------------------------------------ atualização
  update(dt) {
    const w = this.world;
    if (this.dead) {
      this.deadTime += dt;
      // carcaça apodrece devagar
      this.meat = Math.max(0, this.meat - dt * this.meatMax * 0.0012);
      this.animate(dt);
      return;
    }
    this.attackCd = Math.max(0, this.attackCd - dt);
    if (this.lungeT >= 0) {
      const st = this.spec.stats;
      this.lungeT += dt / st.attackTime;
      if (this.lungeT > 0.36 && this.lungeT < 0.58) {
        const dist = st.reach * this.scale * (this.spec.anim?.bite === 'rex' ? 0.55 : 0.35);
        const f = this.forward();
        const v = dist / (0.22 * st.attackTime);
        this.pos.x += f.x * v * dt;
        this.pos.z += f.z * v * dt;
      }
      if (this.lungeT >= 1) this.lungeT = -1;
    }
    this.roarCd = Math.max(0, this.roarCd - dt);
    if (this.attackHitT >= 0) {
      this.attackHitT -= dt;
      if (this.attackHitT < 0) this.hitTargets();
    }

    // ---- movimento ----
    const sp = this.speeds;
    let want = this.ctrl.speed;
    if (this.busy || this.action === 'eat' || this.action === 'drink') want = 0;
    const running = want > sp.trot * 1.05;
    if (running) {
      if (this.exhausted || this.stamina <= 0) want = sp.trot;
    }
    const turnRate = this.spec.stats.turn * (1.25 - 0.25 * this.growth) * lerp(1, 0.65, clamp(this.speed / sp.run, 0, 1));
    const prevYaw = this.yaw;
    if (!this.busy && this.action !== 'eat' && this.action !== 'drink') {
      this.yaw = turnToward(this.yaw, this.ctrl.yaw, turnRate, dt);
      // reduz a velocidade quando precisa virar muito
      const diff = Math.abs(wrapAngle(this.ctrl.yaw - this.yaw));
      want *= clamp(Math.cos(Math.min(diff, Math.PI / 2)) * 1.2, 0.15, 1);
    }
    this.turn = damp(this.turn, wrapAngle(this.yaw - prevYaw) / Math.max(dt, 1e-4), 10, dt);
    const accel = this.spec.stats.accel * (want > this.speed ? 1 : 2.2);
    this.speed = this.speed + clamp(want - this.speed, -accel * dt, accel * dt);

    // inclinação e água
    const fwd = this.forward();
    const hHere = w.height(this.pos.x, this.pos.z);
    const look = Math.max(1.5, this.data.length * this.scale * 0.3);
    const hAhead = w.height(this.pos.x + fwd.x * look, this.pos.z + fwd.z * look);
    const slope = (hAhead - hHere) / look;
    let k = clamp(1 - Math.max(0, slope - 0.1) * 1.6, 0.25, 1);
    const depth = Math.max(0, WATER_Y - hHere);
    const hip = this.data.hipY * this.scale;
    k *= lerp(1, 0.45, clamp(depth / (hip * 0.8), 0, 1));
    const step = this.speed * k * dt;
    const nx = this.pos.x + fwd.x * step;
    const nz = this.pos.z + fwd.z * step;
    const nDepth = Math.max(0, WATER_Y - w.height(nx, nz));
    if (nDepth > hip * 0.85 && nDepth > depth) {
      // água funda: não deixa avançar
      this.speed *= 0.5;
      this.blockedWater = true;
    } else {
      this.pos.x = nx;
      this.pos.z = nz;
      this.blockedWater = false;
    }
    w.collide(this.pos, this.radius * 0.45);
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > PLAY_RADIUS) {
      this.pos.x *= PLAY_RADIUS / r;
      this.pos.z *= PLAY_RADIUS / r;
    }
    this.inWater = depth > 0.05;
    this.waterDepth = depth;

    // ---- sobrevivência ----
    const ai = !this.isPlayer;
    const run = this.speed > sp.trot * 1.1;
    const restK = this.action === 'sleep' ? 0.45 : this.action === 'rest' ? 0.7 : 1;
    const moveK = run ? 1.7 : this.speed > 0.3 ? 1.15 : 1;
    const rateK = ai ? 1.4 : 1;
    this.hunger = Math.max(0, this.hunger - dt * RATES.hunger * moveK * restK * rateK);
    this.thirst = Math.max(0, this.thirst - dt * RATES.thirst * moveK * restK * rateK * (this.game.heat ?? 1));
    if (run) {
      const drain = this.spec.sizeClass > 3 ? 0.11 : 0.075;
      this.stamina = Math.max(0, this.stamina - dt * drain);
      if (this.stamina <= 0) this.exhausted = true;
    } else {
      const regen = this.action === 'sleep' ? 0.2 : this.action === 'rest' ? 0.14 : this.speed < 0.2 ? 0.09 : 0.055;
      this.stamina = Math.min(1, this.stamina + dt * regen * (this.hunger > 0 ? 1 : 0.4));
      if (this.stamina > 0.3) this.exhausted = false;
    }
    const mh = this.maxHealth;
    if (this.bleed > 0) {
      this.health -= this.bleed * dt;
      this.bleed = Math.max(0, this.bleed - dt * (0.01 + this.bleed * (this.action ? 0.1 : 0.04)));
      if (this.health <= 0) return this.die('Sangrou até a morte');
    }
    if (!ai && (this.hunger <= 0 || this.thirst <= 0)) {
      this.health -= mh * 0.012 * dt;
      if (this.health <= 0) return this.die(this.hunger <= 0 ? 'Morreu de fome' : 'Morreu de sede');
    } else if (this.hunger > 0.2 && this.thirst > 0.2 && this.bleed < 0.01) {
      const regen = this.action === 'sleep' ? 0.02 : this.action === 'rest' ? 0.012 : 0.004;
      this.health = Math.min(mh, this.health + mh * regen * dt);
    }
    if (!ai && this.growth < 1 && this.hunger > 0.3 && this.thirst > 0.3) {
      const g0 = this.growth;
      this.growth = Math.min(1, this.growth + dt * RATES.grow * (this.action === 'sleep' ? 1.6 : 1));
      // vida acompanha o crescimento proporcionalmente
      this.health *= this.maxHealth / (this.spec.stats.health * (0.2 + 0.8 * g0));
    }

    // ---- comer / beber ----
    if (this.action === 'eat') this.doEat(dt);
    else if (this.action === 'drink') this.doDrink(dt);

    this.animate(dt);
  }

  findFood() {
    const mouth = this.mouthWorld(new THREE.Vector3());
    const reach = Math.max(1.6, this.data.length * this.scale * 0.22);
    if (this.spec.diet === 'carnivore') {
      let best = null;
      let bd = Infinity;
      for (const o of this.game.creatures) {
        if (!o.dead || o.meat <= 1 || o === this) continue;
        const d = o.distToBody(mouth, true);
        if (d < reach && d < bd) {
          bd = d;
          best = o;
        }
      }
      return best ? { type: 'carcass', obj: best } : null;
    }
    const b = this.world.nearestBush(mouth.x, mouth.z, reach + 1.5 * this.scale, 2);
    return b ? { type: 'bush', obj: b } : null;
  }

  canDrink() {
    const mouth = this.mouthWorld(new THREE.Vector3());
    return this.world.height(mouth.x, mouth.z) < WATER_Y - 0.05 || this.waterDepth > 0.15;
  }

  doEat(dt) {
    const f = this.actionTarget || this.findFood();
    if (!f) return (this.action = null);
    const want = this.appetite * 0.075 * dt;
    let got = 0;
    if (f.type === 'carcass') {
      const c = f.obj;
      if (c.meat <= 0.5) return (this.action = null);
      got = Math.min(c.meat, want);
      c.meat -= got;
    } else {
      got = this.world.eatBush(f.obj, want);
      if (got <= 0) return (this.action = null);
    }
    this.hunger = Math.min(1, this.hunger + got / this.appetite);
    if (this.hunger >= 0.999 && !this.isPlayer) this.action = null;
    this._chewT = (this._chewT || 0) - dt;
    if (this._chewT <= 0) {
      this._chewT = 0.55 + Math.random() * 0.3;
      this.game.audio.eat(this, f.type);
    }
  }

  doDrink(dt) {
    if (!this.canDrink()) return (this.action = null);
    this.thirst = Math.min(1, this.thirst + dt * 0.085);
    if (this.thirst >= 0.999 && !this.isPlayer) this.action = null;
    this._lapT = (this._lapT || 0) - dt;
    if (this._lapT <= 0) {
      this._lapT = 0.4 + Math.random() * 0.2;
      this.game.audio.drink(this);
    }
  }

  // ------------------------------------------------------------ pose e animação
  animate(dt) {
    const w = this.world;
    const fwd = this.forward();
    const sc = this.scale;
    const half = Math.max(0.6, this.data.length * sc * 0.28);
    const hF = w.height(this.pos.x + fwd.x * half, this.pos.z + fwd.z * half);
    const hB = w.height(this.pos.x - fwd.x * half, this.pos.z - fwd.z * half);
    const hC = w.height(this.pos.x, this.pos.z);
    const ground = Math.max(hC, (hF + hB) / 2);
    this.pos.y = this._y === undefined ? ground : damp(this._y, ground, 14, dt);
    this._y = this.pos.y;
    const targetPitch = -Math.atan2(hF - hB, half * 2) * (this.spec.quadruped ? 0.85 : 0.55);
    this.pitch = damp(this.pitch, this.dead ? targetPitch * 0.5 : targetPitch, 6, dt);
    this.root.position.copy(this.pos);
    this.root.rotation.set(this.pitch, this.yaw, 0);
    this.root.scale.setScalar(sc);
    if (this.detail === 0) return;
    if (this.detail === 1) {
      // longe: anima a cada dois quadros
      if ((this.game.frame + this.uid) % 2) return;
      dt *= 2;
    }
    const sp = this.speeds;
    this.anim.update(dt, {
      speed: this.speed,
      scale: sc,
      turn: this.turn,
      run: clamp((this.speed - sp.trot) / Math.max(sp.run - sp.trot, 0.1), 0, 1),
      eat: this.action === 'eat',
      drink: this.action === 'drink',
      rest: this.action === 'rest',
      sleep: this.action === 'sleep',
      dead: this.dead,
      pant: this.exhausted || this.stamina < 0.2,
      ground: this.groundFn,
      detail: this.detail,
      attackTime: this.spec.stats.attackTime,
      roarTime: this.spec.voice.length,
      yaw: this.yaw,
      pitch: this.pitch,
      pos: this.pos,
      look: this.lookAt,
    });
  }

  dispose() {
    this.game.scene.remove(this.root);
    this.model.mesh.skeleton.dispose();
  }
}

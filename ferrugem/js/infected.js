// Os dez novos tipos de infectados. Cada um muda um pouco a forma de lutar:
//   Corredor (runner)      rápido e frágil, ataca em bando
//   Brutamontes (brute)    enorme, investe e esmaga; tumor brilhante nas costas
//   Cuspidor (spitter)     mantém distância e cospe bile ácida; bolsa no pescoço
//   Inchado (bloater)      lento, explode perto do jogador ou quando morre
//   Gritador (screamer)    grita: chama os outros, acelera todos e traz Corredores
//   Blindado (shield)      escudo de choque bloqueia tiros de frente: pernas e flancos
//   Incendiário (burner)   deixa rastro de fogo e incendeia o jogador
//   Arrastado (dragger)    sem pernas, finge de morto e agarra o tornozelo
//   Cão infectado (dog)    matilha veloz, salta e morde
//   Espreitador (stalker)  quase invisível; só aparece na luz da lanterna
import * as THREE from 'three';
import { Humanoid, RigBase, charMat, BOX, CYL, SPH, CONE, V } from './rig.js';
import { Enemy } from './enemy_base.js';
import { Villager, randomLook, registerKind } from './enemies.js';
import { explode } from './combat.js';
import { clamp, dampAngle, angleDiff, rand, chance, pick } from './util.js';

const _tp = { dx: 0, dz: 0, d: 0, yaw: 0 };
const _dir = { x: 0, z: 0 };
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

function finish(e, dt, vx, vz, rate = 10) {
  const hit = e.integrate(dt, vx, vz);
  e.rig.apply(dt, rate);
  e.syncRig();
  return hit;
}

// Percepção simples (para os tipos que não herdam do aldeão).
function perceive(e, dt, tp, range = 22, fov = 1.2) {
  if (e.alertDelay > 0) {
    e.alertDelay -= dt;
    if (e.alertDelay <= 0) e.becomeAlert();
    return;
  }
  e.perceiveT = (e.perceiveT || 0) - dt;
  if (e.perceiveT > 0) return;
  e.perceiveT = 0.25;
  const G = e.G,
    P = G.player;
  if (P.dead || G.state !== 'play') return;
  let sees = tp.d < 4.5;
  if (!sees && tp.d < range) {
    if (Math.abs(angleDiff(e.yaw, tp.yaw)) < fov || (P.running && tp.d < 12)) sees = G.col.clear(e.pos.x, 1.4, e.pos.z, P.pos.x, 1.3, P.pos.z, 'bullet');
  }
  if (sees) e.becomeAlert();
}

function dissolve(e, dt, k0 = 1.6, sinkMax = 0.55) {
  const k = e.st / k0;
  e.sink = k * sinkMax;
  if (Math.random() < 0.6) e.G.fx.dissolve(e.pos, 2, 0.35);
  if (k >= 1) e.remove();
  void dt;
}

// Movimento de quem prefere ficar longe (Cuspidor, Gritador): recua, mantém e circula.
function keepAway(e, dt, tp, minD, maxD, speed) {
  const G = e.G;
  let vx = 0,
    vz = 0;
  if (tp.d < minD) {
    // recua, de preferência para onde dá
    const ax = -tp.dx / (tp.d || 1),
      az = -tp.dz / (tp.d || 1);
    const tx = e.pos.x + ax * 2,
      tz = e.pos.z + az * 2;
    if (!G.nav.isBlocked(tx, tz)) {
      vx = ax * speed;
      vz = az * speed;
    } else {
      vx = -az * speed * e.flankSign;
      vz = ax * speed * e.flankSign;
    }
  } else if (tp.d > maxD || !G.col.clear(e.pos.x, 1.5, e.pos.z, G.player.pos.x, 1.2, G.player.pos.z, 'bullet')) {
    e.pathDir(_dir);
    vx = _dir.x * speed;
    vz = _dir.z * speed;
  } else {
    // circula devagar
    vx = (-tp.dz / (tp.d || 1)) * speed * 0.35 * e.flankSign;
    vz = (tp.dx / (tp.d || 1)) * speed * 0.35 * e.flankSign;
  }
  const sp = Math.hypot(vx, vz);
  e.yaw = dampAngle(e.yaw, tp.yaw, 6, dt);
  if (sp > 0.05) {
    e.phase += dt * sp * 4.4;
    // anda de costas: inverte a fase das pernas quando recua
    const back = vx * Math.sin(e.yaw) + vz * Math.cos(e.yaw) < 0;
    e.rig.gait(back ? -e.phase : e.phase, clamp(sp / 1.4, 0, 1), sp > 2.2 ? 0.5 : 0);
  }
  return [vx, vz];
}

// ======================================================================= 1. CORREDOR
export class Runner extends Villager {
  constructor(G, x, z, o = {}) {
    const look = randomLook(o.female ?? chance(0.3));
    look.build = 'thin';
    look.eyes = 0xffb21e;
    look.hat = null;
    look.shards = 1;
    look.sleeves = 'short';
    look.longSleeves = false;
    super(G, x, z, { ...o, look, weapon: 'none' });
    this.kind = 'runner';
    const D = G.diff;
    this.maxHp = this.hp = 68 * D.hp;
    this.walk = 2.6 * D.speed;
    this.run = rand(4.7, 5.3) * D.speed;
    this.runner = true;
    this.thrower = false;
    this.w = { dmg: 11, range: 1.4, windup: 0.3, recover: 0.42 };
    this.pitch *= 1.18;
  }
}

// ======================================================================= 2. BRUTAMONTES
export class Brute extends Enemy {
  constructor(G, x, z, o = {}) {
    super(G, x, z, o);
    this.kind = 'brute';
    const R = (this.rig = new Humanoid({ scale: 1.45, build: 'heavy', armScale: 1.55, skin: 0x8a6a5a, infected: true, eyes: 0xff5a14, shirt: 0x3a3a34, pants: 0x2a2622, sleeves: 'short', hairStyle: 'bald', shards: 5 }));
    const j = R.j;
    const metal = charMat(0x5a3020, 'metal');
    const P = R.part.bind(R);
    for (let i = 0; i < 6; i++) P(j.spine, CONE(0.05, 0.24, 4), metal, -0.15 + (i % 3) * 0.15, 0.3 + Math.floor(i / 3) * 0.2, -0.16, -1.2, 0, 0);
    P(j.lSh, BOX(0.18, 0.1, 0.2), metal, 0.03, 0.03, 0, 0, 0, 0.4);
    P(j.rSh, BOX(0.18, 0.1, 0.2), metal, -0.03, 0.03, 0, 0, 0, -0.4);
    // tumor brilhante nas costas (ponto fraco)
    this.tumor = P(j.spine, SPH(12, 10), charMat(0xff7a22, 'glow'), 0.04, 0.35, -0.17, 0, 0, 0, 0.12, 0.13, 0.09);
    this.tumor.castShadow = false;
    R.hitDefs.unshift({ part: 'tumor', a: j.spine, ao: V(0.04, 0.35, -0.2), r: 0.13, priority: 0.25 });
    this.light = G.fx.lights.add({ x, y: 2, z, color: 0xff6a1a, intensity: 8, range: 5, flicker: 0.25, priority: 10 });
    const D = G.diff;
    this.maxHp = this.hp = 700 * D.hp;
    this.radius = 0.62;
    this.height = 2.6;
    this.boundR = 3.2;
    this.mass = 6;
    this.cd = 1.5;
    this.poise = 0;
    this.stepAcc = 0;
    this.pitch = 0.8;
    this.idleMode = o.idle || 'idle';
    G.scene.add(R.root);
    if (this.idleMode === 'hunt') {
      this.alert = true;
      this.setState('chase');
    } else this.setState('idle');
    R.resetPose();
    R.snap();
    this.syncRig();
  }

  get kickable() {
    return this.alive && (this.state === 'stunned' || this.state === 'stagger') && this.st > 0.3;
  }

  becomeAlert() {
    if (this.alert || !this.alive) return;
    this.alert = true;
    if (this.state === 'idle') this.setState('roar');
    this.mgr.propagate(this);
  }

  steps(dt, sp) {
    this.stepAcc += dt * sp;
    if (this.stepAcc > 1.3) {
      this.stepAcc = 0;
      const G = this.G;
      G.audio.heavyStep(this.pos, 0.7);
      const d = Math.hypot(G.player.pos.x - this.pos.x, G.player.pos.z - this.pos.z);
      G.fx.shake(clamp(0.12 - d * 0.006, 0, 0.12));
    }
  }

  update(dt) {
    const G = this.G,
      P = G.player,
      R = this.rig;
    this.st += dt;
    const tp = this.toPlayer(_tp);
    R.resetPose();
    let vx = 0,
      vz = 0,
      rate = 9;
    this.poise = Math.max(0, this.poise - dt * 40);
    switch (this.state) {
      case 'idle':
        R.set('spine', 0.3 + Math.sin(G.time * 0.8 + this.id) * 0.05, 0, 0);
        R.set('neck', 0.2, Math.sin(G.time * 0.4) * 0.4, 0);
        R.set('lSh', -0.2, 0, 0.2);
        R.set('rSh', -0.2, 0, -0.2);
        perceive(this, dt, tp, 26);
        break;
      case 'roar':
        this.yaw = dampAngle(this.yaw, tp.yaw, 5, dt);
        R.set('spine', -0.4, 0, 0);
        R.set('neck', -0.6);
        R.set('lSh', -0.5, 0, 1.2);
        R.set('rSh', -0.5, 0, -1.2);
        R.set('lEl', -1.0);
        R.set('rEl', -1.0);
        if (!this.roared && this.st > 0.3) {
          this.roared = true;
          G.audio.voice(this.pos, 'roar', this.pitch);
          G.fx.shake(0.35);
        }
        if (this.st > 1.6) this.setState('chase');
        break;
      case 'chase': {
        if (P.dead || G.state !== 'play') break;
        this.cd -= dt;
        const d = this.pathDir(_dir);
        const facing = Math.abs(angleDiff(this.yaw, tp.yaw));
        if (this.cd <= 0) {
          if (d < 3.2 && facing < 0.8) {
            this.setState('slamWind');
            break;
          }
          if (d > 6 && d < 16 && facing < 0.5 && G.nav.lineClear(this.pos.x, this.pos.z, P.pos.x, P.pos.z)) {
            this.setState('chargeWind');
            break;
          }
          this.cd = 0.3;
        }
        const sp = (d > 2.4 ? 1.55 : 0) * G.diff.speed * this.buff;
        vx = _dir.x * sp;
        vz = _dir.z * sp;
        this.yaw = dampAngle(this.yaw, d < 4 ? tp.yaw : Math.atan2(_dir.x, _dir.z), 4, dt);
        this.phase += dt * sp * 2.8;
        R.gait(this.phase, Math.min(1, sp / 1.4), 0);
        R.add('spine', 0.25);
        R.add('lSh', -0.3, 0, 0.3);
        R.add('rSh', -0.3, 0, -0.3);
        this.steps(dt, sp);
        if (Math.random() < dt * 0.15) G.audio.voice(this.pos, 'groan', this.pitch * 0.8);
        break;
      }
      case 'slamWind': {
        this.yaw = dampAngle(this.yaw, tp.yaw, 3, dt);
        const k = Math.min(1, this.st / 0.75);
        R.set('rSh', -2.9 * k, 0, 0.3 * k);
        R.set('lSh', -2.9 * k, 0, -0.3 * k);
        R.set('spine', -0.3 * k, 0, 0);
        if (this.st > 0.85) {
          this.setState('slam');
          const ix = this.pos.x + Math.sin(this.yaw) * 1.8,
            iz = this.pos.z + Math.cos(this.yaw) * 1.8;
          G.audio.slam({ x: ix, z: iz }, 1);
          G.fx.dust({ x: ix, y: 0.1, z: iz }, { x: 0, y: 1, z: 0 }, 18, [0.3, 0.26, 0.22]);
          const dd = Math.hypot(P.pos.x - ix, P.pos.z - iz);
          G.fx.shake(clamp(0.7 - dd * 0.05, 0.1, 0.7));
          if (!P.dead && dd < 2.6) P.takeDamage(30, { x: ix, z: iz }, { knockdown: true });
          G.level.meleeAt(ix, iz, 1.5);
        }
        break;
      }
      case 'slam':
        R.set('rSh', -0.6, 0, 0.2);
        R.set('lSh', -0.6, 0, -0.2);
        R.set('spine', 0.7, 0, 0);
        rate = 20;
        if (this.st > 1.0) {
          this.setState('chase');
          this.cd = 0.8;
        }
        break;
      case 'chargeWind':
        this.yaw = dampAngle(this.yaw, tp.yaw, 6, dt);
        R.set('spine', 0.6, 0, 0);
        R.set('neck', -0.5);
        R.set('lSh', 0.4, 0, 0.4);
        R.set('rSh', 0.4, 0, -0.4);
        if (this.st < 0.05) G.audio.voice(this.pos, 'roar', this.pitch * 1.2);
        if (this.st > 0.7) {
          this.chX = Math.sin(this.yaw);
          this.chZ = Math.cos(this.yaw);
          this.hitDone = false;
          this.setState('charge');
        }
        break;
      case 'charge': {
        const sp = 7.2 * G.diff.speed;
        vx = this.chX * sp;
        vz = this.chZ * sp;
        this.phase += dt * sp * 2.2;
        R.gait(this.phase, 1, 1);
        R.add('spine', 0.45);
        this.steps(dt, sp);
        if (!this.hitDone && !P.dead && tp.d < 1.7) {
          this.hitDone = true;
          P.takeDamage(32, this.pos, { knockdown: true });
        }
        if (this.st > 1.9) {
          this.setState('chase');
          this.cd = 1.2;
        }
        break;
      }
      case 'stunned':
      case 'stagger':
        R.hipsY = -0.4;
        R.set('lHip', -1.4);
        R.set('lKnee', 1.5);
        R.set('rHip', 0.05);
        R.set('rKnee', 1.6);
        R.set('spine', 0.65 + Math.sin(this.st * 4) * 0.05, 0, 0);
        R.set('neck', 0.4);
        R.set('lSh', -0.4);
        R.set('rSh', -0.4);
        if (this.st > (this.state === 'stunned' ? 2.8 : 2.2)) {
          this.setState('chase');
          this.cd = 0.6;
        }
        break;
      case 'dead':
      case 'dissolve':
        R.bodyTilt = 1.45;
        R.bodyLift = 0.2;
        R.set('lSh', -0.2, 0, 1.2);
        R.set('rSh', -2.4, 0, -0.4);
        rate = 8;
        if (this.state === 'dead' && this.st > 2.6) this.setState('dissolve');
        if (this.state === 'dissolve') dissolve(this, dt, 2.0, 0.8);
        break;
    }
    if (this.removed) return;
    const px = this.pos.x,
      pz = this.pos.z;
    finish(this, dt, vx, vz, rate);
    if (this.state === 'charge' && this.st > 0.15) {
      const moved = (this.pos.x - px) * this.chX + (this.pos.z - pz) * this.chZ;
      if (moved < 7.2 * dt * 0.3) {
        this.setState('stunned');
        G.audio.slam(this.pos, 1);
        G.fx.shake(0.4);
        G.fx.dust({ x: this.pos.x + this.chX, y: 1.4, z: this.pos.z + this.chZ }, { x: -this.chX, y: 0.5, z: -this.chZ }, 14);
      }
    }
    this.tumor.getWorldPosition(_v);
    this.light.x = _v.x;
    this.light.y = _v.y;
    this.light.z = _v.z;
    const pulse = 0.8 + Math.sin(G.time * 6 + this.id) * 0.2;
    this.light.intensity = this.alive ? 8 * pulse : 0;
    this.tumor.scale.set(0.12 * pulse, 0.13 * pulse, 0.09);
  }

  onHit(h) {
    if (!this.alive) return;
    const G = this.G;
    const exposed = this.state === 'stunned' || this.state === 'stagger';
    let mult = h.part === 'tumor' ? 3 : h.part === 'head' ? 1.2 : h.part === 'body' ? 0.5 : 0.4;
    if (exposed) mult *= 1.4;
    if (h.weapon === 'knife') mult *= 0.7;
    const dmg = h.dmg * mult;
    this.hp -= dmg;
    this.poise += h.part === 'tumor' ? dmg : dmg * 0.3;
    if (!this.alert) this.becomeAlert();
    if (h.part === 'tumor') {
      this.tumor.getWorldPosition(_v);
      G.fx.sparks(_v, { x: 0, y: 1, z: 0 }, 8, [1, 0.5, 0.15]);
    }
    if (this.hp <= 0) return this.die(h);
    if (this.poise > 240 && !exposed && this.state !== 'charge') {
      this.poise = 0;
      this.setState('stagger');
      G.audio.voice(this.pos, 'bossPain', 1.3);
    }
  }

  onKick(dmg) {
    if (!this.alive) return;
    this.hp -= dmg * 1.5;
    this.G.fx.shake(0.25);
    if (this.hp <= 0) this.die({ part: 'body' });
  }

  onExplosion(dmg) {
    if (!this.alive) return;
    this.hp -= dmg * 0.8;
    if (!this.alert) this.becomeAlert();
    if (this.hp <= 0) return this.die({ part: 'body' });
    if (this.state !== 'stunned') this.setState('stagger');
  }

  die(h) {
    if (!this.alive) return;
    const G = this.G;
    this.alive = false;
    this.hittable = false;
    this.releaseSlot();
    this.setState('dead');
    G.audio.voice(this.pos, 'bossDeath', 1.5);
    G.fx.shake(0.3);
    G.stats.kills++;
    if (h && h.part === 'head') G.stats.heads++;
    G.level.enemyDrop(this.pos.x, this.pos.z, 'brute');
    this.mgr.onDeath(this);
  }

  remove() {
    if (this.removed) return;
    super.remove();
    this.G.fx.lights.remove(this.light);
  }
}

// ======================================================================= 3. CUSPIDOR
export class Spitter extends Villager {
  constructor(G, x, z, o = {}) {
    const look = randomLook(false);
    look.build = 'thin';
    look.skin = 0x8a9a6a;
    look.eyes = 0xc8ff3a;
    look.hat = null;
    look.shards = 0;
    super(G, x, z, { ...o, look, weapon: 'none' });
    this.kind = 'spitter';
    const R = this.rig,
      j = R.j;
    this.sac = R.part(j.neck, SPH(12, 10), charMat(0x9adf3a, 'glow'), 0, -0.02, 0.07, 0, 0, 0, 0.13, 0.11, 0.12);
    this.sac.castShadow = false;
    R.part(j.neck, SPH(10, 8), charMat(0x5a6a3a, 'rustskin'), 0, 0.0, 0.0, 0, 0, 0, 0.14, 0.12, 0.13);
    R.hitDefs.unshift({ part: 'sac', a: j.neck, ao: V(0, -0.02, 0.1), r: 0.12, priority: 0.12 });
    const D = G.diff;
    this.maxHp = this.hp = 90 * D.hp;
    this.walk = 1.5 * D.speed;
    this.thrower = false;
    this.spitCd = rand(1, 2.5);
    this.flankSign = chance(0.5) ? 1 : -1;
    this.light = G.fx.lights.add({ x, y: 1.6, z, color: 0x8adf2a, intensity: 4, range: 4, flicker: 0.15, priority: 5 });
  }

  update(dt) {
    const G = this.G,
      P = G.player,
      R = this.rig;
    if (this.alive && (this.state === 'chase' || this.state === 'spitWind' || this.state === 'spit')) {
      this.st += dt;
      const tp = this.toPlayer(_tp);
      R.resetPose();
      let vx = 0,
        vz = 0,
        rate = 10;
      if (this.state === 'chase') {
        if (P.dead || G.state !== 'play') {
          this.idleAnim(dt);
        } else if (tp.d < 1.7 && this.mgr.slots < this.mgr.maxSlots && Math.abs(angleDiff(this.yaw, tp.yaw)) < 0.8) {
          this.takeSlot();
          this.setState('windup');
          this.struck = false;
        } else {
          this.spitCd -= dt;
          const clear = tp.d < 17 && G.col.clear(this.pos.x, 1.6, this.pos.z, P.pos.x, 1.2, P.pos.z, 'bullet');
          if (this.spitCd <= 0 && clear && tp.d > 3) {
            this.setState('spitWind');
            G.audio.voice(this.pos, 'gurgle', 1.2);
          } else [vx, vz] = keepAway(this, dt, tp, 6.5, 13, 1.8 * this.buff);
          if (Math.random() < dt * 0.2) G.audio.voice(this.pos, 'gurgle', 1);
        }
      } else if (this.state === 'spitWind') {
        this.yaw = dampAngle(this.yaw, tp.yaw, 8, dt);
        const k = Math.min(1, this.st / 0.6);
        R.set('spine', -0.35 * k, 0, 0);
        R.set('neck', -0.5 * k);
        R.set('lSh', -0.3, 0, 0.5);
        R.set('rSh', -0.3, 0, -0.5);
        if (this.st > 0.7) {
          this.spit(tp);
          this.setState('spit');
        }
      } else {
        R.set('spine', 0.45, 0, 0);
        R.set('neck', 0.3);
        rate = 18;
        if (this.st > 0.5) {
          this.spitCd = rand(2.6, 4.2);
          this.setState('chase');
        }
      }
      if (this.removed) return;
      finish(this, dt, vx, vz, rate);
    } else super.update(dt);
    if (this.removed) return;
    this.sac.getWorldPosition(_v);
    this.light.x = _v.x;
    this.light.y = _v.y;
    this.light.z = _v.z;
    this.light.intensity = this.alive ? 4 + Math.sin(G.time * 5) : 0;
  }

  spit(tp) {
    const G = this.G,
      P = G.player;
    this.sac.getWorldPosition(_v);
    _v.y += 0.1;
    const T = clamp(tp.d / 12, 0.45, 1.1);
    const tx = P.pos.x + P.vel.x * T * 0.8,
      tz = P.pos.z + P.vel.z * T * 0.8;
    _v2.set((tx - _v.x) / T, (1.0 - _v.y) / T + 0.5 * 9.8 * T, (tz - _v.z) / T);
    G.proj.spawnBile(_v, _v2, 10);
    G.audio.voice(this.pos, 'spit', 1);
  }

  onHit(h) {
    if (!this.alive) return;
    if (h.part === 'sac') {
      // bolsa estourada: morre na hora num jato de ácido
      this.popped = true;
      this.hp = 0;
      this.die({ ...h, part: 'head' });
      return;
    }
    super.onHit(h);
  }

  die(h) {
    if (!this.alive) return;
    super.die(h);
    if (this.popped || chance(0.5)) {
      this.G.proj.addFire(this.pos.x, this.pos.z, { kind: 'acid', r: 1.6, t: 5, playerDps: 8 });
      this.G.audio.splat(this.pos);
    }
    this.sac.visible = false;
  }

  remove() {
    if (this.removed) return;
    super.remove();
    this.G.fx.lights.remove(this.light);
  }
}

// ======================================================================= 4. INCHADO
export class Bloater extends Villager {
  constructor(G, x, z, o = {}) {
    const look = randomLook(false);
    look.build = 'heavy';
    look.skin = 0xa8a07a;
    look.eyes = 0xd8ff6a;
    look.hat = null;
    look.shards = 0;
    look.scale = 1.12;
    super(G, x, z, { ...o, look, weapon: 'none' });
    this.kind = 'bloater';
    const R = this.rig,
      j = R.j;
    const flesh = charMat(0xb0a070, 'rustskin');
    this.belly = R.part(j.spine, SPH(14, 10), flesh, 0, 0.22, 0.12, 0, 0, 0, 0.34, 0.36, 0.32);
    const pus = charMat(0xd8ff5a, 'glow');
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const m = R.part(j.spine, SPH(6, 5), pus, Math.cos(a) * 0.28, 0.22 + Math.sin(a * 2) * 0.12, 0.12 + Math.sin(a) * 0.25 + 0.05, 0, 0, 0, 0.045, 0.045, 0.045);
      m.castShadow = false;
    }
    R.hitDefs.unshift({ part: 'body', a: j.spine, ao: V(0, 0.22, 0.14), r: 0.34 });
    const D = G.diff;
    this.maxHp = this.hp = 60 * D.hp;
    this.walk = 0.95 * D.speed;
    this.run = 1.3 * D.speed;
    this.runner = false;
    this.thrower = false;
    this.radius = 0.5;
    this.mass = 2;
    this.fuse = -1;
    this.pitch = 0.75;
  }

  get kickable() {
    return false;
  }

  update(dt) {
    const G = this.G,
      P = G.player;
    if (this.fuse >= 0) {
      this.fuse -= dt;
      this.st += dt;
      const R = this.rig;
      R.resetPose();
      const s = 1 + (1 - Math.max(0, this.fuse) / 1.0) * 0.35;
      this.belly.scale.set(0.34 * s, 0.36 * s, 0.32 * s);
      R.set('spine', -0.3 + Math.sin(this.st * 40) * 0.08, Math.sin(this.st * 30) * 0.1, 0);
      R.set('lSh', -0.4, 0, 0.9);
      R.set('rSh', -0.4, 0, -0.9);
      if (this.fuse <= 0) {
        this.blow();
        return;
      }
      finish(this, dt, 0, 0, 20);
      return;
    }
    super.update(dt);
    if (!this.alive || this.removed) return;
    const tp = this.toPlayer(_tp);
    if (this.alert && !P.dead && G.state === 'play' && tp.d < 1.9 && this.fuse < 0) this.startFuse(0.9);
    if (Math.random() < dt * 0.25) G.audio.voice(this.pos, 'gurgle', this.pitch);
    // ataques corpo a corpo viram fusível
    if (this.state === 'windup') {
      this.releaseSlot();
      this.startFuse(0.9);
    }
  }

  startFuse(t) {
    if (this.fuse >= 0 || this.exploded) return;
    this.fuse = t;
    this.st = 0;
    this.G.audio.voice(this.pos, 'gurgle', 1.4);
    this.G.audio.fuse(this.pos);
  }

  blow() {
    if (this.exploded) return;
    const G = this.G;
    this.exploded = true;
    const wasAlive = this.alive;
    this.alive = false;
    this.hittable = false;
    this.releaseSlot();
    explode(G, this.pos.x, 0.9, this.pos.z, 4.5, 150, 40);
    G.proj.addFire(this.pos.x, this.pos.z, { kind: 'acid', r: 2.2, t: 6, playerDps: 10 });
    for (let i = 0; i < 30; i++) G.fx.norm.spawn(this.pos.x, 1.0, this.pos.z, rand(-5, 5), rand(1, 6), rand(-5, 5), rand(0.5, 1), 0.09, 0.04, 0.55, 0.7, 0.2, 0.95, 9.8, 0.4, true);
    if (wasAlive) {
      G.stats.kills++;
      this.mgr.onDeath(this);
    }
    this.remove();
  }

  onHit(h) {
    if (!this.alive) return;
    super.onHit(h);
  }

  onKick(dmg, dir) {
    if (!this.alive) return;
    this.knock.set(dir.x * 4, 0, dir.z * 4);
    this.startFuse(0.5);
  }

  onExplosion() {
    if (!this.alive || this.exploded) return;
    this.startFuse(0.12);
  }

  die(h) {
    if (!this.alive || this.exploded) return;
    // morre explodindo (logo depois do tiro: dá para usar em cadeia)
    this.alive = false;
    this.hittable = false;
    this.G.stats.kills++;
    if (h && h.part === 'head') this.G.stats.heads++;
    this.mgr.onDeath(this);
    this.fuse = 0.15;
    this.st = 0;
  }
}

// ======================================================================= 5. GRITADOR
export class Screamer extends Villager {
  constructor(G, x, z, o = {}) {
    const look = randomLook(o.female ?? chance(0.5));
    look.build = 'thin';
    look.skin = 0xc8b8b0;
    look.eyes = 0xff3a2a;
    look.armScale = 1.25;
    look.scale = 1.08;
    look.hat = null;
    look.hairStyle = 'long';
    look.hair = 0x2a2420;
    super(G, x, z, { ...o, look, weapon: 'none' });
    this.kind = 'screamer';
    const R = this.rig;
    R.part(R.j.head, BOX(0.07, 0.06, 0.02), charMat(0x0a0404), 0, 0.03, 0.11);
    const D = G.diff;
    this.maxHp = this.hp = 80 * D.hp;
    this.walk = 1.9 * D.speed;
    this.thrower = false;
    this.screamCd = rand(1.5, 3);
    this.screams = 0;
    this.flankSign = chance(0.5) ? 1 : -1;
    this.pitch = 1.3;
  }

  update(dt) {
    const G = this.G,
      P = G.player,
      R = this.rig;
    if (!this.alive || !(this.state === 'chase' || this.state === 'scream')) return super.update(dt);
    this.st += dt;
    const tp = this.toPlayer(_tp);
    R.resetPose();
    let vx = 0,
      vz = 0;
    if (this.state === 'chase') {
      if (P.dead || G.state !== 'play') this.idleAnim(dt);
      else if (tp.d < 1.6 && this.mgr.slots < this.mgr.maxSlots && Math.abs(angleDiff(this.yaw, tp.yaw)) < 0.8) {
        this.takeSlot();
        this.setState('windup');
        this.struck = false;
      } else {
        this.screamCd -= dt;
        if (this.screamCd <= 0 && tp.d < 30 && G.col.clear(this.pos.x, 1.6, this.pos.z, P.pos.x, 1.3, P.pos.z, 'bullet')) this.setState('scream');
        else [vx, vz] = keepAway(this, dt, tp, 8, 15, 2.0 * this.buff);
      }
    } else {
      this.yaw = dampAngle(this.yaw, tp.yaw, 6, dt);
      R.set('spine', -0.45, 0, 0);
      R.set('neck', -0.7 + Math.sin(this.st * 30) * 0.05, 0, Math.sin(this.st * 25) * 0.08);
      R.set('lSh', -0.6, 0, 1.3);
      R.set('rSh', -0.6, 0, -1.3);
      R.set('lEl', -0.5);
      R.set('rEl', -0.5);
      if (!this.screamed && this.st > 0.25) {
        this.screamed = true;
        this.doScream();
      }
      if (this.st > 1.9) {
        this.screamed = false;
        this.screamCd = rand(8, 11);
        this.setState('chase');
      }
    }
    if (this.removed) return;
    finish(this, dt, vx, vz, 12);
  }

  doScream() {
    const G = this.G,
      P = G.player;
    G.audio.voice(this.pos, 'scream', rand(0.95, 1.1));
    const d = Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z);
    G.fx.shake(clamp(0.5 - d * 0.02, 0.08, 0.5));
    G.ui.screamFx();
    for (const e of this.mgr.list) {
      if (e === this || !e.alive || e.isBoss) continue;
      const ed = Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z);
      if (ed < 40 && !e.alert && e.becomeAlert) e.becomeAlert(false);
      if (ed < 22) e.buffT = 7;
    }
    // chama Corredores de fora da vista do jogador
    if (this.screams < 3 && this.mgr.aliveCount() < 16) {
      this.screams++;
      let n = 0;
      for (let i = 0; i < 12 && n < 2; i++) {
        const a = rand(0, Math.PI * 2),
          r = rand(14, 22);
        const x = P.pos.x + Math.cos(a) * r,
          z = P.pos.z + Math.sin(a) * r;
        if (G.nav.isBlocked(x, z) || G.nav.isBlocked(x + 1.5, z) || G.nav.isBlocked(x - 1.5, z)) continue;
        if (G.col.clear(P.pos.x, 1.5, P.pos.z, x, 1.5, z, 'bullet') && r < 18) continue;
        if (G.nav.pathDist(x, z) > 60) continue;
        G.enemies.spawn('runner', x, z, { idle: 'hunt' });
        n++;
      }
    }
  }
}

// ======================================================================= 6. BLINDADO
export class Shielded extends Villager {
  constructor(G, x, z, o = {}) {
    const look = { scale: rand(0.98, 1.06), build: 'heavy', skin: 0xa88e7c, infected: true, eyes: 0xff7a1e, shirt: 0x1e2838, pants: 0x1a2030, shoes: 0x0e0e10, hat: 'cap', hatColor: 0x14181e, hairStyle: 'short', hair: 0x1a1512, longSleeves: true, shards: 2 };
    super(G, x, z, { ...o, look, weapon: 'none' });
    this.kind = 'shield';
    const R = this.rig,
      j = R.j;
    // capacete com viseira
    R.part(j.head, SPH(10, 6, 0.6), charMat(0x101418, 'metal'), 0, 0.12, -0.01, 0, 0, 0, 0.135, 0.15, 0.14);
    R.part(j.head, BOX(0.24, 0.1, 0.02), charMat(0x2a3a44, 'metal'), 0, 0.12, 0.13);
    // escudo de choque preso ao tronco
    this.shield = new THREE.Group();
    const sm = new THREE.MeshStandardMaterial({ color: 0x2a3440, roughness: 0.35, metalness: 0.4, transparent: true, opacity: 0.88 });
    const plate = new THREE.Mesh(BOX(0.62, 1.12, 0.04), sm);
    plate.castShadow = true;
    this.shield.add(plate);
    const band = new THREE.Mesh(BOX(0.62, 0.12, 0.045), charMat(0xd8d2c4));
    band.position.y = 0.28;
    this.shield.add(band);
    this.shield.position.set(0.06, 0.18, 0.4);
    j.spine.add(this.shield);
    this.shieldDef = { part: 'shield', a: j.spine, ao: V(0.06, -0.22, 0.42), b: j.spine, bo: V(0.06, 0.62, 0.42), r: 0.3 };
    this.baseDefs = R.hitDefs.slice();
    this.shieldUp = true;
    R.hitDefs = [this.shieldDef, ...this.baseDefs];
    const D = G.diff;
    this.maxHp = this.hp = 160 * D.hp;
    this.walk = 1.3 * D.speed;
    this.run = 2.0 * D.speed;
    this.runner = false;
    this.thrower = false;
    this.w = { dmg: 16, range: 1.6, windup: 0.5, recover: 0.7 };
  }

  setShield(up) {
    if (up === this.shieldUp) return;
    this.shieldUp = up;
    this.rig.hitDefs = up ? [this.shieldDef, ...this.baseDefs] : this.baseDefs.slice();
  }

  shieldBlocks(part) {
    return part === 'shield';
  }

  update(dt) {
    super.update(dt);
    if (this.removed) return;
    const down = ['kneel', 'down', 'getup', 'stagger', 'dead', 'dissolve'].includes(this.state);
    this.setShield(!down && this.alive);
    this.shield.rotation.x = down ? -1.1 : 0;
    this.shield.position.y = down ? -0.15 : 0.18;
    // o escudo fica sempre na frente: braços segurando
    if (!down && this.alive && this.state !== 'strike' && this.state !== 'windup') {
      const R = this.rig;
      R.j.lSh.rotation.x = -1.2;
      R.j.lEl.rotation.x = -0.9;
    }
  }

  onHit(h) {
    if (!this.alive) return;
    if (h.part === 'shield') {
      const G = this.G;
      this.shield.getWorldPosition(_v);
      G.fx.sparks(_v, { x: -(h.dir ? h.dir.x : 0), y: 0.3, z: -(h.dir ? h.dir.z : 0) }, 6);
      G.audio.hit('metal', this.pos);
      if (h.dir) {
        this.knock.x += h.dir.x * 0.5;
        this.knock.z += h.dir.z * 0.5;
      }
      if (!this.alert) this.becomeAlert(false);
      return;
    }
    super.onHit(h);
  }
}

// ======================================================================= 7. INCENDIÁRIO
export class Burner extends Villager {
  constructor(G, x, z, o = {}) {
    const look = { scale: rand(0.98, 1.08), build: 'normal', skin: 0x3a2a24, infected: true, eyes: 0xffd040, shirt: 0x5a4020, pants: 0x3a3028, hat: 'cap', hatColor: 0xc8a018, hairStyle: 'bald', sleeves: 'short', shards: 3 };
    super(G, x, z, { ...o, look, weapon: 'none' });
    this.kind = 'burner';
    const R = this.rig,
      j = R.j;
    const glow = charMat(0xff6a14, 'glow');
    R.part(j.spine, BOX(0.3, 0.05, 0.22), glow, 0, 0.3, 0.02, 0, 0, 0.3).castShadow = false;
    R.part(j.spine, BOX(0.05, 0.3, 0.22), glow, 0.06, 0.2, 0.02, 0, 0, -0.2).castShadow = false;
    R.part(j.lEl, BOX(0.03, 0.2, 0.09), glow, 0, -0.12, 0).castShadow = false;
    R.part(j.rEl, BOX(0.03, 0.2, 0.09), glow, 0, -0.12, 0).castShadow = false;
    const D = G.diff;
    this.maxHp = this.hp = 110 * D.hp;
    this.walk = 1.5 * D.speed;
    this.run = 2.8 * D.speed;
    this.runner = true;
    this.thrower = false;
    this.fireMult = 0;
    this.trailT = 1;
    this.w = { dmg: 14, range: 1.5, windup: 0.5, recover: 0.6 };
    this.light = G.fx.lights.add({ x, y: 1.3, z, color: 0xff7a2a, intensity: 10, range: 6, flicker: 0.35, priority: 12 });
  }

  update(dt) {
    const G = this.G,
      P = G.player;
    const wasStrike = this.state === 'strike' && !this.struck;
    super.update(dt);
    if (this.removed) return;
    if (this.alive) {
      if (Math.random() < 0.9) G.fx.fire({ x: this.pos.x + rand(-0.2, 0.2), y: rand(0.6, 1.6), z: this.pos.z + rand(-0.2, 0.2) }, 1, 0.5);
      if (this.alert && Math.hypot(this.vel.x, this.vel.z) > 0.5) {
        this.trailT -= dt;
        if (this.trailT <= 0) {
          this.trailT = 0.9;
          G.proj.fireAt(this.pos.x, this.pos.z, 0.8, 3.2, false);
        }
      }
      // golpe que incendeia
      if (wasStrike && this.struck && Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z) < this.w.range + 0.5) P.ignite(3);
    }
    this.light.x = this.pos.x;
    this.light.z = this.pos.z;
    this.light.intensity = this.alive ? 10 : Math.max(0, this.light.intensity - dt * 10);
  }

  die(h) {
    if (!this.alive) return;
    super.die(h);
    this.G.proj.fireAt(this.pos.x, this.pos.z, 2.2, 4.5, true);
    this.G.audio.ignite(this.pos);
  }

  remove() {
    if (this.removed) return;
    super.remove();
    this.G.fx.lights.remove(this.light);
  }
}

// ======================================================================= 8. ARRASTADO
export class Dragger extends Enemy {
  constructor(G, x, z, o = {}) {
    super(G, x, z, o);
    this.kind = 'dragger';
    const look = randomLook(chance(0.3));
    look.shards = 2;
    const R = (this.rig = new Humanoid(look));
    R.j.lHip.visible = false;
    R.j.rHip.visible = false;
    R.hitDefs = R.hitDefs.filter((h) => h.part !== 'leg');
    const D = G.diff;
    this.maxHp = this.hp = 55 * D.hp;
    this.speed = rand(1.2, 1.5) * D.speed;
    this.radius = 0.4;
    this.height = 0.6;
    this.boundR = 1.4;
    this.pitch = rand(0.8, 1.0);
    this.idleMode = o.idle || 'dormant';
    this.biteT = 0;
    G.scene.add(R.root);
    if (this.idleMode === 'hunt') {
      this.alert = true;
      this.setState('chase');
    } else this.setState('idle');
    this.pose(0);
    R.snap();
    this.syncRig();
  }

  get kickable() {
    return this.alive && this.state === 'shoved';
  }

  becomeAlert() {
    if (this.alert || !this.alive) return;
    this.alert = true;
    if (this.state === 'idle') this.setState('chase');
    this.mgr.propagate(this);
  }

  pose(t) {
    const R = this.rig;
    R.resetPose();
    R.bodyTilt = 1.45;
    R.bodyLift = 0.16;
    R.hipsY = -0.05;
    const k = Math.sin(t);
    R.set('lSh', -2.6 + k * 0.6, 0, -0.25);
    R.set('rSh', -2.6 - k * 0.6, 0, 0.25);
    R.set('lEl', -0.3 - Math.max(0, -k) * 0.8);
    R.set('rEl', -0.3 - Math.max(0, k) * 0.8);
    R.set('neck', -0.9, 0, 0);
    R.set('spine', -0.1, k * 0.08, 0);
  }

  update(dt) {
    const G = this.G,
      P = G.player,
      R = this.rig;
    this.st += dt;
    const tp = this.toPlayer(_tp);
    let vx = 0,
      vz = 0,
      rate = 8;
    switch (this.state) {
      case 'idle': {
        this.pose(0);
        R.set('lSh', -2.2, 0, -0.6);
        R.set('rSh', -1.0, 0, 0.9);
        R.set('neck', -0.2, 0.6, 0);
        if (this.alertDelay > 0) {
          this.alertDelay -= dt;
          if (this.alertDelay <= 0) this.becomeAlert();
        }
        // finge de morto: agarra quem passa por perto
        if (!P.dead && G.state === 'play' && tp.d < 1.6) {
          this.alert = true;
          this.tryGrab(tp);
        } else if (this.idleMode !== 'dormant' && tp.d < 7) this.becomeAlert();
        break;
      }
      case 'chase': {
        if (P.dead || G.state !== 'play') {
          this.pose(0);
          break;
        }
        const d = this.pathDir(_dir);
        const sp = this.speed * this.buff;
        this.phase += dt * sp * 3.2;
        this.pose(this.phase);
        vx = _dir.x * sp * (0.6 + Math.max(0, Math.sin(this.phase)) * 0.8);
        vz = _dir.z * sp * (0.6 + Math.max(0, Math.sin(this.phase)) * 0.8);
        this.yaw = dampAngle(this.yaw, Math.atan2(_dir.x, _dir.z), 5, dt);
        if (d < 1.3) this.tryGrab(tp);
        if (Math.random() < dt * 0.25) G.audio.voice(this.pos, 'groan', this.pitch);
        break;
      }
      case 'grabbing': {
        this.pose(0);
        R.set('lSh', -2.9, 0, -0.1);
        R.set('rSh', -2.9, 0, 0.1);
        R.set('lEl', -0.2);
        R.set('rEl', -0.2);
        R.set('neck', -1.1);
        this.yaw = dampAngle(this.yaw, tp.yaw, 10, dt);
        // fica colado no pé do jogador
        const tx = P.pos.x - Math.sin(tp.yaw) * 0.9,
          tz = P.pos.z - Math.cos(tp.yaw) * 0.9;
        this.pos.x += (tx - this.pos.x) * Math.min(1, dt * 8);
        this.pos.z += (tz - this.pos.z) * Math.min(1, dt * 8);
        this.biteT -= dt;
        if (this.biteT <= 0) {
          this.biteT = 0.6;
          if (P.grabbed) {
            P.hp = Math.max(1, P.hp - 6 * G.diff.dmg);
            G.stats.damage += 6 * G.diff.dmg;
            G.ui.damage(6);
            G.audio.hit('flesh', P.pos);
            P.rig.j.lAnkle.getWorldPosition(_v);
            G.fx.blood(_v, { x: 0, y: 1, z: 0 }, 4);
          }
        }
        if (!P.grabbed || P.action.by !== this) this.release(false);
        break;
      }
      case 'shoved':
        this.pose(0);
        R.bodyRoll = Math.sin(this.st * 10) * 0.1;
        if (this.st > 1.6) this.setState('chase');
        break;
      case 'flinch':
        this.pose(0);
        R.set('neck', -0.3);
        rate = 20;
        if (this.st > 0.25) this.setState('chase');
        break;
      case 'dead':
      case 'dissolve':
        this.pose(0);
        R.set('lSh', -2.0, 0, -0.9);
        R.set('rSh', -0.6, 0, 1.0);
        R.set('neck', 0.2, 0.7, 0);
        if (this.state === 'dead' && this.st > 2.2) this.setState('dissolve');
        if (this.state === 'dissolve') dissolve(this, dt, 1.4, 0.3);
        break;
    }
    if (this.removed) return;
    if (this.state === 'grabbing') {
      R.apply(dt, rate);
      this.syncRig();
    } else finish(this, dt, vx, vz, rate);
  }

  tryGrab(tp) {
    const P = this.G.player;
    if (this.grabCd > this.G.time) return;
    if (P.grab(this)) {
      this.setState('grabbing');
      this.biteT = 0.3;
      this.yaw = tp.yaw;
      this.G.audio.voice(this.pos, 'attack', this.pitch);
      this.G.ui.msg('Um Arrastado agarrou sua perna! Aperte Ação várias vezes.');
    } else this.grabCd = this.G.time + 1.5;
  }

  // O jogador se soltou (chute) ou o agarrão terminou.
  release(kicked) {
    if (this.state !== 'grabbing') return;
    const P = this.G.player;
    this.grabCd = this.G.time + 3;
    if (kicked) {
      const dx = this.pos.x - P.pos.x,
        dz = this.pos.z - P.pos.z;
      const l = Math.hypot(dx, dz) || 1;
      this.knock.set((dx / l) * 5, 0, (dz / l) * 5);
      this.hp -= 20;
      this.G.audio.kick(this.pos);
      if (this.hp <= 0) return this.die({ part: 'body', weapon: 'kick' });
      this.setState('shoved');
    } else this.setState('chase');
  }

  onHit(h) {
    if (!this.alive) return;
    let mult = h.part === 'head' ? 2.2 : h.part === 'arm' ? 0.7 : 1;
    if (this.state === 'shoved') mult *= h.weapon === 'knife' ? 2.5 : 1.3;
    this.hp -= h.dmg * mult;
    if (!this.alert) this.becomeAlert();
    if (this.hp <= 0) return this.die(h);
    if (this.state === 'grabbing' && (h.part === 'head' || h.dmg * mult > 30)) {
      this.release(true);
      return;
    }
    if (this.state === 'chase' || this.state === 'idle') {
      this.setState('flinch');
      if (this.state === 'idle') this.alert = true;
    }
  }

  onKick(dmg, dir) {
    if (!this.alive) return;
    this.hp -= dmg;
    if (this.hp <= 0) return this.die({ part: 'body', dir });
    this.knock.set(dir.x * 5, 0, dir.z * 5);
    this.setState('shoved');
  }

  onExplosion(dmg, dir) {
    if (!this.alive) return;
    this.hp -= dmg;
    if (this.hp <= 0) return this.die({ part: 'body', dir });
    this.becomeAlert();
    this.setState('shoved');
  }

  die(h) {
    if (!this.alive) return;
    const G = this.G;
    if (this.state === 'grabbing') {
      const P = G.player;
      if (P.grabbed && P.action.by === this) P.action = null;
    }
    this.alive = false;
    this.hittable = false;
    this.setState('dead');
    G.audio.voice(this.pos, 'death', this.pitch);
    G.stats.kills++;
    if (h && h.part === 'head') G.stats.heads++;
    G.level.enemyDrop(this.pos.x, this.pos.z, 'dragger');
    this.mgr.onDeath(this);
  }
}

// ======================================================================= 9. CÃO INFECTADO
class DogRig extends RigBase {
  constructor(o = {}) {
    super();
    const s = (this.s = o.scale || 1);
    this.root.scale.setScalar(s);
    this.hipsBaseY = 0;
    this.hipsY = 0;
    const fur = charMat(o.fur ?? 0x3a2e26, 'rustskin');
    const raw = charMat(0x7a3a2a, 'rustskin');
    const metal = charMat(0x5a3018, 'metal');
    const eye = charMat(0xff6a1a, 'glow');
    const P = this.part.bind(this);
    const J = this.joint.bind(this);
    J('torso', this.body, 0, 0.55, 0);
    J('neck', this.j.torso, 0, 0.06, 0.32);
    J('head', this.j.neck, 0, 0.12, 0.12);
    J('tail', this.j.torso, 0, 0.06, -0.36);
    P(this.j.torso, BOX(0.26, 0.26, 0.66), fur, 0, 0, 0);
    P(this.j.torso, BOX(0.2, 0.16, 0.3), raw, 0.06, -0.06, 0.05);
    for (let i = 0; i < 4; i++) P(this.j.torso, CONE(0.03, 0.12, 4), metal, 0, 0.15, 0.2 - i * 0.14, -0.4);
    P(this.j.neck, BOX(0.14, 0.16, 0.22), fur, 0, 0.05, 0.06, -0.5);
    this.headMesh = P(this.j.head, BOX(0.17, 0.15, 0.2), fur, 0, 0, 0.04);
    P(this.j.head, BOX(0.11, 0.08, 0.16), fur, 0, -0.04, 0.18);
    P(this.j.head, BOX(0.1, 0.03, 0.14), raw, 0, -0.085, 0.17);
    for (const x of [-0.06, 0.06]) P(this.j.head, CONE(0.035, 0.09, 4), fur, x, 0.1, -0.02);
    this.eyes = [];
    for (const x of [-0.05, 0.05]) {
      const e = P(this.j.head, BOX(0.03, 0.02, 0.01), eye, x, 0.03, 0.14);
      e.castShadow = false;
      this.eyes.push(e);
    }
    P(this.j.tail, CYL(0.025, 0.012, 0.3), fur, 0, 0, -0.14, -1.0);
    const legs = [
      ['FL', 0.09, 0.24],
      ['FR', -0.09, 0.24],
      ['BL', 0.09, -0.24],
      ['BR', -0.09, -0.24],
    ];
    for (const [n, x, z] of legs) {
      const hip = J('h' + n, this.j.torso, x, -0.08, z);
      const knee = J('k' + n, hip, 0, -0.24, 0);
      P(hip, CYL(0.04, 0.03, 0.26), fur, 0, -0.12, 0);
      P(knee, CYL(0.026, 0.02, 0.26), raw, 0, -0.12, 0);
      P(knee, BOX(0.05, 0.03, 0.08), fur, 0, -0.25, 0.02);
    }
    this.hitDefs = [
      { part: 'head', a: this.j.head, ao: V(0, 0, 0.08), r: 0.13 },
      { part: 'body', a: this.j.torso, ao: V(0, 0, -0.3), b: this.j.torso, bo: V(0, 0, 0.3), r: 0.17 },
      { part: 'leg', a: this.j.hFL, ao: V(), b: this.j.kFL, bo: V(0, -0.24, 0), r: 0.045 },
      { part: 'leg', a: this.j.hFR, ao: V(), b: this.j.kFR, bo: V(0, -0.24, 0), r: 0.045 },
    ];
    this.resetPose();
    this.snap();
    this.optimize();
  }

  // Galope: patas da frente e de trás alternadas, coluna ondulando.
  gait(phase, amt, run = 0) {
    const s = Math.sin(phase),
      c = Math.cos(phase);
    const a = (0.55 + run * 0.35) * amt;
    this.add('hFL', s * a);
    this.add('hFR', s * a * (run > 0.5 ? 1 : -1));
    this.add('hBL', -s * a);
    this.add('hBR', -s * a * (run > 0.5 ? 1 : -1));
    this.add('kFL', Math.max(0, c) * 0.7 * amt);
    this.add('kFR', Math.max(0, -c) * 0.7 * amt);
    this.add('kBL', -Math.max(0, -c) * 0.6 * amt);
    this.add('kBR', -Math.max(0, c) * 0.6 * amt);
    this.add('torso', s * 0.08 * amt * (1 + run));
    this.add('tail', 0, s * 0.4, 0);
    this.bodyLift += Math.abs(c) * 0.04 * amt * (1 + run);
  }
}

export class Dog extends Enemy {
  constructor(G, x, z, o = {}) {
    super(G, x, z, o);
    this.kind = 'dog';
    this.rig = new DogRig({ scale: rand(0.95, 1.15), fur: pick([0x3a2e26, 0x2a2420, 0x5a4a3a, 0x1c1a18]) });
    const D = G.diff;
    this.maxHp = this.hp = 55 * D.hp;
    this.speed = rand(5.6, 6.4) * D.speed;
    const s = this.rig.s;
    this.radius = 0.38 * s;
    this.height = 0.85 * s;
    this.boundR = 1.1 * s;
    this.pitch = rand(0.9, 1.2);
    this.idleMode = o.idle || 'idle';
    this.leapCd = rand(0.4, 1.2);
    this.barkT = rand(1, 3);
    this.flank = rand(-1, 1);
    G.scene.add(this.rig.root);
    if (this.idleMode === 'hunt') {
      this.alert = true;
      this.setState('chase');
    } else this.setState('idle');
    this.rig.resetPose();
    this.rig.snap();
    this.syncRig();
  }

  get kickable() {
    return this.alive && (this.state === 'land' || this.state === 'flipped') && this.st > 0.1;
  }

  becomeAlert() {
    if (this.alert || !this.alive) return;
    this.alert = true;
    this.G.audio.voice(this.pos, 'bark', this.pitch);
    if (this.state === 'idle') this.setState('chase');
    this.mgr.propagate(this);
  }

  update(dt) {
    const G = this.G,
      P = G.player,
      R = this.rig;
    this.st += dt;
    const tp = this.toPlayer(_tp);
    R.resetPose();
    let vx = 0,
      vz = 0,
      rate = 12;
    switch (this.state) {
      case 'idle':
        // comendo / farejando o chão
        R.set('neck', 0.9 + Math.sin(G.time * 6 + this.id) * 0.1);
        R.set('head', 0.3);
        R.set('hFL', -0.2);
        R.set('hFR', -0.2);
        perceive(this, dt, tp, 18, 1.6);
        break;
      case 'chase': {
        if (P.dead || G.state !== 'play') break;
        const d = this.pathDir(_dir);
        const zig = Math.sin(G.time * 2.2 + this.id) * 0.5 * clamp((d - 4) / 6, 0, 1) + this.flank * 0.3 * clamp((d - 3) / 8, 0, 1);
        const c = Math.cos(zig),
          s = Math.sin(zig);
        const mx = _dir.x * c - _dir.z * s,
          mz = _dir.x * s + _dir.z * c;
        let sp = this.speed * this.buff;
        if (d < 2.2 && this.mgr.slots >= this.mgr.maxSlots + 1) sp *= 0.3;
        vx = mx * sp;
        vz = mz * sp;
        this.yaw = dampAngle(this.yaw, d < 3 ? tp.yaw : Math.atan2(mx, mz), 10, dt);
        this.phase += dt * sp * 2.6;
        R.gait(this.phase, 1, 1);
        this.leapCd -= dt;
        if (this.leapCd <= 0 && d < 4.0 && d > 1.2 && Math.abs(angleDiff(this.yaw, tp.yaw)) < 0.5 && G.nav.lineClear(this.pos.x, this.pos.z, P.pos.x, P.pos.z)) {
          this.setState('crouch');
          this.takeSlot();
        }
        this.barkT -= dt;
        if (this.barkT <= 0) {
          this.barkT = rand(1.5, 3.5);
          G.audio.voice(this.pos, 'bark', this.pitch);
        }
        break;
      }
      case 'crouch':
        this.yaw = dampAngle(this.yaw, tp.yaw, 14, dt);
        R.bodyLift = -0.12;
        R.set('hBL', 0.6);
        R.set('hBR', 0.6);
        R.set('kBL', -0.9);
        R.set('kBR', -0.9);
        R.set('neck', -0.3);
        if (this.st > 0.32 / G.diff.speed) {
          this.leapX = Math.sin(this.yaw);
          this.leapZ = Math.cos(this.yaw);
          this.hitDone = false;
          this.setState('leap');
          G.audio.voice(this.pos, 'bark', this.pitch * 1.3);
        }
        break;
      case 'leap': {
        const T = 0.42;
        vx = this.leapX * 8.5;
        vz = this.leapZ * 8.5;
        R.bodyLift = Math.sin(Math.min(1, this.st / T) * Math.PI) * 0.55;
        R.set('hFL', -1.1);
        R.set('hFR', -1.1);
        R.set('hBL', 0.9);
        R.set('hBR', 0.9);
        R.set('neck', -0.4);
        rate = 20;
        if (!this.hitDone && !P.dead && tp.d < 1.2) {
          this.hitDone = true;
          P.takeDamage(14, this.pos, {});
        }
        if (this.st > T) this.setState('land');
        break;
      }
      case 'land':
        R.bodyLift = -0.05;
        R.set('neck', 0.3);
        if (this.st > 0.8) {
          this.leapCd = rand(1.0, 2.0);
          this.setState('chase');
        }
        break;
      case 'flinch':
        R.add('torso', 0, 0, 0);
        R.bodyRoll = this.flinchSide * 0.2;
        rate = 20;
        if (this.st > 0.18) this.setState('chase');
        break;
      case 'flipped':
        R.bodyRoll = Math.PI * 0.5;
        R.bodyLift = -0.25;
        R.gait(G.time * 18, 0.6, 0);
        if (this.st > this.flipT) this.setState('land');
        break;
      case 'dead':
      case 'dissolve':
        R.bodyRoll = Math.PI * 0.5;
        R.bodyLift = -0.28;
        R.set('neck', 0.4);
        R.set('hFL', -0.4);
        R.set('hBL', 0.4);
        if (this.state === 'dead' && this.st > 2.0) this.setState('dissolve');
        if (this.state === 'dissolve') dissolve(this, dt, 1.3, 0.4);
        break;
    }
    if (this.removed) return;
    const blocked = finish(this, dt, vx, vz, rate);
    if (this.state === 'leap' && blocked && this.st > 0.1) this.setState('land');
  }

  onHit(h) {
    if (!this.alive) return;
    let mult = h.part === 'head' ? 2.2 : h.part === 'leg' ? 0.7 : 1;
    if (this.state === 'flipped' || this.state === 'land') mult *= h.weapon === 'knife' ? 2.2 : 1.2;
    this.hp -= h.dmg * mult;
    if (!this.alert) this.becomeAlert();
    if (h.dir) {
      this.knock.x += h.dir.x * 0.7;
      this.knock.z += h.dir.z * 0.7;
    }
    if (this.hp <= 0) return this.die(h);
    if (h.knockdown) return this.flip(h.dir);
    if (this.state === 'chase' || this.state === 'crouch') {
      this.setState('flinch');
      this.flinchSide = chance(0.5) ? 1 : -1;
      if (chance(0.4)) this.G.audio.voice(this.pos, 'bark', this.pitch * 1.5);
    }
  }

  flip(dir) {
    if (dir) this.knock.set(dir.x * 5, 0, dir.z * 5);
    this.releaseSlot();
    this.setState('flipped');
    this.flipT = rand(1.2, 1.8);
  }

  onKick(dmg, dir) {
    if (!this.alive) return;
    this.hp -= dmg;
    if (this.hp <= 0) return this.die({ dir, part: 'body' });
    this.flip(dir);
  }

  onExplosion(dmg, dir) {
    if (!this.alive) return;
    this.hp -= dmg;
    if (this.hp <= 0) return this.die({ dir, part: 'body' });
    this.becomeAlert();
    this.flip(dir);
  }

  die(h) {
    if (!this.alive) return;
    const G = this.G;
    this.alive = false;
    this.hittable = false;
    this.releaseSlot();
    if (h && h.dir) this.knock.set(h.dir.x * 3, 0, h.dir.z * 3);
    this.setState('dead');
    G.audio.voice(this.pos, 'dogDie', this.pitch);
    G.stats.kills++;
    if (h && h.part === 'head') G.stats.heads++;
    G.level.enemyDrop(this.pos.x, this.pos.z, 'dog');
    this.mgr.onDeath(this);
  }
}

// ======================================================================= 10. ESPREITADOR
export class Stalker extends Villager {
  constructor(G, x, z, o = {}) {
    const look = { scale: 1.06, build: 'thin', armScale: 1.3, skin: 0x5a5a62, infected: true, eyes: 0x9ad8ff, shirt: 0x24242a, pants: 0x1c1c22, hairStyle: 'bald', sleeves: 'short', shards: 4 };
    super(G, x, z, { ...o, look, weapon: 'none' });
    this.kind = 'stalker';
    // materiais próprios (transparência por inimigo)
    this.mats = [];
    this.rig.root.traverse((m) => {
      if (!m.isMesh) return;
      m.material = m.material.clone();
      m.material.transparent = true;
      m.material.depthWrite = true;
      this.mats.push(m.material);
    });
    const D = G.diff;
    this.maxHp = this.hp = 120 * D.hp;
    this.walk = 1.7 * D.speed;
    this.run = 3.6 * D.speed;
    this.runner = true;
    this.thrower = false;
    this.w = { dmg: 20, range: 1.6, windup: 0.42, recover: 0.5 };
    this.vis = 0;
    this.revealT = 0;
    this.revealed = false;
    this.whisperT = rand(2, 5);
    this.dashT = 0;
    this.pitch = 0.9;
    this.setOpacity(0.04);
  }

  setOpacity(a) {
    for (const m of this.mats) m.opacity = a;
    const shadow = a > 0.5;
    if (shadow !== this._shadow) {
      this._shadow = shadow;
      this.rig.root.traverse((m) => {
        if (m.isMesh) m.castShadow = shadow;
      });
    }
  }

  update(dt) {
    const G = this.G,
      P = G.player;
    super.update(dt);
    if (this.removed) return;
    if (this.revealT > 0) this.revealT -= dt;
    // aparece na luz da lanterna, de perto, ou logo depois de levar um tiro
    const dx = this.pos.x - P.pos.x,
      dz = this.pos.z - P.pos.z;
    const d = Math.hypot(dx, dz);
    let lit = false;
    if (d < 3.2) lit = true;
    else if (d < 17 && P.flash.intensity > 1) {
      const fd = P.flash.target.position.clone().sub(P.flash.position).normalize();
      const ex = this.pos.x - P.flash.position.x,
        ey = this.pos.y + 1.2 - P.flash.position.y,
        ez = this.pos.z - P.flash.position.z;
      const el = Math.hypot(ex, ey, ez) || 1;
      const cos = (fd.x * ex + fd.y * ey + fd.z * ez) / el;
      if (cos > 0.86 && G.col.clear(P.flash.position.x, P.flash.position.y, P.flash.position.z, this.pos.x, 1.2, this.pos.z, 'bullet')) lit = true;
    }
    if (!this.alive) lit = true;
    this.revealed = lit || this.revealT > 0;
    this.vis += ((this.revealed ? 1 : 0.035) - this.vis) * Math.min(1, dt * (this.revealed ? 6 : 2));
    this.setOpacity(this.vis);
    for (const e of this.rig.eyes) e.visible = this.vis > 0.02 || d < 9;
    if (this.alive && this.alert) {
      this.whisperT -= dt;
      if (this.whisperT <= 0) {
        this.whisperT = rand(3, 6);
        if (d < 20) G.audio.voice(this.pos, 'whisper', rand(0.9, 1.2));
      }
    }
    // desvio lateral rápido depois de levar tiro
    if (this.dashT > 0) {
      this.dashT -= dt;
      this.integrate(dt, this.dashX * 7, this.dashZ * 7);
      this.syncRig();
    }
  }

  onHit(h) {
    if (!this.alive) return;
    this.revealT = 2.2;
    super.onHit(h);
    if (this.alive && chance(0.45) && this.state !== 'down' && this.state !== 'kneel') {
      const s = chance(0.5) ? 1 : -1;
      this.dashX = Math.cos(this.yaw) * s;
      this.dashZ = -Math.sin(this.yaw) * s;
      this.dashT = 0.28;
      this.G.audio.whoosh(0.5);
    }
  }
}

registerKind('runner', Runner, 'r');
registerKind('brute', Brute, 'b');
registerKind('spitter', Spitter, 's');
registerKind('bloater', Bloater, 'i');
registerKind('screamer', Screamer, 'g');
registerKind('shield', Shielded, 'p');
registerKind('burner', Burner, 'f');
registerKind('dragger', Dragger, 'a');
registerKind('dog', Dog, 'd');
registerKind('stalker', Stalker, 'e');

// Nomes para a interface e para o texto da história.
export const INFECTED_NAMES = {
  villager: 'Infectado',
  crawler: 'Rastejante',
  runner: 'Corredor',
  brute: 'Brutamontes',
  spitter: 'Cuspidor',
  bloater: 'Inchado',
  screamer: 'Gritador',
  shield: 'Blindado',
  burner: 'Incendiário',
  dragger: 'Arrastado',
  dog: 'Cão infectado',
  stalker: 'Espreitador',
};

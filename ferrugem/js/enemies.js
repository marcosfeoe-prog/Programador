// Inimigos: aldeões infectados pela Ferrugem, rastejantes e o gerenciador que cuida de
// percepção, alerta em grupo, campo de fluxo, separação e acertos.
import * as THREE from 'three';
import { Humanoid, CrawlerRig } from './rig.js';
import { makeEnemyWeapon } from './models.js';
import { Enemy } from './enemy_base.js';
import { Boss } from './boss.js';
import { clamp, dampAngle, angleDiff, rand, randInt, pick, chance, weighted } from './util.js';

export const MELEE = {
  axe: { dmg: 22, range: 1.7, windup: 0.62, recover: 0.75 },
  sickle: { dmg: 15, range: 1.5, windup: 0.48, recover: 0.6 },
  pitchfork: { dmg: 18, range: 2.25, windup: 0.7, recover: 0.8 },
  shovel: { dmg: 18, range: 1.85, windup: 0.6, recover: 0.75 },
  machete: { dmg: 20, range: 1.65, windup: 0.52, recover: 0.65 },
  none: { dmg: 12, range: 1.35, windup: 0.5, recover: 0.6 },
  rock: { dmg: 12, range: 1.35, windup: 0.5, recover: 0.6 },
};
const WEAPON_WEIGHTS = [
  ['axe', 3],
  ['sickle', 3],
  ['pitchfork', 2],
  ['shovel', 2],
  ['machete', 2],
  ['none', 2],
  ['rock', 1.2],
];

const SKINS = [0xb89c88, 0xa88e7c, 0x9c8474, 0xc0a894, 0x8e7a6c, 0xa69486];
const SHIRTS = [0x4a4038, 0x3a3e44, 0x5a4a3a, 0x3c4a3a, 0x5c3a32, 0x2e2c30, 0x6a5e4c, 0x48362e];
const PANTS = [0x2f2b28, 0x3a3630, 0x2a2e36, 0x403a32, 0x302620];
const DRESS = [0x4a2c2a, 0x3a3440, 0x2e3a34, 0x5a4636, 0x2a2626];
const HAIR = [0x1a1512, 0x3a2a1e, 0x5a5048, 0x8a8278, 0x2a2018];
const HATS = [0x2b2622, 0x4a3a2a, 0x3a2a26, 0x5a4a38];

export function randomLook(female) {
  const o = {
    scale: rand(0.93, 1.07),
    build: weighted([
      ['normal', 6],
      ['heavy', 2],
      ['thin', 2],
    ]),
    skin: pick(SKINS),
    infected: true,
    eyes: 0xff7a1e,
    shirt: pick(SHIRTS),
    pants: pick(PANTS),
    hair: pick(HAIR),
    hatColor: pick(HATS),
    shards: randInt(0, 3),
  };
  o.longSleeves = chance(0.5);
  o.sleeves = o.longSleeves ? 'long' : 'short';
  if (female) {
    o.dress = pick(DRESS);
    o.hairStyle = pick(['long', 'bun', 'long']);
    o.hat = chance(0.45) ? 'scarf' : null;
    o.scale *= 0.94;
    o.build = chance(0.5) ? 'normal' : 'thin';
  } else {
    o.hat = weighted([
      [null, 4],
      ['cap', 3],
      ['straw', 2],
      ['hood', 1],
    ]);
    o.beard = chance(0.35) ? pick(HAIR) : null;
    o.hairStyle = chance(0.2) ? 'bald' : 'short';
    o.apron = chance(0.15) ? 0x5a4a3a : null;
  }
  return o;
}

const _dir = { x: 0, z: 0 };
const _tp = { dx: 0, dz: 0, d: 0, yaw: 0 };
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// ======================================================================= ALDEÃO
export class Villager extends Enemy {
  constructor(G, x, z, o = {}) {
    super(G, x, z, o);
    this.kind = 'villager';
    const female = o.female ?? chance(0.35);
    const look = o.look || randomLook(female);
    this.female = female;
    this.rig = new Humanoid(look);
    this.weaponKind = o.weapon || (o.look ? 'none' : weighted(WEAPON_WEIGHTS));
    this.w = MELEE[this.weaponKind];
    if (this.weaponKind !== 'none') {
      this.weaponMesh = makeEnemyWeapon(this.weaponKind);
      this.rig.mountR.add(this.weaponMesh);
      if (this.weaponKind === 'rock') this.weaponMesh.visible = false;
    }
    this.thrower = this.weaponKind === 'rock' || (this.weaponKind === 'none' && chance(0.4));
    const D = G.diff;
    this.maxHp = this.hp = 100 * D.hp * rand(0.9, 1.12);
    this.walk = rand(1.1, 1.45) * D.speed;
    this.run = rand(2.1, 2.7) * D.speed;
    this.runner = chance(0.35);
    this.pitch = female ? rand(1.35, 1.55) : rand(0.85, 1.1);
    this.idleMode = o.idle || 'idle';
    this.home = { x, z };
    this.wx = x;
    this.wz = z;
    this.wanderT = rand(0, 2);
    this.voiceT = rand(3, 9);
    this.perceiveT = rand(0, 0.3);
    this.throwCd = rand(2, 5);
    this.chopT = rand(0, 1.6);
    const s = this.rig.s;
    this.radius = 0.34 * s;
    this.height = 1.8 * s;
    this.boundR = 2.1 * s;
    G.scene.add(this.rig.root);
    if (this.idleMode === 'hunt') {
      this.alert = true;
      this.setState('chase');
    } else this.setState('idle');
    this.rig.resetPose();
    this.idleAnim(0);
    this.rig.snap();
    this.syncRig();
  }

  get kickable() {
    return this.alive && (this.state === 'stagger' || this.state === 'kneel');
  }

  becomeAlert(shout = true) {
    if (this.alert || !this.alive) return;
    this.alert = true;
    if (shout) this.G.audio.voice(this.pos, 'alert', this.pitch);
    if (this.state === 'idle') this.setState('alert');
    this.mgr.propagate(this);
  }

  perceive(dt, tp) {
    if (this.alertDelay > 0) {
      this.alertDelay -= dt;
      if (this.alertDelay <= 0) this.becomeAlert();
      return;
    }
    this.perceiveT -= dt;
    if (this.perceiveT > 0) return;
    this.perceiveT = 0.25;
    const G = this.G,
      P = G.player;
    if (P.dead || G.state !== 'play') return;
    let sees = tp.d < 4.5;
    if (!sees && tp.d < 24) {
      const ang = Math.abs(angleDiff(this.yaw, tp.yaw));
      const fov = this.idleMode === 'chop' || this.idleMode === 'pray' ? 0.8 : 1.15;
      if (ang < fov || (P.running && tp.d < 11)) {
        sees = G.col.clear(this.pos.x, 1.6, this.pos.z, P.pos.x, 1.3, P.pos.z, 'bullet');
      }
    }
    if (sees) this.becomeAlert();
  }

  idleAnim(dt) {
    const R = this.rig,
      t = this.G.time * 1 + this.id * 1.7;
    switch (this.idleMode) {
      case 'talk':
        R.set('spine', 0.15 + Math.sin(t * 1.3) * 0.03, Math.sin(t * 0.7) * 0.15, 0);
        R.set('neck', 0.1, Math.sin(t * 0.9) * 0.3, 0);
        R.set('rSh', -0.35 - Math.max(0, Math.sin(t * 2.1)) * 0.5, 0, -0.15);
        R.set('rEl', -0.7);
        R.set('lSh', -0.1, 0, 0.1);
        break;
      case 'chop': {
        this.chopT += dt;
        const k = (this.chopT % 1.7) / 1.7;
        const up = k < 0.6 ? k / 0.6 : 1 - (k - 0.6) / 0.12;
        const u = clamp(up, 0, 1);
        R.set('rSh', -0.6 - u * 2.1, 0, 0.1);
        R.set('lSh', -0.6 - u * 2.0, 0, -0.25);
        R.set('rEl', -0.3);
        R.set('lEl', -0.4);
        R.set('spine', 0.45 - u * 0.5, 0, 0);
        if (k > 0.72 && !this.chopped) {
          this.chopped = true;
          const P = this.G.player;
          if (Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z) < 30) this.G.audio.hit('wood', this.pos);
        }
        if (k < 0.5) this.chopped = false;
        break;
      }
      case 'pray':
        R.hipsY = -0.36;
        R.set('lHip', -0.1);
        R.set('lKnee', 1.6);
        R.set('rHip', -0.1);
        R.set('rKnee', 1.6);
        R.set('lAnkle', 0.6);
        R.set('rAnkle', 0.6);
        R.set('spine', 0.35 + Math.sin(t * 2) * 0.05, 0, 0);
        R.set('neck', 0.4, 0, 0);
        R.set('lSh', -1.0, 0, -0.35);
        R.set('rSh', -1.0, 0, 0.35);
        R.set('lEl', -1.1);
        R.set('rEl', -1.1);
        break;
      default:
        R.set('spine', 0.25 + Math.sin(t * 0.8) * 0.04, Math.sin(t * 0.4) * 0.1, 0);
        R.set('neck', 0.15, Math.sin(t * 0.5) * 0.4, Math.sin(t * 0.6) * 0.15);
        R.set('lSh', -0.15, 0, 0.05);
        R.set('rSh', -0.15, 0, -0.05);
        R.set('lEl', -0.3);
        R.set('rEl', -0.3);
    }
  }

  wander(dt) {
    this.wanderT -= dt;
    const dx = this.wx - this.pos.x,
      dz = this.wz - this.pos.z;
    const d = Math.hypot(dx, dz);
    if (this.wanderT <= 0) {
      this.wanderT = rand(3, 6);
      const a = rand(0, Math.PI * 2),
        r = rand(1, 5);
      this.wx = this.home.x + Math.cos(a) * r;
      this.wz = this.home.z + Math.sin(a) * r;
    }
    if (d < 0.4) return [0, 0];
    const sp = 0.6;
    this.yaw = dampAngle(this.yaw, Math.atan2(dx, dz), 3, dt);
    this.phase += dt * sp * 4.6;
    this.rig.gait(this.phase, 0.55, 0);
    return [(dx / d) * sp, (dz / d) * sp];
  }

  groan(dt, d) {
    this.voiceT -= dt;
    if (this.voiceT <= 0) {
      this.voiceT = rand(4, 10);
      if (d < 26) this.G.audio.voice(this.pos, 'groan', this.pitch);
    }
  }

  poseWindup(k) {
    const R = this.rig;
    if (this.weaponKind === 'pitchfork') {
      R.set('rSh', -1.0 * k, 0, 0.2);
      R.set('rEl', -1.2 * k);
      R.set('lSh', -0.9 * k, 0, -0.3);
      R.set('lEl', -0.9 * k);
      R.set('spine', -0.2 * k, 0.5 * k, 0);
      return;
    }
    if (this.weaponKind === 'none' || this.weaponKind === 'rock') {
      R.set('rSh', -1.6 * k, 0, -0.3 * k);
      R.set('lSh', -1.6 * k, 0, 0.3 * k);
      R.set('rEl', -0.6 * k);
      R.set('lEl', -0.6 * k);
      R.set('spine', -0.15 * k, 0, 0);
      return;
    }
    R.set('rSh', -2.7 * k, 0, 0.15 * k);
    R.set('rEl', -0.5 * k);
    R.set('lSh', -0.6 * k, 0, 0.2);
    R.set('spine', -0.22 * k, -0.25 * k, 0);
    R.set('neck', -0.2 * k);
  }

  poseStrike() {
    const R = this.rig;
    if (this.weaponKind === 'pitchfork') {
      R.set('rSh', -1.45, 0, 0.1);
      R.set('rEl', -0.05);
      R.set('lSh', -1.4, 0, -0.1);
      R.set('lEl', -0.05);
      R.set('spine', 0.35, -0.2, 0);
      return;
    }
    if (this.weaponKind === 'none' || this.weaponKind === 'rock') {
      R.set('rSh', -1.4, 0, 0.15);
      R.set('lSh', -1.4, 0, -0.15);
      R.set('rEl', -0.1);
      R.set('lEl', -0.1);
      R.set('spine', 0.45, 0, 0);
      return;
    }
    R.set('rSh', -0.45, 0, 0.1);
    R.set('rEl', -0.15);
    R.set('lSh', -0.3, 0, 0.2);
    R.set('spine', 0.5, 0.25, 0);
  }

  poseDown(dead = false) {
    const R = this.rig;
    R.bodyTilt = this.fallBack ? -1.5 : 1.45;
    R.bodyLift = this.fallBack ? 0.14 : 0.13;
    R.set('lSh', -0.2, 0, dead ? 1.3 : 0.9);
    R.set('rSh', dead ? -2.6 : -0.3, 0, dead ? -0.4 : -1.0);
    R.set('lHip', -0.25, 0, 0.15);
    R.set('rHip', -0.6, 0, -0.1);
    R.set('rKnee', 0.9);
    R.set('lKnee', 0.2);
    R.set('neck', this.fallBack ? 0.25 : -0.35, dead ? 0.7 : 0.2, 0);
    R.set('spine', 0, dead ? 0.2 : 0, 0);
  }

  poseKneel() {
    const R = this.rig;
    R.hipsY = -0.36;
    R.set('lHip', -1.5);
    R.set('lKnee', 1.5);
    R.set('rHip', 0.05);
    R.set('rKnee', 1.6);
    R.set('rAnkle', 0.8);
    R.set('spine', 0.5, 0, 0);
    R.set('lSh', -0.7, 0, 0.2);
    R.set('lEl', -0.6);
    R.set('rSh', -0.25);
    R.set('neck', 0.25);
  }

  throwRock(tp) {
    const G = this.G,
      P = G.player;
    this.rig.j.rHand.getWorldPosition(_v);
    const T = clamp(tp.d / 11, 0.5, 1.2);
    const tx = P.pos.x + P.vel.x * T * 0.6,
      tz = P.pos.z + P.vel.z * T * 0.6,
      ty = 1.2;
    _v2.set((tx - _v.x) / T, (ty - _v.y) / T + 0.5 * 9.8 * T, (tz - _v.z) / T);
    G.proj.spawnRock(_v, _v2, this.w.dmg);
    if (this.weaponKind === 'rock' && this.weaponMesh) this.weaponMesh.visible = false;
    G.audio.whoosh(0.25);
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
      rate = 10;
    switch (this.state) {
      case 'idle': {
        this.idleAnim(dt);
        if (this.idleMode === 'wander') [vx, vz] = this.wander(dt);
        this.perceive(dt, tp);
        if (tp.d < 22) this.groan(dt, tp.d);
        break;
      }
      case 'alert': {
        this.yaw = dampAngle(this.yaw, tp.yaw, 6, dt);
        R.set('neck', -0.35, 0, 0);
        R.set('spine', -0.15, 0, 0);
        R.set('lSh', -0.3, 0, 0.5);
        R.set('rSh', -0.3, 0, -0.5);
        if (this.st > 0.8) this.setState('chase');
        break;
      }
      case 'chase': {
        if (P.dead || G.state !== 'play') {
          this.idleAnim(dt);
          break;
        }
        this.pathDir(_dir);
        const d = tp.d;
        const facing = Math.abs(angleDiff(this.yaw, tp.yaw));
        if (d < this.w.range + 0.1 && facing < 0.75 && this.mgr.slots < this.mgr.maxSlots) {
          this.takeSlot();
          this.setState('windup');
          this.struck = false;
          G.audio.voice(this.pos, 'attack', this.pitch);
          break;
        }
        this.throwCd -= dt;
        if (this.thrower && this.throwCd <= 0 && d > 5 && d < 15) {
          this.throwCd = rand(4, 7);
          if (G.col.clear(this.pos.x, 1.5, this.pos.z, P.pos.x, 1.2, P.pos.z, 'bullet')) {
            this.setState('throwWind');
            break;
          }
        }
        let sp = (this.runner && d > 4 ? this.run : this.walk) * this.buff;
        if (d < 2.3 && this.mgr.slots >= this.mgr.maxSlots) sp = d < 1.6 ? -0.4 : 0;
        if (d < 0.8) sp = 0;
        let mx = _dir.x,
          mz = _dir.z;
        if (d > 2.5 && d < 10) {
          mx += -_dir.z * this.flank * 0.5;
          mz += _dir.x * this.flank * 0.5;
          const l = Math.hypot(mx, mz) || 1;
          mx /= l;
          mz /= l;
        }
        vx = mx * sp;
        vz = mz * sp;
        const faceYaw = d < 3.2 ? tp.yaw : Math.atan2(mx, mz);
        this.yaw = dampAngle(this.yaw, faceYaw, 7, dt);
        this.phase += dt * Math.abs(sp) * 4.6;
        R.gait(this.phase, clamp(Math.abs(sp) / 1.3, 0, 1), sp > 2 ? 0.6 : 0);
        const reach = d < 5 ? 1 : 0.35;
        R.add('rSh', -0.35 * reach);
        R.add('lSh', -0.6 * reach, 0, -0.1 * reach);
        R.add('lEl', -0.3 * reach);
        R.add('spine', 0.22);
        R.add('neck', -0.15);
        this.groan(dt, d);
        break;
      }
      case 'windup': {
        this.yaw = dampAngle(this.yaw, tp.yaw, 5, dt);
        this.poseWindup(Math.min(1, this.st / (this.w.windup * 0.8)));
        if (this.st >= this.w.windup) this.setState('strike');
        break;
      }
      case 'strike': {
        this.poseStrike();
        rate = 24;
        if (!this.struck && this.st > 0.05) {
          this.struck = true;
          G.audio.whoosh(0.3);
          if (!P.dead && tp.d < this.w.range + 0.45 && Math.abs(angleDiff(this.yaw, tp.yaw)) < 1.0) P.takeDamage(this.w.dmg, this.pos, {});
        }
        if (this.st > 0.22) this.setState('recover');
        break;
      }
      case 'recover': {
        this.poseStrike();
        R.add('spine', 0.1);
        rate = 6;
        if (this.st > this.w.recover) this.setState('chase');
        break;
      }
      case 'throwWind': {
        this.yaw = dampAngle(this.yaw, tp.yaw, 6, dt);
        if (this.weaponKind === 'rock' && this.weaponMesh) this.weaponMesh.visible = true;
        R.set('rSh', 0.5 + Math.min(1, this.st / 0.6) * 0.6, 0, -0.3);
        R.set('rEl', -1.2);
        R.set('spine', -0.2, -0.4, 0);
        R.set('lSh', -1.0, 0, 0.3);
        if (this.st > 0.65) {
          this.throwRock(tp);
          this.setState('throw');
        }
        break;
      }
      case 'throw': {
        R.set('rSh', -2.0, 0, -0.2);
        R.set('rEl', -0.2);
        R.set('spine', 0.3, 0.3, 0);
        rate = 18;
        if (this.st > 0.5) this.setState('chase');
        break;
      }
      case 'flinch': {
        R.set('spine', -0.3, this.flinchSide * 0.3, 0);
        R.set('neck', -0.3, 0, 0);
        R.set('lSh', -0.4, 0, 0.3);
        R.set('rSh', -0.4, 0, -0.3);
        rate = 20;
        if (this.st > this.flinchT) this.setState(this.alert ? 'chase' : 'alert');
        break;
      }
      case 'stagger': {
        R.set('spine', -0.25 + Math.sin(this.st * 6) * 0.08, Math.sin(this.st * 3) * 0.2, 0);
        R.set('neck', -0.4, 0, Math.sin(this.st * 5) * 0.2);
        R.set('lSh', -2.05, 0, -0.35);
        R.set('lEl', -1.9);
        R.set('rSh', -2.05, 0, 0.35);
        R.set('rEl', -1.9);
        this.phase += dt * 3;
        R.gait(this.phase, 0.35, 0);
        vx = -Math.sin(this.yaw) * 0.3;
        vz = -Math.cos(this.yaw) * 0.3;
        if (this.st > this.stunT) this.setState('chase');
        break;
      }
      case 'kneel': {
        this.poseKneel();
        if (this.st > this.stunT) this.setState('chase');
        break;
      }
      case 'down': {
        this.poseDown();
        rate = 12;
        if (this.st > this.downT) this.setState('getup');
        break;
      }
      case 'getup': {
        this.poseKneel();
        rate = 7;
        if (this.st > 1.05) this.setState('chase');
        break;
      }
      case 'dead': {
        this.poseDown(true);
        rate = 12;
        if (this.st > 2.6) this.setState('dissolve');
        break;
      }
      case 'dissolve': {
        this.poseDown(true);
        const k = this.st / 1.6;
        this.sink = k * 0.55;
        if (Math.random() < 0.6) G.fx.dissolve(this.pos, 2, 0.35);
        if (k >= 1) this.remove();
        break;
      }
    }
    if (this.removed) return;
    this.integrate(dt, vx, vz);
    R.apply(dt, rate);
    this.syncRig();
  }

  // ------------------------------------------------------------ dano
  onHit(h) {
    if (!this.alive) return;
    const G = this.G;
    let mult = 1;
    if (h.part === 'head') mult = h.weapon === 'pistol' ? 2.2 : h.weapon === 'knife' ? 1.5 : 1.8;
    else if (h.part === 'leg') mult = 0.8;
    else if (h.part === 'arm') mult = 0.6;
    const downed = this.state === 'down' || this.state === 'getup';
    if (downed) mult *= h.weapon === 'knife' ? 2.6 : 1.3;
    this.hp -= h.dmg * mult;
    if (!this.alert) this.becomeAlert(false);
    if (h.dir) this.knock.x += h.dir.x * (h.push ?? 0.8);
    if (h.dir) this.knock.z += h.dir.z * (h.push ?? 0.8);
    if (this.hp <= 0) {
      this.die(h);
      return;
    }
    if (downed) return;
    if (h.knockdown) {
      this.knockdown(h.dir, h.push ?? 4);
      return;
    }
    const reactive = ['idle', 'alert', 'chase', 'windup', 'strike', 'recover', 'flinch', 'throwWind', 'throw'].includes(this.state);
    if (h.part === 'head' && h.weapon !== 'knife' && (reactive || this.state === 'stagger')) {
      this.setState('stagger');
      this.stunT = rand(1.5, 1.9);
      G.audio.voice(this.pos, 'pain', this.pitch);
    } else if (h.part === 'leg' && reactive && chance(0.75)) {
      this.setState('kneel');
      this.stunT = rand(1.6, 2.0);
      G.audio.voice(this.pos, 'pain', this.pitch);
    } else if (reactive && (this.state !== 'windup' || chance(0.45) || h.weapon === 'knife')) {
      this.setState('flinch');
      this.flinchT = 0.28;
      this.flinchSide = chance(0.5) ? 1 : -1;
      if (chance(0.5)) G.audio.voice(this.pos, 'pain', this.pitch);
    }
  }

  knockdown(dir, force = 4) {
    if (!this.alive) return;
    this.fallBack = dir ? dir.x * Math.sin(this.yaw) + dir.z * Math.cos(this.yaw) < 0 : true;
    if (dir) this.knock.set(dir.x * force, 0, dir.z * force);
    this.setState('down');
    this.downT = rand(1.6, 2.6);
    this.G.audio.voice(this.pos, 'pain', this.pitch);
  }

  onKick(dmg, dir) {
    if (!this.alive) return;
    this.hp -= dmg;
    if (this.hp <= 0) return this.die({ dir, force: 5, part: 'body', weapon: 'kick' });
    this.knockdown(dir, 6);
  }

  onExplosion(dmg, dir) {
    if (!this.alive) return;
    this.hp -= dmg;
    if (this.hp <= 0) return this.die({ dir, force: 7, part: 'body', weapon: 'explosion' });
    this.becomeAlert(false);
    this.knockdown(dir, 6);
  }

  die(h) {
    if (!this.alive) return;
    const G = this.G;
    this.alive = false;
    this.hittable = false;
    this.fallBack = h.dir ? h.dir.x * Math.sin(this.yaw) + h.dir.z * Math.cos(this.yaw) < 0 : true;
    if (h.dir) this.knock.set(h.dir.x * (h.force || 2.5), 0, h.dir.z * (h.force || 2.5));
    this.setState('dead');
    G.audio.voice(this.pos, 'death', this.pitch);
    if (h.part === 'head' && (h.weapon === 'shotgun' || chance(0.45))) {
      this.rig.j.head.getWorldPosition(_v);
      this.rig.j.head.visible = false;
      G.fx.blood(_v, h.dir || { x: 0, y: 0, z: 0 }, 26, true);
    }
    G.stats.kills++;
    if (h.part === 'head') G.stats.heads++;
    G.level.enemyDrop(this.pos.x, this.pos.z, this.kind);
    this.mgr.onDeath(this);
  }
}

// ======================================================================= RASTEJANTE
export class Crawler extends Enemy {
  constructor(G, x, z, o = {}) {
    super(G, x, z, o);
    this.kind = 'crawler';
    this.rig = new CrawlerRig({ scale: rand(0.95, 1.1) });
    const D = G.diff;
    this.maxHp = this.hp = 75 * D.hp;
    this.speed = rand(4.2, 4.9) * D.speed;
    const s = this.rig.s;
    this.radius = 0.42 * s;
    this.height = 0.75 * s;
    this.boundR = 1.2 * s;
    this.leapCd = rand(0.6, 1.4);
    this.idleMode = o.idle || 'dormant';
    this.pitch = rand(0.9, 1.15);
    this.perceiveT = 0;
    this.voiceT = rand(2, 5);
    G.scene.add(this.rig.root);
    if (this.idleMode === 'hunt') {
      this.alert = true;
      this.setState('chase');
    } else this.setState('idle');
    this.rig.resetPose();
    this.rig.stance(1);
    this.rig.snap();
    this.syncRig();
  }

  get kickable() {
    return this.alive && this.state === 'land' && this.st > 0.1;
  }

  becomeAlert() {
    if (this.alert || !this.alive) return;
    this.alert = true;
    this.G.audio.voice(this.pos, 'crawler', this.pitch);
    if (this.state === 'idle') this.setState('rise');
    this.mgr.propagate(this);
  }

  update(dt) {
    const G = this.G,
      P = G.player,
      R = this.rig;
    this.st += dt;
    const tp = this.toPlayer(_tp);
    R.resetPose();
    R.stance(0);
    let vx = 0,
      vz = 0,
      rate = 12;
    switch (this.state) {
      case 'idle': {
        R.stance(1);
        R.bodyLift = -0.16 + Math.sin(G.time * 2 + this.id) * 0.01;
        R.add('neck', 0.4);
        if (this.alertDelay > 0) {
          this.alertDelay -= dt;
          if (this.alertDelay <= 0) this.becomeAlert();
        }
        this.perceiveT -= dt;
        if (this.perceiveT <= 0 && !P.dead && G.state === 'play') {
          this.perceiveT = 0.25;
          if (tp.d < 9 || (tp.d < 18 && Math.abs(angleDiff(this.yaw, tp.yaw)) < 1.0 && G.col.clear(this.pos.x, 0.6, this.pos.z, P.pos.x, 1.2, P.pos.z))) this.becomeAlert();
        }
        break;
      }
      case 'rise': {
        this.yaw = dampAngle(this.yaw, tp.yaw, 8, dt);
        R.add('neck', -0.6);
        if (this.st > 0.45) this.setState('chase');
        break;
      }
      case 'chase': {
        if (P.dead || G.state !== 'play') break;
        const d = this.pathDir(_dir);
        const z = Math.sin(G.time * 2.6 + this.id) * 0.6 * clamp((d - 3) / 5, 0, 1);
        const c = Math.cos(z),
          s = Math.sin(z);
        const mx = _dir.x * c - _dir.z * s,
          mz = _dir.x * s + _dir.z * c;
        vx = mx * this.speed * this.buff;
        vz = mz * this.speed * this.buff;
        this.yaw = dampAngle(this.yaw, d < 3 ? tp.yaw : Math.atan2(mx, mz), 10, dt);
        this.phase += dt * this.speed * 3.4;
        R.gait(this.phase, 1);
        this.leapCd -= dt;
        if (this.leapCd <= 0 && d < 5.2 && Math.abs(angleDiff(this.yaw, tp.yaw)) < 0.5 && G.nav.lineClear(this.pos.x, this.pos.z, P.pos.x, P.pos.z)) {
          this.setState('crouch');
          this.takeSlot();
        }
        this.voiceT -= dt;
        if (this.voiceT <= 0) {
          this.voiceT = rand(2.5, 5);
          G.audio.voice(this.pos, 'crawler', this.pitch * 1.2);
        }
        break;
      }
      case 'crouch': {
        this.yaw = dampAngle(this.yaw, tp.yaw, 12, dt);
        R.stance(1);
        R.add('neck', -0.6);
        if (this.st > 0.42 / G.diff.speed) {
          this.leapX = Math.sin(this.yaw);
          this.leapZ = Math.cos(this.yaw);
          this.hitDone = false;
          this.setState('leap');
          G.audio.voice(this.pos, 'crawler', this.pitch * 1.4);
        }
        break;
      }
      case 'leap': {
        const T = 0.44;
        vx = this.leapX * 8.6;
        vz = this.leapZ * 8.6;
        R.bodyLift = Math.sin(Math.min(1, this.st / T) * Math.PI) * 0.65;
        for (const n of ['FL', 'FR']) R.add('h' + n, 0, n === 'FL' ? -0.6 : 0.6, 0);
        for (const n of ['BL', 'BR']) R.add('h' + n, 0, n === 'BL' ? 0.6 : -0.6, 0);
        rate = 20;
        if (!this.hitDone && !P.dead && tp.d < 1.25) {
          this.hitDone = true;
          P.takeDamage(18, this.pos, {});
        }
        if (this.st > T) this.setState('land');
        break;
      }
      case 'land': {
        R.stance(0.6);
        R.add('neck', 0.3);
        if (this.st > 0.95) {
          this.leapCd = rand(1.2, 2.2);
          this.setState('chase');
        }
        break;
      }
      case 'flinch': {
        R.add('torso', 0, 0, this.flinchSide * 0.3);
        rate = 20;
        if (this.st > 0.15) this.setState('chase');
        break;
      }
      case 'flipped': {
        R.bodyRoll = Math.PI;
        R.bodyLift = 0.42;
        R.gait(G.time * 20, 0.6);
        if (this.st > this.flipT) this.setState('land');
        break;
      }
      case 'dead':
      case 'dissolve': {
        R.bodyRoll = Math.PI * 0.92;
        R.bodyLift = 0.35;
        for (const n of ['FL', 'BL']) R.add('k' + n, 0, 0, -0.9);
        for (const n of ['FR', 'BR']) R.add('k' + n, 0, 0, 0.9);
        if (this.state === 'dead' && this.st > 2.2) this.setState('dissolve');
        if (this.state === 'dissolve') {
          const k = this.st / 1.4;
          this.sink = k * 0.6;
          if (Math.random() < 0.5) G.fx.dissolve(this.pos, 2, 0.2);
          if (k >= 1) this.remove();
        }
        break;
      }
    }
    if (this.removed) return;
    const blocked = this.integrate(dt, vx, vz);
    if (this.state === 'leap' && blocked && this.st > 0.1) this.setState('land');
    R.apply(dt, rate);
    this.syncRig();
  }

  onHit(h) {
    if (!this.alive) return;
    const G = this.G;
    let mult = h.part === 'head' ? 2.2 : h.part === 'leg' ? 0.6 : 1;
    if (this.state === 'flipped') mult *= h.weapon === 'knife' ? 2.5 : 1.3;
    this.hp -= h.dmg * mult;
    if (!this.alert) this.becomeAlert();
    if (h.dir) {
      this.knock.x += h.dir.x * 0.6;
      this.knock.z += h.dir.z * 0.6;
    }
    if (this.hp <= 0) return this.die(h);
    if (h.knockdown) return this.flip(h.dir);
    if (this.state === 'chase' || this.state === 'crouch' || (this.state === 'idle' && this.alert)) {
      this.setState('flinch');
      this.flinchSide = chance(0.5) ? 1 : -1;
      if (chance(0.4)) G.audio.voice(this.pos, 'crawler', this.pitch * 1.6);
    }
  }

  flip(dir) {
    if (dir) this.knock.set(dir.x * 5, 0, dir.z * 5);
    this.setState('flipped');
    this.flipT = rand(1.4, 2.0);
  }

  onKick(dmg, dir) {
    if (!this.alive) return;
    this.hp -= dmg;
    if (this.hp <= 0) return this.die({ dir, force: 6, part: 'body' });
    this.flip(dir);
  }

  onExplosion(dmg, dir) {
    if (!this.alive) return;
    this.hp -= dmg;
    if (this.hp <= 0) return this.die({ dir, force: 7, part: 'body' });
    this.becomeAlert();
    this.flip(dir);
  }

  die(h) {
    if (!this.alive) return;
    const G = this.G;
    this.alive = false;
    this.hittable = false;
    if (h.dir) this.knock.set(h.dir.x * 3, 0, h.dir.z * 3);
    this.setState('dead');
    G.audio.voice(this.pos, 'crawlerDie', this.pitch);
    G.stats.kills++;
    if (h.part === 'head') G.stats.heads++;
    G.level.enemyDrop(this.pos.x, this.pos.z, 'crawler');
    this.mgr.onDeath(this);
  }
}

// Tipos extras registrados por outros módulos (infected.js, bosses.js) sem import circular.
export const KINDS = {};
export function registerKind(name, cls, short) {
  KINDS[name] = cls;
  if (short) KINDS[short] = cls;
}

// ======================================================================= GERENCIADOR
export class EnemyManager {
  constructor(G) {
    this.G = G;
    this.list = [];
    this.slots = 0;
    this.maxSlots = 2;
    this.flowT = 0;
    this.boss = null;
  }

  spawn(kind, x, z, o = {}) {
    let e;
    if (kind === 'crawler' || kind === 'c') e = new Crawler(this.G, x, z, o);
    else if (kind === 'boss' || kind === 'ferreiro') e = new Boss(this.G, x, z, o);
    else if (KINDS[kind]) e = new KINDS[kind](this.G, x, z, o);
    else e = new Villager(this.G, x, z, o);
    if (e.isBoss) this.boss = e;
    this.list.push(e);
    return e;
  }

  // defs: [{k:'v'|'c'|'runner'|..., x, z, idle, weapon, yaw, female}]
  spawnGroup(defs, minDist = 9) {
    const P = this.G.player;
    let n = 0;
    for (const d of defs) {
      if (d.idle === 'hunt' && P && Math.hypot(P.pos.x - d.x, P.pos.z - d.z) < minDist) continue;
      this.spawn(d.k || 'v', d.x, d.z, d);
      n++;
    }
    if (n) this.flowT = 0;
    return n;
  }

  // Quantos inimigos vivos (para limitar ondas e populações do mundo aberto).
  aliveCount() {
    let n = 0;
    for (const e of this.list) if (e.alive) n++;
    return n;
  }

  clear() {
    for (const e of this.list) e.remove();
    this.list = [];
    this.slots = 0;
    this.boss = null;
  }

  onDeath(e) {
    if (this.G.onEnemyDeath) this.G.onEnemyDeath(e);
  }

  // Um alerta se espalha para os vizinhos.
  propagate(src) {
    for (const e of this.list) {
      if (e === src || !e.alive || e.alert || e.isBoss) continue;
      const d = Math.hypot(e.pos.x - src.pos.x, e.pos.z - src.pos.z);
      if (d < 13 && e.alertDelay <= 0) e.alertDelay = rand(0.3, 1.0);
    }
  }

  // Barulho (tiros, explosões): acorda quem estiver no raio.
  noise(x, z, r) {
    for (const e of this.list) {
      if (!e.alive || e.alert || e.isBoss) continue;
      const d = Math.hypot(e.pos.x - x, e.pos.z - z);
      if (d < r && e.alertDelay <= 0) e.alertDelay = rand(0.15, 0.7) + d * 0.01;
    }
  }

  update(dt) {
    const G = this.G,
      P = G.player;
    this.maxSlots = G.diff.dmg > 1.2 ? 3 : 2;
    this.flowT -= dt;
    if (this.flowT <= 0) {
      this.flowT = 0.35;
      if (this.list.some((e) => e.alive && e.alert)) G.nav.computeFlow(P.pos.x, P.pos.z, 75);
    }
    for (const e of this.list) {
      if (e.removed) continue;
      e.update(dt);
      if (e.buffT > 0) e.buffT -= dt;
      if (e.burnT > 0 && e.alive && !e.removed) {
        e.burnT -= dt;
        e.onBurn(10 * dt);
        if (Math.random() < 0.8) G.fx.fire({ x: e.pos.x + rand(-0.25, 0.25), y: e.pos.y + rand(0.2, e.height * 0.8), z: e.pos.z + rand(-0.25, 0.25) }, 1, 0.55);
        if (e.burnT > 0 && Math.random() < dt * 0.6) G.audio.voice(e.pos, e.kind === 'dog' ? 'bark' : 'pain', e.pitch || 1);
      }
    }
    // separação entre inimigos e com o jogador
    const L = this.list;
    for (let i = 0; i < L.length; i++) {
      const a = L[i];
      if (!a.alive || a.removed) continue;
      for (let j = i + 1; j < L.length; j++) {
        const b = L[j];
        if (!b.alive || b.removed) continue;
        const dx = b.pos.x - a.pos.x,
          dz = b.pos.z - a.pos.z;
        const rr = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-8) {
          const d = Math.sqrt(d2),
            push = (rr - d) / d;
          const wa = b.mass / (a.mass + b.mass),
            wb = a.mass / (a.mass + b.mass);
          a.pos.x -= dx * push * wa;
          a.pos.z -= dz * push * wa;
          b.pos.x += dx * push * wb;
          b.pos.z += dz * push * wb;
        }
      }
      if (!P.dead) {
        const dx = P.pos.x - a.pos.x,
          dz = P.pos.z - a.pos.z;
        const rr = a.radius + P.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < rr * rr && d2 > 1e-8 && a.state !== 'down' && a.state !== 'dead') {
          const d = Math.sqrt(d2),
            push = (rr - d) / d;
          const wp = a.isBoss ? 1 : 0.35;
          P.pos.x += dx * push * wp;
          P.pos.z += dz * push * wp;
          a.pos.x -= dx * push * (1 - wp);
          a.pos.z -= dz * push * (1 - wp);
          P.resolveWorld();
        }
      }
    }
    if (L.some((e) => e.removed)) this.list = L.filter((e) => !e.removed);
  }

  raycast(o, d, maxT) {
    let best = null,
      bt = maxT;
    for (const e of this.list) {
      if (!e.hittable || e.removed) continue;
      const h = e.hitTest(o, d, bt);
      if (h) {
        bt = h.t;
        best = { enemy: e, part: h.part, t: h.t };
      }
    }
    return best;
  }

  findKickable(P) {
    let best = null,
      bd = 2.4;
    const fx = Math.sin(P.yaw),
      fz = Math.cos(P.yaw);
    for (const e of this.list) {
      if (!e.kickable) continue;
      const dx = e.pos.x - P.pos.x,
        dz = e.pos.z - P.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > bd + (e.isBoss ? 1.6 : 0)) continue;
      const cam = Math.sin(P.camYaw) * dx + Math.cos(P.camYaw) * dz;
      if ((fx * dx + fz * dz) / (d || 1) < 0.2 && cam / (d || 1) < 0.3) continue;
      bd = d;
      best = e;
    }
    return best;
  }

  // Chute: atinge todos à frente.
  kickArc(P, dmg) {
    const fx = Math.sin(P.yaw),
      fz = Math.cos(P.yaw);
    let n = 0;
    for (const e of this.list) {
      if (!e.alive) continue;
      const dx = e.pos.x - P.pos.x,
        dz = e.pos.z - P.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 2.7 + (e.isBoss ? 1.4 : 0)) continue;
      if ((fx * dx + fz * dz) / (d || 1) < 0.15) continue;
      e.onKick(dmg * (e.isBoss ? 2.2 : 1), { x: dx / (d || 1), y: 0, z: dz / (d || 1) });
      n++;
    }
    return n;
  }

  // Faca: atinge os mais próximos à frente.
  knifeArc(P, dmg) {
    const fx = Math.sin(P.yaw),
      fz = Math.cos(P.yaw);
    let hit = null;
    for (const e of this.list) {
      if (!e.alive || !e.hittable) continue;
      const dx = e.pos.x - P.pos.x,
        dz = e.pos.z - P.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > 1.75 + e.radius) continue;
      if ((fx * dx + fz * dz) / (d || 1) < 0.35) continue;
      const down = e.state === 'down' || e.state === 'flipped' || e.state === 'getup';
      e.onHit({ dmg, part: down ? 'body' : 'body', weapon: 'knife', dir: { x: dx / (d || 1), y: 0, z: dz / (d || 1) }, push: 1.2 });
      hit = e;
    }
    return hit;
  }

  // 0..1: quanto perigo há por perto (para a música).
  intensity() {
    const P = this.G.player;
    let k = 0;
    for (const e of this.list) {
      if (!e.alive || !e.alert) continue;
      if (e.isBoss && e.awake !== false && e.state !== 'dormant') return 1;
      const d = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
      if (d < 26) k += d < 10 ? 0.35 : 0.2;
    }
    return clamp(k, 0, 1);
  }

  aliveAdds() {
    let n = 0;
    for (const e of this.list) if (e.alive && !e.isBoss) n++;
    return n;
  }
}

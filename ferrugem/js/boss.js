// O Ferreiro: chefe final. Marretada (área), varrida, investida (atordoa se bater em
// pilar/parede), arremesso de ferro derretido e invocação de aldeões. Ponto fraco: o núcleo.
import * as THREE from 'three';
import { buildBlacksmith } from './rig.js';
import { Enemy } from './enemy_base.js';
import { clamp, dampAngle, turnToward, angleDiff } from './util.js';

const _tp = { dx: 0, dz: 0, d: 0, yaw: 0 };
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

export class Boss extends Enemy {
  constructor(G, x, z, o = {}) {
    super(G, x, z, o);
    this.kind = 'boss';
    this.isBoss = true;
    this.rig = buildBlacksmith();
    this.maxHp = this.hp = 3200 * G.diff.hp;
    this.radius = 0.95;
    this.height = 3.3;
    this.boundR = 4.2;
    this.mass = 12;
    this.yaw = o.yaw ?? Math.PI;
    this.phaseN = 1;
    this.cd = 1.5;
    this.poise = 0;
    this.staggerCd = 0;
    this.summonT = 18;
    this.stepAcc = 0;
    this.alert = true;
    this.arena = o.arena || { x: x, z: z, r: 18 };
    this.anvil = o.anvil || null;
    this.awake = false;
    this.coreLight = G.fx.lights.add({ x, y: 2.4, z, color: 0xff6a1a, intensity: 14, range: 7, flicker: 0.25, priority: 30 });
    G.scene.add(this.rig.root);
    this.setState('dormant');
    this.rig.resetPose();
    this.rig.snap();
    this.syncRig();
  }

  get kickable() {
    return this.alive && (this.state === 'stagger' || this.state === 'stunned') && this.st > 0.3;
  }

  get showBar() {
    return !!this.G.level.flags.arena && this.state !== 'dormant' && !this.removed && this.state !== 'dead';
  }

  get speed() {
    return (this.phaseN === 1 ? 1.75 : this.phaseN === 2 ? 2.15 : 2.6) * this.G.diff.speed;
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
    if (this.staggerCd > 0) this.staggerCd -= dt;
    this.poise = Math.max(0, this.poise - dt * 70);
    switch (this.state) {
      case 'dormant': {
        // martelando a bigorna
        const k = (this.st % 1.3) / 1.3;
        const up = k < 0.7 ? k / 0.7 : 1 - (k - 0.7) / 0.1;
        const u = clamp(up, 0, 1);
        R.set('rSh', -0.5 - u * 2.2, 0, 0.1);
        R.set('rEl', -0.4);
        R.set('lSh', -0.7, 0, -0.3);
        R.set('lEl', -1.0);
        R.set('spine', 0.4 - u * 0.3, 0.2, 0);
        rate = 14;
        if (k > 0.8 && !this.clanged) {
          this.clanged = true;
          const a = this.anvil || { x: this.pos.x, z: this.pos.z + 2 };
          if (Math.hypot(P.pos.x - this.pos.x, P.pos.z - this.pos.z) < 45) {
            G.audio.hit('metal', this.pos);
            G.fx.sparks({ x: a.x, y: 0.95, z: a.z - 0.4 }, { x: 0, y: 1, z: -0.5 }, 12);
          }
        }
        if (k < 0.5) this.clanged = false;
        if (this.awake) this.setState('intro');
        break;
      }
      case 'intro': {
        this.yaw = dampAngle(this.yaw, tp.yaw, 2.5, dt);
        if (this.st < 0.9) {
          R.set('spine', 0.2, 0, 0);
          R.set('rSh', -0.3);
        } else {
          R.set('spine', -0.35, 0, 0);
          R.set('neck', -0.5, 0, 0);
          R.set('lSh', -0.6, 0, 1.0);
          R.set('rSh', -0.6, 0, -1.0);
          R.set('lEl', -0.8);
          R.set('rEl', -0.8);
          if (!this.roared) {
            this.roared = true;
            G.audio.voice(this.pos, 'boss');
            G.fx.shake(0.6);
          }
        }
        if (this.st > 2.9) {
          this.setState('chase');
          this.cd = 1.0;
        }
        break;
      }
      case 'chase': {
        if (P.dead) break;
        this.cd -= dt;
        this.summonT -= dt;
        // fase
        const frac = this.hp / this.maxHp;
        const newPhase = frac < 0.28 ? 3 : frac < 0.6 ? 2 : 1;
        if (newPhase > this.phaseN) {
          this.phaseN = newPhase;
          this.setState('summon');
          break;
        }
        if (this.phaseN >= 2 && this.summonT <= 0 && this.mgr.aliveAdds() < 3) {
          this.setState('summon');
          break;
        }
        const d = tp.d;
        const facing = Math.abs(angleDiff(this.yaw, tp.yaw));
        if (this.cd <= 0) {
          const r = Math.random();
          if (d < 3.8 && facing < 0.9) {
            this.setState(r < 0.55 ? 'slamWind' : 'sweepWind');
            break;
          }
          if (d > 6 && d < 17 && r < 0.45) {
            this.setState('throwWind');
            break;
          }
          if (d > 5.5 && d < 20 && r < (this.phaseN === 1 ? 0.35 : 0.6) && facing < 0.5) {
            this.setState('chargeWind');
            break;
          }
          this.cd = 0.4;
        }
        const turn = this.phaseN === 3 ? 2.4 : 1.8;
        this.yaw = turnToward(this.yaw, tp.yaw, turn * dt);
        let sp = d > 2.6 ? this.speed : 0;
        vx = Math.sin(this.yaw) * sp;
        vz = Math.cos(this.yaw) * sp;
        this.phase += dt * sp * 2.6;
        R.gait(this.phase, Math.min(1, sp / 1.6), 0);
        R.add('spine', 0.18);
        R.add('rSh', -0.2);
        this.footsteps(dt, sp);
        break;
      }
      case 'slamWind': {
        this.yaw = turnToward(this.yaw, tp.yaw, 1.6 * dt);
        const T = this.phaseN === 3 ? 0.8 : 1.05;
        const k = Math.min(1, this.st / (T * 0.85));
        R.set('rSh', -2.9 * k, 0, 0.3 * k);
        R.set('lSh', -2.7 * k, 0, -0.3 * k);
        R.set('rEl', -0.4 * k);
        R.set('lEl', -0.5 * k);
        R.set('spine', -0.35 * k, 0, 0);
        R.set('neck', -0.3 * k);
        if (this.st > T) {
          this.setState('slam');
          this.impact();
        }
        break;
      }
      case 'slam': {
        R.set('rSh', -0.7, 0, 0.25);
        R.set('lSh', -0.7, 0, -0.25);
        R.set('spine', 0.75, 0, 0);
        R.set('neck', 0.2);
        rate = 22;
        if (this.st > 0.95) this.toChase(0.6);
        break;
      }
      case 'sweepWind': {
        this.yaw = turnToward(this.yaw, tp.yaw, 1.4 * dt);
        const T = this.phaseN === 3 ? 0.55 : 0.75;
        const k = Math.min(1, this.st / (T * 0.85));
        R.set('spine', 0.1, 1.1 * k, 0);
        R.set('rSh', -1.4 * k, 0, -1.2 * k);
        R.set('lSh', -1.3 * k, 0, -0.4 * k);
        R.set('rEl', -0.3);
        if (this.st > T) {
          this.setState('sweep');
          G.audio.whoosh(0.9);
          if (!P.dead && tp.d < 4.2 && Math.abs(angleDiff(this.yaw, tp.yaw)) < 1.45) P.takeDamage(28, this.pos, { knockdown: true });
        }
        break;
      }
      case 'sweep': {
        R.set('spine', 0.2, -1.1, 0);
        R.set('rSh', -1.5, 0, 0.9);
        R.set('lSh', -1.3, 0, 0.3);
        rate = 20;
        if (this.st > 0.75) this.toChase(0.5);
        break;
      }
      case 'chargeWind': {
        this.yaw = turnToward(this.yaw, tp.yaw, 3 * dt);
        R.set('spine', 0.55, 0, 0);
        R.set('lSh', 0.5, 0, 0.4);
        R.set('rSh', 0.5, 0, -0.4);
        R.set('neck', -0.4);
        if (this.st < 0.05) G.audio.voice(this.pos, 'bossPain');
        if (this.st > 0.65) {
          this.chX = Math.sin(this.yaw);
          this.chZ = Math.cos(this.yaw);
          this.hitDone = false;
          this.setState('charge');
        }
        break;
      }
      case 'charge': {
        const sp = 8.6 * G.diff.speed;
        vx = this.chX * sp;
        vz = this.chZ * sp;
        this.phase += dt * sp * 2.2;
        R.gait(this.phase, 1, 1);
        R.add('spine', 0.4);
        R.set('lSh', 0.4, 0, 0.3);
        R.set('rSh', 0.4, 0, -0.3);
        this.footsteps(dt, sp);
        if (!this.hitDone && !P.dead && tp.d < 2.0) {
          this.hitDone = true;
          P.takeDamage(34, this.pos, { knockdown: true });
        }
        if (this.st > 2.2) this.toChase(0.8);
        break;
      }
      case 'stunned': {
        R.hipsY = -0.3;
        R.set('lHip', -1.2);
        R.set('lKnee', 1.4);
        R.set('rHip', 0.1);
        R.set('rKnee', 1.4);
        R.set('spine', 0.6 + Math.sin(this.st * 4) * 0.05, 0, Math.sin(this.st * 2) * 0.1);
        R.set('neck', 0.3, 0, Math.sin(this.st * 3) * 0.3);
        R.set('rSh', -0.3);
        R.set('lSh', -0.5);
        if (this.st > 2.8) this.toChase(0.6);
        break;
      }
      case 'stagger': {
        R.hipsY = -0.45;
        R.set('lHip', -1.5);
        R.set('lKnee', 1.5);
        R.set('rHip', 0.05);
        R.set('rKnee', 1.6);
        R.set('spine', 0.55, 0, 0);
        R.set('neck', 0.25);
        R.set('lSh', -0.8, 0, 0.3);
        R.set('lEl', -0.6);
        R.set('rSh', -0.3);
        if (this.st > 3.4) this.toChase(0.5);
        break;
      }
      case 'throwWind': {
        this.yaw = turnToward(this.yaw, tp.yaw, 2.5 * dt);
        R.set('rSh', 0.6, 0, -0.4);
        R.set('rEl', -1.4);
        R.set('spine', -0.15, -0.5, 0);
        R.set('lSh', -1.2, 0, 0.4);
        if (this.st > 0.8) {
          this.throwMolten(tp);
          this.setState('throw');
        }
        break;
      }
      case 'throw': {
        R.set('rSh', -2.2, 0, -0.2);
        R.set('rEl', -0.2);
        R.set('spine', 0.35, 0.4, 0);
        rate = 18;
        if (this.st > 0.6) this.toChase(this.phaseN === 1 ? 0.9 : 0.5);
        break;
      }
      case 'summon': {
        R.set('spine', -0.4, 0, 0);
        R.set('neck', -0.55);
        R.set('lSh', -2.6, 0, 0.6);
        R.set('rSh', -2.6, 0, -0.6);
        if (!this.summoned && this.st > 0.6) {
          this.summoned = true;
          G.audio.voice(this.pos, 'boss');
          G.fx.shake(0.5);
          this.summonAdds();
        }
        if (this.st > 2.2) {
          this.summoned = false;
          this.summonT = this.phaseN === 3 ? 22 : 30;
          this.toChase(0.6);
        }
        break;
      }
      case 'dying': {
        const k = this.st;
        R.hipsY = -0.45 * Math.min(1, k);
        R.set('lHip', -1.4 * Math.min(1, k));
        R.set('lKnee', 1.5 * Math.min(1, k));
        R.set('rKnee', 1.5 * Math.min(1, k));
        R.set('spine', k < 1.8 ? -0.4 : 0.8, 0, 0);
        R.set('neck', k < 1.8 ? -0.6 : 0.4);
        R.set('lSh', -2.4 * (k < 1.8 ? 1 : 0.2), 0, 0.6);
        R.set('rSh', -2.4 * (k < 1.8 ? 1 : 0.2), 0, -0.6);
        if (k > 2.2) {
          R.bodyTilt = 1.35;
          R.bodyLift = 0.3;
        }
        rate = 4;
        if (Math.random() < 0.8) G.fx.embers({ x: this.pos.x, y: 1.5, z: this.pos.z }, 3, 0.8, 3);
        if (k > 2.4 && !this.thud) {
          this.thud = true;
          G.audio.slam(this.pos, 1.6);
          G.fx.shake(0.7);
          G.fx.dust({ x: this.pos.x + Math.sin(this.yaw) * 2, y: 0.2, z: this.pos.z + Math.cos(this.yaw) * 2 }, { x: 0, y: 1, z: 0 }, 30);
        }
        if (k > 4.0) {
          this.setState('dead');
        }
        break;
      }
      case 'dead': {
        R.bodyTilt = 1.35;
        R.bodyLift = 0.3;
        R.hipsY = -0.45;
        rate = 4;
        this.sink = Math.min(1.2, this.st * 0.4);
        if (Math.random() < 0.9) G.fx.dissolve(this.pos, 4, 1.0);
        if (this.st > 3.2) this.remove();
        break;
      }
    }
    if (this.removed) return;
    const prevX = this.pos.x,
      prevZ = this.pos.z;
    this.integrate(dt, vx, vz);
    if (this.state === 'charge' && this.st > 0.15) {
      const moved = (this.pos.x - prevX) * this.chX + (this.pos.z - prevZ) * this.chZ;
      if (moved < vx * this.chX * dt * 0.3 + vz * this.chZ * dt * 0.3) this.crash();
    }
    // mantém dentro da arena
    const AR = this.arena;
    const ax = this.pos.x - AR.x,
      az = this.pos.z - AR.z;
    const ad = Math.hypot(ax, az);
    if (ad > AR.r - 1.2) {
      this.pos.x = AR.x + (ax / ad) * (AR.r - 1.2);
      this.pos.z = AR.z + (az / ad) * (AR.r - 1.2);
    }
    R.apply(dt, rate);
    this.syncRig();
    // núcleo pulsando
    const pulse = 0.8 + Math.sin(G.time * (this.phaseN === 3 ? 9 : 5)) * 0.2;
    const exposed = this.state === 'stagger' || this.state === 'stunned';
    this.rig.core.scale.set(0.085 * pulse * (exposed ? 1.3 : 1), 0.085 * pulse * (exposed ? 1.3 : 1), 0.05);
    this.rig.core.getWorldPosition(_v);
    this.coreLight.x = _v.x;
    this.coreLight.y = _v.y;
    this.coreLight.z = _v.z;
    this.coreLight.intensity = (exposed ? 30 : 14) * pulse * (this.alive ? 1 : 0.4);
  }

  wake() {
    this.awake = true;
  }

  toChase(cd) {
    this.setState('chase');
    this.cd = cd * (this.phaseN === 3 ? 0.7 : 1);
  }

  footsteps(dt, sp) {
    this.stepAcc += dt * sp;
    if (this.stepAcc > 1.4) {
      this.stepAcc = 0;
      const G = this.G;
      G.audio.heavyStep(this.pos, 0.9);
      const d = Math.hypot(G.player.pos.x - this.pos.x, G.player.pos.z - this.pos.z);
      G.fx.shake(clamp(0.18 - d * 0.008, 0, 0.18));
    }
  }

  impact() {
    const G = this.G,
      P = G.player;
    const ix = this.pos.x + Math.sin(this.yaw) * 2.5,
      iz = this.pos.z + Math.cos(this.yaw) * 2.5;
    G.audio.slam({ x: ix, z: iz });
    G.fx.dust({ x: ix, y: 0.1, z: iz }, { x: 0, y: 1, z: 0 }, 26, [0.3, 0.26, 0.22]);
    G.fx.sparks({ x: ix, y: 0.1, z: iz }, { x: 0, y: 1, z: 0 }, 16);
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      G.fx.norm.spawn(ix + Math.cos(a) * 0.8, 0.15, iz + Math.sin(a) * 0.8, Math.cos(a) * 6, 0.4, Math.sin(a) * 6, 0.6, 0.25, 0.7, 0.32, 0.28, 0.24, 0.6, 0, 3);
    }
    G.fx.groundSplat(ix, iz, 1.4);
    const d = Math.hypot(P.pos.x - ix, P.pos.z - iz);
    G.fx.shake(clamp(0.9 - d * 0.05, 0.2, 0.9));
    if (!P.dead && d < 2.9) P.takeDamage(40, { x: ix, z: iz }, { knockdown: true });
    else if (!P.dead && d < 5.2) P.takeDamage(10, { x: ix, z: iz }, {});
  }

  crash() {
    const G = this.G;
    this.setState('stunned');
    G.audio.slam(this.pos, 1.2);
    G.fx.shake(0.6);
    G.fx.dust({ x: this.pos.x + this.chX * 1.2, y: 1.5, z: this.pos.z + this.chZ * 1.2 }, { x: -this.chX, y: 0.5, z: -this.chZ }, 20);
    G.audio.voice(this.pos, 'bossPain');
  }

  throwMolten(tp) {
    const G = this.G,
      P = G.player;
    this.rig.j.rHand.getWorldPosition(_v);
    const T = clamp(tp.d / 12, 0.65, 1.4);
    const tx = P.pos.x + P.vel.x * T * 0.7,
      tz = P.pos.z + P.vel.z * T * 0.7;
    _v2.set((tx - _v.x) / T, (0.2 - _v.y) / T + 0.5 * 9.8 * T, (tz - _v.z) / T);
    G.proj.spawnMolten(_v, _v2, 22);
    G.audio.whoosh(0.8);
  }

  summonAdds() {
    const G = this.G,
      P = G.player;
    const AR = this.arena;
    const pts = [
      { x: AR.x + 16.4, z: AR.z },
      { x: AR.x - 16.4, z: AR.z },
      { x: AR.x + 11, z: AR.z + 10 },
      { x: AR.x - 11, z: AR.z + 10 },
    ];
    pts.sort((a, b) => Math.hypot(b.x - P.pos.x, b.z - P.pos.z) - Math.hypot(a.x - P.pos.x, a.z - P.pos.z));
    const n = this.phaseN === 3 ? 3 : 2;
    const defs = pts.slice(0, n).map((p) => ({ k: 'v', x: p.x, z: p.z, idle: 'hunt' }));
    G.enemies.spawnGroup(defs, 5);
  }

  // ------------------------------------------------------------ dano
  onHit(h) {
    // adormecido na bigorna ele ignora os tiros (a luta só começa dentro da arena)
    if (!this.alive || this.state === 'dormant' || this.state === 'intro') return;
    const exposed = this.state === 'stagger' || this.state === 'stunned';
    let mult = h.part === 'core' ? 2 : h.part === 'head' ? 1.1 : h.part === 'body' ? 0.45 : 0.35;
    if (h.part === 'core' && h.weapon === 'shotgun') mult = 1.4;
    if (exposed) mult *= 1.5;
    if (h.weapon === 'knife') mult *= 0.6;
    const dmg = h.dmg * mult;
    this.damage(dmg, h.part === 'core');
  }

  damage(dmg, core = false) {
    if (!this.alive) return;
    const G = this.G;
    this.hp -= dmg;
    this.poise += dmg;
    if (core && Math.random() < 0.5) G.audio.voice(this.pos, 'bossPain');
    if (this.hp <= 0) {
      this.die();
      return;
    }
    if (this.poise > 320 && this.staggerCd <= 0 && ['chase', 'slamWind', 'sweepWind', 'throwWind', 'chargeWind', 'charge'].includes(this.state)) {
      this.poise = 0;
      this.staggerCd = 7;
      this.setState('stagger');
      G.audio.voice(this.pos, 'bossPain');
    }
  }

  onKick(dmg, dir) {
    if (!this.alive) return;
    this.G.fx.shake(0.3);
    this.damage(dmg * (this.state === 'stagger' || this.state === 'stunned' ? 1 : 0.4));
    void dir;
  }

  onExplosion(dmg) {
    this.damage(dmg * 0.9);
  }

  die() {
    if (!this.alive) return;
    const G = this.G;
    this.alive = false;
    this.hittable = false;
    this.setState('dying');
    G.audio.voice(this.pos, 'bossDeath');
    G.stats.kills++;
    this.mgr.onDeath(this);
    // os aldeões caem junto com o mestre
    for (const e of this.mgr.list) {
      if (e !== this && e.alive) e.onExplosion(9999, { x: 0, y: 0, z: 1 });
    }
  }

  remove() {
    if (this.removed) return;
    super.remove();
    this.G.fx.lights.remove(this.coreLight);
  }
}

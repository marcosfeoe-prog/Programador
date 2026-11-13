// Os três novos chefes:
//   O Açougueiro (capítulo 2, Mercado Municipal): cutelo, gancho que puxa o jogador, investida.
//   O Colosso (capítulo 3, Pedreira): operador fundido à escavadeira; joelhos e costas brilham.
//   Dr. Augusto Vidal (capítulo 3, Siderúrgica): três fases de crescimento até virar o
//   "coração" do alto-forno.
import * as THREE from 'three';
import { Humanoid, charMat, BOX, CYL, SPH, CONE, V, cached } from './rig.js';
import { Enemy } from './enemy_base.js';
import { registerKind } from './enemies.js';
import { mergeByMaterial } from './geo.js';
import { clamp, dampAngle, turnToward, angleDiff, rand, chance } from './util.js';

const _tp = { dx: 0, dz: 0, d: 0, yaw: 0 };
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();

// ======================================================================= base comum
class BigBoss extends Enemy {
  constructor(G, x, z, o, cfg) {
    super(G, x, z, o);
    this.isBoss = true;
    this.alert = true;
    this.awake = false;
    this.arena = o.arena || { x, z, r: 18 };
    this.baseArena = this.arena;
    this.name = cfg.name;
    this.maxHp = this.hp = cfg.hp * G.diff.hp;
    this.radius = cfg.radius;
    this.height = cfg.height;
    this.boundR = cfg.boundR;
    this.mass = cfg.mass || 10;
    this.yaw = o.yaw ?? Math.PI;
    this.cd = 1.5;
    this.poise = 0;
    this.poiseMax = cfg.poise || 300;
    this.staggerCd = 0;
    this.stepAcc = 0;
    this.phaseN = 1;
    this.summonT = 20;
  }

  get kickable() {
    return this.alive && (this.state === 'stagger' || this.state === 'stunned') && this.st > 0.3;
  }

  get showBar() {
    return this.awake && !this.removed && this.state !== 'dormant' && this.state !== 'dead';
  }

  wake() {
    this.awake = true;
  }

  toChase(cd) {
    this.setState('chase');
    this.cd = cd * (this.phaseN >= 3 ? 0.7 : 1);
  }

  footsteps(dt, sp, every = 1.4, vol = 0.9) {
    this.stepAcc += dt * sp;
    if (this.stepAcc > every) {
      this.stepAcc = 0;
      const G = this.G;
      G.audio.heavyStep(this.pos, vol);
      const d = Math.hypot(G.player.pos.x - this.pos.x, G.player.pos.z - this.pos.z);
      G.fx.shake(clamp(0.2 - d * 0.008, 0, 0.2));
    }
  }

  // Golpe no chão: dano em área e poeira.
  impact(ix, iz, r = 2.9, dmg = 38, outer = 5, rings = 24) {
    const G = this.G,
      P = G.player;
    G.audio.slam({ x: ix, z: iz });
    G.fx.dust({ x: ix, y: 0.1, z: iz }, { x: 0, y: 1, z: 0 }, 26, [0.3, 0.26, 0.22]);
    G.fx.sparks({ x: ix, y: 0.1, z: iz }, { x: 0, y: 1, z: 0 }, 14);
    for (let i = 0; i < rings; i++) {
      const a = (i / rings) * Math.PI * 2;
      G.fx.norm.spawn(ix + Math.cos(a) * 0.8, 0.15, iz + Math.sin(a) * 0.8, Math.cos(a) * 6, 0.4, Math.sin(a) * 6, 0.6, 0.25, 0.7, 0.32, 0.28, 0.24, 0.6, 0, 3);
    }
    const d = Math.hypot(P.pos.x - ix, P.pos.z - iz);
    G.fx.shake(clamp(0.9 - d * 0.05, 0.2, 0.9));
    if (!P.dead && d < r) P.takeDamage(dmg, { x: ix, z: iz }, { knockdown: true });
    else if (!P.dead && d < outer) P.takeDamage(dmg * 0.25, { x: ix, z: iz }, {});
    G.level.meleeAt(ix, iz, r * 0.6);
  }

  throwAt(kind, from, speedK = 12, dmg = 22, lead = 0.7) {
    const G = this.G,
      P = G.player;
    const d = Math.hypot(P.pos.x - from.x, P.pos.z - from.z);
    const T = clamp(d / speedK, 0.6, 1.5);
    const tx = P.pos.x + P.vel.x * T * lead,
      tz = P.pos.z + P.vel.z * T * lead;
    _v2.set((tx - from.x) / T, (0.3 - from.y) / T + 0.5 * 9.8 * T, (tz - from.z) / T);
    if (kind === 'bile') G.proj.spawnBile(from, _v2, dmg);
    else if (kind === 'rock') G.proj.spawnRock(from, _v2, dmg);
    else G.proj.spawnMolten(from, _v2, dmg);
    G.audio.whoosh(0.8);
  }

  // Invoca infectados longe do jogador, dentro da arena.
  summon(defs) {
    const G = this.G,
      P = G.player,
      A = this.baseArena;
    const pts = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const x = A.x + Math.cos(a) * (A.r - 2),
        z = A.z + Math.sin(a) * (A.r - 2);
      if (!G.nav.isBlocked(x, z)) pts.push({ x, z, d: Math.hypot(x - P.pos.x, z - P.pos.z) });
    }
    pts.sort((a, b) => b.d - a.d);
    defs.forEach((k, i) => {
      const p = pts[i % Math.max(1, pts.length)];
      if (p) G.enemies.spawn(k, p.x + rand(-1, 1), p.z + rand(-1, 1), { idle: 'hunt' });
    });
  }

  clampArena() {
    const A = this.arena;
    const ax = this.pos.x - A.x,
      az = this.pos.z - A.z;
    const ad = Math.hypot(ax, az);
    if (ad > A.r - 1.2) {
      this.pos.x = A.x + (ax / ad) * (A.r - 1.2);
      this.pos.z = A.z + (az / ad) * (A.r - 1.2);
    }
  }

  damage(dmg, weak = false) {
    if (!this.alive) return;
    const G = this.G;
    this.hp -= dmg;
    this.poise += weak ? dmg : dmg * 0.5;
    if (weak && Math.random() < 0.4) G.audio.voice(this.pos, this.painVoice || 'bossPain', this.voicePitch || 1);
    if (this.hp <= 0) {
      this.die();
      return;
    }
    if (this.poise > this.poiseMax && this.staggerCd <= 0 && this.canStagger()) {
      this.poise = 0;
      this.staggerCd = 7;
      this.setState('stagger');
      G.audio.voice(this.pos, this.painVoice || 'bossPain', this.voicePitch || 1);
    }
  }

  canStagger() {
    return ['chase', 'slamWind', 'chargeWind', 'charge', 'throwWind', 'hookWind', 'swingWind'].includes(this.state);
  }

  onKick(dmg) {
    if (!this.alive) return;
    this.G.fx.shake(0.3);
    this.damage(dmg * (this.state === 'stagger' || this.state === 'stunned' ? 1 : 0.4));
  }

  onExplosion(dmg) {
    if (!this.awake) return;
    this.damage(dmg * 0.9);
  }

  onBurn(dmg) {
    if (!this.awake) return;
    this.damage(dmg * 0.5);
  }

  die() {
    if (!this.alive) return;
    const G = this.G;
    this.alive = false;
    this.hittable = false;
    this.setState('dying');
    G.audio.voice(this.pos, this.deathVoice || 'bossDeath', this.voicePitch || 1);
    G.stats.kills++;
    this.mgr.onDeath(this);
    // os infectados por perto caem junto (o Dr. Vidal derruba os da serra inteira)
    const R = this.killAll ? 1e9 : this.arena.r + 15;
    for (const e of this.mgr.list) if (e !== this && e.alive && !e.isBoss && Math.hypot(e.pos.x - this.pos.x, e.pos.z - this.pos.z) < R) e.onExplosion(9999, { x: 0, y: 0, z: 1 });
  }

  // Poses comuns de atordoado, morrendo e morto.
  poseStagger(R) {
    R.hipsY = -0.45;
    R.set('lHip', -1.5);
    R.set('lKnee', 1.5);
    R.set('rHip', 0.05);
    R.set('rKnee', 1.6);
    R.set('spine', 0.55 + Math.sin(this.st * 4) * 0.05, 0, Math.sin(this.st * 2) * 0.08);
    R.set('neck', 0.3);
    R.set('lSh', -0.8, 0, 0.3);
    R.set('rSh', -0.3);
  }

  poseDying(R, dt) {
    const G = this.G;
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
    if (Math.random() < 0.8) G.fx.embers({ x: this.pos.x, y: 1.5, z: this.pos.z }, 3, 0.8, 3);
    if (k > 2.4 && !this.thud) {
      this.thud = true;
      G.audio.slam(this.pos, 1.6);
      G.fx.shake(0.7);
      G.fx.dust({ x: this.pos.x + Math.sin(this.yaw) * 2, y: 0.2, z: this.pos.z + Math.cos(this.yaw) * 2 }, { x: 0, y: 1, z: 0 }, 30);
    }
    if (k > 4.0) this.setState('dead');
    void dt;
  }

  poseDead(R) {
    const G = this.G;
    R.bodyTilt = 1.35;
    R.bodyLift = 0.3;
    R.hipsY = -0.45;
    this.sink = Math.min(1.2, this.st * 0.4);
    if (Math.random() < 0.9) G.fx.dissolve(this.pos, 4, 1.0);
    if (this.st > 3.2) this.remove();
  }
}

// ======================================================================= O AÇOUGUEIRO
function buildButcher() {
  const h = new Humanoid({ scale: 1.7, build: 'heavy', armScale: 1.45, skin: 0xa88070, infected: true, shirt: 0xb8b0a0, pants: 0x2a2622, eyes: 0xff4a1a, sleeves: 'short', hair: 0x1a1512, hairStyle: 'bald', beard: 0x231a14, apron: 0x8a2a20, shards: 5 });
  const j = h.j;
  const P = h.part.bind(h);
  const metal = charMat(0x6a3a28, 'metal');
  const blood = charMat(0x5a1410, 'cloth');
  P(j.spine, BOX(0.42, 0.3, 0.03), blood, 0, 0.0, 0.13);
  P(j.hips, BOX(0.42, 0.42, 0.03), blood, 0, -0.25, 0.13);
  // ganchos cravados nas costas
  for (let i = 0; i < 4; i++) P(j.spine, CYL(0.012, 0.012, 0.3, 5), metal, -0.12 + i * 0.08, 0.45, -0.16, -0.6, 0, 0);
  // tumor no ventre (ponto fraco)
  h.core = P(j.spine, SPH(12, 10), charMat(0xff6a20, 'glow'), 0.0, 0.18, 0.16, 0, 0, 0, 0.09, 0.08, 0.05);
  h.core.castShadow = false;
  h.core.userData.keep = true;
  // cutelo na mão direita
  const cleaver = new THREE.Group();
  const handle = new THREE.Mesh(CYL(0.03, 0.032, 0.32), charMat(0x3a2a1c, 'leather'));
  handle.position.y = -0.1;
  const blade = new THREE.Mesh(BOX(0.04, 0.5, 0.34), charMat(0x8a8a8e, 'metal'));
  blade.position.set(0, -0.48, 0.1);
  for (const m of [handle, blade]) {
    m.castShadow = true;
    cleaver.add(m);
  }
  mergeByMaterial(cleaver);
  h.mountR.add(cleaver);
  // gancho com corrente na mão esquerda
  const hook = new THREE.Group();
  const hk = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.02, 5, 12, Math.PI * 1.3), charMat(0x6a6a70, 'metal'));
  hk.position.y = -0.2;
  hk.castShadow = true;
  hook.add(hk);
  h.mountL.add(hook);
  h.hook = hook;
  h.optimize();
  h.hitDefs.unshift({ part: 'core', a: j.spine, ao: V(0, 0.18, 0.18), r: 0.12, priority: 0.25 });
  return h;
}

export class Butcher extends BigBoss {
  constructor(G, x, z, o = {}) {
    super(G, x, z, o, { name: 'O Açougueiro', hp: 2600, radius: 0.85, height: 3.0, boundR: 3.8, mass: 10, poise: 280 });
    this.kind = 'butcher';
    this.rig = buildButcher();
    this.voicePitch = 0.85;
    this.coreLight = G.fx.lights.add({ x, y: 2.2, z, color: 0xff5a1a, intensity: 10, range: 6, flicker: 0.25, priority: 30 });
    // corrente do gancho
    this.chain = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1, 5), charMat(0x5a5a60, 'metal'));
    this.chain.visible = false;
    this.chain.castShadow = true;
    G.scene.add(this.chain);
    this.hookTip = new THREE.Vector3();
    G.scene.add(this.rig.root);
    this.setState('dormant');
    this.rig.resetPose();
    this.rig.snap();
    this.syncRig();
  }

  get speed() {
    return (this.phaseN === 1 ? 2.0 : 2.5) * this.G.diff.speed;
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
    this.poise = Math.max(0, this.poise - dt * 60);
    this.chain.visible = false;
    switch (this.state) {
      case 'dormant': {
        // cortando carne no balcão
        const k = (this.st % 1.1) / 1.1;
        const u = clamp(k < 0.6 ? k / 0.6 : 1 - (k - 0.6) / 0.1, 0, 1);
        R.set('rSh', -0.5 - u * 2.0, 0, 0.1);
        R.set('rEl', -0.5);
        R.set('lSh', -0.8, 0, -0.2);
        R.set('lEl', -1.0);
        R.set('spine', 0.45 - u * 0.2, 0, 0);
        rate = 14;
        if (k > 0.7 && !this.chopped) {
          this.chopped = true;
          if (tp.d < 40) G.audio.hit('wood', this.pos);
        }
        if (k < 0.5) this.chopped = false;
        if (this.awake) this.setState('intro');
        break;
      }
      case 'intro':
        this.yaw = dampAngle(this.yaw, tp.yaw, 2.5, dt);
        R.set('spine', -0.3, 0, 0);
        R.set('neck', -0.5);
        R.set('rSh', -2.6, 0, 0.2);
        R.set('lSh', -0.6, 0, 1.0);
        if (!this.roared && this.st > 0.8) {
          this.roared = true;
          G.audio.voice(this.pos, 'roar', 0.8);
          G.fx.shake(0.5);
        }
        if (this.st > 2.6) this.toChase(1.0);
        break;
      case 'chase': {
        if (P.dead) break;
        this.cd -= dt;
        this.summonT -= dt;
        if (this.phaseN === 1 && this.hp / this.maxHp < 0.5) {
          this.phaseN = 2;
          this.setState('summon');
          break;
        }
        if (this.phaseN === 2 && this.summonT <= 0 && this.mgr.aliveAdds() < 2) {
          this.setState('summon');
          break;
        }
        const d = tp.d;
        const facing = Math.abs(angleDiff(this.yaw, tp.yaw));
        if (this.cd <= 0) {
          const r = Math.random();
          if (d < 3.6 && facing < 0.9) {
            this.combo = this.phaseN === 2 ? 3 : 2;
            this.setState('swingWind');
            break;
          }
          if (d > 5 && d < 15 && r < 0.5 && facing < 0.6 && G.col.clear(this.pos.x, 1.5, this.pos.z, P.pos.x, 1.2, P.pos.z, 'bullet')) {
            this.setState('hookWind');
            break;
          }
          if (d > 6 && d < 18 && r < 0.8 && facing < 0.45) {
            this.setState('chargeWind');
            break;
          }
          this.cd = 0.4;
        }
        this.yaw = turnToward(this.yaw, tp.yaw, (this.phaseN === 2 ? 2.4 : 1.9) * dt);
        const sp = d > 2.6 ? this.speed : 0;
        vx = Math.sin(this.yaw) * sp;
        vz = Math.cos(this.yaw) * sp;
        this.phase += dt * sp * 2.7;
        R.gait(this.phase, Math.min(1, sp / 1.6), 0);
        R.add('spine', 0.2);
        R.add('rSh', -0.4);
        R.add('rEl', -0.6);
        this.footsteps(dt, sp, 1.3, 0.8);
        break;
      }
      case 'swingWind': {
        this.yaw = turnToward(this.yaw, tp.yaw, 2.6 * dt);
        const T = this.phaseN === 2 ? 0.45 : 0.6;
        const k = Math.min(1, this.st / (T * 0.85));
        R.set('rSh', -2.8 * k, 0, 0.5 * k);
        R.set('rEl', -0.5 * k);
        R.set('spine', -0.2 * k, -0.4 * k, 0);
        R.set('lSh', -0.7, 0, -0.3);
        if (this.st > T) {
          this.setState('swing');
          G.audio.whoosh(0.9);
          if (!P.dead && tp.d < 3.9 && Math.abs(angleDiff(this.yaw, tp.yaw)) < 1.1) P.takeDamage(22, this.pos, { knockdown: this.combo <= 1 });
          G.level.meleeAt(this.pos.x + Math.sin(this.yaw) * 2, this.pos.z + Math.cos(this.yaw) * 2, 1.4);
        }
        break;
      }
      case 'swing':
        R.set('rSh', -0.5, 0, -0.4);
        R.set('rEl', -0.2);
        R.set('spine', 0.5, 0.4, 0);
        rate = 22;
        if (this.st > 0.35) {
          this.combo--;
          if (this.combo > 0 && tp.d < 4.5) this.setState('swingWind');
          else this.toChase(0.8);
        }
        break;
      case 'hookWind':
        this.yaw = turnToward(this.yaw, tp.yaw, 3 * dt);
        R.set('lSh', 0.6, 0, 0.5);
        R.set('lEl', -1.2);
        R.set('spine', -0.15, 0.5, 0);
        if (this.st > 0.85) {
          this.setState('hook');
          this.hookT = 0;
          this.hookHit = false;
          this.hookDir = { x: Math.sin(this.yaw), z: Math.cos(this.yaw) };
          G.audio.chain(this.pos, 6, 0.05);
        }
        break;
      case 'hook': {
        // o gancho voa em linha reta; se pegar, puxa o jogador
        this.hookT += dt;
        R.set('lSh', -1.6, 0, 0.1);
        R.set('lEl', -0.1);
        R.set('spine', 0.1, -0.2, 0);
        const reach = Math.min(16, this.hookT * 26);
        this.rig.j.lHand.getWorldPosition(_v);
        if (!this.hookHit) {
          this.hookTip.set(_v.x + this.hookDir.x * reach, 1.2, _v.z + this.hookDir.z * reach);
          const hx = P.pos.x - this.hookTip.x,
            hz = P.pos.z - this.hookTip.z;
          if (!P.dead && Math.hypot(hx, hz) < 0.8) {
            this.hookHit = true;
            P.takeDamage(12, this.hookTip, {});
            G.audio.hit('flesh', P.pos);
            G.ui.msg('O gancho prendeu você!');
          }
          if (!G.col.clear(_v.x, 1.2, _v.z, this.hookTip.x, 1.2, this.hookTip.z, 'bullet')) this.hookT = 99;
        } else {
          // puxa
          const pdx = this.pos.x - P.pos.x,
            pdz = this.pos.z - P.pos.z;
          const pl = Math.hypot(pdx, pdz) || 1;
          if (pl > 2.6 && !P.dead) {
            P.knock.set((pdx / pl) * 9, 0, (pdz / pl) * 9);
            P.vel.set(0, 0, 0);
          }
          this.hookTip.set(P.pos.x, 1.2, P.pos.z);
        }
        // corrente
        const dx = this.hookTip.x - _v.x,
          dy = this.hookTip.y - _v.y,
          dz = this.hookTip.z - _v.z;
        const L = Math.hypot(dx, dy, dz) || 0.01;
        this.chain.visible = true;
        this.chain.position.set((_v.x + this.hookTip.x) / 2, (_v.y + this.hookTip.y) / 2, (_v.z + this.hookTip.z) / 2);
        this.chain.scale.set(1, L, 1);
        this.chain.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(dx / L, dy / L, dz / L));
        if ((this.hookHit && tp.d < 2.8) || this.hookT > 1.4) {
          if (this.hookHit) {
            this.combo = 1;
            this.setState('swingWind');
          } else this.toChase(0.6);
        }
        break;
      }
      case 'chargeWind':
        this.yaw = turnToward(this.yaw, tp.yaw, 3 * dt);
        R.set('spine', 0.55, 0, 0);
        R.set('lSh', 0.5, 0, 0.4);
        R.set('rSh', 0.5, 0, -0.4);
        R.set('neck', -0.4);
        if (this.st < 0.05) G.audio.voice(this.pos, 'roar', 1);
        if (this.st > 0.65) {
          this.chX = Math.sin(this.yaw);
          this.chZ = Math.cos(this.yaw);
          this.hitDone = false;
          this.setState('charge');
        }
        break;
      case 'charge': {
        const sp = 8.4 * G.diff.speed;
        vx = this.chX * sp;
        vz = this.chZ * sp;
        this.phase += dt * sp * 2.2;
        R.gait(this.phase, 1, 1);
        R.add('spine', 0.4);
        this.footsteps(dt, sp, 1.3, 0.8);
        if (!this.hitDone && !P.dead && tp.d < 2.0) {
          this.hitDone = true;
          P.takeDamage(30, this.pos, { knockdown: true });
        }
        if (this.st > 2.0) this.toChase(0.8);
        break;
      }
      case 'stunned':
        this.poseStagger(R);
        if (this.st > 2.8) this.toChase(0.6);
        break;
      case 'stagger':
        this.poseStagger(R);
        if (this.st > 3.0) this.toChase(0.5);
        break;
      case 'summon':
        R.set('spine', -0.4, 0, 0);
        R.set('neck', -0.55);
        R.set('lSh', -2.6, 0, 0.6);
        R.set('rSh', -2.6, 0, -0.6);
        if (!this.summoned && this.st > 0.6) {
          this.summoned = true;
          G.audio.voice(this.pos, 'roar', 0.9);
          G.fx.shake(0.4);
          this.summon(['dog', 'runner']);
        }
        if (this.st > 2.0) {
          this.summoned = false;
          this.summonT = 26;
          this.toChase(0.6);
        }
        break;
      case 'dying':
        this.poseDying(R, dt);
        rate = 4;
        break;
      case 'dead':
        this.poseDead(R);
        rate = 4;
        break;
    }
    if (this.removed) return;
    const px = this.pos.x,
      pz = this.pos.z;
    this.integrate(dt, vx, vz);
    if (this.state === 'charge' && this.st > 0.15) {
      const moved = (this.pos.x - px) * this.chX + (this.pos.z - pz) * this.chZ;
      if (moved < 8.4 * dt * 0.3) {
        this.setState('stunned');
        G.audio.slam(this.pos, 1.2);
        G.fx.shake(0.6);
        G.fx.dust({ x: this.pos.x + this.chX * 1.2, y: 1.5, z: this.pos.z + this.chZ * 1.2 }, { x: -this.chX, y: 0.5, z: -this.chZ }, 20);
        G.audio.voice(this.pos, 'bossPain', this.voicePitch);
      }
    }
    this.clampArena();
    R.apply(dt, rate);
    this.syncRig();
    const exposed = this.state === 'stagger' || this.state === 'stunned';
    const pulse = 0.8 + Math.sin(G.time * 6) * 0.2;
    this.rig.core.scale.set(0.09 * pulse * (exposed ? 1.3 : 1), 0.08 * pulse * (exposed ? 1.3 : 1), 0.05);
    this.rig.core.getWorldPosition(_v);
    this.coreLight.x = _v.x;
    this.coreLight.y = _v.y;
    this.coreLight.z = _v.z;
    this.coreLight.intensity = (exposed ? 26 : 10) * pulse * (this.alive ? 1 : 0.3);
  }

  onHit(h) {
    if (!this.alive || this.state === 'dormant' || this.state === 'intro') return;
    const exposed = this.state === 'stagger' || this.state === 'stunned';
    let mult = h.part === 'core' ? 2.2 : h.part === 'head' ? 1.3 : h.part === 'body' ? 0.5 : 0.35;
    if (h.part === 'core' && h.weapon === 'shotgun') mult = 1.5;
    if (exposed) mult *= 1.5;
    if (h.weapon === 'knife') mult *= 0.6;
    this.damage(h.dmg * mult, h.part === 'core');
  }

  remove() {
    if (this.removed) return;
    super.remove();
    this.G.fx.lights.remove(this.coreLight);
    this.G.scene.remove(this.chain);
  }
}

// ======================================================================= O COLOSSO
function buildColossus() {
  const h = new Humanoid({ scale: 2.35, build: 'heavy', armScale: 1.7, skin: 0x7a5a4a, infected: true, shirt: 0x5a5034, pants: 0x3a3428, eyes: 0xff8a1a, sleeves: 'short', hairStyle: 'bald', shards: 5 });
  const j = h.j;
  const P = h.part.bind(h);
  const plate = charMat(0xb08a1a, 'metal');
  const dark = charMat(0x3a2a1a, 'metal');
  // chapas amarelas da escavadeira fundidas ao corpo
  P(j.spine, BOX(0.5, 0.42, 0.06), plate, 0, 0.32, 0.15, 0.1);
  P(j.lSh, BOX(0.24, 0.12, 0.28), plate, 0.04, 0.03, 0, 0, 0, 0.4);
  P(j.rSh, BOX(0.24, 0.12, 0.28), plate, -0.04, 0.03, 0, 0, 0, -0.4);
  P(j.head, BOX(0.24, 0.08, 0.26), plate, 0, 0.24, 0.0);
  P(j.lEl, BOX(0.12, 0.3, 0.12), dark, 0, -0.18, 0);
  // braço direito termina numa pá
  P(j.rHand, BOX(0.34, 0.06, 0.3), plate, 0, -0.12, 0.08, 0.3);
  for (let i = 0; i < 4; i++) P(j.rHand, CONE(0.03, 0.1, 4), dark, -0.12 + i * 0.08, -0.13, 0.25, Math.PI / 2);
  // pontos fracos: joelhos e costas
  const glow = charMat(0xff8a2a, 'glow');
  h.kneeL = P(j.lKnee, SPH(10, 8), glow, 0, 0.0, 0.07, 0, 0, 0, 0.075, 0.075, 0.05);
  h.kneeR = P(j.rKnee, SPH(10, 8), glow, 0, 0.0, 0.07, 0, 0, 0, 0.075, 0.075, 0.05);
  h.core = P(j.spine, SPH(12, 10), glow, 0, 0.35, -0.15, 0, 0, 0, 0.12, 0.13, 0.07);
  for (const m of [h.kneeL, h.kneeR, h.core]) {
    m.castShadow = false;
    m.userData.keep = true;
  }
  h.optimize();
  h.hitDefs.unshift(
    { part: 'tumor', a: j.lKnee, ao: V(0, 0, 0.07), r: 0.09, priority: 0.2, side: 'L' },
    { part: 'tumor', a: j.rKnee, ao: V(0, 0, 0.07), r: 0.09, priority: 0.2, side: 'R' },
    { part: 'core', a: j.spine, ao: V(0, 0.35, -0.17), r: 0.13, priority: 0.25 },
  );
  return h;
}

export class Colossus extends BigBoss {
  constructor(G, x, z, o = {}) {
    super(G, x, z, o, { name: 'O Colosso', hp: 4200, radius: 1.15, height: 4.2, boundR: 5.2, mass: 20, poise: 99999 });
    this.kind = 'colossus';
    this.rig = buildColossus();
    this.voicePitch = 0.65;
    this.knees = { L: 380 * G.diff.hp, R: 380 * G.diff.hp };
    this.kneeMax = 380 * G.diff.hp;
    this.light = G.fx.lights.add({ x, y: 2.5, z, color: 0xff7a2a, intensity: 14, range: 8, flicker: 0.2, priority: 30 });
    G.scene.add(this.rig.root);
    this.setState('dormant');
    this.rig.resetPose();
    this.rig.snap();
    this.syncRig();
  }

  get kickable() {
    return false;
  }

  get speed() {
    return (this.phaseN === 1 ? 1.6 : 2.0) * this.G.diff.speed;
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
      rate = 7;
    switch (this.state) {
      case 'dormant':
        // cavando a encosta com a pá
        R.set('spine', 0.6 + Math.sin(this.st * 1.2) * 0.1, 0, 0);
        R.set('rSh', -1.2 - Math.sin(this.st * 1.2) * 0.6, 0, 0.2);
        R.set('lSh', -0.4, 0, 0.3);
        if (this.awake) this.setState('intro');
        break;
      case 'intro':
        this.yaw = dampAngle(this.yaw, tp.yaw, 1.5, dt);
        R.set('spine', -0.35, 0, 0);
        R.set('neck', -0.5);
        R.set('lSh', -0.5, 0, 1.0);
        R.set('rSh', -0.5, 0, -1.0);
        if (!this.roared && this.st > 0.9) {
          this.roared = true;
          G.audio.voice(this.pos, 'roar', 0.55);
          G.fx.shake(0.8);
        }
        if (this.st > 3.0) this.toChase(1.0);
        break;
      case 'chase': {
        if (P.dead) break;
        this.cd -= dt;
        if (this.phaseN === 1 && this.hp / this.maxHp < 0.5) {
          this.phaseN = 2;
          G.audio.voice(this.pos, 'roar', 0.6);
        }
        const d = tp.d;
        const facing = Math.abs(angleDiff(this.yaw, tp.yaw));
        if (this.cd <= 0) {
          const r = Math.random();
          if (d < 4.5 && facing < 0.9) {
            this.setState(r < 0.5 ? 'slamWind' : 'sweepWind');
            break;
          }
          if (d < 9 && r < 0.45) {
            this.setState('poundWind');
            break;
          }
          if (d > 8 && d < 26 && r < 0.75) {
            this.setState('throwWind');
            break;
          }
          this.cd = 0.4;
        }
        this.yaw = turnToward(this.yaw, tp.yaw, 1.5 * dt);
        const sp = d > 3.5 ? this.speed : 0;
        vx = Math.sin(this.yaw) * sp;
        vz = Math.cos(this.yaw) * sp;
        this.phase += dt * sp * 2.0;
        R.gait(this.phase, Math.min(1, sp / 1.4), 0);
        R.add('spine', 0.2);
        this.footsteps(dt, sp, 1.6, 1.1);
        break;
      }
      case 'slamWind': {
        this.yaw = turnToward(this.yaw, tp.yaw, 1.3 * dt);
        const k = Math.min(1, this.st / 0.9);
        R.set('rSh', -2.9 * k, 0, 0.3 * k);
        R.set('lSh', -2.7 * k, 0, -0.3 * k);
        R.set('spine', -0.35 * k, 0, 0);
        if (this.st > 1.05) {
          this.setState('slam');
          this.impact(this.pos.x + Math.sin(this.yaw) * 3.2, this.pos.z + Math.cos(this.yaw) * 3.2, 3.2, 42, 6);
        }
        break;
      }
      case 'slam':
        R.set('rSh', -0.7, 0, 0.25);
        R.set('lSh', -0.7, 0, -0.25);
        R.set('spine', 0.75, 0, 0);
        rate = 18;
        if (this.st > 1.0) this.toChase(0.7);
        break;
      case 'sweepWind': {
        this.yaw = turnToward(this.yaw, tp.yaw, 1.2 * dt);
        const k = Math.min(1, this.st / 0.75);
        R.set('spine', 0.1, 1.1 * k, 0);
        R.set('rSh', -1.4 * k, 0, -1.2 * k);
        if (this.st > 0.85) {
          this.setState('sweep');
          G.audio.whoosh(1);
          if (!P.dead && tp.d < 5.4 && Math.abs(angleDiff(this.yaw, tp.yaw)) < 1.5) P.takeDamage(30, this.pos, { knockdown: true });
        }
        break;
      }
      case 'sweep':
        R.set('spine', 0.2, -1.1, 0);
        R.set('rSh', -1.5, 0, 0.9);
        rate = 18;
        if (this.st > 0.8) this.toChase(0.6);
        break;
      case 'poundWind': {
        // pula e cai: onda de choque em anel
        const k = Math.min(1, this.st / 0.9);
        R.hipsY = -0.35 * k;
        R.set('lHip', -1.0 * k);
        R.set('rHip', -1.0 * k);
        R.set('lKnee', 1.4 * k);
        R.set('rKnee', 1.4 * k);
        R.set('lSh', -2.8 * k);
        R.set('rSh', -2.8 * k);
        if (this.st > 1.0) {
          this.setState('pound');
          this.ring = { r: 0, hit: false };
          this.impact(this.pos.x, this.pos.z, 3.5, 30, 3.5, 40);
        }
        break;
      }
      case 'pound': {
        R.hipsY = -0.25;
        R.set('spine', 0.6, 0, 0);
        R.set('lSh', -0.5);
        R.set('rSh', -0.5);
        // anel que se expande: só dá para escapar ficando longe ou atrás de pedras
        const ring = this.ring;
        ring.r += dt * 12;
        if (Math.random() < 0.9) {
          for (let i = 0; i < 6; i++) {
            const a = rand(0, Math.PI * 2);
            G.fx.dust({ x: this.pos.x + Math.cos(a) * ring.r, y: 0.1, z: this.pos.z + Math.sin(a) * ring.r }, { x: 0, y: 1, z: 0 }, 1, [0.35, 0.3, 0.25]);
          }
        }
        if (!ring.hit && !P.dead && Math.abs(tp.d - ring.r) < 0.9 && ring.r < 12) {
          ring.hit = true;
          if (G.col.clear(this.pos.x, 0.6, this.pos.z, P.pos.x, 0.6, P.pos.z, 'bullet')) P.takeDamage(18, this.pos, { knockdown: true });
        }
        if (this.st > 1.2) this.toChase(0.8);
        break;
      }
      case 'throwWind':
        this.yaw = turnToward(this.yaw, tp.yaw, 2 * dt);
        R.set('rSh', 0.6, 0, -0.4);
        R.set('rEl', -1.4);
        R.set('spine', -0.2, -0.5, 0);
        if (this.st > 0.9) {
          this.rig.j.rHand.getWorldPosition(_v);
          this.throwAt('molten', _v, 13, 26, 0.6);
          if (this.phaseN === 2) {
            const yaw0 = this.yaw;
            for (const s of [-0.35, 0.35]) {
              this.yaw = yaw0 + s;
              this.throwAt('rock', _v, 13, 18, 0.3);
            }
            this.yaw = yaw0;
          }
          this.setState('throw');
        }
        break;
      case 'throw':
        R.set('rSh', -2.2, 0, -0.2);
        R.set('spine', 0.35, 0.4, 0);
        rate = 16;
        if (this.st > 0.7) this.toChase(0.6);
        break;
      case 'kneel':
        // os dois joelhos quebrados: cai e expõe as costas
        R.hipsY = -0.55;
        R.set('lHip', -0.2);
        R.set('rHip', -0.2);
        R.set('lKnee', 1.7);
        R.set('rKnee', 1.7);
        R.set('spine', 0.9 + Math.sin(this.st * 3) * 0.05, 0, 0);
        R.set('neck', 0.4);
        R.set('lSh', -1.2, 0, 0.3);
        R.set('rSh', -1.2, 0, -0.3);
        if (this.st > 7) {
          this.knees.L = this.knees.R = this.kneeMax * 0.6;
          G.audio.voice(this.pos, 'roar', 0.6);
          this.toChase(0.5);
        }
        break;
      case 'dying':
        this.poseDying(R, dt);
        rate = 3;
        break;
      case 'dead':
        this.poseDead(R);
        rate = 3;
        break;
    }
    if (this.removed) return;
    this.integrate(dt, vx, vz);
    this.clampArena();
    R.apply(dt, rate);
    this.syncRig();
    const pulse = 0.8 + Math.sin(G.time * 5) * 0.2;
    const kl = this.knees.L > 0 ? 1 : 0.3,
      kr = this.knees.R > 0 ? 1 : 0.3;
    this.rig.kneeL.scale.set(0.075 * pulse * kl, 0.075 * pulse * kl, 0.05);
    this.rig.kneeR.scale.set(0.075 * pulse * kr, 0.075 * pulse * kr, 0.05);
    const exposed = this.state === 'kneel';
    this.rig.core.scale.set(0.12 * pulse * (exposed ? 1.4 : 1), 0.13 * pulse * (exposed ? 1.4 : 1), 0.07);
    this.rig.core.getWorldPosition(_v);
    this.light.x = _v.x;
    this.light.y = _v.y;
    this.light.z = _v.z;
    this.light.intensity = (exposed ? 30 : 14) * pulse * (this.alive ? 1 : 0.3);
  }

  onHit(h) {
    if (!this.alive || this.state === 'dormant' || this.state === 'intro') return;
    const G = this.G;
    const exposed = this.state === 'kneel';
    if (h.part === 'tumor' && !exposed) {
      // joelho atingido: decide qual pelo ponto mais próximo
      const P = G.player;
      this.rig.kneeL.getWorldPosition(_v);
      this.rig.kneeR.getWorldPosition(_v2);
      const side = _v.distanceToSquared(P.aimPoint) < _v2.distanceToSquared(P.aimPoint) ? 'L' : 'R';
      const other = side === 'L' ? 'R' : 'L';
      const k = this.knees[side] > 0 ? side : other;
      this.knees[k] -= h.dmg * (h.weapon === 'knife' ? 0.6 : 1.6);
      this.damage(h.dmg * 0.8, true);
      G.fx.sparks(k === 'L' ? _v : _v2, { x: 0, y: 1, z: 0 }, 10, [1, 0.55, 0.2]);
      if (this.alive && this.knees.L <= 0 && this.knees.R <= 0 && this.state !== 'kneel') {
        this.setState('kneel');
        G.audio.voice(this.pos, 'bossPain', 0.6);
        G.fx.shake(0.6);
        G.audio.slam(this.pos, 1.4);
        G.ui.msg('Os joelhos cederam! Acerte as costas!', true);
      }
      return;
    }
    let mult = h.part === 'core' ? (exposed ? 3.2 : 1.4) : h.part === 'head' ? 0.7 : h.part === 'tumor' ? 1.2 : 0.3;
    if (h.weapon === 'knife') mult *= exposed ? 1.4 : 0.5;
    this.damage(h.dmg * mult, h.part === 'core');
  }

  onKick(dmg) {
    if (!this.alive) return;
    this.damage(dmg * (this.state === 'kneel' ? 1 : 0.2));
  }

  remove() {
    if (this.removed) return;
    super.remove();
    this.G.fx.lights.remove(this.light);
  }
}

// ======================================================================= DR. VIDAL
function buildVidal() {
  const h = new Humanoid({ scale: 1.15, build: 'thin', armScale: 1.1, skin: 0xb8a090, infected: true, shirt: 0xd8d8d0, shirtKind: 'cloth', pants: 0x2a2a30, eyes: 0xffa020, hair: 0x9a9690, hairStyle: 'short', longSleeves: true, shards: 2 });
  const j = h.j;
  const P = h.part.bind(h);
  // jaleco
  P(j.spine, BOX(0.38, 0.62, 0.21), charMat(0xd8d8d0), 0, 0.22, 0);
  P(j.hips, cached('vidalCoat', () => new THREE.CylinderGeometry(0.19, 0.27, 0.6, 10, 1, true)), charMat(0xd8d8d0, 'dress'), 0, -0.3, 0);
  // óculos
  P(j.head, BOX(0.15, 0.03, 0.02), charMat(0x101010, 'metal'), 0, 0.12, 0.115);
  // veias brilhando e espinhos (crescem nas fases 2 e 3)
  const glow = charMat(0xff8a2a, 'glow');
  h.veins = [];
  for (const [jn, x, y, z, sx, sy] of [
    [j.spine, 0.08, 0.3, 0.115, 0.02, 0.4],
    [j.spine, -0.1, 0.25, 0.115, 0.02, 0.32],
    [j.neck, 0.03, 0.02, 0.05, 0.015, 0.1],
    [j.lEl, 0.03, -0.12, 0.04, 0.012, 0.2],
    [j.rEl, -0.03, -0.12, 0.04, 0.012, 0.2],
  ]) {
    const m = P(jn, BOX(sx, sy, 0.01), glow, x, y, z);
    m.castShadow = false;
    h.veins.push(m);
  }
  const metal = charMat(0x4a2a1a, 'metal');
  h.spikes = new THREE.Group();
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Mesh(CONE(0.05, 0.4, 4), metal);
    s.position.set(-0.2 + (i % 3) * 0.2, 0.2 + Math.floor(i / 3) * 0.18, -0.14);
    s.rotation.x = -1.0 - (i % 2) * 0.3;
    s.castShadow = true;
    h.spikes.add(s);
  }
  mergeByMaterial(h.spikes);
  h.spikes.visible = false;
  j.spine.add(h.spikes);
  h.core = P(j.spine, SPH(12, 10), glow, 0, 0.42, 0.13, 0, 0, 0, 0.07, 0.07, 0.04);
  h.core.castShadow = false;
  h.core.userData.keep = true;
  h.optimize();
  h.hitDefs.unshift({ part: 'core', a: j.spine, ao: V(0, 0.42, 0.15), r: 0.1, priority: 0.25 });
  return h;
}

export class Vidal extends BigBoss {
  constructor(G, x, z, o = {}) {
    super(G, x, z, o, { name: 'Dr. Augusto Vidal', hp: 5200, radius: 0.5, height: 2.1, boundR: 2.8, mass: 6, poise: 260 });
    this.kind = 'vidal';
    this.killAll = true;
    this.rig = buildVidal();
    this.size = 1;
    this.sizeT = 1;
    this.voicePitch = 1.2;
    this.painVoice = 'bossPain';
    this.light = G.fx.lights.add({ x, y: 2, z, color: 0xff8a2a, intensity: 10, range: 7, flicker: 0.25, priority: 30 });
    this.blinkCd = 3;
    this.rainT = 0;
    this.summonT = 14;
    this.heart = o.heart || { x: this.arena.x, z: this.arena.z };
    G.scene.add(this.rig.root);
    this.setState('dormant');
    this.rig.resetPose();
    this.rig.snap();
    this.syncRig();
  }

  get speed() {
    return (this.phaseN === 1 ? 2.6 : this.phaseN === 2 ? 2.2 : 0.8) * this.G.diff.speed;
  }

  get kickable() {
    return this.alive && this.phaseN === 1 && this.state === 'stagger' && this.st > 0.3;
  }

  setSize(s) {
    this.sizeT = s;
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
    if (this.staggerCd > 0) this.staggerCd -= dt;
    this.poise = Math.max(0, this.poise - dt * 50);
    // crescimento suave entre fases
    if (Math.abs(this.size - this.sizeT) > 0.001) {
      this.size += (this.sizeT - this.size) * Math.min(1, dt * 1.2);
      const s = 1.15 * this.size;
      R.root.scale.setScalar(s);
      R.s = s;
      this.radius = 0.5 * this.size;
      this.height = 2.1 * this.size;
      this.boundR = 2.8 * this.size;
    }
    switch (this.state) {
      case 'dormant':
        // de costas, olhando o alto-forno
        R.set('neck', -0.3, Math.sin(this.st * 0.5) * 0.2, 0);
        R.set('lSh', -0.3, 0, 0.3);
        R.set('rSh', -1.2, 0, -0.2);
        R.set('rEl', -1.2);
        if (this.awake) this.setState('intro');
        break;
      case 'intro':
        this.yaw = dampAngle(this.yaw, tp.yaw, 2, dt);
        R.set('spine', -0.1, 0, 0);
        R.set('lSh', -0.5, 0, 1.0);
        R.set('rSh', -0.5, 0, -1.0);
        R.set('lEl', -0.6);
        R.set('rEl', -0.6);
        if (!this.roared && this.st > 1.0) {
          this.roared = true;
          G.audio.voice(this.pos, 'vidal', 1.1);
        }
        if (this.st > 3.0) this.toChase(0.8);
        break;
      case 'chase': {
        if (P.dead) break;
        this.cd -= dt;
        this.summonT -= dt;
        this.blinkCd -= dt;
        const frac = this.hp / this.maxHp;
        if (this.phaseN === 1 && frac < 0.66) {
          this.setState('transform');
          this.nextPhase = 2;
          break;
        }
        if (this.phaseN === 2 && frac < 0.33) {
          this.setState('transform');
          this.nextPhase = 3;
          break;
        }
        if (this.summonT <= 0 && this.mgr.aliveAdds() < 3) {
          this.setState('summon');
          break;
        }
        const d = tp.d;
        const facing = Math.abs(angleDiff(this.yaw, tp.yaw));
        if (this.phaseN === 3) {
          // preso ao alto-forno: varre, chove ferro e invoca
          this.yaw = turnToward(this.yaw, tp.yaw, 1.1 * dt);
          this.rainT -= dt;
          if (this.rainT <= 0) {
            this.rainT = 4.5;
            this.setState('rain');
            break;
          }
          if (this.cd <= 0) {
            if (d < 7.5 && facing < 1.2) this.setState('sweepWind');
            else if (d < 26) this.setState('throwWind');
            this.cd = 0.6;
            break;
          }
          R.set('spine', 0.1 + Math.sin(G.time * 2) * 0.05, 0, 0);
          R.set('lSh', -0.4, 0, 0.6);
          R.set('rSh', -0.4, 0, -0.6);
          break;
        }
        if (this.cd <= 0) {
          const r = Math.random();
          if (this.phaseN === 1 && this.blinkCd <= 0 && (d < 3 || r < 0.25)) {
            this.blink();
            break;
          }
          if (d < 3.2 * this.size && facing < 0.9) {
            this.setState(this.phaseN === 2 ? 'slamWind' : 'clawWind');
            break;
          }
          if (d > 5 && d < 20 && r < 0.5) {
            this.setState('throwWind');
            break;
          }
          if (this.phaseN === 2 && d > 6 && d < 18 && r < 0.75 && facing < 0.5) {
            this.setState('chargeWind');
            break;
          }
          this.cd = 0.35;
        }
        this.yaw = turnToward(this.yaw, tp.yaw, (this.phaseN === 1 ? 3.5 : 2.2) * dt);
        const sp = d > 2.4 * this.size ? this.speed : 0;
        vx = Math.sin(this.yaw) * sp;
        vz = Math.cos(this.yaw) * sp;
        this.phase += dt * sp * (this.phaseN === 1 ? 4 : 2.6);
        R.gait(this.phase, Math.min(1, sp / 1.5), this.phaseN === 1 ? 0.5 : 0);
        R.add('spine', 0.15);
        if (this.phaseN === 2) this.footsteps(dt, sp, 1.4, 0.8);
        break;
      }
      case 'clawWind': {
        this.yaw = turnToward(this.yaw, tp.yaw, 4 * dt);
        const k = Math.min(1, this.st / 0.35);
        R.set('rSh', -2.0 * k, 0, 0.8 * k);
        R.set('spine', -0.1, -0.4 * k, 0);
        if (this.st > 0.4) {
          this.setState('claw');
          G.audio.whoosh(0.7);
          if (!P.dead && tp.d < 2.6 && Math.abs(angleDiff(this.yaw, tp.yaw)) < 1.0) P.takeDamage(18, this.pos, {});
        }
        break;
      }
      case 'claw':
        R.set('rSh', -1.0, 0, -0.8);
        R.set('spine', 0.3, 0.4, 0);
        rate = 22;
        if (this.st > 0.35) this.toChase(0.5);
        break;
      case 'slamWind': {
        this.yaw = turnToward(this.yaw, tp.yaw, 1.6 * dt);
        const k = Math.min(1, this.st / 0.8);
        R.set('rSh', -2.9 * k, 0, 0.3 * k);
        R.set('lSh', -2.7 * k, 0, -0.3 * k);
        R.set('spine', -0.35 * k, 0, 0);
        if (this.st > 0.9) {
          this.setState('slam');
          this.impact(this.pos.x + Math.sin(this.yaw) * 2.6, this.pos.z + Math.cos(this.yaw) * 2.6, 3.0, 36, 5.5);
        }
        break;
      }
      case 'slam':
        R.set('rSh', -0.7, 0, 0.25);
        R.set('lSh', -0.7, 0, -0.25);
        R.set('spine', 0.75, 0, 0);
        rate = 20;
        if (this.st > 0.9) this.toChase(0.6);
        break;
      case 'sweepWind': {
        const k = Math.min(1, this.st / 0.8);
        R.set('spine', 0.1, 1.0 * k, 0);
        R.set('rSh', -1.4 * k, 0, -1.2 * k);
        R.set('lSh', -1.3 * k, 0, -0.4 * k);
        if (this.st > 0.9) {
          this.setState('sweep');
          G.audio.whoosh(1);
          if (!P.dead && tp.d < 8 && Math.abs(angleDiff(this.yaw, tp.yaw)) < 1.4) P.takeDamage(28, this.pos, { knockdown: true });
        }
        break;
      }
      case 'sweep':
        R.set('spine', 0.2, -1.0, 0);
        R.set('rSh', -1.5, 0, 0.9);
        rate = 18;
        if (this.st > 0.8) this.toChase(0.8);
        break;
      case 'chargeWind':
        this.yaw = turnToward(this.yaw, tp.yaw, 3 * dt);
        R.set('spine', 0.55, 0, 0);
        R.set('lSh', 0.5, 0, 0.4);
        R.set('rSh', 0.5, 0, -0.4);
        if (this.st > 0.6) {
          this.chX = Math.sin(this.yaw);
          this.chZ = Math.cos(this.yaw);
          this.hitDone = false;
          this.setState('charge');
        }
        break;
      case 'charge': {
        const sp = 8 * G.diff.speed;
        vx = this.chX * sp;
        vz = this.chZ * sp;
        this.phase += dt * sp * 2.2;
        R.gait(this.phase, 1, 1);
        R.add('spine', 0.4);
        if (!this.hitDone && !P.dead && tp.d < 2.0) {
          this.hitDone = true;
          P.takeDamage(30, this.pos, { knockdown: true });
        }
        if (this.st > 1.8) this.toChase(0.8);
        break;
      }
      case 'throwWind':
        this.yaw = turnToward(this.yaw, tp.yaw, 3 * dt);
        R.set('rSh', 0.6, 0, -0.4);
        R.set('rEl', -1.4);
        R.set('spine', -0.15, -0.5, 0);
        if (this.st > (this.phaseN === 1 ? 0.55 : 0.8)) {
          this.rig.j.rHand.getWorldPosition(_v);
          this.throwAt(this.phaseN === 1 ? 'bile' : 'molten', _v, 13, this.phaseN === 1 ? 12 : 22, 0.7);
          this.setState('throw');
        }
        break;
      case 'throw':
        R.set('rSh', -2.2, 0, -0.2);
        R.set('spine', 0.35, 0.4, 0);
        rate = 18;
        if (this.st > 0.5) this.toChase(this.phaseN === 1 ? 0.5 : 0.8);
        break;
      case 'rain': {
        // ferro derretido caindo do teto, perto do jogador
        R.set('spine', -0.5, 0, 0);
        R.set('lSh', -2.8, 0, 0.5);
        R.set('rSh', -2.8, 0, -0.5);
        if (!this.rained && this.st > 0.6) {
          this.rained = true;
          G.audio.voice(this.pos, 'vidal', 0.9);
          for (let i = 0; i < 5; i++) {
            const a = rand(0, Math.PI * 2),
              r = i === 0 ? 0 : rand(2, 7);
            _v.set(P.pos.x + Math.cos(a) * r, 18, P.pos.z + Math.sin(a) * r);
            _v2.set(0, -2, 0);
            G.proj.spawnMolten(_v, _v2, 20);
          }
        }
        if (this.st > 1.6) {
          this.rained = false;
          this.toChase(0.6);
        }
        break;
      }
      case 'summon':
        R.set('spine', -0.4, 0, 0);
        R.set('neck', -0.55);
        R.set('lSh', -2.6, 0, 0.6);
        R.set('rSh', -2.6, 0, -0.6);
        if (!this.summoned && this.st > 0.6) {
          this.summoned = true;
          G.audio.voice(this.pos, 'vidal', 1.0);
          this.summon(this.phaseN === 1 ? ['stalker', 'runner'] : this.phaseN === 2 ? ['burner', 'runner', 'spitter'] : ['brute', 'runner', 'screamer']);
        }
        if (this.st > 2.0) {
          this.summoned = false;
          this.summonT = this.phaseN === 3 ? 22 : 28;
          this.toChase(0.6);
        }
        break;
      case 'transform': {
        // a Ferrugem toma conta: cresce, espinhos, veias
        R.set('spine', -0.5 + Math.sin(this.st * 20) * 0.06, Math.sin(this.st * 13) * 0.1, 0);
        R.set('neck', -0.7);
        R.set('lSh', -0.8, 0, 1.4);
        R.set('rSh', -0.8, 0, -1.4);
        R.set('lEl', -0.8);
        R.set('rEl', -0.8);
        if (!this.grew && this.st > 0.5) {
          this.grew = true;
          G.audio.voice(this.pos, 'roar', this.nextPhase === 2 ? 0.9 : 0.6);
          G.fx.shake(0.8);
          G.fx.explosion({ x: this.pos.x, y: 1, z: this.pos.z }, 3);
          this.setSize(this.nextPhase === 2 ? 1.75 : 2.6);
          this.rig.spikes.visible = true;
          for (const v of this.rig.veins) v.scale.multiplyScalar(1.6);
          if (this.nextPhase === 3) {
            this.arena = { x: this.heart.x, z: this.heart.z, r: 4 };
            G.ui.msg('Vidal se fundiu ao alto-forno. Acerte o coração no peito dele!', true);
          }
          this.voicePitch = this.nextPhase === 2 ? 0.85 : 0.6;
          this.poiseMax = this.nextPhase === 2 ? 420 : 99999;
        }
        if (this.st > 3.0) {
          this.phaseN = this.nextPhase;
          this.grew = false;
          this.summonT = 8;
          this.toChase(1.0);
        }
        break;
      }
      case 'stagger':
        this.poseStagger(R);
        if (this.st > 2.6) this.toChase(0.5);
        break;
      case 'dying':
        this.poseDying(R, dt);
        rate = 4;
        break;
      case 'dead':
        this.poseDead(R);
        rate = 4;
        break;
    }
    if (this.removed) return;
    const px = this.pos.x,
      pz = this.pos.z;
    if (this.phaseN === 3 && this.state !== 'dying' && this.state !== 'dead') {
      // fica no centro, junto ao alto-forno
      this.pos.x += (this.arena.x - this.pos.x) * Math.min(1, dt * 2);
      this.pos.z += (this.arena.z - this.pos.z) * Math.min(1, dt * 2);
      vx = vz = 0;
    }
    this.integrate(dt, vx, vz);
    if (this.state === 'charge' && this.st > 0.15) {
      const moved = (this.pos.x - px) * this.chX + (this.pos.z - pz) * this.chZ;
      if (moved < 8 * dt * 0.3) {
        this.setState('stagger');
        G.audio.slam(this.pos, 1.1);
        G.fx.shake(0.5);
      }
    }
    this.clampArena();
    R.apply(dt, rate);
    this.syncRig();
    const pulse = 0.8 + Math.sin(G.time * (4 + this.phaseN * 2)) * 0.2;
    const exposed = this.state === 'stagger' || this.phaseN === 3;
    this.rig.core.scale.set(0.07 * pulse * (exposed ? 1.5 : 1), 0.07 * pulse * (exposed ? 1.5 : 1), 0.04);
    this.rig.core.getWorldPosition(_v);
    this.light.x = _v.x;
    this.light.y = _v.y;
    this.light.z = _v.z;
    this.light.intensity = (10 + this.phaseN * 8) * pulse * (this.alive ? 1 : 0.3);
  }

  // Fase 1: some num clarão e reaparece de lado.
  blink() {
    const G = this.G,
      P = G.player;
    this.blinkCd = rand(4, 6);
    G.fx.dissolve(this.pos, 10, 2);
    for (let i = 0; i < 10; i++) {
      const a = rand(0, Math.PI * 2),
        r = rand(5, 9);
      const x = P.pos.x + Math.cos(a) * r,
        z = P.pos.z + Math.sin(a) * r;
      const A = this.arena;
      if (Math.hypot(x - A.x, z - A.z) > A.r - 2 || G.nav.isBlocked(x, z)) continue;
      this.pos.x = x;
      this.pos.z = z;
      break;
    }
    G.fx.dissolve(this.pos, 10, 2);
    G.audio.whoosh(0.9);
    this.toChase(0.3);
  }

  canStagger() {
    return this.phaseN < 3 && super.canStagger();
  }

  onHit(h) {
    if (!this.alive || this.state === 'dormant' || this.state === 'intro' || this.state === 'transform') return;
    const exposed = this.state === 'stagger';
    let mult;
    if (this.phaseN === 3) mult = h.part === 'core' ? 2.4 : 0.25;
    else mult = h.part === 'core' ? 2.0 : h.part === 'head' ? (this.phaseN === 1 ? 1.8 : 1.2) : h.part === 'body' ? 0.55 : 0.4;
    if (exposed) mult *= 1.5;
    if (h.weapon === 'knife') mult *= 0.7;
    this.damage(h.dmg * mult, h.part === 'core' || h.part === 'head');
  }

  remove() {
    if (this.removed) return;
    super.remove();
    this.G.fx.lights.remove(this.light);
  }
}

registerKind('butcher', Butcher);
registerKind('colossus', Colossus);
registerKind('vidal', Vidal);

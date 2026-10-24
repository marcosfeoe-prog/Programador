// Dinossauros vivos no mapa: inteligência (visão, audição, faro de tiros), estados
// (vagar, investigar, espreitar, cercar, perseguir, atacar, rugir, fugir), matilhas de
// raptores que flanqueiam e saltam, T-Rex territorial que não entra na mata fechada,
// Rex Sombrio que dorme no vale de dia e caça à noite. Também: dano por região do
// corpo, sangramento com rastro no chão, morte e população que se renova.
import * as THREE from 'three';
import { DinoModel } from './dino/model.js';
import { addWound } from './dino/material.js';
import { WATER, HALF, LAIR, CAMP, TOWERS } from './world/heightfield.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const angDiff = (a, b) => {
  let d = (a - b) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
};
const rand = (a, b) => a + Math.random() * (b - a);

const GROUP_MULT = { head: 2.6, neck: 1.5, body: 1, tail: 0.45, leg: 0.7, arm: 0.5 };
export const PART_NAME = { head: 'cabeça', neck: 'pescoço', body: 'corpo', tail: 'cauda', leg: 'perna', arm: 'braço' };

// esferas de acerto no pose de repouso (compartilhadas entre indivíduos)
function buildHitSpheres(asset) {
  if (asset.hitSpheres) return asset.hitSpheres;
  const out = [];
  asset.bones.forEach((b, i) => {
    if (b.name.startsWith('toe') || b.name.startsWith('hand')) return;
    const a = asset.restPos[i];
    const e = asset.restEnd[i];
    const len = a.distanceTo(e);
    let r = b.radius;
    if (b.group === 'body') r *= 1.05;
    if (b.group === 'leg') r *= 0.95;
    r = Math.max(r, asset.species.scale * 1.2);
    const n = clamp(Math.ceil(len / (r * 1.1)), 1, 5);
    for (let k = 0; k < n; k++) {
      const f = (k + 0.5) / n;
      const mult = (GROUP_MULT[b.group] || 1) * (b.name === 'chest' ? 1.25 : 1);
      out.push({ bone: i, rest: a.clone().lerp(e, f), r, mult, group: b.group, world: new THREE.Vector3() });
    }
  });
  asset.hitSpheres = out;
  return out;
}

let FRAME = 0;
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();

export class Dino {
  constructor(mgr, asset, x, z, heading, quality) {
    this.mgr = mgr;
    this.asset = asset;
    this.sp = asset.species;
    this.model = new DinoModel(asset, quality);
    this.group = this.model.group;
    this.anim = this.model.anim;
    this.spheres = buildHitSpheres(asset).map((s) => ({ ...s, world: new THREE.Vector3() }));
    this.spheresFrame = -1;
    this.pos = new THREE.Vector3(x, 0, z);
    this.heading = heading;
    this.speed = 0;
    this.targetSpeed = 0;
    this.turnRate = 0;
    this.vel = new THREE.Vector3();
    this.maxHp = this.sp.vida;
    this.hp = this.sp.vida;
    this.alive = true;
    this.deadTime = 0;
    this.state = 'idle';
    this.stateT = 0;
    this.goal = new THREE.Vector3(x, 0, z);
    this.home = new THREE.Vector3(x, 0, z);
    this.aiT = Math.random() * 0.2;
    this.awareness = 0;
    this.lastKnown = new THREE.Vector3();
    this.sees = false;
    this.steerHeading = heading;
    this.pitch = 0;
    this.roll = 0;
    this.yOff = 0;
    this.air = null;
    this.bleed = 0;
    this.bloodT = 0;
    this.bloodDist = 0;
    this.roarCD = rand(5, 15);
    this.attackCD = 0;
    this.pounceCD = rand(2, 4);
    this.callT = rand(3, 10);
    this.pack = null;
    this.flank = 0;
    this.center = new THREE.Vector3();
    this.hipH = this.anim.hipH;
    this.radius = this.sp.id === 'raptor' ? 0.55 : this.sp.id === 'trex' ? 1.7 : 2.0;
    this.length = asset.bbox.max.z - asset.bbox.min.z;
    this.harvested = false;
    this.tagged = 0;
    this.lastHitBy = null;
    this.animAcc = 0;
    this.visibleNow = true;
    this.anim.footstep = (leg, p, rk) => mgr.onFootstep(this, p, rk);
    this.anim.onEvent = (ev) => this.onAnimEvent(ev);
    this.place(true);
    mgr.scene.add(this.group);
  }

  get headPos() {
    return this.model.worldPoint(this.asset.boneIndex.head, this.asset.joint.head.clone().lerp(this.asset.joint.snout, 0.5), _v2);
  }
  hitRadius() {
    return this.length * 0.62 + 1;
  }

  // ------------------------------------------------------------ acerto
  updateSpheres() {
    if (this.spheresFrame === FRAME) return;
    this.spheresFrame = FRAME;
    const mw = this.model.mesh.matrixWorld;
    for (const s of this.spheres) {
      this.model.skel.pointOf(s.bone, s.rest, s.world);
      s.world.applyMatrix4(mw);
    }
  }

  hitTest(a, dir, maxT) {
    this.updateSpheres();
    let best = maxT;
    let hit = null;
    for (const s of this.spheres) {
      const ox = a.x - s.world.x;
      const oy = a.y - s.world.y;
      const oz = a.z - s.world.z;
      const b = ox * dir.x + oy * dir.y + oz * dir.z;
      const c = ox * ox + oy * oy + oz * oz - s.r * s.r;
      const disc = b * b - c;
      if (disc < 0) continue;
      let t = -b - Math.sqrt(disc);
      if (t < 0) t = 0;
      if (t < best && (c < 0 || b < 0)) {
        best = t;
        hit = s;
      }
    }
    if (!hit) return null;
    return { t: best, point: new THREE.Vector3(a.x + dir.x * best, a.y + dir.y * best, a.z + dir.z * best), bone: hit.bone, mult: hit.mult, part: hit.group };
  }

  // objeto para prender virotes a um osso
  follower(boneIdx, point) {
    const bone = this.model.skel.bones[boneIdx];
    const owner = this;
    void point;
    return {
      owner,
      toLocal(pos, quat) {
        bone.updateMatrixWorld();
        const inv = _m.copy(bone.matrixWorld).invert();
        const p = pos.clone().applyMatrix4(inv);
        const q = new THREE.Quaternion().setFromRotationMatrix(inv).multiply(quat);
        return { p, q };
      },
      fromLocal(l) {
        const p = l.p.clone().applyMatrix4(bone.matrixWorld);
        const q = new THREE.Quaternion().setFromRotationMatrix(bone.matrixWorld).multiply(l.q);
        return { pos: p, quat: q };
      },
    };
  }

  takeDamage(amount, hit, fromPos, def) {
    if (!this.alive) return false;
    this.hp -= amount;
    // ferimento na pele (ponto no pose de repouso)
    const bone = this.model.skel.bones[hit.bone];
    bone.updateMatrixWorld();
    const local = hit.point.clone().applyMatrix4(_m.copy(bone.matrixWorld).invert());
    const rest = local.add(this.asset.restPos[hit.bone]);
    addWound(this.model.material, rest, this.sp.scale * (def && def.id === 'shotgun' ? 1.8 : 2.6));
    this.model.material.userData.uniforms.uHurt.value = 1;
    // reação
    const side = Math.sign(_v.copy(fromPos).sub(this.pos).applyQuaternion(_q.copy(this.group.quaternion).invert()).x) || 1;
    this.anim.hit(-side, clamp((amount / this.maxHp) * 6, 0.25, 1.2));
    this.bloodT = 45;
    if (def && def.bleed) this.bleed = Math.max(this.bleed, this.maxHp * 0.012);
    this.awareness = 1;
    this.lastKnown.copy(fromPos);
    this.lastHitBy = fromPos.clone();
    if (this.hp <= 0) {
      this.die(side);
      return true;
    }
    // reação por espécie
    if (this.sp.id === 'raptor') {
      if (this.hp < this.maxHp * 0.28 && Math.random() < 0.6) this.setState('flee');
      else if (this.state !== 'attack' && this.state !== 'pounce') this.setState('chase');
      this.mgr.vocal(this, 'hurt');
      if (this.pack) this.pack.alert(fromPos);
    } else {
      if (this.state === 'wander' || this.state === 'idle' || this.state === 'investigate' || this.state === 'sleep') {
        this.setState(this.roarCD <= 0 ? 'roar' : 'chase');
      }
      if (this.hp < this.maxHp * 0.15 && Math.random() < 0.35 && this.sp.id === 'trex') this.setState('flee');
      if (Math.random() < 0.4) this.mgr.vocal(this, 'hurt');
    }
    return false;
  }

  die(side) {
    this.alive = false;
    this.hp = 0;
    this.state = 'dead';
    this.deadTime = 0;
    this.speed = 0;
    this.targetSpeed = 0;
    this.anim.die(side);
    this.mgr.vocal(this, 'death');
    this.mgr.onDeath && this.mgr.onDeath(this);
    if (this.air) {
      this.air = null;
      this.anim.air = 0;
    }
  }

  setState(s) {
    if (!this.alive) return;
    if (this.state === s) return;
    this.state = s;
    this.stateT = 0;
    if (s === 'roar') {
      this.anim.play('roar');
      this.roarCD = rand(18, 35);
    }
  }

  onAnimEvent(ev) {
    if (ev === 'roar') this.mgr.vocal(this, 'roar');
    if (ev === 'bite') {
      this.mgr.vocal(this, 'bite');
      const pl = this.mgr.player;
      if (!pl.alive) return;
      const hp = this.headPos;
      const chest = _v.set(pl.pos.x, pl.pos.y + 1.1, pl.pos.z);
      const d = hp.distanceTo(chest);
      if (d < this.sp.alcance * 0.55 + 1.3) {
        pl.damage(this.sp.dano * rand(0.85, 1.15), this.pos);
        this.mgr.onPlayerBitten(this);
      }
    }
  }

  // ------------------------------------------------------------ IA
  think(ctx) {
    const pl = ctx.player;
    const sp = this.sp;
    const dx = pl.pos.x - this.pos.x;
    const dz = pl.pos.z - this.pos.z;
    const d = Math.hypot(dx, dz);
    this.distToPlayer = d;
    const night = ctx.night;
    const world = ctx.world;

    // ---- sentidos
    let sees = false;
    if (pl.alive) {
      let range = sp.visao * (night > 0.5 ? (pl.flashlight ? 0.95 : 0.5) : 1);
      if (pl.crouch) range *= 0.55;
      if (world.hf.forestAt(pl.pos.x, pl.pos.z) > 0.55) range *= 0.72;
      if (pl.moving < 0.3) range *= 0.8;
      if (pl.tower) range *= 0.7;
      if (this.sp.id === 'sombrio' && night > 0.5) range = sp.visao * (pl.crouch ? 0.7 : 1);
      if (d < range) {
        const toP = Math.atan2(dx, dz);
        const ad = Math.abs(angDiff(toP, this.heading));
        const fov = sp.id === 'raptor' ? 2.2 : 1.9;
        if ((ad < fov || d < 10) && this.lineOfSight(world, pl, d)) sees = true;
      }
      // audição dos passos
      const hear = 48 * pl.noise * sp.audicao;
      if (d < hear) {
        this.awareness = Math.min(1, this.awareness + 0.25 * (1 - d / hear));
        this.lastKnown.copy(pl.pos);
      }
    }
    this.sees = sees;
    const dtA = ctx.thinkDt;
    if (sees) {
      const k = (1.4 - d / (sp.visao * 1.2)) * (pl.sprinting ? 1.6 : pl.crouch ? 0.5 : 1);
      this.awareness = Math.min(1, this.awareness + Math.max(0.15, k) * dtA * 1.6);
      this.lastKnown.copy(pl.pos);
    } else {
      this.awareness = Math.max(0, this.awareness - dtA * (this.state === 'chase' ? 0.06 : 0.12));
    }

    this.roarCD -= dtA;
    this.attackCD -= dtA;
    this.pounceCD -= dtA;
    this.callT -= dtA;
    this.stateT += dtA;

    const hunting = this.awareness > 0.75 && pl.alive;
    switch (this.state) {
      case 'idle':
      case 'sleep':
        this.targetSpeed = 0;
        if (hunting) this.onHunt(ctx);
        else if (this.awareness > 0.35) this.setState('investigate');
        else if (this.state === 'sleep' ? night > 0.4 : this.stateT > this.idleDur) this.setState('wander');
        if (this.state === 'wander') this.pickWander(ctx);
        break;
      case 'wander': {
        this.targetSpeed = sp.velAndar * (this.pack && !this.isLeader ? 1.1 : 1);
        if (this.pack && !this.isLeader && this.pack.leader.alive) {
          // segue o líder em formação
          const L = this.pack.leader;
          const a = L.heading + this.flank;
          this.goal.set(L.pos.x - Math.sin(a) * 4, 0, L.pos.z - Math.cos(a) * 4);
          const gd = Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z);
          this.targetSpeed = gd < 1.5 ? L.speed * 0.8 : gd > 8 ? sp.velTrote : sp.velAndar * 1.2;
        } else {
          const gd = Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z);
          if (gd < 4 || this.stateT > 60) {
            this.setState(this.sp.id === 'sombrio' && night < 0.3 && this.nearLair() ? 'sleep' : 'idle');
            this.idleDur = rand(4, 12);
            if (this.sp.id !== 'raptor' && this.roarCD <= 0 && Math.random() < 0.25) this.setState('roar');
          }
        }
        if (hunting) this.onHunt(ctx);
        else if (this.awareness > 0.35) this.setState('investigate');
        break;
      }
      case 'investigate':
        this.goal.copy(this.lastKnown);
        this.targetSpeed = sp.id === 'raptor' ? sp.velTrote * 0.8 : sp.velAndar * 1.4;
        this.anim.sniff = this.stateT % 6 > 4 ? 1 : 0;
        if (Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z) < 6) {
          this.targetSpeed = 0;
          if (this.stateT > 10) {
            this.anim.sniff = 0;
            this.setState('wander');
            this.pickWander(ctx);
          }
        }
        if (hunting) {
          this.anim.sniff = 0;
          this.onHunt(ctx);
        }
        if (this.awareness < 0.1 && this.stateT > 6) {
          this.anim.sniff = 0;
          this.setState('wander');
          this.pickWander(ctx);
        }
        break;
      case 'stalk': {
        // raptores: abrem-se em leque ao redor do jogador antes do bote
        const a = Math.atan2(this.pos.x - pl.pos.x, this.pos.z - pl.pos.z) * 0.3 + (this.pack ? this.pack.baseAngle + this.flank : 0) * 0.7;
        const R = 22;
        this.goal.set(pl.pos.x + Math.sin(a) * R, 0, pl.pos.z + Math.cos(a) * R);
        const gd = Math.hypot(this.goal.x - this.pos.x, this.goal.z - this.pos.z);
        this.targetSpeed = gd > 10 ? sp.velTrote : sp.velAndar;
        if (this.callT <= 0) {
          this.mgr.vocal(this, 'call');
          this.callT = rand(2.5, 6);
        }
        if (this.stateT > 7 || (gd < 6 && this.stateT > 3) || d < 12) this.setState('chase');
        if (!pl.alive) this.setState('wander');
        break;
      }
      case 'chase':
        this.goal.copy(pl.alive ? pl.pos : this.lastKnown);
        this.targetSpeed = sp.velCorrer;
        if (!this.sees && this.awareness < 0.45) {
          this.setState('investigate');
          break;
        }
        if (!pl.alive) {
          this.setState('wander');
          this.pickWander(ctx);
          break;
        }
        this.tryAttack(ctx, d);
        if (sp.id !== 'raptor' && this.callT <= 0) {
          this.mgr.vocal(this, 'growl');
          this.callT = rand(4, 9);
        }
        // T-Rex não consegue entrar na mata fechada: fica rondando a borda
        if (sp.id !== 'raptor' && d < 40 && world.veg.treeDensity(pl.pos.x, pl.pos.z, 7) >= 3 && this.blockedT > 1.5) {
          this.setState('pace');
        }
        break;
      case 'pace':
        this.targetSpeed = sp.velAndar * 0.7;
        {
          const a = Math.atan2(this.pos.x - pl.pos.x, this.pos.z - pl.pos.z) + 0.6;
          this.goal.set(pl.pos.x + Math.sin(a) * Math.max(d, 14), 0, pl.pos.z + Math.cos(a) * Math.max(d, 14));
        }
        if (this.roarCD <= 0 && this.stateT > 2) this.setState('roar');
        if (world.veg.treeDensity(pl.pos.x, pl.pos.z, 7) < 2 || this.stateT > 25) this.setState('chase');
        if (!pl.alive) this.setState('wander');
        break;
      case 'circle': {
        const a = Math.atan2(this.pos.x - pl.pos.x, this.pos.z - pl.pos.z) + (this.flank >= 0 ? 0.9 : -0.9);
        this.goal.set(pl.pos.x + Math.sin(a) * 10, 0, pl.pos.z + Math.cos(a) * 10);
        this.targetSpeed = sp.velTrote;
        if (this.stateT > this.circleDur) this.setState('chase');
        if (this.callT <= 0) {
          this.mgr.vocal(this, 'call');
          this.callT = rand(1.5, 3);
        }
        break;
      }
      case 'attack':
        this.targetSpeed = sp.id === 'raptor' ? 2 : 0.6;
        this.goal.copy(pl.pos);
        if (!this.anim.busy) {
          this.attackCD = sp.id === 'raptor' ? rand(0.6, 1.4) : rand(1.2, 2.2);
          if (sp.id === 'raptor' && Math.random() < 0.6) {
            this.setState('circle');
            this.circleDur = rand(1, 2.5);
          } else this.setState('chase');
        }
        break;
      case 'roar':
        this.targetSpeed = 0;
        this.goal.copy(this.awareness > 0.3 ? this.lastKnown : this.goal);
        if (!this.anim.busy && this.stateT > 0.5) this.setState(hunting ? 'chase' : 'wander');
        break;
      case 'flee': {
        const a = Math.atan2(this.pos.x - pl.pos.x, this.pos.z - pl.pos.z);
        this.goal.set(this.pos.x + Math.sin(a) * 60, 0, this.pos.z + Math.cos(a) * 60);
        this.targetSpeed = sp.velCorrer * 0.9;
        if (d > 180 || this.stateT > 25) {
          this.awareness = 0.2;
          this.setState('wander');
          this.pickWander(ctx);
        }
        break;
      }
      default:
        break;
    }
    // Rex Sombrio à noite: caça o jogador de longe
    if (sp.id === 'sombrio' && night > 0.5 && pl.alive && (this.state === 'wander' || this.state === 'idle' || this.state === 'sleep') && d < 700) {
      this.awareness = Math.max(this.awareness, 0.5);
      this.lastKnown.copy(pl.pos);
      this.setState('investigate');
    }
    // olhar
    if (this.awareness > 0.4 && pl.alive) this.anim.lookAt(_lookTarget(this, pl));
    else this.anim.lookAt(null);
    this.anim.alert = this.awareness;
    this.steer(ctx);
  }

  onHunt(ctx) {
    const sp = this.sp;
    if (sp.id === 'raptor') {
      if (this.pack) this.pack.alert(ctx.player.pos);
      else this.setState('stalk');
      return;
    }
    if (this.roarCD <= 0) this.setState('roar');
    else this.setState('chase');
  }

  tryAttack(ctx, d) {
    const sp = this.sp;
    const pl = ctx.player;
    const toP = Math.atan2(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z);
    const ad = Math.abs(angDiff(toP, this.heading));
    // altura: não alcança o jogador no alto da torre
    const dy = pl.pos.y + 1 - this.headPos.y;
    if (dy > 2.5) return;
    if (this.attackCD <= 0 && d < sp.alcance + 0.8 && ad < 0.6) {
      this.setState('attack');
      this.anim.play('bite');
      return;
    }
    if (sp.id === 'raptor' && this.pounceCD <= 0 && d > sp.pulo[0] && d < sp.pulo[1] && ad < 0.35 && this.sees) {
      this.startPounce(ctx, pl);
    }
  }

  startPounce(ctx, pl) {
    const T = clamp(this.distToPlayer / 13, 0.45, 0.8);
    const tx = pl.pos.x + pl.vel.x * T * 0.6;
    const tz = pl.pos.z + pl.vel.z * T * 0.6;
    const g = 22;
    this.air = { vx: (tx - this.pos.x) / T, vz: (tz - this.pos.z) / T, vy: 0.5 * g * T, g, t: 0 };
    this.yOff = 0;
    this.state = 'pounce';
    this.stateT = 0;
    this.pounceCD = rand(4, 7);
    this.mgr.vocal(this, 'screech');
  }

  nearLair() {
    return Math.hypot(this.pos.x - LAIR.x, this.pos.z - LAIR.z) < LAIR.r;
  }

  pickWander(ctx) {
    const world = ctx.world;
    for (let k = 0; k < 12; k++) {
      let cx = this.home.x;
      let cz = this.home.z;
      let R = this.sp.id === 'trex' ? 450 : 300;
      if (this.sp.id === 'sombrio') {
        cx = LAIR.x;
        cz = LAIR.z;
        R = ctx.night > 0.4 ? 800 : LAIR.r * 0.6;
      }
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * R;
      const x = cx + Math.sin(a) * r;
      const z = cz + Math.cos(a) * r;
      if (!this.walkable(world, x, z)) continue;
      if (this.sp.id === 'trex' && world.hf.forestAt(x, z) > 0.4) continue;
      if (Math.hypot(x - CAMP.x, z - CAMP.z) < 120 && this.sp.id !== 'raptor') continue;
      this.goal.set(x, 0, z);
      return;
    }
    this.goal.copy(this.home);
  }

  walkable(world, x, z) {
    if (Math.abs(x) > HALF - 120 || Math.abs(z) > HALF - 120) return false;
    const h = world.height(x, z);
    if (h < WATER - 1.3) return false;
    if (world.hf.slope(x, z) > 0.85) return false;
    return true;
  }

  // desvio de obstáculos: testa direções em volta da desejada
  steer(ctx) {
    const world = ctx.world;
    const want = Math.atan2(this.goal.x - this.pos.x, this.goal.z - this.pos.z);
    const look = Math.max(5, this.speed * 1.4) + this.radius * 2;
    const big = this.sp.id !== 'raptor';
    let best = want;
    let bestCost = 1e9;
    for (const off of [0, 0.35, -0.35, 0.7, -0.7, 1.1, -1.1, 1.6, -1.6, 2.4, -2.4]) {
      const a = want + off;
      let cost = Math.abs(off) * 1.2 + Math.abs(angDiff(a, this.heading)) * 0.25;
      for (const f of [0.5, 1]) {
        const x = this.pos.x + Math.sin(a) * look * f;
        const z = this.pos.z + Math.cos(a) * look * f;
        if (!this.walkable(world, x, z)) cost += 50;
        if (big) cost += world.veg.treeDensity(x, z, this.radius + 1) * 6;
        // não pisa no acampamento (cerca)
        if (big && Math.hypot(x - CAMP.x, z - CAMP.z) < 30) cost += 30;
      }
      if (cost < bestCost) {
        bestCost = cost;
        best = a;
      }
    }
    this.steerHeading = best;
    this.blocked = bestCost > 40;
  }

  lineOfSight(world, pl, d) {
    const n = Math.min(10, Math.ceil(d / 8));
    const y0 = this.pos.y + this.hipH * 1.4;
    const y1 = pl.pos.y + 1.4;
    for (let i = 1; i < n; i++) {
      const f = i / n;
      const x = this.pos.x + (pl.pos.x - this.pos.x) * f;
      const z = this.pos.z + (pl.pos.z - this.pos.z) * f;
      if (world.height(x, z) > y0 + (y1 - y0) * f) return false;
    }
    return true;
  }

  // ------------------------------------------------------------ movimento
  update(dt, ctx) {
    const world = ctx.world;
    const pl = ctx.player;
    if (this.alive) {
      this.aiT -= dt;
      if (this.aiT <= 0) {
        const td = this.distToPlayer > 400 ? 0.8 : 0.18;
        this.aiT = td;
        ctx.thinkDt = td;
        this.think(ctx);
      }
    } else {
      this.deadTime += dt;
    }
    const sp = this.sp;
    // salto do raptor
    if (this.air) {
      const a = this.air;
      a.t += dt;
      this.pos.x += a.vx * dt;
      this.pos.z += a.vz * dt;
      a.vy -= a.g * dt;
      this.yOff += a.vy * dt;
      this.anim.air = Math.min(1, this.anim.air + dt * 6);
      this.heading += angDiff(Math.atan2(a.vx, a.vz), this.heading) * Math.min(1, dt * 8);
      if (this.yOff <= 0 && a.t > 0.15) {
        this.yOff = 0;
        this.air = null;
        this.anim.air = 0;
        this.group.updateMatrixWorld();
        this.anim.resetFeet(this.group, (x, z) => world.height(x, z));
        if (pl.alive && Math.hypot(pl.pos.x - this.pos.x, pl.pos.z - this.pos.z) < 2.4 && Math.abs(pl.pos.y - this.pos.y) < 2) {
          pl.damage(sp.dano * 1.5, this.pos);
          this.mgr.onPlayerBitten(this);
          this.anim.play('bite', 0.5);
        }
        this.state = 'circle';
        this.stateT = 0;
        this.circleDur = rand(0.8, 2);
        this.speed = 4;
      }
    } else if (this.alive) {
      // giro limitado (os grandes giram devagar, ainda mais correndo)
      const diff = angDiff(this.steerHeading, this.heading);
      const sk = sp.id === 'raptor' ? 1 : 1 / (1 + this.speed * 0.08);
      const maxTurn = sp.giro * sk * dt;
      const turn = clamp(diff, -maxTurn, maxTurn);
      this.heading += turn;
      this.turnRate = damp(this.turnRate, turn / Math.max(dt, 1e-4), 8, dt);
      let ts = this.targetSpeed;
      if (Math.abs(diff) > 1.1 && sp.id !== 'raptor') ts *= 0.25;
      else if (Math.abs(diff) > 0.6) ts *= 0.6;
      const acc = sp.id === 'raptor' ? 16 : 3.5;
      this.speed += clamp(ts - this.speed, -acc * 1.6 * dt, acc * dt);
      this.speed = Math.max(0, this.speed);
    } else {
      this.speed = Math.max(0, this.speed - 10 * dt);
      this.turnRate = 0;
    }
    if (!this.air) {
      const fx = Math.sin(this.heading);
      const fz = Math.cos(this.heading);
      const ox = this.pos.x;
      const oz = this.pos.z;
      this.pos.x += fx * this.speed * dt;
      this.pos.z += fz * this.speed * dt;
      // colisões
      if (this.alive) {
        world.veg.collide(this.pos, this.radius);
        world.structures.collide(this.pos, this.radius);
        const lim = HALF - 100;
        this.pos.x = clamp(this.pos.x, -lim, lim);
        this.pos.z = clamp(this.pos.z, -lim, lim);
        if (world.height(this.pos.x, this.pos.z) < WATER - 1.5) {
          this.pos.x = ox;
          this.pos.z = oz;
        }
        const moved = Math.hypot(this.pos.x - ox, this.pos.z - oz);
        this.blockedT = moved < this.speed * dt * 0.35 && this.speed > 1 ? (this.blockedT || 0) + dt : 0;
      }
      this.vel.set((this.pos.x - ox) / Math.max(dt, 1e-4), 0, (this.pos.z - oz) / Math.max(dt, 1e-4));
    } else {
      this.vel.set(this.air.vx, 0, this.air.vz);
    }
    // sangramento e rastro
    if (this.bleed > 0 && this.alive) {
      this.hp -= this.bleed * dt;
      this.bleed = Math.max(0, this.bleed - dt * this.maxHp * 0.0006);
      if (this.hp <= 0) this.die(1);
    }
    if (this.bloodT > 0) {
      this.bloodT -= dt;
      this.bloodDist += this.speed * dt;
      if (this.bloodDist > (this.bleed > 0 ? 1.2 : 2.5) && ctx.distToCam < 300) {
        this.bloodDist = 0;
        this.mgr.fx.bloodDrop(this.pos.x + rand(-0.4, 0.4), this.pos.z + rand(-0.4, 0.4), this.sp.id === 'raptor' ? 0.12 : 0.25);
      }
    }
    this.place(false, dt, ctx);
  }

  // põe o modelo no chão, inclinado conforme o terreno, e anima
  place(first, dt = 0, ctx = null) {
    const world = this.mgr.world;
    const g = (x, z) => world.height(x, z);
    const h = g(this.pos.x, this.pos.z);
    this.pos.y = h + this.yOff;
    const L = this.length * 0.35;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    const hf = g(this.pos.x + fx * L, this.pos.z + fz * L);
    const hb = g(this.pos.x - fx * L, this.pos.z - fz * L);
    const W = this.radius;
    const hl = g(this.pos.x + fz * W, this.pos.z - fx * W);
    const hr = g(this.pos.x - fz * W, this.pos.z + fx * W);
    const tp = clamp(-Math.atan2(hf - hb, 2 * L), -0.45, 0.45);
    const tr = clamp(Math.atan2(hl - hr, 2 * W) * 0.5, -0.2, 0.2);
    if (first) {
      this.pitch = tp;
      this.roll = tr;
    } else {
      this.pitch = damp(this.pitch, tp, 4, dt);
      this.roll = damp(this.roll, tr, 4, dt);
    }
    this.group.position.copy(this.pos);
    this.group.position.y = Math.min(this.pos.y, (hf + hb) / 2 + this.yOff) ;
    this.group.quaternion.setFromEuler(_e.set(this.pitch, this.heading, this.roll, 'YXZ'));
    this.group.updateMatrixWorld();
    this.center.copy(this.pos);
    this.center.y += this.hipH;
    if (first) {
      this.anim.resetFeet(this.group, g);
      this.anim.update(1 / 60, this.group, g, this.vel);
      return;
    }
    // nível de detalhe da animação pela distância
    const dc = ctx ? ctx.distToCam : 0;
    const vis = dc < (this.sp.id === 'raptor' ? 650 : 1100);
    this.group.visible = vis;
    this.visibleNow = vis;
    this.model.mesh.castShadow = dc < 130;
    if (!vis) return;
    this.anim.setMotion(this.speed, this.turnRate);
    this.animAcc += dt;
    const step = dc < 120 ? 0 : dc < 300 ? 1 / 30 : 1 / 15;
    if (this.animAcc >= step) {
      this.anim.update(this.animAcc, this.group, g, this.vel);
      this.animAcc = 0;
    }
    const u = this.model.material.userData.uniforms;
    u.uHurt.value = Math.max(0, u.uHurt.value - dt * 4);
    u.uNight.value = ctx ? ctx.night : 0;
  }

  dispose() {
    this.mgr.scene.remove(this.group);
    this.model.dispose();
  }
}

function _lookTarget(d, pl) {
  return new THREE.Vector3(pl.pos.x, pl.pos.y + (pl.crouch ? 0.9 : 1.5), pl.pos.z);
}

class Pack {
  constructor(members) {
    this.members = members;
    members.forEach((m, i) => {
      m.pack = this;
      m.flank = (i - (members.length - 1) / 2) * 1.1;
    });
    this.baseAngle = 0;
  }
  get leader() {
    return this.members.find((m) => m.alive) || this.members[0];
  }
  alert(pos) {
    const L = this.leader;
    this.baseAngle = Math.atan2(L.pos.x - pos.x, L.pos.z - pos.z);
    for (const m of this.members) {
      if (!m.alive) continue;
      m.awareness = Math.max(m.awareness, 0.8);
      m.lastKnown.copy(pos);
      if (m.state === 'wander' || m.state === 'idle' || m.state === 'investigate') m.setState('stalk');
    }
  }
}
Object.defineProperty(Dino.prototype, 'isLeader', {
  get() {
    return !this.pack || this.pack.leader === this;
  },
});

// ------------------------------------------------------------------ gerente
const RAPTOR_HOMES = [
  [-1050, 150],
  [-520, -760],
  [-880, 960],
  [-200, -380],
];
const TREX_HOMES = [
  [900, -150],
  [650, 980],
  [1300, 560],
];

export class DinoManager {
  constructor(scene, world, assets, fx, audio, quality) {
    this.scene = scene;
    this.world = world;
    this.assets = assets;
    this.fx = fx;
    this.audio = audio;
    this.quality = quality;
    this.list = [];
    this.player = null;
    this.respawn = [];
    this.onKill = null;
    this.onBite = null;
    this.events = [];
  }

  spawnAll() {
    const packs = [3, 4, 3];
    packs.forEach((n, i) => this.spawnPack(RAPTOR_HOMES[i][0], RAPTOR_HOMES[i][1], n));
    this.spawnSingle('trex', TREX_HOMES[0][0], TREX_HOMES[0][1]);
    this.spawnSingle('trex', TREX_HOMES[1][0], TREX_HOMES[1][1]);
    const s = this.spawnSingle('sombrio', LAIR.x, LAIR.z);
    s.state = 'sleep';
  }

  spawnPack(x, z, n) {
    const members = [];
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const px = x + Math.sin(a) * 5;
      const pz = z + Math.cos(a) * 5;
      const d = new Dino(this, this.assets.raptor, px, pz, Math.random() * 6.28, this.quality);
      d.home.set(x, 0, z);
      d.idleDur = rand(2, 6);
      this.list.push(d);
      members.push(d);
    }
    new Pack(members);
    return members;
  }

  spawnSingle(id, x, z) {
    const d = new Dino(this, this.assets[id], x, z, Math.random() * 6.28, this.quality);
    d.idleDur = rand(2, 8);
    this.list.push(d);
    return d;
  }

  get alive() {
    return this.list.filter((d) => d.alive);
  }

  // tiro ouvido pelos dinossauros num raio
  gunshot(pos, loud) {
    for (const d of this.list) {
      if (!d.alive) continue;
      const dist = d.pos.distanceTo(pos);
      if (dist > loud * d.sp.audicao) continue;
      const err = dist * 0.15;
      d.lastKnown.set(pos.x + rand(-err, err), 0, pos.z + rand(-err, err));
      d.awareness = Math.max(d.awareness, dist < 120 ? 0.8 : 0.5);
      if (d.state === 'sleep' || d.state === 'idle' || d.state === 'wander') {
        if (d.sp.id === 'raptor' && d.hp < d.maxHp * 0.4) d.setState('flee');
        else d.setState(d.sp.id !== 'raptor' && d.roarCD <= 0 && dist < 400 ? 'roar' : 'investigate');
      }
    }
  }

  vocal(d, kind) {
    this.audio && this.audio.dino(d.sp.id, kind, d.headPos.clone(), d);
    this.onVocal && this.onVocal(d, kind);
  }

  onFootstep(d, p, rk) {
    if (!this.player) return;
    const dist = p.distanceTo(this.player.pos);
    const big = d.sp.id !== 'raptor';
    if (dist < 120) this.audio && this.audio.dinoStep(d.sp.id, p, rk);
    if (big && dist < 70) {
      this.player.trauma = Math.min(1, this.player.trauma + (d.sp.massa * 0.35 * (1 - dist / 70)) ** 2);
      if (dist < 90) this.fx.stomp(p, true);
    }
  }

  onPlayerBitten(d) {
    this.onBite && this.onBite(d);
  }

  // empurra o jogador para fora do corpo dos dinossauros
  collidePlayer(pos, r) {
    for (const d of this.list) {
      if (!d.visibleNow) continue;
      const fx = Math.sin(d.heading);
      const fz = Math.cos(d.heading);
      const n = d.alive ? 3 : 2;
      for (let k = 0; k < n; k++) {
        const off = (k - (n - 1) / 2) * d.length * 0.22;
        const cx = d.pos.x + fx * off;
        const cz = d.pos.z + fz * off;
        const rr = d.radius * (k === 1 ? 1 : 0.8) + r;
        const dx = pos.x - cx;
        const dz = pos.z - cz;
        const dd = Math.hypot(dx, dz);
        if (dd < rr && dd > 1e-4 && pos.y < d.pos.y + d.hipH * 1.3) {
          pos.x = cx + (dx / dd) * rr;
          pos.z = cz + (dz / dd) * rr;
        }
      }
    }
  }

  update(dt, ctx) {
    FRAME++;
    ctx.mgr = this;
    // separação entre dinossauros
    const L = this.list;
    for (let i = 0; i < L.length; i++)
      for (let j = i + 1; j < L.length; j++) {
        const a = L[i];
        const b = L[j];
        if (!a.alive && !b.alive) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const min = a.radius + b.radius;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-6) {
          const d = Math.sqrt(d2);
          const push = (min - d) * 0.5;
          if (a.alive) {
            a.pos.x -= (dx / d) * push;
            a.pos.z -= (dz / d) * push;
          }
          if (b.alive) {
            b.pos.x += (dx / d) * push;
            b.pos.z += (dz / d) * push;
          }
        }
      }
    for (const d of L) {
      ctx.distToCam = d.pos.distanceTo(ctx.camPos);
      d.distToPlayer = d.distToPlayer ?? ctx.distToCam;
      d.update(dt, ctx);
      if (d.tagged > 0) d.tagged -= dt;
    }
    // remove corpos antigos e repõe a população longe do jogador
    for (let i = L.length - 1; i >= 0; i--) {
      const d = L[i];
      if (!d.alive && d.deadTime > 240 && d.pos.distanceTo(this.player.pos) > 250) {
        this.fx.removeFollowing(d);
        d.dispose();
        L.splice(i, 1);
        this.respawn.push({ id: d.sp.id, t: d.sp.id === 'raptor' ? 150 : d.sp.id === 'trex' ? 300 : 600 });
      }
    }
    for (let i = this.respawn.length - 1; i >= 0; i--) {
      const r = this.respawn[i];
      r.t -= dt;
      if (r.t > 0) continue;
      this.respawn.splice(i, 1);
      const pl = this.player.pos;
      if (r.id === 'sombrio') {
        if (Math.hypot(pl.x - LAIR.x, pl.z - LAIR.z) > 400) this.spawnSingle('sombrio', LAIR.x, LAIR.z).state = 'sleep';
        else this.respawn.push({ id: r.id, t: 60 });
      } else if (r.id === 'trex') {
        const opts = TREX_HOMES.filter(([x, z]) => Math.hypot(pl.x - x, pl.z - z) > 500);
        if (opts.length) {
          const [x, z] = opts[Math.floor(Math.random() * opts.length)];
          this.spawnSingle('trex', x, z);
        } else this.respawn.push({ id: r.id, t: 60 });
      } else {
        // repõe uma matilha inteira quando faltam raptores
        const alive = L.filter((d) => d.alive && d.sp.id === 'raptor').length;
        if (alive < 8) {
          const opts = RAPTOR_HOMES.filter(([x, z]) => Math.hypot(pl.x - x, pl.z - z) > 450);
          if (opts.length) {
            const [x, z] = opts[Math.floor(Math.random() * opts.length)];
            this.spawnPack(x, z, 3);
          }
        }
      }
    }
  }

  // corpo mais próximo (para coletar troféu)
  nearestBody(pos, r) {
    let best = null;
    let bd = r;
    for (const d of this.list) {
      if (d.alive || d.harvested) continue;
      const dd = d.pos.distanceTo(pos) - d.length * 0.3;
      if (dd < bd) {
        bd = dd;
        best = d;
      }
    }
    return best;
  }
}

export { TOWERS };

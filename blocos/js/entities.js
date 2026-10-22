// Entidades: mobs (com IA), itens soltos, blocos caindo e TNT acesa.
import * as THREE from 'three';
import { B, BLOCKS, info } from './blocks.js';
import { moveBox, liquidIn } from './physics.js';
import { HumanoidModel, QuadrupedModel, CreeperModel, heldItemMesh } from './models.js';
import { blockItemGeometry } from './mesher.js';
import { OPAQUE, SOLID, LIQUID } from './world.js';
import { CH } from './consts.js';

export function lightCurve(l, gamma) {
  const f = 1 - l / 15;
  const v = (1 - f) / (f * 3 + 1);
  return v + (Math.sqrt(v) - v) * gamma;
}
export function brightnessAt(world, x, y, z, skyDarken, gamma) {
  const L = world.getLight(Math.floor(x), Math.floor(y), Math.floor(z));
  const s = Math.max(0, (L >> 4) - skyDarken), b = L & 15;
  return Math.max(lightCurve(s, gamma), lightCurve(b, gamma) * 1.05, 0.03);
}

const wrapAngle = (a) => {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
};
const approachAngle = (cur, target, maxStep) => {
  const d = wrapAngle(target - cur);
  return cur + Math.max(-maxStep, Math.min(maxStep, d));
};

class Entity {
  constructor(game, x, y, z, w, h) {
    this.game = game;
    this.x = this.px = x;
    this.y = this.py = y;
    this.z = this.pz = z;
    this.vx = this.vy = this.vz = 0;
    this.w = w;
    this.h = h;
    this.onGround = false;
    this.dead = false;
    this.age = 0;
    this.object = null;
  }
  savePrev() {
    this.px = this.x;
    this.py = this.y;
    this.pz = this.z;
  }
  lerpPos(a) {
    return [this.px + (this.x - this.px) * a, this.py + (this.y - this.py) * a, this.pz + (this.z - this.pz) * a];
  }
  physics(gravity = 0.08, drag = 0.98, friction = 0.546) {
    const r = moveBox(this.game.world, this, this.vx, this.vy, this.vz);
    if (r.hitX) this.vx = 0;
    if (r.hitZ) this.vz = 0;
    if (r.hitY) this.vy = 0;
    this.onGround = r.onGround;
    this.hitH = r.hitX || r.hitZ;
    this.vy = (this.vy - gravity) * drag;
    const f = this.onGround ? friction : 0.91;
    this.vx *= f;
    this.vz *= f;
    return r;
  }
  remove() {
    this.dead = true;
  }
}

// ---------- itens soltos ----------
export class ItemEntity extends Entity {
  constructor(game, x, y, z, id, count, pickupDelay = 10) {
    super(game, x, y, z, 0.125, 0.25);
    this.id = id;
    this.count = count;
    this.pickupDelay = pickupDelay;
    this.spin = Math.random() * Math.PI * 2;
    this.vx = (Math.random() - 0.5) * 0.2;
    this.vy = 0.2;
    this.vz = (Math.random() - 0.5) * 0.2;
    this.mesh = heldItemMesh(id);
    const isBlock = this.mesh.userData.isBlock;
    this.mesh.scale.setScalar(isBlock ? 0.25 : 0.4);
    this.object = new THREE.Group();
    this.object.add(this.mesh);
    this.bobBase = isBlock ? 0.13 : 0.2;
  }
  tick() {
    this.savePrev();
    this.age++;
    if (this.pickupDelay > 0) this.pickupDelay--;
    const liq = liquidIn(this.game.world, this, 0, 0.2);
    if (liq) {
      this.vy += 0.02;
      this.vx *= 0.9;
      this.vz *= 0.9;
    }
    this.physics(0.04, 0.98, 0.6);
    if (this.age > 6000) this.remove();
    // junta pilhas iguais próximas
    if (this.age % 20 === 0) {
      for (const o of this.game.entities.list) {
        if (o === this || !(o instanceof ItemEntity) || o.dead || o.id !== this.id) continue;
        if (Math.abs(o.x - this.x) < 0.6 && Math.abs(o.y - this.y) < 0.6 && Math.abs(o.z - this.z) < 0.6 && o.count + this.count <= info(this.id).stack) {
          this.count += o.count;
          o.remove();
        }
      }
    }
    const p = this.game.player;
    if (!this.pickupDelay && !p.dead) {
      const dx = p.x - this.x, dz = p.z - this.z, dy = p.y + 0.6 - this.y;
      if (dx * dx + dz * dz < 1.4 && Math.abs(dy) < 1.4) {
        const left = p.inventory.add(this.id, this.count, this.damage || 0);
        if (left < this.count) {
          this.game.audio.play('pop');
          this.count = left;
          if (!left) this.remove();
        }
      }
    }
  }
  render(a, env) {
    const [x, y, z] = this.lerpPos(a);
    const t = this.age + a;
    this.object.position.set(x, y + this.bobBase + Math.sin(t * 0.1 + this.spin) * 0.05, z);
    this.object.rotation.y = t * 0.05 + this.spin;
    const b = brightnessAt(this.game.world, x, y + 0.2, z, env.skyDarken, env.gamma);
    for (const m of this.mesh.userData.mats) m.color.setRGB(b, b, b);
  }
}

// ---------- blocos caindo (areia, cascalho) ----------
class FallingBlock extends Entity {
  constructor(game, x, y, z, id) {
    super(game, x + 0.5, y, z + 0.5, 0.49, 0.98);
    this.id = id;
    this.object = new THREE.Mesh(blockItemGeometry(id), this.blockMaterial());
  }
  blockMaterial() {
    const m = heldItemMesh(this.id).material;
    this.bmat = m;
    return m;
  }
  tick() {
    this.savePrev();
    this.age++;
    this.physics(0.04, 0.98, 0.7);
    if (this.onGround || this.age > 600) {
      const w = this.game.world;
      const bx = Math.floor(this.x), by = Math.floor(this.y + 0.5), bz = Math.floor(this.z);
      const cur = w.getBlock(bx, by, bz);
      if (cur === B.AIR || LIQUID[cur] || BLOCKS[cur].replaceable) w.setBlock(bx, by, bz, this.id);
      else this.game.entities.spawnItem(bx + 0.5, by + 0.5, bz + 0.5, this.id, 1);
      this.remove();
    }
  }
  render(a, env) {
    const [x, y, z] = this.lerpPos(a);
    this.object.position.set(x, y + 0.5, z);
    const b = brightnessAt(this.game.world, x, y + 0.5, z, env.skyDarken, env.gamma);
    this.bmat.color.setRGB(b, b, b);
  }
}

// ---------- TNT acesa ----------
class PrimedTNT extends Entity {
  constructor(game, x, y, z, fuse = 80) {
    super(game, x + 0.5, y, z + 0.5, 0.49, 0.98);
    this.fuse = fuse;
    this.vy = 0.2;
    this.vx = (Math.random() - 0.5) * 0.04;
    this.vz = (Math.random() - 0.5) * 0.04;
    this.object = new THREE.Group();
    this.mesh = heldItemMesh(B.TNT);
    this.object.add(this.mesh);
    game.audio.play('fuse');
  }
  tick() {
    this.savePrev();
    this.physics(0.04, 0.98, 0.7);
    if (--this.fuse <= 0) {
      this.remove();
      this.game.entities.explode(this.x, this.y + 0.5, this.z, 4);
    } else if (this.fuse % 3 === 0) this.game.particles.smoke(this.x, this.y + 1.1, this.z, 1);
  }
  render(a, env) {
    const [x, y, z] = this.lerpPos(a);
    this.object.position.set(x, y + 0.5, z);
    const f = this.fuse - a;
    const s = f < 10 ? 1 + (1 - f / 10) * 0.15 : 1;
    this.mesh.scale.setScalar(s);
    const b = brightnessAt(this.game.world, x, y + 0.5, z, env.skyDarken, env.gamma);
    const flash = Math.floor(f / 5) % 2 === 0 ? 0.8 : 0;
    this.mesh.userData.mats[0].color.setRGB(b + flash, b + flash, b + flash);
  }
}

// ---------- mobs ----------
const MOBS = {
  pig: { w: 0.45, h: 0.9, health: 10, speed: 0.07, hostile: false, sound: 'pig', drops: [[262, 1, 3]] },
  sheep: { w: 0.45, h: 1.3, health: 8, speed: 0.065, hostile: false, sound: 'sheep', drops: [[B.WOOL_WHITE, 1, 1], [267, 1, 2]] },
  cow: { w: 0.45, h: 1.4, health: 10, speed: 0.06, hostile: false, sound: 'cow', drops: [[264, 1, 3]] },
  zombie: { w: 0.3, h: 1.95, health: 20, speed: 0.115, hostile: true, sound: 'zombie', drops: [[266, 0, 2]] },
  creeper: { w: 0.3, h: 1.7, health: 20, speed: 0.1, hostile: true, sound: null, drops: [] },
};

export class Mob extends Entity {
  constructor(game, type, x, y, z) {
    const d = MOBS[type];
    super(game, x, y, z, d.w, d.h);
    this.type = type;
    this.def = d;
    this.health = d.health;
    this.yaw = Math.random() * Math.PI * 2;
    this.bodyYaw = this.yaw;
    this.headYaw = this.yaw;
    this.pitch = 0;
    this.prevBodyYaw = this.bodyYaw;
    this.prevHeadYaw = this.headYaw;
    this.limbSwing = 0;
    this.limbAmount = 0;
    this.prevLimbAmount = 0;
    this.hurtTime = 0;
    this.invuln = 0;
    this.deathTime = 0;
    this.fallDistance = 0;
    this.moveTimer = 0;
    this.walking = 0;
    this.panic = 0;
    this.attackCool = 0;
    this.fuse = 0;
    this.lookTimer = 0;
    this.eatGrass = 0;
    this.soundTimer = 100 + Math.random() * 300;
    this.burnTimer = 0;
    if (type === 'zombie') this.model = new HumanoidModel('zombie');
    else if (type === 'creeper') this.model = new CreeperModel();
    else this.model = new QuadrupedModel(type);
    this.object = this.model.root;
  }

  get hostile() {
    return this.def.hostile;
  }

  damage(amount, from) {
    if (this.deathTime || this.invuln > 0) return false;
    this.health -= amount;
    this.hurtTime = 10;
    this.invuln = 10;
    if (from) {
      const dx = this.x - from.x, dz = this.z - from.z;
      const d = Math.hypot(dx, dz) || 1;
      this.vx = (dx / d) * 0.4;
      this.vz = (dz / d) * 0.4;
      this.vy = 0.36;
    }
    this.game.audio.play(this.type === 'creeper' || this.type === 'zombie' ? 'mobhurt' : this.def.sound, this);
    if (!this.hostile) this.panic = 80;
    if (this.health <= 0) {
      this.deathTime = 1;
      this.game.audio.play(this.type === 'zombie' ? 'zombiedeath' : 'mobhurt', this);
    }
    return true;
  }

  tick() {
    this.savePrev();
    this.prevBodyYaw = this.bodyYaw;
    this.prevHeadYaw = this.headYaw;
    this.prevLimbAmount = this.limbAmount;
    this.prevFuse = this.fuse;
    this.age++;
    const game = this.game, world = game.world;
    if (!world.isReady(Math.floor(this.x), Math.floor(this.z))) return;
    if (this.hurtTime > 0) this.hurtTime--;
    if (this.invuln > 0) this.invuln--;
    if (this.deathTime) {
      this.deathTime++;
      this.vx *= 0.6;
      this.vz *= 0.6;
      this.physics();
      if (this.deathTime >= 20) {
        this.remove();
        game.particles.smoke(this.x, this.y + this.h * 0.5, this.z, 12, 0.3);
        for (const [id, mn, mx] of this.def.drops) {
          const n = mn + Math.floor(Math.random() * (mx - mn + 1));
          if (n > 0) game.entities.spawnItem(this.x, this.y + 0.5, this.z, id, n);
        }
      }
      return;
    }

    const p = game.player;
    const dxp = p.x - this.x, dzp = p.z - this.z, dyp = p.y - this.y;
    const distP = Math.sqrt(dxp * dxp + dzp * dzp + dyp * dyp);
    const targetable = !p.dead && p.mode === 'survival';
    let speed = 0, moveYaw = this.yaw, jump = false;

    if (this.hostile && targetable && distP < 32) {
      moveYaw = Math.atan2(-dxp, -dzp);
      speed = this.def.speed;
      this.headYaw = moveYaw;
      this.pitch = Math.atan2(dyp + 1.6 - this.h * 0.85, Math.hypot(dxp, dzp));
      if (this.type === 'zombie') {
        if (this.attackCool > 0) this.attackCool--;
        if (Math.hypot(dxp, dzp) < 1.2 && Math.abs(dyp) < 1.6 && this.attackCool <= 0) {
          p.damage(3, this, 'zombie');
          this.attackCool = 20;
          this.swing = 1;
        }
      } else if (this.type === 'creeper') {
        if (distP < 3.2) {
          if (this.fuse === 0) game.audio.play('fuse', this);
          this.fuse++;
          speed = 0;
        } else if (distP > 6 && this.fuse > 0) this.fuse = Math.max(0, this.fuse - 1);
        else if (this.fuse > 0) { this.fuse++; speed = 0; }
        if (this.fuse >= 30) {
          this.remove();
          game.entities.explode(this.x, this.y + 0.8, this.z, 3);
          return;
        }
      }
    } else {
      this.fuse = Math.max(0, this.fuse - 1);
      // passeio aleatório
      if (this.panic > 0) {
        this.panic--;
        if (this.age % 20 === 0) this.yaw = Math.random() * Math.PI * 2;
        moveYaw = this.yaw;
        speed = this.def.speed * 2;
      } else if (this.eatGrass > 0) {
        this.eatGrass--;
        if (this.eatGrass === 4) {
          const bx = Math.floor(this.x), by = Math.floor(this.y - 0.5), bz = Math.floor(this.z);
          if (world.getBlock(bx, by + 1, bz) === B.TALL_GRASS) world.setBlock(bx, by + 1, bz, B.AIR);
          else if (world.getBlock(bx, by, bz) === B.GRASS) world.setBlock(bx, by, bz, B.DIRT);
        }
      } else {
        if (--this.moveTimer <= 0) {
          if (Math.random() < 0.55) {
            this.yaw = Math.random() * Math.PI * 2;
            this.walking = 20 + Math.floor(Math.random() * 60);
          }
          this.moveTimer = 60 + Math.floor(Math.random() * 120);
          if (this.type === 'sheep' && Math.random() < 0.3) this.eatGrass = 40;
        }
        if (this.walking > 0) {
          this.walking--;
          moveYaw = this.yaw;
          speed = this.def.speed;
        }
      }
      // olhar para o jogador de vez em quando
      if (distP < 8 && !p.dead) {
        if (--this.lookTimer <= 0) this.lookTimer = Math.random() < 0.4 ? 40 : -60;
      }
      if (this.lookTimer > 0) {
        this.headYaw = approachAngle(this.headYaw, Math.atan2(-dxp, -dzp), 0.3);
        this.pitch = Math.atan2(dyp + 1.6 - this.h * 0.8, Math.hypot(dxp, dzp)) * 0.7;
      } else {
        this.headYaw = approachAngle(this.headYaw, speed ? moveYaw : this.bodyYaw, 0.2);
        this.pitch *= 0.8;
      }
      // não pular de penhascos nem entrar na água à toa
      if (speed && !this.panic) {
        const ax = this.x - Math.sin(moveYaw) * 0.8, az = this.z - Math.cos(moveYaw) * 0.8;
        const fy = Math.floor(this.y);
        let drop = 0;
        while (drop < 4 && !SOLID[world.getBlock(Math.floor(ax), fy - 1 - drop, Math.floor(az))]) drop++;
        if (drop >= 3 || LIQUID[world.getBlock(Math.floor(ax), fy - 1, Math.floor(az))] || LIQUID[world.getBlock(Math.floor(ax), fy, Math.floor(az))]) {
          speed = 0;
          this.walking = 0;
          this.yaw += Math.PI * (0.5 + Math.random());
        }
      }
    }

    if (speed) {
      if (this.hitH && this.onGround) jump = true;
      this.bodyYaw = approachAngle(this.bodyYaw, moveYaw, 0.35);
    }
    // limita a cabeça em relação ao corpo
    const rel = wrapAngle(this.headYaw - this.bodyYaw);
    if (Math.abs(rel) > 1.3) this.bodyYaw = approachAngle(this.bodyYaw, this.headYaw, Math.abs(rel) - 1.3);

    const liq = liquidIn(world, this);
    const fx = -Math.sin(moveYaw) * speed, fz = -Math.cos(moveYaw) * speed;
    if (liq) {
      this.vx = this.vx * 0.8 + fx * 0.3;
      this.vz = this.vz * 0.8 + fz * 0.3;
      if (liquidIn(world, this, this.h * 0.5, this.h * 0.7)) this.vy += 0.045;
      this.fallDistance = 0;
      const r = moveBox(world, this, this.vx, this.vy, this.vz);
      if (r.hitY) this.vy = 0;
      this.hitH = r.hitX || r.hitZ;
      this.onGround = r.onGround;
      this.vy = (this.vy - 0.02) * 0.8;
      if (this.hitH && speed) this.vy = 0.3;
      if (liq === B.LAVA && this.age % 10 === 0) this.damage(4, null);
    } else {
      // aceleração tal que, com o atrito aplicado depois, a velocidade final seja a desejada
      const acc = this.onGround ? (1 - 0.546) / 0.546 : 0.1;
      this.vx += fx * acc;
      this.vz += fz * acc;
      if (jump) this.vy = 0.42;
      const prevY = this.y;
      this.physics();
      if (!this.onGround && this.y < prevY) this.fallDistance += prevY - this.y;
      if (this.onGround) {
        if (this.fallDistance > 3) this.damage(Math.ceil(this.fallDistance - 3), null);
        this.fallDistance = 0;
      }
    }
    if (this.y < -20) this.remove();

    const moved = Math.hypot(this.x - this.px, this.z - this.pz);
    this.limbAmount += (Math.min(1, moved * 4) - this.limbAmount) * 0.4;
    this.limbSwing += this.limbAmount;
    if (this.swing > 0) this.swing = Math.max(0, this.swing - 1 / 6);

    // queimar ao sol
    if (this.type === 'zombie' && world.daylight() > 0.75 && !liq) {
      const L = world.getLight(Math.floor(this.x), Math.floor(this.y + 1.6), Math.floor(this.z));
      if (L >> 4 >= 15) {
        if (++this.burnTimer % 20 === 0) this.damage(1, null);
        if (this.age % 2 === 0) game.particles.flame(this.x + (Math.random() - 0.5) * 0.6, this.y + Math.random() * 1.9, this.z + (Math.random() - 0.5) * 0.6);
      }
    }
    if (--this.soundTimer <= 0) {
      this.soundTimer = 200 + Math.random() * 400;
      if (this.def.sound && distP < 20) game.audio.play(this.def.sound, this);
    }
  }

  render(a, env) {
    const [x, y, z] = this.lerpPos(a);
    const root = this.model.root;
    root.position.set(x, y, z);
    const by = this.prevBodyYaw + wrapAngle(this.bodyYaw - this.prevBodyYaw) * a;
    const hy = this.prevHeadYaw + wrapAngle(this.headYaw - this.prevHeadYaw) * a;
    root.rotation.y = by + Math.PI;
    const amt = this.prevLimbAmount + (this.limbAmount - this.prevLimbAmount) * a;
    const fuse = this.type === 'creeper' ? (this.prevFuse + (this.fuse - this.prevFuse) * a) / 30 : 0;
    this.model.animate({
      limbSwing: this.limbSwing + amt * a,
      limbAmount: amt,
      headYaw: wrapAngle(hy - by),
      headPitch: this.pitch,
      swing: this.swing ? 1 - this.swing : 0,
      age: this.age + a,
      zombieArms: this.type === 'zombie',
      death: this.deathTime ? this.deathTime + a : 0,
      fuse,
      eatGrass: this.eatGrass > 0 ? Math.min(1, Math.min(this.eatGrass, 40 - this.eatGrass) / 6) * 0.9 : 0,
    });
    const b = brightnessAt(this.game.world, x, y + this.h * 0.7, z, env.skyDarken, env.gamma);
    const flash = fuse > 0 && Math.floor(fuse * 30 / 4) % 2 === 0 ? 0.7 : 0;
    this.model.setLight(b, this.hurtTime > 0 || this.deathTime > 0, flash);
  }

  remove() {
    super.remove();
  }
}

export class EntityManager {
  constructor(game) {
    this.game = game;
    this.list = [];
    this.group = new THREE.Group();
    game.renderer.scene.add(this.group);
    this.spawnTimer = 0;
  }
  add(e) {
    this.list.push(e);
    if (e.object) this.group.add(e.object);
    return e;
  }
  clear() {
    for (const e of this.list) this.disposeEntity(e);
    this.list = [];
  }
  disposeEntity(e) {
    if (e.object) this.group.remove(e.object);
    if (e.model) e.model.dispose();
  }
  spawnItem(x, y, z, id, count = 1, pickupDelay = 10) {
    if (!id || count <= 0) return null;
    return this.add(new ItemEntity(this.game, x, y, z, id, count, pickupDelay));
  }
  spawnFalling(x, y, z, id) {
    return this.add(new FallingBlock(this.game, x, y, z, id));
  }
  spawnTNT(x, y, z, fuse) {
    return this.add(new PrimedTNT(this.game, x, y, z, fuse));
  }
  spawnMob(type, x, y, z) {
    return this.add(new Mob(this.game, type, x, y, z));
  }

  tick() {
    for (const e of this.list) if (!e.dead) e.tick();
    if (this.list.some((e) => e.dead)) {
      for (const e of this.list) if (e.dead) this.disposeEntity(e);
      this.list = this.list.filter((e) => !e.dead);
    }
    if (++this.spawnTimer >= 20) {
      this.spawnTimer = 0;
      this.naturalSpawn();
    }
  }

  render(alpha, env) {
    for (const e of this.list) {
      e.render(alpha, env);
    }
  }

  // Raio contra mobs: retorna o mais próximo atingido
  raycastMobs(ox, oy, oz, dx, dy, dz, maxDist) {
    let best = null, bestT = maxDist;
    for (const e of this.list) {
      if (!(e instanceof Mob) || e.deathTime) continue;
      const g = 0.1;
      const box = [e.x - e.w - g, e.y - g, e.z - e.w - g, e.x + e.w + g, e.y + e.h + g, e.z + e.w + g];
      let tmin = 0, tmax = bestT, ok = true;
      const o = [ox, oy, oz], d = [dx, dy, dz];
      for (let a = 0; a < 3 && ok; a++) {
        if (Math.abs(d[a]) < 1e-9) {
          if (o[a] < box[a] || o[a] > box[a + 3]) ok = false;
        } else {
          let t1 = (box[a] - o[a]) / d[a], t2 = (box[a + 3] - o[a]) / d[a];
          if (t1 > t2) [t1, t2] = [t2, t1];
          tmin = Math.max(tmin, t1);
          tmax = Math.min(tmax, t2);
          if (tmin > tmax) ok = false;
        }
      }
      if (ok && tmin < bestT) {
        bestT = tmin;
        best = e;
      }
    }
    return best ? { mob: best, dist: bestT } : null;
  }

  explode(x, y, z, power) {
    const game = this.game;
    game.world.explode(x, y, z, power);
    game.audio.play('explode', { x, y, z });
    game.particles.explosion(x, y, z, power);
    const R = power * 2;
    const hit = (e, isPlayer) => {
      const dx = e.x - x, dy = e.y + e.h * 0.5 - y, dz = e.z - z;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d > R) return;
      const imp = 1 - d / R;
      const dmg = Math.floor(((imp * imp + imp) / 2) * 7 * power + 1);
      const n = d || 1;
      e.vx += (dx / n) * imp * 1.2;
      e.vy += (dy / n) * imp * 1.2 + 0.2 * imp;
      e.vz += (dz / n) * imp * 1.2;
      if (isPlayer) e.damage(dmg, null, 'explosion');
      else if (e instanceof Mob) e.damage(dmg, null);
    };
    for (const e of this.list) if (!e.dead && !(e instanceof PrimedTNT)) hit(e, false);
    hit(game.player, true);
  }

  // Aparecimento natural de animais e monstros
  naturalSpawn() {
    const game = this.game, world = game.world, p = game.player;
    let passive = 0, hostile = 0;
    for (const e of this.list) {
      if (!(e instanceof Mob)) continue;
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      if (e.hostile) {
        hostile++;
        if (d > 80 || (world.daylight() > 0.8 && d > 40 && Math.random() < 0.05)) e.remove();
      } else passive++;
    }
    const tryPos = (minD, maxD) => {
      const a = Math.random() * Math.PI * 2, d = minD + Math.random() * (maxD - minD);
      const x = Math.floor(p.x + Math.cos(a) * d), z = Math.floor(p.z + Math.sin(a) * d);
      if (!world.isReady(x, z)) return null;
      return [x, z];
    };
    if (passive < 14 && Math.random() < 0.25) {
      const pos = tryPos(20, 56);
      if (pos) {
        const [x, z] = pos;
        let y = CH - 2;
        while (y > 1 && !OPAQUE[world.getBlock(x, y, z)] && !LIQUID[world.getBlock(x, y, z)]) y--;
        if (world.getBlock(x, y, z) === B.GRASS && (world.getLight(x, y + 1, z) >> 4) >= 9) {
          const types = ['pig', 'sheep', 'cow'];
          const type = types[Math.floor(Math.random() * 3)];
          const n = 2 + Math.floor(Math.random() * 3);
          for (let i = 0; i < n; i++) {
            const sx = x + Math.floor(Math.random() * 5) - 2, sz = z + Math.floor(Math.random() * 5) - 2;
            let sy = y + 3;
            while (sy > y - 3 && !SOLID[world.getBlock(sx, sy - 1, sz)]) sy--;
            if (!SOLID[world.getBlock(sx, sy, sz)] && !SOLID[world.getBlock(sx, sy + 1, sz)] && !LIQUID[world.getBlock(sx, sy, sz)]) this.spawnMob(type, sx + 0.5, sy, sz + 0.5);
          }
        }
      }
    }
    if (hostile < 12 && game.settings.difficulty !== 'peaceful') {
      for (let k = 0; k < 3; k++) {
        const pos = tryPos(24, 48);
        if (!pos) continue;
        const [x, z] = pos;
        const y0 = Math.min(CH - 3, Math.floor(p.y) + 16);
        for (let y = y0; y > Math.max(2, p.y - 24); y--) {
          if (!SOLID[world.getBlock(x, y - 1, z)] || SOLID[world.getBlock(x, y, z)] || SOLID[world.getBlock(x, y + 1, z)]) continue;
          if (LIQUID[world.getBlock(x, y, z)] || world.getBlock(x, y - 1, z) === B.LEAVES) continue;
          const L = world.getLight(x, y, z);
          const skyEff = (L >> 4) - (1 - world.daylight()) * 11;
          if ((L & 15) < 7 && skyEff < 7) {
            this.spawnMob(Math.random() < 0.75 ? 'zombie' : 'creeper', x + 0.5, y, z + 0.5);
          }
          break;
        }
      }
    }
  }
}

export { MOBS };

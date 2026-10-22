// Jogador: movimento, sobrevivência, interação com blocos e mobs.
import { B, BLOCKS, info, isBlock, breakTicks, canHarvest } from './blocks.js';
import { moveBox, hasGround, liquidIn, touchesBlock, boxIntersectsBlock } from './physics.js';
import { Inventory } from './inventory.js';
import { SOLID, LIQUID } from './world.js';
import { CH } from './consts.js';

const REACH_SURVIVAL = 4.5, REACH_CREATIVE = 5;

export class Player {
  constructor(game) {
    this.game = game;
    this.x = this.px = 0;
    this.y = this.py = 80;
    this.z = this.pz = 0;
    this.vx = this.vy = this.vz = 0;
    this.w = 0.3;
    this.h = 1.8;
    this.yaw = 0;
    this.pitch = 0;
    this.bodyYaw = this.prevBodyYaw = 0;
    this.onGround = false;
    this.sneaking = false;
    this.sprinting = false;
    this.flying = false;
    this.mode = 'survival';
    this.health = 20;
    this.food = 20;
    this.saturation = 5;
    this.exhaustion = 0;
    this.air = 300;
    this.fallDistance = 0;
    this.hurtTime = 0;
    this.invuln = 0;
    this.dead = false;
    this.inventory = new Inventory();
    this.swingTick = -1;
    this.swing = this.prevSwing = 0;
    this.equip = this.prevEquip = 1;
    this.lastHeldKey = '';
    this.breaking = null;
    this.target = null;
    this.targetMob = null;
    this.limbSwing = 0;
    this.limbAmount = this.prevLimbAmount = 0;
    this.walkDist = this.prevWalkDist = 0;
    this.bob = this.prevBob = 0;
    this.jumpTimer = 0;
    this.lastJumpPress = -100;
    this.lastForwardPress = -100;
    this.ticks = 0;
    this.useCooldown = 0;
    this.creativeBreakCd = 0;
    this.eatTicks = 0;
    this.regenTimer = 0;
    this.starveTimer = 0;
    this.envDamageTimer = 0;
    this.cameraMode = 0; // 0 primeira pessoa, 1 terceira (atrás), 2 terceira (frente)
    this.spawn = { x: 0.5, y: 80, z: 0.5 };
    this.fovMod = this.prevFovMod = 1;
    this.inWater = false;
    this.eyesInWater = false;
    this.inLava = false;
    this.stepDist = 0;
    this.attackCooldown = 0;
  }

  get eyeHeight() {
    return this.sneaking ? 1.54 : 1.62;
  }
  get reach() {
    return this.mode === 'creative' ? REACH_CREATIVE : REACH_SURVIVAL;
  }
  lookDir() {
    const cp = Math.cos(this.pitch);
    return [-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp];
  }

  setPosition(x, y, z) {
    this.x = this.px = x;
    this.y = this.py = y;
    this.z = this.pz = z;
    this.vx = this.vy = this.vz = 0;
    this.fallDistance = 0;
  }

  // ---------- tick (20 por segundo) ----------
  tick(input) {
    const game = this.game, world = game.world;
    this.px = this.x;
    this.py = this.y;
    this.pz = this.z;
    this.prevBodyYaw = this.bodyYaw;
    this.prevSwing = this.swing;
    this.prevEquip = this.equip;
    this.prevLimbAmount = this.limbAmount;
    this.prevWalkDist = this.walkDist;
    this.prevBob = this.bob;
    this.prevFovMod = this.fovMod;
    this.ticks++;
    if (this.hurtTime > 0) this.hurtTime--;
    if (this.invuln > 0) this.invuln--;
    if (this.useCooldown > 0) this.useCooldown--;
    if (this.creativeBreakCd > 0) this.creativeBreakCd--;
    if (this.attackCooldown > 0) this.attackCooldown--;
    if (this.dead) return;

    const ready = world.isReady(Math.floor(this.x), Math.floor(this.z));
    const creative = this.mode === 'creative';

    // entrada de movimento
    let forward = input.moveY, strafe = input.moveX;
    if (input.jumpPressed) {
      if (creative && this.ticks - this.lastJumpPress < 7) {
        this.flying = !this.flying;
        this.vy = 0;
      }
      this.lastJumpPress = this.ticks;
    }
    if (input.forwardPressed) {
      if (this.ticks - this.lastForwardPress < 7) this.sprintRequest = true;
      this.lastForwardPress = this.ticks;
    }
    this.sneaking = input.sneak && !this.flying;
    if (this.sneaking) {
      forward *= 0.3;
      strafe *= 0.3;
    }
    if (this.eatTicks > 0) {
      forward *= 0.2;
      strafe *= 0.2;
    }
    const canSprint = creative || this.food > 6;
    if ((input.sprint || this.sprintRequest) && forward > 0.8 && !this.sneaking && canSprint && !this.eatTicks) this.sprinting = true;
    if (forward <= 0.8 || this.sneaking || !canSprint || (this.hitH && !this.flying)) {
      this.sprinting = false;
      this.sprintRequest = false;
    }

    this.inWater = !!(ready && liquidIn(world, this) === B.WATER);
    this.inLava = !!(ready && liquidIn(world, this) === B.LAVA);
    const eyeBlock = world.getBlock(Math.floor(this.x), Math.floor(this.y + this.eyeHeight), Math.floor(this.z));
    this.eyesInWater = eyeBlock === B.WATER;

    if (ready) this.move(forward, strafe, input, creative);

    // animação das pernas e balanço da câmera
    const dh = Math.hypot(this.x - this.px, this.z - this.pz);
    this.limbAmount += (Math.min(1, dh * 4) - this.limbAmount) * 0.4;
    this.limbSwing += this.limbAmount;
    this.walkDist += dh * 0.6;
    this.bob += ((this.onGround || this.inWater) && !this.flying ? Math.min(0.1, dh) - this.bob : -this.bob) * 0.4;
    this.fovMod += ((this.sprinting ? 1.15 : this.flying ? 1.08 : 1) - this.fovMod) * 0.5;

    // passos
    if (this.onGround && !this.sneaking) {
      this.stepDist += dh;
      if (this.stepDist > 1.7) {
        this.stepDist = 0;
        const below = world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.2), Math.floor(this.z));
        if (below && BLOCKS[below]) game.audio.material('step', BLOCKS[below].sound, { x: this.x, y: this.y, z: this.z });
      }
    } else if (this.inWater && dh > 0.05 && this.ticks % 12 === 0) game.audio.play('swim');

    // corpo segue a cabeça
    if (dh > 0.01) {
      this.bodyYaw = approach(this.bodyYaw, Math.atan2(this.px - this.x, this.pz - this.z), 0.3);
      if (Math.abs(wrap(this.yaw - this.bodyYaw)) > 1.6) this.bodyYaw = this.yaw;
    }
    const rel = wrap(this.yaw - this.bodyYaw);
    if (Math.abs(rel) > 0.9) this.bodyYaw = this.yaw - Math.sign(rel) * 0.9;

    if (!creative) this.survivalTick(ready);

    // golpe e troca de item
    if (this.swingTick >= 0) {
      this.swingTick++;
      if (this.swingTick >= 6) this.swingTick = -1;
    }
    this.swing = this.swingTick >= 0 ? this.swingTick / 6 : 0;
    const held = this.inventory.held;
    const heldKey = `${this.inventory.selected}:${held ? held.id : 0}`;
    if (heldKey !== this.lastHeldKey) {
      if (this.lastHeldKey.split(':')[1] !== heldKey.split(':')[1]) this.equip = 0;
      this.lastHeldKey = heldKey;
      this.eatTicks = 0;
    }
    this.equip = Math.min(1, this.equip + 0.35);

    if (ready) this.interact(input, creative);
  }

  move(forward, strafe, input, creative) {
    const world = this.game.world;
    let speed;
    if (this.flying) speed = this.sprinting ? 0.1 : 0.05;
    else if (this.inWater || this.inLava) speed = 0.02;
    else if (this.onGround) speed = 0.1 * (this.sprinting ? 1.3 : 1);
    else speed = this.sprinting ? 0.026 : 0.02;
    let f = strafe * strafe + forward * forward;
    if (f >= 1e-4) {
      f = Math.sqrt(f);
      if (f < 1) f = 1;
      f = speed / f;
      const s = strafe * f, fw = forward * f;
      const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
      this.vx += -fw * sin + s * cos;
      this.vz += -fw * cos - s * sin;
    }
    const prevY = this.y;
    if (this.flying) {
      if (input.jump) this.vy += 0.15;
      if (input.sneak) this.vy -= 0.15;
      const r = moveBox(world, this, this.vx, this.vy, this.vz);
      this.collide(r);
      this.vy *= 0.6;
      this.vx *= 0.91;
      this.vz *= 0.91;
      if (r.onGround && !input.jump) this.flying = false;
      this.fallDistance = 0;
    } else if (this.inWater || this.inLava) {
      if (input.jump) this.vy += 0.04;
      const r = moveBox(world, this, this.vx, this.vy, this.vz);
      this.collide(r);
      const drag = this.inLava ? 0.5 : 0.8;
      this.vx *= drag;
      this.vy *= drag;
      this.vz *= drag;
      this.vy -= 0.02;
      // sair da água subindo na borda
      if (this.hitH && (input.jump || this.vy > -0.1)) this.vy = 0.3;
      this.fallDistance = 0;
    } else {
      if (input.jump && this.onGround && this.jumpTimer === 0) {
        this.vy = 0.42;
        this.jumpTimer = 10;
        if (this.sprinting) {
          this.vx -= Math.sin(this.yaw) * 0.2;
          this.vz -= Math.cos(this.yaw) * 0.2;
          this.exhaustion += 0.2;
        } else this.exhaustion += 0.05;
      }
      if (this.jumpTimer > 0 && (!input.jump || this.onGround)) this.jumpTimer = Math.max(0, this.jumpTimer - 1);
      if (!input.jump) this.jumpTimer = 0;
      // agachado: não cai da beirada
      if (this.sneaking && this.onGround) {
        const step = 0.05;
        let dx = this.vx, dz = this.vz;
        while (dx !== 0 && !hasGround(world, this, dx, 0)) dx = Math.abs(dx) < step ? 0 : dx - Math.sign(dx) * step;
        while (dz !== 0 && !hasGround(world, this, 0, dz)) dz = Math.abs(dz) < step ? 0 : dz - Math.sign(dz) * step;
        while (dx !== 0 && dz !== 0 && !hasGround(world, this, dx, dz)) {
          dx = Math.abs(dx) < step ? 0 : dx - Math.sign(dx) * step;
          dz = Math.abs(dz) < step ? 0 : dz - Math.sign(dz) * step;
        }
        this.vx = dx;
        this.vz = dz;
      }
      const r = moveBox(world, this, this.vx, this.vy, this.vz);
      this.collide(r);
      this.vy = (this.vy - 0.08) * 0.98;
      const fr = this.onGround ? 0.546 : 0.91;
      this.vx *= fr;
      this.vz *= fr;
      if (this.y < prevY) this.fallDistance += prevY - this.y;
      if (this.onGround) {
        if (this.fallDistance > 3 && this.mode === 'survival') {
          this.damage(Math.ceil(this.fallDistance - 3), null, 'fall');
          const below = world.getBlock(Math.floor(this.x), Math.floor(this.y - 0.2), Math.floor(this.z));
          if (below) this.game.audio.material('break', BLOCKS[below].sound, { x: this.x, y: this.y, z: this.z });
        }
        this.fallDistance = 0;
      }
    }
    if (this.sprinting) this.exhaustion += Math.hypot(this.x - this.px, this.z - this.pz) * 0.1;
    // entrou na água
    if (!this.wasInWater && this.inWater && this.vy < -0.3) {
      this.game.audio.play('splash', { x: this.x, y: this.y, z: this.z });
      this.game.particles.splash(this.x, Math.floor(this.y) + 1, this.z);
    }
    this.wasInWater = this.inWater;
  }

  collide(r) {
    if (r.hitX) this.vx = 0;
    if (r.hitZ) this.vz = 0;
    if (r.hitY) this.vy = 0;
    this.onGround = r.onGround;
    this.hitH = r.hitX || r.hitZ;
  }

  survivalTick(ready) {
    const world = this.game.world;
    if (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.food = Math.max(0, this.food - 1);
    }
    if (this.food >= 18 && this.health < 20) {
      if (++this.regenTimer >= 80) {
        this.regenTimer = 0;
        this.health = Math.min(20, this.health + 1);
        this.exhaustion += 3;
      }
    } else if (this.food <= 0) {
      if (++this.starveTimer >= 80) {
        this.starveTimer = 0;
        if (this.health > 1) this.damage(1, null, 'starve');
      }
    } else this.regenTimer = 0;
    if (this.eyesInWater) {
      this.air--;
      if (this.air <= -20) {
        this.air = 0;
        this.damage(2, null, 'drown');
      }
      if (Math.random() < 0.1) {
        const d = this.lookDir();
        this.game.particles.bubble(this.x + d[0] * 0.5, this.y + this.eyeHeight, this.z + d[2] * 0.5);
      }
    } else this.air = Math.min(300, this.air + 5);
    if (++this.envDamageTimer >= 10) {
      this.envDamageTimer = 0;
      if (this.inLava) this.damage(4, null, 'lava');
      else if (ready && touchesBlock(world, this, B.CACTUS)) this.damage(1, null, 'cactus');
      if (this.y < -10) this.damage(4, null, 'void');
    }
    if (this.inLava && this.ticks % 3 === 0) this.game.particles.flame(this.x + (Math.random() - 0.5) * 0.6, this.y + Math.random() * 1.8, this.z + (Math.random() - 0.5) * 0.6);
  }

  damage(amount, source, cause = 'generic') {
    if (this.mode === 'creative' && cause !== 'void') return false;
    if (this.dead || this.invuln > 0 || amount <= 0) return false;
    this.health -= amount;
    this.hurtTime = 10;
    this.invuln = 10;
    this.lastCause = cause;
    this.exhaustion += 0.1;
    if (source) {
      const dx = this.x - source.x, dz = this.z - source.z;
      const d = Math.hypot(dx, dz) || 1;
      this.vx += (dx / d) * 0.4;
      this.vz += (dz / d) * 0.4;
      this.vy = Math.min(0.4, this.vy + 0.36);
      this.hurtDir = Math.atan2(dz, dx);
    }
    this.game.audio.play('hurt');
    if (this.health <= 0) this.die(cause, source);
    return true;
  }

  die(cause, source) {
    this.health = 0;
    this.dead = true;
    this.deathTime = 0;
    const msgs = {
      fall: 'caiu de um lugar alto',
      drown: 'se afogou',
      lava: 'tentou nadar na lava',
      cactus: 'foi espetado até a morte',
      starve: 'morreu de fome',
      explosion: 'explodiu',
      void: 'caiu para fora do mundo',
      zombie: 'foi morto por um zumbi',
    };
    this.deathMessage = `${this.game.settings.playerName || 'Jogador'} ${msgs[cause] || 'morreu'}`;
    // espalha os itens
    const inv = this.inventory;
    for (let i = 0; i < inv.slots.length; i++) {
      const s = inv.slots[i];
      if (!s) continue;
      const e = this.game.entities.spawnItem(this.x, this.y + 1, this.z, s.id, s.count, 40);
      if (e) {
        const a = Math.random() * Math.PI * 2;
        e.vx = Math.cos(a) * 0.3 * Math.random();
        e.vz = Math.sin(a) * 0.3 * Math.random();
      }
      inv.slots[i] = null;
    }
    inv.changed();
    this.game.onPlayerDeath(this.deathMessage);
  }

  respawn() {
    this.dead = false;
    this.health = 20;
    this.food = 20;
    this.saturation = 5;
    this.air = 300;
    this.flying = false;
    this.hurtTime = 0;
    this.setPosition(this.spawn.x, this.spawn.y, this.spawn.z);
  }

  // ---------- olhar e interagir ----------
  updateTarget() {
    const world = this.game.world;
    const d = this.lookDir();
    const ex = this.x, ey = this.y + this.eyeHeight, ez = this.z;
    const hit = world.raycast(ex, ey, ez, d[0], d[1], d[2], this.reach);
    const mob = this.game.entities.raycastMobs(ex, ey, ez, d[0], d[1], d[2], this.reach);
    if (mob && (!hit || mob.dist < hit.dist)) {
      this.targetMob = mob.mob;
      this.target = null;
    } else {
      this.targetMob = null;
      this.target = hit;
    }
  }

  startSwing() {
    if (this.swingTick < 0 || this.swingTick >= 3) this.swingTick = 0;
  }

  interact(input, creative) {
    const game = this.game, inv = this.inventory;
    this.updateTarget();
    const hit = this.target;
    const heldId = inv.heldId();
    const heldInfo = heldId ? info(heldId) : null;

    // atacar / quebrar
    if (input.attack && !this.eatTicks) {
      if (this.targetMob && input.attackPressed) {
        this.startSwing();
        const dmg = heldInfo && heldInfo.damage ? heldInfo.damage : 1;
        const crit = !this.onGround && this.vy < 0 && !this.inWater;
        if (this.targetMob.damage(Math.floor(dmg * (crit ? 1.5 : 1)), this)) {
          if (this.sprinting) {
            this.targetMob.vx *= 1.6;
            this.targetMob.vz *= 1.6;
            this.sprinting = false;
          }
          game.audio.play('attack');
          if (crit) game.particles.smoke(this.targetMob.x, this.targetMob.y + this.targetMob.h * 0.7, this.targetMob.z, 6, 0.4, true);
          if (!creative && heldInfo && heldInfo.tool) {
            if (inv.damageHeld(heldInfo.tool.type === 'sword' ? 1 : 2)) game.audio.play('break_tool');
          }
          this.exhaustion += 0.1;
        }
      } else if (hit) {
        if (creative) {
          if (input.attackPressed || this.creativeBreakCd === 0) {
            if (!(heldInfo && heldInfo.tool && heldInfo.tool.type === 'sword')) this.breakTarget(hit, false);
            this.creativeBreakCd = 5;
            this.startSwing();
          }
        } else {
          const b = this.breaking;
          if (!b || b.x !== hit.x || b.y !== hit.y || b.z !== hit.z || b.id !== hit.id) {
            this.breaking = { x: hit.x, y: hit.y, z: hit.z, id: hit.id, progress: 0, ticks: 0, total: breakTicks(hit.id, heldId, this.eyesInWater, this.onGround || this.flying) };
          }
          const br = this.breaking;
          br.total = breakTicks(hit.id, heldId, this.eyesInWater, this.onGround);
          br.ticks++;
          br.progress = br.total === 0 ? 1 : br.ticks / br.total;
          if (br.ticks % 4 === 1) {
            game.audio.material('hit', BLOCKS[hit.id].sound, { x: hit.x + 0.5, y: hit.y + 0.5, z: hit.z + 0.5 });
            game.particles.blockHit(hit, game.brightnessAt(hit.x + 0.5 + hit.face[0], hit.y + 0.5 + hit.face[1], hit.z + 0.5 + hit.face[2]));
          }
          this.startSwing();
          if (br.progress >= 1 && br.total !== Infinity) {
            this.breakTarget(hit, true);
            this.breaking = null;
            this.creativeBreakCd = 0;
          }
        }
      } else {
        this.breaking = null;
        if (input.attackPressed) this.startSwing();
      }
    } else this.breaking = null;

    // usar / colocar
    const wantsUse = input.usePressed || (input.use && this.useCooldown === 0);
    if (heldInfo && heldInfo.food && input.use && this.food < 20 && !(hit && this.isInteractive(hit.id) && !this.sneaking)) {
      this.eatTicks++;
      if (this.eatTicks % 4 === 0 && this.eatTicks > 6) {
        game.audio.play('eat');
        const d = this.lookDir();
        game.particles.blockHit({ x: this.x + d[0] * 0.4 - 0.5, y: this.y + this.eyeHeight - 0.6, z: this.z + d[2] * 0.4 - 0.5, id: B.DIRT, face: [0, 1, 0] }, 1);
      }
      if (this.eatTicks >= 32) {
        this.food = Math.min(20, this.food + heldInfo.food);
        this.saturation = Math.min(this.food, this.saturation + heldInfo.sat);
        if (!creative) inv.consumeSelected(1);
        game.audio.play('burp');
        this.eatTicks = 0;
        this.useCooldown = 8;
      }
      return;
    }
    this.eatTicks = 0;
    if (!wantsUse) return;
    if (hit) {
      this.useCooldown = 4;
      if (!this.sneaking || !heldId) {
        if (this.useBlock(hit)) {
          this.startSwing();
          return;
        }
      }
      if (heldId && isBlock(heldId)) this.placeBlock(hit, heldId, creative);
    }
  }

  isInteractive(id) {
    return id === B.CRAFTING_TABLE || id === B.FURNACE || id === B.FURNACE_LIT || id === B.CHEST || id === B.TNT;
  }

  useBlock(hit) {
    const game = this.game;
    const id = hit.id;
    if (id === B.CRAFTING_TABLE) return game.ui.openCrafting(), true;
    if (id === B.FURNACE || id === B.FURNACE_LIT) return game.ui.openFurnace(hit.x, hit.y, hit.z), true;
    if (id === B.CHEST) return game.ui.openChest(hit.x, hit.y, hit.z), true;
    if (id === B.TNT) {
      game.world.setBlock(hit.x, hit.y, hit.z, B.AIR);
      game.entities.spawnTNT(hit.x, hit.y, hit.z, 80);
      return true;
    }
    return false;
  }

  breakTarget(hit, survival) {
    const game = this.game, world = game.world, inv = this.inventory;
    const id = hit.id, b = BLOCKS[id];
    if (b.hardness < 0 && survival) return;
    if (b.hardness < 0 && !survival && id === B.BEDROCK) {
      // no criativo dá para quebrar rocha-mãe (menos na camada 0)
      if (hit.y === 0) return;
    }
    const heldId = inv.heldId();
    world.setBlock(hit.x, hit.y, hit.z, B.AIR);
    game.audio.material('break', b.sound, { x: hit.x + 0.5, y: hit.y + 0.5, z: hit.z + 0.5 });
    game.particles.blockBreak(hit.x, hit.y, hit.z, id, game.brightnessAt(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5));
    if (survival) {
      if (canHarvest(id, heldId)) game.dropBlockItems(hit.x, hit.y, hit.z, id);
      const hi = heldId ? info(heldId) : null;
      if (hi && hi.tool && b.hardness > 0) {
        if (inv.damageHeld(hi.tool.type === 'sword' ? 2 : 1)) game.audio.play('break_tool');
      }
      this.exhaustion += 0.005;
    }
  }

  placeBlock(hit, id, creative) {
    const game = this.game, world = game.world;
    const hb = BLOCKS[hit.id];
    let x = hit.x, y = hit.y, z = hit.z;
    let face = hit.face;
    if (!hb.replaceable || hit.id === id) {
      x += face[0];
      y += face[1];
      z += face[2];
    } else face = [0, 1, 0];
    if (y < 0 || y >= CH) return;
    const cur = world.getBlock(x, y, z);
    if (cur !== B.AIR && !BLOCKS[cur].replaceable) return;
    const b = BLOCKS[id];
    let meta = 0;
    if (id === B.TORCH) {
      if (face[1] < 0) return;
      if (face[1] === 0) meta = face[0] === 1 ? 1 : face[0] === -1 ? 2 : face[2] === 1 ? 3 : 4;
    }
    if (b.oriented) {
      const sx = Math.sin(this.yaw), cz = Math.cos(this.yaw);
      meta = Math.abs(cz) > Math.abs(sx) ? (cz > 0 ? 0 : 2) : sx > 0 ? 3 : 1;
    }
    if (b.solid) {
      if (boxIntersectsBlock(this, x, y, z) && !this.flying) return;
      if (boxIntersectsBlock(this, x, y, z)) return;
      for (const e of game.entities.list) if (e.def && !e.deathTime && boxIntersectsBlock(e, x, y, z)) return;
    }
    world.setBlock(x, y, z, id, meta);
    if (b.needsSupport && !world.supported(x, y, z, id)) {
      world.setBlock(x, y, z, cur);
      return;
    }
    if (id === B.CHEST) world.tileEntities.set(`${x},${y},${z}`, game.newChest());
    if (id === B.FURNACE) world.tileEntities.set(`${x},${y},${z}`, game.newFurnace());
    game.audio.material('place', b.sound, { x: x + 0.5, y: y + 0.5, z: z + 0.5 });
    this.startSwing();
    if (!creative) this.inventory.consumeSelected(1);
  }

  pickBlock() {
    const hit = this.target;
    if (!hit || this.mode !== 'creative') return;
    let id = hit.id;
    if (id === B.FURNACE_LIT) id = B.FURNACE;
    const inv = this.inventory;
    const idx = inv.slots.findIndex((s, i) => i < 9 && s && s.id === id);
    if (idx >= 0) inv.selected = idx;
    else {
      const empty = inv.slots.findIndex((s, i) => i < 9 && !s);
      if (empty >= 0) inv.selected = empty;
      inv.slots[inv.selected] = { id, count: 1, damage: 0 };
    }
    inv.changed();
  }

  dropHeld(all) {
    const inv = this.inventory;
    const s = inv.held;
    if (!s) return;
    const n = all ? s.count : 1;
    const d = this.lookDir();
    const e = this.game.entities.spawnItem(this.x, this.y + this.eyeHeight - 0.3, this.z, s.id, n, 40);
    if (e) {
      e.vx = d[0] * 0.3;
      e.vy = d[1] * 0.3 + 0.1;
      e.vz = d[2] * 0.3;
      if (s.damage) e.damage = s.damage;
    }
    inv.consumeSelected(n);
    this.startSwing();
  }
}

function wrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function approach(cur, target, k) {
  return cur + wrap(target - cur) * k;
}
export { wrap, SOLID, LIQUID };

// Inteligência artificial dos dinossauros e controle da população.
// Cada criatura tem necessidades (fome, sede, energia) e reage ao ambiente:
// herbívoros andam em manadas, pastam, bebem e fogem ou se defendem;
// carnívoros caçam (raptores em bando), comem carcaças e disputam território.
import { Creature } from './creature.js';
import { SPECIES, POPULATION } from './config.js';
import { clamp, wrapAngle } from './util.js';
import { HALF } from './world.js';

class Herd {
  constructor(spec) {
    this.spec = spec;
    this.members = [];
    this.goal = null;
    this.timer = 0;
  }
  get alive() {
    return this.members.filter((m) => !m.dead && !m.remove);
  }
  center() {
    const a = this.alive;
    let x = 0;
    let z = 0;
    for (const m of a) {
      x += m.pos.x;
      z += m.pos.z;
    }
    return a.length ? { x: x / a.length, z: z / a.length } : null;
  }
  update(dt, world) {
    this.timer -= dt;
    const c = this.center();
    if (!c) return;
    if (!this.goal || this.timer <= 0 || Math.hypot(this.goal.x - c.x, this.goal.z - c.z) < 10) {
      this.timer = 25 + Math.random() * 40;
      // sede média alta → vai para a água
      const a = this.alive;
      const thirst = a.reduce((s, m) => s + m.thirst, 0) / a.length;
      if (thirst < 55) {
        const w = world.nearestWater(c.x, c.z, 260);
        if (w) {
          this.goal = { x: w.x, z: w.z };
          return;
        }
      }
      for (let i = 0; i < 12; i++) {
        const ang = Math.random() * Math.PI * 2;
        const d = 50 + Math.random() * 110 * this.spec.ai.roam * 1.6;
        const x = clamp(c.x + Math.cos(ang) * d, -HALF + 60, HALF - 60);
        const z = clamp(c.z + Math.sin(ang) * d, -HALF + 60, HALF - 60);
        const h = world.height(x, z);
        if (h > 0.8 && h < 30 && world.slope(x, z) < 0.5) {
          this.goal = { x, z };
          return;
        }
      }
    }
  }
}

export class Brain {
  constructor(c, game, herd) {
    this.c = c;
    this.game = game;
    this.herd = herd;
    this.state = 'wander';
    this.target = null;
    this.goal = null;
    this.think = Math.random() * 0.5;
    this.stateT = 0;
    this.offset = { x: (Math.random() - 0.5) * 16, z: (Math.random() - 0.5) * 16 };
    this.stuck = 0;
    this.detour = 0;
    this.lastPos = c.pos.clone();
  }

  update(dt) {
    const c = this.c;
    if (c.dead) return;
    this.stateT += dt;
    this.think -= dt;
    if (this.think <= 0) {
      this.think = 0.35 + Math.random() * 0.3;
      this.decide();
    }
    this.act(dt);
  }

  // ------------------------------------------------------------------ decisão
  decide() {
    const c = this.c;
    const sp = c.spec;
    const g = this.game;
    const carn = sp.diet === 'carnivoro';
    let threat = null;
    let threatD = 1e9;
    let prey = null;
    let preyD = 1e9;
    for (const o of g.creatures) {
      if (o === c || o.dead) continue;
      const d = c.pos.distanceTo(o.pos);
      if (d > 110) continue;
      const oCarn = o.spec.diet === 'carnivoro';
      // ameaça: carnívoro forte o suficiente por perto
      if (oCarn && o.spec !== sp) {
        const ratio = o.power / (c.power + 1);
        const fearR = (25 + 30 * o.scale) * (carn ? 0.6 : 1) * (0.5 + sp.ai.fear * 0.7);
        if (ratio > (carn ? 1.6 : 0.35) && d < fearR && d < threatD) {
          threat = o;
          threatD = d;
        }
      }
      // presa
      if (carn && o.spec !== sp && !(o.spec.diet === 'carnivoro' && o.power > c.power * 0.7)) {
        const ratio = o.power / (c.power + 1);
        if (ratio < sp.ai.preyMax && d < preyD) {
          prey = o;
          preyD = d;
        }
      }
    }
    // quem me atacou recentemente
    const agg = c.lastAttacker && !c.lastAttacker.dead && c.age - c.lastHurtT < 15 ? c.lastAttacker : null;
    if (agg && !threat && (agg.spec.diet === 'carnivoro' || agg.isPlayer)) threat = agg;

    // T. rex: território contra outros carnívoros (inclusive o jogador)
    if (carn && sp.ai.aggression > 0.85 && !threat) {
      const p = g.player;
      if (p && !p.dead && p.spec !== sp && c.pos.distanceTo(p.pos) < 30 && p.power < c.power * 1.2) {
        this.set('hunt', p);
        return;
      }
    }

    if (threat) {
      const canFight =
        (sp.ai.defend && threat.power < c.power * 1.6 && c.growth > 0.5) ||
        (carn && threat.power < c.power * 1.3) ||
        (agg === threat && threat.power < c.power * 0.8);
      if (canFight && c.hp > c.maxHp * 0.25) this.set('fight', threat);
      else this.set('flee', threat);
      c.resting = false;
      return;
    }
    if (this.state === 'flee' && this.stateT < 6) return;

    // matilha: ajuda quem está caçando
    if (carn && sp.ai.pack && this.herd) {
      for (const m of this.herd.alive) {
        if (m !== c && m.brain && m.brain.state === 'hunt' && m.brain.target && !m.brain.target.dead) {
          this.set('hunt', m.brain.target);
          return;
        }
      }
    }

    if (c.eating || c.drinking) {
      if ((c.eating && c.hunger > 97) || (c.drinking && c.thirst > 97)) c.stopFeeding();
      else return;
    }

    // continua a caçada em curso
    if (this.state === 'hunt' && this.target && !this.target.dead && this.stateT < 30) {
      const d = c.pos.distanceTo(this.target.pos);
      // ferido demais: desiste e foge
      if (c.hp < c.maxHp * 0.35) {
        this.set('flee', this.target);
        return;
      }
      if (d < 120 && c.stamina > 5) return;
    }

    if (c.thirst < 40) {
      const w = this.game.world.nearestWater(c.pos.x, c.pos.z, 300);
      if (w) {
        this.set('drink', null, w);
        return;
      }
    }

    if (c.hunger < (carn ? 55 : 70)) {
      if (carn) {
        let best = null;
        let bd = 140;
        for (const o of g.creatures) {
          if (!o.dead || o.meat <= 0) continue;
          const d = c.pos.distanceTo(o.pos);
          if (d < bd) {
            bd = d;
            best = o;
          }
        }
        if (best) {
          this.set('scavenge', best);
          return;
        }
        if (prey && preyD < 90) {
          this.set('hunt', prey);
          return;
        }
      } else {
        const type = sp.ai.browser ? 'tree' : 'plant';
        const ref = this.herd && this.herd.goal ? this.herd.center() || c.pos : c.pos;
        const f = g.world.nearestFood(c.pos.x, c.pos.z, 45, type) || g.world.nearestFood(ref.x, ref.z, 70, type);
        if (f) {
          this.set('graze', f);
          return;
        }
      }
    }

    // descanso à noite (ou exausto)
    const w = g.world;
    if ((w.isNight && Math.random() < 0.3) || c.stamina < 15) {
      if (this.state !== 'rest') this.set('rest');
      return;
    }
    if (this.state === 'rest' && w.isNight) return;
    c.resting = false;
    if (this.state !== 'wander') this.set('wander');
  }

  set(state, target = null, goal = null) {
    if (this.state !== state || this.target !== target) this.stateT = 0;
    this.state = state;
    this.target = target;
    this.goal = goal;
    if (state !== 'rest') this.c.resting = false;
    if (state !== 'graze' && state !== 'scavenge' && state !== 'drink') this.c.stopFeeding();
  }

  // ------------------------------------------------------------------ ação
  act(dt) {
    const c = this.c;
    const g = this.game;
    c.wantRun = false;
    c.lookYaw = 0;
    switch (this.state) {
      case 'flee': {
        const t = this.target;
        if (!t || t.dead) {
          this.set('wander');
          break;
        }
        const ax = c.pos.x - t.pos.x;
        const az = c.pos.z - t.pos.z;
        this.steer(c.pos.x + ax * 3, c.pos.z + az * 3, c.runSpeed, true);
        if (Math.hypot(ax, az) > 90) this.set('wander');
        break;
      }
      case 'fight':
      case 'hunt': {
        const t = this.target;
        if (!t || t.dead) {
          this.set('wander');
          break;
        }
        const d = t.distToBody(c.mouth);
        const reach = c.spec.stats.reach * c.scale + 0.4;
        const tp = t.pos;
        if (c.spec.attack === 'tail') {
          // vira de costas para acertar com a cauda
          const tail = c.localToWorld(c.L.tailZ * 0.75);
          const dt2 = t.distToBody(tail);
          if (dt2 < reach * 0.9) {
            c.wantSpeed = 0;
            c.startAttack();
          } else if (c.pos.distanceTo(tp) < c.L.length * c.scale * 0.8) {
            const away = Math.atan2(c.pos.x - tp.x, c.pos.z - tp.z);
            c.wantYaw = away;
            c.wantSpeed = c.walkSpeed * 0.4;
          } else this.steer(tp.x, tp.z, c.walkSpeed, false);
        } else if (d < reach * 0.85) {
          c.wantSpeed = 0;
          c.wantYaw = Math.atan2(tp.x - c.pos.x, tp.z - c.pos.z);
          if (Math.abs(wrapAngle(c.wantYaw - c.yaw)) < 0.6) c.startAttack();
        } else {
          const run = d > reach * 3 && c.stamina > 8;
          this.steer(tp.x, tp.z, run ? c.runSpeed : c.walkSpeed, run);
        }
        if (this.state === 'hunt' && this.stateT > 35) this.set('wander');
        if (this.state === 'fight' && c.pos.distanceTo(tp) > 60) this.set('wander');
        break;
      }
      case 'scavenge': {
        const t = this.target;
        if (!t || t.meat <= 0 || t.remove) {
          this.set('wander');
          break;
        }
        if (c.eating) {
          c.wantSpeed = 0;
          break;
        }
        const d = t.distToBody(c.mouth);
        if (d < 1.5 + c.radius * 0.5) {
          c.wantSpeed = 0;
          c.startEat({ kind: 'carcass', target: t });
        } else this.steer(t.pos.x, t.pos.z, c.walkSpeed, false);
        break;
      }
      case 'graze': {
        const f = this.target;
        if (!f || f.food < 2) {
          this.set('wander');
          break;
        }
        if (c.eating) {
          c.wantSpeed = 0;
          break;
        }
        const m = c.mouth;
        const reach = 1.2 + c.radius * 0.6 + (f.type === 'tree' ? 3 : 0);
        if (Math.hypot(m.x - f.x, m.z - f.z) < reach) {
          c.wantSpeed = 0;
          c.startEat({ kind: f.type, target: f });
        } else this.steer(f.x, f.z, c.walkSpeed * 0.8, false);
        if (this.stateT > 40) this.set('wander');
        break;
      }
      case 'drink': {
        const w = this.goal;
        if (c.drinking) {
          c.wantSpeed = 0;
          break;
        }
        if (c.canDrinkHere()) {
          c.wantSpeed = 0;
          c.startDrink();
        } else if (w) this.steer(w.x, w.z, c.walkSpeed, false);
        if (this.stateT > 70) this.set('wander');
        break;
      }
      case 'rest':
        c.wantSpeed = 0;
        if (this.stateT > 1) c.resting = true;
        break;
      default: {
        // vagar com a manada
        let gx;
        let gz;
        if (this.herd && this.herd.goal) {
          gx = this.herd.goal.x + this.offset.x;
          gz = this.herd.goal.z + this.offset.z;
        } else {
          if (!this.goal || Math.hypot(this.goal.x - c.pos.x, this.goal.z - c.pos.z) < 6 || this.stateT > 50) {
            const a = Math.random() * Math.PI * 2;
            this.goal = { x: clamp(c.pos.x + Math.cos(a) * 80, -HALF + 50, HALF - 50), z: clamp(c.pos.z + Math.sin(a) * 80, -HALF + 50, HALF - 50) };
            this.stateT = 0;
          }
          gx = this.goal.x;
          gz = this.goal.z;
        }
        const d = Math.hypot(gx - c.pos.x, gz - c.pos.z);
        if (d < 8) {
          c.wantSpeed = 0;
          c.lookYaw = Math.sin(c.age * 0.3) * 0.6;
        } else {
          // atrasado em relação à manada → apressa
          const hurry = this.herd && d > 45;
          this.steer(gx, gz, hurry ? c.walkSpeed * 1.6 : c.walkSpeed * 0.8, hurry && c.stamina > 50);
        }
      }
    }
    // olhar para o jogador quando ele está perto
    const p = g.player;
    if (p && !p.dead && this.state === 'wander') {
      const d = c.pos.distanceTo(p.pos);
      if (d < 18) {
        const a = Math.atan2(p.pos.x - c.pos.x, p.pos.z - c.pos.z);
        c.lookYaw = clamp(wrapAngle(a - c.yaw), -1, 1);
      }
    }
  }

  // anda até (x,z) evitando água funda e obstáculos
  steer(x, z, speed, run) {
    const c = this.c;
    const w = this.game.world;
    let yaw = Math.atan2(x - c.pos.x, z - c.pos.z);
    // olha à frente: se for água funda ou encosta íngreme, desvia
    const look = 6 + c.radius * 2;
    const deep = (a) => {
      const px = c.pos.x + Math.sin(a) * look;
      const pz = c.pos.z + Math.cos(a) * look;
      const h = w.height(px, pz);
      return h < -c.L.hipH * c.scale * 0.8 || w.slope(px, pz) > 0.9;
    };
    if (deep(yaw) && this.state !== 'drink') {
      for (const off of [0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4]) {
        if (!deep(yaw + off)) {
          yaw += off;
          break;
        }
      }
    }
    // preso em obstáculo → contorna
    if (this.detour > 0) {
      this.detour -= 0.016;
      yaw += this.detourDir;
    } else if (c.speed < 0.25 && c.wantSpeed > 0.5) {
      this.stuck += 0.016;
      if (this.stuck > 1.2) {
        this.stuck = 0;
        this.detour = 1.5;
        this.detourDir = Math.random() < 0.5 ? 1.1 : -1.1;
      }
    } else this.stuck = 0;
    c.wantYaw = yaw;
    c.wantSpeed = speed;
    c.wantRun = run;
  }
}

// ------------------------------------------------------------------ população
export class Population {
  constructor(game) {
    this.game = game;
    this.herds = [];
    this.spawnT = 0;
  }

  count(id) {
    return this.game.creatures.filter((c) => !c.isPlayer && !c.dead && c.spec.id === id).length;
  }

  // ponto válido longe do jogador
  findSpot(near, minD, maxD) {
    const w = this.game.world;
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = minD + Math.random() * (maxD - minD);
      const x = clamp(near.x + Math.cos(a) * d, -HALF + 70, HALF - 70);
      const z = clamp(near.z + Math.sin(a) * d, -HALF + 70, HALF - 70);
      const h = w.height(x, z);
      if (h > 0.8 && h < 28 && w.slope(x, z) < 0.45) return { x, z };
    }
    return null;
  }

  spawnGroup(spec, center) {
    const [a, b] = spec.ai.herd;
    const n = a + Math.floor(Math.random() * (b - a + 1));
    const herd = n > 1 || spec.ai.pack ? new Herd(spec) : null;
    for (let i = 0; i < n; i++) {
      const x = center.x + (Math.random() - 0.5) * 14;
      const z = center.z + (Math.random() - 0.5) * 14;
      const juvenile = Math.random() < 0.3;
      const growth = juvenile ? 0.25 + Math.random() * 0.4 : 0.75 + Math.random() * 0.25;
      const c = new Creature(this.game, spec, { growth, x, z, yaw: Math.random() * 6.28 });
      c.brain = new Brain(c, this.game, herd);
      if (herd) herd.members.push(c);
      this.game.addCreature(c);
    }
    if (herd) this.herds.push(herd);
  }

  // povoa o mapa inteiro no início
  initial(player) {
    for (const [id, n] of Object.entries(POPULATION)) {
      const spec = SPECIES[id];
      let groups = Math.max(1, Math.round(n / ((spec.ai.herd[0] + spec.ai.herd[1]) / 2)));
      for (let i = 0; i < groups; i++) {
        const minD = spec.diet === 'carnivoro' ? 110 : 35;
        const p = this.findSpot(player, minD, 420);
        if (p) this.spawnGroup(spec, p);
      }
    }
  }

  update(dt) {
    const g = this.game;
    for (const h of this.herds) h.update(dt, g.world);
    this.herds = this.herds.filter((h) => h.alive.length > 0);
    this.spawnT -= dt;
    if (this.spawnT > 0) return;
    this.spawnT = 8;
    const p = g.player ? g.player.pos : g.focus;
    for (const [id, n] of Object.entries(POPULATION)) {
      if (this.count(id) < n * 0.7) {
        const spec = SPECIES[id];
        const spot = this.findSpot(p, 170, 330);
        if (spot) this.spawnGroup(spec, spot);
        break;
      }
    }
  }
}

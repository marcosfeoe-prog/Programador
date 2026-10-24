// Inteligência dos dinossauros: manadas e bandos, caça, fuga, defesa,
// comer, beber, descansar e dormir à noite.
import { BEHAVIOR } from './species.js';
import * as THREE from 'three';
import { wrapAngle } from './util.js';
import { PLAY_RADIUS, WATER_Y } from './world.js';

const TAIL = new THREE.Vector3();

export class Group {
  constructor(species) {
    this.species = species;
    this.members = [];
    this.goal = null;
    this.goalT = 0;
    this.target = null; // presa compartilhada (bando)
  }
  get leader() {
    return this.members.find((m) => !m.dead) || null;
  }
}

export class Brain {
  constructor(c, group) {
    this.c = c;
    this.group = group;
    this.beh = BEHAVIOR[c.id];
    this.state = 'wander';
    this.target = null;
    this.goal = null;
    this.think = Math.random() * 0.4;
    this.stateT = 0;
    this.offset = { x: (Math.random() - 0.5) * 2, z: (Math.random() - 0.5) * 2 };
    this.hate = null; // quem atacou por último
    this.roarT = 10 + Math.random() * 40;
    this.avoid = 0;
  }

  update(dt, game) {
    const c = this.c;
    if (c.dead) return;
    this.stateT += dt;
    this.think -= dt;
    if (this.think <= 0) {
      this.think = 0.3 + Math.random() * 0.25;
      this.decide(game);
    }
    this.act(dt, game);
  }

  // ------------------------------------------------------------ decisão
  decide(game) {
    const c = this.c;
    const b = this.beh;
    const sight = b.sight * (game.sky.night > 0.5 ? 0.6 : 1);
    if (c.lastAttacker && !c.lastAttacker.dead && game.time - c.lastHitTime < 20) this.hate = c.lastAttacker;
    if (this.hate && (this.hate.dead || game.time - c.lastHitTime > 25)) this.hate = null;

    // ameaças por perto
    let threat = null;
    let threatD = Infinity;
    for (const o of game.creatures) {
      if (o === c || o.dead || o.id === c.id) continue;
      const d = o.pos.distanceTo(c.pos);
      if (d > sight) continue;
      const dangerous =
        o === this.hate ||
        (o.spec.diet === 'carnivore' && o.power > c.power * (c.spec.diet === 'carnivore' ? 1.6 : 0.35));
      if (!dangerous) continue;
      // jogador agachado/descansando é menos visível
      const stealth = o.isPlayer && o.speed < 0.5 ? 0.6 : 1;
      if (d > sight * stealth) continue;
      if (d < threatD) {
        threatD = d;
        threat = o;
      }
    }
    const hp = c.health / c.maxHealth;

    if (threat) {
      const ratio = threat.power / Math.max(c.power, 0.1);
      const herdSize = this.group.members.filter((m) => !m.dead).length;
      const brave = b.defensive && ratio < 1.6 + herdSize * 0.15 && hp > 0.35;
      const carnBrave = c.spec.diet === 'carnivore' && ratio < 1.2 && hp > 0.4;
      if ((brave || carnBrave || threat === this.hate) && threatD < 22 && !(c.spec.diet !== 'carnivore' && !b.defensive)) {
        this.set('fight', threat);
        this.alarmGroup(game, threat, 'fight');
        return;
      }
      if (b.fear > 0 || hp < 0.3 || ratio > 1.5) {
        if (this.state !== 'flee' && Math.random() < 0.35 && c.roarCd <= 0) c.roar();
        this.set('flee', threat);
        this.alarmGroup(game, threat, 'flee');
        return;
      }
    }
    if (this.state === 'flee' && (!this.target || this.target.dead || this.target.pos.distanceTo(c.pos) > sight * 1.3)) {
      this.set('wander');
    }
    if (this.state === 'flee' || this.state === 'fight') {
      if (this.state === 'fight' && (!this.target || this.target.dead || this.target.pos.distanceTo(c.pos) > 40)) this.set('wander');
      else return;
    }

    // carnívoros: caçar
    if (c.spec.diet === 'carnivore') {
      if (this.state === 'hunt' && this.target && !this.target.dead && this.target.pos.distanceTo(c.pos) < sight * 1.4 && this.stateT < 60) return;
      if (this.state === 'hunt' && this.target && this.target.dead) {
        this.set('eat', this.target);
        return;
      }
      if (c.hunger < 0.8) {
        // carcaça por perto?
        let carcass = null;
        let cd = 120;
        for (const o of game.creatures) {
          if (!o.dead || o.meat < 5) continue;
          const d = o.pos.distanceTo(c.pos);
          if (d < cd) {
            cd = d;
            carcass = o;
          }
        }
        if (carcass) {
          this.set('eat', carcass);
          return;
        }
      }
      if (c.hunger < 0.6 || (this.hate && !this.hate.dead)) {
        const prey = this.hate && !this.hate.dead ? this.hate : this.findPrey(game, sight);
        if (prey) {
          this.set('hunt', prey);
          if (b.pack) for (const m of this.group.members) if (m !== c && !m.dead && m.brain.state !== 'flee') m.brain.set('hunt', prey);
          return;
        }
      }
    }

    // sede e fome
    if (this.state === 'drink' && c.thirst < 0.98 && this.stateT < 50) return;
    if (this.state === 'graze' && c.hunger < 0.98 && this.stateT < 60) return;
    if (this.state === 'eat' && this.target && this.target.meat > 1 && c.hunger < 0.98 && this.stateT < 90) return;
    if (c.thirst < 0.4) {
      const wpt = game.world.nearestWater(c.pos.x, c.pos.z);
      if (wpt) {
        this.set('drink', null, wpt);
        return;
      }
    }
    if (c.spec.diet === 'herbivore' && c.hunger < 0.45) {
      const bush = game.world.nearestBush(c.pos.x, c.pos.z, 140, 15);
      if (bush) {
        this.set('graze', null, bush);
        return;
      }
    }

    // noite: dormir (herbívoros perto da manada; carnívoros às vezes)
    const night = game.sky.night > 0.6;
    if (night && (c.spec.diet === 'herbivore' || Math.random() < 0.02)) {
      if (this.state !== 'sleep') this.set('sleep');
      return;
    }
    if (this.state === 'sleep' && !night) this.set('wander');
    if (this.state === 'rest' && this.stateT > 25) this.set('wander');
    if (this.state === 'wander' && Math.random() < 0.004) this.set('rest');
    if (this.state !== 'rest' && this.state !== 'sleep' && this.state !== 'wander') this.set('wander');
  }

  findPrey(game, sight) {
    const c = this.c;
    const b = this.beh;
    let best = null;
    let bestScore = -Infinity;
    const packN = b.pack ? this.group.members.filter((m) => !m.dead).length : 1;
    for (const o of game.creatures) {
      if (o === c || o.dead || o.id === c.id) continue;
      const d = o.pos.distanceTo(c.pos);
      if (d > sight) continue;
      const ratio = o.power / Math.max(c.power * (b.pack ? 0.6 + packN * 0.45 : 1), 0.1);
      if (ratio > 1.3) continue;
      if (o.isPlayer && Math.random() > b.aggression) continue;
      const score = -d / sight - ratio * 0.6 + (o.isPlayer ? 0.2 : 0) + (1 - o.health / o.maxHealth) * 0.5;
      if (score > bestScore) {
        bestScore = score;
        best = o;
      }
    }
    return best;
  }

  alarmGroup(game, threat, mode) {
    for (const m of this.group.members) {
      if (m === this.c || m.dead || !m.brain) continue;
      if (m.pos.distanceTo(this.c.pos) > 60) continue;
      if (m.brain.state === mode) continue;
      if (mode === 'fight' && !m.brain.beh.defensive) m.brain.set('flee', threat);
      else m.brain.set(mode, threat);
    }
  }

  set(state, target = null, goal = null) {
    if (this.state !== state || this.target !== target) this.stateT = 0;
    this.state = state;
    this.target = target;
    this.goal = goal;
    const c = this.c;
    if (state !== 'graze' && state !== 'eat' && c.action === 'eat') c.action = null;
    if (state !== 'drink' && c.action === 'drink') c.action = null;
    if (state !== 'rest' && state !== 'sleep' && (c.action === 'rest' || c.action === 'sleep')) c.action = null;
    if (state === 'rest') c.setAction('rest');
    if (state === 'sleep') c.setAction('sleep');
  }

  // ------------------------------------------------------------ execução
  act(dt, game) {
    const c = this.c;
    const sp = c.speeds;
    const ctrl = c.ctrl;
    const g = this.group;
    let tx = null;
    let tz = null;
    let speed = 0;

    switch (this.state) {
      case 'flee': {
        const t = this.target;
        if (!t) break;
        const ax = c.pos.x - t.pos.x;
        const az = c.pos.z - t.pos.z;
        const d = Math.hypot(ax, az) || 1;
        tx = c.pos.x + (ax / d) * 40;
        tz = c.pos.z + (az / d) * 40;
        speed = sp.run;
        break;
      }
      case 'fight':
      case 'hunt': {
        const t = this.target;
        if (!t || t.dead) break;
        // ataque com cauda: fica de lado/costas para o alvo
        const st = c.spec.stats;
        const reach = st.reach * c.scale;
        const mouth = c.mouthWorld();
        const dBody = t.distToBody(mouth, true);
        tx = t.pos.x;
        tz = t.pos.z;
        if (this.beh.pack && this.state === 'hunt') {
          // cerco: cada membro vem de um lado
          tx += this.offset.x * t.radius * 3;
          tz += this.offset.z * t.radius * 3;
        }
        const d = c.pos.distanceTo(t.pos);
        speed = d > 25 ? sp.run : d > 8 ? sp.trot * 1.2 : sp.trot;
        if (this.state === 'hunt' && d > 15 && c.stamina < 0.35) speed = sp.trot;
        if (st.tailAttack) {
          const tail = c.modelToWorld(TAIL.set(0, c.data.hipY, c.data.tailZ * 0.8));
          if (t.distToBody(tail, true) < reach * 0.7) {
            c.attack();
            speed = 0;
          } else if (d < reach * 2.5) {
            // gira para mostrar a cauda
            tx = c.pos.x - (t.pos.x - c.pos.x);
            tz = c.pos.z - (t.pos.z - c.pos.z);
            speed = sp.walk;
          }
        } else if (dBody < reach * 0.8) {
          c.attack();
          speed = sp.walk * 0.4;
        }
        if (this.state === 'hunt' && Math.random() < dt * 0.05 && c.roarCd <= 0 && d < 40) c.roar();
        break;
      }
      case 'eat': {
        const t = this.target;
        if (!t || t.meat <= 1) {
          this.set('wander');
          break;
        }
        const mouth = c.mouthWorld();
        if (t.distToBody(mouth, true) < Math.max(1.4, c.data.length * c.scale * 0.18)) {
          c.setAction('eat', { type: 'carcass', obj: t });
          speed = 0;
        } else {
          tx = t.pos.x;
          tz = t.pos.z;
          speed = sp.walk * 1.2;
        }
        break;
      }
      case 'graze': {
        const bsh = this.goal;
        if (!bsh || bsh.food < 2) {
          this.set('wander');
          break;
        }
        const mouth = c.mouthWorld();
        const d = Math.hypot(mouth.x - bsh.x, mouth.z - bsh.z);
        if (d < 1.4 + bsh.s * 1.1) {
          if (c.action !== 'eat') c.setAction('eat', { type: 'bush', obj: bsh });
          speed = 0;
          tx = bsh.x;
          tz = bsh.z;
        } else {
          tx = bsh.x;
          tz = bsh.z;
          speed = d > 30 ? sp.trot : sp.walk;
        }
        break;
      }
      case 'drink': {
        const wpt = this.goal;
        if (!wpt) break;
        if (c.canDrink()) {
          if (c.action !== 'drink') c.setAction('drink');
          speed = 0;
          tx = wpt.x;
          tz = wpt.z;
        } else {
          tx = wpt.x;
          tz = wpt.z;
          const d = Math.hypot(c.pos.x - wpt.x, c.pos.z - wpt.z);
          speed = d > 40 ? sp.trot : sp.walk;
          if (c.blockedWater) c.setAction('drink');
        }
        break;
      }
      case 'rest':
      case 'sleep':
        speed = 0;
        break;
      default: {
        // vagar com a manada
        const leader = g.leader;
        if (leader === c || !leader) {
          if (!g.goal || g.goalT <= 0 || Math.hypot(c.pos.x - g.goal.x, c.pos.z - g.goal.z) < 6) {
            g.goal = game.world.randomLand(Math.random, 0, PLAY_RADIUS - 40, 1.2);
            // não vai longe demais de uma vez
            const dx = g.goal.x - c.pos.x;
            const dz = g.goal.z - c.pos.z;
            const d = Math.hypot(dx, dz);
            if (d > 120) {
              g.goal.x = c.pos.x + (dx / d) * 120;
              g.goal.z = c.pos.z + (dz / d) * 120;
            }
            g.goalT = 40 + Math.random() * 40;
          }
          g.goalT -= dt;
          tx = g.goal.x;
          tz = g.goal.z;
          speed = sp.walk;
        } else {
          const sp2 = 4 + c.radius * 3;
          tx = leader.pos.x + this.offset.x * sp2 * 2;
          tz = leader.pos.z + this.offset.z * sp2 * 2;
          const d = Math.hypot(c.pos.x - tx, c.pos.z - tz);
          speed = d > 30 ? sp.trot : d > 5 ? sp.walk : 0;
          if (leader.action === 'rest' || leader.action === 'sleep') speed = d > 8 ? sp.walk : 0;
        }
        this.roarT -= dt;
        if (this.roarT <= 0) {
          this.roarT = 25 + Math.random() * 60;
          if (Math.random() < 0.5) c.roar();
        }
      }
    }

    if (tx !== null) {
      let yaw = Math.atan2(tx - c.pos.x, tz - c.pos.z);
      yaw = this.avoidTerrain(game, yaw, speed);
      ctrl.yaw = yaw;
      const d = Math.hypot(tx - c.pos.x, tz - c.pos.z);
      if (d < 1.5 && this.state === 'wander') speed = 0;
    }
    ctrl.speed = speed;
  }

  // desvia de água funda e da borda do mapa
  avoidTerrain(game, yaw, speed) {
    if (speed <= 0) return yaw;
    const c = this.c;
    const w = game.world;
    const look = 6 + c.data.length * c.scale * 0.6;
    const hip = c.data.hipY * c.scale;
    const bad = (a) => {
      const x = c.pos.x + Math.sin(a) * look;
      const z = c.pos.z + Math.cos(a) * look;
      if (Math.hypot(x, z) > PLAY_RADIUS - 5) return true;
      const depth = WATER_Y - w.height(x, z);
      return depth > hip * 0.7 && !(this.state === 'drink' && depth < hip);
    };
    if (!bad(yaw)) return yaw;
    for (const off of [0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.3, -2.3, Math.PI]) {
      const a = wrapAngle(yaw + off * (this.avoid >= 0 ? 1 : -1));
      if (!bad(a)) return a;
    }
    return yaw + Math.PI;
  }
}

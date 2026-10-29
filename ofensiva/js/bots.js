// Inteligência dos bots: percepção (visão, fumaça, cegueira, audição), mira com
// tempo de reação e controle de recuo, rajadas, contra-strafe, navegação A* e
// objetivos (plantar, desarmar, segurar ângulos, rotacionar, pegar a bomba).
import * as THREE from 'three';
import { SPOTS } from './map.js';
import { eyeHeight } from './physics.js';
import { angDiff, clamp, rand, pick, DEG } from './util.js';

export const SKILL = {
  easy: { label: 'Fácil', react: 0.6, err: 4.5, turn: 220, head: 0.15, recoil: 0.25, stop: 0.25, settle: 0.9, fov: 110 },
  normal: { label: 'Normal', react: 0.38, err: 2.6, turn: 400, head: 0.35, recoil: 0.6, stop: 0.6, settle: 0.55, fov: 130 },
  hard: { label: 'Difícil', react: 0.26, err: 1.4, turn: 620, head: 0.55, recoil: 0.82, stop: 0.85, settle: 0.38, fov: 140 },
  expert: { label: 'Expert', react: 0.18, err: 0.8, turn: 900, head: 0.75, recoil: 0.95, stop: 1, settle: 0.26, fov: 150 },
};

const _eye = new THREE.Vector3();
const _tp = new THREE.Vector3();
const _d = new THREE.Vector3();

export class Bot {
  constructor(game, actor, skill) {
    this.game = game;
    this.a = actor;
    this.skill = SKILL[skill] || SKILL.normal;
    this.path = [];
    this.pathIdx = 0;
    this.goal = null;
    this.goalLook = null;
    this.repathAt = 0;
    this.stuckT = 0;
    this.lastPos = new THREE.Vector3();
    this.target = null;
    this.targetSince = 0;
    this.lastVisible = 0;
    this.aimErr = { x: 0, y: 0 };
    this.memory = new Map();
    this.alert = null;
    this.burst = 0;
    this.burstPause = 0;
    this.strafe = 1;
    this.strafeT = 0;
    this.perceiveT = Math.random() * 0.1;
    this.waitUntil = 0;
    this.route = null;
    this.routeIdx = 0;
    this.role = null;
    this.spot = null;
    this.awper = false;
    this.aimPart = 'chest';
    this.pinTimer = 0;
    this.lookAround = 0;
    this.crouchSpray = 0;
    this.stopUntil = 0;
    this.nadePlan = null;
    this.rotates = false;
    this.roam = null;
    this.roamUntil = 0;
    this.ignore = new Map();
    this.engageStart = 0;
    this.lastHit = 0;
  }

  // ------------------------------------------------------------ rodada
  roundStart(plan, index) {
    this.path = [];
    this.goal = null;
    this.target = null;
    this.memory.clear();
    this.ignore.clear();
    this.alert = null;
    this.routeIdx = 0;
    this.waitUntil = 0;
    this.pinTimer = 0;
    const a = this.a;
    const map = this.game.map;
    if (a.team === 'T') {
      this.site = plan.site;
      const routes = SPOTS.routes[plan.site];
      this.route = routes[index % routes.length].map(([x, z]) => map.cellCenter(x, z));
      this.execAt = plan.execAt + rand(-1.5, 1.5);
      this.spot = SPOTS.tPost[plan.site][index % SPOTS.tPost[plan.site].length];
    } else {
      const area = plan.assign[index % plan.assign.length];
      this.area = area;
      const spots = SPOTS.ctHold[area];
      this.spot = spots[Math.floor(index / plan.assign.length + Math.random() * spots.length) % spots.length];
    }
  }

  // Compra no início da rodada conforme o dinheiro e a economia do time.
  buy(roundNum, pistolRound) {
    const a = this.a;
    const g = this.game;
    const T = a.team === 'T';
    const rifle = T ? 'ak47' : 'm4a4';
    const cheapRifle = T ? 'galil' : 'famas';
    const smg = T ? 'mac10' : 'mp9';
    const has = a.inv[0];
    const want = (id) => g.buy(a, id, true);
    if (pistolRound) {
      if (Math.random() < 0.5) want('vest');
      else {
        want('p250');
        if (Math.random() < 0.5) want('he');
      }
      return;
    }
    if (!has) {
      if (this.awper && a.money >= 4750 + 650) want('awp');
      else if (a.money >= 2700 + 650) want(rifle);
      else if (a.money >= 3100 && !T) want(rifle);
      else if (a.money >= 2000 + 650 && g.teamForceBuy(a.team)) want(cheapRifle);
      else if (a.money >= 1250 + 650 && g.teamForceBuy(a.team)) want(smg);
      else if (a.money >= 700 + 650 && Math.random() < 0.4) want('deagle');
    }
    if (a.money >= 1000 && (!a.armor || !a.helmet)) want('vesthelm');
    else if (a.money >= 650 && a.armor < 50) want('vest');
    if (!T && a.money >= 400 && Math.random() < 0.7) want('kit');
    if (a.money >= 300 && Math.random() < 0.6) want('he');
    if (a.money >= 300 && Math.random() < 0.4) want('smoke');
    if (a.money >= 200 && Math.random() < 0.5) want('flash');
    a.slot = a.bestSlot();
  }

  // ------------------------------------------------------------ percepção
  canSee(other, time) {
    const a = this.a;
    _eye.copy(a.pos);
    _eye.y += eyeHeight(a);
    const pts = [eyeHeight(other) + 0.05, eyeHeight(other) - 0.4, 0.45];
    const dx = other.pos.x - a.pos.x;
    const dz = other.pos.z - a.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 4) {
      // campo de visão
      const yawTo = Math.atan2(-dx, -dz);
      if (Math.abs(angDiff(a.yaw, yawTo)) > (this.skill.fov / 2) * DEG) return null;
    }
    if (a.isFlashed(time) && a.flashAmount(time) > 0.35) return null;
    // testa cabeça, peito e pernas; retorna as alturas visíveis
    let vis = null;
    for (const h of pts) {
      _tp.copy(other.pos);
      _tp.y += h;
      if (this.game.map.lineClear(_eye, _tp) && !this.game.fx.smokeBlocks(_eye, _tp)) (vis ||= []).push(h);
    }
    return vis;
  }

  perceive(time) {
    const a = this.a;
    let best = null;
    let bestD = Infinity;
    // alcance em que vale a pena parar e trocar tiros
    const wt = a.weapon?.def.type;
    const maxD = wt === 'sniper' ? 120 : wt === 'rifle' ? 60 : wt === 'pistol' ? 35 : wt === 'smg' ? 40 : wt === 'shotgun' ? 18 : 30;
    for (const o of this.game.actors) {
      if (!o.alive || o.team === a.team) continue;
      if (a.pos.distanceTo(o.pos) > maxD && o !== this.target) continue;
      if ((this.ignore.get(o.id) || 0) > time) continue;
      const h = this.canSee(o, time);
      if (!h) continue;
      const d = a.pos.distanceTo(o.pos);
      let m = this.memory.get(o.id);
      if (!m) {
        m = { first: time, pos: new THREE.Vector3(), t: time };
        this.memory.set(o.id, m);
      }
      if (time - m.t > 1.0) m.first = time; // perdeu de vista: reage de novo
      m.t = time;
      m.pos.copy(o.pos);
      m.vis = h;
      // prioriza o alvo atual (evita trocar toda hora)
      const score = d - (o === this.target ? 6 : 0);
      if (score < bestD) {
        bestD = score;
        best = o;
      }
      this.game.reportEnemy(a, o);
    }
    if (best) {
      if (best !== this.target) {
        this.target = best;
        this.targetSince = this.memory.get(best.id).first;
        const e = this.skill.err * (0.6 + Math.random() * 0.8);
        this.aimErr.x = (Math.random() - 0.5) * 2 * e;
        this.aimErr.y = (Math.random() - 0.5) * 1.3 * e;
        this.aimPart = Math.random() < this.skill.head ? 'head' : 'chest';
        this.burst = 0;
        this.engageStart = time;
      }
      this.lastVisible = time;
    } else if (this.target && (!this.target.alive || time - this.lastVisible > 0.5)) {
      this.target = null;
    }
  }

  hear(pos, kind, src, time) {
    if (!this.a.alive || src.team === this.a.team) return;
    this.alert = { pos: pos.clone(), t: time, kind };
  }

  // ------------------------------------------------------------ navegação
  goTo(p, time, look = null) {
    if (!this.goal || this.goal.distanceToSquared(p) > 1 || time > this.repathAt) {
      if (!this.goal || this.goal.distanceToSquared(p) > 1) {
        this.goal = p.clone();
        this.path = this.game.map.findPath(this.a.pos, this.goal);
        this.pathIdx = 0;
        this.repathAt = time + 6;
      } else if (time > this.repathAt) {
        this.path = this.game.map.findPath(this.a.pos, this.goal);
        this.pathIdx = 0;
        this.repathAt = time + 6;
      }
    }
    this.goalLook = look;
  }

  // Direção de movimento ao longo do caminho (ou null se já chegou).
  steer() {
    const a = this.a;
    if (!this.goal) return null;
    while (this.pathIdx < this.path.length) {
      const p = this.path[this.pathIdx];
      const d = Math.hypot(p.x - a.pos.x, p.z - a.pos.z);
      const last = this.pathIdx === this.path.length - 1;
      if (d < (last ? 0.45 : 0.9)) this.pathIdx++;
      else break;
    }
    if (this.pathIdx >= this.path.length) return null;
    const p = this.path[this.pathIdx];
    _d.set(p.x - a.pos.x, 0, p.z - a.pos.z);
    const len = _d.length();
    _d.divideScalar(len || 1);
    // separação dos colegas
    for (const o of this.game.actors) {
      if (o === a || !o.alive) continue;
      const dx = a.pos.x - o.pos.x;
      const dz = a.pos.z - o.pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < 1.6 && d2 > 1e-4) {
        const k = (1.6 - d2) * 0.6;
        _d.x += (dx / Math.sqrt(d2)) * k;
        _d.z += (dz / Math.sqrt(d2)) * k;
      }
    }
    _d.normalize();
    return { x: _d.x, z: _d.z, remaining: len };
  }

  arrived() {
    return !this.goal || this.pathIdx >= this.path.length;
  }

  // ------------------------------------------------------------ mira
  aimAt(p, dt, precise) {
    const a = this.a;
    _eye.copy(a.pos);
    _eye.y += eyeHeight(a);
    const dx = p.x - _eye.x;
    const dy = p.y - _eye.y;
    const dz = p.z - _eye.z;
    let yaw = Math.atan2(-dx, -dz);
    let pitch = Math.atan2(dy, Math.hypot(dx, dz));
    if (precise) {
      // compensa o recuo (as balas saem em view + 2 × punch)
      yaw -= a.punch.x * 2 * DEG * this.skill.recoil;
      pitch -= a.punch.y * 2 * DEG * this.skill.recoil;
      yaw += this.aimErr.x * DEG;
      pitch += this.aimErr.y * DEG;
    }
    const turn = this.skill.turn * DEG * dt;
    const dyaw = angDiff(a.yaw, yaw);
    const dp = pitch - a.pitch;
    const k = Math.min(1, dt * (precise ? 14 : 7));
    a.yaw += clamp(dyaw * k, -turn, turn);
    a.pitch += clamp(dp * k, -turn, turn);
    a.pitch = clamp(a.pitch, -1.4, 1.4);
    return Math.hypot(angDiff(a.yaw, yaw), pitch - a.pitch);
  }

  // ------------------------------------------------------------ quadro
  update(dt, time) {
    const a = this.a;
    const g = this.game;
    a.wishX = a.wishZ = 0;
    a.wantJump = false;
    a.wantFire = false;
    a.wantUse = false;
    a.walking = false;
    a.crouch = false;
    if (!a.alive) return;
    if (g.phase === 'freeze') {
      a.slot = a.bestSlot();
      return;
    }

    this.perceiveT -= dt;
    if (this.perceiveT <= 0) {
      this.perceiveT = 0.1;
      this.perceive(time);
    }
    // o erro de mira assenta com o tempo
    const settle = Math.exp(-dt / this.skill.settle);
    this.aimErr.x *= settle;
    this.aimErr.y *= settle;

    const w = a.weapon;
    // arma vazia: troca para a pistola
    if (a.slot === 0 && w && w.mag === 0 && w.reserve === 0 && a.inv[1]) a.switchTo(1, time);
    if ((a.slot === 2 || a.slot === 3) && !this.nadePlan) {
      const best = a.bestSlot();
      if (best !== 2) a.switchTo(best, time);
    }

    let move = null;
    let speedK = 1;
    if (this.target && this.target.alive) {
      move = this.engage(dt, time);
    } else {
      this.target = null;
      move = this.objective(dt, time);
      // recarrega quando está tranquilo
      if (w && w.def.mag && w.mag < w.def.mag * 0.5 && time - this.lastVisible > 2) a.startReload(time);
    }
    if (move) {
      a.wishX = move.x;
      a.wishZ = move.z;
      speedK = move.speed ?? 1;
    }
    a.wishSpeed = a.maxSpeed(time) * speedK;

    // preso: pula e recalcula a rota
    if (a.wishX || a.wishZ) {
      this.stuckT += dt;
      if (this.stuckT > 1.2) {
        if (a.pos.distanceTo(this.lastPos) < 0.4) {
          a.wantJump = true;
          this.repathAt = 0;
          this.path = g.map.findPath(a.pos, this.goal || a.pos);
          this.pathIdx = 0;
        }
        this.stuckT = 0;
        this.lastPos.copy(a.pos);
      }
    }
  }

  engage(dt, time) {
    const a = this.a;
    const t = this.target;
    const m = this.memory.get(t.id);
    const visible = time - this.lastVisible < 0.15;
    const w = a.weapon;
    _tp.copy(t.pos);
    if (visible) {
      // mira na parte escolhida se estiver visível; senão no que dá para ver
      const vis = m?.vis || [];
      const head = eyeHeight(t) + 0.05;
      const chest = eyeHeight(t) - 0.4;
      let h = this.aimPart === 'head' ? head : chest;
      if (!vis.some((v) => Math.abs(v - h) < 0.01)) h = vis.length ? vis[0] : h;
      if (h === chest) h += 0.1;
      _tp.y += h;
    } else {
      _tp.copy(m ? m.pos : t.pos);
      _tp.y += 1.4;
    }
    const err = this.aimAt(_tp, dt, visible);
    const dist = a.pos.distanceTo(t.pos);
    // duelo longo sem acertar nada: desiste e segue o objetivo
    if (dist > 18 && time - Math.max(this.engageStart, this.lastHit) > 5) {
      this.ignore.set(t.id, time + 6);
      this.target = null;
      return null;
    }
    const reacted = time - this.targetSince > this.skill.react * (a.isFlashed(time) ? 3 : 1);

    // recarrega se acabou o pente
    if (w && w.def.mag && w.mag === 0) {
      a.startReload(time);
      if (a.inv[1] && a.slot === 0 && dist < 12 && a.inv[1].mag > 0) a.switchTo(1, time);
    }
    const type = w?.def.type;
    let fire = false;
    if (visible && reacted && w && (w.mag > 0 || type === 'knife') && time >= a.reloadEnd) {
      const tol = Math.atan2(0.22, dist) + (type === 'shotgun' ? 0.05 : 0.012);
      if (err < tol * 1.5) {
        if (type === 'sniper') {
          if (!a.scope) a.scope = 1;
          fire = this.burstPause < time && Math.hypot(a.vel.x, a.vel.z) < 1.2 && err < tol;
          if (fire) this.burstPause = time + 0.2;
        } else if (type === 'rifle' || type === 'smg') {
          const maxBurst = dist > 22 ? 1 + (Math.random() * 2 | 0) : dist > 12 ? 4 : 12;
          if (time > this.burstPause) {
            fire = true;
            if (a.lastShot > time - 0.02) {
              this.burst++;
              if (this.burst >= maxBurst) {
                this.burst = 0;
                this.burstPause = time + (dist > 22 ? rand(0.3, 0.45) : rand(0.2, 0.35));
              }
            }
          }
        } else {
          // semiautomáticas: alterna o gatilho
          fire = !a.triggerHeld && time > this.burstPause;
          if (fire) this.burstPause = time + (dist > 15 ? 0.25 : 0.12);
        }
      }
    }
    a.wantFire = fire;
    if (fire && dist > 14 && type !== 'sniper' && Math.random() < 0.004) this.crouchSpray = time + 1.5;
    a.crouch = time < this.crouchSpray;

    // movimento: para para atirar (contra-strafe) ou faz ADAD
    this.strafeT -= dt;
    if (this.strafeT <= 0) {
      this.strafe = -this.strafe;
      this.strafeT = rand(0.25, 0.7);
    }
    const stopping = (fire || (reacted && err < 0.05)) && Math.random() < this.skill.stop;
    if (stopping || this.stopUntil > time) {
      if (stopping) this.stopUntil = time + 0.15;
      return { x: 0, z: 0 };
    }
    const fx = -Math.sin(a.yaw);
    const fz = -Math.cos(a.yaw);
    // aproxima se está longe com arma curta, recua com AWP
    let fwd = 0;
    if (!visible) fwd = 0.6;
    else if (type === 'knife' || (type === 'smg' && dist > 15) || type === 'shotgun') fwd = 1;
    return { x: -fz * this.strafe + fx * fwd, z: fx * this.strafe + fz * fwd, speed: visible ? 0.9 : 0.7 };
  }

  // Comportamento sem inimigo à vista.
  objective(dt, time) {
    const a = this.a;
    const g = this.game;
    const map = g.map;
    const bomb = g.bomb;
    let look = null;

    // lembrança recente: mira onde o inimigo sumiu
    let recent = null;
    for (const [, m] of this.memory) if (time - m.t < 2.5 && (!recent || m.t > recent.t)) recent = m;
    if (recent) look = _tp.copy(recent.pos).setY(recent.pos.y + 1.4);
    else if (this.alert && time - this.alert.t < 3) look = _tp.copy(this.alert.pos).setY(this.alert.pos.y + 1.4);

    // granada HE onde o inimigo sumiu
    if (recent && time - recent.t > 0.8 && a.grenades.includes('he') && !this.nadePlan && Math.random() < 0.01) {
      const d = a.pos.distanceTo(recent.pos);
      if (d > 7 && d < 26) this.nadePlan = { pos: recent.pos.clone(), id: 'he', t: time };
    }
    if (this.nadePlan) {
      const r = this.throwNade(dt, time);
      if (r) return r;
    }

    let dest = null;
    let destLook = null;
    let speed = 1;
    if (g.mode !== 'defuse') {
      // mata-mata/treino: circula pelo mapa
      if (!this.roam || a.pos.distanceTo(this.roam) < 2 || time > this.roamUntil) {
        let cx;
        let cz;
        do {
          cx = 1 + Math.floor(Math.random() * (map.W - 2));
          cz = 1 + Math.floor(Math.random() * (map.H - 2));
        } while (!map.walkable(cx, cz));
        this.roam = map.cellCenter(cx, cz);
        this.roamUntil = time + 25;
      }
      dest = this.roam;
    } else if (a.team === 'T') {
      if (bomb.state === 'planted') {
        const p = map.cellCenter(this.spot[0], this.spot[1]);
        // defendendo a bomba: se ouvir o desarme, vai até ela
        if (bomb.defuser || (this.alert && this.alert.kind === 'defuse' && time - this.alert.t < 2)) dest = bomb.pos;
        else {
          dest = p.distanceTo(bomb.pos) < 22 ? p : bomb.pos;
          destLook = map.cellCenter(this.spot[2], this.spot[3]).setY(1.5);
        }
      } else if (bomb.state === 'dropped' && g.bombClaimer(a)) {
        dest = bomb.pos;
      } else if (a.hasBomb) {
        dest = this.followRoute(time, true);
        if (!dest) {
          const [px, pz] = SPOTS.plant[this.site];
          dest = map.cellCenter(px, pz);
          if (map.siteAt(a.pos) === this.site && a.pos.distanceTo(dest) < 3 && time - this.lastVisible > 1.5) {
            a.wantUse = true; // planta
            a.crouch = true;
            return { x: 0, z: 0 };
          }
        }
      } else {
        dest = this.followRoute(time, false);
        if (!dest) {
          dest = map.cellCenter(this.spot[0], this.spot[1]);
          destLook = map.cellCenter(this.spot[2], this.spot[3]).setY(1.5);
        }
      }
    } else {
      if (bomb.state === 'planted') {
        dest = bomb.pos;
        const d = a.pos.distanceTo(bomb.pos);
        if (d < 1.4 && time - this.lastVisible > 1.0) {
          a.wantUse = true; // desarma
          a.crouch = Math.random() < 0.5 ? a.crouch : true;
          return { x: 0, z: 0 };
        }
        if (d < 10) speed = 0.95;
      } else {
        const intel = g.intel[a.team];
        if (intel && time - intel.t < 8 && this.area !== intel.site && intel.site !== 'mid' && this.rotates) {
          const h = SPOTS.ctHold[intel.site][0];
          dest = map.cellCenter(h[0], h[1]);
        }
        else {
          dest = map.cellCenter(this.spot[0], this.spot[1]);
          destLook = map.cellCenter(this.spot[2], this.spot[3]).setY(1.5);
        }
      }
    }

    if (dest) this.goTo(dest, time, destLook);
    const st = this.steer();
    if (!look) {
      if (st && st.remaining > 0.5) {
        // olha para onde anda, com uma leve varredura
        this.lookAround += dt;
        const yaw = Math.atan2(-st.x, -st.z) + Math.sin(this.lookAround * 0.9) * 0.35;
        this.turnTo(yaw, 0, dt);
      } else if (destLook) {
        this.aimAt(destLook, dt, false);
      } else {
        this.lookAround += dt;
        this.turnTo(a.yaw + Math.sin(this.lookAround * 0.6) * 0.02, 0, dt);
      }
    } else this.aimAt(look, dt, false);

    // anda devagar (sem barulho) ao segurar posição perto de inimigos
    if (st) {
      if (a.team === 'CT' && g.bomb.state !== 'planted' && st.remaining < 6 && this.arrived()) a.walking = true;
      return { x: st.x, z: st.z, speed };
    }
    return null;
  }

  turnTo(yaw, pitch, dt) {
    const a = this.a;
    const turn = this.skill.turn * 0.5 * DEG * dt;
    a.yaw += clamp(angDiff(a.yaw, yaw) * Math.min(1, dt * 5), -turn, turn);
    a.pitch += clamp((pitch - a.pitch) * Math.min(1, dt * 5), -turn, turn);
  }

  // Segue a rota dos T: espera no ponto de reunião até a hora da execução.
  // Retorna o próximo destino ou null quando a rota terminou.
  followRoute(time, carrier) {
    if (!this.route) return null;
    const a = this.a;
    const g = this.game;
    while (this.routeIdx < this.route.length && a.pos.distanceTo(this.route[this.routeIdx]) < 2.2) this.routeIdx++;
    if (this.routeIdx >= this.route.length) return null;
    const late = g.roundTimeLeft() < 40;
    const execAt = this.execAt + (carrier ? 2.5 : 0);
    if (this.routeIdx >= 1 && !late && g.roundElapsed() < execAt) return this.route[0];
    return this.route[this.routeIdx];
  }

  // Arremesso de granada calculando o ângulo balístico.
  throwNade(dt, time) {
    const a = this.a;
    const p = this.nadePlan;
    if (time - p.t > 3 || !a.grenades.includes(p.id) || this.target) {
      this.nadePlan = null;
      return null;
    }
    if (a.slot !== 3 || a.weapon?.id !== p.id) {
      a.nadeIdx = a.grenades.indexOf(p.id);
      a.slot = 3;
      a.drawEnd = time + 0.4;
    }
    const dx = p.pos.x - a.pos.x;
    const dz = p.pos.z - a.pos.z;
    const x = Math.hypot(dx, dz);
    const v = 16.9;
    const y = p.pos.y + 0.3 - (a.pos.y + eyeHeight(a));
    const gg = 8;
    const disc = v ** 4 - gg * (gg * x * x + 2 * y * v * v);
    const pitch = disc > 0 ? Math.atan((v * v - Math.sqrt(disc)) / (gg * x)) : Math.PI / 4;
    const yaw = Math.atan2(-dx, -dz);
    // o arremesso forte já soma ~8° ao ângulo do olhar
    const aimP = pitch - 8 * DEG;
    this.turnTo(yaw, aimP, dt * 3);
    if (Math.abs(angDiff(a.yaw, yaw)) < 0.05 && Math.abs(a.pitch - aimP) < 0.05 && time > a.drawEnd) {
      this.game.throwGrenade(a, true);
      this.nadePlan = null;
    }
    return { x: 0, z: 0 };
  }
}

// Plano do time no começo da rodada.
export function makePlan(team, bots) {
  if (team === 'T') {
    return { site: pick(['A', 'B']), execAt: rand(12, 32) };
  }
  // CT: 2 no A, 2 no B, 1 no meio (com 5); parte deles rotaciona
  const assign = ['A', 'B', 'mid', 'A', 'B'];
  bots.forEach((b, i) => {
    b.rotates = i % 2 === 0;
  });
  return { assign };
}


// Jogador em campo: cinemática com aceleração limitada (modelo hiperbólico de
// arrancada), frenagem e curvas limitadas pela tração do gramado, fôlego de
// curto prazo e cansaço acumulado, estados de ação e dados de pose para a
// animação e o replay.
import { clamp, lerp, angleDiff } from '../util.js';
import { G } from './constants.js';

export const ST = {
  RUN: 0,
  KICK: 1,
  SLIDE: 2,
  TACKLE: 3,
  FALLEN: 4,
  DIVE: 5,
  HEADER: 6,
  CELEB: 7,
  THROW: 8,
  HOLD: 9,
  STUMBLE: 10,
  JUMP: 11,
  OFF: 12,
  FEINT: 13,
};

export const POSE_SIZE = 16;

let NEXT_ID = 1;

export class PlayerEnt {
  constructor(team, data, role) {
    this.uid = NEXT_ID++;
    this.team = team;
    this.data = data;
    this.role = role; // papel na formação (GK, CB, LB...)
    this.slot = 0;
    const a = {};
    for (const k in data.attr) a[k] = data.attr[k] / 100;
    this.a = a;
    this.isGK = role === 'GK';
    this.height = data.height || 1.8;
    this.x = 0;
    this.z = 0;
    this.y = 0;
    this.vx = 0;
    this.vz = 0;
    this.vy = 0;
    this.px = 0; // posição no passo anterior (interpolação)
    this.pz = 0;
    this.face = 0;
    this.pface = 0;
    this.desVx = 0;
    this.desVz = 0;
    this.faceTarget = null;
    this.sprint = false;
    this.stamina = 1;
    this.fatigue = 0;
    this.state = ST.RUN;
    this.stateT = 0;
    this.stateDur = 0;
    this.pending = null; // chute na fila
    this.touchCD = 0;
    this.phase = Math.random() * 6;
    this.kickT = 0;
    this.kickSide = data.foot === 'E' ? -1 : 1;
    this.aux1 = 0;
    this.aux2 = 0;
    this.lean = 0;
    this.holding = false;
    this.celebType = 0;
    this.cards = 0;
    this.sentOff = false;
    this.active = true;
    this.stats = { goals: 0, assists: 0, shots: 0, passes: 0, passesOk: 0, tackles: 0, saves: 0, fouls: 0, rating: 6.0, minutes: 0 };
    // IA
    this.thinkT = Math.random() * 0.3;
    this.target = { x: 0, z: 0 };
    this.run = null;
    this.mark = null;
    this.intent = null;
    this.interceptT = Infinity;
    this.interceptP = null;
    this.reactT = 0;
  }

  get name() {
    return this.data.shirt;
  }
  get speed() {
    return Math.hypot(this.vx, this.vz);
  }

  // Velocidade máxima atual (fôlego, cansaço, clima).
  vmax(env) {
    const base = 6.9 + this.a.pac * 2.9 - (this.isGK ? 0.6 : 0);
    const st = 0.8 + 0.2 * this.stamina;
    const ft = 1 - this.fatigue * 0.12;
    return base * st * ft * (env ? env.speedMul : 1);
  }
  tau() {
    return 1.32 - this.a.acc * 0.45;
  }

  place(x, z, face = 0) {
    this.x = this.px = x;
    this.z = this.pz = z;
    this.vx = this.vz = 0;
    this.y = this.vy = 0;
    this.face = this.pface = face;
    this.state = ST.RUN;
    this.stateT = 0;
    this.pending = null;
  }

  setState(s, dur = 0) {
    this.state = s;
    this.stateT = 0;
    this.stateDur = dur;
  }

  busy() {
    const s = this.state;
    return s === ST.SLIDE || s === ST.FALLEN || s === ST.DIVE || s === ST.TACKLE || s === ST.STUMBLE || s === ST.OFF;
  }

  // Integra o movimento. fdt = passo em tempo de jogo (para o cansaço).
  step(dt, env, fdt, rng) {
    this.px = this.x;
    this.pz = this.z;
    this.pface = this.face;
    this.stateT += dt;
    if (this.touchCD > 0) this.touchCD -= dt;
    const vmax = this.vmax(env);
    let desVx = this.desVx;
    let desVz = this.desVz;
    let ctrl = 1;

    switch (this.state) {
      case ST.FALLEN:
        desVx = desVz = 0;
        ctrl = 0.4;
        if (this.stateT > this.stateDur) this.setState(ST.RUN);
        break;
      case ST.STUMBLE:
        ctrl = 0.35;
        desVx *= 0.5;
        desVz *= 0.5;
        if (this.stateT > this.stateDur) this.setState(ST.RUN);
        break;
      case ST.SLIDE: {
        const k = Math.exp(-1.9 * dt);
        this.vx *= k;
        this.vz *= k;
        this.x += this.vx * dt;
        this.z += this.vz * dt;
        if (this.stateT > this.stateDur) this.setState(ST.FALLEN, 0.55);
        this.anim(dt);
        return;
      }
      case ST.DIVE: {
        this.vy -= G * dt;
        this.y += this.vy * dt;
        if (this.y <= 0) {
          this.y = 0;
          this.vy = 0;
          const k = Math.exp(-5 * dt);
          this.vx *= k;
          this.vz *= k;
        }
        this.x += this.vx * dt;
        this.z += this.vz * dt;
        if (this.stateT > this.stateDur) {
          this.y = 0;
          this.setState(ST.FALLEN, 0.5);
        }
        this.anim(dt);
        return;
      }
      case ST.TACKLE:
        ctrl = 0.6;
        if (this.stateT > this.stateDur) this.setState(ST.RUN);
        break;
      case ST.KICK:
        ctrl = 0.55;
        desVx *= 0.6;
        desVz *= 0.6;
        this.kickT = clamp(this.stateT / this.stateDur, 0, 1);
        if (this.stateT > this.stateDur) {
          this.kickT = 0;
          this.setState(ST.RUN);
        }
        break;
      case ST.HEADER:
      case ST.JUMP:
        ctrl = 0.25;
        if (this.stateT > this.stateDur && this.y <= 0) this.setState(ST.RUN);
        break;
      case ST.THROW:
      case ST.HOLD:
        break;
      case ST.FEINT:
        // finta: mais agilidade para mudar de direção
        ctrl = 1.8;
        if (this.stateT > this.stateDur) this.setState(ST.RUN);
        break;
      case ST.OFF:
        return;
    }

    // pulo
    if (this.y > 0 || this.vy > 0) {
      this.vy -= G * dt;
      this.y += this.vy * dt;
      if (this.y <= 0) {
        this.y = 0;
        this.vy = 0;
      }
    }

    // limita a velocidade desejada
    const dm = Math.hypot(desVx, desVz);
    if (dm > vmax) {
      desVx *= vmax / dm;
      desVz *= vmax / dm;
    }
    let dvx = desVx - this.vx;
    let dvz = desVz - this.vz;
    const sp = Math.hypot(this.vx, this.vz);
    const trac = env.traction;
    if (sp > 0.6) {
      const ux = this.vx / sp;
      const uz = this.vz / sp;
      let along = dvx * ux + dvz * uz;
      let lx = dvx - along * ux;
      let lz = dvz - along * uz;
      const lat = Math.hypot(lx, lz);
      const aFwd = Math.max(0.8, (vmax - sp) / this.tau() + 0.4) * ctrl;
      const aBrake = (6.2 + this.a.acc * 2) * trac * ctrl;
      const aLat = (4.6 + this.a.acc * 1.6 + this.a.dri * 0.8) * trac * ctrl;
      along = along > 0 ? Math.min(along, aFwd * dt) : Math.max(along, -aBrake * dt);
      if (lat > aLat * dt) {
        // curva fechada demais em gramado escorregadio: pode escorregar
        if (!this.hasBall && trac < 0.9 && sp > 6.2 && lat / dt > aLat * 2.4 && rng && rng() < (1 - trac) * 0.05) {
          this.setState(ST.FALLEN, 0.9);
          this.slipped = true;
        }
        lx *= (aLat * dt) / lat;
        lz *= (aLat * dt) / lat;
      }
      this.vx += along * ux + lx;
      this.vz += along * uz + lz;
    } else {
      const a0 = (vmax / this.tau()) * 1.1 * ctrl * (0.6 + 0.4 * trac);
      const m = Math.hypot(dvx, dvz);
      if (m > a0 * dt) {
        dvx *= (a0 * dt) / m;
        dvz *= (a0 * dt) / m;
      }
      this.vx += dvx;
      this.vz += dvz;
    }
    this.x += this.vx * dt;
    this.z += this.vz * dt;

    // orientação do corpo
    const nsp = Math.hypot(this.vx, this.vz);
    if (this.state === ST.FEINT && this.feintFace != null) {
      this.face = this.feintFace;
    } else {
      let tf = this.faceTarget;
      if (tf == null) tf = nsp > 0.4 ? Math.atan2(this.vz, this.vx) : this.face;
      const rate = lerp(11, 4.5, clamp(nsp / 9, 0, 1)) * (this.state === ST.KICK ? 0.5 : this.state === ST.FEINT ? 2.2 : 1);
      const d = angleDiff(this.face, tf);
      this.face += clamp(d, -rate * dt, rate * dt);
    }

    // fôlego
    const rel = nsp / Math.max(1, vmax);
    if (rel > 0.78) {
      this.stamina -= dt * 0.03 * rel * rel * env.staminaMul * (1.45 - this.a.sta * 0.7);
    } else {
      this.stamina += dt * (rel < 0.4 ? 0.022 : 0.009) * (0.7 + this.a.sta * 0.5);
    }
    // cansaço acumulado (tempo de jogo): ~0,1–0,3 ao fim de 90 min
    this.fatigue += fdt * (0.000022 + 0.000028 * rel) * env.staminaMul * (1.5 - this.a.sta);
    this.stamina = clamp(this.stamina, 0.05, 1 - this.fatigue * 0.6);
    this.anim(dt);
  }

  anim(dt) {
    const sp = Math.hypot(this.vx, this.vz);
    const stride = 0.85 + sp * 0.11;
    this.phase += ((sp * dt) / stride) * Math.PI;
    // inclinação do tronco com a aceleração
    const tgtLean = clamp(sp / 9, 0, 1) * 0.22;
    this.lean += (tgtLean - this.lean) * Math.min(1, dt * 6);
  }

  // Pontos úteis
  footX() {
    return this.x + Math.cos(this.face) * 0.28;
  }
  footZ() {
    return this.z + Math.sin(this.face) * 0.28;
  }

  writePose(arr, o) {
    arr[o] = this.x;
    arr[o + 1] = this.y;
    arr[o + 2] = this.z;
    arr[o + 3] = this.face;
    arr[o + 4] = Math.hypot(this.vx, this.vz);
    arr[o + 5] = this.phase;
    arr[o + 6] = this.state;
    arr[o + 7] = this.stateT;
    arr[o + 8] = this.kickT;
    arr[o + 9] = this.kickSide;
    arr[o + 10] = this.aux1;
    arr[o + 11] = this.aux2;
    arr[o + 12] = this.lean;
    arr[o + 13] = this.holding ? 1 : 0;
    arr[o + 14] = this.celebType;
    arr[o + 15] = this.active && !this.sentOff ? 1 : 0;
  }
}

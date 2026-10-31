// Partida: laço de simulação em passo fixo, contato jogador–bola (condução,
// domínio, interceptação, cabeceio, desvio no corpo), chutes com erro humano,
// desarmes, faltas, cartões, impedimento, saídas de bola, bolas paradas,
// cronômetro com acréscimos, prorrogação, pênaltis, estatísticas e replay.
import { PITCH as P, BALL as B, STEP } from './constants.js';
import { Ball, predictBall, buildRollTable, groundPassSpeed, groundTravelTime, solveDrive, solveLob } from './ball.js';
import { Team } from './team.js';
import { PlayerEnt, ST, POSE_SIZE } from './player.js';
import { TeamAI } from './ai.js';
import { keeperThink, keeperContact } from './keeper.js';
import { setupPositions } from './setpieces.js';
import { xgAt, inBox, segDist } from './geom.js';
import { clamp, lerp, mulberry32, smoothstep } from '../util.js';

const R = B.r;

// Fintas: duração, momento em que o marcador é testado, alcance, eficácia e
// quanto um desarme perde de chance durante o movimento.
export const FEINTS = {
  dois: { name: 'Dois toques', code: 1, dur: 0.5, judge: 0.35, range: 3, power: 0.36, tackle: 0.5 },
  pedalada: { name: 'Pedalada', code: 2, dur: 0.75, judge: 0.55, range: 3.4, power: 0.5, tackle: 0.6 },
  giro: { name: 'Giro', code: 3, dur: 0.7, judge: 0.5, range: 3, power: 0.42, tackle: 0.2 },
  corte: { name: 'Corte seco', code: 4, dur: 0.38, judge: 0.2, range: 4.4, power: 0.8, tackle: 0.35 },
};

export const DIFFICULTY = {
  amador: { name: 'Amador', react: 0.36, think: 0.55, acc: 1.35, tackle: 0.7, gk: 0.82, noise: 0.35, press: 0.75 },
  profissional: { name: 'Profissional', react: 0.26, think: 0.4, acc: 1.12, tackle: 0.88, gk: 0.93, noise: 0.2, press: 0.9 },
  mundial: { name: 'Mundial', react: 0.19, think: 0.3, acc: 1.0, tackle: 1.0, gk: 1.0, noise: 0.1, press: 1 },
  lendario: { name: 'Lendário', react: 0.13, think: 0.22, acc: 0.9, tackle: 1.1, gk: 1.06, noise: 0.04, press: 1.1 },
};
const TEAMMATE_SKILL = { name: 'Companheiros', react: 0.2, think: 0.32, acc: 1.0, tackle: 0.95, gk: 1.0, noise: 0.12, press: 0.95 };

const PERIOD_END = [0, 2700, 5400, 6300, 7200];
const PRED_N = 72;
const PRED_DT = 0.05;
const REC_HZ = 30;
const REC_SECONDS = 12;

export class Match {
  constructor(o) {
    this.opts = o;
    this.seed = o.seed || ((Math.random() * 1e9) | 0);
    this.r = mulberry32(this.seed);
    this.env = o.env;
    this.roll = buildRollTable(this.env);
    this.ball = new Ball();
    this.ball.seed = this.r() * 100;
    this.halfMinutes = o.halfMinutes || 4;
    this.timeScale = 2700 / (this.halfMinutes * 60);
    this.knockout = !!o.knockout;
    this.extraTimeAllowed = o.extraTime !== false && this.knockout;
    this.teams = [
      new Team(0, o.home, o.homeKit, { mentality: o.homeMentality || 0, formation: o.homeFormation, unavailable: o.homeUnavailable }),
      new Team(1, o.away, o.awayKit, { mentality: o.awayMentality || 0, formation: o.awayFormation, unavailable: o.awayUnavailable }),
    ];
    this.teams[0].opp = this.teams[1];
    this.teams[1].opp = this.teams[0];
    this.userSide = o.userSide == null ? 0 : o.userSide;
    const diff = DIFFICULTY[o.difficulty || 'profissional'];
    this.skill = [this.userSide === 0 ? TEAMMATE_SKILL : diff, this.userSide === 1 ? TEAMMATE_SKILL : diff];
    if (this.userSide < 0) this.skill = [DIFFICULTY.mundial, DIFFICULTY.mundial];
    for (const t of this.teams) t.user = t.side === this.userSide;
    this.ai = [new TeamAI(this, this.teams[0]), new TeamAI(this, this.teams[1])];
    this.inputs = [null, null];
    // árbitro e assistentes (só visuais)
    const mk = (role) => {
      const p = new PlayerEnt(null, { attr: { pac: 70, acc: 60, sta: 90 }, height: 1.8, shirt: role, foot: 'D' }, 'REF');
      p.isRef = true;
      return p;
    };
    this.referee = mk('Árbitro');
    this.assist = [mk('Assistente'), mk('Assistente')];
    this.flag = [0, 0];
    this.pred = [];
    this.time = 0;
    this.clock = 0;
    this.period = 1;
    this.added = [0, 0, 0, 0, 0];
    this.addedShown = false;
    this.stoppageSec = 0;
    this.state = 'pre';
    this.stateT = 0;
    this.sp = null;
    this.possessor = null;
    this.possTeam = null;
    this.lastTouch = null;
    this.lastKick = null;
    this.passInfo = null;
    this.offside = null;
    this.advantage = null;
    this.goals = [];
    this.cards = [];
    this.feed = [];
    this.listeners = [];
    this.penalties = null;
    this.result = null;
    this.kickoffTeam = this.r() < 0.5 ? 0 : 1;
    this.firstKickoff = this.kickoffTeam;
    this.rebuildAll();
    // gravação para replay
    this.recFrameSize = (this.all.length + 3) * POSE_SIZE + 8;
    this.recN = REC_HZ * REC_SECONDS;
    this.rec = new Float32Array(this.recN * (24 + 3) * POSE_SIZE + this.recN * 8 + 64);
    this.recStride = 27 * POSE_SIZE + 8;
    this.recHead = 0;
    this.recCount = 0;
    this.recAcc = 0;
    this.recMap = [];
    this.excitement = 0;
    this.lastShot = null;
    this.events = [];
    this.startKickoff(this.kickoffTeam, true);
  }

  on(fn) {
    this.listeners.push(fn);
  }
  emit(type, data = {}) {
    data.type = type;
    for (const fn of this.listeners) fn(data);
  }
  say(text, kind = 'info', important = false) {
    const m = this.minute();
    this.feed.push({ min: m, text, kind });
    this.emit('msg', { text, kind, important });
  }

  rebuildAll() {
    this.all = [...this.teams[0].players, ...this.teams[1].players].filter((p) => p.active && !p.sentOff);
  }

  minute() {
    const base = PERIOD_END[this.period - 1] || 0;
    const end = PERIOD_END[this.period] || base;
    const c = this.clock;
    if (c > end) return `${end / 60}+${Math.ceil((c - end) / 60)}`;
    return String(Math.floor(c / 60) + 1);
  }
  minuteNum() {
    return Math.floor(this.clock / 60) + 1;
  }

  setInput(side, inp) {
    this.inputs[side] = inp;
  }

  // ------------------------------------------------------------ laço principal

  update(dt) {
    this.acc = (this.acc || 0) + Math.min(dt, 0.1);
    let n = 0;
    while (this.acc >= STEP && n < 6) {
      this.step(STEP);
      this.acc -= STEP;
      n++;
    }
    this.alpha = this.acc / STEP;
  }

  step(dt) {
    if (this.state === 'over') return;
    this.time += dt;
    this.stateT += dt;
    const live = this.state === 'play';
    const onField = live || this.state === 'setpiece' || this.state === 'dead' || this.state === 'kickoff';

    if (onField && this.period <= 4) {
      this.clock += dt * this.timeScale;
      for (const p of this.all) p.stats.minutes += (dt * this.timeScale) / 60;
    }

    predictBall(this.ball, this.env, PRED_N, PRED_DT, this.pred);
    this.computeIntercepts();

    // decisões
    for (const t of this.teams) t.ctrlMark = null;
    if (this.state === 'play') {
      this.ai[0].update(dt);
      this.ai[1].update(dt);
      for (const t of this.teams) if (t.user) this.userStep(t, dt);
      for (const t of this.teams) {
        const gk = t.gk();
        if (gk && !(gk.userCtl && !gk.userAuto)) keeperThink(this, gk, dt);
      }
    } else if (this.state === 'setpiece') {
      this.setPieceStep(dt);
      for (const t of this.teams) if (t.user) this.userStep(t, dt);
    } else {
      this.ai[0].idle(dt);
      this.ai[1].idle(dt);
    }

    if (this.state === 'play') {
      this.steerPossessor();
      this.updateFeints(dt);
    }

    // movimento
    const fdt = onField ? dt * this.timeScale : 0;
    for (const p of this.all) {
      p.hasBall = this.ball.glue === p;
      p.step(dt, this.env, fdt, this.r);
    }
    this.moveOfficials(dt);
    this.collidePlayers();

    // ações pendentes (chutes) e bola
    for (const p of this.all) if (p.pending) this.processPending(p, dt);
    this.ball.step(dt, this.env, 4);
    this.updateGlue(dt);
    if (this.ball.held) this.updateHeld();

    if (live || this.state === 'goal' || this.state === 'dead') {
      this.contacts(dt);
      this.ballEvents();
    }
    if (live && this.period < 5) {
      this.rules(dt);
      this.updatePossession(dt);
      this.updateAdvantage(dt);
    }
    this.stateMachine(dt);
    this.updateExcitement(dt);
    this.record(dt);
  }

  // ------------------------------------------------------------ interceptação

  timeToCover(p, x, z) {
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.01) return 0;
    const ux = dx / d;
    const uz = dz / d;
    const vmax = p.vmax(this.env);
    const tau = p.tau();
    const sp = Math.hypot(p.vx, p.vz);
    const v0 = clamp(p.vx * ux + p.vz * uz, -vmax, vmax);
    let t = d / vmax + tau * 0.6;
    const dv = vmax - Math.max(0, v0);
    for (let i = 0; i < 4; i++) {
      const e = Math.exp(-t / tau);
      const f = vmax * t - dv * tau * (1 - e) - d;
      const fp = vmax - dv * e;
      t = Math.max(0.01, t - f / Math.max(0.5, fp));
    }
    // virar o corpo custa tempo
    if (sp > 1 && v0 < sp * 0.7) t += (0.18 * (sp - v0)) / vmax + 0.06;
    return t;
  }

  computeIntercepts() {
    const pr = this.pred;
    for (const t of this.teams) {
      t.bestInt = null;
      t.int2 = null;
    }
    for (const p of this.all) {
      p.interceptT = Infinity;
      if (p.busy() && p.state !== ST.TACKLE) {
        p.interceptT = 9;
      }
      const reach = p.isGK ? 0.9 : 0.55;
      let found = false;
      for (let i = 0; i < pr.length; i++) {
        const s = pr[i];
        if (s.y > (p.isGK && this.canHandle(p) ? 2.3 : 1.05)) continue;
        const d = Math.hypot(s.x - p.x, s.z - p.z) - reach;
        const tr = d <= 0 ? 0 : this.timeToCover(p, s.x, s.z) * (d / (d + reach)) + p.reactT * 0.5;
        if (tr <= s.t) {
          p.interceptT = s.t + (p.busy() ? 0.6 : 0);
          p.interceptP = s;
          found = true;
          break;
        }
      }
      if (!found) {
        const s = pr[pr.length - 1];
        p.interceptT = Math.max(s.t, this.timeToCover(p, s.x, s.z)) + (p.busy() ? 0.6 : 0);
        p.interceptP = s;
      }
      const t = p.team;
      if (!t.bestInt || p.interceptT < t.bestInt.interceptT) {
        t.int2 = t.bestInt;
        t.bestInt = p;
      } else if (!t.int2 || p.interceptT < t.int2.interceptT) t.int2 = p;
    }
  }

  // ------------------------------------------------------------ fintas

  // dx, dz: direção do drible no mundo (para onde o jogador quer sair).
  startFeint(p, type, dx, dz) {
    if (p.feint || this.ball.glue !== p || this.possessor !== p || p.busy() || p.pending) return false;
    const F = FEINTS[type];
    const l = Math.hypot(dx, dz) || 1;
    dx /= l;
    dz /= l;
    const sp = p.speed;
    // direção "para a frente" do jogador antes da finta
    const fx = sp > 0.5 ? p.vx / sp : Math.cos(p.face);
    const fz = sp > 0.5 ? p.vz / sp : Math.sin(p.face);
    p.feint = { type, t0: this.time, dur: F.dur, dx, dz, fx, fz, face0: p.face, sp0: sp, judged: false, bdx: null, bdz: null };
    p.setState(ST.FEINT, F.dur);
    p.aux1 = F.code;
    p.aux2 = 0;
    // do lado da finta (para a animação): + = esquerda do corpo
    p.feintSide = Math.sign(-Math.sin(p.face) * dx + Math.cos(p.face) * dz) || 1;
    p.touchCD = 0;
    if (type === 'corte') {
      // corte seco: muda de direção na hora, sem frear
      const v = Math.max(sp, 4.5) * 0.95;
      p.vx = dx * v;
      p.vz = dz * v;
      p.face = Math.atan2(dz, dx);
    }
    this.emit('feint', { player: p, type, name: F.name });
    return true;
  }

  updateFeints(dt) {
    for (const p of this.all) {
      const f = p.feint;
      if (!f) continue;
      const b = this.ball;
      if (this.possessor !== p || b.glue !== p || p.busy() || p.pending) {
        this.endFeint(p);
        continue;
      }
      const F = FEINTS[f.type];
      const t = (this.time - f.t0) / f.dur;
      if (t >= 1) {
        this.endFeint(p);
        continue;
      }
      p.aux2 = t;
      const vmax = p.vmax(this.env);
      p.faceTarget = null;
      p.feintFace = null;
      switch (f.type) {
        case 'dois': {
          // toca a bola de um pé para o outro, para o lado, e sai em velocidade
          const lat = t < 0.45 ? 4.5 : 6.5;
          p.desVx = f.dx * lat + f.fx * f.sp0 * 0.25;
          p.desVz = f.dz * lat + f.fz * f.sp0 * 0.25;
          f.bdx = f.dx;
          f.bdz = f.dz;
          break;
        }
        case 'pedalada': {
          // passa a perna por cima da bola (corpo balança) e arranca para o lado escolhido
          if (t < 0.65) {
            p.desVx = f.fx * Math.max(1.2, f.sp0 * 0.35);
            p.desVz = f.fz * Math.max(1.2, f.sp0 * 0.35);
            f.bdx = f.fx;
            f.bdz = f.fz;
            p.feintFace = Math.atan2(f.fz, f.fx) + Math.sin(t * Math.PI * 3) * 0.35;
          } else {
            p.desVx = f.dx * vmax * 0.9;
            p.desVz = f.dz * vmax * 0.9;
            f.bdx = f.dx;
            f.bdz = f.dz;
          }
          break;
        }
        case 'giro': {
          // gira 360° por cima da bola, protegendo-a, e segue na direção pedida
          const ex = f.dx;
          const ez = f.dz;
          p.desVx = ex * 2.6;
          p.desVz = ez * 2.6;
          p.feintFace = f.face0 + Math.PI * 2 * Math.min(1, t * 1.05) * (p.feintSide || 1);
          f.bdx = ex;
          f.bdz = ez;
          break;
        }
        case 'corte':
          p.desVx = f.dx * vmax * 0.95;
          p.desVz = f.dz * vmax * 0.95;
          p.feintFace = Math.atan2(f.dz, f.dx);
          f.bdx = f.dx;
          f.bdz = f.dz;
          break;
      }
      p.intVx = p.desVx;
      p.intVz = p.desVz;
      // no meio da finta, os marcadores perto podem ser enganados
      if (!f.judged && t >= F.judge) {
        f.judged = true;
        this.judgeFeint(p, f, F);
      }
    }
  }

  judgeFeint(p, f, F) {
    let fooled = 0;
    for (const o of p.team.opp.active) {
      if (o.isGK && !this.canHandle(o)) continue;
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d > F.range || o.busy()) continue;
      let chance = F.power + (p.a.dri - o.a.tac) * 0.6 + (p.a.acc - o.a.acc) * 0.15;
      if (!o.team.user) chance /= Math.max(0.7, this.skill[o.team.side].tackle);
      chance = clamp(chance, 0.08, 0.92);
      if (this.r() < chance) {
        fooled++;
        // vai para o lado errado e perde o tempo da jogada
        o.setState(ST.STUMBLE, 0.45 + this.r() * 0.35);
        o.vx = -f.dx * 2.2 + o.vx * 0.3;
        o.vz = -f.dz * 2.2 + o.vz * 0.3;
        o.tackleT = 1.2;
        o.reactT = 0.4;
      }
    }
    if (fooled && p.team.user) this.emit('feint-ok', { player: p, n: fooled });
  }

  endFeint(p) {
    p.feint = null;
    p.feintFace = null;
    p.aux2 = 0;
    if (p.state === ST.FEINT) p.setState(ST.RUN);
  }

  // Condução colada: enquanto o jogador tem a posse, a bola fica presa à
  // frente do pé e acompanha cada passo e cada virada do corpo. Ela só sai
  // num passe/chute, numa arrancada, num desarme ou se o jogador cair.
  updateGlue(dt) {
    const b = this.ball;
    const p = this.possessor;
    const ok = p && !b.held && !b.fixed && p.active && !p.sentOff && (this.state === 'play' || this.state === 'goal') && b.p.y < 0.7;
    if (!ok) {
      // passe, chute, desarme ou bola parada: a velocidade já foi definida
      b.glue = null;
      return;
    }
    if (p.busy()) {
      // tropeçou, caiu ou foi derrubado: a bola escapa
      if (b.glue === p) this.releaseGlue(p, 0.9);
      return;
    }
    // arrancada pedida: toque longo à frente e a bola fica solta
    if (p.knockOn && this.time - p.knockOn < 0.4) {
      p.knockOn = 0;
      const dvx = p.intVx != null ? p.intVx : p.desVx;
      const dvz = p.intVz != null ? p.intVz : p.desVz;
      const dl = Math.hypot(dvx, dvz);
      const ux = dl > 0.3 ? dvx / dl : Math.cos(p.face);
      const uz = dl > 0.3 ? dvz / dl : Math.sin(p.face);
      const v = p.speed + 4 + p.a.pac * 2.5;
      const control = p.a.dri * 0.7 + p.a.con * 0.3;
      const a = Math.atan2(uz, ux) + this.gauss() * (0.02 + 0.06 * (1 - control));
      b.glue = null;
      b.v.x = Math.cos(a) * v;
      b.v.z = Math.sin(a) * v;
      b.v.y = 0;
      this.rollSpin();
      p.glueBlock = this.time + 0.45;
      p.touchCD = 0.25;
      this.emit('touch', { player: p });
      return;
    }
    if (p.glueBlock && this.time < p.glueBlock) return;
    // ponto à frente do pé, na direção do corpo
    const sp = p.speed;
    const off = 0.34 + Math.min(sp, 9) * 0.025;
    // nas fintas a bola segue a direção do drible, não a do corpo
    const fdx = p.feint && p.feint.bdx != null ? p.feint.bdx : Math.cos(p.face);
    const fdz = p.feint && p.feint.bdx != null ? p.feint.bdz : Math.sin(p.face);
    const tx = p.x + fdx * off;
    const tz = p.z + fdz * off;
    const dx = tx - b.p.x;
    const dz = tz - b.p.z;
    const d = Math.hypot(dx, dz);
    if (b.glue !== p) {
      // só prende quando a bola está ao alcance do pé
      if (d > 1.1) return;
      b.glue = p;
      if (b.glue && p.team.user) this.emit('touch', { player: p });
    }
    // aproxima suavemente se veio de longe (domínio), depois fica colada
    const pull = Math.min(1, dt * 18);
    const nx = d > 0.05 ? b.p.x + dx * pull : tx;
    const nz = d > 0.05 ? b.p.z + dz * pull : tz;
    b.v.x = (nx - b.p.x) / dt;
    b.v.z = (nz - b.p.z) / dt;
    b.v.y = 0;
    b.p.x = nx;
    b.p.z = nz;
    b.p.y = R;
    this.rollSpin();
    this.lastTouch = { p, kind: 'dribble', t: this.time };
  }

  releaseGlue(p, k) {
    const b = this.ball;
    b.glue = null;
    b.v.x = p.vx * k;
    b.v.z = p.vz * k;
    b.v.y = 0;
    this.rollSpin();
  }

  // O condutor ajusta o passo até a bola entre um toque e outro; a direção
  // pedida (pelo jogador ou pela IA) fica guardada para o próximo toque.
  steerPossessor() {
    const p = this.possessor;
    if (!p) return;
    p.intVx = p.desVx;
    p.intVz = p.desVz;
    const b = this.ball;
    if (p.pending || p.state !== ST.RUN || b.held || b.glue === p) return;
    const ds = Math.hypot(p.desVx, p.desVz);
    if (ds < 0.5) return;
    const ux = p.desVx / ds;
    const uz = p.desVz / ds;
    const tx = b.p.x + b.v.x * 0.15 - p.x;
    const tz = b.p.z + b.v.z * 0.15 - p.z;
    const d = Math.hypot(tx, tz);
    if (d < 0.35 || d > 4) return;
    const cos = (tx * ux + tz * uz) / d;
    let nx;
    let nz;
    let sp = ds;
    if (cos > 0.35) {
      const w = 0.55;
      nx = ux * (1 - w) + (tx / d) * w;
      nz = uz * (1 - w) + (tz / d) * w;
    } else if (d < 2.6) {
      // mudança brusca de direção: primeiro vai até a bola
      nx = tx / d;
      nz = tz / d;
      sp = Math.min(p.vmax(this.env), d * 3 + Math.hypot(b.v.x, b.v.z));
    } else return;
    const nl = Math.hypot(nx, nz) || 1;
    p.desVx = (nx / nl) * sp;
    p.desVz = (nz / nl) * sp;
  }

  // ------------------------------------------------------------ colisões entre jogadores

  collidePlayers() {
    const all = this.all;
    for (let i = 0; i < all.length; i++) {
      const a = all[i];
      if (a.state === ST.OFF) continue;
      for (let j = i + 1; j < all.length; j++) {
        const b = all[j];
        const dx = b.x - a.x;
        const dz = b.z - a.z;
        const d2 = dx * dx + dz * dz;
        const minD = 0.62;
        if (d2 >= minD * minD || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const nx = dx / d;
        const nz = dz / d;
        const pen = minD - d;
        // o mais forte e mais rápido empurra mais
        const ma = 70 + a.a.str * 25 + a.speed * 3;
        const mb = 70 + b.a.str * 25 + b.speed * 3;
        const fa = mb / (ma + mb);
        const fb = 1 - fa;
        a.x -= nx * pen * fa;
        a.z -= nz * pen * fa;
        b.x += nx * pen * fb;
        b.z += nz * pen * fb;
        const rv = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
        if (rv < 0) {
          a.vx += nx * rv * fa * 0.8;
          a.vz += nz * rv * fa * 0.8;
          b.vx -= nx * rv * fb * 0.8;
          b.vz -= nz * rv * fb * 0.8;
          // trombada forte com quem conduz: disputa de corpo
          if (this.state === 'play' && a.team !== b.team && -rv > 3.5) this.bodyCharge(a, b, -rv, nx, nz);
        }
      }
    }
  }

  bodyCharge(a, b, impact, nx, nz) {
    const carrier = this.possessor === a ? a : this.possessor === b ? b : null;
    if (!carrier) return;
    const other = carrier === a ? b : a;
    // empurrão por trás = falta
    const fromX = carrier === a ? -nx : nx;
    const fromZ = carrier === a ? -nz : nz;
    const behind = Math.cos(carrier.face) * -fromX + Math.sin(carrier.face) * -fromZ;
    const strengthDiff = other.a.str - carrier.a.str;
    if (behind > 0.55 && impact > 4.5 && this.r() < 0.35) {
      this.foul(other, carrier, 0.35 + (impact - 4.5) * 0.08, 'empurrão');
      return;
    }
    if (this.r() < 0.18 + strengthDiff * 0.5) {
      carrier.setState(ST.STUMBLE, 0.35 + this.r() * 0.3);
    } else if (this.r() < 0.12 - strengthDiff * 0.3) {
      other.setState(ST.STUMBLE, 0.4);
    }
  }

  // ------------------------------------------------------------ oficiais

  moveOfficials(dt) {
    const b = this.ball.p;
    const ref = this.referee;
    // diagonal: acompanha a jogada a ~15 m, deslocado para a lateral
    let tx = b.x * 0.85 - 6 * Math.sign(b.z || 1) * 0.5;
    let tz = clamp(b.z * 0.5 - 8, -P.HW + 4, P.HW - 4);
    if (this.state === 'setpiece' && this.sp) {
      tx = this.sp.x - Math.sign(this.sp.x || 1) * 12;
      tz = clamp(this.sp.z * 0.4 - 10, -P.HW + 3, P.HW - 3);
    }
    if (this.state === 'halftime' || this.state === 'over') {
      tx = 0;
      tz = P.HW + 2;
    }
    this.steerOfficial(ref, tx, tz, dt, b.x, b.z);
    // assistentes: na linha do penúltimo defensor, em lados opostos
    for (let i = 0; i < 2; i++) {
      const as = this.assist[i];
      const team = this.teams[i];
      // assistente i cobre a metade onde o time i defende
      const side = team.ownGoalX > 0 ? 1 : -1;
      const line = this.secondLastX(team);
      let x = side > 0 ? clamp(Math.max(line, b.x, 0), 0, P.HL) : clamp(Math.min(line, b.x, 0), -P.HL, 0);
      const z = i === 0 ? P.HW + 1.2 : -P.HW - 1.2;
      this.steerOfficial(as, x, z, dt, b.x, b.z);
      if (this.flag[i] > 0) this.flag[i] -= dt;
      as.aux1 = this.flag[i] > 0 ? 1 : 0;
    }
  }

  steerOfficial(o, tx, tz, dt, lx, lz) {
    const dx = tx - o.x;
    const dz = tz - o.z;
    const d = Math.hypot(dx, dz);
    const sp = Math.min(7, d * 1.2);
    o.desVx = d > 0.3 ? (dx / d) * sp : 0;
    o.desVz = d > 0.3 ? (dz / d) * sp : 0;
    o.faceTarget = Math.atan2(lz - o.z, lx - o.x);
    o.step(dt, this.env, 0, null);
  }

  // x do penúltimo jogador do time (referência do impedimento contra ele).
  secondLastX(team) {
    const g = team.ownGoalX;
    const xs = team.active.map((p) => p.x).sort((a, b) => (g > 0 ? b - a : a - b));
    return xs.length > 1 ? xs[1] : g;
  }
  // Linha de impedimento no referencial do time atacante (u).
  offsideLineU(team) {
    const opp = team.opp;
    const x = this.secondLastX(opp);
    const bu = team.u(this.ball.p.x);
    return Math.max(team.u(x), bu, 0.5);
  }

  // ------------------------------------------------------------ controle do usuário

  pickCtrl(team) {
    let best = null;
    let bt = Infinity;
    for (const p of team.active) {
      if (p.isGK) continue;
      const t = p.interceptT + (p.busy() ? 1 : 0);
      if (t < bt) {
        bt = t;
        best = p;
      }
    }
    return best || team.active[0];
  }

  setCtrl(team, p) {
    if (team.ctrl === p) return;
    if (team.ctrl) {
      team.ctrl.userCtl = false;
      team.ctrl.userAuto = false;
    }
    team.ctrl = p;
    team.ctrlSince = this.time;
    this.emit('switch', { side: team.side, player: p });
  }

  userStep(team, dt) {
    const inp = this.inputs[team.side];
    if (!inp) return;
    for (const p of team.players) p.userCtl = false;
    let c = team.ctrl;
    const b = this.ball;
    const haveBall = this.possessor && this.possessor.team === team;
    // jogador obrigatório em bola parada
    if (this.state === 'setpiece' && this.sp && this.sp.team === team && this.sp.taker) {
      if (c !== this.sp.taker) this.setCtrl(team, this.sp.taker);
      c = team.ctrl;
    } else if (haveBall && this.possessor !== c) {
      this.setCtrl(team, this.possessor);
      c = team.ctrl;
    }
    if (!c || !c.active || c.sentOff || c.state === ST.OFF) {
      this.setCtrl(team, this.pickCtrl(team));
      c = team.ctrl;
    }
    // goleiro só é controlado quando está com a bola ou cobra tiro de meta
    if (c.isGK && !(b.held === c) && !(this.sp && this.sp.taker === c && this.state === 'setpiece')) {
      this.setCtrl(team, this.pickCtrl(team));
      c = team.ctrl;
    }
    // troca automática quando o adversário tem a bola ou ela está solta
    const defending = !haveBall && !(this.passInfo && this.passInfo.team === team);
    if (defending && this.state === 'play' && this.time - (team.manualSwitchT || -9) > 1.2 && this.time - (team.ctrlSince || 0) > 0.5) {
      const best = this.pickCtrl(team);
      if (best !== c && c.interceptT - best.interceptT > 0.7) {
        this.setCtrl(team, best);
        c = best;
      }
    }
    // troca manual
    const sw = inp.pressed.has('switch') || (defending && inp.pressed.has('lob'));
    if (sw && this.state !== 'setpiece') {
      const cand = team.active
        .filter((p) => p !== c && !p.isGK)
        .sort((a, b2) => Math.hypot(a.x - b.p.x, a.z - b.p.z) + a.interceptT * 2 - (Math.hypot(b2.x - b.p.x, b2.z - b.p.z) + b2.interceptT * 2));
      if (cand[0]) {
        this.setCtrl(team, cand[0]);
        c = cand[0];
        team.manualSwitchT = this.time;
      }
    }
    c.userCtl = true;
    team.ctrlMark = c;

    const mx = inp.mx;
    const mz = inp.mz;
    const mag = Math.min(1, Math.hypot(mx, mz));
    const vmax = c.vmax(this.env);
    c.sprint = !!inp.sprint;
    const frozen = this.state === 'setpiece' && this.sp && this.sp.taker === c;
    // logo depois do passe, o receptor vai sozinho ao encontro da bola (o
    // direcional ainda apertado do passe não o leva para longe)
    c.stickX = mag > 0.12 ? mx / mag : null;
    c.stickZ = mag > 0.12 ? mz / mag : null;
    const lk = team.recvLock;
    const locked = lk && lk.p === c && this.time < lk.until && this.passInfo && this.passInfo.to === c;
    if (lk && !locked) team.recvLock = null;
    if (locked) {
      c.userAuto = true;
      c.faceTarget = null;
    } else if (frozen) {
      // o cobrador vai sozinho até a bola; o jogador só mira
      c.userAuto = false;
      if (mag > 0.2 && this.sp.ready && !c.pending) c.faceTarget = Math.atan2(mz, mx);
    } else if (mag > 0.12) {
      team.idleT = 0;
      c.userAuto = false;
      c.faceTarget = null;
      // direcional/analógico: o jogador anda; corrida só com o botão Correr
      const sp = c.sprint ? vmax : vmax * 0.5;
      c.desVx = (mx / Math.max(mag, 1e-6)) * mag * sp;
      c.desVz = (mz / Math.max(mag, 1e-6)) * mag * sp;
      // conter (marcação de lado): de frente para a bola
      if (inp.held && inp.held.has('contain') && !haveBall) {
        c.faceTarget = Math.atan2(b.p.z - c.z, b.p.x - c.x);
        c.desVx *= 0.55;
        c.desVz *= 0.55;
      }
    } else {
      team.idleT = (team.idleT || 0) + dt;
      const receiving = this.passInfo && this.passInfo.to === c;
      if (receiving || (!haveBall && team.idleT > 0.6) || this.state !== 'play') {
        c.userAuto = true; // a IA move o jogador parado
      } else {
        c.userAuto = false;
        c.desVx = c.desVz = 0;
      }
    }
    if (inp.held && inp.held.has('contain') && !haveBall && this.possessor && mag <= 0.12) {
      // conter sem direção: aproxima com cuidado do condutor
      const pp = this.possessor;
      const g = team.ownGoalX;
      const tx = pp.x + Math.sign(g - pp.x) * 1.8;
      const tz = pp.z * 0.95;
      const dx = tx - c.x;
      const dz = tz - c.z;
      const d = Math.hypot(dx, dz);
      c.userAuto = false;
      c.desVx = d > 0.3 ? (dx / d) * Math.min(vmax * 0.6, d * 2) : 0;
      c.desVz = d > 0.3 ? (dz / d) * Math.min(vmax * 0.6, d * 2) : 0;
      c.faceTarget = Math.atan2(pp.z - c.z, pp.x - c.x);
    }

    // chute/passe pedido: corre até a bola
    if (c.pending && !c.pending.started && !frozen && !this.ball.held) {
      const tx = b.p.x + b.v.x * 0.12;
      const tz = b.p.z + b.v.z * 0.12;
      const dx = tx - c.x;
      const dz = tz - c.z;
      const d = Math.hypot(dx, dz);
      const sp = Math.min(vmax, d * 4 + Math.hypot(b.v.x, b.v.z));
      c.desVx = d > 0.02 ? (dx / d) * sp : 0;
      c.desVz = d > 0.02 ? (dz / d) * sp : 0;
      c.userAuto = false;
    }

    const rel = inp.released;
    // fintas: direção do analógico (na tela) + botão Finta; dois toques
    // seguidos no botão = corte seco
    if (this.state === 'play') {
      const owns = this.possessor === c && this.ball.glue === c;
      if (inp.pressed.has('feint') && owns) {
        const tap = team.feintTap;
        if (tap && this.time - tap.t < 0.32) {
          team.feintTap = null;
          const dl = mag > 0.2 ? mag : 0;
          this.startFeint(c, 'corte', dl ? mx / dl : Math.cos(c.face + 1.2), dl ? mz / dl : Math.sin(c.face + 1.2));
        } else team.feintTap = { t: this.time, sx: inp.sx || 0, sy: inp.sy || 0, mx, mz, mag };
      }
      const tap = team.feintTap;
      if (tap && this.time - tap.t >= 0.32) {
        team.feintTap = null;
        if (owns) {
          // usa a direção do momento do toque (ou a atual, se estava solto)
          let sx = tap.sx;
          let sy = tap.sy;
          let wx = tap.mx;
          let wz = tap.mz;
          let wm = tap.mag;
          if (Math.hypot(sx, sy) < 0.35) {
            sx = inp.sx || 0;
            sy = inp.sy || 0;
            wx = mx;
            wz = mz;
            wm = mag;
          }
          const fx = wm > 0.2 ? wx / wm : Math.cos(c.face);
          const fz = wm > 0.2 ? wz / wm : Math.sin(c.face);
          let type = 'pedalada';
          if (Math.abs(sx) >= Math.abs(sy) * 0.8 && sx < -0.35) type = 'dois';
          else if (Math.abs(sx) >= Math.abs(sy) * 0.8 && sx > 0.35) type = 'pedalada';
          else if (Math.abs(sy) > 0.35) type = 'giro';
          this.startFeint(c, type, fx, fz);
        }
      }
    }

    // pênalti contra: o jogador escolhe o canto do goleiro
    if (this.sp && this.sp.type === 'penalty' && this.sp.team !== team) {
      const gk = team.gk();
      if (gk && (rel.size || inp.pressed.has('shoot') || inp.pressed.has('pass'))) {
        // canto relativo ao gol: o lado do eixo z
        gk.userDiveZ = Math.abs(mz) > 0.3 ? Math.sign(mz) : 0;
        this.emit('msg', { text: gk.userDiveZ === 0 ? 'Goleiro fica no meio' : 'Canto escolhido', kind: 'info' });
      }
    }

    // ---- ações
    const dirx = mag > 0.2 ? mx / mag : Math.cos(c.face);
    const dirz = mag > 0.2 ? mz / mag : Math.sin(c.face);
    const ballDist = Math.hypot(b.p.x - c.x, b.p.z - c.z);
    const canPlay = this.state === 'play' || (frozen && this.sp && this.sp.ready);
    const hasIt = (haveBall && this.possessor === c) || (ballDist < 1.6 && !this.possessor && b.p.y < 1.2) || (frozen && this.sp && this.sp.ready) || b.held === c;
    if (!canPlay) return;

    if (hasIt) {
      if (rel.has('shoot')) this.userShot(c, inp, rel.get('shoot'), dirx, dirz, mag);
      else if (rel.has('pass')) this.userPass(c, 'pass', rel.get('pass'), dirx, dirz, mag);
      else if (rel.has('lob')) this.userPass(c, 'lob', rel.get('lob'), dirx, dirz, mag);
      else if (rel.has('through')) this.userPass(c, 'through', rel.get('through'), dirx, dirz, mag);
      else if (inp.pressed.has('knock') && haveBall) c.knockOn = this.time;
    } else {
      // bola alta chegando: cabeceio / voleio
      const aerial = b.p.y > 0.7 && ballDist < 3;
      if (aerial && (rel.has('shoot') || rel.has('pass') || rel.has('lob'))) {
        const k = rel.has('shoot') ? 'shoot' : rel.has('pass') ? 'pass' : 'lob';
        c.headerIntent = { kind: k, dirx, dirz, power: rel.get(k), t: this.time };
        c.wantJump = this.time;
      } else if (!haveBall) {
        if (inp.pressed.has('pass')) this.standTackle(c);
        else if (inp.pressed.has('shoot')) this.slideTackle(c);
        if (inp.pressed.has('through')) team.callPress = this.time + 2;
      }
      // chute de primeira com a bola chegando rasteira
      if (haveBall === false && this.passInfo && this.passInfo.to === c && ballDist < 4) {
        if (rel.has('shoot')) this.userShot(c, inp, rel.get('shoot'), dirx, dirz, mag);
        else if (rel.has('pass')) this.userPass(c, 'pass', rel.get('pass'), dirx, dirz, mag);
      }
    }
  }

  // Passe assistido: escolhe o companheiro mais bem colocado no cone da direção.
  findPassTarget(c, dirx, dirz, kind, power) {
    let best = null;
    let bs = -1e9;
    for (const m of c.team.active) {
      if (m === c) continue;
      const dx = m.x - c.x;
      const dz = m.z - c.z;
      const d = Math.hypot(dx, dz);
      if (d < 3) continue;
      const cos = (dx * dirx + dz * dirz) / d;
      if (cos < 0.3) continue;
      // fora do cone principal (±50°) só vale se não houver ninguém dentro
      let s = cos * 3 - d / (kind === 'lob' ? 60 : 35) - (cos < 0.64 ? 3 : 0);
      // espaço livre do companheiro
      let near = 99;
      for (const o of c.team.opp.active) near = Math.min(near, Math.hypot(o.x - m.x, o.z - m.z));
      s += Math.min(near, 8) * 0.12;
      if (m.isGK) s -= 1.5;
      if (s > bs) {
        bs = s;
        best = m;
      }
    }
    return best;
  }

  userPass(c, kind, power, dirx, dirz, mag) {
    const b = this.ball;
    const isThrow = this.sp && this.sp.type === 'throw' && this.state === 'setpiece';
    const m = this.findPassTarget(c, dirx, dirz, kind, power);
    let spec;
    if (m) {
      if (kind === 'through' || (kind === 'lob' && m.team.opp && this.isRunner(m))) spec = this.throughSpec(c, m, kind === 'lob' ? 'lob' : 'ground', power);
      else spec = this.passSpec(c, m, kind === 'lob' ? 'lob' : 'ground', power);
    } else {
      // passe no espaço, distância pela força
      const dist = kind === 'lob' ? 15 + power * 45 : 6 + power * 32;
      const tx = clamp(c.x + dirx * dist, -P.HL + 1, P.HL - 1);
      const tz = clamp(c.z + dirz * dist, -P.HW + 1, P.HW - 1);
      spec = this.spaceSpec(c, tx, tz, kind === 'lob' ? 'lob' : 'ground', power);
    }
    if (isThrow) spec.kind = 'throw';
    // cruzamento: bola levantada na área
    if (kind === 'lob' && m && inBox(m.x, m.z, c.team.oppGoalX) && Math.abs(c.z) > 12) spec.cross = true;
    spec.user = true;
    this.queueKick(c, spec);
  }

  isRunner(m) {
    return m.run && m.run.until > this.time;
  }

  userShot(c, inp, power, dirx, dirz, mag) {
    const team = c.team;
    const gx = team.oppGoalX;
    const b = this.ball;
    const dGoal = Math.hypot(gx - b.p.x, b.p.z);
    // longe demais e mirando para trás: vira chutão
    const toGoalCos = ((gx - c.x) * dirx + (0 - c.z) * dirz) / Math.max(1, Math.hypot(gx - c.x, c.z));
    if (dGoal > 45 || (mag > 0.4 && toGoalCos < -0.2)) {
      const tx = clamp(c.x + dirx * 45, -P.HL + 2, P.HL - 2);
      const tz = clamp(c.z + dirz * 45, -P.HW + 2, P.HW - 2);
      const spec = this.spaceSpec(c, tx, tz, 'lob', 1);
      spec.kind = 'clear';
      this.queueKick(c, spec);
      return;
    }
    let aimZ;
    if (mag > 0.25) aimZ = clamp(dirz / Math.max(0.35, Math.hypot(dirx, dirz)), -1, 1) * 3.25;
    else aimZ = -Math.sign(b.p.z || (this.r() - 0.5)) * 2.4;
    if (team.dir < 0 && false) aimZ = -aimZ;
    const finesse = inp.held && inp.held.has('finesse');
    const chip = inp.held && inp.held.has('chip');
    const spec = this.shotSpec(c, aimZ, power, { finesse, chip });
    spec.user = true;
    this.queueKick(c, spec);
  }

  // ------------------------------------------------------------ especificações de chute

  // Velocidade com que o passe rasteiro chega ao companheiro: firme o bastante
  // para não ser cortado, macia o bastante para dominar. A força segurada só
  // ajusta um pouco (o passe é assistido).
  passArrive(d, power) {
    return clamp(6.2 + d * 0.16 + (power - 0.35) * 2.5, 5.5, 12.5);
  }

  passSpec(c, m, kind, power = 0.5) {
    const b = this.ball.p;
    // mira onde o companheiro vai estar quando a bola chegar
    let tx = m.x;
    let tz = m.z;
    let d = Math.hypot(tx - b.x, tz - b.z);
    for (let i = 0; i < 3; i++) {
      let T;
      if (kind === 'ground') {
        const v0 = Math.min(27, groundPassSpeed(this.roll, d, this.passArrive(d, power)));
        T = groundTravelTime(this.roll, v0, d);
        if (!isFinite(T)) T = d / 10;
      } else T = d / 17 + 0.45;
      const lt = Math.min(T, 2.2) * 0.8;
      tx = m.x + m.vx * lt;
      tz = m.z + m.vz * lt;
      d = Math.hypot(tx - b.x, tz - b.z);
    }
    const dd = d || 1;
    if (kind === 'ground') {
      // o receptor vem ao encontro da bola
      tx += ((b.x - tx) / dd) * 0.7;
      tz += ((b.z - tz) / dd) * 0.7;
    }
    tx = clamp(tx, -P.HL + 0.8, P.HL - 0.8);
    tz = clamp(tz, -P.HW + 0.8, P.HW - 0.8);
    d = Math.hypot(tx - b.x, tz - b.z);
    if (kind === 'ground') {
      return { kind: 'pass', tx, tz, ty: R, receiver: m, arrive: this.passArrive(d, power), power };
    }
    const header = inBox(m.x, m.z, c.team.oppGoalX);
    return { kind: 'lob', tx, tz, ty: header ? 1.6 : R, receiver: m, pitch: clamp(0.38 + d * 0.004, 0.36, 0.62), back: 18 + this.r() * 14, power };
  }

  throughSpec(c, m, kind, power = 0.5) {
    const team = c.team;
    const lead = clamp(4 + m.speed * 0.9 + power * 6, 4, 16);
    // direção da corrida (ou para o gol)
    let ux = m.vx;
    let uz = m.vz;
    let l = Math.hypot(ux, uz);
    if (l < 2) {
      ux = team.dir;
      uz = -m.z * 0.02;
      l = Math.hypot(ux, uz);
    }
    ux /= l;
    uz /= l;
    let tx = clamp(m.x + ux * lead, -P.HL + 3, P.HL - 3);
    let tz = clamp(m.z + uz * lead, -P.HW + 2, P.HW - 2);
    if (kind === 'ground') return { kind: 'through', tx, tz, ty: R, receiver: m, arrive: 4 + power * 3, power };
    return { kind: 'lob', tx, tz, ty: R, receiver: m, pitch: 0.5, back: 22, power };
  }

  spaceSpec(c, tx, tz, kind, power) {
    if (kind === 'ground') return { kind: 'pass', tx, tz, ty: R, receiver: null, arrive: 2 + power * 3, power };
    return { kind: 'lob', tx, tz, ty: R, receiver: null, pitch: 0.45 + power * 0.15, back: 20, power };
  }

  shotSpec(c, aimZ, power, o = {}) {
    const team = c.team;
    const gx = team.oppGoalX;
    const sgx = Math.sign(gx);
    if (o.chip) {
      return { kind: 'chip', tx: gx - sgx * 0.3, tz: aimZ * 0.6, ty: 1.4 + power * 0.6, pitch: 0.82, back: 35, power, isShot: true };
    }
    let ty = lerp(0.22, 2.15, smoothstep(0.12, 0.92, power));
    if (power > 0.92) ty += (power - 0.92) * 22; // isola a bola
    if (Math.abs(aimZ) > 3.0 && ty > 2.1) ty = 2.05;
    let speed = lerp(14, 24 + c.a.pow * 10, power);
    let side = 0;
    if (o.finesse) {
      speed *= 0.82;
      // curva para dentro: efeito no sentido que traz a bola para o gol
      const zs = Math.sign(aimZ || -c.z || 1);
      side = sgx * zs * (38 + power * 22);
    }
    return { kind: 'shot', tx: gx + sgx * 0.2, tz: aimZ, ty, speed, side, back: o.finesse ? 0 : -6 - power * 10, power, isShot: true, finesse: !!o.finesse };
  }

  // ------------------------------------------------------------ fila de chutes

  queueKick(p, spec) {
    if (p.busy()) return false;
    if (p.state === ST.KICK) return false;
    p.pending = { spec, t: 0, started: false };
    return true;
  }

  processPending(p, dt) {
    const pd = p.pending;
    const b = this.ball;
    pd.t += dt;
    if (p.busy()) {
      p.pending = null;
      return;
    }
    if (b.held === p) {
      // goleiro ou lateral soltando a bola
      if (!pd.started) {
        pd.started = true;
        pd.contactAt = pd.spec.kind === 'throw' ? 0.35 : 0.3;
        p.setState(pd.spec.kind === 'throw' ? ST.THROW : ST.KICK, pd.contactAt + 0.3);
      } else if (p.stateT >= pd.contactAt) {
        this.release(p, pd.spec);
        p.pending = null;
      }
      return;
    }
    if (!pd.started) {
      if (pd.t > 0.9) {
        p.pending = null;
        return;
      }
      const fx = p.x + Math.cos(p.face) * 0.25;
      const fz = p.z + Math.sin(p.face) * 0.25;
      const d = Math.hypot(b.p.x - fx, b.p.z - fz);
      const maxH = pd.spec.isShot ? 1.25 : 0.95;
      if (d < 0.95 && b.p.y < maxH && p.touchCD <= 0.05) {
        pd.started = true;
        const k = pd.spec.kind;
        pd.contactAt = k === 'shot' || k === 'clear' ? 0.17 : k === 'lob' || k === 'chip' ? 0.15 : 0.11;
        p.setState(ST.KICK, pd.contactAt + 0.24);
        // pé do chute: o do lado da bola (ou o bom pé)
        const side = Math.sin(Math.atan2(b.p.z - p.z, b.p.x - p.x) - p.face);
        p.kickSide = Math.abs(side) > 0.25 ? (side > 0 ? 1 : -1) : p.data.foot === 'E' ? -1 : 1;
        p.kickKind = k;
      }
    } else if (p.stateT >= pd.contactAt) {
      const d = Math.hypot(b.p.x - p.x, b.p.z - p.z);
      if (d < 1.15 && b.p.y < 1.4 && !b.held) this.execKick(p, pd.spec);
      p.pending = null;
    }
  }

  // Pressão sobre o jogador (0..1).
  pressureOn(p) {
    let pr = 0;
    for (const o of p.team.opp.active) {
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d < 4) pr += (4 - d) / 4;
    }
    return clamp(pr, 0, 1.5);
  }

  // Erro humano do chute (desvio angular em radianos).
  kickError(p, spec) {
    const a = p.a;
    let base;
    let skill;
    switch (spec.kind) {
      case 'shot':
        base = 0.072;
        skill = a.sho * 0.75 + a.con * 0.25;
        break;
      case 'chip':
        base = 0.06;
        skill = a.sho * 0.5 + a.dri * 0.5;
        break;
      case 'lob':
      case 'cross':
        base = 0.05;
        skill = a.pas * 0.8 + a.vis * 0.2;
        break;
      case 'header':
        base = 0.09;
        skill = a.hea;
        break;
      case 'clear':
      case 'punt':
        base = 0.09;
        skill = a.pas * 0.5 + 0.3;
        break;
      case 'throw':
        base = 0.04;
        skill = 0.7;
        break;
      default:
        base = 0.02;
        skill = a.pas * 0.8 + a.con * 0.2;
    }
    let f = 1.15 - 0.85 * clamp(skill, 0, 1);
    const b = this.ball;
    const pressure = this.pressureOn(p);
    const run = p.speed / Math.max(1, p.vmax(this.env));
    const rel = Math.hypot(b.v.x - p.vx, b.v.z - p.vz);
    // ângulo entre o corpo e a direção do chute
    const kd = Math.atan2(spec.tz - b.p.z, spec.tx - b.p.x);
    const bodyAng = Math.abs(Math.atan2(Math.sin(kd - p.face), Math.cos(kd - p.face)));
    const ground = spec.kind === 'pass' || spec.kind === 'through';
    f *= 1 + pressure * 0.55 + run * (ground ? 0.25 : 0.45) + smoothstep(0.6, 2.2, bodyAng) * (ground ? 0.4 : 0.8) + smoothstep(4, 16, rel) * 0.6;
    // passe assistido do jogador para um companheiro escolhido
    if (ground && spec.user && spec.receiver) f *= 0.7;
    if (b.p.y > 0.4 && spec.kind !== 'header') f *= 1.5; // voleio
    if (spec.power > 0.9 && spec.kind === 'shot') f *= 1.4;
    if (spec.finesse) f *= 0.85;
    f *= 1 + this.env.ballWet * 0.15 + this.env.snow * 0.2;
    f *= (1 - p.stamina) * 0.4 + 1;
    const sk = this.skill[p.team.side];
    if (!p.team.user || !spec.user) f *= sk.acc;
    return base * f;
  }

  execKick(p, spec) {
    const b = this.ball;
    const env = this.env;
    const from = { x: b.p.x, y: b.p.y, z: b.p.z };
    let sol;
    const k = spec.kind;
    // compensação parcial do vento pelo jogador
    const comp = 0.45 + p.a.vis * 0.4;
    const envS = { ...env, windX: env.windX * comp, windZ: env.windZ * comp };
    if (k === 'pass' || k === 'through') {
      const d = Math.hypot(spec.tx - from.x, spec.tz - from.z);
      const v0 = Math.min(groundPassSpeed(this.roll, d, spec.arrive || 4), 27);
      const ux = (spec.tx - from.x) / Math.max(0.01, d);
      const uz = (spec.tz - from.z) / Math.max(0.01, d);
      sol = { vx: ux * v0, vy: from.y > 0.3 ? -0.5 : 0.25, vz: uz * v0, wx: uz * (v0 / R), wy: 0, wz: -ux * (v0 / R) };
    } else if (k === 'lob' || k === 'chip' || k === 'clear' || k === 'punt' || k === 'throw' || k === 'cross') {
      const pitch = spec.pitch || (k === 'throw' ? 0.38 : k === 'clear' ? 0.62 : 0.5);
      sol = solveLob(from, { x: spec.tx, y: spec.ty || R, z: spec.tz }, pitch, { back: spec.back || 0, side: spec.side || 0 }, envS);
      if (k === 'throw') {
        const sp = Math.hypot(sol.vx, sol.vy, sol.vz);
        if (sp > 17) {
          sol.vx *= 17 / sp;
          sol.vy *= 17 / sp;
          sol.vz *= 17 / sp;
        }
      }
    } else if (k === 'shot') {
      sol = solveDrive(from, { x: spec.tx, y: spec.ty, z: spec.tz }, spec.speed, { side: spec.side || 0, back: spec.back || 0 }, envS);
    } else if (k === 'header') {
      sol = spec.sol;
    }
    if (!sol) return;
    // erro humano
    const err = this.kickError(p, spec);
    const ey = this.gauss() * err;
    const ep = this.gauss() * err * (k === 'pass' || k === 'through' ? 0.2 : 0.6);
    let vx = sol.vx;
    let vy = sol.vy;
    let vz = sol.vz;
    const c = Math.cos(ey);
    const s = Math.sin(ey);
    const nvx = vx * c - vz * s;
    const nvz = vx * s + vz * c;
    vx = nvx;
    vz = nvz;
    const hs = Math.hypot(vx, vz);
    const pitch0 = Math.atan2(vy, hs);
    const spd = Math.hypot(vx, vy, vz) * (1 + this.gauss() * err * 0.6);
    const np = pitch0 + ep;
    vy = Math.sin(np) * spd;
    const nh = Math.cos(np) * spd;
    vx = (vx / Math.max(1e-6, hs)) * nh;
    vz = (vz / Math.max(1e-6, hs)) * nh;
    b.v.x = vx;
    b.v.y = vy;
    b.v.z = vz;
    b.w.x = sol.wx;
    b.w.y = sol.wy;
    b.w.z = sol.wz;
    if (b.p.y < R) b.p.y = R;
    b.fixed = false;
    p.touchCD = 0.3;
    p.stamina -= 0.01;
    p.knockOn = 0;
    this.onKick(p, spec, Math.hypot(vx, vy, vz));
  }

  // Goleiro / lateral soltando a bola das mãos.
  release(p, spec) {
    const b = this.ball;
    b.held = null;
    p.holding = false;
    const hx = p.x + Math.cos(p.face) * 0.4;
    const hz = p.z + Math.sin(p.face) * 0.4;
    if (spec.kind === 'throw' && !p.isGK) b.place(hx, hz, 2.05);
    else if (spec.kind === 'pass' || spec.kind === 'through' || spec.kind === 'throw') {
      // goleiro rola a bola com a mão
      b.place(hx, hz, R);
      if (spec.kind === 'throw') {
        spec = { ...spec, kind: 'pass', arrive: spec.arrive || 5 };
      }
    } else {
      // tiro de meta com a mão: chutão
      b.place(hx, hz, 0.75);
      if (spec.kind === 'lob') spec = { ...spec, kind: 'punt', pitch: spec.pitch || 0.55 };
    }
    this.execKick(p, spec);
    p.setState(ST.RUN);
  }

  gauss() {
    const u = Math.max(1e-9, this.r());
    const v = this.r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185 * v);
  }

  onKick(p, spec, speed) {
    const team = p.team;
    const fromSetpiece = this.state === 'setpiece' || this.state === 'kickoff';
    const spType = fromSetpiece && this.sp ? this.sp.type : null;
    if (fromSetpiece) {
      this.state = 'play';
      this.stateT = 0;
      if (this.sp && this.sp.wall) this.sp.wall.forEach((w) => (w.wallJumpAt = this.time + 0.12 + this.r() * 0.1));
      this.sp = null;
    }
    this.possessor = null;
    this.ball.glue = null;
    this.possTeam = team;
    this.lastTouch = { p, kind: 'kick', t: this.time, spType };
    this.lastKick = { p, spec, t: this.time, x: this.ball.p.x, z: this.ball.p.z };
    this.emit('kick', { player: p, power: clamp(speed / 30, 0, 1), kind: spec.kind });
    // impedimento: posição no momento do passe (não vale em lateral, escanteio e tiro de meta)
    if (spType !== 'throw' && spType !== 'corner' && spType !== 'goalkick') this.markOffside(p);
    else this.offside = null;
    if (spec.isShot) {
      team.stats.shots++;
      p.stats.shots++;
      const gx = team.oppGoalX;
      const xg = xgAt(this.ball.p.x, this.ball.p.z, gx) * (spType === 'penalty' ? 2.4 : 1);
      team.stats.xg += Math.min(0.8, xg);
      this.lastShot = { p, t: this.time, xg, onTarget: this.shotOnTarget(), counted: false };
      if (this.lastShot.onTarget) {
        team.stats.onTarget++;
        this.lastShot.counted = true;
      }
      this.passInfo = null;
      this.emit('shot', { player: p, onTarget: this.lastShot.onTarget });
    } else {
      this.passInfo = { from: p, to: spec.receiver || null, team, t: this.time, kind: spec.kind, tx: spec.tx, tz: spec.tz };
      if (spec.kind === 'pass' || spec.kind === 'through' || spec.kind === 'lob' || spec.kind === 'throw') {
        team.stats.passes++;
        p.stats.passes++;
      }
      if (spec.receiver) {
        spec.receiver.reactT = 0;
        spec.receiver.lastFrom = p;
        if (team.user && spec.user && this.state === 'play') {
          this.setCtrl(team, spec.receiver);
          team.recvLock = { p: spec.receiver, until: this.time + 2.5 };
        }
      }
    }
  }

  // A trajetória prevista entra no gol?
  shotOnTarget() {
    const tmp = [];
    predictBall(this.ball, this.env, 50, 0.04, tmp);
    for (let i = 1; i < tmp.length; i++) {
      const s = tmp[i];
      if (Math.abs(s.x) >= P.HL) {
        return Math.abs(s.z) < P.goalW / 2 + 0.05 && s.y < P.goalH + 0.05;
      }
    }
    return false;
  }

  markOffside(passer) {
    const team = passer.team;
    const opp = team.opp;
    const lineX = this.secondLastX(opp);
    const lu = team.u(lineX);
    const bu = team.u(this.ball.p.x);
    const cands = new Set();
    for (const m of team.active) {
      if (m === passer) continue;
      const u = team.u(m.x);
      if (u > 0.5 && u > bu + 0.0005 && u > lu + 0.25 / P.L) cands.add(m);
    }
    this.offside = cands.size ? { team, cands, x: this.ball.p.x } : null;
  }

  // ------------------------------------------------------------ desarmes

  standTackle(p) {
    if (p.busy() || p.state === ST.KICK) return;
    p.setState(ST.TACKLE, 0.42);
    p.tackleDone = false;
    const b = this.ball.p;
    p.faceTarget = null;
    p.face = Math.atan2(b.z - p.z, b.x - p.x);
    // estocada
    p.vx += Math.cos(p.face) * 1.6;
    p.vz += Math.sin(p.face) * 1.6;
  }

  slideTackle(p) {
    if (p.busy() || p.state === ST.KICK) return;
    const sp = Math.max(p.speed, 4.5) + 1.8;
    p.setState(ST.SLIDE, 0.75);
    p.slideHit = false;
    p.slideFoul = false;
    p.vx = Math.cos(p.face) * sp;
    p.vz = Math.sin(p.face) * sp;
    p.aux1 = this.r() < 0.5 ? 1 : -1;
  }

  resolveTackles() {
    const b = this.ball;
    for (const p of this.all) {
      if (p.state === ST.TACKLE && !p.tackleDone && p.stateT > 0.12) {
        p.tackleDone = true;
        const fx = p.x + Math.cos(p.face) * 0.75;
        const fz = p.z + Math.sin(p.face) * 0.75;
        const db = Math.hypot(b.p.x - fx, b.p.z - fz);
        const carrier = this.possessor && this.possessor.team !== p.team ? this.possessor : null;
        if (db < 0.8 && b.p.y < 0.6) {
          let chance = 0.4 + p.a.tac * 0.55 - (carrier ? carrier.a.dri * 0.35 + carrier.a.str * 0.1 : 0);
          if (carrier) {
            const cd = Math.hypot(b.p.x - carrier.x, b.p.z - carrier.z);
            chance += clamp((cd - 0.4) * 0.6, -0.15, 0.3);
          }
          chance *= this.skill[p.team.side].tackle;
          if (carrier && carrier.feint) chance *= FEINTS[carrier.feint.type].tackle;
          if (this.r() < chance) {
            // ganhou: cutuca a bola
            const a = p.face + (this.r() - 0.5) * 1.2;
            const v = 3 + this.r() * 4;
            b.v.x = Math.cos(a) * v + p.vx * 0.3;
            b.v.z = Math.sin(a) * v + p.vz * 0.3;
            b.v.y = this.r() * 1.5;
            this.touchBy(p, 'tackle');
            p.stats.tackles++;
            p.team.stats.tackles++;
            this.emit('tackle', { player: p, won: true });
            if (carrier && this.r() < 0.25) carrier.setState(ST.STUMBLE, 0.4);
            continue;
          }
        }
        // errou: se acertou o adversário, falta
        if (carrier) {
          const dc = Math.hypot(carrier.x - fx, carrier.z - fz);
          if (dc < 0.85) {
            const behind = Math.cos(carrier.face) * Math.cos(p.face) + Math.sin(carrier.face) * Math.sin(p.face);
            const foulP = 0.22 + (behind > 0.4 ? 0.35 : 0);
            if (this.r() < foulP) this.foul(p, carrier, 0.2 + (behind > 0.4 ? 0.35 : 0) + p.speed * 0.03, 'desarme');
          }
        }
        p.setState(ST.STUMBLE, 0.3);
      }
      if (p.state === ST.SLIDE && p.stateT < 0.55 && !p.slideHit) {
        const fx = p.x + Math.cos(p.face) * 0.95;
        const fz = p.z + Math.sin(p.face) * 0.95;
        const db = Math.hypot(b.p.x - fx, b.p.z - fz);
        if (db < 0.75 && b.p.y < 0.5 && !b.held) {
          p.slideHit = true;
          const a = p.face + (this.r() - 0.5) * 0.8;
          const v = 4 + p.speed * 0.6 + this.r() * 3;
          b.v.x = Math.cos(a) * v;
          b.v.z = Math.sin(a) * v;
          b.v.y = this.r() * 2;
          this.touchBy(p, 'tackle');
          p.stats.tackles++;
          p.team.stats.tackles++;
          this.emit('tackle', { player: p, won: true, slide: true });
        }
        // atingiu um adversário
        for (const o of p.team.opp.active) {
          if (o.state === ST.FALLEN || o.busy()) continue;
          const d = Math.hypot(o.x - fx, o.z - fz);
          if (d < 0.7) {
            o.setState(ST.FALLEN, 1 + this.r() * 0.8);
            o.vx *= 0.3;
            o.vz *= 0.3;
            if (!p.slideHit) {
              const behind = Math.cos(o.face) * Math.cos(p.face) + Math.sin(o.face) * Math.sin(p.face);
              const sev = 0.45 + (behind > 0.3 ? 0.4 : 0) + p.speed * 0.03;
              this.foul(p, o, sev, 'carrinho');
            }
            p.slideHit = true;
            break;
          }
        }
      }
    }
  }

  // ------------------------------------------------------------ contato com a bola

  touchBy(p, kind) {
    const prev = this.lastTouch;
    this.ball.glue = null;
    // impedimento: participou da jogada estando em posição irregular
    if (this.offside && this.state === 'play') {
      if (p.team === this.offside.team && this.offside.cands.has(p) && kind !== 'deflect') {
        this.callOffside(p);
        return;
      }
      if (p.team !== this.offside.team && kind !== 'deflect' && kind !== 'save') this.offside = null;
      else if (p.team === this.offside.team && !this.offside.cands.has(p)) this.offside = null;
    }
    if (this.passInfo && p.team === this.passInfo.team && p !== this.passInfo.from && kind !== 'deflect') {
      this.passInfo.from.team.stats.passesOk++;
      this.passInfo.from.stats.passesOk++;
      this.assistCand = { p: this.passInfo.from, t: this.time };
    }
    if (this.passInfo && p.team !== this.passInfo.team) this.assistCand = null;
    if (p !== (prev && prev.p) && kind !== 'deflect') this.assistCand = this.assistCand && this.assistCand.p.team === p.team ? this.assistCand : null;
    this.passInfo = null;
    this.lastTouch = { p, kind, t: this.time };
    if (kind === 'dribble' || kind === 'control') {
      this.possessor = p;
      this.possTeam = p.team;
    } else {
      this.possessor = null;
      this.possTeam = kind === 'deflect' ? this.possTeam : p.team;
    }
  }

  contacts(dt) {
    const b = this.ball;
    this.resolveTackles();
    if (b.held || b.fixed) return;
    // goleiros primeiro (defesas)
    for (const t of this.teams) {
      const gk = t.gk();
      if (gk && keeperContact(this, gk, dt)) return;
    }
    const bx = b.p.x;
    const bz = b.p.z;
    const by = b.p.y;
    // cabeceios e bolas na altura do peito
    if (by > 0.75) {
      this.aerialContacts();
      this.bodyDeflections();
      return;
    }
    // candidatos ao toque com o pé
    let cands = null;
    for (const p of this.all) {
      if (p.busy() || p.state === ST.KICK || p.touchCD > 0 || b.held) continue;
      if (p.pending && p.pending.started) continue;
      const d = Math.hypot(bx - p.x, bz - p.z);
      const reach = 0.58 + p.a.con * 0.1 + (p.isGK ? 0.15 : 0);
      if (d < reach) {
        (cands || (cands = [])).push({ p, d });
      }
    }
    if (!cands) {
      this.bodyDeflections();
      return;
    }
    cands.sort((a, c) => a.d - c.d);
    const own = this.possessor;
    for (const { p, d } of cands) {
      if (p.pending) continue; // vai chutar
      if (p === own) {
        if (b.glue === p) continue;
        if (this.dribbleTouch(p, d)) return;
        continue;
      }
      // bola dominada pelo adversário (colada no pé): só com desarme
      if (own && own.team !== p.team) {
        const od = Math.hypot(bx - own.x, bz - own.z);
        if (od < 0.5 || b.glue === own) continue;
      }
      // companheiro: só domina se for o destinatário, se a bola estiver solta, ou se for o controlado
      if (p.team === this.possTeam && own && own !== p) continue;
      // deixa a bola passar para o companheiro a quem o passe se destina
      if (p.team === this.possTeam && this.passInfo && this.passInfo.to && this.passInfo.to !== p && !p.userCtl && this.time - this.passInfo.t < 3) continue;
      if (p.team === this.possTeam && this.passInfo && this.passInfo.from === p && this.time - this.passInfo.t < 0.5) continue;
      if (this.receiveTouch(p)) return;
    }
  }

  // Condução: pequenos toques que mandam a bola à frente do jogador.
  dribbleTouch(p, d) {
    const b = this.ball;
    let dvx = p.intVx != null ? p.intVx : p.desVx;
    let dvz = p.intVz != null ? p.intVz : p.desVz;
    let ds = Math.hypot(dvx, dvz);
    const bx = b.p.x - p.x;
    const bz = b.p.z - p.z;
    const bv = Math.hypot(b.v.x, b.v.z);
    if (ds < 0.6) {
      // parado: segura a bola no pé
      if (bv > 1.2 || d > 0.42) {
        const fx = p.x + Math.cos(p.face) * 0.35;
        const fz = p.z + Math.sin(p.face) * 0.35;
        b.v.x = (fx - b.p.x) * 2 + p.vx;
        b.v.z = (fz - b.p.z) * 2 + p.vz;
        b.v.y = 0;
        this.rollSpin();
        p.touchCD = 0.18;
        this.touchBy(p, 'dribble');
        return true;
      }
      return false;
    }
    const ux = dvx / ds;
    const uz = dvz / ds;
    const along = bx * ux + bz * uz;
    const lat = -bx * uz + bz * ux;
    const ballAlong = b.v.x * ux + b.v.z * uz;
    const sp = p.speed;
    const knock = p.knockOn && this.time - p.knockOn < 0.4;
    const control = p.a.dri * 0.7 + p.a.con * 0.3;
    // distância em que a bola fica à frente do pé (um pouco maior correndo)
    const lead = 0.42 + sp * 0.035 + (p.sprint ? 0.12 : 0) + (1 - control) * 0.15;
    // toca quando a bola ficou para trás, saiu da linha ou perdeu velocidade
    const need = knock || along < lead * 0.75 || Math.abs(lat) > 0.3 || ballAlong < sp * 0.9;
    if (!need) return false;
    // virada brusca: amortece a bola junto ao pé enquanto o corpo muda de direção
    if (sp > 2.2 && !knock) {
      const cosV = (p.vx * ux + p.vz * uz) / sp;
      if (cosV < 0.6) {
        const k = 0.3 + (1 - control) * 0.25;
        b.v.x = p.vx * k + ux * (0.5 + sp * 0.06);
        b.v.z = p.vz * k + uz * (0.5 + sp * 0.06);
        b.v.y = 0;
        this.rollSpin();
        p.touchCD = 0.1;
        this.touchBy(p, 'dribble');
        this.emit('touch', { player: p, turn: true });
        return true;
      }
    }
    const pres = this.pressureOn(p);
    if (knock) {
      // arrancada (botão Arrancar/Espaço): toque longo de propósito
      p.knockOn = 0;
      const v = sp + 4 + p.a.pac * 2.5;
      const err = (0.02 + 0.06 * (1 - control)) * (1 + pres * 0.5);
      const a = Math.atan2(uz, ux) + this.gauss() * err;
      b.v.x = Math.cos(a) * v;
      b.v.z = Math.sin(a) * v;
      b.v.y = 0;
      this.rollSpin();
      p.touchCD = 0.25;
      this.touchBy(p, 'dribble');
      this.emit('touch', { player: p });
      return true;
    }
    // condução controlada: escolhe a velocidade da bola para ela voltar a
    // ficar a "lead" metros do pé daqui a T segundos, já descontando a
    // desaceleração do gramado; o desvio lateral também é corrigido.
    const T = 0.32;
    const vEnd = Math.max(sp, Math.min(ds, sp + 1.5));
    const decel = this.env.rollMu * 9.81 + this.env.rollLin * vEnd + 0.025 * vEnd * vEnd;
    const vAlong = vEnd + (lead - along) / T + decel * T * 0.5;
    const vLat = -lat / T;
    const err = (0.006 + 0.035 * (1 - control)) * (0.6 + sp / 12) * (1 + pres * 0.5) * (1 + this.env.snow * 0.5 + this.env.ballWet * 0.3);
    const a = Math.atan2(uz, ux) + Math.atan2(vLat, Math.max(0.5, vAlong)) + this.gauss() * err;
    const v = Math.hypot(Math.max(0, vAlong), vLat) * (1 + this.gauss() * err * 0.3);
    b.v.x = Math.cos(a) * v;
    b.v.z = Math.sin(a) * v;
    b.v.y = 0;
    this.rollSpin();
    p.touchCD = 0.12;
    this.touchBy(p, 'dribble');
    this.emit('touch', { player: p });
    return true;
  }

  rollSpin() {
    const b = this.ball;
    b.w.x = b.v.z / R;
    b.w.z = -b.v.x / R;
    b.w.y = 0;
  }

  // Domínio / interceptação de uma bola que chega.
  receiveTouch(p) {
    const b = this.ball;
    const rvx = b.v.x - p.vx;
    const rvz = b.v.z - p.vz;
    const rel = Math.hypot(rvx, rvz, b.v.y);
    const intended = this.passInfo && this.passInfo.to === p;
    const opp = this.possTeam && this.possTeam !== p.team;
    const con = p.a.con * 0.8 + p.a.dri * 0.2;
    // bola rápida (ou alta, molhada, na neve) pode espirrar no domínio
    let fail = clamp((rel - 4) * (0.032 - con * 0.022), 0, 0.85);
    if (opp && !intended) fail += 0.08;
    if (intended) fail *= 0.5;
    if (b.p.y > 0.4) fail += 0.12;
    fail += this.env.ballWet * 0.02 + this.env.snow * 0.03;
    if (this.r() < fail) {
      // toque espirrado: perde a bola para longe
      const k = 0.35 + this.r() * 0.35;
      const a = Math.atan2(b.v.z, b.v.x) + (this.r() - 0.5) * 2.4;
      const v = Math.hypot(b.v.x, b.v.z) * k + 1;
      b.v.x = Math.cos(a) * v;
      b.v.z = Math.sin(a) * v;
      b.v.y = Math.abs(b.v.y) * 0.3 + this.r() * 1.5;
      p.touchCD = 0.35;
      this.touchBy(p, opp ? 'deflect' : 'control');
      if (!opp) {
        this.possessor = null;
      }
      this.emit('touch', { player: p, heavy: true });
      return true;
    }
    // domínio limpo: a bola fica à frente, no sentido em que o jogador vai
    // (para o jogador controlado, no sentido do direcional)
    let ux = p.desVx;
    let uz = p.desVz;
    if (p.userCtl && p.stickX != null) {
      const vs = Math.max(2.5, Math.hypot(ux, uz));
      ux = p.stickX * vs;
      uz = p.stickZ * vs;
    }
    let us = Math.hypot(ux, uz);
    if (us < 0.5) {
      ux = Math.cos(p.face);
      uz = Math.sin(p.face);
      us = 1;
    } else {
      ux /= us;
      uz /= us;
    }
    const heavy = rel * (0.18 - con * 0.14);
    const err = (1 - con) * 0.5;
    const a = Math.atan2(uz, ux) + this.gauss() * err;
    // amortece: a bola sai pouco à frente do ritmo atual do jogador
    const moving = us > 0.5 && !(p.desVx === 0 && p.desVz === 0);
    const v = (moving ? p.speed + Math.min(us - p.speed, 2) * 0.4 + 0.9 : 0.4) + heavy * (0.6 + this.r()) + this.env.snow * 0.6;
    b.v.x = Math.cos(a) * v;
    b.v.z = Math.sin(a) * v;
    b.v.y = 0;
    if (b.p.y > R + 0.05) b.p.y = Math.max(R, b.p.y * 0.5);
    this.rollSpin();
    p.touchCD = 0.16;
    this.touchBy(p, 'control');
    this.emit('touch', { player: p });
    return true;
  }

  aerialContacts() {
    const b = this.ball;
    const by = b.p.y;
    let best = null;
    let bs = -1e9;
    const contenders = [];
    for (const p of this.all) {
      if (p.busy() || p.touchCD > 0 || p.isGK && this.canHandle(p)) continue;
      const d = Math.hypot(b.p.x - p.x, b.p.z - p.z);
      if (d > 0.75) continue;
      const head = p.height - 0.1 + p.y;
      const chestLo = 0.85 + p.y;
      if (by > head + 0.32 || by < chestLo) continue;
      const isHead = by > p.height - 0.45 + p.y;
      const s = p.a.hea * 1.2 + p.a.str * 0.5 + p.y * 2 + (p.height - 1.8) * 2 - d + this.r() * 0.6;
      contenders.push(p);
      if (s > bs) {
        bs = s;
        best = { p, isHead };
      }
    }
    if (!best) {
      this.bodyDeflections();
      return;
    }
    const p = best.p;
    // duelo aéreo: o perdedor não alcança
    for (const o of contenders) if (o !== p) o.touchCD = 0.3;
    if (!best.isHead) {
      // domínio no peito / coxa
      if (b.speed < 17 && (p.team === this.possTeam || !this.possTeam || this.r() < 0.6)) {
        let ux = p.desVx;
        let uz = p.desVz;
        let us = Math.hypot(ux, uz);
        if (us < 0.5) {
          ux = Math.cos(p.face);
          uz = Math.sin(p.face);
          us = 1;
        } else {
          ux /= us;
          uz /= us;
        }
        const k = 0.25 + (1 - p.a.con) * 0.4;
        b.v.x = ux * (us * 0.8 + 0.5) + b.v.x * k * 0.2;
        b.v.z = uz * (us * 0.8 + 0.5) + b.v.z * k * 0.2;
        b.v.y = 0.8 + this.r() * 0.6;
        b.w.x = b.w.y = b.w.z = 0;
        p.touchCD = 0.25;
        this.touchBy(p, 'control');
        this.emit('touch', { player: p, chest: true });
      } else this.deflectOff(p, 0.4);
      return;
    }
    this.header(p);
  }

  header(p) {
    const b = this.ball;
    const team = p.team;
    const gx = team.oppGoalX;
    const intent = p.headerIntent && this.time - p.headerIntent.t < 1.2 ? p.headerIntent : null;
    let tx;
    let tz;
    let ty = 0.6;
    let speed = 7 + p.a.hea * 6 + b.speed * 0.35;
    let kind = 'header';
    const dGoal = Math.hypot(gx - b.p.x, b.p.z);
    const attackBox = inBox(b.p.x, b.p.z, gx);
    const defendBox = inBox(b.p.x, b.p.z, team.ownGoalX) || Math.abs(team.ownGoalX - b.p.x) < 25;
    if (intent && intent.kind !== 'shoot') {
      // cabeceio de passe na direção pedida
      const m = this.findPassTarget(p, intent.dirx, intent.dirz, 'lob');
      tx = m ? m.x : p.x + intent.dirx * 12;
      tz = m ? m.z : p.z + intent.dirz * 12;
      ty = 1;
      speed = Math.min(speed, 6 + Math.hypot(tx - b.p.x, tz - b.p.z) * 0.5);
    } else if ((intent && intent.kind === 'shoot') || (attackBox && dGoal < 16 && !intent)) {
      // cabeceio para o gol: para baixo, no canto
      const zs = intent ? clamp(intent.dirz * 3, -3.2, 3.2) : -Math.sign(b.p.z || 1) * (1.5 + this.r() * 1.8);
      tx = gx;
      tz = zs;
      ty = 0.3 + this.r() * 1.2;
      kind = 'header';
      speed = Math.min(speed + 3, 22);
    } else if (defendBox && p.team !== this.possTeam) {
      // afasta para cima e para fora
      tx = b.p.x + team.dir * 25;
      tz = b.p.z + Math.sign(b.p.z || 1) * 12;
      ty = 6;
      speed = 10 + p.a.hea * 7;
    } else {
      // escora para o companheiro mais à frente
      const m = this.findPassTarget(p, team.dir, -p.z * 0.02, 'lob');
      tx = m ? m.x : b.p.x + team.dir * 15;
      tz = m ? m.z : b.p.z;
      ty = 1.2;
    }
    const dx = tx - b.p.x;
    const dz = tz - b.p.z;
    const dh = Math.hypot(dx, dz) || 1;
    const vy = ((ty - b.p.y) / dh) * speed + (4.9 * dh) / speed * 0.6;
    const sol = { vx: (dx / dh) * speed, vy: clamp(vy, -6, 12), vz: (dz / dh) * speed, wx: 0, wy: 0, wz: 0 };
    const isShot = kind === 'header' && Math.abs(tx - gx) < 0.5;
    const spec = { kind: 'header', tx, tz, ty, sol, isShot, power: 0.6 };
    p.setState(ST.HEADER, 0.4);
    p.headerIntent = null;
    this.execKick(p, spec);
    this.emit('header', { player: p });
  }

  // Bola batendo no corpo de quem não tentou jogar (bloqueio, desvio, mão).
  bodyDeflections() {
    const b = this.ball;
    const bs = b.speed;
    if (bs < 3) return;
    for (const p of this.all) {
      if (p.state === ST.OFF || p.touchCD > 0) continue;
      if (this.lastTouch && this.lastTouch.p === p && this.time - this.lastTouch.t < 0.3) continue;
      if (p === this.possessor) continue;
      if (p.isGK && this.canHandle(p)) continue;
      const lying = p.state === ST.FALLEN || p.state === ST.SLIDE;
      const top = lying ? 0.45 : p.height + p.y;
      if (b.p.y > top + R || b.p.y < (lying ? 0 : 0.3 + p.y)) continue;
      const d = Math.hypot(b.p.x - p.x, b.p.z - p.z);
      const rad = lying ? 0.55 : 0.27;
      if (d < rad + R) {
        // mão na bola?
        const armZone = !lying && b.p.y > 0.95 + p.y && b.p.y < 1.55 + p.y;
        if (armZone && this.state === 'play' && p.team !== this.possTeam && this.r() < 0.1 && bs > 6) {
          this.handball(p);
          return;
        }
        this.deflectOff(p, 0.32, d);
        return;
      }
    }
  }

  deflectOff(p, e, d) {
    const b = this.ball;
    let nx = b.p.x - p.x;
    let nz = b.p.z - p.z;
    let l = Math.hypot(nx, nz);
    if (l < 1e-4) {
      nx = -b.v.x;
      nz = -b.v.z;
      l = Math.hypot(nx, nz) || 1;
    }
    nx /= l;
    nz /= l;
    const vn = b.v.x * nx + b.v.z * nz;
    if (vn < 0) {
      b.v.x -= (1 + e) * vn * nx;
      b.v.z -= (1 + e) * vn * nz;
    }
    b.v.x = b.v.x * 0.55 + p.vx * 0.3 + (this.r() - 0.5) * 2;
    b.v.z = b.v.z * 0.55 + p.vz * 0.3 + (this.r() - 0.5) * 2;
    b.v.y *= 0.5;
    b.w.x *= 0.3;
    b.w.y *= 0.3;
    b.w.z *= 0.3;
    p.touchCD = 0.25;
    const blockedShot = this.lastShot && this.time - this.lastShot.t < 1.5 && this.lastShot.p.team !== p.team;
    this.touchBy(p, 'deflect');
    if (blockedShot) this.emit('block', { player: p });
  }

  handball(p) {
    this.say(`Mão na bola de ${p.name}!`, 'foul', true);
    const victim = this.lastTouch ? this.lastTouch.p : null;
    this.foul(p, victim, 0.3, 'mão', true);
  }

  canHandle(gk) {
    if (!gk.isGK) return false;
    const g = gk.team.ownGoalX;
    return inBox(gk.x, gk.z, g) && inBox(this.ball.p.x, this.ball.p.z, g);
  }

  updateHeld() {
    const b = this.ball;
    const p = b.held;
    if (!p || !p.active) {
      b.held = null;
      return;
    }
    const hx = p.x + Math.cos(p.face) * 0.3;
    const hz = p.z + Math.sin(p.face) * 0.3;
    const hy = p.state === ST.THROW || (this.sp && this.sp.type === 'throw') ? 2.05 : 1.05 + p.y;
    b.p.x = hx;
    b.p.y = hy;
    b.p.z = hz;
    b.v.x = b.v.y = b.v.z = 0;
    b.w.x = b.w.y = b.w.z = 0;
  }

  // ------------------------------------------------------------ eventos da bola

  ballEvents() {
    const evs = this.ball.events;
    for (const e of evs) {
      if (e.type === 'trave') {
        this.emit('post', e);
        if (this.state === 'play') this.say(e.kind === 'travessao' ? 'No travessão!' : 'Na trave!', 'chance', true);
        this.excitement = 1;
      } else if (e.type === 'rede') this.emit('net', e);
      else if (e.type === 'quique') this.emit('bounce', e);
      else if (e.type === 'placa') this.emit('boards', e);
    }
    evs.length = 0;
  }

  // ------------------------------------------------------------ regras

  rules(dt) {
    const b = this.ball;
    const p = b.p;
    // gol?
    if (Math.abs(p.x) > P.HL + R) {
      const prevIn = Math.abs(b.prev.x) <= P.HL + R + 0.6;
      if (Math.abs(p.z) < P.goalW / 2 + R * 0.5 && p.y < P.goalH + R * 0.5 && prevIn) {
        const side = Math.sign(p.x);
        // gol no lado onde o time defende
        const defending = this.teams.find((t) => Math.sign(t.ownGoalX) === side);
        this.scoreGoal(defending.opp, defending);
        return;
      }
      // linha de fundo
      const side = Math.sign(p.x);
      const defending = this.teams.find((t) => Math.sign(t.ownGoalX) === side);
      const lt = this.lastTouch ? this.lastTouch.p.team : null;
      const zs = Math.sign(p.z || 1);
      if (lt === defending) {
        this.stoppage('corner', defending.opp, side * (P.HL - 0.3), zs * (P.HW - 0.3));
      } else {
        this.stoppage('goalkick', defending, side * (P.HL - P.sixD), zs * (P.sixW / 2 - 2));
      }
      if (this.lastShot && this.time - this.lastShot.t < 3 && this.lastShot.p.team !== defending) {
        if (Math.abs(p.z) < P.goalW / 2 + 3) this.emit('miss', { close: true });
      }
      return;
    }
    if (Math.abs(p.z) > P.HW + R) {
      const lt = this.lastTouch ? this.lastTouch.p.team : this.teams[0];
      this.stoppage('throw', lt.opp, clamp(p.x, -P.HL + 0.5, P.HL - 0.5), Math.sign(p.z) * P.HW);
    }
  }

  updatePossession(dt) {
    const pp = this.possessor;
    const b = this.ball;
    if (pp) {
      const d = Math.hypot(b.p.x - pp.x, b.p.z - pp.z);
      const lim = pp.sprint ? 4 : 3;
      if (d > lim || pp.busy() || !pp.active) {
        this.possessor = null;
      }
    }
    if (this.passInfo && this.time - this.passInfo.t > 4.5) this.passInfo = null;
    const t = this.possTeam;
    if (t) t.stats.poss += dt;
  }

  // ------------------------------------------------------------ faltas e cartões

  foul(off, victim, severity, kind, isHandball = false) {
    if (this.state !== 'play') return;
    const team = off.team;
    const x = isHandball ? this.ball.p.x : victim ? victim.x : off.x;
    const z = isHandball ? this.ball.p.z : victim ? victim.z : off.z;
    team.stats.fouls++;
    off.stats.fouls++;
    const g = team.ownGoalX;
    const penalty = inBox(x, z, g);
    // impede chance clara de gol? (último homem, perto do gol, rumo ao gol)
    let dogso = false;
    if (victim && Math.abs(g - x) < 32 && victim.team === this.possTeam) {
      const between = team.active.filter((q) => q !== off && !q.isGK && Math.abs(g - q.x) < Math.abs(g - x) - 0.5 && Math.abs(q.z - z) < 14).length;
      dogso = between === 0 && Math.abs(z) < 20;
    }
    // vantagem
    const victimTeam = team.opp;
    if (!penalty && !isHandball && victimTeam.u(x) > 0.45 && this.possessor && this.possessor.team === victimTeam && severity < 0.7) {
      this.advantage = { team: victimTeam, t: this.time, x, z, off, sev: severity };
      this.say(`Falta de ${off.name} — vantagem!`, 'foul');
      this.emit('whistle', { kind: 'adv' });
      this.cardFor(off, severity, false);
      return;
    }
    this.emit('foul', { off, victim, penalty });
    this.cardFor(off, severity, dogso && !penalty);
    if (penalty) {
      this.say(`Pênalti! Falta de ${off.name}.`, 'foul', true);
      this.stoppage('penalty', victimTeam, g - Math.sign(g) * P.penSpot, 0, { silent: true });
    } else {
      this.say(`Falta de ${off.name}${victim ? ' em ' + victim.name : ''}.`, 'foul');
      this.stoppage('freekick', victimTeam, clamp(x, -P.HL + 0.5, P.HL - 0.5), clamp(z, -P.HW + 0.5, P.HW - 0.5), { silent: true });
    }
  }

  cardFor(off, severity, dogso) {
    let card = null;
    const roll = this.r();
    if (dogso && roll < 0.7) card = 'red';
    else if (severity > 1.0 && roll < 0.12) card = 'red';
    else if (severity > 0.55 && roll < (severity - 0.5) * 0.9) card = 'yellow';
    else if (roll < 0.03) card = 'yellow';
    if (!card) return;
    if (card === 'yellow') {
      off.cards++;
      off.team.stats.yellows++;
      this.cards.push({ p: off, min: this.minute(), kind: 'yellow' });
      if (off.cards >= 2) {
        this.say(`Segundo amarelo para ${off.name}: expulso!`, 'card', true);
        this.sendOff(off);
      } else {
        this.say(`Cartão amarelo para ${off.name}.`, 'card', true);
        this.emit('card', { player: off, kind: 'yellow' });
      }
    } else {
      this.say(`Cartão vermelho! ${off.name} está expulso.`, 'card', true);
      this.cards.push({ p: off, min: this.minute(), kind: 'red' });
      this.sendOff(off);
    }
    this.stoppageSec += 25;
  }

  sendOff(p) {
    p.sentOff = true;
    p.team.stats.reds++;
    p.setState(ST.OFF);
    p.stats.rating -= 1.5;
    this.emit('card', { player: p, kind: 'red' });
    if (this.possessor === p) this.possessor = null;
    if (p.team.ctrl === p) p.team.ctrl = null;
    // goleiro expulso: um jogador de linha vai para o gol
    if (p.isGK) {
      const repl = p.team.active.filter((q) => !q.isGK).sort((a, b) => a.a.pac - b.a.pac)[0];
      if (repl) {
        repl.isGK = true;
        repl.role = 'GK';
        repl.slot = p.slot;
      }
    }
    this.rebuildAll();
  }

  updateAdvantage() {
    const a = this.advantage;
    if (!a) return;
    if (this.time - a.t > 3) {
      this.advantage = null;
      return;
    }
    // perdeu a bola logo: volta para a falta
    if (this.time - a.t < 2 && this.possTeam && this.possTeam !== a.team && this.possessor) {
      this.advantage = null;
      this.say('A vantagem não valeu: volta a falta.', 'foul');
      this.stoppage('freekick', a.team, a.x, a.z, { silent: true });
    }
  }

  callOffside(p) {
    const team = p.team;
    team.stats.offsides++;
    // bandeira do assistente do lado
    const i = this.teams.indexOf(team.opp);
    this.flag[i] = 2.5;
    this.say(`Impedimento de ${p.name}.`, 'offside', true);
    this.emit('offside', { player: p });
    this.offside = null;
    this.stoppage('freekick', team.opp, clamp(p.x, -P.HL + 1, P.HL - 1), clamp(p.z, -P.HW + 1, P.HW - 1), { silent: true, indirect: true });
  }

  // ------------------------------------------------------------ gols

  scoreGoal(team, conceding) {
    const lt = this.lastTouch;
    let scorer = lt ? lt.p : null;
    let own = false;
    if (scorer && scorer.team !== team) own = true;
    team.score++;
    const g = { team: team.side, min: this.minute(), minNum: this.minuteNum(), scorer: scorer ? scorer.data : null, own, pen: this.lastTouch && this.lastTouch.spType === 'penalty', assist: null };
    if (!own && this.assistCand && this.assistCand.p !== scorer && this.assistCand.p.team === team && this.time - this.assistCand.t < 12) {
      g.assist = this.assistCand.p.data;
      this.assistCand.p.stats.assists++;
      this.assistCand.p.stats.rating += 0.6;
    }
    if (scorer && !own) {
      scorer.stats.goals++;
      scorer.stats.rating += 1.1;
    }
    const gk = conceding.gk();
    if (gk) gk.stats.rating -= 0.35;
    if (this.lastShot && !this.lastShot.counted && this.lastShot.p.team === team) {
      team.stats.onTarget++;
      this.lastShot.counted = true;
    }
    this.goals.push(g);
    this.scorerEnt = own ? null : scorer;
    const name = scorer ? scorer.name : '';
    this.say(own ? `GOL! Gol contra de ${name}. ${team.club.short} marca.` : `GOOOL! ${name} marca para o ${team.club.short}!`, 'goal', true);
    this.emit('goal', { team, scorer, own, goal: g });
    this.excitement = 1;
    this.stoppageSec += 35;
    this.state = 'goal';
    this.stateT = 0;
    this.possessor = null;
    this.passInfo = null;
    this.offside = null;
    this.advantage = null;
    // comemoração
    for (const p of team.active) {
      p.celebType = scorer === p ? 1 + Math.floor(this.r() * 3) : 0;
    }
    this.goalTeam = team;
    this.concedeTeam = conceding;
    this.replayPending = true;
  }

  // ------------------------------------------------------------ paralisações e bolas paradas

  stoppage(type, team, x, z, o = {}) {
    this.state = 'dead';
    this.stateT = 0;
    this.possessor = null;
    this.passInfo = null;
    this.advantage = null;
    this.offside = null;
    this.pendingSp = { type, team, x, z, indirect: !!o.indirect };
    for (const p of this.all) p.pending = null;
    if (!o.silent) {
      const names = { throw: 'Lateral', corner: 'Escanteio', goalkick: 'Tiro de meta', freekick: 'Falta', penalty: 'Pênalti' };
      this.say(`${names[type]} para o ${team.club.short}.`, type);
    }
    if (type === 'corner') team.stats.corners++;
    this.emit('stoppage', { kind: type, team });
    if (type !== 'throw' && type !== 'goalkick' && type !== 'corner') this.emit('whistle', { kind: 'short' });
    // substituições da IA nas paralisações
    for (const t of this.teams) if (!t.user || this.opts.autoSubsUser) this.ai[t.side].considerSubs();
  }

  beginSetPiece() {
    const sp = this.pendingSp;
    this.pendingSp = null;
    this.sp = { ...sp, t: 0, ready: false };
    const b = this.ball;
    b.held = null;
    b.fixed = true;
    b.place(sp.x, sp.z);
    const taker = setupPositions(this, this.sp);
    this.sp.taker = taker;
    this.state = 'setpiece';
    this.stateT = 0;
    for (const p of this.all) {
      p.pending = null;
      p.run = null;
      p.holding = false;
      if (p.state !== ST.OFF) p.setState(ST.RUN);
    }
    if (sp.type === 'throw') {
      b.fixed = false;
      b.held = taker;
      taker.holding = true;
    }
    this.lastTouch = null;
    this.lastShot = null;
  }

  startKickoff(teamIdx, first = false) {
    const team = this.teams[teamIdx];
    this.pendingSp = { type: 'kickoff', team, x: 0, z: 0 };
    this.beginSetPiece();
    // na saída de bola os jogadores já começam posicionados
    for (const p of this.all) {
      if (p.spTarget) p.place(p.spTarget.x, p.spTarget.z, p.spTarget.face);
    }
    this.state = 'setpiece';
    if (first) this.emit('whistle', { kind: 'long' });
  }

  // Bola parada: todos vão para os lugares; o cobrador executa quando pronto.
  setPieceStep(dt) {
    const sp = this.sp;
    sp.t += dt;
    let maxD = 0;
    for (const p of this.all) {
      const t = p.spTarget;
      if (!t) continue;
      const dx = t.x - p.x;
      const dz = t.z - p.z;
      const d = Math.hypot(dx, dz);
      maxD = Math.max(maxD, d);
      if (p.userCtl && !p.userAuto && p !== sp.taker) continue;
      if (p === sp.taker && p.pending && !this.ball.held) {
        // corrida para a bola
        const bx = this.ball.p.x - p.x;
        const bz = this.ball.p.z - p.z;
        const bd = Math.hypot(bx, bz);
        const run = sp.type === 'penalty' || (sp.type === 'freekick' && sp.direct) ? 4.2 : 3;
        p.desVx = bd > 0.05 ? (bx / bd) * run : 0;
        p.desVz = bd > 0.05 ? (bz / bd) * run : 0;
        p.faceTarget = Math.atan2(p.pending.spec.tz - p.z, p.pending.spec.tx - p.x);
        p.pending.t = Math.min(p.pending.t, 0.3);
        continue;
      }
      const vmax = p.vmax(this.env);
      const sp2 = Math.min(vmax * (d > 12 ? 0.95 : 0.7), d * 1.6);
      p.desVx = d > 0.25 ? (dx / d) * sp2 : 0;
      p.desVz = d > 0.25 ? (dz / d) * sp2 : 0;
      p.faceTarget = d < 1.5 ? t.face : null;
      // quem ficou muito longe aparece no lugar (fora da tela)
      if (sp.t > 2.6 && d > 3 && Math.hypot(p.x - this.ball.p.x, p.z - this.ball.p.z) > 30) {
        p.place(t.x, t.z, t.face);
      }
    }
    // o árbitro garante a distância dos adversários (9,15 m; 2 m no lateral)
    const minD = sp.type === 'throw' ? 2 : sp.type === 'penalty' ? 9.15 : sp.type === 'goalkick' ? 0 : 9.15;
    if (minD > 0 && sp.type !== 'goalkick') {
      const bx = this.ball.p.x;
      const bz = this.ball.p.z;
      for (const p of sp.team.opp.active) {
        if (sp.wall && sp.wall.includes(p)) continue;
        const dx = p.x - bx;
        const dz = p.z - bz;
        const d = Math.hypot(dx, dz);
        if (d < minD - 0.3 && (p.userCtl || sp.t > 2.5)) {
          const k = d < 0.01 ? 1 : (minD - d) / d;
          const f = p.userCtl ? 1 : 0.08;
          p.x += (d < 0.01 ? minD : dx * k) * f;
          p.z += (d < 0.01 ? 0 : dz * k) * f;
          if (p.userCtl) {
            // não deixa o controlado empurrar de volta
            const vin = p.vx * dx + p.vz * dz;
            if (vin < 0) {
              p.vx = 0;
              p.vz = 0;
            }
          }
        }
      }
    }
    const tk = sp.taker;
    if (tk && Math.hypot(tk.spTarget.x - tk.x, tk.spTarget.z - tk.z) < 0.6 && (maxD < 2 || sp.t > 3.2)) {
      if (!sp.ready) {
        sp.ready = true;
        sp.readyT = this.time;
        if (sp.type !== 'throw' && sp.type !== 'goalkick' && sp.type !== 'corner') this.emit('whistle', { kind: 'short' });
      }
    }
    // bola parada do time do jogador é cobrada por ele (a IA só assume se ficar parado muito tempo)
    if (sp.ready && tk && !tk.pending && (!tk.team.user || this.time - sp.readyT > 9)) {
      this.ai[tk.team.side].takeSetPiece(tk, sp);
    }
  }

  // ------------------------------------------------------------ máquina de estados

  stateMachine(dt) {
    switch (this.state) {
      case 'dead':
        if (this.stateT > (this.pendingSp && this.pendingSp.type === 'throw' ? 0.9 : 1.4)) this.beginSetPiece();
        break;
      case 'setpiece':
        break;
      case 'goal':
        if (this.stateT > 4.2 && !this.holdForReplay) {
          this.replayPending = false;
          this.startKickoff(this.concedeTeam.side);
        }
        break;
      case 'play':
        this.checkPeriodEnd();
        if (this.period >= 5 && this.penalties) this.penaltyWatch(dt);
        break;
      case 'halftime':
        if (this.stateT > 3 && !this.holdForBreak) this.resumeAfterBreak();
        break;
    }
    // acréscimos anunciados no último minuto
    const end = PERIOD_END[this.period];
    if (this.period <= 4 && !this.addedShown && this.clock > end - 60) {
      const base = this.period <= 2 ? 1 + Math.floor(this.stoppageSec / 50) : Math.floor(this.stoppageSec / 70);
      const add = clamp(base + (this.r() < 0.4 ? 1 : 0), this.period <= 2 ? 1 : 0, 7);
      this.added[this.period] = add;
      this.addedShown = true;
      if (add > 0) {
        this.say(`Acréscimo de ${add} minuto${add > 1 ? 's' : ''}.`, 'info');
        this.emit('added', { min: add });
      }
    }
  }

  checkPeriodEnd() {
    if (this.period > 4) return;
    const end = PERIOD_END[this.period] + this.added[this.period] * 60;
    if (this.clock < end) return;
    // espera a bola sair da zona de perigo (com limite)
    const b = this.ball.p;
    const danger = Math.abs(b.x) > P.HL - 22 && this.clock < end + 40;
    if (danger) return;
    this.endPeriod();
  }

  endPeriod() {
    const p = this.period;
    this.emit('whistle', { kind: 'end' });
    const [h, a] = this.teams;
    const tied = h.score === a.score;
    if (p === 1 || p === 3) {
      this.state = 'halftime';
      this.stateT = 0;
      this.breakKind = p === 1 ? 'intervalo' : 'intervalo-prorrogacao';
      this.say(p === 1 ? 'Fim do primeiro tempo.' : 'Fim do primeiro tempo da prorrogação.', 'period', true);
      this.emit('half', { period: p });
      return;
    }
    if (p === 2 && tied && this.extraTimeAllowed) {
      this.state = 'halftime';
      this.stateT = 0;
      this.breakKind = 'prorrogacao';
      this.say('Empate no tempo normal: vamos para a prorrogação!', 'period', true);
      this.emit('half', { period: p, extra: true });
      return;
    }
    if ((p === 2 && tied && this.knockout && !this.extraTimeAllowed) || (p === 4 && tied)) {
      this.state = 'halftime';
      this.stateT = 0;
      this.breakKind = 'penaltis';
      this.say('Decisão por pênaltis!', 'period', true);
      this.emit('half', { period: p, pens: true });
      return;
    }
    this.finish();
  }

  resumeAfterBreak() {
    const k = this.breakKind;
    if (k === 'penaltis') {
      this.period = 5;
      this.startShootout();
      return;
    }
    this.period++;
    this.addedShown = false;
    this.stoppageSec = 0;
    this.clock = PERIOD_END[this.period - 1];
    // troca de lado
    for (const t of this.teams) t.dir = -t.dir;
    for (const p of this.all) {
      p.stamina = Math.min(1 - p.fatigue * 0.6, p.stamina + 0.25);
      if (k === 'prorrogacao') p.fatigue *= 0.97;
    }
    let kt;
    if (this.period === 2) kt = 1 - this.firstKickoff;
    else if (this.period === 3) kt = this.r() < 0.5 ? 0 : 1;
    else kt = 1 - this.etKickoff;
    if (this.period === 3) this.etKickoff = kt;
    this.startKickoff(kt, true);
  }

  finish() {
    this.state = 'over';
    const [h, a] = this.teams;
    let winner = null;
    if (h.score !== a.score) winner = h.score > a.score ? 0 : 1;
    else if (this.penalties) winner = this.penalties.score[0] > this.penalties.score[1] ? 0 : 1;
    this.result = {
      home: h.club.id,
      away: a.club.id,
      hg: h.score,
      ag: a.score,
      pens: this.penalties ? [...this.penalties.score] : null,
      winner,
      goals: this.goals.map((g) => ({ team: g.team, min: g.min, minNum: g.minNum, player: g.scorer ? g.scorer.id : null, name: g.scorer ? g.scorer.shirt : '', own: g.own, pen: g.pen, assist: g.assist ? g.assist.shirt : null })),
      cards: this.cards.map((c) => ({ team: c.p.team.side, player: c.p.data.id, name: c.p.name, kind: c.kind, min: c.min })),
      stats: [this.statSummary(h), this.statSummary(a)],
      weather: this.env.weather,
    };
    this.say(`Fim de jogo: ${h.club.short} ${h.score} × ${a.score} ${a.club.short}${this.penalties ? ` (pênaltis ${this.penalties.score[0]}–${this.penalties.score[1]})` : ''}.`, 'period', true);
    this.emit('end', { result: this.result });
  }

  statSummary(t) {
    const tot = this.teams[0].stats.poss + this.teams[1].stats.poss || 1;
    const s = t.stats;
    return { ...s, possPct: Math.round((s.poss / tot) * 100), passPct: s.passes ? Math.round((s.passesOk / s.passes) * 100) : 0 };
  }

  // ------------------------------------------------------------ pênaltis (disputa)

  startShootout() {
    const order = (t) =>
      t.active
        .filter((p) => !p.isGK)
        .sort((a, b) => b.a.sho + b.a.con * 0.5 - (a.a.sho + a.a.con * 0.5))
        .concat(t.active.filter((p) => p.isGK));
    this.penalties = { score: [0, 0], taken: [0, 0], kicks: [[], []], order: [order(this.teams[0]), order(this.teams[1])], turn: this.r() < 0.5 ? 0 : 1, phase: 'setup', t: 0 };
    this.penalties.first = this.penalties.turn;
    this.say('Disputa por pênaltis!', 'period', true);
    this.nextPenalty();
  }

  nextPenalty() {
    const ps = this.penalties;
    const ti = ps.turn;
    const team = this.teams[ti];
    const ord = ps.order[ti];
    const taker = ord[ps.taken[ti] % ord.length];
    // todos no meio-campo para a cobrança
    const gx = 1 * P.HL; // sempre no mesmo gol
    for (const t of this.teams) t.dir = 1;
    team.dir = 1;
    team.opp.dir = -1;
    this.pendingSp = { type: 'penalty', team, x: gx - P.penSpot, z: 0 };
    this.beginSetPiece();
    this.sp.taker = taker;
    this.sp.shootout = true;
    // reposiciona: cobrador na marca, demais no círculo central
    let i = 0;
    for (const p of this.all) {
      if (p === taker) p.spTarget = { x: gx - P.penSpot - 2.2, z: 0.4, face: 0 };
      else if (p === team.opp.gk()) p.spTarget = { x: gx - 0.3, z: 0, face: Math.PI };
      else {
        const a = (i / 20) * Math.PI * 2;
        p.spTarget = { x: Math.cos(a) * 7, z: Math.sin(a) * 7, face: 0 };
        i++;
      }
      p.place(p.spTarget.x, p.spTarget.z, p.spTarget.face);
    }
    ps.phase = 'kick';
    ps.t = 0;
    ps.kicked = false;
  }

  penaltyWatch(dt) {
    const ps = this.penalties;
    if (!ps || ps.phase !== 'kick') return;
    if (this.state === 'play') {
      ps.t += dt;
      const b = this.ball;
      const goal = b.p.x > P.HL + R && Math.abs(b.p.z) < P.goalW / 2 && b.p.y < P.goalH;
      const dead = ps.t > 3.2 || (b.speed < 0.5 && ps.t > 1) || b.held || (b.v.x < -1 && ps.t > 0.8) || Math.abs(b.p.z) > P.HW || b.p.x > P.HL + 3;
      if (goal || dead) {
        const ti = ps.turn;
        const scored = goal;
        ps.kicks[ti].push(scored);
        ps.taken[ti]++;
        if (scored) ps.score[ti]++;
        this.emit(scored ? 'pen-goal' : 'pen-miss', { team: ti });
        this.say(scored ? `Gol! ${this.teams[ti].club.short} converte.` : `Perdeu! ${this.teams[ti].club.short} desperdiça.`, scored ? 'goal' : 'chance', true);
        ps.phase = 'wait';
        ps.t = 0;
        this.ball.held = null;
        this.penWait = 1.8;
      }
    }
  }

  penaltyAdvance() {
    const ps = this.penalties;
    const [a, b] = ps.taken;
    const [sa, sb] = ps.score;
    // decidido?
    const remA = Math.max(0, 5 - a);
    const remB = Math.max(0, 5 - b);
    let done = false;
    if (a <= 5 && b <= 5) {
      if (sa + remA < sb || sb + remB < sa) done = true;
      if (a === 5 && b === 5 && sa !== sb) done = true;
    } else if (a === b && sa !== sb) done = true;
    if (done) {
      this.finish();
      return;
    }
    ps.turn = 1 - ps.turn;
    this.nextPenalty();
  }

  // ------------------------------------------------------------ empolgação (áudio/torcida)

  updateExcitement(dt) {
    const b = this.ball.p;
    let target = 0.15;
    if (this.state === 'play') {
      const d = Math.min(Math.abs(P.HL - b.x), Math.abs(-P.HL - b.x));
      target = 0.2 + smoothstep(40, 10, d) * 0.6;
    }
    if (this.state === 'goal') target = 1;
    this.excitement += (target - this.excitement) * Math.min(1, dt * 1.2);
    if (this.penWait != null) {
      this.penWait -= dt;
      if (this.penWait <= 0) {
        this.penWait = null;
        this.penaltyAdvance();
      }
    }
  }

  // ------------------------------------------------------------ gravação (replay)

  record(dt) {
    this.recAcc += dt;
    if (this.recAcc < 1 / REC_HZ) return;
    this.recAcc -= 1 / REC_HZ;
    const list = this.recList();
    const o = this.recHead * this.recStride;
    const arr = this.rec;
    let k = o;
    for (let i = 0; i < 25; i++) {
      const p = list[i];
      if (p) p.writePose(arr, k);
      else arr[k + 15] = 0;
      k += POSE_SIZE;
    }
    k = o + 27 * POSE_SIZE;
    const b = this.ball;
    arr[k] = b.p.x;
    arr[k + 1] = b.p.y;
    arr[k + 2] = b.p.z;
    arr[k + 3] = b.w.x;
    arr[k + 4] = b.w.y;
    arr[k + 5] = b.w.z;
    arr[k + 6] = this.time;
    this.recHead = (this.recHead + 1) % this.recN;
    this.recCount = Math.min(this.recN, this.recCount + 1);
  }

  // Ordem fixa das entidades: 11 + 11 jogadores, árbitro e 2 assistentes.
  recList() {
    const l = [];
    for (const t of this.teams) {
      for (let i = 0; i < 11; i++) l.push(t.players[i]);
    }
    l.push(this.referee, this.assist[0], this.assist[1]);
    return l;
  }
}


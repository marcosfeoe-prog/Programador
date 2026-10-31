// IA do time: forma do bloco (com e sem a bola), linha defensiva, marcação,
// pressão no portador, cobertura, infiltrações, apoio ao portador e as
// decisões de quem tem a bola (passe rasteiro, lançamento, enfiada,
// cruzamento, chute, drible, chutão), além de bolas paradas e substituições.
import { PITCH as P, BALL as B } from './constants.js';
import { ST } from './player.js';
import { FORMATIONS } from './team.js';
import { groundPassSpeed, groundTravelTime } from './ball.js';
import { xgAt, inBox, segDist } from './geom.js';
import { clamp, lerp, smoothstep } from '../util.js';

const R = B.r;

const STYLE = {
  posse: { pressU: 0.55, line: 0.02, direct: -0.08, risk: 0.85, width: 1.0, tempo: 0.9, longShot: 0.8 },
  pressao: { pressU: 0.2, line: 0.07, direct: 0, risk: 1, width: 0.95, tempo: 1.1, longShot: 1 },
  contra: { pressU: 0.62, line: -0.05, direct: 0.1, risk: 1.1, width: 0.9, tempo: 1.2, longShot: 1.1 },
  direto: { pressU: 0.5, line: 0, direct: 0.14, risk: 1.15, width: 1.05, tempo: 1.1, longShot: 1.2 },
  equilibrado: { pressU: 0.45, line: 0, direct: 0, risk: 1, width: 1, tempo: 1, longShot: 1 },
};

// Valor de uma posição para o time que ataca (ameaça esperada: avanço no
// campo + chance de gol a partir dali), na mesma escala do xG.
export function posValue(team, x, z) {
  const u = Math.max(0, team.u(x));
  return 0.08 * u * u + 0.75 * xgAt(x, z, team.oppGoalX);
}

export class TeamAI {
  constructor(m, team) {
    this.m = m;
    this.team = team;
    this.style = STYLE[team.style] || STYLE.equilibrado;
    this.markT = 0;
    this.lineU = 0.2;
  }

  get skill() {
    return this.m.skill[this.team.side];
  }

  // ------------------------------------------------------------ fora do jogo

  idle(dt) {
    const m = this.m;
    const team = this.team;
    for (const p of team.active) {
      if (p.state === ST.OFF) continue;
      p.faceTarget = null;
      if (m.state === 'goal') {
        if (team === m.goalTeam) this.celebrate(p);
        else {
          // cabisbaixos, voltando devagar
          const tx = team.wx(0.35);
          const dx = tx - p.x;
          const dz = p.z * 0.9 - p.z;
          const d = Math.hypot(dx, dz);
          p.desVx = d > 1 ? (dx / d) * 1.4 : 0;
          p.desVz = d > 1 ? (dz / d) * 1.4 : 0;
        }
        continue;
      }
      p.desVx *= 0.9;
      p.desVz *= 0.9;
      p.faceTarget = Math.atan2(m.ball.p.z - p.z, m.ball.p.x - p.x);
      if (m.state === 'halftime' || m.state === 'over') {
        const dx = 0 - p.x;
        const dz = P.HW + 3 - p.z;
        const d = Math.hypot(dx, dz);
        p.desVx = d > 2 ? (dx / d) * 1.3 : 0;
        p.desVz = d > 2 ? (dz / d) * 1.3 : 0;
        p.faceTarget = null;
      }
    }
  }

  celebrate(p) {
    const m = this.m;
    const sc = m.scorerEnt && m.scorerEnt.team === this.team ? m.scorerEnt : null;
    if (p === sc) {
      // corre para a bandeirinha / torcida
      const cx = Math.sign(this.team.oppGoalX) * (P.HL - 3);
      const cz = Math.sign(p.z || 1) * (P.HW - 1);
      const dx = cx - p.x;
      const dz = cz - p.z;
      const d = Math.hypot(dx, dz);
      const v = d > 2 ? Math.min(7.5, d) : 0;
      p.desVx = d > 2 ? (dx / d) * v : 0;
      p.desVz = d > 2 ? (dz / d) * v : 0;
      if (d <= 2.5 && p.state !== ST.CELEB) p.setState(ST.CELEB, 99);
      return;
    }
    if (sc && !p.isGK) {
      const dx = sc.x - p.x;
      const dz = sc.z - p.z;
      const d = Math.hypot(dx, dz);
      const v = d > 1.6 ? Math.min(7, d * 0.9) : 0;
      p.desVx = d > 1.6 ? (dx / d) * v : 0;
      p.desVz = d > 1.6 ? (dz / d) * v : 0;
      if (d < 3 && p.state !== ST.CELEB) {
        p.setState(ST.CELEB, 99);
        p.celebType = 4;
      }
    } else {
      p.desVx = p.desVz = 0;
    }
  }

  // ------------------------------------------------------------ jogo corrido

  update(dt) {
    const m = this.m;
    const team = this.team;
    const opp = team.opp;
    const b = m.ball;
    const poss = m.possessor;
    const ours = poss ? poss.team === team : m.passInfo ? m.passInfo.team === team : m.possTeam === team;
    this.attacking = ours;
    const ballU = team.u(b.p.x);
    this.ballU = ballU;
    this.ballV = team.v(b.p.z);

    // linha defensiva
    let line = clamp(ballU - 0.19 + this.style.line + team.mentality * 0.03, 0.07, 0.42);
    if (poss && poss.team === opp && m.pressureOn(poss) < 0.3) line -= 0.04; // portador livre: recua
    if (ballU < 0.22) line = clamp(ballU - 0.06, 0.04, 0.16);
    this.lineU = this.lineU + (line - this.lineU) * Math.min(1, dt * 1.6);

    // marcação (a cada 0,5 s)
    this.markT -= dt;
    if (this.markT <= 0) {
      this.markT = 0.5;
      this.assignMarks();
    }

    let chaser = null;
    let receiver = null;
    let presser = null;
    let cover = null;
    if (!poss) {
      if (m.passInfo && m.passInfo.team === team && m.passInfo.to && m.passInfo.to.active) receiver = m.passInfo.to;
      // quem chega primeiro vai na bola (o goleiro cuida da área dele)
      const c = this.bestField();
      if (c && c !== receiver) {
        const oppBest = opp.bestInt ? opp.bestInt.interceptT : 9;
        // em passe do adversário só vai se puder interceptar
        if (!(m.passInfo && m.passInfo.team === opp) || c.interceptT < oppBest + 0.25) chaser = c;
      }
    } else if (poss.team === opp) {
      const pressHere = ballU < 1 - this.style.pressU || team.callPress > m.time || m.skill[team.side].press > 1.05;
      const cands = team.active.filter((p) => !p.isGK).sort((a, c) => a.interceptT - c.interceptT);
      presser = cands[0];
      const dPress = presser ? Math.hypot(presser.x - poss.x, presser.z - poss.z) : 99;
      this.softPress = !pressHere;
      if (!pressHere && dPress > 16) presser = null;
      if (cands[1] && (this.team.style === 'pressao' || team.callPress > m.time || ballU < 0.3)) cover = cands[1];
    }
    this.presser = presser;

    for (const p of team.active) {
      if (p.isGK || p.state === ST.OFF) continue;
      if (p.userCtl && !p.userAuto) continue;
      p.faceTarget = null;
      p.sprint = false;
      if (p === poss) {
        this.onBall(p, dt);
        continue;
      }
      if (p.pending) {
        this.moveTo(p, b.p.x, b.p.z, 1, true);
        continue;
      }
      this.aerial(p);
      if (p === receiver) {
        const ip = p.interceptP || b.p;
        this.moveTo(p, ip.x, ip.z, 1, p.interceptT > 0.6);
        p.faceTarget = Math.atan2(b.p.z - p.z, b.p.x - p.x);
      } else if (p === chaser) {
        const ip = p.interceptP || b.p;
        this.moveTo(p, ip.x, ip.z, 1, true);
      } else if (p === presser) this.press(p, poss, dt, this.softPress);
      else if (p === cover) this.cover(p, poss);
      else if (ours) this.support(p, dt);
      else this.defend(p);
    }
  }

  bestField() {
    let best = null;
    for (const p of this.team.active) {
      if (p.isGK || p.state === ST.OFF) continue;
      if (!best || p.interceptT < best.interceptT) best = p;
    }
    return best;
  }

  // Leva o jogador até (x, z). urg: 0..1 da velocidade; sprint libera o máximo.
  moveTo(p, x, z, urg = 0.7, sprint = false) {
    const dx = x - p.x;
    const dz = z - p.z;
    const d = Math.hypot(dx, dz);
    const vmax = p.vmax(this.m.env);
    let sp = vmax * (sprint ? 1 : clamp(urg, 0.2, 0.82));
    // desacelera ao chegar
    sp = Math.min(sp, d * 1.8);
    if (d < 0.25) sp = 0;
    p.desVx = d > 0.01 ? (dx / d) * sp : 0;
    p.desVz = d > 0.01 ? (dz / d) * sp : 0;
    p.sprint = sprint && d > 3;
    if (d < 2.5) p.faceTarget = Math.atan2(this.m.ball.p.z - p.z, this.m.ball.p.x - p.x);
  }

  // Posição de referência na formação.
  shapeTarget(p, attacking) {
    const team = this.team;
    const sl = FORMATIONS[team.formation][p.slot] || { d: [0.35, 0], a: [0.5, 0] };
    const base = attacking ? sl.a : sl.d;
    const ment = team.mentality * 0.04;
    let u;
    let v;
    if (attacking) {
      u = base[0] + (this.ballU - 0.5) * 0.5 + ment;
      v = base[1] * this.style.width + this.ballV * 0.15;
    } else {
      u = base[0] + (this.ballU - 0.45) * 0.55 + ment;
      v = base[1] * 0.82 + this.ballV * 0.3;
    }
    const line = team.lineOf(p);
    if (line === 'def') u = clamp(u, 0.04, 0.62);
    else if (line === 'mid') u = clamp(u, 0.12, 0.8);
    else u = clamp(u, 0.2, 0.92);
    return { u, v: clamp(v, -0.95, 0.95) };
  }

  // ------------------------------------------------------------ sem a bola (ataque)

  support(p, dt) {
    const m = this.m;
    const team = this.team;
    const b = m.ball;
    const st = this.shapeTarget(p, true);
    let u = st.u;
    let v = st.v;
    const offU = m.offsideLineU(team);
    const poss = m.possessor;
    p.thinkT -= dt;
    // infiltração em profundidade
    if (p.run && p.run.until < m.time) p.run = null;
    if (!p.run && p.thinkT <= 0 && poss && poss !== p) {
      const fwd = p.role === 'ST' || p.role === 'LW' || p.role === 'RW' || p.role === 'AM' || ((p.role === 'LB' || p.role === 'RB') && this.style.width > 0.95 && this.ballU > 0.5);
      const pu = team.u(p.x);
      const free = m.pressureOn(poss) < 0.5;
      const facing = Math.cos(poss.face) * team.dir > 0.2;
      if (fwd && free && facing && pu > offU - 0.06 && pu < offU + 0.01 && m.r() < 0.35 * this.style.tempo) {
        const ru = clamp(offU + 0.14, 0, 0.95);
        const rv = clamp(team.v(p.z) * 0.75, -0.7, 0.7);
        p.run = { until: m.time + 2.4, x: team.wx(ru), z: team.wz(rv) };
      }
    }
    if (p.thinkT <= 0) p.thinkT = this.skill.think + m.r() * 0.3;
    if (p.run) {
      this.moveTo(p, p.run.x, p.run.z, 1, true);
      return;
    }
    // não fica impedido à toa
    const lineLimit = offU - 0.006;
    if (u > lineLimit && team.lineOf(p) !== 'def') u = lineLimit;
    // apoio curto: os dois mais próximos do portador oferecem linha de passe
    if (poss && poss !== p && !p.isGK) {
      const near = team.active.filter((q) => q !== poss && !q.isGK).sort((a, c) => Math.hypot(a.x - poss.x, a.z - poss.z) - Math.hypot(c.x - poss.x, c.z - poss.z));
      const idx = near.indexOf(p);
      if (idx >= 0 && idx < 2) {
        if (!p.supportSpot || m.time > p.supportSpot.t) p.supportSpot = this.findSupportSpot(p, poss, idx);
        const s = p.supportSpot;
        this.moveTo(p, s.x, s.z, 0.75);
        return;
      }
    }
    let x = team.wx(u);
    let z = team.wz(v);
    // afasta de companheiros muito próximos
    for (const q of team.active) {
      if (q === p) continue;
      const dx = x - q.x;
      const dz = z - q.z;
      const d = Math.hypot(dx, dz);
      if (d < 6 && d > 0.01) {
        x += (dx / d) * (6 - d) * 0.5;
        z += (dz / d) * (6 - d) * 0.5;
      }
    }
    x = clamp(x, -P.HL + 1, P.HL - 1);
    z = clamp(z, -P.HW + 1.5, P.HW - 1.5);
    const far = Math.hypot(x - p.x, z - p.z) > 12;
    this.moveTo(p, x, z, far ? 0.82 : 0.6, far && this.ballU > 0.6);
  }

  findSupportSpot(p, poss, idx) {
    const m = this.m;
    const team = this.team;
    let best = null;
    let bs = -1e9;
    const offU = m.offsideLineU(team);
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * Math.PI * 2;
      const r = 9 + (k % 2) * 5;
      const x = clamp(poss.x + Math.cos(ang) * r, -P.HL + 2, P.HL - 2);
      const z = clamp(poss.z + Math.sin(ang) * r, -P.HW + 2, P.HW - 2);
      if (team.u(x) > offU - 0.005) continue;
      let open = 99;
      for (const o of team.opp.active) open = Math.min(open, Math.hypot(o.x - x, o.z - z));
      let lane = 99;
      for (const o of team.opp.active) lane = Math.min(lane, segDist(o.x, o.z, poss.x, poss.z, x, z).d);
      const dist = Math.hypot(p.x - x, p.z - z);
      const s = Math.min(open, 8) * 0.5 + Math.min(lane, 4) * 0.8 + posValue(team, x, z) * 6 - dist * 0.12 + (idx === 0 ? 0 : (team.u(x) - team.u(poss.x)) * 3);
      if (s > bs) {
        bs = s;
        best = { x, z };
      }
    }
    if (!best) best = { x: poss.x - team.dir * 8, z: poss.z * 0.8 };
    best.t = m.time + 0.7 + m.r() * 0.5;
    return best;
  }

  // ------------------------------------------------------------ sem a bola (defesa)

  assignMarks() {
    const team = this.team;
    const opp = team.opp;
    for (const p of team.active) p.mark = null;
    if (this.attacking) return;
    // atacantes perigosos: no nosso campo, mais perto do nosso gol
    const threats = opp.active.filter((o) => !o.isGK && team.u(o.x) < 0.55 && o !== this.m.possessor).sort((a, c) => team.u(a.x) - team.u(c.x));
    const free = team.active.filter((p) => !p.isGK && p.state !== ST.OFF);
    for (const o of threats) {
      let best = null;
      let bd = 15;
      for (const p of free) {
        if (p.mark || p === this.presser) continue;
        const st = this.shapeTarget(p, false);
        const d = Math.hypot(team.wx(st.u) - o.x, team.wz(st.v) - o.z);
        if (d < bd) {
          bd = d;
          best = p;
        }
      }
      if (best) best.mark = o;
    }
  }

  defend(p) {
    const m = this.m;
    const team = this.team;
    const b = m.ball;
    const st = this.shapeTarget(p, false);
    let u = st.u;
    const line = team.lineOf(p);
    if (line === 'def') u = this.lineU + (p.role === 'CB' ? 0 : 0.01);
    let x = team.wx(u);
    let z = team.wz(st.v);
    const g = team.ownGoalX;
    if (p.mark && p.mark.active && !p.mark.sentOff) {
      const o = p.mark;
      const dg = Math.hypot(g - o.x, o.z);
      const tight = team.u(o.x) < 0.3 ? 1.2 : 2.2;
      const mx = o.x + ((g - o.x) / dg) * tight;
      const mz = o.z + (-o.z / dg) * tight;
      if (line === 'def') {
        // zagueiro marca sem quebrar a linha (a não ser perto da área)
        const mu = team.u(mx);
        x = team.wx(team.u(o.x) < 0.25 ? mu : Math.max(Math.min(mu, this.lineU + 0.05), this.lineU - 0.03));
        z = mz;
      } else {
        x = mx;
        z = mz;
      }
    }
    // recompõe: se está à frente da bola, corre de volta
    const behind = team.u(p.x) > this.ballU + 0.06;
    x = clamp(x, -P.HL + 0.8, P.HL - 0.8);
    z = clamp(z, -P.HW + 0.8, P.HW - 0.8);
    this.moveTo(p, x, z, behind ? 0.95 : 0.7, behind && Math.hypot(x - p.x, z - p.z) > 8);
    if (Math.hypot(x - p.x, z - p.z) < 3) p.faceTarget = Math.atan2(b.p.z - p.z, b.p.x - p.x);
  }

  press(p, c, dt, soft = false) {
    const m = this.m;
    const team = this.team;
    const g = team.ownGoalX;
    const dg = Math.hypot(g - c.x, c.z) || 1;
    // fica entre o portador e o gol
    const keep = soft ? 2.6 : 1.3;
    const gx = c.x + ((g - c.x) / dg) * keep + c.vx * 0.25;
    const gz = c.z + (-c.z / dg) * keep + c.vz * 0.25;
    const d = Math.hypot(c.x - p.x, c.z - p.z);
    if (d > 3.2 + (soft ? 1 : 0)) this.moveTo(p, gx, gz, soft ? 0.8 : 1, !soft);
    else {
      // contenção: acompanha o ritmo do portador
      const dx = gx - p.x;
      const dz = gz - p.z;
      const dd = Math.hypot(dx, dz);
      const k = Math.min(1, dd * 1.5);
      p.desVx = c.vx * 0.9 + (dd > 0.01 ? (dx / dd) * k * 3 : 0);
      p.desVz = c.vz * 0.9 + (dd > 0.01 ? (dz / dd) * k * 3 : 0);
      p.faceTarget = Math.atan2(m.ball.p.z - p.z, m.ball.p.x - p.x);
    }
    // tentativa de desarme
    p.tackleT = (p.tackleT || 0) - dt;
    if (p.tackleT > 0 || p.busy()) return;
    const b = m.ball;
    const db = Math.hypot(b.p.x - p.x, b.p.z - p.z);
    const sep = Math.hypot(b.p.x - c.x, b.p.z - c.z);
    const sk = this.skill;
    const aggr = (this.team.style === 'pressao' ? 1.3 : 1) * sk.press * (soft ? 0.4 : 1);
    if (db < 1.5 && b.p.y < 0.5) {
      p.tackleT = 0.35 + m.r() * 0.4;
      if (sep > 0.45 || m.r() < 0.28 * aggr) {
        m.standTackle(p);
        return;
      }
    }
    // carrinho: chegando por trás/lado, bola um pouco solta
    if (db < 2.6 && db > 1.2 && sep > 0.6 && p.speed > 4.5 && m.r() < 0.12 * aggr) {
      const fx = Math.cos(p.face);
      const fz = Math.sin(p.face);
      const tb = ((b.p.x - p.x) * fx + (b.p.z - p.z) * fz) / db;
      if (tb > 0.85) {
        m.slideTackle(p);
        p.tackleT = 2;
      }
    }
  }

  cover(p, c) {
    const team = this.team;
    const g = team.ownGoalX;
    const dg = Math.hypot(g - c.x, c.z) || 1;
    const x = c.x + ((g - c.x) / dg) * 7;
    const z = c.z + (-c.z / dg) * 7;
    this.moveTo(p, x, z, 0.9, Math.hypot(x - p.x, z - p.z) > 6);
  }

  // Pula para cabecear quando a bola vai passar na altura da cabeça.
  aerial(p) {
    const m = this.m;
    const b = m.ball;
    if (p.y > 0 || p.busy() || b.p.y < 1.2) return;
    const dBall = Math.hypot(b.p.x - p.x, b.p.z - p.z);
    if (dBall > 7) return;
    const pr = m.pred;
    for (let i = 1; i < 10; i++) {
      const s = pr[i];
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < 0.9 && s.y > p.height - 0.1 && s.y < p.height + 0.75) {
        if (s.t < 0.28) {
          const need = s.y - (p.height - 0.15);
          const vj = Math.min(2.4 + p.a.hea * 0.9, Math.sqrt(2 * 9.81 * Math.max(0.15, need)));
          p.vy = vj;
          p.y = 0.001;
          p.setState(ST.JUMP, 0.5);
          // vai para baixo da bola
          p.vx = p.vx * 0.5 + (s.x - p.x) * 2;
          p.vz = p.vz * 0.5 + (s.z - p.z) * 2;
        }
        return;
      }
    }
  }

  // ------------------------------------------------------------ com a bola

  onBall(p, dt) {
    const m = this.m;
    const team = this.team;
    const b = m.ball;
    p.thinkT -= dt;
    if (p.pending) {
      // vai até a bola para executar o passe/chute
      const ahead = 0.12;
      const tx = b.p.x + b.v.x * ahead - Math.cos(p.face) * 0.2;
      const tz = b.p.z + b.v.z * ahead - Math.sin(p.face) * 0.2;
      const dx = tx - p.x;
      const dz = tz - p.z;
      const d = Math.hypot(dx, dz);
      const sp = Math.min(p.vmax(m.env), d * 4 + Math.hypot(b.v.x, b.v.z));
      p.desVx = d > 0.02 ? (dx / d) * sp : 0;
      p.desVz = d > 0.02 ? (dz / d) * sp : 0;
      p.faceTarget = Math.atan2(p.pending.spec.tz - p.z, p.pending.spec.tx - p.x);
      return;
    }
    const pressure = m.pressureOn(p);
    if (p.thinkT <= 0 || (pressure > 0.8 && p.thinkT > 0.15)) {
      p.thinkT = (this.skill.think * (0.8 + m.r() * 0.5)) / this.style.tempo;
      this.decide(p, pressure);
    }
    const it = p.intent;
    if (it && it.type === 'dribble') {
      const vmax = p.vmax(m.env);
      const sp = vmax * (it.sprint ? 1 : 0.78);
      p.desVx = it.dx * sp;
      p.desVz = it.dz * sp;
      p.sprint = !!it.sprint;
      // não sai do campo
      const nx = p.x + it.dx * 2;
      const nz = p.z + it.dz * 2;
      if (Math.abs(nx) > P.HL - 1 || Math.abs(nz) > P.HW - 1) p.thinkT = 0;
    } else if (it && it.type === 'shield') {
      p.desVx = p.desVz = 0;
      const o = this.nearestOpp(p);
      if (o) p.faceTarget = Math.atan2(p.z - o.z, p.x - o.x);
    } else {
      p.desVx *= 0.9;
      p.desVz *= 0.9;
    }
  }

  nearestOpp(p) {
    let best = null;
    let bd = 1e9;
    for (const o of this.team.opp.active) {
      const d = Math.hypot(o.x - p.x, o.z - p.z);
      if (d < bd) {
        bd = d;
        best = o;
      }
    }
    return best;
  }

  // Risco de o passe rasteiro ser cortado (0..1).
  laneRisk(from, tx, tz, receiver) {
    const m = this.m;
    const d = Math.hypot(tx - from.x, tz - from.z);
    const v0 = Math.min(27, groundPassSpeed(m.roll, d, clamp(3.5 + d * 0.13, 3, 11)));
    let risk = 0;
    for (const o of this.team.opp.active) {
      const sd = segDist(o.x, o.z, from.x, from.z, tx, tz);
      if (sd.d > 9) continue;
      const along = sd.t * d;
      const tb = along < 0.5 ? 0.05 : groundTravelTime(m.roll, v0, along);
      const reach = o.isGK ? 1.1 : 0.7;
      const to = sd.d <= reach ? 0.05 : m.timeToCover(o, sd.cx, sd.cz) * ((sd.d - reach) / sd.d) + 0.2;
      const margin = tb - to;
      const r = 1 / (1 + Math.exp(-margin * 4.5));
      risk = Math.max(risk, r);
    }
    // disputa no destino
    if (receiver) {
      const tr = groundTravelTime(m.roll, v0, d);
      for (const o of this.team.opp.active) {
        const to = m.timeToCover(o, tx, tz) + 0.15;
        const tme = m.timeToCover(receiver, tx, tz);
        const t = Math.max(tr, tme);
        risk = Math.max(risk, 1 / (1 + Math.exp(-(t - to) * 3)) * 0.8);
      }
    }
    return risk;
  }

  lobRisk(from, tx, tz, receiver, flight) {
    const m = this.m;
    let risk = 0.08;
    const tme = receiver ? m.timeToCover(receiver, tx, tz) : flight;
    for (const o of this.team.opp.active) {
      const to = m.timeToCover(o, tx, tz);
      const t = Math.max(flight, tme);
      risk = Math.max(risk, (1 / (1 + Math.exp(-(t - to) * 2.5))) * 0.85);
    }
    return risk;
  }

  decide(p, pressure) {
    const m = this.m;
    const team = this.team;
    const b = m.ball;
    const from = b.p;
    const gx = team.oppGoalX;
    const u = team.u(from.x);
    const v0 = posValue(team, from.x, from.z);
    const lossCost = 0.02 + 0.12 * (1 - u) * (1 - u);
    const style = this.style;
    const noise = this.skill.noise;
    const offU = m.offsideLineU(team);
    const options = [];

    // --- chute
    const dGoal = Math.hypot(gx - from.x, from.z);
    if (dGoal < 34) {
      let xg = xgAt(from.x, from.z, gx);
      // bloqueios na linha do chute
      for (const o of team.opp.active) {
        if (o.isGK) continue;
        const sd = segDist(o.x, o.z, from.x, from.z, gx, 0);
        if (sd.t > 0.02 && sd.t < 0.98 && sd.d < 1.2) xg *= 0.6;
      }
      const gk = team.opp.gk();
      if (gk) {
        const off = segDist(gk.x, gk.z, from.x, from.z, gx, 0).d;
        if (off < 0.5 && Math.abs(gk.x - gx) < 3) xg *= 0.9;
        else if (off > 2) xg *= 1.25;
      }
      const shooter = 0.8 + p.a.sho * 0.4;
      let score = xg * shooter + 0.015;
      if (dGoal > 20) score *= style.longShot * (0.6 + p.a.pow * 0.5);
      if (dGoal < 11) score += 0.05;
      options.push({ type: 'shot', score, xg });
    }

    // --- passes
    for (const mt of team.active) {
      if (mt === p || mt.state === ST.OFF || mt.busy()) continue;
      if (mt.isGK && (u > 0.4 || pressure < 0.6)) continue;
      const mu = team.u(mt.x);
      const offside = mu > 0.5 && mu > u && mu > offU + 0.002;
      // no pé
      if (!offside) {
        const tx = mt.x + mt.vx * 0.4;
        const tz = mt.z + mt.vz * 0.4;
        const d = Math.hypot(tx - from.x, tz - from.z);
        if (d > 4 && d < 58) {
          let open = 99;
          for (const o of team.opp.active) open = Math.min(open, Math.hypot(o.x - tx, o.z - tz));
          let val = posValue(team, tx, tz) + Math.min(open, 9) * 0.0015;
          // sem pressão, evita tocar para trás e devolver para quem passou
          const tu = team.u(tx);
          if (tu < u - 0.02) val -= (pressure < 0.4 ? 0.01 : 0.004) + (u < 0.35 ? 0.006 : 0);
          if (mt === p.lastFrom && pressure < 0.6) val -= 0.008;
          if (d < 34) {
            const risk = this.laneRisk(from, tx, tz, mt) * style.risk;
            const sc = val * (1 - risk) - risk * lossCost + (style.direct < 0 && d < 20 ? 0.004 : 0);
            options.push({ type: 'pass', score: sc, mt, tx, tz, kind: 'ground', risk });
          }
          if (d > 16) {
            const flight = d / 17 + 0.4;
            const risk = this.lobRisk(from, tx, tz, mt, flight) * style.risk;
            const header = inBox(tx, tz, gx);
            const sc = val * (1 - risk) - risk * lossCost - 0.012 + style.direct * 0.12 + (header ? 0.01 : 0);
            options.push({ type: 'pass', score: sc, mt, tx, tz, kind: 'lob', risk });
          }
        }
      }
      // enfiada para quem está correndo (ou atacante na linha)
      const runner = mt.run && mt.run.until > m.time;
      const fwd = mt.role === 'ST' || mt.role === 'LW' || mt.role === 'RW' || mt.role === 'AM';
      if ((runner || fwd) && !offside && mu > u - 0.05) {
        const lead = 7 + (runner ? mt.speed * 0.8 : 2);
        let dx = runner ? mt.vx : team.dir;
        let dz = runner ? mt.vz : -mt.z * 0.015;
        const dl = Math.hypot(dx, dz) || 1;
        const tx = clamp(mt.x + (dx / dl) * lead, -P.HL + 4, P.HL - 4);
        const tz = clamp(mt.z + (dz / dl) * lead, -P.HW + 2, P.HW - 2);
        const d = Math.hypot(tx - from.x, tz - from.z);
        if (d > 6 && d < 45 && team.u(tx) > offU - 0.02) {
          const val = posValue(team, tx, tz);
          const ground = d < 30;
          const risk = (ground ? this.laneRisk(from, tx, tz, mt) : this.lobRisk(from, tx, tz, mt, d / 17 + 0.4)) * style.risk;
          const sc = val * (1 - risk) - risk * lossCost + 0.008 + style.direct * 0.08;
          options.push({ type: 'through', score: sc, mt, tx, tz, kind: ground ? 'ground' : 'lob', risk });
        }
      }
    }

    // --- cruzamento
    const v = team.v(from.z);
    if (u > 0.78 && Math.abs(v) > 0.42) {
      const inBoxMates = team.active.filter((q) => q !== p && inBox(q.x, q.z, gx));
      if (inBoxMates.length) {
        const tgt = inBoxMates.sort((a, c) => c.a.hea + c.height - (a.a.hea + a.height))[0];
        const sc = 0.05 + inBoxMates.length * 0.015 + tgt.a.hea * 0.03 - (pressure > 1 ? 0.01 : 0);
        options.push({ type: 'cross', score: sc, mt: tgt });
      }
    }

    // --- drible
    const toGoal = Math.atan2(-from.z, gx - from.x);
    let bestDrib = null;
    for (const da of [0, -0.55, 0.55, -1.1, 1.1, -1.7, 1.7]) {
      const a = toGoal + da;
      const dx = Math.cos(a);
      const dz = Math.sin(a);
      const ex = from.x + dx * 6;
      const ez = from.z + dz * 6;
      if (Math.abs(ex) > P.HL - 1 || Math.abs(ez) > P.HW - 1.5) continue;
      let space = 12;
      for (const o of team.opp.active) {
        const sd = segDist(o.x, o.z, from.x, from.z, from.x + dx * 12, from.z + dz * 12);
        const closing = sd.d - sd.t * 12 * 0.35;
        space = Math.min(space, Math.max(0, closing + sd.t * 6));
      }
      const gain = posValue(team, from.x + dx * Math.min(space, 6), from.z + dz * Math.min(space, 6));
      const danger = clamp(1 - space / 5, 0, 1);
      const sc = gain * (1 - danger * 0.8) - danger * lossCost * 0.8 + (p.a.dri - 0.6) * 0.01 + (pressure < 0.3 && da === 0 ? 0.004 : 0);
      if (!bestDrib || sc > bestDrib.score) bestDrib = { type: 'dribble', score: sc, dx, dz, space };
    }
    if (bestDrib) options.push(bestDrib);

    // --- chutão (área própria sob pressão)
    if (u < 0.2 && pressure > 0.6) options.push({ type: 'clear', score: v0 * 0.6 + 0.01 - lossCost * 0.3 });

    // escolhe com ruído
    let best = null;
    let bs = -1e9;
    for (const o of options) {
      const s = o.score + (m.r() - 0.5) * noise * 0.06;
      if (s > bs) {
        bs = s;
        best = o;
      }
    }
    if (!best) return;
    // sem pressa: se driblar é parecido com tocar, segue conduzindo um pouco
    this.execute(p, best, pressure, options);
  }

  execute(p, o, pressure, options) {
    const m = this.m;
    const team = this.team;
    const b = m.ball;
    p.intent = null;
    switch (o.type) {
      case 'shot': {
        const gx = team.oppGoalX;
        const gk = team.opp.gk();
        const dGoal = Math.hypot(gx - b.p.x, b.p.z);
        // canto longe do goleiro
        let aimZ = gk ? (gk.z > 0 ? -1 : 1) * (2.4 + m.r() * 0.9) : (m.r() < 0.5 ? -1 : 1) * 2.8;
        if (m.r() < 0.25) aimZ = -aimZ * 0.7;
        const power = clamp(0.5 + dGoal / 55 + (m.r() - 0.5) * 0.2, 0.45, 0.9);
        const ang = Math.abs(Math.atan2(b.p.z, Math.abs(gx - b.p.x)));
        const finesse = dGoal > 12 && dGoal < 26 && (ang > 0.35 || m.r() < 0.35) && m.r() < 0.55;
        const chip = gk && dGoal < 16 && Math.hypot(gk.x - b.p.x, gk.z - b.p.z) < 7 && Math.abs(gk.x - gx) > 4 && m.r() < 0.4;
        m.queueKick(p, m.shotSpec(p, aimZ, power, { finesse, chip }));
        break;
      }
      case 'pass':
        m.queueKick(p, m.passSpec(p, o.mt, o.kind, 0.5));
        break;
      case 'through':
        m.queueKick(p, m.throughSpec(p, o.mt, o.kind, 0.5));
        if (!o.mt.run) o.mt.run = { until: m.time + 2.5, x: o.tx, z: o.tz };
        else {
          o.mt.run.x = o.tx;
          o.mt.run.z = o.tz;
        }
        break;
      case 'cross': {
        const gx = team.oppGoalX;
        const sgx = Math.sign(gx);
        const spots = [
          { x: gx - sgx * 6, z: Math.sign(b.p.z) * 2 },
          { x: gx - sgx * 8, z: -Math.sign(b.p.z) * 3 },
          { x: gx - sgx * 11, z: 0 },
        ];
        const mt = o.mt;
        let tgt = spots.reduce((a, c) => (Math.hypot(c.x - mt.x, c.z - mt.z) < Math.hypot(a.x - mt.x, a.z - mt.z) ? c : a));
        tgt = { x: lerp(tgt.x, mt.x, 0.6), z: lerp(tgt.z, mt.z, 0.6) };
        const inswing = m.r() < 0.5;
        m.queueKick(p, {
          kind: 'lob',
          tx: tgt.x,
          tz: tgt.z,
          ty: 1.7,
          receiver: mt,
          pitch: 0.36 + m.r() * 0.1,
          back: 10,
          side: (inswing ? 1 : -1) * Math.sign(b.p.z) * sgx * 18,
          power: 0.6,
          cross: true,
        });
        break;
      }
      case 'clear': {
        const tx = clamp(b.p.x + team.dir * 45, -P.HL + 5, P.HL - 5);
        const tz = clamp(b.p.z + Math.sign(b.p.z || 1) * 15, -P.HW + 3, P.HW - 3);
        m.queueKick(p, { kind: 'clear', tx, tz, ty: R, pitch: 0.65, back: 12, power: 1 });
        break;
      }
      case 'dribble': {
        const sprint = o.space > 7 && p.stamina > 0.3;
        // drible curto para escapar do marcador
        if (pressure > 0.9 && o.space < 2.5 && m.r() < 0.35 + p.a.dri * 0.4) {
          p.knockOn = m.time;
          p.intent = { type: 'dribble', dx: o.dx, dz: o.dz, sprint: true };
        } else if (pressure > 1.1 && o.space < 1.5) {
          p.intent = { type: 'shield' };
        } else p.intent = { type: 'dribble', dx: o.dx, dz: o.dz, sprint };
        break;
      }
    }
  }

  // ------------------------------------------------------------ bolas paradas

  takeSetPiece(tk, sp) {
    const m = this.m;
    const team = this.team;
    if (!sp.aiDelay) sp.aiDelay = 0.5 + m.r() * 0.9;
    if (m.time - sp.readyT < sp.aiDelay) return;
    const gx = team.oppGoalX;
    const sgx = Math.sign(gx);
    const mates = team.active.filter((q) => q !== tk && q.state !== ST.OFF);
    const openness = (q) => {
      let o = 99;
      for (const op of team.opp.active) o = Math.min(o, Math.hypot(op.x - q.x, op.z - q.z));
      return o;
    };
    const pickPass = (maxD, preferFwd) => {
      let best = null;
      let bs = -1e9;
      for (const q of mates) {
        if (q.isGK) continue;
        const d = Math.hypot(q.x - tk.x, q.z - tk.z);
        if (d > maxD || d < 3) continue;
        const s = Math.min(openness(q), 8) - d * 0.08 + (preferFwd ? (team.u(q.x) - team.u(tk.x)) * 10 : 0);
        if (s > bs) {
          bs = s;
          best = q;
        }
      }
      return best;
    };
    switch (sp.type) {
      case 'kickoff': {
        const q = mates.filter((x) => !x.isGK).sort((a, c) => Math.hypot(a.x - tk.x, a.z - tk.z) - Math.hypot(c.x - tk.x, c.z - tk.z))[0];
        m.queueKick(tk, m.passSpec(tk, q, 'ground', 0.4));
        break;
      }
      case 'throw': {
        const q = pickPass(22, true) || mates[0];
        const spec = m.passSpec(tk, q, 'lob', 0.5);
        spec.kind = 'throw';
        spec.ty = 0.5;
        m.queueKick(tk, spec);
        break;
      }
      case 'goalkick': {
        const short = (this.team.style === 'posse' || m.r() < 0.35) && pickPass(22, false);
        if (short) m.queueKick(tk, m.passSpec(tk, short, 'ground', 0.5));
        else {
          const fw = mates.filter((q) => q.role === 'ST' || q.role === 'AM' || q.role === 'LW' || q.role === 'RW').sort((a, c) => team.u(c.x) - team.u(a.x))[0] || mates[0];
          m.queueKick(tk, { kind: 'lob', tx: fw.x, tz: fw.z, ty: R, receiver: fw, pitch: 0.55, back: 25, power: 0.9 });
        }
        break;
      }
      case 'corner': {
        if (m.r() < 0.12) {
          const q = pickPass(15, false);
          if (q) {
            m.queueKick(tk, m.passSpec(tk, q, 'ground', 0.4));
            break;
          }
        }
        const zs = Math.sign(tk.z);
        const spots = [
          { x: gx - sgx * 5.5, z: zs * 2.2 },
          { x: gx - sgx * 7.5, z: -zs * 2.5 },
          { x: gx - sgx * 11, z: 0 },
        ];
        const s = spots[Math.floor(m.r() * spots.length)];
        const inswing = m.r() < 0.6;
        m.queueKick(tk, { kind: 'lob', tx: s.x, tz: s.z, ty: 1.8, receiver: null, pitch: 0.42 + m.r() * 0.08, back: 8, side: (inswing ? 1 : -1) * zs * sgx * 22, power: 0.7, cross: true });
        break;
      }
      case 'freekick': {
        const dGoal = Math.hypot(gx - tk.x, tk.z);
        if (sp.direct && !sp.indirect && m.r() < 0.55 + tk.a.sho * 0.3) {
          // cobrança direta: por cima e por fora da barreira, no canto do goleiro
          const zs = Math.sign(sp.z || 1);
          const aimZ = -zs * (2.2 + m.r() * 1.0) * (m.r() < 0.35 ? -1 : 1);
          const spec = m.shotSpec(tk, aimZ, 0.72 + m.r() * 0.12, { finesse: true });
          spec.ty = 1.6 + m.r() * 0.6;
          m.queueKick(tk, spec);
        } else if (team.u(sp.x) > 0.62) {
          const tgt = { x: gx - sgx * (7 + m.r() * 5), z: (m.r() - 0.5) * 8 };
          m.queueKick(tk, { kind: 'lob', tx: tgt.x, tz: tgt.z, ty: 1.7, receiver: null, pitch: 0.42, back: 12, side: 0, power: 0.7, cross: true });
        } else {
          const q = pickPass(dGoal > 60 ? 45 : 30, true) || mates[0];
          m.queueKick(tk, m.passSpec(tk, q, Math.hypot(q.x - tk.x, q.z - tk.z) > 28 ? 'lob' : 'ground', 0.5));
        }
        break;
      }
      case 'penalty': {
        const r = m.r();
        const aimZ = r < 0.42 ? -2.7 : r < 0.84 ? 2.7 : (m.r() - 0.5) * 1.2;
        const spec = m.shotSpec(tk, aimZ + (m.r() - 0.5) * 0.6, 0.66 + m.r() * 0.18, {});
        spec.ty = 0.3 + m.r() * 1.6;
        m.queueKick(tk, spec);
        break;
      }
    }
  }

  // ------------------------------------------------------------ substituições

  considerSubs() {
    const m = this.m;
    const team = this.team;
    const min = m.clock / 60;
    if (team.subsLeft <= 0 || team.subWindows <= 0 || min < 55 || !team.bench.length) return;
    const tired = team.active
      .filter((p) => !p.isGK && (p.fatigue > 0.16 || p.stamina < 0.35 || (p.cards > 0 && team.lineOf(p) === 'def' && min > 65)))
      .sort((a, b) => b.fatigue - a.fatigue)
      .slice(0, Math.min(2, team.subsLeft));
    if (!tired.length) return;
    if (min < 70 && m.r() < 0.5) return;
    team.subWindows--;
    for (const out of tired) {
      const line = team.lineOf(out);
      const cand = team.bench.filter((d) => d.pos !== 'GK').sort((a, c) => {
        const sa = (a.pos === out.role ? 8 : 0) + a.ovr;
        const sc = (c.pos === out.role ? 8 : 0) + c.ovr;
        return sc - sa;
      })[0];
      if (!cand) break;
      const np = team.substitute(out, cand);
      if (np) {
        m.rebuildAll();
        m.say(`Substituição no ${team.club.short}: sai ${out.name}, entra ${np.name}.`, 'sub');
        m.emit('sub', { team, out, inn: np, line });
      }
    }
  }
}

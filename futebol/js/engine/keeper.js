// Goleiro: posicionamento na bissetriz, leitura do chute com tempo de reação,
// mergulho com alcance físico limitado, encaixe ou rebote (depende da
// velocidade da bola, do manejo e da chuva), saída do gol em bolas soltas,
// cruzamentos e mano a mano, regra do recuo e reposição com mão ou pé.
import { PITCH as P, BALL as B } from './constants.js';
import { ST } from './player.js';
import { inBox, segDist } from './geom.js';
import { clamp, lerp } from '../util.js';

const R = B.r;

function handsAllowed(m, gk) {
  if (!m.canHandle(gk)) return false;
  // recuo: bola chutada de propósito por um companheiro não pode ser pega com a mão
  const lt = m.lastTouch;
  if (lt && lt.p.team === gk.team && lt.p !== gk && lt.kind === 'kick' && lt.spType == null && !(m.lastKick && m.lastKick.spec.kind === 'header')) return false;
  if (lt && lt.p.team === gk.team && lt.spType === 'throw') return false;
  return true;
}

// Ponto em que a bola cruza o plano do goleiro / a linha do gol.
function readShot(m, gk) {
  const pr = m.pred;
  const g = gk.team.ownGoalX;
  const sg = Math.sign(g);
  const b = m.ball;
  const toward = b.v.x * sg;
  if (toward < 3) return null;
  let plane = null;
  let line = null;
  for (let i = 1; i < pr.length; i++) {
    const s = pr[i];
    if (!plane && s.x * sg >= gk.x * sg - 0.1) plane = s;
    if (s.x * sg >= P.HL) {
      line = s;
      break;
    }
    if (s.t > 2.2) break;
  }
  if (!line) return null;
  const onTarget = Math.abs(line.z) < P.goalW / 2 + 0.35 && line.y < P.goalH + 0.25;
  if (!onTarget) return null;
  return { plane: plane || line, line, onTarget };
}

export function keeperThink(m, gk, dt) {
  const b = m.ball;
  const team = gk.team;
  const g = team.ownGoalX;
  const sg = Math.sign(g);
  const sk = m.skill[team.side];
  gk.faceTarget = null;
  if (gk.state === ST.OFF) return;

  // segurando a bola: repõe
  if (b.held === gk) {
    gk.holdT = (gk.holdT || 0) + dt;
    gk.desVx = gk.desVz = 0;
    gk.faceTarget = team.dir > 0 ? 0 : Math.PI;
    if (team.user && gk.userCtl) return;
    if (gk.holdT > 1.4 + (gk.holdSeed || 0) * 1.8 && !gk.pending) distribute(m, gk);
    return;
  }
  gk.holdT = 0;
  gk.holdSeed = m.r();
  if (gk.busy()) return;

  // pênalti: mergulha no momento da batida
  const lk = m.lastKick;
  const penKick = lk && lk.p.team !== team && m.time - lk.t < 0.05 && m.lastTouch && m.lastTouch.spType === 'penalty';
  if (penKick && !gk.penDove) {
    gk.penDove = true;
    let side;
    if (gk.userDiveZ != null) side = gk.userDiveZ;
    else {
      const read = readShot(m, gk);
      const realZ = read ? read.line.z : 0;
      const guessRight = m.r() < 0.38 + gk.a.ref * 0.2;
      side = guessRight ? Math.sign(realZ) * (Math.abs(realZ) > 0.9 ? 1 : 0) : m.r() < 0.5 ? -1 : 1;
      if (side === 0 && m.r() < 0.6) side = m.r() < 0.5 ? -1 : 1;
    }
    gk.userDiveZ = null;
    if (side !== 0) dive(m, gk, side * 2.8, 0.6 + m.r() * 1.0, 0.55);
    return;
  }
  if (m.time - (lk ? lk.t : 0) > 1) gk.penDove = false;

  // leitura de chute
  const shot = readShot(m, gk);
  if (shot) {
    if (!gk.reactAt) gk.reactAt = m.time + (0.08 + (1 - gk.a.ref) * 0.2) / sk.gk + m.r() * 0.05;
    if (m.time >= gk.reactAt) {
      const pt = shot.plane;
      const tLeft = Math.max(0.05, pt.t);
      const dz = pt.z - gk.z;
      const reachStand = 0.75;
      if (Math.abs(dz) < reachStand && pt.y < gk.height + 0.35) {
        // vai no corpo: só se ajeita
        moveTo(gk, gk.x, pt.z, 1, m);
        gk.faceTarget = Math.atan2(b.p.z - gk.z, b.p.x - gk.x);
      } else if (Math.abs(dz) < 1.6 && tLeft > 0.45 && pt.y < 1.9) {
        // dá tempo de chegar de lado
        moveTo(gk, gk.x, pt.z, 1, m);
        gk.faceTarget = Math.atan2(b.p.z - gk.z, b.p.x - gk.x);
      } else {
        dive(m, gk, dz, pt.y, tLeft);
      }
      return;
    }
  } else gk.reactAt = 0;

  const handOk = handsAllowed(m, gk);
  // bola solta na área: sai para pegar
  const poss = m.possessor;
  const int = gk.interceptP;
  const ownBall = poss && poss.team === team;
  const myBall = !ownBall && int && gk.interceptT < 3 && inBox(int.x, int.z, g) && team.bestInt === gk;
  const oppBestT = team.opp.bestInt ? team.opp.bestInt.interceptT : 9;
  if (!poss && int && inBox(int.x, int.z, g) && gk.interceptT < oppBestT + 0.2 && (myBall || gk.interceptT < 1.6)) {
    moveTo(gk, int.x, int.z, 1, m, true);
    // cruzamento alto: salta para socar/agarrar
    if (b.p.y > 1.6 && Math.hypot(b.p.x - gk.x, b.p.z - gk.z) < 2.2 && gk.y === 0 && handOk) {
      gk.vy = 2.6 + gk.a.dive * 0.6;
      gk.y = 0.001;
      gk.setState(ST.JUMP, 0.5);
    }
    return;
  }
  // mano a mano: atacante sozinho na área
  if (poss && poss.team !== team && inBox(poss.x, poss.z, g)) {
    const dGoal = Math.hypot(g - poss.x, poss.z);
    let blockers = 0;
    for (const q of team.active) {
      if (q === gk) continue;
      const sd = segDist(q.x, q.z, poss.x, poss.z, g, 0);
      if (sd.d < 1.5 && sd.t > 0.05) blockers++;
    }
    if (blockers === 0 && dGoal < 17) {
      const dx = g - poss.x;
      const dz = -poss.z;
      const dl = Math.hypot(dx, dz) || 1;
      const close = Math.hypot(poss.x - gk.x, poss.z - gk.z);
      const tx = poss.x + (dx / dl) * Math.max(2, close * 0.4);
      const tz = poss.z + (dz / dl) * Math.max(2, close * 0.4);
      moveTo(gk, tx, tz, 1, m, true);
      gk.faceTarget = Math.atan2(poss.z - gk.z, poss.x - gk.x);
      // abafa: bola solta à frente do atacante
      const sep = Math.hypot(b.p.x - poss.x, b.p.z - poss.z);
      const dBall = Math.hypot(b.p.x - gk.x, b.p.z - gk.z);
      if (dBall < 2.4 && sep > 0.7 && m.r() < 0.25) {
        smother(m, gk);
      }
      return;
    }
  }
  // posicionamento normal: na bissetriz, adiantado conforme a distância
  const bx = b.p.x;
  const bz = b.p.z;
  const dBall = Math.hypot(bx - g, bz);
  let depth = clamp(0.5 + (dBall - 6) * 0.07, 0.4, 3.2);
  if (ownBall && dBall > 40) depth = clamp(depth + (dBall - 40) * 0.25, 0, 11);
  const dx = (bx - g) / Math.max(1, dBall);
  const dz = bz / Math.max(1, dBall);
  let tx = g + dx * depth;
  let tz = dz * depth;
  // fica entre as traves quando perto da linha
  tz = clamp(tz + bz * 0.04, -(P.goalW / 2 - 0.4), P.goalW / 2 - 0.4);
  if (Math.abs(tx - g) > P.boxD - 1) tx = g - sg * (P.boxD - 1);
  moveTo(gk, tx, tz, 0.7, m);
  gk.faceTarget = Math.atan2(bz - gk.z, bx - gk.x);
}

function moveTo(gk, x, z, urg, m, sprint = false) {
  const dx = x - gk.x;
  const dz = z - gk.z;
  const d = Math.hypot(dx, dz);
  const vmax = gk.vmax(m.env) * (sprint ? 1 : urg * 0.8);
  const sp = Math.min(vmax, d * 2.5);
  gk.desVx = d > 0.05 ? (dx / d) * sp : 0;
  gk.desVz = d > 0.05 ? (dz / d) * sp : 0;
}

// Mergulho: deslocamento lateral limitado pela explosão do goleiro.
function dive(m, gk, dz, y, tLeft) {
  const side = Math.sign(dz) || 1;
  const sk = m.skill[gk.team.side];
  const power = (3.6 + gk.a.dive * 2.6) * sk.gk;
  const need = Math.max(0, Math.abs(dz) - 0.9) / Math.max(0.12, tLeft);
  const lat = Math.min(power, need * 1.05 + 0.6);
  const g = gk.team.ownGoalX;
  gk.setState(ST.DIVE, 0.95);
  gk.vz = side * lat;
  gk.vx = -Math.sign(g) * 0.7;
  const hy = clamp(y - 0.7, 0, 1.6);
  gk.vy = clamp(Math.sqrt(2 * 9.81 * Math.max(0.05, hy * 0.75)), 1.2, 4.4);
  // lado do mergulho em relação ao corpo (animação): a direita do goleiro é (-sen f, cos f)
  gk.aux1 = side * (Math.cos(gk.face) >= 0 ? 1 : -1);
  gk.aux2 = clamp(y / 2.2, 0, 1);
  gk.diveSide = side;
  gk.diveY = y;
  m.emit('dive', { player: gk });
}

function smother(m, gk) {
  const b = m.ball;
  const a = Math.atan2(b.p.z - gk.z, b.p.x - gk.x);
  gk.setState(ST.DIVE, 0.8);
  gk.vx = Math.cos(a) * 5;
  gk.vz = Math.sin(a) * 5;
  gk.vy = 0.8;
  gk.aux1 = 1;
  gk.aux2 = 0;
  gk.diveSide = 0;
}

// Contato da bola com o goleiro (mãos/corpo). Retorna true se tocou.
export function keeperContact(m, gk, dt) {
  const b = m.ball;
  if (b.held || gk.touchCD > 0 || gk.state === ST.OFF) return false;
  const handOk = handsAllowed(m, gk);
  if (!handOk) return false;
  const diving = gk.state === ST.DIVE;
  let ax;
  let ay;
  let az;
  let hx;
  let hy;
  let hz;
  let rad;
  if (diving && gk.diveSide !== 0) {
    // corpo esticado: do quadril até as mãos, na direção do mergulho
    const up = clamp((gk.diveY || 1) - 0.6, -0.2, 1.4);
    const dl = Math.hypot(1.5, up);
    ax = gk.x;
    ay = gk.y + 0.55;
    az = gk.z;
    hx = gk.x;
    hy = ay + (up / dl) * 1.7;
    hz = gk.z + (gk.diveSide * 1.5) / dl * 1.7 / 1.0;
    rad = 0.3;
  } else {
    ax = gk.x;
    ay = 0.1 + gk.y;
    az = gk.z;
    hx = gk.x;
    hy = gk.height + 0.45 + gk.y;
    hz = gk.z;
    rad = diving ? 0.5 : 0.42;
  }
  // distância bola–segmento em 3D
  const sx = hx - ax;
  const sy = hy - ay;
  const sz = hz - az;
  const ll = sx * sx + sy * sy + sz * sz || 1;
  let t = ((b.p.x - ax) * sx + (b.p.y - ay) * sy + (b.p.z - az) * sz) / ll;
  t = clamp(t, 0, 1);
  const cx = ax + sx * t;
  const cy = ay + sy * t;
  const cz = az + sz * t;
  const dx = b.p.x - cx;
  const dy = b.p.y - cy;
  const dz = b.p.z - cz;
  const d = Math.hypot(dx, dy, dz);
  if (d > rad + R) return false;

  const sp = b.speed;
  const team = gk.team;
  const sk = m.skill[team.side];
  const g = team.ownGoalX;
  const sg = Math.sign(g);
  const shotOn = m.lastShot && m.lastShot.p.team !== team && m.time - m.lastShot.t < 2.5;
  // bola lenta: só recolhe
  let catchSpeed = (10 + gk.a.han * 12) * sk.gk * (1 - m.env.ballWet * 0.25 - m.env.snow * 0.1);
  if (diving) catchSpeed *= 0.8;
  const atHands = t > 0.55 || !diving;
  const pCatch = sp < 4 ? 0.99 : clamp(1 - (sp - catchSpeed * 0.65) / (catchSpeed * 0.7), 0.05, 0.97) * (atHands ? 1 : 0.6);
  gk.touchCD = 0.3;
  if (m.r() < pCatch) {
    // encaixe
    b.held = gk;
    gk.holding = true;
    b.v.x = b.v.y = b.v.z = 0;
    m.touchBy(gk, 'control');
    m.lastTouch.kind = 'catch';
    m.possessor = gk;
    m.possTeam = team;
    if (shotOn && sp > 6) {
      team.stats.saves++;
      gk.stats.saves++;
      gk.stats.rating += 0.45;
      m.emit('save', { player: gk, catch: true });
      m.say(`Defesa de ${gk.name}!`, 'save');
    } else m.emit('catch', { player: gk });
    if (!diving) gk.setState(ST.HOLD, 0.3);
    gk.holdT = 0;
    return true;
  }
  // rebate: para fora, longe do gol
  let nx = dx;
  let ny = dy;
  let nz = dz;
  const nl = Math.hypot(nx, ny, nz) || 1;
  nx /= nl;
  ny /= nl;
  nz /= nl;
  const k = 0.25 + m.r() * 0.25;
  let vx = -sg * (2 + sp * 0.18) + nx * sp * k;
  let vz = nz * sp * k * 1.3 + (m.r() - 0.5) * 4;
  let vy = Math.abs(ny) * sp * k + 1 + m.r() * 2;
  // bola alta perto do travessão: espalma por cima
  if (b.p.y > P.goalH - 0.5 && Math.abs(b.p.x - g) < 2) {
    vy = 4 + m.r() * 2;
    vx = sg * 2;
  } else if (Math.abs(b.p.z) > P.goalW / 2 - 0.8 && Math.abs(b.p.x - g) < 2) {
    // espalma para escanteio
    vz = Math.sign(b.p.z) * (3 + m.r() * 3);
    vx = sg * 1.5;
  }
  b.v.x = vx;
  b.v.y = vy;
  b.v.z = vz;
  b.w.x = b.w.y = b.w.z = 0;
  b.p.x = cx + nx * (rad + R + 0.02);
  b.p.y = Math.max(R, cy + ny * (rad + R + 0.02));
  b.p.z = cz + nz * (rad + R + 0.02);
  m.touchBy(gk, 'save');
  if (shotOn) {
    team.stats.saves++;
    gk.stats.saves++;
    gk.stats.rating += 0.4;
    m.say(`${gk.name} espalma!`, 'save');
  }
  m.emit('save', { player: gk, catch: false });
  return true;
}

// Reposição do goleiro com a bola na mão.
function distribute(m, gk) {
  const team = gk.team;
  let best = null;
  let bs = -1e9;
  for (const q of team.active) {
    if (q === gk) continue;
    const d = Math.hypot(q.x - gk.x, q.z - gk.z);
    if (d < 6 || d > 34) continue;
    let open = 99;
    for (const o of team.opp.active) open = Math.min(open, Math.hypot(o.x - q.x, o.z - q.z));
    const s = Math.min(open, 10) - d * 0.12;
    if (open > 6 && s > bs) {
      bs = s;
      best = q;
    }
  }
  if (best && (team.style === 'posse' || m.r() < 0.6)) {
    const spec = m.passSpec(gk, best, 'ground', 0.5);
    spec.kind = 'throw';
    spec.receiver = best;
    m.queueKick(gk, spec);
  } else {
    const fw = team.active.filter((q) => !q.isGK).sort((a, c) => team.u(c.x) - team.u(a.x))[0];
    const tx = clamp(fw ? fw.x : gk.x + team.dir * 50, -P.HL + 5, P.HL - 5);
    const tz = clamp(fw ? fw.z : 0, -P.HW + 4, P.HW - 4);
    m.queueKick(gk, { kind: 'lob', tx, tz, ty: R, receiver: fw, pitch: 0.55, back: 20, power: 1 });
  }
}

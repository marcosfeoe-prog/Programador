// Posicionamento para bolas paradas: saída de bola, lateral, escanteio, tiro
// de meta, falta (com barreira) e pênalti.
import { PITCH as P } from './constants.js';
import { clamp } from '../util.js';
import { FORMATIONS } from './team.js';

const DIST = 9.15;

function formationSpot(team, p, ballU, attacking) {
  const sl = FORMATIONS[team.formation][p.slot] || { d: [0.3, 0], a: [0.5, 0] };
  const base = attacking ? sl.a : sl.d;
  const u = clamp(base[0] + (ballU - 0.5) * (attacking ? 0.5 : 0.55), 0.04, 0.9);
  return { x: team.wx(u), z: team.wz(base[1] * (attacking ? 0.95 : 0.85)) };
}

function keepOut(t, bx, bz, r) {
  const dx = t.x - bx;
  const dz = t.z - bz;
  const d = Math.hypot(dx, dz);
  if (d < r) {
    const k = d < 0.01 ? 1 : r / d;
    t.x = bx + (d < 0.01 ? r : dx * k);
    t.z = bz + (d < 0.01 ? 0 : dz * k);
  }
}

function clampPitch(t, m = 0.5) {
  t.x = clamp(t.x, -P.HL + m, P.HL - m);
  t.z = clamp(t.z, -P.HW + m, P.HW - m);
}

function faceTo(t, x, z) {
  t.face = Math.atan2(z - t.z, x - t.x);
  return t;
}

// Melhor jogador por uma nota.
function bestBy(list, f) {
  let b = null;
  let bs = -1e9;
  for (const p of list) {
    const s = f(p);
    if (s > bs) {
      bs = s;
      b = p;
    }
  }
  return b;
}

export function setupPositions(m, sp) {
  const T = sp.team; // time que cobra
  const D = T.opp;
  const bx = sp.x;
  const bz = sp.z;
  const tAct = T.active;
  const dAct = D.active;
  for (const p of [...tAct, ...dAct]) p.spTarget = null;
  let taker = null;

  if (sp.type === 'kickoff') {
    for (const team of [T, D]) {
      for (const p of team.active) {
        const sl = FORMATIONS[team.formation][p.slot];
        const u = clamp(sl.d[0] * 0.92, 0.02, 0.46);
        const t = { x: team.wx(u), z: team.wz(sl.d[1]) };
        if (team === D) keepOut(t, 0, 0, DIST + 0.6);
        p.spTarget = faceTo(t, 0, 0);
      }
    }
    const fw = tAct.filter((p) => p.role === 'ST' || p.role === 'AM');
    taker = fw[0] || bestBy(tAct.filter((p) => !p.isGK), (p) => -Math.abs(T.u(p.x) - 0.5));
    taker.spTarget = { x: -T.dir * 0.35, z: 0.1, face: T.dir > 0 ? 0 : Math.PI };
    // receptor ao lado, um pouco atrás
    const mids = tAct.filter((p) => p !== taker && !p.isGK && (p.role === 'CM' || p.role === 'DM' || p.role === 'AM' || p.role === 'ST'));
    if (mids[0]) mids[0].spTarget = faceTo({ x: -T.dir * 6, z: 3.5 }, 0, 0);
    return taker;
  }

  if (sp.type === 'penalty') {
    const gx = D.ownGoalX;
    const sx = gx - Math.sign(gx) * P.penSpot;
    taker = sp.taker || bestBy(tAct.filter((p) => !p.isGK), (p) => p.a.sho * 2 + p.a.pow + p.a.con);
    taker.spTarget = faceTo({ x: sx - Math.sign(gx) * 2.2, z: 0.4 }, gx, 0);
    const gk = D.gk();
    if (gk) gk.spTarget = faceTo({ x: gx - Math.sign(gx) * 0.3, z: 0 }, sx, 0);
    // demais fora da área e atrás da linha da bola
    let i = 0;
    for (const p of [...tAct, ...dAct]) {
      if (p === taker || p === gk) continue;
      const row = i % 9;
      const off = Math.floor(i / 9);
      const x = gx - Math.sign(gx) * (P.boxD + 2 + off * 2.5);
      const z = -16 + row * 4;
      p.spTarget = faceTo({ x, z: z + (i % 2) * 0.6 }, sx, 0);
      i++;
    }
    return taker;
  }

  if (sp.type === 'throw') {
    taker = sp.taker || bestBy(tAct.filter((p) => !p.isGK), (p) => -Math.hypot(p.x - bx, p.z - bz) + (p.role === 'LB' || p.role === 'RB' ? 6 : 0));
    const zs = Math.sign(bz);
    taker.spTarget = faceTo({ x: bx, z: zs * (P.HW + 0.35) }, bx, 0);
    const ballU = T.u(bx);
    for (const p of tAct) {
      if (p === taker) continue;
      const t = formationSpot(T, p, ballU, true);
      // aproxima do lateral
      t.z = t.z * 0.65 + bz * 0.35;
      t.x = t.x * 0.75 + bx * 0.25;
      clampPitch(t, 1);
      p.spTarget = faceTo(t, bx, bz);
    }
    // dois homens de apoio perto da cobrança
    const near = tAct.filter((p) => p !== taker && !p.isGK).sort((a, b) => Math.hypot(a.x - bx, a.z - bz) - Math.hypot(b.x - bx, b.z - bz));
    if (near[0]) near[0].spTarget = faceTo({ x: bx + T.dir * 7, z: zs * (P.HW - 5) }, bx, bz);
    if (near[1]) near[1].spTarget = faceTo({ x: bx - T.dir * 6, z: zs * (P.HW - 9) }, bx, bz);
    for (const p of dAct) {
      const t = formationSpot(D, p, D.u(bx), false);
      t.z = t.z * 0.7 + bz * 0.3;
      clampPitch(t, 1);
      keepOut(t, bx, bz, 2.2);
      p.spTarget = faceTo(t, bx, bz);
    }
    return taker;
  }

  if (sp.type === 'goalkick') {
    taker = T.gk() || tAct[0];
    taker.spTarget = faceTo({ x: bx - T.dir * 1.6, z: bz }, 0, 0);
    for (const p of tAct) {
      if (p === taker) continue;
      const t = formationSpot(T, p, 0.12, true);
      if (p.role === 'CB') t.x = T.wx(0.12);
      clampPitch(t, 1);
      p.spTarget = faceTo(t, bx, bz);
    }
    for (const p of dAct) {
      const t = formationSpot(D, p, 0.85, false);
      // fora da área adversária
      const ax = Math.abs(t.x - T.ownGoalX);
      if (ax < P.boxD + 1 && Math.abs(t.z) < P.boxW / 2 + 1) t.x = T.ownGoalX + T.dir * (P.boxD + 1.5);
      if (p.isGK) {
        const g = formationSpot(D, p, 0.85, false);
        t.x = g.x;
        t.z = g.z;
      }
      p.spTarget = faceTo(t, bx, bz);
    }
    return taker;
  }

  if (sp.type === 'corner') {
    const gx = D.ownGoalX;
    const sgx = Math.sign(gx);
    const zs = Math.sign(bz);
    taker = sp.taker || bestBy(tAct.filter((p) => !p.isGK), (p) => p.a.pas * 2 + p.a.vis - Math.hypot(p.x - bx, p.z - bz) * 0.004);
    taker.spTarget = faceTo({ x: bx - sgx * 0.4, z: bz + zs * 0.6 }, gx, 0);
    // atacantes na área: os melhores cabeceadores
    const attackers = tAct
      .filter((p) => p !== taker && !p.isGK)
      .sort((a, b) => b.a.hea + b.height * 0.5 - (a.a.hea + a.height * 0.5));
    const spots = [
      { d: 5.5, z: zs * 2.5 }, // primeiro pau
      { d: 6.5, z: -zs * 2.8 }, // segundo pau
      { d: 10.5, z: 0.5 }, // marca do pênalti
      { d: 8.5, z: zs * 0.3 },
      { d: 15.5, z: -zs * 6 }, // rebote
      { d: 17, z: zs * 9 },
    ];
    attackers.forEach((p, i) => {
      if (i < spots.length) p.spTarget = faceTo({ x: gx - sgx * spots[i].d, z: spots[i].z }, bx, bz);
      else {
        // fica atrás para o contra-ataque
        p.spTarget = faceTo({ x: gx - sgx * (36 + i * 4), z: (i % 2 ? 1 : -1) * 10 }, bx, bz);
      }
    });
    // defesa: goleiro, marcação individual e zona no primeiro pau
    const gk = D.gk();
    if (gk) gk.spTarget = faceTo({ x: gx - sgx * 0.8, z: zs * 0.6 }, bx, bz);
    const defs = dAct.filter((p) => p !== gk).sort((a, b) => b.a.hea + b.a.tac - (a.a.hea + a.a.tac));
    const marked = attackers.slice(0, Math.min(5, spots.length));
    defs.forEach((p, i) => {
      if (i < marked.length) {
        const a = marked[i].spTarget;
        p.spTarget = faceTo({ x: a.x + sgx * 0.9, z: a.z + zs * 0.4 }, bx, bz);
        p.mark = marked[i];
      } else if (i === marked.length) {
        p.spTarget = faceTo({ x: gx - sgx * 1.5, z: zs * 4.2 }, bx, bz); // primeiro pau
      } else if (i === marked.length + 1) {
        p.spTarget = faceTo({ x: gx - sgx * 4, z: zs * 9 }, bx, bz);
      } else {
        p.spTarget = faceTo({ x: gx - sgx * (22 + (i % 3) * 6), z: (i % 2 ? -1 : 1) * 8 }, bx, bz);
      }
    });
    return taker;
  }

  if (sp.type === 'freekick') {
    const gx = D.ownGoalX;
    const sgx = Math.sign(gx);
    const dGoal = Math.hypot(gx - bx, bz);
    const ang = Math.abs(Math.atan2(bz, Math.abs(gx - bx)));
    sp.direct = dGoal < 31 && ang < 0.95;
    taker =
      sp.taker ||
      (sp.direct
        ? bestBy(tAct.filter((p) => !p.isGK), (p) => p.a.sho + p.a.pow * 0.5 + p.a.pas * 0.6 + p.a.con * 0.4)
        : bestBy(tAct.filter((p) => !p.isGK || dGoal > 70), (p) => -Math.hypot(p.x - bx, p.z - bz) + p.a.pas * 8));
    const ux = (gx - bx) / dGoal;
    const uz = -bz / dGoal;
    taker.spTarget = faceTo({ x: bx - ux * 1.8, z: bz - uz * 1.8 }, gx, 0);
    const ballU = T.u(bx);
    for (const p of tAct) {
      if (p === taker) continue;
      const t = formationSpot(T, p, ballU, true);
      if (sp.direct || ballU > 0.62) {
        // ataca a área
        if (!p.isGK && p.role !== 'CB' && T.u(t.x) > 0.55) {
          t.x = gx - sgx * (7 + Math.random() * 7);
          t.z = clamp(t.z * 0.45, -13, 13);
        }
      }
      clampPitch(t, 1);
      keepOut(t, bx, bz, 3);
      p.spTarget = faceTo(t, bx, bz);
    }
    const gk = D.gk();
    sp.wall = [];
    if (sp.direct) {
      // barreira: 2 a 5 jogadores a 9,15 m, cobrindo o canto do lado da bola
      const n = dGoal < 20 ? 5 : dGoal < 25 ? 4 : 3 - (ang > 0.6 ? 1 : 0);
      const wallers = dAct
        .filter((p) => p !== gk)
        .sort((a, b) => Math.hypot(a.x - bx, a.z - bz) - Math.hypot(b.x - bx, b.z - bz))
        .slice(0, n);
      // ponto de mira da barreira: entre o centro e a trave do lado da bola
      const pz = Math.sign(bz || 1) * P.goalW * 0.22;
      const wdx = gx - bx;
      const wdz = pz - bz;
      const wl = Math.hypot(wdx, wdz);
      const wx = bx + (wdx / wl) * DIST;
      const wz = bz + (wdz / wl) * DIST;
      const px = -wdz / wl;
      const pzz = wdx / wl;
      wallers.forEach((p, i) => {
        const o = (i - (n - 1) / 2) * 0.58;
        p.spTarget = faceTo({ x: wx + px * o, z: wz + pzz * o }, bx, bz);
        sp.wall.push(p);
      });
      if (gk) {
        // goleiro cobre o lado sem barreira
        gk.spTarget = faceTo({ x: gx - sgx * 0.6, z: -Math.sign(bz || 1) * 0.9 }, bx, bz);
      }
    }
    for (const p of dAct) {
      if (p.spTarget) continue;
      let t;
      if (p === gk) t = { x: gx - sgx * 1.5, z: clamp(bz * 0.1, -2, 2) };
      else {
        t = formationSpot(D, p, D.u(bx), false);
        if (sp.direct || T.u(bx) > 0.62) {
          // marca dentro da área
          t.x = gx - sgx * (6 + Math.abs(t.z) * 0.15 + (p.slot % 3) * 2.5);
          t.z = clamp(t.z * 0.45, -12, 12);
        }
      }
      keepOut(t, bx, bz, DIST + 0.3);
      clampPitch(t, 0.6);
      p.spTarget = faceTo(t, bx, bz);
    }
    return taker;
  }
  return taker;
}

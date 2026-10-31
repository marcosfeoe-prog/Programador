// Time em campo: formação, escalação, táticas e conversão entre o referencial
// do time (u: 0 = próprio gol → 1 = gol adversário; v: -1 esquerda → +1 direita)
// e o referencial do mundo.
import { PITCH as P } from './constants.js';
import { PlayerEnt } from './player.js';
import { getSquad, POS_LINE } from '../data/clubs.js';
import { clamp } from '../util.js';

// d = posição no bloco defensivo, a = posição com a bola (bola no meio-campo).
export const FORMATIONS = {
  '4-4-2': [
    { role: 'GK', d: [0.03, 0], a: [0.06, 0] },
    { role: 'LB', d: [0.2, -0.64], a: [0.42, -0.84] },
    { role: 'CB', d: [0.17, -0.22], a: [0.28, -0.26] },
    { role: 'CB', d: [0.17, 0.22], a: [0.28, 0.26] },
    { role: 'RB', d: [0.2, 0.64], a: [0.42, 0.84] },
    { role: 'LW', d: [0.36, -0.62], a: [0.62, -0.8] },
    { role: 'CM', d: [0.34, -0.18], a: [0.5, -0.2] },
    { role: 'CM', d: [0.34, 0.18], a: [0.52, 0.2] },
    { role: 'RW', d: [0.36, 0.62], a: [0.62, 0.8] },
    { role: 'ST', d: [0.5, -0.14], a: [0.76, -0.18] },
    { role: 'ST', d: [0.52, 0.14], a: [0.78, 0.16] },
  ],
  '4-3-3': [
    { role: 'GK', d: [0.03, 0], a: [0.06, 0] },
    { role: 'LB', d: [0.2, -0.64], a: [0.44, -0.84] },
    { role: 'CB', d: [0.17, -0.22], a: [0.28, -0.27] },
    { role: 'CB', d: [0.17, 0.22], a: [0.28, 0.27] },
    { role: 'RB', d: [0.2, 0.64], a: [0.44, 0.84] },
    { role: 'DM', d: [0.29, 0], a: [0.42, 0] },
    { role: 'CM', d: [0.37, -0.3], a: [0.56, -0.32] },
    { role: 'CM', d: [0.37, 0.3], a: [0.56, 0.32] },
    { role: 'LW', d: [0.47, -0.6], a: [0.78, -0.76] },
    { role: 'ST', d: [0.52, 0], a: [0.82, 0] },
    { role: 'RW', d: [0.47, 0.6], a: [0.78, 0.76] },
  ],
  '4-2-3-1': [
    { role: 'GK', d: [0.03, 0], a: [0.06, 0] },
    { role: 'LB', d: [0.2, -0.64], a: [0.42, -0.84] },
    { role: 'CB', d: [0.17, -0.22], a: [0.28, -0.26] },
    { role: 'CB', d: [0.17, 0.22], a: [0.28, 0.26] },
    { role: 'RB', d: [0.2, 0.64], a: [0.42, 0.84] },
    { role: 'DM', d: [0.29, -0.16], a: [0.44, -0.18] },
    { role: 'DM', d: [0.29, 0.16], a: [0.44, 0.18] },
    { role: 'LW', d: [0.42, -0.6], a: [0.72, -0.74] },
    { role: 'AM', d: [0.44, 0], a: [0.66, 0] },
    { role: 'RW', d: [0.42, 0.6], a: [0.72, 0.74] },
    { role: 'ST', d: [0.53, 0], a: [0.83, 0] },
  ],
  '3-5-2': [
    { role: 'GK', d: [0.03, 0], a: [0.06, 0] },
    { role: 'CB', d: [0.17, -0.36], a: [0.27, -0.42] },
    { role: 'CB', d: [0.15, 0], a: [0.24, 0] },
    { role: 'CB', d: [0.17, 0.36], a: [0.27, 0.42] },
    { role: 'LB', d: [0.27, -0.76], a: [0.6, -0.86] },
    { role: 'DM', d: [0.3, 0], a: [0.44, 0] },
    { role: 'CM', d: [0.38, -0.3], a: [0.56, -0.3] },
    { role: 'CM', d: [0.38, 0.3], a: [0.56, 0.3] },
    { role: 'RB', d: [0.27, 0.76], a: [0.6, 0.86] },
    { role: 'ST', d: [0.52, -0.14], a: [0.8, -0.16] },
    { role: 'ST', d: [0.52, 0.14], a: [0.8, 0.16] },
  ],
  '5-3-2': [
    { role: 'GK', d: [0.03, 0], a: [0.06, 0] },
    { role: 'LB', d: [0.19, -0.74], a: [0.46, -0.86] },
    { role: 'CB', d: [0.16, -0.34], a: [0.26, -0.4] },
    { role: 'CB', d: [0.14, 0], a: [0.23, 0] },
    { role: 'CB', d: [0.16, 0.34], a: [0.26, 0.4] },
    { role: 'RB', d: [0.19, 0.74], a: [0.46, 0.86] },
    { role: 'CM', d: [0.34, -0.32], a: [0.52, -0.34] },
    { role: 'DM', d: [0.31, 0], a: [0.46, 0] },
    { role: 'CM', d: [0.34, 0.32], a: [0.52, 0.34] },
    { role: 'ST', d: [0.5, -0.14], a: [0.78, -0.16] },
    { role: 'ST', d: [0.5, 0.14], a: [0.78, 0.16] },
  ],
  '4-1-4-1': [
    { role: 'GK', d: [0.03, 0], a: [0.06, 0] },
    { role: 'LB', d: [0.2, -0.64], a: [0.42, -0.84] },
    { role: 'CB', d: [0.17, -0.22], a: [0.28, -0.26] },
    { role: 'CB', d: [0.17, 0.22], a: [0.28, 0.26] },
    { role: 'RB', d: [0.2, 0.64], a: [0.42, 0.84] },
    { role: 'DM', d: [0.28, 0], a: [0.42, 0] },
    { role: 'LW', d: [0.38, -0.62], a: [0.68, -0.78] },
    { role: 'CM', d: [0.38, -0.2], a: [0.58, -0.22] },
    { role: 'CM', d: [0.38, 0.2], a: [0.58, 0.22] },
    { role: 'RW', d: [0.38, 0.62], a: [0.68, 0.78] },
    { role: 'ST', d: [0.52, 0], a: [0.83, 0] },
  ],
};
export const FORMATION_KEYS = Object.keys(FORMATIONS);

// Afinidade entre posições (para escalar alguém fora de posição).
const NEAR = {
  GK: { GK: 0 },
  CB: { CB: 0, DM: 6, LB: 7, RB: 7 },
  LB: { LB: 0, RB: 5, LW: 7, CB: 7, DM: 10 },
  RB: { RB: 0, LB: 5, RW: 7, CB: 7, DM: 10 },
  DM: { DM: 0, CM: 3, CB: 7, AM: 9 },
  CM: { CM: 0, DM: 3, AM: 4, LW: 9, RW: 9 },
  AM: { AM: 0, CM: 4, LW: 5, RW: 5, ST: 6 },
  LW: { LW: 0, RW: 3, AM: 5, ST: 7, LB: 9 },
  RW: { RW: 0, LW: 3, AM: 5, ST: 7, RB: 9 },
  ST: { ST: 0, AM: 6, LW: 6, RW: 6 },
};

export function suitability(p, role) {
  const pen = NEAR[role][p.pos];
  if (pen == null) return p.ovr - 25;
  return p.ovr - pen;
}

// Escolhe os 11 titulares e 7 reservas para a formação.
export function pickLineup(clubId, formation, unavailable = new Set()) {
  const squad = getSquad(clubId).filter((p) => !unavailable.has(p.id));
  const slots = FORMATIONS[formation];
  const used = new Set();
  const order = slots.map((s, i) => i).sort((a, b) => (slots[a].role === 'GK' ? -1 : slots[b].role === 'GK' ? 1 : 0));
  const xi = new Array(slots.length);
  for (const i of order) {
    let best = null;
    let bs = -1e9;
    for (const p of squad) {
      if (used.has(p.id)) continue;
      const s = suitability(p, slots[i].role);
      if (s > bs) {
        bs = s;
        best = p;
      }
    }
    used.add(best.id);
    xi[i] = best;
  }
  const rest = squad.filter((p) => !used.has(p.id));
  // banco: 1 goleiro + 6 melhores
  const bench = [];
  const gk = rest.filter((p) => p.pos === 'GK').sort((a, b) => b.ovr - a.ovr)[0];
  if (gk) bench.push(gk);
  for (const p of rest.filter((p) => p !== gk).sort((a, b) => b.ovr - a.ovr)) {
    if (bench.length >= 7) break;
    bench.push(p);
  }
  return { xi, bench };
}

export const MENTALITY = { '-1': 'Defensiva', 0: 'Equilibrada', 1: 'Ofensiva' };

export class Team {
  constructor(side, club, kit, opts = {}) {
    this.side = side; // 0 mandante, 1 visitante
    this.club = club;
    this.kit = kit;
    this.formation = opts.formation || club.formation;
    this.style = club.style;
    this.mentality = opts.mentality || 0;
    this.dir = side === 0 ? 1 : -1; // direção de ataque no 1º tempo
    this.score = 0;
    this.pens = [];
    this.subsLeft = 5;
    this.subWindows = 3;
    this.user = false;
    this.stats = { poss: 0, shots: 0, onTarget: 0, corners: 0, fouls: 0, offsides: 0, yellows: 0, reds: 0, passes: 0, passesOk: 0, saves: 0, xg: 0, tackles: 0 };
    const lu = pickLineup(club.id, this.formation, opts.unavailable);
    this.bench = lu.bench.slice();
    this.used = [];
    const slots = FORMATIONS[this.formation];
    this.players = lu.xi.map((d, i) => {
      const p = new PlayerEnt(this, d, slots[i].role);
      p.slot = i;
      return p;
    });
    this.opp = null;
  }

  get active() {
    return this.players.filter((p) => p.active && !p.sentOff);
  }
  gk() {
    return this.players.find((p) => p.isGK && p.active && !p.sentOff) || null;
  }
  slotDef(i) {
    return FORMATIONS[this.formation][i];
  }

  // Referencial do time → mundo.
  wx(u) {
    return this.dir * (-P.HL + u * P.L);
  }
  wz(v) {
    return this.dir * v * P.HW;
  }
  u(x) {
    return (this.dir * x + P.HL) / P.L;
  }
  v(z) {
    return (this.dir * z) / P.HW;
  }
  get ownGoalX() {
    return -this.dir * P.HL;
  }
  get oppGoalX() {
    return this.dir * P.HL;
  }

  // Substituição: troca o jogador em campo pelo reserva.
  substitute(outP, benchData) {
    if (this.subsLeft <= 0 || !outP.active || outP.sentOff) return null;
    const i = this.bench.indexOf(benchData);
    if (i < 0) return null;
    this.bench.splice(i, 1);
    const np = new PlayerEnt(this, benchData, outP.role);
    np.slot = outP.slot;
    np.isGK = outP.role === 'GK';
    np.place(outP.x, outP.z, outP.face);
    np.stats.minutesFrom = outP.stats.minutesFrom;
    const idx = this.players.indexOf(outP);
    outP.active = false;
    this.used.push(outP);
    this.players[idx] = np;
    this.subsLeft--;
    return np;
  }

  lineOf(p) {
    return POS_LINE[p.role] || 'mid';
  }
}

export function clampU(u) {
  return clamp(u, 0.01, 0.99);
}

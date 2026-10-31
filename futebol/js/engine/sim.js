// Simulação rápida (estatística) das partidas que o jogador não joga.
// Gols por Poisson com força de ataque/defesa dos titulares, mando de campo,
// altitude e clima; artilheiros e garçons sorteados pelo perfil dos jogadores.
import { clubStrength, getSquad, club } from '../data/clubs.js';
import { pickLineup } from './team.js';
import { RNG, poisson, clamp } from '../util.js';

const SCORE_W = { ST: 4, LW: 3, RW: 3, AM: 3, CM: 1.4, DM: 0.7, CB: 0.6, LB: 0.5, RB: 0.5, GK: 0.01 };
const ASSIST_W = { AM: 4, LW: 3, RW: 3, CM: 2.5, ST: 2, LB: 1.5, RB: 1.5, DM: 1, CB: 0.4, GK: 0.05 };

function pickScorer(rng, xi, exclude) {
  const list = xi.filter((p) => p !== exclude);
  return rng.weighted(
    list,
    list.map((p) => (SCORE_W[p.pos] || 1) * Math.pow(p.attr.sho / 70, 2.2))
  );
}
function pickAssist(rng, xi, scorer) {
  const list = xi.filter((p) => p !== scorer);
  return rng.weighted(
    list,
    list.map((p) => (ASSIST_W[p.pos] || 1) * Math.pow(p.attr.pas / 70, 2))
  );
}

export function simulateMatch(homeId, awayId, o = {}) {
  const rng = new RNG(o.seed || ((Math.random() * 1e9) | 0));
  const H = clubStrength(homeId);
  const A = clubStrength(awayId);
  const hc = club(homeId);
  const ac = club(awayId);
  const neutral = !!o.neutral;
  const attH = H.att * 0.55 + H.mid * 0.45;
  const attA = A.att * 0.55 + A.mid * 0.45;
  const defH = H.def * 0.6 + H.mid * 0.25 + H.gk * 0.15;
  const defA = A.def * 0.6 + A.mid * 0.25 + A.gk * 0.15;
  let lh = 1.17 * Math.exp(0.065 * (attH - defA)) * (neutral ? 1.04 : 1.16);
  let la = 1.17 * Math.exp(0.065 * (attA - defH)) * (neutral ? 1.04 : 0.9);
  // altitude castiga o visitante acostumado ao nível do mar
  if (!neutral && hc.altitude > 1800 && ac.altitude < 1200) {
    lh *= 1.12;
    la *= 0.88;
  }
  const w = o.weather || 'sol';
  const wf = { chuva: 1.04, tempestade: 1.08, neve: 0.85, neblina: 0.93, vento: 1.02, calor: 0.94 }[w] || 1;
  lh *= wf;
  la *= wf;
  let hg = poisson(lh, () => rng.next());
  let ag = poisson(la, () => rng.next());
  let et = false;
  if (o.knockout && hg === ag) {
    et = true;
    hg += poisson(lh * 0.3, () => rng.next());
    ag += poisson(la * 0.3, () => rng.next());
  }
  let pens = null;
  if (o.knockout && hg === ag) {
    const pk = (s) => 0.68 + (s.att - 70) * 0.004;
    const ph = pk(H);
    const pa = pk(A);
    let sh = 0;
    let sa = 0;
    let i = 0;
    for (; i < 5; i++) {
      if (rng.chance(ph)) sh++;
      if (rng.chance(pa)) sa++;
    }
    while (sh === sa && i < 30) {
      if (rng.chance(ph)) sh++;
      if (rng.chance(pa)) sa++;
      i++;
    }
    if (sh === sa) sh++;
    pens = [sh, sa];
  }
  const maxMin = et ? 120 : 90;
  const lu = [pickLineup(homeId, hc.formation).xi, pickLineup(awayId, ac.formation).xi];
  const goals = [];
  const mk = (team, n) => {
    for (let i = 0; i < n; i++) {
      const xi = lu[team];
      const r = rng.next();
      let scorer;
      let own = false;
      let pen = false;
      if (r < 0.04) {
        own = true;
        scorer = pickScorer(rng, lu[1 - team].filter((p) => p.pos !== 'ST'));
      } else scorer = pickScorer(rng, xi);
      if (!own && rng.chance(0.1)) pen = true;
      const assist = own || pen || rng.chance(0.25) ? null : pickAssist(rng, xi, scorer);
      const minNum = Math.min(maxMin, 1 + Math.floor(rng.next() * maxMin));
      goals.push({ team, minNum, min: String(minNum), player: scorer.id, name: scorer.shirt, own, pen, assist: assist ? assist.shirt : null });
    }
  };
  mk(0, hg);
  mk(1, ag);
  goals.sort((a, b) => a.minNum - b.minNum);
  const cards = [];
  for (const t of [0, 1]) {
    const ny = poisson(1.7, () => rng.next());
    for (let i = 0; i < ny; i++) {
      const p = rng.pick(lu[t].filter((q) => q.pos !== 'GK'));
      cards.push({ team: t, player: p.id, name: p.shirt, kind: 'yellow', min: String(rng.int(5, 90)) });
    }
    if (rng.chance(0.04)) {
      const p = rng.pick(lu[t].filter((q) => q.pos !== 'GK'));
      cards.push({ team: t, player: p.id, name: p.shirt, kind: 'red', min: String(rng.int(20, 90)) });
    }
  }
  const possH = clamp(Math.round(50 + (H.mid - A.mid) * 1.3 + (neutral ? 0 : 2) + rng.gauss(0, 4)), 28, 72);
  const st = (g, l, poss) => {
    const shots = Math.max(g, Math.round(l * 6 + rng.gauss(0, 2.5)));
    const onTarget = clamp(Math.round(shots * 0.36 + g * 0.5), g, shots);
    const passes = Math.round(320 + poss * 5 + rng.gauss(0, 40));
    return { possPct: poss, shots, onTarget, corners: Math.max(0, Math.round(l * 3 + rng.gauss(0, 1.5))), fouls: Math.max(2, Math.round(12 + rng.gauss(0, 3))), offsides: Math.max(0, Math.round(1.8 + rng.gauss(0, 1.2))), yellows: 0, reds: 0, passes, passPct: clamp(Math.round(74 + (poss - 50) * 0.35 + rng.gauss(0, 3)), 60, 92), saves: 0, xg: Math.round(l * 100) / 100 };
  };
  const stats = [st(hg, lh, possH), st(ag, la, 100 - possH)];
  for (const c of cards) stats[c.team][c.kind === 'red' ? 'reds' : 'yellows']++;
  stats[0].saves = Math.max(0, stats[1].onTarget - ag);
  stats[1].saves = Math.max(0, stats[0].onTarget - hg);
  let winner = null;
  if (hg !== ag) winner = hg > ag ? 0 : 1;
  else if (pens) winner = pens[0] > pens[1] ? 0 : 1;
  return { home: homeId, away: awayId, hg, ag, pens, et, winner, goals, cards, stats, weather: w, simulated: true };
}

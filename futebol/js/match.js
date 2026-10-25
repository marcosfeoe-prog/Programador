// Simulação de partidas: placar, autores, cartões, lesões, notas e estatísticas.
import { rng, clamp, uid } from './rng.js';
import { W, P, T, teamStrength, emptySeasonStats } from './world.js';
import { GOAL_WEIGHT, ASSIST_WEIGHT } from './data.js';
import { INJURIES } from './news.js';
import { g } from './text.js';

const GOAL_DESCS = [
  ['completou para o fundo da rede', 40], ['empurrou para o gol vazio', 30], ['bateu cruzado, sem chances para o goleiro', 40], ['subiu mais alto que a zaga e cabeceou firme', 35],
  ['finalizou de primeira dentro da área', 35], ['tocou com categoria na saída do goleiro', 25], ['aproveitou o rebote', 25], ['bateu colocado no canto', 30], ['chutou forte, no alto', 25],
];
const GOLAZO_DESCS = [
  ['acertou um chute espetacular de fora da área, no ângulo', 86], ['marcou um golaço de bicicleta', 97], ['cobrou falta com perfeição, na gaveta', 88], ['driblou três marcadores e o goleiro antes de tocar para o gol', 95],
  ['acertou um voleio indefensável', 91], ['encobriu o goleiro com uma cavadinha do meio-campo', 96], ['fez um gol olímpico', 94], ['emendou de letra após cruzamento', 90], ['mandou uma bomba de 35 metros', 89], ['deu uma caneta no zagueiro e finalizou no ângulo', 92],
];

function stat(p, compId) {
  if (!p.season) p.season = emptySeasonStats();
  if (!p.season.comp[compId]) p.season.comp[compId] = { gp: 0, g: 0, a: 0, rt: 0, cs: 0 };
  return p.season.comp[compId];
}

function lineup(team) {
  return team.squad.map(P).filter((p) => p && !p.injury && p.suspended <= 0);
}

function pickScorer(players) {
  return rng.weighted(players, (p) => {
    const w = GOAL_WEIGHT[p.pos] * Math.pow(Math.max(30, p.attrs.sho) / 70, 3) * (p.minutesFactor ?? 1);
    return p.isUser ? w * 1.15 : w;
  });
}
function pickAssist(players, scorer) {
  const pool = players.filter((p) => p !== scorer);
  return rng.weighted(pool, (p) => ASSIST_WEIGHT[p.pos] * Math.pow(Math.max(30, p.attrs.pas) / 70, 2) * (p.minutesFactor ?? 1));
}

export function capacityOf(t) {
  return clamp(Math.round((18000 + t.fans * 1400) / 1000) * 1000, 12000, 92000);
}

export function simulateMatch(homeId, awayId, ctx) {
  const H = T(homeId);
  const A = T(awayId);
  const sH = teamStrength(H) + (ctx.neutral ? 0 : 1.6);
  const sA = teamStrength(A);
  const diff = sH - sA;
  const lamH = clamp((ctx.neutral ? 1.3 : 1.45) * Math.exp(diff * 0.075), 0.2, 4.2);
  const lamA = clamp((ctx.neutral ? 1.3 : 1.12) * Math.exp(-diff * 0.075), 0.2, 4.2);
  let hg = rng.poisson(lamH);
  let ag = rng.poisson(lamA);
  const m = {
    id: uid('m'),
    compId: ctx.compId,
    compName: ctx.compName,
    leagueId: ctx.leagueId || null,
    round: ctx.round,
    stage: ctx.stage || null,
    season: W.season,
    week: W.week,
    home: homeId,
    away: awayId,
    hg: 0,
    ag: 0,
    events: [],
    ratings: {},
    motm: null,
    att: Math.round(capacityOf(ctx.neutral ? (sH > sA ? H : A) : H) * rng.float(0.72, 1)),
    stadium: ctx.neutral ? ctx.venue || 'Estádio Neutro' : H.stadium,
    pens: null,
    upset: false,
  };
  const sides = { h: { team: H, players: lineup(H), goals: hg }, a: { team: A, players: lineup(A), goals: ag } };
  // minutos: titulares jogam 90'; reservas (ex.: o protagonista no banco) podem entrar no 2º tempo
  for (const k of ['h', 'a']) {
    for (const p of sides[k].players) {
      p.minutesFactor = 1;
      p._min = 90;
    }
    for (const id of sides[k].team.bench || []) {
      const p = P(id);
      if (!p || p.injury || p.suspended > 0) continue;
      if (rng.chance(p.isUser ? 0.6 : 0.3)) {
        p._min = rng.int(12, 35);
        p.minutesFactor = p._min / 90;
        const same = sides[k].players.find((x) => x.pos === p.pos && x.minutesFactor === 1);
        if (same) {
          same._min = 90 - p._min;
          same.minutesFactor = same._min / 90;
        }
        sides[k].players.push(p);
      }
    }
  }
  const perf = {}; // id -> {g,a,yc,rc}
  const P0 = (p) => (perf[p.id] ||= { g: 0, a: 0, yc: 0, rc: 0, og: 0 });
  const events = [];
  for (const k of ['h', 'a']) {
    const s = sides[k];
    for (let i = 0; i < s.goals; i++) {
      const min = rng.int(1, 94);
      const r = rng.next();
      if (r < 0.03) {
        const opp = sides[k === 'h' ? 'a' : 'h'].players;
        const victim = rng.pick(opp.filter((p) => p.pos !== 'ATA')) || rng.pick(opp);
        events.push({ min, type: 'goal', team: k, p: victim.id, own: true });
        P0(victim).og++;
        continue;
      }
      const scorer = pickScorer(s.players);
      const pen = r < 0.12;
      let assist = null;
      let desc = '';
      let golazo = 0;
      if (!pen) {
        if (rng.chance(0.72)) assist = pickAssist(s.players, scorer);
        const gz = rng.chance(0.06 + (scorer.attrs.sho + scorer.attrs.dri - 140) / 900);
        if (gz) {
          const [d, b] = rng.pick(GOLAZO_DESCS);
          desc = d;
          golazo = clamp(Math.round(b + rng.gauss(0, 3) + (scorer.fame - 50) / 25), 70, 100);
          if (d.includes('falta') || d.includes('olímpico')) assist = null;
        } else desc = rng.weighted(GOAL_DESCS)[0];
      }
      events.push({ min, type: 'goal', team: k, p: scorer.id, assist: assist?.id || null, pen, desc, golazo });
      P0(scorer).g++;
      if (assist) P0(assist).a++;
    }
    // cartões
    const ycs = rng.poisson(1.7);
    for (let i = 0; i < ycs; i++) {
      const p = rng.weighted(s.players, (x) => (['ZAG', 'VOL', 'LD', 'LE'].includes(x.pos) ? 2 : 1) * (x.traits.includes('temperamental') ? 2 : 1));
      if (!p) continue;
      events.push({ min: rng.int(5, 92), type: 'yc', team: k, p: p.id });
      P0(p).yc++;
    }
    const redP = s.players.some((x) => x.traits.includes('temperamental')) ? 0.07 : 0.035;
    if (rng.chance(redP)) {
      const p = rng.weighted(s.players, (x) => (x.traits.includes('temperamental') ? 4 : 1) * (x.pos === 'GOL' ? 0.2 : 1));
      if (p) {
        events.push({ min: rng.int(20, 90), type: 'rc', team: k, p: p.id });
        P0(p).rc++;
      }
    }
    // lesão
    if (rng.chance(0.075)) {
      const p = rng.pick(s.players);
      if (p) {
        const [desc, a, b] = rng.weighted(INJURIES.map((x, i) => [x, i === 3 || i === 8 ? 0.4 : 1]))[0];
        events.push({ min: rng.int(10, 88), type: 'inj', team: k, p: p.id, desc, weeks: rng.int(a, b) });
      }
    }
  }
  events.sort((x, y) => x.min - y.min);
  m.events = events;
  m.hg = hg;
  m.ag = ag;
  // pênaltis em mata-mata
  if (ctx.knockout && hg === ag) {
    const ph = 0.5 + (sH - sA) / 60;
    const hw = rng.chance(clamp(ph, 0.3, 0.7));
    let a = rng.int(3, 5);
    let b = a - rng.int(1, 2);
    if (rng.chance(0.25)) {
      a = rng.int(5, 8);
      b = a - 1;
    }
    m.pens = { h: hw ? a : b, a: hw ? b : a, winner: hw ? homeId : awayId };
  }
  const wH = hg > ag || (m.pens && m.pens.winner === homeId);
  const wA = ag > hg || (m.pens && m.pens.winner === awayId);
  m.upset = (hg !== ag && (hg > ag ? sH < sA - 3.5 : sA < sH - 3.5)) || false;
  // notas e estatísticas
  let best = null;
  for (const k of ['h', 'a']) {
    const s = sides[k];
    const ga = k === 'h' ? ag : hg;
    const won = k === 'h' ? hg > ag : ag > hg;
    const lost = k === 'h' ? hg < ag : ag < hg;
    for (const p of s.players) {
      const pf = perf[p.id] || { g: 0, a: 0, yc: 0, rc: 0, og: 0 };
      const def = ['GOL', 'ZAG', 'LD', 'LE', 'VOL'].includes(p.pos);
      let r = 6.25 + rng.gauss(0, 0.45) + (p.ovr - 75) / 28 + p.form * 0.05;
      r += won ? 0.35 : lost ? -0.3 : 0;
      r += pf.g * 0.95 + pf.a * 0.55 - pf.rc * 1.6 - pf.og * 0.8 - pf.yc * 0.1;
      if (def) r += ga === 0 ? (p.pos === 'GOL' ? 0.7 : 0.45) : -ga * (p.pos === 'GOL' ? 0.22 : 0.13);
      if (p.pos === 'GOL' && ga <= 1 && rng.chance(0.25)) r += 0.5; // defesas difíceis
      if (p._min < 90) r = 6 + (r - 6) * (0.5 + p._min / 180);
      r = clamp(Math.round(r * 10) / 10, 3, 10);
      m.ratings[p.id] = r;
      if (!best || r > m.ratings[best.id]) best = p;
      // estatísticas
      for (const st of [p.season, stat(p, ctx.compId), p.month]) {
        st.gp++;
        st.g += pf.g;
        st.a += pf.a;
        st.rt += r;
        if (def && ga === 0) st.cs = (st.cs || 0) + 1;
      }
      p.season.min += p._min;
      p.season.yc += pf.yc;
      p.season.rc += pf.rc;
      p.career.gp++;
      p.career.g += pf.g;
      p.career.a += pf.a;
      if (pf.rc) p.suspended = Math.max(p.suspended, 1 + (rng.chance(0.3) ? 1 : 0));
      if (pf.yc && p.season.yc % 3 === 0) p.suspended = Math.max(p.suspended, 1);
      // forma, moral e fama
      p.form = clamp(p.form * 0.55 + (r - 6.6) * 1.3, -5, 5);
      p.morale = clamp(p.morale + (won ? 2 : lost ? -2 : 0) + (r >= 8 ? 2 : 0), 5, 100);
      p.fame = clamp(p.fame + pf.g * 0.35 + (r >= 8.5 ? 0.6 : 0) * (ctx.stars || 3) / 3, 0, 99);
      delete p.minutesFactor;
      delete p._min;
    }
    // resultado no histórico do time
    const res = (k === 'h' ? wH : wA) ? 'V' : (k === 'h' ? wA : wH) ? 'D' : 'E';
    s.team.form = [...(s.team.form || []), res].slice(-6);
  }
  if (best) {
    m.motm = best.id;
    best.season.motm++;
  }
  // lesões aplicadas
  for (const e of events.filter((x) => x.type === 'inj')) {
    const p = P(e.p);
    p.injury = { desc: e.desc, weeks: e.weeks };
    m.injuries = m.injuries || [];
    m.injuries.push(p.id);
  }
  // golaços
  for (const e of events.filter((x) => x.golazo)) {
    W.golazos.push({ season: W.season, week: W.week, playerId: e.p, beauty: e.golazo, desc: g(`${e.desc} contra o {o}`, { o: T(e.team === 'h' ? awayId : homeId).name }), matchId: m.id });
    P(e.p).season.golazos++;
  }
  if (W.golazos.length > 120) W.golazos.sort((a, b) => b.beauty - a.beauty).splice(120);
  // armazena
  W.matches[m.id] = m;
  W.matchOrder.push(m.id);
  if (W.matchOrder.length > 400) {
    const old = W.matchOrder.shift();
    delete W.matches[old];
  }
  return m;
}

export function winnerOf(m) {
  if (m.pens) return m.pens.winner;
  return m.hg > m.ag ? m.home : m.ag > m.hg ? m.away : null;
}

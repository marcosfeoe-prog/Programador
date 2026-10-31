// Modo carreira (temporadas com Série A e B, Copa Nacional e Taça Continental,
// acesso e rebaixamento) e torneios avulsos. Calendário de datas com jogos;
// os jogos dos outros clubes são simulados; o clima de cada jogo depende da
// cidade do mandante e do mês.
import { CLUBS, club } from '../data/clubs.js';
import { makeLeague, applyTable, sortedTable, makeCup, cupRoundDone, cupNextRound, applyCup, makeGroups, groupsDone, makeGroupKnockout } from './competitions.js';
import { simulateMatch } from '../engine/sim.js';
import { randomWeather, randomTime, MONTHS } from '../engine/weather.js';
import { RNG } from '../util.js';

export const SAVE_KEYS = { carreira: 'gramado-carreira-v1', torneio: 'gramado-torneio-v1' };

const byRating = (ids) => ids.slice().sort((a, b) => club(b).rating - club(a).rating);
const nameOf = (id) => club(id).short;

export const TOURNAMENTS = {
  copa: { name: 'Copa Nacional', desc: 'Mata-mata com os 30 clubes. Empate vai para prorrogação e pênaltis.' },
  liga: { name: 'Liga Expressa', desc: 'Pontos corridos em turno único com 16 clubes.' },
  continental: { name: 'Taça Continental', desc: 'Dois grupos de 4 (ida e volta), semifinal e final.' },
  relampago: { name: 'Copa Relâmpago', desc: 'Mata-mata rápido com 8 clubes sorteados.' },
};

function dayStr(year, week, offsetDays) {
  const d = new Date(Date.UTC(year, 1, 1 + week * 7 + offsetDays));
  return { iso: d.toISOString().slice(0, 10), label: `${String(d.getUTCDate()).padStart(2, '0')}/${MONTHS[d.getUTCMonth()]}`, month: d.getUTCMonth() };
}

// ------------------------------------------------------------ criação

export function newCareer({ userClub, difficulty = 'profissional', halfMinutes = 4 }) {
  const seed = (Math.random() * 1e9) | 0;
  const sorted = byRating(CLUBS.map((c) => c.id));
  const car = {
    version: 1,
    mode: 'carreira',
    userClub,
    difficulty,
    halfMinutes,
    year: 2026,
    seed,
    divisions: { A: sorted.slice(0, 16), B: sorted.slice(16) },
    continental: sorted.slice(0, 8),
    history: [],
    trophies: {},
    userHistory: [],
  };
  startSeason(car);
  return car;
}

export function newTournament(kind, { userClub, difficulty = 'profissional', halfMinutes = 4 }) {
  const seed = (Math.random() * 1e9) | 0;
  const rng = new RNG(seed);
  const all = byRating(CLUBS.map((c) => c.id));
  const others = all.filter((id) => id !== userClub);
  const car = { version: 1, mode: 'torneio', kind, userClub, difficulty, halfMinutes, year: 2026, seed, history: [], trophies: {}, userHistory: [] };
  const comps = {};
  const sched = [];
  if (kind === 'copa') {
    comps.copa = makeCup('copa', 'Copa Nacional', all, rng);
    for (let r = 0; r < 5; r++) sched.push({ week: r * 2 + 1, off: 3, comp: 'copa', round: r });
  } else if (kind === 'liga') {
    const teams = byRating([userClub, ...others.slice(0, 15)]);
    comps.liga = makeLeague('liga', 'Liga Expressa', teams, rng, false);
    comps.liga.rounds.forEach((_, r) => sched.push({ week: r + 1, off: 0, comp: 'liga', round: r }));
  } else if (kind === 'continental') {
    const teams = byRating([userClub, ...others.slice(0, 7)]);
    comps.cont = makeGroups('cont', 'Taça Continental', teams, 2, rng);
    for (let r = 0; r < 6; r++) sched.push({ week: r + 1, off: 3, comp: 'cont', round: r });
    sched.push({ week: 8, off: 3, comp: 'cont', round: 6 });
    sched.push({ week: 10, off: 0, comp: 'cont', round: 7 });
  } else {
    const pool = rng.shuffle(others.slice()).slice(0, 7);
    comps.copa = makeCup('copa', 'Copa Relâmpago', byRating([userClub, ...pool]), rng);
    for (let r = 0; r < 3; r++) sched.push({ week: r + 1, off: 3, comp: 'copa', round: r });
  }
  car.season = { comps, calendar: buildCalendar(car, sched, comps, rng), cur: 0, scorers: {}, done: false };
  return car;
}

function startSeason(car) {
  const rng = new RNG(car.seed + car.year * 7);
  const comps = {
    liga_a: makeLeague('liga_a', 'Série A', car.divisions.A, rng),
    liga_b: makeLeague('liga_b', 'Série B', car.divisions.B, rng),
    copa: makeCup('copa', 'Copa Nacional', byRating(CLUBS.map((c) => c.id)), rng),
    cont: makeGroups('cont', 'Taça Continental', byRating(car.continental), 2, rng),
  };
  const sched = [];
  const breaks = new Set([9, 18, 27, 31]);
  const leagueWeeks = [];
  for (let w = 1; leagueWeeks.length < 30; w++) if (!breaks.has(w)) leagueWeeks.push(w);
  for (let r = 0; r < 30; r++) sched.push({ week: leagueWeeks[r], off: 0, comp: 'liga_a', round: r });
  for (let r = 0; r < 26; r++) sched.push({ week: leagueWeeks[Math.round((r * 29) / 25)], off: 0, comp: 'liga_b', round: r });
  [3, 8, 14, 21].forEach((w, r) => sched.push({ week: w, off: 3, comp: 'copa', round: r }));
  sched.push({ week: 27, off: 0, comp: 'copa', round: 4 });
  [5, 7, 11, 13, 16, 19].forEach((w, r) => sched.push({ week: w, off: 3, comp: 'cont', round: r }));
  sched.push({ week: 24, off: 3, comp: 'cont', round: 6 });
  sched.push({ week: 31, off: 0, comp: 'cont', round: 7 });
  car.season = { comps, calendar: buildCalendar(car, sched, comps, rng), cur: 0, scorers: {}, done: false };
}

function buildCalendar(car, sched, comps, rng) {
  const days = new Map();
  for (const s of sched) {
    const d = dayStr(car.year, s.week, s.off);
    if (!days.has(d.iso)) days.set(d.iso, { iso: d.iso, label: d.label, month: d.month, slots: [], fixtures: [] });
    days.get(d.iso).slots.push({ comp: s.comp, round: s.round, made: false });
  }
  const list = [...days.values()].sort((a, b) => a.iso.localeCompare(b.iso));
  // ligas e grupos já têm os jogos definidos
  for (const day of list) for (const sl of day.slots) materializeSlot(car, comps, day, sl, rng, true);
  return list;
}

export function compLabel(car, compId) {
  const c = car.season.comps[compId];
  if (!c) return compId;
  if (car.mode === 'carreira') return { liga_a: 'Série A', liga_b: 'Série B', copa: 'Copa Nacional', cont: 'Taça Continental' }[compId];
  return c.name;
}

function addFixture(car, day, comp, round, h, a, extra, rng) {
  const hc = club(h);
  const weather = randomWeather(hc.climate, day.month, rng, { windy: hc.windy, stormy: hc.stormy });
  day.fixtures.push({ comp, round, h, a, res: null, weather, time: randomTime(rng), seed: rng.int(1, 1e9), ...extra });
}

// Gera os jogos de uma data (copas são sorteadas quando a fase anterior acaba).
function materializeSlot(car, comps, day, sl, rng, initial) {
  if (sl.made) return true;
  const c = comps[sl.comp];
  if (c.type === 'league') {
    for (const [h, a] of c.rounds[sl.round] || []) addFixture(car, day, sl.comp, sl.round, h, a, {}, rng);
    sl.made = true;
    return true;
  }
  if (c.type === 'groups') {
    if (sl.round < 6) {
      c.groups.forEach((g, gi) => {
        for (const [h, a] of g.rounds[sl.round] || []) addFixture(car, day, sl.comp, sl.round, h, a, { group: gi }, rng);
      });
      sl.made = true;
      return true;
    }
    if (initial) return false;
    if (sl.round === 6) {
      if (!groupsDone(c)) return false;
      const r = makeGroupKnockout(c, nameOf);
      r.ties.forEach((t, i) => addFixture(car, day, sl.comp, 6, t.h, t.a, { ko: 0, tie: i, knockout: true }, rng));
      sl.made = true;
      return true;
    }
    if (sl.round === 7) {
      const ko = c.knockout;
      if (!ko || !ko.rounds[0].ties.every((t) => t.winner)) return false;
      if (ko.rounds.length < 2) ko.rounds.push({ name: 'Final', ties: [{ h: ko.rounds[0].ties[0].winner, a: ko.rounds[0].ties[1].winner, res: null, winner: null }] });
      const t = ko.rounds[1].ties[0];
      addFixture(car, day, sl.comp, 7, t.h, t.a, { ko: 1, tie: 0, knockout: true, final: true }, rng);
      sl.made = true;
      return true;
    }
  }
  if (c.type === 'cup') {
    if (initial && sl.round > 0) return false;
    if (sl.round > 0) {
      if (c.rounds.length <= sl.round) {
        if (!cupRoundDone(c)) return false;
        cupNextRound(c, rng);
      }
    }
    const r = c.rounds[sl.round];
    if (!r) return false;
    r.ties.forEach((t, i) => addFixture(car, day, sl.comp, sl.round, t.h, t.a, { tie: i, knockout: true, final: r.name === 'Final' }, rng));
    sl.made = true;
    return true;
  }
  return false;
}

// ------------------------------------------------------------ andamento

export function currentDay(car) {
  return car.season.calendar[car.season.cur] || null;
}

export function prepareDay(car) {
  const day = currentDay(car);
  if (!day) return null;
  const rng = new RNG(car.seed + car.season.cur * 131 + car.year);
  for (const sl of day.slots) materializeSlot(car, car.season.comps, day, sl, rng, false);
  return day;
}

export function userFixture(car, day) {
  if (!day) return null;
  return day.fixtures.find((f) => f.h === car.userClub || f.a === car.userClub) || null;
}

export function isKnockout(fx) {
  return !!fx.knockout;
}

export function simulateFixture(car, fx) {
  const res = simulateMatch(fx.h, fx.a, { seed: fx.seed, knockout: isKnockout(fx), weather: fx.weather, neutral: false });
  recordResult(car, fx, res);
  return res;
}

export function recordResult(car, fx, res) {
  fx.res = {
    hg: res.hg,
    ag: res.ag,
    pens: res.pens,
    winner: res.winner,
    goals: res.goals.map((g) => ({ team: g.team, min: g.min, name: g.name, own: g.own, pen: g.pen })),
    simulated: !!res.simulated,
  };
  const c = car.season.comps[fx.comp];
  if (c.type === 'league') applyTable(c.table, res);
  else if (c.type === 'cup') applyCup(c, fx.round, fx.tie, res);
  else if (c.type === 'groups') {
    if (fx.group != null) applyTable(c.groups[fx.group].table, res);
    else {
      const t = c.knockout.rounds[fx.ko].ties[fx.tie];
      t.res = { hg: res.hg, ag: res.ag, pens: res.pens };
      t.winner = res.winner === 0 ? t.h : t.a;
      if (fx.final) c.champion = t.winner;
    }
  }
  // artilharia
  const sc = car.season.scorers;
  for (const g of res.goals) {
    if (g.own || !g.player) continue;
    const cid = g.team === 0 ? fx.h : fx.a;
    const e = sc[g.player] || (sc[g.player] = { name: g.name, club: cid, total: 0, comp: {} });
    e.total++;
    e.comp[fx.comp] = (e.comp[fx.comp] || 0) + 1;
  }
  if (fx.h === car.userClub || fx.a === car.userClub) {
    const home = fx.h === car.userClub;
    const gf = home ? res.hg : res.ag;
    const ga = home ? res.ag : res.hg;
    car.userHistory.push({ year: car.year, comp: fx.comp, opp: home ? fx.a : fx.h, home, gf, ga, pens: res.pens, won: res.winner == null ? null : (res.winner === 0) === home });
  }
}

// Simula todos os jogos sem resultado da data (menos o do usuário, se pedido).
export function simulateDay(car, day, skipUser = true) {
  for (const fx of day.fixtures) {
    if (fx.res) continue;
    if (skipUser && (fx.h === car.userClub || fx.a === car.userClub)) continue;
    simulateFixture(car, fx);
  }
}

// Avança o calendário até o próximo jogo do usuário (simulando o resto).
// Retorna a partida do usuário ou null se a temporada acabou.
export function advanceToUserMatch(car) {
  for (let guard = 0; guard < 400; guard++) {
    const day = prepareDay(car);
    if (!day) {
      finishSeason(car);
      return null;
    }
    const uf = userFixture(car, day);
    if (uf && !uf.res) return uf;
    simulateDay(car, day, false);
    // datas cujas copas ainda não puderam ser sorteadas: tenta de novo
    if (day.slots.some((s) => !s.made)) {
      prepareDay(car);
      simulateDay(car, day, false);
    }
    car.season.cur++;
  }
  return null;
}

// Depois do jogo do usuário: simula o resto da data e avança.
export function closeDay(car) {
  const day = currentDay(car);
  if (!day) return;
  simulateDay(car, day, false);
  car.season.cur++;
  if (car.season.cur >= car.season.calendar.length) finishSeason(car);
}

// Próxima data com jogo do usuário (sem avançar) — para o painel.
export function peekUserMatch(car) {
  const cal = car.season.calendar;
  for (let i = car.season.cur; i < cal.length; i++) {
    const f = userFixture(car, cal[i]);
    if (f && !f.res) return { day: cal[i], fx: f };
    // copa ainda não sorteada nesta data
    if (cal[i].slots.some((s) => !s.made && car.season.comps[s.comp])) {
      const c = car.season.comps[cal[i].slots.find((s) => !s.made).comp];
      if (stillAlive(car, c)) return { day: cal[i], fx: null, pendingDraw: true };
    }
  }
  return null;
}

export function stillAlive(car, c) {
  const u = car.userClub;
  if (c.type === 'cup') {
    if (c.champion) return false;
    const last = c.rounds[c.rounds.length - 1];
    const inLast = last.ties.some((t) => (t.h === u || t.a === u) && (!t.winner || t.winner === u));
    const bye = c.rounds.length === 1 && c.byes && c.byes.includes(u);
    return inLast || bye;
  }
  if (c.type === 'groups') {
    if (!c.groups.some((g) => g.teams.includes(u))) return false;
    if (!c.knockout) return true;
    return c.knockout.rounds.some((r) => r.ties.some((t) => (t.h === u || t.a === u) && (!t.winner || t.winner === u))) && !c.champion;
  }
  return true;
}

// ------------------------------------------------------------ fim de temporada

function finishSeason(car) {
  const S = car.season;
  if (S.done) return;
  S.done = true;
  const top = Object.entries(S.scorers).sort((a, b) => b[1].total - a[1].total)[0];
  const summary = { year: car.year, topScorer: top ? { name: top[1].name, club: top[1].club, goals: top[1].total } : null };
  const award = (cid, key) => {
    if (!cid) return;
    const t = car.trophies[cid] || (car.trophies[cid] = {});
    t[key] = (t[key] || 0) + 1;
  };
  if (car.mode === 'carreira') {
    const A = sortedTable(S.comps.liga_a.table, nameOf).map((r) => r.id);
    const B = sortedTable(S.comps.liga_b.table, nameOf).map((r) => r.id);
    summary.champA = A[0];
    summary.champB = B[0];
    summary.copa = S.comps.copa.champion;
    summary.cont = S.comps.cont.champion;
    summary.relegated = A.slice(-3);
    summary.promoted = B.slice(0, 3);
    summary.userPos = A.includes(car.userClub) ? { div: 'A', pos: A.indexOf(car.userClub) + 1 } : { div: 'B', pos: B.indexOf(car.userClub) + 1 };
    award(summary.champA, 'Série A');
    award(summary.champB, 'Série B');
    award(summary.copa, 'Copa Nacional');
    award(summary.cont, 'Taça Continental');
    // próxima Taça Continental: 7 primeiros da Série A + campeão da Copa
    const cont = A.slice(0, 7);
    if (summary.copa && !cont.includes(summary.copa)) cont.push(summary.copa);
    for (const id of A) if (cont.length < 8 && !cont.includes(id)) cont.push(id);
    car.continental = cont;
    car.divisions = { A: A.slice(0, 13).concat(summary.promoted), B: summary.relegated.concat(B.slice(3)) };
  } else {
    const c = Object.values(S.comps)[0];
    if (c.type === 'league') summary.champion = sortedTable(c.table, nameOf)[0].id;
    else summary.champion = c.champion;
    summary.compName = c.name;
    award(summary.champion, c.name);
  }
  car.history.push(summary);
  car.lastSummary = summary;
}

export function startNextSeason(car) {
  if (car.mode !== 'carreira') return;
  car.year++;
  startSeason(car);
  car.lastSummary = null;
}

// ------------------------------------------------------------ consultas

export function userComps(car) {
  const out = [];
  for (const [id, c] of Object.entries(car.season.comps)) {
    if (c.type === 'league' && c.teams.includes(car.userClub)) out.push(id);
    else if (c.type === 'cup') out.push(id);
    else if (c.type === 'groups' && c.groups.some((g) => g.teams.includes(car.userClub))) out.push(id);
  }
  return out;
}

export function topScorers(car, compId = null, n = 10) {
  return Object.entries(car.season.scorers)
    .map(([id, e]) => ({ id, ...e, goals: compId ? e.comp[compId] || 0 : e.total }))
    .filter((e) => e.goals > 0)
    .sort((a, b) => b.goals - a.goals || a.name.localeCompare(b.name))
    .slice(0, n);
}

export function saveCareer(car) {
  try {
    localStorage.setItem(SAVE_KEYS[car.mode], JSON.stringify(car));
    return true;
  } catch (e) {
    return false;
  }
}

export function loadCareer(mode) {
  try {
    const s = localStorage.getItem(SAVE_KEYS[mode]);
    if (!s) return null;
    const car = JSON.parse(s);
    if (!car || car.version !== 1 || !car.season || !club(car.userClub)) return null;
    return car;
  } catch (e) {
    return null;
  }
}

export function deleteCareer(mode) {
  try {
    localStorage.removeItem(SAVE_KEYS[mode]);
  } catch (e) {
    /* ignorado */
  }
}

export { sortedTable, nameOf };

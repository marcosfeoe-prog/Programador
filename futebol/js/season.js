// Ciclo de temporada: semanas, rodadas, prêmios, mercado, envelhecimento e eventos.
import { rng, clamp } from './rng.js';
import { W, P, T, LG, makePlayer, calcOvr, teamAvg, emptySeasonStats, marketValue, makeCoach, seasonRating, allActivePlayers, ATTR_KEYS } from './world.js';
import { LEAGUE_NATION_MIX } from './data.js';
import { roundRobin, leagueTable, CS_WEEKS, copaQualifiers, setupCopa, playTournamentRound, setupTournament, tournamentTable } from './tournaments.js';
import { simulateMatch } from './match.js';
import * as N from './news.js';
import { awardInstances, rankAward, grantAward, ballonRace } from './awards.js';
import * as Career from './career.js';
import { monthOfWeek, seasonLabel } from './text.js';

export const SEASON_WEEKS = 20;

export function weekLabel(week = W.week) {
  if (week === 0) return 'Pré-temporada';
  if (week <= 18) return `Rodada ${week}`;
  if (week === 19) return 'Final da Copa Suprema';
  return 'Gala de premiação';
}

export function startSeason() {
  for (const L of W.leagues) L.fixtures = roundRobin(rng.shuffle(L.teamIds), true);
  setupCopa(copaQualifiers(W.lastTables));
  for (const t of W.tournaments) {
    if (!t.builtIn && t.done && t.recurring) {
      t.edition++;
      setupTournament(t);
    }
  }
  N.newsSeasonStart();
}

function titlePoints(stars, kind) {
  return kind === 'copa' ? 20 : stars * 2.6;
}

function crown(team, compName, stars, kind, extra = {}) {
  team.titles.push({ season: W.season, comp: compName, stars, kind });
  W.history.push({ season: W.season, comp: compName, teamId: team.id, stars, kind });
  for (const id of [...team.squad, ...(team.bench || [])]) {
    const p = P(id);
    if (!p || !p.season.gp) continue;
    p.trophies.push({ season: W.season, name: compName, stars, kind });
    p.season.titlePts = (p.season.titlePts || 0) + titlePoints(stars, kind);
    p.legacy += stars * 4;
    p.morale = clamp(p.morale + 10, 0, 100);
    p.fame = clamp(p.fame + stars, 0, 99);
  }
  N.newsChampion(compName, team, { stars, ...extra });
}

function topScorerOf(compId, teamIds) {
  let best = null;
  for (const id of teamIds) {
    for (const pid of [...T(id).squad, ...(T(id).bench || [])]) {
      const p = P(pid);
      const g = p?.season.comp[compId]?.g || 0;
      if (!best || g > best.g) best = { name: p.name, g, id: p.id };
    }
  }
  return best;
}

function giveAward(award, inst, extra = {}) {
  const rank = rankAward(award, inst, 5);
  if (!rank.length) return null;
  const winner = rank[0];
  const entry = grantAward(award, inst, winner.p, { note: winner.note || extra.note, period: extra.period });
  const isUser = winner.p.id === W.protagonistId;
  if (award.period === 'round') {
    if (isUser) N.newsAward(entry, award, rank);
  } else if (award.period === 'month') {
    if (isUser || rng.chance(0.4)) N.newsAward(entry, award, rank);
  } else if (award.stars >= 2 || isUser) N.newsAward(entry, award, rank);
  return entry;
}

function featuredMatch(matches) {
  const user = W.protagonistId && P(W.protagonistId);
  let best = null;
  let bestScore = -1;
  for (const m of matches) {
    let s = (teamAvg(T(m.home)) + teamAvg(T(m.away))) / 20 + (m.hg + m.ag) * 0.4 + (m.upset ? 4 : 0) + Math.abs(m.hg - m.ag) * 0.2;
    if (m.events.some((e) => e.golazo)) s += 1.5;
    if (user && m.ratings[user.id] !== undefined) s += 100;
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return best;
}

// ---------- semana ----------
export function advanceWeek() {
  if (W.week === 0) startSeason();
  W.week++;
  W.absWeek = (W.absWeek || 0) + 1;
  const user = W.protagonistId && P(W.protagonistId);
  // recuperação
  for (const p of allActivePlayers()) {
    if (p.injury) {
      p.injury.weeks--;
      if (p.injury.weeks <= 0) p.injury = null;
    }
    if (p.suspended > 0) p.suspended--;
    p.fame = clamp(p.fame * 0.997 + (p.ovr - 60) * 0.006, 0, 99);
  }
  Career.onWeekStart();
  const allMatches = [];
  // liga
  if (W.week <= 18) {
    for (const L of W.leagues) {
      const rd = L.fixtures[W.week - 1];
      if (!rd) continue;
      const ms = [];
      for (const gm of rd) {
        const m = simulateMatch(gm.h, gm.a, { compId: L.id, compName: L.name, leagueId: L.id, round: W.week, stars: L.stars });
        gm.hg = m.hg;
        gm.ag = m.ag;
        gm.mid = m.id;
        ms.push(m);
      }
      allMatches.push(...ms);
      const table = leagueTable(L);
      const fm = featuredMatch(ms);
      if (fm) N.newsMatch(fm, { table: `Com o resultado, ${T(table.findIndex((r) => r.teamId === fm.home) < table.findIndex((r) => r.teamId === fm.away) ? fm.home : fm.away).name} fica à frente na tabela.` });
      N.newsRoundSummary(L, W.week, ms, table);
      // craque da rodada
      const crd = W.awards.find((a) => a.id === 'craque-rodada');
      if (crd) {
        let best = null;
        for (const m of ms) for (const [pid, r] of Object.entries(m.ratings)) if (!best || r > best.r) best = { pid, r };
        if (best) {
          const p = P(best.pid);
          const entry = grantAward(crd, { label: `Craque da Rodada — ${L.name}`, leagueId: L.id }, p, { note: `nota ${best.r.toFixed(1)} na ${W.week}ª rodada` });
          if (p.id === W.protagonistId) N.newsAward(entry, crd, [{ p }]);
        }
      }
      if (W.week === 18) {
        const champ = T(table[0].teamId);
        crown(champ, L.name, L.stars, 'liga', { leagueId: L.id, topScorer: topScorerOf(L.id, L.teamIds), record: `com ${table[0].pts} pontos` });
      }
    }
  }
  // Copa Suprema
  const cs = W.tournaments.find((t) => t.id === 'CS');
  if (cs && CS_WEEKS[W.week] && !cs.done) {
    const { matches, finished } = playTournamentRound(cs);
    allMatches.push(...matches);
    matches.forEach((m) => {
      m.stage = CS_WEEKS[W.week];
    });
    const fm = featuredMatch(matches);
    if (fm) N.newsMatch(fm, { importance: W.week === 19 ? 5 : 3 });
    if (matches.length > 1) {
      N.pushNews({
        cat: 'torneio', title: `Copa Suprema: os resultados das ${CS_WEEKS[W.week].toLowerCase()}`, lede: 'Copa Suprema dos Campeões ★★★★★',
        body: [matches.map((m) => `${T(m.home).name} ${m.hg} x ${m.ag} ${T(m.away).name}${m.pens ? ` (pên. ${m.pens.h}-${m.pens.a})` : ''}`).join(' • ')],
        teams: matches.map((m) => m.home).slice(0, 4), img: { type: 'trophy', stars: 5 }, importance: 2,
      });
    }
    if (finished) {
      const champ = T(cs.champion);
      crown(champ, cs.name, 5, 'copa', { final: cs.final, topScorer: topScorerOf('CS', cs.teamIds) });
      cs.history.push({ season: W.season, champion: cs.champion, final: cs.final });
    }
  }
  // torneios do usuário
  for (const t of W.tournaments) {
    if (t.builtIn || t.done || (t.startAbs || 0) > W.absWeek) continue;
    const { matches, finished, stage } = playTournamentRound(t);
    allMatches.push(...matches);
    const fm = featuredMatch(matches);
    if (fm && (t.stars >= 3 || (user && fm.ratings[user.id] !== undefined))) N.newsMatch(fm, { importance: t.stars >= 4 ? 3 : 1 });
    if (matches.length > 1 && (t.stars >= 2)) {
      const tab = tournamentTable(t);
      N.pushNews({
        cat: 'torneio', title: `${t.name}: ${stage ? stage.toLowerCase() : `${t.cur}ª rodada`}${tab ? ` — ${T(tab[0].teamId).name} lidera` : ''}`, lede: `${'★'.repeat(t.stars)} ${t.name}`,
        body: [matches.map((m) => `${T(m.home).name} ${m.hg} x ${m.ag} ${T(m.away).name}${m.pens ? ` (pên. ${m.pens.h}-${m.pens.a})` : ''}`).join(' • ')],
        teams: tab ? [tab[0].teamId] : [], img: { type: 'trophy', stars: t.stars }, importance: 1,
      });
    }
    if (finished) {
      const champ = T(t.champion);
      crown(champ, t.name, t.stars, 'torneio', { final: t.final, topScorer: topScorerOf(t.id, t.teamIds) });
      t.history.push({ season: W.season, champion: t.champion, final: t.final });
      // craque do torneio
      const mvp = { id: 'mvp-' + t.id, name: `Craque do ${t.name}`, stars: t.stars, scope: 'comp:' + t.id, criterion: 'composite', period: 'season', prize: t.stars * 0.2, minGames: 1, desc: `Melhor jogador do ${t.name}.` };
      giveAward(mvp, { scopeKey: 'comp:' + t.id, label: mvp.name });
    }
  }
  // carreira — partidas do protagonista
  if (user) for (const m of allMatches) Career.onMatchPlayed(m);
  // lesões geradas nas partidas
  for (const m of allMatches) {
    for (const pid of m.injuries || []) {
      const p = P(pid);
      if (p && (p.ovr >= 78 || p.isUser || p.injury.weeks >= 6) && rng.chance(p.isUser ? 1 : 0.6)) N.newsInjury(p, p.injury);
    }
  }
  // prêmios por rodada/mês definidos pelo usuário + mensais
  if (W.week % 2 === 0 && W.week <= 18) {
    for (const a of W.awards.filter((x) => x.period === 'month')) for (const inst of awardInstances(a)) giveAward(a, { ...inst, label: `${inst.label} (${monthOfWeek(W.week)})` }, { note: monthOfWeek(W.week) });
    for (const p of Object.values(W.players)) p.month = { gp: 0, g: 0, a: 0, rt: 0, cs: 0 };
  }
  for (const a of W.awards.filter((x) => x.period === 'round' && !x.builtIn)) for (const inst of awardInstances(a)) giveAward(a, inst);
  // eventos aleatórios do mundo
  randomEvents();
  if (W.week === 10) transferWindow(3);
  if ([8, 14, 18].includes(W.week)) N.newsColumnBallon(ballonRace(5));
  checkRecords();
  // carreira — eventos e propostas
  if (user) {
    Career.maybeEvent();
    if (W.week === 9 || W.week === 19) Career.generateOffers();
    if (W.week === 11) W.career.offers = [];
    Career.checkGoals();
  }
  if (W.week >= SEASON_WEEKS) endSeason();
}

function randomEvents() {
  const pool = allActivePlayers();
  // polêmicas
  const nCtrl = rng.chance(0.75) ? (rng.chance(0.3) ? 2 : 1) : 0;
  for (let i = 0; i < nCtrl; i++) {
    const p = rng.weighted(pool, (x) => (x.isUser ? 0 : 1) * x.traits.reduce((s, k) => s * ({ temperamental: 2.4, baladeiro: 2.2, marrento: 1.8, midiatico: 1.5, mercenario: 1.4, profissional: 0.3, timido: 0.4 }[k] || 0.8), 1) * (0.3 + x.fame / 60));
    const c = rng.weighted(N.CONTROVERSIES, (c) => c.w(p));
    Career.triggerControversy(p, c);
  }
  // protagonista também pode se envolver em polêmicas por traço
  const u = W.protagonistId && P(W.protagonistId);
  if (u && rng.chance(0.03 * u.traits.reduce((s, k) => s * ({ temperamental: 2.4, baladeiro: 2.2, marrento: 1.8, midiatico: 1.5, mercenario: 1.4, profissional: 0.3, timido: 0.4 }[k] || 0.8), 1))) {
    Career.triggerControversy(u, rng.weighted(N.CONTROVERSIES.filter((c) => c.key !== 'apostas'), (c) => c.w(u)));
  }
  // desfecho de casos em aberto
  for (const p of pool) {
    for (const c of p.controversies) {
      if (c.open && W.absWeek - (c.abs ?? W.absWeek) >= 3 && rng.chance(0.3)) {
        c.open = false;
        const n = N.newsControversyEnd(p, c);
        if (!n.absolved) p.suspended = Math.max(p.suspended, 4);
      }
    }
  }
  // rumor de mercado
  if (rng.chance(0.6)) {
    const target = rng.weighted(pool.filter((p) => p.season.gp >= 2), (p) => Math.pow(Math.max(1, seasonRating(p) - 6), 2) * (p.age < 29 ? 1.5 : 0.5) * (p.isUser ? 3 : 1));
    if (target) {
      const tAvg = teamAvg(T(target.teamId));
      const suitors = Object.values(W.teams).filter((t) => t.leagueId && t.id !== target.teamId && teamAvg(t) > tAvg + 1);
      if (suitors.length) N.newsRumor(target, rng.pick(suitors));
    }
  }
  // demissão de técnico
  for (const L of W.leagues) {
    if (W.week < 5 || W.week > 17) continue;
    for (const id of L.teamIds) {
      const t = T(id);
      const last = (t.form || []).slice(-4);
      if (last.length === 4 && last.every((r) => r === 'D') && rng.chance(0.45)) {
        const old = t.coach;
        t.coach = makeCoach();
        t.form = [];
        N.newsCoachSacked(t, old, t.coach);
      }
    }
  }
}

function checkRecords() {
  for (const p of allActivePlayers()) {
    const marks = p.recordMarks || (p.recordMarks = {});
    for (const n of [15, 25, 35, 50]) {
      const key = `s${W.season}-${n}`;
      if (p.season.g >= n && !marks[key]) {
        marks[key] = 1;
        N.newsRecord(p, `${n} gols na temporada`);
      }
    }
    for (const n of [100, 200, 300, 400, 500]) {
      const key = `c${n}`;
      if (p.career.g >= n && !marks[key]) {
        marks[key] = 1;
        N.newsRecord(p, `${n} gols na carreira`);
      }
    }
  }
}

// Mercado da IA: compradores mais fortes levam destaques de clubes menores (troca + valor)
export function transferWindow(n) {
  const deals = [];
  const teams = Object.values(W.teams).filter((t) => t.leagueId);
  for (let tries = 0; tries < n * 12 && deals.length < n; tries++) {
    const buyer = rng.weighted(teams, (t) => Math.pow(teamAvg(t) - 60, 2));
    const slot = rng.int(0, 10);
    const current = P(buyer.squad[slot]);
    const cands = allActivePlayers().filter((p) => !p.isUser && p.teamId !== buyer.id && p.pos === current.pos && p.age <= 30 && p.ovr >= current.ovr + 3 && T(p.teamId).squad.includes(p.id) && teamAvg(T(p.teamId)) < teamAvg(buyer) && !deals.some((d) => d.includes(p.id)));
    if (!cands.length) continue;
    const target = rng.weighted(cands, (p) => p.ovr - current.ovr + (seasonRating(p) - 6) * 3);
    const seller = T(target.teamId);
    const fee = Math.round(marketValue(target) * rng.float(0.9, 1.45) * 10) / 10;
    const si = seller.squad.indexOf(target.id);
    seller.squad[si] = current.id;
    buyer.squad[slot] = target.id;
    current.teamId = seller.id;
    target.teamId = buyer.id;
    target.contract = rng.int(3, 5);
    target.morale = clamp(target.morale + 10, 0, 100);
    target.transfers = [...(target.transfers || []), { season: W.season, from: seller.id, to: buyer.id, fee }];
    deals.push([target.id, current.id]);
    N.newsTransfer(target, seller, buyer, fee, current.ovr >= 72 ? current : null);
  }
}

// ---------- fim de temporada ----------
export function endSeason() {
  // gala de premiação (prêmios de temporada, do menor para o maior)
  const seasonAwards = W.awards.filter((a) => a.period === 'season').sort((a, b) => a.stars - b.stars);
  for (const a of seasonAwards) for (const inst of awardInstances(a)) giveAward(a, inst);
  // tabelas finais para a próxima Copa Suprema
  W.lastTables = {};
  for (const L of W.leagues) W.lastTables[L.id] = leagueTable(L);
  // registra temporada na carreira de cada jogador
  for (const p of allActivePlayers()) {
    if (p.season.gp) p.career.seasons.push({ season: W.season, teamId: p.teamId, gp: p.season.gp, g: p.season.g, a: p.season.a, rt: Math.round((p.season.rt / p.season.gp) * 100) / 100, ovr: p.ovr });
  }
  if (W.protagonistId) Career.checkGoals();
  transferWindow(6);
  agePlayers();
  if (W.protagonistId) Career.generateOffers();
  // nova temporada
  for (const p of Object.values(W.players)) {
    p.season = emptySeasonStats();
    p.month = { gp: 0, g: 0, a: 0, rt: 0, cs: 0 };
  }
  W.golazos = W.golazos.filter((g) => g.season >= W.season - 1);
  W.season++;
  W.week = 0;
  for (const L of W.leagues) L.fixtures = [];
  N.pushNews({
    cat: 'analise', title: `Temporada ${seasonLabel(W.season - 1)} chega ao fim: o balanço do ano`, lede: 'Campeões, premiados e o que vem por aí.',
    body: [
      W.history.filter((h) => h.season === W.season - 1).map((h) => `${h.comp}: ${T(h.teamId)?.name}`).join(' • '),
      (() => {
        const b = W.awardHistory.filter((h) => h.season === W.season - 1 && h.awardId === 'bola-ouro')[0];
        return b ? `Bola de Ouro: ${P(b.playerId)?.name}.` : '';
      })(),
      'O mercado segue aberto na pré-temporada. A bola volta a rolar em agosto.',
    ].filter(Boolean),
    img: { type: 'trophy', stars: 5 }, importance: 3,
  });
}

function agePlayers() {
  for (const t of Object.values(W.teams)) {
    for (let i = 0; i < t.squad.length; i++) {
      const p = P(t.squad[i]);
      develop(p);
      if (!p.isUser && shouldRetire(p)) {
        const y = youth(t, p);
        t.squad[i] = y.id;
        retire(p);
      }
    }
    for (const id of t.bench || []) develop(P(id));
  }
}

function develop(p) {
  p.age++;
  p.contract = Math.max(0, p.contract - 1);
  let d;
  if (p.age <= 21) d = (p.pot - p.ovr) * rng.float(0.15, 0.4) + rng.gauss(0, 1);
  else if (p.age <= 24) d = (p.pot - p.ovr) * rng.float(0.1, 0.3) + rng.gauss(0, 1);
  else if (p.age <= 28) d = rng.gauss(0.4, 1.4);
  else if (p.age <= 31) d = rng.gauss(-0.8, 1.3);
  else d = -rng.float(1, 4);
  if (p.isUser) d = Math.max(d, p.age <= 27 ? 0 : d) * 0.6; // o treino semanal já evolui o protagonista
  d = Math.round(d);
  if (d) {
    for (const k of [...ATTR_KEYS, 'gk']) p.attrs[k] = clamp(p.attrs[k] + d * (k === 'pac' && d < 0 ? 1.5 : 1), 10, 99);
    p.ovr = calcOvr(p);
  }
  p.pot = Math.max(p.pot, p.ovr);
}

function shouldRetire(p) {
  if (p.age >= 39) return true;
  if (p.age >= 33) return rng.chance((p.age - 32) * 0.17 + (p.ovr < 70 ? 0.15 : 0));
  return false;
}

function youth(team, old) {
  const L = LG(team.leagueId);
  const mix = L ? LEAGUE_NATION_MIX[L.nation] : null;
  const nation = mix ? rng.weighted(mix)[0] : old.nation;
  const p = makePlayer({ nation, pos: old.pos, ovr: clamp(Math.round(teamAvg(team) - rng.float(3, 9)), 50, 85), age: rng.int(17, 19), teamId: team.id, number: old.number });
  p.pot = clamp(p.ovr + rng.int(8, 22), p.ovr, 95);
  W.players[p.id] = p;
  if (rng.chance(0.5) || p.pot >= 88) N.newsYouth(p, team);
  return p;
}

function retire(p) {
  p.retired = true;
  p.retiredSeason = W.season;
  p.lastTeamId = p.teamId;
  p.teamId = null;
  if (p.legacy >= 40 || p.career.g >= 80) N.newsRetire(p);
  else delete W.players[p.id];
}

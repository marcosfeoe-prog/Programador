// Competições: tabela de pontos corridos, calendário e torneios (Copa Suprema + criados pelo usuário).
import { rng, uid, clamp } from './rng.js';
import { W, T, P, LG, makeTeam, teamStrength, teamAvg } from './world.js';
import { simulateMatch, winnerOf } from './match.js';

// Calendário "todos contra todos" (método do círculo)
export function roundRobin(ids, double = true) {
  const t = ids.slice();
  if (t.length % 2) t.push(null);
  const n = t.length;
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const games = [];
    for (let i = 0; i < n / 2; i++) {
      const a = t[i];
      const b = t[n - 1 - i];
      if (a && b) games.push(r % 2 === 0 ? { h: a, a: b } : { h: b, a: a });
    }
    rounds.push(games);
    t.splice(1, 0, t.pop());
  }
  if (double) {
    const back = rounds.map((rd) => rd.map((gm) => ({ h: gm.a, a: gm.h })));
    return [...rounds, ...back];
  }
  return rounds;
}

export function computeTable(teamIds, rounds) {
  const rows = {};
  for (const id of teamIds) rows[id] = { teamId: id, j: 0, v: 0, e: 0, d: 0, gp: 0, gc: 0, pts: 0, form: [] };
  for (const rd of rounds) {
    for (const gm of rd) {
      if (gm.hg === undefined || !rows[gm.h] || !rows[gm.a]) continue;
      const h = rows[gm.h];
      const a = rows[gm.a];
      h.j++;
      a.j++;
      h.gp += gm.hg;
      h.gc += gm.ag;
      a.gp += gm.ag;
      a.gc += gm.hg;
      if (gm.hg > gm.ag) {
        h.v++; a.d++; h.pts += 3; h.form.push('V'); a.form.push('D');
      } else if (gm.hg < gm.ag) {
        a.v++; h.d++; a.pts += 3; a.form.push('V'); h.form.push('D');
      } else {
        h.e++; a.e++; h.pts++; a.pts++; h.form.push('E'); a.form.push('E');
      }
    }
  }
  return Object.values(rows).sort((x, y) => y.pts - x.pts || y.gp - y.gc - (x.gp - x.gc) || y.gp - x.gp || T(x.teamId).name.localeCompare(T(y.teamId).name));
}

export function leagueTable(league) {
  return computeTable(league.teamIds, league.fixtures);
}

// ---------- torneios genéricos ----------
export const CS_WEEKS = { 5: 'Oitavas de final', 9: 'Quartas de final', 13: 'Semifinal', 19: 'Final' };

export function makeTournament(o) {
  const t = {
    id: o.id || uid('c'),
    name: o.name,
    stars: o.stars || 3,
    format: o.format || 'liga', // 'liga' | 'mata'
    builtIn: !!o.builtIn,
    desc: o.desc || '',
    recurring: o.recurring ?? true,
    teamIds: o.teamIds.slice(),
    prize: o.prize ?? o.stars * 4,
    rounds: [],
    alive: null,
    cur: 0,
    done: false,
    champion: null,
    history: [],
    startAbs: o.startAbs ?? (W.absWeek || 0) + 1,
    edition: 1,
    venue: o.venue || null,
  };
  setupTournament(t);
  return t;
}

export function setupTournament(t) {
  t.rounds = [];
  t.cur = 0;
  t.done = false;
  t.champion = null;
  if (t.format === 'liga') {
    t.rounds = roundRobin(rng.shuffle(t.teamIds), false);
  } else {
    // mata-mata: cabeças de chave recebem "bye" se o número não for potência de 2
    const seeded = t.teamIds.slice().sort((a, b) => teamStrength(T(b)) - teamStrength(T(a)));
    let size = 1;
    while (size < seeded.length) size *= 2;
    const byes = size - seeded.length;
    const advance = seeded.slice(0, byes);
    const rest = rng.shuffle(seeded.slice(byes));
    const games = [];
    for (let i = 0; i < rest.length; i += 2) games.push({ h: rest[i], a: rest[i + 1] });
    t.byes = advance;
    t.rounds.push(games);
  }
}

export function knockoutStage(nTeams) {
  return { 2: 'Final', 4: 'Semifinal', 8: 'Quartas de final', 16: 'Oitavas de final', 32: '16-avos de final', 64: '32-avos de final' }[nTeams] || `Fase de ${nTeams}`;
}

export function tournamentTable(t) {
  return t.format === 'liga' ? computeTable(t.teamIds, t.rounds) : null;
}

// Joga a próxima rodada do torneio; retorna { matches, finished }
export function playTournamentRound(t, ctxExtra = {}) {
  if (t.done) return { matches: [] };
  const rd = t.rounds[t.cur];
  if (!rd) return { matches: [] };
  const matches = [];
  const knockout = t.format === 'mata';
  let nAlive = knockout ? rd.length * 2 + (t.cur === 0 ? (t.byes || []).length : 0) : 0;
  if (knockout) {
    let size = 1;
    while (size < nAlive) size *= 2;
    nAlive = size;
  }
  const stage = knockout ? knockoutStage(nAlive) : null;
  for (const gm of rd) {
    const isFinal = knockout && rd.length === 1 && !(t.cur === 0 && (t.byes || []).length);
    const m = simulateMatch(gm.h, gm.a, {
      compId: t.id, compName: t.name, round: t.cur + 1, stage, knockout, neutral: isFinal, venue: t.venue || 'Estádio da Final', stars: t.stars, ...ctxExtra,
    });
    gm.hg = m.hg;
    gm.ag = m.ag;
    gm.mid = m.id;
    gm.pens = m.pens;
    matches.push(m);
  }
  t.cur++;
  let finished = false;
  if (knockout) {
    const winners = rd.map((gm) => winnerOf(W.matches[gm.mid]) || (gm.pens ? gm.pens.winner : gm.h));
    let next = winners;
    if (t.cur === 1 && t.byes?.length) {
      // cabeças de chave enfrentam os vencedores da fase preliminar
      next = [];
      const b = t.byes.slice();
      const w = winners.slice();
      while (b.length || w.length) {
        if (b.length) next.push(b.shift());
        if (w.length) next.push(w.shift());
      }
    }
    if (next.length === 1) {
      t.champion = next[0];
      t.done = true;
      finished = true;
      const fm = W.matches[rd[0].mid];
      t.final = { opp: fm.home === t.champion ? fm.away : fm.home, score: `${Math.max(fm.hg, fm.ag)} x ${Math.min(fm.hg, fm.ag)}${fm.pens ? ` (pên. ${Math.max(fm.pens.h, fm.pens.a)} x ${Math.min(fm.pens.h, fm.pens.a)})` : ''}`, mid: fm.id };
    } else {
      const games = [];
      for (let i = 0; i < next.length; i += 2) games.push({ h: next[i], a: next[i + 1] });
      t.rounds.push(games);
    }
  } else if (t.cur >= t.rounds.length) {
    const tab = tournamentTable(t);
    t.champion = tab[0].teamId;
    t.done = true;
    finished = true;
  }
  return { matches, finished, stage };
}

// Classificados para a Copa Suprema: top 3 de cada liga + 4º da liga mais forte
export function copaQualifiers(tables) {
  const ids = [];
  const sorted = W.leagues.slice().sort((a, b) => a.rank - b.rank);
  for (const L of sorted) {
    const tab = tables?.[L.id] || L.teamIds.map((id) => ({ teamId: id })).sort((a, b) => teamAvg(T(b.teamId)) - teamAvg(T(a.teamId)));
    ids.push(...tab.slice(0, 3).map((r) => r.teamId));
  }
  const best = sorted[0];
  const tab = tables?.[best.id] || best.teamIds.map((id) => ({ teamId: id })).sort((a, b) => teamAvg(T(b.teamId)) - teamAvg(T(a.teamId)));
  ids.push(tab[3].teamId);
  return ids;
}

export function setupCopa(qual) {
  let cs = W.tournaments.find((t) => t.id === 'CS');
  if (!cs) {
    cs = makeTournament({ id: 'CS', name: 'Copa Suprema dos Campeões', stars: 5, format: 'mata', builtIn: true, teamIds: qual, recurring: true, desc: 'O torneio 5 estrelas: os 16 melhores clubes das cinco grandes ligas em mata-mata, com final em campo neutro.', venue: 'Estádio Olímpico Mundial', prize: 40 });
    W.tournaments.unshift(cs);
  } else {
    cs.teamIds = qual;
    cs.edition++;
    setupTournament(cs);
  }
  // sorteio: evita confronto de times da mesma liga nas oitavas quando possível
  const pots = qual.slice();
  const games = [];
  const pool = rng.shuffle(pots);
  while (pool.length) {
    const a = pool.shift();
    let idx = pool.findIndex((b) => T(b).leagueId !== T(a).leagueId);
    if (idx < 0) idx = 0;
    const b = pool.splice(idx, 1)[0];
    games.push({ h: a, a: b });
  }
  cs.rounds = [games];
  cs.byes = [];
  return cs;
}

// ---------- clubes criados pelo usuário ----------
export function createCustomTeam({ name, city, colors, pattern, level, stadium, nickname, nation }) {
  const base = clamp(Number(level) || 70, 50, 88);
  const short = name.replace(/[^A-Za-zÀ-ú ]/g, '').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || 'FC';
  const t = makeTeam({ name, short, city: city || name, colors, pattern, stadium, nickname, tier: 3, custom: true }, null, base, nation || null);
  W.teams[t.id] = t;
  return t;
}

export { LG, P };

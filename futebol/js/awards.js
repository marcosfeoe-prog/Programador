// Sistema de prêmios: definições (padrão + criados pelo usuário) e apuração.
import { W, P, T, LG, seasonRating, leagueCoef, allActivePlayers } from './world.js';
import { uid } from './rng.js';

export const STAR_TIERS = {
  1: { label: 'Regional', desc: 'Prêmios regionais e reconhecimentos locais.', legacy: 3 },
  2: { label: 'Simples', desc: 'Prêmios de liga: artilharia, assistências, luvas.', legacy: 8 },
  3: { label: 'Internacional', desc: 'Prêmios internacionais e mensais de prestígio.', legacy: 18 },
  4: { label: 'Cobiçado', desc: 'Os prêmios mais valiosos da temporada.', legacy: 40 },
  5: { label: 'Lendário', desc: 'Os maiores prêmios do futebol mundial.', legacy: 90 },
};

export const CRITERIA = {
  goals: 'Mais gols',
  assists: 'Mais assistências',
  ga: 'Gols + assistências',
  rating: 'Melhor nota média',
  cleansheets: 'Mais jogos sem sofrer gols (goleiros)',
  young: 'Melhor jovem (até 21 anos)',
  gk: 'Melhor goleiro',
  defender: 'Melhor defensor',
  fame: 'Voto popular (fama)',
  golazo: 'Gol mais bonito',
  composite: 'Desempenho geral (nota, gols, títulos)',
  roundbest: 'Melhor atuação da rodada',
};

export const SCOPES = {
  all: 'Mundial (todas as competições)',
  eachLeague: 'Cada liga (um vencedor por liga)',
};

export const PERIODS = { season: 'Fim de temporada', month: 'Mensal', round: 'A cada rodada' };

export function defaultAwards() {
  const A = (o) => ({ id: o.id || uid('a'), builtIn: true, minGames: 0, prestige: 0, ...o });
  return [
    // 1 estrela — regionais
    A({ id: 'craque-rodada', name: 'Craque da Rodada', stars: 1, scope: 'eachLeague', criterion: 'roundbest', period: 'round', prize: 0.01, desc: 'A melhor atuação individual da rodada em cada liga.' }),
    A({ id: 'revelacao-regional', name: 'Revelação Regional', stars: 1, scope: 'eachLeague', criterion: 'young', period: 'season', prize: 0.05, minGames: 6, desc: 'Escolhido pelas federações regionais como a grande revelação local.' }),
    A({ id: 'craque-torcida', name: 'Craque da Torcida', stars: 1, scope: 'eachLeague', criterion: 'fame', period: 'season', prize: 0.03, minGames: 6, desc: 'Votação popular dos torcedores de cada país.' }),
    // 2 estrelas — simples
    A({ id: 'artilheiro-liga', name: 'Artilheiro da Liga', stars: 2, scope: 'eachLeague', criterion: 'goals', period: 'season', prize: 0.2, desc: 'O maior goleador de cada liga nacional.' }),
    A({ id: 'garcom-liga', name: 'Rei das Assistências', stars: 2, scope: 'eachLeague', criterion: 'assists', period: 'season', prize: 0.15, desc: 'O maior assistente de cada liga nacional.' }),
    A({ id: 'luva-liga', name: 'Luva de Ouro da Liga', stars: 2, scope: 'eachLeague', criterion: 'cleansheets', period: 'season', prize: 0.15, desc: 'O goleiro com mais jogos sem sofrer gols.' }),
    A({ id: 'artilheiro-copa', name: 'Artilheiro da Copa Suprema', stars: 2, scope: 'comp:CS', criterion: 'goals', period: 'season', prize: 0.25, desc: 'O goleador máximo da Copa Suprema dos Campeões.' }),
    // 3 estrelas — internacionais / mensais
    A({ id: 'jogador-mes', name: 'Jogador do Mês da Liga', stars: 3, scope: 'eachLeague', criterion: 'composite', period: 'month', prize: 0.1, minGames: 2, desc: 'O destaque de cada mês em cada liga.' }),
    A({ id: 'gol-ano', name: 'Prêmio Arco-Íris — Gol do Ano', stars: 3, scope: 'all', criterion: 'golazo', period: 'season', prize: 0.3, desc: 'O gol mais bonito da temporada em todo o planeta.' }),
    A({ id: 'promessa-ouro', name: 'Troféu Promessa de Ouro', stars: 3, scope: 'all', criterion: 'young', period: 'season', prize: 0.4, minGames: 8, desc: 'O melhor jogador sub-21 do mundo.' }),
    A({ id: 'muralha', name: 'Muralha Internacional', stars: 3, scope: 'all', criterion: 'defender', period: 'season', prize: 0.35, minGames: 10, desc: 'O melhor defensor do mundo na temporada.' }),
    // 4 estrelas — cobiçados
    A({ id: 'melhor-liga', name: 'Melhor Jogador da Temporada da Liga', stars: 4, scope: 'eachLeague', criterion: 'composite', period: 'season', prize: 0.8, minGames: 10, desc: 'O craque absoluto de cada liga na temporada.' }),
    A({ id: 'chuteira-ouro', name: 'Chuteira de Ouro — Artilheiro do Ano', stars: 4, scope: 'all', criterion: 'goals', period: 'season', prize: 1.0, desc: 'O maior artilheiro do planeta, somando todas as competições.' }),
    A({ id: 'luva-lendaria', name: 'Luva Lendária — Melhor Goleiro do Mundo', stars: 4, scope: 'all', criterion: 'gk', period: 'season', prize: 0.8, minGames: 10, desc: 'O melhor goleiro do mundo.' }),
    // 5 estrelas — lendários
    A({ id: 'craque-copa', name: 'Craque da Copa Suprema', stars: 5, scope: 'comp:CS', criterion: 'composite', period: 'season', prize: 1.5, minGames: 2, desc: 'O melhor jogador do torneio 5 estrelas: a Copa Suprema dos Campeões.' }),
    A({ id: 'coroa-mundial', name: 'Coroa Mundial — Melhor Jogador do Ano', stars: 5, scope: 'all', criterion: 'composite', period: 'season', prize: 2.5, minGames: 10, desc: 'Eleito por técnicos e capitães de todo o mundo como o melhor do ano.' }),
    A({ id: 'bola-ouro', name: 'Bola de Ouro', stars: 5, scope: 'all', criterion: 'composite', period: 'season', prize: 3.0, minGames: 10, prestige: 30, desc: 'O prêmio individual mais cobiçado do futebol. A consagração máxima de uma carreira.' }),
  ];
}

export function makeCustomAward(o) {
  return { id: uid('a'), builtIn: false, minGames: o.period === 'month' ? 2 : 6, prestige: 0, ...o };
}

// ---------- apuração ----------
function statsFor(p, scope, period) {
  if (period === 'month') return p.month;
  if (scope && scope.startsWith('comp:')) return p.season.comp[scope.slice(5)] || { gp: 0, g: 0, a: 0, rt: 0, cs: 0 };
  if (scope && scope.startsWith('league:')) return p.season.comp[scope.slice(7)] || { gp: 0, g: 0, a: 0, rt: 0, cs: 0 };
  return p.season;
}

function compositeScore(p, s, scope) {
  const rt = s.gp ? s.rt / s.gp : 0;
  const coef = scope === 'all' ? leagueCoef(T(p.teamId)?.leagueId) : 1;
  const posF = p.pos === 'GOL' ? 0.7 : 1;
  let score = (rt - 6) * 22 * coef + s.g * 2.2 * coef + s.a * 1.4 * coef + (s.cs || 0) * 0.8 * posF + Math.min(s.gp, 30) * 0.4;
  if (scope === 'all') score += (p.season.titlePts || 0) + p.fame * 0.15 + (p.season.motm || 0) * 0.8;
  return score;
}

export function scorePlayer(p, award, scopeKey) {
  const s = statsFor(p, scopeKey, award.period);
  if ((s.gp || 0) < (award.minGames || 0)) return -Infinity;
  const rt = s.gp ? s.rt / s.gp : 0;
  switch (award.criterion) {
    case 'goals':
      return s.g + rt / 100;
    case 'assists':
      return s.a + rt / 100;
    case 'ga':
      return s.g + s.a + rt / 100;
    case 'rating':
      return s.gp >= Math.max(3, award.minGames) ? rt : -Infinity;
    case 'cleansheets':
      return p.pos === 'GOL' ? (s.cs || 0) + rt / 100 : -Infinity;
    case 'young':
      return p.age <= 21 ? compositeScore(p, s, scopeKey) + (p.pot - p.ovr) * 0.2 : -Infinity;
    case 'gk':
      return p.pos === 'GOL' ? (rt - 6) * 30 + (s.cs || 0) * 2 + (p.season.titlePts || 0) * 0.5 : -Infinity;
    case 'defender':
      return ['ZAG', 'LD', 'LE', 'VOL'].includes(p.pos) ? (rt - 6) * 30 + (s.cs || 0) * 1.2 + s.g + (p.season.titlePts || 0) * 0.5 : -Infinity;
    case 'fame':
      return p.fame + rt * 3 + s.g * 0.5;
    case 'composite':
      return compositeScore(p, s, scopeKey);
    default:
      return rt;
  }
}

// Gera a lista de "instâncias" de um prêmio (por liga quando eachLeague)
export function awardInstances(award) {
  if (award.scope === 'eachLeague') return W.leagues.map((l) => ({ scopeKey: 'league:' + l.id, leagueId: l.id, label: `${award.name} — ${l.name}` }));
  if (award.scope.startsWith('league:')) {
    const l = LG(award.scope.slice(7));
    return l ? [{ scopeKey: award.scope, leagueId: l.id, label: award.name }] : [];
  }
  if (award.scope.startsWith('comp:')) return [{ scopeKey: award.scope, label: award.name }];
  return [{ scopeKey: 'all', label: award.name }];
}

export function candidatesFor(award, inst) {
  let pool = allActivePlayers();
  if (inst.leagueId) pool = pool.filter((p) => T(p.teamId)?.leagueId === inst.leagueId);
  return pool;
}

export function rankAward(award, inst, n = 5) {
  if (award.criterion === 'golazo') {
    const gs = W.golazos.filter((g) => g.season === W.season).sort((a, b) => b.beauty - a.beauty);
    const seen = new Set();
    const out = [];
    for (const g of gs) {
      if (seen.has(g.playerId) || !P(g.playerId)) continue;
      seen.add(g.playerId);
      out.push({ p: P(g.playerId), score: g.beauty, note: g.desc });
      if (out.length >= n) break;
    }
    return out;
  }
  const list = candidatesFor(award, inst)
    .map((p) => ({ p, score: scorePlayer(p, award, inst.scopeKey) }))
    .filter((x) => x.score > -Infinity)
    .sort((a, b) => b.score - a.score);
  return list.slice(0, n);
}

export function grantAward(award, inst, p, extra = {}) {
  const entry = {
    id: uid('h'),
    awardId: award.id,
    name: inst.label,
    stars: award.stars,
    season: W.season,
    week: W.week,
    period: extra.period || award.period,
    playerId: p.id,
    teamId: p.teamId,
    leagueId: inst.leagueId || null,
    prize: award.prize,
    note: extra.note || '',
  };
  W.awardHistory.push(entry);
  if (award.stars >= 2 || p.id === W.protagonistId) {
    p.awards.push({ name: inst.label, stars: award.stars, season: W.season, period: entry.period, note: entry.note });
  }
  const legacy = STAR_TIERS[award.stars].legacy + (award.prestige || 0);
  p.legacy += award.period === 'round' ? 1 : award.period === 'month' ? Math.round(legacy / 3) : legacy;
  p.fame = Math.min(99, p.fame + award.stars * (award.period === 'season' ? 2 : 0.5));
  p.morale = Math.min(100, p.morale + award.stars * 2);
  return entry;
}

// Bola de Ouro "ao vivo" — corrida pela premiação
export function ballonRace(n = 10) {
  const a = W.awards.find((x) => x.id === 'bola-ouro') || W.awards.find((x) => x.stars === 5 && x.scope === 'all');
  if (!a) return [];
  return rankAward({ ...a, minGames: 0 }, { scopeKey: 'all' }, n);
}

export function awardById(id) {
  return W.awards.find((a) => a.id === id);
}

export function starStr(n) {
  return '★'.repeat(n) + '☆'.repeat(5 - n);
}

export { seasonRating };

// Criador de jogadores: o usuário adiciona craques, lendas ou promessas ao universo.
import { rng, clamp } from './rng.js';
import { W, P, T, LG, makePlayer, calcOvr, ATTR_KEYS, posName, nationOf, fmtMoney, marketValue } from './world.js';
import { STAR_TIERS } from './awards.js';
import { pushNews } from './news.js';
import { g } from './text.js';

// Competições que podem aparecer no histórico de títulos
export function titleOptions() {
  const list = W.leagues.map((L) => ({ key: 'L:' + L.id, name: L.name, stars: L.stars, kind: 'liga' }));
  list.push({ key: 'CS', name: 'Copa Suprema dos Campeões', stars: 5, kind: 'copa' });
  for (const t of W.tournaments.filter((x) => !x.builtIn)) list.push({ key: 'T:' + t.id, name: t.name, stars: t.stars, kind: 'torneio' });
  list.push({ key: 'NAT', name: 'Copa das Nações (seleções)', stars: 5, kind: 'selecao' });
  list.push({ key: 'CONT', name: 'Copa Continental de Seleções', stars: 4, kind: 'selecao' });
  return list;
}

function setExactOvr(p, target) {
  for (let i = 0; i < 40 && calcOvr(p) !== target; i++) {
    const d = target > calcOvr(p) ? 1 : -1;
    const keys = p.pos === 'GOL' ? ['gk'] : ATTR_KEYS;
    for (const k of keys) p.attrs[k] = clamp(p.attrs[k] + d, 10, 99);
  }
  p.ovr = calcOvr(p);
}

// o.team: id do clube; o.role: 'titular' | 'reserva'
export function createCustomPlayer(o) {
  const team = T(o.teamId);
  const p = makePlayer({ nation: o.nation, pos: o.pos, ovr: o.ovr, age: o.age, teamId: team.id, pot: Math.max(o.pot, o.ovr), number: o.number, name: { first: o.first, last: o.last, display: o.display } });
  setExactOvr(p, o.ovr);
  p.pot = Math.max(o.pot, p.ovr);
  p.foot = o.foot;
  p.traits = o.traits.length ? o.traits.slice(0, 2) : ['profissional'];
  p.look = { ...p.look, ...o.look };
  p.fame = clamp(Number(o.fame), 1, 99);
  p.created = true;
  p.morale = 80;
  p.career.gp = Math.max(0, o.gp | 0);
  p.career.g = Math.max(0, o.goals | 0);
  p.career.a = Math.max(0, o.assists | 0);
  const years = Math.max(1, o.age - 17);
  const pastSeason = () => W.season - rng.int(1, years);
  // prêmios
  for (const [awardId, count] of Object.entries(o.awards || {})) {
    const a = W.awards.find((x) => x.id === awardId);
    if (!a) continue;
    for (let i = 0; i < count; i++) {
      const season = pastSeason();
      const label = a.scope === 'eachLeague' ? `${a.name} — ${LG(team.leagueId)?.name || 'liga'}` : a.name;
      p.awards.push({ name: label, stars: a.stars, season, period: a.period, note: 'histórico' });
      W.awardHistory.push({ id: 'h' + rng.int(1e6, 9e6), awardId: a.id, name: label, stars: a.stars, season, week: 20, period: a.period, playerId: p.id, teamId: team.id, leagueId: team.leagueId, prize: a.prize, note: 'antes do Gramado' });
      p.legacy += a.period === 'round' ? 1 : a.period === 'month' ? Math.round(STAR_TIERS[a.stars].legacy / 3) : STAR_TIERS[a.stars].legacy + (a.prestige || 0);
    }
  }
  p.awards.sort((x, y) => x.season - y.season);
  // títulos
  const opts = titleOptions();
  for (const [key, count] of Object.entries(o.titles || {})) {
    const t = opts.find((x) => x.key === key);
    if (!t) continue;
    for (let i = 0; i < count; i++) {
      p.trophies.push({ season: pastSeason(), name: t.name, stars: t.stars, kind: t.kind });
      p.legacy += t.stars * 4;
    }
  }
  p.trophies.sort((x, y) => x.season - y.season);
  p.legacy += Math.round(p.career.g * 0.15 + p.career.a * 0.08);
  W.players[p.id] = p;
  // vaga no time
  if (o.role === 'titular') {
    const i = team.squad.findIndex((id) => P(id).pos === p.pos);
    const slot = i >= 0 ? i : team.squad.findIndex((id) => !P(id).isUser);
    const out = P(team.squad[slot]);
    if (out?.isUser) team.bench = [...(team.bench || []), p.id];
    else {
      team.squad[slot] = p.id;
      team.bench = [...(team.bench || []), out.id];
    }
  } else team.bench = [...(team.bench || []), p.id];
  announce(p, team);
  return p;
}

function announce(p, team) {
  const nTit = p.trophies.length;
  const big = p.fame >= 75 || p.ovr >= 86;
  const young = p.age <= 20 && p.pot - p.ovr >= 10;
  const title = big
    ? g('[Bomba!|Chegada de peso:|Estrela no universo:] {t} [anuncia|apresenta] {p}, [{n} títulos na carreira|astro de {ovr} de overall]', { t: team.name, p: p.name, n: nTit, ovr: p.ovr })
    : young
      ? g('[Joia rara:|Nova promessa:] {t} [apresenta|aposta em] {p}, de {age} anos', { t: team.name, p: p.name, age: p.age })
      : g('{t} [anuncia|apresenta] {p}, {pos} {adj}', { t: team.name, p: p.name, pos: posName(p.pos).toLowerCase(), adj: nationOf(p.nation).adj });
  pushNews({
    cat: 'mercado',
    title,
    lede: `${posName(p.pos)} · ${p.age} anos · overall ${p.ovr} · potencial ${p.pot} · valor estimado ${fmtMoney(marketValue(p))}`,
    body: [
      g('[O {t} oficializou|Está confirmada] a chegada de {p}, {pos} {adj} de {age} anos.', { t: team.name, p: p.name, pos: posName(p.pos).toLowerCase(), adj: nationOf(p.nation).adj, age: p.age }),
      p.career.gp ? g('[No currículo|Na bagagem], {gp} jogos, {gl} gols e {a} assistências{tit}.', { gp: p.career.gp, gl: p.career.g, a: p.career.a, tit: nTit ? `, além de ${nTit} títulos` : '' }) : g('[É a primeira experiência profissional do jogador|Ele chega para dar os primeiros passos como profissional].'),
      p.awards.length ? `Prêmios: ${[...new Set(p.awards.map((a) => a.name))].slice(0, 5).join(', ')}.` : '',
    ].filter(Boolean),
    players: [p.id], teams: [team.id], league: team.leagueId, img: { type: 'player', id: p.id }, importance: big ? 4 : 2,
  });
}

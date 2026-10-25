// Telas: notícias, matéria, ligas, clubes, jogadores, partidas e ranking.
import { W, P, T, LG, nationOf, posName, fmtMoney, marketValue, seasonRating, teamAvg, ATTR_KEYS, ATTR_NAMES } from './world.js';
import { FORMATION, TRAITS } from './data.js';
import { leagueTable, tournamentTable } from './tournaments.js';
import { CATS } from './news.js';
import { ballonRace, STAR_TIERS } from './awards.js';
import { worldRanking, protagonist } from './career.js';
import { FigureViewer, kitFor } from './avatar3d.js';
import { scoutReport, playStyle, teamProfile } from './bio.js';
import { seasonLabel } from './text.js';
import { weekLabel } from './season.js';
import * as AI from './ai.js';
import { $, $$, ovrBadge, thumbImg, playerLink, teamCell, formIcons, newsVisual, newsCard, newsItem, catTag, toast, crest, stars, esc } from './ui.js';

let viewer = null;
export function disposeViewer() {
  viewer?.dispose();
  viewer = null;
}
function mountViewer(canvas, p, opts = {}) {
  disposeViewer();
  const t = T(p.teamId) || T(p.lastTeamId);
  try {
    viewer = new FigureViewer(canvas, { accent: t?.colors[0] === '#ffffff' ? t.colors[1] : t?.colors[0] || '#22c55e', ...opts });
    viewer.setFigure(p.look, kitFor(p, t));
  } catch (e) {
    canvas.parentElement.innerHTML = '<div class="empty">Seu navegador não suporta WebGL para exibir o boneco 3D.</div>';
  }
  return viewer;
}
export { mountViewer };

// ---------- notícias ----------
const feedState = { cat: 'all', league: 'all', limit: 24 };

export function viewFeed() {
  const list = W.news.filter((n) => (feedState.cat === 'all' || n.cat === feedState.cat) && (feedState.league === 'all' || n.league === feedState.league));
  const recent = W.news.filter((n) => n.season === W.season && n.week >= W.week - 1);
  const hero = (feedState.cat === 'all' && feedState.league === 'all' ? recent : list).slice().sort((a, b) => b.importance - a.importance || 0)[0] || list[0];
  const rest = list.filter((n) => n !== hero).slice(0, feedState.limit);
  const u = protagonist();
  const race = ballonRace(5);
  const leaders = W.leagues.map((L) => {
    const tab = L.fixtures.length ? leagueTable(L) : null;
    return { L, top: tab ? tab[0] : null };
  });
  return {
    html: `
    ${hero ? `<a class="hero" href="#/noticia/${hero.id}">${newsVisual(hero)}<div class="txt">${catTag(hero.cat)}<h1>${esc(hero.title)}</h1><p class="muted">${esc(hero.lede)}</p><div class="meta"><b style="color:${hero.outletColor}">${esc(hero.outlet)}</b><span>${hero.date}</span><span>por ${esc(hero.author)}</span></div></div></a>` : `<div class="card empty"><h2>Bem-vindo ao Gramado</h2><p>Aperte <b>▶ Avançar semana</b> para começar a temporada.</p></div>`}
    <div class="layout-main">
      <div>
        <div class="spread" style="margin-bottom:12px">
          <div class="chips" id="cat-chips">
            <span class="chip ${feedState.cat === 'all' ? 'on' : ''}" data-cat="all">Tudo</span>
            ${Object.entries(CATS).map(([k, c]) => `<span class="chip ${feedState.cat === k ? 'on' : ''}" data-cat="${k}">${c.name}</span>`).join('')}
          </div>
          <select id="league-filter" style="width:auto">
            <option value="all">Todas as ligas</option>
            ${W.leagues.map((L) => `<option value="${L.id}" ${feedState.league === L.id ? 'selected' : ''}>${esc(L.name)}</option>`).join('')}
          </select>
        </div>
        ${rest.length ? `<div class="news-grid">${rest.map(newsCard).join('')}</div>` : '<div class="card empty">Nenhuma notícia nesta categoria ainda.</div>'}
        ${list.length > feedState.limit + 1 ? '<div style="text-align:center;margin-top:16px"><button class="btn" id="more">Carregar mais</button></div>' : ''}
      </div>
      <aside class="stack">
        ${u ? `<a class="card" href="#/carreira" style="border-color:#7f1d3a"><div class="spread"><h3 style="margin:0">⭐ Sua carreira</h3>${ovrBadge(u.ovr)}</div><div class="plink" style="margin-top:8px">${thumbImg(u, 'lg')}<div><b>${esc(u.name)}</b><div class="small muted">${esc(T(u.teamId)?.name || '')}</div><div class="small">${u.season.g} gols · ${u.season.a} assist. · nota ${seasonRating(u).toFixed(2)}</div><div class="small muted">Legado: ${Math.round(u.legacy)}</div></div></div></a>` : `<a class="card" href="#/carreira" style="border-color:#7f1d3a"><h3>🧑‍🚀 Vire o protagonista</h3><p class="small muted" style="margin:0">Crie seu jogador, escolha a aparência e o clube, e tente chegar ao topo do futebol mundial.</p></a>`}
        <div class="card"><h3>🥇 Corrida pela Bola de Ouro</h3>${race.length && W.week > 0 ? race.map((r, i) => `<div class="row" style="padding:5px 0;border-bottom:1px solid var(--line)"><b class="num" style="width:18px">${i + 1}</b>${playerLink(r.p)}<span class="muted small" style="margin-left:auto">${r.p.season.g}G ${r.p.season.a}A</span></div>`).join('') : '<p class="small muted">A disputa começa com a bola rolando.</p>'}</div>
        <div class="card"><h3>🏟️ Líderes das ligas</h3>${leaders.map(({ L, top }) => `<a class="row" href="#/liga/${L.id}" style="padding:6px 0;border-bottom:1px solid var(--line)"><span class="small muted" style="width:120px">${esc(L.name)}</span>${top ? teamCell(top.teamId, { link: false, short: false }) + `<b class="num" style="margin-left:auto">${top.pts} pts</b>` : '<span class="small muted">pré-temporada</span>'}</a>`).join('')}</div>
      </aside>
    </div>`,
    mount(root) {
      $$('#cat-chips .chip', root).forEach((c) => (c.onclick = () => {
        feedState.cat = c.dataset.cat;
        feedState.limit = 24;
        window.rerender();
      }));
      $('#league-filter', root).onchange = (e) => {
        feedState.league = e.target.value;
        window.rerender();
      };
      const more = $('#more', root);
      if (more) more.onclick = () => {
        feedState.limit += 24;
        window.rerender();
      };
    },
  };
}

export function viewArticle(id) {
  const n = W.news.find((x) => x.id === id);
  if (!n) return { html: '<div class="card empty">Notícia não encontrada (o arquivo guarda as 450 mais recentes).</div>' };
  const m = n.matchId && W.matches[n.matchId];
  const related = W.news.filter((x) => x !== n && (x.players.some((p) => n.players.includes(p)) || x.teams.some((t) => n.teams.includes(t)))).slice(0, 6);
  return {
    html: `
    <div class="layout-main">
      <article class="article">
        <div class="row"><span class="outlet" style="color:${n.outletColor}">${esc(n.outlet)}</span>${catTag(n.cat)}${n.ai ? '<span class="ai-badge">✦ Reescrita com IA</span>' : ''}</div>
        <h1>${esc(n.title)}</h1>
        <p class="lede">${esc(n.lede)}</p>
        <div class="meta">Por <b>${esc(n.author)}</b> · ${n.date} · Temporada ${seasonLabel(n.season)}</div>
        ${newsVisual(n)}
        <div class="text">${n.body.map((p) => `<p>${esc(p)}</p>`).join('')}</div>
        ${m ? `<a class="btn" href="#/partida/${m.id}">Ver ficha completa da partida →</a>` : ''}
        <div class="row" style="margin-top:18px">${n.players.map(P).filter(Boolean).map((p) => `<a class="chip" href="#/jogador/${p.id}">${esc(p.name)}</a>`).join('')}${n.teams.map(T).filter(Boolean).map((t) => `<a class="chip" href="#/time/${t.id}">${esc(t.name)}</a>`).join('')}</div>
        ${W.settings.aiEnabled ? `<div class="card" style="margin-top:20px;border-color:#5b21b6"><div class="spread"><div><b>✦ Redação com IA</b><div class="small muted">Reescreve esta matéria com mais profundidade usando o Claude.</div></div><button class="btn" id="ai-rewrite">Reescrever com IA</button></div></div>` : ''}
      </article>
      <aside class="stack">
        ${m ? matchBox(m) : ''}
        <div class="card news-list"><h3>Relacionadas</h3>${related.length ? related.map(newsItem).join('') : '<p class="small muted">Nada relacionado ainda.</p>'}</div>
      </aside>
    </div>`,
    mount(root) {
      const b = $('#ai-rewrite', root);
      if (b) b.onclick = async () => {
        b.disabled = true;
        b.innerHTML = '<span class="loading"></span> Escrevendo…';
        try {
          const r = await AI.rewriteNews(n);
          Object.assign(n, r, { ai: true });
          window.save();
          window.rerender();
          toast('Matéria reescrita pela IA.');
        } catch (e) {
          toast(e.message || 'Falha ao contatar a IA.', 4000);
          b.disabled = false;
          b.textContent = 'Reescrever com IA';
        }
      };
    },
  };
}

function matchBox(m) {
  const goals = m.events.filter((e) => e.type === 'goal');
  return `<a class="card" href="#/partida/${m.id}"><div class="small muted">${esc(m.compName)} · ${m.stage || `${m.round}ª rodada`}</div><div class="spread" style="margin:8px 0">${teamCell(m.home, { link: false, short: true })}<b style="font-size:1.6rem" class="num">${m.hg} – ${m.ag}</b>${teamCell(m.away, { link: false, short: true })}</div>${m.pens ? `<div class="small">Pênaltis: ${m.pens.h} – ${m.pens.a}</div>` : ''}<div class="small muted">${goals.map((e) => `${e.min}' ${esc(P(e.p)?.name || '?')}${e.own ? ' (contra)' : e.pen ? ' (pên.)' : ''}`).join(' · ') || 'Sem gols'}</div></a>`;
}

// ---------- partida ----------
export function viewMatch(id) {
  const m = W.matches[id];
  if (!m) return { html: '<div class="card empty">Ficha da partida não está mais no arquivo.</div>' };
  const H = T(m.home);
  const A = T(m.away);
  const icon = { goal: '⚽', yc: '🟨', rc: '🟥', inj: '🚑' };
  const evText = (e) => {
    const p = P(e.p);
    const nm = esc(p?.name || '?');
    if (e.type === 'goal') return `${icon.goal} <b>${nm}</b>${e.own ? ' (contra)' : e.pen ? ' (pênalti)' : ''}${e.assist ? `<div class="tiny muted">assist.: ${esc(P(e.assist)?.name || '')}</div>` : ''}${e.golazo ? `<div class="tiny" style="color:var(--gold)">✨ golaço — ${esc(e.desc)}</div>` : ''}`;
    if (e.type === 'inj') return `${icon.inj} ${nm} <span class="tiny muted">(${esc(e.desc)})</span>`;
    return `${icon[e.type]} ${nm}`;
  };
  const lineupTable = (team) => {
    const ids = Object.keys(m.ratings).filter((id) => P(id) && (P(id).teamId === team.id || [...team.squad, ...(team.bench || [])].includes(id)));
    const rows = ids.map((id) => [P(id), m.ratings[id]]).sort((a, b) => FORMATION.indexOf(a[0].pos) - FORMATION.indexOf(b[0].pos));
    return `<table><thead><tr><th>${esc(team.short)}</th><th class="n">Nota</th></tr></thead><tbody>${rows.map(([p, r]) => `<tr><td>${playerLink(p, { thumb: false })}</td><td class="n"><b style="color:${r >= 8 ? '#4ade80' : r >= 7 ? '#a3e635' : r >= 6 ? 'inherit' : '#f87171'}">${r.toFixed(1)}</b>${m.motm === p.id ? ' ⭐' : ''}</td></tr>`).join('')}</tbody></table>`;
  };
  const news = W.news.filter((n) => n.matchId === id);
  return {
    html: `
    <div class="page-head"><div><div class="muted small">${esc(m.compName)} · ${m.stage || `${m.round}ª rodada`} · Temporada ${seasonLabel(m.season)}</div><h1>Ficha da partida</h1></div></div>
    <div class="scoreboard" style="--c1:${H.colors[0]}88;--c2:${A.colors[0]}88">
      <a class="side" href="#/time/${H.id}">${crest(H, 72)}<span>${esc(H.name)}</span></a>
      <div style="text-align:center"><div class="result">${m.hg} – ${m.ag}</div>${m.pens ? `<div>Pênaltis ${m.pens.h} – ${m.pens.a}</div>` : ''}<div class="small muted">${esc(m.stadium)} · ${m.att.toLocaleString('pt-BR')} pessoas</div></div>
      <a class="side" href="#/time/${A.id}">${crest(A, 72)}<span>${esc(A.name)}</span></a>
    </div>
    <div class="grid g2" style="margin-top:18px">
      <div class="card"><h3>Lance a lance</h3><ul class="timeline">${m.events.map((e) => `<li><div class="h">${e.team === 'h' ? evText(e) : ''}</div><div class="min">${e.min}'</div><div class="a">${e.team === 'a' ? evText(e) : ''}</div></li>`).join('') || '<li><div></div><div class="min">—</div><div></div></li>'}</ul>
      ${m.motm ? `<div style="margin-top:14px"><div class="small muted">Melhor em campo</div>${playerLink(P(m.motm))}</div>` : ''}</div>
      <div class="card"><h3>Notas</h3><div class="grid g2">${lineupTable(H)}${lineupTable(A)}</div></div>
    </div>
    ${news.length ? `<div class="section-title"><h2>Na imprensa</h2></div><div class="news-grid">${news.map(newsCard).join('')}</div>` : ''}`,
  };
}

// ---------- ligas ----------
export function viewLeague(id, tab = 'tabela') {
  const L = LG(id) || W.leagues[0];
  const table = leagueTable(L);
  const started = L.fixtures.length > 0;
  const round = Math.min(18, Math.max(1, W.week <= 18 ? W.week || 1 : 18));
  const players = L.teamIds.flatMap((tid) => [...T(tid).squad, ...(T(tid).bench || [])]).map(P).filter(Boolean);
  const st = (p) => p.season.comp[L.id] || { gp: 0, g: 0, a: 0, rt: 0 };
  const scorers = players.slice().sort((a, b) => st(b).g - st(a).g || st(b).a - st(a).a).slice(0, 15);
  const assists = players.slice().sort((a, b) => st(b).a - st(a).a || st(b).g - st(a).g).slice(0, 15);
  const raters = players.filter((p) => st(p).gp >= Math.max(2, W.week / 3)).sort((a, b) => st(b).rt / st(b).gp - st(a).rt / st(a).gp).slice(0, 15);
  const uid = W.protagonistId && P(W.protagonistId)?.teamId;
  const champs = W.history.filter((h) => h.comp === L.name).slice(-8).reverse();
  const tabs = { tabela: 'Classificação', rodadas: 'Rodadas', estatisticas: 'Estatísticas', clubes: 'Clubes' };
  let body = '';
  if (tab === 'tabela') {
    body = `<div class="card table-wrap"><table><thead><tr><th>#</th><th>Clube</th><th class="n">P</th><th class="n">J</th><th class="n">V</th><th class="n">E</th><th class="n">D</th><th class="n">GP</th><th class="n">GC</th><th class="n">SG</th><th>Forma</th></tr></thead><tbody>
      ${table.map((r, i) => `<tr class="${i === 0 ? 'zone-champ' : i < 3 || (L.rank === 1 && i === 3) ? 'zone-cs' : i >= table.length - 2 ? 'zone-low' : ''} ${r.teamId === uid ? 'me' : ''}"><td class="num">${i + 1}</td><td>${teamCell(r.teamId)}</td><td class="n"><b>${r.pts}</b></td><td class="n">${r.j}</td><td class="n">${r.v}</td><td class="n">${r.e}</td><td class="n">${r.d}</td><td class="n">${r.gp}</td><td class="n">${r.gc}</td><td class="n">${r.gp - r.gc}</td><td>${formIcons(r.form)}</td></tr>`).join('')}
    </tbody></table><p class="tiny muted" style="margin:10px 0 0">🟨 Campeão · 🟦 vaga na Copa Suprema dos Campeões (top 3${L.rank === 1 ? ' + 4º lugar' : ''}) · 🟥 zona de pressão</p></div>
    ${champs.length ? `<div class="card" style="margin-top:16px"><h3>Últimos campeões</h3>${champs.map((h) => `<div class="row" style="padding:4px 0"><span class="muted small" style="width:70px">${seasonLabel(h.season)}</span>${teamCell(h.teamId)}</div>`).join('')}</div>` : ''}`;
  } else if (tab === 'rodadas') {
    const sel = Number(new URLSearchParams(location.hash.split('?')[1] || '').get('r')) || round;
    const rd = L.fixtures[sel - 1] || [];
    body = `<div class="card"><div class="row" style="margin-bottom:12px">${Array.from({ length: 18 }, (_, i) => `<a class="chip ${sel === i + 1 ? 'on' : ''}" href="#/liga/${L.id}/rodadas?r=${i + 1}">${i + 1}</a>`).join('')}</div>
      ${!started ? '<p class="muted">O calendário é sorteado no início da temporada.</p>' : rd.map((g) => `<div class="spread" style="padding:9px 0;border-bottom:1px solid var(--line)"><div style="flex:1">${teamCell(g.h)}</div>${g.hg !== undefined ? `<a class="btn sm num" href="#/partida/${g.mid}">${g.hg} – ${g.ag}</a>` : '<span class="muted">x</span>'}<div style="flex:1;display:flex;justify-content:flex-end">${teamCell(g.a)}</div></div>`).join('')}</div>`;
  } else if (tab === 'estatisticas') {
    const list = (arr, val) => arr.map((p, i) => `<div class="row" style="padding:5px 0;border-bottom:1px solid var(--line)"><b class="num" style="width:20px">${i + 1}</b>${playerLink(p)}<b class="num" style="margin-left:auto">${val(p)}</b></div>`).join('');
    body = `<div class="grid g3"><div class="card"><h3>⚽ Artilharia</h3>${list(scorers, (p) => st(p).g)}</div><div class="card"><h3>🎯 Assistências</h3>${list(assists, (p) => st(p).a)}</div><div class="card"><h3>📈 Melhores notas</h3>${raters.length ? list(raters, (p) => (st(p).rt / st(p).gp).toFixed(2)) : '<p class="muted small">Sem jogos suficientes.</p>'}</div></div>`;
  } else {
    body = `<div class="grid g3">${L.teamIds.map(T).sort((a, b) => teamAvg(b) - teamAvg(a)).map((t) => `<a class="card row" href="#/time/${t.id}">${crest(t, 52)}<div style="flex:1;min-width:0"><b>${esc(t.name)}</b><div class="small muted">${esc(t.city)} · ${esc(t.stadium)}</div><div class="small">Técnico: ${esc(t.coach)}</div></div>${ovrBadge(teamAvg(t))}</a>`).join('')}</div>`;
  }
  return {
    html: `
    <div class="tabs">${W.leagues.map((x) => `<a href="#/liga/${x.id}/${tab}" class="${x.id === L.id ? 'on' : ''}">${x.rank}º ${esc(x.name)}</a>`).join('')}</div>
    <div class="page-head"><div><h1 style="color:${L.color === '#5b2bd1' ? '#a78bfa' : L.color}">${esc(L.name)}</h1><p>${esc(L.country)} · ${L.rank}ª liga mais competitiva do mundo · ${stars(L.stars)} · ${started ? weekLabel() : 'pré-temporada'}</p></div></div>
    <div class="tabs">${Object.entries(tabs).map(([k, v]) => `<a href="#/liga/${L.id}/${k}" class="${tab === k ? 'on' : ''}">${v}</a>`).join('')}</div>
    ${body}`,
  };
}

// ---------- clube ----------
const SPOTS = { GOL: [50, 90], LD: [84, 68], ZAG: [[38, 74], [62, 74]], LE: [16, 68], VOL: [50, 55], MC: [30, 44], MEI: [70, 44], PD: [83, 22], PE: [17, 22], ATA: [50, 14] };

export function pitchHTML(team) {
  let zag = 0;
  return `<div class="pitch">${team.squad.map((id, i) => {
    const p = P(id);
    let pos = SPOTS[FORMATION[i]];
    if (FORMATION[i] === 'ZAG') pos = pos[zag++];
    return `<a class="spot ${p.isUser ? 'user' : ''}" href="#/jogador/${p.id}" style="left:${pos[0]}%;top:${pos[1]}%">${thumbImg(p)}<b>${esc(p.name)}</b><small>${p.ovr}</small></a>`;
  }).join('')}</div>`;
}

export function viewTeam(id) {
  const t = T(id);
  if (!t) return { html: '<div class="card empty">Clube não encontrado.</div>' };
  const L = LG(t.leagueId);
  const all = [...t.squad, ...(t.bench || [])].map(P).filter(Boolean);
  const star = all.slice().sort((a, b) => b.ovr - a.ovr)[0];
  const recent = W.matchOrder.slice().reverse().map((mid) => W.matches[mid]).filter((m) => m && (m.home === id || m.away === id)).slice(0, 8);
  const news = W.news.filter((n) => n.teams.includes(id)).slice(0, 6);
  const titles = t.titles.slice().reverse();
  const pos = L ? leagueTable(L).findIndex((r) => r.teamId === id) + 1 : null;
  const tours = W.tournaments.filter((x) => x.teamIds.includes(id));
  return {
    html: `
    <div class="page-head" style="align-items:center">
      <div class="row" style="gap:16px">${crest(t, 84)}<div><h1 style="margin:0">${esc(t.name)}</h1><p>"${esc(t.nickname || t.short)}" · ${esc(t.city)} · ${L ? `<a href="#/liga/${L.id}">${esc(L.name)}</a>` : 'Clube independente'}</p></div></div>
      <div class="row">${ovrBadge(teamAvg(t), 'big')}</div>
    </div>
    <div class="kv" style="margin-bottom:18px">
      <div><small>Técnico</small><b>${esc(t.coach)}</b></div><div><small>Estádio</small><b>${esc(t.stadium)}</b></div><div><small>Torcida</small><b>${Math.max(0.2, t.fans).toFixed(1)} mi</b></div>
      <div><small>Fundação</small><b>${t.founded}</b></div><div><small>Posição na liga</small><b>${pos ? pos + 'º' : '—'}</b></div><div><small>Títulos</small><b>${t.titles.length}</b></div><div><small>Forma</small><b>${formIcons(t.form)}</b></div>
    </div>
    <p class="muted">${esc(teamProfile(t))}</p>
    <div class="grid g2">
      <div class="card"><h3>Escalação (4-3-3)</h3>${pitchHTML(t)}${t.bench?.length ? `<h4 style="margin-top:12px">Banco</h4>${t.bench.map(P).filter(Boolean).map((p) => `<div class="row" style="padding:4px 0">${playerLink(p)}${ovrBadge(p.ovr)}</div>`).join('')}` : ''}</div>
      <div class="stack">
        ${star ? `<div class="card"><h3>Craque do time</h3><div class="viewer" style="height:330px"><canvas id="team-viewer"></canvas><div class="hint">arraste para girar</div></div><div class="spread" style="margin-top:8px">${playerLink(star)}${ovrBadge(star.ovr)}</div></div>` : ''}
        <div class="card"><h3>Elenco</h3><div class="table-wrap"><table><thead><tr><th>Jogador</th><th class="n">Idade</th><th class="n">OVR</th><th class="n">J</th><th class="n">G</th><th class="n">A</th><th class="n">Valor</th></tr></thead><tbody>${all.map((p) => `<tr><td>${playerLink(p)}</td><td class="n">${p.age}</td><td class="n">${ovrBadge(p.ovr)}</td><td class="n">${p.season.gp}</td><td class="n">${p.season.g}</td><td class="n">${p.season.a}</td><td class="n">${fmtMoney(marketValue(p))}</td></tr>`).join('')}</tbody></table></div></div>
      </div>
    </div>
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>Últimos jogos</h3>${recent.length ? recent.map((m) => `<a class="spread" href="#/partida/${m.id}" style="padding:6px 0;border-bottom:1px solid var(--line)"><span class="small muted" style="width:120px">${esc(m.compName)}</span><span style="flex:1">${esc(T(m.home).short)} <b class="num">${m.hg} – ${m.ag}</b> ${esc(T(m.away).short)}</span></a>`).join('') : '<p class="muted small">Nenhum jogo disputado.</p>'}
      ${tours.length ? `<h4 style="margin-top:12px">Competições</h4><div class="row">${tours.map((x) => `<a class="chip" href="#/torneio/${x.id}">${esc(x.name)} ${'★'.repeat(x.stars)}</a>`).join('')}</div>` : ''}</div>
      <div class="card"><h3>Sala de troféus</h3>${titles.length ? `<div class="trophy-list">${titles.map((x) => `<span>🏆 ${esc(x.comp)} <b>${seasonLabel(x.season)}</b></span>`).join('')}</div>` : '<p class="muted small">Ainda sem títulos neste universo.</p>'}</div>
    </div>
    ${news.length ? `<div class="section-title"><h2>Notícias do clube</h2></div><div class="news-grid">${news.map(newsCard).join('')}</div>` : ''}`,
    mount(root) {
      const c = $('#team-viewer', root);
      if (c && star) mountViewer(c, star);
    },
  };
}

// ---------- jogador ----------
export function viewPlayer(id) {
  const p = P(id);
  if (!p) return { html: '<div class="card empty">Jogador não encontrado (pode ter se aposentado).</div>' };
  const t = T(p.teamId) || T(p.lastTeamId);
  const L = t && LG(t.leagueId);
  const keys = p.pos === 'GOL' ? ['gk', 'pac', 'pas', 'phy'] : ATTR_KEYS;
  const news = W.news.filter((n) => n.players.includes(id)).slice(0, 8);
  const rank = worldRanking(500).findIndex((r) => r.p.id === id) + 1;
  const awards = p.awards.slice().reverse();
  return {
    html: `
    <div class="player-head">
      <div class="viewer"><canvas id="pviewer"></canvas><div class="hint">arraste para girar o boneco</div></div>
      <div>
        <div class="row" style="gap:14px;margin-bottom:6px">${ovrBadge(p.ovr, 'big')}<div><h1 style="margin:0">${esc(p.name)} ${p.isUser ? '<span class="tag" style="background:#f43f5e">PROTAGONISTA</span>' : ''}${p.created ? '<span class="tag" style="background:#7c3aed">CRIADO POR VOCÊ</span>' : ''}</h1><div class="muted">${esc(p.first)} ${esc(p.last)} · ${nationOf(p.nation).flag} ${nationOf(p.nation).name} · ${p.age} anos</div></div></div>
        <div class="row" style="margin:10px 0 16px">${t ? teamCell(t.id, { size: 26 }) : ''}<span class="chip">${posName(p.pos)}</span><span class="chip">#${p.number ?? '—'}</span><span class="chip">${p.foot}</span><span class="chip">${playStyle(p)}</span><a class="chip" href="#/telechat/perfil/${p.id}">💬 TeleChat</a>${p.retired ? '<span class="chip">Aposentado</span>' : ''}${p.injury ? `<span class="chip" style="border-color:#dc2626">🚑 ${esc(p.injury.desc)} (${p.injury.weeks * 2} sem.)</span>` : ''}${p.suspended > 0 ? `<span class="chip" style="border-color:#dc2626">🟥 suspenso (${p.suspended})</span>` : ''}</div>
        <div class="kv">
          <div><small>Potencial</small><b>${p.pot}</b></div><div><small>Valor de mercado</small><b>${fmtMoney(marketValue(p))}</b></div><div><small>Ranking mundial</small><b>${rank ? rank + 'º' : '—'}</b></div><div><small>Fama</small><b>${Math.round(p.fame)}</b></div>
          <div><small>Moral</small><b>${Math.round(p.morale)}</b></div><div><small>Forma</small><b>${p.form >= 0 ? '+' : ''}${p.form.toFixed(1)}</b></div><div><small>Legado</small><b>${Math.round(p.legacy)}</b></div><div><small>Altura</small><b>${(p.look.height || 1.8).toFixed(2)} m</b></div>
        </div>
        <div class="grid g2" style="margin-top:16px">
          <div class="card"><h3>Atributos</h3>${keys.map((k) => `<div class="attr"><span>${ATTR_NAMES[k]}</span><div class="bar"><span style="width:${p.attrs[k]}%"></span></div><b class="num">${Math.round(p.attrs[k])}</b></div>`).join('')}
            <div class="row" style="margin-top:10px">${p.traits.map((k) => `<span class="chip" title="${esc(TRAITS[k]?.desc)}">${esc(TRAITS[k]?.name || k)}</span>`).join('')}</div></div>
          <div class="card"><h3>Temporada ${seasonLabel(W.season)}</h3><div class="kv"><div><small>Jogos</small><b>${p.season.gp}</b></div><div><small>Gols</small><b>${p.season.g}</b></div><div><small>Assist.</small><b>${p.season.a}</b></div><div><small>Nota</small><b>${seasonRating(p).toFixed(2)}</b></div><div><small>Melhor em campo</small><b>${p.season.motm}</b></div><div><small>Sem sofrer gols</small><b>${p.season.cs}</b></div><div><small>Cartões</small><b>🟨${p.season.yc} 🟥${p.season.rc}</b></div><div><small>Golaços</small><b>${p.season.golazos}</b></div></div></div>
        </div>
      </div>
    </div>
    <div class="grid g2" style="margin-top:18px">
      <div class="card"><div class="spread"><h3 style="margin:0">Perfil</h3>${W.settings.aiEnabled ? '<button class="btn sm" id="ai-bio">✦ Biografia com IA</button>' : ''}</div><div id="bio" style="margin-top:10px">${p.bioAI ? `<p>${esc(p.bioAI).replace(/\n+/g, '</p><p>')}</p><span class="ai-badge">✦ IA</span>` : scoutReport(p).map((x) => `<p>${esc(x)}</p>`).join('')}</div></div>
      <div class="card"><h3>Carreira</h3><div class="kv" style="margin-bottom:10px"><div><small>Jogos</small><b>${p.career.gp}</b></div><div><small>Gols</small><b>${p.career.g}</b></div><div><small>Assist.</small><b>${p.career.a}</b></div><div><small>Títulos</small><b>${p.trophies.length}</b></div></div>
        ${p.career.seasons.length ? `<div class="table-wrap"><table><thead><tr><th>Temp.</th><th>Clube</th><th class="n">J</th><th class="n">G</th><th class="n">A</th><th class="n">Nota</th></tr></thead><tbody>${p.career.seasons.slice().reverse().map((s) => `<tr><td>${seasonLabel(s.season)}</td><td>${teamCell(s.teamId, { short: true })}</td><td class="n">${s.gp}</td><td class="n">${s.g}</td><td class="n">${s.a}</td><td class="n">${s.rt.toFixed(2)}</td></tr>`).join('')}</tbody></table></div>` : '<p class="small muted">Primeira temporada neste universo.</p>'}</div>
    </div>
    <div class="grid g3" style="margin-top:16px">
      <div class="card"><h3>🏆 Títulos</h3>${p.trophies.length ? `<div class="trophy-list">${p.trophies.slice().reverse().map((x) => `<span>${esc(x.name)} <b>${seasonLabel(x.season)}</b></span>`).join('')}</div>` : '<p class="small muted">Nenhum título ainda.</p>'}</div>
      <div class="card"><h3>⭐ Prêmios</h3>${awards.length ? awards.slice(0, 30).map((a) => `<div class="small" style="padding:3px 0">${stars(a.stars)} ${esc(a.name)} <span class="muted">${seasonLabel(a.season)}</span></div>`).join('') : '<p class="small muted">Nenhum prêmio ainda.</p>'}</div>
      <div class="card"><h3>🔥 Polêmicas</h3>${p.controversies.length ? p.controversies.slice().reverse().map((c) => `<div class="small" style="padding:4px 0;border-bottom:1px solid var(--line)">${'🔴'.repeat(c.sev)} ${esc(c.title)} <span class="muted">${seasonLabel(c.season)}</span></div>`).join('') : '<p class="small muted">Ficha limpa.</p>'}</div>
    </div>
    ${news.length ? `<div class="section-title"><h2>Na imprensa</h2></div><div class="news-grid">${news.map(newsCard).join('')}</div>` : ''}`,
    mount(root) {
      mountViewer($('#pviewer', root), p);
      const b = $('#ai-bio', root);
      if (b) b.onclick = async () => {
        b.disabled = true;
        b.innerHTML = '<span class="loading"></span>';
        try {
          p.bioAI = await AI.writeBio(p);
          window.save();
          window.rerender();
        } catch (e) {
          toast(e.message, 4000);
          b.disabled = false;
          b.textContent = '✦ Biografia com IA';
        }
      };
    },
  };
}

// ---------- ranking ----------
export function viewRanking(tab = 'mundial') {
  const tabs = { mundial: 'Ranking mundial', gols: 'Artilheiros', assist: 'Assistências', notas: 'Melhores notas', legado: 'Hall da Fama', valor: 'Mais valiosos' };
  const active = Object.values(W.players).filter((p) => !p.retired && p.teamId);
  let rows;
  let val;
  if (tab === 'mundial') {
    rows = worldRanking(100).map((r) => r.p);
    val = (p) => ovrBadge(p.ovr);
  } else if (tab === 'gols') {
    rows = active.sort((a, b) => b.season.g - a.season.g || b.season.a - a.season.a).slice(0, 100);
    val = (p) => `<b>${p.season.g}</b> <span class="muted small">gols</span>`;
  } else if (tab === 'assist') {
    rows = active.sort((a, b) => b.season.a - a.season.a).slice(0, 100);
    val = (p) => `<b>${p.season.a}</b> <span class="muted small">assist.</span>`;
  } else if (tab === 'notas') {
    rows = active.filter((p) => p.season.gp >= Math.max(3, W.week / 3)).sort((a, b) => seasonRating(b) - seasonRating(a)).slice(0, 100);
    val = (p) => `<b>${seasonRating(p).toFixed(2)}</b>`;
  } else if (tab === 'valor') {
    rows = active.sort((a, b) => marketValue(b) - marketValue(a)).slice(0, 100);
    val = (p) => `<b>${fmtMoney(marketValue(p))}</b>`;
  } else {
    rows = Object.values(W.players).sort((a, b) => b.legacy - a.legacy).slice(0, 100);
    val = (p) => `<b>${Math.round(p.legacy)}</b> <span class="muted small">legado</span>`;
  }
  return {
    html: `
    <div class="page-head"><div><h1>Ranking</h1><p>${tab === 'mundial' ? 'Os 100 melhores jogadores do planeta neste momento (overall, forma, fama e legado).' : tab === 'legado' ? 'Pontos de legado: títulos, prêmios e feitos ao longo da carreira (inclui aposentados).' : `Temporada ${seasonLabel(W.season)}`}</p></div><a class="btn primary" href="#/criar-jogador">➕ Criar jogador</a></div>
    <div class="tabs">${Object.entries(tabs).map(([k, v]) => `<a href="#/ranking/${k}" class="${tab === k ? 'on' : ''}">${v}</a>`).join('')}</div>
    <div class="card table-wrap"><table><thead><tr><th>#</th><th>Jogador</th><th>Clube</th><th class="n">Idade</th><th class="n"></th></tr></thead><tbody>
    ${rows.map((p, i) => `<tr class="${p.isUser ? 'me' : ''}"><td class="num">${i + 1}</td><td>${playerLink(p)}</td><td>${p.teamId ? teamCell(p.teamId, { short: true }) : '<span class="muted small">aposentado</span>'}</td><td class="n">${p.age}</td><td class="n">${val(p)}</td></tr>`).join('')}
    </tbody></table></div>`,
  };
}

export { STAR_TIERS, tournamentTable };

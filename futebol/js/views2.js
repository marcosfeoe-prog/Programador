// Telas: torneios (e criação), prêmios (e criação), carreira do protagonista e ajustes.
import { W, P, T, LG, nationOf, posName, fmtMoney, teamAvg, seasonRating, SKIN_TONES, HAIR_COLORS, EYE_COLORS, HAIR_STYLES, HAIR_STYLE_NAMES, BEARDS, BEARD_NAMES, randomLook, ATTR_NAMES } from './world.js';
import { NATIONS, FORMATION, POS_INFO, TRAITS } from './data.js';
import { makeTournament, tournamentTable, createCustomTeam, CS_WEEKS } from './tournaments.js';
import { STAR_TIERS, CRITERIA, PERIODS, makeCustomAward, awardInstances, rankAward } from './awards.js';
import { newsTournamentCreated, newsAwardCreated } from './news.js';
import * as Career from './career.js';
import { FigureViewer, kitFor } from './avatar3d.js';
import { seasonLabel } from './text.js';
import * as AI from './ai.js';
import { mountViewer, disposeViewer } from './views.js';
import { $, $$, ovrBadge, thumbImg, playerLink, teamCell, toast, openModal, crest, stars, esc } from './ui.js';
import { shirtIcon } from './svg.js';

const IMPORTANCE = ['', 'Regional — torneio local, de alcance limitado', 'Nacional — competição de prestígio no país', 'Internacional — respeitado no continente', 'Cobiçado — entre os maiores do planeta', 'Lendário — importância máxima no futebol mundial'];

// ---------- torneios ----------
export function viewTournaments() {
  const list = W.tournaments;
  return {
    html: `
    <div class="page-head"><div><h1>Torneios</h1><p>A Copa Suprema dos Campeões é o torneio 5 estrelas oficial. Crie seus próprios torneios com no mínimo 10 clubes de 11 jogadores.</p></div><a class="btn primary" href="#/torneio-novo">+ Criar torneio</a></div>
    <div class="grid g3">
      ${W.leagues.map((L) => `<a class="card" href="#/liga/${L.id}"><div class="spread"><b>${esc(L.name)}</b>${stars(L.stars)}</div><div class="small muted">Liga nacional · ${L.rank}ª mais competitiva · 10 clubes · pontos corridos (turno e returno)</div></a>`).join('')}
      ${list.map((t) => `<a class="card" href="#/torneio/${t.id}" style="${t.stars >= 5 ? 'border-color:#a17f0e' : ''}"><div class="spread"><b>${esc(t.name)}</b>${stars(t.stars)}</div><div class="small muted">${t.builtIn ? 'Oficial' : 'Criado por você'} · ${t.teamIds.length} clubes · ${t.format === 'liga' ? 'pontos corridos' : 'mata-mata'} · ${t.edition}ª edição</div><div class="small" style="margin-top:6px">${t.done ? `🏆 Campeão: <b>${esc(T(t.champion)?.name)}</b>` : t.startAbs > (W.absWeek || 0) ? 'Começa na próxima semana' : `Em andamento — fase ${t.cur + 1}`}</div></a>`).join('')}
    </div>
    ${!list.length ? '<p class="muted" style="margin-top:14px">A Copa Suprema dos Campeões é sorteada quando a temporada começar.</p>' : ''}`,
  };
}

export function viewTournament(id) {
  const t = W.tournaments.find((x) => x.id === id);
  if (!t) return { html: '<div class="card empty">Torneio não encontrado.</div>' };
  let body = '';
  if (t.format === 'liga') {
    const tab = tournamentTable(t);
    body = `<div class="card table-wrap"><h3>Classificação</h3><table><thead><tr><th>#</th><th>Clube</th><th class="n">P</th><th class="n">J</th><th class="n">V</th><th class="n">E</th><th class="n">D</th><th class="n">SG</th></tr></thead><tbody>${tab.map((r, i) => `<tr class="${i === 0 ? 'zone-champ' : ''}"><td>${i + 1}</td><td>${teamCell(r.teamId)}</td><td class="n"><b>${r.pts}</b></td><td class="n">${r.j}</td><td class="n">${r.v}</td><td class="n">${r.e}</td><td class="n">${r.d}</td><td class="n">${r.gp - r.gc}</td></tr>`).join('')}</tbody></table></div>
    <div class="card" style="margin-top:16px"><h3>Rodadas</h3>${t.rounds.map((rd, i) => `<details ${i === t.cur - 1 ? 'open' : ''}><summary style="cursor:pointer;padding:6px 0"><b>${i + 1}ª rodada</b></summary>${rd.map((g) => `<div class="spread small" style="padding:4px 0">${teamCell(g.h, { short: true })}${g.hg !== undefined ? `<a class="btn sm" href="#/partida/${g.mid}">${g.hg} – ${g.ag}</a>` : '<span class="muted">x</span>'}${teamCell(g.a, { short: true })}</div>`).join('')}</details>`).join('')}</div>`;
  } else {
    const names = (n) => ({ 2: 'Final', 4: 'Semifinal', 8: 'Quartas', 16: 'Oitavas', 32: '16-avos' })[n] || `Fase de ${n}`;
    body = `<div class="card"><h3>Chaveamento</h3>${t.byes?.length ? `<p class="small muted">Classificados direto para a 2ª fase (cabeças de chave): ${t.byes.map((x) => esc(T(x).name)).join(', ')}</p>` : ''}<div class="bracket">${t.rounds.map((rd, i) => `<div class="col"><h4>${t.id === 'CS' ? Object.values(CS_WEEKS)[i] : names(2 ** Math.ceil(Math.log2(rd.length * 2 + (i === 0 ? t.byes?.length || 0 : 0))))}</h4>${rd.map((g) => {
      const played = g.hg !== undefined;
      const m = played && W.matches[g.mid];
      const w = played ? (g.pens ? g.pens.winner : g.hg > g.ag ? g.h : g.a) : null;
      return `<a class="bm" ${played ? `href="#/partida/${g.mid}"` : ''}><div class="${w === g.h ? 'w' : played ? 'l' : ''}">${teamCell(g.h, { link: false, short: true, size: 18 })}<span>${played ? g.hg + (g.pens ? ` (${g.pens.h})` : '') : ''}</span></div><div class="${w === g.a ? 'w' : played ? 'l' : ''}">${teamCell(g.a, { link: false, short: true, size: 18 })}<span>${played ? g.ag + (g.pens ? ` (${g.pens.a})` : '') : ''}</span></div>${m ? '' : ''}</a>`;
    }).join('')}</div>`).join('')}${t.champion ? `<div class="col"><h4>Campeão</h4><div class="bm" style="border-color:var(--gold);text-align:center">🏆 ${teamCell(t.champion, { link: false })}</div></div>` : ''}</div>${t.id === 'CS' ? `<p class="small muted">Calendário: oitavas na semana 5, quartas na 9, semifinal na 13 e final em campo neutro na semana 19.</p>` : ''}</div>`;
  }
  const scorers = t.teamIds.flatMap((id) => [...T(id).squad, ...(T(id).bench || [])]).map(P).filter((p) => p?.season.comp[t.id]?.g).sort((a, b) => b.season.comp[t.id].g - a.season.comp[t.id].g).slice(0, 10);
  return {
    html: `
    <div class="page-head"><div><h1>${esc(t.name)}</h1><p>${stars(t.stars)} ${IMPORTANCE[t.stars]} · ${t.format === 'liga' ? 'Pontos corridos' : 'Mata-mata'} · ${t.edition}ª edição${t.desc ? ' · ' + esc(t.desc) : ''}</p></div>
    ${!t.builtIn ? '<button class="btn danger sm" id="del-tour">Excluir torneio</button>' : ''}</div>
    ${body}
    <div class="grid g2" style="margin-top:16px">
      <div class="card"><h3>⚽ Artilheiros</h3>${scorers.length ? scorers.map((p, i) => `<div class="row" style="padding:4px 0"><b style="width:18px">${i + 1}</b>${playerLink(p)}<b style="margin-left:auto">${p.season.comp[t.id].g}</b></div>`).join('') : '<p class="small muted">Sem gols ainda.</p>'}</div>
      <div class="card"><h3>📜 Campeões</h3>${t.history.length ? t.history.slice().reverse().map((h) => `<div class="row" style="padding:4px 0"><span class="muted small" style="width:70px">${seasonLabel(h.season)}</span>${teamCell(h.champion)}</div>`).join('') : '<p class="small muted">Primeira edição em andamento.</p>'}
      <h4 style="margin-top:12px">Participantes</h4><div class="row">${t.teamIds.map((id) => `<a class="chip" href="#/time/${id}">${esc(T(id).short)}</a>`).join('')}</div></div>
    </div>`,
    mount(root) {
      const d = $('#del-tour', root);
      if (d) d.onclick = () => {
        if (!confirm(`Excluir o torneio "${t.name}"? Clubes e jogadores continuam existindo.`)) return;
        W.tournaments = W.tournaments.filter((x) => x !== t);
        window.save();
        location.hash = '#/torneios';
      };
    },
  };
}

const newTour = { name: '', stars: 3, format: 'liga', desc: '', recurring: true, sel: new Set() };

export function viewNewTournament() {
  const leagues = W.leagues;
  const custom = Object.values(W.teams).filter((t) => !t.leagueId);
  const teamRow = (t) => `<label class="tp"><input type="checkbox" data-team="${t.id}" ${newTour.sel.has(t.id) ? 'checked' : ''}/>${crest(t, 22)}<span style="flex:1">${esc(t.name)}</span>${ovrBadge(teamAvg(t))}</label>`;
  return {
    html: `
    <div class="page-head"><div><h1>Criar torneio</h1><p>Defina o nome, a importância no futebol mundial e escolha pelo menos 10 clubes (cada um com 11 jogadores).</p></div></div>
    <div class="grid g2">
      <div class="card">
        <div class="field"><label>Nome do torneio</label><input type="text" id="t-name" maxlength="48" placeholder="Ex.: Taça Intercontinental do Atlântico" value="${esc(newTour.name)}"/></div>
        <div class="field"><label>Importância no futebol</label><div class="star-pick" id="t-stars">${[1, 2, 3, 4, 5].map((s) => `<button class="opt ${newTour.stars === s ? 'on' : ''}" data-s="${s}"><b>${'★'.repeat(s)}</b>${STAR_TIERS[s].label}</button>`).join('')}</div><p class="small muted" id="t-imp" style="margin-top:6px">${IMPORTANCE[newTour.stars]}. Títulos mais importantes valem mais pontos para a Bola de Ouro e para o legado dos jogadores.</p></div>
        <div class="field"><label>Formato</label><div class="opt-grid" id="t-format"><button class="opt ${newTour.format === 'liga' ? 'on' : ''}" data-f="liga">Pontos corridos</button><button class="opt ${newTour.format === 'mata' ? 'on' : ''}" data-f="mata">Mata-mata</button></div></div>
        <div class="field"><label>Descrição (opcional)</label><textarea id="t-desc" rows="2" maxlength="200" placeholder="História e contexto do torneio">${esc(newTour.desc)}</textarea></div>
        <label class="row" style="color:var(--text)"><input type="checkbox" id="t-rec" ${newTour.recurring ? 'checked' : ''}/> Repetir a cada temporada</label>
        <hr style="border-color:var(--line);margin:16px 0"/>
        <h3>Criar um clube novo</h3>
        <div class="grid g2">
          <div class="field"><label>Nome</label><input type="text" id="c-name" maxlength="32" placeholder="Ex.: Atlético Horizonte"/></div>
          <div class="field"><label>Cidade</label><input type="text" id="c-city" maxlength="24" placeholder="Ex.: Nova Aurora"/></div>
          <div class="field"><label>País dos jogadores</label><select id="c-nation">${Object.entries(NATIONS).map(([k, n]) => `<option value="${k}">${n.flag} ${n.name}</option>`).join('')}</select></div>
          <div class="field"><label>Nível do elenco: <b id="c-lvl-v">72</b></label><input type="range" id="c-lvl" min="55" max="88" value="72"/></div>
        </div>
        <div class="row" style="margin-bottom:10px"><label style="margin:0">Cores</label><input type="color" id="c-c1" value="#0e7490"/><input type="color" id="c-c2" value="#fde047"/>
          <select id="c-pat" style="width:auto">${['solid', 'stripes', 'hoops', 'half', 'sash', 'chevron', 'band', 'sleeves'].map((p) => `<option value="${p}">${{ solid: 'Lisa', stripes: 'Listras verticais', hoops: 'Listras horizontais', half: 'Meio a meio', sash: 'Faixa diagonal', chevron: 'V no peito', band: 'Faixa horizontal', sleeves: 'Mangas contrastantes' }[p]}</option>`).join('')}</select><span id="c-prev">${shirtIcon('#0e7490', '#fde047', 'solid', 40)}</span></div>
        <button class="btn" id="c-add">+ Criar clube com 11 jogadores</button>
      </div>
      <div class="card">
        <div class="spread"><h3 style="margin:0">Participantes</h3><b id="t-count" class="num">${newTour.sel.size} selecionados</b></div>
        <div class="row" style="margin:10px 0"><button class="btn sm" id="t-rand">Sortear 10</button><button class="btn sm ghost" id="t-clear">Limpar</button></div>
        <div class="team-pick">${custom.length ? `<div class="lg">Clubes criados por você</div>${custom.map(teamRow).join('')}` : ''}${leagues.map((L) => `<div class="lg">${esc(L.name)}</div>${L.teamIds.map(T).map(teamRow).join('')}`).join('')}</div>
        <button class="btn primary" id="t-create" style="width:100%;margin-top:14px">Criar torneio</button>
        <p class="small muted" style="margin-top:8px">O torneio começa na próxima semana e joga uma rodada por semana, em paralelo às ligas.</p>
      </div>
    </div>`,
    mount(root) {
      const sync = () => {
        newTour.name = $('#t-name', root).value;
        newTour.desc = $('#t-desc', root).value;
        newTour.recurring = $('#t-rec', root).checked;
      };
      $$('#t-stars .opt', root).forEach((b) => (b.onclick = () => {
        sync();
        newTour.stars = Number(b.dataset.s);
        window.rerender();
      }));
      $$('#t-format .opt', root).forEach((b) => (b.onclick = () => {
        sync();
        newTour.format = b.dataset.f;
        window.rerender();
      }));
      $$('[data-team]', root).forEach((c) => (c.onchange = () => {
        c.checked ? newTour.sel.add(c.dataset.team) : newTour.sel.delete(c.dataset.team);
        $('#t-count', root).textContent = `${newTour.sel.size} selecionados`;
      }));
      $('#t-rand', root).onclick = () => {
        sync();
        const all = Object.keys(W.teams);
        newTour.sel = new Set(all.sort(() => Math.random() - 0.5).slice(0, 10));
        window.rerender();
      };
      $('#t-clear', root).onclick = () => {
        sync();
        newTour.sel.clear();
        window.rerender();
      };
      const prev = () => ($('#c-prev', root).innerHTML = shirtIcon($('#c-c1', root).value, $('#c-c2', root).value, $('#c-pat', root).value, 40));
      ['#c-c1', '#c-c2', '#c-pat'].forEach((s) => ($(s, root).oninput = prev));
      $('#c-lvl', root).oninput = (e) => ($('#c-lvl-v', root).textContent = e.target.value);
      $('#c-add', root).onclick = () => {
        sync();
        const name = $('#c-name', root).value.trim();
        if (name.length < 3) return toast('Dê um nome ao clube (mínimo 3 letras).');
        const t = createCustomTeam({ name, city: $('#c-city', root).value.trim() || name, colors: [$('#c-c1', root).value, $('#c-c2', root).value], pattern: $('#c-pat', root).value, level: $('#c-lvl', root).value, nation: $('#c-nation', root).value });
        newTour.sel.add(t.id);
        window.save();
        toast(`${t.name} criado com 11 jogadores!`);
        window.rerender();
      };
      $('#t-create', root).onclick = () => {
        sync();
        if (newTour.name.trim().length < 3) return toast('Dê um nome ao torneio.');
        if (newTour.sel.size < 10) return toast(`Selecione pelo menos 10 clubes (faltam ${10 - newTour.sel.size}).`);
        const t = makeTournament({ name: newTour.name.trim(), stars: newTour.stars, format: newTour.format, desc: newTour.desc.trim(), recurring: newTour.recurring, teamIds: [...newTour.sel] });
        W.tournaments.push(t);
        newsTournamentCreated(t);
        newTour.name = '';
        newTour.desc = '';
        newTour.sel = new Set();
        window.save();
        toast('Torneio criado!');
        location.hash = `#/torneio/${t.id}`;
      };
    },
  };
}

// ---------- prêmios ----------
function scopeLabel(a) {
  if (a.scope === 'all') return 'Mundial';
  if (a.scope === 'eachLeague') return 'Cada liga';
  if (a.scope.startsWith('league:')) return LG(a.scope.slice(7))?.name || 'Liga';
  if (a.scope.startsWith('comp:')) return W.tournaments.find((t) => t.id === a.scope.slice(5))?.name || 'Copa Suprema';
  return a.scope;
}

export function viewAwards() {
  const byStars = [5, 4, 3, 2, 1].map((s) => [s, W.awards.filter((a) => a.stars === s)]);
  const last = (a) => W.awardHistory.filter((h) => h.awardId === a.id).slice(-1)[0];
  return {
    html: `
    <div class="page-head"><div><h1>Prêmios</h1><p>Classificados por estrelas: do reconhecimento regional à Bola de Ouro. Crie seus próprios prêmios com valor e importância.</p></div><button class="btn gold" id="new-award">+ Criar prêmio</button></div>
    ${byStars.map(([s, list]) => `<section class="tier"><div class="tier-head"><h2 style="margin:0">${stars(s)} ${STAR_TIERS[s].label}</h2><span class="muted small">${STAR_TIERS[s].desc} · +${STAR_TIERS[s].legacy} de legado</span></div>
      <div class="grid g3">${list.map((a) => {
        const h = last(a);
        const pw = h && P(h.playerId);
        return `<a class="award-card s${s}" href="#/premio/${a.id}"><div class="spread"><b>${esc(a.name)}</b>${a.builtIn ? '' : '<span class="tag" style="background:#7c3aed">seu</span>'}</div><div class="small muted">${esc(a.desc || '')}</div><div class="tiny muted">${scopeLabel(a)} · ${CRITERIA[a.criterion]} · ${PERIODS[a.period]} · ${fmtMoney(a.prize)}</div>${pw ? `<div class="winner">${thumbImg(pw)}<span>Último: <b>${esc(pw.name)}</b><br><span class="muted tiny">${esc(h.name)} · ${seasonLabel(h.season)}</span></span></div>` : ''}</a>`;
      }).join('') || '<p class="muted small">Nenhum prêmio neste nível.</p>'}</div></section>`).join('')}`,
    mount(root) {
      $('#new-award', root).onclick = () => awardModal();
    },
  };
}

function awardModal() {
  const tours = W.tournaments;
  openModal(`
    <h2>Criar prêmio</h2>
    <div class="field"><label>Nome</label><input type="text" id="a-name" maxlength="48" placeholder="Ex.: Troféu Maestro do Meio-Campo"/></div>
    <div class="field"><label>Importância (estrelas)</label><div class="star-pick" id="a-stars">${[1, 2, 3, 4, 5].map((s) => `<button class="opt ${s === 3 ? 'on' : ''}" data-s="${s}"><b>${'★'.repeat(s)}</b>${STAR_TIERS[s].label}</button>`).join('')}</div></div>
    <div class="grid g2">
      <div class="field"><label>Critério</label><select id="a-crit">${Object.entries(CRITERIA).filter(([k]) => k !== 'roundbest').map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="field"><label>Abrangência</label><select id="a-scope"><option value="all">Mundial</option><option value="eachLeague">Cada liga (5 vencedores)</option>${W.leagues.map((L) => `<option value="league:${L.id}">${esc(L.name)}</option>`).join('')}${tours.map((t) => `<option value="comp:${t.id}">${esc(t.name)}</option>`).join('')}</select></div>
      <div class="field"><label>Frequência</label><select id="a-period"><option value="season">Fim de temporada (gala)</option><option value="month">Mensal</option></select></div>
      <div class="field"><label>Valor do prêmio (€ milhões)</label><input type="number" id="a-prize" min="0" max="50" step="0.05" value="0.5"/></div>
    </div>
    <div class="field"><label>Descrição</label><textarea id="a-desc" rows="2" maxlength="180" placeholder="O que esse prêmio representa?"></textarea></div>
    <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close>Cancelar</button><button class="btn gold" id="a-save">Criar prêmio</button></div>`, (card, close) => {
    let stars = 3;
    $$('#a-stars .opt', card).forEach((b) => (b.onclick = () => {
      stars = Number(b.dataset.s);
      $$('#a-stars .opt', card).forEach((x) => x.classList.toggle('on', x === b));
    }));
    $('#a-save', card).onclick = () => {
      const name = $('#a-name', card).value.trim();
      if (name.length < 3) return toast('Dê um nome ao prêmio.');
      const a = makeCustomAward({ name, stars, criterion: $('#a-crit', card).value, scope: $('#a-scope', card).value, period: $('#a-period', card).value, prize: Math.max(0, Number($('#a-prize', card).value) || 0), desc: $('#a-desc', card).value.trim() });
      W.awards.push(a);
      newsAwardCreated({ ...a, criterionLabel: CRITERIA[a.criterion] });
      window.save();
      close();
      toast('Prêmio criado! Ele será entregue automaticamente.');
      window.rerender();
    };
  });
}

export function viewAward(id) {
  const a = W.awards.find((x) => x.id === id);
  if (!a) return { html: '<div class="card empty">Prêmio não encontrado.</div>' };
  const hist = W.awardHistory.filter((h) => h.awardId === id).slice().reverse().slice(0, 60);
  const insts = awardInstances(a);
  const races = W.week > 0 ? insts.slice(0, 5).map((inst) => ({ inst, rank: rankAward({ ...a, minGames: Math.min(a.minGames, Math.floor(W.week / 2)) }, inst, 5) })) : [];
  return {
    html: `
    <div class="page-head"><div><h1>${esc(a.name)}</h1><p>${stars(a.stars)} ${STAR_TIERS[a.stars].label} · ${scopeLabel(a)} · ${CRITERIA[a.criterion]} · ${PERIODS[a.period]} · Premiação de ${fmtMoney(a.prize)}</p></div>${a.builtIn ? '' : '<button class="btn danger sm" id="del-award">Excluir prêmio</button>'}</div>
    ${a.desc ? `<p>${esc(a.desc)}</p>` : ''}
    <div class="grid g2">
      <div class="card"><h3>Favoritos agora</h3>${races.length ? races.map(({ inst, rank }) => `${insts.length > 1 ? `<h4 class="small muted" style="margin:10px 0 4px">${esc(inst.label)}</h4>` : ''}${rank.map((r, i) => `<div class="row" style="padding:4px 0"><b style="width:18px">${i + 1}</b>${playerLink(r.p)}</div>`).join('') || '<p class="small muted">Sem candidatos ainda.</p>'}`).join('') : '<p class="small muted">A disputa começa com a temporada.</p>'}</div>
      <div class="card"><h3>Vencedores</h3>${hist.length ? hist.map((h) => `<div class="row" style="padding:5px 0;border-bottom:1px solid var(--line)"><span class="muted small" style="width:80px">${seasonLabel(h.season)}${h.period === 'month' ? '' : ''}</span>${playerLink(P(h.playerId))}<span class="tiny muted" style="margin-left:auto;text-align:right">${esc(h.note || (insts.length > 1 ? LG(h.leagueId)?.name || '' : ''))}</span></div>`).join('') : '<p class="small muted">Ainda não foi entregue.</p>'}</div>
    </div>`,
    mount(root) {
      const d = $('#del-award', root);
      if (d) d.onclick = () => {
        if (!confirm('Excluir este prêmio?')) return;
        W.awards = W.awards.filter((x) => x !== a);
        window.save();
        location.hash = '#/premios';
      };
    },
  };
}

// ---------- carreira ----------
const draft = {
  step: 0, first: '', last: '', display: '', nation: 'BRA', age: 17, pos: 'ATA', foot: 'Destro', number: 10, traits: ['profissional'], talent: 'prodigio', league: 'AR', teamId: null,
  look: { skin: SKIN_TONES[3], hair: 'curto', hairColor: '#111111', eyes: EYE_COLORS[0], beard: 'nenhuma', height: 1.78, build: 1, boots: '#f59e0b' },
  kit: null,
};

function draftTeam() {
  if (!draft.teamId || !T(draft.teamId)) {
    const L = LG(draft.league);
    draft.teamId = L.teamIds.map(T).sort((a, b) => teamAvg(a) - teamAvg(b))[2].id;
  }
  return T(draft.teamId);
}
function draftPlayer() {
  return { name: draft.display || draft.last || 'Você', last: draft.last || draft.display || 'Você', number: draft.number, look: { ...draft.look, kit: draft.kit } };
}

export function viewCareer() {
  const p = Career.protagonist();
  return p ? careerDashboard(p) : careerCreator();
}

function careerCreator() {
  const team = draftTeam();
  const steps = ['Identidade', 'Aparência', 'Uniforme', 'Clube e talento'];
  const sw = (key, list, cls = 'swatch') => `<div class="swatches">${list.map((c) => `<span class="${cls} ${draft.look[key] === c ? 'on' : ''}" data-look="${key}" data-v="${c}" style="background:${c}" title="${c}"></span>`).join('')}</div>`;
  const opts = (key, list, names) => `<div class="opt-grid">${list.map((v) => `<button class="opt ${draft.look[key] === v ? 'on' : ''}" data-look="${key}" data-v="${v}">${names[v] || v}</button>`).join('')}</div>`;
  let form = '';
  if (draft.step === 0) {
    form = `<div class="grid g2">
      <div class="field"><label>Nome</label><input type="text" id="f-first" maxlength="18" value="${esc(draft.first)}" placeholder="Ex.: Lucas"/></div>
      <div class="field"><label>Sobrenome</label><input type="text" id="f-last" maxlength="20" value="${esc(draft.last)}" placeholder="Ex.: Valadares"/></div>
      <div class="field"><label>Nome de camisa / apelido</label><input type="text" id="f-display" maxlength="18" value="${esc(draft.display)}" placeholder="Ex.: Lukinha"/></div>
      <div class="field"><label>Nacionalidade</label><select id="f-nation">${Object.entries(NATIONS).map(([k, n]) => `<option value="${k}" ${draft.nation === k ? 'selected' : ''}>${n.flag} ${n.name}</option>`).join('')}</select></div>
      <div class="field"><label>Posição</label><select id="f-pos">${Object.entries(POS_INFO).map(([k, v]) => `<option value="${k}" ${draft.pos === k ? 'selected' : ''}>${v.name}</option>`).join('')}</select></div>
      <div class="field"><label>Pé preferido</label><select id="f-foot"><option ${draft.foot === 'Destro' ? 'selected' : ''}>Destro</option><option ${draft.foot === 'Canhoto' ? 'selected' : ''}>Canhoto</option></select></div>
      <div class="field"><label>Idade</label><select id="f-age">${[16, 17, 18, 19].map((a) => `<option ${draft.age === a ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
      <div class="field"><label>Número da camisa</label><input type="number" id="f-num" min="1" max="99" value="${draft.number}"/></div>
    </div>
    <div class="field"><label>Personalidade (até 2)</label><div class="opt-grid">${Object.entries(TRAITS).map(([k, t]) => `<button class="opt ${draft.traits.includes(k) ? 'on' : ''}" data-trait="${k}" title="${esc(t.desc)}">${t.name}</button>`).join('')}</div><p class="tiny muted" style="margin-top:6px">Traços como Temperamental, Baladeiro ou Marrento aumentam a chance de polêmicas.</p></div>`;
  } else if (draft.step === 1) {
    form = `
      <div class="field"><label>Tom de pele</label>${sw('skin', SKIN_TONES)}</div>
      <div class="field"><label>Cabelo</label>${opts('hair', HAIR_STYLES, HAIR_STYLE_NAMES)}</div>
      <div class="field"><label>Cor do cabelo</label>${sw('hairColor', HAIR_COLORS)}</div>
      <div class="field"><label>Cor dos olhos</label>${sw('eyes', EYE_COLORS)}</div>
      <div class="field"><label>Barba</label>${opts('beard', BEARDS, BEARD_NAMES)}</div>
      <div class="grid g2"><div class="field"><label>Altura: <b>${draft.look.height.toFixed(2)} m</b></label><input type="range" id="f-h" min="1.62" max="2.02" step="0.01" value="${draft.look.height}"/></div>
      <div class="field"><label>Porte físico</label><input type="range" id="f-b" min="0.88" max="1.18" step="0.01" value="${draft.look.build}"/></div></div>
      <div class="field"><label>Chuteira</label>${sw('boots', ['#111111', '#ffffff', '#e11d48', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#f97316', '#06b6d4', '#facc15'])}</div>
      <button class="btn sm" id="f-rand">🎲 Aparência aleatória</button>`;
  } else if (draft.step === 2) {
    const k = draft.kit || { primary: team.colors[0], secondary: team.colors[1], pattern: team.pattern };
    form = `<p class="muted small">Por padrão você usa o uniforme oficial do clube. Personalize para um uniforme alternativo (de treino, terceiro uniforme ou edição especial).</p>
      <div class="opt-grid" style="margin-bottom:14px"><button class="opt ${!draft.kit ? 'on' : ''}" id="kit-club">Uniforme do clube</button><button class="opt ${draft.kit ? 'on' : ''}" id="kit-custom">Personalizado</button></div>
      <div class="${draft.kit ? '' : 'hidden'}" id="kit-form">
        <div class="row field"><label style="margin:0;width:90px">Cor principal</label><input type="color" id="k-1" value="${k.primary}"/><label style="margin:0 0 0 12px;width:90px">Secundária</label><input type="color" id="k-2" value="${k.secondary}"/></div>
        <div class="field"><label>Padrão</label><div class="opt-grid">${['solid', 'stripes', 'hoops', 'half', 'sash', 'chevron', 'band', 'sleeves'].map((pt) => `<button class="opt ${k.pattern === pt ? 'on' : ''}" data-pat="${pt}">${shirtIcon(k.primary, k.secondary, pt, 34)}<br>${{ solid: 'Lisa', stripes: 'Listras', hoops: 'Horizontais', half: 'Meio a meio', sash: 'Faixa', chevron: 'V', band: 'Faixa reta', sleeves: 'Mangas' }[pt]}</button>`).join('')}</div></div>
        <div class="field"><label>Patrocínio no peito (opcional)</label><input type="text" id="k-sp" maxlength="12" value="${esc(k.sponsor || '')}" placeholder="Ex.: GALÁXIA"/></div>
      </div>`;
  } else {
    form = `<div class="field"><label>Liga inicial</label><div class="opt-grid">${W.leagues.map((L) => `<button class="opt ${draft.league === L.id ? 'on' : ''}" data-league="${L.id}">${esc(L.name)}<br><span class="tiny muted">${L.rank}ª liga</span></button>`).join('')}</div></div>
      <div class="field"><label>Clube</label><div class="team-pick" style="max-height:260px">${LG(draft.league).teamIds.map(T).sort((a, b) => teamAvg(b) - teamAvg(a)).map((t) => `<label class="tp"><input type="radio" name="team" value="${t.id}" ${draft.teamId === t.id ? 'checked' : ''}/>${crest(t, 22)}<span style="flex:1">${esc(t.name)}</span>${ovrBadge(teamAvg(t))}</label>`).join('')}</div><p class="tiny muted">Começar num clube menor garante minutos; num gigante, você precisa ganhar a posição.</p></div>
      <div class="field"><label>Talento</label><div class="opt-grid">${Object.entries(Career.TALENTS).map(([k, t]) => `<button class="opt ${draft.talent === k ? 'on' : ''}" data-talent="${k}">${t.name}<br><span class="tiny muted">potencial ${t.pot}</span></button>`).join('')}</div><p class="small muted" style="margin-top:6px">${Career.TALENTS[draft.talent].desc}</p></div>
      <button class="btn primary" id="f-start" style="width:100%">⚽ Começar carreira</button>`;
  }
  return {
    html: `
    <div class="page-head"><div><h1>Crie seu protagonista</h1><p>Torne-se o personagem principal deste universo. Seu objetivo: o topo do futebol mundial — títulos, prêmios e feitos lendários.</p></div></div>
    <div class="player-head">
      <div class="viewer"><canvas id="cviewer"></canvas><div class="hint">arraste para girar · prévia ao vivo</div></div>
      <div class="card">
        <div class="steps">${steps.map((s, i) => `<button class="${draft.step === i ? 'on' : ''}" data-step="${i}">${i + 1}. ${s}</button>`).join('')}</div>
        ${form}
        <div class="spread" style="margin-top:14px">${draft.step > 0 ? '<button class="btn ghost" id="f-prev">← Voltar</button>' : '<span></span>'}${draft.step < 3 ? '<button class="btn" id="f-next">Avançar →</button>' : ''}</div>
      </div>
    </div>`,
    mount(root) {
      const canvas = $('#cviewer', root);
      let v = null;
      try {
        disposeViewer();
        v = mountViewer(canvas, { ...draftPlayer(), teamId: team.id });
      } catch (e) {
        /* sem WebGL */
      }
      const refresh = () => {
        const t = draftTeam();
        v?.setFigure(draft.look, kitFor(draftPlayer(), t, draft.kit), t.colors[0] === '#ffffff' ? t.colors[1] : t.colors[0]);
      };
      refresh();
      const saveFields = () => {
        const val = (s) => $(s, root)?.value;
        if (draft.step === 0) {
          draft.first = val('#f-first').trim();
          draft.last = val('#f-last').trim();
          draft.display = val('#f-display').trim();
          draft.nation = val('#f-nation');
          draft.pos = val('#f-pos');
          draft.foot = val('#f-foot');
          draft.age = Number(val('#f-age'));
          draft.number = Math.max(1, Math.min(99, Number(val('#f-num')) || 10));
        }
        if (draft.step === 2 && draft.kit) {
          draft.kit.primary = val('#k-1');
          draft.kit.secondary = val('#k-2');
          draft.kit.sponsor = val('#k-sp').trim().toUpperCase();
        }
      };
      root.addEventListener('input', () => {
        saveFields();
        if (draft.step === 1) {
          draft.look.height = Number($('#f-h', root).value);
          draft.look.build = Number($('#f-b', root).value);
        }
        refresh();
      });
      $$('[data-step]', root).forEach((b) => (b.onclick = () => {
        saveFields();
        draft.step = Number(b.dataset.step);
        window.rerender();
      }));
      $('#f-next', root) && ($('#f-next', root).onclick = () => {
        saveFields();
        draft.step++;
        window.rerender();
      });
      $('#f-prev', root) && ($('#f-prev', root).onclick = () => {
        saveFields();
        draft.step--;
        window.rerender();
      });
      $$('[data-look]', root).forEach((el) => (el.onclick = () => {
        draft.look[el.dataset.look] = el.dataset.v;
        $$(`[data-look="${el.dataset.look}"]`, root).forEach((x) => x.classList.toggle('on', x === el));
        refresh();
      }));
      $$('[data-trait]', root).forEach((el) => (el.onclick = () => {
        saveFields();
        const k = el.dataset.trait;
        if (draft.traits.includes(k)) draft.traits = draft.traits.filter((x) => x !== k);
        else draft.traits = [...draft.traits, k].slice(-2);
        window.rerender();
      }));
      $('#f-rand', root) && ($('#f-rand', root).onclick = () => {
        const r = randomLook(draft.nation);
        Object.assign(draft.look, { skin: r.skin, hair: r.hair, hairColor: r.hairColor, eyes: r.eyes, beard: r.beard });
        window.rerender();
      });
      $('#kit-club', root) && ($('#kit-club', root).onclick = () => {
        draft.kit = null;
        window.rerender();
      });
      $('#kit-custom', root) && ($('#kit-custom', root).onclick = () => {
        const t = draftTeam();
        draft.kit = draft.kit || { primary: t.colors[1] === '#ffffff' ? '#111111' : t.colors[1], secondary: t.colors[0], pattern: 'solid', sponsor: '' };
        window.rerender();
      });
      $$('[data-pat]', root).forEach((el) => (el.onclick = () => {
        saveFields();
        draft.kit.pattern = el.dataset.pat;
        window.rerender();
      }));
      $$('[data-league]', root).forEach((el) => (el.onclick = () => {
        draft.league = el.dataset.league;
        draft.teamId = null;
        window.rerender();
      }));
      $$('input[name=team]', root).forEach((el) => (el.onchange = () => {
        draft.teamId = el.value;
        refresh();
      }));
      $$('[data-talent]', root).forEach((el) => (el.onclick = () => {
        draft.talent = el.dataset.talent;
        window.rerender();
      }));
      $('#f-start', root) && ($('#f-start', root).onclick = () => {
        if (!draft.first || !draft.last) {
          draft.step = 0;
          window.rerender();
          return toast('Preencha nome e sobrenome do seu jogador.');
        }
        const p = Career.createProtagonist({ ...draft, display: draft.display || `${draft.first} ${draft.last.split(' ').pop()}`, look: { ...draft.look, kit: draft.kit } });
        window.save();
        toast(`Bem-vindo ao ${T(p.teamId).name}, ${p.name}!`);
        window.rerender();
      });
    },
  };
}

function meter(label, v, color = 'var(--accent)') {
  return `<div class="meter"><span>${label}</span><div class="bar"><span style="width:${Math.max(0, Math.min(100, v))}%;background:${color}"></span></div><b class="num">${Math.round(v)}</b></div>`;
}

function careerDashboard(p) {
  const C = W.career;
  const t = T(p.teamId);
  const L = LG(t?.leagueId);
  const starter = Career.isStarter(p);
  const m = C.lastMatchId && W.matches[C.lastMatchId];
  const done = Career.GOALS.filter((g) => C.goals[g.key]).length;
  const rank = Career.worldRanking(600).findIndex((r) => r.p.id === p.id) + 1;
  const focusKeys = p.pos === 'GOL' ? ['gk', 'phy', 'pas', 'descanso'] : ['pac', 'sho', 'pas', 'dri', 'def', 'phy', 'descanso'];
  const windowOpen = W.week === 0 || W.week === 9 || W.week === 10 || W.week >= 19;
  return {
    html: `
    <div class="page-head"><div><h1>Minha carreira</h1><p>${esc(p.name)} · ${posName(p.pos)} · ${esc(t?.name || '')} · ${L ? esc(L.name) : ''}</p></div><div class="row"><a class="btn" href="#/jogador/${p.id}">Ver perfil público</a><button class="btn ghost" id="edit-look">✂️ Visual</button></div></div>
    <div class="player-head">
      <div class="stack">
        <div class="viewer" style="height:420px"><canvas id="myviewer"></canvas><div class="hint">arraste para girar</div></div>
        <div class="card"><h3>Status</h3>
          <div class="row" style="margin-bottom:10px">${ovrBadge(p.ovr, 'big')}<div><div><b>${starter ? '✅ Titular' : '🪑 Reserva'}</b> ${p.injury ? `· 🚑 ${esc(p.injury.desc)}` : ''}${p.suspended > 0 ? ' · 🟥 suspenso' : ''}</div><div class="small muted">Potencial ${p.pot} · ${p.age} anos · Ranking mundial ${rank ? rank + 'º' : '—'}</div></div></div>
          ${meter('Energia', C.energy, C.energy < 30 ? '#ef4444' : 'var(--accent)')}${meter('Confiança do técnico', C.coach, '#3b82f6')}${meter('Torcida', C.fans, '#f59e0b')}${meter('Moral', p.morale, '#a855f7')}${meter('Fama', p.fame, '#f43f5e')}
          <div class="kv" style="margin-top:10px"><div><small>Seguidores</small><b>${C.followers >= 1 ? C.followers.toFixed(1) + ' mi' : Math.round(C.followers * 1000) + ' mil'}</b></div><div><small>Patrimônio</small><b>${fmtMoney(C.money)}</b></div><div><small>Salário/sem.</small><b>${fmtMoney(C.wage)}</b></div><div><small>Legado</small><b>${Math.round(p.legacy)}</b></div></div>
        </div>
      </div>
      <div class="stack">
        <div class="card"><h3>🏋️ Treino da semana</h3><div class="opt-grid">${focusKeys.map((k) => `<button class="opt ${C.focus === k ? 'on' : ''}" data-focus="${k}">${Career.FOCUS[k]}${k !== 'descanso' ? `<br><b>${Math.round(p.attrs[k])}</b>` : ''}</button>`).join('')}</div><p class="tiny muted" style="margin-top:8px">O treino é aplicado ao avançar a semana. Energia baixa aumenta o risco de lesão.</p></div>
        ${C.pending.length ? C.pending.map((e) => `<div class="event-card"><b>📣 ${esc(e.title)}</b><p class="small" style="margin:6px 0 0">${esc(e.text)}</p><div class="opts">${e.options.map((o, i) => `<button class="btn" data-ev="${e.id}" data-opt="${i}">${esc(o.label)}<small>${esc(o.hint)}</small></button>`).join('')}</div></div>`).join('') : '<div class="card"><h3>📣 Decisões</h3><p class="small muted" style="margin:0">Nenhuma decisão pendente. Novos convites, entrevistas e dilemas surgem ao longo das semanas.</p></div>'}
        <div class="card"><h3>💼 Propostas</h3>${C.offers.length ? C.offers.map((o) => `<div class="offer">${crest(T(o.teamId), 40)}<div style="flex:1"><b>${esc(T(o.teamId).name)}</b><div class="small muted">${esc(LG(T(o.teamId).leagueId)?.name || '')} · ${esc(o.role)}</div><div class="small">Transferência: ${fmtMoney(o.fee)} · Salário: ${fmtMoney(o.wage)}/sem.</div></div>${windowOpen ? `<button class="btn primary sm" data-offer="${o.id}">Aceitar</button>` : '<span class="tiny muted">janela fechada</span>'}</div>`).join('') + `<button class="btn ghost sm" id="reject-offers">Recusar todas</button>` : '<p class="small muted" style="margin:0">Propostas chegam nas janelas de transferência (semana 9 e fim de temporada), se você estiver bem.</p>'}</div>
        ${m ? `<a class="card" href="#/partida/${m.id}"><h3>Último jogo</h3><div class="spread">${teamCell(m.home, { link: false, short: true })}<b class="num" style="font-size:1.4rem">${m.hg} – ${m.ag}</b>${teamCell(m.away, { link: false, short: true })}</div><div class="small muted" style="margin-top:6px">${esc(m.compName)} · sua nota: <b style="color:var(--text)">${m.ratings[p.id]?.toFixed(1) ?? '—'}</b></div></a>` : ''}
        <div class="card"><div class="spread"><h3 style="margin:0">🏔️ Rumo ao topo</h3><span class="small muted">${done}/${Career.GOALS.length}</span></div><div class="bar" style="margin:10px 0"><span style="width:${(done / Career.GOALS.length) * 100}%;background:linear-gradient(90deg,#f59e0b,var(--gold))"></span></div>${Career.GOALS.map((g) => `<div class="goal-item ${C.goals[g.key] ? 'done' : ''}"><i>${C.goals[g.key] ? '✓' : ''}</i><span>${esc(g.name)}</span><small class="muted">+${g.pts}</small></div>`).join('')}</div>
        <div class="card"><h3>📓 Diário</h3><div class="log">${C.log.map((l) => `<div><span class="muted tiny">T${l.season} S${l.week}</span> ${esc(l.text)}</div>`).join('') || '<p class="small muted">Sua história começa agora.</p>'}</div></div>
      </div>
    </div>`,
    mount(root) {
      mountViewer($('#myviewer', root), p);
      $$('[data-focus]', root).forEach((b) => (b.onclick = () => {
        C.focus = b.dataset.focus;
        window.save();
        window.rerender();
      }));
      $$('[data-ev]', root).forEach((b) => (b.onclick = () => {
        const r = Career.resolveEvent(b.dataset.ev, Number(b.dataset.opt));
        window.save();
        toast(r || 'Decisão registrada.', 3500);
        window.rerender();
      }));
      $$('[data-offer]', root).forEach((b) => (b.onclick = () => {
        if (!confirm('Aceitar esta proposta e mudar de clube?')) return;
        Career.acceptOffer(b.dataset.offer);
        window.save();
        toast('Transferência concluída!');
        window.rerender();
      }));
      const rj = $('#reject-offers', root);
      if (rj) rj.onclick = () => {
        C.offers = [];
        Career.log('Recusou as propostas e ficou no clube.');
        C.fans = Math.min(100, C.fans + 4);
        window.save();
        window.rerender();
      };
      $('#edit-look', root).onclick = () => lookModal(p);
    },
  };
}

function lookModal(p) {
  const L = { ...p.look };
  const sw = (key, list) => `<div class="swatches">${list.map((c) => `<span class="swatch ${L[key] === c ? 'on' : ''}" data-k="${key}" data-v="${c}" style="background:${c}"></span>`).join('')}</div>`;
  const opts = (key, list, names) => `<div class="opt-grid">${list.map((v) => `<button class="opt ${L[key] === v ? 'on' : ''}" data-k="${key}" data-v="${v}">${names[v]}</button>`).join('')}</div>`;
  openModal(`<h2>Mudar o visual</h2><div class="viewer" style="height:260px;margin-bottom:12px"><canvas id="lv"></canvas></div>
    <div class="field"><label>Cabelo</label>${opts('hair', HAIR_STYLES, HAIR_STYLE_NAMES)}</div>
    <div class="field"><label>Cor do cabelo</label>${sw('hairColor', HAIR_COLORS)}</div>
    <div class="field"><label>Barba</label>${opts('beard', BEARDS, BEARD_NAMES)}</div>
    <div class="field"><label>Chuteira</label>${sw('boots', ['#111111', '#ffffff', '#e11d48', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#f97316', '#06b6d4', '#facc15'])}</div>
    <div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close>Cancelar</button><button class="btn primary" id="lv-save">Salvar visual</button></div>`, (card, close) => {
    const t = T(p.teamId);
    let v = null;
    try {
      v = new FigureViewer($('#lv', card), { framing: 'bust', accent: t.colors[0] });
      v.setFigure(L, kitFor(p, t));
    } catch (e) {
      /* sem WebGL */
    }
    $$('[data-k]', card).forEach((el) => (el.onclick = () => {
      L[el.dataset.k] = el.dataset.v;
      $$(`[data-k="${el.dataset.k}"]`, card).forEach((x) => x.classList.toggle('on', x === el));
      v?.setFigure(L, kitFor(p, t));
    }));
    const cleanup = () => v?.dispose();
    $('#modal').addEventListener('click', function h(e) {
      if (e.target.id === 'modal' || e.target.closest('[data-close]')) {
        cleanup();
        this.removeEventListener('click', h);
      }
    });
    $('#lv-save', card).onclick = () => {
      p.look = L;
      cleanup();
      close();
      window.save();
      toast('Visual atualizado! A imprensa já comenta o novo estilo.');
      window.rerender();
    };
  });
}

// ---------- ajustes ----------
export function viewSettings() {
  const s = W.settings;
  return {
    html: `
    <div class="page-head"><div><h1>Ajustes</h1><p>Redação com IA, salvamento e um novo universo.</p></div></div>
    <div class="grid g2">
      <div class="card" style="border-color:#5b21b6"><h3>✦ Redação com IA (Claude)</h3>
        <p class="small muted">As notícias já são geradas automaticamente pelo motor do jogo. Com uma chave da API da Anthropic, você pode pedir que o Claude reescreva matérias e escreva biografias com ainda mais profundidade. A chave fica apenas neste navegador e é enviada direto para a Anthropic.</p>
        <label class="row" style="color:var(--text)"><input type="checkbox" id="ai-on" ${s.aiEnabled ? 'checked' : ''}/> Ativar redação com IA</label>
        <div class="field" style="margin-top:10px"><label>Chave da API</label><input type="password" id="ai-key" value="${esc(s.aiKey)}" placeholder="sk-ant-..." autocomplete="off"/></div>
        <div class="grid g2"><div class="field"><label>Modelo</label><select id="ai-model">${[['claude-opus-5-5', 'Claude Opus 5.5 (padrão)'], ['claude-sonnet-5-5', 'Claude Sonnet 5.5'], ['claude-haiku-5-5', 'Claude Haiku 5.5'], ['claude-fable-5-1', 'Claude Fable 5.1']].map(([v, n]) => `<option value="${v}" ${s.aiModel === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>
        <div class="field"><label>Esforço</label><select id="ai-effort">${['low', 'medium', 'high'].map((e) => `<option value="${e}" ${s.aiEffort === e ? 'selected' : ''}>${{ low: 'Baixo (rápido)', medium: 'Médio', high: 'Alto' }[e]}</option>`).join('')}</select></div></div>
        <div class="row"><button class="btn" id="ai-save">Salvar</button><button class="btn ghost" id="ai-test">Testar conexão</button></div>
      </div>
      <div class="card"><h3>💾 Salvamento</h3><p class="small muted">O universo é salvo automaticamente neste navegador a cada semana.</p>
        <div class="row"><button class="btn" id="exp">Exportar universo (.json)</button><label class="btn ghost" style="margin:0;color:var(--text)">Importar<input type="file" id="imp" accept=".json,application/json" hidden/></label></div>
        <hr style="border-color:var(--line);margin:16px 0"/>
        <h3>🌍 Novo universo</h3><p class="small muted">Gera novos jogadores para as 5 ligas. Todo o progresso atual será perdido.</p>
        <div class="row"><input type="number" id="seed" placeholder="Semente (opcional)" style="width:180px"/><button class="btn danger" id="reset">Criar novo universo</button></div>
      </div>
    </div>
    <div class="card" style="margin-top:16px"><h3>Sobre</h3><p class="small muted" style="margin:0">Gramado é um universo de futebol 100% fictício: clubes, jogadores, veículos de imprensa e acontecimentos são gerados proceduralmente. Semana ${W.week} · Temporada ${seasonLabel(W.season)} · ${Object.keys(W.players).length} jogadores · ${W.stats.newsCount} notícias publicadas.</p></div>`,
    mount(root) {
      const store = () => {
        s.aiEnabled = $('#ai-on', root).checked;
        s.aiKey = $('#ai-key', root).value.trim();
        s.aiModel = $('#ai-model', root).value;
        s.aiEffort = $('#ai-effort', root).value;
        window.save();
      };
      $('#ai-save', root).onclick = () => {
        store();
        toast('Ajustes da IA salvos.');
      };
      $('#ai-test', root).onclick = async (e) => {
        store();
        e.target.innerHTML = '<span class="loading"></span>';
        try {
          toast(await AI.testKey(), 3500);
        } catch (err) {
          toast(err.message, 4500);
        }
        e.target.textContent = 'Testar conexão';
      };
      $('#exp', root).onclick = () => window.exportWorld();
      $('#imp', root).onchange = (e) => e.target.files[0] && window.importWorld(e.target.files[0]);
      $('#reset', root).onclick = () => {
        if (!confirm('Criar um novo universo? Todo o progresso atual será perdido.')) return;
        window.newWorld(Number($('#seed', root).value) || undefined);
      };
    },
  };
}

export { seasonRating, ATTR_NAMES, nationOf, FORMATION };

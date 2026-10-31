// Menus e telas: início, partida rápida, carreira, torneios, clubes,
// configurações, ajuda, pausa, intervalo, fim de jogo e painel da temporada.
import { CLUBS, club, getSquad, STYLE_NAMES, CLIMATE_NAMES, POS_NAMES, ATTR_KEYS, ATTR_NAMES, clubStrength } from '../data/clubs.js';
import { WEATHERS, WEATHER_KEYS, TIMES, TIME_KEYS } from '../engine/weather.js';
import { DIFFICULTY } from '../engine/match.js';
import { FORMATION_KEYS, MENTALITY } from '../engine/team.js';
import { CAM_MODES, CAM_NAMES } from '../render/camera.js';
import { crestURL } from './crest.js';
import * as C from '../comp/career.js';
import { sortedTable } from '../comp/competitions.js';

export const QUALITY_NAMES = { baixa: 'Baixa', media: 'Média', alta: 'Alta', ultra: 'Ultra' };
export const DURATIONS = [2, 3, 4, 6, 8, 10];

// Cria elementos: h('div.cls#id', {onclick}, ...filhos)
export function h(sel, props, ...kids) {
  const m = sel.match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i);
  const el = document.createElement(m[1] || 'div');
  for (const part of m[2].match(/[.#][\w-]+/g) || []) {
    if (part[0] === '.') el.classList.add(part.slice(1));
    else el.id = part.slice(1);
  }
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    kids.unshift(props);
    props = null;
  }
  if (props) {
    for (const k in props) {
      const v = props[k];
      if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style') el.style.cssText = v;
      else if (v !== false && v != null) el.setAttribute(k, v === true ? '' : v);
    }
  }
  for (const k of kids.flat(3)) {
    if (k == null || k === false) continue;
    el.appendChild(k instanceof Node ? k : document.createTextNode(String(k)));
  }
  return el;
}

const crest = (c, size = 40) => h('img', { src: crestURL(c), width: size, height: Math.round(size * 1.2), alt: '' });
const ovrCls = (v) => 'ovr' + (v >= 82 ? ' hi' : v < 66 ? ' lo' : '');
const kitSwatch = (k) => {
  let bg = k.p;
  if (k.pattern === 'listras' || k.pattern === 'finas') bg = `repeating-linear-gradient(90deg, ${k.p} 0 5px, ${k.s} 5px 9px)`;
  else if (k.pattern === 'aros') bg = `repeating-linear-gradient(0deg, ${k.p} 0 6px, ${k.s} 6px 11px)`;
  else if (k.pattern === 'metades') bg = `linear-gradient(90deg, ${k.p} 50%, ${k.s} 50%)`;
  else if (k.pattern === 'faixa') bg = `linear-gradient(135deg, ${k.p} 40%, ${k.s} 40% 60%, ${k.p} 60%)`;
  else if (k.pattern === 'mangas') bg = `linear-gradient(90deg, ${k.s} 22%, ${k.p} 22% 78%, ${k.s} 78%)`;
  else if (k.pattern === 'quartos') bg = `conic-gradient(${k.s} 0 25%, ${k.p} 0 50%, ${k.s} 0 75%, ${k.p} 0)`;
  return h('span.kit', { style: `background:${bg}`, title: 'Uniforme' });
};

function chips(options, value, onChange) {
  const box = h('div.opt');
  const render = (v) => {
    box.innerHTML = '';
    for (const [k, label] of options) {
      box.appendChild(
        h('button.chip' + (k === v ? '.on' : ''), {
          onclick: () => {
            render(k);
            onChange(k);
          },
        }, label)
      );
    }
  };
  render(value);
  return box;
}

export class Menu {
  constructor(app) {
    this.app = app;
    this.root = document.getElementById('screens');
    this.quickCfg = { home: 'poc', away: 'aur', userSide: 0, weather: 'aleatorio', time: 'aleatorio' };
  }

  get s() {
    return this.app.settings;
  }

  show(el) {
    this.root.innerHTML = '';
    if (el) this.root.appendChild(el);
    this.root.scrollTop = 0;
  }
  clear() {
    this.root.innerHTML = '';
  }
  click() {
    this.app.audio.click();
  }

  screen(...kids) {
    return h('div.screen.stripes', h('div.wrap', ...kids));
  }
  top(title, back) {
    return h('div.topbar', h('button.btn.small', { onclick: () => (this.click(), back()) }, '← Voltar'), h('h2', title));
  }

  // Confirmação dentro da página (sem caixas do navegador).
  ask(text, yesLabel, onYes) {
    const dlg = h(
      'div.screen.overlay',
      h(
        'div.dialog',
        { style: 'max-width:440px' },
        h('p', { style: 'font-size:16px;margin:0 0 16px' }, text),
        h('div.row.end', h('button.btn', { onclick: () => dlg.remove() }, 'Cancelar'), h('button.btn.danger', { onclick: () => (dlg.remove(), onYes()) }, yesLabel))
      )
    );
    this.root.appendChild(dlg);
  }

  // ------------------------------------------------------------ início

  main() {
    const car = C.loadCareer('carreira');
    const tor = C.loadCareer('torneio');
    const b = (ic, title, desc, fn) => h('button.card-btn', { onclick: () => (this.click(), fn()) }, h('span.ic', ic), h('b', title), h('span', desc));
    this.show(
      this.screen(
        h('div.logo', 'GRAMADO'),
        h('div.sub', 'Futebol 3D com física realista · 30 clubes · campeonatos, carreira e climas'),
        h(
          'div.menu-main',
          b('⚽', 'Partida rápida', 'Escolha os clubes, o clima e o horário e vá para o jogo.', () => this.quick()),
          b('🏆', car ? 'Carreira (continuar)' : 'Carreira', car ? `${club(car.userClub).short} · temporada ${car.year}` : 'Série A e B, Copa Nacional, Taça Continental, acesso e rebaixamento.', () => this.careerEntry()),
          b('🥇', tor ? 'Torneios (continuar)' : 'Torneios', tor ? `${C.TOURNAMENTS[tor.kind].name} com ${club(tor.userClub).short}` : 'Copa Nacional, Liga Expressa, Taça Continental ou Copa Relâmpago.', () => this.tournamentEntry()),
          b('🛡️', 'Clubes', 'Os 30 clubes: estádios, cidades, climas, uniformes e elencos.', () => this.clubs()),
          b('⚙️', 'Configurações', 'Qualidade gráfica, câmera, som, narração e duração.', () => this.settings()),
          b('🎮', 'Como jogar', 'Controles no teclado, controle e toque.', () => this.help())
        ),
        h('p.note', { style: 'margin-top:22px' }, 'Dica: no celular, jogue com a tela deitada. No PC, um controle (gamepad) também funciona.')
      )
    );
  }

  // ------------------------------------------------------------ partida rápida

  clubPicker(id, onChange, label) {
    const box = h('div');
    const ids = CLUBS.map((c) => c.id);
    const render = () => {
      const c = club(id);
      const st = clubStrength(id);
      box.innerHTML = '';
      box.appendChild(
        h(
          'div.club-pick',
          h('button.arrow', { onclick: () => (this.click(), (id = ids[(ids.indexOf(id) + ids.length - 1) % ids.length]), render(), onChange(id)) }, '◀'),
          crest(c, 64),
          h('div', { style: 'flex:1;min-width:0' }, h('div.note', label), h('div.nm', c.short), h('div.meta', `${c.city} · ${c.stadium}`), h('div.meta', h('span', { class: ovrCls(Math.round(st.ovr)) }, Math.round(st.ovr)), ' ', STYLE_NAMES[c.style], ' · ', c.formation)),
          h('button.btn.small', { onclick: () => (this.click(), this.clubGrid(id, (nid) => ((id = nid), render(), onChange(nid)))) }, 'Lista'),
          h('button.arrow', { onclick: () => (this.click(), (id = ids[(ids.indexOf(id) + 1) % ids.length]), render(), onChange(id)) }, '▶')
        )
      );
    };
    render();
    return box;
  }

  clubGrid(sel, onPick, title = 'Escolha o clube') {
    const grid = h('div.clubs-grid');
    const dlg = h('div.screen.overlay', h('div.dialog', h('div.topbar', h('h2', title), h('div.spacer'), h('button.btn.small', { onclick: () => dlg.remove() }, 'Fechar')), grid));
    for (const c of CLUBS) {
      const st = clubStrength(c.id);
      grid.appendChild(
        h(
          'button.club-cell' + (c.id === sel ? '.on' : ''),
          {
            onclick: () => {
              this.click();
              dlg.remove();
              onPick(c.id);
            },
          },
          crest(c, 54),
          h('div.nm', c.short),
          h('div.meta', h('span', { class: ovrCls(Math.round(st.ovr)) }, Math.round(st.ovr)), ' ', c.city)
        )
      );
    }
    this.root.appendChild(dlg);
  }

  quick() {
    const q = this.quickCfg;
    const s = this.s;
    const weatherOpts = [['aleatorio', '🎲 Pelo clima da cidade'], ...WEATHER_KEYS.map((k) => [k, `${WEATHERS[k].icon} ${WEATHERS[k].name}`])];
    const timeOpts = [['aleatorio', '🎲 Aleatório'], ...TIME_KEYS.map((k) => [k, TIMES[k].name])];
    const go = () => {
      this.click();
      this.app.startQuick({ ...q, halfMinutes: s.halfMinutes, difficulty: s.difficulty });
    };
    this.show(
      this.screen(
        this.top('Partida rápida', () => this.main()),
        h('div.grid2', this.clubPicker(q.home, (id) => (q.home = id), 'Mandante (estádio)'), this.clubPicker(q.away, (id) => (q.away = id), 'Visitante')),
        h('h3', 'Você joga com'),
        chips(
          [
            [0, 'Mandante'],
            [1, 'Visitante'],
            [-1, 'Assistir (CPU × CPU)'],
          ],
          q.userSide,
          (v) => (q.userSide = v)
        ),
        h('h3', 'Clima'),
        chips(weatherOpts, q.weather, (v) => (q.weather = v)),
        h('h3', 'Horário'),
        chips(timeOpts, q.time, (v) => (q.time = v)),
        h('h3', 'Duração de cada tempo'),
        chips(DURATIONS.map((d) => [d, d + ' min']), s.halfMinutes, (v) => this.app.setSetting('halfMinutes', v)),
        h('h3', 'Dificuldade'),
        chips(Object.entries(DIFFICULTY).map(([k, d]) => [k, d.name]), s.difficulty, (v) => this.app.setSetting('difficulty', v)),
        h('div.row', { style: 'margin-top:22px' }, h('button.btn.pri', { onclick: go }, 'Começar partida ▶'))
      )
    );
  }

  // ------------------------------------------------------------ carreira

  careerEntry() {
    const car = C.loadCareer('carreira');
    if (car) {
      this.app.career = car;
      this.hub(car);
      return;
    }
    this.newCareer('carreira');
  }

  tournamentEntry() {
    const t = C.loadCareer('torneio');
    if (t) {
      this.app.career = t;
      this.hub(t);
      return;
    }
    this.tournaments();
  }

  newCareer(mode, kind = null) {
    let pick = mode === 'carreira' ? 'sab' : 'poc';
    const s = this.s;
    let diff = s.difficulty;
    let dur = s.halfMinutes;
    const info = h('div.panel');
    const sorted = CLUBS.slice().sort((a, b) => b.rating - a.rating).map((c) => c.id);
    const renderInfo = () => {
      const c = club(pick);
      const div = mode === 'carreira' ? (sorted.indexOf(pick) < 16 ? 'Série A' : 'Série B') : '';
      info.innerHTML = '';
      info.appendChild(
        h('div.row', crest(c, 64), h('div', h('div', { style: 'font-weight:800;font-size:20px' }, c.name), h('div.note', `${c.city} · ${c.stadium} (${c.capacity.toLocaleString('pt-BR')} lugares)`), h('div.note', `${div ? div + ' · ' : ''}${STYLE_NAMES[c.style]} · ${c.formation} · ${CLIMATE_NAMES[c.climate]}`)))
      );
    };
    const grid = h('div.clubs-grid');
    const renderGrid = () => {
      grid.innerHTML = '';
      for (const id of sorted) {
        const c = club(id);
        const st = clubStrength(id);
        grid.appendChild(
          h(
            'button.club-cell' + (id === pick ? '.on' : ''),
            { onclick: () => (this.click(), (pick = id), renderGrid(), renderInfo()) },
            crest(c, 50),
            h('div.nm', c.short),
            h('div.meta', h('span', { class: ovrCls(Math.round(st.ovr)) }, Math.round(st.ovr)), mode === 'carreira' ? (sorted.indexOf(id) < 16 ? ' Série A' : ' Série B') : '')
          )
        );
      }
    };
    renderGrid();
    renderInfo();
    const start = () => {
      this.click();
      this.app.setSetting('difficulty', diff);
      this.app.setSetting('halfMinutes', dur);
      const car = mode === 'carreira' ? C.newCareer({ userClub: pick, difficulty: diff, halfMinutes: dur }) : C.newTournament(kind, { userClub: pick, difficulty: diff, halfMinutes: dur });
      C.saveCareer(car);
      this.app.career = car;
      this.hub(car);
    };
    this.show(
      this.screen(
        this.top(mode === 'carreira' ? 'Nova carreira — escolha seu clube' : `${C.TOURNAMENTS[kind].name} — escolha seu clube`, () => (mode === 'carreira' ? this.main() : this.tournaments())),
        mode === 'carreira' ? h('p.note', 'Os 16 melhores começam na Série A e os outros 14 na Série B. Os 3 últimos da A caem e os 3 primeiros da B sobem. Os 7 primeiros da A e o campeão da Copa jogam a Taça Continental.') : h('p.note', C.TOURNAMENTS[kind].desc),
        info,
        h('h3', 'Dificuldade'),
        chips(Object.entries(DIFFICULTY).map(([k, d]) => [k, d.name]), diff, (v) => (diff = v)),
        h('h3', 'Duração de cada tempo'),
        chips(DURATIONS.map((d) => [d, d + ' min']), dur, (v) => (dur = v)),
        h('div.row', { style: 'margin:16px 0' }, h('button.btn.pri', { onclick: start }, 'Começar ▶')),
        grid
      )
    );
  }

  tournaments() {
    const b = (k) => h('button.card-btn', { onclick: () => (this.click(), this.newCareer('torneio', k)) }, h('b', C.TOURNAMENTS[k].name), h('span', C.TOURNAMENTS[k].desc));
    this.show(this.screen(this.top('Torneios', () => this.main()), h('div.menu-main', ...Object.keys(C.TOURNAMENTS).map(b))));
  }

  // Painel da temporada / torneio.
  hub(car, tab = 'next') {
    const u = club(car.userClub);
    const S = car.season;
    const title = car.mode === 'carreira' ? `Temporada ${car.year}` : C.TOURNAMENTS[car.kind].name;
    const tabs = [['next', 'Próximo jogo']];
    tabs.push(['cal', 'Calendário']);
    for (const [id, c] of Object.entries(S.comps)) tabs.push([id, C.compLabel(car, id)]);
    tabs.push(['art', 'Artilharia'], ['squad', 'Elenco'], ['hist', 'Histórico']);
    const body = h('div');
    const tabBar = h('div.tabs');
    const setTab = (t) => {
      tab = t;
      tabBar.innerHTML = '';
      for (const [k, l] of tabs) tabBar.appendChild(h('button.tab' + (k === tab ? '.on' : ''), { onclick: () => (this.click(), setTab(k)) }, l));
      body.innerHTML = '';
      body.appendChild(this.hubTab(car, tab));
    };
    const quit = () => {
      this.click();
      C.saveCareer(car);
      this.main();
    };
    const del = () =>
      this.ask(car.mode === 'carreira' ? 'Apagar esta carreira e começar outra?' : 'Abandonar este torneio?', car.mode === 'carreira' ? 'Apagar carreira' : 'Abandonar', () => {
        C.deleteCareer(car.mode);
        this.app.career = null;
        if (car.mode === 'carreira') this.newCareer('carreira');
        else this.tournaments();
      });
    this.show(
      this.screen(
        h('div.topbar', h('button.btn.small', { onclick: quit }, '← Menu'), crest(u, 36), h('h2', `${u.short} · ${title}`), h('div.spacer'), h('button.btn.small.danger', { onclick: del }, car.mode === 'carreira' ? 'Nova carreira' : 'Abandonar')),
        tabBar,
        body
      )
    );
    setTab(tab);
  }

  hubTab(car, tab) {
    const S = car.season;
    if (tab === 'next') return this.tabNext(car);
    if (tab === 'cal') return this.tabCalendar(car);
    if (tab === 'art') return this.tabScorers(car);
    if (tab === 'squad') return this.squadView(car.userClub);
    if (tab === 'hist') return this.tabHistory(car);
    const c = S.comps[tab];
    if (!c) return h('div');
    if (c.type === 'league') return this.tableView(car, c, tab);
    if (c.type === 'cup') return this.bracketView(car, c.rounds);
    if (c.type === 'groups') {
      const box = h('div');
      box.appendChild(h('div.grid2', ...c.groups.map((g) => h('div.panel', h('h3', g.name), this.tableEl(car, g.table, (i) => (i < 2 ? 'z-up' : ''))))));
      if (c.knockout) box.appendChild(h('div.panel', { style: 'margin-top:14px' }, h('h3', 'Mata-mata'), this.bracketView(car, c.knockout.rounds)));
      if (c.champion) box.appendChild(h('p', `🏆 Campeão: ${club(c.champion).short}`));
      return box;
    }
    return h('div');
  }

  tabNext(car) {
    const S = car.season;
    const box = h('div');
    if (S.done) {
      const s = car.lastSummary || car.history[car.history.length - 1];
      const p = h('div.panel');
      if (car.mode === 'carreira') {
        p.appendChild(h('h2', `Fim da temporada ${s.year}`));
        const L = (lbl, id) => (id ? h('div.row', h('span.note', { style: 'min-width:150px' }, lbl), crest(club(id), 24), club(id).short) : null);
        p.appendChild(L('Série A', s.champA));
        p.appendChild(L('Série B', s.champB));
        p.appendChild(L('Copa Nacional', s.copa));
        p.appendChild(L('Taça Continental', s.cont));
        p.appendChild(h('p', `Sobem: ${s.promoted.map((i) => club(i).short).join(', ')} · Caem: ${s.relegated.map((i) => club(i).short).join(', ')}`));
        if (s.topScorer) p.appendChild(h('p', `Artilheiro: ${s.topScorer.name} (${club(s.topScorer.club).short}) — ${s.topScorer.goals} gols`));
        p.appendChild(h('p', h('b', `Seu clube terminou em ${s.userPos.pos}º na Série ${s.userPos.div}.`)));
        p.appendChild(
          h('button.btn.pri', {
            onclick: () => {
              this.click();
              C.startNextSeason(car);
              C.saveCareer(car);
              this.hub(car);
            },
          }, 'Próxima temporada ▶')
        );
      } else {
        p.appendChild(h('h2', 'Torneio encerrado'));
        if (s.champion) p.appendChild(h('div.row', h('span', '🏆 Campeão:'), crest(club(s.champion), 36), h('b', club(s.champion).name)));
        p.appendChild(h('p', s.champion === car.userClub ? 'Parabéns, o título é seu!' : 'Não foi desta vez.'));
        p.appendChild(
          h('button.btn.pri', {
            onclick: () => {
              C.deleteCareer('torneio');
              this.app.career = null;
              this.tournaments();
            },
          }, 'Novo torneio')
        );
      }
      box.appendChild(p);
      return box;
    }
    const nx = C.peekUserMatch(car);
    const p = h('div.panel');
    if (nx && nx.fx) {
      const fx = nx.fx;
      const hc = club(fx.h);
      const ac = club(fx.a);
      const W = WEATHERS[fx.weather];
      p.appendChild(h('div.note', { style: 'text-align:center' }, `${C.compLabel(car, fx.comp)} · ${this.roundLabel(car, fx)} · ${nx.day.label}`));
      p.appendChild(h('div.next-match', h('div', crest(hc, 80), h('div', { style: 'font-weight:800' }, hc.short)), h('div.vs', 'x'), h('div', crest(ac, 80), h('div', { style: 'font-weight:800' }, ac.short))));
      p.appendChild(h('div.note', { style: 'text-align:center;margin:8px 0' }, `${hc.stadium} · previsão: ${W.icon} ${W.name} · ${TIMES[fx.time].name}${fx.knockout ? ' · mata-mata' : ''}`));
      const play = () => {
        this.click();
        const f = C.advanceToUserMatch(car);
        if (!f) return this.hub(car);
        this.app.startCareerMatch(car, f);
      };
      const sim = () => {
        this.click();
        const f = C.advanceToUserMatch(car);
        if (f) {
          C.simulateFixture(car, f);
          C.closeDay(car);
        }
        C.saveCareer(car);
        this.hub(car);
      };
      p.appendChild(h('div.row', { style: 'justify-content:center' }, h('button.btn.pri', { onclick: play }, 'Jogar ▶'), h('button.btn', { onclick: sim }, 'Simular')));
    } else if (nx && nx.pendingDraw) {
      p.appendChild(h('p', `Próxima data: ${nx.day.label} (sorteio da copa pendente).`));
      p.appendChild(
        h('button.btn.pri', {
          onclick: () => {
            const f = C.advanceToUserMatch(car);
            C.saveCareer(car);
            this.hub(car);
          },
        }, 'Avançar')
      );
    } else {
      p.appendChild(h('p', 'Seu clube não tem mais jogos nesta temporada.'));
      p.appendChild(
        h('button.btn.pri', {
          onclick: () => {
            this.click();
            C.advanceToUserMatch(car);
            C.saveCareer(car);
            this.hub(car);
          },
        }, 'Simular até o fim ▶')
      );
    }
    box.appendChild(p);
    // últimos resultados
    const cal = S.calendar;
    let last = null;
    for (let i = Math.min(S.cur, cal.length) - 1; i >= 0; i--) {
      if (cal[i].fixtures.some((f) => f.res)) {
        last = cal[i];
        break;
      }
    }
    if (last) {
      const lp = h('div.panel', { style: 'margin-top:14px' }, h('h3', `Resultados de ${last.label}`));
      for (const f of last.fixtures) lp.appendChild(this.fixtureRow(car, f));
      box.appendChild(lp);
    }
    // classificação resumida
    const mine = Object.entries(S.comps).find(([, c]) => c.type === 'league' && c.teams.includes(car.userClub));
    if (mine) {
      box.appendChild(h('div.panel', { style: 'margin-top:14px' }, h('h3', C.compLabel(car, mine[0])), this.tableEl(car, mine[1].table, this.zoneFn(car, mine[0]), 8)));
    }
    return box;
  }

  roundLabel(car, fx) {
    const c = car.season.comps[fx.comp];
    if (c.type === 'league') return `${fx.round + 1}ª rodada`;
    if (c.type === 'cup') return c.rounds[fx.round] ? c.rounds[fx.round].name : '';
    if (c.type === 'groups') return fx.group != null ? `${c.groups[fx.group].name} · ${fx.round + 1}ª rodada` : fx.final ? 'Final' : 'Semifinal';
    return '';
  }

  fixtureRow(car, f) {
    const hc = club(f.h);
    const ac = club(f.a);
    const me = f.h === car.userClub || f.a === car.userClub;
    const sc = f.res ? `${f.res.hg} - ${f.res.ag}${f.res.pens ? ` (${f.res.pens[0]}-${f.res.pens[1]} pên.)` : ''}` : 'x';
    return h('div.fixture' + (me ? '.me' : ''), h('div.h', hc.short, crest(hc, 18)), h('div.s', sc), h('div', crest(ac, 18), ac.short));
  }

  tabCalendar(car) {
    const box = h('div.panel');
    for (const d of car.season.calendar) {
      const f = C.userFixture(car, d);
      if (!f) continue;
      box.appendChild(h('div.row', h('span.note', { style: 'min-width:64px' }, d.label), h('span.note', { style: 'min-width:150px' }, `${C.compLabel(car, f.comp)} · ${this.roundLabel(car, f)}`), h('div', { style: 'flex:1' }, this.fixtureRow(car, f))));
    }
    if (!box.children.length) box.appendChild(h('p.note', 'As próximas fases da copa aparecem depois do sorteio.'));
    return box;
  }

  zoneFn(car, compId) {
    if (car.mode !== 'carreira') return () => '';
    if (compId === 'liga_a') return (i, n) => (i < 7 ? 'z-cont' : i >= n - 3 ? 'z-down' : '');
    if (compId === 'liga_b') return (i) => (i < 3 ? 'z-up' : '');
    return () => '';
  }

  tableView(car, c, id) {
    const box = h('div.panel', this.tableEl(car, c.table, this.zoneFn(car, id)));
    if (car.mode === 'carreira') box.appendChild(h('p.note', id === 'liga_a' ? 'Azul: vaga na Taça Continental · Vermelho: rebaixamento' : 'Verde: acesso à Série A'));
    return box;
  }

  tableEl(car, table, zone = () => '', limit = 99) {
    const rows = sortedTable(table, (i) => club(i).short);
    const t = h('table.tb', h('tr', h('th', '#'), h('th', 'Clube'), h('th.n', 'P'), h('th.n', 'J'), h('th.n', 'V'), h('th.n', 'E'), h('th.n', 'D'), h('th.n', 'SG'), h('th', 'Últimos')));
    let ui = rows.findIndex((r) => r.id === car.userClub);
    let from = 0;
    if (rows.length > limit) from = Math.max(0, Math.min(rows.length - limit, ui - Math.floor(limit / 2)));
    rows.slice(from, from + limit).forEach((r, k) => {
      const i = from + k;
      const c = club(r.id);
      const cls = [zone(i, rows.length), r.id === car.userClub ? 'me' : ''].filter(Boolean).join(' ');
      t.appendChild(
        h(
          'tr',
          { class: cls },
          h('td', i + 1),
          h('td', crest(c, 20), c.short),
          h('td.n', h('b', r.Pts)),
          h('td.n', r.P),
          h('td.n', r.W),
          h('td.n', r.D),
          h('td.n', r.L),
          h('td.n', r.GD > 0 ? '+' + r.GD : r.GD),
          h('td.form', ...r.form.map((x) => h('i', { class: x }, x)))
        )
      );
    });
    return t;
  }

  bracketView(car, rounds) {
    const b = h('div.bracket');
    for (const r of rounds) {
      const col = h('div.col', h('h3', r.name));
      for (const t of r.ties) {
        const me = t.h === car.userClub || t.a === car.userClub;
        const line = (id, g, p) => h('div', { class: t.winner === id ? 'w' : '' }, h('span', club(id).short), h('span', t.res ? `${g}${p != null ? ` (${p})` : ''}` : ''));
        col.appendChild(h('div.tie' + (me ? '.me' : ''), line(t.h, t.res && t.res.hg, t.res && t.res.pens && t.res.pens[0]), line(t.a, t.res && t.res.ag, t.res && t.res.pens && t.res.pens[1])));
      }
      b.appendChild(col);
    }
    return b;
  }

  tabScorers(car) {
    const box = h('div.panel');
    const list = C.topScorers(car, null, 20);
    const t = h('table.tb', h('tr', h('th', '#'), h('th', 'Jogador'), h('th', 'Clube'), h('th.n', 'Gols')));
    list.forEach((e, i) => t.appendChild(h('tr', { class: e.club === car.userClub ? 'me' : '' }, h('td', i + 1), h('td', e.name), h('td', crest(club(e.club), 20), club(e.club).short), h('td.n', h('b', e.goals)))));
    box.appendChild(list.length ? t : h('p.note', 'Ninguém marcou ainda.'));
    return box;
  }

  tabHistory(car) {
    const box = h('div');
    const tro = car.trophies[car.userClub];
    box.appendChild(h('div.panel', h('h3', 'Sala de troféus'), tro ? h('div', ...Object.entries(tro).map(([k, v]) => h('div', `🏆 ${k} × ${v}`))) : h('p.note', 'Ainda sem títulos.')));
    if (car.history.length) {
      const t = h('table.tb', h('tr', h('th', 'Ano'), h('th', car.mode === 'carreira' ? 'Série A' : 'Campeão'), car.mode === 'carreira' ? [h('th', 'Série B'), h('th', 'Copa'), h('th', 'Continental')] : null, h('th', 'Artilheiro')));
      for (const s of car.history.slice().reverse()) {
        const n = (id) => (id ? club(id).short : '—');
        t.appendChild(h('tr', h('td', s.year), h('td', n(s.champA || s.champion)), car.mode === 'carreira' ? [h('td', n(s.champB)), h('td', n(s.copa)), h('td', n(s.cont))] : null, h('td', s.topScorer ? `${s.topScorer.name} (${s.topScorer.goals})` : '—')));
      }
      box.appendChild(h('div.panel', { style: 'margin-top:14px' }, h('h3', 'Campeões'), t));
    }
    const uh = car.userHistory.slice(-12).reverse();
    if (uh.length) {
      const p = h('div.panel', { style: 'margin-top:14px' }, h('h3', 'Seus últimos jogos'));
      for (const g of uh) p.appendChild(h('div', `${g.home ? 'Casa' : 'Fora'} vs ${club(g.opp).short}: ${g.gf}-${g.ga}${g.pens ? ` (pên. ${g.home ? g.pens[0] : g.pens[1]}-${g.home ? g.pens[1] : g.pens[0]})` : ''} ${g.won === true ? '✅' : g.won === false ? '❌' : '➖'}`));
      box.appendChild(p);
    }
    return box;
  }

  squadView(clubId) {
    const sq = getSquad(clubId).slice().sort((a, b) => ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'].indexOf(a.pos) - ['GK', 'CB', 'LB', 'RB', 'DM', 'CM', 'AM', 'LW', 'RW', 'ST'].indexOf(b.pos) || b.ovr - a.ovr);
    const keys = ['pac', 'acc', 'sta', 'str', 'pas', 'sho', 'dri', 'con', 'tac', 'hea'];
    const t = h('table.tb', h('tr', h('th', 'Nº'), h('th', 'Jogador'), h('th', 'Pos'), h('th.n', 'Geral'), h('th.n', 'Idade'), ...keys.map((k) => h('th.n', { title: ATTR_NAMES[k] }, ATTR_NAMES[k].slice(0, 3)))));
    for (const p of sq) {
      t.appendChild(
        h(
          'tr',
          h('td', p.num),
          h('td', h('b', p.shirt), h('span.note', ' ' + p.name)),
          h('td', POS_NAMES[p.pos]),
          h('td.n', h('span', { class: ovrCls(p.ovr) }, p.ovr)),
          h('td.n', p.age),
          ...keys.map((k) => h('td.n', p.pos === 'GK' && ['sho', 'dri', 'tac'].includes(k) ? '–' : p.attr[k]))
        )
      );
    }
    return h('div.panel', { style: 'overflow-x:auto' }, t);
  }

  // ------------------------------------------------------------ clubes

  clubs() {
    const grid = h('div.clubs-grid');
    for (const c of CLUBS) {
      const st = clubStrength(c.id);
      grid.appendChild(h('button.club-cell', { onclick: () => (this.click(), this.clubDetail(c.id)) }, crest(c, 54), h('div.nm', c.short), h('div.meta', h('span', { class: ovrCls(Math.round(st.ovr)) }, Math.round(st.ovr)), ' ', c.city)));
    }
    this.show(this.screen(this.top('Os 30 clubes', () => this.main()), grid));
  }

  clubDetail(id) {
    const c = club(id);
    const st = clubStrength(id);
    this.show(
      this.screen(
        this.top(c.name, () => this.clubs()),
        h(
          'div.grid2',
          h('div.panel', h('div.row', crest(c, 90), h('div', h('div', { style: 'font-weight:800;font-size:22px' }, c.short), h('div.note', `“${c.nick}” · fundado em ${c.founded}`))),
            h('div.kv', { style: 'margin-top:12px' }, h('span', 'Cidade'), c.city, h('span', 'Estádio'), `${c.stadium} (${c.capacity.toLocaleString('pt-BR')} lugares)`, h('span', 'Clima'), CLIMATE_NAMES[c.climate], h('span', 'Altitude'), `${c.altitude} m${c.altitude > 1800 ? ' — ar rarefeito: a bola voa mais e cansa mais' : ''}`, h('span', 'Estilo'), STYLE_NAMES[c.style], h('span', 'Formação'), c.formation, h('span', 'Uniformes'), h('span', kitSwatch(c.home), ' ', kitSwatch(c.away)))),
          h('div.panel', h('h3', 'Força por setor'), h('div.kv', h('span', 'Goleiro'), Math.round(st.gk), h('span', 'Defesa'), Math.round(st.def), h('span', 'Meio-campo'), Math.round(st.mid), h('span', 'Ataque'), Math.round(st.att), h('span', 'Geral'), h('b', Math.round(st.ovr))))
        ),
        h('h3', 'Elenco'),
        this.squadView(id)
      )
    );
  }

  // ------------------------------------------------------------ configurações e ajuda

  settings() {
    const s = this.s;
    const vol = h('input', { type: 'range', min: 0, max: 100, value: Math.round(s.volume * 100), oninput: (e) => this.app.setSetting('volume', e.target.value / 100) });
    const tog = (k, label) => chips([[true, 'Ligado'], [false, 'Desligado']], !!s[k], (v) => this.app.setSetting(k, v));
    this.show(
      this.screen(
        this.top('Configurações', () => this.main()),
        h('h3', 'Qualidade gráfica'),
        chips(Object.entries(QUALITY_NAMES), s.quality, (v) => this.app.setSetting('quality', v)),
        h('p.note', 'Baixa: sem sombras reais, menos torcida e gramado em resolução menor (melhor no celular).'),
        h('h3', 'Câmera padrão'),
        chips(CAM_MODES.map((k) => [k, CAM_NAMES[k]]), s.camera, (v) => this.app.setSetting('camera', v)),
        h('h3', 'Volume'),
        vol,
        h('h3', 'Narração por voz (voz do navegador)'),
        tog('narration'),
        h('h3', 'Replay automático dos gols'),
        tog('autoReplay'),
        h('h3', 'Mostrar FPS'),
        tog('showFps'),
        h('h3', 'Controles de toque'),
        chips([['auto', 'Automático'], ['on', 'Sempre'], ['off', 'Nunca']], s.touch, (v) => this.app.setSetting('touch', v))
      )
    );
  }

  help() {
    const k = (...ks) => ks.map((x) => h('span.help-k', x));
    const row = (keys, a, d) => h('tr', h('td', ...keys), h('td', a), h('td', d || ''));
    const pc = h(
      'table.tb',
      h('tr', h('th', 'Teclas'), h('th', 'Com a bola'), h('th', 'Sem a bola')),
      row(k('W', 'A', 'S', 'D'), 'Mover (ou setas)', 'Mover'),
      row(k('Shift'), 'Correr', 'Correr'),
      row(k('J', 'Z'), 'Passe rasteiro (segure para mais força)', 'Desarme em pé'),
      row(k('K', 'X'), 'Chute (segure: força e altura)', 'Carrinho'),
      row(k('L', 'C'), 'Lançamento / cruzamento', 'Trocar de jogador'),
      row(k('I', 'V'), 'Enfiada (passe em profundidade)', 'Chamar companheiro para pressionar'),
      row(k('Q'), 'Segure com o chute: chute colocado (com efeito)', ''),
      row(k('E'), 'Segure com o chute: cavadinha', ''),
      row(k('Espaço'), 'Arrancada (toque longo)', 'Segure: conter (marcação de lado)'),
      row(k('Tab'), 'Trocar de jogador', 'Trocar de jogador'),
      row(k('B'), 'Mudar câmera', ''),
      row(k('R'), 'Replay dos últimos lances', ''),
      row(k('Esc', 'P'), 'Pausa', '')
    );
    this.show(
      this.screen(
        this.top('Como jogar', () => this.main()),
        h('div.panel', pc),
        h('h3', 'Controle (gamepad)'),
        h('p.note', 'Analógico esquerdo: mover · A: passe/desarme · B: chute/carrinho · X: enfiada/pressão · Y: lançamento · LB: trocar · RB (segurar): chute colocado · LT: cavadinha/conter · RT: correr · Start: pausa · Select: câmera.'),
        h('h3', 'Toque (celular)'),
        h('p.note', 'Joystick à esquerda. Botões à direita mudam quando você está sem a bola (desarme, carrinho, trocar, pressão). Segure Chute/Passe para carregar a força. "Efeito" deixa o próximo chute colocado.'),
        h('h3', 'Física e regras'),
        h('p.note', 'A bola tem arrasto aerodinâmico (com a crise de arrasto), efeito Magnus (curva e "folha seca"), quica e rola diferente no gramado seco, molhado, com poças ou neve, e voa mais na altitude. O vento desvia lançamentos. Jogadores aceleram, freiam e fazem curvas limitados pela tração e se cansam com o calor e a altitude. Valem impedimento, faltas, cartões, vantagem, recuo para o goleiro, laterais, escanteios, tiros de meta, pênaltis, acréscimos, prorrogação e disputa de pênaltis.')
      )
    );
  }

  // ------------------------------------------------------------ durante a partida

  pause(match, { onResume, onQuit, onCamera, onReplay, userSide }) {
    const team = userSide >= 0 ? match.teams[userSide] : null;
    const close = () => {
      dlg.remove();
      onResume();
    };
    const body = h('div');
    const dlg = h('div.screen.overlay', h('div.dialog', h('h2', 'Pausa'), body));
    const renderMain = () => {
      body.innerHTML = '';
      body.appendChild(
        h(
          'div.row',
          h('button.btn.pri', { onclick: close }, 'Continuar'),
          h('button.btn', { onclick: () => onCamera() }, 'Câmera: ' + CAM_NAMES[this.app.view ? this.app.view.cam.mode : 'tv']),
          h('button.btn', { onclick: () => (dlg.remove(), onReplay()) }, 'Replay'),
          team ? h('button.btn', { onclick: () => renderSubs() }, 'Substituições') : null,
          team ? h('button.btn', { onclick: () => renderTactics() }, 'Tática') : null,
          h('button.btn.danger', { onclick: () => this.ask('Sair da partida? O jogo em andamento será perdido.', 'Sair da partida', () => (dlg.remove(), onQuit())) }, 'Sair da partida')
        )
      );
      body.appendChild(h('h3', 'Estatísticas'));
      body.appendChild(this.statsEl(match));
    };
    const renderSubs = () => {
      body.innerHTML = '';
      body.appendChild(h('div.row', h('button.btn.small', { onclick: renderMain }, '← Voltar'), h('span.note', `Substituições restantes: ${team.subsLeft}`)));
      let out = null;
      const list = h('div.grid2');
      const left = h('div.panel', h('h3', 'Em campo (toque para tirar)'));
      const right = h('div.panel', h('h3', 'Reservas'));
      for (const p of team.active) {
        const b = h('button.btn.small', { style: 'display:block;width:100%;text-align:left;margin:3px 0', onclick: () => ((out = p), [...left.querySelectorAll('button')].forEach((x) => x.classList.remove('pri')), b.classList.add('pri')) }, `${p.data.num} ${p.name} · ${POS_NAMES[p.data.pos]} · fôlego ${Math.round(p.stamina * 100)}%${p.cards ? ' 🟨' : ''}`);
        left.appendChild(b);
      }
      for (const d of team.bench) {
        right.appendChild(
          h('button.btn.small', {
            style: 'display:block;width:100%;text-align:left;margin:3px 0',
            onclick: () => {
              if (!out || team.subsLeft <= 0) return;
              const np = team.substitute(out, d);
              if (np) {
                match.rebuildAll();
                match.say(`Substituição no ${team.club.short}: sai ${out.name}, entra ${np.name}.`, 'sub');
              }
              renderSubs();
            },
          }, `${d.num} ${d.shirt} · ${POS_NAMES[d.pos]} · ${d.ovr}`)
        );
      }
      list.appendChild(left);
      list.appendChild(right);
      body.appendChild(list);
    };
    const renderTactics = () => {
      body.innerHTML = '';
      body.appendChild(h('button.btn.small', { onclick: renderMain }, '← Voltar'));
      body.appendChild(h('h3', 'Mentalidade'));
      body.appendChild(chips(Object.entries(MENTALITY).map(([k, v]) => [Number(k), v]), team.mentality, (v) => (team.mentality = v)));
      body.appendChild(h('h3', 'Formação'));
      body.appendChild(chips(FORMATION_KEYS.map((f) => [f, f]), team.formation, (v) => (team.formation = v)));
      body.appendChild(h('p.note', 'A troca de formação reorganiza o posicionamento; os jogadores mantêm as funções de origem.'));
    };
    renderMain();
    this.root.appendChild(dlg);
    return dlg;
  }

  statsEl(match) {
    const [a, b] = match.teams.map((t) => match.statSummary(t));
    const row = (lbl, x, y, pct = false) => {
      const tot = x + y || 1;
      return h('div.statbar', h('div.l', pct ? x + '%' : x), h('div.m', lbl, h('div.bars', h('i', { style: `width:${(x / tot) * 100}%;background:${this.app.kits ? this.app.kits.team[0].p : '#3ddc84'}` }), h('i', { style: `width:${(y / tot) * 100}%;background:${this.app.kits ? this.app.kits.team[1].p : '#ffd23f'}` }))), h('div.r', pct ? y + '%' : y));
    };
    return h(
      'div',
      row('Posse de bola', a.possPct, b.possPct, true),
      row('Finalizações', a.shots, b.shots),
      row('No alvo', a.onTarget, b.onTarget),
      row('Gols esperados (xG)', Math.round(a.xg * 10) / 10, Math.round(b.xg * 10) / 10),
      row('Passes', a.passes, b.passes),
      row('Acerto de passes', a.passPct, b.passPct, true),
      row('Desarmes', a.tackles, b.tackles),
      row('Escanteios', a.corners, b.corners),
      row('Faltas', a.fouls, b.fouls),
      row('Impedimentos', a.offsides, b.offsides),
      row('Cartões amarelos', a.yellows, b.yellows),
      row('Cartões vermelhos', a.reds, b.reds),
      row('Defesas do goleiro', a.saves, b.saves)
    );
  }

  scoreHead(match) {
    const [t0, t1] = match.teams;
    const pens = match.penalties ? h('div.note', `Pênaltis: ${match.penalties.score[0]} - ${match.penalties.score[1]}`) : null;
    const goals = h('div.goals-list');
    const g0 = match.goals.filter((g) => g.team === 0);
    const g1 = match.goals.filter((g) => g.team === 1);
    const n = Math.max(g0.length, g1.length);
    const txt = (g) => (g ? `⚽ ${g.scorer ? g.scorer.shirt : ''} ${g.min}'${g.own ? ' (contra)' : g.pen ? ' (pên.)' : ''}` : '');
    for (let i = 0; i < n; i++) {
      goals.appendChild(h('div.r', txt(g0[i])));
      goals.appendChild(h('div', txt(g1[i])));
    }
    return h('div', h('div.final-score', h('div', crest(t0.club, 64), h('div', t0.club.short)), h('div', h('div.big', `${t0.score} - ${t1.score}`), pens), h('div', crest(t1.club, 64), h('div', t1.club.short))), goals);
  }

  halftime(match, label, onContinue) {
    const dlg = h('div.screen.overlay', h('div.dialog', h('h2', label), this.scoreHead(match), h('h3', 'Estatísticas'), this.statsEl(match), h('div.row', { style: 'margin-top:14px' }, h('button.btn.pri', { onclick: () => (dlg.remove(), onContinue()) }, 'Continuar ▶'))));
    this.root.appendChild(dlg);
  }

  fulltime(match, onDone) {
    // melhor em campo
    let best = null;
    for (const t of match.teams) for (const p of [...t.players, ...t.used]) if (!best || p.stats.rating > best.stats.rating) best = p;
    const dlg = h(
      'div.screen.overlay',
      h(
        'div.dialog',
        h('h2', 'Fim de jogo'),
        this.scoreHead(match),
        best ? h('p', `⭐ Melhor em campo: ${best.name} (${best.team.club.short}) — nota ${Math.min(10, best.stats.rating).toFixed(1)}`) : null,
        h('h3', 'Estatísticas'),
        this.statsEl(match),
        h('div.row', { style: 'margin-top:14px' }, h('button.btn.pri', { onclick: () => (dlg.remove(), onDone()) }, 'Continuar ▶'))
      )
    );
    this.root.appendChild(dlg);
  }
}

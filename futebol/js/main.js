// Inicialização, rotas, salvamento e controles de tempo.
import { W, P, setWorld, createWorld } from './world.js';
import { rng } from './rng.js';
import { defaultAwards } from './awards.js';
import { advanceWeek, weekLabel } from './season.js';
import { seasonLabel } from './text.js';
import { pushNews } from './news.js';
import * as V from './views.js';
import * as V2 from './views2.js';
import * as V3 from './views3.js';
import * as Tele from './telechat.js';
import { $, $$, hydrateThumbs, toast, confirmBox } from './ui.js';

const SAVE_KEY = 'gramado-save-v1';

function save() {
  try {
    W.rngState = rng.s;
    localStorage.setItem(SAVE_KEY, JSON.stringify(W));
  } catch (e) {
    // sem espaço: enxuga o arquivo de partidas e notícias e tenta de novo
    try {
      W.matchOrder.splice(0, W.matchOrder.length - 200).forEach((id) => delete W.matches[id]);
      W.news.length = Math.min(W.news.length, 250);
      localStorage.setItem(SAVE_KEY, JSON.stringify(W));
    } catch (e2) {
      toast('Não foi possível salvar (armazenamento cheio). Exporte o universo em Ajustes.', 5000);
    }
  }
}

function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const w = JSON.parse(raw);
    if (!w || w.version !== 1 || !w.players || !w.leagues) return null;
    return w;
  } catch (e) {
    return null;
  }
}

function newWorld(seed) {
  const w = createWorld(seed ?? Math.floor(Math.random() * 2 ** 31));
  w.awards = defaultAwards();
  w.absWeek = 0;
  rng.s = (Date.now() ^ (seed || 0)) >>> 0;
  pushNews({
    cat: 'analise',
    title: 'Bem-vindo ao Gramado: cinco ligas, cem clubes de sonho e um mundo inteiro de histórias',
    lede: 'The Premier League, La Liga Série A, Liga Brasileira A1, França League One e Primera Liga Argentina estão prontas para a temporada.',
    body: [
      'O universo do futebol está de pé: 50 clubes distribuídos em cinco ligas, cada um com 11 titulares, técnicos, estádios e torcidas próprias. A Premier League é a mais competitiva do mundo, seguida por La Liga Série A, Liga Brasileira A1, França League One e Primera Liga Argentina.',
      'Ao fim de cada temporada, a gala de premiação entrega troféus de 1 a 5 estrelas — do Craque da Rodada à Bola de Ouro. Você pode criar seus próprios torneios e prêmios, e até entrar em campo como protagonista desta história.',
      'Aperte "Avançar semana" para a bola rolar.',
    ],
    img: { type: 'trophy', stars: 5 },
    importance: 5,
  });
  setWorld(w);
  Tele.seedIfEmpty();
  save();
  location.hash = '#/';
  render();
}

function exportWorld() {
  const blob = new Blob([JSON.stringify(W)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `gramado-temporada-${W.season}-semana-${W.week}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function importWorld(file) {
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const w = JSON.parse(fr.result);
      if (w.version !== 1 || !w.players) throw new Error();
      setWorld(w);
      Tele.seedIfEmpty();
      save();
      toast('Universo importado!');
      location.hash = '#/';
      render();
    } catch (e) {
      toast('Arquivo inválido.');
    }
  };
  fr.readAsText(file);
}

// ---------- rotas ----------
let current = null;
function route() {
  const [path] = location.hash.replace(/^#/, '').split('?');
  const parts = path.split('/').filter(Boolean);
  const [a, b, c] = parts;
  switch (a) {
    case undefined:
      return ['feed', () => V.viewFeed()];
    case 'noticia':
      return ['feed', () => V.viewArticle(b)];
    case 'liga':
      return ['liga', () => V.viewLeague(b, c || 'tabela')];
    case 'time':
      return ['liga', () => V.viewTeam(b)];
    case 'jogador':
      return ['ranking', () => V.viewPlayer(b)];
    case 'partida':
      return ['liga', () => V.viewMatch(b)];
    case 'ranking':
      return ['ranking', () => V.viewRanking(b || 'mundial')];
    case 'torneios':
      return ['torneios', () => V2.viewTournaments()];
    case 'torneio':
      return ['torneios', () => V2.viewTournament(b)];
    case 'torneio-novo':
      return ['torneios', () => V2.viewNewTournament()];
    case 'premios':
      return ['premios', () => V2.viewAwards()];
    case 'premio':
      return ['premios', () => V2.viewAward(b)];
    case 'carreira':
      return ['carreira', () => V2.viewCareer()];
    case 'telechat':
      if (b === 'perfil') return ['telechat', () => V3.viewTeleProfile(c)];
      if (b === 'dm') return ['telechat', () => V3.viewTeleDM(c)];
      if (b === 'dms') return ['telechat', () => V3.viewTeleInbox()];
      return ['telechat', () => V3.viewTele(b || 'para-voce')];
    case 'criar-jogador':
      return ['criar', () => V3.viewCreatePlayer()];
    case 'ajustes':
      return ['ajustes', () => V2.viewSettings()];
    default:
      return ['feed', () => V.viewFeed()];
  }
}

function render(keepScroll = false) {
  const y = window.scrollY;
  V.disposeViewer();
  const [nav, fn] = route();
  let view;
  try {
    view = fn();
  } catch (e) {
    console.error(e);
    view = { html: `<div class="card empty">Ops, algo deu errado ao abrir esta tela.<br><small class="muted">${e.message}</small></div>` };
  }
  const root = $('#view');
  root.innerHTML = view.html;
  current = view;
  view.mount?.(root);
  hydrateThumbs(root);
  $$('#sidenav a').forEach((x) => x.classList.toggle('on', x.dataset.nav === nav));
  updateClock();
  if (keepScroll) window.scrollTo(0, y);
  else window.scrollTo(0, 0);
}

function updateClock() {
  $('#clock-season').innerHTML = `<span class="clock-word">Temporada </span>${seasonLabel(W.season)}`;
  $('#clock-week').textContent = `${weekLabel()}${W.week > 0 && W.week <= 18 ? ' de 18' : ''}`;
  const unread = W.tele?.unread || 0;
  $('#tele-badge').textContent = unread > 0 ? String(Math.min(99, unread)) : '';
  $('#tele-badge').hidden = !unread;
  $('#btn-advance').textContent = W.week === 0 ? '▶ Iniciar temporada' : W.week === 19 ? '▶ Gala de premiação' : '▶ Avançar semana';
}

let busy = false;
async function advance(n = 1) {
  if (busy) return;
  busy = true;
  const btns = [$('#btn-advance'), $('#btn-season')];
  btns.forEach((b) => (b.disabled = true));
  const startSeason = W.season;
  try {
    for (let i = 0; i < n; i++) {
      advanceWeek();
      if (W.season !== startSeason) break;
      if (n > 1) {
        $('#clock-week').textContent = `Simulando… ${weekLabel()}`;
        await new Promise((r) => setTimeout(r, 0));
      }
    }
  } catch (e) {
    console.error(e);
    toast('Erro na simulação: ' + e.message, 5000);
  }
  save();
  btns.forEach((b) => (b.disabled = false));
  busy = false;
  const fresh = W.news[0];
  const follows = (W.tele?.notifs || []).filter((x) => x.type === 'follow' && x.abs === W.absWeek);
  if (follows.length) toast(`TeleChat: ${follows.map((x) => P(x.pid)?.name).filter(Boolean).slice(0, 3).join(', ')} seguiu você de volta!`, 4000);
  else if (W.week === 0) toast(`Temporada encerrada! Confira os campeões e premiados.`, 4000);
  else if (fresh) toast(`${weekLabel()} concluída · ${fresh.title}`, 3500);
  const onFeed = route()[0] === 'feed' && !location.hash.includes('noticia');
  render(!onFeed);
}

// ---------- boot ----------
window.rerender = () => render(true);
window.save = save;
window.exportWorld = exportWorld;
window.importWorld = importWorld;
window.newWorld = newWorld;

const saved = load();
if (saved) {
  setWorld(saved);
  if (saved.rngState) rng.s = saved.rngState;
  Tele.seedIfEmpty();
  render();
} else newWorld();

window.addEventListener('hashchange', () => render());
$('#btn-advance').onclick = () => advance(1);
$('#btn-season').onclick = async () => {
  const left = 20 - W.week;
  if (W.week !== 0 && !(await confirmBox(`Simular as ${left} semanas restantes da temporada?`, 'Simular'))) return;
  advance(W.week === 0 ? 20 : left);
};

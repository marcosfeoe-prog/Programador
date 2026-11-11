// Telas e interação.
import { RAR, CARROS, POR_ID, MARCAS, CAIXAS, MISSOES, BONUS_MISSOES, PREMIO_MARCA, BONUS_DESTAQUE } from './data.js';
import { carSVG } from './art.js';
import * as G from './state.js';
import { JOGOS, abrirJogo } from './games.js';

const $ = (s) => document.querySelector(s);
const compacto = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const inteiro = new Intl.NumberFormat('pt-BR');
const fmt = (n) => (n < 10000 ? inteiro.format(Math.floor(n)) : compacto.format(n));
const moeda = (n) => `<i class="coin"></i>${fmt(n)}`;
const gema = (n) => `<i class="gem"></i>${fmt(n)}`;
const tag = (c) => `<span class="rar" style="--rc:${RAR[c.rar].cor}">${RAR[c.rar].nome}</span>`;

let tela = 'inicio';
const filtro = { busca: '', rar: -1, ordem: 'valor', aba: 'carros' };

// ---------- infraestrutura ----------
function toast(txt) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.innerHTML = txt;
  $('#toasts').append(t);
  setTimeout(() => t.remove(), 2600);
}
let aoClicarModal = null;
function modal(html, onClick = null) {
  $('#modal-box').innerHTML = html;
  $('#modal').classList.remove('hidden');
  aoClicarModal = onClick;
}
function fecharModal() {
  $('#modal').classList.add('hidden');
  aoClicarModal = null;
  desenhar();
}
const uiJogo = { show: (h, on) => { modal(h, on); topo(); }, close: fecharModal };

G.aoSubirNivel((n) => toast(`⭐ Nível ${n}! +5 <i class="gem"></i>`));

// ---------- cabeçalho e navegação ----------
function topo() {
  const pct = Math.min(100, (G.S.xp / G.xpMeta()) * 100);
  $('#top').innerHTML = `
    <div class="lvl" title="Nível"><b>${G.S.nivel}</b><div class="bar"><i style="width:${pct}%"></i></div></div>
    <div class="pill">${moeda(G.S.moedas)}</div>
    <div class="pill">${gema(G.S.gemas)}</div>
    <button class="icon-btn" data-a="config" aria-label="Opções">⚙</button>`;
}
const ABAS = [['inicio', 'Pista', '🏎️'], ['caixas', 'Caixas', '📦'], ['garagem', 'Garagem', '🏠'], ['jogos', 'Jogos', '🎲'], ['loja', 'Oficina', '🔧']];
function nav() {
  $('#nav').innerHTML = ABAS.map(([id, nome, ic]) =>
    `<button class="${id === tela ? 'on' : ''}" data-a="ir" data-v="${id}"><span>${ic}</span>${nome}</button>`).join('');
}
function desenhar() {
  topo();
  nav();
  $('#screen').innerHTML = TELAS[tela]();
  $('#screen').className = 't-' + tela;
}

// ---------- telas ----------
function turboTxt() {
  const t = Date.now();
  if (G.turboAtivo()) return `⚡ Turbo 3× · ${Math.ceil((G.S.turboAte - t) / 1000)}s`;
  if (t < G.S.turboPronto) return `Turbo em ${Math.ceil((G.S.turboPronto - t) / 1000)}s`;
  return '⚡ Ativar Turbo 3×';
}
const TELAS = {
  inicio() {
    const c = POR_ID[G.S.destaque];
    const pend = G.missoesPendentes();
    return `
      <div class="home-top">
        <button class="btn small ghost" data-a="missoes">📋 Missões${pend ? `<em class="badge">${pend}</em>` : ''}</button>
        <button class="btn small ${G.turboAtivo() ? 'hot' : ''}" id="turbo" data-a="turbo">${turboTxt()}</button>
      </div>
      <div class="stage" id="stage" style="--rc:${RAR[c.rar].cor}">
        <div class="car-tap" id="tap">${carSVG(c)}</div>
        <div class="plate"><b>${c.nome}</b> ${c.ano} ${tag(c)}</div>
      </div>
      <p class="hint">Toque no carro para ganhar moedas</p>
      <div class="stats3">
        <div><b id="pt">${moeda(G.valorToque())}</b><span>por toque</span></div>
        <div><b>${moeda(G.rendaSeg())}</b><span>por segundo</span></div>
        <div><b>+${Math.round((G.bonusColecao() - 1) * 100)}%</b><span>bônus da coleção</span></div>
      </div>`;
  },

  caixas() {
    return `<h1>Caixas</h1><p class="sub">Cada caixa traz um carro. As chances estão sempre à vista.</p>
      <div class="boxes">${CAIXAS.map((b) => `
        <div class="box-card" style="--rc:${b.cor}">
          <div class="crate"><i></i></div>
          <div class="box-info">
            <b>${b.nome}</b>
            <div class="odds">${b.chances.map((p, i) => (p ? `<span style="--rc:${RAR[i].cor}">${RAR[i].nome} ${String(p).replace('.', ',')}%</span>` : '')).join('')}</div>
            <div class="row">
              ${b.moedas ? `<button class="btn small" data-a="abrir" data-v="${b.id}" data-m="moedas" ${G.S.moedas < b.moedas ? 'disabled' : ''}>${moeda(b.moedas)}</button>` : ''}
              ${b.gemas ? `<button class="btn small blue" data-a="abrir" data-v="${b.id}" data-m="gemas" ${G.S.gemas < b.gemas ? 'disabled' : ''}>${gema(b.gemas)}</button>` : ''}
            </div>
          </div>
        </div>`).join('')}</div>`;
  },

  garagem() {
    return `
      <div class="stats3">
        <div><b>${moeda(G.valorGaragem())}</b><span>valor</span></div>
        <div><b>${G.totalCarros()}</b><span>carros</span></div>
        <div><b>${G.unicos()}/${CARROS.length}</b><span>únicos</span></div>
      </div>
      <div class="tabs">
        <button class="${filtro.aba === 'carros' ? 'on' : ''}" data-a="aba" data-v="carros">Meus carros</button>
        <button class="${filtro.aba === 'marcas' ? 'on' : ''}" data-a="aba" data-v="marcas">Marcas</button>
      </div>
      ${filtro.aba === 'carros' ? `
        <div class="filters">
          <input id="busca" type="search" placeholder="Buscar por nome ou marca" value="${filtro.busca.replace(/"/g, '&quot;')}" />
          <select id="ordem">${[['valor', 'Valor'], ['rar', 'Raridade'], ['nome', 'Nome'], ['qtd', 'Repetidos']].map(([v, t]) => `<option value="${v}" ${filtro.ordem === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
        </div>
        <div class="chips scroll"><button class="chip ${filtro.rar < 0 ? 'on' : ''}" data-a="rar" data-v="-1">Todos</button>${RAR.map((r, i) => `<button class="chip ${filtro.rar === i ? 'on' : ''}" style="--rc:${r.cor}" data-a="rar" data-v="${i}">${r.nome}</button>`).join('')}</div>
        <div class="grid" id="grid">${grade()}</div>` : marcas()}`;
  },

  jogos() {
    return `<h1>Minijogos</h1><p class="sub">Tudo aqui usa só moedas do jogo.</p>
      <div class="list">${JOGOS.map((j) => `
        <button class="game-row" data-a="jogo" data-v="${j.id}"><span class="gi">${j.ic}</span><div><b>${j.nome}</b><small>${j.desc}</small></div><em>Jogar</em></button>`).join('')}</div>`;
  },

  loja() {
    const of = G.ofertasDoDia();
    const fim = new Date(); fim.setHours(24, 0, 0, 0);
    const h = Math.floor((fim - Date.now()) / 3600000), m = Math.floor(((fim - Date.now()) % 3600000) / 60000);
    const troca = G.valorToque() * 400;
    return `<h1>Oficina</h1>
      <h3>Melhorias</h3>
      <div class="list">
        <div class="up-row"><span class="gi">👆</span><div><b>Motor de toque · nv ${G.S.toqueNv}</b><small>+45% de moedas por toque</small></div>
          <button class="btn small" data-a="up" data-v="toque" ${G.S.moedas < G.custoToque() ? 'disabled' : ''}>${moeda(G.custoToque())}</button></div>
        <div class="up-row"><span class="gi">🤝</span><div><b>Patrocínio · nv ${G.S.rendaNv}</b><small>Moedas por segundo, até com o jogo fechado</small></div>
          <button class="btn small" data-a="up" data-v="renda" ${G.S.moedas < G.custoRenda() ? 'disabled' : ''}>${moeda(G.custoRenda())}</button></div>
        <div class="up-row"><span class="gi">💱</span><div><b>Trocar gemas</b><small>10 gemas por ${fmt(troca)} moedas</small></div>
          <button class="btn small blue" data-a="troca" ${G.S.gemas < 10 ? 'disabled' : ''}>${gema(10)}</button></div>
      </div>
      <h3>Ofertas do dia <small>renova em ${h}h ${m}min</small></h3>
      <div class="grid">${of.map((o, i) => `
        <div class="card" style="--rc:${RAR[o.carro.rar].cor}">${carSVG(o.carro)}<b>${o.carro.nome}</b>${tag(o.carro)}
          ${G.S.diario.comprado[i] ? '<button class="btn small" disabled>Comprado</button>' : `<button class="btn small blue" data-a="oferta" data-v="${i}" ${G.S.gemas < o.gemas ? 'disabled' : ''}>${gema(o.gemas)}</button>`}
        </div>`).join('')}</div>`;
  },
};

function grade() {
  const q = filtro.busca.trim().toLowerCase();
  let l = CARROS.filter((c) => G.qtd(c.id) && (filtro.rar < 0 || c.rar === filtro.rar) && (!q || c.nome.toLowerCase().includes(q)));
  const ord = {
    valor: (a, b) => b.valor - a.valor,
    rar: (a, b) => b.rar - a.rar || b.valor - a.valor,
    nome: (a, b) => a.nome.localeCompare(b.nome),
    qtd: (a, b) => G.qtd(b.id) - G.qtd(a.id) || b.valor - a.valor,
  };
  l.sort(ord[filtro.ordem]);
  if (!l.length) return '<p class="empty">Nenhum carro aqui ainda. Abra caixas para aumentar a coleção.</p>';
  return l.map((c) => `
    <button class="card" style="--rc:${RAR[c.rar].cor}" data-a="carro" data-v="${c.id}">
      ${G.qtd(c.id) > 1 ? `<em class="count">×${G.qtd(c.id)}</em>` : ''}${c.id === G.S.destaque ? '<em class="star">★</em>' : ''}
      ${carSVG(c)}<b>${c.nome}</b><span>${moeda(c.valor)}</span>
    </button>`).join('');
}
function marcas() {
  return `<div class="list">${MARCAS.map((m) => {
    const l = CARROS.filter((c) => c.marca === m);
    const tem = l.filter((c) => G.qtd(c.id)).length;
    const pago = G.S.marcas[m];
    return `<div class="brand"><div class="brand-head"><b>${m}</b><span>${tem}/${l.length}</span>
      ${pago ? '<em class="done">✓ Completa</em>' : tem === l.length ? `<button class="btn small blue" data-a="marca" data-v="${m}">Resgatar ${gema(PREMIO_MARCA)}</button>` : `<small>Prêmio: ${gema(PREMIO_MARCA)}</small>`}</div>
      <div class="brand-cars">${l.map((c) => `<div class="${G.qtd(c.id) ? '' : 'missing'}" style="--rc:${RAR[c.rar].cor}" ${G.qtd(c.id) ? `data-a="carro" data-v="${c.id}"` : ''}>${carSVG(c)}<small>${G.qtd(c.id) ? c.modelo : '???'}</small></div>`).join('')}</div></div>`;
  }).join('')}</div>`;
}

// ---------- modais ----------
function ficha(c) {
  return `<div class="specs"><div><b>${c.cv}</b><span>cv</span></div><div><b>${c.vmax}</b><span>km/h</span></div><div><b>${String(c.acel).replace('.', ',')}s</b><span>0–100</span></div><div><b>${c.ano}</b><span>ano</span></div></div>`;
}
function modalCarro(id) {
  const c = POR_ID[id], n = G.qtd(id), unico = G.totalCarros() <= 1;
  modal(`<div class="reveal" style="--rc:${RAR[c.rar].cor}">${carSVG(c)}</div>
    <h2>${c.nome}</h2><p class="sub">${tag(c)} · você tem ${n} · vale ${moeda(c.valor)}</p>${ficha(c)}
    <p class="sub">Na pista: +${Math.round(BONUS_DESTAQUE[c.rar] * 100)}% de moedas por toque</p>
    <button class="btn" data-a="destacar" data-v="${id}" ${G.S.destaque === id ? 'disabled' : ''}>${G.S.destaque === id ? '★ Está na pista' : 'Colocar na pista'}</button>
    <div class="row">
      <button class="btn ghost" data-a="vender" data-v="${id}" data-n="1" ${unico ? 'disabled' : ''}>Vender 1 · ${moeda(G.precoVenda(c))}</button>
      ${n > 1 ? `<button class="btn ghost" data-a="vender" data-v="${id}" data-n="${n - 1}">Vender repetidos · ${moeda(G.precoVenda(c) * (n - 1))}</button>` : ''}
    </div>
    <button class="btn ghost" data-a="fechar">Fechar</button>`);
}
function modalMissoes() {
  modal(`<h2>Missões do dia</h2><div class="list">${MISSOES.map((m) => {
    const p = Math.min(G.S.diario.prog[m.id] || 0, m.meta), pago = G.S.diario.pago[m.id];
    return `<div class="mission"><div><b>${m.txt}</b><div class="bar"><i style="width:${(p / m.meta) * 100}%"></i></div><small>${fmt(p)}/${fmt(m.meta)}</small></div>
      ${pago ? '<em class="done">✓</em>' : `<button class="btn small blue" data-a="missao" data-v="${m.id}" ${G.missaoPronta(m) ? '' : 'disabled'}>${gema(m.gemas)}</button>`}</div>`;
  }).join('')}
    <div class="mission"><div><b>Concluir todas</b><small>Bônus diário</small></div>
      ${G.S.diario.bonus ? '<em class="done">✓</em>' : `<button class="btn small blue" data-a="bonus" ${G.bonusPronto() ? '' : 'disabled'}>${gema(BONUS_MISSOES)}</button>`}</div>
  </div><button class="btn ghost" data-a="fechar">Fechar</button>`);
}
function abrirCaixa(id, m) {
  const cx = G.caixaPorId(id);
  const r = G.abrirCaixa(cx, m);
  if (!r) return toast('Saldo insuficiente');
  G.salvar();
  topo();
  modal(`<div class="opening" style="--rc:${cx.cor}"><div class="crate big shake"><i></i></div><p class="sub">Abrindo ${cx.nome}…</p></div>`);
  setTimeout(() => {
    const c = r.carro;
    const pode = G.S[m] >= cx[m];
    modal(`<p class="kicker">${cx.nome} · ${r.inedito ? '<b class="new">NOVO!</b>' : `repetido (×${G.qtd(c.id)})`}</p>
      <div class="reveal pop" style="--rc:${RAR[c.rar].cor}">${carSVG(c)}</div>
      <h2>${c.nome}</h2><p class="sub">${tag(c)} · vale ${moeda(c.valor)}</p>${ficha(c)}
      <button class="btn" data-a="fechar">Guardar na garagem</button>
      <div class="row">
        <button class="btn ghost" data-a="vender" data-v="${c.id}" data-n="1">Vender · ${moeda(G.precoVenda(c))}</button>
        <button class="btn ghost" data-a="abrir" data-v="${id}" data-m="${m}" ${pode ? '' : 'disabled'}>Abrir outra</button>
      </div>`);
  }, 1100);
}

// ---------- ações ----------
const ACOES = {
  ir(v) { tela = v; desenhar(); $('#screen').scrollTop = 0; },
  fechar: fecharModal,
  missoes: modalMissoes,
  carro: modalCarro,
  turbo() { if (G.ativarTurbo()) desenhar(); },
  abrir(v, el) { abrirCaixa(v, el.dataset.m); },
  aba(v) { filtro.aba = v; desenhar(); },
  rar(v) { filtro.rar = +v; desenhar(); },
  jogo(v) { abrirJogo(v, uiJogo, fmt); },
  destacar(v) { G.S.destaque = v; toast('Carro na pista!'); fecharModal(); },
  vender(v, el) {
    const g = G.vender(v, +el.dataset.n);
    if (g) toast(`Vendido por ${moeda(g)}`);
    fecharModal();
  },
  up(v) {
    if (v === 'toque' && G.gastar(G.custoToque())) G.S.toqueNv++;
    if (v === 'renda' && G.gastar(G.custoRenda())) G.S.rendaNv++;
    desenhar();
  },
  troca() {
    const v = G.valorToque() * 400;
    if (G.gastar(10, 'gemas')) { G.somarMoedas(v, false); toast(`+${moeda(v)}`); }
    desenhar();
  },
  oferta(v) {
    const o = G.ofertasDoDia()[v];
    if (G.S.diario.comprado[v] || !G.gastar(o.gemas, 'gemas')) return;
    G.S.diario.comprado[v] = true;
    G.ganharCarro(o.carro.id);
    toast(`${o.carro.nome} foi para a garagem!`);
    desenhar();
  },
  missao(v) {
    const m = MISSOES.find((x) => x.id === v);
    if (!G.missaoPronta(m)) return;
    G.S.diario.pago[v] = true;
    G.S.gemas += m.gemas;
    topo(); modalMissoes();
  },
  bonus() {
    if (!G.bonusPronto()) return;
    G.S.diario.bonus = true;
    G.S.gemas += BONUS_MISSOES;
    topo(); modalMissoes();
  },
  marca(v) {
    if (G.S.marcas[v]) return;
    G.S.marcas[v] = true;
    G.S.gemas += PREMIO_MARCA;
    toast(`Marca ${v} completa! +${gema(PREMIO_MARCA)}`);
    desenhar();
  },
  config() {
    modal(`<h2>Opções</h2><p class="sub">Toques: ${fmt(G.S.stats.toques)} · Caixas abertas: ${fmt(G.S.stats.caixas)}</p>
      <p class="sub">O progresso fica salvo neste navegador.</p>
      <button class="btn danger" data-a="zerar">Apagar progresso</button><button class="btn ghost" data-a="fechar">Fechar</button>`);
  },
  zerar() {
    modal(`<h2>Apagar tudo?</h2><p class="sub">Moedas, gemas e carros serão perdidos. Não dá para desfazer.</p>
      <button class="btn danger" data-a="zerar2">Sim, apagar</button><button class="btn ghost" data-a="fechar">Cancelar</button>`);
  },
  zerar2() { G.reiniciar(); tela = 'inicio'; fecharModal(); },
};

document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-g]');
  if (g && aoClicarModal) {
    if (g.disabled) return;
    if (g.dataset.g === 'sair') return fecharModal();
    aoClicarModal(g.dataset.g, g);
    topo();
    return G.salvar();
  }
  const el = e.target.closest('[data-a]');
  if (!el || el.disabled) return;
  ACOES[el.dataset.a]?.(el.dataset.v, el);
  G.salvar();
});
document.addEventListener('input', (e) => {
  if (e.target.id === 'busca') { filtro.busca = e.target.value; $('#grid').innerHTML = grade(); }
  if (e.target.id === 'ordem') { filtro.ordem = e.target.value; $('#grid').innerHTML = grade(); }
});
document.addEventListener('pointerdown', (e) => {
  const tap = e.target.closest('#tap');
  if (!tap) return;
  const v = G.tocar();
  topo();
  tap.classList.remove('hit');
  void tap.offsetWidth;
  tap.classList.add('hit');
  const st = $('#stage'), r = st.getBoundingClientRect();
  const f = document.createElement('span');
  f.className = 'float';
  f.textContent = '+' + fmt(v);
  f.style.left = e.clientX - r.left + (Math.random() * 30 - 15) + 'px';
  f.style.top = e.clientY - r.top - 20 + 'px';
  st.append(f);
  f.addEventListener('animationend', () => f.remove());
});

// ---------- laço ----------
let n = 0;
setInterval(() => {
  const r = G.rendaSeg();
  if (r) G.somarMoedas(r);
  if (G.conferirDia()) { toast('Novo dia: missões e ofertas renovadas!'); desenhar(); }
  topo();
  const tb = $('#turbo');
  if (tb) {
    tb.innerHTML = turboTxt();
    tb.classList.toggle('hot', G.turboAtivo());
    $('#pt').innerHTML = moeda(G.valorToque());
  }
  if (++n % 5 === 0) G.salvar();
}, 1000);
addEventListener('visibilitychange', () => document.hidden && G.salvar());

G.carregar();
const off = G.rendaOffline();
desenhar();
if (off) toast(`Seus patrocinadores renderam ${moeda(off)} enquanto você estava fora.`);
G.salvar();

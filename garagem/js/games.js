// Minijogos (somente moedas do jogo).
import { CARROS } from './data.js';
import { carSVG } from './art.js';
import { S, gastar, somarMoedas, progresso, valorToque } from './state.js';

let fmt;
const APOSTAS = [[0.1, '10%'], [0.25, '25%'], [0.5, '50%'], [1, 'Tudo']];
const aposta = (p) => Math.max(10, Math.floor(S.moedas * p));
const apostaUI = (p) => `
  <div class="stake"><span>Aposta</span><b><i class="coin"></i>${fmt(aposta(p))}</b></div>
  <div class="chips">${APOSTAS.map(([v, t]) => `<button class="chip ${v === p ? 'on' : ''}" data-g="pct" data-v="${v}">${t}</button>`).join('')}</div>`;
const semSaldo = () => S.moedas < 10;
const sorteio = (n) => [...CARROS].sort(() => Math.random() - 0.5).slice(0, n);

function caraCoroa(ui) {
  let p = 0.1, res = null;
  const draw = () => ui.show(`
    <h2>Cara ou Coroa</h2><p class="sub">Acertou, dobra a aposta. Errou, perde.</p>
    <div class="flipcoin ${res ? 'spin' : ''}">${res ? (res.lado === 'cara' ? '🙂' : '👑') : '?'}</div>
    <p class="result ${res ? (res.ok ? 'win' : 'lose') : ''}">${res ? (res.ok ? `Deu ${res.lado}! +${fmt(res.v)}` : `Deu ${res.lado}. −${fmt(res.v)}`) : '&nbsp;'}</p>
    ${apostaUI(p)}
    <div class="row"><button class="btn" data-g="cara" ${semSaldo() ? 'disabled' : ''}>🙂 Cara</button><button class="btn" data-g="coroa" ${semSaldo() ? 'disabled' : ''}>👑 Coroa</button></div>
    <button class="btn ghost" data-g="sair">Fechar</button>`, on);
  const on = (g, el) => {
    if (g === 'pct') { p = +el.dataset.v; res = null; return draw(); }
    if (g !== 'cara' && g !== 'coroa') return;
    const v = aposta(p);
    if (!gastar(v)) return;
    const lado = Math.random() < 0.5 ? 'cara' : 'coroa';
    const ok = lado === g;
    if (ok) somarMoedas(v * 2, false);
    progresso('game', 1);
    res = { lado, ok, v };
    draw();
  };
  draw();
}

function corrida(ui) {
  let p = 0.1, carros = sorteio(4), pick = 0, fase = 'pre', venc = 0, v = 0;
  const draw = () => ui.show(`
    <h2>Dia de Corrida</h2><p class="sub">Escolha um carro. Se ele vencer, você leva 3,6× a aposta.</p>
    <div class="track">${carros.map((c, i) => `
      <div class="lane ${i === pick ? 'on' : ''} ${fase === 'fim' && i === venc ? 'winner' : ''}" data-g="pick" data-v="${i}">
        <div class="runner" data-i="${i}">${carSVG(c)}</div><span>${c.modelo}</span></div>`).join('')}</div>
    <p class="result ${fase === 'fim' ? (venc === pick ? 'win' : 'lose') : ''}">${fase === 'fim' ? (venc === pick ? `Vitória! +${fmt(Math.round(v * 3.6))}` : `Venceu o ${carros[venc].modelo}. −${fmt(v)}`) : '&nbsp;'}</p>
    ${fase === 'pre' ? apostaUI(p) + `<button class="btn" data-g="go" ${semSaldo() ? 'disabled' : ''}>🏁 Largar</button>` : ''}
    ${fase === 'fim' ? '<button class="btn" data-g="novo">Nova corrida</button>' : ''}
    ${fase !== 'run' ? '<button class="btn ghost" data-g="sair">Fechar</button>' : ''}`, on);
  const on = (g, el) => {
    if (g === 'pct' && fase === 'pre') { p = +el.dataset.v; return draw(); }
    if (g === 'pick' && fase === 'pre') { pick = +el.dataset.v; return draw(); }
    if (g === 'novo') { carros = sorteio(4); fase = 'pre'; return draw(); }
    if (g !== 'go' || fase !== 'pre') return;
    v = aposta(p);
    if (!gastar(v)) return;
    venc = Math.floor(Math.random() * 4);
    fase = 'run';
    draw();
    const curvas = ['.2,.6,.5,1', '.6,.1,.7,.9', '.4,.4,.3,1', '.7,.2,.4,.8'].sort(() => Math.random() - 0.5);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.querySelectorAll('.runner').forEach((r) => {
        const i = +r.dataset.i;
        const t = i === venc ? 3 : 3.4 + Math.random() * 0.8;
        r.style.transition = `left ${t}s cubic-bezier(${curvas[i]})`;
        r.style.left = 'calc(100% - 76px)';
      });
    }));
    setTimeout(() => {
      if (venc === pick) somarMoedas(Math.round(v * 3.6), false);
      progresso('game', 1);
      fase = 'fim';
      draw();
      document.querySelectorAll('.runner').forEach((r) => (r.style.left = 'calc(100% - 76px)'));
    }, 3300);
  };
  draw();
}

function cones(ui) {
  const N = 25, MINAS = 5;
  let p = 0.1, fase = 'pre', minas = new Set(), abertos = new Set(), v = 0, msg = '';
  const mult = (k) => {
    let m = 0.97;
    for (let i = 0; i < k; i++) m *= (N - i) / (N - MINAS - i);
    return m;
  };
  const draw = () => {
    const m = mult(abertos.size);
    ui.show(`
    <h2>Campo de Cones</h2><p class="sub">Abra vagas livres para subir o prêmio. Bateu num cone, perde tudo. São ${MINAS} cones em ${N} vagas.</p>
    <div class="mines">${Array.from({ length: N }, (_, i) => {
      const ab = abertos.has(i), mina = minas.has(i), fim = fase === 'fim';
      return `<button class="tile ${ab ? (mina ? 'boom' : 'safe') : ''} ${fim && mina ? 'boom' : ''}" data-g="t" data-v="${i}" ${fase !== 'run' || ab ? 'disabled' : ''}>${ab || (fim && mina) ? (mina ? '⚠️' : '✓') : ''}</button>`;
    }).join('')}</div>
    <p class="result ${msg.startsWith('+') ? 'win' : msg ? 'lose' : ''}">${msg || (fase === 'run' ? `Prêmio atual: ${m.toFixed(2)}× = ${fmt(Math.round(v * m))}` : '&nbsp;')}</p>
    ${fase === 'run'
      ? `<button class="btn" data-g="sacar" ${abertos.size ? '' : 'disabled'}>Sacar ${fmt(Math.round(v * m))}</button>`
      : apostaUI(p) + `<button class="btn" data-g="go" ${semSaldo() ? 'disabled' : ''}>Começar</button><button class="btn ghost" data-g="sair">Fechar</button>`}`, on);
  };
  const on = (g, el) => {
    if (g === 'pct' && fase !== 'run') { p = +el.dataset.v; return draw(); }
    if (g === 'go' && fase !== 'run') {
      v = aposta(p);
      if (!gastar(v)) return;
      minas = new Set(); abertos = new Set(); msg = '';
      while (minas.size < MINAS) minas.add(Math.floor(Math.random() * N));
      fase = 'run';
      return draw();
    }
    if (fase !== 'run') return;
    if (g === 't') {
      const i = +el.dataset.v;
      abertos.add(i);
      if (minas.has(i)) { fase = 'fim'; msg = `Cone! −${fmt(v)}`; progresso('game', 1); }
      else if (abertos.size === N - MINAS) return on('sacar');
      return draw();
    }
    if (g === 'sacar' && abertos.size) {
      const ganho = Math.round(v * mult(abertos.size));
      somarMoedas(ganho, false);
      progresso('game', 1);
      fase = 'fim'; msg = `+${fmt(ganho)} sacados!`;
      draw();
    }
  };
  draw();
}

function quiz(ui) {
  const ATR = [['cv', 'potência', 'cv'], ['vmax', 'velocidade máxima', 'km/h']];
  let seq = 0, a, b, atr, res = null, total = 0;
  const nova = () => {
    atr = ATR[Math.floor(Math.random() * ATR.length)];
    do { [a, b] = sorteio(2); } while (a[atr[0]] === b[atr[0]]);
    res = null;
  };
  const card = (c, mostra) => `<div class="qcard">${carSVG(c)}<b>${c.nome}</b><span>${mostra ? `${c[atr[0]]} ${atr[2]}` : '?'}</span></div>`;
  const draw = () => ui.show(`
    <h2>Mais ou Menos</h2><p class="sub">O segundo carro tem <b>mais</b> ou <b>menos</b> ${atr[1]}? Cada acerto seguido paga mais. Grátis.</p>
    <div class="quiz">${card(a, true)}<i>vs</i>${card(b, !!res)}</div>
    <p class="result ${res ? (res.ok ? 'win' : 'lose') : ''}">${res ? (res.ok ? `Certo! +${fmt(res.v)} · sequência ${seq}` : `Errou. Total ganho: ${fmt(total)}`) : `Sequência: ${seq}`}</p>
    ${res
      ? `<button class="btn" data-g="prox">${res.ok ? 'Próxima' : 'Jogar de novo'}</button>`
      : '<div class="row"><button class="btn" data-g="mais">▲ Mais</button><button class="btn" data-g="menos">▼ Menos</button></div>'}
    <button class="btn ghost" data-g="sair">Fechar</button>`, on);
  const on = (g) => {
    if (g === 'prox') {
      if (!res.ok) { seq = 0; total = 0; }
      nova();
      return draw();
    }
    if ((g !== 'mais' && g !== 'menos') || res) return;
    const ok = (b[atr[0]] > a[atr[0]]) === (g === 'mais');
    let v = 0;
    if (ok) {
      seq++;
      v = valorToque() * 15 * Math.min(seq, 10);
      total += v;
      somarMoedas(v);
    } else progresso('game', 1);
    res = { ok, v };
    draw();
  };
  nova();
  draw();
}

export const JOGOS = [
  { id: 'quiz', nome: 'Mais ou Menos', desc: 'Compare a ficha de dois carros. Grátis.', ic: '🧠', fn: quiz },
  { id: 'corrida', nome: 'Dia de Corrida', desc: 'Aposte no vencedor e leve 3,6×.', ic: '🏁', fn: corrida },
  { id: 'cones', nome: 'Campo de Cones', desc: 'Abra vagas, desvie dos cones e saque a tempo.', ic: '⚠️', fn: cones },
  { id: 'moeda', nome: 'Cara ou Coroa', desc: 'Dobro ou nada em um lance.', ic: '🪙', fn: caraCoroa },
];
export function abrirJogo(id, ui, formatador) {
  fmt = formatador;
  JOGOS.find((j) => j.id === id).fn(ui);
}

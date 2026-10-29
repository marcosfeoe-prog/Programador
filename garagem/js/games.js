// Minijogos: Quiz de Carros, Dia de Corrida, Duelo, Cara ou Coroa e Ferro-Velho (minas).
import { S, save, pay, earn, track, short, full, pick, POOL, CAR_BY_ID, RARITIES } from './state.js';
import { $, $$, icon, coinIc, gemIc, carImg, sfx, buzz, toast, modal, confetti, betControl, readBet, wireBet } from './ui.js';

export const GAMES = [
  { id: 'quiz', name: 'Quiz de Carros', desc: 'Acerte a marca, o modelo e o ano.', icon: 'brain', cta: 'JOGAR' },
  { id: 'race', name: 'Dia de Corrida', desc: 'Escolha um carro, aposte e leve o prêmio.', icon: 'flag', cta: 'JOGAR' },
  { id: 'auction', name: 'Leilão ao Vivo', desc: 'Um lote por vez. Cubra os rivais ou perca.', icon: 'gavel', cta: 'LANCE' },
  { id: 'versus', name: 'Duelo', desc: 'Duelos de carros contra o robô valendo moedas.', icon: 'sword', cta: 'JOGAR' },
  { id: 'flip', name: 'Cara ou Coroa', desc: 'Aposte moedas em um único giro. Dobro ou nada.', icon: 'coins', cta: 'GIRAR' },
  { id: 'mines', name: 'Ferro-Velho', desc: 'Escolha peças, desvie das sucatas, saque antes de bater.', icon: 'bomb', cta: 'JOGAR' },
];

const carName = (c) => `${c.brand} ${c.model} ${c.year}`;
const defaultBet = () => Math.max(100, Math.round((S.coins * 0.05) / 100) * 100);
let ctx = {};

export function openGame(id, c) {
  ctx = c;
  ({ quiz, race, versus, flip, mines })[id]();
}
function win(amount, msg) {
  earn(amount);
  S.stats.wins++;
  save();
  sfx.win();
  buzz([20, 30, 40]);
  toast(`${msg} ${coinIc()} +${full(amount)}`, 'gold');
}
function startBet(root) {
  const bet = readBet(root);
  if (bet < 1) return 0;
  if (!pay(bet, 0)) {
    sfx.error();
    toast(`${coinIc()} Moedas insuficientes`, 'bad');
    return 0;
  }
  track('games');
  return bet;
}

// ---------------------------------------------------------------- Quiz
function quiz() {
  const ROUNDS = 5;
  let round = 0;
  let right = 0;
  const used = new Set();
  const m = modal(`<div class="game"><h3 class="m-title">${icon('brain')} Quiz de Carros</h3><div id="qz"></div></div>`, { cls: 'gamebox' });
  track('games');
  const host = $('#qz', m);
  const next = () => {
    if (round >= ROUNDS) return end();
    round++;
    let car;
    do car = pick(POOL);
    while (used.has(car.id));
    used.add(car.id);
    const opts = new Set([car.id]);
    while (opts.size < 4) opts.add(pick(POOL).id);
    const list = [...opts].sort(() => Math.random() - 0.5).map((id) => CAR_BY_ID[id]);
    host.innerHTML = `<div class="qz-top"><span>Pergunta ${round}/${ROUNDS}</span><span>${icon('star')} ${right} acertos</span></div>
      <div class="qz-img" style="--glow:${RARITIES[car.rarity].glow}"><div class="halo"></div><img src="${carImg(car.id)}" alt="" /></div>
      <div class="qz-opts">${list.map((c) => `<button class="btn dark" data-a="${c.id}">${carName(c)}</button>`).join('')}</div>`;
    $$('[data-a]', host).forEach(
      (b) =>
        (b.onclick = () => {
          const ok = b.dataset.a === car.id;
          $$('[data-a]', host).forEach((x) => {
            x.disabled = true;
            if (x.dataset.a === car.id) x.classList.add('right');
          });
          if (ok) {
            right++;
            sfx.coin();
          } else {
            b.classList.add('wrong');
            sfx.error();
          }
          setTimeout(next, 900);
        }),
    );
  };
  const end = () => {
    const coins = right * (300 + S.level * 120);
    const gems = right === ROUNDS ? 3 : 0;
    if (coins) earn(coins, gems);
    if (right === ROUNDS) confetti();
    ctx.gainXp(right * 15);
    host.innerHTML = `<div class="result"><h2>${right}/${ROUNDS} acertos</h2><p>${right === ROUNDS ? 'Perfeito! Você é um expert.' : right >= 3 ? 'Mandou bem!' : 'Continue estudando os carros da garagem.'}</p>
      <div class="reward-row"><span>${coinIc()} +${full(coins)}</span>${gems ? `<span>${gemIc()} +${gems}</span>` : ''}</div>
      <div class="row gap"><button class="btn dark" data-close>Sair</button><button class="btn green" id="again">Jogar de novo</button></div></div>`;
    $('#again', host).onclick = () => {
      m.close();
      quiz();
    };
  };
  next();
}

// ---------------------------------------------------------------- Corrida
function race() {
  const cars = [];
  while (cars.length < 4) {
    const c = pick(POOL);
    if (!cars.includes(c)) cars.push(c);
  }
  const score = cars.map((c) => Math.pow(c.hp, 0.55) * Math.pow(1 / c.acc, 0.6) * Math.pow(c.top, 0.4));
  const pw = score.map((s) => Math.pow(s, 2.2));
  const tot = pw.reduce((a, b) => a + b, 0);
  const prob = pw.map((p) => p / tot);
  const mult = prob.map((p) => Math.min(40, Math.max(1.1, Math.round((0.92 / p) * 10) / 10)));
  let chosen = -1;
  const m = modal(
    `<div class="game"><h3 class="m-title">${icon('flag')} Dia de Corrida</h3>
    <div class="track" id="track">${cars
      .map(
        (c, i) => `<div class="lane" data-i="${i}"><div class="lane-car" id="lc${i}"><img src="${carImg(c.id)}" alt="" /></div><span class="lane-n">${i + 1}</span></div>`,
      )
      .join('')}<div class="finish"></div></div>
    <div class="racers">${cars
      .map(
        (c, i) => `<button class="racer" data-pick="${i}"><b>${i + 1}</b><span>${carName(c)}<small>${c.hp} cv · 0-100 ${c.acc.toLocaleString('pt-BR')}s</small></span><em>${mult[i].toLocaleString('pt-BR')}×</em></button>`,
      )
      .join('')}</div>
    ${betControl('race', defaultBet())}
    <button class="btn green big wide" id="go" disabled>ESCOLHA UM CARRO</button></div>`,
    { cls: 'gamebox' },
  );
  wireBet(m);
  const goB = $('#go', m);
  $$('[data-pick]', m).forEach(
    (b) =>
      (b.onclick = () => {
        chosen = +b.dataset.pick;
        $$('[data-pick]', m).forEach((x) => x.classList.toggle('on', x === b));
        goB.disabled = false;
        goB.textContent = 'LARGAR!';
        sfx.click();
      }),
  );
  goB.onclick = () => {
    const bet = startBet(m);
    if (!bet) return;
    goB.disabled = true;
    $$('[data-pick], [data-betop], .bet input', m).forEach((x) => (x.disabled = true));
    // vencedor sorteado pelas probabilidades; o resto chega em ordem aleatória
    let x = Math.random();
    let winner = 0;
    for (let i = 0; i < 4; i++) if ((x -= prob[i]) <= 0) {
      winner = i;
      break;
    }
    const order = [0, 1, 2, 3].filter((i) => i !== winner).sort(() => Math.random() - 0.5);
    const T = [];
    T[winner] = 1;
    order.forEach((i, k) => (T[i] = 1.04 + k * 0.05 + Math.random() * 0.03));
    const phase = cars.map(() => Math.random() * 6);
    const trackW = $('#track', m).clientWidth - 70;
    const dur = 4200;
    const t0 = performance.now();
    sfx.reveal(1);
    const step = (now) => {
      const t = (now - t0) / dur;
      cars.forEach((_, i) => {
        let p = Math.min(1, t / T[i]);
        p = p * p * (3 - 2 * p) * 0.9 + p * 0.1 + Math.sin(t * 9 + phase[i]) * 0.02 * (1 - p);
        $(`#lc${i}`, m).style.transform = `translateX(${Math.max(0, p) * trackW}px)`;
      });
      if (t < Math.max(...T)) requestAnimationFrame(step);
      else done();
    };
    requestAnimationFrame(step);
    const done = () => {
      $$('.lane', m)[winner].classList.add('win');
      if (winner === chosen) {
        const prize = Math.round(bet * mult[chosen]);
        win(prize, 'Vitória!');
        confetti();
      } else {
        sfx.lose();
        toast(`${carName(cars[winner])} venceu. Você perdeu ${coinIc()} ${full(bet)}`, 'bad');
      }
      ctx.gainXp(10);
      goB.disabled = false;
      goB.textContent = 'NOVA CORRIDA';
      goB.onclick = () => {
        m.close();
        race();
      };
    };
  };
}

// ---------------------------------------------------------------- Duelo
const STATS = [
  { k: 'hp', name: 'Potência', fmt: (c) => `${c.hp} cv`, better: 1 },
  { k: 'top', name: 'Velocidade máxima', fmt: (c) => `${c.top} km/h`, better: 1 },
  { k: 'acc', name: '0 a 100 km/h (menor vence)', fmt: (c) => `${c.acc.toLocaleString('pt-BR')} s`, better: -1 },
  { k: 'value', name: 'Valor', fmt: (c) => short(c.value), better: 1 },
];
function versus() {
  const owned = Object.keys(S.cars);
  if (!owned.length) {
    toast('Você precisa de pelo menos um carro na garagem.', 'bad');
    return;
  }
  const stat = pick(STATS);
  const hand = [...owned].sort(() => Math.random() - 0.5).slice(0, 3).map((id) => CAR_BY_ID[id]);
  const maxOrder = Math.max(...hand.map((c) => RARITIES[c.rarity].order));
  const botPool = POOL.filter((c) => Math.abs(RARITIES[c.rarity].order - maxOrder) <= 1);
  const bot = pick(botPool);
  const m = modal(
    `<div class="game"><h3 class="m-title">${icon('sword')} Duelo</h3>
    <div class="vs-stat">Categoria: <b>${stat.name}</b></div>
    <div class="vs-bot"><div class="cimg q"><img src="${carImg(bot.id)}" class="sil" id="botimg" alt="" /></div><div><small>CARRO DO ROBÔ</small><b id="botname">???</b><span id="botval"></span></div></div>
    <p class="muted center small">Escolha um carro da sua garagem para o duelo (pagamento 1,9×):</p>
    <div class="vs-hand">${hand.map((c) => `<button class="vs-card" data-vs="${c.id}" style="--rc:${RARITIES[c.rarity].color}"><img src="${carImg(c.id)}" alt="" /><b>${carName(c)}</b><small>${stat.fmt(c)}</small></button>`).join('')}</div>
    ${betControl('vs', defaultBet())}</div>`,
    { cls: 'gamebox' },
  );
  wireBet(m);
  $$('[data-vs]', m).forEach(
    (b) =>
      (b.onclick = () => {
        const bet = startBet(m);
        if (!bet) return;
        const mine = CAR_BY_ID[b.dataset.vs];
        $$('[data-vs], [data-betop], .bet input', m).forEach((x) => (x.disabled = true));
        b.classList.add('on');
        const img = $('#botimg', m);
        img.classList.remove('sil');
        $('#botname', m).textContent = carName(bot);
        $('#botval', m).textContent = stat.fmt(bot);
        const diff = (mine[stat.k] - bot[stat.k]) * stat.better;
        const res = document.createElement('div');
        res.className = 'result';
        if (diff > 0) {
          win(Math.round(bet * 1.9), 'Você venceu o duelo!');
          res.innerHTML = '<h2 class="good">VITÓRIA!</h2>';
        } else if (diff === 0) {
          earn(bet);
          res.innerHTML = '<h2>EMPATE — aposta devolvida</h2>';
        } else {
          sfx.lose();
          res.innerHTML = `<h2 class="bad">DERROTA</h2><p>Você perdeu ${coinIc()} ${full(bet)}</p>`;
        }
        ctx.gainXp(8);
        res.innerHTML += `<div class="row gap"><button class="btn dark" data-close>Sair</button><button class="btn green" id="again">Novo duelo</button></div>`;
        $('.game', m).appendChild(res);
        $('#again', m).onclick = () => {
          m.close();
          versus();
        };
      }),
  );
}

// ---------------------------------------------------------------- Cara ou coroa
function flip() {
  let side = 'cara';
  const m = modal(
    `<div class="game"><h3 class="m-title">${icon('coins')} Cara ou Coroa</h3>
    <div class="coin3d" id="coin"><div class="face cara">${icon('star')}</div><div class="face coroa">${icon('gauge')}</div></div>
    <div class="seg"><button class="on" data-side="cara">Cara</button><button data-side="coroa">Coroa</button></div>
    ${betControl('flip', defaultBet())}
    <p class="muted center small">Acertou? Recebe 1,95× a aposta.</p>
    <button class="btn green big wide" id="flipgo">GIRAR</button></div>`,
    { cls: 'gamebox' },
  );
  wireBet(m);
  $$('[data-side]', m).forEach(
    (b) =>
      (b.onclick = () => {
        side = b.dataset.side;
        $$('[data-side]', m).forEach((x) => x.classList.toggle('on', x === b));
        sfx.click();
      }),
  );
  let spinning = false;
  let rot = 0;
  $('#flipgo', m).onclick = () => {
    if (spinning) return;
    const bet = startBet(m);
    if (!bet) return;
    spinning = true;
    const result = Math.random() < 0.5 ? 'cara' : 'coroa';
    rot += 1800 + (result === 'cara' ? 0 : 180) - (rot % 360);
    const coin = $('#coin', m);
    coin.style.transform = `rotateY(${rot}deg)`;
    for (let i = 0; i < 8; i++) setTimeout(() => sfx.tap(), i * 150);
    setTimeout(() => {
      spinning = false;
      if (result === side) win(Math.round(bet * 1.95), `Deu ${result}!`);
      else {
        sfx.lose();
        toast(`Deu ${result}. Você perdeu ${coinIc()} ${full(bet)}`, 'bad');
      }
      ctx.gainXp(5);
    }, 1500);
  };
}

// ---------------------------------------------------------------- Ferro-velho (minas)
function mines() {
  let nMines = 3;
  let state = null;
  const m = modal(
    `<div class="game"><h3 class="m-title">${icon('bomb')} Ferro-Velho</h3>
    <p class="muted center small">Cada peça boa aumenta o multiplicador. Achou sucata, perdeu tudo.</p>
    <div class="seg" id="mcount">${[1, 3, 5, 8].map((n) => `<button class="${n === nMines ? 'on' : ''}" data-mn="${n}">${n} sucata${n > 1 ? 's' : ''}</button>`).join('')}</div>
    <div class="mines" id="grid">${Array.from({ length: 25 }, (_, i) => `<button class="tile" data-t="${i}" disabled></button>`).join('')}</div>
    <div class="mines-info"><span>Multiplicador <b id="mmult">1,00×</b></span><span>Prêmio <b id="mprize">—</b></span></div>
    ${betControl('mines', defaultBet())}
    <button class="btn green big wide" id="mgo">COMEÇAR</button></div>`,
    { cls: 'gamebox' },
  );
  wireBet(m);
  $$('[data-mn]', m).forEach(
    (b) =>
      (b.onclick = () => {
        if (state) return;
        nMines = +b.dataset.mn;
        $$('[data-mn]', m).forEach((x) => x.classList.toggle('on', x === b));
        sfx.click();
      }),
  );
  const goB = $('#mgo', m);
  const tiles = $$('.tile', m);
  const upd = () => {
    $('#mmult', m).textContent = `${state.mult.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}×`;
    $('#mprize', m).innerHTML = state.picks ? `${coinIc('sm')} ${full(Math.floor(state.bet * state.mult))}` : '—';
    goB.textContent = state.picks ? `SACAR ${full(Math.floor(state.bet * state.mult))}` : 'ESCOLHA UMA PEÇA';
    goB.disabled = !state.picks;
  };
  const endRound = () => {
    tiles.forEach((t, i) => {
      t.disabled = true;
      if (state.bombs.has(i)) t.classList.add('bomb');
    });
    state = null;
    goB.disabled = false;
    goB.textContent = 'JOGAR DE NOVO';
    $$('[data-betop], .bet input', m).forEach((x) => (x.disabled = false));
  };
  goB.onclick = () => {
    if (!state) {
      const bet = startBet(m);
      if (!bet) return;
      const bombs = new Set();
      while (bombs.size < nMines) bombs.add(Math.floor(Math.random() * 25));
      state = { bet, bombs, picks: 0, mult: 1 };
      tiles.forEach((t) => {
        t.className = 'tile';
        t.innerHTML = '';
        t.disabled = false;
      });
      $$('[data-betop], .bet input', m).forEach((x) => (x.disabled = true));
      upd();
      return;
    }
    // sacar
    win(Math.floor(state.bet * state.mult), 'Saque no ferro-velho!');
    ctx.gainXp(6 + state.picks * 2);
    endRound();
  };
  tiles.forEach(
    (t, i) =>
      (t.onclick = () => {
        if (!state || t.classList.contains('ok')) return;
        if (state.bombs.has(i)) {
          t.classList.add('bomb', 'hit');
          t.innerHTML = icon('bomb');
          sfx.lose();
          buzz(80);
          toast(`Sucata! Você perdeu ${coinIc()} ${full(state.bet)}`, 'bad');
          ctx.gainXp(3);
          tiles.forEach((x, j) => state.bombs.has(j) && (x.innerHTML = icon('bomb')));
          endRound();
          return;
        }
        const remaining = 25 - state.picks;
        const safe = remaining - nMines;
        state.mult *= (remaining / safe) * 0.97;
        state.picks++;
        t.classList.add('ok');
        t.innerHTML = icon('gauge');
        sfx.coin();
        upd();
        if (state.picks === 25 - nMines) goB.click();
      }),
  );
}

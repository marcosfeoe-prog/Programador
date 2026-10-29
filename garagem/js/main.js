// Garagem Lendária — jogo de colecionar carros.
import {
  S, save, changed, onChange, resetGame, short, full, rng, pick, todayKey, msToMidnight, clock,
  CARS, CAR_BY_ID, POOL, RARITIES, BOXES, RARITY_KEYS,
  totalCars, uniqueCars, garageValue, addCar, removeCar, sellPrice, bestOwned,
  canPay, pay, earn, addXp, xpForLevel, levelReward, tapValue, boostActive, boostSeconds, BOOST_COOLDOWN,
  passivePerHour, offlineHours, UPGRADES, collectOffline, ensureDay, TASKS, track, tasksClaimable, allTasksDone,
  SETS, ACHIEVEMENTS, achClaimable, rollBox, XP_BY_RARITY,
} from './state.js';
import { $, $$, icon, coinIc, gemIc, starIc, price, rarityTag, carImg, boxImg, sfx, buzz, toast, modal, confirmBox, floatText, confetti } from './ui.js';
import { GAMES, openGame } from './games.js';

const RAR = RARITIES;
const carName = (c) => `${c.brand} ${c.model} ${c.year}`;
let tab = 'home';

// =====================================================================
// Barra superior e navegação
// =====================================================================
function renderTop() {
  $('#top').innerHTML = `
    <div class="pill">${starIc()}<b>${short(S.stats.xpTotal || 0)}</b></div>
    <div class="pill">${coinIc()}<b id="coins">${short(S.coins)}</b><button class="plus" data-go="store">+</button></div>
    <div class="pill">${gemIc()}<b id="gems">${short(S.gems)}</b><button class="plus" data-go="store">+</button></div>
    <button class="sq" data-panel="menu">${icon('menu')}</button>`;
}
function updateCounters() {
  const c = $('#coins');
  const g = $('#gems');
  if (c) c.textContent = short(S.coins);
  if (g) g.textContent = short(S.gems);
}

const NAV = [
  ['home', 'gauge', 'Início'],
  ['boxes', 'box', 'Caixas'],
  ['garage', 'garage', 'Garagem'],
  ['auction', 'gavel', 'Leilão'],
  ['store', 'store', 'Loja'],
  ['games', 'flag', 'Jogos'],
];
function renderNav() {
  const boxes = Object.values(S.boxes).reduce((a, b) => a + b, 0);
  $('#nav').innerHTML = NAV.map(([id, ic, label]) => {
    const badge = id === 'boxes' && boxes ? `<span class="badge">${boxes}</span>` : '';
    return `<button class="nav-b ${tab === id ? 'on' : ''}" data-go="${id}">${icon(ic)}<span class="lbl">${label}</span>${badge}</button>`;
  }).join('<i class="sep"></i>');
}

function go(t) {
  if (t !== tab) sfx.click();
  tab = t;
  render();
  $('#screen').scrollTop = 0;
}
function render() {
  const scr = SCREENS[tab];
  $('#screen').innerHTML = scr.html();
  $('#screen').dataset.tab = tab;
  scr.mount && scr.mount($('#screen'));
  renderTop();
  renderNav();
}

document.addEventListener('click', (e) => {
  const g = e.target.closest('[data-go]');
  if (g) {
    $$('.modal-wrap').forEach((m) => m.close && m.close());
    go(g.dataset.go);
    return;
  }
  const p = e.target.closest('[data-panel]');
  if (p) {
    sfx.click();
    PANELS[p.dataset.panel]();
  }
});

// =====================================================================
// Comemoração de nível
// =====================================================================
function celebrateLevels(ups) {
  if (!ups.length) return;
  const lv = ups[ups.length - 1];
  let coins = 0;
  let gems = 0;
  for (const l of ups) {
    const r = levelReward(l);
    coins += r.coins;
    gems += r.gems;
  }
  sfx.win();
  confetti();
  modal(`<div class="lvlup"><div class="lvl-big">${lv}</div><h2>Subiu de nível!</h2>
    <p>Seu toque agora rende mais.</p>
    <div class="reward-row"><span>${coinIc()} +${full(coins)}</span><span>${gemIc()} +${gems}</span></div>
    <button class="btn yellow wide" data-close>Continuar</button></div>`);
}
export function gainXp(n) {
  celebrateLevels(addXp(n));
}

// =====================================================================
// INÍCIO
// =====================================================================
const home = {
  html() {
    const need = xpForLevel(S.level);
    const fc = S.featured && CAR_BY_ID[S.featured];
    const rc = fc ? RAR[fc.rarity] : RAR.comum;
    const tasksN = tasksClaimable();
    const achN = achClaimable();
    const rewardN = S.reward.last !== todayKey() ? 1 : 0;
    const side = (panel, ic, label, n = 0) => `<button class="side-b" data-panel="${panel}">${icon(ic)}${n ? `<span class="badge">${n}</span>` : ''}<span>${label}</span></button>`;
    return `
    <div class="lvl-card">
      <div class="lvl-badge"><small>NÍVEL</small><b>${S.level}</b></div>
      <div class="lvl-info">
        <div class="lvl-top"><span>PRÓXIMO NÍVEL ${S.level + 1}</span><span class="tapv">${coinIc('sm')} +<b id="tapv">${short(tapValue())}</b> / toque</span></div>
        <div class="bar"><i id="xpbar" style="width:${(S.xp / need) * 100}%"></i><span id="xptext">${full(S.xp)} / ${full(need)}</span></div>
      </div>
    </div>
    <div class="stage">
      <div class="side left">
        ${side('reward', 'ticket', 'Diário', rewardN)}
        ${side('tasks', 'tasks', 'Tarefas', tasksN)}
        ${side('ranking', 'trophy', 'Ranking')}
        ${side('exchange', 'swap', 'Câmbio')}
      </div>
      <div class="mid">
        <button class="boost" id="boost">${icon('bolt')}<span id="boostlbl"></span></button>
        <div class="tapzone" id="tapzone" style="--glow:${rc.glow}">
          <div class="halo"></div>
          ${fc ? `<img id="hero" src="${carImg(fc.id)}" alt="${carName(fc)}" draggable="false" />` : ''}
        </div>
        <div class="hero-name">${fc ? `${carName(fc)}` : ''}</div>
      </div>
      <div class="side right">
        ${side('profile', 'helmet', 'Perfil')}
        ${side('boosts', 'rocket', 'Melhorias')}
        ${side('awards', 'medal', 'Conquistas', achN)}
        ${side('sets', 'cards', 'Coleções')}
      </div>
    </div>
    <div class="tap-hint">TOQUE PARA GANHAR</div>
    <div class="passive">${icon('garage')} Renda da garagem: ${coinIc('sm')} <b>${short(passivePerHour())}</b>/h</div>`;
  },
  mount(root) {
    const zone = $('#tapzone', root);
    const hero = $('#hero', root);
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      const v = tapValue();
      S.coins += v;
      S.stats.earned += v;
      track('taps');
      sfx.tap();
      buzz(8);
      floatText(e.clientX + (Math.random() - 0.5) * 30, e.clientY - 20, `+${short(v)}`, boostActive() ? 'boosted' : '');
      if (hero) {
        hero.classList.remove('bump');
        void hero.offsetWidth;
        hero.classList.add('bump');
      }
      const ups = addXp(1);
      celebrateLevels(ups);
      if (ups.length) render();
      else updateHome();
    });
    $('#boost', root).addEventListener('click', () => {
      const now = Date.now();
      if (boostActive() || now < S.boostReadyAt) return sfx.error();
      S.boostUntil = now + boostSeconds() * 1000;
      S.boostReadyAt = S.boostUntil + BOOST_COOLDOWN;
      sfx.win();
      toast(`${icon('bolt')} Boost x3 ativado por ${boostSeconds()} s!`, 'gold');
      save();
      updateHome();
    });
    updateHome();
  },
};
function updateHome() {
  if (tab !== 'home') return;
  updateCounters();
  const need = xpForLevel(S.level);
  const bar = $('#xpbar');
  if (bar) bar.style.width = `${(S.xp / need) * 100}%`;
  const xt = $('#xptext');
  if (xt) xt.textContent = `${full(S.xp)} / ${full(need)}`;
  const tv = $('#tapv');
  if (tv) tv.textContent = short(tapValue());
  const b = $('#boost');
  const lbl = $('#boostlbl');
  if (b && lbl) {
    const now = Date.now();
    b.classList.toggle('active', boostActive());
    b.classList.toggle('wait', !boostActive() && now < S.boostReadyAt);
    if (boostActive()) lbl.textContent = `BOOST X3 · ${Math.ceil((S.boostUntil - now) / 1000)}s`;
    else if (now < S.boostReadyAt) lbl.textContent = `RECARGA ${clock(S.boostReadyAt - now)}`;
    else lbl.textContent = `BOOST X3 (${boostSeconds()}s)`;
  }
}

// =====================================================================
// CAIXAS
// =====================================================================
let boxTab = 'shop';
const DROP_PRICE = { epico: 260, lendario: 900, mitico: 2400 };
const DROP_STOCK = { epico: 400, lendario: 150, mitico: 40 };
function dailyDrops() {
  const r = rng('drops' + todayKey());
  const ep = POOL.filter((c) => c.rarity === 'epico');
  const le = POOL.filter((c) => c.rarity === 'lendario');
  const my = POOL.filter((c) => c.rarity === 'mitico');
  return [pick(ep, r), pick(le, r), pick(my, r)].map((c) => {
    const total = DROP_STOCK[c.rarity];
    const dayFrac = 1 - msToMidnight() / 86400e3;
    const left = Math.max(1, Math.round(total * (1 - dayFrac * (0.55 + r() * 0.35))));
    return { car: c, gems: DROP_PRICE[c.rarity], total, left };
  });
}
function limitedLeft(c) {
  // estoque "global" simulado que diminui lentamente com o tempo
  const days = (Date.now() - Date.UTC(2026, 0, 1)) / 86400e3;
  const sold = Math.floor(c.limited.supply * Math.min(0.97, 0.35 + days * 0.0012 + (rng(c.id)() * 0.2)));
  return Math.max(1, c.limited.supply - sold - (S.limited[c.id] ? 1 : 0));
}

const boxes = {
  html() {
    ensureDay();
    const inv = Object.entries(S.boxes).filter(([, n]) => n > 0);
    const invN = inv.reduce((a, [, n]) => a + n, 0);
    const tabs = `<div class="seg"><button class="${boxTab === 'shop' ? 'on' : ''}" data-btab="shop">Loja</button><button class="${boxTab === 'inv' ? 'on' : ''}" data-btab="inv">Inventário ${invN ? `<span class="badge red">${invN}</span>` : ''}</button></div>`;
    if (boxTab === 'inv') {
      return `${tabs}<div class="sec-title">SUAS CAIXAS</div>${
        inv.length
          ? `<div class="box-grid">${inv
              .map(([id, n]) => {
                const b = BOXES.find((x) => x.id === id);
                return `<div class="box-card"><span class="count">x${n}</span><img src="${boxImg(id)}" alt="" data-odds="${id}" /><h4>${b.name}</h4><button class="btn green" data-openinv="${id}">ABRIR</button></div>`;
              })
              .join('')}</div>`
          : `<div class="empty">${icon('box')}<p>Nenhuma caixa guardada.<br/>Ganhe caixas com tarefas, conquistas e recompensas diárias.</p></div>`
      }`;
    }
    const drops = dailyDrops();
    return `${tabs}
      <div class="sec-title">OFERTAS DO DIA <span class="timer">${icon('clock')} Novas em <b id="droptimer">${clock(msToMidnight())}</b></span></div>
      <div class="drops">${drops
        .map((d) => {
          const own = S.day.drops[d.car.id] ? 1 : 0;
          return `<div class="drop" style="--rc:${RAR[d.car.rarity].color};--glow:${RAR[d.car.rarity].glow}">
            <div class="drop-img" data-car="${d.car.id}"><img src="${carImg(d.car.id)}" alt="" /></div>
            <h4>${carName(d.car)}</h4>
            <div class="meta">${icon('helmet')} ${own}/1 · ${icon('garage')} ${d.left}/${d.total}</div>
            <button class="btn green" data-drop="${d.car.id}" ${own ? 'disabled' : ''}>${own ? 'COMPRADO' : price(0, d.gems)}</button>
          </div>`;
        })
        .join('')}</div>
      <button class="limited" data-panel="limited">${icon('fire')}<div><b>EDIÇÕES LIMITADAS</b><small>Carros exclusivos com tiragem fixa · toque para ver</small></div>${icon('chevron')}</button>
      <div class="sec-title">CAIXAS PADRÃO</div>
      <div class="box-grid">${BOXES.map(
        (b) => `<div class="box-card">
          <img src="${boxImg(b.id)}" alt="" data-odds="${b.id}" />
          <h4>${b.name}</h4>
          <div class="odds-mini">${Object.keys(b.odds).map((r) => `<i style="background:${RAR[r].color}" title="${RAR[r].name}"></i>`).join('')}</div>
          <div class="row gap">
            <button class="btn yellow sm" data-buybox="${b.id}" data-cur="coins">${coinIc('sm')} ${short(b.coins)}</button>
            <button class="btn green sm" data-buybox="${b.id}" data-cur="gems">${gemIc('sm')} ${full(b.gems)}</button>
          </div></div>`,
      ).join('')}</div>
      <p class="hint">Toque numa caixa para ver as chances de cada raridade.</p>`;
  },
  mount(root) {
    $$('[data-btab]', root).forEach((b) => (b.onclick = () => ((boxTab = b.dataset.btab), sfx.click(), render())));
    $$('[data-odds]', root).forEach((b) => (b.onclick = () => showOdds(b.dataset.odds)));
    $$('[data-car]', root).forEach((b) => (b.onclick = () => carDetail(b.dataset.car)));
    $$('[data-buybox]', root).forEach(
      (b) =>
        (b.onclick = () => {
          const box = BOXES.find((x) => x.id === b.dataset.buybox);
          const byGems = b.dataset.cur === 'gems';
          if (!pay(byGems ? 0 : box.coins, byGems ? box.gems : 0)) return notEnough(byGems);
          openBox(box.id);
        }),
    );
    $$('[data-openinv]', root).forEach(
      (b) =>
        (b.onclick = () => {
          const id = b.dataset.openinv;
          if (!S.boxes[id]) return;
          S.boxes[id]--;
          if (!S.boxes[id]) delete S.boxes[id];
          save();
          openBox(id);
        }),
    );
    $$('[data-drop]', root).forEach(
      (b) =>
        (b.onclick = () => {
          const d = dailyDrops().find((x) => x.car.id === b.dataset.drop);
          if (S.day.drops[d.car.id]) return;
          if (!pay(0, d.gems)) return notEnough(true);
          S.day.drops[d.car.id] = 1;
          revealCar(d.car, { source: 'OFERTA DO DIA', chance: null });
        }),
    );
  },
};
function notEnough(gems) {
  sfx.error();
  toast(gems ? `${gemIc()} Gemas insuficientes` : `${coinIc()} Moedas insuficientes`, 'bad');
}
function showOdds(id) {
  const b = BOXES.find((x) => x.id === id);
  const total = Object.values(b.odds).reduce((a, x) => a + x, 0);
  modal(`<div class="odds"><img src="${boxImg(id)}" alt="" /><h3>${b.name}</h3>
    ${Object.entries(b.odds)
      .map(([r, p]) => {
        const n = POOL.filter((c) => c.rarity === r).length;
        return `<div class="odd-row" style="--rc:${RAR[r].color}"><span>${rarityTag(r)}</span><span class="muted">${n} carros</span><b>${((p / total) * 100).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%</b></div>`;
      })
      .join('')}
    <div class="row gap" style="margin-top:14px"><button class="btn yellow" data-b="coins">${coinIc('sm')} ${full(b.coins)}</button><button class="btn green" data-b="gems">${gemIc('sm')} ${full(b.gems)}</button></div></div>`);
  $$('.odds [data-b]').forEach(
    (btn) =>
      (btn.onclick = () => {
        const g = btn.dataset.b === 'gems';
        if (!pay(g ? 0 : b.coins, g ? b.gems : 0)) return notEnough(g);
        $$('.modal-wrap').forEach((m) => m.close());
        openBox(id);
      }),
  );
}

// ---------------- abertura de caixa ----------------
function openBox(boxId) {
  const box = BOXES.find((b) => b.id === boxId);
  const { car, chance } = rollBox(boxId);
  track('opened');
  const rc = RAR[car.rarity];
  const ov = document.createElement('div');
  ov.className = 'opening';
  ov.innerHTML = `<div class="rays"></div><div class="op-box"><img src="${boxImg(boxId)}" alt="" /></div>
    <div class="op-hint">TOQUE PARA ABRIR <span>3</span></div><h3 class="op-name">${box.name}</h3>`;
  document.body.appendChild(ov);
  let taps = 0;
  const hint = $('.op-hint span', ov);
  ov.addEventListener('pointerdown', () => {
    if (taps >= 3) return;
    taps++;
    sfx.shake();
    buzz(25);
    const bx = $('.op-box', ov);
    bx.classList.remove('shake');
    void bx.offsetWidth;
    bx.classList.add('shake');
    ov.style.setProperty('--charge', taps / 3);
    // a terceira batida já revela a cor da raridade
    if (taps >= 2) ov.style.setProperty('--rc', rc.color);
    hint.textContent = 3 - taps;
    if (taps === 3) {
      setTimeout(() => {
        ov.classList.add('flash');
        setTimeout(() => {
          ov.remove();
          revealCar(car, { source: box.name.toUpperCase(), chance });
        }, 380);
      }, 350);
    }
  });
}

function revealCar(car, { source, chance }) {
  const isNew = !S.cars[car.id];
  addCar(car.id);
  const xp = XP_BY_RARITY[car.rarity];
  const rc = RAR[car.rarity];
  const tier = rc.order;
  sfx.reveal(tier);
  if (tier >= 3) confetti([rc.color, '#ffffff', '#ffb627', '#3d8bff']);
  buzz(tier >= 3 ? [30, 40, 60] : 20);
  const ov = document.createElement('div');
  ov.className = `reveal tier${tier}`;
  ov.style.setProperty('--rc', rc.color);
  ov.style.setProperty('--glow', rc.glow);
  const odds = chance ? `<div class="odds-pill">${icon('star')} 1 em ${full(Math.round(1 / chance))} tiradas</div>` : '';
  ov.innerHTML = `
    <div class="rv-src">${source} · ${isNew ? 'CARRO NOVO' : `REPETIDO (x${S.cars[car.id]})`}</div>
    <div class="rv-car"><div class="halo"></div><img src="${carImg(car.id)}" alt="" /></div>
    <h2 class="rv-name">${carName(car)}</h2>
    <div class="rv-tag">${rarityTag(car.rarity)} <span class="muted">· ${car.brand}</span></div>
    <div class="rv-vals">
      <div><small>VALOR DO CARRO</small><b>${coinIc()} ${full(car.value)}</b></div>
      <div><small>XP</small><b class="xp">${starIc()} +${full(xp)}</b></div>
    </div>
    ${specRow(car)}
    ${odds}
    <div class="rv-actions">
      <button class="btn green big" data-keep>ADICIONAR À COLEÇÃO</button>
      <button class="btn dark" data-sell>Venda rápida ${coinIc('sm')} ${short(sellPrice(car.id))}</button>
    </div>`;
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('in'));
  const finish = () => {
    ov.classList.remove('in');
    setTimeout(() => ov.remove(), 250);
    gainXp(xp);
    render();
  };
  $('[data-keep]', ov).onclick = () => {
    sfx.coin();
    finish();
  };
  $('[data-sell]', ov).onclick = () => {
    removeCar(car.id);
    earn(sellPrice(car.id));
    track('sold');
    sfx.coin();
    toast(`Vendido por ${coinIc()} ${full(sellPrice(car.id))}`);
    finish();
  };
}
function specRow(car) {
  return `<div class="specs">
    <div><b>${car.hp}<em>cv</em></b><small>POTÊNCIA</small></div>
    <div><b>${car.top}<em>km/h</em></b><small>MÁXIMA</small></div>
    <div><b>${car.acc.toLocaleString('pt-BR')}<em>s</em></b><small>0 A 100</small></div>
    <div><b>${car.year}</b><small>ANO</small></div></div>`;
}

// =====================================================================
// GARAGEM
// =====================================================================
const gview = { q: '', rar: 'all', sort: 'value', all: false };
const garage = {
  html() {
    return `
      <div class="stats3">
        <div>${coinIc('sm')}<b>${short(garageValue())}</b><small>Valor</small></div>
        <div><b>${full(totalCars())}</b><small>Carros</small></div>
        <div><b>${uniqueCars()}/${POOL.length + CARS.filter((c) => c.limited).length}</b><small>Únicos</small></div>
      </div>
      <div class="searchbar">
        <label class="search">${icon('search')}<input id="gq" placeholder="Buscar por nome ou marca" value="${gview.q}" /></label>
        <button class="sq ${gview.rar !== 'all' ? 'dot' : ''}" id="gfilter">${icon('filter')}</button>
        <button class="sq ${gview.all ? 'on' : ''}" id="gall" title="Mostrar todos">${icon('cards')}</button>
      </div>
      <div class="chips" id="gchips">
        ${['all', ...RARITY_KEYS].map((r) => `<button class="chip ${gview.rar === r ? 'on' : ''}" data-rar="${r}" style="--rc:${r === 'all' ? '#ffb627' : RAR[r].color}">${r === 'all' ? 'Todas' : RAR[r].name}</button>`).join('')}
      </div>
      <div class="sortrow"><span class="muted">Ordenar:</span>
        ${[['value', 'Valor'], ['rarity', 'Raridade'], ['name', 'Nome'], ['year', 'Ano']].map(([k, l]) => `<button class="link ${gview.sort === k ? 'on' : ''}" data-sort="${k}">${l}</button>`).join('')}
      </div>
      <div class="car-grid" id="ggrid"></div>`;
  },
  mount(root) {
    const grid = $('#ggrid', root);
    const draw = () => (grid.innerHTML = garageGrid());
    draw();
    $('#gq', root).addEventListener('input', (e) => {
      gview.q = e.target.value;
      draw();
    });
    $('#gfilter', root).onclick = () => $('#gchips', root).classList.toggle('open');
    if (gview.rar !== 'all') $('#gchips', root).classList.add('open');
    $('#gall', root).onclick = () => {
      gview.all = !gview.all;
      render();
    };
    $$('[data-rar]', root).forEach((b) => (b.onclick = () => ((gview.rar = b.dataset.rar), render())));
    $$('[data-sort]', root).forEach((b) => (b.onclick = () => ((gview.sort = b.dataset.sort), render())));
    grid.addEventListener('click', (e) => {
      const c = e.target.closest('[data-car]');
      if (c) carDetail(c.dataset.car);
    });
  },
};
function garageGrid() {
  const q = gview.q.trim().toLowerCase();
  let list = (gview.all ? CARS : CARS.filter((c) => S.cars[c.id])).filter((c) => (gview.rar === 'all' || c.rarity === gview.rar) && (!q || carName(c).toLowerCase().includes(q)));
  const by = {
    value: (a, b) => b.value - a.value,
    rarity: (a, b) => RAR[b.rarity].order - RAR[a.rarity].order || b.value - a.value,
    name: (a, b) => carName(a).localeCompare(carName(b)),
    year: (a, b) => b.year - a.year,
  };
  list.sort(by[gview.sort]);
  if (!list.length) return `<div class="empty wide">${icon('garage')}<p>${uniqueCars() ? 'Nenhum carro encontrado.' : 'Sua garagem está vazia. Abra caixas para ganhar carros!'}</p></div>`;
  return list
    .map((c) => {
      const n = S.cars[c.id] || 0;
      const R = RAR[c.rarity];
      return `<button class="car-card ${n ? '' : 'locked'}" data-car="${c.id}" style="--rc:${R.color};--glow:${R.glow}">
        ${n > 1 ? `<span class="dup">x${n}</span>` : ''}
        <div class="cimg"><img src="${carImg(c.id)}" alt="" loading="lazy" /></div>
        <h4>${n ? carName(c) : '???'}</h4>
        <div class="cval">${n ? `${coinIc('sm')} ${short(c.value)}` : `<span style="color:${R.color}">${R.name}</span>`}</div>
      </button>`;
    })
    .join('');
}

function carDetail(id) {
  const c = CAR_BY_ID[id];
  const n = S.cars[id] || 0;
  const R = RAR[c.rarity];
  const m = modal(
    `<div class="detail" style="--rc:${R.color};--glow:${R.glow}">
      <div class="rv-car small"><div class="halo"></div><img src="${carImg(id)}" class="${n ? '' : 'sil'}" alt="" /></div>
      <h2>${carName(c)}</h2>
      <div class="rv-tag">${rarityTag(c.rarity)} <span class="muted">· ${c.brand}</span>${c.limited ? ' <span class="ltag">EDIÇÃO LIMITADA</span>' : ''}</div>
      <div class="rv-vals"><div><small>VALOR</small><b>${coinIc()} ${full(c.value)}</b></div><div><small>NA GARAGEM</small><b>${n}</b></div></div>
      ${specRow(c)}
      ${
        n
          ? `<div class="col gap">
          <button class="btn yellow wide" data-feat ${S.featured === id ? 'disabled' : ''}>${S.featured === id ? 'EM DESTAQUE NO INÍCIO' : 'DESTACAR NO INÍCIO'}</button>
          <div class="row gap"><button class="btn dark" data-sell1>Vender 1 · ${coinIc('sm')} ${short(sellPrice(id))}</button>
          ${n > 1 ? `<button class="btn dark" data-selldup>Vender repetidos (${n - 1})</button>` : ''}</div></div>`
          : `<p class="muted center">${c.limited ? 'Disponível apenas nas Edições Limitadas.' : 'Ainda não está na sua garagem. Encontre-o nas caixas, no leilão ou na concessionária.'}</p>`
      }
    </div>`,
  );
  const feat = $('[data-feat]', m);
  if (feat)
    feat.onclick = () => {
      S.featured = id;
      save();
      sfx.click();
      m.close();
      toast('Carro em destaque atualizado');
    };
  const s1 = $('[data-sell1]', m);
  if (s1)
    s1.onclick = async () => {
      if (n === 1 && RAR[c.rarity].order >= 3 && !(await confirmBox(`Vender seu único ${carName(c)}?`, 'Vender'))) return;
      removeCar(id);
      earn(sellPrice(id));
      track('sold');
      sfx.coin();
      toast(`Vendido por ${coinIc()} ${full(sellPrice(id))}`);
      m.close();
      render();
    };
  const sd = $('[data-selldup]', m);
  if (sd)
    sd.onclick = () => {
      const k = (S.cars[id] || 1) - 1;
      for (let i = 0; i < k; i++) removeCar(id);
      earn(sellPrice(id) * k);
      track('sold', k);
      sfx.coin();
      toast(`${k} repetidos vendidos por ${coinIc()} ${full(sellPrice(id) * k)}`);
      m.close();
      render();
    };
}

// =====================================================================
// LEILÃO
// =====================================================================
const BOT_NAMES = ['Turbo_Rafa', 'GearHead99', 'Dona Lurdes', 'V8_Marcão', 'NitroNina', 'ColecionadorX', 'Barão do Asfalto', 'PistaLivre', 'Ju Drift', 'Velho Fusqueiro', 'ZeroACem', 'Magnata_SP'];
const niceRound = (v) => {
  const p = Math.pow(10, Math.max(0, Math.floor(Math.log10(v)) - 1));
  return Math.max(1, Math.round(v / p) * p);
};
function makeLot(n) {
  const r = rng('lot' + n);
  const weights = { raro: 34, epico: 44, lendario: 18, mitico: 4 };
  let x = r() * 100;
  let rar = 'raro';
  for (const [k, w] of Object.entries(weights)) if ((x -= w) <= 0) {
    rar = k;
    break;
  }
  const car = pick(POOL.filter((c) => c.rarity === rar), r);
  const start = niceRound(car.value * 0.35);
  const inc = niceRound(car.value * 0.04);
  const names = [...BOT_NAMES].sort(() => r() - 0.5).slice(0, 3);
  const bots = names.map((name) => ({ name, max: car.value * (0.45 + r() * 0.7) }));
  return { n, car, start, inc, bots };
}
let A = null; // leilão em andamento
function auctionBid(who) {
  A.bid = A.leader ? A.bid + A.lot.inc : A.lot.start;
  A.leader = who;
  A.log.unshift({ who, bid: A.bid });
  A.log = A.log.slice(0, 6);
  A.end = Math.max(A.end, Date.now() + 8000);
}
function auctionTick() {
  if (!A || A.done) return;
  const now = Date.now();
  if (now >= A.end) return finishAuction();
  // robôs tentam cobrir o lance
  if (now >= A.nextBot) {
    const next = A.leader ? A.bid + A.lot.inc : A.lot.start;
    const cands = A.lot.bots.filter((b) => b.name !== A.leader && b.max >= next);
    if (cands.length && Math.random() < 0.75) {
      auctionBid(pick(cands).name);
      sfx.click();
    }
    A.nextBot = now + 700 + Math.random() * (A.end - now < 4000 ? 900 : 2600);
  }
  if (tab === 'auction') drawAuctionLive();
}
function finishAuction() {
  A.done = true;
  const won = A.leader === 'Você';
  const lot = A.lot;
  S.lot++;
  save();
  if (won) {
    if (!pay(A.bid, 0)) {
      toast('Você não tinha moedas suficientes para pagar o lance.', 'bad');
    } else {
      S.stats.auctions++;
      A = null;
      revealCar(lot.car, { source: 'LEILÃO ARREMATADO', chance: null });
      return;
    }
  } else {
    sfx.lose();
    toast(A.leader ? `${A.leader} arrematou por ${coinIc()} ${short(A.bid)}` : 'Leilão encerrado sem lances.');
  }
  A = null;
  if (tab === 'auction') render();
}
const auction = {
  html() {
    const lot = A ? A.lot : makeLot(S.lot);
    const c = lot.car;
    const R = RAR[c.rarity];
    return `<div class="sec-title">LEILÃO AO VIVO <span class="muted">Lote #${lot.n}</span></div>
      <div class="auc-card" style="--rc:${R.color};--glow:${R.glow}">
        <div class="rv-car small" data-car="${c.id}"><div class="halo"></div><img src="${carImg(c.id)}" alt="" /></div>
        <h2>${carName(c)}</h2>
        <div class="rv-tag">${rarityTag(c.rarity)} <span class="muted">· valor de tabela ${coinIc('sm')} ${short(c.value)}</span></div>
        <div id="auclive"></div>
      </div>
      <p class="hint">Cada lance aumenta ${coinIc('sm')} ${short(lot.inc)} e garante pelo menos 8 segundos no relógio. Quem estiver na frente quando o tempo acabar leva o carro.</p>`;
  },
  mount(root) {
    $$('[data-car]', root).forEach((b) => (b.onclick = () => carDetail(b.dataset.car)));
    drawAuctionLive();
  },
};
function drawAuctionLive() {
  const host = $('#auclive');
  if (!host) return;
  if (!A) {
    const lot = makeLot(S.lot);
    host.innerHTML = `<div class="auc-start"><div><small>LANCE INICIAL</small><b>${coinIc()} ${full(lot.start)}</b></div><div><small>RIVAIS</small><b>${lot.bots.length}</b></div></div>
      <button class="btn green big wide" id="aucjoin">${icon('gavel')} ENTRAR NO LEILÃO</button>`;
    $('#aucjoin').onclick = () => {
      A = { lot, bid: 0, leader: null, log: [], end: Date.now() + 20000, nextBot: Date.now() + 2500, done: false };
      track('games');
      sfx.click();
      drawAuctionLive();
    };
    return;
  }
  const left = Math.max(0, A.end - Date.now());
  const next = A.leader ? A.bid + A.lot.inc : A.lot.start;
  const me = A.leader === 'Você';
  host.innerHTML = `<div class="auc-live">
      <div class="auc-timer ${left < 5000 ? 'hot' : ''}">${icon('clock')} ${Math.ceil(left / 1000)}s</div>
      <div class="auc-bid"><small>${A.leader ? 'MAIOR LANCE' : 'SEM LANCES'}</small><b>${coinIc()} ${full(A.bid || A.lot.start)}</b><span class="${me ? 'me' : ''}">${A.leader ? (me ? 'Você está na frente!' : A.leader) : '—'}</span></div>
      <ul class="auc-log">${A.log.map((l) => `<li class="${l.who === 'Você' ? 'me' : ''}"><span>${l.who}</span><b>${short(l.bid)}</b></li>`).join('')}</ul>
      <button class="btn ${me ? 'dark' : 'green'} big wide" id="aucbid" ${me ? 'disabled' : ''}>${me ? 'AGUARDANDO RIVAIS…' : `DAR LANCE ${coinIc('sm')} ${full(next)}`}</button></div>`;
  const b = $('#aucbid');
  if (b && !me)
    b.onclick = () => {
      if (S.coins < next) return notEnough(false);
      auctionBid('Você');
      track('bids');
      sfx.coin();
      buzz(15);
      drawAuctionLive();
    };
}

// =====================================================================
// LOJA
// =====================================================================
const MARKET_BLOCK = 4 * 3600e3;
function marketCars() {
  const block = Math.floor(Date.now() / MARKET_BLOCK);
  if (S.market.block !== block) S.market = { block, bought: {} };
  const r = rng('market' + block);
  const used = new Set();
  return ['comum', 'incomum', 'incomum', 'raro', 'raro', 'epico'].map((t) => {
    const opts = POOL.filter((c) => c.rarity === t && !used.has(c.id));
    const c = opts[Math.floor(r() * opts.length)];
    used.add(c.id);
    return c;
  });
}
const REWARDS = [{ coins: 2000 }, { coins: 4000 }, { gems: 10 }, { coins: 10000 }, { box: 'entusiasta' }, { gems: 25 }, { gems: 50, box: 'colecionador' }];
function rewardLabel(r) {
  const out = [];
  if (r.coins) out.push(`${coinIc('sm')} ${short(r.coins * Math.max(1, S.level / 2))}`);
  if (r.gems) out.push(`${gemIc('sm')} ${r.gems}`);
  if (r.box) out.push(`${icon('box')} ${BOXES.find((b) => b.id === r.box).name.replace('Caixa ', '')}`);
  return out.join(' + ');
}
function grant(r) {
  if (r.coins) earn(r.coins * Math.max(1, S.level / 2));
  if (r.gems) earn(0, r.gems);
  if (r.box) S.boxes[r.box] = (S.boxes[r.box] || 0) + 1;
  changed();
}
const exchangeRate = () => 2500 + S.level * 600;
const store = {
  html() {
    const today = todayKey();
    const claimedToday = S.reward.last === today;
    const yest = todayKey(Date.now() - 86400e3);
    const streak = S.reward.last === today || S.reward.last === yest ? S.reward.streak : 0;
    const dayIdx = claimedToday ? (streak - 1) % 7 : streak % 7;
    const mk = marketCars();
    const left = MARKET_BLOCK - (Date.now() % MARKET_BLOCK);
    return `<div class="sec-title">RECOMPENSA DIÁRIA <span class="muted">sequência: ${streak} dia(s)</span></div>
      <div class="streak">${REWARDS.map((r, i) => `<div class="sday ${i < dayIdx || (claimedToday && i === dayIdx) ? 'got' : ''} ${i === dayIdx && !claimedToday ? 'now' : ''}"><small>DIA ${i + 1}</small><span>${rewardLabel(r)}</span></div>`).join('')}</div>
      <button class="btn ${claimedToday ? 'dark' : 'green'} wide" id="claimday" ${claimedToday ? 'disabled' : ''}>${claimedToday ? `Volte em ${clock(msToMidnight())}` : 'RESGATAR RECOMPENSA'}</button>

      <div class="sec-title">CONCESSIONÁRIA <span class="timer">${icon('clock')} Novo estoque em <b>${clock(left)}</b></span></div>
      <div class="car-grid">${mk
        .map((c, i) => {
          const R = RAR[c.rarity];
          const cost = Math.round(c.value * 1.3);
          const sold = S.market.bought[i];
          return `<div class="car-card shop" style="--rc:${R.color};--glow:${R.glow}">
            <div class="cimg" data-car="${c.id}"><img src="${carImg(c.id)}" alt="" loading="lazy" /></div>
            <h4>${carName(c)}</h4>
            <button class="btn yellow sm" data-buycar="${i}" ${sold ? 'disabled' : ''}>${sold ? 'VENDIDO' : `${coinIc('sm')} ${short(cost)}`}</button>
          </div>`;
        })
        .join('')}</div>

      <div class="sec-title">CÂMBIO</div>
      <div class="xchg">
        <button class="xrow" data-x="g2c">${gemIc()} 10 <span>→</span> ${coinIc()} ${full(exchangeRate() * 10)}</button>
        <button class="xrow" data-x="g2c100">${gemIc()} 100 <span>→</span> ${coinIc()} ${full(exchangeRate() * 110)}</button>
        <button class="xrow" data-x="c2g">${coinIc()} ${full(exchangeRate() * 15)} <span>→</span> ${gemIc()} 5</button>
      </div>`;
  },
  mount(root) {
    $('#claimday', root).onclick = () => {
      const today = todayKey();
      if (S.reward.last === today) return;
      const yest = todayKey(Date.now() - 86400e3);
      const streak = S.reward.last === yest ? S.reward.streak : 0;
      grant(REWARDS[streak % 7]);
      S.reward = { last: today, streak: streak + 1 };
      save();
      sfx.win();
      toast(`Recompensa resgatada: ${rewardLabel(REWARDS[streak % 7])}`, 'gold');
      render();
    };
    $$('[data-car]', root).forEach((b) => (b.onclick = () => carDetail(b.dataset.car)));
    $$('[data-buycar]', root).forEach(
      (b) =>
        (b.onclick = () => {
          const i = +b.dataset.buycar;
          const c = marketCars()[i];
          if (S.market.bought[i]) return;
          if (!pay(Math.round(c.value * 1.3), 0)) return notEnough(false);
          S.market.bought[i] = 1;
          revealCar(c, { source: 'CONCESSIONÁRIA', chance: null });
        }),
    );
    $$('[data-x]', root).forEach((b) => (b.onclick = () => exchange(b.dataset.x)));
  },
};
function exchange(kind) {
  const r = exchangeRate();
  if (kind === 'g2c' && pay(0, 10)) earn(r * 10);
  else if (kind === 'g2c100' && pay(0, 100)) earn(r * 110);
  else if (kind === 'c2g' && pay(r * 15, 0)) earn(0, 5);
  else return notEnough(kind !== 'c2g');
  sfx.coin();
  toast('Troca realizada!');
  render();
}

// =====================================================================
// JOGOS
// =====================================================================
const games = {
  html() {
    return `<div class="game-list">${GAMES.map(
      (g) => `<div class="game-row">${icon(g.icon, 'big')}<div><h3>${g.name}</h3><p>${g.desc}</p></div><button class="btn green" data-game="${g.id}">${g.cta}</button></div>`,
    ).join('')}</div>`;
  },
  mount(root) {
    $$('[data-game]', root).forEach(
      (b) =>
        (b.onclick = () => {
          sfx.click();
          if (b.dataset.game === 'auction') return go('auction');
          openGame(b.dataset.game, { carDetail, render, gainXp });
        }),
    );
  },
};

const SCREENS = { home, boxes, garage, auction, store, games };

// =====================================================================
// Painéis laterais (janelas)
// =====================================================================
const PANELS = {
  menu() {
    const m = modal(`<h3 class="m-title">Menu</h3><div class="col gap">
      <button class="btn dark wide" data-t="sound">${icon('sound')} Som: ${S.sound ? 'ligado' : 'desligado'}</button>
      <button class="btn dark wide" data-t="vibrate">Vibração: ${S.vibrate ? 'ligada' : 'desligada'}</button>
      <button class="btn dark wide" data-panel="profile">${icon('helmet')} Perfil e estatísticas</button>
      <button class="btn ghost wide" data-t="reset">Apagar progresso</button>
      <p class="muted center small">Garagem Lendária · marcas e modelos fictícios.<br/>Imagens dos carros geradas proceduralmente.</p></div>`);
    $$('[data-t]', m).forEach(
      (b) =>
        (b.onclick = async () => {
          const t = b.dataset.t;
          if (t === 'reset') {
            if (await confirmBox('Apagar todo o progresso? Isso não pode ser desfeito.', 'Apagar')) resetGame();
            return;
          }
          S[t] = !S[t];
          save();
          m.close();
          PANELS.menu();
        }),
    );
  },
  reward() {
    go('store');
  },
  exchange() {
    go('store');
    setTimeout(() => $('.xchg')?.scrollIntoView({ behavior: 'smooth' }), 50);
  },
  tasks() {
    ensureDay();
    const rew = (r) => (r.coins ? `${coinIc('sm')} ${full(r.coins)}` : r.gems ? `${gemIc('sm')} ${r.gems}` : `${icon('box')} ${BOXES.find((b) => b.id === r.box).name}`);
    const m = modal(`<h3 class="m-title">Tarefas diárias</h3><p class="muted center small">Renovam em ${clock(msToMidnight())}</p>
      <div class="col gap">${TASKS.map((t) => {
        const v = Math.min(t.goal, S.day[t.id] || 0);
        const done = v >= t.goal;
        const got = S.day.claimed[t.id];
        return `<div class="task ${got ? 'got' : ''}"><div><b>${t.name}</b><div class="bar thin"><i style="width:${(v / t.goal) * 100}%"></i></div><small>${v}/${t.goal} · ${rew(t.reward)}</small></div>
          <button class="btn ${done && !got ? 'green' : 'dark'} sm" data-claim="${t.id}" ${!done || got ? 'disabled' : ''}>${got ? '✓' : 'Pegar'}</button></div>`;
      }).join('')}
      <div class="task bonus ${S.day.claimed.all ? 'got' : ''}"><div><b>Bônus: complete todas</b><small>${icon('box')} Caixa Colecionador</small></div>
        <button class="btn ${allTasksDone() && !S.day.claimed.all ? 'green' : 'dark'} sm" data-claim="all" ${!allTasksDone() || S.day.claimed.all ? 'disabled' : ''}>${S.day.claimed.all ? '✓' : 'Pegar'}</button></div></div>`);
    $$('[data-claim]', m).forEach(
      (b) =>
        (b.onclick = () => {
          const id = b.dataset.claim;
          if (id === 'all') grant({ box: 'colecionador' });
          else grant(TASKS.find((t) => t.id === id).reward);
          S.day.claimed[id] = 1;
          save();
          sfx.coin();
          m.close();
          PANELS.tasks();
          render();
        }),
    );
  },
  ranking() {
    const r = rng('ranking-v1');
    const me = garageValue();
    const rows = BOT_NAMES.concat(['Vroom Vroom', 'Fernanda GT', 'O Colecionador', 'Rei do Leilão', 'Pé de Chumbo', 'Tia do Turbo', 'ClassicLover']).map((name, i) => ({
      name,
      v: Math.round(Math.pow(10, 4 + r() * 5.2) / 1000) * 1000,
      lv: 3 + Math.floor(r() * 60),
    }));
    rows.push({ name: `${S.name} (você)`, v: me, lv: S.level, me: true });
    rows.sort((a, b) => b.v - a.v);
    modal(`<h3 class="m-title">Ranking de garagens</h3><ol class="rank">${rows
      .map((x, i) => `<li class="${x.me ? 'me' : ''}"><span class="pos">${i + 1}</span><span class="nm">${x.name}<small>nível ${x.lv}</small></span><b>${coinIc('sm')} ${short(x.v)}</b></li>`)
      .join('')}</ol>`);
  },
  profile() {
    $$('.modal-wrap').forEach((m) => m.close && m.close());
    const best = S.stats.best && CAR_BY_ID[S.stats.best];
    const m = modal(`<h3 class="m-title">Perfil</h3>
      <label class="field"><span>Nome</span><input id="pname" maxlength="18" value="${S.name.replace(/"/g, '&quot;')}" /></label>
      <div class="pstats">
        <div><small>Nível</small><b>${S.level}</b></div>
        <div><small>Valor da garagem</small><b>${short(garageValue())}</b></div>
        <div><small>Carros únicos</small><b>${uniqueCars()}</b></div>
        <div><small>Caixas abertas</small><b>${full(S.stats.opened)}</b></div>
        <div><small>Toques</small><b>${full(S.stats.taps)}</b></div>
        <div><small>Moedas ganhas</small><b>${short(S.stats.earned)}</b></div>
        <div><small>Leilões vencidos</small><b>${S.stats.auctions}</b></div>
        <div><small>Minijogos</small><b>${full(S.stats.games)}</b></div>
      </div>
      ${best ? `<div class="best"><small>MELHOR TIRADA</small><img src="${carImg(best.id)}" alt="" /><b>${carName(best)}</b></div>` : ''}`);
    $('#pname', m).addEventListener('change', (e) => {
      S.name = e.target.value.trim() || 'Piloto';
      save();
    });
  },
  boosts() {
    const m = modal(`<h3 class="m-title">Melhorias</h3><div class="col gap">${UPGRADES.map((u) => {
      const l = S.upg[u.id];
      const maxed = l >= u.max;
      const cost = u.cost(l);
      return `<div class="task"><div><b>${u.name} <span class="lv">Nv ${l}/${u.max}</span></b><small>${u.desc}</small></div>
        <button class="btn ${maxed ? 'dark' : 'yellow'} sm" data-up="${u.id}" ${maxed ? 'disabled' : ''}>${maxed ? 'MÁX' : `${coinIc('sm')} ${short(cost)}`}</button></div>`;
    }).join('')}</div>
    <p class="muted center small">Toque: ${coinIc('sm')} ${short(tapValue())} · Renda: ${short(passivePerHour())}/h · Fora do jogo: até ${offlineHours()} h</p>`);
    $$('[data-up]', m).forEach(
      (b) =>
        (b.onclick = () => {
          const u = UPGRADES.find((x) => x.id === b.dataset.up);
          if (!pay(u.cost(S.upg[u.id]), 0)) return notEnough(false);
          S.upg[u.id]++;
          save();
          sfx.coin();
          m.close();
          PANELS.boosts();
          render();
        }),
    );
  },
  awards() {
    const m = modal(`<h3 class="m-title">Conquistas</h3><div class="col gap">${ACHIEVEMENTS.map((a) => {
      const ok = a.test();
      const got = S.ach[a.id];
      return `<div class="task ${got ? 'got' : ''}"><div><b>${icon('medal')} ${a.name}</b><small>${a.desc} · ${gemIc('sm')} ${a.gems}</small></div>
        <button class="btn ${ok && !got ? 'green' : 'dark'} sm" data-ach="${a.id}" ${!ok || got ? 'disabled' : ''}>${got ? '✓' : ok ? 'Pegar' : '—'}</button></div>`;
    }).join('')}</div>`);
    $$('[data-ach]', m).forEach(
      (b) =>
        (b.onclick = () => {
          const a = ACHIEVEMENTS.find((x) => x.id === b.dataset.ach);
          S.ach[a.id] = 1;
          earn(0, a.gems);
          sfx.win();
          m.close();
          PANELS.awards();
          render();
        }),
    );
  },
  sets() {
    const m = modal(`<h3 class="m-title">Coleções de marca</h3><p class="muted center small">Complete uma marca para ganhar gemas, moedas e +5% permanente por toque.</p>
      <div class="col gap">${SETS.map((s) => {
        const have = s.ids.filter((id) => S.cars[id]).length;
        const done = have === s.ids.length;
        const got = S.sets[s.brand];
        return `<div class="set ${got ? 'got' : ''}"><div class="set-h"><b>${s.brand}</b><span>${have}/${s.ids.length}</span>
          <button class="btn ${done && !got ? 'green' : 'dark'} sm" data-set="${s.brand}" ${!done || got ? 'disabled' : ''}>${got ? '✓' : `${gemIc('sm')} ${s.gems}`}</button></div>
          <div class="set-cars">${s.ids.map((id) => `<img src="${carImg(id)}" class="${S.cars[id] ? '' : 'sil'}" data-car="${id}" alt="" />`).join('')}</div></div>`;
      }).join('')}</div>`);
    $$('[data-car]', m).forEach((b) => (b.onclick = () => carDetail(b.dataset.car)));
    $$('[data-set]', m).forEach(
      (b) =>
        (b.onclick = () => {
          const s = SETS.find((x) => x.brand === b.dataset.set);
          S.sets[s.brand] = 1;
          earn(s.coins, s.gems);
          sfx.win();
          confetti();
          m.close();
          PANELS.sets();
          render();
        }),
    );
  },
  limited() {
    const lim = CARS.filter((c) => c.limited);
    const m = modal(`<h3 class="m-title">${icon('fire')} Edições limitadas</h3><p class="muted center small">Tiragem fixa. Cada jogador só pode ter um exemplar.</p>
      <div class="col gap">${lim
        .map((c) => {
          const R = RAR[c.rarity];
          const own = S.limited[c.id];
          const left = limitedLeft(c);
          return `<div class="lim" style="--rc:${R.color};--glow:${R.glow}">
            <div class="cimg" data-car="${c.id}"><img src="${carImg(c.id)}" alt="" /></div>
            <div class="lim-info"><b>${carName(c)}</b><small>${left} de ${c.limited.supply} restantes</small>
            <button class="btn green sm" data-lim="${c.id}" ${own ? 'disabled' : ''}>${own ? 'NA SUA GARAGEM' : price(0, c.limited.gems)}</button></div></div>`;
        })
        .join('')}</div>`);
    $$('[data-car]', m).forEach((b) => (b.onclick = () => carDetail(b.dataset.car)));
    $$('[data-lim]', m).forEach(
      (b) =>
        (b.onclick = () => {
          const c = CAR_BY_ID[b.dataset.lim];
          if (S.limited[c.id]) return;
          if (!pay(0, c.limited.gems)) return notEnough(true);
          S.limited[c.id] = 1;
          m.close();
          revealCar(c, { source: `EDIÇÃO LIMITADA · #${c.limited.supply - limitedLeft(c) + 1}/${c.limited.supply}`, chance: null });
        }),
    );
  },
};

// =====================================================================
// Laço principal
// =====================================================================
let passiveAcc = 0;
let last = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - last) / 1000;
  last = now;
  passiveAcc += (passivePerHour() / 3600) * dt;
  if (passiveAcc >= 1) {
    const v = Math.floor(passiveAcc);
    passiveAcc -= v;
    S.coins += v;
    S.stats.earned += v;
    save();
  }
  auctionTick();
  if (tab === 'home') updateHome();
  else updateCounters();
  const dtm = $('#droptimer');
  if (dtm) dtm.textContent = clock(msToMidnight());
}, 250);
setInterval(() => save(true), 5000);
addEventListener('visibilitychange', () => document.hidden && save(true));
onChange(updateCounters);

// início
ensureDay();
const away = collectOffline();
render();
if (away > 0)
  setTimeout(
    () =>
      modal(`<div class="lvlup"><div class="lvl-big">${icon('garage')}</div><h2>Bem-vindo de volta!</h2><p>Sua garagem rendeu enquanto você esteve fora.</p>
      <div class="reward-row"><span>${coinIc()} +${full(away)}</span></div><button class="btn yellow wide" data-close>Coletar</button></div>`),
    300,
  );

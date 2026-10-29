'use strict';
// Interface HTML: barra de construção, recursos, loja, painel da construção, telas.

const $ = (id) => document.getElementById(id);
const fmt = (n) => {
  n = Math.floor(n);
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e4) return (n / 1e3).toFixed(1) + 'k';
  return String(n);
};
function costHtml(c) {
  const parts = [];
  if (c.wood) parts.push(`<span class="c-wood">${fmt(c.wood)} madeira</span>`);
  if (c.stone) parts.push(`<span class="c-stone">${fmt(c.stone)} pedra</span>`);
  if (c.gold) parts.push(`<span class="c-gold">${fmt(c.gold)} ouro</span>`);
  return parts.join(' · ') || '<span class="c-free">Grátis</span>';
}
function iconCanvas(size, draw) {
  const c = document.createElement('canvas');
  const d = 2;
  c.width = c.height = size * d;
  c.style.width = c.style.height = size + 'px';
  const x = c.getContext('2d');
  x.scale(d, d); x.translate(size / 2, size / 2);
  draw(x);
  return c;
}
function buildingIcon(type, size) {
  return iconCanvas(size, (x) => {
    const s = BUILDINGS[type].size === 2 ? size / 100 : size / 52;
    x.scale(s, s);
    drawBuilding(x, type, 1, null, 0.5);
  });
}

const UI = {
  slots: {}, lastRefresh: 0,

  init() {
    // barra de construção
    const tb = $('toolbar');
    const mk = (type, key) => {
      const el = document.createElement('div');
      el.className = 'slot';
      el.appendChild(buildingIcon(type, 54));
      const k = document.createElement('span'); k.className = 'key'; k.textContent = key; el.appendChild(k);
      el.addEventListener('click', () => { Sfx.init(); this.selectBuild(type); });
      el.addEventListener('mouseenter', () => this.showTip(el, type));
      el.addEventListener('mouseleave', () => $('tooltip').classList.add('hidden'));
      tb.appendChild(el);
      this.slots[type] = el;
    };
    mk('stash', '1');
    TOOLBAR.forEach((t, i) => mk(t, String((i + 1) % 10)));

    // armas
    const wb = $('weapons');
    for (const k of WEAPON_ORDER) {
      const el = document.createElement('div');
      el.className = 'wslot';
      el.appendChild(iconCanvas(40, (x) => { x.scale(0.55, 0.55); x.rotate(-0.8); x.translate(-30, 0); drawWeapon(x, k, 1); }));
      el.title = WEAPONS[k].name;
      el.addEventListener('click', () => { if (G.player.owned[k]) { G.player.weapon = k; this.refresh(); } });
      wb.appendChild(el);
      this.slots['w_' + k] = el;
    }
    const pot = document.createElement('div');
    pot.className = 'wslot potion';
    pot.appendChild(iconCanvas(40, (x) => drawResIcon(x, 'potion', 34)));
    const pk = document.createElement('span'); pk.className = 'key'; pk.textContent = 'F'; pot.appendChild(pk);
    pot.title = `Poção de Vida (${POTION_COST} ouro)`;
    pot.addEventListener('click', () => { const e = usePotion(); if (e) this.toast(e, true); });
    wb.appendChild(pot);

    // ícones de recursos
    for (const k of ['wood', 'stone', 'gold']) $('ri-' + k).appendChild(iconCanvas(26, (x) => drawResIcon(x, k, 26)));

    $('shopbtn').addEventListener('click', () => this.toggleShop());
    $('helpbtn').addEventListener('click', () => $('help').classList.toggle('hidden'));
    $('help').addEventListener('click', () => $('help').classList.add('hidden'));
    $('shopclose').addEventListener('click', () => this.closeShop());
    $('bp-up').addEventListener('click', () => { if (G.selected) upgradeBuilding(G.selected); this.refresh(); });
    $('bp-upall').addEventListener('click', () => {
      if (!G.selected) return;
      const n = upgradeAll(G.selected.type, G.selected.tier);
      this.toast(n ? `${n} construções melhoradas` : 'Nada pôde ser melhorado', !n);
      this.refresh();
    });
    $('bp-sell').addEventListener('click', () => { if (G.selected) sellBuilding(G.selected); this.refresh(); });
    document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((o) => o.classList.toggle('active', o === t));
      this.shopTab = t.dataset.tab; this.renderShop();
    }));
    this.shopTab = 'weapons';
    for (const el of document.querySelectorAll('.hud-block')) {
      el.addEventListener('mousedown', (e) => e.stopPropagation());
      el.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    }
  },

  selectBuild(type) {
    if (!G.stash && type !== 'stash') { this.toast('Coloque o Cofre de Ouro primeiro!', true); Sfx.play('error'); return; }
    if (G.stash && type === 'stash') return;
    G.build = G.build === type ? null : type;
    G.selected = null;
    this.refresh();
  },

  showTip(el, type) {
    const def = BUILDINGS[type];
    const tip = $('tooltip');
    const n = G.counts[type] || 0;
    tip.innerHTML = `<b>${def.name}</b><div class="tcost">${costHtml(def.cost)}</div><div>${def.desc}</div>` +
      (type !== 'stash' ? `<div class="tlim">${n}/${limitFor(type)} construídas</div>` : '');
    tip.classList.remove('hidden');
    const r = el.getBoundingClientRect();
    tip.style.left = Math.min(window.innerWidth - 270, Math.max(8, r.left + r.width / 2 - 130)) + 'px';
    tip.style.bottom = (window.innerHeight - r.top + 10) + 'px';
  },

  toast(msg, warn) {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = 'toast' + (warn ? ' warn' : '');
    el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 3) box.firstChild.remove();
    setTimeout(() => el.classList.add('fade'), 2600);
    setTimeout(() => el.remove(), 3200);
  },

  toggleShop() { $('shop').classList.contains('hidden') ? this.openShop() : this.closeShop(); },
  openShop() { $('shop').classList.remove('hidden'); this.renderShop(); },
  closeShop() { $('shop').classList.add('hidden'); },

  renderShop() {
    const list = $('shoplist');
    list.innerHTML = '';
    const p = G.player;
    const item = (iconDraw, title, sub, desc, price, owned, onBuy) => {
      const el = document.createElement('div');
      el.className = 'item';
      const ic = iconCanvas(64, iconDraw);
      el.appendChild(ic);
      const info = document.createElement('div');
      info.className = 'info';
      info.innerHTML = `<b>${title}</b><span class="sub">${sub}</span><p>${desc}</p>`;
      el.appendChild(info);
      const btn = document.createElement('button');
      if (price === null) { btn.textContent = 'Máximo'; btn.disabled = true; }
      else { btn.innerHTML = `${owned ? 'Melhorar' : 'Comprar'}<br><small>${fmt(price)} ouro</small>`; btn.disabled = G.res.gold < price; }
      btn.addEventListener('click', () => { const e = onBuy(); if (e) this.toast(e, true); this.renderShop(); this.refresh(); });
      el.appendChild(btn);
      list.appendChild(el);
    };
    if (this.shopTab === 'weapons') {
      for (const k of WEAPON_ORDER) {
        const w = WEAPONS[k], cur = p.owned[k] || 0;
        const nextTier = Math.min(cur + 1, w.costs.length);
        const price = cur >= w.costs.length ? null : w.costs[cur];
        const stat = `Dano ${w.dmg[nextTier - 1]}` + (w.gather ? ` · Coleta ${w.gather[nextTier - 1]}` : '');
        item((x) => { x.scale(0.75, 0.75); x.rotate(-0.8); x.translate(-30, 0); drawWeapon(x, k, nextTier); },
          w.name, cur ? `Nível ${TIER_ROMAN[cur - 1]}${price !== null ? ' → ' + TIER_ROMAN[cur] : ''}` : 'Não possui',
          `${w.desc} <i>${stat}</i>`, price, cur > 0, () => buyWeapon(k));
      }
    } else if (this.shopTab === 'armor') {
      const cur = p.shieldTier;
      const price = cur >= SHIELD.costs.length ? null : SHIELD.costs[cur];
      item((x) => drawResIcon(x, 'shield', 56), SHIELD.name,
        cur ? `Nível ${TIER_ROMAN[cur - 1]}` : 'Não possui',
        `${SHIELD.desc} <i>Escudo ${SHIELD.hp[Math.min(cur, SHIELD.hp.length - 1)]}</i>`, price, cur > 0, buyShield);
    } else {
      item((x) => drawResIcon(x, 'potion', 56), 'Poção de Vida', 'Uso imediato (tecla F)',
        'Restaura toda a sua vida.', POTION_COST, false, usePotion);
    }
  },

  refresh() {
    const p = G.player;
    for (const [type, el] of Object.entries(this.slots)) {
      if (type.startsWith('w_')) {
        const k = type.slice(2);
        el.classList.toggle('locked', !p.owned[k]);
        el.classList.toggle('active', p.weapon === k);
        continue;
      }
      if (type === 'stash') { el.style.display = G.stash ? 'none' : ''; el.classList.toggle('glow', !G.stash); }
      else el.classList.toggle('locked', !G.stash);
      el.classList.toggle('active', G.build === type);
    }
    this.renderPanel();
  },

  renderPanel() {
    const b = G.selected;
    const bp = $('bpanel');
    if (!b || !G.buildings.has(b.id)) { bp.classList.add('hidden'); G.selected = null; return; }
    const def = BUILDINGS[b.type];
    bp.classList.remove('hidden');
    $('bp-name').textContent = def.name;
    $('bp-tier').textContent = `Nível ${TIER_ROMAN[b.tier - 1]}`;
    const rows = [['Vida', `${fmt(b.hp)} / ${fmt(b.maxHp)}`]];
    const nt = Math.min(MAX_TIER, b.tier + 1);
    const nxt = (v) => (b.tier < MAX_TIER ? ` <span class="nx">→ ${v}</span>` : '');
    if (def.tower) {
      rows.push(['Dano', `${Math.round(towerStat(b, 'dmg'))}${nxt(Math.round(def.dmg * DMG_MULT[nt - 1]))}`]);
      rows.push(['Alcance', `${Math.round(towerStat(b, 'range'))}`]);
      rows.push(['Recarga', `${towerStat(b, 'rate').toFixed(2)}s`]);
    }
    if (b.type === 'goldmine') rows.push(['Ouro/s', `${def.income[b.tier - 1]}${nxt(def.income[nt - 1])}`]);
    if (b.type === 'harvester') rows.push(['Taxa', `${def.rate[b.tier - 1]}${nxt(def.rate[nt - 1])}`], ['Árvores/Rochas', `${b.trees}/${b.stones}`]);
    if (b.type === 'slowtrap') rows.push(['Velocidade', `${Math.round(def.slow[b.tier - 1] * 100)}%`]);
    if (b.type === 'stash') rows.push(['Nível máx. das construções', TIER_ROMAN[b.tier - 1]]);
    $('bp-stats').innerHTML = rows.map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('');
    const err = upgradeError(b);
    const up = $('bp-up');
    if (b.tier >= MAX_TIER) { up.innerHTML = 'Nível máximo'; up.disabled = true; }
    else {
      up.innerHTML = `Melhorar (E)<br><small>${costHtml(upgradeCost(b))}</small>`;
      up.disabled = !!err;
      up.title = err || '';
    }
    $('bp-upall').style.display = b.type === 'stash' || b.tier >= MAX_TIER ? 'none' : '';
    const sell = $('bp-sell');
    sell.style.display = b.type === 'stash' ? 'none' : '';
    sell.innerHTML = `Vender (T)<br><small>${costHtml(sellRefund(b))}</small>`;
    const hint = $('bp-hint');
    hint.textContent = err && b.tier < MAX_TIER ? err : '';
  },

  frame(dt) {
    const p = G.player;
    $('r-wood').textContent = fmt(G.res.wood);
    $('r-stone').textContent = fmt(G.res.stone);
    $('r-gold').textContent = fmt(G.res.gold);
    $('hpfill').style.width = (p.hp / p.maxHp * 100) + '%';
    $('hptext').textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    const sh = $('shieldbar');
    if (p.shieldTier) { sh.classList.remove('hidden'); $('shfill').style.width = (p.shield / SHIELD.hp[p.shieldTier - 1] * 100) + '%'; }
    else sh.classList.add('hidden');

    // relógio
    const len = G.night ? NIGHT_LEN : DAY_LEN;
    const left = Math.ceil(len - G.clock);
    const day = $('daybar');
    day.classList.toggle('night', G.night);
    $('dayfill').style.width = (G.stash ? (G.clock / len) * 100 : 0) + '%';
    $('daytext').textContent = !G.stash ? 'Coloque seu Cofre de Ouro' :
      G.night ? `Noite ${G.day} — onda ${G.wave} (${left}s)` : `Dia ${G.day} — noite em ${left}s`;
    $('s-score').textContent = fmt(G.score);
    $('s-wave').textContent = G.wave;
    $('s-zombies').textContent = G.zombies.length;
    $('s-kills').textContent = fmt(G.kills);

    // painel da construção segue a construção na tela
    const b = G.selected;
    const bp = $('bpanel');
    if (b && !bp.classList.contains('hidden')) {
      const s = worldToScreen(b.x, b.y - b.size * CELL / 2);
      const w = bp.offsetWidth, h = bp.offsetHeight;
      bp.style.left = clamp(s.x - w / 2, 8, window.innerWidth - w - 8) + 'px';
      bp.style.top = clamp(s.y - h - 16, 60, window.innerHeight - h - 8) + 'px';
    }
    this.lastRefresh += dt;
    if (this.lastRefresh > 0.25) {
      this.lastRefresh = 0;
      if (G.selected) this.renderPanel();
      if (!$('shop').classList.contains('hidden')) {
        // atualiza apenas a habilitação dos botões
        const btns = $('shoplist').querySelectorAll('button');
        btns.forEach((btn) => {
          const m = btn.innerHTML.match(/([\d.]+)(k|M)? ouro/);
          if (m) { const v = parseFloat(m[1]) * (m[2] === 'k' ? 1e3 : m[2] === 'M' ? 1e6 : 1); btn.disabled = G.res.gold < v; }
        });
      }
      if (!G.stash && G.state === 'play') this.refresh();
    }
    $('respawn').classList.toggle('hidden', p.alive || G.state !== 'play');
    if (!p.alive) $('respawn').textContent = G.stash ? `Renascendo em ${Math.ceil(p.respawn)}…` : '';
  },

  showJoy(ox, oy, dx, dy) {
    const j = $('joy');
    j.classList.remove('hidden');
    j.style.left = ox - 60 + 'px'; j.style.top = oy - 60 + 'px';
    $('joyknob').style.transform = `translate(${dx}px, ${dy}px)`;
  },
  hideJoy() { $('joy').classList.add('hidden'); },

  showGameOver() {
    $('go-wave').textContent = G.wave;
    $('go-day').textContent = G.day;
    $('go-score').textContent = fmt(G.score);
    $('go-kills').textContent = fmt(G.kills);
    try {
      const best = Math.max(+localStorage.getItem('hordas-best') || 0, G.score);
      localStorage.setItem('hordas-best', best);
      $('go-best').textContent = fmt(best);
    } catch (e) { $('go-best').textContent = fmt(G.score); }
    $('gameover').classList.remove('hidden');
    $('hud').classList.add('hidden');
    G.build = null; G.selected = null;
  },
};

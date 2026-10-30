// Telas: menu principal, mapa de mundos, garagem, pausa, resultados e
// configurações. Tudo em DOM por cima do canvas.
import { CARS, PAINTS, RIMS, NEONS, WORLDS, LEVELS_PER_WORLD, MAX_UPGRADE, carStats, statBars, upgradeCost, QUALITY } from './config.js';
import { rimTexture } from './textures.js';
import { formatTime } from './util.js';

const $ = (id) => document.getElementById(id);
const coinIcon = '<i class="coin"></i>';
const EMBLEMS = ['🏝️', '🏜️', '🌃', '🏔️', '🌋', '🪐'];

export class UI {
  constructor(game) {
    this.game = game;
    this.screens = ['menu', 'worlds', 'garage', 'results', 'loading'];
    this.tab = 'carros';
    this.preview = null; // item selecionado na garagem
    this.thumbs = {};
    this.bind();
  }

  get save() {
    return this.game.save;
  }

  click() {
    this.game.audio.unlock();
    this.game.audio.play('click');
  }

  show(name) {
    for (const s of this.screens) $(s).classList.toggle('hidden', s !== name);
    this.current = name;
    this.updateCoins();
  }

  hideAll() {
    for (const s of this.screens) $(s).classList.add('hidden');
    this.current = null;
  }

  updateCoins() {
    for (const el of document.querySelectorAll('.coins-val')) el.textContent = this.save.data.coins.toLocaleString('pt-BR');
  }

  bind() {
    const g = this.game;
    $('btn-play').onclick = () => {
      this.click();
      g.startLevel(this.save.data.next);
    };
    $('btn-worlds').onclick = () => {
      this.click();
      this.openWorlds();
    };
    $('btn-garage').onclick = () => {
      this.click();
      this.openGarage();
    };
    $('btn-settings').onclick = () => {
      this.click();
      this.openSettings();
    };
    for (const b of document.querySelectorAll('[data-back]')) {
      b.onclick = () => {
        this.click();
        g.toMenu();
      };
    }
    // garagem
    for (const t of document.querySelectorAll('#g-tabs button')) {
      t.onclick = () => {
        this.click();
        this.tab = t.dataset.tab;
        this.preview = null;
        this.renderGarage();
      };
    }
    $('g-upgrade').onclick = () => this.upgrade();
    $('g-action').onclick = () => this.garageAction();
    // pausa
    $('h-pause').onclick = (e) => {
      e.stopPropagation();
      g.pause(true);
    };
    $('p-continue').onclick = () => {
      this.click();
      g.pause(false);
    };
    $('p-restart').onclick = () => {
      this.click();
      g.pause(false, true);
      g.startLevel(g.race.info.idx);
    };
    $('p-quit').onclick = () => {
      this.click();
      g.pause(false, true);
      g.toMenu();
    };
    // resultados
    $('r-next').onclick = () => {
      this.click();
      g.startLevel(this.save.data.next);
    };
    $('r-retry').onclick = () => {
      this.click();
      g.startLevel(this.lastResult.level.idx);
    };
    $('r-garage').onclick = () => {
      this.click();
      this.openGarage();
    };
    // configurações
    $('s-close').onclick = () => {
      this.click();
      $('settings').classList.add('hidden');
    };
    $('s-reset').onclick = (e) => {
      // confirmação na própria tela (alguns navegadores bloqueiam confirm()):
      // o segundo toque em até 3 s apaga
      const b = e.currentTarget;
      if (!b.dataset.armed) {
        b.dataset.armed = '1';
        b.textContent = 'Toque de novo para apagar tudo';
        setTimeout(() => {
          delete b.dataset.armed;
          b.textContent = 'Apagar progresso';
        }, 3000);
        return;
      }
      try {
        localStorage.clear();
      } catch (e) {
        // sem armazenamento
      }
      location.reload();
    };
  }

  // ------------------------------------------------------------- menu
  openMenu() {
    this.show('menu');
    const d = this.save.data;
    const idx = d.next;
    const w = WORLDS[Math.floor(idx / LEVELS_PER_WORLD)];
    $('m-next').innerHTML = `Nível ${idx + 1} · ${w.name}`;
  }

  // ------------------------------------------------------------ mundos
  openWorlds() {
    this.show('worlds');
    const d = this.save.data;
    const box = $('w-list');
    box.innerHTML = '';
    WORLDS.forEach((w, wi) => {
      const card = document.createElement('div');
      card.className = `world-card w-${w.id}`;
      const first = wi * LEVELS_PER_WORLD;
      const locked = first >= d.unlocked;
      const done = Array.from({ length: LEVELS_PER_WORLD }, (_, l) => d.best[first + l]).filter((b) => b && b <= 3).length;
      card.innerHTML = `<div class="w-head"><b>${w.name}</b><small>${w.sub}</small></div><div class="w-emblem">${EMBLEMS[wi]}</div><div class="w-done">${done}/${LEVELS_PER_WORLD} no pódio</div><div class="w-levels"></div>${locked ? '<div class="w-lock">🔒 Termine o mundo anterior</div>' : ''}`;
      const lv = card.querySelector('.w-levels');
      for (let l = 0; l < LEVELS_PER_WORLD; l++) {
        const idx = first + l;
        const b = document.createElement('button');
        const best = d.best[idx];
        const open = idx < d.unlocked;
        b.className = `lvl ${open ? '' : 'locked'} ${best === 1 ? 'gold' : best === 2 ? 'silver' : best === 3 ? 'bronze' : ''}`;
        b.innerHTML = `<span>${idx + 1}</span>${best ? `<small>${best}º</small>` : open ? '<small>novo</small>' : '<small>🔒</small>'}`;
        if (open)
          b.onclick = () => {
            this.click();
            this.game.startLevel(idx);
          };
        lv.appendChild(b);
      }
      box.appendChild(card);
    });
    const cur = box.children[Math.floor(Math.min(d.next, d.unlocked - 1) / LEVELS_PER_WORLD)];
    if (cur) cur.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  // ----------------------------------------------------------- garagem
  openGarage() {
    this.show('garage');
    this.preview = null;
    this.renderGarage();
  }

  carThumb(id) {
    if (!this.thumbs[id]) {
      const c = CARS.find((x) => x.id === id);
      const s = this.save.data.cars[id];
      this.thumbs[id] = this.game.garage.thumbnail(id, { paint: s.owned ? s.paint : c.paint, rim: s.rim, neon: 'nenhum' });
    }
    return this.thumbs[id];
  }

  // Carro que aparece na plataforma (pode ser uma prévia não comprada).
  shownCar() {
    const d = this.save.data;
    if (this.tab === 'carros' && this.preview) return this.preview;
    return d.car;
  }

  shownLook(carId) {
    const d = this.save.data;
    const s = d.cars[carId];
    const c = CARS.find((x) => x.id === carId);
    const look = { paint: s.owned ? s.paint : c.paint, rim: s.rim, neon: s.neon };
    if (this.preview && this.tab === 'pintura') look.paint = this.preview;
    if (this.preview && this.tab === 'rodas') look.rim = this.preview;
    if (this.preview && this.tab === 'neon') look.neon = this.preview;
    return look;
  }

  renderGarage() {
    const d = this.save.data;
    for (const t of document.querySelectorAll('#g-tabs button')) t.classList.toggle('on', t.dataset.tab === this.tab);
    const carId = this.shownCar();
    const car = CARS.find((c) => c.id === carId);
    const cs = d.cars[carId];
    this.game.garage.setCar(carId, this.shownLook(carId));
    // painel de atributos
    $('g-name').textContent = car.name;
    $('g-kind').textContent = car.kind;
    const lvl = cs.upgrade;
    $('g-stars').innerHTML = Array.from({ length: MAX_UPGRADE }, (_, i) => `<i class="${i < lvl ? 'on' : ''}"></i>`).join('');
    const st = statBars(carStats(car, lvl));
    const nx = lvl < MAX_UPGRADE ? statBars(carStats(car, lvl + 1)) : st;
    const raw = carStats(car, lvl);
    const rows = [
      ['Velocidade', 'vmax', `${Math.round(raw.vmax * 3.6)} km/h`],
      ['Aceleração', 'accel', ''],
      ['Controle', 'handling', ''],
      ['Nitro', 'nitro', ''],
    ];
    $('g-stats').innerHTML = rows
      .map(([label, k, extra]) => `<div class="stat"><span>${label}</span><div class="bar"><b style="width:${Math.max(4, st[k])}%"></b><em style="width:${Math.max(4, nx[k])}%"></em></div><small>${extra || st[k]}</small></div>`)
      .join('');
    const up = $('g-upgrade');
    if (!cs.owned) {
      up.classList.add('hidden');
    } else {
      up.classList.remove('hidden');
      if (lvl >= MAX_UPGRADE) {
        up.innerHTML = 'MÁXIMO';
        up.disabled = true;
      } else {
        const cost = upgradeCost(car, lvl);
        up.innerHTML = `<span>⇧ MELHORAR</span><small>${coinIcon}${cost.toLocaleString('pt-BR')}</small>`;
        up.disabled = false;
        up.classList.toggle('poor', d.coins < cost);
      }
    }
    // itens da aba
    const grid = $('g-items');
    grid.innerHTML = '';
    const add = (id, html, state, price, onPick) => {
      const b = document.createElement('button');
      b.className = `item ${state}`;
      b.innerHTML = html + (state === 'locked' ? `<div class="price">${coinIcon}${price.toLocaleString('pt-BR')}</div>` : state === 'equipped' ? '<div class="check">✔</div>' : '');
      b.onclick = () => {
        this.click();
        onPick();
      };
      grid.appendChild(b);
      return b;
    };
    let selected = null;
    if (this.tab === 'carros') {
      for (const c of CARS) {
        const owned = d.cars[c.id].owned;
        const state = d.car === c.id ? 'equipped' : owned ? 'owned' : 'locked';
        const b = add(c.id, `<img src="${this.carThumb(c.id)}" alt=""><div class="label">${c.name}</div>`, state, c.price, () => {
          this.preview = c.id;
          this.renderGarage();
        });
        if ((this.preview || d.car) === c.id) {
          b.classList.add('sel');
          selected = { kind: 'car', id: c.id, owned, price: c.price, equipped: d.car === c.id };
        }
      }
    } else if (this.tab === 'pintura') {
      for (const p of PAINTS) {
        const owned = d.paints.includes(p.id);
        const state = cs.paint === p.id && cs.owned ? 'equipped' : owned ? 'owned' : 'locked';
        const hex = '#' + p.color.toString(16).padStart(6, '0');
        const b = add(p.id, `<div class="swatch" style="--c:${hex}"></div><div class="label">${p.name}</div>`, state, p.price, () => {
          this.preview = p.id;
          this.renderGarage();
        });
        if ((this.preview || cs.paint) === p.id) {
          b.classList.add('sel');
          selected = { kind: 'paint', id: p.id, owned, price: p.price, equipped: cs.paint === p.id };
        }
      }
    } else if (this.tab === 'rodas') {
      for (const r of RIMS) {
        const owned = d.rims.includes(r.id);
        const state = cs.rim === r.id ? 'equipped' : owned ? 'owned' : 'locked';
        const url = rimTexture(r.style, r.color).image.toDataURL();
        const b = add(r.id, `<img class="rim" src="${url}" alt=""><div class="label">${r.name}</div>`, state, r.price, () => {
          this.preview = r.id;
          this.renderGarage();
        });
        if ((this.preview || cs.rim) === r.id) {
          b.classList.add('sel');
          selected = { kind: 'rim', id: r.id, owned, price: r.price, equipped: cs.rim === r.id };
        }
      }
    } else {
      for (const n of NEONS) {
        const owned = d.neons.includes(n.id);
        const state = cs.neon === n.id ? 'equipped' : owned ? 'owned' : 'locked';
        const col = n.color === 'rainbow' ? 'conic-gradient(red, orange, yellow, lime, cyan, blue, magenta, red)' : n.color ? '#' + n.color.toString(16).padStart(6, '0') : 'transparent';
        const b = add(n.id, `<div class="neon" style="--c:${col}">${n.color ? '' : '∅'}</div><div class="label">${n.name}</div>`, state, n.price, () => {
          this.preview = n.id;
          this.renderGarage();
        });
        if ((this.preview || cs.neon) === n.id) {
          b.classList.add('sel');
          selected = { kind: 'neon', id: n.id, owned, price: n.price, equipped: cs.neon === n.id };
        }
      }
    }
    // botão de ação
    this.selected = selected;
    const act = $('g-action');
    act.classList.remove('buy', 'use', 'done', 'poor');
    if (!selected) {
      act.classList.add('hidden');
    } else {
      act.classList.remove('hidden');
      const carOwned = cs.owned;
      if (selected.kind !== 'car' && !carOwned) {
        act.innerHTML = 'Compre o carro primeiro';
        act.classList.add('done');
      } else if (!selected.owned) {
        act.innerHTML = `COMPRAR <small>${coinIcon}${selected.price.toLocaleString('pt-BR')}</small>`;
        act.classList.add('buy');
        if (d.coins < selected.price) act.classList.add('poor');
      } else if (selected.equipped) {
        act.innerHTML = 'EM USO';
        act.classList.add('done');
      } else {
        act.innerHTML = 'USAR';
        act.classList.add('use');
      }
    }
    this.updateCoins();
  }

  garageAction() {
    const sel = this.selected;
    if (!sel) return;
    const sv = this.save;
    const d = sv.data;
    const carId = this.shownCar();
    const cs = d.cars[carId];
    if (sel.kind !== 'car' && !cs.owned) return;
    if (!sel.owned) {
      if (!sv.spend(sel.price)) {
        this.game.audio.play('error');
        this.flashCoins();
        return;
      }
      this.game.audio.play('buy');
      if (sel.kind === 'car') d.cars[sel.id].owned = true;
      if (sel.kind === 'paint') d.paints.push(sel.id);
      if (sel.kind === 'rim') d.rims.push(sel.id);
      if (sel.kind === 'neon') d.neons.push(sel.id);
    } else this.click();
    if (sel.kind === 'car') d.car = sel.id;
    if (sel.kind === 'paint') cs.paint = sel.id;
    if (sel.kind === 'rim') cs.rim = sel.id;
    if (sel.kind === 'neon') cs.neon = sel.id;
    if (sel.kind !== 'neon') delete this.thumbs[carId];
    sv.write();
    this.preview = null;
    this.renderGarage();
  }

  upgrade() {
    const sv = this.save;
    const d = sv.data;
    const carId = this.shownCar();
    const cs = d.cars[carId];
    const car = CARS.find((c) => c.id === carId);
    if (!cs.owned || cs.upgrade >= MAX_UPGRADE) return;
    const cost = upgradeCost(car, cs.upgrade);
    if (!sv.spend(cost)) {
      this.game.audio.play('error');
      this.flashCoins();
      return;
    }
    cs.upgrade++;
    sv.write();
    this.game.audio.play('buy');
    this.renderGarage();
    const st = document.getElementById('g-stars');
    st.classList.remove('pop');
    void st.offsetWidth;
    st.classList.add('pop');
  }

  flashCoins() {
    for (const el of document.querySelectorAll('.coins')) {
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
    }
  }

  // ---------------------------------------------------------- resultados
  showResults(r) {
    this.lastResult = r;
    this.show('results');
    const medal = ['🥇', '🥈', '🥉'][r.pos - 1] || '🏁';
    $('r-title').innerHTML = `<span class="medal">${medal}</span>${r.pos === 1 ? 'VITÓRIA!' : `${r.pos}º LUGAR`}`;
    $('r-title').className = r.pos <= 3 ? 'good' : 'bad';
    $('r-level').textContent = `Nível ${r.level.idx + 1} · ${WORLDS[r.level.world].name}`;
    $('r-list').innerHTML = r.list.map((c) => `<li class="${c.me ? 'me' : ''}"><b>${c.pos}º</b><span>${c.name}<small>${c.car}</small></span><em>${c.time ? formatTime(c.time) : '—'}</em></li>`).join('');
    $('r-reward').innerHTML = `<div><span>Colocação</span><b>${coinIcon}${r.reward}</b></div><div><span>Moedas na pista (${r.coins})</span><b>${coinIcon}${r.coins * 5}</b></div><div class="total"><span>Total</span><b>${coinIcon}${r.reward + r.coins * 5}</b></div>`;
    $('r-msg').textContent = r.pos <= 3 ? (r.unlockedNew ? 'Próximo nível liberado!' : '') : 'Chegue entre os 3 primeiros para liberar o próximo nível. Melhore seu carro na garagem!';
    $('r-next').classList.toggle('hidden', !(r.pos <= 3 || r.level.idx + 1 < this.save.data.unlocked));
  }

  // ------------------------------------------------------- configurações
  openSettings() {
    const s = this.save.data.settings;
    const box = $('s-body');
    box.innerHTML = '';
    const row = (label, html) => {
      const d = document.createElement('div');
      d.className = 'srow';
      d.innerHTML = `<span>${label}</span>${html}`;
      box.appendChild(d);
      return d;
    };
    const q = row('Qualidade', `<div class="seg">${Object.entries(QUALITY)
      .map(([k, v]) => `<button data-q="${k}" class="${s.quality === k ? 'on' : ''}">${v.label}</button>`)
      .join('')}</div>`);
    for (const b of q.querySelectorAll('button'))
      b.onclick = () => {
        this.click();
        s.quality = b.dataset.q;
        this.save.write();
        this.game.applyQuality();
        this.openSettings();
      };
    const slider = (label, key, min, max, step) => {
      const r = row(label, `<input type="range" min="${min}" max="${max}" step="${step}" value="${s[key]}">`);
      r.querySelector('input').oninput = (e) => {
        s[key] = Number(e.target.value);
        this.save.write();
        this.game.audio.setVolumes(s.sound, s.music);
      };
    };
    slider('Efeitos', 'sound', 0, 1, 0.05);
    slider('Música', 'music', 0, 1, 0.05);
    slider('Sensibilidade', 'sensitivity', 0.5, 2, 0.1);
    const v = row('Vibração', `<div class="seg"><button class="${s.vibrate ? 'on' : ''}">Sim</button><button class="${s.vibrate ? '' : 'on'}">Não</button></div>`);
    const [yes, no] = v.querySelectorAll('button');
    yes.onclick = () => {
      s.vibrate = true;
      this.save.write();
      this.openSettings();
    };
    no.onclick = () => {
      s.vibrate = false;
      this.save.write();
      this.openSettings();
    };
    $('settings').classList.remove('hidden');
  }
}

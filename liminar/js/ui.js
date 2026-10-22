// Interface: HUD, bilhetes, cartões de nível, sobreposição de câmera e menus.
import { FILTERS, LEVELS, ORDER, orderPos, QUALITY, START } from './config.js';

const $ = (id) => document.getElementById(id);

const QUALITY_DESC = {
  low: 'Resolução reduzida, sem sombras, sem mapas normais e lightmaps leves. Ideal para celulares simples.',
  medium: 'Mapas normais, reflexos, antisserrilhado MSAA e sombras do sol nos níveis abertos.',
  high: 'Texturas 1024, lightmaps detalhados com penumbra, sombras da lanterna e mais trigo.',
  ultra: 'Supersampling, lightmaps máximos, sombras 4K, distância de visão longa e bloom completo.',
};

export class HUD {
  constructor(game) {
    this.game = game;
    this.el = $('hud');
    this.msgT = 0;
    this.objT = 0;
    this.fpsEl = $('fps');
    this.camUI = $('cam-ui');
    this.noteOpen = false;
    $('note-close').addEventListener('click', () => this.closeNote());
    $('note').addEventListener('touchstart', (e) => {
      e.preventDefault();
      this.closeNote();
    });
    $('note').addEventListener('mousedown', () => this.closeNote());
    this.lastPrompt = '';
    // mochila
    this.invOpen = false;
    this.invSel = null;
    const stop = (fn) => (e) => {
      e.preventDefault();
      e.stopPropagation();
      fn();
    };
    $('inv-close').addEventListener('click', stop(() => this.closeInventory()));
    $('inv-close').addEventListener('touchend', stop(() => this.closeInventory()), { passive: false });
    $('inv-use').addEventListener('click', stop(() => this.invUse()));
    $('inv-use').addEventListener('touchend', stop(() => this.invUse()), { passive: false });
    $('inv').addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
  }

  // ------------------------------------------------------------ mochila
  openInventory() {
    if (this.invOpen) return;
    this.invOpen = true;
    const inv = this.game.inventory;
    if (!this.invSel || !inv.has(this.invSel)) this.invSel = inv.items.length ? inv.items[0].id : null;
    this.invRefresh();
    $('inv').classList.remove('hidden');
    this.game.input.reset();
    this.game.input.unlock();
    this.game.audio.click();
  }

  closeInventory() {
    if (!this.invOpen) return;
    this.invOpen = false;
    $('inv').classList.add('hidden');
    this.game.input.reset();
    if (!this.game.settings.mobile) this.game.input.lock();
  }

  invRefresh() {
    const inv = this.game.inventory;
    if (!inv) return;
    const btn = $('btn-inv');
    if (btn) btn.classList.toggle('has', inv.items.length > 0);
    if (!this.invOpen) return;
    const grid = $('inv-grid');
    grid.innerHTML = '';
    for (let i = 0; i < inv.max; i++) {
      const it = inv.items[i];
      const d = document.createElement('div');
      d.className = 'inv-slot' + (it ? '' : ' empty') + (it && it.id === this.invSel ? ' sel' : '');
      if (it) {
        d.style.backgroundImage = `url(${inv.icon(it.id)})`;
        if (it.n > 1) d.innerHTML = `<span class="n">×${it.n}</span>`;
        const pick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.invSel = it.id;
          this.game.audio.click();
          this.invRefresh();
        };
        d.addEventListener('click', pick);
        d.addEventListener('touchend', pick, { passive: false });
      }
      grid.appendChild(d);
    }
    const sel = inv.items.find((q) => q.id === this.invSel);
    const def = sel && inv.def(sel.id);
    $('inv-name').textContent = def ? def.name + (sel.n > 1 ? ` (×${sel.n})` : '') : inv.items.length ? '' : 'A mochila está vazia.';
    $('inv-desc').textContent = def ? def.desc : inv.items.length ? 'Escolha um item.' : 'Itens que você pegar ficam guardados aqui.';
    const use = $('inv-use');
    use.classList.toggle('hidden', !(def && def.use));
    if (def && def.use) use.textContent = def.action || 'Usar';
  }

  invUse() {
    if (!this.invSel) return;
    const inv = this.game.inventory;
    const def = inv.def(this.invSel);
    if (!def || !def.use) return;
    // ler fecha a mochila para mostrar o papel
    if (def.action === 'Ler') this.closeInventory();
    inv.use(this.invSel);
    if (!inv.has(this.invSel)) this.invSel = inv.items.length ? inv.items[0].id : null;
    this.invRefresh();
  }

  // Teclas dentro da mochila: I/Tab/Esc fecham, E usa o item escolhido, 1–4 escolhem.
  invKeys(input) {
    if (input.pressed('inventory') || input.pressed('menu')) return this.closeInventory();
    const inv = this.game.inventory;
    for (let i = 0; i < 4; i++)
      if (input.pressed('opt' + (i + 1)) && inv.items[i]) {
        this.invSel = inv.items[i].id;
        this.invRefresh();
      }
    if (input.pressed('interact')) this.invUse();
  }

  // Carta com a fotografia em branco.
  showLetter(text) {
    const el = $('note-text');
    el.textContent = '“' + text + '”';
    const ph = document.createElement('div');
    ph.className = 'letter-photo';
    el.prepend(ph);
    $('note').classList.remove('hidden');
    this.noteOpen = true;
    this.game.input.reset();
  }

  show(on) {
    this.el.classList.toggle('hidden', !on);
    $('touch').classList.toggle('play', on);
    if (!on) this.camUI.classList.add('hidden');
  }

  // Lista de objetivos (checklist) e barra de bateria da lanterna.
  setObjectives(list, battery) {
    const el = $('objlist');
    el.innerHTML = '';
    for (const o of list || []) {
      const d = document.createElement('div');
      d.className = 'obj' + (o.done ? ' done' : '');
      d.textContent = (o.done ? '☑ ' : '☐ ') + o.text;
      el.appendChild(d);
    }
    el.classList.toggle('hidden', !list || !list.length);
    $('bat-row').classList.toggle('hidden', !battery);
  }

  setLevel(info) {
    this.stopSay();
    $('lvl-tag').textContent = info.tag.toUpperCase();
    $('lvl-name').textContent = info.name;
  }

  objective(text, dur = 9) {
    const o = $('objective');
    o.textContent = text;
    o.classList.add('on');
    this.objT = dur;
  }

  message(text, dur = 4) {
    const m = $('msg');
    m.textContent = text;
    m.classList.add('on');
    this.msgT = dur;
  }

  // Fala do próprio andarilho: legenda com nome, letra por letra.
  // lines: textos ('' = pausa); done: chamado no fim.
  say(lines, done, who = 'VOCÊ') {
    let el = $('dlg');
    if (!el) {
      el = document.createElement('div');
      el.id = 'dlg';
      el.innerHTML = '<div class="who">VOCÊ</div><div class="txt"></div>';
      this.el.appendChild(el);
    }
    el.querySelector('.who').textContent = who;
    this.dlg = { lines, i: -1, done };
    this.nextLine();
  }

  nextLine() {
    const d = this.dlg;
    const el = $('dlg');
    d.i++;
    if (d.i >= d.lines.length) {
      el.classList.remove('on');
      this.dlg = null;
      if (d.done) d.done();
      return;
    }
    const line = d.lines[d.i];
    d.text = line;
    d.t = 0;
    d.shown = -1;
    d.dur = line ? 2.2 + line.length * 0.058 : 1.4;
    el.querySelector('.txt').textContent = '';
    el.classList.toggle('on', !!line);
    if (line) this.game.audio.play('breath', { gain: 0.06, rate: 1.1, wet: 0.1 });
  }

  stopSay() {
    const el = $('dlg');
    if (el) el.classList.remove('on');
    this.dlg = null;
  }

  updateSay(dt) {
    const d = this.dlg;
    if (!d) return;
    d.t += dt;
    const n = Math.min(d.text.length, Math.floor(d.t * 34));
    if (n !== d.shown) {
      d.shown = n;
      $('dlg').querySelector('.txt').textContent = d.text.slice(0, n);
    }
    if (d.t >= d.dur) this.nextLine();
  }

  prompt(label) {
    if (label === this.lastPrompt) return;
    this.lastPrompt = label;
    const p = $('prompt');
    if (!label) {
      p.classList.add('hidden');
      $('btn-use').classList.remove('ready');
      return;
    }
    p.innerHTML = this.game.settings.mobile ? `<b>USAR</b> · ${label}` : `<b>[E]</b> ${label}`;
    p.classList.remove('hidden');
    $('btn-use').classList.add('ready');
  }

  // Caixa de diálogo com personagens. choices: [{ text, fn }]
  dialog(name, text, choices = [], portrait = '') {
    const box = $('dialog');
    $('dlg-name').textContent = name;
    $('dlg-face').style.backgroundImage = portrait ? `url(${portrait})` : 'none';
    const t = $('dlg-text');
    t.textContent = '';
    clearInterval(this.typeT);
    let k = 0;
    this.typeFull = () => {
      clearInterval(this.typeT);
      t.textContent = text;
    };
    // efeito de máquina de escrever
    this.typeT = setInterval(() => {
      k += 2;
      t.textContent = text.slice(0, k);
      if (k >= text.length) clearInterval(this.typeT);
    }, 22);
    const ch = $('dlg-choices');
    ch.innerHTML = '';
    const list = choices.length ? choices : [{ text: 'Até mais.', fn: null }];
    this.dlgChoices = list;
    list.forEach((c, i) => {
      const b = document.createElement('button');
      b.className = 'btn dlg-opt';
      b.innerHTML = `<b>${i + 1}</b> ${c.text}`;
      const pick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.pickChoice(i);
      };
      b.addEventListener('click', pick);
      b.addEventListener('touchend', pick, { passive: false });
      ch.appendChild(b);
    });
    box.classList.remove('hidden');
    if (!this.dialogOpen) {
      this.dialogOpen = true;
      this.game.input.reset();
      this.game.input.unlock();
    }
  }

  pickChoice(i) {
    const c = this.dlgChoices && this.dlgChoices[i];
    if (!c || this.picking) return;
    this.picking = true;
    setTimeout(() => (this.picking = false), 150);
    this.game.audio.click();
    if (c.fn) c.fn();
    else this.closeDialog();
  }

  closeDialog() {
    clearInterval(this.typeT);
    $('dialog').classList.add('hidden');
    this.dialogOpen = false;
    this.game.input.reset();
    if (!this.game.settings.mobile) this.game.input.lock();
  }

  // Teclas 1–3 escolhem; E/Espaço completa o texto ou fecha.
  dialogKeys(input) {
    for (let i = 0; i < 6; i++) if (input.pressed('opt' + (i + 1))) return this.pickChoice(i);
    if (input.pressed('menu')) return this.closeDialog();
    if (input.pressed('interact')) this.typeFull && this.typeFull();
  }

  showNote(text) {
    $('note-text').textContent = '“' + text + '”';
    $('note').classList.remove('hidden');
    this.noteOpen = true;
    this.game.input.reset();
  }

  closeNote() {
    if (!this.noteOpen) return;
    $('note').classList.add('hidden');
    this.noteOpen = false;
  }

  scare(url) {
    const s = $('scare');
    s.style.backgroundImage = `url(${url})`;
    s.classList.remove('hidden');
    setTimeout(() => s.classList.add('hidden'), 420);
  }

  // Textos sobrepostos dos filtros de câmera.
  camOverlay(filter, t) {
    const ui = this.camUI;
    if (filter !== 'vhs' && filter !== 'digicam' && filter !== 'cctv') {
      ui.classList.add('hidden');
      return;
    }
    ui.className = filter + (this.game.settings.mobile ? ' touch' : '');
    const pad = (n, l = 2) => String(Math.floor(n)).padStart(l, '0');
    const s = t + 37;
    const hms = `${pad(s / 3600)}:${pad((s / 60) % 60)}:${pad(s % 60)}`;
    if (filter === 'vhs') {
      $('cam-tl').innerHTML = '<span class="rec blink">●</span> REC';
      $('cam-tr').textContent = 'SP';
      $('cam-bl').textContent = 'OUT. 14 1996';
      $('cam-br').textContent = `▶ ${hms}`;
    } else if (filter === 'digicam') {
      $('cam-tl').textContent = '';
      $('cam-tr').textContent = '▣ 1600×1200';
      $('cam-bl').textContent = '';
      $('cam-br').textContent = `'05 10 14   ${pad(21 + s / 3600)}:${pad((s / 60) % 60)}`;
    } else {
      const lvl = this.game.levelInfo ? this.game.levelInfo.num : 0;
      $('cam-tl').textContent = `CAM ${pad(lvl + 1)}  NÍVEL ${lvl}`;
      $('cam-tr').textContent = `14/10/1996 ${hms}`;
      $('cam-bl').textContent = '';
      $('cam-br').innerHTML = '<span class="rec blink">●</span> GRAV';
    }
  }

  update(dt, st) {
    this.updateSay(dt);
    if (this.msgT > 0) {
      this.msgT -= dt;
      if (this.msgT <= 0) $('msg').classList.remove('on');
    }
    if (this.objT > 0) {
      this.objT -= dt;
      if (this.objT <= 0) $('objective').classList.remove('on');
    }
    const sb = $('san-bar');
    sb.style.width = Math.max(0, st.sanity) + '%';
    sb.classList.toggle('low', st.sanity < 25);
    $('sta-bar').style.width = st.stamina * 100 + '%';
    $('sta-row').style.opacity = st.stamina < 0.99 ? 1 : 0;
    if (st.battery !== null && st.battery !== undefined) {
      const bb = $('bat-bar');
      bb.style.width = Math.round(st.battery * 100) + '%';
      bb.classList.toggle('low', st.battery < 0.2);
    }
    const nav = $('nav');
    if (st.nav) {
      nav.classList.add('on');
      $('nav-arrow').style.transform = `rotate(${st.nav.angle - 90}deg)`;
      $('nav-dist').textContent = st.nav.dist > 6 ? `~${Math.round(st.nav.dist / 5) * 5} m` : 'aqui';
    } else nav.classList.remove('on');
  }

  showFps(on) {
    this.fpsEl.classList.toggle('hidden', !on);
  }

  setFps(fps, scale) {
    this.fpsEl.textContent = `${fps} FPS · ${Math.round(scale * 100)}%`;
  }

  // Cartão de entrada do nível (também usado durante o carregamento).
  card(info) {
    $('card-tag').textContent = info.tag.toUpperCase();
    $('card-name').textContent = info.name;
    $('card-danger').textContent = info.danger;
    $('card-obj').textContent = info.objective;
    $('card-bar').style.width = '0%';
    $('card-load').textContent = 'Gerando o nível…';
    const c = $('card');
    c.classList.remove('hidden', 'fade');
  }

  cardProgress(f, text) {
    $('card-bar').style.width = Math.round(f * 100) + '%';
    if (text) $('card-load').textContent = text;
  }

  cardHide() {
    const c = $('card');
    c.classList.add('fade');
    setTimeout(() => c.classList.add('hidden'), 1100);
  }

  ending(title, text, stats, onClose) {
    $('end-title').textContent = title;
    $('end-text').textContent = text;
    $('end-stats').textContent = stats;
    $('ending').classList.remove('hidden');
    $('end-menu').onclick = () => {
      $('ending').classList.add('hidden');
      onClose();
    };
  }
}

// ------------------------------------------------------------ menus
export class Menu {
  constructor(settings, cb) {
    this.s = settings;
    this.cb = cb;
    this.root = $('menu');
    this.ingame = false;
    this.panels = ['m-main', 'm-levels', 'm-filters', 'm-settings', 'm-help'];
    $('b-play').onclick = () => (this.ingame ? cb.resume() : cb.play(this.s.reached ?? START));
    $('b-new').onclick = () => cb.play(START);
    $('b-levels').onclick = () => this.open('m-levels');
    $('b-filters').onclick = () => this.open('m-filters');
    $('b-settings').onclick = () => this.open('m-settings');
    $('b-help').onclick = () => this.open('m-help');
    $('b-restart').onclick = () => cb.restart();
    $('b-testsound').onclick = () => cb.testSound();
    // clique sonoro nos botões do menu
    this.root.addEventListener('click', (e) => {
      if (e.target.closest('button, .fopt, .lcard') && cb.uiClick) cb.uiClick();
    });
    $('b-quit').onclick = () => cb.quit();
    for (const b of this.root.querySelectorAll('.back')) b.onclick = () => this.open('m-main');
    this.buildLevels();
    this.buildFilters();
    this.bindSettings();
  }

  buildLevels() {
    const list = $('level-list');
    list.innerHTML = '';
    list.className = 'panel';
    // ordem de exibição: cada secreto aparece logo após o nível pai (se descoberto)
    const order = [];
    ORDER.forEach((key) => {
      const i = LEVELS.findIndex((l) => l.key === key);
      const L = LEVELS[i];
      order.push(i);
      LEVELS.forEach((S, j) => {
        const found = this.s.secrets || (this.s.secretFound ? ['0.1'] : []);
        if (S.secret && S.parent === L.key && found.includes(S.key)) order.push(j);
      });
    });
    order.forEach((i) => {
      const L = LEVELS[i];
      const b = document.createElement('button');
      b.className = 'lcard' + (L.secret ? ' secret' : '');
      const seen = L.secret ? ' · secreto' : orderPos(L) <= orderPos(LEVELS[this.s.reached || 0]) ? ' · visitado' : '';
      b.innerHTML = `<div class="ln">${L.num}</div><div class="lt">${L.name}</div><div class="ld">${L.desc}</div><div class="lk">${L.danger}${seen}</div>`;
      b.onclick = () => this.cb.play(i);
      list.appendChild(b);
    });
  }

  buildFilters() {
    const list = $('filter-list');
    list.innerHTML = '';
    for (const f of FILTERS) {
      const d = document.createElement('div');
      d.className = 'fopt' + (f.id === this.s.filter ? ' sel' : '');
      d.innerHTML = `<div><b>${f.label}</b><span>${f.desc}</span></div>`;
      d.onclick = () => {
        this.s.filter = f.id;
        this.cb.changed('filter');
        this.buildFilters();
      };
      list.appendChild(d);
    }
  }

  bindSettings() {
    const s = this.s;
    const bind = (id, key, kind = 'value', conv = Number) => {
      const el = $(id);
      if (kind === 'checked') el.checked = !!s[key];
      else el.value = s[key];
      el.addEventListener(kind === 'checked' ? 'change' : 'input', () => {
        s[key] = kind === 'checked' ? el.checked : conv(el.value);
        this.cb.changed(key);
      });
    };
    bind('s-fstr', 'filterStrength');
    bind('s-grain', 'grain');
    bind('s-vig', 'vignette');
    bind('s-fov', 'fov');
    bind('s-sens', 'sensitivity');
    bind('s-vol', 'volume');
    bind('s-bob', 'headBob', 'checked');
    bind('s-nav', 'navHelp', 'checked');
    bind('s-inv', 'invertY', 'checked');
    bind('s-fps', 'showFps', 'checked');
    bind('s-dyn', 'dynamicRes', 'checked');
    const q = $('s-quality');
    q.value = s.quality;
    $('q-desc').textContent = QUALITY_DESC[s.quality];
    q.addEventListener('change', () => {
      s.quality = q.value;
      $('q-desc').textContent = QUALITY_DESC[s.quality] + ' (o nível será recarregado)';
      this.cb.changed('quality');
    });
  }

  open(id) {
    for (const p of this.panels) $(p).classList.toggle('hidden', p !== id);
    this.root.querySelector('.menu-box').classList.toggle('sub', id !== 'm-main');
    if (id === 'm-filters') this.buildFilters();
    if (id === 'm-levels') this.buildLevels();
  }

  progress(f, text) {
    $('load-bar').style.width = Math.round(f * 100) + '%';
    $('load-text').textContent = text;
  }

  ready() {
    $('loading').classList.add('hidden');
    this.setMode(false);
  }

  setMode(ingame) {
    this.ingame = ingame;
    const r = this.s.reached ?? START;
    const play = $('b-play');
    play.disabled = false;
    if (ingame) {
      $('menu-title').textContent = 'PAUSADO';
      $('menu-sub').textContent = 'os bastidores esperam';
      play.textContent = 'Continuar';
    } else {
      $('menu-title').textContent = 'LIMINAR';
      $('menu-sub').textContent = 'espaços liminares · 10 níveis';
      play.textContent = r !== START ? `Continuar — ${LEVELS[r].tag}` : 'Começar';
    }
    $('b-new').classList.toggle('hidden', ingame || r === START);
    $('b-restart').classList.toggle('hidden', !ingame);
    $('b-quit').classList.toggle('hidden', !ingame);
    this.root.classList.toggle('ingame', ingame);
    this.open('m-main');
  }

  show() {
    this.root.classList.remove('hidden');
  }

  hide() {
    this.root.classList.add('hidden');
  }

  get visible() {
    return !this.root.classList.contains('hidden');
  }
}

export { QUALITY };

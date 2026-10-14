// Interface: HUD, bilhetes, cartões de nível, sobreposição de câmera e menus.
import { FILTERS, LEVELS, QUALITY } from './config.js';

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
  }

  show(on) {
    this.el.classList.toggle('hidden', !on);
    $('touch').classList.toggle('play', on);
    if (!on) this.camUI.classList.add('hidden');
  }

  setLevel(info) {
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

  ending(text, stats, onClose) {
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
    $('b-play').onclick = () => (this.ingame ? cb.resume() : cb.play(this.s.reached || 0));
    $('b-new').onclick = () => cb.play(0);
    $('b-levels').onclick = () => this.open('m-levels');
    $('b-filters').onclick = () => this.open('m-filters');
    $('b-settings').onclick = () => this.open('m-settings');
    $('b-help').onclick = () => this.open('m-help');
    $('b-restart').onclick = () => cb.restart();
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
    LEVELS.forEach((L, i) => {
      const b = document.createElement('button');
      b.className = 'lcard';
      const seen = i <= (this.s.reached || 0) ? ' · visitado' : '';
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
    const r = this.s.reached || 0;
    const play = $('b-play');
    play.disabled = false;
    if (ingame) {
      $('menu-title').textContent = 'PAUSADO';
      $('menu-sub').textContent = 'os bastidores esperam';
      play.textContent = 'Continuar';
    } else {
      $('menu-title').textContent = 'LIMINAR';
      $('menu-sub').textContent = 'espaços liminares · 5 níveis';
      play.textContent = r > 0 ? `Continuar — ${LEVELS[r].tag}` : 'Entrar nos Bastidores';
    }
    $('b-new').classList.toggle('hidden', ingame || r === 0);
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

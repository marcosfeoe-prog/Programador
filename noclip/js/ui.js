// Telas (menu, níveis, configurações, carregamento, pausa, morte, bilhete,
// teclado numérico, final) e HUD.
import { settings, save, QUALITY_KEYS, progress } from './config.js';
import { t } from './i18n.js';

const $ = (id) => document.getElementById(id);

export const LEVEL_INFO = [
  { tag: 'l0_tag', name: 'l0_name', desc: 'l0_desc' },
  { tag: 'l1_tag', name: 'l1_name', desc: 'l1_desc' },
  { tag: 'lf_tag', name: 'lf_name', desc: 'lf_desc' },
];

export class UI {
  constructor(game) {
    this.game = game;
    this.current = null;
    this.stack = [];
    this.toastT = 0;
    this.applyLang();
    document.querySelectorAll('.back').forEach((b) => (b.onclick = () => this.back()));
    $('m-play').onclick = () => game.menuPlay();
    $('m-levels').onclick = () => this.open('s-levels');
    $('m-settings').onclick = () => this.open('s-settings');
    $('m-controls').onclick = () => this.open('s-controls');
    $('m-credits').onclick = () => this.open('s-credits');
    $('p-resume').onclick = () => game.resume();
    $('p-settings').onclick = () => this.open('s-settings');
    $('p-restart').onclick = () => game.restartLevel();
    $('p-quit').onclick = () => game.quitToMenu();
    $('d-respawn').onclick = () => game.respawn();
    $('n-close').onclick = () => game.closeOverlay();
    $('e-menu').onclick = () => game.quitToMenu();
    $('s-click').onclick = () => game.resume();
    this.buildKeypad();
    addEventListener('keydown', (e) => {
      if (this.current === 's-keypad') {
        if (/^[0-9]$/.test(e.key)) this.kpPress(e.key);
        else if (e.key === 'Enter') this.kpPress('OK');
        else if (e.key === 'Backspace') {
          this.kpVal = this.kpVal.slice(0, -1);
          this.kpRender();
        } else if (e.key === 'Escape') game.closeOverlay();
      } else if (this.current === 's-note' && (e.key === 'Escape' || e.code === 'KeyE' || e.key === 'Enter')) game.closeOverlay();
    });
  }

  applyLang() {
    document.documentElement.lang = settings.lang === 'pt' ? 'pt-BR' : 'en';
    document.querySelectorAll('[data-t]').forEach((el) => (el.textContent = t(el.dataset.t)));
    $('b-use').textContent = settings.lang === 'pt' ? 'USAR' : 'USE';
    $('b-flash').textContent = settings.lang === 'pt' ? 'LUZ' : 'LIGHT';
    $('click-text').textContent = t(this.game.input && this.game.input.touch ? 'tap_to_play' : 'click_to_play');
    this.buildLevels();
    this.buildSettings();
  }

  // --------------------------------------------------------------- telas --
  show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('hidden', s.id !== id));
    this.current = id;
  }
  hideAll() {
    document.querySelectorAll('.screen').forEach((s) => s.classList.add('hidden'));
    this.current = null;
    this.stack = [];
  }
  open(id) {
    if (this.current) this.stack.push(this.current);
    if (id === 's-levels') this.buildLevels();
    if (id === 's-settings') this.buildSettings();
    this.show(id);
  }
  back() {
    const prev = this.stack.pop() || 's-menu';
    this.show(prev);
  }

  buildLevels() {
    const list = $('level-list');
    list.innerHTML = '';
    LEVEL_INFO.forEach((L, i) => {
      const locked = i > progress.unlocked;
      const d = document.createElement('div');
      d.className = 'lvl-card' + (locked ? ' locked' : '');
      d.innerHTML = `<div class="t">${t(L.tag)}</div><div class="n">${locked ? '???' : t(L.name)}</div><div class="d">${locked ? t('locked_lvl') : t(L.desc)}</div>`;
      if (!locked) d.onclick = () => this.game.startLevel(i);
      list.appendChild(d);
    });
  }

  buildSettings() {
    const el = $('settings-list');
    el.innerHTML = '';
    const row = (label, get, prev, next) => {
      const l = document.createElement('div');
      l.textContent = t(label);
      const v = document.createElement('div');
      v.className = 'val';
      const a = document.createElement('button');
      a.textContent = '‹';
      const s = document.createElement('span');
      const b = document.createElement('button');
      b.textContent = '›';
      const upd = () => (s.textContent = get());
      a.onclick = () => {
        prev();
        upd();
        this.game.applySettings();
      };
      b.onclick = () => {
        next();
        upd();
        this.game.applySettings();
      };
      upd();
      v.append(a, s, b);
      el.append(l, v);
    };
    const cyc = (arr, key, d) => {
      const i = arr.indexOf(settings[key]);
      settings[key] = arr[(i + d + arr.length) % arr.length];
      save();
    };
    row('s_quality', () => t('q_' + settings.quality), () => cyc(QUALITY_KEYS, 'quality', -1), () => cyc(QUALITY_KEYS, 'quality', 1));
    row('s_lang', () => (settings.lang === 'pt' ? 'Português' : 'English'), () => this.toggleLang(), () => this.toggleLang());
    const num = (key, step, lo, hi, fmt) => [
      () => fmt(settings[key]),
      () => {
        settings[key] = Math.max(lo, +(settings[key] - step).toFixed(2));
        save();
      },
      () => {
        settings[key] = Math.min(hi, +(settings[key] + step).toFixed(2));
        save();
      },
    ];
    row('s_sens', ...num('sens', 0.1, 0.2, 3, (v) => v.toFixed(1)));
    row('s_fov', ...num('fov', 5, 55, 110, (v) => v + '°'));
    row('s_volume', ...num('volume', 0.1, 0, 1, (v) => Math.round(v * 100) + '%'));
    const tog = (key) => [
      () => t(settings[key] ? 'on' : 'off'),
      () => {
        settings[key] = !settings[key];
        save();
      },
      () => {
        settings[key] = !settings[key];
        save();
      },
    ];
    row('s_invert', ...tog('invertY'));
    row('s_bob', ...tog('bob'));
    row('s_dynres', ...tog('dynres'));
    row('s_fps', ...tog('fps'));
  }

  toggleLang() {
    settings.lang = settings.lang === 'pt' ? 'en' : 'pt';
    save();
    this.applyLang();
    this.game.onLang && this.game.onLang();
  }

  loading(i, p, step) {
    const L = LEVEL_INFO[i];
    $('ld-tag').textContent = t(L.tag);
    $('ld-name').textContent = t(L.name);
    $('ld-desc').textContent = t(L.desc);
    $('ld-bar').style.width = Math.round(p * 100) + '%';
    $('ld-step').textContent = step || '';
    if (!this._tipSet) {
      const tips = t('tips');
      $('ld-tip').textContent = tips[Math.floor(Math.random() * tips.length)];
      this._tipSet = true;
    }
  }
  loadingDone() {
    this._tipSet = false;
  }

  card(i) {
    const c = $('card');
    c.querySelector('.c-tag').textContent = t(LEVEL_INFO[i].tag);
    c.querySelector('.c-name').textContent = t(LEVEL_INFO[i].name);
    c.classList.remove('hidden');
    c.style.animation = 'none';
    void c.offsetWidth;
    c.style.animation = '';
    clearTimeout(this._cardT);
    this._cardT = setTimeout(() => c.classList.add('hidden'), 5600);
  }

  note(text) {
    $('note-text').textContent = text;
    this.show('s-note');
  }

  // ------------------------------------------------------------- teclado --
  buildKeypad() {
    const grid = $('kp-grid');
    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', 'OK'];
    for (const k of keys) {
      const b = document.createElement('button');
      b.textContent = k;
      b.onclick = () => this.kpPress(k);
      grid.appendChild(b);
    }
    this.kpVal = '';
  }
  keypad(onSubmit) {
    this.kpVal = '';
    this.kpCb = onSubmit;
    this.kpRender();
    this.show('s-keypad');
  }
  kpPress(k) {
    const g = this.game;
    if (k === 'C') this.kpVal = '';
    else if (k === 'OK') {
      if (this.kpVal.length === 4) {
        const ok = this.kpCb(this.kpVal);
        if (!ok) {
          $('kp-display').classList.add('err');
          setTimeout(() => {
            $('kp-display').classList.remove('err');
            this.kpVal = '';
            this.kpRender();
          }, 700);
        }
      }
      return;
    } else if (this.kpVal.length < 4) this.kpVal += k;
    g.audio.beep(true);
    this.kpRender();
  }
  kpRender() {
    $('kp-display').textContent = (this.kpVal + '____').slice(0, 4);
  }

  end(stats) {
    $('end-text').textContent = t('end_text');
    $('end-stats').textContent = stats;
    this.show('s-end');
  }

  // ------------------------------------------------------------------ HUD --
  hud(on) {
    $('hud').classList.toggle('hidden', !on);
    $('touch').classList.toggle('hidden', !(on && this.game.input.touch));
  }
  setObjective(tag, text, items = '') {
    if (this._obj !== tag + text + items) {
      this._obj = tag + text + items;
      $('obj-tag').textContent = tag;
      $('obj-text').textContent = text;
      $('obj-items').innerHTML = items;
      $('obj').classList.remove('faded');
      clearTimeout(this._objT);
      this._objT = setTimeout(() => $('obj').classList.add('faded'), 9000);
    }
  }
  setStats(p) {
    const hp = Math.ceil(p.hp);
    if (this._hp !== hp) {
      this._hp = hp;
      $('hp-val').textContent = hp;
      $('hp').classList.toggle('low', hp < 35);
    }
    const cells = Math.ceil(p.battery * 4 - 0.001);
    const key = cells + ':' + p.flashOn + ':' + (p.battery < 0.15);
    if (this._bat !== key) {
      this._bat = key;
      document.querySelectorAll('#battery .cell').forEach((c, i) => (c.style.opacity = i < cells ? 1 : 0));
      $('battery').classList.toggle('low', p.battery < 0.15);
      $('battery').classList.toggle('off', !p.flashOn);
    }
    const st = $('sta');
    st.classList.toggle('on', p.stamina < 0.99);
    st.classList.toggle('ex', p.exhausted);
    $('sta-fill').style.width = (p.stamina * 100).toFixed(1) + '%';
  }
  setNoise(n) {
    const h = Math.round(Math.min(1, n) * 20);
    if (this._noise !== h) {
      this._noise = h;
      $('mic-fill').setAttribute('y', 22 - h);
      $('mic').classList.toggle('loud', n > 0.7);
    }
  }
  setPrompt(text, enabled = true) {
    const p = $('prompt');
    if (!text) {
      if (!p.classList.contains('hidden')) p.classList.add('hidden');
      $('cross').classList.remove('act');
      $('b-use').classList.remove('pulse');
      return;
    }
    p.classList.remove('hidden');
    p.classList.toggle('dis', !enabled);
    $('prompt-key').textContent = this.game.input.touch ? '●' : 'E';
    if (this._pt !== text) {
      this._pt = text;
      $('prompt-text').textContent = text;
    }
    $('cross').classList.toggle('act', enabled);
    $('b-use').classList.toggle('pulse', enabled);
  }
  toast(text, dur = 2.6) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.remove('on'), dur * 1000);
  }
  fps(v) {
    const el = $('fps');
    el.classList.toggle('hidden', !settings.fps);
    if (settings.fps) el.textContent = v;
  }
  flash(color = '#000', opacity = 1, ms = 300) {
    const el = $('overlay-flash');
    el.style.transition = 'none';
    el.style.background = color;
    el.style.opacity = opacity;
    void el.offsetWidth;
    el.style.transition = `opacity ${ms}ms`;
    el.style.opacity = 0;
  }
}

// Interface: menus, textos da história, HUD, lembranças, opções e controles de toque.
import { LEVELS } from '../levels/index.js';
import { clearProgress } from '../game/save.js';

const $ = (id) => document.getElementById(id);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const INTRO = [
  'você fechou os olhos por um instante.',
  'quando abriu, o mundo estava em silêncio.',
  'esses lugares parecem lembranças.\nmas de quem?',
  'encontre o que ficou para trás.\numa porta vai aparecer.',
];
const ENDING = [
  'você acordou.',
  'o quarto está escuro. lá fora, um carro passa devagar.',
  'por um instante, ainda dá para sentir o cheiro de grama molhada.',
  'e você sabe, de algum jeito, que vai voltar.',
];

export class UI {
  constructor() {
    this.game = null;
    this.stack = [];
    this.whispers = [];
    this.whisperBusy = false;
    this.hudHidden = false;
    this.skip = false;
    this.osdStart = performance.now();
  }

  attach(game) {
    this.game = game;
    const inp = game.input;
    // primeiro gesto libera o áudio
    const unlock = () => {
      if (game.audio) game.audio.unlock();
    };
    for (const ev of ['pointerdown', 'touchend', 'click', 'keydown']) addEventListener(ev, unlock, { capture: true });

    document.querySelectorAll('#ui button').forEach((b) => {
      b.addEventListener('pointerenter', () => game.audio && game.audio.uiHover());
    });
    $('ui').addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      if (game.audio) game.audio.uiClick();
      this.act(b.dataset.act, b);
    });
    $('pause-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (game.state === 'play') game.pause();
      else if (game.state === 'pause') game.resume();
    });

    // opções
    const s = game.settings;
    const bind = (id, key, kind = 'value', parse = Number) => {
      const el = $(id);
      if (kind === 'checked') el.checked = !!s[key];
      else el.value = s[key];
      el.addEventListener(kind === 'checked' ? 'change' : 'input', () => {
        s[key] = kind === 'checked' ? el.checked : parse(el.value);
        game.saveSettings();
      });
    };
    bind('opt-quality', 'quality', 'value', String);
    bind('opt-sens', 'sens');
    bind('opt-fov', 'fov');
    bind('opt-master', 'master');
    bind('opt-music', 'music');
    bind('opt-sfx', 'sfx');
    bind('opt-invert', 'invertY', 'checked');
    bind('opt-bob', 'bob', 'checked');
    bind('opt-grain', 'grain', 'checked');
    bind('opt-ca', 'ca', 'checked');
    bind('opt-vhs', 'vhs', 'checked');
    bind('opt-fps', 'fps', 'checked');
    $('opt-quality').addEventListener('change', () => {
      s.quality = $('opt-quality').value;
      game.saveSettings();
    });
    $('opt-vhs').addEventListener('change', () => this.updateOsd());

    // clique na tela durante o jogo trava o ponteiro (PC)
    const canvas = game.canvas;
    canvas.addEventListener('click', () => {
      if (game.state === 'play' && !inp.locked && !inp.isTouch) inp.requestLock();
    });
    // arrastar para olhar (alternativa quando o navegador não deixa travar o ponteiro)
    let drag = false;
    canvas.addEventListener('mousedown', () => (drag = true));
    addEventListener('mouseup', () => (drag = false));
    addEventListener('mousemove', (e) => {
      if (drag && !inp.locked && game.state === 'play') inp.addLook(e.movementX, e.movementY);
    });
    if (inp.isTouch) this.setupTouch();
    $('hint-controls').textContent = inp.isTouch ? 'joystick à esquerda para andar · arraste à direita para olhar' : 'WASD para andar · mouse para olhar';

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && game.state === 'play') game.pause();
    });
    // pular textos da história
    const skip = () => (this.skip = true);
    $('story').addEventListener('pointerdown', skip);
    addEventListener('keydown', (e) => {
      if (!$('story').hidden && (e.code === 'Space' || e.code === 'Enter' || e.code === 'Escape')) skip();
      if (e.code === 'Escape' && game.state === 'pause' && this.stack.length) this.back();
      else if (e.code === 'Escape' && game.state === 'pause' && !$('pause').hidden) game.resume();
    });
    setInterval(() => this.tickOsd(), 1000);
    this.updateOsd();
  }

  act(a, el) {
    const g = this.game;
    switch (a) {
      case 'new':
        g.progress.level = 0;
        g.start(0, { intro: true });
        break;
      case 'continue':
        g.start(Math.min(g.progress.level || 0, LEVELS.length - 1));
        break;
      case 'chapters':
        this.open('chapters');
        break;
      case 'options':
        this.open('options');
        break;
      case 'credits':
        this.open('credits');
        break;
      case 'back':
        this.back();
        break;
      case 'resume':
        g.resume();
        break;
      case 'quit':
        g.quitToTitle();
        break;
      case 'chapter':
        this.closePanels();
        g.start(Number(el.dataset.i));
        break;
      case 'reset':
        clearProgress();
        location.reload();
        break;
    }
  }

  // ---------------------------------------------------------------- painéis
  open(id) {
    const cur = ['title', 'pause'].find((x) => !$(x).hidden) || this.stack[this.stack.length - 1];
    if (cur) {
      $(cur).hidden = true;
      this.stack.push(cur);
    }
    if (id === 'chapters') this.buildChapters();
    $(id).hidden = false;
  }

  back() {
    for (const id of ['chapters', 'options', 'credits']) $(id).hidden = true;
    const prev = this.stack.pop();
    if (prev) $(prev).hidden = false;
  }

  closePanels() {
    for (const id of ['chapters', 'options', 'credits', 'pause']) $(id).hidden = true;
    this.stack = [];
  }

  buildChapters() {
    const ol = $('chapter-list');
    ol.innerHTML = '';
    const un = this.game.progress.unlocked || 0;
    LEVELS.forEach((L, i) => {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.act = 'chapter';
      b.dataset.i = i;
      b.disabled = i > un;
      b.innerHTML = `<span class="n">${L.meta.numeral}</span><span>${i > un ? '· · ·' : L.meta.name}</span>`;
      li.appendChild(b);
      ol.appendChild(li);
    });
  }

  showTitle(progress) {
    this.closePanels();
    this.showHud(false);
    $('title').hidden = false;
    const cont = $('btn-continue');
    const has = (progress.level || 0) > 0 && (progress.level || 0) < LEVELS.length;
    cont.hidden = !has;
    if (has) $('continue-where').textContent = '· ' + LEVELS[progress.level].meta.name;
    $('btn-chapters').hidden = !(progress.unlocked > 0 || progress.finished);
    $('btn-new').textContent = progress.finished ? 'sonhar de novo' : 'começar';
  }

  hideTitle() {
    this.closePanels();
    $('title').hidden = true;
  }

  // ---------------------------------------------------------------- história
  async story(lines, dark = false) {
    const box = $('story');
    const t = $('story-text');
    box.hidden = false;
    t.classList.toggle('dark', dark);
    this.skip = false;
    for (const line of lines) {
      if (this.skip) break;
      t.textContent = '';
      line.split('\n').forEach((part, i) => {
        if (i) t.appendChild(document.createElement('br'));
        t.appendChild(document.createTextNode(part));
      });
      t.classList.add('show');
      for (let i = 0; i < 40 && !this.skip; i++) await sleep(100);
      t.classList.remove('show');
      await sleep(this.skip ? 300 : 1500);
    }
    box.hidden = true;
  }

  intro() {
    return this.story(INTRO);
  }

  async ending() {
    this.showHud(false);
    $('memory').hidden = true;
    await sleep(1500);
    await this.story(ENDING);
    // créditos
    const c = $('credits');
    c.querySelector('h2').textContent = 'obrigado por sonhar';
    const back = c.querySelector('.back');
    back.textContent = 'voltar ao início';
    c.hidden = false;
    await new Promise((res) => {
      const done = () => {
        back.removeEventListener('click', done);
        res();
      };
      back.addEventListener('click', done);
      setTimeout(done, 45000);
    });
    c.hidden = true;
    c.querySelector('h2').textContent = 'créditos';
    back.textContent = 'voltar';
  }

  // ---------------------------------------------------------------- HUD
  showHud(on) {
    $('hud').hidden = !on;
    $('touch').hidden = !(on && this.game && this.game.input.isTouch);
    $('lock-hint').hidden = true;
    this.updateOsd();
  }

  toggleHud() {
    this.hudHidden = !this.hudHidden;
    $('hud').classList.toggle('hide-all', this.hudHidden);
  }

  toggleFullscreen() {
    try {
      if (document.fullscreenElement) document.exitFullscreen();
      else {
        const p = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
        if (p && p.catch) p.catch(() => {});
      }
    } catch (e) {}
  }

  levelCard(meta) {
    const c = $('level-card');
    c.querySelector('.num').textContent = meta.numeral;
    c.querySelector('.name').textContent = meta.name;
    c.querySelector('.line').textContent = meta.line;
    c.classList.add('show');
    clearTimeout(this._lc);
    this._lc = setTimeout(() => c.classList.remove('show'), 6000);
  }

  whisper(text) {
    this.whispers.push(text);
    if (!this.whisperBusy) this._nextWhisper();
  }

  async _nextWhisper() {
    const w = $('whisper');
    const text = this.whispers.shift();
    if (!text) {
      this.whisperBusy = false;
      return;
    }
    this.whisperBusy = true;
    w.textContent = text;
    w.classList.add('show');
    await sleep(4200);
    w.classList.remove('show');
    await sleep(1700);
    this._nextWhisper();
  }

  setCount(n, total) {
    const d = $('dots');
    d.innerHTML = '';
    for (let i = 0; i < total; i++) {
      const el = document.createElement('i');
      if (i < n) el.className = 'on';
      d.appendChild(el);
    }
    d.setAttribute('aria-label', `${n} de ${total} lembranças`);
  }

  showMemory(m, n, total) {
    const box = $('memory');
    $('memory-img').src = m.canvas.toDataURL('image/png');
    $('memory-img').alt = m.def.caption;
    $('memory-line').textContent = m.def.line;
    box.hidden = false;
    requestAnimationFrame(() => box.classList.add('show'));
    clearTimeout(this._mt);
    this._mt = setTimeout(() => {
      box.classList.remove('show');
      setTimeout(() => (box.hidden = true), 1200);
      this.setCount(n, total);
      if (n === total) this.whisper('todas as lembranças daqui foram encontradas.');
      else this.whisper(`${total - n === 1 ? 'falta uma lembrança' : `faltam ${total - n} lembranças`}.`);
    }, 4600);
  }

  showPause(on) {
    if (on) {
      const g = this.game;
      $('pause-where').textContent = `${g.meta.numeral} · ${g.meta.name} · ${g.memories.count} de ${g.memories.total} lembranças`;
      $('pause').hidden = false;
    } else this.closePanels();
  }

  loading(on) {
    $('loading').hidden = !on;
  }

  setFps(on) {
    $('fps').hidden = !on;
  }

  fps(v, scale) {
    if (!$('fps').hidden) $('fps').textContent = `${v} fps · ${Math.round(scale * 100)}%`;
    const g = this.game;
    if (g && g.state === 'play' && !g.input.isTouch) $('lock-hint').hidden = g.input.locked || !$('memory').hidden;
    else $('lock-hint').hidden = true;
  }

  updateOsd() {
    const on = this.game && this.game.settings.vhs;
    $('osd').hidden = !on;
  }

  tickOsd() {
    if ($('osd').hidden) return;
    const s = Math.floor((performance.now() - this.osdStart) / 1000) + 18 * 3600 + 47 * 60;
    const h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60;
    $('osd-date').textContent = `${h > 12 ? 'PM' : 'AM'} ${(h % 12 || 12)}:${String(m).padStart(2, '0')}  NOV. 12 1998`;
  }

  // ---------------------------------------------------------------- toque
  setupTouch() {
    const inp = this.game.input;
    const canvas = this.game.canvas;
    const stick = $('stick');
    const knob = $('knob');
    let moveId = null, lookId = null, cx = 0, cy = 0, lx = 0, ly = 0;
    const R = 52;
    const home = () => {
      stick.style.left = '';
      stick.style.top = '';
      knob.style.transform = '';
      stick.classList.remove('active');
    };
    canvas.addEventListener(
      'touchstart',
      (e) => {
        for (const t of e.changedTouches) {
          if (t.clientX < innerWidth * 0.45 && moveId === null) {
            moveId = t.identifier;
            cx = t.clientX;
            cy = t.clientY;
            stick.style.left = cx + 'px';
            stick.style.top = cy + 'px';
            stick.classList.add('active');
          } else if (lookId === null) {
            lookId = t.identifier;
            lx = t.clientX;
            ly = t.clientY;
          }
        }
        e.preventDefault();
      },
      { passive: false }
    );
    canvas.addEventListener(
      'touchmove',
      (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier === moveId) {
            let dx = t.clientX - cx, dy = t.clientY - cy;
            const d = Math.hypot(dx, dy);
            if (d > R) {
              dx = (dx / d) * R;
              dy = (dy / d) * R;
            }
            knob.style.transform = `translate(${dx}px, ${dy}px)`;
            inp.touchMove.x = dx / R;
            inp.touchMove.y = -dy / R;
          } else if (t.identifier === lookId) {
            inp.addLook((t.clientX - lx) * 2.1, (t.clientY - ly) * 2.1);
            lx = t.clientX;
            ly = t.clientY;
          }
        }
        e.preventDefault();
      },
      { passive: false }
    );
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === moveId) {
          moveId = null;
          inp.touchMove.x = inp.touchMove.y = 0;
          home();
        }
        if (t.identifier === lookId) lookId = null;
      }
    };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);
    const run = $('t-run');
    run.addEventListener('click', () => {
      inp.touchRun = !inp.touchRun;
      run.classList.toggle('on', inp.touchRun);
    });
    $('t-jump').addEventListener('touchstart', (e) => {
      inp.touchJump = true;
      e.preventDefault();
    }, { passive: false });
    $('t-jump').addEventListener('click', () => (inp.touchJump = true));
  }
}

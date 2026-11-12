// Interface: HUD (vitalidade, arma, objetivo, bússola, chefe), mensagens, avisos de ação,
// telas (título, dificuldade, opções, controles, introdução, pausa, mochila, documentos,
// morte e vitória) e controles de toque.
import { IS_TOUCH, DIFFICULTY } from './config.js';
import { NOTES, ITEMS, TIPS, ENDING, INTRO, rankOf } from './story.js';
import { angleDiff, pick } from './util.js';
import { WEAPONS } from './player.js';

const ICON = {
  pistol: '<svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true"><path d="M5 15h31l3 2v5h-9l-2 3h-5l-3 12H12l3-12H9l-4-4z"/><path d="M39 17h5v3h-5z"/></svg>',
  shotgun: '<svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true"><path d="M2 19h28v5H15l-4 8H4l3-8H2z"/><path d="M30 19.5h16v2.4H30zM23 24h11v3H23z"/></svg>',
  knife: '<svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true"><path d="M17 27 44 9 26 30z"/><path d="m5 36 12-9 3 4-12 9z"/></svg>',
  ammo_pistol: '<svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true"><path d="M8 24h32v16H8z"/><path d="M13 24v-8c0-4 6-4 6 0v8zm8 0v-8c0-4 6-4 6 0v8zm8 0v-8c0-4 6-4 6 0v8z" opacity=".7"/></svg>',
  ammo_shotgun: '<svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true"><path d="M10 14h8v20h-8zM20 14h8v20h-8zM30 14h8v20h-8z" opacity=".75"/><path d="M9 34h10v5H9zM19 34h10v5H19zM29 34h10v5H29z"/></svg>',
  tonic: '<svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true"><path d="M20 6h8v5h-8z" opacity=".7"/><path d="M19 11h10v6l5 5v18a3 3 0 0 1-3 3H17a3 3 0 0 1-3-3V22l5-5z"/><path d="M17 28h14v8H17z" fill="#15171b" opacity=".45"/></svg>',
  medkit: '<svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true"><path d="M18 10h12v5H18z" opacity=".7"/><path d="M6 15h36v24H6z"/><path d="M21 19h6v6h6v6h-6v6h-6v-6h-6v-6h6z" fill="#a3221b"/></svg>',
  grenade: '<svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true"><circle cx="22" cy="29" r="12"/><path d="M19 13h8v5h-8zM27 13l9 6-2 3-8-5z" opacity=".75"/></svg>',
  key: '<svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true"><path d="M14 16a8 8 0 1 1 0 16 8 8 0 0 1 0-16zm0 5a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"/><path d="M21 22h22v4h-4v6h-4v-6h-3v4h-4v-4h-7z"/></svg>',
  doc: '<svg viewBox="0 0 48 48" fill="currentColor" aria-hidden="true"><path d="M10 5h20l8 8v30H10z"/><path d="M15 18h18v2H15zm0 5h18v2H15zm0 5h18v2H15zm0 5h12v2H15z" fill="#15171b" opacity=".6"/></svg>',
};

const fmtTime = (s) => {
  s = Math.floor(s);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};

export class UI {
  constructor(G) {
    this.G = G;
    const $ = (id) => document.getElementById(id);
    this.$ = $;
    this.e = {
      hud: $('hud'),
      objText: $('obj-text'),
      compass: $('compass'),
      cmark: $('compass-mark'),
      carrow: $('compass-arrow'),
      cdist: $('compass-dist'),
      bossbar: $('bossbar'),
      bossFill: $('boss-fill'),
      msgs: $('msgs'),
      prompt: $('prompt'),
      pkey: $('prompt-key'),
      ptext: $('prompt-text'),
      phold: $('prompt-hold'),
      pholdFill: $('prompt-hold-fill'),
      hit: $('hitmark'),
      hpFill: $('hp-fill'),
      wName: $('w-name'),
      wMag: $('w-mag'),
      wRes: $('w-res'),
      wState: $('w-state'),
      iTonic: $('i-tonic'),
      iGren: $('i-grenade'),
      saved: $('saved'),
      fps: $('fps'),
      low: $('fx-low'),
      hurt: $('fx-hurt'),
      heal: $('fx-heal'),
      fade: $('fx-fade'),
      bosscard: $('bosscard'),
      touch: $('touch'),
    };
    this.screens = ['s-title', 's-new', 's-options', 's-controls', 's-intro', 's-pause', 's-inv', 's-note', 's-dead', 's-win', 's-loading'];
    this.current = 's-loading';
    this.hurtK = 0;
    this.cache = {};
    this.backTo = 's-title';
    this.noteReturn = null;
    this.bind();
    this.setTouch(IS_TOUCH);
  }

  setTouch(on) {
    document.body.classList.toggle('touch', on);
    this.touchOn = on;
  }

  // ------------------------------------------------------------------ telas
  show(id) {
    for (const s of this.screens) this.$(s).hidden = s !== id;
    this.current = id;
    const first = id && this.$(id).querySelector('button:not([hidden]), select, input');
    if (first && !this.touchOn) first.focus({ preventScroll: true });
  }

  hideScreens() {
    for (const s of this.screens) this.$(s).hidden = true;
    this.current = null;
  }

  setHud(on) {
    this.e.hud.hidden = !on;
    this.e.touch.hidden = !(on && this.touchOn);
  }

  loading(frac, text) {
    this.$('load-fill').style.width = Math.round(frac * 100) + '%';
    if (text) this.$('load-text').textContent = text;
  }

  showTitle(hasSave) {
    this.$('b-continue').hidden = !hasSave;
    this.backTo = 's-title';
    this.show('s-title');
  }

  showNewGame() {
    const list = this.$('diff-list');
    list.innerHTML = '';
    for (const k of Object.keys(DIFFICULTY)) {
      const d = DIFFICULTY[k];
      const b = document.createElement('button');
      b.className = 'btn choice' + (k === this.G.settings.difficulty ? ' primary' : '');
      b.innerHTML = `${d.label}<small>${d.desc}</small>`;
      b.addEventListener('click', () => {
        this.G.audio.init();
        this.G.audio.ui('select');
        this.G.game.newGame(k);
      });
      list.appendChild(b);
    }
    this.backTo = 's-title';
    this.show('s-new');
  }

  showOptions(from) {
    const S = this.G.settings;
    this.optFrom = from;
    this.$('o-quality').value = S.quality;
    this.$('o-sens').value = S.sens;
    this.$('o-tsens').value = S.touchSens;
    this.$('o-vol').value = S.volume;
    this.$('o-music').value = S.music;
    this.$('o-invert').checked = S.invertY;
    this.$('o-compass').checked = S.compass;
    this.$('o-assist').checked = S.aimAssist;
    this.$('o-dyn').checked = S.dynRes;
    this.$('o-fps').checked = S.showFps;
    this.refreshOutputs();
    this.backTo = from;
    this.show('s-options');
  }

  refreshOutputs() {
    const S = this.G.settings;
    this.$('o-sens-v').textContent = S.sens.toFixed(2);
    this.$('o-tsens-v').textContent = S.touchSens.toFixed(2);
    this.$('o-vol-v').textContent = Math.round(S.volume * 100) + '%';
    this.$('o-music-v').textContent = Math.round(S.music * 100) + '%';
  }

  showControls(from) {
    this.backTo = from;
    this.show('s-controls');
  }

  playIntro(done) {
    const box = this.$('intro-lines');
    box.innerHTML = '';
    this.show('s-intro');
    let i = 0,
      finished = false;
    const timers = [];
    const finish = () => {
      if (finished) return;
      finished = true;
      timers.forEach(clearTimeout);
      window.removeEventListener('keydown', skip, true);
      this.$('s-intro').removeEventListener('pointerdown', skip);
      done();
    };
    const skip = (e) => {
      if (e && e.type === 'keydown' && e.repeat) return;
      finish();
    };
    const next = () => {
      if (i >= INTRO.length) {
        timers.push(setTimeout(finish, 2600));
        return;
      }
      const p = document.createElement('p');
      p.textContent = INTRO[i++];
      box.appendChild(p);
      timers.push(setTimeout(next, 1900));
    };
    timers.push(setTimeout(next, 400));
    setTimeout(() => {
      if (finished) return;
      window.addEventListener('keydown', skip, true);
      this.$('s-intro').addEventListener('pointerdown', skip);
    }, 350);
  }

  showPause() {
    this.backTo = 's-pause';
    const I = this.G.input;
    this.$('pause-hint').textContent = I.touchMode ? '' : I.lockFailed ? 'Sem captura do mouse: encoste o cursor nas bordas para girar, ou use as setas.' : 'Clique em Continuar para voltar ao jogo.';
    this.show('s-pause');
  }

  showDeath() {
    this.$('dead-tip').textContent = 'Dica: ' + pick(TIPS);
    this.show('s-dead');
  }

  showVictory(stats, diffKey) {
    this.$('win-text').innerHTML = ENDING.map((l) => `<p>${l}</p>`).join('');
    this.$('win-rank').textContent = rankOf(stats);
    const acc = stats.shots ? Math.round((stats.hits / stats.shots) * 100) : 0;
    const rows = [
      ['Tempo', fmtTime(stats.time)],
      ['Inimigos abatidos', stats.kills],
      ['Mortes com tiro na cabeça', stats.heads],
      ['Precisão', acc + '%'],
      ['Vezes que morreu', stats.deaths],
      ['Dificuldade', DIFFICULTY[diffKey] ? DIFFICULTY[diffKey].label : ''],
    ];
    this.$('win-stats').innerHTML = rows.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('');
    this.show('s-win');
  }

  openNote(id) {
    const n = NOTES[id];
    if (!n) return;
    this.$('note-title').textContent = n.title;
    this.$('note-body').textContent = n.body;
    this.$('note-paper').classList.toggle('print', n.kind === 'print');
    this.$('note-paper').scrollTop = 0;
    this.show('s-note');
  }

  // ------------------------------------------------------------------ mochila
  showInventory() {
    const G = this.G,
      P = G.player;
    const slots = [];
    const equip = (id) => () => {
      if (P.current !== id && P.weapons[id].owned) {
        P.current = id;
        P.action = null;
        P.updateGunVisibility();
        this.weaponChanged();
        G.audio.ui('select');
        this.showInventory();
      }
    };
    const use = (it) => () => {
      if (P.useItem(it)) this.showInventory();
    };
    slots.push({ key: 'pistol', icon: 'pistol', name: ITEMS.pistol.name, count: `${P.weapons.pistol.mag}/${WEAPONS.pistol.mag}`, desc: ITEMS.pistol.desc + (P.current === 'pistol' ? ' Equipada.' : ''), actions: P.current === 'pistol' ? [] : [['Equipar', equip('pistol')]] });
    if (P.weapons.shotgun.owned)
      slots.push({ key: 'shotgun', icon: 'shotgun', name: ITEMS.shotgun.name, count: `${P.weapons.shotgun.mag}/${WEAPONS.shotgun.mag}`, desc: ITEMS.shotgun.desc + (P.current === 'shotgun' ? ' Equipada.' : ''), actions: P.current === 'shotgun' ? [] : [['Equipar', equip('shotgun')]] });
    slots.push({ key: 'knife', icon: 'knife', name: ITEMS.knife.name, count: '', desc: ITEMS.knife.desc, actions: [] });
    slots.push({ key: 'ammo_pistol', icon: 'ammo_pistol', name: ITEMS.ammo_pistol.name, count: P.ammo.pistol, desc: ITEMS.ammo_pistol.desc, actions: [] });
    if (P.weapons.shotgun.owned || P.ammo.shotgun) slots.push({ key: 'ammo_shotgun', icon: 'ammo_shotgun', name: ITEMS.ammo_shotgun.name, count: P.ammo.shotgun, desc: ITEMS.ammo_shotgun.desc, actions: [] });
    for (const it of ['tonic', 'medkit']) if (P.items[it] > 0) slots.push({ key: it, icon: it, name: ITEMS[it].name, count: P.items[it], desc: ITEMS[it].desc, actions: [['Usar', use(it)]] });
    if (P.items.grenade > 0) slots.push({ key: 'grenade', icon: 'grenade', name: ITEMS.grenade.name, count: P.items.grenade, desc: ITEMS.grenade.desc + ' Tecla G para lançar.', actions: [] });
    if (P.keys.cemetery) slots.push({ key: 'key', icon: 'key', name: ITEMS.key.name, count: '', desc: ITEMS.key.desc, actions: [] });
    for (const n of P.notes) {
      slots.push({
        key: 'doc:' + n,
        icon: 'doc',
        name: NOTES[n].title,
        count: '',
        doc: true,
        desc: 'Documento encontrado no vale.',
        actions: [
          [
            'Ler',
            () => {
              this.noteReturn = 's-inv';
              this.openNote(n);
            },
          ],
        ],
      });
    }
    const grid = this.$('inv-grid');
    grid.innerHTML = '';
    let selected = slots.findIndex((s) => s.key === this.invSel);
    if (selected < 0) selected = 0;
    const select = (i) => {
      const s = slots[i];
      this.invSel = s.key;
      grid.querySelectorAll('.slot').forEach((b, k) => b.classList.toggle('sel', k === i));
      this.$('inv-icon').innerHTML = ICON[s.icon];
      this.$('inv-name').textContent = s.name;
      this.$('inv-desc').textContent = s.desc;
      const acts = this.$('inv-actions');
      acts.innerHTML = '';
      for (const [label, fn] of s.actions) {
        const b = document.createElement('button');
        b.className = 'btn small primary';
        b.textContent = label;
        b.addEventListener('click', fn);
        acts.appendChild(b);
      }
    };
    slots.forEach((s, i) => {
      const b = document.createElement('button');
      b.className = 'slot' + (s.doc ? ' doc' : '');
      b.setAttribute('role', 'listitem');
      b.innerHTML = `${ICON[s.icon]}<span>${s.name}</span>${s.count !== '' ? `<span class="count">${s.count}</span>` : ''}`;
      b.addEventListener('click', () => {
        select(i);
        G.audio.ui('move');
      });
      b.addEventListener('dblclick', () => {
        if (s.actions[0]) s.actions[0][1]();
      });
      grid.appendChild(b);
    });
    select(selected);
    this.$('inv-hp').textContent = `Vitalidade ${Math.ceil(P.hp)}/${P.maxHp}`;
    this.backTo = 's-inv';
    if (this.current !== 's-inv') this.show('s-inv');
  }

  // ------------------------------------------------------------------ ligações
  bind() {
    const $ = this.$,
      G = this.G;
    const click = (id, fn) =>
      $(id).addEventListener('click', () => {
        G.audio.init();
        G.audio.ui('select');
        fn();
      });
    click('b-new', () => this.showNewGame());
    click('b-continue', () => G.game.continueSaved());
    click('b-controls', () => this.showControls('s-title'));
    click('b-options', () => this.showOptions('s-title'));
    click('b-resume', () => G.game.resume());
    click('b-inv', () => G.game.openInventory());
    click('b-pcontrols', () => this.showControls('s-pause'));
    click('b-poptions', () => this.showOptions('s-pause'));
    click('b-retry', () => G.game.retryCheckpoint());
    click('b-quit', () => G.game.quitToTitle());
    click('b-inv-close', () => G.game.closeOverlay());
    click('b-note-close', () => this.closeNote());
    click('b-dead-retry', () => G.game.retryCheckpoint());
    click('b-dead-quit', () => G.game.quitToTitle());
    click('b-win-again', () => G.game.newGame(G.settings.difficulty));
    click('b-win-title', () => G.game.quitToTitle());
    for (const b of document.querySelectorAll('[data-back]')) {
      b.addEventListener('click', () => {
        G.audio.ui('back');
        this.back();
      });
    }
    // opções
    const S = G.settings;
    const onChange = (id, fn) => $(id).addEventListener('input', () => {
      fn($(id));
      this.refreshOutputs();
      G.game.applySettings();
    });
    onChange('o-quality', (el) => (S.quality = el.value));
    onChange('o-sens', (el) => (S.sens = parseFloat(el.value)));
    onChange('o-tsens', (el) => (S.touchSens = parseFloat(el.value)));
    onChange('o-vol', (el) => (S.volume = parseFloat(el.value)));
    onChange('o-music', (el) => (S.music = parseFloat(el.value)));
    onChange('o-invert', (el) => (S.invertY = el.checked));
    onChange('o-compass', (el) => (S.compass = el.checked));
    onChange('o-assist', (el) => (S.aimAssist = el.checked));
    onChange('o-dyn', (el) => (S.dynRes = el.checked));
    onChange('o-fps', (el) => (S.showFps = el.checked));
    $('o-quality').addEventListener('change', () => G.game.applySettings());

    // teclado nos menus
    window.addEventListener('keydown', (e) => {
      if (G.state === 'play' || G.state === 'loading' || this.current === 's-intro' || !this.current) return;
      const scr = $(this.current);
      if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        const items = [...scr.querySelectorAll('button:not([hidden]), select, input')].filter((b) => b.offsetParent !== null);
        if (!items.length) return;
        let i = items.indexOf(document.activeElement);
        i = e.code === 'ArrowDown' ? (i + 1) % items.length : (i - 1 + items.length) % items.length;
        if (document.activeElement && document.activeElement.type === 'range') return;
        items[i].focus();
        e.preventDefault();
        G.audio.ui('move');
        return;
      }
      if (e.code === 'Escape' || e.code === 'KeyP' || ((e.code === 'Tab' || e.code === 'KeyI') && this.current === 's-inv')) {
        e.preventDefault();
        if (this.current === 's-pause') G.game.resume();
        else if (this.current === 's-inv') G.game.closeOverlay();
        else if (this.current === 's-note') this.closeNote();
        else if (['s-options', 's-controls', 's-new'].includes(this.current)) this.back();
      }
    });
  }

  back() {
    const to = this.backTo || 's-title';
    if (to === 's-pause') this.showPause();
    else if (to === 's-inv') this.showInventory();
    else this.showTitle(this.G.game.hasSave());
  }

  closeNote() {
    if (this.noteReturn === 's-inv') {
      this.noteReturn = null;
      this.showInventory();
      return;
    }
    this.noteReturn = null;
    this.G.game.closeOverlay();
  }

  // ------------------------------------------------------------------ HUD
  set(key, el, prop, value) {
    if (this.cache[key] === value) return;
    this.cache[key] = value;
    if (prop === 'text') el.textContent = value;
    else if (prop === 'width') el.style.width = value;
    else if (prop === 'opacity') el.style.opacity = value;
    else if (prop === 'class') el.className = value;
    else if (prop === 'hidden') el.hidden = value;
  }

  msg(text, key = false) {
    if (!text) return;
    const d = document.createElement('div');
    d.className = 'msg' + (key ? ' key' : '');
    d.textContent = text;
    this.e.msgs.appendChild(d);
    while (this.e.msgs.children.length > 4) this.e.msgs.firstChild.remove();
    setTimeout(() => d.remove(), 3700);
  }

  clearMsgs() {
    this.e.msgs.innerHTML = '';
  }

  prompt(p) {
    const e = this.e;
    if (!p) {
      this.set('pr', e.prompt, 'hidden', true);
      this.cache.ptxt = null;
      return;
    }
    this.set('pr', e.prompt, 'hidden', false);
    this.set('pk', e.pkey, 'text', this.touchOn ? 'Ação' : p.key);
    this.set('ptxt', e.ptext, 'text', p.text);
    this.set('pcls', e.prompt, 'class', p.urgent ? 'urgent' : '');
    const hold = p.hold !== undefined;
    this.set('ph', e.phold, 'hidden', !hold);
    if (hold) this.set('phf', e.pholdFill, 'width', Math.round(p.hold * 100) + '%');
  }

  hitMarker(head) {
    const h = this.e.hit;
    h.className = '';
    void h.offsetWidth;
    h.className = 'on' + (head ? ' head' : '');
  }

  damage(d) {
    this.hurtK = Math.min(1, this.hurtK + 0.35 + d / 40);
  }

  healFlash() {
    const h = this.e.heal;
    h.style.transition = 'none';
    h.style.opacity = '1';
    void h.offsetWidth;
    h.style.transition = '';
    h.style.opacity = '0';
  }

  weaponChanged() {
    this.cache.wname = null;
  }

  checkpoint() {
    const s = this.e.saved;
    s.hidden = true;
    void s.offsetWidth;
    s.hidden = false;
    clearTimeout(this.savedT);
    this.savedT = setTimeout(() => (s.hidden = true), 3100);
  }

  bossIntro() {
    const c = this.e.bosscard;
    c.hidden = false;
    clearTimeout(this.bossT);
    this.bossT = setTimeout(() => (c.hidden = true), 3500);
  }

  fade(on) {
    this.e.fade.classList.toggle('on', on);
  }

  update(dt, fps) {
    const G = this.G,
      P = G.player,
      e = this.e;
    // vitalidade
    const f = Math.max(0, P.hp / P.maxHp);
    this.set('hpw', e.hpFill, 'width', Math.round(f * 1000) / 10 + '%');
    this.set('hpc', e.hpFill, 'class', f < 0.3 ? 'low' : f < 0.6 ? 'mid' : '');
    const low = f < 0.35 && !P.dead ? ((0.35 - f) / 0.35) * (0.7 + 0.3 * Math.sin(G.time * 6)) : 0;
    e.low.style.opacity = low.toFixed(3);
    this.hurtK = Math.max(0, this.hurtK - dt * 1.6);
    this.set('hurt', e.hurt, 'opacity', this.hurtK.toFixed(2));
    // arma
    const w = WEAPONS[P.current],
      st = P.weapons[P.current];
    this.set('wname', e.wName, 'text', w.name);
    this.set('wmag', e.wMag, 'text', String(st.mag));
    this.set('wmagc', e.wMag, 'class', st.mag === 0 ? 'empty' : '');
    this.set('wres', e.wRes, 'text', '/ ' + P.ammo[w.ammo]);
    const a = P.action ? P.action.type : '';
    let state = '';
    if (a === 'reload' || a === 'reloadSG') state = 'Recarregando';
    else if (st.mag === 0 && P.ammo[w.ammo] === 0) state = 'Sem munição';
    else if (st.mag === 0) state = this.touchOn ? 'Recarregue' : 'Recarregue (R)';
    this.set('wst', e.wState, 'text', state);
    this.set('it', e.iTonic, 'text', P.items.tonic ? `Tônico ${P.items.tonic}` : P.items.medkit ? `Kit ${P.items.medkit}` : '');
    this.set('ig', e.iGren, 'text', P.items.grenade ? `Granada ${P.items.grenade}` : '');
    // objetivo
    const ob = G.level.objective();
    if (this.cache.obj !== ob.text) {
      this.cache.obj = ob.text;
      e.objText.textContent = ob.text;
      e.objText.classList.remove('flash');
      void e.objText.offsetWidth;
      e.objText.classList.add('flash');
    }
    // bússola
    const showC = G.settings.compass && ob.target && !P.dead;
    this.set('cmp', e.compass, 'hidden', !showC);
    if (showC) {
      const dx = ob.target.x - P.pos.x,
        dz = ob.target.z - P.pos.z;
      const rel = angleDiff(P.camYaw, Math.atan2(dx, dz));
      const half = Math.PI / 2.2;
      let x = 50 - (rel / half) * 50;
      const behind = Math.abs(rel) > half;
      x = Math.max(4, Math.min(96, x));
      e.cmark.style.left = x.toFixed(1) + '%';
      this.set('carr', e.carrow, 'text', behind ? (rel > 0 ? '◀' : '▶') : '◆');
      this.set('cd', e.cdist, 'text', Math.round(Math.hypot(dx, dz)) + ' m');
    }
    // chefe
    const B = G.enemies.boss;
    const showB = !!(B && G.level.flags.arena && B.state !== 'dormant' && !B.removed && B.state !== 'dead');
    this.set('bb', e.bossbar, 'hidden', !showB);
    if (showB) this.set('bf', e.bossFill, 'width', Math.max(0, (B.hp / B.maxHp) * 100).toFixed(1) + '%');
    // aviso para capturar o mouse
    const I = G.input;
    this.set('clk', this.$('clickhint'), 'hidden', I.touchMode || I.locked || I.lockFailed || P.dead);
    // fps
    this.set('fpsh', e.fps, 'hidden', !G.settings.showFps);
    if (G.settings.showFps && fps) this.set('fpsv', e.fps, 'text', `${fps} FPS`);
  }
}

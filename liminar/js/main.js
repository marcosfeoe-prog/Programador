// Liminar — jogo 3D de espaços liminares (Níveis 0, 1, 4, 10 e 11).
// Orquestra renderização, níveis, jogador, entidades, áudio, filtros e menus.
import * as THREE from 'three';
import { QUALITY, FILTERS, LEVELS, ORDER, orderPos, loadSettings, saveSettings } from './config.js';
import { initTextures, clearTextureCache, smilerTex } from './textures.js';
import { LM_UNIFORMS } from './materials.js';
import { Post } from './post.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { AudioEngine } from './audio.js';
import { HUD, Menu } from './ui.js';
import { Items, Smilers, Watcher } from './entities.js';
import { clamp, damp, yieldFrame } from './util.js';
import { Level0_1 } from './levels/level0_1.js';
import { Level88 } from './levels/level88.js';
import { Level37 } from './levels/level37.js';
import { Level2 } from './levels/level2.js';
import { Level3 } from './levels/level3.js';
import { Level8 } from './levels/level8.js';
import { Level9_5 } from './levels/level9_5.js';
import { Level34 } from './levels/level34.js';
import { Level35 } from './levels/level35.js';
import { Level43 } from './levels/level43.js';
import { Level44 } from './levels/level44.js';
import { Level45 } from './levels/level45.js';
import { Level14 } from './levels/level14.js';
import { Level16 } from './levels/level16.js';
import { Level46 } from './levels/level46.js';
import { LevelFR } from './levels/levelFR.js';
import { Level47 } from './levels/level47.js';
import { Level48 } from './levels/level48.js';
import { Level0_99 } from './levels/level0_99.js';
import { Level49 } from './levels/level49.js';
import { Level177 } from './levels/level177.js';
import { Level177Park } from './levels/level177_park.js';
import { Level177Neon } from './levels/level177_neon.js';
import { Level177Hill } from './levels/level177_hill.js';
import { Level177Fog } from './levels/level177_fog.js';
import { Level12 } from './levels/level12.js';
import { Level12Street } from './levels/level12_street.js';
import { Level12White } from './levels/level12_white.js';
import { Inventory } from './inventory.js';
import { Radar } from './radar.js';
import { Level0 } from './levels/level0.js';
import { Level1 } from './levels/level1.js';
import { Level4 } from './levels/level4.js';
import { Level5 } from './levels/level5.js';
import { Level9 } from './levels/level9.js';
import { Level10 } from './levels/level10.js';
import { Level10_1 } from './levels/level10_1.js';
import { Level11 } from './levels/level11.js';
import { Level15 } from './levels/level15.js';
import { Level23 } from './levels/level23.js';

// Classe de cada nível, pela chave definida em LEVELS (config.js).
const LEVEL_CLASSES = {
  0: Level0,
  '0.1': Level0_1,
  1: Level1,
  4: Level4,
  5: Level5,
  9: Level9,
  10: Level10,
  '10.1': Level10_1,
  11: Level11,
  15: Level15,
  23: Level23,
  88: Level88,
  37: Level37,
  2: Level2,
  3: Level3,
  8: Level8,
  '9.5': Level9_5,
  34: Level34,
  35: Level35,
  43: Level43,
  44: Level44,
  45: Level45,
  14: Level14,
  16: Level16,
  46: Level46,
  fr: LevelFR,
  47: Level47,
  48: Level48,
  '0.99': Level0_99,
  49: Level49,
  177: Level177,
  '177.2': Level177Park,
  '177.3': Level177Neon,
  '177.4': Level177Hill,
  '177.5': Level177Fog,
  12: Level12,
  '12.2': Level12Street,
  '12.3': Level12White,
};
const params = new URLSearchParams(location.search);

function showError(msg) {
  const e = document.getElementById('error');
  e.textContent = msg;
  e.classList.remove('hidden');
}

class Game {
  constructor() {
    this.settings = loadSettings();
    this.Q = QUALITY[this.settings.quality];
    // depuração: ?qo=chave:valor,... sobrescreve campos da qualidade
    if (params.has('qo')) {
      this.Q = { ...this.Q };
      for (const kv of params.get('qo').split(',')) {
        const [k, v] = kv.split(':');
        this.Q[k] = v === 'true' ? true : v === 'false' ? false : Number(v);
      }
    }
    this.canvas = document.getElementById('game');
    this.seed = params.has('seed') ? Number(params.get('seed')) >>> 0 : (Math.random() * 1e9) >>> 0;
    this.time = 0;
    this.sanity = 100;
    this.sanityDrainExtra = 0;
    this.power = 1;
    this.lmScale = LM_UNIFORMS.uLMScale.value;
    this.running = false;
    this.paused = true;
    this.levelIdx = 0;
    this.level = null;
    this.notesRead = 0;
    this.dynScale = 1;
    this.fpsAcc = 0;
    this.fpsFrames = 0;
    this.fpsGood = 0;
    this.flash = 0;
    this.damage = 0;
    this.fade = 1;
    this.fadeTarget = 1;
    this.glitch = 0;
    this.transitioning = false;
    this.objectives = [];
    this.battery = 1;
    this.st = { sanity: 100, stamina: 1, light: 1, power: 1, fear: 0, growl: null, nav: null };
    this.navOn = true;
    this.cctvT = 0;
    this.envs = [];
    this.startStats = { t0: 0 };
  }

  async init() {
    const s = this.settings;
    this.menu = new Menu(s, {
      play: (i) => this.startGame(i),
      resume: () => this.resume(),
      restart: () => this.loadLevel(this.levelIdx),
      quit: () => this.quitToMenu(),
      changed: (k) => this.settingChanged(k),
      testSound: () => {
        this.audio.init();
        this.audio.test();
      },
      uiClick: () => this.audio.ready && this.audio.click(),
    });
    this.menu.progress(0.1, 'Iniciando o WebGL…');
    await yieldFrame();
    try {
      this.renderer = new THREE.WebGLRenderer({
        canvas: this.canvas,
        antialias: false,
        powerPreference: 'high-performance',
        stencil: false,
      });
    } catch (e) {
      showError('Não foi possível iniciar o WebGL 2. Atualize o navegador (Chrome, Safari, Firefox ou Edge).');
      throw e;
    }
    const r = this.renderer;
    r.toneMapping = THREE.NoToneMapping;
    r.shadowMap.enabled = this.Q.shadows || this.Q.flashShadow;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    initTextures(r);
    this.pmrem = new THREE.PMREMGenerator(r);
    this.camera = new THREE.PerspectiveCamera(s.fov, 1, 0.05, 300);
    this.scene = new THREE.Scene();
    this.post = new Post(r, this.Q);
    this.post.setFilter(s.filter);
    this.input = new Input(this.canvas, s);
    this.audio = new AudioEngine();
    this.audio.volume = s.volume;
    this.audio.lowCost = s.mobile;
    this.hud = new HUD(this);
    this.hud.showFps(s.showFps);
    this.items = new Items(this);
    this.inventory = new Inventory(this);
    this.player = new Player(this);
    this.smilerURL = smilerTex().image.toDataURL();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 300));
    // Destrava o áudio no primeiro toque/tecla (exigência dos navegadores
    // móveis) e retoma o contexto se o sistema o suspender.
    const unlock = () => {
      if (!this.audio.ctx) this.audio.init();
      else if (this.audio.ctx.state !== 'running' && !this.paused) this.audio.ctx.resume();
    };
    for (const ev of ['pointerdown', 'touchend', 'keydown']) window.addEventListener(ev, unlock, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.running && !this.paused) this.pause();
    });
    this.menu.progress(1, 'Pronto.');
    this.menu.ready();
    this.last = performance.now();
    requestAnimationFrame((t) => this.frame(t));
    // atalhos de teste: ?level=0..4&autostart
    if (params.has('autostart')) this.startGame(Number(params.get('level') || 0));
  }

  // ------------------------------------------------------------ tela
  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const s = this.settings;
    document.getElementById('rotate').classList.toggle('hidden', !(s.mobile && h > w * 1.05));
    const dpr = window.devicePixelRatio || 1;
    const pr = Math.min(dpr, this.Q.maxDpr) * this.Q.scale * this.dynScale;
    this.pixelRatio = pr;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.post.setSize(w * pr, h * pr);
    this.camera.aspect = w / h;
    // em telas em pé, alarga o campo de visão horizontal
    this.camera.fov = s.fov * (w < h ? 1.25 : 1);
    this.camera.updateProjectionMatrix();
  }

  makeEnv(tex) {
    if (!this.Q.envMap) return null;
    const rt = this.pmrem.fromEquirectangular(tex);
    tex.dispose();
    this.envs.push(rt);
    return rt.texture;
  }

  // ------------------------------------------------------------ fluxo
  async startGame(idx) {
    this.audio.init();
    this.goFullscreen();
    this.notesRead = 0;
    this.sanity = 100;
    this.startStats.t0 = performance.now();
    await this.loadLevel(idx);
  }

  goFullscreen() {
    if (!this.settings.mobile) return;
    const el = document.documentElement;
    try {
      const p = el.requestFullscreen
        ? el.requestFullscreen({ navigationUI: 'hide' })
        : el.webkitRequestFullscreen && el.webkitRequestFullscreen();
      if (p && p.then)
        p.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {});
    } catch (e) {
      /* sem tela cheia */
    }
  }

  async loadLevel(idx) {
    this.running = false;
    this.transitioning = true;
    this.menu.hide();
    this.hud.show(false);
    this.input.enabled = false;
    this.input.reset();
    const info = LEVELS[idx];
    this.prevKey = this.levelInfo ? this.levelInfo.key : null;
    this.levelIdx = idx;
    this.levelInfo = info;
    this.hud.card(info);
    await yieldFrame();
    // descarta o nível anterior
    if (this.level) this.level.dispose();
    if (this.smilers) this.smilers.dispose();
    if (this.watcher) this.watcher.dispose();
    this.smilers = this.watcher = null;
    for (const e of this.envs) e.dispose();
    this.envs = [];
    this.items.clear();
    this.inventory.onLevel();
    this.hud.closeInventory();
    this.audio.stopAll();
    this.scene = new THREE.Scene();
    this.scene.add(this.player.flash, this.player.flash.target);
    this.power = 1;
    this.lmScale.set(1, 1, 1);
    this.hud.cardProgress(0.05, 'Gerando texturas…');
    await yieldFrame();
    let level;
    try {
      level = new LEVEL_CLASSES[info.key](this);
    } catch (e) {
      console.error(e);
      showError('Erro ao gerar o nível: ' + e.message);
      throw e;
    }
    this.level = level;
    if (params.has('pos') && params.has('autostart')) {
      const [x, z] = params.get('pos').split(',').map(Number);
      level.spawn.x = x;
      level.spawn.z = z;
    }
    if (params.has('yaw')) level.spawn.yaw = Number(params.get('yaw'));
    this.hud.cardProgress(0.25, 'Construindo o espaço…');
    try {
      await level.preload(level.spawn.x, level.spawn.z, (f) => this.hud.cardProgress(0.25 + f * 0.7));
    } catch (e) {
      console.error(e);
      showError('Erro ao construir o nível: ' + e.message);
      throw e;
    }
    this.applyLook(level.look);
    this.player.reset(level.spawn, level.groundY ? level.groundY(level.spawn.x, level.spawn.z) : 0);
    if (params.has('pitch')) this.player.pitch = Number(params.get('pitch'));
    this.player.flashOn = !!level.look.flashlight;
    this.player.flashLevel = this.player.flashOn ? 1 : 0;
    this.battery = 1;
    this.sanityDrainExtra = 0;
    this.objectives = (level.objectives || []).map((o) => ({ ...o, done: !!o.done }));
    this.hud.setObjectives(this.objectives, !!level.look.battery);
    this.player.frozen = false;
    if (level.look.smilers) this.smilers = new Smilers(this);
    if (level.look.watcher) this.watcher = new Watcher(this, level.look.watcher);
    // compila os shaders antes de mostrar
    this.player.update(0.016, this.input, level, this.settings);
    try {
      this.renderer.compile(this.scene, this.camera);
    } catch (e) {
      /* opcional */
    }
    this.post.render(this.scene, this.camera);
    this.hud.cardProgress(1, 'Pronto.');
    const vk = info.part || info.key;
    if (!(this.settings.visited || []).includes(vk)) {
      this.settings.visited = [...(this.settings.visited || []), vk];
      saveSettings(this.settings);
    }
    if (info.secret) {
      const found = this.settings.secrets || (this.settings.secretFound ? ['0.1'] : []);
      if (!found.includes(info.key)) {
        this.settings.secrets = [...found, info.key];
        this.settings.secretFound = true;
        saveSettings(this.settings);
      }
    } else if (!info.part && orderPos(info) > orderPos(LEVELS[this.settings.reached] || LEVELS[0])) {
      this.settings.reached = idx;
      saveSettings(this.settings);
    }
    this.audio.setLevel(level.look, level.exitEmitter ? level.exitEmitter() : null);
    this.hud.setLevel(info);
    await new Promise((r) => setTimeout(r, params.has('autostart') ? 50 : 900));
    this.hud.cardHide();
    this.hud.show(true);
    const first = this.currentObjective();
    const ot = (first ? first.text : info.objective).replace(/[.!?]?$/, '.');
    this.hud.objective(ot + ' ' + info.hint, 12);
    this.fade = params.has('autostart') ? 0 : 1;
    this.fadeTarget = 0;
    this.glitch = params.has('autostart') ? 0 : 0.6;
    this.transitioning = false;
    this.running = true;
    this.paused = false;
    this.input.enabled = true;
    if (!this.settings.mobile && !params.has('autostart')) this.input.lock();
  }

  applyLook(L) {
    const u = this.post.u;
    u.uExposure.value = L.exposure;
    u.uTint.value.setRGB(...L.tint);
    u.uSat.value = L.sat;
    u.uContrast.value = L.contrast;
    u.uLift.value.setRGB(...L.lift);
    u.uBloom.value = L.bloom;
    if (L.bloomThreshold !== undefined) this.post.preMat.uniforms.uThreshold.value = L.bloomThreshold;
    else this.post.preMat.uniforms.uThreshold.value = this.post.hdr ? 1.0 : 0.8;
    LM_UNIFORMS.uLightColor.value.setRGB(...L.lightColor);
    const fc = new THREE.Color().setRGB(...L.fog);
    if (this.level.indoor) {
      const far = this.Q.viewDist;
      this.scene.fog = new THREE.Fog(fc, far * L.fogNear, far);
      this.camera.far = far + 10;
    } else {
      this.camera.far = this.level.camFar || 2000;
    }
    if (!this.scene.background) this.scene.background = fc;
    this.camera.updateProjectionMatrix();
  }

  pause() {
    if (!this.running || this.transitioning) return;
    this.paused = true;
    this.input.enabled = false;
    this.input.unlock();
    this.input.reset();
    this.menu.setMode(true);
    this.menu.show();
    this.hud.show(false);
    if (this.audio.ctx) this.audio.ctx.suspend();
  }

  resume() {
    this.menu.hide();
    this.hud.show(true);
    this.paused = false;
    this.input.enabled = true;
    this.input.reset();
    if (this.audio.ctx) this.audio.ctx.resume();
    if (!this.settings.mobile) this.input.lock();
  }

  quitToMenu() {
    this.running = false;
    this.paused = true;
    if (this.audio.ctx) this.audio.ctx.resume();
    this.audio.stopAll();
    this.menu.setMode(false);
    this.menu.show();
    this.hud.show(false);
  }

  settingChanged(k) {
    const s = this.settings;
    saveSettings(s);
    if (k === 'filter') this.post.setFilter(s.filter);
    if (k === 'volume') this.audio.setVolume(s.volume);
    if (k === 'showFps') this.hud.showFps(s.showFps);
    if (k === 'fov') this.resize();
    if (k === 'dynamicRes' && !s.dynamicRes) {
      this.dynScale = 1;
      this.resize();
    }
    if (k === 'quality') {
      // nova qualidade: recria o pós-processamento e recarrega o nível
      this.Q = QUALITY[s.quality];
      this.post.dispose();
      this.post = new Post(this.renderer, this.Q);
      this.post.setFilter(s.filter);
      this.renderer.shadowMap.enabled = this.Q.shadows || this.Q.flashShadow;
      clearTextureCache();
      this.scene.remove(this.player.flash, this.player.flash.target);
      this.player.flash.dispose();
      this.player = new Player(this);
      this.dynScale = 1;
      this.resize();
      if (this.running) this.needsReload = true;
    }
  }

  // ------------------------------------------------------------ eventos do jogo
  addSanity(v) {
    this.sanity = clamp(this.sanity + v, 0, 100);
    if (v < -10) this.damage = Math.max(this.damage, 0.8);
  }

  vibrate(ms) {
    if (this.settings.mobile && navigator.vibrate) navigator.vibrate(ms);
  }

  // Uma entidade alcançou o jogador. opts: { image, text, sanity }
  caught(opts = {}) {
    this.hud.scare(opts.image || this.smilerURL);
    this.audio.scare();
    this.vibrate([200, 60, 300]);
    this.damage = 1;
    this.glitch = 1;
    this.addSanity(-(opts.sanity !== undefined ? opts.sanity : 45));
    this.hud.message(opts.text || 'Ele te pegou. Fique na luz.');
  }

  // ------------------------------------------------------------ objetivos
  currentObjective() {
    return (this.objectives || []).find((o) => !o.done) || null;
  }

  objectiveDone(id) {
    const o = (this.objectives || []).find((q) => q.id === id);
    return !!(o && o.done);
  }

  // Todos os objetivos concluídos (opcionalmente ignorando alguns ids).
  allObjectivesDone(except = []) {
    return (this.objectives || []).every((o) => o.done || except.includes(o.id));
  }

  // Marca um objetivo como concluído. Retorna false se já estava.
  completeObjective(id, msg) {
    const o = (this.objectives || []).find((q) => q.id === id);
    if (!o || o.done) return false;
    o.done = true;
    this.audio.objective();
    this.hud.setObjectives(this.objectives, !!(this.level && this.level.look.battery));
    const next = this.currentObjective();
    this.hud.message(msg || 'Concluído: ' + o.text, 4);
    if (next) setTimeout(() => this.running && this.hud.objective(next.text, 7), 1800);
    if (this.level && this.level.onObjective) this.level.onObjective(id);
    return true;
  }

  // Atualiza o texto de um objetivo (ex.: contador "2/3").
  setObjectiveText(id, text) {
    const o = (this.objectives || []).find((q) => q.id === id);
    if (!o) return;
    o.text = text;
    this.hud.setObjectives(this.objectives, !!(this.level && this.level.look.battery));
  }

  collapse() {
    if (this.transitioning) return;
    this.transitioning = true;
    this.player.frozen = true;
    this.fadeTarget = 1;
    this.audio.scare();
    this.hud.message('Você perdeu a noção de onde está…', 4);
    setTimeout(() => {
      const L = this.level;
      this.player.reset(L.spawn, L.groundY ? L.groundY(L.spawn.x, L.spawn.z) : 0);
      this.sanity = 60;
      this.player.frozen = false;
      this.fadeTarget = 0;
      this.transitioning = false;
      if (this.smilers) this.smilers.reset();
      if (L.onCollapse) L.onCollapse();
      this.hud.message('Você acordou de novo no mesmo lugar.', 4);
    }, 2600);
  }

  reachExit(kind = 'noclip', delay = 0.4) {
    if (this.transitioning) return;
    this.transitioning = true;
    this.player.frozen = true;
    this.input.enabled = false;
    if (kind === 'door') this.audio.door();
    setTimeout(() => {
      this.audio.transition();
      this.fadeTarget = 1;
      this.glitch = 1;
      this.vibrate(120);
    }, delay * 1000);
    setTimeout(
      () => {
        const next = this.nextLevelIndex();
        if (next >= 0) this.loadLevel(next);
      },
      delay * 1000 + 1700,
    );
  }

  // Próximo nível da sequência (pula os secretos; um secreto volta ao seu destino).
  nextLevelIndex() {
    const cur = LEVELS[this.levelIdx];
    const byKey = (k) => LEVELS.findIndex((l) => l.key === k);
    if (cur.next) return byKey(cur.next);
    if (cur.secret) return byKey(cur.returnTo);
    const pos = ORDER.indexOf(cur.key);
    return pos >= 0 && pos < ORDER.length - 1 ? byKey(ORDER[pos + 1]) : -1;
  }

  // Entra num nível específico pela chave (portas secretas).
  enterLevel(key, kind = 'door', delay = 0.6) {
    const idx = LEVELS.findIndex((l) => l.key === key);
    if (idx < 0 || this.transitioning) return;
    this.transitioning = true;
    this.player.frozen = true;
    this.input.enabled = false;
    if (kind === 'door') this.audio.door();
    setTimeout(() => {
      this.audio.transition();
      this.fadeTarget = 1;
      this.glitch = 0.5;
    }, delay * 1000);
    setTimeout(() => this.loadLevel(idx), delay * 1000 + 1700);
  }

  // Final do jogo. opts: { title, text }
  finish(opts = {}) {
    if (this.transitioning) return;
    this.transitioning = true;
    this.player.frozen = true;
    this.input.enabled = false;
    this.input.unlock();
    this.post.u.uFadeColor.value.setRGB(1, 1, 1);
    this.fadeTarget = 1;
    this.audio.stopAll();
    this.settings.reached = LEVELS.findIndex((l) => l.key === ORDER[ORDER.length - 1]);
    saveSettings(this.settings);
    const mins = Math.round((performance.now() - this.startStats.t0) / 60000);
    setTimeout(() => {
      this.running = false;
      this.hud.show(false);
      this.hud.ending(
        opts.title || 'Você chegou.',
        opts.text ||
          'Uma voz cansada, parecida com a sua, diz: “Você ainda está aí? Fique onde está. Estamos indo te buscar.” Depois, só o silêncio.',
        `Tempo: ~${mins} min · Bilhetes lidos: ${this.notesRead}`,
        () => {
          this.post.u.uFadeColor.value.setRGB(0, 0, 0);
          this.transitioning = false;
          this.quitToMenu();
        },
      );
    }, 2600);
  }

  // ------------------------------------------------------------ laço
  frame(t) {
    requestAnimationFrame((tt) => this.frame(tt));
    const dt = Math.min(0.05, Math.max(0.0001, (t - this.last) / 1000));
    this.last = t;
    if (this.needsReload && !this.transitioning) {
      this.needsReload = false;
      this.loadLevel(this.levelIdx);
      return;
    }
    if (!this.running || !this.level) return;
    if (this.hud.dialogOpen) {
      this.hud.dialogKeys(this.input);
      if (this.level && this.level.dialogTick) this.level.dialogTick(dt, this.player);
    } else if (this.hud.invOpen) this.hud.invKeys(this.input);
    else if (!this.paused && !this.hud.noteOpen) this.update(dt);
    else if (this.hud.noteOpen && (this.input.pressed('interact') || this.input.pressed('menu'))) this.hud.closeNote();
    this.render(dt);
    this.measure(dt);
    this.input.endFrame();
  }

  update(dt) {
    const s = this.settings;
    const inp = this.input;
    const L = this.level;
    const P = this.player;
    this.time += dt;
    if (inp.pressed('menu') || inp.pressed('unlock')) {
      this.pause();
      return;
    }
    if (inp.pressed('flashlight')) {
      if (!P.flashOn && L.look.battery && this.battery <= 0) this.hud.message('A lanterna está sem pilha.', 2);
      else P.toggleFlash();
    }
    if (inp.pressed('filter')) {
      const i = FILTERS.findIndex((f) => f.id === s.filter);
      s.filter = FILTERS[(i + 1) % FILTERS.length].id;
      this.post.setFilter(s.filter);
      saveSettings(s);
      this.hud.message('Filtro: ' + FILTERS[(i + 1) % FILTERS.length].label, 2);
    }
    if (inp.pressed('nav')) {
      s.navHelp = !s.navHelp;
      saveSettings(s);
      this.hud.message(s.navHelp ? 'Bússola de intuição ligada' : 'Bússola de intuição desligada', 2);
    }
    if (inp.pressed('hud')) document.getElementById('hud').classList.toggle('hidden');
    if (inp.pressed('inventory')) {
      this.hud.openInventory();
      return;
    }
    if (inp.pressed('fullscreen')) {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
    }

    const st = this.st;
    st.growl = null;
    st.fear = 0;
    // tempo sobrevivido (moeda da loja do Nível 37)
    s.survival = (s.survival || 0) + dt;
    this.saveT = (this.saveT || 0) + dt;
    if (this.saveT > 15) {
      this.saveT = 0;
      saveSettings(s);
    }
    this.inventory.update(dt);
    P.update(dt, inp, L, s);
    L.update(dt, P);
    // bateria da lanterna (níveis com look.battery = consumo por segundo)
    if (L.look.battery && P.flashOn) {
      this.battery = Math.max(0, this.battery - L.look.battery * dt * (this.batteryMul || 1));
      if (this.battery <= 0) {
        P.flashOn = false;
        this.hud.message('A pilha da lanterna acabou.', 3);
        this.audio.click();
      }
    }
    if (this.smilers) this.smilers.update(dt, P, L, st);
    if (this.watcher) this.watcher.update(dt, P, L);

    // interação
    let act = null;
    if (!this.transitioning) {
      const ex = L.interactable ? L.interactable(P) : null;
      if (ex) act = { label: ex.label, fn: ex.action };
      else {
        const it = this.items.nearest(P);
        if (it) act = { label: this.items.label(it), fn: () => this.items.use(it) };
      }
    }
    this.hud.prompt(act ? act.label : null);
    if (inp.pressed('interact') && act) act.fn();

    // sanidade
    const light = L.lightLevel ? L.lightLevel(P.pos.x, P.pos.z) * this.power : 1;
    const darkK = L.indoor ? 1 + Math.max(0, 0.45 - light) * 2.2 : 1;
    const drain = ((L.look.sanityDrain || 0.1) * darkK + this.sanityDrainExtra) * (this.drainMul || 1) + (L.sanityExtra || 0);
    if (!this.transitioning) this.sanity = Math.min(100, this.sanity - drain * dt);
    if (this.sanity <= 0) {
      this.sanity = 0;
      this.collapse();
    }

    // bússola de intuição
    st.nav = null;
    const target = L.navTarget ? L.navTarget() : L.exit;
    if (s.navHelp && target) {
      const dx = target.x - P.pos.x;
      const dz = target.z - P.pos.z;
      const fx = -Math.sin(P.yaw);
      const fz = -Math.cos(P.yaw);
      const rx = Math.cos(P.yaw);
      const rz = -Math.sin(P.yaw);
      const ang = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
      st.nav = { angle: (ang * 180) / Math.PI, dist: Math.hypot(dx, dz) };
    }
    st.sanity = this.sanity;
    st.stamina = P.stamina;
    st.light = light;
    st.power = this.power;
    st.battery = L.look.battery ? this.battery : null;
    this.audio.update(dt, this.camera, st);
    this.hud.update(dt, st);
    if (!this.radar) this.radar = new Radar(this);
    this.radar.update(dt);
  }

  render(dt) {
    const u = this.post.u;
    const s = this.settings;
    this.fade = damp(this.fade, this.fadeTarget, this.fadeTarget > this.fade ? 2.2 : 1.4, dt);
    this.damage = Math.max(0, this.damage - dt * 0.8);
    this.glitch = Math.max(0, this.glitch - dt * 0.7);
    const ins = clamp((45 - this.sanity) / 45, 0, 1);
    u.uTime.value = this.time;
    u.uStrength.value = s.filterStrength;
    u.uGrain.value = s.grain;
    u.uVignette.value = s.vignette;
    u.uInsane.value = ins;
    u.uPulse.value = Math.pow(Math.max(0, Math.sin(this.time * 7.5)), 8);
    u.uFade.value = this.fade;
    u.uDamage.value = this.damage;
    u.uGlitch.value = this.glitch;
    u.uBlur.value = (this.level && this.level.blur) || 0;
    this.hud.camOverlay(s.filter, this.time);
    // CCTV: a cena é atualizada só ~10 vezes por segundo
    let draw = true;
    if (s.filter === 'cctv') {
      this.cctvT += dt;
      draw = this.cctvT >= 0.1;
      if (draw) this.cctvT = 0;
    }
    this.post.render(this.scene, this.camera, draw);
  }

  // FPS e resolução dinâmica.
  measure(dt) {
    this.fpsAcc += dt;
    this.fpsFrames++;
    if (this.fpsAcc < 1) return;
    const fps = Math.round(this.fpsFrames / this.fpsAcc);
    this.fpsAcc = 0;
    this.fpsFrames = 0;
    if (this.settings.showFps) this.hud.setFps(fps, this.pixelRatio);
    if (!this.settings.dynamicRes || this.paused) return;
    if (fps < 45 && this.dynScale > 0.5) {
      this.dynScale = Math.max(0.5, this.dynScale - 0.1);
      this.fpsGood = 0;
      this.resize();
    } else if (fps >= 58) {
      this.fpsGood++;
      if (this.fpsGood >= 4 && this.dynScale < 1) {
        this.dynScale = Math.min(1, this.dynScale + 0.05);
        this.fpsGood = 0;
        this.resize();
      }
    } else this.fpsGood = 0;
  }
}

const game = new Game();
window.game = game;
window.addEventListener('error', (e) => showError('Erro: ' + (e.message || e)));
game.init().catch((e) => {
  console.error(e);
  showError('Falha ao iniciar: ' + e.message);
});

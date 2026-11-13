// Ferrugem: survival horror em terceira pessoa em três capítulos. Orquestra renderização,
// estados do jogo (título, cartões de capítulo, jogo, cenas, pausa, mochila, documento,
// mapa, morte, vitória), carregamento de capítulos, checkpoints e o laço principal.
import * as THREE from 'three';
import { loadSettings, saveSettings, QUALITY, DIFFICULTY, loadSave, writeSave, clearSave, loadProgress, unlockChapter } from './config.js';
import { tex, setAnisotropy, WORLD_TEXTURES } from './textures.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { Collision } from './collision.js';
import { NavGrid } from './nav.js';
import { Effects } from './effects.js';
import { World } from './world.js';
import { Level } from './level.js';
import { Player } from './player.js';
import { EnemyManager } from './enemies.js';
import './infected.js';
import './bosses.js';
import { Projectiles } from './projectiles.js';
import { UI } from './ui.js';
import { NPCManager } from './npc.js';
import { Cutscene } from './cutscene.js';
import { Helicopter } from './heli.js';
import { CHAPTERS, CHAPTER_COUNT } from './chapters/index.js';
import { CHAPTER_TEXT, CHAPTER_END } from './story.js';
import { newLoadout } from './weapons.js';
import { nextFrame, clamp } from './util.js';

const newStats = () => ({ time: 0, shots: 0, hits: 0, kills: 0, heads: 0, deaths: 0, damage: 0 });
const _size = new THREE.Vector2();

// Equipamento padrão para quem começa direto num capítulo pelo menu.
function chapterLoadout(id) {
  const L = newLoadout();
  if (id >= 2) {
    L.weapons.shotgun = { owned: true, mag: 6 };
    L.ammo.pistol = 40;
    L.ammo.shotgun = 10;
    L.items.tonic = 2;
    L.items.grenade = 1;
  }
  if (id >= 3) {
    L.weapons.smg = { owned: true, mag: 30 };
    L.weapons.magnum = { owned: true, mag: 6 };
    L.weapons.rifle = { owned: true, mag: 5 };
    L.ammo.smg = 60;
    L.ammo.magnum = 6;
    L.ammo.rifle = 8;
    L.items.medkit = 1;
    L.items.molotov = 2;
  }
  return L;
}

class Game {
  constructor(hotData) {
    const settings = loadSettings();
    this.G = {
      game: this,
      settings,
      quality: QUALITY[settings.quality],
      diff: DIFFICULTY[settings.difficulty],
      diffKey: settings.difficulty,
      time: 0,
      state: 'loading',
      stats: newStats(),
      chapter: null,
    };
    this.timers = [];
    this.timeScale = 1;
    this.checkpointData = hotData && hotData.save ? hotData.save : null;
    this.ignoreMenuUntil = 0;
    this.frames = 0;
    this.acc = 0;
    this.fps = 0;
    this.errors = 0;
    this.titleT = 0;
    this.busy = false;
    this.loop = this.loop.bind(this);
  }

  fail(text) {
    const t = document.getElementById('load-text');
    if (t) t.textContent = text;
    window.__ferrugemReady = true;
  }

  async init() {
    const G = this.G;
    const canvas = document.getElementById('view');
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: G.settings.quality !== 'baixa', powerPreference: 'high-performance' });
    } catch (e) {
      this.fail('Não foi possível iniciar o WebGL 2 neste navegador. Tente o Chrome, Edge, Firefox ou Safari atualizados.');
      return;
    }
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.3;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = G.quality.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    G.renderer = renderer;
    setAnisotropy(renderer.capabilities.getMaxAnisotropy());
    G.scene = new THREE.Scene();
    G.camera = new THREE.PerspectiveCamera(62, window.innerWidth / Math.max(1, window.innerHeight), 0.08, 420);
    G.audio = new AudioEngine(G.settings);
    G.input = new Input(canvas, G.settings);
    G.ui = new UI(G);
    G.onEnemyDeath = (e) => this.onEnemyDeath(e);

    G.ui.loading(0.04, 'Gerando texturas…');
    await nextFrame();
    for (let i = 0; i < WORLD_TEXTURES.length; i++) {
      tex(WORLD_TEXTURES[i]);
      if (i % 3 === 2) {
        G.ui.loading(0.04 + (0.3 * i) / WORLD_TEXTURES.length);
        await nextFrame();
      }
    }
    G.col = new Collision();
    G.fx = new Effects(G);
    G.world = new World(G);
    G.player = new Player(G);
    G.enemies = new EnemyManager(G);
    G.proj = new Projectiles(G);
    G.level = new Level(G);
    G.npcs = new NPCManager(G);
    G.cutscene = new Cutscene(G);
    G.heli = new Helicopter(G);
    await this.loadChapter(1, true);
    this.applyQuality(true);
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 250));
    G.input.onUnlock = () => {
      if (G.state === 'play') this.pause();
    };
    G.input.onTouchDetected = () => {
      G.ui.setTouch(true);
      if (G.state === 'play') G.ui.setHud(true);
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        if (G.state === 'play') this.pause();
        G.audio.suspend();
      } else G.audio.resume();
    });
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      G.ui.show('s-loading');
      G.ui.loading(0, 'A placa de vídeo reiniciou. Recarregue a página para continuar.');
      G.state = 'loading';
    });
    this.toTitle();
    window.__ferrugemReady = true;
    window.__ferrugem = G;
    this.last = performance.now();
    requestAnimationFrame(this.loop);
  }

  // ------------------------------------------------------------------ capítulos
  async loadChapter(id, initial = false) {
    const G = this.G;
    const ch = CHAPTERS[id];
    if (!ch) throw new Error('Capítulo inexistente: ' + id);
    const prevState = G.state;
    G.state = 'loading';
    G.ui.setHud(false);
    G.ui.show('s-loading');
    G.ui.loading(initial ? 0.4 : 0.1, `${ch.name}: ${ch.title}…`);
    await nextFrame();
    this.timers = [];
    this.timeScale = 1;
    G.enemies.clear();
    G.proj.clear();
    G.fx.clear();
    if (G.npcs) G.npcs.clear();
    if (G.cutscene) G.cutscene.stop();
    if (G.heli) G.heli.reset();
    G.col = new Collision();
    G.col.groundFn = ch.groundY ? (x, z) => ch.groundY(x, z, G) : null;
    G.chapter = ch;
    G.world.load(ch);
    G.ui.loading(initial ? 0.7 : 0.6, 'Preparando o caminho dos infectados…');
    await nextFrame();
    const b = ch.bounds;
    G.nav = new NavGrid(b.minX, b.minZ, b.maxX, b.maxZ, 1);
    G.level.setChapter(ch);
    G.level.load(G.level.newState());
    G.ui.loading(0.92, 'Acendendo as luzes…');
    await nextFrame();
    if (!initial) this.applyQuality(true);
    try {
      G.renderer.compile(G.scene, G.camera);
    } catch (e) {
      /* compilação antecipada é opcional */
    }
    this.chapterId = id;
    if (prevState !== 'loading') G.state = prevState;
  }

  // ------------------------------------------------------------------ qualidade e tela
  applyQuality(initial = false) {
    const G = this.G;
    const q = QUALITY[G.settings.quality] || QUALITY.media;
    G.quality = q;
    this.maxPR = Math.min(window.devicePixelRatio || 1, q.pixelRatio);
    this.pr = this.maxPR;
    G.renderer.setPixelRatio(this.pr);
    const shadowsChanged = G.renderer.shadowMap.enabled !== q.shadows;
    G.renderer.shadowMap.enabled = q.shadows;
    G.world.moonLight.castShadow = q.shadows;
    G.player.flash.castShadow = q.shadows && G.settings.quality === 'alta';
    G.world.setShadowQuality(q);
    G.fx.setQuality(q);
    if (shadowsChanged && !initial) {
      G.scene.traverse((o) => {
        if (!o.material) return;
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.needsUpdate = true;
      });
    }
    if (!initial) this.resize();
  }

  applySettings() {
    const G = this.G;
    saveSettings(G.settings);
    G.audio.setVolume(G.settings.volume);
    G.audio.setMusic(G.settings.music);
    if (QUALITY[G.settings.quality] !== G.quality) this.applyQuality();
  }

  resize() {
    const G = this.G;
    const w = Math.max(1, window.innerWidth),
      h = Math.max(1, window.innerHeight);
    G.renderer.setSize(w, h, false);
    G.camera.aspect = w / h;
    G.camera.updateProjectionMatrix();
    this.updateParticleScale();
  }

  updateParticleScale() {
    const G = this.G;
    G.renderer.getDrawingBufferSize(_size);
    G.fx.setScale(_size.y / (2 * Math.tan(THREE.MathUtils.degToRad(G.camera.fov) / 2)));
  }

  // ------------------------------------------------------------------ fluxo do jogo
  hasSave() {
    return !!(this.checkpointData || loadSave());
  }

  savedData() {
    const d = this.checkpointData || (loadSave() || {}).cp || null;
    if (d && !d.chapter) d.chapter = 1;
    return d;
  }

  toTitle() {
    const G = this.G;
    G.state = 'title';
    this.timers = [];
    this.timeScale = 1;
    G.input.setEnabled(false);
    G.input.unlock();
    G.enemies.clear();
    G.proj.clear();
    G.fx.clear();
    if (G.npcs) G.npcs.clear();
    if (G.cutscene) G.cutscene.stop();
    G.ui.clearMsgs();
    G.ui.prompt(null);
    G.ui.setHud(false);
    G.ui.fade(false);
    G.level.load(G.level.newState());
    G.player.reset();
    G.player.rig.root.visible = false;
    G.player.flash.intensity = 0;
    G.player.flashOn = false;
    G.player.fill.intensity = 0;
    G.player.laser.visible = G.player.dot.visible = false;
    G.audio.paused = false;
    if (G.chapter.titleGroup) G.enemies.spawnGroup(G.chapter.titleGroup, 0);
    if (G.chapter.titleScene) G.chapter.titleScene(G.level);
    this.titleT = 0;
    G.ui.showTitle(this.hasSave(), loadProgress().unlocked);
  }

  // Aplica um checkpoint do capítulo já carregado.
  applyCheckpoint(snap, keepCounters = false) {
    const G = this.G;
    this.timers = [];
    this.timeScale = 1;
    G.enemies.clear();
    G.proj.clear();
    G.fx.clear();
    if (G.npcs) G.npcs.clear();
    if (G.cutscene) G.cutscene.stop();
    G.ui.clearMsgs();
    G.ui.prompt(null);
    const diffKey = snap.diff && DIFFICULTY[snap.diff] ? snap.diff : G.settings.difficulty;
    G.diffKey = diffKey;
    G.diff = DIFFICULTY[diffKey];
    G.level.load(snap);
    G.player.restore(snap.player, snap.pos);
    G.player.rig.root.visible = true;
    G.player.flash.intensity = 40;
    G.player.flashOn = true;
    G.player.fill.intensity = 6;
    const prev = G.stats;
    G.stats = { ...newStats(), ...snap.stats };
    if (keepCounters) {
      G.stats.time = prev.time;
      G.stats.deaths = prev.deaths;
    }
    if (G.chapter.onCheckpointLoad) G.chapter.onCheckpointLoad(G.level, snap.cp);
    this.checkpointData = snap;
  }

  async loadCheckpoint(snap, keepCounters = false) {
    const ch = snap.chapter || 1;
    if (ch !== this.chapterId) await this.loadChapter(ch);
    this.applyCheckpoint(snap, keepCounters);
  }

  saveCheckpoint(snap) {
    snap.diff = this.G.diffKey;
    snap.chapter = snap.chapter || this.chapterId;
    this.checkpointData = snap;
    writeSave({ cp: snap });
    unlockChapter(snap.chapter);
  }

  // Monta o estado inicial de um capítulo com o equipamento do jogador.
  startState(id, playerData, stats) {
    const G = this.G;
    const ch = CHAPTERS[id];
    const st = G.level.newState();
    st.chapter = id;
    const cp = ch.checkpoints[ch.firstCheckpoint];
    return { ...st, player: playerData, stats: stats || newStats(), pos: { x: cp.x, z: cp.z, yaw: cp.yaw }, diff: G.diffKey };
  }

  async newGame(diffKey) {
    if (this.busy) return;
    this.busy = true;
    try {
      const G = this.G;
      G.settings.difficulty = diffKey;
      saveSettings(G.settings);
      clearSave();
      G.diffKey = diffKey;
      G.diff = DIFFICULTY[diffKey];
      G.stats = newStats();
      if (this.chapterId !== 1) await this.loadChapter(1);
      G.player.reset();
      const pdata = G.player.serialize();
      pdata.hp = 100;
      const snap = this.startState(1, pdata, newStats());
      this.applyCheckpoint(snap);
      this.saveCheckpoint(JSON.parse(JSON.stringify(snap)));
      this.chapterIntro(1, true);
    } finally {
      this.busy = false;
    }
  }

  // Cartão do capítulo + texto; depois o jogo começa.
  chapterIntro(id, firstTime) {
    const G = this.G;
    G.player.rig.root.visible = false;
    G.state = 'intro';
    G.ui.setHud(false);
    G.audio.init();
    const t = CHAPTER_TEXT[id];
    G.ui.playIntro(t.lines, t.tag, t.title, () => {
      G.player.rig.root.visible = true;
      if (G.chapter.onStart && !G.level.flags.started) {
        G.level.flags.started = true;
        const handled = G.chapter.onStart(G.level);
        if (handled) return;
      }
      this.startPlay(true);
      if (firstTime && id === 1) {
        const tip = G.input.touchMode
          ? 'Joystick para andar. Mirar liga a mira; Atirar dispara. Ação interage e chuta.'
          : 'Botão direito mira, botão esquerdo atira. E para pegar, ler e chutar. Tab abre a mochila.';
        G.ui.msg(tip);
      }
    });
  }

  // Começa um capítulo pelo menu, com equipamento padrão.
  async startChapterFresh(id, diffKey) {
    if (this.busy) return;
    this.busy = true;
    try {
      const G = this.G;
      if (diffKey) {
        G.diffKey = diffKey;
        G.diff = DIFFICULTY[diffKey];
      }
      if (this.chapterId !== id) await this.loadChapter(id);
      G.player.reset();
      const pdata = G.player.serialize();
      Object.assign(pdata, chapterLoadout(id));
      pdata.hp = 100;
      const snap = this.startState(id, pdata, newStats());
      this.applyCheckpoint(snap);
      this.saveCheckpoint(JSON.parse(JSON.stringify(snap)));
      this.chapterIntro(id, true);
    } finally {
      this.busy = false;
    }
  }

  // Fim de capítulo: texto de encerramento e o próximo capítulo com o mesmo equipamento.
  completeChapter() {
    const G = this.G;
    if (G.state !== 'play' && G.state !== 'cutscene') return;
    const id = this.chapterId;
    if (id >= CHAPTER_COUNT || !CHAPTERS[id + 1]) {
      this.victory();
      return;
    }
    G.state = 'chapterEnd';
    G.input.setEnabled(false);
    G.input.unlock();
    G.audio.paused = true;
    G.ui.prompt(null);
    G.ui.setHud(false);
    const pdata = G.player.serialize();
    pdata.hp = Math.max(pdata.hp, 60);
    pdata.keys = {};
    const stats = { ...G.stats };
    unlockChapter(id + 1);
    G.ui.showChapterEnd(CHAPTER_END[id] || [], CHAPTER_TEXT[id], async () => {
      if (this.busy) return;
      this.busy = true;
      try {
        await this.loadChapter(id + 1);
        const snap = this.startState(id + 1, pdata, stats);
        this.applyCheckpoint(snap);
        this.saveCheckpoint(JSON.parse(JSON.stringify(snap)));
        this.chapterIntro(id + 1, true);
      } finally {
        this.busy = false;
      }
    });
  }

  async continueSaved() {
    if (this.busy) return;
    const data = this.savedData();
    if (!data) return this.G.ui.showNewGame();
    this.busy = true;
    try {
      await this.loadCheckpoint(JSON.parse(JSON.stringify(data)));
      this.startPlay(true);
    } finally {
      this.busy = false;
    }
  }

  startPlay(gesture) {
    const G = this.G;
    G.state = 'play';
    G.ui.hideScreens();
    G.ui.setHud(true);
    G.ui.fade(false);
    G.input.setEnabled(true);
    G.input.pressedSet.clear();
    if (gesture && !G.input.touchMode) G.input.lock();
    G.audio.init();
    G.audio.paused = false;
    this.ignoreMenuUntil = performance.now() + 400;
    this.last = performance.now();
  }

  // Cenas: o jogador perde o controle até a cena terminar.
  enterCutscene() {
    const G = this.G;
    G.state = 'cutscene';
    G.input.setEnabled(false);
    G.ui.prompt(null);
    G.ui.setHud(false);
    G.player.laser.visible = G.player.dot.visible = false;
    G.player.cine = G.player.cine || {};
  }

  leaveCutscene() {
    const G = this.G;
    if (G.state !== 'cutscene') return;
    this.startPlay(false);
  }

  pause() {
    const G = this.G;
    if (G.state !== 'play') return;
    G.state = 'pause';
    G.input.setEnabled(false);
    G.input.unlock();
    G.audio.paused = true;
    G.ui.prompt(null);
    G.ui.showPause();
  }

  resume() {
    const G = this.G;
    if (G.state === 'play') return;
    this.startPlay(true);
  }

  openInventory() {
    const G = this.G;
    if (G.state !== 'play' && G.state !== 'pause') return;
    G.state = 'inventory';
    G.input.setEnabled(false);
    G.input.unlock();
    G.audio.paused = true;
    G.ui.prompt(null);
    G.ui.showInventory();
  }

  openMap() {
    const G = this.G;
    if (G.state !== 'play' && G.state !== 'pause') return;
    G.state = 'map';
    G.input.setEnabled(false);
    G.input.unlock();
    G.ui.prompt(null);
    G.ui.showMap();
  }

  openNote(id) {
    const G = this.G;
    G.state = 'note';
    G.input.setEnabled(false);
    G.input.unlock();
    G.ui.prompt(null);
    G.audio.ui('select');
    G.ui.openNote(id);
  }

  closeOverlay() {
    this.startPlay(true);
  }

  async retryCheckpoint() {
    if (this.busy) return;
    const G = this.G;
    const data = this.checkpointData;
    if (!data) return this.newGame(G.diffKey);
    this.busy = true;
    try {
      await this.loadCheckpoint(JSON.parse(JSON.stringify(data)), true);
      this.startPlay(true);
    } finally {
      this.busy = false;
    }
  }

  quitToTitle() {
    this.toTitle();
  }

  onPlayerDeath() {
    const G = this.G;
    if (G.state !== 'play') return;
    G.state = 'dead';
    G.stats.deaths++;
    G.input.setEnabled(false);
    G.input.unlock();
    G.audio.paused = true;
    G.ui.prompt(null);
    G.ui.setHud(false);
    G.ui.showDeath();
  }

  onEnemyDeath(e) {
    const G = this.G;
    if (!e.isBoss) return;
    if (G.chapter.onBossDeath) G.chapter.onBossDeath(G.level, e);
  }

  slowMo(scale, realSeconds) {
    this.timeScale = scale;
    this.after(realSeconds, () => (this.timeScale = 1), true);
  }

  victory() {
    const G = this.G;
    if (G.state !== 'play' && G.state !== 'cutscene') return;
    G.ui.fade(true);
    G.state = 'cutscene';
    this.after(
      1.2,
      () => {
        G.state = 'win';
        G.input.setEnabled(false);
        G.input.unlock();
        G.audio.paused = true;
        G.ui.setHud(false);
        G.ui.fade(false);
        clearSave();
        this.checkpointData = null;
        G.ui.showVictory(G.stats, G.diffKey);
      },
      true,
    );
  }

  after(sec, fn, real = false) {
    this.timers.push({ t: sec, fn, real });
  }

  runTimers(dt, gdt) {
    if (!this.timers.length) return;
    const due = [];
    for (const t of this.timers) {
      t.t -= t.real ? dt : gdt;
      if (t.t <= 0) due.push(t);
    }
    if (!due.length) return;
    this.timers = this.timers.filter((t) => t.t > 0);
    for (const t of due) t.fn();
  }

  // ------------------------------------------------------------------ laço
  loop(now) {
    requestAnimationFrame(this.loop);
    const raw = (now - this.last) / 1000;
    this.last = now;
    const dt = clamp(raw, 0, 0.05);
    this.perf(raw);
    try {
      this.frame(dt);
    } catch (err) {
      this.errors++;
      console.error(err);
      if (this.errors < 4 && this.G.ui) this.G.ui.msg('Erro: ' + (err && err.message));
    }
    if (this.G.input) this.G.input.endFrame();
  }

  perf(raw) {
    if (raw > 0.25 || raw <= 0) return;
    this.frames++;
    this.acc += raw;
    if (this.acc < 1) return;
    this.fps = Math.round(this.frames / this.acc);
    const avg = this.acc / this.frames;
    this.frames = 0;
    this.acc = 0;
    const G = this.G;
    if (!G.settings.dynRes || G.state !== 'play') return;
    if (avg > 1 / 40 && this.pr > 0.55) {
      this.pr = Math.max(0.55, this.pr - 0.1);
      G.renderer.setPixelRatio(this.pr);
      this.resize();
    } else if (avg < 1 / 57 && this.pr < this.maxPR - 0.01) {
      this.pr = Math.min(this.maxPR, this.pr + 0.05);
      G.renderer.setPixelRatio(this.pr);
      this.resize();
    }
  }

  frame(dt) {
    const G = this.G;
    if (G.state === 'loading') return;
    if (G.state === 'play') {
      const gdt = dt * this.timeScale;
      G.stats.time += dt;
      const ok = performance.now() > this.ignoreMenuUntil;
      if (G.input.pressed('menu') && ok) this.pause();
      else if (G.input.pressed('inv') && ok) this.openInventory();
      else if (G.input.pressed('map') && ok) this.openMap();
      if (G.state === 'play') {
        G.time += gdt;
        this.step(gdt);
        this.runTimers(dt, gdt);
      }
      if (G.ui) G.ui.update(dt, this.fps);
    } else if (G.state === 'cutscene') {
      const gdt = dt * this.timeScale;
      G.time += gdt;
      this.cutsceneStep(gdt);
      this.runTimers(dt, gdt);
      G.ui.update(dt, this.fps);
    } else if (G.state === 'title') {
      this.titleStep(dt);
    } else if (G.state === 'dead' || G.state === 'win' || G.state === 'chapterEnd') {
      G.time += dt * 0.5;
      G.world.update(dt * 0.5, G.camera, G.player.pos.x, G.player.pos.z);
      G.fx.update(dt * 0.5, G.player.pos.x, G.player.pos.z);
      this.runTimers(dt, 0);
      G.audio.update(dt, 0, false, 1, false);
    } else {
      // pausa, mochila, mapa, documento: cena congelada
      G.audio.update(dt, 0, false, 1, false);
    }
    this.updateParticleScale();
    G.renderer.render(G.scene, G.camera);
  }

  step(dt) {
    const G = this.G,
      P = G.player;
    P.update(dt);
    if (G.npcs) G.npcs.update(dt);
    G.enemies.update(dt);
    G.proj.update(dt);
    G.level.update(dt);
    if (G.heli) G.heli.update(dt);
    G.world.update(dt, G.camera, P.pos.x, P.pos.z);
    G.fx.update(dt, P.pos.x, P.pos.z);
    G.audio.indoor += ((G.world.isIndoor(P.pos.x, P.pos.z) ? 1 : 0) - G.audio.indoor) * Math.min(1, dt * 3);
    const B = G.enemies.boss;
    const bossOn = !!(B && B.alive && B.state !== 'dormant');
    G.audio.update(dt, G.enemies.intensity(), bossOn, P.hp / P.maxHp, true);
  }

  // Durante as cenas o mundo continua vivo, mas o jogador não controla nada.
  cutsceneStep(dt) {
    const G = this.G,
      P = G.player;
    if (G.cutscene) G.cutscene.update(dt);
    P.cinematic(dt);
    if (G.npcs) G.npcs.update(dt);
    G.enemies.update(dt);
    G.proj.update(dt);
    G.level.update(dt);
    if (G.heli) G.heli.update(dt);
    const cx = G.camera.position.x,
      cz = G.camera.position.z;
    G.world.update(dt, G.camera, P.pos.x, P.pos.z);
    G.fx.update(dt, P.pos.x, P.pos.z);
    G.audio.setListener(cx, cz, G.cutscene ? G.cutscene.listenerYaw() : 0);
    G.audio.update(dt, 0.1, false, P.hp / P.maxHp, true);
  }

  titleStep(dt) {
    const G = this.G,
      cam = G.camera;
    G.time += dt;
    this.titleT += dt;
    if (Math.abs(cam.fov - 55) > 0.01) {
      cam.fov = 55;
      cam.updateProjectionMatrix();
    }
    const ch = G.chapter;
    let focus = { x: 0, z: 0, yaw: 0 };
    if (ch.titleCam) focus = ch.titleCam(this.titleT, cam);
    else {
      const s = ch.start;
      const a = this.titleT * 0.04;
      cam.position.set(s.x + Math.sin(a) * 10, 3, s.z + Math.cos(a) * 10);
      cam.lookAt(s.x, 1.5, s.z);
      focus = { x: s.x, z: s.z, yaw: a + Math.PI };
    }
    if (G.npcs) G.npcs.update(dt);
    G.enemies.update(dt);
    G.level.update(dt);
    if (G.heli) G.heli.update(dt);
    G.world.update(dt, cam, focus.x, focus.z);
    G.fx.update(dt, focus.x, focus.z);
    G.audio.setListener(cam.position.x, cam.position.z, focus.yaw);
    G.audio.update(dt, 0, false, 1, false);
  }
}

function boot(data) {
  const game = new Game(data || {});
  game.init().catch((e) => {
    console.error(e);
    game.fail('Erro ao iniciar o jogo: ' + (e && e.message ? e.message : e));
  });
  const hot = window.claude && window.claude.hot;
  if (hot && typeof hot.snapshot === 'function') {
    try {
      hot.snapshot(() => ({ save: game.checkpointData }));
    } catch (e) {
      /* recarga a quente indisponível */
    }
  }
}

const hot = window.claude && window.claude.hot;
if (hot && typeof hot.ready === 'function') hot.ready(boot);
else boot((hot && hot.data) || {});

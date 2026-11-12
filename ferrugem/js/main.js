// Ferrugem: survival horror em terceira pessoa. Orquestra renderização, estados do jogo
// (título, introdução, jogo, pausa, mochila, documento, morte, vitória), checkpoints e o laço.
import * as THREE from 'three';
import { loadSettings, saveSettings, QUALITY, DIFFICULTY, loadSave, writeSave, clearSave } from './config.js';
import { tex, setAnisotropy, WORLD_TEXTURES } from './textures.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { Collision } from './collision.js';
import { NavGrid } from './nav.js';
import { Effects } from './effects.js';
import { World, BOUNDS, ARENA } from './world.js';
import { Level, GROUPS, CHECKPOINTS } from './level.js';
import { Player } from './player.js';
import { EnemyManager } from './enemies.js';
import { Projectiles } from './projectiles.js';
import { UI } from './ui.js';
import { nextFrame, clamp } from './util.js';

const newStats = () => ({ time: 0, shots: 0, hits: 0, kills: 0, heads: 0, deaths: 0, damage: 0 });
const _size = new THREE.Vector2();

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
        G.ui.loading(0.04 + (0.36 * i) / WORLD_TEXTURES.length);
        await nextFrame();
      }
    }
    G.col = new Collision();
    G.fx = new Effects(G);
    G.ui.loading(0.42, 'Construindo o Vale dos Corvos…');
    await nextFrame();
    G.world = new World(G);
    G.world.build();
    G.ui.loading(0.72, 'Acordando os moradores…');
    await nextFrame();
    G.nav = new NavGrid(BOUNDS.minX, BOUNDS.minZ, BOUNDS.maxX, BOUNDS.maxZ, 1);
    G.player = new Player(G);
    G.enemies = new EnemyManager(G);
    G.proj = new Projectiles(G);
    G.level = new Level(G);
    G.level.load(G.level.newState());
    this.applyQuality(true);
    this.resize();
    G.ui.loading(0.9, 'Preparando a iluminação…');
    await nextFrame();
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
    try {
      renderer.compile(G.scene, G.camera);
    } catch (e) {
      /* compilação antecipada é opcional */
    }
    window.__ferrugemReady = true;
    window.__ferrugem = G;
    this.last = performance.now();
    requestAnimationFrame(this.loop);
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
    G.enemies.spawnGroup(
      [
        { k: 'v', x: 2.4, z: 34.2, idle: 'talk', yaw: -2.3 },
        { k: 'v', x: -1.9, z: 34.8, idle: 'talk', yaw: 2.6 },
        { k: 'v', x: 1.3, z: 29.2, idle: 'talk', yaw: 0.2 },
        { k: 'v', x: -18.4, z: 24.7, idle: 'chop', weapon: 'axe', yaw: Math.PI },
      ],
      0,
    );
    this.titleT = 0;
    G.ui.showTitle(this.hasSave());
  }

  loadCheckpoint(snap, keepCounters = false) {
    const G = this.G;
    this.timers = [];
    this.timeScale = 1;
    G.enemies.clear();
    G.proj.clear();
    G.fx.clear();
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
    const cp = CHECKPOINTS[snap.cp] || CHECKPOINTS.cp1;
    if (cp.group === 'boss') G.enemies.spawn('boss', 0, ARENA.z + 9, { yaw: Math.PI });
    else if (GROUPS[cp.group]) G.enemies.spawnGroup(GROUPS[cp.group], 0);
    this.checkpointData = snap;
  }

  saveCheckpoint(snap) {
    snap.diff = this.G.diffKey;
    this.checkpointData = snap;
    writeSave({ cp: snap });
  }

  newGame(diffKey) {
    const G = this.G;
    G.settings.difficulty = diffKey;
    saveSettings(G.settings);
    clearSave();
    G.diffKey = diffKey;
    G.diff = DIFFICULTY[diffKey];
    G.player.reset();
    const st = G.level.newState();
    const snap = { ...st, player: G.player.serialize(), stats: newStats(), pos: { x: 0, z: -18, yaw: 0 }, diff: diffKey };
    snap.player.hp = 100;
    G.stats = newStats();
    this.loadCheckpoint(snap);
    this.saveCheckpoint(JSON.parse(JSON.stringify(snap)));
    G.player.rig.root.visible = false;
    G.state = 'intro';
    G.ui.setHud(false);
    G.audio.init();
    G.ui.playIntro(() => {
      G.player.rig.root.visible = true;
      this.startPlay(true);
      const tip = G.input.touchMode
        ? 'Joystick para andar. Mirar liga a mira; Atirar dispara. Ação interage e chuta.'
        : 'Botão direito mira, botão esquerdo atira. E para pegar, ler e chutar. Tab abre a mochila.';
      G.ui.msg(tip);
    });
  }

  continueSaved() {
    const data = this.checkpointData || (loadSave() || {}).cp;
    if (!data) return this.G.ui.showNewGame();
    this.loadCheckpoint(JSON.parse(JSON.stringify(data)));
    this.startPlay(true);
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

  retryCheckpoint() {
    const G = this.G;
    const data = this.checkpointData;
    if (!data) return this.newGame(G.diffKey);
    this.loadCheckpoint(JSON.parse(JSON.stringify(data)), true);
    this.startPlay(true);
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
    G.level.flags.bossDead = true;
    this.timeScale = 0.35;
    this.after(2.4, () => (this.timeScale = 1), true);
    G.ui.msg('O Ferreiro caiu.', true);
    this.after(7, () => this.victory());
  }

  victory() {
    const G = this.G;
    if (G.state !== 'play') return;
    G.ui.fade(true);
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
      if (G.input.pressed('menu') && performance.now() > this.ignoreMenuUntil) this.pause();
      else if (G.input.pressed('inv') && performance.now() > this.ignoreMenuUntil) this.openInventory();
      if (G.state === 'play') {
        G.time += gdt;
        this.step(gdt);
        this.runTimers(dt, gdt);
      }
      G.ui.update(dt, this.fps);
    } else if (G.state === 'title') {
      this.titleStep(dt);
    } else if (G.state === 'dead' || G.state === 'win') {
      G.time += dt * 0.5;
      G.world.update(dt * 0.5, G.camera, G.player.pos.x, G.player.pos.z);
      G.fx.update(dt * 0.5, G.player.pos.x, G.player.pos.z);
      this.runTimers(dt, 0);
      G.audio.update(dt, 0, false, 1, false);
    } else {
      // pausa, mochila, documento: cena congelada
      G.audio.update(dt, 0, false, 1, false);
    }
    this.updateParticleScale();
    G.renderer.render(G.scene, G.camera);
  }

  step(dt) {
    const G = this.G,
      P = G.player;
    P.update(dt);
    G.enemies.update(dt);
    G.proj.update(dt);
    G.level.update(dt);
    G.world.update(dt, G.camera, P.pos.x, P.pos.z);
    G.fx.update(dt, P.pos.x, P.pos.z);
    G.audio.indoor += ((G.world.isIndoor(P.pos.x, P.pos.z) ? 1 : 0) - G.audio.indoor) * Math.min(1, dt * 3);
    const B = G.enemies.boss;
    const bossOn = !!(B && B.alive && B.state !== 'dormant');
    G.audio.update(dt, G.enemies.intensity(), bossOn, P.hp / P.maxHp, true);
  }

  titleStep(dt) {
    const G = this.G,
      cam = G.camera;
    G.time += dt;
    this.titleT += dt;
    const a = this.titleT * 0.045 + 2.3;
    cam.position.set(Math.sin(a) * 12.5, 2.7 + Math.sin(this.titleT * 0.3) * 0.15, 32 + Math.cos(a) * 12.5);
    if (Math.abs(cam.fov - 55) > 0.01) {
      cam.fov = 55;
      cam.updateProjectionMatrix();
    }
    cam.lookAt(0, 1.5, 32);
    G.enemies.update(dt);
    G.level.update(dt);
    G.world.update(dt, cam, 0, 32);
    G.fx.update(dt, 0, 32);
    G.audio.setListener(cam.position.x, cam.position.z, a + Math.PI);
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

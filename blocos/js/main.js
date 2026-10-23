// Blocos — ponto de entrada: liga mundo, renderização, jogador, entidades e interface.
import * as THREE from 'three';
import { initTextures, animateAtlas } from './textures.js';
import { Renderer, QUALITY, QUALITY_ORDER } from './render.js';
import { buildHDAtlas } from './hdtextures.js';
import { World, SOLID } from './world.js';
import { Player } from './player.js';
import { EntityManager, brightnessAt } from './entities.js';
import { Particles } from './particles.js';
import { WeatherFx } from './weather.js';
import { HumanoidModel, ViewModel, modelOptions } from './models.js';
import { UI } from './ui.js';
import { Input } from './input.js';
import { GameAudio } from './audio.js';
import { B, BLOCKS, I, info, itemName } from './blocks.js';
import { newFurnace, newChest, tickFurnace, serializeTile, loadTile } from './inventory.js';
import { seedFrom } from './noise.js';
import { CH, TPS, BIOME_NAMES, CS, FOLIAGE_TINT } from './consts.js';
import * as Save from './save.js';

const DEFAULTS = {
  fov: 70,
  sens: 100,
  dist: 8,
  bright: 35,
  vol: 80,
  music: 50,
  clouds: true,
  bob: true,
  guiScale: 0,
  fps: false,
  playerName: 'Jogador',
  graphics: 'medium',
};

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.input = new Input(this.canvas);
    const def = { ...DEFAULTS };
    if (this.input.isTouch) {
      def.dist = 5;
      def.graphics = 'low';
    }
    this.settings = Save.loadSettings(def);
    this.atlas = initTextures();
    this.renderer = new Renderer(this.canvas, this.atlas);
    this.audio = new GameAudio();
    this.audio.volume = this.settings.vol / 100;
    this.audio.musicVolume = this.settings.music / 100;
    this.particles = new Particles(this.renderer.scene, this.atlas);
    this.weatherFx = new WeatherFx(this.renderer.scene);
    this.viewModel = new ViewModel();
    this.player = new Player(this);
    this.entities = new EntityManager(this);
    this.playerModel = new HumanoidModel('steve');
    this.renderer.scene.add(this.playerModel.root);
    this.ui = new UI(this);
    this.state = 'menu';
    this.world = null;
    this.acc = 0;
    this.last = performance.now();
    this.fps = 0;
    this.frames = 0;
    this.fpsTime = 0;
    this.hideHud = false;
    this.debug = false;
    this.menuStack = [];
    this.selectedWorld = null;
    this.newMode = 'survival';
    this.newDiff = 'normal';
    this.smoothEye = 1.62;
    this.sway = { x: 0, y: 0, yaw: 0, pitch: 0 };
    this.flashTimer = 0;

    this.input.onKey = (code, e, repeat) => this.handleKey(code, e, repeat);
    this.input.onLockChange = (locked) => {
      if (!locked && this.state === 'playing' && !this.ui.screen && !this.ignoreUnlock && !this.player.dead) this.pause();
      this.ignoreUnlock = false;
    };
    this.canvas.addEventListener('click', () => {
      this.audio.init();
      if (this.state === 'playing' && !this.ui.screen && !this.input.locked) this.input.lock();
    });
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('beforeunload', () => this.saveGame());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.saveGame();
    });
    this.bindMenus();
    if (this.input.isTouch) this.setupTouch();
    this.applySettings();
    this.resize();
    this.startPanorama();
    requestAnimationFrame((t) => this.loop(t));
  }

  get settingsDifficulty() {
    return this.meta ? this.meta.difficulty : 'normal';
  }

  resize() {
    this.renderer.resize();
    this.viewModel.resize(window.innerWidth / window.innerHeight);
  }

  applySettings() {
    const s = this.settings;
    if (s.graphics !== this.appliedGraphics) this.applyQuality();
    this.renderer.radius = s.dist;
    this.renderer.uniforms.uGamma.value = s.bright / 100;
    this.audio.setVolume(s.vol / 100);
    this.audio.setMusicVolume(s.music / 100);
    this.ui.setGuiScale();
    Save.saveSettings(s);
  }

  // Aplica o nível de gráficos (Baixo, Médio, Alto, ULTRA)
  applyQuality() {
    const name = QUALITY[this.settings.graphics] ? this.settings.graphics : 'medium';
    this.appliedGraphics = name;
    this.renderer.setQuality(name, (size) => buildHDAtlas(size));
    // o sol está à vista? (para os reflexos de lente)
    this.renderer.sunProbe = () => {
      const w = this.world, env = this.renderer.env, cam = this.renderer.camera;
      if (!w || !env) return 0;
      const d = env.sunDir;
      return w.raycast(cam.position.x, cam.position.y, cam.position.z, d.x, d.y, d.z, 64) ? 0 : 1;
    };
    this.renderer.remeshAll(this.world);
    const q = QUALITY[name];
    this.particles.density = q.particles;
    this.particles.setAtlas(this.renderer.atlas);
    this.quality = q;
    // modelos com articulações (ULTRA) e iluminados com skins em alta resolução (MAX)
    const mo = modelOptions(q);
    if (this.playerModel && this.playerModel.optKey !== mo.key) {
      this.renderer.scene.remove(this.playerModel.root);
      this.playerModel.dispose();
      this.playerModel = new HumanoidModel('steve', mo);
      this.renderer.scene.add(this.playerModel.root);
      this.playerModel.root.visible = this.state === 'playing';
      for (const e of this.entities.list) if (e.rebuildModel) e.rebuildModel(this.entities.group);
    }
  }

  // ---------- mundos ----------
  setupWorld(seed, data) {
    this.disposeWorld();
    const w = new World(seed, data ? data.edits : null);
    w.hooks = {
      onBreakDrop: (x, y, z, id, meta) => this.dropBlockItems(x, y, z, id, meta),
      onLightning: (x, y, z) => this.lightning(x, y, z),
      onFalling: (x, y, z, id) => this.entities.spawnFalling(x, y, z, id),
      onUnload: (c) => this.renderer.disposeChunk(c),
      onTileRemoved: (x, y, z, te) => {
        const items = te.slots ? te.slots : [te.input, te.fuel, te.output];
        for (const s of items) if (s) this.entities.spawnItem(x + 0.5, y + 0.5, z + 0.5, s.id, s.count);
      },
      onTntChain: (x, y, z) => this.entities.spawnTNT(x, y, z, 10 + Math.floor(Math.random() * 20)),
      onFizz: (x, y, z) => {
        this.audio.play('fizz', { x, y, z });
        this.particles.smoke(x + 0.5, y + 1, z + 0.5, 6, 0.4);
      },
    };
    if (data) {
      w.time = data.time ?? 1000;
      for (const [k, t] of data.tiles || []) w.tileEntities.set(k, loadTile(t));
      if (data.weather) Object.assign(w.weather, data.weather);
    }
    this.world = w;
    this.renderer.radius = this.settings.dist;
    return w;
  }
  disposeWorld() {
    if (!this.world) return;
    this.renderer.clearChunks(this.world);
    this.entities.clear();
    this.particles.clear();
    this.world = null;
  }

  startPanorama() {
    this.state = 'menu';
    this.ui.showMenu('title');
    document.getElementById('hud').classList.add('hidden');
    document.getElementById('touch').classList.add('hidden');
    const w = this.setupWorld(seedFrom('panorama-blocos'), null);
    this.renderer.radius = Math.min(this.settings.dist, 6);
    const sp = w.terrain.findSpawn();
    this.panorama = { x: sp.x, y: sp.y + 12, z: sp.z, t: 0 };
    w.time = 2500;
    this.playerModel.root.visible = false;
  }

  newWorld() {
    const name = document.getElementById('new-name').value.trim() || 'Novo mundo';
    const seedText = document.getElementById('new-seed').value.trim();
    const seed = seedText ? seedFrom(seedText) : (Math.random() * 2 ** 31) | 0;
    const meta = { id: Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36), name, seed, mode: this.newMode, difficulty: this.newDiff, created: Date.now(), played: Date.now() };
    Save.saveWorldMeta(meta);
    this.playWorld(meta, null);
  }

  playWorld(meta, data) {
    this.meta = meta;
    this.settings.difficulty = meta.difficulty;
    const w = this.setupWorld(meta.seed, data);
    const p = this.player;
    const fresh = new Player(this);
    Object.assign(p, fresh);
    p.game = this;
    p.mode = meta.mode;
    if (data && data.player) {
      const d = data.player;
      p.setPosition(d.x, d.y, d.z);
      p.yaw = d.yaw;
      p.pitch = d.pitch;
      p.health = d.health;
      p.food = d.food;
      p.saturation = d.saturation ?? 5;
      p.mode = d.mode || meta.mode;
      p.flying = !!d.flying && p.mode === 'creative';
      p.inventory.load(d.inv);
      p.inventory.selected = d.selected || 0;
      p.spawn = d.spawn || p.spawn;
      p.cameraMode = d.cameraMode || 0;
      this.needSpawnFix = false;
    } else {
      const sp = w.terrain.findSpawn();
      p.spawn = { ...sp };
      p.setPosition(sp.x, sp.y, sp.z);
      p.yaw = Math.random() * Math.PI * 2;
      this.needSpawnFix = true;
      if (p.mode === 'creative') {
        const kit = [B.GRASS, B.COBBLE, B.PLANKS, B.LOG, B.GLASS, B.STONE_BRICKS, B.TORCH, B.BRICKS, B.TNT];
        kit.forEach((id, i) => (p.inventory.slots[i] = { id, count: 1, damage: 0 }));
      }
    }
    p.inventory.changed();
    this.state = 'loading';
    this.loadStart = performance.now();
    this.ui.showMenu('loading');
    document.getElementById('loading-title').textContent = data ? 'Carregando mundo' : 'Gerando terreno';
    this.tickCount = 0;
  }

  finishLoading() {
    const p = this.player, w = this.world;
    if (this.needSpawnFix) {
      // acha o chão no ponto de nascimento
      const x = Math.floor(p.x), z = Math.floor(p.z);
      let y = CH - 2;
      while (y > 1 && !SOLID[w.getBlock(x, y - 1, z)]) y--;
      while (y < CH - 2 && (SOLID[w.getBlock(x, y, z)] || SOLID[w.getBlock(x, y + 1, z)])) y++;
      p.setPosition(x + 0.5, y, z + 0.5);
      p.spawn = { x: x + 0.5, y, z: z + 0.5 };
      this.needSpawnFix = false;
    }
    this.state = 'playing';
    this.ui.showMenu(null);
    document.getElementById('hud').classList.remove('hidden');
    if (this.input.isTouch) document.getElementById('touch').classList.remove('hidden');
    this.input.enabled = true;
    this.playerModel.root.visible = true;
    this.ui.addChat(`Bem-vindo a ${this.meta.name}! Pressione E para o inventário e F5 para mudar a câmera.`, '#ffff55');
    this.input.lock();
    this.saveGame();
  }

  saveGame() {
    if (this.state !== 'playing' || !this.world || !this.meta) return;
    const p = this.player;
    const data = {
      v: 1,
      seed: this.world.seed,
      time: this.world.time,
      player: {
        x: p.x, y: p.y, z: p.z, yaw: p.yaw, pitch: p.pitch, health: p.dead ? 20 : p.health, food: p.food, saturation: p.saturation,
        mode: p.mode, flying: p.flying, inv: p.inventory.serialize(), selected: p.inventory.selected, spawn: p.spawn, cameraMode: p.cameraMode,
      },
      edits: this.world.serializeEdits(),
      tiles: [...this.world.tileEntities].map(([k, t]) => [k, serializeTile(t)]),
      weather: this.world.weather,
    };
    if (p.dead) Object.assign(data.player, p.spawn);
    const ok = Save.saveWorldData(this.meta.id, data);
    this.meta.played = Date.now();
    this.meta.mode = p.mode;
    Save.saveWorldMeta(this.meta);
    if (!ok && !this.warnedSave) {
      this.warnedSave = true;
      this.ui.addChat('Não foi possível salvar: o armazenamento do navegador está cheio.', '#ff5555');
    }
  }

  quitToTitle() {
    this.saveGame();
    if (this.ui.isContainer()) this.ui.closeContainer();
    this.ui.screen = null;
    this.input.enabled = false;
    this.input.unlock();
    document.getElementById('chat').classList.add('hidden');
    this.meta = null;
    this.startPanorama();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.ui.screen = 'pause';
    this.input.enabled = false;
    this.ignoreUnlock = true;
    this.input.unlock();
    this.ui.showMenu('pause');
    this.saveGame();
  }
  resume() {
    this.ui.screen = null;
    this.ui.showMenu(null);
    this.input.enabled = true;
    this.input.lock();
  }

  onPlayerDeath(msg) {
    this.ui.addChat(msg);
    setTimeout(() => {
      if (!this.player.dead) return;
      if (this.ui.isContainer()) this.ui.closeContainer();
      this.ui.screen = 'death';
      this.input.enabled = false;
      this.ignoreUnlock = true;
      this.input.unlock();
      document.getElementById('death-msg').textContent = msg;
      this.ui.showMenu('death');
    }, 1000);
  }

  newFurnace() {
    return newFurnace();
  }

  // baú gerado no mundo (masmorra): tesouro sorteado pela posição
  chestLoot(x, y, z) {
    const c = newChest();
    let h = (x * 73856093) ^ (y * 19349663) ^ (z * 83492791) ^ this.world.seed;
    const rnd = () => ((h = (Math.imul(h ^ (h >>> 15), 2246822507) + 0x9e3779b9) | 0) >>> 0) / 4294967296;
    const table = [
      [I.BREAD, 1, 4, 10], [I.APPLE, 1, 3, 8], [I.WHEAT_ITEM, 2, 6, 8], [I.SEEDS, 2, 6, 6], [I.IRON_INGOT, 1, 5, 9], [I.GOLD_INGOT, 1, 4, 5],
      [I.DIAMOND, 1, 2, 2], [I.BONE, 2, 6, 8], [I.GUNPOWDER, 1, 5, 7], [I.STRING, 1, 4, 6], [I.ARROW, 4, 12, 6], [I.BUCKET, 1, 1, 4],
      [I.COAL, 3, 8, 8], [I.BOW, 1, 1, 2], [I.IRON_PICKAXE, 1, 1, 1], [I.FEATHER, 1, 3, 3], [I.EGG, 1, 3, 3],
    ];
    const total = table.reduce((a, t) => a + t[3], 0);
    const n = 4 + Math.floor(rnd() * 5);
    for (let k = 0; k < n; k++) {
      let r = rnd() * total;
      const t = table.find((e) => (r -= e[3]) < 0) || table[0];
      const slot = Math.floor(rnd() * 27);
      if (!c.slots[slot]) c.slots[slot] = { id: t[0], count: t[1] + Math.floor(rnd() * (t[2] - t[1] + 1)), damage: 0 };
    }
    return c;
  }

  // dormir: só à noite e sem monstros por perto; pula para a manhã
  trySleep(x, y, z) {
    const w = this.world, p = this.player;
    p.spawn = { x: x + 0.5, y: y + 0.6, z: z + 0.5 };
    if (!w.isNight() && w.weather.rain < 0.8) return this.ui.addChat('Você só pode dormir à noite ou durante tempestades. Ponto de nascimento definido.', '#ffff55');
    const near = this.entities.list.some((e) => e.hostile && !e.deathTime && Math.hypot(e.x - x, e.y - y, e.z - z) < 8);
    if (near) return this.ui.addChat('Você não pode dormir agora: há monstros por perto.', '#ff5555');
    this.sleeping = { t: 0, x, y, z };
    p.setPosition(x + 0.5, y + 0.6, z + 0.5);
    this.ui.addChat('Dormindo...', '#aaaaaa');
  }
  updateSleep(dt) {
    const el = document.getElementById('sleep-overlay');
    if (!this.sleeping) {
      el.style.opacity = 0;
      return;
    }
    this.sleeping.t += dt;
    el.style.opacity = Math.min(1, this.sleeping.t / 2);
    if (this.sleeping.t > 2.6) {
      this.world.time = 0;
      this.world.setWeather('clear');
      this.sleeping = null;
      this.ui.addChat('Bom dia! Seu ponto de nascimento é a cama.', '#ffff55');
    }
  }

  lightning(x, y, z) {
    this.weatherFx.bolt(x, y, z);
    const d = Math.hypot(x - this.player.x, z - this.player.z);
    setTimeout(() => this.audio.play('thunder', { volume: Math.max(0.25, 1 - d / 120) }), Math.min(3000, d * 8));
    const p = this.player;
    if (Math.hypot(p.x - x, p.y - y, p.z - z) < 3) p.damage(5, null, 'lightning');
    for (const e of this.entities.list) if (e.damage && Math.hypot(e.x - x, e.y - y, e.z - z) < 3) e.damage(5, null);
  }
  newChest() {
    return newChest();
  }

  dropBlockItems(x, y, z, id, meta = 0) {
    const b = BLOCKS[id];
    if (!b) return;
    const spawn = (iid, n = 1) => this.entities.spawnItem(x + 0.5, y + 0.5, z + 0.5, iid, n);
    if (id === B.WHEAT) {
      if (meta >= 7) {
        spawn(I.WHEAT_ITEM, 1);
        spawn(I.SEEDS, 1 + Math.floor(Math.random() * 3));
      } else spawn(I.SEEDS, 1);
      return;
    }
    if (id === B.TALL_GRASS) {
      if (Math.random() < 0.125) spawn(I.SEEDS, 1);
      return;
    }
    if (id === B.GRAVEL && Math.random() < 0.1) return spawn(I.FLINT, 1);
    if (id === B.DOOR) return meta & 8 ? undefined : spawn(I.DOOR_ITEM, 1);
    if (id === B.BED) return spawn(I.BED_ITEM, 1);
    if (id === B.SNOW_LAYER) return;
    if (id === B.LEAVES || id === B.BIRCH_LEAVES || id === B.SPRUCE_LEAVES) {
      if (Math.random() < 0.06) spawn(B.SAPLING);
      if (id === B.LEAVES && Math.random() < 0.01) spawn(I.APPLE);
      return;
    }
    if (id === B.ICE) {
      if (SOLID[this.world.getBlock(x, y - 1, z)] || this.world.getBlock(x, y - 1, z) === B.WATER) this.world.setBlock(x, y, z, B.WATER);
      return;
    }
    if (id === B.GLOWSTONE) return spawn(B.GLOWSTONE, 1);
    if (id === B.DIAMOND_ORE || id === B.COAL_ORE) return spawn(b.drop, 1);
    if (b.drop) spawn(b.drop, 1);
  }

  brightnessAt(x, y, z) {
    const env = this.envLight;
    return brightnessAt(this.world, x, y, z, env ? env.skyDarken : 0, this.renderer.uniforms.uGamma.value);
  }

  // ---------- teclado ----------
  handleKey(code, e, repeat) {
    this.audio.init();
    const ui = this.ui;
    if (this.state !== 'playing') {
      if (code === 'Escape' && this.state === 'menu') this.menuBack();
      return;
    }
    if (ui.screen === 'chat') {
      if (code === 'Enter') this.sendChat();
      else if (code === 'Escape') this.closeChat();
      return;
    }
    if (ui.isContainer()) {
      if (code === 'Escape' || (code === 'KeyE' && !(document.activeElement && document.activeElement.classList.contains('search')))) {
        ui.closeContainer();
        this.input.enabled = true;
        this.input.lock();
      } else if (code.startsWith('Digit')) {
        const n = Number(code.slice(5)) - 1;
        if (n >= 0 && n < 9) ui.hotkeySwap(n);
      }
      return;
    }
    if (ui.screen === 'pause') {
      if (code === 'Escape') this.resume();
      return;
    }
    if (ui.screen === 'options' || ui.screen === 'controls') {
      if (code === 'Escape') this.menuBack();
      return;
    }
    if (ui.screen === 'death') return;
    if (repeat && code !== 'KeyQ') return;
    const p = this.player, inv = p.inventory;
    if (code === 'Escape') {
      if (!this.input.locked) this.pause();
    } else if (code === 'KeyE') {
      this.ignoreUnlock = true;
      ui.openInventory();
    } else if (code === 'KeyQ') p.dropHeld(e.ctrlKey);
    else if (code.startsWith('Digit')) {
      const n = Number(code.slice(5)) - 1;
      if (n >= 0 && n < 9) {
        inv.selected = n;
        inv.changed();
      }
    } else if (code === 'F5' || code === 'KeyV') this.cycleCamera();
    else if (code === 'F3') {
      this.debug = !this.debug;
      document.getElementById('debug').classList.toggle('hidden', !this.debug);
    } else if (code === 'F1') this.hideHud = !this.hideHud;
    else if (code === 'KeyT' || code === 'Slash' || code === 'Enter') this.openChat(code === 'Slash' ? '/' : '');
    else if (code === 'MiddleClick') p.pickBlock();
  }

  cycleCamera() {
    const p = this.player;
    p.cameraMode = (p.cameraMode + 1) % 3;
    const names = ['Primeira pessoa', 'Terceira pessoa (atrás)', 'Terceira pessoa (frente)'];
    this.ui.showItemName(names[p.cameraMode]);
  }

  openChat(prefix) {
    this.ui.screen = 'chat';
    this.input.enabled = false;
    this.ignoreUnlock = true;
    this.input.unlock();
    const c = document.getElementById('chat');
    c.classList.remove('hidden');
    const inp = document.getElementById('chat-input');
    inp.value = prefix;
    setTimeout(() => inp.focus(), 0);
  }
  closeChat() {
    document.getElementById('chat').classList.add('hidden');
    document.getElementById('chat-input').blur();
    this.ui.screen = null;
    this.input.enabled = true;
    this.input.lock();
  }
  sendChat() {
    const text = document.getElementById('chat-input').value.trim();
    this.closeChat();
    if (!text) return;
    if (text.startsWith('/')) this.runCommand(text.slice(1));
    else this.ui.addChat(`<${this.settings.playerName}> ${text}`);
  }

  runCommand(cmd) {
    const [name, ...args] = cmd.split(/\s+/);
    const p = this.player, w = this.world, ui = this.ui;
    const ok = (m) => ui.addChat(m, '#aaaaaa');
    const err = (m) => ui.addChat(m, '#ff5555');
    switch ((name || '').toLowerCase()) {
      case 'gamemode':
      case 'gm': {
        const a = (args[0] || '').toLowerCase();
        const mode = ['creative', 'c', '1', 'criativo'].includes(a) ? 'creative' : ['survival', 's', '0', 'sobrevivencia', 'sobrevivência'].includes(a) ? 'survival' : null;
        if (!mode) return err('Uso: /gamemode creative|survival');
        p.mode = mode;
        if (mode === 'survival') p.flying = false;
        p.inventory.changed();
        return ok(`Modo de jogo alterado para ${mode === 'creative' ? 'Criativo' : 'Sobrevivência'}`);
      }
      case 'time': {
        const v = (args[1] || args[0] || '').toLowerCase();
        const map = { day: 1000, dia: 1000, noon: 6000, 'meio-dia': 6000, night: 13000, noite: 13000, midnight: 18000, 'meia-noite': 18000, sunrise: 23500, sunset: 12000 };
        const t = map[v] ?? Number(v);
        if (!Number.isFinite(t)) return err('Uso: /time set day|noon|night|midnight|<ticks>');
        w.time = ((t % 24000) + 24000) % 24000;
        return ok(`Hora definida para ${w.time}`);
      }
      case 'tp': {
        const n = args.map((a, i) => (a.startsWith('~') ? [p.x, p.y, p.z][i] + Number(a.slice(1) || 0) : Number(a)));
        if (n.length < 3 || n.some((v) => !Number.isFinite(v))) return err('Uso: /tp x y z');
        p.setPosition(n[0], n[1], n[2]);
        return ok(`Teleportado para ${n.map((v) => v.toFixed(1)).join(', ')}`);
      }
      case 'give': {
        const q = (args[0] || '').toLowerCase();
        const count = Math.max(1, Math.min(640, Number(args[1]) || 1));
        let id = Number(q);
        if (!info(id)) {
          const all = [...Object.entries(B).map(([k, v]) => [k, v]), ...Object.entries(I).map(([k, v]) => [k, v])];
          const f = all.find(([k]) => k.toLowerCase() === q) || all.find(([, v]) => itemName(v).toLowerCase() === q) || all.find(([, v]) => itemName(v).toLowerCase().includes(q));
          id = f ? f[1] : 0;
        }
        if (!id || !info(id)) return err('Item desconhecido');
        p.inventory.add(id, count);
        return ok(`Dado ${count} × ${itemName(id)}`);
      }
      case 'spawn':
      case 'summon': {
        const map = {
          porco: 'pig', pig: 'pig', ovelha: 'sheep', sheep: 'sheep', vaca: 'cow', cow: 'cow', zumbi: 'zombie', zombie: 'zombie', creeper: 'creeper',
          galinha: 'chicken', chicken: 'chicken', esqueleto: 'skeleton', skeleton: 'skeleton', aranha: 'spider', spider: 'spider',
        };
        const type = map[(args[0] || '').toLowerCase()];
        if (!type) return err('Uso: /spawn porco|ovelha|vaca|galinha|zumbi|esqueleto|aranha|creeper');
        const d = p.lookDir();
        this.entities.spawnMob(type, p.x + d[0] * 3, p.y + 0.5, p.z + d[2] * 3);
        return ok(`Criado: ${args[0]}`);
      }
      case 'weather':
      case 'clima': {
        const a = (args[0] || '').toLowerCase();
        const kind = { clear: 'clear', limpo: 'clear', sol: 'clear', rain: 'rain', chuva: 'rain', thunder: 'thunder', tempestade: 'thunder' }[a];
        if (!kind) return err('Uso: /weather clear|rain|thunder');
        w.setWeather(kind);
        return ok(`Clima: ${{ clear: 'limpo', rain: 'chuva', thunder: 'tempestade' }[kind]}`);
      }
      case 'seed':
        return ok(`Semente: ${w.seed}`);
      case 'kill':
        if (!p.dead) p.die('void');
        return;
      case 'spawnpoint':
        p.spawn = { x: p.x, y: p.y, z: p.z };
        return ok('Ponto de nascimento definido');
      case 'help':
      case 'ajuda':
        return ok('/gamemode, /time set, /weather, /tp, /give, /spawn, /seed, /kill, /spawnpoint');
      default:
        return err('Comando desconhecido. Digite /help');
    }
  }

  // ---------- menus ----------
  bindMenus() {
    document.querySelectorAll('[data-act]').forEach((b) => {
      b.addEventListener('click', (e) => {
        this.audio.init();
        this.audio.play('click');
        this.menuAction(b.dataset.act, e);
      });
    });
    const sliders = [
      ['opt-fov', 'fov', (v) => `Campo de visão: ${v === 70 ? 'Normal' : v === 110 ? 'Quake Pro' : v}`],
      ['opt-sens', 'sens', (v) => `Sensibilidade: ${v}%`],
      ['opt-dist', 'dist', (v) => `Renderização: ${v} chunks`],
      ['opt-bright', 'bright', (v) => `Brilho: ${v === 0 ? 'Sombrio' : v === 100 ? 'Claro' : v + '%'}`],
      ['opt-vol', 'vol', (v) => `Sons: ${v}%`],
      ['opt-music', 'music', (v) => `Música: ${v}%`],
    ];
    for (const [id, key, label] of sliders) {
      const inp = document.getElementById(id);
      const span = inp.nextElementSibling;
      const upd = () => (span.textContent = label(Number(inp.value)));
      inp.value = this.settings[key];
      upd();
      inp.addEventListener('input', () => {
        this.settings[key] = Number(inp.value);
        upd();
        this.applySettings();
      });
    }
    this.updateOptionButtons();
    document.getElementById('chat-input').addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.code === 'Enter') this.sendChat();
      else if (e.code === 'Escape') this.closeChat();
    });
  }
  updateOptionButtons() {
    const s = this.settings;
    document.getElementById('opt-clouds').textContent = `Nuvens: ${s.clouds ? 'Sim' : 'Não'}`;
    document.getElementById('opt-bob').textContent = `Balanço da visão: ${s.bob ? 'Sim' : 'Não'}`;
    document.getElementById('opt-gui').textContent = `Tamanho da interface: ${s.guiScale ? s.guiScale : 'Auto'}`;
    document.getElementById('opt-fps').textContent = `Mostrar FPS: ${s.fps ? 'Sim' : 'Não'}`;
    const q = QUALITY[s.graphics] || QUALITY.medium;
    document.getElementById('opt-graphics').textContent = `Gráficos: ${q.label}`;
    const desc = {
      low: 'Mais leve: menos pixels, folhas opacas e sem nuvens. Bom para celulares.',
      medium: 'Visual clássico, com nuvens em blocos.',
      high: 'Sombras do sol, água com reflexos e ondas, plantas e folhas balançando ao vento, brilho (bloom).',
      ultra: 'Texturas realistas em alta resolução com relevo, sombras suaves, céu com nuvens realistas, raios de sol, folhas caindo e animações realistas dos personagens. Exige uma boa placa de vídeo.',
      max: 'O ápice: texturas 128×128 com relevo 3D (parallax), céu com atmosfera real e nuvens volumétricas, sol e lua realistas, água com reflexo do mundo, refração e espuma, sombras suaves de penumbra variável, oclusão de ambiente, sombras das nuvens, cáusticas, animais com pelo detalhado e iluminados pelo sol. Exige uma placa de vídeo potente.',
    };
    document.getElementById('graphics-desc').textContent = desc[s.graphics] || '';
  }

  showScreen(id) {
    this.ui.showMenu(id);
    if (this.state === 'playing') this.ui.screen = id;
  }
  menuBack() {
    const prev = this.menuStack.pop();
    if (prev) this.showScreen(prev);
    else if (this.state === 'playing') this.showScreen('pause');
    else this.showScreen('title');
  }
  current() {
    for (const s of ['title', 'worlds', 'create', 'options', 'controls', 'pause', 'death']) if (!document.getElementById(s).classList.contains('hidden')) return s;
    return null;
  }

  menuAction(act) {
    const cur = this.current();
    switch (act) {
      case 'singleplayer':
        this.menuStack.push('title');
        this.renderWorldList();
        this.showScreen('worlds');
        break;
      case 'options':
      case 'controls':
        this.menuStack.push(cur);
        this.showScreen(act);
        break;
      case 'back':
        this.menuBack();
        break;
      case 'new-world':
        this.menuStack.push('worlds');
        document.getElementById('new-name').value = 'Novo mundo';
        document.getElementById('new-seed').value = '';
        this.showScreen('create');
        break;
      case 'toggle-mode':
        this.newMode = this.newMode === 'survival' ? 'creative' : 'survival';
        document.getElementById('new-mode').textContent = `Modo de jogo: ${this.newMode === 'survival' ? 'Sobrevivência' : 'Criativo'}`;
        document.getElementById('mode-desc').textContent =
          this.newMode === 'survival' ? 'Procure recursos, construa, ganhe vida e lute contra monstros.' : 'Recursos ilimitados, voo livre e quebra instantânea de blocos.';
        break;
      case 'toggle-diff':
        this.newDiff = this.newDiff === 'normal' ? 'peaceful' : 'normal';
        document.getElementById('new-diff').textContent = `Dificuldade: ${this.newDiff === 'normal' ? 'Normal' : 'Pacífico'}`;
        break;
      case 'create-world':
        this.menuStack = [];
        this.newWorld();
        break;
      case 'play-world': {
        if (!this.selectedWorld) return;
        this.menuStack = [];
        const meta = Save.listWorlds().find((w) => w.id === this.selectedWorld);
        if (meta) this.playWorld(meta, Save.loadWorldData(meta.id));
        break;
      }
      case 'delete-world': {
        if (!this.selectedWorld) return;
        const meta = Save.listWorlds().find((w) => w.id === this.selectedWorld);
        if (!meta) return;
        // segundo clique confirma (o navegador pode bloquear janelas de confirmação)
        if (this.confirmDelete !== meta.id) {
          this.confirmDelete = meta.id;
          document.querySelector('[data-act="delete-world"]').textContent = 'Clique de novo para excluir';
          return;
        }
        Save.deleteWorld(meta.id);
        this.selectedWorld = null;
        this.renderWorldList();
        break;
      }
      case 'resume':
        this.resume();
        break;
      case 'quit':
        this.menuStack = [];
        this.quitToTitle();
        break;
      case 'respawn':
        this.player.respawn();
        this.ui.screen = null;
        this.ui.showMenu(null);
        this.input.enabled = true;
        this.input.lock();
        break;
      case 'opt-clouds':
        this.settings.clouds = !this.settings.clouds;
        break;
      case 'opt-bob':
        this.settings.bob = !this.settings.bob;
        break;
      case 'opt-gui':
        this.settings.guiScale = (this.settings.guiScale + 1) % 5;
        break;
      case 'opt-graphics': {
        const i = QUALITY_ORDER.indexOf(this.settings.graphics);
        this.settings.graphics = QUALITY_ORDER[(i + 1) % QUALITY_ORDER.length];
        break;
      }
      case 'opt-fps':
        this.settings.fps = !this.settings.fps;
        break;
    }
    if (act.startsWith('opt-')) {
      this.updateOptionButtons();
      this.applySettings();
    }
  }

  renderWorldList() {
    const box = document.getElementById('world-list');
    box.innerHTML = '';
    const list = Save.listWorlds();
    if (!list.length) {
      const n = document.createElement('div');
      n.className = 'empty-note';
      n.textContent = 'Nenhum mundo ainda. Crie um novo!';
      box.appendChild(n);
    }
    for (const w of list) {
      const d = document.createElement('div');
      d.className = 'world-item' + (w.id === this.selectedWorld ? ' sel' : '');
      const date = new Date(w.played || w.created).toLocaleString('pt-BR');
      d.innerHTML = `<div class="wn"></div><div class="wd"></div>`;
      d.firstChild.textContent = w.name;
      d.lastChild.textContent = `${date} · ${w.mode === 'creative' ? 'Criativo' : 'Sobrevivência'} · semente ${w.seed}`;
      d.addEventListener('click', () => {
        this.selectedWorld = w.id;
        this.renderWorldList();
      });
      d.addEventListener('dblclick', () => {
        this.selectedWorld = w.id;
        this.menuAction('play-world');
      });
      box.appendChild(d);
    }
    this.confirmDelete = null;
    document.querySelector('[data-act="delete-world"]').textContent = 'Excluir';
    const has = !!list.find((w) => w.id === this.selectedWorld);
    document.querySelector('[data-act="play-world"]').disabled = !has;
    document.querySelector('[data-act="delete-world"]').disabled = !has;
  }

  setupTouch() {
    const $ = (id) => document.getElementById(id);
    this.input.setupTouch({ joy: $('t-joy'), knob: $('t-knob'), jump: $('t-jump'), sneak: $('t-sneak') });
    const tap = (id, fn) =>
      $(id).addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.audio.init();
        if (this.state === 'playing') fn();
      }, { passive: false });
    tap('t-inv', () => {
      if (this.ui.isContainer()) {
        this.ui.closeContainer();
        this.input.enabled = true;
      } else if (!this.ui.screen) this.ui.openInventory();
    });
    tap('t-cam', () => !this.ui.screen && this.cycleCamera());
    tap('t-drop', () => !this.ui.screen && this.player.dropHeld(false));
    tap('t-pause', () => (this.ui.screen === 'pause' ? this.resume() : !this.ui.screen && this.pause()));
    // fechar inventário tocando fora
    $('container-screen').addEventListener('touchstart', (e) => {
      if (e.target === $('container-screen')) {
        this.ui.closeContainer();
        this.input.enabled = true;
      }
    });
  }

  // ---------- simulação ----------
  tick() {
    const st = this.input.state();
    const p = this.player;
    if (st.tap) {
      if (p.targetMob) {
        st.attack = true;
        st.attackPressed = true;
      } else st.usePressed = true;
    }
    const wheel = this.input.consumeWheel();
    if (wheel && !this.ui.screen) {
      const inv = p.inventory;
      inv.selected = (((inv.selected + wheel) % 9) + 9) % 9;
      inv.changed();
    }
    if (this.sleeping) {
      st.moveX = st.moveY = 0;
      st.attack = st.use = st.usePressed = st.attackPressed = false;
    }
    p.tick(st);
    this.world.tick(p.x, p.z);
    // folhas caindo das árvores (gráficos Alto e ULTRA)
    if (this.quality && this.quality.fallingLeaves) {
      for (let k = 0; k < 14; k++) {
        const x = Math.floor(p.x + (Math.random() - 0.5) * 28), y = Math.floor(p.y + (Math.random() - 0.3) * 16), z = Math.floor(p.z + (Math.random() - 0.5) * 28);
        const id = this.world.getBlock(x, y, z);
        if ((id === B.LEAVES || id === B.BIRCH_LEAVES) && this.world.getBlock(x, y - 1, z) === B.AIR && Math.random() < 0.08) {
          const c = this.world.getChunk(x >> 4, z >> 4);
          const tint = id === B.LEAVES && c ? FOLIAGE_TINT[c.biomes[(z & 15) * 16 + (x & 15)]] : [1.1, 1.1, 0.9];
          this.particles.leaf(x + Math.random(), y - 0.05, z + Math.random(), tint, this.brightnessAt(x + 0.5, y - 0.5, z + 0.5));
        }
      }
    }
    // vaga-lumes nas noites sem chuva (MAX)
    if (this.quality && this.quality.fireflies && this.renderer.env && this.renderer.env.daylight < 0.35 && this.renderer.weather.rain < 0.2) {
      for (let k = 0; k < 3; k++) {
        if (Math.random() > 0.25) continue;
        const x = Math.floor(p.x + (Math.random() - 0.5) * 36), z = Math.floor(p.z + (Math.random() - 0.5) * 36);
        // desce até achar o chão
        let y = Math.floor(p.y) + 6;
        while (y > p.y - 8 && this.world.getBlock(x, y - 1, z) === B.AIR) y--;
        const below = this.world.getBlock(x, y - 1, z);
        if ((below === B.GRASS || below === B.TALL_GRASS) && (this.world.getLight(x, y, z) >> 4) >= 13) {
          this.particles.firefly(x + Math.random(), y + 0.2 + Math.random() * 1.6, z + Math.random());
        }
      }
    }
    // fornalhas
    for (const [key, t] of this.world.tileEntities) {
      if (t.slots) continue;
      const [x, y, z] = key.split(',').map(Number);
      if (!this.world.isReady(x, z)) continue;
      if (tickFurnace(t)) {
        const id = this.world.getBlock(x, y, z);
        const meta = this.world.getMeta(x, y, z);
        if (id === B.FURNACE || id === B.FURNACE_LIT) this.world.setBlock(x, y, z, t.burn > 0 ? B.FURNACE_LIT : B.FURNACE, meta, { noUpdate: true });
      }
    }
    if (this.ui.screen === 'furnace') this.ui.refreshContainer();
    this.entities.tick();
    // chamas das tochas próximas
    const pcx = Math.floor(p.x / CS), pcz = Math.floor(p.z / CS);
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const c = this.world.getChunk(pcx + dx, pcz + dz);
      if (!c || !c.torches) continue;
      for (const [x, y, z, m] of c.torches) {
        if (Math.random() > 0.12) continue;
        const dir = [null, [1, 0], [-1, 0], [0, 1], [0, -1]][m];
        const ox = dir ? dir[0] * -0.15 : 0, oz = dir ? dir[1] * -0.15 : 0;
        const fy = dir ? 0.92 : 0.72;
        this.particles.flame(x + 0.5 + ox, y + fy, z + 0.5 + oz);
        if (Math.random() < 0.3) this.particles.smoke(x + 0.5 + ox, y + fy + 0.1, z + 0.5 + oz, 1, 0.02, true);
      }
    }
    // fornalhas acesas soltam fumaça
    if (++this.tickCount % 600 === 0) this.saveGame();
  }

  loop(now) {
    requestAnimationFrame((t) => this.loop(t));
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps = Math.round(this.frames / this.fpsTime);
      this.frames = 0;
      this.fpsTime = 0;
    }
    if (Math.floor(now / 100) !== this._animStep) {
      this._animStep = Math.floor(now / 100);
      animateAtlas(now / 1000);
      this.atlas.needsUpdate = true;
    }
    if (this.state === 'menu') this.frameMenu(dt);
    else if (this.state === 'loading') this.frameLoading(dt);
    else this.framePlaying(dt);
    this.audio.updateMusic(dt);
    this.ui.renderPreview(now / 1000);
  }

  frameMenu(dt) {
    const w = this.world, pan = this.panorama;
    w.update(pan.x, pan.z, this.renderer.radius, 10);
    this.renderer.updateChunks(w, pan.x, pan.z, 8);
    pan.t += dt;
    const cam = this.renderer.camera;
    cam.fov = 70;
    cam.updateProjectionMatrix();
    cam.position.set(pan.x, pan.y, pan.z);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(-0.15, pan.t * 0.04, 0);
    this.renderer.weather.rain = 0;
    this.weatherFx.update(dt, null, cam, 0, this.particles, false);
    const env = this.renderer.updateEnvironment(w, cam, { clouds: this.settings.clouds });
    this.envLight = { skyDarken: (1 - env.daylight) * 11 };
    this.particles.update(dt, w, cam, window.innerHeight, this.renderer.uniforms.uFogColor.value, this.renderer.uniforms.uFogFar.value);
    this.renderer.render(null, null, new THREE.Vector3(pan.x, pan.y - 12, pan.z));
  }

  frameLoading() {
    const w = this.world, p = this.player;
    w.update(p.x, p.z, this.settings.dist, 30);
    this.renderer.updateChunks(w, p.x, p.z, 20);
    // pronto quando os chunks em volta do jogador tiverem malha
    let total = 0, done = 0;
    const pcx = Math.floor(p.x / CS), pcz = Math.floor(p.z / CS);
    const R = Math.min(3, this.settings.dist);
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) {
      total++;
      const c = w.getChunk(pcx + dx, pcz + dz);
      if (c && c.meshes && !c.dirty) done++;
    }
    const frac = done / total;
    document.querySelector('#loading-bar div').style.width = Math.round(frac * 100) + '%';
    document.getElementById('loading-sub').textContent = `Construindo terreno: ${Math.round(frac * 100)}%`;
    if (done >= total) this.finishLoading();
    else this.renderer.render();
  }

  framePlaying(dt) {
    const p = this.player, w = this.world, r = this.renderer, cam = r.camera, s = this.settings;
    // olhar
    const [ldx, ldy] = this.input.consumeLook();
    if (!p.dead) {
      const k = (s.sens / 100) * 0.0024;
      p.yaw -= ldx * k;
      p.pitch = Math.max(-Math.PI / 2 + 0.001, Math.min(Math.PI / 2 - 0.001, p.pitch - ldy * k));
    }
    this.sway.yaw += (p.yaw - this.sway.yaw) * Math.min(1, dt * 12);
    this.sway.pitch += (p.pitch - this.sway.pitch) * Math.min(1, dt * 12);
    // ticks fixos
    this.acc += dt;
    let n = 0;
    while (this.acc >= 1 / TPS && n < 5) {
      this.tick();
      this.acc -= 1 / TPS;
      n++;
    }
    if (n >= 5) this.acc = 0;
    const a = this.acc * TPS;
    w.update(p.x, p.z, s.dist, 4);
    r.updateChunks(w, p.x, p.z, 5);

    // posição da câmera
    const x = p.px + (p.x - p.px) * a, y = p.py + (p.y - p.py) * a, z = p.pz + (p.z - p.pz) * a;
    this.smoothEye += (p.eyeHeight - this.smoothEye) * Math.min(1, dt * 14);
    const eyeY = y + (p.dead ? 0.3 : this.smoothEye);
    const walk = p.prevWalkDist + (p.walkDist - p.prevWalkDist) * a;
    const bob = s.bob ? p.prevBob + (p.bob - p.prevBob) * a : 0;
    cam.rotation.order = 'YXZ';
    let roll = 0, pitchAdd = 0;
    const camPos = new THREE.Vector3(x, eyeY, z);
    if (p.cameraMode === 0) {
      const sx = Math.sin(walk * Math.PI) * bob * 0.5, sy = -Math.abs(Math.cos(walk * Math.PI) * bob);
      camPos.x += Math.cos(p.yaw) * sx;
      camPos.z += -Math.sin(p.yaw) * sx;
      camPos.y += sy;
      roll = Math.sin(walk * Math.PI) * bob * 0.05;
      pitchAdd = -Math.abs(Math.cos(walk * Math.PI - 0.2) * bob) * 0.09;
    }
    if (p.hurtTime > 0) {
      const f = Math.max(0, (p.hurtTime - a) / 10);
      roll += -Math.sin(f * f * f * f * Math.PI) * 0.25 * (p.hurtDir !== undefined ? Math.sign(Math.sin(p.hurtDir - p.yaw)) || 1 : 1);
    }
    if (p.dead) roll = Math.min(1.2, (p.deathAnim = (p.deathAnim || 0) + dt * 2));
    else p.deathAnim = 0;
    const d = p.lookDir();
    if (p.cameraMode === 0) {
      cam.position.copy(camPos);
      cam.rotation.set(p.pitch + pitchAdd, p.yaw, roll);
    } else {
      const back = p.cameraMode === 1 ? [-d[0], -d[1], -d[2]] : d;
      let dist = 4;
      for (const [ox, oy, oz] of [[0, 0, 0], [0.1, 0.1, 0.1], [-0.1, -0.1, 0.1], [0.1, -0.1, -0.1], [-0.1, 0.1, -0.1]]) {
        const h = w.raycast(camPos.x + ox, camPos.y + oy, camPos.z + oz, back[0], back[1], back[2], 4);
        if (h && h.id !== B.TALL_GRASS && BLOCKS[h.id].solid) dist = Math.min(dist, Math.max(0.3, h.dist - 0.25));
      }
      cam.position.set(camPos.x + back[0] * dist, camPos.y + back[1] * dist, camPos.z + back[2] * dist);
      if (p.cameraMode === 1) cam.rotation.set(p.pitch, p.yaw, roll);
      else cam.rotation.set(-p.pitch, p.yaw + Math.PI, -roll);
    }
    const fovMod = p.prevFovMod + (p.fovMod - p.prevFovMod) * a;
    const pull = p.bowCharge > 0 ? Math.min(1, (p.bowCharge + a) / 20) : 0;
    const fov = s.fov * fovMod * (p.eyesInWater ? 0.92 : 1) * (1 - pull * pull * 0.15);
    if (Math.abs(cam.fov - fov) > 0.01) {
      cam.fov = fov;
      cam.updateProjectionMatrix();
    }
    const camBlock = w.getBlock(Math.floor(cam.position.x), Math.floor(cam.position.y), Math.floor(cam.position.z));
    const underwater = camBlock === B.WATER;
    const inLava = camBlock === B.LAVA;
    const env = r.updateEnvironment(w, cam, { underwater, inLava, clouds: s.clouds });
    const gamma = r.uniforms.uGamma.value;
    const envL = { skyDarken: (1 - env.daylight) * 11, gamma };
    this.envLight = envL;

    // seleção e rachaduras
    const hit = p.target;
    if (hit && !p.dead && !this.hideHud) {
      const b = BLOCKS[hit.id];
      const box = b.render === 'cross' ? [0.15, 0, 0.15, 0.85, 0.8, 0.85] : b.render === 'torch' ? [0.38, 0, 0.38, 0.62, 0.62, 0.62] : [0, 0, 0, 1, 1, 1];
      if (b.render === 'torch' && w.getMeta(hit.x, hit.y, hit.z)) box[1] = 0.2, box[4] = 0.8;
      r.setSelection(hit, box);
    } else r.setSelection(null);
    const br = p.breaking;
    r.setCrack(br && hit ? hit : null, br ? Math.min(9, Math.floor(br.progress * 10)) : -1);

    // modelo do jogador (terceira pessoa)
    const pm = this.playerModel;
    pm.root.visible = p.cameraMode !== 0;
    if (pm.root.visible) {
      pm.root.position.set(x, y, z);
      const by = p.prevBodyYaw + wrapA(p.bodyYaw - p.prevBodyYaw) * a;
      pm.root.rotation.y = by + Math.PI;
      pm.setHeld(p.inventory.heldId());
      const amt = p.prevLimbAmount + (p.limbAmount - p.prevLimbAmount) * a;
      pm.animate({
        limbSwing: p.limbSwing + amt * a,
        limbAmount: amt,
        headYaw: wrapA(p.yaw - by),
        headPitch: p.pitch,
        swing: p.prevSwing + (p.swing - p.prevSwing) * a,
        sneak: p.sneaking,
        age: p.ticks + a,
        eating: p.eatTicks > 0 ? p.eatTicks + a : 0,
        death: p.dead ? Math.min(20, (p.deathAnim || 0) * 20) : 0,
        aim: pull > 0,
      });
      pm.setLight(brightnessAt(w, x, y + 1, z, envL.skyDarken, gamma), p.hurtTime > 0, 0, w.getLight(Math.floor(x), Math.floor(y + 1), Math.floor(z)));
      pm.root.traverse((o) => o.layers.enable(2));
    }
    this.entities.render(a, envL);
    this.particles.update(dt, w, cam, window.innerHeight, r.uniforms.uFogColor.value, r.uniforms.uFogFar.value);

    // mão em primeira pessoa
    let vm = null;
    if (p.cameraMode === 0 && !this.hideHud && !p.dead) {
      const v = this.viewModel;
      v.setHeld(p.inventory.heldId());
      const swing = p.prevSwing + (p.swing - p.prevSwing) * a;
      const equip = p.prevEquip + (p.equip - p.prevEquip) * a;
      const L = brightnessAt(w, x, eyeY, z, envL.skyDarken, gamma);
      const swayX = Math.max(-0.08, Math.min(0.08, (p.yaw - this.sway.yaw) * 0.12));
      const swayY = Math.max(-0.08, Math.min(0.08, -(p.pitch - this.sway.pitch) * 0.12));
      v.update({
        bowPull: pull,
        swing, equip, light: L,
        bobX: Math.sin(walk * Math.PI) * bob * 0.5,
        bobY: -Math.abs(Math.cos(walk * Math.PI) * bob),
        swayX, swayY,
        eating: p.eatTicks > 0 ? p.eatTicks + a : 0,
      });
      vm = v;
    }
    const shadowCenter = new THREE.Vector3(x, y + 1, z);
    if (vm) r.render(vm.scene, vm.camera, shadowCenter);
    else r.render(null, null, shadowCenter);

    // HUD
    const hud = document.getElementById('hud');
    hud.style.display = this.hideHud ? 'none' : '';
    if (!this.hideHud) {
      if (p.hurtTime === 9) this.flashTimer = 0.4;
      this.flashTimer = Math.max(0, this.flashTimer - dt);
      this.ui.updateHUD(p, this.flashTimer > 0 && Math.floor(this.flashTimer * 10) % 2 === 0);
      document.getElementById('hurt-flash').style.opacity = p.hurtTime > 0 ? (p.hurtTime / 10) * 0.8 : 0;
      document.getElementById('water-overlay').style.opacity = underwater ? 1 : 0;
      document.getElementById('crosshair').style.display = p.cameraMode === 0 ? '' : 'none';
      if (this.debug) this.updateDebug(hit, env);
      else if (s.fps) {
        const dbg = document.getElementById('debug');
        dbg.classList.remove('hidden');
        dbg.innerHTML = `<span>${this.fps} fps</span>`;
      } else document.getElementById('debug').classList.add('hidden');
    }
    // clima: chuva, neve e raios
    const rain = w.weather.rain;
    r.weather.rain = rain;
    this.weatherFx.update(dt, w, cam, rain, this.particles, this.quality && this.quality.post);
    r.weather.flash = this.weatherFx.flash;
    const roof = (w.getLight(Math.floor(p.x), Math.floor(p.y + 1.6), Math.floor(p.z)) >> 4) / 15;
    this.audio.setRain(rain * (0.25 + 0.75 * roof));
    this.updateSleep(dt);
    // ouvinte do áudio
    Object.assign(this.audio.listener, { x: p.x, y: p.y + 1.6, z: p.z, yaw: p.yaw });
  }

  updateDebug(hit, env) {
    const p = this.player, w = this.world;
    const dbg = document.getElementById('debug');
    dbg.classList.remove('hidden');
    const bx = Math.floor(p.x), by = Math.floor(p.y), bz = Math.floor(p.z);
    const L = w.getLight(bx, by, bz);
    const col = w.terrain.column(bx, bz);
    const deg = (((-p.yaw * 180) / Math.PI) % 360 + 540) % 360 - 180;
    const facing = ['Sul (+Z)', 'Oeste (-X)', 'Norte (-Z)', 'Leste (+X)'][(Math.round(((deg + 180) % 360) / 90) + 2) % 4];
    let meshed = 0;
    for (const c of w.chunks.values()) if (c.meshes) meshed++;
    const lines = [
      `Blocos 1.0 (${this.fps} fps)`,
      `XYZ: ${p.x.toFixed(3)} / ${p.y.toFixed(3)} / ${p.z.toFixed(3)}`,
      `Bloco: ${bx} ${by} ${bz}   Chunk: ${bx >> 4} ${bz >> 4}`,
      `Olhando para: ${facing} (${deg.toFixed(1)} / ${((p.pitch * 180) / Math.PI).toFixed(1)})`,
      `Bioma: ${BIOME_NAMES[col.biome]}`,
      `Luz: céu ${L >> 4}, bloco ${L & 15}   Dia: ${(env.daylight * 100).toFixed(0)}%   Hora: ${w.time}`,
      `Chunks: ${w.chunks.size} carregados, ${meshed} com malha   Entidades: ${this.entities.list.length}   Partículas: ${this.particles.list.length}`,
      `Câmera: ${['1ª pessoa', '3ª pessoa (atrás)', '3ª pessoa (frente)'][p.cameraMode]}   Modo: ${p.mode === 'creative' ? 'Criativo' : 'Sobrevivência'}${p.flying ? ' (voando)' : ''}`,
      hit ? `Mirando: ${itemName(hit.id)} em ${hit.x} ${hit.y} ${hit.z}` : p.targetMob ? `Mirando: ${p.targetMob.type} (${p.targetMob.health} ♥)` : '',
    ];
    dbg.innerHTML = lines.filter(Boolean).map((l) => `<span>${l.replace(/</g, '&lt;')}</span>`).join('\n');
  }
}

function wrapA(v) {
  while (v > Math.PI) v -= Math.PI * 2;
  while (v < -Math.PI) v += Math.PI * 2;
  return v;
}

window.game = new Game();

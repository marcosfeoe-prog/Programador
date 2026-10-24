// Instinto Jurássico — orquestra renderização, mundo, criaturas, IA,
// jogador, ciclo de dia e noite, população e telas.
import * as THREE from 'three';
import { World, PLAY_RADIUS, WATER_Y } from './world.js';
import { Sky } from './sky.js';
import { Creature } from './creature.js';
import { Brain, Group } from './ai.js';
import { PlayerController } from './player.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { UI } from './ui.js';
import { SPECIES, SPECIES_ORDER, BEHAVIOR, POPULATION, growthStage } from './species.js';
import { prepareSpecies } from './dinoModel.js';
import { setTextureSize } from './textures.js';
import { clamp, lerp, damp, isMobile, yieldFrame, mulberry32 } from './util.js';

const QUALITY = {
  low: { pixelRatio: 0.8, shadows: 0, shadowRange: 0, terrainRes: 160, vegetation: 1300, bushes: 230, texSize: 256, model: 'low', fogFar: 270, pop: 0.6, antialias: false },
  medium: { pixelRatio: 1.25, shadows: 1024, shadowRange: 45, terrainRes: 220, vegetation: 2400, bushes: 300, texSize: 512, model: 'high', fogFar: 340, pop: 0.8, antialias: true },
  high: { pixelRatio: 2, shadows: 2048, shadowRange: 60, terrainRes: 256, vegetation: 3800, bushes: 340, texSize: 512, model: 'high', fogFar: 430, pop: 1, antialias: true },
};

const HOURS_PER_SEC = 24 / 1200; // um dia inteiro = 20 minutos

function loadSettings() {
  const mobile = isMobile();
  const def = { quality: mobile ? 'low' : 'medium', volume: 0.8, sensitivity: 1, invertY: false, showFps: false };
  try {
    Object.assign(def, JSON.parse(localStorage.getItem('dinos-settings') || '{}'));
  } catch (e) {
    /* sem armazenamento */
  }
  const q = new URLSearchParams(location.search).get('quality');
  if (q && QUALITY[q]) def.quality = q;
  def.mobile = mobile;
  return def;
}

function saveSettings(s) {
  try {
    const { mobile, ...rest } = s;
    localStorage.setItem('dinos-settings', JSON.stringify(rest));
  } catch (e) {
    /* sem armazenamento */
  }
}

class Game {
  constructor() {
    this.settings = loadSettings();
    this.quality = { ...QUALITY[this.settings.quality], name: this.settings.quality };
    this.records = {};
    try {
      this.records = JSON.parse(localStorage.getItem('dinos-records') || '{}');
    } catch (e) {
      this.records = {};
    }
    if (this.settings.mobile) document.body.classList.add('mobile');
    this.canvas = document.getElementById('game');
    this.time = 0;
    this.frame = 0;
    this.hour = 8;
    this.day = 1;
    this.mode = 'loading';
    this.creatures = [];
    this.groups = [];
    this.player = null;
    this.audio = new AudioEngine();
    this.audio.volume = this.settings.volume;
  }

  async init() {
    const q = this.quality;
    const progress = (p, t) => {
      document.getElementById('load-fill').style.width = `${Math.round(p * 100)}%`;
      document.getElementById('load-text').textContent = t;
    };
    progress(0.05, 'Criando o mundo…');
    await yieldFrame();
    setTextureSize(q.texSize);

    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: q.antialias, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    r.setSize(window.innerWidth, window.innerHeight);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.0;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = q.shadows > 0;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.15, 1200);
    window.addEventListener('resize', () => this.resize());

    this.sky = new Sky(this.scene, q);
    progress(0.15, 'Esculpindo o relevo e plantando a floresta…');
    await yieldFrame();
    this.world = new World(this.scene, q);
    this.envTimer = 0;
    this.pmrem = new THREE.PMREMGenerator(r);

    let i = 0;
    for (const id of SPECIES_ORDER) {
      progress(0.35 + (i++ / SPECIES_ORDER.length) * 0.45, `Pintando a pele: ${SPECIES[id].name}…`);
      await yieldFrame();
      prepareSpecies(id, q.model);
    }
    progress(0.85, 'Soltando os dinossauros…');
    await yieldFrame();

    this.ui = new UI(this);
    this.ui.buildMapImage(this.world);
    this.input = new Input(this.canvas, this.settings);
    this.pc = new PlayerController(this);
    this.populate();
    this.setupScreens();
    this.enterMenu();
    progress(1, 'Pronto!');
    // pré-compila os shaders antes de mostrar
    r.compile(this.scene, this.camera);
    document.getElementById('loading').classList.add('hidden');
    this.last = performance.now();
    this.fpsT = 0;
    this.fpsN = 0;
    r.setAnimationLoop(() => this.loop());
  }

  resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  // ------------------------------------------------------------ população
  spawnGroup(id, near = null) {
    const rnd = Math.random;
    const beh = BEHAVIOR[id];
    let spot = null;
    for (let k = 0; k < 30; k++) {
      const s = this.world.randomLand(rnd, 30, PLAY_RADIUS - 40, 1.5);
      const pp = near || (this.player ? this.player.pos : null);
      if (!pp || Math.hypot(s.x - pp.x, s.z - pp.z) > (near ? 0 : 140)) {
        spot = s;
        break;
      }
    }
    if (!spot) return null;
    const g = new Group(id);
    const n = beh.group[0] + Math.floor(Math.random() * (beh.group[1] - beh.group[0] + 1));
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const d = 3 + Math.random() * 8 * Math.sqrt(SPECIES[id].sizeClass);
      let x = spot.x + Math.cos(a) * d;
      let z = spot.z + Math.sin(a) * d;
      if (this.world.height(x, z) < WATER_Y + 0.3) {
        x = spot.x;
        z = spot.z;
      }
      const growth = k === 0 ? 1 : 0.45 + Math.random() * 0.55;
      const c = new Creature(this, id, { x, z, growth, hunger: 0.5 + Math.random() * 0.5, thirst: 0.5 + Math.random() * 0.5 });
      c.brain = new Brain(c, g);
      g.members.push(c);
      this.creatures.push(c);
    }
    this.groups.push(g);
    return g;
  }

  populate() {
    for (const id in POPULATION) {
      const n = Math.max(1, Math.round(POPULATION[id] * this.quality.pop));
      for (let k = 0; k < n; k++) this.spawnGroup(id);
    }
  }

  managePopulation() {
    // remove carcaças consumidas/antigas e longe do jogador
    const pp = this.player ? this.player.pos : this.camera.position;
    for (let i = this.creatures.length - 1; i >= 0; i--) {
      const c = this.creatures[i];
      if (c === this.player || c === this.preview) continue;
      if (c.dead && (c.meat <= 0.5 || c.deadTime > 420) && c.pos.distanceTo(pp) > 60) {
        c.dispose();
        this.creatures.splice(i, 1);
        if (c.brain) c.brain.group.members = c.brain.group.members.filter((m) => m !== c);
      }
    }
    this.groups = this.groups.filter((g) => g.members.some((m) => !m.dead));
    // repõe espécies que sumiram
    for (const id in POPULATION) {
      const want = Math.max(1, Math.round(POPULATION[id] * this.quality.pop));
      const have = this.groups.filter((g) => g.species === id).length;
      if (have < want) {
        this.spawnGroup(id);
        break;
      }
    }
  }

  // ------------------------------------------------------------ telas
  setupScreens() {
    const $ = (id) => document.getElementById(id);
    this.ui.buildMenu((id) => this.setPreview(id));
    $('btn-play').addEventListener('click', () => this.startGame(this.ui.selected));
    $('btn-settings').addEventListener('click', () => this.openSettings());
    $('btn-help').addEventListener('click', () => this.ui.show('help'));
    $('btn-help-close').addEventListener('click', () => this.ui.show('help', false));
    $('btn-resume').addEventListener('click', () => this.resume());
    $('btn-psettings').addEventListener('click', () => this.openSettings());
    $('btn-phelp').addEventListener('click', () => this.ui.show('help'));
    $('btn-quit').addEventListener('click', () => this.quitToMenu());
    $('btn-respawn').addEventListener('click', () => this.startGame(this.player ? this.player.id : this.ui.selected));
    $('btn-death-menu').addEventListener('click', () => this.quitToMenu());

    const qs = $('set-quality');
    const vol = $('set-volume');
    const sens = $('set-sens');
    const inv = $('set-invert');
    const fps = $('set-fps');
    qs.value = this.settings.quality;
    vol.value = this.settings.volume;
    sens.value = this.settings.sensitivity;
    inv.checked = this.settings.invertY;
    fps.checked = this.settings.showFps;
    vol.addEventListener('input', () => {
      this.settings.volume = +vol.value;
      this.audio.setVolume(+vol.value);
      saveSettings(this.settings);
    });
    sens.addEventListener('input', () => {
      this.settings.sensitivity = +sens.value;
      saveSettings(this.settings);
    });
    inv.addEventListener('change', () => {
      this.settings.invertY = inv.checked;
      saveSettings(this.settings);
    });
    fps.addEventListener('change', () => {
      this.settings.showFps = fps.checked;
      saveSettings(this.settings);
      this.ui.show('fps', fps.checked);
    });
    qs.addEventListener('change', () => {
      this.settings.quality = qs.value;
      saveSettings(this.settings);
      const u = new URL(location.href);
      u.searchParams.delete('quality');
      location.href = u.toString();
    });
    $('btn-set-close').addEventListener('click', () => this.ui.show('settings', false));
    this.ui.show('fps', this.settings.showFps);
  }

  openSettings() {
    this.ui.show('settings');
  }

  enterMenu() {
    this.mode = 'menu';
    this.input.enabled = false;
    this.input.unlock();
    this.ui.show('menu');
    this.ui.show('hud', false);
    this.ui.show('pause', false);
    this.ui.show('death', false);
    this.ui.show('bigmap', false);
    // local cênico para a vitrine: perto da água
    if (!this.showcase) {
      const w = this.world.nearestWater(60, 40) || { x: 0, z: 0 };
      let best = null;
      for (let k = 0; k < 60; k++) {
        const a = (k / 60) * Math.PI * 2;
        const x = w.x + Math.cos(a) * 22;
        const z = w.z + Math.sin(a) * 22;
        if (this.world.okSpot(x, z, 1.2, 0.4)) {
          best = { x, z, yaw: Math.atan2(w.x - x, w.z - z) };
          break;
        }
      }
      this.showcase = best || { x: 0, z: 0, yaw: 0 };
    }
    this.setPreview(this.ui.selected);
    this.menuT = 0;
  }

  setPreview(id) {
    if (this.preview) {
      this.preview.dispose();
      this.creatures = this.creatures.filter((c) => c !== this.preview);
    }
    const s = this.showcase;
    this.preview = new Creature(this, id, { x: s.x, z: s.z, yaw: s.yaw + 0.6, growth: 1 });
    this.preview.isPreview = true;
    this.creatures.push(this.preview);
    this.previewRoarT = 2.5;
    // afasta outros dinossauros da vitrine
    for (const c of this.creatures) {
      if (c !== this.preview && !c.dead && c.pos.distanceTo(this.preview.pos) < 25) {
        c.pos.x += (c.pos.x - s.x) * 2 + 30;
        c.pos.z += (c.pos.z - s.z) * 2;
      }
    }
  }

  startGame(id) {
    this.audio.init();
    this.ui.show('menu', false);
    this.ui.show('death', false);
    this.ui.show('pause', false);
    this.ui.show('hud');
    this.ui.show('touch', this.settings.mobile);
    if (this.preview) {
      this.preview.dispose();
      this.creatures = this.creatures.filter((c) => c !== this.preview);
      this.preview = null;
    }
    if (this.player) {
      this.player.dispose();
      this.creatures = this.creatures.filter((c) => c !== this.player);
    }
    // nasce longe de predadores grandes
    let spot = null;
    for (let k = 0; k < 40; k++) {
      const s = this.world.randomLand(Math.random, 0, PLAY_RADIUS - 80, 1.5);
      const danger = this.creatures.some((c) => !c.dead && c.spec.diet === 'carnivore' && c.pos.distanceTo(new THREE.Vector3(s.x, c.pos.y, s.z)) < 120);
      const water = this.world.nearestWater(s.x, s.z);
      if (!danger && water && water.d < 160) {
        spot = s;
        break;
      }
    }
    spot = spot || this.world.randomLand();
    const p = new Creature(this, id, { player: true, x: spot.x, z: spot.z, growth: 0.3, hunger: 0.75, thirst: 0.7 });
    this.player = p;
    this.creatures.push(p);
    this.pc.attach(p);
    this.pc.camYaw = p.yaw;
    this.stats = { start: this.time, startDay: this.day + this.hour / 24, kills: 0 };
    this.mode = 'play';
    this.input.enabled = true;
    if (!this.settings.mobile) this.input.lock();
    this.ui.message(`Você é um filhote de ${SPECIES[id].name}. Coma, beba e cresça!`, 6);
    const key = this.settings.mobile ? 'botão Ação' : 'E';
    this.ui.message(SPECIES[id].diet === 'carnivore' ? `Dica: cace presas menores e coma a carcaça (${key}).` : `Dica: arbustos com frutas vermelhas são comida (${key}).`, 7);
  }

  pause() {
    if (this.mode !== 'play') return;
    this.mode = 'paused';
    this.input.unlock();
    this.ui.show('pause');
  }

  resume() {
    this.ui.show('pause', false);
    this.ui.show('settings', false);
    this.ui.show('help', false);
    this.mode = 'play';
    if (!this.settings.mobile) this.input.lock();
    this.last = performance.now();
  }

  quitToMenu() {
    if (this.player) {
      this.saveRecord();
      this.player.dispose();
      this.creatures = this.creatures.filter((c) => c !== this.player);
      this.player = null;
    }
    this.enterMenu();
  }

  saveRecord() {
    const p = this.player;
    if (!p || !this.stats) return;
    const days = this.day + this.hour / 24 - this.stats.startDay;
    const rec = this.records[p.id];
    if (!rec || days > rec.days) {
      this.records[p.id] = { days, growth: p.growth, kills: p.kills };
      try {
        localStorage.setItem('dinos-records', JSON.stringify(this.records));
      } catch (e) {
        /* sem armazenamento */
      }
    }
  }

  // ------------------------------------------------------------ eventos
  onFootstep(c, leg) {
    if (this.mode === 'loading') return;
    const listener = this.camera.position;
    const d = c.pos.distanceTo(listener);
    const size = c.spec.sizeClass * c.scale;
    if (d < 40 + size * 25) this.audio.footstep(c);
    if (size > 3 && this.pc.c) {
      const k = (size - 3) * 0.1 * clamp(1 - d / (35 * size * 0.3), 0, 1);
      if (k > 0) this.pc.addShake(k);
    }
  }

  onRoar(c) {
    // herbívoros por perto se assustam com rugidos de carnívoros grandes
    for (const o of this.creatures) {
      if (o === c || o.dead || !o.brain) continue;
      const d = o.pos.distanceTo(c.pos);
      if (d > 70) continue;
      if (c.spec.diet === 'carnivore' && c.power > o.power * 0.5 && o.brain.beh.fear > 0.3) {
        o.brain.think = Math.min(o.brain.think, 0.1 + Math.random() * 0.3);
        if (o.action === 'sleep' || o.action === 'rest') o.action = null;
        if (o.brain.state === 'sleep' || o.brain.state === 'rest') o.brain.set('wander');
      }
    }
  }

  onHurt(c, amount, from) {
    this.audio.hurt(c);
    if (c === this.player) {
      this.ui.flash(clamp(amount / c.maxHealth * 4, 0.25, 0.9));
      this.pc.addShake(clamp(amount / c.maxHealth * 3, 0.15, 0.8));
      if (from && (!this._hurtMsgT || this.time - this._hurtMsgT > 6)) {
        this._hurtMsgT = this.time;
        this.ui.message(`Atacado por um ${from.spec.name}!`);
      }
    }
    if (from === this.player) this.lastTarget = c;
  }

  onDeath(c) {
    if (c === this.player) {
      this.mode = 'dying';
      this.deathT = 0;
      this.input.unlock();
      this.saveRecord();
      return;
    }
    if (c.lastAttacker === this.player) {
      this.ui.message(`Você abateu um ${c.spec.name}!`);
      this.stats.kills++;
    }
  }

  showDeath() {
    const p = this.player;
    const $ = (id) => document.getElementById(id);
    $('death-cause').textContent = p.cause;
    const days = this.day + this.hour / 24 - this.stats.startDay;
    const rec = this.records[p.id];
    $('death-stats').innerHTML = `Sobreviveu <b>${days.toFixed(1)} dias</b><br>Fase: <b>${growthStage(p.growth)}</b> (${Math.floor(p.growth * 100)}%)<br>Abates: <b>${p.kills}</b>${rec ? `<br>Recorde da espécie: ${rec.days.toFixed(1)} dias` : ''}`;
    $('btn-respawn').textContent = `Renascer como ${p.spec.name}`;
    this.ui.show('death');
    this.mode = 'dead';
  }

  // ------------------------------------------------------------ laço
  loop() {
    const now = performance.now();
    let dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.frame++;
    this.fpsT += dt;
    this.fpsN++;
    if (this.fpsT > 0.5) {
      if (this.settings.showFps) document.getElementById('fps').textContent = `${Math.round(this.fpsN / this.fpsT)} FPS`;
      this.fpsT = 0;
      this.fpsN = 0;
    }
    const input = this.input;
    if (input.pressed('menu') || input.pressed('unlock')) {
      if (this.mode === 'play') this.pause();
      else if (this.mode === 'paused') this.resume();
    }
    if (input.pressed('fullscreen')) {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      else document.exitFullscreen?.();
    }
    if (input.pressed('hud') && this.mode === 'play') {
      this.ui.hudVisible = !this.ui.hudVisible;
      document.getElementById('hud').style.opacity = this.ui.hudVisible ? '1' : '0';
    }
    if (input.pressed('map') && (this.mode === 'play' || this.mode === 'paused')) {
      this.bigMap = !this.bigMap;
      this.ui.show('bigmap', this.bigMap);
    }

    const paused = this.mode === 'paused';
    if (!paused) this.update(dt);
    else if (this.bigMap && this.player) this.ui.drawBigMap(this.player, this.creatures);
    input.endFrame();
    this.render();
  }

  update(dt) {
    this.time += dt;
    this.hour += dt * HOURS_PER_SEC * (this.player && this.player.action === 'sleep' ? 3 : 1);
    if (this.hour >= 24) {
      this.hour -= 24;
      this.day++;
      if (this.mode === 'play') this.ui.message(`Amanhecer do dia ${this.day}.`);
    }
    const focus = this.player ? this.player.pos : this.preview ? this.preview.pos : this.camera.position;
    this.sky.update(this.hour, focus, dt);
    this.renderer.toneMappingExposure = lerp(1.45, 1.0, this.sky.daylight);
    this.world.update(dt, this.time);

    // controle do jogador
    if (this.mode === 'play') this.pc.update(dt, this.input, this.settings);
    else if (this.player && this.mode !== 'play') this.player.ctrl.speed = 0;

    // IA
    for (const c of this.creatures) if (c.brain) c.brain.update(dt, this);
    if (this.preview) this.updatePreview(dt);

    // nível de detalhe pelo distância da câmera
    const cam = this.camera.position;
    const far = this.scene.fog.far + 40;
    for (const c of this.creatures) {
      const d = c.pos.distanceTo(cam) - c.radius;
      c.detail = c === this.player || c === this.preview ? 2 : d < 75 ? 2 : d < 200 ? 1 : 0;
      c.root.visible = d < far;
      c.update(dt);
    }
    this.separate();

    if (this.frame % 120 === 0) this.managePopulation();

    // câmera
    if (this.player) {
      this.pc.updateCamera(dt, this.camera);
      if (this.mode === 'dying') {
        this.deathT += dt;
        if (this.deathT > 3) this.showDeath();
      }
    } else this.updateMenuCamera(dt);

    // ambiente sonoro e ouvinte
    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    this.audio.setListener(this.camera.position, Math.atan2(fwd.x, fwd.z));
    if (this.audio.ctx) {
      const p = this.player;
      const nw = this.world.nearestWater(cam.x, cam.z);
      this.audio.updateAmbient(dt, {
        night: this.sky.night,
        nearWater: nw ? clamp(1 - nw.d / 60, 0, 1) : 0,
        windy: clamp((cam.y - 10) / 40, 0, 1),
        health: p ? p.health / p.maxHealth : 1,
        playing: this.mode === 'play',
      });
    }

    // HUD
    if (this.player && (this.mode === 'play' || this.mode === 'dying')) {
      this.ui.updateHUD(dt, this.player, this.pc);
      if (this.frame % 3 === 0) this.ui.drawMinimap(this.player, this.creatures);
      if (this.bigMap && this.frame % 10 === 0) this.ui.drawBigMap(this.player, this.creatures);
      if (this.frame % 6 === 0) this.ui.updateTarget(this.pickTarget(), this.player);
    }

    // reflexo do céu na água e na pele
    this.envTimer -= dt;
    if (this.envTimer <= 0 && this.quality.name !== 'low') {
      this.envTimer = 8;
      this.updateEnvironment();
    }
  }

  // empurra criaturas que se sobrepõem
  separate() {
    const list = this.creatures;
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead) continue;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead) continue;
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const min = (a.radius + b.radius) * 0.9;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-6) continue;
        const d = Math.sqrt(d2);
        const push = (min - d) / d;
        const ma = a.spec.sizeClass * a.scale ** 3;
        const mb = b.spec.sizeClass * b.scale ** 3;
        const ka = mb / (ma + mb);
        a.pos.x -= dx * push * ka;
        a.pos.z -= dz * push * ka;
        b.pos.x += dx * push * (1 - ka);
        b.pos.z += dz * push * (1 - ka);
      }
    }
  }

  pickTarget() {
    const p = this.player;
    const cam = this.camera;
    const fwd = new THREE.Vector3();
    cam.getWorldDirection(fwd);
    let best = null;
    let bestScore = -Infinity;
    const v = new THREE.Vector3();
    for (const c of this.creatures) {
      if (c === p) continue;
      const d = c.pos.distanceTo(p.pos);
      if (d > 45 + c.radius * 4) continue;
      v.copy(c.pos).setY(c.pos.y + c.data.hipY * c.scale * 0.7).sub(cam.position).normalize();
      const dot = v.dot(fwd);
      if (dot < 0.9) continue;
      const score = dot * 3 - d / 45 + (c === this.lastTarget ? 0.5 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = c;
      }
    }
    return best;
  }

  updatePreview(dt) {
    const p = this.preview;
    p.ctrl.speed = 0;
    p.ctrl.yaw = p.yaw;
    this.previewRoarT -= dt;
    if (this.previewRoarT <= 0) {
      this.previewRoarT = 9 + Math.random() * 6;
      p.roar();
    }
    p.anim.lookYaw = Math.sin(this.time * 0.4) * 0.5;
    p.hunger = p.thirst = 1;
    p.health = p.maxHealth;
  }

  updateMenuCamera(dt) {
    const p = this.preview;
    if (!p) return;
    this.menuT += dt;
    const a = p.yaw + 0.9 + Math.sin(this.menuT * 0.12) * 0.5;
    const d = p.spec.camDist * 1.25;
    const tgt = new THREE.Vector3(p.pos.x, p.pos.y + p.data.hipY * 0.95, p.pos.z);
    const pos = new THREE.Vector3(tgt.x + Math.sin(a) * d, tgt.y + d * 0.18, tgt.z + Math.cos(a) * d);
    const minY = this.world.height(pos.x, pos.z) + 0.8;
    pos.y = Math.max(pos.y, minY);
    this.camera.position.copy(pos);
    this.camera.lookAt(tgt);
  }

  updateEnvironment() {
    // gera um mapa de ambiente apenas do céu (reflexos suaves)
    const sky = this.sky.mesh;
    if (!this._envScene) {
      this._envScene = new THREE.Scene();
    }
    const parent = sky.parent;
    const pos = sky.position.clone();
    this._envScene.add(sky);
    sky.position.set(0, 0, 0);
    if (this.envRT) this.envRT.dispose();
    this.envRT = this.pmrem.fromScene(this._envScene, 0, 0.1, 1100);
    parent.add(sky);
    sky.position.copy(pos);
    this.scene.environment = this.envRT.texture;
    this.scene.environmentIntensity = lerp(0.12, 0.5, this.sky.daylight);
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

const game = new Game();
window.__game = game;
game.init().catch((e) => {
  console.error(e);
  document.getElementById('load-text').textContent = 'Erro ao iniciar: ' + e.message;
});

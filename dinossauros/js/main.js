// Instinto Jurássico — jogo 3D de sobrevivência de dinossauros.
// Orquestra renderização, mundo, criaturas, IA, jogador, áudio, HUD e menus.
import * as THREE from 'three';
import { SPECIES, PLAYABLE, QUALITY, loadSettings, saveSettings, loadRecords, saveRecords, stageName } from './config.js';
import { setTextureQuality, skinTextures } from './textures.js';
import { World, HALF } from './world.js';
import { Creature } from './creature.js';
import { Population } from './ai.js';
import { PlayerController } from './player.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { HUD } from './ui.js';
import { clamp, yieldFrame } from './util.js';

const $ = (id) => document.getElementById(id);

class Game {
  constructor() {
    this.settings = loadSettings();
    this.settings.mobile = matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|Mobile/i.test(navigator.userAgent);
    if (this.settings.mobile) document.body.classList.add('mobile');
    this.quality = QUALITY[this.settings.quality] || QUALITY.media;
    this.state = 'loading';
    this.creatures = [];
    this.player = null;
    this.selected = PLAYABLE[0].id;
    this.records = loadRecords();
    this.focus = new THREE.Vector3();
    this.timeScale = 1;
  }

  progress(p, text) {
    $('load-fill').style.width = Math.round(p * 100) + '%';
    if (text) $('load-text').textContent = text;
    return yieldFrame();
  }

  async init() {
    const canvas = $('game');
    const q = this.quality;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: q.label !== 'Baixa', powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.pixelRatio));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = q.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;
    setTextureQuality(this.settings.quality, renderer.capabilities.getMaxAnisotropy());
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1400);
    window.addEventListener('resize', () => this.resize());

    this.audio = new AudioEngine();
    this.audio.setVolume(this.settings.volume);
    this.input = new Input(canvas, this.settings);
    this.hud = new HUD(this);

    await this.progress(0.05, 'Esculpindo o terreno…');
    this.world = new World(this.scene, q, renderer);
    await this.progress(0.45, 'Desenhando o mapa…');
    this.hud.buildMap(this.world);
    // gera texturas e malhas de cada espécie antes de começar
    const ids = Object.keys(SPECIES);
    for (let i = 0; i < ids.length; i++) {
      await this.progress(0.5 + (i / ids.length) * 0.35, `Criando ${SPECIES[ids[i]].name}…`);
      const s = SPECIES[ids[i]];
      skinTextures(s.skin, s.id.length * 13 + 5);
    }
    await this.progress(0.88, 'Povoando o vale…');
    this.spawn = this.findSpawn();
    this.focus.set(this.spawn.x, 0, this.spawn.z);
    this.population = new Population(this);
    this.population.initial(this.focus);
    this.controller = new PlayerController(this, this.camera, this.input);
    await this.progress(1, 'Pronto');
    this.setupMenus();
    this.showMenu();
    $('loading').classList.add('hidden');
    this.last = performance.now();
    renderer.setAnimationLoop(() => this.frame());
    // compila os shaders já com tudo na cena
    renderer.compile(this.scene, this.camera);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.state === 'menu') this.menuView();
  }

  // ponto de nascimento: campo aberto perto da água
  findSpawn() {
    const w = this.world;
    let best = { x: 0, z: 0 };
    let bs = -1e9;
    for (let i = 0; i < 400; i++) {
      const x = (Math.random() * 2 - 1) * (HALF * 0.6);
      const z = (Math.random() * 2 - 1) * (HALF * 0.6);
      const h = w.height(x, z);
      if (h < 1.5 || h > 14 || w.slope(x, z) > 0.25) continue;
      const wp = w.nearestWater(x, z, 90);
      if (!wp) continue;
      const dw = Math.hypot(wp.x - x, wp.z - z);
      const s = -Math.abs(dw - 30) + (w.nearestFood(x, z, 25, 'plant') ? 20 : 0) + Math.random() * 10;
      if (s > bs) {
        bs = s;
        best = { x, z };
      }
    }
    return best;
  }

  addCreature(c) {
    this.creatures.push(c);
    this.scene.add(c.group);
  }

  // ------------------------------------------------------------------ menus
  setupMenus() {
    const box = $('species');
    box.innerHTML = '';
    for (const s of PLAYABLE) {
      const b = document.createElement('button');
      b.className = 'sp-card';
      b.dataset.id = s.id;
      b.innerHTML = `<div class="n">${s.short}</div><div class="d">${s.diet === 'carnivoro' ? 'Carnívoro' : 'Herbívoro'}</div>`;
      b.onclick = () => {
        this.audio.init();
        this.audio.ui();
        this.select(s.id);
      };
      box.appendChild(b);
    }
    $('btn-play').onclick = () => this.startGame();
    $('btn-options').onclick = $('btn-options2').onclick = () => this.openOptions();
    $('btn-howto').onclick = () => $('howto').classList.remove('hidden');
    $('btn-howto-close').onclick = () => $('howto').classList.add('hidden');
    $('btn-resume').onclick = () => this.resume();
    $('btn-quit').onclick = $('btn-quit2').onclick = () => this.quitToMenu();
    $('btn-respawn').onclick = () => this.respawn();
    $('bigmap').onclick = () => $('bigmap').classList.add('hidden');
    // opções
    const sel = $('opt-quality');
    sel.innerHTML = Object.entries(QUALITY)
      .map(([k, v]) => `<option value="${k}">${v.label}</option>`)
      .join('');
    $('btn-opt-close').onclick = () => {
      const s = this.settings;
      const nq = sel.value;
      s.sensitivity = Number($('opt-sens').value);
      s.volume = Number($('opt-vol').value);
      s.invertY = $('opt-invert').checked;
      this.audio.setVolume(s.volume);
      const changed = nq !== s.quality;
      s.quality = nq;
      saveSettings(s);
      $('options').classList.add('hidden');
      if (changed) location.reload();
    };
    this.select(this.selected);
  }

  openOptions() {
    const s = this.settings;
    $('opt-quality').value = s.quality;
    $('opt-sens').value = s.sensitivity;
    $('opt-vol').value = s.volume;
    $('opt-invert').checked = s.invertY;
    $('options').classList.remove('hidden');
  }

  select(id) {
    this.selected = id;
    const s = SPECIES[id];
    for (const b of document.querySelectorAll('.sp-card')) b.classList.toggle('sel', b.dataset.id === id);
    const bar = (v, max) => `<i style="width:${clamp((v / max) * 100, 6, 100)}%"></i>`;
    $('sp-info').innerHTML = `<b>${s.name}</b> — ${s.desc}
      <div class="meters">
        <span>Vida</span>${bar(s.stats.health, 1000)}
        <span>Ataque</span>${bar(s.stats.damage, 210)}
        <span>Velocidade</span>${bar(s.stats.run, 11.5)}
        <span>Agilidade</span>${bar(s.stats.turn, 4.2)}
        <span>Fome</span>${bar(s.survival.hunger, 12)}
      </div>`;
    const r = this.records[id];
    $('records').textContent = r ? `Recorde: ${r.days} dia(s) · ${stageName(r.growth)} (${Math.round(r.growth * 100)}%) · ${r.kills} abate(s)` : 'Ainda sem recorde para esta espécie.';
    // prévia 3D (adulto) no lugar de nascimento
    if (this.preview) this.preview.dispose();
    const p = new Creature(this, s, { growth: 1, x: this.spawn.x, z: this.spawn.z, yaw: 0.6 });
    p.brain = null;
    this.preview = p;
    this.scene.add(p.group);
    this.orbit = 0;
  }

  menuView() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (w > 700) this.camera.setViewOffset(w, h, -w * 0.2, 0, w, h);
    else this.camera.clearViewOffset();
  }

  showMenu() {
    this.state = 'menu';
    $('menu').classList.remove('hidden');
    this.hud.show(false);
    $('touch').classList.remove('play');
    this.input.enabled = false;
    this.menuView();
  }

  startGame() {
    this.audio.init();
    $('menu').classList.add('hidden');
    this.camera.clearViewOffset();
    if (this.preview) {
      this.preview.dispose();
      this.preview = null;
    }
    this.spawnPlayer();
  }

  spawnPlayer() {
    const s = SPECIES[this.selected];
    const sp = this.findSpawn();
    // longe de carnívoros adultos
    const p = new Creature(this, s, { growth: 0, isPlayer: true, x: sp.x, z: sp.z, yaw: Math.random() * 6.28 });
    p.hunger = 80;
    p.thirst = 75;
    this.player = p;
    this.addCreature(p);
    this.controller.attach(p);
    this.startDay = this.world.day + this.world.time / 24;
    this.state = 'play';
    this.hud.show(true);
    $('death').classList.add('hidden');
    $('touch').classList.add('play');
    this.input.reset();
    this.input.enabled = true;
    this.input.lock();
    this.hud.toast(`Você nasceu: ${s.name} filhote. Coma, beba e cresça!`, 'good');
    setTimeout(() => {
      if (this.player === p && !p.dead) this.hud.toast(s.diet === 'carnivoro' ? 'Carnívoro: procure carcaças ou cace presas pequenas.' : 'Herbívoro: coma samambaias e fique perto das manadas.');
    }, 4500);
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    $('pause').classList.remove('hidden');
    this.input.unlock();
    this.input.enabled = false;
  }

  resume() {
    $('pause').classList.add('hidden');
    $('options').classList.add('hidden');
    this.state = 'play';
    this.input.reset();
    this.input.enabled = true;
    this.input.lock();
    this.last = performance.now();
  }

  quitToMenu() {
    $('pause').classList.add('hidden');
    $('death').classList.add('hidden');
    if (this.player && !this.player.dead) {
      this.player.dispose();
      this.creatures = this.creatures.filter((c) => c !== this.player);
    }
    this.player = null;
    this.controller.c = null;
    this.input.unlock();
    this.select(this.selected);
    this.showMenu();
  }

  respawn() {
    $('death').classList.add('hidden');
    this.spawnPlayer();
  }

  // ------------------------------------------------------------------ eventos
  onDamage(c, dmg, from) {
    if (c === this.player) {
      this.hud.flash(0.25 + (dmg / c.maxHp) * 2);
      this.controller.shake += 0.15 + (dmg / c.maxHp) * 1.5;
      if (from && (!this._lastAtk || this._lastAtk !== from)) {
        this._lastAtk = from;
        this.hud.toast(`Você foi atacado por ${from.spec.short}!`, 'warn');
      }
    }
    if (from === this.player) this.controller.shake += 0.06;
  }

  onDeath(c, from) {
    if (c === this.player) {
      let cause;
      if (from) cause = `Morto por ${from.spec.name} (${from.stage.toLowerCase()}).`;
      else if (c.thirst <= 0) cause = 'Morreu de sede.';
      else if (c.hunger <= 0) cause = 'Morreu de fome.';
      else cause = 'Morreu por perda de sangue.';
      this.deathCause = cause;
      this.state = 'dead';
      this.input.unlock();
      this.input.enabled = false;
      setTimeout(() => this.showDeath(), 2600);
    } else if (from === this.player) {
      this.hud.toast(`Você abateu: ${c.spec.short} (${c.stage.toLowerCase()})`, 'good');
    }
  }

  showDeath() {
    const p = this.player;
    const days = this.world.day + this.world.time / 24 - this.startDay;
    const s = p.spec;
    $('death-title').textContent = `${s.short} morreu`;
    $('death-cause').textContent = this.deathCause;
    const hours = days * 24;
    $('death-stats').innerHTML = `
      <span>Tempo sobrevivido</span><b>${hours < 24 ? hours.toFixed(1) + ' h' : days.toFixed(1) + ' dias'} (jogo)</b>
      <span>Estágio alcançado</span><b>${p.stage} (${Math.round(p.growth * 100)}%)</b>
      <span>Tamanho</span><b>${(p.L.length * p.scale).toFixed(1)} m</b>
      <span>Abates</span><b>${p.kills}</b>`;
    const r = this.records[s.id] || { days: 0, growth: 0, kills: 0 };
    const nd = Math.max(r.days, Math.floor(days * 10) / 10);
    const rec = { days: nd, growth: Math.max(r.growth, p.growth), kills: Math.max(r.kills, p.kills) };
    this.records[s.id] = rec;
    saveRecords(this.records);
    $('death').classList.remove('hidden');
  }

  onStage(c) {
    if (c !== this.player) return;
    this.hud.toast(`Você cresceu: agora é ${c.stage.toLowerCase()}!`, 'good');
    this.audio.ui('grow');
  }

  onRoar(c) {
    const carn = c.spec.diet === 'carnivoro';
    const r = 30 + 60 * c.scale;
    for (const o of this.creatures) {
      if (o === c || o.dead || !o.brain) continue;
      const d = o.pos.distanceTo(c.pos);
      if (d > r) continue;
      if (carn && o.spec.diet !== 'carnivoro' && c.power > o.power * 0.3) {
        o.brain.set('flee', c);
        o.resting = false;
      }
      // mesma espécie responde ao chamado
      if (o.spec === c.spec && Math.random() < 0.5 && d < 150) {
        setTimeout(() => !o.dead && o.startRoar && o.canAct() && o.startRoar(), 800 + Math.random() * 1500);
      }
    }
  }

  // ------------------------------------------------------------------ loop
  frame() {
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = Math.min(dt, 0.05);
    const inp = this.input;
    if (inp.pressed('menu') || inp.pressed('unlock')) {
      if (this.state === 'play') this.pause();
      else if (this.state === 'paused') this.resume();
    }
    if (inp.pressed('map')) $('bigmap').classList.toggle('hidden');
    if (inp.pressed('hud')) this.hud.toggleHidden();

    if (this.state !== 'paused') this.simulate(dt);
    this.audio.setListener(this.camera);
    this.renderer.render(this.scene, this.camera);
    inp.endFrame();
  }

  simulate(dt) {
    const cam = this.camera;
    const p = this.player;
    if (this.state === 'play' || this.state === 'dead') {
      this.controller.update(dt);
      this.focus.copy(p.pos);
    } else if (this.state === 'menu' && this.preview) {
      // câmera orbitando a prévia
      const pv = this.preview;
      this.orbit += dt * 0.12;
      const size = pv.L.length * 0.6 + pv.L.hipH;
      const d = 4 + size * 1.25;
      const tgt = pv.pos.clone().add(new THREE.Vector3(0, pv.L.hipH * 0.9, 0));
      cam.position.set(tgt.x + Math.sin(this.orbit) * d, tgt.y + size * 0.25 + 1, tgt.z + Math.cos(this.orbit) * d);
      const gy = this.world.height(cam.position.x, cam.position.z) + 1;
      if (cam.position.y < gy) cam.position.y = gy;
      cam.lookAt(tgt);
      pv.wantSpeed = 0;
      pv.update(dt);
      // de vez em quando ruge / chama
      this.pvT = (this.pvT || 4) - dt;
      if (this.pvT <= 0) {
        this.pvT = 7 + Math.random() * 5;
        if (this.audio.ctx) pv.startRoar();
        else pv.action = { name: pv.spec.diet === 'carnivoro' ? 'roar' : 'call', t: 0, dur: 1.8 };
      }
      this.focus.copy(pv.pos);
    }

    this.world.update(dt, cam, this.focus, this.timeScale);

    // criaturas
    const cx = cam.position.x;
    const cz = cam.position.z;
    const view = this.quality.view + 40;
    for (const c of this.creatures) {
      const d = Math.hypot(c.pos.x - cx, c.pos.z - cz);
      c.group.visible = d < view;
      if (c.brain && !c.dead && (this.state !== 'menu' || d < 400)) c.brain.update(dt);
      const lod = d < 70 ? 1 : d < 160 ? 2 : 4;
      const ph = c.anim.phase;
      c.update(dt, c.group.visible ? lod : 8);
      // passos pesados (som + tremor da câmera)
      if (d < 90 && c.speed > 0.3 && !c.swim) {
        const step = Math.floor(c.anim.phase * 2);
        if (step !== Math.floor(ph * 2)) {
          this.audio.step(c);
          const big = c.L.hipH * c.scale;
          if (big > 2.2 && this.player) this.controller.shake += (big - 2) * 0.05 / (1 + d / 8);
        }
      }
    }
    this.separate();
    // remove carcaças que sumiram e animais muito longe
    const fx = this.focus.x;
    const fz = this.focus.z;
    this.creatures = this.creatures.filter((c) => {
      const far = !c.isPlayer && Math.hypot(c.pos.x - fx, c.pos.z - fz) > 460;
      if (c.remove || (far && c !== this.preview)) {
        if (c === this.player) return true;
        c.dispose();
        return false;
      }
      return true;
    });
    if (this.state !== 'paused') this.population.update(dt);

    // rugidos distantes ocasionais (ambiente)
    this.ambT = (this.ambT || 30) - dt;
    if (this.ambT <= 0) {
      this.ambT = 35 + Math.random() * 50;
      const cands = this.creatures.filter((c) => !c.isPlayer && !c.dead && c.canAct() && !c.resting);
      if (cands.length) cands[Math.floor(Math.random() * cands.length)].startRoar();
    }

    if (this.state === 'play' || this.state === 'dead') this.hud.update(dt);
    this.audio.update(dt, this.world, 0.5 + 0.5 * Math.sin(this.world.uTime.value * 0.05));
  }

  // empurra criaturas sobrepostas (massa proporcional ao tamanho)
  separate() {
    const cs = this.creatures;
    for (let i = 0; i < cs.length; i++) {
      const a = cs[i];
      for (let j = i + 1; j < cs.length; j++) {
        const b = cs[j];
        const dx = b.pos.x - a.pos.x;
        const dz = b.pos.z - a.pos.z;
        const min = (a.radius + b.radius) * 0.85;
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min || d2 < 1e-6) continue;
        if (a.dead && b.dead) continue;
        const d = Math.sqrt(d2);
        const ma = a.dead ? 1e9 : Math.pow(a.scale, 3) * a.spec.stats.health;
        const mb = b.dead ? 1e9 : Math.pow(b.scale, 3) * b.spec.stats.health;
        const push = min - d;
        const ka = mb / (ma + mb);
        const kb = ma / (ma + mb);
        if (!a.dead) {
          a.pos.x -= (dx / d) * push * ka;
          a.pos.z -= (dz / d) * push * ka;
        }
        if (!b.dead) {
          b.pos.x += (dx / d) * push * kb;
          b.pos.z += (dz / d) * push * kb;
        }
      }
    }
  }
}

const game = new Game();
window.__game = game;
game.init().catch((e) => {
  console.error(e);
  $('load-text').textContent = 'Erro ao iniciar: ' + e.message;
});

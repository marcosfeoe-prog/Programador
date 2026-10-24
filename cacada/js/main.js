// Caçada Jurássica — liga todas as partes: menus, carregamento do mundo e dos modelos
// STL, laço do jogo, contratos de caça, interações e renderização (mundo + arma).
import * as THREE from 'three';
import { loadSettings, saveSettings, loadRecords, saveRecords, QUALITY_NAMES } from './config.js';
import { Input } from './input.js';
import { GameAudio } from './audio.js';
import { World } from './world/world.js';
import { CAMP, WATER } from './world/heightfield.js';
import { SPECIES, SPECIES_LIST } from './dino/species.js';
import { loadDinoAsset } from './dino/rig.js';
import { Player } from './player/player.js';
import { WeaponSystem } from './player/weapons.js';
import { FX } from './fx.js';
import { Ballistics } from './ballistics.js';
import { DinoManager } from './dinos.js';
import { HUD } from './ui/hud.js';
import { makeMapCanvas } from './ui/mapimage.js';
import { Bestiary } from './ui/bestiary.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const HOUR_SECONDS = 50; // 1 hora do jogo = 50 s (um dia inteiro dura 20 min)

const TIPS = [
  'Agache (C) para chegar perto sem ser visto. Correr faz barulho.',
  'Raptores andam em matilha e cercam você pelos lados. Fique de costas para uma árvore ou suba numa torre.',
  'O T-Rex é lento para virar: corra para o lado e entre na mata fechada, onde ele não passa.',
  'A besta é silenciosa e faz o dinossauro sangrar. Siga o rastro de sangue no chão.',
  'Use o binóculo (B) para marcar dinossauros no mapa e na bússola.',
  'Tiros na cabeça causam 2,6x de dano. Na cauda, menos da metade.',
  'As caixas verdes no acampamento e nas torres repõem a munição.',
  'O Rex Sombrio dorme no Vale das Sombras durante o dia. À noite, ele caça.',
  'Com a luneta, segure Shift para prender a respiração e firmar a mira.',
  'Balas caem com a distância: mire um pouco acima em alvos muito longe.',
];

class Game {
  constructor() {
    this.settings = loadSettings();
    this.records = loadRecords();
    const q = this.settings.quality;
    this.canvas = $('game');
    const renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: q === 'high' || q === 'ultra', powerPreference: 'high-performance' });
    this.maxPR = { low: 1, medium: 1.25, high: 1.5, ultra: 2 }[q];
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, this.maxPR);
    renderer.setPixelRatio(this.pixelRatio);
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = q !== 'low';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer = renderer;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(this.settings.fov, window.innerWidth / window.innerHeight, 0.08, 9500);
    this.scene.add(this.camera);
    this.vmScene = new THREE.Scene();
    this.vmCamera = new THREE.PerspectiveCamera(52, window.innerWidth / window.innerHeight, 0.01, 10);
    this.vmHemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1.2);
    this.vmSun = new THREE.DirectionalLight(0xffffff, 2);
    this.vmLamp = new THREE.PointLight(0xfff2d0, 0, 3);
    this.vmLamp.position.set(0.1, 0.05, -0.2);
    this.vmScene.add(this.vmHemi, this.vmSun);
    this.vmScene.environment = this.makeEnvMap(renderer);
    this.vmCamera.add(this.vmLamp);
    this.input = new Input(this.canvas, this.settings);
    this.audio = new GameAudio(this.settings);
    this.hud = new HUD();
    this.state = 'menu';
    this.assets = null;
    this.worldReady = false;
    this.bestiary = new Bestiary(renderer);
    this.last = performance.now();
    this.frameTimes = [];
    this.fps = 0;
    this.setupMenus();
    window.addEventListener('resize', () => this.resize());
    document.addEventListener('pointerdown', () => this.audio.init(), { once: false });
    this.loadAssets();
    requestAnimationFrame((t) => this.loop(t));
  }

  // reflexo de céu genérico para os metais das armas
  makeEnvMap(renderer) {
    const sc = new THREE.Scene();
    const geo = new THREE.SphereGeometry(10, 32, 16);
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: 'varying vec3 vP; void main(){ float y = normalize(vP).y; vec3 c = mix(vec3(0.25,0.22,0.18), vec3(0.75,0.82,0.9), smoothstep(-0.2, 0.5, y)); c += vec3(1.2,1.1,0.9) * pow(max(0.0, dot(normalize(vP), normalize(vec3(0.4,0.7,0.3)))), 30.0); gl_FragColor = vec4(c, 1.0); }',
    });
    sc.add(new THREE.Mesh(geo, mat));
    const pm = new THREE.PMREMGenerator(renderer);
    const tex = pm.fromScene(sc, 0.02).texture;
    pm.dispose();
    return tex;
  }

  // ------------------------------------------------------------ modelos STL
  async loadAssets() {
    const out = {};
    for (const sp of SPECIES_LIST) {
      try {
        out[sp.id] = await loadDinoAsset(sp);
      } catch (e) {
        console.error(e);
        $('records').textContent = 'Erro ao carregar ' + sp.arquivo + '. Rode o jogo por um servidor HTTP (npm start).';
        return;
      }
      await new Promise((r) => setTimeout(r, 0));
    }
    this.assets = out;
    this.bestiary.setAssets(out);
    document.body.classList.add('assets-ok');
    if (this.assetsWaiter) this.assetsWaiter();
  }

  waitAssets() {
    if (this.assets) return Promise.resolve();
    return new Promise((r) => (this.assetsWaiter = r));
  }

  // ------------------------------------------------------------ menus
  setupMenus() {
    const s = this.settings;
    $('btn-play').onclick = () => {
      this.audio.init();
      this.audio.ui('clique');
      if (this.worldReady) this.resume();
      else this.startNewGame();
    };
    $('btn-best').onclick = () => this.openBestiary();
    $('btn-settings').onclick = () => this.showPanel('menu-settings');
    $('btn-help').onclick = () => this.showPanel('menu-help');
    for (const b of document.querySelectorAll('[data-back]')) b.onclick = () => this.showPanel('menu-main');
    // configurações
    const qSel = $('set-quality');
    qSel.value = s.quality;
    qSel.onchange = () => {
      s.quality = qSel.value;
      saveSettings(s);
      $('set-note').textContent = `Qualidade ${QUALITY_NAMES[s.quality]}: a página será recarregada.`;
      setTimeout(() => {
        const u = new URL(location.href);
        u.searchParams.delete('quality');
        location.href = u.toString();
      }, 600);
    };
    const bind = (id, key, fmt, apply) => {
      const el = $(id);
      const lab = $(id + '-v');
      if (el.type === 'checkbox') el.checked = !!s[key];
      else el.value = s[key];
      if (lab) lab.textContent = fmt(s[key]);
      el.oninput = () => {
        s[key] = el.type === 'checkbox' ? el.checked : parseFloat(el.value);
        if (lab) lab.textContent = fmt(s[key]);
        apply && apply(s[key]);
        saveSettings(s);
      };
    };
    bind('set-sens', 'sensitivity', (v) => v.toFixed(2));
    bind('set-fov', 'fov', (v) => Math.round(v) + '°');
    bind('set-vol', 'volume', (v) => Math.round(v * 100) + '%', (v) => this.audio.setVolume(v));
    bind('set-inv', 'invertY', () => '');
    bind('set-fps', 'showFps', () => '', (v) => $('fps').classList.toggle('hidden', !v));
    $('fps').classList.toggle('hidden', !s.showFps);
    this.updateRecords();
    // morte
    $('btn-respawn').onclick = () => this.respawn();
    $('btn-death-menu').onclick = () => {
      $('death').classList.add('hidden');
      this.respawn(true);
      this.pause();
    };
    // bestiário
    for (const b of document.querySelectorAll('#best-species button')) b.onclick = () => this.bestSelect(b.dataset.sp);
    for (const b of document.querySelectorAll('#best-modes button')) b.onclick = () => {
      this.bestiary.setMode(b.dataset.mode);
      for (const o of document.querySelectorAll('#best-modes button')) o.classList.toggle('on', o === b);
    };
    $('best-back').onclick = () => {
      this.state = this.worldReady ? 'paused' : 'menu';
      $('bestiary').classList.add('hidden');
      $('menu').classList.remove('hidden');
    };
    const bc = this.canvas;
    let drag = null;
    bc.addEventListener('pointerdown', (e) => {
      if (this.state === 'bestiary') drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointermove', (e) => {
      if (!drag || this.state !== 'bestiary') return;
      this.bestiary.orbit -= (e.clientX - drag.x) * 0.008;
      this.bestiary.elev = clamp(this.bestiary.elev + (e.clientY - drag.y) * 0.005, 0.02, 1.2);
      this.bestiary.dragging = true;
      drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerup', () => {
      drag = null;
      this.bestiary.dragging = false;
    });
    // botões de toque extras
    const tm = $('t-menu');
    if (tm) tm.addEventListener('touchstart', (e) => (e.preventDefault(), this.pause()), { passive: false });
  }

  showPanel(id) {
    for (const p of document.querySelectorAll('.menu-panel')) p.classList.toggle('hidden', p.id !== id);
  }

  updateRecords() {
    const r = this.records;
    $('records').textContent = r.melhor > 0 ? `Recorde: ${r.melhor} pontos · ${r.abates} dinossauros abatidos no total` : 'Os modelos dos dinossauros vêm dos arquivos STL enviados, com esqueleto e animações feitos do zero.';
  }

  openBestiary() {
    if (!this.assets) {
      $('records').textContent = 'Carregando os modelos dos dinossauros…';
      this.waitAssets().then(() => this.openBestiary());
      return;
    }
    this.state = 'bestiary';
    $('menu').classList.add('hidden');
    $('bestiary').classList.remove('hidden');
    this.bestSelect(this.bestiary.curId || 'raptor');
  }

  bestSelect(id) {
    const asset = this.bestiary.select(id);
    if (!asset) return;
    for (const b of document.querySelectorAll('#best-species button')) b.classList.toggle('on', b.dataset.sp === id);
    for (const b of document.querySelectorAll('#best-modes button')) b.classList.toggle('on', b.dataset.mode === 'idle');
    $('best-jump').style.display = id === 'raptor' ? '' : 'none';
    const info = Bestiary.info(SPECIES[id], asset);
    $('best-info').innerHTML = `<h2>${info.nome}</h2><p>${info.desc}</p><table>${info.linhas.map(([a, b]) => `<tr><td>${a}</td><td>${b}</td></tr>`).join('')}</table>`;
  }

  // ------------------------------------------------------------ início
  async startNewGame() {
    this.state = 'loading';
    $('menu').classList.add('hidden');
    $('loading').classList.remove('hidden');
    let tip = 0;
    const tipEl = $('load-tip');
    tipEl.textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    const tipTimer = setInterval(() => (tipEl.textContent = TIPS[(tip = (tip + 1) % TIPS.length)]), 4000);
    const setP = (p, msg) => {
      $('load-bar').style.width = (p * 100).toFixed(0) + '%';
      if (msg) $('load-msg').textContent = msg;
    };
    try {
      const q = this.settings.quality;
      this.world = new World(this.scene, q);
      await this.world.init((p, m) => setP(p * 0.85, m));
      setP(0.86, 'Despertando os dinossauros…');
      await this.waitAssets();
      this.fx = new FX(this.scene, this.world);
      this.player = new Player(this.camera);
      this.player.onStep = (surf, k) => this.audio.footstep(surf, k);
      this.player.onLand = (f) => this.audio.land(f);
      this.weapons = new WeaponSystem(this.vmScene, this.vmCamera, this.audio, { onFire: (d, sp, ads) => this.onFire(d, sp, ads) });
      this.ballistics = new Ballistics(this.scene, this.world, this.fx, this.audio, {
        onHitDino: (d, hit, p, dir) => this.onHitDino(d, hit, p, dir),
      });
      this.dinos = new DinoManager(this.scene, this.world, this.assets, this.fx, this.audio, q);
      this.dinos.onBite = (d) => this.onBitten(d);
      this.dinos.onDeath = (d) => this.onKill(d);
      this.dinos.onVocal = (d, kind) => {
        if ((kind === 'roar' || kind === 'call') && d.pos.distanceTo(this.player.pos) < 1400) this.hud.ping(d.pos, kind === 'roar' ? '#ff7a40' : '#ffb040', kind === 'roar' ? 8 : 4);
      };
      this.dinos.player = this.player;
      setP(0.92, 'Soltando as matilhas…');
      await new Promise((r) => setTimeout(r, 0));
      this.dinos.spawnAll();
      // lanterna presa à câmera
      this.flash = new THREE.SpotLight(0xfff1d6, 0, 90, 0.42, 0.55, 1.4);
      this.flash.position.set(0.15, -0.15, 0);
      this.flash.target.position.set(0, 0, -10);
      this.camera.add(this.flash);
      this.camera.add(this.flash.target);
      setP(0.95, 'Desenhando o mapa…');
      await new Promise((r) => setTimeout(r, 0));
      this.hud.setMap(makeMapCanvas(this.world.hf, q === 'low' ? 512 : 1024));
      this.newSession();
      this.world.terrain.warmup(this.camera.position);
      this.world.veg.update(0, this.camera.position, true);
      // compila os shaders antes de começar (evita travadas na primeira aparição)
      setP(0.97, 'Compilando shaders…');
      try {
        if (this.renderer.compileAsync) await this.renderer.compileAsync(this.scene, this.camera);
        else this.renderer.compile(this.scene, this.camera);
        this.renderer.compile(this.vmScene, this.vmCamera);
      } catch (e) {
        console.warn(e);
      }
      setP(1, 'Pronto!');
      this.worldReady = true;
      $('btn-play').textContent = 'Continuar';
      clearInterval(tipTimer);
      $('loading').classList.add('hidden');
      this.state = 'play';
      document.body.classList.add('playing');
      this.hud.show(true);
      this.input.enabled = true;
      this.input.lock();
      this.hud.centerMsg('CAÇADA JURÁSSICA', 'Cumpra os contratos de caça. Boa sorte, caçador.', 5);
      setTimeout(() => this.hud.notify('Use o <b>binóculo (B)</b> para encontrar presas. <b>M</b> abre o mapa.', 'info'), 5500);
    } catch (e) {
      clearInterval(tipTimer);
      console.error(e);
      $('load-msg').textContent = 'Erro: ' + e.message;
    }
  }

  newSession() {
    this.score = 0;
    this.trophies = 0;
    this.kills = { raptor: 0, trex: 0, sombrio: 0 };
    this.shots = 0;
    this.hits = 0;
    this.timeAlive = 0;
    this.contracts = [
      { id: 'raptor', titulo: 'Abata 3 Raptores Esmeralda', alvo: 3, prog: 0 },
      { id: 'trex', titulo: 'Abata um Tiranossauro Rex', alvo: 1, prog: 0 },
      { id: 'sombrio', titulo: 'Abata o Rex Sombrio (Vale das Sombras, ao norte)', alvo: 1, prog: 0 },
      { id: 'trofeus', titulo: 'Colete 3 troféus dos abatidos', alvo: 3, prog: 0 },
    ];
    this.allDone = false;
    this.world.sky.setHour(7.5);
    this.player.spawn(CAMP.x, CAMP.z + 9, this.world, 0);
    this.player.update(0, this.input, this.world, {});
    this.ammoCD = 0;
  }

  resume() {
    if (this.state === 'dead') return;
    this.state = 'play';
    document.body.classList.add('playing');
    $('menu').classList.add('hidden');
    this.hud.show(true);
    this.input.enabled = true;
    this.input.reset();
    this.input.lock();
    this.last = performance.now();
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    document.body.classList.remove('playing');
    this.input.enabled = false;
    this.input.unlock();
    this.input.reset();
    this.hud.toggleMap(false);
    this.showPanel('menu-main');
    $('menu').classList.remove('hidden');
    $('menu').classList.add('paused');
  }

  respawn(silent) {
    $('death').classList.add('hidden');
    this.player.spawn(CAMP.x, CAMP.z + 9, this.world, 0);
    this.weapons.addAmmo(0.6);
    // afasta predadores do acampamento
    for (const d of this.dinos.list) {
      if (!d.alive) continue;
      d.awareness = 0;
      d.anim.lookAt(null);
      if (d.pos.distanceTo(this.player.pos) < 150) {
        d.setState('flee');
      } else if (d.state === 'chase' || d.state === 'attack' || d.state === 'stalk' || d.state === 'circle') d.setState('wander');
    }
    this.score = Math.max(0, Math.round(this.score * 0.9));
    if (!silent) {
      this.state = 'play';
      document.body.classList.add('playing');
      this.hud.show(true);
      this.input.enabled = true;
      this.input.lock();
      this.hud.centerMsg('DE VOLTA AO ACAMPAMENTO', 'Você perdeu 10% dos pontos.', 3);
    }
  }

  // ------------------------------------------------------------ combate
  onFire(def, spread) {
    const cam = this.camera;
    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const muzzle = cam.localToWorld(this.weapons.muzzleLocal.clone());
    this.ballistics.fire(cam.position.clone(), dir, def, spread, muzzle);
    if (def.id !== 'crossbow') this.fx.muzzleSmoke(muzzle, dir);
    this.dinos.gunshot(this.player.pos, def.barulho);
    this.shots++;
  }

  onHitDino(d, hit, p, dir) {
    const wasAlive = d.alive;
    let dmg = p.dmg * hit.mult;
    if (p.def.id === 'shotgun') dmg *= clamp(1 - (p.dist - 12) / 45, 0.25, 1);
    d.lastHitPart = hit.part;
    const killed = d.takeDamage(dmg, hit, this.player.pos, p.def);
    this.fx.blood(hit.point, dir, hit.part === 'head' ? 1.5 : 1);
    this.audio.impact('flesh', hit.point);
    if (wasAlive) {
      this.hits++;
      this.hud.hit(killed, hit.part === 'head');
      this.audio.hitMarker(killed, hit.part === 'head');
    }
  }

  // chamado quando um dinossauro morre (tiro ou sangramento)
  onKill(d) {
    if (!d.lastHitBy) return;
    const head = d.lastHitPart === 'head' && d.bleed <= 0;
    const sp = d.sp;
    let pts = sp.pontos;
    if (head) pts = Math.round(pts * 1.5);
    this.score += pts;
    this.kills[sp.id]++;
    this.records.abates++;
    this.hud.notify(`<b>${sp.nome}</b> abatido! +${pts}${head ? ' <i>(tiro na cabeça)</i>' : ''}`, 'kill');
    const c = this.contracts.find((x) => x.id === sp.id);
    if (c) this.progress(c, 1);
    this.saveBest();
  }

  progress(c, n) {
    const before = c.prog >= c.alvo;
    c.prog += n;
    if (!before && c.prog >= c.alvo) {
      this.score += 500;
      this.audio.ui('objetivo');
      this.hud.centerMsg('CONTRATO CUMPRIDO', c.titulo + ' · +500', 4);
      if (!this.allDone && this.contracts.every((x) => x.prog >= x.alvo)) {
        this.allDone = true;
        setTimeout(() => {
          this.hud.centerMsg('TODOS OS CONTRATOS CUMPRIDOS!', `Você é o maior caçador da ilha. ${this.score} pontos. A caça livre continua.`, 7);
          this.audio.ui('trofeu');
        }, 4200);
      }
    }
  }

  saveBest() {
    if (this.score > this.records.melhor) this.records.melhor = this.score;
    saveRecords(this.records);
  }

  onBitten(d) {
    const p = this.player;
    this.hud.damage(p.hurtDir);
    this.audio.hurt();
    if (!p.alive && this.state === 'play') {
      this.state = 'dead';
      this.killer = d;
      this.input.enabled = false;
      setTimeout(() => this.showDeath(), 1800);
    }
  }

  showDeath() {
    this.input.unlock();
    this.saveBest();
    const k = this.killer;
    $('death-title').textContent = k && k.sp.id === 'raptor' ? 'A MATILHA TE PEGOU' : 'VOCÊ FOI DEVORADO';
    const min = Math.floor(this.timeAlive / 60);
    $('death-sub').innerHTML = `Morto por: <b>${k ? k.sp.nome : '—'}</b><br>Abates: ${this.kills.raptor} raptores, ${this.kills.trex} T-Rex, ${this.kills.sombrio} Rex Sombrio · ${this.score} pontos · ${min} min de caçada<br>Precisão: ${this.shots ? Math.round((this.hits / this.shots) * 100) : 0}%`;
    $('death').classList.remove('hidden');
    this.hud.show(false);
  }

  // ------------------------------------------------------------ interações
  interactions() {
    const p = this.player;
    let best = null;
    let bd = 1e9;
    for (const it of this.world.structures.interact) {
      if (it.tipo === 'descer' && p.tower !== it.data) continue;
      if (it.tipo === 'subir' && p.tower) continue;
      const d = Math.hypot(it.x - p.pos.x, it.z - p.pos.z, (it.y - (p.pos.y + 1)) * 0.7);
      if (d < it.r && d < bd) {
        bd = d;
        best = it;
      }
    }
    const body = this.dinos.nearestBody(p.pos, 4);
    let label = null;
    if (body) label = `<b>E</b> Coletar troféu: ${body.sp.nome}`;
    else if (best) label = `<b>E</b> ${best.label}`;
    this.hud.setPrompt(this.state === 'play' && p.alive ? label : null);
    if (!this.input.pressed('interact') || !p.alive) return;
    if (body) {
      body.harvested = true;
      this.trophies++;
      const pts = Math.round(body.sp.pontos * 0.5);
      this.score += pts;
      this.audio.ui('trofeu');
      this.hud.notify(`Troféu coletado: <b>${body.sp.nome}</b> +${pts}`, 'kill');
      this.progress(this.contracts.find((c) => c.id === 'trofeus'), 1);
      this.saveBest();
      return;
    }
    if (!best) return;
    if (best.tipo === 'municao') {
      if (this.ammoCD > 0) return;
      this.weapons.addAmmo(1);
      p.health = Math.max(p.health, Math.min(p.maxHealth, p.health + 30));
      this.ammoCD = 2;
      this.audio.ui('pegar');
      this.hud.notify('Munição reabastecida e kit de primeiros socorros usado.', 'info');
    } else if (best.tipo === 'subir') {
      const t = best.data;
      p.tower = t;
      p.pos.set(t.top.x, t.platform.y, t.top.z);
      p.vel.set(0, 0, 0);
      this.audio.footstep('madeira', 1);
    } else if (best.tipo === 'descer') {
      const t = best.data;
      p.tower = null;
      p.pos.set(t.base.x, this.world.height(t.base.x, t.base.z), t.base.z);
      p.vel.set(0, 0, 0);
      this.audio.footstep('madeira', 1);
    } else if (best.tipo === 'dormir') {
      const danger = this.dinos.list.some((d) => d.alive && d.awareness > 0.6 && d.pos.distanceTo(p.pos) < 200);
      if (danger) {
        this.hud.notify('Não dá para dormir com predadores por perto!', 'warn');
        return;
      }
      this.world.sky.setHour(this.world.sky.hour + 6);
      p.health = p.maxHealth;
      this.hud.centerMsg('VOCÊ DORMIU 6 HORAS', 'Vida recuperada.', 3);
    }
  }

  // binóculo: olhar um dinossauro por um instante marca ele no mapa
  binoculars(dt) {
    if (!this.weapons.binoculars) return;
    const cam = this.camera;
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    for (const d of this.dinos.list) {
      if (!d.alive) continue;
      const to = d.center.clone().sub(cam.position);
      const dist = to.length();
      if (dist > 1100) continue;
      to.divideScalar(dist);
      const ang = Math.acos(clamp(to.dot(f), -1, 1));
      if (ang < 0.05 + 3 / dist) {
        d.spotT = (d.spotT || 0) + dt;
        if (d.spotT > 0.35 && d.tagged <= 0) {
          d.tagged = 120;
          this.hud.notify(`<b>${d.sp.nome}</b> marcado a ${Math.round(dist)} m`, 'info');
          this.audio.ui('clique');
        } else if (d.tagged > 0) d.tagged = 120;
      } else d.spotT = 0;
    }
  }

  // ------------------------------------------------------------ laço
  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = w / h;
    this.vmCamera.updateProjectionMatrix();
  }

  loop(t) {
    requestAnimationFrame((tt) => this.loop(tt));
    const dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    this.trackFps(dt);
    if (this.state === 'bestiary') {
      this.bestiary.update(dt, window.innerWidth, window.innerHeight);
      this.bestiary.render();
    } else if (this.worldReady && (this.state === 'play' || this.state === 'dead')) {
      this.update(dt);
      this.render();
    } else if (this.worldReady) {
      this.render();
    }
    this.input.endFrame();
  }

  trackFps(dt) {
    this.frameTimes.push(dt);
    if (this.frameTimes.length >= 30) {
      const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
      this.frameTimes.length = 0;
      this.fps = 1 / avg;
      if (this.settings.showFps) $('fps').textContent = `${this.fps.toFixed(0)} FPS · ${(this.pixelRatio * 100).toFixed(0)}%`;
      // resolução dinâmica
      if (this.state === 'play') {
        let pr = this.pixelRatio;
        if (avg > 1 / 40) pr = Math.max(0.55, pr - 0.1);
        else if (avg < 1 / 58) pr = Math.min(Math.min(window.devicePixelRatio || 1, this.maxPR), pr + 0.05);
        if (Math.abs(pr - this.pixelRatio) > 0.01) {
          this.pixelRatio = pr;
          this.renderer.setPixelRatio(pr);
          this.renderer.setSize(window.innerWidth, window.innerHeight);
        }
      }
    }
  }

  update(dt) {
    const inp = this.input;
    const p = this.player;
    const w = this.weapons;
    if (this.state === 'play') {
      if (inp.pressed('menu') || inp.pressed('unlock')) {
        if (!this.hud.mapScreen.classList.contains('hidden')) this.hud.toggleMap(false);
        else {
          this.pause();
          return;
        }
      }
      if (inp.pressed('map')) this.hud.toggleMap(this.hud.mapScreen.classList.contains('hidden'));
      if (inp.pressed('hud')) this.hud.root.classList.toggle('off');
      if (inp.pressed('flashlight')) {
        p.flashlight = !p.flashlight;
        this.audio.mech('empty');
      }
      if (inp.pressed('fullscreen')) {
        if (document.fullscreenElement) document.exitFullscreen();
        else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
      }
      this.timeAlive += dt;
    }
    this.ammoCD -= dt;
    const sky = this.world.sky;
    sky.setHour(sky.hour + dt / HOUR_SECONDS);
    // jogador e arma
    const zoom = w.binoculars ? 6 : 1 + (w.def.zoom - 1) * w.ads * w.ads;
    const lookK = 1 / Math.pow(zoom, 0.85);
    const lookBefore = { x: inp.lookDX, y: inp.lookDY };
    p.aiming = w.ads > 0.5;
    p.update(dt, inp, this.world, {
      aiming: w.ads > 0.5,
      lookK,
      collideDinos: (pos, r) => this.dinos.collidePlayer(pos, r),
    });
    // balanço da luneta (respiração)
    if (w.scoped && !w.holdBreath) {
      const tt = performance.now() * 0.001;
      p.yaw += Math.sin(tt * 0.9) * 0.00035;
      p.pitch += Math.cos(tt * 1.3) * 0.00028;
    }
    w.update(dt, inp, p, { look: { x: lookBefore.x * 0.002, y: lookBefore.y * 0.002 } });
    this.binoculars(dt);
    this.interactions();
    // mundo e dinossauros
    this.ballistics.update(dt, this.dinos.list);
    const night = sky.night;
    this.dinos.update(dt, { player: p, world: this.world, night, camPos: this.camera.position });
    this.fx.update(dt, this.camera);
    this.world.update(dt, this.camera, p.pos, this.renderer);
    // câmera
    const fov = this.settings.fov / zoom;
    if (Math.abs(this.camera.fov - fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
    this.flash.intensity = p.flashlight ? 70 : 0;
    this.vmLamp.intensity = p.flashlight ? 0.6 : 0;
    // luz do viewmodel segue o sol/lua no espaço da câmera
    const inv = this.camera.quaternion.clone().invert();
    this.vmSun.position.copy(sky.sun.position).sub(sky.sun.target.position).normalize().applyQuaternion(inv);
    this.vmSun.color.copy(sky.sun.color);
    this.vmSun.intensity = sky.sun.intensity * 0.8;
    this.vmHemi.color.copy(sky.hemi.color);
    this.vmHemi.groundColor.copy(sky.hemi.groundColor);
    this.vmHemi.intensity = sky.hemi.intensity * 0.9;
    this.vmScene.environmentIntensity = 0.15 + 0.85 * sky.daylight;
    // áudio
    this.audio.listener(this.camera);
    let danger = 0;
    for (const d of this.dinos.list) {
      if (!d.alive) continue;
      if ((d.state === 'chase' || d.state === 'attack' || d.state === 'circle' || d.state === 'pounce' || d.state === 'stalk') && d.distToPlayer < 150) danger = Math.max(danger, 1 - d.distToPlayer / 150);
    }
    this.audio.update(dt, {
      night,
      camPos: this.camera.position,
      nearWater: this.world.height(p.pos.x + 25, p.pos.z) < WATER || this.world.height(p.pos.x - 25, p.pos.z) < WATER || this.world.height(p.pos.x, p.pos.z + 25) < WATER,
      health: p.health,
      danger,
      height: p.pos.y,
    });
    this.hud.update(dt, this);
  }

  render() {
    const r = this.renderer;
    r.autoClear = true;
    r.render(this.scene, this.camera);
    const w = this.weapons;
    if (w && !w.scoped && this.player.alive) {
      r.autoClear = false;
      r.clearDepth();
      r.render(this.vmScene, this.vmCamera);
      r.autoClear = true;
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  try {
    window.game = new Game();
  } catch (e) {
    console.error(e);
    document.body.insertAdjacentHTML('beforeend', `<div class="fatal">Não foi possível iniciar o WebGL: ${e.message}</div>`);
  }
});

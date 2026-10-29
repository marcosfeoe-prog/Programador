// NOCLIP — orquestra o jogo: menu, carregamento, introdução, jogo, morte,
// transições entre níveis e final.
import * as THREE from 'three';
import { load, save, settings, progress, Q } from './config.js';
import { t } from './i18n.js';
import { Post } from './post.js';
import { LU, tex, texturesReady, makeEnv, setAnisotropy } from './materials.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { ViewModel } from './viewmodel.js';
import { AudioEngine } from './audio.js';
import { UI, LEVEL_INFO } from './ui.js';
import { clamp, damp, lerp, smoothstep, nextFrame, wrapAngle } from './util.js';
import { Level0 } from './levels/level0.js';
import { Level1 } from './levels/level1.js';
import { LevelFun } from './levels/levelfun.js';

const LEVELS = [Level0, Level1, LevelFun];
const AUDIO_KIND = ['l0', 'l1', 'fun'];

class Game {
  constructor() {
    load();
    this.canvas = document.getElementById('game');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    LU.uNoise.value = tex('noise.png', { srgb: false });
    this.post = new Post(this.renderer);
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.fov, 1, 0.05, Q().far);
    this.scene.add(this.camera);
    this.input = new Input(this.canvas);
    this.input.onUnlock = () => {
      if (this.state === 'play') this.pause();
    };
    this.audio = new AudioEngine();
    this.audio.setVolume(settings.volume);
    this.player = new Player(this);
    this.vm = new ViewModel(this);
    this.vm.attach(this.camera);
    this.ui = new UI(this);
    this.state = 'boot';
    this.level = null;
    this.levelIndex = 0;
    this.clock = new THREE.Clock();
    this.fpsAcc = 0;
    this.fpsN = 0;
    this.dynT = 0;
    this.playTime = 0;
    this.chase = 0;
    this.hurtFx = 0;
    this.noiseLvl = 0;
    this.applyQuality();
    addEventListener('resize', () => this.resize());
    this.resize();
    // primeiro gesto libera o áudio
    const unlockAudio = () => this.audio.init();
    addEventListener('pointerdown', unlockAudio);
    addEventListener('keydown', unlockAudio);
    addEventListener('touchstart', unlockAudio);
    // depois de carregar (assíncrono) o navegador exige um clique para travar o mouse
    this.canvas.addEventListener('click', () => {
      if ((this.state === 'play' || this.state === 'intro') && !this.input.touch) this.input.lock();
    });
    this.renderer.setAnimationLoop(() => this.frame());
    this.boot();
  }

  // ------------------------------------------------------------- ajustes --
  applyQuality() {
    const q = Q();
    this.post.configure(q.msaa, q.bloom);
    this.vm.setShadows(q.shadow);
    this.camera.far = q.far;
    this.camera.updateProjectionMatrix();
    setAnisotropy(q.aniso);
    this.resize();
  }
  applySettings() {
    this.audio.setVolume(settings.volume);
    this.camera.fov = settings.fov;
    if (this._quality !== settings.quality) {
      this._quality = settings.quality;
      this.applyQuality();
    }
    this.resize();
  }
  onLang() {
    if (this.level) this.updateObjective(true);
  }
  resize() {
    const q = Q();
    const w = innerWidth, h = innerHeight;
    const pr = Math.min(devicePixelRatio || 1, q.pr) * q.scale;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vm.setAspect(w / h, this.camera.fov);
    this.post.setSize(Math.round(w * pr), Math.round(h * pr));
  }

  // ---------------------------------------------------------------- fluxo --
  async boot() {
    this._quality = settings.quality;
    this.ui.show('s-boot');
    document.getElementById('boot-bar').style.width = '4%';
    await this.loadLevel(0, (p) => (document.getElementById('boot-bar').style.width = Math.max(4, p * 100) + '%'));
    this.state = 'menu';
    this.menuT = 0;
    this.ui.show('s-menu');
    this.updateMenu();
  }
  updateMenu() {
    document.getElementById('m-play').textContent = t(progress.unlocked > 0 ? 'cont' : 'play');
  }

  menuPlay() {
    this.audio.init();
    this.startLevel(Math.min(progress.unlocked, LEVELS.length - 1));
  }

  async loadLevel(i, onProgress) {
    if (this.level) {
      this.scene.remove(this.level.group);
      this.level.dispose();
      this.level = null;
      this.audio.stopVoices();
    }
    this.levelIndex = i;
    const L = new LEVELS[i](this);
    await nextFrame();
    await L.build((p) => onProgress && onProgress(0.1 + p * 0.85));
    await texturesReady();
    onProgress && onProgress(1);
    this.level = L;
    this.scene.add(L.group);
    this.scene.fog = new THREE.FogExp2(L.fog.color, L.fog.density);
    this.scene.background = new THREE.Color(L.fog.color);
    if (this.env) this.env.dispose();
    this.env = makeEnv(this.renderer, L.envOpts || {});
    this.vm.setEnv(this.env);
    L.setEnv && L.setEnv(this.env);
    const g = L.grade;
    const u = this.post.u;
    u.uExposure.value = g.exposure;
    u.uTint.value.set(...g.tint);
    u.uLift.value.set(...g.lift);
    u.uSat.value = g.sat;
    u.uContrast.value = g.contrast;
    u.uBloom.value = g.bloom;
    u.uCA.value = g.ca;
    u.uGrain.value = g.grain;
    // pré-compila os shaders para não travar no primeiro quadro
    this.player.reset(L.spawn);
    this.player.applyCamera(this.camera, 0);
    this.renderer.compile(this.scene, this.camera);
    this.renderer.compile(this.vm.scene, this.vm.camera);
    this.fresh = true;
    return L;
  }

  async startLevel(i) {
    this.audio.init();
    this.ui.hideAll();
    if (!(this.level && this.levelIndex === i && this.fresh)) {
      this.state = 'loading';
      this.ui.show('s-loading');
      this.ui.loading(i, 0, t('loading'));
      await nextFrame();
      await this.loadLevel(i, (p) => this.ui.loading(i, p, p < 0.95 ? t('baking') : t('loading')));
      this.ui.loadingDone();
    }
    this.fresh = false;
    this.audio.setLevel(AUDIO_KIND[i]);
    this.player.battery = Math.max(this.player.battery ?? 1, 0.75);
    this.player.reset(this.level.spawn);
    this.playTime = this.playTime || 0;
    this.ui.hideAll();
    this.ui.hud(true);
    this.updateObjective(true);
    this.introT = 0;
    this.state = 'intro';
    this.ui.card(i);
    this.input.clear();
    this.input.lock();
  }

  restartLevel() {
    // reconstrói o nível para reiniciar os quebra-cabeças
    const i = this.levelIndex;
    this.ui.hideAll();
    this.state = 'loading';
    this.ui.show('s-loading');
    this.loadLevel(i, (p) => this.ui.loading(i, p, t('baking'))).then(() => this.startLevel(i));
  }

  quitToMenu() {
    this.state = 'menu';
    this.ui.hud(false);
    this.ui.show('s-menu');
    this.updateMenu();
    this.input.unlock();
    this.audio.stopVoices();
    this.post.u.uFade.value = 0;
    this.post.u.uBlink.value = 0;
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'paused';
    this.ui.open('s-pause');
    this.ui.stack = [];
    this.input.unlock();
  }
  resume() {
    this.ui.hideAll();
    this.input.clear();
    this.state = 'play';
    this.input.lock();
  }
  // bilhete / teclado: congela o jogo
  overlay(kind, arg) {
    this.state = 'overlay';
    this.input.unlock();
    if (kind === 'note') {
      this.audio.paper();
      this.ui.note(arg);
    } else if (kind === 'keypad') this.ui.keypad(arg);
  }
  closeOverlay() {
    this.ui.hideAll();
    this.input.clear();
    this.state = 'play';
    this.input.lock();
  }

  respawn() {
    this.ui.hideAll();
    this.ui.hud(true);
    this.player.reset(this.level.spawn);
    this.player.hp = 100;
    this.level.onRespawn && this.level.onRespawn();
    this.post.u.uFade.value = 0;
    this.player.deathRoll = 0;
    this.player.deathDrop = 0;
    this.introT = 1.2;
    this.state = 'intro';
    this.input.clear();
    this.input.lock();
  }

  completeLevel() {
    if (this.state === 'transition') return;
    progress.unlocked = Math.max(progress.unlocked, Math.min(LEVELS.length - 1, this.levelIndex + 1));
    if (this.levelIndex === LEVELS.length - 1) progress.finished = true;
    save();
    this.state = 'transition';
    this.transT = 0;
    this.audio.stopVoices();
  }

  // --------------------------------------------------------- jogo: eventos --
  onStep(p, loud) {
    if (!this.level) return;
    const surf = this.level.surfaceAt ? this.level.surfaceAt(p.pos.x, p.pos.z) : 'carpet';
    this.audio.step(surf, loud);
    this.noise(p.pos, loud * 16, loud);
  }
  noise(pos, radius, loud = 0.5) {
    this.noiseLvl = Math.max(this.noiseLvl, loud);
    if (this.level) for (const e of this.level.entities) e.hear && e.hear(pos, radius);
  }
  onHurt(n, from) {
    this.player.hurt(n, from);
    this.vm.doHurt();
    this.audio.hurt();
    this.hurtFx = 1;
    if (navigator.vibrate) navigator.vibrate(120);
  }

  updateObjective(force) {
    if (!this.level || !this.level.objective) return;
    const o = this.level.objective();
    this.ui.setObjective(t(LEVEL_INFO[this.levelIndex].tag) + ' · ' + t(LEVEL_INFO[this.levelIndex].name), o.text, o.items || '');
  }

  // Escolhe o objeto interativo sob a mira.
  findInteract() {
    const L = this.level;
    const cam = this.camera;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    let best = null, bestScore = -1;
    for (const it of L.interactables) {
      if (it.done) continue;
      if (it.enabled && !it.enabled()) continue;
      const dx = it.pos.x - cam.position.x, dy = it.pos.y - cam.position.y, dz = it.pos.z - cam.position.z;
      const d = Math.hypot(dx, dy, dz);
      const reach = 2.0 + (it.r || 0);
      if (d > reach) continue;
      const dot = (dx * fwd.x + dy * fwd.y + dz * fwd.z) / d;
      const need = Math.cos(Math.min(0.9, Math.atan2((it.r || 0.15) + 0.12, d)));
      if (dot < need) continue;
      // linha de visão até perto do objeto
      const k = Math.max(0, (d - (it.r || 0.1) - 0.15) / d);
      if (!L.grid.visible(cam.position.x, cam.position.y, cam.position.z, cam.position.x + dx * k, cam.position.y + dy * k, cam.position.z + dz * k)) continue;
      const score = dot - d * 0.05;
      if (score > bestScore) {
        bestScore = score;
        best = it;
      }
    }
    return best;
  }

  // ---------------------------------------------------------------- quadro --
  frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    const now = this.clock.elapsedTime;
    this.post.u.uTime.value = now;
    LU.uTime.value = now;
    // FPS e resolução dinâmica
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 0.5) {
      const fps = this.fpsN / this.fpsAcc;
      this.ui.fps(Math.round(fps) + ' fps');
      if (settings.dynres && (this.state === 'play' || this.state === 'intro')) {
        const s0 = this.post.scale;
        if (fps < 45) this.post.scale = Math.max(0.5, s0 - 0.1);
        else if (fps > 58 && s0 < 1) this.post.scale = Math.min(1, s0 + 0.05);
        if (this.post.scale !== s0) this.resize();
      } else if (!settings.dynres && this.post.scale !== 1) {
        this.post.scale = 1;
        this.resize();
      }
      this.fpsAcc = this.fpsN = 0;
    }
    const s = this.state;
    if (s === 'menu') this.menuFrame(dt);
    else if (s === 'play') this.playFrame(dt);
    else if (s === 'intro') this.introFrame(dt);
    else if (s === 'dying') this.dyingFrame(dt);
    else if (s === 'transition') this.transFrame(dt);
    if (this.level && s !== 'boot' && s !== 'loading') {
      const showVM = s === 'play' || s === 'intro' || s === 'dying' || s === 'paused' || s === 'overlay';
      this.post.render(this.scene, this.camera, showVM && this.vmVisible !== false ? this.vm.scene : null, this.vm.camera);
    }
    this.input.pressed.delete('hud');
  }

  menuFrame(dt) {
    this.menuT += dt;
    const L = this.level;
    if (!L) return;
    // câmera flutuando devagar pelo nível
    const sp = L.spawn;
    const tt = this.menuT * 0.05;
    const x = sp.x + Math.sin(tt * 1.3) * 1.2, z = sp.z + Math.cos(tt) * 1.2;
    this.camera.position.set(x, 1.55 + Math.sin(this.menuT * 0.4) * 0.03, z);
    this.camera.rotation.set(-0.03 + Math.sin(this.menuT * 0.21) * 0.03, sp.yaw + 0.6 + Math.sin(tt * 0.9) * 0.5, 0, 'YXZ');
    L.update(dt);
    this.post.u.uFade.value = 0;
    this.post.u.uBlink.value = 0;
    this.audio.setListener(this.camera);
    this.audio.update(dt, { light: L.lightLevel(x, z), chase: 0, heart: 0 });
  }

  introFrame(dt) {
    this.introT += dt;
    const T = this.introT;
    const p = this.player;
    p.frozen = true;
    p.update(dt, this.input, this.level);
    this.level.update(dt);
    p.applyCamera(this.camera, dt);
    // acordando: deitado, piscando, levanta
    const rise = smoothstep(2.2, 4.2, T);
    const blink = T < 1.2 ? 1 : T < 1.6 ? lerp(1, 0.35, (T - 1.2) / 0.4) : T < 1.9 ? lerp(0.35, 0.9, (T - 1.6) / 0.3) : T < 2.7 ? lerp(0.9, 0, (T - 1.9) / 0.8) : 0;
    this.post.u.uBlink.value = clamp(blink, 0, 1);
    this.camera.position.y = lerp(0.28, this.camera.position.y, rise);
    this.camera.rotation.z += (1 - rise) * 1.15;
    this.camera.rotation.x = lerp(0.9, this.camera.rotation.x, rise);
    this.vmVisible = T > 3.4;
    if (T > 3.4) this.vm.update(dt, p, this.level);
    this.audio.setListener(this.camera);
    this.audio.update(dt, { light: this.level.lightLevel(p.pos.x, p.pos.z), chase: 0, heart: 0 });
    this.ui.setStats(p);
    if (T > 4.4) {
      p.frozen = false;
      this.vmVisible = true;
      this.post.u.uBlink.value = 0;
      this.state = 'play';
      if (p.battery < 0.15) this.ui.toast(t('t_flash_low'));
    }
  }

  playFrame(dt) {
    const p = this.player, L = this.level, inp = this.input;
    this.playTime += dt;
    if (inp.take('pause')) return this.pause();
    if (inp.take('hud')) document.getElementById('hud').classList.toggle('hidden');
    if (inp.take('fs')) {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {});
    }
    // sem trava do mouse no PC: pede um clique
    if (!inp.touch && !inp.locked) {
      this.unlockedT = (this.unlockedT || 0) + dt;
      if (this.unlockedT > 0.6) {
        this.unlockedT = 0;
        this.state = 'paused';
        this.ui.show('s-click');
        return;
      }
    } else this.unlockedT = 0;
    p.update(dt, inp, L);
    L.update(dt);
    p.applyCamera(this.camera, dt);
    this.camera.fov = damp(this.camera.fov, settings.fov + (p.sprinting ? 5 : 0), 5, dt);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.vm.update(dt, p, L);
    // interação
    const it = this.findInteract();
    if (it) {
      const lab = it.label();
      const ok = !it.can || it.can();
      this.ui.setPrompt(lab, ok);
      if (inp.take('use') && ok) {
        it.use();
        this.vm.doReach();
      }
    } else {
      this.ui.setPrompt(null);
      inp.take('use');
    }
    // perseguição, coração, dano
    let chase = 0, near = 0;
    for (const e of L.entities) {
      if (e.chasing) chase = Math.max(chase, e.chaseLevel ?? 1);
      if (e.pos) {
        const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
        near = Math.max(near, clamp(1 - d / 14, 0, 1) * (e.threat ?? 1));
      }
    }
    this.chase = damp(this.chase, chase, chase > this.chase ? 3 : 0.6, dt);
    this.hurtFx = Math.max(0, this.hurtFx - dt * 1.5);
    const u = this.post.u;
    u.uHurt.value = this.hurtFx;
    u.uLowHp.value = p.hp < 35 ? 1 - p.hp / 35 : 0;
    u.uDesat.value = p.hp < 50 ? (1 - p.hp / 50) * 0.6 : 0;
    u.uGlitch.value = L.glitch ?? near * (L.glitchNear || 0);
    u.uFade.value = 0;
    // HUD
    this.noiseLvl = Math.max(0, this.noiseLvl - dt * 1.2);
    this.ui.setStats(p);
    this.ui.setNoise(this.noiseLvl);
    this._objT = (this._objT || 0) - dt;
    if (this._objT <= 0) {
      this._objT = 0.25;
      this.updateObjective();
    }
    if (p.battery < 0.15 && !this._lowWarn && p.flashOn) {
      this._lowWarn = true;
      this.ui.toast(t('t_flash_low'));
    }
    if (p.battery > 0.3) this._lowWarn = false;
    this.audio.setListener(this.camera);
    this.audio.update(dt, { light: L.lightLevel(p.pos.x, p.pos.z), chase: this.chase, heart: Math.max(this.chase, near * 0.7, p.hp < 35 ? 0.6 : 0), music: L.music ?? 0.5 });
    if (!p.alive) {
      this.state = 'dying';
      this.deathT = 0;
      progress.deaths = (progress.deaths || 0) + 1;
      save();
      this.ui.setPrompt(null);
    }
  }

  dyingFrame(dt) {
    this.deathT += dt;
    const T = this.deathT;
    const p = this.player;
    this.level.update(dt);
    // olha para quem atacou, depois cai
    const k = this.level.killer;
    if (k && T < 0.8) {
      const dx = k.pos.x - p.pos.x, dz = k.pos.z - p.pos.z;
      const yaw = Math.atan2(-dx, -dz);
      p.yaw = p.yaw + wrapAngle(yaw - p.yaw) * Math.min(1, dt * 10);
      p.pitch = damp(p.pitch, -0.2, 8, dt);
    }
    p.deathRoll = smoothstep(0.6, 1.6, T) * 1.3;
    p.deathDrop = smoothstep(0.6, 1.5, T) * 1.25;
    p.applyCamera(this.camera, dt);
    this.post.u.uFade.value = smoothstep(1.2, 2.4, T);
    this.post.u.uHurt.value = 1;
    this.vm.update(dt, p, this.level);
    this.vmVisible = T < 0.7;
    if (T > 2.5) {
      this.state = 'dead';
      this.vmVisible = true;
      this.ui.hud(false);
      this.ui.show('s-dead');
      this.input.unlock();
    }
  }

  transFrame(dt) {
    this.transT += dt;
    const T = this.transT;
    const p = this.player;
    // "noclip": a imagem falha, tudo cai e escurece
    this.post.u.uGlitch.value = smoothstep(0, 1.2, T);
    this.post.u.uFade.value = smoothstep(0.6, 2.0, T);
    p.deathDrop = smoothstep(0.8, 2.0, T) * 2.5;
    p.applyCamera(this.camera, dt);
    this.level.update(dt);
    if (T > 2.2 && !this._transStarted) {
      this._transStarted = true;
      const next = this.levelIndex + 1;
      p.deathDrop = 0;
      if (next >= LEVELS.length) {
        this.post.u.uGlitch.value = 0;
        this.state = 'end';
        this.ui.hud(false);
        this.input.unlock();
        const m = Math.floor(this.playTime / 60), sec = Math.floor(this.playTime % 60);
        this.ui.end(t('end_stats', { t: `${m}:${String(sec).padStart(2, '0')}`, d: progress.deaths || 0 }));
        this._transStarted = false;
        this.post.u.uFade.value = 0;
        return;
      }
      this.startLevel(next).then(() => {
        this._transStarted = false;
        this.post.u.uGlitch.value = 0;
      });
    }
  }
}

// erros aparecem na tela de carregamento em vez de deixá-la parada
function showError(msg) {
  const el = document.getElementById('boot-bar');
  const box = el && el.parentElement && el.parentElement.parentElement;
  if (!box || box.querySelector('.err')) return;
  const p = document.createElement('p');
  p.className = 'err';
  p.style.cssText = 'color:#ff8a7a;font:13px monospace;max-width:90vw;white-space:pre-wrap';
  p.textContent = msg;
  box.appendChild(p);
  const ld = document.getElementById('ld-step');
  if (ld) ld.textContent = msg;
}
addEventListener('error', (e) => showError('Erro: ' + (e.message || e)));
addEventListener('unhandledrejection', (e) => showError('Erro: ' + ((e.reason && (e.reason.stack || e.reason.message)) || e.reason)));

window.game = new Game();

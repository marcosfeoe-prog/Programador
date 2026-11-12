// Núcleo do jogo: renderização, níveis, estados (título → introdução → jogando → pausa →
// transição → final), regras das lembranças/porta, borda do sonho e resolução dinâmica.
import * as THREE from 'three';
import { ATMO, setAtmosphere } from '../engine/atmosphere.js';
import { Sky } from '../engine/sky.js';
import { Post, POST_DEFAULTS } from '../engine/post.js';
import { setMaxAnisotropy } from '../engine/textures.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Memories } from './memories.js';
import { Door } from './door.js';
import { LEVELS } from '../levels/index.js';
import { QUALITY, loadSettings, saveSettings, loadProgress, saveProgress } from './save.js';

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

export class Game {
  constructor({ canvas, ui = null, audio = null, params = {} }) {
    this.canvas = canvas;
    this.ui = ui;
    this.audio = audio;
    this.params = params;
    this.settings = loadSettings();
    if (params.q && QUALITY[params.q]) this.settings.quality = params.q;
    this.progress = loadProgress();
    this.q = QUALITY[this.settings.quality] || QUALITY.media;

    const r = (this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      stencil: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: !!params.shot,
    }));
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.toneMapping = THREE.NoToneMapping;
    setMaxAnisotropy(Math.min(8, r.capabilities.getMaxAnisotropy()));

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xffffff, 0.001);
    this.camera = new THREE.PerspectiveCamera(60, 1, 0.12, 6000);
    this.camera.rotation.order = 'YXZ';
    this.sky = new Sky();
    this.scene.add(this.sky.mesh);

    const sun = (this.sun = new THREE.DirectionalLight('#ffffff', 2));
    sun.shadow.mapSize.set(this.q.shadowSize, this.q.shadowSize);
    const sc = sun.shadow.camera;
    this.shadowExtent = 38;
    sc.left = -this.shadowExtent;
    sc.right = this.shadowExtent;
    sc.top = this.shadowExtent;
    sc.bottom = -this.shadowExtent;
    sc.near = 1;
    sc.far = 260;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.035;
    sun.castShadow = this.q.shadows;
    this.scene.add(sun, sun.target);
    this.hemi = new THREE.HemisphereLight('#ffffff', '#555555', 0.3);
    this.scene.add(this.hemi);

    this.post = new Post(r);
    this.post.levels = this.q.bloomLevels;
    this.input = new Input(canvas);
    this.player = new Player(this.camera);
    this.player.onStep = (s, k, run) => this.audio && this.audio.step(s, k, run);
    this.player.onLand = (v) => this.audio && this.audio.land(v);
    this.input.onUnlock = () => {
      if (this.state === 'play' && !this.input.isTouch) this.pause();
    };

    this.state = 'boot';
    this.level = null;
    this.levelIndex = -1;
    this.memories = null;
    this.door = null;
    this.time = 0;
    this.last = performance.now();
    this.renderScale = 1;
    this.ftAvg = 16;
    this.scaleTimer = 0;
    this.fade = null;
    this.fadeValue = params.shot ? 0 : 1;
    this.fadeColor = new THREE.Color('#ffffff');
    this.wrapping = false;
    this.idle = 0;
    this.titleT = 0;
    this.frames = 0;
    this.fpsAcc = 0;
    this.fpsN = 0;
    this._lp = new THREE.Vector3();
    this.applySettings();
    addEventListener('resize', () => this.resize());
    this.resize();
  }

  // ------------------------------------------------------------------ configurações
  applySettings() {
    const s = this.settings;
    const q = QUALITY[s.quality] || QUALITY.media;
    const qualityChanged = q !== this.q;
    this.q = q;
    this.player.sens = s.sens;
    this.player.invertY = s.invertY;
    this.player.bobEnabled = s.bob;
    this.post.user.grain = s.grain ? 1 : 0;
    this.post.user.ca = s.ca ? 1 : 0;
    this.post.user.vhs = s.vhs ? 1 : 0;
    this.sun.castShadow = q.shadows;
    if (this.sun.shadow.mapSize.x !== q.shadowSize) {
      this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      if (this.sun.shadow.map) {
        this.sun.shadow.map.dispose();
        this.sun.shadow.map = null;
      }
    }
    if (this.post.levels !== q.bloomLevels) {
      this.post.levels = q.bloomLevels;
      this.post.w = 0;
    }
    if (this.audio) this.audio.setVolumes(s.master, s.music, s.sfx);
    if (this.ui) this.ui.setFps(s.fps);
    this.resize();
    if (qualityChanged && this.level && this.levelIndex >= 0 && this.state !== 'boot') {
      // a densidade da grama depende da qualidade: recarrega o nível atual mantendo a posição
      this.reloadKeepingPosition();
    }
  }

  saveSettings() {
    saveSettings(this.settings);
    this.applySettings();
  }

  async reloadKeepingPosition() {
    const p = this.player.pos.clone(), yaw = this.player.yaw, pitch = this.player.pitch;
    const collected = this.memories ? this.memories.items.map((m) => m.collected) : [];
    const doorShown = this.door && this.door.state !== 'hidden';
    const st = this.state;
    await this.loadLevel(this.levelIndex);
    this.player.pos.copy(p);
    this.player.yaw = yaw;
    this.player.pitch = pitch;
    collected.forEach((c, i) => {
      if (c && this.memories.items[i]) {
        this.memories.items[i].collected = true;
        this.memories.items[i].done = true;
        this.memories.items[i].group.visible = false;
      }
    });
    if (doorShown) this.door.show(true);
    this.state = st;
    if (this.ui) this.ui.setCount(this.memories.count, this.memories.total);
  }

  resize() {
    const w = innerWidth, h = innerHeight;
    const css = Math.min(devicePixelRatio || 1, this.q.maxPixel);
    this.renderer.setPixelRatio(css);
    this.renderer.setSize(w, h, true);
    const s = css * this.q.pixel * this.renderScale;
    this.post.setSize(w * s, h * s, this.q.msaa);
    this.camera.aspect = w / h;
    let fov = this.settings.fov;
    if (this.camera.aspect < 1) {
      // em retrato, garante um campo de visão horizontal razoável
      const hf = (62 * Math.PI) / 180;
      fov = Math.max(fov, (2 * Math.atan(Math.tan(hf / 2) / this.camera.aspect) * 180) / Math.PI);
      fov = Math.min(fov, 100);
    }
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------------ níveis
  async loadLevel(i) {
    if (this.ui) this.ui.loading(true);
    await nextFrame();
    await nextFrame();
    if (this.level) {
      this.scene.remove(this.level.group);
      this.level.dispose();
      if (this.memories) this.memories.dispose();
    }
    if (this.audio) this.audio.clearLevel();
    const L = LEVELS[i];
    const level = new L.cls({ quality: this.q, renderer: this.renderer, game: this });
    level.build();
    this.level = level;
    this.levelIndex = i;
    this.meta = L.meta;
    this.scene.add(level.group);
    this.memories = new Memories(level.memoryDefs, level.env.memoryColor || '#ffd6ea');
    level.group.add(this.memories.group);
    this.memories.onCollect = (m) => this.collect(m);
    const d = level.door;
    this.door = new Door(d);
    level.group.add(this.door.group);
    this.door.onEnter = () => this.nextLevel();
    level.dynamic = [this.door];
    this.applyEnv(level.env);
    this.player.spawn(level.spawn, level);
    this.wrapping = false;
    this.idle = 0;
    this.titleT = 0;
    if (this.audio) this.audio.setLevel(level, this.memories.items, this.door);
    if (this.ui) this.ui.setCount(0, this.memories.total);
    this.camera.updateMatrixWorld();
    this.renderer.compile(this.scene, this.camera);
    if (this.ui) this.ui.loading(false);
  }

  applyEnv(env) {
    this.sky.set(env.sky || {});
    this.sky.uniforms.uCloudSteps.value = Math.min((env.sky && env.sky.cloudSteps) || 6, this.q.skySteps || 6);
    setAtmosphere(env.atmo || {});
    ATMO.uFogSunDir.value.copy(this.sky.sunDir);
    const s = env.sun || {};
    this.sun.color.set(s.color || '#ffffff');
    this.sun.intensity = s.intensity ?? 2;
    this.sunDir = this.sky.sunDir.clone();
    if (s.elev !== undefined) {
      const el = (s.elev * Math.PI) / 180, az = ((s.azim ?? env.sky.sunAzim ?? 0) * Math.PI) / 180;
      this.sunDir.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
    }
    const h = env.hemi || {};
    this.hemi.color.set(h.sky || '#ffffff');
    this.hemi.groundColor.set(h.ground || '#444444');
    this.hemi.intensity = h.intensity ?? 0.3;
    this.shadowExtent = env.shadowExtent || 38;
    const sc = this.sun.shadow.camera;
    sc.left = sc.bottom = -this.shadowExtent;
    sc.right = sc.top = this.shadowExtent;
    sc.updateProjectionMatrix();
    this.scene.environment = this.sky.makeEnvironment(this.renderer);
    this.scene.environmentIntensity = env.envIntensity ?? 1;
    this.post.set({ ...POST_DEFAULTS, ...(env.post || {}), exposure: env.exposure ?? 1 }, true);
    this.wobble = env.wobble || 0;
  }

  // ------------------------------------------------------------------ regras
  collect(m) {
    if (this.audio) this.audio.collect(m);
    if (this.ui) this.ui.showMemory(m, this.memories.count, this.memories.total);
    this.idle = 0;
    if (this.memories.count === this.memories.total) {
      setTimeout(() => this.allCollected(), 3200);
    }
  }

  allCollected() {
    if (!this.level) return;
    if (this.level.onAllCollected) {
      this.level.onAllCollected(this);
      return;
    }
    this.door.show();
    if (this.audio) this.audio.doorAppear(this.door);
    if (this.ui) this.ui.whisper(this.level.doorLine || 'uma porta se abriu em algum lugar.');
  }

  async nextLevel() {
    if (this.state === 'transition' || this.state === 'ending') return;
    this.state = 'transition';
    this.player.frozen = true;
    if (this.audio) this.audio.transition();
    await this.fadeTo('#ffffff', 2.4);
    const next = this.levelIndex + 1;
    this.progress.unlocked = Math.max(this.progress.unlocked, Math.min(next, LEVELS.length - 1));
    if (next >= LEVELS.length) {
      this.progress.finished = true;
      this.progress.level = 0;
      saveProgress(this.progress);
      return this.ending();
    }
    this.progress.level = next;
    saveProgress(this.progress);
    await this.loadLevel(next);
    this.player.frozen = false;
    this.state = 'play';
    if (this.ui) this.ui.levelCard(LEVELS[next].meta);
    await this.fadeFrom(3);
  }

  async ending() {
    this.state = 'ending';
    this.input.releaseLock();
    if (this.audio) this.audio.ending();
    if (this.ui) await this.ui.ending();
    this.showTitle(true);
  }

  // ------------------------------------------------------------------ fluxo
  async showTitle(fromEnding = false) {
    this.state = 'title-loading';
    this.input.enabled = false;
    this.input.releaseLock();
    const idx = Math.min(this.progress.unlocked, LEVELS.length - 1);
    if (this.levelIndex !== idx || !this.level) await this.loadLevel(idx);
    this.state = 'title';
    this.titleT = 0;
    this.player.frozen = true;
    if (this.ui) this.ui.showTitle(this.progress);
    if (this.audio) this.audio.titleMode(true);
    await this.fadeFrom(fromEnding ? 4 : 2.5);
  }

  async start(levelIndex, { intro = false } = {}) {
    if (this.audio) {
      this.audio.unlock();
      this.audio.titleMode(false);
    }
    this.state = 'starting';
    if (this.ui) this.ui.hideTitle();
    await this.fadeTo('#ffffff', 1.4);
    if (intro && this.ui) await this.ui.intro();
    this.progress.level = levelIndex;
    saveProgress(this.progress);
    if (this.levelIndex !== levelIndex || this.levelDirty) await this.loadLevel(levelIndex);
    else {
      this.player.spawn(this.level.spawn, this.level);
      if (this.audio) this.audio.setLevel(this.level, this.memories.items, this.door);
    }
    this.levelDirty = true;
    this.player.frozen = false;
    this.input.enabled = true;
    this.input.consumeLook();
    this.state = 'play';
    this.input.requestLock();
    if (this.ui) {
      this.ui.showHud(true);
      this.ui.levelCard(LEVELS[levelIndex].meta);
    }
    await this.fadeFrom(3);
  }

  pause() {
    if (this.state !== 'play') return;
    this.state = 'pause';
    this.input.enabled = false;
    this.input.releaseLock();
    if (this.audio) this.audio.pause(true);
    if (this.ui) this.ui.showPause(true);
  }

  resume() {
    if (this.state !== 'pause') return;
    this.state = 'play';
    this.input.enabled = true;
    this.input.consumeLook();
    this.input.requestLock();
    if (this.audio) this.audio.pause(false);
    if (this.ui) this.ui.showPause(false);
    this.last = performance.now();
  }

  async quitToTitle() {
    if (this.ui) this.ui.showPause(false);
    if (this.audio) this.audio.pause(false);
    this.state = 'quitting';
    await this.fadeTo('#ffffff', 1.2);
    if (this.ui) this.ui.showHud(false);
    this.levelDirty = true;
    this.showTitle();
  }

  fadeTo(color, dur) {
    this.fadeColor.set(color);
    return new Promise((res) => (this.fade = { from: this.fadeValue, to: 1, dur, t: 0, res }));
  }
  fadeFrom(dur) {
    return new Promise((res) => (this.fade = { from: this.fadeValue, to: 0, dur, t: 0, res }));
  }

  // pisca branco, teletransporta para o lado oposto do sonho
  async dreamWrap() {
    if (this.wrapping) return;
    this.wrapping = true;
    if (this.audio) this.audio.blink();
    await this.fadeTo('#ffffff', 0.7);
    const b = this.level.bounds, p = this.player.pos;
    const dx = p.x - b.x, dz = p.z - b.z;
    const d = Math.hypot(dx, dz) || 1;
    const k = (-0.8 * b.r) / d;
    p.x = b.x + dx * k;
    p.z = b.z + dz * k;
    p.y = this.level.heightAt(p.x, p.z);
    if (this.level.onWrap) this.level.onWrap(this);
    if (this.ui) this.ui.whisper(['você já esteve aqui antes.', 'tudo é igual. tudo é diferente.', 'não existe fora daqui.'][Math.floor(Math.random() * 3)]);
    await this.fadeFrom(1.4);
    this.wrapping = false;
  }

  whisper(t) {
    if (this.ui) this.ui.whisper(t);
  }

  // ------------------------------------------------------------------ quadro
  updateShadow() {
    const L = this.sunDir || this.sky.sunDir;
    const T = this.player.pos;
    const cam = this.camera;
    const fx = -Math.sin(this.player.yaw), fz = -Math.cos(this.player.yaw);
    const cx = (this.state === 'play' ? T.x : cam.position.x) + fx * this.shadowExtent * 0.35;
    const cz = (this.state === 'play' ? T.z : cam.position.z) + fz * this.shadowExtent * 0.35;
    // alinha ao texel para não tremer
    const right = this._r || (this._r = new THREE.Vector3());
    const up = this._u || (this._u = new THREE.Vector3());
    right.set(0, 1, 0).cross(L);
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    up.copy(L).cross(right).normalize();
    const texel = (this.shadowExtent * 2) / this.sun.shadow.mapSize.x;
    const p = this._lp.set(cx, 0, cz);
    const a = Math.round(p.dot(right) / texel) * texel;
    const b = Math.round(p.dot(up) / texel) * texel;
    const c = p.dot(L);
    p.copy(right).multiplyScalar(a).addScaledVector(up, b).addScaledVector(L, c);
    this.sun.target.position.copy(p);
    this.sun.position.copy(p).addScaledVector(L, 120);
    this.sun.target.updateMatrixWorld();
  }

  updateTitleCam(dt) {
    this.titleT += dt;
    const tc = this.level.titleCam || {};
    const from = tc.from || [this.level.spawn.x, 1.6, this.level.spawn.z];
    const to = tc.to || [from[0], from[1], from[2] - 20];
    const dur = tc.dur || 90;
    const k = (Math.sin((this.titleT / dur) * Math.PI * 2 - Math.PI / 2) + 1) / 2;
    const cam = this.camera;
    cam.position.set(from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k, from[2] + (to[2] - from[2]) * k);
    const yaw = (tc.yaw ?? this.level.spawn.yaw) + Math.sin(this.titleT * 0.05) * 0.12;
    const pitch = (tc.pitch ?? 0.04) + Math.sin(this.titleT * 0.07) * 0.02;
    cam.rotation.set(pitch, yaw, 0);
    this.player.pos.set(cam.position.x, 0, cam.position.z);
    this.player.yaw = yaw;
  }

  frame() {
    const now = performance.now();
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = Math.min(Math.max(dt, 0), 0.1);
    this.time += dt;
    ATMO.uTime.value = this.time;
    const inp = this.input;
    inp.update(dt);

    if (this.state === 'play') {
      if (inp.pressed('Escape') || inp.pressed('KeyP') || inp.pressed('Pause')) this.pause();
      if (inp.pressed('KeyH') && this.ui) this.ui.toggleHud();
      if (inp.pressed('KeyF') && this.ui) this.ui.toggleFullscreen();
    } else if (this.state === 'pause') {
      if (inp.pressed('Pause')) this.resume();
    }

    const lvl = this.level;
    if (lvl) {
      const playing = this.state === 'play' || this.state === 'transition';
      if (playing) {
        this.player.update(dt, inp, lvl);
        const b = lvl.bounds;
        if (this.state === 'play' && Math.hypot(this.player.pos.x - b.x, this.player.pos.z - b.z) > b.r) this.dreamWrap();
        this.idle += dt;
      } else if (this.state === 'title' || this.state === 'title-loading' || this.state === 'starting') {
        if (this.state !== 'starting') this.updateTitleCam(dt);
      } else if (this.params.shot) {
        this.player.apply(0);
      }
      if (this.state !== 'pause') {
        lvl.update(dt, this.time, this);
        this.memories.enabled = this.state === 'play';
        this.memories.update(dt, this.time, this.camera, this.player.pos);
        this.door.update(dt, this.time, this.state === 'play' ? this.player : null);
      }
    }
    if (this.fade) {
      const f = this.fade;
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      const e = k * k * (3 - 2 * k);
      this.fadeValue = f.from + (f.to - f.from) * e;
      if (k >= 1) {
        this.fade = null;
        f.res();
      }
    }
    this.camera.updateMatrixWorld();
    this.sky.follow(this.camera);
    ATMO.uFogParams.value.w = this.camera.position.y;
    this.updateShadow();
    if (lvl) for (const g of lvl.grass) g.setSunView(this.sunDir || this.sky.sunDir, this.camera);
    this.post.update(this.state === 'pause' ? 0 : dt);
    this.post.compMat.uniforms.uFade.value = this.fadeValue;
    this.post.compMat.uniforms.uFadeColor.value.copy(this.fadeColor);
    this.post.compMat.uniforms.uWobble.value = this.wobble || 0;
    if (this.audio) this.audio.update(dt, this.camera, this);
    this.post.render(this.scene, this.camera, this.time);
    inp.endFrame();
    this.dynamicResolution(dt);
  }

  dynamicResolution(dt) {
    this.frames++;
    const ms = dt * 1000;
    this.ftAvg += (ms - this.ftAvg) * 0.05;
    this.fpsAcc += dt;
    this.fpsN++;
    if (this.fpsAcc > 0.5) {
      if (this.ui) this.ui.fps(Math.round(this.fpsN / this.fpsAcc), this.renderScale);
      this.fpsAcc = 0;
      this.fpsN = 0;
    }
    if (this.params.shot || this.state !== 'play') return;
    this.scaleTimer += dt;
    if (this.scaleTimer < 2) return;
    let s = this.renderScale;
    if (this.ftAvg > 24) s = Math.max(0.55, s - 0.1);
    else if (this.ftAvg < 14 && s < 1) s = Math.min(1, s + 0.05);
    if (s !== this.renderScale) {
      this.renderScale = s;
      this.scaleTimer = 0;
      this.resize();
    }
  }

  run() {
    const maxFrames = Number(this.params.frames || 0);
    let n = 0;
    const loop = () => {
      try {
        this.frame();
      } catch (e) {
        console.error(e);
      }
      n++;
      if (maxFrames && n >= maxFrames && document.body.dataset.ready === '1') {
        document.body.dataset.done = '1';
        return;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }
}

export { LEVELS, wait };

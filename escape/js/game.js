// Núcleo do jogo: renderização, níveis, interação, HUD, morte e transições.
import * as THREE from 'three';
import { clamp, damp, RNG } from './util.js';
import { audio } from './audio.js';
import { Player } from './player.js';
import { ViewModel } from './viewmodel.js';
import { Entity } from './entity.js';
import { bottleLabel } from './textures.js';
import { LEVELS } from './levels/index.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'escape-backrooms-v1';

export function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY)) || { unlocked: 0 };
  } catch {
    return { unlocked: 0 };
  }
}

function writeSave(s) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* armazenamento indisponível: o progresso só dura esta sessão */
  }
}

export class Game {
  constructor(canvas, input) {
    this.canvas = canvas;
    this.input = input;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.autoClear = false;
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.05, 120);
    this.vmCamera = new THREE.PerspectiveCamera(60, 1, 0.01, 5);
    this.player = new Player(this.camera);
    this.vm = new ViewModel();
    // Lanterna presa à câmera.
    this.flash = new THREE.SpotLight(0xfff1d6, 30, 26, 0.48, 0.55, 1.4);
    this.flash.position.set(0.15, -0.12, 0);
    this.flashTarget = new THREE.Object3D();
    this.flashTarget.position.set(0.05, -0.05, -4);
    this.camera.add(this.flash, this.flashTarget);
    this.flash.target = this.flashTarget;
    this.fill = new THREE.PointLight(0xffffff, 0, 5, 2);
    this.camera.add(this.fill);

    this.save = loadSave();
    this.state = 'menu';
    this.levelIndex = 0;
    this.almond = 0;
    this.deaths = 0;
    this.runTime = 0;
    this.clock = new THREE.Clock();
    this.resize();
    addEventListener('resize', () => this.resize());
    input.onPause = () => this.pause();
    this.loop = this.loop.bind(this);
    requestAnimationFrame(this.loop);
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = this.vmCamera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.vmCamera.updateProjectionMatrix();
  }

  // ---------- Carregamento de níveis ----------

  disposeScene() {
    if (!this.scene) return;
    audio.stopLoops();
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          for (const k of ['map', 'emissiveMap', 'alphaMap']) if (m[k]) m[k].dispose();
          m.dispose();
        }
      }
    });
  }

  loadLevel(i) {
    this.disposeScene();
    this.levelIndex = i;
    const L = LEVELS[i];
    this.level = L;
    this.scene = new THREE.Scene();
    this.scene.add(this.camera);
    this.rng = new RNG((Date.now() & 0xffff) + i * 977);
    this.interacts = [];
    this.pickups = [];
    this.entities = [];
    this.exits = [];
    this.updaters = [];
    this.lamps = null;
    this.playerField = null;
    this.fieldT = 0;
    this.holdT = 0;
    this.fear = 0;
    this.heartT = 0;
    this.time = 0;
    this.surface = 'carpet';
    this.player.reset();
    this.vm.reset();
    this.almond = Math.min(this.almond, 3);
    this.flash.intensity = 30;
    this.fill.intensity = 0;
    this.renderer.toneMappingExposure = 1;
    document.body.style.setProperty('--fear', 0);
    const ret = L.build(this);
    this.levelLogic = ret;
    this.player.place(ret.start.x, ret.start.z, ret.start.yaw ?? 0);
    const [sx, sz] = this.grid.cellOf(this.player.pos);
    const dist = this.grid.bfs(sx, sz, (x, z) => this.grid.walkableForEntity(x, z));
    this.patrolCells = [];
    for (let k = 0; k < dist.length; k++) if (dist[k] > 4) this.patrolCells.push([k % this.grid.w, (k / this.grid.w) | 0]);
    this.doors = [...this.grid.doors.values()];
    audio.setAmbience(L.ambience);
    $('hud-level').textContent = `NÍVEL ${L.number} — ${L.name}`;
    this.updateInv();
    this.hideMsg();
    this.renderer.compile(this.scene, this.camera);
  }

  // ---------- API usada pelos níveis ----------

  setObjective(text) {
    const el = $('objective');
    if (el.dataset.text === text) return;
    el.dataset.text = text;
    el.textContent = text;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  }

  toast(text, secs = 3.5) {
    const el = $('toast');
    el.textContent = text;
    el.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('on'), secs * 1000);
  }

  hideMsg() {
    $('toast').classList.remove('on');
  }

  addInteract(it) {
    this.interacts.push({ radius: 2.2, enabled: () => true, ...it });
    return it;
  }

  removeInteract(it) {
    this.interacts = this.interacts.filter((x) => x !== it && x.ref !== it);
  }

  addUpdate(fn) {
    this.updaters.push(fn);
  }

  addEntity(kind, x, z, opts) {
    const e = new Entity(this, kind, x, z, opts);
    this.entities.push(e);
    return e;
  }

  addExit(ex) {
    this.exits.push({ radius: 1.2, active: () => true, ...ex });
  }

  // Item flutuante e girando. kind: 'almond' | 'battery' | objeto custom.
  addPickup(kind, pos, opts = {}) {
    const g = new THREE.Group();
    let label = opts.label;
    if (kind === 'almond') {
      const glass = new THREE.Mesh(
        new THREE.CylinderGeometry(0.07, 0.07, 0.3, 12),
        new THREE.MeshLambertMaterial({ color: 0xf1ead2, emissive: 0x2a2416 }),
      );
      const lab = new THREE.Mesh(new THREE.CylinderGeometry(0.073, 0.073, 0.12, 12, 1, true), new THREE.MeshBasicMaterial({ map: bottleLabel() }));
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.05, 8), new THREE.MeshLambertMaterial({ color: 0x5f7a2e }));
      cap.position.y = 0.18;
      g.add(glass, lab, cap);
      label = label || 'Pegar água de amêndoas';
    } else if (kind === 'battery') {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.18, 10), new THREE.MeshLambertMaterial({ color: 0x2a6fdb, emissive: 0x0a1a40 }));
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), new THREE.MeshLambertMaterial({ color: 0xcccccc }));
      t.position.y = 0.105;
      g.add(b, t);
      label = label || 'Pegar pilhas';
    } else if (opts.mesh) {
      g.add(opts.mesh);
    }
    // Brilho suave para chamar atenção no escuro.
    const halo = new THREE.Sprite(
      new THREE.SpriteMaterial({ map: haloTexture(), color: opts.glow ?? 0xfff0b0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    halo.scale.setScalar(0.9);
    g.add(halo);
    g.position.copy(pos);
    g.position.y = pos.y || 0.9;
    this.scene.add(g);
    const p = { kind, group: g, baseY: g.position.y, phase: Math.random() * 6, halo };
    p.interact = this.addInteract({
      pos: g.position,
      prompt: label,
      radius: 2.0,
      use: () => {
        this.scene.remove(g);
        this.pickups = this.pickups.filter((x) => x !== p);
        this.removeInteract(p.interact);
        audio.pickup();
        if (kind === 'almond') {
          this.almond++;
          this.updateInv();
          this.toast('Água de amêndoas — pressione Q para beber (restaura o fôlego)');
        } else if (kind === 'battery') {
          this.player.battery = 1;
          this.toast('Lanterna recarregada');
        }
        if (opts.onPick) opts.onPick();
      },
    });
    this.pickups.push(p);
    return p;
  }

  updateInv() {
    $('inv-almond').textContent = `× ${this.almond}`;
    $('inv').classList.toggle('empty', this.almond === 0);
  }

  // ---------- Fluxo ----------

  start(levelIndex) {
    audio.unlock();
    this.deathsAtStart = this.deaths;
    this.showScreen(null);
    this.transitionTo(levelIndex, true);
  }

  transitionTo(i, fromMenu = false) {
    this.state = 'transition';
    const fade = $('fade');
    fade.classList.add('on');
    if (!fromMenu) {
      fade.classList.add('noclip');
      document.body.classList.add('noclip-cam');
      audio.noclip();
    }
    setTimeout(() => {
      fade.classList.remove('noclip');
      document.body.classList.remove('noclip-cam');
      $('hud').classList.remove('hidden');
      this.loadLevel(i);
      this.showLevelCard(LEVELS[i]);
      setTimeout(() => {
        fade.classList.remove('on');
        this.state = 'playing';
        this.input.enabled = true;
        this.input.reset();
        this.input.requestLock();
        if (LEVELS[i].intro) this.toast(LEVELS[i].intro, 6);
      }, 2600);
    }, fromMenu ? 400 : 1700);
  }

  showLevelCard(L) {
    const card = $('levelcard');
    $('lc-num').textContent = `NÍVEL ${L.number}`;
    $('lc-name').textContent = L.name;
    $('lc-sub').textContent = L.subtitle;
    card.classList.remove('on');
    void card.offsetWidth;
    card.classList.add('on');
  }

  completeLevel() {
    if (this.state !== 'playing') return;
    const next = this.levelIndex + 1;
    if (next >= LEVELS.length) return this.win();
    this.save.unlocked = Math.max(this.save.unlocked, next);
    writeSave(this.save);
    this.transitionTo(next);
  }

  win() {
    this.state = 'won';
    this.input.enabled = false;
    this.input.releaseLock();
    this.save.unlocked = LEVELS.length - 1;
    this.save.won = true;
    writeSave(this.save);
    audio.setAmbience(null);
    audio.stopLoops();
    audio.win();
    const m = Math.floor(this.runTime / 60);
    const s = Math.floor(this.runTime % 60);
    $('win-stats').textContent = `Tempo: ${m}min ${String(s).padStart(2, '0')}s · Mortes: ${this.deaths}`;
    $('fade').classList.add('on', 'white');
    setTimeout(() => {
      $('hud').classList.add('hidden');
      this.showScreen('win');
      $('fade').classList.remove('on', 'white');
    }, 1800);
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.enabled = false;
    this.input.releaseLock();
    this.showScreen('pause');
    if (audio.ctx) audio.ctx.suspend();
  }

  resume() {
    this.showScreen(null);
    this.state = 'playing';
    this.input.enabled = true;
    this.input.reset();
    if (audio.ctx) audio.ctx.resume();
    this.input.requestLock();
  }

  restartLevel() {
    if (audio.ctx) audio.ctx.resume();
    this.showScreen(null);
    $('death').classList.remove('on');
    this.transitionTo(this.levelIndex, true);
  }

  toMenu() {
    if (audio.ctx) audio.ctx.resume();
    this.disposeScene();
    this.scene = null;
    this.state = 'menu';
    this.input.enabled = false;
    this.input.releaseLock();
    audio.setAmbience(null);
    $('hud').classList.add('hidden');
    $('death').classList.remove('on');
    this.save = loadSave();
    this.showScreen('menu');
    if (this.onMenu) this.onMenu();
  }

  showScreen(id) {
    for (const el of document.querySelectorAll('.screen')) el.classList.toggle('on', el.id === id);
  }

  flashDamage() {
    const el = $('jumpflash');
    el.classList.remove('hurt');
    void el.offsetWidth;
    el.classList.add('hurt');
  }

  onSpotted() {
    this.player.shake = Math.max(this.player.shake, 0.4);
  }

  onCaught(ent) {
    if (!this.player.alive || this.state !== 'playing') return;
    this.player.alive = false;
    this.state = 'dying';
    this.killer = ent;
    this.deathT = 0;
    this.deaths++;
    this.input.enabled = false;
    audio.scream();
    // A entidade surge na frente da câmera e avança.
    const f = this.player.forward;
    const p = this.player.pos;
    this.lungeDir = f.clone();
    ent.pos.set(p.x + f.x * 1.7, 0, p.z + f.z * 1.7);
    ent.yaw = Math.atan2(-f.x, -f.z);
    ent.speed = 5;
    $('jumpflash').classList.remove('on');
    void $('jumpflash').offsetWidth;
    $('jumpflash').classList.add('on');
  }

  // ---------- Laço principal ----------

  loop() {
    requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (!this.scene) {
      this.renderer.clear();
      return;
    }
    if (this.state === 'playing') this.update(dt);
    else if (this.state === 'dying') this.updateDying(dt);
    else if (this.state === 'transition') this.updateIdle(dt);
    else if (this.state === 'menu') this.updateMenu(dt);
    this.render();
  }

  // Vitrine do menu: a câmera vaga sozinha pelo nível, virando nas paredes.
  updateMenu(dt) {
    this.time += dt;
    const P = this.player;
    const f = P.forward;
    const before = P.pos.clone();
    P.pos.addScaledVector(f, dt * 1.1);
    this.grid.collide(P.pos, 0.6, false);
    const moved = P.pos.distanceTo(before);
    this.menuTurn = this.menuTurn ?? 0;
    if (moved < dt * 0.6) this.menuTurn = 1.2;
    if (this.menuTurn > 0) {
      P.yaw += dt * 1.1;
      this.menuTurn -= dt;
    } else P.yaw += Math.sin(this.time * 0.3) * dt * 0.15;
    P.pitch = Math.sin(this.time * 0.2) * 0.08;
    P.stepPhase += dt * 0.5;
    P.bobAmp = 0.4;
    P.applyCamera(this.time);
    this.flash.intensity = 0;
    if (this.lamps) this.lamps.update(dt, P.pos);
  }

  updateIdle(dt) {
    this.player.applyCamera(this.time);
    if (this.lamps) this.lamps.update(dt, this.player.pos);
  }

  update(dt) {
    this.time += dt;
    this.runTime += dt;
    const P = this.player;
    P.update(dt, this.input, this.grid, this.surface);
    P.applyCamera(this.time);

    // Campo de distâncias até o jogador (para as entidades perseguirem).
    this.fieldT -= dt;
    if (this.fieldT <= 0 && this.entities.length) {
      this.fieldT = 0.25;
      const [px, pz] = this.grid.cellOf(P.pos);
      this.playerField = this.grid.bfs(px, pz, (x, z) => this.grid.walkableForEntity(x, z));
    }

    // Beber água de amêndoas.
    if (this.input.consume('drink')) {
      if (this.almond > 0 && this.vm.drink()) {
        this.almond--;
        this.updateInv();
        audio.drink();
        setTimeout(() => {
          P.boost = 8;
          P.stamina = 1;
          P.exhausted = false;
          this.toast('Fôlego restaurado');
        }, 1200);
      } else if (this.almond === 0) this.toast('Você não tem água de amêndoas', 2);
    }

    this.updateInteraction(dt);

    for (const d of this.doors) d.update(dt);
    for (const p of this.pickups) {
      p.phase += dt;
      p.group.rotation.y += dt * 1.2;
      p.group.position.y = p.baseY + Math.sin(p.phase * 2) * 0.06;
      p.halo.material.opacity = 0.35 + Math.sin(p.phase * 3) * 0.15;
    }
    for (const fn of this.updaters) fn(dt);
    if (this.levelLogic.update) this.levelLogic.update(dt);
    if (this.lamps) this.lamps.update(dt, P.pos);

    // Medo: perto de entidades que perseguem.
    let fear = 0;
    for (const e of this.entities) {
      e.update(dt, P);
      if (!e.active) continue;
      const d = e.pos.distanceTo(P.pos);
      const k = clamp(1 - d / (e.state === 'chase' ? 22 : 9), 0, 1);
      fear = Math.max(fear, e.state === 'chase' ? 0.35 + k * 0.65 : k * 0.4);
    }
    this.fear = damp(this.fear, fear, 3, dt);
    this.heartT -= dt;
    if (this.fear > 0.25 && this.heartT <= 0) {
      this.heartT = 1.1 - this.fear * 0.65;
      audio.heartbeat(0.25 + this.fear * 0.5);
    }
    P.shake = Math.max(P.shake, this.fear > 0.7 ? (this.fear - 0.7) * 0.6 : 0);

    // Saídas.
    for (const ex of this.exits) {
      if (!ex.active()) continue;
      const d = Math.hypot(ex.pos.x - P.pos.x, ex.pos.z - P.pos.z);
      if (d < ex.radius) {
        if (ex.onEnter) ex.onEnter();
        this.completeLevel();
        break;
      }
    }

    // Lanterna: tremula com pouca bateria.
    let fi = P.light ? 30 : 0;
    if (P.light && P.battery < 0.2 && Math.random() < 0.08) fi *= Math.random() * 0.4;
    this.flash.intensity = fi * (this.level.flashScale ?? 1);
    this.vm.update(dt, P, this.time);
    this.updateHud();
  }

  updateDying(dt) {
    this.deathT += dt;
    const e = this.killer;
    const P = this.player;
    P.shake = 1;
    // A entidade avança até o rosto e a câmera trava nela.
    const k = Math.min(1, this.deathT / 0.35);
    const reach = 1.7 - k * k * 0.85;
    e.pos.set(P.pos.x + this.lungeDir.x * reach, 0, P.pos.z + this.lungeDir.z * reach);
    const head = new THREE.Vector3();
    (e.model.head || e.model.face).getWorldPosition(head);
    const want = Math.atan2(head.y - this.camera.position.y, reach);
    P.pitch = damp(P.pitch, want, 10, dt);
    P.applyCamera(this.time);
    e.speed = 4;
    e.mouthOpen = 6;
    e.animate(dt);
    // Curva-se sobre a vítima, braços agarrando, boca escancarada.
    if (e.model.arms) {
      for (const A of e.model.arms) {
        A.sh.rotation.x = -1.3 + Math.sin(this.deathT * 30 + A.side) * 0.2;
        A.sh.rotation.z = A.side * 0.5;
      }
      e.model.spine.rotation.x = 0.55;
      e.model.neck.rotation.x = -0.45;
      e.model.head.rotation.z = Math.sin(this.deathT * 40) * 0.15;
    }
    this.player.eye = damp(this.player.eye, 1.25, 2, dt);
    if (this.deathT > 1.4 && this.state === 'dying') {
      this.state = 'dead';
      this.input.releaseLock();
      $('death').classList.add('on');
      $('death-msg').textContent = e.kind === 'smiler' ? 'O Sorridente encontrou você no escuro.' : e.kind === 'pale' ? 'O Pálido arrastou você para os canos.' : 'O Uivador pegou você.';
      audio.setAmbience(null);
    }
  }

  updateInteraction(dt) {
    const cam = this.camera;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir);
    let best = null;
    let bestScore = -1;
    for (const it of this.interacts) {
      if (!it.enabled()) continue;
      const v = new THREE.Vector3().subVectors(it.pos, cam.position);
      const d = v.length();
      if (d > it.radius) continue;
      const dot = v.normalize().dot(dir);
      if (dot < 0.72 && d > 1.0) continue;
      const score = dot - d * 0.1;
      if (score > bestScore) {
        bestScore = score;
        best = it;
      }
    }
    const promptEl = $('prompt');
    const ring = $('hold');
    const pressed = this.input.consume('use');
    if (best) {
      const text = typeof best.prompt === 'function' ? best.prompt() : best.prompt;
      promptEl.innerHTML = `<b>${this.isTouch ? 'USAR' : 'E'}</b> ${text}`;
      promptEl.classList.add('on');
      if (best.hold) {
        if (this.input.useHeld) {
          this.holdT += dt;
          if (best.onHold) best.onHold(dt, this.holdT / best.hold);
          if (this.holdT >= best.hold) {
            this.holdT = 0;
            best.use();
          }
        } else this.holdT = Math.max(0, this.holdT - dt * 2);
        ring.style.setProperty('--p', `${(this.holdT / best.hold) * 100}%`);
        ring.classList.toggle('on', this.holdT > 0);
      } else if (pressed) {
        this.vm.reach();
        best.use();
      }
    } else {
      promptEl.classList.remove('on');
      ring.classList.remove('on');
      this.holdT = 0;
      if (pressed) this.vm.reach();
    }
    this.focused = best;
  }

  updateHud() {
    const P = this.player;
    $('stamina').style.width = `${P.stamina * 100}%`;
    $('stamina-wrap').classList.toggle('exhausted', P.exhausted);
    $('stamina-wrap').classList.toggle('boost', P.boost > 0);
    $('battery').style.width = `${P.battery * 100}%`;
    $('battery-wrap').classList.toggle('low', P.battery < 0.2);
    $('crouch-ico').classList.toggle('on', P.crouching);
    document.body.style.setProperty('--fear', this.fear.toFixed(3));
  }

  render() {
    const r = this.renderer;
    r.clear();
    r.render(this.scene, this.camera);
    if (this.state === 'playing' || this.state === 'transition' || this.state === 'paused') {
      r.clearDepth();
      r.render(this.vm.scene, this.vmCamera);
    }
  }
}

let halo = null;
function haloTexture() {
  if (halo) return halo;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,0.9)');
  gr.addColorStop(0.3, 'rgba(255,255,255,0.25)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  halo = new THREE.CanvasTexture(c);
  return halo;
}

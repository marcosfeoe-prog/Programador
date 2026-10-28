// Supercélula — simulador de tornados 3D.
// Orquestra renderização, simulação atmosférica, física, danos, jogador, HUD e áudio.
import * as THREE from 'three';
import { QUALITY_PRESETS, WORLD, loadSettings, FUJITA } from './config.js';
import { clamp, lerp, smoothstep } from './util/math.js';
import { generateTextures } from './render/textures.js';
import { generateNoise3D } from './render/noise3d.js';
import { Sky, sunColorFromElevation } from './render/sky.js';
import { Volumetrics } from './render/volumetrics.js';
import { PostProcessing } from './render/post.js';
import { Rain, DebrisSpecks, PowerFlashes, Lightning } from './render/effects.js';
import { Terrain, distToRoad } from './world/terrain.js';
import { PartPools } from './world/parts.js';
import { Town, TOWN_HALF } from './world/town.js';
import { Forest } from './world/forest.js';
import { Grass } from './world/grass.js';
import { TimeOfDay } from './sim/time.js';
import { StormSystem } from './sim/storm.js';
import { SHAPES, COLORS } from './sim/tornado.js';
import { Physics } from './sim/physics.js';
import { DamageSystem } from './sim/damage.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { HUD } from './ui/hud.js';
import { Radar } from './ui/radar.js';
import { Menu } from './ui/menu.js';
import { AudioEngine } from './audio.js';

const settings = loadSettings();
const Q = QUALITY_PRESETS[settings.quality];
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _c = new THREE.Color();
const yieldFrame = () => new Promise((r) => setTimeout(r, 0));

function showError(msg) {
  const e = document.getElementById('error');
  e.textContent = msg;
  e.classList.remove('hidden');
}

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.elapsed = 0;
    this.paused = true;
    this.started = false;
    this.autoStorms = true;
    this.exposure = 1.2;
    this.frames = 0;
    this.fpsT = 0;
    this.fps = 0;
    this.envLight = 0.5;
    this.stormDark = 0;
    this.wet = 0;
    this.pendingReport = null;
  }

  async init() {
    const menu = (this.menu = new Menu(settings, {
      play: () => this.play(),
      riskChanged: () => this.storm && (this.storm.env = this.storm.makeEnv()),
      volume: (v) => this.audio.setVolume(v),
      fps: (v) => this.hud.showFps(v),
      forceStorm: () => {
        this.storm.force();
        this.hud.feed('Uma nova célula de tempestade começou a se formar.', 'info');
      },
      skipPhase: () => this.storm.skipPhase(),
      shape: (s) => (this.storm.forcedShape = s),
      color: (c) => (this.storm.forcedColor = c),
      duration: (m) => {
        this.storm.durationMin = m;
        // também vale para um tornado que já está no solo
        const t = this.storm.tornado;
        if (m && t && t.stage === 'tornado') t.life = Math.max(t.stageTime + 30, m * 60);
      },
      speed: (v) => (this.time.scale = v),
      auto: (v) => (this.autoStorms = v),
      setHour: (h) => {
        this.time.hours = h;
        this.time.computeDirs();
      },
    }));
    const P = (f, t) => menu.progress(f, t);

    P(0.02, 'Iniciando o renderizador…');
    await yieldFrame();
    try {
      this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    } catch (e) {
      showError('Não foi possível iniciar o WebGL 2. Use um navegador atualizado (Chrome, Edge, Firefox ou Safari).');
      throw e;
    }
    const r = this.renderer;
    this.basePixelRatio = Math.min(window.devicePixelRatio || 1, Q.pixelRatio);
    r.setPixelRatio(this.basePixelRatio);
    this.perfLevel = 1;
    this.renderCount = 0;
    r.shadowMap.enabled = Q.shadows;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.shadowMap.autoUpdate = false;
    r.toneMapping = THREE.NoToneMapping;
    r.autoClear = true;

    this.scene = new THREE.Scene();
    this.overlay = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(settings.mobile ? 72 : 68, 1, 0.3, 16000);

    // Luzes
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = Q.shadows;
    this.sun.shadow.mapSize.set(Q.shadowMapSize, Q.shadowMapSize);
    const sc = this.sun.shadow.camera;
    const ext = Q.shadowMapSize >= 2048 ? 140 : 100;
    sc.left = -ext;
    sc.right = ext;
    sc.top = ext;
    sc.bottom = -ext;
    sc.near = 1;
    sc.far = 1200;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.5;
    this.scene.add(this.sun, this.sun.target);
    this.hemi = new THREE.HemisphereLight(0x8fa8c8, 0x3a3428, 1);
    this.scene.add(this.hemi);
    this.flashLight = new THREE.DirectionalLight(0xbfd0ff, 0);
    this.scene.add(this.flashLight, this.flashLight.target);
    // Clarão elétrico de transformadores/fios rompidos ilumina os arredores
    this.powerLight = new THREE.PointLight(0x7fe0ff, 0, 1400, 1.2);
    this.scene.add(this.powerLight);

    P(0.05, 'Gerando texturas procedurais…');
    this.T = await generateTextures(r, Q.texSize, (f, n) => P(0.05 + f * 0.35, `Gerando texturas: ${n}`));
    P(0.42, 'Gerando ruído 3D das nuvens…');
    await yieldFrame();
    this.noise3D = generateNoise3D(r, Q.volScale >= 0.5 ? 96 : 64);

    P(0.48, 'Modelando o terreno e as montanhas…');
    await yieldFrame();
    this.terrain = new Terrain(Q);
    this.terrain.buildWorldMap();
    this.terrain.buildScourMap();

    P(0.6, 'Construindo a cidade…');
    await yieldFrame();
    this.pools = new PartPools(this.scene, this.T, Q);
    this.town = new Town(this.scene, this.terrain, this.pools, Q);
    this.pools.flush();
    this.terrain.buildMesh(this.scene, this.T, this.town.mapTexture, TOWN_HALF);

    P(0.72, 'Plantando a floresta…');
    await yieldFrame();
    this.forest = new Forest(this.scene, this.terrain, this.T, Q, this.town.yardTrees);
    this.grass = new Grass(this.scene, this.terrain, this.town.mapTexture, TOWN_HALF, Q.grass);

    P(0.82, 'Preparando a atmosfera…');
    await yieldFrame();
    this.sky = new Sky(this.scene);
    this.vol = new Volumetrics(r, this.noise3D, Q);
    this.post = new PostProcessing(r, Q);
    this.post.shareFog(this.vol.uniforms);
    this.shared = {
      tDepth: { value: this.post.depthTexture },
      uRes: { value: new THREE.Vector2(1, 1) },
      uNear: { value: this.camera.near },
      uFar: { value: this.camera.far },
      uFog: this.post.uniforms.uFog,
    };
    this.rain = new Rain(this.overlay, Q.rain, this.shared);
    this.specks = new DebrisSpecks(this.overlay, Q.specks, this.shared);
    this.pflash = new PowerFlashes(this.overlay, this.shared);
    this.lightning = new Lightning(this.scene);

    this.physics = new Physics(this.terrain, Q);
    this.physics.windFn = (x, y, z, out) => this.windAt(x, y, z, out);
    this.time = new TimeOfDay(10.5);
    this.storm = new StormSystem(this.terrain, settings);
    this.damage = new DamageSystem({ town: this.town, forest: this.forest, pools: this.pools, physics: this.physics, terrain: this.terrain });
    this.player = new Player(this.camera, { terrain: this.terrain, town: this.town, physics: this.physics, distToRoad });
    this.input = new Input(this.canvas, settings);
    this.hud = new HUD();
    this.hud.showFps(settings.showFps);
    this.hud.onReportClose = () => {
      if (!this.menu.open && !settings.mobile) this.input.lock();
    };
    this.radar = new Radar(document.getElementById('radar'));
    this.audio = new AudioEngine();
    this.audio.volume = settings.volume;

    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.addEventListener('orientationchange', () => setTimeout(() => this.resize(), 300));

    P(0.92, 'Compilando shaders…');
    await yieldFrame();
    this.updateWorld(0.016);
    this.player.update(0.016, this.input, this.playerCtx());
    this.renderFrame();
    P(1, 'Pronto!');
    menu.ready();
    this.lastT = performance.now();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  play() {
    this.audio.init();
    this.menu.hide();
    this.hud.show(this.hud.visible);
    this.paused = false;
    this.input.enabled = true;
    if (!this.started) {
      this.started = true;
      this.hud.feed('Bem-vindo, caçador de tempestades! Fique de olho no céu a sudoeste.', 'info', 9);
      this.hud.feed(settings.mobile ? 'Use o botão "Veículo" perto da picape para dirigir.' : '[E] perto da picape para dirigir · [Esc] menu', 'info', 9);
    }
    if (settings.mobile) {
      const de = document.documentElement;
      if (de.requestFullscreen && !document.fullscreenElement) de.requestFullscreen().catch(() => {});
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    } else this.input.lock();
  }

  pause() {
    this.paused = true;
    this.input.enabled = false;
    this.input.unlock();
    this.menu.show(true);
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    const pr = this.renderer.getPixelRatio();
    const W = Math.floor(w * pr);
    const H = Math.floor(h * pr);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.post.setSize(W, H);
    this.vol.setSize(W, H);
    this.shared.uRes.value.set(W, H);
    document.getElementById('rotate').classList.toggle('hidden', !(settings.mobile && h > w));
  }

  // Vento total (ambiente + tornado) num ponto.
  windAt(x, y, z, out) {
    this.storm.ambientWindAt(x, z, out, this.elapsed);
    const gy = this.terrain.heightAt(x, z);
    const hz = Math.max(y - gy, 0.5);
    out.multiplyScalar(clamp(Math.log(hz / 0.05) / Math.log(10 / 0.05), 0.35, 1.4));
    const t = this.storm.tornado;
    if (t && t.stage === 'tornado') {
      t.wind(x, y, z, _v2);
      out.add(_v2);
    }
    return out;
  }

  playerCtx() {
    return {
      wind: (x, y, z, out) => this.windAt(x, y, z, out),
      tornado: this.storm.tornado,
      storm: this.storm,
      activateCar: (car, t) => this.damage.activateCar(car, t),
      onHurt: (amt, why) => {
        if (amt > 8) this.hud.feed(`Você foi ferido (${why}).`, 'alert', 4);
      },
      onDeath: () => {
        this.hud.feed('Você não sobreviveu ao tornado.', 'alert', 6);
      },
    };
  }

  frame() {
    const now = performance.now();
    let dt = (now - this.lastT) / 1000;
    this.lastT = now;
    this.adaptPerformance(dt);
    dt = Math.min(dt, 0.05);
    this.frames++;
    this.fpsT += dt;
    if (this.fpsT > 0.5) {
      this.fps = Math.round(this.frames / this.fpsT);
      this.frames = 0;
      this.fpsT = 0;
    }
    if (!this.paused) this.update(dt);
    else if (this.input.pressed('menu') && this.started) this.play();
    this.renderFrame();
    this.input.endFrame();
  }

  // Resolução dinâmica: mira 60 FPS reduzindo primeiro o custo das nuvens
  // volumétricas e só depois a resolução da tela; recupera a qualidade quando sobra tempo.
  adaptPerformance(dt) {
    if (this.paused || dt <= 0 || dt > 0.5) return;
    const ms = dt * 1000;
    this.frameMs = this.frameMs ? this.frameMs * 0.92 + ms * 0.08 : ms;
    this.perfT = (this.perfT || 0) + dt;
    if (this.perfT < 1) return;
    this.perfT = 0;
    let lvl = this.perfLevel;
    if (this.frameMs > 18.5) {
      lvl -= this.frameMs > 28 ? 0.2 : 0.1;
      this.goodSecs = 0;
    } else if (this.frameMs < 14.5) {
      this.goodSecs = (this.goodSecs || 0) + 1;
      if (this.goodSecs >= 3) lvl += 0.05;
    } else this.goodSecs = 0;
    lvl = clamp(lvl, 0, 1);
    if (lvl !== this.perfLevel) this.applyPerfLevel(lvl);
  }

  applyPerfLevel(lvl) {
    this.perfLevel = lvl;
    // 1,0 → 0,4: nuvens mais baratas
    const k = clamp((lvl - 0.4) / 0.6, 0, 1);
    this.vol.setScale(Math.max(0.16, Q.volScale * lerp(0.6, 1, k)));
    this.vol.uniforms.uSteps.value = Math.round(Q.volSteps * lerp(0.65, 1, k));
    this.vol.uniforms.uLightSteps.value = Math.max(2, Math.round(Q.lightSteps * lerp(0.6, 1, k)));
    // abaixo de 0,4: reduz a resolução de renderização
    const pr = this.basePixelRatio * lerp(0.62, 1, clamp(lvl / 0.4, 0, 1));
    const prq = Math.round(pr * 20) / 20;
    if (Math.abs(prq - this.renderer.getPixelRatio()) > 0.01) {
      this.renderer.setPixelRatio(prq);
      this.resize();
    }
  }

  handleInput() {
    const I = this.input;
    if (I.pressed('menu') || I.pressed('unlock')) {
      if (this.hud.reportOpen) this.hud.hideReport();
      else {
        this.pause();
        return;
      }
    }
    if (I.pressed('radar')) this.radar.toggleMode();
    if (I.pressed('radarSize')) this.hud.cycleRadarSize();
    if (I.pressed('info')) this.hud.toggleInfo();
    if (I.pressed('hud')) this.hud.toggle();
    if (I.pressed('forceStorm')) {
      this.storm.force();
      this.hud.feed('Uma nova célula de tempestade começou a se formar.', 'info');
    }
    if (I.pressed('skip')) this.storm.skipPhase();
    if (I.pressed('fullscreen')) {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => {});
      else document.exitFullscreen?.();
    }
    const speeds = [1, 2, 5, 10];
    const faster = I.pressed('faster');
    const slower = I.pressed('slower');
    if (faster || slower) {
      let i = speeds.indexOf(this.time.scale);
      if (i < 0) i = 0;
      i = clamp(i + (faster ? 1 : -1), 0, speeds.length - 1);
      this.time.scale = speeds[i];
      this.menu.setSpeed(this.time.scale);
      this.hud.feed(`Velocidade do tempo: ${this.time.scale}×`, 'info', 3);
    }
  }

  update(dt) {
    this.handleInput();
    if (this.paused) return;
    this.elapsed += dt;
    const st = this.storm;
    // Durante funil/tornado o tempo volta ao normal
    if ((st.phase === 'funnel' || st.phase === 'tornado') && this.time.scale !== 1) {
      this.time.scale = 1;
      this.menu.setSpeed(1);
      this.hud.feed('Tempo normal (tornado em andamento).', 'info', 4);
    }
    this.time.update(dt);
    const sdt = st.phase === 'tornado' || st.phase === 'funnel' ? dt : dt * this.time.scale;
    st.update(sdt, { time: this.elapsed, hours: this.time.hours, autoStorms: this.autoStorms, surfaceDebris: this.damage.surface.debris });
    this.handleStormEvents();
    this.damage.update(dt, st.tornado, this.elapsed);
    this.handleDamageEvents();
    this.physics.focus = this.camera.position;
    this.physics.step(dt);
    for (const im of this.physics.impacts) {
      const d = this.camera.position.distanceTo(_v.set(im.x, im.y, im.z));
      this.audio.impact(d, Math.min(2, Math.sqrt(im.mass) * im.speed * 0.004));
    }
    this.physics.impacts.length = 0;
    this.player.update(dt, this.input, this.playerCtx());
    this.pools.flush();
    this.updateWorld(dt);
    this.updateAudio(dt);
    if (this.pendingReport) {
      this.pendingReport.t -= dt;
      if (this.pendingReport.t <= 0) {
        this.hud.showReport(this.pendingReport.tornado);
        this.pendingReport = null;
        this.input.unlock();
      }
    }
  }

  handleStormEvents() {
    const st = this.storm;
    for (const e of st.events) {
      switch (e.type) {
        case 'phase': {
          const names = {
            cumulus: 'Cúmulos estão se desenvolvendo a sudoeste.',
            congestus: 'As nuvens crescem em torres (cúmulos congestus).',
            cumulonimbus: 'Um cumulonimbus se formou — trovoadas a caminho.',
            supercell: 'A corrente ascendente começou a girar: SUPERCÉLULA!',
            wallcloud: 'Uma nuvem parede baixa e girando apareceu sob a base.',
            dissipating: 'A tempestade está enfraquecendo.',
            clear: 'O céu está abrindo.',
          };
          if (names[e.phase]) this.hud.feed(names[e.phase], e.phase === 'supercell' || e.phase === 'wallcloud' ? 'alert' : 'info');
          break;
        }
        case 'warning':
          this.hud.setAlert(e.level);
          if (e.level === 'severe') this.hud.feed('Alerta de tempestade severa emitido.', 'alert');
          if (e.level === 'tornado') this.hud.feed('ALERTA DE TORNADO — sirenes acionadas na cidade!', 'alert');
          break;
        case 'funnel':
          this.hud.feed('Nuvem funil descendo da nuvem parede!', 'alert');
          break;
        case 'funnel-retract':
          this.hud.feed('A nuvem funil recuou sem tocar o solo.', 'info');
          break;
        case 'touchdown': {
          const t = e.tornado;
          this.hud.feed(`TORNADO! O funil tocou o solo — formato: ${SHAPES[t.shape].name}.`, 'alert', 9);
          this.hud.feed('A classificação (F0–F5) será definida pelos danos.', 'info', 9);
          break;
        }
        case 'tornado-end': {
          const t = e.tornado;
          this.hud.feed(`O tornado se dissipou (${t.rating >= 0 ? FUJITA[t.rating].name : 'sem classificação'}). Levantamento de danos em andamento…`, 'info', 8);
          this.pendingReport = { t: 5, tornado: t };
          break;
        }
        case 'lightning': {
          const gy = this.terrain.heightAt(e.x, e.z);
          this.lightning.strike(e.x, e.z, e.cg, gy, WORLD.cloudBase);
          const d = Math.hypot(e.x - this.camera.position.x, e.z - this.camera.position.z);
          this.audio.thunder(d, e.cg && d < 1600);
          break;
        }
      }
    }
    st.events.length = 0;
  }

  handleDamageEvents() {
    const D = this.damage;
    for (const e of D.events) {
      if (e.type === 'rating') {
        const f = FUJITA[e.f];
        this.hud.feed(`Classificação preliminar: ${f.name} — ${e.entry.di}: ${e.entry.d}`, 'rating', 8);
      } else if (e.type === 'damage') {
        this.hud.feed(`${e.entry.di}: ${e.entry.d} (${FUJITA[e.entry.f].name})`, 'info', 5);
      } else if (e.type === 'powerflash') {
        this.audio.powerFlash(this.camera.position.distanceTo(e.pos));
      } else if (e.type === 'blackout') {
        this.hud.feed('Queda de energia na cidade!', 'alert');
      }
    }
    D.events.length = 0;
  }

  // ------------------------------------------------------------ iluminação e ambiente
  updateWorld(dt) {
    const cam = this.camera;
    const st = this.storm;
    const sun = this.time.sun;
    const moon = this.time.moon;
    const t = st.tornado;
    const cover = st.coverAt(cam.position.x, cam.position.z);
    const ambCover = Math.max(0, st.coverage - 0.25) * 0.5;
    this.stormDark = lerp(this.stormDark, cover, 1 - Math.exp(-dt * 0.5));
    const rainHere = st.rainAt(cam.position.x, cam.position.z);
    this.rainHere = rainHere;
    this.wet = clamp(this.wet + (rainHere > 0.2 ? dt * 0.02 : -dt * 0.004), 0, 1);

    // Luz do lightning
    this.lightning.update(dt);
    const flash = this.lightning.intensity || 0;

    // Sol / lua
    const sunUp = smoothstep(-0.04, 0.1, sun.y);
    const sunCol = sunColorFromElevation(Math.max(sun.y, 0), _sunCol);
    const sunI = 3.3 * sunUp;
    const moonI = 0.28 * smoothstep(-0.05, 0.25, moon.y) * (1 - sunUp);
    const useSun = sunI >= moonI;
    const lightDir = useSun ? sun : moon;
    const shade = (1 - 0.93 * this.stormDark) * (1 - ambCover);
    const lightI = (useSun ? sunI : moonI) * shade;
    const lightCol = useSun ? sunCol : _moonCol;
    this.sun.color.copy(lightCol);
    this.sun.intensity = lightI;
    this.sun.target.position.set(cam.position.x, 0, cam.position.z);
    this.sun.position.copy(this.sun.target.position).addScaledVector(lightDir, 500);
    this.sun.castShadow = Q.shadows && lightI > 0.05;

    // Céu e ambiente
    const env = { overcast: clamp(this.stormDark * 0.85 + ambCover * 0.6, 0, 1), flash, humidity: clamp(st.env.stp / 5, 0, 1), townPower: this.town.power, stormDark: this.stormDark };
    const sk = this.sky.update(cam, sun, moon, env, this.elapsed);
    const hemiK = (0.25 + 1.45 * sk.day) * (1 - 0.42 * this.stormDark) + 0.06;
    this.hemi.color.copy(this.sky.zenith).lerp(this.sky.horizon, 0.4);
    this.hemi.groundColor.copy(this.sky.ground);
    this.hemi.intensity = hemiK * 1.6;
    this.flashLight.intensity = flash * 4;
    this.flashLight.position.copy(this.lightning.flashPos);
    this.flashLight.target.position.copy(cam.position);

    // Exposição (adaptação do olho)
    const lum = lightI * Math.max(0.25, lightDir.y) * 0.09 + this.hemi.intensity * (this.hemi.color.r + this.hemi.color.g + this.hemi.color.b) * 0.03 + 0.0012;
    const targetExp = clamp(0.085 / lum, 0.55, 14);
    this.exposure = lerp(this.exposure, targetExp, 1 - Math.exp(-dt * 0.6));
    this.envLight = clamp(lum * this.exposure * 6, 0.05, 1.5);

    // Neblina
    const pu = this.post.uniforms;
    const fogD = 0.000045 + env.humidity * 0.00003 + rainHere * 0.00055 + this.stormDark * 0.00007;
    pu.uFog.value.set(fogD, 1 / 850);
    pu.uFogColor.value.copy(this.sky.fogColor).multiplyScalar(1 - this.stormDark * 0.35);
    pu.uFogSunColor.value.copy(this.sky.fogSunColor).multiplyScalar(1 - this.stormDark);
    pu.uFogSunDir.value.copy(useSun ? sun : moon);
    pu.uExposure.value = this.exposure;
    pu.uSaturation.value = lerp(1.05, 0.72, this.stormDark);
    pu.uContrast.value = lerp(1.04, 1.12, this.stormDark);
    pu.uTint.value.setRGB(1, 1, 1).lerp(_c.setRGB(0.94, 0.98, 1.04), this.stormDark);
    pu.uDamage.value = this.player.damageFlash;
    pu.uGrain.value = settings.mobile ? 0 : 0.018;
    pu.uLetterbox.value = this.player.mode === 'cine' ? 0.085 : 0;

    // Nuvens volumétricas
    const vu = this.vol.uniforms;
    vu.uLightDir.value.copy(lightDir);
    vu.uLightColor.value.copy(lightCol).multiplyScalar((useSun ? sunI : moonI) * 3.4);
    vu.uAmbTop.value.copy(this.hemi.color).multiplyScalar(this.hemi.intensity * 0.55);
    vu.uAmbBot.value.copy(this.hemi.groundColor).multiplyScalar(this.hemi.intensity * 0.45);
    if (!this.time.isDay && this.town.power) vu.uAmbBot.value.add(_c.setRGB(0.006, 0.0036, 0.0016));
    vu.uFlash.value.set(this.lightning.flashPos.x, this.lightning.flashPos.y, this.lightning.flashPos.z, flash);
    vu.uCloudBase.value = WORLD.cloudBase;
    vu.uCoverage.value = st.coverage;
    vu.uWindOff.value.copy(st.windOff);
    vu.uStormAlpha.value = st.alpha;
    vu.uStormPos.value.copy(st.pos);
    vu.uUpdraft.value.copy(st.updraft);
    vu.uStormDir.value.copy(st.dir);
    vu.uGrowth.value = st.growth;
    vu.uStormTop.value = 10500;
    vu.uTowerR.value = st.towerR;
    vu.uBaseR.value = st.baseR;
    vu.uAnvil.value = st.anvil;
    vu.uAnvilLen.value = 17000;
    vu.uMesoAngle.value = st.mesoAngle;
    vu.uMeso.value = st.meso;
    const wallR = t && t.stage === 'tornado' ? Math.max(820, (t.visual.rt + t.visual.flare) * 2.2) : 820;
    vu.uWall.value.set(st.wallPos.x, st.wallPos.y, wallR, st.wallDrop * 230);
    vu.uRain.value.set(st.rainPos.x, st.rainPos.y, 1900, st.rain * st.alpha);
    vu.uHook.value.set(st.wallPos.x, st.wallPos.y, 900, st.hookAngle);
    if (t && (t.stage === 'funnel' || t.stage === 'tornado')) {
      const v = t.visual;
      vu.uTorBase.value.copy(t.pos);
      for (let i = 0; i < 6; i++) vu.uTorAxis.value[i].copy(t.axis[i]);
      vu.uTorTop.value = t.topY;
      vu.uTorR.value.set(v.rb, v.rt, v.expo, v.flare);
      vu.uTorP.value.set(v.dens, v.funnelBottom, t.spin, v.debris);
      vu.uTorM.value.set(t.subCount, v.orbit, v.subR, v.multiW);
      vu.uTorD.value.set(v.debrisR, v.debrisH, v.ropeBreak, 1);
      vu.uTorX.value.x = t.stage === 'funnel' ? 1 : 0.15;
      vu.uTorX.value.y = t.stage === 'tornado' ? COLORS[t.color].idx : 0;
      vu.uDebrisCol.value.copy(this.damage.surface.color);
      const big = t.shape === 'wedge' || t.shape === 'multi';
      const alb = { gray: big ? (t.shape === 'wedge' ? 0.42 : 0.55) : 1.05, white: 1.75, dust: 0.9, dark: 0.24, rain: big ? 0.38 : 0.6 }[t.color] ?? 1;
      vu.uTorAlb.value.setScalar(alb);
      vu.uTorX.value.w = t.color === 'dust' ? 0.05 : t.color === 'white' ? 0.3 : big || t.color === 'dark' ? 0.75 : 0.6;
    } else vu.uTorD.value.w = 0;

    // Vento local (para árvores, grama, chuva)
    this.windAt(cam.position.x, cam.position.y, cam.position.z, _v);
    this.localWind = this.player.mode === 'walk' || this.player.mode === 'drive' ? this.player.localWind : _v.length();
    const ws = clamp(Math.hypot(_v.x, _v.z) / 25, 0.05, 1.6);
    const wl = Math.hypot(_v.x, _v.z) || 1;
    const windU = _v2.set(_v.x / wl, _v.z / wl, ws);
    this.forest.update(dt, cam.position, this.elapsed, windU);
    this.grass.update(this.elapsed, windU, lightDir, _c.copy(lightCol).multiplyScalar(lightI), _c2.copy(this.hemi.color).multiplyScalar(this.hemi.intensity), _c3.copy(this.hemi.groundColor).multiplyScalar(this.hemi.intensity), flash * 3);
    this.rain.update(this.elapsed, rainHere, _v, this.envLight);
    this.specks.update(this.elapsed, t, this.envLight);
    this.pflash.update(this.damage.flashes);
    const pf = this.damage.flashes[0];
    if (pf) {
      const flick = 0.5 + 0.5 * Math.sin(pf.t * 60) * Math.sin(pf.t * 23);
      this.powerLight.position.copy(pf.pos);
      this.powerLight.color.copy(pf.color);
      this.powerLight.intensity = flick * (1 - pf.t / pf.life) * pf.strength * 9000;
    } else this.powerLight.intensity = 0;
    this.terrain.material.userData.uniforms.uWet.value = this.wet;
    this.terrain.flushScour();

    // Luzes da cidade (janelas e postes) à noite ou sob a tempestade
    const night = 1 - sk.day;
    this.pools.glowUniform.value = Math.max(night, this.stormDark * 0.5) * this.town.power * 1.6;

    // HUD e radar
    this.pressureDrop = t ? t.pressureDrop(this.player.pos.x, this.player.pos.z) : 0;
    this.hud.update(dt, {
      time: this.time,
      storm: st,
      player: this.player,
      tornado: t,
      env: st.env,
      localWind: this.localWind || 0,
      pressureDrop: this.pressureDrop + this.stormDark * 4,
      rain: rainHere,
      mobile: settings.mobile,
      radarMode: this.radar.mode,
      autoStorms: this.autoStorms,
      fps: settings.showFps ? this.fps : undefined,
      debris: this.physics.activeCount(),
    });
    if (this.hud.visible) {
      const e = _eul.setFromQuaternion(cam.quaternion, 'YXZ');
      this.radar.update(dt, st, t, this.player.pos, this.elapsed, e.y);
    }
  }

  updateAudio(dt) {
    const st = this.storm;
    const t = st.tornado;
    const cam = this.camera.position;
    let loud = 0;
    let near = 0;
    if (t && t.stage === 'tornado') {
      const d = Math.hypot(cam.x - t.pos.x, cam.z - t.pos.z);
      const k = (t.vmax / 90) * t.groundContact;
      loud = k / (1 + Math.pow(d / (t.rCore * 3 + 350), 1.4));
      near = clamp(1 - d / (t.rCore * 4 + 200), 0, 1) * k;
    } else if (t && t.stage === 'funnel') {
      const d = Math.hypot(cam.x - t.pos.x, cam.z - t.pos.z);
      loud = (0.12 * t.funnel) / (1 + d / 800);
    }
    // Sirene: posição na cidade
    const sp = this.town.sirenPos;
    const sd = Math.hypot(cam.x - sp.x, cam.z - sp.z);
    const camDir = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const toS = new THREE.Vector3(sp.x - cam.x, 0, sp.z - cam.z).normalize();
    const pan = clamp(camDir.x * toS.z - camDir.z * toS.x, -1, 1) * -1;
    this.audio.update(dt, {
      wind: this.localWind || 0,
      outdoor: 1,
      rain: this.rainHere,
      tornadoLoud: loud,
      tornadoNear: near,
      siren: st.warning === 'tornado' ? 1 / (1 + Math.pow(sd / 900, 2)) : 0,
      sirenPan: pan,
      crickets: !this.time.isDay && this.rainHere < 0.05 && (this.localWind || 0) < 8 ? 1 : 0,
    });
  }

  renderFrame() {
    const n = this.renderCount++;
    // nuvens volumétricas a meia taxa (o quadro intermediário só reprojeta)
    this.post.volFull = this.perfLevel > 0.95 && !settings.mobile ? true : n % 2 === 0;
    // mapa de sombras atualizado em quadros alternados quando falta desempenho
    if (Q.shadows) this.renderer.shadowMap.needsUpdate = this.perfLevel > 0.8 || n % 2 === 0;
    this.post.render(this.scene, this.camera, this.vol, this.overlay, this.elapsed);
  }

  // Depuração: avança a simulação manualmente (útil para testes automatizados).
  debugStep(n = 1, dt = 1 / 30, render = true) {
    this.renderer.setAnimationLoop(null);
    for (let i = 0; i < n; i++) {
      this.update(dt);
      this.input.endFrame();
      if (render && i >= n - 8) this.renderFrame();
    }
  }
}

const _c2 = new THREE.Color();
const _sunCol = new THREE.Color();
const _moonCol = new THREE.Color(0.55, 0.65, 0.95);
const _eul = new THREE.Euler();
const _c3 = new THREE.Color();

const game = new Game();
window.__game = game;
window.__THREE = THREE;
game.init().catch((e) => {
  console.error(e);
  showError('Erro ao iniciar o jogo: ' + (e && e.message ? e.message : e));
});


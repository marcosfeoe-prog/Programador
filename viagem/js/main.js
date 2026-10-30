// Rota Serena — jogo relaxante de viagem de carro em mundo aberto.
// Orquestra o mundo (relevo, estradas, cidades, vegetação, céu, água, clima),
// o carro do jogador (modelo + física), câmeras, trânsito, GPS, áudio e menus.
import * as THREE from 'three';
import { QUALITY, loadSettings, saveSettings, loadProgress, saveProgress, isMobile } from './config.js';
import { WorkerPool } from './world/pool.js';
import { WorldGen } from './world/gen.js';
import { Terrain } from './world/terrain.js';
import { Sky } from './world/sky.js';
import { Water } from './world/water.js';
import { Roads } from './world/roads.js';
import { Cities } from './world/cities.js';
import { Flora } from './world/flora.js';
import { Weather, WEATHER_ICONS } from './world/weather.js';
import { setAnisotropy, asphaltTex } from './world/textures.js';
import { WORLD, COUNTRIES, CITIES, LAKES, GREET } from './world/data.js';
import { SPECIES } from './world/gen.js';
import { CARS } from './cars/specs.js';
import { CarModel } from './cars/model.js';
import { VehiclePhysics } from './cars/physics.js';
import { CameraRig, CAM_NAMES } from './camera.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { STATIONS } from './music.js';
import { Traffic } from './traffic.js';
import { Router, Gps, Discovery, findViewpoints, buildViewpointMeshes, autopilot, roadAt } from './travel.js';
import { HUD, buildBaseMap } from './ui/hud.js';
import { Menus } from './ui/menus.js';
import { clamp, lerp, yieldFrame, fmtKm, fmtTime, smoothstep } from './util.js';

const SEED = 20261030;
const params = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);

const TIPS = [
  'Dica: aperte O para o piloto automático levar você até o destino.',
  'Dica: a câmera cinematográfica (C) deixa a viagem com cara de documentário.',
  'Dica: pare nos mirantes 📷 para registrar a paisagem no passaporte.',
  'Dica: no Japão as cerejeiras soltam pétalas pela estrada.',
  'Dica: R troca a estação de rádio. A Rádio Bossa combina com o litoral.',
  'Dica: descanse pelo menu para ver o pôr do sol ou a noite estrelada.',
  'Dica: no cockpit, arraste o mouse para olhar o interior do carro.',
];

// raio do tronco por espécie (para colisão), proporcional à escala
const TRUNK = { spruce: 0.32, pine: 0.35, birch: 0.2, beech: 0.36, cherry: 0.3, cedar: 0.36, maple: 0.3, saguaro: 0.4, shrub: 0, agave: 0, cypress: 0.3, stonepine: 0.4, olive: 0.32, tropical: 0.45, palm: 0.26, banana: 0.2, rock: 0.9, bush: 0 };
const TRUNK_ARR = SPECIES.map((s) => TRUNK[s] || 0);

function showError(msg) {
  const e = $('error');
  e.textContent = msg;
  e.classList.remove('hidden');
}

class Game {
  constructor() {
    this.settings = loadSettings();
    if (params.has('quality') && QUALITY[params.get('quality')]) this.settings.quality = params.get('quality');
    this.Q = { ...QUALITY[this.settings.quality] };
    if (isMobile) document.body.classList.add('mobile');
    this.canvas = $('game');
    this.state = 'loading';
    this.hours = 17.1;
    this.time = 0;
    this.lightsOn = false;
    this.autoLights = true;
    this.autopilotOn = false;
    this.photoFov = 45;
    this.fpsT = 0;
    this.fpsN = 0;
    this.pr = 1;
    this.slowT = 0;
    this.saveT = 0;
    this.hudT = 0;
    this.lastCountry = -1;
    this.countryT = 0;
    this.pendingCountry = -1;
    this.lastCity = null;
    this.rerouteT = 0;
    this.tripStart = null;
  }

  progressText(t, p) {
    $('ld-text').textContent = t;
    if (p !== undefined) $('ld-bar').style.width = `${Math.round(p * 100)}%`;
  }

  async init() {
    $('ld-tip').textContent = TIPS[Math.floor(Math.random() * TIPS.length)];
    const Q = this.Q;
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: Q.antialias, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    this.renderer = r;
    this.basePR = Math.min(window.devicePixelRatio || 1, 2) * Q.pixelRatio;
    this.pr = this.basePR;
    r.setPixelRatio(this.pr);
    r.setSize(window.innerWidth, window.innerHeight, false);
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1;
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.shadowMap.enabled = Q.shadows > 0;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    setAnisotropy(Math.min(8, r.capabilities.getMaxAnisotropy()));
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.12, Q.far);
    window.addEventListener('resize', () => this.resize());

    // ---- mundo
    this.progressText('Desenhando o continente…', 0.02);
    this.gen = new WorldGen(SEED);
    this.pool = new WorkerPool(Q.workers, SEED);
    await this.pool.broadcast({ type: 'init', seed: SEED });
    this.progressText('Traçando as estradas entre os países…', 0.05);
    const res = await this.pool.run({ type: 'roads' }, (p) => this.progressText('Traçando as estradas entre os países…', 0.05 + p * 0.3), 0);
    this.roads = res.roads;
    for (const rd of this.roads) {
      let x0 = 1e9;
      let z0 = 1e9;
      let x1 = -1e9;
      let z1 = -1e9;
      for (let k = 0; k < rd.hs.length; k++) {
        x0 = Math.min(x0, rd.pts[k * 2]);
        x1 = Math.max(x1, rd.pts[k * 2]);
        z0 = Math.min(z0, rd.pts[k * 2 + 1]);
        z1 = Math.max(z1, rd.pts[k * 2 + 1]);
      }
      rd.bbox = [x0, z0, x1, z1];
    }
    this.gen.setRoads(this.roads);
    this.pool.lastRoads = this.roads;
    if (Q.workers > 1) await this.pool.broadcast({ type: 'setRoads', roads: this.roads });
    this.progressText('Levantando montanhas e vales…', 0.38);
    this.terrain = new Terrain(this.scene, this.pool, Q);
    await this.terrain.buildFar((p) => this.progressText('Levantando montanhas e vales…', 0.38 + p * 0.22));
    this.sky = new Sky(r, this.scene, Q);
    this.water = new Water(this.scene, this.sky);
    const F = this.terrain.far;
    this.water.build(F.heights, F.x0, F.z0, F.nx, F.nz, F.res);
    await yieldFrame();
    this.progressText('Pavimentando as estradas…', 0.62);
    this.roadMeshes = new Roads(this.scene, this.gen, Q);
    this.roadMeshes.build(this.roads);
    await yieldFrame();
    this.progressText('Construindo as cidades…', 0.68);
    const streetMat = new THREE.MeshStandardMaterial({ map: asphaltTex('white', false), roughness: 0.85 });
    streetMat.polygonOffset = true;
    streetMat.polygonOffsetFactor = -1;
    this.cities = new Cities(this.scene, this.gen, Q);
    this.cities.build(this.roads, streetMat);
    await yieldFrame();
    this.progressText('Procurando os melhores mirantes…', 0.74);
    this.viewpoints = findViewpoints(this.roads, this.gen);
    buildViewpointMeshes(this.scene, this.viewpoints, this.gen, this.roadMeshes);
    this.flora = new Flora(this.scene, this.pool, this.gen, Q);
    this.weather = new Weather(this.scene, Q);
    this.router = new Router(this.roads, this.gen);
    this.gps = new Gps(this.scene);
    this.progressText('Abastecendo os carros…', 0.78);
    this.traffic = new Traffic(this.scene, this.roads, this.gen, Q.shadows ? 16 : 9);
    await this.traffic.init(yieldFrame);
    this.baseMap = buildBaseMap(F, this.gen);
    // luzes noturnas: faróis e postes (quantidade fixa para não recompilar shaders)
    this.headlight = new THREE.SpotLight(0xfff2dc, 0, 160, 0.45, 0.55, 1.2);
    this.headlight.target = new THREE.Object3D();
    this.scene.add(this.headlight, this.headlight.target);
    this.lampLights = [];
    for (let i = 0; i < (Q.shadows ? 4 : 0); i++) {
      const l = new THREE.PointLight(0xffd8a0, 0, 30, 1.6);
      this.scene.add(l);
      this.lampLights.push(l);
    }
    this.lampT = 0;

    // ---- progresso salvo
    const P = loadProgress();
    this.progress = {
      car: 'strale',
      paints: {},
      visited: [],
      dates: {},
      photos: {},
      viewpoints: [],
      countries: [],
      km: 0,
      time: 0,
      discovered: null,
      pos: null,
      hours: 17.1,
      dest: null,
      station: 0,
      ...(P || {}),
    };
    if (!CARS.find((c) => c.id === this.progress.car)) this.progress.car = 'strale';
    this.discovery = new Discovery(this.roads, this.progress.discovered);
    this.hours = this.progress.hours ?? 17.1;
    if (params.has('hour')) this.hours = parseFloat(params.get('hour'));

    // ---- interface e entrada
    this.input = new Input(this.canvas, this.settings);
    this.audio = new AudioEngine(this.settings);
    this.hud = new HUD(this);
    this.menus = new Menus(this);
    this.rig = new CameraRig(this.camera, this.gen);
    this.rig.setMode(['chase', 'far', 'cockpit', 'hood', 'bumper', 'cinema'][this.settings.camera] || 'chase');
    const startAudio = () => {
      this.audio.start();
      if (this.audio.ok && !this.radioStarted) {
        this.radioStarted = true;
        this.audio.radio.setStation(this.progress.station ?? 0);
      }
    };
    window.addEventListener('pointerdown', startAudio);
    window.addEventListener('keydown', startAudio);
    window.addEventListener('gamepadconnected', () => this.hud.toast('🎮 Controle conectado'));

    // ---- carro
    this.progressText('Ligando o motor…', 0.84);
    this.worldPhys = {
      ground: (x, z, out) => this.gen.ground(x, z, out),
      groundH: (x, z) => this.gen.groundH(x, z),
      collide: (phys) => this.collide(phys),
    };
    this.previewId = this.progress.car;
    if (params.has('car')) this.previewId = this.progress.car = params.get('car');
    let sp = this.progress.pos;
    if (params.has('city')) sp = null;
    if (sp && this.gen.groundH(sp.x, sp.z) > 0.5) this.spawnCar(this.progress.car, sp.x, sp.z, sp.yaw);
    else this.placeAtCity(params.has('city') ? CITIES.findIndex((c) => c.id === params.get('city')) : CITIES.findIndex((c) => c.id === 'bergdorf'), this.progress.car);
    if (this.progress.dest !== null && this.progress.dest !== undefined) this.setDestination(this.progress.dest, true);

    // espera o terreno em volta carregar
    this.progressText('Plantando as árvores…', 0.88);
    const pos = this.player.pos;
    this.terrain.update(pos);
    let waited = 0;
    while ((this.terrain.busy || this.pool.load > 0) && waited < 400) {
      this.terrain.update(pos);
      this.flora.update(pos, 0.016);
      await yieldFrame();
      waited++;
      this.progressText('Plantando as árvores…', 0.88 + Math.min(0.11, waited / 600));
    }
    this.flora.update(pos, 0.016);
    // assenta o carro no chão
    for (let i = 0; i < 30; i++) this.player.update(1 / 60, { throttle: 0, brake: 0, steer: 0, handbrake: true });
    this.progressText('Pronto!', 1);
    this.state = 'title';
    this.sky.update(this.hours, 0, this.camera.position, pos);
    this.renderer.compile(this.scene, this.camera);
    $('loading').classList.add('out');
    setTimeout(() => $('loading').classList.add('hidden'), 900);
    $('title').classList.remove('hidden');
    $('touch').classList.add('off');
    if (params.has('play')) this.startDriving();
    this.clock = new THREE.Clock();
    this.renderer.setAnimationLoop(() => this.frame());
    window.GAME = this;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  // ------------------------------------------------------------ carro
  carPaint(id) {
    const s = CARS.find((c) => c.id === id);
    const p = this.progress.paints[id] || {};
    return { paint: p.paint || s.paint, metal: p.metal ?? s.metal, rim: p.rim || null };
  }

  spawnCar(id, x, z, yaw) {
    const spec = CARS.find((c) => c.id === id) || CARS[0];
    if (this.model) {
      this.scene.remove(this.model.root);
      this.model.dispose();
    }
    const pc = this.carPaint(spec.id);
    const sp = pc.rim ? { ...spec, wheel: { ...spec.wheel, rimColor: pc.rim } } : spec;
    this.model = new CarModel(sp, { interior: true, paint: pc.paint, metal: pc.metal, plate: `RS·${String(CARS.indexOf(spec) + 1).padStart(2, '0')}${spec.id.slice(0, 2).toUpperCase()}` });
    this.scene.add(this.model.root);
    this.player = new VehiclePhysics(sp, this.model, this.worldPhys);
    this.player.assist = this.settings.assist;
    this.player.manual = this.settings.manual;
    const h = this.gen.groundH(x, z);
    this.player.reset(x, h, z, yaw);
    this.model.pose(this.player.pos, this.player.quat, this.player.wheels, 0, 0);
    this.progress.car = spec.id;
    this.previewId = spec.id;
    this.audio.setEngineKind(spec.sound.kind);
    this.rig.snap = true;
    if (this.model.interior) this.model.interior.setHeadVisible(this.rig.mode !== 'cockpit');
  }

  // estaciona na saída da praça de uma cidade, apontando para a estrada
  placeAtCity(ci, carId) {
    const c = CITIES[ci];
    const rd = this.roads.find((r) => r.a === ci) || this.roads.find((r) => r.b === ci);
    const fwd = rd.a === ci;
    const s = fwd ? 40 : rd.len - 40;
    const p = roadAt(rd, s);
    const dir = fwd ? 1 : -1;
    const tx = p.tx * dir;
    const tz = p.tz * dir;
    const off = rd.hw * 0.45;
    const x = p.x - tz * off;
    const z = p.z + tx * off;
    this.spawnCar(carId || this.progress.car, x, z, Math.atan2(tx, tz));
    void c;
  }

  // volta para a estrada mais próxima
  resetToRoad() {
    const ph = this.player;
    const n = this.router.nearest(ph.pos.x, ph.pos.z);
    if (!n) return;
    const p = roadAt(n.r, n.s);
    const f = ph.forward;
    const dir = p.tx * f.x + p.tz * f.z >= 0 ? 1 : -1;
    const tx = p.tx * dir;
    const tz = p.tz * dir;
    const off = n.r.hw * 0.45;
    this.fadeTo(() => {
      this.spawnCar(this.progress.car, p.x - tz * off, p.z + tx * off, Math.atan2(tx, tz));
      this.autopilotOn = false;
    });
  }

  fadeTo(fn) {
    const f = $('fade');
    f.style.opacity = 1;
    setTimeout(() => {
      fn();
      setTimeout(() => (f.style.opacity = 0), 150);
    }, 600);
  }

  previewCar(id) {
    const ph = this.player;
    this.spawnCar(id, ph.pos.x, ph.pos.z, ph.yaw);
    for (let i = 0; i < 20; i++) this.player.update(1 / 60, { throttle: 0, brake: 0, steer: 0, handbrake: true });
  }

  chooseCar(id) {
    if (this.previewId !== id || this.progress.car !== id) this.previewCar(id);
    this.progress.car = id;
    this.save();
  }

  setPaint(id, hex, metal) {
    this.progress.paints[id] = { ...(this.progress.paints[id] || {}), paint: hex, metal };
    if (this.model && this.model.spec.id === id) this.model.setPaint(hex, metal);
    this.save();
  }

  setRim(id, hex) {
    this.progress.paints[id] = { ...(this.progress.paints[id] || {}), rim: hex };
    if (this.model && this.model.spec.id === id) this.previewCar(id);
    this.save();
  }

  // ------------------------------------------------------------ viagens
  setDestination(ci, silent = false) {
    this.progress.dest = ci;
    if (ci === null || ci === undefined) {
      this.gps.set(null);
      this.autopilotOn = false;
      if (!silent) this.hud.toast('Explorando livremente');
      return;
    }
    const ph = this.player;
    const route = this.router.route(ph.pos.x, ph.pos.z, ci, ph.forward);
    this.gps.set(route);
    this.tripStart = { t: this.progress.time, km: this.progress.km };
    if (!silent && route) {
      const c = CITIES[ci];
      this.hud.toast(`Destino: ${c.name}, ${COUNTRIES[c.country].name} · ${fmtKm(route.total)}`);
    }
  }

  routeDistances() {
    if (!this.player) return null;
    const ph = this.player;
    const n = this.router.nearest(ph.pos.x, ph.pos.z);
    if (!n) return null;
    const out = new Array(CITIES.length).fill(Infinity);
    for (const fwd of [true, false]) {
      const end = fwd ? n.r.b : n.r.a;
      const along = fwd ? n.r.len - n.s : n.s;
      const D = this.router.dijkstra(end);
      for (let i = 0; i < CITIES.length; i++) out[i] = Math.min(out[i], along + D.dist[i]);
    }
    return out;
  }

  warpTo(ci) {
    this.fadeTo(() => {
      this.placeAtCity(ci);
      this.gps.set(null);
      this.progress.dest = null;
      this.autopilotOn = false;
      this.terrain.update(this.player.pos);
      this.resume();
    });
  }

  restTo(h) {
    this.fadeTo(() => {
      this.hours = h;
      this.weather.timer = 0;
      this.resume();
    });
  }

  arrive(ci) {
    const c = CITIES[ci];
    const P = this.progress;
    const first = !P.visited.includes(c.id);
    if (first) P.visited.push(c.id);
    const d = new Date();
    P.dates[c.id] = P.dates[c.id] || `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    this.gps.set(null);
    P.dest = null;
    this.autopilotOn = false;
    this.audio.chime();
    // foto do cartão-postal: câmera cinematográfica em volta do carro
    this.state = 'arrival';
    this.arrivalT = 0;
    this.arrivalCity = ci;
    this.arrivalFirst = first;
    this.rig.orbit.yaw = this.player.yaw + 2.4;
    this.rig.orbit.pitch = 0.12;
    this.rig.orbit.dist = 9;
    this.rig.orbit.target.copy(this.player.pos);
  }

  finishArrival() {
    const ci = this.arrivalCity;
    const c = CITIES[ci];
    const P = this.progress;
    this.renderer.render(this.scene, this.camera);
    let img = '';
    try {
      img = this.canvas.toDataURL('image/jpeg', 0.85);
      const t = document.createElement('canvas');
      t.width = 320;
      t.height = 180;
      t.getContext('2d').drawImage(this.canvas, 0, 0, 320, 180);
      P.photos[c.id] = t.toDataURL('image/jpeg', 0.7);
    } catch (e) {
      /* ignorado */
    }
    const trip = this.tripStart ? { km: P.km - this.tripStart.km, t: P.time - this.tripStart.t } : null;
    const text = trip && trip.km > 0.2 ? `Viagem: ${fmtKm(trip.km * 1000)} em ${fmtTime(trip.t)} · ${this.arrivalFirst ? 'novo carimbo no passaporte!' : 'carimbo renovado'}` : this.arrivalFirst ? 'Novo carimbo no passaporte!' : '';
    this.menus.postcard(c, img, { date: P.dates[c.id], text });
    this.save();
  }

  // ------------------------------------------------------------ estados
  startDriving() {
    $('title').classList.add('hidden');
    this.menus.hideAll();
    this.state = 'drive';
    this.hud.setVisible(true);
    $('touch').classList.remove('off');
    this.audio.start();
    if (this.audio.ok && !this.radioStarted) {
      this.radioStarted = true;
      this.audio.radio.setStation(this.progress.station ?? 0);
    }
    this.rig.snap = true;
    if (!this.welcomed) {
      this.welcomed = true;
      const ci = this.gen.countryAt(this.player.pos.x, this.player.pos.z);
      this.lastCountry = ci;
      this.hud.banner(ci);
      setTimeout(() => this.hud.toast('T: escolher um destino · C: câmera · R: rádio · Esc: menu', 6000), 2500);
    }
  }

  resume() {
    this.menus.hideAll();
    if (this.state === 'title') return this.startDriving();
    this.state = 'drive';
    this.hud.setVisible(true);
    $('touch').classList.remove('off');
    this.audio.duck(1);
  }

  onMenu(id) {
    if (!id) return;
    if (this.state === 'drive' || this.state === 'photo') {
      this.state = 'paused';
      $('touch').classList.add('off');
      this.audio.horn(false);
      this.audio.duck(0.6);
    }
    $('photobar').classList.add('hidden');
  }

  setPhoto(on) {
    if (on) {
      this.state = 'photo';
      this.hud.setVisible(false);
      $('touch').classList.add('off');
      $('photobar').classList.remove('hidden');
      $('ph-time').value = this.hours;
      $('ph-fov').value = 45;
      this.photoFov = 45;
      const o = this.rig.orbit;
      o.target.copy(this.player.pos);
      o.yaw = this.player.yaw + Math.PI * 0.75;
      o.pitch = 0.15;
      o.dist = 7;
    } else {
      $('photobar').classList.add('hidden');
      this.resume();
    }
  }

  savePhoto() {
    $('photobar').classList.add('hidden');
    this.renderer.render(this.scene, this.camera);
    const url = this.canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `rota-serena-${Date.now()}.png`;
    a.click();
    $('photobar').classList.remove('hidden');
    this.hud.toast('📸 Foto salva');
  }

  applySettings(key) {
    saveSettings(this.settings);
    const s = this.settings;
    if (key === 'quality') {
      this.save();
      location.reload();
      return;
    }
    if (this.player) {
      this.player.assist = s.assist;
      this.player.manual = s.manual;
      if (!s.manual && this.player.gear === 0) this.player.gear = 1;
    }
    this.audio.applyVolumes();
    $('fps').classList.toggle('hidden', !s.showFps);
  }

  save() {
    if (!this.player) return;
    const P = this.progress;
    P.pos = { x: this.player.pos.x, z: this.player.pos.z, yaw: this.player.yaw };
    P.hours = this.hours;
    P.discovered = this.discovery.serialize();
    if (this.audio.radio) P.station = this.audio.radio.station;
    saveProgress(P);
  }

  // ------------------------------------------------------------ colisões
  collide(ph) {
    const fwd = ph.forward;
    const fx = fwd.x;
    const fz = fwd.z;
    const fl = Math.hypot(fx, fz) || 1;
    const ax = [fx / fl, fz / fl];
    const ay = [-fz / fl, fx / fl];
    const L = ph.spec.dims.L / 2;
    const W = ph.spec.dims.W / 2;
    // centro geométrico (o centro de massa não fica no meio)
    const cx = ph.pos.x - ax[0] * ph.com.z;
    const cz = ph.pos.z - ax[1] * ph.com.z;
    const contacts = [];
    // caixa x caixa (SAT 2D)
    const obb = (ox, oz, bx, by, hx, hy, vel) => {
      const axes = [ax, ay, bx, by];
      let best = 1e9;
      let bn = null;
      const dx = cx - ox;
      const dz = cz - oz;
      for (const a of axes) {
        const ra = L * Math.abs(ax[0] * a[0] + ax[1] * a[1]) + W * Math.abs(ay[0] * a[0] + ay[1] * a[1]);
        const rb = hx * Math.abs(bx[0] * a[0] + bx[1] * a[1]) + hy * Math.abs(by[0] * a[0] + by[1] * a[1]);
        const d = dx * a[0] + dz * a[1];
        const o = ra + rb - Math.abs(d);
        if (o <= 0) return;
        if (o < best) {
          best = o;
          bn = d >= 0 ? [a[0], a[1]] : [-a[0], -a[1]];
        }
      }
      // ponto de contato: canto do carro mais "enterrado"
      let cp = null;
      let mind = 1e9;
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const px = cx + ax[0] * L * sz + ay[0] * W * sx;
          const pz = cz + ax[1] * L * sz + ay[1] * W * sx;
          const d = px * bn[0] + pz * bn[1];
          if (d < mind) {
            mind = d;
            cp = [px, pz];
          }
        }
      contacts.push({ p: new THREE.Vector3(cp[0], ph.pos.y, cp[1]), n: new THREE.Vector3(bn[0], 0, bn[1]), pen: best, vel });
    };
    const circle = (ox, oz, r) => {
      // centro do círculo no referencial do carro
      const dx = ox - cx;
      const dz = oz - cz;
      const lx = dx * ax[0] + dz * ax[1];
      const ly = dx * ay[0] + dz * ay[1];
      const qx = clamp(lx, -L, L);
      const qy = clamp(ly, -W, W);
      const ex = lx - qx;
      const ey = ly - qy;
      const d = Math.hypot(ex, ey);
      if (d > r) return;
      let nx;
      let ny;
      let pen;
      if (d > 1e-4) {
        nx = -ex / d;
        ny = -ey / d;
        pen = r - d;
      } else {
        // dentro: empurra pelo eixo mais curto
        const px = L - Math.abs(lx);
        const py = W - Math.abs(ly);
        if (px < py) {
          nx = -Math.sign(lx);
          ny = 0;
          pen = px + r;
        } else {
          nx = 0;
          ny = -Math.sign(ly);
          pen = py + r;
        }
      }
      const wx = nx * ax[0] + ny * ay[0];
      const wz = nx * ax[1] + ny * ay[1];
      const px = cx + (qx * ax[0] + qy * ay[0]);
      const pz = cz + (qx * ax[1] + qy * ay[1]);
      contacts.push({ p: new THREE.Vector3(px, ph.pos.y, pz), n: new THREE.Vector3(wx, 0, wz), pen });
    };
    // construções
    const seen = new Set();
    for (const [ox, oz] of [
      [0, 0],
      [L, 0],
      [-L, 0],
    ]) {
      const qx = cx + ax[0] * ox;
      const qz = cz + ax[1] * ox;
      for (const b of this.cities.collidersNear(qx, qz) || []) {
        if (seen.has(b)) continue;
        seen.add(b);
        obb(b.x, b.z, [b.sin, b.cos], [b.cos, -b.sin], b.hz, b.hx);
      }
      for (const s of this.roadMeshes.segmentsNear(qx, qz) || []) {
        if (seen.has(s)) continue;
        seen.add(s);
        const sx = s[2] - s[0];
        const sz = s[3] - s[1];
        const sl = Math.hypot(sx, sz) || 1;
        obb((s[0] + s[2]) / 2, (s[1] + s[3]) / 2, [sx / sl, sz / sl], [-sz / sl, sx / sl], sl / 2 + 0.05, 0.12);
      }
    }
    // árvores e pedras
    const cs = 128;
    const ci = Math.floor(cx / cs);
    const cj = Math.floor(cz / cs);
    for (let di = -1; di <= 1; di++)
      for (let dj = -1; dj <= 1; dj++) {
        const cell = this.flora.cells.get((ci + di) * 10000 + (cj + dj));
        if (!cell) continue;
        const t = cell.t;
        for (let o = 0; o < t.length; o += 8) {
          const dx = t[o] - cx;
          const dz = t[o + 2] - cz;
          if (dx * dx + dz * dz > 49) continue;
          const tr = TRUNK_ARR[t[o + 5]] * t[o + 3];
          if (tr > 0.05) circle(t[o], t[o + 2], tr);
        }
      }
    // trânsito
    for (const c of this.traffic.near(cx, cz)) {
      const s = Math.sin(c.yaw);
      const co = Math.cos(c.yaw);
      const before = contacts.length;
      obb(c.pos.x, c.pos.z, [s, co], [-co, s], c.L / 2, c.W / 2, c.velVec);
      if (contacts.length > before) c.wait = 2.5;
    }
    let hit = 0;
    for (const k of contacts) hit = Math.max(hit, ph.applyImpulse(k.p, k.n, k.pen, k.vel || null, 0.2));
    if (hit > 2.5) {
      this.audio.thump(hit / 12);
      this.shake = Math.min(0.4, hit / 30);
    }
  }

  // ------------------------------------------------------------ quadro
  frame() {
    let dt = Math.min(this.clock.getDelta(), 0.05);
    this.time += dt;
    // FPS e resolução dinâmica
    this.fpsT += dt;
    this.fpsN++;
    if (this.fpsT > 0.5) {
      const fps = this.fpsN / this.fpsT;
      if (this.settings.showFps) $('fps').textContent = `${Math.round(fps)} FPS · ${Math.round(this.pr * 100) / 100}x`;
      if (fps < 40) this.slowT++;
      else this.slowT = Math.max(0, this.slowT - 1);
      if (this.slowT > 3 && this.pr > this.basePR * 0.6) {
        this.pr = Math.max(this.basePR * 0.6, this.pr * 0.85);
        this.renderer.setPixelRatio(this.pr);
        this.slowT = 0;
      } else if (fps > 58 && this.pr < this.basePR) {
        this.pr = Math.min(this.basePR, this.pr * 1.08);
        this.renderer.setPixelRatio(this.pr);
      }
      this.fpsT = 0;
      this.fpsN = 0;
    }
    const inp = this.input;
    inp.pollGamepad();
    this.handleKeys();
    const st = this.state;
    const ph = this.player;
    const driving = st === 'drive';
    const simulate = driving || st === 'title' || st === 'arrival';
    // controles
    let ctrl = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    if (driving) {
      const man = inp.drive();
      if (this.autopilotOn && this.gps.route) {
        ctrl = autopilot(this.gps.route, ph, Math.min(COUNTRIES[this.gen.countryAt(ph.pos.x, ph.pos.z)].speed + 10, 110), dt, { blocked: this.blockedSpeed() });
        if (man.brake > 0.5 || Math.abs(man.steer) > 0.6) {
          this.autopilotOn = false;
          this.hud.toast('Piloto automático desligado');
        }
      } else ctrl = man;
    } else if (st === 'arrival') ctrl = { throttle: 0, brake: 0, steer: 0, handbrake: true };
    else if (st === 'title') ctrl = { throttle: 0, brake: 0, steer: 0, handbrake: true };
    if (simulate) {
      ph.update(dt, ctrl);
      this.model.pose(ph.pos, ph.quat, ph.wheels, ph.steerAngle, dt);
    }
    const night = this.sky.light.night;
    // faróis automáticos ao anoitecer
    const wantLights = this.autoLights ? night > 0.3 || this.weather.cur.fog > 0.5 || this.weather.cur.rain > 0.6 : this.lightsOn;
    this.model.setLights(wantLights, ph.brake, night);
    this.model.animateWipers(this.time, this.weather.cur.rain > 0.3 && driving);
    // jogo
    if (driving) this.gameplay(dt);
    if (st === 'arrival') {
      this.arrivalT += dt;
      if (this.arrivalT > 3.2) {
        this.state = 'paused';
        this.finishArrival();
      }
    }
    // hora do dia
    const gameDt = driving ? dt : st === 'title' ? dt * 0.3 : 0;
    if (this.settings.dayMinutes > 0 && st !== 'photo') this.hours = (this.hours + gameDt * (24 / (this.settings.dayMinutes * 60))) % 24;
    // câmera
    const look = inp.consumeLook();
    if (st === 'drive') {
      this.rig.lookBack = inp.isHeld('lookBack');
      this.rig.update(dt, ph, this.model, look, inp.lookActive);
      if (this.shake > 0) {
        this.camera.position.x += (Math.random() - 0.5) * this.shake;
        this.camera.position.y += (Math.random() - 0.5) * this.shake;
        this.shake *= Math.exp(-dt * 8);
      }
    } else if (st === 'title') {
      this.rig.updateOrbit(dt, ph.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), look, inp.zoom, 0.05);
    } else if (st === 'arrival') {
      this.rig.updateOrbit(dt, ph.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), null, 0, 0.15);
    } else if (st === 'photo') {
      this.rig.updateOrbit(dt, ph.pos.clone().add(new THREE.Vector3(0, 0.5, 0)), look, inp.zoom, 0);
      this.camera.fov = this.photoFov;
      this.camera.updateProjectionMatrix();
    } else if (st === 'paused' && this.menus.open === 'garage') {
      this.rig.updateOrbit(dt, ph.pos.clone().add(new THREE.Vector3(0, 0.6, 0)), look, inp.zoom, 0.12);
    }
    const inside = st === 'drive' && this.rig.inside;
    if (inside && this.model.interior) {
      this.screenT = (this.screenT || 0) - dt;
      if (this.screenT <= 0) {
        this.screenT = 0.5;
        const R = this.gps.route;
        const h = Math.floor(this.hours);
        const m = Math.floor((this.hours % 1) * 60);
        let bearing = 0;
        if (R) {
          const t = R.pts[Math.min(R.pts.length - 1, R.idx + 12)];
          bearing = -(Math.atan2(t.x - ph.pos.x, t.z - ph.pos.z) - ph.yaw);
        }
        const radio = this.audio.radio ? this.audio.radio.current : null;
        this.model.interior.drawScreen({
          time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`,
          temp: document.getElementById('wx-temp').textContent,
          dest: R ? CITIES[R.dest].name : null,
          dist: R ? fmtKm(R.remaining ?? R.total) : '',
          bearing,
          place: document.getElementById('loc-place').textContent,
          radio: radio ? (this.audio.radio.title ? `${radio.name} · ${this.audio.radio.title}` : radio.name) : 'Rádio desligado',
        });
      }
    }
    if (this.model.interior) {
      this.model.interior.setHeadVisible(!inside);
      if (inside || st === 'paused') this.model.interior.update({ steerAngle: ph.steerAngle, rpm: ph.rpm, speed: ph.speed, gearLabel: ph.gearLabel }, inside);
    }
    this.updateWorld(dt, gameDt, night, wantLights);
    // áudio
    if (this.audio.ok) {
      this.audio.setInside(inside);
      const slip = ph.wheels.reduce((a, w) => Math.max(a, w.slipLat, w.slipLong), 0);
      this.audio.updateCar({
        rpm: ph.rpm,
        throttle: simulate ? ph.throttle : 0,
        redline: ph.P.redline,
        cyl: ph.spec.sound.cyl,
        pitch: ph.spec.sound.pitch,
        speed: ph.speed,
        slip,
        surface: ph.surface ?? 0,
        shifting: ph.shiftT > 0,
        engineOn: st !== 'loading',
      });
      const cam = this.camera.position;
      const city = this.gen.cityAt(cam.x, cam.z, 80);
      const coast = clamp(1 - Math.abs(this.gen.height(cam.x, cam.z)) / 25, 0, 1) * clamp(1 - this.gen.coastDist(cam.x, cam.z) / 900, 0, 1);
      this.audio.updateAmbient({ day: 1 - night, forest: city ? 0.2 : this.gen.forestDensity(cam.x, cam.z), coast, rain: this.weather.cur.rain, speed: Math.abs(ph.speed), inside }, dt);
      // novo título de música
      const R = this.audio.radio;
      if (R && R.title !== this.lastSong) {
        this.lastSong = R.title;
        if (R.title && driving) this.hud.radio(R.current, R.title);
      }
    }
    // HUD
    if (driving) {
      this.hud.update(dt);
      this.hudT -= dt;
      if (this.hudT <= 0) {
        this.hudT = 1 / 30;
        const flags = [
          [wantLights, '💡', '#8fd0ff'],
          [ph.cruise > 0, 'CC', '#8ff0b0'],
          [this.autopilotOn, 'AUTO', '#5fe6ff'],
        ];
        this.hud.speedo(ph, this.settings.units, flags);
        this.hud.minimap(this.baseMap, ph.pos, ph.yaw, this.roads, this.gps.route, this.viewpoints, this.progress.viewpoints, this.traffic.cars, this.gps.route ? this.gps.route.dest : null);
      }
    }
    // retrovisor
    if (inside && this.Q.mirror && this.model.interior && (this.frameN = (this.frameN || 0) + 1) % 2 === 0) {
      const I = this.model.interior;
      I.mirrorPlane.visible = false;
      I.mirrorCam.updateMatrixWorld();
      this.renderer.setRenderTarget(I.mirrorRT);
      this.renderer.render(this.scene, I.mirrorCam);
      this.renderer.setRenderTarget(null);
      I.mirrorPlane.visible = true;
    }
    this.renderer.toneMappingExposure = this.sky.exposure;
    this.renderer.render(this.scene, this.camera);
    inp.endFrame();
  }

  // velocidade máxima para não bater no carro da frente (piloto automático)
  blockedSpeed() {
    const ph = this.player;
    const f = ph.forward;
    let best = null;
    for (const c of this.traffic.cars) {
      const dx = c.pos.x - ph.pos.x;
      const dz = c.pos.z - ph.pos.z;
      const ahead = dx * f.x + dz * f.z;
      const lat = Math.abs(-dx * f.z + dz * f.x);
      if (ahead > 0 && ahead < 50 && lat < 2.4) {
        const v = Math.max(0, (ahead - 10) * 0.5) + c.v * 0.9;
        best = best === null ? v : Math.min(best, v);
      }
    }
    return best;
  }

  handleKeys() {
    const inp = this.input;
    const st = this.state;
    if (inp.pressed('fullscreen')) {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    }
    if (inp.pressed('menu')) {
      if (st === 'drive') this.menus.show('pause');
      else if (st === 'photo') this.setPhoto(false);
      else if (this.menus.isOpen) this.menus.back();
      return;
    }
    if (st === 'photo' && inp.pressed('photo')) return this.setPhoto(false);
    if (st === 'paused' && this.menus.open === 'map' && inp.pressed('map')) return this.resume();
    if (st === 'paused' && this.menus.open === 'trips' && inp.pressed('trips')) return this.resume();
    if (st === 'title' && inp.pressed('confirm')) return this.startDriving();
    if (st !== 'drive') return;
    const ph = this.player;
    if (inp.pressed('camera')) {
      const m = this.rig.next(1);
      this.settings.camera = ['chase', 'far', 'cockpit', 'hood', 'bumper', 'cinema'].indexOf(m);
      saveSettings(this.settings);
      this.hud.toast(`🎥 ${CAM_NAMES[m]}`, 1500);
    }
    if (inp.pressed('cameraBack')) this.rig.next(-1);
    if (inp.pressed('lights')) {
      if (this.autoLights) {
        this.autoLights = false;
        this.lightsOn = !(this.sky.light.night > 0.3);
      } else this.lightsOn = !this.lightsOn;
      this.hud.toast(this.lightsOn ? '💡 Faróis ligados' : 'Faróis desligados', 1500);
    }
    if (inp.pressed('radio') && this.audio.ok) {
      const s = this.audio.radio.next();
      this.hud.radio(s, this.audio.radio.title);
      this.progress.station = this.audio.radio.station;
    }
    if (inp.pressed('map')) return this.menus.show('map');
    if (inp.pressed('trips')) return this.menus.show('trips');
    if (inp.pressed('photo')) return this.setPhoto(true);
    if (inp.pressed('hud')) this.hud.setVisible(!this.hud.visible);
    if (inp.pressed('cruise')) {
      if (ph.cruise > 0) {
        ph.cruise = 0;
        this.hud.toast('Controle de cruzeiro desligado', 1500);
      } else if (ph.speed > 5) {
        ph.cruise = ph.speed;
        this.hud.toast(`Cruzeiro em ${Math.round(ph.speed * 3.6)} km/h`, 1500);
      }
    }
    if (inp.pressed('autopilot')) {
      if (!this.gps.route) this.hud.toast('Escolha um destino (T) para usar o piloto automático');
      else {
        this.autopilotOn = !this.autopilotOn;
        ph.cruise = 0;
        this.hud.toast(this.autopilotOn ? '🅰 Piloto automático: relaxe e aproveite a paisagem' : 'Piloto automático desligado');
      }
    }
    if (inp.pressed('reset')) this.resetToRoad();
    if (inp.pressed('shiftUp') && ph.manual) ph.shiftUp();
    if (inp.pressed('shiftDown') && ph.manual) ph.shiftDown();
    this.audio.horn(inp.isHeld('horn'), ph.spec.sound.kind);
  }

  gameplay(dt) {
    const ph = this.player;
    const P = this.progress;
    const pos = ph.pos;
    // distância percorrida e estradas descobertas
    const sp = Math.abs(ph.speed);
    P.km += (sp * dt) / 1000;
    P.time += dt;
    const q = this.gen.roadQuery(pos.x, pos.z, 12);
    if (q) this.discovery.mark(q.road, q.s);
    // GPS
    if (this.gps.route) {
      const off = this.gps.progress(pos.x, pos.z);
      this.rerouteT -= dt;
      if (off > 70 && this.rerouteT <= 0) {
        this.rerouteT = 4;
        this.setDestination(this.gps.route.dest, true);
        this.hud.toast('Recalculando a rota…', 1500);
      }
      const R = this.gps.route;
      const c = CITIES[R.dest];
      if (Math.hypot(c.x - pos.x, c.z - pos.z) < 34) return this.arrive(R.dest);
      // seta do GPS: direção do ponto da rota ~60 m à frente
      const t = R.pts[Math.min(R.pts.length - 1, R.idx + 12)];
      const bearing = Math.atan2(t.x - pos.x, t.z - pos.z) - ph.yaw;
      const eta = (R.remaining ?? R.total) / Math.max(12, sp);
      this.hud.setGps(R, -bearing, eta);
    } else this.hud.setGps(null);
    // mirantes
    for (const v of this.viewpoints) {
      if (P.viewpoints.includes(v.id)) continue;
      if (Math.hypot(v.px - pos.x, v.pz - pos.z) < 36 && sp < 5) {
        P.viewpoints.push(v.id);
        this.audio.chime();
        this.hud.toast(`📷 ${v.name} descoberto! (${P.viewpoints.length}/${this.viewpoints.length})`, 5000);
        this.save();
      }
    }
    // fronteiras e cidades
    this.countryT -= dt;
    if (this.countryT <= 0) {
      this.countryT = 0.5;
      const ci = this.gen.countryAt(pos.x, pos.z);
      if (ci !== this.lastCountry) {
        if (ci === this.pendingCountry) {
          this.pendingN = (this.pendingN || 0) + 1;
          if (this.pendingN >= 3) {
            this.lastCountry = ci;
            this.hud.banner(ci);
            if (!P.countries.includes(ci)) P.countries.push(ci);
            this.hud.toast(`${GREET[COUNTRIES[ci].id]} · ${COUNTRIES[ci].speed} km/h é o limite por aqui`, 4500);
          }
        } else {
          this.pendingCountry = ci;
          this.pendingN = 1;
        }
      } else if (!P.countries.includes(ci)) P.countries.push(ci);
      const city = this.gen.cityAt(pos.x, pos.z, 30);
      let place;
      if (city) place = city.name;
      else if (q) place = `${q.road.name} · entre ${CITIES[q.road.a].name} e ${CITIES[q.road.b].name}`;
      else place = 'fora da estrada';
      if (city && city !== this.lastCity) this.hud.toast(`Bem-vindo a ${city.name}`, 2500);
      this.lastCity = city;
      this.hud.setLocation(this.lastCountry >= 0 ? this.lastCountry : ci, place);
      // clima e temperatura
      const C = COUNTRIES[ci];
      const day = 1 - this.sky.light.night;
      const temp = lerp(C.temp[0], C.temp[1], day * 0.8) - Math.max(0, pos.y - 300) * 0.0065 - this.weather.cur.rain * 3;
      this.hud.setClock(this.hours, WEATHER_ICONS[this.weather.kind] || '☀', temp);
    }
    // caiu na água ou capotou: volta para a estrada
    const level = this.gen.waterLevel(pos.x, pos.z);
    if (pos.y < level + 0.15 && this.gen.groundH(pos.x, pos.z) < level - 0.7 && !this.resetting) {
      this.resetting = true;
      this.hud.toast('🌊 Ops! O carro foi rebocado de volta para a estrada');
      this.resetToRoad();
      setTimeout(() => (this.resetting = false), 1500);
    }
    if (ph.upsideT > 2.5 && !this.resetting) {
      this.resetting = true;
      this.resetToRoad();
      setTimeout(() => (this.resetting = false), 1500);
    }
    // salva de tempos em tempos
    this.saveT -= dt;
    if (this.saveT <= 0) {
      this.saveT = 15;
      this.save();
    }
  }

  updateWorld(dt, gameDt, night, lights) {
    const cam = this.camera.position;
    const ph = this.player;
    const ci = this.gen.countryAt(cam.x, cam.z);
    // pétalas perto das cerejeiras do Japão na primavera eterna
    const petals = ci === 2 && night < 0.6;
    const W = this.weather.update(dt, gameDt, cam, ci, this.settings.weather, petals);
    this.sky.weather.cloud = W.cloud;
    this.sky.weather.rain = W.rain;
    this.sky.weather.snow = W.snow;
    this.sky.weather.fog = W.fog;
    const C = COUNTRIES[ci];
    this.sky.update(this.hours, dt, cam, ph.pos, new THREE.Color(C.grass[0], C.grass[1], C.grass[2]));
    this.water.update(this.sky, this.scene.fog);
    this.water.setTint(new THREE.Color(...C.water).multiplyScalar(2.2));
    this.terrain.shared.uWet.value = this.weather.wet;
    this.terrain.shared.uSnowCover.value = smoothstep(0.3, 1, W.snow) * 0.8;
    this.terrain.update(cam);
    this.flora.uniforms.uWind.value = 1 + W.rain * 1.5;
    this.flora.update(cam, dt);
    this.roadMeshes.update(cam, this.weather.wet);
    this.cities.update(cam, night, this.time);
    this.gps.update(this.time);
    this.traffic.update(this.state === 'drive' || this.state === 'title' ? dt : 0, ph, night);
    // farol do jogador
    const hl = this.headlight;
    if (lights && night > 0.15) {
      const f = ph.forward;
      const up = new THREE.Vector3(0, 1, 0).applyQuaternion(ph.quat);
      const front = ph.pos.clone().addScaledVector(f, ph.spec.dims.L / 2 - ph.com.z).addScaledVector(up, 0.1);
      hl.position.copy(front);
      hl.target.position.copy(front).addScaledVector(f, 25).addScaledVector(up, -2.2);
      hl.intensity = 900 * night;
    } else hl.intensity = 0;
    // postes acesos perto da câmera
    this.lampT -= dt;
    if (this.lampT <= 0 && this.lampLights.length) {
      this.lampT = 0.4;
      const near = this.cities.lamps.filter((l) => Math.abs(l.x - cam.x) < 120 && Math.abs(l.z - cam.z) < 120).sort((a, b) => a.distanceToSquared(cam) - b.distanceToSquared(cam));
      this.lampLights.forEach((L, i) => {
        const p = near[i];
        if (p && night > 0.35) {
          L.position.copy(p);
          L.intensity = 60;
        } else L.intensity = 0;
      });
    }
  }
}

const game = new Game();
game.init().catch((e) => {
  console.error(e);
  showError('Não foi possível iniciar o jogo:\n' + (e && e.stack ? e.stack : e));
});
window.addEventListener('error', (e) => {
  if (game.state === 'loading') showError(String(e.message));
});
void STATIONS;
void lerp;

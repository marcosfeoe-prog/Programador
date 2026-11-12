// Caçadores de Tornados — laço principal, telas e regras do jogo.

import * as THREE from 'three';
import { QUALITY, CLOCK_SCALE, WORLD, EF_COLORS, MS_TO_KMH, detectMobile } from './config.js';
import { Input } from './core/input.js';
import { Audio } from './core/audio.js';
import { RNG } from './core/rng.js';
import { clamp, lerp, damp, fmtMoney, fmtDist, fmtClock, smoothstep, bearingDeg, compass, wrapAngle } from './core/math.js';
import { buildTextures } from './render/textures.js';
import { buildNoise3D } from './render/noise3d.js';
import { VolumeRenderer } from './render/volume.js';
import { Pipeline } from './render/pipeline.js';
import { Sky, seasonDecl } from './render/sky.js';
import { SHARED } from './render/materials.js';
import { DebrisSystem } from './render/debris.js';
import { LightningRenderer } from './render/lightning.js';
import { Precipitation } from './render/particles.js';
import { World } from './world/world.js';
import { COUNTRIES, COUNTRY_ORDER, travelInfo } from './world/countries.js';
import { dayEnvironment, planStorms, forecastText, consumeDay, RISK, bearingName } from './weather/climate.js';
import { WeatherSystem } from './weather/weather.js';
import { DamageSystem, surveyReport } from './weather/damage.js';
import { Vehicle } from './vehicle/vehicle.js';
import { VEHICLES, VEHICLE_ORDER, UPGRADES } from './vehicle/catalog.js';
import { CameraRig, CAM_NAMES } from './vehicle/camera.js';
import { Radar, drawMap, drawRiskMap } from './ui/radar.js';
import { Hud, $, show, hide, screen, renderReport, efBadge } from './ui/hud.js';
import { defaultSave, loadSave, writeSave } from './game/save.js';
import { simpleCarGeometry } from './vehicle/carBuilder.js';
import { patchWorld } from './render/materials.js';
import { pointInPoly } from './core/math.js';

const G = {
  state: 'boot',
  lab: false,
  warp: 1,
  clock: 12 * 3600,
  time: 0,
  frame: 0,
  shade: { sun: 1, sky: 1, cover: 0, rain: 0, hail: 0, tint: 0 },
  hailSize: 0,
  exposure: 1.4,
  wet: 0,
  probes: [],
  tracks: [],
  warnings: [],
  pendingReports: [],
  todayEarned: 0,
  todayCosts: 0,
  todaySeen: [],
  scanT: 0,
  fpsAcc: 0,
  fpsN: 0,
  dynScale: 1,
  slowT: 0,
  fastT: 0,
  vis: 20000,
};
window.__G = G;

const canvas = $('game');
const hud = new Hud();
const input = new Input(canvas);
const audio = new Audio();

function setLoading(p, msg) {
  $('load-bar').style.width = `${Math.round(p * 100)}%`;
  if (msg) $('load-msg').textContent = msg;
}

// ------------------------------------------------------------------ inicialização
async function boot() {
  G.save = loadSave();
  const settings = (G.save || defaultSave()).settings;
  G.settings = settings;
  G.q = { ...QUALITY[settings.quality] };
  screen('loading');
  setLoading(0.05, 'Iniciando o motor gráfico');
  await tick();
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
  if (!renderer.capabilities.isWebGL2) {
    $('load-msg').textContent = 'Este navegador não suporta WebGL 2.';
    return;
  }
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.shadowMap.enabled = G.q.shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  G.renderer = renderer;
  setLoading(0.15, 'Pintando texturas');
  await tick();
  G.tex = buildTextures(renderer, G.q);
  setLoading(0.4, 'Gerando o ruído das nuvens');
  await tick();
  G.noise = buildNoise3D(64);
  G.volume = new VolumeRenderer(G.noise);
  G.pipeline = new Pipeline(renderer, G.q);
  G.sky = new Sky();
  G.scene = new THREE.Scene();
  G.scene.add(G.sky.sunLight, G.sky.hemi, G.sky.sunLight.target);
  G.camera = new THREE.PerspectiveCamera(60, 1, 0.6, 90000);
  G.rig = new CameraRig(G.camera);
  G.debris = new DebrisSystem(G.q.debris);
  G.scene.add(G.debris.group);
  G.lightning = new LightningRenderer();
  G.scene.add(G.lightning.group);
  G.precip = new Precipitation(G.q.rain);
  G.pipeline.overlay.add(G.precip.group);
  G.radar = new Radar($('radar'));
  G.probeGroup = new THREE.Group();
  G.scene.add(G.probeGroup);
  setupShadows();
  setupEnvironment();
  window.addEventListener('resize', resize);
  resize();
  bindUI();
  input.bindTouch($('touch'));
  setLoading(1, 'Pronto');
  showMenu();
  requestAnimationFrame(loop);
}

const tick = () => new Promise((r) => setTimeout(r, 0));

// Ambiente para reflexos (pintura, vidros): uma cúpula com as cores do céu atual,
// convertida em mapa de reflexo (PMREM) a cada poucos segundos.
function setupEnvironment() {
  G.pmrem = new THREE.PMREMGenerator(G.renderer);
  const geo = new THREE.SphereGeometry(100, 32, 16);
  G.envMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uZ: { value: new THREE.Color() }, uH: { value: new THREE.Color() }, uG: { value: new THREE.Color() }, uSun: { value: new THREE.Vector3(0, 1, 0) }, uSunC: { value: new THREE.Color() } },
    vertexShader: 'varying vec3 vD; void main() { vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform vec3 uZ, uH, uG, uSun, uSunC; varying vec3 vD;
      void main() { float y = vD.y; vec3 c = y > 0.0 ? mix(uH, uZ, pow(y, 0.5)) : mix(uH * 0.8, uG, min(1.0, -y * 4.0));
      c += uSunC * pow(max(dot(vD, uSun), 0.0), 64.0) * 0.6; gl_FragColor = vec4(c, 1.0); }`,
  });
  G.envScene = new THREE.Scene();
  G.envScene.add(new THREE.Mesh(geo, G.envMat));
  G.envT = 0;
}

function updateEnvironment(dt) {
  G.envT -= dt;
  if (G.envT > 0) return;
  G.envT = 3;
  const u = G.envMat.uniforms;
  const k = 0.35 + 0.65 * G.shade.sky;
  u.uZ.value.copy(G.sky.zenith).multiplyScalar(k);
  u.uH.value.copy(G.sky.horizon).multiplyScalar(k);
  u.uG.value.copy(G.sky.ambGround).multiplyScalar(2.5);
  u.uSun.value.copy(G.sky.sunDir);
  u.uSunC.value.copy(G.sky.sunColor).multiplyScalar(G.shade.sun);
  const old = G.envRT;
  G.envRT = G.pmrem.fromScene(G.envScene, 0, 0.1, 200);
  // Só o carro do jogador usa o reflexo (o resto do mundo já tem a luz hemisférica).
  if (G.vehicle)
    G.vehicle.group.traverse((o) => {
      if (!o.isMesh || !o.material || !o.material.isMeshStandardMaterial) return;
      if (!o.material.envMap) o.material.needsUpdate = true;
      o.material.envMap = G.envRT.texture;
    });
  if (old) old.dispose();
}

function setupShadows() {
  const L = G.sky.sunLight;
  L.castShadow = G.q.shadows;
  L.shadow.mapSize.set(G.q.shadowSize, G.q.shadowSize);
  const s = L.shadow.camera;
  s.left = -90;
  s.right = 90;
  s.top = 90;
  s.bottom = -90;
  s.near = 1;
  s.far = 1400;
  L.shadow.bias = -0.0004;
  L.shadow.normalBias = 0.6;
}

function resize() {
  const pr = Math.min(window.devicePixelRatio || 1, 1.5) * G.q.pixelRatio;
  const w = Math.max(1, Math.floor(window.innerWidth * pr));
  const h = Math.max(1, Math.floor(window.innerHeight * pr));
  G.renderer.setPixelRatio(1);
  G.renderer.setSize(w, h, false);
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  G.camera.aspect = w / h;
  G.camera.updateProjectionMatrix();
  G.pipeline.resize(w, h);
  applyTouchMode();
}

function applyTouchMode() {
  const mode = G.settings?.touch || 'auto';
  const on = mode === 'on' || (mode === 'auto' && (detectMobile() || input.usingTouch));
  document.body.classList.toggle('touch', on);
  $('touch').classList.toggle('hidden', !(on && G.state === 'play'));
}

// ------------------------------------------------------------------ telas
function showMenu() {
  G.state = 'menu';
  screen('menu');
  hide('hud');
  applyTouchMode();
  $('btn-continue').classList.toggle('hidden', !G.save);
}

function bindUI() {
  document.querySelectorAll('[data-go]').forEach((b) =>
    b.addEventListener('click', () => {
      audio.start();
      audio.beep(660, 0.05, 0.03);
      const go = b.dataset.go;
      if (go === 'new') newSeason();
      else if (go === 'continue') showCountries();
      else if (go === 'lab') showLab();
      else if (go === 'settings') showSettings('menu');
      else if (go === 'help') {
        G.helpBack = G.state === 'menu' ? 'menu' : 'pause';
        screen('help');
      } else if (go === 'back') screen(G.helpBack || 'menu');
      else if (go === 'menu') showMenu();
      else if (go === 'countries') showCountries();
      else if (go === 'garage') showGarage(G.state === 'briefing' ? 'briefing' : 'countries');
      else if (go === 'journal') showJournal('countries');
    }),
  );
  $('b-start').addEventListener('click', () => {
    audio.start();
    if (G.briefFromPause) {
      G.briefFromPause = false;
      resume();
    } else startDay($('b-city').value);
  });
  $('g-back').addEventListener('click', () => (G.garageBack === 'briefing' ? showBriefing() : showCountries()));
  $('l-go').addEventListener('click', () => {
    audio.start();
    startLab();
  });
  $('l-carga').addEventListener('input', () => ($('l-carga-v').textContent = (+$('l-carga').value).toFixed(1)));
  $('s-back').addEventListener('click', () => {
    applySettings();
    if (G.settingsBack === 'pause') screen('pause');
    else showMenu();
  });
  $('p-resume').addEventListener('click', resume);
  $('p-map').addEventListener('click', () => openMap());
  $('p-forecast').addEventListener('click', () => {
    G.briefBack = 'pause';
    showBriefing(true);
  });
  $('p-skip').addEventListener('click', skipToStorms);
  $('p-endday').addEventListener('click', () => endDay());
  $('p-journal').addEventListener('click', () => showJournal('pause'));
  $('p-settings').addEventListener('click', () => showSettings('pause'));
  $('p-exit').addEventListener('click', () => {
    if (!G.lab) persist();
    G.weather = null;
    showMenu();
  });
  $('map-close').addEventListener('click', closeMap);
  $('r-ok').addEventListener('click', () => {
    if (G.pendingReports.length) return showNextReport();
    resume();
  });
  $('d-ok').addEventListener('click', () => {
    persist();
    showCountries();
  });
  $('j-back').addEventListener('click', () => (G.journalBack === 'pause' ? screen('pause') : showCountries()));
  $('death-ok').addEventListener('click', afterWreck);
  // Popula selects.
  const lc = $('l-country');
  for (const id of COUNTRY_ORDER) lc.add(new Option(`${COUNTRIES[id].flag} ${COUNTRIES[id].name}`, id));
  const car = $('l-car');
  for (const id of VEHICLE_ORDER) car.add(new Option(VEHICLES[id].name, id));
  car.value = 'suv';
  const sq = $('s-quality');
  for (const [k, v] of Object.entries(QUALITY)) sq.add(new Option(v.label, k));
}

function newSeason() {
  G.save = defaultSave();
  G.save.settings = G.settings;
  persist();
  showCountries();
}

function persist() {
  if (G.save && !G.lab) writeSave(G.save);
}

function showSettings(back) {
  G.settingsBack = back;
  const s = G.settings;
  $('s-quality').value = s.quality;
  $('s-dyn').checked = s.dynamic;
  $('s-vol').value = s.volume;
  $('s-sens').value = s.sens;
  $('s-fps').checked = s.fps;
  $('s-touch').value = s.touch;
  screen('settings');
}

function applySettings() {
  const s = G.settings;
  const q = $('s-quality').value;
  s.dynamic = $('s-dyn').checked;
  s.volume = +$('s-vol').value;
  s.sens = +$('s-sens').value;
  s.fps = $('s-fps').checked;
  s.touch = $('s-touch').value;
  audio.volume = s.volume;
  $('fps').classList.toggle('hidden', !s.fps);
  if (q !== s.quality) {
    s.quality = q;
    G.q = { ...QUALITY[q] };
    G.pipeline.setQuality(G.q);
    G.renderer.shadowMap.enabled = G.q.shadows;
    setupShadows();
    resize();
    hud.notify('Algumas mudanças de qualidade valem ao carregar o próximo país.', '', 5);
  }
  if (G.save) G.save.settings = s;
  persist();
  applyTouchMode();
}

function showCountries() {
  G.state = 'countries';
  hide('hud');
  applyTouchMode();
  const grid = $('country-grid');
  grid.innerHTML = '';
  const s = G.save;
  $('c-status').textContent = `Dia ${s.day} · ${fmtMoney(s.money)}`;
  for (const id of COUNTRY_ORDER) {
    const c = COUNTRIES[id];
    const env = dayEnvironment(s.calendar, id, s.day);
    const r = RISK[env.risk];
    const tr = travelInfo(s.country || id, id);
    const card = document.createElement('div');
    card.className = 'ccard' + (s.country === id ? ' here' : '');
    card.innerHTML = `<div class="flag">${c.flag}</div><div class="cname">${c.name}</div><div class="creg">${c.region}</div>
      <div class="crisk" style="background:${r.color}">${r.name}</div>
      <div class="creg">CAPE ${env.cape} · SRH ${env.srh} · NCL ${env.lcl} m</div>
      <div class="ccost">${s.country === id ? 'Você está aqui' : s.country ? `Viagem: ${fmtMoney(tr.cost)} · ${tr.hours} h (durante a noite)` : 'Primeiro destino: grátis'}</div>`;
    card.addEventListener('click', () => {
      audio.start();
      chooseCountry(id);
    });
    grid.appendChild(card);
  }
  screen('countries');
}

async function chooseCountry(id) {
  const s = G.save;
  if (s.country && s.country !== id) {
    const tr = travelInfo(s.country, id);
    if (s.money < tr.cost) {
      $('c-status').textContent = `Dinheiro insuficiente para viajar (${fmtMoney(tr.cost)}). Cace no país atual para juntar mais.`;
      return;
    }
    s.money -= tr.cost;
  }
  s.country = id;
  persist();
  await loadCountry(id);
  showBriefing();
}

async function loadCountry(id) {
  if (G.world && G.world.country.id === id) return;
  screen('loading');
  setLoading(0, `Viajando para ${COUNTRIES[id].name}`);
  await tick();
  disposeWorld();
  const world = new World(id, G.tex, G.q);
  await world.build((p, m) => setLoading(p, m));
  addParkedCars(world);
  G.world = world;
  G.scene.add(world.group);
  G.debris.clear();
  G.tracks = [];
  setLoading(1, 'Pronto');
}

function disposeWorld() {
  if (!G.world) return;
  const shared = new Set(Object.values(G.tex));
  G.scene.remove(G.world.group);
  G.world.group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
    for (const m of mats) {
      for (const k of ['map', 'normalMap', 'roughnessMap']) if (m[k] && !shared.has(m[k])) m[k].dispose();
      m.dispose();
    }
  });
  G.world.land.colorTex.dispose();
  G.world.land.dataTex.dispose();
  G.world = null;
}

// Carros estacionados nas cidades (viram detritos com ventos de EF2+).
function addParkedCars(world) {
  const rng = new RNG(world.seed + 77);
  const geo = simpleCarGeometry('sedan');
  const geo2 = simpleCarGeometry('suv');
  const mat = patchWorld(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.35, metalness: 0.4 }), { key: 'pcar' });
  const items = [];
  for (const city of world.cities)
    for (const lot of city.lots) {
      if (lot.kind === 'used' || rng.next() > 0.38) continue;
      const side = rng.sign();
      const x = lot.x + Math.cos(lot.rot) * side * 7;
      const z = lot.z - Math.sin(lot.rot) * side * 7;
      items.push({ x, z, rot: lot.rot + (rng.chance(0.5) ? 0 : Math.PI), suv: rng.chance(0.4), col: new THREE.Color().setHSL(rng.next(), rng.range(0, 0.6), rng.range(0.15, 0.75)) });
    }
  for (const [g, list] of [
    [geo, items.filter((i) => !i.suv)],
    [geo2, items.filter((i) => i.suv)],
  ]) {
    const mesh = new THREE.InstancedMesh(g, mat, Math.max(1, list.length));
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    list.forEach((it, i) => {
      const y = world.groundAt(it.x, it.z);
      q.setFromEuler(new THREE.Euler(0, it.rot, 0));
      m.compose(new THREE.Vector3(it.x, y, it.z), q, new THREE.Vector3(1, 1, 1));
      mesh.setMatrixAt(i, m);
      mesh.setColorAt(i, it.col);
      const s = world.registry.add({ kind: 'car', di: 'car', x: it.x, z: it.z, y, r: 2.4, h: 1.5, minor: true, car: { mesh, i } });
      s.car = { mesh, i, color: it.col };
    });
    mesh.count = list.length;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    world.group.add(mesh);
  }
}

function showBriefing(fromPause = false) {
  const prevState = G.state;
  if (!fromPause) G.state = 'briefing';
  const s = G.save;
  const c = G.world.country;
  const env = G.lab ? G.env : dayEnvironment(s.calendar, c.id, s.day);
  const plan = G.lab ? G.plan : planStorms(env, G.world);
  $('b-title').textContent = `${c.flag} Previsão — ${c.region}`;
  $('b-date').textContent = G.lab ? 'Laboratório' : `Dia ${s.day} · ${c.agency}`;
  const r = RISK[env.risk];
  $('b-risk').textContent = `Risco: ${r.name}`;
  $('b-risk').style.background = r.color;
  $('b-text').textContent = forecastText(env, c);
  $('b-params').innerHTML = [
    ['CAPE', `${env.cape}`, 'J/kg'],
    ['Cisalh. 0–6 km', `${env.shear}`, 'nós'],
    ['Helicidade 0–1 km', `${env.srh}`, 'm²/s²'],
    ['NCL (base)', `${env.lcl}`, 'm'],
    ['STP', `${env.stp}`, 'índice'],
    ['Orvalho', `${env.dewpoint}`, '°C'],
  ]
    .map(([a, b, u]) => `<div><b>${b}</b><span>${a} (${u})</span></div>`)
    .join('');
  drawRiskMap($('b-map'), G.world, env, plan);
  const sel = $('b-city');
  sel.innerHTML = '';
  for (const city of G.world.cities) sel.add(new Option(city.name, city.name));
  const home = G.world.cities.slice().sort((a, b) => b.size - a.size)[0];
  sel.value = home.name;
  $('b-start').textContent = fromPause ? 'Voltar ao jogo' : 'Começar o dia';
  G.briefFromPause = fromPause;
  sel.parentElement.classList.toggle('hidden', fromPause);
  screen('briefing');
  G.state = fromPause ? prevState : 'briefing';
}

function showGarage(back) {
  G.garageBack = back;
  const s = G.save;
  $('g-money').textContent = fmtMoney(s.money);
  const list = $('g-list');
  list.innerHTML = '';
  for (const id of VEHICLE_ORDER) {
    const v = VEHICLES[id];
    const owned = s.owned.includes(id);
    const el = document.createElement('div');
    el.className = 'gcard' + (s.vehicle === id ? ' sel' : '');
    el.innerHTML = `<div class="gname">${v.name}</div><div class="gdesc">${v.desc}</div>
      <div class="gstats">Vel. máx. ${Math.round(v.maxSpeed * 3.6)} km/h · resistência ${v.health} · arrasta com ${Math.round(v.slideWind * 3.6)} km/h · levanta com ${Math.round((v.anchorWind || v.liftWind) * 3.6)} km/h</div>`;
    const b = document.createElement('button');
    if (s.vehicle === id) {
      b.textContent = 'Em uso';
      b.disabled = true;
    } else if (owned) {
      b.textContent = 'Usar';
      b.onclick = () => {
        s.vehicle = id;
        persist();
        showGarage(back);
      };
    } else {
      b.textContent = `Comprar ${fmtMoney(v.price)}`;
      b.disabled = s.money < v.price;
      b.onclick = () => {
        s.money -= v.price;
        s.owned.push(id);
        s.vehicle = id;
        persist();
        showGarage(back);
      };
    }
    el.appendChild(b);
    list.appendChild(el);
  }
  const up = $('g-upgrades');
  up.innerHTML = '';
  for (const [k, u] of Object.entries(UPGRADES)) {
    const el = document.createElement('div');
    el.className = 'gcard';
    const have = k === 'probes' ? `${s.probes} sondas extras` : k === 'repairKit' ? `${s.repairKits} kits` : s.upgrades[k] ? 'instalado' : '';
    el.innerHTML = `<div class="gname">${u.name}</div><div class="gdesc">${u.desc}</div><div class="gstats">${have}</div>`;
    const b = document.createElement('button');
    const single = k !== 'probes' && k !== 'repairKit';
    b.textContent = single && s.upgrades[k] ? 'Instalado' : `Comprar ${fmtMoney(u.price)}`;
    b.disabled = (single && s.upgrades[k]) || s.money < u.price;
    b.onclick = () => {
      s.money -= u.price;
      if (k === 'probes') s.probes += 3;
      else if (k === 'repairKit') s.repairKits += 1;
      else s.upgrades[k] = true;
      persist();
      showGarage(back);
    };
    el.appendChild(b);
    up.appendChild(el);
  }
  screen('garage');
}

function showJournal(back) {
  G.journalBack = back;
  const s = G.save || defaultSave();
  const st = s.stats;
  $('j-stats').textContent = `${st.tornadoes} tornados · ${st.intercepts} interceptações · ${st.photos} fotos · ganhos ${fmtMoney(st.earned)}`;
  const list = $('j-list');
  list.innerHTML = '';
  const items = s.journal.slice().reverse();
  if (!items.length) list.innerHTML = '<p class="muted">Nenhum registro ainda. Saia para caçar!</p>';
  for (const j of items) {
    const el = document.createElement('div');
    el.className = 'jcard';
    el.innerHTML = `${j.img ? `<img src="${j.img}" alt="">` : ''}<div><b>${j.title}</b><br>${j.text}</div>`;
    list.appendChild(el);
  }
  screen('journal');
}

function showLab() {
  G.state = 'lab-setup';
  screen('lab');
}

// ------------------------------------------------------------------ dia de caça
function makeVehicle(id) {
  if (G.vehicle) {
    G.scene.remove(G.vehicle.group);
    G.vehicle.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
  }
  const s = G.save || defaultSave();
  const model = VEHICLES[id] || VEHICLES.sedan;
  const v = new Vehicle(model, G.world.country, { lowQuality: G.q.texSize <= 256, hailGuard: s.upgrades?.hailGuard, tires: s.upgrades?.tires, seed: 11 });
  G.vehicle = v;
  G.scene.add(v.group);
  G.probesUsed = 0;
  G.envT = 0;
  return v;
}

function spawnAtCity(name) {
  const city = G.world.cities.find((c) => c.name === name) || G.world.cities[0];
  // Começa na rodovia, logo na saída da cidade (estrada livre à frente).
  let best = null;
  const want = city.radius + 60;
  for (const r of G.world.roads.roads) {
    if (r.type !== 'highway' && r.type !== 'interstate' && r.type !== 'paved') continue;
    for (let i = 0; i < r.pts.length - 1; i++) {
      const d = Math.hypot(r.pts[i][0] - city.x, r.pts[i][1] - city.z);
      const score = Math.abs(d - want) + (r.bridge?.[i] ? 500 : 0);
      if (!best || score < best.score) {
        // Aponta para fora da cidade.
        const out = Math.hypot(r.pts[i + 1][0] - city.x, r.pts[i + 1][1] - city.z) > d;
        best = { score, p: out ? r.pts[i] : r.pts[i + 1], q: out ? r.pts[i + 1] : r.pts[i] };
      }
    }
  }
  const p = best ? best.p : [city.x, city.z];
  const q = best ? best.q : [city.x + 1, city.z];
  const yaw = Math.atan2(q[0] - p[0], q[1] - p[1]);
  // Faixa da direita.
  const lane = best ? 2.2 : 0;
  G.vehicle.place(p[0] - Math.cos(yaw) * lane, p[1] + Math.sin(yaw) * lane, yaw, G.world);
  G.rig.setMode('chase');
  G.rig.yawOff = 0;
}

function startDay(cityName) {
  const s = G.save;
  G.lab = false;
  const c = G.world.country;
  G.env = dayEnvironment(s.calendar, c.id, s.day);
  G.plan = planStorms(G.env, G.world);
  G.weather = new WeatherSystem(G.world, G.env, G.plan, G.env.seed);
  G.damage = new DamageSystem(G.world, G.debris);
  G.clock = 12 * 3600;
  G.todayEarned = 0;
  G.todayCosts = 0;
  G.todaySeen = [];
  G.warnings = [];
  G.tracks = [];
  clearProbes();
  makeVehicle(s.vehicle);
  spawnAtCity(cityName);
  G.dayEnded = false;
  enterPlay();
  hud.notify(`${c.flag} ${c.name}: ${RISK[G.env.risk].name}. ${G.env.tornadoDay ? 'Ambiente favorável a tornados hoje.' : G.env.stormDay ? 'Tempestades possíveis à tarde.' : 'Dia estável — bom para estudar a região.'}`, G.env.risk >= 3 ? 'warn' : '', 9);
  if (G.env.stormDay) hud.notify('Dica: use "Avançar o tempo" no menu (Esc) para pular até as tempestades.', '', 8);
}

function enterPlay() {
  G.state = 'play';
  screen(null);
  show('hud');
  $('fps').classList.toggle('hidden', !G.settings.fps);
  applyTouchMode();
  input.clearActions();
}

function resume() {
  if (G.state !== 'play' && G.state !== 'pause') return;
  enterPlay();
}

function pauseGame() {
  if (G.state !== 'play') return;
  G.state = 'pause';
  $('p-skip').classList.toggle('hidden', G.lab);
  $('p-endday').classList.toggle('hidden', G.lab);
  $('p-forecast').classList.toggle('hidden', G.lab);
  screen('pause');
  applyTouchMode();
}

function skipToStorms() {
  const next = G.weather.pending[0];
  const active = G.weather.storms.some((s) => s.maturity > 0.2);
  if (active) {
    hud.notify('Já há tempestades ativas — não dá para pular agora.', 'warn');
    resume();
    return;
  }
  if (!next) {
    hud.notify('Nenhuma tempestade prevista para o resto do dia.', '');
    resume();
    return;
  }
  const target = next.ciClock - 15 * 60;
  if (target > G.clock) {
    // O carro "espera" estacionado; nada acontece no caminho.
    G.clock = target;
    hud.notify(`Tempo avançado para ${fmtClock(G.clock)}. As primeiras torres devem surgir em breve.`, 'good');
  }
  resume();
}

function endDay() {
  if (G.dayEnded || G.lab) return;
  G.dayEnded = true;
  const s = G.save;
  const hotel = 95;
  s.money -= hotel;
  G.todayCosts += hotel;
  const c = G.world.country;
  // O dia passa em todos os países.
  for (const id of COUNTRY_ORDER) consumeDay(s.calendar, id, s.day);
  s.day += 1;
  const seen = G.todaySeen;
  const lines = [];
  lines.push(`<p>${c.flag} ${c.name} · ${c.region}</p>`);
  if (!G.env.stormDay) lines.push('<p class="muted">Dia de tempo estável.</p>');
  else if (G.env.tornadoDay) lines.push(`<p>Dia de tornado na região (${G.plan.reduce((a, p) => a + p.tornadoes.length, 0)} previsto(s) pelo ambiente).</p>`);
  else lines.push('<p class="muted">Tempestades sem tornado (dia de "furo").</p>');
  if (seen.length) {
    lines.push('<b>Tornados observados</b><ul class="rep-list">');
    for (const t of seen) lines.push(`<li>${t}</li>`);
    lines.push('</ul>');
  }
  lines.push(`<div class="rep-grid"><span>Ganhos</span><b class="money-line">${fmtMoney(G.todayEarned)}</b><span>Despesas (hotel, combustível, consertos)</span><b>${fmtMoney(-G.todayCosts)}</b><span>Saldo</span><b>${fmtMoney(s.money)}</b></div>`);
  $('d-title').textContent = `Fim do dia ${s.day - 1}`;
  $('d-body').innerHTML = lines.join('');
  G.state = 'dayend';
  hide('hud');
  screen('dayend');
  applyTouchMode();
  persist();
}

// ------------------------------------------------------------------ laboratório
async function startLab() {
  const id = $('l-country').value;
  G.lab = true;
  if (!G.save) G.save = defaultSave();
  await loadCountry(id);
  const world = G.world;
  const hour = +$('l-hour').value;
  const carga = +$('l-carga').value;
  const ef = +$('l-ef').value;
  const shape = $('l-shape').value;
  const hp = $('l-hp').checked;
  const c = world.country;
  const env = dayEnvironment(G.save.calendar, id, 999);
  Object.assign(env, { stormDay: true, tornadoDay: true, carga, hp, lp: false, risk: 5, cape: 3200, srh: 320, shear: 50, lcl: shape === 'rope' ? 1300 : 800, stp: 4 });
  G.env = env;
  // Jogador numa estrada; tempestade madura chegando para formar o tornado à frente.
  makeVehicle($('l-car').value);
  const city = world.cities.slice().sort((a, b) => b.size - a.size)[0];
  spawnAtCity(city.name);
  const v = G.vehicle;
  const dir = (env.motionDir * Math.PI) / 180;
  const vx = Math.sin(dir) * env.motionSpeed;
  const vz = -Math.cos(dir) * env.motionSpeed;
  // Ponto do toque: ~3 km à frente-lado do jogador, num campo.
  let tx = v.x + 2600;
  let tz = v.z - 1200;
  for (let k = 0; k < 40; k++) {
    const a = k * 0.7;
    const r = 2600 + k * 60;
    const x = v.x + Math.cos(a) * r;
    const z = v.z + Math.sin(a) * r;
    if (Math.abs(x) < 11000 && Math.abs(z) < 11000 && world.land.isOpenField(x, z)) {
      tx = x;
      tz = z;
      break;
    }
  }
  const lead = 75;
  const plan = [
    {
      id: 0,
      ciClock: hour * 3600 - 950 * CLOCK_SCALE - 1,
      x: tx - vx * (950 + lead),
      z: tz - vz * (950 + lead),
      vx,
      vz,
      target: { x: tx, z: tz },
      tornadic: true,
      tornadoes: [{ ef, delay: lead, carga }],
      matureDelay: 950,
      hp,
      lp: false,
      life: 4000,
      funnelOnly: false,
    },
  ];
  G.plan = plan;
  G.clock = hour * 3600;
  G.weather = new WeatherSystem(world, env, plan, 1234);
  G.weather.onFunnelHook = (t) => labShape(t, shape);
  G.damage = new DamageSystem(world, G.debris);
  G.warnings = [];
  G.tracks = [];
  clearProbes();
  G.dayEnded = false;
  enterPlay();
  hud.notify('Laboratório: uma supercélula madura está chegando. O tornado deve tocar o solo em cerca de 1–2 minutos.', 'warn', 10);
  hud.notify('Use Q para olhar para a tempestade e C para trocar a câmera.', '', 8);
}

function labShape(t, shape) {
  const H = t.heightNow();
  const set = (o) => Object.assign(t, o);
  switch (shape) {
    case 'rope':
      set({ Rpeak: 14, coneness: 0.2, vness: 0, multiness: 0, ropeness: 1, growth: 0 });
      break;
    case 'cone':
      set({ Rpeak: Math.max(45, H * 0.06), coneness: 1, vness: 0, multiness: 0, growth: 0 });
      break;
    case 'cylinder':
      set({ Rpeak: H * 0.17, coneness: 0.1, vness: 0, multiness: 0.1, growth: 0 });
      break;
    case 'vshape':
      set({ Rpeak: H * 0.1, vness: 1, coneness: 0.6, multiness: 0, growth: 0 });
      break;
    case 'wedge':
      set({ Rpeak: H * 0.62, multiness: 0.2, vness: 0, growth: 0.4 });
      break;
    case 'multi':
      set({ Rpeak: H * 0.28, multiness: 1, vness: 0, growth: 0.2 });
      break;
    case 'mass':
      set({ Rpeak: H * 0.9, multiness: 0.3, vness: 0, growth: 2.8, duration: t.duration * 1.6 });
      break;
  }
}

// ------------------------------------------------------------------ eventos
function handleWeatherEvents() {
  const w = G.weather;
  const v = G.vehicle;
  for (const e of w.events) {
    if (e.type === 'ci') {
      const d = Math.hypot(e.storm.x - v.x, e.storm.z - v.z);
      hud.notify(`Iniciação: torre crescendo a ${fmtDist(d)} para ${compass(bearingDeg(e.storm.x - v.x, e.storm.z - v.z))}.`, '', 7);
    } else if (e.type === 'svr') {
      addWarning(e.storm, 'svr');
      hud.notify(`Alerta de tempestade severa: granizo de até ${e.storm.hailSize.toFixed(1)} cm.`, 'warn', 7);
    } else if (e.type === 'warning') {
      addWarning(e.storm, 'tor');
      audio.alert();
      hud.notify(`⚠ ${G.world.country.alertName}: rotação forte em ${e.storm.name}. Abrigue-se!`, 'danger', 9);
    } else if (e.type === 'funnel') {
      if (w.onFunnelHook) w.onFunnelHook(e.tornado);
      e.tornado.name = tornadoName(e.tornado);
      const d = Math.hypot(e.tornado.x - v.x, e.tornado.z - v.z);
      if (d < 20000) hud.notify(`Nuvem funil descendo a ${fmtDist(d)} ${compass(bearingDeg(e.tornado.x - v.x, e.tornado.z - v.z))}!`, 'warn', 7);
    } else if (e.type === 'touchdown') {
      const t = e.tornado;
      t.name = tornadoName(t);
      t.shapesSeen = new Set();
      t.ratingSoFar = -1;
      const d = Math.hypot(t.x - v.x, t.z - v.z);
      hud.notify(`🌪️ TORNADO NO SOLO: ${t.name} (${fmtDist(d)} ${compass(bearingDeg(t.x - v.x, t.z - v.z))}).`, 'danger', 10);
      audio.alert();
    } else if (e.type === 'tornadoEnd') {
      onTornadoEnd(e.tornado);
    } else if (e.type === 'flash') {
      const f = e.flash;
      const d = Math.hypot(f.x - v.x, f.z - v.z);
      if (f.cg && d < 30000) G.lightning.spawn(f, G.camera);
      audio.thunder(Math.hypot(d, f.y - v.y), f.power * (f.cg ? 1 : 0.6));
    }
  }
  w.events.length = 0;
  for (const e of G.damage.popEvents()) {
    if (e.type === 'powerflash') {
      G.powerFlash = { x: e.x, y: e.y, z: e.z, t: 0.35 };
      audio.zap(Math.hypot(e.x - v.x, e.z - v.z));
    } else if (e.type === 'damage') {
      const t = e.tornado;
      t.ratingSoFar = Math.max(t.ratingSoFar ?? -1, e.ef);
      if (e.struct.car) {
        const c = e.struct.car;
        if (e.dod.state >= 2) {
          const m = new THREE.Matrix4().makeScale(0, 0, 0);
          c.mesh.setMatrixAt(c.i, m);
          c.mesh.instanceMatrix.needsUpdate = true;
        }
      }
    }
  }
}

function tornadoName(t) {
  const n = G.world.nearestCity(t.x, t.z);
  return n ? `Tornado de ${n.city.name}` : 'Tornado';
}

function onTornadoEnd(t) {
  const rep = surveyReport(t);
  G.tracks.push({ path: t.path.slice() });
  const v = G.vehicle;
  const seenIt = t.seen;
  const s = G.save;
  let reward = 0;
  if (!G.lab && seenIt) {
    s.stats.tornadoes += 1;
    s.stats.byCountry[G.world.country.id] = (s.stats.byCountry[G.world.country.id] || 0) + 1;
    s.stats.maxEF = Math.max(s.stats.maxEF, rep.rating);
    G.todaySeen.push(`${t.name}: EF${rep.rating} oficial, ${rep.pathKm.toFixed(1)} km, ${[...(t.shapesSeen || [])].map((x) => x).length} formato(s)`);
    s.journal.push({ title: `${t.name} — EF${rep.rating}`, text: `${G.world.country.flag} Dia ${s.day} · trajetória ${rep.pathKm.toFixed(1)} km, largura ${fmtDist(rep.maxWidth)}, vento real ${rep.peakKmh} km/h.`, img: null });
  }
  hud.notify(`${t.name} se dissipou. Levantamento: EF${rep.rating}.`, 'good', 8);
  G.pendingReports.push({ rep, t, reward });
  const otherClose = G.weather.tornadoes.some((x) => x !== t && x.onGround && Math.hypot(x.x - v.x, x.z - v.z) < 12000);
  if (!otherClose && G.state === 'play') showNextReport();
}

function showNextReport() {
  const r = G.pendingReports.shift();
  if (!r) return resume();
  $('r-title').textContent = `Levantamento de danos — ${r.t.name}`;
  efBadge($('r-badge'), r.rep.rating);
  $('r-body').innerHTML = renderReport(r.rep, r.t, r.reward ? `+ ${fmtMoney(r.reward)}` : '');
  G.state = 'pause';
  screen('report');
  applyTouchMode();
}

function addWarning(storm, type) {
  const fx = storm.dirX;
  const fz = storm.dirZ;
  const rx = -fz;
  const rz = fx;
  const w0 = 4500;
  const w1 = 9000;
  const L = 26000;
  const bx = storm.x - fx * 3000;
  const bz = storm.z - fz * 3000;
  const poly = [
    [bx + rx * w0, bz + rz * w0],
    [bx + fx * L + rx * w1, bz + fz * L + rz * w1],
    [bx + fx * L - rx * w1, bz + fz * L - rz * w1],
    [bx - rx * w0, bz - rz * w0],
  ];
  G.warnings = G.warnings.filter((w) => !(w.storm === storm && w.type === type));
  G.warnings.push({ storm, type, poly, until: G.clock + 45 * 60 });
}

function inWarning(x, z, type) {
  return G.warnings.some((w) => (!type || w.type === type) && pointInPoly(x, z, w.poly));
}

// ------------------------------------------------------------------ ações do jogador
G.probesLeft = () => {
  const v = G.vehicle;
  if (!v) return 0;
  return Math.max(0, (v.model.probes || 0) + (G.save?.probes || 0) - (G.probesUsed || 0));
};

function clearProbes() {
  G.probes = [];
  while (G.probeGroup.children.length) G.probeGroup.remove(G.probeGroup.children[0]);
}

function deployProbe() {
  const v = G.vehicle;
  if (G.probesLeft() <= 0) return hud.notify('Sem sondas. Compre na garagem (picape e blindado já vêm com algumas).', '', 5);
  if (v.speed > 3) return hud.notify('Pare o carro para soltar a sonda.', '', 3);
  G.probesUsed = (G.probesUsed || 0) + 1;
  if (!G.lab && v.model.probes && G.probesUsed > v.model.probes) G.save.probes = Math.max(0, G.save.probes - 1);
  const x = v.x - Math.sin(v.yaw) * 4;
  const z = v.z - Math.cos(v.yaw) * 4;
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 0.22, 10), new THREE.MeshStandardMaterial({ color: '#e0a020', metalness: 0.4, roughness: 0.5 }));
  mesh.position.set(x, G.world.groundAt(x, z) + 0.1, z);
  G.probeGroup.add(mesh);
  G.probes.push({ x, z, mesh, hit: false, peak: 0, tornado: null, done: false });
  hud.notify('Sonda posicionada. Saia do caminho!', 'warn', 4);
  audio.beep(520, 0.1, 0.05);
}

function updateProbes() {
  const w = G.weather;
  const tmp = { x: 0, y: 0, z: 0 };
  for (const p of G.probes) {
    if (p.done) continue;
    for (const t of w.tornadoes) {
      if (!t.onGround) continue;
      const d = Math.hypot(t.x - p.x, t.z - p.z);
      if (d < Math.max(t.Rcore * 1.3, 22)) {
        t.windAt(p.x, 1, p.z, tmp);
        const sp = Math.hypot(tmp.x, tmp.z);
        if (sp > p.peak) p.peak = sp;
        p.hit = true;
        p.tornado = t;
      } else if (p.hit && p.tornado === t && d > Math.max(t.Rcore * 2.5, 60)) {
        p.done = true;
        const m = p.peak;
        t.survey.measured = Math.max(t.survey.measured || 0, m);
        t.measured = t.survey.measured;
        const reward = Math.round(500 + m * 40);
        earn(reward, `Sonda atingida! Rajada medida: ${Math.round(m * MS_TO_KMH)} km/h`);
        p.mesh.material.color.set('#64e0a0');
      }
    }
  }
}

function earn(v, text) {
  if (G.lab) {
    hud.notify(text, 'good', 6);
    return;
  }
  G.save.money += v;
  G.save.stats.earned += v;
  G.todayEarned += v;
  hud.notify(`${text} (+${fmtMoney(v)})`, 'good', 7);
  audio.beep(990, 0.12, 0.05);
}

function spend(v, text) {
  if (G.lab) return true;
  if (G.save.money < v) {
    hud.notify('Dinheiro insuficiente.', 'warn');
    return false;
  }
  G.save.money -= v;
  G.todayCosts += v;
  if (text) hud.notify(`${text} (−${fmtMoney(v)})`, '', 5);
  return true;
}

function visibleTornado(maxD = 16000) {
  const v = G.vehicle;
  let best = null;
  for (const t of G.weather.tornadoes) {
    const d = Math.hypot(t.x - v.x, t.z - v.z);
    if (d > maxD) continue;
    const vis = Math.exp(-d / Math.max(1500, G.vis)) * (1 - t.render.rainWrap * 0.65) * (1 - G.shade.rain * 0.5) * (G.sky.night > 0.5 ? (G.weather.flash.w > 0.3 ? 0.8 : 0.15) : 1);
    if (!best || d < best.d) best = { t, d, vis };
  }
  return best;
}

function takePhoto() {
  audio.shutter();
  $('flashfx').style.transition = 'none';
  $('flashfx').style.opacity = 0.6;
  setTimeout(() => {
    $('flashfx').style.transition = 'opacity 0.35s';
    $('flashfx').style.opacity = 0;
  }, 30);
  G.photoPending = true;
}

// Avalia a foto logo depois de renderizar o quadro.
function scorePhoto() {
  const v = G.vehicle;
  const cam = G.camera;
  const vt = visibleTornado(20000);
  let text = 'Foto da paisagem';
  let value = 0;
  let title = 'Foto';
  if (vt) {
    const t = vt.t;
    const p = new THREE.Vector3(t.x, t.render.y + Math.min(t.render.H * 0.35, 300), t.z).project(cam);
    const inFrame = p.z < 1 && Math.abs(p.x) < 0.9 && Math.abs(p.y) < 0.9;
    if (inFrame && vt.vis > 0.05) {
      const center = 1.25 - Math.min(0.5, Math.hypot(p.x, p.y) * 0.5);
      const d = vt.d;
      const distK = d < 200 ? 1.8 : d < 2500 ? 1.5 - d / 5000 : Math.max(0.15, 1 - (d - 2500) / 12000);
      const rare = { rope: 1.2, cone: 1, cylinder: 1.1, vshape: 1.35, wedge: 1.5, multi: 1.6, mass: 2.6, funnel: 0.4, dust: 0.6 }[t.label] || 1;
      const ground = t.onGround ? 1 : 0.35;
      const base = 260 + 160 * t.efTrue;
      value = Math.round(base * rare * distK * center * Math.min(1, vt.vis * 1.4) * ground * (G.save.upgrades.camera ? 1.4 : 1));
      if (t.photographedShapes?.has(t.label)) value = Math.round(value * 0.25);
      t.photographedShapes = t.photographedShapes || new Set();
      t.photographedShapes.add(t.label);
      title = `${t.onGround ? t.name : 'Nuvem funil'} — ${t.shapeName}`;
      text = `${fmtDist(d)} · ${t.shapeName}`;
    }
  } else {
    const ns = G.weather.nearestStorm(v.x, v.z);
    if (ns && ns.s.meso > 0.5 && ns.d < 15000) {
      value = 60;
      title = 'Estrutura da supercélula';
      text = 'nuvem parede e mesociclone';
    }
  }
  let img = null;
  try {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 180;
    c.getContext('2d').drawImage(G.renderer.domElement, 0, 0, 320, 180);
    img = c.toDataURL('image/jpeg', 0.7);
  } catch (e) {}
  if (!G.lab) {
    G.save.stats.photos += 1;
    G.save.journal.push({ title: `📷 ${title}`, text: `${G.world.country.flag} Dia ${G.save.day}, ${fmtClock(G.clock)} · ${text}`, img });
  }
  if (value > 0) earn(value, `Foto vendida à agência: ${title}`);
  else hud.notify('Foto salva no diário (sem tornado no quadro).', '', 4);
}

function reportTornado() {
  const vt = visibleTornado(14000);
  if (!vt || !vt.t.onGround) return hud.notify('Nenhum tornado à vista para relatar.', '', 4);
  const t = vt.t;
  if (t.reported) return hud.notify('Esse tornado já foi confirmado.', '', 4);
  t.reported = true;
  earn(Math.round(300 + 200 * Math.max(0, 1 - t.age / 120)), `Relato enviado ao ${G.world.country.agency}: ${t.name} confirmado`);
}

function toggleScan() {
  const v = G.vehicle;
  if (!v.model.scanner) return hud.notify('Só a Van Radar Doppler tem o radar móvel.', '', 4);
  if (v.speed > 1) return hud.notify('Pare a van para escanear.', '', 3);
  v.scanning = !v.scanning;
  G.scanT = 0;
}

function updateScan(dt) {
  const v = G.vehicle;
  if (!v.scanning) return;
  if (v.speed > 1) {
    v.scanning = false;
    return;
  }
  const vt = visibleTornado(11000);
  if (!vt || !vt.t.onGround) {
    G.scanT = 0;
    return;
  }
  G.scanT += dt;
  if (G.scanT >= 6) {
    v.scanning = false;
    const t = vt.t;
    if (t.scanned) return hud.notify('Esse tornado já foi escaneado.', '', 4);
    t.scanned = true;
    const m = t.Vmax * (0.97 + Math.random() * 0.06);
    t.survey.measured = Math.max(t.survey.measured || 0, m);
    t.measured = t.survey.measured;
    earn(Math.round(1500 + m * 45), `Radar móvel: ventos de ${Math.round(m * MS_TO_KMH)} km/h em ${t.name}`);
  }
}

function interact() {
  const v = G.vehicle;
  if (v.speed > 1) return;
  const near = G.world.registry.near(v.x, v.z, 45).find((s) => s.kind === 'gas' && s.state < 3);
  if (near) {
    const liters = v.model.fuel - v.fuel;
    const fuelCost = Math.round(liters * 1.5);
    const rep = v.maxHealth - v.health;
    const repCost = Math.round(rep * 14);
    if (liters > 1 && spend(fuelCost, `Tanque cheio (${Math.round(liters)} L)`)) v.fuel = v.model.fuel;
    if (rep > 1 && spend(repCost, 'Conserto no posto')) v.health = v.maxHealth;
    if (liters <= 1 && rep <= 1) hud.notify('Tanque cheio e carro inteiro.', '', 3);
    return;
  }
  if (G.save.repairKits > 0 && v.health < v.maxHealth * 0.9) {
    G.save.repairKits -= 1;
    v.health = Math.min(v.maxHealth, v.health + v.maxHealth * 0.4);
    hud.notify('Kit de reparo usado.', 'good');
    return;
  }
  hud.notify('Pare num posto de combustível para abastecer e consertar (E).', '', 4);
}

function lookAtTornado() {
  const v = G.vehicle;
  const vt = G.weather.nearestTornado(v.x, v.z);
  if (vt && vt.d < 25000) {
    const t = vt.t;
    G.rig.lookAtWorld(t.x, t.render.y + Math.min(250, t.render.H * 0.3), t.z, v);
    return;
  }
  const ns = G.weather.nearestStorm(v.x, v.z);
  if (ns) G.rig.lookAtWorld(ns.s.x, ns.s.base, ns.s.z, v);
}

// ------------------------------------------------------------------ acidente
function onWrecked(cause) {
  const s = G.save;
  const tossed = cause === 'tornado';
  const v = G.vehicle;
  let text;
  if (tossed) text = 'O vento levantou o carro e o arremessou. Você foi levado ao hospital com ferimentos leves.';
  else if (cause === 'granizo') text = 'O granizo destruiu o carro. Ele foi rebocado para a cidade mais próxima.';
  else text = 'O carro ficou sem condições de rodar e foi rebocado.';
  let cost = 0;
  if (!G.lab) {
    cost = tossed ? 1600 : 700;
    s.money -= cost;
    G.todayCosts += cost;
    s.stats.wrecks += 1;
    if (tossed && v.model.id !== 'sedan') {
      s.owned = s.owned.filter((id) => id !== v.model.id);
      if (!s.owned.length) s.owned = ['sedan'];
      if (!s.owned.includes('sedan')) s.owned.push('sedan');
      s.vehicle = s.owned.includes('sedan') ? 'sedan' : s.owned[0];
      text += ` O ${v.model.name} foi perdido.`;
    }
  }
  $('death-title').textContent = tossed ? 'O tornado pegou você' : 'Carro destruído';
  $('death-text').textContent = text + (cost ? ` Custos: ${fmtMoney(cost)}.` : '');
  G.state = 'pause';
  screen('death');
  applyTouchMode();
}

function afterWreck() {
  const v = G.vehicle;
  const near = G.world.nearestCity(v.x, v.z);
  makeVehicle(G.lab ? v.model.id : G.save.vehicle);
  spawnAtCity(near.city.name);
  persist();
  enterPlay();
}

// ------------------------------------------------------------------ mapa
function openMap() {
  G.mapOpen = true;
  G.prevState = G.state;
  G.state = 'pause';
  screen('mapview');
  drawMap($('map-canvas'), G.world, G.weather, G.vehicle, G.tracks.concat(G.weather.tornadoes.filter((t) => t.onGround).map((t) => ({ path: t.path }))), G.warnings);
  $('map-legend').innerHTML = `<b>${G.world.country.flag} ${G.world.country.region}</b><br>🔵 você · 🔺 tornado · linhas vermelhas: trilhas de danos · polígonos: alertas`;
  applyTouchMode();
}

function closeMap() {
  G.mapOpen = false;
  enterPlay();
}

// ------------------------------------------------------------------ laço principal
let last = performance.now();
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  G.time += dt;
  G.frame++;
  if (G.state === 'play') {
    try {
      update(dt);
    } catch (e) {
      console.error(e);
    }
  }
  if (G.world && G.vehicle && G.weather && (G.state === 'play' || G.state === 'pause' || G.state === 'dayend')) {
    render(dt);
  } else if (G.state === 'menu' || G.state === 'countries' || G.state === 'lab-setup' || G.state === 'briefing') {
    G.renderer.setRenderTarget(null);
    G.renderer.setClearColor(0x06090c, 1);
    G.renderer.clear();
  }
  input.endFrame();
}

function handleActions() {
  const a = (n) => input.consumeAction(n);
  const v = G.vehicle;
  if (a('menu')) return pauseGame();
  if (a('map')) return openMap();
  if (a('camera')) {
    G.rig.next();
    hud.notify(`Câmera: ${CAM_NAMES[G.rig.mode]}`, '', 2);
  }
  if (a('photo')) takePhoto();
  if (a('radar')) G.radar.toggleMode();
  if (a('zoomRadar')) G.radar.cycleRange();
  if (a('probe')) deployProbe();
  if (a('scan')) toggleScan();
  if (a('report')) reportTornado();
  if (a('lights')) v.lights = !v.lights;
  if (a('interact')) interact();
  if (a('lookTornado') || input.hit.has('KeyQ')) lookAtTornado();
  if (a('anchor')) {
    if (!v.model.anchors) hud.notify('Âncoras só no Interceptador Blindado.', '', 3);
    else if (v.speed > 1) hud.notify('Pare para baixar as âncoras.', '', 3);
    else {
      v.anchored = !v.anchored;
      hud.notify(v.anchored ? 'Âncoras hidráulicas fixadas no solo.' : 'Âncoras recolhidas.', 'warn', 3);
    }
  }
  if (a('warp')) {
    const danger = G.weather.tornadoes.some((t) => Math.hypot(t.x - v.x, t.z - v.z) < 15000) || G.shade.rain > 0.3;
    if (danger) {
      G.warp = 1;
      hud.notify('Não dá para acelerar o tempo com tornado ou chuva forte por perto.', 'warn', 3);
    } else {
      G.warp = G.warp >= 8 ? 1 : G.warp * 2;
    }
  }
  if (a('hud')) $('hud').classList.toggle('hidden');
  v.horn = input.key('KeyH');
}

function update(dt) {
  handleActions();
  if (G.state !== 'play') return;
  const v = G.vehicle;
  const w = G.weather;
  // Aceleração do tempo é cancelada perto de perigo.
  if (G.warp > 1) {
    const danger = w.tornadoes.some((t) => Math.hypot(t.x - v.x, t.z - v.z) < 15000) || G.shade.rain > 0.3;
    if (danger) {
      G.warp = 1;
      hud.notify('Tempo normal: tempestade por perto.', 'warn', 3);
    }
  }
  const pdt = dt * G.warp;
  G.clock += pdt * CLOCK_SCALE;
  const ctrl = input.driveAxes();
  if (v.anchored) {
    ctrl.throttle = 0;
  }
  v.braking = ctrl.brake > 0 && v.forwardSpeed > 0.5;
  // O tempo físico pode ser subdividido para estabilidade.
  const steps = Math.ceil(pdt / 0.034);
  for (let i = 0; i < steps; i++) {
    const sdt = pdt / steps;
    v.update(sdt, ctrl, G.world, w, G.debris, G.wet);
    w.update(sdt, G.clock);
  }
  G.damage.update(pdt, w.tornadoes, G.time);
  G.debris.update(pdt, w, G.world);
  handleWeatherEvents();
  for (const e of v.events) {
    if (e.type === 'tossed') hud.notify('O CARRO ESTÁ SENDO LEVANTADO!', 'danger', 4);
    if (e.type === 'wrecked') {
      v.events.length = 0;
      return onWrecked(e.cause);
    }
  }
  v.events.length = 0;
  updateProbes();
  updateScan(dt);
  audio.horn(v.horn);
  // Tornado em foco (mais próximo) e "visto".
  const nt = w.nearestTornado(v.x, v.z);
  G.focusTornado = nt && nt.d < 30000 ? nt : null;
  if (nt) {
    const t = nt.t;
    if (t.onGround) {
      t.shapesSeen = t.shapesSeen || new Set();
      t.shapesSeen.add(t.label);
      if (nt.d < 20000 && !t.seen) t.seen = true;
      if (nt.d < 3000 && !t.intercepted && !G.lab) {
        t.intercepted = true;
        G.save.stats.intercepts += 1;
        earn(Math.round(250 + t.efTrue * 120), `Interceptação! Você está a ${fmtDist(nt.d)} de ${t.name}`);
      }
    }
  }
  // Alertas expiram.
  G.warnings = G.warnings.filter((x) => x.until > G.clock && w.storms.includes(x.storm));
  // Fim do dia.
  if (!G.lab && G.clock > 21.75 * 3600 && !G.dayEnded) {
    const active = w.tornadoes.some((t) => t.onGround);
    if (!active) endDay();
  }
  if (G.lab && w.storms.length === 0 && !G.labDone) {
    G.labDone = true;
    hud.notify('A tempestade se dissipou. Volte ao menu para gerar outra.', '', 8);
  }
  hud.tick(dt);
}

const _sunDir = new THREE.Vector3();
let shadowT = 0;
function render(dt) {
  const v = G.vehicle;
  const w = G.weather;
  const world = G.world;
  const look = input.consumeLook();
  const sens = G.settings.sens;
  look.x *= sens;
  look.y *= sens;
  if (G.state === 'play') G.rig.update(dt, v, look, world);
  // Na câmera do motorista, mostra o interior e esconde a cabine vista de fora.
  const inside = G.rig.mode === 'cockpit';
  v.v.interior.visible = inside;
  v.v.cabin.visible = !inside;
  const cam = G.camera;
  cam.updateMatrixWorld();
  // Céu e luz na posição da câmera.
  const c = world.country;
  const dayT = G.clock % 86400;
  G.sky.update(dayT, c.lat, seasonDecl(c.hemisphere), G.shade);
  _sunDir.copy(G.sky.night > 0.5 ? G.sky.moonDir : G.sky.sunDir);
  const sh = w.skyShade(cam.position.x, cam.position.y, cam.position.z, _sunDir);
  G.shade.sun = damp(G.shade.sun, sh.sun, 2, dt);
  G.shade.sky = damp(G.shade.sky, sh.sky, 1, dt);
  G.shade.cover = sh.cover;
  G.shade.rain = damp(G.shade.rain, sh.rain, 1.5, dt);
  G.shade.hail = sh.hail;
  G.shade.tint = sh.hail;
  G.hailSize = w.hailAt(v.x, v.z).size;
  G.wet = clamp(G.wet + (G.shade.rain > 0.15 ? dt * 0.08 * G.shade.rain : -dt * 0.004), 0, 1);
  // Volume: tempestades e tornados.
  const vol = G.volume;
  const s = vol.shared;
  s.uTime.value = G.time;
  s.uSunDir.value.copy(_sunDir);
  s.uSunCol.value.copy(G.sky.sunColor);
  if (G.sky.night > 0.5) s.uSunCol.value.setRGB(0.05, 0.06, 0.09);
  s.uAmbSky.value.copy(G.sky.ambSky);
  s.uAmbGnd.value.copy(G.sky.ambGround);
  const vis = lerp(26000, 2600, Math.pow(G.shade.rain, 1.3)) * (1 - G.wet * 0.1);
  G.vis = vis;
  const haze = G.sky.haze.clone().multiplyScalar(0.62 * (0.4 + 0.6 * G.shade.sky));
  s.uHaze.value.copy(haze);
  s.uVis.value = vis;
  s.uGround.value = world.groundAt(clamp(cam.position.x, -11900, 11900), clamp(cam.position.z, -11900, 11900));
  s.uBase.value = w.baseAt(cam.position.x, cam.position.z);
  s.uCover.value = w.cover;
  s.uWindOff.value.set(w.windOff.x, w.windOff.z);
  s.uFlash.value.set(w.flash.x, w.flash.y, w.flash.z, w.flash.w);
  // Ordena: tempestades mais próximas primeiro (o shader usa até 4).
  const storms = w.storms.slice().sort((a, b) => Math.hypot(a.x - cam.position.x, a.z - cam.position.z) - Math.hypot(b.x - cam.position.x, b.z - cam.position.z));
  const tors = w.tornadoes.slice().sort((a, b) => Math.hypot(a.x - cam.position.x, a.z - cam.position.z) - Math.hypot(b.x - cam.position.x, b.z - cam.position.z));
  vol.setWeather(storms, tors);
  shadowT -= dt;
  if (shadowT <= 0) {
    shadowT = 0.5;
    SHARED.uCloudShadow.value = vol.renderShadow(G.renderer);
  }
  SHARED.uWet.value = G.wet;
  SHARED.uFlash.value = w.flash.w * 0.6 + (G.powerFlash ? G.powerFlash.t * 2 : 0);
  SHARED.uTime.value = G.time;
  const amb = w.windAt(v.x, 10, v.z, { x: 0, y: 0, z: 0 });
  const ws = Math.hypot(amb.x, amb.z) || 1;
  SHARED.uWind.value.set(amb.x / ws, amb.z / ws, ws, 0);
  if (tors[0]) SHARED.uTor0.value.set(tors[0].x, tors[0].z, Math.max(30, tors[0].Rcore * 2), tors[0].onGround ? clamp(tors[0].Vmax / 25, 0, 3) : 0);
  else SHARED.uTor0.value.set(0, 0, 1, 0);
  SHARED.uTor0b.value.set(c.hemisphere, 0, 0, 0);
  if (G.powerFlash) {
    G.powerFlash.t -= dt;
    if (G.powerFlash.t <= 0) G.powerFlash = null;
  }
  updateEnvironment(dt);
  // Sombra do sol acompanha o carro.
  const L = G.sky.sunLight;
  L.target.position.set(v.x, v.y, v.z);
  L.position.set(v.x + _sunDir.x * 600, v.y + Math.max(80, _sunDir.y * 600), v.z + _sunDir.z * 600);
  L.target.updateMatrixWorld();
  // Exposição automática (olho/câmera se adaptando ao escuro da tempestade).
  // Exposição automática pela luminância medida da imagem (como um fotômetro).
  const lum = (col) => col.r * 0.2126 + col.g * 0.7152 + col.b * 0.0722;
  const meas = G.pipeline.avgLum;
  // Alvo baixo: cenas de tempestade ficam escuras e dramáticas, como nas fotos reais.
  const expT = clamp(0.13 / Math.pow(Math.max(meas, 0.002), 0.82), 0.45, 2.8);
  G.exposure = damp(G.exposure, expT, 1.2, dt);
  // Partículas e efeitos.
  G.lightning.update(dt);
  const depth = G.pipeline.sceneRT?.depthTexture;
  const light = clamp(0.35 + lum(G.sky.ambSky) * 1.4, 0.25, 0.9);
  G.precip.update(dt, cam, depth, G.shade.rain, G.shade.hail, amb, light);
  world.update(G.time, ws);
  G.radarT = (G.radarT || 0) - dt;
  if (G.radarT <= 0) {
    G.radar.draw(w, world, v, G.clock, 0.1 - G.radarT, G.warnings);
    G.radarT = 0.1;
  }
  // Composição.
  const night = G.sky.night;
  G.pipeline.render(G.scene, cam, vol, {
    uSunDir: _sunDir,
    uSunCol: s.uSunCol.value,
    uMoonDir: G.sky.moonDir,
    uZenith: G.sky.zenith,
    uHorizon: G.sky.horizon.clone().multiplyScalar(0.55 + 0.45 * G.shade.sky),
    uHaze: haze,
    uNight: night,
    uVis: vis,
    uGround: s.uGround.value,
    uExposure: G.exposure,
    uTime: G.time,
    uFlash: Math.min(1, w.flash.w * 0.25),
    uSat: lerp(0.95, 0.75, G.shade.cover),
    uGreen: G.shade.hail * 0.6,
    uFade: 0,
    uRainLens: G.rig.mode === 'cockpit' || G.rig.mode === 'hood' ? 0 : G.shade.rain,
    uDamage: G.state === 'play' ? clamp(1 - v.health / v.maxHealth - 0.5, 0, 0.5) : 0,
  });
  if (G.photoPending) {
    G.photoPending = false;
    scorePhoto();
  }
  // Som.
  const nt = G.focusTornado;
  const inCity = world.nearestCity(v.x, v.z);
  const siren = c.sirens && inCity && inCity.d < inCity.city.radius + 600 && inWarning(inCity.city.x, inCity.city.z, 'tor') ? 1 : 0;
  audio.update(dt, {
    wind: v.wind,
    rain: G.shade.rain,
    hail: G.shade.hail,
    hailSize: G.hailSize,
    speed: v.speed,
    throttle: input.driveAxes().throttle,
    driving: true,
    offroad: v.surface && v.surface.kind !== 'road',
    inside: G.rig.mode === 'cockpit',
    tornado: nt ? { vmax: nt.t.onGround ? nt.t.Vmax : nt.t.Vmax * 0.3, dist: nt.d } : null,
    siren,
  });
  if (v.wind > 25) G.rig.shake = Math.max(G.rig.shake, (v.wind - 25) * 0.004);
  if (v.debrisHit > 0) G.rig.shake = Math.max(G.rig.shake, 0.15);
  // HUD (10 Hz).
  G.hudT = (G.hudT || 0) - dt;
  if (G.hudT <= 0 && G.state === 'play') {
    G.hudT = 0.1;
    for (const t of w.tornadoes) if (t.onGround && t.ratingSoFar === undefined) t.ratingSoFar = -1;
    hud.update(G);
    $('radar-label').textContent = `${G.radar.mode === 'refl' ? 'Refletividade' : 'Velocidade radial'} · ${G.radar.range / 1000} km · ${world.country.radar.name}`;
    const vf = $('viewfinder');
    vf.classList.toggle('hidden', G.rig.mode !== 'tripod');
    if (G.settings.fps) $('fps').textContent = `${Math.round(1 / Math.max(1e-3, G.avgDt || dt))} FPS · escala ${G.pipeline.scale.toFixed(2)} · detritos ${G.debris.count()}`;
    const near = world.registry.near(v.x, v.z, 45).find((x) => x.kind === 'gas' && x.state < 3);
    const pr = $('prompt');
    if (near && v.speed < 2) {
      pr.textContent = 'E — abastecer e consertar';
      pr.classList.remove('hidden');
    } else pr.classList.add('hidden');
  }
  dynamicResolution(dt);
}

function dynamicResolution(dt) {
  G.avgDt = G.avgDt ? G.avgDt * 0.95 + dt * 0.05 : dt;
  if (!G.settings.dynamic || G.state !== 'play') return;
  if (G.avgDt > 1 / 42) {
    G.slowT += dt;
    G.fastT = 0;
  } else if (G.avgDt < 1 / 58) {
    G.fastT += dt;
    G.slowT = 0;
  } else {
    G.slowT = 0;
    G.fastT = 0;
  }
  if (G.slowT > 1.5 && G.pipeline.scale > 0.55) {
    G.pipeline.setScale(Math.max(0.55, G.pipeline.scale - 0.1));
    G.slowT = 0;
  } else if (G.fastT > 4 && G.pipeline.scale < 1) {
    G.pipeline.setScale(Math.min(1, G.pipeline.scale + 0.1));
    G.fastT = 0;
  }
}

boot();

// Corrida 3D — laço principal, corrida, câmeras e HUD.
import * as THREE from 'three';
import { Track, terrainHeight } from './track.js';
import { buildCar, CAR_MODELS, CAR_COLORS, sharedMaterials } from './carModel.js';
import { DamageSystem } from './damage.js';
import { Vehicle, collideCars } from './vehicle.js';
import { AIDriver } from './ai.js';
import { Skidmarks, Particles } from './effects.js';
import { AudioFX } from './audio.js';
import { Input } from './input.js';
import { createSky, createEnvMap, createLights, SUN_DIR } from './environment.js';
import { rng } from './textures.js';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
if (isTouch) document.body.classList.add('touch');

// ------------------------------------------------------------- configurações
const DEFAULTS = { model: 0, color: 0, laps: 3, opp: 5, diff: 1, cam: 0, tc: true, mute: false, gfx: isTouch ? 1 : 2 };

// níveis de qualidade gráfica
const QUALITY = [
  { name: 'Baixo', pr: 0.75, shadow: 0, soft: false, terrain: 100, trees: 260, grass: 0, particles: 50, fog: 900, aniso: 2, reflect: false },
  { name: 'Médio', pr: 1, shadow: 1024, soft: false, terrain: 150, trees: 520, grass: 2500, particles: 100, fog: 1200, aniso: 4, reflect: false },
  { name: 'Alta', pr: 1.5, shadow: 2048, soft: true, terrain: 220, trees: 950, grass: 9000, particles: 170, fog: 1500, aniso: 8, reflect: false },
  { name: 'Ultra', pr: 2, shadow: 4096, soft: true, terrain: 320, trees: 1600, grass: 22000, particles: 260, fog: 1800, aniso: 16, reflect: true },
];
let settings = { ...DEFAULTS };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem('corrida3d') || '{}'));
} catch (e) {
  /* sem armazenamento */
}
function saveSettings() {
  try {
    localStorage.setItem('corrida3d', JSON.stringify(settings));
  } catch (e) {
    /* ignora */
  }
}

// ------------------------------------------------------------------- render
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xb6cbe0, 260, 1500);
scene.add(createSky());
scene.environment = createEnvMap(renderer);
const lights = createLights(scene);

const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.05, 6000);
camera.layers.enable(1);
addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});

const track = new Track();
const skids = new Skidmarks(scene);
const particles = new Particles(scene, 260);
const damage = new DamageSystem(scene, particles);

// reflexos em tempo real (Ultra): cubemap renderizado em volta do carro em foco
let cubeRT = null;
let cubeCam = null;
let cubeTick = 0;
let gfx = null;
let trackGroup = null;

function setCarEnvMaps(envMap) {
  const mats = new Set(Object.values(sharedMaterials()).filter((m) => m && m.isMaterial));
  const cars = race.cars.map((c) => c.veh);
  if (showcase) cars.push(showcase);
  for (const v of cars) for (const m of v.vis.paints) mats.add(m);
  for (const m of mats) {
    if (m.envMap !== envMap) {
      m.envMap = envMap;
      m.needsUpdate = true;
    }
  }
}

function applyQuality(level) {
  const q = QUALITY[level];
  gfx = q;
  renderer.setPixelRatio(level === 0 ? Math.min(devicePixelRatio, 1) * q.pr : Math.min(devicePixelRatio, q.pr));
  renderer.setSize(innerWidth, innerHeight);
  const sun = lights.sun;
  renderer.shadowMap.enabled = q.shadow > 0;
  renderer.shadowMap.type = q.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  sun.castShadow = q.shadow > 0;
  if (q.shadow > 0) {
    sun.shadow.mapSize.set(q.shadow, q.shadow);
    const ext = q.shadow >= 4096 ? 60 : 45;
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext });
    sun.shadow.camera.updateProjectionMatrix();
    if (sun.shadow.map) {
      sun.shadow.map.dispose();
      sun.shadow.map = null;
    }
  }
  scene.fog.far = q.fog;
  // cenário (relevo, árvores, grama) refeito com o novo nível de detalhe
  if (trackGroup) {
    trackGroup.traverse((o) => {
      if (o.isMesh) {
        o.geometry.dispose();
        const ms = Array.isArray(o.material) ? o.material : [o.material];
        ms.forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      }
    });
    trackGroup.removeFromParent();
  }
  trackGroup = track.build(scene, q);
  particles.max = q.particles;
  // reflexos dinâmicos só no Ultra
  if (q.reflect && !cubeRT) {
    cubeRT = new THREE.WebGLCubeRenderTarget(256, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
    cubeCam = new THREE.CubeCamera(0.3, 900, cubeRT);
    // o reflexo ignora a grama 3D (camada 1) para ficar leve
    cubeCam.children.forEach((c) => c.layers.set(0));
    scene.add(cubeCam);
  }
  setCarEnvMaps(q.reflect ? cubeRT.texture : null);
  scene.traverse((o) => {
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => (m.needsUpdate = true));
  });
  if ($('btn-gfx')) $('btn-gfx').textContent = 'Gráficos: ' + q.name;
}

function updateReflections() {
  if (!gfx || !gfx.reflect || !cubeCam) return;
  const focus = race.state === 'menu' ? showcase : race.player && race.player.veh;
  if (!focus || cubeTick++ % 3) return;
  const hidden = race.cars.map((c) => c.veh.object);
  if (showcase) hidden.push(showcase.object);
  hidden.forEach((o) => (o.visible = false));
  const ps = particles.list.filter((it) => it.s.visible);
  ps.forEach((it) => (it.s.visible = false));
  cubeCam.position.copy(focus.pos).y += 0.4;
  // reaproveita o mapa de sombras do quadro (não recalcula 6 vezes)
  renderer.shadowMap.autoUpdate = false;
  cubeCam.update(renderer, scene);
  renderer.shadowMap.autoUpdate = true;
  hidden.forEach((o) => (o.visible = true));
  ps.forEach((it) => (it.s.visible = true));
}
const audio = new AudioFX();
audio.setMuted(settings.mute);
const input = new Input();
input.bindTouch($('touch'));

const DRIVERS = ['Ayrton Lima', 'Bia Ferraz', 'Carlos Neto', 'Duda Rocha', 'Enzo Prado', 'Fernanda Reis', 'Gui Takeda', 'Helena Souza', 'Igor Matos'];
const DIFF = [
  { name: 'Fácil', skill: [0.8, 0.88] },
  { name: 'Normal', skill: [0.88, 0.95] },
  { name: 'Difícil', skill: [0.95, 1.0] },
];

// ------------------------------------------------------------ estado geral
const race = {
  state: 'menu', // menu | countdown | racing | done
  paused: false,
  cars: [],
  player: null,
  t: 0,
  cd: 0,
  goAt: 0,
  lightsOn: 0,
  laps: 3,
  finishedCount: 0,
  resultsShown: false,
};
let showcase = null;
let camMode = settings.cam % 4;
const CAM_NAMES = ['Perseguição', 'Perseguição longe', 'Capô', 'Cockpit'];

function disposeObj(o) {
  o.traverse((c) => {
    if (c.isMesh) c.geometry.dispose();
  });
  o.removeFromParent();
}

function makeCar(modelIdx, colorIdx, number, variant) {
  const model = CAR_MODELS[modelIdx];
  const vis = buildCar(model, CAR_COLORS[colorIdx], number, variant);
  const veh = new Vehicle(model, vis, track);
  damage.init(veh);
  scene.add(veh.object);
  if (gfx && gfx.reflect && cubeRT) for (const m of vis.paints) m.envMap = cubeRT.texture;
  return veh;
}

function clearCars() {
  for (const c of race.cars) disposeObj(c.veh.object);
  race.cars = [];
  race.player = null;
  if (showcase) {
    disposeObj(showcase.object);
    showcase = null;
  }
  skids.clear();
  particles.clear();
  damage.clear();
}

// --------------------------------------------------------------------- menu
function buildMenu() {
  const list = $('car-list');
  list.innerHTML = '';
  const stats = (m) => [
    ['Velocidade', 0.55 + (m.power - 1) * 2.2 - (m.mass - 1250) / 2000],
    ['Aceleração', 0.6 + (m.power - 1) * 2 - (m.mass - 1250) / 1200],
    ['Aderência', 0.4 + (m.grip - 0.9) * 5],
  ];
  CAR_MODELS.forEach((m, i) => {
    const b = document.createElement('button');
    b.className = 'card' + (i === settings.model ? ' sel' : '');
    b.innerHTML =
      `<b>${m.name}</b><p>${m.desc}</p>` +
      stats(m)
        .map(([n, v]) => `<div class="stat"><span>${n}</span><i><em style="width:${Math.round(Math.max(0.15, Math.min(1, v)) * 100)}%"></em></i></div>`)
        .join('');
    b.onclick = () => {
      settings.model = i;
      saveSettings();
      buildMenu();
      buildShowcase();
    };
    list.appendChild(b);
  });
  const cl = $('color-list');
  cl.innerHTML = '';
  CAR_COLORS.forEach((c, i) => {
    const b = document.createElement('button');
    b.className = 'swatch' + (i === settings.color ? ' sel' : '');
    b.style.background = c.color;
    b.title = c.name;
    b.onclick = () => {
      settings.color = i;
      saveSettings();
      buildMenu();
      buildShowcase();
    };
    cl.appendChild(b);
  });
  const seg = (id, values, key, label = (v) => v) => {
    const el = $(id);
    el.innerHTML = '';
    values.forEach((v) => {
      const b = document.createElement('button');
      b.textContent = label(v);
      if (settings[key] === v) b.className = 'sel';
      b.onclick = () => {
        settings[key] = v;
        saveSettings();
        buildMenu();
      };
      el.appendChild(b);
    });
  };
  seg('opt-laps', [1, 3, 5], 'laps');
  seg('opt-opp', [0, 3, 5, 7], 'opp');
  seg('opt-diff', [0, 1, 2], 'diff', (v) => DIFF[v].name);
  seg('opt-gfx', [0, 1, 2, 3], 'gfx', (v) => QUALITY[v].name);
  if (gfx !== QUALITY[settings.gfx]) applyQuality(settings.gfx);
}

function buildShowcase() {
  if (showcase) disposeObj(showcase.object);
  showcase = makeCar(settings.model, settings.color, 7, settings.model);
  showcase.reset(track.pose(-14, 0));
}

function showMenu() {
  race.state = 'menu';
  race.paused = false;
  clearCars();
  buildShowcase();
  $('menu').classList.remove('hidden');
  $('hud').classList.add('hidden');
  $('touch').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('results').classList.add('hidden');
  track.startLights.forEach((m) => (m.emissiveIntensity = 0));
}

// -------------------------------------------------------------------- corrida
function startRace() {
  audio.init();
  clearCars();
  race.laps = settings.laps;
  const nOpp = settings.opp;
  const rand = rng((Date.now() & 0xffff) + 1);
  const total = nOpp + 1;
  const playerSlot = nOpp; // jogador larga por último
  const usedColors = new Set([settings.color]);
  const names = DRIVERS.slice().sort(() => rand() - 0.5);
  const diff = DIFF[settings.diff];
  for (let k = 0; k < total; k++) {
    const isPlayer = k === playerSlot;
    let model = settings.model;
    let color = settings.color;
    if (!isPlayer) {
      model = Math.floor(rand() * CAR_MODELS.length);
      do color = Math.floor(rand() * CAR_COLORS.length);
      while (usedColors.has(color) && usedColors.size < CAR_COLORS.length);
      usedColors.add(color);
    }
    const number = isPlayer ? 7 : [3, 11, 22, 5, 44, 16, 9, 27][k % 8];
    const veh = makeCar(model, color, number, k);
    veh.tc = isPlayer ? settings.tc : true;
    const pose = track.pose(-6 - k * 5, k % 2 ? -3.2 : 3.2);
    veh.reset(pose);
    const skill = diff.skill[0] + (diff.skill[1] - diff.skill[0]) * (k / Math.max(1, total - 1));
    const entry = {
      veh,
      ai: isPlayer ? null : new AIDriver(veh, track, skill, rand),
      isPlayer,
      name: isPlayer ? 'Você' : names[k % names.length],
      color: CAR_COLORS[color].color,
      model: CAR_MODELS[model].name,
      progress: 0,
      lastIdx: veh.idx,
      bestProg: -Infinity,
      stallT: 0,
      lapStart: 0,
      bestLap: Infinity,
      lapTimes: [],
      finished: false,
      finishTime: 0,
    };
    entry.progress = veh.idx > track.N / 2 ? veh.idx - track.N : veh.idx;
    race.cars.push(entry);
    if (isPlayer) race.player = entry;
  }
  // assenta as suspensões
  for (let s = 0; s < 120; s++) for (const c of race.cars) c.veh.step(1 / 120, { throttle: 0, brake: 1, steer: 0, handbrake: true, hold: true });
  race.t = 0;
  race.cd = 0;
  race.lightsOn = 0;
  race.goAt = 4.2 + Math.random() * 0.9;
  race.state = 'countdown';
  race.finishedCount = 0;
  race.resultsShown = false;
  race.paused = false;
  $('menu').classList.add('hidden');
  $('results').classList.add('hidden');
  $('pause').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('touch').classList.toggle('hidden', !isTouch);
  $('lights').style.opacity = 1;
  [...$('lights').children].forEach((l) => (l.className = ''));
  $('hud-pos-of').textContent = '/' + total;
  $('tips').style.opacity = 0.85;
  setTimeout(() => ($('tips').style.opacity = 0), 9000);
  showMsg('', 0);
  applyCamVisibility();
}

let msgTimer = 0;
function showMsg(html, secs = 2) {
  $('msg').innerHTML = html;
  $('msg').style.opacity = html ? 1 : 0;
  msgTimer = secs;
}

const fmt = (t) => {
  if (!isFinite(t)) return '—';
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(3).padStart(6, '0')}`;
};

function updateCountdown(dt) {
  race.cd += dt;
  const lightsEls = [...$('lights').children];
  const n = Math.min(5, Math.floor(race.cd / 0.8));
  if (race.cd < race.goAt) {
    if (n > race.lightsOn) {
      race.lightsOn = n;
      audio.beep(520, 0.15);
    }
    lightsEls.forEach((l, i) => (l.className = i < race.lightsOn ? 'on' : ''));
    track.startLights.forEach((m, i) => (m.emissiveIntensity = i < race.lightsOn ? 4 : 0));
  } else {
    race.state = 'racing';
    race.t = 0;
    lightsEls.forEach((l) => (l.className = 'go'));
    track.startLights.forEach((m) => (m.emissiveIntensity = 0));
    audio.beep(1040, 0.5);
    showMsg('VAI!', 1.2);
    setTimeout(() => ($('lights').style.opacity = 0), 1500);
  }
}

function updateProgress() {
  const N = track.N;
  for (const c of race.cars) {
    const idx = c.veh.idx;
    let d = idx - c.lastIdx;
    if (d < -N / 2) d += N;
    if (d > N / 2) d -= N;
    c.lastIdx = idx;
    if (c.finished) continue;
    const before = Math.floor(c.progress / N);
    c.progress += d;
    const after = Math.floor(c.progress / N);
    if (race.state !== 'racing') continue;
    if (after > before && after >= 1 && after > c.lapTimes.length) {
      const lt = race.t - c.lapStart;
      c.lapTimes.push(lt);
      c.lapStart = race.t;
      const best = lt < c.bestLap;
      c.bestLap = Math.min(c.bestLap, lt);
      if (c.lapTimes.length >= race.laps) {
        c.finished = true;
        c.finishTime = race.t;
        race.finishedCount++;
        c.place = race.finishedCount;
        if (c.isPlayer) playerFinished();
      } else if (c.isPlayer) {
        const last = c.lapTimes.length === race.laps - 1;
        showMsg(`${last ? 'ÚLTIMA VOLTA' : `VOLTA ${c.lapTimes.length + 1}/${race.laps}`}<small>${fmt(lt)}${best && c.lapTimes.length > 1 ? ' · melhor volta!' : ''}</small>`, 2.5);
      }
    }
  }
}

function standings() {
  return race.cars.slice().sort((a, b) => {
    if (a.finished && b.finished) return a.place - b.place;
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.progress - a.progress;
  });
}

function playerFinished() {
  const p = race.player;
  const pos = standings().indexOf(p) + 1;
  showMsg(`CHEGADA! ${pos}º LUGAR<small>Tempo ${fmt(p.finishTime)} · melhor volta ${fmt(p.bestLap)}</small>`, 4);
  // o computador assume o carro do jogador
  p.ai = new AIDriver(p.veh, track, 0.85, Math.random);
  setTimeout(showResults, 4500);
}

function showResults() {
  if (race.state === 'menu' || race.resultsShown) return;
  race.resultsShown = true;
  const st = standings();
  const leader = st[0];
  const rows = st
    .map((c, i) => {
      let time;
      if (c.finished) time = i === 0 ? fmt(c.finishTime) : '+' + (c.finishTime - leader.finishTime).toFixed(3) + 's';
      else time = `${c.lapTimes.length}/${race.laps} voltas`;
      return `<tr class="${c.isPlayer ? 'me' : ''}"><td>${i + 1}º</td><td><i style="background:${c.color}"></i>${c.name}</td><td>${c.model}</td><td>${time}</td><td>${fmt(c.bestLap)}</td></tr>`;
    })
    .join('');
  const pos = st.indexOf(race.player) + 1;
  $('res-title').textContent = pos === 1 ? '🏆 Vitória!' : `Você terminou em ${pos}º`;
  $('res-table').innerHTML = `<tr><th>Pos</th><th>Piloto</th><th>Carro</th><th>Tempo</th><th>Melhor volta</th></tr>${rows}`;
  $('results').classList.remove('hidden');
  $('touch').classList.add('hidden');
}

function resetPlayer() {
  const p = race.player;
  if (!p || race.state === 'countdown') return;
  const v = p.veh;
  v.reset(track.pose(v.idx, 0));
}

// ----------------------------------------------------------------- câmeras
const camState = { yaw: 0, pos: new THREE.Vector3(), init: false, orbit: 0, shake: 0 };
const _v = new THREE.Vector3();
const _w = new THREE.Vector3();

function applyCamVisibility() {
  for (const c of race.cars) for (const m of c.veh.vis.driverHead) m.visible = !(c.isPlayer && camMode === 3);
}

function updateCamera(dt) {
  if (window.__freezeCam) return;
  let target;
  if (race.state === 'menu') target = showcase;
  else target = race.player ? race.player.veh : null;
  if (!target) return;
  const tp = target.pos;
  const fin = race.state !== 'menu' && race.player && race.player.finished;
  if (race.state === 'menu' || fin) {
    camState.orbit += dt * (fin ? 0.18 : 0.22);
    const d = fin ? 9 : innerWidth < innerHeight ? 9.5 : 7;
    const off = race.state === 'menu' && innerWidth > 700 ? -2.1 : 0;
    _v.set(Math.sin(camState.orbit) * d, 1.8 + Math.sin(camState.orbit * 0.7) * 0.5, Math.cos(camState.orbit) * d).add(tp);
    _v.y = Math.max(_v.y, terrainHeight(_v.x, _v.z) + 0.6);
    camera.position.copy(_v);
    camera.up.set(0, 1, 0);
    camera.lookAt(tp.x, tp.y + 0.1, tp.z);
    // desloca o carro para a direita da tela quando o menu ocupa a esquerda
    if (off) camera.translateX(off);
    camera.fov = 45;
    camera.updateProjectionMatrix();
    camState.init = false;
    return;
  }
  const speed = target.speed;
  if (camMode <= 1) {
    const fy = Math.atan2(target.fwd.x, target.fwd.z);
    if (!camState.init) {
      camState.yaw = fy;
      camState.init = true;
    }
    let dy = fy - camState.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    camState.yaw += dy * (1 - Math.exp(-dt * 5));
    const dist = camMode === 0 ? 6.3 : 10;
    const hgt = camMode === 0 ? 2.0 : 3.4;
    _v.set(tp.x - Math.sin(camState.yaw) * dist, tp.y + hgt, tp.z - Math.cos(camState.yaw) * dist);
    _v.y = Math.max(_v.y, terrainHeight(_v.x, _v.z) + 0.7);
    if (camState.pos.distanceToSquared(_v) > 400) camState.pos.copy(_v);
    camState.pos.lerp(_v, 1 - Math.exp(-dt * 14));
    camera.position.copy(camState.pos);
    camera.up.set(0, 1, 0);
    _w.set(tp.x + Math.sin(camState.yaw) * 3, tp.y + 0.9, tp.z + Math.cos(camState.yaw) * 3);
    camera.lookAt(_w);
    camera.fov = 58 + Math.min(16, speed * 0.22);
  } else {
    const view = camMode === 2 ? target.vis.views.hood : target.vis.views.cockpit;
    _v.copy(view);
    _v.y -= target.cgY;
    _v.applyQuaternion(target.quat).add(tp);
    camera.position.copy(_v);
    _w.set(view.x * 0.3, view.y - target.cgY - 0.25, view.z + 20).applyQuaternion(target.quat).add(tp);
    camera.up.copy(target.up);
    camera.lookAt(_w);
    camera.fov = camMode === 3 ? 68 : 64 + Math.min(10, speed * 0.15);
  }
  // tremida em batidas e em alta velocidade
  camState.shake = Math.max(0, camState.shake - dt * 3);
  const sh = camState.shake * 0.08 + (speed > 50 ? (speed - 50) * 0.0006 : 0);
  if (sh > 0) camera.position.add(_v.set((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
  camera.updateProjectionMatrix();
}

// ---------------------------------------------------------------------- HUD
const speedo = $('speedo').getContext('2d');
const mini = $('minimap').getContext('2d');
const miniBase = document.createElement('canvas');
miniBase.width = miniBase.height = 200;
let miniXf;
(function buildMini() {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < track.N; i++) {
    minX = Math.min(minX, track.px[i]);
    maxX = Math.max(maxX, track.px[i]);
    minZ = Math.min(minZ, track.pz[i]);
    maxZ = Math.max(maxZ, track.pz[i]);
  }
  const s = 176 / Math.max(maxX - minX, maxZ - minZ);
  const ox = 100 - ((minX + maxX) / 2) * s;
  const oz = 100 - ((minZ + maxZ) / 2) * s;
  // espelha x para que o mapa corresponda à vista de cima (norte = -z)
  miniXf = (x, z) => [200 - (x * s + ox), z * s + oz];
  const g = miniBase.getContext('2d');
  g.fillStyle = 'rgba(10,13,18,0.55)';
  g.beginPath();
  g.arc(100, 100, 99, 0, Math.PI * 2);
  g.fill();
  g.lineJoin = 'round';
  for (const [w, c] of [
    [9, 'rgba(0,0,0,0.6)'],
    [5.5, '#d8dde3'],
  ]) {
    g.strokeStyle = c;
    g.lineWidth = w;
    g.beginPath();
    for (let i = 0; i <= track.N; i += 2) {
      const [x, y] = miniXf(track.px[i % track.N], track.pz[i % track.N]);
      if (i === 0) g.moveTo(x, y);
      else g.lineTo(x, y);
    }
    g.closePath();
    g.stroke();
  }
  const [sx, sy] = miniXf(track.px[0], track.pz[0]);
  g.fillStyle = '#ff3b30';
  g.fillRect(sx - 2, sy - 6, 4, 12);
})();

function drawMini() {
  mini.clearRect(0, 0, 200, 200);
  mini.drawImage(miniBase, 0, 0);
  const list = race.cars.slice().sort((a) => (a.isPlayer ? 1 : -1));
  for (const c of list) {
    const [x, y] = miniXf(c.veh.pos.x, c.veh.pos.z);
    mini.beginPath();
    mini.arc(x, y, c.isPlayer ? 6 : 4.5, 0, Math.PI * 2);
    mini.fillStyle = c.color;
    mini.fill();
    mini.lineWidth = c.isPlayer ? 2.5 : 1.2;
    mini.strokeStyle = c.isPlayer ? '#fff' : '#000';
    mini.stroke();
  }
}

function drawSpeedo(v) {
  const g = speedo;
  const W = 240;
  g.clearRect(0, 0, W, W);
  const cx = 120;
  const cy = 120;
  const R = 108;
  g.fillStyle = 'rgba(10,13,18,0.6)';
  g.beginPath();
  g.arc(cx, cy, R + 8, 0, Math.PI * 2);
  g.fill();
  const a0 = Math.PI * 0.75;
  const a1 = Math.PI * 2.25;
  const maxR = 8000;
  const ang = (r) => a0 + (a1 - a0) * (r / maxR);
  // faixa vermelha
  g.lineWidth = 9;
  g.strokeStyle = 'rgba(255,50,40,0.85)';
  g.beginPath();
  g.arc(cx, cy, R - 6, ang(7000), a1);
  g.stroke();
  // arco de RPM
  g.strokeStyle = 'rgba(255,255,255,0.12)';
  g.beginPath();
  g.arc(cx, cy, R - 18, a0, a1);
  g.stroke();
  g.strokeStyle = v.rpm > 7000 ? '#ff3b30' : '#4fc3ff';
  g.beginPath();
  g.arc(cx, cy, R - 18, a0, ang(Math.min(maxR, v.rpm)));
  g.stroke();
  // marcas
  g.fillStyle = '#fff';
  g.font = 'bold 15px system-ui, Arial';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (let k = 0; k <= 8; k++) {
    const a = ang(k * 1000);
    g.strokeStyle = '#fff';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx + Math.cos(a) * (R - 2), cy + Math.sin(a) * (R - 2));
    g.lineTo(cx + Math.cos(a) * (R - 12), cy + Math.sin(a) * (R - 12));
    g.stroke();
    g.fillText(String(k), cx + Math.cos(a) * (R - 36), cy + Math.sin(a) * (R - 36));
  }
  // ponteiro
  const a = ang(Math.min(maxR + 200, v.rpm));
  g.strokeStyle = '#ff3b30';
  g.lineWidth = 4;
  g.beginPath();
  g.moveTo(cx - Math.cos(a) * 12, cy - Math.sin(a) * 12);
  g.lineTo(cx + Math.cos(a) * (R - 14), cy + Math.sin(a) * (R - 14));
  g.stroke();
  g.fillStyle = '#222';
  g.beginPath();
  g.arc(cx, cy, 9, 0, Math.PI * 2);
  g.fill();
  // velocidade e marcha
  const kmh = Math.round(Math.abs(v.forwardSpeed) * 3.6);
  g.fillStyle = '#fff';
  g.font = 'italic 900 46px system-ui, Arial';
  g.fillText(String(kmh), cx, cy + 46);
  g.font = 'bold 13px system-ui, Arial';
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.fillText('km/h', cx, cy + 74);
  g.font = 'bold 26px system-ui, Arial';
  g.fillStyle = '#ffd84a';
  g.fillText(v.gear < 0 ? 'R' : String(v.gear), cx + 52, cy + 6);
  g.font = 'bold 11px system-ui, Arial';
  g.fillStyle = v.tc ? '#4fc3ff' : 'rgba(255,255,255,0.3)';
  g.fillText('TC', cx - 52, cy + 6);
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.fillText('x1000 rpm', cx, cy - 30);
}

// indicador de danos: silhueta do carro vista de cima, cor por região
const dmgCtx = $('dmg').getContext('2d');
function drawDamage(v) {
  const g = dmgCtx;
  g.clearRect(0, 0, 80, 140);
  const col = (d) => {
    const t = Math.min(1, d / 60);
    return `hsl(${120 - t * 120}, 85%, ${50 - t * 8}%)`;
  };
  const z = v.damage.zones;
  g.fillStyle = 'rgba(10,13,18,0.6)';
  g.beginPath();
  g.roundRect(4, 4, 72, 132, 14);
  g.fill();
  const seg = (x, y, w, h, c) => {
    g.fillStyle = c;
    g.beginPath();
    g.roundRect(x, y, w, h, 6);
    g.fill();
  };
  seg(18, 12, 44, 28, col(z.front));
  seg(18, 100, 44, 28, col(z.rear));
  seg(12, 44, 14, 52, col(z.left));
  seg(54, 44, 14, 52, col(z.right));
  g.fillStyle = 'rgba(255,255,255,0.15)';
  g.fillRect(30, 46, 20, 48);
  g.fillStyle = '#fff';
  g.font = 'bold 11px system-ui, Arial';
  g.textAlign = 'center';
  g.fillText(Math.min(100, Math.round(v.damage.total / 5)) + '%', 40, 74);
}

let boardTimer = 0;
function updateHUD(dt) {
  const p = race.player;
  if (!p) return;
  const st = standings();
  const pos = st.indexOf(p) + 1;
  $('hud-pos').textContent = pos + 'º';
  const lap = Math.min(race.laps, Math.max(1, p.lapTimes.length + 1));
  $('hud-lap').textContent = p.finished ? 'Chegada!' : `Volta ${lap}/${race.laps}`;
  const t = race.state === 'racing' ? race.t : 0;
  $('t-total').textContent = fmt(p.finished ? p.finishTime : t);
  $('t-lap').textContent = fmt(p.finished ? p.lapTimes[p.lapTimes.length - 1] : t - p.lapStart);
  $('t-best').textContent = fmt(p.bestLap);
  boardTimer -= dt;
  if (boardTimer <= 0) {
    boardTimer = 0.25;
    $('hud-board').innerHTML = st
      .map((c, i) => `<li class="${c.isPlayer ? 'me' : ''}"><span class="p">${i + 1}</span><i style="background:${c.color}"></i>${c.name}</li>`)
      .join('');
  }
  drawSpeedo(p.veh);
  if (boardTimer === 0.25) drawDamage(p.veh);
  drawMini();
  // contramão
  const v = p.veh;
  const i = v.idx;
  const wrong = race.state === 'racing' && !p.finished && v.speed > 3 && v.fwd.x * track.tx[i] + v.fwd.z * track.tz[i] < -0.3 && v.forwardSpeed > 0;
  $('wrongway').classList.toggle('hidden', !wrong);
  if (msgTimer > 0) {
    msgTimer -= dt;
    if (msgTimer <= 0) $('msg').style.opacity = 0;
  }
}

// ------------------------------------------------------------- efeitos/carro
const _dir = new THREE.Vector3();
function carEffects(c, dt) {
  const v = c.veh;
  v.syncVisual(dt);
  let k = 0;
  for (const w of v.wheels) {
    k++;
    const key = v.object.id * 10 + k;
    const slip = w.slide - 1;
    const onRoad = w.surface !== 2;
    _dir.copy(v.fwd);
    if (w.front) _dir.applyAxisAngle(v.up, -v.steerAngle);
    skids.track(key, w.contact && onRoad && slip > 0.5, w.cp, w.n, _dir, v.model.tireW * 0.45);
    if (!w.contact) continue;
    if (onRoad && slip > 1.5 && Math.random() < Math.min(0.9, slip * 0.08) * (isTouch ? 0.5 : 1)) {
      particles.spawn(_v.copy(w.cp).addScaledVector(w.n, 0.25), _w.copy(v.vel).multiplyScalar(0.15).add({ x: 0, y: 0.6, z: 0 }), 0xe6e6e6, 0.8, 4.5, 1.8, 0.45);
    } else if (!onRoad && v.speed > 6 && Math.random() < 0.18 * (isTouch ? 0.5 : 1)) {
      particles.spawn(_v.copy(w.cp).addScaledVector(w.n, 0.2), _w.copy(v.vel).multiplyScalar(0.1).add({ x: 0, y: 0.8, z: 0 }), 0x9a7b4f, 0.6, 3, 1.3, 0.4);
    }
  }
  // danos das batidas desta rodada
  // (um mesmo choque gera vários contatos: conta só o mais forte de cada região,
  // e ignora repetições logo em seguida)
  v.hitCool = Math.max(0, (v.hitCool || 0) - dt);
  if (v.hits.length) {
    v.hits.sort((a, b) => b.v - a.v);
    const taken = [];
    for (const h of v.hits) {
      if (taken.length >= 2 || taken.some((t) => t.p.distanceTo(h.p) < 1.5)) continue;
      if (v.hitCool > 0 && h.v < (v.lastHitV || 0) + 3) continue;
      taken.push(h);
    }
    for (const h of taken) damage.hit(v, h);
    if (taken.length) {
      v.hitCool = 0.35;
      v.lastHitV = taken[0].v;
    }
    v.hits.length = 0;
  }
  // motor muito danificado solta fumaça
  if (v.damage.total > 150 && Math.random() < Math.min(0.5, (v.damage.total - 150) / 250) * dt * 30) {
    _v.set(0, 0.85 - v.cgY, v.model.length * 0.3).applyQuaternion(v.quat).add(v.pos);
    const dark = v.damage.total > 300;
    particles.spawn(_v, _w.copy(v.vel).multiplyScalar(0.3).add({ x: 0, y: 1.2, z: 0 }), dark ? 0x2a2a2a : 0x9a9a9a, 0.5, 3.2, 1.6, dark ? 0.55 : 0.35);
  }
  if (v.impact > 0.5) {
    if (c.isPlayer) {
      audio.crash(v.impact);
      camState.shake = Math.min(1.5, camState.shake + v.impact * 0.12);
    } else if (race.player && v.pos.distanceTo(race.player.veh.pos) < 40) audio.crash(v.impact * 0.5);
    v.impact = 0;
  }
}

// --------------------------------------------------------------------- laço
const H = 1 / 120;
let acc = 0;
let last = performance.now();
const ctls = new Map();

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt);
  renderer.render(scene, camera);
}

function update(dt) {
  // teclas de atalho
  if (input.take('KeyC') && race.state !== 'menu') cycleCam();
  if (input.take('KeyR')) resetPlayer();
  if (input.take('KeyT')) toggleTC();
  if (input.take('KeyM')) toggleMute();
  if ((input.take('KeyP') || input.take('Escape')) && race.state !== 'menu' && !race.resultsShown) togglePause();
  if (input.take('Enter') && race.state === 'menu') startRace();
  input.endFrame();

  if (!race.paused) {
    if (race.state === 'menu') {
      if (showcase) {
        acc += dt;
        while (acc >= H) {
          showcase.step(H, { throttle: 0, brake: 1, steer: 0, handbrake: true, hold: true });
          acc -= H;
        }
        showcase.syncVisual(dt);
      }
    } else {
      if (race.state === 'countdown') updateCountdown(dt);
      else race.t += dt;
      const pc = input.controls();
      for (const c of race.cars) {
        let ctl;
        if (race.state === 'countdown') ctl = { throttle: 0, brake: 1, steer: c.isPlayer ? pc.steer : 0, handbrake: true, hold: true };
        else if (c.ai) {
          ctl = c.ai.update(dt, race.cars.map((o) => o.veh));
          // sem avançar por muito tempo (preso no muro): recoloca na pista
          if (c.progress > c.bestProg + 1) {
            c.bestProg = c.progress;
            c.stallT = 0;
          } else if (race.state === 'racing') c.stallT += dt;
          if (c.ai.needsReset() || c.stallT > 7) {
            c.veh.reset(track.pose(c.veh.idx, 0));
            c.stallT = 0;
          }
        } else ctl = pc;
        ctls.set(c, ctl);
      }
      if (race.player && race.player.veh.flipTimer > 2.5) resetPlayer();
      acc += dt;
      while (acc >= H) {
        for (const c of race.cars) c.veh.step(H, ctls.get(c));
        for (let a = 0; a < race.cars.length; a++)
          for (let b = a + 1; b < race.cars.length; b++) collideCars(race.cars[a].veh, race.cars[b].veh);
        acc -= H;
      }
      updateProgress();
      for (const c of race.cars) carEffects(c, dt);
      skids.update();
      particles.update(dt);
      damage.update(dt, race.cars.map((c) => c.veh));
      updateHUD(dt);
    }
  }

  updateCamera(race.paused ? 0 : dt);
  // sombra acompanha o carro em foco
  const focus = race.state === 'menu' ? showcase : race.player && race.player.veh;
  if (focus) {
    lights.sun.target.position.copy(focus.pos);
    lights.sun.position.copy(focus.pos).addScaledVector(SUN_DIR, 120);
  }
  audio.update(race.player ? race.player.veh : null, race.state !== 'menu' && !race.paused);
  updateReflections();
}

// ------------------------------------------------------------------ botões
function cycleCam() {
  camMode = (camMode + 1) % 4;
  settings.cam = camMode;
  saveSettings();
  camState.init = false;
  applyCamVisibility();
  showMsg(`<small>Câmera: ${CAM_NAMES[camMode]}</small>`, 1.2);
}
function toggleTC() {
  settings.tc = !settings.tc;
  saveSettings();
  if (race.player) race.player.veh.tc = settings.tc;
  $('btn-tc').textContent = 'Controle de tração: ' + (settings.tc ? 'ligado' : 'desligado');
  if (race.state !== 'menu') showMsg(`<small>Controle de tração ${settings.tc ? 'ligado' : 'desligado'}</small>`, 1.2);
}
function toggleMute() {
  settings.mute = !settings.mute;
  saveSettings();
  audio.setMuted(settings.mute);
  $('btn-sound').textContent = 'Som: ' + (settings.mute ? 'desligado' : 'ligado');
}
function togglePause() {
  race.paused = !race.paused;
  $('pause').classList.toggle('hidden', !race.paused);
  if (audio.ctx) race.paused ? audio.ctx.suspend() : audio.ctx.resume();
}

$('btn-start').onclick = startRace;
$('btn-cam').onclick = cycleCam;
$('btn-reset').onclick = resetPlayer;
$('btn-pause').onclick = togglePause;
$('btn-resume').onclick = togglePause;
$('btn-restart').onclick = () => {
  togglePause();
  startRace();
};
$('btn-tc').onclick = toggleTC;
$('btn-gfx').onclick = () => {
  settings.gfx = (settings.gfx + 1) % QUALITY.length;
  saveSettings();
  applyQuality(settings.gfx);
};
$('btn-sound').onclick = toggleMute;
$('btn-menu').onclick = () => {
  if (audio.ctx) audio.ctx.resume();
  showMenu();
};
$('btn-again').onclick = startRace;
$('btn-menu2').onclick = showMenu;
$('btn-tc').textContent = 'Controle de tração: ' + (settings.tc ? 'ligado' : 'desligado');
$('btn-sound').textContent = 'Som: ' + (settings.mute ? 'desligado' : 'ligado');
if (isTouch) $('help-keys').textContent = 'Use os botões na tela: ◀ ▶ para virar, ACELERAR, FREIO (segure parado para dar ré) e FREIO DE MÃO para derrapar.';

damage.onPartLost = (veh, part) => {
  if (race.player && veh === race.player.veh) showMsg(`<small>Peça perdida: ${part.name}</small>`, 1.6);
};

buildMenu();
showMenu();
$('loading').classList.add('hidden');
requestAnimationFrame(frame);

// ganchos para testes automatizados
window.__corrida = { race, track, startRace, camera, update, input, renderer, render: () => renderer.render(scene, camera) };

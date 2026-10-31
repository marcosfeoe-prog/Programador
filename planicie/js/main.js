// Planície — caçador de tornados numa planície enorme.
// Orquestra renderização, simulação, jogabilidade (fotos e sondas) e menus.
import * as THREE from 'three';
import { U, PRESETS, applyPreset, stormCoverage } from './atmo.js';
import { generateNoise2D, generateNoise3D } from './noise.js';
import { createSky } from './sky.js';
import { createGround, ScarMap } from './ground.js';
import { createGrass } from './grass.js';
import { Props } from './props.js';
import { Particles } from './particles.js';
import { Storm, SHAPES, LOOKS, efFor, windField } from './tornado.js';
import { Pipeline } from './volume.js';
import { Player } from './player.js';
import { Input } from './input.js';
import { Hud, fmtDist } from './hud.js';
import { Audio } from './audio.js';

const QUALITY = {
  baixa: { pr: 0.75, volScale: 0.35, volSteps: 72, stepMul: 1.5, cloudSteps: 8, grass: 40000, msaa: false, bales: 250, debrisParticles: 1500, rain: 600 },
  media: { pr: 1, volScale: 0.45, volSteps: 100, stepMul: 1.2, cloudSteps: 12, grass: 110000, msaa: false, bales: 450, debrisParticles: 3000, rain: 1200 },
  alta: { pr: 1.5, volScale: 0.5, volSteps: 130, stepMul: 1.0, cloudSteps: 16, grass: 220000, msaa: true, bales: 600, debrisParticles: 5000, rain: 2000 },
  ultra: { pr: 2, volScale: 0.65, volSteps: 180, stepMul: 0.8, cloudSteps: 20, grass: 360000, msaa: true, bales: 800, debrisParticles: 8000, rain: 3000 },
};

const params = new URLSearchParams(location.search);
const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const qKey = QUALITY[params.get('q')] ? params.get('q') : isTouch ? 'baixa' : 'alta';
const quality = QUALITY[qKey];
const presetKey = PRESETS[params.get('clima')] ? params.get('clima') : 'tarde';

const canvas = document.getElementById('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
renderer.setPixelRatio(Math.min(devicePixelRatio, quality.pr));
renderer.setSize(innerWidth, innerHeight, false);

const camera = new THREE.PerspectiveCamera(68, innerWidth / innerHeight, 0.2, 40000);
const scene = new THREE.Scene();

applyPreset(PRESETS[presetKey]);
U.uN2.value = generateNoise2D(512);
U.uNoise.value = generateNoise3D(renderer, 64);
const scar = new ScarMap(1024, 8000);

const sky = createSky(quality);
scene.add(sky);
const ground = createGround();
scene.add(ground);
scene.add(createGrass(quality));

const hemi = new THREE.HemisphereLight(0xffffff, 0x3a3326, Math.PI);
const sun = new THREE.DirectionalLight(0xffffff, 1);
scene.add(hemi, sun, sun.target);

const props = new Props(scene, quality);
const particles = new Particles(scene, quality);
const pipeline = new Pipeline(renderer, quality);
pipeline.compMat.uniforms.uExposure.value = PRESETS[presetKey].exposure;
const storm = new Storm();
const player = new Player(scene, camera);
player.truck.position.set(1.8, 0, -300);
player.tr.heading = 0;
player.truck.rotation.y = 0;
player.pos.set(-1.5, 0, -302);
player.yaw = Math.PI * 0.42; // olhando para oeste-sudoeste
const input = new Input(canvas);
const hud = new Hud();
const audio = new Audio();

// sondas de medição (cones laranja)
const probeGeo = new THREE.ConeGeometry(0.35, 0.8, 10).translate(0, 0.4, 0);
const probeMat = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.5, emissive: 0x401800 });
const probes = [];
let probesLeft = 3;

const score = { points: 0, photos: 0, intercepts: 0, tornadoes: 0 };
let paused = true;
let started = false;
let time = 0;
let flash = 0;
let nextLightning = params.get('raios') === '0' ? 1e9 : 6;
let photoRequest = false;
let uiFlash = 0;
let lastTornado = null;
const options = { shape: params.get('formato') || 'auto', look: params.get('aparencia') || 'auto', duration: Number(params.get('duracao')) || 0 };

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  pipeline.setSize(innerWidth, innerHeight);
}
addEventListener('resize', resize);
resize();

// posiciona a primeira supercélula a sudoeste, com o tornado nascendo a ~4 km
{
  // tornado nasce ~3,6 km a oeste-sudoeste; o núcleo de chuva fica ao norte dele
  storm.pos.set(player.pos.x - 3400 + 1800, player.pos.z + 1000 - 900);
  storm.cooldown = 30;
  storm.wallCloud = 0.3;
}
storm.forced = options;

function deployProbe() {
  if (probesLeft <= 0) {
    hud.toast('Sem sondas — volte à picape para recarregar');
    return;
  }
  const at = player.inTruck ? player.truck.position.clone().add(new THREE.Vector3(Math.sin(player.tr.heading), 0, Math.cos(player.tr.heading)).multiplyScalar(-4)) : player.pos.clone();
  at.y = 0;
  const mesh = new THREE.Mesh(probeGeo, probeMat);
  mesh.position.copy(at);
  scene.add(mesh);
  probes.push({ pos: at, mesh, alive: true, maxWind: 0 });
  probesLeft--;
  audio.beep(880, 0.15, 0.3);
  hud.toast(`Sonda posicionada (${probesLeft} restantes)`);
}

function takePhoto() {
  audio.click();
  uiFlash = 0.6;
  photoRequest = true;
}

// avalia a foto: o tornado precisa estar enquadrado e visível
function scorePhoto() {
  const t = storm.tornado;
  const data = renderer.domElement.toDataURL('image/jpeg', 0.7);
  score.photos++;
  if (!t || t.contact < 0.5) {
    const wall = storm.phase === 'nuvemParede';
    const pts = wall ? 40 : 5;
    score.points += pts;
    hud.photo(data, wall ? `Nuvem parede · +${pts}` : `Paisagem · +${pts}`);
    return;
  }
  const mid = new THREE.Vector3();
  const c = t.centerAt(U.uCloudBase.value * 0.3, time, { x: 0, y: 0 });
  mid.set(c.x, U.uCloudBase.value * 0.3, c.y);
  const v = mid.clone().project(camera);
  const inView = v.z < 1 && Math.abs(v.x) < 0.95 && Math.abs(v.y) < 0.95;
  const dist = t.distanceTo(camera.position.x, camera.position.z, time);
  if (!inView) {
    hud.photo(data, 'Tornado fora do enquadramento · +0');
    return;
  }
  const shapeMul = { corda: 1.2, cone: 1.0, cilindro: 1.1, cunha: 1.3, multi: 1.5 }[t.shapeKey];
  const distMul = dist < 150 ? 3.2 : dist < 400 ? 2.4 : dist < 1000 ? 1.7 : dist < 2500 ? 1.1 : dist < 6000 ? 0.5 : 0.15;
  const frame = Math.hypot(v.x, v.y) < 0.25 ? 1.3 : 1;
  const vis = t.look.rainWrap ? 0.7 : 1;
  t.photos = (t.photos || 0) + 1;
  const repeat = Math.pow(0.82, t.photos - 1);
  const pts = Math.round(100 * shapeMul * distMul * frame * vis * repeat * (0.6 + t.strength * 0.6));
  score.points += pts;
  hud.photo(data, `<b>${t.shape.name}</b> a ${fmtDist(dist)} · <b>+${pts}</b>${frame > 1 ? ' · bem enquadrado' : ''}`);
}

function updateProbes(dt) {
  const t = storm.tornado;
  // recarrega ao entrar na picape
  if (player.inTruck && probesLeft < 3) {
    probesLeft = 3;
    hud.toast('Sondas recarregadas');
  }
  for (const p of probes) {
    if (!p.alive) continue;
    windField(storm, p.pos.x, 1, p.pos.z, time, _w);
    const sp = Math.hypot(_w.x, _w.z);
    p.maxWind = Math.max(p.maxWind, sp);
    if (t && t.contact > 0.9) {
      const d = t.distanceTo(p.pos.x, p.pos.z, time);
      if (d < t.coreRadius() * 1.15 + 6) {
        p.alive = false;
        scene.remove(p.mesh);
        const pts = Math.round(400 + p.maxWind * 12);
        score.points += pts;
        score.intercepts++;
        audio.beep(1320, 0.3, 0.35);
        hud.toast(`Interceptação da sonda! Rajada medida: ${Math.round(p.maxWind * 3.6)} km/h · +${pts}`, 4.5);
        props.spawn('panel', p.pos.clone().setY(1), _w.clone().multiplyScalar(0.3), 0.012, 0.2);
      }
    }
  }
}
const _w = new THREE.Vector3();

function lightning(dt) {
  nextLightning -= dt;
  flash = Math.max(0, flash - dt * 7);
  if (nextLightning <= 0) {
    nextLightning = 3 + Math.random() * 9;
    flash = 0.4 + Math.random() * 0.5;
    const rp = pipeline.volMat.uniforms.uRainPos.value;
    const x = rp.x + (Math.random() - 0.5) * 6000, z = rp.y + (Math.random() - 0.5) * 6000;
    audio.thunder(Math.hypot(x - camera.position.x, z - camera.position.z));
  }
  // dupla cintilação típica
  U.uFlash.value = flash > 0 ? flash * (0.6 + 0.4 * Math.sin(time * 60)) * 0.8 : 0;
}

function tornadoReport(t) {
  if (t.groundTime < 5) {
    hud.report('<h3>Nuvem funil</h3><p>O funil recuou sem tocar o solo — não foi um tornado.</p>');
    return;
  }
  const st = t.stats;
  const ef = efFor(t.peakWind * 0.95);
  score.tornadoes++;
  hud.report(`<h3>Levantamento de danos — Tornado ${score.tornadoes}</h3>
    <div class="rep-grid">
      <span>Formato</span><b>${t.shape.name} (${t.look.name})</b>
      <span>Classificação</span><b>${ef}</b>
      <span>Vento máximo</span><b>${Math.round(t.peakWind * 3.6)} km/h</b>
      <span>Tempo no solo</span><b>${Math.floor(t.groundTime / 60)} min ${Math.round(t.groundTime % 60)} s</b>
      <span>Trajetória</span><b>${fmtDist(t.pathLen)}</b>
      <span>Largura máxima</span><b>${fmtDist(t.maxWidth)}</b>
      <span>Construções/objetos</span><b>${st.destroyed}</b>
      <span>Árvores / postes</span><b>${st.trees} / ${st.poles}</b>
    </div>`);
}

function updateLights() {
  const cov = stormCoverage(camera.position.x, camera.position.z);
  const amb = U.uAmb.value;
  hemi.color.setRGB(amb.r * 1.05 + U.uZenith.value.r * 0.12, amb.g * 1.05 + U.uZenith.value.g * 0.12, amb.b * 1.05 + U.uZenith.value.b * 0.12);
  hemi.color.addScalar(U.uFlash.value * 0.5);
  hemi.groundColor.setRGB(amb.r * 0.45, amb.g * 0.4, amb.b * 0.32);
  sun.color.copy(U.uSunCol.value);
  sun.intensity = Math.PI * 0.85 * (1 - cov * 0.94);
  sun.position.copy(camera.position).addScaledVector(U.uSunDir.value, 100);
  sun.target.position.copy(camera.position);
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused) step(dt);
  else {
    input.consumeLook();
    input.endFrame();
  }
  U.uTime.value = time;
  U.uCam.value.copy(camera.position);
  sky.position.copy(camera.position);
  ground.position.set(Math.round(camera.position.x / 1000) * 1000, 0, Math.round(camera.position.z / 1000) * 1000);
  updateLights();
  pipeline.sync(storm);
  pipeline.compMat.uniforms.uFlashUi.value = uiFlash;
  pipeline.compMat.uniforms.uDamage.value = THREE.MathUtils.clamp((100 - player.health) / 100, 0, 1) * 0.5 + player.shake * 0.25;
  particles.update(dt, pipeline.volMat, camera.position, player.wind, renderer.domElement.height);
  scar.flush();
  pipeline.render(scene, camera);
  if (photoRequest) {
    photoRequest = false;
    scorePhoto();
  }
}

function step(dt) {
  time += dt;
  uiFlash = Math.max(0, uiFlash - dt * 3);
  if (input.hit('Escape') || input.hit('Menu')) openPause();
  if (input.hit('KeyE')) player.toggleTruck(hud);
  if (input.hit('KeyF') || input.hit('Mouse0')) takePhoto();
  if (input.hit('KeyP')) deployProbe();
  if (input.hit('KeyM')) hud.mapRange = hud.mapRange === 6000 ? 2500 : hud.mapRange === 2500 ? 12000 : 6000;
  if (input.hit('KeyT') && !storm.tornado) {
    storm.cooldown = 0;
    hud.toast('Tornadogênese iniciada');
  }
  if (input.hit('KeyH')) hud.el.hud.classList.toggle('clean');
  if (input.hit('KeyC') && !player.inTruck) hud.toast('Câmera: entre na picape para alternar 3ª pessoa / cabine');

  const prevTor = storm.tornado;
  storm.update(dt, player.inTruck ? player.truck.position : player.pos);
  if (storm.tornado && storm.tornado !== lastTornado) {
    lastTornado = storm.tornado;
    lastTornado.stats = { destroyed: 0, trees: 0, poles: 0 };
    hud.toast(lastTornado.funnelFail ? 'Nuvem funil se formando...' : 'Nuvem funil descendo da nuvem parede!', 3.5);
    audio.beep(660, 0.3, 0.2);
  }
  if (prevTor && !storm.tornado) tornadoReport(prevTor);
  const t = storm.tornado;
  if (t && t.contact > 0.95 && t.strength > 0.3) {
    scar.paint(t.pos.x, t.pos.y, t.damageWidth() * 0.5 * Math.min(1, t.vmax / 60), Math.min(1, dt * 2.5 * (t.vmax / 50)));
  }
  props.update(dt, storm, time, scar, t ? t.stats : { destroyed: 0, trees: 0, poles: 0 });
  player.update(dt, input, storm, time, props.colliders());
  updateProbes(dt);
  lightning(dt);
  const tDist = t ? t.distanceTo(camera.position.x, camera.position.z, time) : 1e9;
  audio.update(player.windSpeed, tDist, t ? t.vmax * Math.min(1, t.contact) : 0, particles.rainAmt, time);
  hud.update(dt, {
    storm, player, score, time, camera, farms: props.farms, probes, probesLeft,
    rainPos: pipeline.volMat.uniforms.uRainPos.value,
  });
  if (player.dead) gameOver();
  input.endFrame();
}

// ---------------------------------------------------------------- menus
const menu = document.getElementById('menu');
const pauseEl = document.getElementById('pause');
const deathEl = document.getElementById('death');

function fillSelect(id, entries, value) {
  const s = document.getElementById(id);
  s.innerHTML = entries.map(([k, v]) => `<option value="${k}"${k === value ? ' selected' : ''}>${v}</option>`).join('');
  return s;
}
fillSelect('opt-q', [['baixa', 'Baixa'], ['media', 'Média'], ['alta', 'Alta'], ['ultra', 'Ultra']], qKey);
fillSelect('opt-clima', Object.entries(PRESETS).map(([k, p]) => [k, p.name]), presetKey);
fillSelect('opt-shape', [['auto', 'Aleatório'], ...Object.entries(SHAPES).map(([k, s]) => [k, s.name])], options.shape);
fillSelect('opt-look', [['auto', 'Aleatória'], ...Object.entries(LOOKS).map(([k, s]) => [k, s.name])], options.look);
fillSelect('opt-dur', [['0', 'Aleatória (1–4 min)'], ['2', '2 min'], ['5', '5 min'], ['10', '10 min'], ['30', '30 min']], String(options.duration));

function readOptions() {
  options.shape = document.getElementById('opt-shape').value;
  options.look = document.getElementById('opt-look').value;
  options.duration = Number(document.getElementById('opt-dur').value);
  storm.forced = options;
  const q = document.getElementById('opt-q').value;
  const clima = document.getElementById('opt-clima').value;
  if (q !== qKey || clima !== presetKey) {
    const p = new URLSearchParams({ q, clima, formato: options.shape, aparencia: options.look, duracao: options.duration, jogar: 1 });
    location.search = p.toString();
    return false;
  }
  return true;
}

function startGame() {
  if (!readOptions()) return;
  menu.classList.add('hidden');
  pauseEl.classList.add('hidden');
  hud.show(true);
  document.body.classList.toggle('touch', isTouch);
  paused = false;
  input.enabled = true;
  audio.start();
  audio.ctx?.resume();
  if (!isTouch) canvas.requestPointerLock?.();
  if (!started) {
    started = true;
    hud.toast('Caçada iniciada: fotografe o tornado (F) e posicione sondas (P) no caminho dele', 5);
  }
}

function openPause() {
  paused = true;
  document.exitPointerLock?.();
  menu.classList.remove('hidden');
  document.getElementById('btn-play').textContent = 'Continuar';
  audio.ctx?.suspend();
}

function gameOver() {
  paused = true;
  document.exitPointerLock?.();
  document.getElementById('death-cause').textContent = player.deathCause;
  document.getElementById('death-stats').innerHTML =
    `Pontos: <b>${score.points.toLocaleString('pt-BR')}</b> · Fotos: <b>${score.photos}</b> · Sondas interceptadas: <b>${score.intercepts}</b> · Tornados: <b>${score.tornadoes}</b>`;
  deathEl.classList.remove('hidden');
  audio.ctx?.suspend();
}

document.getElementById('btn-play').addEventListener('click', startGame);
document.getElementById('btn-restart').addEventListener('click', () => location.reload());
document.addEventListener('pointerlockchange', () => {
  if (!document.pointerLockElement && !paused && !isTouch && started) openPause();
});

// esconde a tela de carregamento
document.getElementById('loading').classList.add('hidden');
menu.classList.remove('hidden');
if (params.get('jogar')) document.getElementById('btn-play').textContent = 'Jogar';
requestAnimationFrame(frame);

// para testes automatizados
window.__planicie = { storm, player, camera, score, U, pipeline, props, scene, particles, setTime: (t) => (time = t), step };

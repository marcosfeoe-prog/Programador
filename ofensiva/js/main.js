// Inicialização: renderizador, menus, configurações salvas e laço principal.
import * as THREE from 'three';
import { Game } from './game.js';
import { HUD } from './hud.js';
import { Input } from './input.js';
import { AudioSys } from './audio.js';
import { ViewModel } from './viewmodel.js';
import { PlayerCtl } from './player.js';
import { isMobileDevice } from './util.js';

const $ = (id) => document.getElementById(id);

addEventListener('error', (e) => {
  const el = $('error');
  el.classList.remove('hidden');
  el.textContent = 'Erro: ' + (e.message || e.error);
});

// ------------------------------------------------------------ configurações
const mobile = isMobileDevice();
const DEFAULTS = { sens: 2.0, fov: 74, vol: 0.7, xhair: '#3cff5a', dynamic: 1, quality: mobile ? 'low' : 'medium', invert: 0 };
const MENU_DEFAULTS = { team: 'CT', skill: 'normal', length: 'short', size: '5', mode: 'defuse' };
function load(key, def) {
  try {
    return { ...def, ...JSON.parse(localStorage.getItem(key) || '{}') };
  } catch {
    return { ...def };
  }
}
function save(key, v) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* armazenamento indisponível */
  }
}
const settings = load('ofensiva.settings', DEFAULTS);
const menuOpts = load('ofensiva.menu', MENU_DEFAULTS);

// ------------------------------------------------------------ motor
const canvas = $('game');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: !mobile, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const input = new Input(canvas);
const audio = new AudioSys();
const hud = new HUD();
const vm = new ViewModel();
const game = new Game({ renderer, audio, input, hud, settings, viewmodel: vm });
const ctl = new PlayerCtl(game, input, hud);
game.ctl = ctl;
if (mobile) document.body.classList.add('touch');

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  game.camera.aspect = innerWidth / innerHeight;
  game.camera.updateProjectionMatrix();
});

function applySettings() {
  document.documentElement.style.setProperty('--xhair', settings.xhair);
  audio.setVolume(settings.vol);
  $('v-sens').textContent = (+settings.sens).toFixed(2);
  $('v-fov').textContent = settings.fov + '°';
  $('v-vol').textContent = Math.round(settings.vol * 100) + '%';
  settings.sens = +settings.sens;
  settings.fov = +settings.fov;
  settings.dynamic = +settings.dynamic;
  settings.invert = +settings.invert;
}

// ------------------------------------------------------------ menus
function bindSeg(root, store, attr, onChange) {
  for (const seg of root.querySelectorAll(`.seg[data-${attr}]`)) {
    const key = seg.dataset[attr];
    const btns = [...seg.querySelectorAll('button')];
    const mark = () => btns.forEach((b) => b.classList.toggle('on', String(store[key]) === b.dataset.v));
    btns.forEach((b) =>
      b.addEventListener('click', () => {
        store[key] = b.dataset.v;
        mark();
        onChange?.(key);
      }),
    );
    mark();
  }
}
bindSeg($('main-menu'), menuOpts, 'opt', () => save('ofensiva.menu', menuOpts));
bindSeg($('settings'), settings, 'set', (key) => {
  applySettings();
  if (key === 'quality') game.applyQuality();
  save('ofensiva.settings', settings);
});
for (const [id, key] of [['s-sens', 'sens'], ['s-fov', 'fov'], ['s-vol', 'vol']]) {
  const el = $(id);
  el.value = settings[key];
  el.addEventListener('input', () => {
    settings[key] = +el.value;
    applySettings();
    save('ofensiva.settings', settings);
  });
}
applySettings();

let screenBack = 'menu';
function showScreen(id) {
  for (const s of ['menu', 'pause', 'settings', 'help', 'loading']) $(s).classList.toggle('hidden', s !== id);
}
$('open-settings').onclick = () => {
  screenBack = 'menu';
  showScreen('settings');
};
$('open-help').onclick = () => {
  screenBack = 'menu';
  showScreen('help');
};
$('p-settings').onclick = () => {
  screenBack = 'pause';
  showScreen('settings');
};
$('p-help').onclick = () => {
  screenBack = 'pause';
  showScreen('help');
};
$('settings-back').onclick = () => showScreen(screenBack);
$('help-back').onclick = () => showScreen(screenBack);

let touchReady = false;
$('play').onclick = () => {
  audio.init();
  showScreen(null);
  hud.show(true);
  game.start({
    team: menuOpts.team,
    skill: menuOpts.skill,
    length: menuOpts.length,
    size: +menuOpts.size,
    mode: menuOpts.mode,
  });
  game.paused = false;
  if (mobile) {
    if (!touchReady) input.setupTouch($('touch'));
    touchReady = true;
    $('touch').classList.remove('hidden');
    document.documentElement.requestFullscreen?.().catch(() => {});
    screen.orientation?.lock?.('landscape').catch(() => {});
  } else input.lock();
};

function pause() {
  if (!game.running || game.paused) return;
  game.paused = true;
  ctl.closeBuy();
  hud.showScore(game, false);
  showScreen('pause');
  if (mobile) $('touch').classList.add('hidden');
}
function resume() {
  game.paused = false;
  showScreen(null);
  if (mobile) $('touch').classList.remove('hidden');
  else input.lock();
}
$('resume').onclick = resume;
$('quit').onclick = () => {
  game.stop();
  game.paused = false;
  hud.show(false);
  hud.openBuy(game, null, false);
  hud.showScore(game, false);
  $('touch').classList.add('hidden');
  showScreen('menu');
};
input.onLockChange = (locked) => {
  if (!locked && game.running && !game.uiUnlock && !game.paused) pause();
};
// clicar no jogo recaptura o mouse
canvas.addEventListener('click', () => {
  if (game.running && !game.paused && !input.locked && !mobile && !game.uiUnlock) input.lock();
});
game.onMatchOver = () => {
  setTimeout(() => {
    if (game.phase === 'over') $('quit').onclick();
  }, 12000);
};

// ------------------------------------------------------------ laço
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game.running && !game.paused) {
    if (input.wasPressed('Escape') && mobile) pause();
    ctl.update(dt);
    game.update(dt);
    ctl.camera(dt);
    hud.update(game, game.player, game.time, ctl.viewActor());
  }
  input.endFrame();
  game.render();
}
requestAnimationFrame(frame);

// para testes automatizados
window.__ofensiva = { game, ctl, input, hud };

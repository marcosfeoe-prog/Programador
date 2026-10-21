// Inicialização: menu, opções e o "modo vitrine" (câmera vagando pelo Nível 0
// atrás do menu).
import { Game, loadSave } from './game.js';
import { Input } from './input.js';
import { audio } from './audio.js';
import { grainDataURL } from './textures.js';
import { LEVELS } from './levels/index.js';
import { isTouch } from './util.js';

const $ = (id) => document.getElementById(id);

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

if (!hasWebGL()) {
  $('webgl-error').classList.remove('hidden');
  $('fade').classList.remove('on');
} else boot();

function boot() {
  if (isTouch()) document.body.classList.add('touch');
  $('grain').style.backgroundImage = `url(${grainDataURL()})`;
  const canvas = $('game');
  const input = new Input(canvas);
  const game = new Game(canvas, input);
  game.isTouch = isTouch();

  let prefs = { sens: 1, vol: 0.8 };
  try {
    prefs = { ...prefs, ...JSON.parse(localStorage.getItem('escape-backrooms-prefs') || '{}') };
  } catch {
    /* sem armazenamento */
  }
  const savePrefs = () => {
    try {
      localStorage.setItem('escape-backrooms-prefs', JSON.stringify(prefs));
    } catch {
      /* sem armazenamento */
    }
  };
  $('opt-sens').value = prefs.sens;
  $('opt-vol').value = prefs.vol;
  input.sens = prefs.sens;
  audio.setVolume(prefs.vol);
  $('opt-sens').addEventListener('input', (e) => {
    prefs.sens = input.sens = Number(e.target.value);
    savePrefs();
  });
  $('opt-vol').addEventListener('input', (e) => {
    prefs.vol = Number(e.target.value);
    audio.setVolume(prefs.vol);
    savePrefs();
  });

  const refreshMenu = () => {
    const save = loadSave();
    $('btn-continue').textContent = save.unlocked > 0 ? `CONTINUAR — NÍVEL ${LEVELS[save.unlocked].number}` : 'JOGAR';
    $('btn-new').classList.toggle('hidden', save.unlocked === 0);
    const sel = $('level-select');
    sel.innerHTML = '';
    LEVELS.forEach((L, i) => {
      const b = document.createElement('button');
      b.textContent = L.number;
      b.title = L.name;
      b.disabled = i > save.unlocked;
      b.addEventListener('click', () => begin(i));
      sel.appendChild(b);
    });
    // Cenário atrás do menu.
    game.loadLevel(0);
    game.state = 'menu';
    $('fade').classList.remove('on');
  };

  const begin = (i) => {
    audio.unlock();
    game.runTime = i === 0 ? 0 : game.runTime;
    if (i === 0) game.deaths = 0;
    game.start(i);
  };

  $('btn-continue').addEventListener('click', () => begin(loadSave().unlocked));
  $('btn-new').addEventListener('click', () => {
    game.almond = 0;
    begin(0);
  });
  let helpFrom = 'menu';
  $('btn-help').addEventListener('click', () => {
    helpFrom = 'menu';
    game.showScreen('help');
  });
  $('btn-pause-help').addEventListener('click', () => {
    helpFrom = 'pause';
    game.showScreen('help');
  });
  document.querySelector('[data-back]').addEventListener('click', () => game.showScreen(helpFrom));
  $('btn-resume').addEventListener('click', () => game.resume());
  $('btn-restart').addEventListener('click', () => game.restartLevel());
  $('btn-menu').addEventListener('click', () => game.toMenu());
  $('btn-retry').addEventListener('click', () => game.restartLevel());
  $('btn-death-menu').addEventListener('click', () => game.toMenu());
  $('btn-win-menu').addEventListener('click', () => game.toMenu());
  game.onMenu = refreshMenu;
  refreshMenu();

  // Atalhos de depuração: ?nivel=N abre direto um nível.
  const q = new URLSearchParams(location.search).get('nivel');
  if (q !== null && LEVELS[Number(q)]) begin(Number(q));
  window.__game = game;
}

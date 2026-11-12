// Devaneio — ponto de entrada.
import { Game } from './game/game.js';

const params = Object.fromEntries(new URLSearchParams(location.search));
const canvas = document.getElementById('game');

async function boot() {
  let ui = null, audio = null;
  try {
    const A = await import('./game/audio.js');
    audio = new A.AudioEngine();
  } catch (e) {
    console.warn('áudio indisponível', e);
  }
  try {
    const U = await import('./ui/ui.js');
    ui = new U.UI();
  } catch (e) {
    console.warn('interface indisponível', e);
  }
  const game = new Game({ canvas, ui, audio, params });
  window.devaneio = game;
  if (ui) ui.attach(game);
  game.run();
  if (params.nivel) {
    const i = Math.max(0, Number(params.nivel) - 1);
    await game.loadLevel(i);
    if (params.shot) {
      const [x, y, z, yaw, pitch] = params.shot.split(',').map(Number);
      game.state = 'shot';
      game.player.frozen = true;
      game.player.pos.set(x, y - 1.62, z);
      game.player.yaw = (yaw * Math.PI) / 180;
      game.player.pitch = (pitch * Math.PI) / 180;
      game.player.bobEnabled = false;
      if (params.t) game.time = Number(params.t);
      game.player.apply(0);
    } else {
      game.state = 'play';
      game.input.enabled = true;
      if (ui) ui.showHud(true);
    }
    document.body.dataset.ready = '1';
    return;
  }
  await game.showTitle();
  document.body.dataset.ready = '1';
}

boot().catch((e) => {
  console.error(e);
  const el = document.getElementById('fatal');
  if (el) {
    el.hidden = false;
    el.textContent = 'Não foi possível iniciar o jogo: ' + (e && e.message ? e.message : e);
  }
});

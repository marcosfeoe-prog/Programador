'use strict';
// Inicialização e laço principal.

(function main() {
  R.canvas = $('game');
  R.ctx = R.canvas.getContext('2d');
  Mini.canvas = $('minimap');
  Mini.ctx = Mini.canvas.getContext('2d');
  Mini.canvas.width = Mini.canvas.height = Mini.size * 2;
  Mini.canvas.style.width = Mini.canvas.style.height = Mini.size + 'px';
  resize();
  window.addEventListener('resize', resize);

  newGame('', 'menu');
  G.cam.x = WORLD / 2 - 800; G.cam.y = WORLD / 2 - 400;
  buildMiniBase();
  setupInput(R.canvas);
  UI.init();

  const nameIn = $('name');
  try { nameIn.value = localStorage.getItem('hordas-name') || ''; } catch (e) { /* sem armazenamento */ }

  function start() {
    Sfx.init();
    const name = nameIn.value.trim().slice(0, 16) || 'Sobrevivente';
    try { localStorage.setItem('hordas-name', name); } catch (e) { /* sem armazenamento */ }
    newGame(name, 'play');
    buildMiniBase();
    $('menu').classList.add('hidden');
    $('gameover').classList.add('hidden');
    $('hud').classList.remove('hidden');
    UI.closeShop();
    UI.refresh();
    UI.toast('Colete madeira e pedra com a picareta e coloque seu Cofre de Ouro (tecla 1).');
  }
  $('play').addEventListener('click', start);
  nameIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') start(); });
  $('again').addEventListener('click', start);
  $('tomenu').addEventListener('click', () => {
    $('gameover').classList.add('hidden');
    $('menu').classList.remove('hidden');
    G.state = 'menu';
  });

  let last = performance.now();
  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    updateInput();
    update(dt);
    render();
    if (G.state !== 'menu') { renderMini(dt); UI.frame(dt); }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();

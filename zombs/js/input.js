'use strict';
// Teclado, mouse e toque.

const Input = {
  keys: new Set(), sx: 0, sy: 0, wx: 0, wy: 0, mouseDown: false, space: false,
  joy: { active: false, x: 0, y: 0, id: null, ox: 0, oy: 0 },
  aim: { id: null }, touchAim: false, autoAttack: false,
  down(code) { return this.keys.has(code); },
  attacking() {
    if (G.build) return false;
    return this.mouseDown || this.space || this.autoAttack || this.aim.id !== null;
  },
};

function ghostCell(type) {
  const s = BUILDINGS[type].size;
  return {
    cx: Math.floor((Input.wx - (s * CELL) / 2) / CELL + 0.5),
    cy: Math.floor((Input.wy - (s * CELL) / 2) / CELL + 0.5),
  };
}

function updateMouseWorld() {
  const w = screenToWorld(Input.sx, Input.sy);
  Input.wx = w.x; Input.wy = w.y;
}

let lastPlaced = '';
function tryPlaceAtCursor(fromDrag) {
  const { cx, cy } = ghostCell(G.build);
  const k = `${cx},${cy}`;
  if (fromDrag && k === lastPlaced) return;
  lastPlaced = k;
  const err = placeBuilding(G.build, cx, cy);
  if (err) {
    if (!fromDrag) { UI.toast(err, true); Sfx.play('error'); }
  } else if (G.build === 'stash') {
    G.build = null;
  }
  UI.refresh();
}

function setupInput(canvas) {
  window.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (G.state !== 'play') return;
    Input.keys.add(e.code);
    if (e.code === 'Space') { Input.space = true; e.preventDefault(); }
    const digit = e.code.startsWith('Digit') ? +e.code.slice(5) : -1;
    if (digit >= 0) {
      const idx = digit === 0 ? 9 : digit - 1;
      if (!G.stash) UI.selectBuild('stash');
      else if (TOOLBAR[idx]) UI.selectBuild(TOOLBAR[idx]);
    }
    switch (e.code) {
      case 'Escape': G.build = null; G.selected = null; UI.closeShop(); UI.refresh(); break;
      case 'KeyE': if (G.selected) { upgradeBuilding(G.selected); UI.refresh(); } break;
      case 'KeyT': if (G.selected && G.selected.type !== 'stash') { sellBuilding(G.selected); UI.refresh(); } break;
      case 'KeyB': UI.toggleShop(); break;
      case 'KeyQ': cycleWeapon(); UI.refresh(); break;
      case 'KeyF': { const err = usePotion(); if (err) UI.toast(err, true); UI.refresh(); break; }
      case 'KeyR': Input.autoAttack = !Input.autoAttack; UI.toast(Input.autoAttack ? 'Ataque automático LIGADO' : 'Ataque automático DESLIGADO'); break;
      case 'KeyM': UI.toast(Sfx.toggle() ? 'Som desligado' : 'Som ligado'); break;
    }
  });
  window.addEventListener('keyup', (e) => {
    Input.keys.delete(e.code);
    if (e.code === 'Space') Input.space = false;
  });
  window.addEventListener('blur', () => { Input.keys.clear(); Input.mouseDown = false; Input.space = false; });

  canvas.addEventListener('mousemove', (e) => { Input.sx = e.clientX; Input.sy = e.clientY; Input.touchAim = false; });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mousedown', (e) => {
    Sfx.init();
    if (G.state !== 'play') return;
    Input.sx = e.clientX; Input.sy = e.clientY; updateMouseWorld();
    if (e.button === 2) { G.build = null; G.selected = null; UI.refresh(); return; }
    if (e.button !== 0) return;
    if (G.build) { lastPlaced = ''; tryPlaceAtCursor(false); Input.mouseDown = true; return; }
    const b = buildingAtPoint(Input.wx, Input.wy);
    if (b) { G.selected = b; UI.refresh(); return; }
    if (G.selected) { G.selected = null; UI.refresh(); }
    Input.mouseDown = true;
  });
  window.addEventListener('mouseup', () => { Input.mouseDown = false; });

  // Toque: metade esquerda move (joystick), metade direita mira/ataca; toque curto constrói/seleciona.
  const touchStart = {};
  canvas.addEventListener('touchstart', (e) => {
    Sfx.init();
    if (G.state !== 'play') return;
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.clientX < R.w * 0.4 && Input.joy.id === null) {
        Object.assign(Input.joy, { id: t.identifier, ox: t.clientX, oy: t.clientY, active: true, x: 0, y: 0 });
        UI.showJoy(t.clientX, t.clientY, 0, 0);
      } else {
        touchStart[t.identifier] = { x: t.clientX, y: t.clientY, time: performance.now() };
        Input.sx = t.clientX; Input.sy = t.clientY; updateMouseWorld();
        if (!G.build && !buildingAtPoint(Input.wx, Input.wy)) {
          Input.aim.id = t.identifier;
          Input.touchAim = true;
          G.player.angle = Math.atan2(Input.wy - G.player.y, Input.wx - G.player.x);
        }
      }
    }
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) {
      if (t.identifier === Input.joy.id) {
        let dx = t.clientX - Input.joy.ox, dy = t.clientY - Input.joy.oy;
        const d = Math.hypot(dx, dy), m = 50;
        if (d > m) { dx = dx / d * m; dy = dy / d * m; }
        Input.joy.x = dx / m; Input.joy.y = dy / m;
        UI.showJoy(Input.joy.ox, Input.joy.oy, dx, dy);
      } else {
        Input.sx = t.clientX; Input.sy = t.clientY; updateMouseWorld();
        if (t.identifier === Input.aim.id) G.player.angle = Math.atan2(Input.wy - G.player.y, Input.wx - G.player.x);
      }
    }
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) {
      if (t.identifier === Input.joy.id) {
        Object.assign(Input.joy, { id: null, active: false, x: 0, y: 0 });
        UI.hideJoy();
        continue;
      }
      if (t.identifier === Input.aim.id) Input.aim.id = null;
      const s = touchStart[t.identifier];
      delete touchStart[t.identifier];
      if (s && performance.now() - s.time < 250 && Math.hypot(t.clientX - s.x, t.clientY - s.y) < 15 && G.state === 'play') {
        Input.sx = t.clientX; Input.sy = t.clientY; updateMouseWorld();
        if (G.build) { lastPlaced = ''; tryPlaceAtCursor(false); }
        else { const b = buildingAtPoint(Input.wx, Input.wy); G.selected = b || null; UI.refresh(); }
      }
    }
  };
  canvas.addEventListener('touchend', end);
  canvas.addEventListener('touchcancel', end);
}

function updateInput() {
  updateMouseWorld();
  if (G.build && Input.mouseDown && (G.build === 'wall' || G.build === 'slowtrap')) tryPlaceAtCursor(true);
}

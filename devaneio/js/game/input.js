// Entrada: teclado + mouse (pointer lock), toque (joystick virtual e arrastar para olhar)
// e controle (gamepad).

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.edges = new Set();
    this.lookX = 0;
    this.lookY = 0;
    this.move = { x: 0, y: 0 };
    this.touchMove = { x: 0, y: 0 };
    this.touchRun = false;
    this.touchJump = false;
    this.running = false;
    this.locked = false;
    this.enabled = false;
    this.isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    this.onUnlock = null;
    this.gamepad = false;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.edges.add(e.code);
      if (this.enabled && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked || !this.enabled) return;
      // ignora saltos absurdos de alguns navegadores ao travar o ponteiro
      if (Math.abs(e.movementX) > 400 || Math.abs(e.movementY) > 400) return;
      this.lookX += e.movementX;
      this.lookY += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (was && !this.locked && this.onUnlock) this.onUnlock();
    });
  }

  requestLock() {
    if (this.isTouch) return;
    try {
      const p = this.canvas.requestPointerLock && this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) {
        p.catch(() => {
          try {
            const p2 = this.canvas.requestPointerLock();
            if (p2 && p2.catch) p2.catch(() => {});
          } catch (e) {}
        });
      }
    } catch (e) {}
  }

  releaseLock() {
    try {
      if (document.pointerLockElement) document.exitPointerLock();
    } catch (e) {}
  }

  // olhar vindo do toque (pixels de arraste)
  addLook(dx, dy) {
    this.lookX += dx;
    this.lookY += dy;
  }

  consumeLook() {
    const r = { x: this.lookX, y: this.lookY };
    this.lookX = 0;
    this.lookY = 0;
    return r;
  }

  pressed(code) {
    return this.edges.has(code);
  }

  update(dt) {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    x += this.touchMove.x;
    y += this.touchMove.y;
    let run = k.has('ShiftLeft') || k.has('ShiftRight') || this.touchRun;
    let jump = this.edges.has('Space') || this.touchJump;
    this.touchJump = false;
    // controle
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const p of pads) {
      if (!p || !p.connected) continue;
      this.gamepad = true;
      const dz = (v) => (Math.abs(v) < 0.15 ? 0 : v);
      x += dz(p.axes[0] || 0);
      y -= dz(p.axes[1] || 0);
      this.lookX += dz(p.axes[2] || 0) * dt * 900;
      this.lookY += dz(p.axes[3] || 0) * dt * 700;
      if (p.buttons[10] && p.buttons[10].pressed) run = true;
      if (p.buttons[7] && p.buttons[7].value > 0.4) run = true;
      const a = p.buttons[0] && p.buttons[0].pressed;
      if (a && !this._padA) jump = true;
      this._padA = a;
      const st = p.buttons[9] && p.buttons[9].pressed;
      if (st && !this._padStart) this.edges.add('Pause');
      this._padStart = st;
      break;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    this.move.x = x;
    this.move.y = y;
    this.running = run;
    this.jump = jump;
  }

  endFrame() {
    this.edges.clear();
  }
}

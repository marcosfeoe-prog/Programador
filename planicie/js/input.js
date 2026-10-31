// Teclado, mouse (pointer lock) e controles de toque (joystick + arrastar para olhar).
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.look = { x: 0, y: 0 };
    this.move = { x: 0, y: 0 };
    this.touch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    this.locked = false;
    this.enabled = false;
    this.sens = 0.0022;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    canvas.addEventListener('click', () => {
      if (this.enabled && !this.touch && !this.locked) canvas.requestPointerLock?.();
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
    });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.look.x += e.movementX * this.sens;
      this.look.y += e.movementY * this.sens;
    });
    addEventListener('mousedown', (e) => {
      if (this.locked && e.button === 0) this.pressed.add('Mouse0');
    });
    this.setupTouch();
  }

  setupTouch() {
    const stick = document.getElementById('stick');
    const knob = document.getElementById('knob');
    if (!stick) return;
    let stickId = null, lookId = null, sx = 0, sy = 0, lx = 0, ly = 0;
    const R = 50;
    stick.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      stickId = t.identifier;
      const r = stick.getBoundingClientRect();
      sx = r.left + r.width / 2;
      sy = r.top + r.height / 2;
      e.preventDefault();
    }, { passive: false });
    addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          let dx = t.clientX - sx, dy = t.clientY - sy;
          const l = Math.hypot(dx, dy);
          if (l > R) { dx *= R / l; dy *= R / l; }
          this.move.x = dx / R;
          this.move.y = -dy / R;
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
        } else if (t.identifier === lookId) {
          this.look.x += (t.clientX - lx) * 0.005;
          this.look.y += (t.clientY - ly) * 0.005;
          lx = t.clientX;
          ly = t.clientY;
        }
      }
    }, { passive: true });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          stickId = null;
          this.move.x = this.move.y = 0;
          knob.style.transform = '';
        }
        if (t.identifier === lookId) lookId = null;
      }
    };
    addEventListener('touchend', end);
    addEventListener('touchcancel', end);
    this.canvas.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      if (t.clientX > innerWidth * 0.35 && lookId === null) {
        lookId = t.identifier;
        lx = t.clientX;
        ly = t.clientY;
      }
    }, { passive: true });
    for (const b of document.querySelectorAll('[data-key]')) {
      const code = b.dataset.key;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.keys.add(code);
        this.pressed.add(code);
        b.classList.add('on');
      }, { passive: false });
      b.addEventListener('touchend', () => {
        this.keys.delete(code);
        b.classList.remove('on');
      });
    }
  }

  axis() {
    let x = this.move.x, y = this.move.y;
    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
    return { x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) };
  }

  down(code) {
    return this.keys.has(code);
  }

  hit(code) {
    return this.pressed.has(code);
  }

  consumeLook() {
    const l = { x: this.look.x, y: this.look.y };
    this.look.x = this.look.y = 0;
    return l;
  }

  endFrame() {
    this.pressed.clear();
  }
}

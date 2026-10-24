// Entrada unificada: teclado + mouse (pointer lock) e controles de toque.

const KEYMAP = {
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyS: 'back',
  ArrowDown: 'back',
  KeyA: 'left',
  ArrowLeft: 'left',
  KeyD: 'right',
  ArrowRight: 'right',
  ShiftLeft: 'sprint',
  ShiftRight: 'sprint',
  ControlLeft: 'sneak',
  KeyE: 'interact',
  KeyQ: 'roar',
  KeyR: 'roar',
  KeyC: 'rest',
  KeyZ: 'sleep',
  Space: 'attack',
  KeyF: 'attack',
  KeyH: 'hud',
  KeyM: 'map',
  KeyG: 'fullscreen',
  Escape: 'menu',
  KeyP: 'menu',
};

export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.held = new Set();
    this.pressedSet = new Set();
    this.lookDX = 0;
    this.lookDY = 0;
    this.zoom = 0;
    this.joy = { x: 0, y: 0 };
    this.locked = false;
    this.enabled = false;
    this.touchSprint = false;

    window.addEventListener('keydown', (e) => {
      const a = KEYMAP[e.code];
      if (!a) return;
      if (a !== 'menu' && !this.enabled) return;
      if (!this.held.has(a)) this.pressedSet.add(a);
      this.held.add(a);
      if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'ControlLeft') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) this.held.delete(a);
    });
    window.addEventListener('blur', () => this.held.clear());
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked && this.enabled && !settings.mobile) this.pressedSet.add('unlock');
    });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled || settings.mobile) return;
      if (!this.locked) this.lock();
      else if (e.button === 0) this.pressedSet.add('attack');
      else if (e.button === 2) this.pressedSet.add('roar');
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
      this.lookDX += e.movementX;
      this.lookDY += e.movementY;
    });
    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.enabled) return;
        this.zoom += Math.sign(e.deltaY);
      },
      { passive: true },
    );
    this.setupTouch();
  }

  lock() {
    if (this.settings.mobile) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      /* sem pointer lock */
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  setupTouch() {
    const joyEl = document.getElementById('joy');
    const knob = document.getElementById('joy-knob');
    let joyId = null;
    let jx = 0;
    let jy = 0;
    const R = 55;
    const lookTouches = new Map();
    const pinch = { d: 0 };

    joyEl.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        const t = e.changedTouches[0];
        joyId = t.identifier;
        const r = joyEl.getBoundingClientRect();
        jx = r.left + r.width / 2;
        jy = r.top + r.height / 2;
        this.moveJoy(t.clientX - jx, t.clientY - jy, R, knob);
      },
      { passive: false },
    );
    const area = document.getElementById('look-area');
    area.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) lookTouches.set(t.identifier, { x: t.clientX, y: t.clientY });
        if (lookTouches.size === 2) {
          const [a, b] = [...lookTouches.values()];
          pinch.d = Math.hypot(a.x - b.x, a.y - b.y);
        }
      },
      { passive: false },
    );
    window.addEventListener(
      'touchmove',
      (e) => {
        for (const t of e.changedTouches) {
          if (t.identifier === joyId) {
            this.moveJoy(t.clientX - jx, t.clientY - jy, R, knob);
          } else if (lookTouches.has(t.identifier)) {
            const p = lookTouches.get(t.identifier);
            if (lookTouches.size === 1) {
              this.lookDX += (t.clientX - p.x) * 1.6;
              this.lookDY += (t.clientY - p.y) * 1.6;
            }
            p.x = t.clientX;
            p.y = t.clientY;
            if (lookTouches.size === 2) {
              const [a, b] = [...lookTouches.values()];
              const d = Math.hypot(a.x - b.x, a.y - b.y);
              this.zoom -= (d - pinch.d) * 0.03;
              pinch.d = d;
            }
          }
        }
      },
      { passive: false },
    );
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === joyId) {
          joyId = null;
          this.joy.x = 0;
          this.joy.y = 0;
          knob.style.transform = 'translate(-50%, -50%)';
        }
        lookTouches.delete(t.identifier);
      }
    };
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);

    document.querySelectorAll('[data-act]').forEach((btn) => {
      const act = btn.dataset.act;
      btn.addEventListener(
        'touchstart',
        (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (act === 'sprint') {
            this.touchSprint = !this.touchSprint;
            btn.classList.toggle('on', this.touchSprint);
          } else {
            this.pressedSet.add(act);
          }
        },
        { passive: false },
      );
      btn.addEventListener('click', () => {
        if (this.settings.mobile) return;
        this.pressedSet.add(act);
      });
    });
  }

  moveJoy(dx, dy, R, knob) {
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    this.joy.x = dx / R;
    this.joy.y = -dy / R;
    knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  pressed(a) {
    return this.pressedSet.has(a);
  }
  down(a) {
    return this.held.has(a);
  }

  // vetor de movimento: x = direita, y = frente
  move() {
    let x = this.joy.x;
    let y = this.joy.y;
    if (this.down('forward')) y += 1;
    if (this.down('back')) y -= 1;
    if (this.down('right')) x += 1;
    if (this.down('left')) x -= 1;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    return { x, y };
  }

  sprinting() {
    return this.down('sprint') || this.touchSprint;
  }

  endFrame() {
    this.pressedSet.clear();
    this.lookDX = 0;
    this.lookDY = 0;
    this.zoom = 0;
  }
}

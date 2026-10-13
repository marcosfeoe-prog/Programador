// Entrada unificada: teclado + mouse (pointer lock) e controles de toque (mobile).

const KEYMAP = {
  KeyW: 'forward', ArrowUp: 'forward',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
  Space: 'jump',
  ShiftLeft: 'sprint', ShiftRight: 'sprint',
  KeyE: 'interact',
  KeyC: 'camera',
  KeyR: 'radar',
  KeyM: 'radarSize',
  KeyI: 'info',
  KeyH: 'hud',
  KeyN: 'skip',
  KeyT: 'forceStorm',
  KeyF: 'fullscreen',
  KeyQ: 'down', ControlLeft: 'down',
  Escape: 'menu', KeyP: 'menu',
  BracketRight: 'faster', Equal: 'faster', NumpadAdd: 'faster',
  BracketLeft: 'slower', Minus: 'slower', NumpadSubtract: 'slower',
  KeyL: 'log',
};

export class Input {
  constructor(canvas, settings) {
    this.canvas = canvas;
    this.settings = settings;
    this.held = new Set();
    this.pressedSet = new Set();
    this.lookDX = 0;
    this.lookDY = 0;
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
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    });
    window.addEventListener('keyup', (e) => {
      const a = KEYMAP[e.code];
      if (a) this.held.delete(a);
    });
    window.addEventListener('blur', () => this.held.clear());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked && this.enabled && !settings.mobile) this.pressedSet.add('unlock');
    });
    canvas.addEventListener('mousedown', () => {
      if (this.enabled && !settings.mobile && !this.locked) this.lock();
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.lookDX += e.movementX;
      this.lookDY += e.movementY;
    });
    if (settings.mobile) this.setupTouch();
  }

  lock() {
    if (this.settings.mobile) return;
    try {
      const p = this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch (e) {
      /* ignorado */
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isHeld(a) {
    return this.held.has(a);
  }

  pressed(a) {
    if (this.pressedSet.has(a)) {
      this.pressedSet.delete(a);
      return true;
    }
    return false;
  }

  get moveX() {
    let x = this.joy.x;
    if (this.held.has('right')) x += 1;
    if (this.held.has('left')) x -= 1;
    return Math.max(-1, Math.min(1, x));
  }

  get moveY() {
    let y = this.joy.y;
    if (this.held.has('forward')) y += 1;
    if (this.held.has('back')) y -= 1;
    return Math.max(-1, Math.min(1, y));
  }

  get sprint() {
    return this.held.has('sprint') || this.touchSprint;
  }

  consumeLook() {
    const s = this.settings.sensitivity;
    const k = this.settings.mobile ? 0.0045 : 0.0022;
    const d = { x: this.lookDX * k * s, y: this.lookDY * k * s * (this.settings.invertY ? -1 : 1) };
    this.lookDX = 0;
    this.lookDY = 0;
    return d;
  }

  endFrame() {
    this.pressedSet.clear();
  }

  // ------------------------------------------------------------ toque
  setupTouch() {
    const root = document.getElementById('touch');
    root.classList.add('on');
    const joyZone = root.querySelector('.joy-zone');
    const joyBase = root.querySelector('.joy-base');
    const joyKnob = root.querySelector('.joy-knob');
    const lookZone = root.querySelector('.look-zone');
    let joyId = null;
    let jx0 = 0;
    let jy0 = 0;
    const R = 56;
    joyZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      const t = e.changedTouches[0];
      joyId = t.identifier;
      jx0 = t.clientX;
      jy0 = t.clientY;
      joyBase.style.left = jx0 - 60 + 'px';
      joyBase.style.top = jy0 - 60 + 'px';
      joyBase.classList.add('on');
      joyKnob.style.transform = 'translate(0px,0px)';
    }, { passive: false });
    const joyMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== joyId) continue;
        e.preventDefault();
        let dx = t.clientX - jx0;
        let dy = t.clientY - jy0;
        const l = Math.hypot(dx, dy);
        if (l > R) {
          dx *= R / l;
          dy *= R / l;
        }
        this.joy.x = dx / R;
        this.joy.y = -dy / R;
        joyKnob.style.transform = `translate(${dx}px,${dy}px)`;
      }
    };
    const joyEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== joyId) continue;
        joyId = null;
        this.joy.x = this.joy.y = 0;
        joyBase.classList.remove('on');
      }
    };
    joyZone.addEventListener('touchmove', joyMove, { passive: false });
    joyZone.addEventListener('touchend', joyEnd);
    joyZone.addEventListener('touchcancel', joyEnd);

    const looks = new Map();
    lookZone.addEventListener('touchstart', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) looks.set(t.identifier, { x: t.clientX, y: t.clientY });
    }, { passive: false });
    lookZone.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        const p = looks.get(t.identifier);
        if (!p) continue;
        this.lookDX += (t.clientX - p.x) * 1.6;
        this.lookDY += (t.clientY - p.y) * 1.6;
        p.x = t.clientX;
        p.y = t.clientY;
      }
    }, { passive: false });
    const lookEnd = (e) => {
      for (const t of e.changedTouches) looks.delete(t.identifier);
    };
    lookZone.addEventListener('touchend', lookEnd);
    lookZone.addEventListener('touchcancel', lookEnd);

    for (const btn of root.querySelectorAll('[data-act]')) {
      const a = btn.dataset.act;
      btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (a === 'sprint') {
          this.touchSprint = !this.touchSprint;
          btn.classList.toggle('active', this.touchSprint);
          return;
        }
        this.pressedSet.add(a);
        this.held.add(a);
        btn.classList.add('active');
      }, { passive: false });
      const up = (e) => {
        e.preventDefault();
        if (a === 'sprint') return;
        this.held.delete(a);
        btn.classList.remove('active');
      };
      btn.addEventListener('touchend', up, { passive: false });
      btn.addEventListener('touchcancel', up, { passive: false });
    }
  }
}

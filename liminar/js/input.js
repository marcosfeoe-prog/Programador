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
  KeyE: 'interact',
  Space: 'interact',
  KeyF: 'flashlight',
  KeyV: 'filter',
  KeyH: 'hud',
  KeyN: 'nav',
  KeyQ: 'leanL',
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
      if (e.code === 'Space' || e.code.startsWith('Arrow') || e.code === 'Tab') e.preventDefault();
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
    canvas.addEventListener('mousedown', () => {
      if (this.enabled && !settings.mobile && !this.locked) this.lock();
    });
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      // ignora saltos gigantes (bug de alguns navegadores ao travar o mouse)
      if (Math.abs(e.movementX) > 300 || Math.abs(e.movementY) > 300) return;
      this.lookDX += e.movementX;
      this.lookDY += e.movementY;
    });
    this.setupTouch();
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
    return this.held.has('sprint') || this.touchSprint || Math.hypot(this.joy.x, this.joy.y) > 1.15;
  }

  consumeLook() {
    const s = this.settings.sensitivity;
    const k = this.settings.mobile ? 0.0042 : 0.0021;
    const d = { x: this.lookDX * k * s, y: this.lookDY * k * s * (this.settings.invertY ? -1 : 1) };
    this.lookDX = 0;
    this.lookDY = 0;
    return d;
  }

  endFrame() {
    this.pressedSet.clear();
  }

  reset() {
    this.held.clear();
    this.pressedSet.clear();
    this.joy.x = this.joy.y = 0;
    this.lookDX = this.lookDY = 0;
  }

  // ------------------------------------------------------------ toque
  setupTouch() {
    const root = document.getElementById('touch');
    if (this.settings.mobile) root.classList.add('on');
    const joyZone = root.querySelector('.joy-zone');
    const joyBase = root.querySelector('.joy-base');
    const joyKnob = root.querySelector('.joy-knob');
    const lookZone = root.querySelector('.look-zone');
    joyBase.classList.add('idle');
    let joyId = null;
    let jx0 = 0;
    let jy0 = 0;
    const R = 58;
    joyZone.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        if (joyId !== null) return;
        const t = e.changedTouches[0];
        joyId = t.identifier;
        jx0 = t.clientX;
        jy0 = t.clientY;
        joyBase.classList.remove('idle');
        joyBase.style.left = jx0 - 64 + 'px';
        joyBase.style.top = jy0 - 64 + 'px';
        joyBase.style.bottom = 'auto';
        joyBase.classList.add('on');
        joyKnob.style.transform = 'translate(0px,0px)';
      },
      { passive: false },
    );
    const joyMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== joyId) continue;
        e.preventDefault();
        let dx = t.clientX - jx0;
        let dy = t.clientY - jy0;
        const l = Math.hypot(dx, dy);
        // empurrar além da borda = correr
        const over = l > R * 1.35 ? 1.2 : 1;
        if (l > R) {
          dx *= R / l;
          dy *= R / l;
        }
        this.joy.x = (dx / R) * over;
        this.joy.y = (-dy / R) * over;
        joyKnob.style.transform = `translate(${dx}px,${dy}px)`;
        joyBase.classList.toggle('run', over > 1);
      }
    };
    const joyEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== joyId) continue;
        joyId = null;
        this.joy.x = this.joy.y = 0;
        joyBase.classList.remove('on', 'run');
        joyBase.style.left = joyBase.style.top = joyBase.style.bottom = '';
        joyKnob.style.transform = 'translate(0px,0px)';
        joyBase.classList.add('idle');
      }
    };
    joyZone.addEventListener('touchmove', joyMove, { passive: false });
    joyZone.addEventListener('touchend', joyEnd);
    joyZone.addEventListener('touchcancel', joyEnd);

    const looks = new Map();
    lookZone.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) looks.set(t.identifier, { x: t.clientX, y: t.clientY });
      },
      { passive: false },
    );
    lookZone.addEventListener(
      'touchmove',
      (e) => {
        e.preventDefault();
        for (const t of e.changedTouches) {
          const p = looks.get(t.identifier);
          if (!p) continue;
          this.lookDX += (t.clientX - p.x) * 1.5;
          this.lookDY += (t.clientY - p.y) * 1.5;
          p.x = t.clientX;
          p.y = t.clientY;
        }
      },
      { passive: false },
    );
    const lookEnd = (e) => {
      for (const t of e.changedTouches) looks.delete(t.identifier);
    };
    lookZone.addEventListener('touchend', lookEnd);
    lookZone.addEventListener('touchcancel', lookEnd);

    for (const btn of root.querySelectorAll('[data-act]')) {
      const a = btn.dataset.act;
      const down = (e) => {
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
      };
      const up = (e) => {
        e.preventDefault();
        if (a === 'sprint') return;
        this.held.delete(a);
        btn.classList.remove('active');
      };
      btn.addEventListener('touchstart', down, { passive: false });
      btn.addEventListener('touchend', up, { passive: false });
      btn.addEventListener('touchcancel', up, { passive: false });
      // também funciona com mouse (útil para testar no PC)
      btn.addEventListener('mousedown', down);
      btn.addEventListener('mouseup', up);
    }
  }
}

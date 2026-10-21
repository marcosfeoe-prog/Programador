// Teclado, mouse (com pointer lock ou arrastando) e controles de toque.

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.lookX = 0;
    this.lookY = 0;
    this.sens = 1;
    this.pressed = new Set();
    this.locked = false;
    this.dragging = false;
    this.enabled = false;
    this.touch = { mx: 0, my: 0, run: false, crouch: false };
    this.onPause = null;

    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const map = { KeyE: 'use', KeyF: 'light', KeyQ: 'drink', KeyC: 'crouchToggle' };
      if (map[e.code]) this.pressed.add(map[e.code]);
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (!this.locked && this.enabled && this.onPause) this.onPause();
      }
      if (['Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());

    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked && this.enabled && this.onPause) this.onPause();
    });

    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked) {
        this.requestLock();
        this.dragging = true;
      }
      if (e.button === 0 && this.locked) this.pressed.add('use');
    });
    addEventListener('mouseup', () => (this.dragging = false));
    addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (this.locked || this.dragging) {
        this.lookX += e.movementX || 0;
        this.lookY += e.movementY || 0;
      }
    });

    this.setupTouch();
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock && this.canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => {});
    } catch {
      /* sem pointer lock (iframe restrito): arrastar o mouse continua funcionando */
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  setupTouch() {
    const stickZone = document.getElementById('t-stick-zone');
    const knob = document.getElementById('t-knob');
    const base = document.getElementById('t-base');
    if (!stickZone) return;
    let stickId = null;
    let sx = 0;
    let sy = 0;
    const R = 55;
    stickZone.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      stickId = t.identifier;
      sx = t.clientX;
      sy = t.clientY;
      base.style.left = `${sx}px`;
      base.style.top = `${sy}px`;
      base.classList.add('on');
      knob.style.transform = 'translate(-50%,-50%)';
      e.preventDefault();
    }, { passive: false });
    stickZone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== stickId) continue;
        let dx = t.clientX - sx;
        let dy = t.clientY - sy;
        const d = Math.hypot(dx, dy);
        if (d > R) {
          dx = (dx / d) * R;
          dy = (dy / d) * R;
        }
        this.touch.mx = dx / R;
        this.touch.my = -dy / R;
        this.touch.run = d > R * 1.25;
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      }
      e.preventDefault();
    }, { passive: false });
    const endStick = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== stickId) continue;
        stickId = null;
        this.touch.mx = this.touch.my = 0;
        this.touch.run = false;
        base.classList.remove('on');
      }
    };
    stickZone.addEventListener('touchend', endStick);
    stickZone.addEventListener('touchcancel', endStick);

    const lookZone = document.getElementById('t-look-zone');
    let lookId = null;
    let lx = 0;
    let ly = 0;
    lookZone.addEventListener('touchstart', (e) => {
      const t = e.changedTouches[0];
      lookId = t.identifier;
      lx = t.clientX;
      ly = t.clientY;
      e.preventDefault();
    }, { passive: false });
    lookZone.addEventListener('touchmove', (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier !== lookId) continue;
        this.lookX += (t.clientX - lx) * 1.6;
        this.lookY += (t.clientY - ly) * 1.6;
        lx = t.clientX;
        ly = t.clientY;
      }
      e.preventDefault();
    }, { passive: false });
    lookZone.addEventListener('touchend', () => (lookId = null));

    const btn = (id, fn) => {
      const el = document.getElementById(id);
      el.addEventListener('touchstart', (e) => {
        fn(true);
        el.classList.add('down');
        e.preventDefault();
        e.stopPropagation();
      }, { passive: false });
      el.addEventListener('touchend', (e) => {
        fn(false);
        el.classList.remove('down');
        e.preventDefault();
      }, { passive: false });
    };
    btn('t-run', (d) => (this.touch.runBtn = d));
    btn('t-crouch', (d) => d && this.pressed.add('crouchToggle'));
    btn('t-use', (d) => {
      if (d) this.pressed.add('use');
      this.touch.useHeld = d;
    });
    btn('t-light', (d) => d && this.pressed.add('light'));
    btn('t-drink', (d) => d && this.pressed.add('drink'));
    btn('t-pause', (d) => d && this.onPause && this.onPause());
  }

  // Vetor de movimento (x = lateral, y = frente) normalizado.
  get move() {
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    x += this.touch.mx;
    y += this.touch.my;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    return { x, y };
  }

  get run() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.touch.run || this.touch.runBtn;
  }

  get crouchHeld() {
    return this.keys.has('ControlLeft');
  }

  get useHeld() {
    return this.keys.has('KeyE') || this.touch.useHeld || false;
  }

  consume(name) {
    if (this.pressed.has(name)) {
      this.pressed.delete(name);
      return true;
    }
    return false;
  }

  takeLook() {
    const r = [this.lookX * this.sens, this.lookY * this.sens];
    this.lookX = this.lookY = 0;
    return r;
  }

  reset() {
    this.pressed.clear();
    this.lookX = this.lookY = 0;
  }
}

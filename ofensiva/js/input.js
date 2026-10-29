// Entrada: teclado + mouse (pointer lock) no PC e controles de toque no celular
// (analógico virtual, arrastar para mirar e botões de ação).

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.down = new Set();
    this.pressed = new Set();
    this.mdx = 0;
    this.mdy = 0;
    this.wheel = 0;
    this.locked = false;
    this.enabled = false;
    this.touch = false;
    this.moveX = 0; // analógico virtual
    this.moveY = 0;

    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      if (e.ctrlKey && e.code === 'KeyW') e.preventDefault();
      if (!this.down.has(e.code)) this.pressed.add(e.code);
      this.down.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => this.down.clear());
    canvas.addEventListener('mousedown', (e) => {
      if (this.touch) return;
      const code = 'Mouse' + e.button;
      if (!this.down.has(code)) this.pressed.add(code);
      this.down.add(code);
    });
    addEventListener('mouseup', (e) => this.down.delete('Mouse' + e.button));
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mdx += e.movementX;
      this.mdy += e.movementY;
    });
    addEventListener('wheel', (e) => {
      if (this.locked) this.wheel += Math.sign(e.deltaY);
    }, { passive: true });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === canvas;
      if (!this.locked) this.down.clear();
      this.onLockChange?.(this.locked);
    });
  }

  lock() {
    if (this.touch) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => this.canvas.requestPointerLock());
    } catch {
      this.canvas.requestPointerLock();
    }
  }

  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code) {
    return this.down.has(code);
  }

  wasPressed(code) {
    return this.pressed.has(code);
  }

  // Consome movimento do mouse/toque acumulado no quadro.
  takeMouse() {
    const r = [this.mdx, this.mdy];
    this.mdx = this.mdy = 0;
    return r;
  }

  endFrame() {
    this.pressed.clear();
    this.wheel = 0;
  }

  // ------------------------------------------------------------ toque
  setupTouch(root) {
    this.touch = true;
    root.classList.remove('hidden');
    const stick = root.querySelector('#t-stick');
    const knob = root.querySelector('#t-knob');
    let stickId = null;
    let sx = 0;
    let sy = 0;
    let lookId = null;
    let lx = 0;
    let ly = 0;
    const R = 55;

    const onStart = (e) => {
      for (const t of e.changedTouches) {
        const el = t.target;
        if (el.dataset && el.dataset.key) continue;
        if (t.clientX < innerWidth * 0.4 && stickId === null) {
          stickId = t.identifier;
          sx = t.clientX;
          sy = t.clientY;
          stick.style.left = sx - 65 + 'px';
          stick.style.top = sy - 65 + 'px';
          stick.classList.add('on');
        } else if (lookId === null) {
          lookId = t.identifier;
          lx = t.clientX;
          ly = t.clientY;
        }
      }
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          let dx = t.clientX - sx;
          let dy = t.clientY - sy;
          const d = Math.hypot(dx, dy);
          if (d > R) {
            dx = (dx / d) * R;
            dy = (dy / d) * R;
          }
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
          this.moveX = dx / R;
          this.moveY = -dy / R;
        } else if (t.identifier === lookId) {
          this.mdx += (t.clientX - lx) * 1.6;
          this.mdy += (t.clientY - ly) * 1.6;
          lx = t.clientX;
          ly = t.clientY;
        }
      }
      e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === stickId) {
          stickId = null;
          this.moveX = this.moveY = 0;
          knob.style.transform = '';
          stick.classList.remove('on');
        } else if (t.identifier === lookId) lookId = null;
      }
    };
    const zone = root.querySelector('#t-zone');
    zone.addEventListener('touchstart', onStart, { passive: false });
    zone.addEventListener('touchmove', onMove, { passive: false });
    zone.addEventListener('touchend', onEnd);
    zone.addEventListener('touchcancel', onEnd);

    // botões: mantêm o código de tecla pressionado; o de tiro também mira
    for (const b of root.querySelectorAll('[data-key]')) {
      const code = b.dataset.key;
      let id = null;
      let bx = 0;
      let by = 0;
      b.addEventListener('touchstart', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const t = e.changedTouches[0];
        id = t.identifier;
        bx = t.clientX;
        by = t.clientY;
        if (b.dataset.toggle) {
          if (this.down.has(code)) this.down.delete(code);
          else {
            this.down.add(code);
            this.pressed.add(code);
          }
          b.classList.toggle('on', this.down.has(code));
          return;
        }
        if (!this.down.has(code)) this.pressed.add(code);
        this.down.add(code);
        b.classList.add('on');
      }, { passive: false });
      b.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!b.dataset.aim) return;
        for (const t of e.changedTouches) {
          if (t.identifier !== id) continue;
          this.mdx += (t.clientX - bx) * 1.6;
          this.mdy += (t.clientY - by) * 1.6;
          bx = t.clientX;
          by = t.clientY;
        }
      }, { passive: false });
      const up = (e) => {
        e.preventDefault();
        if (b.dataset.toggle) return;
        this.down.delete(code);
        b.classList.remove('on');
      };
      b.addEventListener('touchend', up);
      b.addEventListener('touchcancel', up);
    }
  }
}

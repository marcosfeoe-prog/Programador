// Entrada: teclado, mouse com trava de ponteiro e controles de toque.
import { isTouch } from './util.js';

const ACTIONS = {
  KeyE: 'use',
  KeyF: 'flash',
  KeyR: 'shake',
  Space: 'jump',
  KeyC: 'crouch',
  ControlLeft: 'crouch',
  Escape: 'pause',
  KeyP: 'pause',
  KeyH: 'hud',
  KeyG: 'fs',
  Enter: 'enter',
  Backspace: 'back',
};

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();
    this.lx = 0;
    this.ly = 0;
    this.touch = isTouch();
    this.joy = { x: 0, y: 0, id: null, ox: 0, oy: 0 };
    this.look = { id: null, x: 0, y: 0 };
    this.locked = false;
    this.onUnlock = null;
    this.typed = [];
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      const a = ACTIONS[e.code];
      if (a) this.pressed.add(a);
      if (/^(Digit|Numpad)\d$/.test(e.code)) this.typed.push(e.code.slice(-1));
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.lx += e.movementX;
      this.ly += e.movementY;
    });
    addEventListener('mousedown', (e) => {
      if (this.locked && e.button === 0) this.pressed.add('use');
      if (this.locked && e.button === 2) this.pressed.add('flash');
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === canvas;
      if (was && !this.locked && this.onUnlock) this.onUnlock();
    });
    if (this.touch) this.setupTouch();
  }

  lock() {
    if (this.touch || this.locked) return;
    try {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => this.canvas.requestPointerLock());
    } catch (e) {
      this.canvas.requestPointerLock();
    }
  }
  unlock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  setupTouch() {
    const root = document.getElementById('touch');
    const joyEl = document.getElementById('joy');
    const knob = document.getElementById('joy-knob');
    const R = 62;
    const onStart = (e) => {
      for (const t of e.changedTouches) {
        const tgt = t.target;
        if (tgt.dataset && tgt.dataset.act) {
          this.pressed.add(tgt.dataset.act);
          tgt.classList.add('down');
          if (tgt.dataset.hold) this.keys.add('touch:' + tgt.dataset.act);
          continue;
        }
        if (t.clientX < innerWidth * 0.42 && this.joy.id === null) {
          this.joy.id = t.identifier;
          this.joy.ox = t.clientX;
          this.joy.oy = t.clientY;
          joyEl.style.left = t.clientX - 70 + 'px';
          joyEl.style.top = t.clientY - 70 + 'px';
          joyEl.classList.add('on');
        } else if (this.look.id === null) {
          this.look.id = t.identifier;
          this.look.x = t.clientX;
          this.look.y = t.clientY;
        }
      }
      e.preventDefault();
    };
    const onMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joy.id) {
          let dx = t.clientX - this.joy.ox, dy = t.clientY - this.joy.oy;
          const l = Math.hypot(dx, dy);
          if (l > R) {
            dx *= R / l;
            dy *= R / l;
          }
          this.joy.x = dx / R;
          this.joy.y = -dy / R;
          knob.style.transform = `translate(${dx}px, ${dy}px)`;
        } else if (t.identifier === this.look.id) {
          this.lx += (t.clientX - this.look.x) * 2.2;
          this.ly += (t.clientY - this.look.y) * 2.2;
          this.look.x = t.clientX;
          this.look.y = t.clientY;
        }
      }
      e.preventDefault();
    };
    const onEnd = (e) => {
      for (const t of e.changedTouches) {
        const tgt = t.target;
        if (tgt.dataset && tgt.dataset.act) {
          tgt.classList.remove('down');
          this.keys.delete('touch:' + tgt.dataset.act);
        }
        if (t.identifier === this.joy.id) {
          this.joy.id = null;
          this.joy.x = this.joy.y = 0;
          knob.style.transform = '';
          joyEl.classList.remove('on');
        }
        if (t.identifier === this.look.id) this.look.id = null;
      }
    };
    root.addEventListener('touchstart', onStart, { passive: false });
    root.addEventListener('touchmove', onMove, { passive: false });
    root.addEventListener('touchend', onEnd);
    root.addEventListener('touchcancel', onEnd);
  }

  // vetor de movimento (x direita, y frente)
  move() {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    x += this.joy.x;
    y += this.joy.y;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    return { x, y };
  }
  sprint() {
    return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || this.keys.has('touch:sprint') || Math.hypot(this.joy.x, this.joy.y) > 0.93;
  }
  takeLook() {
    const r = { dx: this.lx, dy: this.ly };
    this.lx = this.ly = 0;
    return r;
  }
  take(a) {
    if (this.pressed.has(a)) {
      this.pressed.delete(a);
      return true;
    }
    return false;
  }
  takeTyped() {
    const t = this.typed;
    this.typed = [];
    return t;
  }
  clear() {
    this.pressed.clear();
    this.typed = [];
    this.lx = this.ly = 0;
  }
}
